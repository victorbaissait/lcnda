#!/usr/bin/env python3
"""❄️ Lot E — Les hivers terribles et les étés brûlants (assets/data/te-hivers.json.gz).

Source : Luterbacher, J., et al. (2006), European Seasonal Temperature Reconstructions, IGBP PAGES/World Data Center for
Paleoclimatology Data Contribution Series # 2006-060, NOAA/NCDC Paleoclimatology Program (NCEI) — reconstructions de
Luterbacher et al. 2004 (Science 303, 1499-1503) pour l'hiver (déc.-janv.-févr.) et l'été (juin-juil.-août), carreaux de 0,5°,
1500-1900 reconstruits, 1901-2002 observés (Mitchell et Jones 2005), 2003-2004 (Hansen et al. 2001).
https://www.ncei.noaa.gov/pub/data/paleo/historical/europe-seasonal.txt
Conditions (NCEI/WDS Paleoclimatology, readme lu le 2026-11-26) : « Users may access and download these data free of charge;
please cite the original references provided in the data documentation for each data set. » — le script relit ce texte et
s'arrête s'il a changé.

L'idée demandée citait l'indice des hivers de van Engelen et al. (Pays-Bas, 800-1998) : il n'est PAS sur le dépôt NOAA/NCEI
(recherche du 2026-11-26) ; la série de Luterbacher, au même endroit et aux mêmes conditions, donne en plus la valeur au carreau
du village (0,5°). Gardé : l'écart à la moyenne 1901-2000 du carreau, en dixièmes de degré, hiver et été, 1500-2004, pour la
France, la Belgique, le Luxembourg et la Suisse (wm.AREA).

Lancer : python3 -I scripts/telech-e/build_hivers.py [dossier de sortie]   (TE_RAW = cache des fichiers)
"""
import os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'assets', 'data')
BASE = 'https://www.ncei.noaa.gov/pub/data/paleo/historical'
README = 'https://www.ncei.noaa.gov/pub/data/paleo/aar/readme-ncei-wds-paleoclimatology.txt'
QUOTE = 'Users may access and download these data free of charge; please cite the original references provided in the data documentation for each data set.'
Y0, Y1, NC, NR = 1500, 2004, 130, 70   # 25W..40E, 70N..35N, carreaux de 0,5° (centres 69,75N… et 24,75W…)


def licence():
    txt = ' '.join(wm.get(README, 'text/plain').decode('utf-8', 'replace').replace('#', ' ').split())
    if QUOTE not in txt:
        sys.exit('Les conditions de NCEI/WDS Paleoclimatology ont changé : relire ' + README + ' avant de fabriquer le fichier.')


def season(y, s):
    vals = [float(x) for x in wm.get(f'{BASE}/europe-seasonal-files/{y}-{s}.txt', 'text/plain').decode().split()]
    if len(vals) != NC * NR:
        raise RuntimeError(f'{y}-{s} : {len(vals)} valeurs au lieu de {NC * NR}')
    return vals


def main():
    licence()
    la0, la1, lo0, lo1 = wm.AREA
    cells = [(r, c) for r in range(NR) for c in range(NC) if la0 <= 69.75 - .5 * r <= la1 and lo0 <= -24.75 + .5 * c <= lo1]
    series = {s: {k: [] for k in cells} for s in ('wi', 'su')}
    for y in range(Y0, Y1 + 1):
        for s in ('wi', 'su'):
            v = season(y, s)
            for (r, c) in cells:
                x = v[r * NC + c]
                series[s][(r, c)].append(None if x < -900 else x)
        if y % 50 == 0:
            print(y, flush=True)
    out = []
    for k in cells:
        row = [69.75 - .5 * k[0], -24.75 + .5 * k[1]]
        ok = True
        for s in ('wi', 'su'):
            vals = series[s][k]
            ref = [x for x in vals[1901 - Y0:2001 - Y0] if x is not None]
            if len(ref) < 90 or any(x is None for x in vals):
                ok = False; break
            m = sum(ref) / len(ref)
            row.append([round((x - m) * 10) for x in vals])
            row.append(round(m, 1))
        if ok:
            out.append(row)
    meta = {'source': 'Luterbacher et al. (2004, 2006), European Seasonal Temperature Reconstructions — NOAA/NCEI World Data Service for Paleoclimatology',
            'licence': 'libre et gratuit, à citer (NOAA/NCEI WDS Paleoclimatology)', 'licence_url': README, 'quote': QUOTE,
            'url': BASE + '/europe-seasonal.txt', 'doi': 'https://doi.org/10.1126/science.1093877', 'built': time.strftime('%Y-%m-%d'),
            'cite': 'Luterbacher, J., D. Dietrich, E. Xoplaki, M. Grosjean, H. Wanner (2004), European seasonal and annual temperature variability, trends and extremes since 1500, Science 303, 1499-1503.',
            'what': 'Température de chaque hiver (déc.-févr.) et de chaque été (juin-août) de 1500 à 2004, carreaux de 0,5° (≈ 50 km) : écart à la moyenne 1901-2000 du carreau, en dixièmes de degré',
            'y0': Y0, 'y1': Y1, 'step': 0.5, 'area': list(wm.AREA),
            'fields': ['lat', 'lon', 'wi', 'wi_ref', 'su', 'su_ref'], 'rows': out}
    size = wm.write_gz(OUT, 'te-hivers.json.gz', meta)
    print(f'te-hivers : {len(out)} carreaux, {size} octets')


if __name__ == '__main__':
    main()
