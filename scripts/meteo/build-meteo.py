#!/usr/bin/env python3
"""LCNDA — 🌦 Météo d'autrefois : le FABRICANT des données (à lancer une fois, sur un ordinateur qui a Internet).

Mode d'emploi pas à pas, en français simple : docs/METEO.md. En bref :

    python3 scripts/meteo/build-meteo.py --test        # essai rapide : le Gers (32) et une seule année (≈ 5 minutes)
    python3 scripts/meteo/build-meteo.py socle         # le socle livré avec l'app (≈ 550 Mo, plusieurs heures)
    python3 scripts/meteo/build-meteo.py complet       # le pack complet (≈ 3 Go, une nuit ou plus)
    python3 scripts/meteo/build-meteo.py europe        # le pack Europe (≈ 2 Go, une nuit ou plus)
    python3 scripts/meteo/build-meteo.py tout          # les trois
    python3 scripts/meteo/build-meteo.py altitudes     # seulement la grille des altitudes (≈ 2–3 Mo, rangée dans le socle ; faite aussi avec « socle »)

Options utiles :
    --dossier meteo-sortie     où tout est rangé (téléchargements, travail, fichiers finis) — par défaut ./meteo-sortie
    --sans-era5 / --sans-20cr  sans les réanalyses (pas besoin de compte Copernicus ni de netCDF4)
    --sans-altitudes           sans la grille des altitudes (Copernicus DEM GLO-90) ; --altitudes-europe : aussi celle de l'Europe (pack Europe)
    --stations 300             combien de stations dans le socle
    --hors-ligne DOSSIER       ne télécharge rien : lit les fichiers déjà posés dans DOSSIER (essais, tests)
    --meteolux-csv FICHIER     le fichier de MeteoLux (Findel) téléchargé à la main, si l'adresse automatique ne marche plus
    --depuis 1836 / --jusqu-a 2025   les années à fabriquer

Le programme REPREND où il s'était arrêté : les fichiers déjà téléchargés et les étapes déjà finies sont gardés
(dossier meteo-sortie/telechargements et meteo-sortie/travail). Pour tout refaire : supprime le dossier meteo-sortie.

Bibliothèques : seulement celles de Python, sauf pour les réanalyses (facultatives) :
    ERA5 (Copernicus)  : pip install cdsapi netCDF4   + un compte gratuit et une clé (docs/METEO.md)
    20CRv3 (NOAA)      : pip install netCDF4
Le format des fichiers produits est décrit dans docs/UI.md (« 🌦 Météo d'autrefois ») et dans meteo_format.py.
"""
import argparse
import csv
import datetime
import gzip
import io
import json
import math
import os
import re
import shutil
import sqlite3
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
import zlib

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import meteo_format as F  # noqa: E402

# ═══════════════════════ Les adresses (à corriger ici si une source déménage) ═══════════════════════
# Météo-France (meteo.data.gouv.fr) : jeux « Données climatologiques de base » sur data.gouv.fr (Licence Ouverte 2.0)
MF_DAILY_DATASET_API = 'https://www.data.gouv.fr/api/1/datasets/donnees-climatologiques-de-base-quotidiennes/'
MF_HOURLY_DATASET_API = 'https://www.data.gouv.fr/api/1/datasets/donnees-climatologiques-de-base-horaires/'
# MétéoSuisse : stations NBCN (catalogue STAC de geo.admin.ch, CC BY 4.0)
CH_STAC_ITEMS = 'https://data.geo.admin.ch/api/stac/v1/collections/ch.meteoschweiz.ogd-nbcn/items?limit=100'
CH_STAC_COLLECTION = 'https://data.geo.admin.ch/api/stac/v1/collections/ch.meteoschweiz.ogd-nbcn'
# IRM / KMI : stations automatiques (WFS, CC BY 4.0)
IRM_WFS = 'https://opendata.meteo.be/service/aws/ows'
IRM_STATIONS = IRM_WFS + '?service=WFS&version=2.0.0&request=GetFeature&typenames=aws:aws_station&outputFormat=csv'
IRM_DAILY = IRM_WFS + '?service=WFS&version=2.0.0&request=GetFeature&typenames=aws:aws_1day&outputFormat=csv&count={count}&startIndex={start}'
# MeteoLux : Luxembourg-Findel (data.public.lu, CC0)
LU_DATASET_API = 'https://data.public.lu/api/1/datasets/climatological-daily-data-luxembourg-findel/'
LU_FINDEL = ('Luxembourg – Findel', 49.6266, 6.2045, 376.0)
# Copernicus DEM GLO-90 (altitudes, carrés de 1° en GeoTIFF « COG » sur AWS Open Data ; absents en pleine mer)
COPDEM_URL = 'https://copernicus-dem-90m.s3.amazonaws.com/{name}/{name}.tif'
COPDEM_NAME = 'Copernicus_DSM_COG_30_{ns}{lat:02d}_00_{ew}{lon:03d}_00_DEM'
# DWD (Allemagne, pack Europe) : relevés quotidiens « KL »
DWD_KL_HIST = 'https://opendata.dwd.de/climate_environment/CDC/observations_germany/climate/daily/kl/historical/'
DWD_KL_STATIONS = DWD_KL_HIST + 'KL_Tageswerte_Beschreibung_Stationen.txt'
# 20CRv3 (NOAA PSL) : fichiers quotidiens, lus par OPeNDAP (seule la boîte voulue voyage), sinon téléchargés en entier
C20_OPENDAP = 'https://psl.noaa.gov/thredds/dodsC/Datasets/20thC_ReanV3/Dailies/'
C20_HTTP = 'https://downloads.psl.noaa.gov/Datasets/20thC_ReanV3/Dailies/'
C20_FILES = {'TN': ('2mSI/tmin.2m.{year}.nc', 'tmin'), 'TX': ('2mSI/tmax.2m.{year}.nc', 'tmax'),
             'RR': ('sfcSI/prate.{year}.nc', 'prate'), 'NN': ('miscSI/tcdc.eatm.{year}.nc', 'tcdc')}
# ERA5 (Copernicus CDS) : bibliothèque cdsapi + clé dans ~/.cdsapirc
ERA5_DAILY_DATASET = 'derived-era5-single-levels-daily-statistics'
ERA5_HOURLY_DATASET = 'reanalysis-era5-single-levels'

# Les boîtes (nord, ouest, sud, est)
BOX_4 = (51.6, -5.5, 41.2, 10.6)          # France, Belgique, Suisse, Luxembourg
BOX_EUROPE = (71.5, -25.0, 34.0, 45.0)
COUNTRY_BOXES = {'FR': (51.1, -5.2, 41.3, 9.6), 'BE': (51.55, 2.5, 49.45, 6.45), 'CH': (47.85, 5.9, 45.8, 10.5), 'LU': (50.2, 5.7, 49.4, 6.55)}
DEPARTEMENTS = [f'{i:02d}' for i in range(1, 96) if i != 20] + ['2A', '2B'] + ['971', '972', '973', '974', '975', '976', '984', '985', '986', '987', '988']
UA = 'LCNDA-meteo/1.0 (+https://github.com ; fabricant des données météo d’une app de généalogie)'


class Stop(Exception):
    """une erreur claire, en français, pour quelqu'un qui n'est pas développeur"""


def plural(n, w):
    return f'{n} {w}{"s" if n > 1 else ""}'


def size_text(b):
    return f'{b / 1e6:,.0f} Mo'.replace(',', ' ') if b >= 1e6 else f'{max(1, round(b / 1e3))} Ko'


def say(*a):
    print(*a, flush=True)


# ═══════════════════════ Télécharger (avec reprise) ═══════════════════════
class Net:
    def __init__(self, cache, offline=None):
        self.cache = cache
        self.offline = offline
        os.makedirs(cache, exist_ok=True)

    def path(self, name):
        return os.path.join(self.offline or self.cache, name)

    def get(self, url, name, what='', binary=True, missing_ok=False):
        """télécharge une fois (reprise d'un fichier .part) → chemin du fichier gardé ; missing_ok : None si la source n'a pas ce fichier"""
        dest = self.path(name)
        if os.path.exists(dest) and os.path.getsize(dest) > 0:
            return dest
        if missing_ok and os.path.exists(dest + '.absent'):
            return None
        if self.offline:
            if missing_ok:
                return None
            raise Stop(f'Mode hors ligne : le fichier « {name} » manque dans {self.offline}.')
        part = dest + '.part'
        for attempt in range(4):
            try:
                have = os.path.getsize(part) if os.path.exists(part) else 0
                req = urllib.request.Request(url, headers={'User-Agent': UA, **({'Range': f'bytes={have}-'} if have else {})})
                with urllib.request.urlopen(req, timeout=120) as r, open(part, 'ab' if have and r.status == 206 else 'wb') as out:
                    shutil.copyfileobj(r, out, 1 << 20)
                os.replace(part, dest)
                return dest
            except urllib.error.HTTPError as e:
                if e.code == 416 and os.path.exists(part):
                    os.replace(part, dest)
                    return dest
                if missing_ok and e.code in (403, 404):
                    open(dest + '.absent', 'w').close()
                    return None
                if e.code in (404, 410):
                    raise Stop(f'{what or name} : l’adresse n’existe plus (erreur {e.code}).\n  Adresse : {url}\n'
                               '  La source a peut-être déménagé : corrige l’adresse en haut de build-meteo.py (constantes en MAJUSCULES).')
                err = f'erreur {e.code}'
            except (urllib.error.URLError, TimeoutError, ConnectionError, OSError) as e:
                err = str(getattr(e, 'reason', e))
            wait = 5 * (attempt + 1)
            say(f'   … {what or name} : {err} — nouvel essai dans {wait} s')
            time.sleep(wait)
        raise Stop(f'{what or name} : téléchargement impossible ({err}).\n  Adresse : {url}\n  Vérifie la connexion à Internet, puis relance : le programme reprendra où il en était.')

    def json(self, url, name, what=''):
        with open(self.get(url, name, what), 'rb') as f:
            return json.loads(f.read().decode('utf-8'))


def open_text(path):
    """lit un fichier texte (.csv, .csv.gz, .txt, ou le premier .txt/.csv d'un .zip), en UTF-8 ou Windows-1252"""
    if path.endswith('.gz'):
        raw = gzip.open(path, 'rb').read()
    elif path.endswith('.zip'):
        with zipfile.ZipFile(path) as z:
            names = [n for n in z.namelist() if re.search(r'(produkt|\.csv$)', n)] or z.namelist()
            raw = z.read(names[0])
    else:
        raw = open(path, 'rb').read()
    for enc in ('utf-8-sig', 'cp1252', 'latin-1'):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode('latin-1', 'replace')


# ═══════════════════════ Lire les sources (fonctions pures : testées par tests/test_meteo_builder.py) ═══════════════════════
def num(v):
    v = (v or '').strip().replace(',', '.')
    if v in ('', '-', 'NA', 'nan', 'NaN', '-999', '-999.0', '-9999'):
        return None
    try:
        return float(v)
    except ValueError:
        return None


def tenth(v):
    return None if v is None else int(round(v * 10))


def day_length_min(lat, doy):
    """durée du jour (minutes) : pour estimer les nuages d'après le soleil quand la station ne les note pas"""
    decl = 23.44 * math.sin(math.radians(360 / 365 * (doy - 81)))
    x = -math.tan(math.radians(lat)) * math.tan(math.radians(decl))
    x = max(-1.0, min(1.0, x))
    return 2 * math.degrees(math.acos(x)) / 15 * 60


def fill_clouds(days, lat):
    """nuages manquants : d'après la durée de soleil (100 % = pas de soleil)"""
    for d, v in days.items():
        if v.get('NN') is None and v.get('SS') is not None:
            dl = day_length_min(lat, datetime.date(d // 10000, d // 100 % 100, d % 100).timetuple().tm_yday)
            v['NN'] = int(max(0, min(100, round(100 - v['SS'] / max(1, dl) * 110))))
    return days


def parse_meteofrance_daily(text, extra_text=None):
    """CSV quotidiens de Météo-France (« Q_32_…_RR-T-Vent.csv.gz » et « Q_32_…_autres-parametres.csv.gz »)
    → {code: {'meta': {...}, 'days': {AAAAMMJJ: {TN, TX, RR, FX, SS, SN, WW, NN}}}}"""
    out = {}
    rows = csv.DictReader(io.StringIO(text), delimiter=';')
    for r in rows:
        code = (r.get('NUM_POSTE') or '').strip()
        date = (r.get('AAAAMMJJ') or '').strip()
        if not code or not re.match(r'^\d{8}$', date):
            continue
        st = out.get(code)
        if st is None:
            st = out[code] = {'meta': {'code': code, 'nom': (r.get('NOM_USUEL') or code).strip().title().replace(' - ', ' – '), 'pays': 'FR',
                                       'lat': num(r.get('LAT')), 'lon': num(r.get('LON')), 'alt': num(r.get('ALTI'))}, 'days': {}}
        fx = num(r.get('FXI')) if num(r.get('FXI')) is not None else num(r.get('FXY'))
        st['days'][int(date)] = {'TN': tenth(num(r.get('TN'))), 'TX': tenth(num(r.get('TX'))), 'RR': tenth(num(r.get('RR'))), 'FX': tenth(fx)}
    if extra_text:
        for r in csv.DictReader(io.StringIO(extra_text), delimiter=';'):
            code = (r.get('NUM_POSTE') or '').strip(); date = (r.get('AAAAMMJJ') or '').strip()
            if code not in out or not re.match(r'^\d{8}$', date):
                continue
            v = out[code]['days'].setdefault(int(date), {})
            inst = num(r.get('INST'))
            if inst is not None:
                v['SS'] = int(round(inst))
            sn = num(r.get('HNEIGEF')) if num(r.get('HNEIGEF')) is not None else num(r.get('NEIGETOT'))
            if sn is not None:
                v['SN'] = int(round(sn))
            ww = 0
            for col, bit in (('BROU', F.WW_FOG), ('ORAG', F.WW_STORM), ('GRELE', F.WW_HAIL), ('NEIG', F.WW_SNOW), ('VERGLAS', F.WW_ICE), ('GELEE', F.WW_ICE), ('BRUME', F.WW_MIST)):
                if (num(r.get(col)) or 0) > 0:
                    ww |= bit
            v['WW'] = ww
    for st in out.values():
        if st['meta']['lat'] is not None:
            fill_clouds(st['days'], st['meta']['lat'])
    return out


WW_SYNOP = [(range(40, 50), F.WW_FOG), (range(91, 100), F.WW_STORM), (range(17, 18), F.WW_STORM), (range(87, 91), F.WW_HAIL), (range(70, 80), F.WW_SNOW), (range(83, 87), F.WW_SNOW), (range(10, 11), F.WW_MIST)]


def parse_meteofrance_hourly(text):
    """CSV horaires de Météo-France (« H_32_….csv.gz ») → {code: {'meta', 'hours': {AAAAMMJJHH: {T, RR, FX, NN, WW}}}}"""
    out = {}
    for r in csv.DictReader(io.StringIO(text), delimiter=';'):
        code = (r.get('NUM_POSTE') or '').strip(); dh = (r.get('AAAAMMJJHH') or '').strip()
        if not code or not re.match(r'^\d{10}$', dh):
            continue
        st = out.setdefault(code, {'meta': {'code': code, 'nom': (r.get('NOM_USUEL') or code).strip().title(), 'pays': 'FR', 'lat': num(r.get('LAT')), 'lon': num(r.get('LON')), 'alt': num(r.get('ALTI'))}, 'hours': {}})
        n = num(r.get('N'))
        ww = 0
        code_ww = num(r.get('WW'))
        if code_ww is not None:
            for rg, bit in WW_SYNOP:
                if int(code_ww) in rg:
                    ww |= bit
        st['hours'][int(dh)] = {'T': tenth(num(r.get('T'))), 'RR': tenth(num(r.get('RR1'))), 'FX': tenth(num(r.get('FXI'))),
                                'NN': None if n is None else int(round(min(8, n) / 8 * 100)), 'WW': ww}
    return out


def parse_meteoswiss_meta(text):
    """ogd-nbcn_meta_stations.csv (ou l'ancien liste des stations NBCN) → {abréviation: meta}"""
    out = {}
    sample = text[:2000]
    delim = ';' if sample.count(';') > sample.count(',') else ','
    for r in csv.DictReader(io.StringIO(text), delimiter=delim):
        k = {kk.strip().lower(): (vv or '').strip() for kk, vv in r.items() if kk}
        abbr = k.get('station_abbr') or k.get('stn') or k.get('abbr')
        if not abbr:
            continue
        lat = num(k.get('station_coordinates_wgs84_lat') or k.get('latitude') or k.get('lat'))
        lon = num(k.get('station_coordinates_wgs84_lon') or k.get('longitude') or k.get('lon'))
        out[abbr.upper()] = {'code': abbr.upper(), 'nom': k.get('station_name') or k.get('station') or abbr, 'pays': 'CH', 'lat': lat, 'lon': lon,
                             'alt': num(k.get('station_height_masl') or k.get('altitude') or k.get('height'))}
    return out


CH_COLS = {'tre200dn': ('TN', 10), 'tre200dx': ('TX', 10), 'rre150d0': ('RR', 10), 'sre000d0': ('SS', 1), 'nto000d0': ('NN', 1), 'hto000d0': ('SN', 1), 'fkl010d1': ('FX', 10)}


def parse_meteoswiss_daily(text):
    """CSV quotidien NBCN (nouveau format « ogd-nbcn_gve_d_historical.csv » ; aussi l'ancien « stn time … ») → {AAAAMMJJ: valeurs}"""
    days = {}
    lines = text.splitlines()
    head = next((i for i, l in enumerate(lines) if re.match(r'^\s*(station_abbr|stn)\b', l)), None)
    if head is None:
        return days
    delim = ';' if ';' in lines[head] else None
    def split(l):
        return [x.strip() for x in (l.split(';') if delim else l.split())]
    cols = split(lines[head])
    for l in lines[head + 1:]:
        if not l.strip():
            continue
        v = dict(zip(cols, split(l)))
        t = v.get('reference_timestamp') or v.get('time') or ''
        m = re.match(r'^(\d{2})\.(\d{2})\.(\d{4})', t)
        date = int(f'{m.group(3)}{m.group(2)}{m.group(1)}') if m else (int(t[:8]) if re.match(r'^\d{8}', t) else None)
        if not date:
            continue
        row = {}
        for col, (k, f) in CH_COLS.items():
            x = num(v.get(col))
            row[k] = None if x is None else int(round(x * f))
        days[date] = row
    return days


def parse_irm(stations_text, daily_text):
    """IRM / KMI (WFS en CSV) : aws_station + aws_1day → {code: {'meta', 'days'}}"""
    out = {}
    for r in csv.DictReader(io.StringIO(stations_text)):
        code = (r.get('code') or '').strip()
        g = re.search(r'POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)', r.get('the_geom') or '')
        if not code or not g:
            continue
        a, b = float(g.group(1)), float(g.group(2))
        lat, lon = (a, b) if a > b else (b, a)  # selon le serveur, POINT(lat lon) ou POINT(lon lat)
        out[code] = {'meta': {'code': code, 'nom': (r.get('name') or code).strip().title(), 'pays': 'BE', 'lat': lat, 'lon': lon, 'alt': num(r.get('altitude'))}, 'days': {}}
    for r in csv.DictReader(io.StringIO(daily_text)):
        code = (r.get('code') or '').strip(); t = (r.get('timestamp') or '')[:10]
        if code not in out or not re.match(r'^\d{4}-\d{2}-\d{2}$', t):
            continue
        sun = num(r.get('sun_duration'))
        out[code]['days'][int(t.replace('-', ''))] = {'TN': tenth(num(r.get('temp_min'))), 'TX': tenth(num(r.get('temp_max'))), 'RR': tenth(num(r.get('precip_quantity'))),
                                                       'FX': tenth(num(r.get('wind_gusts_speed'))), 'SS': None if sun is None else int(round(sun))}
    for st in out.values():
        fill_clouds(st['days'], st['meta']['lat'])
    return out


def parse_dwd_kl(text):
    """DWD « produkt_klima_tag_….txt » → {AAAAMMJJ: valeurs} (−999 = manquant)"""
    days = {}
    rows = csv.reader(io.StringIO(text), delimiter=';')
    head = [h.strip() for h in next(rows, [])]
    for r in rows:
        v = dict(zip(head, [x.strip() for x in r]))
        d = v.get('MESS_DATUM', '')
        if not re.match(r'^\d{8}$', d):
            continue
        sdk, nm = num(v.get('SDK')), num(v.get('NM'))
        days[int(d)] = {'TN': tenth(num(v.get('TNK'))), 'TX': tenth(num(v.get('TXK'))), 'RR': tenth(num(v.get('RSK'))), 'FX': tenth(num(v.get('FX'))),
                        'SS': None if sdk is None else int(round(sdk * 60)), 'NN': None if nm is None else int(round(min(8, nm) / 8 * 100)),
                        'SN': None if num(v.get('SHK_TAG')) is None else int(num(v.get('SHK_TAG')))}
    return days


def parse_generic_daily(text):
    """un CSV quotidien « date ; Tmin ; Tmax ; pluie… » (MeteoLux, ou tout fichier posé à la main) : colonnes reconnues par leur nom"""
    sample = text[:3000]
    delim = max([';', ',', '\t'], key=sample.count)
    rows = list(csv.reader(io.StringIO(text), delimiter=delim))
    if not rows:
        return {}
    head = [h.strip().lower() for h in rows[0]]
    def col(*keys):
        for i, h in enumerate(head):
            if any(k in h for k in keys):
                return i
        return None
    ci = {'date': col('date', 'jour', 'day'), 'TN': col('tmin', 't_min', 'tn', 'minimum'), 'TX': col('tmax', 't_max', 'tx', 'maximum'),
          'RR': col('precip', 'rr', 'pluie', 'rain', 'niederschlag'), 'SS': col('sun', 'soleil', 'insol'), 'FX': col('gust', 'rafale', 'fx')}
    days = {}
    for r in rows[1:]:
        if ci['date'] is None or ci['date'] >= len(r):
            continue
        t = r[ci['date']].strip()
        m = re.match(r'^(\d{4})-?(\d{2})-?(\d{2})', t) or re.match(r'^(\d{2})[./](\d{2})[./](\d{4})', t)
        if not m:
            continue
        y, mo, d = (m.group(1), m.group(2), m.group(3)) if len(m.group(1)) == 4 else (m.group(3), m.group(2), m.group(1))
        g = lambda k: num(r[ci[k]]) if ci[k] is not None and ci[k] < len(r) else None
        days[int(f'{y}{mo}{d}')] = {'TN': tenth(g('TN')), 'TX': tenth(g('TX')), 'RR': tenth(g('RR')), 'FX': tenth(g('FX')),
                                    'SS': None if g('SS') is None else int(round(g('SS') * (60 if (g('SS') or 0) < 24 else 1)))}
    return days


# ═══════════════════════ Ranger en blocs (une année = un bloc par série) ═══════════════════════
DAILY_COLS = ['TN', 'TX', 'RR', 'SN', 'FX', 'NN', 'SS', 'WW']


def year_blobs(days, cols=DAILY_COLS):
    """{AAAAMMJJ: valeurs} → {année: (bloc, nombre de jours avec une température)}"""
    by_year = {}
    for d, v in days.items():
        by_year.setdefault(d // 10000, {})[d] = v
    out = {}
    for y, dd in by_year.items():
        n = F.days_in_year(y)
        d0 = datetime.date(y, 1, 1)
        arr = {c: [None] * n for c in cols}
        good = 0
        for d, v in dd.items():
            try:
                i = (datetime.date(y, d // 100 % 100, d % 100) - d0).days
            except ValueError:
                continue
            for c in cols:
                if v.get(c) is not None:
                    arr[c][i] = v[c]
            if v.get('TN') is not None or v.get('TX') is not None:
                good += 1
        used = [(c, arr[c]) for c in cols if any(x is not None for x in arr[c])]
        if used:
            out[y] = (F.encode(used), good, arr)
    return out


def hour_blobs(hours, step=1, cols=('T', 'RR', 'FX', 'NN', 'WW')):
    """{AAAAMMJJHH: valeurs} → {année: bloc} (une ligne toutes les « step » heures, 0 h UTC le 1er janvier en premier)"""
    by_year = {}
    for dh, v in hours.items():
        by_year.setdefault(dh // 1000000, {})[dh] = v
    out = {}
    per = 24 // step
    for y, hh in by_year.items():
        n = F.days_in_year(y) * per
        d0 = datetime.date(y, 1, 1)
        arr = {c: [None] * n for c in cols}
        for dh, v in hh.items():
            h = dh % 100
            if h % step:
                continue
            try:
                i = (datetime.date(y, dh // 10000 % 100, dh // 100 % 100) - d0).days * per + h // step
            except ValueError:
                continue
            for c in cols:
                if v.get(c) is not None:
                    arr[c][i] = v[c]
        used = [(c, arr[c]) for c in cols if any(x is not None for x in arr[c])]
        if used:
            out[y] = F.encode(used, step=step)
    return out


# ═══════════════════════ Le travail : une base de stations (toutes) ═══════════════════════
class Work:
    """meteo-sortie/travail/stations.sqlite : toutes les stations lues, avec leurs blocs (devient le pack complet)"""

    def __init__(self, path):
        new = not os.path.exists(path)
        self.db = F.open_db(path, 'complet', 'Pack complet')
        self.db.execute('CREATE TABLE IF NOT EXISTS done(step TEXT PRIMARY KEY, at TEXT)')
        self.db.execute('CREATE TABLE IF NOT EXISTS score(station_id INTEGER PRIMARY KEY, years INTEGER, good INTEGER, first INTEGER, last INTEGER)')
        if new:
            self.db.commit()

    def done(self, step):
        return self.db.execute('SELECT 1 FROM done WHERE step=?', (step,)).fetchone() is not None

    def mark(self, step):
        self.db.execute('INSERT OR REPLACE INTO done(step, at) VALUES(?, ?)', (step, datetime.datetime.now().isoformat(timespec='seconds')))
        self.db.commit()

    def station_id(self, source, meta):
        row = self.db.execute('SELECT id FROM stations WHERE source=? AND code=?', (source, meta['code'])).fetchone()
        if row:
            return row[0]
        cur = self.db.execute('INSERT INTO stations(source, code, nom, pays, lat, lon, alt) VALUES(?,?,?,?,?,?,?)',
                              (source, meta['code'], meta['nom'], meta.get('pays', ''), meta['lat'], meta['lon'], meta.get('alt')))
        return cur.lastrowid

    def add_daily(self, source, meta, days, years=None):
        if meta.get('lat') is None or meta.get('lon') is None or not days:
            return 0
        sid = self.station_id(source, meta)
        n = 0
        for y, (blob, good, _) in year_blobs(days).items():
            if years and not (years[0] <= y <= years[1]):
                continue
            old = self.db.execute('SELECT blob FROM daily WHERE station_id=? AND annee=?', (sid, y)).fetchone()
            if old:  # même année venue de deux fichiers (« previous » et « latest ») : on fusionne
                _, prev = F.decode(old[0])
                cols = {c: list(v) for c, v in prev.items()}
                _, new = F.decode(blob)
                for c, vals in new.items():
                    base = cols.setdefault(c, [None] * len(vals))
                    for i, x in enumerate(vals):
                        if x is not None:
                            base[i] = x
                blob = F.encode([(c, cols[c]) for c in DAILY_COLS if c in cols])
            self.db.execute('INSERT OR REPLACE INTO daily(station_id, annee, blob) VALUES(?,?,?)', (sid, y, blob))
            n += 1
        self.db.execute('UPDATE stations SET debut=(SELECT MIN(annee) FROM daily WHERE station_id=?), fin=(SELECT MAX(annee) FROM daily WHERE station_id=?) WHERE id=?', (sid, sid, sid))
        return n

    def add_hourly(self, source, meta, hours, step=1):
        if meta.get('lat') is None or not hours:
            return 0
        sid = self.station_id(source, meta)
        n = 0
        for y, blob in hour_blobs(hours, step).items():
            self.db.execute('INSERT OR REPLACE INTO hourly(station_id, annee, blob) VALUES(?,?,?)', (sid, y, blob))
            n += 1
        self.db.execute('UPDATE stations SET heures_debut=(SELECT MIN(annee) FROM hourly WHERE station_id=?) WHERE id=?', (sid, sid))
        return n

    def compute_scores(self):
        self.db.execute('DELETE FROM score')
        for (sid,) in self.db.execute('SELECT id FROM stations').fetchall():
            years = good = 0
            first = last = None
            for y, blob in self.db.execute('SELECT annee, blob FROM daily WHERE station_id=?', (sid,)):
                _, v = F.decode(blob)
                g = sum(1 for a, b in zip(v.get('TN', []), v.get('TX', [])) if a is not None or b is not None)
                if g >= 300:
                    years += 1
                good += g
                first = y if first is None else min(first, y)
                last = y if last is None else max(last, y)
            self.db.execute('INSERT INTO score(station_id, years, good, first, last) VALUES(?,?,?,?,?)', (sid, years, good, first, last))
        self.db.commit()


def select_stations(rows, n=300, quotas=None, min_km=45.0):
    """Les meilleures stations, bien réparties : rows = [(id, pays, lat, lon, années complètes, première année)].
    Score = années complètes (+ bonus aux séries très anciennes) ; une station n'est prise que si aucune déjà prise n'est à
    moins de min_km (la distance baisse si on n'arrive pas à n). quotas = {pays: part} : chaque pays a sa part."""
    rows = [r for r in rows if r[4] > 0]
    score = lambda r: r[4] + max(0, 1900 - (r[5] or 1900)) * 0.5
    rows.sort(key=score, reverse=True)
    if quotas is None:
        quotas = {}
    picked = []
    def far(r, d):
        return all(haversine(r[2], r[3], p[2], p[3]) >= d for p in picked)
    want = {c: max(1, round(n * q)) for c, q in quotas.items()}
    d = min_km
    while len(picked) < n and d >= 5:
        for r in rows:
            if len(picked) >= n:
                break
            if r in picked:
                continue
            c = r[1]
            if c in want and sum(1 for p in picked if p[1] == c) >= want[c] and d >= min_km * 0.5:
                continue
            if far(r, d):
                picked.append(r)
        d *= 0.7
    return [r[0] for r in picked[:n]]


def haversine(a, b, c, d):
    p = math.pi / 180
    x = math.sin((c - a) * p / 2) ** 2 + math.cos(a * p) * math.cos(c * p) * math.sin((d - b) * p / 2) ** 2
    return 2 * 6371 * math.asin(min(1, math.sqrt(x)))


# ═══════════════════════ Les sources, une par une ═══════════════════════
def mf_resources(net, api, kind):
    """la liste des fichiers d'un jeu data.gouv.fr (titre, adresse)"""
    if net.offline:
        return [(f, os.path.join(net.offline, f)) for f in sorted(os.listdir(net.offline))]
    d = net.json(api, f'datagouv-{kind}.json', 'liste des fichiers Météo-France')
    return [(r.get('title') or r.get('url', '').rsplit('/', 1)[-1], r.get('url')) for r in d.get('resources', []) if r.get('url')]


def do_meteofrance(net, work, deps, years, hourly=False):
    res = mf_resources(net, MF_DAILY_DATASET_API, 'quot')
    for dep in deps:
        step = f'mf-quot-{dep}'
        if work.done(step):
            continue
        mine = [(t, u) for t, u in res if re.search(rf'(^|/)Q_{re.escape(dep)}_', u.rsplit('/', 1)[-1] if '/' in u else t)]
        rrt = [(t, u) for t, u in mine if 'RR-T-Vent' in u or 'RR-T-Vent' in t]
        oth = [(t, u) for t, u in mine if 'autres' in (u + t).lower()]
        if not rrt:
            if not net.offline:
                say(f'   ⚠️ département {dep} : aucun fichier quotidien trouvé')
            work.mark(step)
            continue
        for t, u in rrt:
            name = u.rsplit('/', 1)[-1]
            per = re.search(r'(previous-\d{4}-\d{4}|latest-\d{4}-\d{4}|\d{4}-\d{4})', name)
            twin = next((uu for tt, uu in oth if per and per.group(1) in uu), None)
            p = net.get(u, name, f'Météo-France, département {dep}')
            p2 = net.get(twin, twin.rsplit('/', 1)[-1], f'Météo-France (autres paramètres), département {dep}') if twin else None
            data = parse_meteofrance_daily(open_text(p), open_text(p2) if p2 else None)
            n = sum(work.add_daily('meteofrance', st['meta'], st['days'], years) for st in data.values())
            say(f'   • Météo-France {dep} · {name} : {len(data)} stations, {n} années')
        work.mark(step)
    if hourly:
        resh = mf_resources(net, MF_HOURLY_DATASET_API, 'hor')
        for dep in deps:
            step = f'mf-hor-{dep}'
            if work.done(step):
                continue
            for t, u in [(t, u) for t, u in resh if re.search(rf'(^|/)H_{re.escape(dep)}_', u.rsplit('/', 1)[-1] if '/' in u else t)]:
                name = u.rsplit('/', 1)[-1]
                data = parse_meteofrance_hourly(open_text(net.get(u, name, f'Météo-France horaire, département {dep}')))
                for st in data.values():
                    hrs = {k: v for k, v in st['hours'].items() if years[0] <= k // 1000000 <= years[1]}
                    work.add_hourly('meteofrance', st['meta'], hrs, 1)
                say(f'   • Météo-France horaire {dep} · {name} : {len(data)} stations')
            work.mark(step)
    work.db.commit()


def do_meteoswiss(net, work, years, only=None):
    if work.done('ch'):
        return
    if net.offline:
        files = os.listdir(net.offline)
        meta_f = next((f for f in files if 'meta_stations' in f), None)
        metas = parse_meteoswiss_meta(open_text(os.path.join(net.offline, meta_f))) if meta_f else {}
        datas = [(re.search(r'nbcn_([a-z]{3})_d', f).group(1).upper(), os.path.join(net.offline, f)) for f in files if re.search(r'nbcn_[a-z]{3}_d_.*\.csv', f)]
    else:
        coll = net.json(CH_STAC_COLLECTION, 'ch-collection.json', 'MétéoSuisse (catalogue)')
        meta_url = next((a['href'] for a in coll.get('assets', {}).values() if 'meta_stations' in a.get('href', '')), None)
        metas = parse_meteoswiss_meta(open_text(net.get(meta_url, 'ch-meta_stations.csv', 'MétéoSuisse (stations)'))) if meta_url else {}
        datas = []
        url = CH_STAC_ITEMS
        page = 0
        while url:
            page += 1
            d = net.json(url, f'ch-items-{page}.json', 'MétéoSuisse (liste des stations)')
            for it in d.get('features', []):
                abbr = it.get('id', '').upper()
                if only and abbr not in only:
                    continue
                for a in it.get('assets', {}).values():
                    h = a.get('href', '')
                    if re.search(r'_d_(historical|recent)\.csv$', h):
                        datas.append((abbr, net.get(h, 'ch-' + h.rsplit('/', 1)[-1], f'MétéoSuisse {abbr}')))
            url = next((l['href'] for l in d.get('links', []) if l.get('rel') == 'next'), None)
    by = {}
    for abbr, p in datas:
        by.setdefault(abbr, {}).update(parse_meteoswiss_daily(open_text(p)))
    for abbr, days in by.items():
        meta = metas.get(abbr) or {'code': abbr, 'nom': abbr, 'pays': 'CH', 'lat': None, 'lon': None, 'alt': None}
        if meta.get('lat') is not None:
            fill_clouds(days, meta['lat'])
        work.add_daily('meteoswiss', meta, days, years)
    say(f'   • MétéoSuisse : {plural(len(by), "station")}')
    work.mark('ch')


def do_irm(net, work, years, test=False):
    if work.done('be'):
        return
    st_text = open_text(net.get(IRM_STATIONS, 'irm-aws_station.csv', 'IRM (stations)'))
    texts = []
    start, count = 0, 20000
    while True:
        name = f'irm-aws_1day-{start}.csv'
        try:
            p = net.get(IRM_DAILY.format(count=count, start=start), name, 'IRM (relevés quotidiens)')
        except Stop:
            if net.offline and start:
                break
            raise
        t = open_text(p)
        texts.append(t)
        if test or t.count('\n') < count:
            break
        start += count
    data = {}
    for t in texts:
        for code, st in parse_irm(st_text, t).items():
            data.setdefault(code, {'meta': st['meta'], 'days': {}})['days'].update(st['days'])
    for st in data.values():
        work.add_daily('irm', st['meta'], st['days'], years)
    say(f'   • IRM / KMI : {plural(sum(1 for s in data.values() if s["days"]), "station")}')
    work.mark('be')


def do_meteolux(net, work, years, csv_path=None):
    if work.done('lu'):
        return
    p = csv_path
    if not p:
        try:
            if net.offline:
                p = next((os.path.join(net.offline, f) for f in os.listdir(net.offline) if 'meteolux' in f.lower() or 'findel' in f.lower()), None)
            else:
                d = net.json(LU_DATASET_API, 'lu-dataset.json', 'MeteoLux (catalogue)')
                url = next((r['url'] for r in d.get('resources', []) if re.search(r'\.(csv|txt)$', r.get('url', ''), re.I)), None)
                p = net.get(url, 'lu-findel.csv', 'MeteoLux Findel') if url else None
        except Stop as e:
            say(f'   ⚠️ MeteoLux : {e}\n      Télécharge le fichier quotidien de Findel à la main (data.public.lu) et relance avec --meteolux-csv FICHIER.')
            p = None
    if p:
        days = parse_generic_daily(open_text(p))
        nom, lat, lon, alt = LU_FINDEL
        fill_clouds(days, lat)
        work.add_daily('meteolux', {'code': 'FINDEL', 'nom': nom, 'pays': 'LU', 'lat': lat, 'lon': lon, 'alt': alt}, days, years)
        say(f'   • MeteoLux : Findel, {len(days)} jours')
    work.mark('lu')


def do_dwd(net, work, years, test=False):
    """Allemagne (pack Europe) : la liste des stations, puis un fichier ZIP par station"""
    if work.done('dwd'):
        return
    st_txt = open_text(net.get(DWD_KL_STATIONS, 'dwd-stations.txt', 'DWD (stations)'))
    metas = {}
    for l in st_txt.splitlines()[2:]:
        m = re.match(r'^\s*(\d+)\s+(\d{8})\s+(\d{8})\s+(-?\d+)\s+([-\d.]+)\s+([-\d.]+)\s+(.+?)\s{2,}', l)
        if m:
            metas[m.group(1).zfill(5)] = {'code': m.group(1).zfill(5), 'nom': m.group(7).strip(), 'pays': 'DE', 'lat': float(m.group(5)), 'lon': float(m.group(6)), 'alt': float(m.group(4))}
    if net.offline:
        zips = [f for f in os.listdir(net.offline) if f.startswith('tageswerte_KL_')]
    else:
        listing = open_text(net.get(DWD_KL_HIST, 'dwd-liste.html', 'DWD (liste des fichiers)'))
        zips = sorted(set(re.findall(r'tageswerte_KL_\d{5}_\d{8}_\d{8}_hist\.zip', listing)))
    if test:
        zips = zips[:3]
    for z in zips:
        code = z.split('_')[2]
        step = 'dwd-' + code
        if work.done(step) or code not in metas:
            continue
        p = net.get(DWD_KL_HIST + z, z, f'DWD {metas[code]["nom"]}')
        days = parse_dwd_kl(open_text(p))
        work.add_daily('dwd', metas[code], days, years)
        work.mark(step)
    say(f'   • DWD : {len(zips)} stations')
    work.mark('dwd')


# ═══════════════════════ Les réanalyses (facultatives) ═══════════════════════
def need_netcdf(what):
    try:
        import netCDF4  # noqa: F401
        return netCDF4
    except ImportError:
        raise Stop(f'{what} a besoin de la bibliothèque netCDF4 : tape « pip3 install netCDF4 » puis relance (ou ajoute --sans-era5 --sans-20cr).')


class Grid:
    """les carreaux d'une réanalyse dans une base (socle ou pack Europe) : id par (source, lat, lon)"""

    def __init__(self, db, source, step):
        self.db, self.source, self.step = db, source, step
        self.ids = {(round(la, 3), round(lo, 3)): i for i, la, lo in db.execute('SELECT id, lat, lon FROM grid WHERE source=?', (source,))}

    def id(self, lat, lon, alt=None):
        k = (round(lat, 3), round(lon, 3))
        if k not in self.ids:
            cur = self.db.execute('INSERT INTO grid(source, lat, lon, alt, pas) VALUES(?,?,?,?,?)', (self.source, lat, lon, alt, self.step))
            self.ids[k] = cur.lastrowid
        return self.ids[k]


def in_boxes(lat, lon, boxes):
    return any(s <= lat <= n and w <= lon <= e for n, w, s, e in boxes)


def do_20cr(db, years, boxes, test=False, net=None):
    nc = need_netcdf('20CRv3')
    g = Grid(db, '20cr', 1.0)
    n_, w_, s_, e_ = (max(b[0] for b in boxes), min(b[1] for b in boxes), min(b[2] for b in boxes), max(b[3] for b in boxes))
    y0, y1 = max(1836, years[0]), min(1939, years[1])
    for y in range(y0, y1 + 1):
        if db.execute('SELECT 1 FROM meta WHERE key=?', (f'20cr-{y}',)).fetchone():
            continue
        cols = {}
        lats = lons = None
        for k, (path, var) in C20_FILES.items():
            url = C20_OPENDAP + path.format(year=y)
            try:
                ds = nc.Dataset(url)
            except OSError:
                # sans OPeNDAP : le fichier entier (≈ 50 Mo) dans les téléchargements
                if net is None:
                    raise Stop(f'20CR {y} : fichier inaccessible ({url}).')
                p = net.get(C20_HTTP + path.format(year=y), f'20cr-{var}-{y}.nc', f'20CR {var} {y}')
                ds = nc.Dataset(p)
            la = ds.variables['lat'][:]
            lo = ds.variables['lon'][:]
            li = [i for i, x in enumerate(la) if s_ - 1 <= x <= n_ + 1]
            oi = [i for i, x in enumerate(lo) if (w_ - 1) % 360 <= x <= 360 or x <= e_ + 1] if w_ < 0 else [i for i, x in enumerate(lo) if w_ - 1 <= x <= e_ + 1]
            data = ds.variables[var][:, min(li):max(li) + 1, :]
            lats = [float(la[i]) for i in range(min(li), max(li) + 1)]
            lons = [float(lo[i]) for i in oi]
            cols[k] = (data, oi)
            ds.close()
        nd = F.days_in_year(y)
        for a, lat in enumerate(lats):
            for b, lon360 in enumerate(lons):
                lon = lon360 - 360 if lon360 > 180 else lon360
                if not in_boxes(lat, lon, [(n + 0.6, w - 0.6, s - 0.6, e + 0.6) for n, w, s, e in boxes]):
                    continue
                vals = {}
                for k, (data, oi) in cols.items():
                    series = data[:nd, a, oi[b]]
                    if k in ('TN', 'TX'):
                        vals[k] = [int(round((float(v) - 273.15) * 10)) for v in series]
                    elif k == 'RR':
                        vals[k] = [int(round(float(v) * 86400 * 10)) for v in series]
                    else:
                        vals[k] = [int(round(float(v))) for v in series]
                gid = g.id(lat, lon)
                db.execute('INSERT OR REPLACE INTO grid_daily(grid_id, annee, blob) VALUES(?,?,?)', (gid, y, F.encode([(k, vals[k]) for k in ('TN', 'TX', 'RR', 'NN') if k in vals])))
        db.execute('UPDATE grid SET debut=MIN(COALESCE(debut, ?), ?), fin=MAX(COALESCE(fin, ?), ?) WHERE source=?', (y, y, y, y, '20cr'))
        F.set_meta(db, **{f'20cr-{y}': 'ok'})
        db.commit()
        say(f'   • 20CR {y}')
        if test:
            break


def cds_client():
    try:
        import cdsapi
    except ImportError:
        raise Stop('ERA5 a besoin de la bibliothèque cdsapi : tape « pip3 install cdsapi netCDF4 », crée ton compte Copernicus et ta clé (docs/METEO.md), puis relance (ou ajoute --sans-era5).')
    try:
        return cdsapi.Client(quiet=True)
    except Exception as e:  # noqa: BLE001
        raise Stop(f'ERA5 : la clé Copernicus manque ou est fausse ({e}). Suis l’étape « Le compte Copernicus » de docs/METEO.md (fichier .cdsapirc).')


def nc_var(ds, *names):
    for n in names:
        if n in ds.variables:
            return ds.variables[n]
    raise Stop('ERA5 : variable introuvable (' + ', '.join(names) + ') — le format de Copernicus a peut-être changé.')


def do_era5(db, years, box, boxes, cache, hours_step=6, test=False):
    """ERA5 : chaque jour (min, max, pluie, rafales, nuages, neige) et des heures (toutes les hours_step heures), carreaux sur terre seulement"""
    nc = need_netcdf('ERA5')
    c = cds_client()
    os.makedirs(cache, exist_ok=True)
    area = [box[0], box[1], box[2], box[3]]
    lsm_p = os.path.join(cache, 'era5-lsm.nc')
    if not os.path.exists(lsm_p):
        c.retrieve(ERA5_HOURLY_DATASET, {'product_type': ['reanalysis'], 'variable': ['land_sea_mask', 'geopotential'], 'year': ['2000'], 'month': ['01'], 'day': ['01'],
                                         'time': ['00:00'], 'area': area, 'data_format': 'netcdf', 'download_format': 'unarchived'}, lsm_p)
    ds = nc.Dataset(lsm_p)
    lats = [float(x) for x in nc_var(ds, 'latitude', 'lat')[:]]
    lons = [float(x) for x in nc_var(ds, 'longitude', 'lon')[:]]
    lsm = nc_var(ds, 'lsm')[0]
    zz = nc_var(ds, 'z')[0]
    keep = [(a, b) for a in range(len(lats)) for b in range(len(lons)) if float(lsm[a, b]) > 0.2 and in_boxes(lats[a], lons[b], boxes)]
    ds.close()
    g = Grid(db, 'era5', 0.25)
    ids = {(a, b): g.id(lats[a], lons[b], round(float(zz[a, b]) / 9.80665)) for a, b in keep}
    say(f'   • ERA5 : {len(ids)} carreaux sur terre')
    for y in range(max(1940, years[0]), min(years[1], datetime.date.today().year - 1) + 1):
        if db.execute('SELECT 1 FROM meta WHERE key=?', (f'era5-{y}',)).fetchone():
            continue
        months = ['01'] if test else [f'{m:02d}' for m in range(1, 13)]
        files = {}
        for stat, vars_ in (('daily_minimum', ['2m_temperature']), ('daily_maximum', ['2m_temperature', '10m_wind_gust_since_previous_post_processing']),
                            ('daily_mean', ['total_precipitation', 'total_cloud_cover', 'snowfall'])):
            p = os.path.join(cache, f'era5-{y}-{stat}.nc')
            if not os.path.exists(p):
                say(f'     ERA5 {y} : {stat}… (la file d’attente de Copernicus peut prendre du temps)')
                c.retrieve(ERA5_DAILY_DATASET, {'product_type': 'reanalysis', 'variable': vars_, 'year': str(y), 'month': months, 'day': [f'{d:02d}' for d in range(1, 32)],
                                                'daily_statistic': stat, 'time_zone': 'utc+00:00', 'frequency': '1_hourly', 'area': area}, p + '.part')
                os.replace(p + '.part', p)
            files[stat] = p
        ph = os.path.join(cache, f'era5-{y}-heures.nc')
        if not os.path.exists(ph):
            c.retrieve(ERA5_HOURLY_DATASET, {'product_type': ['reanalysis'], 'variable': ['2m_temperature', 'total_precipitation', '10m_wind_gust_since_previous_post_processing', 'total_cloud_cover'],
                                             'year': [str(y)], 'month': months, 'day': [f'{d:02d}' for d in range(1, 32)], 'time': [f'{h:02d}:00' for h in range(0, 24, hours_step)],
                                             'area': area, 'data_format': 'netcdf', 'download_format': 'unarchived'}, ph + '.part')
            os.replace(ph + '.part', ph)
        dmin, dmax, dmean, hh = (nc.Dataset(files['daily_minimum']), nc.Dataset(files['daily_maximum']), nc.Dataset(files['daily_mean']), nc.Dataset(ph))
        tn, tx = nc_var(dmin, 't2m')[:], nc_var(dmax, 't2m')[:]
        fx = nc_var(dmax, 'fg10', 'i10fg')[:]
        tp, tcc, sf = nc_var(dmean, 'tp')[:], nc_var(dmean, 'tcc')[:], nc_var(dmean, 'sf')[:]
        ht, hrr, hfx, hnn = nc_var(hh, 't2m')[:], nc_var(hh, 'tp')[:], nc_var(hh, 'fg10', 'i10fg')[:], nc_var(hh, 'tcc')[:]
        nd = tn.shape[0]
        nrows = F.days_in_year(y) if not test else nd
        for (a, b), gid in ids.items():
            pad = lambda xs: xs + [None] * (nrows - len(xs))
            daily = [('TN', pad([int(round((float(v) - 273.15) * 10)) for v in tn[:, a, b]])), ('TX', pad([int(round((float(v) - 273.15) * 10)) for v in tx[:, a, b]])),
                     ('RR', pad([int(round(float(v) * 24 * 1000 * 10)) for v in tp[:, a, b]])), ('SN', pad([int(round(float(v) * 24 * 1000 / 10)) for v in sf[:, a, b]])),
                     ('FX', pad([int(round(float(v) * 10)) for v in fx[:, a, b]])), ('NN', pad([int(round(float(v) * 100)) for v in tcc[:, a, b]]))]
            db.execute('INSERT OR REPLACE INTO grid_daily(grid_id, annee, blob) VALUES(?,?,?)', (gid, y, F.encode(daily)))
            per = 24 // hours_step
            hrows = nrows * per
            hp = lambda xs: xs + [None] * (hrows - len(xs))
            hourly = [('T', hp([int(round((float(v) - 273.15) * 10)) for v in ht[:, a, b]])), ('RR', hp([int(round(float(v) * 1000 * 10 * hours_step)) for v in hrr[:, a, b]])),
                      ('FX', hp([int(round(float(v) * 10)) for v in hfx[:, a, b]])), ('NN', hp([int(round(float(v) * 100)) for v in hnn[:, a, b]]))]
            db.execute('INSERT OR REPLACE INTO grid_hourly(grid_id, annee, blob) VALUES(?,?,?)', (gid, y, F.encode(hourly, step=hours_step)))
        for d in (dmin, dmax, dmean, hh):
            d.close()
        db.execute("UPDATE grid SET debut=MIN(COALESCE(debut, ?), ?), fin=MAX(COALESCE(fin, ?), ?), heures_debut=MIN(COALESCE(heures_debut, ?), ?) WHERE source='era5'", (y, y, y, y, y, y))
        F.set_meta(db, **{f'era5-{y}': 'ok'})
        db.commit()
        say(f'   • ERA5 {y}')
        if test:
            break


# ═══════════════════════ Les altitudes (Copernicus DEM GLO-90 → grille de 30″) ═══════════════════════
import struct  # noqa: E402
from itertools import accumulate  # noqa: E402

TIFF_TYPES = {1: ('B', 1), 2: ('s', 1), 3: ('H', 2), 4: ('I', 4), 5: ('II', 8), 6: ('b', 1), 7: ('B', 1), 8: ('h', 2), 9: ('i', 4), 11: ('f', 4), 12: ('d', 8), 16: ('Q', 8), 17: ('q', 8)}


def lzw_decode(data):
    """LZW des TIFF (compression 5), sans bibliothèque"""
    out = bytearray()
    table = [bytes([i]) for i in range(256)] + [b'', b'']
    bitpos, nbits, prev = 0, 9, None
    total = len(data) * 8
    while bitpos + nbits <= total:
        byte = bitpos >> 3
        chunk = int.from_bytes(data[byte:byte + 4].ljust(4, b'\0'), 'big')
        code = (chunk >> (32 - nbits - (bitpos & 7))) & ((1 << nbits) - 1)
        bitpos += nbits
        if code == 256:
            table = table[:258]; nbits = 9; prev = None
            continue
        if code == 257:
            break
        if prev is None:
            entry = table[code]
        else:
            entry = table[code] if code < len(table) else prev + prev[:1]
            table.append(prev + entry[:1])
        out += entry
        prev = entry
        if len(table) + 1 >= (1 << nbits) and nbits < 12:
            nbits += 1
    return bytes(out)


class Tiff:
    """lecteur minimal de GeoTIFF (aussi BigTIFF, COG) : tuiles ou bandes, sans compression, deflate ou LZW,
    prédicteur 1, 2 ou 3 (virgule flottante), entiers 16 bits ou flottants 32 bits ; une ligne à la fois"""

    def __init__(self, data):
        self.d = data
        self.bo = '<' if data[:2] == b'II' else '>'
        magic = struct.unpack(self.bo + 'H', data[2:4])[0]
        big = magic == 43
        off = struct.unpack(self.bo + ('Q' if big else 'I'), data[8 if big else 4:16 if big else 8])[0]
        n = struct.unpack(self.bo + ('Q' if big else 'H'), data[off:off + (8 if big else 2)])[0]
        pos, esz = off + (8 if big else 2), (20 if big else 12)
        self.tags = {}
        for k in range(n):
            e = data[pos + k * esz:pos + (k + 1) * esz]
            tag, typ = struct.unpack(self.bo + 'HH', e[:4])
            cnt = struct.unpack(self.bo + ('Q' if big else 'I'), e[4:12 if big else 8])[0]
            fmt, size = TIFF_TYPES.get(typ, ('B', 1))
            raw_len = size * cnt
            inline = e[12:20] if big else e[8:12]
            raw = inline[:raw_len] if raw_len <= len(inline) else data[struct.unpack(self.bo + ('Q' if big else 'I'), inline)[0]:][:raw_len]
            if typ == 2:
                self.tags[tag] = raw.rstrip(b'\0').decode('latin-1')
            else:
                self.tags[tag] = list(struct.unpack(self.bo + fmt[0] * (cnt * (2 if typ == 5 else 1)), raw))
        g = lambda t, d=None: (self.tags.get(t) or [d])[0]
        self.w, self.h = g(256), g(257)
        self.bps, self.comp, self.pred, self.fmt = g(258, 16), g(259, 1), g(317, 1), g(339, 1)
        self.tw, self.th = g(322), g(323)
        self.rps = g(278, self.h)
        self.offsets = self.tags.get(324) or self.tags.get(273)
        self.counts = self.tags.get(325) or self.tags.get(279)
        sc, tp = self.tags.get(33550), self.tags.get(33922)
        if not sc or not tp:
            raise Stop('GeoTIFF sans géoréférence (ModelPixelScale / ModelTiepoint).')
        self.sx, self.sy = sc[0], sc[1]
        self.x0, self.y0 = tp[3] - tp[0] * sc[0], tp[4] + tp[1] * sc[1]
        nd = self.tags.get(42113)
        self.nodata = float(nd) if isinstance(nd, str) and nd.strip() not in ('', 'nan') else None
        self.cache = {}

    def _block(self, i):
        if i not in self.cache:
            raw = self.d[self.offsets[i]:self.offsets[i] + self.counts[i]]
            if self.comp == 8 or self.comp == 32946:
                raw = zlib.decompress(raw)
            elif self.comp == 5:
                raw = lzw_decode(raw)
            elif self.comp != 1:
                raise Stop(f'GeoTIFF : compression {self.comp} pas prise en charge.')
            if len(self.cache) > 64:
                self.cache.clear()
            self.cache[i] = raw
        return self.cache[i]

    def _decode_row(self, raw, width):
        b = self.bps // 8
        if self.pred == 3:  # prédicteur « virgule flottante » : différences d'octets, puis octets rangés par poids
            acc = bytes(accumulate(raw[:width * b], lambda x, y: (x + y) & 255))
            planes = [acc[k * width:(k + 1) * width] for k in range(b)]
            be = bytes(x for quad in zip(*planes) for x in quad)
            return list(struct.unpack('>%d%s' % (width, 'f' if b == 4 else 'd'), be))
        fmt = {(1, 16): 'H', (2, 16): 'h', (3, 32): 'f', (1, 8): 'B', (2, 32): 'i', (1, 32): 'I', (3, 64): 'd'}.get((self.fmt, self.bps), 'h')
        vals = list(struct.unpack(self.bo + fmt * width, raw[:width * b]))
        if self.pred == 2:
            vals = list(accumulate(vals))
        return vals

    def row(self, y):
        """la ligne y entière (valeurs ; None = pas de donnée)"""
        b = self.bps // 8
        if self.tw:
            ty, out = y // self.th, []
            across = -(-self.w // self.tw)
            for tx in range(across):
                blk = self._block(ty * across + tx)
                r = y - ty * self.th
                out += self._decode_row(blk[r * self.tw * b:(r + 1) * self.tw * b], self.tw)
            out = out[:self.w]
        else:
            s = y // self.rps
            blk = self._block(s)
            r = y - s * self.rps
            out = self._decode_row(blk[r * self.w * b:(r + 1) * self.w * b], self.w)
        nd = self.nodata
        return [None if (v != v or (nd is not None and v == nd) or v < -1000) else v for v in out]

    def sample_grid(self, lat0, lon0, n):
        """les n × n nœuds lat0 + i/n, lon0 + j/n (plus proche pixel), en mètres entiers"""
        vals, rows = [], {}
        for i in range(n):
            lat = lat0 + i / n
            y = min(self.h - 1, max(0, int(round((self.y0 - lat) / self.sy - 0.5))))
            if y not in rows:
                rows[y] = self.row(y)
            r = rows[y]
            for j in range(n):
                x = min(self.w - 1, max(0, int(round((lon0 + j / n - self.x0) / self.sx - 0.5))))
                v = r[x]
                vals.append(None if v is None else int(round(v)))
        return vals


def copdem_name(lat0, lon0):
    return COPDEM_NAME.format(ns='N' if lat0 >= 0 else 'S', lat=abs(lat0), ew='E' if lon0 >= 0 else 'W', lon=abs(lon0))


def do_altitudes(net, db, boxes, work_path, test=False):
    """la grille des altitudes (30″) des carrés de 1° qui touchent les boîtes ; gardée dans travail/altitudes.sqlite pour reprendre"""
    wk = sqlite3.connect(work_path)
    wk.executescript(F.SCHEMA)
    wk.execute('CREATE TABLE IF NOT EXISTS absent(lat0 INTEGER, lon0 INTEGER, PRIMARY KEY(lat0, lon0))')
    tiles = sorted({(la, lo) for n_, w_, s_, e_ in boxes for la in range(math.floor(s_), math.ceil(n_)) for lo in range(math.floor(w_), math.ceil(e_))})
    if test:
        tiles = [t for t in tiles if t == (43, 0)] or tiles[:1]
    done = sea = 0
    for la, lo in tiles:
        if wk.execute('SELECT 1 FROM elevation WHERE lat0=? AND lon0=?', (la, lo)).fetchone() or wk.execute('SELECT 1 FROM absent WHERE lat0=? AND lon0=?', (la, lo)).fetchone():
            continue
        name = copdem_name(la, lo)
        p = net.get(COPDEM_URL.format(name=name), name + '.tif', f'altitudes {name}', missing_ok=True)
        if not p:
            wk.execute('INSERT OR IGNORE INTO absent(lat0, lon0) VALUES(?,?)', (la, lo)); wk.commit(); sea += 1
            continue
        with open(p, 'rb') as f:
            vals = Tiff(f.read()).sample_grid(la, lo, F.ELEVATION_N)
        wk.execute('INSERT OR REPLACE INTO elevation(lat0, lon0, n, blob) VALUES(?,?,?,?)', (la, lo, F.ELEVATION_N, F.encode_tile(vals)))
        wk.commit(); done += 1
        if not net.offline and os.path.exists(p) and not test:
            os.remove(p)  # le fichier d'origine (≈ 3 Mo) n'est plus utile : la grille est gardée
    n = 0
    for la, lo, nn, blob in wk.execute('SELECT lat0, lon0, n, blob FROM elevation'):
        if any(math.floor(s_) <= la < math.ceil(n_) and math.floor(w_) <= lo < math.ceil(e_) for n_, w_, s_, e_ in boxes):
            db.execute('INSERT OR REPLACE INTO elevation(lat0, lon0, n, blob) VALUES(?,?,?,?)', (la, lo, nn, blob)); n += 1
    db.commit()
    wk.close()
    size = db.execute('SELECT COALESCE(SUM(LENGTH(blob)), 0) FROM elevation').fetchone()[0]
    say(f'   • altitudes : {plural(n, "carré")} de 1° ({done} nouveaux, {sea} en mer) · {size_text(size)}')
    return n


# ═══════════════════════ Fabriquer les fichiers finis ═══════════════════════
def normals_for(db, table, key, ref):
    vals = {}
    for y, blob in db.execute(f'SELECT annee, blob FROM {table} WHERE {key}=?', (ref,)):
        _, v = F.decode(blob)
        vals[y] = v
    return F.compute_normals(vals)


def write_normals(db, sorte, table, key):
    ids = [r[0] for r in db.execute(f'SELECT DISTINCT {key} FROM {table}')]
    for ref in ids:
        for start, end, blob in normals_for(db, table, key, ref):
            db.execute('INSERT OR REPLACE INTO normals(sorte, ref_id, debut, fin, blob) VALUES(?,?,?,?,?)', (sorte, ref, start, end, blob))
    db.commit()


def copy_stations(src, dst, ids, hourly=False):
    for sid in ids:
        row = src.execute('SELECT id, source, code, nom, pays, lat, lon, alt, debut, fin, heures_debut FROM stations WHERE id=?', (sid,)).fetchone()
        dst.execute('INSERT OR REPLACE INTO stations(id, source, code, nom, pays, lat, lon, alt, debut, fin, heures_debut) VALUES(?,?,?,?,?,?,?,?,?,?,?)', row[:10] + ((row[10] if hourly else None),))
        for y, blob in src.execute('SELECT annee, blob FROM daily WHERE station_id=?', (sid,)):
            dst.execute('INSERT OR REPLACE INTO daily(station_id, annee, blob) VALUES(?,?,?)', (sid, y, blob))
        if hourly:
            for y, blob in src.execute('SELECT annee, blob FROM hourly WHERE station_id=?', (sid,)):
                dst.execute('INSERT OR REPLACE INTO hourly(station_id, annee, blob) VALUES(?,?,?)', (sid, y, blob))
    dst.commit()


def finish(path, out_dir, kind, wrap=True):
    db = sqlite3.connect(path)
    F.set_meta(db, built=datetime.date.today().isoformat())
    db.commit()
    db.execute('VACUUM')
    db.close()
    say(f'   ✓ {os.path.basename(path)} : {size_text(os.path.getsize(path))}')
    if wrap:
        lc = os.path.join(out_dir, f'meteo-pack-{kind}.lcmeteo' if kind != 'socle' else 'meteo-socle.lcmeteo')
        F.wrap_pack(path, lc)
        say(f'   ✓ {os.path.basename(lc)} (à importer dans l’app) : {size_text(os.path.getsize(lc))}')


def main(argv=None):
    ap = argparse.ArgumentParser(description='Fabrique les données de la « Météo d’autrefois » de LCNDA (voir docs/METEO.md).')
    ap.add_argument('quoi', nargs='?', default='socle', choices=['socle', 'complet', 'europe', 'altitudes', 'tout'])
    ap.add_argument('--test', action='store_true', help='essai rapide : le Gers (32), une année, quelques stations')
    ap.add_argument('--dossier', default='meteo-sortie')
    ap.add_argument('--hors-ligne', dest='offline')
    ap.add_argument('--sans-era5', action='store_true')
    ap.add_argument('--sans-20cr', action='store_true')
    ap.add_argument('--sans-altitudes', action='store_true', help='sans la grille des altitudes (Copernicus DEM)')
    ap.add_argument('--altitudes-europe', action='store_true', help='aussi la grille des altitudes de toute l’Europe dans le pack Europe (long : ≈ 2 600 carrés à lire)')
    ap.add_argument('--stations', type=int, default=300)
    ap.add_argument('--depuis', type=int, default=1836)
    ap.add_argument('--jusqu-a', dest='until', type=int, default=datetime.date.today().year)
    ap.add_argument('--departements', default='')
    ap.add_argument('--meteolux-csv')
    a = ap.parse_args(argv)
    if a.test:
        a.departements = a.departements or '32'
        a.depuis = max(a.depuis, a.until - 1)
    out = os.path.abspath(a.dossier + ('-test' if a.test and a.dossier == 'meteo-sortie' else ''))
    os.makedirs(out, exist_ok=True)
    net = Net(os.path.join(out, 'telechargements'), a.offline)
    os.makedirs(os.path.join(out, 'travail'), exist_ok=True)
    years = (a.depuis, a.until)
    deps = [d.strip() for d in a.departements.split(',') if d.strip()] or DEPARTEMENTS
    kinds = ['socle', 'complet', 'europe'] if a.quoi == 'tout' else [a.quoi]
    t0 = time.time()
    try:
        say(f'🌦 Météo d’autrefois — fabrication : {", ".join(kinds)}{" (essai)" if a.test else ""}\n   dossier : {out}')
        work = Work(os.path.join(out, 'travail', 'stations.sqlite'))
        if {'socle', 'complet'} & set(kinds):
            say('1. Les stations (France, Suisse, Belgique, Luxembourg)')
            do_meteofrance(net, work, deps, years, hourly='complet' in kinds)
            for fn, args in ((do_meteoswiss, (net, work, years, {'GVE'} if a.test else None)), (do_irm, (net, work, years, a.test)), (do_meteolux, (net, work, years, a.meteolux_csv))):
                try:
                    fn(*args)
                except Stop as e:
                    if not a.offline:
                        raise
                    say(f'   (hors ligne : {fn.__name__[3:]} ignoré — {str(e).splitlines()[0]})')
            work.compute_scores()
        if 'europe' in kinds:
            say('1b. Les stations d’Europe (DWD, Allemagne)')
            try:
                do_dwd(net, work, years, a.test)
            except Stop as e:
                if not a.offline:
                    raise
                say(f'   (hors ligne : DWD ignoré — {str(e).splitlines()[0]})')
            work.compute_scores()
        if 'socle' in kinds:
            say('2. Le socle : les meilleures stations, bien réparties')
            rows = work.db.execute("SELECT s.id, s.pays, s.lat, s.lon, c.years, c.first FROM stations s JOIN score c ON c.station_id=s.id WHERE s.pays IN ('FR','BE','CH','LU')").fetchall()
            chosen = select_stations(rows, a.stations, {'FR': .78, 'CH': .1, 'BE': .08, 'LU': .02})
            say(f'   {plural(len(chosen), "station")} choisie{"s" if len(chosen) > 1 else ""}')
            path = os.path.join(out, 'meteo-socle.sqlite')
            if os.path.exists(path):
                os.remove(path)
            db = F.open_db(path, 'socle', 'Socle')
            F.set_meta(db, countries='FR,BE,CH,LU')
            F.add_sources(db, ['meteofrance', 'meteoswiss', 'irm', 'meteolux'], a.until)
            copy_stations(work.db, db, chosen)
            write_normals(db, 'station', 'daily', 'station_id')
            boxes = list(COUNTRY_BOXES.values())
            if not a.sans_20cr:
                say('3. 20CRv3 (1836–1939)')
                F.add_sources(db, ['20cr'], a.until)
                rdb = sqlite3.connect(os.path.join(out, 'travail', 'reanalyses.sqlite'))
                rdb.executescript(F.SCHEMA)
                do_20cr(rdb, years, boxes, a.test, net)
                merge_grid(rdb, db, '20cr')
            if not a.sans_era5:
                say('4. ERA5 (1940 → ), 4 heures par jour')
                F.add_sources(db, ['era5'], a.until)
                rdb = sqlite3.connect(os.path.join(out, 'travail', 'reanalyses.sqlite'))
                rdb.executescript(F.SCHEMA)
                do_era5(rdb, years, BOX_4, boxes, os.path.join(out, 'telechargements', 'era5'), 6, a.test)
                merge_grid(rdb, db, 'era5')
            write_normals(db, 'grid', 'grid_daily', 'grid_id')
            if not a.sans_altitudes:
                say('4b. Les altitudes (Copernicus DEM GLO-90, grille de 30″)')
                F.add_sources(db, ['copdem'], a.until)
                do_altitudes(net, db, boxes, os.path.join(out, 'travail', 'altitudes.sqlite'), a.test)
            db.close()
            finish(path, out, 'socle')
        if a.quoi == 'altitudes':
            say('Les altitudes (Copernicus DEM GLO-90, grille de 30″), rangées dans le socle')
            path = os.path.join(out, 'meteo-socle.sqlite')
            db = sqlite3.connect(path) if os.path.exists(path) else F.open_db(path, 'socle', 'Socle')
            db.executescript(F.SCHEMA)
            F.add_sources(db, ['copdem'], a.until)
            do_altitudes(net, db, list(COUNTRY_BOXES.values()), os.path.join(out, 'travail', 'altitudes.sqlite'), a.test)
            db.close()
            finish(path, out, 'socle')
        if 'complet' in kinds:
            say('5. Le pack complet : toutes les stations (+ heure par heure de Météo-France)')
            path = os.path.join(out, 'meteo-complet.sqlite')
            if os.path.exists(path):
                os.remove(path)
            db = F.open_db(path, 'complet', 'Pack complet')
            F.set_meta(db, countries='FR,BE,CH,LU')
            F.add_sources(db, ['meteofrance', 'meteoswiss', 'irm', 'meteolux'], a.until)
            ids = [r[0] for r in work.db.execute("SELECT id FROM stations WHERE pays IN ('FR','BE','CH','LU')")]
            copy_stations(work.db, db, ids, hourly=True)
            write_normals(db, 'station', 'daily', 'station_id')
            db.close()
            finish(path, out, 'complet')
        if 'europe' in kinds:
            say('6. Le pack Europe : stations d’Allemagne + ERA5 Europe (toutes les heures)')
            path = os.path.join(out, 'meteo-europe.sqlite')
            if os.path.exists(path):
                os.remove(path)
            db = F.open_db(path, 'europe', 'Pack Europe')
            F.set_meta(db, countries='EUROPE')
            F.add_sources(db, ['dwd'], a.until)
            ids = [r[0] for r in work.db.execute("SELECT id FROM stations WHERE pays NOT IN ('FR','BE','CH','LU')")]
            copy_stations(work.db, db, ids)
            write_normals(db, 'station', 'daily', 'station_id')
            if not a.sans_era5:
                F.add_sources(db, ['era5'], a.until)
                rdb = sqlite3.connect(os.path.join(out, 'travail', 'reanalyses-europe.sqlite'))
                rdb.executescript(F.SCHEMA)
                do_era5(rdb, years, BOX_EUROPE, [BOX_EUROPE], os.path.join(out, 'telechargements', 'era5-europe'), 1, a.test)
                merge_grid(rdb, db, 'era5')
                write_normals(db, 'grid', 'grid_daily', 'grid_id')
            if a.altitudes_europe and not a.sans_altitudes:
                F.add_sources(db, ['copdem'], a.until)
                do_altitudes(net, db, [BOX_EUROPE], os.path.join(out, 'travail', 'altitudes.sqlite'), a.test)
            db.close()
            finish(path, out, 'europe')
    except Stop as e:
        say(f'\n⛔ {e}\n')
        return 2
    except KeyboardInterrupt:
        say('\n⏸ Arrêté. Relance la même commande : le programme reprendra où il en était.')
        return 130
    m = int(time.time() - t0)
    say(f'\n✓ Fini en {m // 3600} h {m % 3600 // 60:02d} min. Les fichiers sont dans {out}.\n  Le socle : copie meteo-socle.sqlite dans le dossier data-meteo de l’app ; un pack (.lcmeteo) : Maintenance → 🌦 Météo d’autrefois → « ⤒ Importer le fichier… ».')
    return 0


def merge_grid(src, dst, source):
    for gid, lat, lon, alt, debut, fin, pas, hd in src.execute('SELECT id, lat, lon, alt, debut, fin, pas, heures_debut FROM grid WHERE source=?', (source,)).fetchall():
        cur = dst.execute('INSERT INTO grid(source, lat, lon, alt, debut, fin, pas, heures_debut) VALUES(?,?,?,?,?,?,?,?)', (source, lat, lon, alt, debut, fin, pas, hd))
        nid = cur.lastrowid
        for y, blob in src.execute('SELECT annee, blob FROM grid_daily WHERE grid_id=?', (gid,)):
            dst.execute('INSERT INTO grid_daily(grid_id, annee, blob) VALUES(?,?,?)', (nid, y, blob))
        for y, blob in src.execute('SELECT annee, blob FROM grid_hourly WHERE grid_id=?', (gid,)):
            dst.execute('INSERT INTO grid_hourly(grid_id, annee, blob) VALUES(?,?,?)', (nid, y, blob))
    dst.commit()


if __name__ == '__main__':
    sys.exit(main())
