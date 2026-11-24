#!/usr/bin/env python3
"""👑 Territoires d'autrefois (Europe) : royaumes, duchés, comtés, principautés, évêchés (Hochstift), électorats, marches,
villes libres d'Empire, seigneuries, républiques… d'après Wikidata (CC0 1.0), avec :
  · les contours dessinés sur Wikimedia Commons (Data:*.map, propriété P3896), seulement quand la licence du fichier
    permet de le redistribuer (CC0, domaine public, CC BY, CC BY-SA, ODbL) — la licence est gardée pour chaque contour ;
  · les cartes « instantanées » du monde de aourednik/historical-basemaps (GPL-3.0, compatible avec l'AGPL-3.0 de l'app),
    découpées sur l'Europe, simplifiées, pour les années d'avant 1816 (après : CShapes, déjà dans l'app, monde-frontieres.json.gz).

  python3 -I scripts/chateaux-territoires/build-territoires.py --basemaps DOSSIER/historical-basemaps [--cache DOSSIER]

Sorties (assets/data/territoires/) :
  territoires-europe.json.gz : {v, items:[{q, n, k, y0, y1, la, lo, cap:[[nom,Q,y0,y1]], arms, w, pa:[[nom,Q,y0,y1]], pr:[Q], su:[Q], sh}]}
       sh = numéro de contour dans territoires-contours.json.gz (ou absent : « limites inconnues »)
  territoires-contours.json.gz : {q, shapes:[{q, file, licence, g:[[[x,y…]]]}]}   (points entiers ×1/q, en différences)
  territoires-cartes.json.gz : {q, years:[…], snaps:{année:[{n, s, p, b, g}]}}     (historical-basemaps, Europe)
"""
import argparse
import datetime
import gzip
import json
import os
import sys
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wd  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'assets', 'data', 'territoires')
BOX = (34.0, 72.0, -25.0, 50.0)
EUROPE_COUNTRIES = {'Q142', 'Q183', 'Q38', 'Q29', 'Q145', 'Q27', 'Q45', 'Q31', 'Q55', 'Q32', 'Q39', 'Q40', 'Q213', 'Q214', 'Q36', 'Q28', 'Q215',
                    'Q224', 'Q225', 'Q403', 'Q236', 'Q221', 'Q222', 'Q41', 'Q219', 'Q218', 'Q217', 'Q212', 'Q184', 'Q37', 'Q211', 'Q191', 'Q33',
                    'Q34', 'Q20', 'Q35', 'Q189', 'Q233', 'Q347', 'Q235', 'Q238', 'Q228', 'Q237', 'Q1246'}
# racine de classe (avec ses sous-classes) → sorte
ROOTS = [  # l'ordre compte : un élément de plusieurs classes prend la première (un évêché est aussi une « principauté »)
    ('Q463742', 'eveche'), ('Q1366274', 'eveche'), ('Q3403564', 'eveche'), ('Q20521456', 'electorat'), ('Q57318', 'ville-libre'),
    ('Q708751', 'abbaye'), ('Q165116', 'grand-duche'), ('Q417175', 'royaume'), ('Q1250464', 'royaume'),
    ('Q154547', 'duche'), ('Q57979411', 'duche'), ('Q20856058', 'landgraviat'), ('Q2991489', 'palatinat'), ('Q27492289', 'marche'),
    ('Q7695', 'marche'), ('Q208500', 'principaute'), ('Q353344', 'comte'), ('Q17143371', 'comte'), ('Q58001476', 'comte'),
    ('Q3556994', 'vicomte'), ('Q196068', 'seigneurie'), ('Q1550557', 'seigneurie'), ('Q58683981', 'seigneurie'),
    ('Q209495', 'province'), ('Q26830017', 'etat'), ('Q3024240', 'etat'),
]
RANK = [k for _, k in ROOTS]
FREE = ('cc0', 'public domain', 'cc-by', 'cc by', 'odbl', 'cc-by-sa', 'cc by-sa')


def roots_items(cache):
    out = {}
    for root, kind in ROOTS:
        q = f'SELECT DISTINCT ?x WHERE {{ ?c wdt:P279* wd:{root} . ?x wdt:P31 ?c }}'
        for b in wd.sparql(q, cache):
            x = wd.qid(wd.val(b, 'x'))
            cur = out.get(x)
            if cur is None or RANK.index(kind) < RANK.index(cur):
                out[x] = kind
    return out


def details(ids, cache):
    vals = ' '.join('wd:' + i for i in ids)
    q = f"""SELECT ?x (SAMPLE(?fr) AS ?nfr) (SAMPLE(?en) AS ?nen) (SAMPLE(?de) AS ?nde) (SAMPLE(?an) AS ?nany) (MIN(?inc) AS ?i) (MAX(?dis) AS ?d)
      (SAMPLE(?co) AS ?c) (SAMPLE(?capco) AS ?cc) (SAMPLE(?arms) AS ?a) (SAMPLE(?shape) AS ?sh) (SAMPLE(?wfr) AS ?wf) (SAMPLE(?wen) AS ?we)
      (GROUP_CONCAT(DISTINCT ?cont; separator=" ") AS ?ct) (GROUP_CONCAT(DISTINCT ?ctry; separator=" ") AS ?cy)
      (GROUP_CONCAT(DISTINCT ?pred; separator=" ") AS ?pr) (GROUP_CONCAT(DISTINCT ?succ; separator=" ") AS ?su) WHERE {{
      VALUES ?x {{ {vals} }}
      OPTIONAL {{ ?x rdfs:label ?fr FILTER(lang(?fr)="fr") }} OPTIONAL {{ ?x rdfs:label ?en FILTER(lang(?en)="en") }}
      OPTIONAL {{ ?x rdfs:label ?de FILTER(lang(?de)="de") }}
      OPTIONAL {{ ?x rdfs:label ?an FILTER(lang(?an) IN ("es","it","nl","pl","cs","ca","pt","hu","sv","da")) }}
      OPTIONAL {{ ?x wdt:P571 ?inc }} OPTIONAL {{ ?x wdt:P576 ?dis }} OPTIONAL {{ ?x wdt:P625 ?co }}
      OPTIONAL {{ ?x wdt:P36/wdt:P625 ?capco }} OPTIONAL {{ ?x wdt:P94 ?arms }} OPTIONAL {{ ?x wdt:P3896 ?shape }}
      OPTIONAL {{ ?x wdt:P30 ?cont }} OPTIONAL {{ ?x wdt:P17 ?ctry }}
      OPTIONAL {{ {{ ?x wdt:P1365 ?pred }} UNION {{ ?x wdt:P155 ?pred }} }}
      OPTIONAL {{ {{ ?x wdt:P1366 ?succ }} UNION {{ ?x wdt:P156 ?succ }} }}
      OPTIONAL {{ ?wfr schema:about ?x ; schema:isPartOf <https://fr.wikipedia.org/> }}
      OPTIONAL {{ ?wen schema:about ?x ; schema:isPartOf <https://en.wikipedia.org/> }}
    }} GROUP BY ?x"""
    return wd.sparql(q, cache)


def relations(ids, cache):
    """capitales (P36) et « fait partie de » (P361, P131) avec leurs dates"""
    vals = ' '.join('wd:' + i for i in ids)
    q = f"""SELECT ?x ?p ?o ?ol ?s ?e WHERE {{ VALUES ?x {{ {vals} }} VALUES ?p {{ p:P36 p:P361 p:P131 }}
      ?x ?p ?st . {{ ?st ps:P36 ?o }} UNION {{ ?st ps:P361 ?o }} UNION {{ ?st ps:P131 ?o }}
      OPTIONAL {{ ?st pq:P580 ?s }} OPTIONAL {{ ?st pq:P582 ?e }}
      OPTIONAL {{ ?o rdfs:label ?lf FILTER(lang(?lf)="fr") }} OPTIONAL {{ ?o rdfs:label ?le FILTER(lang(?le)="en") }}
      BIND(COALESCE(?lf, ?le) AS ?ol) }}"""
    return wd.sparql(q, cache)


def in_box(p):
    return p and BOX[0] <= p[0] <= BOX[1] and BOX[2] <= p[1] <= BOX[3]


def title_of(url):
    return urllib.parse.unquote(url.rsplit('/wiki/', 1)[-1]).replace('_', ' ') if url else None


# ─────────── géométrie : Douglas-Peucker, quantification, deltas ───────────
def dp(pts, tol):
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        ax, ay = pts[a]
        bx, by = pts[b]
        dx, dy = bx - ax, by - ay
        L = dx * dx + dy * dy
        best, bi = -1, -1
        for i in range(a + 1, b):
            px, py = pts[i]
            if L:
                t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / L))
                ex, ey = ax + t * dx - px, ay + t * dy - py
            else:
                ex, ey = ax - px, ay - py
            d = ex * ex + ey * ey
            if d > best:
                best, bi = d, i
        if bi > 0 and best > tol * tol:
            keep[bi] = True
            stack += [(a, bi), (bi, b)]
    return [p for p, k in zip(pts, keep) if k]


def enc_ring(ring, q, tol):
    r = dp([(float(p[0]), float(p[1])) for p in ring], tol)
    if len(r) < 4:
        return None
    out, px, py = [], 0, 0
    for x, y in r[:-1] if r[0] == r[-1] else r:
        X, Y = round(x / q), round(y / q)
        if out and X == px and Y == py:
            continue
        out += [X - px, Y - py]
        px, py = X, Y
    return out if len(out) >= 6 else None


def enc_geom(geom, q, tol, clip=None):
    polys = [geom['coordinates']] if geom['type'] == 'Polygon' else geom['coordinates'] if geom['type'] == 'MultiPolygon' else []
    out, box = [], [1e9, 1e9, -1e9, -1e9]
    for poly in polys:
        outer = poly[0]
        xs, ys = [p[0] for p in outer], [p[1] for p in outer]
        if clip and (max(xs) < clip[2] or min(xs) > clip[3] or max(ys) < clip[0] or min(ys) > clip[1]):
            continue
        rings = [enc_ring(r, q, tol) for r in poly]
        if not rings[0]:
            continue
        out.append([r for r in rings if r])
        box = [min(box[0], min(xs)), min(box[1], min(ys)), max(box[2], max(xs)), max(box[3], max(ys))]
    return (out, [round(v / q) for v in box]) if out else (None, None)


def _xs(r, k=0):
    """les valeurs absolues (x si k=0, y si k=1) d'un anneau codé en différences"""
    out, v = [], 0
    for i in range(k, len(r), 2):
        v += r[i]
        out.append(v)
    return out


def commons_map(name, cache):
    os.makedirs(cache, exist_ok=True)
    path = os.path.join(cache, 'map-' + urllib.parse.quote(name, safe='')[:150])
    if not os.path.exists(path):
        url = 'https://commons.wikimedia.org/w/index.php?' + urllib.parse.urlencode({'title': 'Data:' + name, 'action': 'raw'})
        req = urllib.request.Request(url, headers={'User-Agent': wd.UA})
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                data = r.read()
        except Exception as e:  # noqa: BLE001
            print('  contour introuvable', name, e, flush=True)
            return None
        with open(path, 'wb') as f:
            f.write(data)
    try:
        return json.load(open(path, encoding='utf-8'))
    except ValueError:
        return None


def build_items(cache, shapes_out):
    kinds = roots_items(cache)
    print('classes →', len(kinds), 'éléments (monde)', flush=True)
    ids = sorted(kinds)
    raw = {}
    for chunk in wd.batches(ids, 150):
        for b in details(chunk, cache):
            raw[wd.qid(wd.val(b, 'x'))] = b
    keep = {}
    for x, b in raw.items():
        own, cap = wd.point(wd.val(b, 'c')), wd.point(wd.val(b, 'cc'))
        cont = set((wd.val(b, 'ct') or '').split())
        ctry = {wd.qid(c) for c in (wd.val(b, 'cy') or '').split()}
        if in_box(own) or (not own and in_box(cap)) or ('http://www.wikidata.org/entity/Q46' in cont and not (own and not in_box(own))) or (ctry & EUROPE_COUNTRIES and not own and not cap):
            keep[x] = b
    print('Europe →', len(keep), flush=True)
    rel = {}
    for chunk in wd.batches(sorted(keep), 150):
        for b in relations(chunk, cache):
            rel.setdefault(wd.qid(wd.val(b, 'x')), []).append(b)
    items, shapes = [], []
    shape_ix = {}
    for x, b in keep.items():
        it = {'q': x, 'k': kinds[x], 'n': wd.val(b, 'nfr') or wd.val(b, 'nen') or wd.val(b, 'nde') or wd.val(b, 'nany') or x}
        if wd.val(b, 'nfr') and wd.val(b, 'nde') and wd.val(b, 'nde') != it['n']:
            it['nd'] = wd.val(b, 'nde')
        y0, y1 = wd.year(wd.val(b, 'i')), wd.year(wd.val(b, 'd'))
        if y0 is not None:
            it['y0'] = y0
        if y1 is not None:
            it['y1'] = y1
        p = wd.point(wd.val(b, 'c')) or wd.point(wd.val(b, 'cc'))
        if p:
            it['la'], it['lo'] = p
            if not wd.point(wd.val(b, 'c')):
                it['pc'] = 1  # position = celle de la capitale
        if wd.val(b, 'a'):
            it['arms'] = wd.commons_file(wd.val(b, 'a'))
        if wd.val(b, 'wf'):
            it['w'] = title_of(wd.val(b, 'wf'))
        elif wd.val(b, 'we'):
            it['we'] = title_of(wd.val(b, 'we'))
        pr = [wd.qid(u) for u in (wd.val(b, 'pr') or '').split()]
        su = [wd.qid(u) for u in (wd.val(b, 'su') or '').split()]
        if pr:
            it['pr'] = sorted(set(pr))[:6]
        if su:
            it['su'] = sorted(set(su))[:6]
        for r in rel.get(x, []):
            row = [wd.val(r, 'ol') or wd.qid(wd.val(r, 'o')), wd.qid(wd.val(r, 'o'))]
            s, e = wd.year(wd.val(r, 's')), wd.year(wd.val(r, 'e'))
            if s is not None or e is not None:
                row += [s, e]
            key = 'cap' if wd.val(r, 'p').endswith('P36') else 'pa'
            lst = it.setdefault(key, [])
            if row not in lst and len(lst) < 10:
                lst.append(row)
        sh = wd.val(b, 'sh')
        if sh and shapes_out is not None:
            name = urllib.parse.unquote_plus(sh.rsplit('/Data:', 1)[-1]).replace('_', ' ')
            if name not in shape_ix:
                d = commons_map(name, os.path.join(cache, 'maps'))
                lic = ((d or {}).get('license') or '').strip()
                ok = d and any(lic.lower().startswith(f) for f in FREE)
                g = None
                if ok:
                    feats = d.get('data', {}).get('features', []) if d.get('data', {}).get('type') == 'FeatureCollection' else [d.get('data', {})]
                    geoms = []
                    for f in feats:
                        gg = f.get('geometry') or {}
                        if gg.get('type') in ('Polygon', 'MultiPolygon'):
                            enc, _ = enc_geom(gg, 0.001, 0.004)
                            if enc:
                                geoms += enc
                    g = geoms or None
                    # un contour qui déborde largement de l'Europe (empires coloniaux…) : il dirait « Paris est dans l'empire colonial » ; écarté
                    if g:
                        xs = [v for poly in g for r in poly[:1] for v in _xs(r)]
                        ys = [v for poly in g for r in poly[:1] for v in _xs(r, 1)]
                        if min(xs) * 0.001 < -32 or max(xs) * 0.001 > 65 or min(ys) * 0.001 < 25 or max(ys) * 0.001 > 75:
                            print('  contour hors d’Europe écarté', name, flush=True)
                            g = None
                if g:
                    shape_ix[name] = len(shapes)
                    shapes.append({'q': x, 'file': 'Data:' + name, 'licence': lic, 'g': g})
                else:
                    shape_ix[name] = None
                    if d:
                        print('  contour écarté', name, repr(lic), flush=True)
            if shape_ix.get(name) is not None:
                it['sh'] = shape_ix[name]
        if it['n'] == x:   # sans nom en français, anglais ni allemand : laissé de côté
            continue
        items.append(it)
    items.sort(key=lambda i: (i.get('y0') if i.get('y0') is not None else 9999, i['q']))
    # les liens (prédécesseurs, successeurs) vers des éléments absents : gardés (lien Wikidata), mais on note le nom quand on l'a
    names = {i['q']: i['n'] for i in items}
    return items, shapes, names


def build_basemaps(folder):
    gdir = os.path.join(folder, 'geojson')
    snaps, years = {}, []
    for fn in sorted(os.listdir(gdir)):
        if not fn.startswith('world_') or not fn.endswith('.geojson'):
            continue
        tag = fn[6:-8]
        y = -int(tag[2:]) if tag.startswith('bc') else int(tag)
        if y < -1 or y >= 1816:   # avant notre ère : non ; à partir de 1816 : CShapes (déjà dans l'app)
            continue
        d = json.load(open(os.path.join(gdir, fn), encoding='utf-8'))
        feats = []
        for f in d['features']:
            pr = f.get('properties') or {}
            if not pr.get('NAME') or not f.get('geometry'):
                continue
            g, b = enc_geom(f['geometry'], 0.005, 0.03, clip=BOX)
            if not g:
                continue
            row = {'n': pr['NAME'], 'b': b, 'g': g}
            if pr.get('SUBJECTO') and pr['SUBJECTO'] != pr['NAME']:
                row['s'] = pr['SUBJECTO']
            if pr.get('BORDERPRECISION'):
                row['p'] = int(pr['BORDERPRECISION'])
            feats.append(row)
        snaps[str(y)] = feats
        years.append(y)
    return sorted(years), snaps


def write_gz(path, obj):
    raw = json.dumps(obj, ensure_ascii=False, separators=(',', ':')).encode()
    with gzip.GzipFile(path, 'wb', compresslevel=9, mtime=0) as f:
        f.write(raw)
    return os.path.getsize(path), len(raw)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--cache', default=os.path.join(ROOT, '.cache', 'chateaux-territoires'))
    ap.add_argument('--basemaps', default='')
    ap.add_argument('--no-shapes', action='store_true')
    a = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)
    today = datetime.date.today().isoformat()
    items, shapes, _ = build_items(a.cache, None if a.no_shapes else [])
    sz = write_gz(os.path.join(OUT, 'territoires-europe.json.gz'), {
        'v': 1, 'built': today, 'source': 'Wikidata', 'licence': 'CC0 1.0', 'licence_url': 'https://creativecommons.org/publicdomain/zero/1.0/',
        'url': 'https://www.wikidata.org/', 'roots': ROOTS, 'items': items})
    print('territoires', len(items), sz, flush=True)
    sz = write_gz(os.path.join(OUT, 'territoires-contours.json.gz'), {
        'v': 1, 'built': today, 'q': 0.001, 'source': 'Wikimedia Commons, pages Data:*.map (licence propre à chaque fichier)',
        'url': 'https://commons.wikimedia.org/wiki/Help:Map_Data', 'shapes': shapes})
    print('contours', len(shapes), sz, flush=True)
    if a.basemaps:
        years, snaps = build_basemaps(a.basemaps)
        rev = ''
        try:
            rev = open(os.path.join(a.basemaps, '.git', 'HEAD')).read().strip()
            if rev.startswith('ref:'):
                rev = open(os.path.join(a.basemaps, '.git', rev[5:])).read().strip()
        except OSError:
            pass
        sz = write_gz(os.path.join(OUT, 'territoires-cartes.json.gz'), {
            'v': 1, 'built': today, 'q': 0.005, 'years': years, 'snaps': snaps,
            'source': 'historical-basemaps, André Ourednik et contributeurs (cartes du monde à des dates choisies), découpées sur l’Europe et simplifiées (≈ 3 km)',
            'licence': 'GPL-3.0', 'licence_url': 'https://www.gnu.org/licenses/gpl-3.0.html', 'url': 'https://github.com/aourednik/historical-basemaps',
            'rev': rev})
        print('cartes', len(years), sum(len(v) for v in snaps.values()), sz, flush=True)


if __name__ == '__main__':
    main()
