#!/usr/bin/env python3
"""🖼 Lot K — l'annuaire des musées du monde (assets/data/tk-musees_<continent>.json.gz : eu, am, as, af, oc).

Source : Wikidata (CC0 — https://www.wikidata.org/wiki/Wikidata:Copyright, relu à chaque fabrication) : les éléments qui sont
un musée (P31/P279* Q33506), avec une position (P625) : nom, sorte de musée, commune (P131), pays, année de création (P571),
site officiel (P856, http(s) seulement). Un pays à la fois (service de requêtes : une requête à la fois, une minute entre deux,
Retry-After respecté) — sur GitHub (.github/workflows/telech-k.yml), le service étant saturé depuis l'atelier.

Lancer : python3 -I scripts/telech-k/build_musees.py [dossier de sortie] [eu am as af oc]   (TK_RAW = cache)
"""
import os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm
from build_patrimoine import licence

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ARGS = sys.argv[1:]
OUT = ARGS[0] if ARGS and os.path.isdir(ARGS[0]) else os.path.join(ROOT, 'assets', 'data')
CONT = {'eu': ('Q46', 'Europe'), 'am': ('Q49|Q18', 'Amériques'), 'as': ('Q48', 'Asie'), 'af': ('Q15', 'Afrique'), 'oc': ('Q55643', 'Océanie')}
WANT = [a for a in ARGS if a in CONT] or list(CONT)


def countries(cont):
    vals = ' '.join(f'wd:{q}' for q in cont.split('|'))
    q = f'SELECT DISTINCT ?c ?l WHERE {{ VALUES ?k {{ {vals} }} ?c wdt:P31 wd:Q6256 ; wdt:P30 ?k . OPTIONAL {{ ?c rdfs:label ?l FILTER(LANG(?l) = "fr") }} }}'
    return [(wm.qid(b['c']['value']), b.get('l', {}).get('value', '')) for b in wm.sparql(q)]


def museums(cq):
    q = (f'SELECT ?x ?l ?c ?t ?tl ?pl ?pll ?y ?web WHERE {{ ?x wdt:P17 wd:{cq} ; wdt:P31 ?t ; wdt:P625 ?c . ?t wdt:P279* wd:Q33506 .'
         f' OPTIONAL {{ ?t rdfs:label ?tl FILTER(LANG(?tl) = "fr") }} OPTIONAL {{ ?x wdt:P571 ?y }} OPTIONAL {{ ?x wdt:P856 ?web }}'
         f' OPTIONAL {{ ?x wdt:P131 ?pl . OPTIONAL {{ ?pl rdfs:label ?pll FILTER(LANG(?pll) IN ("fr","en")) }} }}'
         f' OPTIONAL {{ ?x rdfs:label ?l FILTER(LANG(?l) IN ("fr","en","mul","de","nl","it","es","pt","sv","da","nb","fi","pl","cs","ja","zh")) }} }}')
    out = {}
    for b in wm.sparql(q):
        x = wm.qid(b['x']['value'])
        lat, lon = wm.point(b['c']['value'])
        r = out.setdefault(x, {'q': x, 'n': '', 'nl': '', 'lat': lat, 'lon': lon, 't': '', 'pl': '', 'y': None, 'web': ''})
        l = b.get('l')
        if l and (not r['n'] or l.get('xml:lang') == 'fr' or (l.get('xml:lang') == 'en' and r['nl'] != 'fr')):
            r['n'], r['nl'] = l['value'], l.get('xml:lang')
        if b.get('tl') and not r['t']:
            r['t'] = b['tl']['value']
        if b.get('pll') and (not r['pl'] or b['pll'].get('xml:lang') == 'fr'):
            r['pl'] = b['pll']['value']
        y = wm.year(b.get('y', {}).get('value')) if b.get('y') else None
        if y is not None and (r['y'] is None or y < r['y']):
            r['y'] = y
        w = b.get('web', {}).get('value', '')
        if w and not r['web'] and re.match(r'^https?://[^\s"<>]+$', w) and len(w) < 200:
            r['web'] = w
    return [r for r in out.values() if r['n'] and r['lat'] is not None]


def main():
    licence()
    for k in WANT:
        cont, label = CONT[k]
        cs = countries(cont)
        rows, kinds, places, cys = [], {}, {}, []
        for cq, cl in cs:
            try:
                ms = museums(cq)
            except RuntimeError as e:
                print(f'  {cl or cq} : raté ({e})', flush=True)
                continue
            ci = len(cys)
            cys.append(cl or cq)
            for r in ms:
                rows.append([r['q'], r['n'], r['lat'], r['lon'], kinds.setdefault(r['t'], len(kinds)), places.setdefault(r['pl'], len(places)) if r['pl'] else -1, ci, r['y'], r['web']])
            print(f'  {cl or cq} : {len(ms)} musées', flush=True)
        rows.sort(key=lambda r: (r[1].lower(), r[0]))
        meta = {'source': f'Wikidata — musées avec une position : {label}', 'licence': 'CC0 1.0', 'licence_url': 'https://creativecommons.org/publicdomain/zero/1.0/deed.fr',
                'url': 'https://www.wikidata.org/wiki/Q33506', 'licence_page': 'https://www.wikidata.org/wiki/Wikidata:Copyright', 'built': wm.today(),
                'title': f'Musées du monde : {label} (Wikidata)', 'continent': k, 'what': 'Nom, position, sorte de musée, commune, pays, année de création, site officiel',
                'kinds': list(kinds), 'places': list(places), 'countries': cys, 'fields': ['q', 'n', 'lat', 'lon', 't', 'pl', 'cy', 'y', 'web'], 'rows': rows}
        size = wm.write_gz(OUT, f'tk-musees_{k}.json.gz', meta)
        print(f'tk-musees_{k} : {len(rows)} musées, {size} octets', flush=True)


if __name__ == '__main__':
    main()
