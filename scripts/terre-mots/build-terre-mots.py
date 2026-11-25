#!/usr/bin/env python3
"""🪨🏚️🍎☀️🗣️🏷️💬📏🐺🔍🎉🌟 Terre et mots du village : fabrique les données livrées avec l'app (assets/data/tm-*.json.gz).

Sources (toutes téléchargées par ces scripts, réponses gardées dans TM_RAW : relancer ne refait pas les appels) :
  - Wikidata (CC0 1.0), query.wikidata.org : fetch_wd.py — gentilés (P1549), noms en langue régionale (P1705 et libellés oc, br, eu,
    co, ca, de, nl…), cadrans solaires (Q80793 : P1451 devise, P1684 inscription, P18 image), villages abandonnés, disparus ou
    engloutis (P1552 / P31), anciennes communes réunies (P1366 remplacée par, P576 fin), variétés fruitières (P1071 lieu d'origine,
    P138 nommée d'après), légendes et créatures, affaires criminelles, fêtes et traditions (lieu P276/P131…, dates) ;
  - Wiktionnaire (CC BY-SA 4.0) : fetch_wiktio.py — mots des catégories « français de … » et leur définition ;
  - NASA/JPL Small-Body Database (données publiques) : fetch_jpl.py — astéroïdes nommés et citations de nommage ;
  - Wikipédia (CC BY-SA 4.0) : mesures.json (tableau tapé à la main, phrase exacte et page de chaque ligne) et fetch_roches.py ;
  - le sol et l'altitude : build_sol.py (EGDI / BRGM 1/1 000 000, CC BY 4.0 ; IGN, Licence Ouverte 2.0) → tm-sol.json.gz ;
  - les communes (nom, centre) : assets/data/cc-communes.json.gz (IGN / Etalab, Licence Ouverte 2.0), déjà livré avec l'app.
Lancer : TM_RAW=dossier python3 build-terre-mots.py [dossier de sortie]   (build_sol.py à part, il lui faut numpy, tifffile, pyproj)
"""
import datetime, gzip, json, math, os, re, sys, unicodedata, urllib.parse
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import wm, fetch_wd as W

ROOT = os.path.join(HERE, '..', '..')
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'assets', 'data')
TODAY = datetime.date.today().isoformat()
qid = W.qid

def write(name, obj):
    p = os.path.join(OUT, f'tm-{name}.json.gz')
    obj = {'v': 1, 'built': TODAY, **obj}
    with gzip.open(p, 'wt', encoding='utf-8', compresslevel=9) as f: json.dump(obj, f, ensure_ascii=False, separators=(',', ':'))
    print(f'tm-{name}: {os.path.getsize(p):,} octets', flush=True)

def fold(s):
    s = unicodedata.normalize('NFD', (s or '').lower()); s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    s = s.replace('œ', 'oe').replace('æ', 'ae'); s = re.sub(r'\b(st|ste)\b', 'saint', s)
    return re.sub(r'[^a-z0-9]+', ' ', s).strip()

def point(s):
    m = re.match(r'Point\(([-\d.eE]+) ([-\d.eE]+)\)', s or '')
    return (round(float(m.group(2)), 4), round(float(m.group(1)), 4)) if m else (None, None)

def year(s):
    m = re.match(r'^(-?\d{1,4})-', s or '')
    return int(m.group(1)) if m else None

def km(a1, o1, a2, o2):
    r = math.pi / 180
    s = math.sin((a2 - a1) * r / 2) ** 2 + math.cos(a1 * r) * math.cos(a2 * r) * math.sin((o2 - o1) * r / 2) ** 2
    return 12742 * math.asin(min(1, math.sqrt(s)))

C = json.loads(gzip.open(os.path.join(ROOT, 'assets', 'data', 'cc-communes.json.gz')).read())['c']
DEC = json.loads(gzip.open(os.path.join(ROOT, 'assets', 'data', 'communes-decoupage.json.gz')).read())
DEP, SUCC = DEC['dep'], DEC['succ']
dep_of = lambda i: (i[:3] if i.startswith('97') else i[:2]) if i else ''
GRID = {}
for i, (n, la, lo) in C.items():
    if la is not None: GRID.setdefault((int(la * 10), int(lo * 10)), []).append(i)

def nearest(la, lo, maxkm=8.0):
    if la is None or not (41 <= la <= 51.6 and -5.6 <= lo <= 9.8): return ''
    best, bk = '', maxkm
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            for i in GRID.get((int(la * 10) + dy, int(lo * 10) + dx), []):
                k = km(la, lo, C[i][1], C[i][2])
                if k < bk: best, bk = i, k
    return best

def current(insee):
    """un code INSEE d'aujourd'hui (une ancienne commune → celle qui l'a reprise)"""
    seen = 0
    while insee and insee not in C and insee in SUCC and seen < 5: insee = SUCC[insee]; seen += 1
    return insee if insee in C else ''

# ═══════════ les communes sur Wikidata ═══════════
COM = W.rows('communes')
Q2I = {}
for r in COM: Q2I.setdefault(qid(r['c']), r['insee'])
I2Q = {}
for q, i in Q2I.items():
    if i in C and (i not in I2Q or int(q[1:]) < int(I2Q[i][1:])): I2Q[i] = q

PLACE = {}
def resolve(ids):
    """où sont ces lieux : {qid: {'insee', 'dep', 'lat', 'lon', 'fr'}}"""
    todo = [i for i in set(ids) if i and i not in PLACE]
    for r in W.places(todo):
        q = qid(r['x']); o = PLACE.setdefault(q, {'insee': '', 'dep': '', 'lat': None, 'lon': None, 'fr': False})
        ins = current(r.get('insee', '')) or current(r.get('pinsee', ''))
        if ins and not o['insee']: o['insee'] = ins
        d = r.get('dep') or r.get('pdep') or ''
        if d and not o['dep'] and d.upper() in DEP: o['dep'] = d.upper()
        la, lo = point(r.get('coord'))
        if la is not None and o['lat'] is None: o['lat'], o['lon'] = la, lo
        if qid(r.get('cty', '')) == 'Q142': o['fr'] = True
    for q in todo:
        o = PLACE.setdefault(q, {'insee': '', 'dep': '', 'lat': None, 'lon': None, 'fr': False})
        if o['insee']: o['dep'] = dep_of(o['insee']); o['fr'] = True
        if o['dep']: o['fr'] = True
    return PLACE

LAB = {}
def labels(ids):
    todo = [i for i in set(ids) if i and i not in LAB]
    LAB.update(W.labels(todo))
    return LAB
lab = lambda q: (LAB.get(q) or {}).get('fr') or (LAB.get(q) or {}).get('en') or ''
wp = lambda q: (LAB.get(q) or {}).get('wp', '')

def det(ids):
    out = {}
    for r in W.details(ids):
        q = qid(r['x']); o = out.setdefault(q, {})
        for k in ('coord', 's', 'e', 'd', 'img', 'freq', 'day', 'insee'):
            if r.get(k) and k not in o: o[k] = r[k]
    return out

def thing_rows(key, classes, fr_only=True, need_place=True):
    """éléments d'une famille (légendes, affaires, fêtes) : sorte, lieu (commune, département ou point), dates, image"""
    items = {}
    for r in W.rows(key):
        q = qid(r['x']); o = items.setdefault(q, {'t': set(), 'loc': {}})
        o['t'].add(qid(r['t']))
        if r.get('loc'): o['loc'].setdefault(r['p'].rsplit('/', 1)[1], set()).add(qid(r['loc']))
    resolve([l for o in items.values() for ls in o['loc'].values() for l in ls])
    D = det(list(items))
    out = []
    for q, o in items.items():
        d = D.get(q, {}); la, lo = point(d.get('coord'))
        insee = current(d.get('insee', '')); dep = ''; fr = False; zla = zlo = None; where = ''
        # le lieu le plus précis : lieu (P276), commune (P131), région (P706), pays (P17, P495)
        for p in ('P276', 'P131', 'P1071', 'P706', 'P840', 'P1074', 'P17', 'P495'):
            for l in sorted(o['loc'].get(p, [])):
                P = PLACE.get(l) or {}
                if l == 'Q142': fr = True; continue
                if P.get('fr'): fr = True
                if not insee and P.get('insee'): insee = P['insee']; where = where or l
                if not dep and P.get('dep'): dep = P['dep']; where = where or l
                if zla is None and P.get('lat') is not None and (P.get('fr') or (41 <= P['lat'] <= 51.6 and -5.6 <= P['lon'] <= 9.8)): zla, zlo = P['lat'], P['lon']; where = where or l
        if not insee and la is not None and (fr or not o['loc']):
            insee = nearest(la, lo, 5)
        if insee: dep = dep_of(insee); fr = True
        if dep: fr = True
        if la is None and zla is not None: la, lo = zla, zlo
        if la is None and insee: la, lo = C[insee][1], C[insee][2]
        if fr_only and not fr: continue
        if need_place and not insee and not dep and la is None: continue
        t = sorted(o['t'] & set(classes))
        out.append({'q': q, 'k': classes[t[0]] if t else '', 'insee': insee, 'dep': dep, 'lat': la, 'lon': lo, 'where': where,
                    's': year(d.get('s', '')) or year(d.get('d', '')), 'e': year(d.get('e', '')), 'img': (d.get('img') or '').rsplit('/', 1)[-1],
                    'freq': d.get('freq', ''), 'day': qid(d.get('day', ''))})
    labels([r['q'] for r in out] + [r['where'] for r in out if r['where']] + [r['day'] for r in out if r['day']])
    for r in out:
        r['n'] = lab(r['q']); r['d'] = (LAB.get(r['q']) or {}).get('desc', ''); r['wp'] = wp(r['q'])
        r['where'] = lab(r['where']) if r['where'] else ''
        r['img'] = urllib.parse.unquote(r['img']).replace('_', ' ')
        if r['day']: r['day'] = lab(r['day'])
    return [r for r in out if r['n'] and not re.match(r'^Q\d+$', r['n'])]

def compact(rows, keys):
    return [[r.get(k) if r.get(k) not in ('', None) else None for k in keys] for r in rows]

# ═══════════ 🐺 légendes, 🔍 affaires, 🎉 fêtes ═══════════
def build_things():
    keys = ['q', 'n', 'k', 'd', 'insee', 'dep', 'lat', 'lon', 'where', 's', 'e', 'img', 'wp', 'freq', 'day']
    leg = thing_rows('legendes', W.LEGENDES)
    write('legendes', {'attr': 'Wikidata — légendes, créatures et personnages légendaires situés en France (lieu, dates)', 'licence': 'CC0 1.0', 'url': 'https://www.wikidata.org/', 'keys': keys, 'rows': compact(leg, keys)})
    cr = [r for r in thing_rows('crimes', W.CRIMES) if r['s'] or r['e']]
    write('affaires', {'attr': 'Wikidata — affaires criminelles et judiciaires en France (lieu et date)', 'licence': 'CC0 1.0', 'url': 'https://www.wikidata.org/', 'keys': keys, 'rows': compact(cr, keys)})
    fe = thing_rows('fetes', W.FETES)
    # les festivals de musique, de cinéma… n'en sont pas : seulement les « festival » sans plus de précision, avec un mot de fête dans le nom
    fe = [r for r in fe if r['k'] != 'festival' or re.search(r'f[eê]te|carnaval|pardon|ducasse|kermesse|foire|feria|f[ée]ria|p[eè]lerinage|procession|bravade|tradition|folklor|saint|fest', fold(r['n']) + ' ' + fold(r['d']))]
    write('fetes', {'attr': 'Wikidata — fêtes, carnavals, pardons, pèlerinages et traditions en France (lieu, retour chaque année)', 'licence': 'CC0 1.0', 'url': 'https://www.wikidata.org/', 'keys': keys, 'rows': compact(fe, keys)})
    return len(leg), len(cr), len(fe)

# ═══════════ ☀️ cadrans solaires ═══════════
def build_sundials():
    items = {}
    for r in W.rows('sundials'):
        q = qid(r['x']); o = items.setdefault(q, {'loc': set(), 'motto': set(), 'ins': set()})
        for k in ('coord', 'img', 'inc', 'mh', 'cty'):
            if r.get(k) and k not in o: o[k] = r[k]
        if r.get('loc'): o['loc'].add(qid(r['loc']))
        if r.get('motto'): o['motto'].add(r['motto'])
        if r.get('ins'): o['ins'].add(r['ins'])
    resolve([l for o in items.values() for l in o['loc']])
    rows = []
    for q, o in items.items():
        la, lo = point(o.get('coord')); insee = ''
        for l in sorted(o['loc']):
            P = PLACE.get(l) or {}
            if P.get('insee'): insee = P['insee']; break
        if not insee and (qid(o.get('cty', '')) == 'Q142' or la is not None): insee = nearest(la, lo, 3)
        if not insee: continue
        if la is None: la, lo = C[insee][1], C[insee][2]
        rows.append({'q': q, 'insee': insee, 'lat': la, 'lon': lo, 'img': urllib.parse.unquote((o.get('img') or '').rsplit('/', 1)[-1]).replace('_', ' '),
                     'motto': ' / '.join(sorted(o['motto'])), 'ins': ' / '.join(sorted(o['ins'] - o['motto'])), 's': year(o.get('inc', '')), 'mh': o.get('mh', '')})
    labels([r['q'] for r in rows])
    for r in rows: r['n'] = lab(r['q']); r['d'] = (LAB.get(r['q']) or {}).get('desc', ''); r['wp'] = wp(r['q'])
    keys = ['q', 'n', 'd', 'insee', 'lat', 'lon', 's', 'motto', 'ins', 'img', 'mh', 'wp']
    write('cadrans', {'attr': 'Wikidata — cadrans solaires (Q80793) en France : devise (P1451), inscription (P1684), date, image (Wikimedia Commons)', 'licence': 'CC0 1.0 (images : licence propre à chaque fichier)', 'url': 'https://www.wikidata.org/', 'keys': keys, 'rows': compact(rows, keys)})
    return len(rows)

# ═══════════ 🏚️ villages disparus et anciennes communes ═══════════
def build_disparus():
    kinds = {}
    for k in ('disp_q', 'disp_t'):
        for r in W.rows(k): kinds.setdefault(qid(r['x']), set()).add(qid(r['k']))
    # seulement ce qui est en France : le pays, la commune, ou le point
    resolve(list(kinds))
    D = det(list(kinds))
    rows = []
    for q, ks in kinds.items():
        P = PLACE.get(q) or {}; d = D.get(q, {})
        la, lo = point(d.get('coord')) if d.get('coord') else (P.get('lat'), P.get('lon'))
        insee = current(d.get('insee', '')) or P.get('insee', '')
        own = d.get('insee', '')
        if not insee and la is not None and P.get('fr'): insee = nearest(la, lo, 8)
        if not (P.get('fr') or insee): continue
        if not insee and la is None: continue
        if la is None: la, lo = C[insee][1], C[insee][2]
        k = 'englouti' if 'Q111051152' in ks else 'abandonne' if 'Q350895' in ks or 'Q1964983' in ks or 'Q74047' in ks else 'disparu'
        rows.append({'q': q, 'k': k, 'insee': insee, 'own': own, 'lat': la, 'lon': lo, 'e': year(d.get('e', '')), 'rep': ''})
    # les anciennes communes réunies à une autre (P1366)
    fus = {}
    for r in W.rows('fusions'):
        q = qid(r['x']); o = fus.setdefault(q, {'rep': set()})
        o['rep'].add(qid(r['rep']))
        for k in ('end', 'coord', 'insee'):
            if r.get(k) and k not in o: o[k] = r[k]
    seen = {r['q'] for r in rows}
    for q, o in fus.items():
        if q in seen: continue
        reps = [Q2I.get(x, '') for x in sorted(o['rep'])]; reps = [current(x) for x in reps if current(x)]
        if not reps: continue
        own = o.get('insee', '')
        if own and own in C and own == reps[0]: continue
        la, lo = point(o.get('coord'))
        if la is None: la, lo = C[reps[0]][1], C[reps[0]][2]
        rows.append({'q': q, 'k': 'reunie', 'insee': reps[0], 'own': own, 'lat': la, 'lon': lo, 'e': year(o.get('end', '')), 'rep': reps[0]})
    labels([r['q'] for r in rows])
    for r in rows: r['n'] = lab(r['q']); r['d'] = (LAB.get(r['q']) or {}).get('desc', ''); r['wp'] = wp(r['q'])
    rows = [r for r in rows if r['n'] and not re.match(r'^Q\d+$', r['n'])]
    keys = ['q', 'n', 'k', 'd', 'insee', 'own', 'lat', 'lon', 'e', 'wp']
    write('disparus', {'attr': 'Wikidata — villages abandonnés, détruits, disparus ou engloutis (P1552, P31) et anciennes communes réunies à une autre (P1366, P576)', 'licence': 'CC0 1.0', 'url': 'https://www.wikidata.org/', 'keys': keys, 'rows': compact(rows, keys)})
    return len(rows)

# ═══════════ 🍎 fruits anciens et 🌟 cultivars nommés d'après ═══════════
def build_fruits():
    items = {}
    for r in W.rows('cultivars'):
        q = qid(r['x']); o = items.setdefault(q, {'t': set(), 'o': set(), 'loc': set(), 'n': set()})
        o['t'].add(qid(r['t']))
        for k, p in (('o', 'o'), ('loc', 'loc'), ('n', 'n')):
            if r.get(p): o[k].add(qid(r[p]))
        for k in ('s', 'img'):
            if r.get(k) and k not in o: o[k] = r[k]
    resolve([l for o in items.values() for l in (o['loc'] | o['n'])])
    rows = []
    for q, o in items.items():
        insee = dep = ''; via = ''
        for l in sorted(o['loc']) + sorted(o['n']):
            P = PLACE.get(l) or {}
            if P.get('insee') or P.get('dep'):
                insee, dep, via = P.get('insee', ''), P.get('dep') or dep_of(P.get('insee', '')), ('origine' if l in o['loc'] else 'nom'); place = l; break
        else: place = ''
        if not insee and not dep: continue
        t = sorted(o['t'] & set(W.FRUITS))
        rows.append({'q': q, 'k': W.FRUITS[t[0]] if t else '', 'insee': insee, 'dep': dep, 'via': via, 'where': place, 's': year(o.get('s', '')),
                     'img': urllib.parse.unquote((o.get('img') or '').rsplit('/', 1)[-1]).replace('_', ' ')})
    labels([r['q'] for r in rows] + [r['where'] for r in rows])
    for r in rows: r['n'] = lab(r['q']); r['d'] = (LAB.get(r['q']) or {}).get('desc', ''); r['wp'] = wp(r['q']); r['where'] = lab(r['where'])
    rows = [r for r in rows if r['n'] and not re.match(r'^Q\d+$', r['n'])]
    keys = ['q', 'n', 'k', 'd', 'insee', 'dep', 'via', 'where', 's', 'img', 'wp']
    write('fruits', {'attr': 'Wikidata — variétés fruitières et potagères (pommes, poires, prunes, cerises, cépages…) dont le lieu d’origine (P1071) ou le lieu qui leur donne leur nom (P138) est en France', 'licence': 'CC0 1.0', 'url': 'https://www.wikidata.org/', 'keys': keys, 'rows': compact(rows, keys)})
    return len(rows)

def build_ciel():
    import fetch_jpl as J
    names = J.named()
    # les noms de lieux de France : communes, départements, provinces
    by = {}
    for i, (n, la, lo) in C.items(): by.setdefault(fold(n), []).append(('c', i))
    for d, n in DEP.items(): by.setdefault(fold(n), []).append(('d', d))
    places = []
    for num, name in names:
        hits = by.get(fold(name))
        if not hits: continue
        c = J.citation(num)
        txt = c['citation']
        if not txt or not J.FRENCH.search(txt) or not J.PLACE.search(txt): continue
        # la commune : si plusieurs portent ce nom, celle que la citation nomme (département), sinon la plus grande… on garde toutes celles que la citation permet
        cand = hits
        if len(cand) > 1:
            dn = [h for h in cand if h[0] == 'd']
            if dn: cand = dn
            else:
                f = fold(txt)
                ok = [h for h in cand if fold(DEP.get(dep_of(h[1]), '')) and fold(DEP.get(dep_of(h[1]), '')) in f]
                cand = ok
        if not cand: continue
        for kind, code in cand[:3]:
            places.append({'num': num, 'name': name, 'kind': kind, 'code': code, 'cit': txt, 'who': c['who'], 'date': c['date'], 'site': c['site']})
    # les cultivars (roses, dahlias…) nommés d'après un lieu ou une personne
    named = {}
    for r in W.rows('named'):
        q = qid(r['x']); o = named.setdefault(q, {'t': set(), 'n': set()})
        o['t'].add(qid(r['t'])); o['n'].add(qid(r['n']))
        if r.get('s') and 's' not in o: o['s'] = r['s']
    resolve([n for o in named.values() for n in o['n']])
    labels(list(named) + [n for o in named.values() for n in o['n']])
    cv = []
    for q, o in named.items():
        for n in sorted(o['n']):
            P = PLACE.get(n) or {}
            cv.append({'q': q, 'n': lab(q), 'k': W.CULTIVARS.get(sorted(o['t'])[0], ''), 'after': lab(n), 'aq': n, 'insee': P.get('insee', ''), 's': year(o.get('s', '')), 'wp': wp(q)})
    cv = [r for r in cv if r['n'] and r['after'] and not re.match(r'^Q\d+$', r['n'])]
    keys = ['q', 'n', 'k', 'after', 'aq', 'insee', 's', 'wp']
    write('ciel', {'attr': 'NASA/JPL Small-Body Database (astéroïdes nommés, citations du Minor Planet Center) ; Wikidata (cultivars nommés d’après, P138)',
                   'licence': 'données publiques de la NASA ; CC0 1.0 (Wikidata)', 'url': 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html',
                   'names': [[n, a] for n, a in names], 'places': places, 'cvkeys': keys, 'cultivars': compact(cv, keys)})
    return len(names), len(places), len(cv)

# ═══════════ 🗣️ noms en langue régionale et 🏷️ gentilés ═══════════
LANG_DEPS = {  # là où chaque langue est parlée (départements), pour ne garder que les vrais noms régionaux
    'oc': '04 05 06 07 09 11 12 13 15 19 23 24 26 30 31 32 33 34 40 43 46 47 48 64 65 66 81 82 83 84 87 16 63 03'.split(),
    'br': '22 29 35 44 56'.split(), 'eu': ['64'], 'co': ['2A', '2B'], 'ca': ['66'], 'de': ['57', '67', '68'], 'gsw': ['67', '68'], 'nl': ['59'], 'vls': ['59'],
    'frp': '01 38 42 69 73 74 71 39 25'.split(), 'pcd': '02 59 60 62 80'.split(), 'wa': ['08'],
}
LANG_NAMES = {'oc': 'occitan', 'br': 'breton', 'eu': 'basque', 'co': 'corse', 'ca': 'catalan', 'de': 'alsacien ou allemand', 'gsw': 'alsacien', 'nl': 'flamand (néerlandais)',
              'vls': 'flamand occidental', 'frp': 'francoprovençal (arpitan)', 'pcd': 'picard', 'wa': 'wallon'}
def reg_names():
    """{insee: [[langue, nom, 'wd'], …]} : libellés Wikidata dans la langue du pays, différents du nom français, et P1705 (nom dans la langue d'origine)"""
    import glob
    out = {}
    fr = {}
    raw = []
    for f in glob.glob(os.path.join(wm.RAW, 'sparql-tm-reglab-*')):
        j = json.load(open(f, encoding='utf-8'))
        for b in j['results']['bindings']: raw.append((qid(b['x']['value']), b['l'].get('xml:lang', ''), b['l']['value']))
    for q, l, v in raw:
        if l == 'fr': fr[q] = v
    for q, l, v in raw:
        if l == 'fr' or l not in LANG_DEPS: continue
        i = Q2I.get(q, '')
        if i not in C or dep_of(i) not in LANG_DEPS[l]: continue
        if fold(v) == fold(fr.get(q, C[i][0])): continue
        out.setdefault(i, {})[l] = v
    W.rows('native')  # la langue du P1705 n'est pas gardée par wm.sparql : relue dans la réponse brute
    j = json.load(open(os.path.join(wm.RAW, 'sparql-tm-native'), encoding='utf-8'))
    for b in j['results']['bindings']:
        i = Q2I.get(qid(b['c']['value']), ''); l = b['n'].get('xml:lang', ''); v = b['n']['value']
        if i in C and l in LANG_DEPS and dep_of(i) in LANG_DEPS[l] and fold(v) != fold(C[i][0]): out.setdefault(i, {}).setdefault(l, v)
    return out

def build_communes():
    names = reg_names()
    dem = {}
    j = json.load(open(os.path.join(wm.RAW, 'sparql-tm-demonym'), encoding='utf-8'))
    G = {'Q499327': 'm', 'Q1775415': 'f'}
    for b in j['results']['bindings']:
        i = current(Q2I.get(qid(b['c']['value']), ''))
        if not i: continue
        g = G.get(qid(b.get('g', {}).get('value', '')), '')
        dem.setdefault(i, [])
        v = [b['d']['value'], g]
        if v not in dem[i]: dem[i].append(v)
    out = {}
    for i in C:
        o = {}
        if i in names: o['n'] = names[i]
        if i in dem: o['g'] = dem[i]
        if i in I2Q: o['q'] = I2Q[i]
        if 'n' in o or 'g' in o: out[i] = o
    write('noms', {'attr': 'Wikidata — gentilés (P1549) et noms des communes dans les langues régionales (libellés oc, br, eu, co, ca, de, nl… et P1705)', 'licence': 'CC0 1.0',
                   'url': 'https://www.wikidata.org/', 'langs': LANG_NAMES, 'c': out})
    return sum(1 for v in out.values() if 'n' in v), sum(1 for v in out.values() if 'g' in v)

# ═══════════ 💬 mots du coin et 📏 mesures ═══════════
def build_mots():
    import fetch_wiktio as K
    r = K.fetch()
    cats = []
    for cat, v in r.items():
        if v['words']: cats.append({'cat': cat, 'where': v['where'], 'words': [[w['w'], w['pos'], w['def']] for w in v['words']]})
    write('mots', {'attr': 'Wiktionnaire, le dictionnaire libre — catégories « français de … » (régionalismes) ; définitions des contributeurs du Wiktionnaire', 'licence': 'CC BY-SA 4.0',
                   'licence_url': 'https://creativecommons.org/licenses/by-sa/4.0/deed.fr', 'url': 'https://fr.wiktionary.org/', 'cats': cats})
    return len(cats), sum(len(c['words']) for c in cats)

def build_mesures():
    M = json.load(open(os.path.join(HERE, 'mesures.json'), encoding='utf-8'))
    write('mesures', M)
    return len(M['rows'])

def build_roches():
    R = json.load(open(os.path.join(HERE, 'roches.json'), encoding='utf-8'))
    write('roches', R)
    return len(R['rows'])

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    only = os.environ.get('TM_ONLY', '').split(',') if os.environ.get('TM_ONLY') else None
    steps = [('communes', build_communes), ('cadrans', build_sundials), ('disparus', build_disparus), ('fruits', build_fruits), ('things', build_things),
             ('ciel', build_ciel), ('mots', build_mots), ('mesures', build_mesures), ('roches', build_roches)]
    for k, f in steps:
        if only and k not in only: continue
        print(k, f(), flush=True)
