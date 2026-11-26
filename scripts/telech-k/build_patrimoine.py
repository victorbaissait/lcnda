#!/usr/bin/env python3
"""🏛 Lot K — Patrimoine du monde : les biens protégés d'un pays (assets/data/tk-patrimoine_<pays>.json.gz) et le patrimoine
mondial de l'UNESCO (assets/data/tk-patrimoine_monde.json.gz).

Source : Wikidata (CC0 — https://www.wikidata.org/wiki/Wikidata:Copyright, relu à chaque fabrication) : les éléments qui ont une
protection (P1435), une position (P625) et un nom ; la protection, l'année (création P571, sinon début de la protection),
la commune (P131) et l'identifiant du registre officiel quand Wikidata le connaît (Mérimée P380, Répertoire du Québec P633,
Historic England P1216, Rijksmonumenten P359, NRHP P649…). L'adresse de la fiche du registre est faite avec le « formatter URL »
(P1630) de la propriété, lu sur Wikidata : rien n'est copié des registres eux-mêmes, chaque bien a un lien vers sa fiche officielle.
La France n'est pas refaite ici : la base Mérimée (Licence Ouverte) est déjà dans l'app et rejoint la même liste réunie.

Deux façons de lire Wikidata :
  - le service de requêtes (SPARQL, query.wikidata.org) : une requête à la fois, une par protection, découpée quand il y a beaucoup
    de biens ; pause d'une minute entre deux requêtes (TK_WDQS_GAP), Retry-After respecté (le service répond 429 quand on va trop
    vite) — pour les grands pays, sur GitHub (.github/workflows/telech-k.yml) ;
  - l'API (--api : recherche « haswbstatement » puis wbgetentities par 50) pour les petits pays (moins de 10 000 biens) et le
    patrimoine mondial (P1435 = Q9259), quand le service de requêtes est saturé.

Lancer : python3 -I scripts/telech-k/build_patrimoine.py [--api] [dossier de sortie] pays…   (pays : lu ee gb… ou « monde » ou « tout »)
         TK_RAW = cache des réponses
"""
import os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
API = '--api' in sys.argv
OUT = ARGS[0] if ARGS and os.path.isdir(ARGS[0]) else os.path.join(ROOT, 'assets', 'data')
WANT = [a for a in ARGS if not os.path.isdir(a)] or ['monde']

# l'Europe (sans la France : Mérimée), le Canada et les États-Unis
PAYS = {'gb': ('Q145', 'Royaume-Uni'), 'ie': ('Q27', 'Irlande'), 'nl': ('Q55', 'Pays-Bas'), 'be': ('Q31', 'Belgique'), 'lu': ('Q32', 'Luxembourg'),
        'de': ('Q183', 'Allemagne'), 'ch': ('Q39', 'Suisse'), 'at': ('Q40', 'Autriche'), 'it': ('Q38', 'Italie'), 'es': ('Q29', 'Espagne'),
        'pt': ('Q45', 'Portugal'), 'dk': ('Q35', 'Danemark'), 'no': ('Q20', 'Norvège'), 'se': ('Q34', 'Suède'), 'fi': ('Q33', 'Finlande'),
        'is': ('Q189', 'Islande'), 'ee': ('Q191', 'Estonie'), 'lv': ('Q211', 'Lettonie'), 'lt': ('Q37', 'Lituanie'), 'pl': ('Q36', 'Pologne'),
        'cz': ('Q213', 'Tchéquie'), 'sk': ('Q214', 'Slovaquie'), 'hu': ('Q28', 'Hongrie'), 'si': ('Q215', 'Slovénie'), 'hr': ('Q224', 'Croatie'),
        'ro': ('Q218', 'Roumanie'), 'bg': ('Q219', 'Bulgarie'), 'gr': ('Q41', 'Grèce'), 'mt': ('Q233', 'Malte'), 'mc': ('Q235', 'Monaco'),
        'ad': ('Q228', 'Andorre'), 'li': ('Q347', 'Liechtenstein'), 'ca': ('Q16', 'Canada'), 'us': ('Q30', 'États-Unis')}
# les identifiants des registres officiels (dans cet ordre : le premier trouvé sert de clé pour réunir les doublons)
REGISTRES = ['P380', 'P633', 'P757', 'P1216', 'P709', 'P1459', 'P1460', 'P359', 'P1764', 'P649', 'P477', 'P381', 'P2951', 'P1702', 'P808',
             'P762', 'P3424', 'P1483', 'P1260', 'P2948', 'P4244', 'P2424', 'P1708', 'P2081', 'P2186']
MONDE = 'Q9259'   # « site du patrimoine mondial »


def licence():
    t = wm.get('https://www.wikidata.org/w/index.php?title=Wikidata:Copyright&action=raw', 'text/plain').decode('utf-8', 'replace')
    must = 'All structured data from the main, Property, Lexeme, and EntitySchema namespaces is available under'
    if must not in t or 'CC0' not in t:
        sys.exit('Wikidata:Copyright a changé : relire la page avant de fabriquer.')


def registres():
    """{P: [nom, adresse de la fiche avec $1]} lus sur Wikidata (P1630)"""
    out = {}
    for p, e in wm.wd_entities(REGISTRES, props='labels|claims', langs='fr|en').items():
        f = next((wm.val(c) for c in wm.claims(e, 'P1630') if isinstance(wm.val(c), str) and wm.val(c).startswith('https://')), '')
        if f and '$1' in f:
            out[p] = [wm.label(e), f]
    return out


def reg_of(get_ids, regs):
    """le premier identifiant de registre connu → « P1216:1234567 » (pour réunir les doublons et ouvrir la fiche officielle)"""
    for p in REGISTRES:
        if p in regs:
            v = get_ids(p)
            if v and len(v) <= 60 and '"' not in v and '<' not in v:
                return f'{p}:{v}'
    return ''


def rows_api(expr, regs, with_country=False):
    """par l'API : la recherche, puis les éléments par 50 ; les noms des protections, communes et pays en plus"""
    ids = wm.wd_search(expr)
    ents = wm.wd_entities(ids, props='labels|claims')
    rows, need = [], set()
    for q, e in ents.items():
        lat, lon = wm.coord(e)
        n = wm.label(e, ('fr', 'en', 'de', 'nl', 'it', 'es', 'pt', 'sv', 'da', 'nb', 'fi', 'et', 'pl', 'cs', 'mul'))
        if lat is None or not n:
            continue
        hs = [wm.val(c)['id'] for c in wm.claims(e, 'P1435') if isinstance(wm.val(c), dict)]
        if not hs:
            continue
        h = MONDE if MONDE in hs and expr.endswith(MONDE) else hs[0]
        y = wm.first_year(e, 'P571')
        if y is None:
            for c in wm.claims(e, 'P1435'):
                for qq in (c.get('qualifiers') or {}).get('P580', []):
                    if qq.get('snaktype') == 'value':
                        y = wm.year(qq['datavalue']['value']['time'])
                        break
                if y is not None:
                    break
        pl, cy = wm.first_q(e, 'P131'), wm.first_q(e, 'P17')
        ids_of = lambda p, e=e: next((wm.val(c) for c in wm.claims(e, p) if isinstance(wm.val(c), str)), '')
        r = {'q': q, 'n': n, 'lat': lat, 'lon': lon, 'h': h, 'y': y, 'pl': pl, 'reg': reg_of(ids_of, regs)}
        if with_country:
            r['cy'] = cy
        need |= {h, pl} | ({cy} if with_country else set())
        rows.append(r)
    names = {q: wm.label(e) for q, e in wm.wd_entities([x for x in need if x], props='labels').items()}
    return rows, names


def rows_sparql(cq, regs):
    """par le service de requêtes : une requête par protection (découpée par le numéro de l'élément quand il y en a beaucoup)"""
    hs = wm.sparql(f'SELECT ?h (COUNT(DISTINCT ?x) AS ?n) WHERE {{ ?x wdt:P17 wd:{cq} ; wdt:P1435 ?h ; wdt:P625 [] . }} GROUP BY ?h')
    vals = ' '.join(f'wdt:{p}' for p in regs)
    rows, names = {}, {}
    for b in hs:
        h, n = wm.qid(b['h']['value']), int(b['n']['value'])
        parts = max(1, -(-n // 40000))
        for k in range(parts):
            cut = f'FILTER(xsd:integer(STRAFTER(STR(?x), "/entity/Q")) - {parts} * FLOOR(xsd:integer(STRAFTER(STR(?x), "/entity/Q")) / {parts}) = {k})' if parts > 1 else ''
            q = (f'SELECT ?x ?l ?c ?y ?y2 ?pl ?plL ?rp ?rv WHERE {{ ?x wdt:P17 wd:{cq} ; p:P1435 ?st ; wdt:P625 ?c . ?st ps:P1435 wd:{h} . {cut}'
                 f' OPTIONAL {{ ?st pq:P580 ?y2 }} OPTIONAL {{ ?x wdt:P571 ?y }} OPTIONAL {{ ?x wdt:P131 ?pl . OPTIONAL {{ ?pl rdfs:label ?plL FILTER(LANG(?plL) IN ("fr","en","mul")) }} }}'
                 f' OPTIONAL {{ VALUES ?rp {{ {vals} }} ?x ?rp ?rv }}'
                 f' OPTIONAL {{ ?x rdfs:label ?l FILTER(LANG(?l) IN ("fr","en","mul","de","nl","it","es","pt","sv","da","nb","fi","et","pl","cs","hu","el")) }} }}')
            for r in wm.sparql(q):
                x = wm.qid(r['x']['value'])
                lat, lon = wm.point(r.get('c', {}).get('value'))
                cur = rows.setdefault(x, {'q': x, 'n': '', 'nl': '', 'lat': lat, 'lon': lon, 'h': h, 'y': None, 'pl': '', 'regs': {}})
                l = r.get('l')
                if l:
                    lang = l.get('xml:lang', '')
                    if lang == 'fr' or (lang == 'en' and cur['nl'] != 'fr') or not cur['n']:
                        cur['n'], cur['nl'] = l['value'], lang
                y = wm.year(r.get('y', {}).get('value')) if r.get('y') else wm.year(r.get('y2', {}).get('value')) if r.get('y2') else None
                if y is not None and (cur['y'] is None or y < cur['y']):
                    cur['y'] = y
                if r.get('pl'):
                    cur['pl'] = wm.qid(r['pl']['value'])
                    if r.get('plL') and (r['plL'].get('xml:lang') == 'fr' or cur['pl'] not in names):
                        names[cur['pl']] = r['plL']['value']
                if r.get('rp'):
                    cur['regs'].setdefault(r['rp']['value'].rsplit('/', 1)[-1], r['rv']['value'])
    hl = wm.sparql('SELECT ?h ?l WHERE { VALUES ?h { ' + ' '.join(f'wd:{wm.qid(b["h"]["value"])}' for b in hs) + ' } ?h rdfs:label ?l FILTER(LANG(?l) IN ("fr","en")) }') if hs else []
    for b in sorted(hl, key=lambda b: b['l'].get('xml:lang') != 'fr', reverse=True):
        names[wm.qid(b['h']['value'])] = b['l']['value']
    out = []
    for r in rows.values():
        if not r['n'] or r['lat'] is None:
            continue
        out.append({'q': r['q'], 'n': r['n'], 'lat': r['lat'], 'lon': r['lon'], 'h': r['h'], 'y': r['y'], 'pl': r['pl'], 'reg': reg_of(lambda p, r=r: r['regs'].get(p, ''), regs)})
    return out, names


def pack(rows, names, regs, cc, label, how):
    hs = sorted({r['h'] for r in rows})
    hi = {h: i for i, h in enumerate(hs)}
    pls = sorted({r['pl'] for r in rows if r['pl'] in names})
    pi = {p: i for i, p in enumerate(pls)}
    cys = sorted({r.get('cy', '') for r in rows if r.get('cy') in names})
    ci = {c: i for i, c in enumerate(cys)}
    rows.sort(key=lambda r: (r['n'].lower(), r['q']))
    out = [[r['q'], r['n'], r['lat'], r['lon'], hi[r['h']], r['y'], pi.get(r['pl'], -1), r['reg']] + ([ci.get(r.get('cy'), -1)] if cc == 'monde' else []) for r in rows]
    used = {r['reg'].split(':')[0] for r in rows if r['reg']}
    meta = {'source': 'Wikidata — biens protégés (P1435) avec une position (P625)' + (' : patrimoine mondial de l’UNESCO (Q9259)' if cc == 'monde' else f' : {label}'),
            'licence': 'CC0 1.0', 'licence_url': 'https://creativecommons.org/publicdomain/zero/1.0/deed.fr', 'url': 'https://www.wikidata.org/wiki/Property:P1435',
            'licence_page': 'https://www.wikidata.org/wiki/Wikidata:Copyright', 'built': wm.today(), 'how': how,
            'title': 'Patrimoine mondial de l’UNESCO (Wikidata)' if cc == 'monde' else f'Patrimoine protégé : {label} (Wikidata)', 'country': cc, 'country_label': label,
            'what': 'Nom, position, protection, année, commune, identifiant du registre officiel (lien vers sa fiche) ; les registres eux-mêmes ne sont pas copiés.',
            'designations': [[h, names.get(h, h)] for h in hs], 'places': [names[p] for p in pls], 'countries': [names[c] for c in cys],
            'registers': {p: regs[p] for p in sorted(used) if p in regs},
            'fields': ['q', 'n', 'lat', 'lon', 'h', 'y', 'pl', 'reg'] + (['cy'] if cc == 'monde' else []), 'rows': out}
    size = wm.write_gz(OUT, f'tk-patrimoine_{cc}.json.gz', meta)
    print(f'tk-patrimoine_{cc} : {len(out)} biens, {len(hs)} protections, {size} octets', flush=True)


def main():
    licence()
    regs = registres()
    want = list(PAYS) if WANT == ['tout'] else WANT
    for cc in want:
        t0 = time.time()
        if cc == 'monde':
            rows, names = rows_api(f'haswbstatement:P625 haswbstatement:P1435={MONDE}', regs, with_country=True)
            pack(rows, names, regs, 'monde', 'monde', 'API de Wikidata')
            continue
        if cc not in PAYS:
            sys.exit(f'pays inconnu : {cc}')
        cq, label = PAYS[cc]
        if API:
            rows, names = rows_api(f'haswbstatement:P625 haswbstatement:P17={cq} haswbstatement:P1435', regs)
        else:
            rows, names = rows_sparql(cq, regs)
        pack(rows, names, regs, cc, label, 'API de Wikidata' if API else 'service de requêtes de Wikidata')
        print(f'  ({time.time() - t0:.0f} s)', flush=True)


if __name__ == '__main__':
    main()
