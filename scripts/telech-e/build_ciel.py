#!/usr/bin/env python3
"""🌌 Lot E — Le ciel noir d'autrefois (assets/data/te-ciel.json.gz).

L'atlas demandé (Falchi et al. 2016, « World Atlas of Artificial Night Sky Brightness », GFZ Data Services,
doi:10.5880/GFZ.1.4.2016.001) n'est PAS repris : licence non commerciale (CC BY-NC 4.0), téléchargement sur demande par un
formulaire, et une note de 2016 qui interdit de le redistribuer (cité par Hotham 2026, README) → lien seulement.
À la place, un modèle OUVERT de la même grandeur (luminance artificielle du ciel au zénith, µcd/m²), avec les mêmes seuils :
  Hotham, T. (2026), « Darkest Skies: Where You Can Still See the Milky Way. A Sky Glow Model of the World and the United Kingdom
  from VIIRS Night Lights, Checked Against Citizen Sky Meter Readings », Zenodo, doi:10.5281/zenodo.23757708 —
  « Text, figures and derived data: CC BY 4.0 » (lumières : Earth Observation Group VIIRS via WorldPop, CC BY 4.0).
Le script lit la licence de la notice Zenodo (API) et s'arrête si ce n'est plus CC BY 4.0.
Gardé : la grille du monde à 5′ (data/page/world_sky.png : rouge = code de la luminance artificielle,
v = 1 + round(254·(log10 B − log10 0,5)/(log10 20000 − log10 0,5)), 0 si B < 0,5 µcd/m²) pour l'Europe de l'Ouest (35-60° N,
11° O-20° E), un octet par carreau (base64).

Lancer : python3 -I scripts/telech-e/build_ciel.py [dossier de sortie]   (TE_RAW = cache)
"""
import base64, io, json, os, struct, sys, time, zipfile, zlib
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'assets', 'data')
REC = 'https://zenodo.org/api/records/23757708'
ZIP = REC + '/files/dark-skies_code_and_data.zip/content'
TOP, LEFT, CELL, W, H = 75.0, -180.0, 1 / 12, 4320, 1620     # 75N → 60S, 5 minutes d'arc
BOX = (35.0, 60.0, -11.0, 20.0)


def png_rgb(data):
    """lecteur PNG minimal (8 bits, RGB ou RGBA, sans entrelacement) → (largeur, hauteur, canaux, lignes)"""
    assert data[:8] == b'\x89PNG\r\n\x1a\n'
    pos, idat, w = 8, b'', 0
    while pos < len(data):
        n, typ = struct.unpack('>I4s', data[pos:pos + 8]); body = data[pos + 8:pos + 8 + n]; pos += 12 + n
        if typ == b'IHDR':
            w, h, depth, ctype, _, _, inter = struct.unpack('>IIBBBBB', body)
            assert depth == 8 and ctype in (2, 6) and inter == 0, (depth, ctype, inter)
            ch = 3 if ctype == 2 else 4
        elif typ == b'IDAT':
            idat += body
    raw, stride, rows, prev = zlib.decompress(idat), w * ch, [], bytearray(w * ch)
    for y in range(h):
        f, line = raw[y * (stride + 1)], bytearray(raw[y * (stride + 1) + 1:(y + 1) * (stride + 1)])
        for i in range(stride):
            a = line[i - ch] if i >= ch else 0; b = prev[i]; c = prev[i - ch] if i >= ch else 0
            if f == 1: line[i] = (line[i] + a) & 255
            elif f == 2: line[i] = (line[i] + b) & 255
            elif f == 3: line[i] = (line[i] + (a + b) // 2) & 255
            elif f == 4:
                p = a + b - c; pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                line[i] = (line[i] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
        rows.append(line); prev = line
    return w, h, ch, rows


def main():
    rec = json.loads(wm.get(REC))
    lic = (rec.get('metadata', {}).get('license') or {}).get('id', '')
    if lic != 'cc-by-4.0':
        sys.exit(f'La licence de la notice Zenodo n’est plus CC BY 4.0 ({lic}) : relire {REC} avant de fabriquer le fichier.')
    z = zipfile.ZipFile(io.BytesIO(wm.get(ZIP, '*/*')))
    readme = z.read('README.md').decode('utf-8', 'replace')
    assert 'Text, figures and derived data: CC BY 4.0' in readme, 'README : licence des données dérivées introuvable'
    w, h, ch, rows = png_rgb(z.read('data/page/world_sky.png'))
    assert (w, h) == (W, H), (w, h)
    la0, la1, lo0, lo1 = BOX
    r0, r1 = int((TOP - la1) / CELL), int((TOP - la0) / CELL)
    c0, c1 = int((lo0 - LEFT) / CELL), int((lo1 - LEFT) / CELL)
    out = bytearray()
    for r in range(r0, r1):
        line = rows[r]
        out += bytes(line[c * ch] for c in range(c0, c1))
    meta = {'source': 'Hotham (2026), Darkest Skies — modèle de la luminance du ciel à partir des lumières VIIRS 2023 (Zenodo)',
            'licence': 'CC BY 4.0', 'licence_url': 'https://creativecommons.org/licenses/by/4.0/deed.fr', 'url': 'https://doi.org/10.5281/zenodo.23757708',
            'cite': 'Hotham, T. (2026) Darkest skies: where you can still see the Milky Way. A sky glow model of the world and the UK from VIIRS night lights. Zenodo. https://doi.org/10.5281/zenodo.23757708 — lumières : Earth Observation Group (VIIRS VNL), WorldPop, CC BY 4.0',
            'built': time.strftime('%Y-%m-%d'),
            'what': 'Clarté artificielle du ciel la nuit (au zénith), carreaux de 5′ (≈ 9 km), Europe de l’Ouest, lumières de 2023 : un octet par carreau (échelle logarithmique de 0,5 à 20 000 µcd/m²)',
            'code': {'lo': 0.5, 'hi': 20000, 'natural': 174, 'polluted': 13.9, 'milky_way': 688, 'no_dark_adapt': 3000},
            'top': TOP - r0 * CELL, 'left': LEFT + c0 * CELL, 'cell': CELL, 'w': c1 - c0, 'h': r1 - r0,
            'grid': base64.b64encode(bytes(out)).decode(), 'rows': []}
    size = wm.write_gz(OUT, 'te-ciel.json.gz', meta)
    print(f'te-ciel : {c1 - c0} × {r1 - r0} carreaux, {size} octets')


if __name__ == '__main__':
    main()
