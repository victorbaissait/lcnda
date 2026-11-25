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

# 📚 œuvres littéraires célèbres, avec date de parution (P577), au moins N liens vers des Wikipédias
BOOKS = '''SELECT ?w ?wLabel ?d ?a ?aLabel ?langLabel ?origLabel ?frwiki ?sl ?frtitle WHERE {
 VALUES ?type { wd:Q7725634 wd:Q8261 wd:Q25379 wd:Q5185279 wd:Q49084 wd:Q571 wd:Q1279564 wd:Q12106333 wd:Q37484 wd:Q116476516 wd:Q149537 }
 ?w wdt:P31 ?type ; wdt:P577 ?d ; wikibase:sitelinks ?sl .
 FILTER(?sl >= %d)
 FILTER(YEAR(?d) >= 1600 && YEAR(?d) <= 2000)
 OPTIONAL { ?w wdt:P50 ?a }
 OPTIONAL { ?w wdt:P407 ?lang }
 OPTIONAL { ?w wdt:P495 ?orig }
 OPTIONAL { ?frwiki schema:about ?w ; schema:isPartOf <https://fr.wikipedia.org/> ; schema:name ?frtitle }
 ''' + LAB.format('') + '''
}'''
