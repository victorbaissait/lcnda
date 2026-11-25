#!/usr/bin/env python3
"""🎲 Lot D — Jeux traditionnels et régionaux (assets/data/td-jeux.json.gz).

Sources :
 - Wikipédia en français (textes CC BY-SA 4.0) : les articles de la « Catégorie:Jeu traditionnel et régional » et de ses
   sous-catégories « Pelote basque » et « Sport équestre lié à une tradition » ; on garde le titre, l'adresse et la première
   phrase de l'article (citée, avec le lien et la licence) ;
 - Wikidata (CC0 1.0) : les éléments « jeu traditionnel » (Q676977, et ses sous-classes) de France, de Belgique et de Suisse ;
   et, pour chaque jeu, son pays ou sa région (P131 lieu, P276, P2341 originaire de, P495 pays d'origine) et la position de ce
   lieu (P625), pour dire « un jeu de ta région ».
Lancer : python3 scripts/telech-d/build_jeux.py [dossier de sortie]   (TD_RAW = cache des réponses)
"""
import os, re, sys, time, urllib.parse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'assets', 'data')
CATS = ['Catégorie:Jeu traditionnel et régional', 'Catégorie:Pelote basque', 'Catégorie:Sport équestre lié à une tradition']
SKIP = re.compile(r'^(Jeu traditionnel et régional|Musée des jeux traditionnels|Règles du Mah-jong.*|Fédération .*|Fronton .*)$')
# la région dite dans la première phrase de l'article (« un jeu de quilles du Trégor ») : son centre approximatif, pour « près de
# chez lui » ; le mot trouvé est gardé (colonne « hint ») et l'écran dit « d'après Wikipédia »
REGIONS = [('Trégor', 48.70, -3.40), ('Léon', 48.55, -4.30), ('Pays de Fougères', 48.35, -1.20), ('Pays Nantais', 47.22, -1.55), ('Vignoble', 47.15, -1.35),
           ('Bretagne', 48.20, -2.90), ('Normandie', 49.10, 0.20), ('Picardie', 49.90, 2.30), ('Ponthieu', 50.15, 1.85), ('Boulonnais', 50.70, 1.70),
           ('Nord', 50.50, 3.10), ('Flandre', 50.80, 2.90), ('Val de Loire', 47.40, 0.70), ('Vendée', 46.65, -1.40), ('Gascogne', 43.70, 0.30),
           ('gascon', 43.70, 0.30), ('Landes', 44.00, -0.80), ('Béarn', 43.30, -0.40), ('Pays basque', 43.30, -1.30), ('Sud-Ouest', 44.00, 0.50),
           ('Provence', 43.70, 5.80), ('Grasse', 43.66, 6.92), ('Savoie', 45.50, 6.40), ('Auvergne', 45.70, 3.10), ('Aveyron', 44.30, 2.60),
           ('Lorraine', 48.80, 6.20), ('Alsace', 48.30, 7.50), ('Champagne', 49.00, 4.20), ('Bourgogne', 47.20, 4.60), ('Limousin', 45.70, 1.60),
           ('Berry', 46.80, 2.00), ('Poitou', 46.50, 0.20), ('Wallonie', 50.40, 4.70), ('Mauron', 48.08, -2.28), ('Oudon', 47.35, -1.28)]
FAR = re.compile(r'Japon|Mongolie|Irak|Éthiopie|éthiopien|Maoris|Amérique|États-Unis|Inde|croate|slovène|Maghreb|Sanlúcar|japonais', re.I)
COUNTRIES = {'Q142': 'France', 'Q31': 'Belgique', 'Q39': 'Suisse'}
qid = lambda u: (u or '').rsplit('/', 1)[-1]


def point(s):
    m = re.match(r'Point\(([-\d.eE]+) ([-\d.eE]+)\)', s or '')
    return (round(float(m.group(2)), 4), round(float(m.group(1)), 4)) if m else (None, None)


def members():
    out = []
    for c in CATS:
        d = wm.mw('fr.wikipedia.org', {'action': 'query', 'list': 'categorymembers', 'cmtitle': c, 'cmlimit': 500, 'cmnamespace': 0})
        out += [m['title'] for m in d['query']['categorymembers'] if not SKIP.match(m['title'])]
    return sorted(set(out))


def page_info(titles):
    """QID et première phrase de chaque article (par paquets de 20)"""
    info = {}
    for i in range(0, len(titles), 20):
        d = wm.mw('fr.wikipedia.org', {'action': 'query', 'prop': 'pageprops|extracts', 'ppprop': 'wikibase_item', 'exintro': 1, 'explaintext': 1,
                                       'exsentences': 1, 'exlimit': 20, 'redirects': 1, 'titles': '|'.join(titles[i:i + 20])})
        for p in d['query'].get('pages', []):
            if p.get('missing'):
                continue
            info[p['title']] = {'q': p.get('pageprops', {}).get('wikibase_item', ''), 'ex': re.sub(r'\s+', ' ', p.get('extract', '')).strip()[:300]}
    return info


def main():
    titles = members()
    info = page_info(titles)
    rows = {}
    for t, v in info.items():
        rows[v['q'] or t] = {'q': v['q'], 'n': t, 'ex': v['ex'], 'frwiki': t, 'region': '', 'country': '', 'lat': None, 'lon': None}
    # les jeux traditionnels de Wikidata de ces trois pays (avec ou sans article)
    q = '''SELECT ?x ?xl ?ctry ?fr WHERE { ?x wdt:P31/wdt:P279* wd:Q676977 . VALUES ?ctry { wd:Q142 wd:Q31 wd:Q39 } ?x wdt:P17|wdt:P495 ?ctry .
  OPTIONAL { ?fr schema:about ?x ; schema:isPartOf <https://fr.wikipedia.org/> } ?x rdfs:label ?xl FILTER(LANG(?xl)="fr") }'''
    for b in wm.sparql(q):
        x = qid(b['x']['value'])
        if x not in rows:
            fr = urllib.parse.unquote(b['fr']['value'].rsplit('/wiki/', 1)[-1]).replace('_', ' ') if b.get('fr') else ''
            rows[x] = {'q': x, 'n': b['xl']['value'], 'ex': '', 'frwiki': fr, 'region': '', 'country': '', 'lat': None, 'lon': None}
    # le lieu de chaque jeu (région, pays) et sa position
    qs = [r['q'] for r in rows.values() if r['q']]
    for i in range(0, len(qs), 150):
        vals = ' '.join('wd:' + x for x in qs[i:i + 150])
        q = f'''SELECT ?x ?p ?pl ?c ?ctry WHERE {{ VALUES ?x {{ {vals} }} ?x wdt:P131|wdt:P276|wdt:P2341|wdt:P495|wdt:P17 ?p .
  OPTIONAL {{ ?p wdt:P625 ?c }} OPTIONAL {{ ?p wdt:P17 ?ctry }} ?p rdfs:label ?pl FILTER(LANG(?pl)="fr") }}'''
        for b in wm.sparql(q):
            r = rows.get(qid(b['x']['value']))
            if not r:
                continue
            p = qid(b['p']['value'])
            if p in COUNTRIES:
                r['country'] = r['country'] or COUNTRIES[p]
                continue
            ctry = COUNTRIES.get(qid(b.get('ctry', {}).get('value')), '')
            lat, lon = point(b.get('c', {}).get('value'))
            if not r['region'] and lat is not None:
                r['region'], r['lat'], r['lon'] = b['pl']['value'], lat, lon
                r['country'] = r['country'] or ctry
    for r in rows.values():
        r['hint'] = ''
        r['far'] = bool(FAR.search(r['ex'] + ' ' + r['region'] + ' ' + r['country'])) or r['region'] in ('Japon', 'Mongolie', 'Irak', 'États-Unis', 'Espagne', 'Pays-Bas', 'Sinj')
        if r['lat'] is None and not r['far']:
            for name, la, lo in REGIONS:
                if re.search(r'\b' + re.escape(name) + r'\b', r['ex']):
                    r['hint'], r['lat'], r['lon'] = name, la, lo
                    break
    out = sorted([r for r in rows.values() if not r['far']], key=lambda r: r['n'].lower())
    fields = ['q', 'n', 'ex', 'frwiki', 'region', 'hint', 'country', 'lat', 'lon']
    meta = {'source': 'Wikipédia en français ; Wikidata', 'licence': 'CC BY-SA 4.0 (phrases de Wikipédia) ; CC0 1.0 (Wikidata)',
            'licence_url': 'https://creativecommons.org/licenses/by-sa/4.0/deed.fr', 'url': 'https://fr.wikipedia.org/wiki/Cat%C3%A9gorie:Jeu_traditionnel_et_r%C3%A9gional',
            'built': time.strftime('%Y-%m-%d'), 'authors': 'les contributeurs de Wikipédia',
            'what': 'Jeux traditionnels et régionaux (quilles, boules, palets, pelote…) : nom, première phrase de l’article de Wikipédia, région d’origine (Wikidata)',
            'fields': fields, 'rows': [[r[k] for k in fields] for r in out]}
    size = wm.write_gz(OUT, 'td-jeux.json.gz', meta)
    print(f'td-jeux : {len(out)} jeux, {sum(1 for r in out if r["lat"] is not None)} placés, {size} octets')


if __name__ == '__main__':
    main()
