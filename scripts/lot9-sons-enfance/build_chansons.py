#!/usr/bin/env python3
"""🎼 Les chansons de son enfance — chansons populaires françaises datées, avec leur partition libre sur IMSLP.
Chaque chanson de la liste choisie (ci-dessous) est vérifiée :
  · l'article de Wikipédia (fr) existe, et la phrase qui donne l'année est recopiée (CC BY-SA 4.0) ;
  · les auteurs (paroles et musique) : année de décès lue dans Wikidata (CC0). On ne garde que les auteurs morts en 1940 ou avant
    (70 ans + les « prorogations de guerre » françaises, jusqu'à ~15 ans pour les œuvres d'avant 1921 : domaine public sûr en France) ;
    « traditionnel » = sans auteur connu ;
  · la page IMSLP : au moins une partition d'origine (scan, sans arrangeur) marquée « Copyright=Public Domain ».
Sortie : assets/data/l9a-chansons.json.gz
"""
import json, re, urllib.parse
from common import jget, get, write, today

# [titre Wikipédia (fr), année, [auteurs (titres Wikipédia fr)], recherche IMSLP]
SONGS = [
    ['Le Temps des cerises', 1866, ['Jean-Baptiste Clément', 'Antoine Renard'], 'Le temps des cerises Renard'],
    ['Le P\'tit Quinquin', 1853, ['Alexandre Desrousseaux'], 'Petit Quinquin Desrousseaux'],
    ['Le Chant des ouvriers', 1846, ['Pierre Dupont (chansonnier)'], 'Chant des ouvriers Dupont'],
    ['Les Bœufs (chanson)', 1845, ['Pierre Dupont (chansonnier)'], 'Les boeufs Dupont'],
    ['Ma Normandie', 1836, ['Frédéric Bérat'], 'Ma Normandie Bérat'],
    ['Les Montagnards (chanson)', 1840, ['Alfred Roland'], 'Montagnards Roland'],
    ['L\'Internationale', 1888, ['Eugène Pottier', 'Pierre De Geyter'], 'Internationale Degeyter'],
    ['En revenant de la revue', 1886, ['Louis-César Desormes', 'Lucien Delormel', 'Léon Garnier'], 'En revenant de la revue Desormes'],
    ['Le Père la Victoire', 1888, ['Louis Ganne', 'Lucien Delormel'], 'Père la Victoire Ganne'],
    ['Marche lorraine', 1892, ['Louis Ganne', 'Jules Jouy'], 'Marche lorraine Ganne'],
    ['Le Régiment de Sambre et Meuse', 1879, ['Robert Planquette', 'Paul Cézano'], 'Sambre et Meuse Planquette'],
    ['La Paimpolaise', 1895, ['Théodore Botrel', 'Eugène Feautrier'], 'Paimpolaise Botrel'],
    ['Les Petits Pavés', 1891, ['Paul Delmet', 'Maurice Vaucaire'], 'Petits pavés Delmet'],
    ['Nini peau d\'chien', 1895, ['Aristide Bruant'], 'Nini peau de chien Bruant'],
    ['À Saint-Lazare', 1887, ['Aristide Bruant'], 'Saint-Lazare Bruant'],
    ['Fascination (chanson)', 1904, ['Fermo Dante Marchetti', 'Maurice de Féraudy'], 'Fascination Marchetti'],
    ['Frou-frou (chanson)', 1897, ['Henri Chatau', 'Hector Monréal', 'Henri Blondeau'], 'Frou-frou Chatau'],
    ['Le Chant du départ', 1794, ['Étienne Nicolas Méhul', 'Marie-Joseph Chénier'], 'Chant du départ Méhul'],
    ['Plaisir d\'amour', 1784, ['Jean-Paul-Égide Martini', 'Jean-Pierre Claris de Florian'], 'Plaisir d\'amour Martini'],
    ['La Marseillaise', 1792, ['Claude Joseph Rouget de Lisle'], 'La Marseillaise Rouget de Lisle'],
    ['Le Chant des Girondins', 1847, ['Alphonse Varney', 'Alexandre Dumas'], 'Chant des Girondins Varney'],
    ['Il pleut, bergère', 1780, ['Fabre d\'Églantine', 'Louis-Victor Simon'], 'Il pleut bergère'],
    ['La Chanson des blés d\'or', 1882, ['Frédéric Boissière', 'Camille Soubise'], 'Blés d\'or Doria'],
    ['La Valse des roses', 1900, ['Olivier Métra'], 'Valse des roses Métra'],
    ['Les Cloches de Corneville', 1877, ['Robert Planquette'], 'Cloches de Corneville Planquette'],
    ['Le Rêve passe', 1906, ['Charles Helmer', 'Georges Krier'], 'Le rêve passe Helmer'],
    ['La Valse brune', 1909, ['Georges Krier', 'Charles Chevalier'], 'Valse brune Krier'],
    ['Viens Poupoule !', 1902, ['Adolf Spahn', 'Henri Christiné'], 'Viens poupoule'],
    ['La Madelon', 1914, ['Camille Robert', 'Louis Bousquet'], 'Madelon Robert'],
    ['Sous les ponts de Paris', 1913, ['Vincent Scotto', 'Jean Rodor'], 'Sous les ponts de Paris Scotto'],
    ['La Chanson de Craonne', 1917, ['Charles Sablon'], 'Bonsoir m\'amour Sablon'],
    ['Le Clairon (chanson)', 1873, ['Paul Déroulède', 'Émile André'], 'Le clairon Déroulède'],
    ['La Coupo Santo', 1867, ['Frédéric Mistral'], 'Coupo santo'],
    ['Le Credo du paysan', 1890, ['Gustave Goublier', 'Gabriel Lafforêt'], 'Credo du paysan Goublier'],
    ['La Tonkinoise', 1906, ['Vincent Scotto', 'Henri Christiné'], 'Tonkinoise Scotto'],
    ['Quand l\'amour meurt', 1904, ['Octave Crémieux', 'Georges Millandy'], 'Quand l\'amour meurt Crémieux'],
    ['La Mattchiche', 1905, ['Charles Borel-Clerc'], 'Mattchiche'],
    ['L\'Hirondelle du faubourg', 1912, ['Ferdinand-Louis Bénech', 'Ernest Dumont'], 'Hirondelle du faubourg'],
    ['Les Roses blanches', 1925, ['Léon Raiter', 'Charles-Louis Pothier'], 'Roses blanches Raiter'],
    ['Le Fiacre (chanson)', 1888, ['Léon Xanrof'], 'Le fiacre Xanrof'],
    ['Le Grand Métingue du Métropolitain', 1895, ['Maurice Mac-Nab'], 'Métingue Métropolitain'],
    ['La Bonne Aventure (chanson)', 1810, [], 'Bonne aventure'],
    ['Cadet Rousselle', 1792, [], 'Cadet Rousselle'],
    ['Au clair de la lune', 1780, [], 'Au clair de la lune'],
    ['Malbrough s\'en va-t-en guerre', 1780, [], 'Malbrough'],
    ['Le bon roi Dagobert', 1787, [], 'Roi Dagobert'],
    ['À la claire fontaine', 1704, [], 'A la claire fontaine'],
    ['J\'ai du bon tabac', 1760, ['Gabriel-Charles de Lattaignant'], 'J\'ai du bon tabac'],
    ['Frère Jacques', 1780, [], 'Frère Jacques'],
    ['Sur le pont d\'Avignon', 1846, [], 'Sur le pont d\'Avignon'],
    ['Le Petit Navire', 1840, [], 'Petit navire'],
    ['Auprès de ma blonde', 1704, [], 'Auprès de ma blonde'],
    ['Il était une bergère', 1780, [], 'Il était une bergère'],
    ['Ah ! vous dirai-je, maman', 1761, [], 'Ah vous dirai-je maman'],
    ['Minuit, chrétiens', 1847, ['Adolphe Adam', 'Placide Cappeau'], 'Minuit chrétiens Adam'],
    ['Il est né le divin Enfant', 1862, [], 'Il est né le divin enfant'],
    ['Les Anges dans nos campagnes', 1842, [], 'Anges dans nos campagnes'],
]
LIMIT = 1940


def wp(title):
    u = 'https://fr.wikipedia.org/w/api.php?' + urllib.parse.urlencode({'action': 'query', 'prop': 'extracts|pageprops', 'exintro': 1, 'explaintext': 1, 'redirects': 1, 'titles': title, 'format': 'json'})
    p = list(jget(u)['query']['pages'].values())[0]
    if 'missing' in p: return None
    return {'title': p['title'], 'text': p.get('extract', ''), 'q': (p.get('pageprops') or {}).get('wikibase_item', '')}


def death(title):
    w = wp(title)
    if not w or not w['q']: return None, None
    e = jget(f'https://www.wikidata.org/wiki/Special:EntityData/{w["q"]}.json')['entities']
    ent = list(e.values())[0]
    cl = ent.get('claims', {}).get('P570', [])
    try: y = int(cl[0]['mainsnak']['datavalue']['value']['time'][1:5])
    except Exception: y = None
    return y, w['q']


fold = lambda s: re.sub(r'[\u0300-\u036f]', '', __import__('unicodedata').normalize('NFD', s or '')).lower().strip()


def sentence(text, y):
    for s in re.split(r'(?<=[.!?])\s+', text.replace('\n', ' ')):
        s = re.sub(r'^[^\[]{0,40}\]\s*', '', s)
        if str(y) in s: return s.strip()[:400]
    return ''


def imslp(query, authors):
    if not query: return None
    u = 'https://imslp.org/api.php?' + urllib.parse.urlencode({'action': 'query', 'list': 'search', 'srsearch': query, 'srlimit': 8, 'format': 'json'})
    try: hits = jget(u)['query']['search']
    except Exception as e: print('! imslp', e); return None
    words = [w for w in re.findall(r'\w{4,}', query.lower())][:2]
    for h in hits:
        t = h['title']
        if t.startswith('Category:') or not all(w in t.lower() for w in words[:1]): continue
        # la page doit être la chanson elle-même : son compositeur (entre parenthèses) est un des auteurs, ou « Traditional »
        comp = fold((re.search(r'\(([^,()]+),', t) or re.search(r'\(([^()]+)\)', t) or [None, ''])[1])
        names = [fold(a.split(' (')[0]).split()[-1] for a in authors]
        if not (comp and (any(n == comp or n in comp for n in names) or (not authors and re.search(r'tradition|anonym', comp)))): continue
        u2 = 'https://imslp.org/api.php?' + urllib.parse.urlencode({'action': 'query', 'titles': t, 'prop': 'revisions', 'rvprop': 'content', 'format': 'json'})
        page = list(jget(u2)['query']['pages'].values())[0]
        txt = page['revisions'][0]['*']
        files = txt.split('| *****FILES*****')[-1].split('===Arrangements')[0]
        for blk in files.split('{{#fte:imslpfile')[1:]:
            if '|Copyright=Public Domain' not in blk or re.search(r'\|Arranger=\S', blk) or 'Image Type=Typeset' in blk: continue
            fn = re.search(r'\|File Name 1=(.+)', blk)
            pub = re.search(r'\|Publisher Information=(.*)', blk)
            return {'page': t, 'url': 'https://imslp.org/wiki/' + urllib.parse.quote(t.replace(' ', '_')), 'file': fn.group(1).strip() if fn else '',
                    'pub': re.sub(r'\{\{|\}\}|\|', ' ', pub.group(1)).strip()[:120] if pub else '', 'lic': 'Public Domain (IMSLP)'}
    return None


rows, skipped = [], []
for title, y, authors, iq in SONGS:
    w = wp(title)
    if not w: skipped.append([title, 'pas d’article Wikipédia']); continue
    s = sentence(w['text'], y)
    yk = 'wikipedia'
    if not s:
        # l'année n'est pas dans l'introduction de Wikipédia : celle de Wikidata (P571 création, P577 publication), sinon on écarte
        yk = 'wikidata'
        try:
            ent = list(jget(f'https://www.wikidata.org/wiki/Special:EntityData/{w["q"]}.json')['entities'].values())[0] if w['q'] else {}
            yy = None
            for pr in ('P577', 'P571'):
                for c in ent.get('claims', {}).get(pr, []):
                    try: yy = int(c['mainsnak']['datavalue']['value']['time'][1:5]); break
                    except Exception: pass
                if yy: break
        except Exception: yy = None
        if not yy: skipped.append([title, 'année introuvable dans Wikipédia et Wikidata']); continue
        y = yy
    dd = []
    ok = True
    for a in authors:
        d, q = death(a)
        dd.append([a.split(' (')[0], d, q])
        if d is None or d > LIMIT: ok = False
    if not ok: skipped.append([title, 'auteur mort après %d ou date inconnue : %s' % (LIMIT, dd)]); continue
    sc = imslp(iq, authors)
    rows.append({'t': w['title'], 'y': y, 'yk': yk, 'q': w['q'], 'wp': 'https://fr.wikipedia.org/wiki/' + urllib.parse.quote(w['title'].replace(' ', '_')), 'sentence': s,
                 'authors': [[n, d] for n, d, q in dd], 'trad': not authors, 'score': sc})
    print(y, w['title'], 'IMSLP' if sc else '-', '|', s[:80])
print(len(rows), 'gardées ;', len(skipped), 'écartées')
for s in skipped: print('  écartée :', s)
write('l9a-chansons', {'source': 'Wikipédia (fr) pour l’année, Wikidata pour les dates de décès des auteurs, IMSLP pour les partitions', 'url': 'https://imslp.org',
                       'licence': 'Phrases de Wikipédia : CC BY-SA 4.0 ; Wikidata : CC0 ; partitions IMSLP marquées « Public Domain », auteurs morts en %d ou avant (domaine public en France, prorogations de guerre comprises)' % LIMIT,
                       'built': today(), 'skipped': skipped, 'rows': rows})
