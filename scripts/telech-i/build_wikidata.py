#!/usr/bin/env python3
"""Lot I — les lieux du travail, du soin, de l'enfermement et des loisirs connus de Wikidata (CC0 1.0) → assets/data/ti-*.json.gz.

 ⚓ ti-navals      chantiers navals (Q190928), corderies (Q1249556, Q41085665), arsenaux (Q81669), bases navales (Q1324633)
 🚗 ti-autos      constructeurs automobiles (Q786820) fondés avant 1914, placés par leur siège (P159) ou leur lieu de fondation (P740)
 🍬 ti-sucreries  sucreries et raffineries de sucre (Q227857, Q61941965)
 🏥 ti-sanas      sanatoriums (Q46124, Q1792936 et leurs sous-classes)
 🔒 ti-centrales  maisons centrales (Q130246829, Q3279120) — les autres prisons et bagnes sont déjà dans ha-institutions (non recopiés)
 🏛 ti-romains    ponts romains (Q1223230) et aqueducs romains (Q13218676) ; « dup » marque ceux déjà dans et-ouvrages (lot « Son époque »)
 🐎 ti-hippodromes hippodromes (Q11822917)
Tous en France (P17 = Q142) avec une position (P625). Dates : création P571 (ou mise en service P1619), fin P576 / P582 / P3999.
Lancer : python3 -I scripts/telech-i/build_wikidata.py [dossier de sortie] [nom…]   (TI_WDQS_GAP=61 si le service est limité)
"""
import gzip, json, os, sys, urllib.parse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'assets', 'data')
ONLY = set(sys.argv[2:])
SETS = {
    'navals': ({'Q190928': 'chantier naval', 'Q1249556': 'corderie', 'Q41085665': 'corderie', 'Q81669': 'arsenal', 'Q1324633': 'base navale'}, False,
               'Chantiers navals, corderies et arsenaux connus de Wikidata'),
    'sucreries': ({'Q227857': 'sucrerie', 'Q61941965': 'sucrerie'}, False, 'Sucreries et raffineries de sucre connues de Wikidata'),
    'sanas': ({'Q46124': 'sanatorium', 'Q1792936': 'sanatorium'}, True, 'Sanatoriums connus de Wikidata'),
    'centrales': ({'Q130246829': 'maison centrale', 'Q3279120': 'maison centrale'}, False, 'Maisons centrales connues de Wikidata'),
    'romains': ({'Q1223230': 'pont romain', 'Q13218676': 'aqueduc romain'}, True, 'Ponts et aqueducs romains connus de Wikidata'),
    'hippodromes': ({'Q11822917': 'hippodrome'}, False, 'Hippodromes connus de Wikidata'),
}
FIELDS = ['q', 'n', 'k', 'lat', 'lon', 'from', 'to', 'insee', 'commune', 'frwiki']


def rows_of(bindings, kinds, coord='c'):
    rows = {}
    for b in bindings:
        x = wm.qid(b['x']['value'])
        lat, lon = wm.point(b.get(coord, {}).get('value'))
        if lat is None:
            continue
        k = kinds.get(wm.qid(b.get('k', {}).get('value')), next(iter(kinds.values())))
        r = rows.setdefault(x, {'q': x, 'n': b['xl']['value'], 'k': k, 'lat': lat, 'lon': lon, 'from': None, 'to': None, 'insee': '', 'commune': '', 'frwiki': ''})
        s, e = wm.year(b.get('s', {}).get('value')), wm.year(b.get('e', {}).get('value'))
        if s is not None and (r['from'] is None or s < r['from']):
            r['from'] = s
        if e is not None and (r['to'] is None or e > r['to']):
            r['to'] = e
        if b.get('ins') and not r['insee']:
            r['insee'], r['commune'] = b['ins']['value'], b['coml']['value']
        if b.get('fr') and not r['frwiki']:
            r['frwiki'] = urllib.parse.unquote(b['fr']['value'].rsplit('/wiki/', 1)[-1]).replace('_', ' ')
    return sorted(rows.values(), key=lambda r: (r['k'], r['n']))


COMMON = '''OPTIONAL {{ ?x wdt:P571|wdt:P1619 ?s }} OPTIONAL {{ ?x wdt:P576|wdt:P582|wdt:P3999 ?e }}
      OPTIONAL {{ ?x wdt:P131 ?com . ?com wdt:P374 ?ins ; rdfs:label ?coml FILTER(LANG(?coml)="fr") }}
      OPTIONAL {{ ?fr schema:about ?x ; schema:isPartOf <https://fr.wikipedia.org/> }}
      ?x rdfs:label ?xl FILTER(LANG(?xl)="fr")'''


def write(name, rows, what, url, extra=None):
    meta = {'source': 'Wikidata', 'licence': 'CC0 1.0', 'licence_url': 'https://creativecommons.org/publicdomain/zero/1.0/deed.fr', 'url': url,
            'built': wm.today(), 'what': what, 'fields': FIELDS + list((extra or {}).keys()),
            'rows': [[r[k] for k in FIELDS] + [r.get(k) for k in (extra or {})] for r in rows]}
    size = wm.write_gz(OUT, f'ti-{name}.json.gz', meta)
    print(f'ti-{name} : {len(rows)} lieux ({sum(1 for r in rows if r["from"])} datés), {size} octets')


def build(name, kinds, sub, what):
    vals = ' '.join('wd:' + k for k in kinds)
    p31 = 'wdt:P31/wdt:P279*' if sub else 'wdt:P31'
    q = f'''SELECT ?x ?xl ?k ?c ?s ?e ?ins ?coml ?fr WHERE {{ VALUES ?k {{ {vals} }} ?x {p31} ?k ; wdt:P17 wd:Q142 ; wdt:P625 ?c .
      {COMMON.format()} }}'''
    rows = rows_of(wm.sparql(q), kinds)
    extra = None
    if name == 'romains':
        # déjà dans l'app : les ponts et aqueducs datés du pack « Son époque » (et-ouvrages) — marqués, pas cachés (la fiche le dit)
        et = json.load(gzip.open(os.path.join(ROOT, 'assets', 'data', 'et-ouvrages.json.gz')))
        known = {r[0] for r in et['rows']}
        for r in rows:
            r['dup'] = 1 if r['q'] in known else 0
        extra = {'dup': 1}
    write(name, rows, what, 'https://www.wikidata.org/wiki/' + next(iter(kinds)), extra)


def build_autos():
    """🚗 constructeurs fondés avant 1914 : la position du siège (P159) ou du lieu de fondation (P740)"""
    q = '''SELECT ?x ?xl ?c ?s ?e ?ins ?coml ?fr WHERE { ?x wdt:P31 wd:Q786820 ; wdt:P571 ?s . FILTER(YEAR(?s) < 1914)
      ?x wdt:P159|wdt:P740 ?pl . ?pl wdt:P17 wd:Q142 ; wdt:P625 ?c .
      OPTIONAL { ?x wdt:P576|wdt:P582 ?e } OPTIONAL { ?pl wdt:P374 ?ins ; rdfs:label ?coml FILTER(LANG(?coml)="fr") }
      OPTIONAL { ?fr schema:about ?x ; schema:isPartOf <https://fr.wikipedia.org/> }
      ?x rdfs:label ?xl FILTER(LANG(?xl)="fr") }'''
    rows = rows_of(wm.sparql(q), {'Q786820': 'constructeur automobile'})
    write('autos', [r for r in rows if r['from'] is not None and r['from'] < 1914], 'Constructeurs automobiles fondés avant 1914 et leur ville (Wikidata)', 'https://www.wikidata.org/wiki/Q786820')


if __name__ == '__main__':
    for n, (k, sub, what) in SETS.items():
        if not ONLY or n in ONLY:
            build(n, k, sub, what)
    if not ONLY or 'autos' in ONLY:
        build_autos()
