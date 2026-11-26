#!/usr/bin/env python3
"""🏅 Lot F — Les lauréats du prix de vertu Montyon (Académie française, depuis 1819) : assets/data/tf-montyon.json.gz.

Source : Wikidata (CC0 1.0) : les personnes (et associations) qui ont reçu le « prix de vertu Montyon » (P166 = Q33139180), avec
l'année (qualificatif P585), le lieu de résidence (P551) ou, sinon, de naissance (P19) et sa position, l'article de Wikipédia.
La liste est très incomplète (une vingtaine de noms) : les rapports annuels de l'Académie (domaine public) nomment des milliers de
lauréats, mais il n'existe pas de jeu de données ouvert et structuré : l'app renvoie à Wikisource et à l'Académie (liens seulement).
Ce sont des personnes mortes depuis longtemps, connues par Wikipédia ; rien sur les personnes de la généalogie n'est envoyé.
Lancer : python3 -I scripts/telech-f/build_montyon.py [dossier de sortie]
"""
import os, re, sys, urllib.parse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'assets', 'data')
qid = lambda u: (u or '').rsplit('/', 1)[-1]


def main():
    q = '''SELECT ?x ?xl ?y ?fr ?d WHERE { ?x p:P166 ?st . ?st ps:P166 wd:Q33139180 . OPTIONAL { ?st pq:P585 ?y }
      OPTIONAL { ?fr schema:about ?x ; schema:isPartOf <https://fr.wikipedia.org/> }
      OPTIONAL { ?x schema:description ?d FILTER(LANG(?d)="fr") }
      ?x rdfs:label ?xl FILTER(LANG(?xl)="fr") }'''
    rows = {}
    for b in wm.sparql(q):
        x = qid(b['x']['value'])
        r = rows.setdefault(x, {'q': x, 'n': b['xl']['value'], 'y': None, 'place': '', 'how': '', 'insee': '', 'lat': None, 'lon': None, 'frwiki': '', 'd': b.get('d', {}).get('value', '')})
        if b.get('y'):
            y = int(b['y']['value'][:4])
            r['y'] = y if r['y'] is None else min(r['y'], y)
        if b.get('fr') and not r['frwiki']:
            r['frwiki'] = urllib.parse.unquote(b['fr']['value'].rsplit('/wiki/', 1)[-1]).replace('_', ' ')
    vals = ' '.join('wd:' + x for x in rows)
    for prop, how in (('P19', 'nai'), ('P551', 'res')):  # la résidence (P551) passe avant le lieu de naissance
        q2 = f'SELECT ?x ?pl ?c ?ins WHERE {{ VALUES ?x {{ {vals} }} ?x wdt:{prop} ?p . ?p wdt:P625 ?c ; rdfs:label ?pl FILTER(LANG(?pl)="fr") OPTIONAL {{ ?p wdt:P374 ?ins }} }}'
        for b in wm.sparql(q2):
            r = rows[qid(b['x']['value'])]
            m = re.match(r'Point\(([-\d.eE]+) ([-\d.eE]+)\)', b['c']['value'])
            if m and (r['how'] != how or (b.get('ins') and not r['insee'])):
                r.update({'place': b['pl']['value'], 'how': how, 'insee': b.get('ins', {}).get('value', ''), 'lat': round(float(m.group(2)), 5), 'lon': round(float(m.group(1)), 5)})
    out = sorted(rows.values(), key=lambda r: (r['y'] or 9999, r['n']))
    fields = ['q', 'n', 'y', 'place', 'how', 'insee', 'lat', 'lon', 'frwiki', 'd']
    meta = {'source': 'Wikidata (prix de vertu Montyon, Q33139180)', 'licence': 'CC0 1.0', 'licence_url': 'https://creativecommons.org/publicdomain/zero/1.0/deed.fr',
            'url': 'https://www.wikidata.org/wiki/Q33139180', 'built': wm.today(),
            'what': 'Les lauréats du prix de vertu Montyon connus de Wikidata (liste très incomplète), avec l’année et leur commune',
            'fields': fields, 'rows': [[r[k] for k in fields] for r in out]}
    size = wm.write_gz(OUT, 'tf-montyon.json.gz', meta)
    print(f'tf-montyon : {len(out)} lauréats ({sum(1 for r in out if r["insee"])} avec une commune), {size} octets')


if __name__ == '__main__':
    main()
