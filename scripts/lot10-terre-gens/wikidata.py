#!/usr/bin/env python3
"""LCNDA lot 10 « Sa terre et ses gens » : construit les fichiers assets/data/l10t-*.json.gz à partir de Wikidata (CC0 1.0).
Une requête à la fois, pause de 3 s, Retry-After respecté. Usage : python3 -I scripts/lot10-terre-gens/wikidata.py [nom…]
  avalanches · epaves · relais · algerie · quebec · suisse"""
import gzip, json, os, re, sys, time, urllib.error, urllib.parse, urllib.request, datetime

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'assets', 'data')
UA = 'LCNDA-genealogie/1.0 (application de genealogie ; construction de donnees, usage poli)'
TODAY = datetime.date.today().isoformat()


def sparql(q, tries=6):
    for i in range(tries):
        try:
            req = urllib.request.Request('https://query.wikidata.org/sparql', data=urllib.parse.urlencode({'query': q, 'format': 'json'}).encode(),
                                         headers={'User-Agent': UA, 'Accept': 'application/sparql-results+json'})
            with urllib.request.urlopen(req, timeout=180) as r:
                d = json.load(r)
            time.sleep(3)
            return [{k: v['value'] for k, v in b.items()} for b in d['results']['bindings']]
        except urllib.error.HTTPError as e:
            wait = int(e.headers.get('Retry-After') or 30) if e.code == 429 else 20
            print('  HTTP', e.code, '→ pause', wait, 's', file=sys.stderr); time.sleep(wait)
        except Exception as e:  # délai dépassé…
            print('  erreur', e, '→ pause 20 s', file=sys.stderr); time.sleep(20)
    raise SystemExit('Wikidata ne répond pas')


q_of = lambda u: u.rsplit('/', 1)[-1]
def year_of(s):
    m = re.match(r'^(-?\d{1,4})-', s or '')
    return int(m.group(1)) if m else None
def day_of(s):
    m = re.match(r'^(\d{4})-(\d\d)-(\d\d)', s or '')
    if not m: return None
    return s[:10]
r5 = lambda x: round(float(x), 5)


def save(name, meta, rows):
    meta = {'source': 'Wikidata', 'licence': 'CC0 1.0', 'licence_url': 'https://creativecommons.org/publicdomain/zero/1.0/deed.fr', 'built': TODAY, **meta, 'rows': rows}
    path = os.path.join(OUT, f'l10t-{name}.json.gz')
    with gzip.open(path, 'wt', encoding='utf-8', compresslevel=9) as f:
        json.dump(meta, f, ensure_ascii=False, separators=(',', ':'))
    print(f'{name}: {len(rows)} lignes, {os.path.getsize(path) // 1024} Ko')


def merge(rows, key='q'):
    out = {}
    for r in rows:
        q = r[key]
        if q not in out: out[q] = r
        else:
            for k, v in r.items():
                if v not in (None, '') and out[q].get(k) in (None, ''): out[q][k] = v
    return list(out.values())


LABELS = """OPTIONAL { ?i rdfs:label ?lfr FILTER(lang(?lfr)='fr') } OPTIONAL { ?i rdfs:label ?len FILTER(lang(?len)='en') }
  OPTIONAL { ?wp schema:about ?i ; schema:isPartOf <https://fr.wikipedia.org/> }"""
def base(b):
    return {'q': q_of(b['i']), 'n': b.get('lfr') or b.get('len') or '', 'wp': b.get('wp') or ''}


def avalanches():
    rows = []
    for b in sparql(f"""SELECT ?i ?lfr ?len ?wp ?d ?d2 ?lat ?lon ?lat2 ?lon2 ?deaths ?cl WHERE {{
      ?i wdt:P31/wdt:P279* wd:Q7935 . {LABELS}
      OPTIONAL {{ ?i wdt:P585 ?d }} OPTIONAL {{ ?i wdt:P580 ?d2 }} OPTIONAL {{ ?i wdt:P1120 ?deaths }}
      OPTIONAL {{ ?i p:P625/psv:P625 [ wikibase:geoLatitude ?lat ; wikibase:geoLongitude ?lon ] }}
      OPTIONAL {{ ?i wdt:P276 ?loc . ?loc p:P625/psv:P625 [ wikibase:geoLatitude ?lat2 ; wikibase:geoLongitude ?lon2 ] }}
      OPTIONAL {{ ?i wdt:P17 ?c . ?c rdfs:label ?cl FILTER(lang(?cl)='fr') }} }}"""):
        lat, lon = b.get('lat') or b.get('lat2'), b.get('lon') or b.get('lon2')
        d = b.get('d') or b.get('d2')
        if not lat or not year_of(d): continue
        rows.append({**base(b), 'd': day_of(d) or str(year_of(d)), 'y': year_of(d), 'lat': r5(lat), 'lon': r5(lon), 'deaths': int(float(b['deaths'])) if b.get('deaths') else None, 'country': b.get('cl') or ''})
    rows = [r for r in merge(rows) if r['n'] and not re.match(r'^Q\d+$', r['n'])]
    rows.sort(key=lambda r: r['d'])
    save('avalanches', {'title': 'Avalanches historiques datées', 'url': 'https://www.wikidata.org/wiki/Q7935',
        'note': 'Avalanches (Q7935) datées et placées sur Wikidata. L’Enquête permanente sur les avalanches (INRAE) n’est pas copiée : licence non vérifiée (site injoignable au moment de la construction) ; lien seulement.'}, rows)


def epaves():
    rows = []
    box = 'FILTER(?lat > 34 && ?lat < 62 && ?lon > -20 && ?lon < 25)'
    for lo, hi in [(34, 46), (46, 49), (49, 51), (51, 53), (53, 55), (55, 62)]:
        print(f'  épaves {lo}-{hi}…', file=sys.stderr)
        for b in sparql(f"""SELECT ?i ?lfr ?len ?wp ?d ?d2 ?d3 ?lat ?lon WHERE {{
          ?i wdt:P31 wd:Q852190 ; p:P625/psv:P625 [ wikibase:geoLatitude ?lat ; wikibase:geoLongitude ?lon ] . {box} FILTER(?lat >= {lo} && ?lat < {hi}) {LABELS}
          OPTIONAL {{ ?i wdt:P585 ?d }} OPTIONAL {{ ?i wdt:P576 ?d2 }} OPTIONAL {{ ?i p:P793 [ ps:P793 wd:Q906512 ; pq:P585 ?d3 ] }} }}"""):
            d = b.get('d3') or b.get('d') or b.get('d2')
            rows.append({**base(b), 'd': (day_of(d) or (str(year_of(d)) if year_of(d) else '')), 'y': year_of(d), 'lat': r5(b['lat']), 'lon': r5(b['lon']), 'k': 'epave'})
    print('  naufrages datés…', file=sys.stderr)
    for b in sparql(f"""SELECT ?i ?lfr ?len ?wp ?d ?lat ?lon WHERE {{
      {{ ?i wdt:P31 wd:Q906512 ; wdt:P585 ?d . }} UNION {{ ?i p:P793 [ ps:P793 wd:Q906512 ; pq:P585 ?d ] . }}
      ?i p:P625/psv:P625 [ wikibase:geoLatitude ?lat ; wikibase:geoLongitude ?lon ] . {box} {LABELS} }}"""):
        rows.append({**base(b), 'd': day_of(b.get('d')) or str(year_of(b.get('d'))), 'y': year_of(b.get('d')), 'lat': r5(b['lat']), 'lon': r5(b['lon']), 'k': 'naufrage'})
    rows = [r for r in merge(rows) if r['n'] and not re.match(r'^Q\d+$', r['n'])]
    for r in rows:
        if not r['wp']: del r['wp']
        if not r['y']: del r['y']; del r['d']
    rows.sort(key=lambda r: (r['lat'], r['lon']))
    save('epaves', {'title': 'Épaves et naufrages au large des côtes d’Europe', 'url': 'https://www.wikidata.org/wiki/Q852190',
        'note': 'Épaves (Q852190) et naufrages (Q906512) placés sur Wikidata, de l’Atlantique à la Baltique et à la Méditerranée ; la date du naufrage est donnée quand Wikidata la connaît. Les données du DRASSM ne sont pas copiées.'}, rows)


def relais():
    rows = []
    for b in sparql(f"""SELECT ?i ?lfr ?len ?wp ?lat ?lon ?inc ?mh ?cl WHERE {{
      {{ ?i wdt:P31/wdt:P279* wd:Q28532565 }} UNION {{ ?i wdt:P31 wd:Q966002 }} UNION {{ ?i wdt:P380 ?m ; rdfs:label ?x FILTER(lang(?x)='fr' && (CONTAINS(LCASE(?x),'relais de poste') || CONTAINS(LCASE(?x),'poste aux chevaux'))) }}
      ?i p:P625/psv:P625 [ wikibase:geoLatitude ?lat ; wikibase:geoLongitude ?lon ] . FILTER(?lat > 35 && ?lat < 60 && ?lon > -12 && ?lon < 25) {LABELS}
      OPTIONAL {{ ?i wdt:P571 ?inc }} OPTIONAL {{ ?i wdt:P380 ?mh }} OPTIONAL {{ ?i wdt:P131 ?c . ?c rdfs:label ?cl FILTER(lang(?cl)='fr') }} }}"""):
        rows.append({**base(b), 'lat': r5(b['lat']), 'lon': r5(b['lon']), 'y': year_of(b.get('inc')), 'mh': b.get('mh') or '', 'com': b.get('cl') or ''})
    rows = [r for r in merge(rows) if r['n'] and not re.match(r'^Q\d+$', r['n'])]
    save('relais', {'title': 'Relais de poste aux chevaux', 'url': 'https://www.wikidata.org/wiki/Q28532565',
        'note': 'Relais de poste (Q28532565), auberges-relais (Q966002) et monuments historiques nommés « relais de poste » sur Wikidata. Liste incomplète : le Livre de poste (domaine public) donne tous les relais de chaque route.',
        'livre': {'title': 'Livre de poste, ou État général des postes du royaume de France (1841)', 'url': 'https://archive.org/details/livredeposteout00frangoog', 'licence': 'domaine public'}}, rows)


def algerie():
    rows = []
    for b in sparql(f"""SELECT ?i ?lfr ?len ?wp ?inc ?lat ?lon ?alt ?tl WHERE {{
      ?i wdt:P17 wd:Q262 ; wdt:P571 ?inc ; p:P625/psv:P625 [ wikibase:geoLatitude ?lat ; wikibase:geoLongitude ?lon ] .
      FILTER(YEAR(?inc) >= 1830 && YEAR(?inc) <= 1962) {LABELS}
      OPTIONAL {{ ?i skos:altLabel ?alt FILTER(lang(?alt)='fr') }} OPTIONAL {{ ?i wdt:P31 ?t . ?t rdfs:label ?tl FILTER(lang(?tl)='fr') }} }}"""):
        rows.append({**base(b), 'd': day_of(b['inc']) or str(year_of(b['inc'])), 'y': year_of(b['inc']), 'lat': r5(b['lat']), 'lon': r5(b['lon']), 'alt': [b['alt']] if b.get('alt') else [], 'k': b.get('tl') or ''})
    out = {}
    for r in rows:
        o = out.setdefault(r['q'], r)
        if o is not r:
            o['alt'] = sorted(set(o['alt'] + r['alt']))
            if r['k'] and r['k'] not in o['k'].split(' · '): o['k'] = (o['k'] + ' · ' + r['k']).strip(' ·')
    # seulement les lieux habités (communes, villes, villages…), pas les jardins, écoles, monuments
    PLACE = re.compile(r'commune|ville|village|localit|agglom|chef-lieu|da[iï]ra|bourg|hameau|cit[ée]|douar|oasis|port', re.I)
    rows = [r for r in out.values() if r['n'] and not re.match(r'^Q\d+$', r['n']) and PLACE.search(r['k']) and not re.search(r'h[ôo]tel|a[ée]roport|b[âa]timent|gare|mosqu|[ée]glise', r['k'] + ' ' + r['n'], re.I)]
    rows.sort(key=lambda r: r['y'])
    save('algerie', {'title': 'Villages et communes d’Algérie créés entre 1830 et 1962', 'url': 'https://www.wikidata.org/wiki/Q262',
        'note': 'Localités d’Algérie dont Wikidata donne la date de création (P571) entre 1830 et 1962, avec leurs autres noms en français (souvent le nom de l’époque coloniale).'}, rows)


def quebec():
    rows = []
    for b in sparql(f"""SELECT ?i ?lfr ?len ?wp ?id ?inc ?lat ?lon ?tl WHERE {{
      ?i wdt:P633 ?id ; p:P625/psv:P625 [ wikibase:geoLatitude ?lat ; wikibase:geoLongitude ?lon ] . {LABELS}
      OPTIONAL {{ ?i wdt:P571 ?inc }} OPTIONAL {{ ?i wdt:P31 ?t . ?t rdfs:label ?tl FILTER(lang(?tl)='fr') }} }}"""):
        rows.append({**base(b), 'rpcq': b['id'], 'y': year_of(b.get('inc')), 'lat': r5(b['lat']), 'lon': r5(b['lon']), 'k': b.get('tl') or ''})
    rows = [r for r in merge(rows) if r['n'] and not re.match(r'^Q\d+$', r['n'])]
    save('quebec', {'title': 'Patrimoine culturel du Québec (biens inscrits au Répertoire)', 'url': 'https://www.wikidata.org/wiki/Property:P633',
        'rpcq_url': 'https://www.patrimoine-culturel.gouv.qc.ca/rpcq/detail.do?methode=consulter&id={id}&type=bien',
        'note': 'Les biens qui ont un identifiant du Répertoire du patrimoine culturel du Québec (P633) sur Wikidata : nom, position, date. Les fiches du Répertoire ne sont pas copiées (licence non vérifiée : site injoignable) ; chaque bien a un lien vers sa fiche.'}, rows)


def suisse():
    rows = []
    for b in sparql(f"""SELECT ?i ?lfr ?len ?lde ?wp ?hls ?lat ?lon ?end WHERE {{
      VALUES ?t {{ wd:Q70208 wd:Q685309 }} ?i wdt:P31 ?t ; wdt:P902 ?hls ; p:P625/psv:P625 [ wikibase:geoLatitude ?lat ; wikibase:geoLongitude ?lon ] . {LABELS}
      OPTIONAL {{ ?i rdfs:label ?lde FILTER(lang(?lde)='de') }} OPTIONAL {{ ?i wdt:P576 ?end }} }}"""):
        rows.append({'q': q_of(b['i']), 'n': b.get('lfr') or b.get('lde') or b.get('len') or '', 'wp': b.get('wp') or '', 'hls': b['hls'], 'lat': r5(b['lat']), 'lon': r5(b['lon']), 'e': year_of(b.get('end'))})
    rows = [r for r in merge(rows) if r['n']]
    save('suisse', {'title': 'Communes suisses et leur article du Dictionnaire historique de la Suisse', 'url': 'https://www.wikidata.org/wiki/Property:P902',
        'hls_url': 'https://hls-dhs-dss.ch/fr/articles/{id}/',
        'note': 'Le lien entre chaque commune suisse et son article du DHS vient de Wikidata (P902). Les textes du DHS ne sont pas copiés (licence non vérifiée : site injoignable) ; lien seulement.'}, rows)


if __name__ == '__main__':
    todo = sys.argv[1:] or ['avalanches', 'relais', 'algerie', 'suisse', 'quebec', 'epaves']
    for n in todo:
        print('→', n, file=sys.stderr); globals()[n]()
