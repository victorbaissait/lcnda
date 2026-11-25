#!/usr/bin/env python3
"""🎩 Les gens de pouvoir — fabrique assets/data/dp-pouvoir.json.gz et assets/data/dp-maires-<dép>.json.gz depuis Wikidata (CC0).

  python3 -I scripts/droit-pouvoir/build-pouvoir.py [--sans-maires] [--atlas chemin/atlas-ancien-regime]

Ce qu'on prend (seulement ce que Wikidata dit, avec dates de début et de fin) :
  - chefs de l'État de la France : titulaires (P39) de « roi de France », « roi de France et de Navarre », « roi des Français »,
    « Premier consul », « empereur des Français », « président de la République française », « chef de l'État français »,
    « président du gouvernement provisoire de la République française » ; et, pour les années sans chef unique, les régimes
    « Convention nationale » et « Directoire » (dates de début et de fin de l'élément Wikidata) ;
  - chefs de l'État des autres pays : la propriété P35 (chef d'État) des pays, avec ses dates, rangée par code ISO 3166 numérique (P299) ;
  - préfets : titulaires des fonctions « préfet de X » (sous-classe de Q1285463, P1001 → département avec code INSEE P2586) ;
  - évêques : titulaires d'une fonction rattachée à un diocèse de France (P1001), ou de « évêque diocésain » / « archevêque »
    avec le qualificatif P708 (diocèse) ; le diocèse, son siège (code INSEE de la ville, P159/P36), ses dates (P571/P576) ;
  - maires : titulaires des fonctions « maire de X » (sous-classe de Q382617, P1001 → commune avec code INSEE P374),
    un fichier par département (lu seulement quand il sert).
Ce qu'on écarte, et pourquoi (liste EXCLU ci-dessous) : les titulaires sans date, les personnages de fiction, Louis XVII (roi en
titre seulement, n'a jamais régné), le « Directoire » argentin qui porte le même nom.
"""
import csv, gzip, json, os, re, sys, time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from wd import sparql, val, qid  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'assets', 'data')
TODAY = time.strftime('%Y-%m-%d')

FR_POS = {'Q18384454': 'roi de France', 'Q3439798': 'roi de France et de Navarre', 'Q3439814': 'roi des Français', 'Q1131971': 'Premier consul',
          'Q5373953': 'empereur des Français', 'Q191954': 'président de la République', 'Q19018293': 'chef de l’État français',
          'Q23004974': 'président du Gouvernement provisoire'}
FR_REGIMES = {'Q219825': 'la Convention nationale (pas de chef de l’État)', 'Q219817': 'le Directoire (cinq directeurs)'}
EXCLU = {'Q49765': 'Louis XVII : roi en titre, n’a jamais régné', 'Q116212447': 'personnage de fiction', 'Q116213051': 'personnage de fiction',
         'Q142117172': 'sans date', 'Q3153786': 'intérim (pas une personne)'}


def day(s):
    """'1830-08-09T00:00:00Z' → '1830-08-09' ; '' si absent ; les dates « -01-01 » à la précision de l'année restent telles quelles"""
    m = re.match(r'^(-?\d{1,4})-(\d\d)-(\d\d)', s or '')
    return f'{int(m.group(1)):04d}-{m.group(2)}-{m.group(3)}' if m else ''


def label_fix(rows, key='pLabel', q='p'):
    """quand le service des libellés ne donne que le Q…, on redemande (fr puis en)"""
    miss = sorted({qid(val(b, q)) for b in rows if re.fullmatch(r'Q\d+', val(b, key))})
    names = {}
    for i in range(0, len(miss), 200):
        vals = ' '.join('wd:' + x for x in miss[i:i + 200])
        for b in sparql(f'SELECT ?x ?l WHERE {{ VALUES ?x {{ {vals} }} ?x rdfs:label ?l . FILTER(LANG(?l) IN ("fr","en","mul")) }}'):
            names.setdefault(qid(val(b, 'x')), val(b, 'l'))
    return names


def heads_france():
    vals = ' '.join('wd:' + q for q in FR_POS)
    rows = sparql(f'''SELECT ?pos ?p ?pLabel ?s ?e ?art WHERE {{
      VALUES ?pos {{ {vals} }} ?p p:P39 ?st . ?st ps:P39 ?pos . ?st pq:P580 ?s . OPTIONAL {{ ?st pq:P582 ?e }}
      FILTER NOT EXISTS {{ ?st wikibase:rank wikibase:DeprecatedRank }}
      OPTIONAL {{ ?art schema:about ?p ; schema:isPartOf <https://fr.wikipedia.org/> }}
      SERVICE wikibase:label {{ bd:serviceParam wikibase:language "fr,en". }} }}''')
    fix = label_fix(rows)
    out, seen = [], set()
    for b in rows:
        p = qid(val(b, 'p'))
        if p in EXCLU:
            continue
        s, e = day(val(b, 's')), day(val(b, 'e'))
        k = (p, s)
        if k in seen:
            continue
        seen.add(k)
        n = val(b, 'pLabel'); n = fix.get(p, n) if re.fullmatch(r'Q\d+', n) else n
        art = val(b, 'art')
        out.append({'n': n, 'q': p, 't': FR_POS[qid(val(b, 'pos'))], 's': s, 'e': e, 'w': art.rsplit('/wiki/', 1)[-1] if art else ''})
    vals = ' '.join('wd:' + q for q in FR_REGIMES)
    for b in sparql(f'SELECT ?x ?s ?e WHERE {{ VALUES ?x {{ {vals} }} ?x wdt:P571 ?s . ?x wdt:P576 ?e }}'):
        x = qid(val(b, 'x'))
        out.append({'n': FR_REGIMES[x], 'q': x, 't': 'régime', 's': day(val(b, 's')), 'e': day(val(b, 'e')), 'w': '', 'r': 1})
    out.sort(key=lambda r: r['s'])
    # un même régime peut avoir deux dates de début dans Wikidata : on garde la plus ancienne
    uniq = {}
    for r in out:
        uniq.setdefault((r['q'], r['t'], r['e']), r)
    return sorted(uniq.values(), key=lambda r: r['s'])


def heads_world():
    rows = sparql('''SELECT ?c ?iso ?p ?pLabel ?s ?e WHERE {
      ?c wdt:P299 ?iso ; p:P35 ?st . ?st ps:P35 ?p ; pq:P580 ?s . OPTIONAL { ?st pq:P582 ?e }
      FILTER NOT EXISTS { ?st wikibase:rank wikibase:DeprecatedRank }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en". } }''')
    fix = label_fix(rows)
    by = {}
    for b in rows:
        iso = str(int(val(b, 'iso'))) if val(b, 'iso').isdigit() else ''
        if not iso or iso == '250':
            continue
        p = qid(val(b, 'p')); n = val(b, 'pLabel'); n = fix.get(p, n) if re.fullmatch(r'Q\d+', n) else n
        by.setdefault(iso, {'c': qid(val(b, 'c')), 'h': []})['h'].append({'n': n, 'q': p, 's': day(val(b, 's')), 'e': day(val(b, 'e'))})
    for v in by.values():
        seen = set(); v['h'] = [h for h in sorted(v['h'], key=lambda h: h['s']) if not ((h['q'], h['s']) in seen or seen.add((h['q'], h['s'])))]
    return by


def prefets():
    rows = sparql('''SELECT ?code ?pos ?posLabel ?p ?pLabel ?s ?e WHERE {
      ?pos wdt:P279 wd:Q1285463 ; wdt:P1001 ?d . ?d wdt:P2586 ?code .
      ?st ps:P39 ?pos . ?p p:P39 ?st . ?st pq:P580 ?s . OPTIONAL { ?st pq:P582 ?e }
      FILTER NOT EXISTS { ?st wikibase:rank wikibase:DeprecatedRank }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en". } }''')
    fix = label_fix(rows)
    by = {}
    for b in rows:
        code = val(b, 'code').upper()
        if not re.fullmatch(r'\d\d|2[AB]|97\d', code):
            continue  # départements d'Algérie et anciens codes : écartés (le lieu de la base n'y a pas de code INSEE)
        p = qid(val(b, 'p')); n = val(b, 'pLabel'); n = fix.get(p, n) if re.fullmatch(r'Q\d+', n) else n
        d = by.setdefault(code, {'pos': {}, 'h': []})
        d['pos'][qid(val(b, 'pos'))] = val(b, 'posLabel')
        d['h'].append([n, p, day(val(b, 's')), day(val(b, 'e'))])
    for d in by.values():
        seen = set(); d['h'] = [h for h in sorted(d['h'], key=lambda h: h[2]) if not ((h[1], h[2]) in seen or seen.add((h[1], h[2])))]
        d['pos'] = [[k, v] for k, v in d['pos'].items()]
    return by


def eveques(atlas_names):
    dio = {}
    for b in sparql('''SELECT ?dio ?dioLabel ?inc ?end ?seat WHERE {
      ?dio wdt:P31/wdt:P279* wd:Q665487 ; wdt:P17 wd:Q142 .
      OPTIONAL { ?dio wdt:P571 ?inc } OPTIONAL { ?dio wdt:P576 ?end }
      OPTIONAL { ?dio wdt:P159|wdt:P36 ?sc . ?sc wdt:P374 ?seat }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "fr". } }'''):
        q = qid(val(b, 'dio'))
        d = dio.setdefault(q, {'q': q, 'n': val(b, 'dioLabel'), 'inc': '', 'end': '', 'seat': '', 'h': []})
        d['inc'] = min(filter(None, [d['inc'], day(val(b, 'inc'))]), default='')
        d['end'] = max(filter(None, [d['end'], day(val(b, 'end'))]), default='')
        d['seat'] = d['seat'] or val(b, 'seat')
    time.sleep(3)
    rows = sparql('''SELECT ?dio ?p ?pLabel ?t ?s ?e WHERE {
      ?dio wdt:P31/wdt:P279* wd:Q665487 ; wdt:P17 wd:Q142 .
      { ?p p:P39 ?st . ?st pq:P708 ?dio ; ps:P39 ?tp . VALUES ?tp { wd:Q1144278 wd:Q48629921 wd:Q29182 wd:Q611644 wd:Q135981985 } BIND(?tp AS ?t) }
      UNION
      { ?pos wdt:P1001 ?dio ; wdt:P279* ?cl . VALUES ?cl { wd:Q1144278 wd:Q48629921 wd:Q611644 wd:Q29182 } ?st ps:P39 ?pos . ?p p:P39 ?st . BIND(?pos AS ?t)
        FILTER NOT EXISTS { ?pos wdt:P279* wd:Q75178 } }
      ?st pq:P580 ?s . OPTIONAL { ?st pq:P582 ?e }
      FILTER NOT EXISTS { ?st wikibase:rank wikibase:DeprecatedRank }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en". } }''')
    fix = label_fix(rows)
    for b in rows:
        q = qid(val(b, 'dio'))
        if q not in dio:
            continue
        p = qid(val(b, 'p')); n = val(b, 'pLabel'); n = fix.get(p, n) if re.fullmatch(r'Q\d+', n) else n
        dio[q]['h'].append([n, p, day(val(b, 's')), day(val(b, 'e'))])
    for d in dio.values():
        seen = set(); d['h'] = [h for h in sorted(d['h'], key=lambda h: h[2]) if not ((h[1], h[2]) in seen or seen.add((h[1], h[2])))]
    dio = {k: v for k, v in dio.items() if v['h']}
    # diocèses de 1789 (atlas) → élément Wikidata, par le nom (« Tulle » ↔ « diocèse de Tulle », « ancien diocèse de Sarlat »…)
    def key(s):
        s = re.sub(r"^(ancien |archi)?(archi)?diocèse (de |d'|d’|du |des )", '', s.strip(), flags=re.I)
        return re.sub(r'[^a-z]', '', s.lower().translate(str.maketrans('àâäéèêëîïôöùûüç', 'aaaeeeeiioouuuc')))
    by_name = {}
    for d in dio.values():
        if d['inc'] and d['inc'][:4] > '1789':
            continue
        by_name.setdefault(key(d['n']), []).append(d['q'])
    a1789 = {}
    for n in atlas_names:
        hits = by_name.get(key(n), [])
        if hits:
            a1789[n] = max(hits, key=lambda q: len(dio[q]['h']))
    # après le Concordat (1822 : diocèses calés sur les départements) : les diocèses encore là, rangés par le département de leur siège
    by_dep = {}
    for d in dio.values():
        if d['end'] or not d['seat']:
            continue
        dep = d['seat'][:3] if d['seat'].startswith('97') else d['seat'][:2]
        by_dep.setdefault(dep, []).append(d['q'])
    return dio, a1789, by_dep


def maires(deps):
    out = {}
    for dep in deps:
        for _ in range(2):
            try:
                rows = sparql(f'''SELECT ?insee ?p ?pLabel ?s ?e WHERE {{
                  ?pos wdt:P279 wd:Q382617 ; wdt:P1001 ?c . ?c wdt:P374 ?insee . FILTER(STRSTARTS(?insee, "{dep}"))
                  ?st ps:P39 ?pos . ?p p:P39 ?st . ?st pq:P580 ?s . OPTIONAL {{ ?st pq:P582 ?e }}
                  FILTER NOT EXISTS {{ ?st wikibase:rank wikibase:DeprecatedRank }}
                  SERVICE wikibase:label {{ bd:serviceParam wikibase:language "fr,en". }} }}''')
                break
            except Exception as e:  # noqa: BLE001
                print('  maires', dep, e, file=sys.stderr); time.sleep(30); rows = None
        if rows is None:
            continue
        by = {}
        for b in rows:
            p = qid(val(b, 'p'))
            by.setdefault(val(b, 'insee'), []).append([val(b, 'pLabel'), p, day(val(b, 's')), day(val(b, 'e'))])
        for v in by.values():
            seen = set(); v[:] = [h for h in sorted(v, key=lambda h: h[2]) if not ((h[1], h[2]) in seen or seen.add((h[1], h[2])))]
        out[dep] = by
        print(f'  maires {dep} : {len(by)} communes, {sum(len(v) for v in by.values())} mandats', file=sys.stderr)
        time.sleep(2)
    return out


def write_gz(path, obj):
    raw = json.dumps(obj, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    with gzip.GzipFile(path, 'wb', mtime=0, compresslevel=9) as f:
        f.write(raw)
    return os.path.getsize(path)


def main():
    args = sys.argv[1:]
    atlas = args[args.index('--atlas') + 1] if '--atlas' in args else ''
    names = []
    if atlas:
        with open(os.path.join(atlas, 'donnees', 'lieux', 'lieux_1789.csv'), encoding='utf-8') as f:
            names = sorted({r['diocese'] for r in csv.DictReader(f) if r['diocese']})
    print('chefs de l’État (France)…', file=sys.stderr); fr = heads_france(); time.sleep(3)
    print('chefs de l’État (monde)…', file=sys.stderr); world = heads_world(); time.sleep(3)
    print('préfets…', file=sys.stderr); pf = prefets(); time.sleep(3)
    print('évêques…', file=sys.stderr); dio, a1789, by_dep = eveques(names)
    data = {'v': 1, 'built': TODAY, 'licence': 'CC0 1.0', 'source': 'Wikidata', 'source_url': 'https://www.wikidata.org/',
            'excluded': EXCLU, 'france': fr, 'world': world, 'prefets': pf, 'dioceses': dio, 'dioceses_1789': a1789, 'dioceses_dep': by_dep}
    n = write_gz(os.path.join(OUT, 'dp-pouvoir.json.gz'), data)
    print(f'dp-pouvoir.json.gz : {n} octets ; France {len(fr)}, pays {len(world)}, préfets {sum(len(d["h"]) for d in pf.values())} '
          f'({len(pf)} dép.), diocèses {len(dio)} ({sum(len(d["h"]) for d in dio.values())} évêques), 1789 rattachés {len(a1789)}/{len(names)}', file=sys.stderr)
    if '--sans-maires' in args:
        return
    deps = sorted(pf.keys())
    total = 0; idx = {}
    for dep, by in maires(deps).items():
        if not by:
            continue
        total += write_gz(os.path.join(OUT, f'dp-maires-{dep}.json.gz'), {'v': 1, 'dep': dep, 'licence': 'CC0 1.0', 'm': by})
        idx[dep] = [len(by), sum(len(v) for v in by.values())]
    with open(os.path.join(OUT, 'dp-maires-index.json'), 'w', encoding='utf-8') as f:
        json.dump({'v': 1, 'built': TODAY, 'licence': 'CC0 1.0', 'deps': idx}, f, ensure_ascii=False, separators=(',', ':'))
    print(f'maires : {len(idx)} départements, {total} octets', file=sys.stderr)


if __name__ == '__main__':
    main()
