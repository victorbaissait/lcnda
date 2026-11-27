#!/usr/bin/env python3
"""🐴 Lot O3 — les relais et les routes de la poste aux chevaux, 1632-1833 (7 dates), pour « 🐴 Paris à combien d'heures ? ».

Source : N. Verdier, T. Giraud, C. Mimeur, A. Bretagnolle, « Postal horse relays and roads in France, from the 17th to the
19th centuries », Zenodo, 2024, https://zenodo.org/records/11196161 (DOI 10.5281/zenodo.11196161).
Licence : ODbL 1.0 — relue à chaque fabrication (API du dépôt : license.id = « odc-odbl » ; page du dépôt : « odbl-1.0 ») ;
la fabrication s'arrête si elle a changé. Les données dérivées (ce pack) restent sous ODbL, avec l'attribution.

    python3 scripts/lot-o/build-poste.py            → assets/data/lo-poste.json.gz
    python3 scripts/lot-o/build-poste.py DOSSIER    (CSV déjà téléchargés dans DOSSIER ; la licence est relue quand même)

Noms : le nom de la commune du relais reprend ses accents d'après la liste officielle des communes livrée
(assets/data/cc-communes.json.gz : code INSEE + nom, Licence Ouverte), seulement quand les deux noms sont les mêmes une fois
les accents et la casse ôtés (« CHATILLON-EN-MICHAILLE » → « Châtillon-en-Michaille ») ; sinon le nom du jeu reste.
Le pack : {relays: {IDREL: [lat, lon, commune, insee]}, roads: {année: [a, b, minutes, a, b, minutes, …]}, licence…}.
Les minutes (colonne TIME) sont celles du jeu : longueur ÷ vitesse d'un cheval de poste selon la pente, sans les arrêts.
"""
import csv, datetime, gzip, io, json, os, sys, unicodedata, urllib.request

REC = '11196161'
API = f'https://zenodo.org/api/records/{REC}'
PAGE = f'https://zenodo.org/records/{REC}'
YEARS = [1632, 1708, 1733, 1758, 1783, 1810, 1833]
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'assets', 'data', 'lo-poste.json.gz')


def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'LCNDA-build (genealogy app)'})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def fold(s):
    s = unicodedata.normalize('NFD', str(s or '')).encode('ascii', 'ignore').decode().lower()
    return ''.join(c if c.isalnum() else ' ' for c in s).replace(' st ', ' saint ').split()


def official_names():
    f = os.path.join(ROOT, 'assets', 'data', 'cc-communes.json.gz')
    try:
        with gzip.open(f, 'rt', encoding='utf-8') as fh:
            return {k: v[0] for k, v in json.load(fh).get('c', {}).items() if v and v[0]}
    except OSError:
        return {}


def main():
    meta = json.loads(get(API))
    lic = (meta.get('metadata', {}).get('license') or {}).get('id', '')
    page = get(PAGE).decode('utf-8', 'replace').lower()
    if lic != 'odc-odbl' or 'odbl-1.0' not in page:
        sys.exit(f'Licence changée ou illisible ({lic!r}) : rien fabriqué.')
    src = sys.argv[1] if len(sys.argv) > 1 else None
    files = {e['key']: e['links']['content'] for e in json.loads(get(API + '/files'))['entries']}
    read = lambda name: (open(os.path.join(src, name), encoding='utf-8').read() if src else get(files[name]).decode('utf-8'))
    relays, roads, official, fixed = {}, {}, official_names(), 0
    for y in YEARS:
        for r in csv.DictReader(io.StringIO(read(f'relays_{y}.csv'))):
            if r['COORDINATES_4326_Y'] in ('', 'NA'):
                continue
            rid = int(r['IDREL'])
            name = r['CURRENT_NAME'] if r['CURRENT_NAME'] not in ('', 'NA') else (r['COMMUNE_NAME'] or '').title()
            off = official.get((r['COMMUNE_ID'] or '')[:5], '')
            if off and fold(off) == fold(name) and off != name:
                name = off; fixed += 1
            relays[rid] = [round(float(r['COORDINATES_4326_Y']), 5), round(float(r['COORDINATES_4326_X']), 5), name[:60], (r['COMMUNE_ID'] or '')[:5]]
        flat = []
        for r in csv.DictReader(io.StringIO(read(f'roads_{y}.csv'))):
            try:
                flat += [int(r['IDREL_A']), int(r['IDREL_B']), int(round(float(r['TIME'])))]
            except ValueError:
                continue
        roads[str(y)] = flat
    out = {'v': 1, 'built': datetime.date.today().isoformat(), 'title': 'Postal horse relays and roads in France, from the 17th to the 19th centuries',
           'credit': 'N. Verdier, T. Giraud, C. Mimeur, A. Bretagnolle (2024), Zenodo', 'doi': meta.get('doi', ''), 'url': PAGE,
           'licence': 'ODbL 1.0', 'licence_url': 'https://opendatacommons.org/licenses/odbl/1-0/', 'licence_read': datetime.date.today().isoformat(),
           'note': 'TIME = minutes à cheval de poste entre deux relais (longueur et pente), sans les arrêts ni les nuits.',
           'years': YEARS, 'relays': {str(k): v for k, v in sorted(relays.items())}, 'roads': roads}
    with gzip.open(OUT, 'wb', compresslevel=9) as f:
        f.write(json.dumps(out, ensure_ascii=False, separators=(',', ':')).encode('utf-8'))
    print(f'{fixed} noms remis avec leurs accents (liste officielle des communes)')
    print(f'{len(relays)} relais, {sum(len(v) // 3 for v in roads.values())} tronçons → {OUT} ({os.path.getsize(OUT)} octets)')


if __name__ == '__main__':
    main()
