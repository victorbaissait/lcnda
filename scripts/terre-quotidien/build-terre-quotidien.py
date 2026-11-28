#!/usr/bin/env python3
"""🌍 Terre au quotidien — fabrique les fichiers assets/data/tq-*.json(.gz) à partir des sources téléchargées.

Chaque fichier garde sa source, sa licence et son lien ; aucun chiffre n'est ajouté à la main, sauf les petites listes
recopiées d'un article (pièces, tarifs de la lettre) dont chaque ligne cite sa page.

  tq-meteorites.json   ☄️ chutes de météorites observées (« Fell »)     NASA Open Data Portal / The Meteoritical Society
  tq-climat.json       🌡️ température de chaque année                    Met Office HadCET (OGL v3) ; Berkeley Earth (CC BY-NC 4.0)
  tq-glaciers.json     🏔️ position du front des glaciers des Alpes et des Pyrénées   WGMS Fluctuations of Glaciers (citation demandée)
  tq-arbres.json.gz    🌳 arbres remarquables                             Wikidata (CC0)
  tq-sites.json.gz     🏺 sites préhistoriques et antiques                Wikidata (CC0)
  tq-poche.json        🪙 pièces de monnaie d'usage courant               Wikipédia (CC BY-SA 4.0) + images Wikimedia Commons
  tq-timbre.json       ✉️ tarif de la lettre simple                       Wikipédia (CC BY-SA 4.0)
  tq-esperance.json    ⏳ espérance de vie à divers âges                   Insee (Licence ouverte 2.0)

Usage : python3 -I scripts/terre-quotidien/build-terre-quotidien.py --cache DOSSIER
Le dossier garde les téléchargements (on peut relancer sans réseau). Les requêtes Wikidata passent une par minute.
"""
import argparse, collections, csv, datetime as dt, gzip, io, json, math, os, re, sys, time, urllib.parse, urllib.request, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'assets', 'data')
UA = 'genealogy-dataset-builder/1.0 (https://meta.wikimedia.org/wiki/User-Agent_policy; one request at a time)'
TODAY = dt.date.today().isoformat()


def fetch(url, path, data=None, accept=None, tries=8):
    """télécharge une fois (gardé dans le cache)"""
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return path
    os.makedirs(os.path.dirname(path), exist_ok=True)
    for i in range(tries):
        try:
            h = {'User-Agent': UA}
            if accept: h['Accept'] = accept
            req = urllib.request.Request(url, data=data, headers=h)
            with urllib.request.urlopen(req, timeout=300) as r:
                b = r.read()
            if b.startswith(b'You are making too many'): raise RuntimeError('ratelimited')
            with open(path + '.part', 'wb') as f: f.write(b)
            os.replace(path + '.part', path)
            return path
        except Exception as e:  # noqa: BLE001
            if '404' in str(e): raise
            print(f'  … {url[:80]} : {e} (essai {i + 1})', file=sys.stderr); time.sleep(20 + 30 * i)
    raise RuntimeError('téléchargement impossible : ' + url)


def sparql(query, path):
    """une requête Wikidata (CSV) ; le service limite à une requête par minute"""
    if os.path.exists(path) and os.path.getsize(path) > 0: return path
    url = 'https://query.wikidata.org/sparql'
    for i in range(12):
        try:
            return fetch(url, path, data=urllib.parse.urlencode({'query': query}).encode(), accept='text/csv', tries=1)
        except Exception as e:  # noqa: BLE001
            print('  … wikidata', e, file=sys.stderr); time.sleep(70)
    raise RuntimeError('Wikidata ne répond pas')


def write(name, obj, gz=False):
    s = json.dumps(obj, ensure_ascii=False, separators=(',', ':'))
    p = os.path.join(OUT, name)
    if gz:
        with open(p, 'wb') as f: f.write(gzip.compress(s.encode(), 9, mtime=0))
    else:
        with open(p, 'w', encoding='utf-8') as f: f.write(s)
    print(f'{name} : {os.path.getsize(p) / 1024:.0f} Ko')


r4 = lambda x: round(float(x), 4)

# ═══════════════════ ☄️ météorites ═══════════════════
MET_URL = 'https://data.nasa.gov/docs/legacy/meteorite_landings/Meteorite_Landings.csv'


def build_meteorites(cache):
    p = fetch(MET_URL, os.path.join(cache, 'met', 'Meteorite_Landings.csv'))
    rows = []
    for r in csv.DictReader(open(p, encoding='utf-8')):
        if r['fall'] != 'Fell' or not r['year'] or not r['reclat'] or not r['reclong']: continue
        lat, lon = float(r['reclat']), float(r['reclong'])
        if lat == 0 and lon == 0: continue
        y = int(float(r['year'][:4] if '-' in r['year'][:5] else r['year']))
        mass = round(float(r['mass (g)'])) if r['mass (g)'] else None
        rows.append([r['name'], y, r4(lat), r4(lon), mass, r['recclass']])
    rows.sort(key=lambda x: (x[1], x[0]))
    write('tq-meteorites.json', {
        'src': 'The Meteoritical Society, Meteoritical Bulletin Database — « Meteorite Landings », NASA Open Data Portal',
        'url': 'https://data.nasa.gov/dataset/meteorite-landings', 'file': MET_URL,
        'licence': 'Données publiques du portail NASA Open Data (aucune restriction indiquée ; « license not specified »)',
        'note': 'Seulement les chutes observées (« Fell ») avec une année et une position. La base donne l’année, pas le jour.',
        'built': TODAY, 'cols': ['nom', 'année', 'lat', 'lon', 'masse_g', 'classe'], 'rows': rows})


# ═══════════════════ 🌡️ climat ═══════════════════
CET_URL = 'https://www.metoffice.gov.uk/hadobs/hadcet/data/meantemp_monthly_totals.txt'
BE_URL = 'https://berkeley-earth-temperature.s3.us-west-1.amazonaws.com/Regional/TAVG/{}-TAVG-Trend.txt'
# code pays (ISO) → [fichier Berkeley Earth, nom en français]
BE = {'FR': ['france-(europe)', 'France'], 'BE': ['belgium', 'Belgique'], 'CH': ['switzerland', 'Suisse'], 'LU': ['luxembourg', 'Luxembourg'],
      'DE': ['germany', 'Allemagne'], 'IT': ['italy', 'Italie'], 'ES': ['spain', 'Espagne'], 'NL': ['netherlands-(europe)', 'Pays-Bas'],
      'AT': ['austria', 'Autriche'], 'PT': ['portugal', 'Portugal'], 'DK': ['denmark-(europe)', 'Danemark'], 'GB': ['united-kingdom-(europe)', 'Royaume-Uni']}


def build_climat(cache):
    series = {}
    p = fetch(CET_URL, os.path.join(cache, 'cet', 'meantemp_monthly_totals.txt'))
    vals = {}
    for line in open(p, encoding='utf-8', errors='replace'):
        f = line.split()
        if len(f) == 14 and f[0].isdigit():
            a = float(f[13])
            if a > -99: vals[int(f[0])] = round(a, 2)
    y0 = min(vals); series['CET'] = {'n': 'Angleterre centrale', 'abs': True, 'y0': y0, 'v': [vals.get(y) for y in range(y0, max(vals) + 1)],
                                     'src': 'Met Office Hadley Centre, HadCET (Central England Temperature) — Manley 1974 ; Parker et al. 1992 ; Parker & Horton 2005',
                                     'url': 'https://www.metoffice.gov.uk/hadobs/hadcet/', 'licence': 'Open Government Licence v3.0 (© Crown Copyright)'}
    for cc, (fn, name) in BE.items():
        p = fetch(BE_URL.format(urllib.parse.quote(fn)), os.path.join(cache, 'be', fn + '.txt'))
        months = collections.defaultdict(dict)
        for line in open(p, encoding='utf-8', errors='replace'):
            if line.startswith('%') or not line.strip(): continue
            f = line.split()
            if len(f) < 3 or f[2] == 'NaN': continue
            months[int(f[0])][int(f[1])] = float(f[2])
        ann = {y: round(sum(m.values()) / 12, 2) for y, m in months.items() if len(m) == 12}  # l'année entière seulement
        y0, y1 = min(ann), max(ann)
        series[cc] = {'n': name, 'abs': False, 'y0': y0, 'v': [ann.get(y) for y in range(y0, y1 + 1)],
                      'src': f'Berkeley Earth, série régionale « {fn} » (moyenne des 12 mois, écart à 1951-1980)',
                      'url': 'https://berkeleyearth.org/data/', 'file': BE_URL.format(fn), 'licence': 'CC BY-NC 4.0 — Berkeley Earth (www.berkeleyearth.org)'}
    write('tq-climat.json', {'built': TODAY, 'note': 'Températures moyennes de chaque année (HadCET : °C ; Berkeley Earth : écart à la moyenne 1951-1980, °C). '
                             'L’app compare une année à la moyenne de son siècle (calendaire : 1801-1900…).', 'series': series})


# ═══════════════════ 🏔️ glaciers ═══════════════════
WGMS_URL = 'https://wgms.ch/downloads/DOI-WGMS-FoG-2026-02-10.zip'
WGMS_CC = ('FR', 'CH', 'IT', 'AT', 'DE', 'ES', 'SI', 'AD', 'LI')
TOL = 200  # jours : deux relevés qui se suivent à quelques mois près


def _ord(s): return dt.date.fromisoformat(s).toordinal()


def _segments(rows):
    """chaque série de relevés, remontée de la fin vers le début : {date: position du front (m) par rapport à la fin du morceau}"""
    bys = collections.defaultdict(list)
    for r in rows: bys[r['series_id']].append(r)
    segs = []
    for rs in bys.values():
        rs = sorted(rs, key=lambda r: r['end_date'])

        def prev(b):
            c = [r for r in rs if r['begin_date'] < b and abs(_ord(r['end_date']) - _ord(b)) <= TOL]
            return min(c, key=lambda r: abs(_ord(r['end_date']) - _ord(b))) if c else None
        used = set()
        for r in reversed(rs):
            if id(r) in used: continue
            pts, cur, pos = {r['end_date']: 0.0}, r, 0.0
            while cur is not None and id(cur) not in used:
                used.add(id(cur)); pos -= float(cur['length_change']); pts[cur['begin_date']] = pos; cur = prev(cur['begin_date'])
            segs.append(pts)
    return segs


def _curve(rows):
    """la position du front, du plus ancien relevé au plus récent (0 = le dernier relevé) : les morceaux sont recollés là où ils se touchent"""
    segs = _segments(rows)
    acc = dict(max(segs, key=lambda p: (max(p), len(p))))
    changed = True
    while changed:
        changed = False; first = min(acc)
        for p in sorted(segs, key=lambda p: min(p)):
            if min(p) >= first: continue
            best = None
            for d in p:
                for a in acc:
                    k = abs(_ord(d) - _ord(a))
                    if k <= TOL and (best is None or k < best[0]): best = (k, d, a)
            if not best: continue
            off = acc[best[2]] - p[best[1]]
            for k, v in p.items():
                if k < first: acc[k] = v + off
            changed = True; break
    return sorted(acc.items())


def build_glaciers(cache):
    p = fetch(WGMS_URL, os.path.join(cache, 'wgms', 'fog.zip'))
    z = zipfile.ZipFile(p)
    G = {r['id']: r for r in csv.DictReader(io.TextIOWrapper(z.open('data/glacier.csv'), encoding='utf-8'))}
    fv = collections.defaultdict(list)
    for r in csv.DictReader(io.TextIOWrapper(z.open('data/front_variation.csv'), encoding='utf-8')):
        if r['country'] in WGMS_CC and r['length_change'] != '' and r['begin_date'] and r['end_date']:
            fv[r['glacier_id']].append(r)
    meta = json.load(z.open('datapackage.json'))
    out = []
    for gid, rows in fv.items():
        g = G.get(gid)
        if not g or not g['latitude']: continue
        c = _curve(rows)
        if len(c) < 3 or int(c[-1][0][:4]) - int(c[0][0][:4]) < 15: continue
        by_year = {}
        for d, v in c: by_year[int(d[:4])] = round(v)  # un point par année (le dernier de l'année)
        name = (g['names'] or '').split('|')[0].strip() or g['short_name'].title()
        out.append({'id': int(gid), 'n': name, 'cc': g['country'], 'lat': r4(g['latitude']), 'lon': r4(g['longitude']),
                    'last': int(c[-1][0][:4]), 'p': sorted(by_year.items())})
    out.sort(key=lambda g: g['id'])
    write('tq-glaciers.json', {'src': meta['citation'], 'url': meta['id'], 'licence': meta['usageTerms'], 'built': TODAY,
                               'note': 'Position du front (m) par rapport au dernier relevé : + = le glacier descendait plus bas. '
                                       'Additions des variations de longueur de la base FoG (front_variation), séries recollées quand elles se touchent.',
                               'glaciers': out})


# ═══════════════════ 🌳 arbres et 🏺 sites (Wikidata) ═══════════════════
TREES_Q = '''SELECT ?item ?itemLabel ?lat ?lon ?inc ?prec ?cc ?speciesLabel ?frwiki WHERE {
  ?cls wdt:P279* wd:Q10884 .
  ?item wdt:P31 ?cls ; p:P625/psv:P625 [ wikibase:geoLatitude ?lat ; wikibase:geoLongitude ?lon ] .
  FILTER(?lat > 35 && ?lat < 60 && ?lon > -11 && ?lon < 25)
  OPTIONAL { ?item p:P571/psv:P571 [ wikibase:timeValue ?inc ; wikibase:timePrecision ?prec ] }
  OPTIONAL { ?item wdt:P17/wdt:P297 ?cc }
  OPTIONAL { ?item wdt:P171 ?species }
  OPTIONAL { ?frwiki schema:about ?item ; schema:isPartOf <https://fr.wikipedia.org/> }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en,de,nl,it,es,cs,pl". }
}'''
# les sortes de sites gardées (une requête par sorte : la requête d'ensemble dépasse le temps permis)
SITE_KINDS = [
    ('Q11269813', 'grotte', 'grotte ornée'), ('Q1149405', 'abri', 'abri sous roche'), ('Q56320584', 'prehist', 'site préhistorique'),
    ('Q101659', 'dolmen', 'dolmen'), ('Q1428504', 'dolmen', 'allée couverte'), ('Q1426772', 'dolmen', 'tombe à couloir'),
    ('Q10521078', 'dolmen', 'tombe mégalithique'), ('Q585490', 'dolmen', 'cairn'), ('Q1399576', 'dolmen', 'ciste'),
    ('Q193475', 'menhir', 'menhir'), ('Q2330559', 'menhir', 'pierre dressée'), ('Q164240', 'menhir', 'mégalithe'), ('Q1935728', 'menhir', 'cercle de pierres'),
    ('Q34023', 'tumulus', 'tumulus'), ('Q18292693', 'tumulus', 'tumulus'), ('Q120804029', 'tumulus', 'groupe de tumulus'),
    ('Q192601', 'oppidum', 'oppidum'), ('Q124478977', 'oppidum', 'éperon barré'), ('Q125856556', 'oppidum', 'site celtique'), ('Q5375483', 'oppidum', 'enceinte'),
    ('Q918230', 'villa', 'villa romaine'), ('Q21752084', 'romain', 'site romain'), ('Q15661340', 'romain', 'ville antique'), ('Q19757', 'romain', 'théâtre romain'),
    ('Q200141', 'necropole', 'nécropole'), ('Q65007262', 'gravure', 'roches gravées'), ('Q839954', 'site', 'site archéologique')]
SITE_Q = '''SELECT ?item ?fr ?en ?lat ?lon ?frwiki WHERE {
  ?item wdt:P31 wd:%s ; p:P625/psv:P625 [ wikibase:geoLatitude ?lat ; wikibase:geoLongitude ?lon ; wikibase:geoGlobe wd:Q2 ] .
  FILTER(?lat > 41.2 && ?lat < 51.6 && ?lon > -5.6 && ?lon < 10.6)
  OPTIONAL { ?item rdfs:label ?fr FILTER(lang(?fr)="fr") }
  OPTIONAL { ?item rdfs:label ?en FILTER(lang(?en)="en") }
  OPTIONAL { ?frwiki schema:about ?item ; schema:isPartOf <https://fr.wikipedia.org/> }
}'''
QID = re.compile(r'Q\d+$')
WIKI = lambda u: urllib.parse.unquote(u.rsplit('/wiki/', 1)[1]).replace('_', ' ') if u and '/wiki/' in u else ''


def build_arbres(cache):
    p = sparql(TREES_Q, os.path.join(cache, 'wd', 'trees.csv'))
    by = {}
    for r in csv.DictReader(open(p, encoding='utf-8')):
        q = QID.search(r['item']).group(0)
        name = r['itemLabel'] if not QID.fullmatch(r['itemLabel'] or '') else ''
        if not name: continue
        t = by.setdefault(q, {'q': q, 'n': name, 'lat': r4(r['lat']), 'lon': r4(r['lon']), 'y': None, 'pr': None, 'cc': r['cc'] or '', 'sp': '', 'w': ''})
        if r['inc'] and t['y'] is None:
            m = re.match(r'(-?\d+)-', r['inc'])
            if m: t['y'], t['pr'] = int(m.group(1)), int(r['prec'] or 9)
        if r['speciesLabel'] and not QID.fullmatch(r['speciesLabel']): t['sp'] = t['sp'] or r['speciesLabel']
        t['w'] = t['w'] or WIKI(r['frwiki'])
    rows = [[t['q'], t['n'], t['lat'], t['lon'], t['y'], t['pr'], t['sp'], t['cc'], t['w']] for t in sorted(by.values(), key=lambda t: int(t['q'][1:]))]
    write('tq-arbres.json.gz', {'src': 'Wikidata — éléments « arbre » (Q10884 et ses sous-classes) avec une position ; date de plantation ou d’origine : P571',
                                'url': 'https://www.wikidata.org/', 'licence': 'CC0 1.0 (domaine public)', 'built': TODAY,
                                'note': 'pr = précision de la date (Wikidata) : 9 année, 8 décennie, 7 siècle, 6 millénaire.',
                                'cols': ['qid', 'nom', 'lat', 'lon', 'année', 'précision', 'espèce', 'pays', 'wikipédia_fr'], 'rows': rows}, gz=True)


def build_sites(cache):
    by = {}
    for qcls, kind, _label in SITE_KINDS:
        p = sparql(SITE_Q % qcls, os.path.join(cache, 'wd', 'arch', qcls + '.csv'))
        for r in csv.DictReader(open(p, encoding='utf-8')):
            q = QID.search(r['item']).group(0)
            name = r['fr'] or r['en']
            if not name: continue
            s = by.get(q)
            if s is None: by[q] = s = {'q': q, 'n': name, 'lat': r4(r['lat']), 'lon': r4(r['lon']), 'k': kind, 'w': ''}
            elif s['k'] in ('site', 'prehist', 'romain') and kind not in ('site',): s['k'] = kind  # la sorte la plus précise
            s['w'] = s['w'] or WIKI(r['frwiki'])
    rows = [[s['q'], s['n'], s['lat'], s['lon'], s['k'], s['w']] for s in sorted(by.values(), key=lambda s: int(s['q'][1:]))]
    kinds = {}
    for _q, k, label in SITE_KINDS: kinds.setdefault(k, label)
    write('tq-sites.json.gz', {'src': 'Wikidata — sites archéologiques, grottes ornées, dolmens, menhirs, tumulus, oppidums, villas romaines… (France, Belgique, Suisse, Luxembourg et alentours)',
                               'url': 'https://www.wikidata.org/', 'licence': 'CC0 1.0 (domaine public)', 'built': TODAY,
                               'classes': [[q, k, label] for q, k, label in SITE_KINDS], 'kinds': kinds,
                               'cols': ['qid', 'nom', 'lat', 'lon', 'sorte', 'wikipédia_fr'], 'rows': rows}, gz=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--cache', required=True)
    ap.add_argument('--only', default='')
    a = ap.parse_args()
    steps = {'meteorites': build_meteorites, 'climat': build_climat, 'glaciers': build_glaciers, 'arbres': build_arbres, 'sites': build_sites,
             'poche': build_poche, 'timbre': build_timbre, 'esperance': build_esperance}
    for k, f in steps.items():
        if a.only and k not in a.only.split(','): continue
        print('—', k); f(os.path.abspath(a.cache))


if __name__ == '__main__':
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from curated import build_poche, build_timbre, build_esperance  # noqa: E402  (listes recopiées, à côté)
    main()
