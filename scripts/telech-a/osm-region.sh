#!/usr/bin/env bash
# 🗺 Cartes OpenStreetMap hors ligne (lot A) : fabrique <sortie>/osm-<région>.mbtiles pour UNE région, lancé par
# .github/workflows/telech-a-osm.yml (jamais sur l'ordinateur de l'utilisateur ni dans l'atelier de développement).
#   osm-region.sh <région> <dossier de sortie> <dossier de tilemaker>
# Région : une région d'un extrait de Geofabrik, cherchée par son identifiant dans le sommaire officiel
# https://download.geofabrik.de/index-v1.json (ex. « bretagne », « basse-normandie », « belgium », « luxembourg »).
# Données : © les contributeurs d'OpenStreetMap, ODbL 1.0 (https://www.openstreetmap.org/copyright) ; mer : polygones d'eau
# d'osmdata.openstreetmap.de (tirés d'OpenStreetMap, ODbL). Tuiles : tilemaker, schéma OpenMapTiles (CC BY 4.0), zoom 0 à 14.
set -euo pipefail
region="$1"; out="$2"; tm="$3"
[[ "$region" =~ ^[a-z][a-z0-9-]{1,40}$ ]] || { echo "région refusée : $region"; exit 2; }
mkdir -p "$out" work
[ -s work/index-v1.json ] || curl -fsSL --retry 4 -o work/index-v1.json https://download.geofabrik.de/index-v1.json
url=$(python3 - "$region" <<'PY'
import json, sys
idx = json.load(open('work/index-v1.json'))
for f in idx['features']:
    p = f['properties']
    if p.get('id') == sys.argv[1] and p.get('urls', {}).get('pbf'):
        print(p['urls']['pbf']); break
PY
)
[ -n "$url" ] || { echo "région inconnue chez Geofabrik : $region"; exit 3; }
label=$(python3 -c "import json,sys; print(next(f['properties']['name'] for f in json.load(open('work/index-v1.json'))['features'] if f['properties'].get('id')==sys.argv[1]))" "$region")
echo "→ $region ($label) : $url"
curl -fsSL --retry 4 -o "work/$region.osm.pbf" "$url"
ls -l "work/$region.osm.pbf"
# la mer (sinon les côtes restent sans eau)
if [ ! -s coastline/water_polygons.shp ]; then
  curl -fsSL --retry 4 -o work/water.zip https://osmdata.openstreetmap.de/download/water-polygons-split-4326.zip
  mkdir -p coastline && unzip -oj work/water.zip -d coastline >/dev/null && rm work/water.zip
fi
# la configuration OpenMapTiles de tilemaker, sans les fichiers Natural Earth (seulement la mer en plus d'OSM)
jq '.settings.maxzoom = 14 | .settings.name = "LCNDA OSM" | .layers |= with_entries(select((.value.source == null) or ((.value.source|tostring)|test("coastline"))))' \
  "$tm/resources/config-openmaptiles.json" > work/config.json
rm -f "$out/osm-$region.mbtiles"
tilemaker --input "work/$region.osm.pbf" --output "$out/osm-$region.mbtiles" --config work/config.json --process "$tm/resources/process-openmaptiles.lua"
today=$(date -u +%F)
sqlite3 "$out/osm-$region.mbtiles" "INSERT OR REPLACE INTO metadata(name,value) VALUES('lcnda_built','$today'),('lcnda_label','$(printf %s "$label" | sed "s/'/''/g")'),('attribution','© les contributeurs d’OpenStreetMap (ODbL) · schéma OpenMapTiles (CC BY 4.0)');"
sqlite3 "$out/osm-$region.mbtiles" "SELECT name, value FROM metadata WHERE name IN ('format','bounds','minzoom','maxzoom','lcnda_built','lcnda_label')"
sqlite3 "$out/osm-$region.mbtiles" "VACUUM"
rm -f "work/$region.osm.pbf"
echo "$label" > "$out/osm-$region.label"
ls -l "$out/osm-$region.mbtiles"
