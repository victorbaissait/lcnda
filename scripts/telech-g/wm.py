# LCNDA — lot G « téléchargements » : téléchargements polis pour les scripts de fabrication (Python 3, sans dépendance).
# Une requête à la fois, une pause entre deux appels au même site, Retry-After respecté sur 429, réponses gardées dans le cache.
import hashlib, json, os, time, urllib.parse, urllib.request

CACHE = os.environ.get('TG_RAW') or os.path.join(os.path.expanduser('~'), '.cache', 'lcnda-tg')
UA = 'LCNDA-genealogie-build/1.0 (open-source genealogy app; data build script)'
GAP = {'archive.org': 2.0, 'overpass-api.de': 10.0, 'query.wikidata.org': 2.0, 'fr.wikisource.org': 3.0, 'www.wikidata.org': 1.5, 'fr.wiktionary.org': 3.0, 'fr.wikipedia.org': 3.0, 'en.wikipedia.org': 3.0}
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
            with urllib.request.urlopen(req, timeout=(1000 if 'overpass' in url else 120)) as r:  # Overpass : la réponse peut prendre jusqu'à 15 min
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


# ───────── lot F : Wikipédia (texte brut, action=raw), titres → Wikidata (position, code INSEE), texte sans balises ─────────
import re as _re


def wp_raw(title, host='fr.wikipedia.org'):
    """le wikitexte d'un article (action=raw : une page, pas l'API)"""
    return get(f'https://{host}/w/index.php?' + urllib.parse.urlencode({'title': title, 'action': 'raw'}), 'text/plain').decode('utf-8')


def wp_url(title, host='fr.wikipedia.org'):
    return f'https://{host}/wiki/' + urllib.parse.quote(title.replace(' ', '_'))


def plain(w):
    """wikitexte → texte lisible (liens, gras, références, modèles simples)"""
    s = _re.sub(r'<ref[^>/]*/>', '', w)
    s = _re.sub(r'<ref[^>]*>.*?</ref>', '', s, flags=_re.S)
    s = _re.sub(r'\{\{(?:date|date-)\|([^}|]+)\|([^}|]+)\|([^}|]+)[^}]*\}\}', r'\1 \2 \3', s)
    s = _re.sub(r'\{\{(?:date|date-)\|([^}|]+)[^}]*\}\}', r'\1', s)
    s = _re.sub(r"\{\{'\}\}", "'", s)
    s = _re.sub(r'\{\{(?:s-|s|S-|siècle)\|([^}|]+)(?:\|e)?\}\}', r'\1e siècle', s)
    s = _re.sub(r'\{\{(?:unité|nombre|Nombre|nobr|formatnum:?)\|([^}|]+)\|([^}|]+)(?:\|(\d))?\}\}', lambda m: f'{m.group(1)} {m.group(2)}' + ('³' if m.group(3) == '3' else ''), s)
    s = _re.sub(r'\{\{(?:unité|nombre|Nombre|nobr)\|([^}|]+)\}\}', r'\1', s)
    s = _re.sub(r'\{\{(\d+)(e|er|re)\|([^}|]+)\}\}', r'\1\2 \3', s)
    s = _re.sub(r'\{\{(\d+)(e|er|re)\}\}', r'\1\2', s)
    s = _re.sub(r'\{\{([IVXL]+)e siècle\}\}', r'\1e siècle', s)
    s = _re.sub(r'\{\{(?:citation|Citation)\|([^}]+)\}\}', r'« \1 »', s)
    s = _re.sub(r'\{\{[^{}]*\}\}', '', s)
    s = _re.sub(r'\[\[(?:Fichier|File|Image):[^\]]*\]\]', '', s)
    s = _re.sub(r'\[\[[^\]|]*\|([^\]]*)\]\]', r'\1', s)
    s = _re.sub(r'\[\[([^\]]*)\]\]', r'\1', s)
    s = _re.sub(r'\[https?://\S+ ([^\]]*)\]', r'\1', s)
    s = s.replace("'''", '').replace("''", '')
    s = _re.sub(r'<[^>]+>', ' ', s)
    return _re.sub(r'[ \t]+', ' ', s).strip()


def links(w):
    """les titres des liens internes d'un bout de wikitexte, dans l'ordre"""
    return [m.split('|')[0].split('#')[0].strip() for m in _re.findall(r'\[\[([^\]]+)\]\]', w) if not _re.match(r'(?i)(fichier|file|image|catégorie):', m)]


def wd_of_titles(titles, host='fr.wikipedia.org'):
    """titres d'articles → {titre: {q, lat, lon, insee, label}} (Wikidata, CC0 ; redirections suivies par l'API de Wikipédia non : titres tels quels)"""
    out, titles = {}, [t for t in dict.fromkeys(titles) if t]
    for i in range(0, len(titles), 60):
        part = titles[i:i + 60]
        vals = ' '.join('"' + t.replace('\\', '\\\\').replace('"', '\\"') + '"@fr' for t in part)
        q = ('SELECT ?t ?x ?c ?ins WHERE { VALUES ?t { ' + vals + ' } ?a schema:name ?t ; schema:isPartOf <https://' + host + '/> ; schema:about ?x .'
             ' OPTIONAL { ?x wdt:P625 ?c } OPTIONAL { ?x wdt:P374 ?ins } }')
        for b in sparql(q):
            t = b['t']['value']
            m = _re.match(r'Point\(([-\d.eE]+) ([-\d.eE]+)\)', b.get('c', {}).get('value', ''))
            cur = out.setdefault(t, {'q': b['x']['value'].rsplit('/', 1)[-1], 'lat': None, 'lon': None, 'insee': ''})
            if m and cur['lat'] is None:
                cur['lat'], cur['lon'] = round(float(m.group(2)), 5), round(float(m.group(1)), 5)
            if b.get('ins') and not cur['insee']:
                cur['insee'] = b['ins']['value']
    return out


def communes(root):
    """les communes de France livrées avec l'app (assets/data/cc-communes.json.gz : Licence Ouverte) → {insee: (nom, lat, lon)}"""
    import gzip
    d = json.load(gzip.open(os.path.join(root, 'assets', 'data', 'cc-communes.json.gz')))
    c = d['c']
    return {k: (v[0], v[1], v[2]) for k, v in (c.items() if isinstance(c, dict) else c)}


def today():
    return time.strftime('%Y-%m-%d')
