# LCNDA — lot J (🌍 Partir et nommer) : 🏺 tj-pleiades — les noms antiques des lieux (Pleiades, ISAW-NYU ; CC BY 3.0).
#   python3 -I scripts/telech-j/build_pleiades.py assets/data
# Source : le paquet « pleiades.datasets » (GitHub isawnyu, dossier data/gis : names.csv, places.csv, places_place_types.csv).
# Le script relit README.md et LICENSE du paquet et S'ARRÊTE s'ils ne disent plus « Creative Commons Attribution ».
# Une ligne par nom : le nom (forme romanisée), le lieu Pleiades qui le porte, les années (avant/après lesquelles il est attesté),
# la position représentative du lieu (les lieux sans position sont laissés).
import csv, io, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm  # noqa: E402

OUT = sys.argv[1] if len(sys.argv) > 1 else 'assets/data'
RAW = 'https://raw.githubusercontent.com/isawnyu/pleiades.datasets/main/'
# les sortes de lieux qu'on garde (des lieux habités ou nommés ; pas les tombes ni les inscriptions)
KEEP = {'settlement', 'urban', 'village', 'settlement-modern', 'fort', 'port', 'station', 'region', 'people', 'province', 'island', 'river',
        'mountain', 'bay', 'cape', 'lake', 'estate', 'sanctuary', 'temple', 'bridge', 'mine', 'spring', 'pass', 'plain', 'forest', 'valley',
        'civitas', 'colonia', 'municipium', 'oppidum', 'vicus', 'villa', 'mansio', 'mutatio', 'castellum', 'castrum', 'polis', 'unknown', 'unlocated'}


def table(name):
    body = wm.get(RAW + 'data/gis/' + name, 'text/csv').decode('utf-8-sig', 'replace')
    return list(csv.DictReader(io.StringIO(body)))


def yr(v):
    v = (v or '').strip()
    return int(v) if re.match(r'^-?\d{1,4}$', v) else None


def main():
    readme = wm.get(RAW + 'README.md', 'text/plain').decode('utf-8', 'replace')
    lic = wm.get(RAW + 'LICENSE', 'text/plain').decode('utf-8', 'replace')
    if 'Creative Commons Attribution' not in readme or 'Attribution 3.0' not in lic:
        sys.exit('Pleiades : la licence a changé (README.md / LICENSE) — relire avant de recopier')
    ver = (re.search(r'## Version ([\d.]+) - ([^\n]+)', readme) or [None, '', ''])
    places = {p['id']: p for p in table('places.csv')}
    kinds = {}
    for r in table('places_place_types.csv'):
        kinds.setdefault(r.get('place_id') or r.get('id'), []).append(r.get('place_type') or r.get('key') or '')
    rows, seen = [], set()
    for n in table('names.csv'):
        p = places.get(n['place_id'])
        if not p:
            continue
        try:
            la, lo = round(float(p['representative_latitude']), 4), round(float(p['representative_longitude']), 4)
        except Exception:  # noqa
            continue
        ks = [k for k in kinds.get(n['place_id'], []) if k]
        if ks and not any(k in KEEP for k in ks):
            continue
        name = (n['romanized_form_1'] or n['title'] or '').strip()
        if not name or len(name) > 80 or (n['place_id'], name) in seen:
            continue
        seen.add((n['place_id'], name))
        a, b = yr(n['year_after_which']), yr(n['year_before_which'])
        rows.append([int(n['place_id']), name, p['title'][:90], a, b, la, lo, (ks[0] if ks else '')[:20], 1 if p.get('location_precision') == 'rough' else 0,
                     (n.get('language_tag') or '')[:12]])
    rows.sort(key=lambda r: (r[0], r[1]))
    meta = {'v': 1, 'source': 'Pleiades (ISAW, New York University)', 'url': 'https://pleiades.stoa.org/', 'licence': 'CC BY 3.0',
            'licence_url': 'https://creativecommons.org/licenses/by/3.0/', 'licence_read': RAW + 'LICENSE',
            'credit': 'Pleiades : a community-built gazetteer and graph of ancient places — contributeurs de Pleiades (data/rdf/authors.ttl) ; '
                      f'paquet pleiades.datasets {ver[1]} ({ver[2]}), https://github.com/isawnyu/pleiades.datasets',
            'built': wm.today(), 'item_url': 'https://pleiades.stoa.org/places/{id}',
            'what': 'Noms antiques (forme romanisée) des lieux de Pleiades, avec les années entre lesquelles le nom est attesté et la position du lieu',
            'fields': ['id', 'name', 'place', 'from', 'to', 'lat', 'lon', 'kind', 'rough', 'lang'], 'rows': rows}
    size = wm.write_gz(OUT, 'tj-pleiades.json.gz', meta)
    print(f'tj-pleiades : {len(rows)} noms, {len({r[0] for r in rows})} lieux, {size} octets')


if __name__ == '__main__':
    main()
