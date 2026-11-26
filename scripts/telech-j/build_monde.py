# LCNDA — lot J (🌍 Partir et nommer) : les petits paquets « monde ».
#   python3 -I scripts/telech-j/build_monde.py assets/data [villages|cajuns|charcot|oberamt]
#  🏡 tj-villages  villages et villes fondés par des Français hors de France (émigrés du XIXe siècle : Pigüé, San Rafael… ; fondations de
#                  la Nouvelle-France : Kaskaskia, Sainte-Geneviève…) — liste choisie à la main ; position et identifiant : Wikipédia (fr)
#                  et Wikidata (CC0) ; la première phrase de l'article de Wikipédia (CC BY-SA 4.0), avec son lien
#  ⚜️ tj-cajuns    les 64 paroisses de Louisiane (Wikipédia en anglais pour la position, Wikidata CC0 pour la date de création et
#                  le chef-lieu) ; les 22 paroisses de l'Acadiane (résolution 496 du parlement de Louisiane, 1971 : un fait)
#  🧊 tj-charcot   les membres des expéditions de Jean-Baptiste Charcot connus de Wikidata (CC0) ; les morts du naufrage du
#                  « Pourquoi-Pas ? » (16 septembre 1936) connus de Wikidata
#  📘 tj-oberamt   les Oberämter du Wurtemberg et leur « Beschreibung des Oberamts » (1824-1886, domaine public) sur Wikisource
#                  en allemand (lien trouvé par Wikidata ; sinon une recherche sur Wikisource)
import os, re, sys, urllib.parse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm  # noqa: E402

OUT = sys.argv[1] if len(sys.argv) > 1 else 'assets/data'
WHAT = sys.argv[2] if len(sys.argv) > 2 else 'tout'
WD = {'v': 1, 'source': 'Wikidata', 'licence': 'CC0 1.0', 'licence_url': 'https://www.wikidata.org/wiki/Wikidata:Copyright',
      'credit': 'Données : Wikidata (CC0 1.0), extraites avec le service de requêtes query.wikidata.org.'}
g = lambda r, k: r.get(k, {}).get('value', '')  # noqa: E731


def wp_pages(titles, host='fr.wikipedia.org', intro=False):
    """titres → {titre demandé: {title, lat, lon, q, intro}} (API de Wikipédia : redirections suivies)"""
    out = {}
    for i in range(0, len(titles), 20):
        part = titles[i:i + 20]
        p = {'action': 'query', 'titles': '|'.join(part), 'prop': 'coordinates|pageprops' + ('|extracts' if intro else ''), 'ppprop': 'wikibase_item',
             'redirects': '1', 'colimit': 'max'}
        if intro:
            p.update({'exintro': '1', 'explaintext': '1', 'exsentences': '2', 'exlimit': 'max'})
        d = wm.mw(host, p)['query']
        back = {}
        for k in ('normalized', 'redirects'):
            for x in d.get(k, []):
                back[x['to']] = back.get(x['from'], x['from'])
        for pg in d.get('pages', []):
            if pg.get('missing') is not None or 'title' not in pg:
                continue
            t = pg['title']
            asked = back.get(t, t)
            asked = back.get(asked, asked)
            co = (pg.get('coordinates') or [{}])[0]
            out[asked] = {'title': t, 'lat': round(co['lat'], 5) if 'lat' in co else None, 'lon': round(co['lon'], 5) if 'lon' in co else None,
                          'q': (pg.get('pageprops') or {}).get('wikibase_item', ''), 'intro': re.sub(r'\s+', ' ', pg.get('extract') or '').strip()[:400]}
    return out


# ───────── 🏡 villages fondés par des Français ailleurs ─────────
# [titre fr.wikipedia, sorte (emigres = émigrés des XIXe-XXe siècles ; nf = fondation de la Nouvelle-France ou de la Louisiane française ;
#  refuge = réfugiés : huguenots, exilés de la Révolution ou de l'Empire), d'où venaient les fondateurs (texte court, ce que dit l'article)]
VILLAGES = [
    ['Pigüé', 'emigres', 'Aveyron'], ['San Rafael (Veracruz)', 'emigres', 'Haute-Saône, Bourgogne'],
    ['Castroville (Texas)', 'emigres', 'Alsace'], ['Champ d\'Asile', 'refuge', 'anciens soldats de l\'Empire'], ['Demopolis', 'refuge', 'exilés bonapartistes (Vine and Olive Colony)'],
    ['Gallipolis', 'emigres', 'les « Cinq-Cents » (1790)'], ['Asylum (Pennsylvanie)', 'refuge', 'réfugiés de la Révolution'], ['New Rochelle', 'refuge', 'huguenots de La Rochelle'],
    ['Franschhoek', 'refuge', 'huguenots'], ['New Paltz', 'refuge', 'huguenots'], ['Manakin (Virginie)', 'refuge', 'huguenots'], ['Trochu (Alberta)', 'emigres', 'officiers de cavalerie français'],
    ['Notre-Dame-de-Lourdes (Manitoba)', 'emigres', 'colons français et suisses'], ['Saint-Claude (Manitoba)', 'emigres', 'Jura'], ['Bourbonnais (Illinois)', 'emigres', 'Canadiens français'],
    ['Icarie', 'emigres', 'les Icariens d\'Étienne Cabet'], ['La Réunion (Texas)', 'emigres', 'fouriéristes de Victor Considerant'],
    ['Kaskaskia (Illinois)', 'nf', 'Nouvelle-France'], ['Cahokia (Illinois)', 'nf', 'Nouvelle-France'], ['Prairie du Rocher', 'nf', 'Nouvelle-France'], ['Sainte-Geneviève (Missouri)', 'nf', 'Nouvelle-France'],
    ['Vincennes (Indiana)', 'nf', 'Nouvelle-France'], ['Détroit (Michigan)', 'nf', 'Nouvelle-France (Fort Pontchartrain, 1701)'], ['Saint-Louis (Missouri)', 'nf', 'Louisiane française (1764)'],
    ['Mobile (Alabama)', 'nf', 'Louisiane française (1702)'], ['Biloxi (Mississippi)', 'nf', 'Louisiane française (1699)'], ['Natchitoches (Louisiane)', 'nf', 'Louisiane française (1714)'],
    ['La Nouvelle-Orléans', 'nf', 'Louisiane française (1718)'], ['Prairie du Chien (Wisconsin)', 'nf', 'Nouvelle-France'], ['Dubuque (Iowa)', 'nf', 'Julien Dubuque'],
    ['Esperanza (Santa Fe)', 'emigres', 'colons suisses, français, allemands'], ['Colonia San José', 'emigres', 'Savoie, Valais, Piémont'],
    ['Nueva Helvecia', 'emigres', 'colons suisses'], ['Traiguén', 'emigres', 'colons français et suisses'], ['Victoria (Chili)', 'emigres', 'colons européens'],
    ['Joinville (Santa Catarina)', 'emigres', 'colonie de la princesse de Joinville'], ]


def villages():
    P = wp_pages([v[0] for v in VILLAGES], intro=True)
    rows, miss = [], []
    for t, kind, frm in VILLAGES:
        p = P.get(t)
        if not p or p['lat'] is None:
            miss.append(t)
            continue
        rows.append([p['q'], p['title'], kind, frm, p['lat'], p['lon'], p['intro'], wm.wp_url(p['title'])])
    meta = {**WD, 'source': 'Wikipédia (fr) et Wikidata', 'url': 'https://fr.wikipedia.org/wiki/Pig%C3%BC%C3%A9', 'built': wm.today(),
            'licence': 'CC BY-SA 4.0 (phrases de Wikipédia) ; CC0 (Wikidata)', 'licence_url': 'https://fr.wikipedia.org/wiki/Wikip%C3%A9dia:Citation_et_r%C3%A9utilisation_du_contenu_de_Wikip%C3%A9dia',
            'credit': 'Wikipédia (fr), les contributeurs de Wikipédia (CC BY-SA 4.0) ; Wikidata (CC0)',
            'what': 'Villages et villes fondés hors de France par des émigrés, des réfugiés ou des colons français (liste choisie à la main) ; la première phrase de l’article',
            'kinds': {'emigres': 'fondé par des émigrés', 'nf': 'fondation française (Nouvelle-France, Louisiane)', 'refuge': 'fondé par des réfugiés'},
            'fields': ['q', 'n', 'k', 'from', 'lat', 'lon', 'intro', 'url'], 'rows': rows}
    size = wm.write_gz(OUT, 'tj-villages.json.gz', meta)
    print(f'tj-villages : {len(rows)} lieux, {size} octets ; pas trouvés : {", ".join(miss) or "aucun"}')


# ───────── ⚜️ les paroisses de Louisiane ─────────
PARISHES = ('Acadia Allen Ascension Assumption Avoyelles Beauregard Bienville Bossier Caddo Calcasieu Caldwell Cameron Catahoula Claiborne Concordia '
            'De_Soto East_Baton_Rouge East_Carroll East_Feliciana Evangeline Franklin Grant Iberia Iberville Jackson Jefferson Jefferson_Davis Lafayette '
            'Lafourche LaSalle Lincoln Livingston Madison Morehouse Natchitoches Orleans Ouachita Plaquemines Pointe_Coupee Rapides Red_River Richland '
            'Sabine St._Bernard St._Charles St._Helena St._James St._John_the_Baptist St._Landry St._Martin St._Mary St._Tammany Tangipahoa Tensas '
            'Terrebonne Union Vermilion Vernon Washington Webster West_Baton_Rouge West_Carroll West_Feliciana Winn').split()
# les 22 paroisses de l'Acadiane (House Concurrent Resolution 496, 1971)
ACADIANA = set(('Acadia Ascension Assumption Avoyelles Calcasieu Cameron Evangeline Iberia Iberville Jefferson_Davis Lafayette Lafourche Pointe_Coupee '
                'St._Charles St._James St._John_the_Baptist St._Landry St._Martin St._Mary Terrebonne Vermilion West_Baton_Rouge').split())


def cajuns():
    titles = [f'{p.replace("_", " ")} Parish, Louisiana' for p in PARISHES]
    P = wp_pages(titles, host='en.wikipedia.org')
    qs = [P[t]['q'] for t in titles if t in P and P[t]['q']]
    extra = {}
    for r in wm.sparql('''SELECT ?p ?inc ?seat ?seatl ?fr WHERE { VALUES ?p { %s } OPTIONAL { ?p wdt:P571 ?inc } OPTIONAL { ?p wdt:P36 ?seat }
 OPTIONAL { ?p rdfs:label ?fr FILTER(lang(?fr) = "fr") } OPTIONAL { ?seat rdfs:label ?seatl FILTER(lang(?seatl) = "en") } }''' % ' '.join('wd:' + q for q in qs)):
        e = extra.setdefault(wm.qid(g(r, 'p')), {})
        e.setdefault('inc', wm.year(g(r, 'inc')))
        e.setdefault('seat', g(r, 'seatl'))
        e.setdefault('fr', g(r, 'fr'))
    rows = []
    for p, t in zip(PARISHES, titles):
        x = P.get(t)
        if not x:
            continue
        e = extra.get(x['q'], {})
        rows.append([x['q'], p.replace('_', ' ').replace('St.', 'St.'), e.get('fr') or '', 1 if p in ACADIANA else 0, e.get('inc'), e.get('seat') or '', x['lat'], x['lon'], wm.wp_url(x['title'], 'en.wikipedia.org')])
    meta = {**WD, 'source': 'Wikipédia (en) et Wikidata', 'url': 'https://en.wikipedia.org/wiki/List_of_parishes_in_Louisiana', 'built': wm.today(),
            'credit': 'Position : Wikipédia (en) ; date de création, chef-lieu, nom français : Wikidata (CC0) ; Acadiane : résolution 496 du parlement de Louisiane (1971)',
            'acadiana_url': 'https://en.wikipedia.org/wiki/Acadiana',
            'what': 'Les 64 paroisses de Louisiane (position du centre, date de création, chef-lieu) ; les 22 paroisses de l’Acadiane, le pays cadien',
            'fields': ['q', 'n', 'fr', 'acadiana', 'from', 'seat', 'lat', 'lon', 'url'], 'rows': rows}
    size = wm.write_gz(OUT, 'tj-cajuns.json.gz', meta)
    print(f'tj-cajuns : {len(rows)} paroisses ({sum(r[3] for r in rows)} en Acadiane), {size} octets')


# ───────── 🧊 les expéditions de Charcot ─────────
CHARCOT_PAGES = ['Première expédition Charcot', 'Seconde expédition Charcot', 'Pourquoi-Pas ? IV', 'Français (navire)', 'Jean-Baptiste Charcot']


def charcot():
    P = wp_pages(CHARCOT_PAGES, intro=True)
    ids = {t: P[t]['q'] for t in CHARCOT_PAGES if t in P and P[t]['q']}
    vals = ' '.join('wd:' + q for t, q in ids.items() if t != 'Jean-Baptiste Charcot')
    rows, seen = [], set()
    if vals:
        Q = '''SELECT ?p ?pl ?x ?b ?d ?bpl ?job ?fr WHERE { VALUES ?x { %s }
 { ?p wdt:P1344 ?x } UNION { ?x wdt:P710 ?p } UNION { ?p wdt:P5096 ?x } UNION { ?x wdt:P1029 ?p } ?p wdt:P31 wd:Q5 .
 OPTIONAL { ?p wdt:P569 ?b } OPTIONAL { ?p wdt:P570 ?d } OPTIONAL { ?p wdt:P19 ?bp . ?bp rdfs:label ?bpl FILTER(lang(?bpl) = "fr") }
 OPTIONAL { ?p wdt:P106 ?jj . ?jj rdfs:label ?job FILTER(lang(?job) = "fr") }
 OPTIONAL { ?fr schema:about ?p ; schema:isPartOf <https://fr.wikipedia.org/> }
 SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en". ?p rdfs:label ?pl } }''' % vals
        exp = {q: t for t, q in ids.items()}
        for r in wm.sparql(Q):
            k = (wm.qid(g(r, 'p')), wm.qid(g(r, 'x')))
            if k in seen or re.match(r'^Q\d+$', g(r, 'pl')):
                continue
            seen.add(k)
            fr = g(r, 'fr')
            rows.append([k[0], g(r, 'pl'), exp.get(k[1], ''), wm.year(g(r, 'b')), wm.year(g(r, 'd')), g(r, 'bpl'), g(r, 'job'), urllib.parse.unquote(fr.rsplit('/', 1)[-1]).replace('_', ' ') if fr else ''])
    rows.sort(key=lambda r: (r[2], r[1]))
    meta = {**WD, 'url': 'https://fr.wikipedia.org/wiki/Jean-Baptiste_Charcot', 'built': wm.today(),
            'what': 'Membres des expéditions de Jean-Baptiste Charcot (1903-1905, 1908-1910) et de l’équipage du « Pourquoi-Pas ? » connus de Wikidata',
            'expeditions': [[t, P[t]['q'], wm.wp_url(P[t]['title']), P[t]['intro']] for t in CHARCOT_PAGES if t in P],
            'fields': ['q', 'n', 'exp', 'b', 'd', 'born', 'job', 'fr'], 'rows': rows}
    size = wm.write_gz(OUT, 'tj-charcot.json.gz', meta)
    print(f'tj-charcot : {len(rows)} personnes, {len(meta["expeditions"])} expéditions et navires, {size} octets')


# ───────── 📘 les Oberamtsbeschreibungen ─────────
def oberamt():
    Q = '''SELECT ?o ?ol ?c ?sc ?seatl ?e ?ws WHERE { ?cls rdfs:label "Oberamt"@de . ?o wdt:P31 ?cls .
 OPTIONAL { ?o wdt:P625 ?c } OPTIONAL { ?o wdt:P36 ?seat . ?seat wdt:P625 ?sc . ?seat rdfs:label ?seatl FILTER(lang(?seatl) = "de") }
 OPTIONAL { ?o wdt:P576 ?e }
 OPTIONAL { ?b wdt:P921 ?o . ?ws schema:about ?b ; schema:isPartOf <https://de.wikisource.org/> }
 ?o rdfs:label ?ol FILTER(lang(?ol) = "de") }'''
    rows, by = [], {}
    for r in wm.sparql(Q):
        q = wm.qid(g(r, 'o'))
        la, lo = wm.point(g(r, 'c'))
        sla, slo = wm.point(g(r, 'sc'))
        x = by.setdefault(q, {'n': g(r, 'ol'), 'lat': la if la is not None else sla, 'lon': lo if lo is not None else slo, 'seat': g(r, 'seatl'), 'end': wm.year(g(r, 'e')), 'ws': ''})
        if g(r, 'ws') and not x['ws']:
            x['ws'] = g(r, 'ws')
    for q, x in sorted(by.items(), key=lambda kv: kv[1]['n']):
        if x['lat'] is None or not re.match(r'^Oberamt ', x['n']):
            continue
        short = x['n'][len('Oberamt '):]
        search = 'https://de.wikisource.org/w/index.php?' + urllib.parse.urlencode({'search': f'Beschreibung des Oberamts {short}'})
        rows.append([q, short, x['seat'] or short, x['end'], x['lat'], x['lon'], x['ws'], search])
    meta = {**WD, 'url': 'https://de.wikisource.org/wiki/Oberamtsbeschreibung', 'built': wm.today(),
            'what': 'Les Oberämter du royaume de Wurtemberg (Wikidata) et le lien vers leur « Beschreibung des Oberamts » (1824-1886, domaine public) '
                    'sur Wikisource en allemand ; une recherche sur Wikisource quand Wikidata ne connaît pas la page',
            'fields': ['q', 'n', 'seat', 'end', 'lat', 'lon', 'ws', 'search'], 'rows': rows}
    size = wm.write_gz(OUT, 'tj-oberamt.json.gz', meta)
    print(f'tj-oberamt : {len(rows)} Oberämter ({sum(1 for r in rows if r[6])} avec leur page de Wikisource), {size} octets')


if __name__ == '__main__':
    for k, f in (('villages', villages), ('cajuns', cajuns), ('charcot', charcot), ('oberamt', oberamt)):
        if WHAT in ('tout', k):
            f()
