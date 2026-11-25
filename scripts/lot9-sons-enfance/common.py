# LCNDA — lot 9 « sons et enfance » : petits outils communs aux scripts de fabrication (Python 3, sans dépendance).
import gzip, json, os, time, urllib.parse, urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
DATA = os.path.join(ROOT, 'assets', 'data')
CACHE = os.environ.get('L9A_CACHE') or os.path.join(os.path.expanduser('~'), '.cache', 'lcnda-l9a')
UA = 'LCNDA-genealogie-build/1.0 (open-source genealogy app; data build script)'


def get(url, accept='application/json', tries=3, pause=0.0, cache=True):
    """télécharge une adresse (gardée dans .cache pour refaire sans réseau)"""
    os.makedirs(CACHE, exist_ok=True)
    import hashlib
    f = os.path.join(CACHE, hashlib.sha1(url.encode()).hexdigest())
    if cache and os.path.exists(f):
        return open(f, 'rb').read()
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': accept})
            with urllib.request.urlopen(req, timeout=90) as r:
                body = r.read()
            if cache:
                open(f, 'wb').write(body)
            if pause:
                time.sleep(pause)
            return body
        except Exception as e:  # noqa
            last = e
            time.sleep(3 + 5 * i)
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
