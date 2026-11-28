"""⚖️ Les règles de sa vie — fabrique assets/data/l10-regles.json.gz (coutumes, temps clos, sel, vents, modèles d'écriture, pays).
Chaque phrase citée est vérifiée MOT POUR MOT dans le texte de la page source téléchargée (sinon : arrêt).
Sources (lues le 2026-11-25) :
  - Wikipédia en français (CC BY-SA 4.0) : Droit écrit, Droit coutumier en France, Ancien Droit, Coutume de Normandie, de Bretagne, du Maine,
    de Bourbonnais, d'Auvergne, de Paris, de Sens, de Sedan, Coutumes de Toulouse, Système à maison, Loi du 17 nivôse an II, Gabelle du sel,
    et les articles des vents (Mistral, Tramontane, Vent d'autan, Galerne…) ;
  - Wikisource (texte du domaine public, page CC BY-SA 4.0) : Dictionnaire de théologie catholique, « Bénédiction nuptiale » (1905) ;
    Mémoires de Madame d'Épinay (1865) ;
  - Wikimedia Commons : cartes et modèles d'écriture (licence de chaque fichier, relevée par l'API) ;
  - Wikidata (CC0) : les régions naturelles de France (« pays »), leurs départements, leurs communes quand elles sont reliées.
Lancer : L10_CACHE=… python3 build_regles.py  (fetch_wp_list.py et les requêtes Wikidata/Commons doivent avoir tourné avant ; tout est en cache)."""
import gzip, json, os, re, sys, urllib.parse as u
from fetch import get_json
from wd import sparql
RAW = '/tmp/claude-0/-home-user-lcnda/ad8201b5-1353-5614-bebe-2d8bd96b57cd/scratchpad/l10/raw'
WP = RAW + '/wp'
READ = '2026-11-25'

def wp(title):
    d = json.load(open(f'{WP}/{title}.json'))
    d['norm'] = re.sub(r'\s+', ' ', d['text'])
    return d

def q(title, sentence):
    """la phrase exacte d'un article (vérifiée), avec son lien"""
    d = wp(title)
    if re.sub(r'\s+', ' ', sentence) not in d['norm']:
        sys.exit(f'Phrase introuvable dans « {title} » : {sentence[:80]}…')
    return {'q': sentence, 'url': d['url'], 'title': f"Wikipédia, « {d['title']} »", 'rev': d['rev']}

# ═════ ⚖️ la coutume ═════
DE = 'Droit écrit'
regimes = {
    'ecrit': {'label': 'pays de droit écrit', 'color': '#c0392b',
              'rule': 'On y suivait le droit romain : le père pouvait, par testament, avantager un enfant.',
              **q(DE, "Le droit écrit est, au sens strict, un terme désignant le régime juridique de certains pays du royaume de France d'avant la Révolution française, qui se trouvaient au sud d'une ligne qui reliait La Rochelle à Genève et qui appliquaient le ius commune à titre principal, fortement inspiré du droit romain.")},
    'coutume': {'label': 'pays de coutume', 'color': '#2e86c1',
                'rule': 'On y suivait la coutume de la province, rédigée au XVIe siècle : chacune avait ses règles pour l’héritage.',
                **q(DE, "On oppose cette notion à celle de droit coutumier, qui désignait le régime dans la moitié nord de la France selon lequel la coutume très variable, inspirée des coutumes germaniques, dominait et le ius commune ne s'appliquait qu'à titre subsidiaire pour combler le silence des coutumes.")},
}
# la province en 1789 (atlas d'Ancien Régime, couche « p ») → le régime, d'après la ligne La Rochelle–Genève (indication)
ECRIT = ['Provence', 'Dauphiné', 'Languedoc', 'Guyenne', 'Gascogne', 'Béarn', 'Foix', 'Roussillon', 'Lyonnais', 'Limousin']
MIXTE = {'Auvergne': "Des lieux qui, se régissent par Droit écrit, se sont soumis à quelques dispositions de la Coutume, ou qui, se régissent par Coutume, ont adopté, pour certaines matières, le Droit écrit.",
         'Saintonge': None, 'Bourgogne': None}
COUTUME = ['Alsace', 'Angoumois', 'Anjou', 'Artois', 'Aunis', 'Barrois', 'Berry', 'Bourbonnais', 'Bretagne', 'Cambrésis', 'Champagne', 'Clermontois', 'Flandre',
           'Franche-Comté', 'Hainaut', 'Lorraine', 'Maine', 'Marche', 'Nivernais', 'Normandie', 'Orléanais', 'Perche', 'Picardie', 'Poitou', 'Saumurois', 'Touraine', 'Trois-Évêchés', 'Île-de-France']
provinces = {p: 'ecrit' for p in ECRIT} | {p: 'coutume' for p in COUTUME} | {p: 'mixte' for p in MIXTE}
mixte_q = {'Auvergne': {**q("Coutume d'Auvergne", MIXTE['Auvergne'])}}
regimes['mixte'] = {'label': 'pays mixte (coutume et droit écrit)', 'color': '#8e44ad',
                    'rule': 'La limite entre coutume et droit écrit passait dans la province : selon la paroisse, l’une ou l’autre.', **q(DE, regimes['ecrit']['q'])}
named = [
    {'id': 'normandie', 'n': 'Coutume de Normandie', 'layer': 'p', 'names': ['Normandie'], **q('Coutume de Normandie', "Le système de succession excluait les filles en raison de leur impossibilité de transmettre les fiefs dans la famille et accorde une place privilégiée à l’aîné qui était seul héritier."),
     'more': [q('Coutume de Normandie', "La coutume en vigueur dans le bailliage de Caux laissait les parents décider librement d'attribuer un tiers de la succession aux frères puînés."),
              q('Coutume de Normandie', "Pour ce qui est du rôle des femmes, la coutume de Caux prescrit la garde des sœurs non mariées à l'aîné, dont la dot était constituée sur les biens meubles laissé à cet effet par les parents.")], 'partage': True},
    {'id': 'bretagne', 'n': 'Coutume de Bretagne', 'layer': 'p', 'names': ['Bretagne'], **q('Coutume de Bretagne', "Cet écrit se fonde sur la pratique juridique coutumière, mais emprunte également au droit romain, ainsi qu'à des coutumes d'autres territoires, notamment la coutume du Maine et celle du comté d'Anjou, limitrophes du duché de Bretagne.")},
    {'id': 'maine', 'n': 'Coutume du Maine', 'layer': 'p', 'names': ['Maine'], **q('Coutume du Maine', "La Coutume du Maine est un système légal apparu dans le comté du Maine au début du Moyen Âge, puis dans la Province du Maine à partir du XVe siècle.")},
    {'id': 'bourbonnais', 'n': 'Coutume de Bourbonnais', 'layer': 'p', 'names': ['Bourbonnais'], **q('Coutume de Bourbonnais', wp('Coutume de Bourbonnais')['norm'].split('. ')[0] + '.')},
    {'id': 'auvergne', 'n': 'Coutume d’Auvergne', 'layer': 'p', 'names': ['Auvergne'], **q("Coutume d'Auvergne", "La Coutume d'Auvergne est le recueil des lois civiles de la province d'Auvergne, rédigé par Antoine Duprat.")},
    {'id': 'paris', 'n': 'Coutume de Paris', 'layer': 'b', 'names': ['Prévôté et vicomté de Paris hors les murs', 'Prévôté et vicomté de Paris, ville et faubourgs'], **q('Coutume de Paris', wp('Coutume de Paris')['norm'].split('. ')[0] + '.'),
     'more': [q('Coutume de Paris', "Le Code civil des Français de 1804 reprend un grand nombre de dispositions de la Coutume de Paris, notamment tous les articles sur les droits réels (servitudes, vues, mitoyenneté, clôtures, baux locatifs, réparations…) et certaines dispositions en matière de droit de la famille (biens en communauté, testaments…).")]},
    {'id': 'sens', 'n': 'Coutume de Sens', 'layer': 'b', 'names': ['Bailliage de Sens'], **q('Coutume de Sens', "La coutume de Sens désigne l'ensemble des règles de droit coutumier qui régissaient les rapports juridiques, économiques, familiaux et sociaux des habitants du Bailliage de Sens, territoire de l'ancien peuple gallo-romaine des Sénons qui se retrouvait dans le duché de Bourgogne."),
     'more': [q('Coutume de Sens', "Cette influence se constate dans certaines dispositions relatives à la noblesse permettant une transmission en ligne féminine (exceptionnelle en France).")]},
    {'id': 'sedan', 'n': 'Coutume de Sedan', 'layer': 'b', 'names': ['Bailliage de Sedan'], **q('Coutume de Sedan', wp('Coutume de Sedan')['norm'].split('. ')[0] + '.')},
    {'id': 'toulouse', 'n': 'Coutumes de Toulouse', 'layer': 'b', 'names': ['Sénéchaussée de Toulouse'], **q('Coutumes de Toulouse', "Ils sont répartis en quatre titres : le premier est relatif aux règles de procédures ; le deuxième, aux contrats ; le troisième, aux régimes matrimoniaux et aux successions ; et le quatrième, aux biens et aux tenures.")},
]
partage = {
    'coutume': [q('Droit coutumier en France', "En droit français, l'adage paterna paternis, materna maternis est une survivance d'une règle coutumière qui voulait que les biens d'un défunt retournassent lors de la succession dans sa famille par le sang."),
                q('Ancien Droit', "Cette grande diversité avait des conséquences fortes : la majorité d'un individu n'était pas fixée au même âge selon qu'on se trouvât en Anjou ou en Bourgogne, de même que les successions n'étaient pas réglementées de la même manière en Touraine et en Bourbonnais.")],
    'ecrit': [q('Famille souche', "Les historiens ont aussi identifié de tels systèmes, souvent moins purs, dans un grand quart sud-ouest et dans une moindre mesure le sud-est de la France, l’entité « maison » pouvant prendre des noms locaux variés : etxe au Pays basque, maysou ou domus en pays gascon, oustal dans le Rouergue et la Lozère, casa en Provence."),
              q('Famille souche', "Le concept de famille souche a été forgé par Frédéric Le Play au XIXe siècle pour décrire un mode de dévolution préciputaire (c’est-à-dire à héritier unique) des biens, matériels et éventuellement non matériels, les enfants exclus de l’héritage étant dédommagés par différents moyens (par exemple la dot).")],
    'noble': [q("Droit d'aînesse", "En France, le droit d'aînesse s'appliquait uniquement aux familles nobles (même si des roturiers fortunés s'en prévalaient).")],
    'fin': [q('Loi du 17 nivôse an II', "La loi consiste à distribuer de manière parfaitement égale le patrimoine d'un parent défunt, et donc met fin à la primogéniture où seul l'aîné percevait les successions.")],
}

def commons_info(titles):
    out = {}
    for i in range(0, len(titles), 40):
        r = get_json('https://commons.wikimedia.org/w/api.php?action=query&prop=imageinfo&iiprop=extmetadata|url|size&iiurlwidth=800&titles=' + u.quote('|'.join(titles[i:i + 40])) + '&format=json', pause=2)
        for p in r['query']['pages'].values():
            ii = (p.get('imageinfo') or [{}])[0]; m = ii.get('extmetadata', {})
            g = lambda k: re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', '', m.get(k, {}).get('value', ''))).strip()
            if not ii: print('Commons : introuvable', p['title']); continue
            out[p['title']] = {'page': ii['descriptionurl'], 'thumb': ii.get('thumburl'), 'licence': g('LicenseShortName'), 'licence_url': m.get('LicenseUrl', {}).get('value', ''),
                               'author': g('Artist')[:120], 'date': g('DateTimeOriginal')[:40], 'desc': g('ImageDescription')[:300]}
    return out
MAPS = ['File:Carte de la France coutumière - indiquant le ressort des parlements et autres cours souveraines et les limites des pays de droit écrit et des pays coutumiers et le territoire des coutumes générales - dressée... - btv1b53035277n.jpg',
        'File:Carte du pays de droit coutumier et du pays de droit écrit (fr).png']
maps = commons_info(MAPS)
for t, v in maps.items(): assert re.search(r'Public domain|CC|PD', v['licence'], re.I), (t, v['licence'])

coutume = {'regimes': regimes, 'provinces': provinces, 'mixte': mixte_q, 'named': named, 'partage': partage,
           'maps': [{'title': 'Carte de la France coutumière (Klimrath, 1837 ; Gallica)', **maps[MAPS[0]]}, {'title': 'Pays de droit coutumier et pays de droit écrit (carte simplifiée)', **maps[MAPS[1]]}]}

# ═════ 💒 les temps clos ═════
dtc = json.loads(open(RAW + '/dtc-benediction.txt').read())
def ws(sentence, src):
    if sentence not in src['text']: sys.exit('Wikisource : phrase introuvable : ' + sentence[:70])
    return sentence
DTC_URL = 'https://fr.wikisource.org/wiki/Dictionnaire_de_th%C3%A9ologie_catholique/B%C3%89N%C3%89DICTION_NUPTIALE'
tempsclos = {
    'rule': {'q': ws("Elle ne doit pas être donnée aux mariages célébrés pendant les périodes de l’année qui vont du premier dimanche de l’Avent jusqu’au jour de l’Epiphanie inclusivement, et du mercredi des Cendres jusqu’au dimanche après Pâques. Ainsi ordonne le concile de Trente, qui ne tait d’ailleurs que renouveler sur ce point les anciennes règles canoniques.", dtc),
             'url': DTC_URL, 'title': 'Dictionnaire de théologie catholique, « Bénédiction nuptiale » (1905), sur Wikisource', 'rev': dtc['rev']},
    'dispense': {'q': ws("La dispense accordée par l’évêque de contracter mariage en temps prohibé n’entraîne pas l’autorisation de donner aux époux la bénédiction solennelle", dtc), 'url': DTC_URL,
                 'title': 'Dictionnaire de théologie catholique, « Bénédiction nuptiale » (1905), sur Wikisource'},
}

# ═════ 🧂 le sel de son vivant ═════
G = 'Gabelle du sel'
sel = {'after': [
    {'y1': 1806, 'y2': 1848, 't': 'Un impôt sur le sel existait de nouveau (rétabli en 1806 sous Napoléon Ier, supprimé en 1848).', **q(G, "Mais l’impôt sur le sel réapparut néanmoins en 1806, sous Napoléon Ier.")},
    {'y1': 1848, 'y2': 1848, 't': 'Le 15 avril 1848, le gouvernement provisoire supprime l’impôt sur le sel.', **q(G, "Sous la IIe République, le gouvernement provisoire supprime l'impôt sur le sel par un décret du 15 avril 1848.")},
    {'y1': 1849, 'y2': 1945, 't': 'Une taxe sur le sel reste due jusqu’au 31 décembre 1945.', **q(G, "Sous la IVe République, l'Assemblée constituante le supprime par la loi du 31 décembre 1945.")}],
    'before': [q(G, "En Bretagne, la livre de sel coûtait au plus un liard et demi (⅜ sous) quand dans le Maine « pays de gabelle », elle se payait 12 à 13 sous ; d'où la fréquence de la contrebande ou « faux-saunage ».")]}

# ═════ 🌬️ les vents ═════
VENTS = [  # article, nom, départements (d'après la phrase citée), phrase
    ('Mistral (vent)', 'le mistral', ['07', '26', '84', '13', '30', '34', '83', '04', '11'], "Il peut atteindre plus de 100 km/h en plaine, notamment dans la basse vallée du Rhône."),
    ('Tramontane', 'la tramontane', ['66', '11', '34'], "En Catalogne et en Languedoc, la tramontane est le vent du nord-nord-ouest provenant des massifs montagneux et soufflant en direction du golfe du Lion."),
    ("Vent d'autan", 'le vent d’autan', ['31', '81', '82', '11', '09', '12', '46', '32'], "Le vent d'autan (ou plus simplement l’autan) est un vent soufflant dans le sud et le sud-ouest de la France, en provenance de la direction « sud-est », affectant la partie orientale du Bassin aquitain et le sud-ouest du Massif central."),
    ('Galerne', 'la galerne', ['37', '18', '36', '79', '40', '85', '64', '46', '22', '29', '35', '56', '44'], "La galerne, galarne ou galerno, est un vent de nord-ouest (noroît) froid et humide qui souffle en rafale sur l'ouest de la France, notamment en Touraine, dans le Berry, les Deux-Sèvres, les Landes, la Vendée, au Pays basque (où il porte le nom de enbata ou brouillarta), le Quercy et la Bretagne (où il porte le nom de gwalarn) ainsi que de la mer Cantabrique et ses côtes, généralement au printemps et en automne."),
    ('Burle (vent)', 'la burle', ['43', '07', '42'], "La burle est le nom donné au vent du Nord qui souffle l'hiver dans le centre-sud de la France à l'est du Massif central sur les plateaux dénudés du Velay, d'Ardèche ou des monts du Forez."),
    ('Bise (vent)', 'la bise', ['69', '67', '68', '25', '39', '70', '90', '54', '55', '57', '88', '74', '01'], "La bise est un vent froid et sec de secteur nord à nord-est qui souffle sur l'Allemagne, le plateau suisse, le bassin lémanique ainsi qu'en région lyonnaise, en plaine d'Alsace, en Franche-Comté et en Lorraine."),
    ('Cers (vent)', 'le cers', ['11', '34', '66'], "Le cers (en catalan : el Cerç ; en occitan : lo Cèrç) est un vent venant du nord-ouest de Narbonne, parfois très violent, soufflant dans le Languedoc près de la côte méditerranéenne."),
    ('Marin (vent)', 'le marin', ['11', '34', '30', '13', '84', '04', '83'], "Le marin est un vent de secteur sud ou sud-est qui souffle sur le golfe du Lion et la Provence."),
    ('Lombarde (vent)', 'la lombarde', ['04', '05', '73'], "Il souffle principalement en Ubaye, sur le Queyras et en Maurienne."),
    ('Joran', 'le joran', ['01', '74', '39', '25'], "Le joran désigne l'ensemble des vents du nord-ouest qui soufflent sur le sud du massif du Jura, sur le lac Léman, le lac de Neuchâtel et le lac de Bienne."),
    ('Suroît (vent)', 'le suroît', ['64', '40', '33', '17', '85', '44', '56', '29', '22', '35', '50', '14', '76'], "Le suroît est le nom donné par les marins au vent de sud-ouest sur les côtes de la Manche et de l'Atlantique."),
    ('Traverse (vent)', 'la traverse', ['15', '43', '63', '69', '39', '73', '38'], "La traverse est un vent d'ouest ou de nord-ouest dans le Jura, le Massif central, les Alpes, et la région lyonnaise."),
    ('Balaguère', 'la balaguère', ['64'], "Le vent prend source dans les gorges du Pont d'enfer et Portalet, et sa zone d'influence recouvre le Béarn."),
    ('Libeccio', 'le libeccio', ['2A', '2B', '06'], "Le libeccio est un vent de secteur ouest à sud-ouest soufflant sur la Corse et la Côte d’Azur."),
    ('Levant (vent)', 'le levant', ['04', '05', '13', '83', '06', '66', '2A', '2B'], "En France, il souffle sur les Alpes du sud, la Provence, la Côte d'Azur, le Roussillon (llevant) et la Corse (levante)."),
    ('Foehn', 'le foehn', ['74', '73'], "Le foehn, fœhn ou föhn (prononcé /føn/ ; du suisse-allemand Föhn, prononcé /føːn/) est un vent sec et chaud de secteur sud, qui souffle en général en automne et à la fin de l'hiver / début du printemps, au nord des Alpes, en France, en Italie, en Suisse et en Autriche."),
    ('Largade', 'la largade', ['34', '11'], "La largade (ou l'argade) est un vent marin venant du large, soufflant dans le golfe du Lion, en Méditerranée."),
]
titles = [wp(a)['title'] for a, *_ in VENTS]
pp = get_json('https://fr.wikipedia.org/w/api.php?action=query&prop=pageprops&ppprop=wikibase_item&redirects=1&titles=' + u.quote('|'.join(titles)) + '&format=json', pause=4)
qid = {p['title']: p.get('pageprops', {}).get('wikibase_item', '') for p in pp['query']['pages'].values()}
vents = []
for a, n, deps, s in VENTS:
    d = wp(a); first = d['norm'].split('. ')[0] + '.'
    vents.append({'n': n, 'deps': deps, 'qid': qid.get(d['title'], ''), 'what': q(a, first)['q'] if first != s else '', **q(a, s)})

# ═════ 🖋️ les modèles d'écriture (Commons) ═════
ECR = [('File:LaRue 1569.jpg', 1569, 'Jacques de La Rue', 'modèle de lettres (1569)'),
       ('File:Le Gangneur - Lettre courante.jpg', 1600, 'Guillaume Le Gangneur', 'lettre courante'),
       ('File:Pierrelebé.jpg', 1601, 'Pierre Le Bé', 'page de « Béle prairie »'),
       ('File:Materot - Chanceleresque.jpg', 1608, 'Lucas Materot', 'chancelière (chancelleresque)'),
       ('File:Lucas Materot.png', 1608, 'Lucas Materot', 'page des « Œuvres » (Avignon)'),
       ('File:Louis Barbedor, Paris 1647.jpg', 1647, 'Louis Barbedor', 'financière et italienne-bâtarde'),
       ('File:Barbedor 1659.jpg', 1659, 'Louis Barbedor', 'exemple d’écriture'),
       ('File:Lesgret 1694.jpg', 1694, 'Nicolas Lesgret', 'exemple d’écriture'),
       ('File:Royllet - NouveauxPrincipes2.jpg', 1731, 'Sébastien Royllet', '« Nouveaux principes d’écriture »'),
       ('File:EcritureRonde-Encyclopedie.jpg', 1765, 'planche de l’Encyclopédie', 'écriture ronde'),
       ('File:EcritureBatarde-Encyclopedie.jpg', 1765, 'planche de l’Encyclopédie', 'écriture bâtarde'),
       ('File:EcritureCoulee-Encyclopedie.jpg', 1765, 'planche de l’Encyclopédie', 'écriture coulée'),
       ('File:Bedigis154.png', 1768, 'François-Nicolas Bédigis', '« L’art d’écrire »'),
       ('File:Bourgoin - Expédiée.jpg', 1810, 'Alexandre Bourgoin', 'écriture expédiée'),
       ('File:Silvestre2.png', 1843, 'Joseph-Balthazar Silvestre', 'alphabet de l’« Alphabet-album »')]
info = commons_info([e[0] for e in ECR])
ecritures = []
for t, y, who, what in ECR:
    i = info.get(t)
    if not i or not re.search(r'public domain|^CC|PD', i['licence'], re.I): print('écarté (licence) :', t, i and i['licence']); continue
    ecritures.append({'y': y, 'who': who, 'what': what, 'file': t[5:], **{k: i[k] for k in ('page', 'thumb', 'licence', 'licence_url', 'date')}})

# ═════ 🏞️ les pays (régions naturelles, Wikidata) ═════
P = json.load(open(RAW + '/pays.json'))
pays, links = [], {}
for x in P['R']:
    qq = x['r']['value'].rsplit('/', 1)[1]; c = x.get('coord', {}).get('value', '')
    m = re.match(r'Point\(([-\d.]+) ([-\d.]+)\)', c)
    lab = x['rLabel']['value']
    if re.match(r'^Q\d+$', lab): continue
    pays.append({'q': qq, 'n': lab, 'd': x.get('rDescription', {}).get('value', ''), 'lat': round(float(m.group(2)), 4) if m else None, 'lon': round(float(m.group(1)), 4) if m else None,
                 'deps': sorted(set(x['deps']['value'].split())) if x['deps']['value'] else [], 'wp': x.get('art', {}).get('value', '')})
for x in P['C']:
    links.setdefault(x['insee']['value'], set()).add(x['r']['value'].rsplit('/', 1)[1])
known = {p['q'] for p in pays}
links = {k: sorted(v & known) for k, v in links.items() if v & known}

data = {'v': 1, 'built': READ, 'coutume': coutume, 'tempsclos': tempsclos, 'sel': sel, 'vents': vents, 'ecritures': ecritures, 'pays': pays, 'pays_links': links,
        'src': {'wikipedia': {'licence': 'CC BY-SA 4.0', 'url': 'https://fr.wikipedia.org/', 'read': READ}, 'wikidata': {'licence': 'CC0 1.0', 'url': 'https://www.wikidata.org/wiki/Q572995', 'read': READ}}}
dst = os.path.join(os.path.dirname(__file__), '../../assets/data/l10-regles.json.gz')
with gzip.open(dst, 'wt', encoding='utf-8') as f: json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
print('ok', os.path.getsize(dst), 'octets ;', len(named), 'coutumes,', len(vents), 'vents,', len(ecritures), 'écritures,', len(pays), 'pays,', len(links), 'communes reliées')
