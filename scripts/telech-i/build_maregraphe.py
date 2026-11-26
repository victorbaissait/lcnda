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
from urllib.parse import urljoin, urlparse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'assets', 'data')
BASE = 'https://psmsl.org/data/obtaining/'
STATIONS = {1: 'Brest', 61: 'Marseille'}


def main():
    # la page « Obtaining data » et les pages de conditions qu'elle désigne (data policy, terms, licence…), sur psmsl.org seulement
    raw = wm.get(BASE, 'text/html').decode('utf-8', 'replace')
    pages = {BASE: raw}
    for href, text in re.findall(r'<a[^>]+href="([^"#]+)"[^>]*>(.*?)</a>', raw, re.I | re.S):
        if re.search(r'(?i)polic|terms|licen|condition|citing|acknowledg', href + ' ' + text):
            u = urljoin(BASE, html.unescape(href))
            if urlparse(u).hostname in ('psmsl.org', 'www.psmsl.org') and u not in pages and len(pages) < 8:
                try:
                    pages[u] = wm.get(u, 'text/html').decode('utf-8', 'replace')
                except Exception as e:  # noqa
                    print(f'  {u} : pas lue ({e})', flush=True)
    print('Pages des conditions lues :', ', '.join(pages), flush=True)
    sent, src = [], {}
    for u, t in pages.items():
        t = ' '.join(html.unescape(re.sub(r'<[^>]+>', ' ', re.sub(r'(?is)<(script|style)\b.*?</\1>', ' ', t))).split())
        for x in re.split(r'(?<=[.!?])\s+', t):
            sent.append(x); src[x] = u
    free = [s for s in sent if re.search(r'(?i)\bfree(ly)?\b|free of charge|without (any )?restriction|no restriction|creative commons|\bCC[ -]BY\b|open licen[cs]e|without charge', s)]
    cite = [s for s in sent if re.search(r'(?i)\bcit(e|ed|ation|ing)\b|acknowledg', s)]
    if not free:
        print('  phrases qui parlent de données / d’usage :', [s[:200] for s in sent if re.search(r'(?i)\b(data|use|policy|terms)\b', s)][:12], flush=True)
        sys.exit('Conditions du PSMSL : aucune phrase « libre / free » trouvée sur ' + ', '.join(pages) + ' — rien n’est écrit.')
    print('Conditions :', free[0][:200], '(' + src[free[0]] + ')', flush=True)
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
            'licence_url': src[free[0]], 'url': BASE, 'built': wm.today(), 'policy_free': free[:3], 'policy_cite': cite[:4],
            'cite': ['Holgate, S.J. et al. (2013) New Data Systems and Products at the Permanent Service for Mean Sea Level. Journal of Coastal Research 29(3), 493–504. doi:10.2112/JCOASTRES-D-12-00175.1',
                     f'Permanent Service for Mean Sea Level (PSMSL), {wm.today()[:4]}, Tide Gauge Data, Retrieved {wm.today()} from http://www.psmsl.org/data/obtaining/'],
            'stations': [stations.get(s, {'id': s, 'name': n}) for s, n in STATIONS.items()],
            'what': 'Niveau moyen annuel de la mer à Brest et à Marseille (mm, référence locale révisée)', 'fields': fields, 'rows': rows}
    size = wm.write_gz(OUT, 'ti-maregraphe.json.gz', meta)
    print(f'ti-maregraphe : {len(rows)} années, {size} octets ; conditions : {free[0][:160]}')


if __name__ == '__main__':
    main()
