#!/usr/bin/env python3
"""LCNDA — lot N2 des téléchargements : les chiffres d'époque de la Statistique générale de la France (SGF), par département,
tableaux reconstitués et publiés par l'Insee.

    python3 -I scripts/telech-n2/build_sgf.py OUT_DIR [ecole|recensements|territoire ...]

  📚 tn2-sgf-ecole        « Enseignement primaire, 1829-1897 »       https://www.insee.fr/fr/statistiques/2659830
  👥 tn2-sgf-recensements « Recensements de 1851 à 1921 »            https://www.insee.fr/fr/statistiques/2653233
  🗺 tn2-sgf-territoire   « Territoire et population, 1800-1890 »   https://www.insee.fr/fr/statistiques/2591293

Licence (page lue à chaque fabrication ; le script s'arrête si la phrase a changé) : « Sauf mention contraire, les informations
publiques diffusées sur ce site […] sont mises à disposition sous la Licence Ouverte / Open Licence version 2.0 (Etalab) »
(https://www.insee.fr/fr/information/2008466), mention « Source : Insee ».

Chaque tableau est recopié tel quel (aucun calcul) : le titre, les sources imprimées, l'intitulé de chaque colonne, la valeur de
chaque département (et, pour l'école, des arrondissements, chefs-lieux et villes quand le tableau les donne). Les départements
d'alors (Meurthe, Seine-et-Oise…) sont rattachés aux codes d'aujourd'hui qui couvrent leur territoire.
Il faut `pip install xlrd` (fichiers Excel 97).
"""
import html
import os
import re
import sys
import unicodedata

import xlrd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm  # noqa: E402

LICENCE_PAGE = 'https://www.insee.fr/fr/information/2008466'
THEMES = {
    'ecole': ('2659830', 'tn2-sgf-ecole', 'Enseignement primaire, 1829-1897 (Statistique générale de la France)', 'Écoles, élèves, maîtres, dépenses, par département (et chefs-lieux et villes en 1881-1882, 1887 et 1896-1897)', True),
    'recensements': ('2653233', 'tn2-sgf-recensements', 'Recensements de 1851 à 1921 (Statistique générale de la France)', 'Âges, sexes, état civil, professions, étrangers, par département', False),
    'territoire': ('2591293', 'tn2-sgf-territoire', 'Territoire et population, 1800-1890 (Statistique générale de la France)', 'Superficie, population et densité par département', False),
}

OLD = {'basses alpes': ['04'], 'charente inferieure': ['17'], 'cotes du nord': ['22'], 'loire inferieure': ['44'], 'meurthe': ['54'], 'meurthe et moselle': ['54'],
       'basses pyrenees': ['64'], 'seine inferieure': ['76'], 'seine': ['75', '92', '93', '94'], 'seine et oise': ['78', '91', '95'],
       'corse': ['2A', '2B'], 'moselle': ['57'], 'bas rhin': ['67'], 'haut rhin': ['68', '90'], 'belfort': ['90'], 'territoire de belfort': ['90'], 'haut rhin territoire de belfort': ['90']}
MODERN = {'ain': '01', 'aisne': '02', 'allier': '03', 'hautes alpes': '05', 'alpes maritimes': '06', 'ardeche': '07', 'ardennes': '08', 'ariege': '09',
          'aube': '10', 'aude': '11', 'aveyron': '12', 'bouches du rhone': '13', 'calvados': '14', 'cantal': '15', 'charente': '16', 'cher': '18',
          'correze': '19', 'cote d or': '21', 'creuse': '23', 'dordogne': '24', 'doubs': '25', 'drome': '26', 'eure': '27', 'eure et loir': '28',
          'finistere': '29', 'gard': '30', 'haute garonne': '31', 'gers': '32', 'gironde': '33', 'herault': '34', 'ille et vilaine': '35', 'indre': '36',
          'indre et loire': '37', 'indre et loir': '37', 'isere': '38', 'jura': '39', 'landes': '40', 'loir et cher': '41', 'loire': '42', 'haute loire': '43', 'loiret': '45',
          'lot': '46', 'lot et garonne': '47', 'lozere': '48', 'maine et loire': '49', 'manche': '50', 'marne': '51', 'haute marne': '52', 'mayenne': '53',
          'meuse': '55', 'morbihan': '56', 'nievre': '58', 'nord': '59', 'oise': '60', 'orne': '61', 'pas de calais': '62', 'puy de dome': '63',
          'hautes pyrenees': '65', 'pyrenees orientales': '66', 'rhone': '69', 'haute saone': '70', 'saone et loire': '71', 'sarthe': '72',
          'savoie': '73', 'haute savoie': '74', 'seine et marne': '77', 'deux sevres': '79', 'somme': '80', 'tarn': '81', 'tarn et garonne': '82',
          'var': '83', 'vaucluse': '84', 'vendee': '85', 'vienne': '86', 'haute vienne': '87', 'vosges': '88', 'yonne': '89'}


ALIAS = {'haute rhin': 'haut rhin', 'maritimes alpes': 'alpes maritimes', 'cote du nord': 'cotes du nord', 'indre et loir': 'indre et loire'}


def fold(s):
    s = unicodedata.normalize('NFD', str(s)).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z]+', ' ', s).strip()


def dep_name(raw):
    """« ALPES(BASSES-) » → « Basses-Alpes »"""
    name = str(raw).strip()
    m = re.match(r'^(.+?)\s*\((.+?)-?\)$', name)
    if m:
        name = f'{m.group(2).rstrip("-")}-{m.group(1)}'
    return '-'.join(w.capitalize() if w.lower() not in ('et', 'du', 'de', 'des', 'sur', "d'or") else w.lower() for w in name.lower().split('-')).replace("d'or", "d'Or")


def dep_codes(name):
    k = fold(name)
    if k == 'france':
        return ['FR']
    k = ALIAS.get(k, k)
    if k in OLD or k in MODERN:
        return OLD.get(k) or [MODERN[k]]
    # noms coupés dans les tableaux (« CHARENTE-INFERIEU », « PYRENEES-ORIENTAL ») : un seul nom qui commence ainsi
    hits = [x for x in list(OLD) + list(MODERN) if len(k) >= 10 and x.startswith(k)]
    return (OLD.get(hits[0]) or [MODERN[hits[0]]]) if len(hits) == 1 else None


def check_licence():
    t = wm.get(LICENCE_PAGE, 'text/html').decode('utf-8', 'replace')
    t = re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', t)))
    if 'Licence Ouverte / Open Licence version 2.0' not in t or 'Source : Insee' not in t:
        sys.exit(f'La page {LICENCE_PAGE} ne dit plus « Licence Ouverte / Open Licence version 2.0 » : rien n’est fabriqué.')
    i = t.find('Sauf mention contraire')
    return t[i:i + 260].split(' (Etalab)')[0] + ' (Etalab).'


def num(v):
    if isinstance(v, float):
        return int(v) if v == int(v) and abs(v) < 1e15 else round(v, 3)
    s = str(v).strip().replace(',', '.')
    if re.fullmatch(r'-?\d+(\.\d+)?', s):
        return num(float(s))
    return s[:80] if s else None


def build(theme, out_dir):
    sid, name, title, what, keep_towns = THEMES[theme]
    page = f'https://www.insee.fr/fr/statistiques/{sid}'
    p = wm.get(page, 'text/html').decode('utf-8', 'replace')
    files = sorted(set(re.findall(rf'/fr/statistiques/fichier/{sid}/([A-Za-z0-9_]+\.xls)', p)))
    files = [f for f in files if not f.lower().startswith('libelles')]
    if not files:
        sys.exit(f'{page} : aucun fichier .xls trouvé')
    units, uidx, tables, data = [], {}, [], {}
    for f in files:
        b = wm.get(f'https://www.insee.fr/fr/statistiques/fichier/{sid}/{f}', 'application/vnd.ms-excel')
        s = xlrd.open_workbook(file_contents=b).sheet_by_index(0)
        hdr_row = next((r for r in range(4, min(30, s.nrows)) if str(s.cell_value(r, 0)).strip().startswith("Nom de l'unit")), None)
        if hdr_row is None:
            print(f'{f} : pas de ligne d’intitulés, tableau laissé de côté', file=sys.stderr)
            continue
        tid = f.rsplit('.', 1)[0].upper()
        ttitle = str(s.cell_value(3, 1)).strip()
        ttitle = re.sub(r'^[A-Z0-9_]+ : ', '', ttitle)
        srcs = [str(s.cell_value(r, 1)).strip() for r in range(4, hdr_row - 1) if str(s.cell_value(r, 1)).strip()]
        cols = [str(c.value).strip() for c in s.row(hdr_row)][5:]
        rows = []
        for r in range(hdr_row + 1, s.nrows):
            row = s.row(r)
            lvl = str(row[1].value).strip().split('.')[0]
            nm = str(row[0].value).strip()
            if not nm:
                continue
            if lvl in ('0', '9') and fold(nm) == 'france':
                key = ('FR',)
            elif lvl == '1':
                key = ('D', dep_name(nm))
            elif keep_towns and lvl in ('3', '4'):
                key = ('V', dep_name(nm), str(row[2].value).strip(), lvl)
            else:
                continue
            if key not in uidx:
                if key[0] == 'FR':
                    u = ['France', 'FR', ['FR'], '']
                elif key[0] == 'D':
                    codes = dep_codes(key[1])
                    if codes is None:
                        print(f'{tid} : département inconnu {nm}', file=sys.stderr)
                        continue
                    u = [key[1], 'D', codes, str(row[2].value).strip()]
                else:
                    u = [key[1], 'A' if key[3] == '3' else 'V', [], key[2]]
                uidx[key] = len(units)
                units.append(u)
            vals = [num(c.value) for c in row[5:5 + len(cols)]]
            if any(v is not None for v in vals):
                rows.append([uidx[key]] + vals)
        if rows:
            tables.append({'id': tid, 'title': ttitle, 'src': srcs, 'cols': cols, 'file': f'https://www.insee.fr/fr/statistiques/fichier/{sid}/{f}'})
            data[tid] = rows
    # les villes et arrondissements : rattachés au département par le code SGF du département
    sgf2dep = {u[3]: u[2] for u in units if u[1] == 'D'}
    for u in units:
        if u[1] in ('A', 'V'):
            u[2] = sgf2dep.get(u[3], [])
    meta = {'title': title, 'what': what, 'source': 'Insee, Données historiques de la Statistique générale de France (SGF) — ' + title.split(' (')[0],
            'url': page, 'licence': 'Licence Ouverte / Open Licence 2.0 (Etalab) — « Source : Insee »', 'licence_url': LICENCE_PAGE,
            'licence_quote': LICENCE_QUOTE, 'mention': 'Source : Insee', 'built': wm.today(),
            'note': 'Tableaux recopiés tels quels, sans calcul. Les départements d’alors sont rattachés aux codes d’aujourd’hui qui couvrent leur territoire (Seine → 75, 92, 93, 94…). Les codes SGF des départements suivent l’ordre alphabétique de l’époque.',
            'units_fields': ['n', 'lvl', 'deps', 'sgf'], 'units': units, 'tables': tables, 'data': data}
    n = wm.write_gz(out_dir, f'{name}.json.gz', meta)
    print(f'{name} : {len(tables)} tableaux, {len(units)} unités, {n} octets')


if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    LICENCE_QUOTE = check_licence()
    for th in (sys.argv[2:] or list(THEMES)):
        build(th, sys.argv[1])
