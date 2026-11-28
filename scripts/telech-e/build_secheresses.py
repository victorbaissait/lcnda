#!/usr/bin/env python3
"""🌾 Lot E — Atlas des sécheresses d'Europe (assets/data/te-secheresses.json.gz).

Source : Old World Drought Atlas (OWDA), Cook, E.R., et al. (2015), « Old World megadroughts and pluvials during the Common
Era », Science Advances 1(10), e1500561, doi:10.1126/sciadv.1500561 ; données NOAA/NCEI World Data Service for Paleoclimatology,
doi:10.25921/rjm6-mq74, https://www.ncei.noaa.gov/access/paleo-search/study/19419 : indice de Palmer (scPDSI) de l'été
(juin-juil.-août) reconstruit par les cernes des arbres, carreaux de 0,5°, années 0 à 2012.
Conditions (NCEI/WDS Paleoclimatology, readme lu le 2026-11-26) : « Users may access and download these data free of charge;
please cite the original references… » ; fiche ISO de l'étude : « Cite as: Cook, E.R. (2015-11-06): NOAA/WDS Paleoclimatology -
Old World Drought Atlas… » — le script relit le readme et s'arrête s'il a changé.

Gardé : les carreaux de la France, de la Belgique, du Luxembourg et de la Suisse (wm.AREA), les années 1000 à 2012, l'indice
×10 (entier). Négatif = été sec, positif = été humide (−4 et moins : sécheresse extrême).

Lancer : python3 -I scripts/telech-e/build_secheresses.py [dossier de sortie]   (TE_RAW = cache ; owda.txt ≈ 87 Mo)
"""
import os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm
from build_hivers import licence, README, QUOTE

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'assets', 'data')
BASE = 'https://www.ncei.noaa.gov/pub/data/paleo/treering/reconstructions/europe'
Y0 = 1000


def main():
    licence()
    xy = [l.split() for l in wm.get(f'{BASE}/owda-xy.txt', 'text/plain').decode().splitlines() if l.strip()]
    la0, la1, lo0, lo1 = wm.AREA
    keep = [(i, float(p[1]), float(p[0])) for i, p in enumerate(xy) if la0 <= float(p[1]) <= la1 and lo0 <= float(p[0]) <= lo1]
    cols = {i: [] for i, _, _ in keep}
    years = []
    for line in wm.get(f'{BASE}/owda.txt', 'text/plain').decode().splitlines()[1:]:
        p = line.split()
        if not p:
            continue
        y = int(p[0])
        if y < Y0:
            continue
        years.append(y)
        for i, _, _ in keep:
            v = float(p[1 + i])
            cols[i].append(None if v < -90 else round(v * 10))
    assert years == list(range(Y0, years[-1] + 1)), 'années manquantes'
    out = []
    for i, lat, lon in keep:
        v = cols[i]
        k = next((j for j, x in enumerate(v) if x is not None), None)
        if k is None:
            continue
        out.append([lat, lon, Y0 + k, v[k:]])
    meta = {'source': 'Old World Drought Atlas (Cook et al. 2015) — NOAA/NCEI World Data Service for Paleoclimatology',
            'licence': 'libre et gratuit, à citer (NOAA/NCEI WDS Paleoclimatology)', 'licence_url': README, 'quote': QUOTE,
            'url': 'https://www.ncei.noaa.gov/access/paleo-search/study/19419', 'doi': 'https://doi.org/10.25921/rjm6-mq74', 'built': time.strftime('%Y-%m-%d'),
            'cite': 'Cook, E.R., et al. (2015), Old World megadroughts and pluvials during the Common Era, Science Advances 1(10), e1500561, doi:10.1126/sciadv.1500561',
            'what': 'Sécheresse ou humidité de chaque été (indice de Palmer scPDSI, juin-août) reconstruite par les cernes des arbres, carreaux de 0,5°, années 1000 à 2012 ; valeurs ×10',
            'y1': years[-1], 'step': 0.5, 'area': list(wm.AREA), 'fields': ['lat', 'lon', 'y0', 'v'], 'rows': out}
    size = wm.write_gz(OUT, 'te-secheresses.json.gz', meta)
    print(f'te-secheresses : {len(out)} carreaux, {years[0]}-{years[-1]}, {size} octets')


if __name__ == '__main__':
    main()
