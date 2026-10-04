#!/bin/sh
# Lance l'application en local :  ./serve.sh [port]
# Pour travailler sur une COPIE de tes données (recommandé pour les tests) :
#   GENEALOGY_DATA_DIR="$HOME/test-genealogie/data" GENEALOGY_MEDIA_DIR="$HOME/test-genealogie/media" ./serve.sh
#
# Si PHP n'est pas trouvé (Mac avec Homebrew) :  PATH=/opt/homebrew/bin:$PATH ./serve.sh
cd "$(dirname "$0")" || exit 1
PORT="${1:-8080}"
trap 'echo; echo "Arrêt du serveur."; exit 0' INT TERM

echo "Application disponible sur http://127.0.0.1:${PORT}   (Ctrl+C pour arrêter)"
# - max_input_time=-1 : pas de minuteur séparé pour la lecture de la requête (certains php.ini,
#   comme celui de Homebrew, le fixent à 60 s, ce qui peut entrer en conflit avec le délai d'exécution) ;
# - max_execution_time=300 : délai fini ; les imports longs le lèvent eux-mêmes (set_time_limit) ;
# - boucle de relance : si PHP s'arrête de lui-même, il redémarre en 1 s et le message d'erreur reste affiché.
while true; do
  php \
    -d upload_max_filesize=300M -d post_max_size=1100M \
    -d memory_limit=1024M -d max_execution_time=300 -d max_input_time=-1 \
    -S "127.0.0.1:${PORT}" -t . router.php
  code=$?
  echo
  echo ">>> Le serveur PHP s'est arrêté (code ${code}). Redémarrage dans 1 s…  (Ctrl+C pour quitter)"
  sleep 1
done
