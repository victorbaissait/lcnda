#!/usr/bin/env python3
"""🏅 Lot M — les sportifs nés dans une commune de France et les médailles olympiques françaises → ts-athletes.json.gz, ts-jo.json.gz.

Source : Wikidata (CC0).
  ts-athletes : personnes nées (P19) dans une commune de France (lieu avec un code INSEE P374) et qui ont un sport (P641), connues
                d'au moins 5 Wikipédias ou projets (wikibase:sitelinks ≥ 5, pour garder les sportifs dont on parle) ; année de naissance,
                de mort, sport, article de Wikipédia en français.
  ts-jo       : médailles olympiques (P1344 « participant à » une épreuve, qualificatif P166 = médaille d'or Q15243387, d'argent
                Q15889641, de bronze Q15889643) des personnes de nationalité française (P27 = France) ; l'épreuve et son année.
Lancer : python3 -I scripts/telech-m/build_athletes.py [dossier de sortie]
"""
import os, re, sys, urllib.parse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'assets', 'data')
WD = {'source': 'Wikidata', 'licence': 'CC0 1.0', 'licence_url': 'https://creativecommons.org/publicdomain/zero/1.0/deed.fr'}
MEDAL = {'Q15243387': 'or', 'Q15889641': 'argent', 'Q15889643': 'bronze'}


def title(u):
    return urllib.parse.unquote(u.rsplit('/wiki/', 1)[-1]).replace('_', ' ') if u else ''


def athletes(com):
    Q = '''SELECT ?p ?pl ?b ?d ?ins ?sport ?sportl ?sl ?fr WHERE {
 ?p wdt:P19 ?bp . ?bp wdt:P374 ?ins . ?p wdt:P641 ?sport . ?p wikibase:sitelinks ?sl . FILTER(?sl >= 5)
 ?p wdt:P31 wd:Q5 .
 OPTIONAL { ?p wdt:P569 ?b } OPTIONAL { ?p wdt:P570 ?d }
 OPTIONAL { ?fr schema:about ?p ; schema:isPartOf <https://fr.wikipedia.org/> }
 SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en". ?p rdfs:label ?pl . ?sport rdfs:label ?sportl }
}'''
    by = {}
    for r in wm.sparql(Q):
        g = lambda k: r.get(k, {}).get('value', '')
        q = wm.qid(g('p'))
        if re.match(r'^Q\d+$', g('pl')) or g('ins') not in com:
            continue
        cur = by.setdefault(q, {'q': q, 'n': g('pl'), 'b': wm.year(g('b')), 'd': wm.year(g('d')), 'ins': g('ins'), 'sport': set(), 'sl': int(g('sl') or 0), 'fr': title(g('fr'))})
        if g('sportl') and not re.match(r'^Q\d+$', g('sportl')):
            cur['sport'].add(g('sportl'))
    rows = []
    for a in sorted(by.values(), key=lambda a: (a['ins'], a['b'] or 0)):
        n, la, lo = com[a['ins']]
        rows.append([a['q'], a['n'], a['b'], a['d'], a['ins'], n, la, lo, ', '.join(sorted(a['sport']))[:80], a['sl'], a['fr']])
    meta = {**WD, 'url': 'https://www.wikidata.org/wiki/Property:P641', 'built': wm.today(),
            'what': 'Sportifs nés dans une commune de France (Wikidata : P19 lieu de naissance avec un code INSEE, P641 sport ; au moins 5 liens de site)',
            'fields': ['q', 'n', 'b', 'd', 'ins', 'commune', 'lat', 'lon', 'sport', 'sl', 'fr'], 'rows': rows}
    size = wm.write_gz(OUT, 'ts-athletes.json.gz', meta)
    print(f'ts-athletes : {len(rows)} sportifs, {len({r[4] for r in rows})} communes, {size} octets')


def medals(com):
    Q = '''SELECT ?p ?pl ?m ?ev ?evl ?evd ?b ?d ?ins ?fr WHERE {
 VALUES ?m { wd:Q15243387 wd:Q15889641 wd:Q15889643 }
 ?p p:P1344 ?st . ?st ps:P1344 ?ev ; pq:P166 ?m . ?p wdt:P27 wd:Q142 .
 OPTIONAL { ?ev wdt:P585|wdt:P580 ?evd } OPTIONAL { ?p wdt:P569 ?b } OPTIONAL { ?p wdt:P570 ?d }
 OPTIONAL { ?p wdt:P19/wdt:P374 ?ins }
 OPTIONAL { ?fr schema:about ?p ; schema:isPartOf <https://fr.wikipedia.org/> }
 SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en". ?p rdfs:label ?pl . ?ev rdfs:label ?evl }
}'''
    seen, rows = set(), []
    for r in wm.sparql(Q):
        g = lambda k: r.get(k, {}).get('value', '')
        k = (g('p'), g('ev'), g('m'))
        if k in seen or re.match(r'^Q\d+$', g('pl')):
            continue
        seen.add(k)
        y = wm.year(g('evd'))
        if y is None:
            m = re.search(r'\b(18|19|20)\d\d\b', g('evl'))
            y = int(m.group(0)) if m else None
        ins = g('ins') if g('ins') in com else ''
        n, la, lo = com[ins] if ins else ('', None, None)
        winter = 1 if re.search(r"(?i)hiver|winter", g('evl')) else 0
        rows.append([wm.qid(g('p')), g('pl'), MEDAL[wm.qid(g('m'))], y, g('evl'), wm.qid(g('ev')), winter, wm.year(g('b')), wm.year(g('d')), ins, n, la, lo, title(g('fr'))])
    rows.sort(key=lambda r: (r[3] or 0, r[4], r[1]))
    meta = {**WD, 'url': 'https://www.wikidata.org/wiki/Q15243387', 'built': wm.today(),
            'what': 'Médailles olympiques des sportifs de nationalité française (Wikidata : P1344 épreuve + qualificatif P166 médaille) ; leur commune de naissance',
            'fields': ['q', 'n', 'medal', 'y', 'event', 'evq', 'winter', 'b', 'd', 'ins', 'commune', 'lat', 'lon', 'fr'], 'rows': rows}
    size = wm.write_gz(OUT, 'ts-jo.json.gz', meta)
    print(f'ts-jo : {len(rows)} médailles, {len({r[0] for r in rows})} sportifs, {size} octets')


if __name__ == '__main__':
    c = wm.communes(ROOT)
    medals(c)
    athletes(c)
