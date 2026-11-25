#!/usr/bin/env python3
"""Télécharge le wikitexte d'articles de Wikipédia (fr) nommés sur la ligne de commande (ou dans un fichier, un titre par ligne,
avec @fichier) : sert aux listes rédigées à la main (prénoms révolutionnaires, enfants trouvés, nationalité, hôpitaux), dont
chaque phrase citée est vérifiée mot pour mot dans ces textes par build_lot8.py. Usage : fetch_articles.py SORTIE.json TITRE…"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import l8b_net as N

titles = []
for a in sys.argv[2:]:
    titles += [l.strip() for l in open(a[1:], encoding='utf-8') if l.strip()] if a.startswith('@') else [a]
json.dump(N.wikitexts(titles), open(sys.argv[1], 'w'), ensure_ascii=False)
