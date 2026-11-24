#!/usr/bin/env python3
"""LCNDA — 🦴 « Les ancêtres très anciens de ta lignée » : le FABRICANT de assets/data/adn-ancien.json.gz.

Source : Allen Ancient DNA Resource (AADR), Swapan Mallick et David Reich (Harvard), Harvard Dataverse,
doi:10.7910/DVN/FFIDCW — licence CC0 1.0 (domaine public). On ne lit que le fichier d'annotation (.anno, ≈ 13 Mo),
jamais les génotypes : pour chaque individu ancien, son haplogroupe Y et mitochondrial, sa date, son groupe
(culture), son lieu (avec coordonnées) et la publication.

    python3 -I scripts/adn-livres/build-adn-ancien.py                       # télécharge la version 66.p1 et fabrique le fichier
    python3 -I scripts/adn-livres/build-adn-ancien.py --anno chemin.anno    # à partir d'un fichier déjà téléchargé

Ce qui est gardé (le moins possible, voir FIELDS) : les individus d'avant 1850 (date moyenne ≥ 100 ans BP), évalués
« Pass » (ou PROVISIONAL_PASS / MERGE_PASS), avec des coordonnées et au moins un haplogroupe. Un individu présent
plusieurs fois (plusieurs jeux de données) n'est gardé qu'une fois. Aussi : la table « mutation → nom ISOGG » tirée des
mêmes lignes (un échantillon porte les deux écritures, R-L754 et R1b), qui permet de rapprocher « R1b-U152 » des branches
qui en descendent.
"""
import argparse
import collections
import csv
import datetime
import gzip
import hashlib
import json
import os
import sys
import urllib.request

DATASET = 'doi:10.7910/DVN/FFIDCW'
VERSION = '66.p1'
FILE_ID = 13994515            # v66.p1_1240K.aadr.PUB.anno
FILE_MD5 = 'a2db1ac16f0f3558ed66fb251e1d5c7d'
URL = f'https://dataverse.harvard.edu/api/access/datafile/{FILE_ID}'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'assets', 'data', 'adn-ancien.json.gz')
FIELDS = ['id', 'y', 'yi', 'mt', 'bp', 'sd', 'date', 'grp', 'loc', 'cty', 'lat', 'lon', 'pub', 'sex']
EMPTY = {'', '..', 'n/a'}


def clean(v):
    v = (v or '').strip().strip('"').strip()
    return '' if v in EMPTY or v.lower().startswith('n/a') else v


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def isogg(v):
    """« R1b1a1b~ » → « R1b1a1b » (le ~ dit « appel incertain ») ; garde la forme lettres-chiffres seulement."""
    v = clean(v).replace('~', '').split(' ')[0]
    out = ''
    for ch in v:
        if ch.isalnum():
            out += ch
        else:
            break
    return out


def load(path):
    with open(path, encoding='utf-8', newline='') as f:
        r = csv.reader(f, delimiter='\t', quoting=csv.QUOTE_NONE)
        head = next(r)
        if len(head) < 49 or not head[34].startswith('Y haplogroup') or not head[38].startswith('mtDNA haplogroup'):
            sys.exit('Colonnes inattendues : le format du fichier .anno a changé, vérifie les numéros de colonnes.')
        for row in r:
            if len(row) >= 49:
                yield row


def build(path):
    rank = {'Pass': 0, 'MERGE_PASS': 1, 'PROVISIONAL_PASS': 2}
    best = {}
    for row in load(path):
        assess = clean(row[47])
        if assess not in rank:
            continue
        bp, lat, lon = num(row[10]), num(row[17]), num(row[18])
        if bp is None or bp < 100 or lat is None or lon is None or (lat == 0 and lon == 0):
            continue
        y_term = clean(row[34])
        y_man = clean(row[36])
        y_iso = isogg(y_man) if y_man else isogg(row[35])
        mt = clean(row[38]).split(' ')[0]
        if not (y_term or y_iso or mt):
            continue
        ind = clean(row[2]) or clean(row[0])
        score = (rank[assess], 0 if (y_term or y_iso) else 1, 0 if mt else 1)
        if ind in best and best[ind][0] <= score:
            continue
        date = clean(row[12]).split(' (')[0].split(' [')[0]
        best[ind] = (score, {
            'id': ind, 'y': y_term if '-' in y_term else '', 'yi': y_iso, 'mt': mt, 'bp': int(round(bp)), 'sd': int(round(num(row[11]) or 0)),
            'date': date[:60], 'grp': clean(row[14])[:80], 'loc': clean(row[15])[:120], 'cty': clean(row[16])[:40],
            'lat': round(lat, 4), 'lon': round(lon, 4), 'pub': (clean(row[6]) or clean(row[5]), clean(row[7])), 'sex': clean(row[30])[:1]})
    rows = [v for _, v in best.values()]
    rows.sort(key=lambda x: (x['cty'], -x['bp']))
    pubs, pub_ix = [], {}
    snp = collections.defaultdict(collections.Counter)
    out = []
    for x in rows:
        key = x['pub']
        if key not in pub_ix:
            pub_ix[key] = len(pubs)
            pubs.append([key[0], key[1] if key[1].startswith('http') else ''])
        if x['y'] and x['yi']:
            snp[x['y'].split('-', 1)[1]][x['yi']] += 1
        out.append([x['id'], x['y'], x['yi'], x['mt'], x['bp'], x['sd'], x['date'], x['grp'], x['loc'], x['cty'], x['lat'], x['lon'], pub_ix[key], x['sex']])
    ymap = {k: c.most_common(1)[0][0] for k, c in snp.items()}
    return out, pubs, ymap


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--anno', help='fichier .anno déjà téléchargé')
    ap.add_argument('--out', default=OUT)
    a = ap.parse_args()
    path = a.anno
    if not path:
        path = os.path.join(os.getcwd(), f'v{VERSION}_1240K.aadr.PUB.anno')
        if not os.path.exists(path):
            print(f'Téléchargement de {URL} …')
            with urllib.request.urlopen(URL, timeout=600) as r, open(path, 'wb') as f:
                f.write(r.read())
    md5 = hashlib.md5(open(path, 'rb').read()).hexdigest()
    if md5 != FILE_MD5:
        print(f'⚠ md5 {md5} ≠ {FILE_MD5} (autre version ?) : on continue, vérifie VERSION et FILE_ID.')
    rows, pubs, ymap = build(path)
    data = {
        'v': 1, 'built': datetime.date.today().isoformat(), 'fields': FIELDS, 'rows': rows, 'pubs': pubs, 'ymap': ymap,
        'source': {
            'name': 'Allen Ancient DNA Resource (AADR)', 'version': VERSION, 'file': f'v{VERSION}_1240K.aadr.PUB.anno', 'md5': md5,
            'doi': DATASET, 'url': 'https://doi.org/10.7910/DVN/FFIDCW',
            'credit': 'Mallick S, Reich D. The Allen Ancient DNA Resource (AADR): A curated compendium of ancient human genomes. Harvard Dataverse, version ' + VERSION,
            'paper': 'Mallick S, Micco A, Mah M, Ringbauer H, Lazaridis I, Olalde I, Patterson N, Reich D (2024). Sci Data 11, 182. https://doi.org/10.1038/s41597-024-03031-7',
            'licence': 'CC0 1.0', 'licence_url': 'https://creativecommons.org/publicdomain/zero/1.0/',
            'kept': 'individus d’avant 1850 (≥ 100 ans BP), évalués Pass, avec coordonnées et au moins un haplogroupe ; un seul enregistrement par individu',
        },
    }
    raw = json.dumps(data, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    with gzip.GzipFile(a.out, 'wb', compresslevel=9, mtime=0) as g:
        g.write(raw)
    print(f'{len(rows)} individus, {len(pubs)} publications, {len(ymap)} mutations Y ; {len(raw) / 1e6:.1f} Mo → {os.path.getsize(a.out) / 1e6:.2f} Mo compressé : {a.out}')


if __name__ == '__main__':
    main()
