#!/usr/bin/env python3
"""LCNDA — 🗳 Élections d'autrefois : fabrique le pack « elections.sqlite » (résultats par commune depuis 1848).

    python3 scripts/elections/build-elections.py [--dossier elections-sortie] [--source-dir ZIPS] [--sans-wikidata]

Sources (rien n'est livré avec l'app : le pack est déposé dans la version « elections-donnees » du dépôt par
.github/workflows/elections.yml, puis téléchargé dans l'app : Réglages → 🗳 Élections d'autrefois → ⤓ Installer) :

1. Julia Cagé et Thomas Piketty, « Une histoire du conflit politique. Élections et inégalités sociales en France,
   1789-2022 », Paris, Le Seuil, 2023 — données : https://unehistoireduconflitpolitique.fr/telecharger.html
   Fichiers : https://conflit-politique-data.ams3.cdn.digitaloceanspaces.com/zip/<élection>_csv.zip
   (législatives 1848 → 2022, présidentielles 1848 et 1965 → 2022). Conditions, mot pour mot, sur la page :
   « Vous pouvez télécharger librement l'ensemble de ces données qui sont entièrement à votre disposition, mais
   n'oubliez pas de citer la source : Julia Cagé et Thomas Piketty (2023) : Une histoire du conflit politique.
   Élections et inégalités sociales en France, 1789-2022, Paris, Le Seuil. » Aucune licence nommée.
2. Wikidata (CC0) : les députés qui ont un identifiant Sycomore (P1045), leurs mandats (P39) avec date de début
   (= date de l'élection), circonscription (P768) et département (P2586) — pour proposer l'élection sur le profil
   « Homme / femme politique » d'une fiche (« À vérifier »). Le contenu de Sycomore n'est pas copié : seulement le
   numéro, pour faire le lien vers la fiche officielle.

Le format des CSV n'a pas pu être ouvert au moment d'écrire ce programme (hôte des fichiers non joignable) : il est
lu sans rien supposer de fixe (séparateur, encodage, noms de colonnes reconnus par motif), et chaque fichier lu est
décrit dans elections-rapport.json (colonnes trouvées, colonnes de voix, groupes non reconnus). Une élection dont
aucune commune n'est lue fait échouer la fabrication : mieux vaut pas de pack qu'un pack faux.
"""
import argparse
import csv
import datetime
import hashlib
import io
import json
import os
import re
import sqlite3
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
import zipfile

PAGE = 'https://unehistoireduconflitpolitique.fr/telecharger.html'
DATA = 'https://conflit-politique-data.ams3.cdn.digitaloceanspaces.com'
UA = 'Mozilla/5.0 (LCNDA, fabrication des donnees electorales)'
WDQS = 'https://query.wikidata.org/sparql'
CITATION = ('Julia Cagé et Thomas Piketty (2023) : Une histoire du conflit politique. Élections et inégalités sociales '
            'en France, 1789-2022, Paris, Le Seuil. Données : unehistoireduconflitpolitique.fr')
TERMS = ('« Vous pouvez télécharger librement l\'ensemble de ces données qui sont entièrement à votre disposition, '
         'mais n\'oubliez pas de citer la source » (unehistoireduconflitpolitique.fr/telecharger.html). Aucune licence nommée.')

# Dates du 1er tour (ou du tour unique) — repères pour la frise ; la clé est le nom du fichier sans « _csv.zip »
DATES = {
    'leg1848': '1848-04-23', 'leg1849': '1849-05-13', 'leg1871fev': '1871-02-08', 'leg1871juil': '1871-07-02',
    'leg1876': '1876-02-20', 'leg1877': '1877-10-14', 'leg1881': '1881-08-21', 'leg1885': '1885-10-04',
    'leg1889': '1889-09-22', 'leg1893': '1893-08-20', 'leg1898': '1898-05-08', 'leg1902': '1902-04-27',
    'leg1906': '1906-05-06', 'leg1910': '1910-04-24', 'leg1914': '1914-04-26', 'leg1919': '1919-11-16',
    'leg1924': '1924-05-11', 'leg1928': '1928-04-22', 'leg1932': '1932-05-01', 'leg1936': '1936-04-26',
    'leg1945': '1945-10-21', 'leg1946juin': '1946-06-02', 'leg1946nov': '1946-11-10', 'leg1951': '1951-06-17',
    'leg1956': '1956-01-02', 'leg1958': '1958-11-23', 'leg1962': '1962-11-18', 'leg1967': '1967-03-05',
    'leg1968': '1968-06-23', 'leg1973': '1973-03-04', 'leg1978': '1978-03-12', 'leg1981': '1981-06-14',
    'leg1986': '1986-03-16', 'leg1988': '1988-06-05', 'leg1993': '1993-03-21', 'leg1997': '1997-05-25',
    'leg2002': '2002-06-09', 'leg2007': '2007-06-10', 'leg2012': '2012-06-10', 'leg2017': '2017-06-11',
    'leg2022': '2022-06-12',
    'pres1848': '1848-12-10', 'pres1965': '1965-12-05', 'pres1969': '1969-06-01', 'pres1974': '1974-05-05',
    'pres1981': '1981-04-26', 'pres1988': '1988-04-24', 'pres1995': '1995-04-23', 'pres2002': '2002-04-21',
    'pres2007': '2007-04-22', 'pres2012': '2012-04-22', 'pres2017': '2017-04-23', 'pres2022': '2022-04-10',
}

# Les grands blocs (suffixe de la colonne de voix, en minuscules, sans accent) → (libellé, famille, « votent … »)
# Seules les colonnes reconnues ici sont des « blocs » ; les autres gardent leur nom (nuance fine, candidat).
BLOCS = {
    'g': ('gauche', 'gauche', 'à gauche'), 'gauche': ('gauche', 'gauche', 'à gauche'), 'gch': ('gauche', 'gauche', 'à gauche'),
    'eg': ('extrême gauche', 'extreme_gauche', 'à l’extrême gauche'), 'exg': ('extrême gauche', 'extreme_gauche', 'à l’extrême gauche'),
    'extremegauche': ('extrême gauche', 'extreme_gauche', 'à l’extrême gauche'),
    'cg': ('centre gauche', 'centre_gauche', 'au centre gauche'), 'centregauche': ('centre gauche', 'centre_gauche', 'au centre gauche'),
    'c': ('centre', 'centre', 'au centre'), 'centre': ('centre', 'centre', 'au centre'), 'cen': ('centre', 'centre', 'au centre'), 'ctr': ('centre', 'centre', 'au centre'),
    'cd': ('centre droit', 'centre_droit', 'au centre droit'), 'centredroit': ('centre droit', 'centre_droit', 'au centre droit'),
    'd': ('droite', 'droite', 'à droite'), 'droite': ('droite', 'droite', 'à droite'), 'drt': ('droite', 'droite', 'à droite'),
    'ed': ('extrême droite', 'extreme_droite', 'à l’extrême droite'), 'exd': ('extrême droite', 'extreme_droite', 'à l’extrême droite'),
    'extremedroite': ('extrême droite', 'extreme_droite', 'à l’extrême droite'),
    'rep': ('républicains', 'republicains', 'républicain'), 'repub': ('républicains', 'republicains', 'républicain'),
    'republicains': ('républicains', 'republicains', 'républicain'), 'republicain': ('républicains', 'republicains', 'républicain'),
    'cons': ('conservateurs', 'conservateurs', 'conservateur'), 'conservateurs': ('conservateurs', 'conservateurs', 'conservateur'),
    'mon': ('monarchistes', 'conservateurs', 'monarchiste'), 'monarchistes': ('monarchistes', 'conservateurs', 'monarchiste'),
    'bon': ('bonapartistes', 'conservateurs', 'bonapartiste'), 'bonapartistes': ('bonapartistes', 'conservateurs', 'bonapartiste'),
    'div': ('divers', 'divers', 'pour des divers'), 'divers': ('divers', 'divers', 'pour des divers'), 'aut': ('autres', 'divers', 'pour d’autres'),
    'autres': ('autres', 'divers', 'pour d’autres'),
}
# Noms de candidats à la présidentielle écrits sans espace ni tiret dans les noms de colonnes
PRES_NAMES = {'degaulle': 'De Gaulle', 'ledrurollin': 'Ledru-Rollin', 'tixiervignancour': 'Tixier-Vignancour', 'lepen': 'Le Pen',
              'giscarddestaing': 'Giscard d’Estaing', 'giscard': 'Giscard d’Estaing', 'chabandelmas': 'Chaban-Delmas', 'dupontaignan': 'Dupont-Aignan',
              'melenchon': 'Mélenchon', 'bove': 'Bové', 'lalonde': 'Lalonde', 'royal': 'Royal', 'chevenement': 'Chevènement', 'debre': 'Debré',
              'cheminade': 'Cheminade', 'villiers': 'de Villiers', 'devilliers': 'de Villiers', 'lepage': 'Lepage', 'taubira': 'Taubira',
              'megret': 'Mégret', 'saintjosse': 'Saint-Josse', 'gluckstein': 'Gluckstein', 'boutin': 'Boutin', 'lecanuet': 'Lecanuet', 'pompidou': 'Pompidou',
              'poher': 'Poher', 'defferre': 'Defferre', 'duclos': 'Duclos', 'rocard': 'Rocard', 'krivine': 'Krivine', 'barbu': 'Barbu', 'marcilhacy': 'Marcilhacy',
              'mitterrand': 'Mitterrand', 'cavaignac': 'Cavaignac', 'bonaparte': 'Louis-Napoléon Bonaparte', 'lamartine': 'Lamartine', 'raspail': 'Raspail',
              'changarnier': 'Changarnier', 'lepenmarine': 'Marine Le Pen', 'mlepen': 'Marine Le Pen', 'jmlepen': 'Jean-Marie Le Pen'}
TOTALS = {'inscrits': 'inscrits', 'votants': 'votants', 'exprimes': 'exprimes', 'expr': 'exprimes', 'nuls': 'nuls', 'blancs': 'blancs', 'abstentions': 'abstentions'}
NOT_VOTES = {'tot', 'total', 'exp', 'exprimes', 'blancs', 'nuls', 'blancsnuls', 'inscrits', 'votants', 'abs', 'abstentions'}


def norm(s):
    s = unicodedata.normalize('NFKD', str(s or '')).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '', s)


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def fetch(url, dest=None, tries=4):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=300) as r:
                if dest is None:
                    return r.read()
                tmp = dest + '.part'
                with open(tmp, 'wb') as f:
                    while True:
                        b = r.read(1 << 20)
                        if not b:
                            break
                        f.write(b)
                os.replace(tmp, dest)
                return dest
        except Exception as e:  # noqa: BLE001 — réseau : on réessaie
            if i == tries - 1:
                raise
            log(f'  … {url} : {e} (nouvel essai)')
            time.sleep(5 * (i + 1))


# ═════════ 1. Les fichiers de Cagé et Piketty ═════════

def list_zips(html):
    """les archives CSV d'élections citées par la page de téléchargement : {'leg1877': url, …}"""
    out = {}
    for url in re.findall(r'https://conflit-politique-data[^"\'\s\\]+?/zip/[^"\'\s\\]+?_csv\.zip', html):
        key = url.rsplit('/', 1)[1][:-len('_csv.zip')]
        if re.match(r'^(leg|pres)\d{4}', key):
            out[key.lower()] = url
    return dict(sorted(out.items()))


def read_csv_bytes(b):
    for enc in ('utf-8-sig', 'cp1252', 'latin-1'):
        try:
            text = b.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    head = text[:5000]
    delim = max([',', ';', '\t', '|'], key=lambda d: head.split('\n', 1)[0].count(d))
    return csv.reader(io.StringIO(text, newline=''), delimiter=delim)


def num(v):
    v = str(v or '').strip().replace(' ', '').replace(' ', '').replace(',', '.')
    if v in ('', '.', 'NA', 'nan', 'NaN', '-'):
        return None
    try:
        return float(v)
    except ValueError:
        return None


def round_of(name):
    n = name.lower()
    return 2 if re.search(r'(t2|tour2|2t|second|_2\.|2ndround)', n) else 1


def parse_file(members, report):
    """lit les CSV d'une archive ; renvoie {tour: {'communes': {code: row}, 'groups': [suffixes], 'kind': 'voix'|'pvoix'}}"""
    out = {}
    for name, data in members:
        rd = read_csv_bytes(data)
        try:
            header = next(rd)
        except StopIteration:
            continue
        h = [norm(c) for c in header]
        info = {'fichier': name, 'colonnes': len(h), 'entete': header[:200]}
        report.append(info)
        ic = next((i for i, c in enumerate(h) if c in ('codecommune', 'codecom', 'codeinsee', 'codgeo', 'insee', 'codecommuneinsee', 'depcom')), None)
        if ic is None:
            info['ignore'] = 'pas de colonne de code commune'
            continue
        inom = next((i for i, c in enumerate(h) if c in ('nomcommune', 'commune', 'libcom', 'libgeo', 'nomcom')), None)
        idep = next((i for i, c in enumerate(h) if c in ('dep', 'codedep', 'departement', 'codedepartement', 'coddep')), None)
        tot = {TOTALS[c]: i for i, c in enumerate(h) if c in TOTALS}
        voix = [(i, c[4:]) for i, c in enumerate(h) if c.startswith('voix') and len(c) > 4 and c[4:] not in NOT_VOTES]
        kind = 'voix'
        if not voix:
            voix = [(i, c[5:]) for i, c in enumerate(h) if c.startswith('pvoix') and len(c) > 5 and c[5:] not in NOT_VOTES]
            kind = 'pvoix'
        if not voix:
            info['ignore'] = 'pas de colonne de voix (voix… ou pvoix…)'
            continue
        info.update({'colonnes_voix': [c for _, c in voix], 'sorte': kind})
        t = round_of(name)
        slot = out.setdefault(t, {'communes': {}, 'groups': [], 'kind': kind, 'fichiers': []})
        if slot['groups'] and [c for _, c in voix] != slot['groups']:
            info['ignore'] = 'un autre fichier du même tour a déjà été lu (colonnes différentes)'
            continue
        slot['groups'] = [c for _, c in voix]
        slot['fichiers'].append(name)
        n = 0
        for row in rd:
            if ic >= len(row):
                continue
            code = str(row[ic]).strip().upper()
            if re.fullmatch(r'\d{4}', code):
                code = '0' + code
            if not re.fullmatch(r'(\d{2}|2A|2B|97\d)[0-9]{2,3}', code) or len(code) != 5:
                continue
            vals = []
            for i, _ in voix:
                x = num(row[i]) if i < len(row) else None
                vals.append(None if x is None else (round(x) if kind == 'voix' else round(x, 6)))
            rec = {k: (num(row[i]) if i < len(row) else None) for k, i in tot.items()}
            rec.update(name=(row[inom].strip() if inom is not None and inom < len(row) else ''), dep=(row[idep].strip() if idep is not None and idep < len(row) else code[:2]), v=vals)
            slot['communes'][code] = rec
            n += 1
        info['communes'] = n
    for slot in out.values():
        if slot['kind'] == 'pvoix':  # des parts : en % (0–100), qu'elles soient écrites 0,62 ou 62
            top = max((x for r in slot['communes'].values() for x in r['v'] if x is not None), default=0)
            k = 100 if top <= 1.0001 else 1
            for r in slot['communes'].values():
                r['v'] = [None if x is None else round(x * k, 2) for x in r['v']]
    return out


def group_meta(key, suffix, nomenclature):
    """(libellé, famille, « votent … », niveau) d'une colonne de voix"""
    s = norm(suffix)
    if s in BLOCS:
        lab, fam, phrase = BLOCS[s]
        return lab, fam, phrase, 'bloc'
    lab = nomenclature.get(s) or nomenclature.get(suffix) or ''
    if key.startswith('pres'):
        # un candidat : « voixMITTERRAND » → « Mitterrand »
        nice = lab or PRES_NAMES.get(s) or ' '.join(w.capitalize() for w in re.split(r'[_\s]+', suffix) if w)
        return nice, '', f'pour {nice}', 'candidat'
    nice = lab or suffix.upper()
    return nice, '', f'pour « {nice} »', 'nuance'


def load_nomenclature(cache):
    """les libellés du site (nomenclature.json, keys.json) : facultatif, on garde ce qui ressemble à {code: libellé}"""
    out = {}
    for name in ('nomenclature.json', 'keys.json'):
        p = os.path.join(cache, name)
        try:
            if not os.path.exists(p):
                fetch(f'{DATA}/nomenclature/{name}', p)
            js = json.load(open(p, encoding='utf-8'))
        except Exception as e:  # noqa: BLE001
            log(f'  (libellés {name} non lus : {e})')
            continue

        def walk(x):
            if isinstance(x, dict):
                for k, v in x.items():
                    if isinstance(v, str) and len(k) <= 40 and len(v) <= 80:
                        out.setdefault(norm(k), v)
                    else:
                        walk(v)
            elif isinstance(x, list):
                for v in x:
                    walk(v)
        walk(js)
    return out


# ═════════ 2. Les députés (Wikidata, CC0) ═════════

Q_POS = """SELECT DISTINCT ?pos ?posLabel WHERE { ?p wdt:P1045 ?s . ?p p:P39 ?st . ?st ps:P39 ?pos .
 SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en". } }"""
Q_MANDATS = """SELECT ?p ?syc ?pos ?start ?end ?dep WHERE { ?p wdt:P1045 ?syc . ?p p:P39 ?st . ?st ps:P39 ?pos . ?st pq:P580 ?start .
 FILTER(YEAR(?start) >= 1848) OPTIONAL { ?st pq:P582 ?end }
 OPTIONAL { ?st pq:P768 ?dist . OPTIONAL { ?dist wdt:P2586 ?dep0 } OPTIONAL { ?dist wdt:P131 ?d2 . ?d2 wdt:P2586 ?dep1 } BIND(COALESCE(?dep0, ?dep1) AS ?dep) } }"""
Q_PERS = """SELECT ?p ?pLabel ?b ?d WHERE { ?p wdt:P1045 ?s . OPTIONAL { ?p wdt:P569 ?b } OPTIONAL { ?p wdt:P570 ?d }
 SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en". } }"""
Q_DEPS = """SELECT ?dep ?depLabel WHERE { ?x wdt:P2586 ?dep . ?x wdt:P31 wd:Q6465 . SERVICE wikibase:label { bd:serviceParam wikibase:language "fr". } }"""


def sparql(q):
    url = WDQS + '?' + urllib.parse.urlencode({'query': q, 'format': 'json'})
    req = urllib.request.Request(url, headers={'User-Agent': 'LCNDA-build/1.0 (genealogy app, data build)', 'Accept': 'application/sparql-results+json'})
    for i in range(4):
        try:
            with urllib.request.urlopen(req, timeout=300) as r:
                return [{k: v['value'] for k, v in b.items()} for b in json.load(r)['results']['bindings']]
        except Exception as e:  # noqa: BLE001
            if i == 3:
                raise
            log(f'  … Wikidata : {e} (nouvel essai)')
            time.sleep(20 * (i + 1))


DEPUTE = re.compile(r"(député|deputee?|représentant|membre de l'assemblée|membre de la chambre des députés|corps législatif|assemblée constituante|assemblée nationale)", re.I)


def deputies(cache, csv_path=None):
    """[(qid, nom, naissance, décès, sycomore, début, fin, département)] : les mandats de député (pas européen, pas sénateur)"""
    if csv_path:
        with open(csv_path, encoding='utf-8') as f:
            return [tuple(r) for r in csv.reader(f)][1:]
    q = lambda u: u.rsplit('/', 1)[-1]
    pos = {q(r['pos']): r.get('posLabel', '') for r in sparql(Q_POS)}
    keep = {k for k, v in pos.items() if DEPUTE.search(v) and not re.search(r'europ|sénat|senat|conseil', v, re.I)}
    pers = {q(r['p']): (r.get('pLabel', ''), (r.get('b') or '')[:4], (r.get('d') or '')[:4]) for r in sparql(Q_PERS)}
    out = []
    for r in sparql(Q_MANDATS):
        if q(r['pos']) not in keep:
            continue
        qid = q(r['p']); nom, b, d = pers.get(qid, ('', '', ''))
        if not nom or re.fullmatch(r'Q\d+', nom):
            continue
        out.append((qid, nom, b, d, r.get('syc', ''), r['start'][:10], (r.get('end') or '')[:10], r.get('dep', '')))
    out = sorted(set(out))
    with open(os.path.join(cache, 'deputes.csv'), 'w', encoding='utf-8', newline='') as f:
        w = csv.writer(f); w.writerow(['qid', 'nom', 'naissance', 'deces', 'sycomore', 'debut', 'fin', 'dep']); w.writerows(out)
    return out


# ═════════ 3. Le pack ═════════

SCHEMA = """
CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE sources(id TEXT PRIMARY KEY, nom TEXT, licence TEXT, mention TEXT, url TEXT);
CREATE TABLE elections(id INTEGER PRIMARY KEY, code TEXT, type TEXT, tour INTEGER, year INTEGER, date TEXT, label TEXT, kind TEXT, groups TEXT, n_communes INTEGER);
CREATE TABLE groups(election_id INTEGER, pos INTEGER, code TEXT, label TEXT, family TEXT, phrase TEXT, level TEXT, PRIMARY KEY(election_id, pos)) WITHOUT ROWID;
CREATE TABLE communes(code TEXT PRIMARY KEY, name TEXT, dep TEXT, name_norm TEXT) WITHOUT ROWID;
CREATE INDEX communes_name ON communes(name_norm);
CREATE TABLE results(commune TEXT, election_id INTEGER, inscrits INTEGER, votants INTEGER, exprimes INTEGER, v TEXT, PRIMARY KEY(commune, election_id)) WITHOUT ROWID;
CREATE TABLE deputes(qid TEXT, nom TEXT, nom_norm TEXT, naissance INTEGER, deces INTEGER, sycomore TEXT, debut TEXT, fin TEXT, dep TEXT);
CREATE INDEX deputes_nom ON deputes(nom_norm);
"""


def label_of(key, tour):
    m = re.match(r'^(leg|pres)(\d{4})(.*)$', key)
    kind, year, extra = m.group(1), m.group(2), m.group(3)
    extra = {'fev': ' (février)', 'juil': ' (juillet)', 'juin': ' (juin)', 'nov': ' (novembre)'}.get(extra, '')
    return f"{'Législatives' if kind == 'leg' else 'Présidentielle'} {year}{extra}{', 2e tour' if tour == 2 else ''}"


def build(args):
    out_dir = args.dossier
    cache = os.path.join(out_dir, 'cache')
    os.makedirs(cache, exist_ok=True)
    if args.source_dir:
        zips = {f[:-len('_csv.zip')].lower(): os.path.join(args.source_dir, f) for f in sorted(os.listdir(args.source_dir)) if f.endswith('_csv.zip')}
        nomen = {}
        p = os.path.join(args.source_dir, 'nomenclature.json')
        if os.path.exists(p):
            nomen = {norm(k): v for k, v in json.load(open(p, encoding='utf-8')).items() if isinstance(v, str)}
    else:
        html = fetch(PAGE).decode('utf-8', 'replace')
        urls = list_zips(html)
        log(f'{len(urls)} archives d’élections citées par {PAGE}')
        if len(urls) < 20:
            sys.exit('La page de téléchargement a changé (moins de 20 archives trouvées) : rien n’est fabriqué.')
        zips = {}
        for key, url in urls.items():
            dest = os.path.join(cache, url.rsplit('/', 1)[1])
            if not (os.path.exists(dest) and os.path.getsize(dest) > 0):
                log(f'⤓ {url}')
                fetch(url, dest)
            zips[key] = dest
        nomen = load_nomenclature(cache)
    report = {'fichiers': {}, 'manquants': [k for k in DATES if k not in zips], 'groupes_non_reconnus': {}}
    target = os.path.join(out_dir, 'elections.sqlite')
    tmp = target + '.tmp'
    if os.path.exists(tmp):
        os.remove(tmp)
    db = sqlite3.connect(tmp)
    db.executescript(SCHEMA)
    communes = {}
    eid = 0
    for key, path in zips.items():
        if key not in DATES:
            log(f'  (archive {key} : date inconnue, ignorée)')
            report['manquants'].append(key + ' (date inconnue)')
            continue
        with zipfile.ZipFile(path) as z:
            members = [(n, z.read(n)) for n in z.namelist() if n.lower().endswith('.csv') and not n.startswith('__MACOSX')]
        # les fichiers « par commune » d'abord ; les autres (départements, circonscriptions) n'ont pas de code commune
        members.sort(key=lambda m: (0 if 'comm' in m[0].lower() else 1, m[0]))
        rep = []
        tours = parse_file(members, rep)
        report['fichiers'][key] = rep
        if not tours or not any(t['communes'] for t in tours.values()):
            sys.exit(f'{key} : aucune commune lue ({os.path.basename(path)}) — voir le rapport ; rien n’est fabriqué.')
        typ = 'leg' if key.startswith('leg') else 'pres'
        for tour, t in sorted(tours.items()):
            eid += 1
            metas = [group_meta(key, g, nomen) for g in t['groups']]
            db.execute('INSERT INTO elections VALUES(?,?,?,?,?,?,?,?,?,?)', (eid, key, typ, tour, int(DATES[key][:4]), DATES[key] if tour == 1 else '', label_of(key, tour), t['kind'], json.dumps(t['groups']), len(t['communes'])))
            for i, (g, (lab, fam, phrase, level)) in enumerate(zip(t['groups'], metas)):
                db.execute('INSERT INTO groups VALUES(?,?,?,?,?,?,?)', (eid, i, g, lab, fam, phrase, level))
                if level == 'nuance':
                    report['groupes_non_reconnus'].setdefault(key, []).append(g)
            rows = []
            for code, r in t['communes'].items():
                communes.setdefault(code, (r['name'], r['dep']))
                if r['name'] and not communes[code][0]:
                    communes[code] = (r['name'], r['dep'])
                v = ','.join('' if x is None else (str(int(x)) if t['kind'] == 'voix' else str(x)) for x in r['v'])
                iv = lambda k: None if r.get(k) is None else int(round(r[k]))
                rows.append((code, eid, iv('inscrits'), iv('votants'), iv('exprimes'), v))
            db.executemany('INSERT OR REPLACE INTO results VALUES(?,?,?,?,?,?)', rows)
            log(f'  {label_of(key, tour)} : {len(rows)} communes, {len(t["groups"])} colonnes de voix')
    db.executemany('INSERT INTO communes VALUES(?,?,?,?)', [(c, n, d, norm(n)) for c, (n, d) in communes.items()])
    deps = []
    if not args.sans_wikidata:
        try:
            deps = deputies(cache, args.deputes_csv)
        except Exception as e:  # noqa: BLE001 — sans Wikidata le pack reste utile (pas de propositions de profil)
            log(f'  (députés Wikidata non lus : {e})')
    db.executemany('INSERT INTO deputes VALUES(?,?,?,?,?,?,?,?,?)', [(q, n, norm(n), int(b) if str(b).isdigit() else None, int(d) if str(d).isdigit() else None, s, a, f, dep) for q, n, b, d, s, a, f, dep in deps])
    built = datetime.date.today().isoformat()
    meta = {'kind': 'elections', 'format': '1', 'built': built, 'title': 'Élections d’autrefois : résultats par commune (1848 → 2022)',
            'citation': CITATION, 'terms': TERMS, 'fixture': '1' if args.fixture else '', 'communes': str(len(communes)), 'elections': str(eid), 'deputes': str(len(deps))}
    db.executemany('INSERT INTO meta VALUES(?,?)', meta.items())
    db.executemany('INSERT INTO sources VALUES(?,?,?,?,?)', [
        ('cage_piketty', 'Une histoire du conflit politique (Cagé et Piketty)', 'Téléchargement libre, citer la source (pas de licence nommée)', CITATION, PAGE),
        ('wikidata', 'Wikidata : députés (identifiant Sycomore P1045)', 'CC0 1.0', 'Wikidata, CC0', 'https://www.wikidata.org/wiki/Property:P1045')])
    db.commit()
    db.execute('VACUUM')
    db.close()
    os.replace(tmp, target)
    with open(os.path.join(out_dir, 'elections-rapport.json'), 'w', encoding='utf-8') as f:
        json.dump(report, f, ensure_ascii=False, indent=1)
    h = hashlib.sha256()
    with open(target, 'rb') as f:
        for b in iter(lambda: f.read(1 << 20), b''):
            h.update(b)
    log(f'✓ {target} : {os.path.getsize(target) / 1e6:.1f} Mo, {eid} élections, {len(communes)} communes, {len(deps)} mandats de députés · sha256 {h.hexdigest()}')
    return target


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--dossier', default='elections-sortie', help='dossier de sortie (et du cache des téléchargements)')
    ap.add_argument('--source-dir', help='des archives *_csv.zip déjà téléchargées (sans Internet)')
    ap.add_argument('--sans-wikidata', action='store_true', help='sans la liste des députés')
    ap.add_argument('--deputes-csv', help='la liste des députés déjà prête (qid,nom,naissance,deces,sycomore,debut,fin,dep)')
    ap.add_argument('--fixture', action='store_true', help=argparse.SUPPRESS)
    build(ap.parse_args())


if __name__ == '__main__':
    main()
