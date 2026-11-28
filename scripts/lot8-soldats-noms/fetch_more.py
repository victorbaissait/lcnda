#!/usr/bin/env python3
"""Étape 1 (suite) : quelques articles et une catégorie de Wikipédia pour les listes rédigées à la main.
Usage : fetch_more.py SORTIE.json"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import l8b_net as N

def members(cat, lang='fr'):
    out, cont = [], {}
    while True:
        r = N.wp({'action': 'query', 'list': 'categorymembers', 'cmtitle': cat, 'cmlimit': 500, 'cmnamespace': 0, **cont}, lang)
        out += [m['title'] for m in r['query']['categorymembers']]
        if 'continue' not in r:
            return out
        cont = r['continue']

fr = N.wikitexts(["Option (Alsace-Moselle)", "Optant", "Abandon d'enfant sous l'Ancien Régime", "Mélisse (prénom)", "Prénom en droit français",
                  "Déchristianisation (Révolution française)", "Étymologie des noms de famille français", "Croix-Rouge française", "Service de santé des armées", "Union des femmes de France", "Registre matricule"])
en = N.wikitexts(['Expósito', 'Esposito (surname)', 'Foundling', 'International Prisoners-of-War Agency'], 'en')
cat = members('Catégorie:Prénom révolutionnaire')
json.dump({'fr': fr, 'en': en, 'cat_prenoms': cat}, open(sys.argv[1], 'w'), ensure_ascii=False)
print('ok', len(fr), len(en), len(cat), file=sys.stderr)
