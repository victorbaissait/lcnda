#!/usr/bin/env bash
# 🗺 Télécharger des extraits OpenStreetMap de Geofabrik (https://download.geofabrik.de/, ODbL 1.0, « © les contributeurs
# d'OpenStreetMap ») pour .github/workflows/osm-france.yml — une fois par version du fichier, et vérifiés par leur somme MD5.
#
#   geofabrik.sh md5 DOSSIER europe/france [europe/belgium …]   # les fichiers .md5 (petits) ; écrit sur la sortie « cle=… »
#                                                               # (une empreinte des .md5 : la clé du cache GitHub)
#   geofabrik.sh pbf DOSSIER europe/france [europe/belgium …]   # les .osm.pbf : gardés s'ils ont déjà la bonne somme, sinon
#                                                               # téléchargés (plusieurs essais) puis vérifiés
# Politesse : un seul téléchargement à la fois, pas de reprise en boucle rapide, User-Agent générique.
set -euo pipefail
mode=${1:?md5 ou pbf}; dir=${2:?dossier}; shift 2
[ $# -gt 0 ] || { echo "aucune région" >&2; exit 2; }
mkdir -p "$dir"
BASE=${GEOFABRIK_BASE:-https://download.geofabrik.de}   # autre adresse seulement pour les essais
UA='lcnda-osm-build/1.0 (GitHub Actions)'
dl() { curl -sS -fL --retry 5 --retry-delay 60 --retry-all-errors --connect-timeout 60 -A "$UA" -o "$2" "$1"; }

case "$mode" in
  md5)
    for r in "$@"; do
      f=$(basename "$r")-latest.osm.pbf
      dl "$BASE/$r-latest.osm.pbf.md5" "$dir/$f.md5"
      grep -Eq '^[0-9a-f]{32}  ' "$dir/$f.md5" || { echo "somme MD5 illisible : $dir/$f.md5" >&2; exit 1; }
      echo "$r : $(cat "$dir/$f.md5")" >&2
    done
    echo "cle=$(cat "$dir"/*.md5 | md5sum | cut -c1-16)"
    ;;
  pbf)
    for r in "$@"; do
      f=$(basename "$r")-latest.osm.pbf
      want=$(cut -d' ' -f1 "$dir/$f.md5")
      if [ -s "$dir/$f" ] && [ "$(md5sum "$dir/$f" | cut -d' ' -f1)" = "$want" ]; then
        echo "$f : déjà là (cache), somme MD5 juste"; continue
      fi
      rm -f "$dir/$f"
      ok=0
      for i in 1 2 3; do
        dl "$BASE/$r-latest.osm.pbf" "$dir/$f.part" || true
        if [ -s "$dir/$f.part" ] && [ "$(md5sum "$dir/$f.part" | cut -d' ' -f1)" = "$want" ]; then
          mv "$dir/$f.part" "$dir/$f"; ok=1; break
        fi
        # le fichier a pu changer entre la somme et le téléchargement (nouvelle version du jour) : relire la somme
        echo "$f : somme MD5 fausse (essai $i), on relit la somme dans 120 s" >&2
        rm -f "$dir/$f.part"; sleep 120
        dl "$BASE/$r-latest.osm.pbf.md5" "$dir/$f.md5"; want=$(cut -d' ' -f1 "$dir/$f.md5")
      done
      [ "$ok" = 1 ] || { echo "$f : pas de fichier juste après 3 essais" >&2; exit 1; }
      echo "$f : $(du -h "$dir/$f" | cut -f1), somme MD5 juste"
    done
    ;;
  *) echo "mode inconnu : $mode" >&2; exit 2 ;;
esac
