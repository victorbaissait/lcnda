#!/usr/bin/env bash
# 🗺 Télécharger des extraits OpenStreetMap (ODbL 1.0, « © les contributeurs d'OpenStreetMap ») pour
# .github/workflows/osm-france.yml — une fois par version du fichier, et vérifiés par leur somme MD5.
#
#   geofabrik.sh md5 DOSSIER europe/france [europe/belgium …]   # les fichiers .md5 (petits) ; écrit sur la sortie « cle=… »
#                                                               # (une empreinte des .md5 : la clé du cache GitHub) et
#                                                               # « source=… » (l'adresse qui a répondu)
#   geofabrik.sh pbf DOSSIER europe/france [europe/belgium …]   # les .osm.pbf : gardés s'ils ont déjà la bonne somme, sinon
#                                                               # téléchargés (plusieurs essais) À LA MÊME SOURCE que la somme,
#                                                               # puis vérifiés
#
# Sources, dans l'ordre (la première qui donne la somme MD5 est gardée pour tout l'extrait) :
#   1. Geofabrik            https://download.geofabrik.de/<région>-latest.osm.pbf
#   2. OpenStreetMap France https://download.openstreetmap.fr/extracts/<région>-latest.osm.pbf (mêmes données OSM, ODbL 1.0 ;
#      Geofabrik n'a pas de miroir officiel). Utile quand Geofabrik refuse la connexion depuis les machines GitHub
#      (« curl: (7) Failed to connect to download.geofabrik.de port 443 … Couldn't connect to server », novembre 2026).
#   GEOFABRIK_SOURCES (adresses séparées par des espaces) remplace la liste, pour les essais.
# Politesse : un seul téléchargement à la fois, quelques essais espacés seulement, User-Agent générique.
set -euo pipefail
mode=${1:?md5 ou pbf}; dir=${2:?dossier}; shift 2
[ $# -gt 0 ] || { echo "aucune région" >&2; exit 2; }
mkdir -p "$dir"
if [ -n "${GEOFABRIK_SOURCES:-}" ]; then
  read -r -a SOURCES <<< "$GEOFABRIK_SOURCES"
else
  SOURCES=(https://download.geofabrik.de https://download.openstreetmap.fr/extracts http://download.openstreetmap.fr/extracts)
fi
UA='lcnda-osm-build/1.0 (GitHub Actions)'
# -4 : la machine GitHub n'a pas d'IPv6. Petite somme : 4 essais, 20 s d'attente, 60 s au plus chacun (≈ 5 min au pire
# pour TOUTES les sources, au lieu de 5 min pour la seule première). Gros fichier : pas de durée maximale, mais on coupe si
# le débit tombe sous 50 Ko/s pendant 2 min.
# (--retry-connrefused et pas --retry-all-errors : on réessaie une connexion refusée ou un 5xx, pas un 404)
petit() { curl -4 -sS -fL --retry 3 --retry-delay 20 --retry-connrefused --connect-timeout 20 --max-time 60 -A "$UA" -o "$2" "$1"; }
# taille et date du gros fichier (requête HEAD), pour une source sans fichier .md5 (OpenStreetMap France n'en publie pas
# pour tous ses extraits) : la clé de version devient « taille=… date=… », et le fichier est vérifié par sa taille
entete() { curl -4 -sS -fLI --retry 3 --retry-delay 20 --retry-connrefused --connect-timeout 20 --max-time 60 -A "$UA" "$1" \
  | tr -d '\r' | awk '{k=tolower($1)} k=="content-length:"{n=$2+0} k=="last-modified:"{sub(/^[^:]*: */,""); d=$0} END{if(n>1000000) printf "taille=%d date=%s\n", n, d; else exit 1}'; }
gros()  { curl -4 -sS -fL --retry 3 --retry-delay 60 --retry-all-errors --connect-timeout 30 --speed-limit 51200 --speed-time 120 -A "$UA" -o "$2" "$1"; }
somme_ok() { grep -Eq '^[0-9a-f]{32}([[:space:]]|$)' "$1"; }

case "$mode" in
  md5)
    src=""
    for r in "$@"; do
      f=$(basename "$r")-latest.osm.pbf
      ok=0
      # même source pour toutes les régions d'un appel si possible : on commence par celle qui a déjà répondu
      for b in ${src:+"$src"} "${SOURCES[@]}"; do
        if petit "$b/$r-latest.osm.pbf.md5" "$dir/$f.md5.tmp" && somme_ok "$dir/$f.md5.tmp"; then
          mv "$dir/$f.md5.tmp" "$dir/$f.md5"; echo "$b" > "$dir/$f.source"; src=$b; ok=1; break
        fi
        if v=$(entete "$b/$r-latest.osm.pbf"); then
          echo "$r : pas de somme MD5 chez $b, mais le fichier est là ($v) : vérifié par sa taille" >&2
          echo "$v" > "$dir/$f.md5"; echo "$b" > "$dir/$f.source"; src=$b; ok=1; break
        fi
        echo "$r : ni somme MD5 ni fichier chez $b ($b/$r-latest.osm.pbf), source suivante" >&2
      done
      rm -f "$dir/$f.md5.tmp"
      if [ "$ok" != 1 ]; then
        # pour comprendre : ce que le dossier de chaque source propose pour cette région (une seule petite page par source)
        for b in "${SOURCES[@]}"; do
          echo "  $b/$(dirname "$r")/ propose :" >&2
          curl -4 -sS -fL --connect-timeout 20 --max-time 60 -A "$UA" "$b/$(dirname "$r")/" 2>&1 \
            | grep -o "[\"' >]$(basename "$r")[^\"'< ]*" | sort -u | head -8 >&2 || true
        done
        echo "::error::$r : aucune source n'a donné la somme MD5 ni le fichier (${SOURCES[*]})" >&2; exit 1
      fi
      echo "$r : $(head -c 120 "$dir/$f.md5") ($src)" >&2
    done
    echo "cle=$(cat "$dir"/*.md5 | sed -E 's/^([0-9a-f]{32}).*/\1/' | md5sum | cut -c1-16)"
    echo "source=$src"
    ;;
  pbf)
    for r in "$@"; do
      f=$(basename "$r")-latest.osm.pbf
      [ -s "$dir/$f.md5" ] || { echo "$f : pas de somme MD5 (lancer d'abord « md5 »)" >&2; exit 1; }
      b=$(cat "$dir/$f.source" 2>/dev/null || echo "${SOURCES[0]}")
      if ! somme_ok "$dir/$f.md5"; then
        # source sans somme MD5 : taille annoncée (requête HEAD) = taille reçue, puis osmium lit l'en-tête
        n=$(sed -E 's/^taille=([0-9]+).*/\1/' "$dir/$f.md5")
        if [ -s "$dir/$f" ] && [ "$(stat -c %s "$dir/$f")" = "$n" ]; then echo "$f : déjà là (cache), taille juste"; continue; fi
        rm -f "$dir/$f"; ok=0
        for i in 1 2 3; do
          echo "$f : téléchargement depuis $b (essai $i, sans somme MD5)"
          gros "$b/$r-latest.osm.pbf" "$dir/$f.part" || true
          if [ -s "$dir/$f.part" ] && [ "$(stat -c %s "$dir/$f.part")" = "$n" ] \
             && { ! command -v osmium >/dev/null || osmium fileinfo -F pbf "$dir/$f.part" >/dev/null; }; then
            mv "$dir/$f.part" "$dir/$f"; ok=1; break
          fi
          echo "$f : taille fausse ou fichier illisible (essai $i), nouvel essai dans 120 s" >&2
          rm -f "$dir/$f.part"; sleep 120
          v=$(entete "$b/$r-latest.osm.pbf") && { echo "$v" > "$dir/$f.md5"; n=$(sed -E 's/^taille=([0-9]+).*/\1/' "$dir/$f.md5"); }
        done
        [ "$ok" = 1 ] || { echo "::error::$f : pas de fichier juste après 3 essais ($b)" >&2; exit 1; }
        echo "$f : $(du -h "$dir/$f" | cut -f1), taille juste ($b)"; continue
      fi
      want=$(cut -c1-32 "$dir/$f.md5")
      if [ -s "$dir/$f" ] && [ "$(md5sum "$dir/$f" | cut -d' ' -f1)" = "$want" ]; then
        echo "$f : déjà là (cache), somme MD5 juste"; continue
      fi
      rm -f "$dir/$f"
      ok=0
      for i in 1 2 3; do
        echo "$f : téléchargement depuis $b (essai $i)"
        gros "$b/$r-latest.osm.pbf" "$dir/$f.part" || true
        if [ -s "$dir/$f.part" ] && [ "$(md5sum "$dir/$f.part" | cut -d' ' -f1)" = "$want" ]; then
          mv "$dir/$f.part" "$dir/$f"; ok=1; break
        fi
        # le fichier a pu changer entre la somme et le téléchargement (nouvelle version du jour) : relire la somme
        echo "$f : somme MD5 fausse ou fichier incomplet (essai $i), on relit la somme dans 120 s" >&2
        rm -f "$dir/$f.part"; sleep 120
        petit "$b/$r-latest.osm.pbf.md5" "$dir/$f.md5.tmp" && somme_ok "$dir/$f.md5.tmp" \
          && mv "$dir/$f.md5.tmp" "$dir/$f.md5"; want=$(cut -c1-32 "$dir/$f.md5")
      done
      [ "$ok" = 1 ] || { echo "::error::$f : pas de fichier juste après 3 essais ($b)" >&2; exit 1; }
      echo "$f : $(du -h "$dir/$f" | cut -f1), somme MD5 juste ($b)"
    done
    ;;
  *) echo "mode inconnu : $mode" >&2; exit 2 ;;
esac
