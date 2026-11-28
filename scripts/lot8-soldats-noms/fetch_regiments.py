#!/usr/bin/env python3
"""Étape 1 de 🎖️ « L'histoire de son régiment » : télécharge le texte (wikitexte) des articles de Wikipédia en français sur
les régiments et bataillons français (infanterie, cavalerie, artillerie, génie, chasseurs, troupes d'Afrique et coloniales).
Les titres sont essayés numéro par numéro (« 63e régiment d'infanterie (France) », « 63e régiment d'infanterie »…),
plus ceux des régiments français de Wikidata (classe Q63046176 « régiment français »). Sortie : regiments-raw.json (cache).
Usage : python3 fetch_regiments.py SORTIE.json"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import l8b_net as N
import re
HOMO = re.compile(r'\{\{\s*(homonymie|Homonymie|bandeau standard pour page d.homonymie)', re.I)

KINDS = [  # (sigle, nom, numéros)
    ('RI', "régiment d'infanterie", range(1, 422)), ('RIT', "régiment d'infanterie territoriale", range(1, 146)),
    ('RIC', "régiment d'infanterie coloniale", range(1, 80)), ('BCP', 'bataillon de chasseurs à pied', range(1, 122)),
    ('BCA', 'bataillon de chasseurs alpins', range(1, 122)), ('RD', 'régiment de dragons', range(1, 33)),
    ('RC', 'régiment de cuirassiers', range(1, 13)), ('RH', 'régiment de hussards', range(1, 15)),
    ('RCC', 'régiment de chasseurs à cheval', range(1, 25)), ('RCA', "régiment de chasseurs d'Afrique", range(1, 13)),
    ('RSA', 'régiment de spahis algériens', range(1, 10)), ('RA', "régiment d'artillerie", range(1, 70)),
    ('RAC', "régiment d'artillerie de campagne", list(range(1, 63)) + list(range(201, 290))), ('RAL', "régiment d'artillerie lourde", range(81, 143)),
    ('RAP', "régiment d'artillerie à pied", range(1, 12)), ('RAM', "régiment d'artillerie de montagne", range(1, 5)),
    ('RACol', "régiment d'artillerie coloniale", range(1, 25)), ('RG', 'régiment du génie', range(1, 12)),
    ('RZ', 'régiment de zouaves', range(1, 10)), ('RTA', 'régiment de tirailleurs algériens', range(1, 18)),
    ('RTS', 'régiment de tirailleurs sénégalais', range(1, 100)), ('RTM', 'régiment de tirailleurs marocains', range(1, 12)),
    ('RTT', 'régiment de tirailleurs tunisiens', range(1, 12)), ('REI', "régiment étranger d'infanterie", range(1, 14)),
    ('RMLE', 'régiment de marche de la Légion étrangère', range(1, 2)), ('RIM', "régiment d'infanterie de marine", range(1, 40)),
    ('RAMa', "régiment d'artillerie de marine", range(1, 12)), ('RT', 'régiment du train', range(1, 30)),
    ('RIL', "régiment d'infanterie légère", range(1, 32)),
]
def ordinal(n):
    return '1er' if n == 1 else f'{n}e'

def main(out):
    want = {}
    for sig, name, nums in KINDS:
        for n in nums:
            want[f'{ordinal(n)} {name}'] = (sig, n, name)
    wd = N.sparql('''SELECT ?item ?title WHERE { ?c wdt:P279* wd:Q63046176. ?item wdt:P31 ?c.
        ?art schema:about ?item; schema:isPartOf <https://fr.wikipedia.org/>; schema:name ?title. }''')
    extra = sorted({x['title']['value'] for x in wd} - set(want))
    print('titres essayés', len(want), '+ Wikidata', len(extra), file=sys.stderr)
    pages = N.wikitexts(list(want) + extra)
    # une page d'homonymie (« 1er régiment de hussards » : France, Belgique…) : on essaie « … (France) »
    homo = [t for t, p in pages.items() if t in want and HOMO.search(p['text'][:3000])]
    more = N.wikitexts([f'{t} (France)' for t in homo])
    for t in homo:
        pages.pop(t, None)
    for t, p in more.items():
        want[t] = want[t[:-9]]
        pages[t] = p
    res = {}
    for asked, p in pages.items():
        k = p['title']
        if k in res:
            res[k]['asked'].append(asked); continue
        res[k] = {**p, 'asked': [asked], 'kind': list(want.get(asked, ('', 0, '')))}
    json.dump(res, open(out, 'w'), ensure_ascii=False)
    print('articles', len(res), file=sys.stderr)

if __name__ == '__main__':
    main(sys.argv[1])
