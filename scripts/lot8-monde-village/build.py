#!/usr/bin/env python3
"""🎭⚽🚲🎡🎂👑⛪🐄 Lot 8 « Le monde du village » : fabrique les données livrées avec l'app (assets/data/l8c-*.json.gz).

Sources (toutes ouvertes, téléchargées au moment de la fabrication ; chaque ligne garde son lien) :
  - Wikidata (CC0 1.0), par le service SPARQL query.wikidata.org et l'API www.wikidata.org :
      l8c-spectacles   œuvres avec « date de première représentation » (P1191) et « lieu de la première » (P4647), ≥ 4 Wikipédias
      l8c-clubs        clubs sportifs de France (P31/P279* Q847017) avec date de fondation (P571) et commune (P159 / P131 → code INSEE P374)
      l8c-tour         étapes du Tour de France (éditions Q33881, « comprend » P527 ; départ P1427, arrivée P1444)
      l8c-seigneurs    titres de noblesse (P97) avec le lieu du titre (qualificatif P1001 / P276, ou P1001 du titre lui-même)
      l8c-eglises      églises, chapelles, abbayes… disparues : état de conservation (P5816) « démoli ou détruit » / « partiellement
                       détruit », ou date de dissolution / destruction (P576)
      l8c-foires       foires (Q288514 et sous-classes) avec un lieu ; + les articles de la catégorie « Foire en France » de Wikipédia
      l8c-dates        les jours exacts des événements de « Le monde autour » (assets/data/monde-autour.json) : l'article de Wikipédia
                       de chaque événement → son élément Wikidata → P585 / P580 / P582 / P571 à la précision du jour
  - Wikipédia en français (CC BY-SA 4.0, « Contributeurs de Wikipédia »), API fr.wikipedia.org :
      l8c-expos        les Expositions universelles et internationales de France (liste choisie ci-dessous) : la phrase exacte de
                       l'article pour les visiteurs et pour ce qu'on y a vu (tour Eiffel, trottoir roulant…)
      l8c-foires       la première phrase de l'article de chaque foire
  - les communes : assets/data/cc-communes.json.gz (IGN / Etalab, Licence Ouverte 2.0), déjà livré avec l'app.

Lancer :  python3 scripts/lot8-monde-village/build.py [dossier de sortie]      (L8C_RAW = dossier du cache des réponses)
Relancer ne refait pas les appels déjà faits (cache). Essai : tests/test-lot8-monde-village.js
"""
import gzip, hashlib, json, os, re, sys, time, urllib.parse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'assets', 'data')
TODAY = time.strftime('%Y-%m-%d')
C = json.loads(gzip.open(os.path.join(ROOT, 'assets', 'data', 'cc-communes.json.gz')).read())['c']   # insee → [nom, lat, lon]
WD = {'source': 'Wikidata', 'licence': 'CC0 1.0', 'licence_url': 'https://creativecommons.org/publicdomain/zero/1.0/deed.fr', 'url': 'https://www.wikidata.org', 'built': TODAY}
WP = {'source': 'Wikipédia (fr)', 'licence': 'CC BY-SA 4.0', 'licence_url': 'https://creativecommons.org/licenses/by-sa/4.0/deed.fr', 'mention': 'Contributeurs de Wikipédia', 'url': 'https://fr.wikipedia.org', 'built': TODAY}

qid = lambda u: (u or '').rsplit('/', 1)[-1]
def year(t):
    m = re.match(r'^(-?)(\d{1,4})-', (t or '').lstrip('+'))
    return (-int(m.group(2)) if m.group(1) else int(m.group(2))) if m else None
def day(t, prec='11'):
    m = re.match(r'^\+?(\d{4})-(\d\d)-(\d\d)', t or '')
    if not m: return ''
    p = int(prec or 9)
    return m.group(0).lstrip('+') if p >= 11 else (f'{m.group(1)}-{m.group(2)}' if p == 10 else '')
def point(s):
    m = re.match(r'Point\(([-\d.eE]+) ([-\d.eE]+)\)', s or '')
    return (round(float(m.group(2)), 5), round(float(m.group(1)), 5)) if m else (None, None)
def wptitle(u): return urllib.parse.unquote(u.rsplit('/wiki/', 1)[1]).replace('_', ' ') if u and '/wiki/' in u else ''
def sparql(q, tag): return wm.sparql(q, 'l8c-' + tag + '-' + hashlib.sha1(q.encode()).hexdigest()[:10])
def save(name, obj):
    os.makedirs(OUT, exist_ok=True)
    p = os.path.join(OUT, f'l8c-{name}.json.gz')
    raw = json.dumps(obj, ensure_ascii=False, separators=(',', ':')).encode()
    with gzip.GzipFile(p, 'wb', mtime=0, compresslevel=9) as f: f.write(raw)
    print(f'{name}: {len(obj.get("rows", []))} lignes, {os.path.getsize(p)} octets')
def table(fields, rows): return {'fields': fields, 'rows': [[r.get(k) for k in fields] for r in rows]}
def wpapi(params):
    return json.loads(wm.get('https://fr.wikipedia.org/w/api.php?' + urllib.parse.urlencode({**params, 'format': 'json', 'formatversion': '2'}), gap=1.0))

# pays (lieux des premières) : on garde l'Europe, l'Amérique du Nord (Metropolitan Opera…) étant hors sujet pour la vie d'un ancêtre
EUROPE = {'Q142': 'France', 'Q38': 'Italie', 'Q183': 'Allemagne', 'Q40': 'Autriche', 'Q145': 'Royaume-Uni', 'Q29': 'Espagne', 'Q31': 'Belgique',
          'Q55': 'Pays-Bas', 'Q39': 'Suisse', 'Q159': 'Russie', 'Q34': 'Suède', 'Q35': 'Danemark', 'Q20': 'Norvège', 'Q33': 'Finlande', 'Q36': 'Pologne',
          'Q213': 'Tchéquie', 'Q28': 'Hongrie', 'Q45': 'Portugal', 'Q27': 'Irlande', 'Q32': 'Luxembourg', 'Q235': 'Monaco', 'Q41': 'Grèce',
          'Q218': 'Roumanie', 'Q219': 'Bulgarie', 'Q224': 'Croatie', 'Q403': 'Serbie', 'Q212': 'Ukraine', 'Q214': 'Slovaquie', 'Q215': 'Slovénie',
          'Q211': 'Lettonie', 'Q37': 'Lituanie', 'Q191': 'Estonie', 'Q34266': 'Empire russe', 'Q131964': 'Empire d’Autriche', 'Q28513': 'Autriche-Hongrie',
          'Q43287': 'Empire allemand', 'Q27306': 'Prusse', 'Q174193': 'Royaume-Uni', 'Q161885': 'Grande-Bretagne', 'Q172579': 'Royaume d’Italie',
          'Q70972': 'Royaume de France', 'Q58296': 'Pays-Bas', 'Q12560': 'Empire ottoman', 'Q153529': 'Royaume de Bavière', 'Q154195': 'Royaume de Saxe',
          'Q71084': 'Second Empire', 'Q69829': 'Troisième République', 'Q58186': 'Premier Empire', 'Q207162': 'Restauration', 'Q215530': 'Monarchie de Juillet',
          'Q153015': 'Saxe', 'Q980': 'Bavière', 'Q252580': 'Royaume des Deux-Siciles', 'Q154849': 'Empire autrichien'}
FRANCE_Q = {'Q142', 'Q70972', 'Q71084', 'Q69829', 'Q58186', 'Q207162', 'Q215530'}

def kind_of(genres, types):
    g = ' '.join(genres + types).lower()
    if 'opérette' in g or 'operetta' in g: return 'operette'
    if 'opéra-comique' in g or 'opera comique' in g or 'opéra comique' in g: return 'opera-comique'
    if 'ballet' in g or 'chorégraph' in g or 'danse' in g: return 'ballet'
    if 'opéra' in g or 'opera' in g or 'dramatico-musicale' in g or 'drame lyrique' in g or 'tragédie lyrique' in g or 'zarzuela' in g or 'singspiel' in g: return 'opera'
    if 'comédie musicale' in g or 'music-hall' in g or 'revue' in g: return 'comedie-musicale'
    if re.search(r'théâtr|pièce|tragédie|comédie|drame|farce|vaudeville|dramatique|littéraire', g): return 'theatre'
    if re.search(r'symphon|concerto|oratorio|messe|requiem|cantate|musical|poème symphonique|suite', g): return 'concert'
    return ''

def build_spectacles():
    q = '''SELECT ?w ?wl ?d ?prec ?loc ?locl ?city ?cityl ?coord ?ccoord ?cty ?sl ?g ?gl ?t ?tl ?by ?byl ?fr WHERE {
  ?w p:P1191 ?st . ?st psv:P1191 [ wikibase:timeValue ?d ; wikibase:timePrecision ?prec ] . ?w wdt:P4647 ?loc ; wikibase:sitelinks ?sl . FILTER(?sl >= 4)
  OPTIONAL { ?loc wdt:P625 ?coord } OPTIONAL { ?loc wdt:P17 ?cty } OPTIONAL { ?loc wdt:P131 ?city . ?city wdt:P625 ?ccoord }
  OPTIONAL { ?w wdt:P136 ?g } OPTIONAL { ?w wdt:P31 ?t } OPTIONAL { ?w wdt:P86|wdt:P50|wdt:P1809 ?by }
  OPTIONAL { ?fr schema:about ?w ; schema:isPartOf <https://fr.wikipedia.org/> }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en". ?w rdfs:label ?wl . ?loc rdfs:label ?locl . ?city rdfs:label ?cityl . ?g rdfs:label ?gl . ?t rdfs:label ?tl . ?by rdfs:label ?byl . }
}'''
    by = {}
    for r in sparql(q, 'spectacles'):
        k = qid(r['w']); x = by.setdefault(k, {'q': k, 'n': r.get('wl', ''), 'g': set(), 't': set(), 'by': [], 'cty': set(), 'rows': []})
        x['rows'].append(r)
        if r.get('gl'): x['g'].add(r['gl'])
        if r.get('tl'): x['t'].add(r['tl'])
        if r.get('byl') and r['byl'] not in x['by'] and not re.match(r'^Q\d+$', r['byl']): x['by'].append(r['byl'])
        if r.get('cty'): x['cty'].add(qid(r['cty']))
    out = []
    for x in by.values():
        r0 = min(x['rows'], key=lambda r: r['d'])
        y = year(r0['d'])
        if y is None or y < 1500 or y > 2025 or re.match(r'^Q\d+$', x['n']): continue
        ctys = [c for c in x['cty'] if c in EUROPE]
        if not ctys: continue
        kind = kind_of(sorted(x['g']), sorted(x['t']))
        if not kind or kind == 'concert' and not x['g']: continue
        if any(re.search(r'\bfilm\b|single|album|chanson|hymne', t.lower()) for t in x['t']) and kind not in ('opera', 'ballet', 'operette'): continue
        la, lo = point(r0.get('coord')); cla, clo = point(r0.get('ccoord'))
        city = r0.get('cityl') if r0.get('cityl') and not re.match(r'^Q\d+$', r0.get('cityl', '')) else ''
        out.append({'q': x['q'], 'n': x['n'], 'y': y, 'd': day(r0['d'], r0.get('prec')), 'k': kind, 'by': ', '.join(x['by'][:2]),
                    'venue': r0.get('locl', '') if not re.match(r'^Q\d+$', r0.get('locl', '')) else '', 'city': city,
                    'country': EUROPE[sorted(ctys)[0]], 'fr': 1 if any(c in FRANCE_Q for c in ctys) else 0,
                    'lat': la if la is not None else cla, 'lon': lo if lo is not None else clo, 'sl': int(r0['sl']), 'frwiki': wptitle(r0.get('fr'))})
    out.sort(key=lambda r: (r['y'], -r['sl']))
    save('spectacles', {**WD, 'what': 'Créations d’opéras, d’opérettes, de ballets et de pièces de théâtre en Europe (Wikidata : « date de première représentation » P1191 et « lieu de la première » P4647 ; œuvres présentes dans au moins 4 Wikipédias)',
                        'kinds': {'opera': 'opéra', 'opera-comique': 'opéra-comique', 'operette': 'opérette', 'ballet': 'ballet', 'theatre': 'pièce de théâtre', 'comedie-musicale': 'comédie musicale', 'concert': 'œuvre de concert'},
                        **table(['q', 'n', 'y', 'd', 'k', 'by', 'venue', 'city', 'country', 'fr', 'lat', 'lon', 'sl', 'frwiki'], out)})

def build_clubs():
    q = '''SELECT ?c ?cl ?inc ?sp ?spl ?l ?ins ?coord ?sl ?fr ?end WHERE {
  ?c wdt:P31/wdt:P279* wd:Q847017 ; wdt:P17 wd:Q142 ; wdt:P571 ?inc ; wikibase:sitelinks ?sl .
  ?c wdt:P159|wdt:P131 ?l . ?l wdt:P374 ?ins .
  OPTIONAL { ?c wdt:P641 ?sp } OPTIONAL { ?c wdt:P625 ?coord } OPTIONAL { ?c wdt:P576 ?end }
  OPTIONAL { ?fr schema:about ?c ; schema:isPartOf <https://fr.wikipedia.org/> }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en". ?c rdfs:label ?cl . ?sp rdfs:label ?spl . }
}'''
    by = {}
    for r in sparql(q, 'clubs'):
        k = qid(r['c']); y = year(r['inc'])
        if y is None or y > 2025: continue
        x = by.setdefault(k, {'q': k, 'n': r.get('cl', ''), 'y': y, 'sp': [], 'ins': r['ins'], 'end': year(r.get('end')), 'sl': int(r['sl']), 'frwiki': wptitle(r.get('fr')), 'coord': r.get('coord')})
        x['y'] = min(x['y'], y)
        sp = r.get('spl', '')
        if sp and not re.match(r'^Q\d+$', sp) and sp not in x['sp']: x['sp'].append(sp)
    out = []
    for x in by.values():
        if re.match(r'^Q\d+$', x['n']) or x['ins'] not in C: continue
        la, lo = point(x.pop('coord'))
        if la is None: la, lo = C[x['ins']][1], C[x['ins']][2]
        out.append({**x, 'sp': ', '.join(x['sp'][:2]), 'commune': C[x['ins']][0], 'lat': la, 'lon': lo})
    out.sort(key=lambda r: (r['y'], r['n']))
    save('clubs', {**WD, 'what': 'Clubs sportifs de France avec leur date de fondation (Wikidata : nature = club sportif Q847017 ou sous-classe ; P571 ; siège P159 ou commune P131)',
                   **table(['q', 'n', 'y', 'end', 'sp', 'ins', 'commune', 'lat', 'lon', 'sl', 'frwiki'], out)})

def build_tour():
    q = '''SELECT ?ed ?edl ?s ?sl ?no ?d ?a ?al ?ai ?ac ?b ?bl ?bi ?bc ?km ?edfr WHERE {
  ?ed wdt:P31 wd:Q33881 . ?ed p:P527 ?ps . ?ps ps:P527 ?s . OPTIONAL { ?ps pq:P1545 ?no }
  ?s wdt:P1427 ?a ; wdt:P1444 ?b . OPTIONAL { ?s wdt:P585|wdt:P580 ?d } OPTIONAL { ?s wdt:P3157 ?km }
  OPTIONAL { ?a wdt:P374 ?ai } OPTIONAL { ?a wdt:P625 ?ac } OPTIONAL { ?b wdt:P374 ?bi } OPTIONAL { ?b wdt:P625 ?bc }
  OPTIONAL { ?edfr schema:about ?ed ; schema:isPartOf <https://fr.wikipedia.org/> }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en". ?ed rdfs:label ?edl . ?s rdfs:label ?sl . ?a rdfs:label ?al . ?b rdfs:label ?bl . }
}'''
    by = {}
    for r in sparql(q, 'tour'):
        k = qid(r['s'])
        if k in by: continue
        y = year(r.get('d')) or int(re.search(r'(\d{4})', r.get('edl', '0000')).group(1) or 0)
        no = r.get('no') or (re.match(r'^(\d+)', r.get('sl', '')) or [None, ''])[1]
        if re.search(r'prologue', r.get('sl', ''), re.I): no = '0'
        ala, alo = point(r.get('ac')); bla, blo = point(r.get('bc'))
        ai, bi = r.get('ai', ''), r.get('bi', '')
        if ala is None and ai in C: ala, alo = C[ai][1], C[ai][2]
        if bla is None and bi in C: bla, blo = C[bi][1], C[bi][2]
        lab = lambda v: '' if re.match(r'^Q\d+$', v or '') else (v or '')
        by[k] = {'q': k, 'y': y, 'd': day(r.get('d')), 'no': no, 'a': lab(r.get('al')), 'ai': ai, 'ala': ala, 'alo': alo,
                 'b': lab(r.get('bl')), 'bi': bi, 'bla': bla, 'blo': blo, 'km': round(float(r['km'])) if r.get('km') else None,
                 'ed': qid(r['ed']), 'edwiki': wptitle(r.get('edfr')), 'n': lab(r.get('sl'))}
    out = sorted(by.values(), key=lambda r: (r['y'], r['d'], int(r['no']) if str(r['no']).isdigit() else 99))
    save('tour', {**WD, 'what': 'Étapes du Tour de France 1903–2025 (Wikidata : éditions Q33881, P527 « comprend », départ P1427, arrivée P1444, date P585)',
                  **table(['q', 'y', 'd', 'no', 'a', 'ai', 'ala', 'alo', 'b', 'bi', 'bla', 'blo', 'km', 'ed', 'edwiki', 'n'], out)})

def build_seigneurs():
    q = '''SELECT ?p ?pl ?title ?tl ?of ?ofl ?s ?e ?b ?d ?ins ?ins2 ?coord ?fr WHERE {
  { ?p p:P97 ?st . ?st ps:P97 ?title ; pq:P1001|pq:P276 ?of . OPTIONAL { ?st pq:P580 ?s } OPTIONAL { ?st pq:P582 ?e } }
  UNION
  { ?p p:P97 ?st . ?st ps:P97 ?title . ?title wdt:P1001 ?of . OPTIONAL { ?st pq:P580 ?s } OPTIONAL { ?st pq:P582 ?e } }
  OPTIONAL { ?of wdt:P374 ?ins } OPTIONAL { ?of wdt:P131 ?up . ?up wdt:P374 ?ins2 } OPTIONAL { ?of wdt:P625 ?coord }
  OPTIONAL { ?p wdt:P569 ?b } OPTIONAL { ?p wdt:P570 ?d }
  OPTIONAL { ?fr schema:about ?p ; schema:isPartOf <https://fr.wikipedia.org/> }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en". ?p rdfs:label ?pl . ?title rdfs:label ?tl . ?of rdfs:label ?ofl . }
}'''
    by = {}
    for r in sparql(q, 'seigneurs'):
        ins = r.get('ins') or r.get('ins2') or ''
        if ins not in C: continue
        k = (qid(r['p']), qid(r['title']), ins)
        x = by.get(k)
        s, e, b, d = year(r.get('s')), year(r.get('e')), year(r.get('b')), year(r.get('d'))
        lab = lambda v: '' if re.match(r'^Q\d+$', v or '') else (v or '')
        if not lab(r.get('pl')): continue
        if x is None:
            by[k] = {'q': qid(r['p']), 'n': lab(r.get('pl')), 'title': lab(r.get('tl')), 'tq': qid(r['title']), 'of': lab(r.get('ofl')), 'oq': qid(r['of']),
                     'ins': ins, 'commune': C[ins][0], 's': s, 'e': e, 'b': b, 'd': d, 'frwiki': wptitle(r.get('fr'))}
        else:
            x['s'] = x['s'] if x['s'] is not None else s; x['e'] = x['e'] if x['e'] is not None else e
    out = [x for x in by.values() if (x['s'] or x['b'] or x['d'] or 0) and (x['s'] or x['b'] or x['d']) < 1800]
    out.sort(key=lambda r: (r['ins'], r['s'] or r['b'] or r['d'] or 0))
    save('seigneurs', {**WD, 'what': 'Seigneurs, barons, comtes… d’un lieu de France avant 1800 (Wikidata : titre de noblesse P97 avec le lieu du titre P1001 / P276, ou P1001 du titre ; dates P580 / P582, sinon naissance et mort)',
                       **table(['q', 'n', 'title', 'tq', 'of', 'oq', 'ins', 'commune', 's', 'e', 'b', 'd', 'frwiki'], out)})

def build_eglises():
    # l'église de la commune (Q24398318 : édifice religieux et sous-classes) : détruite (P5816) ou avec une date de fin (P576)
    q1 = 'SELECT DISTINCT ?x WHERE { ?x wdt:P17 wd:Q142 ; wdt:P5816 ?st . VALUES ?st { wd:Q56556915 wd:Q60539160 } ?x wdt:P31/wdt:P279* wd:Q24398318 . }'
    q2 = '''SELECT DISTINCT ?x WHERE { VALUES ?k0 { wd:Q16970 wd:Q108325 wd:Q160742 wd:Q2750108 wd:Q44613 wd:Q2977 wd:Q1088552 wd:Q317557 wd:Q120560 wd:Q56242215 wd:Q1129743 wd:Q34627 wd:Q15823129 wd:Q1370598 }
    ?x wdt:P31 ?k0 ; wdt:P17 wd:Q142 ; wdt:P576 ?end0 . }'''
    ids = sorted({qid(r['x']) for r in sparql(q1, 'egl1') + sparql(q2, 'egl2')}, key=lambda s: int(s[1:]))
    tmpl = '''SELECT ?x ?xl ?k ?kl ?ins ?coord ?inc ?end ?st ?img ?mh ?fr WHERE { VALUES ?x { %VALUES% }
  ?x wdt:P31 ?k . OPTIONAL { ?x wdt:P131 ?l . ?l wdt:P374 ?ins } OPTIONAL { ?x wdt:P625 ?coord } OPTIONAL { ?x wdt:P571 ?inc } OPTIONAL { ?x wdt:P576 ?end }
  OPTIONAL { ?x wdt:P5816 ?st } OPTIONAL { ?x wdt:P18 ?img } OPTIONAL { ?x wdt:P380 ?mh }
  OPTIONAL { ?fr schema:about ?x ; schema:isPartOf <https://fr.wikipedia.org/> }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en". ?x rdfs:label ?xl . ?k rdfs:label ?kl . } }'''
    rows = []
    for i in range(0, len(ids), 800):
        part = ids[i:i + 800]
        rows += sparql(tmpl.replace('%VALUES%', ' '.join('wd:' + x for x in part)), 'egl3-' + hashlib.sha1(' '.join(part).encode()).hexdigest()[:10])
    by = {}
    for r in rows:
        k = qid(r['x'])
        x = by.setdefault(k, {'q': k, 'n': r.get('xl', ''), 'kinds': [], 'ins': '', 'coord': r.get('coord'), 'y0': None, 'y1': None, 'st': set(), 'img': '', 'mh': '', 'frwiki': wptitle(r.get('fr'))})
        kl = r.get('kl', '')
        if kl and not re.match(r'^Q\d+$', kl) and kl not in x['kinds']: x['kinds'].append(kl)
        if r.get('ins') in C and not x['ins']: x['ins'] = r['ins']
        y0, y1 = year(r.get('inc')), year(r.get('end'))
        if y0 is not None: x['y0'] = y0 if x['y0'] is None else min(x['y0'], y0)
        if y1 is not None: x['y1'] = y1 if x['y1'] is None else max(x['y1'], y1)
        if r.get('st'): x['st'].add(qid(r['st']))
        if 'Q19860854' in r.get('k', ''): x['st'].add('Q56556915')   # « bâtiment ou structure détruit »
        if r.get('img') and not x['img']: x['img'] = urllib.parse.unquote(r['img'].rsplit('/', 1)[1])
        if r.get('mh'): x['mh'] = r['mh']
    def kind(ks):
        s = ' '.join(ks).lower()
        for w, v in [('cathédrale', 'cathédrale'), ('basilique', 'basilique'), ('collégiale', 'collégiale'), ('abbaye', 'abbaye'), ('prieuré', 'prieuré'),
                     ('couvent', 'couvent'), ('monastère', 'monastère'), ('commanderie', 'commanderie'), ('chapelle', 'chapelle'), ('synagogue', 'synagogue'),
                     ('temple', 'temple'), ('mosquée', 'mosquée'), ('église', 'église'), ('croix', 'croix'), ('calvaire', 'calvaire')]:
            if w in s: return v
        return 'édifice religieux'
    out = []
    for x in by.values():
        if re.match(r'^Q\d+$', x['n']) or not x['ins']: continue
        la, lo = point(x.pop('coord'))
        st = 'detruit' if 'Q56556915' in x['st'] else 'partiel' if 'Q60539160' in x['st'] else 'fin'
        k = kind(x.pop('kinds'))
        if k in ('croix', 'calvaire'): continue
        out.append({**x, 'k': k, 'st': st, 'commune': C[x['ins']][0], 'lat': la, 'lon': lo, 'exact': 1 if la is not None else 0,
                    **({'lat': C[x['ins']][1], 'lon': C[x['ins']][2]} if la is None else {})})
    out.sort(key=lambda r: (r['ins'], r['y1'] or 0))
    save('eglises', {**WD, 'what': 'Églises, chapelles, abbayes, couvents… disparus ou fermés en France (Wikidata : état de conservation P5816 « démoli ou détruit » ou « partiellement détruit », ou date de fin P576 ; image P18 de Wikimedia Commons)',
                     'states': {'detruit': 'démoli ou détruit', 'partiel': 'partiellement détruit', 'fin': 'fermé, dissous ou détruit (date de fin)'},
                     **table(['q', 'n', 'k', 'st', 'ins', 'commune', 'lat', 'lon', 'exact', 'y0', 'y1', 'img', 'mh', 'frwiki'], out)})

def first_sentence(txt):
    txt = re.sub(r'\s+', ' ', txt or '').strip()
    m = re.match(r'(.{30,400}?[.!?])(\s|$)', txt)
    return m.group(1) if m else txt[:300]

def extracts(titles):
    out = {}
    titles = list(dict.fromkeys(t for t in titles if t))
    for i in range(0, len(titles), 20):
        j = wpapi({'action': 'query', 'prop': 'extracts|pageprops|coordinates', 'exintro': 1, 'explaintext': 1, 'redirects': 1, 'titles': '|'.join(titles[i:i + 20]), 'ppprop': 'wikibase_item', 'exlimit': 20})
        red = {r['from']: r['to'] for r in j['query'].get('redirects', [])} | {n['from']: n['to'] for n in j['query'].get('normalized', [])}
        for p in j['query'].get('pages', []):
            if p.get('missing'): continue
            out[p['title']] = {'text': p.get('extract', ''), 'q': p.get('pageprops', {}).get('wikibase_item', ''), 'title': p['title'],
                               'coord': (p['coordinates'][0]['lat'], p['coordinates'][0]['lon']) if p.get('coordinates') else None}
        for a, b in red.items():
            if b in out: out[a] = out[b]
            elif b in red and red[b] in out: out[a] = out[red[b]]
    return out

def build_foires():
    q = '''SELECT ?x ?xl ?k ?kl ?loc ?ins ?ins2 ?coord ?inc ?freq ?freql ?fr WHERE {
  ?x wdt:P31/wdt:P279* wd:Q288514 . ?x wdt:P31 ?k . ?x wdt:P276|wdt:P131 ?loc .
  OPTIONAL { ?loc wdt:P374 ?ins } OPTIONAL { ?loc wdt:P131 ?up . ?up wdt:P374 ?ins2 } OPTIONAL { ?x wdt:P625 ?coord }
  OPTIONAL { ?x wdt:P571|wdt:P580 ?inc } OPTIONAL { ?x wdt:P2257 ?freq }
  OPTIONAL { ?fr schema:about ?x ; schema:isPartOf <https://fr.wikipedia.org/> }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en". ?x rdfs:label ?xl . ?k rdfs:label ?kl . ?freq rdfs:label ?freql . }
}'''
    by = {}
    for r in sparql(q, 'foires'):
        k = qid(r['x']); ins = r.get('ins') if r.get('ins') in C else (r.get('ins2') if r.get('ins2') in C else '')
        x = by.setdefault(k, {'q': k, 'n': r.get('xl', ''), 'ins': '', 'coord': r.get('coord'), 'y': None, 'freq': '', 'frwiki': wptitle(r.get('fr')), 'kind': r.get('kl', '')})
        if ins and not x['ins']: x['ins'] = ins
        y = year(r.get('inc'))
        if y is not None: x['y'] = y if x['y'] is None else min(x['y'], y)
        if r.get('freql') and not re.match(r'^Q\d+$', r['freql']): x['freq'] = r['freql']
    # la catégorie « Foire en France » de Wikipédia (et ses sous-catégories directes)
    cats, seen, titles = ['Catégorie:Foire en France'], set(), []
    while cats:
        c = cats.pop(0)
        if c in seen or len(seen) > 40: continue
        seen.add(c)
        j = wpapi({'action': 'query', 'list': 'categorymembers', 'cmtitle': c, 'cmlimit': 500, 'cmtype': 'page|subcat'})
        for m in j['query']['categorymembers']:
            if m['ns'] == 14 and c == 'Catégorie:Foire en France': cats.append(m['title'])
            elif m['ns'] == 0: titles.append(m['title'])
    wiki_titles = set(titles) | {x['frwiki'] for x in by.values() if x['frwiki']}
    ex = extracts(sorted(wiki_titles))
    byq = {x['q']: x for x in by.values()}
    for t in titles:
        e = ex.get(t)
        if not e or not e['q']: continue
        x = byq.get(e['q'])
        if not x:
            x = byq[e['q']] = by[e['q']] = {'q': e['q'], 'n': e['title'], 'ins': '', 'coord': None, 'y': None, 'freq': '', 'frwiki': e['title'], 'kind': ''}
        x['frwiki'] = x['frwiki'] or e['title']
    # les éléments sans commune : la commune P131 / P276 de l'élément de la page Wikipédia
    need = [x['q'] for x in by.values() if not x['ins']]
    for i in range(0, len(need), 400):
        part = need[i:i + 400]
        for r in sparql('SELECT ?x ?ins ?coord WHERE { VALUES ?x { %s } OPTIONAL { ?x wdt:P131|wdt:P276|wdt:P159 ?l . ?l wdt:P374 ?ins } OPTIONAL { ?x wdt:P625 ?coord } }' % ' '.join('wd:' + q for q in part), 'foires-loc-' + hashlib.sha1(' '.join(part).encode()).hexdigest()[:10]):
            x = by.get(qid(r['x']))
            if x and r.get('ins') in C and not x['ins']: x['ins'] = r['ins']
            if x and r.get('coord') and not x['coord']: x['coord'] = r['coord']
    out = []
    for x in by.values():
        if re.match(r'^Q\d+$', x['n']) or not x['ins']: continue
        if re.search(r'\b(salon|festival|exposition universelle)\b', x['n'], re.I) and not re.search(r'foire', x['n'], re.I): continue
        e = ex.get(x['frwiki']) if x['frwiki'] else None
        la, lo = point(x.pop('coord'))
        if la is None and e and e.get('coord'): la, lo = e['coord']
        exact = la is not None
        if la is None: la, lo = C[x['ins']][1], C[x['ins']][2]
        sent = first_sentence(e['text']) if e else ''
        out.append({'q': x['q'], 'n': x['n'], 'ins': x['ins'], 'commune': C[x['ins']][0], 'lat': la, 'lon': lo, 'exact': 1 if exact else 0, 'y': x['y'],
                    'freq': x['freq'], 'frwiki': x['frwiki'], 'sentence': sent})
    out.sort(key=lambda r: (r['ins'], r['n']))
    save('foires', {**WD, 'source': 'Wikidata ; Wikipédia (fr)', 'licence': 'CC0 1.0 (Wikidata) ; CC BY-SA 4.0 (phrases de Wikipédia)', 'mention': 'Contributeurs de Wikipédia',
                    'what': 'Foires de France : éléments Wikidata « foire » (Q288514 et sous-classes) avec un lieu, et les articles de la catégorie « Foire en France » de Wikipédia (première phrase de l’article)',
                    **table(['q', 'n', 'ins', 'commune', 'lat', 'lon', 'exact', 'y', 'freq', 'frwiki', 'sentence'], out)})

# ── 🎡 les Expositions : la liste est choisie ici ; chaque chiffre et chaque phrase vient de l'article de Wikipédia (copié tel quel) ──
EXPOS = [
    # (titre de l'article, année, fin, ville, insee, genre, mots pour la phrase « ce qu'on y a vu »)
    ('Exposition universelle de 1855', 1855, 1855, 'Paris', '75056', 'universelle', r'Palais de l.Industrie|classification|vins de Bordeaux'),
    ('Exposition universelle de 1867', 1867, 1867, 'Paris', '75056', 'universelle', r'Champ-de-Mars|palais|ascenseur'),
    ('Exposition universelle de 1878', 1878, 1878, 'Paris', '75056', 'universelle', r'Trocadéro|statue de la Liberté|téléphone|phonographe'),
    ('Exposition universelle de 1889', 1889, 1889, 'Paris', '75056', 'universelle', r'tour Eiffel|Galerie des machines'),
    ('Exposition universelle de 1900', 1900, 1900, 'Paris', '75056', 'universelle', r'trottoir roulant|Grand Palais|Petit Palais|métro|pont Alexandre'),
    ('Exposition internationale des arts décoratifs et industriels modernes', 1925, 1925, 'Paris', '75056', 'internationale', r'Art déco|arts décoratifs|pavillon'),
    ('Exposition coloniale internationale', 1931, 1931, 'Paris', '75056', 'coloniale', r'bois de Vincennes|Angkor|zoo|pavillon|colonies'),
    ('Exposition spécialisée de 1937', 1937, 1937, 'Paris', '75056', 'internationale', r'Guernica|palais de Chaillot|pavillon|Trocadéro'),
    ('Exposition universelle, internationale et coloniale de Lyon (1894)', 1894, 1894, 'Lyon', '69123', 'universelle', r'parc de la Tête-d.Or|Sadi Carnot|dôme|coloniale'),
    ('Exposition internationale urbaine de Lyon', 1914, 1914, 'Lyon', '69123', 'internationale', r'Tony Garnier|Gerland|halle|guerre'),
    ('Exposition universelle de Bordeaux de 1895', 1895, 1895, 'Bordeaux', '33063', 'universelle', r'Quinconces|pavillon|vin'),
    ('Exposition maritime internationale de Bordeaux', 1907, 1907, 'Bordeaux', '33063', 'internationale', r'Quinconces|maritime|pavillon'),
    ('Exposition coloniale de Marseille (1906)', 1906, 1906, 'Marseille', '13055', 'coloniale', r'parc|pavillon|colonies'),
    ('Exposition coloniale de Marseille (1922)', 1922, 1922, 'Marseille', '13055', 'coloniale', r'parc Chanot|pavillon|Angkor|colonies'),
    ('Exposition internationale du Nord de la France', 1911, 1911, 'Roubaix', '59512', 'internationale', r'parc Barbieux|pavillon|textile'),
    ('Exposition internationale de l\'Est de la France', 1909, 1909, 'Nancy', '54395', 'internationale', r'parc Sainte-Marie|École de Nancy|pavillon'),
    ('Exposition universelle de 1937', 1937, 1937, 'Paris', '75056', 'internationale', r'Guernica|palais de Chaillot|pavillon'),
    ('Exposition universelle de Lille (1902)', 1902, 1902, 'Lille', '59350', 'universelle', r'pavillon|Lille'),
    ('Exposition internationale de la houille blanche et du tourisme', 1925, 1925, 'Grenoble', '38185', 'internationale', r'houille blanche|tour Perret|parc'),
    ('Exposition internationale de Rouen', 1896, 1896, 'Rouen', '76540', 'internationale', r'pavillon|Rouen'),
    ('Exposition nationale et coloniale de Rouen', 1896, 1896, 'Rouen', '76540', 'coloniale', r'pavillon|colonies'),
    ('Exposition universelle d\'Anvers (1885)', 1885, 1885, 'Anvers', '', 'universelle', r'pavillon'),
    ('Exposition universelle de 1910', 1910, 1910, 'Bruxelles', '', 'universelle', r'incendie|pavillon'),
    ('Exposition universelle de 1958', 1958, 1958, 'Bruxelles', '', 'universelle', r'Atomium'),
    ('Exposition universelle de 1851', 1851, 1851, 'Londres', '', 'universelle', r'Crystal Palace'),
]

SENT = re.compile(r'(?<=[.!?])\s+(?=[A-ZÀ-ÖØ-Ý«"0-9])')
def sentences(txt): return [s.strip() for s in SENT.split(re.sub(r'\s+', ' ', txt or '')) if s.strip()]
def visitors_of(sents):
    for s in sents:
        m = re.search(r'(\d[\d\s  ,.]*)\s*(millions?|million)?\s*(de\s+)?(visiteurs|entrées)', s)
        if m:
            raw = m.group(1).strip().replace(' ', ' ').replace('\xa0', ' ')
            n = None
            try:
                if m.group(2): n = float(raw.replace(',', '.').replace(' ', '')) * 1e6
                else: n = float(raw.replace(' ', '').replace('.', '').replace(',', '.'))
            except ValueError: n = None
            if n and n >= 10000: return s, int(n)
    return '', None

def build_expos():
    titles = [e[0] for e in EXPOS]
    # le texte complet (pas seulement l'introduction) : les chiffres sont souvent plus bas dans l'article
    full = {}
    for t in titles:
        j = wpapi({'action': 'query', 'prop': 'extracts|pageprops|info', 'inprop': 'url', 'explaintext': 1, 'redirects': 1, 'titles': t, 'ppprop': 'wikibase_item'})
        p = j['query']['pages'][0]
        if p.get('missing'): print('  absent :', t); continue
        full[t] = {'title': p['title'], 'text': p.get('extract', ''), 'q': p.get('pageprops', {}).get('wikibase_item', ''), 'url': p.get('fullurl') or 'https://fr.wikipedia.org/wiki/' + urllib.parse.quote(p['title'].replace(' ', '_'))}
    out, seen = [], set()
    for (t, y, y2, city, ins, kind, rx) in EXPOS:
        e = full.get(t)
        if not e or e['title'] in seen: continue
        seen.add(e['title'])
        ss = sentences(e['text'])
        if not ss: continue
        vs, vn = visitors_of(ss)
        hi = next((s for s in ss if re.search(rx, s, re.I) and s != vs and len(s) < 400), '')
        intro = ss[0] if len(ss[0]) < 500 else ss[0][:500]
        # les dates exactes : dans la première phrase (« du 15 avril au 12 novembre 1900 »)
        m = re.search(r'du (\d{1,2}(?:er)?\s+\w+)(?:\s+(\d{4}))?\s+au\s+(\d{1,2}(?:er)?\s+\w+\s+\d{4})', ' '.join(ss[:4]))
        out.append({'id': re.sub(r'[^a-z0-9]+', '-', e['title'].lower())[:50].strip('-'), 'n': e['title'], 'y': y, 'y2': y2, 'city': city, 'ins': ins,
                    'lat': C[ins][1] if ins in C else None, 'lon': C[ins][2] if ins in C else None, 'k': kind, 'fr': 1 if ins else 0,
                    'when': f'du {m.group(1)}{(" " + m.group(2)) if m.group(2) else ""} au {m.group(3)}' if m else '',
                    'visitors': vn, 'visitors_sentence': vs, 'highlight': hi, 'intro': intro, 'url': e['url'], 'q': e['q']})
    out.sort(key=lambda r: r['y'])
    save('expos', {**WP, 'what': 'Expositions universelles, internationales et coloniales (liste choisie pour LCNDA) ; le nombre de visiteurs et ce qu’on y a vu sont copiés de la phrase de l’article de Wikipédia en français',
                   'rows': out})

def build_dates():
    M = json.load(open(os.path.join(ROOT, 'assets', 'data', 'monde-autour.json')))
    ev = M['events']
    def title_of(e):
        u = e.get('url', '')
        if 'search=' in u: return urllib.parse.unquote_plus(re.search(r'search=([^&]+)', u).group(1))
        return wptitle(u)
    tt = {e['id']: title_of(e) for e in ev}
    pp = {}
    ts = sorted(set(tt.values()))
    for i in range(0, len(ts), 40):
        j = wpapi({'action': 'query', 'prop': 'pageprops', 'ppprop': 'wikibase_item', 'redirects': 1, 'titles': '|'.join(ts[i:i + 40])})
        red = {r['from']: r['to'] for r in j['query'].get('normalized', [])}
        red2 = {r['from']: r['to'] for r in j['query'].get('redirects', [])}
        got = {p['title']: p.get('pageprops', {}).get('wikibase_item', '') for p in j['query']['pages'] if not p.get('missing')}
        for t in ts[i:i + 40]:
            a = red.get(t, t); a = red2.get(a, a)
            if got.get(a): pp[t] = (got[a], a)
    qs = sorted({v[0] for v in pp.values()})
    ents = wm.entities(qs, props='claims')
    def times(e, p):
        out = []
        for c in (e or {}).get('claims', {}).get(p, []):
            if c.get('rank') == 'deprecated': continue
            v = c.get('mainsnak', {}).get('datavalue', {}).get('value')
            if isinstance(v, dict) and v.get('precision', 0) >= 11 and v.get('calendarmodel', '').endswith('Q1985727'): out.append(v['time'].lstrip('+')[:10])
        return out
    rows = []
    for e in ev:
        t = tt[e['id']]
        if t not in pp: continue
        q, page = pp[t]
        E = ents.get(q)
        cand = []
        for p, what in (('P585', 'jour'), ('P580', 'debut'), ('P582', 'fin'), ('P571', 'debut'), ('P1619', 'debut'), ('P577', 'jour'), ('P5444', 'jour')):
            for d in times(E, p):
                y = int(d[:4])
                # le jour doit tomber l'année que dit la liste (début, fin, ou l'année même) : sinon ce n'est pas le même événement
                if what == 'fin' and y == (e.get('to') or e['from']) or what != 'fin' and y == e['from']: cand.append((p, what, d))
        seenw = set()
        for p, what, d in cand:
            if what in seenw: continue
            seenw.add(what)
            rows.append({'id': e['id'], 'd': d, 'w': what, 'p': p, 'q': q, 'page': page})
    rows.sort(key=lambda r: r['d'])
    save('dates', {**WD, 'source': 'Wikidata ; Wikipédia (fr)', 'what': 'Le jour exact des événements de « Le monde autour » (assets/data/monde-autour.json) : article de Wikipédia → élément Wikidata → date à la précision du jour (P585 date, P580 début, P582 fin, P571 création, P1619 ouverture). Calendrier grégorien seulement.',
                   'props': {'P585': 'date', 'P580': 'date de début', 'P582': 'date de fin', 'P571': 'date de création', 'P1619': 'date d’ouverture', 'P577': 'date de publication', 'P5444': 'date de signature'},
                   'rows': rows})

STEPS = {'spectacles': build_spectacles, 'clubs': build_clubs, 'tour': build_tour, 'seigneurs': build_seigneurs, 'eglises': build_eglises,
         'foires': build_foires, 'expos': build_expos, 'dates': build_dates}
if __name__ == '__main__':
    only = os.environ.get('L8C_ONLY', '').split(',') if os.environ.get('L8C_ONLY') else list(STEPS)
    for k in only: STEPS[k]()
