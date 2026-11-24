"""Étape 1 : les requêtes SPARQL (query.wikidata.org, une par minute : le service limite fort). Réponses gardées dans raw/."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm

Q = {
    'communes': 'SELECT ?c ?insee ?l ?coord WHERE { ?c wdt:P374 ?insee . OPTIONAL { ?c rdfs:label ?l FILTER(lang(?l)="fr") } OPTIONAL { ?c wdt:P625 ?coord } }',
    'films_c': 'SELECT ?w ?c WHERE { ?w wdt:P915 ?c . ?c wdt:P374 ?insee . }',
    'films_l': 'SELECT ?w ?loc ?c WHERE { ?w wdt:P915 ?loc . ?loc wdt:P131 ?c . ?c wdt:P374 ?insee . }',
    'set_c': 'SELECT ?w ?c WHERE { ?w wdt:P840 ?c . ?c wdt:P374 ?insee . }',
    'set_l': 'SELECT ?w ?loc ?c WHERE { ?w wdt:P840 ?loc . ?loc wdt:P131 ?c . ?c wdt:P374 ?insee . }',
    'subject_c': 'SELECT ?w ?c ?t WHERE { ?w wdt:P921 ?c . ?c wdt:P374 ?insee . OPTIONAL { ?w wdt:P31 ?t } }',
    'arms': 'SELECT ?c ?img WHERE { ?c wdt:P374 ?insee . ?c wdt:P94 ?img . }',
    'dish_loc': 'SELECT ?d ?loc WHERE { ?d wdt:P1071 ?loc . ?loc wdt:P17 wd:Q142 . FILTER EXISTS { ?d (wdt:P31|wdt:P279)/wdt:P279* wd:Q2095 } }',
    'dish_cuisine': 'SELECT ?d ?cu ?loc WHERE { ?d wdt:P361|wdt:P2012 ?cu . ?cu wdt:P276|wdt:P131|wdt:P1269 ?loc . ?loc wdt:P17 wd:Q142 . ?cu wdt:P31/wdt:P279* wd:Q1968435 . }',
    'depts': 'SELECT ?dep ?code ?reg WHERE { ?dep wdt:P2586 ?code . ?dep p:P131/ps:P131 ?reg . }',
}
if __name__ == '__main__':
    for k in (sys.argv[1:] or Q):
        rows = wm.sparql(Q[k], k)
        print(k, len(rows), flush=True)
