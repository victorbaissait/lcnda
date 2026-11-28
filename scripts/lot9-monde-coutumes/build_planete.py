"""🌍 La planète de son vivant : population mondiale, CO₂ de l'air, écart de température du globe → assets/data/l9b-planete.json.gz
Sources (téléchargées par ce script) :
 - ONU, World Population Prospects 2024 (CC BY 3.0 IGO) : population du monde 1950-2024 (variante moyenne pour l'année en cours) ;
 - Our World in Data, « Global Population by Region with projections - HYDE (2016) & UN (2017) » (dépôt owid/owid-datasets, CC BY 4.0) :
   avant 1950, somme des 6 régions du monde (estimations HYDE 3.2) ; à passer en argument (chemin du CSV) ;
 - NOAA NCEI Paleoclimatology, Law Dome (Etheridge et al. 2010) : CO₂ (spline 20 ans), 1500-1958 (domaine public, gouvernement des États-Unis) ;
 - NOAA GML, Mauna Loa, moyennes annuelles 1959-… (« freely available to the public ») ;
 - NOAA NCEI, NOAAGlobalTemp (Climate at a Glance), écart de la température moyenne du globe à la moyenne 1901-2000, 1850-… (domaine public).
Usage : python3 build_planete.py <owid_hyde.csv>
"""
import csv, gzip, io, sys, os
sys.path.insert(0, os.path.dirname(__file__))
import common

owid = sys.argv[1]
WPP = 'https://population.un.org/wpp/assets/Excel%20Files/1_Indicator%20(Standard)/CSV_FILES/WPP2024_TotalPopulationBySex.csv.gz'
raw = gzip.decompress(common.get(WPP, binary=True)).decode('utf-8-sig')
pop = {}
for r in csv.DictReader(io.StringIO(raw)):
    if r['LocID'] == '900' and r['Variant'] == 'Medium' and int(r['Time']) <= 2024:
        pop[int(r['Time'])] = round(float(r['PopTotal']) * 1000)
hyde = {}
for r in csv.DictReader(open(owid, encoding='utf-8')):
    y = int(r['Year'])
    v = r['Global Population by Region (HYDE (2016) and UN (2017))']
    if 1000 <= y < 1950 and v:
        hyde[y] = hyde.get(y, 0) + int(float(v))
law = {}
txt = common.get('https://www.ncei.noaa.gov/pub/data/paleo/icecore/antarctica/law/law2006.txt')
lines = txt.splitlines()
i = next(k for k, l in enumerate(lines) if l.startswith('YearAD CH4spl'))
for l in lines[i + 1:]:
    p = l.split()
    if len(p) < 7:
        break
    y = int(float(p[4]))
    if 1400 <= y <= 1958:
        law[y] = float(p[5])
mlo = {}
for l in common.get('https://gml.noaa.gov/webdata/ccgg/trends/co2/co2_annmean_mlo.txt').splitlines():
    if l.startswith('#') or not l.strip():
        continue
    p = l.split()
    mlo[int(p[0])] = float(p[1])
temp = {}
TURL = 'https://www.ncei.noaa.gov/access/monitoring/climate-at-a-glance/global/time-series/globe/land_ocean/12/12/1850-2025/data.csv'
for l in common.get(TURL).splitlines():
    p = l.split(',')
    if len(p) == 2 and p[0].isdigit():
        temp[int(p[0])] = float(p[1])
out = {
    'v': 1, 'built': __import__('datetime').date.today().isoformat(),
    'pop': {'un': [[y, pop[y]] for y in sorted(pop)], 'hyde': [[y, hyde[y]] for y in sorted(hyde)]},
    'co2': {'law': [[y, law[y]] for y in sorted(law)], 'mlo': [[y, mlo[y]] for y in sorted(mlo)]},
    'temp': [[y, temp[y]] for y in sorted(temp)],
    'src': {
        'un': {'label': 'Nations unies, DESA, Division de la population — World Population Prospects 2024', 'licence': 'CC BY 3.0 IGO', 'licence_url': 'https://creativecommons.org/licenses/by/3.0/igo/', 'url': 'https://population.un.org/wpp/', 'mention': '© July 2024 by United Nations, made available under a Creative Commons license CC BY 3.0 IGO'},
        'hyde': {'label': 'Our World in Data, d’après HYDE 3.2 (Klein Goldewijk et al. 2016) : somme des six régions du monde', 'licence': 'CC BY 4.0', 'licence_url': 'https://creativecommons.org/licenses/by/4.0/deed.fr', 'url': 'https://github.com/owid/owid-datasets/tree/master/datasets/Global%20Population%20by%20Region%20with%20projections%20-%20HYDE%20(2016)%20%26%20UN%20(2017)'},
        'law': {'label': 'NOAA NCEI Paleoclimatology — Law Dome (Antarctique), Etheridge et al. 2010, courbe lissée sur 20 ans', 'licence': 'domaine public (NOAA)', 'url': 'https://www.ncei.noaa.gov/access/paleo-search/study/9959'},
        'mlo': {'label': 'NOAA Global Monitoring Laboratory — Mauna Loa (Hawaï), moyennes annuelles (Scripps avant 1974)', 'licence': 'données libres (NOAA)', 'url': 'https://gml.noaa.gov/ccgg/trends/data.html'},
        'temp': {'label': 'NOAA NCEI — NOAAGlobalTemp, Climate at a Glance : écart à la moyenne 1901-2000 (terres et océans)', 'licence': 'domaine public (NOAA)', 'url': 'https://www.ncei.noaa.gov/access/monitoring/climate-at-a-glance/global/time-series'},
    }}
print(len(pop), len(hyde), len(law), len(mlo), len(temp))
common.write_gz('l9b-planete.json.gz', out)
