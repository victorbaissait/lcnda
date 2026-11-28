#!/usr/bin/env python3
"""⚔️ Lot E — Guerres de Religion, dragonnades, Camisards (assets/data/te-religion.json.gz).

Source : Wikidata (CC0 1.0, https://www.wikidata.org/wiki/Wikidata:Licensing). Gardé : les événements qui font partie (P361,
à n'importe quel niveau) des guerres de Religion (Q673175), des dragonnades (Q1254921) ou de la guerre des Camisards (Q16640426),
ou dont c'est la cause (P828), avec une position (P625, sinon celle du lieu P276) et une date (P585, P580/P582) ; leur sorte
(bataille, massacre, siège…), le lieu, l'article de Wikipédia. Des lieux et des dates : aucun nom de personne.

Lancer : python3 -I scripts/telech-e/build_religion.py [dossier de sortie]   (TE_RAW = cache)
"""
import os, re, sys, time, urllib.parse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'assets', 'data')
ROOTS = {'Q673175': 'guerres', 'Q1254921': 'dragonnades', 'Q16640426': 'camisards'}
qid = lambda u: (u or '').rsplit('/', 1)[-1]


def year(t):
    m = re.match(r'^\+?(-?\d{1,4})-(\d\d)-(\d\d)', t or '')
    return (int(m.group(1)), int(m.group(2)), int(m.group(3))) if m else None


def point(s):
    m = re.match(r'Point\(([-\d.eE]+) ([-\d.eE]+)\)', s or '')
    return (round(float(m.group(2)), 5), round(float(m.group(1)), 5)) if m else (None, None)


def main():
    vals = ' '.join('wd:' + k for k in ROOTS)
    q = f'''SELECT ?x ?xl ?r ?c ?pc ?pl ?d ?s ?e ?tl ?fr WHERE {{
  VALUES ?r {{ {vals} }} {{ ?x wdt:P361+ ?r }} UNION {{ ?x wdt:P828 ?r }}
  OPTIONAL {{ ?x wdt:P625 ?c }} OPTIONAL {{ ?x wdt:P276 ?p . ?p wdt:P625 ?pc . ?p rdfs:label ?pl FILTER(LANG(?pl)="fr") }}
  OPTIONAL {{ ?x wdt:P585 ?d }} OPTIONAL {{ ?x wdt:P580 ?s }} OPTIONAL {{ ?x wdt:P582 ?e }}
  OPTIONAL {{ ?x wdt:P31 ?t . ?t rdfs:label ?tl FILTER(LANG(?tl)="fr") }}
  OPTIONAL {{ ?fr schema:about ?x ; schema:isPartOf <https://fr.wikipedia.org/> }}
  ?x rdfs:label ?xl FILTER(LANG(?xl)="fr")
}}'''
    rows = {}
    for b in wm.sparql(q):
        x = qid(b['x']['value'])
        lat, lon = point(b.get('c', {}).get('value'))
        if lat is None:
            lat, lon = point(b.get('pc', {}).get('value'))
        if lat is None:
            continue
        d = year(b.get('d', {}).get('value')) or year(b.get('s', {}).get('value'))
        e = year(b.get('e', {}).get('value')) or d
        if not d:
            continue
        if b.get('pl', {}).get('value') in ('France', 'royaume de France') and not b.get('c'):
            continue   # « la France » entière : pas un lieu
        r = rows.setdefault(x, {'q': x, 'n': b['xl']['value'], 'k': ROOTS[qid(b['r']['value'])], 'lat': lat, 'lon': lon, 'place': b.get('pl', {}).get('value', ''),
                                'y': d[0], 'date': ('%04d-%02d-%02d' % d if d[1] and (d[1], d[2]) != (1, 1) else ''), 'y2': e[0], 'kind': b.get('tl', {}).get('value', ''), 'frwiki': ''})
        # « 1er janvier » : seulement l'année est connue (précision de Wikidata), pas de date affichée
        if b.get('fr') and not r['frwiki']:
            r['frwiki'] = urllib.parse.unquote(b['fr']['value'].rsplit('/wiki/', 1)[-1]).replace('_', ' ')
    out = sorted((r for r in rows.values() if r['kind'] not in ('guerre de religion', 'guerre', 'campagne militaire') or r['place'] not in ('', 'France')), key=lambda r: (r['y'], r['n']))
    fields = ['q', 'n', 'k', 'lat', 'lon', 'place', 'y', 'date', 'y2', 'kind', 'frwiki']
    meta = {'source': 'Wikidata', 'licence': 'CC0 1.0', 'licence_url': 'https://creativecommons.org/publicdomain/zero/1.0/deed.fr', 'url': 'https://www.wikidata.org/wiki/Q673175',
            'built': time.strftime('%Y-%m-%d'), 'kinds': {'guerres': 'guerres de Religion (1562-1598)', 'dragonnades': 'dragonnades (1681-1685)', 'camisards': 'guerre des Camisards (1702-1710)'},
            'what': 'Batailles, sièges, massacres et autres événements des guerres de Religion, des dragonnades et de la guerre des Camisards : lieu, date',
            'fields': fields, 'rows': [[r[k] for k in fields] for r in out]}
    size = wm.write_gz(OUT, 'te-religion.json.gz', meta)
    from collections import Counter
    print(f'te-religion : {len(out)} événements {dict(Counter(r["k"] for r in out))}, {size} octets')


if __name__ == '__main__':
    main()
