#!/usr/bin/env python3
"""☄️ « Il a pu voir… » — les grandes comètes vues à l'œil nu depuis l'Europe et les grandes aurores vues loin vers le sud.

Chaque ligne a sa source, téléchargée et lue le 24/11/2026 :
  - les dates de visibilité à l'œil nu : l'article de Wikipédia en français (CC BY-SA 4.0) cité, dont la phrase est recopiée
    dans « evidence » (courte citation) ; quand l'article donne seulement « début septembre », « fin avril »… la borne prise
    est écrite dans « bornes » ;
  - les éléments d'orbite (pour dessiner la comète dans 🌌 Le ciel de naissance) : Wikidata (CC0), propriétés P2244 (périhélie q),
    P1096 (excentricité), P2045 (inclinaison), P2213 (nœud ascendant), P2248 (argument du périhélie), P11796 (date du périhélie,
    jour julien) — relus à chaque construction par une requête SPARQL ;
  - les aurores : Wikipédia en français, Wikidata, des articles d'époque (Nature, Science) archivés sur Zenodo, et le relevé
    ARCTICS du 10 mai 2024 (Zenodo 12732615, CC BY 4.0) dont on compte les observations faites en France.
Ce qui n'a pas pu être vérifié n'est pas dans la liste (voir SKIPPED).

Usage : python3 -I scripts/ciel-heure/build-comets.py
"""
import csv, io, json, os, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'assets', 'data', 'comets-aurores.json')
UA = {'User-Agent': 'genealogy-app-data-builder/1.0 (offline data build)'}
WP = 'https://fr.wikipedia.org/wiki/'
wp = lambda t: WP + urllib.parse.quote(t.replace(' ', '_'), safe='/()')

# [id, sorte, nom, du, au, pic, QID Wikidata (éléments d'orbite) ou '', article Wikipédia, citation, bornes]
COMETS = [
    ['c1811', 'Grande comète de 1811', '1811-08-15', '1812-01-15', '1811-09-12', 'Q1422215', 'C/1811 F1',
     'Elle est visible avec des instruments optiques durant 17 mois, de la fin-mars 1811 à la mi-août 1812, avec des interruptions entre mi-juin et mi-août 1811 et entre mi-janvier et mi-juillet 1812 […] Elle est également visible à l’œil nu jusqu’au début de l’année 1812.',
     'du retour après la conjonction (mi-août 1811) à l’interruption de mi-janvier 1812'],
    ['c1843', 'Grande comète de 1843', '1843-02-05', '1843-04-19', '1843-02-27', 'Q1548773', 'C/1843 D1',
     'observée pour la première fois le 5 février 1843 et pour la dernière fois le 19 avril 1843 […] Son éclat […] est tel qu’elle devient visible à l’œil nu en plein jour.', ''],
    ['donati', 'la comète de Donati', '1858-09-01', '1858-10-05', '1858-09-30', 'Q981088', 'C/1858 L1 (Donati)',
     'jusqu’à ce qu’elle apparaisse à l’œil nu dans les premiers jours de septembre […] Le 5 octobre, on a vu la queue de la comète Donati passer à côté de l’étoile brillante Arcturus.',
     'de « premiers jours de septembre » au 5 octobre, dernière date citée'],
    ['tebbutt', 'la grande comète de 1861 (Tebbutt)', '1861-06-29', '1861-08-15', '1861-06-12', 'Q1022589', 'C/1861 J1',
     'ne fut visible dans l’hémisphère nord qu’à partir du 29 juin […] À partir de la mi-août, la comète n’est plus visible à l’œil nu', 'mi-août = 15 août'],
    ['coggia', 'la comète de Coggia', '1874-06-01', '1874-07-23', '1874-07-09', 'Q3814312', 'C/1874 H1 (Coggia)',
     'Au début du mois de juin, la comète est devenue visible à l’œil nu […] Le 23 juillet à Athènes, Schmidt a fait la dernière observation de la comète de l’hémisphère nord.', 'début juin = 1er juin'],
    ['c1881', 'la grande comète de 1881', '1881-06-01', '1881-09-10', '1881-06-16', 'Q3115063', 'C/1881 K1',
     'Elle est observée dans l’hémisphère sud avant de devenir visible dans l’hémisphère nord à partir du mois de juin. Camille Flammarion observera la comète jusqu’au début du mois de septembre dans les Alpes',
     'de juin à « début septembre » (10 septembre)'],
    ['c1882', 'la grande comète de septembre 1882', '1882-09-01', '1883-03-31', '1882-09-17', 'Q1541088', 'C/1882 R1',
     'Elle devient brusquement visible à l’œil nu le 1er septembre 1882 […] Elle reste visible à l’œil nu jusqu’au mois de mars 1883.', ''],
    ['c1910', 'la grande comète de janvier 1910', '1910-01-20', '1910-02-10', '1910-01-17', 'Q1472640', 'Grande comète de janvier 1910',
     'Elle devient visible en Europe quelques jours après sa découverte […] elle devient un spectacle superbe dans l’hémisphère nord au crépuscule, avec une queue […] de 50 degrés au début de février 1910.',
     '« quelques jours après » le 17 janvier = 20 janvier ; « début février » = 10 février'],
    ['halley1910', 'la comète de Halley', '1910-04-21', '1910-05-25', '', '', 'Grande comète de janvier 1910',
     'Cette comète fut confondue avec la comète de Halley, dont le retour était attendu cette année-là. Cette dernière ne commença à être observable à l’œil nu qu’à la fin du mois d’avril 1910. — et, article « Comète de Halley » : photographie « Comète de Halley le 25 mai 1910 ».',
     '« fin avril » = 21 avril ; jusqu’au 25 mai, date de la photographie citée (pas d’éléments d’orbite de 1910 : pas dessinée)'],
    ['arend', 'la comète Arend-Roland', '1957-04-01', '1957-04-30', '1957-04-08', 'Q951053', 'C/1956 R1 (Arend-Roland)',
     'Elle devient bien visible à l’œil nu à partir du mois d’avril 1957, passant au périhélie le 8 de ce mois.', 'avril 1957 (l’article ne donne pas la fin)'],
    ['west', 'la comète West', '1976-02-01', '1976-04-15', '1976-02-25', 'Q677840', 'C/1975 V1 (West)',
     'visible à l’œil nu à partir de février 1976 jusqu’à la mi-avril', 'mi-avril = 15 avril'],
    ['hyakutake', 'la comète Hyakutake', '1996-03-01', '1996-05-25', '1996-03-25', 'Q16741', 'C/1996 B2 (Hyakutake)',
     'Hyakutake devint visible à l’œil nu au début de mars 1996. […] Après son passage au périhélie, la comète pâlit rapidement et devint invisible à l’œil nu vers la fin mai.', '« vers la fin mai » = 25 mai'],
    ['halebopp', 'la comète Hale-Bopp', '1997-01-01', '1997-04-01', '1997-04-01', 'Q69854', 'C/1995 O1 (Hale-Bopp)',
     'quand elle réapparaît en janvier 1997, elle est déjà assez brillante pour être visible pour toute personne essayant de la voir […] Elle fut même visible de Paris — toujours à l’œil nu — pendant plusieurs semaines […] Après son passage au périhélie, la comète passe dans l’hémisphère céleste austral',
     'de janvier 1997 au périhélie (1er avril 1997)'],
    ['mcnaught', 'la comète McNaught', '2007-01-01', '2007-01-13', '2007-01-12', 'Q4705', 'C/2006 P1 (McNaught)',
     'devenant visible à l’œil nu début janvier 2007. […] Elle fut visible par les observateurs de l’hémisphère nord […] jusqu’autour du 13 janvier 2007.', 'très bas, dans le crépuscule'],
    ['neowise', 'la comète NEOWISE', '2020-07-12', '2020-07-29', '2020-07-03', 'Q90776919', 'C/2020 F3 (NEOWISE)',
     'Elle était visible dans la Grande Ourse du 17 au 29 juillet 2020. — photographies : « La comète depuis les hauteurs de Collioure (France) à l’aube du 12 juillet 2020 ».', ''],
    ['tsuchinshan', 'la comète Tsuchinshan-ATLAS', '2024-10-11', '2024-10-19', '2024-09-27', 'Q116946460', 'C/2023 A3 (Tsuchinshan-ATLAS)',
     'La comète est revenue dans le ciel du soir le 10 octobre et elle est devenue visible à l’œil nu les jours suivants. — photographies : « vue depuis Aubenas en France, le 13 octobre 2024 », « vue depuis Cazevieille (Hérault, France), le 19 octobre 2024 ».',
     'jusqu’au 19 octobre, dernière photographie citée'],
]
# [id, nom, du, au, source, lien, citation, ce qui a été vérifié]
AURORAE = [
    ['a1859', 'la grande aurore de 1859 (tempête de Carrington)', '1859-08-28', '1859-09-02', 'Wikipédia : Tempête solaire de 1859 ; Wikidata Q662051', wp('Tempête solaire de 1859'),
     'La première atteignit la Terre dans la soirée du 28 août 1859 […] Elle provoqua des aurores très lumineuses et spectaculaires, visibles jusque dans la mer des Caraïbes', 'dates : Wikidata (début 28 août, fin 2 septembre 1859)'],
    ['a1872', 'la grande aurore du 4 février 1872', '1872-02-04', '1872-02-04', 'Nature, vol. 5, p. 304 (15 février 1872) : « The Aurora of February 4 », J. J. Murphy — archivé sur Zenodo', 'https://doi.org/10.1038/005304a0',
     'The Aurora of February 4 (Nature, 1872)', 'titre et date de l’article (Zenodo 1609369)'],
    ['a1882', 'la grande aurore du 17 novembre 1882', '1882-11-17', '1882-11-17', 'Wikidata Q4822636 ; Nature, vol. 27, p. 82 (23 novembre 1882) : « The Magnetic Storm and Aurora », W. H. M. Christie (Greenwich)', 'https://www.wikidata.org/wiki/Q4822636',
     'Aurora of November 17, 1882 — The Magnetic Storm and Aurora (Nature, 1882)', 'date : Wikidata (début 17 novembre 1882) ; article d’époque (Zenodo 2096827)'],
    ['a1909', 'la grande aurore du 25 septembre 1909', '1909-09-25', '1909-09-25', 'Wikipédia : Aurore polaire ; Science, vol. 30, p. 598 : « The Magnetic Storm of September 25, 1909 », J. E. Burbank — archivé sur Zenodo', wp('Aurore polaire'),
     'L’aurore polaire […] est « descendue » jusqu’à Honolulu et jusqu’à Singapour en septembre 1909', 'jour : titre de l’article de Science (Zenodo 2521622)'],
    ['a1921', 'la grande aurore de mai 1921', '1921-05-14', '1921-05-15', 'Wikipédia : Tempête géomagnétique de mai 1921 ; S. M. Silverman et E. W. Cliver, « Low-Latitude Auroras: The Magnetic Storm of 14-15 May 1921 », J. Atmos. Sol.-Terr. Phys. 63 (2001)', wp('Tempête géomagnétique de mai 1921'),
     'Low-Latitude Auroras: The Magnetic Storm of 14-15 May 1921', 'dates : titre de l’article (Zenodo 1260236)'],
    ['a1989', 'la grande aurore de mars 1989', '1989-03-13', '1989-03-14', 'Wikipédia : Éruption solaire de 1989 ; Wikidata Q2587765', wp('Éruption solaire de 1989'),
     'D’autres croient que les aurores boréales intenses ont peut-être un lien avec la mission de la navette spatiale STS-29', 'dates : Wikidata (13–14 mars 1989)'],
    ['a2003', 'les aurores d’octobre 2003 (tempêtes d’Halloween)', '2003-10-30', '2003-10-30', 'Wikipédia : Aurore polaire ; Liste de tempêtes solaires', wp('Aurore polaire'),
     'En octobre et novembre 2003, une aurore boréale a pu être observée dans le sud de l’Europe. — « Image composite d’aurores observées le 30 octobre 2003 au-dessus de l’Europe »', ''],
    ['a2024', 'les aurores du 10 mai 2024', '2024-05-10', '2024-05-11', 'Wikipédia : Aurore polaire ; relevé ARCTICS (M. Grandin et al., Zenodo 12732615, CC BY 4.0)', wp('Aurore polaire'),
     'Dans la nuit du 10 au 11 mai 2024, un orage magnétique extrême de classe G5 […] a provoqué des aurores boréales observables à des latitudes inhabituelles', ''],
]
SKIPPED = {'1807 (C/1807 R1)': 'pas d’article ni de dates de visibilité trouvés', '1957 Mrkos, 1965 Ikeya-Seki, 1970 Bennett': 'les articles ne donnent pas les dates de visibilité à l’œil nu depuis l’Europe',
           '24-25 octobre 1870, 25-26 janvier 1938': 'pas de source téléchargeable qui dise qu’on les a vues en France ou en Europe de l’Ouest (Wikidata ne donne que les dates de la tempête de 1938)'}
DESC = {'c1811': 'Visible à l’œil nu pendant des mois ; l’année des « vins de la comète ».', 'c1843': 'Si brillante qu’on l’a vue en plein jour.', 'donati': 'La plus brillante comète du siècle après celle de 1811 ; la première photographiée.',
        'tebbutt': 'Une grande comète d’été, visible environ trois mois.', 'coggia': 'Une comète d’été bien visible en juin et juillet 1874.', 'c1881': 'La première comète photographiée avec sa queue.',
        'c1882': 'Si brillante qu’on la voyait en plein jour près du Soleil ; visible à l’œil nu jusqu’en mars 1883.', 'c1910': 'Visible en plein jour ; on l’a prise pour la comète de Halley.',
        'halley1910': 'Son retour de 1910 a fait peur : on croyait que la Terre traverserait sa queue.', 'arend': 'Bien visible en avril 1957, avec une curieuse « anti-queue ».', 'west': 'Une comète spectaculaire, au début du printemps 1976.',
        'hyakutake': 'Passée très près de la Terre ; on la voyait la nuit près de l’étoile polaire.', 'halebopp': 'Visible même depuis les villes, pendant des semaines, au printemps 1997.', 'mcnaught': 'Très basse au coucher du soleil, quelques jours seulement en Europe.',
        'neowise': 'La belle comète de l’été 2020, dans la Grande Ourse.', 'tsuchinshan': 'Une comète du soir en octobre 2024.',
        'a1859': 'Des aurores très lumineuses, visibles jusque dans la mer des Caraïbes.', 'a1872': 'Une grande aurore décrite dans la revue britannique Nature.',
        'a1882': 'Une tempête magnétique et une aurore décrites dans la revue britannique Nature.', 'a1909': 'Une tempête magnétique si forte que l’aurore est descendue jusqu’aux tropiques.',
        'a1921': 'Des aurores vues à des latitudes très basses.', 'a1989': 'La tempête qui a plongé le Québec dans le noir ; des aurores intenses.',
        'a2003': 'Des aurores vues jusque dans le sud de l’Europe.', 'a2024': 'Des aurores vues en France à l’œil nu ({n} observateurs l’ont signalé).'}


def sparql(q):
    u = 'https://query.wikidata.org/sparql?' + urllib.parse.urlencode({'query': q})
    with urllib.request.urlopen(urllib.request.Request(u, headers={**UA, 'Accept': 'application/sparql-results+json'}), timeout=120) as r:
        return json.load(r)['results']['bindings']


def elements(qids):
    vals = ' '.join('wd:' + q for q in qids if q)
    rows = sparql(f'SELECT ?item ?e ?q ?i ?node ?w ?tp WHERE {{ VALUES ?item {{ {vals} }} ?item wdt:P1096 ?e ; wdt:P2244 ?q ; wdt:P2045 ?i ; wdt:P2213 ?node ; wdt:P2248 ?w ; wdt:P11796 ?tp . }}')
    out = {}
    for b in rows:  # plusieurs valeurs possibles : la première, arrondie
        q = b['item']['value'].rsplit('/', 1)[1]
        out.setdefault(q, {'T': round(float(b['tp']['value']), 4), 'q': round(float(b['q']['value']), 6), 'e': round(float(b['e']['value']), 6),
                           'i': round(float(b['i']['value']), 4), 'node': round(float(b['node']['value']), 4), 'w': round(float(b['w']['value']), 4)})
    return out


def france_2024():
    u = 'https://zenodo.org/api/records/12732615/files/aurora_data_survey.csv/content'
    with urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=120) as r:
        text = r.read().decode('utf-8')
    n = eye = 0
    for row in csv.DictReader(io.StringIO(text)):
        try:
            lo, la = float(row['Geographic longitude (deg)']), float(row['Geographic latitude (deg)'])
        except ValueError:
            continue
        if 42.3 <= la <= 51.1 and -5 <= lo <= 8.2:  # le rectangle de la France métropolitaine
            n += 1; eye += 1 if row['Colours, naked eye'].strip() else 0
    return n, eye


def main():
    el = elements([c[5] for c in COMETS])
    events = []
    for cid, name, a, b, peak, qid, art, ev, bornes in COMETS:
        row = {'id': cid, 'kind': 'comete', 'name': name, 'from': a, 'to': b, 'desc': DESC[cid], 'src': f'Wikipédia : {art}', 'url': wp(art), 'evidence': ev}
        if peak: row['peak'] = peak
        if bornes: row['bornes'] = bornes
        if qid:
            row['wikidata'] = qid
            if qid in el: row['el'] = el[qid]
        events.append(row)
    n, eye = france_2024()
    for aid, name, a, b, src, url, ev, chk in AURORAE:
        row = {'id': aid, 'kind': 'aurore', 'name': name, 'from': a, 'to': b, 'desc': DESC[aid], 'src': src, 'url': url, 'evidence': ev}
        if chk: row['bornes'] = chk
        if aid == 'a2024': row['desc'] = DESC[aid].format(n=eye); row['bornes'] = f'relevé ARCTICS : {n} observations depuis la France, dont {eye} avec des couleurs vues à l’œil nu'
        events.append(row)
    events.sort(key=lambda r: r['from'])
    doc = {'title': 'Il a pu voir… — grandes comètes et grandes aurores', 'version': 1, 'count': len(events), 'checked': '2026-11-24',
           'licence': 'CC BY-SA 4.0 (citations de Wikipédia) ; éléments d’orbite : Wikidata (CC0)', 'licence_url': 'https://creativecommons.org/licenses/by-sa/4.0/deed.fr',
           'credit': 'Liste faite pour LCNDA : dates de visibilité à l’œil nu lues dans les articles de Wikipédia en français (citations dans « evidence »), éléments d’orbite de Wikidata, aurores d’après Wikipédia, Wikidata, Nature et Science (archives Zenodo) et le relevé ARCTICS 2024.',
           'note': 'from / to : les jours où l’on pouvait la voir à l’œil nu depuis l’Europe (comètes) ou les nuits de l’aurore ; « bornes » dit comment une date vague a été lue. el : éléments d’orbite J2000 (T jour julien du périhélie, q en ua, angles en degrés).',
           'skipped': SKIPPED, 'events': events}
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, indent=0)
    print(OUT, len(events), 'lignes', os.path.getsize(OUT), 'octets', 'éléments :', sorted(el))


if __name__ == '__main__':
    main()
