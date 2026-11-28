#!/usr/bin/env python3
"""🌌 Le ciel de naissance — les étoiles visibles à l'œil nu (magnitude ≤ 5,5) tirées du catalogue HYG.

Source : HYG Database v4.0 (David Nash, astronexus), fichier hyg/CURRENT/hygdata_v40.csv.gz du dépôt
github.com/astronexus/HYG-Database — licence Creative Commons BY-SA 4.0 (fichier LICENSE du dépôt).
Le fichier produit (assets/data/stars-hyg.json) est donc aussi sous CC BY-SA 4.0, avec cette attribution.

Format compact : listes parallèles ra (heures × 1000), de (degrés × 100), m (magnitude × 100), bv (indice B−V × 100,
null si inconnu). Positions J2000 (époque 2000), sans le Soleil.

Usage : python3 -I scripts/ciel-heure/build-stars.py [dossier-de-travail]
"""
import csv, gzip, hashlib, io, json, os, sys, tempfile, urllib.request

COMMIT = 'c7f7f883fe678cc7680169a50ccd7dcc49b060ce'
URL = f'https://raw.githubusercontent.com/astronexus/HYG-Database/{COMMIT}/hyg/CURRENT/hygdata_v40.csv.gz'
LIMIT = 5.5
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'assets', 'data', 'stars-hyg.json')


def main():
    work = sys.argv[1] if len(sys.argv) > 1 else tempfile.mkdtemp(prefix='hyg-')
    p = os.path.join(work, 'hygdata_v40.csv.gz')
    if not os.path.exists(p):
        with urllib.request.urlopen(URL) as r, open(p, 'wb') as f:
            f.write(r.read())
    raw = open(p, 'rb').read()
    rows = []
    for r in csv.DictReader(io.TextIOWrapper(gzip.GzipFile(fileobj=io.BytesIO(raw)), encoding='utf-8')):
        if r['proper'] == 'Sol' or not r['mag']:
            continue
        m = float(r['mag'])
        if m > LIMIT:
            continue
        rows.append((m, float(r['ra']), float(r['dec']), float(r['ci']) if r['ci'] else None))
    rows.sort()
    doc = {'title': 'Étoiles visibles à l’œil nu (magnitude ≤ 5,5)', 'count': len(rows),
           'source': 'HYG Database v4.0 — David Nash (astronexus), d’après Hipparcos, Yale Bright Star Catalog et Gliese',
           'url': 'https://github.com/astronexus/HYG-Database', 'licence': 'CC BY-SA 4.0', 'licence_url': 'https://creativecommons.org/licenses/by-sa/4.0/deed.fr',
           'sha256_16': hashlib.sha256(raw).hexdigest()[:16], 'commit': COMMIT,
           'note': 'ra : ascension droite en heures × 1000 ; de : déclinaison en degrés × 100 ; m : magnitude × 100 ; bv : indice de couleur B−V × 100. J2000. Extrait fait pour LCNDA (même licence).',
           'ra': [round(r[1] * 1000) for r in rows], 'de': [round(r[2] * 100) for r in rows], 'm': [round(r[0] * 100) for r in rows],
           'bv': [None if r[3] is None else round(r[3] * 100) for r in rows]}
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, separators=(',', ':'))
    print(OUT, len(rows), 'étoiles', os.path.getsize(OUT), 'octets')


if __name__ == '__main__':
    main()
