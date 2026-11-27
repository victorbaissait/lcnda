#!/usr/bin/env python3
"""📡 ⛴ Lot O8 — OpenStreetMap (ODbL 1.0) : assets/data/lo-chappe.json.gz et lo-bacs.json.gz. Fabriqué SUR GITHUB seulement
(.github/workflows/telech-o.yml) : Overpass et openstreetmap.org sont refusés par le réseau de l'atelier.

  chappe  📡 les stations du télégraphe Chappe (1794-1855) : historic=optical_telegraph, et les tours dont le nom dit « Chappe »
          ou « télégraphe » avec une étiquette historic=* ; nom, position, commune (addr:city / is_in), wikidata, wikipedia.
  bacs    ⛴ les bacs et passeurs : les traversées route=ferry de moins de 3 km sur les rivières et fleuves de France, et les
          anciens bacs (historic=* dont le nom commence par « Bac » ou « Ancien bac ») ; nom, position (le milieu), rivière quand dite.
Licence : la page https://www.openstreetmap.org/copyright est relue à chaque fabrication et doit citer l'« Open Data Commons Open
Database License » ; sinon rien n'est fabriqué. Attribution gardée dans le pack : « © les contributeurs d'OpenStreetMap ».
Requêtes polies (scripts/telech-l/wm.py) : une à la fois, 10 s entre deux, réponses gardées.

Lancer : python3 -I scripts/lot-o/build_osm.py [dossier de sortie] [chappe bacs]
"""
import datetime, json, math, os, re, sys, urllib.parse
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, 'scripts', 'telech-l'))
import wm  # noqa: E402

args = sys.argv[1:]
OUT = args[0] if args and not re.match(r'^[a-z]+$', args[0]) else os.path.join(ROOT, 'assets', 'data')
WANT = [a for a in args if re.match(r'^[a-z]+$', a)] or ['chappe', 'bacs']
TODAY = datetime.date.today().isoformat()
OSM = {'source': 'OpenStreetMap (© les contributeurs d’OpenStreetMap)', 'licence': 'ODbL 1.0', 'licence_url': 'https://www.openstreetmap.org/copyright', 'url': 'https://www.openstreetmap.org/copyright'}
AREA = 'area["ISO3166-1"="FR"][admin_level=2]->.fr;'


def licence():
    page = wm.get('https://www.openstreetmap.org/copyright', 'text/html').decode('utf-8', 'replace')
    if 'Open Data Commons Open Database License' not in page:
        sys.exit('openstreetmap.org/copyright ne cite plus l’ODbL : rien fabriqué')


def overpass(body):
    q = f'[out:json][timeout:900];{AREA}({body});out center tags;'
    return json.loads(wm.get('https://overpass-api.de/api/interpreter', 'application/json', urllib.parse.urlencode({'data': q}), check=json.loads))['elements']


def pt(e):
    c = e.get('center') or e
    return (round(c['lat'], 5), round(c['lon'], 5)) if 'lat' in c else (None, None)


def chappe():
    els = overpass('nwr["historic"="optical_telegraph"](area.fr);nwr["historic"]["name"~"Chappe|[Tt]élégraphe",i](area.fr);nwr["man_made"="tower"]["name"~"Chappe",i](area.fr);')
    rows = {}
    for e in els:
        lat, lon = pt(e); t = e.get('tags', {})
        if lat is None:
            continue
        k = f"{e['type'][0]}{e['id']}"
        rows[k] = [k, (t.get('name') or 'Télégraphe Chappe')[:100], lat, lon, (t.get('addr:city') or t.get('is_in') or '')[:80], t.get('wikidata', ''), t.get('wikipedia', '')[:120], t.get('start_date', '')[:10]]
    return {'v': 1, 'built': TODAY, 'title': 'Stations du télégraphe Chappe', **OSM, 'licence_read': TODAY, 'fields': ['id', 'name', 'lat', 'lon', 'city', 'wikidata', 'wikipedia', 'start'], 'rows': sorted(rows.values(), key=lambda r: r[1])}


def length_km(e):
    g = e.get('geometry') or []
    return sum(6371 * 2 * math.asin(math.sqrt(math.sin(math.radians(b['lat'] - a['lat']) / 2) ** 2 + math.cos(math.radians(a['lat'])) * math.cos(math.radians(b['lat'])) * math.sin(math.radians(b['lon'] - a['lon']) / 2) ** 2)) for a, b in zip(g, g[1:]))


def bacs():
    q = f'[out:json][timeout:900];{AREA}(way["route"="ferry"](area.fr););out geom tags;'
    ways = json.loads(wm.get('https://overpass-api.de/api/interpreter', 'application/json', urllib.parse.urlencode({'data': q}), check=json.loads))['elements']
    rows = {}
    for e in ways:
        t = e.get('tags', {}); g = e.get('geometry') or []
        if not g or length_km(e) > 3:
            continue  # les liaisons de mer (îles, Corse) ne sont pas des bacs de rivière
        m = g[len(g) // 2]; k = f"w{e['id']}"
        rows[k] = [k, (t.get('name') or 'Bac')[:100], round(m['lat'], 5), round(m['lon'], 5), (t.get('waterway:name') or t.get('river') or '')[:60], 'actuel', t.get('wikidata', '')]
    for e in overpass('nwr["historic"]["name"~"^(Ancien )?[Bb]ac( |$)"](area.fr);'):
        lat, lon = pt(e); t = e.get('tags', {})
        if lat is None:
            continue
        k = f"{e['type'][0]}{e['id']}"
        rows[k] = [k, t.get('name', '')[:100], lat, lon, (t.get('waterway:name') or '')[:60], 'ancien', t.get('wikidata', '')]
    return {'v': 1, 'built': TODAY, 'title': 'Bacs et passeurs', **OSM, 'licence_read': TODAY, 'fields': ['id', 'name', 'lat', 'lon', 'river', 'kind', 'wikidata'], 'rows': sorted(rows.values(), key=lambda r: r[1])}


def main():
    licence()
    for w in WANT:
        meta = {'chappe': chappe, 'bacs': bacs}[w]()
        if not meta['rows']:
            print(f'{w} : aucune ligne, fichier gardé tel quel')
            continue
        print(f'lo-{w}.json.gz : {len(meta["rows"])} lignes, {wm.write_gz(OUT, f"lo-{w}.json.gz", meta)} octets')


if __name__ == '__main__':
    main()
