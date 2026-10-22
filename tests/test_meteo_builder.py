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
