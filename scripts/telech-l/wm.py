# LCNDA — lot L « téléchargements » (🌐 Les équivalents d'ailleurs) : téléchargements polis pour les scripts de fabrication (Python 3, sans dépendance).
# Une requête à la fois, une pause entre deux appels au même site, Retry-After respecté sur 429, réponses gardées dans le cache.
import hashlib, json, os, time, urllib.parse, urllib.request

CACHE = os.environ.get('TL_RAW') or os.path.join(os.path.expanduser('~'), '.cache', 'lcnda-tl')
UA = 'LCNDA-genealogie-build/1.0 (open-source genealogy app; data build script)'
GAP = {'archive.org': 2.0, 'overpass-api.de': 10.0, 'query.wikidata.org': float(os.environ.get('TL_WDQS_GAP') or 60.0), 'fr.wikisource.org': 3.0, 'www.wikidata.org': 1.5, 'fr.wiktionary.org': 3.0, 'fr.wikipedia.org': 3.0}
_last = {}


def get(url, accept='application/json', data=None, tries=6, check=None):
    os.makedirs(CACHE, exist_ok=True)
    key = hashlib.sha1((url + '\n' + (data or '')).encode()).hexdigest()
    f = os.path.join(CACHE, key)
    if os.path.exists(f) and os.path.getsize(f) > 0:   # une réponse vide gardée par erreur n'est pas reprise
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
            with urllib.request.urlopen(req, timeout=int(os.environ.get('TL_TIMEOUT') or 300)) as r:
                body = r.read()
            if body.lstrip()[:9] == b'{"error":' or b'too many requests' in body[:2000].lower() or b'making too many requests' in body[:400].lower():
                raise RuntimeError('réponse d’erreur : ' + body[:160].decode('utf-8', 'replace'))
            if not body.strip():
                raise RuntimeError('réponse vide')
            if check:
                check(body)   # une réponse coupée (délai dépassé au milieu) n'est pas gardée : on redemande
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
            if 'maxlag' in str(e):   # l'API de Wikidata demande d'attendre que ses serveurs rattrapent leur retard
                time.sleep(max(ra, 30 * (i + 1)))
                continue
            time.sleep(max(ra, 20 * (i + 1)) if code == 429 or 'too many' in str(e).lower() else 5 * (i + 1))
    raise RuntimeError(f'{url[:160]} : {last}')


def sparql(q):
    # deux essais seulement : une réponse coupée ou un 504 veut dire « trop lourd » — l'appelant recoupe la requête en morceaux plus petits
    body = get('https://query.wikidata.org/sparql', 'application/sparql-results+json', urllib.parse.urlencode({'query': q}), check=json.loads, tries=int(os.environ.get('TL_WDQS_TRIES') or 2))
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


import re as _re


def year(t):
    m = _re.match(r'^\+?(-?\d{1,4})-', t or '')
    return int(m.group(1)) if m else None


def qid(u):
    return (u or '').rsplit('/', 1)[-1]


def point(v):
    m = _re.match(r'Point\(([-\d.eE]+) ([-\d.eE]+)\)', v or '')
    return (round(float(m.group(2)), 5), round(float(m.group(1)), 5)) if m else (None, None)


def today():
    return time.strftime('%Y-%m-%d')


# ───────── (comme au lot K) : l'API de Wikidata (wbgetentities, recherche haswbstatement) quand le service de requêtes est saturé ─────────
WD_API = 'https://www.wikidata.org/w/api.php'


def wd_api(params):
    return json.loads(get(WD_API + '?' + urllib.parse.urlencode({**params, 'format': 'json', 'formatversion': '2', 'maxlag': '5'})))


def wd_search(expr, cap=10000):
    """les Q… d'une recherche « haswbstatement:… » (l'API s'arrête à 10 000 résultats : au-delà, le service de requêtes)"""
    out, off = [], 0
    while off < cap:
        r = wd_api({'action': 'query', 'list': 'search', 'srsearch': expr, 'srlimit': '500', 'sroffset': str(off), 'srnamespace': '0', 'srinfo': 'totalhits', 'srprop': ''})
        hits = r.get('query', {}).get('search', [])
        out += [h['title'] for h in hits]
        nxt = r.get('continue', {}).get('sroffset')
        if not hits or nxt is None:
            break
        off = int(nxt)
    return list(dict.fromkeys(out))


def wd_entities(ids, props='labels|claims|sitelinks', langs='fr|en'):
    """{Q: entité} par paquets de 50"""
    out, ids = {}, [i for i in dict.fromkeys(ids) if _re.match(r'^[QP]\d+$', i)]
    for i in range(0, len(ids), 50):
        r = wd_api({'action': 'wbgetentities', 'ids': '|'.join(ids[i:i + 50]), 'props': props, 'languages': langs})
        out.update({k: v for k, v in (r.get('entities') or {}).items() if 'missing' not in v})
    return out


def label(e, langs=('fr', 'en')):
    L = (e or {}).get('labels') or {}
    for l in langs:
        if l in L:
            return L[l]['value']
    return next((v['value'] for v in L.values()), '')


def claims(e, p):
    return [c for c in ((e or {}).get('claims') or {}).get(p, []) if c.get('rank') != 'deprecated' and c.get('mainsnak', {}).get('snaktype') == 'value']


def val(c):
    v = c['mainsnak']['datavalue']['value']
    return v


def first_q(e, p):
    for c in claims(e, p):
        v = val(c)
        if isinstance(v, dict) and v.get('id'):
            return v['id']
    return ''


def first_year(e, p):
    for c in claims(e, p):
        v = val(c)
        if isinstance(v, dict) and v.get('time'):
            return year(v['time'])
    return None


def coord(e):
    for c in claims(e, 'P625'):
        v = val(c)
        if isinstance(v, dict) and v.get('latitude') is not None and (v.get('globe') or '').endswith('Q2'):
            return round(v['latitude'], 5), round(v['longitude'], 5)
    return None, None


def licence_check(url, must, accept='text/plain'):
    """relit la page de licence au moment de fabriquer ; s'arrête si la phrase attendue n'y est plus"""
    import sys
    t = get(url, accept).decode('utf-8', 'replace')
    for m in ([must] if isinstance(must, str) else must):
        if m not in t:
            sys.exit(f'Licence : « {m} » introuvable dans {url} — relire la page avant de fabriquer.')
    return t
