"""Jeux Wikidata (CC0) du lot 9 → assets/data/l9b-sommets.json.gz (🏔️ premières ascensions), l9b-papes.json.gz (⛪ papes),
l9b-sejours.json.gz (🖋️ écrivains, peintres, musiciens… qui ont résidé dans une commune de France, avec une date).
Wikidata limite le service de requêtes (une requête par minute pendant les incidents) : le cache disque (common.CACHE) évite de
redemander. Usage : python3 build_wikidata.py [sommets|papes|sejours]…"""
import os, re, sys
sys.path.insert(0, os.path.dirname(__file__))
import common

def val(b, k):
    return b[k]['value'] if k in b else ''
def qid(u):
    return u.rsplit('/', 1)[-1] if u else ''
def year_of(t):
    m = re.match(r'^(-?\d{1,4})-(\d\d)-(\d\d)', t or '')
    return (int(m.group(1)), int(m.group(2)), int(m.group(3))) if m else None
def point(s):
    m = re.match(r'Point\(([-\d.eE]+) ([-\d.eE]+)\)', s or '')
    return (round(float(m.group(2)), 4), round(float(m.group(1)), 4)) if m else None

def iso(t, prec):
    y = year_of(t)
    if not y:
        return ''
    if prec and int(prec) <= 9:
        return f'{y[0]:04d}'
    if prec and int(prec) == 10:
        return f'{y[0]:04d}-{y[1]:02d}'
    return f'{y[0]:04d}-{y[1]:02d}-{y[2]:02d}'

def sommets():
    q = '''SELECT ?m ?mLabel ?c ?d ?prec ?alt ?ctry ?wpfr ?wpen (GROUP_CONCAT(DISTINCT ?whoL; separator="|") AS ?who) WHERE {
      ?m p:P793 ?st. ?st ps:P793 wd:Q1194369; pqv:P585 [wikibase:timeValue ?d; wikibase:timePrecision ?prec].
      ?m wdt:P625 ?c.
      OPTIONAL { ?m wdt:P2044 ?alt. } OPTIONAL { ?m wdt:P17 ?ctry. }
      OPTIONAL { ?st pq:P710 ?who0. ?who0 rdfs:label ?whoL. FILTER(lang(?whoL) = "fr" || lang(?whoL) = "en") }
      OPTIONAL { ?wpfr schema:about ?m; schema:isPartOf <https://fr.wikipedia.org/>. }
      OPTIONAL { ?wpen schema:about ?m; schema:isPartOf <https://en.wikipedia.org/>. }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en,de,it,es,mul". }
    } GROUP BY ?m ?mLabel ?c ?d ?prec ?alt ?ctry ?wpfr ?wpen'''
    rows = {}
    for b in common.sparql(q):
        q_ = qid(val(b, 'm')); pt = point(val(b, 'c')); d = iso(val(b, 'd'), val(b, 'prec'))
        if not pt or not d or q_ in rows and rows[q_]['d'] <= d:
            continue
        name = val(b, 'mLabel')
        if re.match(r'^Q\d+$', name):
            continue
        who = sorted({w for w in val(b, 'who').split('|') if w})
        rows[q_] = {'q': q_, 'n': name, 'lat': pt[0], 'lon': pt[1], 'd': d, 'alt': round(float(val(b, 'alt'))) if val(b, 'alt') else None,
                    'c': qid(val(b, 'ctry')), 'who': who[:4], 'wp': val(b, 'wpfr') or val(b, 'wpen')}
    out = sorted(rows.values(), key=lambda r: r['d'])
    common.write_gz('l9b-sommets.json.gz', {'v': 1, 'src': 'Wikidata (CC0) : « événement marquant » (P793) = « première ascension » (Q1194369), avec sa date (P585) et ses participants (P710)', 'licence': 'CC0 1.0', 'url': 'https://www.wikidata.org/wiki/Q1194369', 'rows': out})
    print('sommets', len(out))

def papes():
    q = '''SELECT ?p ?pLabel ?s ?sp ?e ?ep ?wp ?img ?birthName WHERE {
      ?p p:P39 ?st. ?st ps:P39 wd:Q19546; pqv:P580 [wikibase:timeValue ?s; wikibase:timePrecision ?sp].
      OPTIONAL { ?st pqv:P582 [wikibase:timeValue ?e; wikibase:timePrecision ?ep]. }
      OPTIONAL { ?wp schema:about ?p; schema:isPartOf <https://fr.wikipedia.org/>. }
      OPTIONAL { ?p wdt:P1477 ?birthName. }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en". }
    }'''
    rows = {}
    for b in common.sparql(q):
        q_ = qid(val(b, 'p')); s = iso(val(b, 's'), val(b, 'sp'))
        if not s or int(s[:4]) < 1000:
            continue
        r = rows.get(q_)
        if r and r['s'] <= s:
            continue
        rows[q_] = {'q': q_, 'n': val(b, 'pLabel'), 's': s, 'e': iso(val(b, 'e'), val(b, 'ep')), 'wp': val(b, 'wp')}
    out = sorted(rows.values(), key=lambda r: r['s'])
    common.write_gz('l9b-papes.json.gz', {'v': 1, 'src': 'Wikidata (CC0) : « fonction occupée » (P39) = « pape » (Q19546), début (P580) et fin (P582)', 'licence': 'CC0 1.0', 'url': 'https://www.wikidata.org/wiki/Q19546', 'rows': out})
    print('papes', len(out))

# 🖋️ les métiers des célébrités de passage (écrivain, poète, romancier, dramaturge, peintre, sculpteur, compositeur, musicien,
# philosophe, savant, photographe, architecte) — l'occupation exacte ou une sous-classe directe
OCC = {'Q36180': 'écrivain', 'Q49757': 'poète', 'Q6625963': 'romancier', 'Q214917': 'dramaturge', 'Q1028181': 'peintre', 'Q1281618': 'sculpteur',
       'Q36834': 'compositeur', 'Q639669': 'musicien', 'Q4964182': 'philosophe', 'Q901': 'savant', 'Q33231': 'photographe', 'Q42973': 'architecte',
       'Q1622272': 'universitaire', 'Q177220': 'chanteur', 'Q33999': 'acteur', 'Q11774202': 'essayiste', 'Q1930187': 'journaliste', 'Q169470': 'physicien', 'Q593644': 'chimiste'}

def sejours():
    vals = ' '.join('wd:' + k for k in OCC)
    q = '''SELECT ?p ?pLabel ?occ ?loc ?locLabel ?insee ?c ?s ?sp ?e ?ep ?t ?tp ?birth ?wp WHERE {
      VALUES ?occ { %s }
      ?p wdt:P106 ?occ.
      ?p p:P551 ?st. ?st ps:P551 ?loc.
      { ?st pqv:P580 [wikibase:timeValue ?s; wikibase:timePrecision ?sp]. } UNION { ?st pqv:P585 [wikibase:timeValue ?t; wikibase:timePrecision ?tp]. }
      OPTIONAL { ?st pqv:P582 [wikibase:timeValue ?e; wikibase:timePrecision ?ep]. }
      ?loc wdt:P17 wd:Q142.
      OPTIONAL { ?loc wdt:P374 ?insee. }
      OPTIONAL { ?loc wdt:P625 ?c. }
      OPTIONAL { ?p wdt:P569 ?birth. }
      OPTIONAL { ?wp schema:about ?p; schema:isPartOf <https://fr.wikipedia.org/>. }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en". }
    }''' % vals
    rows = {}
    for b in common.sparql(q):
        pq = qid(val(b, 'p')); lq = qid(val(b, 'loc'))
        s = iso(val(b, 's'), val(b, 'sp')) or iso(val(b, 't'), val(b, 'tp'))
        if not s:
            continue
        name = val(b, 'pLabel'); place = val(b, 'locLabel')
        if re.match(r'^Q\d+$', name) or re.match(r'^Q\d+$', place):
            continue
        key = (pq, lq, s)
        r = rows.setdefault(key, {'q': pq, 'n': name, 'occ': [], 'pl': place, 'plq': lq, 'insee': val(b, 'insee'), 's': s, 'e': iso(val(b, 'e'), val(b, 'ep')),
                                  'by': (year_of(val(b, 'birth')) or [None])[0], 'wp': val(b, 'wp')})
        pt = point(val(b, 'c'))
        if pt and 'lat' not in r:
            r['lat'], r['lon'] = pt
        o = OCC[qid(val(b, 'occ'))]
        if o not in r['occ']:
            r['occ'].append(o)
    out = sorted(rows.values(), key=lambda r: (r['s'], r['n']))
    common.write_gz('l9b-sejours.json.gz', {'v': 1, 'src': 'Wikidata (CC0) : « résidence » (P551) avec sa date (P580 début, P582 fin, ou P585), lieux en France (P17 = Q142)', 'licence': 'CC0 1.0', 'url': 'https://www.wikidata.org/wiki/Property:P551', 'occ': OCC, 'rows': out})
    print('sejours', len(out))

for a in sys.argv[1:] or ['sommets', 'papes', 'sejours']:
    globals()[a]()
