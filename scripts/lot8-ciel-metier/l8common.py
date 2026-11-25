"""LCNDA — lot 8 « ciel et métier » : outils communs des scripts de fabrication (scripts/lot8-ciel-metier/*.py).

Téléchargements gardés dans un cache (une fois), à petit pas ; écriture des fichiers assets/data/l8a-*.json.gz
(JSON compact, gzip, mtime 0 = fichiers stables).
"""
import gzip, hashlib, json, os, time, urllib.error, urllib.parse, urllib.request

UA = 'LCNDA-lot8-builder/1.0 (genealogy desktop app; one-off data build)'
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'assets', 'data')
CACHE = os.environ.get('L8_CACHE') or os.path.join(ROOT, 'scripts', 'lot8-ciel-metier', '.cache')
PACE = {'query.wikidata.org': 4, 'www.wikidata.org': 1.5, 'commons.wikimedia.org': 1.5, 'fr.wikipedia.org': 1.5, 'en.wikipedia.org': 1.5, 'archive.org': 2, 'fr.wikisource.org': 1.5}
_last = {}


def http(url, data=None, headers=None, timeout=300, tries=6):
    h = {'User-Agent': UA}
    h.update(headers or {})
    host = urllib.parse.urlparse(url).hostname
    last = None
    for i in range(tries):
        wait = PACE.get(host, 0.5) - (time.time() - _last.get(host, 0))
        if wait > 0: time.sleep(wait)
        _last[host] = time.time()
        try:
            with urllib.request.urlopen(urllib.request.Request(url, data=data, headers=h), timeout=timeout) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            last = e
            if e.code in (400, 404): raise RuntimeError(f'{url} : {e} {e.read()[:300]!r}')
            time.sleep(60 if e.code == 429 else 10 * (i + 1))
        except Exception as e:
            last = e; time.sleep(20)
    raise RuntimeError(f'{url} : {last}')


def cached(name, fetch):
    os.makedirs(CACHE, exist_ok=True)
    p = os.path.join(CACHE, name)
    if os.path.exists(p) and os.path.getsize(p) > 0:
        return open(p, 'rb').read()
    b = fetch()
    open(p, 'wb').write(b)
    return b


def sparql(q, name=None):
    name = name or 'sparql-' + hashlib.sha1(q.encode()).hexdigest()[:16] + '.json'
    b = cached(name, lambda: http('https://query.wikidata.org/sparql', data=urllib.parse.urlencode({'query': q, 'format': 'json'}).encode(),
                                  headers={'Accept': 'application/sparql-results+json', 'Content-Type': 'application/x-www-form-urlencoded'}))
    return [{k: v['value'] for k, v in r.items()} for r in json.loads(b)['results']['bindings']]


def api_json(url, name=None):
    name = name or 'api-' + hashlib.sha1(url.encode()).hexdigest()[:16] + '.json'
    return json.loads(cached(name, lambda: http(url)))


def qid(uri):
    return uri.rsplit('/', 1)[-1]


def write(name, obj):
    raw = json.dumps(obj, ensure_ascii=False, separators=(',', ':')).encode()
    p = os.path.join(OUT, name)
    with open(p, 'wb') as fh:
        with gzip.GzipFile(fileobj=fh, mode='wb', mtime=0, compresslevel=9) as g: g.write(raw)
    print(f'écrit {p} : {os.path.getsize(p)} octets ({len(raw)} sans gzip)')
    return os.path.getsize(p)


def commons_info(files):
    """auteur, licence, vignette de fichiers Commons (par 40) → {File: {...}}"""
    out = {}
    files = list(dict.fromkeys(files))
    for i in range(0, len(files), 40):
        part = files[i:i + 40]
        url = 'https://commons.wikimedia.org/w/api.php?' + urllib.parse.urlencode({'action': 'query', 'format': 'json', 'prop': 'imageinfo', 'iiprop': 'url|extmetadata', 'iiurlwidth': 320,
                                                                                   'iiextmetadatafilter': 'Artist|LicenseShortName|LicenseUrl|UsageTerms|Credit|DateTimeOriginal|ObjectName|Copyrighted',
                                                                                   'titles': '|'.join('File:' + f for f in part)})
        j = api_json(url)
        norm = {n['to']: n['from'] for n in j.get('query', {}).get('normalized', [])}
        for p in j.get('query', {}).get('pages', {}).values():
            ii = (p.get('imageinfo') or [None])[0]
            if not ii: continue
            m = ii.get('extmetadata', {})
            val = lambda k: strip_html(m.get(k, {}).get('value', ''))
            title = p['title'][5:]
            out[norm.get(p['title'], p['title'])[5:]] = out[title] = {'thumb': ii.get('thumburl', ''), 'page': ii.get('descriptionurl', ''), 'artist': val('Artist')[:120], 'lic': val('LicenseShortName'),
                                                                       'lic_url': val('LicenseUrl'), 'date': val('DateTimeOriginal')[:40], 'w': ii.get('thumbwidth'), 'h': ii.get('thumbheight')}
    return out


def strip_html(s):
    import re, html
    return html.unescape(re.sub(r'<[^>]+>', '', s or '')).strip()


FREE = ('public domain', 'pd', 'cc0', 'cc by', 'cc-by', 'cc by-sa', 'cc-by-sa', 'no restrictions', 'attribution')


def is_free(lic):
    l = (lic or '').lower()
    return any(l.startswith(x) or x in l for x in FREE) and 'nc' not in l.replace('cc by-sa', '').replace('cc-by-sa', '') and 'nd' not in l.split()
