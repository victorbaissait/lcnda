"""Petit client poli pour Wikidata / Wikimedia (scripts de construction de terre-mots).
Chaque réponse est gardée dans un dossier (raw/) : relancer le script ne refait pas les appels.
Wikimedia limite fort les appels : User-Agent explicite, attente entre deux appels, reprise après 429."""
import hashlib, json, os, sys, time, urllib.parse, urllib.request

UA = 'LCNDA-genealogie/1.0 (build script lot8-monde-village; https://github.com/victorbaissait/lcnda)'
RAW = os.environ.get('L8C_RAW', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'raw'))
_last = {}

def _wait(host, gap):
    t = _last.get(host, 0) + gap - time.time()
    if t > 0: time.sleep(t)
    _last[host] = time.time()

def get(url, data=None, accept='application/json', gap=1.5, key=None, tries=int(os.environ.get('L8C_TRIES', '12'))):
    os.makedirs(RAW, exist_ok=True)
    k = key or hashlib.sha1((url + '|' + (data or '')).encode()).hexdigest()
    f = os.path.join(RAW, k)
    if os.path.exists(f):
        with open(f, 'rb') as fh: return fh.read()
    host = urllib.parse.urlparse(url).hostname
    for i in range(tries):
        _wait(host, gap)
        req = urllib.request.Request(url, data=data.encode() if data else None, headers={'User-Agent': UA, 'Accept': accept,
              **({'Content-Type': 'application/x-www-form-urlencoded'} if data else {})})
        try:
            with urllib.request.urlopen(req, timeout=300) as r: body = r.read()
            if 'json' not in accept:
                with open(f, 'wb') as fh: fh.write(body)
                return body
            try:
                json.loads(body)
                with open(f, 'wb') as fh: fh.write(body)
                return body
            except ValueError:
                print('  réponse non JSON ou coupée, on attend', file=sys.stderr)
        except Exception as e:
            print(f'  {host}: {e} — essai {i + 1}', file=sys.stderr)
        time.sleep(min(120, 20 * (i + 1)))
    raise RuntimeError('échec ' + url)

def sparql(q, key):
    body = get('https://query.wikidata.org/sparql', data=urllib.parse.urlencode({'query': q, 'format': 'json'}), accept='application/sparql-results+json', gap=float(os.environ.get("L8C_SPARQL_GAP", "20")), key='sparql-' + key)
    j = json.loads(body)
    return [{k: v['value'] for k, v in b.items()} for b in j['results']['bindings']]

def wd(params, gap=1.5):
    params = {**params, 'format': 'json', 'formatversion': '2'}
    return json.loads(get('https://www.wikidata.org/w/api.php?' + urllib.parse.urlencode(params), gap=gap))

def entities(ids, props='claims|labels', languages='fr|en'):
    out = {}
    ids = list(dict.fromkeys(ids))
    for i in range(0, len(ids), 50):
        j = wd({'action': 'wbgetentities', 'ids': '|'.join(ids[i:i + 50]), 'props': props, 'languages': languages})
        out.update(j.get('entities', {}))
    return out

def claims(e, p):
    out = []
    for c in (e or {}).get('claims', {}).get(p, []):
        if c.get('rank') == 'deprecated': continue
        v = c.get('mainsnak', {}).get('datavalue', {}).get('value')
        if v is not None: out.append(v)
    return out

def ids(e, p): return [v['id'] for v in claims(e, p) if isinstance(v, dict) and 'id' in v]

def label(e, langs=('fr', 'en')):
    L = (e or {}).get('labels', {})
    for l in langs:
        if l in L: return L[l]['value'] if isinstance(L[l], dict) else L[l]
    for v in L.values(): return v['value'] if isinstance(v, dict) else v
    return ''

def year(e, p):
    for v in claims(e, p):
        t = v.get('time', '') if isinstance(v, dict) else ''
        if t[:1] == '+' and len(t) > 5:
            try: return int(t[1:5])
            except ValueError: pass
    return None
