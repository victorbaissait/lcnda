#!/usr/bin/env python3
"""🍰 Les recettes du livre de cuisine de son époque — livres de cuisine du domaine public.
  · transcrits sur Wikisource (texte du domaine public, mise en page Wikisource CC BY-SA 4.0) : une sélection de recettes « de la maison »
    (pot-au-feu, blanquette, daube, crêpes, tartes…) avec le lien vers la page exacte du livre (ancre du numéro de page) ;
  · numérisés sur Internet Archive (sans transcription) : le livre seulement, avec son lien.
Les auteurs sont morts depuis plus de 70 ans (prorogations de guerre comprises) : vérifié par l'année de décès (Wikidata) quand elle existe.
Sortie : assets/data/l9a-recettes.json.gz
"""
import html as H, re, urllib.parse
from common import jget, write, today

WS = 'https://fr.wikisource.org'
MENON = "La cuisinière bourgeoise suivie de l'Office, à l'usage de tous ceux qui se mêlent de dépenses de maisons"
BOOKS = [
    {'id': 'menon', 't': 'La Cuisinière bourgeoise', 'a': 'Menon', 'ad': None, 'y': 1746, 'ed': None, 'prefix': MENON + '/', 'chapters': None,
     'note': 'Le grand livre de cuisine des maisons bourgeoises au XVIIIe siècle, réédité sans cesse jusqu’au milieu du XIXe siècle.'},
    {'id': 'gouffe', 't': 'Le Livre de pâtisserie', 'a': 'Jules Gouffé', 'ad': 1877, 'y': 1873, 'prefix': 'Le Livre de Pâtisserie/', 'chapters': None, 'note': ''},
    {'id': 'escoffier', 't': 'Le Guide culinaire', 'a': 'Auguste Escoffier', 'ad': 1935, 'y': 1903, 'prefix': 'Le guide culinaire/', 'chapters': None,
     'note': 'Le livre des cuisiniers de restaurant et de grande maison.'},
]
IA_BOOKS = [
    ['b2152581x', 'Le Cuisinier impérial', 'A. Viard', None, 1806, 1812],
    ['b2152564x', 'La Cuisinière de la campagne et de la ville', 'Louis-Eustache Audot', 1870, 1818, 1837],
    ['b21505470', 'La Cuisinière de la campagne et de la ville', 'Louis-Eustache Audot', 1870, 1818, 1854],
    ['b21525778', 'Le Livre de cuisine', 'Jules Gouffé', 1877, 1867, 1877],
    ['b21525602', 'La Véritable Cuisine de famille, par Tante Marie', 'anonyme (« Tante Marie »)', None, 1900, 1910],
    ['b21539406', 'La Cuisinière de la campagne et de la ville', 'Louis-Eustache Audot', 1870, 1818, 1907],
]
# les plats « de la maison » qu'on cherche (mot dans le titre de la recette, sans accents)
WANT = ['pot-au-feu', 'pot au feu', 'potee', 'poule au pot', 'blanquette', 'navarin', 'gigot', 'daube', 'boeuf a la mode', 'boeuf bouilli', 'miroton', 'choucroute', 'tete de veau',
        'civet', 'matelote', 'bouillabaisse', 'cassoulet', 'garbure', 'soupe a l\'oignon', 'soupe aux choux', 'soupe', 'potage', 'chou farci', 'choux farcis', 'lentilles', 'haricots',
        'pommes de terre', 'omelette', 'oeufs', 'crepes', 'beignets', 'gaufres', 'tarte', 'galette', 'flan', 'gateau de riz', 'riz au lait', 'brioche', 'madeleine', 'savarin', 'baba',
        'confiture', 'compote', 'creme', 'pate', 'terrine', 'rillettes', 'boudin', 'andouille', 'saucisse', 'lapin', 'poulet', 'canard', 'oie', 'dinde', 'pigeon', 'lievre',
        'brochet', 'carpe', 'truite', 'morue', 'harengs', 'moules', 'escargots', 'grenouilles', 'salade', 'ratatouille', 'fricassee', 'ragout', 'hachis', 'quiche', 'clafoutis', 'far ']
fold = lambda s: re.sub(r'[̀-ͯ]', '', __import__('unicodedata').normalize('NFD', s)).lower().replace('œ', 'oe').replace('’', "'")


def pages(prefix):
    u = WS + '/w/api.php?' + urllib.parse.urlencode({'action': 'query', 'list': 'allpages', 'apprefix': prefix, 'apnamespace': 0, 'aplimit': 500, 'format': 'json'})
    return [p['title'] for p in jget(u)['query']['allpages']]


def parse(title):
    u = WS + '/w/api.php?' + urllib.parse.urlencode({'action': 'parse', 'page': title, 'prop': 'text', 'format': 'json', 'formatversion': 2})
    return jget(u)['parse']['text']


def text(s):
    return re.sub(r'\s+', ' ', H.unescape(re.sub(r'<[^>]+>', '', s))).replace('ſ', 's').replace('′', '’').strip()


def recipes(title, h):
    """[(titre, page imprimée, page du scan, texte)] : les paragraphes qui commencent par un titre en gras"""
    out = []
    marks = [(m.start(), m.group(1), m.group(2)) for m in re.finditer(r'class="pagenum ws-pagenum" id="([^"]+)" title="([^"]+)"', h)]
    paras = [(m, '') for m in re.finditer(r'<p>\s*<b>(.{3,90}?)</b>(.*?)</p>((?:\s*<p>(?!\s*<b>).*?</p>){0,4})', h, re.S)]
    # Menon : un titre <h4 id="…"> puis les paragraphes
    paras += [(m, m.group(2)) for m in re.finditer(r'<h([4-6]) id="([^"]+)"[^>]*>(.{3,200}?)</h\1>((?:\s*<(?:p|ul)>.*?</(?:p|ul)>){1,6})', h, re.S)]
    paras.sort(key=lambda x: x[0].start())
    for m, hid in paras:
        if hid: m = type('M', (), {'group': (lambda self, i, mm=m: {1: mm.group(3), 2: mm.group(4), 3: ''}[i]), 'start': (lambda self, mm=m: mm.start())})()
        t = text(m.group(1)).rstrip('.: —')
        if not t or t.isupper() or len(t) < 4: continue
        body = text(m.group(2) + ' ' + m.group(3)).lstrip('—–- .')
        if len(body) < 40: continue
        before = [x for x in marks if x[0] < m.start()]
        pg = before[-1] if before else (marks[0] if marks else None)
        # le numéro de page qui précède le texte est la page d'avant : la recette commence sur la suivante
        out.append((t, pg[1] if pg else '', pg[2] if pg else '', body[:1500], hid))
    return out


rows, books = [], []
for b in BOOKS:
    titles = [t for t in pages(b['prefix']) if not re.search(r'(Errata|Approbation|PREFACE|Préface|Table|Avant-Propos|Introduction|Annexe|Considérations)', t)]
    got = 0
    for t in titles:
        try: h = parse(t)
        except Exception as e: print('!', t, e); continue
        y = re.search(r'class="ws-year">(\d{4})', h)
        if y and not b.get('ed'): b['ed'] = int(y.group(1))
        per = {}
        for name, pnum, pscan, body, hid in recipes(t, h):
            f = fold(name)
            k = next((w for w in WANT if w.strip() in f), None)
            if not k: continue
            if per.get(k, 0) >= 2: continue
            per[k] = per.get(k, 0) + 1
            anchor = ('#' + urllib.parse.quote(H.unescape(hid))) if hid else ('#' + urllib.parse.quote(pnum)) if pnum else ''
            rows.append({'b': b['id'], 'n': name, 'k': k.strip(), 'url': WS + '/wiki/' + urllib.parse.quote(t.replace(' ', '_')) + anchor,
                         'page': pnum, 'scan': WS + '/wiki/' + urllib.parse.quote(pscan.replace(' ', '_')) if pscan else '', 'text': body})
            got += 1
    print(b['t'], got, 'recettes')
    books.append({'id': b['id'], 't': b['t'], 'a': b['a'], 'ad': b['ad'], 'y': b['y'], 'ed': b.get('ed'), 'note': b['note'], 'where': 'wikisource',
                  'url': WS + '/wiki/' + urllib.parse.quote(b['prefix'].rstrip('/').replace(' ', '_'))})
for ia, t, a, ad, y, ed in IA_BOOKS:
    m = jget('https://archive.org/metadata/' + ia).get('metadata') or {}
    if not m: print('! IA absent', ia); continue
    books.append({'id': ia, 't': t, 'a': a, 'ad': ad, 'y': y, 'ed': ed, 'note': '', 'where': 'archive', 'url': 'https://archive.org/details/' + ia,
                  'search': 'https://archive.org/details/' + ia + '?q='})
print(len(rows), 'recettes,', len(books), 'livres')
write('l9a-recettes', {'source': 'Wikisource (fr) et Internet Archive', 'url': 'https://fr.wikisource.org/wiki/Catégorie:Cuisine',
                       'licence': 'Textes du domaine public (auteurs morts depuis plus de 70 ans) ; transcriptions Wikisource sous CC BY-SA 4.0 ; scans Internet Archive (domaine public)',
                       'built': today(), 'excluded': [['Madame Saint-Ange, La Cuisine de Madame Saint-Ange (1927)', 'date de décès de l’autrice introuvable dans Wikidata et Wikipédia : écartée par prudence (un livre de 1927 peut encore être protégé)'],
                                                      ['Ginette Mathiot, Je sais cuisiner (1932)', 'autrice morte en 1998 (Wikidata Q3106745)'], ['Pampille, Les Bons Plats de France (1913)', 'autrice (Marthe Daudet) morte en 1960 (Wikidata Q15793447)'],
                                                      ['350 recettes de cuisine (Anctil, 1915)', 'livre québécois : pas un livre de France']],
                       'books': books, 'rows': rows})
