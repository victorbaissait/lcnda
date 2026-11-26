#!/usr/bin/env bash
# 🗺 Filtrer un extrait OpenStreetMap (Geofabrik) pour les lots B, E, F, G, H, sans Overpass — .github/workflows/osm-france.yml.
#
#   filtrer.sh EXTRAIT.osm.pbf DOSSIER b e f g h
#   VOISINS="belgium-latest.osm.pbf switzerland-latest.osm.pbf …" filtrer.sh …   # lot E : aussi Belgique, Suisse, Luxembourg
#
# Pour chaque lot : DOSSIER/<lot>.txt (expressions osmium tirées des filtres Overpass du script, scripts/osm-france/osm_local.py),
# puis DOSSIER/<lot>.opl (objets gardés ; les chemins portent la position de leurs nœuds), à donner au script par OSM_OPL.
# Un seul passage sur le gros extrait (toutes les expressions ensemble), puis un petit tri par lot.
set -euo pipefail
src=${1:?extrait .osm.pbf}; out=${2:?dossier}; shift 2
[ $# -gt 0 ] || { echo "aucun lot (b e f g h)" >&2; exit 2; }
here=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$out"
for lot in "$@"; do
  python3 -I "$here/osm_local.py" filtres "$lot" > "$out/$lot.txt"
  echo "lot $lot : $(wc -l < "$out/$lot.txt") expressions osmium"
done
for lot in "$@"; do cat "$out/$lot.txt"; done | sort -u > "$out/union.txt"
echo "· premier tri de $(basename "$src") ($(wc -l < "$out/union.txt") expressions)"
osmium tags-filter --overwrite --no-progress -e "$out/union.txt" -o "$out/union.osm.pbf" "$src"
ls -l "$out/union.osm.pbf"
for lot in "$@"; do
  osmium tags-filter --overwrite --no-progress -e "$out/$lot.txt" -o "$out/$lot.osm.pbf" "$out/union.osm.pbf"
  if [ "$lot" = e ] && [ -n "${VOISINS:-}" ]; then
    parts=("$out/e.osm.pbf"); i=0
    for v in $VOISINS; do
      i=$((i + 1))
      osmium tags-filter --overwrite --no-progress -e "$out/e.txt" -o "$out/e-voisin-$i.osm.pbf" "$v"
      parts+=("$out/e-voisin-$i.osm.pbf")
    done
    osmium merge --overwrite --no-progress -o "$out/e-tout.osm.pbf" "${parts[@]}"   # les objets en double (bords) : une fois
    mv "$out/e-tout.osm.pbf" "$out/e.osm.pbf"
  fi
  osmium add-locations-to-ways --overwrite --no-progress -f opl,add_metadata=false -o "$out/$lot.opl" "$out/$lot.osm.pbf"
  echo "lot $lot : $(grep -c . "$out/$lot.opl" || true) objets dans $out/$lot.opl ($(du -h "$out/$lot.opl" | cut -f1))"
done
