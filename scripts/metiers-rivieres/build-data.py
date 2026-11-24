#!/usr/bin/env python3
"""LCNDA — ⛏️🏭⚙️ Métiers et rivières : fabrique les données de lib/metiers_rivieres.php.

    python3 scripts/metiers-rivieres/build-data.py roe                     # assets/data/roe-moulins.json.gz (LIVRÉ avec l'app)
    python3 scripts/metiers-rivieres/build-data.py mines                   # assets/data/metiers-mines.json.gz (LIVRÉ avec l'app)
    python3 scripts/metiers-rivieres/build-data.py casias --dossier assets/data/casias   # casias-<dép>.json.gz, un par département
    python3 scripts/metiers-rivieres/build-data.py casias --dep 19 --dossier S            # (LIVRÉS avec l’app : ≈ 6,5 Mo en tout)
    python3 scripts/metiers-rivieres/build-data.py manifeste --dossier S   # taille et sha256 des fichiers (pour comparer deux fabrications)
    (les repères de crues : build-reperes.py)

Sources (vérifiées, redistribution permise avec la mention) :
  · ROE — Référentiel des obstacles à l'écoulement (OFB), diffusé par le Sandre (service WFS services.sandre.eaufrance.fr/geo/obs,
    couche ObstEcoul) — Licence Ouverte Etalab 2.0 (« Sauf mention contraire, tous les contenus de ce site sont sous licence
    etalab-2.0 », sandre.eaufrance.fr). On garde les ouvrages dont le nom dit un moulin ou une usine à eau (moulin, minoterie,
    forge, martinet, scierie, papeterie, filature, foulon, usine).
  · Wikidata — les mines et carrières de France placées sur la carte (P31 sous-classe de « mine » Q820477), dates P571/P576 — CC0.
  · CASIAS — Carte des anciens sites industriels et activités de service (BRGM, ministère de la Transition écologique), API de
    Géorisques https://www.georisques.gouv.fr/api/v1/ssp/casias — Licence Ouverte Etalab 2.0 (mention : « Géorisques, BRGM — CASIAS »).
    L'API ne donne ni dates ni code d'activité : le nom de l'établissement dit souvent l'activité (« TANNERIE », « Usine à fer »).
Bibliothèques : seulement celles de Python.
"""
import argparse
import datetime
import gzip
import hashlib
import json
import os
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.request

UA = 'LCNDA-build (genealogie ; donnees ouvertes)'
ROE_WFS = ('https://services.sandre.eaufrance.fr/geo/obs?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=sa:ObstEcoul'
           '&OUTPUTFORMAT=application/json;%20subtype=geojson&SRSNAME=EPSG:4326&PROPERTYNAME=CdObstEcoul,LbEtOuvrage,NomPrincipalObstEcoul,'
           'NomSecondaireObstEcoul,HautChutEtObstEcoul,NomEntiteHydrographique,CdCommune,LbCommune,msGeometry')
CASIAS_API = 'https://www.georisques.gouv.fr/api/v1/ssp/casias'
SPARQL = 'https://query.wikidata.org/sparql'
DEPS = [f'{i:02d}' for i in range(1, 96) if i != 20] + ['2A', '2B', '971', '972', '973', '974', '976']
MILL_RE = re.compile(r'\b(moulins?|minoterie|forges?|martinet|scierie|papeterie|filature|foulon|usine|taillanderie|tannerie)\b', re.I)
ETAT = {'Existant': 0, 'En projet': 0, 'En construction': 0, 'Détruit partiellement': 1, 'Détruit entièrement': 2}


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def get(url, accept='application/json', timeout=300):
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': accept})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001
            log('  erreur', url[:120], e)
            time.sleep(5 * (attempt + 1))
    raise RuntimeError('téléchargement impossible : ' + url[:160])


def write_gz(path, obj):
    os.makedirs(os.path.dirname(path) or '.', exist_ok=True)
    with gzip.open(path, 'wt', encoding='utf-8', compresslevel=9) as f:
        json.dump(obj, f, ensure_ascii=False, separators=(',', ':'))
    log('écrit', path, os.path.getsize(path), 'octets')


def river_name(s):
    """« rivière l'auve » → « l'Auve » ; « la corrèze » → « la Corrèze » ; « ruisseau de la fontaine » → « Ruisseau de la fontaine »"""
    s = re.sub(r'\s+', ' ', (s or '').strip())
    s = re.sub(r'^(rivi[eè]re|fleuve)\s+', '', s, flags=re.I)
    m = re.match(r"^(la |le |les |l')(.)(.*)$", s, re.I)
    if m:
        return m.group(1).lower() + m.group(2).upper() + m.group(3)
    return s[:1].upper() + s[1:]


def build_roe(out):
    d = json.loads(get(ROE_WFS))
    rows = []
    for f in d['features']:
        p = f['properties']
        name = ' — '.join(x for x in [(p.get('NomPrincipalObstEcoul') or '').strip(), (p.get('NomSecondaireObstEcoul') or '').strip()] if x)
        m = MILL_RE.search(name)
        if not m or not f.get('geometry'):
            continue
        lon, lat = f['geometry']['coordinates'][:2]
        try:
            h = round(float(p.get('HautChutEtObstEcoul') or ''), 1)
        except ValueError:
            h = None
        rows.append([round(lat, 5), round(lon, 5), p.get('CdCommune') or '', name[:120], river_name(p.get('NomEntiteHydrographique') or ''),
                     ETAT.get(p.get('LbEtOuvrage') or '', 0), h, p['CdObstEcoul']])
    rows.sort(key=lambda r: (r[2], r[3]))
    write_gz(out, {'source': 'ROE — Référentiel des obstacles à l’écoulement (OFB), Sandre', 'licence': 'Licence Ouverte Etalab 2.0',
                   'url': 'https://www.sandre.eaufrance.fr/', 'service': 'https://services.sandre.eaufrance.fr/geo/obs (couche ObstEcoul)',
                   'built': datetime.date.today().isoformat(), 'note': 'Seulement les ouvrages dont le nom dit un moulin ou une usine à eau.',
                   'etat': ['existant', 'détruit en partie', 'détruit'],
                   'cols': ['lat', 'lon', 'insee', 'nom', 'riviere', 'etat', 'chute_m', 'roe'], 'rows': rows})
    log(len(rows), 'moulins et usines à eau sur', len(d['features']))


MINES_Q = '''SELECT ?m ?mLabel ?tLabel ?c ?start ?end ?insee WHERE {
  ?m wdt:P31 ?t. ?t wdt:P279* wd:Q820477. ?m wdt:P17 wd:Q142; wdt:P625 ?c.
  OPTIONAL{?m wdt:P571 ?start} OPTIONAL{?m wdt:P576 ?end} OPTIONAL{?m wdt:P131 ?a. ?a wdt:P374 ?insee}
  SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en". } }'''


def build_mines(out):
    import csv
    import io
    text = get(SPARQL + '?' + urllib.parse.urlencode({'query': MINES_Q}), 'text/csv').decode('utf-8')
    seen, rows = set(), []
    for r in csv.DictReader(io.StringIO(text)):
        q = r['m'].rsplit('/', 1)[-1]
        m = re.match(r'Point\(([-\d.]+) ([-\d.]+)\)', r['c'])
        if q in seen or not m or re.fullmatch(r'Q\d+', r['mLabel']):
            continue
        seen.add(q)
        kind = 'carriere' if re.search(r'carri|gravi|ardoisi|schotter', r['tLabel'], re.I) else 'mine'
        y = lambda s: int(s[:4]) if re.match(r'^\d{4}', s or '') else None  # noqa: E731
        rows.append([round(float(m.group(2)), 5), round(float(m.group(1)), 5), r.get('insee') or '', r['mLabel'][:120], kind, y(r['start']), y(r['end']), q])
    rows.sort(key=lambda r: (r[2], r[3]))
    write_gz(out, {'source': 'Wikidata (mines et carrières de France)', 'licence': 'CC0 1.0', 'url': 'https://www.wikidata.org/wiki/Q820477',
                   'built': datetime.date.today().isoformat(), 'cols': ['lat', 'lon', 'insee', 'nom', 'sorte', 'debut', 'fin', 'qid'], 'rows': rows})
    log(len(rows), 'mines et carrières')


def build_casias(dossier, deps):
    os.makedirs(dossier, exist_ok=True)
    for dep in deps:
        rows, page = [], 1
        while True:
            j = json.loads(get(CASIAS_API + '?' + urllib.parse.urlencode({'code_departement': dep, 'page_size': 1000, 'page': page})))
            for x in j.get('data') or []:
                g = x.get('geom') or {}
                c = g.get('coordinates') if g.get('type') == 'Point' else None
                rows.append([round(c[1], 5) if c else None, round(c[0], 5) if c else None, x.get('code_insee') or '', (x.get('nom_commune') or '').strip(),
                             (x.get('nom_etablissement') or '').strip()[:160], (x.get('activite_principale') or '').strip()[:120], (x.get('adresse') or '').strip()[:120],
                             x.get('identifiant_ssp') or ''])
            if page >= int(j.get('total_pages') or 1):
                break
            page += 1
            time.sleep(0.3)
        rows = [r for r in rows if r[4] or r[5]]
        write_gz(os.path.join(dossier, f'casias-{dep}.json.gz'), {'source': 'CASIAS — Carte des anciens sites industriels et activités de service (BRGM), API Géorisques',
                 'licence': 'Licence Ouverte Etalab 2.0', 'url': 'https://www.georisques.gouv.fr/donnees/bases-de-donnees/inventaire-historique-de-sites-industriels-et-activites-de-service',
                 'dep': dep, 'built': datetime.date.today().isoformat(), 'cols': ['lat', 'lon', 'insee', 'commune', 'nom', 'activite', 'adresse', 'ssp'], 'rows': rows})
        log(dep, len(rows), 'sites')


def manifest(dossier):
    packs = {}
    for f in sorted(os.listdir(dossier)):
        m = re.fullmatch(r'casias-(\d{2,3}|2[AB])\.json\.gz', f)
        if not m:
            continue
        p = os.path.join(dossier, f)
        b = open(p, 'rb').read()
        n = len(json.loads(gzip.decompress(b))['rows'])
        packs[f'casias-{m.group(1)}'] = {'file': f, 'size': len(b), 'sha256': hashlib.sha256(b).hexdigest(), 'count': n, 'built': datetime.date.today().isoformat()}
    json.dump({'version': datetime.date.today().strftime('%Y-%m'), 'packs': packs}, open(os.path.join(dossier, 'metiers-rivieres-manifest.json'), 'w'), indent=1, sort_keys=True)
    log(len(packs), 'packs dans le manifeste')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('quoi', choices=['roe', 'mines', 'casias', 'manifeste'])
    ap.add_argument('--dep', action='append')
    ap.add_argument('--dossier', default='assets/data/casias')
    ap.add_argument('--sortie', default='')
    a = ap.parse_args()
    if a.quoi == 'roe':
        build_roe(a.sortie or 'assets/data/roe-moulins.json.gz')
    elif a.quoi == 'mines':
        build_mines(a.sortie or 'assets/data/metiers-mines.json.gz')
    elif a.quoi == 'casias':
        build_casias(a.dossier, a.dep or DEPS)
    else:
        manifest(a.dossier)


if __name__ == '__main__':
    main()
