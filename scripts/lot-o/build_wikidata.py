#!/usr/bin/env python3
"""⛏ 🏰 Lot O6 — petits packs Wikidata (CC0) : assets/data/lo-mines.json.gz et lo-vauban.json.gz.

  mines   ⛏ catastrophes minières en France (coups de grisou, coups de poussier, effondrements, inondations de mine) :
          les classes sont retrouvées par leur nom (« accident minier », « catastrophe minière », « coup de grisou »… et leurs
          sous-classes), puis leurs exemples en France avec une position (P625, sinon celle du lieu P276 / P131) et une date
          (P585, sinon P580) ; morts (P1120) quand Wikidata les connaît.
  vauban  🏰 les fortifications de Vauban au complet, au-delà des 12 sites du patrimoine mondial :
          ce qui fait partie de « Fortifications de Vauban » (P361 Q833781) ; ce dont Vauban est l'architecte, l'auteur ou le
          concepteur (P84 / P170 / P287) ; ce dont la description française cite Vauban (recherche de Wikidata « Vauban » parmi les éléments situés en France, avec une position).
          Pour chaque site : comment il est lié à Vauban (patrimoine mondial, architecte, cité), la date de construction (P571)
          quand Wikidata la connaît, et ce que la description dit (« construit », « remanié », « modifié », « inspecté »).
          Rien n'est deviné : sans date ni mot dans la description, le champ reste vide.
Licence : https://www.wikidata.org/wiki/Wikidata:Copyright, relue à chaque fabrication (« Creative Commons CC0 License »).
Requêtes polies (scripts/telech-l/wm.py) : une à la fois, une minute entre deux, Retry-After respecté, réponses gardées.

Lancer : python3 -I scripts/lot-o/build_wikidata.py [dossier de sortie] [mines vauban]
"""
import datetime, json, os, re, sys
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, 'scripts', 'telech-l'))
import wm  # noqa: E402

args = sys.argv[1:]
OUT = args[0] if args and not re.match(r'^[a-z]+$', args[0]) else os.path.join(ROOT, 'assets', 'data')
WANT = [a for a in args if re.match(r'^[a-z]+$', a)] or ['mines', 'vauban']
LIC = 'https://www.wikidata.org/wiki/Wikidata:Copyright'
TODAY = datetime.date.today().isoformat()


def licence():
    raw = wm.get('https://www.wikidata.org/w/index.php?title=Wikidata:Copyright&action=raw', '*/*').decode('utf-8')
    if 'Creative Commons CC0 License' not in raw:
        sys.exit('Wikidata:Copyright ne dit plus « Creative Commons CC0 License » : relire ' + LIC)


def v(b, k):
    return (b.get(k) or {}).get('value', '')


def point(s):
    m = re.match(r'Point\(([-\d.eE]+) ([-\d.eE]+)\)', s or '')
    return (round(float(m.group(2)), 5), round(float(m.group(1)), 5)) if m else (None, None)


def year(s):
    m = re.match(r'^(-?\d{1,4})', s or '')
    return int(m.group(1)) if m else None


def mines():
    q = """SELECT ?i ?iLabel ?iDescription ?date ?coord ?placeLabel ?dead ?art WHERE {
      VALUES ?nom { "accident minier"@fr "catastrophe minière"@fr "coup de grisou"@fr "coup de poussier"@fr "mining accident"@en "mining disaster"@en "firedamp explosion"@en "mine collapse"@en }
      ?c rdfs:label ?nom . ?i wdt:P31/wdt:P279* ?c ; wdt:P17 wd:Q142 .
      OPTIONAL { ?i wdt:P585 ?d1 } OPTIONAL { ?i wdt:P580 ?d2 } BIND(COALESCE(?d1, ?d2) AS ?date)
      OPTIONAL { ?i wdt:P625 ?c1 } OPTIONAL { ?i wdt:P276|wdt:P131 ?place . ?place wdt:P625 ?c2 } BIND(COALESCE(?c1, ?c2) AS ?coord)
      OPTIONAL { ?i wdt:P1120 ?dead }
      OPTIONAL { ?art schema:about ?i ; schema:isPartOf <https://fr.wikipedia.org/> }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en". } } LIMIT 3000"""
    rows = {}
    for b in wm.sparql(q):
        qid = v(b, 'i').rsplit('/', 1)[-1]
        lat, lon = point(v(b, 'coord'))
        if lat is None or qid in rows:
            continue
        rows[qid] = [qid, v(b, 'iLabel')[:120], year(v(b, 'date')), v(b, 'date')[:10], lat, lon, v(b, 'placeLabel')[:80],
                     int(float(v(b, 'dead'))) if v(b, 'dead') else None, v(b, 'art'), v(b, 'iDescription')[:200]]
    out = sorted((r for r in rows.values() if r[2]), key=lambda r: (r[2], r[1]))
    return {'v': 1, 'built': TODAY, 'title': 'Catastrophes minières en France', 'source': 'Wikidata', 'url': 'https://www.wikidata.org/',
            'licence': 'CC0 1.0', 'licence_url': LIC, 'licence_read': TODAY,
            'fields': ['q', 'name', 'year', 'date', 'lat', 'lon', 'place', 'dead', 'wp', 'desc'], 'rows': out}


FORT = re.compile(r'fort|citadelle|enceinte|redoute|bastion|rempart|batterie|place forte|ouvrage|casemate|poudri|caserne', re.I)
ROLE = [('remani', 'remanié'), ('modifi', 'modifié'), ('renforc', 'renforcé'), ('inspect', 'inspecté'), ('visit', 'inspecté'), ('construi', 'construit'), ('bâti', 'construit'), ('édifi', 'construit'), ('fortifi', 'fortifié')]


def vauban():
    who = """SELECT ?v WHERE { ?v rdfs:label "Sébastien Le Prestre de Vauban"@fr ; wdt:P31 wd:Q5 . } LIMIT 1"""
    vb = wm.sparql(who)
    vq = v(vb[0], 'v').rsplit('/', 1)[-1] if vb else ''
    if not vq:
        sys.exit('Vauban introuvable sur Wikidata (libellé changé ?)')
    tail = """ ?i wdt:P625 ?coord .
      OPTIONAL { ?i wdt:P571 ?inc } OPTIONAL { ?i wdt:P131 ?commune }
      OPTIONAL { ?art schema:about ?i ; schema:isPartOf <https://fr.wikipedia.org/> }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en". } } LIMIT 3000"""
    head = "SELECT ?i ?iLabel ?iDescription ?coord ?inc ?communeLabel ?art WHERE { "
    # trois questions courtes plutôt qu'une longue (le service coupe une requête trop lourde)
    asks = [('unesco', head + "?i wdt:P361 wd:Q833781 ." + tail),
            ('auteur', head + "?i wdt:P84|wdt:P170|wdt:P287 wd:%s ." % vq + tail),
            ('cite', head + """SERVICE wikibase:mwapi { bd:serviceParam wikibase:endpoint "www.wikidata.org" ; wikibase:api "Search" ; mwapi:srsearch "Vauban haswbstatement:P17=Q142" ; mwapi:srlimit "max" .
                ?i wikibase:apiOutputItem mwapi:title . }
              ?i schema:description ?desc0 . FILTER(LANG(?desc0) = "fr" && CONTAINS(?desc0, "Vauban"))""" + tail)]
    binds = []
    for kind, q in asks:
        try:
            binds += [dict(b, how={'value': kind}) for b in wm.sparql(q)]
        except RuntimeError as e:
            print(f'vauban, partie « {kind} » : {e}')
    rows = {}
    for b in binds:
        qid = v(b, 'i').rsplit('/', 1)[-1]
        lat, lon = point(v(b, 'coord'))
        if lat is None:
            continue
        how = sorted(set(v(b, 'how').split(',')) - {''})
        desc = v(b, 'iDescription')[:200]
        if how == ['cite'] and not FORT.search(desc + ' ' + v(b, 'iLabel')):
            continue  # « arrêt Vauban », « mairie de Vauban » : la commune de Vauban, pas une fortification
        role = next((r for k, r in ROLE if k in desc.lower()), '')
        r = rows.get(qid)
        if r:
            r[6] = sorted(set(r[6]) | set(how))
            continue
        rows[qid] = [qid, v(b, 'iLabel')[:120], lat, lon, v(b, 'communeLabel')[:80], year(v(b, 'inc')), how, role, desc, v(b, 'art')]
    out = sorted(rows.values(), key=lambda r: ('unesco' not in r[6], r[1]))
    return {'v': 1, 'built': TODAY, 'title': 'Fortifications de Vauban', 'source': 'Wikidata', 'url': 'https://www.wikidata.org/wiki/Q833781',
            'licence': 'CC0 1.0', 'licence_url': LIC, 'licence_read': TODAY, 'vauban': vq,
            'fields': ['q', 'name', 'lat', 'lon', 'commune', 'year', 'how', 'role', 'desc', 'wp'], 'rows': out}


def main():
    licence()
    for w in WANT:
        meta = {'mines': mines, 'vauban': vauban}[w]()
        if not meta['rows']:
            print(f'{w} : aucune ligne, fichier gardé tel quel')
            continue
        size = wm.write_gz(OUT, f'lo-{w}.json.gz', meta)
        print(f'lo-{w}.json.gz : {len(meta["rows"])} lignes, {size} octets')


if __name__ == '__main__':
    main()
