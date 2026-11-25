#!/usr/bin/env python3
"""🌊 La marée du jour — constantes harmoniques calculées par LCNDA depuis les hauteurs d'eau horaires de l'UHSLC.

Source : University of Hawaii Sea Level Center (UHSLC), Research Quality Data Set (JASL) et Fast Delivery,
https://uhslc.soest.hawaii.edu/data/ — licence (ERDDAP, attribut « license ») : « The data may be used and redistributed
for free but is not intended for legal use ». Citation : Caldwell, P. C., M. A. Merrifield, P. R. Thompson (2015),
Sea level measured by tide gauges from global oceans — the Joint Archive for Sea Level holdings (NCEI Accession 0019568).
Trait de côte : Natural Earth 10 m coastline (domaine public).

Le SHOM n'est pas utilisé (pas de licence ouverte pour ses constantes et prédictions).

Méthode : moindres carrés sur 19 ans (cycle nodal) de hauteurs horaires, 37 composantes, corrections nodales f, u de
Schureman (mêmes formules que assets/js/heritage-lot8-ciel-metier.js, qui recalcule la marée d'un jour avec ces constantes).
Vérification : on prédit une année ancienne tenue à part et on compare les heures des pleines mers aux mesures.

Usage : python3 -I build_marees.py <dossier des csv UHSLC> <ne_10m_coastline.geojson> <sortie.json>
"""
import csv, json, math, os, sys, datetime as dt
import numpy as np

# station : (fichier, nom affiché, pays, lat, lon, première/dernière année de l'ajustement, année de contrôle, jeu)
STATIONS = [
    ('h822a.csv', 822, 'Brest', 'France', 48.3833, -4.495, 'rqds'),
    ('h824a.csv', 824, 'Marseille', 'France', 43.2783, 5.3533, 'rqds'),
    ('h294a.csv', 294, 'Newlyn', 'Royaume-Uni', 50.1017, -5.5417, 'rqds'),
    ('h830a.csv', 830, 'La Corogne', 'Espagne', 43.3667, -8.4, 'rqds'),
    ('h208a.csv', 208, 'Vigo', 'Espagne', 42.2333, -8.7333, 'rqds'),
    ('h209a.csv', 209, 'Cascais', 'Portugal', 38.6917, -9.4167, 'rqds'),
    ('h834a.csv', 834, 'Malin Head', 'Irlande', 55.3667, -7.3333, 'rqds'),
    ('h835.csv', 835, 'Castletownbere', 'Irlande', 51.65, -9.9033, 'fast'),
    ('h825a.csv', 825, 'Cuxhaven', 'Allemagne', 53.8667, 8.7167, 'rqds'),
    ('h207a.csv', 207, 'Ceuta', 'Espagne', 35.9, -5.3167, 'rqds'),
    ('h829.csv', 829, 'Trieste', 'Italie', 45.65, 13.75, 'fast'),
    ('h218b.csv', 218, 'Funchal (Madère)', 'Portugal', 32.6433, -16.9133, 'rqds'),
    ('h211a.csv', 211, 'Ponta Delgada (Açores)', 'Portugal', 37.7356, -25.6714, 'rqds'),
    ('h271a.csv', 271, 'Fort-de-France', 'Martinique', 14.6017, -61.0633, 'rqds'),
    ('h227.csv', 227, 'Cayenne', 'Guyane', 4.8533, -52.2717, 'fast'),
]
RADIUS_KM = 30      # au-delà, la marée change trop d'un port à l'autre : on ne dit rien
COAST_KM = 10       # « au bord de la mer » : à moins de 10 km du trait de côte

# composante : coefficients de (T, s, h, p, N, p1), décalage en degrés, correction nodale
# T = angle horaire du soleil moyen (15°/h + 180°), s, h, p, N, p1 : longitudes moyennes (Schureman)
CONST = [
    ('Sa', 0, 0, 1, 0, 0, 0, 0, '1'), ('Ssa', 0, 0, 2, 0, 0, 0, 0, '1'), ('Mm', 0, 1, 0, -1, 0, 0, 0, 'Mm'),
    ('Msf', 0, 2, -2, 0, 0, 0, 0, '1'), ('Mf', 0, 2, 0, 0, 0, 0, 0, 'Mf'),
    ('Q1', 1, -3, 1, 1, 0, 0, 90, 'O1'), ('O1', 1, -2, 1, 0, 0, 0, 90, 'O1'), ('P1', 1, 0, -1, 0, 0, 0, 90, '1'),
    ('K1', 1, 0, 1, 0, 0, 0, -90, 'K1'), ('J1', 1, 1, 1, -1, 0, 0, -90, 'J1'), ('OO1', 1, 2, 1, 0, 0, 0, -90, 'OO1'),
    ('2N2', 2, -4, 2, 2, 0, 0, 0, 'M2'), ('MU2', 2, -4, 4, 0, 0, 0, 0, 'M2'), ('N2', 2, -3, 2, 1, 0, 0, 0, 'M2'),
    ('NU2', 2, -3, 4, -1, 0, 0, 0, 'M2'), ('M2', 2, -2, 2, 0, 0, 0, 0, 'M2'), ('LAM2', 2, -1, 0, 1, 0, 0, 180, 'M2'),
    ('L2', 2, -1, 2, -1, 0, 0, 180, 'M2'), ('T2', 2, 0, -1, 0, 0, 1, 0, '1'), ('S2', 2, 0, 0, 0, 0, 0, 0, '1'),
    ('K2', 2, 0, 2, 0, 0, 0, 0, 'K2'), ('2SM2', 2, 2, -2, 0, 0, 0, 0, 'M2-'),
    ('MO3', 3, -4, 3, 0, 0, 0, 90, 'M2*O1'), ('M3', 3, -3, 3, 0, 0, 0, 0, 'M3'), ('MK3', 3, -2, 3, 0, 0, 0, -90, 'M2*K1'),
    ('MN4', 4, -5, 4, 1, 0, 0, 0, 'M2*M2'), ('M4', 4, -4, 4, 0, 0, 0, 0, 'M2*M2'), ('MS4', 4, -2, 2, 0, 0, 0, 0, 'M2'),
    ('MK4', 4, -2, 4, 0, 0, 0, 0, 'M2*K2'), ('S4', 4, 0, 0, 0, 0, 0, 0, '1'),
    ('2MN6', 6, -7, 6, 1, 0, 0, 0, 'M2*M2*M2'), ('M6', 6, -6, 6, 0, 0, 0, 0, 'M2*M2*M2'), ('2MS6', 6, -4, 4, 0, 0, 0, 0, 'M2*M2'),
    ('2SM6', 6, -2, 2, 0, 0, 0, 0, 'M2'), ('M8', 8, -8, 8, 0, 0, 0, 0, 'M2*M2*M2*M2'),
    ('MSN2', 2, 1, 0, -1, 0, 0, 0, '1'), ('2MK6', 6, -4, 6, 0, 0, 0, 0, 'M2*M2*K2'),
]


def astro(jd):
    """longitudes moyennes (degrés) au jour julien jd (tableaux numpy) — Schureman, siècles depuis 1899-12-31 12 h"""
    T = (jd - 2415020.0) / 36525.0
    s = 270.434164 + 481267.8831 * T
    h = 279.696678 + 36000.768925 * T
    p = 334.329556 + 4069.0340329 * T
    N = 259.183275 - 1934.142008 * T
    p1 = 281.220833 + 1.719175 * T
    return s, h, p, N, p1


def nodal(kind, N):
    """facteur f et phase u (degrés) d'une correction nodale de base — N : longitude du nœud (degrés)"""
    n = np.radians(N)
    c1, c2, c3, s1, s2, s3 = np.cos(n), np.cos(2 * n), np.cos(3 * n), np.sin(n), np.sin(2 * n), np.sin(3 * n)
    if kind == 'M2': return 1.0004 - 0.0373 * c1 + 0.0002 * c2, -2.14 * s1
    if kind == 'O1': return 1.0089 + 0.1871 * c1 - 0.0147 * c2 + 0.0014 * c3, 10.80 * s1 - 1.34 * s2 + 0.19 * s3
    if kind == 'K1': return 1.0060 + 0.1150 * c1 - 0.0088 * c2 + 0.0006 * c3, -8.86 * s1 + 0.68 * s2 - 0.07 * s3
    if kind == 'K2': return 1.0241 + 0.2863 * c1 + 0.0083 * c2 - 0.0015 * c3, -17.74 * s1 + 0.68 * s2 - 0.04 * s3
    if kind == 'Mf': return 1.043 + 0.414 * c1, -23.7 * s1 + 2.7 * s2 - 0.4 * s3
    if kind == 'Mm': return 1.0 - 0.130 * c1, 0 * s1
    if kind == 'J1': return 1.1029 + 0.1676 * c1 - 0.0170 * c2 + 0.0016 * c3, -12.94 * s1 + 1.34 * s2 - 0.19 * s3
    if kind == 'OO1': return 1.1027 + 0.6504 * c1 + 0.0317 * c2 - 0.0014 * c3, -36.68 * s1 + 4.02 * s2 - 0.57 * s3
    return 1.0 + 0 * c1, 0 * s1


def fu(spec, N):
    """corrections d'une composante : '1', 'M2', 'M2*K1', 'M2-' (inverse de M2), 'M3' (M2 puissance 1,5)"""
    if spec == 'M2-':
        f, u = nodal('M2', N); return f, -u
    if spec == 'M3':
        f, u = nodal('M2', N); return f ** 1.5, 1.5 * u
    f, u = 1.0, 0.0
    for k in spec.split('*'):
        a, b = nodal(k, N); f = f * a; u = u + b
    return f, u


def args(jd):
    s, h, p, N, p1 = astro(jd)
    Tsun = 15.0 * ((jd + 0.5) % 1.0) * 24.0 + 180.0  # angle horaire du soleil moyen, minuit = 180°
    return Tsun, s, h, p, N, p1


def design(jd, names):
    Tsun, s, h, p, N, p1 = args(jd)
    cols = []
    for c in CONST:
        if c[0] not in names: continue
        V = c[1] * Tsun + c[2] * s + c[3] * h + c[4] * p + c[5] * N + c[6] * p1 + c[7]
        f, u = fu(c[8], N)
        a = np.radians(V + u)
        cols += [f * np.cos(a), f * np.sin(a)]
    return np.column_stack([np.ones_like(jd)] + cols)


def read_csv(path):
    jd, z = [], []
    with open(path) as fh:
        for row in csv.reader(fh):
            if len(row) < 5: continue
            y, m, d, hr, v = (int(float(x)) for x in row[:5])
            if v <= -32000: continue
            # jour julien (UTC) d'une date grégorienne
            a = (14 - m) // 12; yy = y + 4800 - a; mm = m + 12 * a - 3
            jdn = d + (153 * mm + 2) // 5 + 365 * yy + yy // 4 - yy // 100 + yy // 400 - 32045
            jd.append(jdn - 0.5 + hr / 24.0); z.append(v)
    return np.array(jd), np.array(z, dtype=float)


def year_of(jd):
    return (jd - 2451544.5) / 365.2425 + 2000


def fit(jd, z, names):
    X = design(jd, names)
    sol, *_ = np.linalg.lstsq(X, z, rcond=None)
    out = {}
    i = 1
    for c in CONST:
        if c[0] not in names: continue
        a, b = sol[i], sol[i + 1]; i += 2
        out[c[0]] = [round(float(math.hypot(a, b)), 1), round(float(math.degrees(math.atan2(b, a)) % 360), 2)]  # amplitude mm, phase g
    return float(sol[0]), out


def predict(jd, z0, cons):
    names = set(cons)
    X = design(jd, names)
    vec = [z0]
    for c in CONST:
        if c[0] not in names: continue
        H, g = cons[c[0]]
        vec += [H * math.cos(math.radians(g)), H * math.sin(math.radians(g))]
    return X @ np.array(vec)


def highs(jd, z):
    """pleines mers : maximums locaux (raffinés par une parabole)"""
    out = []
    for i in range(1, len(z) - 1):
        if z[i] > z[i - 1] and z[i] >= z[i + 1] and jd[i + 1] - jd[i - 1] < 0.09:
            den = z[i - 1] - 2 * z[i] + z[i + 1]
            off = 0.5 * (z[i - 1] - z[i + 1]) / den if den else 0
            out.append((jd[i] + off * (jd[i + 1] - jd[i]), z[i]))
    return out


def km(a, b, c, d):
    r = math.pi / 180
    x = math.sin((c - a) * r / 2) ** 2 + math.cos(a * r) * math.cos(c * r) * math.sin((d - b) * r / 2) ** 2
    return 12742 * math.asin(min(1, math.sqrt(x)))


def coast_points(geo, lat, lon, radius):
    """points du trait de côte à moins de radius km (un tous les ~1 km), arrondis à 1e-3 degré"""
    pts = []
    for f in geo['features']:
        g = f['geometry']; lines = g['coordinates'] if g['type'] == 'MultiLineString' else [g['coordinates']]
        for ln in lines:
            for k in range(len(ln) - 1):
                (x1, y1), (x2, y2) = ln[k][:2], ln[k + 1][:2]
                if km(lat, lon, y1, x1) > radius + 15 and km(lat, lon, y2, x2) > radius + 15: continue
                n = max(1, int(km(y1, x1, y2, x2) / 1.0))
                for j in range(n):
                    y, x = y1 + (y2 - y1) * j / n, x1 + (x2 - x1) * j / n
                    if km(lat, lon, y, x) <= radius + COAST_KM: pts.append((round(y, 3), round(x, 3)))
    # une grille de ~1 km suffit : on retire les doublons
    seen, out = set(), []
    for p in pts:
        k = (round(p[0] / 0.008), round(p[1] / 0.012))
        if k not in seen: seen.add(k); out.append(p)
    return out


def main(src, coast_path, out_path):
    geo = json.load(open(coast_path))
    names = {c[0] for c in CONST}
    stations = []
    for fn, sid, name, country, lat, lon, kind in STATIONS:
        path = os.path.join(src, fn)
        if not os.path.exists(path): print('absent', fn); continue
        jd, z = read_csv(path)
        y = year_of(jd)
        last = math.floor(y.max())
        first = max(math.floor(y.min()), last - 18)
        sel = (y >= first) & (y < last + 1)
        if sel.sum() < 24 * 300: print('trop court', fn); continue
        span = (y[sel].max() - y[sel].min())
        use = names if span >= 8 else names - {'Sa', 'Ssa', 'Msf', 'Mm', 'Mf'} if span < 1 else names
        z0, cons = fit(jd[sel], z[sel], use)
        # contrôle : la plus ancienne année complète tenue à part (si elle est hors de l'ajustement), sinon une année de l'ajustement
        check = None
        years = sorted(set(np.floor(y).astype(int)))
        old = [yy for yy in years if yy < first and ((np.floor(y) == yy).sum() > 24 * 300)]
        cy = old[0] if old else years[0]
        m = np.floor(y) == cy
        if m.sum() > 24 * 200:
            obs = highs(jd[m], z[m])
            t = np.arange(jd[m].min(), jd[m].max(), 1 / 144.0)
            pr = highs(t, predict(t, z0, cons))
            prj = np.array([p[0] for p in pr])
            errs = []
            for tj, _ in obs:
                k = np.searchsorted(prj, tj)
                cand = [abs(prj[i] - tj) for i in (k - 1, k) if 0 <= i < len(prj)]
                if cand and min(cand) < 0.2: errs.append(min(cand) * 1440)
            if errs:
                e = np.array(errs)
                check = {'year': int(cy), 'held_out': bool(old), 'n': int(len(e)), 'median_min': round(float(np.median(e)), 1), 'p90_min': round(float(np.percentile(e, 90)), 1)}
        m2 = cons.get('M2', [0, 0])[0]; s2 = cons.get('S2', [0, 0])[0]
        pts = coast_points(geo, lat, lon, RADIUS_KM)
        stations.append({'id': sid, 'name': name, 'country': country, 'lat': lat, 'lon': lon, 'set': kind, 'fit': [int(first), int(last)],
                         'z0': round(z0, 1), 'cons': {k: v for k, v in cons.items() if v[0] >= 1.0}, 'check': check,
                         'range_mm': {'vive_eau': round(2 * (m2 + s2)), 'morte_eau': round(2 * abs(m2 - s2))},
                         'coast': [c for p in pts for c in p],
                         'url': f'https://uhslc.soest.hawaii.edu/stations/?stn={sid:03d}#levels'})
        print(name, first, last, 'M2', cons.get('M2'), 'check', check, 'coast', len(pts))
    data = {'title': 'La marée du jour — constantes harmoniques calculées depuis les mesures horaires UHSLC', 'version': 1,
            'built': dt.date.today().isoformat(),
            'source': 'University of Hawaii Sea Level Center (UHSLC), Research Quality / Fast Delivery hourly sea level',
            'url': 'https://uhslc.soest.hawaii.edu/data/',
            'licence': 'UHSLC : « The data may be used and redistributed for free but is not intended for legal use » ; constantes calculées par LCNDA ; trait de côte Natural Earth (domaine public)',
            'citation': 'Caldwell, P. C., M. A. Merrifield, P. R. Thompson (2015), Sea level measured by tide gauges from global oceans — the Joint Archive for Sea Level holdings (NCEI Accession 0019568), Version 5.5, NOAA National Centers for Environmental Information, Dataset, doi:10.7289/V5V40S7W.',
            'note': 'Heures en temps universel ; l’app les donne en heure solaire du lieu. Estimation par le calcul (la météo, le vent et la pression changent la marée réelle).',
            'radius_km': RADIUS_KM, 'coast_km': COAST_KM,
            'constituents': [[c[0], *c[1:8], c[8]] for c in CONST], 'stations': stations}
    with open(out_path, 'w') as fh: json.dump(data, fh, ensure_ascii=False, separators=(',', ':'))
    print('écrit', out_path, os.path.getsize(out_path))


if __name__ == '__main__':
    main(*sys.argv[1:4])
