#!/usr/bin/env python3
"""⚱️ Lot D — Sépultures de guerre : nécropoles nationales et cimetières de guerre (assets/data/td-necropoles.json.gz).

Sources :
 - Wikidata (CC0 1.0), service SPARQL : les éléments « nécropole nationale en France » (Q19951362), « cimetière de guerre »
   (Q1707610) et « cimetière militaire » (Q1241568) situés en France ou en Belgique, avec une position (P625) ; commune (P131 →
   P374 code INSEE), date d'ouverture (P571), gestionnaire (P137), article de Wikipédia.
 - MémorialGenWeb, « Liste des nécropoles nationales » publiée sur data.gouv.fr sous licence CC BY-SA
   (https://www.data.gouv.fr/datasets/liste-des-necropoles-nationales) : pour chaque nécropole, le lien vers sa fiche
   MémorialGenWeb qui donne la liste des soldats inhumés. On garde seulement le lien (relié par le code INSEE de la commune).
Rien de personnel : ce sont des lieux. Les noms des soldats restent sur MémorialGenWeb et Mémoire des hommes (liens).

Lancer : python3 scripts/telech-d/build_necropoles.py [dossier de sortie]   (TD_RAW = cache des réponses)
"""
import csv, io, os, re, sys, time, urllib.parse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'assets', 'data')
MGW = 'https://static.data.gouv.fr/resources/liste-des-necropoles-nationales/20160809-194921/mgw_necropoles.csv'
KINDS = {'Q19951362': 'necropole', 'Q1707610': 'guerre', 'Q1241568': 'guerre'}
COUNTRIES = {'Q142': 'France', 'Q31': 'Belgique'}
qid = lambda u: (u or '').rsplit('/', 1)[-1]


def year(t):
    m = re.match(r'^\+?(-?\d{1,4})-', t or '')
    return int(m.group(1)) if m else None


def point(s):
    m = re.match(r'Point\(([-\d.eE]+) ([-\d.eE]+)\)', s or '')
    return (round(float(m.group(2)), 5), round(float(m.group(1)), 5)) if m else (None, None)


def mgw_links():
    raw = wm.get(MGW, 'text/csv').decode('latin-1')
    out = {}
    for row in csv.reader(io.StringIO(raw), delimiter=';'):
        if len(row) < 4 or not row[3].startswith('http'):
            continue
        m = re.search(r'insee=(\d[\dAB]\d{3})', row[3])
        if m and m.group(1) != '00000':
            out.setdefault(m.group(1), []).append({'name': row[2].strip(), 'url': row[3].strip()})
    return out


def main():
    vals = ' '.join('wd:' + k for k in KINDS)
    ctry = ' '.join('wd:' + k for k in COUNTRIES)
    q = f'''SELECT ?x ?xl ?k ?c ?ctry ?ins ?coml ?inc ?opl ?fr WHERE {{
  VALUES ?k {{ {vals} }} VALUES ?ctry {{ {ctry} }}
  ?x wdt:P31 ?k ; wdt:P625 ?c ; wdt:P17 ?ctry .
  OPTIONAL {{ ?x wdt:P131 ?com . OPTIONAL {{ ?com wdt:P374 ?ins }} ?com rdfs:label ?coml FILTER(LANG(?coml)="fr") }}
  OPTIONAL {{ ?x wdt:P571 ?inc }}
  OPTIONAL {{ ?x wdt:P137 ?op . ?op rdfs:label ?opl FILTER(LANG(?opl)="fr") }}
  OPTIONAL {{ ?fr schema:about ?x ; schema:isPartOf <https://fr.wikipedia.org/> }}
  ?x rdfs:label ?xl FILTER(LANG(?xl)="fr")
}}'''
    rows = {}
    for b in wm.sparql(q):
        x = qid(b['x']['value'])
        lat, lon = point(b['c']['value'])
        if lat is None:
            continue
        k = KINDS[qid(b['k']['value'])]
        r = rows.get(x)
        if not r:
            r = rows[x] = {'q': x, 'n': b['xl']['value'], 'kind': k, 'lat': lat, 'lon': lon, 'country': COUNTRIES[qid(b['ctry']['value'])],
                           'insee': '', 'commune': '', 'from': None, 'op': '', 'frwiki': '', 'mgw': ''}
        elif k == 'necropole':
            r['kind'] = k
        if b.get('ins') and not r['insee']:
            r['insee'] = b['ins']['value']
        if b.get('coml') and not r['commune']:
            r['commune'] = b['coml']['value']
        y = year(b.get('inc', {}).get('value'))
        if y is not None and (r['from'] is None or y < r['from']):
            r['from'] = y
        if b.get('opl') and not r['op']:
            r['op'] = b['opl']['value']
        if b.get('fr') and not r['frwiki']:
            r['frwiki'] = urllib.parse.unquote(b['fr']['value'].rsplit('/wiki/', 1)[-1]).replace('_', ' ')
    links = mgw_links()
    linked = 0
    for r in rows.values():
        L = links.get(r['insee']) if r['kind'] == 'necropole' else None
        if L:
            r['mgw'] = L[0]['url']
            linked += 1
    out = sorted(rows.values(), key=lambda r: (r['country'], r['insee'], r['n']))
    fields = ['q', 'n', 'kind', 'lat', 'lon', 'country', 'insee', 'commune', 'from', 'op', 'frwiki', 'mgw']
    meta = {'source': 'Wikidata ; MémorialGenWeb (data.gouv.fr)', 'licence': 'CC0 1.0 (Wikidata) ; CC BY-SA (liens MémorialGenWeb)',
            'licence_url': 'https://creativecommons.org/publicdomain/zero/1.0/deed.fr', 'url': 'https://www.wikidata.org/wiki/Q19951362',
            'url2': 'https://www.data.gouv.fr/datasets/liste-des-necropoles-nationales', 'built': time.strftime('%Y-%m-%d'),
            'kinds': {'necropole': 'nécropole nationale', 'guerre': 'cimetière de guerre'},
            'what': 'Nécropoles nationales et cimetières de guerre de France et de Belgique avec une position (Wikidata), et le lien vers la liste des soldats inhumés (MémorialGenWeb)',
            'fields': fields, 'rows': [[r[k] for k in fields] for r in out]}
    size = wm.write_gz(OUT, 'td-necropoles.json.gz', meta)
    from collections import Counter
    print(f'td-necropoles : {len(out)} lieux {dict(Counter(r["kind"] for r in out))}, {linked} liés à MémorialGenWeb, {size} octets')


if __name__ == '__main__':
    main()
