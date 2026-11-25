"""LCNDA — Pays et mémoire : outils communs des scripts de construction (téléchargement poli, cache disque, Wikidata).
Les réponses brutes sont gardées dans un dossier de travail (PM_WORK, par défaut ./_work) pour pouvoir relancer sans tout refaire."""
import gzip, hashlib, json, os, sys, time, urllib.error, urllib.parse, urllib.request

UA = 'LCNDA-genealogy-builder/1.0 (open-source genealogy app; data build script)'
WORK = os.environ.get('PM_WORK') or os.path.join(os.getcwd(), '_work')
os.makedirs(WORK, exist_ok=True)
_last = {}


def fetch(url, data=None, headers=None, min_gap=1.0, tries=6, cache=True, timeout=300):
    """GET (ou POST si data) avec cache disque, pause minimale par hôte et nouvelles tentatives (429/5xx)."""
    key = hashlib.sha1((url + '|' + (data.decode() if isinstance(data, bytes) else (data or ''))).encode()).hexdigest()
    path = os.path.join(WORK, key + '.bin')
    if cache and os.path.exists(path) and os.path.getsize(path) > 0:
        return open(path, 'rb').read()
    host = urllib.parse.urlparse(url).netloc
    h = {'User-Agent': UA}
    h.update(headers or {})
    wait = 5
    for i in range(tries):
        gap = time.time() - _last.get(host, 0)
        if gap < min_gap:
            time.sleep(min_gap - gap)
        _last[host] = time.time()
        try:
            req = urllib.request.Request(url, data=data if isinstance(data, (bytes, type(None))) else data.encode(), headers=h)
            body = urllib.request.urlopen(req, timeout=timeout).read()
            if not body:
                raise urllib.error.URLError('empty body')
            if cache:
                open(path, 'wb').write(body)
            return body
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504):
                ra = e.headers.get('Retry-After')
                t = int(ra) if ra and ra.isdigit() else wait
                print(f'  {host}: HTTP {e.code}, pause {t}s', file=sys.stderr)
                time.sleep(t)
                wait = min(wait * 2, 120)
                continue
            raise
        except Exception as e:  # coupures réseau, corps vide
            print(f'  {host}: {e}, pause {wait}s', file=sys.stderr)
            time.sleep(wait)
            wait = min(wait * 2, 120)
    raise RuntimeError('échec : ' + url)


def fetch_json(url, **kw):
    return json.loads(fetch(url, **kw).decode('utf-8'))


def sparql(query, min_gap=62):
    """Requête au service SPARQL de Wikidata (limité à 1 requête par minute pendant les pannes : on attend)."""
    body = urllib.parse.urlencode({'query': query, 'format': 'json'})
    raw = fetch('https://query.wikidata.org/sparql', data=body, headers={'Accept': 'application/sparql-results+json', 'Content-Type': 'application/x-www-form-urlencoded'}, min_gap=min_gap)
    return json.loads(raw.decode('utf-8'))['results']['bindings']


def wd_api(params, min_gap=1.5):
    params = dict(params, format='json')
    return fetch_json('https://www.wikidata.org/w/api.php?' + urllib.parse.urlencode(params), min_gap=min_gap)


def wd_entities(ids, props='claims|labels|sitelinks', langs='fr|en'):
    """wbgetentities par lots de 50 ; renvoie {qid: entité}."""
    out = {}
    ids = sorted(set(ids))
    for i in range(0, len(ids), 50):
        r = wd_api({'action': 'wbgetentities', 'ids': '|'.join(ids[i:i + 50]), 'props': props, 'languages': langs, 'sitefilter': 'frwiki'})
        out.update(r.get('entities', {}))
    return out


def wd_search(query, limit=10000):
    """CirrusSearch (haswbstatement:…) : renvoie la liste des QID ; on évite le service SPARQL quand il est bridé."""
    ids, off = [], 0
    while off is not None and off < limit:
        r = wd_api({'action': 'query', 'list': 'search', 'srsearch': query, 'srlimit': 500, 'sroffset': off, 'srnamespace': 0, 'srprop': ''})
        ids += [x['title'] for x in r.get('query', {}).get('search', [])]
        off = r.get('continue', {}).get('sroffset')
    return ids


def label(e, lang='fr'):
    l = e.get('labels', {})
    return (l.get(lang) or l.get('en') or {}).get('value', '')


def claims(e, p):
    """valeurs simples d'une propriété (QID, chaîne, {lat,lon}, année)"""
    out = []
    for c in e.get('claims', {}).get(p, []):
        if c.get('rank') == 'deprecated':
            continue
        v = c.get('mainsnak', {}).get('datavalue', {}).get('value')
        if v is None:
            continue
        if isinstance(v, dict) and 'id' in v:
            out.append(v['id'])
        elif isinstance(v, dict) and 'latitude' in v:
            out.append({'lat': round(v['latitude'], 5), 'lon': round(v['longitude'], 5)})
        elif isinstance(v, dict) and 'time' in v:
            try:
                y = int(v['time'][:5].replace('+', '')) if v['time'][0] in '+-' else int(v['time'][:4])
                if v['time'][0] == '-':
                    y = -int(v['time'][1:5])
                out.append(y)
            except ValueError:
                pass
        elif isinstance(v, dict) and 'amount' in v:
            out.append(float(v['amount']))
        else:
            out.append(v)
    return out


def write_gz(path, obj):
    raw = json.dumps(obj, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    with gzip.GzipFile(path, 'wb', mtime=0, compresslevel=9) as f:
        f.write(raw)
    return len(raw), os.path.getsize(path)
