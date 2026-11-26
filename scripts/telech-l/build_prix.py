#!/usr/bin/env python3
"""💵 Lot L — l'indice des prix des États-Unis depuis 1913 (assets/data/tl-prix.json.gz), pour le convertisseur des prix.

Source : Bureau of Labor Statistics, CPI-U (série CUUR0000SA0, moyenne des villes, 1982-84 = 100 ; œuvre du gouvernement fédéral),
mis en paquet par datasets/cpi-us (GitHub). Licence lue dans datapackage.json (relue à chaque fabrication) : « ODC-PDDL-1.0 ».
Gardé : la moyenne de chaque année complète (12 mois), arrondie à 3 décimales.
Avant 1913 : pas de série officielle ouverte (les estimations de la Federal Reserve Bank of Minneapolis et de MeasuringWorth ne
sont pas sous une licence ouverte) : lien seulement.

Lancer : python3 -I scripts/telech-l/build_prix.py [dossier de sortie]   (TL_RAW = cache)
"""
import csv, io, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'assets', 'data')
BASE = 'https://raw.githubusercontent.com/datasets/cpi-us/main'


def main():
    dp = json.loads(wm.get(f'{BASE}/datapackage.json'))
    if not any(l.get('name') == 'ODC-PDDL-1.0' for l in dp.get('licenses') or []):
        sys.exit('cpi-us : la licence de datapackage.json n’est plus ODC-PDDL-1.0 : relire https://github.com/datasets/cpi-us')
    by = {}
    for r in csv.DictReader(io.StringIO(wm.get(f'{BASE}/data/cpiai.csv', '*/*').decode('utf-8-sig'))):
        try:
            by.setdefault(int(r['Date'][:4]), []).append(float(r['Index']))
        except (KeyError, ValueError):
            continue
    rows = [[y, round(sum(v) / len(v), 3)] for y, v in sorted(by.items()) if len(v) == 12]
    assert rows[0][0] == 1913 and len(rows) > 100, rows[:2]
    meta = {'source': 'U.S. Bureau of Labor Statistics, CPI-U (via datasets/cpi-us)', 'licence': 'ODC-PDDL 1.0 (domaine public)', 'licence_url': 'https://opendatacommons.org/licenses/pddl/1-0/',
            'url': 'https://www.bls.gov/cpi/', 'pack_url': 'https://github.com/datasets/cpi-us', 'built': wm.today(), 'country': ['US'],
            'what': 'Indice des prix à la consommation des États-Unis (CPI-U, 1982-84 = 100), moyenne de chaque année', 'fields': ['y', 'cpi'], 'rows': rows}
    size = wm.write_gz(OUT, 'tl-prix.json.gz', meta)
    print(f'tl-prix : {len(rows)} années ({rows[0][0]}–{rows[-1][0]}), {size} octets')


if __name__ == '__main__':
    main()
