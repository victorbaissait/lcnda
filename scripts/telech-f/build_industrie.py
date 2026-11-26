#!/usr/bin/env python3
"""⚒ 🧂 Lot F — Forges, hauts fourneaux, salines et marais salants connus de Wikidata (tf-forges, tf-salines).

Source : Wikidata (CC0 1.0). Éléments situés en France avec une position :
 - forges : forge (Q40558), haut fourneau (Q181485), usine sidérurgique (Q10832530), fonderie (Q13883136), martinet (Q2121955) ;
 - salines : saline (Q1880708), marais salant (Q244326) ;
avec les dates (création P571, fin P576 / P582), la commune (P131 → P374), l'article de Wikipédia.
Wikidata en connaît peu (une centaine) : l'essentiel viendra d'OpenStreetMap (build_osm.py, sur GitHub) et, quand le pack
« Patrimoine » du département est installé, des notices Mérimée déjà dans l'app (lu par l'écran, pas recopié ici).
Lancer : python3 -I scripts/telech-f/build_industrie.py [dossier de sortie]
"""
import os, re, sys, urllib.parse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'assets', 'data')
qid = lambda u: (u or '').rsplit('/', 1)[-1]
SETS = {'forges': {'Q40558': 'forge', 'Q181485': 'haut-fourneau', 'Q10832530': 'usine sidérurgique', 'Q13883136': 'fonderie', 'Q2121955': 'martinet'},
        'salines': {'Q1880708': 'saline', 'Q244326': 'marais salant'}}


def year(t):
    m = re.match(r'^\+?(-?\d{1,4})-', t or '')
    return int(m.group(1)) if m else None


def build(name, kinds):
    vals = ' '.join('wd:' + k for k in kinds)
    q = f'''SELECT ?x ?xl ?k ?c ?s ?e ?ins ?coml ?fr WHERE {{ VALUES ?k {{ {vals} }} ?x wdt:P31/wdt:P279? ?k ; wdt:P17 wd:Q142 ; wdt:P625 ?c .
      OPTIONAL {{ ?x wdt:P571 ?s }} OPTIONAL {{ ?x wdt:P576|wdt:P582 ?e }}
      OPTIONAL {{ ?x wdt:P131 ?com . ?com wdt:P374 ?ins ; rdfs:label ?coml FILTER(LANG(?coml)="fr") }}
      OPTIONAL {{ ?fr schema:about ?x ; schema:isPartOf <https://fr.wikipedia.org/> }}
      ?x rdfs:label ?xl FILTER(LANG(?xl)="fr") }}'''
    rows = {}
    for b in wm.sparql(q):
        x = qid(b['x']['value'])
        m = re.match(r'Point\(([-\d.eE]+) ([-\d.eE]+)\)', b['c']['value'])
        if not m:
            continue
        r = rows.setdefault(x, {'q': x, 'n': b['xl']['value'], 'k': kinds[qid(b['k']['value'])], 'lat': round(float(m.group(2)), 5), 'lon': round(float(m.group(1)), 5),
                                'from': None, 'to': None, 'insee': '', 'commune': '', 'frwiki': ''})
        s, e = year(b.get('s', {}).get('value')), year(b.get('e', {}).get('value'))
        if s is not None and (r['from'] is None or s < r['from']):
            r['from'] = s
        if e is not None and (r['to'] is None or e > r['to']):
            r['to'] = e
        if b.get('ins') and not r['insee']:
            r['insee'], r['commune'] = b['ins']['value'], b['coml']['value']
        if b.get('fr') and not r['frwiki']:
            r['frwiki'] = urllib.parse.unquote(b['fr']['value'].rsplit('/wiki/', 1)[-1]).replace('_', ' ')
    out = sorted(rows.values(), key=lambda r: (r['k'], r['n']))
    fields = ['q', 'n', 'k', 'lat', 'lon', 'from', 'to', 'insee', 'commune', 'frwiki']
    what = {'forges': 'Forges, hauts fourneaux, martinets et fonderies anciens connus de Wikidata', 'salines': 'Salines et marais salants connus de Wikidata'}[name]
    meta = {'source': 'Wikidata', 'licence': 'CC0 1.0', 'licence_url': 'https://creativecommons.org/publicdomain/zero/1.0/deed.fr', 'url': 'https://www.wikidata.org/wiki/' + next(iter(kinds)),
            'built': wm.today(), 'what': what, 'kinds': kinds, 'fields': fields, 'rows': [[r[k] for k in fields] for r in out]}
    size = wm.write_gz(OUT, f'tf-{name}.json.gz', meta)
    print(f'tf-{name} : {len(out)} lieux, {size} octets')


if __name__ == '__main__':
    for n, k in SETS.items():
        build(n, k)
