#!/usr/bin/env python3
"""🗳 Lot L — les membres du Congrès des États-Unis depuis 1789 (assets/data/tl-elus.json.gz).

Source : unitedstates/congress-legislators (GitHub), legislators-historical.json — données reprises du Biographical Directory of
the United States Congress (bioguide, domaine public, œuvre du gouvernement fédéral). Licence lue dans le README du dépôt (relu à
chaque fabrication) : « The project is in the public domain within the United States, and copyright and related rights in the
work worldwide are waived through the CC0 1.0 Universal public domain dedication ».
Gardé : seulement les élus nés il y a plus de 110 ans (le fichier ne dit pas les décès : la règle de l'app pour « une vie du passé »),
avec nom, naissance, État, chambre, premier et dernier mandat, parti, identifiant bioguide (→ fiche officielle) et Q de Wikidata.

Lancer : python3 -I scripts/telech-l/build_elus.py [dossier de sortie]   (TL_RAW = cache)
"""
import json, os, re, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'assets', 'data')
BASE = 'https://raw.githubusercontent.com/unitedstates/congress-legislators'


def main():
    readme = wm.get(f'{BASE}/main/README.md', '*/*').decode('utf-8')
    if 'CC0 1.0 Universal public domain dedication' not in readme:
        sys.exit('congress-legislators : le README ne dit plus « CC0 1.0 » : relire https://github.com/unitedstates/congress-legislators')
    data = json.loads(wm.get(f'{BASE}/gh-pages/legislators-historical.json', '*/*'))
    limit = int(time.strftime('%Y')) - 110
    rows, states, parties = [], [], []
    idx = lambda L, v: (L.index(v) if v in L else (L.append(v) or len(L) - 1))
    for p in data:
        b = (p.get('bio') or {}).get('birthday') or ''
        if not re.match(r'^\d{4}', b) or int(b[:4]) > limit:
            continue
        t = p.get('terms') or []
        if not t:
            continue
        bio = (p.get('id') or {}).get('bioguide') or ''
        if not re.match(r'^[A-Z]\d{6}$', bio):
            continue
        n = p.get('name') or {}
        name = ' '.join(x for x in [n.get('first'), n.get('middle'), n.get('last'), n.get('suffix')] if x)
        q = (p.get('id') or {}).get('wikidata') or ''
        ch = ''.join(sorted({'S' if x.get('type') == 'sen' else 'R' for x in t}))
        rows.append([name, b[:10], idx(states, t[-1].get('state') or ''), ch, int(t[0]['start'][:4]), int(t[-1]['end'][:4]),
                     idx(parties, next((x.get('party') for x in reversed(t) if x.get('party')), '')), bio, q if re.match(r'^Q\d+$', q) else '', (p.get('bio') or {}).get('gender') or ''])
    rows.sort(key=lambda r: (r[4], r[0]))
    assert len(rows) > 9000, len(rows)
    meta = {'source': 'Biographical Directory of the U.S. Congress, via unitedstates/congress-legislators', 'licence': 'CC0 1.0 (domaine public)', 'licence_url': 'https://creativecommons.org/publicdomain/zero/1.0/deed.fr',
            'url': 'https://github.com/unitedstates/congress-legislators', 'built': wm.today(), 'country': ['US'],
            'what': f'Membres du Congrès des États-Unis (Sénat, Chambre des représentants) nés en {limit} ou avant',
            'bioguide': 'https://bioguide.congress.gov/search/bio/{id}', 'states': states, 'parties': parties,
            'fields': ['n', 'b', 'st', 'ch', 'y1', 'y2', 'pa', 'bio', 'q', 'g'], 'rows': rows}
    size = wm.write_gz(OUT, 'tl-elus.json.gz', meta)
    print(f'tl-elus : {len(rows)} élus, {size} octets')


if __name__ == '__main__':
    main()
