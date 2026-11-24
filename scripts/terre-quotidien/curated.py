"""Les petites listes recopiées à la main d'une page lue (pièces, tarifs de la lettre) et la table de l'Insee.

Chaque ligne garde la page d'où elle vient et la phrase lue (« evidence ») ; ce qui n'a pas été trouvé écrit n'est pas dans
la liste (un trou reste un trou : l'app ne devine pas). Pages lues le 24/11/2026 (Wikipédia en français, CC BY-SA 4.0).
"""
import json, os, urllib.parse

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), 'assets', 'data')
WP = lambda t: 'https://fr.wikipedia.org/wiki/' + urllib.parse.quote(t.replace(' ', '_'), safe='()')


def _write(name, obj):
    p = os.path.join(OUT, name)
    with open(p, 'w', encoding='utf-8') as f: json.dump(obj, f, ensure_ascii=False, separators=(',', ':'))
    print(f'{name} : {os.path.getsize(p) / 1024:.0f} Ko')


# ═══════════════════ ✉️ tarif de la lettre simple pour la France (premier échelon de poids) ═══════════════════
# [du, au, prix affiché, à l'année près ?, page, phrase lue]
EVO = 'Évolution du prix du timbre en France'
RATES = [
    ['1849-01-01', '1850-06-30', '20 centimes', False, 'Timbres de France 1849',
     'décret du 24 août 1848 […] application le 1er janvier 1849 ; le vingt centimes noir correspondait au tarif de la lettre (Histoire philatélique et postale de la France)'],
    ['1850-07-01', '1854-06-30', '25 centimes', False, 'Timbres de France 1850', '25 c bleu : lettre de moins de 7,5 grammes au tarif intérieur (tarifs au 1er juillet 1850)'],
    ['1854-07-01', '1871-08-31', '20 centimes', False, 'Timbres de France 1854', '20 c. : lettre jusqu’à 7,5 grammes vers le reste du pays (tarifs de bureau à bureau du 1er juillet 1854)'],
    ['1871-09-01', '1876-12-31', '25 centimes', False, 'Timbres de France 1871', 'L’augmentation des tarifs de 20 centimes à 25c. pour la lettre ordinaire (tarif du 24 août 1871 applicable au 1er septembre 1871) ; 1876 : 25 centimes, lettres de 1er échelon pour une autre ville'],
    ['1878-05-01', '1903-12-31', '15 centimes', False, 'Timbres de France 1900', 'Tarifs métropole : 15 centimes, lettres de 1er échelon (tarif du 1er mai 1878) ; aucune modification des tarifs postaux entre 1900 et 1903 (Type Mouchon)'],
    ['1917-01-01', '1917-12-31', '15 centimes', False, 'Timbres de France 1917', 'Tarifs intérieurs du 1er janvier 1917 : 15 c : carte postale et lettre simple'],
    ['1920-01-01', '1920-12-31', '25 centimes', True, EVO, 'le prix postal va connaître une augmentation régulière passant de 25 centimes en 1920 à 1 franc en 1939'],
    ['1926-08-09', '1926-12-31', '40 centimes', False, 'Timbres de France 1926', 'Tarifs au 9 août pour l’intérieur : 40 centimes : lettres de premier échelon'],
    ['1939-01-01', '1939-12-31', '1 franc', True, EVO, 'passant de 25 centimes en 1920 à 1 franc en 1939'],
    ['1942-01-01', '1942-12-31', '1,50 franc', True, 'Marianne de Dulac', '1,50 francs rose (affranchissement d’une lettre simple de moins de 20 g à l’intérieur de la France métropolitaine en 1942)'],
    ['1946-01-01', '1946-12-31', '3 francs', True, 'Marianne de Gandon', 'le 1er janvier 1947, le tarif de la lettre simple passe à 5 francs (il était de 3 francs jusqu’au 31 décembre 1946)'],
    ['1947-01-01', '1947-12-31', '5 francs', False, 'Marianne de Gandon', 'le 1er janvier 1947, le tarif de la lettre simple passe à 5 francs'],
    ['1959-01-01', '1959-12-31', '25 francs', True, EVO, 'la lettre de moins de 20 grammes est passé de 3 francs en 1946 à 25 francs en 1959'],
    ['1960-01-01', '1960-12-31', '25 centimes (nouveaux francs)', True, EVO, 'Avec le nouveau franc, le tarif intérieur passe de 25 centimes en 1960 à 40 centimes en 1969'],
    ['1969-01-01', '1969-12-31', '40 centimes', True, EVO, 'le tarif intérieur passe de 25 centimes en 1960 à 40 centimes en 1969'],
    ['1980-01-01', '1980-12-31', '1,40 franc', True, EVO, 'le tarif intérieur d’une lettre de 20 grammes passe de 80 centimes à 1,40 franc en 1980'],
]
# 1983 → aujourd'hui : le tableau « Tarifs de La Poste pour les timbres rouge et vert » (timbre rouge = lettre prioritaire, puis lettre verte quand le rouge disparaît en 2023)
TABLE = [('1983-06-01', '2,00 F'), ('1984-07-01', '2,10 F'), ('1988-08-16', '2,20 F'), ('1990-01-11', '2,30 F'), ('1992-08-10', '2,50 F'), ('1993-07-05', '2,80 F'),
         ('1996-03-18', '3,00 F'), ('2001-12-31', '0,46 € (3,02 F)'), ('2003-06-01', '0,50 €'), ('2005-03-01', '0,53 €'), ('2006-10-01', '0,54 €'), ('2008-03-01', '0,55 €'),
         ('2009-03-02', '0,56 €'), ('2010-07-01', '0,58 €'), ('2011-07-01', '0,60 €'), ('2013-01-01', '0,63 €'), ('2014-01-01', '0,66 €'), ('2015-01-01', '0,76 €'),
         ('2016-01-01', '0,80 €'), ('2017-01-01', '0,85 €'), ('2018-01-01', '0,95 €'), ('2019-01-01', '1,05 €'), ('2020-01-01', '1,16 €'), ('2021-01-01', '1,28 €'),
         ('2022-01-01', '1,43 €'), ('2024-01-01', '1,29 € (lettre verte)'), ('2025-01-01', '1,39 € (lettre verte)'), ('2026-01-01', '1,52 € (lettre verte)')]


def build_timbre(cache):
    import datetime as dt
    rows = [{'from': a, 'to': b, 'label': l, 'yearOnly': yo, 'src': 'Wikipédia : ' + page, 'url': WP(page), 'evidence': ev} for a, b, l, yo, page, ev in RATES]
    for i, (d, l) in enumerate(TABLE):
        if i + 1 < len(TABLE): end = (dt.date.fromisoformat(TABLE[i + 1][0]) - dt.timedelta(days=1)).isoformat()
        else: end = '2026-12-31'
        if d == '2022-01-01': end = '2022-12-31'  # 2023 : le timbre rouge disparaît ; la lettre verte de 2023 n'est pas dans le tableau
        rows.append({'from': d, 'to': end, 'label': l, 'yearOnly': False, 'src': 'Wikipédia : ' + EVO + ' (tableau 1983-2026)', 'url': WP(EVO),
                     'evidence': 'Tarif lettre prioritaire (timbre rouge), jusqu’à 20 g' if 'verte' not in l else 'Tarif lettre verte, jusqu’à 20 g'})
    rows.sort(key=lambda r: r['from'])
    _write('tq-timbre.json', {'src': 'Wikipédia en français (articles « Timbres de France [année] », « Évolution du prix du timbre en France »…)', 'url': WP(EVO),
                              'licence': 'CC BY-SA 4.0 (textes de Wikipédia)', 'note': 'Lettre simple pour la France, premier échelon de poids. Seules les périodes trouvées écrites sont gardées : '
                              'entre deux périodes, l’app ne montre rien.', 'rates': rows})


# ═══════════════════ ⏳ espérance de vie (Insee) ═══════════════════
INSEE_ESP = 'https://www.insee.fr/fr/statistiques/fichier/2416631/demo-deces-esp-vie-age-2.xlsx'


def build_esperance(cache):
    import openpyxl
    import importlib
    b = importlib.import_module('__main__')
    p = b.fetch(INSEE_ESP, os.path.join(cache, 'insee', 'esp.xlsx'))
    ws = openpyxl.load_workbook(p, read_only=True)['Données']
    tables = []
    for r in ws.iter_rows(values_only=True):
        r = [x for x in r if x is not None]
        if not r or not isinstance(r[0], (int, str)): continue
        y = r[0]
        if isinstance(y, str):
            if 'y c. Mayotte' in y: continue  # 2014 compté une fois (hors Mayotte, comme les années d'avant)
            y = y.split()[0]
        try: y = int(y)
        except ValueError: continue
        if len(r) < 13 or not all(isinstance(v, (int, float)) for v in r[1:13]): continue
        tables.append({'y': y, 'f': [float(v) for v in r[1:7]], 'm': [float(v) for v in r[7:13]]})
    tables.sort(key=lambda t: t['y'])
    _write('tq-esperance.json', {'src': 'Insee, « Espérance de vie à divers âges » (bilan démographique), France hors Mayotte jusqu’en 2014, y c. Mayotte ensuite ; dernière année provisoire',
                                 'srcShort': 'Insee, Espérance de vie à divers âges', 'url': 'https://www.insee.fr/fr/statistiques/2416631', 'file': INSEE_ESP,
                                 'licence': 'Licence ouverte 2.0 (Etalab)', 'ages': [0, 1, 20, 40, 60, 65], 'gap': 0,
                                 'note': 'Espérance de vie « du moment » : le nombre moyen d’années restant à vivre si les risques de mourir de cette année-là restaient les mêmes. '
                                         'Les tables livrées commencent en 1994 : les tables historiques de l’Ined (Vallin et Meslé, depuis 1806) n’ont pas pu être téléchargées.',
                                 'tables': tables})


# ═══════════════════ 🪙 pièces (rempli plus bas) ═══════════════════
COINS = []


def build_poche(cache):
    items = [dict(c) for c in COINS]
    _write('tq-poche.json', {'src': 'Wikipédia en français (articles sur les pièces) ; images Wikimedia Commons', 'url': WP('Franc français'),
                             'licence': 'Textes : CC BY-SA 4.0 ; images : licence de chaque fichier (indiquée)', 'note': 'Dates de frappe ou de mise en circulation lues dans chaque article.',
                             'items': items})
