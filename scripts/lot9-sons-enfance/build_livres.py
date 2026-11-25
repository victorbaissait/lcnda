#!/usr/bin/env python3
"""📚 Les livres d'école de son enfance (+ 📝 les sujets du certificat d'études : recherche de transcriptions ouvertes).
Une liste choisie de livres de classe français ; pour chacun on vérifie : l'article de Wikipédia (fr) et la phrase qui donne
l'année (CC BY-SA 4.0), l'œuvre transcrite sur Wikisource et/ou le scan sur Internet Archive (la notice doit exister),
et l'année de décès des auteurs (Wikidata, CC0 : domaine public en France).
Sortie : assets/data/l9a-livres.json.gz {rows, certif: {found, searched, note}}
"""
import re, urllib.parse
from common import jget, write, today

# [id, titre, auteur(s) (Wikipédia), article Wikipédia (fr) ou '', année de 1re parution (gardée seulement si la phrase de Wikipédia la donne,
#  sinon l'année de la plus ancienne édition numérisée), (inutilisé), matière, (inutilisé), Wikisource, [Internet Archive]]
BOOKS = [
    ['tour', 'Le Tour de la France par deux enfants', ['Augustine Fouillée'], 'Le Tour de la France par deux enfants', 1877, 1950, 'lecture', '9–13 ans', 'Le Tour de la France par deux enfants', ['LETOURDELAFRANCEPARDEUXENFANTS1877', 'letourdelafrance00brunuoft']],
    ['lavisse', 'Histoire de France, cours élémentaire (« le petit Lavisse »)', ['Ernest Lavisse'], 'Le Petit Lavisse', 1884, 1950, 'histoire', '7–10 ans', 'Histoire de France - Cours élémentaire', ['LavisseHistoireDeFranceCourslmentaire']],
    ['soldat', '« Tu seras soldat »', ['Ernest Lavisse'], '', 1888, 1914, 'lecture, morale', '10–13 ans', '', ['tuserassoldathis00laviuoft']],
    ['larive', 'Grammaire Larive et Fleury (« La Première Année de grammaire »)', [], 'Larive et Fleury', 1871, 1920, 'grammaire', '7–13 ans', 'L’Année préparatoire de Grammaire', ['grammaire01lariuoft', 'grammaire02lariuoft']],
    ['auge', 'Grammaire Claude Augé (Grammaire enfantine, Premier, Deuxième, Troisième livre)', ['Claude Augé'], '', 1889, 1930, 'grammaire', '7–13 ans', '', ['troisimelivred00auguoft']],
    ['leyssenne', 'La Première Année d’arithmétique (Leyssenne)', [], '', 1880, 1920, 'calcul', '8–11 ans', '', ['la-premiere-annee-darithmetique', 'la-deuxieme-annee-d-arithmetique-cours-superieur-de-11-a-13-ans']],
    ['foncin', 'Géographie Foncin (La Première Année de géographie)', ['Pierre Foncin'], '', 1874, 1930, 'géographie', '8–13 ans', '', ['gographiegnerale00fonc', 'geographie-annee-preparatoire-176e-edition']],
    ['regimbeau', 'Syllabaire Régimbeau', [], 'Méthode Régimbeau', 1866, 1950, 'lecture (apprendre à lire)', '5–7 ans', '', ['syllabaire-regimbeau']],
    ['boscher', 'Méthode Boscher (« La journée des tout-petits »)', ['Mathurin Boscher'], 'Méthode Boscher', 1906, 1970, 'lecture (apprendre à lire)', '5–7 ans', '', []],
    ['francinet', 'Francinet', ['Augustine Fouillée'], 'Francinet', 1869, 1900, 'lecture, morale', '10–13 ans', 'Francinet', []],
]
WS = 'https://fr.wikisource.org'


def wp(title):
    if not title: return None
    u = 'https://fr.wikipedia.org/w/api.php?' + urllib.parse.urlencode({'action': 'query', 'prop': 'extracts|pageprops', 'exintro': 1, 'explaintext': 1, 'redirects': 1, 'titles': title, 'format': 'json'})
    p = list(jget(u)['query']['pages'].values())[0]
    return None if 'missing' in p else {'title': p['title'], 'text': p.get('extract', ''), 'q': (p.get('pageprops') or {}).get('wikibase_item', '')}


def ws_exists(title):
    if not title: return None
    u = WS + '/w/api.php?' + urllib.parse.urlencode({'action': 'query', 'titles': title, 'redirects': 1, 'format': 'json'})
    p = list(jget(u)['query']['pages'].values())[0]
    return None if 'missing' in p else p['title']


def death(title):
    w = wp(title)
    if not w or not w['q']: return None
    e = list(jget(f'https://www.wikidata.org/wiki/Special:EntityData/{w["q"]}.json')['entities'].values())[0]
    try: return int(e['claims']['P570'][0]['mainsnak']['datavalue']['value']['time'][1:5])
    except Exception: return None


def sentence(text, y):
    for s in re.split(r'(?<=[.!?])\s+', text.replace('\n', ' ')):
        if str(y) in s: return s.strip()[:400]
    return ''


rows, skipped = [], []
for bid, t, authors, wpt, y, y2, subj, ages, wst, ias in BOOKS:
    w = wp(wpt)
    ws = ws_exists(wst)
    ia = []
    for i in ias:
        m = jget('https://archive.org/metadata/' + i).get('metadata') or {}
        if m: ia.append({'id': i, 'url': 'https://archive.org/details/' + i, 'date': str(m.get('date', ''))[:4], 'title': str(m.get('title', ''))[:160]})
    deaths = [[a, death(a)] for a in authors]
    if any(d is None or d > 1955 for a, d in deaths) and deaths: skipped.append([t, 'auteur : %s' % deaths]); continue
    if not ws and not ia: skipped.append([t, 'ni Wikisource ni Internet Archive']); continue
    s = sentence(w['text'], y) if w else ''
    # l'année vient de la phrase de Wikipédia, sinon de la plus ancienne édition numérisée (notée « édition de »)
    src_year = 'wikipedia' if s else 'edition'
    ys = y if s else min([int(x['date']) for x in ia if x['date'].isdigit()] or [0]) or None
    if not ys: skipped.append([t, 'année non sourcée']); continue
    rows.append({'id': bid, 't': t, 'a': [a for a, d in deaths], 'ad': [d for a, d in deaths], 'y': ys, 'yk': src_year, 'subj': subj,
                 'wp': 'https://fr.wikipedia.org/wiki/' + urllib.parse.quote(w['title'].replace(' ', '_')) if w else '', 'sentence': s,
                 'ws': WS + '/wiki/' + urllib.parse.quote(ws.replace(' ', '_')) if ws else '', 'ia': ia})
    print(ys, src_year, t, 'WS' if ws else '-', len(ia), 'IA |', s[:70])

# 📝 le certificat d'études : y a-t-il des recueils de sujets transcrits et ouverts ?
found, searched = [], []
for q in ['sujets certificat d’études primaires', 'recueil sujets examens certificat d’études', 'dictées certificat d’études', 'problèmes certificat d’études']:
    u = WS + '/w/api.php?' + urllib.parse.urlencode({'action': 'query', 'list': 'search', 'srsearch': 'intitle:certificat ' + q, 'srnamespace': 0, 'srlimit': 20, 'format': 'json'})
    hits = [h['title'] for h in jget(u)['query']['search']]
    searched.append(['Wikisource', q, len(hits)])
    found += [h for h in hits if re.search(r'(sujets|dictées|problèmes|compositions).*(certificat)|(certificat).*(sujets|dictées|problèmes)', h, re.I)]
iaq = '(title:(certificat) AND title:(sujets OR dictées OR problèmes OR compositions)) AND mediatype:texts AND language:(fre OR french) AND date:[1880-01-01 TO 1960-12-31]'
ia = jget('https://archive.org/advancedsearch.php?' + urllib.parse.urlencode([('q', iaq), ('fl[]', 'identifier'), ('fl[]', 'title'), ('fl[]', 'date'), ('fl[]', 'licenseurl'), ('fl[]', 'creator'), ('rows', 50), ('output', 'json')]))['response']['docs']
searched.append(['Internet Archive', iaq, len(ia)])
print('certificat :', found, [(d['identifier'], d.get('title')) for d in ia])
write('l9a-livres', {'source': 'Wikipédia (fr) pour l’année, Wikisource et Internet Archive pour les livres, Wikidata pour les dates de décès des auteurs', 'url': 'https://fr.wikisource.org',
                     'licence': 'Phrases de Wikipédia : CC BY-SA 4.0 ; livres du domaine public (auteurs morts depuis plus de 70 ans) ; transcriptions Wikisource CC BY-SA 4.0',
                     'built': today(), 'skipped': skipped, 'rows': rows,
                     'certif': {'found': sorted(set(found)), 'ia': [[d['identifier'], d.get('title'), str(d.get('date', ''))[:4]] for d in ia], 'searched': searched}})
