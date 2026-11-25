#!/usr/bin/env python3
"""🖼️ 🛠️ 😇 Son métier en images, ses outils, son saint patron — d'après Wikidata (CC0) et Wikimedia Commons.

1. Chaque métier du dictionnaire de l'app (assets/data/metiers-anciens.json : nom, féminin, variantes) est relié à un
   métier de Wikidata (libellé ou alias français identique, élément « occupation » Q12737077 par P31/P279*).
2. Pour ces métiers : outils (P2283 « utilise »), saint patron (P417) et sa fête (P841), catégorie Commons (P373),
   œuvres qui le représentent (P180 « dépeint ») avec une image (P18), faites avant 1926 ou dont l'auteur est mort
   avant 1956 (domaine public), auteur et licence de chaque image lus sur Commons (seules les licences libres restent).
Les images ne sont pas livrées : l'app affiche la vignette depuis Commons, avec l'auteur, la licence et le lien.

Usage : L8_CACHE=<dossier> python3 -I build_metiers.py   → assets/data/l8a-metiers.json.gz
"""
import json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import l8common as C

TR = json.load(open(os.path.join(C.ROOT, 'assets', 'data', 'metiers-anciens.json')))
OCC = 'wd:Q12737077'


def lab_base(s):
    return re.sub(r'\s+ou\s+.*$', '', s.strip().lower())


def esc(s):
    return s.replace('\\', '\\\\').replace('"', '\\"')


def main():
    # 1. métiers de l'app → libellés
    labels = {}
    for t in TR['trades']:
        for rank, n in enumerate([t['name'], t.get('fem')] + (t.get('variants') or [])):
            if not n: continue
            l = n.strip().lower()
            if len(l) < 3: continue
            labels.setdefault(l, []).append((t['key'], 0 if rank == 0 else 1))
        if t.get('fem'):  # libellés neutres de Wikidata : « forgeron ou forgeronne »
            labels.setdefault(f"{t['name'].strip().lower()} ou {t['fem'].strip().lower()}", []).append((t['key'], 0))
    keys = sorted(labels)
    cands = []
    for i in range(0, len(keys), 80):
        part = keys[i:i + 80]
        vals = ' '.join(f'"{esc(k)}"@fr' for k in part)
        cands += C.sparql(f'''SELECT ?i ?l ?sl ?how ?c WHERE {{ VALUES ?l {{ {vals} }}
            {{ ?i rdfs:label ?l . BIND("label" AS ?how) }}
            UNION {{ ?i skos:altLabel ?l . BIND("alias" AS ?how) }}
            ?i wdt:P31 ?c ; wikibase:sitelinks ?sl }}''')
        print(f'… {i + len(part)}/{len(keys)} libellés, {len(cands)} candidats', flush=True)
    # les classes des candidats qui sont des métiers (sous-classes de « occupation », Q12737077)
    classes = sorted({C.qid(r['c']) for r in cands})
    occ_cls = {'Q12737077', 'Q28640'}
    for i in range(0, len(classes), 150):
        part = classes[i:i + 150]
        for r in C.sparql(f'''SELECT ?c WHERE {{ VALUES ?c {{ {' '.join('wd:' + q for q in part)} }} ?c wdt:P279+ {OCC} }}'''):
            occ_cls.add(C.qid(r['c']))
    print(f'… {len(classes)} classes, {len(occ_cls)} sont des métiers', flush=True)
    found = {}
    for r in cands:
        if C.qid(r['c']) not in occ_cls: continue
        for key, rank in labels.get(r['l'], []):
            score = (2 if r['how'] == 'label' else 0) + (1 if rank == 0 else 0)
            cand = (score, int(r['sl']), C.qid(r['i']))
            if key not in found or cand > found[key]: found[key] = cand
    print(f'… {len(found)} métiers reliés', flush=True)
    qids = sorted({v[2] for v in found.values()})
    vals = lambda qs: ' '.join('wd:' + q for q in qs)
    occ = {q: {'tools': [], 'saints': [], 'art': []} for q in qids}
    # 2. libellé, catégorie Commons, article
    for i in range(0, len(qids), 150):
        part = qids[i:i + 150]
        for r in C.sparql(f'''SELECT ?o ?ol ?cat ?wp WHERE {{ VALUES ?o {{ {vals(part)} }}
            OPTIONAL {{ ?o rdfs:label ?ol FILTER(lang(?ol)="fr") }} OPTIONAL {{ ?o wdt:P373 ?cat }}
            OPTIONAL {{ ?wp schema:about ?o ; schema:isPartOf <https://fr.wikipedia.org/> }} }}'''):
            o = occ[C.qid(r['o'])]
            o['label'] = r.get('ol', ''); o['cat'] = r.get('cat', ''); o['wp'] = r.get('wp', '')
        # outils
        for r in C.sparql(f'''SELECT ?o ?t ?tl ?img WHERE {{ VALUES ?o {{ {vals(part)} }} ?o wdt:P2283 ?t .
            ?t rdfs:label ?tl FILTER(lang(?tl)="fr") OPTIONAL {{ ?t wdt:P18 ?img }} }}'''):
            o = occ[C.qid(r['o'])]; t = C.qid(r['t'])
            if not any(x['q'] == t for x in o['tools']):
                o['tools'].append({'q': t, 'n': r['tl'], 'img': r['img'].rsplit('/', 1)[-1] if r.get('img') else ''})
        # saints patrons
        for r in C.sparql(f'''SELECT ?o ?s ?sl ?fd ?fdl ?wp WHERE {{ VALUES ?o {{ {vals(part)} }} ?o wdt:P417 ?s .
            ?s rdfs:label ?sl FILTER(lang(?sl)="fr")
            OPTIONAL {{ ?s wdt:P841 ?fd . ?fd rdfs:label ?fdl FILTER(lang(?fdl)="fr") }}
            OPTIONAL {{ ?wp schema:about ?s ; schema:isPartOf <https://fr.wikipedia.org/> }} }}'''):
            o = occ[C.qid(r['o'])]; s = C.qid(r['s'])
            cur = next((x for x in o['saints'] if x['q'] == s), None)
            if not cur: cur = {'q': s, 'n': r['sl'], 'feasts': [], 'wp': r.get('wp', '')}; o['saints'].append(cur)
            if r.get('fdl') and r['fdl'] not in cur['feasts']: cur['feasts'].append(r['fdl'])
        print(f'… {i + len(part)}/{len(qids)} métiers lus', flush=True)
    # 3. œuvres qui représentent ces métiers
    for i in range(0, len(qids), 40):
        part = qids[i:i + 40]
        rows = C.sparql(f'''SELECT ?o ?w ?wl ?img ?inc ?cr ?crl ?death ?sl WHERE {{ VALUES ?o {{ {vals(part)} }} ?w wdt:P180 ?o ; wdt:P18 ?img .
            OPTIONAL {{ ?w wdt:P571 ?inc }} OPTIONAL {{ ?w wdt:P170 ?cr . OPTIONAL {{ ?cr wdt:P570 ?death }} OPTIONAL {{ ?cr rdfs:label ?crl FILTER(lang(?crl)="fr") }} }}
            OPTIONAL {{ ?w rdfs:label ?wl FILTER(lang(?wl)="fr") }} ?w wikibase:sitelinks ?sl }}''')
        for r in rows:
            o = occ[C.qid(r['o'])]
            y = int(r['inc'][:5].lstrip('+')) if r.get('inc') and re.match(r'^[+-]?\d{4}', r['inc']) else None
            dy = int(r['death'][:5].lstrip('+')) if r.get('death') and re.match(r'^[+-]?\d{4}', r['death']) else None
            if not ((y is not None and y <= 1925) or (dy is not None and dy <= 1955)): continue
            w = C.qid(r['w'])
            if any(x['q'] == w for x in o['art']): continue
            o['art'].append({'q': w, 'n': r.get('wl', ''), 'img': r['img'].rsplit('/', 1)[-1], 'y': y, 'by': r.get('crl', ''), 'sl': int(r['sl'])})
        print(f'… œuvres {i + len(part)}/{len(qids)}', flush=True)
    # 4. auteur et licence de chaque image (Commons) ; on garde 8 œuvres par métier, les plus connues
    for o in occ.values():
        o['art'].sort(key=lambda a: (-a['sl'], a['y'] or 9999))
        o['art'] = o['art'][:14]
    import urllib.parse
    files = [urllib.parse.unquote(a['img']).replace('_', ' ') for o in occ.values() for a in o['art']] + [urllib.parse.unquote(t['img']).replace('_', ' ') for o in occ.values() for t in o['tools'] if t['img']]
    info = C.commons_info(files)
    dropped = 0
    for o in occ.values():
        keep = []
        for a in o['art']:
            f = urllib.parse.unquote(a['img']).replace('_', ' ')
            m = info.get(f)
            if not m or not C.is_free(m['lic']): dropped += 1; continue
            keep.append({**a, 'img': f, 'thumb': m['thumb'], 'page': m['page'], 'artist': m['artist'] or a['by'], 'lic': m['lic'], 'lic_url': m['lic_url']})
        o['art'] = keep[:8]
        for t in o['tools']:
            if not t['img']: continue
            f = urllib.parse.unquote(t['img']).replace('_', ' ')
            m = info.get(f)
            if m and C.is_free(m['lic']): t.update({'img': f, 'thumb': m['thumb'], 'page': m['page'], 'artist': m['artist'], 'lic': m['lic'], 'lic_url': m['lic_url']})
            else: t['img'] = ''
    trades = {k: v[2] for k, v in sorted(found.items())}
    used = set(trades.values())
    data = {'title': 'Son métier : images, outils, saint patron', 'version': 1, 'built': __import__('datetime').date.today().isoformat(),
            'source': 'Wikidata (CC0) ; images : Wikimedia Commons (auteur et licence sous chaque image)', 'url': 'https://www.wikidata.org/',
            'licence': 'CC0 (Wikidata) ; licence propre à chaque image (Commons)',
            'note': 'Métiers de l’app reliés à Wikidata par leur nom français (libellé ou alias). Œuvres : P180 « dépeint », faites avant 1926 ou d’un auteur mort avant 1956, licence libre sur Commons.',
            'trades': trades, 'occ': {q: o for q, o in occ.items() if q in used}}
    n = lambda k: sum(1 for o in data['occ'].values() if o[k])
    print(f"métiers reliés {len(trades)}/{len(TR['trades'])} ; éléments {len(data['occ'])} ; avec outils {n('tools')}, saints {n('saints')}, œuvres {n('art')} ; images non libres écartées {dropped}")
    C.write('l8a-metiers.json.gz', data)


if __name__ == '__main__':
    main()
