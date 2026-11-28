#!/usr/bin/env python3
"""🌅 Les ciels étranges et 🦠 les maladies des métiers — deux petites listes faites à la main pour LCNDA.

Chaque ligne cite une phrase EXACTE d'un article de Wikipédia en français (CC BY-SA 4.0) : le script télécharge l'article
(API, texte brut), vérifie que la phrase y est mot pour mot, et refuse la ligne sinon. Le reste (« what », la courte phrase
montrée sur la fiche) est écrit pour l'app à partir de cette phrase. Les dates « from / to » servent seulement à savoir si la
personne a pu le voir (ciels) ou exercer ce métier à cette époque (maladies) : elles viennent des articles cités.

Usage : L8_CACHE=<dossier> python3 -I build_curated.py   → assets/data/l8a-ciels.json, assets/data/l8a-maladies.json
"""
import datetime, json, os, re, sys, urllib.parse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import l8common as C

WP = 'https://fr.wikipedia.org/wiki/'


def article(title):
    url = 'https://fr.wikipedia.org/w/api.php?' + urllib.parse.urlencode({'action': 'query', 'prop': 'extracts', 'explaintext': 1, 'redirects': 1, 'format': 'json', 'titles': title})
    j = C.api_json(url, 'wp-fr-' + title.replace('/', '_').replace(' ', '_') + '.json')
    p = list(j['query']['pages'].values())[0]
    if 'missing' in p: raise RuntimeError('article absent : ' + title)
    return p['title'], p.get('extract', '')


def norm(s):
    return re.sub(r'\s+', ' ', s.replace(' ', ' ').replace('’', "'")).strip()


# ── 🌅 les ciels étranges ──
# bbox : [lat min, lat max, lon min, lon max] où il fallait être ; north : seulement si le lieu est connu (sinon on ne dit rien)
SKIES = [
    {'id': 'laki', 'icon': '🌫️', 'name': 'Le « brouillard sec » du Laki', 'from': '1783-06', 'to': '1783-10', 'when': 'l’été 1783', 'where': 'Europe',
     'what': 'le volcan Laki, en Islande, couvre l’Europe d’un épais brouillard sec : le soleil paraît « couleur sang ».',
     'article': 'Lakagígar', 'quote': "Le brouillard est si épais que les bateaux restent au port et que le soleil est décrit comme « couleur sang »."},
    {'id': 'tambora', 'icon': '🌇', 'name': 'Les ciels jaunes de 1815-1816 (Tambora)', 'from': '1815-06', 'to': '1816-10', 'when': 'les étés 1815 et 1816', 'where': 'Europe',
     'what': 'les cendres du volcan Tambora font le tour de la Terre : ciels jaunâtres, couchers de soleil rougeoyants, puis l’« année sans été » de 1816.',
     'article': 'Année sans été', 'quote': "Les cendres et les aérosols sulfatés présents dans la stratosphère font plusieurs fois le tour de la Terre, causant, lors des étés 1815 et 1816, des ciels jaunâtres et des couchers de soleil rougeoyants qui vont influencer les artistes de l'époque."},
    {'id': 'krakatoa', 'icon': '🌅', 'name': 'Les couchers de soleil rouges du Krakatoa', 'from': '1883-08', 'to': '1884-12', 'when': 'après l’éruption du Krakatoa (août 1883)', 'where': 'Europe et le monde',
     'what': 'les poussières du volcan Krakatoa donnent des couchers de soleil flamboyants, puis rouge lie-de-vin, et une Lune aux couleurs étranges.',
     'article': 'Éruption du Krakatoa en 1883', 'quote': "Ces poussières sont également à l'origine des couchers de soleil flamboyants, puis rouge lie-de-vin qui inspirèrent nombre d'artistes, comme William Ashcroft avec ses centaines de chromolithographies ou Edvard Munch avec Le Cri en 1893, ainsi que des colorations inhabituellement vives de la Lune comme à Londres."},
    {'id': 'toungouska', 'icon': '🌌', 'name': 'Les nuits claires de 1908 (Toungouska)', 'from': '1908-06-30', 'to': '1908-07-03', 'when': 'les nuits du 30 juin au 3 juillet 1908', 'where': 'nord de l’Europe',
     'bbox': [45, 72, -12, 45], 'north': True,
     'what': 'après l’explosion de la Toungouska, en Sibérie, les nuits sont si claires dans le nord de l’Europe qu’on y voit presque comme en plein jour.',
     'article': 'Événement de la Toungouska', 'quote': "Il a été observé un phénomène de nuits très claires (lueur nocturne, aubes et crépuscules lumineux, nuages noctulescents) dans les trois nuits qui ont suivi l'événement et dans toute l'Europe du nord."},
    {'id': 'pinatubo', 'icon': '🌄', 'name': 'Les couchers de soleil du Pinatubo', 'from': '1991-06', 'to': '1991-12', 'when': 'après l’éruption du Pinatubo (juin 1991)', 'where': 'hémisphère nord',
     'bbox': [0, 75, -30, 60],
     'what': 'les aérosols du volcan Pinatubo, aux Philippines, colorent les couchers de soleil de teintes inhabituelles pendant des semaines.',
     'article': 'Éruption du Pinatubo en 1991', 'quote': "Ces fines particules et aérosols ont produit des couchers de soleil aux couleurs inhabituelles pendant plusieurs semaines dans l'hémisphère nord."},
]

# ── 🦠 les maladies des métiers (formulation neutre : un risque connu du métier, jamais un diagnostic) ──
# jobs : expression sur le métier écrit sans accents ni majuscules (voir fold() dans le fichier JS)
DISEASES = [
    {'id': 'phosphore', 'disease': 'Nécrose phosphorée de la mâchoire', 'trades': 'allumettiers', 'jobs': r'allumett', 'from': 1800, 'to': 1910,
     'what': 'les ouvriers respiraient les vapeurs du phosphore blanc des allumettes, qui pouvaient abîmer la mâchoire ; on l’a interdit au début du XXe siècle.',
     'article': 'Nécrose phosphorée de la mâchoire', 'quote': "La cause de la maladie était une exposition prolongée à la vapeur de  phosphore blanc (parfois aussi appelé phosphore jaune), historiquement utilisé dans la fabrication d'allumettes."},
    {'id': 'silicose', 'disease': 'Silicose', 'trades': 'mineurs, carriers, tailleurs de pierre, porcelainiers', 'jobs': r'mineur|houilleur|carrier|tailleur de pierre|perreyeur|ardoisier|porcelain|sableur|piqueur|tunnel|marbrier|granit',
     'from': 1800, 'to': 2000, 'what': 'la poussière de pierre (la silice) était connue pour user les poumons : c’est la silicose.',
     'article': 'Silicose', 'quote': None, 'quote_re': r"La silicose est une maladie pulmonaire provoquée par l'inhalation de particules de poussières de silice[^.]*\."},
    {'id': 'ceruse', 'disease': 'Saturnisme (plomb de la céruse)', 'trades': 'peintres en bâtiment, fabricants de céruse', 'jobs': r'peintre|badigeon|ceruse|vitrier|plombier',
     'from': 1800, 'to': 1950, 'what': 'la céruse, une peinture blanche au plomb, était connue pour empoisonner peu à peu ceux qui la fabriquaient et ceux qui l’appliquaient.',
     'article': 'Céruse', 'quote': "Sa teneur en plomb la rendait en effet toxique tant pour les ouvriers qui la fabriquaient, problème dénoncé au moins depuis le XIXe siècle et pour les peintres qui l'appliquaient, que pour les enfants qui sont en contact avec les poussières ou écailles issues de cette peinture toxique."},
    {'id': 'ankylostome', 'disease': 'Ankylostomose (« anémie des mineurs »)', 'trades': 'mineurs, ouvriers des tunnels, briquetiers', 'jobs': r'mineur|houilleur|briquetier|tuilier|terrassier|tunnel',
     'from': 1850, 'to': 1950, 'what': 'un petit ver des galeries humides donnait à certains l’« anémie des mineurs », qu’on appelait aussi anémie des tunnels ou des briquetiers.',
     'article': 'Ankylostomose', 'quote': "L'ankylostomiase, ou ankylostomose est également appelée helminthiase, anémie des mineurs, anémie des tunnels, anémie des briquetiers, chlorose égyptienne, en Allemagne Wurmkrankheit, et aux États-Unis Wakana disease."},
    {'id': 'charbon', 'disease': 'Maladie du charbon', 'trades': 'ouvriers de la laine, tanneurs, perruquiers, équarrisseurs', 'jobs': r'lain|cardeu|peigneu|trieu?r de laine|tanneu?r|megissi|corroyeu|perruqu|equarriss|chamoise|pelletier',
     'from': 1700, 'to': 1950, 'what': 'on travaillait des laines, des peaux ou des crins qui pouvaient porter la maladie du charbon.',
     'article': 'Maladie du charbon', 'quote': "Au XVIIIe siècle, la maladie fait des ravages, entre autres, chez les ouvriers de la laine et les artisans perruquiers qui travaillent des produits animaux importés (peaux et crins)."},
    {'id': 'farine', 'disease': 'Asthme du boulanger (farine)', 'trades': 'boulangers, pâtissiers', 'jobs': r'boulang|patissi|fournier|mitron|meunier',
     'from': 1700, 'to': 2100, 'what': 'la poussière de farine donne de l’asthme à certains : aujourd’hui encore, les boulangeries sont parmi les métiers les plus touchés.',
     'article': 'Asthme professionnel', 'quote': "Par exemple, en France, les industries les plus touchées sont, par ordre d'importance, les boulangeries et les pâtisseries, l’industrie automobile et les coiffeurs."},
    {'id': 'mercure', 'disease': 'Intoxication au mercure (chapeliers)', 'trades': 'chapeliers, feutriers', 'jobs': r'chapeli|feutri',
     'from': 1700, 'to': 1950, 'what': 'on traitait les feutres des chapeaux avec du mercure, connu pour empoisonner peu à peu ceux qui le respiraient.',
     'article': 'Hydrargyrisme', 'quote': "Des solutions de nitrate de mercure ont servi à préserver et traiter les peaux et feutres en vue de la fabrication de chapeaux."},
    {'id': 'plomb', 'disease': 'Saturnisme (plomb)', 'trades': 'fondeurs de plomb, verriers des vitraux, potiers d’étain', 'jobs': r'fondeur de plomb|plombier|vitrail|vitrier|verrier|potier d.etain|etameu?r|mineur de plomb',
     'from': 1700, 'to': 1950, 'what': 'le plomb, manié tous les jours, était connu pour empoisonner peu à peu ceux qui le travaillaient : c’est le saturnisme, décrit par un médecin en 1839.',
     'article': 'Saturnisme', 'quote': "En 1839, Tanquerel des Planches fait une première description clinique précise du saturnisme aigu, ce qui n'empêchera pas cette maladie de continuer à sévir, principalement chez des mineurs et ouvriers de la métallurgie du plomb, chez les utilisateurs de vaisselle de plomb ou de mauvais étain, les ouvriers sertissant au plomb les vitraux ou utilisant la céruse de plomb."},
]


def resolve(rows, kind):
    out, skipped = [], {}
    for r in rows:
        r = dict(r)
        try:
            title, text = article(r.pop('article'))
        except Exception as e:
            skipped[r['id']] = str(e); continue
        q, qre = r.pop('quote', None), r.pop('quote_re', None)
        t = norm(text)
        if q is None and qre:
            m = re.search(qre, t)
            q = m.group(0).strip() if m else None
        if q is None:
            skipped[r['id']] = 'phrase à choisir'; continue
        if norm(q) not in t:
            skipped[r['id']] = 'phrase introuvable dans l’article'; continue
        if len(q) > 420: q = q[:417].rsplit(' ', 1)[0] + '…'
        out.append({**r, 'quote': norm(q), 'title': f'Wikipédia — {title}', 'url': WP + urllib.parse.quote(title.replace(' ', '_'))})
    for k, v in skipped.items(): print(f'  {kind} écarté {k} : {v}')
    return out, skipped


def main():
    today = datetime.date.today().isoformat()
    skies, s1 = resolve(SKIES, 'ciel')
    C_out = os.path.join(C.OUT, 'l8a-ciels.json')
    json.dump({'title': 'Les ciels étranges de sa vie', 'version': 1, 'checked': today, 'licence': 'CC BY-SA 4.0 (citations de Wikipédia)', 'licence_url': 'https://creativecommons.org/licenses/by-sa/4.0/deed.fr',
               'source': 'Wikipédia en français (une phrase exacte par événement)', 'url': 'https://fr.wikipedia.org/',
               'note': 'Liste faite pour LCNDA. from / to : la période où l’on a vu le phénomène, d’après l’article cité. Les comètes et les aurores sont dans comets-aurores.json (☄️ Il a pu voir…).',
               'skipped': s1, 'events': skies}, open(C_out, 'w'), ensure_ascii=False, indent=0)
    print('écrit', C_out, os.path.getsize(C_out), len(skies), 'événements')
    dis, s2 = resolve(DISEASES, 'maladie')
    M_out = os.path.join(C.OUT, 'l8a-maladies.json')
    json.dump({'title': 'Les maladies de certains métiers', 'version': 1, 'checked': today, 'licence': 'CC BY-SA 4.0 (citations de Wikipédia)', 'licence_url': 'https://creativecommons.org/licenses/by-sa/4.0/deed.fr',
               'source': 'Wikipédia en français (une phrase exacte par maladie)', 'url': 'https://fr.wikipedia.org/wiki/Maladie_professionnelle',
               'note': 'Risques connus de certains métiers, d’après l’article cité ; jobs = les métiers concernés (sans accents). Ce n’est jamais un diagnostic.',
               'skipped': s2, 'rows': dis}, open(M_out, 'w'), ensure_ascii=False, indent=0)
    print('écrit', M_out, os.path.getsize(M_out), len(dis), 'maladies')


if __name__ == '__main__':
    main()
