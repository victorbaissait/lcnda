# LCNDA — lot E « téléchargements » : téléchargements polis pour les scripts de fabrication (Python 3, sans dépendance).
# Une requête à la fois, une pause entre deux appels au même site, Retry-After respecté sur 429, réponses gardées dans le cache.
import hashlib, json, os, time, urllib.parse, urllib.request

AREA = (41.0, 51.5, -5.5, 10.0)  # France, Belgique, Luxembourg, Suisse (lat min, lat max, lon min, lon max)

CACHE = os.environ.get('TE_RAW') or os.path.join(os.path.expanduser('~'), '.cache', 'lcnda-te')
UA = 'LCNDA-genealogie-build/1.0 (open-source genealogy app; data build script)'
GAP = {'www.ncei.noaa.gov': 0.3, 'zenodo.org': 1.0, 'paleobiodb.org': 1.0, 'overpass-api.de': 5.0, 'query.wikidata.org': 2.0, 'fr.wikisource.org': 3.0, 'www.wikidata.org': 1.5, 'fr.wiktionary.org': 3.0, 'fr.wikipedia.org': 3.0}
_last = {}


def get(url, accept='application/json', data=None, tries=6):
    os.makedirs(CACHE, exist_ok=True)
    key = hashlib.sha1((url + '\n' + (data or '')).encode()).hexdigest()
    f = os.path.join(CACHE, key)
    if os.path.exists(f):
        return open(f, 'rb').read()
    host = urllib.parse.urlparse(url).hostname or ''
    last = None
    for i in range(tries):
        wait = GAP.get(host, 1.0) - (time.time() - _last.get(host, 0))
        if wait > 0:
            time.sleep(wait)
        _last[host] = time.time()
        try:
            req = urllib.request.Request(url, data=data.encode() if data else None, headers={'User-Agent': UA, 'Accept': accept,
                                         **({'Content-Type': 'application/x-www-form-urlencoded'} if data else {})})
            with urllib.request.urlopen(req, timeout=120) as r:
                body = r.read()
            if body.lstrip()[:9] == b'{"error":' or b'too many requests' in body[:2000].lower() or b'making too many requests' in body[:400].lower():
                raise RuntimeError('réponse d’erreur : ' + body[:160].decode('utf-8', 'replace'))
            open(f, 'wb').write(body)
            return body
        except Exception as e:  # noqa
            last = e
            code = getattr(e, 'code', 0)
            if code in (400, 404):
                break
            if code == 0 and 'ratelimited' in str(e).lower() or 'too many' in str(e).lower():
                code = 429
            ra = 0
            try:
                ra = int(e.headers.get('Retry-After') or 0)
            except Exception:  # noqa
                pass
            time.sleep(max(ra, 20 * (i + 1)) if code == 429 or 'too many' in str(e).lower() else 5 * (i + 1))
    raise RuntimeError(f'{url[:160]} : {last}')


def sparql(q):
    body = get('https://query.wikidata.org/sparql', 'application/sparql-results+json', urllib.parse.urlencode({'query': q}))
    return json.loads(body)['results']['bindings']


def ws(params):
    """API de fr.wikisource.org"""
    return json.loads(get('https://fr.wikisource.org/w/api.php?' + urllib.parse.urlencode({**params, 'format': 'json', 'formatversion': '2'})))


def mw(host, params):
    """API MediaWiki (fr.wikipedia.org, fr.wiktionary.org…)"""
    return json.loads(get(f'https://{host}/w/api.php?' + urllib.parse.urlencode({**params, 'format': 'json', 'formatversion': '2', 'maxlag': '5'})))


def write_gz(out_dir, name, meta):
    import gzip
    os.makedirs(out_dir, exist_ok=True)
    p = os.path.join(out_dir, name)
    with gzip.GzipFile(p, 'wb', mtime=0, compresslevel=9) as f:
        f.write(json.dumps(meta, ensure_ascii=False, separators=(',', ':')).encode())
    return os.path.getsize(p)
