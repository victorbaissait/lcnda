"""LCNDA — 🕰 Son époque et son travail : outils communs aux scripts de fabrication (scripts/epoque-travail/build.py).

Téléchargements gardés dans un dossier « cache » (une fois), à petit pas (les serveurs de Wikimedia limitent le
nombre de requêtes) ; écriture des fichiers assets/data/et-*.json.gz (JSON compact, gzip, mtime 0 = fichiers stables).
"""
import gzip
import hashlib
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

UA = 'LCNDA-data-builder/1.0 (genealogy app; offline data build)'
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'assets', 'data')
PACE = {'query.wikidata.org': 62, 'www.wikidata.org': 6, 'fr.wikipedia.org': 6, 'en.wikipedia.org': 6, 'commons.wikimedia.org': 6}
_last = {}


def http(url, data=None, headers=None, timeout=300, tries=8):
    h = {'User-Agent': UA}
    h.update(headers or {})
    host = urllib.parse.urlparse(url).hostname
    last = None
    for i in range(tries):
        wait = PACE.get(host, 1) - (time.time() - _last.get(host, 0))
        if wait > 0:
            time.sleep(wait)
        _last[host] = time.time()
        try:
            req = urllib.request.Request(url, data=data, headers=h)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                b = r.read()
            if b[:200].lstrip().startswith(b'<!DOCTYPE html>') and b'Wikimedia Error' in b[:2000] or b.startswith(b'You are making too many requests'):
                raise RuntimeError('trop de requêtes')
            return b
        except urllib.error.HTTPError as e:
            last = e
            if e.code in (400, 404):
                raise RuntimeError(f'{url} : {e} {e.read()[:300]!r}')
            print(f'  … {host} essai {i + 1} raté ({e}), on attend', flush=True)
            time.sleep(90 if e.code == 429 else 20 * (i + 1))
        except Exception as e:  # réseau capricieux, limite de débit : on réessaie
            last = e
            print(f'  … {host} essai {i + 1} raté ({e}), on attend', flush=True)
            time.sleep(90)
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
    key = hashlib.sha1(query.encode()).hexdigest()[:10]

    def fetch():
        for _ in range(4):
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


def mw(cache, host, params, name=None):
    """une requête à l'API MediaWiki (fr.wikipedia, commons…), gardée dans le cache"""
    params = {**params, 'format': 'json', 'formatversion': '2'}
    q = urllib.parse.urlencode(params)
    key = hashlib.sha1((host + q).encode()).hexdigest()[:12]
    raw = cached(cache, f'mw-{name or host}-{key}.json', lambda: http(f'https://{host}/w/api.php?{q}'))
    return json.loads(raw)


def qid(uri):
    return uri.rsplit('/', 1)[-1] if uri else ''


def wd_year(v):
    if not v:
        return None
    neg = v.startswith('-')
    s = v[1:] if neg else v
    try:
        y = int(s.split('-')[0])
    except ValueError:
        return None
    return -y if neg else y


def wkt_point(v):
    """« Point(lon lat) » → (lat, lon)"""
    try:
        a, b = v[v.index('(') + 1:v.index(')')].split()
        return round(float(b), 4), round(float(a), 4)
    except Exception:
        return None


def write_gz(name, obj):
    p = os.path.join(OUT, name)
    raw = json.dumps(obj, ensure_ascii=False, separators=(',', ':')).encode()
    with open(p, 'wb') as f:
        with gzip.GzipFile(fileobj=f, mode='wb', mtime=0, compresslevel=9) as g:
            g.write(raw)
    print(f'  → {name} : {os.path.getsize(p) / 1024:.0f} Ko ({len(raw) / 1024:.0f} Ko décompressé)', flush=True)
    return p
