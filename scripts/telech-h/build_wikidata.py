#!/usr/bin/env python3
"""Lot H — Les objets du pays connus de Wikidata (CC0 1.0), un fichier par sujet :
 - th-kiosques    : kiosques à musique (Q3126170) + sociétés de musique (fanfare Q1426710, orchestre d'harmonie Q762048) ;
 - th-marianne    : monuments à la République, statues et bustes de Marianne (dépeint P180 = Marianne Q325956, ou nom
                    « Monument à la République », « Statue de la République », « Marianne ») ;
 - th-halles      : halles et marchés couverts (Q2080521 et ses sous-classes) ;
 - th-funiculaires: funiculaires (Q142031) et ponts transbordeurs (Q506412) ;
 - th-eclusieres  : maisons éclusières (Q27685913) et gares d'eau (recherche « gare d'eau ») ;
 - th-tramways    : tramways, chemins de fer secondaires et d'intérêt local, lignes disparues (date de fin P576/P582 avant 1975) ;
 - th-ateliers    : coutelleries, ganteries, mégisseries, vanneries, chocolateries, biscuiteries, conserveries (secteur P452,
                    produit P1056 ou nature P31), avec la date de fondation (P571) et la commune du siège (P159) ;
Seulement la France (P17 = Q142) et les éléments placés (P625 ; sinon le siège P159 ; sinon la commune P131).
Lancer : python3 -I scripts/telech-h/build_wikidata.py [dossier de sortie] [sujet…]
"""
import os, re, sys, urllib.parse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'assets', 'data')
ONLY = set(sys.argv[2:])
qid = lambda u: (u or '').rsplit('/', 1)[-1]
PT = re.compile(r'Point\(([-\d.eE]+) ([-\d.eE]+)\)')


def year(t):
    m = re.match(r'^\+?(-?\d{1,4})-', t or '')
    return int(m.group(1)) if m else None


def ll(v):
    m = PT.match(v or '')
    return (round(float(m.group(2)), 5), round(float(m.group(1)), 5)) if m else None


# ?x est lié par le « where » de chaque sujet ; le reste est commun
COMMON = '''
  ?x wdt:P17 wd:Q142 .
  OPTIONAL { ?x wdt:P625 ?c0 } OPTIONAL { ?x wdt:P159 ?hq . ?hq wdt:P625 ?c1 } OPTIONAL { ?x wdt:P131 ?loc . ?loc wdt:P625 ?c2 }
  OPTIONAL { ?x wdt:P571 ?s } OPTIONAL { ?x wdt:P576|wdt:P582|wdt:P3999 ?e } OPTIONAL { ?x wdt:P1619 ?o }
  OPTIONAL { ?x wdt:P159|wdt:P131 ?com . ?com wdt:P374 ?ins ; rdfs:label ?coml FILTER(LANG(?coml)="fr") }
  OPTIONAL { ?x wdt:P1435 ?mh }
  OPTIONAL { ?fr schema:about ?x ; schema:isPartOf <https://fr.wikipedia.org/> }
  ?x rdfs:label ?xl FILTER(LANG(?xl)="fr") }'''
SELECT = 'SELECT ?x ?xl ?k ?c0 ?c1 ?c2 ?s ?e ?o ?ins ?coml ?fr ?mh WHERE { '

SUBJECTS = {
    'kiosques': {
        'what': 'Kiosques à musique et sociétés de musique (fanfares, harmonies) connus de Wikidata',
        'url': 'https://www.wikidata.org/wiki/Q3126170',
        'parts': [('kiosque', '?x wdt:P31/wdt:P279* wd:Q3126170 . BIND("kiosque" AS ?k)'),
                  ('fanfare', 'VALUES ?t { wd:Q1426710 wd:Q762048 } ?x wdt:P31 ?t . BIND("fanfare" AS ?k)')]},
    'marianne': {
        'what': 'Monuments à la République, statues et bustes de Marianne connus de Wikidata',
        'url': 'https://www.wikidata.org/wiki/Q325956',
        'parts': [('marianne', '?x wdt:P180 wd:Q325956 . VALUES ?t { wd:Q860861 wd:Q179700 wd:Q241045 wd:Q483453 wd:Q4989906 wd:Q575759 } ?x wdt:P31 ?t . BIND("marianne" AS ?k)'),
                  ('republique', 'VALUES ?t { wd:Q860861 wd:Q179700 wd:Q241045 wd:Q483453 wd:Q4989906 } ?x wdt:P31 ?t ; rdfs:label ?lab . FILTER(LANG(?lab)="fr" && REGEX(?lab, "^(Monument (à|de) la République|Statue de la République|Marianne|Buste de Marianne|Fontaine de la République)", "i")) BIND("republique" AS ?k)')]},
    'halles': {
        'what': 'Halles et marchés couverts connus de Wikidata',
        'url': 'https://www.wikidata.org/wiki/Q2080521',
        'parts': [('halle', '?x wdt:P31/wdt:P279* wd:Q2080521 . BIND("halle" AS ?k)')],
        'keep': lambda r: re.search(r'(?i)hall|march|carreau|criée|minage|grenette|cohue|poissonnerie', r['n']) is not None},
    'funiculaires': {
        'what': 'Funiculaires et ponts transbordeurs connus de Wikidata',
        'url': 'https://www.wikidata.org/wiki/Q142031',
        'parts': [('funiculaire', '?x wdt:P31/wdt:P279* wd:Q142031 . BIND("funiculaire" AS ?k)'),
                  ('transbordeur', '?x wdt:P31/wdt:P279* wd:Q506412 . BIND("transbordeur" AS ?k)')]},
    'eclusieres': {
        'what': 'Maisons éclusières et gares d’eau connues de Wikidata',
        'url': 'https://www.wikidata.org/wiki/Q27685913',
        'parts': [('maison', '?x wdt:P31/wdt:P279* wd:Q27685913 . BIND("maison" AS ?k)'),
                  ('gare', 'SERVICE wikibase:mwapi { bd:serviceParam wikibase:endpoint "www.wikidata.org" ; wikibase:api "EntitySearch" ; mwapi:search "gare d\'eau" ; mwapi:language "fr" . ?x wikibase:apiOutputItem mwapi:item . } ?x rdfs:label ?lab . FILTER(LANG(?lab)="fr" && REGEX(?lab, "gare d.eau", "i")) BIND("gare" AS ?k)')]},
    'tramways': {
        'what': 'Tramways, chemins de fer secondaires et lignes disparues (fermés avant 1975) connus de Wikidata',
        'url': 'https://www.wikidata.org/wiki/Q32680449',
        'parts': [('tramway', 'VALUES ?t { wd:Q12162186 wd:Q15145593 } ?x wdt:P31 ?t . BIND("tramway" AS ?k)'),
                  ('secondaire', 'VALUES ?t { wd:Q32680449 wd:Q14866374 } ?x wdt:P31 ?t . BIND("secondaire" AS ?k)'),
                  ('ligne', '?x wdt:P31 wd:Q728937 ; wdt:P576|wdt:P582|wdt:P3999 ?e0 . FILTER(YEAR(?e0) < 1975) BIND("ligne" AS ?k)')],
        'keep': lambda r: r['to'] is not None and r['to'] < 1975},
    'ateliers': {
        'what': 'Coutelleries, ganteries, mégisseries, vanneries, chocolateries, biscuiteries et conserveries connues de Wikidata',
        'url': 'https://www.wikidata.org/wiki/Q1436188',
        'parts': [(k, f'VALUES ?v {{ {v} }} {{ ?x wdt:P452 ?v }} UNION {{ ?x wdt:P1056 ?v }} UNION {{ ?x wdt:P31 ?v }} BIND("{k}" AS ?k)') for k, v in [
            ('coutellerie', 'wd:Q1436188 wd:Q32489 wd:Q136130435'), ('ganterie', 'wd:Q28932195 wd:Q169031'), ('megisserie', 'wd:Q3332813'),
            ('vannerie', 'wd:Q373017 wd:Q201097 wd:Q1081013'), ('chocolaterie', 'wd:Q762548 wd:Q195'), ('biscuiterie', 'wd:Q101049500 wd:Q13270'),
            ('conserverie', 'wd:Q1922209 wd:Q297296')]]},
}
FIELDS = ['q', 'n', 'k', 'lat', 'lon', 'from', 'to', 'insee', 'commune', 'frwiki', 'mh']


def build(name, cfg):
    rows = {}
    for part, where in cfg['parts']:
        n0 = len(rows)
        for b in wm.sparql(SELECT + where + COMMON):
            x = qid(b['x']['value'])
            if x in rows and rows[x]['k'] != b['k']['value'] and rows[x]['k'] in ('kiosque', 'marianne', 'maison', 'funiculaire', 'halle'):
                continue  # le premier sujet gagne
            pos = ll(b.get('c0', {}).get('value')) or ll(b.get('c1', {}).get('value')) or ll(b.get('c2', {}).get('value'))
            if not pos:
                continue
            r = rows.setdefault(x, {'q': x, 'n': b['xl']['value'], 'k': b['k']['value'], 'lat': pos[0], 'lon': pos[1], 'from': None, 'to': None,
                                    'insee': '', 'commune': '', 'frwiki': '', 'mh': 0, '_own': bool(b.get('c0'))})
            if b.get('c0') and not r['_own']:
                r['lat'], r['lon'], r['_own'] = *ll(b['c0']['value']), True
            s, e = year(b.get('s', {}).get('value')) or year(b.get('o', {}).get('value')), year(b.get('e', {}).get('value'))
            if s is not None and (r['from'] is None or s < r['from']):
                r['from'] = s
            if e is not None and (r['to'] is None or e > r['to']):
                r['to'] = e
            if b.get('ins') and not r['insee']:
                r['insee'], r['commune'] = b['ins']['value'], b['coml']['value']
            if b.get('fr') and not r['frwiki']:
                r['frwiki'] = urllib.parse.unquote(b['fr']['value'].rsplit('/wiki/', 1)[-1]).replace('_', ' ')
            if b.get('mh'):
                r['mh'] = 1
        print(f'  {name} · {part} → {len(rows) - n0}')
    keep = cfg.get('keep', lambda r: True)
    out = sorted((r for r in rows.values() if keep(r) and 41 < r['lat'] < 51.5 and -5.5 < r['lon'] < 10), key=lambda r: (r['k'], r['n']))
    meta = {'source': 'Wikidata', 'licence': 'CC0 1.0', 'licence_url': 'https://creativecommons.org/publicdomain/zero/1.0/deed.fr', 'url': cfg['url'],
            'built': wm.today(), 'what': cfg['what'], 'queries': [w for _, w in cfg['parts']], 'fields': FIELDS, 'rows': [[r[k] for k in FIELDS] for r in out]}
    size = wm.write_gz(OUT, f'th-{name}.json.gz', meta)
    print(f'th-{name} : {len(out)} lieux, {size} octets')


if __name__ == '__main__':
    for n, c in SUBJECTS.items():
        if not ONLY or n in ONLY:
            build(n, c)
