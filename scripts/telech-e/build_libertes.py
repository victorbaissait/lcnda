#!/usr/bin/env python3
"""🌳 Lot E — Arbres de la Liberté (assets/data/te-libertes.json.gz).

Sources :
 - Wikidata (CC0 1.0, https://www.wikidata.org/wiki/Wikidata:Licensing) : les éléments « arbre de la liberté » (Q55100046 et ses
   sous-classes) et les arbres (Q10884 et sous-classes) de France, Belgique, Suisse, Luxembourg dont le nom contient « liberté » ;
   année de plantation (P571), commune (P131 → P374), article de Wikipédia.
 - OpenStreetMap (ODbL 1.0, © les contributeurs d'OpenStreetMap, https://www.openstreetmap.org/copyright) : arbres et
   monuments nommés « Arbre de la Liberté » (Overpass) ; seulement avec --osm (sur GitHub : overpass-api.de n'est pas joignable
   depuis l'atelier de développement).
L'année (1792, 1830, 1848, 1889, 1989…) vient de P571, de « start_date », ou du nom (« … de 1848 ») : sinon inconnue.

Lancer : python3 -I scripts/telech-e/build_libertes.py [dossier de sortie] [--osm]   (TE_RAW = cache)
"""
import json, os, re, sys, time, urllib.parse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
OUT = ARGS[0] if ARGS else os.path.join(ROOT, 'assets', 'data')
OSM = '--osm' in sys.argv
qid = lambda u: (u or '').rsplit('/', 1)[-1]
YEAR = re.compile(r'\b(17[89]\d|18\d\d|19\d\d|20[012]\d)\b')


def point(s):
    m = re.match(r'Point\(([-\d.eE]+) ([-\d.eE]+)\)', s or '')
    return (round(float(m.group(2)), 5), round(float(m.group(1)), 5)) if m else (None, None)


def wikidata():
    tail = '''
  OPTIONAL { ?x wdt:P571 ?d } OPTIONAL { ?x wdt:P131 ?com . OPTIONAL { ?com wdt:P374 ?ins } ?com rdfs:label ?coml FILTER(LANG(?coml)="fr") }
  OPTIONAL { ?fr schema:about ?x ; schema:isPartOf <https://fr.wikipedia.org/> }
}'''
    q1 = 'SELECT ?x ?xl ?c ?d ?ins ?coml ?fr WHERE { ?x wdt:P31/wdt:P279* wd:Q55100046 ; wdt:P625 ?c . VALUES ?ctry { wd:Q142 wd:Q31 wd:Q39 wd:Q32 } ?x wdt:P17 ?ctry . OPTIONAL { ?x rdfs:label ?xl FILTER(LANG(?xl)="fr") }' + tail
    q2 = 'SELECT ?x ?xl ?c ?d ?ins ?coml ?fr WHERE { VALUES ?ctry { wd:Q142 wd:Q31 wd:Q39 wd:Q32 } ?x wdt:P31/wdt:P279* wd:Q10884 ; wdt:P17 ?ctry ; wdt:P625 ?c ; rdfs:label ?xl FILTER(LANG(?xl)="fr" && CONTAINS(LCASE(?xl), "libert"))' + tail
    rows = {}
    for b in wm.sparql(q1) + wm.sparql(q2):
        x = qid(b['x']['value']); lat, lon = point(b['c']['value'])
        if lat is None:
            continue
        r = rows.setdefault(x, {'id': x, 'src': 'wd', 'n': b.get('xl', {}).get('value') or 'Arbre de la Liberté', 'lat': lat, 'lon': lon, 'y': None, 'insee': '', 'commune': '', 'frwiki': ''})
        d = b.get('d', {}).get('value', '')
        m = re.match(r'^\+?(\d{4})-', d)
        if m and r['y'] is None:
            r['y'] = int(m.group(1))
        if r['y'] is None:
            m = YEAR.search(r['n']); r['y'] = int(m.group(1)) if m else None
        if b.get('ins') and not r['insee']:
            r['insee'] = b['ins']['value']
        if b.get('coml') and not r['commune']:
            r['commune'] = b['coml']['value']
        if b.get('fr') and not r['frwiki']:
            r['frwiki'] = urllib.parse.unquote(b['fr']['value'].rsplit('/wiki/', 1)[-1]).replace('_', ' ')
    return list(rows.values())


def osm():
    q = '''[out:json][timeout:300];
(area["ISO3166-1"="FR"][admin_level=2];area["ISO3166-1"="BE"][admin_level=2];area["ISO3166-1"="CH"][admin_level=2];area["ISO3166-1"="LU"][admin_level=2];)->.a;
(nwr["name"~"[Aa]rbre de la [Ll]ibert"](area.a);nwr["memorial"="tree"]["name"~"[Ll]ibert"](area.a);nwr["natural"="tree"]["name"~"[Ll]ibert"](area.a););
out center tags;'''
    j = json.loads(wm.get('https://overpass-api.de/api/interpreter', 'application/json', urllib.parse.urlencode({'data': q})))
    out = []
    for e in j.get('elements', []):
        t = e.get('tags', {}); lat = e.get('lat') or e.get('center', {}).get('lat'); lon = e.get('lon') or e.get('center', {}).get('lon')
        if lat is None:
            continue
        y = None
        for s in (t.get('start_date', ''), t.get('name', ''), t.get('inscription', ''), t.get('description', '')):
            m = YEAR.search(s)
            if m:
                y = int(m.group(1)); break
        out.append({'id': f"{e['type'][0]}{e['id']}", 'src': 'osm', 'n': t.get('name', 'Arbre de la Liberté')[:120], 'lat': round(lat, 5), 'lon': round(lon, 5), 'y': y,
                    'insee': t.get('ref:INSEE', ''), 'commune': t.get('addr:city', ''), 'frwiki': (t.get('wikipedia', '')[3:] if t.get('wikipedia', '').startswith('fr:') else '')})
    return out


def main():
    rows = wikidata()
    if OSM:
        seen = [(r['lat'], r['lon']) for r in rows]
        for r in osm():
            if not any(abs(r['lat'] - a) < .002 and abs(r['lon'] - b) < .003 for a, b in seen):   # le même arbre dans les deux bases : une fois
                rows.append(r)
    else:
        old = os.path.join(OUT, 'te-libertes.json.gz')   # sans --osm : on garde les arbres OSM déjà fabriqués sur GitHub
        if os.path.exists(old):
            import gzip
            prev = json.loads(gzip.open(old).read())
            rows += [dict(zip(prev['fields'], r)) for r in prev['rows'] if r[1] == 'osm']
    rows.sort(key=lambda r: (r['n'], r['id']))
    fields = ['id', 'src', 'n', 'lat', 'lon', 'y', 'insee', 'commune', 'frwiki']
    has_osm = any(r['src'] == 'osm' for r in rows)
    meta = {'source': 'Wikidata' + (' ; OpenStreetMap' if has_osm else ''), 'licence': 'CC0 1.0 (Wikidata)' + (' ; ODbL 1.0 — © les contributeurs d’OpenStreetMap' if has_osm else ''),
            'licence_url': 'https://www.openstreetmap.org/copyright' if has_osm else 'https://creativecommons.org/publicdomain/zero/1.0/deed.fr', 'url': 'https://www.wikidata.org/wiki/Q55100046',
            'built': time.strftime('%Y-%m-%d'), 'what': 'Arbres de la Liberté plantés en 1792, 1830, 1848, 1889, 1989… (France, Belgique, Suisse, Luxembourg) : position, année quand elle est connue',
            'fields': fields, 'rows': [[r[k] for k in fields] for r in rows]}
    size = wm.write_gz(OUT, 'te-libertes.json.gz', meta)
    print(f'te-libertes : {len(rows)} arbres ({sum(r["src"] == "osm" for r in rows)} OSM), {size} octets')


if __name__ == '__main__':
    main()
