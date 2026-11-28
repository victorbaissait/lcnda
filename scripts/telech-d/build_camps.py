#!/usr/bin/env python3
"""🕯 Lot D — Camps d'internement 1939-1946 et maisons d'enfants cachés en France (assets/data/td-camps.json.gz).

Source : Wikidata (CC0 1.0), service SPARQL. Gardé :
 - les camps : nature (P31) « camp d'internement français » (Q2935245), « camp de concentration » (Q152081) ou « camp de transit »
   (Q1264690), situés en France (P17 = Q142) ou dans l'Algérie et le Maroc de l'époque (camps de Vichy : Q262, Q1028), avec
   une position (P625) ; dates d'ouverture et de fermeture (P580/P571, P582/P576), commune (P131 → P374), article de Wikipédia ;
 - les maisons d'enfants (OSE, Secours suisse…) qui ont caché des enfants juifs : une courte liste d'éléments Wikidata nommés
   ci-dessous (MAISONS), vérifiés un par un (leur article de Wikipédia le dit). La liste est incomplète, et le dit à l'écran.
Ce sont des LIEUX : aucun nom de personne internée ou cachée n'est copié. L'app renvoie au Mémorial de la Shoah, à l'OSE, aux
Archives (liens seulement).

Lancer : python3 scripts/telech-d/build_camps.py [dossier de sortie]   (TD_RAW = cache des réponses)
"""
import os, re, sys, time, urllib.parse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'assets', 'data')
CAMPS = {'Q2935245': 'camp', 'Q152081': 'camp', 'Q1264690': 'transit'}
COUNTRIES = {'Q142': 'France', 'Q262': 'Algérie', 'Q1028': 'Maroc'}
# maisons d'enfants (vérifiées : Wikipédia) — Izieu, Chabannes (OSE), la Hille (Secours suisse), le Masgelier et Montintin (OSE), Sèvres
MAISONS = ['Q3333154', 'Q5118754', 'Q15794453', 'Q60836661', 'Q124032296', 'Q3279244']
qid = lambda u: (u or '').rsplit('/', 1)[-1]


def year(t):
    m = re.match(r'^\+?(-?\d{1,4})-', t or '')
    return int(m.group(1)) if m else None


def point(s):
    m = re.match(r'Point\(([-\d.eE]+) ([-\d.eE]+)\)', s or '')
    return (round(float(m.group(2)), 5), round(float(m.group(1)), 5)) if m else (None, None)


TAIL = '''
  OPTIONAL { ?x wdt:P131 ?com . OPTIONAL { ?com wdt:P374 ?ins } ?com rdfs:label ?coml FILTER(LANG(?coml)="fr") }
  OPTIONAL { ?x wdt:P580|wdt:P571 ?s } OPTIONAL { ?x wdt:P582|wdt:P576 ?e }
  OPTIONAL { ?fr schema:about ?x ; schema:isPartOf <https://fr.wikipedia.org/> }
  ?x rdfs:label ?xl FILTER(LANG(?xl)="fr")
}'''


def collect(bindings, rows, kind_of):
    for b in bindings:
        x = qid(b['x']['value'])
        lat, lon = point(b.get('c', {}).get('value'))
        if lat is None:
            continue
        r = rows.get(x)
        if not r:
            r = rows[x] = {'q': x, 'n': b['xl']['value'], 'kind': kind_of(b), 'lat': lat, 'lon': lon, 'country': COUNTRIES.get(qid(b.get('ctry', {}).get('value')), 'France'),
                           'insee': '', 'commune': '', 'from': None, 'to': None, 'frwiki': ''}
        if b.get('ins') and not r['insee']:
            r['insee'] = b['ins']['value']
        if b.get('coml') and not r['commune']:
            r['commune'] = b['coml']['value']
        s, e = year(b.get('s', {}).get('value')), year(b.get('e', {}).get('value'))
        if s is not None and (r['from'] is None or s < r['from']):
            r['from'] = s
        if e is not None and (r['to'] is None or e > r['to']):
            r['to'] = e
        if b.get('fr') and not r['frwiki']:
            r['frwiki'] = urllib.parse.unquote(b['fr']['value'].rsplit('/wiki/', 1)[-1]).replace('_', ' ')


def main():
    rows = {}
    vals, ctry = ' '.join('wd:' + k for k in CAMPS), ' '.join('wd:' + k for k in COUNTRIES)
    q1 = f'SELECT ?x ?xl ?k ?c ?ctry ?ins ?coml ?s ?e ?fr WHERE {{ VALUES ?k {{ {vals} }} VALUES ?ctry {{ {ctry} }} ?x wdt:P31 ?k ; wdt:P17 ?ctry ; wdt:P625 ?c .' + TAIL
    collect(wm.sparql(q1), rows, lambda b: CAMPS[qid(b['k']['value'])])
    q2 = 'SELECT ?x ?xl ?c ?ins ?coml ?s ?e ?fr WHERE { VALUES ?x { ' + ' '.join('wd:' + m for m in MAISONS) + ' } ?x wdt:P625 ?c .' + TAIL
    collect(wm.sparql(q2), rows, lambda b: 'enfants')
    # un camp de concentration nazi en France (Natzweiler-Struthof) ou d'une autre guerre : gardé, l'écran donne les dates
    out = [r for r in rows.values() if r['kind'] == 'enfants' or r['to'] is None or r['to'] >= 1939]
    out = [r for r in out if r['from'] is None or r['from'] <= 1946]
    out.sort(key=lambda r: (r['kind'] != 'enfants', r['country'], r['n']))
    fields = ['q', 'n', 'kind', 'lat', 'lon', 'country', 'insee', 'commune', 'from', 'to', 'frwiki']
    meta = {'source': 'Wikidata', 'licence': 'CC0 1.0', 'licence_url': 'https://creativecommons.org/publicdomain/zero/1.0/deed.fr', 'url': 'https://www.wikidata.org/wiki/Q2935245',
            'built': time.strftime('%Y-%m-%d'), 'kinds': {'camp': 'camp d’internement', 'transit': 'camp de transit', 'enfants': 'maison d’enfants'},
            'what': 'Camps d’internement et de transit en France (et en Algérie, au Maroc) ouverts entre 1939 et 1946, et quelques maisons d’enfants qui ont caché des enfants juifs (Wikidata)',
            'fields': fields, 'rows': [[r[k] for k in fields] for r in out]}
    size = wm.write_gz(OUT, 'td-camps.json.gz', meta)
    from collections import Counter
    print(f'td-camps : {len(out)} lieux {dict(Counter(r["kind"] for r in out))}, {size} octets')


if __name__ == '__main__':
    main()
