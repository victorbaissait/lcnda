#!/usr/bin/env python3
"""LCNDA — 🗺 Pays à l'époque, 🌍 les pays en chiffres, 💶 les prix ailleurs en Europe : le FABRICANT des données.

Refait, à partir des sources téléchargées telles quelles, les trois fichiers livrés avec l'app (assets/data/) :

    monde-frontieres.json.gz  les frontières des pays du monde de 1886 à 2019 (CShapes 2.0) et de l'Europe de 1816
                              à 1885 (CShapes-Europe), tracés simplifiés (≈ 200 m ; l'Europe d'avant 1886 : ≈ 2 km) ;
    monde-chiffres.json       par pays (frontières d'aujourd'hui) et par année : espérance de vie, mortalité
                              infantile, taille des hommes, années d'école, population (Clio-Infra) et PIB par
                              habitant (Maddison Project Database 2023) ;
    prix-europe.json          les prix d'autrefois dans les villes d'Europe, en grammes d'argent (Allen-Unger
                              Global Commodity Prices), et la valeur en argent de la monnaie de compte de la ville
                              quand la source permet de la retrouver.

Mode d'emploi :
    python3 scripts/monde/build-contexte.py                 # tout (≈ 5 minutes, ≈ 60 Mo de téléchargements)
    python3 scripts/monde/build-contexte.py frontieres      # seulement les frontières (ou : chiffres, prix)
Options :
    --dossier monde-sortie   où ranger les téléchargements (repris s'ils sont déjà là) — par défaut ./monde-sortie
    --vers assets/data       où écrire les fichiers finis
    --hors-ligne DOSSIER     ne télécharge rien : lit les fichiers déjà posés dans DOSSIER (essais)

Licences (à rappeler dans l'app, ce que font les écrans) :
    CShapes 2.0 et CShapes-Europe — Schvitz, Rüegger, Girardin, Cederman, Weidmann, Gleditsch (ETH Zürich, ICR) :
        CC BY-NC-SA 4.0 (pas d'usage commercial, partage dans les mêmes conditions) — le fichier dérivé
        monde-frontieres.json.gz est donc lui aussi sous CC BY-NC-SA 4.0.
    Clio-Infra (dataverse.nl, IISG) : CC0 1.0 (espérance de vie, taille, années d'école, population),
        CC BY-SA 4.0 (mortalité infantile).
    Maddison Project Database 2023 (Bolt et van Zanden, GGDC, Groningue) : CC BY 4.0.
    Allen-Unger Global Commodity Prices Dataset (Allen et Unger, dataverse.nl, IISG) : CC BY-SA 4.0.
Bibliothèques : Python 3.9+ et openpyxl (pip install openpyxl) pour lire les classeurs Excel.
"""
import argparse
import csv
import gzip
import io
import json
import math
import os
import re
import sys
import tarfile
import time
import urllib.parse
import urllib.request
import zipfile
import lzma

ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.normpath(os.path.join(ICI, '..', '..'))

# ═══════════════════════ Les adresses (à corriger ici si une source déménage) ═══════════════════════
CSHAPES_PAGE = 'https://icr.ethz.ch/data/cshapes/'
CSHAPES_R = 'https://icr.ethz.ch/data/cshapes/cshapes_2.0.tar.gz'          # le paquet R : la carte avec « status » et « owner »
CSHAPES_EUROPE = 'https://icr.ethz.ch/data/cshapes/CShapes-Europe.geojson'
CLIO = 'https://clio-infra.eu/data/{}_Compact.xlsx'
DATAVERSE = 'https://dataverse.nl'
MADDISON_DOI = 'doi:10.34894/INZBF2'
ALLEN_UNGER_DOI = 'doi:10.34894/IPVXMW'
NATURAL_EARTH = os.path.join(RACINE, 'assets', 'data', 'geo', 'monde-50m.json')  # déjà dans l'app (domaine public) : codes ISO et noms français

UA = 'LCNDA-build-contexte/1.0 (genealogy app data builder)'


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def fetch(url, dest, tries=5):
    """télécharge une fois (repris si déjà là) ; dataverse.nl répond parfois par une page anti-robots : on réessaie"""
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        return dest
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=600) as r:
                data = r.read()
            if data[:15].lower().startswith(b'<!doctype html') and not url.endswith('.html') and not url.endswith('/'):
                raise IOError('page HTML au lieu du fichier (anti-robots ?)')
            with open(dest + '.part', 'wb') as f:
                f.write(data)
            os.replace(dest + '.part', dest)
            return dest
        except Exception as e:  # noqa: BLE001
            last = e
            log(f'  … {url} : {e} (nouvel essai dans {10 * (i + 1)} s)')
            time.sleep(10 * (i + 1))
    raise SystemExit(f'Téléchargement impossible : {url} ({last})')


def dataverse_files(doi):
    u = f'{DATAVERSE}/api/datasets/:persistentId/?persistentId={urllib.parse.quote(doi)}'
    with urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': UA}), timeout=120) as r:
        d = json.load(r)['data']['latestVersion']
    return d, [(f['dataFile']['id'], f['dataFile']['filename']) for f in d['files']]


def dataverse_zip(ids, dest):
    """les fichiers d'un jeu, par paquets : /api/access/datafiles/1,2,3 (une archive zip faite par dataverse.nl)"""
    return fetch(f'{DATAVERSE}/api/access/datafiles/{",".join(str(i) for i in ids)}', dest)


# ═══════════════════════ 1. Les frontières (CShapes) ═══════════════════════
Q = 0.001           # grille des coordonnées gardées (degrés, ≈ 100 m)
TOL_WORLD = 0.002   # simplification (Douglas-Peucker, degrés, ≈ 200 m)
TOL_EUROPE = 0.03   # CShapes-Europe est déjà sur une grille de 0,02°

# noms en français : gwcode → nom, ou liste de (du, au (exclu), nom) quand le nom change avec le temps (dates AAAAMMJJ)
FR = {
    2: 'États-Unis', 3: 'Alaska', 4: 'Hawaï', 20: 'Canada', 21: 'Terre-Neuve', 200: 'Royaume-Uni',
    205: [(0, 19370101, 'État libre d’Irlande'), (19370101, 99999999, 'Irlande')],
    210: 'Pays-Bas', 211: 'Belgique', 212: 'Luxembourg', 220: 'France', 221: 'Monaco', 223: 'Liechtenstein',
    225: 'Suisse', 230: 'Espagne', 232: 'Andorre', 235: 'Portugal', 240: 'Royaume de Hanovre', 245: 'Royaume de Bavière',
    255: [(0, 18710118, 'Royaume de Prusse'), (18710118, 19181109, 'Empire allemand'), (19181109, 19330130, 'Allemagne (république de Weimar)'),
          (19330130, 99999999, 'Allemagne (IIIᵉ Reich)')],
    260: [(0, 19901003, 'Allemagne de l’Ouest (RFA)'), (19901003, 99999999, 'Allemagne')],
    265: 'Allemagne de l’Est (RDA)', 267: 'Grand-duché de Bade', 269: 'Royaume de Saxe', 271: 'Royaume de Wurtemberg',
    273: 'Hesse-Cassel (électorat)', 275: 'Hesse-Darmstadt (grand-duché)', 280: 'Mecklembourg-Schwerin',
    290: 'Pologne', 291: 'Ville libre de Dantzig',
    300: [(0, 18670530, 'Empire d’Autriche'), (18670530, 99999999, 'Autriche-Hongrie')],
    305: 'Autriche', 310: 'Hongrie', 315: 'Tchécoslovaquie', 316: 'Tchéquie', 317: 'Slovaquie',
    325: [(0, 19460602, 'Royaume d’Italie'), (19460602, 99999999, 'Italie')], 327: 'États pontificaux', 331: 'Saint-Marin',
    332: 'Duché de Modène', 335: 'Duché de Parme', 337: 'Grand-duché de Toscane', 338: 'Malte', 339: 'Albanie',
    340: 'Serbie', 341: 'Monténégro', 343: 'Macédoine du Nord', 344: 'Croatie',
    345: [(0, 19291003, 'Royaume des Serbes, Croates et Slovènes'), (19291003, 19450101, 'Royaume de Yougoslavie'), (19450101, 99999999, 'Yougoslavie')],
    346: 'Bosnie-Herzégovine', 347: 'Kosovo', 349: 'Slovénie', 350: 'Grèce', 352: 'Chypre', 355: 'Bulgarie', 359: 'Moldavie',
    360: 'Roumanie',
    365: [(0, 19171107, 'Empire russe'), (19171107, 19221230, 'Russie soviétique'), (19221230, 19911226, 'Union soviétique (URSS)'), (19911226, 99999999, 'Russie')],
    366: 'Estonie', 367: 'Lettonie', 368: 'Lituanie', 369: 'Ukraine', 370: 'Biélorussie', 371: 'Arménie', 372: 'Géorgie',
    373: 'Azerbaïdjan', 375: 'Finlande', 380: 'Suède', 385: 'Norvège', 390: 'Danemark', 395: 'Islande',
    600: 'Maroc', 602: 'Maroc espagnol', 615: 'Algérie', 616: 'Tunisie', 620: 'Libye', 651: 'Égypte',
    640: [(0, 19221101, 'Empire ottoman'), (19221101, 99999999, 'Turquie')],
    430: 'Afrique-Occidentale française', 460: 'Togo allemand', 470: 'Cameroun allemand (Kamerun)', 561: 'Colonie du Cap',
    562: 'Natal', 563: 'Transvaal', 564: 'État libre d’Orange', 665: 'Palestine (mandat)', 730: 'Corée',
    815: 'Viêt Nam (Annam, Cochinchine, Tonkin)', 3461: 'Bosnie', 3462: 'Herzégovine', 1201: 'Inini',
    10001: 'Duché d’Anhalt', 10002: 'Anhalt-Bernbourg', 10003: 'Anhalt-Dessau', 10006: 'Brême (ville libre)', 10007: 'Tchétchénie',
    10008: 'Circassie', 10009: 'Ville libre de Cracovie', 10010: 'Francfort (ville libre)', 10012: 'Hesse-Hombourg',
    10013: 'Hohengeroldseck', 10014: 'Hohenzollern-Hechingen', 10015: 'Hohenzollern-Sigmaringen', 10016: 'Royaume des Deux-Siciles',
    10017: 'Lippe-Detmold', 10018: 'Duché de Lucques', 10019: 'Massa', 10020: 'Mecklembourg-Strelitz', 10021: 'Duché de Nassau',
    10022: 'Oldenbourg', 10023: 'Royaume de Sardaigne (Piémont)', 10025: 'Reuss', 10027: 'Saxe-Altenbourg', 10028: 'Saxe-Cobourg-Gotha',
    10029: 'Saxe-Cobourg-Saalfeld', 10030: 'Saxe-Gotha-Altenbourg', 10031: 'Saxe-Hildburghausen', 10032: 'Saxe-Meiningen',
    10033: 'Saxe-Weimar', 10034: 'Schaumbourg-Lippe', 10036: 'Waldeck', 10037: 'Brunswick (Wolfenbüttel)',
    1: 'Nations unies', 53: 'Barbade', 462: 'Togo britannique', 472: 'Cameroun britannique', 511: 'Zanzibar', 515: 'Ruanda-Urundi',
    521: 'Somaliland britannique', 550: 'Fédération de Rhodésie et du Nyassaland', 609: 'Sahara espagnol', 610: 'Afrique-Occidentale espagnole',
    680: 'Yémen du Sud', 681: 'Aden', 711: 'Tibet', 781: 'Maldives', 817: 'Viêt Nam du Sud', 821: 'États malais fédérés',
    822: 'États malais non fédérés', 823: 'Bornéo du Nord', 824: 'Sarawak', 827: 'Établissements des détroits', 851: 'Nouvelle-Guinée occidentale',
    901: 'Nouvelle-Galles du Sud', 902: 'Australie-Occidentale', 903: 'Australie-Méridionale', 904: 'Victoria', 905: 'Queensland', 906: 'Tasmanie',
    911: 'Papouasie', 912: 'Nouvelle-Guinée allemande', 4781: 'Lagos', 4782: 'Protectorat des Oil Rivers', 4783: 'Nigeria du Sud',
    4784: 'Nigeria du Nord', 5200: 'Somalie italienne', 5518: 'Rhodésie du Nord-Est', 5519: 'Rhodésie du Nord-Ouest', 5612: 'Bechuanaland britannique',
    6021: 'Zone sud du Maroc espagnol', 6511: 'Gaza', 6631: 'Cisjordanie', 6801: 'Fédération d’Arabie du Sud', 6812: 'Protectorat d’Aden oriental',
    7020: 'Émirat de Boukhara', 7030: 'Khanat de Khiva', 7351: 'Sakhaline du Sud', 7506: 'Jammu-et-Cachemire', 7708: 'Azad Cachemire',
    8201: 'Perak', 8202: 'Selangor', 8203: 'Pahang', 9401: 'Îles Salomon allemandes',
}
# les petits pays absents des contours de Natural Earth au 1:50 m : leur code ISO 3166 numérique
ISO_FIX = {53: 52, 221: 492, 223: 438, 232: 20, 331: 674, 338: 470, 781: 462}
STATUS = {'independent': '', 'colony': 'c', 'protectorate': 'p', 'occupied': 'o', 'mandate': 'm', 'leased': 'l'}


def ymd(s):
    return int(str(s)[:10].replace('-', ''))


def dp(points, tol):
    """Douglas-Peucker (garde le premier et le dernier point)"""
    n = len(points)
    if n < 3:
        return list(points)
    keep = [False] * n
    keep[0] = keep[-1] = True
    stack = [(0, n - 1)]
    while stack:
        a, b = stack.pop()
        ax, ay = points[a]
        bx, by = points[b]
        dx, dy = bx - ax, by - ay
        L = math.hypot(dx, dy)
        best, bi = -1.0, -1
        for i in range(a + 1, b):
            px, py = points[i]
            d = abs(dy * (px - ax) - dx * (py - ay)) / L if L else math.hypot(px - ax, py - ay)
            if d > best:
                best, bi = d, i
        if best > tol and bi > 0:
            keep[bi] = True
            stack.append((a, bi))
            stack.append((bi, b))
    return [p for p, k in zip(points, keep) if k]


def simplify_arc(pts, tol):
    closed = len(pts) > 3 and pts[0] == pts[-1]
    if closed:  # un anneau fermé : on coupe en deux au point le plus loin, pour garder une forme
        far = max(range(len(pts)), key=lambda i: (pts[i][0] - pts[0][0]) ** 2 + (pts[i][1] - pts[0][1]) ** 2)
        out = dp(pts[:far + 1], tol)[:-1] + dp(pts[far:], tol)
        if len(out) < 4:
            step = max(1, len(pts) // 4)
            out = pts[::step][:3] + [pts[0]]
        return out
    return dp(pts, tol)


def quant(pts):
    out = []
    for x, y in pts:
        q = (int(round(x / Q)), int(round(y / Q)))
        if not out or out[-1] != q:
            out.append(q)
    return out


class Topo:
    """les arcs partagés (une frontière commune n'est gardée qu'une fois, dans un seul sens)"""
    def __init__(self):
        self.arcs, self.index = [], {}

    def add(self, qpts):
        if len(qpts) < 2:
            qpts = qpts * 2
        k = tuple(qpts)
        if k in self.index:
            return self.index[k]
        r = tuple(reversed(qpts))
        if r in self.index:
            return ~self.index[r]
        self.index[k] = len(self.arcs)
        self.arcs.append(list(qpts))
        return len(self.arcs) - 1


def ring_area(pts):
    a = 0.0
    for i in range(len(pts) - 1):
        a += pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1]
    return a / 2


def ring_centroid(pts):
    a = ring_area(pts)
    if not a:
        return pts[0]
    cx = cy = 0.0
    for i in range(len(pts) - 1):
        f = pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1]
        cx += (pts[i][0] + pts[i + 1][0]) * f
        cy += (pts[i][1] + pts[i + 1][1]) * f
    return (cx / (6 * a), cy / (6 * a))


def in_ring(x, y, pts):
    c = False
    j = len(pts) - 1
    for i in range(len(pts)):
        xi, yi = pts[i]
        xj, yj = pts[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / ((yj - yi) or 1e-12) + xi:
            c = not c
        j = i
    return c


def in_polys(x, y, polys):
    return any(in_ring(x, y, p[0]) and not any(in_ring(x, y, h) for h in p[1:]) for p in polys)


def natural_earth():
    """les pays d'aujourd'hui de Natural Earth (dans l'app) : [(iso numérique, iso2, nom français, anneaux)]"""
    d = json.load(open(NATURAL_EARTH, encoding='utf-8'))['topo']
    sx, sy = d['transform']['scale']
    tx, ty = d['transform']['translate']
    arcs = []
    for a in d['arcs']:
        x = y = 0
        pts = []
        for dx, dy in a:
            x += dx
            y += dy
            pts.append((x * sx + tx, y * sy + ty))
        arcs.append(pts)

    def arc(i):
        return arcs[i] if i >= 0 else list(reversed(arcs[~i]))

    def ring(ix):
        pts = []
        for i in ix:
            a = arc(i)
            pts.extend(a if not pts else a[1:])
        return pts
    out = []
    for g in d['objects']['z']['geometries']:
        p = g['properties']
        polys = [[ring(r) for r in g['arcs']]] if g['type'] == 'Polygon' else [[ring(r) for r in poly] for poly in g['arcs']]
        num = next((a for a in p.get('a', []) if re.fullmatch(r'\d{3}', str(a))), None)
        iso3 = next((a for a in p.get('a', []) if re.fullmatch(r'[A-Z]{3}', str(a))), None)
        out.append({'num': int(num) if num else None, 'iso2': p.get('i'), 'iso3': iso3, 'n': p.get('n'), 'polys': polys})
    return out


def build_frontieres(cache, out_dir):
    tgz = fetch(CSHAPES_R, os.path.join(cache, 'cshapes', 'cshapes_2.0.tar.gz'))
    eur = fetch(CSHAPES_EUROPE, os.path.join(cache, 'cshapes', 'CShapes-Europe.geojson'))
    with tarfile.open(tgz) as t:
        raw = lzma.decompress(t.extractfile('cshapes/inst/extdata/cshapes_2_gw.topojson.xz').read())
    world = json.loads(raw)
    ne = natural_earth()
    topo = Topo()
    geoms, geom_key, ents = [], {}, []

    # — CShapes 2.0 (1886-2019) : les arcs du fichier, simplifiés un par un (les voisins restent collés)
    warcs = [simplify_arc([tuple(p) for p in a], TOL_WORLD) for a in world['arcs']]
    wmap = {}

    def warc(i):
        j = i if i >= 0 else ~i
        if j not in wmap:
            wmap[j] = topo.add(quant(warcs[j]))
        k = wmap[j]
        return k if i >= 0 else ~k

    def add_geom(polys_arcs):
        key = json.dumps(polys_arcs)
        if key not in geom_key:
            geom_key[key] = len(geoms)
            geoms.append(polys_arcs)
        return geom_key[key]
    obj = list(world['objects'].values())[0]['geometries']
    for g in obj:
        p = g['properties']
        polys = [g['arcs']] if g['type'] == 'Polygon' else g['arcs']
        pa = [[[warc(i) for i in ring] for ring in poly] for poly in polys]
        st = STATUS.get(p['status'], '')
        owner = int(p['owner']) if str(p['owner']).lstrip('-').isdigit() else 0
        ents.append({'gw': int(p['gwcode']), 'f': ymd(p['start']), 't': ymd(p['end']), 's': st, 'o': owner if st else 0,
                     'g': add_geom(pa), 'en': p['country_name'], 'cap': (p['caplong'], p['caplat'])})

    # — CShapes-Europe (1816-1885) : pas de topologie dans le fichier ; les points communs à deux pays deviennent des nœuds
    eu = json.load(open(eur, encoding='utf-8'))['features']
    rings_all = []
    feats = []
    for f in eu:
        p = f['properties']
        if p['From'] > 1885:
            continue
        g = f['geometry']
        polys = [g['coordinates']] if g['type'] == 'Polygon' else g['coordinates']
        qp = [[quant([tuple(c) for c in ring]) for ring in poly] for poly in polys]
        qp = [[r if r[0] == r[-1] else r + [r[0]] for r in poly if len(r) >= 4] for poly in qp]
        qp = [poly for poly in qp if poly]
        feats.append((p, qp))
        for poly in qp:
            rings_all.extend(poly)
    # nœuds : un point qui n'a pas toujours les mêmes voisins
    neigh, junction = {}, set()
    for r in rings_all:
        pts = r[:-1]
        n = len(pts)
        for i, pt in enumerate(pts):
            nb = frozenset((pts[i - 1], pts[(i + 1) % n]))
            old = neigh.get(pt)
            if old is None:
                neigh[pt] = nb
            elif old != nb:
                junction.add(pt)

    def cut(ring):
        pts = ring[:-1]
        js = [i for i, pt in enumerate(pts) if pt in junction]
        if not js:  # une île, ou une frontière sans voisin : un anneau ; départ au plus petit point (le même pour les deux sens)
            m = min(range(len(pts)), key=lambda i: pts[i])
            pts = pts[m:] + pts[:m]
            return [pts + [pts[0]]]
        s = js[0]
        pts = pts[s:] + pts[:s]
        pts.append(pts[0])
        idx = [i for i, pt in enumerate(pts) if pt in junction]
        if idx[-1] != len(pts) - 1:
            idx.append(len(pts) - 1)
        return [pts[a:b + 1] for a, b in zip(idx, idx[1:])]
    seg_cache = {}

    def seg_arc(seg):
        k = tuple(seg)
        if k not in seg_cache:
            fl = [(x * Q, y * Q) for x, y in seg]
            seg_cache[k] = topo.add(quant(simplify_arc(fl, TOL_EUROPE)))
            seg_cache[tuple(reversed(seg))] = ~seg_cache[k]
        return seg_cache[k]
    for p, qp in feats:
        pa = [[[seg_arc(s) for s in cut(ring)] for ring in poly] for poly in qp]
        gw, holder = int(p['Id']), int(p['Holder'] or 0)
        st = STATUS.get(p['Status'], '')
        if holder and holder != gw and not st:
            st = 'c'
        to = min(int(p['To']), 1885)
        cap = re.findall(r'-?\d+\.?\d*', p.get('capital_geom') or '')
        ents.append({'gw': gw, 'f': int(p['From']) * 10000 + 101, 't': to * 10000 + 1231, 's': st, 'o': holder if st else 0,
                     'g': add_geom(pa), 'en': p['Name'], 'cap': (float(cap[0]), float(cap[1])) if len(cap) >= 2 else None})

    # — décodage (pour les boîtes, les points d'étiquette, les codes ISO)
    def arc_pts(i):
        a = topo.arcs[i] if i >= 0 else list(reversed(topo.arcs[~i]))
        return [(x * Q, y * Q) for x, y in a]

    def geom_rings(gi):
        out = []
        for poly in geoms[gi]:
            rr = []
            for ring in poly:
                pts = []
                for i in ring:
                    a = arc_pts(i)
                    pts.extend(a if not pts else a[1:])
                rr.append(pts)
            out.append(rr)
        return out
    gbox, glabel = [], []
    for gi in range(len(geoms)):
        rr = geom_rings(gi)
        xs = [x for poly in rr for x, _ in poly[0]]
        ys = [y for poly in rr for _, y in poly[0]]
        gbox.append([int(math.floor(min(xs) / Q)), int(math.floor(min(ys) / Q)), int(math.ceil(max(xs) / Q)), int(math.ceil(max(ys) / Q))])
        big = max(rr, key=lambda poly: abs(ring_area(poly[0])))
        c = ring_centroid(big[0])
        if not in_polys(c[0], c[1], [big]):  # une forme en croissant : le milieu des points
            c = big[0][len(big[0]) // 2]
        glabel.append([int(round(c[0] / Q)), int(round(c[1] / Q))])

    # codes ISO d'aujourd'hui : la capitale (ou l'étiquette) des pays de 2019 dans Natural Earth
    iso, names_ne = {}, {}
    for e in ents:
        if e['t'] < 20191230:
            continue
        pts = [e['cap']] if e.get('cap') else []
        lx, ly = glabel[e['g']]
        pts.append((lx * Q, ly * Q))
        for x, y in pts:
            hit = next((z for z in ne if z['num'] and in_polys(x, y, z['polys'])), None)
            if hit:
                iso[e['gw']] = hit['num']
                names_ne[e['gw']] = hit['n']
                break
    for gw, num in ISO_FIX.items():
        if any(e['gw'] == gw and e['t'] >= 20191230 for e in ents):
            iso.setdefault(gw, num)
    # le nom français : la liste ci-dessus, sinon Natural Earth (pays d'aujourd'hui), sinon le nom anglais de CShapes
    names, periods = {}, {}
    for e in ents:
        gw = e['gw']
        if gw in names or gw in periods:
            continue
        v = FR.get(gw)
        if isinstance(v, list):
            periods[gw] = [[a, b, n] for a, b, n in v]
        else:
            names[gw] = v or names_ne.get(gw) or e['en']
    for o in {e['o'] for e in ents if e['o']}:
        if o not in names and o not in periods:
            v = FR.get(o)
            if isinstance(v, list):
                periods[o] = [[a, b, n] for a, b, n in v]
            else:
                names[o] = v or names_ne.get(o) or str(o)

    def enc(a):
        flat, px, py = [], 0, 0
        for x, y in a:
            flat += [x - px, y - py]
            px, py = x, y
        return flat
    ents.sort(key=lambda e: (e['f'], e['gw']))
    data = {
        'v': 1, 'q': Q,
        'attr': 'CShapes 2.0 (1886-2019) et CShapes-Europe (1816-1885), Schvitz, Rüegger, Girardin, Cederman, Weidmann, Gleditsch — ETH Zürich, ICR. Tracés simplifiés.',
        'cite': 'Schvitz, G., Rüegger, S., Girardin, L., Cederman, L.-E., Weidmann, N. et Gleditsch, K. S. (2022). Mapping the International System, 1886-2017: The CShapes 2.0 Dataset. Journal of Conflict Resolution 66(1), 144-161.',
        'licence': 'CC BY-NC-SA 4.0', 'licence_url': 'https://creativecommons.org/licenses/by-nc-sa/4.0/deed.fr', 'url': CSHAPES_PAGE,
        'arcs': [enc(a) for a in topo.arcs],
        'geoms': geoms, 'box': gbox, 'lab': glabel,
        'e': [[e['gw'], e['f'], e['t'], e['s'], e['o'], e['g']] for e in ents],
        'n': {str(k): v for k, v in sorted(names.items())}, 'np': {str(k): v for k, v in sorted(periods.items())},
        'iso': {str(k): v for k, v in sorted(iso.items())},
    }
    raw = json.dumps(data, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    dest = os.path.join(out_dir, 'monde-frontieres.json.gz')
    with open(dest, 'wb') as f:
        f.write(gzip.compress(raw, 9, mtime=0))
    log(f'✓ {dest} : {len(ents)} pays-périodes, {len(geoms)} formes, {len(topo.arcs)} arcs, '
        f'{sum(len(a) for a in topo.arcs)} points ; {len(raw) / 1e6:.1f} Mo → {os.path.getsize(dest) / 1e6:.2f} Mo compressé')
    return dest


# ═══════════════════════ 2. Les pays en chiffres (Clio-Infra + Maddison) ═══════════════════════
CLIO_SETS = [
    # clé, fichier Clio-Infra, libellé, unité, décimales, jeu sur dataverse.nl, licence, citation
    ('le', 'LifeExpectancyatBirth(Total)', 'Espérance de vie à la naissance', 'ans', 0, 'doi:10.34894/RFRR6D', 'CC0 1.0',
     'Zijdeman, Richard et Filipa Ribeira da Silva (2015). Life Expectancy at Birth (Total). Clio-Infra.'),
    ('im', 'InfantMortality', 'Mortalité infantile', '‰', 0, 'doi:10.34894/JITFDV', 'CC BY-SA 4.0',
     'Baten, Joerg et Mathias Blum (2015). Infant Mortality. Clio-Infra.'),
    ('ht', 'Height', 'Taille moyenne des hommes (selon leur décennie de naissance)', 'cm', 0, 'doi:10.34894/CGMOIO', 'CC0 1.0',
     'Baten, Joerg et Mathias Blum (2015). Height. Clio-Infra.'),
    ('ed', 'AverageYearsofEducation', 'Années d’école en moyenne (adultes)', 'ans', 1, 'doi:10.34894/KV6ASD', 'CC0 1.0',
     'van Leeuwen, Bas et Jieli van Leeuwen-Li (2015). Average Years of Education. Clio-Infra.'),
    ('pop', 'TotalPopulation', 'Population', 'milliers d’habitants', 0, 'doi:10.34894/HW27BU', 'CC0 1.0',
     'Fink-Jensen, Jonathan (2015). Total Population. Clio-Infra.'),
]
Y0, Y1 = 1700, 2020


def read_xlsx(path, sheet=None):
    import openpyxl  # noqa: PLC0415
    wb = openpyxl.load_workbook(path, data_only=True)
    ws = wb[sheet] if sheet else wb.worksheets[0]
    rows = ws.iter_rows(values_only=True)
    head = [str(h).strip() if h is not None else '' for h in next(rows)]
    for r in rows:
        yield dict(zip(head, r))


def build_chiffres(cache, out_dir):
    ne = natural_earth()
    by3 = {z['iso3']: z['num'] for z in ne if z['iso3'] and z['num']}
    name_fr = {z['num']: z['n'] for z in ne if z['num']}
    series, sources = {}, {}
    for key, fname, label, unit, dec, doi, lic, cite in CLIO_SETS:
        p = fetch(CLIO.format(urllib.parse.quote(fname)), os.path.join(cache, 'clio', f'{fname}_Compact.xlsx'))
        n = 0
        for r in read_xlsx(p, 'Data Long Format'):
            try:
                c, y, v = int(float(r['ccode'])), int(float(r['year'])), float(r['value'])
            except (TypeError, ValueError, KeyError):
                continue
            if not (Y0 <= y <= Y1) or v != v:
                continue
            series.setdefault(c, {}).setdefault(key, []).append([y, round(v, dec) if dec else int(round(v))])
            n += 1
        sources[key] = {'label': label, 'unit': unit, 'src': cite, 'url': f'{DATAVERSE}/dataset.xhtml?persistentId={doi}',
                        'licence': lic, 'via': 'Clio-Infra (clio-infra.eu)'}
        log(f'  Clio-Infra {fname} : {n} valeurs')
    # Maddison 2023 : le PIB par habitant (dollars internationaux de 2011, en parité de pouvoir d'achat)
    meta, files = dataverse_files(MADDISON_DOI)
    fid = next(i for i, n in files if n.lower().endswith('.xlsx') and 'mpd' in n.lower())
    z = dataverse_zip([fid], os.path.join(cache, 'maddison', 'mpd.zip'))
    with zipfile.ZipFile(z) as zz:
        name = next(n for n in zz.namelist() if n.lower().endswith('.xlsx'))
        tmp = os.path.join(cache, 'maddison', name)
        with open(tmp, 'wb') as f:
            f.write(zz.read(name))
    n = 0
    for r in read_xlsx(tmp, 'Full data'):
        c = by3.get(str(r.get('countrycode') or '').strip())
        try:
            y, v = int(r['year']), float(r['gdppc'])
        except (TypeError, ValueError, KeyError):
            continue
        if not c or not (Y0 <= y <= Y1):
            continue
        series.setdefault(c, {}).setdefault('gdp', []).append([y, int(round(v))])
        n += 1
    sources['gdp'] = {'label': 'PIB par habitant', 'unit': 'dollars de 2011 (pouvoir d’achat)',
                      'src': 'Maddison Project Database, version 2023 : Bolt, Jutta et Jan Luiten van Zanden (2024), « Maddison style estimates of the evolution of the world economy: A new 2023 update », Journal of Economic Surveys, 1-41.',
                      'url': 'https://www.rug.nl/ggdc/historicaldevelopment/maddison/releases/maddison-project-database-2023', 'licence': 'CC BY 4.0', 'via': 'Groningen Growth and Development Centre'}
    log(f'  Maddison 2023 : {n} valeurs')
    countries = {}
    for c, d in sorted(series.items()):
        for k in d:
            d[k].sort()
        countries[str(c)] = {'n': name_fr.get(c, str(c)), **d}
    data = {'v': 1, 'note': 'Pays dans leurs frontières d’aujourd’hui (codes ISO 3166 numériques). Les valeurs sont celles des sources, sans calcul.',
            'sources': sources, 'c': countries}
    dest = os.path.join(out_dir, 'monde-chiffres.json')
    with open(dest, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
    log(f'✓ {dest} : {len(countries)} pays ; {os.path.getsize(dest) / 1e6:.2f} Mo')
    return dest


# ═══════════════════════ 3. Les prix ailleurs en Europe (Allen-Unger) ═══════════════════════
# marchés d'Europe gardés : nom de la source → (nom français, pays d'aujourd'hui)
MARKETS = {
    'Aix': ('Aix-en-Provence', 'France'), 'Amsterdam': ('Amsterdam', 'Pays-Bas'), 'Ancona': ('Ancône', 'Italie'), 'Andalusia': ('Andalousie', 'Espagne'),
    'Angers': ('Angers', 'France'), 'Antwerp': ('Anvers', 'Belgique'), 'Aragon': ('Aragon', 'Espagne'), 'Arezzo': ('Arezzo', 'Italie'),
    'Arles': ('Arles', 'France'), 'Arnhem': ('Arnhem', 'Pays-Bas'), 'Augsburg': ('Augsbourg', 'Allemagne'), 'Avignon': ('Avignon', 'France'),
    'Barcelona': ('Barcelone', 'Espagne'), 'Bari': ('Bari', 'Italie'), 'Basle': ('Bâle', 'Suisse'), 'Bassano': ('Bassano', 'Italie'),
    'Beziers': ('Béziers', 'France'), 'Bilbao': ('Bilbao', 'Espagne'), 'Bordeaux': ('Bordeaux', 'France'), 'Braganca': ('Bragance', 'Portugal'),
    'Brescia': ('Brescia', 'Italie'), 'Bruges': ('Bruges', 'Belgique'), 'Brussels': ('Bruxelles', 'Belgique'), 'Burgos': ('Burgos', 'Espagne'),
    'Cologne': ('Cologne', 'Allemagne'), 'Copenhagen': ('Copenhague', 'Danemark'), 'Coutances': ('Coutances', 'France'), 'Danzig': ('Dantzig (Gdańsk)', 'Pologne'),
    'Douai': ('Douai', 'France'), 'Dresden': ('Dresde', 'Allemagne'), 'Edinburgh': ('Édimbourg', 'Royaume-Uni'), 'England': ('Angleterre (Londres et le Sud)', 'Royaume-Uni'),
    'Exeter': ('Exeter', 'Royaume-Uni'), 'Florence': ('Florence', 'Italie'), 'Frankfurt': ('Francfort', 'Allemagne'), 'Gdansk': ('Gdańsk', 'Pologne'),
    'Ghent': ('Gand', 'Belgique'), 'Grenoble': ('Grenoble', 'France'), 'Istanbul': ('Istanbul', 'Turquie'), 'Konigsberg': ('Königsberg', 'Russie'),
    'Krakow': ('Cracovie', 'Pologne'), 'Leiden': ('Leyde', 'Pays-Bas'), 'Leipzig': ('Leipzig', 'Allemagne'), 'Leon': ('León', 'Espagne'),
    'Lier': ('Lierre', 'Belgique'), 'Linkoping': ('Linköping', 'Suède'), 'Lisbon': ('Lisbonne', 'Portugal'), 'Louvain': ('Louvain', 'Belgique'),
    'Lublin': ('Lublin', 'Pologne'), 'Lwow': ('Lwów (Lviv)', 'Ukraine'), 'Madrid': ('Madrid', 'Espagne'), 'Malines': ('Malines', 'Belgique'),
    'Marseilles': ('Marseille', 'France'), 'Metz': ('Metz', 'France'), 'Milan': ('Milan', 'Italie'), 'Modena': ('Modène', 'Italie'),
    'Mons': ('Mons', 'Belgique'), 'Munich': ('Munich', 'Allemagne'), 'Nancy': ('Nancy', 'France'), 'Nantes': ('Nantes', 'France'),
    'Naples': ('Naples', 'Italie'), 'New Castile': ('Nouvelle-Castille', 'Espagne'), 'Old Castile': ('Vieille-Castille', 'Espagne'), 'Paris': ('Paris', 'France'),
    'Pisa': ('Pise', 'Italie'), 'Porto': ('Porto', 'Portugal'), 'Rennes': ('Rennes', 'France'), 'Rostock': ('Rostock', 'Allemagne'),
    'Rotterdam': ('Rotterdam', 'Pays-Bas'), 'Siena': ('Sienne', 'Italie'), 'Sopron': ('Sopron', 'Hongrie'), 'Speyer': ('Spire', 'Allemagne'),
    'St Petersburg': ('Saint-Pétersbourg', 'Russie'), 'Stockholm': ('Stockholm', 'Suède'), 'Strasbourg': ('Strasbourg', 'France'), 'Toulouse': ('Toulouse', 'France'),
    'Tours': ('Tours', 'France'), 'Udine': ('Udine', 'Italie'), 'Utrecht': ('Utrecht', 'Pays-Bas'), 'Valencia': ('Valence (Espagne)', 'Espagne'),
    'Valladolid': ('Valladolid', 'Espagne'), 'Vienna': ('Vienne (Autriche)', 'Autriche'), 'Warsaw': ('Varsovie', 'Pologne'), 'Wroclaw': ('Wrocław (Breslau)', 'Pologne'),
    'Wurzburg': ('Wurtzbourg', 'Allemagne'), 'Zaragoza': ('Saragosse', 'Espagne'),
}
# denrées gardées : nom de la source → (clé, nom français, unité)
GOODS = {
    'Bread': ('pain', 'pain', 'kg'), 'Wheat': ('ble', 'blé', 'L'), 'Rye': ('seigle', 'seigle', 'L'), 'Flour': ('farine', 'farine', 'kg'),
    'Beef': ('boeuf', 'bœuf', 'kg'), 'Pork': ('porc', 'porc', 'kg'), 'Mutton': ('mouton', 'mouton', 'kg'), 'Veal': ('veau', 'veau', 'kg'),
    'Butter': ('beurre', 'beurre', 'kg'), 'Cheese': ('fromage', 'fromage', 'kg'), 'Eggs': ('oeufs', 'œufs', 'pièce'), 'Milk': ('lait', 'lait', 'L'),
    'Beer': ('biere', 'bière', 'L'), 'Wine': ('vin', 'vin', 'L'), 'Salt': ('sel', 'sel', 'kg'), 'Sugar': ('sucre', 'sucre', 'kg'),
    'Candles': ('chandelles', 'chandelles', 'kg'), 'Soap': ('savon', 'savon', 'kg'), 'Oil': ('huile', 'huile', 'L'), 'Peas': ('pois', 'pois', 'L'),
    'Barley': ('orge', 'orge', 'L'), 'Oats': ('avoine', 'avoine', 'L'), 'Rice': ('riz', 'riz', 'kg'), 'Coffee': ('cafe', 'café', 'kg'),
}
STD_UNIT = {'Kilogram': 'kg', 'Litre': 'L', 'Unit': 'pièce'}
# les mesures d'origine qui sont des multiples exacts des mesures standard (pour retrouver l'argent d'une unité de monnaie)
METRIC = {('Kilogram', 'Kilogram'): 1, ('Litre', 'Litre'): 1, ('Unit', 'Unit'): 1, ('Hectolitre', 'Litre'): 100, ('CentoKilo', 'Kilogram'): 100,
          ('Metric Tonne', 'Kilogram'): 1000, ('CentoUnits', 'Unit'): 100}
# monnaies de compte : nom de la source → (nom français au singulier, au pluriel, première année où la monnaie existait)
# (pas les unités mises après coup sur des prix anciens : « Alsace Franc » de Hanauer, « Swedish Kronor » avant 1873…)
MONEY = {
    'Paris Livra': ('livre tournois', 'livres tournois', 0), 'Tours Livre': ('livre tournois', 'livres tournois', 0),
    'French Franc': ('franc', 'francs', 1795), 'Belgian Franc': ('franc belge', 'francs belges', 1832), 'Dutch Guilder': ('florin', 'florins', 0),
    'English Pence': ('penny', 'pence', 0), 'Krakow Gold': ('złoty', 'złotys', 0), 'Swedish Kronor': ('couronne', 'couronnes', 1873),
    'Danish Skilling': ('skilling', 'skillings', 0), 'Vienna kreuzer': ('kreuzer', 'kreuzers', 0), 'Leipzig pfennig': ('pfennig', 'pfennigs', 0),
    'Frankfurt pfennig': ('pfennig', 'pfennigs', 0), 'Augsburg Dinar': ('pfennig', 'pfennigs', 0), 'Munich denar': ('pfennig', 'pfennigs', 0),
    'Portugal Reis': ('réal', 'réis', 0), 'Lira Milanesi': ('lire de Milan', 'lires de Milan', 0), 'Milanesi Soldi': ('sou de Milan', 'sous de Milan', 0),
    'Naples Carlini': ('carlin', 'carlins', 0), 'Sueldo de Cataluna': ('sou de Catalogne', 'sous de Catalogne', 0),
    'Brabant groat': ('gros de Brabant', 'gros de Brabant', 0), 'Flemish Groat': ('gros de Flandre', 'gros de Flandre', 0),
    'Flemish Grote': ('gros de Flandre', 'gros de Flandre', 0),
}


def build_prix(cache, out_dir):
    meta, files = dataverse_files(ALLEN_UNGER_DOI)
    want = []
    for fid, fn in files:
        m = re.match(r'(.+)_([^_]+)\.csv$', fn)
        if m and m.group(1) in MARKETS and m.group(2) in GOODS:
            want.append((fid, fn))
    log(f'  Allen-Unger : {len(want)} fichiers retenus sur {len(files)}')
    rows = []
    for k in range(0, len(want), 100):
        part = want[k:k + 100]
        z = dataverse_zip([i for i, _ in part], os.path.join(cache, 'allen-unger', f'paquet-{k // 100:02d}.zip'))
        with zipfile.ZipFile(z) as zz:
            for n in zz.namelist():
                if n.endswith('.csv'):
                    b = zz.read(n)
                    try:
                        txt = b.decode('utf-8-sig')
                    except UnicodeDecodeError:  # quelques fichiers sont en Windows-1252
                        txt = b.decode('cp1252', errors='replace')
                    rows.extend(csv.DictReader(io.StringIO(txt)))
    prices, money, srcs = {}, {}, {}
    for r in rows:
        mk, gd = r.get('Market'), r.get('Commodity')
        if mk not in MARKETS or gd not in GOODS:
            continue
        try:
            y, s = int(float(r['Year'])), float(r['Standardized Value'])
        except (TypeError, ValueError, KeyError):
            continue
        if r.get('Standard Currency') != 'Silver' or STD_UNIT.get(r.get('Standard Measure')) != GOODS[gd][2] or not s > 0:
            continue
        prices.setdefault(mk, {}).setdefault(GOODS[gd][0], {}).setdefault(y, []).append(s)
        if r.get('Sources'):
            srcs.setdefault(mk, {}).setdefault(r['Sources'].strip(), 0)
            srcs[mk][r['Sources'].strip()] += 1
        cur, f = r.get('Original Currency'), METRIC.get((r.get('Original Measure'), r.get('Standard Measure')))
        try:
            o = float(r['Original Value'])
        except (TypeError, ValueError):
            o = 0
        if cur in MONEY and f and o > 0 and y >= MONEY[cur][2]:
            money.setdefault(mk, {}).setdefault(cur, {}).setdefault(y, []).append(s * f / o)
    med = lambda v: sorted(v)[len(v) // 2]  # noqa: E731
    # contrôle : la source mêle parfois des séries aux unités fausses (Udine : 300 g d'argent le litre de blé…) ;
    # on écarte une valeur plus de 5 fois au-dessus ou au-dessous de la médiane des villes d'Europe pour la même denrée
    # et la même époque (± 10 ans) — rien n'est corrigé, seulement écarté
    ref = {}
    for mk, goods in prices.items():
        for k, ys in goods.items():
            for y, v in ys.items():
                ref.setdefault((k, y // 10), []).append(med(v))
    dropped = 0

    def around(k, y):
        vals = ref.get((k, y // 10), []) + ref.get((k, y // 10 - 1), []) + ref.get((k, y // 10 + 1), [])
        return med(vals) if len(vals) >= 5 else None
    cities = {}
    for mk, goods in prices.items():
        g = {}
        for k, ys in goods.items():
            pts = []
            for y, v in sorted(ys.items()):
                m = around(k, y)
                keep = [x for x in v if m is None or m / 5 <= x <= m * 5]
                dropped += len(v) - len(keep)
                if keep:
                    pts.append([y, float(f'{med(keep):.4g}')])
            if len(pts) >= 5:
                g[k] = pts
        if not g:
            continue
        mo = []
        for cur, ys in money.get(mk, {}).items():
            pts = []
            for y, v in sorted(ys.items()):
                if max(v) / min(v) <= 1.03:  # une seule valeur de la monnaie cette année-là (sinon on ne la donne pas)
                    pts.append([y, float(f'{med(v):.4g}')])
            if len(pts) >= 3:
                mo.append({'cur': MONEY[cur][0], 'curs': MONEY[cur][1], 'src': cur, 'g': pts})
        top = sorted(srcs.get(mk, {}).items(), key=lambda x: -x[1])[:3]
        cities[mk] = {'n': MARKETS[mk][0], 'pays': MARKETS[mk][1], 'g': g, 'm': mo, 'src': [s for s, _ in top]}
    data = {'v': 1, 'unit': 'grammes d’argent fin',
            'goods': {v[0]: {'n': v[1], 'u': v[2]} for v in GOODS.values()},
            'src': 'Allen, Robert C. et Richard W. Unger, The Allen-Unger Global Commodity Prices Dataset (IISG, dataverse.nl).',
            'url': f'{DATAVERSE}/dataset.xhtml?persistentId={ALLEN_UNGER_DOI}', 'licence': 'CC BY-SA 4.0',
            'licence_url': 'https://creativecommons.org/licenses/by-sa/4.0/deed.fr',
            'note': 'Prix convertis par les auteurs en grammes d’argent fin, par kilogramme, litre ou pièce. Un prix plus de 5 fois loin de la médiane des villes d’Europe à la même époque est écarté (erreur d’unité probable dans la source). Valeur d’une unité de monnaie : retrouvée ici à partir des prix de la source donnés à la fois dans la monnaie de la ville et en argent.',
            'c': dict(sorted(cities.items(), key=lambda kv: kv[1]['n']))}
    dest = os.path.join(out_dir, 'prix-europe.json')
    with open(dest, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
    log(f'✓ {dest} : {len(cities)} villes ; {dropped} prix écartés (plus de 5 fois loin de la médiane européenne) ; {os.path.getsize(dest) / 1e6:.2f} Mo')
    return dest


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('quoi', nargs='*', default=['frontieres', 'chiffres', 'prix'], choices=['frontieres', 'chiffres', 'prix'])
    ap.add_argument('--dossier', default='monde-sortie')
    ap.add_argument('--vers', default=os.path.join(RACINE, 'assets', 'data'))
    ap.add_argument('--hors-ligne', default='')
    a = ap.parse_args()
    cache = a.hors_ligne or os.path.join(a.dossier, 'telechargements')
    if a.hors_ligne:
        global fetch  # noqa: PLW0603

        def fetch(url, dest, tries=5):  # noqa: ARG001
            if not os.path.exists(dest):
                raise SystemExit(f'Hors ligne : fichier manquant {dest}')
            return dest
    os.makedirs(a.vers, exist_ok=True)
    for q in a.quoi:
        {'frontieres': build_frontieres, 'chiffres': build_chiffres, 'prix': build_prix}[q](cache, a.vers)


if __name__ == '__main__':
    main()
