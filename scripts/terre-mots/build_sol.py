#!/usr/bin/env python3
"""🪨 Le sol et le relief du village : la roche sous chaque commune de France et son altitude → assets/data/tm-sol.json.gz

Sources (téléchargées par ce script ; réponses gardées dans TM_RAW) :
  - la roche : « Continental Europe surface lithology based on EGDI / OneGeology map at 1:1M scale » (GEOZS, Zenodo 12607973,
    CC BY 4.0) — fichier EGDI_GE_GeologicUnit_EN_1M_Surface_LithologyPolygon_v2_250m_epsg.3035.tif, la carte EGDI d'origine
    (sans les trous comblés par calcul) : pour la France, elle reprend la carte géologique du BRGM à 1/1 000 000 diffusée par le
    service européen EGDI / OneGeology. Pixel de 250 m. On prend la roche la plus fréquente dans un carré de 1,25 km autour
    du centre de la commune.
  - l'altitude du centre de la commune : service d'altimétrie de l'IGN (Géoplateforme, data.geopf.fr, RGE ALTI®, Licence Ouverte 2.0).
  - les centres des communes : assets/data/cc-communes.json.gz (france-geojson, IGN / Etalab, déjà livré avec l'app).
Le service WMS/WFS du BRGM (geoservices.brgm.fr) refuse nos appels et InfoTerre était fermé le jour de la fabrication :
la carte EGDI (même carte BRGM au millionième) a été prise à la place.
Lancer : <venv avec tifffile, imagecodecs, numpy, pyproj>/python3 build_sol.py [dossier de sortie]
"""
import gzip, json, os, sys, time, urllib.request, datetime
import numpy as np, tifffile
from pyproj import Transformer

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import wm
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', '..', 'assets', 'data')
TIF_URL = 'https://zenodo.org/api/records/12607973/files/EGDI_GE_GeologicUnit_EN_1M_Surface_LithologyPolygon_v2_250m_epsg.3035.tif/content'

# les 121 classes de la carte (fichier .csv de la légende, Zenodo 12607973) regroupées en familles simples
FAM = {
    'granite': 'granite granitoid granodiorite monzogranite syenogranite tonalite quartzDiorite diorite dioriticRock phaneriticIgneousRock syenite syeniticRock foidBearingSyenite foidSyenitoid monzonite anorthositicRock porphyry',
    'volcan': 'alkaliOlivineBasalt andesite ashBrecciaBombOrBlockTephra ashTuffLapillistoneAndLapilliTuff basalt basanite dacite fineGrainedIgneousRock fragmentalIgneousMaterial phonolite pyroclasticMaterial pyroclasticRock rhyolite rhyolitoid spilite tephrite tholeiiticBasalt trachyte trachyticRock trachytoid tuffBrecciaAgglomerateOrPyroclasticBreccia doleriticRock',
    'gabbro': 'gabbro gabbroicRock gabbroid peridotite pyroxenite serpentinite ultramaficIgneousRock komatiiticRock eclogite amphibolite carbonatite exoticCompositionIgneousRock igneousMaterial igneousRock',
    'gneiss': 'gneiss orthogneiss paragneiss migmatite granulite',
    'schiste': 'schist micaSchist phyllite phyllonite slate chloriteActinoliteEpidoteMetamorphicRock glaucophaneLawsoniteEpidoteMetamorphicRock foliatedMetamorphicRock myloniticRock hornfels metamorphicRock metasomaticRock skarn',
    'marbre': 'marble',
    'quartzite': 'quartzite',
    'calcaire': 'limestone carbonateSedimentaryRock impureLimestone impureCarbonateSedimentaryRock impureCarbonateSediment carbonateMud carbonateOoze travertine biogenicSilicaSedimentaryRock nonClasticSiliceousSedimentaryRock',
    'dolomie': 'dolomite dolomiticOrMagnesianSedimentaryRock impureDolomite',
    'craie': 'chalk',
    'gres': 'sandstone arenite clasticSandstone wacke',
    'conglomerat': 'conglomerate breccia diamictite brecciaGougeSeries',
    'argile': 'clay claystone mudstone mud silicateMud shale organicBearingMudstone siltstone',
    'limon': 'silt',
    'sable': 'sand gravel clasticSediment clasticSedimentaryMaterial clasticSedimentaryRock diamicton sediment sedimentaryMaterial sedimentaryRock residualMaterial',
    'tourbe': 'peat organicRichSediment organicRichSedimentaryMaterial',
    'gypse': 'gypsumOrAnhydrite',
}
FAMILIES = list(FAM)

def legend():
    import csv, io
    body = wm.get('https://zenodo.org/api/records/12607973/files/dtm_surface.lithology_egdi.1m_c_250m_s_20000101_20221231_eu_epsg.3035_v20240530.tif.csv/content', accept='*/*', key='egdi-legend.csv').decode()
    lab = {int(r['Class']): r['Description'] for r in csv.DictReader(io.StringIO(body))}
    rev = {n: f for f, names in FAM.items() for n in names.split()}
    return {c: (FAMILIES.index(rev[n]) if n in rev else None) for c, n in lab.items()}, lab

def main():
    tif = os.path.join(wm.RAW, 'egdi-1m.tif')
    if not os.path.exists(tif):
        os.makedirs(wm.RAW, exist_ok=True)
        req = urllib.request.Request(TIF_URL, headers={'User-Agent': wm.UA})
        with urllib.request.urlopen(req, timeout=600) as r, open(tif + '.part', 'wb') as f: f.write(r.read())
        os.rename(tif + '.part', tif)
    page = tifffile.TiffFile(tif).pages[0]
    sx, sy = page.tags['ModelPixelScaleTag'].value[:2]
    x0, y0 = page.tags['ModelTiepointTag'].value[3:5]
    a = page.asarray()
    code2fam, lab = legend()
    C = json.loads(gzip.open(os.path.join(HERE, '..', '..', 'assets', 'data', 'cc-communes.json.gz')).read())['c']
    tr = Transformer.from_crs('EPSG:4326', 'EPSG:3035', always_xy=True)
    rows = {}
    pts = []
    for insee, (name, lat, lon) in C.items():
        if lat is None: continue
        pts.append((insee, lat, lon))
        X, Y = tr.transform(lon, lat)
        col, row = int((X - x0) / sx), int((y0 - Y) / sy)
        if not (2 <= row < a.shape[0] - 2 and 2 <= col < a.shape[1] - 2): continue
        win = a[row - 2:row + 3, col - 2:col + 3].ravel()
        fams = [code2fam.get(int(v)) for v in win if 0 < v < 122]
        fams = [f for f in fams if f is not None]
        if not fams: continue
        vals, cnt = np.unique(fams, return_counts=True)
        order = np.argsort(-cnt)
        main_f = int(vals[order[0]])
        second = int(vals[order[1]]) if len(order) > 1 and cnt[order[1]] >= 5 else None
        centre = code2fam.get(int(a[row, col])) if 0 < a[row, col] < 122 else None
        rows[insee] = [main_f, second, lab[int(a[row, col])] if 0 < a[row, col] < 122 else '']
    # l'altitude du centre de chaque commune (IGN), 100 points par appel
    alt = {}
    for i in range(0, len(pts), 100):
        part = pts[i:i + 100]
        url = ('https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json?resource=ign_rge_alti_wld&zonly=true&lon='
               + '|'.join(f'{p[2]:.5f}' for p in part) + '&lat=' + '|'.join(f'{p[1]:.5f}' for p in part))
        j = json.loads(wm.get(url, gap=0.3))
        for p, z in zip(part, j.get('elevations', [])):
            if isinstance(z, (int, float)) and z > -1000: alt[p[0]] = round(z)
        if i % 5000 == 0: print('altitude', i, flush=True)
    out = {}
    for insee in C:
        r = rows.get(insee); z = alt.get(insee)
        if r is None and z is None: continue
        out[insee] = [r[0] if r else None, r[1] if r else None, z]
    obj = {'v': 1, 'built': datetime.date.today().isoformat(),
           'families': FAMILIES,
           'attr': {'rock': 'Carte géologique à 1/1 000 000 (BRGM) via EGDI / OneGeology — « Continental Europe surface lithology based on EGDI / OneGeology map at 1:1M scale », GEOZS, Zenodo, doi:10.5281/zenodo.12607973',
                    'rock_licence': 'CC BY 4.0', 'rock_url': 'https://doi.org/10.5281/zenodo.12607973',
                    'alt': 'IGN, Géoplateforme, service d’altimétrie (RGE ALTI®)', 'alt_licence': 'Licence Ouverte 2.0 (Etalab)', 'alt_url': 'https://geoservices.ign.fr/documentation/services/services-geoplateforme/altimetrie'},
           'c': out}
    p = os.path.join(OUT, 'tm-sol.json.gz')
    with gzip.open(p, 'wt', encoding='utf-8', compresslevel=9) as f: json.dump(obj, f, ensure_ascii=False, separators=(',', ':'))
    print('tm-sol', len(out), 'communes, roche', sum(1 for v in out.values() if v[0] is not None), ', altitude', sum(1 for v in out.values() if v[2] is not None), os.path.getsize(p), 'octets')

if __name__ == '__main__':
    main()
