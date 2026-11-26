#!/usr/bin/env python3
"""🗺 Lot H — Les mêmes sujets depuis OpenStreetMap (ODbL 1.0, « © les contributeurs d'OpenStreetMap ») : fabriqué SUR GITHUB
(.github/workflows/telech-h.yml, quoi = osm) ; Overpass n'est pas joignable depuis l'atelier de développement. France seulement.
 - th-osm-kiosques    : leisure=bandstand, amenity=bandstand, et les kiosques dont le nom dit « musique » ;
 - th-osm-halles      : amenity=marketplace bâti ou couvert (building=*, covered=yes), bâtiments nommés « Halle(s)… », « Marché couvert… » ;
 - th-osm-eclusieres  : bâtiments nommés « Maison éclusière », « Maison de l'éclusier », et les « Gare d'eau » ;
 - th-osm-traces      : voies ferrées et de tramway disparues — railway=abandoned|disused|razed et abandoned:railway=*,
                        razed:railway=*, disused:railway=* — tracés SIMPLIFIÉS (Douglas-Peucker, ~150 m ; 4 décimales) pour rester petits.
Rien n'est gardé au-delà de 15 Mo par fichier. Lancer : python3 -I scripts/telech-h/build_osm.py [dossier de sortie] [sujet…]
"""
import json, math, os, re, sys, time, urllib.parse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'assets', 'data')
ONLY = set(sys.argv[2:])
OVERPASS = os.environ.get('TH_OVERPASS') or 'https://overpass-api.de/api/interpreter'
Q = {
    'kiosques': [('kiosque', 'nwr["leisure"="bandstand"]'), ('kiosque', 'nwr["amenity"="bandstand"]'), ('kiosque', 'nwr["name"~"[Kk]iosque [àa] musique"]')],
    'halles': [('halle', 'nwr["amenity"="marketplace"]["building"]'), ('halle', 'nwr["amenity"="marketplace"]["covered"="yes"]'),
               ('halle', 'nwr["building"]["name"~"^(Halles?|Ancienne halle|Vieille halle|Marché couvert)( |$)"]'), ('halle', 'nwr["historic"]["name"~"^(Halles?|Marché couvert)( |$)"]')],
    'eclusieres': [('maison', 'nwr["building"]["name"~"[Mm]aison ([ée]clusi[èe]re|de l.[ée]clusier|d.[ée]clusier)"]'), ('maison', 'nwr["historic"]["name"~"[Mm]aison ([ée]clusi|de l.[ée]clusier)"]'),
                   ('gare', 'nwr["name"~"^[Gg]are d.[Ee]au"]')],
    'traces': [('ligne', 'way["railway"~"^(abandoned|disused|razed)$"]'), ('ligne', 'way["abandoned:railway"]'), ('ligne', 'way["razed:railway"]'), ('ligne', 'way["disused:railway"]')],
}
WHAT = {'kiosques': 'Kiosques à musique (OpenStreetMap)', 'halles': 'Halles et marchés couverts (OpenStreetMap)', 'eclusieres': 'Maisons éclusières et gares d’eau (OpenStreetMap)',
        'traces': 'Voies ferrées et de tramway disparues, tracés simplifiés (OpenStreetMap)'}


def run(sel, geom=False):
    q = f'[out:json][timeout:1200][maxsize:2000000000];area["ISO3166-1"="FR"][admin_level=2]->.fr;({sel}(area.fr););out {"geom" if geom else "center"} tags;'
    return json.loads(wm.get(OVERPASS, 'application/json', urllib.parse.urlencode({'data': q})))['elements']


def dp(pts, eps):
    """Douglas-Peucker (degrés)"""
    if len(pts) < 3:
        return pts
    (x1, y1), (x2, y2) = pts[0], pts[-1]
    dx, dy = x2 - x1, y2 - y1
    n = math.hypot(dx, dy) or 1e-12
    i, dmax = 0, -1
    for k in range(1, len(pts) - 1):
        x, y = pts[k]
        d = abs(dy * x - dx * y + x2 * y1 - y2 * x1) / n if (dx or dy) else math.hypot(x - x1, y - y1)
        if d > dmax:
            i, dmax = k, d
    if dmax <= eps:
        return [pts[0], pts[-1]]
    return dp(pts[:i + 1], eps)[:-1] + dp(pts[i:], eps)


def year(t, *keys):
    for k in keys:
        m = re.search(r'(1[6-9]\d\d|20\d\d)', t.get(k, '') or '')
        if m:
            return int(m.group(1))
    return None


def main():
    for name, qs in Q.items():
        if ONLY and name not in ONLY:
            continue
        seen, rows = set(), []
        for kind, sel in qs:
            els = run(sel, geom=(name == 'traces'))
            print(f'  {name} · {sel} → {len(els)}')
            for e in els:
                key = e['type'][0] + str(e['id'])
                if key in seen:
                    continue
                t = e.get('tags', {})
                if name == 'traces':
                    g = [(round(p['lon'], 5), round(p['lat'], 5)) for p in e.get('geometry') or [] if p]
                    if len(g) < 2:
                        continue
                    length = sum(math.hypot((g[i + 1][0] - g[i][0]) * math.cos(math.radians(g[i][1])), g[i + 1][1] - g[i][1]) for i in range(len(g) - 1)) * 111
                    nm = (t.get('name') or t.get('old_name') or t.get('abandoned:name') or '')[:100]
                    if length < 0.3 and not nm:
                        continue
                    s = dp(g, 0.0014)
                    seen.add(key)
                    flat = [round(v, 4) for p in s for v in p]
                    st = t.get('railway') or ('abandoned' if 'abandoned:railway' in t else 'razed' if 'razed:railway' in t else 'disused')
                    rows.append([key, nm, st, year(t, 'start_date', 'opening_date'), year(t, 'end_date', 'abandoned:date', 'closing_date', 'razed:date'), round(length, 2), flat])
                    continue
                lat = e.get('lat', e.get('center', {}).get('lat')); lon = e.get('lon', e.get('center', {}).get('lon'))
                if lat is None:
                    continue
                seen.add(key)
                k2 = 'gare' if re.match(r'(?i)gare d.eau', t.get('name', '')) else kind
                rows.append([key, (t.get('name') or '')[:120], k2, round(lat, 5), round(lon, 5), year(t, 'start_date', 'construction_date'), None])
            time.sleep(10)
        fields = ['osm', 'n', 'k', 'from', 'to', 'km', 'line'] if name == 'traces' else ['osm', 'n', 'k', 'lat', 'lon', 'from', 'to']
        meta = {'source': 'OpenStreetMap', 'licence': 'ODbL 1.0 — © les contributeurs d’OpenStreetMap', 'licence_url': 'https://www.openstreetmap.org/copyright', 'url': 'https://www.openstreetmap.org',
                'built': wm.today(), 'what': WHAT[name], 'queries': [s for _, s in qs], 'fields': fields, 'rows': rows}
        size = wm.write_gz(OUT, f'th-osm-{name}.json.gz', meta)
        if size > 15e6:
            os.remove(os.path.join(OUT, f'th-osm-{name}.json.gz'))
            print(f'th-osm-{name} : trop gros ({size} octets), pas gardé')
        else:
            print(f'th-osm-{name} : {len(rows)} objets, {size} octets')


if __name__ == '__main__':
    main()
