#!/usr/bin/env python3
"""🐦 Les oiseaux de son village + 🌼 les fleurs sauvages de son pays : les espèces communes des campagnes françaises.
La liste (noms français et latins) est choisie ici ; GBIF (api.gbif.org, « species/match ») donne la clé de chaque espèce,
Wikidata (CC0, propriété P846 = clé GBIF) l'article de Wikipédia et une image de Commons (auteur et licence relus sur Commons).
Dans l'app : on demande en ligne à GBIF quelles de ces espèces ont été vues près de la commune (jeux de données CC0 / CC BY seulement),
puis, pour les oiseaux, un chant sur xeno-canto (avec la clé gratuite de l'utilisateur).
Sortie : assets/data/l9a-nature.json.gz
"""
import re, urllib.parse
from common import jget, sparql, write, today

BIRDS = [  # [latin, français, milieu]
    ['Erithacus rubecula', 'Rouge-gorge familier', 'jardins, haies'], ['Turdus merula', 'Merle noir', 'jardins, haies'], ['Parus major', 'Mésange charbonnière', 'jardins, bois'],
    ['Cyanistes caeruleus', 'Mésange bleue', 'jardins, bois'], ['Fringilla coelebs', 'Pinson des arbres', 'bois, vergers'], ['Passer domesticus', 'Moineau domestique', 'villages, fermes'],
    ['Hirundo rustica', 'Hirondelle rustique', 'fermes, étables'], ['Delichon urbicum', 'Hirondelle de fenêtre', 'villages'], ['Apus apus', 'Martinet noir', 'villages, clochers'],
    ['Alauda arvensis', 'Alouette des champs', 'champs'], ['Coturnix coturnix', 'Caille des blés', 'champs de blé'], ['Perdix perdix', 'Perdrix grise', 'champs'],
    ['Alectoris rufa', 'Perdrix rouge', 'champs, garrigues'], ['Phasianus colchicus', 'Faisan de Colchide', 'champs, bois'], ['Cuculus canorus', 'Coucou gris', 'bois, prés'],
    ['Streptopelia turtur', 'Tourterelle des bois', 'haies, bois'], ['Columba palumbus', 'Pigeon ramier', 'bois, champs'], ['Picus viridis', 'Pic vert', 'vergers, prés'],
    ['Dendrocopos major', 'Pic épeiche', 'bois'], ['Sitta europaea', 'Sittelle torchepot', 'bois'], ['Troglodytes troglodytes', 'Troglodyte mignon', 'haies, bois'],
    ['Luscinia megarhynchos', 'Rossignol philomèle', 'haies, bosquets'], ['Sylvia atricapilla', 'Fauvette à tête noire', 'haies, jardins'], ['Phylloscopus collybita', 'Pouillot véloce', 'bois'],
    ['Oriolus oriolus', 'Loriot d’Europe', 'peupleraies, bois'], ['Sturnus vulgaris', 'Étourneau sansonnet', 'prés, villages'], ['Pica pica', 'Pie bavarde', 'villages, champs'],
    ['Garrulus glandarius', 'Geai des chênes', 'bois'], ['Corvus corone', 'Corneille noire', 'champs'], ['Corvus monedula', 'Choucas des tours', 'clochers, falaises'],
    ['Carduelis carduelis', 'Chardonneret élégant', 'vergers, friches'], ['Linaria cannabina', 'Linotte mélodieuse', 'landes, friches'], ['Chloris chloris', 'Verdier d’Europe', 'jardins'],
    ['Serinus serinus', 'Serin cini', 'villages, jardins'], ['Emberiza citrinella', 'Bruant jaune', 'haies, champs'], ['Emberiza cirlus', 'Bruant zizi', 'haies, vignes'],
    ['Motacilla alba', 'Bergeronnette grise', 'fermes, rivières'], ['Upupa epops', 'Huppe fasciée', 'vergers, prés'], ['Merops apiaster', 'Guêpier d’Europe', 'rivières, sablières'],
    ['Alcedo atthis', 'Martin-pêcheur d’Europe', 'rivières, étangs'], ['Ardea cinerea', 'Héron cendré', 'rivières, étangs'], ['Gallinula chloropus', 'Gallinule poule-d’eau', 'étangs, mares'],
    ['Anas platyrhynchos', 'Canard colvert', 'étangs, rivières'], ['Vanellus vanellus', 'Vanneau huppé', 'prés humides'], ['Ciconia ciconia', 'Cigogne blanche', 'prés, villages (Alsace…)'],
    ['Buteo buteo', 'Buse variable', 'champs, bois'], ['Falco tinnunculus', 'Faucon crécerelle', 'champs, clochers'], ['Tyto alba', 'Effraie des clochers', 'granges, clochers'],
    ['Athene noctua', 'Chevêche d’Athéna', 'vergers, fermes'], ['Strix aluco', 'Chouette hulotte', 'bois'], ['Otus scops', 'Petit-duc scops', 'villages du Midi'],
    ['Caprimulgus europaeus', 'Engoulevent d’Europe', 'landes'], ['Lanius collurio', 'Pie-grièche écorcheur', 'haies, prés'], ['Saxicola rubicola', 'Tarier pâtre', 'landes, prés'],
    ['Phoenicurus ochruros', 'Rougequeue noir', 'villages, murs'], ['Turdus philomelos', 'Grive musicienne', 'bois, jardins'], ['Aegithalos caudatus', 'Mésange à longue queue', 'haies, bois'],
    ['Larus ridibundus', 'Mouette rieuse', 'rivières, côtes'], ['Larus argentatus', 'Goéland argenté', 'côtes, ports'], ['Corvus frugilegus', 'Corbeau freux', 'champs'],
]
FLOWERS = [  # [latin, français, milieu, mois de floraison]
    ['Papaver rhoeas', 'Coquelicot', 'champs de blé', 'mai–juillet'], ['Centaurea cyanus', 'Bleuet', 'champs de blé', 'mai–juillet'], ['Agrostemma githago', 'Nielle des blés', 'champs de blé', 'juin–juillet'],
    ['Bellis perennis', 'Pâquerette', 'prés, pelouses', 'mars–octobre'], ['Taraxacum officinale', 'Pissenlit', 'prés', 'mars–mai'], ['Ranunculus acris', 'Bouton d’or', 'prés', 'mai–juillet'],
    ['Leucanthemum vulgare', 'Marguerite', 'prés', 'mai–juillet'], ['Primula veris', 'Coucou (primevère officinale)', 'prés, talus', 'mars–mai'], ['Primula vulgaris', 'Primevère acaule', 'haies, bois', 'février–mai'],
    ['Viola odorata', 'Violette odorante', 'haies, talus', 'février–avril'], ['Anemone nemorosa', 'Anémone des bois', 'bois', 'mars–avril'], ['Hyacinthoides non-scripta', 'Jacinthe des bois', 'bois', 'avril–mai'],
    ['Convallaria majalis', 'Muguet', 'bois', 'avril–mai'], ['Ficaria verna', 'Ficaire', 'haies, bois humides', 'mars–avril'], ['Galanthus nivalis', 'Perce-neige', 'bois humides', 'janvier–mars'],
    ['Narcissus pseudonarcissus', 'Jonquille (narcisse jaune)', 'prés, bois', 'mars–avril'], ['Cardamine pratensis', 'Cardamine des prés', 'prés humides', 'avril–mai'],
    ['Lychnis flos-cuculi', 'Fleur de coucou (lychnis)', 'prés humides', 'mai–juillet'], ['Caltha palustris', 'Populage des marais', 'fossés, marais', 'mars–mai'],
    ['Iris pseudacorus', 'Iris des marais', 'bords de l’eau', 'mai–juin'], ['Lythrum salicaria', 'Salicaire', 'bords de l’eau', 'juin–septembre'], ['Nymphaea alba', 'Nénuphar blanc', 'étangs', 'juin–août'],
    ['Digitalis purpurea', 'Digitale pourpre', 'lisières, landes', 'juin–août'], ['Calluna vulgaris', 'Bruyère commune', 'landes', 'août–octobre'], ['Ulex europaeus', 'Ajonc d’Europe', 'landes', 'février–mai'],
    ['Cytisus scoparius', 'Genêt à balais', 'landes, talus', 'avril–juin'], ['Lotus corniculatus', 'Lotier corniculé', 'prés', 'mai–septembre'], ['Trifolium pratense', 'Trèfle des prés', 'prés', 'mai–septembre'],
    ['Achillea millefolium', 'Achillée millefeuille', 'prés, chemins', 'juin–octobre'], ['Daucus carota', 'Carotte sauvage', 'friches, chemins', 'juin–septembre'], ['Cichorium intybus', 'Chicorée sauvage', 'chemins', 'juillet–septembre'],
    ['Malva sylvestris', 'Mauve sylvestre', 'chemins, villages', 'juin–septembre'], ['Convolvulus arvensis', 'Liseron des champs', 'champs, chemins', 'juin–septembre'], ['Silene latifolia', 'Compagnon blanc', 'champs, haies', 'mai–septembre'],
    ['Silene dioica', 'Compagnon rouge', 'haies, bois', 'avril–juin'], ['Geranium robertianum', 'Herbe à Robert', 'murs, haies', 'avril–octobre'], ['Lamium album', 'Lamier blanc (ortie blanche)', 'haies', 'avril–octobre'],
    ['Glechoma hederacea', 'Lierre terrestre', 'haies, prés', 'mars–mai'], ['Veronica chamaedrys', 'Véronique petit-chêne', 'haies, prés', 'avril–juin'], ['Myosotis arvensis', 'Myosotis des champs', 'champs', 'avril–septembre'],
    ['Symphytum officinale', 'Consoude', 'prés humides', 'mai–juillet'], ['Echium vulgare', 'Vipérine', 'talus secs', 'juin–septembre'], ['Verbascum thapsus', 'Bouillon-blanc', 'talus, friches', 'juin–septembre'],
    ['Hypericum perforatum', 'Millepertuis', 'talus, lisières', 'juin–septembre'], ['Origanum vulgare', 'Origan', 'talus secs', 'juillet–septembre'], ['Thymus serpyllum', 'Serpolet', 'pelouses sèches', 'juin–septembre'],
    ['Lavandula angustifolia', 'Lavande vraie', 'garrigues, montagne du Midi', 'juin–août'], ['Cistus albidus', 'Ciste cotonneux', 'garrigues', 'avril–juin'], ['Orchis mascula', 'Orchis mâle', 'prés, bois', 'avril–juin'],
    ['Ophrys apifera', 'Ophrys abeille', 'pelouses calcaires', 'mai–juin'], ['Gentiana lutea', 'Grande gentiane', 'prés de montagne', 'juin–août'], ['Arnica montana', 'Arnica', 'prés de montagne', 'juin–août'],
    ['Leontopodium nivale', 'Edelweiss', 'haute montagne', 'juillet–août'], ['Rosa canina', 'Églantier', 'haies', 'mai–juin'], ['Prunus spinosa', 'Prunellier', 'haies', 'mars–avril'],
    ['Crataegus monogyna', 'Aubépine', 'haies', 'avril–mai'], ['Sambucus nigra', 'Sureau noir', 'haies, villages', 'mai–juin'], ['Lonicera periclymenum', 'Chèvrefeuille des bois', 'haies, bois', 'juin–septembre'],
    ['Clematis vitalba', 'Clématite des haies (herbe aux gueux)', 'haies', 'juin–septembre'], ['Tussilago farfara', 'Tussilage (pas-d’âne)', 'talus argileux', 'février–avril'],
]


def gbif_key(sci):
    j = jget('https://api.gbif.org/v1/species/match?' + urllib.parse.urlencode({'name': sci, 'strict': 'true'}))
    if j.get('matchType') not in ('EXACT', 'FUZZY') or not j.get('usageKey'): return None, None
    return j.get('speciesKey') or j['usageKey'], j.get('canonicalName')


def commons(files):
    out = {}
    for i in range(0, len(files), 40):
        u = 'https://commons.wikimedia.org/w/api.php?' + urllib.parse.urlencode({'action': 'query', 'titles': '|'.join('File:' + f for f in files[i:i + 40]), 'prop': 'imageinfo', 'iiprop': 'extmetadata|url', 'iiurlwidth': 320, 'format': 'json'})
        q = jget(u)['query']
        norm = {n['to']: n['from'] for n in q.get('normalized', [])}
        for p in q['pages'].values():
            ii = (p.get('imageinfo') or [{}])[0]; em = ii.get('extmetadata') or {}
            g = lambda k: re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', '', (em.get(k) or {}).get('value', ''))).strip()
            out[norm.get(p['title'], p['title'])[5:]] = {'thumb': ii.get('thumburl', ''), 'page': ii.get('descriptionurl', ''), 'artist': g('Artist')[:120], 'lic': g('LicenseShortName')[:60]}
    return out


FREE = re.compile(r'^(CC0|CC BY(-SA)? [\d.]+|Public domain|PD\b|CC BY-SA [\d.]+|CC BY [\d.]+|Attribution|No restrictions|Copyrighted free use)', re.I)


def build(lst, extra_keys):
    rows = []
    for it in lst:
        k, can = gbif_key(it[0])
        if not k: print('! GBIF', it[0]); continue
        rows.append({'sci': it[0], 'fr': it[1], 'mil': it[2], **({'mois': it[3]} if len(it) > 3 else {}), 'key': int(k)})
    keys = ' '.join(f'"{r["key"]}"' for r in rows)
    res = sparql('SELECT ?t ?k ?img ?fr WHERE { VALUES ?k { %s } ?t wdt:P846 ?k . OPTIONAL { ?t wdt:P18 ?img } OPTIONAL { ?a schema:about ?t ; schema:isPartOf <https://fr.wikipedia.org/> ; schema:name ?fr } }' % keys)
    by = {}
    for x in res: by.setdefault(x['k']['value'], x)
    files = []
    for r in rows:
        x = by.get(str(r['key']))
        if not x: continue
        r['q'] = x['t']['value'].rsplit('/', 1)[1]
        if 'fr' in x: r['wp'] = 'https://fr.wikipedia.org/wiki/' + urllib.parse.quote(x['fr']['value'].replace(' ', '_'))
        if 'img' in x: r['_f'] = urllib.parse.unquote(x['img']['value'].rsplit('/', 1)[1]); files.append(r['_f'])
    meta = commons(files)
    for r in rows:
        f = r.pop('_f', None)
        m = meta.get(f) if f else None
        if m and m['thumb'] and FREE.search(m['lic'] or ''): r['img'] = {'file': f, **m}
    return rows


birds, flowers = build(BIRDS, []), build(FLOWERS, [])
print(len(birds), 'oiseaux ;', len(flowers), 'fleurs ;', sum(1 for r in birds + flowers if 'img' in r), 'images')
write('l9a-nature', {'source': 'Liste choisie des espèces communes des campagnes de France ; clés GBIF (api.gbif.org) ; Wikidata (CC0) ; images de Wikimedia Commons',
                     'url': 'https://www.gbif.org', 'licence': 'Wikidata : CC0 ; chaque image : auteur et licence écrits sur Commons ; observations GBIF lues en ligne (jeux de données CC0 et CC BY 4.0 seulement)',
                     'built': today(), 'birds': birds, 'flowers': flowers})
