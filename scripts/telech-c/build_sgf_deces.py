#!/usr/bin/env python3
"""LCNDA — lot C des téléchargements : les décès de chaque département, année par année (an IX-1855),
d'après la Statistique générale de la France (SGF), tableaux reconstitués et publiés par l'Insee.

    python3 -I scripts/telech-c/build_sgf_deces.py CACHE_DIR [--out assets/data/tc-sgf-deces.json.gz]

Source : Insee, « Données historiques de la Statistique générale de France (SGF) 1800-1925 »,
thème « Mouvement de la population, 1800-1925 » : https://www.insee.fr/fr/statistiques/2659665?sommaire=2591397
Licence : « Sauf mention contraire, les informations publiques diffusées sur ce site sont mises à disposition sous la
Licence Ouverte / Open Licence version 2.0 (Etalab) » (https://www.insee.fr/fr/information/2008466), mention « Source : Insee ».

Tableaux lus (une colonne « nombre total de décès » par année, rien d'autre, sans calcul) :
  T90  an IX (1800-1801) → 1835          « Nombre total de décès, <année> »
  T170 1836 → 1850 (trois fichiers)      « Décès : total général, <année> »
  T74  1853                              « Décès total population totale, 1853 »
  T100 1854                              « Populations urbaine et rurale : nombre total de décès. 1854 »
  T92  1855                              « Populations urbaine et rurale : nombre total de décès. 1855. »
Les fichiers Excel sont téléchargés une fois dans CACHE_DIR (il faut `pip install xlrd`).
"""
import gzip
import json
import os
import re
import sys
import unicodedata
import urllib.request
from datetime import date

import xlrd

BASE = 'https://www.insee.fr/fr/statistiques/fichier/2659665/'
PAGE = 'https://www.insee.fr/fr/statistiques/2659665?sommaire=2591397'
FILES = {
    'mvtpop_T90.xls': r'^Nombre total de décès, (?P<y>1[89]\d\d(?:-1[89]\d\d)?|100 jours de 1805)\.?',
    'mvtpop_T170_I.xls': r'^Décès : total général, (?P<y>1[89]\d\d)$',
    'mvtpop_T170_II.xls': r'^Décès : total général, (?P<y>1[89]\d\d)$',
    'mvtpop_T170_III.xls': r'^Décès : total général, (?P<y>1[89]\d\d)$',
    'MVTPOP_T74.xls': r'^Décès total population totale, (?P<y>1[89]\d\d)$',
    'mvtpop_T100_I.xls': r'^Populations urbaine et rurale : nombre total de décès\. (?P<y>1[89]\d\d)$',
    'mvtpop_T92.xls': r'^Populations urbaine et rurale : nombre total de décès\.? (?P<y>1[89]\d\d)\.?$',
}
REP = {'1800-1801': 'an IX', '1801-1802': 'an X', '1802-1803': 'an XI', '1803-1804': 'an XII', '1804-1805': 'an XIII', '100 jours de 1805': 'an XIV'}

# départements d'alors → départements d'aujourd'hui (codes) ; les autres : même nom qu'aujourd'hui
OLD = {'basses alpes': ['04'], 'charente inferieure': ['17'], 'cotes du nord': ['22'], 'loire inferieure': ['44'], 'meurthe': ['54'],
       'basses pyrenees': ['64'], 'seine inferieure': ['76'], 'seine': ['75', '92', '93', '94'], 'seine et oise': ['78', '91', '95'],
       'corse': ['2A', '2B'], 'moselle': ['57'], 'bas rhin': ['67'], 'haut rhin': ['68', '90']}
MODERN = {'ain': '01', 'aisne': '02', 'allier': '03', 'hautes alpes': '05', 'alpes maritimes': '06', 'ardeche': '07', 'ardennes': '08', 'ariege': '09',
          'aube': '10', 'aude': '11', 'aveyron': '12', 'bouches du rhone': '13', 'calvados': '14', 'cantal': '15', 'charente': '16', 'cher': '18',
          'correze': '19', 'cote d or': '21', 'creuse': '23', 'dordogne': '24', 'doubs': '25', 'drome': '26', 'eure': '27', 'eure et loir': '28',
          'finistere': '29', 'gard': '30', 'haute garonne': '31', 'gers': '32', 'gironde': '33', 'herault': '34', 'ille et vilaine': '35', 'indre': '36',
          'indre et loire': '37', 'isere': '38', 'jura': '39', 'landes': '40', 'loir et cher': '41', 'loire': '42', 'haute loire': '43', 'loiret': '45',
          'lot': '46', 'lot et garonne': '47', 'lozere': '48', 'maine et loire': '49', 'manche': '50', 'marne': '51', 'haute marne': '52', 'mayenne': '53',
          'meuse': '55', 'morbihan': '56', 'nievre': '58', 'nord': '59', 'oise': '60', 'orne': '61', 'pas de calais': '62', 'puy de dome': '63',
          'hautes pyrenees': '65', 'pyrenees orientales': '66', 'rhone': '69', 'haute saone': '70', 'saone et loire': '71', 'sarthe': '72',
          'savoie': '73', 'haute savoie': '74', 'seine et marne': '77', 'deux sevres': '79', 'somme': '80', 'tarn': '81', 'tarn et garonne': '82',
          'var': '83', 'vaucluse': '84', 'vendee': '85', 'vienne': '86', 'haute vienne': '87', 'vosges': '88', 'yonne': '89'}


ACCENTS = {'Ardeche': 'Ardèche', 'Ariege': 'Ariège', 'Bouches-du-Rhone': 'Bouches-du-Rhône', 'Charente-Inferieure': 'Charente-Inférieure', 'Correze': 'Corrèze',
           "Cote-d'Or": "Côte-d'Or", 'Cotes-du-Nord': 'Côtes-du-Nord', 'Drome': 'Drôme', 'Finistere': 'Finistère', 'Herault': 'Hérault', 'Isere': 'Isère',
           'Loire-Inferieure': 'Loire-Inférieure', 'Lozere': 'Lozère', 'Nievre': 'Nièvre', 'Puy-de-Dome': 'Puy-de-Dôme', 'Basses-Pyrenees': 'Basses-Pyrénées',
           'Hautes-Pyrenees': 'Hautes-Pyrénées', 'Pyrenees-Orientales': 'Pyrénées-Orientales', 'Rhone': 'Rhône', 'Haute-Saone': 'Haute-Saône',
           'Saone-et-Loire': 'Saône-et-Loire', 'Seine-Inferieure': 'Seine-Inférieure', 'Deux-Sevres': 'Deux-Sèvres', 'Vendee': 'Vendée'}


def fold(s):
    s = unicodedata.normalize('NFD', str(s)).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z]+', ' ', s).strip()


def nice(name):
    return '-'.join(w.capitalize() if w.lower() not in ('et', 'du', 'de', 'des', 'sur') else w.lower() for w in str(name).strip().lower().split('-')).replace("D'or", "d'Or").replace("Côte-d'or", "Côte-d'Or")


def get(cache, f):
    p = os.path.join(cache, f)
    if not os.path.exists(p) or os.path.getsize(p) < 1000:
        req = urllib.request.Request(BASE + f, headers={'User-Agent': 'LCNDA data build (genealogy app)'})
        with urllib.request.urlopen(req, timeout=120) as r, open(p, 'wb') as o:
            o.write(r.read())
    return p


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    cache = sys.argv[1]
    out = sys.argv[sys.argv.index('--out') + 1] if '--out' in sys.argv else os.path.join(os.path.dirname(__file__), '..', '..', 'assets', 'data', 'tc-sgf-deces.json.gz')
    os.makedirs(cache, exist_ok=True)
    years = {}   # label → {table, col}
    deps = {}    # name → {label: value}
    for f, pat in FILES.items():
        s = xlrd.open_workbook(get(cache, f)).sheet_by_index(0)
        hdr = [str(c.value).strip() for c in s.row(7)]
        cols = {}
        for i, h in enumerate(hdr):
            m = re.match(pat, h)
            if not m:
                continue
            y = m.group('y')
            label = f"{REP[y]} ({y.replace('100 jours de ', '')})" if y in REP else y
            if label in years or label in cols.values():
                continue
            cols[i] = label
        for i, label in cols.items():
            years[label] = {'t': f.split('.')[0].upper().replace('MVTPOP_', ''), 'col': hdr[i][:160]}
        for r in range(8, s.nrows):
            row = s.row(r)
            name = str(row[0].value).strip()
            m = re.match(r'^(.+?)\s*\((.+?)-?\)$', name)   # « ALPES(BASSES-) » → « BASSES-ALPES »
            if m:
                name = f'{m.group(2).rstrip("-")}-{m.group(1)}'
            if not name or str(row[1].value).strip() not in ('0', '1', '0.0', '1.0'):
                continue
            d = deps.setdefault(name, {'sgf': str(row[2].value).strip()})
            for i, label in cols.items():
                v = row[i].value
                if isinstance(v, float) and v >= 0:
                    d[label] = int(round(v))
    order = sorted(years, key=lambda k: (int(re.search(r'1[89]\d\d', k).group()) + (0.5 if k.startswith('an XIV') else 0)))
    rows = []
    for name, d in deps.items():
        k = fold(name)
        codes = ['FR'] if k == 'france' else OLD.get(k) or ([MODERN[k]] if k in MODERN else None)
        if codes is None:
            print('département inconnu :', name, file=sys.stderr)
            continue
        rows.append({'n': 'France' if k == 'france' else ACCENTS.get(nice(name), nice(name)), 'deps': codes, 'sgf': d['sgf'], 'v': [d.get(y) for y in order]})
    rows.sort(key=lambda r: ('0' if r['deps'] == ['FR'] else r['deps'][0]))
    data = {
        'title': 'Décès par département et par année, an IX-1855 (Statistique générale de la France)',
        'source': 'Insee, Données historiques de la Statistique générale de France (SGF) 1800-1925 — Mouvement de la population',
        'url': PAGE, 'licence': 'Licence Ouverte / Open Licence 2.0 (Etalab) — « Source : Insee »',
        'licence_url': 'https://www.insee.fr/fr/information/2008466',
        'licence_quote': 'Sauf mention contraire, les informations publiques diffusées sur ce site sont mises à disposition sous la Licence Ouverte / Open Licence version 2.0 (Etalab).',
        'built': date.today().isoformat(),
        'note': "Nombre total de décès de l'année (les ans IX à XIII courent du 23 septembre au 22 septembre ; l'an XIV = les 100 derniers jours de 1805). "
                "Départements d'alors (Meurthe, Seine, Seine-et-Oise…) rattachés aux codes d'aujourd'hui qui couvrent leur territoire. 1851-1852 et après 1855 : pas de total aussi simple dans les tableaux publiés.",
        'years': order, 'tables': {y: years[y] for y in order}, 'rows': rows}
    with gzip.open(out, 'wt', encoding='utf-8') as o:
        json.dump(data, o, ensure_ascii=False, separators=(',', ':'))
    print(f'{out} : {len(rows)} départements, {len(order)} années, {os.path.getsize(out)} octets')


if __name__ == '__main__':
    main()
