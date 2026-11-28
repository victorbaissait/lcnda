#!/usr/bin/env python3
"""🌐 Lot L — les packs fabriqués SEULEMENT sur GitHub (leurs sites étaient injoignables depuis l'atelier) :

  mines     ⛏ assets/data/tl-mines.json.gz — USGS, Mineral Resources Data System (MRDS), mrds-csv.zip. Les données de l'USGS sont du
            domaine public : la page « Copyrights and Credits » de l'USGS est relue et doit dire « public domain ». Gardé : les sites
            « Past Producer » / « Producer » avec une position (nom, substance, pays, État, années de production, fiche MRDS).
  lieux_gb  🗺 assets/data/tl-lieux_gb.json.gz — Ordnance Survey, OS Open Names (CSV). Licence : Open Government Licence v3 (la page de
            la licence est relue et doit dire « Open Government Licence ») ; attribution « Contains OS data © Crown copyright and
            database right ». Gardé : les hameaux, villages et « autres lieux habités » (nom, sorte, comté), positions converties
            du quadrillage britannique (OSGB36) en degrés (WGS84, transformation de Helmert : à quelques mètres près).
  bagnards  ⛓ assets/data/tl-bagnards.json.gz — State Library of Queensland, registres des bagnards envoyés en Australie (Données du
            Queensland, CKAN). La licence du jeu de données est relue (license_id doit commencer par « cc-by ») ; sinon rien.
            Gardé : nom, navire, année de départ, lieu du jugement — tous des XVIIIe-XIXe siècles (personnes décédées).
Chaque partie s'arrête (sans rien écrire) si la licence n'est plus ouverte ou si le fichier n'a plus la forme attendue.

Lancer (sur GitHub) : python3 -I scripts/telech-l/build_github_only.py [dossier de sortie] [mines lieux_gb bagnards]
"""
import csv, io, json, math, os, re, sys, time, urllib.parse, zipfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
args = sys.argv[1:]
OUT = args[0] if args and not re.match(r'^[a-z_]+$', args[0]) else os.path.join(ROOT, 'assets', 'data')
WANT = [a for a in args if re.match(r'^[a-z_]+$', a)] or ['mines', 'lieux_gb', 'bagnards']
idx = lambda L, v: (L.index(v) if v in L else (L.append(v) or len(L) - 1))


def page_says(url, words):
    t = wm.get(url, 'text/html').decode('utf-8', 'replace')
    return all(w.lower() in t.lower() for w in words)


def mines():
    if not page_says('https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits', ['public domain']):
        sys.exit('USGS : la page « Copyrights and Credits » ne dit plus « public domain »')
    z = zipfile.ZipFile(io.BytesIO(wm.get('https://mrdata.usgs.gov/mrds/mrds-csv.zip', '*/*')))
    name = next(n for n in z.namelist() if n.lower().endswith('.csv'))
    rd = csv.DictReader(io.TextIOWrapper(z.open(name), encoding='utf-8', errors='replace'))
    need = {'site_name', 'latitude', 'longitude', 'dev_stat'}
    if not need <= set(rd.fieldnames or []):
        sys.exit(f'MRDS : colonnes inattendues {rd.fieldnames[:12]}')
    rows, cy, st, com, stat = [], [], [], [], []
    yr = lambda v: int(v) if re.match(r'^\d{4}$', (v or '').strip()) else None
    for r in rd:
        if r.get('dev_stat') not in ('Past Producer', 'Producer'):
            continue
        try:
            lat, lon = round(float(r['latitude']), 4), round(float(r['longitude']), 4)
        except ValueError:
            continue
        u = (r.get('url') or '').strip()
        rows.append([r['site_name'][:120], lat, lon, (r.get('commod1') or '').split(',')[0].strip()[:40], r.get('country') or '', r.get('state') or '',
                     yr(r.get('yr_fst_prd')), yr(r.get('yr_lst_prd')), r['dev_stat'], u if re.match(r'^https://mrdata\.usgs\.gov/[^\s"<>]+$', u) else ''])
    assert len(rows) > 10000, len(rows)
    return {'source': 'USGS, Mineral Resources Data System (MRDS)', 'licence': 'Domaine public (USGS)', 'licence_url': 'https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits',
            'url': 'https://mrdata.usgs.gov/mrds/', 'what': 'Mines et gisements exploités (« Past Producer », « Producer ») du monde', 'fields': ['n', 'lat', 'lon', 'c', 'cy', 'st', 'y1', 'y2', 's', 'u'], 'rows': rows}


def osgb_to_wgs84(E, N):
    """quadrillage britannique (OSGB36, Airy 1830) → WGS84 (Helmert à 7 paramètres) — formules de l'Ordnance Survey"""
    a, b = 6377563.396, 6356256.909; F0 = 0.9996012717; lat0, lon0 = math.radians(49), math.radians(-2); N0, E0 = -100000, 400000
    e2 = 1 - b * b / (a * a); n = (a - b) / (a + b)
    lat, M = lat0, 0
    while N - N0 - M >= 1e-5:
        lat = (N - N0 - M) / (a * F0) + lat
        M = b * F0 * ((1 + n + 1.25 * n * n + 1.25 * n ** 3) * (lat - lat0) - (3 * n + 3 * n * n + 2.625 * n ** 3) * math.sin(lat - lat0) * math.cos(lat + lat0)
                      + (1.875 * n * n + 1.875 * n ** 3) * math.sin(2 * (lat - lat0)) * math.cos(2 * (lat + lat0)) - (35 / 24) * n ** 3 * math.sin(3 * (lat - lat0)) * math.cos(3 * (lat + lat0)))
    s, c, t = math.sin(lat), math.cos(lat), math.tan(lat)
    nu = a * F0 / math.sqrt(1 - e2 * s * s); rho = a * F0 * (1 - e2) / (1 - e2 * s * s) ** 1.5; eta2 = nu / rho - 1
    VII = t / (2 * rho * nu); VIII = t / (24 * rho * nu ** 3) * (5 + 3 * t * t + eta2 - 9 * t * t * eta2); IX = t / (720 * rho * nu ** 5) * (61 + 90 * t * t + 45 * t ** 4)
    X = 1 / (c * nu); XI = 1 / (c * 6 * nu ** 3) * (nu / rho + 2 * t * t); XII = 1 / (c * 120 * nu ** 5) * (5 + 28 * t * t + 24 * t ** 4); XIIA = 1 / (c * 5040 * nu ** 7) * (61 + 662 * t * t + 1320 * t ** 4 + 720 * t ** 6)
    dE = E - E0
    phi = lat - VII * dE ** 2 + VIII * dE ** 4 - IX * dE ** 6
    lam = lon0 + X * dE - XI * dE ** 3 + XII * dE ** 5 - XIIA * dE ** 7
    # vers le géocentrique (Airy), Helmert OSGB36 → WGS84, puis GRS80/WGS84
    sp, cp = math.sin(phi), math.cos(phi); nu1 = a / math.sqrt(1 - e2 * sp * sp)
    x1, y1, z1 = nu1 * cp * math.cos(lam), nu1 * cp * math.sin(lam), (1 - e2) * nu1 * sp
    tx, ty, tz, sc = 446.448, -125.157, 542.060, -20.4894e-6
    rx, ry, rz = [math.radians(v / 3600) for v in (0.1502, 0.2470, 0.8421)]
    x2 = tx + (1 + sc) * x1 - rz * y1 + ry * z1; y2 = ty + rz * x1 + (1 + sc) * y1 - rx * z1; z2 = tz - ry * x1 + rx * y1 + (1 + sc) * z1
    a2, b2 = 6378137.0, 6356752.3142; e22 = 1 - b2 * b2 / (a2 * a2); p = math.hypot(x2, y2)
    la = math.atan2(z2, p * (1 - e22))
    for _ in range(6):
        nu2 = a2 / math.sqrt(1 - e22 * math.sin(la) ** 2); la = math.atan2(z2 + e22 * nu2 * math.sin(la), p)
    return math.degrees(la), math.degrees(math.atan2(y2, x2))


def lieux_gb():
    if not page_says('https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/', ['Open Government Licence']):
        sys.exit('OGL v3 : la page de la licence ne dit plus « Open Government Licence »')
    z = zipfile.ZipFile(io.BytesIO(wm.get('https://api.os.uk/downloads/v1/products/OpenNames/downloads?area=GB&format=CSV&redirect', '*/*')))
    head_name = next(n for n in z.namelist() if re.search(r'header', n, re.I) and n.lower().endswith('.csv'))
    head = next(csv.reader(io.TextIOWrapper(z.open(head_name), encoding='utf-8-sig')))
    need = {'NAME1', 'LOCAL_TYPE', 'GEOMETRY_X', 'GEOMETRY_Y'}
    if not need <= set(head):
        sys.exit(f'OS Open Names : en-tête inattendu {head[:12]}')
    H = {h: i for i, h in enumerate(head)}
    county = next((h for h in ('COUNTY_UNITARY', 'DISTRICT_BOROUGH') if h in H), None)
    rows, kinds, counties = [], [], []
    for n in z.namelist():
        if not re.search(r'(^|/)data/.*\.csv$', n, re.I):   # « Data/HP40.csv » (sans « / » devant) dans le zip de l'OS
            continue
        for r in csv.reader(io.TextIOWrapper(z.open(n), encoding='utf-8')):
            if len(r) < len(head) or r[H['LOCAL_TYPE']] not in ('Hamlet', 'Village', 'Other Settlement'):
                continue
            try:
                lat, lon = osgb_to_wgs84(float(r[H['GEOMETRY_X']]), float(r[H['GEOMETRY_Y']]))
            except ValueError:
                continue
            rows.append([r[H['NAME1']][:80], idx(kinds, r[H['LOCAL_TYPE']]), idx(counties, r[H[county]] if county else ''), round(lat, 5), round(lon, 5)])
    if len(rows) <= 20000:
        raise RuntimeError(f'{len(rows)} lieux ; fichiers du zip : {z.namelist()[:8]}')
    return {'source': 'Ordnance Survey, OS Open Names — Contains OS data © Crown copyright and database right', 'licence': 'Open Government Licence v3.0',
            'licence_url': 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/', 'url': 'https://www.ordnancesurvey.co.uk/products/os-open-names', 'country': ['GB'],
            'what': 'Hameaux, villages et autres lieux habités de Grande-Bretagne', 'kinds': kinds, 'counties': counties, 'fields': ['n', 'k', 'c', 'lat', 'lon'], 'rows': rows}


def bagnards():
    api = 'https://www.data.qld.gov.au/api/3/action/package_search?q=convict%20transportation%20registers&rows=10'
    pks = [p for p in json.loads(wm.get(api))['result']['results'] if re.search(r'convict', p.get('title', ''), re.I)]
    if not pks:
        sys.exit('Queensland : jeu de données des bagnards introuvable')
    rd = None
    for pk in pks:
        if not str(pk.get('license_id', '')).lower().startswith('cc-by'):
            print(f"Queensland : {pk.get('name')} sous licence {pk.get('license_id')} — pas CC BY : laissé", flush=True)
            continue
        for res in pk.get('resources', []):
            if str(res.get('format', '')).lower() != 'csv':
                continue
            print(f"Queensland : {pk.get('name')} → {res.get('name')} {res.get('url')}", flush=True)
            text = ''
            try:
                text = wm.get(res['url'], 'text/csv,*/*').decode('utf-8-sig', 'replace')
            except Exception as e:  # noqa
                print(f'  fichier refusé ({e})', flush=True)
            if not text.strip() and res.get('datastore_active'):
                # le fichier ne vient pas : la même table par l'API « datastore » de CKAN (mêmes données, même licence)
                recs, off = [], 0
                while True:
                    d = json.loads(wm.get('https://www.data.qld.gov.au/api/3/action/datastore_search?' + urllib.parse.urlencode({'resource_id': res['id'], 'limit': 32000, 'offset': off})))['result']
                    recs += d.get('records', [])
                    off += 32000
                    if off >= d.get('total', 0) or not d.get('records'):
                        break
                fields = [f['id'] for f in d.get('fields', []) if f['id'] != '_id']
                buf = io.StringIO(); w = csv.DictWriter(buf, fields, extrasaction='ignore'); w.writeheader(); w.writerows(recs)
                text = buf.getvalue()
            print(f'  {len(text)} caractères ; début : {text[:160]!r}', flush=True)
            cand = csv.DictReader(io.StringIO(text))
            if cand.fieldnames and any('name' in c.lower() for c in cand.fieldnames):
                rd = cand; break
        if rd:
            break
    if not rd:
        sys.exit('Queensland : aucun fichier CSV lisible (voir ci-dessus)')
    cols = [c.lower() for c in rd.fieldnames or []]
    pick = lambda *keys: next((rd.fieldnames[i] for i, c in enumerate(cols) if any(k in c for k in keys)), None)
    cn, cs, cy, cp = pick('name'), pick('ship', 'vessel'), pick('year', 'date', 'departure'), pick('place', 'court', 'tried', 'county')
    if not cn:
        sys.exit(f'Queensland : colonnes inattendues {rd.fieldnames}')
    rows, ships = [], []
    for r in rd:
        m = re.search(r'(1[78]\d\d)', r.get(cy) or '') if cy else None
        y = int(m.group(1)) if m else None
        if y is None or y > int(time.strftime('%Y')) - 110:
            continue
        rows.append([(r.get(cn) or '').strip()[:100], idx(ships, (r.get(cs) or '').strip()[:60]) if cs else 0, y, (r.get(cp) or '').strip()[:80] if cp else ''])
    assert len(rows) > 1000, len(rows)
    return {'source': 'State Library of Queensland, Convict transportation registers', 'licence': 'CC BY 4.0', 'licence_url': 'https://creativecommons.org/licenses/by/4.0/deed.fr',
            'url': 'https://www.slq.qld.gov.au/', 'country': ['AU', 'GB', 'IE'], 'what': 'Bagnards envoyés de Grande-Bretagne et d’Irlande en Australie (1787-1868)',
            'ships': ships, 'fields': ['n', 's', 'y', 'p'], 'rows': [[r[0], ships[r[1]] if ships else '', r[2], r[3]] for r in rows]}


def main():
    for k in WANT:
        f = {'mines': mines, 'lieux_gb': lieux_gb, 'bagnards': bagnards}.get(k)
        if not f:
            print('inconnu :', k); continue
        try:
            meta = {**f(), 'built': wm.today()}
        except SystemExit as e:
            print(f'tl-{k} : arrêté — {e}', flush=True); continue
        except Exception as e:  # noqa
            print(f'tl-{k} : raté ({e})', flush=True); continue
        size = wm.write_gz(OUT, f'tl-{k}.json.gz', meta)
        print(f'tl-{k} : {len(meta["rows"])} lignes, {size} octets', flush=True)


if __name__ == '__main__':
    main()
