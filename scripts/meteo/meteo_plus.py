"""LCNDA — 🌦 Météo d'autrefois : les COMPLÉMENTS Copernicus, des packs à part, facultatifs (« plus-… »).

Ils ne touchent ni au socle, ni à son cache : chacun a son dossier de travail (meteo-sortie/travail/plus-….sqlite), ses
téléchargements (meteo-sortie/telechargements/plus-…/) et son fichier fini (meteo-sortie/meteo-pack-plus-….lcmeteo).

    python3 scripts/meteo/build-meteo.py plus-neige      # ERA5-Land : neige au sol, neige tombée, min. et max. (≈ 9 km), 1950 →
    python3 scripts/meteo/build-meteo.py plus-ressenti   # ERA5-HEAT (UTCI) : ressenti le plus chaud et le plus froid du jour, 1940 →
    python3 scripts/meteo/build-meteo.py plus-rivieres   # GloFAS (CEMS, serveur EWDS) : débit des grandes rivières, 1979 →
    python3 scripts/meteo/build-meteo.py plus-cerra      # CERRA : réanalyse régionale de l'Europe (≈ 5,5 km), min. et max., 1985 →
    python3 scripts/meteo/build-meteo.py plus-anciennes  # relevés in situ d'avant 1836 (seulement les données « open »)

Pas fabriqué : E-OBS (insitu-gridded-observations-europe). Sa licence (« E-OBS product licence ») le réserve à la recherche et
à l'enseignement non commerciaux : il ne peut pas être redistribué dans un pack public.

Tout se demande au Climate Data Store (clé dans ~/.cdsapirc, la même pour le serveur EWDS de GloFAS ; les conditions de chaque
jeu doivent être acceptées une fois sur le site, onglet « Download »). Les demandes sont découpées en MORCEAUX :
  - un mois par demande (les jeux en grille), une année (les relevés in situ) ;
  - si Copernicus répond « Request too large » / « cost limits exceeded », le morceau est recoupé en deux, puis encore en deux… ;
  - chaque morceau fini est réduit tout de suite (quelques valeurs par carreau et par jour) et rangé dans la base de travail :
    le fichier téléchargé est effacé (le cache de GitHub reste petit) ; une coupure (6 h de GitHub) reprend au morceau suivant.
Les noms des champs de chaque demande sont relus dans le formulaire officiel du CDS (…/api/retrieve/v1/processes/<jeu>) quand
il répond : une valeur qui a changé de nom (ex. « hyear » → « year ») est corrigée et écrite dans le journal.
"""
import csv
import datetime
import glob
import io
import json
import math
import os
import re
import shutil
import sqlite3
import tarfile
import time
import urllib.request
import zipfile

import meteo_format as F

CDS_URL = 'https://cds.climate.copernicus.eu/api'
EWDS_URL = 'https://ewds.climate.copernicus.eu/api'  # GloFAS (CEMS) est sur l'« Early Warning Data Store » (même compte, même clé)
BOX_4 = (51.6, -5.5, 41.2, 10.6)  # nord, ouest, sud, est : France, Belgique, Suisse, Luxembourg (comme le socle)
COUNTRY_BOXES = {'FR': (51.1, -5.2, 41.3, 9.6), 'BE': (51.55, 2.5, 49.45, 6.45), 'CH': (47.85, 5.9, 45.8, 10.5), 'LU': (50.2, 5.7, 49.4, 6.55)}
BOX_EUROPE = (71.5, -25.0, 34.0, 45.0)
TOO_LARGE = re.compile(r'too large|cost limit|limits? exceeded|exceeds? .*limit|request is too big', re.I)
NO_DATA = re.compile(r'no data|empty|not available|no matching|nothing to|constraint', re.I)
GLOFAS_QMIN = 10.0      # m³/s : les carreaux dont le débit moyen dépasse ce seuil (les « grandes rivières ») sont gardés
GLOFAS_QFIRST = 2.0     # pendant la première année (avant de connaître la moyenne), on garde dès 2 m³/s
DAYS = [f'{d:02d}' for d in range(1, 32)]
K10 = ('K10', None)      # kelvins → dixièmes de °C


class Stop(Exception):
    pass


class TooLarge(Exception):
    """Copernicus refuse la demande : trop grosse (on la recoupe)"""


def say(*a):
    print(*a, flush=True)


def conv(kind, v):
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return None
    if kind == 'K10':
        return int(round((v - 273.15) * 10))
    if kind == 'cm':          # m → cm
        return int(round(v * 100))
    if kind == 'cm_snow':     # m d'eau → cm de neige (≈ 1 cm par mm d'eau)
        return int(round(v * 1000))
    if kind == 'logq':        # m³/s → 1000 × log10
        return int(round(1000 * math.log10(max(float(v), 0.001))))
    return int(round(v))


# ═══════════════════════ Les packs (ce qu'on demande, et comment on le réduit) ═══════════════════════
# cols : (noms possibles de la variable dans le NetCDF, colonne du pack, réduction sur la journée, décalage en heures, conversion)
# décalage 1 : la valeur datée 0 h du jour J est celle de la veille (cumuls d'ERA5-Land, débits de GloFAS) → rangée au jour J-1.
SPECS = {
    'plus-neige': dict(
        title='Neige et températures fines (ERA5-Land)', source='era5land', first=1950, server='cds', area=BOX_4, next_day=True,
        requests=[
            dict(name='neige', dataset='reanalysis-era5-land',
                 req={'variable': ['snow_depth', 'snowfall'], 'time': ['00:00'], 'data_format': 'netcdf', 'download_format': 'unarchived'},
                 cols=[(('sde', 'snow_depth'), 'SH', 'first', 0, 'cm'), (('sf', 'snowfall'), 'SF', 'first', 1, 'cm_snow')]),
            dict(name='tmin', dataset='derived-era5-land-daily-statistics',
                 req={'variable': ['2m_temperature'], 'daily_statistic': 'daily_minimum', 'time_zone': 'utc+00:00', 'frequency': '1_hourly'},
                 cols=[(('t2m', '2m_temperature'), 'TN', 'min', 0, 'K10')]),
            dict(name='tmax', dataset='derived-era5-land-daily-statistics',
                 req={'variable': ['2m_temperature'], 'daily_statistic': 'daily_maximum', 'time_zone': 'utc+00:00', 'frequency': '1_hourly'},
                 cols=[(('t2m', '2m_temperature'), 'TX', 'max', 0, 'K10')]),
        ], order=['TN', 'TX', 'SH', 'SF']),
    'plus-ressenti': dict(
        title='Ressenti thermique (UTCI, ERA5-HEAT)', source='utci', first=1940, server='cds', area=BOX_4,
        requests=[dict(name='utci', dataset='derived-utci-historical',
                       req={'variable': ['universal_thermal_climate_index'], 'version': '1_1', 'product_type': 'consolidated_dataset'},
                       cols=[(('utci',), 'UX', 'max', 0, 'K10'), (('utci',), 'UN', 'min', 0, 'K10')])],
        order=['UX', 'UN']),
    'plus-rivieres': dict(
        title='Débit des rivières (GloFAS)', source='glofas', first=1979, server='ewds', area=BOX_4, next_day=True, rivers=True,
        requests=[dict(name='debit', dataset='cems-glofas-historical',
                       req={'system_version': ['version_4_0'], 'hydrological_model': ['lisflood'], 'product_type': ['consolidated'],
                            'variable': ['river_discharge_in_the_last_24_hours'], 'data_format': 'netcdf', 'download_format': 'unarchived'},
                       hint={'variable': 'discharge', 'system_version': 'version_4', 'product_type': 'consolidated', 'hydrological_model': 'lisflood'},
                       cols=[(('dis24', 'avg_dis', 'dis', 'river_discharge_in_the_last_24_hours'), 'QL', 'mean', 1, 'logq')])],
        order=['QL']),
    'plus-cerra': dict(
        title='Températures très fines (CERRA)', source='cerra', first=1985, server='cds', area=None,  # grille de Lambert : pas de découpe par zone
        requests=[dict(name='t2m', dataset='reanalysis-cerra-single-levels',
                       req={'variable': ['2m_temperature'], 'level_type': 'surface_or_atmosphere', 'data_type': ['reanalysis'], 'product_type': 'analysis',
                            'time': [f'{h:02d}:00' for h in range(0, 24, 3)], 'data_format': 'netcdf'},
                       cols=[(('t2m', '2m_temperature'), 'TN', 'min', 0, 'K10'), (('t2m', '2m_temperature'), 'TX', 'max', 0, 'K10')])],
        static=dict(dataset='reanalysis-cerra-single-levels', req={'variable': ['land_sea_mask', 'orography'], 'level_type': 'surface_or_atmosphere',
                                                                    'data_type': ['reanalysis'], 'product_type': 'analysis', 'year': ['2000'], 'month': ['01'],
                                                                    'day': ['01'], 'time': ['00:00'], 'data_format': 'netcdf'}),
        order=['TN', 'TX']),
}
INSITU = dict(title='Relevés anciens (avant 1836)', source='c3s-insitu', dataset='insitu-observations-surface-land', first=1700, last=1835, area=BOX_EUROPE,
              req={'time_aggregation': 'sub_daily', 'variable': ['air_temperature', 'accumulated_precipitation'], 'data_format': 'csv'},
              prefer={'usage_restrictions': ['open', 'unrestricted'], 'data_quality': ['passed']})
KINDS = list(SPECS) + ['plus-anciennes']


# ═══════════════════════ Le Climate Data Store : demandes, formulaire officiel, morceaux ═══════════════════════
def read_rc():
    url, key = os.environ.get('CDSAPI_URL'), os.environ.get('CDSAPI_KEY')
    p = os.environ.get('CDSAPI_RC', os.path.expanduser('~/.cdsapirc'))
    if os.path.exists(p):
        for line in open(p, encoding='utf-8'):
            k, _, v = line.partition(':')
            if k.strip() == 'url' and not url:
                url = v.strip()
            if k.strip() == 'key' and not key:
                key = v.strip()
    return url or CDS_URL, key


def enum_of(schema):
    """les valeurs permises d'un champ du formulaire (schéma OGC « processes »), ou None"""
    if not isinstance(schema, dict):
        return None
    s = schema.get('schema', schema)
    for node in (s, s.get('items') if isinstance(s.get('items'), dict) else None):
        if isinstance(node, dict) and isinstance(node.get('enum'), list):
            return [str(x) for x in node['enum']]
    for alt in s.get('anyOf', []) + s.get('oneOf', []):
        e = enum_of(alt)
        if e:
            return e
    return None


ALIASES = {'year': ['hyear'], 'month': ['hmonth'], 'day': ['hday'], 'hyear': ['year'], 'hmonth': ['month'], 'hday': ['day'],
           'data_format': ['format'], 'format': ['data_format']}


def adapt(form, req, hint=None, log=say):
    """met la demande d'accord avec le formulaire officiel (s'il a répondu) : champs renommés, valeurs changées, champs inconnus retirés"""
    if not form:
        return dict(req)
    hint = hint or {}
    out = {}
    for k, v in req.items():
        key = k
        if key not in form:
            key = next((a for a in ALIASES.get(k, []) if a in form), None)
            if key is None:
                log(f'     (formulaire Copernicus : le champ « {k} » n’existe pas pour ce jeu, il est retiré)')
                continue
            log(f'     (formulaire Copernicus : « {k} » s’appelle maintenant « {key} »)')
        allowed = enum_of(form[key])
        if allowed and k not in ('year', 'month', 'day', 'hyear', 'hmonth', 'hday', 'time', 'area'):
            vals = v if isinstance(v, list) else [v]
            bad = [x for x in vals if str(x) not in allowed]
            if bad:
                want = hint.get(k) or hint.get(key)
                pick = [a for a in allowed if want and want in a] or ([a for a in allowed if any(b.split('_')[0] in a for b in bad)])
                if not pick:
                    raise Stop(f'Copernicus : la valeur « {", ".join(bad)} » du champ « {key} » n’existe plus (permis : {", ".join(allowed[:12])}). Corrige scripts/meteo/meteo_plus.py.')
                choice = sorted(pick)[-1]  # la plus récente (« version_4_0 » plutôt que « version_3_1 »)
                log(f'     (formulaire Copernicus : « {key} » = « {", ".join(bad)} » remplacé par « {choice} »)')
                v = [choice] if isinstance(v, list) else choice
        out[key] = v
    return out


class CDS:
    """les demandes au CDS (ou à l'EWDS pour GloFAS), avec le formulaire officiel relu une fois par jeu"""

    def __init__(self, server='cds'):
        try:
            import cdsapi
        except ImportError:
            raise Stop('Les compléments Copernicus ont besoin de la bibliothèque cdsapi : tape « pip3 install cdsapi netCDF4 ».')
        url, key = read_rc()
        if not key:
            raise Stop('La clé Copernicus manque (fichier ~/.cdsapirc, ou le secret CDSAPI_KEY sur GitHub) : les compléments ne se fabriquent pas sans elle.')
        self.url = EWDS_URL if server == 'ewds' else url
        self.key = key
        self.client = cdsapi.Client(url=self.url, key=key, quiet=True, progress=False)
        self.forms = {}

    def form(self, dataset):
        if dataset not in self.forms:
            try:
                rq = urllib.request.Request(f'{self.url}/retrieve/v1/processes/{dataset}', headers={'PRIVATE-TOKEN': self.key, 'User-Agent': 'LCNDA-meteo/1.0'})
                with urllib.request.urlopen(rq, timeout=60) as r:
                    self.forms[dataset] = json.load(r).get('inputs') or None
            except Exception as e:  # noqa: BLE001 — le formulaire aide, il n'est pas indispensable
                say(f'     (formulaire Copernicus de {dataset} illisible : {e} — demande telle quelle)')
                self.forms[dataset] = None
        return self.forms[dataset]

    def retrieve(self, dataset, req, target, hint=None):
        req = adapt(self.form(dataset), req, hint)
        try:
            self.client.retrieve(dataset, req, target)
        except Exception as e:  # noqa: BLE001
            msg = str(e)
            if TOO_LARGE.search(msg):
                raise TooLarge(msg)
            raise


class Offline:
    """essais sans Internet : les fichiers sont pris dans un dossier (même nom que le fichier demandé) ;
    « <nom>.trop-gros » fait répondre « Request too large » (pour essayer le recoupage)"""

    def __init__(self, folder):
        self.folder = folder
        self.asked = []

    def retrieve(self, dataset, req, target, hint=None):
        name = os.path.basename(target).replace('.part', '')
        self.asked.append((dataset, req, name))
        if os.path.exists(os.path.join(self.folder, name + '.trop-gros')):
            raise TooLarge('Request too large. Please reduce your selection.')
        src = os.path.join(self.folder, name)
        if not os.path.exists(src):
            raise RuntimeError(f'no data available for this request ({name})')
        shutil.copy(src, target)


# ═══════════════════════ Lire ce qui est arrivé (NetCDF, zip, tgz) ═══════════════════════
def unpack(path, into):
    """→ la liste des fichiers NetCDF/CSV d'un téléchargement (zip et tgz ouverts)"""
    with open(path, 'rb') as f:
        head = f.read(4)
    if head[:2] == b'PK':
        os.makedirs(into, exist_ok=True)
        with zipfile.ZipFile(path) as z:
            names = [n for n in z.namelist() if not n.endswith('/') and '..' not in n and not n.startswith('/')]
            for n in names:
                z.extract(n, into)
        return sorted(os.path.join(into, n) for n in names)
    if head[:2] == b'\x1f\x8b':
        os.makedirs(into, exist_ok=True)
        with tarfile.open(path) as t:
            mem = [m for m in t.getmembers() if m.isfile() and '..' not in m.name and not m.name.startswith('/')]
            t.extractall(into, members=mem)
        return sorted(os.path.join(into, m.name) for m in mem)
    return [path]


def nc_find(ds, names):
    for n in names:
        if n in ds.variables:
            return ds.variables[n]
    # sinon : la seule variable de données (3 dimensions ou plus)
    cands = [v for k, v in ds.variables.items() if len(v.dimensions) >= 3]
    if len(cands) == 1:
        return cands[0]
    raise Stop('Copernicus : variable introuvable (' + ', '.join(names) + ') — le format a peut-être changé.')


def nc_times(ds, nc):
    for n in ('valid_time', 'time', 'date'):
        if n in ds.variables:
            v = ds.variables[n]
            if n == 'date' and not hasattr(v, 'units'):  # AAAAMMJJ
                return [datetime.datetime.strptime(str(int(x)), '%Y%m%d') for x in v[:]]
            out = nc.num2date(v[:], v.units, getattr(v, 'calendar', 'standard'), only_use_cftime_datetimes=False, only_use_python_datetimes=True)
            return [datetime.datetime(t.year, t.month, t.day, t.hour, t.minute) for t in out]
    raise Stop('Copernicus : pas d’axe du temps dans le fichier reçu.')


def nc_latlon(ds):
    la = next((ds.variables[n] for n in ('latitude', 'lat') if n in ds.variables), None)
    lo = next((ds.variables[n] for n in ('longitude', 'lon') if n in ds.variables), None)
    if la is None or lo is None:
        raise Stop('Copernicus : pas de latitudes/longitudes dans le fichier reçu.')
    import numpy as np
    la, lo = np.asarray(la[:], dtype=float), np.asarray(lo[:], dtype=float)
    lo = np.where(lo > 180, lo - 360, lo)
    if la.ndim == 1 and lo.ndim == 1:
        la, lo = np.meshgrid(la, lo, indexing='ij')
    return la, lo


def in_boxes(lat, lon, boxes):
    return any(s <= lat <= n and w <= lon <= e for n, w, s, e in boxes)


# ═══════════════════════ La base de travail (reprise) ═══════════════════════
class Work:
    def __init__(self, path, kind, title):
        self.db = F.open_db(path, kind, title)
        self.db.executescript("""
            CREATE TABLE IF NOT EXISTS done(step TEXT PRIMARY KEY, at TEXT);
            CREATE TABLE IF NOT EXISTS morceaux(annee INTEGER NOT NULL, grid_id INTEGER NOT NULL, cle TEXT NOT NULL, j0 INTEGER NOT NULL, blob BLOB NOT NULL,
                PRIMARY KEY(annee, grid_id, cle)) WITHOUT ROWID;
            CREATE TABLE IF NOT EXISTS riviere(grid_id INTEGER PRIMARY KEY, moyenne REAL, p10 REAL, p90 REAL, p99 REAL);
        """)
        self.db.commit()
        self.ids = {(round(la, 4), round(lo, 4)): i for i, la, lo in self.db.execute('SELECT id, lat, lon FROM grid')}

    def done(self, step):
        return self.db.execute('SELECT 1 FROM done WHERE step=?', (step,)).fetchone() is not None

    def mark(self, step):
        self.db.execute('INSERT OR REPLACE INTO done(step, at) VALUES(?, ?)', (step, datetime.datetime.now().isoformat(timespec='seconds')))
        self.db.commit()

    def cell(self, source, lat, lon, step, alt=None, create=True):
        k = (round(lat, 4), round(lon, 4))
        if k not in self.ids:
            if not create:
                return None
            cur = self.db.execute('INSERT INTO grid(source, lat, lon, alt, pas) VALUES(?,?,?,?,?)', (source, round(lat, 4), round(lon, 4), alt, step))
            self.ids[k] = cur.lastrowid
        return self.ids[k]


def month_days(y, m):
    return (datetime.date(y + (m == 12), m % 12 + 1, 1) - datetime.timedelta(days=1)).day


def chunks_of(y, months=None):
    """les morceaux d'une année : un par mois → (étiquette, mois, [jours])"""
    for m in (months or range(1, 13)):
        yield f'{y}-{m:02d}', m, [f'{d:02d}' for d in range(1, month_days(y, m) + 1)]


# ═══════════════════════ Fabriquer un pack en grille ═══════════════════════
class GridBuilder:
    def __init__(self, kind, out, years, fetcher, test=False, log=say):
        self.kind, self.spec, self.out, self.years, self.cds, self.test, self.say = kind, SPECS[kind], out, years, fetcher, test, log
        self.dl = os.path.join(out, 'telechargements', kind)
        os.makedirs(self.dl, exist_ok=True)
        os.makedirs(os.path.join(out, 'travail'), exist_ok=True)
        self.w = Work(os.path.join(out, 'travail', f'{kind}.sqlite'), kind, self.spec['title'])
        self.boxes = list(COUNTRY_BOXES.values())
        self.static = None
        import netCDF4
        self.nc = netCDF4

    # — un morceau : télécharger (en recoupant s'il est trop gros), réduire, effacer le fichier —
    def fetch(self, r, y, m, days, label):
        step = f"{r['name']}:{label}"
        if self.w.done(step):
            return
        req = dict(r['req'])
        req.update({'year': [str(y)], 'month': [f'{m:02d}'], 'day': days})
        if self.spec.get('area'):
            req['area'] = list(self.spec['area'])
        target = os.path.join(self.dl, f"{self.kind}-{r['name']}-{label}.nc")
        if not os.path.exists(target):
            self.say(f'     {self.kind} {label} : {r["name"]}… (la file d’attente de Copernicus peut prendre du temps)')
            try:
                self.cds.retrieve(r['dataset'], req, target + '.part', r.get('hint'))
            except TooLarge:
                if len(days) <= 1:
                    raise Stop(f'Copernicus refuse même un seul jour ({r["dataset"]} {label}) : « Request too large ». Réduis la zone (area) dans scripts/meteo/meteo_plus.py.')
                half = len(days) // 2
                self.say(f'     ↳ « trop gros » pour Copernicus : {label} est recoupé en deux')
                for part in (days[:half], days[half:]):
                    self.fetch(r, y, m, part, f'{y}-{m:02d}-{part[0]}-{part[-1]}')
                self.w.mark(step)
                return
            os.replace(target + '.part', target)
        self.reduce(r, target, label)
        self.w.mark(step)
        tmp = target + '.d'
        shutil.rmtree(tmp, ignore_errors=True)
        os.remove(target)

    def keep_points(self, la, lo):
        import numpy as np
        mask = np.zeros(la.shape, dtype=bool)
        for n, w, s, e in self.boxes:
            mask |= (la >= s) & (la <= n) & (lo >= w) & (lo <= e)
        if self.static is not None:  # CERRA : seulement sur terre
            mask &= self.static['land']
        return np.argwhere(mask)

    def reduce(self, r, path, label):
        import numpy as np
        files = [f for f in unpack(path, path + '.d') if not f.lower().endswith(('.json', '.txt', '.pdf'))]
        acc = {}  # (colonne) → {date: {point: [valeurs]}}
        pts = None
        for fp in files:
            ds = self.nc.Dataset(fp)
            try:
                times = nc_times(ds, self.nc)
                la, lo = nc_latlon(ds)
                if pts is None:
                    pts = self.keep_points(la, lo)
                    flat = [tuple(p) for p in pts]
                for names, col, agg, shift, cv in r['cols']:
                    v = nc_find(ds, names)
                    for t, when in enumerate(times):
                        day = (when - datetime.timedelta(hours=shift)).date()
                        arr = np.ma.filled(np.ma.asarray(v[t]).astype(float), np.nan).squeeze()
                        if arr.ndim != 2:
                            arr = arr.reshape(la.shape)
                        vals = arr[pts[:, 0], pts[:, 1]] if len(pts) else np.array([])
                        slot = acc.setdefault(col, {}).setdefault(day, [[] for _ in flat])
                        for i, x in enumerate(vals):
                            if not math.isnan(x):
                                slot[i].append(float(x))
                coords = [(float(la[a, b]), float(lo[a, b])) for a, b in flat]
            finally:
                ds.close()
        if not acc:
            return
        aggs = {col: (agg, cv) for _, col, agg, _, cv in r['cols']}
        # les points : un carreau par point qui a au moins une valeur
        first_year_rivers = self.spec.get('rivers') and not self.w.done('cellules-fixees')
        ids = {}
        for i, (lat, lon) in enumerate(coords):
            has = [x for col in acc for d in acc[col] for x in acc[col][d][i]]
            if not has:
                continue
            if self.spec.get('rivers') and first_year_rivers and sum(has) / len(has) < GLOFAS_QFIRST:
                continue
            alt = None
            if self.static is not None:
                alt = self.static['alt'][tuple(pts[i])]
            gid = self.w.cell(self.spec['source'], lat, lon, self.step_of(la, lo), alt, create=not (self.spec.get('rivers') and not first_year_rivers))
            if gid:
                ids[i] = gid
        # rangé par année (un morceau peut toucher la fin de l'année d'avant : décalage d'un jour)
        by_year = {}
        for col, days in acc.items():
            for d in days:
                by_year.setdefault(d.year, set()).add(d)
        for yy, dset in by_year.items():
            d0, d1 = min(dset), max(dset)
            j0 = (d0 - datetime.date(yy, 1, 1)).days
            n = (d1 - d0).days + 1
            for i, gid in ids.items():
                cols = []
                for col in [c for c in self.spec['order'] if c in aggs]:
                    agg, cv = aggs[col]
                    series = []
                    for k in range(n):
                        xs = acc.get(col, {}).get(d0 + datetime.timedelta(days=k), [[]] * len(coords))[i]
                        if not xs:
                            series.append(None)
                            continue
                        val = {'min': min, 'max': max, 'first': lambda a: a[0], 'mean': lambda a: sum(a) / len(a)}[agg](xs)
                        series.append(conv(cv, val))
                    cols.append((col, series))
                self.w.db.execute('INSERT OR REPLACE INTO morceaux(annee, grid_id, cle, j0, blob) VALUES(?,?,?,?,?)', (yy, gid, f"{r['name']}:{label}", j0, F.encode(cols)))
        self.w.db.commit()

    def step_of(self, la, lo):
        if la.shape[0] > 1:
            return round(abs(float(la[1, 0] - la[0, 0])) or 0.05, 4)
        return 0.1

    # — l'année : les morceaux sont rassemblés en un bloc par carreau —
    def assemble(self, y):
        if self.w.done(f'annee-{y}'):
            return
        nd = F.days_in_year(y)
        rows = self.w.db.execute('SELECT grid_id, j0, blob FROM morceaux WHERE annee=? ORDER BY grid_id', (y,)).fetchall()
        cur, cols = None, {}

        def flush(gid):
            if gid is None or not cols:
                return
            blob = F.encode([(c, cols[c]) for c in self.spec['order'] if c in cols])
            self.w.db.execute('INSERT OR REPLACE INTO grid_daily(grid_id, annee, blob) VALUES(?,?,?)', (gid, y, blob))
        for gid, j0, blob in rows:
            if gid != cur:
                flush(cur)
                cur, cols = gid, {}
            _, vals = F.decode(blob)
            for c, xs in vals.items():
                base = cols.setdefault(c, [None] * nd)
                for k, x in enumerate(xs):
                    if x is not None and 0 <= j0 + k < nd:
                        base[j0 + k] = x
        flush(cur)
        self.w.db.execute('DELETE FROM morceaux WHERE annee=?', (y,))
        self.w.db.execute('UPDATE grid SET debut=MIN(COALESCE(debut, ?), ?), fin=MAX(COALESCE(fin, ?), ?) WHERE id IN (SELECT grid_id FROM grid_daily WHERE annee=?)', (y, y, y, y, y))
        if self.spec.get('rivers') and not self.w.done('cellules-fixees'):
            self.fix_rivers(y)
        self.w.mark(f'annee-{y}')
        self.say(f'   • {self.kind} {y}')

    def fix_rivers(self, y):
        """la première année : seuls les carreaux des grandes rivières (débit moyen ≥ GLOFAS_QMIN) restent"""
        drop = []
        for gid, blob in self.w.db.execute('SELECT grid_id, blob FROM grid_daily WHERE annee=?', (y,)).fetchall():
            q = [10 ** (x / 1000) for x in F.decode(blob)[1].get('QL', []) if x is not None]
            if not q or sum(q) / len(q) < GLOFAS_QMIN:
                drop.append(gid)
        for gid in drop:
            self.w.db.execute('DELETE FROM grid_daily WHERE grid_id=?', (gid,))
            self.w.db.execute('DELETE FROM morceaux WHERE grid_id=?', (gid,))
            self.w.db.execute('DELETE FROM grid WHERE id=?', (gid,))
        self.w.ids = {(round(la, 4), round(lo, 4)): i for i, la, lo in self.w.db.execute('SELECT id, lat, lon FROM grid')}
        self.w.mark('cellules-fixees')
        self.say(f'   • {len(self.w.ids)} carreaux de grandes rivières gardés (débit moyen ≥ {GLOFAS_QMIN:g} m³/s)')

    def load_static(self):
        st = self.spec.get('static')
        if not st:
            return
        import numpy as np
        p = os.path.join(self.out, 'travail', f'{self.kind}-fixe.nc')
        if not os.path.exists(p):
            self.say(f'     {self.kind} : la carte terre/mer et le relief…')
            try:
                self.cds.retrieve(st['dataset'], dict(st['req']), p + '.part')
                os.replace(p + '.part', p)
            except Exception as e:  # noqa: BLE001 — sans elle : tous les points des pays, mer comprise
                self.say(f'     (carte terre/mer indisponible : {str(e).splitlines()[0]} — tous les points des pays sont gardés)')
                return
        ds = self.nc.Dataset(unpack(p, p + '.d')[0])
        lsm = np.ma.filled(np.ma.asarray(nc_find(ds, ('lsm', 'land_sea_mask'))[:]).astype(float), 0).squeeze()
        try:
            oro = np.ma.filled(np.ma.asarray(nc_find(ds, ('orog', 'orography', 'z'))[:]).astype(float), np.nan).squeeze()
        except Stop:
            oro = np.full(lsm.shape, np.nan)
        ds.close()
        alt = np.where(np.isnan(oro), None, np.round(oro / (9.80665 if np.nanmax(oro) > 20000 else 1)))
        self.static = {'land': lsm > 0.5, 'alt': alt}

    def run(self):
        self.load_static()
        y0, y1 = max(self.spec['first'], self.years[0]), min(self.years[1], datetime.date.today().year - 1)
        if self.test:
            y1 = y0
        for y in range(y0, y1 + 1):
            if self.w.done(f'annee-{y}'):
                continue
            months = [1] if self.test else None
            for label, m, days in chunks_of(y, months):
                for r in self.spec['requests']:
                    self.fetch(r, y, m, days, label)
            if self.spec.get('next_day') and y < datetime.date.today().year - 1 and not self.test:  # la valeur du 31 décembre arrive avec le 1er janvier suivant
                for label, m, days in chunks_of(y + 1, [1]):
                    for r in self.spec['requests']:
                        self.fetch(r, y + 1, m, days, label)
            self.assemble(y)
        # le 31 décembre de l'année d'avant la première (arrivé avec le 1er janvier) : rien à en faire
        self.w.db.execute('DELETE FROM morceaux WHERE annee<?', (y0,))
        self.w.db.commit()
        return self.finish()

    def finish(self):
        kind, spec = self.kind, self.spec
        path = os.path.join(self.out, f'meteo-{kind}.sqlite')
        if os.path.exists(path):
            os.remove(path)
        db = F.open_db(path, kind, spec['title'])
        F.set_meta(db, countries='FR,BE,CH,LU', plus='1')
        F.add_sources(db, [spec['source']], datetime.date.today().year)
        src = self.w.db
        for gid, lat, lon, alt, debut, fin, pas in src.execute('SELECT id, lat, lon, alt, debut, fin, pas FROM grid WHERE debut IS NOT NULL').fetchall():
            db.execute('INSERT INTO grid(id, source, lat, lon, alt, debut, fin, pas) VALUES(?,?,?,?,?,?,?,?)', (gid, spec['source'], lat, lon, alt, debut, fin, pas))
            qs = []
            for y, blob in src.execute('SELECT annee, blob FROM grid_daily WHERE grid_id=?', (gid,)):
                db.execute('INSERT INTO grid_daily(grid_id, annee, blob) VALUES(?,?,?)', (gid, y, blob))
                if spec.get('rivers'):
                    qs += [10 ** (x / 1000) for x in F.decode(blob)[1].get('QL', []) if x is not None]
            if qs:
                qs.sort()
                pc = lambda p: round(qs[min(len(qs) - 1, int(p * len(qs)))], 3)
                db.execute('CREATE TABLE IF NOT EXISTS riviere(grid_id INTEGER PRIMARY KEY, moyenne REAL, p10 REAL, p90 REAL, p99 REAL)')
                db.execute('INSERT OR REPLACE INTO riviere(grid_id, moyenne, p10, p90, p99) VALUES(?,?,?,?,?)', (gid, round(sum(qs) / len(qs), 3), pc(.1), pc(.9), pc(.99)))
        db.commit()
        db.close()
        return finish_pack(path, self.out, kind, self.say)


def finish_pack(path, out, kind, log=say):
    db = sqlite3.connect(path)
    F.set_meta(db, built=datetime.date.today().isoformat())
    db.commit()
    db.execute('VACUUM')
    db.close()
    lc = os.path.join(out, f'meteo-pack-{kind}.lcmeteo')
    F.wrap_pack(path, lc)
    log(f'   ✓ {os.path.basename(lc)} : {os.path.getsize(lc) / 1e6:.1f} Mo')
    return lc


# ═══════════════════════ Les relevés anciens (in situ, avant 1836) ═══════════════════════
def _col(row, *names):
    for n in names:
        if n in row and row[n] not in (None, ''):
            return row[n]
    return None


def insitu_records(files):
    """les lignes des fichiers reçus (CSV « CDM-lite » ou NetCDF) → dictionnaires aux noms de colonnes simplifiés (sans « |… »)"""
    for fp in files:
        low = fp.lower()
        if low.endswith('.csv') or low.endswith('.csv.gz') or not low.endswith('.nc'):
            with open(fp, 'rb') as fh:
                raw = fh.read()
            if raw[:2] == b'\x1f\x8b':
                import gzip
                raw = gzip.decompress(raw)
            text = raw.decode('utf-8', 'replace')
            lines = [ln for ln in text.splitlines() if ln.strip() and not ln.startswith('#')]
            if not lines:
                continue
            for row in csv.DictReader(lines):
                yield {k.split('|')[0].strip(): (v or '').strip() for k, v in row.items() if k}
        else:
            import netCDF4
            ds = netCDF4.Dataset(fp)
            try:
                names = {k.split('|')[0]: k for k in ds.variables}
                n = max(len(ds.variables[k]) for k in ds.variables if ds.variables[k].ndim >= 1)
                cols = {}
                for short, k in names.items():
                    v = ds.variables[k]
                    if v.ndim == 1 and len(v) == n:
                        vals = v[:]
                        if hasattr(v, 'units') and 'since' in str(v.units):
                            vals = [str(x) for x in netCDF4.num2date(vals, v.units, only_use_python_datetimes=True, only_use_cftime_datetimes=False)]
                        cols[short] = vals
                    elif v.ndim == 2 and v.dtype.kind in 'SU' and v.shape[0] == n:
                        cols[short] = [b''.join(x.compressed() if hasattr(x, 'compressed') else x).decode('utf-8', 'replace') for x in v[:]]
                for i in range(n):
                    yield {k: (c[i].decode() if isinstance(c[i], bytes) else str(c[i])) for k, c in cols.items()}
            finally:
                ds.close()


def parse_insitu(files, years):
    """→ {code: {'meta': {...}, 'days': {AAAAMMJJ: {'TN','TX','RR'}}}} ; TN/TX = le plus bas et le plus haut des relevés du jour (au moins 2)"""
    st, temps, rains = {}, {}, {}
    for r in insitu_records(files):
        q = _col(r, 'quality_flag')
        if q not in (None, '') and q.strip() in ('1', 'failed'):
            continue
        code = _col(r, 'primary_station_id', 'station_id', 'station_name')
        when = _col(r, 'report_timestamp', 'date_time', 'observation_time', 'time')
        var = (_col(r, 'observed_variable', 'variable') or '').lower()
        val = _col(r, 'observation_value', 'value')
        if not code or not when or val is None:
            continue
        try:
            x = float(val)
            d = datetime.date.fromisoformat(when.strip()[:10])
        except ValueError:
            continue
        if not (years[0] <= d.year <= years[1]):
            continue
        unit = (_col(r, 'units', 'unit') or '').lower()
        if code not in st:
            try:
                lat, lon = float(_col(r, 'latitude')), float(_col(r, 'longitude'))
            except (TypeError, ValueError):
                continue
            alt = _col(r, 'height_of_station_above_sea_level', 'station_elevation', 'altitude', 'elevation')
            st[code] = {'code': code, 'nom': _col(r, 'station_name') or code, 'lat': lat, 'lon': lon, 'alt': float(alt) if alt not in (None, '') and re.match(r'^-?[\d.]+$', alt) else None, 'pays': ''}
        key = d.year * 10000 + d.month * 100 + d.day
        if 'temperature' in var:
            c = x - 273.15 if (unit.startswith('k') or x > 150) else x
            if -60 < c < 60:
                temps.setdefault(code, {}).setdefault(key, []).append(c)
        elif 'precipitation' in var:
            mm = x * 1000 if unit in ('m', 'metre', 'meter') else x
            if 0 <= mm < 1000:
                rains.setdefault(code, {}).setdefault(key, []).append(mm)
    out = {}
    for code, meta in st.items():
        days = {}
        for key, xs in temps.get(code, {}).items():
            if len(xs) >= 2:
                days.setdefault(key, {}).update({'TN': int(round(min(xs) * 10)), 'TX': int(round(max(xs) * 10))})
        for key, xs in rains.get(code, {}).items():
            days.setdefault(key, {})['RR'] = int(round(sum(xs) * 10))
        if days:
            out[code] = {'meta': meta, 'days': days}
    return out


def build_insitu(out, years, fetcher, test=False, log=say):
    kind = 'plus-anciennes'
    dl = os.path.join(out, 'telechargements', kind)
    os.makedirs(dl, exist_ok=True)
    os.makedirs(os.path.join(out, 'travail'), exist_ok=True)
    w = Work(os.path.join(out, 'travail', f'{kind}.sqlite'), kind, INSITU['title'])
    y0, y1 = max(INSITU['first'], years[0]), min(INSITU['last'], years[1])
    if test:
        y0 = y1
    form = fetcher.form(INSITU['dataset']) if hasattr(fetcher, 'form') else None
    for y in range(y0, y1 + 1):
        step = f'annee-{y}'
        if w.done(step):
            continue
        req = dict(INSITU['req'])
        req.update({'year': str(y), 'month': [f'{m:02d}' for m in range(1, 13)], 'day': DAYS, 'area': list(INSITU['area'])})
        if form:  # la version la plus récente, et seulement les données libres (« open »)
            if 'version' in form and enum_of(form['version']):
                req['version'] = sorted(enum_of(form['version']))[-1]
            for k, prefs in INSITU['prefer'].items():
                allowed = enum_of(form.get(k)) if k in form else None
                if allowed:
                    pick = [p for p in prefs if p in allowed]
                    if not pick:
                        raise Stop(f'Copernicus : pas de choix « {"/".join(prefs)} » pour « {k} » ({", ".join(allowed)}) — vérifie la licence avant de fabriquer.')
                    req[k] = pick[:1]
        else:
            req['usage_restrictions'] = ['open']
        months = [list(range(1, 13))]
        got = []
        while months:
            ms = months.pop(0)
            label = f'{y}' if len(ms) == 12 else f'{y}-{ms[0]:02d}-{ms[-1]:02d}'
            if w.done(f'morceau-{label}'):
                got.append(os.path.join(dl, f'{kind}-{label}.zip'))
                continue
            target = os.path.join(dl, f'{kind}-{label}.zip')
            r = dict(req, month=[f'{m:02d}' for m in ms])
            if not os.path.exists(target):
                log(f'     {kind} {label}…')
                try:
                    fetcher.retrieve(INSITU['dataset'], r, target + '.part')
                    os.replace(target + '.part', target)
                except TooLarge:
                    if len(ms) == 1:
                        raise Stop(f'Copernicus refuse même un mois ({label}) : « Request too large ».')
                    log(f'     ↳ « trop gros » pour Copernicus : {label} est recoupé en deux')
                    months[:0] = [ms[:len(ms) // 2], ms[len(ms) // 2:]]
                    continue
                except Exception as e:  # noqa: BLE001
                    if NO_DATA.search(str(e)):
                        log(f'     {label} : rien chez Copernicus')
                        w.mark(f'morceau-{label}')
                        continue
                    raise
            got.append(target)
        files = []
        for t in got:
            if os.path.exists(t):
                files += unpack(t, t + '.d')
        n = 0
        for code, s in parse_insitu(files, (y, y)).items():
            sid = w.db.execute('SELECT id FROM stations WHERE source=? AND code=?', ('c3s-insitu', code)).fetchone()
            if sid:
                sid = sid[0]
            else:
                m = s['meta']
                sid = w.db.execute('INSERT INTO stations(source, code, nom, pays, lat, lon, alt) VALUES(?,?,?,?,?,?,?)', ('c3s-insitu', code, m['nom'], m['pays'], m['lat'], m['lon'], m['alt'])).lastrowid
            nd = F.days_in_year(y)
            d0 = datetime.date(y, 1, 1)
            cols = {c: [None] * nd for c in ('TN', 'TX', 'RR')}
            for key, v in s['days'].items():
                j = (datetime.date(key // 10000, key // 100 % 100, key % 100) - d0).days
                for c, x in v.items():
                    cols[c][j] = x
            w.db.execute('INSERT OR REPLACE INTO daily(station_id, annee, blob) VALUES(?,?,?)', (sid, y, F.encode([(c, cols[c]) for c in ('TN', 'TX', 'RR') if any(x is not None for x in cols[c])])))
            w.db.execute('UPDATE stations SET debut=MIN(COALESCE(debut, ?), ?), fin=MAX(COALESCE(fin, ?), ?) WHERE id=?', (y, y, y, y, sid))
            n += 1
        w.db.commit()
        w.mark(step)
        for t in got:
            shutil.rmtree(t + '.d', ignore_errors=True)
            if os.path.exists(t):
                os.remove(t)
        if n:
            log(f'   • {kind} {y} : {n} station{"s" if n > 1 else ""}')
    path = os.path.join(out, f'meteo-{kind}.sqlite')
    if os.path.exists(path):
        os.remove(path)
    db = F.open_db(path, kind, INSITU['title'])
    F.set_meta(db, countries='EUROPE', plus='1')
    F.add_sources(db, ['c3s-insitu'], datetime.date.today().year)
    for row in w.db.execute('SELECT id, source, code, nom, pays, lat, lon, alt, debut, fin FROM stations WHERE debut IS NOT NULL').fetchall():
        db.execute('INSERT INTO stations(id, source, code, nom, pays, lat, lon, alt, debut, fin) VALUES(?,?,?,?,?,?,?,?,?,?)', row)
        for y, blob in w.db.execute('SELECT annee, blob FROM daily WHERE station_id=?', (row[0],)):
            db.execute('INSERT INTO daily(station_id, annee, blob) VALUES(?,?,?)', (row[0], y, blob))
    db.commit()
    db.close()
    return finish_pack(path, out, kind, log)


# ═══════════════════════ Entrée (appelée par build-meteo.py) ═══════════════════════
def build(kind, out, years, offline=None, test=False, log=say):
    if kind == 'plus-eobs':
        raise Stop('E-OBS n’est pas fabriqué : sa licence le réserve à la recherche et à l’enseignement non commerciaux (pas de redistribution dans un pack public).')
    if kind not in KINDS:
        raise Stop(f'Complément inconnu : {kind}')
    try:
        import netCDF4  # noqa: F401
    except ImportError:
        raise Stop('Les compléments Copernicus ont besoin de la bibliothèque netCDF4 : tape « pip3 install netCDF4 cdsapi ».')
    server = 'cds' if kind == 'plus-anciennes' else SPECS[kind]['server']
    fetcher = Offline(offline) if offline else CDS(server)
    log(f'Complément Copernicus : {kind} ({(INSITU if kind == "plus-anciennes" else SPECS[kind])["title"]})')
    if kind == 'plus-anciennes':
        return build_insitu(out, years, fetcher, test, log)
    return GridBuilder(kind, out, years, fetcher, test, log).run()
