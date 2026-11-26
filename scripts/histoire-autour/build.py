#!/usr/bin/env python3
"""LCNDA — 🧭 Histoire autour : fabrique les fichiers assets/data/ha-*.json.gz.

  python3 scripts/histoire-autour/build.py [--cache DOSSIER] [--only batailles,guerres,voies,compostelle,institutions,catastrophes,navires,phares]

Sources (toutes téléchargées, licence lue) :
  ⚔️ batailles, 🎖 guerres, 🏥 institutions, ⚓ navires, 🗼 phares : Wikidata (CC0), requêtes SPARQL ci-dessous ;
  🛣️ voies romaines : Itiner-e static version 2024, de Soto et al. 2025, Zenodo 10.5281/zenodo.17122148 (CC BY 4.0) ;
  🐚 chemins de Compostelle : OpenStreetMap, relations route=foot/hiking (Overpass), © OpenStreetMap contributors (ODbL) ;
  🌋 catastrophes : NOAA NCEI/WDS, Global Significant Earthquake / Volcanic Eruptions / Tsunami databases (domaine public, US Gov) ;
  🗼 portée des phares : Wikidata P2929 (portée lumineuse) puis OpenStreetMap seamark:light:range (ODbL) pour compléter.
Chaque fichier porte sa source, sa licence, son lien et la date de fabrication.
"""
import argparse
import datetime
import json
import math
import os
import re
import sys
import urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ha_common import (cached, encode_line, http, km, overpass, qid, simplify, sparql, wd_date, wd_labels, wkt_point, write_gz)  # noqa: E402

TODAY = datetime.date.today().isoformat()
WD_SRC = {'source': 'Wikidata', 'licence': 'CC0 1.0', 'url': 'https://www.wikidata.org', 'built': TODAY}


def batches(seq, n):
    for i in range(0, len(seq), n):
        yield seq[i:i + n]


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


def lab(v):
    """les deux libellés (fr, en) d'une variable SPARQL : ?xfr, ?xen"""
    return f'OPTIONAL {{ {v} rdfs:label {v}fr FILTER(LANG({v}fr)="fr") }} OPTIONAL {{ {v} rdfs:label {v}en FILTER(LANG({v}en)="en") }}'


def pick(r, v):
    x = r.get(v + 'fr') or r.get(v + 'en') or ''
    return '' if re.match(r'^Q\d+$', x) else x


def multi(rows, key, v):
    """{Qid: [libellés distincts]} d'une requête « un objet par ligne »"""
    out = {}
    for r in rows:
        x = pick(r, v)
        if x:
            lst = out.setdefault(qid(r[key]), [])
            if x not in lst:
                lst.append(x)
    return out


def names_of(cache, name, where, var='?it', ids=None):
    """{Qid: (libellé, titre frwiki)} pour tous les objets d'un motif SPARQL (une seule requête ; sinon par lots, sans frwiki)"""
    try:
        return names_inline(cache, name, where, var)
    except RuntimeError as e:
        if ids is None:
            raise
        print(f'  ⚠️ {e} : libellés par lots', flush=True)
        return {k: (v, '') for k, v in wd_labels(cache, name + '-ids', ids).items()}


def names_by_ids(cache, name, ids, size=3000):
    """{Qid: (libellé, titre frwiki)} par lots (VALUES) : pour les grandes listes, où une seule requête dépasse le délai"""
    out = {}
    ids = sorted(set(ids))
    for k in range(0, len(ids), size):
        vals = ' '.join(f'wd:{q}' for q in ids[k:k + size])
        out.update(names_inline(cache, f'{name}-{k // size}', f'VALUES ?it {{ {vals} }}', '?it'))
    return out


def names_inline(cache, name, where, var):
    q = f'SELECT {var} {var}fr {var}en ?frw WHERE {{ {where} {lab(var)} OPTIONAL {{ ?frw schema:about {var} ; schema:isPartOf <https://fr.wikipedia.org/> }} }}'
    out = {}
    for r in sparql(cache, name, q):
        k = qid(r[var[1:]])
        if k not in out or (not out[k][0] and pick(r, var[1:])):
            frw = r.get('frw', '')
            out[k] = (pick(r, var[1:]), urllib.parse.unquote(frw.rsplit('/', 1)[-1]) if frw else '')
    return out


def attrs(cache, name, where, props, var='?it'):
    """{prop: {Qid: [libellés]}} : une requête pour les valeurs (sans libellés), puis les libellés par lots"""
    vals = ' '.join(f'wdt:{p}' for p in props)
    rows = sparql(cache, name, f'SELECT DISTINCT {var} ?p ?v WHERE {{ {where} VALUES ?p {{ {vals} }} {var} ?p ?v . FILTER(isIRI(?v)) }}')
    labs = wd_labels(cache, name, [qid(r['v']) for r in rows])
    out = {p: {} for p in props}
    for r in rows:
        p, x = qid(r['p']), labs.get(qid(r['v']), '')
        if x and p in out:
            lst = out[p].setdefault(qid(r[var[1:]]), [])
            if x not in lst:
                lst.append(x)
    return out


def images_of(cache, name, where, var='?it'):
    out = {}
    for r in sparql(cache, name, f'SELECT {var} (SAMPLE(?i) AS ?img) WHERE {{ {where} {var} wdt:P18 ?i }} GROUP BY {var}'):
        out[qid(r[var[1:]])] = urllib.parse.unquote(r['img'].rsplit('/', 1)[-1])
    return out


# ═══════════════════════ ⚔️ batailles et sièges ═══════════════════════
BAT_ALL = '{ ?b wdt:P31/wdt:P279* wd:Q178561 } UNION { ?b wdt:P31/wdt:P279* wd:Q188055 }'
BAT = BAT_ALL + ' ?b wdt:P625 ?c0 .'
WAR = '?w wdt:P31/wdt:P279* wd:Q198 .'
WAR_WORDS = re.compile(r'guerre|\bwar\b|campagne|campaign|révolution|revolution|conflit|conflict|insurrection|rébellion|rebellion|croisade|crusade|invasion|expédition|front|offensive', re.I)
DATES = '''OPTIONAL {{ {v} p:P585/psv:P585 [wikibase:timeValue ?d; wikibase:timePrecision ?dp] }}
  OPTIONAL {{ {v} p:P580/psv:P580 [wikibase:timeValue ?s; wikibase:timePrecision ?sp] }}
  OPTIONAL {{ {v} p:P582/psv:P582 [wikibase:timeValue ?e; wikibase:timePrecision ?ep] }}
  FILTER(BOUND(?d) || BOUND(?s) || BOUND(?e))'''
# un lieu (P276) trop grand pour placer une bataille : pays, État, continent, mer, océan, fleuve, chaîne de montagnes, région…
BIG_PLACE = 'wd:Q6256 wd:Q3624078 wd:Q7275 wd:Q5107 wd:Q165 wd:Q9430 wd:Q4022 wd:Q46831 wd:Q35657 wd:Q10864048 wd:Q82794 wd:Q1620908 wd:Q34763 wd:Q107390 wd:Q36784 wd:Q1250464'


def dated(r):
    """(y, d, y2, d2) d'une ligne : P585 (moment), sinon P580 (début), sinon P582 (fin) ; fin = P582 si elle suit le début"""
    if r.get('d') or r.get('s'):
        y, d = precise(r.get('d') or r.get('s'), r.get('dp') or r.get('sp'))
    else:
        y, d = precise(r.get('e'), r.get('ep'))
    y2, d2 = precise(r.get('e'), r.get('ep')) if r.get('e') else (None, '')
    if y is None:
        return None
    ok2 = y2 is not None and y2 >= y and (y2, d2) != (y, d)
    return y, d, (y2 if ok2 else None), (d2 if ok2 else '')


def better(cur, new):
    """la date la plus précise, puis la plus ancienne"""
    return not cur or (new[1] and not cur['d']) or (bool(cur['d']) == bool(new[1]) and new[0] < cur['y'])


def war_set(cache):
    """{Qid: (y, d, y2, d2, lat, lon)} : les guerres (Q198 et sous-classes), dates et coordonnées propres s'il y en a"""
    q = f"""SELECT ?w ?d ?dp ?s ?sp ?e ?ep ?i ?c WHERE {{
  {WAR}
  OPTIONAL {{ ?w wdt:P625 ?c }}
  OPTIONAL {{ ?w wdt:P571 ?i }}
  {DATES.format(v='?w').replace('FILTER(BOUND(?d) || BOUND(?s) || BOUND(?e))', '')}
}}"""
    out = {}
    for r in sparql(cache, 'guerres', q):
        w = qid(r['w'])
        x = dated(r) if (r.get('d') or r.get('s') or r.get('e')) else (precise(r.get('i'), 9) + (None, '') if r.get('i') else None)
        pt = wkt_point(r.get('c'))
        cur = out.get(w)
        if x and (not cur or cur['y'] is None or better(cur, x)):
            out[w] = {'y': x[0], 'd': x[1], 'y2': x[2], 'd2': x[3], 'pt': pt or (cur or {}).get('pt')}
        elif not cur:
            out[w] = {'y': None, 'd': '', 'y2': None, 'd2': '', 'pt': pt}
        elif pt and not cur['pt']:
            cur['pt'] = pt
    return out


def battles_of_wars(cache):
    """{bataille: {guerre, …}} : P361 (partie de), de proche en proche (bataille ⊂ campagne ⊂ guerre ⊂ guerre plus grande)"""
    out = {}
    for r in sparql(cache, 'bat-guerres-toutes', f'SELECT DISTINCT ?b ?w WHERE {{ {BAT_ALL} ?b wdt:P361+ ?w . {WAR} }}'):
        out.setdefault(qid(r['b']), set()).add(qid(r['w']))
    return out


def build_batailles(cache):
    base = {}
    # 1. placées par leurs propres coordonnées (P625)
    for r in sparql(cache, 'batailles-2', f"SELECT ?b ?d ?dp ?s ?sp ?e ?ep ?c WHERE {{ {BAT_ALL} ?b wdt:P625 ?c . {DATES.format(v='?b')} }}"):
        b, pt, x = qid(r['b']), wkt_point(r.get('c')), dated(r)
        if pt and x and better(base.get(b), x):
            base[b] = {'y': x[0], 'd': x[1], 'y2': x[2], 'd2': x[3], 'lat': pt[0], 'lon': pt[1], 'approx': 0}
    direct = len(base)
    # 2. sans coordonnées : placées par leur lieu (P276 → P625), sauf un lieu trop grand (pays, mer, fleuve, région… ou plus de 50 000 km²)
    q = f"""SELECT ?b ?l ?c ?area ?big ?d ?dp ?s ?sp ?e ?ep WHERE {{
  {BAT_ALL} FILTER NOT EXISTS {{ ?b wdt:P625 [] }}
  ?b wdt:P276 ?l . ?l wdt:P625 ?c .
  OPTIONAL {{ ?l p:P2046/psn:P2046/wikibase:quantityAmount ?area }}
  BIND(EXISTS {{ VALUES ?bad {{ {BIG_PLACE} }} ?l wdt:P31 ?bad }} AS ?big)
  {DATES.format(v='?b')}
}}"""
    by_loc, too_big = {}, set()
    for r in sparql(cache, 'bat-par-lieu', q):
        b, pt, x = qid(r['b']), wkt_point(r.get('c')), dated(r)
        if not pt or not x:
            continue
        if r.get('big') in ('true', '1') or float(r.get('area') or 0) > 5e10:  # plus de 50 000 km² (une ville dont la fiche porte la surface de sa province reste)
            too_big.add(b)
            continue
        cur = by_loc.get(b)
        if cur is None:
            by_loc[b] = {'y': x[0], 'd': x[1], 'y2': x[2], 'd2': x[3], 'pts': {pt}, 'l': qid(r['l'])}
        else:
            cur['pts'].add(pt)
            if better(cur, x):
                cur.update(y=x[0], d=x[1], y2=x[2], d2=x[3])
    spread = 0
    for b, x in by_loc.items():
        pts = sorted(x['pts'])
        if len(pts) > 1 and max(km(*p, *q) for p in pts for q in pts) > 100:  # plusieurs lieux éloignés : on ne choisit pas
            spread += 1
            continue
        lat, lon = round(sum(p[0] for p in pts) / len(pts), 4), round(sum(p[1] for p in pts) / len(pts), 4)
        base[b] = {'y': x['y'], 'd': x['d'], 'y2': x['y2'], 'd2': x['d2'], 'lat': lat, 'lon': lon, 'approx': 1}
    ids = sorted(base)
    print(f'⚔️ {len(ids)} batailles et sièges datés et placés : {direct} par leurs coordonnées, {len(ids) - direct} par leur lieu '
          f'({len(too_big - set(by_loc))} au lieu trop grand, {spread} aux lieux trop éloignés : écartées)', flush=True)
    labs = names_by_ids(cache, 'bat-noms-3', ids)
    wars = {}
    for r in sparql(cache, 'bat-guerres-2', f'SELECT ?b ?w ?wfr ?wen WHERE {{ {BAT_ALL} ?b wdt:P361 ?w . {lab("?w")} }}'):
        x = pick(r, 'w')
        if x:
            wars.setdefault(qid(r['b']), []).append(x)
    bel = multi(sparql(cache, 'bat-camps-2', f'SELECT ?b ?p ?pfr ?pen WHERE {{ {BAT_ALL} ?b wdt:P710 ?p . {lab("?p")} }}'), 'b', 'p')
    at = attrs(cache, 'bat-lieux-pays-2', BAT_ALL, ['P276', 'P17'], '?b')
    locs, ctry = at['P276'], at['P17']
    wset = war_set(cache)
    inwar = battles_of_wars(cache)
    rows = []
    for b in ids:
        x = base[b]
        name, frw = labs.get(b, ('', ''))
        if not name:
            continue
        ws = sorted(set(wars.get(b, [])))
        war = next((w for w in ws if WAR_WORDS.search(w)), ws[0] if ws else '')
        # ses guerres, la plus courte d'abord (la plus précise : « guerre franco-allemande » avant « guerres napoléoniennes »)
        wq = sorted((w for w in inwar.get(b, ()) if w in wset), key=lambda w: (((wset[w]['y2'] or wset[w]['y'] or 0) - (wset[w]['y'] or 0)) if wset[w]['y'] is not None else 9999, w))
        rows.append([b, name, x['y'], x['d'], x['y2'], x['d2'], x['lat'], x['lon'], war, '|'.join(bel.get(b, [])[:6]), (locs.get(b) or [''])[0], (ctry.get(b) or [''])[0], frw, x['approx'], '|'.join(wq)])
    rows.sort(key=lambda r: (r[2], r[3]))
    meta = dict(WD_SRC, what='Batailles et sièges (Wikidata : nature = bataille Q178561 ou siège Q188055 et leurs sous-classes, datés par P585, P580 ou P582 ; '
                'placés par leurs coordonnées P625, sinon par celles de leur lieu P276 : approx = 1, « placé par son lieu »)',
                counts={'direct': sum(1 for r in rows if not r[13]), 'by_place': sum(1 for r in rows if r[13])})
    return write_gz('ha-batailles.json.gz', {**meta, 'fields': ['q', 'n', 'y', 'd', 'y2', 'd2', 'lat', 'lon', 'war', 'bel', 'loc', 'country', 'frwiki', 'approx', 'wq'], 'rows': rows}), len(rows)


# ═══════════════════════ 🎖 guerres ═══════════════════════
def build_guerres(cache):
    """les guerres (Q198 et sous-classes) : dates, camps, pays, lieux ; leurs batailles placées (ha-batailles) donnent leur centre"""
    wset = war_set(cache)
    labs = names_of(cache, 'guerres-noms', WAR.replace('?w', '?it'))
    at = attrs(cache, 'guerres-camps-pays', WAR, ['P710', 'P17', 'P276'], '?w')
    import gzip as _gz
    with _gz.open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'assets', 'data', 'ha-batailles.json.gz')) as f:
        B = json.load(f)
    F = {k: i for i, k in enumerate(B['fields'])}
    pts = {}
    for r in B['rows']:
        for w in filter(None, str(r[F['wq']] or '').split('|')):
            pts.setdefault(w, []).append((r[F['lat']], r[F['lon']]))
    rows = []
    for w, x in wset.items():
        name, frw = labs.get(w, ('', ''))
        nb = len(pts.get(w, []))
        if not name or (x['y'] is None and not nb):
            continue
        if nb:  # le centre : la médiane de ses batailles
            la, lo = sorted(p[0] for p in pts[w]), sorted(p[1] for p in pts[w])
            lat, lon = la[nb // 2], lo[nb // 2]
        elif x['pt']:
            lat, lon = x['pt']
        else:
            lat = lon = None
        rows.append([w, name, x['y'], x['d'], x['y2'], x['d2'], lat, lon, '|'.join(at['P710'].get(w, [])[:8]), '|'.join(at['P17'].get(w, [])[:4]), '|'.join(at['P276'].get(w, [])[:4]), nb, frw])
    rows.sort(key=lambda r: (r[2] if r[2] is not None else 99999, r[1]))
    print(f'🎖 {len(rows)} guerres ({sum(1 for r in rows if r[11])} avec des batailles placées)', flush=True)
    meta = dict(WD_SRC, what='Guerres (Wikidata : nature = guerre Q198 et ses sous-classes ; début P580, fin P582, camps P710, pays P17, lieux P276 ; '
                'nb = ses batailles placées dans ha-batailles, par P361 « partie de », de proche en proche)')
    return write_gz('ha-guerres.json.gz', {**meta, 'fields': ['q', 'n', 'y', 'd', 'y2', 'd2', 'lat', 'lon', 'part', 'country', 'loc', 'nb', 'frwiki'], 'rows': rows}), len(rows)


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
    for k, b in enumerate(batches([r['id'] for r in keep], 8)):  # petits lots : les gros (40) faisaient 502/504 sur les serveurs publics
        ids = ','.join(str(i) for i in b)
        res = overpass(cache, f'compostelle-geom8-{k}', f'[out:json][timeout:800];relation(id:{ids});out geom;')
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
INST = [  # (clé, classes Wikidata, libellé)
    ('hopital', ['Q16917'], 'hôpital'),
    ('hoteldieu', ['Q1643052', 'Q1643057'], 'hôtel-Dieu'),
    ('hospice', ['Q180370'], 'hospice, hôpital ancien'),
    ('orphelinat', ['Q160645'], 'orphelinat'),
    ('enfants', ['Q5474633'], 'hospice des enfants trouvés'),
    ('prison', ['Q40357'], 'prison'),
    ('bagne', ['Q870455', 'Q1140316'], 'bagne'),
    ('asile', ['Q210999'], 'asile, hôpital psychiatrique'),
    ('couvent', ['Q44613', 'Q1128397'], 'monastère, couvent'),
    ('leproserie', ['Q1406569'], 'léproserie'),
]
# pays gardés : France (avec l'outre-mer), Belgique, Suisse, Luxembourg, Monaco, Italie, Espagne, Allemagne, Pays-Bas,
# Royaume-Uni, Irlande, Portugal, Autriche, Canada, Algérie
INST_COUNTRIES = 'wd:Q142 wd:Q31 wd:Q39 wd:Q32 wd:Q235 wd:Q38 wd:Q29 wd:Q183 wd:Q55 wd:Q145 wd:Q27 wd:Q45 wd:Q40 wd:Q16 wd:Q262'


def build_institutions(cache):
    base, labs = {}, {}
    for key, classes, _ in INST:
        cls = ' UNION '.join(f'{{ ?it wdt:P31/wdt:P279* wd:{c} }}' for c in classes)
        ctl = ', '.join(INST_COUNTRIES.split())
        q = f'''SELECT ?it ?itfr ?iten ?frw ?c ?inc ?dis ?ctry ?ctryfr ?adm ?admfr WHERE {{
  {cls}
  ?it wdt:P625 ?c ; wdt:P17 ?ctry . FILTER(?ctry IN ({ctl}))
  OPTIONAL {{ ?it wdt:P571 ?inc }} OPTIONAL {{ ?it wdt:P576 ?dis }}
  {lab("?it")}
  OPTIONAL {{ ?ctry rdfs:label ?ctryfr FILTER(LANG(?ctryfr)="fr") }}
  OPTIONAL {{ ?it wdt:P131 ?adm . ?adm rdfs:label ?admfr FILTER(LANG(?admfr)="fr") }}
  OPTIONAL {{ ?frw schema:about ?it ; schema:isPartOf <https://fr.wikipedia.org/> }}
}}'''
        n = set()
        for r in sparql(cache, f'inst-{key}', q):
            it = qid(r['it'])
            pt = wkt_point(r.get('c'))
            if not pt:
                continue
            y1 = wd_date(r.get('inc'))[0]
            y2 = wd_date(r.get('dis'))[0]
            x = base.setdefault(it, {'k': [], 'lat': pt[0], 'lon': pt[1], 'from': None, 'to': None, 'c': r.get('ctryfr', ''), 'adm': r.get('admfr', '')})
            if key not in x['k']:
                x['k'].append(key)
            if y1 is not None and (x['from'] is None or y1 < x['from']):
                x['from'] = y1
            if y2 is not None and (x['to'] is None or y2 > x['to']):
                x['to'] = y2
            if not x['adm'] and r.get('admfr'):
                x['adm'] = r['admfr']
            name = pick(r, 'it')
            if name and not labs.get(it, ('',))[0]:
                frw = r.get('frw', '')
                labs[it] = (name, urllib.parse.unquote(frw.rsplit('/', 1)[-1]) if frw else '')
            n.add(it)
        print(f'🏥 {key} : {len(n)}', flush=True)
    rows = []
    for it in sorted(base):
        x = base[it]
        name, frw = labs.get(it, ('', ''))
        if not name:
            continue
        rows.append([it, name, ','.join(x['k']), x['from'], x['to'], x['lat'], x['lon'], x['adm'], x['c'], frw])
    rows.sort(key=lambda r: r[1].lower())
    meta = dict(WD_SRC, what='Hôpitaux, hôtels-Dieu, hospices, orphelinats et enfants trouvés, prisons, bagnes, asiles, couvents, léproseries (Wikidata, avec coordonnées ; France, pays voisins, Royaume-Uni, Irlande, Portugal, Autriche, Canada, Algérie)',
                kinds={k: l for k, _, l in INST})
    return write_gz('ha-institutions.json.gz', {**meta, 'fields': ['q', 'n', 'kinds', 'from', 'to', 'lat', 'lon', 'commune', 'country', 'frwiki'], 'rows': rows}), len(rows)


# ═══════════════════════ 🌋 catastrophes (NOAA NCEI) ═══════════════════════
NOAA = 'https://www.ngdc.noaa.gov/hazel/hazard-service/api/v1/'


def noaa_all(cache, kind):
    out, page = [], 1
    while True:
        raw = cached(cache, f'noaa-{kind.replace("/", "-")}-{page}.json', lambda: http(f'{NOAA}{kind}?page={page}&itemsPerPage=200'))
        d = json.loads(raw)
        out += d['items']
        if page >= d.get('totalPages', 1):
            return out
        page += 1


COUNTRY_FR = {  # noms des pays de la NOAA → français (les autres restent en anglais)
    'Japan': 'Japon', 'Indonesia': 'Indonésie', 'China': 'Chine', 'Italy': 'Italie', 'Usa': 'États-Unis', 'United States': 'États-Unis', 'Usa Territory': 'États-Unis (territoire)',
    'Iran': 'Iran', 'Greece': 'Grèce', 'Turkey': 'Turquie', 'Philippines': 'Philippines', 'Chile': 'Chili', 'Mexico': 'Mexique', 'Russia': 'Russie', 'Peru': 'Pérou',
    'Papua New Guinea': 'Papouasie-Nouvelle-Guinée', 'New Zealand': 'Nouvelle-Zélande', 'Taiwan': 'Taïwan', 'India': 'Inde', 'Solomon Islands': 'Îles Salomon', 'Solomon Is.': 'Îles Salomon',
    'Ecuador': 'Équateur', 'Colombia': 'Colombie', 'Afghanistan': 'Afghanistan', 'Iceland': 'Islande', 'Algeria': 'Algérie', 'Albania': 'Albanie', 'New Caledonia': 'Nouvelle-Calédonie',
    'Croatia': 'Croatie', 'Spain': 'Espagne', 'Canada': 'Canada', 'Myanmar (Burma)': 'Birmanie', 'Argentina': 'Argentine', 'Australia': 'Australie', 'Syria': 'Syrie', 'Switzerland': 'Suisse',
    'Norway': 'Norvège', 'Tajikistan': 'Tadjikistan', 'Israel': 'Israël', 'Haiti': 'Haïti', 'Azores (Portugal)': 'Açores (Portugal)', 'South Korea': 'Corée du Sud', 'North Korea': 'Corée du Nord',
    'Iraq': 'Irak', 'Fiji': 'Fidji', 'Slovenia': 'Slovénie', 'Nepal': 'Népal', 'Morocco': 'Maroc', 'Dominican Republic': 'République dominicaine', 'Jamaica': 'Jamaïque', 'Bulgaria': 'Bulgarie',
    'Bolivia': 'Bolivie', 'Egypt': 'Égypte', 'Azerbaijan': 'Azerbaïdjan', 'Uk': 'Royaume-Uni', 'Uk Territory': 'Royaume-Uni (territoire)', 'Ethiopia': 'Éthiopie', 'Kyrgyzstan': 'Kirghizistan',
    'Georgia': 'Géorgie', 'Serbia': 'Serbie', 'Romania': 'Roumanie', 'South Africa': 'Afrique du Sud', 'Antarctica': 'Antarctique', 'Lebanon': 'Liban', 'Yemen': 'Yémen', 'Armenia': 'Arménie',
    'Uzbekistan': 'Ouzbékistan', 'Brazil': 'Brésil', 'Turkmenistan': 'Turkménistan', 'North Macedonia': 'Macédoine du Nord', 'Tanzania': 'Tanzanie', 'Cyprus': 'Chypre', 'Montenegro': 'Monténégro',
    'Bosnia-Herzegovina': 'Bosnie-Herzégovine', 'Pacific Ocean': 'océan Pacifique', 'Atlantic Ocean': 'océan Atlantique', 'Trinidad And Tobago': 'Trinité-et-Tobago', 'Greenland': 'Groenland',
    'Tunisia': 'Tunisie', 'Germany': 'Allemagne', 'Eritrea': 'Érythrée', 'Vietnam': 'Viêt Nam', 'Austria': 'Autriche', 'Martinique (French Territory)': 'Martinique', 'Guadeloupe (French Territory)': 'Guadeloupe',
    'Poland': 'Pologne', 'Mongolia': 'Mongolie', 'Comores': 'Comores', 'Comoros': 'Comores', 'Cameroon': 'Cameroun', 'Jordan': 'Jordanie', 'Congo, DRC': 'Congo (RDC)', 'Netherlands': 'Pays-Bas',
    'Hungary': 'Hongrie', 'Thailand': 'Thaïlande', 'Saudi Arabia': 'Arabie saoudite', 'Antigua And Barbuda': 'Antigua-et-Barbuda', 'St. Vincent & the Grenadines': 'Saint-Vincent-et-les-Grenadines',
    'South Sudan': 'Soudan du Sud', 'Ouganda': 'Ouganda', 'Uganda': 'Ouganda', 'Malawi': 'Malawi', 'Kermadec Islands': 'Îles Kermadec', 'Kermadec Islands (New Zealand)': 'Îles Kermadec (Nouvelle-Zélande)',
    'Samoa': 'Samoa', 'Belgium': 'Belgique', 'Ireland': 'Irlande', 'Reunion': 'La Réunion', 'Reunion (French Territory)': 'La Réunion', 'French Polynesia': 'Polynésie française',
    'French Polynesia (French Territory)': 'Polynésie française', 'French Guiana': 'Guyane', 'Saint Pierre And Miquelon': 'Saint-Pierre-et-Miquelon', 'Wallis And Futuna (French Territory)': 'Wallis-et-Futuna',
    'Mayotte (French Territory)': 'Mayotte', 'Libya': 'Libye', 'Sudan': 'Soudan', 'Kenya': 'Kenya', 'Rwanda': 'Rwanda', 'Bhutan': 'Bhoutan', 'Uruguay': 'Uruguay', 'Cuba': 'Cuba', 'Honduras': 'Honduras',
    'Panama': 'Panama', 'Nicaragua': 'Nicaragua', 'Costa Rica': 'Costa Rica', 'El Salvador': 'Salvador', 'Guatemala': 'Guatemala', 'Venezuela': 'Venezuela', 'Pakistan': 'Pakistan', 'Bangladesh': 'Bangladesh',
    'Ukraine': 'Ukraine', 'Portugal': 'Portugal', 'France': 'France', 'Tonga': 'Tonga', 'Vanuatu': 'Vanuatu', 'Martinique': 'Martinique', 'Guadeloupe': 'Guadeloupe', 'Montserrat': 'Montserrat',
    'Ghana': 'Ghana', 'Congo': 'Congo', 'Kazakhstan': 'Kazakhstan', 'Micronesia, Fed. States Of': 'Micronésie', 'South Georgia And The South Sandwich Islands': 'Géorgie du Sud-et-les îles Sandwich du Sud'}


def fr_country(c):
    c = (c or '').strip()
    return COUNTRY_FR.get(c, c)


def build_catastrophes(cache):
    rows = []
    for it in noaa_all(cache, 'earthquakes'):
        if it.get('latitude') is None or it.get('year') is None:
            continue
        deaths = it.get('deathsTotal', it.get('deaths'))
        rows.append(['eq', it['id'], it['year'], it.get('month'), it.get('day'), round(it['latitude'], 3), round(it['longitude'], 3), (it.get('locationName') or '').strip(), fr_country((it.get('country') or '').title()),
                     it.get('eqMagnitude'), it.get('intensity'), deaths, it.get('deathsAmountOrderTotal'), it.get('housesDestroyedTotal', it.get('housesDestroyed')), 1 if it.get('tsunamiEventId') else 0, ''])
    for it in noaa_all(cache, 'volcanoes'):
        if it.get('latitude') is None or it.get('year') is None:
            continue
        rows.append(['vo', it['id'], it['year'], it.get('month'), it.get('day'), round(it['latitude'], 3), round(it['longitude'], 3), (it.get('location') or '').strip(), fr_country(it.get('country') or ''),
                     it.get('vei'), None, it.get('deathsTotal', it.get('deaths')), it.get('deathsAmountOrderTotal'), it.get('housesDestroyedTotal', it.get('housesDestroyed')), 1 if it.get('tsunamiEventId') else 0, it.get('name') or ''])
    for it in noaa_all(cache, 'tsunamis/events'):
        if it.get('latitude') is None or it.get('year') is None or (it.get('eventValidity') or 0) < 3:
            continue
        rows.append(['ts', it['id'], it['year'], it.get('month'), it.get('day'), round(it['latitude'], 3), round(it['longitude'], 3), (it.get('locationName') or '').strip(), fr_country((it.get('country') or '').title()),
                     it.get('maxWaterHeight'), it.get('tsIntensity'), it.get('deathsTotal', it.get('deaths')), it.get('deathsAmountOrderTotal'), it.get('housesDestroyedTotal', it.get('housesDestroyed')), 0, ''])
    rows.sort(key=lambda r: (r[2], r[3] or 0, r[4] or 0))
    print(f'🌋 {len(rows)} événements NOAA', flush=True)
    meta = {'source': 'NOAA National Centers for Environmental Information (NCEI/WDS) : Global Significant Earthquake Database (doi:10.7289/V5TD9V7K), Global Significant Volcanic Eruptions Database (doi:10.7289/V5JW8BSH), Global Historical Tsunami Database (doi:10.7289/V5PN93H7)',
            'licence': 'Domaine public (données du gouvernement des États-Unis)', 'url': 'https://www.ngdc.noaa.gov/hazard/', 'built': TODAY,
            'note': 'Séismes : magnitude, intensité (Mercalli modifiée) ; éruptions : indice d’explosivité (VEI) et nom du volcan ; tsunamis : hauteur d’eau maximale (m). Morts : total, conséquences comprises.'}
    return write_gz('ha-catastrophes.json.gz', {**meta, 'fields': ['k', 'id', 'y', 'm', 'd', 'lat', 'lon', 'loc', 'country', 'mag', 'int', 'deaths', 'deathsOrder', 'houses', 'tsunami', 'volcano'], 'rows': rows}), len(rows)


# ═══════════════════════ ⚓ navires ═══════════════════════
SHIP = '?it wdt:P31/wdt:P279* wd:Q11446 . ?it wdt:P1191|wdt:P729|wdt:P571 ?d0 .'


def build_navires(cache):
    # les navires (Q11446 et sous-classes) avec une date de mise à l'eau (P1191), de mise en service (P729) ou de construction (P571)
    q = '''SELECT ?it ?l ?srv ?inc ?dec ?wreck ?dis WHERE {
  ?it wdt:P31/wdt:P279* wd:Q11446 .
  OPTIONAL { ?it wdt:P1191 ?l } OPTIONAL { ?it wdt:P729 ?srv } OPTIONAL { ?it wdt:P571 ?inc }
  OPTIONAL { ?it wdt:P730 ?dec } OPTIONAL { ?it wdt:P5045 ?wreck } OPTIONAL { ?it wdt:P576 ?dis }
  FILTER(BOUND(?l) || BOUND(?srv) || BOUND(?inc))
}'''
    base = {}
    for r in sparql(cache, 'navires', q):
        s = qid(r['it'])
        y0 = wd_date(r.get('l'))[0] or wd_date(r.get('srv'))[0] or wd_date(r.get('inc'))[0]
        if y0 is None:
            continue
        yw = wd_date(r.get('wreck'))[0]
        y1 = wd_date(r.get('dec'))[0] or yw or wd_date(r.get('dis'))[0]
        x = base.setdefault(s, {'from': y0, 'to': y1, 'wreck': yw})
        x['from'] = min(x['from'], y0)
        if y1 is not None:
            x['to'] = max(x['to'] or y1, y1)
        if yw is not None:
            x['wreck'] = yw
    print(f'⚓ {len(base)} navires datés', flush=True)
    labs = names_of(cache, 'nav-noms', SHIP, ids=list(base))
    at = attrs(cache, 'nav-attrs', SHIP, ['P31', 'P504', 'P8047', 'P17', 'P137'])
    kind, port, oper = at['P31'], at['P504'], at['P137']
    flag = {k: at['P8047'].get(k) or at['P17'].get(k) for k in set(at['P8047']) | set(at['P17'])}
    img = images_of(cache, 'nav-images', SHIP)
    rows = []
    for s in sorted(base):
        x = base[s]
        name, frw = labs.get(s, ('', ''))
        if not name:
            continue
        rows.append([s, name, (kind.get(s) or [''])[0], x['from'], x['to'], x['wreck'], (port.get(s) or [''])[0], (flag.get(s) or [''])[0], (oper.get(s) or [''])[0], img.get(s, ''), frw])
    rows.sort(key=lambda r: r[1].lower())
    meta = dict(WD_SRC, what='Navires (Wikidata : navire Q11446 et sous-classes, avec date de mise à l’eau, de mise en service ou de construction)')
    return write_gz('ha-navires.json.gz', {**meta, 'fields': ['q', 'n', 'type', 'from', 'to', 'wreck', 'port', 'flag', 'operator', 'img', 'frwiki'], 'rows': rows}), len(rows)


# ═══════════════════════ 🗼 phares ═══════════════════════
def nm_of(v):
    """« 22 », « 22.5 », « 22;18 », « 22/18 » → milles marins (le plus grand)"""
    if v is None:
        return None
    nums = [float(x) for x in re.findall(r'\d+(?:\.\d+)?', str(v).replace(',', '.'))]
    nums = [n for n in nums if 0 < n < 60]
    return max(nums) if nums else None


LIGHT = '?it wdt:P31/wdt:P279* wd:Q39715 ; wdt:P625 ?c0 .'


def build_phares(cache):
    q = '''SELECT ?it ?c ?inc ?lit ?dis ?h ?hu ?fh ?fhu ?rg ?rgu WHERE {
  ?it wdt:P31/wdt:P279* wd:Q39715 ; wdt:P625 ?c .
  OPTIONAL { ?it wdt:P571 ?inc } OPTIONAL { ?it wdt:P729 ?lit } OPTIONAL { ?it wdt:P730 ?dis }
  OPTIONAL { ?it p:P2048/psv:P2048 [wikibase:quantityAmount ?h; wikibase:quantityUnit ?hu] }
  OPTIONAL { ?it p:P2923/psv:P2923 [wikibase:quantityAmount ?fh; wikibase:quantityUnit ?fhu] }
  OPTIONAL { ?it p:P2929/psv:P2929 [wikibase:quantityAmount ?rg; wikibase:quantityUnit ?rgu] }
}'''
    unit_m = {'Q11573': 1.0, 'Q3710': 0.3048}
    unit_nm = {'Q93318': 1.0, 'Q828224': 1 / 1.852, 'Q11573': 1 / 1852}
    base = {}
    for r in sparql(cache, 'phares', q):
        it = qid(r['it'])
        pt = wkt_point(r.get('c'))
        if not pt:
            continue
        x = base.setdefault(it, {'lat': pt[0], 'lon': pt[1], 'from': None, 'lit': None, 'to': None, 'h': None, 'fh': None, 'rg': None})
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
    labs = names_of(cache, 'ph-noms', LIGHT)
    ctry = attrs(cache, 'ph-pays', LIGHT, ['P17'])['P17']
    img = images_of(cache, 'ph-images', LIGHT)
    # la portée manquante : OpenStreetMap (seamark:light:range), le feu le plus proche à 300 m au plus
    osm = []
    try:
        http('https://overpass-api.de/api/status', tries=1, timeout=30)  # Overpass joignable ? sinon on ne s'acharne pas
        for k, bb in enumerate(['-60,-180,0,0', '0,-180,75,0', '-60,0,0,180', '0,0,75,180']):
            res = overpass(cache, f'phares-osm{k}', f'[out:json][timeout:800][bbox:{bb}];(node["man_made"="lighthouse"]["seamark:light:range"];node["seamark:type"="light_major"]["seamark:light:range"];node["man_made"="lighthouse"]["seamark:light:1:range"];);out;')
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
        if not name:
            continue
        rs, osm_id = ('wd' if x['rg'] else ''), None
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
        rows.append([it, name, x['from'], x['lit'], x['to'], x['lat'], x['lon'], x['h'], x['fh'], x['rg'], rs, osm_id, (ctry.get(it) or [''])[0], img.get(it, ''), frw])
    rows.sort(key=lambda r: r[1].lower())
    print(f'🗼 {len(rows)} phares ; portée : {sum(1 for r in rows if r[10] == "wd")} Wikidata + {from_osm} OSM', flush=True)
    meta = dict(WD_SRC, what='Phares (Wikidata : phare Q39715, coordonnées ; hauteur P2048, hauteur focale P2923, portée P2929, mise en service P729, création P571)',
                range_osm={'source': 'OpenStreetMap, balise seamark:light:range (portée en milles marins) du feu à 300 m au plus du phare', 'licence': 'ODbL 1.0', 'mention': '© OpenStreetMap contributors', 'url': 'https://www.openstreetmap.org/copyright'},
                osm_ok=bool(osm))
    return write_gz('ha-phares.json.gz', {**meta, 'fields': ['q', 'n', 'from', 'lit', 'to', 'lat', 'lon', 'height', 'focal', 'range', 'rangeSrc', 'osm', 'country', 'img', 'frwiki'], 'rows': rows}), len(rows)


STEPS = {'batailles': build_batailles, 'guerres': build_guerres, 'voies': build_voies, 'compostelle': build_compostelle, 'institutions': build_institutions,
         'catastrophes': build_catastrophes, 'navires': build_navires, 'phares': build_phares}

if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--cache', default=os.path.join(os.path.dirname(os.path.abspath(__file__)), '.cache'))
    ap.add_argument('--only', default=','.join(STEPS))
    a = ap.parse_args()
    for k in a.only.split(','):
        size, n = STEPS[k](a.cache)
        print(f'✓ {k} : {n} lignes, {size / 1e6:.2f} Mo', flush=True)
