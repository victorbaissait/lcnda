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
# [nom, du, au, métal, valeur, page, phrase lue, image Commons, auteur (Commons), licence de l'image]
COINS_RAW = [
    ['un louis d’or (24 livres)', 1640, 1792, 'or', '24 livres', 'Louis (monnaie)', 'la monnaie d’or française frappée de 1640 à 1792',
     'Louis XV Gold.jpg', 'Norbert Roettiers (graveur) — Wikimedia Commons', 'CC BY-SA 1.0'],
    ['un écu de 6 livres en argent', 1734, 1793, 'argent', '6 livres', 'Écu (monnaie)', 'se stabiliser aux alentours de six livres au milieu du XVIIIe siècle, après […] la réforme monétaire de 1734 ; la dernière émission de l’écu de 6 livres date de 1793',
     'Convention nationale écu 1793 76001793.jpg', 'CNG — Wikimedia Commons', 'CC BY-SA 3.0'],
    ['une pièce de 5 francs en argent (« cent sous »)', 1796, 1878, 'argent', '5 francs', 'Franc français', 'Pièce de 5 francs en argent, l’An V de la République (1796), première émission du Franc ; aucune pièce de 5 francs n’avait été frappée depuis 1879 (Type Semeuse)',
     'France, 5 franc, 1821 - Louis XVIII.jpg', 'Петров Эдуард — Wikimedia Commons', 'CC0'],
    ['une pièce de 1 franc en argent', 1803, 1920, 'argent', '1 franc', 'Franc français', 'Pièce en argent de 1 franc […] frappée en 1803 ; pièce de 1 franc en argent : la dernière sera émise en 1920',
     '1 franc an 12 France.jpg', 'Pierre-Joseph Tiolier (graveur) — Wikimedia Commons', 'domaine public'],
    ['un napoléon (20 francs en or)', 1803, 1914, 'or', '20 francs', 'Napoléon (pièce de monnaie)', 'année d’émission : 1803 - 1914 ; de très nombreuses pièces françaises en or de 20 francs frappées de 1803 à 1914',
     'France 1803-04-A 20 Francs.jpg', 'National Museum of American History — Wikimedia Commons', 'domaine public'],
    ['une pièce de 50 centimes Semeuse en argent', 1897, 1920, 'argent', '50 centimes', 'Type Semeuse (monnaie)', '1897 à 1920 : 50 centimes, argent 835 (très peu circulée à partir de 1914)', '', '', ''],
    ['une pièce de 1 franc Semeuse en argent', 1898, 1920, 'argent', '1 franc', 'Type Semeuse (monnaie)', '1898 à 1920 : 1 franc, argent 835',
     '1 franc semeuse revers.png', 'Lyhana8 — Wikimedia Commons', 'domaine public'],
    ['une pièce de 2 francs Semeuse en argent', 1898, 1920, 'argent', '2 francs', 'Type Semeuse (monnaie)', '1898 à 1920 : 2 francs, argent 835', '', '', ''],
    ['une pièce de 10 centimes Lindauer (trouée)', 1917, 1938, 'cupronickel', '10 centimes', 'Type Lindauer', '1917 à 1938 : 10 centimes, 21 mm, cupro-nickel',
     '2015-06-04 16-52-37 piece.jpg', 'Thomas Bresson — Wikimedia Commons', 'CC BY 3.0'],
    ['une pièce de 5 centimes Lindauer (trouée)', 1920, 1938, 'cupronickel', '5 centimes', 'Type Lindauer', '1920 à 1938 : 5 centimes, 15 mm, cupro-nickel (réduction du module)', '', '', ''],
    ['une pièce de 1 franc Morlon en bronze d’aluminium', 1931, 1940, 'bronze d’aluminium', '1 franc', 'Type Morlon', '1931 à 1940 : 1 franc, 23 mm, 4 g, bronze d’aluminium',
     '1 France 1936 VSRS.png', 'McGoinz — Wikimedia Commons', 'CC0'],
    ['une pièce de 50 centimes Morlon', 1931, 1940, 'bronze d’aluminium', '50 centimes', 'Type Morlon', '1931 à 1940 : 50 centimes, 18 mm, bronze d’aluminium',
     '50 Centimes 1941 VSRS.png', 'McGoinz — Wikimedia Commons', 'CC0'],
    ['une pièce de 1 franc Morlon en aluminium', 1944, 1959, 'aluminium', '1 franc', 'Type Morlon', '1944 à 1959 : 1 franc, 23 mm, 1,3 g, aluminium', '', '', ''],
    ['une pièce de 2 francs Morlon en aluminium', 1944, 1959, 'aluminium', '2 francs', 'Type Morlon', '1944 à 1959 : 2 francs, 27 mm, 2,2 g, aluminium', '', '', ''],
    ['une pièce de 5 francs Semeuse en argent', 1959, 1969, 'argent', '5 nouveaux francs', 'Type Semeuse (monnaie)', '1959 à 1969 : 5 francs, 29 mm, 12 g, argent 835',
     '5 French francs Semeuse silver 1960 F340-4 obverse.jpg', 'Louis-Oscar Roty (graveur) — Wikimedia Commons', 'CC BY-SA 3.0'],
    ['une pièce de 1 franc Semeuse', 1960, 2001, 'nickel', '1 franc', 'Type Semeuse (monnaie)', '1960 à 2001 : 1 franc, 24 mm, 6 g, nickel — 41 ans sans changer',
     '1Franc1999.jpg', 'Choloepus — Wikimedia Commons', 'domaine public'],
    ['une pièce de 10 francs Hercule en argent', 1964, 1973, 'argent', '10 francs', 'Pièce de 10 francs Hercule', 'une pièce de monnaie française ayant cours légal, frappée entre 1964 et 1973',
     '10 French francs Hercule 1967 F364-6 obverse.png', 'Eric Gaba (Sting) — Wikimedia Commons', 'CC BY-SA 3.0'],
    ['une pièce de 1/2 franc Semeuse', 1965, 2001, 'nickel', '1/2 franc', 'Type Semeuse (monnaie)', '1965 à 2001 : 1/2 franc, 19,5 mm, nickel', '', '', ''],
    ['une pièce de 5 francs Semeuse en nickel', 1970, 2001, 'nickel', '5 francs', 'Type Semeuse (monnaie)', '1970 à 2001 : 5 francs, 29 mm, 10 g, nickel', '', '', ''],
    ['une pièce de 50 francs Hercule en argent', 1974, 1980, 'argent', '50 francs', 'Franc français', 'La 50 francs type Hercule (avers et revers) émise entre 1974 et 1980',
     '50 franc of France Republic 5 - 1978.png', 'Windrain — Wikimedia Commons', 'CC BY-SA 4.0'],
    ['une pièce de 2 francs Semeuse', 1979, 2001, 'nickel', '2 francs', 'Type Semeuse (monnaie)', '1979 à 2001 : 2 francs, 26,5 mm, nickel (dessin stylisé)', '', '', ''],
    ['une pièce de 100 francs Panthéon en argent', 1982, 2001, 'argent', '100 francs', 'Franc français', 'La 100 francs type Panthéon (avers), frappée entre 1982 et 2001',
     '100 Francs 1983 avers.png', 'Choloepus — Wikimedia Commons', 'domaine public'],
]
# la pièce la plus « de tous les jours » d'abord (pour la phrase) : petites valeurs avant l'or
ORDER = {'1 franc': 0, '50 centimes': 1, '10 centimes': 2, '5 centimes': 3, '1/2 franc': 4, '2 francs': 5, '5 francs': 6, '5 nouveaux francs': 6, '6 livres': 7, '10 francs': 8, '20 francs': 9, '24 livres': 10, '50 francs': 11, '100 francs': 12}
COINS = [{'id': i + 1, 'cc': 'FR', 'name': n, 'from': a, 'to': b, 'metal': m, 'value': v, 'src': 'Wikipédia : ' + page, 'url': WP(page), 'evidence': ev,
          'img': img or None, 'credit': cr or None, 'licence': lic or None, 'rank': ORDER.get(v, 20)}
         for i, (n, a, b, m, v, page, ev, img, cr, lic) in enumerate(COINS_RAW)]


def build_poche(cache):
    items = sorted((dict(c) for c in COINS), key=lambda c: (c['rank'], c['from']))
    _write('tq-poche.json', {'src': 'Wikipédia en français (articles sur les pièces) ; images Wikimedia Commons', 'url': WP('Franc français'),
                             'licence': 'Textes : CC BY-SA 4.0 ; images : licence de chaque fichier (indiquée)', 'note': 'Années de frappe lues dans chaque article (une pièce frappée une année était dans les poches cette année-là ; elle a souvent circulé plus longtemps).',
                             'items': items})
