# LCNDA — lot 9 « sons et enfance » : petits outils communs aux scripts de fabrication (Python 3, sans dépendance).
import gzip, json, os, time, urllib.parse, urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
DATA = os.path.join(ROOT, 'assets', 'data')
CACHE = os.environ.get('L9A_CACHE') or os.path.join(os.path.expanduser('~'), '.cache', 'lcnda-l9a')
_LAST = {}
_GAP = {'fr.wikipedia.org': 1.0, 'fr.wikisource.org': 1.0, 'www.wikidata.org': 1.0, 'commons.wikimedia.org': 1.0, 'query.wikidata.org': 2.0, 'imslp.org': 1.5, 'archive.org': 0.5}
UA = 'LCNDA-genealogie-build/1.0 (open-source genealogy app; data build script)'


def get(url, accept='application/json', tries=3, pause=0.0, cache=True):
    """télécharge une adresse (gardée dans .cache pour refaire sans réseau)"""
    os.makedirs(CACHE, exist_ok=True)
    import hashlib
    f = os.path.join(CACHE, hashlib.sha1(url.encode()).hexdigest())
    if cache and os.path.exists(f):
        return open(f, 'rb').read()
    last = None
    host = urllib.parse.urlparse(url).hostname or ''
    for i in range(max(tries, 6)):
        wait = _GAP.get(host, 0.3) - (time.time() - _LAST.get(host, 0))
        if wait > 0: time.sleep(wait)
        _LAST[host] = time.time()
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': accept})
            with urllib.request.urlopen(req, timeout=90) as r:
                body = r.read()
            if body.lstrip().startswith(b'{"error"'):
                raise RuntimeError('réponse d’erreur : ' + body[:200].decode('utf-8', 'replace'))
            if cache:
                open(f, 'wb').write(body)
            if pause:
                time.sleep(pause)
            return body
        except Exception as e:  # noqa
            last = e
            code = getattr(e, 'code', 0)
            if code in (400, 404): break
            ra = 0
            try: ra = int(e.headers.get('Retry-After') or 0)
            except Exception: pass
            time.sleep(max(ra, 5 + 10 * i) if code == 429 else 3 + 5 * i)
    raise last


def jget(url, **kw):
    return json.loads(get(url, **kw).decode('utf-8'))


def sparql(q):
    url = 'https://query.wikidata.org/sparql?format=json&query=' + urllib.parse.quote(q)
    return jget(url, accept='application/sparql-results+json')['results']['bindings']


def write(name, obj):
    """assets/data/<name>.json.gz (compact) → taille en octets"""
    p = os.path.join(DATA, name + '.json.gz')
    raw = json.dumps(obj, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    with gzip.GzipFile(p, 'wb', mtime=0, compresslevel=9) as g:
        g.write(raw)
    n = os.path.getsize(p)
    print(f'{p}: {n} octets ({len(raw)} non compressés)')
    return n


def today():
    return time.strftime('%Y-%m-%d')
