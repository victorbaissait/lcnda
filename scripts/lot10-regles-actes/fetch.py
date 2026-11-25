"""Petit outil de téléchargement poli (une requête à la fois, pause, Retry-After), avec cache sur disque.
Usage : from fetch import get, get_json ; cache dans $L10_CACHE (défaut : ./cache)."""
import hashlib, json, os, time, urllib.request, urllib.error
UA = 'LCNDA-genealogie-data-build/1.0 (open-data build script)'
CACHE = os.environ.get('L10_CACHE', os.path.join(os.path.dirname(__file__), 'cache'))
os.makedirs(CACHE, exist_ok=True)
_last = [0.0]
def get(url, pause=1.0, tries=6, binary=False, headers=None):
    key = os.path.join(CACHE, hashlib.sha1(url.encode()).hexdigest())
    if os.path.exists(key):
        with open(key, 'rb') as f: data = f.read()
        return data if binary else data.decode('utf-8', 'replace')
    for i in range(tries):
        wait = _last[0] + pause - time.time()
        if wait > 0: time.sleep(wait)
        _last[0] = time.time()
        req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept-Encoding': 'identity', **(headers or {})})
        try:
            with urllib.request.urlopen(req, timeout=60) as r: data = r.read()
            with open(key, 'wb') as f: f.write(data)
            return data if binary else data.decode('utf-8', 'replace')
        except urllib.error.HTTPError as e:
            if e.code in (429, 503, 502, 504):
                ra = e.headers.get('Retry-After'); s = int(ra) if ra and ra.isdigit() else 5 * (i + 1)
                time.sleep(min(s, 60)); continue
            raise
        except Exception:
            time.sleep(3 * (i + 1))
    raise RuntimeError('échec : ' + url)
def get_json(url, **k): return json.loads(get(url, **k))
