"""Petit outil réseau des scripts du lot 8 (soldats et noms) : requêtes polies (User-Agent, pause, reprise après 429),
réponses gardées dans un dossier cache (L8B_CACHE, par défaut ./cache) pour pouvoir relancer sans tout retélécharger."""
import hashlib, json, os, ssl, sys, time, urllib.parse, urllib.request

CACHE = os.environ.get('L8B_CACHE') or os.path.join(os.path.dirname(os.path.abspath(__file__)), 'cache')
CA = os.environ.get('SSL_CERT_FILE') or ('/root/.ccr/ca-bundle.crt' if os.path.exists('/root/.ccr/ca-bundle.crt') else None)
CTX = ssl.create_default_context(cafile=CA) if CA else ssl.create_default_context()
UA = 'lcnda-build/1.0 (genealogy desktop app; open data build script)'
PAUSE = float(os.environ.get('L8B_PAUSE', '1.5'))


def _path(url, params=None, data=None):
    if params:
        url += ('&' if '?' in url else '?') + urllib.parse.urlencode(params)
    body = urllib.parse.urlencode(data).encode() if data else None
    key = hashlib.sha1((url + '\n' + (body or b'').decode()).encode()).hexdigest()
    return os.path.join(CACHE, key[:2], key)


def forget(url, params=None, data=None):
    try:
        os.remove(_path(url, params, data))
    except OSError:
        pass


def get(url, params=None, data=None, accept='application/json', tries=40, timeout=180, cache=True):
    if params:
        url += ('&' if '?' in url else '?') + urllib.parse.urlencode(params)
    body = urllib.parse.urlencode(data).encode() if data else None
    key = hashlib.sha1((url + '\n' + (body or b'').decode()).encode()).hexdigest()
    path = os.path.join(CACHE, key[:2], key)
    if cache and os.path.exists(path):
        with open(path, 'rb') as f:
            return f.read()
    for i in range(tries):
        try:
            req = urllib.request.Request(url, data=body, headers={'User-Agent': UA, 'Accept': accept})
            with urllib.request.urlopen(req, context=CTX, timeout=timeout) as r:
                out = r.read()
            time.sleep(PAUSE)
            if cache:
                os.makedirs(os.path.dirname(path), exist_ok=True)
                with open(path, 'wb') as f:
                    f.write(out)
            return out
        except Exception as e:  # 429, 5xx, coupure : on attend (Retry-After si le site le dit) puis on recommence
            wait = min(300, 20 * (i + 1))
            ra = getattr(e, 'headers', None) and e.headers.get('Retry-After')
            if ra and str(ra).isdigit():
                wait = int(ra) + 5
            print('  … nouvel essai', i + 1, 'dans', wait, 's', url[:90], e, file=sys.stderr)
            time.sleep(wait)
    raise RuntimeError('échec : ' + url[:200])


def js(url, params=None, data=None, **kw):
    for i in range(4):
        raw = get(url, params, data, **kw)
        try:
            return json.loads(raw)
        except ValueError:  # réponse coupée (Wikidata qui dépasse son temps) : on l'oublie et on recommence
            print('  … réponse coupée, nouvel essai', file=sys.stderr)
            forget(url, params, data)
            time.sleep(30)
    raise RuntimeError('réponse illisible : ' + url[:200])


def sparql(q):
    return js('https://query.wikidata.org/sparql', data={'query': q, 'format': 'json'}, accept='application/sparql-results+json')['results']['bindings']


def wp(params, lang='fr'):
    return js(f'https://{lang}.wikipedia.org/w/api.php', {**params, 'format': 'json', 'formatversion': 2})


def wikitexts(titles, lang='fr'):
    """{titre demandé: {title, q, text, revid}} — 40 pages par requête, redirections suivies."""
    out = {}
    titles = list(dict.fromkeys(titles))
    for i in range(0, len(titles), 50):
        chunk = titles[i:i + 50]
        r = wp({'action': 'query', 'prop': 'revisions|pageprops', 'rvprop': 'content|ids', 'rvslots': 'main', 'ppprop': 'wikibase_item', 'titles': '|'.join(chunk), 'redirects': 1}, lang)
        q = r.get('query', {})
        back = {}
        for n in q.get('normalized', []):
            back[n['to']] = n['from']
        for n in q.get('redirects', []):
            back[n['to']] = back.get(n['from'], n['from'])
        for p in q.get('pages', []):
            if p.get('missing') or 'revisions' in p and not p['revisions']:
                continue
            if 'revisions' not in p:
                continue
            asked = back.get(p['title'], p['title'])
            out[asked] = {'title': p['title'], 'q': p.get('pageprops', {}).get('wikibase_item', ''), 'revid': p['revisions'][0].get('revid'), 'text': p['revisions'][0]['slots']['main']['content']}
        print('  pages', i + len(chunk), '/', len(titles), 'trouvées', len(out), file=sys.stderr)
    return out
