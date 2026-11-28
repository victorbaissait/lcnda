#!/usr/bin/env python3
"""👒 La coiffe et le costume de sa région → assets/data/tr-coiffes.json.gz

Sources (téléchargées par ce script, réponses gardées dans TR_RAW) :
  - Wikimedia Commons : la catégorie « Traditional clothing of France » et ses sous-catégories par région (« Traditional clothing of
    Bretagne », « … of Normandy »…), leurs sous-catégories (coiffes et costumes nommés) et quelques photos de chacune, avec l'auteur
    et la licence de CHAQUE photo (extmetadata : Artist, LicenseShortName, LicenseUrl) — licence propre à chaque fichier ;
  - Wikidata (CC0 1.0) : l'élément de chaque catégorie (P301 sujet principal) → nom en français, description, image (P18),
    région d'origine (P2341 originaire de, P276, P131) ; la région → ses départements (P2586, régions des départements, ou nom),
    sinon son centre (P625) ;
  - Wikidata : les coiffes et costumes (sous-classes de vêtement Q11460, couvre-chef Q14952, costume traditionnel Q3172759)
    « originaires de » (P2341) un lieu de France autre que la France entière ou Paris.
Lancer : python3 build_coiffes.py
"""
import hashlib, re, urllib.parse
from tr_common import wm, qid, write, fold, DEP, DEP_BY_NAME, communes, reg2dep, wp, plain, TODAY

ROOT = 'Category:Traditional clothing of France'
SKIP = re.compile(r'\bin art\b|Guadeloupe|Guiana|Martinique|Réunion', re.I)
IMG = re.compile(r'\.(jpe?g|png|tiff?|webp)$', re.I)


def commons(params):
    return wp(params, host='commons.wikimedia.org', gap=2)


def members(cat, kind='subcat|file', limit=200):
    j = commons({'action': 'query', 'list': 'categorymembers', 'cmtitle': cat, 'cmlimit': str(limit), 'cmtype': kind})
    return [m['title'] for m in j.get('query', {}).get('categorymembers', [])]


def items_of_pages(titles):
    out = {}
    for i in range(0, len(titles), 50):
        j = commons({'action': 'query', 'prop': 'pageprops', 'ppprop': 'wikibase_item', 'titles': '|'.join(titles[i:i + 50])})
        for pg in j.get('query', {}).get('pages', []):
            q = pg.get('pageprops', {}).get('wikibase_item')
            if q: out[pg['title']] = q
    return out


def credits(files):
    out = {}
    for i in range(0, len(files), 50):
        j = commons({'action': 'query', 'prop': 'imageinfo', 'iiprop': 'extmetadata|size', 'iiextmetadatafilter': 'Artist|Credit|LicenseShortName|LicenseUrl|UsageTerms|DateTimeOriginal|ImageDescription',
                     'titles': '|'.join(files[i:i + 50])})
        for pg in j.get('query', {}).get('pages', []):
            ii = (pg.get('imageinfo') or [{}])[0]; md = ii.get('extmetadata', {})
            v = lambda k: plain(re.sub(r'<[^>]+>', ' ', str(md.get(k, {}).get('value', ''))))
            lic = v('LicenseShortName') or v('UsageTerms')
            if not lic: continue
            out[pg['title']] = {'a': v('Artist')[:120] or v('Credit')[:120], 'l': lic[:60], 'u': str(md.get('LicenseUrl', {}).get('value', '')), 'd': v('DateTimeOriginal')[:40]}
    return out


def main():
    C = communes(); R2D = reg2dep()
    RL = {}
    for r in wm.sparql('SELECT ?r ?l WHERE { VALUES ?r { ' + ' '.join('wd:' + q for q in sorted(R2D)) + ' } ?r rdfs:label ?l FILTER(lang(?l)="fr") }', 'races-regions', gap=1):
        RL.setdefault(fold(r['l']), qid(r['r']))
    regions = [c for c in members(ROOT, 'subcat', 500) if not SKIP.search(c)]
    print('régions :', len(regions), flush=True)
    sub, files = {}, {}
    for c in regions:
        m = members(c)
        sub[c] = [x for x in m if x.startswith('Category:') and not SKIP.search(x)]
        files[c] = [x for x in m if x.startswith('File:') and IMG.search(x)]
    for c in regions:  # un niveau de plus, seulement si la région a peu de photos (Commons limite fort les appels)
        if len(files[c]) >= 4: continue
        for s in sub[c][:3]:
            files[s] = [x for x in members(s, 'file', 30) if IMG.search(x)]
    cats = regions + [s for c in regions for s in sub[c]]
    P = items_of_pages(cats)
    E = wm.entities(sorted(set(P.values())), props='claims|labels', languages='fr|en')
    topic = {c: (wm.ids(E.get(P[c]), 'P301') or [None])[0] for c in cats if c in P}
    T = wm.entities(sorted({t for t in topic.values() if t}), props='claims|labels|descriptions', languages='fr')
    locs = sorted({l for t in T.values() for p in ('P2341', 'P276', 'P131') for l in wm.ids(t, p)} - set(T))
    T.update(wm.entities(locs, props='claims|labels', languages='fr') if locs else {})

    def where(q, depth=0):
        e = T.get(q) or {}
        ins = next((v for v in wm.claims(e, 'P374') if isinstance(v, str)), '')
        if ins and ins in C: return 'dep', [ins[:3] if ins.startswith('97') else ins[:2]], None
        code = next((v for v in wm.claims(e, 'P2586') if isinstance(v, str)), '')
        if code in DEP: return 'dep', [code], None
        if q in R2D and len(R2D[q]) <= 6: return 'region', sorted(R2D[q]), None
        lab = fold(wm.label(e, ('fr',)))
        if lab in RL and len(R2D[RL[lab]]) <= 6: return 'region', sorted(R2D[RL[lab]]), None
        if lab in DEP_BY_NAME: return 'dep', [DEP_BY_NAME[lab]], None
        if depth == 0:
            for p in (('P2341', 'P131') if not set(wm.ids(e, 'P31')) & {'Q36784', 'Q209495', 'Q1620908', 'Q3502482'} else ()):
                for l in wm.ids(e, p):
                    if l in ('Q142', 'Q90'): continue
                    r = where(l, 1)
                    if r[1] or r[2]: return r
        co = next((x for x in wm.claims(e, 'P625') if isinstance(x, dict)), None)
        if co: return 'province', [], (round(co['latitude'], 3), round(co['longitude'], 3))
        return '', [], None

    def name_of(c):
        t = topic.get(c)
        n = wm.label(T.get(t), ('fr',)) if t else ''
        return n or ''
    def img_of(c):
        t = topic.get(c)
        return next((x for x in wm.claims(T.get(t), 'P18') if isinstance(x, str)), '') if t else ''

    # les catégories sans élément Wikidata : le nom anglais de la région (« Alsace », « Basque Country »…) → un lieu de France sur
    # Wikidata (libellé anglais exact) ; on préfère une région, puis un département, puis une commune, puis un lieu avec un centre
    names = sorted({re.sub(r'^Category:Traditional cloth(?:ing|es) of ', '', c) for c in regions})
    NQ = {}
    cand = wm.sparql('SELECT ?i ?l ?code ?ins ?co WHERE { VALUES ?l { ' + ' '.join('"' + n.replace('"', '') + '"@en' for n in names) + ' } ?i rdfs:label ?l ; wdt:P17 wd:Q142 . '
                     'OPTIONAL { ?i wdt:P2586 ?code } OPTIONAL { ?i wdt:P374 ?ins } OPTIONAL { ?i wdt:P625 ?co } }', 'coiffes-names-' + hashlib.sha1(' '.join(names).encode()).hexdigest()[:10], gap=1)
    ids = sorted({qid(r['i']) for r in cand})
    TY = {}
    for r in wm.sparql('SELECT ?i ?l ?t ?tl WHERE { VALUES ?i { ' + ' '.join('wd:' + i for i in ids) + ' } ?i rdfs:label ?l FILTER(lang(?l)="en") ?i wdt:P31 ?t . ?t rdfs:label ?tl FILTER(lang(?tl)="fr") }', 'coiffes-cand-types', gap=1):
        TY.setdefault(qid(r['i']), set()).add(qid(r['t']))
    # une région, une province, un département, une région naturelle ou culturelle ; une commune seulement s'il n'y a rien d'autre
    AREA = {'Q36784', 'Q209495', 'Q1620908', 'Q3502482', 'Q6465', 'Q572995', 'Q22923920', 'Q1151616', 'Q1149061'}
    TOWN = {'Q484170', 'Q1549591'}
    for r in cand:
        q = qid(r['i']); ty = TY.get(q, set())
        rank = 0 if ty & AREA else 1 if ty & TOWN else 9
        if rank < 9 and (r['l'] not in NQ or (rank, int(q[1:])) < (NQ[r['l']][0], int(NQ[r['l']][1][1:]))): NQ[r['l']] = (rank, q)
    more = sorted({q for _, q in NQ.values()} - set(T))
    if more: T.update(wm.entities(more, props='claims|labels|descriptions', languages='fr'))

    rows, want = [], []
    for c in regions:
        en = re.sub(r'^Category:Traditional cloth(?:ing|es) of ', '', c)
        t = topic.get(c) or (NQ.get(en) or (0, None))[1]
        lvl, deps, pt = where(t) if t else ('', [], None)
        orig = [o for o in (wm.ids(T.get(t), 'P2341') if t else []) if wm.claims(T.get(o), 'P625')]  # un costume « originaire de » : le nom de la région (un lieu, pas un peuple)
        region_name = wm.label(T.get(orig[0]), ('fr',)) if orig and T.get(orig[0]) else (wm.label(T.get(t), ('fr',)) if t else '')
        region_name = region_name or en
        if not deps and not pt:
            # le nom de la région écrit dans la catégorie (« Traditional clothing of Normandy ») : département ou région de ce nom
            n = fold(region_name)
            if n in RL: lvl, deps = 'region', sorted(R2D[RL[n]])
            elif n in DEP_BY_NAME: lvl, deps = 'dep', [DEP_BY_NAME[n]]
        items = []
        for s in sub[c]:
            n = name_of(s)
            if not n: continue  # pas d'élément Wikidata en français : on ne montre pas un nom anglais
            if not re.search(r'coiffe|costume|bonnet|chapeau|béret|tablier|gilet|robe|châle|sabot|habit|jupe|vêtement|veste|kabig|bragou|cape|capuche|dentelle|fichu|marmotte|cornette', n, re.I): continue
            tq = topic.get(s); d = (T.get(tq) or {}).get('descriptions', {}).get('fr', {})
            it = {'n': n, 'q': tq, 'cat': s[9:]}
            if isinstance(d, dict) and d.get('value'): it['d'] = d['value'][:140]
            im = img_of(s) or next(iter(files.get(s, [])), '')
            if im: it['img'] = re.sub(r'^File:', '', im); want.append('File:' + it['img'])
            items.append(it)
        photos = [f for f in files.get(c, [])][:6]
        if len(photos) < 4:
            for s in sub[c]:
                photos += [f for f in files.get(s, [])[:2] if f not in photos]
                if len(photos) >= 6: break
        want += photos
        row = {'r': region_name, 'cat': c[9:], 'q': t or '', 'lvl': lvl, 'items': items, 'photos': [p[5:] for p in photos[:6]]}
        if deps: row['deps'] = deps
        if pt: row['lat'], row['lon'] = pt
        rows.append(row)
    # les coiffes et costumes de Wikidata « originaires de » (P2341) un lieu de France précis (pas la France entière, pas Paris)
    cand = wm.sparql('SELECT ?i ?t ?loc WHERE { ?i wdt:P2341 ?loc . ?loc wdt:P17 wd:Q142 . ?i wdt:P31|wdt:P279 ?t . }', 'coiffes-p2341', gap=1)
    tys = sorted({qid(r['t']) for r in cand}, key=lambda x: int(x[1:]))
    ok = set()
    for i in range(0, len(tys), 700):
        part = tys[i:i + 700]
        ok |= {qid(r['t']) for r in wm.sparql('SELECT DISTINCT ?t WHERE { VALUES ?t { ' + ' '.join('wd:' + x for x in part) + ' } VALUES ?r { wd:Q11460 wd:Q14952 wd:Q3172759 } ?t wdt:P279* ?r . }', 'cloth-' + hashlib.sha1(' '.join(part).encode()).hexdigest()[:12], gap=5)}
    W = {}
    for r in cand:
        if qid(r['t']) in ok and qid(r['loc']) not in ('Q142', 'Q90'): W.setdefault(qid(r['i']), set()).add(qid(r['loc']))
    W = {k: v for k, v in W.items() if k not in {it.get('q') for r in rows for it in r['items']}}
    WE = wm.entities(sorted(W) + sorted({l for v in W.values() for l in v} - set(T)), props='claims|labels|descriptions', languages='fr')
    T.update(WE)
    for q, locs in W.items():
        e = T.get(q) or {}; n = wm.label(e, ('fr',))
        if not n: continue
        loc = sorted(locs)[0]; lvl, deps, pt = where(loc)
        if not deps and not (pt and 41 < pt[0] < 51.5 and -5.5 < pt[1] < 10): continue  # la France d'Europe, ou un département connu
        d = e.get('descriptions', {}).get('fr', {})
        it = {'n': n, 'q': q, 'cat': next((c for c in wm.claims(e, 'P373') if isinstance(c, str)), '')}
        if isinstance(d, dict) and d.get('value'): it['d'] = d['value'][:140]
        im = next((x for x in wm.claims(e, 'P18') if isinstance(x, str)), '')
        if im: it['img'] = im; want.append('File:' + im)
        row = {'r': wm.label(T.get(loc), ('fr',)) or n, 'cat': it['cat'] and 'Category:' + it['cat'] or '', 'q': loc, 'lvl': lvl, 'items': [it], 'photos': []}
        row['cat'] = row['cat'][9:] if row['cat'] else ''
        if deps: row['deps'] = deps
        if pt: row['lat'], row['lon'] = pt
        rows.append(row)
        print('  Wikidata :', n, '→', row['r'], deps or pt, flush=True)
    merged = {}  # « Normandy » et « Normandie » : une seule région
    for r in rows:
        k = fold(r['r'])
        if k in merged:
            m = merged[k]; m['photos'] += [p for p in r['photos'] if p not in m['photos']]; m['items'] += [i for i in r['items'] if i['n'] not in [x['n'] for x in m['items']]]
        else: merged[k] = r
    rows = list(merged.values())
    for r in rows: r['photos'] = r['photos'][:8]
    CR = credits(sorted(set(want)))
    for r in rows:
        r['photos'] = [{'f': f, **CR['File:' + f]} for f in r['photos'] if 'File:' + f in CR]
        for it in r['items']:
            if it.get('img') and 'File:' + it['img'] in CR: it['cr'] = CR['File:' + it['img']]
            elif it.get('img'): del it['img']
    for r in rows:
        if not ((r.get('deps') or r.get('lat') is not None) and (r['items'] or r['photos'])): print('  écartée :', r['r'], r['cat'], r['q'], r['lvl'], len(r['items']), len(r['photos']), flush=True)
    rows = [r for r in rows if (r.get('deps') or r.get('lat') is not None) and (r['items'] or r['photos'])]
    rows.sort(key=lambda r: fold(r['r']))
    print('régions gardées :', len(rows), '· coiffes et costumes nommés :', sum(len(r['items']) for r in rows), '· photos :', sum(len(r['photos']) for r in rows), flush=True)
    for r in rows: print('  ', r['r'], r.get('deps') or (r.get('lat'), r.get('lon')), [i['n'] for i in r['items']][:8])
    write('coiffes', {'v': 1, 'built': TODAY,
                      'attr': 'Wikimedia Commons, catégorie « Traditional clothing of France » et ses sous-catégories (photos : auteur et licence de chaque fichier) ; noms, descriptions, régions : Wikidata',
                      'licence': 'licence propre à chaque photo (Wikimedia Commons) ; CC0 1.0 (Wikidata)', 'url': 'https://commons.wikimedia.org/wiki/' + ROOT.replace(' ', '_'), 'rows': rows})


if __name__ == '__main__':
    main()
