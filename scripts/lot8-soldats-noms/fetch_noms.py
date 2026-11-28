#!/usr/bin/env python3
"""Étape 1 de 📚 « Son nom dans les romans » et 🔤 « Les variantes de son nom » : interroge Wikidata (CC0).
 - personnages de fiction (humain de fiction Q15632617, personnage littéraire Q3658341, personnage de fiction Q95074,
   personnage de film Q15773347, personnage d'animation Q15711870, personnage de théâtre Q17624054) qui ont un nom de
   famille (P734), l'œuvre où ils apparaissent (P1441), son auteur (P50) ou le créateur du personnage (P170), l'année (P577) ;
 - noms de famille (Q101352) « dits identiques à » (P460) un autre nom de famille.
Usage : python3 fetch_noms.py SORTIE.json"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import l8b_net as N

CLASSES = ['Q15632617', 'Q3658341', 'Q95074', 'Q15773347', 'Q15711870', 'Q17624054']
LANG = 'SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en,mul,it,es,de". }'

RANGES = [(0, 1000000), (1000000, 4000000), (4000000, 10000000), (10000000, 20000000), (20000000, 30000000), (30000000, 45000000), (45000000, 60000000), (60000000, 75000000), (75000000, 90000000), (90000000, 100000000), (100000000, 110000000), (110000000, 118000000), (118000000, 125000000), (125000000, 200000000)]

def fiction():
    rows = []
    for c in CLASSES:
        for lo, hi in RANGES:
            q = f'''SELECT ?ch ?fn ?work ?auth ?cre ?wdate WHERE {{
              ?ch wdt:P31 wd:{c}; wdt:P734 ?fn.
              BIND(xsd:integer(STRAFTER(STR(?ch), "/Q")) AS ?n) FILTER(?n >= {lo} && ?n < {hi})
              OPTIONAL {{ ?ch wdt:P1441 ?work. OPTIONAL {{ ?work wdt:P50 ?auth }} OPTIONAL {{ ?work wdt:P577 ?wdate }} }}
              OPTIONAL {{ ?ch wdt:P170 ?cre }} }}'''
            r = N.sparql(q)
            print(c, lo, len(r), file=sys.stderr)
            rows += [{k: v['value'] for k, v in x.items()} for x in r]
    return rows

def labels(qids):
    """{Q: {fr, en, mul, native}} par paquets de 300"""
    out = {}
    qids = sorted(set(qids))
    for i in range(0, len(qids), 300):
        vals = ' '.join('wd:' + q for q in qids[i:i + 300])
        r = N.sparql(f'''SELECT ?x ?l ?nat WHERE {{ VALUES ?x {{ {vals} }}
            OPTIONAL {{ ?x rdfs:label ?l FILTER(LANG(?l) IN ("fr", "en", "mul", "it", "es", "de")) }} OPTIONAL {{ ?x wdt:P1705 ?nat }} }}''')
        for x in r:
            q = x['x']['value'].rsplit('/', 1)[-1]
            d = out.setdefault(q, {})
            if 'l' in x: d.setdefault(x['l'].get('xml:lang', ''), x['l']['value'])
            if 'nat' in x: d.setdefault('native', x['nat']['value'])
        print('  libellés', i + 300, '/', len(qids), file=sys.stderr)
    return out

def variants():
    out = []
    # par tranches (ordre des identifiants) pour ne pas dépasser le temps de Wikidata
    for lo, hi in [(0, 2000000), (2000000, 20000000), (20000000, 60000000), (60000000, 100000000), (100000000, 140000000)]:
        q = f'''SELECT ?a ?al ?b ?bl WHERE {{ ?a wdt:P31 wd:Q101352; wdt:P460 ?b. ?b wdt:P31 wd:Q101352.
          BIND(xsd:integer(STRAFTER(STR(?a), "/Q")) AS ?n) FILTER(?n >= {lo} && ?n < {hi})
          OPTIONAL {{ ?a wdt:P1705 ?al }} OPTIONAL {{ ?b wdt:P1705 ?bl }} }}'''
        r = N.sparql(q)
        print('variantes', lo, len(r), file=sys.stderr)
        out += [{k: v['value'] for k, v in x.items()} for x in r]
    return out

if __name__ == '__main__':
    fic = fiction()
    ids = {v.rsplit('/', 1)[-1] for r in fic for k, v in r.items() if k != 'wdate' and v.startswith('http')}
    data = {'fiction': fic, 'labels': labels(ids), 'variants': variants()}
    json.dump(data, open(sys.argv[1], 'w'), ensure_ascii=False)
