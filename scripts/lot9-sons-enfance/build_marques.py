#!/usr/bin/env python3
"""🍬 Les marques nées de son vivant + 🚗 les voitures et les objets de ses 30 ans.
Une liste choisie de marques françaises connues de tous (aliments, boissons, maison, magasins, jouets) et de voitures et objets
français ; pour chacun, Wikidata (CC0) donne l'année (création, sortie, début de production), le pays et une image (Wikimedia Commons :
auteur et licence relus sur Commons). La phrase de Wikipédia (fr, CC BY-SA 4.0) qui donne l'année est recopiée quand on la trouve.
Pas de doublon avec « 💡 Les nouveautés » (heritage-epoque-travail.js : inventions) : les mêmes choses en sont écartées.
Sortie : assets/data/l9a-marques.json.gz
Usage : python3 build_marques.py           (fabrique)
        python3 build_marques.py --check   (montre ce que Wikidata trouve pour chaque nom)
"""
import re, sys, urllib.parse, unicodedata
from common import jget, write, today

# [nom cherché, article Wikipédia (fr), genre]   genre : aliment, boisson, maison, magasin, jouet, hygiene, voiture, objet, deux-roues
ITEMS = [
    ['Banania', 'Banania', 'aliment'], ['LU', 'LU (entreprise)', 'aliment'], ['Petit Beurre', 'Petit-beurre', 'aliment'], ['La Vache qui rit', 'La vache qui rit', 'aliment'],
    ['Poulain', 'Chocolat Poulain', 'aliment'], ['Menier', 'Chocolat Menier', 'aliment'], ['Lustucru', 'Lustucru', 'aliment'], ['Panzani', 'Panzani', 'aliment'],
    ['Amora', 'Amora', 'aliment'], ['Maille', 'Maille (entreprise)', 'aliment'], ['Bonduelle', 'Bonduelle', 'aliment'], ['Viandox', 'Viandox', 'aliment'],
    ['Babybel', 'Babybel', 'aliment'], ['Boursin', 'Boursin', 'aliment'], ['Carambar', 'Carambar', 'aliment'], ['Malabar', 'Malabar (confiserie)', 'aliment'],
    ['La Pie qui chante', 'La Pie qui chante', 'aliment'], ['Blédina', 'Blédina', 'aliment'], ['Phosphatine', 'Phosphatine', 'aliment'], ['Benenuts', 'Bénénuts', 'aliment'],
    ['Pernod', 'Pernod (entreprise)', 'boisson'], ['Ricard', 'Ricard (entreprise)', 'boisson'], ['Byrrh', 'Byrrh', 'boisson'],
    ['Suze', 'Suze (apéritif)', 'boisson'], ['Lillet', 'Lillet', 'boisson'], ['Picon', 'Picon (boisson)', 'boisson'], ['Saint-Raphaël', 'Saint-Raphaël (apéritif)', 'boisson'],
    ['Perrier', 'Perrier (eau)', 'boisson'], ['Évian', 'Évian (eau minérale)', 'boisson'], ['Vittel', 'Vittel (eau minérale)', 'boisson'], ['Badoit', 'Badoit', 'boisson'],
    ['Orangina', 'Orangina', 'boisson'], ['Pschitt', 'Pschitt', 'boisson'], ['Ricqlès', 'Ricqlès', 'boisson'], ['Kronenbourg', 'Kronenbourg', 'boisson'],
    ['Cadum', 'Cadum', 'hygiene'], ['Monsavon', 'Monsavon', 'hygiene'], ['Ripolin', 'Ripolin', 'maison'], ['La Croix (javel)', 'La Croix (marque)', 'maison'],
    ['Le Chat (lessive)', 'Le Chat (lessive)', 'maison'], ['Opinel', 'Opinel', 'objet'], ['Bic', 'Société Bic', 'objet'], ['Moulinex', 'Moulinex', 'maison'],
    ['SEB', 'Groupe SEB', 'maison'], ['Cocotte-Minute', 'Cocotte-Minute', 'maison'], ['Duralex', 'Duralex', 'maison'], ['Le Creuset', 'Le Creuset', 'maison'], ['Tefal', 'Tefal', 'maison'],
    ['Manufrance', 'Manufrance', 'magasin'], ['La Redoute', 'La Redoute', 'magasin'], ['Galeries Lafayette', 'Galeries Lafayette', 'magasin'], ['Printemps', 'Printemps (grand magasin)', 'magasin'],
    ['Le Bon Marché', 'Le Bon Marché', 'magasin'], ['La Samaritaine', 'La Samaritaine', 'magasin'], ['Félix Potin', 'Félix Potin', 'magasin'], ['Prisunic', 'Prisunic', 'magasin'],
    ['Monoprix', 'Monoprix', 'magasin'], ['Casino', 'Groupe Casino', 'magasin'], ['Petit Bateau', 'Petit Bateau', 'objet'], ['Aigle', 'Aigle (entreprise)', 'objet'], ['Lacoste', 'Lacoste (entreprise)', 'objet'],
    ['Jouef', 'Jouef', 'jouet'], ['Majorette', 'Majorette', 'jouet'], ['1000 Bornes', 'Mille Bornes', 'jouet'], ['Bibliothèque rose', 'Bibliothèque rose', 'jouet'], ['Pif Gadget', 'Pif Gadget', 'jouet'],
    ['Guide Michelin', 'Guide Michelin', 'objet'], ['Larousse', 'Petit Larousse', 'objet'],
    # voitures et deux-roues
    ['Peugeot Bébé', 'Peugeot Bébé', 'voiture'], ['Citroën Type A', 'Citroën Type A', 'voiture'], ['Citroën 5 HP', 'Citroën Type C', 'voiture'], ['Renault NN', 'Renault NN', 'voiture'],
    ['Citroën Rosalie', 'Citroën Rosalie', 'voiture'], ['Traction Avant', 'Citroën Traction Avant', 'voiture'], ['Renault Juvaquatre', 'Renault Juvaquatre', 'voiture'],
    ['Peugeot 202', 'Peugeot 202', 'voiture'], ['Renault 4CV', 'Renault 4CV', 'voiture'], ['Citroën 2 CV', 'Citroën 2CV', 'voiture'], ['Citroën Type H', 'Citroën Type H', 'voiture'],
    ['Peugeot 203', 'Peugeot 203', 'voiture'], ['Simca Aronde', 'Simca Aronde', 'voiture'], ['Panhard Dyna Z', 'Panhard Dyna Z', 'voiture'], ['Citroën DS', 'Citroën DS', 'voiture'],
    ['Peugeot 403', 'Peugeot 403', 'voiture'], ['Renault Dauphine', 'Renault Dauphine', 'voiture'], ['Renault Estafette', 'Renault Estafette', 'voiture'], ['Peugeot 404', 'Peugeot 404', 'voiture'],
    ['Renault 4', 'Renault 4', 'voiture'], ['Simca 1000', 'Simca 1000', 'voiture'], ['Citroën Ami 6', 'Citroën Ami 6', 'voiture'], ['Renault 8', 'Renault 8', 'voiture'],
    ['Renault 16', 'Renault 16', 'voiture'], ['Peugeot 204', 'Peugeot 204', 'voiture'], ['Citroën Dyane', 'Citroën Dyane', 'voiture'], ['Peugeot 504', 'Peugeot 504', 'voiture'],
    ['Citroën GS', 'Citroën GS', 'voiture'], ['Renault 5', 'Renault 5', 'voiture'], ['Citroën CX', 'Citroën CX', 'voiture'], ['Peugeot 205', 'Peugeot 205', 'voiture'],
    ['Renault Clio', 'Renault Clio I', 'voiture'], ['Renault Twingo', 'Renault Twingo I', 'voiture'],
    ['VéloSolex', 'VéloSolex', 'deux-roues'], ['Mobylette', 'Mobylette', 'deux-roues'], ['Motobécane', 'Motobécane', 'deux-roues'], ['Teppaz', 'Teppaz', 'objet'],
]
# déjà dans « 💡 Les nouveautés » (et-nouveautes) : pas de doublon
NOUVEAUTES = ['machine a coudre', 'allumette', 'telephone', 'phonographe', 'ampoule', 'automobile a essence', 'cinema', 'radio', 'television', 'stylo a bille', 'minitel', 'refrigerateur', 'velocipede']
fold = lambda s: re.sub(r'[̀-ͯ]', '', unicodedata.normalize('NFD', s or '')).lower()


def wp(title):
    u = 'https://fr.wikipedia.org/w/api.php?' + urllib.parse.urlencode({'action': 'query', 'prop': 'extracts|pageprops', 'exintro': 1, 'explaintext': 1, 'redirects': 1, 'titles': title, 'format': 'json'})
    p = list(jget(u)['query']['pages'].values())[0]
    if 'missing' in p: return None
    return {'title': p['title'], 'text': p.get('extract', ''), 'q': (p.get('pageprops') or {}).get('wikibase_item', '')}


def claim_year(ent, props):
    for pr in props:
        for c in ent.get('claims', {}).get(pr, []):
            try:
                t = c['mainsnak']['datavalue']['value']['time']
                return int(t[1:5]), pr
            except Exception: pass
    return None, None


def commons_meta(fn):
    u = 'https://commons.wikimedia.org/w/api.php?' + urllib.parse.urlencode({'action': 'query', 'titles': 'File:' + fn, 'prop': 'imageinfo', 'iiprop': 'extmetadata|url', 'iiurlwidth': 320, 'format': 'json'})
    p = list(jget(u)['query']['pages'].values())[0]
    ii = (p.get('imageinfo') or [{}])[0]; em = ii.get('extmetadata') or {}
    g = lambda k: re.sub(r'<[^>]+>', '', (em.get(k) or {}).get('value', '')).strip()
    return {'file': fn, 'thumb': ii.get('thumburl', ''), 'page': ii.get('descriptionurl', ''), 'artist': g('Artist')[:120], 'lic': g('LicenseShortName')[:60], 'licurl': g('LicenseUrl')}


def sentence(text, y):
    for s in re.split(r'(?<=[.!?])\s+', text.replace('\n', ' ')):
        if str(y) in s: return s.strip()[:400]
    return ''


FREE = re.compile(r'^(CC0|CC BY(-SA)? [\d.]+|Public domain|PD|Domaine public|CC BY-SA [\d.]+( \w+)?|CC BY [\d.]+( \w+)?|GFDL|FAL|Attribution|Copyrighted free use|No restrictions)', re.I)
rows, skipped = [], []
for name, title, kind in ITEMS:
    if any(n in fold(name) for n in NOUVEAUTES): skipped.append([name, 'déjà dans « Les nouveautés »']); continue
    w = wp(title)
    if not w or not w['q']: skipped.append([name, 'pas d’article Wikipédia (%s)' % title]); continue
    ent = list(jget(f'https://www.wikidata.org/wiki/Special:EntityData/{w["q"]}.json')['entities'].values())[0]
    veh = kind in ('voiture', 'deux-roues')
    y, pr = claim_year(ent, ['P571', 'P577', 'P2754', 'P729', 'P1619'] + (['P580'] if veh else []))
    sent = sentence(w['text'], y) if y else ''
    if not sent and not (y and veh and pr in ('P2754', 'P729', 'P580')):
        # l'année doit être confirmée par la phrase de Wikipédia ; sinon la phrase de l'introduction qui dit la naissance
        m = None
        for st in re.split(r'(?<=[.!?])\s+', w['text'].replace('\n', ' ')):
            m = re.search(r'(fond|cré|lanc|commercialis|produit|fabriqu|sorti|présent|apparu|inventé|déposé)\w*\s+(?:\S+\s+){0,3}?(?:en |de |depuis |dès |entre |le |à partir de )(?:\d{1,2}(?:er)? )?(?:janvier |février |mars |avril |mai |juin |juillet |août |septembre |octobre |novembre |décembre )?(1[89]\d\d)\b', st, re.I)
            if m: sent = st.strip()[:400]; y, pr = int(m.group(2)), 'wikipedia'; break
        if not m: skipped.append([name, 'année non confirmée par Wikipédia (%s)' % w['q']]); continue
    img = None
    for pp in ('P18', 'P154'):
        cl = ent.get('claims', {}).get(pp, [])
        if cl:
            try:
                m = commons_meta(cl[0]['mainsnak']['datavalue']['value'])
                if FREE.search(m['lic'] or '') and m['thumb']: img = m; break
            except Exception as e: print('! image', name, e)
    lab = (ent.get('labels', {}).get('fr') or {}).get('value') or name
    r = {'n': lab, 'k': kind, 'y': y, 'p': pr, 'q': w['q'], 'wp': 'https://fr.wikipedia.org/wiki/' + urllib.parse.quote(w['title'].replace(' ', '_')), 'sentence': sent}
    if img: r['img'] = img
    rows.append(r)
    print(y, pr, lab, kind, 'img' if img else '-', '|', r['sentence'][:70])
rows.sort(key=lambda r: r['y'])
print(len(rows), 'gardés ;', len(skipped), 'écartés', skipped)
if '--check' not in sys.argv:
    write('l9a-marques', {'source': 'Wikidata (année, pays, image) et Wikipédia (fr) (la phrase de l’année) ; images de Wikimedia Commons', 'url': 'https://www.wikidata.org',
                          'licence': 'Wikidata : CC0 ; phrases de Wikipédia : CC BY-SA 4.0 ; chaque image : auteur et licence écrits sur Commons (licences libres seulement)',
                          'built': today(), 'skipped': skipped, 'rows': rows})
