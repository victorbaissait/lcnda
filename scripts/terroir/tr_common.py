"""Outils communs des scripts « terroir » : écrire un fichier de données, les départements, replier un nom, Wikipédia.
Les réponses du réseau sont gardées dans TR_RAW (voir tr_wm.py) : relancer un script ne refait pas les appels."""
import datetime, gzip, json, os, re, sys, unicodedata, urllib.parse
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import tr_wm as wm

APP = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = os.environ.get('TR_OUT', os.path.join(APP, 'assets', 'data'))
TODAY = datetime.date.today().isoformat()
qid = lambda u: u.rsplit('/', 1)[1]

def write(name, obj):
    os.makedirs(OUT, exist_ok=True)
    p = os.path.join(OUT, f'tr-{name}.json.gz')
    raw = json.dumps(obj, ensure_ascii=False, separators=(',', ':'))
    with gzip.open(p, 'wt', encoding='utf-8', compresslevel=9) as f: f.write(raw)
    print(f'tr-{name}.json.gz : {os.path.getsize(p):,} octets (non compressé : {len(raw.encode()):,})', flush=True)

def fold(s):
    s = unicodedata.normalize('NFD', (s or '').lower()); s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    s = s.replace('œ', 'oe').replace('æ', 'ae'); s = re.sub(r'\b(st|ste)\b', 'saint', s)
    return re.sub(r'[^a-z0-9]+', ' ', s).strip()

# les départements (code → nom) : découpage INSEE déjà livré avec l'app
DEP = json.loads(gzip.open(os.path.join(APP, 'assets', 'data', 'communes-decoupage.json.gz')).read())['dep']
DEP_BY_NAME = {fold(n): c for c, n in DEP.items()}
dep_of = lambda insee: insee[:3] if insee.startswith('97') else insee[:2]

def communes():
    """code INSEE → [nom, lat, lon] : assets/data/cc-communes.json.gz (france-geojson, IGN / Etalab, Licence Ouverte 2.0)"""
    j = json.loads(gzip.open(os.path.join(APP, 'assets', 'data', 'cc-communes.json.gz')).read())
    return j['c']

def reg2dep():
    """région (ou ancienne région) Wikidata → codes des départements (P131 des départements, P2586) — au plus 13"""
    out = {}
    for r in wm.sparql('SELECT ?dep ?code ?reg WHERE { ?dep wdt:P2586 ?code . ?dep p:P131/ps:P131 ?reg . }', 'depts'):
        if r['code'] in DEP and qid(r['reg']) != 'Q142': out.setdefault(qid(r['reg']), set()).add(r['code'])
    return {k: v for k, v in out.items() if len(v) <= 13}

def wp(params, host='fr.wikipedia.org', gap=1.2, data=False):
    params = {**params, 'format': 'json', 'formatversion': '2'}
    url = f'https://{host}/w/api.php'
    if data: return json.loads(wm.get(url, data=urllib.parse.urlencode(params), gap=gap))
    return json.loads(wm.get(url + '?' + urllib.parse.urlencode(params), gap=gap))

def wikitexts(titles, host='fr.wikipedia.org', section0=False):
    """le texte (wikicode) de pages, 50 par appel ; suit les redirections. → {titre demandé: (titre réel, texte)}"""
    out = {}
    titles = list(dict.fromkeys(t for t in titles if t))
    for i in range(0, len(titles), 50):
        part = titles[i:i + 50]
        q = {'action': 'query', 'prop': 'revisions', 'rvprop': 'content', 'rvslots': 'main', 'titles': '|'.join(part), 'redirects': '1'}
        if section0: q['rvsection'] = '0'
        j = wp(q, host)
        alias = {}
        for k in ('normalized', 'redirects'):
            for n in j.get('query', {}).get(k, []): alias[n['to']] = alias.get(n['from'], n['from'])
        for pg in j.get('query', {}).get('pages', []):
            t = pg.get('title', ''); txt = (pg.get('revisions') or [{}])[0].get('slots', {}).get('main', {}).get('content', '')
            src = t
            while src in alias: src = alias[src]
            if txt: out[src] = (t, txt)
    return out

def page_items(titles, host='fr.wikipedia.org'):
    """titre de page Wikipédia → élément Wikidata (pageprops), 50 par appel, redirections suivies"""
    out = {}
    titles = list(dict.fromkeys(t for t in titles if t))
    for i in range(0, len(titles), 50):
        part = titles[i:i + 50]
        j = wp({'action': 'query', 'prop': 'pageprops', 'ppprop': 'wikibase_item', 'titles': '|'.join(part), 'redirects': '1'}, host)
        alias = {}
        for k in ('normalized', 'redirects'):
            for n in j.get('query', {}).get(k, []): alias[n['to']] = alias.get(n['from'], n['from'])
        for pg in j.get('query', {}).get('pages', []):
            q = pg.get('pageprops', {}).get('wikibase_item')
            if not q: continue
            t = pg['title']; out[t] = q
            while t in alias: t = alias[t]; out[t] = q
    return out

wpurl = lambda t, host='fr.wikipedia.org': f'https://{host}/wiki/' + urllib.parse.quote(t.replace(' ', '_')) if t else ''

def infobox_param(text, name):
    """la valeur brute d'un paramètre d'infobox ( | nom = valeur ) dans le wikicode"""
    m = re.search(r'\|\s*' + re.escape(name) + r'\s*=\s*(.*?)(?=\n\s*\||\n\}\}|\Z)', text, re.S)
    return m.group(1).strip() if m else ''

def links_of(v):
    """les liens internes [[Cible|texte]] d'une valeur de wikicode → [(cible, texte)]"""
    return [(a.split('#')[0].strip(), (b or a).strip()) for a, b in re.findall(r'\[\[([^\]|]+)(?:\|([^\]]*))?\]\]', v) if not re.match(r'^(Fichier|File|Image|Catégorie|Category):', a, re.I)]

def plain(v):
    """un peu de wikicode → texte simple (liens gardés par leur texte ; modèles et balises enlevés)"""
    v = re.sub(r'<ref[^>]*/>|<ref[^>]*>.*?</ref>', '', v, flags=re.S)
    v = re.sub(r'\{\{(?:FRA|France|drapeau[^}]*)\}\}', '', v, flags=re.I)
    for _ in range(3): v = re.sub(r'\{\{[^{}]*\}\}', '', v)
    v = re.sub(r'\[\[(?:[^\]|]+\|)?([^\]]+)\]\]', r'\1', v)
    v = re.sub(r'<[^>]+>', ' ', v); v = re.sub(r"'''?", '', v)
    return re.sub(r'\s+', ' ', v).strip(' ,;')
