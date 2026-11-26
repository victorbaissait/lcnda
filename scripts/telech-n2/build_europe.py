#!/usr/bin/env python3
"""LCNDA — lot N2 des téléchargements : les communes d'Europe et leurs changements, d'après les instituts officiels.
Fabriqué sur GitHub (.github/workflows/telech-n2.yml) : ces sites ne sont pas joignables depuis l'atelier de développement.

    python3 -I scripts/telech-n2/build_europe.py OUT_DIR [lau] [istat] [ofs] [quebec] [lux]

  🇪🇺 tn2-lau           Eurostat GISCO, unités administratives locales (LAU) : chaque commune d'Europe, son centre, son pays
  🇮🇹 tn2-it-variazioni ISTAT, communes supprimées, créées, renommées (Variazioni amministrative)
  🇨🇭 tn2-ch-communes   OFS, répertoire historisé des communes de Suisse : les mutations (fusions, changements de nom) depuis 1848
  🍁 tn2-qc-toponymes   Commission de toponymie du Québec (Données Québec) : noms de lieux, y compris les anciens
  🇱🇺 tn2-lu-communes   data.public.lu : anciennes communes et fusions du Luxembourg

LA LICENCE EST LUE À CHAQUE FABRICATION, sur la page officielle : si la phrase d'une licence ouverte (CC BY 4.0, CC0, Licence
OPEN BY de l'OFS…) n'y est pas, rien n'est fabriqué pour cette source (« lien seulement » dans l'app) et le script passe à la
suivante sans erreur. Ce qui a été lu est noté dans le pack (licence_quote) et dans le journal du workflow.
"""
import csv
import html
import io
import json
import math
import os
import re
import sys
import urllib.parse
import zipfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm  # noqa: E402


def text_of(url):
    t = wm.get(url, 'text/html').decode('utf-8', 'replace')
    t = re.sub(r'<script.*?</script>|<style.*?</style>', ' ', t, flags=re.S)
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', t)))


def licence(name, url, pats):
    """la phrase de licence lue sur la page officielle, ou None (→ lien seulement)"""
    try:
        t = text_of(url)
    except Exception as e:  # noqa
        print(f'{name} : page de licence illisible ({url}) : {e} → lien seulement')
        return None
    for p in pats:
        m = re.search(p, t, re.I)
        if m:
            i = max(0, m.start() - 160)
            q = t[i:m.end() + 160].strip()
            print(f'{name} : licence lue sur {url} : « …{q}… »')
            return q
    print(f'{name} : aucune licence ouverte lue sur {url} → lien seulement (rien n’est fabriqué)')
    return None


def table_rows(body, name=''):
    """CSV (; , ou tabulation), XLSX ou ZIP contenant l'un d'eux → liste de dict"""
    if body[:2] == b'PK':
        z = zipfile.ZipFile(io.BytesIO(body))
        names = [n for n in z.namelist() if re.search(r'\.(csv|txt|xlsx)$', n, re.I)]
        if not names:
            raise RuntimeError(f'{name} : rien de lisible dans le zip')
        inner = z.read(names[0])
        if names[0].lower().endswith('.xlsx'):
            return xlsx_rows(inner)
        body = inner
    for enc in ('utf-8-sig', 'cp1252', 'latin-1'):
        try:
            txt = body.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    first = txt.split('\n', 1)[0]
    delim = max([';', ',', '\t'], key=first.count)
    return list(csv.DictReader(io.StringIO(txt), delimiter=delim))


def xlsx_rows(b):
    import openpyxl  # pip install openpyxl (dans le workflow)
    wb = openpyxl.load_workbook(io.BytesIO(b), read_only=True, data_only=True)
    ws = wb[wb.sheetnames[0]]
    it = ws.iter_rows(values_only=True)
    hdr = None
    out = []
    for row in it:
        if hdr is None:
            if sum(1 for c in row if c) >= 3:
                hdr = [str(c or '').strip() for c in row]
            continue
        out.append({hdr[i]: row[i] for i in range(min(len(hdr), len(row)))})
    return out


def col(row, *pats):
    for k in row:
        if k and any(re.search(p, str(k), re.I) for p in pats):
            v = row[k]
            if v not in (None, ''):
                return str(v).strip()
    return ''


# ───────── 🇪🇺 GISCO LAU ─────────
def lau(out):
    q = licence('GISCO LAU', 'https://ec.europa.eu/eurostat/web/gisco/geodata/statistical-units/local-administrative-units',
                [r'CC[ -]BY[ -]4\.0', r'Creative Commons Attribution 4\.0', r'free of charge and may be used .{0,40}commercial'])
    if not q:
        return
    D = json.loads(wm.get('https://gisco-services.ec.europa.eu/distribution/v2/lau/datasets.json'))
    years = sorted((k for k in D if re.search(r'\d{4}', k)), key=lambda k: re.search(r'\d{4}', k).group())
    key = years[-1]
    year = re.search(r'\d{4}', key).group()
    files = json.loads(wm.get('https://gisco-services.ec.europa.eu/distribution/v2/lau/' + D[key]['files']))
    geo = [f for f in (files.get('geojson') or []) if re.search(r'RG_01M_.*4326', f)] or [f for f in (files.get('geojson') or []) if '4326' in f]
    if not geo:
        print('GISCO LAU : pas de fichier GeoJSON en 4326 → rien')
        return
    G = json.loads(wm.get('https://gisco-services.ec.europa.eu/distribution/v2/lau/geojson/' + geo[0], 'application/geo+json'))
    rows = []
    for f in G['features']:
        p = f.get('properties') or {}
        pts = []

        def walk(c):
            if c and isinstance(c[0], (int, float)):
                pts.append(c)
            else:
                for x in c or []:
                    walk(x)
        walk((f.get('geometry') or {}).get('coordinates'))
        if not pts:
            continue
        lon = sum(x[0] for x in pts) / len(pts)
        lat = sum(x[1] for x in pts) / len(pts)
        pop = next((p[k] for k in p if re.match(r'POP_\d{4}$', k) and p[k] not in (None, '')), None)
        rows.append([p.get('GISCO_ID') or '', p.get('LAU_NAME') or p.get('LAU_LATN') or '', p.get('CNTR_CODE') or '', p.get('LAU_ID') or '', round(lat, 4), round(lon, 4),
                     int(pop) if isinstance(pop, (int, float)) and not math.isnan(pop) else None])
    meta = {'source': 'Eurostat GISCO — Local Administrative Units (LAU) ' + year, 'url': 'https://ec.europa.eu/eurostat/web/gisco/geodata/statistical-units/local-administrative-units',
            'licence': '© EuroGeographics pour les limites administratives', 'licence_url': 'https://ec.europa.eu/eurostat/web/gisco/geodata/statistical-units/local-administrative-units',
            'licence_quote': q, 'built': wm.today(), 'what': f'Les communes d’Europe (LAU {year}) : nom, pays, centre approximatif, population',
            'note': 'Le centre est la moyenne des points du contour : assez pour placer un lieu, pas pour un plan.', 'fields': ['id', 'n', 'cc', 'lau', 'lat', 'lon', 'pop'], 'rows': rows}
    print('tn2-lau', len(rows), wm.write_gz(out, 'tn2-lau.json.gz', meta))


# ───────── 🇮🇹 ISTAT ─────────
ISTAT_FILES = ['https://www.istat.it/storage/codici-unita-amministrative/Variazioni-amministrative-e-territoriali-dal-1991.zip',
               'https://www.istat.it/storage/codici-unita-amministrative/Elenco-comuni-soppressi.zip']


def istat(out):
    q = licence('ISTAT', 'https://www.istat.it/note-legali/', [r'Creative Commons[^.]{0,60}Attribuzione[^.]{0,40}4\.0', r'CC[ -]BY[ -]4\.0', r'Creative Commons[^.]{0,60}Attribution'])
    if not q:
        return
    rows = []
    for url in ISTAT_FILES:
        try:
            R = table_rows(wm.get(url, 'application/zip'), url)
        except Exception as e:  # noqa
            print(f'ISTAT : {url} illisible : {e}')
            continue
        for r in R:
            n = col(r, r'denominazione.*(soppress|comune)', r'^denominazione', r'comune')
            if not n:
                continue
            rows.append({'n': n, 'prov': col(r, r'provincia|sigla'), 'what': col(r, r'tipo.*variaz', r'variazione', r'provvedimento'), 'date': col(r, r'data.*(decorrenza|soppress|variaz)', r'^data', r'anno'),
                         'to': col(r, r'(confluit|incorporat|nuovo|destinazione|aggregat)'), 'code': col(r, r'codice.*istat', r'codice comune', r'pro_com'), 'src': url.rsplit('/', 1)[-1]})
    if not rows:
        print('ISTAT : aucune ligne lue → rien')
        return
    meta = {'source': 'ISTAT — Variazioni amministrative e territoriali dei comuni', 'url': 'https://www.istat.it/classificazione/codici-dei-comuni-delle-province-e-delle-regioni/',
            'licence': 'CC BY 4.0', 'licence_url': 'https://creativecommons.org/licenses/by/4.0/deed.it', 'licence_quote': q, 'built': wm.today(),
            'what': 'Communes d’Italie supprimées, créées ou renommées', 'fields': list(rows[0]), 'rows': [list(r.values()) for r in rows]}
    print('tn2-it-variazioni', len(rows), wm.write_gz(out, 'tn2-it-variazioni.json.gz', meta))


# ───────── 🇨🇭 OFS ─────────
def ofs(out):
    q = licence('OFS', 'https://www.bfs.admin.ch/bfs/fr/home/services/recherche/conditions-utilisation.html',
                [r'OPEN[ -]BY', r'utilisation libre[^.]{0,80}source', r'freie Nutzung[^.]{0,60}Quellenangabe'])
    if not q:
        return
    url = 'https://www.agvchapp.bfs.admin.ch/api/communes/mutations?' + urllib.parse.urlencode({'startPeriod': '12-09-1848', 'endPeriod': '31-12-' + wm.today()[:4], 'includeTerritoryExchange': 'false'})
    R = table_rows(wm.get(url, 'text/csv'), 'OFS')
    rows = []
    for r in R:
        rows.append({'date': col(r, r'MutationDate', r'date'), 'what': col(r, r'MutationDescription', r'description'), 'from_n': col(r, r'InitialName', r'^Initial.*Name'),
                     'from_id': col(r, r'InitialCode', r'InitialHistNumber'), 'to_n': col(r, r'TerminalName'), 'to_id': col(r, r'TerminalCode', r'TerminalHistNumber'),
                     'canton': col(r, r'InitialCanton|TerminalCanton|Canton')})
    rows = [r for r in rows if r['from_n'] or r['to_n']]
    if not rows:
        print('OFS : aucune mutation lue → rien')
        return
    meta = {'source': 'Office fédéral de la statistique — Répertoire historisé des communes de Suisse', 'url': 'https://www.agvchapp.bfs.admin.ch/fr',
            'licence': 'OPEN BY (OFS) : utilisation libre, indiquer la source', 'licence_url': 'https://www.bfs.admin.ch/bfs/fr/home/services/recherche/conditions-utilisation.html',
            'licence_quote': q, 'mention': 'Source : OFS', 'built': wm.today(), 'what': 'Fusions, changements de nom et de district des communes suisses depuis 1848',
            'fields': list(rows[0]), 'rows': [list(r.values()) for r in rows]}
    print('tn2-ch-communes', len(rows), wm.write_gz(out, 'tn2-ch-communes.json.gz', meta))


# ───────── 🍁 Québec ─────────
def ckan_open(lic_id):
    return bool(re.search(r'cc[-_ ]?by|cc[-_ ]?zero|cc0|odc|ogl|licence.ouverte', lic_id or '', re.I))


def quebec(out):
    S = json.loads(wm.get('https://www.donneesquebec.ca/recherche/api/3/action/package_search?' + urllib.parse.urlencode({'q': 'toponymie noms de lieux', 'rows': 20})))
    pk = next((p for p in S['result']['results'] if re.search(r'noms? de lieux|toponym', p.get('title', ''), re.I)), None)
    if not pk:
        print('Québec : jeu de toponymie introuvable → rien')
        return
    if not ckan_open(pk.get('license_id')):
        print(f"Québec : licence « {pk.get('license_id')} » ({pk.get('license_title')}) non ouverte → lien seulement")
        return
    q = f"{pk.get('license_title') or pk.get('license_id')} (Données Québec, jeu « {pk.get('title')} »)"
    print('Québec : licence lue dans le catalogue :', q)
    res = [r for r in pk.get('resources') or [] if (r.get('format') or '').lower() in ('csv', 'zip') and (r.get('url') or '').startswith('https://')]
    if not res:
        print('Québec : aucun fichier CSV → rien')
        return
    R = table_rows(wm.get(res[0]['url'], 'text/csv'), 'Québec')
    rows = []
    for r in R:
        n = col(r, r'^nom', r'toponyme', r'name')
        if not n:
            continue
        lat, lon = col(r, r'^lat', r'latitude'), col(r, r'^lon', r'longitude')
        try:
            lat, lon = round(float(lat.replace(',', '.')), 5), round(float(lon.replace(',', '.')), 5)
        except ValueError:
            lat = lon = None
        rows.append([n, col(r, r'statut', r'status'), col(r, r'type|genre|g[ée]n[ée]rique', r'entit'), col(r, r'municipalit', r'mrc|r[ée]gion'), lat, lon, col(r, r'date.*officiali', r'date')])
    meta = {'source': 'Commission de toponymie du Québec (Données Québec)', 'url': f"https://www.donneesquebec.ca/recherche/dataset/{pk.get('name')}",
            'licence': pk.get('license_title') or pk.get('license_id'), 'licence_url': pk.get('license_url') or 'https://www.donneesquebec.ca/licence/', 'licence_quote': q, 'built': wm.today(),
            'what': 'Noms de lieux du Québec, avec leur statut (officiel, remplacé, ancien)', 'fields': ['n', 'statut', 'type', 'where', 'lat', 'lon', 'date'], 'rows': rows}
    print('tn2-qc-toponymes', len(rows), wm.write_gz(out, 'tn2-qc-toponymes.json.gz', meta))


# ───────── 🇱🇺 Luxembourg ─────────
def lux(out):
    found = {}
    for qq in ('anciennes communes', 'fusion communes', 'communes historique'):
        S = json.loads(wm.get('https://data.public.lu/api/1/datasets/?' + urllib.parse.urlencode({'q': qq, 'page_size': 20})))
        for d in S.get('data') or []:
            found[d['id']] = d
    cands = [d for d in found.values() if re.search(r'fusion|ancienn|histor', d.get('title', ''), re.I) and re.search(r'commun', d.get('title', ''), re.I)]
    if not cands:
        print('Luxembourg : aucun jeu historique des communes trouvé → rien (lien seulement)')
        return
    d = cands[0]
    lic = d.get('license') or ''
    if not re.search(r'cc-zero|cc-by|odc|lov2|fr-lo', lic):
        print(f'Luxembourg : « {d["title"]} » sous licence « {lic} » → lien seulement')
        return
    res = [r for r in d.get('resources') or [] if (r.get('format') or '').lower() in ('csv', 'xlsx', 'zip')]
    if not res:
        print('Luxembourg : aucun fichier lisible → rien')
        return
    body = wm.get(res[0]['url'], 'text/csv')
    R = xlsx_rows(body) if res[0]['format'].lower() == 'xlsx' else table_rows(body, 'Luxembourg')
    rows = [[col(r, r'ancien', r'^commune', r'nom'), col(r, r'nouvelle|actuelle|fusion', r'devenu'), col(r, r'date|ann[ée]e')] for r in R]
    rows = [r for r in rows if r[0]]
    meta = {'source': f"data.public.lu — {d['title']}", 'url': d.get('page'), 'licence': lic, 'licence_url': 'https://data.public.lu/fr/pages/legal/', 'licence_quote': f'« {lic} » (catalogue data.public.lu)',
            'built': wm.today(), 'what': 'Anciennes communes du Luxembourg et leurs fusions', 'fields': ['old', 'new', 'date'], 'rows': rows}
    print('tn2-lu-communes', len(rows), wm.write_gz(out, 'tn2-lu-communes.json.gz', meta))


JOBS = {'lau': lau, 'istat': istat, 'ofs': ofs, 'quebec': quebec, 'lux': lux}

if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    for k in (sys.argv[2:] or list(JOBS)):
        try:
            JOBS[k](sys.argv[1])
        except Exception as e:  # noqa : une source qui échoue n'empêche pas les autres
            print(f'{k} : échec ({e}) → rien de fabriqué pour cette source')
