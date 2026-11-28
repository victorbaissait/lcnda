#!/usr/bin/env python3
"""🌸 🌾 🌌 Lot K — le climat du monde (prolonge le lot E, scripts/telech-e) :
  tk-cerisiers    les cerisiers de Kyoto en fleur, depuis 812 (Aono et al., NOAA/NCEI WDS Paleoclimatology, étude 26430)
  tk-secheresses  les étés secs et humides d'Amérique du Nord (North American Drought Atlas v2a, Cook et al. 2008) et d'Asie des
                  moussons (Monsoon Asia Drought Atlas, Cook et al. 2010), carreaux de 2,5°, 1500-2006 — même forme que te-secheresses
                  (Old World Drought Atlas, Europe) : l'app lit les deux fichiers ensemble
  tk-ciel         le ciel la nuit dans le monde entier (Hotham 2026, Zenodo, CC BY 4.0) — même forme que te-ciel (Europe de l'Ouest,
                  carreaux de 5′) : ici le monde, carreaux de 10′ (≈ 18 km), lu quand le lieu est hors de te-ciel

Conditions NOAA/NCEI (readme relu à chaque fabrication) : « Users may access and download these data free of charge; please cite
the original references provided in the data documentation for each data set. » Zenodo : licence de la notice relue (cc-by-4.0)
et phrase du README (« Text, figures and derived data: CC BY 4.0 »).

Lancer : python3 -I scripts/telech-k/build_climat.py [dossier de sortie] [cerisiers|secheresses|ciel…]   (TK_RAW = cache)
"""
import base64, io, json, os, sys, zipfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ARGS = sys.argv[1:]
OUT = ARGS[0] if ARGS and os.path.isdir(ARGS[0]) else os.path.join(ROOT, 'assets', 'data')
WANT = [a for a in ARGS if not os.path.isdir(a)] or ['cerisiers', 'secheresses', 'ciel']
NCEI = 'https://www.ncei.noaa.gov/pub/data/paleo'
README = f'{NCEI}/aar/readme-ncei-wds-paleoclimatology.txt'
QUOTE = 'Users may access and download these data free of charge; please cite the original references provided in the data documentation for each data set.'
Y0 = 1500


def ncei_licence():
    t = ' '.join(wm.get(README, 'text/plain').decode('utf-8', 'replace').replace('#', ' ').split())
    if QUOTE not in t:
        sys.exit(f'Les conditions de NOAA/NCEI ont changé : relire {README} avant de fabriquer.')


def cerisiers():
    url = f'{NCEI}/historical/phenology/japan/kyoto2010flower.txt'
    txt = wm.get(url, 'text/plain').decode('utf-8', 'replace')
    assert 'Aono' in txt and 'Prunus jamasakura' in txt, 'fichier inattendu'
    rows = []
    for line in txt.splitlines():
        if line.startswith('#') or not line.strip() or line.startswith('age_CE'):
            continue
        p = line.split('\t')
        if len(p) < 3 or not p[1].strip():
            continue
        y, doy, mdd = int(p[0]), int(p[1]), p[2].strip()
        src = int(p[3]) if len(p) > 3 and p[3].strip().isdigit() else None
        ref = p[4].strip() if len(p) > 4 and p[4].strip() not in ('', '-') else ''
        rows.append([y, doy, int(mdd[:-2]) if len(mdd) >= 3 else None, int(mdd[-2:]) if len(mdd) >= 3 else None, src, ref[:80]])
    meta = {'source': 'Aono, Saito et Kazui — dates de pleine floraison des cerisiers (Prunus jamasakura) à Kyoto, 812-2005 (NOAA/NCEI WDS Paleoclimatology)',
            'licence': 'libre et gratuit, à citer (NOAA/NCEI WDS Paleoclimatology)', 'licence_url': README, 'quote': QUOTE,
            'url': 'https://www.ncei.noaa.gov/access/paleo-search/study/26430', 'data_url': url, 'built': wm.today(),
            'cite': 'Aono, Y. et Kazui, K. (2008), International Journal of Climatology 28, 905-914, doi:10.1002/joc.1594 ; Aono, Y. et Saito, S. (2010), International Journal of Biometeorology 54, 211-219, doi:10.1007/s00484-009-0272-x',
            'what': 'Le jour de pleine floraison des cerisiers de Kyoto, année par année, tiré des journaux et chroniques anciens (812-1880) puis des observations',
            'sources_code': {'1': 'Taguchi (1939)', '2': 'Sekiguchi (1969)', '3': 'Aono et Omoto (1994)', '4': 'Aono et Kazui (2008)', '5': 'Aono et Saito (2010)', '11': 'estimé par la glycine (Aono et Saito 2010)'},
            'lat': 35.0, 'lon': 135.7683, 'fields': ['y', 'doy', 'm', 'd', 'src', 'ref'], 'rows': rows}
    size = wm.write_gz(OUT, 'tk-cerisiers.json.gz', meta)
    print(f'tk-cerisiers : {len(rows)} années ({rows[0][0]}-{rows[-1][0]}), {size} octets')


def grid(xy_url, data_url, atlas, y_last):
    xy = [l.split() for l in wm.get(xy_url, 'text/plain').decode().splitlines() if l.strip()]
    cols, years = {i: [] for i in range(len(xy))}, []
    for line in wm.get(data_url, 'text/plain').decode().splitlines():
        p = line.split()
        if not p or not p[0].lstrip('-').isdigit():
            continue
        y = int(p[0])
        if y < Y0 or y > y_last:
            continue
        years.append(y)
        for i in range(len(xy)):
            v = float(p[1 + i])
            cols[i].append(None if v < -90 else round(v * 10))
    assert years == list(range(Y0, years[-1] + 1)), f'{atlas} : années manquantes'
    out = []
    for i, (lon, lat) in enumerate((float(a), float(b)) for a, b, *_ in xy):
        v = cols[i]
        k = next((j for j, x in enumerate(v) if x is not None), None)
        if k is None:
            continue
        while v and v[-1] is None:
            v.pop()
        out.append([lat, lon, Y0 + k, v[k:], 2.5, atlas])
    return out, years[-1]


def secheresses():
    nada, y1 = grid(f'{NCEI}/drought/pdsi2004/dai-namerica-grid.txt', f'{NCEI}/drought/NAmericanDroughtAtlas.v2/NADAv2a.txt', 'nada', 2006)
    mada, y2 = grid(f'{NCEI}/treering/reconstructions/asia/cook2010pdsi/jja-mada-xy.txt', f'{NCEI}/treering/reconstructions/asia/cook2010pdsi/jja-mada.txt', 'mada', 2005)
    assert len(nada) > 250 and len(mada) > 450, (len(nada), len(mada))
    meta = {'source': 'North American Drought Atlas v2a (Cook et al. 2008) et Monsoon Asia Drought Atlas (Cook et al. 2010) — NOAA/NCEI WDS Paleoclimatology',
            'licence': 'libre et gratuit, à citer (NOAA/NCEI WDS Paleoclimatology)', 'licence_url': README, 'quote': QUOTE,
            'url': 'https://www.ncei.noaa.gov/access/paleo-search/study/6319', 'built': wm.today(),
            'atlases': {'nada': {'name': 'North American Drought Atlas v2a', 'url': 'https://www.ncei.noaa.gov/access/paleo-search/study/6319',
                                 'cite': 'Cook, E.R., et al. (2008), North American Summer PDSI Reconstructions, Version 2a, IGBP PAGES/World Data Center for Paleoclimatology Data Contribution Series # 2008-046 ; Cook et al. (2004), Science 306, 1015-1018'},
                        'mada': {'name': 'Monsoon Asia Drought Atlas', 'url': 'https://www.ncei.noaa.gov/pub/data/paleo/treering/reconstructions/asia/cook2010pdsi/readme-cook2010mada.txt',
                                 'cite': 'Cook, E.R., et al. (2010), Asian Monsoon Failure and Megadrought During the Last Millennium, Science 328, 486-489, doi:10.1126/science.1185188'}},
            'what': f'Sécheresse ou humidité de chaque été (indice de Palmer, juin-août) reconstruite par les cernes des arbres, carreaux de 2,5°, {Y0}-{max(y1, y2)} ; valeurs ×10',
            'step': 2.5, 'fields': ['lat', 'lon', 'y0', 'v', 's', 'a'], 'rows': nada + mada}
    size = wm.write_gz(OUT, 'tk-secheresses.json.gz', meta)
    print(f'tk-secheresses : {len(nada)} carreaux d’Amérique du Nord, {len(mada)} d’Asie, {size} octets')


def ciel():
    sys.path.insert(0, os.path.join(ROOT, 'scripts', 'telech-e'))
    from build_ciel import png_rgb, REC, ZIP, TOP, LEFT, CELL, W, H   # le lecteur PNG et la grille du lot E (même source)
    rec = json.loads(wm.get(REC))
    lic = (rec.get('metadata', {}).get('license') or {}).get('id', '')
    if lic != 'cc-by-4.0':
        sys.exit(f'La licence de la notice Zenodo n’est plus CC BY 4.0 ({lic}) : relire {REC}.')
    z = zipfile.ZipFile(io.BytesIO(wm.get(ZIP, '*/*')))
    assert 'Text, figures and derived data: CC BY 4.0' in z.read('README.md').decode('utf-8', 'replace'), 'README : licence introuvable'
    w, h, ch, rows = png_rgb(z.read('data/page/world_sky.png'))
    assert (w, h) == (W, H), (w, h)
    k = 2   # 10′ : le plus clair des 4 carreaux de 5′ (une ville reste visible)
    out = bytearray()
    for r in range(0, H - H % k, k):
        for c in range(0, W - W % k, k):
            out.append(max(rows[r + i][(c + j) * ch] for i in range(k) for j in range(k)))
    meta = {'source': 'Hotham (2026), Darkest Skies — modèle de la luminance du ciel à partir des lumières VIIRS 2023 (Zenodo) : le monde',
            'licence': 'CC BY 4.0', 'licence_url': 'https://creativecommons.org/licenses/by/4.0/deed.fr', 'url': 'https://doi.org/10.5281/zenodo.23757708',
            'cite': 'Hotham, T. (2026) Darkest skies: where you can still see the Milky Way. A sky glow model of the world and the UK from VIIRS night lights. Zenodo. https://doi.org/10.5281/zenodo.23757708 — lumières : Earth Observation Group (VIIRS VNL), WorldPop, CC BY 4.0',
            'built': wm.today(),
            'what': 'Clarté artificielle du ciel la nuit (au zénith), le monde de 75° N à 60° S, carreaux de 10′ (≈ 18 km ; le plus clair des quatre carreaux de 5′), lumières de 2023 : un octet par carreau',
            'code': {'lo': 0.5, 'hi': 20000, 'natural': 174, 'polluted': 13.9, 'milky_way': 688, 'no_dark_adapt': 3000},
            'top': TOP, 'left': LEFT, 'cell': CELL * k, 'w': W // k, 'h': H // k, 'grid': base64.b64encode(bytes(out)).decode(), 'rows': []}
    size = wm.write_gz(OUT, 'tk-ciel.json.gz', meta)
    print(f'tk-ciel : {W // k} × {H // k} carreaux, {size} octets')


if __name__ == '__main__':
    if {'cerisiers', 'secheresses'} & set(WANT):
        ncei_licence()
    for k in WANT:
        {'cerisiers': cerisiers, 'secheresses': secheresses, 'ciel': ciel}[k]()
