#!/usr/bin/env python3
"""LCNDA — 🏘 Histoire du lieu : le FABRICANT du pack « histoire-locale » (à lancer une fois, sur un ordinateur qui a Internet).

    python3 scripts/histoire/build-histoire.py                       # tout : ≈ 10 minutes, ≈ 400 Mo à télécharger (BDHI)
    python3 scripts/histoire/build-histoire.py --sans-bdhi           # sans les inondations historiques (archive de 390 Mo)
    python3 scripts/histoire/build-histoire.py --hors-ligne DOSSIER  # ne télécharge rien : lit les fichiers déjà posés

Il produit, dans le dossier de sortie (par défaut ./histoire-sortie) :
    histoire-locale.sqlite   la base (lue par lib/histoire.php)
    histoire-locale.lchist   la même, avec un en-tête de 4096 octets (LCHIST1 + JSON : taille, sha256) : c'est ce fichier que
                             l'app télécharge (Réglages → 🏘 Histoire du lieu → ⤓ Installer) et vérifie avant de le ranger.

Les sources (adresse, licence, mention) sont dans la table « sources » du pack, et rappelées dans l'app (« À propos des données »).
Rien n'est inventé : chaque chiffre vient d'un fichier téléchargé ; les seules règles écrites à la main sont la table
vendanges-departements.csv (quel vignoble pour quel département) et les seuils dits dans lib/histoire.php.
Bibliothèques : openpyxl (pip install openpyxl) ; pg_restore (paquet postgresql-client) pour la BDHI.
"""
import argparse
import collections
import csv
import datetime
import hashlib
import io
import json
import math
import os
import re
import shutil
import sqlite3
import subprocess
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
import zipfile

UA = 'LCNDA-build/1.0 (genealogy app, open data build)'
HEADER_MAGIC = b'LCHIST1\n'
HEADER_SIZE = 4096
HERE = os.path.dirname(os.path.abspath(__file__))

# ═══════════════════════ Les adresses (à corriger ici si une source déménage) ═══════════════════════
SRC = {
    'ghd': {'file': 'europe2012ghd.txt', 'url': 'https://www.ncei.noaa.gov/pub/data/paleo/historical/europe/europe2012ghd.txt'},
    'insee': {'file': 'base-pop-historiques-1876-2023.xlsx', 'url': 'https://www.insee.fr/fr/statistiques/fichier/3698339/base-pop-historiques-1876-2023.xlsx'},
    'wikidata': {'file': 'gares-wikidata.json', 'url': 'https://query.wikidata.org/sparql'},
    'gares': {'file': 'gacarpj.geojson', 'url': 'https://static.data.gouv.fr/resources/gares-du-reseau-ferroviaire-francais-en-service-fermees-ou-disparues/20220210-011824/gacarpj.geojson'},
    'epica': {'file': 'EPICA_v1.1.xlsx', 'url': 'https://emidius.eu/epica/data/EPICA_v1.1.xlsx'},
    'fcat': {'file': 'FCAT-17.xlsx', 'url': 'https://static-content.springer.com/esm/art%3A10.1007%2Fs10518-017-0236-1/MediaObjects/10518_2017_236_MOESM1_ESM.xlsx'},
    'gaspar': {'file': 'gaspar.zip', 'url': 'https://files.georisques.fr/GASPAR/gaspar.zip'},
    'bdhi': {'file': 'BDHI.zip', 'url': 'https://files.georisques.fr/BDHI/BDHI.zip'},
}

SOURCES = [
    # id, nom, quoi, url (page), licence, mention
    ('ghd', 'Dates de vendanges (Daux et al. 2012)', 'Dates de début des vendanges de 27 régions viticoles, 1354 → 2007 (en jours après le 31 août)',
     'https://www.ncei.noaa.gov/access/paleo-search/study/13194', 'Données publiques NOAA / WDS-Paleo : libres, citation demandée',
     'Daux V. et al. (2012), An open-access database of grape harvest dates for climate research, Climate of the Past 8, 1403–1418, doi:10.5194/cp-8-1403-2012 ; données NOAA/WDS Paleoclimatology (Contribution Series 2012-129)'),
    ('insee', 'Insee : historique des populations communales', 'Population de chaque commune aux recensements, 1876 → 2023, dans les limites des communes au 1er janvier 2025',
     'https://www.insee.fr/fr/statistiques/3698339', 'Licence Ouverte / Etalab 2.0', '©Insee – Source(s) : Insee, recensements de la population (mise en ligne décembre 2025)'),
    ('wikidata', 'Wikidata : gares de France', 'Gares avec leur date d’ouverture (propriété P1619) et leur position (P625)',
     'https://www.wikidata.org/', 'CC0 (domaine public)', 'Wikidata'),
    ('gares', 'Un siècle de gares (R. Jeansoulin)', 'Position des gares en service, fermées ou disparues (sans date d’ouverture)',
     'https://www.data.gouv.fr/datasets/un-siecle-de-gares-du-reseau-ferroviaire-francais-en-service-fermees-ou-disparues', 'ODbL 1.0',
     'Robert Jeansoulin, Un siècle de gares du réseau ferroviaire français, data.gouv.fr, ODbL'),
    ('epica', 'EPICA v1.1 (INGV)', 'Séismes d’Europe de 1000 à 1899 : épicentre, date, intensité épicentrale, magnitude',
     'https://emidius.eu/epica/', 'CC BY 4.0',
     'Rovida A., Antonucci A. (2021). EPICA – European PreInstrumental Earthquake CAtalogue, version 1.1. INGV. doi:10.13127/epica.1.1'),
    ('fcat', 'FCAT-17 (Manchuel et al. 2018)', 'Séismes de France de 463 à 2009 (épicentre, Mw, intensité épicentrale)',
     'https://doi.org/10.1007/s10518-017-0236-1', 'Matériel supplémentaire de l’article (licence non vérifiée)',
     'Manchuel K. et al. (2018), The French seismic CATalogue (FCAT-17), Bull. Earthquake Eng. 16, 2227–2251'),
    ('gaspar', 'Géorisques : arrêtés CatNat (base GASPAR)', 'Arrêtés de catastrophe naturelle par commune depuis 1982 (inondations, coulées de boue, submersions, séismes)',
     'https://www.georisques.gouv.fr/', 'Licence Ouverte / Etalab 2.0', 'Ministère de la Transition écologique – Géorisques, base GASPAR'),
    ('bdhi', 'Géorisques : Base de données historiques sur les inondations (BDHI)', 'Inondations marquantes du Moyen Âge à 2018, avec les communes touchées',
     'https://www.georisques.gouv.fr/base-de-donnees/BDHI', 'Licence Ouverte / Etalab 2.0 (mention du site Géorisques)',
     'Ministère de la Transition écologique – Géorisques, BDHI (base historique, plus mise à jour depuis 2023)'),
]

GHD_PARTS = [['Als', 'Auv', 'Aux', 'Bea', 'Bor', 'Bur', 'Cha1', 'Cha2', 'Gai'],
             ['Ger', 'HLV', 'IdF', 'Jur', 'Lan', 'LLV', 'Lux', 'MAl', 'NIt'],
             ['NLo', 'NRh', 'Sav', 'Spa', 'SLo', 'SRh', 'Swi', 'VSE', 'Ven']]
GHD_NAMES = {'Als': 'Alsace', 'Auv': 'Auvergne', 'Aux': 'Auxerre-Avalon', 'Bea': 'Beaujolais et Mâconnais', 'Bor': 'Bordeaux', 'Bur': 'Bourgogne',
             'Cha1': 'Champagne (Marne)', 'Cha2': 'Champagne (Aube)', 'Gai': 'Gaillac et Sud-Ouest', 'Ger': 'Allemagne', 'HLV': 'Haute vallée de la Loire',
             'IdF': 'Île-de-France', 'Jur': 'Jura', 'Lan': 'Languedoc', 'LLV': 'Basse vallée de la Loire', 'Lux': 'Luxembourg', 'MAl': 'Alpes maritimes (Var)',
             'NIt': 'Italie du Nord', 'NLo': 'Lorraine du Nord', 'NRh': 'Rhône du Nord', 'Sav': 'Savoie', 'Spa': 'Espagne', 'SLo': 'Lorraine du Sud',
             'SRh': 'Rhône du Sud', 'Swi': 'Suisse (Léman)', 'VSE': 'Sud-Est divers', 'Ven': 'Vendée, Poitou, Charentes'}
# le nom de chaque série dans la liste des positions du fichier NOAA (même ordre que GHD_PARTS)
GHD_LOC_NAMES = ['Alsace', 'Auvergne', 'Auxerre-Avalon', 'Beaujolais and Maconnais', 'Bordeaux', 'Burgundy', 'Champagne 1', 'Champagne 2', 'Gaillac- South-West',
                 'Germany', 'High Loire Valley', 'Ile de France', 'Jura', 'Languedoc', 'Low Loire Valley', 'Luxembourg', 'Maritime alps', 'Northern Italy',
                 'Northern Lorraine', 'Northern Rhône valley', 'Savoie', 'Spain', 'Southern Lorraine', 'Southern Rhône valley', 'Switzerland (Leman Lake)',
                 'Various South-East', 'Vendée - Poitou Charente']
GHD_REF_BEFORE = 1880  # moyenne et écart de chaque série calculés sur les années d'avant le phylloxéra (Daux et al. : les liens au climat se dégradent ensuite)
CATNAT_KEEP = {'ICB': 'Inondations et coulées de boue', 'IRN': 'Inondations par remontée de nappe', 'COB': 'Coulée de boue', 'RAZ': 'Raz de marée',
               'CMV': 'Chocs des vagues (submersion)', 'SEI': 'Secousse sismique'}
QUAKE_BOX = (41.0, 51.6, -5.8, 10.0)  # la France et ses bords (les séismes plus loin ne sont pas ressentis en France)

WIKIDATA_QUERY = '''SELECT ?gare ?gareLabel ?ouverture ?prec ?coord ?insee (GROUP_CONCAT(DISTINCT ?t; separator=",") AS ?types) WHERE {
  ?gare wdt:P31/wdt:P279* wd:Q55488 ; wdt:P17 wd:Q142 ; p:P1619/psv:P1619 [ wikibase:timeValue ?ouverture ; wikibase:timePrecision ?prec ] .
  ?gare wdt:P31 ?t .
  OPTIONAL { ?gare wdt:P625 ?coord . }
  OPTIONAL { ?gare wdt:P131 ?com . ?com wdt:P374 ?insee . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en". }
} GROUP BY ?gare ?gareLabel ?ouverture ?prec ?coord ?insee'''
# métro, tramway, station fantôme, gare d'aéroport : pas des gares de chemin de fer « d'autrefois »
WD_EXCLUDE = {'Q928830', 'Q63979268', 'Q108667555', 'Q2175765', 'Q168565', 'Q1335652'}


def say(*a):
    print(*a, flush=True)


def fold(s):
    """clé de comparaison d'un nom de commune (même règle que histoire_fold() dans lib/histoire.php)"""
    s = unicodedata.normalize('NFKD', str(s or '').lower().replace('œ', 'oe').replace('æ', 'ae'))
    s = ''.join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r'[^a-z0-9]+', ' ', s).strip()
    s = re.sub(r'^(saint|st) ', 'st ', s)
    s = re.sub(r' (saint|st) ', ' st ', s)
    s = re.sub(r'^(sainte|ste) ', 'ste ', s)
    s = re.sub(r' (sainte|ste) ', ' ste ', s)
    return s


class Getter:
    def __init__(self, cache, offline):
        self.cache, self.offline = cache, offline
        os.makedirs(cache, exist_ok=True)

    def path(self, key, optional=False, params=None):
        name = SRC[key]['file']
        if self.offline:
            p = os.path.join(self.offline, name)
            if not os.path.isfile(p):
                if optional:
                    return None
                sys.exit(f'Fichier manquant dans {self.offline} : {name}')
            return p
        p = os.path.join(self.cache, name)
        if os.path.isfile(p) and os.path.getsize(p) > 0:
            return p
        url = SRC[key]['url'] + ('?' + urllib.parse.urlencode(params) if params else '')
        say(f'  ⤓ {name} …')
        part = p + '.part'
        for attempt in range(4):
            try:
                have = os.path.getsize(part) if os.path.isfile(part) else 0
                headers = {'User-Agent': UA}
                if key == 'wikidata':
                    headers['Accept'] = 'application/sparql-results+json'
                elif have:
                    headers['Range'] = f'bytes={have}-'
                req = urllib.request.Request(url, headers=headers)
                with urllib.request.urlopen(req, timeout=300) as r, open(part, 'ab' if have and r.status == 206 else 'wb') as out:
                    shutil.copyfileobj(r, out, 1 << 20)
                os.replace(part, p)
                return p
            except Exception as e:  # noqa: BLE001
                say(f'    essai {attempt + 1} raté : {e}')
                time.sleep(10 * (attempt + 1))
        if optional:
            return None
        sys.exit(f'Téléchargement impossible : {url}')


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def km(a, b, c, d):
    r = math.pi / 180
    x = math.sin((c - a) * r / 2) ** 2 + math.cos(a * r) * math.cos(c * r) * math.sin((d - b) * r / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(x))


# ═══════════════════════ 🍇 Dates de vendanges ═══════════════════════
def build_ghd(db, path):
    lines = open(path, encoding='utf-8', errors='replace').read().split('\n')
    # les positions des 27 séries
    locs = {}
    for l in lines:
        m = re.match(r'^(\S.*?)\s{2,}(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*$', l)
        if m and m.group(1).strip() in GHD_LOC_NAMES:
            locs[m.group(1).strip()] = (float(m.group(2)), float(m.group(3)))
    codes = [c for part in GHD_PARTS for c in part]
    if len(locs) != 27:
        sys.exit(f'Vendanges : {len(locs)} positions lues au lieu de 27 (le fichier a changé ?)')
    starts = [i for i, l in enumerate(lines) if re.match(r'^Daux et al\. 2012 Grape Harvest Date Data, part [123] of 3', l)]
    if len(starts) != 3:
        sys.exit('Vendanges : les 3 parties du tableau sont introuvables (le fichier a changé ?)')
    values = collections.defaultdict(dict)
    for k, s in enumerate(starts):
        end = starts[k + 1] if k < 2 else len(lines)
        for l in lines[s + 1:end]:
            if not re.match(r'^\d{4}\s', l):
                continue
            year = int(l[:4])
            for m in re.finditer(r'-?\d+(?:\.\d+)?', l[4:]):
                col = round((m.end() + 4 - 21) / 21)  # colonnes de 21 caractères, alignées à droite (fin : 21, 42, … 189)
                if not 0 <= col < 9:
                    sys.exit(f'Vendanges : colonne inattendue ({l[:30]}…)')
                values[GHD_PARTS[k][col]][year] = float(m.group(0))
    db.execute('CREATE TABLE ghd_series (code TEXT PRIMARY KEY, nom TEXT, lat REAL, lon REAL, moyenne REAL, ecart REAL, n INTEGER, ref TEXT, debut INTEGER, fin INTEGER)')
    db.execute('CREATE TABLE ghd (code TEXT, annee INTEGER, jours REAL, PRIMARY KEY (code, annee)) WITHOUT ROWID')
    total = 0
    for i, code in enumerate(codes):
        v = values.get(code, {})
        if not v:
            continue
        ref = {y: d for y, d in v.items() if y < GHD_REF_BEFORE}
        refTxt = f'{min(ref)}–{max(ref)}' if len(ref) >= 20 else f'{min(v)}–{max(v)}'
        if len(ref) < 20:
            ref = v
        mean = sum(ref.values()) / len(ref)
        sd = math.sqrt(sum((x - mean) ** 2 for x in ref.values()) / max(1, len(ref) - 1))
        lat, lon = locs[GHD_LOC_NAMES[i]]
        db.execute('INSERT INTO ghd_series VALUES (?,?,?,?,?,?,?,?,?,?)', (code, GHD_NAMES[code], lat, lon, round(mean, 2), round(sd, 2), len(ref), refTxt, min(v), max(v)))
        db.executemany('INSERT INTO ghd VALUES (?,?,?)', [(code, y, d) for y, d in sorted(v.items())])
        total += len(v)
    db.execute('CREATE TABLE ghd_dep (dep TEXT, rang INTEGER, code TEXT, note TEXT, PRIMARY KEY (dep, rang)) WITHOUT ROWID')
    with open(os.path.join(HERE, 'vendanges-departements.csv'), encoding='utf-8') as f:
        rows = [l for l in f if not l.startswith('#')]
    for r in csv.DictReader(rows):
        for k, code in enumerate(r['series'].split()):
            if code not in values:
                sys.exit(f'Vendanges : série inconnue {code} pour le département {r["dep"]}')
            db.execute('INSERT INTO ghd_dep VALUES (?,?,?,?)', (r['dep'], k, code, r['note']))
    say(f'  🍇 {len(values)} séries, {total} dates de vendanges')
    return {'series': len(values), 'dates': total}


# ═══════════════════════ 👥 Populations ═══════════════════════
def build_insee(db, path):
    import openpyxl
    wb = openpyxl.load_workbook(path, read_only=True)
    ws = wb['pop_1876_2023']
    rows = ws.iter_rows(values_only=True)
    head = None
    for r in rows:
        if r and r[0] == 'CODGEO':
            head = list(r)
            break
    if not head or head[:4] != ['CODGEO', 'REG', 'DEP', 'LIBGEO']:
        sys.exit('Insee : en-tête des colonnes introuvable (le fichier a changé ?)')
    cols = [(i, int(h[-4:])) for i, h in enumerate(head) if re.match(r'^P(MUN|SDC|TOT)\d{4}$', str(h))]
    years = sorted({y for _, y in cols})
    db.execute('CREATE TABLE communes (code TEXT PRIMARY KEY, nom TEXT, cle TEXT, dep TEXT, pop TEXT) WITHOUT ROWID')
    n = 0
    for r in rows:
        if not r or not r[0]:
            continue
        code = str(r[0]).strip()
        by = {}
        for i, y in cols:
            v = r[i]
            if isinstance(v, (int, float)) and v >= 0:
                by[y] = int(round(v))
        pop = ','.join('' if y not in by else str(by[y]) for y in years)
        db.execute('INSERT INTO communes VALUES (?,?,?,?,?)', (code, str(r[3]), fold(r[3]), str(r[2]), pop.rstrip(',')))
        n += 1
    db.execute('CREATE INDEX communes_cle ON communes(dep, cle)')
    db.execute("INSERT INTO meta VALUES ('pop_years', ?)", (','.join(map(str, years)),))
    db.execute("INSERT INTO meta VALUES ('pop_geo', 'communes au 1er janvier 2025')")
    say(f'  👥 {n} communes, recensements {years[0]} → {years[-1]}')
    return {'communes': n, 'years': f'{years[0]}–{years[-1]}'}


# ═══════════════════════ 🚂 Gares ═══════════════════════
def build_gares(db, wd_path, gares_path):
    db.execute('CREATE TABLE gares (id INTEGER PRIMARY KEY, nom TEXT, lat REAL, lon REAL, insee TEXT, ouverture INTEGER, precision INTEGER, ref TEXT, src TEXT)')
    db.execute('CREATE INDEX gares_pos ON gares(lat, lon)')
    data = json.load(open(wd_path, encoding='utf-8'))['results']['bindings']
    best = {}
    for x in data:
        types = {t.rsplit('/', 1)[-1] for t in x.get('types', {}).get('value', '').split(',') if t}
        if types & WD_EXCLUDE or 'coord' not in x:
            continue
        m = re.match(r'Point\(([-\d.eE]+) ([-\d.eE]+)\)', x['coord']['value'])
        if not m:
            continue
        lon, lat = float(m.group(1)), float(m.group(2))
        if not (41 <= lat <= 51.6 and -5.8 <= lon <= 10):
            continue  # la France d'Europe
        ym = re.match(r'^(-?\d{4})', x['ouverture']['value'])
        if not ym:
            continue
        year, prec = int(ym.group(1)), int(x['prec']['value'])
        if prec < 9 or year < 1825:  # précision au moins l'année ; aucune gare avant 1827 (Saint-Étienne–Andrézieux)
            continue
        qid = x['gare']['value'].rsplit('/', 1)[-1]
        name = x.get('gareLabel', {}).get('value', qid)
        if re.match(r'^Q\d+$', name):
            continue
        old = best.get(qid)
        if old is None or year < old[4]:  # plusieurs dates : la plus ancienne
            best[qid] = (name, lat, lon, x.get('insee', {}).get('value', ''), year, prec)
    for qid, (name, lat, lon, insee, year, prec) in best.items():
        db.execute('INSERT INTO gares (nom, lat, lon, insee, ouverture, precision, ref, src) VALUES (?,?,?,?,?,?,?,?)', (name, round(lat, 5), round(lon, 5), insee, year, prec, qid, 'wikidata'))
    n2 = 0
    if gares_path:
        seen = set()
        for f in json.load(open(gares_path, encoding='utf-8'))['features']:
            g, p = f.get('geometry') or {}, f.get('properties') or {}
            if g.get('type') != 'Point' or not p.get('id'):
                continue
            if re.search(r'\s\((Y[a-z]*|P\.?\s?I\.?|[A-Z][a-z]?)\)$', str(p['id'])):
                continue  # « Tulle (Ys) », « Tulle (P.I.) » : postes et bifurcations, pas des gares de voyageurs
            lon, lat = g['coordinates'][:2]
            key = (str(p['id']).strip().lower(), round(lat, 3), round(lon, 3))
            if key in seen:
                continue
            seen.add(key)
            db.execute('INSERT INTO gares (nom, lat, lon, insee, ouverture, precision, ref, src) VALUES (?,?,?,?,NULL,NULL,?,?)', (str(p['id']).strip(), round(lat, 5), round(lon, 5), str(p.get('cc') or ''), str(p.get('uic') or ''), 'gares'))
            n2 += 1
    say(f'  🚂 {len(best)} gares avec leur date d’ouverture (Wikidata) + {n2} positions de gares sans date')
    return {'dated': len(best), 'positions': n2}


# ═══════════════════════ 🌋 Séismes ═══════════════════════
def build_quakes(db, epica_path, fcat_path):
    import openpyxl
    db.execute('CREATE TABLE seismes (id INTEGER PRIMARY KEY, annee INTEGER, mois INTEGER, jour INTEGER, lat REAL, lon REAL, io TEXT, mw REAL, zone TEXT, src TEXT)')
    db.execute('CREATE INDEX seismes_annee ON seismes(annee)')
    la0, la1, lo0, lo1 = QUAKE_BOX
    ws = openpyxl.load_workbook(epica_path, read_only=True)['EPICA']
    it = ws.iter_rows(values_only=True)
    head = list(next(it))
    need = ['Year', 'Mo', 'Da', 'Ax', 'Lat', 'Lon', 'Io', 'Mw']
    if any(h not in head for h in need):
        sys.exit('EPICA : colonnes attendues introuvables (le fichier a changé ?)')
    ix = {h: head.index(h) for h in need}
    n = 0
    for r in it:
        lat, lon = r[ix['Lat']], r[ix['Lon']]
        if not isinstance(lat, (int, float)) or not isinstance(lon, (int, float)) or not (la0 <= lat <= la1 and lo0 <= lon <= lo1):
            continue
        io = str(r[ix['Io']] or '').strip()
        mw = r[ix['Mw']] if isinstance(r[ix['Mw']], (int, float)) else None
        if not io and mw is None:
            continue
        num = lambda v: int(v) if isinstance(v, (int, float)) else None  # noqa: E731
        db.execute('INSERT INTO seismes (annee, mois, jour, lat, lon, io, mw, zone, src) VALUES (?,?,?,?,?,?,?,?,?)',
                   (int(r[ix['Year']]), num(r[ix['Mo']]), num(r[ix['Da']]), lat, lon, io, mw, str(r[ix['Ax']] or '').strip(), 'epica'))
        n += 1
    n2 = 0
    if fcat_path:  # seulement avec --avec-fcat17 : licence du matériel supplémentaire non vérifiée
        ws = openpyxl.load_workbook(fcat_path, read_only=True).worksheets[0]
        for r in ws.iter_rows(min_row=3, values_only=True):
            if not isinstance(r[1], (int, float)) or not 1900 <= r[1] < 1965:
                continue
            io = r[9] if isinstance(r[9], (int, float)) else None
            mw = float(str(r[10]).rstrip('*')) if r[10] not in (None, 'nan') and re.match(r'^[\d.]+\*?$', str(r[10])) else None
            if io is None or io < 5:
                continue
            num = lambda v: int(v) if isinstance(v, (int, float)) else None  # noqa: E731
            db.execute('INSERT INTO seismes (annee, mois, jour, lat, lon, io, mw, zone, src) VALUES (?,?,?,?,?,?,?,?,?)',
                       (int(r[1]), num(r[2]), num(r[3]), r[7], r[8], ('%g' % io), mw, '', 'fcat'))
            n2 += 1
    say(f'  🌋 {n} séismes (EPICA, 1000–1899)' + (f' + {n2} (FCAT-17, 1900–1964)' if fcat_path else ''))
    return {'epica': n, 'fcat': n2}


# ═══════════════════════ 🌊 Inondations ═══════════════════════
def build_catnat(db, path):
    db.execute('CREATE TABLE catnat (code TEXT, debut TEXT, fin TEXT, risque TEXT)')
    with zipfile.ZipFile(path) as z:
        names = [n for n in z.namelist() if re.match(r'^catnat_gaspar.*\.csv$', os.path.basename(n))]
        if not names:
            sys.exit('GASPAR : fichier catnat_gaspar*.csv introuvable dans l’archive')
        raw = z.read(names[0]).decode('utf-8', errors='replace')
    rd = csv.DictReader(io.StringIO(raw), delimiter=';')
    for k in ('code_commune', 'num_risque_jo', 'date_debut', 'date_fin'):
        if k not in rd.fieldnames:
            sys.exit(f'GASPAR : colonne {k} introuvable (le fichier a changé ?)')
    seen = set()
    for r in rd:
        risk = (r['num_risque_jo'] or '').strip()
        if risk not in CATNAT_KEEP:
            continue
        key = ((r['code_commune'] or '').strip(), (r['date_debut'] or '')[:10], (r['date_fin'] or '')[:10], risk)
        if not key[0] or not key[1] or key in seen:
            continue
        seen.add(key)
    db.executemany('INSERT INTO catnat VALUES (?,?,?,?)', sorted(seen))
    db.execute('CREATE INDEX catnat_code ON catnat(code)')
    db.execute('CREATE TABLE catnat_risques (code TEXT PRIMARY KEY, nom TEXT)')
    db.executemany('INSERT INTO catnat_risques VALUES (?,?)', sorted(CATNAT_KEEP.items()))
    say(f'  🌊 {len(seen)} arrêtés CatNat (inondations, coulées de boue, submersions, séismes)')
    return {'catnat': len(seen)}


def pg_table(dump, table):
    """les lignes d'une table d'une sauvegarde PostgreSQL (format « custom »), lues avec pg_restore, sans serveur"""
    out = subprocess.run(['pg_restore', '-f', '-', '-a', '-t', table, dump], capture_output=True, check=True).stdout.decode('utf-8', errors='replace')
    lines = out.split('\n')
    i = next(k for k, l in enumerate(lines) if l.startswith('COPY '))
    cols = re.search(r'\((.*)\) FROM stdin', lines[i]).group(1).split(', ')
    rows = []
    for l in lines[i + 1:]:
        if l == '\\.':
            break
        rows.append({c: (None if v == '\\N' else v) for c, v in zip(cols, l.split('\t'))})
    return rows


def build_bdhi(db, path, work):
    if not shutil.which('pg_restore'):
        say('  ⚠ BDHI sautée : pg_restore introuvable (paquet postgresql-client)')
        return {'bdhi': 0}
    with zipfile.ZipFile(path) as z:
        name = next((n for n in z.namelist() if re.search(r'dump-bdd_bdhi_database-.*\.backup$', n)), None)
        if not name:
            sys.exit('BDHI : sauvegarde principale introuvable dans l’archive')
        dump = os.path.join(work, 'bdhi_database.backup')
        if not os.path.isfile(dump):
            with z.open(name) as src, open(dump + '.part', 'wb') as dst:
                shutil.copyfileobj(src, dst, 1 << 20)
            os.replace(dump + '.part', dump)
    fiches = pg_table(dump, 'fiche_inondation')
    approx = {r['id']: r for r in pg_table(dump, 'date_approchee')}
    lieux = pg_table(dump, 'localisation_admin_inondation')
    db.execute('CREATE TABLE bdhi (id INTEGER PRIMARY KEY, titre TEXT, debut TEXT, fin TEXT, annee INTEGER)')
    db.execute('CREATE TABLE bdhi_lieu (id INTEGER, code TEXT)')
    keep = {}
    for r in fiches:
        if r.get('is_visible') != 't':
            continue  # seulement les fiches publiées par la BDHI
        d1, d2 = r.get('date_debut'), r.get('date_fin')
        year = int(d1[:4]) if d1 else None
        if year is None and r.get('date_approchee_debut_id') in approx:
            a = approx[r['date_approchee_debut_id']].get('annee')
            year = int(a) if a and a.isdigit() else None
        if year is None:
            continue
        # « …, UP Dordogne, Basse Loire » : l'« unité de présentation » de la BDHI (rangement interne), retirée du titre
        title = re.sub(r'[\s,-]+(UP|unité)\s.*$', '', (r.get('titre') or '').strip(), flags=re.I).strip(' ,-')
        if not title:
            continue
        keep[r['id']] = 1
        db.execute('INSERT INTO bdhi VALUES (?,?,?,?,?)', (int(r['id']), title, d1, d2, year))
    n = 0
    for l in lieux:
        if l['inondation_id'] not in keep or not l.get('commune_id'):
            continue
        c = l['commune_id'].strip()
        m = re.match(r'^default(\w+)$', c)
        code = 'D' + m.group(1) if m else c
        db.execute('INSERT INTO bdhi_lieu VALUES (?,?)', (int(l['inondation_id']), code))
        n += 1
    db.execute('CREATE INDEX bdhi_lieu_code ON bdhi_lieu(code)')
    say(f'  🌊 BDHI : {len(keep)} inondations historiques, {n} liens vers des communes ou départements')
    return {'bdhi': len(keep), 'bdhi_links': n}


def wrap(sqlite_path, out_path, info):
    info = dict(info)
    info['size'] = os.path.getsize(sqlite_path)
    info['sha256'] = sha256(sqlite_path)
    head = HEADER_MAGIC + json.dumps(info, ensure_ascii=False).encode('utf-8') + b'\n'
    if len(head) > HEADER_SIZE:
        sys.exit('en-tête trop long')
    head += b' ' * (HEADER_SIZE - len(head))
    with open(out_path, 'wb') as out, open(sqlite_path, 'rb') as f:
        out.write(head)
        shutil.copyfileobj(f, out, 1 << 20)
    return info


def main():
    ap = argparse.ArgumentParser(description='Fabrique le pack 🏘 Histoire du lieu (histoire-locale.sqlite / .lchist)')
    ap.add_argument('--dossier', default='histoire-sortie', help='dossier de travail et de sortie')
    ap.add_argument('--hors-ligne', default='', help='ne télécharge rien : lit les fichiers posés dans ce dossier')
    ap.add_argument('--sans-bdhi', action='store_true', help='sans la base historique des inondations (archive de 390 Mo)')
    ap.add_argument('--avec-fcat17', action='store_true', help='ajoute FCAT-17 (1900–1964) — licence du fichier non vérifiée')
    a = ap.parse_args()
    out = os.path.abspath(a.dossier)
    work = os.path.join(out, 'travail')
    os.makedirs(work, exist_ok=True)
    g = Getter(os.path.join(out, 'telechargements'), os.path.abspath(a.hors_ligne) if a.hors_ligne else '')
    say('🏘 Histoire du lieu : fabrication du pack')
    paths = {k: g.path(k) for k in ('ghd', 'insee', 'epica', 'gaspar')}
    paths['wikidata'] = g.path('wikidata', params={'query': WIKIDATA_QUERY, 'format': 'json'})
    paths['gares'] = g.path('gares', optional=True)
    paths['bdhi'] = None if a.sans_bdhi else g.path('bdhi', optional=True)
    paths['fcat'] = g.path('fcat', optional=True) if a.avec_fcat17 else None
    tmp = os.path.join(work, 'histoire-locale.sqlite')
    if os.path.exists(tmp):
        os.remove(tmp)
    db = sqlite3.connect(tmp)
    db.execute('PRAGMA page_size = 4096')
    db.execute('CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT)')
    db.execute('CREATE TABLE sources (id TEXT PRIMARY KEY, nom TEXT, quoi TEXT, url TEXT, licence TEXT, mention TEXT, mise_a_jour TEXT, fichier TEXT, sha256 TEXT, n INTEGER)')
    stats = {}
    stats['ghd'] = build_ghd(db, paths['ghd'])
    stats['insee'] = build_insee(db, paths['insee'])
    stats['wikidata'] = build_gares(db, paths['wikidata'], paths['gares'])
    stats['epica'] = build_quakes(db, paths['epica'], paths['fcat'])
    stats['gaspar'] = build_catnat(db, paths['gaspar'])
    if paths['bdhi']:
        stats['bdhi'] = build_bdhi(db, paths['bdhi'], work)
    today = datetime.date.today().isoformat()
    used = {'ghd', 'insee', 'wikidata', 'epica', 'gaspar'} | ({'gares'} if paths['gares'] else set()) | ({'bdhi'} if paths['bdhi'] and stats.get('bdhi', {}).get('bdhi') else set()) | ({'fcat'} if paths['fcat'] else set())
    counts = {'ghd': stats['ghd']['dates'], 'insee': stats['insee']['communes'], 'wikidata': stats['wikidata']['dated'], 'gares': stats['wikidata']['positions'],
              'epica': stats['epica']['epica'], 'fcat': stats['epica']['fcat'], 'gaspar': stats['gaspar']['catnat'], 'bdhi': stats.get('bdhi', {}).get('bdhi', 0)}
    for sid, nom, quoi, url, lic, mention in SOURCES:
        if sid not in used:
            continue
        p = paths.get(sid)
        db.execute('INSERT INTO sources VALUES (?,?,?,?,?,?,?,?,?,?)', (sid, nom, quoi, url, lic, mention, today, os.path.basename(p) if p else '', sha256(p) if p else '', counts.get(sid, 0)))
    for k, v in {'kind': 'histoire', 'format': '1', 'built': today, 'title': 'Histoire du lieu',
                 'ghd_ref': f'années avant {GHD_REF_BEFORE}', 'stats': json.dumps(stats, ensure_ascii=False)}.items():
        db.execute('INSERT INTO meta VALUES (?,?)', (k, v))
    db.commit()
    db.execute('VACUUM')
    db.close()
    final = os.path.join(out, 'histoire-locale.sqlite')
    shutil.move(tmp, final)
    info = wrap(final, os.path.join(out, 'histoire-locale.lchist'), {'kind': 'histoire', 'built': today, 'sources': sorted(used),
                                                                     'communes': counts['insee'], 'gares': counts['wikidata'], 'seismes': counts['epica'] + counts['fcat']})
    say(f'✓ {final} ({os.path.getsize(final) / 1e6:.1f} Mo) et histoire-locale.lchist (sha256 {info["sha256"][:12]}…)')


if __name__ == '__main__':
    main()
