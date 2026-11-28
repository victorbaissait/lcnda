"""LCNDA — 🧭 Histoire autour : outils communs aux scripts de fabrication (scripts/histoire-autour/build.py).

Téléchargements gardés dans un dossier « cache » (une fois) ; requêtes Wikidata (SPARQL, CC0) et Overpass (OSM, ODbL)
avec reprise ; écriture des fichiers assets/data/ha-*.json.gz (JSON compact, gzip, mtime 0 pour des fichiers stables).
"""
import gzip
import hashlib
import json
import math
import os
import time
import urllib.parse
import urllib.error
import urllib.request

UA = 'LCNDA-data-builder/1.0 (genealogy app; offline data build)'
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'assets', 'data')


PACE = {'query.wikidata.org': 62, 'www.wikidata.org': 2, 'overpass-api.de': 20}  # secondes entre deux requêtes (WDQS : 1 par minute en ce moment)
_last = {}


def http(url, data=None, headers=None, timeout=300, tries=6):
    h = {'User-Agent': UA}
    h.update(headers or {})
    host = urllib.parse.urlparse(url).hostname
    last = None
    for i in range(tries):
        wait = PACE.get(host, 0) - (time.time() - _last.get(host, 0))
        if wait > 0:
            time.sleep(wait)
        _last[host] = time.time()
        try:
            req = urllib.request.Request(url, data=data, headers=h)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            last = e
            if e.code == 400:
                raise RuntimeError(f'{url} : {e} {e.read()[:500]!r}')
            print(f'  … essai {i + 1} raté ({e}), on réessaie', flush=True)
            time.sleep(70 if e.code == 429 else 15 * (i + 1))
        except Exception as e:  # réseau capricieux : on réessaie
            last = e
            if i + 1 < tries:
                print(f'  … essai {i + 1} raté ({e}), on réessaie', flush=True)
                time.sleep(15 * (i + 1))
    raise RuntimeError(f'{url} : {last}')


def cached(cache, name, fetch):
    os.makedirs(cache, exist_ok=True)
    p = os.path.join(cache, name)
    if os.path.exists(p) and os.path.getsize(p) > 0:
        with open(p, 'rb') as f:
            return f.read()
    b = fetch()
    with open(p, 'wb') as f:
        f.write(b)
    return b


def sparql(cache, name, query):
    """une requête Wikidata, gardée dans le cache (nom = name + empreinte de la requête)"""
    key = hashlib.sha1(query.encode()).hexdigest()[:10]

    def fetch():  # une réponse coupée (délai dépassé côté serveur) n'est pas gardée : on réessaie
        for i in range(4):
            raw = http('https://query.wikidata.org/sparql', data=urllib.parse.urlencode({'query': query}).encode(),
                       headers={'Accept': 'application/sparql-results+json', 'Content-Type': 'application/x-www-form-urlencoded'})
            try:
                json.loads(raw)
                return raw
            except ValueError:
                print(f'  … réponse coupée ({name}), on réessaie', flush=True)
        raise RuntimeError(f'Wikidata : la requête {name} dépasse le délai')
    raw = cached(cache, f'wd-{name}-{key}.json', fetch)
    return [{k: v['value'] for k, v in b.items()} for b in json.loads(raw)['results']['bindings']]


def wd_labels(cache, name, ids, size=2500):
    """{Qid: libellé fr (sinon en)} pour une liste d'entités, par lots (VALUES)"""
    out = {}
    ids = sorted({i for i in ids if i})
    for k in range(0, len(ids), size):
        vals = ' '.join(f'wd:{q}' for q in ids[k:k + size])
        q = f'SELECT ?it ?fr ?en WHERE {{ VALUES ?it {{ {vals} }} OPTIONAL {{ ?it rdfs:label ?fr FILTER(LANG(?fr)="fr") }} OPTIONAL {{ ?it rdfs:label ?en FILTER(LANG(?en)="en") }} }}'
        for r in sparql(cache, f'{name}-lab{k // size}', q):
            x = r.get('fr') or r.get('en') or ''
            if x:
                out.setdefault(qid(r['it']), x)
    return out


def overpass(cache, name, query):
    key = hashlib.sha1(query.encode()).hexdigest()[:10]
    # plusieurs serveurs Overpass publics (le principal peut être injoignable, par ex. une machine sans IPv6) ; OVERPASS_URLS les remplace
    urls = [u for u in os.environ.get('OVERPASS_URLS', 'https://overpass-api.de/api/interpreter https://overpass.private.coffee/api/interpreter https://overpass.kumi.systems/api/interpreter').split() if u]

    def fetch():
        last = None
        for u in urls:
            try:
                return http(u, data=urllib.parse.urlencode({'data': query}).encode(), timeout=900)
            except Exception as e:  # noqa: BLE001 — on essaie le serveur suivant
                last = e
                print(f'  … {u} : {e} ; serveur suivant', flush=True)
        raise RuntimeError(f'Overpass injoignable : {last}')
    raw = cached(cache, f'osm-{name}-{key}.json', fetch)
    return json.loads(raw)


def qid(uri):
    return uri.rsplit('/', 1)[-1] if uri else ''


def wd_date(v):
    """« 1870-08-16T00:00:00Z » → (année, 'AAAA-MM-JJ' ou '') ; les dates av. J.-C. gardent leur signe"""
    if not v:
        return None, ''
    neg = v.startswith('-')
    s = v[1:] if neg else v
    try:
        y = int(s[:s.index('-')])
    except ValueError:
        return None, ''
    y = -y if neg else y
    md = s[s.index('-') + 1:s.index('-') + 6]
    return y, ('' if neg else f'{y:04d}-{md}')


def wkt_point(v):
    """« Point(lon lat) » → (lat, lon) arrondis à 1e-4°"""
    if not v or not v.startswith('Point('):
        return None
    try:
        lon, lat = (float(x) for x in v[6:-1].split())
    except ValueError:
        return None
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return None
    return round(lat, 4), round(lon, 4)


def km(a, b, c, d):
    r = math.pi / 180
    x = math.sin((c - a) * r / 2) ** 2 + math.cos(a * r) * math.cos(c * r) * math.sin((d - b) * r / 2) ** 2
    return 12742 * math.asin(min(1, math.sqrt(x)))


def simplify(pts, tol):
    """Douglas-Peucker sur des points (x, y) en degrés (tol en degrés), itératif"""
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
        best, bi = -1.0, -1
        for i in range(a + 1, b):
            px, py = pts[i]
            if L == 0:
                d = (px - ax) ** 2 + (py - ay) ** 2
            else:
                t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / L))
                d = (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2
            if d > best:
                best, bi = d, i
        if bi >= 0 and best > tol * tol:
            keep[bi] = True
            stack.append((a, bi))
            stack.append((bi, b))
    return [p for p, k in zip(pts, keep) if k]


def encode_line(pts, q=1e4):
    """[[lat, lon], …] → [lat0*q, lon0*q, dlat, dlon, …] (entiers, deltas) : compact en JSON"""
    out, plat, plon = [], 0, 0
    for lat, lon in pts:
        a, b = round(lat * q), round(lon * q)
        if out and a == plat and b == plon:
            continue
        out += [a - plat, b - plon]
        plat, plon = a, b
    return out


def write_gz(name, obj):
    os.makedirs(OUT, exist_ok=True)
    raw = json.dumps(obj, ensure_ascii=False, separators=(',', ':')).encode()
    p = os.path.join(OUT, name)
    with open(p, 'wb') as f:
        with gzip.GzipFile(fileobj=f, mode='wb', compresslevel=9, mtime=0) as g:
            g.write(raw)
    print(f'→ {p} : {len(raw) / 1e6:.2f} Mo de JSON, {os.path.getsize(p) / 1e6:.2f} Mo compressé', flush=True)
    return os.path.getsize(p)
