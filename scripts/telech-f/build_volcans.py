#!/usr/bin/env python3
"""🌋 Lot F — La couleur du ciel les années de volcans lointains : assets/data/tf-volcans.json.gz.

PROLONGE ce qui existe déjà (rien n'est recopié) : « 🌅 Les ciels étranges de sa vie » (lot 8, l8a-ciels : Laki, Tambora, Krakatoa,
Toungouska, Pinatubo, avec les phrases de Wikipédia) et « 🌋 Les volcans qui ont gâché ses récoltes » (lot 10, l10t-volcans). Ici, les
MESURES, année par année, pour TOUTES les grandes éruptions (aussi celles que ces deux listes n'ont pas : 1809, 1831, 1835…) :
 - l'épaisseur optique des aérosols volcaniques (AOD à 550 nm) entre 30° et 90° nord, la bande où est la France : Crowley, T.J. et
   Unterman, M.B. (2013), « Technical details concerning development of a 1200-yr proxy index for global volcanism », Earth System
   Science Data 5, 187-197, doi:10.5194/essd-5-187-2013 — fichier ICI5_3090N_AOD_c.txt, NOAA NCEI / World Data Service for
   Paleoclimatology (« Users may access and download these data free of charge; please cite the original references ») ;
 - le soufre envoyé dans la stratosphère de l'hémisphère nord (Tg) : Gao, C., Robock, A. et Ammann, C. (2008), « Volcanic forcing of
   climate over the past 1500 years: An improved ice core-based index for climate models », J. Geophys. Res. 113, D23111,
   doi:10.1029/2008JD010239 — fichier IVI2TotalInjection_501-2000Version2.txt (même dépôt) ;
 - le nom du volcan : la base des éruptions de la NOAA (domaine public), déjà livrée dans l'app (ha-catastrophes.json.gz) — seulement
   quand une éruption d'indice VEI ≥ 4 est connue l'année même ou l'année d'avant ; sinon « éruption non identifiée » (c'est le cas de 1809).
Lancer : python3 -I scripts/telech-f/build_volcans.py [dossier de sortie]
"""
import gzip, json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'assets', 'data')
BASE = 'https://www.ncei.noaa.gov/pub/data/paleo/climate_forcing/volcanic_aerosols/'
AOD = BASE + 'crowley2013/ICI5_3090N_AOD_c.txt'
GAO = BASE + 'gao2008ivi2/IVI2TotalInjection_501-2000Version2.txt'
Y0, Y1 = 1600, 2000
KNOWN = {1783: 'laki', 1784: 'laki', 1815: 'tambora', 1816: 'tambora', 1883: 'krakatoa', 1884: 'krakatoa', 1991: 'pinatubo', 1992: 'pinatubo', 1600: 'huaynaputina', 1601: 'huaynaputina'}


def main():
    acc = {}
    for line in wm.get(AOD, 'text/plain').decode().splitlines():
        p = line.split()
        if len(p) == 2 and re.match(r'^\d', p[0]):
            y = int(float(p[0]))
            if Y0 <= y <= Y1:
                acc.setdefault(y, []).append(float(p[1]))
    aod = {y: round(sum(v) / len(v), 4) for y, v in acc.items()}
    peak = {y: round(max(v), 4) for y, v in acc.items()}
    inj = {}
    for line in wm.get(GAO, 'text/plain').decode().splitlines():
        p = line.split()
        if len(p) >= 4 and p[0].isdigit() and Y0 <= int(p[0]) <= Y1:
            inj[int(p[0])] = float(p[1])
    cat = json.load(gzip.open(os.path.join(ROOT, 'assets', 'data', 'ha-catastrophes.json.gz')))
    F = cat['fields']
    vo = [dict(zip(F, r)) for r in cat['rows'] if r[0] == 'vo' and r[F.index('y')] is not None and Y0 - 1 <= r[F.index('y')] <= Y1 and (r[F.index('mag')] or 0) >= 4]
    events = []
    years = sorted(aod)
    for y in years:
        # une « année de ciel voilé » : un sommet local de l'AOD au-dessus de 0,04 (Pinatubo ≈ 0,1 ; Tambora ≈ 0,5)
        if peak[y] < 0.04 or peak[y] <= peak.get(y - 1, 0) or peak[y] < peak.get(y + 1, 0):
            continue
        start = y
        while start - 1 in aod and aod[start - 1] > 0.02 and start > y - 3:
            start -= 1
        cand = sorted([v for v in vo if start - 1 <= v['y'] <= y], key=lambda v: (-(v['mag'] or 0), -(v['y'])))
        v = cand[0] if cand else None
        tg = max([inj.get(k, 0) for k in range(start - 1, y + 1)] or [0])
        name = v['volcano'] if v else ''
        if ', ' in name:
            name = ' '.join(reversed(name.split(', ', 1)))  # « Chichon, El » → « El Chichon »
        known = KNOWN.get(v['y'] if v else y, KNOWN.get(y, ''))
        if known == 'laki':
            name = 'Laki (système du Grímsvötn)'
        events.append({'y': y, 'from': start, 'aod': peak[y], 'tg': round(tg, 1), 'volcano': name, 'country': v['country'] if v else '', 'vei': v['mag'] if v else None,
                       'ey': v['y'] if v else None, 'noaa': v['id'] if v else None, 'known': known})
    meta = {'source': 'Crowley et Unterman 2013 (AOD 30°–90° N) ; Gao, Robock et Ammann 2008 (IVI2) ; NOAA NCEI, base des éruptions', 'licence': 'Données libres de la NOAA NCEI / WDS Paleoclimatology (à citer) ; domaine public (NOAA)',
            'licence_url': 'https://www.ncei.noaa.gov/pub/data/paleo/aar/readme-ncei-wds-paleoclimatology.txt', 'url': 'https://www.ncei.noaa.gov/access/paleo-search/study/14168', 'url2': AOD, 'url3': GAO,
            'cite': ['Crowley, T.J. et Unterman, M.B. (2013), Earth Syst. Sci. Data 5, 187–197, doi:10.5194/essd-5-187-2013', 'Gao, C., Robock, A. et Ammann, C. (2008), J. Geophys. Res. 113, D23111, doi:10.1029/2008JD010239'],
            'built': wm.today(), 'what': 'Les années où les cendres de volcans lointains ont voilé le ciel de l’hémisphère nord (1600-2000) : épaisseur des aérosols et volcan responsable quand il est connu',
            'aod_from': Y0, 'aod': [aod.get(y) for y in range(Y0, Y1 + 1)],
            'fields': ['y', 'from', 'aod', 'tg', 'volcano', 'country', 'vei', 'ey', 'noaa', 'known'], 'rows': [[e[k] for k in ['y', 'from', 'aod', 'tg', 'volcano', 'country', 'vei', 'ey', 'noaa', 'known']] for e in events]}
    size = wm.write_gz(OUT, 'tf-volcans.json.gz', meta)
    print(f'tf-volcans : {len(events)} années de ciel voilé, {size} octets')
    for e in events:
        print(' ', e['y'], e['aod'], e['tg'], e['volcano'], e['ey'], e['known'])


if __name__ == '__main__':
    main()
