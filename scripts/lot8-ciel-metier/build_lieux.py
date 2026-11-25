#!/usr/bin/env python3
"""♨️ Les villes d'eaux et 🏞️ les parcs et jardins historiques — d'après Wikidata (CC0).

♨️ l8a-eaux : stations thermales (Q4946461), établissements thermaux / spas (Q1341387) et thermes (Q20983805) placés sur la
   carte, avec leur date (P571 « création » ou P1619 « ouverture ») quand Wikidata la donne.
🏞️ l8a-jardins : les « Jardins remarquables » (label du ministère de la Culture, Wikidata P1435 = Q498842) et les parcs et
   jardins protégés (une protection patrimoniale P1435) de France et des pays voisins.
   La liste officielle du ministère (« Liste des jardins remarquables », data.gouv.fr, Licence Ouverte 2.0,
   https://www.data.gouv.fr/fr/datasets/5ee2fe1cba88d5c5a1179ef2/) est servie depuis un stockage
   (ministere-culture.s3.sbg.io.cloud.ovh.net) que cette fabrication ne peut pas joindre : si le fichier CSV est posé à côté
   (argument 1), ses lignes sont ajoutées (Licence Ouverte, mention « Ministère de la Culture »).

Usage : L8_CACHE=<dossier> python3 -I build_lieux.py [liste-des-jardins-remarquables.csv]
"""
import csv, io, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import l8common as C

COUNTRIES = {'Q142': 'France', 'Q31': 'Belgique', 'Q39': 'Suisse', 'Q32': 'Luxembourg', 'Q38': 'Italie', 'Q29': 'Espagne', 'Q183': 'Allemagne', 'Q145': 'Royaume-Uni',
             'Q55': 'Pays-Bas', 'Q45': 'Portugal', 'Q40': 'Autriche', 'Q27': 'Irlande', 'Q213': 'Tchéquie', 'Q36': 'Pologne', 'Q28': 'Hongrie', 'Q35': 'Danemark', 'Q34': 'Suède', 'Q20': 'Norvège',
             'Q236': 'Monaco', 'Q228': 'Andorre', 'Q347': 'Liechtenstein', 'Q214': 'Slovaquie', 'Q215': 'Slovénie', 'Q224': 'Croatie', 'Q41': 'Grèce', 'Q218': 'Roumanie', 'Q219': 'Bulgarie', 'Q33': 'Finlande'}


def year(v):
    m = re.match(r'^([+-]?\d{4})', v or '')
    return int(m.group(1)) if m else None


def coord(v):
    m = re.match(r'Point\(([-\d.eE]+) ([-\d.eE]+)\)', v or '')
    return (round(float(m.group(2)), 5), round(float(m.group(1)), 5)) if m else (None, None)


def rows_of(q):
    out = {}
    for r in C.sparql(q):
        i = C.qid(r['i'])
        lat, lon = coord(r.get('co'))
        if lat is None: continue
        cur = out.setdefault(i, {'q': i, 'n': r.get('lab') or r.get('en') or i, 'lat': lat, 'lon': lon, 'cc': COUNTRIES.get(C.qid(r.get('cn', '')), r.get('cnl', '')),
                                 'com': r.get('coml', ''), 'y': None, 'wp': r.get('wp', '').replace('https://fr.wikipedia.org/wiki/', ''), 'kind': set(), 'img': (r.get('img') or '').rsplit('/', 1)[-1]})
        for k in ('inc', 'open'):
            y = year(r.get(k))
            if y and (cur['y'] is None or y < cur['y']): cur['y'] = y
        if r.get('k'): cur['kind'].add(r['k'])
        if not cur['com'] and r.get('coml'): cur['com'] = r['coml']
    for v in out.values(): v['kind'] = sorted(v['kind'])
    return list(out.values())


def main(csv_path=None):
    import urllib.parse
    eaux = rows_of('''SELECT ?i ?lab ?en ?co ?cn ?coml ?inc ?open ?wp ?k ?img WHERE {
        VALUES (?t ?k) { (wd:Q4946461 "station") (wd:Q1341387 "spa") (wd:Q20983805 "thermes") } hint:Query hint:optimizer "None" .
        ?i wdt:P31 ?t ; wdt:P625 ?co .
        OPTIONAL { ?i rdfs:label ?lab FILTER(lang(?lab)="fr") } OPTIONAL { ?i rdfs:label ?en FILTER(lang(?en)="en") }
        OPTIONAL { ?i wdt:P17 ?cn } OPTIONAL { ?i wdt:P131 ?com . ?com rdfs:label ?coml FILTER(lang(?coml)="fr") }
        OPTIONAL { ?i wdt:P571 ?inc } OPTIONAL { ?i wdt:P1619 ?open } OPTIONAL { ?i wdt:P18 ?img }
        OPTIONAL { ?wp schema:about ?i ; schema:isPartOf <https://fr.wikipedia.org/> } }''')
    for e in eaux: e['img'] = ''
    print('villes d’eaux', len(eaux), 'datées', sum(1 for e in eaux if e['y']))
    C.write('l8a-eaux.json.gz', {'title': 'Villes d’eaux et établissements thermaux', 'version': 1, 'built': __import__('datetime').date.today().isoformat(),
                                 'source': 'Wikidata : station thermale (Q4946461), spa (Q1341387), thermes (Q20983805)', 'url': 'https://www.wikidata.org/wiki/Q4946461', 'licence': 'CC0',
                                 'note': 'y = année de création ou d’ouverture écrite dans Wikidata (P571 ou P1619), quand elle existe.',
                                 'fields': ['q', 'n', 'lat', 'lon', 'cc', 'com', 'y', 'wp', 'kind'], 'rows': [[e[k] for k in ['q', 'n', 'lat', 'lon', 'cc', 'com', 'y', 'wp', 'kind']] for e in sorted(eaux, key=lambda e: e['q'])]})
    jr = rows_of('''SELECT ?i ?lab ?en ?co ?cn ?coml ?inc ?open ?wp ?k WHERE { BIND("jr" AS ?k) hint:Query hint:optimizer "None" .
        ?i wdt:P1435 wd:Q498842 ; wdt:P625 ?co .
        OPTIONAL { ?i rdfs:label ?lab FILTER(lang(?lab)="fr") } OPTIONAL { ?i rdfs:label ?en FILTER(lang(?en)="en") }
        OPTIONAL { ?i wdt:P17 ?cn } OPTIONAL { ?i wdt:P131 ?com . ?com rdfs:label ?coml FILTER(lang(?coml)="fr") }
        OPTIONAL { ?i wdt:P571 ?inc } OPTIONAL { ?wp schema:about ?i ; schema:isPartOf <https://fr.wikipedia.org/> } }''')
    print('jardins remarquables', len(jr))
    hist, failed = [], []
    for cq in COUNTRIES:  # un pays à la fois : la requête de toute l'Europe dépasse le temps permis par le serveur
        try:
            hist += rows_of(f'''SELECT ?i ?lab ?en ?co ?cn ?coml ?inc ?wp ?k WHERE {{
                VALUES ?t {{ wd:Q1107656 wd:Q22698 wd:Q167346 wd:Q2244893 wd:Q3215290 wd:Q15077303 wd:Q1052563 }} BIND(wd:{cq} AS ?cn) BIND("hist" AS ?k) hint:Query hint:optimizer "None" .
                ?i wdt:P31 ?t . ?i wdt:P17 ?cn . ?i wdt:P1435 ?d . ?i wdt:P625 ?co .
                OPTIONAL {{ ?i rdfs:label ?lab FILTER(lang(?lab)="fr") }} OPTIONAL {{ ?i rdfs:label ?en FILTER(lang(?en)="en") }}
                OPTIONAL {{ ?i wdt:P131 ?com . ?com rdfs:label ?coml FILTER(lang(?coml)="fr") }}
                OPTIONAL {{ ?i wdt:P571 ?inc }} OPTIONAL {{ ?wp schema:about ?i ; schema:isPartOf <https://fr.wikipedia.org/> }} }}''')
        except Exception as e:
            failed.append(COUNTRIES[cq]); print('  pays sauté', COUNTRIES[cq], e)
    print('parcs et jardins protégés', len(hist))
    by = {}
    for r in jr + hist:
        cur = by.get(r['q'])
        if not cur: by[r['q']] = r
        else: cur['kind'] = sorted(set(cur['kind']) | set(r['kind'])); cur['y'] = cur['y'] or r['y']
    rows = [[r['q'], r['n'], r['lat'], r['lon'], r['cc'], r['com'], r['y'], r['wp'], r['kind']] for r in sorted(by.values(), key=lambda r: r['q'])]
    mc = []
    if csv_path and os.path.exists(csv_path):
        # la liste officielle, si elle a pu être téléchargée à la main (Licence Ouverte 2.0)
        txt = open(csv_path, encoding='utf-8-sig').read()
        rd = csv.DictReader(io.StringIO(txt), delimiter=';' if txt.count(';') > txt.count(',') else ',')
        for r in rd: mc.append(r)
        print('liste du ministère (CSV)', len(mc))
    C.write('l8a-jardins.json.gz', {'title': 'Parcs et jardins historiques', 'version': 1, 'built': __import__('datetime').date.today().isoformat(),
                                    'source': 'Wikidata : label « Jardin remarquable » (Q498842, ministère de la Culture) et parcs et jardins protégés (P1435) de France et d’Europe',
                                    'url': 'https://www.wikidata.org/wiki/Q498842', 'licence': 'CC0',
                                    'official': {'label': 'Ministère de la Culture, Liste des jardins remarquables (Licence Ouverte 2.0)', 'url': 'https://www.data.gouv.fr/fr/datasets/5ee2fe1cba88d5c5a1179ef2/', 'rows': len(mc)},
                                    'missing': failed,
                                    'note': 'kind : jr = label « Jardin remarquable » ; hist = parc ou jardin protégé (monument historique, Registered Park and Garden…). y = date de création écrite dans Wikidata.',
                                    'fields': ['q', 'n', 'lat', 'lon', 'cc', 'com', 'y', 'wp', 'kind'], 'rows': rows})


if __name__ == '__main__':
    main(*sys.argv[1:2])
