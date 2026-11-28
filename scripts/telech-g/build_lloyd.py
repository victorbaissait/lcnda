#!/usr/bin/env python3
"""⚓ Lot G — Le Lloyd's Register (1764-1900) : l'index des volumes numérisés : assets/data/tg-lloyd.json.gz.

Source : Internet Archive, collection « Lloyd's Registers Collections » (lloydsregisters), versée par Lloyd's Register Foundation,
Heritage & Education Centre. Lu avec l'API de recherche publique (archive.org/advancedsearch.php) : pour chaque volume « Lloyd's
Register of Shipping » jusqu'à 1900, l'identifiant, l'année, le titre et la licence que la Fondation a mise sur le volume
(licenseurl : CC BY-SA 4.0 le plus souvent, CC BY-NC-SA 4.0 pour quelques-uns, parfois rien d'écrit).
L'app ne copie AUCUNE page : elle garde seulement l'index (année → volume) et ouvre le volume sur Internet Archive, sur un clic ;
la recherche d'un nom de navire se fait là-bas (le nom tapé par l'utilisateur, jamais un nom de l'arbre).
Lancer : python3 -I scripts/telech-g/build_lloyd.py [dossier de sortie]
"""
import json, os, re, sys, urllib.parse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'assets', 'data')
FIELDS = ['id', 'y', 'part', 'lic']
LIC = {'https://creativecommons.org/licenses/by-sa/4.0/': 'CC BY-SA 4.0', 'https://creativecommons.org/licenses/by-nc-sa/4.0/': 'CC BY-NC-SA 4.0',
       'https://creativecommons.org/licenses/by-nc-nd/4.0/': 'CC BY-NC-ND 4.0'}


def main():
    q = {'q': 'collection:lloydsregisters AND title:("register of shipping")', 'fl[]': ['identifier', 'title', 'year', 'licenseurl'], 'rows': 1000, 'output': 'json'}
    body = wm.get('https://archive.org/advancedsearch.php?' + urllib.parse.urlencode(q, doseq=True))
    docs = json.loads(body)['response']['docs']
    rows = []
    for d in docs:
        y = int(str(d.get('year') or '0')[:4] or 0)
        ident = d.get('identifier', '')
        if not (1764 <= y <= 1900) or not re.match(r'^[A-Za-z0-9_.-]+$', ident):
            continue
        t = d.get('title', '')
        part = 'Shipowners' if 'Shipowners' in t else 'Underwriters' if 'Underwriters' in t else 'Steamers' if 'Steamers' in t else 'Sailing Vessels' if 'Sailing' in t else 'Universal' if 'Universal' in t else ''
        rows.append({'id': ident, 'y': y, 'part': part, 'lic': LIC.get(d.get('licenseurl') or '', '')})
    rows.sort(key=lambda r: (r['y'], r['part'], r['id']))
    if len(rows) < 100:
        raise SystemExit(f'seulement {len(rows)} volumes — rien n’est écrit')
    meta = {'source': 'Internet Archive, « Lloyd’s Registers Collections » (Lloyd’s Register Foundation, Heritage & Education Centre)',
            'licence': 'Index seulement (identifiants, années) ; les volumes : licence de chaque volume (CC BY-SA 4.0 le plus souvent)',
            'licence_url': 'https://archive.org/details/lloydsregisters', 'url': 'https://archive.org/details/lloydsregisters', 'built': wm.today(),
            'what': 'Les volumes numérisés du Lloyd’s Register of Shipping de 1764 à 1900 (un ou deux par an) : l’app ouvre le bon volume, rien n’est copié',
            'fields': FIELDS, 'rows': [[r[k] for k in FIELDS] for r in rows]}
    size = wm.write_gz(OUT, 'tg-lloyd.json.gz', meta)
    print(f'tg-lloyd : {len(rows)} volumes ({len({r["y"] for r in rows})} années), {size} octets')


if __name__ == '__main__':
    main()
