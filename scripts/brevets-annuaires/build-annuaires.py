#!/usr/bin/env python3
"""LCNDA — 📇 Les annuaires du commerce de Paris (1787–1914) : fabrique le pack ba-annuaires.sqlite.gz.

    python3 scripts/brevets-annuaires/build-annuaires.py pack     [--dossier ba-sortie] [--zip directories-ListNoms.zip] [--annees 1850-1860]
    python3 scripts/brevets-annuaires/build-annuaires.py fixture  DOSSIER --noms MAZAUD,LACOMBE,DURAND --annees 1855,1898 [--max 400]
                                                                  (pack d'essai fait de vraies lignes : tests/test-brevets-annuaires.js)

Rien n'est livré avec l'app : .github/workflows/brevets-annuaires.yml dépose ba-annuaires.sqlite.gz (coupé en morceaux de
1,9 Go au plus) dans la version « brevets-annuaires-donnees » du dépôt, avec brevets-annuaires-manifest.json ; l'app le
télécharge (Réglages → 📇 Annuaires de Paris → ⤓ Installer : lib/brevets_annuaires.php), vérifie l'empreinte, puis le range.

Source (téléchargée et relue le 25/11/2026) :
  SoDUCo (ANR-18-CE38-0013 : EHESS, IGN-LASTIG, EPITA, BnF…) — « Annuaires historiques parisiens, 1798-1914. Extraction
  structurée et géolocalisée à l'adresse des listes nominatives par ordre alphabétique et par activité dans les volumes
  numérisés », NAKALA, DOI 10.34847/nkl.98eem49t (version 4), licence Etalab 2.0 (Licence Ouverte : réutilisation libre,
  y compris commerciale, en citant la source et la date de mise à jour).
  Fichier lu : directories-ListNoms.zip (2 182 889 077 octets, sha1 edd55aa542a6a47cc07a0e3f705939919cf2c284) : un CSV
  par année de publication (102 années de 1787 à 1914, 5,7 Go de CSV), une ligne par ADRESSE d'une entrée de la liste
  alphabétique des noms (« ListNoms »). Colonnes gardées : per (la 1re personne nommée), act (activité), address.number,
  address.name (comme imprimés), geocoding.* (point WGS84 donné par le géocodeur historique, rue trouvée, score),
  source.pdf_id, source.publication_year, source.view_link (la vue Gallica de la page, ou le livre entier).
  directories_sources.csv (même dépôt) : le titre de chaque annuaire.
  Pas repris : text_ocr (le texte brut, trop lourd ; la page numérisée est à un clic), les listes par profession
  (directories-ListProfs.zip : les mêmes commerçants rangés par métier) et les GPKG (mêmes données).
  Avertissement des auteurs : extraction automatique (OCR + reconnaissance des noms + géocodage) — des erreurs de lecture
  et de position existent ; toujours vérifier sur la page numérisée.

Format du pack (SQLite) : meta(key, value) ; books(id, code, coll, label, title, year, url) ;
streets(id, name, sk) : les rues trouvées par le géocodeur (sk : en minuscules sans accents) ;
e(id, k, n, g, a, num, ad, s, la, lo, q, z, y, b, p) : k = nom en MAJUSCULES sans accents ni espaces (pour chercher),
n = le nom tel qu'imprimé (sans la parenthèse), g = ce qui suit entre parenthèses (prénom, initiales, Mme, Vve…), a = activité, num + ad =
l'adresse imprimée, s = la rue géocodée (streets.id), la/lo = position ×100 000, q = score de ressemblance de l'adresse
(0–100), z = 1 au numéro, 2 à la rue seulement, y = année de l'annuaire, b = books.id, p = la vue (page) Gallica.
years(y, lo, hi, n) : les lignes d'une année sont les id de lo à hi. Index : (k, y), (s, y).
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
import shutil
import sqlite3
import sys
import time
import unicodedata
import urllib.request
import zipfile

UA = 'Mozilla/5.0 (LCNDA, fabrication du pack des annuaires de Paris)'
NAKALA = 'https://api.nakala.fr/data/10.34847/nkl.98eem49t/'
NOMS_ZIP = NAKALA + 'edd55aa542a6a47cc07a0e3f705939919cf2c284'
NOMS_ZIP_SIZE = 2182889077
SOURCES_CSV = NAKALA + '5a735666070d91df44447eaaa9b54563b831da1c'
PAGE = 'https://nakala.fr/10.34847/nkl.98eem49t'
MENTION = ('SoDUCo (EHESS, IGN, EPITA, BnF…), « Annuaires historiques parisiens, 1798-1914. Extraction structurée et géolocalisée '
           'à l’adresse des listes nominatives », NAKALA, DOI 10.34847/nkl.98eem49t (version 4, 2023) — Licence Ouverte Etalab 2.0')
LICENCE = 'Licence Ouverte Etalab 2.0'
csv.field_size_limit(1 << 30)

COLL = {'DidotBottin': 'annuaire Didot-Bottin', 'Didot': 'annuaire Didot', 'AlmComm': 'Almanach du commerce (Bottin)',
        'Paris_Hachette': 'Paris-Hachette', 'Paris_adresses': 'Paris-Adresses', 'Alm_paris': 'Almanach des adresses de Paris',
        'Panckoucke_hab': 'Almanach des 25 000 adresses', 'Panckoucke_Comm': 'Almanach des commerçants (Panckoucke)',
        'Cambon1': 'Almanach des commerçants (Cambon)', 'Cambon2': 'Almanach des fabricants (Cambon)', 'Bazar': 'Bazar parisien',
        'Deflandre': 'Répertoire du commerce (Deflandre)', 'Almgene': 'Almanach général', 'Alm_dep_seine': 'Almanach de Paris (Seine)',
        'Notables_commercants': 'Notables commerçants', 'Notables_communaux_seine': 'Notables communaux de la Seine',
        'Favre_et_Duchesne': 'Almanach du commerce (Favre et Duchesne)'}


def log(*a):
    print(*a, file=sys.stderr, flush=True)


class HttpFile(io.RawIOBase):
    """un fichier en ligne lu par morceaux (HTTP Range) : le zip n'a pas besoin d'être téléchargé en entier"""
    def __init__(self, url):
        self.url, self.pos = url, 0
        r = self._get(0, 0)
        self.size = int(r.headers['Content-Range'].split('/')[1])

    def _get(self, a, b):
        for t in range(6):
            try:
                return urllib.request.urlopen(urllib.request.Request(self.url, headers={'Range': f'bytes={a}-{b}', 'User-Agent': UA}), timeout=180)
            except Exception as e:  # noqa: BLE001 — réseau : on réessaie
                log('  réseau, nouvel essai :', e)
                time.sleep(5 * (t + 1))
        raise RuntimeError('serveur injoignable : ' + self.url)

    def seekable(self): return True
    def readable(self): return True
    def tell(self): return self.pos

    def seek(self, o, w=0):
        self.pos = {0: o, 1: self.pos + o, 2: self.size + o}[w]
        return self.pos

    def readinto(self, buf):
        n = len(buf)
        if n == 0 or self.pos >= self.size:
            return 0
        end = min(self.size, self.pos + n) - 1
        for t in range(6):
            try:
                data = self._get(self.pos, end).read()
                break
            except Exception as e:  # noqa: BLE001
                log('  lecture interrompue, nouvel essai :', e)
                time.sleep(5 * (t + 1))
        else:
            raise RuntimeError('lecture impossible')
        buf[:len(data)] = data
        self.pos += len(data)
        return len(data)


def fold(s):
    s = unicodedata.normalize('NFKD', str(s or '').replace('œ', 'oe').replace('Œ', 'OE').replace('æ', 'ae').replace('Æ', 'AE').replace('ß', 'ss'))
    return ''.join(c for c in s if not unicodedata.combining(c))


def cle(s):
    """MAJUSCULES sans accents, sans espaces ni tirets — comme ba_key() dans lib/brevets_annuaires.php"""
    return re.sub(r'[^A-Z]+', '', fold(s).upper())


QUOTED = re.compile(r"'((?:[^']|'')*)'")
PREFIX = re.compile(r"^(?:M(?:me|lle|lles|M|r|\.)?|Mad(?:ame|\.)?|Mlle|Ve|Vve|Veuve|Dlle|Mme)\.?\s+", re.I)
TAIL = re.compile(r"\s+(?:a[iî]n[ée]|jeune|fils|p[èe]re|fr[èe]res|neveu|cadet|et\s.*|&.*|ets?\s.*|aîné.*|ainé.*|C(?:ie|ompagnie)\b.*)$", re.I)


def parse_name(per):
    """per = « 'Bechet (Ernest','X' » → (nom imprimé, clé du nom, entre parenthèses)"""
    items = [x.replace("''", "'").strip() for x in QUOTED.findall(per or '')]
    items = [x for x in items if x]
    if not items:
        return '', '', ''
    raw = re.sub(r'\s+', ' ', items[0])[:120]
    m = re.match(r'^([^(]*)\(([^)]*)\)?(.*)$', raw)
    head, given = (m.group(1), m.group(2)) if m else (raw, '')
    head = head.strip(' ,.;:')
    head = PREFIX.sub('', head)
    head = TAIL.sub('', head).split(',')[0].strip()
    printed = (m.group(1).strip(' ,;:') if m else raw)[:120]
    return printed, cle(head), re.sub(r'\s+', ' ', given).strip(' ,;:')[:60]


def caps_header(raw):
    letters = [c for c in raw if c.isalpha()]
    return len(letters) >= 4 and not any(c.islower() for c in letters)


SMALL = {'de', 'du', 'des', 'la', 'le', 'les', 'au', 'aux', 'et', 'en', 'sur', 'sous', 'lez', 'les'}
KINDS = {'rue', 'boulevard', 'avenue', 'place', 'quai', 'passage', 'impasse', 'cour', 'cite', 'cité', 'chaussee', 'chaussée', 'faubourg', 'galerie',
         'pont', 'port', 'carrefour', 'allee', 'allée', 'villa', 'square', 'marche', 'marché', 'ruelle', 'chemin', 'route', 'rond', 'enclos', 'cloitre',
         'cloître', 'parvis', 'barriere', 'barrière', 'petite', 'grande', 'vieille', 'nouvelle', 'cul', 'sentier', 'hameau', 'porte', 'rond-point'}


def pretty_street(name):
    """« Rue De L Hirondelle » → « rue de l'Hirondelle » (le géocodeur rend les noms en Majuscules Partout)"""
    words = [w for w in re.split(r'\s+', str(name or '').strip()) if w]
    out = []
    for i, w in enumerate(words):
        lw = w.lower()
        if i == 0 and fold(lw) in {fold(k) for k in KINDS}:
            out.append(lw)
        elif lw in SMALL and 0 < i < len(words) - 1:
            out.append(lw)
        elif lw in ('l', 'd') and i < len(words) - 1:
            out.append(lw + "'")
        elif i > 0 and re.match(r"^[LD]'", w):
            out.append(w[0].lower() + w[1:])
        else:
            out.append(w)
    s = ' '.join(out)
    return re.sub(r"([ld]') ", r'\1', s)


SCHEMA = """
CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE books(id INTEGER PRIMARY KEY, code TEXT UNIQUE, coll TEXT, label TEXT, title TEXT, year INTEGER, url TEXT);
CREATE TABLE streets(id INTEGER PRIMARY KEY, name TEXT UNIQUE, sk TEXT);
CREATE TABLE years(y INTEGER PRIMARY KEY, lo INTEGER, hi INTEGER, n INTEGER);
CREATE TABLE e(id INTEGER PRIMARY KEY, k TEXT, n TEXT, g TEXT, a TEXT, num TEXT, ad TEXT, s INTEGER, la INTEGER, lo INTEGER, q INTEGER, z INTEGER, y INTEGER, b INTEGER, p INTEGER);
"""


def load_sources(path=None):
    if path and os.path.exists(path):
        data = open(path, encoding='utf-8').read()
    else:
        data = urllib.request.urlopen(urllib.request.Request(SOURCES_CSV, headers={'User-Agent': UA}), timeout=120).read().decode('utf-8')
    out = {}
    for r in csv.DictReader(io.StringIO(data)):
        code = r['code_fichier']
        if code in out and r['liste_type'] != 'ListNoms':
            continue
        url = r['lien_ouvrage_en_ligne'] if r['lien_ouvrage_en_ligne'] not in ('', 'NULL') else ''
        coll = r['collection_almanach']
        out[code] = {'coll': coll, 'label': COLL.get(coll, re.sub(r'\s+', ' ', r['titre_ouvrage'])[:60]), 'title': re.sub(r'\s+', ' ', r['titre_ouvrage'])[:400],
                     'year': int(r['liste_annee']) if r['liste_annee'].isdigit() else None, 'url': url}
    return out


def open_zip(path):
    if path:
        return zipfile.ZipFile(path)
    return zipfile.ZipFile(io.BufferedReader(HttpFile(NOMS_ZIP), buffer_size=1 << 23))


def year_filter(spec):
    if not spec:
        return lambda y: True
    keep = set()
    for part in spec.split(','):
        part = part.strip()
        if '-' in part:
            a, b = part.split('-', 1)
            keep.update(range(int(a), int(b) + 1))
        elif part:
            keep.add(int(part))
    return lambda y: y in keep


def build(db_path, zpath, years, names=None, max_rows=0, sources_path=None):
    if os.path.exists(db_path):
        os.remove(db_path)
    con = sqlite3.connect(db_path)
    con.executescript('PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF; PRAGMA page_size=4096;' + SCHEMA)
    books_src = load_sources(sources_path)
    books, streets = {}, {}
    stats = {'rows_read': 0, 'kept': 0, 'no_name': 0, 'header': 0, 'geocoded': 0, 'street_level': 0, 'years': {}, 'books': 0}
    keep_year = year_filter(years)
    z = open_zip(zpath)
    members = sorted(i.filename for i in z.infolist() if re.match(r'^\d{4}/directories-ListNoms-\d{4}\.csv$', i.filename))
    batch = []
    t0 = time.time()

    def flush():
        con.executemany('INSERT INTO e(k, n, g, a, num, ad, s, la, lo, q, z, y, b, p) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)', batch)
        batch.clear()

    done = False
    for name in members:
        y = int(name[:4])
        if not keep_year(y):
            continue
        n_year = 0
        with z.open(name) as m:
            for r in csv.DictReader(io.TextIOWrapper(m, encoding='utf-8', newline='')):
                stats['rows_read'] += 1
                raw, k, given = parse_name(r.get('per', ''))
                if r.get('per', '') and '(' in raw:
                    raw = raw.split('(')[0].strip()
                if len(k) < 2:
                    stats['no_name'] += 1
                    continue
                if caps_header(raw) and not r.get('act', '').strip():
                    stats['header'] += 1
                    continue
                if names and k not in names:
                    continue
                code = r.get('source.pdf_id', '')
                if code not in books:
                    b = books_src.get(code) or {'coll': r.get('source.collection', ''), 'label': COLL.get(r.get('source.collection', ''), r.get('source.book', '')), 'title': r.get('source.book', ''), 'year': y, 'url': ''}
                    con.execute('INSERT INTO books(code, coll, label, title, year, url) VALUES(?,?,?,?,?,?)', (code, b['coll'], b['label'], b['title'], b['year'] or y, b['url']))
                    books[code] = con.execute('SELECT last_insert_rowid()').fetchone()[0]
                link = r.get('source.view_link', '')
                mm = re.match(r'^https://gallica\.bnf\.fr/ark:/12148/[a-z0-9]+/f(\d+)$', link)
                page = int(mm.group(1)) if mm else None
                if page is None and link and not con.execute('SELECT url FROM books WHERE id=?', (books[code],)).fetchone()[0]:
                    con.execute('UPDATE books SET url=? WHERE id=?', (link, books[code]))
                elif page is not None:
                    base = link[:link.rindex('/f')]
                    cur = con.execute('SELECT url FROM books WHERE id=?', (books[code],)).fetchone()[0]
                    if not cur.startswith('https://gallica.bnf.fr/'):
                        con.execute('UPDATE books SET url=? WHERE id=?', (base, books[code]))
                act = re.sub(r"\s+", ' ', ', '.join(x.replace("''", "'").strip() for x in QUOTED.findall(r.get('act', '')) if x.strip()))[:160]
                num = re.sub(r'\s+', ' ', r.get('address.number', '')).strip(' .,')[:20]
                ad = re.sub(r'\s+', ' ', r.get('address.name', '')).strip(' .,')[:120]
                sid = la = lo = q = zz = None
                if r.get('geocoding.has_geocoding') == 'True':
                    g = re.match(r'POINT \(([-\d.]+) ([-\d.]+)\)', r.get('geocoding.response.geom', ''))
                    if g:
                        lo, la = round(float(g.group(1)) * 1e5), round(float(g.group(2)) * 1e5)
                        zz = 1 if r.get('geocoding.response.layer') == 'address' else 2
                        try:
                            q = round(float(r.get('geocoding.response.score_levenshtein') or 0) * 100)
                        except ValueError:
                            q = 0
                        st = pretty_street(r.get('geocoding.response.name', ''))
                        if st:
                            if st not in streets:
                                con.execute('INSERT INTO streets(name, sk) VALUES(?,?)', (st, fold(st).lower()))
                                streets[st] = con.execute('SELECT last_insert_rowid()').fetchone()[0]
                            sid = streets[st]
                        stats['geocoded'] += 1
                        if zz == 2:
                            stats['street_level'] += 1
                batch.append((k, raw, given, act, num, ad, sid, la, lo, q, zz, y, books[code], page))
                stats['kept'] += 1
                n_year += 1
                if len(batch) >= 20000:
                    flush()
                if max_rows and stats['kept'] >= max_rows:
                    done = True
                    break
        stats['years'][str(y)] = n_year
        log(f'{name} : {n_year} lignes gardées (total {stats["kept"]}, {int(time.time() - t0)} s)')
        if done:
            break
    flush()
    stats['books'] = len(books)
    log('index…')
    # les lignes sont rangées par année : years(y, lo, hi) suffit pour chercher « en 1855 » (pas d'index sur y)
    con.execute('INSERT INTO years(y, lo, hi, n) SELECT y, MIN(id), MAX(id), COUNT(*) FROM e GROUP BY y')
    con.executescript('CREATE INDEX e_k ON e(k, y); CREATE INDEX e_s ON e(s, y); CREATE INDEX streets_sk ON streets(sk);')
    ys = [int(x) for x, n in stats['years'].items() if n]
    meta = {'kind': 'annuaires', 'format': '1', 'count': str(stats['kept']), 'built': datetime.date.today().isoformat(),
            'year_from': str(min(ys) if ys else ''), 'year_to': str(max(ys) if ys else ''), 'mention': MENTION, 'licence': LICENCE, 'url': PAGE,
            'source_version': '4', 'fixture': '1' if names else ''}
    con.executemany('INSERT INTO meta(key, value) VALUES(?,?)', meta.items())
    con.commit()
    con.execute('VACUUM')
    con.close()
    return stats


def gz(src, dst):
    with open(src, 'rb') as a, gzip.open(dst, 'wb', compresslevel=9) as b:
        shutil.copyfileobj(a, b, 1 << 22)
    h = hashlib.sha256()
    with open(dst, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 22), b''):
            h.update(chunk)
    return h.hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('quoi', choices=['pack', 'fixture'])
    ap.add_argument('dossier', nargs='?', default='ba-sortie')
    ap.add_argument('--dossier', dest='dossier2')
    ap.add_argument('--zip', default='', help='directories-ListNoms.zip déjà téléchargé (sinon : lu en ligne par morceaux)')
    ap.add_argument('--sources-csv', default='', help='directories_sources.csv déjà téléchargé')
    ap.add_argument('--annees', default='', help='ex. « 1850-1860,1898 » (vide = toutes)')
    ap.add_argument('--noms', default='', help='fixture : les noms à garder, séparés par des virgules')
    ap.add_argument('--max', type=int, default=0)
    a = ap.parse_args()
    out = a.dossier2 or a.dossier
    os.makedirs(out, exist_ok=True)
    db = os.path.join(out, 'ba-annuaires.sqlite')
    names = {cle(x) for x in a.noms.split(',') if x.strip()} or None
    if a.quoi == 'fixture' and not names:
        sys.exit('--noms est obligatoire pour un pack d’essai')
    stats = build(db, a.zip or None, a.annees, names, a.max, a.sources_csv or None)
    sqlite_size = os.path.getsize(db)
    sha = gz(db, db + '.gz')
    size = os.path.getsize(db + '.gz')
    rep = {'annuaires': {**stats, 'size': size, 'sha256': sha, 'sqlite_size': sqlite_size, 'records': stats['kept'], 'source': PAGE, 'licence': LICENCE,
                         'zip_size': NOMS_ZIP_SIZE, 'built': datetime.date.today().isoformat()}}
    json.dump(rep, open(os.path.join(out, 'ba-rapport.json'), 'w'), indent=1, ensure_ascii=False)
    if a.quoi == 'fixture':
        os.remove(db)
        man = {'version': 'essai', 'packs': {'annuaires': {'size': size, 'sha256': sha, 'sqlite_size': sqlite_size, 'records': stats['kept'], 'built': 'essai',
                                                          'parts': [{'name': 'ba-annuaires.sqlite.gz.000', 'size': size}]}}}
        os.replace(db + '.gz', os.path.join(out, 'ba-annuaires.sqlite.gz.000'))
        json.dump(man, open(os.path.join(out, 'brevets-annuaires-manifest.json'), 'w'), indent=1)
    log(json.dumps({k: v for k, v in rep['annuaires'].items() if k != 'years'}, ensure_ascii=False))


if __name__ == '__main__':
    main()
