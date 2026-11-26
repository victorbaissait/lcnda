# LCNDA — lot J (🌍 Partir et nommer) : les noms de lieux d'autrefois dans le monde, tirés de Wikidata (CC0).
#   python3 -I scripts/telech-j/build_noms.py assets/data [noms|fusions]
#  🏷 tj-noms     les noms officiels datés (P1448 avec début P580 et/ou fin P582) des lieux de ~85 pays (la France est déjà dans
#                 assets/data/wikidata/oldnames.json.gz) ; et, pour les villes de plus de 30 000 habitants, leurs noms en français,
#                 allemand, anglais, italien, espagnol, polonais et latin (libellés et alias) : Presbourg, Breslau, Lemberg, Cracovie…
#  🔀 tj-fusions  les communes disparues dans une fusion (P576 fin + P1366 remplacé par) de 18 pays d'Europe : ce que donnent les
#                 registres nationaux (Suisse OFS, Espagne INE, Pays-Bas…), vu par Wikidata ; les registres restent en lien.
# Le service de requêtes est limité : une requête à la fois, une pause longue (wm.py, TJ_WDQS_GAP) ; les pays sont groupés, et un
# groupe trop lourd est coupé en deux.
import os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm  # noqa: E402

OUT = sys.argv[1] if len(sys.argv) > 1 else 'assets/data'
WHAT = sys.argv[2] if len(sys.argv) > 2 else 'tout'
WD = {'v': 1, 'source': 'Wikidata', 'licence': 'CC0 1.0', 'licence_url': 'https://www.wikidata.org/wiki/Wikidata:Copyright',
      'credit': 'Données : Wikidata (CC0 1.0), extraites avec le service de requêtes query.wikidata.org.'}
# code → élément Wikidata (pays d'aujourd'hui) ; les gros pays seuls, les autres par groupes
C = dict(DE='Q183', PL='Q36', CZ='Q213', SK='Q214', AT='Q40', HU='Q28', CH='Q39', IT='Q38', ES='Q29', PT='Q45', BE='Q31', NL='Q55', LU='Q32',
         GB='Q145', IE='Q27', DK='Q35', NO='Q20', SE='Q34', FI='Q33', EE='Q191', LV='Q211', LT='Q37', RU='Q159', UA='Q212', BY='Q184', MD='Q217',
         RO='Q218', BG='Q219', RS='Q403', HR='Q224', SI='Q215', BA='Q225', ME='Q236', MK='Q221', AL='Q222', GR='Q41', TR='Q43', CY='Q229', MT='Q233',
         DZ='Q262', TN='Q948', MA='Q1028', EG='Q79', LB='Q822', SY='Q858', IL='Q801', VN='Q881', KH='Q424', LA='Q819', CA='Q16', US='Q30',
         MX='Q96', AR='Q414', BR='Q155', CL='Q298', UY='Q77', HT='Q790', SN='Q1041', ML='Q912', CI='Q1008', MG='Q1019', CD='Q974', CG='Q971',
         CM='Q1009', MU='Q1027', GE='Q230', AM='Q399', 
         BJ='Q962', TG='Q945', GN='Q1006', BF='Q965', NE='Q1032', TD='Q657', GA='Q1000', DJ='Q977', KM='Q970', SC='Q1042', MC='Q235', AD='Q228',
         LI='Q347', CU='Q241', DO='Q786', PE='Q419', CO='Q739', VE='Q717', PY='Q733', BO='Q750', )
ALONE = ['US', 'DE', 'RU', 'IT', 'ES', 'PL', 'GB', 'CA', 'BR', 'UA', 'CZ', 'AT', 'HU', 'NL', 'BE', 'CH']
FUSION = ['CH', 'ES', 'NL', 'BE', 'DE', 'IT', 'AT', 'LU', 'PT', 'DK', 'CZ', 'SK', 'PL', 'HU', 'SE', 'NO', 'FI', 'SI']
LANGS = ['fr', 'de', 'en', 'it', 'es', 'pl', 'la']


def groups(codes, size=8):
    big = [[c] for c in codes if c in ALONE]
    rest = [c for c in codes if c not in ALONE]
    return big + [rest[i:i + size] for i in range(0, len(rest), size)]


def labels(qids):
    """les libellés français (sinon anglais) d'une liste d'éléments, par paquets"""
    out = {}
    qids = sorted(set(qids))
    for i in range(0, len(qids), 400):
        vals = ' '.join('wd:' + q for q in qids[i:i + 400])
        for r in wm.sparql('SELECT ?i ?l WHERE { VALUES ?i { %s } ?i rdfs:label ?l FILTER(lang(?l) = "fr" || lang(?l) = "en") }' % vals):
            q, lang = wm.qid(r['i']['value']), r['l'].get('xml:lang', '')
            if lang == 'fr' or q not in out:
                out[q] = r['l']['value']
    return out


def run(q_of, codes, light=None):
    """une requête par groupe de pays ; un groupe qui échoue est coupé en deux ; un pays seul qui échoue est refait sans les
    libellés (light), puis ses libellés sont demandés à part, par paquets"""
    out, todo = [], groups(codes)
    while todo:
        g = todo.pop(0)
        vals = ' '.join('wd:' + C[c] for c in g)
        try:
            res = wm.sparql(q_of(vals))
            print(f'  {",".join(g)} : {len(res)} réponses', flush=True)
            out += res
        except RuntimeError as e:
            if len(g) == 1:
                if light:
                    try:
                        res = wm.sparql(light(vals))
                        lab = labels([wm.qid(r['i']['value']) for r in res])
                        for r in res:
                            q = wm.qid(r['i']['value'])
                            if q in lab:
                                r['lab'] = {'value': lab[q]}
                        print(f'  {g[0]} : {len(res)} réponses (sans libellés, puis libellés à part)', flush=True)
                        out += res
                        continue
                    except RuntimeError as e2:
                        e = e2
                print(f'  {g[0]} : abandonné ({str(e)[:120]})', flush=True)
                continue
            todo[:0] = [g[:len(g) // 2], g[len(g) // 2:]]
    return out


CC_OF = {v: k for k, v in C.items()}
g = lambda r, k: r.get(k, {}).get('value', '')  # noqa: E731
JUNK = re.compile(r'(?i)(\d|\bville de\b|\bcity of\b|\bstadt\b|\bcittà di\b|\bciudad de\b|\bmiasto\b|^[A-Z]{2,3}-|\(|"|ville-lumi|capital)')


def noms():
    q1 = lambda vals: '''SELECT ?i ?cty ?n ?s ?e ?c ?lab ?en WHERE { VALUES ?cty { %s } ?i wdt:P17 ?cty ; p:P1448 ?st ; wdt:P625 ?c .
 ?st ps:P1448 ?n . OPTIONAL { ?st pq:P580 ?s } OPTIONAL { ?st pq:P582 ?e } FILTER(BOUND(?s) || BOUND(?e))
 OPTIONAL { ?i rdfs:label ?lab FILTER(lang(?lab) = "fr") } OPTIONAL { ?i rdfs:label ?en FILTER(lang(?en) = "en") } }''' % vals  # noqa: E731
    q2 = lambda vals: '''SELECT ?i ?cty ?v ?k ?c ?lab ?en WHERE { VALUES ?cty { %s } ?i wdt:P17 ?cty ; wdt:P1082 ?pop ; wdt:P625 ?c . FILTER(?pop >= 30000)
 { ?i rdfs:label ?v BIND("l" AS ?k) } UNION { ?i skos:altLabel ?v BIND("a" AS ?k) } FILTER(lang(?v) IN ("fr", "de", "en", "it", "es", "pl", "la"))
 OPTIONAL { ?i rdfs:label ?lab FILTER(lang(?lab) = "fr") } OPTIONAL { ?i rdfs:label ?en FILTER(lang(?en) = "en") } }''' % vals  # noqa: E731
    q1l = lambda vals: '''SELECT ?i ?cty ?n ?s ?e ?c WHERE { VALUES ?cty { %s } ?i wdt:P17 ?cty ; p:P1448 ?st ; wdt:P625 ?c .
 ?st ps:P1448 ?n . OPTIONAL { ?st pq:P580 ?s } OPTIONAL { ?st pq:P582 ?e } FILTER(BOUND(?s) || BOUND(?e)) }''' % vals  # noqa: E731
    q2l = lambda vals: '''SELECT ?i ?cty ?v ?k ?c WHERE { VALUES ?cty { %s } ?i wdt:P17 ?cty ; wdt:P1082 ?pop ; wdt:P625 ?c . FILTER(?pop >= 30000)
 { ?i rdfs:label ?v BIND("l" AS ?k) } UNION { ?i skos:altLabel ?v BIND("a" AS ?k) } FILTER(lang(?v) IN ("fr", "de", "en", "it", "es", "pl", "la")) }''' % vals  # noqa: E731
    rows, seen = [], set()
    print('noms officiels datés…', flush=True)
    for r in run(q1, list(C), q1l):
        q = wm.qid(g(r, 'i'))
        la, lo = wm.point(g(r, 'c'))
        now = g(r, 'lab') or g(r, 'en')
        n = g(r, 'n').strip()
        if la is None or not now or not n or (q, n, 'o') in seen or re.match(r'^Q\d+$', now):
            continue
        a, b = wm.year(g(r, 's')), wm.year(g(r, 'e'))
        if b is None and n.lower() == now.lower():
            continue  # le nom d'aujourd'hui, sans fin : rien d'ancien
        seen.add((q, n, 'o'))
        rows.append([q, now, n, 'o', a, b, la, lo, CC_OF.get(wm.qid(g(r, 'cty')), ''), ''])
    print('autres noms des villes (exonymes)…', flush=True)
    names = {}
    for r in run(q2, list(C), q2l):
        q = wm.qid(g(r, 'i'))
        la, lo = wm.point(g(r, 'c'))
        now = g(r, 'lab') or g(r, 'en')
        v = g(r, 'v').strip()
        lang = r.get('v', {}).get('xml:lang', '')
        if la is None or not now or not v or re.match(r'^Q\d+$', now) or len(v) > 40 or len(v) < 3 or len(v.split()) > 3 or JUNK.search(v):
            continue
        d = names.setdefault(q, {'now': now, 'la': la, 'lo': lo, 'cc': CC_OF.get(wm.qid(g(r, 'cty')), ''), 'v': {}})
        d['v'].setdefault(v, set()).add(lang)
    for q, d in names.items():
        for v, langs in d['v'].items():
            if v.lower() == d['now'].lower() or (q, v, 'o') in seen or (q, v, 'x') in seen:
                continue
            seen.add((q, v, 'x'))
            rows.append([q, d['now'], v, 'x', None, None, d['la'], d['lo'], d['cc'], ' '.join(l for l in LANGS if l in langs)])
    rows.sort(key=lambda r: (r[8], r[1], r[4] or 0, r[2]))
    meta = {**WD, 'url': 'https://www.wikidata.org/wiki/Property:P1448', 'built': wm.today(),
            'what': 'Noms de lieux d’autrefois hors de France (Wikidata) : noms officiels datés (P1448 + P580/P582) ; pour les villes de plus de '
                    '30 000 habitants, leurs autres noms en français, allemand, anglais, italien, espagnol, polonais, latin (libellés et alias, sans date)',
            'countries': sorted(C), 'kinds': {'o': 'nom officiel daté', 'x': 'autre nom ou nom en une autre langue (sans date)'},
            'fields': ['q', 'now', 'name', 'k', 'from', 'to', 'lat', 'lon', 'cc', 'langs'], 'rows': rows}
    size = wm.write_gz(OUT, 'tj-noms.json.gz', meta)
    print(f'tj-noms : {len(rows)} noms ({sum(1 for r in rows if r[3] == "o")} officiels datés), {len({r[0] for r in rows})} lieux, {size} octets')


def fusions():
    q = lambda vals: '''SELECT ?i ?cty ?lab ?s ?e ?succ ?slab ?c WHERE { VALUES ?cty { %s } ?i wdt:P17 ?cty ; wdt:P576 ?e ; wdt:P1366 ?succ ; wdt:P625 ?c .
 OPTIONAL { ?i wdt:P571 ?s }
 SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,de,nl,es,it,pt,da,cs,sk,pl,hu,sv,nb,fi,sl,en". ?i rdfs:label ?lab . ?succ rdfs:label ?slab } }''' % vals  # noqa: E731
    rows, seen = [], set()
    ql = lambda vals: '''SELECT ?i ?cty ?s ?e ?succ ?c WHERE { VALUES ?cty { %s } ?i wdt:P17 ?cty ; wdt:P576 ?e ; wdt:P1366 ?succ ; wdt:P625 ?c .
 OPTIONAL { ?i wdt:P571 ?s } }''' % vals  # noqa: E731
    print('communes fusionnées…', flush=True)
    res = run(q, FUSION, ql)
    miss = [wm.qid(g(r, 'succ')) for r in res if not g(r, 'slab')]
    if miss:
        lab = labels(miss)
        for r in res:
            if not g(r, 'slab') and wm.qid(g(r, 'succ')) in lab:
                r['slab'] = {'value': lab[wm.qid(g(r, 'succ'))]}
    for r in res:
        qi, qs = wm.qid(g(r, 'i')), wm.qid(g(r, 'succ'))
        la, lo = wm.point(g(r, 'c'))
        if la is None or (qi, qs) in seen or re.match(r'^Q\d+$', g(r, 'lab')) or re.match(r'^Q\d+$', g(r, 'slab')):
            continue
        seen.add((qi, qs))
        rows.append([qi, g(r, 'lab'), wm.year(g(r, 's')), wm.year(g(r, 'e')), qs, g(r, 'slab'), la, lo, CC_OF.get(wm.qid(g(r, 'cty')), '')])
    rows.sort(key=lambda r: (r[8], r[3] or 0, r[1]))
    meta = {**WD, 'url': 'https://www.wikidata.org/wiki/Property:P1366', 'built': wm.today(),
            'what': 'Communes (et autres lieux) disparues dans une fusion, avec la commune qui les a reprises (Wikidata : P576 fin, P1366 remplacé par) — '
                    + ', '.join(FUSION),
            'countries': FUSION, 'fields': ['q', 'name', 'from', 'to', 'sq', 'succ', 'lat', 'lon', 'cc'], 'rows': rows}
    size = wm.write_gz(OUT, 'tj-fusions.json.gz', meta)
    print(f'tj-fusions : {len(rows)} lieux disparus, {size} octets')


if __name__ == '__main__':
    if WHAT in ('tout', 'noms'):
        noms()
    if WHAT in ('tout', 'fusions'):
        fusions()
