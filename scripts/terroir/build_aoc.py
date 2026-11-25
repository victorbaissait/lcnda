#!/usr/bin/env python3
"""🍷 Son village en AOC/AOP/IGP → assets/data/tr-aoc.json.gz

Sources (Institut national de l'origine et de la qualité, INAO — data.gouv.fr, Licence Ouverte (fr-lo)) :
  - « Aires géographiques des AOC/AOP »   https://www.data.gouv.fr/datasets/aires-geographiques-des-aoc-aop
       fichier 2025-10-09-COMAGRI-Communes_Aires_AO.csv (CI;Département;Commune;Art;Aire géographique;IDA)
  - « Aire géographique des IGP et des IG » https://www.data.gouv.fr/datasets/aire-geographique-des-igp-et-des-ig
       fichier 2025-10-09-COMAGRI-Communes_Aires_IG.csv (Signe UE;IDA;Date MAJ;Aire géographique;CI;Département;Commune;Art;Actual)
  - « Aires et produits AOC/AOP et IGP »  https://www.data.gouv.fr/datasets/aires-et-produits-aoc-aop-et-igp
       fichier 2025-03-10-COMAGRI-Aires_produits.csv (IDA;Aire geographique;Signe FR;Signe UE;IdProduit;Produit;Référence)
  - Wikidata (CC0) : les éléments qui portent un identifiant de produit INAO (P3895 = IdProduit) → la sorte de produit (vin,
    fromage…), l'image et l'article de Wikipédia. Sinon la sorte vient des mots du nom des produits (« rouge », « fromage »…).
Les fichiers listent aussi les anciennes communes (code INSEE d'avant les fusions) : on les garde, c'est utile en généalogie.
Lancer : python3 build_aoc.py DOSSIER_DES_CSV   (les trois fichiers, téléchargés tels quels depuis data.gouv.fr)
"""
import csv, io, os, re, sys, urllib.parse
from tr_common import wm, qid, write, fold, TODAY

URLS = {'aoc': 'https://static.data.gouv.fr/resources/aires-geographiques-des-aoc-aop/20251009-122320/2025-10-09-comagri-communes-aires-ao.csv',
        'ig': 'https://static.data.gouv.fr/resources/aire-geographique-des-igp-et-des-ig/20251009-122625/2025-10-09-comagri-communes-aires-ig.csv',
        'produits': 'https://static.data.gouv.fr/resources/aires-et-produits-aoc-aop-et-igp/20251009-122906/2025-03-10-comagri-aires-produits.csv'}
# la sorte de produit : d'abord le type Wikidata, sinon les mots du nom
WD_CAT = {'vin': {'Q282', 'Q1827', 'Q10210', 'Q12979', 'Q80114014', 'Q630531', 'Q10750129', 'Q22715', 'Q2140699', 'Q156362', 'Q3558198', 'Q1565828', 'Q154'},
          'fromage': {'Q10943', 'Q2223649'}, 'spiritueux': {'Q284', 'Q170582'}, 'olive': {'Q93165', 'Q12179886'}}
WORDS = [('fromage', r'\bfromage|\btomme\b|\bbleu\b|\bbrie\b|camembert|roquefort|comt[ée]\b(?!s? tolosan)|reblochon|munster|époisses|mont d.or|ossau|beaufort|cantal|salers|laguiole|saint-nectaire|morbier|maroilles|chaource|langres|neufchâtel|pélardon|picodon|rocamadour|valençay|selles-sur-cher|chabichou|crottin|banon|abondance|emmental|raclette|livarot|pont-l.évêque|brocciu|fourme|gruyère|mâconnais|charolais \(fromage\)|sainte-maure|pouligny|bleu'),
         ('spiritueux', r'eau[x]?-de-vie|cognac|armagnac|calvados|\bmarc\b|\bfine\b|whisky|rhum|liqueur|pommeau|génépi|absinthe|kirsch|mirabelle de lorraine \(eau|cassis de|pineau|floc|macvin|ratafia|vermouth|gin\b|genièvre|brandy|pastis|chartreuse'),
         ('cidre', r'\bcidre|poiré'),
         ('vin', r'\brouge\b|\bblanc\b|\brosé\b|\bvin\b|mousseux|crémant|primeur|clairet|vendanges|\bgris\b|pétillant|liquoreux|\bmoelleux\b|vin doux|grand cru|premier cru|villages\b|côtes?[- ]d|coteaux|\bsur lie\b'),
         ('laitier', r'\bbeurre|\bcrème\b|\blait\b'),
         ('viande', r'volaille|poulet|dinde|chapon|canard|\boie\b|pintade|\bporc\b|jambon|agneau|b[oœ]uf|bovin|veau|viande|saucisse|saucisson|rillettes|foie gras|taureau|\bfin gras\b|charcuterie|andouille|boudin|pâté|lapin|mouton'),
         ('mer', r'huître|moule|coquille|poisson|sardine|anchois|thon|crevette|sel\b|fleur de sel'),
         ('olive', r'huile|olive'),
         ('miel', r'\bmiel\b'),
         ('fruit', r'pomme|poire|abricot|cerise|prune|pruneau|mirabelle|noix|noisette|châtaigne|marron|fraise|melon|pêche|clémentine|kiwi|figue|raisin|citron|chasselas|framboise|myrtille|bergamote|reinette|agrumes'),
         ('legume', r'lentille|haricot|coco\b|pomme de terre|piment|oignon|ail\b|échalote|carotte|poireau|asperge|chou|artichaut|mogette|lingot|riz\b|farine|blé|maïs|safran|moutarde|thym|lavande|foin|herbes'),
         ('autre', r'.')]
CATS = {'vin': ('🍷', 'Vin'), 'fromage': ('🧀', 'Fromage'), 'spiritueux': ('🥃', 'Eau-de-vie ou liqueur'), 'cidre': ('🍏', 'Cidre ou poiré'), 'laitier': ('🧈', 'Beurre ou crème'),
        'viande': ('🍖', 'Viande ou volaille'), 'mer': ('🦪', 'Produit de la mer'), 'olive': ('🫒', 'Olive ou huile'), 'miel': ('🍯', 'Miel'), 'fruit': ('🍎', 'Fruit'),
        'legume': ('🥕', 'Légume, céréale ou plante'), 'autre': ('🏷️', 'Autre produit')}


def read(path):
    raw = open(path, 'rb').read()
    try: txt = raw.decode('utf-8')
    except UnicodeDecodeError: txt = raw.decode('cp1252')
    return list(csv.DictReader(io.StringIO(txt), delimiter=';'))


def main(src):
    A = read(os.path.join(src, 'aoc.csv')); G = read(os.path.join(src, 'ig.csv')); P = read(os.path.join(src, 'produits.csv'))
    key = lambda d, *names: next((d[k] for k in d if k and fold(k) in [fold(n) for n in names]), '')
    prods = {}
    for r in P:
        ida = key(r, 'IDA').strip()
        prods.setdefault(ida, []).append({'id': key(r, 'IdProduit').strip(), 'name': key(r, 'Produit').strip(), 'fr': key(r, 'Signe FR').strip(), 'ue': key(r, 'Signe UE').strip()})
    # Wikidata : élément de chaque produit INAO
    WD = {}
    for r in wm.sparql('SELECT ?i ?id ?t ?img ?wp WHERE { ?i wdt:P3895 ?id . OPTIONAL { ?i wdt:P31 ?t } OPTIONAL { ?i wdt:P18 ?img } OPTIONAL { ?wp schema:about ?i ; schema:isPartOf <https://fr.wikipedia.org/> } }', 'inao-ids', gap=1):
        o = WD.setdefault(r['id'], {'q': qid(r['i']), 't': set(), 'img': '', 'wp': ''})
        if r.get('t'): o['t'].add(qid(r['t']))
        if r.get('img') and not o['img']: o['img'] = urllib.parse.unquote(re.sub(r'^.*Special:FilePath/', '', r['img']))
        if r.get('wp') and not o['wp']: o['wp'] = urllib.parse.unquote(r['wp'].rsplit('/wiki/', 1)[1]).replace('_', ' ')

    areas = {}  # IDA → infos
    def area(ida, name, sign):
        a = areas.get(ida)
        if not a: a = areas[ida] = {'ida': ida, 'name': name, 'sign': sign, 'communes': set()}
        return a
    for r in A:
        ida = key(r, 'IDA').strip(); ps = prods.get(ida, [])
        fr = next((p['fr'] for p in ps if p['fr']), ''); ue = next((p['ue'] for p in ps if p['ue']), '')
        area(ida, key(r, 'Aire géographique').strip(), fr or ue or 'AOC')['communes'].add(key(r, 'CI').strip())
    for r in G:
        ida = key(r, 'IDA').strip(); s = key(r, 'Signe UE').strip().split(' ')[0] or 'IGP'
        area(ida, key(r, 'Aire géographique').strip(), s)['communes'].add(key(r, 'CI').strip())

    rows = []
    for ida, a in areas.items():
        ps = prods.get(ida, [])
        cat = ''
        for p in ps:
            w = WD.get(p['id'])
            if not w: continue
            for c, s in WD_CAT.items():
                if w['t'] & s: cat = cat or c
        if not cat:
            text = ' | '.join([a['name']] + [p['name'] for p in ps]).lower()
            cat = next(c for c, rx in WORDS if re.search(rx, text))
        w = next((WD[p['id']] for p in ps if p['id'] in WD and (WD[p['id']]['img'] or WD[p['id']]['wp'])), None) or next((WD[p['id']] for p in ps if p['id'] in WD), None)
        names = list(dict.fromkeys(p['name'] for p in ps if p['name'] and p['name'] != a['name']))
        row = [int(ida), a['name'], a['sign'].upper(), cat, w['q'] if w else '', w['wp'] if w else '', w['img'] if w else '', names[:15], len(names)]
        rows.append((row, a['communes']))
    rows.sort(key=lambda x: fold(x[0][1]))
    out_areas = [r for r, _ in rows]
    by_c = {}
    for i, (_, cs) in enumerate(rows):
        for ci in cs:
            if re.match(r'^\d[\dAB]\d{3}$', ci): by_c.setdefault(ci, []).append(i)
    stats = {}
    for r in out_areas: stats[r[3]] = stats.get(r[3], 0) + 1
    print('aires :', len(out_areas), '· communes :', len(by_c), '· sortes :', stats, '· signes :', {s: sum(1 for r in out_areas if r[2] == s) for s in {r[2] for r in out_areas}})
    write('aoc', {'v': 1, 'built': TODAY, 'fields': ['ida', 'nom', 'signe', 'sorte', 'wikidata', 'wikipedia', 'image', 'produits', 'nb_produits'],
                  'cats': CATS, 'attr': 'INAO (Institut national de l’origine et de la qualité) : aires géographiques des AOC/AOP, des IGP et des IG, et produits de chaque aire (fichiers du 9 octobre 2025 et du 10 mars 2025) ; sorte de produit, image, article : Wikidata (P3895)',
                  'licence': 'Licence Ouverte (Etalab) — INAO, data.gouv.fr ; CC0 1.0 (Wikidata)', 'urls': URLS,
                  'pages': {'aoc': 'https://www.data.gouv.fr/datasets/aires-geographiques-des-aoc-aop', 'ig': 'https://www.data.gouv.fr/datasets/aire-geographique-des-igp-et-des-ig', 'produits': 'https://www.data.gouv.fr/datasets/aires-et-produits-aoc-aop-et-igp'},
                  'areas': out_areas, 'c': by_c})


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '.')
