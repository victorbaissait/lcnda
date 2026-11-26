#!/usr/bin/env python3
"""🌊 Lot I — le niveau moyen de la mer à Brest (depuis 1807 au PSMSL ; marégraphe installé en 1711) et à Marseille (depuis 1885)
→ ti-maregraphe.json.gz.   À FABRIQUER SUR GITHUB : psmsl.org est refusé par le réseau de l'atelier de développement.

Source : Permanent Service for Mean Sea Level (PSMSL), séries annuelles « RLR » (Revised Local Reference), stations 1 (Brest) et
61 (Marseille), https://psmsl.org/data/obtaining/rlr.annual.data/<id>.rlrdata (année ; niveau en mm ; jours manquants ; drapeau ;
-99999 = pas de valeur) et la liste des stations (filelist.txt : position, nom).
Licence : le script LIT D'ABORD la page des conditions du PSMSL (https://psmsl.org/data/obtaining/) et recopie dans le fichier
les phrases qui disent que les données sont libres et comment les citer ; s'il ne les trouve pas, il s'arrête sans rien écrire.
Citation demandée par le PSMSL : Holgate et al. (2013), « New Data Systems and Products at the Permanent Service for Mean Sea
Level », Journal of Coastal Research 29(3), 493–504, doi:10.2112/JCOASTRES-D-12-00175.1 ; et « Permanent Service for Mean Sea Level
(PSMSL), <année>, Tide Gauge Data, Retrieved <date> from http://www.psmsl.org/data/obtaining/ ».
Lancer : python3 -I scripts/telech-i/build_maregraphe.py [dossier de sortie]
"""
import html, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'assets', 'data')
BASE = 'https://psmsl.org/data/obtaining/'
STATIONS = {1: 'Brest', 61: 'Marseille'}


def main():
    page = html.unescape(re.sub(r'<[^>]+>', ' ', wm.get(BASE, 'text/html').decode('utf-8', 'replace')))
    page = ' '.join(page.split())
    sent = re.split(r'(?<=[.!?])\s+', page)
    free = [s for s in sent if re.search(r'(?i)\bfree(ly)?\b|without restriction|no restriction', s)]
    cite = [s for s in sent if re.search(r'(?i)\bcit(e|ed|ation)\b|acknowledg', s)]
    if not free:
        sys.exit('Conditions du PSMSL : aucune phrase « libre / free » trouvée sur ' + BASE + ' — rien n’est écrit.')
    stations = {}
    for line in wm.get(BASE + 'rlr.annual.data/filelist.txt', 'text/plain').decode('utf-8', 'replace').splitlines():
        p = [x.strip() for x in line.split(';')]
        if len(p) >= 4 and p[0].isdigit() and int(p[0]) in STATIONS:
            stations[int(p[0])] = {'id': int(p[0]), 'name': p[3].title(), 'lat': float(p[1]), 'lon': float(p[2])}
    rows = []
    for sid in STATIONS:
        for line in wm.get(f'{BASE}rlr.annual.data/{sid}.rlrdata', 'text/plain').decode('utf-8', 'replace').splitlines():
            p = [x.strip() for x in line.split(';')]
            if len(p) >= 2 and re.match(r'^\d{4}$', p[0]) and p[1] not in ('-99999', ''):
                rows.append([sid, int(p[0]), int(float(p[1]))])
    assert sum(1 for r in rows if r[0] == 1) > 150, 'série de Brest trop courte'
    fields = ['st', 'y', 'mm']
    meta = {'source': 'Permanent Service for Mean Sea Level (PSMSL), Tide Gauge Data (séries annuelles RLR)', 'licence': 'Données libres, à citer (conditions du PSMSL)',
            'licence_url': BASE, 'url': BASE, 'built': wm.today(), 'policy_free': free[:3], 'policy_cite': cite[:4],
            'cite': ['Holgate, S.J. et al. (2013) New Data Systems and Products at the Permanent Service for Mean Sea Level. Journal of Coastal Research 29(3), 493–504. doi:10.2112/JCOASTRES-D-12-00175.1',
                     f'Permanent Service for Mean Sea Level (PSMSL), {wm.today()[:4]}, Tide Gauge Data, Retrieved {wm.today()} from http://www.psmsl.org/data/obtaining/'],
            'stations': [stations.get(s, {'id': s, 'name': n}) for s, n in STATIONS.items()],
            'what': 'Niveau moyen annuel de la mer à Brest et à Marseille (mm, référence locale révisée)', 'fields': fields, 'rows': rows}
    size = wm.write_gz(OUT, 'ti-maregraphe.json.gz', meta)
    print(f'ti-maregraphe : {len(rows)} années, {size} octets ; conditions : {free[0][:160]}')


if __name__ == '__main__':
    main()
