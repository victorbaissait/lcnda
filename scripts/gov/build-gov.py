#!/usr/bin/env python3
"""LCNDA — 🏰 Lieux anciens d'Allemagne et d'Europe centrale : fabrique le pack GOV (gov-pack.lcgov).

Source : GOV, le « Geschichtliches Orts-Verzeichnis » du Verein für Computergenealogie e. V. (https://gov.genealogy.net).
Il n'existe pas de fichier « tout GOV » à télécharger : le programme lit le service web public de GOV
(https://gov.genealogy.net/api, décrit dans /v3/api-docs) :
  1. les types (types.owl : Kirchspiel, Kreis, Provinz… avec leurs noms en allemand, français, polonais, anglais) ;
  2. tous les lieux qui ont des coordonnées, carré par carré (api/searchByBoundingBox ; un carré trop chargé est coupé en 4) ;
  3. les « parents » sans coordonnées (paroisses, Kreise, provinces, États…) un par un (api/getObject), jusqu'en haut.
Tout est gardé dans le dossier de travail : relancer reprend où on s'était arrêté (plusieurs heures pour l'Europe centrale).

Licence : la page « GOV/Webservice » du GenWiki (https://wiki.genealogy.net/GOV/Webservice) dit sous quelle licence
les données du service sont données. Le programme la lit et S'ARRÊTE si elle ne permet pas la redistribution avec
mention (CC BY-SA) : le texte lu est recopié dans le pack (meta.licence_text) et montré dans « À propos des données ».

    python3 scripts/gov/build-gov.py [--zone centre|europe|L0,L1,G0,G1] [--dossier gov-sortie] [--paralleles 3] [--pause 0.2]
    python3 scripts/gov/build-gov.py --depuis-json DOSSIER   # seulement la fabrication, depuis des objets déjà lus (essais)

Sortie : DOSSIER/gov.sqlite et DOSSIER/gov-pack.lcgov (4096 octets d'en-tête « LCGOV1 » + JSON, puis la base SQLite),
téléchargé par l'app (Réglages → 🏰 Lieux anciens (GOV) → ⤓ Installer : lib/gov.php).
"""
import argparse
import concurrent.futures as cf
import datetime
import gzip
import hashlib
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
import xml.etree.ElementTree as ET

API = 'https://gov.genealogy.net/api/'
TYPES_URL = 'https://gov.genealogy.net/types.owl'
LICENCE_URL = 'https://wiki.genealogy.net/index.php?title=GOV/Webservice&action=raw'
LICENCE_PAGE = 'https://wiki.genealogy.net/GOV/Webservice'
# section « Lizenz » de cette page, lue dans un navigateur le 24/11/2026 (le site répond aux programmes par une page anti-robots)
LICENCE_CONFIRMEE = ('Das GOV darf unter den Bedingungen der Creative Commons Namensnennung - Weitergabe unter gleichen Bedingungen 4.0 '
                     'International (CC BY-SA 4.0) Lizenz verwendet werden.')
LICENCE_CONFIRMEE_LE = '2026-11-24'
UA = 'LCNDA-gov-pack/1.0 (genealogy desktop app; one-off build)'
HEADER_MAGIC = b'LCGOV1\n'
HEADER_SIZE = 4096
FORMAT = 1
ZONES = {
    # Allemagne, Autriche, Suisse, Tchéquie, Pologne, Prusse-Orientale, Alsace-Moselle, Luxembourg, Slovaquie, Hongrie de l'ouest
    'centre': (45.5, 56.0, 5.5, 24.5),
    'europe': (35.0, 71.0, -10.0, 40.0),
}
STEP = 0.5  # côté d'un carré (degrés)
GROUP_NAMES = {'1': 'admin', '2': 'civil', '3': 'church', '6': 'court', '8': 'settlement', '4': 'geo', '9': 'transport', '10': 'place', '13': 'other',
               '26': 'adm0', '27': 'adm1', '28': 'adm2', '29': 'adm3', '30': 'adm4', '31': 'adm5', '32': 'adm6'}


def log(*a):
    print(*a, flush=True)


# ═════════ Lire le service de GOV (poliment : peu de requêtes à la fois, une pause, des reprises) ═════════

def http_get(url, timeout=180, tries=4):
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/json, */*'})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code in (400, 404, 410):
                raise
            last = e
        except Exception as e:  # coupure, délai dépassé
            last = e
        time.sleep(5 * (i + 1))
    raise last


def jd_year(jd):
    """jour julien → année (calendrier grégorien à partir du 15 octobre 1582, julien avant)"""
    jd = int(jd)
    if jd >= 2299161:
        a = jd + 32044
        b = (4 * a + 3) // 146097
        c = a - 146097 * b // 4
    else:
        b, c = 0, jd + 32082
    d = (4 * c + 3) // 1461
    e = c - 1461 * d // 4
    m = (5 * e + 2) // 153
    return 100 * b + d - 4800 + m // 10


def span(p):
    """(y1, y2, attesté) d'une propriété GOV : beginYear / endYear / year / timespan {begin, end: {jd}}"""
    y1 = p.get('beginYear')
    y2 = p.get('endYear')
    yr = p.get('year')
    ts = p.get('timespan') or {}
    if y1 is None and (ts.get('begin') or {}).get('jd'):
        y1 = jd_year(ts['begin']['jd'])
    if y2 is None and (ts.get('end') or {}).get('jd'):
        y2 = jd_year(ts['end']['jd'])
    if y1 is not None and y2 is not None and y1 == y2 and yr is None:
        yr, y1, y2 = y1, None, None  # une date seule = « attesté en »
    return (int(y1) if y1 is not None else None, int(y2) if y2 is not None else None, int(yr) if yr is not None else None)


def licence_check(work, skip):
    """lit la licence des données du service (GenWiki « GOV/Webservice ») ; s'arrête si elle n'est pas une CC BY-SA"""
    path = os.path.join(work, 'licence.txt')
    if skip:
        return {'licence': 'CC BY-SA (non vérifiée : --sans-verif-licence)', 'licence_text': '', 'licence_checked': ''}
    try:
        raw = http_get(LICENCE_URL, timeout=60, tries=2).decode('utf-8', 'replace')
    except Exception as e:
        raw, err = '', e
    m = re.search(r'==+\s*Lizenz\s*==+(.*?)(?:\n==[^=]|\Z)', raw, re.S | re.I)
    if not m:
        # le GenWiki montre parfois une page anti-robots au lieu de son texte : on ne la contourne pas ; on reprend alors la
        # section « Lizenz » lue à la main dans un navigateur (voir LICENCE_CONFIRMEE)
        print(f'   ⚠️ page de licence illisible par programme ({LICENCE_PAGE}) : texte lu à la main le {LICENCE_CONFIRMEE_LE} utilisé', flush=True)
        text = LICENCE_CONFIRMEE
        with open(path, 'w', encoding='utf-8') as f:
            f.write(text)
        return {'licence': 'CC BY-SA 4.0', 'licence_text': text, 'licence_checked': LICENCE_CONFIRMEE_LE + ' (lue à la main)'}
    text = m.group(1).strip()
    if not re.search(r'by[-_ ]?sa|Weitergabe unter gleichen Bedingungen|ShareAlike', text, re.I):
        sys.exit('La page de licence de GOV ne dit plus « CC BY-SA » : rien n’est fabriqué. Texte lu :\n' + text[:2000])
    ver = re.search(r'by[-_ ]?sa[/ ]*(\d\.\d)', text, re.I)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(text)
    return {'licence': 'CC BY-SA ' + (ver.group(1) if ver else ''), 'licence_text': re.sub(r'\s+', ' ', re.sub(r'\[\[|\]\]|\'\'+|<[^>]+>', '', text))[:1500],
            'licence_checked': datetime.date.today().isoformat()}


def fetch_types(work):
    path = os.path.join(work, 'types.owl')
    if not os.path.exists(path):
        data = http_get(TYPES_URL)
        with open(path, 'wb') as f:
            f.write(data)
    return parse_types(path)


def parse_types(path):
    R = '{http://www.w3.org/1999/02/22-rdf-syntax-ns#}'
    S = '{http://www.w3.org/2000/01/rdf-schema#}'
    X = '{http://www.w3.org/XML/1998/namespace}lang'
    out = {}
    for el in ET.parse(path).getroot():
        about = el.get(R + 'about', '')
        tid = about.rsplit('#', 1)[-1]
        if not tid.isdigit():
            continue
        groups = set()
        m = re.search(r'group_(\d+)$', el.tag)
        if m:
            groups.add(m.group(1))
        for t in el.findall(R + 'type'):
            m = re.search(r'#group_(\d+)$', t.get(R + 'resource', ''))
            if m:
                groups.add(m.group(1))
        labels = {}
        for l in el.findall(S + 'label'):
            if l.text and l.get(X):
                labels.setdefault(l.get(X), l.text.strip())
        out[int(tid)] = {'labels': labels, 'groups': sorted(groups, key=int)}
    return out


def tiles(zone):
    la0, la1, lo0, lo1 = zone
    la = la0
    while la < la1 - 1e-9:
        lo = lo0
        while lo < lo1 - 1e-9:
            yield (round(la, 4), round(min(la + STEP, la1), 4), round(lo, 4), round(min(lo + STEP, lo1), 4))
            lo += STEP
        la += STEP


def fetch_box(box, tdir, pause, depth=0):
    """un carré → tuiles/<carré>.json.gz (liste d'objets) ; trop long → coupé en 4"""
    name = '%.4f_%.4f_%.4f_%.4f' % box
    path = os.path.join(tdir, name + '.json.gz')
    if os.path.exists(path) or os.path.exists(path + '.split'):
        return
    q = urllib.parse.urlencode({'latitude0': box[0], 'latitude1': box[1], 'longitude0': box[2], 'longitude1': box[3]})
    try:
        data = http_get(API + 'searchByBoundingBox?' + q, timeout=240 if depth < 3 else 600, tries=2 if depth < 3 else 4)
        objs = json.loads(data)
    except Exception as e:
        if depth >= 3:
            raise
        log(f'  carré {name} trop long ({e}) : coupé en 4')
        mla, mlo = (box[0] + box[1]) / 2, (box[2] + box[3]) / 2
        for b in ((box[0], mla, box[2], mlo), (box[0], mla, mlo, box[3]), (mla, box[1], box[2], mlo), (mla, box[1], mlo, box[3])):
            fetch_box(tuple(round(x, 5) for x in b), tdir, pause, depth + 1)
        open(path + '.split', 'w').close()
        return
    tmp = path + '.tmp'
    with gzip.open(tmp, 'wt', encoding='utf-8') as f:
        json.dump(objs, f, ensure_ascii=False)
    os.replace(tmp, path)
    time.sleep(pause)


def load_objects(work):
    objs = {}
    tdir = os.path.join(work, 'tuiles')
    for fn in sorted(os.listdir(tdir)) if os.path.isdir(tdir) else []:
        if fn.endswith('.json.gz'):
            with gzip.open(os.path.join(tdir, fn), 'rt', encoding='utf-8') as f:
                for o in json.load(f):
                    if isinstance(o, dict) and o.get('id'):
                        objs[o['id']] = o
    extra = os.path.join(work, 'parents.jsonl')
    if os.path.exists(extra):
        with open(extra, encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        o = json.loads(line)
                    except ValueError:  # dernière ligne coupée par un arrêt : relue la prochaine fois
                        continue
                    if o.get('id'):
                        objs[o['id']] = o
    return objs


def refs(o):
    return [r['ref'] for r in o.get('partOf') or [] if isinstance(r, dict) and r.get('ref')]


def fetch_parents(work, objs, workers, pause):
    """les parents (sans coordonnées) jusqu'en haut : paroisses, Kreise, provinces, États"""
    extra = os.path.join(work, 'parents.jsonl')
    gone_path = os.path.join(work, 'introuvables.txt')
    gone = set(open(gone_path).read().split()) if os.path.exists(gone_path) else set()
    rnd = 0
    while True:
        want = sorted({r for o in objs.values() for r in refs(o)} - set(objs) - gone)
        if not want:
            return
        rnd += 1
        log(f'Parents, tour {rnd} : {len(want)} à lire')

        def one(gid):
            time.sleep(pause)
            try:
                return gid, json.loads(http_get(API + 'getObject?' + urllib.parse.urlencode({'itemId': gid}), timeout=60))
            except urllib.error.HTTPError as e:
                if e.code in (400, 404, 410):
                    return gid, None
                raise
        done = 0
        with open(extra, 'a', encoding='utf-8') as out, open(gone_path, 'a') as g, cf.ThreadPoolExecutor(workers) as ex:
            for gid, o in ex.map(one, want):
                if o and o.get('id'):
                    objs[o['id']] = o
                    if o['id'] != gid:
                        objs[gid] = o
                    out.write(json.dumps(o, ensure_ascii=False) + '\n')
                else:
                    gone.add(gid)
                    g.write(gid + '\n')
                done += 1
                if done % 2000 == 0:
                    out.flush()
                    log(f'  {done} / {len(want)}')


# ═════════ Fabriquer la base ═════════

FOLD_EXTRA = {'ß': 'ss', 'ł': 'l', 'đ': 'd', 'ø': 'o', 'æ': 'ae', 'œ': 'oe', 'þ': 'th', 'ð': 'd', 'ı': 'i', 'ŀ': 'l', 'ħ': 'h', 'ŧ': 't'}


def fold_char(c):
    if c in FOLD_EXTRA:
        return FOLD_EXTRA[c]
    d = ''.join(x for x in unicodedata.normalize('NFKD', c) if not unicodedata.combining(x))
    return d if d and all(ord(x) < 128 for x in d) else c


def make_fold(fold_map):
    def fold(s):
        s = (s or '').lower()
        out = []
        for c in s:
            if ord(c) >= 128:
                if c not in fold_map:
                    fold_map[c] = fold_char(c)
                c = fold_map[c]
            out.append(c)
        return re.sub(r'[\W_]+', ' ', ''.join(out)).strip()
    return fold


SCHEMA = '''
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE types (id INTEGER PRIMARY KEY, de TEXT, fr TEXT, en TEXT, pl TEXT, cs TEXT, grp TEXT);
CREATE TABLE obj (id INTEGER PRIMARY KEY, gov TEXT NOT NULL UNIQUE, lat REAL, lon REAL);
CREATE TABLE name (obj INTEGER NOT NULL, name TEXT NOT NULL, fold TEXT NOT NULL, lang TEXT, y1 INTEGER, y2 INTEGER, yr INTEGER);
CREATE TABLE typ (obj INTEGER NOT NULL, type INTEGER NOT NULL, y1 INTEGER, y2 INTEGER, yr INTEGER);
CREATE TABLE rel (child INTEGER NOT NULL, parent INTEGER NOT NULL, y1 INTEGER, y2 INTEGER, yr INTEGER);
CREATE TABLE postal (obj INTEGER NOT NULL, code TEXT NOT NULL, y1 INTEGER, y2 INTEGER, yr INTEGER);
CREATE TABLE extref (obj INTEGER NOT NULL, ref TEXT NOT NULL);
'''
INDEXES = '''
CREATE INDEX name_fold ON name(fold);
CREATE INDEX name_obj ON name(obj);
CREATE INDEX typ_obj ON typ(obj);
CREATE INDEX rel_child ON rel(child);
CREATE INDEX rel_parent ON rel(parent);
CREATE INDEX postal_obj ON postal(obj);
CREATE INDEX postal_code ON postal(code);
CREATE INDEX obj_lat ON obj(lat, lon);
CREATE INDEX extref_obj ON extref(obj);
'''


def build_db(objs, types, out_db, meta):
    if os.path.exists(out_db):
        os.remove(out_db)
    db = sqlite3.connect(out_db)
    db.executescript('PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF; PRAGMA page_size=4096;' + SCHEMA)
    for tid, t in sorted(types.items()):
        L = t['labels']
        db.execute('INSERT INTO types VALUES(?,?,?,?,?,?,?)', (tid, L.get('de'), L.get('fr'), L.get('en'), L.get('pl'), L.get('cs'), ','.join(t['groups'])))
    ids = {}
    uniq = {}
    for k, o in objs.items():
        uniq.setdefault(o['id'], o)
    for n, gid in enumerate(sorted(uniq), 1):
        ids[gid] = n
    for k, o in objs.items():  # anciens identifiants redirigés vers le nouveau
        ids.setdefault(k, ids[o['id']])
    fold_map = {}
    fold = make_fold(fold_map)
    rows = {'obj': [], 'name': [], 'typ': [], 'rel': [], 'postal': [], 'extref': []}
    for gid, o in uniq.items():
        i = ids[gid]
        pos = o.get('position') or {}
        lat, lon = pos.get('lat'), pos.get('lon')
        rows['obj'].append((i, gid, round(lat, 5) if lat is not None else None, round(lon, 5) if lon is not None else None))
        for p in o.get('name') or []:
            v = (p.get('value') or '').strip()
            if v:
                rows['name'].append((i, v, fold(v), p.get('lang') or '', *span(p)))
        for p in o.get('type') or []:
            if str(p.get('value', '')).isdigit():
                rows['typ'].append((i, int(p['value']), *span(p)))
        for p in o.get('partOf') or []:
            if p.get('ref') in ids:
                rows['rel'].append((i, ids[p['ref']], *span(p)))
        for p in o.get('postalCode') or []:
            if p.get('value'):
                rows['postal'].append((i, str(p['value'])[:20], *span(p)))
        for p in o.get('externalReference') or []:
            v = str(p.get('value') or '')
            if re.match(r'^(wikidata|geonames|SIMC|TERYT|NIMA|LAU|opengeodb):', v, re.I):
                rows['extref'].append((i, v[:60]))
    db.executemany('INSERT INTO obj VALUES(?,?,?,?)', rows['obj'])
    db.executemany('INSERT INTO name VALUES(?,?,?,?,?,?,?)', rows['name'])
    db.executemany('INSERT INTO typ VALUES(?,?,?,?,?)', rows['typ'])
    db.executemany('INSERT INTO rel VALUES(?,?,?,?,?)', rows['rel'])
    db.executemany('INSERT INTO postal VALUES(?,?,?,?,?)', rows['postal'])
    db.executemany('INSERT INTO extref VALUES(?,?)', rows['extref'])
    db.executescript(INDEXES)
    meta = dict(meta)
    meta.update({'kind': 'gov', 'format': str(FORMAT), 'built': datetime.date.today().isoformat(), 'objects': str(len(rows['obj'])),
                 'names': str(len(rows['name'])), 'with_coords': str(sum(1 for r in rows['obj'] if r[2] is not None)),
                 'fold_map': json.dumps({k: v for k, v in sorted(fold_map.items()) if k != v}, ensure_ascii=False)})
    db.executemany('INSERT INTO meta VALUES(?,?)', [(k, str(v)) for k, v in meta.items()])
    db.commit()
    db.execute('VACUUM')
    db.close()
    return meta


def wrap_pack(db_path, out_path, meta):
    h = hashlib.sha256()
    with open(db_path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    info = {'kind': 'gov', 'format': FORMAT, 'objects': int(meta['objects']), 'zone': meta.get('zone', ''), 'built': meta['built'],
            'size': os.path.getsize(db_path), 'sha256': h.hexdigest()}
    head = HEADER_MAGIC + json.dumps(info, ensure_ascii=False).encode('utf-8') + b'\n'
    head += b' ' * (HEADER_SIZE - len(head))
    with open(out_path, 'wb') as out, open(db_path, 'rb') as f:
        out.write(head)
        for chunk in iter(lambda: f.read(1 << 20), b''):
            out.write(chunk)
    return info


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--zone', default='centre', help='centre, europe, ou « lat0,lat1,lon0,lon1 »')
    ap.add_argument('--dossier', default='gov-sortie')
    ap.add_argument('--paralleles', type=int, default=3, help='requêtes à la fois (3 au plus conseillé : le serveur est celui d’une association)')
    ap.add_argument('--pause', type=float, default=0.2, help='pause après chaque requête (secondes)')
    ap.add_argument('--depuis-json', help='fabriquer seulement, depuis un dossier (types.owl + objets.json) : pour les essais')
    ap.add_argument('--sans-verif-licence', action='store_true', help='essais seulement : ne pas lire la page de licence')
    a = ap.parse_args()
    work = a.dossier
    os.makedirs(os.path.join(work, 'tuiles'), exist_ok=True)
    if a.depuis_json:
        types = parse_types(os.path.join(a.depuis_json, 'types.owl'))
        with open(os.path.join(a.depuis_json, 'objets.json'), encoding='utf-8') as f:
            objs = {o['id']: o for o in json.load(f)}
        zone = 'essai'
        lic = licence_check(work, a.sans_verif_licence)
    else:
        zone_box = ZONES.get(a.zone) or tuple(float(x) for x in a.zone.split(','))
        zone = a.zone
        lic = licence_check(work, a.sans_verif_licence)
        types = fetch_types(work)
        all_tiles = list(tiles(zone_box))
        log(f'Types : {len(types)} · carrés à lire : {len(all_tiles)}')
        tdir = os.path.join(work, 'tuiles')
        with cf.ThreadPoolExecutor(max(1, a.paralleles)) as ex:
            for n, _ in enumerate(ex.map(lambda b: fetch_box(b, tdir, a.pause), all_tiles), 1):
                if n % 50 == 0:
                    log(f'  carrés : {n} / {len(all_tiles)}')
        objs = load_objects(work)
        log(f'Lieux avec coordonnées : {len(objs)}')
        fetch_parents(work, objs, max(1, a.paralleles), a.pause)
    meta = {'zone': zone, 'title': 'GOV — Geschichtliches Orts-Verzeichnis', 'source': 'GOV — Geschichtliches Orts-Verzeichnis, Verein für Computergenealogie e. V.',
            'source_url': 'https://gov.genealogy.net', 'licence_url': LICENCE_PAGE,
            'mention': 'Daten: GOV – Geschichtliches Orts-Verzeichnis (gov.genealogy.net), Verein für Computergenealogie e. V.', **lic}
    if a.depuis_json:
        meta['fixture'] = '1'
    db_path = os.path.join(work, 'gov.sqlite')
    meta = build_db(objs, types, db_path, meta)
    info = wrap_pack(db_path, os.path.join(work, 'gov-pack.lcgov'), meta)
    log(f"Fini : {info['objects']} objets · {os.path.getsize(db_path) / 1e6:.1f} Mo → {os.path.join(work, 'gov-pack.lcgov')}")


if __name__ == '__main__':
    main()
