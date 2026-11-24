#!/usr/bin/env python3
"""LCNDA — 🧭 Histoire autour : fabrique les fichiers assets/data/ha-*.json.gz.

  python3 scripts/histoire-autour/build.py [--cache DOSSIER] [--only batailles,voies,compostelle,institutions,catastrophes,navires,phares]

Sources (toutes téléchargées, licence lue) :
  ⚔️ batailles, 🏥 institutions, ⚓ navires, 🗼 phares : Wikidata (CC0), requêtes SPARQL ci-dessous ;
  🛣️ voies romaines : Itiner-e static version 2024, de Soto et al. 2025, Zenodo 10.5281/zenodo.17122148 (CC BY 4.0) ;
  🐚 chemins de Compostelle : OpenStreetMap, relations route=foot/hiking (Overpass), © OpenStreetMap contributors (ODbL) ;
  🌋 catastrophes : NOAA NCEI/WDS, Global Significant Earthquake / Volcanic Eruptions / Tsunami databases (domaine public, US Gov) ;
  🗼 portée des phares : Wikidata P2929 (portée lumineuse) puis OpenStreetMap seamark:light:range (ODbL) pour compléter.
Chaque fichier porte sa source, sa licence, son lien et la date de fabrication.
"""
import argparse
import csv
import datetime
import io
import json
import math
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ha_common import (cached, encode_line, http, km, overpass, qid, simplify, sparql, wd_date, wkt_point, write_gz)  # noqa: E402

TODAY = datetime.date.today().isoformat()
WD_SRC = {'source': 'Wikidata', 'licence': 'CC0 1.0', 'url': 'https://www.wikidata.org', 'built': TODAY}


def batches(seq, n):
    for i in range(0, len(seq), n):
        yield seq[i:i + n]


def label_query(ids, extra='', extra_vars=''):
    vals = ' '.join(f'wd:{q}' for q in ids)
    return f'''SELECT ?it ?fr ?en ?frw {extra_vars} WHERE {{
  VALUES ?it {{ {vals} }}
  OPTIONAL {{ ?it rdfs:label ?fr FILTER(LANG(?fr)="fr") }}
  OPTIONAL {{ ?it rdfs:label ?en FILTER(LANG(?en)="en") }}
  OPTIONAL {{ ?frw schema:about ?it ; schema:isPartOf <https://fr.wikipedia.org/> }}
  {extra}
}}'''


def labels_of(cache, name, ids):
    """{Qid: libellé fr (sinon en)} pour une liste d'entités"""
    out = {}
    ids = sorted(set(i for i in ids if i))
    for k, b in enumerate(batches(ids, 400)):
        for r in sparql(cache, f'{name}-lab{k}', label_query(b)):
            q = qid(r['it'])
            out.setdefault(q, r.get('fr') or r.get('en') or '')
    return out


def precise(v, prec):
    """date Wikidata + précision (11 jour, 10 mois, 9 année) → (année, 'AAAA-MM-JJ' | 'AAAA-MM' | '')"""
    y, d = wd_date(v)
    if y is None:
        return None, ''
    p = int(prec or 9)
    if p >= 11 and d:
        return y, d
    if p == 10 and d:
        return y, d[:7]
    return y, ''


def details(cache, name, ids, props):
    """attributs « valeur-entité » (libellés) par lot : {Qid: {prop: [libellé, …]}}"""
    out = {q: {p: [] for p in props} for q in ids}
    opt = '\n'.join(f'OPTIONAL {{ ?it wdt:{p} ?v_{p} . OPTIONAL {{ ?v_{p} rdfs:label ?l_{p} FILTER(LANG(?l_{p})="fr") }} OPTIONAL {{ ?v_{p} rdfs:label ?e_{p} FILTER(LANG(?e_{p})="en") }} }}' for p in props)
    for k, b in enumerate(batches(sorted(ids), 150)):
        vals = ' '.join(f'wd:{q}' for q in b)
        sel = ' '.join(f'?v_{p} ?l_{p} ?e_{p}' for p in props)
        q = f'SELECT ?it {sel} WHERE {{ VALUES ?it {{ {vals} }} {opt} }}'
        for r in sparql(cache, f'{name}-det{k}', q):
            it = qid(r['it'])
            for p in props:
                lab = r.get(f'l_{p}') or r.get(f'e_{p}') or ''
                if lab and not re.match(r'^Q\d+$', lab) and lab not in out[it][p]:
                    out[it][p].append(lab)
    return out


# ═══════════════════════ ⚔️ batailles et sièges ═══════════════════════
def build_batailles(cache):
    q = '''SELECT ?b ?d ?dp ?s ?sp ?e ?ep ?c WHERE {
  { ?b wdt:P31/wdt:P279* wd:Q178561 } UNION { ?b wdt:P31/wdt:P279* wd:Q188055 }
  ?b wdt:P625 ?c .
  OPTIONAL { ?b p:P585/psv:P585 [wikibase:timeValue ?d; wikibase:timePrecision ?dp] }
  OPTIONAL { ?b p:P580/psv:P580 [wikibase:timeValue ?s; wikibase:timePrecision ?sp] }
  OPTIONAL { ?b p:P582/psv:P582 [wikibase:timeValue ?e; wikibase:timePrecision ?ep] }
  FILTER(BOUND(?d) || BOUND(?s))
}'''
    base = {}
    for r in sparql(cache, 'batailles', q):
        b = qid(r['b'])
        pt = wkt_point(r.get('c'))
        if not pt:
            continue
        y, d = precise(r.get('d') or r.get('s'), r.get('dp') or r.get('sp'))
        y2, d2 = precise(r.get('e'), r.get('ep')) if r.get('e') else (None, '')
        if y is None:
            continue
        cur = base.get(b)
        if cur and (cur['d'] and not d or cur['y'] <= y):  # garder la date la plus précise / la plus ancienne
            continue
        base[b] = {'y': y, 'd': d, 'y2': y2 if y2 and y2 >= y else None, 'd2': d2 if y2 and y2 >= y else '', 'lat': pt[0], 'lon': pt[1]}
    ids = sorted(base)
    print(f'⚔️ {len(ids)} batailles et sièges datés et placés', flush=True)
    labs = {}
    for k, b in enumerate(batches(ids, 400)):
        for r in sparql(cache, f'bat-lab{k}', label_query(b)):
            labs.setdefault(qid(r['it']), (r.get('fr') or r.get('en') or '', r.get('frw', '')))
    det = details(cache, 'bat', ids, ['P361', 'P710', 'P276', 'P17'])
    # les guerres : P361 « fait partie de » ; on garde celles qui sont des guerres (Q198) ou des conflits (Q180684)
    wars_q = sparql(cache, 'guerres', '''SELECT DISTINCT ?w WHERE { { ?w wdt:P31/wdt:P279* wd:Q198 } UNION { ?w wdt:P31/wdt:P279* wd:Q180684 } UNION { ?w wdt:P31/wdt:P279* wd:Q350604 } }''')
    wars = {qid(r['w']) for r in wars_q}
    part_ids = {}
    for k, b in enumerate(batches(ids, 300)):
        vals = ' '.join(f'wd:{q}' for q in b)
        for r in sparql(cache, f'bat-part{k}', f'SELECT ?it ?w WHERE {{ VALUES ?it {{ {vals} }} ?it wdt:P361 ?w }}'):
            part_ids.setdefault(qid(r['it']), []).append(qid(r['w']))
    wl = labels_of(cache, 'bat-wars', [w for v in part_ids.values() for w in v])
    rows = []
    for b in ids:
        x = base[b]
        name, frw = labs.get(b, ('', ''))
        if not name or re.match(r'^Q\d+$', name):
            continue
        war_ids = [w for w in part_ids.get(b, []) if w in wars] or part_ids.get(b, [])
        war = next((wl[w] for w in war_ids if wl.get(w)), '')
        bel = [p for p in det[b]['P710'] if p][:6]
        loc = (det[b]['P276'] or [''])[0]
        country = (det[b]['P17'] or [''])[0]
        rows.append([b, name, x['y'], x['d'], x['y2'], x['d2'], x['lat'], x['lon'], war, '|'.join(bel), loc, country, frw.rsplit('/', 1)[-1] if frw else ''])
    rows.sort(key=lambda r: (r[2], r[3]))
    meta = dict(WD_SRC, what='Batailles et sièges (Wikidata : nature = bataille Q178561 ou siège Q188055, avec date et coordonnées)')
    return write_gz('ha-batailles.json.gz', {**meta, 'fields': ['q', 'n', 'y', 'd', 'y2', 'd2', 'lat', 'lon', 'war', 'bel', 'loc', 'country', 'frwiki'], 'rows': rows}), len(rows)


# ═══════════════════════ 🛣️ voies romaines (Itiner-e) ═══════════════════════
def merc_to_ll(x, y):
    """EPSG:3395 (Mercator ellipsoïdal, WGS84) → (lat, lon)"""
    a, e = 6378137.0, 0.0818191908426
    lon = math.degrees(x / a)
    t = math.exp(-y / a)
    phi = math.pi / 2 - 2 * math.atan(t)
    for _ in range(8):
        es = e * math.sin(phi)
        phi = math.pi / 2 - 2 * math.atan(t * ((1 - es) / (1 + es)) ** (e / 2))
    return math.degrees(phi), lon


def build_voies(cache):
    url = 'https://zenodo.org/api/records/17122148/files/itinere_roads.geojson/content'
    raw = cached(cache, 'itinere_roads.geojson', lambda: http(url, timeout=900))
    d = json.loads(raw)
    by = {}
    for f in d['features']:
        p = f['properties']
        g = f['geometry']
        lines = g['coordinates'] if g['type'] == 'MultiLineString' else [g['coordinates']]
        name = (p.get('Name') or '').strip()
        kind = 1 if p.get('Type') == 'Main Road' else 0
        cert = {'Certain': 2, 'Conjectured': 1, 'Hypothetical': 0}.get(p.get('Segment_s'), 1)
        lo = p.get('Lower_Date')
        up = p.get('Upper_Date')
        lo = int(lo) if lo is not None and lo != 9999 else None
        up = int(up) if up is not None and up != 9999 else None
        itin = (p.get('Itinerary') or '').strip()
        for ln in lines:
            pts = [merc_to_ll(c[0], c[1]) for c in ln]
            pts = simplify([(la, lo_) for la, lo_ in pts], 0.0012)  # ≈ 100 m
            if len(pts) < 2:
                continue
            key = (name, kind, cert, lo, up, itin)
            by.setdefault(key, []).append(encode_line(pts))
    names = sorted({k[0] for k in by})
    nidx = {n: i for i, n in enumerate(names)}
    itins = sorted({k[5] for k in by})
    iidx = {n: i for i, n in enumerate(itins)}
    rows = [[nidx[k[0]], k[1], k[2], k[3], k[4], iidx[k[5]], v] for k, v in sorted(by.items(), key=lambda kv: kv[0][0])]
    n_pts = sum(len(l) // 2 for r in rows for l in r[6])
    print(f'🛣️ {len(rows)} voies, {n_pts} points après simplification (≈ 100 m)', flush=True)
    meta = {'source': 'Itiner-e static version 2024 — de Soto, P., Pažout, A., Brughmans, T. et al. (2025), A High-Resolution Dataset of Roads of the Roman Empire, Zenodo',
            'licence': 'CC BY 4.0', 'url': 'https://doi.org/10.5281/zenodo.17122148', 'paper': 'https://doi.org/10.1038/s41597-025-06140-z', 'site': 'https://itiner-e.org',
            'built': TODAY, 'note': 'Tracés simplifiés par LCNDA (Douglas-Peucker ≈ 100 m), coordonnées au 1/10 000 de degré.',
            'what': 'Routes de l’Empire romain (vers 300 av. J.-C. – 300 apr. J.-C.)'}
    return write_gz('ha-voies-romaines.json.gz', {**meta, 'q': 10000, 'names': names, 'itin': itins, 'fields': ['name', 'main', 'cert', 'from', 'to', 'itin', 'lines'], 'rows': rows}), len(rows)


# ═══════════════════════ 🐚 chemins de Compostelle (OSM) ═══════════════════════
def build_compostelle(cache):
    q = '''[out:json][timeout:800];
relation["route"~"^(hiking|foot)$"]["name"~"(Compostel|Santiago|Jacques|Jakobsweg|Jacobs|Camino|Jakub|Jacob|Jacopo|Caminho)",i];
out tags;'''
    rels = overpass(cache, 'compostelle-list', q)['elements']
    keep = []
    for r in rels:
        t = r.get('tags', {})
        nm = t.get('name:fr') or t.get('name') or ''
        if not re.search(r'compostel|santiago|jacques|jakobs|jacobs|camino|jakub|caminho|jacopo|sint-jacob', nm, re.I):
            continue
        if t.get('type') not in (None, 'route'):
            continue
        keep.append(r)
    print(f'🐚 {len(keep)} relations nommées', flush=True)
    rows = []
    for k, b in enumerate(batches([r['id'] for r in keep], 40)):
        ids = ','.join(str(i) for i in b)
        res = overpass(cache, f'compostelle-geom{k}', f'[out:json][timeout:800];relation(id:{ids});out geom;')
        for r in res['elements']:
            t = r.get('tags', {})
            lines = []
            for m in r.get('members', []):
                if m.get('type') == 'way' and m.get('geometry'):
                    pts = [(g['lat'], g['lon']) for g in m['geometry']]
                    pts = simplify(pts, 0.002)  # ≈ 200 m
                    if len(pts) >= 2:
                        lines.append(encode_line(pts))
            if not lines:
                continue
            nm = t.get('name:fr') or t.get('name') or ''
            rows.append([r['id'], nm, t.get('name', ''), t.get('ref', ''), t.get('network', ''), t.get('from', ''), t.get('to', ''), t.get('wikidata', ''), t.get('website', '') or t.get('url', ''), lines])
    rows.sort(key=lambda r: r[1])
    n_pts = sum(len(l) // 2 for r in rows for l in r[9])
    print(f'🐚 {len(rows)} chemins, {n_pts} points (≈ 200 m)', flush=True)
    meta = {'source': 'OpenStreetMap (relations de randonnée nommées pour Saint-Jacques-de-Compostelle, via Overpass)', 'licence': 'ODbL 1.0',
            'mention': '© OpenStreetMap contributors', 'url': 'https://www.openstreetmap.org/copyright', 'built': TODAY,
            'note': 'Tracés simplifiés par LCNDA (≈ 200 m), coordonnées au 1/10 000 de degré. Ce sont les chemins balisés d’aujourd’hui, souvent sur le tracé historique.'}
    return write_gz('ha-compostelle.json.gz', {**meta, 'q': 10000, 'fields': ['osm', 'name', 'name0', 'ref', 'network', 'from', 'to', 'wikidata', 'web', 'lines'], 'rows': rows}), len(rows)


# ═══════════════════════ 🏥 institutions ═══════════════════════
INST = [  # (clé, Qid de la classe, libellé)
    ('hopital', 'Q16917', 'hôpital'),
    ('hoteldieu', 'Q1503158', 'hôtel-Dieu'),
    ('hospice', 'Q2416723', 'hospice'),
    ('orphelinat', 'Q228371', 'orphelinat'),
    ('enfants', 'Q2101917', 'hospice des enfants trouvés'),
    ('tour', 'Q1069186', 'tour d’abandon'),
    ('prison', 'Q40357', 'prison'),
    ('bagne', 'Q1752541', 'bagne'),
    ('asile', 'Q847208', 'asile d’aliénés'),
    ('couvent', 'Q44613', 'monastère, couvent'),
    ('leproserie', 'Q817056', 'léproserie'),
]


def build_institutions(cache):
    base = {}
    for key, cls, lab in INST:
        q = f'''SELECT ?it ?c ?inc ?dis ?country WHERE {{
  ?it wdt:P31/wdt:P279* wd:{cls} ; wdt:P625 ?c .
  OPTIONAL {{ ?it wdt:P571 ?inc }} OPTIONAL {{ ?it wdt:P576 ?dis }} OPTIONAL {{ ?it wdt:P17 ?country }}
  FILTER(!BOUND(?country) || ?country IN (wd:Q142, wd:Q31, wd:Q39, wd:Q32, wd:Q38, wd:Q29, wd:Q183, wd:Q55, wd:Q145, wd:Q27, wd:Q45, wd:Q40, wd:Q233, wd:Q16, wd:Q30, wd:Q36, wd:Q213, wd:Q35, wd:Q34, wd:Q20))
}}'''
        n = 0
        for r in sparql(cache, f'inst-{key}', q):
            it = qid(r['it'])
            pt = wkt_point(r.get('c'))
            if not pt:
                continue
            y1 = wd_date(r.get('inc'))[0]
            y2 = wd_date(r.get('dis'))[0]
            x = base.setdefault(it, {'k': [], 'lat': pt[0], 'lon': pt[1], 'from': y1, 'to': y2, 'c': qid(r.get('country', ''))})
            if key not in x['k']:
                x['k'].append(key)
            if y1 is not None and (x['from'] is None or y1 < x['from']):
                x['from'] = y1
            if y2 is not None and (x['to'] is None or y2 > x['to']):
                x['to'] = y2
            n += 1
        print(f'🏥 {key} : {n}', flush=True)
    ids = sorted(base)
    labs = {}
    for k, b in enumerate(batches(ids, 400)):
        for r in sparql(cache, f'inst-lab{k}', label_query(b)):
            labs.setdefault(qid(r['it']), (r.get('fr') or r.get('en') or '', r.get('frw', '')))
    det = details(cache, 'inst', ids, ['P131'])
    cl = labels_of(cache, 'inst-c', [base[i]['c'] for i in ids])
    rows = []
    for it in ids:
        x = base[it]
        name, frw = labs.get(it, ('', ''))
        if not name or re.match(r'^Q\d+$', name):
            continue
        rows.append([it, name, ','.join(x['k']), x['from'], x['to'], x['lat'], x['lon'], (det[it]['P131'] or [''])[0], cl.get(x['c'], ''), frw.rsplit('/', 1)[-1] if frw else ''])
    rows.sort(key=lambda r: r[1])
    meta = dict(WD_SRC, what='Hôpitaux, hôtels-Dieu, hospices, orphelinats et enfants trouvés, prisons, bagnes, asiles, couvents, léproseries (Wikidata, avec coordonnées ; Europe de l’Ouest et Amérique du Nord)',
                kinds={k: l for k, _, l in INST})
    return write_gz('ha-institutions.json.gz', {**meta, 'fields': ['q', 'n', 'kinds', 'from', 'to', 'lat', 'lon', 'commune', 'country', 'frwiki'], 'rows': rows}), len(rows)


# ═══════════════════════ 🌋 catastrophes (NOAA NCEI) ═══════════════════════
NOAA = 'https://www.ngdc.noaa.gov/hazel/hazard-service/api/v1/'


def noaa_all(cache, kind):
    out, page = [], 1
    while True:
        raw = cached(cache, f'noaa-{kind.replace("/", "-")}-{page}.json', lambda: http(f'{NOAA}{kind}?page={page}&itemsPerPage=1000'))
        d = json.loads(raw)
        out += d['items']
        if page >= d.get('totalPages', 1):
            return out
        page += 1


def build_catastrophes(cache):
    rows = []
    for it in noaa_all(cache, 'earthquakes'):
        if it.get('latitude') is None or it.get('year') is None:
            continue
        deaths = it.get('deathsTotal', it.get('deaths'))
        rows.append(['eq', it['id'], it['year'], it.get('month'), it.get('day'), round(it['latitude'], 3), round(it['longitude'], 3), (it.get('locationName') or '').strip(), (it.get('country') or '').title(),
                     it.get('eqMagnitude'), it.get('intensity'), deaths, it.get('deathsAmountOrderTotal'), it.get('housesDestroyedTotal', it.get('housesDestroyed')), 1 if it.get('tsunamiEventId') else 0, ''])
    for it in noaa_all(cache, 'volcanoes'):
        if it.get('latitude') is None or it.get('year') is None:
            continue
        rows.append(['vo', it['id'], it['year'], it.get('month'), it.get('day'), round(it['latitude'], 3), round(it['longitude'], 3), (it.get('location') or '').strip(), it.get('country') or '',
                     it.get('vei'), None, it.get('deathsTotal', it.get('deaths')), it.get('deathsAmountOrderTotal'), it.get('housesDestroyedTotal', it.get('housesDestroyed')), 1 if it.get('tsunamiEventId') else 0, it.get('name') or ''])
    for it in noaa_all(cache, 'tsunamis/events'):
        if it.get('latitude') is None or it.get('year') is None or (it.get('eventValidity') or 0) < 3:
            continue
        rows.append(['ts', it['id'], it['year'], it.get('month'), it.get('day'), round(it['latitude'], 3), round(it['longitude'], 3), (it.get('locationName') or '').strip(), (it.get('country') or '').title(),
                     it.get('maxWaterHeight'), it.get('tsIntensity'), it.get('deathsTotal', it.get('deaths')), it.get('deathsAmountOrderTotal'), it.get('housesDestroyedTotal', it.get('housesDestroyed')), 0, ''])
    rows.sort(key=lambda r: (r[2], r[3] or 0, r[4] or 0))
    print(f'🌋 {len(rows)} événements NOAA', flush=True)
    meta = {'source': 'NOAA National Centers for Environmental Information (NCEI/WDS) : Global Significant Earthquake Database (doi:10.7289/V5TD9V7K), Global Significant Volcanic Eruptions Database (doi:10.7289/V5JW8BSH), Global Historical Tsunami Database (doi:10.7289/V5PN93H7)',
            'licence': 'Domaine public (données du gouvernement des États-Unis)', 'url': 'https://www.ngdc.noaa.gov/hazard/', 'built': TODAY,
            'note': 'Séismes : magnitude, intensité (Mercalli modifiée) ; éruptions : indice d’explosivité (VEI) et nom du volcan ; tsunamis : hauteur d’eau maximale (m). Morts : total, conséquences comprises.'}
    return write_gz('ha-catastrophes.json.gz', {**meta, 'fields': ['k', 'id', 'y', 'm', 'd', 'lat', 'lon', 'loc', 'country', 'mag', 'int', 'deaths', 'deathsOrder', 'houses', 'tsunami', 'volcano'], 'rows': rows}), len(rows)


# ═══════════════════════ ⚓ navires ═══════════════════════
def build_navires(cache):
    # les navires (Q11446 et sous-classes) ayant une date de mise à l'eau, de mise en service ou de construction
    q = '''SELECT ?s ?l ?srv ?inc ?dec ?wreck ?dis WHERE {
  ?s wdt:P31/wdt:P279* wd:Q11446 .
  OPTIONAL { ?s wdt:P1191 ?l } OPTIONAL { ?s wdt:P729 ?srv } OPTIONAL { ?s wdt:P571 ?inc }
  OPTIONAL { ?s wdt:P730 ?dec } OPTIONAL { ?s wdt:P5045 ?wreck } OPTIONAL { ?s wdt:P576 ?dis }
  FILTER(BOUND(?l) || BOUND(?srv) || BOUND(?inc))
}'''
    base = {}
    for r in sparql(cache, 'navires', q):
        s = qid(r['s'])
        y0 = wd_date(r.get('l'))[0] or wd_date(r.get('srv'))[0] or wd_date(r.get('inc'))[0]
        if y0 is None:
            continue
        y1 = wd_date(r.get('dec'))[0] or wd_date(r.get('wreck'))[0] or wd_date(r.get('dis'))[0]
        x = base.setdefault(s, {'from': y0, 'to': y1, 'wreck': wd_date(r.get('wreck'))[0]})
        x['from'] = min(x['from'], y0)
        if y1 is not None:
            x['to'] = max(x['to'] or y1, y1)
    ids = sorted(base)
    print(f'⚓ {len(ids)} navires datés', flush=True)
    labs = {}
    for k, b in enumerate(batches(ids, 400)):
        for r in sparql(cache, f'nav-lab{k}', label_query(b)):
            labs.setdefault(qid(r['it']), (r.get('fr') or r.get('en') or '', r.get('frw', '')))
    det = details(cache, 'nav', ids, ['P31', 'P504', 'P8047', 'P17', 'P137'])
    img = {}
    for k, b in enumerate(batches(ids, 400)):
        vals = ' '.join(f'wd:{q}' for q in b)
        for r in sparql(cache, f'nav-img{k}', f'SELECT ?it (SAMPLE(?i) AS ?img) WHERE {{ VALUES ?it {{ {vals} }} ?it wdt:P18 ?i }} GROUP BY ?it'):
            img[qid(r['it'])] = r['img'].rsplit('/', 1)[-1]
    rows = []
    for s in ids:
        x = base[s]
        name, frw = labs.get(s, ('', ''))
        if not name or re.match(r'^Q\d+$', name):
            continue
        d = det[s]
        rows.append([s, name, (d['P31'] or [''])[0], x['from'], x['to'], x['wreck'], (d['P504'] or [''])[0], (d['P8047'] or d['P17'] or [''])[0], (d['P137'] or [''])[0], img.get(s, ''), frw.rsplit('/', 1)[-1] if frw else ''])
    rows.sort(key=lambda r: r[1].lower())
    meta = dict(WD_SRC, what='Navires (Wikidata : navire Q11446 et sous-classes, avec date de mise à l’eau, de mise en service ou de construction)')
    return write_gz('ha-navires.json.gz', {**meta, 'fields': ['q', 'n', 'type', 'from', 'to', 'wreck', 'port', 'flag', 'operator', 'img', 'frwiki'], 'rows': rows}), len(rows)


# ═══════════════════════ 🗼 phares ═══════════════════════
def nm_of(v):
    """« 22 », « 22.5 », « 22;18 » → milles marins (le plus grand)"""
    if v is None:
        return None
    nums = [float(x) for x in re.findall(r'\d+(?:\.\d+)?', str(v).replace(',', '.'))]
    nums = [n for n in nums if 0 < n < 60]
    return max(nums) if nums else None


def build_phares(cache):
    q = '''SELECT ?it ?c ?inc ?lit ?dis ?h ?hu ?fh ?fhu ?rg ?rgu ?country WHERE {
  ?it wdt:P31/wdt:P279* wd:Q39715 ; wdt:P625 ?c .
  OPTIONAL { ?it wdt:P571 ?inc } OPTIONAL { ?it wdt:P729 ?lit } OPTIONAL { ?it wdt:P730 ?dis }
  OPTIONAL { ?it p:P2048/psv:P2048 [wikibase:quantityAmount ?h; wikibase:quantityUnit ?hu] }
  OPTIONAL { ?it p:P2923/psv:P2923 [wikibase:quantityAmount ?fh; wikibase:quantityUnit ?fhu] }
  OPTIONAL { ?it p:P2929/psv:P2929 [wikibase:quantityAmount ?rg; wikibase:quantityUnit ?rgu] }
  OPTIONAL { ?it wdt:P17 ?country }
}'''
    unit_m = {'Q11573': 1.0, 'Q3710': 0.3048}
    unit_nm = {'Q93318': 1.0, 'Q828224': 1 / 1.852, 'Q11573': 1 / 1852}
    base = {}
    for r in sparql(cache, 'phares', q):
        it = qid(r['it'])
        pt = wkt_point(r.get('c'))
        if not pt:
            continue
        x = base.setdefault(it, {'lat': pt[0], 'lon': pt[1], 'from': None, 'lit': None, 'to': None, 'h': None, 'fh': None, 'rg': None, 'c': qid(r.get('country', ''))})
        for k, v in (('from', r.get('inc')), ('lit', r.get('lit')), ('to', r.get('dis'))):
            y = wd_date(v)[0]
            if y is not None and (x[k] is None or y < x[k]):
                x[k] = y
        for k, v, u, conv in (('h', r.get('h'), r.get('hu'), unit_m), ('fh', r.get('fh'), r.get('fhu'), unit_m), ('rg', r.get('rg'), r.get('rgu'), unit_nm)):
            if v is None:
                continue
            f = conv.get(qid(u or ''))
            if f is None:
                continue
            val = round(float(v) * f, 1)
            if val > 0 and (x[k] is None or val > x[k]):
                x[k] = val
    ids = sorted(base)
    print(f'🗼 {len(ids)} phares placés ; {sum(1 for i in ids if base[i]["rg"])} avec portée Wikidata', flush=True)
    labs = {}
    for k, b in enumerate(batches(ids, 400)):
        for r in sparql(cache, f'ph-lab{k}', label_query(b)):
            labs.setdefault(qid(r['it']), (r.get('fr') or r.get('en') or '', r.get('frw', '')))
    img = {}
    for k, b in enumerate(batches(ids, 400)):
        vals = ' '.join(f'wd:{q}' for q in b)
        for r in sparql(cache, f'ph-img{k}', f'SELECT ?it (SAMPLE(?i) AS ?img) WHERE {{ VALUES ?it {{ {vals} }} ?it wdt:P18 ?i }} GROUP BY ?it'):
            img[qid(r['it'])] = r['img'].rsplit('/', 1)[-1]
    cl = labels_of(cache, 'ph-c', [base[i]['c'] for i in ids])
    # la portée manquante : OpenStreetMap (seamark:light:range), le feu le plus proche à 300 m au plus
    osm = []
    try:
        for k, bb in enumerate(['-60,-180,0,0', '0,-180,75,0', '-60,0,0,180', '0,0,75,180']):
            res = overpass(cache, f'phares-osm{k}', f'[out:json][timeout:800][bbox:{bb}];(node["man_made"="lighthouse"]["seamark:light:range"];node["seamark:type"="light_major"]["seamark:light:range"];);out tags center;')
            for e in res['elements']:
                rg = nm_of(e['tags'].get('seamark:light:range') or e['tags'].get('seamark:light:1:range'))
                if rg and e.get('lat') is not None:
                    osm.append((e['lat'], e['lon'], rg, e['id']))
    except Exception as e:  # Overpass indisponible : on garde Wikidata seul et on le dit
        print(f'  ⚠️ OpenStreetMap indisponible ({e}) : portées de Wikidata seulement', flush=True)
    grid = {}
    for la, lo, rg, oid in osm:
        grid.setdefault((round(la, 1), round(lo, 1)), []).append((la, lo, rg, oid))
    rows, from_osm = [], 0
    for it in ids:
        x = base[it]
        name, frw = labs.get(it, ('', ''))
        if not name or re.match(r'^Q\d+$', name):
            continue
        rs = 'wd' if x['rg'] else ''
        osm_id = None
        if not x['rg']:
            best = None
            for dla in (-0.1, 0, 0.1):
                for dlo in (-0.1, 0, 0.1):
                    for la, lo, rg, oid in grid.get((round(x['lat'] + dla, 1), round(x['lon'] + dlo, 1)), []):
                        dk = km(x['lat'], x['lon'], la, lo)
                        if dk <= 0.3 and (best is None or dk < best[0]):
                            best = (dk, rg, oid)
            if best:
                x['rg'], rs, osm_id = best[1], 'osm', best[2]
                from_osm += 1
        rows.append([it, name, x['from'], x['lit'], x['to'], x['lat'], x['lon'], x['h'], x['fh'], x['rg'], rs, osm_id, cl.get(x['c'], ''), img.get(it, ''), frw.rsplit('/', 1)[-1] if frw else ''])
    rows.sort(key=lambda r: r[1].lower())
    print(f'🗼 {len(rows)} phares ; portée : {sum(1 for r in rows if r[10] == "wd")} Wikidata + {from_osm} OSM', flush=True)
    meta = dict(WD_SRC, what='Phares (Wikidata : phare Q39715, coordonnées ; hauteur P2048, hauteur focale P2923, portée P2929, mise en service P729, création P571)',
                range_osm={'source': 'OpenStreetMap, balise seamark:light:range (portée en milles marins), le feu à 300 m au plus du phare', 'licence': 'ODbL 1.0', 'mention': '© OpenStreetMap contributors', 'url': 'https://www.openstreetmap.org/copyright'})
    return write_gz('ha-phares.json.gz', {**meta, 'fields': ['q', 'n', 'from', 'lit', 'to', 'lat', 'lon', 'height', 'focal', 'range', 'rangeSrc', 'osm', 'country', 'img', 'frwiki'], 'rows': rows}), len(rows)


STEPS = {'batailles': build_batailles, 'voies': build_voies, 'compostelle': build_compostelle, 'institutions': build_institutions,
         'catastrophes': build_catastrophes, 'navires': build_navires, 'phares': build_phares}

if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--cache', default=os.path.join(os.path.dirname(os.path.abspath(__file__)), '.cache'))
    ap.add_argument('--only', default=','.join(STEPS))
    a = ap.parse_args()
    for k in a.only.split(','):
        size, n = STEPS[k](a.cache)
        print(f'✓ {k} : {n} lignes, {size / 1e6:.2f} Mo', flush=True)
