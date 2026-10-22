"""LCNDA — 🌦 Météo d'autrefois : le format des fichiers de données (socle, pack complet, pack Europe).

Un fichier = une base SQLite à part (jamais mélangée à la généalogie). Le détail est écrit dans docs/UI.md,
section « 🌦 Météo d'autrefois ». Ce module est partagé par build-meteo.py (le fabricant) et make-fixture.py
(le petit jeu d'essai des tests) ; la lecture se fait en PHP dans lib/meteo.php.

Valeurs : des entiers de 16 bits, une colonne après l'autre, chaque valeur écrite comme l'écart avec la
précédente connue (les écarts sont petits, donc se compressent bien) ; MISSING (-32768) = pas de valeur.
Le tout est compressé en « deflate brut » (zlib, wbits=-15 ; PHP : gzinflate).
"""
import json
import sqlite3
import struct
import zlib

FORMAT_VERSION = 1
MAGIC = 0x4D  # « M »
MISSING = -32768
LIMIT = 16000  # valeurs bornées à ±16000 : un écart tient toujours sur 16 bits

# code de colonne → (nom court, unité, explication)
COLUMNS = {
    1: ('TN', '0,1 °C', 'température la plus basse (journée)'),
    2: ('TX', '0,1 °C', 'température la plus haute (journée)'),
    3: ('T', '0,1 °C', 'température à l’heure de la ligne'),
    4: ('RR', '0,1 mm', 'pluie (journée, ou depuis la ligne précédente)'),
    5: ('SN', 'cm', 'neige : hauteur de neige fraîche (ou au sol)'),
    6: ('FX', '0,1 m/s', 'vent le plus fort (rafale)'),
    7: ('NN', '%', 'nuages (0 = ciel clair, 100 = couvert)'),
    8: ('SS', 'min', 'soleil (durée d’ensoleillement)'),
    9: ('WW', 'bits', 'phénomènes : 1 brouillard, 2 orage, 4 grêle, 8 neige tombée, 16 gel ou verglas, 32 brume'),
    10: ('Z', 'm', 'altitude du sol (grille des altitudes)'),
}
CODE = {v[0]: k for k, v in COLUMNS.items()}
WW_FOG, WW_STORM, WW_HAIL, WW_SNOW, WW_ICE, WW_MIST = 1, 2, 4, 8, 16, 32

SCHEMA = """
CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sources(id TEXT PRIMARY KEY, nom TEXT NOT NULL, licence TEXT NOT NULL, mention TEXT NOT NULL,
    url TEXT NOT NULL DEFAULT '', mise_a_jour TEXT NOT NULL DEFAULT '', sorte TEXT NOT NULL DEFAULT 'station',
    annees TEXT NOT NULL DEFAULT '', contenu TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS stations(id INTEGER PRIMARY KEY, source TEXT NOT NULL, code TEXT NOT NULL, nom TEXT NOT NULL,
    pays TEXT NOT NULL DEFAULT '', lat REAL NOT NULL, lon REAL NOT NULL, alt REAL, debut INTEGER, fin INTEGER, heures_debut INTEGER);
CREATE INDEX IF NOT EXISTS stations_geo ON stations(lat, lon);
CREATE TABLE IF NOT EXISTS grid(id INTEGER PRIMARY KEY, source TEXT NOT NULL, lat REAL NOT NULL, lon REAL NOT NULL, alt REAL,
    debut INTEGER, fin INTEGER, pas REAL NOT NULL DEFAULT 0.25, heures_debut INTEGER);
CREATE INDEX IF NOT EXISTS grid_geo ON grid(source, lat, lon);
CREATE TABLE IF NOT EXISTS daily(station_id INTEGER NOT NULL, annee INTEGER NOT NULL, blob BLOB NOT NULL, PRIMARY KEY(station_id, annee)) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS hourly(station_id INTEGER NOT NULL, annee INTEGER NOT NULL, blob BLOB NOT NULL, PRIMARY KEY(station_id, annee)) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS grid_daily(grid_id INTEGER NOT NULL, annee INTEGER NOT NULL, blob BLOB NOT NULL, PRIMARY KEY(grid_id, annee)) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS grid_hourly(grid_id INTEGER NOT NULL, annee INTEGER NOT NULL, blob BLOB NOT NULL, PRIMARY KEY(grid_id, annee)) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS elevation(lat0 INTEGER NOT NULL, lon0 INTEGER NOT NULL, n INTEGER NOT NULL, blob BLOB NOT NULL,
    PRIMARY KEY(lat0, lon0)) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS normals(sorte TEXT NOT NULL, ref_id INTEGER NOT NULL, debut INTEGER NOT NULL, fin INTEGER NOT NULL, blob BLOB NOT NULL,
    PRIMARY KEY(sorte, ref_id, fin)) WITHOUT ROWID;
"""

# Les mentions obligatoires (reprises par l'app sous le détail et dans « À propos des données »)
SOURCES = {
    'meteofrance': dict(nom='Météo-France', licence='Licence Ouverte 2.0 (Etalab)', mention='Source : Météo-France',
                        url='https://meteo.data.gouv.fr', sorte='station', annees='≈ 1850 → aujourd’hui ; heures depuis 1950',
                        contenu='Stations de France, chaque jour ; heure par heure (synoptiques)'),
    'meteoswiss': dict(nom='MétéoSuisse', licence='CC BY 4.0', mention='Source: MeteoSwiss', url='https://opendata.swiss',
                       sorte='station', annees='1864 → aujourd’hui', contenu='Stations NBCN de Suisse, chaque jour'),
    'irm': dict(nom='IRM / KMI', licence='CC BY 4.0', mention='Source : IRM / KMI', url='https://opendata.meteo.be',
                sorte='station', annees='1995 → aujourd’hui', contenu='Stations automatiques de Belgique, chaque jour'),
    'meteolux': dict(nom='MeteoLux', licence='CC0', mention='Source : MeteoLux', url='https://data.public.lu',
                     sorte='station', annees='1947 → aujourd’hui', contenu='Luxembourg-Findel, chaque jour'),
    'dwd': dict(nom='DWD (Deutscher Wetterdienst)', licence='Datenlizenz Deutschland – Namensnennung 2.0', mention='Quelle: Deutscher Wetterdienst',
                url='https://opendata.dwd.de', sorte='station', annees='≈ 1880 → aujourd’hui', contenu='Stations d’Allemagne, chaque jour (pack Europe)'),
    'copdem': dict(nom='Copernicus DEM GLO-90', licence='Licence Copernicus DEM GLO-90 (libre, redistribution permise avec mention)',
                   mention='Altitudes : Copernicus DEM GLO-90 © DLR e.V. 2010-2014 et © Airbus Defence and Space GmbH 2014-2018, fourni dans le cadre de COPERNICUS par l’Union européenne et l’ESA',
                   url='https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM',
                   sorte='relief', annees='—', contenu='Altitude du sol, grille ≈ 1 km (30″), tirée du modèle à 90 m'),
    'era5': dict(nom='ERA5 (Copernicus)', licence='CC BY 4.0 (licence Copernicus)',
                 mention='Generated using Copernicus Climate Change Service information [{year}]',
                 url='https://cds.climate.copernicus.eu', sorte='grid', annees='1940 → aujourd’hui',
                 contenu='Réanalyse : carreaux ≈ 30 km, 4 heures par jour (socle) ou toutes les heures (packs)'),
    '20cr': dict(nom='20CRv3 (NOAA / DOE)', licence='CC BY 4.0 (usage libre avec mention)',
                 mention='20th Century Reanalysis V3, NOAA / DOE', url='https://psl.noaa.gov/data/20thC_Rean/',
                 sorte='grid', annees='1836 → 1939', contenu='Reconstitution quotidienne, carreaux ≈ 100 km'),
}


def encode(columns, step=0):
    """columns : liste de (code ou nom court, liste de valeurs entières ou None) — toutes de la même longueur.
    step : 0 = une ligne par jour ; n = une ligne toutes les n heures (0 h UTC le 1er janvier en premier)."""
    cols = [(CODE[c] if isinstance(c, str) else int(c), vals) for c, vals in columns]
    nrows = len(cols[0][1]) if cols else 0
    if any(len(v) != nrows for _, v in cols):
        raise ValueError('colonnes de longueurs différentes')
    if nrows > 0xFFFF:
        raise ValueError('trop de lignes pour un seul bloc')
    out = bytearray(struct.pack('<BBBBHH', MAGIC, FORMAT_VERSION, len(cols), step, nrows, 0))
    out += bytes(c for c, _ in cols)
    for _, vals in cols:
        prev = 0
        packed = []
        for v in vals:
            if v is None:
                packed.append(MISSING)
                continue
            v = max(-LIMIT, min(LIMIT, int(round(v))))
            packed.append(v - prev)
            prev = v
        out += struct.pack('<%dh' % nrows, *packed)
    comp = zlib.compressobj(9, zlib.DEFLATED, -15)
    return comp.compress(bytes(out)) + comp.flush()


def decode(blob):
    """→ (step, {nom court: [valeurs ou None]})"""
    raw = zlib.decompress(blob, -15)
    magic, version, ncols, step, nrows, _ = struct.unpack_from('<BBBBHH', raw, 0)
    if magic != MAGIC or version != FORMAT_VERSION:
        raise ValueError('bloc météo inconnu')
    codes = raw[8:8 + ncols]
    pos = 8 + ncols
    res = {}
    for code in codes:
        vals = struct.unpack_from('<%dh' % nrows, raw, pos)
        pos += 2 * nrows
        prev = 0
        col = []
        for d in vals:
            if d == MISSING:
                col.append(None)
            else:
                prev += d
                col.append(prev)
        res[COLUMNS.get(code, (str(code),))[0]] = col
    return step, res


def open_db(path, kind, title=''):
    db = sqlite3.connect(path)
    db.executescript(SCHEMA)
    set_meta(db, format=str(FORMAT_VERSION), kind=kind, title=title or kind)
    return db


def set_meta(db, **kv):
    for k, v in kv.items():
        db.execute('INSERT OR REPLACE INTO meta(key, value) VALUES(?, ?)', (k, str(v)))


def add_sources(db, ids, year=None):
    for sid in ids:
        s = dict(SOURCES[sid])
        s['mention'] = s['mention'].replace('{year}', str(year or ''))
        db.execute('INSERT OR REPLACE INTO sources(id, nom, licence, mention, url, mise_a_jour, sorte, annees, contenu) VALUES(?,?,?,?,?,?,?,?,?)',
                   (sid, s['nom'], s['licence'], s['mention'], s['url'], str(year or ''), s['sorte'], s['annees'], s['contenu']))


def days_in_year(y):
    return 366 if (y % 4 == 0 and (y % 100 != 0 or y % 400 == 0)) else 365


def period_for(year):
    """la normale « 30 ans autour » : la période qui finit sur la dizaine (1926 → 1901–1930, 1978 → 1951–1980)"""
    end = min(2020, max(1870, -(-year // 10) * 10))
    return end - 29, end


def month_of_rows(year):
    import datetime
    d0 = datetime.date(year, 1, 1)
    return [(d0 + datetime.timedelta(days=i)).month for i in range(days_in_year(year))]


def compute_normals(year_values, min_years=20):
    """year_values : {année: {'TN': [...], 'TX': [...], 'RR': [...]}} (journalier)
    → liste de (debut, fin, blob) pour chaque période de 30 ans finissant sur une dizaine, avec ≥ min_years années."""
    out = []
    years = sorted(year_values)
    if not years:
        return out
    ends = sorted({period_for(y)[1] for y in years} | {e for e in range(1900, 2021, 10)})
    for end in ends:
        start = end - 29
        inside = [y for y in years if start <= y <= end]
        if len(inside) < min_years:
            continue
        acc = {k: [[] for _ in range(12)] for k in ('TN', 'TX')}
        rain = [[] for _ in range(12)]
        for y in inside:
            v = year_values[y]
            months = month_of_rows(y)
            tot = [0] * 12
            cnt = [0] * 12
            for i, m in enumerate(months):
                for k in ('TN', 'TX'):
                    col = v.get(k)
                    if col and i < len(col) and col[i] is not None:
                        acc[k][m - 1].append(col[i])
                col = v.get('RR')
                if col and i < len(col) and col[i] is not None:
                    tot[m - 1] += col[i]
                    cnt[m - 1] += 1
            for m in range(12):
                if cnt[m] >= 20:
                    rain[m].append(tot[m])
        mean = lambda xs: round(sum(xs) / len(xs)) if xs else None
        cols = [('TN', [mean(acc['TN'][m]) for m in range(12)]), ('TX', [mean(acc['TX'][m]) for m in range(12)]),
                ('RR', [mean(rain[m]) for m in range(12)])]
        out.append((start, end, encode(cols)))
    return out


def summary(db):
    """petit résumé (pour l'en-tête du fichier .lcmeteo et l'écran « Voilà ce qui va entrer »)"""
    q = lambda sql: db.execute(sql).fetchone()
    meta = dict(db.execute('SELECT key, value FROM meta').fetchall())
    st = q('SELECT COUNT(*), MIN(debut), MAX(fin) FROM stations')
    hr = q('SELECT MIN(annee) FROM hourly')
    gr = q('SELECT COUNT(*), MIN(debut), MAX(fin) FROM grid')
    ghr = q('SELECT MIN(annee) FROM grid_hourly')
    return {'kind': meta.get('kind', ''), 'title': meta.get('title', ''), 'format': int(meta.get('format', 1)),
            'stations': st[0] or 0, 'from': min([x for x in (st[1], gr[1]) if x] or [0]), 'to': max([x for x in (st[2], gr[2]) if x] or [0]),
            'hours_from': min([x for x in (hr[0], ghr[0]) if x] or [0]), 'cells': gr[0] or 0,
            'countries': meta.get('countries', ''), 'built': meta.get('built', ''),
            'sources': [r[0] for r in db.execute('SELECT id FROM sources ORDER BY id')]}


HEADER_MAGIC = b'LCMETEO1\n'
HEADER_SIZE = 4096


def wrap_pack(sqlite_path, out_path):
    """Fichier à importer (.lcmeteo) : 4096 octets d'en-tête (LCMETEO1 + JSON : résumé, taille, sha256) puis la base SQLite."""
    import hashlib
    import os
    db = sqlite3.connect(sqlite_path)
    info = summary(db)
    db.close()
    h = hashlib.sha256()
    with open(sqlite_path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    info['size'] = os.path.getsize(sqlite_path)
    info['sha256'] = h.hexdigest()
    head = HEADER_MAGIC + json.dumps(info, ensure_ascii=False).encode('utf-8') + b'\n'
    if len(head) > HEADER_SIZE:
        raise ValueError('en-tête trop long')
    head += b' ' * (HEADER_SIZE - len(head))
    with open(out_path, 'wb') as out, open(sqlite_path, 'rb') as f:
        out.write(head)
        for chunk in iter(lambda: f.read(1 << 20), b''):
            out.write(chunk)
    return info


# ═══ Grille des altitudes : un bloc par carré de 1° (lat0, lon0 = coin sud-ouest), n × n nœuds aux points
# lat0 + i/n, lon0 + j/n (i lignes vers le nord, j colonnes vers l'est), rangés ligne par ligne ; colonne « Z » en mètres ;
# MISSING = mer ou inconnu. n = 120 → un nœud toutes les 30″ (≈ 1 km). Lecture : meteo_altitude() (lib/meteo.php), bilinéaire.
ELEVATION_N = 120


def encode_tile(values, n=ELEVATION_N):
    if len(values) != n * n:
        raise ValueError('carré d’altitudes de mauvaise taille')
    return encode([('Z', values)])
