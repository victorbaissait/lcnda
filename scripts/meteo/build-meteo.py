#!/usr/bin/env python3
"""LCNDA — 🌦 Météo d'autrefois : le FABRICANT des données (à lancer une fois, sur un ordinateur qui a Internet).

Mode d'emploi pas à pas, en français simple : docs/METEO.md. En bref :

    python3 scripts/meteo/build-meteo.py --test        # essai rapide : le Gers (32) et une seule année (≈ 5 minutes)
    python3 scripts/meteo/build-meteo.py socle         # le socle livré avec l'app (≈ 550 Mo, plusieurs heures)
    python3 scripts/meteo/build-meteo.py complet       # le pack complet (≈ 3 Go, une nuit ou plus)
    python3 scripts/meteo/build-meteo.py europe        # le pack Europe (≈ 2 Go, une nuit ou plus)
    python3 scripts/meteo/build-meteo.py tout          # les trois
    python3 scripts/meteo/build-meteo.py altitudes     # seulement la grille des altitudes (≈ 2–3 Mo, rangée dans le socle ; faite aussi avec « socle »)
    python3 scripts/meteo/build-meteo.py monde-asie    # un pack du monde (GHCN-Daily, NOAA) : monde-amerique-nord, monde-amerique-sud,
                                                       # monde-afrique, monde-asie, monde-oceanie, monde-europe (hors pack Europe) ;
                                                       # « monde » : les six (plusieurs heures chacun)
    python3 scripts/meteo/build-meteo.py plus-neige    # un complément Copernicus (clé Copernicus obligatoire) : plus-neige (ERA5-Land),
                                                       # plus-ressenti (UTCI), plus-rivieres (GloFAS), plus-cerra (CERRA),
                                                       # plus-anciennes (relevés d'avant 1836) — voir meteo_plus.py

Options utiles :
    --dossier meteo-sortie     où tout est rangé (téléchargements, travail, fichiers finis) — par défaut ./meteo-sortie
    --sans-era5 / --sans-20cr  sans les réanalyses (pas besoin de compte Copernicus ni de netCDF4)
    --sans-altitudes           sans la grille des altitudes (Copernicus DEM GLO-90) ; --altitudes-europe : aussi celle de l'Europe (pack Europe)
    --stations 300             combien de stations dans le socle
    --stations-monde 500       combien de stations au plus dans un pack du monde
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
# le serveur (GeoServer) refuse (HTTP 400) une page « startIndex » sans ordre fixe : on demande l'ordre (sortBy), sinon une année à la fois
IRM_DAILY_SORTED = IRM_DAILY + '&sortBy={sort}'
IRM_DAILY_YEAR = IRM_WFS + '?service=WFS&version=2.0.0&request=GetFeature&typenames=aws:aws_1day&outputFormat=csv&CQL_FILTER={cql}'
IRM_FIRST_YEAR = 1995
# MeteoLux : Luxembourg-Findel (data.public.lu, CC0)
LU_DATASET_API = 'https://data.public.lu/api/1/datasets/climatological-daily-data-luxembourg-findel/'
LU_FINDEL = ('Luxembourg – Findel', 49.6266, 6.2045, 376.0)
# Copernicus DEM GLO-90 (altitudes, carrés de 1° en GeoTIFF « COG » sur AWS Open Data ; absents en pleine mer)
COPDEM_URL = 'https://copernicus-dem-90m.s3.amazonaws.com/{name}/{name}.tif'
COPDEM_NAME = 'Copernicus_DSM_COG_30_{ns}{lat:02d}_00_{ew}{lon:03d}_00_DEM'
# DWD (Allemagne, pack Europe) : relevés quotidiens « KL »
DWD_KL_HIST = 'https://opendata.dwd.de/climate_environment/CDC/observations_germany/climate/daily/kl/historical/'
DWD_KL_STATIONS = DWD_KL_HIST + 'KL_Tageswerte_Beschreibung_Stationen.txt'
DWD_MIN_YEARS = 60
# ── Pack Europe : les stations des pays qui publient librement (une fonction par source ; adresses à corriger ici si elles changent) ──
# Pays-Bas — KNMI (open data, CC BY 4.0) : un fichier zip par station (« etmgeg »)
KNMI_DAILY = 'https://cdn.knmi.nl/knmi/map/page/klimatologie/gegevens/daggegevens/etmgeg_{stn}.zip'
KNMI_STATIONS = ['260', '240', '235', '270', '280', '290', '310', '344', '350', '370', '375', '380', '391', '279', '251', '377']
# Danemark — DMI (open data, CC BY 4.0) : API « climateData » (clé facultative : variable DMI_API_KEY)
DMI_API = 'https://dmigw.govcloud.dk/v2/climateData/collections'
DMI_STATIONS = ['06180', '06030', '06060', '06110', '06120', '06149', '06170', '06190', '06041', '06079', '06102', '06156']
DMI_PARAMS = {'min_temp': 'TN', 'max_temp_w_date': 'TX', 'acc_precip': 'RR', 'max_wind_speed_3sec': 'FX', 'bright_sunshine': 'SS', 'mean_cloud_cover': 'NN'}
# Royaume-Uni — Met Office MIDAS-Open via CEDA (Open Government Licence v3) : compte CEDA gratuit, jeton dans CEDA_TOKEN
MIDAS_BASE = 'https://dap.ceda.ac.uk/badc/ukmo-midas-open/data/'
MIDAS_VERSION = 'dataset-version-202407'
MIDAS_TEMP = 'uk-daily-temperature-obs'
MIDAS_RAIN = 'uk-daily-rain-obs'
MIDAS_MAX_STATIONS = 40
# Espagne — AEMET OpenData (réutilisation libre avec mention) : clé gratuite, dans AEMET_API_KEY ou --aemet-cle
AEMET_API = 'https://opendata.aemet.es/opendata/api'
AEMET_STATIONS = ['3195', '0076', '8416', '5783', '1082', '6155A', '9434', '2422', '1428', '9981A', 'C447A', 'C649I', 'B278', '4452', '3469A',
                  '1249X', '2867', '5530E', '7178I', '8025', '1495', '9170', '2030', '6325O', '0016A', '1690A', '5270B', '4121', '3260B', '2614']
AEMET_CHUNK_YEARS = 4
# Pologne — IMGW-PIB (danepubliczne.imgw.pl, données publiques, mention de la source) : un zip par station et par an (ou par 5 ans avant 2001)
IMGW_BASE = 'https://danepubliczne.imgw.pl/data/dane_pomiarowo_obserwacyjne/dane_meteorologiczne/dobowe/synop/'
IMGW_STATIONS = {  # code IMGW : (nom, lat, lon, alt)
    '375': ('Warszawa-Okęcie', 52.163, 20.961, 106), '566': ('Kraków-Balice', 50.078, 19.785, 237), '330': ('Poznań', 52.417, 16.835, 84),
    '424': ('Wrocław', 51.103, 16.880, 120), '155': ('Gdańsk-Rębiechowo', 54.384, 18.466, 138), '205': ('Szczecin', 53.395, 14.622, 1),
    '495': ('Lublin-Radawiec', 51.217, 22.393, 240), '295': ('Białystok', 53.107, 23.162, 148), '520': ('Katowice', 50.241, 19.033, 278),
    '625': ('Zakopane', 49.294, 19.960, 855), '250': ('Toruń', 53.042, 18.595, 69), '360': ('Łódź-Lublinek', 51.721, 19.398, 187),
    '670': ('Kasprowy Wierch', 49.233, 19.982, 1991), '135': ('Łeba', 54.754, 17.535, 2), '580': ('Rzeszów-Jasionka', 50.110, 22.042, 200)}
# Tchéquie — ČHMÚ (opendata.chmi.cz, CC BY 4.0) : un fichier par station et par élément
CHMI_BASE = 'https://opendata.chmi.cz/meteorology/climate/historical/'
CHMI_META = CHMI_BASE + 'metadata/meta1.csv'
CHMI_DAILY = CHMI_BASE + 'data/daily/{elem}/dly-{wsi}-{elem}.csv'
CHMI_ELEMENTS = {'TMA': 'TX', 'TMI': 'TN', 'SRA': 'RR', 'SCE': 'SN', 'SSV': 'SS', 'Fmax': 'FX'}
CHMI_MAX_STATIONS = 25
# Italie, Portugal, Slovaquie — GHCN-Daily (NOAA, domaine public pour les données des États-Unis ; voir la note OMM, docs/METEO.md)
GHCN_BASE = 'https://www.ncei.noaa.gov/pub/data/ghcn/daily/'
GHCN_COUNTRIES = {'IT': ('IT', 18), 'PO': ('PT', 8), 'LO': ('SK', 6)}  # code FIPS de GHCN → (pays ISO, combien de stations)
# 20CRv3 (NOAA PSL) : fichiers quotidiens, lus par OPeNDAP (seule la boîte voulue voyage), sinon téléchargés en entier
C20_OPENDAP = 'https://psl.noaa.gov/thredds/dodsC/Datasets/20thC_ReanV3/Dailies/'
C20_HTTP = 'https://downloads.psl.noaa.gov/Datasets/20thC_ReanV3/Dailies/'
C20_FILES = {'TN': ('2mSI/tmin.2m.{year}.nc', 'tmin'), 'TX': ('2mSI/tmax.2m.{year}.nc', 'tmax'),
             'RR': ('sfcSI/prate.{year}.nc', 'prate'), 'NN': ('miscSI/tcdc.eatm.{year}.nc', 'tcdc')}
# ERA5 (Copernicus CDS) : bibliothèque cdsapi (et ecmwf-datastores-client) + clé dans ~/.cdsapirc
ERA5_HOURLY_DATASET = 'reanalysis-era5-single-levels'

# Les boîtes (nord, ouest, sud, est)
BOX_4 = (51.6, -5.5, 41.2, 10.6)          # France, Belgique, Suisse, Luxembourg
BOX_EUROPE = (71.5, -25.0, 34.0, 45.0)
COUNTRY_BOXES = {'FR': (51.1, -5.2, 41.3, 9.6), 'BE': (51.55, 2.5, 49.45, 6.45), 'CH': (47.85, 5.9, 45.8, 10.5), 'LU': (50.2, 5.7, 49.4, 6.55)}
DEPARTEMENTS = [f'{i:02d}' for i in range(1, 96) if i != 20] + ['2A', '2B'] + ['971', '972', '973', '974', '975', '976', '984', '985', '986', '987', '988']
UA = 'LCNDA-meteo/1.0 (+https://github.com/victorbaissait/lcnda ; meteo data builder for a genealogy app)'  # en ASCII seulement : un en-tête HTTP n'accepte pas les accents ni ’


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

    def get(self, url, name, what='', binary=True, missing_ok=False, headers=None, fail_fast=()):
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
                req = urllib.request.Request(url, headers={'User-Agent': UA, **(headers or {}), **({'Range': f'bytes={have}-'} if have else {})})
                with urllib.request.urlopen(req, timeout=120) as r, open(part, 'ab' if have and r.status == 206 else 'wb') as out:
                    shutil.copyfileobj(r, out, 1 << 20)
                os.replace(part, dest)
                return dest
            except urllib.error.HTTPError as e:
                if e.code == 416 and os.path.exists(part):
                    os.replace(part, dest)
                    return dest
                if e.code in (401, 403) and headers:
                    raise Stop(f'{what or name} : accès refusé (erreur {e.code}) : la clé ou le jeton est faux ou expiré (voir docs/METEO.md).')
                if missing_ok and e.code in (403, 404):
                    open(dest + '.absent', 'w').close()
                    return None
                if e.code in fail_fast:  # une demande refusée telle quelle : inutile de réessayer la même
                    raise Stop(f'{what or name} : demande refusée (erreur {e.code}).\n  Adresse : {url}')
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


def parse_knmi(text):
    """KNMI « etmgeg_260.txt » : en-tête « # STN LON(east) LAT(north) ALT(m) NAME », puis « STN,YYYYMMDD,…,TN,…,TX,…,SQ,…,RH,…,NG,… »"""
    meta, out, head = {}, {}, None
    for line in text.splitlines():
        m = re.match(r'^#?\s*(\d{3}):?\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+(.+?)\s*$', line)
        if m and not head:
            meta[m.group(1)] = {'code': m.group(1), 'nom': m.group(5).strip().title(), 'pays': 'NL', 'lon': float(m.group(2)), 'lat': float(m.group(3)), 'alt': float(m.group(4))}
            continue
        if re.match(r'^#\s*STN,YYYYMMDD', line):
            head = [h.strip() for h in line.lstrip('#').split(',')]
            continue
        if head and line.strip() and not line.startswith('#'):
            v = dict(zip(head, [x.strip() for x in line.split(',')]))
            d = v.get('YYYYMMDD', '')
            if not re.match(r'^\d{8}$', d):
                continue
            g = lambda k: num(v.get(k))
            rh, sq, ng = g('RH'), g('SQ'), g('NG')
            out.setdefault(v['STN'], {})[int(d)] = {'TN': None if g('TN') is None else int(g('TN')), 'TX': None if g('TX') is None else int(g('TX')),
                'RR': None if rh is None else max(0, int(rh)), 'FX': None if g('FXX') is None else int(g('FXX')),
                'SS': None if sq is None else max(0, int(round(sq * 6))), 'NN': None if ng is None else int(round(min(8, ng) / 8 * 100))}
    return meta, out


def parse_dmi(features):
    """DMI « stationValue » (GeoJSON) → {stationId: {AAAAMMJJ: valeurs}}"""
    out = {}
    for f in features:
        p = f.get('properties') or {}
        k = DMI_PARAMS.get(p.get('parameterId'))
        t = str(p.get('from') or '')[:10]
        if not k or not re.match(r'^\d{4}-\d{2}-\d{2}$', t) or p.get('value') is None:
            continue
        v = float(p['value'])
        val = int(round(v * 10)) if k in ('TN', 'TX', 'RR', 'FX') else int(round(v * 60)) if k == 'SS' else int(round(v))
        out.setdefault(str(p.get('stationId')), {}).setdefault(int(t.replace('-', '')), {})[k] = val
    return out


def parse_dmi_stations(features):
    out = {}
    for f in features:
        p, g = f.get('properties') or {}, (f.get('geometry') or {}).get('coordinates') or [None, None]
        sid = str(p.get('stationId') or '')
        if sid and g[0] is not None:
            out[sid] = {'code': sid, 'nom': str(p.get('name') or sid).title(), 'pays': 'DK', 'lat': float(g[1]), 'lon': float(g[0]), 'alt': p.get('stationHeight')}
    return out


def parse_midas(text, kind='temp'):
    """MIDAS-Open (BADC-CSV) : métadonnées (observation_station, location, height), puis « data » … « end data »
    → (meta, {AAAAMMJJ: valeurs}). Températures : relevé de 9 h → la journée d'avant ; pluie : ob_date."""
    meta = {'pays': 'GB'}
    rows = list(csv.reader(io.StringIO(text)))
    days = {}
    try:
        start = next(i for i, r in enumerate(rows) if r and r[0].strip() == 'data')
    except StopIteration:
        return meta, days
    for r in rows[:start]:
        if len(r) >= 3 and r[0] == 'observation_station':
            meta['nom'] = r[2].strip().title()
        elif len(r) >= 4 and r[0] == 'location':
            meta['lat'], meta['lon'] = float(r[2]), float(r[3])
        elif len(r) >= 3 and r[0] == 'height':
            meta['alt'] = num(r[2])
        elif len(r) >= 3 and r[0] == 'midas_station_id':
            meta['code'] = r[2].strip()
    head = [h.strip() for h in rows[start + 1]]
    for r in rows[start + 2:]:
        if r and r[0].strip() == 'end data':
            break
        v = dict(zip(head, [x.strip() for x in r]))
        if kind == 'temp':
            t = v.get('ob_end_time', '')
            if not re.match(r'^\d{4}-\d{2}-\d{2} \d{2}', t) or v.get('ob_hour_count', '').strip() not in ('', '12', '24'):
                continue
            d = datetime.date(int(t[:4]), int(t[5:7]), int(t[8:10]))
            if int(t[11:13]) <= 12:
                d -= datetime.timedelta(days=1)
            x = days.setdefault(int(d.strftime('%Y%m%d')), {})
            if num(v.get('max_air_temp')) is not None:
                x['TX'] = tenth(num(v.get('max_air_temp')))
            if num(v.get('min_air_temp')) is not None:
                x['TN'] = tenth(num(v.get('min_air_temp')))
        else:
            t = v.get('ob_date', '')
            if not re.match(r'^\d{4}-\d{2}-\d{2}', t) or num(v.get('prcp_amt')) is None:
                continue
            days.setdefault(int(t[:10].replace('-', '')), {})['RR'] = tenth(num(v.get('prcp_amt')))
        if not meta.get('code'):
            meta['code'] = v.get('src_id', '')
    return meta, days


def aemet_dms(v):
    """« 402443N » → 40,41 ; « 034041W » → −3,68"""
    m = re.match(r'^(\d{2,3})(\d{2})(\d{2})([NSEW])$', str(v or '').strip())
    if not m:
        return None
    d = int(m.group(1)) + int(m.group(2)) / 60 + int(m.group(3)) / 3600
    return -d if m.group(4) in 'SW' else d


def parse_aemet(rows):
    """AEMET « valores/climatologicos/diarios » (liste JSON, virgule décimale, « Ip » = traces) → {indicativo: {AAAAMMJJ: valeurs}}"""
    out = {}
    def n(v):
        v = str(v or '').strip()
        if v in ('Ip',):
            return 0.0
        return num(v) if v not in ('Acum', 'Varias') else None
    for r in rows:
        t = str(r.get('fecha', ''))
        if not re.match(r'^\d{4}-\d{2}-\d{2}$', t):
            continue
        sol = n(r.get('sol'))
        out.setdefault(str(r.get('indicativo')), {})[int(t.replace('-', ''))] = {'TN': tenth(n(r.get('tmin'))), 'TX': tenth(n(r.get('tmax'))), 'RR': tenth(n(r.get('prec'))),
            'FX': tenth(n(r.get('racha'))), 'SS': None if sol is None else int(round(sol * 60))}
    return out


def parse_imgw(text):
    """IMGW « s_d_375_1990.csv » (synop, quotidien, sans en-tête, Windows-1250) → {code: {AAAAMMJJ: valeurs}}"""
    out = {}
    for r in csv.reader(io.StringIO(text)):
        if len(r) < 21:
            continue
        try:
            code = r[0].strip()[-3:]
            d = int(f'{int(r[2]):04d}{int(r[3]):02d}{int(r[4]):02d}')
        except ValueError:
            continue
        g = lambda i: num(r[i]) if r[i + 1].strip() != '8' else None  # statut 8 = pas de mesure
        sn, ss = g(16), g(20)
        out.setdefault(code, {})[d] = {'TX': tenth(g(5)), 'TN': tenth(g(7)), 'RR': tenth(g(13)), 'SN': None if sn is None else int(sn), 'SS': None if ss is None else int(round(ss * 60))}
    return out


def parse_chmi_meta(text):
    """ČHMÚ « meta1.csv » : WSI, GH_ID, BEGIN_DATE, END_DATE, FULL_NAME, GEOGR1 (longitude), GEOGR2 (latitude), ELEVATION"""
    out = {}
    for r in csv.DictReader(io.StringIO(text)):
        k = {a.strip().upper(): (b or '').strip() for a, b in r.items() if a}
        wsi = k.get('WSI')
        lon, lat = num(k.get('GEOGR1')), num(k.get('GEOGR2'))
        if wsi and lat is not None and lon is not None:
            out[wsi] = {'code': wsi, 'nom': (k.get('FULL_NAME') or wsi).title(), 'pays': 'CZ', 'lat': lat, 'lon': lon, 'alt': num(k.get('ELEVATION')),
                        'debut': (k.get('BEGIN_DATE') or '')[:4], 'fin': (k.get('END_DATE') or '')[:4]}
    return out


def parse_chmi(text, key):
    """ČHMÚ « dly-0-20000-0-11518-TMA.csv » : STATION, ELEMENT, VTYPE, DT, VALUE, FLAG, QUALITY → {AAAAMMJJ: {clé: valeur}}"""
    out = {}
    for r in csv.DictReader(io.StringIO(text)):
        t, v = (r.get('DT') or '')[:10], num(r.get('VALUE'))
        if v is None or not re.match(r'^\d{4}-\d{2}-\d{2}$', t):
            continue
        out[int(t.replace('-', ''))] = {key: int(round(v * 10)) if key in ('TN', 'TX', 'RR', 'FX') else int(round(v * 60)) if key == 'SS' else int(round(v))}
    return out


def parse_ghcn_stations(text, prefixes):
    """ghcnd-stations.txt (colonnes fixes) → {ID: meta} pour les pays voulus (codes FIPS des 2 premières lettres)"""
    out = {}
    for l in text.splitlines():
        sid = l[0:11].strip()
        if sid[:2] not in prefixes:
            continue
        try:
            out[sid] = {'code': sid, 'lat': float(l[12:20]), 'lon': float(l[21:30]), 'alt': num(l[31:37]), 'nom': l[41:71].strip().title(), 'pays': prefixes[sid[:2]]}
        except ValueError:
            continue
    return out


def parse_ghcn_inventory(text):
    """ghcnd-inventory.txt → {ID: années de TMAX}"""
    out = {}
    for l in text.splitlines():
        p = l.split()
        if len(p) >= 6 and p[3] == 'TMAX':
            out[p[0]] = int(p[5]) - int(p[4]) + 1
    return out


def parse_ghcn(text):
    """GHCN-Daily « by_station/ITE00100554.csv » : ID, AAAAMMJJ, ÉLÉMENT, VALEUR (dixièmes), drapeaux → {AAAAMMJJ: valeurs}"""
    days = {}
    for r in csv.reader(io.StringIO(text)):
        if len(r) < 4 or not re.match(r'^\d{8}$', r[1]) or (len(r) > 5 and r[5].strip()):  # QFLAG rempli = valeur douteuse
            continue
        k = {'TMAX': 'TX', 'TMIN': 'TN', 'PRCP': 'RR', 'SNWD': 'SN', 'TSUN': 'SS', 'WSFG': 'FX'}.get(r[2])
        if not k:
            continue
        v = int(r[3])
        days.setdefault(int(r[1]), {})[k] = v // 10 if k == 'SN' else v
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


def irm_pages(net, url_for, prefix, count, test=False):
    """les pages d'une demande WFS (startIndex) → textes CSV ; Stop si le serveur refuse la première"""
    texts, start = [], 0
    while True:
        try:
            p = net.get(url_for(count, start), f'{prefix}-{start}.csv', 'IRM (relevés quotidiens)', fail_fast=(400,))
        except Stop:
            if net.offline and start:
                break
            raise
        t = open_text(p)
        texts.append(t)
        if test or t.count('\n') < count:
            break
        start += count
    return texts


def do_irm(net, work, years, test=False):
    """IRM / KMI : les relevés quotidiens par pages triées (sortBy) ; si le serveur refuse, une année à la fois (CQL_FILTER)"""
    if work.done('be'):
        return
    st_text = open_text(net.get(IRM_STATIONS, 'irm-aws_station.csv', 'IRM (stations)'))
    texts, errors = None, []
    tries = [('irm-aws_1day', lambda c, s0: IRM_DAILY.format(count=c, start=s0)),  # l'ancienne demande (fichiers déjà gardés, essais hors ligne)
             ('irm-aws_1day-tri', lambda c, s0: IRM_DAILY_SORTED.format(count=c, start=s0, sort=urllib.parse.quote('code ASC,timestamp ASC'))),
             ('irm-aws_1day-tri-ts', lambda c, s0: IRM_DAILY_SORTED.format(count=c, start=s0, sort=urllib.parse.quote('timestamp ASC')))]
    for prefix, url_for in tries:
        try:
            texts = irm_pages(net, url_for, prefix, 10000, test)
            break
        except Stop as e:
            errors.append(str(e).splitlines()[0])
            if net.offline:
                raise
    if texts is None:  # dernier essai : une année à la fois, sans pages (≈ 30 stations × 366 jours)
        texts = []
        for y in range(max(IRM_FIRST_YEAR, years[0]), years[1] + 1):
            cql = urllib.parse.quote(f"timestamp >= '{y}-01-01T00:00:00Z' AND timestamp < '{y + 1}-01-01T00:00:00Z'")
            try:
                texts.append(open_text(net.get(IRM_DAILY_YEAR.format(cql=cql), f'irm-aws_1day-{y}.csv', f'IRM (relevés {y})', fail_fast=(400,))))
            except Stop as e:
                raise Stop('IRM : le serveur refuse toutes les demandes des relevés quotidiens.\n  ' + '\n  '.join(errors + [str(e).splitlines()[0]]))
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
    # seulement les longues séries (au moins DWD_MIN_YEARS ans dans le nom du fichier)
    zips = [z for z in zips if int(z.split('_')[4][:4]) - int(z.split('_')[3][:4]) + 1 >= DWD_MIN_YEARS] or zips
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


# ── Pack Europe : une fonction par source. Chacune reprend où elle s'était arrêtée (work.done) et lève Stop avec une phrase
#    claire si la source ne répond pas ou demande une clé : le pack se fabrique quand même sans elle (europe_sources). ──
def _keep(work, source, metas, days_by, years):
    n = 0
    for code, days in days_by.items():
        m = metas.get(code)
        if m and m.get('lat') is not None and days:
            fill_clouds(days, m['lat'])
            work.add_daily(source, m, days, years); n += 1
    return n


def do_knmi(net, work, years, test=False):
    if work.done('knmi'):
        return
    n = 0
    for stn in (KNMI_STATIONS[:2] if test else KNMI_STATIONS):
        if work.done('knmi-' + stn):
            continue
        p = net.get(KNMI_DAILY.format(stn=stn), f'knmi-etmgeg_{stn}.zip', f'KNMI {stn}', missing_ok=True)
        if p:
            meta, days = parse_knmi(open_text(p))
            n += _keep(work, 'knmi', meta, days, years)
        work.mark('knmi-' + stn)
    say(f'   • KNMI (Pays-Bas) : {plural(n, "station")}')
    work.mark('knmi')


def do_dmi(net, work, years, key='', test=False):
    if work.done('dmi'):
        return
    hk = {'X-Gravitee-Api-Key': key} if key else None
    q = lambda extra: '&'.join(f'{k}={urllib.parse.quote(str(v))}' for k, v in extra.items()) + (f'&api-key={key}' if key else '')
    st = net.json(f'{DMI_API}/station/items?{q({"limit": 10000})}', 'dmi-stations.json', 'DMI (stations)')
    metas = parse_dmi_stations(st.get('features', []))
    n = 0
    for sid in (DMI_STATIONS[:2] if test else DMI_STATIONS):
        if work.done('dmi-' + sid) or sid not in metas:
            continue
        feats, off = [], 0
        while True:
            name = f'dmi-{sid}-{off}.json'
            d = net.json(f'{DMI_API}/stationValue/items?{q({"stationId": sid, "timeResolution": "day", "limit": 300000, "offset": off})}', name, f'DMI {sid}')
            fs = d.get('features', [])
            feats += fs
            if len(fs) < 300000 or test:
                break
            off += 300000
        n += _keep(work, 'dmi', metas, {sid: parse_dmi(feats).get(sid, {})}, years)
        work.mark('dmi-' + sid)
    say(f'   • DMI (Danemark) : {plural(n, "station")}')
    work.mark('dmi')


def do_midas(net, work, years, token='', test=False):
    """Met Office MIDAS-Open (CEDA) : la liste des stations (métadonnées), les plus longues séries, puis un fichier par an"""
    if work.done('midas'):
        return
    if not token and not net.offline:
        raise Stop('MIDAS-Open (Royaume-Uni) demande un jeton CEDA : crée un compte gratuit sur ceda.ac.uk, puis mets le jeton dans la variable CEDA_TOKEN ou --ceda-jeton (voir docs/METEO.md).')
    hk = {'Authorization': f'Bearer {token}'} if token else None
    base = f'{MIDAS_BASE}{MIDAS_TEMP}/{MIDAS_VERSION}/'
    meta_name = f'midas-open_{MIDAS_TEMP}_dv-{MIDAS_VERSION.split("-")[-1]}_station-metadata.csv'
    p = net.get(base + meta_name, meta_name, 'MIDAS-Open (stations)', headers=hk)
    rows = list(csv.reader(io.StringIO(open_text(p))))
    start = next((i for i, r in enumerate(rows) if r and r[0].strip() == 'data'), -1)
    head = [h.strip() for h in rows[start + 1]] if start >= 0 else []
    stations = []
    for r in rows[start + 2:]:
        if not r or r[0].strip() == 'end data':
            break
        v = dict(zip(head, [x.strip() for x in r]))
        try:
            stations.append((int(v.get('last_year', 0)) - int(v.get('first_year', 0)), v))
        except ValueError:
            continue
    stations.sort(key=lambda x: x[0], reverse=True)
    n = 0
    for _, v in stations[:2 if test else MIDAS_MAX_STATIONS]:
        sid, county, name = v.get('src_id', '').zfill(5), v.get('historic_county', '').lower().replace(' ', '-'), v.get('station_file_name') or v.get('station_name', '').lower().replace(' ', '-')
        step = 'midas-' + sid
        if work.done(step):
            continue
        days, meta = {}, None
        y0, y1 = max(years[0], int(v.get('first_year') or years[0])), min(years[1], int(v.get('last_year') or years[1]))
        for kind, ds in (('temp', MIDAS_TEMP), ('rain', MIDAS_RAIN)):
            for y in range(y0, y1 + 1):
                fn = f'midas-open_{ds}_dv-{MIDAS_VERSION.split("-")[-1]}_{county}_{sid}_{name}_qcv-1_{y}.csv'
                url = f'{MIDAS_BASE}{ds}/{MIDAS_VERSION}/{county}/{sid}_{name}/qc-version-1/{fn}'
                fp = net.get(url, fn, f'MIDAS {name} {y}', missing_ok=True, headers=hk)
                if not fp:
                    continue
                m, d = parse_midas(open_text(fp), kind)
                meta = meta or m
                for k, x in d.items():
                    days.setdefault(k, {}).update(x)
        if meta and meta.get('lat') is not None:
            meta['code'] = sid
            meta.setdefault('nom', v.get('station_name', sid).title())
            work.add_daily('midas', meta, fill_clouds(days, meta['lat']), years); n += 1
        work.mark(step)
    say(f'   • MIDAS-Open (Royaume-Uni) : {plural(n, "station")}')
    work.mark('midas')


def do_aemet(net, work, years, key='', test=False):
    """AEMET OpenData : l'inventaire des stations, puis les relevés quotidiens par tranches de quelques années (deux appels :
    la réponse donne l'adresse des données)"""
    if work.done('aemet'):
        return
    if not key and not net.offline:
        raise Stop('AEMET (Espagne) demande une clé gratuite : demande-la sur opendata.aemet.es (« Obtención de API Key »), puis mets-la dans AEMET_API_KEY ou --aemet-cle (voir docs/METEO.md).')
    def two_step(url, name, what):
        if net.offline:
            return net.json('', name, what)
        first = net.json(f'{url}?api_key={key}', name + '.lien.json', what)
        if not first.get('datos'):
            raise Stop(f'{what} : {first.get("descripcion") or "pas de données"}')
        return net.json(first['datos'], name, what)
    inv = two_step(f'{AEMET_API}/valores/climatologicos/inventarioestaciones/todasestaciones', 'aemet-inventaire.json', 'AEMET (stations)')
    metas = {}
    for r in inv:
        lat, lon = aemet_dms(r.get('latitud')), aemet_dms(r.get('longitud'))
        if lat is not None:
            metas[str(r.get('indicativo'))] = {'code': str(r.get('indicativo')), 'nom': str(r.get('nombre', '')).title(), 'pays': 'ES', 'lat': lat, 'lon': lon, 'alt': num(str(r.get('altitud', '')))}
    n = 0
    for ind in (AEMET_STATIONS[:1] if test else AEMET_STATIONS):
        if work.done('aemet-' + ind) or ind not in metas:
            continue
        days = {}
        for y in range(max(1920, years[0]), years[1] + 1, AEMET_CHUNK_YEARS):
            y2 = min(years[1], y + AEMET_CHUNK_YEARS - 1)
            url = f'{AEMET_API}/valores/climatologicos/diarios/datos/fechaini/{y}-01-01T00:00:00UTC/fechafin/{y2}-12-31T23:59:59UTC/estacion/{ind}'
            try:
                rows = two_step(url, f'aemet-{ind}-{y}.json', f'AEMET {ind} {y}–{y2}')
            except Stop as e:
                if 'No hay datos' in str(e) or 'pas de données' in str(e):
                    continue
                raise
            days.update(parse_aemet(rows).get(ind, {}))
            time.sleep(0 if net.offline else 1.5)  # AEMET limite le nombre d'appels par minute
        n += _keep(work, 'aemet', metas, {ind: days}, years)
        work.mark('aemet-' + ind)
    say(f'   • AEMET (Espagne) : {plural(n, "station")}')
    work.mark('aemet')


def do_imgw(net, work, years, test=False):
    """IMGW-PIB : un zip par station et par an depuis 2001, par tranches de 5 ans avant (1951–1955…)"""
    if work.done('imgw'):
        return
    n = 0
    for code, (nom, lat, lon, alt) in (list(IMGW_STATIONS.items())[:1] if test else IMGW_STATIONS.items()):
        if work.done('imgw-' + code):
            continue
        days = {}
        periods = [(y, y + 4) for y in range(1951, 2001, 5)] + [(y, y) for y in range(2001, years[1] + 1)]
        for a, b in periods:
            if b < years[0] or a > years[1]:
                continue
            folder = f'{a}_{b}' if a != b else f'{a}'
            name = f'{folder}_{code}_s.zip'
            p = net.get(f'{IMGW_BASE}{folder}/{name}', f'imgw-{name}', f'IMGW {nom} {folder}', missing_ok=True)
            if not p:
                continue
            with zipfile.ZipFile(p) as z:
                for zn in z.namelist():
                    if re.match(r'^s_d_\d', os.path.basename(zn)):
                        days.update(parse_imgw(z.read(zn).decode('cp1250', 'replace')).get(code, {}))
            if test:
                break
        n += _keep(work, 'imgw', {code: {'code': code, 'nom': nom, 'pays': 'PL', 'lat': lat, 'lon': lon, 'alt': alt}}, {code: days}, years)
        work.mark('imgw-' + code)
    say(f'   • IMGW-PIB (Pologne) : {plural(n, "station")}')
    work.mark('imgw')


def do_chmi(net, work, years, test=False):
    """ČHMÚ : les métadonnées, les plus longues séries, puis un fichier par élément"""
    if work.done('chmi'):
        return
    metas = parse_chmi_meta(open_text(net.get(CHMI_META, 'chmi-meta1.csv', 'ČHMÚ (stations)')))
    best = sorted(metas.values(), key=lambda m: (int(m['fin'] or 0) - int(m['debut'] or 9999)), reverse=True)[:2 if test else CHMI_MAX_STATIONS]
    n = 0
    for m in best:
        wsi = m['code']
        if work.done('chmi-' + wsi):
            continue
        days = {}
        for elem, key in CHMI_ELEMENTS.items():
            p = net.get(CHMI_DAILY.format(elem=elem, wsi=wsi), f'chmi-dly-{wsi}-{elem}.csv', f'ČHMÚ {m["nom"]} {elem}', missing_ok=True)
            if p:
                for d, v in parse_chmi(open_text(p), key).items():
                    days.setdefault(d, {}).update(v)
        n += _keep(work, 'chmi', {wsi: m}, {wsi: days}, years)
        work.mark('chmi-' + wsi)
    say(f'   • ČHMÚ (Tchéquie) : {plural(n, "station")}')
    work.mark('chmi')


def do_ghcn(net, work, years, test=False):
    """GHCN-Daily pour l'Italie, le Portugal et la Slovaquie : les plus longues séries de températures"""
    if work.done('ghcn'):
        return
    metas = parse_ghcn_stations(open_text(net.get(GHCN_BASE + 'ghcnd-stations.txt', 'ghcnd-stations.txt', 'GHCN (stations)')), {k: v[0] for k, v in GHCN_COUNTRIES.items()})
    inv = parse_ghcn_inventory(open_text(net.get(GHCN_BASE + 'ghcnd-inventory.txt', 'ghcnd-inventory.txt', 'GHCN (inventaire)')))
    n = 0
    for fips, (iso, howmany) in GHCN_COUNTRIES.items():
        ids = sorted([i for i in metas if i.startswith(fips) and i in inv], key=lambda i: inv[i], reverse=True)[:1 if test else howmany]
        for sid in ids:
            if work.done('ghcn-' + sid):
                continue
            p = net.get(f'{GHCN_BASE}by_station/{sid}.csv.gz', f'ghcn-{sid}.csv.gz', f'GHCN {metas[sid]["nom"]}', missing_ok=True)
            if p:
                n += _keep(work, 'ghcn', metas, {sid: parse_ghcn(open_text(p))}, years)
            work.mark('ghcn-' + sid)
    say(f'   • GHCN-Daily (Italie, Portugal, Slovaquie) : {plural(n, "station")}')
    work.mark('ghcn')


EUROPE_SOURCES = ['dwd', 'knmi', 'dmi', 'midas', 'aemet', 'imgw', 'chmi', 'ghcn']


def europe_sources(net, work, years, a):
    """les stations du pack Europe : chaque source à part ; une source qui ne répond pas (ou sans sa clé) est sautée avec un message"""
    want = [x.strip() for x in (a.sources_europe or ','.join(EUROPE_SOURCES)).split(',') if x.strip()]
    if a.sans_ghcn and 'ghcn' in want:
        want.remove('ghcn')
    done = []
    for src in want:
        fn = {'dwd': lambda: do_dwd(net, work, years, a.test), 'knmi': lambda: do_knmi(net, work, years, a.test),
              'dmi': lambda: do_dmi(net, work, years, a.dmi_cle or os.environ.get('DMI_API_KEY', ''), a.test),
              'midas': lambda: do_midas(net, work, years, a.ceda_jeton or os.environ.get('CEDA_TOKEN', ''), a.test),
              'aemet': lambda: do_aemet(net, work, years, a.aemet_cle or os.environ.get('AEMET_API_KEY', ''), a.test),
              'imgw': lambda: do_imgw(net, work, years, a.test), 'chmi': lambda: do_chmi(net, work, years, a.test),
              'ghcn': lambda: do_ghcn(net, work, years, a.test)}.get(src)
        if not fn:
            say(f'   ⚠️ source inconnue : {src} (au choix : {", ".join(EUROPE_SOURCES)})')
            continue
        try:
            fn(); done.append(src)
        except Stop as e:
            say(f'   ⚠️ {src} sauté : {str(e).splitlines()[0]}\n      Le pack se fabrique sans elle ; relance plus tard pour l’ajouter (le reste ne sera pas refait).')
    return done


# ═══════════════════════ Les packs du monde (GHCN-Daily, NOAA) : un pack par continent ═══════════════════════
# Une station GHCN = un fichier by_station/<ID>.csv.gz (toutes les années, tous les éléments). On prend les plus longues séries
# de TMAX, bien réparties (pas deux stations trop proches), en laissant de côté ce qui est déjà dans les autres packs :
#   - France, Belgique, Suisse, Luxembourg (socle et pack complet : toutes les stations), Allemagne et Pays-Bas (pack Europe :
#     DWD et KNMI, presque toutes les longues séries) ;
#   - les stations GHCN déjà prises par le pack Europe (Italie, Portugal, Slovaquie : do_ghcn, même choix refait ici).
# L'app saute aussi, à la lecture, une station d'un pack du monde à moins de 3 km d'une station d'un autre pack (lib/meteo.php).
# Code FIPS de GHCN (2 premières lettres de l'identifiant) → (pays ISO, continent) ; « - » : pas pris.
GHCN_FIPS = {
    'AC': ('AG', 'amerique-nord'), 'AE': ('AE', 'asie'), 'AF': ('AF', 'asie'), 'AG': ('DZ', 'afrique'), 'AJ': ('AZ', 'asie'), 'AL': ('AL', 'europe'),
    'AM': ('AM', 'asie'), 'AO': ('AO', 'afrique'), 'AQ': ('AS', 'oceanie'), 'AR': ('AR', 'amerique-sud'), 'AS': ('AU', 'oceanie'), 'AU': ('AT', 'europe'),
    'AY': ('AQ', '-'), 'BA': ('BH', 'asie'), 'BB': ('BB', 'amerique-nord'), 'BC': ('BW', 'afrique'), 'BD': ('BM', 'amerique-nord'), 'BE': ('BE', '-'),
    'BF': ('BS', 'amerique-nord'), 'BG': ('BD', 'asie'), 'BH': ('BZ', 'amerique-nord'), 'BK': ('BA', 'europe'), 'BL': ('BO', 'amerique-sud'), 'BM': ('MM', 'asie'),
    'BN': ('BJ', 'afrique'), 'BO': ('BY', 'europe'), 'BP': ('SB', 'oceanie'), 'BR': ('BR', 'amerique-sud'), 'BU': ('BG', 'europe'), 'BX': ('BN', 'asie'),
    'BY': ('BI', 'afrique'), 'CA': ('CA', 'amerique-nord'), 'CB': ('KH', 'asie'), 'CD': ('TD', 'afrique'), 'CE': ('LK', 'asie'), 'CF': ('CG', 'afrique'),
    'CG': ('CD', 'afrique'), 'CH': ('CN', 'asie'), 'CI': ('CL', 'amerique-sud'), 'CJ': ('KY', 'amerique-nord'), 'CK': ('CC', 'oceanie'), 'CM': ('CM', 'afrique'),
    'CO': ('CO', 'amerique-sud'), 'CQ': ('MP', 'oceanie'), 'CS': ('CR', 'amerique-nord'), 'CT': ('CF', 'afrique'), 'CU': ('CU', 'amerique-nord'), 'CV': ('CV', 'afrique'),
    'CW': ('CK', 'oceanie'), 'CY': ('CY', 'europe'), 'DA': ('DK', 'europe'), 'DO': ('DM', 'amerique-nord'), 'DR': ('DO', 'amerique-nord'), 'EC': ('EC', 'amerique-sud'),
    'EG': ('EG', 'afrique'), 'EI': ('IE', 'europe'), 'EK': ('GQ', 'afrique'), 'EN': ('EE', 'europe'), 'ER': ('ER', 'afrique'), 'ES': ('SV', 'amerique-nord'),
    'ET': ('ET', 'afrique'), 'EU': ('TF', 'afrique'), 'EZ': ('CZ', 'europe'), 'FG': ('GF', 'amerique-sud'), 'FI': ('FI', 'europe'), 'FJ': ('FJ', 'oceanie'),
    'FK': ('FK', 'amerique-sud'), 'FM': ('FM', 'oceanie'), 'FP': ('PF', 'oceanie'), 'FR': ('FR', '-'), 'FS': ('TF', '-'), 'GA': ('GM', 'afrique'),
    'GB': ('GA', 'afrique'), 'GG': ('GE', 'asie'), 'GH': ('GH', 'afrique'), 'GI': ('GI', 'europe'), 'GL': ('GL', 'amerique-nord'), 'GM': ('DE', '-'),
    'GP': ('GP', 'amerique-nord'), 'GQ': ('GU', 'oceanie'), 'GR': ('GR', 'europe'), 'GT': ('GT', 'amerique-nord'), 'GV': ('GN', 'afrique'), 'GY': ('GY', 'amerique-sud'),
    'HO': ('HN', 'amerique-nord'), 'HR': ('HR', 'europe'), 'HU': ('HU', 'europe'), 'IC': ('IS', 'europe'), 'ID': ('ID', 'asie'), 'IN': ('IN', 'asie'),
    'IO': ('IO', 'asie'), 'IR': ('IR', 'asie'), 'IS': ('IL', 'asie'), 'IT': ('IT', 'europe'), 'IV': ('CI', 'afrique'), 'IZ': ('IQ', 'asie'),
    'JA': ('JP', 'asie'), 'JM': ('JM', 'amerique-nord'), 'JN': ('SJ', 'europe'), 'JO': ('JO', 'asie'), 'JQ': ('UM', 'oceanie'), 'JU': ('TF', 'afrique'),
    'KE': ('KE', 'afrique'), 'KG': ('KG', 'asie'), 'KN': ('KP', 'asie'), 'KR': ('KI', 'oceanie'), 'KS': ('KR', 'asie'), 'KT': ('CX', 'oceanie'),
    'KU': ('KW', 'asie'), 'KZ': ('KZ', 'asie'), 'LA': ('LA', 'asie'), 'LE': ('LB', 'asie'), 'LG': ('LV', 'europe'), 'LH': ('LT', 'europe'),
    'LI': ('LR', 'afrique'), 'LO': ('SK', 'europe'), 'LQ': ('UM', 'oceanie'), 'LT': ('LS', 'afrique'), 'LU': ('LU', '-'), 'LY': ('LY', 'afrique'),
    'MA': ('MG', 'afrique'), 'MB': ('MQ', 'amerique-nord'), 'MC': ('MO', 'asie'), 'MD': ('MD', 'europe'), 'MF': ('YT', 'afrique'), 'MG': ('MN', 'asie'),
    'MI': ('MW', 'afrique'), 'MJ': ('ME', 'europe'), 'MK': ('MK', 'europe'), 'ML': ('ML', 'afrique'), 'MO': ('MA', 'afrique'), 'MP': ('MU', 'afrique'),
    'MQ': ('UM', 'oceanie'), 'MR': ('MR', 'afrique'), 'MT': ('MT', 'europe'), 'MU': ('OM', 'asie'), 'MV': ('MV', 'asie'), 'MX': ('MX', 'amerique-nord'),
    'MY': ('MY', 'asie'), 'MZ': ('MZ', 'afrique'), 'NC': ('NC', 'oceanie'), 'NE': ('NU', 'oceanie'), 'NF': ('NF', 'oceanie'), 'NG': ('NE', 'afrique'),
    'NH': ('VU', 'oceanie'), 'NI': ('NG', 'afrique'), 'NL': ('NL', '-'), 'NN': ('SX', 'amerique-nord'), 'NO': ('NO', 'europe'), 'NP': ('NP', 'asie'),
    'NS': ('SR', 'amerique-sud'), 'NU': ('NI', 'amerique-nord'), 'NZ': ('NZ', 'oceanie'), 'PA': ('PY', 'amerique-sud'), 'PC': ('PN', 'oceanie'), 'PE': ('PE', 'amerique-sud'),
    'PK': ('PK', 'asie'), 'PL': ('PL', 'europe'), 'PM': ('PA', 'amerique-nord'), 'PO': ('PT', 'europe'), 'PP': ('PG', 'oceanie'), 'PS': ('PW', 'oceanie'),
    'PU': ('GW', 'afrique'), 'QA': ('QA', 'asie'), 'RE': ('RE', 'afrique'), 'RI': ('RS', 'europe'), 'RM': ('MH', 'oceanie'), 'RO': ('RO', 'europe'),
    'RP': ('PH', 'asie'), 'RQ': ('PR', 'amerique-nord'), 'RS': ('RU', 'europe'), 'RW': ('RW', 'afrique'), 'SA': ('SA', 'asie'), 'SB': ('PM', 'amerique-nord'),
    'SE': ('SC', 'afrique'), 'SF': ('ZA', 'afrique'), 'SG': ('SN', 'afrique'), 'SH': ('SH', 'afrique'), 'SI': ('SI', 'europe'), 'SL': ('SL', 'afrique'),
    'SN': ('SG', 'asie'), 'SP': ('ES', 'europe'), 'ST': ('LC', 'amerique-nord'), 'SU': ('SD', 'afrique'), 'SV': ('SJ', 'europe'), 'SW': ('SE', 'europe'),
    'SX': ('GS', 'amerique-sud'), 'SY': ('SY', 'asie'), 'SZ': ('CH', '-'), 'TD': ('TT', 'amerique-nord'), 'TE': ('TF', 'afrique'), 'TH': ('TH', 'asie'),
    'TI': ('TJ', 'asie'), 'TL': ('TK', 'oceanie'), 'TN': ('TO', 'oceanie'), 'TO': ('TG', 'afrique'), 'TS': ('TN', 'afrique'), 'TU': ('TR', 'asie'),
    'TV': ('TV', 'oceanie'), 'TX': ('TM', 'asie'), 'TZ': ('TZ', 'afrique'), 'UC': ('CW', 'amerique-nord'), 'UG': ('UG', 'afrique'), 'UK': ('GB', 'europe'),
    'UP': ('UA', 'europe'), 'US': ('US', 'amerique-nord'), 'UV': ('BF', 'afrique'), 'UY': ('UY', 'amerique-sud'), 'UZ': ('UZ', 'asie'), 'VE': ('VE', 'amerique-sud'),
    'VM': ('VN', 'asie'), 'VQ': ('VI', 'amerique-nord'), 'WA': ('NA', 'afrique'), 'WF': ('WF', 'oceanie'), 'WI': ('EH', 'afrique'), 'WQ': ('UM', 'oceanie'),
    'WZ': ('SZ', 'afrique'), 'ZA': ('ZM', 'afrique'), 'ZI': ('ZW', 'afrique'),
}
WORLD_URAL_LON = 60.0  # Russie : à l'ouest de l'Oural → Europe, à l'est → Asie
# région → (titre, combien de stations au plus, distance minimale entre deux stations en km, années de TMAX au moins)
# (la taille d'un pack : ≈ 1,2 Ko par station et par année ; voir la ligne de chaque pack dans heritage-meteo.js)
WORLD_REGIONS = {
    'amerique-nord': ('Amérique du Nord', 2500, 45.0, 30),
    'amerique-sud': ('Amérique du Sud', 800, 35.0, 15),
    'afrique': ('Afrique', 800, 35.0, 15),
    'asie': ('Asie', 1800, 40.0, 20),
    'oceanie': ('Océanie', 1000, 35.0, 20),
    'europe': ('Europe (hors pack Europe)', 1200, 30.0, 20),
}
WORLD_KINDS = ['monde-' + r for r in WORLD_REGIONS]
# éléments GHCN → colonnes ; WT** (phénomènes du jour) → bits de WW
GHCN_WT_BITS = {'WT01': F.WW_FOG, 'WT02': F.WW_FOG, 'WT21': F.WW_FOG, 'WT22': F.WW_FOG, 'WT03': F.WW_STORM, 'WT04': F.WW_HAIL, 'WT05': F.WW_HAIL,
                'WT18': F.WW_SNOW, 'WT06': F.WW_ICE, 'WT15': F.WW_ICE, 'WT17': F.WW_ICE, 'WT13': F.WW_MIST}


def ghcn_region(sid, lon):
    """la région d'une station GHCN (None : pas dans les packs du monde)"""
    iso, reg = GHCN_FIPS.get(sid[:2], ('', '-'))
    if sid[:2] == 'RS':
        reg = 'europe' if lon < WORLD_URAL_LON else 'asie'
    return None if reg == '-' else reg


def parse_ghcn_world(text):
    """comme parse_ghcn, avec en plus : la neige tombée (SNOW) quand la hauteur au sol (SNWD) manque, les nuages (ACMH),
    et les phénomènes (WT** : brouillard, orage, grêle, neige, verglas, brume)"""
    days = {}
    fresh = {}
    for r in csv.reader(io.StringIO(text)):
        if len(r) < 4 or not re.match(r'^\d{8}$', r[1]) or (len(r) > 5 and r[5].strip()):
            continue
        el = r[2]
        try:
            v = int(r[3])
        except ValueError:
            continue
        d = int(r[1])
        k = {'TMAX': 'TX', 'TMIN': 'TN', 'PRCP': 'RR', 'SNWD': 'SN', 'TSUN': 'SS', 'WSFG': 'FX', 'ACMH': 'NN'}.get(el)
        if k:
            if k in ('TX', 'TN') and not -900 <= v <= 650:  # au-delà de −90 °C / +65 °C : une erreur de saisie
                continue
            days.setdefault(d, {})[k] = v // 10 if k == 'SN' else v
        elif el == 'SNOW':
            fresh[d] = v
            if v > 0:
                x = days.setdefault(d, {})
                x['WW'] = (x.get('WW') or 0) | F.WW_SNOW
        elif el in GHCN_WT_BITS and v:
            x = days.setdefault(d, {})
            x['WW'] = (x.get('WW') or 0) | GHCN_WT_BITS[el]
    for d, v in fresh.items():  # neige tombée en mm → cm, seulement quand la hauteur au sol n'est pas donnée
        x = days.setdefault(d, {})
        if x.get('SN') is None:
            x['SN'] = v // 10
    return days


def europe_ghcn_ids(metas, inv):
    """les stations GHCN que le pack Europe prend déjà (même choix que do_ghcn, hors essai)"""
    out = set()
    for fips, (iso, howmany) in GHCN_COUNTRIES.items():
        ids = sorted([i for i in metas if i.startswith(fips) and i in inv], key=lambda i: inv[i], reverse=True)[:howmany]
        out.update(ids)
    return out


def ghcn_world_candidates(stations_text, inventory_text, region, min_years):
    """les stations d'une région → [(ID, pays ISO, lat, lon, années de TMAX, première année)], plus longue série d'abord"""
    span, first = {}, {}
    for l in inventory_text.splitlines():
        p = l.split()
        if len(p) >= 6 and p[3] == 'TMAX':
            span[p[0]] = int(p[5]) - int(p[4]) + 1
            first[p[0]] = int(p[4])
    eu = europe_ghcn_ids(parse_ghcn_stations(stations_text, {k: v[0] for k, v in GHCN_COUNTRIES.items()}), span)
    rows, metas = [], {}
    for l in stations_text.splitlines():
        sid = l[0:11].strip()
        if sid not in span or span[sid] < min_years or sid in eu:
            continue
        try:
            lat, lon = float(l[12:20]), float(l[21:30])
        except ValueError:
            continue
        if ghcn_region(sid, lon) != region:
            continue
        iso = GHCN_FIPS[sid[:2]][0]
        metas[sid] = {'code': sid, 'lat': lat, 'lon': lon, 'alt': (None if num(l[31:37]) in (None, -999.9) else num(l[31:37])), 'nom': l[41:71].strip().title(), 'pays': iso}
        rows.append((sid, iso, lat, lon, span[sid], first[sid]))
    rows.sort(key=lambda r: (-(r[4] + max(0, 1900 - r[5]) * 0.5), r[0]))
    return rows, metas


def select_spread(rows, n, min_km):
    """les n meilleures (rows déjà rangées, meilleure d'abord), sans deux stations à moins de min_km ; la distance baisse
    (× 0,7) tant qu'il en manque. Recherche des voisines par cases de 1° (rapide même pour 20 000 stations)."""
    picked, taken = [], set()
    cells = {}

    def near(lat, lon, d):
        dl = int(d / 111.0) + 1
        dlo = int(d / max(5.0, 111.0 * math.cos(math.radians(lat)))) + 1
        ci, cj = int(math.floor(lat)), int(math.floor(lon))
        for i in range(ci - dl, ci + dl + 1):
            for j in range(cj - dlo, cj + dlo + 1):
                for (a, b) in cells.get((i, ((j + 180) % 360) - 180), ()):
                    if haversine(lat, lon, a, b) < d:
                        return True
        return False
    d = min_km
    while len(picked) < n and d >= 3:
        for r in rows:
            if len(picked) >= n:
                break
            if r[0] in taken or near(r[2], r[3], d):
                continue
            picked.append(r)
            taken.add(r[0])
            cells.setdefault((int(math.floor(r[2])), int(math.floor(r[3]))), []).append((r[2], r[3]))
        d *= 0.7
    return [r[0] for r in picked]


def do_world(net, work, region, years, n=None, test=False):
    """les stations GHCN d'une région : choisies, téléchargées une à une (reprise), lues, puis le fichier est effacé
    (il n'en reste que les blocs : le dossier de travail reste petit, même pour 2 500 stations)"""
    title, howmany, min_km, min_years = WORLD_REGIONS[region]
    step = 'monde-' + region
    st_text = open_text(net.get(GHCN_BASE + 'ghcnd-stations.txt', 'ghcnd-stations.txt', 'GHCN (stations)'))
    inv_text = open_text(net.get(GHCN_BASE + 'ghcnd-inventory.txt', 'ghcnd-inventory.txt', 'GHCN (inventaire)'))
    rows, metas = ghcn_world_candidates(st_text, inv_text, region, 1 if test else min_years)
    ids = select_spread(rows, 3 if test else (n or howmany), min_km)
    say(f'   {title} : {plural(len(rows), "station")} avec ≥ {min_years} ans de températures, {len(ids)} choisies')
    got = 0
    for k, sid in enumerate(ids):
        if work.done('ghcn-' + sid):
            got += 1
            continue
        p = net.get(f'{GHCN_BASE}by_station/{sid}.csv.gz', f'ghcn-{sid}.csv.gz', f'GHCN {metas[sid]["nom"]}', missing_ok=True)
        if p:
            if work.add_daily('ghcn', metas[sid], parse_ghcn_world(open_text(p)), years):
                got += 1
            work.db.commit()
            if not net.offline:
                os.remove(p)
        work.mark('ghcn-' + sid)
        if (k + 1) % 100 == 0:
            say(f'   … {k + 1} / {len(ids)}')
    say(f'   • GHCN-Daily ({title}) : {plural(got, "station")}')
    work.mark(step)
    return ids


def build_world(net, out, region, years, a):
    """meteo-monde-<région>.sqlite puis meteo-pack-monde-<région>.lcmeteo"""
    kind = 'monde-' + region
    title = WORLD_REGIONS[region][0]
    work = Work(os.path.join(out, 'travail', f'stations-{kind}.sqlite'))
    ids = do_world(net, work, region, years, a.stations_monde, a.test)
    work.compute_scores()
    # seulement les stations qui ont au moins un an de températures en tout (l'inventaire promet parfois plus qu'il n'y a)
    want = set(ids)
    keep = [sid for sid, code in work.db.execute('SELECT s.id, s.code FROM stations s JOIN score c ON c.station_id=s.id WHERE c.good >= 365 ORDER BY s.id') if code in want]
    path = os.path.join(out, f'meteo-{kind}.sqlite')
    if os.path.exists(path):
        os.remove(path)
    db = F.open_db(path, kind, title)
    pays = sorted({r[0] for r in work.db.execute(f'SELECT DISTINCT pays FROM stations WHERE id IN ({",".join(str(i) for i in keep) or "0"})')})
    F.set_meta(db, countries=kind.upper(), station_countries=','.join(pays), region=region)
    F.add_sources(db, ['ghcn'], a.until)
    db.execute("UPDATE sources SET contenu=?, annees=? WHERE id='ghcn'", (f'Les plus longues séries de stations ({title}), chaque jour : températures, pluie, neige', '≈ 1760 → aujourd’hui'))
    copy_stations(work.db, db, keep)
    write_normals(db, 'station', 'daily', 'station_id')
    db.close()
    say(f'   {plural(len(keep), "station")} dans le pack, {len(pays)} pays')
    finish(path, out, kind, page_size=16384)


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

            def open_full():
                # sans OPeNDAP : le fichier entier (≈ 50 Mo) dans les téléchargements
                if net is None:
                    raise Stop(f'20CR {y} : fichier inaccessible ({url}).')
                return nc.Dataset(net.get(C20_HTTP + path.format(year=y), f'20cr-{var}-{y}.nc', f'20CR {var} {y}'))
            import numpy as np  # livré avec netCDF4

            def read(ds):
                la = ds.variables['lat'][:]
                lo = ds.variables['lon'][:]
                li = [i for i, x in enumerate(la) if s_ - 1 <= x <= n_ + 1]
                oi = [i for i, x in enumerate(lo) if (w_ - 1) % 360 <= x <= 360 or x <= e_ + 1] if w_ < 0 else [i for i, x in enumerate(lo) if w_ - 1 <= x <= e_ + 1]
                # seulement la boîte (par morceaux de longitudes contiguës : par OPeNDAP, seul ce morceau voyage)
                runs, start = [], oi[0]
                for prev, cur in zip(oi, oi[1:] + [None]):
                    if cur != prev + 1:
                        runs.append((start, prev)); start = cur
                v = ds.variables[var]
                return la, lo, li, oi, np.concatenate([v[:, min(li):max(li) + 1, r0:r1 + 1] for r0, r1 in runs], axis=2)
            # le serveur OPeNDAP coupe parfois (« NetCDF: Access failure ») : 3 essais par OPeNDAP, puis le fichier entier
            got = None
            for essai in range(5):
                ds = None
                try:
                    ds = nc.Dataset(url) if essai < 3 else open_full()
                    got = read(ds)
                    break
                except (RuntimeError, OSError) as err:
                    print(f'   … 20CR {y} {var} : lecture coupée ({err}) — nouvel essai', flush=True)
                    time.sleep(10 * (essai + 1))
                finally:
                    if ds is not None:
                        try:
                            ds.close()
                        except Exception:
                            pass
            if got is None:
                raise Stop(f'20CR {y} : lecture impossible après plusieurs essais ({url}).')
            la, lo, li, oi, data = got
            lats = [float(la[i]) for i in range(min(li), max(li) + 1)]
            lons = [float(lo[i]) for i in oi]
            cols[k] = (data, list(range(len(oi))))
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
    """le client du Climate Data Store (bibliothèque ecmwf-datastores-client, installée avec cdsapi) : il sait déposer une
    demande SANS l'attendre, puis la retrouver par son numéro (même d'une fabrication à l'autre)"""
    try:
        from ecmwf.datastores import Client
    except ImportError:
        raise Stop('ERA5 a besoin de la bibliothèque cdsapi (avec ecmwf-datastores-client) : tape « pip3 install cdsapi netCDF4 », crée ton compte Copernicus et ta clé (docs/METEO.md), puis relance (ou ajoute --sans-era5).')
    import meteo_plus as P
    url, key = P.read_rc()
    if not key:
        raise Stop('ERA5 : la clé Copernicus manque. Suis l’étape « Le compte Copernicus » de docs/METEO.md (fichier .cdsapirc).')
    try:  # quelques essais seulement en cas de panne du serveur : la boucle des demandes réessaie d'elle-même plus tard
        return Client(url=url, key=key, progress=False, maximum_tries=6, retry_after=30, sleep_max=60)
    except Exception as e:  # noqa: BLE001 — le message ne contient jamais la clé
        raise Stop(f'ERA5 : la clé Copernicus manque ou est fausse ({type(e).__name__}). Suis l’étape « Le compte Copernicus » de docs/METEO.md (fichier .cdsapirc).')


def nc_var(ds, *names):
    for n in names:
        if n in ds.variables:
            return ds.variables[n]
    raise Stop('ERA5 : variable introuvable (' + ', '.join(names) + ') — le format de Copernicus a peut-être changé.')


# ERA5 : les heures de « reanalysis-era5-single-levels » (rapide à servir), les statistiques du jour calculées ici
# (min., max., moyenne des 24 heures 00–23 UTC : exactement ce que fait « derived-era5-single-levels-daily-statistics »,
# dont chaque demande attendait des heures dans la file de Copernicus).
ERA5_VARS = {'t2m': ('2m_temperature', ('t2m',)), 'fg': ('10m_wind_gust_since_previous_post_processing', ('fg10', 'i10fg')),
             'tp': ('total_precipitation', ('tp',)), 'tcc': ('total_cloud_cover', ('tcc',)), 'sf': ('snowfall', ('sf',))}
ERA5_DAILY = (('TN', 't2m', 'min'), ('TX', 't2m', 'max'), ('FX', 'fg', 'max'), ('RR', 'tp', 'mean'), ('SN', 'sf', 'mean'), ('NN', 'tcc', 'mean'))
ERA5_HOURLY = (('T', 't2m'), ('RR', 'tp'), ('FX', 'fg'), ('NN', 'tcc'))
ERA5_STATE = 'era5-demandes.json'


class Era5Queue:
    """les demandes ERA5 déposées chez Copernicus, sans les attendre une à une :
    - leur numéro est écrit dans <cache>/era5-demandes.json dès le dépôt : une fabrication coupée (6 h de GitHub) les retrouve
      à la suivante, déjà avancées ou finies dans la file, au lieu de les redéposer en dernière position ;
    - au plus `in_flight` demandes à la fois ; une demande encore en file après `stale_s` ne garde plus sa place : la suivante
      part quand même (au plus `in_flight_max` en tout) ;
    - toutes les `log_s` secondes, une ligne dit où en est chaque demande (en file / en cours, depuis combien de temps) ;
    - « trop gros » pour Copernicus → les demandes suivantes portent sur moins de mois."""

    def __init__(self, client, cache, months_per=3, in_flight=6, in_flight_max=12, stale_s=90 * 60, poll_s=60, log_s=600,
                 clock=time.time, sleep=time.sleep):
        self.c, self.cache = client, cache
        self.in_flight, self.in_flight_max, self.stale_s, self.poll_s, self.log_s = in_flight, in_flight_max, stale_s, poll_s, log_s
        self.clock, self.sleep = clock, sleep
        self.path = os.path.join(cache, ERA5_STATE)
        st = {}
        if os.path.exists(self.path):
            try:
                with open(self.path, encoding='utf-8') as f:
                    st = json.load(f)
            except (OSError, ValueError):
                st = {}
        self.months_per = int(st.get('mois') or months_per)
        self.jobs = st.get('demandes') or {}   # étiquette → {id, depuis, jeu, annee, mois}
        self.tries = st.get('essais') or {}    # étiquette → combien de fois déposée (oublié une fois le fichier reçu)
        self.remotes, self.status, self.last_log = {}, {}, 0.0

    def save(self):
        tmp = self.path + '.part'
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump({'mois': self.months_per, 'demandes': self.jobs, 'essais': self.tries}, f, indent=1)
        os.replace(tmp, self.path)

    def submit(self, label, dataset, req, extra=None):
        r = self.c.submit(dataset, req)
        self.jobs[label] = dict(extra or {}, id=r.request_id, depuis=self.clock(), jeu=dataset)
        self.tries[label] = self.tries.get(label, 0) + 1
        self.remotes[label] = r
        self.status[label] = 'accepted'
        self.save()
        say(f'     ERA5 {label} : demande déposée chez Copernicus')

    def remote(self, label):
        if label not in self.remotes:
            self.remotes[label] = self.c.get_remote(self.jobs[label]['id'])
        return self.remotes[label]

    def forget(self, label, done=False):
        if done:
            self.tries.pop(label, None)
        self.jobs.pop(label, None)
        self.remotes.pop(label, None)
        self.status.pop(label, None)
        self.save()

    def active(self):
        """les demandes qui comptent pour une place : en cours chez Copernicus, ou en file depuis moins de stale_s"""
        now = self.clock()
        return [k for k, j in self.jobs.items() if self.status.get(k) == 'running' or now - j['depuis'] < self.stale_s]

    def has_room(self):
        return len(self.jobs) < self.in_flight_max and len(self.active()) < self.in_flight

    def poll(self, label):
        """→ 'successful' / 'accepted' / 'running' / 'gone' (à redéposer) / ('failed', message)"""
        try:
            r = self.remote(label)
            s = r.status
        except Exception as e:  # noqa: BLE001
            code = getattr(getattr(e, 'response', None), 'status_code', None)
            if code in (404, 410):
                return 'gone'
            say(f'     ERA5 {label} : Copernicus ne répond pas ({type(e).__name__}) — on réessaiera')
            self.remotes.pop(label, None)
            return self.status.get(label, 'accepted')
        self.status[label] = s
        if s in ('failed', 'rejected'):
            try:
                r.results_ready
                msg = s
            except Exception as e:  # noqa: BLE001
                msg = str(e)
            return ('failed', msg)
        if s in ('dismissed', 'deleted'):
            return 'gone'
        return s

    def download(self, label, target):
        r = self.remote(label)
        r.download(target + '.part')
        os.replace(target + '.part', target)
        try:  # le résultat est chez nous : Copernicus peut l'effacer
            r.delete()
        except Exception:  # noqa: BLE001
            pass

    def report(self, force=False):
        now = self.clock()
        if not self.jobs or (not force and now - self.last_log < self.log_s):
            return
        self.last_log = now
        words = {'accepted': 'en file', 'running': 'en cours', 'successful': 'prête'}
        parts = [f'{k} {words.get(self.status.get(k, "accepted"), self.status.get(k))} ({int((now - j["depuis"]) // 60)} min)'
                 for k, j in sorted(self.jobs.items())]
        say('     ERA5 chez Copernicus : ' + ' · '.join(parts))

    def wait_one(self, label, dataset, req, target):
        """une petite demande attendue tout de suite (la carte terre/mer), avec la même reprise par numéro"""
        while not os.path.exists(target):
            if label not in self.jobs:
                self.submit(label, dataset, req)
            s = self.poll(label)
            if s == 'successful':
                self.download(label, target)
                self.forget(label, done=True)
            elif s == 'gone':
                self.forget(label)
            elif isinstance(s, tuple):
                raise Stop(f'ERA5 : Copernicus refuse la demande {label} : {s[1]}')
            else:
                self.report()
                self.sleep(self.poll_s)


def era5_month_groups(months, per):
    """[1..12], 3 → [[1,2,3],[4,5,6],…] (des mois qui se suivent)"""
    out, cur = [], []
    for m in months:
        if cur and (m != cur[-1] + 1 or len(cur) >= per):
            out.append(cur)
            cur = []
        cur.append(m)
    if cur:
        out.append(cur)
    return out


def era5_label(y, ms):
    return f'{y}-{ms[0]:02d}-{ms[-1]:02d}'


def era5_reduce(nc, raw, y, ms, pts, nlat, nlon, hours_step, out):
    """un fichier reçu (des mois d'une année, toutes les heures) → pour les carreaux gardés : les 6 valeurs de chaque jour et les
    4 valeurs toutes les hours_step heures, dans <out> (.npz, quelques Mo) ; le gros fichier est ensuite effacé"""
    import numpy as np
    import warnings
    import meteo_plus as P
    t0 = datetime.datetime(y, ms[0], 1)
    t1 = datetime.datetime(y + 1, 1, 1) if ms[-1] == 12 else datetime.datetime(y, ms[-1] + 1, 1)
    nh = int((t1 - t0).total_seconds() // 3600)
    A, Bx = np.array([p[0] for p in pts], dtype=int), np.array([p[1] for p in pts], dtype=int)
    got = {k: np.full((nh, len(pts)), np.nan, dtype='f4') for k in ERA5_VARS}
    seen = set()
    files = [f for f in P.unpack(raw, raw + '.d') if f.lower().endswith('.nc') or not os.path.splitext(f)[1]]
    for fp in files:
        ds = nc.Dataset(fp)
        try:
            tv = next((ds.variables[n] for n in ('valid_time', 'time') if n in ds.variables), None)
            if tv is None:
                raise Stop('ERA5 : pas d’axe du temps dans le fichier reçu — le format de Copernicus a peut-être changé.')
            times = nc.num2date(tv[:], tv.units, getattr(tv, 'calendar', 'standard'), only_use_cftime_datetimes=False, only_use_python_datetimes=True)
            idx = np.array([int(round((datetime.datetime(t.year, t.month, t.day, t.hour) - t0).total_seconds() / 3600)) for t in times], dtype=int)
            ok = (idx >= 0) & (idx < nh)
            for k, (_, names) in ERA5_VARS.items():
                v = next((ds.variables[n] for n in names if n in ds.variables), None)
                if v is None:
                    continue
                if len(ds.variables[next(n for n in ('latitude', 'lat') if n in ds.variables)]) != nlat or \
                        len(ds.variables[next(n for n in ('longitude', 'lon') if n in ds.variables)]) != nlon:
                    raise Stop('ERA5 : la grille reçue n’est pas celle de la carte terre/mer — le format de Copernicus a peut-être changé.')
                a = np.ma.filled(v[:].astype('f4'), np.nan)
                if a.ndim == 4:  # ancien format : une dimension « expver » (ERA5 / ERA5T) → la valeur présente
                    b = a[:, 0]
                    for e in range(1, a.shape[1]):
                        b = np.where(np.isnan(b), a[:, e], b)
                    a = b
                got[k][idx[ok]] = a[ok][:, A, Bx]
                seen.add(k)
        finally:
            ds.close()
    miss = [ERA5_VARS[k][0] for k in ERA5_VARS if k not in seen]
    if miss:
        raise Stop('ERA5 : variable introuvable dans le fichier reçu (' + ', '.join(miss) + ') — le format de Copernicus a peut-être changé.')
    nd = nh // 24
    with warnings.catch_warnings():
        warnings.simplefilter('ignore', RuntimeWarning)  # un jour sans aucune valeur → NaN (écrit « pas de valeur »)
        f = {'min': np.nanmin, 'max': np.nanmax, 'mean': np.nanmean}
        daily = np.stack([f[op](got[k].reshape(nd, 24, len(pts)), axis=1) for _, k, op in ERA5_DAILY]).astype('f4')
    hourly = np.stack([got[k][::hours_step] for _, k in ERA5_HOURLY]).astype('f4')
    with open(out + '.part', 'wb') as fh:
        np.savez_compressed(fh, daily=daily, hourly=hourly, months=np.array(ms))
    os.replace(out + '.part', out)
    shutil.rmtree(raw + '.d', ignore_errors=True)
    os.remove(raw)


def era5_write_year(db, y, ids, parts, hours_step, test):
    """les morceaux réduits d'une année (dans l'ordre des mois) → les blocs du jour et des heures de chaque carreau"""
    import numpy as np
    daily = np.concatenate([p['daily'] for p in parts], axis=1)
    hourly = np.concatenate([p['hourly'] for p in parts], axis=1)
    nd = daily.shape[1]
    nrows = F.days_in_year(y) if not test else nd
    hrows = nrows * (24 // hours_step)
    conv_d = {'TN': lambda v: (v - 273.15) * 10, 'TX': lambda v: (v - 273.15) * 10, 'FX': lambda v: v * 10,
              'RR': lambda v: v * 24 * 1000 * 10, 'SN': lambda v: v * 24 * 1000 / 10, 'NN': lambda v: v * 100}
    conv_h = {'T': lambda v: (v - 273.15) * 10, 'RR': lambda v: v * 1000 * 10 * hours_step, 'FX': lambda v: v * 10, 'NN': lambda v: v * 100}
    D = {c: np.rint(conv_d[c](daily[i].astype('f8'))) for i, (c, _, _) in enumerate(ERA5_DAILY)}
    H = {c: np.rint(conv_h[c](hourly[i].astype('f8'))) for i, (c, _) in enumerate(ERA5_HOURLY)}
    order = {'TN': 0, 'TX': 1, 'RR': 2, 'SN': 3, 'FX': 4, 'NN': 5}  # l'ordre des colonnes d'avant
    col = lambda arr, j, n: ([None if x != x else int(x) for x in arr[:, j].tolist()] + [None] * n)[:n]
    for j, gid in enumerate(ids):
        d = [(c, col(D[c], j, nrows)) for c in sorted(D, key=order.get)]
        db.execute('INSERT OR REPLACE INTO grid_daily(grid_id, annee, blob) VALUES(?,?,?)', (gid, y, F.encode(d)))
        h = [(c, col(H[c], j, hrows)) for c, _ in ERA5_HOURLY]
        db.execute('INSERT OR REPLACE INTO grid_hourly(grid_id, annee, blob) VALUES(?,?,?)', (gid, y, F.encode(h, step=hours_step)))
    db.execute("UPDATE grid SET debut=MIN(COALESCE(debut, ?), ?), fin=MAX(COALESCE(fin, ?), ?), heures_debut=MIN(COALESCE(heures_debut, ?), ?) WHERE source='era5'", (y, y, y, y, y, y))
    F.set_meta(db, **{f'era5-{y}': 'ok'})
    db.commit()


def do_era5(db, years, box, boxes, cache, hours_step=6, test=False, client=None, queue_opts=None):
    """ERA5 : chaque jour (min, max, pluie, rafales, nuages, neige) et des heures (toutes les hours_step heures), carreaux sur terre
    seulement. Les heures de plusieurs mois et des 5 variables viennent d'une seule demande ; plusieurs demandes attendent en même
    temps chez Copernicus ; chaque année finie est rangée tout de suite et ses fichiers effacés (rien n'est redemandé)."""
    import glob as _glob
    import numpy as np
    import meteo_plus as P
    nc = need_netcdf('ERA5')
    os.makedirs(cache, exist_ok=True)
    big = (box[0] - box[2]) * (box[3] - box[1]) > 400 or hours_step == 1  # le pack Europe : un mois par demande
    q = Era5Queue(client or cds_client(), cache, **dict({'months_per': 1 if big else 3}, **(queue_opts or {})))
    area = [box[0], box[1], box[2], box[3]]
    for old in _glob.glob(os.path.join(cache, 'era5-*-daily_*.nc')) + _glob.glob(os.path.join(cache, 'era5-*-heures*.nc')):
        os.remove(old)  # les fichiers de l'ancienne façon (une demande par statistique du jour) : plus lus
    lsm_p = os.path.join(cache, 'era5-lsm.nc')
    q.wait_one('terre-mer', ERA5_HOURLY_DATASET, {'product_type': ['reanalysis'], 'variable': ['land_sea_mask', 'geopotential'], 'year': ['2000'], 'month': ['01'],
                                                        'day': ['01'], 'time': ['00:00'], 'area': area, 'data_format': 'netcdf', 'download_format': 'unarchived'}, lsm_p)
    ds = nc.Dataset(lsm_p)
    lats = [float(x) for x in nc_var(ds, 'latitude', 'lat')[:]]
    lons = [float(x) for x in nc_var(ds, 'longitude', 'lon')[:]]
    lsm = nc_var(ds, 'lsm')[0]
    zz = nc_var(ds, 'z')[0]
    keep = [(a, b) for a in range(len(lats)) for b in range(len(lons)) if float(lsm[a, b]) > 0.2 and in_boxes(lats[a], lons[b], boxes)]
    ds.close()
    g = Grid(db, 'era5', 0.25)
    ids = [g.id(lats[a], lons[b], round(float(zz[a, b]) / 9.80665)) for a, b in keep]
    say(f'   • ERA5 : {len(ids)} carreaux sur terre')
    first, last = max(1940, years[0]), min(years[1], datetime.date.today().year - 1)
    todo = [y for y in range(first, last + 1) if not db.execute('SELECT 1 FROM meta WHERE key=?', (f'era5-{y}',)).fetchone()]
    if test:
        todo = todo[:1]
    say(f'   ERA5 : {plural(len(todo), "année")} à faire ({first}–{last}), {q.months_per} mois par demande, {q.in_flight} demandes à la fois')
    all_months = [1] if test else list(range(1, 13))
    days = [f'{d:02d}' for d in range(1, 32)]
    hours = [f'{h:02d}:00' for h in range(24)]

    def reduced(y):
        """les morceaux déjà réduits d'une année : {premier mois: (mois, fichier)}"""
        out = {}
        for p in _glob.glob(os.path.join(cache, f'era5-{y}-??-??.npz')):
            m0, m1 = (int(x) for x in os.path.basename(p)[10:15].split('-'))
            out[m0] = (list(range(m0, m1 + 1)), p)
        return out

    def plan():
        """les morceaux qui restent à demander, dans l'ordre des années"""
        asked = {(j['annee'], m) for j in q.jobs.values() if 'annee' in j for m in j['mois']}
        out = []
        for y in todo:
            have = {m for ms, _ in reduced(y).values() for m in ms}
            left = [m for m in all_months if m not in have and (y, m) not in asked]
            out += [(y, ms) for ms in era5_month_groups(left, q.months_per)]
        return out

    def finish_years():
        for y in list(todo):
            parts = reduced(y)
            if sorted(m for ms, _ in parts.values() for m in ms) != all_months:
                continue
            loaded = []
            for m0 in sorted(parts):
                with np.load(parts[m0][1]) as z:
                    loaded.append({'daily': z['daily'], 'hourly': z['hourly']})
            era5_write_year(db, y, ids, loaded, hours_step, test)
            for _, p in parts.values():
                os.remove(p)
            todo.remove(y)
            say(f'   • ERA5 {y} ({plural(len(todo), "année")} encore)')

    finish_years()
    while todo:
        busy = False
        for y, ms in plan():
            if not q.has_room():
                break
            req = {'product_type': ['reanalysis'], 'variable': [v for v, _ in ERA5_VARS.values()], 'year': [str(y)], 'month': [f'{m:02d}' for m in ms],
                   'day': days, 'time': hours, 'area': area, 'data_format': 'netcdf', 'download_format': 'unarchived'}
            try:
                q.submit(era5_label(y, ms), ERA5_HOURLY_DATASET, req, {'annee': y, 'mois': ms})
            except Exception as e:  # noqa: BLE001 — Copernicus peut refuser dès le dépôt (« cost limits exceeded »)
                msg = f'{e} {getattr(getattr(e, "response", None), "text", "") or ""}'
                if P.TOO_LARGE.search(msg) and q.months_per > 1:
                    q.months_per = max(1, q.months_per // 2)
                    q.save()
                    say(f'     ERA5 {era5_label(y, ms)} : « trop gros » pour Copernicus → {q.months_per} mois par demande désormais')
                    busy = True
                elif P.TOO_LARGE.search(msg):
                    raise Stop(f'ERA5 : Copernicus refuse même un mois de demande ({era5_label(y, ms)}) : {msg.strip()[:300]}')
                else:
                    say(f'     ERA5 {era5_label(y, ms)} : dépôt impossible pour l’instant ({type(e).__name__}) — on réessaiera')
                break
            busy = True
        for label in sorted(q.jobs):
            j = q.jobs[label]
            if 'annee' not in j:
                continue
            s = q.poll(label)
            if s == 'successful':
                raw = os.path.join(cache, f'era5-{label}.nc')
                say(f'     ERA5 {label} : prête, téléchargement…')
                try:
                    q.download(label, raw)
                except Exception as e:  # noqa: BLE001 — coupure : le résultat reste chez Copernicus, on le reprendra
                    say(f'     ERA5 {label} : téléchargement interrompu ({type(e).__name__}) — on réessaiera')
                    q.remotes.pop(label, None)
                    continue
                era5_reduce(nc, raw, j['annee'], j['mois'], keep, len(lats), len(lons), hours_step, os.path.join(cache, f'era5-{label}.npz'))
                q.forget(label, done=True)
                finish_years()
                busy = True
            elif s == 'gone':
                say(f'     ERA5 {label} : Copernicus ne la connaît plus — redemandée')
                q.forget(label)
                busy = True
            elif isinstance(s, tuple):
                msg = s[1].strip().splitlines()[0][:300] if s[1].strip() else 'échec'
                if P.TOO_LARGE.search(s[1]) and q.months_per > 1:
                    q.months_per = max(1, q.months_per // 2)
                    say(f'     ERA5 {label} : « trop gros » pour Copernicus → {q.months_per} mois par demande désormais')
                elif q.tries.get(label, 1) >= 3:
                    q.save()
                    raise Stop(f'ERA5 : Copernicus refuse la demande {label} trois fois : {msg}')
                else:
                    say(f'     ERA5 {label} : échec chez Copernicus ({msg}) — redemandée plus tard')
                q.forget(label)
                busy = True
        q.report()
        if not busy:
            q.sleep(q.poll_s)

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


def box_tiles(boxes):
    """les carrés de 1° (coin sud-ouest) qui touchent des boîtes (nord, ouest, sud, est)"""
    return sorted({(la, lo) for n_, w_, s_, e_ in boxes for la in range(math.floor(s_), math.ceil(n_)) for lo in range(math.floor(w_), math.ceil(e_))})


# Les pays du socle pour l'ALTITUDE seulement (la météo reste France, Belgique, Suisse, Luxembourg) — codes ISO 3166
ALT_COUNTRIES = ['FR', 'BE', 'CH', 'LU', 'IT', 'NL', 'ES', 'DE', 'PT', 'GB', 'PL', 'DK', 'CZ', 'SK']
ALT_WINDOW = (72, -32, 27, 33)  # nord, ouest, sud, est : l'Europe, Açores, Madère et Canaries comprises
# leurs contours simplifiés : Natural Earth 1:50 m (domaine public), le fichier des cartes de l'app
WORLD_50M = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'assets', 'data', 'geo', 'monde-50m.json')
# à défaut de contours : des boîtes par pays, îles comprises (Corse, Sardaigne, Sicile, Baléares, Canaries, Madère, Açores, Bornholm…)
ALT_BOXES = {
    'FR': [(51.1, -5.2, 41.3, 9.6)], 'BE': [(51.55, 2.5, 49.45, 6.45)], 'CH': [(47.85, 5.9, 45.8, 10.5)], 'LU': [(50.2, 5.7, 49.4, 6.55)],
    'IT': [(47.1, 6.6, 37.9, 18.6), (38.4, 12.3, 36.6, 15.7), (41.3, 8.1, 38.8, 9.9), (35.6, 12.3, 35.4, 12.7)], 'NL': [(53.6, 3.3, 50.7, 7.3)],
    'ES': [(43.8, -9.4, 36.0, 3.4), (40.1, 1.1, 38.6, 4.4), (29.5, -18.2, 27.6, -13.4), (35.95, -5.4, 35.2, -2.9)], 'DE': [(55.1, 5.8, 47.2, 15.1)],
    'PT': [(42.2, -9.6, 36.9, -6.1), (33.2, -17.3, 32.4, -16.2), (39.8, -31.3, 36.9, -24.9)], 'GB': [(60.9, -8.7, 49.8, 1.8)],
    'PL': [(54.9, 14.1, 49.0, 24.2)], 'DK': [(57.8, 8.0, 54.5, 12.7), (55.3, 14.6, 54.9, 15.2)], 'CZ': [(51.1, 12.0, 48.5, 18.9)], 'SK': [(49.7, 16.8, 47.7, 22.6)],
}


def country_rings(codes, path=WORLD_50M):
    """les contours (anneaux de [lon, lat]) des pays, lus dans le TopoJSON des cartes de l'app ; {} si le fichier manque"""
    try:
        with open(path, encoding='utf-8') as f:
            d = json.load(f)
    except (OSError, ValueError):
        return {}
    t = d.get('topo', d)
    sx, sy = t['transform']['scale']; tx, ty = t['transform']['translate']
    arcs = []
    for arc in t['arcs']:
        x = y = 0; pts = []
        for dx, dy in arc:
            x += dx; y += dy; pts.append((x * sx + tx, y * sy + ty))
        arcs.append(pts)
    def ring(ids):
        out = []
        for i in ids:
            pts = arcs[i] if i >= 0 else arcs[~i][::-1]
            out += pts if not out else pts[1:]
        return out
    res = {}
    for obj in t['objects'].values():
        for g in obj.get('geometries', []):
            code = (g.get('properties') or {}).get('i')
            if code not in codes:
                continue
            polys = [g['arcs']] if g['type'] == 'Polygon' else g['arcs'] if g['type'] == 'MultiPolygon' else []
            res.setdefault(code, []).extend([[ring(r) for r in poly] for poly in polys])
    return res


def _inside(x, y, rings):
    ins = False
    for r in rings:
        for k in range(len(r)):
            (x1, y1), (x2, y2) = r[k - 1], r[k]
            if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / ((y2 - y1) or 1e-12) + x1:
                ins = not ins
    return ins


def country_tiles(codes, path=WORLD_50M, margin=0.08):
    """les carrés de 1° qui touchent ces pays : un sommet du contour dans le carré (un peu élargi), ou un coin / le centre du
    carré dans le pays. Sans contours : les boîtes ALT_BOXES. Les carrés en mer sont ensuite sautés (fichier absent)."""
    rings = country_rings(set(codes), path)
    tiles = set()
    for code in codes:
        polys = rings.get(code)
        if not polys:
            tiles.update(box_tiles(ALT_BOXES.get(code, [])))
            continue
        for poly in polys:
            pts = [p for r in poly for p in r]
            for lon, lat in pts:
                for la in {math.floor(lat - margin), math.floor(lat + margin)}:
                    for lo in {math.floor(lon - margin), math.floor(lon + margin)}:
                        tiles.add((la, lo))
            xs, ys = [p[0] for p in pts], [p[1] for p in pts]
            for la in range(math.floor(min(ys)), math.ceil(max(ys))):
                for lo in range(math.floor(min(xs)), math.ceil(max(xs))):
                    if (la, lo) not in tiles and any(_inside(lo + dx, la + dy, poly) for dx, dy in ((0.5, 0.5), (0, 0), (1, 0), (0, 1), (1, 1))):
                        tiles.add((la, lo))
    # seulement l'Europe et ses îles de l'Atlantique (Canaries, Madère, Açores) : pas l'outre-mer (Guyane, Antilles, Réunion…)
    return sorted(t for t in tiles if ALT_WINDOW[2] <= t[0] < ALT_WINDOW[0] and ALT_WINDOW[1] <= t[1] < ALT_WINDOW[3])


def do_altitudes(net, db, boxes=None, work_path=None, test=False, tiles=None):
    """la grille des altitudes (30″) des carrés de 1° voulus (tiles, ou ceux qui touchent les boîtes) ; gardée dans travail/altitudes.sqlite pour reprendre"""
    wk = sqlite3.connect(work_path)
    wk.executescript(F.SCHEMA)
    wk.execute('CREATE TABLE IF NOT EXISTS absent(lat0 INTEGER, lon0 INTEGER, PRIMARY KEY(lat0, lon0))')
    tiles = sorted(set(tiles)) if tiles is not None else box_tiles(boxes or [])
    want = set(tiles)
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
        if (la, lo) in want:
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


def finish(path, out_dir, kind, wrap=True, page_size=None):
    db = sqlite3.connect(path)
    F.set_meta(db, built=datetime.date.today().isoformat())
    db.commit()
    if page_size:  # des pages plus grandes : les blocs (≈ 700 octets) se rangent sans place perdue (pack du monde ≈ 2,4 fois plus petit)
        db.execute(f'PRAGMA page_size={int(page_size)}')
    db.execute('VACUUM')
    db.close()
    say(f'   ✓ {os.path.basename(path)} : {size_text(os.path.getsize(path))}')
    if wrap:
        lc = os.path.join(out_dir, f'meteo-pack-{kind}.lcmeteo' if kind != 'socle' else 'meteo-socle.lcmeteo')
        F.wrap_pack(path, lc)
        say(f'   ✓ {os.path.basename(lc)} (à importer dans l’app) : {size_text(os.path.getsize(lc))}')


def main(argv=None):
    ap = argparse.ArgumentParser(description='Fabrique les données de la « Météo d’autrefois » de LCNDA (voir docs/METEO.md).')
    ap.add_argument('quoi', nargs='?', default='socle', choices=['socle', 'complet', 'europe', 'altitudes', 'tout', 'monde'] + WORLD_KINDS + PLUS_KINDS)
    ap.add_argument('--test', action='store_true', help='essai rapide : le Gers (32), une année, quelques stations')
    ap.add_argument('--dossier', default='meteo-sortie')
    ap.add_argument('--hors-ligne', dest='offline')
    ap.add_argument('--sans-era5', action='store_true')
    ap.add_argument('--sans-20cr', action='store_true')
    ap.add_argument('--sans-altitudes', action='store_true', help='sans la grille des altitudes (Copernicus DEM)')
    ap.add_argument('--altitudes-europe', action='store_true', help='aussi la grille des altitudes de toute l’Europe dans le pack Europe (long : ≈ 2 600 carrés à lire)')
    ap.add_argument('--stations', type=int, default=300)
    ap.add_argument('--depuis', type=int, default=None, help='première année (1836 ; 1750 pour les packs du monde)')
    ap.add_argument('--jusqu-a', dest='until', type=int, default=datetime.date.today().year)
    ap.add_argument('--departements', default='')
    ap.add_argument('--meteolux-csv')
    ap.add_argument('--sources-europe', default='', help='les sources du pack Europe, séparées par des virgules : ' + ','.join(EUROPE_SOURCES))
    ap.add_argument('--sans-ghcn', action='store_true', help='sans GHCN-Daily (Italie, Portugal, Slovaquie)')
    ap.add_argument('--aemet-cle', default='', help='la clé AEMET OpenData (sinon la variable AEMET_API_KEY)')
    ap.add_argument('--ceda-jeton', default='', help='le jeton CEDA pour MIDAS-Open (sinon la variable CEDA_TOKEN)')
    ap.add_argument('--dmi-cle', default='', help='la clé DMI si elle est demandée (sinon la variable DMI_API_KEY)')
    ap.add_argument('--stations-monde', type=int, default=0, help='combien de stations au plus dans un pack du monde (sinon : le nombre prévu pour la région)')
    a = ap.parse_args(argv)
    if a.quoi in PLUS_KINDS:  # les compléments Copernicus : des packs à part (scripts/meteo/meteo_plus.py), le socle n'est pas touché
        return build_plus(a)
    world = WORLD_KINDS if a.quoi == 'monde' else [a.quoi] if a.quoi in WORLD_KINDS else []
    if a.depuis is None:
        a.depuis = 1750 if world else 1836
    if a.test:
        a.departements = a.departements or '32'
        a.depuis = max(a.depuis, a.until - 1)
    out = os.path.abspath(a.dossier + ('-test' if a.test and a.dossier == 'meteo-sortie' else ''))
    os.makedirs(out, exist_ok=True)
    net = Net(os.path.join(out, 'telechargements'), a.offline)
    os.makedirs(os.path.join(out, 'travail'), exist_ok=True)
    years = (a.depuis, a.until)
    deps = [d.strip() for d in a.departements.split(',') if d.strip()] or DEPARTEMENTS
    kinds = ['socle', 'complet', 'europe'] if a.quoi == 'tout' else world if world else [a.quoi]
    t0 = time.time()
    try:
        say(f'🌦 Météo d’autrefois — fabrication : {", ".join(kinds)}{" (essai)" if a.test else ""}\n   dossier : {out}')
        for k in world:
            say(f'Pack du monde : {WORLD_REGIONS[k[6:]][0]} (GHCN-Daily, NOAA)')
            build_world(net, out, k[6:], years, a)
        work = Work(os.path.join(out, 'travail', 'stations.sqlite')) if not world else None
        if {'socle', 'complet'} & set(kinds):
            say('1. Les stations (France, Suisse, Belgique, Luxembourg)')
            do_meteofrance(net, work, deps, years, hourly='complet' in kinds)
            for fn, args in ((do_meteoswiss, (net, work, years, {'GVE'} if a.test else None)), (do_irm, (net, work, years, a.test)), (do_meteolux, (net, work, years, a.meteolux_csv))):
                try:
                    fn(*args)
                except Stop as e:
                    if a.offline:
                        say(f'   (hors ligne : {fn.__name__[3:]} ignoré — {str(e).splitlines()[0]})')
                    elif fn in (do_irm, do_meteolux):  # sources facultatives : le pack se fabrique sans elles (relancer plus tard pour les ajouter)
                        say(f'   ⚠️ {fn.__name__[3:]} sauté : {str(e).splitlines()[0]}\n      Le pack se fabrique sans lui ; relance plus tard pour l’ajouter (le reste ne sera pas refait).')
                        print(f'::warning::{fn.__name__[3:]} sauté : {str(e).splitlines()[0]}', flush=True)
                    else:
                        raise
            work.compute_scores()
        if 'europe' in kinds:
            say('1b. Les stations d’Europe (DWD, KNMI, DMI, MIDAS-Open, AEMET, IMGW, ČHMÚ, GHCN)')
            europe_done = europe_sources(net, work, years, a)
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
            got = {r[0] for r in work.db.execute(f'SELECT DISTINCT source FROM stations WHERE id IN ({",".join(str(i) for i in chosen) or "0"})')}
            F.add_sources(db, [x for x in ['meteofrance', 'meteoswiss', 'irm', 'meteolux'] if x in got], a.until)
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
                tiles = country_tiles(ALT_COUNTRIES)
                say(f'   {len(tiles)} carrés de 1° touchent {len(ALT_COUNTRIES)} pays (ceux en mer seront sautés)')
                do_altitudes(net, db, None, os.path.join(out, 'travail', 'altitudes.sqlite'), a.test, tiles=tiles)
                F.set_meta(db, relief_countries=','.join(ALT_COUNTRIES))
            db.close()
            finish(path, out, 'socle')
        if a.quoi == 'altitudes':
            say('Les altitudes (Copernicus DEM GLO-90, grille de 30″), rangées dans le socle')
            path = os.path.join(out, 'meteo-socle.sqlite')
            db = sqlite3.connect(path) if os.path.exists(path) else F.open_db(path, 'socle', 'Socle')
            db.executescript(F.SCHEMA)
            F.add_sources(db, ['copdem'], a.until)
            tiles = country_tiles(ALT_COUNTRIES)
            say(f'   {len(tiles)} carrés de 1° touchent {len(ALT_COUNTRIES)} pays (ceux en mer seront sautés)')
            do_altitudes(net, db, None, os.path.join(out, 'travail', 'altitudes.sqlite'), a.test, tiles=tiles)
            F.set_meta(db, relief_countries=','.join(ALT_COUNTRIES))
            db.close()
            finish(path, out, 'socle')
        if 'complet' in kinds:
            say('5. Le pack complet : toutes les stations (+ heure par heure de Météo-France)')
            path = os.path.join(out, 'meteo-complet.sqlite')
            if os.path.exists(path):
                os.remove(path)
            db = F.open_db(path, 'complet', 'Pack complet')
            F.set_meta(db, countries='FR,BE,CH,LU')
            got = {r[0] for r in work.db.execute("SELECT DISTINCT source FROM stations WHERE pays IN ('FR','BE','CH','LU')")}
            F.add_sources(db, [x for x in ['meteofrance', 'meteoswiss', 'irm', 'meteolux'] if x in got], a.until)
            ids = [r[0] for r in work.db.execute("SELECT id FROM stations WHERE pays IN ('FR','BE','CH','LU')")]
            copy_stations(work.db, db, ids, hourly=True)
            write_normals(db, 'station', 'daily', 'station_id')
            db.close()
            finish(path, out, 'complet')
        if 'europe' in kinds:
            say('6. Le pack Europe : stations d’Europe + 20CR (1836–1939) + ERA5 Europe (toutes les heures)')
            path = os.path.join(out, 'meteo-europe.sqlite')
            if os.path.exists(path):
                os.remove(path)
            db = F.open_db(path, 'europe', 'Pack Europe')
            ids = [r[0] for r in work.db.execute("SELECT id FROM stations WHERE pays NOT IN ('FR','BE','CH','LU')")]
            pays = sorted({r[0] for r in work.db.execute("SELECT DISTINCT pays FROM stations WHERE pays NOT IN ('FR','BE','CH','LU')")})
            F.set_meta(db, countries='EUROPE', station_countries=','.join(pays))
            used = sorted({r[0] for r in work.db.execute("SELECT DISTINCT source FROM stations WHERE pays NOT IN ('FR','BE','CH','LU')")})
            F.add_sources(db, [x for x in used if x in F.SOURCES], a.until)
            copy_stations(work.db, db, ids)
            write_normals(db, 'station', 'daily', 'station_id')
            if not a.sans_20cr:
                say('   20CRv3 sur toute l’Europe (1836–1939)')
                F.add_sources(db, ['20cr'], a.until)
                rdb = sqlite3.connect(os.path.join(out, 'travail', 'reanalyses-europe-20cr.sqlite'))
                rdb.executescript(F.SCHEMA)
                do_20cr(rdb, years, [BOX_EUROPE], a.test, net)
                merge_grid(rdb, db, '20cr')
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
    say(f'\n✓ Fini en {m // 3600} h {m % 3600 // 60:02d} min. Les fichiers sont dans {out}.\n  Le socle : copie meteo-socle.sqlite dans le dossier data-meteo de l’app ; un pack (.lcmeteo) : Réglages → 🌦 Météo d’autrefois → « ⤒ Importer le fichier… ».')
    return 0


# ═══════════════════════ Les compléments Copernicus (packs « plus-… », facultatifs) ═══════════════════════
PLUS_KINDS = ['plus-neige', 'plus-ressenti', 'plus-rivieres', 'plus-cerra', 'plus-anciennes']


def build_plus(a):
    import meteo_plus as P
    out = os.path.abspath(a.dossier + ('-test' if a.test and a.dossier == 'meteo-sortie' else ''))
    os.makedirs(out, exist_ok=True)
    t0 = time.time()
    try:
        say(f'🌦 Météo d’autrefois — complément : {a.quoi}{" (essai)" if a.test else ""}\n   dossier : {out}')
        P.build(a.quoi, out, (a.depuis or 0, a.until), a.offline, a.test)
    except (P.Stop, Stop) as e:
        say(f'\n⛔ {e}\n')
        return 2
    except KeyboardInterrupt:
        say('\n⏸ Arrêté. Relance la même commande : le programme reprendra où il en était.')
        return 130
    m = int(time.time() - t0)
    say(f'\n✓ Fini en {m // 3600} h {m % 3600 // 60:02d} min. Le pack : {out}/meteo-pack-{a.quoi}.lcmeteo (Réglages → 🌦 Météo d’autrefois → « ⤒ Importer un fichier… »).')
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
