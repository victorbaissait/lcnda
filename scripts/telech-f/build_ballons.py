#!/usr/bin/env python3
"""🎈 Lot F — Les ballons montés du siège de Paris, 1870-1871 (assets/data/tf-ballons.json.gz).

Source : l'article « Ballon monté » de Wikipédia en français (tableau « Liste des ballons montés », d'après J. Le Pileur et
G. L'Héritier), licence CC BY-SA 4.0 (les contributeurs de Wikipédia) ; le lieu d'arrivée (lien de l'article) est placé grâce à
Wikidata (CC0 : position P625, code INSEE P374). Gardé pour chaque ballon : numéro, date de départ, nom, lieu de départ, lieu
d'arrivée (texte et article), distance, ce qu'il emportait (colonne « Fret »). Les noms des pilotes et passagers ne sont pas copiés.
Lu avec action=raw (le texte de la page, une requête), pas de récupération de pages web.

Lancer : python3 -I scripts/telech-f/build_ballons.py [dossier de sortie]   (TF_RAW = cache des réponses)
"""
import os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'assets', 'data')
ARTICLE = 'Ballon monté'
MONTHS = {'janvier': 1, 'février': 2, 'mars': 3, 'avril': 4, 'mai': 5, 'juin': 6, 'juillet': 7, 'août': 8, 'septembre': 9, 'octobre': 10, 'novembre': 11, 'décembre': 12}


def iso(txt):
    m = re.search(r'(\d{1,2})(?:er)?\s+([a-zéû]+)\s+(18\d\d)', txt)
    return f'{m.group(3)}-{MONTHS.get(m.group(2), 0):02d}-{int(m.group(1)):02d}' if m and m.group(2) in MONTHS else ''


def cells(row):
    row = re.sub(r'^\s*\|\s*bgcolor="[^"]*"\s*\|', '|', row.strip())
    return [c.strip() for c in row.lstrip('|').split('||')]


def main():
    w = wm.wp_raw(ARTICLE)
    tab = w[w.index('== Liste des ballons montés =='):]
    tab = tab[tab.index('{|'):tab.index('\n|}')]
    rows = []
    for chunk in tab.split('\n|-')[2:]:
        line = ' '.join(l for l in chunk.split('\n')[1:] if l.strip())
        c = cells(line)
        if len(c) < 11:
            continue
        num, date, name, _vol, _cons, _pil, _pas, dep, arr, dist, fret = c[:11]
        n = wm.plain(num).strip()
        land_links = wm.links(arr)
        land = wm.plain(arr)
        km = re.search(r'(\d+)', wm.plain(dist))
        rows.append({'num': int(n) if n.isdigit() else None, 'date': iso(wm.plain(date)), 'n': wm.plain(name), 'from': wm.plain(dep), 'to': land,
                     'to_wp': land_links[0] if land_links else '', 'km': int(km.group(1)) if km else None, 'fret': wm.plain(fret)[:240]})
    geo = wm.wd_of_titles([r['to_wp'] for r in rows])
    for r in rows:
        g = geo.get(r['to_wp']) or {}
        r.update({'q': g.get('q', ''), 'lat': g.get('lat'), 'lon': g.get('lon'), 'insee': g.get('insee', '')})
    assert len(rows) >= 60, f'{len(rows)} ballons seulement : le tableau a changé ?'
    fields = ['num', 'date', 'n', 'from', 'to', 'to_wp', 'q', 'insee', 'lat', 'lon', 'km', 'fret']
    meta = {'source': 'Wikipédia — « Ballon monté » (liste des ballons montés, d’après J. Le Pileur et G. L’Héritier) ; Wikidata', 'licence': 'CC BY-SA 4.0 (les contributeurs de Wikipédia) ; CC0 (Wikidata)',
            'licence_url': 'https://creativecommons.org/licenses/by-sa/4.0/deed.fr', 'url': wm.wp_url(ARTICLE), 'history': wm.wp_url(ARTICLE).replace('/wiki/', '/w/index.php?title=') + '&action=history',
            'built': wm.today(), 'what': 'Les 67 ballons partis de Paris assiégé (septembre 1870 – janvier 1871) : date, lieu d’arrivée placé sur la carte, ce qu’ils emportaient',
            'fields': fields, 'rows': [[r[k] for k in fields] for r in rows]}
    size = wm.write_gz(OUT, 'tf-ballons.json.gz', meta)
    print(f'tf-ballons : {len(rows)} ballons, {sum(1 for r in rows if r["lat"] is not None)} placés, {size} octets')


if __name__ == '__main__':
    main()
