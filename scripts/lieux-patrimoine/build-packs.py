#!/usr/bin/env python3
"""LCNDA — 🏘️ Lieux-dits (IGN) et ⛪ Patrimoine (Mérimée, Palissy) : fabrique les packs TÉLÉCHARGÉS par l'app, un par département.

Rien de tout cela n'est livré avec l'app : Réglages → « 🏘️ Lieux-dits et patrimoine » → « ⤓ Installer » télécharge les packs
des départements choisis depuis la version « lieux-patrimoine-donnees » du dépôt (lib/lieux_patrimoine.php), les vérifie
(empreinte sha256) et les range. La fabrication tourne sur GitHub : .github/workflows/lieux-patrimoine.yml.

    python3 scripts/lieux-patrimoine/build-packs.py lieuxdits --dep 15        # les lieux-dits du Cantal
    python3 scripts/lieux-patrimoine/build-packs.py patrimoine                # monuments et objets, tous les départements
    python3 scripts/lieux-patrimoine/build-packs.py tout --dossier sortie     # les deux
    python3 scripts/lieux-patrimoine/build-packs.py manifeste --dossier sortie  # lieux-patrimoine-manifest.json des packs du dossier
    python3 scripts/lieux-patrimoine/build-packs.py essai --dossier DOSSIER   # petits packs d'ESSAI (inventés, marqués « fixture ») pour les tests

Sources (toutes vérifiées, redistribution permise avec la mention) :
  · IGN, BD TOPO® (classes « Lieu-dit non habité » et « Zone d'habitation » : lieux-dits habités, hameaux, fermes, moulins…),
    service WFS de la Géoplateforme (data.geopf.fr) — Licence Ouverte Etalab 2.0 — « © IGN – BD TOPO® ».
    Noms des communes : IGN, ADMIN EXPRESS COG (même service, même licence).
  · Ministère de la Culture, POP : « Immeubles protégés au titre des Monuments historiques » (base Mérimée, Licence Ouverte 2.0)
    et « Liste des objets protégés au titre des Monuments historiques » (base Palissy, Licence Ouverte), jeux publiés sur
    data.gouv.fr (culture.data.gouv.fr) ; l'adresse des fichiers est relue à chaque fois dans l'API de data.gouv.fr.

Format d'un pack (.lclieux) : 4 096 octets d'en-tête « LCLIEUX1\\n » + JSON {kind, dep, size, sha256, count, built}, puis une
base SQLite (tables meta, sources, et lieux + communes, ou objets). Bibliothèques : seulement celles de Python.
"""
import argparse
import csv
import datetime
import gzip
import hashlib
import io
import json
import os
import re
import sqlite3
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request

WFS = 'https://data.geopf.fr/wfs/ows'
DATAGOUV = 'https://www.data.gouv.fr/api/1/datasets/'
MERIMEE_DATASET = '5af120e5b595087cfabcde81'   # Immeubles protégés au titre des Monuments historiques (Ministère de la Culture)
PALISSY_DATASET = '615bcdd729be9185b3b0681a'   # Liste des objets protégés au titre des Monuments historiques (Ministère de la Culture)
HEADER = 4096
MAGIC = b'LCLIEUX1\n'
DEPS = [f'{i:02d}' for i in range(1, 96) if i != 20] + ['2A', '2B', '971', '972', '973', '974', '976']
SOURCES = {
    'bdtopo': ('IGN — BD TOPO® (lieux-dits habités et non habités)', 'Licence Ouverte Etalab 2.0', '© IGN – BD TOPO®', 'https://www.data.gouv.fr/datasets/bd-topo-r'),
    'adminexpress': ('IGN — ADMIN EXPRESS COG (noms des communes)', 'Licence Ouverte Etalab 2.0', '© IGN – ADMIN EXPRESS', 'https://geoservices.ign.fr/adminexpress'),
    'merimee': ('Ministère de la Culture — base Mérimée (immeubles protégés au titre des Monuments historiques)', 'Licence Ouverte 2.0', 'Ministère de la Culture, POP : plateforme ouverte du patrimoine — base Mérimée', 'https://www.data.gouv.fr/datasets/' + MERIMEE_DATASET),
    'palissy': ('Ministère de la Culture — base Palissy (objets protégés au titre des Monuments historiques)', 'Licence Ouverte', 'Ministère de la Culture, POP : plateforme ouverte du patrimoine — base Palissy', 'https://www.data.gouv.fr/datasets/' + PALISSY_DATASET),
}


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def fold(s):
    """clé de comparaison d'un nom (même règle que lp_fold() dans lib/lieux_patrimoine.php)"""
    s = str(s or '').lower().replace('œ', 'oe').replace('æ', 'ae')
    s = unicodedata.normalize('NFD', s)
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    s = re.sub(r'[^a-z0-9]+', ' ', s).strip()
    s = re.sub(r'^(le|la|les|l) ', '', s)
    s = re.sub(r'\b(saint|st)\b', 'st', s)
    s = re.sub(r'\b(sainte|ste)\b', 'ste', s)
    return s


def http(url, tries=6, timeout=300):
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'LCNDA (genealogie, donnees ouvertes)'})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            log(f'   … {e} — nouvel essai dans {10 * (attempt + 1)} s')
            time.sleep(10 * (attempt + 1))
    raise SystemExit(f'Pas de réponse : {url}')


def cached(path, url):
    if not os.path.exists(path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        body = http(url)
        with open(path + '.tmp', 'wb') as h:
            h.write(body)
        os.replace(path + '.tmp', path)
    return path


# ═══════════════════════ 🏘️ Lieux-dits : IGN BD TOPO (WFS) ═══════════════════════

def wfs_all(typename, cql, cache, props=None, step=5000):
    out, start = [], 0
    while True:
        p = {'SERVICE': 'WFS', 'VERSION': '2.0.0', 'REQUEST': 'GetFeature', 'TYPENAMES': typename, 'OUTPUTFORMAT': 'application/json',
             'COUNT': step, 'STARTINDEX': start, 'SORTBY': 'cleabs' if not props else props.split(',')[0]}
        if cql:
            p['CQL_FILTER'] = cql
        if props:
            p['PROPERTYNAME'] = props
        key = re.sub(r'[^A-Za-z0-9]+', '_', f'{typename}_{cql}_{start}')[:150]
        f = os.path.join(cache, 'wfs', key + '.json.gz')
        if os.path.exists(f):
            d = json.loads(gzip.open(f).read())
        else:
            for attempt in range(5):  # le service répond parfois autre chose que du JSON (page de métriques) : on redemande
                body = http(WFS + '?' + urllib.parse.urlencode(p))
                try:
                    d = json.loads(body)
                    break
                except json.JSONDecodeError:
                    log(f'   … réponse illisible du WFS, nouvel essai ({body[:60]!r})')
                    time.sleep(5 * (attempt + 1))
            else:
                raise SystemExit('Le WFS de l’IGN ne répond pas en JSON.')
            os.makedirs(os.path.join(cache, 'wfs'), exist_ok=True)
            with gzip.open(os.path.join(cache, 'wfs', key + '.json.gz'), 'wb') as h:
                h.write(body)
        feats = d.get('features') or []
        out += feats
        n = int(d.get('numberMatched') or d.get('totalFeatures') or 0)
        start += len(feats)
        if not feats or start >= n:
            return out


def centroid(g):
    """un point pour une géométrie (le point lui-même, ou le milieu des sommets du plus grand contour)"""
    if not g:
        return None, None
    t, c = g.get('type'), g.get('coordinates')
    if t == 'Point':
        return c[1], c[0]
    rings = []
    if t == 'Polygon':
        rings = [c[0]]
    elif t == 'MultiPolygon':
        rings = [p[0] for p in c if p]
    elif t in ('LineString', 'MultiPoint'):
        rings = [c]
    if not rings:
        return None, None
    ring = max(rings, key=len)
    xs = [p[0] for p in ring]
    ys = [p[1] for p in ring]
    return sum(ys) / len(ys), sum(xs) / len(xs)


def build_lieuxdits(dep, cache, communes):
    like = f"insee_commune LIKE '{dep}%'"
    rows = []
    for typename, habite in (('BDTOPO_V3:zone_d_habitation', 1), ('BDTOPO_V3:lieu_dit_non_habite', 0)):
        for f in wfs_all(typename, like, cache):
            pr = f.get('properties') or {}
            nom = (pr.get('toponyme') or '').strip()
            insee = str(pr.get('insee_commune') or '').strip()
            if not nom or not insee:
                continue
            lat, lon = centroid(f.get('geometry'))
            nature = pr.get('nature_detaillee') or pr.get('nature') or ''
            rows.append((nom, fold(nom), nature, insee, round(lat, 6) if lat else None, round(lon, 6) if lon else None, habite))
    rows.sort(key=lambda r: (r[3], r[1]))
    com = {k: v for k, v in communes.items() if k.startswith(dep)}
    return rows, com


def all_communes(cache):
    feats = wfs_all('ADMINEXPRESS-COG.LATEST:commune', None, cache, props='code_insee,nom_officiel,code_insee_du_departement')
    return {str(f['properties']['code_insee']): f['properties']['nom_officiel'] for f in feats if f.get('properties', {}).get('code_insee')}


# ═══════════════════════ ⛪ Patrimoine : Mérimée et Palissy (POP, data.gouv.fr) ═══════════════════════

def norm_col(c):
    c = unicodedata.normalize('NFD', str(c or '').strip().lower())
    c = ''.join(x for x in c if unicodedata.category(x) != 'Mn')
    return re.sub(r'[^a-z0-9]+', '_', c).strip('_')


# pour chaque champ, les noms de colonnes possibles (export « libellés » de data.culture.gouv.fr, ou codes POP)
COLS = {
    'ref': [r'^reference$', r'^ref$', r'^reference_de_la_notice$'],
    'titre': [r'^titre_editorial', r'^tico$', r'^titre$', r'^titre_courant', r'^appellation'],
    'deno': [r'^denomination', r'^deno$', r'^designation'],
    'commune': [r'^commune_forme_editoriale', r'^commune_forme_index', r'^commune$', r'^com$', r'^commune_'],
    'insee': [r'^cog_insee', r'insee', r'^code_commune'],
    'dep': [r'^departement_format_numerique', r'^dpt$', r'^departement$', r'^dep$'],
    'siecle': [r'^siecle_de_la_campagne_principale', r'^siecle_de_creation', r'^siecle', r'^scle$', r'^format_abrege_du_siecle'],
    'dates': [r'^datation', r'^date_de_creation', r'^dates?$', r'^annee'],
    'protection': [r'^date_et_typologie_de_la_protection', r'^typologie_de_la_protection', r'^dpro$', r'^nature_de_la_protection', r'protection'],
    'hist': [r'^historique$', r'^hist$', r'^historique'],
    'desc': [r'^description_de_l_edifice', r'^description', r'^desc$'],
    'edifice': [r'^edifice_de_conservation', r'^edif$', r'^lieu_de_conservation', r'^edifice'],
    'vocable': [r'^vocable', r'^voca$'],
    'geo': [r'wgs84', r'^coordonnees', r'^coord', r'^geolocalisation', r'^coor$'],
}


def colmap(header):
    cols = [norm_col(h) for h in header]
    out = {}
    for field, pats in COLS.items():
        for p in pats:
            hit = next((i for i, c in enumerate(cols) if re.search(p, c) and i not in out.values()), None)
            if hit is not None:
                out[field] = hit
                break
    return out


def short(s, n):
    s = re.sub(r'\s+', ' ', str(s or '')).strip()
    return s if len(s) <= n else s[:n - 1].rsplit(' ', 1)[0] + '…'


def dataset_csv(dataset, cache):
    meta = json.loads(http(DATAGOUV + dataset + '/'))
    res = next((r for r in meta.get('resources', []) if (r.get('format') or '').lower() == 'csv'), None)
    if not res:
        raise SystemExit(f'Jeu {dataset} : pas de fichier CSV')
    log(f'   {meta.get("title")} — licence {meta.get("license")} — {res["url"]}')
    return cached(os.path.join(cache, 'pop', dataset + '.csv'), res['url']), meta.get('license')


def read_pop(path, base):
    with open(path, 'rb') as h:
        raw = h.read()
    t = raw.decode('utf-8-sig', errors='replace')
    first = t.split('\n', 1)[0]
    delim = ';' if first.count(';') >= first.count(',') else ','
    csv.field_size_limit(10 ** 8)
    r = csv.reader(io.StringIO(t), delimiter=delim)
    header = next(r)
    m = colmap(header)
    log(f'   {base} : colonnes reconnues ' + ', '.join(f'{k}={header[v]}' for k, v in m.items()))
    if 'ref' not in m or not ({'titre', 'deno'} & m.keys()) or not ({'insee', 'commune', 'dep'} & m.keys()):
        raise SystemExit(f'{base} : colonnes essentielles introuvables (référence, nom, commune) — l’export a changé, corrige COLS')
    get = lambda row, k: (row[m[k]].strip() if k in m and m[k] < len(row) else '')
    out = []
    for row in r:
        ref = get(row, 'ref')
        if not re.match(r'^(PA|PM|IA|IM|EA|EM)[0-9A-Z]{6,}$', ref):
            continue
        insee = re.sub(r'[^0-9AB]', '', get(row, 'insee').upper().split(';')[0].split(',')[0])[:5]
        dep = get(row, 'dep').upper().split(';')[0].strip()
        if len(insee) == 5:
            dep = insee[:3] if insee.startswith('97') else insee[:2]
        dep = dep.zfill(2) if dep.isdigit() and len(dep) < 2 else dep
        if dep not in DEPS:
            continue
        lat = lon = None
        g = re.findall(r'-?\d+\.\d+', get(row, 'geo'))
        if len(g) >= 2:
            a, b = float(g[0]), float(g[1])
            lat, lon = (a, b) if 40 <= a <= 52 or -22 <= a <= 18 else (b, a)
        deno = get(row, 'deno').replace(';', ', ')
        titre = get(row, 'titre') or (deno[:1].upper() + deno[1:])
        resume = get(row, 'hist') or get(row, 'desc')
        out.append({'ref': ref, 'base': base, 'nom': short(titre, 200), 'deno': short(deno, 120), 'insee': insee if len(insee) == 5 else '', 'dep': dep,
                    'commune': short(get(row, 'commune').split(';')[0], 80), 'siecle': short(get(row, 'siecle').replace(';', ', '), 80),
                    'dates': short(get(row, 'dates').replace(';', ', '), 80), 'protection': short(get(row, 'protection').replace(';', ', '), 160),
                    'resume': short(resume, 400), 'edifice': short(get(row, 'edifice'), 160), 'vocable': short(get(row, 'vocable'), 80),
                    'lat': round(lat, 6) if lat else None, 'lon': round(lon, 6) if lon else None})
    log(f'   {base} : {len(out)} notices')
    return out


# ═══════════════════════ Écrire un pack ═══════════════════════

def new_db(path, kind, dep, fixture=False):
    if os.path.exists(path):
        os.remove(path)
    db = sqlite3.connect(path)
    db.executescript('''
        CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT);
        CREATE TABLE sources(id TEXT PRIMARY KEY, nom TEXT, licence TEXT, mention TEXT, url TEXT, mise_a_jour TEXT);''')
    db.executemany('INSERT INTO meta VALUES(?,?)', [('kind', kind), ('format', '1'), ('dep', dep), ('built', datetime.date.today().isoformat())] + ([('fixture', '1')] if fixture else []))
    return db


def add_sources(db, ids, when=None):
    for i in ids:
        nom, lic, mention, url = SOURCES[i]
        db.execute('INSERT INTO sources VALUES(?,?,?,?,?,?)', (i, nom, lic, mention, url, when or datetime.date.today().isoformat()))


def write_lieuxdits_db(path, dep, rows, communes, fixture=False):
    db = new_db(path, 'lieuxdits', dep, fixture)
    db.executescript('''
        CREATE TABLE communes(insee TEXT PRIMARY KEY, nom TEXT, cle TEXT);
        CREATE TABLE lieux(id INTEGER PRIMARY KEY, nom TEXT, cle TEXT, nature TEXT, insee TEXT, lat REAL, lon REAL, habite INTEGER);''')
    db.executemany('INSERT INTO communes VALUES(?,?,?)', [(k, v, fold(v)) for k, v in sorted(communes.items())])
    db.executemany('INSERT INTO lieux(nom,cle,nature,insee,lat,lon,habite) VALUES(?,?,?,?,?,?,?)', rows)
    db.executescript('CREATE INDEX lieux_insee ON lieux(insee); CREATE INDEX lieux_cle ON lieux(cle); CREATE INDEX communes_cle ON communes(cle);')
    db.execute("INSERT INTO meta VALUES('count', ?)", (str(len(rows)),))
    add_sources(db, ['bdtopo', 'adminexpress'])
    db.commit()
    db.execute('VACUUM')
    db.close()
    return len(rows)


def write_patrimoine_db(path, dep, items, fixture=False):
    db = new_db(path, 'patrimoine', dep, fixture)
    db.executescript('''
        CREATE TABLE objets(ref TEXT PRIMARY KEY, base TEXT, nom TEXT, cle TEXT, deno TEXT, insee TEXT, commune TEXT, siecle TEXT, dates TEXT,
            protection TEXT, resume TEXT, edifice TEXT, vocable TEXT, lat REAL, lon REAL);''')
    db.executemany('INSERT OR REPLACE INTO objets VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                   [(x['ref'], x['base'], x['nom'], fold(x['nom']), x['deno'], x['insee'], x['commune'], x['siecle'], x['dates'], x['protection'], x['resume'], x['edifice'], x['vocable'], x['lat'], x['lon']) for x in items])
    db.executescript('CREATE INDEX objets_insee ON objets(insee); CREATE INDEX objets_commune ON objets(commune);')
    db.execute("INSERT INTO meta VALUES('count', ?)", (str(len(items)),))
    add_sources(db, sorted({x['base'] for x in items}) or ['merimee', 'palissy'])
    db.commit()
    db.execute('VACUUM')
    db.close()
    return len(items)


def seal(db_path, out_path, kind, dep, count):
    """l'en-tête de 4 096 octets (sorte, département, taille, empreinte) puis la base"""
    with open(db_path, 'rb') as h:
        body = h.read()
    head = {'kind': kind, 'dep': dep, 'size': len(body), 'sha256': hashlib.sha256(body).hexdigest(), 'count': count, 'built': datetime.date.today().isoformat()}
    hb = MAGIC + json.dumps(head).encode()
    with open(out_path, 'wb') as h:
        h.write(hb + b' ' * (HEADER - len(hb)) + body)
    os.remove(db_path)
    return head


def pack_name(kind, dep):
    return f'lp-{kind}-{dep}.lclieux'


def manifest(folder):
    packs = {}
    for f in sorted(os.listdir(folder)):
        m = re.fullmatch(r'lp-(lieuxdits|patrimoine)-([0-9AB]{2,3})\.lclieux', f)
        if not m:
            continue
        p = os.path.join(folder, f)
        with open(p, 'rb') as h:
            head = json.loads(h.read(HEADER)[len(MAGIC):].decode().strip())
            h.seek(0)
            sha = hashlib.sha256(h.read()).hexdigest()
        size = os.path.getsize(p)
        packs[f'{m.group(1)}-{m.group(2)}'] = {'size': size, 'sha256': sha, 'count': head.get('count', 0), 'built': head.get('built', ''), 'parts': [{'name': f, 'size': size}]}
    man = {'version': datetime.date.today().strftime('%Y-%m'), 'packs': packs}
    with open(os.path.join(folder, 'lieux-patrimoine-manifest.json'), 'w') as h:
        json.dump(man, h, indent=1, sort_keys=True)
    log(f'Manifeste : {len(packs)} packs, {sum(p["size"] for p in packs.values()) / 1e6:.1f} Mo')
    return man


def essai(folder):
    """petits packs d'ESSAI pour les tests (noms inventés, marqués fixture) — jamais montrés comme de vraies données"""
    os.makedirs(folder, exist_ok=True)
    rows = [('la Croix MAZAUD', fold('la Croix MAZAUD'), 'Lieu-dit habité', '15014', 45.10, 2.50, 1), ('Bois LACOMBE', fold('Bois LACOMBE'), 'Lieu-dit non habité', '15014', 45.11, 2.51, 0),
            ('Moulin DURAND', fold('Moulin DURAND'), 'Moulin', '15998', 45.12, 2.52, 1)]
    db = os.path.join(folder, 'tmp.sqlite')
    n = write_lieuxdits_db(db, '15', rows, {'15014': 'Aurillac', '15998': 'Autre-Essai'}, fixture=True)
    seal(db, os.path.join(folder, pack_name('lieuxdits', '15')), 'lieuxdits', '15', n)
    items = [{'ref': 'PA99000001', 'base': 'merimee', 'nom': 'Église d’essai', 'deno': 'église', 'insee': '15014', 'dep': '15', 'commune': 'Aurillac', 'siecle': '12e siècle', 'dates': '', 'protection': '1900/01/01 : classé MH', 'resume': 'Notice d’essai.', 'edifice': '', 'vocable': '', 'lat': 45.1, 'lon': 2.5},
             {'ref': 'PM99000001', 'base': 'palissy', 'nom': 'Cloche d’essai', 'deno': 'cloche', 'insee': '15014', 'dep': '15', 'commune': 'Aurillac', 'siecle': '17e siècle', 'dates': '1650', 'protection': '1910/01/01 : classé au titre objet', 'resume': '', 'edifice': 'église d’essai', 'vocable': '', 'lat': None, 'lon': None}]
    n = write_patrimoine_db(db, '15', items, fixture=True)
    seal(db, os.path.join(folder, pack_name('patrimoine', '15')), 'patrimoine', '15', n)
    return manifest(folder)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('quoi', choices=['lieuxdits', 'patrimoine', 'tout', 'manifeste', 'essai'])
    ap.add_argument('--dep', action='append', default=[])
    ap.add_argument('--dossier', default='lieux-patrimoine-sortie')
    ap.add_argument('--cache', default=None)
    a = ap.parse_args()
    out = a.dossier
    cache = a.cache or os.path.join(out, 'telechargements')
    os.makedirs(out, exist_ok=True)
    if a.quoi == 'essai':
        essai(out)
        return
    if a.quoi == 'manifeste':
        manifest(out)
        return
    deps = [d.upper().zfill(2) for d in a.dep] or DEPS
    tmp = os.path.join(out, 'travail.sqlite')
    if a.quoi in ('lieuxdits', 'tout'):
        communes = all_communes(cache)
        log(f'Communes (ADMIN EXPRESS) : {len(communes)}')
        for dep in deps:
            rows, com = build_lieuxdits(dep, cache, communes)
            n = write_lieuxdits_db(tmp, dep, rows, com)
            h = seal(tmp, os.path.join(out, pack_name('lieuxdits', dep)), 'lieuxdits', dep, n)
            log(f'🏘️ {dep} : {n} lieux-dits, {h["size"] / 1e6:.2f} Mo')
    if a.quoi in ('patrimoine', 'tout'):
        mer, lic1 = dataset_csv(MERIMEE_DATASET, cache)
        pal, lic2 = dataset_csv(PALISSY_DATASET, cache)
        if lic1 not in ('lov2', 'fr-lo') or lic2 not in ('lov2', 'fr-lo'):
            raise SystemExit(f'Licence inattendue (Mérimée {lic1}, Palissy {lic2}) : vérifier avant de diffuser.')
        items = read_pop(mer, 'merimee') + read_pop(pal, 'palissy')
        by = {}
        for x in items:
            by.setdefault(x['dep'], []).append(x)
        for dep in deps:
            n = write_patrimoine_db(tmp, dep, by.get(dep, []))
            h = seal(tmp, os.path.join(out, pack_name('patrimoine', dep)), 'patrimoine', dep, n)
            log(f'⛪ {dep} : {n} notices, {h["size"] / 1e6:.2f} Mo')
    manifest(out)


if __name__ == '__main__':
    main()
