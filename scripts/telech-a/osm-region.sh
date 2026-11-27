#!/usr/bin/env bash
# 🗺 Cartes OpenStreetMap hors ligne (lot A) : fabrique <sortie>/osm-<région>.mbtiles pour UNE région, lancé par
# .github/workflows/telech-a-osm.yml (jamais sur l'ordinateur de l'utilisateur ni dans l'atelier de développement).
#   osm-region.sh <région> <dossier de sortie> <dossier de tilemaker>
# Région : une région d'un extrait de Geofabrik, cherchée par son identifiant dans le sommaire officiel
# https://download.geofabrik.de/index-v1.json (ex. « bretagne », « basse-normandie », « belgium », « luxembourg ») ;
# si Geofabrik ne répond pas, le même extrait chez OpenStreetMap France (download.openstreetmap.fr/extracts, ODbL 1.0).
# Données : © les contributeurs d'OpenStreetMap, ODbL 1.0 (https://www.openstreetmap.org/copyright) ; mer : polygones d'eau
# d'osmdata.openstreetmap.de (tirés d'OpenStreetMap, ODbL). Tuiles : tilemaker, schéma OpenMapTiles (CC BY 4.0), zoom 0 à 14.
set -euo pipefail
region="$1"; out="$2"; tm="$3"
[[ "$region" =~ ^[a-z][a-z0-9-]{1,40}$ ]] || { echo "région refusée : $region"; exit 2; }
mkdir -p "$out" work
UA='lcnda-osm-build/1.0 (GitHub Actions)'
# -4 : pas d'IPv6 sur la machine GitHub ; quelques essais espacés, pas de boucle rapide
petit() { curl -4 -fsSL --retry 3 --retry-delay 15 --retry-all-errors --connect-timeout 20 --max-time 120 -A "$UA" -o "$2" "$1"; }
gros()  { curl -4 -fsSL --retry 3 --retry-delay 60 --retry-all-errors --connect-timeout 30 --speed-limit 51200 --speed-time 120 -A "$UA" -o "$2" "$1"; }
# 1. Geofabrik (sommaire officiel) ; 2. sinon OpenStreetMap France (https://download.openstreetmap.fr/extracts/, mêmes données
#    OSM, ODbL 1.0), quand Geofabrik refuse la connexion depuis les machines GitHub (vu en novembre 2026).
url=""; label=""
if [ -s work/index-v1.json ] || petit https://download.geofabrik.de/index-v1.json work/index-v1.json; then
  trouve=$(python3 - "$region" <<'PY' || true
import json, sys
idx = json.load(open('work/index-v1.json'))
for f in idx['features']:
    p = f['properties']
    if p.get('id') == sys.argv[1] and p.get('urls', {}).get('pbf'):
        print(p['urls']['pbf'], p.get('name', sys.argv[1])); break
PY
  )
  if [ -n "$trouve" ]; then url=${trouve%% *}; label=${trouve#* }; fi
else
  rm -f work/index-v1.json
  echo "Geofabrik ne répond pas (sommaire index-v1.json) : on essaie OpenStreetMap France"
fi
# noms des anciennes régions françaises (ceux de Geofabrik), pour l'étiquette quand le sommaire manque
declare -A NOMS=([alsace]=Alsace [aquitaine]=Aquitaine [auvergne]=Auvergne [basse-normandie]='Basse-Normandie' [bourgogne]=Bourgogne
  [bretagne]=Bretagne [centre]=Centre [champagne-ardenne]='Champagne Ardenne' [corse]=Corse [franche-comte]='Franche Comte'
  [haute-normandie]='Haute-Normandie' [ile-de-france]='Ile-de-France' [languedoc-roussillon]='Languedoc-Roussillon'
  [limousin]=Limousin [lorraine]=Lorraine [midi-pyrenees]='Midi-Pyrenees' [nord-pas-de-calais]='Nord-Pas-de-Calais'
  [pays-de-la-loire]='Pays de la Loire' [picardie]=Picardie [poitou-charentes]='Poitou-Charentes'
  [provence-alpes-cote-d-azur]="Provence Alpes-Cote-d'Azur" [rhone-alpes]='Rhone-Alpes')
[ -n "$label" ] || label=${NOMS[$region]:-$region}
candidats=()
[ -z "$url" ] || candidats+=("$url")
u=${region//-/_}
# OpenStreetMap France : l'ancienne région est rangée soit à la racine de europe/france/, soit dans le dossier de la région
# d'aujourd'hui (depuis 2016) ; on lit les pages des dossiers (petites) pour ne demander que des fichiers qui existent
declare -A NOUV=([alsace]=grand_est [champagne-ardenne]=grand_est [lorraine]=grand_est [aquitaine]=nouvelle_aquitaine
  [limousin]=nouvelle_aquitaine [poitou-charentes]=nouvelle_aquitaine [auvergne]=auvergne_rhone_alpes [rhone-alpes]=auvergne_rhone_alpes
  [bourgogne]=bourgogne_franche_comte [franche-comte]=bourgogne_franche_comte [basse-normandie]=normandie [haute-normandie]=normandie
  [nord-pas-de-calais]=hauts_de_france [picardie]=hauts_de_france [languedoc-roussillon]=occitanie [midi-pyrenees]=occitanie)
OSMFR=https://download.openstreetmap.fr/extracts
if [ -n "${NOMS[$region]:-}" ]; then dossiers=("europe/france" ${NOUV[$region]:+"europe/france/${NOUV[$region]}"} "europe/france/$u")
else dossiers=("europe" "europe/france" "central-america" "south-america" "africa"); fi
for d in "${dossiers[@]}"; do
  if petit "$OSMFR/$d/" work/osmfr.html 2>/dev/null; then
    for f in "$u-latest.osm.pbf" "${region}-latest.osm.pbf"; do
      if grep -q "href=\"$f\"" work/osmfr.html; then candidats+=("$OSMFR/$d/$f"); break; fi
    done
    echo "  OpenStreetMap France, $d/ : $(grep -o 'href="[^"?]*"' work/osmfr.html | sed 's/href=//; s/"//g' | grep -v '^\.\./\?$' | head -40 | tr '\n' ' ')"
  fi
done
rm -f work/osmfr.html
ok=0
for c in "${candidats[@]}"; do
  echo "→ $region ($label) : $c"
  rm -f "work/$region.osm.pbf" work/somme.md5
  gros "$c" "work/$region.osm.pbf" || { echo "  téléchargement raté, source suivante"; continue; }
  if petit "$c.md5" work/somme.md5 && grep -Eq '^[0-9a-f]{32}' work/somme.md5; then
    [ "$(md5sum "work/$region.osm.pbf" | cut -d' ' -f1)" = "$(cut -c1-32 work/somme.md5)" ] \
      || { echo "  somme MD5 fausse, source suivante"; continue; }
    echo "  somme MD5 juste"
  else
    echo "  (pas de somme MD5 à cette adresse : fichier gardé tel quel)"
  fi
  ok=1; break
done
[ "$ok" = 1 ] || { echo "région introuvable ou injoignable (Geofabrik, OpenStreetMap France) : $region"; exit 3; }
ls -l "work/$region.osm.pbf"
# la mer (sinon les côtes restent sans eau)
if [ ! -s coastline/water_polygons.shp ]; then
  gros https://osmdata.openstreetmap.de/download/water-polygons-split-4326.zip work/water.zip
  mkdir -p coastline && unzip -oj work/water.zip -d coastline >/dev/null && rm work/water.zip
fi
# la configuration OpenMapTiles de tilemaker, sans les fichiers Natural Earth (seulement la mer en plus d'OSM)
jq '.settings.maxzoom = 14 | .settings.name = "LCNDA OSM" | .layers |= with_entries(select((.value.source == null) or ((.value.source|tostring)|test("coastline"))))' \
  "$tm/resources/config-openmaptiles.json" > work/config.json
rm -f "$out/osm-$region.mbtiles"
# les extraits d'OpenStreetMap France n'ont pas de cadre dans leur en-tête (« Can't read shapefiles unless a bounding box is
# provided ») : on le calcule sur les données avec osmium et on le donne à tilemaker
cadre=()
if ! osmium fileinfo -g header.boxes "work/$region.osm.pbf" 2>/dev/null | grep -q '('; then
  bb=$(osmium fileinfo -e -g data.bbox "work/$region.osm.pbf" | tr -d '() ')
  echo "  cadre calculé : $bb"; [ -n "$bb" ] && cadre=(--bbox "$bb")
fi
tilemaker --input "work/$region.osm.pbf" --output "$out/osm-$region.mbtiles" --config work/config.json --process "$tm/resources/process-openmaptiles.lua" "${cadre[@]}"
today=$(date -u +%F)
sqlite3 "$out/osm-$region.mbtiles" "INSERT OR REPLACE INTO metadata(name,value) VALUES('lcnda_built','$today'),('lcnda_label','$(printf %s "$label" | sed "s/'/''/g")'),('attribution','© les contributeurs d’OpenStreetMap (ODbL) · schéma OpenMapTiles (CC BY 4.0)');"
sqlite3 "$out/osm-$region.mbtiles" "SELECT name, value FROM metadata WHERE name IN ('format','bounds','minzoom','maxzoom','lcnda_built','lcnda_label')"
sqlite3 "$out/osm-$region.mbtiles" "VACUUM"
rm -f "work/$region.osm.pbf"
echo "$label" > "$out/osm-$region.label"
echo "$c" > "$out/osm-$region.source"
ls -l "$out/osm-$region.mbtiles"
