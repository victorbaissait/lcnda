#!/usr/bin/env python3
"""LCNDA — 📜 Anciens noms des lieux (DicoTopo, CTHS) : fabrique les fichiers LIVRÉS AVEC L'APP, assets/data/dicotopo/.

Source : le Dictionnaire topographique de la France en ligne, https://dicotopo.cths.fr (API publique /api/1.0/search).
Licence : « L'utilisation, le partage et l'adaptation du contenu sont autorisés selon les termes de la Licence Ouverte V 2.0
(équivalente à une licence CC-BY 4.0) » (page Crédits du site). Mention : DicoTopo — Dictionnaire topographique de la France,
Comité des travaux historiques et scientifiques (CTHS), Archives nationales (Centre d'onomastique), École nationale des chartes.
⚠ Les fichiers XML de l'entrepôt GitHub chartes/dico-topo sont, eux, sous CC BY-NC-ND 3.0 FR : on ne s'en sert PAS.

    python3 scripts/lieux-patrimoine/build-dicotopo.py                 # tous les départements en ligne (≈ 1 h, ≈ 2 000 appels)
    python3 scripts/lieux-patrimoine/build-dicotopo.py --dep 15 --dep 02   # seulement ceux-là
    python3 scripts/lieux-patrimoine/build-dicotopo.py --hors-ligne DOSSIER # relit les réponses déjà gardées (essais)

Les réponses de l'API sont gardées dans --cache (par défaut ./dicotopo-cache) : relancer reprend où on s'était arrêté.

Sortie (assets/data/dicotopo/) :
    index.json            {source, licence, mention, url, built, deps: {"02": {label, places, old, size, bibl}}}
    DT02.json.gz          {dep, label, bibl, c: {insee: [nom de la commune, lon, lat, n° du lieu de la commune ou -1]},
                           p: [[id sans « P », nom, insee, description courte]], o: [[n° du lieu, forme ancienne, date, année, référence]]}
L'année : la date écrite (1253), ou le milieu du siècle (« XIIIe siècle » → 1250) ; null sans date.
"""
import argparse
import datetime
import gzip
import html
import json
import os
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request

API = 'https://dicotopo.cths.fr/api/1.0'
SITE = 'https://dicotopo.cths.fr'
PAGE = 1000          # une page de réponses ; on découpe les recherches jusqu'à tenir en une page
LICENCE = 'Licence Ouverte 2.0 (Etalab), équivalente à CC BY 4.0'
MENTION = ('DicoTopo — Dictionnaire topographique de la France, Comité des travaux historiques et scientifiques (CTHS), '
           'Archives nationales (Centre d’onomastique), École nationale des chartes')


def log(*a):
    print(*a, file=sys.stderr, flush=True)


class Fetcher:
    def __init__(self, cache, offline=None, pause=0.3):
        self.cache, self.offline, self.pause, self.calls = cache, offline, pause, 0
        os.makedirs(cache, exist_ok=True)

    def get(self, path):
        key = re.sub(r'[^A-Za-z0-9._-]+', '_', path)[:180]
        f = os.path.join(self.offline or self.cache, key + '.json')
        if os.path.exists(f):
            with open(f, encoding='utf-8') as h:
                return json.load(h)
        if self.offline:
            raise SystemExit(f'Réponse absente du dossier hors ligne : {key}')
        url = API + path
        for attempt in range(6):
            try:
                req = urllib.request.Request(url, headers={'Accept': 'application/vnd.api+json', 'User-Agent': 'LCNDA (genealogie, donnees ouvertes)'})
                with urllib.request.urlopen(req, timeout=120) as r:
                    body = r.read()
                d = json.loads(body)
                if 'errors' in d:
                    raise RuntimeError(json.dumps(d['errors'])[:300])
                tmp = f + '.tmp'
                with open(tmp, 'wb') as h:
                    h.write(body)
                os.replace(tmp, f)
                self.calls += 1
                time.sleep(self.pause)
                return d
            except (urllib.error.URLError, TimeoutError, ConnectionError, json.JSONDecodeError, RuntimeError) as e:
                log(f'   … {e} — nouvel essai dans {5 * (attempt + 1)} s')
                time.sleep(5 * (attempt + 1))
        raise SystemExit(f'DicoTopo ne répond pas : {url}')


def q(query, size=PAGE, number=1):
    return '/search?' + urllib.parse.urlencode({'query': query, 'page[size]': size, 'page[number]': number, 'without-relationships': ''})


def count(F, query):
    return int(F.get(q(query, 1))['meta']['total-count'])


def fetch_all(F, query, depth_prefix, dep, kind):
    """tous les documents d'une recherche, en la découpant par début de code INSEE tant qu'elle dépasse une page"""
    n = count(F, query)
    if n == 0:
        return []
    if n <= PAGE:
        return F.get(q(query))['data']
    if len(depth_prefix) < 5:
        out = []
        for d in '0123456789AB' if len(depth_prefix) == 2 and dep in ('2A', '2B') else '0123456789':
            out += fetch_all(F, f'dep-id:{dep} AND type:{kind} AND localization-insee-code:{depth_prefix}{d}*', depth_prefix + d, dep, kind)
        return out
    # une seule commune avec plus de 1 000 réponses : par pages (la fenêtre de l'API s'arrête à 10 000)
    out = []
    for page in range(1, min(10, (n + PAGE - 1) // PAGE) + 1):
        out += F.get(q(query, PAGE, page))['data']
    return out


def dep_docs(F, dep, kind):
    docs = fetch_all(F, f'dep-id:{dep} AND type:{kind} AND localization-insee-code:{dep}*', dep, dep, kind)
    rest = f'dep-id:{dep} AND type:{kind} AND NOT localization-insee-code:{dep}*'
    n = count(F, rest)
    if n:
        for page in range(1, min(10, (n + PAGE - 1) // PAGE) + 1):
            docs += F.get(q(rest, PAGE, page))['data']
    total = count(F, f'dep-id:{dep} AND type:{kind}')
    seen = {}
    for d in docs:
        seen[str(d['id'])] = d
    if len(seen) < total:
        log(f'   ⚠ {dep} {kind} : {len(seen)} reçus sur {total} annoncés')
    return list(seen.values())


SC = re.compile(r'<span class="sc">(.*?)</span>', re.S)


def text(h, limit=0):
    """du HTML de DicoTopo au texte simple (petites capitales → majuscules : « xiii<sup>e</sup> » → « XIIIe »)"""
    if not h:
        return ''
    if isinstance(h, list):
        h = h[0] if h else ''
    s = SC.sub(lambda m: m.group(1).upper(), str(h))
    s = re.sub(r'<[^>]+>', '', s)
    s = html.unescape(s)
    s = re.sub(r'\s+', ' ', s).strip()
    if limit and len(s) > limit:
        s = s[:limit - 1].rsplit(' ', 1)[0] + '…'
    return s


def year_of(text_date):
    """« 1253 » → 1253 ; « 0530 » → 530 ; « 13 » (siècle) → 1250 ; rien → None"""
    s = str(text_date or '').strip()
    if not re.fullmatch(r'\d{1,4}', s):
        return None
    v = int(s)
    if len(s) <= 2:
        return (v - 1) * 100 + 50 if 0 < v <= 21 else None
    return v


def fold(s):
    s = unicodedata.normalize('NFD', str(s or '').lower())
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    s = re.sub(r'\s*\((l[’\']|la|le|les)\)\s*$', '', s)
    return re.sub(r'[^a-z0-9]+', ' ', s).strip()


def longlat(v):
    m = re.match(r'\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)', str(v or ''))
    return [round(float(m.group(1)), 4), round(float(m.group(2)), 4)] if m else [None, None]


def build_dep(F, dep, label, bibl):
    log(f'— {dep} {label}')
    places = dep_docs(F, dep, 'place')
    olds = dep_docs(F, dep, 'place-old-label')
    pidx, P, C = {}, [], {}
    for d in sorted(places, key=lambda d: (fold(d['attributes'].get('place-label')), d['id'])):
        a = d['attributes']
        pid = str(a.get('place-id') or d['id'])
        insee = str(a.get('localization-insee-code') or '')
        pidx[pid] = len(P)
        P.append([pid.lstrip('P'), text(a.get('place-label')), insee, text(a.get('descriptions'), 160)])
        if insee and insee not in C and a.get('commune-label'):
            lon, lat = longlat(a.get('longlat'))
            C[insee] = [text(a.get('commune-label')), lon, lat, -1]
    O = []
    for d in olds:
        a = d['attributes']
        pid = str(a.get('place-id') or '')
        if pid not in pidx:  # forme ancienne d'un lieu absent des « places » : on l'ajoute avec ce que dit la forme
            insee = str(a.get('localization-insee-code') or '')
            pidx[pid] = len(P)
            P.append([pid.lstrip('P'), text(a.get('place-label')), insee, text(a.get('place-desc'), 160)])
            if insee and insee not in C and a.get('commune-label'):
                lon, lat = longlat(a.get('longlat'))
                C[insee] = [text(a.get('commune-label')), lon, lat, -1]
        lab = text(a.get('rich-label'))
        if not lab:
            continue
        O.append([pidx[pid], lab, text(a.get('rich-date')), year_of(a.get('text-date')), text(a.get('rich-reference'), 200)])
    # le lieu « commune » : même nom que la commune, celui qui a le plus de formes anciennes
    nold = {}
    for o in O:
        nold[o[0]] = nold.get(o[0], 0) + 1
    for i, p in enumerate(P):
        c = C.get(p[2])
        if c and fold(p[1]) == fold(c[0]):
            j = c[3]
            if j < 0 or nold.get(i, 0) > nold.get(j, 0):
                c[3] = i
    O.sort(key=lambda o: (o[0], o[3] if o[3] is not None else 9999, o[1]))
    return {'dep': dep, 'label': label, 'bibl': bibl, 'c': C, 'p': P, 'o': O}


def bibl_of(F, dep):
    """le dictionnaire du département (auteur, titre, Gallica) : une fiche de lieu au hasard le dit"""
    d = F.get(q(f'dep-id:{dep} AND type:place', 1))['data']
    if not d:
        return {}
    pid = d[0]['id']
    full = F.get(f'/places/{pid}?without-relationships&include=responsibility@flat-resp')
    for x in full.get('included', []):
        if x['type'] == 'responsibility':
            b = (x['attributes'] or {}).get('bibl') or {}
            g = b.get('gallica_ark') or ''
            return {'abbr': text(b.get('abbr')), 'bibl': text(b.get('bibl')), 'gallica': f'https://gallica.bnf.fr/{g}' if g else ''}
    return {}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dep', action='append', default=[])
    ap.add_argument('--cache', default='dicotopo-cache')
    ap.add_argument('--hors-ligne', dest='offline')
    ap.add_argument('--sortie', default=os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'assets', 'data', 'dicotopo'))
    a = ap.parse_args()
    F = Fetcher(a.cache, a.offline)
    out = os.path.abspath(a.sortie)
    os.makedirs(out, exist_ok=True)
    groups = F.get('/search?' + urllib.parse.urlencode({'query': '*', 'groupby[doc-type]': 'insee-ref', 'groupby[field]': 'dep-id', 'groupby[id-mapping]': 'department', 'page[size]': 1000, 'without-relationships': ''}))
    deps = {x['attributes']['insee-code']: text(x['attributes']['label']) for x in groups['data']}
    want = [d.upper().zfill(2) for d in a.dep] or sorted(deps)
    idx_path = os.path.join(out, 'index.json')
    index = json.load(open(idx_path, encoding='utf-8')) if os.path.exists(idx_path) else {}
    index.update({'source': 'DicoTopo — Dictionnaire topographique de la France', 'url': SITE, 'licence': LICENCE, 'licence_url': 'https://www.etalab.gouv.fr/wp-content/uploads/2017/04/ETALAB-Licence-Ouverte-v2.0.pdf',
                  'mention': MENTION, 'built': datetime.date.today().isoformat(), 'api': API + '/search'})
    index.setdefault('deps', {})
    for dep in want:
        if dep not in deps:
            log(f'   {dep} : pas de dictionnaire en ligne')
            continue
        data = build_dep(F, dep, deps[dep], bibl_of(F, dep))
        raw = json.dumps(data, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
        path = os.path.join(out, f'DT{dep}.json.gz')
        with open(path, 'wb') as h:
            h.write(gzip.compress(raw, 9, mtime=0))
        index['deps'][dep] = {'label': deps[dep], 'places': len(data['p']), 'old': len(data['o']), 'communes': len(data['c']), 'size': os.path.getsize(path), 'bibl': data['bibl']}
        with open(idx_path, 'w', encoding='utf-8') as h:
            json.dump(index, h, ensure_ascii=False, indent=1, sort_keys=True)
        log(f'   {dep} : {len(data["p"])} lieux, {len(data["o"])} formes anciennes, {os.path.getsize(path) / 1e6:.2f} Mo ({F.calls} appels)')
    total = sum(v['size'] for v in index['deps'].values())
    log(f'Fini : {len(index["deps"])} départements, {total / 1e6:.1f} Mo')


if __name__ == '__main__':
    main()
