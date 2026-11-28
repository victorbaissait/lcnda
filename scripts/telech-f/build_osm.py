#!/usr/bin/env python3
"""🗺 Lot F — Les mêmes sujets depuis OpenStreetMap (ODbL 1.0, « © les contributeurs d'OpenStreetMap ») : fabriqué SUR GITHUB
(.github/workflows/osm-france.yml : extrait
Geofabrik de la France filtré par osmium, lu par scripts/osm-france/osm_local.py quand OSM_OPL donne le fichier OPL ; à défaut,
.github/workflows/telech-f.yml, quoi = osm, questionne Overpass — injoignable depuis l'atelier de développement, souvent en panne).
 - tf-osm-cocher  : plaques de cocher et bornes ou panneaux Michelin. Il n'y a pas de clé OSM propre à ces objets : on cherche les
                    objets « historic=* », « tourism=information » ou « man_made=* » dont le nom, l'inscription, la description, la note ou
                    l'opérateur dit « cocher » ou « Michelin » (le nombre trouvé par chaque question est écrit dans le journal) ;
 - tf-osm-forges  : historic=forge|blast_furnace|furnace|ironworks|smithy, historic=industrial + industrial=forge|ironworks|foundry|
                    blast_furnace, ruins=blast_furnace, et les noms « Forge(s)… », « Haut(-)fourneau… » ;
 - tf-osm-salines : landuse=salt_pond, industrial=salt_works|saline, man_made=works + product=salt, historic=salt_works et les noms
                    « Saline(s)… », « Marais salant(s)… ».
Rien n'est gardé au-delà de 15 Mo par fichier. Lancer : python3 -I scripts/telech-f/build_osm.py [dossier de sortie] [sujet…]
        OSM_OPL=…/f.opl python3 -I scripts/telech-f/build_osm.py …   (sans Overpass)
"""
import json, os, sys, time, urllib.parse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'assets', 'data')
ONLY = set(sys.argv[2:])
OVERPASS = os.environ.get('TF_OVERPASS') or 'https://overpass-api.de/api/interpreter'
TXT = '"[Cc]ocher|[Mm]ichelin"'
Q = {
    'cocher': [('cocher', f'nwr["historic"]["{k}"~{TXT}]') for k in ('name', 'inscription', 'description', 'note', 'operator')]
              + [('cocher', f'nwr["tourism"="information"]["{k}"~{TXT}]') for k in ('name', 'inscription', 'description', 'operator')]
              + [('cocher', f'nwr["man_made"]["{k}"~{TXT}]') for k in ('name', 'inscription', 'operator')],
    'forges': [('forge', 'nwr["historic"~"^(forge|smithy)$"]'), ('haut-fourneau', 'nwr["historic"~"^(blast_furnace|furnace)$"]'), ('forge', 'nwr["historic"="ironworks"]'),
               ('forge', 'nwr["historic"="industrial"]["industrial"~"^(forge|ironworks|foundry|blast_furnace)$"]'), ('haut-fourneau', 'nwr["ruins"="blast_furnace"]'),
               ('forge', 'nwr["historic"]["name"~"^(Forges?|Ancienne forge|Anciennes forges) "]'), ('haut-fourneau', 'nwr["name"~"^[Hh]aut[- ]fourneau"]')],
    'salines': [('marais salant', 'nwr["landuse"="salt_pond"]'), ('saline', 'nwr["industrial"~"^(salt_works|saline)$"]'), ('saline', 'nwr["man_made"="works"]["product"~"salt"]'),
                ('saline', 'nwr["historic"="salt_works"]'), ('saline', 'nwr["name"~"^(Salines?|Saline royale|Ancienne saline) "]'), ('marais salant', 'nwr["name"~"^[Mm]arais salants?"]')],
}


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
                if name == 'salines' and kind == 'marais salant' and not t.get('name') and len(rows) > 20000:
                    continue
                seen.add(key)
                txt = ' '.join(t.get(k, '') for k in ('name', 'inscription', 'description', 'operator')).lower()
                k2 = 'michelin' if (name == 'cocher' and 'michelin' in txt) else kind
                y = next((int(t[k][:4]) for k in ('start_date', 'construction_date') if t.get(k, '')[:4].isdigit()), None)
                rows.append([key, (t.get('name') or '')[:120], k2, round(lat, 5), round(lon, 5), y, (t.get('inscription') or '')[:200]])
            if not OPL:
                time.sleep(10)  # politesse envers Overpass
        meta = {'source': 'OpenStreetMap', 'licence': 'ODbL 1.0 — © les contributeurs d’OpenStreetMap', 'licence_url': 'https://www.openstreetmap.org/copyright', 'url': 'https://www.openstreetmap.org',
                'built': wm.today(), 'what': {'cocher': 'Plaques de cocher et bornes Michelin (OpenStreetMap)', 'forges': 'Forges et hauts fourneaux anciens (OpenStreetMap)', 'salines': 'Salines et marais salants (OpenStreetMap)'}[name],
                'queries': [s for _, s in qs], 'fields': ['osm', 'n', 'k', 'lat', 'lon', 'from', 'inscription'], 'rows': rows}
        size = wm.write_gz(OUT, f'tf-osm-{name}.json.gz', meta)
        if size > 15e6:
            os.remove(os.path.join(OUT, f'tf-osm-{name}.json.gz'))
            print(f'tf-osm-{name} : trop gros ({size} octets), pas gardé')
        else:
            print(f'tf-osm-{name} : {len(rows)} objets, {size} octets')


if __name__ == '__main__':
    main()
