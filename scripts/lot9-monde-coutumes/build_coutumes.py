"""Les textes sourcés du lot 9 → assets/data/l9b-coutumes.json.gz (🛠️ compagnons, 🎖️ décorations, 👶 nourrices, ⚰️ deuil, 💍 mariage,
🚧 octroi, 🕯️ éclairage, 🧂 gabelle) et assets/data/l9b-voyages.json.gz (🐎 grands voyages).
Règle : chaque phrase affichée vient d'un texte téléchargé ici. Pour chaque fait on donne un « bout de phrase » ; le script retrouve
la phrase ENTIÈRE dans le texte de la source (Wikipédia, ou un livre du domaine public d'Internet Archive) et la garde mot pour mot,
avec l'adresse de la source. Si la phrase n'est plus dans la source, le script s'arrête (rien n'est inventé).
Sources : Wikipédia en français (CC BY-SA 4.0), Internet Archive (livres du domaine public : Ermance Dufaux, « Le savoir-vivre dans la
vie ordinaire et dans les cérémonies civiles et religieuses », Garnier, 1883 ; Paul Sébillot (1846-1918), « Coutumes populaires de la
Haute-Bretagne », Maisonneuve, 1886), Wikimedia Commons (images des décorations : auteur et licence de chacune), atlas d'Ancien Régime
déjà livré (assets/data/dp-ancien-regime.json.gz, CC BY-SA 4.0) pour les bailliages du pays de quart-bouillon.
Usage : python3 build_coutumes.py"""
import gzip, html, json, os, re, sys, unicodedata, urllib.parse
sys.path.insert(0, os.path.dirname(__file__))
import common

WP = {}
def wp(title):
    if title not in WP:
        t, rev, ti = common.wp_text(title)
        if not t:
            raise SystemExit('article vide : ' + title)
        WP[title] = (re.sub(r'[ \t]+', ' ', t), rev, ti)
    return WP[title]

def q(title, needle, anchor=''):
    """la phrase de l'article `title` qui contient `needle` → {q, url, title}"""
    t, rev, ti = wp(title)
    s = common.find_sentence(t, needle)
    return {'q': s, 'url': common.wp_url(ti, anchor=anchor), 'title': f'Wikipédia, « {ti} »'}

IA = {}
def ia_text(ident):
    if ident not in IA:
        page = common.get(f'https://archive.org/stream/{ident}/{ident}_djvu.txt')
        m = re.search(r'<pre[^>]*>(.*?)</pre>', page, re.S)
        raw = html.unescape(m.group(1))
        raw = re.sub(r'-\s*\n\s*', '', raw)  # les mots coupés en fin de ligne
        IA[ident] = re.sub(r'\s+', ' ', raw)
    return IA[ident]

def ia(ident, sentence, title, search=''):
    """la phrase doit être dans le texte du livre (titres courants des pages et tirets de fin de ligne mis à part)"""
    t = ia_text(ident)
    t = re.sub(r' (LE|LA|tE) (MARIAGE|iVIARIAGE) \S+ ', ' ', t).replace(' •', ' ')
    norm = lambda x: re.sub(r'\s+', ' ', x.replace('-', ''))
    s = re.sub(r'\s+', ' ', sentence)
    if norm(s) not in norm(t):
        raise SystemExit(f'introuvable dans {ident} : {s}')
    return {'q': s, 'url': f'https://archive.org/details/{ident}?q=' + urllib.parse.quote('"' + (search or s[:40]) + '"'), 'title': title}

def fold(s):
    s = unicodedata.normalize('NFD', s.lower())
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    return re.sub(r'[^a-z0-9]+', ' ', re.sub(r"[’']", ' ', s)).strip()

cc = json.load(gzip.open(os.path.join(common.ROOT, 'assets/data/cc-communes.json.gz')))['c']
BYNAME = {}
for insee, v in cc.items():
    BYNAME.setdefault(fold(v[0]), []).append(insee)

def commune(name, near=None, dep=None):
    """le code INSEE d'une commune par son nom ; plusieurs : celle du département donné, sinon la plus proche de `near`"""
    c = BYNAME.get(fold(name), [])
    if not c or (near and not dep):  # « Fains » : aussi « Fains-Véel » ; la plus proche de l'étape d'avant l'emporte
        c = c + [i for k, v in BYNAME.items() if k.startswith(fold(name) + ' ') for i in v]
    if dep:
        c = [i for i in c if i.startswith(dep)]
    if len(c) > 1 and near:
        la, lo = near
        c.sort(key=lambda i: (cc[i][1] - la) ** 2 + (cc[i][2] - lo) ** 2)
    if not c:
        return None
    i = c[0]
    return {'insee': i, 'n': cc[i][0], 'lat': cc[i][1], 'lon': cc[i][2]}

out = {'v': 1, 'built': __import__('datetime').date.today().isoformat()}

# ═════════ 🛠️ compagnons ═════════
C = 'Compagnonnage'
out['compagnons'] = {
    'short': 'Les compagnons apprenaient leur métier en voyageant de ville en ville : le « tour de France ».',
    'src': {'title': 'Wikipédia, « Compagnonnage »', 'url': common.wp_url(C)},
    'trades': [{'w': [fold(x) for x in ws]} for ws in [['charpentier', 'charpentiers', 'maitre charpentier'], ['menuisier', 'menuisiers', 'ebeniste'], ['macon', 'macons', 'maitre macon'],
               ['tailleur de pierre', 'tailleurs de pierre', 'tailleur de pierres'], ['couvreur', 'couvreurs'], ['cordonnier', 'cordonniers', 'bottier', 'cordonnier bottier'], ['tanneur', 'tanneurs', 'corroyeur'],
               ['doreur', 'doreurs'], ['serrurier', 'serruriers'], ['boulanger', 'boulangers'], ['sellier', 'selliers', 'bourrelier'], ['tapissier', 'tapissiers'], ['maroquinier', 'maroquiniers']]],
    'facts': [
        dict(t='Le compagnon se perfectionnait « sur le tour de France » puis devenait compagnon après un chef-d’œuvre.', **q(C, "Compagnon n'est pas un titre mais un état professionnel")),
        dict(t='Dans chaque ville, une maison de compagnons tenue par « la mère » l’accueillait.', **q(C, 'Au cours de son périple, il trouve partout une maison de compagnons')),
        dict(t='Les compagnons portaient un nom de compagnon, comme Agricol Perdiguier, « Avignonnais la Vertu ».', **q(C, 'Agricol Perdiguier, dit « Avignonnais la Vertu »')),
        dict(t='Les métiers : tailleurs de pierre, menuisiers, maçons, charpentiers, couvreurs, tanneurs, cordonniers, puis boulangers…', **q(C, 'les tanneurs, les charpentiers, les couvreurs et les tailleurs de pierre')),
        dict(t='Le compagnonnage décline dans la seconde moitié du XIXe siècle (usines, chemin de fer).', **q(C, 'La seconde moitié du XIXe siècle voit le déclin du compagnonnage')),
    ]}

# ═════════ 🎖️ décorations ═════════
DECOS = [
    ('legion', "Légion d'honneur", 1802, 'La plus haute décoration française, pour les militaires comme pour les civils.', "Ordre national de la Légion d'honneur", 'Instituée le 19 mai 1802', ['legion d honneur', 'croix de la legion']),
    ('palmes', 'Palmes académiques', 1808, 'Pour les enseignants et les gens de l’Université (« officier d’académie », « officier de l’instruction publique »).', 'Ordre des Palmes académiques', 'créés en 1808 par Napoléon Ier', ['palmes academiques', 'officier d academie', 'officier de l instruction publique']),
    ('militaire', 'Médaille militaire', 1852, 'Pour les soldats et sous-officiers : la « Légion d’honneur du sous-officier ».', 'Médaille militaire', 'instituée le 22 janvier 1852', ['medaille militaire']),
    ('sainte_helene', 'Médaille de Sainte-Hélène', 1857, 'Pour les anciens soldats de Napoléon (campagnes de 1792 à 1815) encore vivants en 1857.', 'Médaille de Sainte-Hélène', 'est instituée par décret de Napoléon III', ['medaille de sainte helene', 'medaille de ste helene', 'medaillé de sainte helene', 'medaille sainte helene']),
    ('merite_agricole', 'Mérite agricole', 1883, 'Pour les services rendus à l’agriculture (cultivateurs, vétérinaires, instituteurs…).', 'Ordre du Mérite agricole', 'institué le 7 juillet 1883', ['merite agricole']),
    ('m1870', 'Médaille commémorative de 1870-1871', 1911, 'Pour les anciens combattants de la guerre de 1870-1871 (donnée à partir de 1911).', 'Médaille commémorative de la guerre 1870-1871', 'créée par la loi du 9 novembre 1911', ['medaille commemorative de 1870', 'medaille commemorative de la guerre 1870', 'medaille de 1870', 'medaille des veterans de 1870', 'medaille 1870 1871']),
    ('cg1418', 'Croix de guerre 1914-1918', 1915, 'Pour un soldat (ou une ville) cité pour sa conduite pendant la Grande Guerre.', 'Croix de guerre 1914-1918 (France)', 'créée le 2 avril 1915', ['croix de guerre 1914', 'croix de guerre 14 18', 'croix de guerre 1914 1918', 'croix de guerre']),
    ('famille', 'Médaille de la Famille française', 1920, 'Pour les mères (et pères) de familles nombreuses qui ont bien élevé leurs enfants.', "Médaille de l'Enfance et des Familles", 'créée par décret du 26 mai 1920', ['medaille de la famille', 'medaille d honneur de la famille']),
    ('commemo1418', 'Médaille commémorative de la guerre 1914-1918', 1920, 'Pour tous ceux qui ont servi pendant la Grande Guerre : la « médaille des poilus ».', 'Médaille commémorative de la guerre 1914-1918', 'instituée par la loi du 23 juin 1920', ['medaille commemorative de la guerre 1914', 'medaille commemorative 14 18', 'medaille commemorative 1914 1918', 'medaille des poilus']),
    ('interalliee', 'Médaille interalliée (de la Victoire)', 1922, 'Pour les combattants de la Grande Guerre, commune aux pays alliés.', 'Médaille commémorative interalliée (1914-1918)', 'créée par la loi du 20 juillet 1922', ['medaille interalliee', 'medaille de la victoire']),
    ('combattant', 'Croix du combattant', 1930, 'Pour les anciens combattants (d’abord les poilus de 14-18).', 'Croix du combattant', 'créée en 1930', ['croix du combattant']),
    ('cg3945', 'Croix de guerre 1939-1945', 1939, 'Pour une personne (ou une ville) citée pour fait de guerre pendant la Seconde Guerre mondiale.', 'Croix de guerre 1939-1945 (France)', 'instituée la croix de guerre par un décret-loi du 26 septembre 1939', ['croix de guerre 1939', 'croix de guerre 39 45', 'croix de guerre 1939 1945']),
    ('resistance', 'Médaille de la Résistance', 1943, 'Pour les résistants (actes de foi et de courage contre l’occupant).', 'Médaille de la Résistance française', 'instituée en février 1943 à Londres', ['medaille de la resistance']),
    ('travail', 'Médaille d’honneur du travail', 1948, 'Pour l’ancienneté au travail chez un employeur (argent, vermeil, or, grand or) ; elle remplace des médailles de 1886 et 1913.', "Médaille d'honneur du travail", 'a été instituée le 15 mai 1948', ['medaille d honneur du travail', 'medaille du travail']),
]
titles = [d[4] for d in DECOS]
j = common.get_json('https://fr.wikipedia.org/w/api.php', {'action': 'query', 'titles': '|'.join(titles), 'prop': 'pageimages', 'piprop': 'name', 'format': 'json', 'formatversion': 2, 'redirects': 1})
norm = {x['from']: x['to'] for x in j['query'].get('normalized', []) + j['query'].get('redirects', [])}
pimg = {p['title']: p.get('pageimage') for p in j['query']['pages']}
files = sorted({f for f in pimg.values() if f})
info = {}
if files:
    j2 = common.get_json('https://commons.wikimedia.org/w/api.php', {'action': 'query', 'titles': '|'.join('File:' + f for f in files), 'prop': 'imageinfo', 'iiprop': 'url|extmetadata', 'iiurlwidth': 200, 'format': 'json'})
    strip = lambda s: html.unescape(re.sub(r'<[^>]+>', '', s or '')).strip()
    for p in j2['query']['pages'].values():
        ii = (p.get('imageinfo') or [None])[0]
        if not ii:
            continue
        md = ii.get('extmetadata', {})
        info[p['title'][5:].replace(' ', '_')] = {'file': p['title'][5:], 'thumb': ii.get('thumburl', ''), 'page': ii.get('descriptionurl', ''), 'author': strip(md.get('Artist', {}).get('value', ''))[:120],
                                                  'licence': strip(md.get('LicenseShortName', {}).get('value', '')), 'licence_url': strip(md.get('LicenseUrl', {}).get('value', ''))}
out['decorations'] = []
for k, n, y, who, title, needle, match in DECOS:
    r = q(title, needle)
    f = pimg.get(norm.get(title, title)) or pimg.get(title)
    out['decorations'].append({'id': k, 'n': n, 'y': y, 'who': who, 'match': match, **r, 'image': info.get((f or '').replace(' ', '_'))})
for d in out['decorations']:
    if d['id'] == 'cg1418':
        d['not'] = ['croix de guerre 1939', 'croix de guerre 39 45']

# ═════════ 👶 nourrices ═════════
N = 'Nourrice'
out['nourrices'] = {
    'short': 'Beaucoup de bébés des villes étaient confiés à une nourrice à la campagne ; beaucoup y mouraient.',
    'src': {'title': 'Wikipédia, « Nourrice »', 'url': common.wp_url(N)},
    'facts': [
        dict(t='Au XVIIIe siècle, à Paris et à Rouen, près d’un enfant d’artisan sur deux est placé en nourrice.', **q(N, 'à Paris et à Rouen c’est près d’un enfant d’artisan sur deux')),
        dict(t='La mise en nourrice a été une des grandes causes de mortalité des bébés.', **q(N, 'La mise en nourrice a été une des plus grandes causes de la mortalité infantile')),
        dict(t='Au XIXe siècle, elle reste fréquente dans les régions pauvres comme le Morvan.', **q(N, 'elle reste florissante dans les régions pauvres')),
        dict(t='La loi Roussel (1874) encadre et surveille les enfants placés en nourrice.', **q(N, 'loi Roussel relative à la protection de la petite enfance')),
    ],
    'where': [
        {'icon': '📒', 't': 'À partir de 1874 (loi Roussel) : les registres de déclaration des nourrices et des enfants placés, à la mairie du lieu où vivait la nourrice, puis aux archives départementales (souvent série M, « protection du premier âge »).'},
        {'icon': '⚰️', 't': 'L’acte de décès du bébé est dans la commune de la nourrice : il nomme souvent la nourrice et son mari, et le domicile des parents.'},
        {'icon': '🏛️', 't': 'Pour un enfant de Paris : le « bureau des nourrices » et l’Assistance publique (archives de Paris).'},
    ]}

# ═════════ ⚰️ deuil (Ermance Dufaux, 1883) ═════════
DUF = 'lesavoirvivreda00dufagoog'
DUF_T = 'Ermance Dufaux, « Le savoir-vivre dans la vie ordinaire et dans les cérémonies civiles et religieuses », Garnier frères, 1883, p. 375-376 (Internet Archive)'
out['deuil'] = {
    'src': {'title': DUF_T, 'short': 'Ermance Dufaux, 1883', 'year': 1883, 'url': f'https://archive.org/details/{DUF}?q=%22Deuil+de+veuve%22'},
    'rules': [
        {'rel': 'mari', 'd': 'un an et six semaines de deuil', **ia(DUF, 'Deuil de veuve, un an et six semaines.', DUF_T)},
        {'rel': 'femme', 'd': 'un an de deuil', **ia(DUF, 'Deuil de veuf, un an.', DUF_T)},
        {'rel': 'pere', 'd': 'un an de deuil', **ia(DUF, 'Deuil de père et de mère, un an.', DUF_T)},
        {'rel': 'mere', 'd': 'un an de deuil', **ia(DUF, 'Deuil de père et de mère, un an.', DUF_T)},
        {'rel': 'enfant', 'd': 'six mois de deuil (pas obligatoire)', **ia(DUF, "Deuil d'enfant (ce deuil n'est pas obligatoire), six mois.", DUF_T)},
        {'rel': 'frere', 'd': 'six mois de deuil', **ia(DUF, 'Deuil de frère et de sœur, six mois.', DUF_T)},
    ],
    'notes': [
        {'t': 'Pour un militaire, le deuil se portait seulement avec un crêpe au bras gauche et à l’épée.', **ia(DUF, "Pour les militaires, le deuil se borne à un crêpe noué au bras gauche et à l'épée.", DUF_T)},
        {'t': 'Les vêtements du deuil suivaient la mode ; et chaque pays avait ses usages.', **ia(DUF, 'De plus, en chaque pays, il convient de consulter, avant tout, les convenances locales.', DUF_T)},
    ]}

# ═════════ 💍 mariage (Sébillot, Haute-Bretagne, 1886) ═════════
SEB = 'coutumespopulair00sbuoft'
SEB_T = 'Paul Sébillot, « Coutumes populaires de la Haute-Bretagne », Maisonneuve, 1886, chapitre « Le mariage » (Internet Archive)'
seb = lambda s, k='': ia(SEB, s, SEB_T, k)
out['mariage'] = [
    {'region': 'Haute-Bretagne (pays gallo)', 'deps': ['35', '22', '44', '56'], 'author': 'Paul Sébillot', 'year': 1886, 'items': [
        seb("Les mariages du mois de mai et ceux du mois d'août sont malheureux ; ces mois sont consacrés à la Vierge."),
        seb("En faisant la demande en mariage, on ne boit que du vin ; c'est celui qui demande la fille qui l'apporte."),
        seb("S'il fait beau le jour du mariage, il y aura de la chance pour le ménage."),
        seb('Quand un veuf ou une veuve se remarie, on va casser des pots devant sa porte.'),
        seb('Le mercredi est un mauvais jour pour le mariage.')]},
    {'region': 'Berry, Franche-Comté et Pyrénées', 'deps': ['18', '36', '25', '39', '70', '90', '64', '65', '09', '66', '31'], 'author': 'Paul Sébillot', 'year': 1886, 'items': [
        seb('En Berry (cf. Laisnel de La Salle, t. II, p. 20), en Franche-Comté (cf. Monnier, p. 290), dans les Pyrénées (cf. A. de Nore, p. 90; Mélusine, col. 478), existe aussi une répugnance pour les mariages du mois de mai.', 'répugnance pour les mariages')]},
    {'region': 'Ardennes', 'deps': ['08'], 'author': 'Paul Sébillot', 'year': 1886, 'items': [
        seb('Dans les Ardennes (cf. Nozot, p. 127), si on se marie le vendredi, on meurt dans la lune de miel.', 'lune de miel')]},
]

# ═════════ 🚧 octroi ═════════
O = 'Octroi'
out['octroi'] = {
    'facts': [
        dict(t='On payait l’octroi aux barrières de la ville, sur les boissons, la nourriture, le bois, le fourrage, les matériaux…', **q(O, 'qui énumère les marchandises taxables')),
        dict(t='Supprimé en 1791, il est rétabli en 1798 ; il disparaît en 1943 (officiellement en 1948).', **q(O, 'Il fut supprimé définitivement en 1943')),
    ],
    'cities': []}
for name, dep, t, needle, anchor in [
        ('Paris', '75', 'Paris avait ses barrières d’octroi : 57 barrières construites en 1785 (le mur des Fermiers généraux), repoussées aux fortifications en 1860.', 'Le roi Louis XVI fait ériger 57 barrières', 'À Paris'),
        ('Bordeaux', '33', 'Bordeaux avait un octroi depuis le Moyen Âge, rétabli en 1799, supprimé le 1er janvier 1928.', "L'octroi à Bordeaux fut supprimé le 1er janvier 1928", 'À Bordeaux'),
        ('Toulouse', '31', 'Toulouse avait un octroi aux barrières (barrière de Paris, de Bayonne, de Muret…) ; il avait été rétabli en l’an VIII.', "l'octroi a été rétabli en l'an VIII", 'À Toulouse'),
        ('Lyon', '69', 'À Lyon, en 1789, des émeutes détruisent les barrières de l’octroi.', 'à Lyon, des émeutes les détruisent', '')]:
    c = commune(name, dep=dep)
    r = q(O, needle, anchor)
    out['octroi']['cities'].append({'n': c['n'], 'insee': c['insee'], 't': t, **r})

# ═════════ 🕯️ éclairage ═════════
E = 'Éclairage public'
B = 'Bourganeuf ville lumière'
out['eclairage'] = {'cities': []}
ecl = [('Paris', '75', [(1818, 'Paris a ses premières rues éclairées au gaz depuis 1818 (place du Carrousel), puis la rue de Rivoli en 1819.', E, 'premier éclairage public, place du Carrousel'),
                        (1878, 'À l’Exposition universelle de 1878, des places et avenues de Paris sont éclairées à l’électricité (« bougies Jablochkoff »).', E, 'Lors de l\'Exposition universelle de 1878, à Paris')]),
       ('Bellegarde-sur-Valserine', '01', [(1884, 'Bellegarde est la première ville de France éclairée à l’électricité, depuis juillet 1884.', B, 'la première ville éclairée à l\'électricité depuis juillet 1884')]),
       ('La Roche-sur-Foron', '74', [(1885, 'La Roche-sur-Foron est déjà éclairée à l’électricité en 1885 (une des toutes premières villes de France).', B, 'Le 16 septembre 1885, le journaliste Pierre Giffard')]),
       ('Bourganeuf', '23', [(1886, 'Bourganeuf est éclairée à l’électricité depuis le 9 mai 1886, la troisième ville de France.', B, 'Bourganeuf est aussi éclairée à l\'électricité'),
                             (1889, 'En 1889, Bourganeuf reçoit l’électricité d’une usine éloignée de 14 km : une première en France.', B, 'Et en 1889, la première ville française à recevoir l\'électricité avec un lieu de production éloigné')])]
for name, dep, facts in ecl:
    c = commune(name, dep=dep)
    if not c:
        raise SystemExit('commune introuvable ' + name)
    out['eclairage']['cities'].append({'n': c['n'], 'insee': c['insee'], 'facts': [{'y': y, 't': t, **q(a, nd)} for y, t, a, nd in facts]})

# ═════════ 🧂 gabelle ═════════
G = 'Gabelle du sel'
AR = json.load(gzip.open(os.path.join(common.ROOT, 'assets/data/dp-ancien-regime.json.gz')))
cot = [e['n'] for e in AR['ents']['b'] if e.get('pr') == 'bailliage-070' or e['n'] == 'Bailliage de Coutances']
gq = lambda needle: q(G, needle, 'Pays de gabelle')
cats = {
    'grande': {'label': 'pays de grande gabelle', 'color': '#8d5a2b', 'rule': 'On devait acheter chaque année une quantité de sel fixée, très cher : un vrai impôt.', **gq('Dans les « pays de grande gabelle »')},
    'petite': {'label': 'pays de petite gabelle', 'color': '#c0392b', 'rule': 'Le sel se vendait dans les greniers du roi, mais on en achetait ce qu’on voulait.', **gq('Dans les « pays de petite gabelle »')},
    'salines': {'label': 'pays de salines', 'color': '#e67e22', 'rule': 'Le sel venait des salines de l’Est (Lorraine, Franche-Comté), avec ses propres règles.', **gq('Les « pays de salines »')},
    'quart': {'label': 'pays de quart-bouillon', 'color': '#f5b041', 'rule': 'On faisait le sel en faisant bouillir le sable salé ; un quart allait au roi.', **gq('Dans le « pays de quart-bouillon »')},
    'redime': {'label': 'pays rédimé', 'color': '#c2185b', 'rule': 'Le pays avait racheté la gabelle sous Henri II : le sel y était bien moins cher.', **gq('Les « pays rédimés »')},
    'exempt': {'label': 'pays exempt (franc-salé)', 'color': '#f8bbd0', 'rule': 'Pas de gabelle : le sel y était bon marché, d’où la contrebande des faux-sauniers aux frontières.', **gq('Les « pays exempts »')},
}
rules = [
    {'cat': 'exempt', 'layer': 'p', 'why': 'la province', 'names': ['Bretagne', 'Artois', 'Flandre', 'Hainaut', 'Cambrésis', 'Béarn', 'Corse']},
    {'cat': 'exempt', 'layer': 'gv', 'why': 'le gouvernement', 'names': ['Boulonnais', 'Principauté de Sedan']},
    {'cat': 'exempt', 'layer': 'b', 'why': 'le bailliage', 'names': ['Siège royal de Calais', 'Bailliage de Gex', "Sénéchaussée d'Arles", "Ville et terroire d'Arles", 'Pays de Soule', 'Royaume de Navarre', "Bailliage d'Ustaritz"]},
    {'cat': 'quart', 'layer': 'b', 'why': 'le bailliage', 'names': cot + ['Bailliage de Domfront', 'Bailliage de Vire']},
    {'cat': 'petite', 'layer': 'b', 'why': 'le bailliage', 'names': ['Bailliage de Mâcon', 'Bailliage de Bourg-en-Bresse', 'Bailliage de Belley', 'Sénéchaussée de Trévoux', 'Sénéchaussée de Rodez', 'Sénéchaussée de Villefranche-de-Rouergue']},
    {'cat': 'redime', 'layer': 'b', 'why': 'le bailliage', 'names': ['Pays de Bigorre', 'Comté de Comminges']},
    {'cat': 'redime', 'layer': 'p', 'why': 'la province', 'names': ['Poitou', 'Limousin', 'Saintonge', 'Angoumois', 'Guyenne', 'Foix', 'Auvergne']},
    {'cat': 'salines', 'layer': 'p', 'why': 'la province', 'names': ['Barrois', 'Clermontois', 'Alsace']},
    {'cat': 'salines', 'layer': 'g', 'why': 'la généralité', 'names': ['Nancy (Lorraine)', 'Besançon', 'Metz (Trois-Évêchés)']},
    {'cat': 'petite', 'layer': 'g', 'why': 'la généralité', 'names': ['Lyon', 'Grenoble', 'Aix', 'Montpellier', 'Toulouse', 'Perpignan (Roussillon)']},
    {'cat': 'grande', 'layer': 'g', 'why': 'la généralité', 'names': ['Paris', 'Amiens', 'Soissons', 'Châlons', 'Dijon', 'Orléans', 'Moulins', 'Bourges', 'Tours', 'Caen', 'Alençon', 'Rouen']},
]
for r in rules:  # chaque nom doit exister dans l'atlas
    have = {e['n'] for e in AR['ents'][r['layer']]}
    miss = [n for n in r['names'] if n not in have]
    if miss:
        raise SystemExit(f'absent de l’atlas ({r["layer"]}) : {miss}')
out['gabelle'] = {'src': {'title': 'Wikipédia, « Gabelle du sel », partie « Pays de gabelle »', 'url': common.wp_url(G, anchor='Pays de gabelle')}, 'cats': cats, 'rules': rules,
                  'prices': [dict(t='Près de la Bretagne, le sel coûtait 55 à 60 livres le minot (environ 50 kg) dans le Maine, contre 2 à 3 livres en Bretagne.', **q(G, 'le sel se payait, à La Croixille, 55 à 60 livres le minot')),
                             dict(t='Le faux-saunier, qui passait du sel en fraude, risquait les galères, ou la mort s’il était armé.', **q(G, 'Le faux-saunier était un contrebandier'))]}

common.write_gz('l9b-coutumes.json.gz', out)

# ═════════ 🐎 les grands voyages ═════════
trips = []
# Napoléon, le vol de l'Aigle (mars 1815)
V = "Vol de l'aigle"
nap = [('Vallauris', '06', '1815-03-01', 'Le débarquement a lieu le 1er mars à 13 heures', 'débarquement à Golfe-Juan'), ('Séranon', '06', '1815-03-02', 'Le jeudi 2 mars, Napoléon Ier effectue le trajet', ''),
       ('Barrême', '04', '1815-03-03', "Le lendemain, l'ex-empereur rejoint Barrême où il dort", ''), ('Malijai', '04', '1815-03-04', 'Le samedi, Napoléon arrive à Malijai', ''),
       ('Laffrey', '38', '1815-03', 'Il rencontre la troupe de l\'empereur à proximité de Laffrey', 'la « prairie de la Rencontre »'), ('Vizille', '38', '1815-03', 'Napoléon poursuit sa route vers Vizille', ''),
       ('Grenoble', '38', '1815-03', 'redescend vers Grenoble en empruntant la longue avenue', ''), ('Bourgoin-Jallieu', '38', '1815-03', 'Napoléon quitte Bourgoin à 15 heures', ''),
       ('Lyon', '69', '1815-03-13', 'Le 13 mars, Napoléon quitte Lyon', ''), ('Villefranche-sur-Saône', '69', '1815-03-13', 'arrive à Villefranche-sur-Saône', ''), ('Mâcon', '71', '1815-03-13', 'Il parvient à Mâcon à 19 heures', ''),
       ('Auxerre', '89', '1815-03-18', 'Le samedi 18 mars, Napoléon reste à Auxerre', ''), ('Pont-sur-Yonne', '89', '1815-03-19', 'Le dimanche 19 mars, Napoléon atteint Pont-sur-Yonne', ''), ('Paris', '75', '1815-03-20', 'Le 20 mars, Napoléon arrive à Paris', '')]
stops = []
for name, dep, d, needle, note in nap:
    c = commune(name, dep=dep)
    stops.append({**{k: c[k] for k in ('n', 'insee', 'lat', 'lon')}, 'd': d, 'note': note, **q(V, needle)})
trips.append({'id': 'aigle', 'icon': '🦅', 'title': 'le vol de l’Aigle, retour de l’île d’Elbe', 'who': 'Napoléon', 'from': 1815, 'to': 1815, 'src': {'url': common.wp_url(V), 'title': "Wikipédia, « Vol de l'aigle »", 'quote': ''}, 'stops': stops})
# la fuite à Varennes (20-21 juin 1791)
F = 'Fuite de Varennes'
var = [('Bondy', '93', 'Premier relais à Bondy'), ('Claye-Souilly', '77', 'rejoint la berline royale à Claye-Souilly'), ('Montmirail', '51', 'Il est reconnu à Montmirail une première fois'),
       ('Somme-Vesle', '51', 'En arrivant au relais de poste de Somme-Vesle'), ('Sainte-Menehould', '51', "s’arrête devant le relais de Sainte-Menehould"),
       ('Clermont-en-Argonne', '55', 'la berline atteint le relais de Clermont-en-Argonne'), ('Varennes-en-Argonne', '55', "La berline royale s’arrête à l’entrée de Varennes")]
stops = []
for name, dep, needle in var:
    c = commune(name, dep=dep)
    if not c:
        raise SystemExit('commune introuvable ' + name)
    stops.append({**{k: c[k] for k in ('n', 'insee', 'lat', 'lon')}, 'd': '1791-06-21', **q(F, needle)})
trips.append({'id': 'varennes', 'icon': '👑', 'title': 'la fuite à Varennes', 'who': 'Louis XVI et la famille royale', 'from': 1791, 'to': 1791, 'src': {'url': common.wp_url(F), 'title': 'Wikipédia, « Fuite de Varennes »', 'quote': ''}, 'stops': stops})
# le grand tour de France de Charles IX (1564-1566) : chaque étape « Lieu (dates) : … » de l'article
CH = 'Grand tour de France de Charles IX'
t, rev, ti = wp(CH)
MOIS = {m: i + 1 for i, m in enumerate(['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'])}
# noms anciens → commune d'aujourd'hui (les communes nouvelles depuis 2015 ne sont pas suivies : l'étape est sautée)
ALIAS = {'Chalon': 'Chalon-sur-Saône', 'Châlons': 'Châlons-en-Champagne', 'Corbeil': 'Corbeil-Essonnes', 'Chartreuse de Champmol': 'Dijon', 'Chaumont-en-Bassigny': 'Chaumont',
         'Salon-de-Crau': 'Salon-de-Provence', 'Pont-de-Sorgue': 'Sorgues', 'Dun-le-Roi': 'Dun-sur-Auron', 'Rochebeaucourt': 'La Rochebeaucourt-et-Argentine',
         'Cosne-en-Bourbonnais': "Cosne-d'Allier", 'La Guerche-en-Nivernais': "La Guerche-sur-l'Aubois"}
stops, prev, skipped = [], (48.85, 2.35), []
sect = 'Étapes'
for line in t.split('\n'):
    if line.startswith('=== '):
        sect = line.strip('= ').strip()
    m = re.match(r'^([A-ZÉÈÂÎ][^():]{1,60}?) \(([^)]*?\d{4})\)\s*:\s*(.+)$', line.strip())
    if not m:
        continue
    name, dates = m.group(1).strip(), m.group(2)
    dm = re.search(r'(\d{1,2})(?:er)?\D{0,12}?(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\D*?(\d{4})', dates)
    if not dm:
        continue
    c = commune(ALIAS.get(name, name), near=prev)
    if not c or (prev and ((c['lat'] - prev[0]) ** 2 + ((c['lon'] - prev[1]) * 0.7) ** 2) ** .5 > 1.6):
        skipped.append(name); continue
    prev = (c['lat'], c['lon'])
    d = f'{dm.group(3)}-{MOIS[dm.group(2)]:02d}-{int(dm.group(1)):02d}'
    sentence = line.strip()
    stops.append({**{k: c[k] for k in ('n', 'insee', 'lat', 'lon')}, 'd': d, 'q': sentence[:400], 'url': common.wp_url(ti, anchor=sect), 'title': f'Wikipédia, « {ti} », partie « {sect} »'})
print('Charles IX : étapes', len(stops), 'sautées (nom non reconnu ou trop loin de l’étape d’avant)', skipped)
trips.append({'id': 'charles9', 'icon': '🏰', 'title': 'le grand tour de France de Charles IX', 'who': 'le roi Charles IX et la cour', 'from': 1564, 'to': 1566, 'src': {'url': common.wp_url(ti), 'title': f'Wikipédia, « {ti} »', 'quote': ''}, 'stops': stops})
common.write_gz('l9b-voyages.json.gz', {'v': 1, 'src': 'Wikipédia (CC BY-SA 4.0), une phrase de l’article par étape', 'trips': trips})
print({t['id']: len(t['stops']) for t in trips})
