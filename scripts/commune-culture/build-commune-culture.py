#!/usr/bin/env python3
"""🎬📜🛡️🍲 Le village dans la culture : fabrique les données livrées avec l'app (assets/data/cc-*.json.gz).

Sources (toutes téléchargées par ce script, réponses gardées dans raw/ : relancer ne refait pas les appels) :
  - Wikidata (CC0 1.0) — query.wikidata.org (SPARQL, une requête par minute : fetch_sparql.py) et www.wikidata.org/w/api.php :
      communes (P374 code INSEE, P625 position, libellé), œuvres (P915 lieu de tournage, P840 lieu de l'action, P921 sujet),
      armoiries (P94), plats (P1071 lieu de création, P361/P2012 cuisine régionale), départements (P2586) ;
  - Wikimedia Commons (API, extmetadata) : auteur et licence de chaque image d'armoiries (fetch_commons.py) ;
  - Wikipédia en français (CC BY-SA 4.0) : pages « Armorial des communes de … », modèle {{Blason commune}} (fetch_wiki.py).
Lancer :  python3 fetch_sparql.py && python3 fetch_wiki.py && python3 fetch_commons.py && python3 build-commune-culture.py
          (CC_RAW=dossier des réponses gardées ; sortie : assets/data/ de l'app, ou le dossier donné en argument)
Rietstap : build_rietstap.py (à part : scans PDF de Commons + pdftotext).
"""
import datetime, gzip, json, os, re, sys, urllib.parse
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import wm, fetch_sparql, fetch_wiki, fetch_commons

OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', '..', 'assets', 'data')
TODAY = datetime.date.today().isoformat()
qid = lambda u: u.rsplit('/', 1)[1]
rows = lambda k: wm.sparql(fetch_sparql.Q[k], k)

def write(name, obj):
    p = os.path.join(OUT, f'cc-{name}.json.gz')
    with gzip.open(p, 'wt', encoding='utf-8', compresslevel=9) as f: json.dump(obj, f, ensure_ascii=False, separators=(',', ':'))
    print(f'{name}: {os.path.getsize(p):,} octets', flush=True)

def point(s):
    m = re.match(r'Point\(([-\d.eE]+) ([-\d.eE]+)\)', s or '')
    return (round(float(m.group(2)), 4), round(float(m.group(1)), 4)) if m else (None, None)

def labels(ids, langs='fr|en'):
    """libellés (et article Wikipédia en français) de beaucoup d'éléments : wbgetentities props=labels|sitelinks, 50 par appel"""
    out = {}
    ids = sorted(set(ids), key=lambda x: int(x[1:]))
    for i in range(0, len(ids), 50):
        j = wm.wd({'action': 'wbgetentities', 'ids': '|'.join(ids[i:i + 50]), 'props': 'labels|descriptions|sitelinks', 'languages': langs, 'sitefilter': 'frwiki'})
        for q, e in j.get('entities', {}).items():
            L = e.get('labels', {}); D = e.get('descriptions', {})
            out[q] = {'fr': (L.get('fr') or {}).get('value', ''), 'en': (L.get('en') or {}).get('value', ''), 'desc': (D.get('fr') or {}).get('value', ''),
                      'wp': (e.get('sitelinks', {}).get('frwiki') or {}).get('title', '')}
    return out

wpurl = lambda t: 'https://fr.wikipedia.org/wiki/' + urllib.parse.quote(t.replace(' ', '_')) if t else ''

# ═══════════════ les départements (noms : découpage INSEE déjà livré avec l'app) ═══════════════
DEP = json.loads(gzip.open(os.path.join(HERE, '..', '..', 'assets', 'data', 'communes-decoupage.json.gz')).read())['dep']
def fold(s):
    import unicodedata
    s = unicodedata.normalize('NFD', (s or '').lower()); s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    s = s.replace('œ', 'oe').replace('æ', 'ae'); s = re.sub(r'\b(st|ste)\b', 'saint', s)
    return re.sub(r'[^a-z0-9]+', ' ', s).strip()
DEP_BY_NAME = {fold(n): c for c, n in DEP.items()}
dep_of = lambda insee: insee[:3] if insee.startswith('97') else insee[:2]

# ═══════════════ 1. les communes ═══════════════
def build_communes():
    lab = {}
    for i in range(5):
        for r in rows(f'labels_{i}'): lab[qid(r['c'])] = r['l']
    by = {}
    for r in rows('communes'):
        q = qid(r['c']); ins = r['insee']
        if not re.match(r'^\d[\dAB]\d{3}$', ins): continue
        lat, lon = point(r.get('coord'))
        by.setdefault(ins, []).append((q, lab.get(q, ''), lat, lon))
    C, Q2I = {}, {}
    for ins, items in by.items():
        for q, *_ in items: Q2I[q] = ins
        items.sort(key=lambda x: (x[1] == '', x[2] is None, int(x[0][1:])))
        q, name, lat, lon = items[0]
        if not name: continue
        C[ins] = [name, lat, lon]
    write('communes', {'v': 1, 'attr': 'Wikidata (communes : code INSEE P374, position P625, libellé)', 'licence': 'CC0 1.0', 'url': 'https://www.wikidata.org/', 'built': TODAY, 'c': C})
    return C, Q2I

# ═══════════════ 2. les œuvres ═══════════════
KIND_RE = [('tv', r'série|feuilleton|téléfilm|épisode|émission|saison'), ('film', r'film|documentaire|court métrage|long métrage|cinéma'),
           ('jeu', r'jeu vidéo|jeu de société'), ('musique', r'chanson|single|œuvre musicale|composition musicale|album|opéra|chant|hymne|symphonie|morceau|cantique|mélodie|ballet|opérette'),
           ('livre', r'roman|livre|nouvelle|œuvre littéraire|œuvre écrite|bande dessinée|poème|pièce de théâtre|conte|recueil|récit|manga|monographie|ouvrage|essai|guide|légende|édition|fable|journal'),
           ('art', r'tableau|peinture|gravure|dessin|sculpture|estampe|affiche|lithographie|aquarelle|vitrail|tapisserie|fresque|photographie|carte postale|œuvre d.art')]
SKIP_RE = r'article|thèse|publication scientifique|carte\b|plan\b|catégorie|wikimedia|chapitre|revue|périodique|base de données|jeu de données|rapport|notice|inventaire|page web|site web|bulletin'

def kind_of(type_labels):
    t = ' | '.join(type_labels).lower()
    if re.search(SKIP_RE, t) and not re.search(r'roman|film|chanson|tableau', t): return None
    for k, rx in KIND_RE:
        if re.search(rx, t): return k
    return 'autre'

def build_oeuvres(C, Q2I):
    links = []
    for k, rel in (('films_c', 'tourne'), ('films_l', 'tourne'), ('set_c', 'cadre'), ('set_l', 'cadre'), ('subject_c', 'sujet')):
        for r in rows(k):
            ins = Q2I.get(qid(r['c']))
            if ins and ins in C: links.append((qid(r['w']), ins, qid(r['loc']) if 'loc' in r else '', rel))
    meta = {}
    for k in ('meta_tourne', 'meta_cadre', 'meta_sujet'):
        for r in rows(k):
            m = meta.setdefault(qid(r['w']), {'t': set(), 'y': set(), 'img': '', 'by': set()})
            if 't' in r: m['t'].add(qid(r['t']))
            if 'd' in r and re.match(r'^\d{4}', r['d']): m['y'].add(int(r['d'][:4]))
            if 'img' in r and not m['img']: m['img'] = urllib.parse.unquote(r['img'].rsplit('/', 1)[1])
            if 'by' in r and r['by'].startswith('http://www.wikidata.org/entity/Q'): m['by'].add(qid(r['by']))
    # les œuvres de P921 sans métadonnées (articles scientifiques écartés par la requête) : écartées aussi
    links = [l for l in links if l[3] != 'sujet' or l[0] in meta]
    ids = {l[0] for l in links} | {l[2] for l in links if l[2]} | {t for m in meta.values() for t in m['t']} | {b for m in meta.values() for b in m['by']}
    L = labels([i for i in ids if re.match(r'^Q\d+$', i)])
    best = {}
    PRI = {'tourne': 0, 'cadre': 1, 'sujet': 2}
    for w, ins, loc, rel in links:
        m = meta.get(w, {'t': set(), 'y': set(), 'img': '', 'by': set()})
        title = (L.get(w) or {}).get('fr') or (L.get(w) or {}).get('en')
        if not title or re.match(r'^Q\d+$', title): continue
        tl = [(L.get(t) or {}).get('fr') or (L.get(t) or {}).get('en') or '' for t in m['t']]
        k = kind_of(tl)
        if k is None: continue
        if rel == 'sujet' and k == 'autre': continue
        if rel == 'tourne' and k == 'autre': k = 'film'
        y = min((x for x in m['y'] if 1000 < x <= 2100), default=None)
        by = ', '.join(sorted({(L.get(b) or {}).get('fr') or (L.get(b) or {}).get('en') or '' for b in m['by']} - {''})[:2])
        locl = (L.get(loc) or {}).get('fr', '') if loc else ''
        row = {'q': w, 't': title, 'k': k, 'rel': rel, 'insee': ins}
        if y: row['y'] = y
        if by: row['by'] = by
        if locl and fold(locl) != fold(C[ins][0]): row['loc'] = locl
        if m['img']: row['img'] = m['img']
        wp = (L.get(w) or {}).get('wp', '')
        if wp: row['wp'] = wpurl(wp)
        key = (w, ins)
        if key not in best or PRI[rel] < PRI[best[key]['rel']]: best[key] = row
    R = sorted(best.values(), key=lambda r: (r['insee'], PRI[r['rel']], r.get('y', 9999), r['t']))
    write('oeuvres', {'v': 1, 'attr': 'Wikidata : P915 (lieu de tournage), P840 (lieu de l’action), P921 (sujet principal)', 'licence': 'CC0 1.0', 'url': 'https://www.wikidata.org/', 'built': TODAY, 'rows': R})
    print('œuvres', len(R), {k: sum(1 for r in R if r['k'] == k) for k in ('film', 'tv', 'livre', 'musique', 'art', 'jeu', 'autre')}, {k: sum(1 for r in R if r['rel'] == k) for k in PRI})

# ═══════════════ 3. les armoiries ═══════════════
def templates(text, name):
    """les modèles {{name|…}} (accolades équilibrées) → dict des paramètres"""
    out = []
    for m in re.finditer(r'\{\{\s*' + name + r'\s*\|', text, re.I):
        i, depth = m.start(), 0; j = i
        while j < len(text):
            if text.startswith('{{', j): depth += 1; j += 2; continue
            if text.startswith('}}', j):
                depth -= 1; j += 2
                if depth == 0: break
                continue
            j += 1
        body = text[m.end():j - 2]
        params, cur, d2, b2 = {}, '', 0, 0
        parts = []
        k = 0
        while k < len(body):
            if body.startswith('{{', k): d2 += 1; cur += '{{'; k += 2; continue
            if body.startswith('}}', k): d2 -= 1; cur += '}}'; k += 2; continue
            if body.startswith('[[', k): b2 += 1; cur += '[['; k += 2; continue
            if body.startswith(']]', k): b2 -= 1; cur += ']]'; k += 2; continue
            if body[k] == '|' and d2 == 0 and b2 == 0: parts.append(cur); cur = ''; k += 1; continue
            cur += body[k]; k += 1
        parts.append(cur)
        for p in parts:
            if '=' in p: a, b = p.split('=', 1); params[a.strip().lower()] = b.strip()
        out.append(params)
    return out

def wikiplain(s):
    s = re.sub(r'<!--.*?-->', '', s, flags=re.S)
    s = re.sub(r'<ref[^>/]*/>', '', s); s = re.sub(r'<ref[^>]*>.*?</ref>', '', s, flags=re.S)
    for _ in range(4):
        s = re.sub(r'\{\{\s*(?:1er|1re|2e|3e|4e|5e|6e|7e|8e|9e|e|er|re|Ier|nobr|nobr\s*)\s*\}\}', lambda m: re.sub(r'[{} ]', '', m.group(0)).replace('nobr', ''), s)
        s = re.sub(r'\{\{\s*(?:date|date-)\s*\|([^{}]*)\}\}', lambda m: ' '.join(x for x in m.group(1).split('|') if x and '=' not in x), s, flags=re.I)
        s = re.sub(r'\{\{\s*(?:lang|langue)\s*\|[^|{}]*\|([^{}]*)\}\}', r'\1', s, flags=re.I)
        s = re.sub(r'\{\{\s*(?:souligner|petites capitales|sc|smallcaps|italique|citation|nobr)\s*\|([^{}]*)\}\}', r'\1', s, flags=re.I)
        s = re.sub(r'\{\{[^{}]*\}\}', '', s)
    s = re.sub(r'\[\[(?:[^|\]]*\|)?([^\]]*)\]\]', r'\1', s)
    s = re.sub(r"'{2,}", '', s); s = re.sub(r'<[^>]+>', '', s)
    s = s.replace('&nbsp;', ' ').replace(' ', ' ')
    return re.sub(r'\s+', ' ', s).strip(' .;') + ('.' if s.strip() else '')

def build_armoiries(C, Q2I):
    imgs = {}
    for r in rows('arms'):
        ins = Q2I.get(qid(r['c']))
        if ins and ins in C and ins not in imgs: imgs[ins] = urllib.parse.unquote(r['img'].rsplit('/', 1)[1])
    by_dep_name = {}
    for ins, c in C.items(): by_dep_name.setdefault((dep_of(ins), fold(c[0])), []).append(ins)
    blaz = {}
    pages = 0
    for t in fetch_wiki.armorial_titles():
        m = re.match(r"Armorial des communes (?:de la |de l'|du |des |de |d'|d’)(.+)$", t)
        if not m: continue
        dname = re.sub(r'\s*\(.*\)$', '', m.group(1)); dcode = DEP_BY_NAME.get(fold(dname))
        if not dcode: continue
        p = fetch_wiki.page(t); pages += 1
        for prm in templates(p['wikitext'], 'Blason commune'):
            name = wikiplain(prm.get('commune', '')).rstrip('.')
            b = wikiplain(prm.get('blasonnement', ''))
            if not name or len(b) < 8: continue
            hits = by_dep_name.get((dcode, fold(name)), [])
            if len(hits) != 1: continue
            img = prm.get('image', '').strip().replace('_', ' ')
            blaz[hits[0]] = (b[:600], p['title'], img)
    files = set(imgs.values()) | {v[2] for v in blaz.values() if v[2]}
    cr = fetch_commons.credits(sorted(files))
    def credit(f):
        x = cr.get(f) or cr.get(f.replace('_', ' ')) or {}
        a = re.sub(r'<[^>]+>', '', x.get('Artist', '') or x.get('Credit', '')); a = re.sub(r'\s+', ' ', a).strip()[:160]
        return [a, x.get('LicenseShortName', '')[:60], x.get('LicenseUrl', '')]
    out, F = {}, {}
    for ins in sorted(set(imgs) | set(blaz)):
        f = imgs.get(ins) or (blaz.get(ins, ('', '', ''))[2])
        b, page = (blaz[ins][0], blaz[ins][1]) if ins in blaz else ('', '')
        if f:
            c = credit(f)
            if not c[1]: f = ''  # sans licence lisible : pas d'image
            else: F[f] = c
        if not f and not b: continue
        out[ins] = [C[ins][0], f, b, page]
    write('armoiries', {'v': 1, 'attr': 'Images : Wikidata P94 → Wikimedia Commons (auteur et licence de chaque fichier) ; blasonnements : Wikipédia en français, pages « Armorial des communes de … » (les contributeurs de Wikipédia)',
                        'licence': 'images : licence de chaque fichier ; textes : CC BY-SA 4.0', 'url': 'https://fr.wikipedia.org/wiki/Armorial_des_communes_de_France', 'built': TODAY, 'c': out, 'files': F})
    print('armoiries', len(out), 'avec blason', sum(1 for v in out.values() if v[2]), 'pages', pages)

# ═══════════════ 4. les plats ═══════════════
FOOD_ROOTS = {'Q2095', 'Q746549', 'Q10943', 'Q8195619', 'Q13266', 'Q11002', 'Q3314483', 'Q1778821', 'Q5283295', 'Q2920963'}
NOT_FOOD = {'Q40050', 'Q282', 'Q154', 'Q56139', 'Q11004'}  # boissons, vin, alcool… (« le plat » : on garde ce qui se mange)

def is_food(types):
    seen, front = set(), set(types)
    for _ in range(7):
        if front & NOT_FOOD and not (front & FOOD_ROOTS): return False
        if front & FOOD_ROOTS: return True
        front -= seen; seen |= front
        if not front: return False
        E = wm.entities(sorted(front), props='claims', languages='fr')
        front = {p for q in front for p in wm.ids(E.get(q), 'P279')}
    return False

def build_plats(C, Q2I):
    dl = rows('dish_loc'); dc = rows('dish_cuisine')
    reg2dep = {}
    for r in rows('depts'):
        code = r['code']
        if re.match(r'^(\d[\dAB]|97\d)$', code): reg2dep.setdefault(qid(r['reg']), set()).add(code)
    types = {}
    for r in dl: types.setdefault(qid(r['d']), set()).add(qid(r['t']))
    food = {d for d, t in types.items() if is_food(t)}
    cand = {}
    for r in dl:
        d = qid(r['d'])
        if d in food: cand.setdefault(d, {'loc': set(), 'cu': set()})['loc'].add(qid(r['loc']))
    for r in dc:
        cand.setdefault(qid(r['d']), {'loc': set(), 'cu': set()})['cu'].add((qid(r['cu']), qid(r['loc'])))
    locs = {l for v in cand.values() for l in v['loc']} | {l for v in cand.values() for _, l in v['cu']}
    E = wm.entities(sorted(locs), props='claims|labels', languages='fr|en')
    # un hop de plus (P131) pour ce qui n'est ni commune, ni département, ni région
    up = {p for q in locs for p in wm.ids(E.get(q), 'P131')} - set(E)
    E.update(wm.entities(sorted(up), props='claims|labels', languages='fr|en') if up else {})
    def where(loc):
        e = E.get(loc) or {}
        ins = next((v for v in wm.claims(e, 'P374') if isinstance(v, str)), '') or Q2I.get(loc, '')
        if ins and ins in C: return 'commune', [dep_of(ins)], ins
        code = next((v for v in wm.claims(e, 'P2586') if isinstance(v, str)), '')
        if code: return 'dep', [code], ''
        if loc in reg2dep: return 'region', sorted(reg2dep[loc]), ''
        for p in wm.ids(e, 'P131'):
            pe = E.get(p) or {}
            code = next((v for v in wm.claims(pe, 'P2586') if isinstance(v, str)), '')
            if code: return 'dep', [code], ''
            if p in reg2dep: return 'region', sorted(reg2dep[p]), ''
        return 'province', [], ''
    L = labels(list(cand) + [c for v in cand.values() for c, _ in v['cu']])
    DE = wm.entities(sorted(cand), props='claims', languages='fr')
    out = []
    LV = {'commune': 0, 'dep': 1, 'region': 2, 'province': 3}
    for d, v in cand.items():
        name = (L.get(d) or {}).get('fr')
        if not name or re.match(r'^Q\d+$', name): continue
        opts = [(l, '') for l in v['loc']] + [(l, cu) for cu, l in v['cu']]
        best = None
        for loc, cu in opts:
            lvl, deps, ins = where(loc)
            cand_row = (LV[lvl], loc, cu, lvl, deps, ins)
            if best is None or cand_row[0] < best[0]: best = cand_row
        _, loc, cu, lvl, deps, ins = best
        le = E.get(loc) or {}
        lat, lon = None, None
        co = next((x for x in wm.claims(le, 'P625') if isinstance(x, dict)), None)
        if co: lat, lon = round(co['latitude'], 3), round(co['longitude'], 3)
        if ins: lat, lon = C[ins][1], C[ins][2]
        if lvl == 'province' and lat is None: continue
        row = {'q': d, 'n': name, 'lvl': lvl, 'deps': deps, 'o': wm.label(le)}
        if cu and (L.get(cu) or {}).get('fr'): row['cu'] = L[cu]['fr']
        if ins: row['insee'] = ins
        if lat is not None: row['lat'], row['lon'] = lat, lon
        desc = (L.get(d) or {}).get('desc', '')
        if desc: row['d'] = desc[:160]
        img = next((x for x in wm.claims(DE.get(d), 'P18') if isinstance(x, str)), '')
        if img: row['img'] = img
        wp = (L.get(d) or {}).get('wp', '')
        if wp: row['wp'] = wpurl(wp)
        out.append(row)
    out.sort(key=lambda r: (r['n'].lower()))
    write('plats', {'v': 1, 'attr': 'Wikidata : P1071 (lieu de création) et P361/P2012 (cuisine régionale), plats et produits qui se mangent', 'licence': 'CC0 1.0', 'url': 'https://www.wikidata.org/', 'built': TODAY, 'rows': out})
    print('plats', len(out), {k: sum(1 for r in out if r['lvl'] == k) for k in LV})

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    C, Q2I = build_communes()
    only = set(sys.argv[2:])
    if not only or 'oeuvres' in only: build_oeuvres(C, Q2I)
    if not only or 'plats' in only: build_plats(C, Q2I)
    if not only or 'armoiries' in only: build_armoiries(C, Q2I)
