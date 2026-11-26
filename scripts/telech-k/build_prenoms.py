#!/usr/bin/env python3
"""👶 Lot K — les prénoms garçon ici, fille ailleurs (assets/data/tk-prenoms.json.gz).

Source : World Gender Name Dictionary 2.0 (WGND 2.0 : Raffo, J. 2021, Harvard Dataverse, doi:10.7910/DVN/MSEGSJ) — licence lue dans
la notice du jeu de données (API de Dataverse, relue à chaque fabrication) : « CC0 1.0 ». Fichier : wgnd_2_0_name-gender-code
(prénom, pays, genre, part).
Gardé : les prénoms qui sont des prénoms d'homme dans un pays d'Europe ou d'Amérique du Nord et de femme dans un autre (au moins
90 % d'un côté, au moins 90 % de l'autre) : Andrea (homme en Italie, femme en France et en Allemagne), Simone, Nicola, Joan, Kim…
De quoi dire, sur la fiche d'une personne née dans un de ces pays, que son prénom n'a pas le même genre partout (piège des
relevés et des imports). Ce n'est pas un comptage de naissances : WGND dit seulement quel genre porte le prénom, pays par pays.

Lancer : python3 -I scripts/telech-k/build_prenoms.py [dossier de sortie]   (TK_RAW = cache ; le fichier fait ≈ 90 Mo)
"""
import csv, io, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'assets', 'data')
DS = 'https://dataverse.harvard.edu/api/datasets/:persistentId/?persistentId=doi:10.7910/DVN/MSEGSJ'
FILE = 'wgnd_2_0_name-gender-code.tab'
PAYS = 'AT BE BG CA CH CZ DE DK EE ES FI FR GB GR HR HU IE IS IT LT LU LV MT NL NO PL PT RO SE SI SK US'.split()


def main():
    d = json.loads(wm.get(DS))['data']['latestVersion']
    lic = (d.get('license') or {}).get('name', '')
    if lic != 'CC0 1.0':
        sys.exit(f'WGND 2.0 : la licence de la notice n’est plus CC0 1.0 ({lic}) : relire {DS}')
    fid = next(f['dataFile']['id'] for f in d['files'] if f['dataFile']['filename'] == FILE)
    raw = wm.get(f'https://dataverse.harvard.edu/api/access/datafile/{fid}?format=original', '*/*').decode('utf-8')
    pm = {}
    for r in csv.DictReader(io.StringIO(raw)):
        if r['code'] in PAYS and r['gender'] in ('M', 'F'):
            w = float(r['wgt'])
            pm.setdefault(r['name'], {})[r['code']] = w if r['gender'] == 'M' else 1 - w
    rows = []
    for n, v in sorted(pm.items()):
        m = sorted(c for c, p in v.items() if p >= 0.9)
        f = sorted(c for c, p in v.items() if p <= 0.1)
        if m and f and n.isalpha() and len(n) >= 2:
            rows.append([n, ' '.join(m), ' '.join(f)])
    assert len(rows) > 2000 and any(r[0] == 'andrea' for r in rows), len(rows)
    meta = {'source': 'World Gender Name Dictionary 2.0 (Raffo 2021, Harvard Dataverse)', 'licence': 'CC0 1.0', 'licence_url': 'https://creativecommons.org/publicdomain/zero/1.0/deed.fr',
            'url': 'https://doi.org/10.7910/DVN/MSEGSJ', 'built': wm.today(),
            'cite': 'Raffo, Julio (2021), WGND 2.0, Harvard Dataverse, https://doi.org/10.7910/DVN/MSEGSJ',
            'what': 'Prénoms portés par des hommes dans un pays et par des femmes dans un autre (≥ 90 % de chaque côté), Europe et Amérique du Nord',
            'fields': ['n', 'm', 'f'], 'rows': rows}
    size = wm.write_gz(OUT, 'tk-prenoms.json.gz', meta)
    print(f'tk-prenoms : {len(rows)} prénoms, {size} octets')


if __name__ == '__main__':
    main()
