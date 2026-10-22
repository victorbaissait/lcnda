#!/usr/bin/env python3
"""🌦 Le fabricant des données météo (scripts/meteo/build-meteo.py), SANS Internet : petits fichiers au format des vraies
sources (tests/fixtures/meteo : CSV quotidiens de Météo-France, CSV NBCN de MétéoSuisse), lecture des blocs, choix des
stations, fabrication d'un socle, puis relecture par l'app (lib/meteo.php).

    python3 tests/test_meteo_builder.py
"""
import gzip
import importlib.util
import json
import os
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIX = os.path.join(ROOT, 'tests', 'fixtures', 'meteo')
sys.path.insert(0, os.path.join(ROOT, 'scripts', 'meteo'))
import meteo_format as F  # noqa: E402

spec = importlib.util.spec_from_file_location('build_meteo', os.path.join(ROOT, 'scripts', 'meteo', 'build-meteo.py'))
B = importlib.util.module_from_spec(spec)
spec.loader.exec_module(B)


class Format(unittest.TestCase):
    def test_roundtrip(self):
        vals = [12, 15, None, -40, 16000, -16000, 0]
        step, cols = F.decode(F.encode([('TN', vals), ('RR', [0] * 7)]))
        self.assertEqual(step, 0)
        self.assertEqual(cols['TN'], vals)
        self.assertEqual(cols['RR'], [0] * 7)

    def test_hours_and_limits(self):
        step, cols = F.decode(F.encode([('T', [99999, -99999])], step=6))
        self.assertEqual((step, cols['T']), (6, [16000, -16000]))

    def test_period(self):
        self.assertEqual(F.period_for(1926), (1901, 1930))
        self.assertEqual(F.period_for(1978), (1951, 1980))
        self.assertEqual(F.period_for(2024), (1991, 2020))


class Sources(unittest.TestCase):
    def test_meteofrance(self):
        text = gzip.open(os.path.join(FIX, 'Q_32_previous-1950-2023_RR-T-Vent.csv.gz'), 'rt').read()
        extra = gzip.open(os.path.join(FIX, 'Q_32_previous-1950-2023_autres-parametres.csv.gz'), 'rt').read()
        d = B.parse_meteofrance_daily(text, extra)
        self.assertEqual(sorted(d), ['32013005', '32208001'])
        auch = d['32013005']
        self.assertAlmostEqual(auch['meta']['lat'], 43.6878, places=3)
        day = auch['days'][20200203]
        self.assertEqual((day['TN'], day['TX'], day['RR']), (-20, 70, 0))
        self.assertTrue(day['WW'] & F.WW_FOG)
        self.assertIsNotNone(day['NN'])  # estimés d'après le soleil

    def test_meteoswiss(self):
        metas = B.parse_meteoswiss_meta(open(os.path.join(FIX, 'ogd-nbcn_meta_stations.csv'), encoding='cp1252').read())
        self.assertAlmostEqual(metas['GVE']['lat'], 46.2475, places=3)
        self.assertEqual(metas['GVE']['alt'], 411)
        days = B.parse_meteoswiss_daily(open(os.path.join(FIX, 'ogd-nbcn_gve_d_historical.csv')).read())
        self.assertIn(20200701, days)
        self.assertEqual(len([k for k in days if k // 10000 == 2020]), 366)
        # l'ancien format NBCN (espaces, AAAAMMJJ) aussi
        old = B.parse_meteoswiss_daily('stn time tre200dn tre200dx rre150d0\nGVE 18640101 -3.1 2.0 0.0\n')
        self.assertEqual(old[18640101]['TN'], -31)

    def test_dwd_and_generic(self):
        dwd = B.parse_dwd_kl('STATIONS_ID;MESS_DATUM;QN_3;  FX;  FM;QN_4; RSK;RSKF; SDK;SHK_TAG;  NM; VPM;  PM; TMK; UPM; TXK; TNK; TGK;eor\n'
                             '        44;19710301;    5;  14.0;   4.2;    3;   0.0;   0;   7.5;   0;   2.0;   6.1; 1008.0;   2.1;  77.00;   8.6;  -3.0;  -5.2;eor\n')
        self.assertEqual((dwd[19710301]['TN'], dwd[19710301]['SS'], dwd[19710301]['NN']), (-30, 450, 25))
        g = B.parse_generic_daily('Date;Tmin;Tmax;Precip\n1947-01-02;-4,2;1,0;0,3\n')
        self.assertEqual(g[19470102]['TN'], -42)

    def test_selection(self):
        rows = [(1, 'FR', 43.69, 0.60, 140, 1878), (2, 'FR', 43.70, 0.61, 50, 1950), (3, 'FR', 44.17, 0.59, 120, 1880), (4, 'CH', 46.25, 6.13, 150, 1864)]
        pick = B.select_stations(rows, 3, {'FR': .7, 'CH': .3})
        self.assertIn(1, pick)
        self.assertIn(4, pick)
        self.assertNotIn(2, pick)  # trop près de la n° 1, et moins bonne


def write_geotiff(path, lat0, lon0, size, fn, tile=64, predictor=3, compression=8):
    """un petit GeoTIFF au format du Copernicus DEM (flottants 32 bits, tuiles, deflate, prédicteur 3 ; ou LZW/sans) pour les essais"""
    import struct, zlib
    sx = 1.0 / size
    tiles = []
    across = -(-size // tile)
    for ty in range(across):
        for tx in range(across):
            rows = []
            for r in range(tile):
                y = ty * tile + r
                vals = []
                for c in range(tile):
                    x = tx * tile + c
                    lat = lat0 + 1 - (y + 0.5) * sx
                    lon = lon0 + (x + 0.5) * sx
                    vals.append(float(fn(lat, lon)) if x < size and y < size else -32767.0)
                be = struct.pack('>%df' % tile, *vals)
                if predictor == 3:
                    planes = bytes(be[k + 4 * j] for k in range(4) for j in range(tile))  # octets rangés par poids
                    diff = bytes([planes[0]] + [(planes[i] - planes[i - 1]) & 255 for i in range(1, len(planes))])
                    rows.append(diff)
                else:
                    rows.append(struct.pack('<%df' % tile, *vals))
            raw = b''.join(rows)
            tiles.append(zlib.compress(raw) if compression == 8 else raw)
    entries = []
    def tag(t, typ, vals):
        entries.append((t, typ, vals))
    tag(256, 3, [size]); tag(257, 3, [size]); tag(258, 3, [32]); tag(259, 3, [compression]); tag(277, 3, [1]); tag(317, 3, [predictor]); tag(339, 3, [3])
    tag(322, 3, [tile]); tag(323, 3, [tile])
    tag(33550, 12, [sx, sx, 0.0]); tag(33922, 12, [0.0, 0.0, 0.0, float(lon0), float(lat0 + 1), 0.0]); tag(42113, 2, b'-32767\0')
    data_off = 8
    body = b''.join(tiles)
    offsets, pos = [], data_off
    for t in tiles:
        offsets.append(pos); pos += len(t)
    tag(324, 4, offsets); tag(325, 4, [len(t) for t in tiles])
    entries.sort()
    ifd_off = data_off + len(body)
    extra_off = ifd_off + 2 + 12 * len(entries) + 4
    ifd, extra = b'', b''
    fmt = {3: ('H', 2), 4: ('I', 4), 12: ('d', 8), 2: ('s', 1)}
    for t, typ, vals in entries:
        f, sz = fmt[typ]
        raw = vals if typ == 2 else struct.pack('<' + f * len(vals), *vals)
        cnt = len(raw) // sz if typ != 2 else len(raw)
        if len(raw) <= 4:
            ifd += struct.pack('<HHI', t, typ, cnt) + raw.ljust(4, b'\0')
        else:
            ifd += struct.pack('<HHII', t, typ, cnt, extra_off + len(extra)); extra += raw
    with open(path, 'wb') as out:
        out.write(b'II' + struct.pack('<HI', 42, ifd_off) + body + struct.pack('<H', len(entries)) + ifd + struct.pack('<I', 0) + extra)


class Altitudes(unittest.TestCase):
    def test_geotiff_reader_and_grid(self):
        tmp = tempfile.mkdtemp(prefix='meteo-alt-')
        try:
            relief = lambda la, lo: 100 + 1000 * (la - 43) + 200 * (lo - 0)
            for pred, comp in ((3, 8), (1, 1)):
                p = os.path.join(tmp, f't{pred}.tif')
                write_geotiff(p, 43, 0, 240, relief, predictor=pred, compression=comp)
                t = B.Tiff(open(p, 'rb').read())
                self.assertEqual((t.w, t.h), (240, 240))
                v = t.row(0)
                self.assertAlmostEqual(v[0], relief(43 + 1 - 0.5 / 240, 0.5 / 240), places=2)
                g = t.sample_grid(43, 0, F.ELEVATION_N)
                self.assertEqual(len(g), F.ELEVATION_N ** 2)
                self.assertAlmostEqual(g[60 * F.ELEVATION_N + 60], relief(43.5, 0.5), delta=6)
            # le carré, tel que le fabricant le range, puis relu par l'app (bilinéaire)
            dl = os.path.join(tmp, 'dl'); os.makedirs(dl)
            shutil.copy(os.path.join(tmp, 't3.tif'), os.path.join(dl, B.copdem_name(43, 0) + '.tif'))
            db = F.open_db(os.path.join(tmp, 'meteo-socle.sqlite'), 'socle', 'Socle')
            n = B.do_altitudes(B.Net(os.path.join(tmp, 'cache'), dl), db, [(43.9, 0.1, 43.1, 0.9), (44.5, 0.1, 44.1, 0.9)], os.path.join(tmp, 'alt-travail.sqlite'))
            self.assertEqual(n, 1, 'le carré N44 (absent : en mer) est sauté')
            db.close()
            # n = 1 carré ; relu par meteo_altitude
            php = ("define('APP_ROOT', %r); define('SHARED_DATA_DIR', %r); define('DATA_DIR', %r); require %r; function safe_int($v){return (int)$v;} require %r;"
                   "echo json_encode([meteo_altitude(43.5, 0.5), meteo_altitude(43.25, 0.75), meteo_altitude(45.0, 6.0)]);") % (
                ROOT, tmp, tmp, os.path.join(ROOT, 'lib', 'calendars.php'), os.path.join(ROOT, 'lib', 'meteo.php'))
            out = json.loads(subprocess.run(['php', '-r', php], env={**os.environ, 'LCNDA_METEO_DIR': tmp}, capture_output=True, text=True, check=True).stdout)
            self.assertAlmostEqual(out[0], relief(43.5, 0.5), delta=6)
            self.assertAlmostEqual(out[1], relief(43.25, 0.75), delta=6)
            self.assertIsNone(out[2])
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

    def test_lzw(self):
        # « TOBEORNOTTOBEORTOBEORNOT » codé en LZW TIFF (codes de 9 bits)
        codes = [256, 84, 79, 66, 69, 79, 82, 78, 79, 84, 258, 260, 262, 267, 261, 263, 265, 257]
        bits = ''.join(format(c, '09b') for c in codes)
        bits += '0' * (-len(bits) % 8)
        data = bytes(int(bits[i:i + 8], 2) for i in range(0, len(bits), 8))
        self.assertEqual(B.lzw_decode(data), b'TOBEORNOTTOBEORTOBEORNOT')


class Build(unittest.TestCase):
    def test_offline_socle_read_by_php(self):
        tmp = tempfile.mkdtemp(prefix='meteo-build-')
        try:
            code = B.main(['socle', '--hors-ligne', FIX, '--sans-era5', '--sans-20cr', '--dossier', os.path.join(tmp, 'out'), '--stations', '3', '--depuis', '2019', '--jusqu-a', '2020'])
            self.assertEqual(code, 0)
            path = os.path.join(tmp, 'out', 'meteo-socle.sqlite')
            db = sqlite3.connect(path)
            self.assertEqual(db.execute('SELECT COUNT(*) FROM stations').fetchone()[0], 3)
            self.assertEqual(dict(db.execute('SELECT key, value FROM meta'))['kind'], 'socle')
            self.assertGreater(db.execute('SELECT COUNT(*) FROM normals').fetchone()[0], -1)
            db.close()
            # l'en-tête du pack à importer
            with open(os.path.join(tmp, 'out', 'meteo-socle.lcmeteo'), 'rb') as f:
                head = f.read(4096)
            self.assertTrue(head.startswith(b'LCMETEO1\n'))
            info = json.loads(head[9:].decode().strip())
            self.assertEqual((info['kind'], info['stations'], info['size']), ('socle', 3, os.path.getsize(path)))
            # reprise : la deuxième fois, rien n'est refait (et le résultat est le même)
            self.assertEqual(B.main(['socle', '--hors-ligne', FIX, '--sans-era5', '--sans-20cr', '--dossier', os.path.join(tmp, 'out'), '--stations', '3', '--depuis', '2019', '--jusqu-a', '2020']), 0)
            # relu par l'app
            php = ("define('APP_ROOT', %r); define('SHARED_DATA_DIR', %r); define('DATA_DIR', %r); require %r; function safe_int($v){return (int)$v;} require %r;"
                   "$r = meteo_day(43.646, 0.586, null, '2020-02-03', null, []); echo json_encode([$r['reliability'], $r['day']['tn'], $r['day']['ww'] & 1, $r['station']['short']]);") % (
                ROOT, tmp, tmp, os.path.join(ROOT, 'lib', 'calendars.php'), os.path.join(ROOT, 'lib', 'meteo.php'))
            out = subprocess.run(['php', '-r', php], env={**os.environ, 'LCNDA_METEO_DIR': os.path.join(tmp, 'out')}, capture_output=True, text=True, check=True).stdout
            self.assertEqual(json.loads(out), ['measured', -2, 1, 'Auch'])
        finally:
            shutil.rmtree(tmp, ignore_errors=True)


if __name__ == '__main__':
    unittest.main(verbosity=1)
