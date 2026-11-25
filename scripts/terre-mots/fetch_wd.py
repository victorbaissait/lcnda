"""Étape 1 (terre-mots) : les requêtes SPARQL à Wikidata (CC0), gardées dans TM_RAW (relancer ne refait pas les appels).
Utilisé par build-terre-mots.py. Lancer seul : python3 fetch_wd.py [clé…]"""
import sys, os, hashlib, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm

# classes Wikidata (vérifiées le jour de la fabrication)
FRUITS = {'Q15731356': 'pomme', 'Q20898395': 'poire', 'Q115606891': 'prune', 'Q49621791': 'cerise', 'Q49661826': 'cerise acide (griotte)',
          'Q16682342': 'pomme de terre', 'Q83393031': 'figue', 'Q133300398': 'fraise', 'Q109122706': 'tomate', 'Q958314': 'raisin (cépage)',
          'Q12179886': 'olive', 'Q17484780': 'houblon'}
CULTIVARS = {'Q4886': 'cultivar', 'Q26817508': 'rosier', 'Q21160573': 'dahlia', **FRUITS}
LEGENDES = {'Q2239243': 'créature légendaire', 'Q13002315': 'personnage légendaire', 'Q25810847': 'personnage du folklore', 'Q44342': 'légende',
            'Q24334685': 'entité mythique', 'Q1387388': 'chimère', 'Q8028': 'fée', 'Q7559': 'dragon', 'Q189349': 'légende urbaine',
            'Q2550974': 'esprit de l’eau', 'Q2166642': 'dame blanche'}
CRIMES = {'Q16738832': 'affaire criminelle', 'Q2055205': 'affaire non élucidée', 'Q8016240': 'affaire judiciaire', 'Q132821': 'meurtre',
          'Q149086': 'homicide', 'Q4676786': 'assassinat', 'Q318296': 'enlèvement', 'Q1124012': 'erreur judiciaire', 'Q12761956': 'affaire',
          'Q19902850': 'procès de sorcellerie'}
FETES = {'Q4618': 'carnaval', 'Q150139': 'fête patronale', 'Q673514': 'fête médiévale', 'Q462100': 'fête des vendanges', 'Q13930359': 'festival folklorique',
         'Q17135873': 'fête', 'Q117210437': 'fête calendaire', 'Q1435951': 'fête gourmande', 'Q1582987': 'pardon', 'Q1644573': 'pèlerinage',
         'Q898830': 'procession', 'Q340069': 'géants', 'Q1408378': 'fest-noz', 'Q288514': 'foire', 'Q132241': 'festival', 'Q73012175': 'fête occitane',
         'Q141325878': 'fête celtique', 'Q1238731': 'veillée', 'Q152395': 'Fête-Dieu'}
DISPARUS = {'Q350895': 'village abandonné', 'Q22674925': 'localité disparue', 'Q111051152': 'lieu englouti', 'Q74047': 'village fantôme', 'Q1964983': 'village déserté'}
REG_LANGS = ['oc', 'br', 'eu', 'co', 'ca', 'de', 'nl', 'frp', 'pcd', 'wa', 'gsw', 'vls', 'fr']

V = lambda d: ' '.join('wd:' + k for k in d)
LOCP = 'VALUES ?p { wdt:P276 wdt:P131 wdt:P17 wdt:P495 wdt:P1074 wdt:P706 wdt:P840 wdt:P1071 }'
Q = {
    'communes': 'SELECT ?c ?insee WHERE { ?c wdt:P374 ?insee }',
    'demonym': 'SELECT ?c ?d ?g WHERE { ?c wdt:P374 [] ; p:P1549 ?s . ?s ps:P1549 ?d . FILTER(lang(?d)="fr") OPTIONAL { ?s pq:P5109 ?g } }',
    'native': 'SELECT ?c ?n WHERE { ?c wdt:P374 [] ; wdt:P1705 ?n }',
    'sundials': 'SELECT ?x ?loc ?coord ?img ?motto ?ins ?inc ?mh ?cty WHERE { ?x wdt:P31 wd:Q80793 . OPTIONAL { ?x wdt:P131 ?loc } OPTIONAL { ?x wdt:P625 ?coord } OPTIONAL { ?x wdt:P18 ?img } '
                'OPTIONAL { ?x wdt:P1451 ?motto } OPTIONAL { ?x wdt:P1684 ?ins } OPTIONAL { ?x wdt:P571 ?inc } OPTIONAL { ?x wdt:P380 ?mh } OPTIONAL { ?x wdt:P17 ?cty } }',
    'disp_q': f'SELECT ?x ?k WHERE {{ VALUES ?k {{ {V(DISPARUS)} }} ?x wdt:P1552 ?k }}',
    'disp_t': f'SELECT ?x ?k WHERE {{ VALUES ?k {{ {V(DISPARUS)} }} ?x wdt:P31 ?k }}',
    'fusions': 'SELECT ?x ?t ?rep ?end ?coord ?insee WHERE { VALUES ?t { wd:Q484170 wd:Q21869758 wd:Q666943 wd:Q19730508 } ?x wdt:P31 ?t ; wdt:P1366 ?rep . ?rep wdt:P374 [] . '
               'OPTIONAL { ?x wdt:P576 ?end } OPTIONAL { ?x wdt:P625 ?coord } OPTIONAL { ?x wdt:P374 ?insee } }',
    'cultivars': f'SELECT ?x ?t ?o ?loc ?n ?s ?img WHERE {{ VALUES ?t {{ {V(FRUITS)} }} ?x wdt:P31 ?t . OPTIONAL {{ ?x wdt:P495 ?o }} OPTIONAL {{ ?x wdt:P1071 ?loc }} '
                 'OPTIONAL { ?x wdt:P138 ?n } OPTIONAL { ?x wdt:P571|wdt:P580 ?s } OPTIONAL { ?x wdt:P18 ?img } }',
    'named': f'SELECT ?x ?t ?n ?o ?s WHERE {{ VALUES ?t {{ wd:Q4886 wd:Q26817508 wd:Q21160573 }} ?x wdt:P31 ?t ; wdt:P138 ?n . OPTIONAL {{ ?x wdt:P495 ?o }} OPTIONAL {{ ?x wdt:P571|wdt:P580 ?s }} }}',
    'legendes': f'SELECT ?x ?t ?p ?loc WHERE {{ VALUES ?t {{ {V(LEGENDES)} }} ?x wdt:P31 ?t . OPTIONAL {{ {LOCP} ?x ?p ?loc }} }}',
    'crimes': f'SELECT ?x ?t ?p ?loc WHERE {{ VALUES ?t {{ {V(CRIMES)} }} ?x wdt:P31 ?t . ?x wdt:P17 wd:Q142 . OPTIONAL {{ {LOCP} ?x ?p ?loc }} }}',
    'fetes': f'SELECT ?x ?t ?p ?loc WHERE {{ VALUES ?t {{ {V(FETES)} }} ?x wdt:P31 ?t . OPTIONAL {{ {LOCP} ?x ?p ?loc }} }}',
}

def rows(k):
    return wm.sparql(Q[k], 'tm-' + k)

def qid(u): return u.rsplit('/', 1)[1] if u else ''

def batch(ids, tmpl, tag, chunk=1500):
    """une requête par paquet de QID (VALUES ?x)"""
    out = []
    ids = sorted({i for i in ids if re.match(r'^Q\d+$', i)}, key=lambda x: int(x[1:]))
    for i in range(0, len(ids), chunk):
        part = ids[i:i + chunk]
        q = tmpl.replace('%VALUES%', ' '.join('wd:' + x for x in part))
        out += wm.sparql(q, f'tm-{tag}-' + hashlib.sha1(' '.join(part).encode()).hexdigest()[:16])
    return out

def details(ids):
    """date, coordonnées, image, fréquence… d'une liste d'éléments"""
    return batch(ids, 'SELECT ?x ?coord ?s ?e ?d ?img ?freq ?day ?insee WHERE { VALUES ?x { %VALUES% } OPTIONAL { ?x wdt:P625 ?coord } OPTIONAL { ?x wdt:P580|wdt:P571 ?s } '
                 'OPTIONAL { ?x wdt:P582|wdt:P576 ?e } OPTIONAL { ?x wdt:P585 ?d } OPTIONAL { ?x wdt:P18 ?img } OPTIONAL { ?x wdt:P2257 ?freq } OPTIONAL { ?x wdt:P837 ?day } OPTIONAL { ?x wdt:P374 ?insee } }', 'det')

def places(ids):
    """où est un lieu : code INSEE, centre, code de département, commune parente, pays"""
    return batch(ids, 'SELECT ?x ?insee ?coord ?dep ?pinsee ?pdep ?cty WHERE { VALUES ?x { %VALUES% } OPTIONAL { ?x wdt:P374 ?insee } OPTIONAL { ?x wdt:P625 ?coord } '
                 'OPTIONAL { ?x wdt:P2586 ?dep } OPTIONAL { ?x wdt:P131 ?p . ?p wdt:P374 ?pinsee } OPTIONAL { ?x wdt:P131 ?p2 . ?p2 wdt:P2586 ?pdep } OPTIONAL { ?x wdt:P17 ?cty } }', 'pl')

def reg_labels(ids):
    """les noms des communes dans les langues régionales (et en français), par paquets de 1500 communes"""
    langs = ', '.join('"%s"' % l for l in REG_LANGS)
    return batch(ids, 'SELECT ?x ?l WHERE { VALUES ?x { %VALUES% } ?x rdfs:label ?l . FILTER(lang(?l) IN (' + langs + ')) }', 'reglab', 1500)

def labels(ids):
    out = {}
    for r in batch(ids, 'SELECT ?x ?fr ?en ?d ?wp WHERE { VALUES ?x { %VALUES% } OPTIONAL { ?x rdfs:label ?fr FILTER(lang(?fr)="fr") } OPTIONAL { ?x rdfs:label ?en FILTER(lang(?en)="en") } '
                   'OPTIONAL { ?x schema:description ?d FILTER(lang(?d)="fr") } OPTIONAL { ?wp schema:about ?x ; schema:isPartOf <https://fr.wikipedia.org/> } }', 'lab', 2000):
        import urllib.parse
        o = out.setdefault(qid(r['x']), {'fr': '', 'en': '', 'desc': '', 'wp': ''})
        o['fr'] = o['fr'] or r.get('fr', ''); o['en'] = o['en'] or r.get('en', ''); o['desc'] = o['desc'] or r.get('d', '')
        if r.get('wp') and not o['wp']: o['wp'] = urllib.parse.unquote(r['wp'].rsplit('/wiki/', 1)[1]).replace('_', ' ')
    return out

if __name__ == '__main__':
    for k in (sys.argv[1:] or Q):
        try: print(k, len(rows(k)), flush=True)
        except Exception as e: print(k, 'ÉCHEC', e, flush=True)
    if not sys.argv[1:]: print('reglabels', len(reg_labels([qid(r['c']) for r in rows('communes')])), flush=True)
