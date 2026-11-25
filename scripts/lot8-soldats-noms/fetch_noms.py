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

def fiction():
    rows = []
    for c in CLASSES:
        q = f'''SELECT ?ch ?chLabel ?fn ?fnLabel ?work ?workLabel ?auth ?authLabel ?cre ?creLabel ?date ?wdate WHERE {{
          ?ch wdt:P31 wd:{c}; wdt:P734 ?fn.
          OPTIONAL {{ ?ch wdt:P1441 ?work. OPTIONAL {{ ?work wdt:P50 ?auth }} OPTIONAL {{ ?work wdt:P577 ?wdate }} }}
          OPTIONAL {{ ?ch wdt:P170 ?cre }}
          {LANG} }}'''
        r = N.sparql(q)
        print(c, len(r), file=sys.stderr)
        rows += [{k: v['value'] for k, v in x.items()} for x in r]
    return rows

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
    data = {'fiction': fiction(), 'variants': variants()}
    json.dump(data, open(sys.argv[1], 'w'), ensure_ascii=False)
