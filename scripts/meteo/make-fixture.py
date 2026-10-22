#!/usr/bin/env python3
"""LCNDA — 🌦 petit jeu de données météo FABRIQUÉ (synthétique, plausible) pour les tests et les captures.

    python3 scripts/meteo/make-fixture.py DOSSIER

Écrit dans DOSSIER :
  meteo-socle.sqlite          quelques stations (Gers, Toulouse, Uccle, Genève, Findel) + carreaux ERA5 (4 heures par jour)
                              + carreaux 20CR (1836–1939) + normales
  meteo-pack-complet.lcmeteo  un « pack complet » à importer : la station de Lectoure, heure par heure 1980–1990
Rien n'est vrai : les valeurs suivent les saisons avec un peu de hasard (toujours le même), et quelques jours
sont posés exprès pour ressembler à la maquette (docs/design/meteo.html : famille DUPOUY, Gers).
"""
import datetime
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import meteo_format as F  # noqa: E402

STATIONS = [
    # id, source, code, nom, pays, lat, lon, alt, début, fin
    (1, 'meteofrance', '32013005', 'Auch – Lamothe', 'FR', 43.6878, 0.6006, 125, 1878, 2025),
    (2, 'meteofrance', '47091001', 'Agen – La Garenne', 'FR', 44.1739, 0.5911, 59, 1880, 2025),
    (3, 'meteofrance', '31069001', 'Toulouse – Blagnac', 'FR', 43.6210, 1.3788, 151, 1863, 2025),
    (4, 'irm', '6447', 'Uccle', 'BE', 50.7965, 4.3581, 101, 1995, 2025),
    (5, 'meteoswiss', 'GVE', 'Genève – Cointrin', 'CH', 46.2475, 6.1278, 411, 1864, 2025),
    (6, 'meteolux', 'FINDEL', 'Luxembourg – Findel', 'LU', 49.6266, 6.2045, 376, 1947, 2025),
    # montagne (essais de l'altitude) : la station d'altitude et une station de plaine plus proche
    (7, 'meteofrance', '74056001', 'Chamonix', 'FR', 45.9296, 6.8752, 1042, 1934, 2025),
    (8, 'meteofrance', '74256001', 'Passy – Plaine', 'FR', 45.9400, 6.7600, 520, 1950, 2025),
]


def relief(lat, lon):
    """altitudes fabriquées : le Gers presque plat (≈ 70–90 m), une montagne près de Chamonix, 0 ailleurs (mer)"""
    if 45 <= lat < 47 and 6 <= lon < 8:
        return 400 + 700 * math.exp(-((lat - 45.92) ** 2 + (lon - 6.85) ** 2) / 0.02)
    return 80 + 10 * math.sin(lat * 50) * math.cos(lon * 40)


RELIEF_TILES = [(43, 0), (44, 0), (45, 6)]
# carreaux ERA5 (0,25°) : autour du Gers, de Mende (Lozère, loin des stations), d'Uccle, de Genève, de Findel
ERA5 = [(43.5, 0.25), (43.5, 0.5), (43.75, 0.5), (43.75, 0.75), (44.0, 0.5), (44.0, 0.75), (43.5, 0.0), (43.5, 0.75),
        (44.5, 3.5), (50.75, 4.25), (46.25, 6.0), (49.5, 6.25)]
C20 = [(43.0, 0.0), (44.0, 0.0), (44.0, 1.0), (43.0, 1.0), (45.0, 3.0), (51.0, 4.0), (46.0, 6.0), (50.0, 6.0)]


def base_temp(lat, alt, doy):
    mean = 13.5 - (lat - 43.5) * 0.75 - (alt or 0) * 0.0065
    amp = 8.0 + (lat - 43.5) * 0.15
    return mean - amp * math.cos(2 * math.pi * (doy - 15) / 365.25)


def gen_year(rng, lat, alt, year, hours=0, hour_cols=('T', 'RR', 'FX', 'NN')):
    n = F.days_in_year(year)
    tn, tx, rr, sn, fx, nn, ss, ww = ([] for _ in range(8))
    anom = rng.gauss(0, 1.5)
    trend = (year - 1950) * 0.012
    for d in range(n):
        anom = anom * 0.75 + rng.gauss(0, 1.4)
        t = base_temp(lat, alt, d + 1) + anom + trend
        rainy = rng.random() < 0.32
        clouds = min(100, max(0, int(rng.gauss(72 if rainy else 40, 18))))
        amp = 9 - clouds / 20
        lo, hi = t - amp / 2, t + amp / 2
        rain = round(rng.expovariate(1 / 6.0), 1) if rainy else 0.0
        flags = 0
        if lo < 1 and not rainy and clouds < 50 and rng.random() < 0.25:
            flags |= F.WW_FOG
        if rainy and hi > 22 and rng.random() < 0.3:
            flags |= F.WW_STORM
        snow = 0
        if rainy and hi < 2:
            flags |= F.WW_SNOW
            snow = int(rain)
        if lo < 0:
            flags |= F.WW_ICE
        tn.append(round(lo * 10)); tx.append(round(hi * 10)); rr.append(round(rain * 10)); sn.append(snow)
        fx.append(round(max(2, rng.gauss(9 + rain / 2, 3)) * 10)); nn.append(clouds)
        ss.append(max(0, int((100 - clouds) / 100 * (600 + 300 * math.sin(2 * math.pi * (d - 80) / 365.25)))))
        ww.append(flags)
    daily = {'TN': tn, 'TX': tx, 'RR': rr, 'SN': sn, 'FX': fx, 'NN': nn, 'SS': ss, 'WW': ww}
    hourly = None
    if hours:
        per = 24 // hours
        cols = {k: [] for k in hour_cols}
        for d in range(n):
            for k in range(per):
                h = k * hours
                frac = (1 - math.cos(2 * math.pi * (h - 3) / 24)) / 2  # 3 h UTC le plus froid, 15 h le plus chaud
                cols['T'].append(round(tn[d] + (tx[d] - tn[d]) * frac))
                cols['RR'].append(round(rr[d] / per))
                cols['FX'].append(round(fx[d] * (0.6 + 0.4 * frac)))
                cols['NN'].append(nn[d])
        hourly = cols
    return daily, hourly


def doy(y, m, d):
    return (datetime.date(y, m, d) - datetime.date(y, 1, 1)).days


def plant(daily, hourly, year, m, d, hours=0, **vals):
    i = doy(year, m, d)
    for k, v in vals.items():
        if k.startswith('h'):
            continue
        daily[k][i] = v
    if hourly is not None and 'hT' in vals:
        per = 24 // hours
        for k, t in enumerate(vals['hT']):
            if k < per:
                hourly['T'][i * per + k] = t


def write_series(db, table, key, ref, years, gen, lat, alt, seed, hours=0, plants=None, hour_years=None, normals_kind=None):
    rng = random.Random(seed)
    values = {}
    for y in years:
        hh = hours if (hour_years is None or y in hour_years) else 0
        daily, hourly = gen_year(rng, lat, alt, y, hh)
        for p in (plants or []):
            if p[0] == y:
                plant(daily, hourly, p[0], p[1], p[2], hh, **p[3])
        db.execute(f'INSERT OR REPLACE INTO {table}({key}, annee, blob) VALUES(?,?,?)', (ref, y, F.encode(list(daily.items()))))
        if hourly is not None:
            db.execute(f'INSERT OR REPLACE INTO {"hourly" if table == "daily" else "grid_hourly"}({key}, annee, blob) VALUES(?,?,?)',
                       (ref, y, F.encode(list(hourly.items()), step=hh)))
        values[y] = daily
    if normals_kind:
        for start, end, blob in F.compute_normals(values):
            db.execute('INSERT OR REPLACE INTO normals(sorte, ref_id, debut, fin, blob) VALUES(?,?,?,?,?)', (normals_kind, ref, start, end, blob))


# jours posés exprès (année, mois, jour, valeurs) — la famille DUPOUY de la maquette
PLANTS = {
    2: [(1901, 1, 14, dict(TN=-60, TX=10, RR=0, NN=10, WW=F.WW_ICE)), (1901, 1, 13, dict(TN=-52, TX=12)), (1901, 1, 15, dict(TN=-48, TX=14)),
        (1901, 1, 20, dict(TN=5, TX=30, RR=0, NN=90, WW=0))],
    1: [(1926, 10, 22, dict(TN=70, TX=90, RR=140, NN=100, WW=0)), (1978, 2, 3, dict(TN=-20, TX=70, RR=0, NN=60, WW=F.WW_FOG | F.WW_ICE, FX=25)),
        (1978, 2, 6, dict(TN=20, TX=60, RR=32, NN=95, WW=0)), (1956, 8, 4, dict(TN=170, TX=310, RR=0, NN=5, WW=0, SS=780)),
        (1920, 3, 9, dict(TN=60, TX=110, RR=48, NN=90, WW=0))],
}
ERA5_PLANTS = {(43.75, 0.5): [(1978, 2, 3, dict(TN=-25, TX=65, RR=0, NN=60, WW=F.WW_FOG, hT=[-10, -20, 60, 40]))]}


def main(out):
    os.makedirs(out, exist_ok=True)
    path = os.path.join(out, 'meteo-socle.sqlite')
    if os.path.exists(path):
        os.remove(path)
    db = F.open_db(path, 'socle', 'Socle (jeu d’essai fabriqué)')
    F.set_meta(db, countries='FR,BE,CH,LU', built='2026-10-22', fixture='1')
    F.add_sources(db, ['meteofrance', 'meteoswiss', 'irm', 'meteolux', 'era5', '20cr', 'copdem'], 2025)
    n = F.ELEVATION_N
    for la, lo in RELIEF_TILES:
        vals = [int(round(relief(la + i / n, lo + j / n))) for i in range(n) for j in range(n)]
        db.execute('INSERT INTO elevation(lat0, lon0, n, blob) VALUES(?,?,?,?)', (la, lo, n, F.encode_tile(vals)))
    for sid, src, code, nom, pays, lat, lon, alt, deb, fin in STATIONS:
        db.execute('INSERT INTO stations(id, source, code, nom, pays, lat, lon, alt, debut, fin) VALUES(?,?,?,?,?,?,?,?,?,?)',
                   (sid, src, code, nom, pays, lat, lon, alt, deb, fin))
        years = list(range(deb, fin + 1))
        write_series(db, 'daily', 'station_id', sid, years, gen_year, lat, alt, 1000 + sid, plants=PLANTS.get(sid), normals_kind='station')
    gid = 0
    for lat, lon in ERA5:
        gid += 1
        db.execute('INSERT INTO grid(id, source, lat, lon, alt, debut, fin, pas, heures_debut) VALUES(?,?,?,?,?,?,?,?,?)', (gid, 'era5', lat, lon, 150, 1940, 2025, 0.25, 1940))
        write_series(db, 'grid_daily', 'grid_id', gid, range(1940, 2026), gen_year, lat, 150, 5000 + gid, hours=6, plants=ERA5_PLANTS.get((lat, lon)), normals_kind='grid')
    for lat, lon in C20:
        gid += 1
        db.execute('INSERT INTO grid(id, source, lat, lon, alt, debut, fin, pas) VALUES(?,?,?,?,?,?,?,?)', (gid, '20cr', lat, lon, 250, 1836, 1939, 1.0))
        write_series(db, 'grid_daily', 'grid_id', gid, range(1836, 1940), gen_year, lat, 250, 9000 + gid, normals_kind='grid')
    db.commit()
    db.execute('VACUUM')
    db.close()

    # Un pack « complet » : la station de Lectoure, chaque jour 1950–2025 et heure par heure 1980–1990
    tmp = os.path.join(out, 'meteo-complet.tmp.sqlite')
    if os.path.exists(tmp):
        os.remove(tmp)
    db = F.open_db(tmp, 'complet', 'Pack complet (jeu d’essai fabriqué)')
    F.set_meta(db, countries='FR,BE,CH,LU', built='2026-10-22', fixture='1')
    F.add_sources(db, ['meteofrance'], 2025)
    db.execute('INSERT INTO stations(id, source, code, nom, pays, lat, lon, alt, debut, fin, heures_debut) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
               (1, 'meteofrance', '32208001', 'Lectoure', 'FR', 43.9340, 0.6220, 160, 1950, 2025, 1980))
    write_series(db, 'daily', 'station_id', 1, range(1950, 2026), gen_year, 43.934, 160, 777, hours=1, hour_years=set(range(1980, 1991)),
                 plants=[(1985, 7, 14, dict(TN=170, TX=300, RR=0, NN=10, WW=0))], normals_kind='station')
    db.commit()
    db.execute('VACUUM')
    db.close()
    info = F.wrap_pack(tmp, os.path.join(out, 'meteo-pack-complet.lcmeteo'))
    os.remove(tmp)
    for f in sorted(os.listdir(out)):
        if f.startswith('meteo'):
            print(f'{f}\t{os.path.getsize(os.path.join(out, f)) / 1e6:.1f} Mo')
    return info


if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.exit('usage : make-fixture.py DOSSIER')
    main(sys.argv[1])
