"""LCNDA — 🕰 Son époque et son travail : les requêtes Wikidata (SPARQL, CC0 1.0) de scripts/epoque-travail/build.py."""

LAB = 'SERVICE wikibase:label {{ bd:serviceParam wikibase:language "fr,en". {} }}'

# ✊ grèves et conflits du travail (grève et toutes ses sous-classes : grève générale, grève des mineurs…)
STRIKES = '''SELECT ?s ?sLabel ?d ?st ?end ?coord ?loc ?locLabel ?lcoord ?larea ?adm ?admLabel ?acoord ?ind ?indLabel ?cLabel ?frwiki ?enwiki ?sl WHERE {
 ?s wdt:P31/wdt:P279* wd:Q49776 .
 OPTIONAL { ?s wdt:P585 ?d } OPTIONAL { ?s wdt:P580 ?st } OPTIONAL { ?s wdt:P582 ?end }
 OPTIONAL { ?s wdt:P625 ?coord }
 OPTIONAL { ?s wdt:P276 ?loc . OPTIONAL { ?loc wdt:P625 ?lcoord } OPTIONAL { ?loc wdt:P2046 ?larea } }
 OPTIONAL { ?s wdt:P131 ?adm . OPTIONAL { ?adm wdt:P625 ?acoord } }
 OPTIONAL { ?s wdt:P452 ?ind }
 OPTIONAL { ?s wdt:P17 ?c }
 OPTIONAL { ?frwiki schema:about ?s ; schema:isPartOf <https://fr.wikipedia.org/> }
 OPTIONAL { ?enwiki schema:about ?s ; schema:isPartOf <https://en.wikipedia.org/> }
 ?s wikibase:sitelinks ?sl .
 ''' + LAB.format('') + '''
}'''

# 🌉 ponts, canaux, écluses, tunnels, aqueducs en France (et pays voisins), datés (P571 création, P1619 ouverture)
OUVRAGES = '''SELECT ?it ?itLabel ?kind ?inc ?open ?coord ?cLabel ?frwiki ?sl ?mat ?matLabel ?cross ?crossLabel WHERE {
 VALUES ?kind { wd:%s }
 ?it wdt:P31/wdt:P279* ?kind ; wdt:P17 ?c ; wdt:P625 ?coord .
 VALUES ?c { wd:Q142 wd:Q31 wd:Q39 wd:Q32 wd:Q235 }
 { ?it wdt:P571 ?inc } UNION { ?it wdt:P1619 ?open }
 OPTIONAL { ?it wdt:P186 ?mat }
 OPTIONAL { ?it wdt:P177 ?cross }
 OPTIONAL { ?frwiki schema:about ?it ; schema:isPartOf <https://fr.wikipedia.org/> }
 ?it wikibase:sitelinks ?sl .
 ''' + LAB.format('') + '''
}'''
OUVRAGE_KINDS = {'Q12280': 'pont', 'Q12284': 'canal', 'Q105731': 'ecluse', 'Q44377': 'tunnel', 'Q474': 'aqueduc'}

# 📚 œuvres littéraires célèbres, avec date de parution (P577), au moins N liens vers des Wikipédias (libellés lus directement : plus léger)
BOOKS = '''SELECT ?w ?wfr ?wen ?d ?a ?afr ?aen ?lang ?orig ?frwiki ?sl WHERE {
 VALUES ?type { wd:Q7725634 wd:Q8261 wd:Q25379 wd:Q5185279 wd:Q49084 wd:Q571 wd:Q1279564 wd:Q12106333 wd:Q37484 wd:Q149537 }
 ?w wdt:P31 ?type ; wdt:P577 ?d ; wikibase:sitelinks ?sl .
 FILTER(?sl >= %d)
 FILTER(YEAR(?d) >= %d && YEAR(?d) < %d)
 OPTIONAL { ?w rdfs:label ?wfr FILTER(LANG(?wfr) = "fr") } OPTIONAL { ?w rdfs:label ?wen FILTER(LANG(?wen) = "en") }
 OPTIONAL { ?w wdt:P50 ?a . OPTIONAL { ?a rdfs:label ?afr FILTER(LANG(?afr) = "fr") } OPTIONAL { ?a rdfs:label ?aen FILTER(LANG(?aen) = "en") } }
 OPTIONAL { ?w wdt:P407 ?lang }
 OPTIONAL { ?w wdt:P495 ?orig }
 OPTIONAL { ?frwiki schema:about ?w ; schema:isPartOf <https://fr.wikipedia.org/> }
}''' + LAB.format('') + '''
}'''
BOOK_SPANS = [(1600, 1800), (1800, 1850), (1850, 1880), (1880, 1900), (1900, 1920), (1920, 1940), (1940, 1960), (1960, 1980), (1980, 2001)]
FR_LANG = "Q150"
FR_COUNTRIES = {'Q142', 'Q31', 'Q39', 'Q71084', 'Q70972', 'Q58296', 'Q71092', 'Q7919', 'Q58296', 'Q69461'}

# ✊ les articles de Wikipédia rangés dans les catégories des grèves (pages et sous-catégories), par le service MWAPI de Wikidata
STRIKE_CATS = ['Catégorie:Grève en France', 'Catégorie:Grève en Belgique', 'Catégorie:Grève en Suisse', 'Catégorie:Grève des mineurs du Nord-Pas-de-Calais',
               'Catégorie:Grève en France au XXe siècle', 'Catégorie:Grève de femmes en France', 'Catégorie:Grève nationale interprofessionnelle en France',
               'Catégorie:Grève en France au XIXe siècle', 'Catégorie:Révolte ouvrière', 'Catégorie:Mouvement ouvrier en France', 'Catégorie:Grève au XIXe siècle',
               'Catégorie:Grève au XXe siècle', 'Catégorie:Conflit social en France', 'Catégorie:Révolte paysanne']
CATMEMBERS = '''SELECT ?cat ?title ?item ?ns WHERE {
 VALUES ?cat { %s }
 SERVICE wikibase:mwapi { bd:serviceParam wikibase:endpoint "fr.wikipedia.org" ; wikibase:api "Generator" ; mwapi:generator "categorymembers" ;
   mwapi:gcmtitle ?cat ; mwapi:gcmlimit "max" ; mwapi:gcmtype "page|subcat" .
   ?title wikibase:apiOutput mwapi:title . ?ns wikibase:apiOutput "@ns" . ?item wikibase:apiOutputItem mwapi:item . }
}'''
# les faits Wikidata d'une liste d'articles (date, lieu, coordonnées)
FACTS = '''SELECT ?s ?sLabel ?d ?st ?end ?coord ?loc ?locLabel ?lcoord ?larea ?adm ?admLabel ?acoord ?ind ?indLabel ?cLabel ?frwiki ?sl ?type ?typeLabel WHERE {
 VALUES ?s { %s }
 OPTIONAL { ?s wdt:P31 ?type }
 OPTIONAL { ?s wdt:P585 ?d } OPTIONAL { ?s wdt:P580 ?st } OPTIONAL { ?s wdt:P582 ?end }
 OPTIONAL { ?s wdt:P625 ?coord }
 OPTIONAL { ?s wdt:P276 ?loc . OPTIONAL { ?loc wdt:P625 ?lcoord } OPTIONAL { ?loc wdt:P2046 ?larea } }
 OPTIONAL { ?s wdt:P131 ?adm . OPTIONAL { ?adm wdt:P625 ?acoord } }
 OPTIONAL { ?s wdt:P452 ?ind }
 OPTIONAL { ?s wdt:P17 ?c }
 OPTIONAL { ?frwiki schema:about ?s ; schema:isPartOf <https://fr.wikipedia.org/> }
 ?s wikibase:sitelinks ?sl .
 ''' + LAB.format('') + '''
}'''
