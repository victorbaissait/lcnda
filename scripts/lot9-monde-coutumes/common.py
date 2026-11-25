"""Outils communs des scripts du lot 9 « monde et coutumes » : téléchargement poli (User-Agent, attente, nouvel essai),
cache disque (LCNDA_L9B_CACHE, sinon ./.cache-l9b), écriture des fichiers assets/data/l9b-*.json.gz."""
import gzip, hashlib, json, os, time, urllib.parse, urllib.request

UA = 'LCNDA-genealogie/1.0 (application de bureau ; jeux de donnees ouverts) python-urllib'
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
CACHE = os.environ.get('LCNDA_L9B_CACHE') or os.path.join(os.getcwd(), '.cache-l9b')
os.makedirs(CACHE, exist_ok=True)


def get(url, params=None, data=None, accept='*/*', tries=14, binary=False, refresh=False):
    if params:
        url = url + ('&' if '?' in url else '?') + urllib.parse.urlencode(params)
    key = hashlib.sha1((url + '|' + (data or '')).encode()).hexdigest()
    f = os.path.join(CACHE, key)
    if os.path.exists(f) and not refresh:
        b = open(f, 'rb').read()
        return b if binary else b.decode('utf-8', 'replace')
    wait = 5
    for i in range(tries):
        try:
            req = urllib.request.Request(url, data=data.encode() if data else None, headers={'User-Agent': UA, 'Accept': accept})
            if data:
                req.add_header('Content-Type', 'application/x-www-form-urlencoded')
            with urllib.request.urlopen(req, timeout=180) as r:
                b = r.read()
            if b[:60].lower().startswith(b'you are making too many requests'):
                raise IOError('rate limited')
            open(f, 'wb').write(b)
            time.sleep(0.6)
            return b if binary else b.decode('utf-8', 'replace')
        except Exception as e:  # noqa
            code = getattr(e, 'code', None)
            if code in (400, 404, 414):
                raise
            print('  … nouvel essai', i + 1, url[:120], e)
            time.sleep(wait)
            wait = min(wait * 2, 120)
    raise IOError('échec : ' + url)


def get_json(url, params=None, **kw):
    return json.loads(get(url, params, accept='application/json', **kw))


def sparql(q, endpoint='https://query.wikidata.org/sparql'):
    return get_json(endpoint, {'query': q, 'format': 'json'})['results']['bindings']


def wp_wikitext(title, lang='fr'):
    j = get_json(f'https://{lang}.wikipedia.org/w/api.php', {'action': 'parse', 'page': title, 'prop': 'wikitext|revid', 'format': 'json', 'formatversion': 2, 'redirects': 1})
    return j['parse']['wikitext'], j['parse'].get('revid'), j['parse']['title']


def wp_text(title, lang='fr'):
    """le texte brut de l'article (extraits, sans balises)"""
    j = get_json(f'https://{lang}.wikipedia.org/w/api.php', {'action': 'query', 'prop': 'extracts|revisions', 'rvprop': 'ids', 'explaintext': 1, 'titles': title, 'format': 'json', 'formatversion': 2, 'redirects': 1})
    p = j['query']['pages'][0]
    return p.get('extract', ''), (p.get('revisions') or [{}])[0].get('revid'), p['title']


def wp_url(title, lang='fr', anchor=''):
    return f'https://{lang}.wikipedia.org/wiki/' + urllib.parse.quote(title.replace(' ', '_')) + (('#' + urllib.parse.quote(anchor.replace(' ', '_'))) if anchor else '')


def write_gz(name, obj):
    path = os.path.join(ROOT, 'assets', 'data', name)
    raw = json.dumps(obj, ensure_ascii=False, separators=(',', ':')).encode()
    with gzip.GzipFile(path, 'wb', mtime=0, compresslevel=9) as g:
        g.write(raw)
    print(name, len(raw), '→', os.path.getsize(path), 'octets')
    return path


def find_sentence(text, needle):
    """la phrase entière de l'article qui contient `needle` (pour la citer) ; lève une erreur si absente"""
    i = text.find(needle)
    if i < 0:
        raise ValueError('phrase introuvable : ' + needle)
    a = max(text.rfind('. ', 0, i), text.rfind('\n', 0, i))
    b_candidates = [x for x in (text.find('. ', i + len(needle)), text.find('.\n', i + len(needle))) if x >= 0]
    b = min(b_candidates) if b_candidates else len(text)
    return text[a + 1:b + 1].strip()
