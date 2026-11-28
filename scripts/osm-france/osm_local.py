#!/usr/bin/env python3
"""🗺 OpenStreetMap SANS Overpass : lire un extrait Geofabrik déjà filtré par osmium (.github/workflows/osm-france.yml).

Pourquoi : les questions « toute la France » au service public Overpass (overpass-api.de, overpass.kumi.systems) tombent pendant
des heures (délais dépassés, 502/504) et chargent un service partagé. On télécharge plutôt UNE fois l'extrait France de Geofabrik
(https://download.geofabrik.de/europe/france-latest.osm.pbf, ODbL 1.0, « © les contributeurs d'OpenStreetMap »), on le filtre sur
la machine GitHub avec osmium-tool, et les scripts des lots B, E, F, G, H gardent leur propre fabrication des lignes.

Chaque script garde ses filtres écrits comme pour Overpass (nwr["historic"="fort"], way["railway"~"^(abandoned|disused)$"],
nwr["name"~"douane",i]…). Ce module :
  1. en tire les expressions de `osmium tags-filter` (un premier tri large, toujours PLUS large que le filtre exact) :
         python3 -I scripts/osm-france/osm_local.py filtres f      (b, e, f, g ou h ; une expression par ligne)
  2. lit le fichier OPL fabriqué par `osmium add-locations-to-ways -f opl,add_metadata=false` (les chemins portent la
     position de leurs nœuds) et rend les objets sous la forme d'une réponse Overpass « out center tags » (ou « out geom ») :
         {'type': 'node'|'way'|'relation', 'id': 123, 'tags': {…}, 'lat', 'lon'}            (nœud)
         {'type': 'way'|'relation', 'id': …, 'tags': {…}, 'center': {'lat', 'lon'}}         (centre du rectangle englobant,
                                                                                            comme « out center »)
         + 'geometry': [{'lat', 'lon'}, …] pour les chemins quand geom=True                 (comme « out geom »)
  3. applique le filtre EXACT de chaque question (mêmes règles qu'Overpass : clé présente, =, !=, ~, !~, « ,i »).
Les scripts choisissent ce chemin quand la variable OSM_OPL donne le fichier OPL ; sinon ils questionnent Overpass comme avant.

Différences connues avec Overpass : une relation n'a de centre que si ses membres (chemins, nœuds étiquetés) sont dans l'extrait ;
l'extrait Geofabrik déborde de quelques kilomètres sur les pays voisins (Overpass s'arrêtait à la frontière : area FR).

Essai sans réseau : python3 -I scripts/osm-france/osm_local.py essai
Bibliothèques : seulement celles de Python.
"""
import importlib.util, itertools, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SEL = re.compile(r'^\s*(nwr|nw|nr|wr|node|way|relation|rel)\b')
CLAUSE = re.compile(r'\[\s*"((?:[^"\\]|\\.)+)"\s*(?:(=|!=|~|!~)\s*"((?:[^"\\]|\\.)*)"\s*(,\s*i\s*)?)?\]')
TYPES = {'nwr': 'nwr', 'nw': 'nw', 'nr': 'nr', 'wr': 'wr', 'node': 'n', 'way': 'w', 'relation': 'r', 'rel': 'r'}
FULL = {'n': 'node', 'w': 'way', 'r': 'relation'}


# ─────────────────────────── les filtres « à la Overpass » ───────────────────────────
def parse(sel):
    """'nwr["k"="v"]["k2"~"re",i]' → ('nwr', [(k, op, v, icase), …])"""
    m = SEL.match(sel)
    if not m:
        raise ValueError(f'filtre non compris : {sel}')
    types, rest, clauses = TYPES[m.group(1)], sel[m.end():].strip(), []
    while rest:
        c = CLAUSE.match(rest)
        if not c:
            raise ValueError(f'filtre non compris : {sel} (à « {rest} »)')
        k, op, v, ic = c.group(1), c.group(2), c.group(3), bool(c.group(4))
        clauses.append((k.replace('\\"', '"'), op, None if v is None else v.replace('\\"', '"'), ic))
        rest = rest[c.end():].strip()
    return types, clauses


def matcher(sel):
    types, clauses = parse(sel)
    tests = []
    for k, op, v, ic in clauses:
        if op in ('~', '!~'):
            rx = re.compile(v, re.I if ic else 0)
            tests.append((k, op, rx))
        else:
            tests.append((k, op, v))

    def ok(el):
        if el['type'][0] not in types:
            return False
        t = el.get('tags') or {}
        for k, op, v in tests:
            x = t.get(k)
            if op is None:
                if x is None:
                    return False
            elif op == '=':
                if x != v:
                    return False
            elif op == '!=':
                if x == v:
                    return False
            elif op == '~':
                if x is None or not v.search(x):
                    return False
            elif op == '!~':
                if x is not None and v.search(x):
                    return False
        return True
    return ok


# ─────────────────────────── les expressions de « osmium tags-filter » ───────────────────────────
def _alternatives(rx):
    """Le langage (fini) d'une expression simple : littéraux, [classes], (a|b), ?, ., ^, $ → liste de chaînes où '\\0' marque
    « n'importe quel caractère » ; None si l'expression est trop compliquée (on prendra une autre condition du filtre)."""
    pos = 0

    def alt():
        nonlocal pos
        branches = [seq()]
        while pos < len(rx) and rx[pos] == '|':
            pos += 1
            branches.append(seq())
        return [s for b in branches for s in b]

    def seq():
        nonlocal pos
        out = ['']
        while pos < len(rx) and rx[pos] not in '|)':
            ch = rx[pos]
            if ch == '(':
                pos += 1
                if rx.startswith('?:', pos):
                    pos += 2
                inner = alt()
                if pos >= len(rx) or rx[pos] != ')':
                    raise ValueError
                pos += 1
                atom = inner
            elif ch == '[':
                end = rx.index(']', pos + 1)
                body = rx[pos + 1:end]
                if body.startswith('^') or re.search(r'.-.', body) or '\\' in body:
                    raise ValueError
                atom, pos = list(dict.fromkeys(body)), end + 1
            elif ch == '.':
                atom, pos = ['\0'], pos + 1
            elif ch == '^':
                atom, pos = ['\1'], pos + 1
            elif ch == '$':
                atom, pos = ['\2'], pos + 1
            elif ch == '\\':
                if pos + 1 >= len(rx) or rx[pos + 1].isalnum():
                    raise ValueError
                atom, pos = [rx[pos + 1]], pos + 2
            elif ch in '*+{}':
                raise ValueError
            else:
                atom, pos = [ch], pos + 1
            if pos < len(rx) and rx[pos] == '?':
                atom, pos = atom + [''], pos + 1
            if pos < len(rx) and rx[pos] in '*+{':
                raise ValueError
            out = [a + b for a in out for b in atom]
            if len(out) > 256:
                raise ValueError
        return out
    try:
        res = alt()
    except ValueError:
        return None
    return res if pos == len(rx) else None


def _cases(s):
    return list(dict.fromkeys([s, s.lower(), s[:1].upper() + s[1:].lower(), s.upper()]))


def _regex_values(rx, icase):
    """osmium : « k=v » (exact), « k=v* » (début), « k=*v* » (contient) — sensible à la casse. Rend la liste des valeurs, ou None."""
    alts = _alternatives(rx)
    if alts is None:
        return None
    vals = []
    for a in alts:
        start = a.startswith('\1')
        body = a.lstrip('\1')
        if '\1' in body:
            return None
        exact_end = body.endswith('\2')
        body = body.split('\2')[0] if not exact_end else body[:-1]
        if '\2' in body:
            return None
        if start and exact_end and '\0' not in body and body:
            vals += _cases(body) if icase else [body]   # ^…$ sans joker : valeur exacte
            continue
        parts = body.split('\0')
        best = max(reversed(parts), key=lambda p: len(p.strip()))   # à longueur égale : le dernier morceau (souvent le plus rare)
        seg = best.strip()
        if len(seg) < 3:
            return None
        lead = start and parts[0] == best and best == best.lstrip()   # le morceau est au tout début de la valeur
        for c in (_cases(seg) if icase else [seg]):
            vals.append(f'{c}*' if lead else f'*{c}*')
    vals = list(dict.fromkeys(vals))
    if not vals or len(vals) > 64 or any(',' in v or '=' in v for v in vals):
        return None
    return vals


def osmium_expr(sel):
    """Les expressions « osmium tags-filter » (une ou plusieurs, à mettre chacune sur sa ligne) qui gardent AU MOINS tout ce que
    garde le filtre Overpass (souvent un peu plus)."""
    types, clauses = parse(sel)
    best = None
    for k, op, v, ic in clauses:
        if any(c in k for c in ',=*/'):
            continue
        if op == '=' and ',' not in v and '*' not in v:
            cand = (3, [f'{k}={v}'])
        elif op == '~':
            vals = _regex_values(v, ic)
            if vals is None:
                cand = (1, [k])
            else:
                # osmium : une liste « a,b » ne prend que des valeurs exactes ; avec un joker *, une expression par valeur
                cand = (3, [f'{k}={",".join(vals)}'] if not any('*' in x for x in vals) else [f'{k}={x}' for x in vals])
        elif op is None:
            cand = (1, [k])
        else:
            continue   # != et !~ n'aident pas à trier
        # à valeur égale, la DERNIÈRE condition : dans ces filtres la plus précise vient après la plus générale
        # (nwr["natural"="tree"]["name"~"[Ll]ibert"] → name=*Libert*… et pas les millions d'arbres)
        if best is None or cand[0] >= best[0]:
            best = cand
    if best is None:
        raise ValueError(f'aucune condition utilisable par osmium : {sel}')
    return [f'{types}/{x}' for x in best[1]]


# ─────────────────────────── lire le fichier OPL ───────────────────────────
_ESC = re.compile(r'%([0-9a-fA-F]+)%')
_NODE = re.compile(r'n(-?\d+)(?:x(-?[\d.]+)y(-?[\d.]+))?$')


def _dec(s):
    return _ESC.sub(lambda m: chr(int(m.group(1), 16)), s) if '%' in s else s


def _tags(s):
    out = {}
    if s:
        for kv in s.split(','):
            k, _, v = kv.partition('=')
            out[_dec(k)] = _dec(v)
    return out


def _fields(line):
    head, *rest = line.rstrip('\n').split(' ')
    f = {r[0]: r[1:] for r in rest if r}
    return head[0], int(head[1:]), f


def _bbox_add(b, lat, lon):
    if b is None:
        return [lat, lon, lat, lon]
    b[0], b[1], b[2], b[3] = min(b[0], lat), min(b[1], lon), max(b[2], lat), max(b[3], lon)
    return b


def _center(b):
    return None if b is None else {'lat': (b[0] + b[2]) / 2, 'lon': (b[1] + b[3]) / 2}


_CACHE = {}


def load(path, geom=False):
    """Tous les objets ÉTIQUETÉS du fichier OPL, sous la forme d'une réponse Overpass (voir en tête du fichier)."""
    ck = (os.path.abspath(path), geom)
    if ck in _CACHE:
        return _CACHE[ck]
    # 1er passage : ce dont les relations ont besoin (positions des nœuds membres, rectangles des chemins membres)
    need_n, need_w, need_r = set(), set(), set()
    with open(path, encoding='utf-8') as fh:
        for line in fh:
            if line[:1] != 'r':
                continue
            _, _, f = _fields(line)
            for m in (f.get('M') or '').split(','):
                if m:
                    t, ref = m[0], int(m[1:].split('@', 1)[0])
                    (need_n if t == 'n' else need_w if t == 'w' else need_r).add(ref)
    npos, wbox, rbox, rels, out = {}, {}, {}, [], []
    with open(path, encoding='utf-8') as fh:
        for line in fh:
            kind = line[:1]
            if kind not in 'nwr' or not line.strip():
                continue
            kind, oid, f = _fields(line)
            tags = _tags(f.get('T'))
            if kind == 'n':
                if not f.get('x') or not f.get('y'):
                    continue
                lat, lon = float(f['y']), float(f['x'])
                if oid in need_n:
                    npos[oid] = (lat, lon)
                if tags:
                    out.append({'type': 'node', 'id': oid, 'lat': lat, 'lon': lon, 'tags': tags})
            elif kind == 'w':
                pts = []
                for nd in (f.get('N') or '').split(','):
                    m = _NODE.match(nd) if nd else None
                    if m and m.group(2) is not None and m.group(2) != '':
                        pts.append((float(m.group(3)), float(m.group(2))))
                b = None
                for lat, lon in pts:
                    b = _bbox_add(b, lat, lon)
                if oid in need_w and b:
                    wbox[oid] = b
                if tags:
                    e = {'type': 'way', 'id': oid, 'tags': tags}
                    if b:
                        e['center'] = _center(b)
                    if geom:
                        e['geometry'] = [{'lat': lat, 'lon': lon} for lat, lon in pts]
                    out.append(e)
            else:
                mem = []
                for m in (f.get('M') or '').split(','):
                    if m:
                        mem.append((m[0], int(m[1:].split('@', 1)[0])))
                rels.append((oid, tags, mem))
    # les relations : rectangle de leurs membres (deux tours pour les relations dans des relations)
    for _ in range(2):
        for oid, tags, mem in rels:
            b = None
            for t, ref in mem:
                if t == 'n' and ref in npos:
                    b = _bbox_add(b, *npos[ref])
                elif t in 'wr':
                    mb = (wbox if t == 'w' else rbox).get(ref)
                    if mb:
                        b = _bbox_add(b, mb[0], mb[1])
                        b = _bbox_add(b, mb[2], mb[3])
            if b:
                rbox[oid] = b
    for oid, tags, mem in rels:
        if tags:
            e = {'type': 'relation', 'id': oid, 'tags': tags}
            if oid in rbox:
                e['center'] = _center(rbox[oid])
            out.append(e)
    _CACHE[ck] = out
    return out


def select(path, sel, geom=False):
    """Les objets du fichier OPL qui répondent au filtre Overpass « sel » (comme « (sel(area.fr)); out center tags; »)."""
    ok = matcher(sel)
    return [e for e in load(path, geom) if ok(e)]


# ─────────────────────────── les filtres de chaque lot ───────────────────────────
def _module(rel):
    p = os.path.join(ROOT, rel)
    sys.path.insert(0, os.path.dirname(p))
    argv, sys.argv = sys.argv, [p]   # les scripts lisent sys.argv en se chargeant (dossier de sortie) : rien ici
    try:
        spec = importlib.util.spec_from_file_location('lot_' + re.sub(r'\W', '_', rel), p)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
    finally:
        sys.argv = argv
    return mod


def selectors(lot):
    if lot == 'b':
        return [s for v in _module('scripts/telech-b/build.py').OSM_KINDS.values() for _, s in v]
    if lot == 'e':
        return list(_module('scripts/telech-e/build_libertes.py').OSM_SEL)
    if lot in ('f', 'g', 'h'):
        return [s for v in _module(f'scripts/telech-{lot}/build_osm.py').Q.values() for _, s in v]
    raise SystemExit(f'lot inconnu : {lot} (b, e, f, g ou h)')


def filtres(lot):
    return list(dict.fromkeys(x for s in selectors(lot) for x in osmium_expr(s)))


# ─────────────────────────── essai sans réseau ───────────────────────────
ESSAI = '''n1 Thistoric=memorial,name=Plaque%20%Michelin%2c%%20%1925 x3 y45
n2 Tname=Maison%20%du%20%cocher x3.1 y45.1
n3 T x3.2 y45.2
n4 T x3.3 y45.2
n5 T x3.3 y45.3
n6 Tname=Douane%20%de%20%X,historic=yes x3.2 y45.3
w10 Tbuilding=yes,name=Halles%20%de%20%Test Nn3x3.2y45.2,n4x3.3y45.2,n5x3.3y45.3,n6x3.2y45.3,n3x3.2y45.2
w11 Trailway=abandoned Nn3x3.2y45.2,n4x3.3y45.2,n5x3.3y45.3
w12 T Nn4x3.3y45.2,n5x3.3y45.3
r20 Ttype=route,route=hiking,name=Draille%20%de%20%l'Aubrac Mw12@,n6@
'''


def essai(tmp):
    p = os.path.join(tmp, 'essai.opl')
    with open(p, 'w', encoding='utf-8') as fh:
        fh.write(ESSAI)
    k = lambda els: sorted(e['type'][0] + str(e['id']) for e in els)
    assert k(select(p, 'nwr["historic"]["name"~"[Cc]ocher|[Mm]ichelin"]')) == ['n1'], 'cocher'
    assert load(p)[0]['tags']['name'] == 'Plaque Michelin, 1925'
    assert k(select(p, 'nwr["building"]["name"~"^(Halles?|Ancienne halle)( |$)"]')) == ['w10']
    w = select(p, 'nwr["building"]["name"~"^(Halles?|Ancienne halle)( |$)"]')[0]
    assert abs(w['center']['lat'] - 45.25) < 1e-9 and abs(w['center']['lon'] - 3.25) < 1e-9
    assert k(select(p, 'way["railway"~"^(abandoned|disused|razed)$"]')) == ['w11']
    assert len(select(p, 'way["railway"~"^(abandoned|disused|razed)$"]', geom=True)[0]['geometry']) == 3
    r = select(p, 'relation["route"]["name"~"draille|transhumance",i]')
    assert k(r) == ['r20'] and abs(r[0]['center']['lat'] - 45.25) < 1e-9, r
    assert k(select(p, 'nwr["historic"]["name"~"douane",i]')) == ['n6']
    assert k(select(p, 'node["name"!~"cocher"]["name"]')) == ['n1', 'n6']
    assert osmium_expr('nwr["historic"~"^(forge|smithy)$"]') == ['nwr/historic=forge,smithy']
    assert osmium_expr('nwr["historic"]["name"~"[Cc]ocher|[Mm]ichelin"]') == ['nwr/name=*Cocher*', 'nwr/name=*cocher*', 'nwr/name=*Michelin*', 'nwr/name=*michelin*']
    assert osmium_expr('nwr["name"~"^[Hh]aut[- ]fourneau"]') == ['nwr/name=Haut-fourneau*', 'nwr/name=Haut fourneau*', 'nwr/name=haut-fourneau*', 'nwr/name=haut fourneau*']
    assert osmium_expr('nwr["name"~"^buron",i]["building"]') == ['nwr/name=buron*', 'nwr/name=Buron*', 'nwr/name=BURON*']
    assert osmium_expr('way["abandoned:railway"]') == ['w/abandoned:railway']
    assert osmium_expr('nwr["amenity"="fountain"]["historic"]') == ['nwr/amenity=fountain']
    assert osmium_expr('nwr["natural"="tree"]["name"~"[Ll]ibert"]') == ['nwr/name=*Libert*', 'nwr/name=*libert*']
    assert osmium_expr('nwr["amenity"="place_of_worship"]["religion"="jewish"]') == ['nwr/religion=jewish']
    assert 'nwr/name=Marché couvert' in osmium_expr('nwr["building"]["name"~"^(Halles?|Ancienne halle|Vieille halle|Marché couvert)( |$)"]')
    print('osm_local : essai réussi')


def main():
    a = sys.argv[1:]
    if a[:1] == ['filtres'] and len(a) == 2:
        for x in filtres(a[1]):
            print(x)
    elif a[:1] == ['essai']:
        import tempfile
        with tempfile.TemporaryDirectory() as d:
            essai(d)
    else:
        sys.exit(__doc__)


if __name__ == '__main__':
    main()
