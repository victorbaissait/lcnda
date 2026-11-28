# LCNDA — lot 10 « objets et traces » : téléchargements polis pour les scripts de fabrication (Python 3, sans dépendance).
# Une requête à la fois, une pause entre deux appels au même site, Retry-After respecté sur 429, réponses gardées dans le cache.
import hashlib, json, os, time, urllib.parse, urllib.request

CACHE = os.environ.get('L10_RAW') or os.path.join(os.path.expanduser('~'), '.cache', 'lcnda-l10')
UA = 'LCNDA-genealogie-build/1.0 (open-source genealogy app; data build script)'
GAP = {'query.wikidata.org': 2.0, 'fr.wikisource.org': 2.5, 'www.wikidata.org': 1.5}
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
            if body.lstrip()[:9] == b'{"error":' or b'too many requests' in body[:2000].lower():
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
            time.sleep(max(ra, 10 * (i + 1)) if code == 429 else 5 * (i + 1))
    raise RuntimeError(f'{url[:160]} : {last}')


def sparql(q):
    body = get('https://query.wikidata.org/sparql', 'application/sparql-results+json', urllib.parse.urlencode({'query': q}))
    return json.loads(body)['results']['bindings']


def ws(params):
    """API de fr.wikisource.org"""
    return json.loads(get('https://fr.wikisource.org/w/api.php?' + urllib.parse.urlencode({**params, 'format': 'json', 'formatversion': '2'})))
