#!/usr/bin/env python3
"""🗺 Lot G — Les mêmes lieux depuis OpenStreetMap (ODbL 1.0, « © les contributeurs d'OpenStreetMap ») : fabriqué SUR GITHUB
(.github/workflows/osm-france.yml : extrait
Geofabrik de la France filtré par osmium, lu par scripts/osm-france/osm_local.py quand OSM_OPL donne le fichier OPL ; à défaut,
.github/workflows/telech-g.yml, quoi = osm, questionne Overpass — injoignable depuis l'atelier de développement, souvent en panne).
 - tg-osm-forts      : historic=fort (France), les objets dont le nom ou l'opérateur dit « Maginot » ou « Séré de Rivières »,
                       military=bunker|casemate dont le nom dit « Maginot » (k = fort, maginot, sdr) ;
 - tg-osm-poudres    : les objets « historic=* », « building=* », « ruins=* » ou « man_made=* » dont le nom dit « poudrière » ou
                       « poudrerie », et military=ammunition (sur un objet historic) ;
 - tg-osm-semaphores : man_made=tower|lighthouse + tower:type=communication|observation, et les objets dont le nom commence par
                       « Sémaphore » ;
 - tg-osm-lazarets   : les objets dont le nom dit « lazaret » ou « quarantaine » (historic, building, place, amenity) ;
 - tg-osm-wallace    : amenity=drinking_water|fountain dont le nom, le modèle (model, design) ou la marque (brand) dit « Wallace ».
Le nombre trouvé par chaque question est écrit dans le journal. Rien n'est gardé au-delà de 15 Mo par fichier.
Lancer : python3 -I scripts/telech-g/build_osm.py [dossier de sortie] [sujet…]
        OSM_OPL=…/g.opl python3 -I scripts/telech-g/build_osm.py …   (sans Overpass)
"""
import json, os, sys, time, urllib.parse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'assets', 'data')
ONLY = set(sys.argv[2:])
OVERPASS = os.environ.get('TG_OVERPASS') or 'https://overpass-api.de/api/interpreter'
Q = {
    'forts': [('fort', 'nwr["historic"="fort"]'), ('maginot', 'nwr["name"~"Maginot"]'), ('maginot', 'nwr["operator"~"Maginot"]'),
              ('maginot', 'nwr["military"~"^(bunker|casemate)$"]["name"~"[Cc]asemate|[Oo]uvrage|Maginot"]'), ('sdr', 'nwr["name"~"S[ée]r[ée] de Rivi[èe]res"]'),
              ('sdr', 'nwr["description"~"S[ée]r[ée] de Rivi[èe]res"]')],
    'poudres': [('poudriere', f'nwr["{k}"]["name"~"[Pp]oudri[èe]re"]') for k in ('historic', 'building', 'ruins', 'man_made')]
               + [('poudrerie', f'nwr["{k}"]["name"~"[Pp]oudrerie"]') for k in ('historic', 'building', 'ruins', 'man_made', 'landuse')]
               + [('poudriere', 'nwr["historic"]["military"="ammunition"]')],
    'semaphores': [('semaphore', 'nwr["name"~"^[Ss][ée]maphore"]'), ('semaphore', 'nwr["man_made"="tower"]["tower:type"="communication"]["name"~"[Ss][ée]maphore"]')],
    'lazarets': [('lazaret', f'nwr["{k}"]["name"~"[Ll]azaret"]') for k in ('historic', 'building', 'place', 'amenity', 'tourism', 'man_made')]
                + [('lazaret', 'nwr["historic"]["name"~"[Qq]uarantaine"]')],
    'wallace': [('wallace', f'nwr["amenity"~"^(drinking_water|fountain)$"]["{k}"~"[Ww]allace"]') for k in ('name', 'model', 'design', 'brand', 'description')],
}
WHAT = {'forts': 'Forts, ouvrages Maginot et Séré de Rivières (OpenStreetMap)', 'poudres': 'Poudrières et poudreries (OpenStreetMap)',
        'semaphores': 'Sémaphores (OpenStreetMap)', 'lazarets': 'Lazarets et lieux de quarantaine (OpenStreetMap)', 'wallace': 'Fontaines Wallace (OpenStreetMap)'}


OPL = os.environ.get('OSM_OPL')  # extrait Geofabrik filtré par osmium (.github/workflows/osm-france.yml) : plus d'Overpass
if OPL:
    sys.path.insert(0, os.path.join(ROOT, 'scripts', 'osm-france'))
    import osm_local


def run(sel):
    if OPL:
        return osm_local.select(OPL, sel)
    q = f'[out:json][timeout:900];area["ISO3166-1"="FR"][admin_level=2]->.fr;({sel}(area.fr););out center tags;'
    return json.loads(wm.get(OVERPASS, 'application/json', urllib.parse.urlencode({'data': q})))['elements']


def main():
    for name, qs in Q.items():
        if ONLY and name not in ONLY:
            continue
        seen, rows = set(), []
        for kind, sel in qs:
            els = run(sel)
            print(f'  {name} · {sel} → {len(els)}')
            for e in els:
                key = e['type'][0] + str(e['id'])
                if key in seen:
                    continue
                lat = e.get('lat', e.get('center', {}).get('lat')); lon = e.get('lon', e.get('center', {}).get('lon'))
                if lat is None:
                    continue
                t = e.get('tags', {})
                if name == 'forts' and kind == 'fort' and not t.get('name'):
                    continue
                seen.add(key)
                y = next((int(t[k][:4]) for k in ('start_date', 'construction_date') if t.get(k, '')[:4].isdigit()), None)
                rows.append([key, (t.get('name') or '')[:120], kind, round(lat, 5), round(lon, 5), y])
            if not OPL:
                time.sleep(10)  # politesse envers Overpass
        meta = {'source': 'OpenStreetMap', 'licence': 'ODbL 1.0 — © les contributeurs d’OpenStreetMap', 'licence_url': 'https://www.openstreetmap.org/copyright', 'url': 'https://www.openstreetmap.org',
                'built': wm.today(), 'what': WHAT[name], 'queries': [s for _, s in qs], 'fields': ['osm', 'n', 'k', 'lat', 'lon', 'from'], 'rows': rows}
        size = wm.write_gz(OUT, f'tg-osm-{name}.json.gz', meta)
        if size > 15e6:
            os.remove(os.path.join(OUT, f'tg-osm-{name}.json.gz'))
            print(f'tg-osm-{name} : trop gros ({size} octets), pas gardé')
        else:
            print(f'tg-osm-{name} : {len(rows)} objets, {size} octets')


if __name__ == '__main__':
    main()
