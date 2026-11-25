#!/usr/bin/env python3
"""LCNDA — lot B « la vie du village et la nature » : fabrique les fichiers assets/data/tb-*.json.gz.

    python3 scripts/telech-b/build.py wikidata [--out DOSSIER]   # ✝️ ⛲ 🍞 🪨 🐑 🕍 🍇 depuis Wikidata (CC0)          — ici ou sur GitHub
    python3 scripts/telech-b/build.py vendanges [--out DOSSIER]  # 🍇 dates des vendanges 1354–2007 (Daux et al. 2012, NOAA)
    python3 scripts/telech-b/build.py osm [--out DOSSIER]        # ✝️ ⛲ 🍞 🪨 🐑 🕍 depuis OpenStreetMap (ODbL) — sur GitHub seulement
    python3 scripts/telech-b/build.py dictons [--out DOSSIER]    # 🗣️ proverbes des langues régionales (Wiktionnaire, CC BY-SA 4.0)
    python3 scripts/telech-b/build.py essai --out DOSSIER        # petits fichiers INVENTÉS (marqués « fixture ») pour les essais

Le service Overpass (OpenStreetMap) et l'API du Wiktionnaire ne répondent pas (ou peu) depuis l'atelier de développement :
ces deux fabrications se font sur GitHub (.github/workflows/telech-b.yml, lancé à la main).

Sources et licences (lues le 2026-11-25 ; voir docs/telechargements-lot-b.md) :
  · Wikidata — « All structured data … is released into the public domain under Creative Commons Zero » (CC0 1.0).
  · OpenStreetMap — Open Database License (ODbL 1.0), « © les contributeurs d'OpenStreetMap » sur chaque écran.
  · Wiktionnaire — « Vous avez la permission de copier, distribuer ou modifier le texte de tous les articles du Wiktionnaire selon
    les termes de la licence CC-BY-SA 4.0 » : chaque proverbe garde le lien vers sa page (attribution) ; le fichier est sous CC BY-SA 4.0.
  · Dates des vendanges — Daux, V. et al. (2012), « An open-access database of grape harvest dates for climate research »,
    Climate of the Past 8, 1403–1418 (article CC BY 3.0), données distribuées par NOAA NCEI / World Data Service for
    Paleoclimatology : « Users may access and download these data free of charge; please cite the original references ».
Format : {title, source, licence, licence_url, url, built, fields, rows:[[…]]} (+ des tables en plus selon le fichier), gzip.
Bibliothèques : seulement celles de Python.
"""
import argparse, datetime, gzip, json, os, re, sys, unicodedata
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TODAY = datetime.date.today().isoformat()
COUNTRIES = {'Q142': 'France', 'Q31': 'Belgique', 'Q39': 'Suisse', 'Q32': 'Luxembourg', 'Q235': 'Monaco', 'Q228': 'Andorre'}
qid = lambda u: (u or '').rsplit('/', 1)[-1]
WD = {'source': 'Wikidata', 'licence': 'CC0 1.0', 'licence_url': 'https://creativecommons.org/publicdomain/zero/1.0/', 'url': 'https://www.wikidata.org/wiki/Wikidata:Licensing'}
OSM = {'source': 'OpenStreetMap (© les contributeurs d’OpenStreetMap)', 'licence': 'ODbL 1.0', 'licence_url': 'https://www.openstreetmap.org/copyright', 'url': 'https://www.openstreetmap.org/copyright'}

# ─────────── les thèmes : sorte → (classes Wikidata, thème) ───────────
#   croix    ✝️ calvaires, croix de chemin, oratoires                     (lot B n° 19)
#   eau      ⛲ lavoirs, puits, fontaines                                 (n° 20)
#   village  🍞 fours à pain communaux (fours banaux), pigeonniers        (n° 20)
#   bornes   🪨 bornes frontières, octrois, douanes                       (n° 21)
#   berger   🐑 drailles (chemins de transhumance), burons, cabanes       (n° 22)
#   cultes   🕍 temples protestants, synagogues                           (n° 24)
WD_KINDS = {
    'croix': {'Q2309609': 'croix', 'Q371752': 'calvaire'},
    'eau': {'Q1690211': 'lavoir', 'Q43483': 'puits', 'Q556186': 'puits', 'Q483453': 'fontaine'},
    'village': {'Q5153962': 'four', 'Q948878': 'pigeonnier'},
    'bornes': {'Q921099': 'borne', 'Q138783271': 'octroi', 'Q110453637': 'octroi', 'Q218653': 'douane'},
    'berger': {'Q1168568': 'draille', 'Q2928590': 'buron', 'Q1317595': 'cabane'},
    'cultes': {'Q56242063': 'temple', 'Q34627': 'synagogue', 'Q96376027': 'synagogue'},
}
TITLES = {
    'croix': 'Calvaires et croix de chemin', 'eau': 'Lavoirs, puits et fontaines', 'village': 'Fours à pain communaux et pigeonniers',
    'bornes': 'Bornes, octrois et douanes', 'berger': 'Transhumance : drailles, burons, cabanes de berger', 'cultes': 'Temples protestants et synagogues',
}
PT_FIELDS = ['k', 'n', 'lat', 'lon', 'from', 'to', 'commune', 'insee', 'country', 'mh', 'fr', 'src']


def year(t):
    m = re.match(r'^\+?(-?\d{1,4})-', t or '')
    return int(m.group(1)) if m else None


def point(s):
    m = re.match(r'Point\(([-\d.eE]+) ([-\d.eE]+)\)', s or '')
    return (round(float(m.group(2)), 5), round(float(m.group(1)), 5)) if m else (None, None)


def write(out, name, obj):
    os.makedirs(out, exist_ok=True)
    obj = {'built': TODAY, **obj}
    p = os.path.join(out, f'tb-{name}.json.gz')
    raw = json.dumps(obj, ensure_ascii=False, separators=(',', ':')).encode()
    with open(p, 'wb') as f:
        f.write(gzip.compress(raw, 9, mtime=0))
    size = os.path.getsize(p)
    print(f'  {p} : {len(obj.get("rows", []))} lignes, {size / 1024:.0f} Ko')
    if size > 15 * 1024 * 1024:
        sys.exit(f'{p} dépasse 15 Mo : à couper')
    return p


# ═════════════════════════ Wikidata ═════════════════════════
def wd_points(theme):
    rows = {}
    ctry = ' '.join('wd:' + k for k in COUNTRIES)
    for cls, kind in WD_KINDS[theme].items():
        q = f'''SELECT ?x ?xl ?c ?ctry ?ins ?coml ?inc ?end ?mh ?fr WHERE {{
  VALUES ?ctry {{ {ctry} }}
  ?x wdt:P31 wd:{cls} ; wdt:P625 ?c ; wdt:P17 ?ctry .
  OPTIONAL {{ ?x wdt:P131 ?com . OPTIONAL {{ ?com wdt:P374 ?ins }} OPTIONAL {{ ?com rdfs:label ?coml FILTER(LANG(?coml)="fr") }} }}
  OPTIONAL {{ ?x wdt:P571 ?inc }} OPTIONAL {{ ?x wdt:P576 ?end }} OPTIONAL {{ ?x wdt:P380 ?mh }}
  OPTIONAL {{ ?fr schema:about ?x ; schema:isPartOf <https://fr.wikipedia.org/> }}
  OPTIONAL {{ ?x rdfs:label ?xl FILTER(LANG(?xl)="fr") }}
}}'''
        n0 = len(rows)
        for b in wm.sparql(q):
            x = qid(b['x']['value'])
            lat, lon = point(b['c']['value'])
            if lat is None:
                continue
            r = rows.get(x)
            if not r:
                name = b.get('xl', {}).get('value') or ''
                r = rows[x] = {'k': kind, 'n': name, 'lat': lat, 'lon': lon, 'from': None, 'to': None, 'commune': '', 'insee': '',
                               'country': COUNTRIES[qid(b['ctry']['value'])], 'mh': '', 'fr': '', 'src': x}
            if not r['insee'] and b.get('ins'):
                r['insee'], r['commune'] = b['ins']['value'], b.get('coml', {}).get('value', '')
            if not r['commune'] and b.get('coml'):
                r['commune'] = b['coml']['value']
            y = year(b.get('inc', {}).get('value'))
            if y is not None and (r['from'] is None or y < r['from']):
                r['from'] = y
            y = year(b.get('end', {}).get('value'))
            if y is not None:
                r['to'] = y
            if b.get('mh') and not r['mh']:
                r['mh'] = b['mh']['value']
            if b.get('fr') and not r['fr']:
                r['fr'] = urlunquote(b['fr']['value'].rsplit('/wiki/', 1)[-1]).replace('_', ' ')
        print(f'    {theme} / {cls} ({kind}) : {len(rows) - n0}')
    out = []
    for r in rows.values():
        if not r['n']:
            r['n'] = f'{r["k"]} ({r["commune"]})' if r['commune'] else r['k']
        out.append([r[k] for k in PT_FIELDS])
    out.sort(key=lambda r: (r[0], r[1]))
    return out


def urlunquote(s):
    import urllib.parse
    return urllib.parse.unquote(s)


def wd_cepages():
    """🍇 les cépages : nature (P31) « cépage » (Q958314) ou « variété de raisin » (Q10978) ; pays d'origine (P495), lieu d'origine
    (P1071) et sa position, date (P571), couleur de la baie (P462), article de Wikipédia."""
    rows = {}
    for cls in ('Q958314', 'Q10978', 'Q139941267', 'Q139941266'):
        q = f'''SELECT ?x ?xl ?ctryl ?locl ?lc ?inc ?coll ?fr WHERE {{
  ?x wdt:P31 wd:{cls} .
  ?x rdfs:label ?xl FILTER(LANG(?xl)="fr")
  OPTIONAL {{ ?x wdt:P495 ?ctry . ?ctry rdfs:label ?ctryl FILTER(LANG(?ctryl)="fr") }}
  OPTIONAL {{ ?x wdt:P1071 ?loc . ?loc rdfs:label ?locl FILTER(LANG(?locl)="fr") OPTIONAL {{ ?loc wdt:P625 ?lc }} }}
  OPTIONAL {{ ?x wdt:P571 ?inc }}
  OPTIONAL {{ ?x wdt:P462 ?col . ?col rdfs:label ?coll FILTER(LANG(?coll)="fr") }}
  OPTIONAL {{ ?fr schema:about ?x ; schema:isPartOf <https://fr.wikipedia.org/> }}
}}'''
        try:
            res = wm.sparql(q)
        except RuntimeError as e:
            print('    cépages', cls, e)
            continue
        for b in res:
            x = qid(b['x']['value'])
            r = rows.setdefault(x, {'n': b['xl']['value'], 'country': '', 'origin': '', 'lat': None, 'lon': None, 'from': None, 'color': '', 'fr': '', 'src': x})
            if b.get('ctryl') and not r['country']:
                r['country'] = b['ctryl']['value']
            if b.get('locl') and not r['origin']:
                r['origin'] = b['locl']['value']
            if b.get('lc') and r['lat'] is None:
                r['lat'], r['lon'] = point(b['lc']['value'])
            y = year(b.get('inc', {}).get('value'))
            if y is not None and (r['from'] is None or y < r['from']):
                r['from'] = y
            if b.get('coll') and not r['color']:
                r['color'] = b['coll']['value']
            if b.get('fr') and not r['fr']:
                r['fr'] = urlunquote(b['fr']['value'].rsplit('/wiki/', 1)[-1]).replace('_', ' ')
        print(f'    cépages / {cls} : {len(rows)}')
    keys = ['n', 'country', 'origin', 'lat', 'lon', 'from', 'color', 'fr', 'src']
    # seulement ceux dont on sait d'où ils viennent (un pays ou un lieu) : c'est ce qui sert à « les cépages de sa région »
    out = [[r[k] for k in keys] for r in rows.values() if r['country'] or r['origin']]
    out.sort(key=lambda r: unicodedata.normalize('NFD', r[0].lower()))
    return keys, out


def build_wikidata(out):
    for theme in WD_KINDS:
        rows = wd_points(theme)
        write(out, f'wd-{theme}', {'title': f'{TITLES[theme]} (Wikidata) : France, Belgique, Suisse, Luxembourg, Monaco, Andorre', **WD,
                                   'kinds': sorted(set(WD_KINDS[theme].values())), 'fields': PT_FIELDS, 'rows': rows})
    keys, rows = wd_cepages()
    write(out, 'cepages', {'title': 'Cépages et leur lieu d’origine (Wikidata)', **WD, 'fields': keys, 'rows': rows})


# ═════════════════════════ OpenStreetMap (sur GitHub) ═════════════════════════
# chaque sorte : les filtres Overpass (nœuds, chemins, relations : le centre) ; seulement la France (zone ISO FR) et ses voisins proches
OSM_KINDS = {
    'croix': [('croix', 'nwr["historic"="wayside_cross"]'), ('oratoire', 'nwr["historic"="wayside_shrine"]'), ('calvaire', 'nwr["historic"="calvary"]')],
    'eau': [('lavoir', 'nwr["amenity"="lavoir"]'), ('lavoir', 'nwr["building"="lavoir"]'), ('fontaine', 'nwr["amenity"="fountain"]["historic"]'),
            ('fontaine', 'nwr["historic"="fountain"]'), ('puits', 'nwr["man_made"="water_well"]["historic"]'), ('puits', 'nwr["historic"="well"]'),
            ('puits', 'nwr["man_made"="water_well"]["name"]')],
    'village': [('four', 'nwr["amenity"="baking_oven"]'), ('four', 'nwr["building"="bakehouse"]'), ('four', 'nwr["historic"="bakery"]'),
                ('pigeonnier', 'nwr["man_made"="dovecote"]'), ('pigeonnier', 'nwr["building"="dovecote"]'), ('pigeonnier', 'nwr["historic"="dovecote"]')],
    'bornes': [('borne', 'nwr["historic"="boundary_stone"]'), ('borne', 'nwr["historic"="milestone"]["boundary"]'),
               ('octroi', 'nwr["historic"]["name"~"octroi",i]'), ('douane', 'nwr["historic"]["name"~"douane",i]'), ('douane', 'nwr["historic"="customs_house"]')],
    'berger': [('cabane', 'nwr["building"="hut"]["name"~"berger|pastre|pâtre|cabane",i]'), ('cabane', 'nwr["amenity"="shelter"]["shelter_type"="basic_hut"]["name"~"berger|cabane|orri|jas",i]'),
               ('buron', 'nwr["name"~"^buron",i]["building"]'), ('orri', 'nwr["name"~"^orri",i]["historic"]'),
               ('draille', 'way["highway"]["name"~"draille|transhumance|carraire|cami ramadier",i]'), ('draille', 'relation["route"]["name"~"draille|transhumance",i]')],
    'cultes': [('temple', 'nwr["amenity"="place_of_worship"]["religion"="christian"]["denomination"~"protestant|reformed|lutheran|evangelical",i]["name"~"temple",i]'),
               ('synagogue', 'nwr["amenity"="place_of_worship"]["religion"="jewish"]'), ('synagogue', 'nwr["historic"]["name"~"synagogue",i]')],
}
OSM_FIELDS = ['k', 'n', 'lat', 'lon', 'from', 'osm']


def osm_year(tags):
    m = re.search(r'(1[0-9]{3})', tags.get('start_date', '') or tags.get('construction_date', '') or '')
    return int(m.group(1)) if m else None


def build_osm(out, server):
    for theme, filters in OSM_KINDS.items():
        rows, seen = [], set()
        for kind, f in filters:
            q = f'[out:json][timeout:900];area["ISO3166-1"="FR"][admin_level=2]->.fr;({f}(area.fr););out center tags;'
            res = wm.overpass(q, server)
            n0 = len(rows)
            for e in res.get('elements', []):
                key = f'{e["type"][0]}{e["id"]}'
                if key in seen:
                    continue
                lat, lon = e.get('lat') or (e.get('center') or {}).get('lat'), e.get('lon') or (e.get('center') or {}).get('lon')
                if lat is None:
                    continue
                t = e.get('tags', {})
                seen.add(key)
                rows.append([kind, (t.get('name') or t.get('name:fr') or '')[:120], round(lat, 5), round(lon, 5), osm_year(t), key])
            print(f'    {theme} / {kind} : {len(rows) - n0}')
        rows.sort(key=lambda r: (r[0], r[2], r[3]))
        write(out, f'osm-{theme}', {'title': f'{TITLES[theme]} (OpenStreetMap) : France', **OSM, 'kinds': sorted({k for k, _ in filters}), 'fields': OSM_FIELDS, 'rows': rows})


# ═════════════════════════ 🍇 dates des vendanges ═════════════════════════
GHD_URL = 'https://www.ncei.noaa.gov/pub/data/paleo/historical/europe/europe2012ghd.txt'
GHD_FR = {'Alsace': 'Alsace', 'Auvergne': 'Auvergne', 'Auxerre-Avalon': 'Auxerrois et Avallonnais', 'Beaujolais and Maconnais': 'Beaujolais et Mâconnais',
          'Bordeaux': 'Bordelais', 'Burgundy': 'Bourgogne', 'Champagne 1': 'Champagne (Marne)', 'Champagne 2': 'Champagne (Aube)', 'Gaillac- South-West': 'Gaillac et Sud-Ouest',
          'Germany': 'Allemagne (Bade-Wurtemberg)', 'High Loire Valley': 'Haute vallée de la Loire', 'Ile de France': 'Île-de-France', 'Jura': 'Jura', 'Languedoc': 'Languedoc',
          'Low Loire Valley': 'Basse vallée de la Loire', 'Luxembourg': 'Luxembourg', 'Maritime alps': 'Alpes-Maritimes', 'Northern Italy': 'Italie du Nord',
          'Northern Lorraine': 'Lorraine du Nord', 'Northern Rhône valley': 'Vallée du Rhône (nord)', 'Savoie': 'Savoie', 'Spain': 'Espagne (Rioja)',
          'Southern Lorraine': 'Lorraine du Sud', 'Southern Rhône valley': 'Vallée du Rhône (sud)', 'Switzerland (Leman Lake)': 'Suisse (Léman)',
          'Various South-East': 'Sud-Est (divers)', 'Vendée - Poitou Charente': 'Vendée, Poitou, Charentes'}


def parse_ghd(text):
    lines = text.splitlines()
    regions = []
    i = next(i for i, l in enumerate(lines) if l.startswith('Location') and 'Latitude' in l) + 1
    while lines[i].strip():
        m = re.match(r'^(.+?)\s{2,}(-?[\d.]+)\s+(-?[\d.]+)\s*$', lines[i])
        if m:
            regions.append((m.group(1).strip(), float(m.group(2)), float(m.group(3))))
        i += 1
    series = {r[0]: {} for r in regions}
    parts = [i for i, l in enumerate(lines) if re.match(r'^Daux et al\. 2012 Grape Harvest Date Data, part \d of 3', l)]
    ri = 0
    for p in parts:
        # colonnes : la ligne des codes (« Als Auv … », parfois sur la ligne « Year », parfois sur la suivante, après « 1354 ») ;
        # les valeurs sont alignées à droite sous leur code : une valeur appartient au code dont la fin est la plus proche
        h = next(j for j in range(p + 1, p + 6) if len(lines[j].split()) >= 5 and all(re.fullmatch(r'[A-Z][A-Za-z]{1,2}\d?', t) for t in lines[j].split()[1:]))
        cols = [(m.start(), m.end()) for m in re.finditer(r'\S+', lines[h])][1:]
        names = [r[0] for r in regions[ri:ri + len(cols)]]
        ri += len(cols)
        j = h + 1
        while j < len(lines) and not lines[j].startswith('Daux et al'):
            l = lines[j]
            m = re.match(r'^(\d{4})\b', l)
            if m and j != h:
                y = int(m.group(1))
                for v in re.finditer(r'-?\d+(?:\.\d+)?', l[4:]):
                    s, e = v.start() + 4, v.end() + 4
                    c = min(range(len(cols)), key=lambda k: abs(cols[k][1] - e))
                    series[names[c]][y] = float(v.group(0))
            j += 1
    return regions, series


def build_vendanges(out):
    text = wm.get(GHD_URL, 'text/plain').decode('utf-8', 'replace')
    regions, series = parse_ghd(text)
    assert series['Burgundy'].get(1354) == 15.3, 'lecture du tableau : Bourgogne 1354 ≠ 15,3'
    reg = []
    for name, lat, lon in regions:
        s = series[name]
        vals = sorted(s.values())
        reg.append({'code': name, 'n': GHD_FR.get(name, name), 'lat': lat, 'lon': lon, 'first': min(s) if s else None, 'last': max(s) if s else None,
                    'count': len(s), 'median': vals[len(vals) // 2] if vals else None})
    rows = []
    for i, (name, _, _) in enumerate(regions):
        for y, d in sorted(series[name].items()):
            rows.append([i, y, d])
    write(out, 'vendanges', {
        'title': 'Dates des vendanges en France et pays voisins, 1354–2007 (27 séries régionales)',
        'source': 'Daux, V. et al. (2012), An open-access database of grape harvest dates for climate research, Climate of the Past 8, 1403–1418 ; NOAA NCEI, World Data Service for Paleoclimatology',
        'licence': 'données en accès libre (« free of charge ; please cite ») ; article CC BY 3.0', 'licence_url': 'https://doi.org/10.5194/cp-8-1403-2012',
        'url': 'https://doi.org/10.25921/2xg2-mt70', 'note': 'jours après le 31 août (0 = 31 août, 15 = 15 septembre) ; série régionale composée de plusieurs vignobles',
        'regions': reg, 'fields': ['r', 'y', 'd'], 'rows': rows})


# ═════════════════════════ 🗣️ proverbes régionaux (Wiktionnaire, sur GitHub) ═════════════════════════
# langue (nom de la catégorie du Wiktionnaire) → régions où on la parlait ; la traduction française est la 1re définition (« # … »)
LANGS = {'breton': ['Bretagne'], 'gallo': ['Bretagne'], 'occitan': ['Occitanie', 'Nouvelle-Aquitaine', 'Provence-Alpes-Côte d’Azur', 'Auvergne-Rhône-Alpes'],
         'provençal': ['Provence-Alpes-Côte d’Azur'], 'gascon': ['Nouvelle-Aquitaine', 'Occitanie'], 'languedocien': ['Occitanie'], 'limousin': ['Nouvelle-Aquitaine'],
         'auvergnat': ['Auvergne-Rhône-Alpes'], 'alsacien': ['Grand Est'], 'francique lorrain': ['Grand Est'], 'lorrain': ['Grand Est'], 'champenois': ['Grand Est'],
         'picard': ['Hauts-de-France'], 'flamand occidental': ['Hauts-de-France'], 'normand': ['Normandie'], 'basque': ['Nouvelle-Aquitaine'], 'catalan': ['Occitanie'],
         'corse': ['Corse'], 'francoprovençal': ['Auvergne-Rhône-Alpes', 'Bourgogne-Franche-Comté'], 'poitevin-saintongeais': ['Nouvelle-Aquitaine'],
         'wallon': ['Wallonie'], 'bourguignon': ['Bourgogne-Franche-Comté'], 'franc-comtois': ['Bourgogne-Franche-Comté'], 'savoyard': ['Auvergne-Rhône-Alpes'],
         'nissart': ['Provence-Alpes-Côte d’Azur'], 'vivaro-alpin': ['Auvergne-Rhône-Alpes', 'Provence-Alpes-Côte d’Azur'], 'angevin': ['Pays de la Loire'],
         'berrichon': ['Centre-Val de Loire'], 'tourangeau': ['Centre-Val de Loire'], 'mayennais': ['Pays de la Loire']}
WIKI_CLEAN = [(r"'''?", ''), (r'\{\{[^{}|]*\|([^{}|]*)\}\}', r'\1'), (r'\{\{[^{}]*\}\}', ''), (r'\[\[[^\]|]*\|([^\]]*)\]\]', r'\1'), (r'\[\[([^\]]*)\]\]', r'\1'), (r'<[^>]+>', ''), (r'\s+', ' ')]


def clean(s):
    for a, b in WIKI_CLEAN:
        s = re.sub(a, b, s)
    return s.strip(' .;:')


def build_dictons(out):
    rows = []
    for lang, regions in LANGS.items():
        cat = f'Catégorie:Proverbes en {lang}'
        titles, cont = [], {}
        while True:
            d = wm.wiktionary({'action': 'query', 'list': 'categorymembers', 'cmtitle': cat, 'cmlimit': '500', 'cmnamespace': '0', **cont})
            titles += [m['title'] for m in d.get('query', {}).get('categorymembers', [])]
            if 'continue' not in d:
                break
            cont = {'cmcontinue': d['continue']['cmcontinue']}
        if not titles:
            continue
        print(f'    {lang} : {len(titles)} proverbes')
        for k in range(0, len(titles), 40):
            d = wm.wiktionary({'action': 'query', 'prop': 'revisions', 'rvprop': 'content', 'rvslots': 'main', 'titles': '|'.join(titles[k:k + 40])})
            for p in d.get('query', {}).get('pages', []):
                txt = ((p.get('revisions') or [{}])[0].get('slots', {}).get('main', {}).get('content', '')) or ''
                # la section de la langue, puis la 1re définition « # … » (la traduction ou l'explication en français)
                sec = re.split(r'==\s*\{\{langue\|', txt)
                body = next((s for s in sec if re.match(r'[^}]*\}\}', s) and re.search(r'\{\{S\|proverbe', s)), '')
                m = re.search(r'^#\s*([^*:#].+)$', body, re.M)
                if not m:
                    continue
                sense = clean(m.group(1))
                if not sense or len(sense) > 400:
                    continue
                rows.append([p['title'], lang, sense, ', '.join(regions), 'https://fr.wiktionary.org/wiki/' + p['title'].replace(' ', '_')])
    write(out, 'dictons', {'title': 'Proverbes des langues régionales (Wiktionnaire)', 'source': 'Wiktionnaire, catégories « Proverbes en … »',
                           'licence': 'CC BY-SA 4.0', 'licence_url': 'https://creativecommons.org/licenses/by-sa/4.0/deed.fr',
                           'url': 'https://fr.wiktionary.org/wiki/Convention:Droit_d%E2%80%99auteur', 'fields': ['p', 'lang', 'fr', 'regions', 'url'], 'rows': rows})


# ═════════════════════════ essai : petits fichiers inventés ═════════════════════════
def build_essai(out):
    fx = {'fixture': True, 'note': 'données INVENTÉES pour les essais'}
    pts = lambda k, n, lat, lon, **o: [k, n, lat, lon, o.get('f'), o.get('t'), o.get('c', 'Essaiville'), o.get('i', '99001'), 'France', o.get('mh', ''), '', 'Q1']
    themes = {'croix': [pts('calvaire', 'Calvaire d’essai', 45.0, 3.0, f=1620)], 'eau': [pts('lavoir', 'Lavoir d’essai', 45.001, 3.001, f=1850)],
              'village': [pts('four', 'Four banal d’essai', 45.002, 3.0)], 'bornes': [pts('octroi', 'Pavillon d’octroi d’essai', 45.01, 3.0, f=1820, t=1943)],
              'berger': [pts('draille', 'Draille d’essai', 45.05, 3.05)], 'cultes': [pts('temple', 'Temple d’essai', 45.003, 3.002, f=1825)]}
    for theme, rows in themes.items():
        write(out, f'wd-{theme}', {'title': TITLES[theme], **WD, **fx, 'fields': PT_FIELDS, 'rows': rows})
    write(out, 'osm-croix', {'title': TITLES['croix'], **OSM, **fx, 'fields': OSM_FIELDS, 'rows': [['croix', 'Croix d’essai', 45.004, 3.0, None, 'n1']]})
    write(out, 'cepages', {'title': 'Cépages', **WD, **fx, 'fields': ['n', 'country', 'origin', 'lat', 'lon', 'from', 'color', 'fr', 'src'],
                           'rows': [['Cépage d’essai', 'France', 'Essaiville', 45.0, 3.0, 1700, 'noir', '', 'Q2']]})
    write(out, 'vendanges', {'title': 'Vendanges', 'source': 'essai', 'licence': 'essai', **fx, 'regions': [{'code': 'X', 'n': 'Région d’essai', 'lat': 45.0, 'lon': 3.0, 'first': 1780, 'last': 1790, 'count': 2, 'median': 20.0}],
                             'fields': ['r', 'y', 'd'], 'rows': [[0, 1780, 20.0], [0, 1788, 30.0]]})
    write(out, 'dictons', {'title': 'Proverbes', 'source': 'essai', 'licence': 'CC BY-SA 4.0', **fx, 'fields': ['p', 'lang', 'fr', 'regions', 'url'],
                           'rows': [['Proverbe d’essai', 'occitan', 'Traduction d’essai.', 'Auvergne-Rhône-Alpes', 'https://fr.wiktionary.org/']]})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('what', choices=['wikidata', 'vendanges', 'osm', 'dictons', 'essai', 'tout'])
    ap.add_argument('--out', default=os.path.join(ROOT, 'assets', 'data'))
    ap.add_argument('--overpass', default='https://overpass-api.de/api/interpreter')
    a = ap.parse_args()
    if a.what in ('wikidata', 'tout'):
        build_wikidata(a.out)
    if a.what in ('vendanges', 'tout'):
        build_vendanges(a.out)
    if a.what in ('osm', 'tout'):
        build_osm(a.out, a.overpass)
    if a.what in ('dictons', 'tout'):
        build_dictons(a.out)
    if a.what == 'essai':
        build_essai(a.out)


if __name__ == '__main__':
    main()
