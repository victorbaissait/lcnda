#!/usr/bin/env python3
"""🌦 Les compléments Copernicus (scripts/meteo/meteo_plus.py), SANS Internet ni clé : de petits fichiers NetCDF / CSV
fabriqués ici au format des vrais jeux du CDS (ERA5-Land, UTCI, GloFAS, CERRA, relevés in situ), puis :
  - la réduction (un bloc par carreau et par an, colonnes SH/SF/TN/TX, UX/UN, QL), le décalage des cumuls (valeur de 0 h = la veille) ;
  - « Request too large » → le mois est recoupé en deux ; coupure → la reprise ne redemande pas ce qui est fini ;
  - le formulaire officiel relu (champ renommé « hyear » → « year », valeur changée) ;
  - le pack fini (.lcmeteo) relu par l'app (lib/meteo.php → $res['plus']), et le socle inchangé.

    python3 tests/test_meteo_plus.py
"""
import datetime
import importlib.util
import json
import os
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import unittest
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'scripts', 'meteo'))
import meteo_format as F  # noqa: E402
import meteo_plus as P  # noqa: E402

spec = importlib.util.spec_from_file_location('build_meteo', os.path.join(ROOT, 'scripts', 'meteo', 'build-meteo.py'))
B = importlib.util.module_from_spec(spec)
spec.loader.exec_module(B)
import netCDF4  # noqa: E402
import numpy as np  # noqa: E402

LATS = [43.7, 43.6]          # le Gers (Auch ≈ 43,65 N ; 0,59 E)
LONS = [0.5, 0.6, -2.0]      # -2,0 : en mer (valeurs vides) et hors des pays


def nc_grid(path, times, fields, lats=LATS, lons=LONS, tname='valid_time'):
    """fields : {nom: fonction(t, i_lat, i_lon) → valeur ou None}"""
    ds = netCDF4.Dataset(path, 'w')
    ds.createDimension(tname, len(times))
    ds.createDimension('latitude', len(lats))
    ds.createDimension('longitude', len(lons))
    tv = ds.createVariable(tname, 'i8', (tname,))
    tv.units = 'seconds since 1970-01-01'
    tv[:] = [int((t - datetime.datetime(1970, 1, 1)).total_seconds()) for t in times]
    ds.createVariable('latitude', 'f8', ('latitude',))[:] = lats
    ds.createVariable('longitude', 'f8', ('longitude',))[:] = lons
    for name, fn in fields.items():
        v = ds.createVariable(name, 'f4', (tname, 'latitude', 'longitude'), fill_value=np.float32(-9999))
        arr = np.full((len(times), len(lats), len(lons)), -9999, dtype='f4')
        for t in range(len(times)):
            for a in range(len(lats)):
                for b in range(len(lons)):
                    x = fn(times[t], a, b)
                    if x is not None:
                        arr[t, a, b] = x
        v[:] = arr
    ds.close()


def days_of(y, m):
    return [datetime.datetime(y, m, d) for d in range(1, P.month_days(y, m) + 1)]


def php_day(app_dir, lat, lon, date, detail=True):
    tmp = tempfile.mkdtemp(prefix='meteo-php-')
    php = ("define('APP_ROOT', %r); define('SHARED_DATA_DIR', %r); define('DATA_DIR', %r); require %r; function safe_int($v){return (int)$v;} require %r;"
           "echo json_encode(meteo_day(%r, %r, null, %r, null, ['detail' => %s]));") % (
        ROOT, tmp, tmp, os.path.join(ROOT, 'lib', 'calendars.php'), os.path.join(ROOT, 'lib', 'meteo.php'), lat, lon, date, 'true' if detail else 'false')
    try:
        out = subprocess.run(['php', '-r', php], env={**os.environ, 'LCNDA_METEO_DIR': app_dir}, capture_output=True, text=True, check=True).stdout
        return json.loads(out)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


class Snow(unittest.TestCase):
    """plus-neige (ERA5-Land) : 1990 en entier, le 31 décembre arrivé avec janvier 1991, un mois trop gros recoupé, une coupure reprise"""

    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp(prefix='meteo-plus-neige-')
        cls.fx = os.path.join(cls.tmp, 'fx')
        os.makedirs(cls.fx)
        sea = lambda b: b == 2
        for y in (1990, 1991):
            for m in range(1, 13):
                ts = days_of(y, m)
                lab = f'{y}-{m:02d}'
                # neige au sol à 0 h : 10 cm + n° du jour ; neige tombée (valeur de 0 h = la veille) : 1 mm d'eau le 15 janvier 1990 (→ rangé le 14)
                nc_grid(os.path.join(cls.fx, f'plus-neige-neige-{lab}.nc'), ts, {
                    'sde': lambda t, a, b: None if sea(b) else (0.10 + t.day / 100 if t.month == 1 else 0.0),
                    'sf': lambda t, a, b: None if sea(b) else (0.001 if (t.month, t.day) == (1, 15) else (0.002 if (t.month, t.day) == (1, 1) else 0.0))})
                for name, base in (('tmin', 270.15), ('tmax', 280.15)):
                    if (y, m, name) == (1990, 3, 'tmin'):  # « trop gros » : recoupé en deux moitiés
                        open(os.path.join(cls.fx, f'plus-neige-tmin-{lab}.nc.trop-gros'), 'w').close()
                        for d0, d1 in ((1, 15), (16, 31)):
                            nc_grid(os.path.join(cls.fx, f'plus-neige-tmin-{lab}-{d0:02d}-{d1:02d}.nc'), [datetime.datetime(y, 3, d) for d in range(d0, d1 + 1)],
                                    {'t2m': lambda t, a, b, base=base: None if sea(b) else base - 5})
                        continue
                    nc_grid(os.path.join(cls.fx, f'plus-neige-{name}-{lab}.nc'), ts, {'t2m': lambda t, a, b, base=base: None if sea(b) else base + a})
        cls.out = os.path.join(cls.tmp, 'out')

        class Cut(Exception):
            pass
        # 1re fois : coupure au 5e fichier ; 2e fois : la suite
        off = P.Offline(cls.fx)
        real = off.retrieve
        n = {'k': 0}

        def flaky(*a, **k):
            n['k'] += 1
            if n['k'] == 5:
                raise Cut('coupure')
            return real(*a, **k)
        off.retrieve = flaky
        try:
            P.GridBuilder('plus-neige', cls.out, (1990, 1990), off, log=lambda *a: None).run()
        except Cut:
            pass
        cls.asked_before = len(off.asked)
        off2 = P.Offline(cls.fx)
        cls.lc = P.GridBuilder('plus-neige', cls.out, (1990, 1990), off2, log=lambda *a: None).run()
        cls.asked_after = [x[2] for x in off2.asked]

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def test_pack(self):
        db = sqlite3.connect(os.path.join(self.out, 'meteo-plus-neige.sqlite'))
        meta = dict(db.execute('SELECT key, value FROM meta'))
        self.assertEqual((meta['kind'], meta['plus']), ('plus-neige', '1'))
        self.assertEqual([r[0] for r in db.execute('SELECT id FROM sources')], ['era5land'])
        self.assertEqual(db.execute('SELECT COUNT(*) FROM grid').fetchone()[0], 4, 'la mer et le hors-pays sont laissés')
        gid = db.execute('SELECT id FROM grid WHERE lat=43.6 AND lon=0.6').fetchone()[0]
        step, cols = F.decode(db.execute('SELECT blob FROM grid_daily WHERE grid_id=? AND annee=1990', (gid,)).fetchone()[0])
        self.assertEqual(sorted(cols), ['SF', 'SH', 'TN', 'TX'])
        self.assertEqual(len(cols['TN']), 365)
        self.assertEqual(cols['SH'][0:3], [11, 12, 13])          # 0,11 m → 11 cm
        self.assertEqual(cols['SF'][13], 1, 'tombé le 14 janvier (valeur de 0 h le 15)')
        self.assertEqual(cols['SF'][364], 2, 'le 31 décembre 1990 vient du 1er janvier 1991')
        self.assertEqual((cols['TN'][0], cols['TX'][0]), (-20, 80))   # 270,15 K + 1 → −2 °C ; 280,15 + 1 → 8 °C
        self.assertEqual(cols['TN'][59 + 20], -80, 'mars recoupé en deux : 265,15 K → −8 °C')
        self.assertEqual(db.execute('SELECT MIN(debut), MAX(fin) FROM grid').fetchone(), (1990, 1990))
        db.close()
        self.assertTrue(os.path.exists(self.lc))
        with open(self.lc, 'rb') as f:
            info = json.loads(f.read(4096)[9:].decode().strip())
        self.assertEqual((info['kind'], info['cells']), ('plus-neige', 4))
        self.assertEqual(os.listdir(os.path.join(self.out, 'telechargements', 'plus-neige')), [], 'les fichiers reçus sont effacés après réduction')

    def test_resume(self):
        self.assertEqual(self.asked_before, 4, 'coupé à la 5e demande')
        self.assertNotIn('plus-neige-neige-1990-01.nc', self.asked_after, 'déjà fait avant la coupure : pas redemandé')
        self.assertIn('plus-neige-tmin-1990-03-01-15.nc', self.asked_after)

    def test_read_by_php(self):
        app = os.path.join(self.tmp, 'app')
        os.makedirs(app, exist_ok=True)
        # un tout petit socle : un carreau ERA5 (pour que la journée existe) + le complément
        sp = os.path.join(app, 'meteo-socle.sqlite')
        db = F.open_db(sp, 'socle', 'Socle')
        F.add_sources(db, ['era5'], 2025)
        db.execute("INSERT INTO grid(id, source, lat, lon, debut, fin, pas) VALUES(1, 'era5', 43.75, 0.5, 1990, 1990, 0.25)")
        db.execute('INSERT INTO grid_daily(grid_id, annee, blob) VALUES(1, 1990, ?)', (F.encode([('TN', [-10] * 365), ('TX', [50] * 365)]),))
        db.commit()
        db.close()
        shutil.copy(os.path.join(self.out, 'meteo-plus-neige.sqlite'), app)
        r = php_day(app, 43.62, 0.58, '1990-01-02')
        self.assertEqual(r['reliability'], 'estimated')
        self.assertEqual(r['day']['tn'], -1.0, 'la journée vient toujours du socle')
        p = r['plus']
        self.assertEqual(p['snow']['sh'], 12)
        self.assertEqual((p['fine']['source'], p['fine']['tn'], p['fine']['tx']), ('era5land', -2.0, 8.0))
        self.assertEqual(p['sources'][0]['id'], 'era5land')
        self.assertIn('cds.climate.copernicus.eu', p['sources'][0]['url'])
        self.assertNotIn('plus', php_day(app, 43.62, 0.58, '1990-01-02', detail=False), 'pas dans les pastilles')
        os.remove(os.path.join(app, 'meteo-plus-neige.sqlite'))
        self.assertNotIn('plus', php_day(app, 43.62, 0.58, '1990-01-02'), 'sans le pack : rien de plus')


class Others(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix='meteo-plus-')
        self.fx = os.path.join(self.tmp, 'fx')
        os.makedirs(self.fx)
        self.out = os.path.join(self.tmp, 'out')

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_utci_zip_of_daily_files(self):
        """UTCI : un zip d'un fichier par jour (24 heures) → le plus chaud et le plus froid de la journée"""
        zp = os.path.join(self.fx, 'plus-ressenti-utci-2003-01.nc')
        with zipfile.ZipFile(zp, 'w') as z:
            for d in range(1, 32):
                f = os.path.join(self.tmp, f'ECMWF_utci_200301{d:02d}_v1.1_con.nc')
                nc_grid(f, [datetime.datetime(2003, 1, d, h) for h in range(24)], {'utci': lambda t, a, b: 273.15 + t.hour - 5 + (30 if t.day == 2 else 0)}, tname='time')
                z.write(f, os.path.basename(f))
        lc = P.GridBuilder('plus-ressenti', self.out, (2003, 2003), P.Offline(self.fx), test=True, log=lambda *a: None).run()
        db = sqlite3.connect(os.path.join(self.out, 'meteo-plus-ressenti.sqlite'))
        cols = F.decode(db.execute('SELECT blob FROM grid_daily LIMIT 1').fetchone()[0])[1]
        self.assertEqual((cols['UX'][0], cols['UN'][0]), (180, -50))
        self.assertEqual(cols['UX'][1], 480)
        self.assertEqual(db.execute('SELECT COUNT(*) FROM grid').fetchone()[0], 6, 'UTCI a des valeurs en mer : tous les points des pays')
        db.close()
        self.assertTrue(lc.endswith('meteo-pack-plus-ressenti.lcmeteo'))

    def test_glofas_big_rivers_only(self):
        """GloFAS : seuls les carreaux des grandes rivières restent (débit moyen ≥ 10 m³/s), seuils de crue calculés"""
        for m in range(1, 13):
            ts = days_of(1980, m)
            nc_grid(os.path.join(self.fx, f'plus-rivieres-debit-1980-{m:02d}.nc'), ts,
                    {'dis24': lambda t, a, b: None if b == 2 else (300.0 * (5 if (t.month, t.day) == (2, 10) else 1) if (a, b) == (0, 0) else 4.0)})
        ts = days_of(1981, 1)
        nc_grid(os.path.join(self.fx, 'plus-rivieres-debit-1981-01.nc'), ts, {'dis24': lambda t, a, b: None if b == 2 else (300.0 if (a, b) == (0, 0) else 4.0)})
        P.GridBuilder('plus-rivieres', self.out, (1980, 1980), P.Offline(self.fx), log=lambda *a: None).run()
        db = sqlite3.connect(os.path.join(self.out, 'meteo-plus-rivieres.sqlite'))
        self.assertEqual(db.execute('SELECT COUNT(*) FROM grid').fetchone()[0], 1)
        mean, p99 = db.execute('SELECT moyenne, p99 FROM riviere').fetchone()
        self.assertAlmostEqual(mean, 300 + 1200 / 366, delta=1)
        q = [round(10 ** (x / 1000)) for x in F.decode(db.execute('SELECT blob FROM grid_daily').fetchone()[0])[1]['QL']]
        self.assertEqual(q[39], 1500, 'valeur du 10 février à 0 h → le 9 février')
        db.close()
        app = os.path.join(self.tmp, 'app')
        os.makedirs(app)
        shutil.copy(os.path.join(self.out, 'meteo-plus-rivieres.sqlite'), app)
        sp = os.path.join(app, 'meteo-socle.sqlite')
        db = F.open_db(sp, 'socle', 'Socle')
        db.execute("INSERT INTO grid(id, source, lat, lon, debut, fin, pas) VALUES(1, 'era5', 43.75, 0.5, 1980, 1980, 0.25)")
        db.execute('INSERT INTO grid_daily(grid_id, annee, blob) VALUES(1, 1980, ?)', (F.encode([('TN', [0] * 366), ('TX', [50] * 366)]),))
        db.commit()
        db.close()
        r = php_day(app, 43.68, 0.52, '1980-02-09')['plus']
        self.assertEqual(round(r['river']['q']), 1500)
        self.assertGreaterEqual(r['river']['q'], r['river']['p99'])
        self.assertEqual(r['sources'][0]['id'], 'glofas')

    def test_form_adapts_request(self):
        """le formulaire officiel : « year » devenu « hyear », « version_4_0 » devenu « version_4_1 », un champ disparu"""
        form = {'hyear': {'schema': {'type': 'array', 'items': {'type': 'string'}}}, 'month': {}, 'day': {},
                'system_version': {'schema': {'type': 'array', 'items': {'type': 'string', 'enum': ['version_3_1', 'version_4_1']}}},
                'variable': {'schema': {'type': 'array', 'items': {'enum': ['river_discharge_in_the_last_24_hours', 'runoff_water_equivalent']}}}}
        logs = []
        r = P.adapt(form, {'year': ['1990'], 'month': ['01'], 'day': ['01'], 'system_version': ['version_4_0'], 'variable': ['river_discharge_in_the_last_24_hours'], 'area': [1, 2, 3, 4]},
                    {'system_version': 'version_4'}, log=logs.append)
        self.assertEqual(r, {'hyear': ['1990'], 'month': ['01'], 'day': ['01'], 'system_version': ['version_4_1'], 'variable': ['river_discharge_in_the_last_24_hours']})
        self.assertEqual(len(logs), 3)
        with self.assertRaises(P.Stop):
            P.adapt(form, {'variable': ['snow_depth']})

    def test_cerra_lambert_grid_land_only(self):
        """CERRA : grille de Lambert (latitudes/longitudes en 2 dimensions, 0–360), 3 heures, carte terre/mer"""
        def lam(path, times, fields, tname='time'):
            ds = netCDF4.Dataset(path, 'w')
            ds.createDimension(tname, len(times)); ds.createDimension('y', 2); ds.createDimension('x', 2)
            tv = ds.createVariable(tname, 'f8', (tname,)); tv.units = 'hours since 1985-01-01 00:00'
            tv[:] = [(t - datetime.datetime(1985, 1, 1)).total_seconds() / 3600 for t in times]
            ds.createVariable('latitude', 'f8', ('y', 'x'))[:] = [[43.60, 43.61], [43.65, 43.66]]
            ds.createVariable('longitude', 'f8', ('y', 'x'))[:] = [[0.50, 0.56], [0.51, 350.0]]  # 350 = −10 : hors des pays
            for name, fn in fields.items():
                v = ds.createVariable(name, 'f4', (tname, 'y', 'x'))
                v[:] = np.array([[[fn(t, a, b) for b in range(2)] for a in range(2)] for t in times], dtype='f4')
            ds.close()
        lam(os.path.join(self.out + '-fixe.nc'), [datetime.datetime(2000, 1, 1)], {'lsm': lambda t, a, b: 0.0 if (a, b) == (0, 1) else 1.0, 'orog': lambda t, a, b: 150.0})
        os.makedirs(os.path.join(self.out, 'travail'))
        shutil.move(self.out + '-fixe.nc', os.path.join(self.out, 'travail', 'plus-cerra-fixe.nc'))
        ts = [datetime.datetime(1985, 1, d, h) for d in range(1, 32) for h in range(0, 24, 3)]
        lam(os.path.join(self.fx, 'plus-cerra-t2m-1985-01.nc'), ts, {'t2m': lambda t, a, b: 273.15 + (t.hour - 9) / 3})
        P.GridBuilder('plus-cerra', self.out, (1985, 1985), P.Offline(self.fx), test=True, log=lambda *a: None).run()
        db = sqlite3.connect(os.path.join(self.out, 'meteo-plus-cerra.sqlite'))
        self.assertEqual(db.execute('SELECT COUNT(*) FROM grid').fetchone()[0], 2, 'la mer et le point hors pays sont laissés')
        self.assertEqual(db.execute('SELECT DISTINCT alt FROM grid').fetchall(), [(150.0,)])
        cols = F.decode(db.execute('SELECT blob FROM grid_daily LIMIT 1').fetchone()[0])[1]
        self.assertEqual((cols['TN'][0], cols['TX'][0]), (-30, 40))
        db.close()

    def test_insitu_before_1836(self):
        """relevés in situ (CSV « CDM-lite » dans un zip) : 3 relevés par jour → min./max. ; une station lue par l'app en 1780"""
        rows = ['station_name,primary_station_id,report_timestamp,latitude|station_configuration,longitude|station_configuration,height_of_station_above_sea_level,observed_variable,observation_value,units,quality_flag']
        for d in range(1, 32):
            for h, k in ((7, 270.15), (14, 278.15), (21, 273.15)):
                rows.append(f'PARIS (OBSERVATOIRE),FR-PARIS-1,1780-01-{d:02d} {h:02d}:00:00+00,48.836,2.336,75,air_temperature,{k},K,0')
            rows.append(f'PARIS (OBSERVATOIRE),FR-PARIS-1,1780-01-{d:02d} 07:00:00+00,48.836,2.336,75,accumulated_precipitation,2.5,mm,0')
        rows.append('GENEVE,CH-GE-1,1780-01-01 07:00:00+00,46.2,6.15,405,air_temperature,999,K,1')  # refusé (contrôle qualité)
        with zipfile.ZipFile(os.path.join(self.fx, 'plus-anciennes-1780.zip'), 'w') as z:
            z.writestr('data_1780.csv', '\n'.join(['# commentaire'] + rows))
        lc = P.build_insitu(self.out, (1780, 1780), P.Offline(self.fx), log=lambda *a: None)
        db = sqlite3.connect(os.path.join(self.out, 'meteo-plus-anciennes.sqlite'))
        self.assertEqual(db.execute('SELECT nom, debut, fin FROM stations').fetchall(), [('PARIS (OBSERVATOIRE)', 1780, 1780)])
        cols = F.decode(db.execute('SELECT blob FROM daily').fetchone()[0])[1]
        self.assertEqual((cols['TN'][0], cols['TX'][0], cols['RR'][0]), (-30, 50, 25))
        db.close()
        app = os.path.join(self.tmp, 'app')
        os.makedirs(app)
        shutil.copy(os.path.join(self.out, 'meteo-plus-anciennes.sqlite'), app)
        r = php_day(app, 48.85, 2.35, '1780-01-05')
        self.assertEqual((r['reliability'], r['day']['tn'], r['station']['short'], r['sources'][0]['id']), ('measured', -3.0, 'PARIS (OBSERVATOIRE)', 'c3s-insitu'))
        self.assertTrue(lc.endswith('meteo-pack-plus-anciennes.lcmeteo'))

    def test_eobs_refused_and_cli(self):
        with self.assertRaises(P.Stop):
            P.build('plus-eobs', self.out, (1990, 1990))
        # la ligne de commande : un complément sans clé Copernicus → arrêt propre (code 2), rien d'autre de fabriqué
        old = {k: os.environ.get(k) for k in ('CDSAPI_RC', 'CDSAPI_KEY', 'CDSAPI_URL')}
        os.environ.update({'CDSAPI_RC': os.path.join(self.tmp, 'pas-de-cle'), 'CDSAPI_KEY': ''})
        try:
            code = B.main(['plus-ressenti', '--test', '--dossier', self.out])
        finally:
            for k, v in old.items():
                os.environ.pop(k, None) if v is None else os.environ.__setitem__(k, v)
        self.assertEqual(code, 2)
        self.assertFalse(os.path.exists(os.path.join(self.out, 'travail', 'stations.sqlite')), 'le travail du socle n’est pas touché')


if __name__ == '__main__':
    unittest.main(verbosity=1)
