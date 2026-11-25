#!/usr/bin/env python3
"""🏫 Les écoles et collèges de sa ville → assets/data/tr-ecoles.json.gz

Source : Wikidata (CC0 1.0), query.wikidata.org — les établissements d'enseignement (P31 = une sous-classe, à toute profondeur,
d'« institution de formation » Q2385804 : écoles, collèges, lycées, écoles normales, séminaires, universités…) situés dans une
commune de France (P131 → commune P374 code INSEE, ou un niveau plus bas : arrondissement, quartier), avec leur date de
fondation (P571), leur fin (P576), leur image (P18), leur article de Wikipédia en français.
On garde les « écoles d'autrefois » : celles qui ont un article de Wikipédia, une image, une date de fondation avant 1950, ou
qui ne sont pas un simple établissement d'aujourd'hui (sans code UAI P3202). Les dizaines de milliers d'écoles d'aujourd'hui
importées du répertoire de l'Éducation nationale (code UAI, date d'ouverture administrative) ne sont pas gardées.
Lancer : python3 build_ecoles.py
"""
import hashlib, re, urllib.parse
from tr_common import wm, qid, write, fold, communes, TODAY

KINDS = [('seminaire', r'séminaire'), ('normale', r'école normale'), ('universite', r'universit|faculté|institut catholique'),
         ('lycee', r'lycée|cité scolaire'), ('college', r'collège'), ('primaire', r'école primaire|école maternelle|école élémentaire|école communale|école de village|groupe scolaire'),
         ('superieur', r'grande école|école d.ingénieur|école nationale|école supérieure|enseignement supérieur|conservatoire|académie|école des beaux-arts|polytechni|institut'),
         ('religieux', r'catholique|congrégation|petit séminaire|maîtrise|abbaye|jésuite|frères'), ('ecole', r'.')]
KIND_LABEL = {'seminaire': 'Séminaire', 'normale': 'École normale', 'universite': 'Université ou faculté', 'lycee': 'Lycée', 'college': 'Collège',
              'primaire': 'École primaire', 'superieur': 'École supérieure', 'religieux': 'Établissement religieux', 'ecole': 'Autre école'}


def main():
    C = communes()
    classes = sorted({qid(r['t']) for r in wm.sparql('SELECT DISTINCT ?t WHERE { ?t wdt:P279* wd:Q2385804 . }', 'ecoles-classes', gap=1)}, key=lambda x: int(x[1:]))
    CL = set(classes) | {'Q20860083', 'Q1244442', 'Q48747650', 'Q3591580', 'Q108037689'}  # établissement scolaire (code UAI), bâtiment scolaire, cité scolaire, EPLE, lycée-collège : hors de l'arbre de Q2385804
    S = {}
    deps = sorted({i[:3] if i.startswith('97') else i[:2] for i in C})
    for dep in deps:  # département par département (une seule grosse requête dépasse le temps permis)
        for hop in ('a', 'b'):
            path = 'wdt:P131' if hop == 'a' else 'wdt:P131/wdt:P131'
            q = ('SELECT ?s ?t ?insee WHERE { ?c wdt:P374 ?insee . FILTER(STRSTARTS(?insee, "' + dep + '")) ?s ' + path + ' ?c . ?s wdt:P31 ?t . }')
            for r in wm.sparql(q, 'ecoles-dep-' + hop + '-' + dep, gap=4):
                t = qid(r['t'])
                if t not in CL or r['insee'] not in C: continue
                o = S.setdefault(qid(r['s']), {'t': set(), 'insee': ''})
                o['t'].add(t)
                if not o['insee']: o['insee'] = r['insee']  # la commune directe d'abord (premier passage)
        print(' ', dep, len(S), flush=True)
    S = {k: v for k, v in S.items() if v['insee']}
    print('établissements dans une commune :', len(S), flush=True)
    ids = sorted(S, key=lambda x: int(x[1:]))
    M = {}
    for i in range(0, len(ids), 2000):
        part = ids[i:i + 2000]
        q = ('SELECT ?s ?l ?inc ?end ?img ?wp ?uai WHERE { VALUES ?s { ' + ' '.join('wd:' + x for x in part) + ' } '
             'OPTIONAL { ?s rdfs:label ?l FILTER(lang(?l)="fr") } OPTIONAL { ?s wdt:P571 ?inc } OPTIONAL { ?s wdt:P576 ?end } OPTIONAL { ?s wdt:P18 ?img } '
             'OPTIONAL { ?s wdt:P3202 ?uai } OPTIONAL { ?wp schema:about ?s ; schema:isPartOf <https://fr.wikipedia.org/> } }')
        for r in wm.sparql(q, 'ecoles-meta-' + hashlib.sha1(' '.join(part).encode()).hexdigest()[:12], gap=5):
            o = M.setdefault(qid(r['s']), {'l': '', 'inc': None, 'end': None, 'img': '', 'wp': '', 'uai': False})
            o['l'] = o['l'] or r.get('l', '')
            y = lambda v: (int(m.group(1)) if (m := re.match(r'^\+?(\d{4})-', v or '')) else None)  # années après J.-C. seulement
            for k, src in (('inc', 'inc'), ('end', 'end')):
                v = y(r.get(src, ''))
                if v is not None and (o[k] is None or v < o[k]): o[k] = v
            if r.get('img') and not o['img']: o['img'] = urllib.parse.unquote(re.sub(r'^.*Special:FilePath/', '', r['img']))
            if r.get('wp') and not o['wp']: o['wp'] = urllib.parse.unquote(r['wp'].rsplit('/wiki/', 1)[1]).replace('_', ' ')
            if r.get('uai'): o['uai'] = True
    TL = {}
    tys = sorted({t for v in S.values() for t in v['t']}, key=lambda x: int(x[1:]))
    for i in range(0, len(tys), 1500):
        part = tys[i:i + 1500]
        for r in wm.sparql('SELECT ?t ?l WHERE { VALUES ?t { ' + ' '.join('wd:' + x for x in part) + ' } ?t rdfs:label ?l FILTER(lang(?l)="fr") }', 'ecoles-tl-' + hashlib.sha1(' '.join(part).encode()).hexdigest()[:12], gap=5):
            TL[qid(r['t'])] = r['l']
    out = []
    for s, v in S.items():
        m = M.get(s) or {}
        name = m.get('l', '')
        if not name or re.match(r'^Q\d+$', name): continue
        old = (m.get('inc') or 9999) < 1950 or (m.get('end') or 9999) < 1990
        if not (m.get('wp') or m.get('img') or old or not m.get('uai')): continue
        tl = ' | '.join(TL.get(t, '') for t in sorted(v['t'])).lower() + ' | ' + name.lower()
        kind = next(k for k, rx in KINDS if re.search(rx, tl))
        row = {'q': s, 'n': name, 'k': kind, 'i': v['insee']}
        if m.get('inc') is not None: row['y'] = m['inc']
        if m.get('end') is not None: row['e'] = m['end']
        if m.get('img'): row['img'] = m['img']
        if m.get('wp'): row['wp'] = m['wp']
        t1 = next((TL[t] for t in sorted(v['t']) if TL.get(t)), '')
        if t1: row['t'] = t1
        out.append(row)
    out.sort(key=lambda r: (r['i'], r.get('y') or 9999, fold(r['n'])))
    by = {}
    for r in out: by[r['k']] = by.get(r['k'], 0) + 1
    print('gardés :', len(out), by, '· avec date :', sum(1 for r in out if 'y' in r), '· avec image :', sum(1 for r in out if 'img' in r), flush=True)
    write('ecoles', {'v': 1, 'built': TODAY, 'kinds': KIND_LABEL,
                     'attr': 'Wikidata : établissements d’enseignement (sous-classes de Q2385804) situés dans une commune de France (P131, P374), fondation P571, fin P576, image P18',
                     'licence': 'CC0 1.0', 'url': 'https://www.wikidata.org/', 'rows': out})


if __name__ == '__main__':
    main()
