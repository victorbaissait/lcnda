#!/usr/bin/env python3
"""🕯️ Lot 10 — Les lieux de pèlerinage de France et des pays voisins (assets/data/l10o-pelerinages.json.gz).

Source : Wikidata (CC0 1.0), service SPARQL query.wikidata.org. Gardé : les éléments dont la NATURE (P31) est « lieu de pèlerinage »
(Q15135589), « sanctuaire » (Q697295), « sanctuaire marial » (Q840482), « pèlerinage » (Q1644573), « pardon » (Q1582987) ou
« basilique mineure » (Q120560, titre donné surtout aux églises de pèlerinage), avec une position (P625) ; la commune (P131 → P374),
la date de fondation (P571), à qui il est dédié (P825), l'image (P18, nom du fichier Commons) et l'article de Wikipédia.
Les fontaines saintes et pèlerinages tout près de la commune sont déjà dans « ⛲ Fontaines et saints » (pays-memoire) : ici, la région.

Lancer : python3 scripts/lot10-objets-traces/build_pelerinages.py [dossier de sortie]   (L10_RAW = cache des réponses)
"""
import gzip, json, os, re, sys, time, urllib.parse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'assets', 'data')
KINDS = {'Q15135589': 'pelerinage', 'Q1644573': 'pelerinage', 'Q1582987': 'pardon', 'Q840482': 'marial', 'Q697295': 'sanctuaire', 'Q120560': 'basilique'}
COUNTRIES = {'Q142': 'France', 'Q31': 'Belgique', 'Q39': 'Suisse', 'Q32': 'Luxembourg', 'Q235': 'Monaco'}
qid = lambda u: (u or '').rsplit('/', 1)[-1]


def year(t):
    m = re.match(r'^\+?(-?\d{1,4})-', t or '')
    return int(m.group(1)) if m else None


def point(s):
    m = re.match(r'Point\(([-\d.eE]+) ([-\d.eE]+)\)', s or '')
    return (round(float(m.group(2)), 5), round(float(m.group(1)), 5)) if m else (None, None)


def main():
    vals = ' '.join('wd:' + k for k in KINDS)
    ctry = ' '.join('wd:' + k for k in COUNTRIES)
    q = f'''SELECT ?x ?xl ?k ?c ?ctry ?ins ?coml ?inc ?dedl ?img ?fr WHERE {{
  VALUES ?k {{ {vals} }} VALUES ?ctry {{ {ctry} }}
  ?x wdt:P31 ?k ; wdt:P625 ?c .
  {{ ?x wdt:P17 ?ctry }} UNION {{ ?x wdt:P276 ?loc . ?loc wdt:P17 ?ctry }}
  OPTIONAL {{ ?x wdt:P131 ?com . OPTIONAL {{ ?com wdt:P374 ?ins }} ?com rdfs:label ?coml FILTER(LANG(?coml)="fr") }}
  OPTIONAL {{ ?x wdt:P571 ?inc }}
  OPTIONAL {{ ?x wdt:P825 ?ded . ?ded rdfs:label ?dedl FILTER(LANG(?dedl)="fr") }}
  OPTIONAL {{ ?x wdt:P18 ?img }}
  OPTIONAL {{ ?fr schema:about ?x ; schema:isPartOf <https://fr.wikipedia.org/> }}
  ?x rdfs:label ?xl FILTER(LANG(?xl)="fr")
}}'''
    rows = {}
    rank = ['pelerinage', 'pardon', 'marial', 'sanctuaire', 'basilique']
    for b in wm.sparql(q):
        x = qid(b['x']['value'])
        lat, lon = point(b['c']['value'])
        if lat is None:
            continue
        k = KINDS[qid(b['k']['value'])]
        if re.search(r'gallo-romain|antique|romain|celt|protohistor|néolithique|temple', b['xl']['value'], re.I):
            continue  # un sanctuaire de l'Antiquité n'est pas un pèlerinage de son temps
        r = rows.get(x)
        if not r:
            r = rows[x] = {'q': x, 'n': b['xl']['value'], 'kind': k, 'lat': lat, 'lon': lon, 'country': COUNTRIES[qid(b['ctry']['value'])],
                           'insee': '', 'commune': '', 'from': None, 'ded': '', 'img': '', 'frwiki': ''}
        elif rank.index(k) < rank.index(r['kind']):
            r['kind'] = k
        if b.get('ins') and not r['insee']:
            r['insee'] = b['ins']['value']
        if b.get('coml') and not r['commune']:
            r['commune'] = b['coml']['value']
        y = year(b.get('inc', {}).get('value'))
        if y is not None and (r['from'] is None or y < r['from']):
            r['from'] = y
        if b.get('dedl') and not r['ded']:
            r['ded'] = b['dedl']['value']
        if b.get('img') and not r['img']:
            r['img'] = urllib.parse.unquote(b['img']['value'].rsplit('/', 1)[-1])
        if b.get('fr') and not r['frwiki']:
            r['frwiki'] = urllib.parse.unquote(b['fr']['value'].rsplit('/wiki/', 1)[-1]).replace('_', ' ')
    out = sorted(rows.values(), key=lambda r: (r['country'], r['n']))
    fields = ['q', 'n', 'kind', 'lat', 'lon', 'country', 'insee', 'commune', 'from', 'ded', 'img', 'frwiki']
    meta = {'source': 'Wikidata', 'licence': 'CC0 1.0', 'licence_url': 'https://creativecommons.org/publicdomain/zero/1.0/deed.fr', 'url': 'https://www.wikidata.org/wiki/Q15135589',
            'built': time.strftime('%Y-%m-%d'), 'kinds': {'pelerinage': 'lieu de pèlerinage', 'pardon': 'pardon', 'marial': 'sanctuaire marial', 'sanctuaire': 'sanctuaire', 'basilique': 'basilique mineure'},
            'what': 'Lieux de pèlerinage, sanctuaires, pardons et basiliques mineures avec une position (Wikidata) : France, Belgique, Suisse, Luxembourg, Monaco',
            'fields': fields, 'rows': [[r[k] for k in fields] for r in out]}
    os.makedirs(OUT, exist_ok=True)
    p = os.path.join(OUT, 'l10o-pelerinages.json.gz')
    with gzip.GzipFile(p, 'wb', mtime=0, compresslevel=9) as f:
        f.write(json.dumps(meta, ensure_ascii=False, separators=(',', ':')).encode())
    from collections import Counter
    print(f'l10o-pelerinages : {len(out)} lieux {dict(Counter(r["kind"] for r in out))}, {os.path.getsize(p)} octets')


if __name__ == '__main__':
    main()
