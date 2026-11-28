#!/usr/bin/env python3
"""🏰 Lot G — Forts, poudres, sémaphores, lazarets et fontaines Wallace, d'après Wikidata (CC0 1.0).

  tg-forts       sdr      les ouvrages du système Séré de Rivières (P361 = Q3397)
                 maginot  les ouvrages et casemates de la ligne Maginot (P361 = Q162746, ou P31 = Q3358760)
                 vauban   les fortifications de Vauban (architecte P84 = Q216362, ou P361 = Q833781 « Fortifications de Vauban »)
  tg-poudres     poudriere (P31 = Q17504814) et poudrerie (P31 ou P366 = Q385422)
  tg-semaphores  les sémaphores de la Marine (P31 = Q1874098)
  tg-lazarets    les lazarets (P31 ou P366 = Q859247)
  tg-wallace     les fontaines Wallace (P31 = Q829304), dans le monde
Pour chacun : nom, position, année de construction (P571) et de fin (P576), commune (P131 : nom, code INSEE), article de Wikipédia.
Les pavillons d'octroi ne sont PAS ici : ils sont déjà dans l'app (lot B « Bornes, octrois et douanes », et le texte du lot 9).
OpenStreetMap (plus complet) : scripts/telech-g/build_osm.py, sur GitHub.
Lancer : python3 -I scripts/telech-g/build_lieux.py [dossier de sortie] [forts,poudres,semaphores,lazarets,wallace]
"""
import os, re, sys, urllib.parse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'assets', 'data')
ONLY = set((sys.argv[2] if len(sys.argv) > 2 else 'forts,poudres,semaphores,lazarets,wallace').split(','))
qid = lambda u: (u or '').rsplit('/', 1)[-1]
FIELDS = ['k', 'q', 'n', 'lat', 'lon', 'from', 'to', 'commune', 'insee', 'country', 'frwiki']
FR = '?x wdt:P17 wd:Q142 .'
PACKS = {
    'forts': ('tg-forts.json.gz', 'Forts Séré de Rivières, ligne Maginot, fortifications de Vauban', 'https://www.wikidata.org/wiki/Q3397',
              [('sdr', '?x wdt:P361 wd:Q3397 .'), ('maginot', '{ ?x wdt:P361 wd:Q162746 } UNION { ?x wdt:P31 wd:Q3358760 }'),
               ('vauban', '{ ?x wdt:P84 wd:Q216362 } UNION { ?x wdt:P361 wd:Q833781 }')]),
    'poudres': ('tg-poudres.json.gz', 'Poudrières et poudreries', 'https://www.wikidata.org/wiki/Q385422',
                [('poudriere', '?x wdt:P31 wd:Q17504814 . ' + FR), ('poudrerie', '{ ?x wdt:P31 wd:Q385422 } UNION { ?x wdt:P366 wd:Q385422 } ' + FR)]),
    'semaphores': ('tg-semaphores.json.gz', 'Sémaphores de la Marine', 'https://www.wikidata.org/wiki/Q1874098', [('semaphore', '?x wdt:P31 wd:Q1874098 . ' + FR)]),
    'lazarets': ('tg-lazarets.json.gz', 'Lazarets (quarantaine)', 'https://www.wikidata.org/wiki/Q859247', [('lazaret', '{ ?x wdt:P31 wd:Q859247 } UNION { ?x wdt:P366 wd:Q859247 } ' + FR)]),
    'wallace': ('tg-wallace.json.gz', 'Fontaines Wallace', 'https://www.wikidata.org/wiki/Q829304', [('wallace', '?x wdt:P31 wd:Q829304 .')]),
}


def year(v):
    m = re.match(r'^(-?\d{1,4})-', v or '')
    return int(m.group(1)) if m else None


def build(key):
    name, title, url, kinds = PACKS[key]
    rows = {}
    for k, cond in kinds:
        q = f'''SELECT ?x ?xl ?c WHERE {{ {cond} ?x wdt:P625 ?c . OPTIONAL {{ ?x rdfs:label ?xl FILTER(LANG(?xl)="fr") }} }}'''
        for b in wm.sparql(q):
            x = qid(b['x']['value'])
            m = re.match(r'Point\(([-\d.eE]+) ([-\d.eE]+)\)', b['c']['value'])
            if not m or x in rows:
                continue
            rows[x] = {'k': k, 'q': x, 'n': b.get('xl', {}).get('value', ''), 'lat': round(float(m.group(2)), 5), 'lon': round(float(m.group(1)), 5),
                       'from': None, 'to': None, 'commune': '', 'insee': '', 'country': '', 'frwiki': ''}
    ids = list(rows)
    for i in range(0, len(ids), 150):
        vals = ' '.join('wd:' + x for x in ids[i:i + 150])
        q = f'''SELECT ?x ?a ?z ?fr ?cl ?ins ?co ?en WHERE {{ VALUES ?x {{ {vals} }}
          OPTIONAL {{ ?x wdt:P571 ?a }} OPTIONAL {{ ?x wdt:P576 ?z }}
          OPTIONAL {{ ?fr schema:about ?x ; schema:isPartOf <https://fr.wikipedia.org/> }}
          OPTIONAL {{ ?x rdfs:label ?en FILTER(LANG(?en)="mul" || LANG(?en)="en") }}
          OPTIONAL {{ ?x wdt:P17 ?cc . ?cc wdt:P297 ?co }}
          OPTIONAL {{ ?x wdt:P131 ?cm . ?cm rdfs:label ?cl FILTER(LANG(?cl)="fr") OPTIONAL {{ ?cm wdt:P374 ?ins }} }} }}'''
        for b in wm.sparql(q):
            r = rows[qid(b['x']['value'])]
            if b.get('a'):
                y = year(b['a']['value'])
                r['from'] = y if r['from'] is None or (y is not None and y < r['from']) else r['from']
            if b.get('z') and r['to'] is None:
                r['to'] = year(b['z']['value'])
            if b.get('fr') and not r['frwiki']:
                r['frwiki'] = urllib.parse.unquote(b['fr']['value'].rsplit('/wiki/', 1)[-1]).replace('_', ' ')
            if not r['n'] and b.get('en'):
                r['n'] = b['en']['value']
            if b.get('co') and not r['country']:
                r['country'] = b['co']['value']
            if b.get('cl') and (not r['commune'] or (b.get('ins') and not r['insee'])):
                r['commune'], r['insee'] = b['cl']['value'], b.get('ins', {}).get('value', '')
    out = sorted((r for r in rows.values() if r['n'] and not re.match(r'^Q\d+$', r['n'])), key=lambda r: (r['k'], r['n']))
    if not out:
        raise SystemExit(f'{key} : rien de Wikidata — rien n’est écrit')
    meta = {'source': f'Wikidata ({title})', 'licence': 'CC0 1.0', 'licence_url': 'https://creativecommons.org/publicdomain/zero/1.0/deed.fr', 'url': url,
            'built': wm.today(), 'what': f'{title} connus de Wikidata, avec leur position et leurs dates', 'kinds': [k for k, _ in kinds],
            'fields': FIELDS, 'rows': [[r[k] for k in FIELDS] for r in out]}
    size = wm.write_gz(OUT, name, meta)
    print(f'{name} : {len(out)} lieux ' + ', '.join(f'{k} {sum(1 for r in out if r["k"] == k)}' for k, _ in kinds) + f', {size} octets')


def main():
    for k in PACKS:
        if k in ONLY:
            build(k)


if __name__ == '__main__':
    main()
