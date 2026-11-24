"""Étape 1 : les requêtes SPARQL (query.wikidata.org, une par minute : le service limite fort). Réponses gardées dans raw/."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm

Q = {
    'communes': 'SELECT ?c ?insee ?coord WHERE { ?c wdt:P374 ?insee . OPTIONAL { ?c wdt:P625 ?coord } }',
    'films_c': 'SELECT ?w ?c WHERE { ?w wdt:P915 ?c . ?c wdt:P374 ?insee . }',
    'films_l': 'SELECT ?w ?loc ?c WHERE { ?w wdt:P915 ?loc . ?loc wdt:P131 ?c . ?c wdt:P374 ?insee . }',
    'set_c': 'SELECT ?w ?c WHERE { ?w wdt:P840 ?c . ?c wdt:P374 ?insee . }',
    'set_l': 'SELECT ?w ?loc ?c WHERE { ?w wdt:P840 ?loc . ?loc wdt:P131 ?c . ?c wdt:P374 ?insee . }',
    'subject_c': 'SELECT ?w ?c ?t WHERE { ?w wdt:P921 ?c . ?c wdt:P374 ?insee . OPTIONAL { ?w wdt:P31 ?t } }',
    'arms': 'SELECT ?c ?img WHERE { ?c wdt:P374 ?insee . ?c wdt:P94 ?img . }',
    'dish_loc': 'SELECT ?d ?loc ?t WHERE { ?d wdt:P1071 ?loc . ?loc wdt:P17 wd:Q142 . ?d wdt:P31|wdt:P279 ?t . }',
    'dish_cuisine': 'SELECT ?d ?cu ?loc WHERE { ?cu wdt:P31 ?ct . VALUES ?ct { wd:Q1968435 wd:Q19891800 wd:Q94951 wd:Q2920963 } ?cu wdt:P276|wdt:P131|wdt:P1269 ?loc . ?loc wdt:P17 wd:Q142 . ?d wdt:P361|wdt:P2012 ?cu . }',
    'depts': 'SELECT ?dep ?code ?reg WHERE { ?dep wdt:P2586 ?code . ?dep p:P131/ps:P131 ?reg . }',
    'meta_tourne': 'SELECT ?w ?t ?d ?img ?by WHERE { { ?w wdt:P915 ?c . ?c wdt:P374 ?i } UNION { ?w wdt:P915 ?x . ?x wdt:P131 ?c . ?c wdt:P374 ?i } OPTIONAL { ?w wdt:P31 ?t } OPTIONAL { ?w wdt:P577 ?d } OPTIONAL { ?w wdt:P18 ?img } OPTIONAL { ?w wdt:P57 ?by } }',
    'meta_cadre': 'SELECT ?w ?t ?d ?img ?by WHERE { { ?w wdt:P840 ?c . ?c wdt:P374 ?i } UNION { ?w wdt:P840 ?x . ?x wdt:P131 ?c . ?c wdt:P374 ?i } OPTIONAL { ?w wdt:P31 ?t } OPTIONAL { ?w wdt:P577|wdt:P571 ?d } OPTIONAL { ?w wdt:P18 ?img } OPTIONAL { ?w wdt:P50|wdt:P170|wdt:P86|wdt:P57 ?by } }',
    'meta_sujet': 'SELECT ?w ?t ?d ?img ?by WHERE { ?w wdt:P921 ?c . ?c wdt:P374 ?i . FILTER NOT EXISTS { ?w wdt:P31 wd:Q13442814 } OPTIONAL { ?w wdt:P31 ?t } OPTIONAL { ?w wdt:P577|wdt:P571 ?d } OPTIONAL { ?w wdt:P18 ?img } OPTIONAL { ?w wdt:P50|wdt:P170|wdt:P86|wdt:P57 ?by } }',
}
if __name__ == '__main__':
    for k in (sys.argv[1:] or Q):
        rows = wm.sparql(Q[k], k)
        print(k, len(rows), flush=True)
