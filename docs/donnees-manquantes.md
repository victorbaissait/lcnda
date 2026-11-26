# Données manquantes dans LCNDA — l'état des lieux (26 novembre 2026)

Question : « et il manquerait quoi comme données dans l'app ? ». Réponse en quatre parties :
**(A)** ce qui est promis mais pas encore fabriqué, **(B)** ce qui manque vraiment (classé par intérêt pour un généalogiste
français), **(C)** ce qui mérite seulement un lien, **(D)** ce qui n'est pas possible.

## Ce qui existe déjà (résumé de l'inventaire)

- **253 packs** dans `assets/data/manifest.json` (identique au sommaire en ligne de la branche), ≈ 390 listes de données
  enregistrées (`LCNDA_EXT.dataLists`), rangées dans les **20 thèmes** de `app-listes-themes.js` (séismes, eaux, ciel, guerres,
  monuments, village, images, lieux, pouvoirs, noms, personnes, métiers, terre, routes, croire, prix, livres, fêtes, événements,
  sport).
- **Packs téléchargés à part** (versions GitHub) : Bases officielles (Léonore, Morts pour la France 1914-1918), annuaires de Paris
  1787-1914 (SoDUCo), élections, GOV, histoire du lieu, prénoms (Insee par département 1900-2023, Suisse, Québec…), lieux-dits et
  patrimoine (IGN, Mérimée, Palissy, par département), cartes OSM hors ligne (6 régions).
- **Livré avec l'app** : historique officiel des communes depuis 1943 (`data/reference/frontieres`), atlas de l'Ancien Régime
  (généralités, bailliages, diocèses, provinces, gouvernements, parlements), maires (Wikidata), DicoTopo, Joanne 1869, CASIAS,
  moulins ROE, repères de crues, hôpitaux / hospices / orphelinats / prisons / bagnes / couvents (Wikidata), métiers anciens
  (502), latin des registres, calendrier républicain, saints du jour, prix (Allen-Unger), SGF « mouvement de la population ».
- **Liens déjà présents** (vérifiés par recherche dans le code) : FranceArchives, Mémoire des hommes, matricules, tables
  décennales, Léonore, ANOM, Maitron, Mémorial de la Shoah, Arolsen, Livre-Mémorial FMD, Yad Vashem, Sycomore, Géopatronyme,
  Cassini (EHESS et IGN), carte d'état-major, inscrits maritimes (SHD), optants 1872, huguenots, Acadie, PRDH, Fichier Origine,
  BAnQ, archives belges, suisses et luxembourgeoises, FamilySearch (catalogue), Antenati, PARES, Geneteka, Ortsfamilienbücher,
  CompGen, Archion, Matricula, WieWasWie, Open Archives (recherche en direct), CEMLA, Castle Garden, Ellis Island, Bremen,
  FreeBMD, FreeCEN, ScotlandsPeople, Find a Grave, BillionGraves, JewishGen, CWGC, Volksbund, ABMC, CICR (prisonniers 14-18).

Méthode : chaque idée a été cherchée dans `assets/js`, `lib`, `scripts` et `config` avant d'être gardée. Licences lues le
26/11/2026 : data.gouv.fr (champ « licence » de l'API et page du jeu de données) et insee.fr (mentions légales). **Pages non
lues** : nationalarchives.gov.uk, archives.gov, gedbas.genealogy.net, openarchieven.nl (hôtes refusés par le réseau de
l'atelier) ; francearchives.gouv.fr renvoie une page « JS + cookies » anti-robot : pas contournée, on passe par les fichiers
ouverts que FranceArchives dépose sur data.gouv.fr.

---

## (A) Promis mais pas encore fini

1. **🌦 Météo d'autrefois — le socle** (`meteo-socle.sqlite`, ≈ 550 Mo) : l'atelier « Données météo » tourne depuis le
   26/11 à 19 h 31 (UTC) ; aucune version « meteo-donnees » n'existe encore, donc rien à installer. Idem pack Europe et
   compléments Copernicus.
2. **🗺 Cartes OpenStreetMap hors ligne** : 6 régions fabriquées (Auvergne, Bourgogne, Centre, Île-de-France, Limousin,
   Lorraine) ; les autres régions et l'outre-mer restent « pas encore en ligne ».
3. **Lot L, fabriqués seulement sur GitHub** : `tl-cimetieres` (cimetières du monde, Wikidata CC0, liste déjà déclarée),
   `tl-mines` (USGS MRDS), `tl-lieux_gb` (OS Open Names), `tl-bagnards` (State Library of Queensland) : absents du sommaire,
   bien que le dernier passage du lot L ait réussi.
4. **Lot I, `ti-maregraphe`** (niveau de la mer à Brest et Marseille, PSMSL) : absent ; le dernier passage du lot I a échoué.
5. **Lot K, musées du monde `tk-musees_<continent>`** : aucun des 5 packs n'est fabriqué. **`tk-patrimoine_<pays>`** :
   9 sur environ 30 (Andorre, Irlande, Islande, Liechtenstein, Luxembourg, Lettonie, Monaco, Malte, UNESCO). Il manque
   notamment la Belgique, la Suisse, l'Allemagne, l'Italie, l'Espagne, le Royaume-Uni, le Canada et les États-Unis.
   Un passage est en cours.
6. **Lot J, `tj-noms` et `tj-fusions`** : les pays que Wikidata a refusés (« abandonné ») sont à refaire (`quoi = noms`, puis
   `fusions`). GNIS, Kartverket et CGNDB restent en lien « à fabriquer plus tard ».
7. **Lot K, idée 39 : populations des villes de 3700 av. J.-C. à 2000** (Reba et al., CC0) : en lien seulement, car figshare
   et SEDAC étaient refusés. À fabriquer.
8. **Brevets d'invention INPI (XIXᵉ s.)** : pas fabriqués. Le fichier « open data » n'est envoyé que par courriel, après
   ouverture d'un compte. On garde la recherche sur le site de l'INPI.
9. **Communes d'Europe (GISCO LAU)** : rien n'est déclaré dans le code. Il n'y a que les NUTS 2024, plus les communes de
   France, Belgique, Suisse et Luxembourg et les comtés des États-Unis. Voir B-20.
10. **Prénoms des États-Unis (SSA)** : annoncés dans le pack « Prénoms d'ici et d'ailleurs », mais le dernier passage de
    l'atelier « Données des prénoms » a été sauté (« skipped »). À vérifier.
11. **Traduction hors ligne (Argos, lot D)** : l'installation réelle n'a jamais été essayée (essai simulé seulement).
12. **Puits et forages BRGM (BSS, lot E)**, **insurgés de 1848 et poursuivis de 1851 (Farcy)** : en lien seulement, car les
    sites étaient injoignables. À refaire en pack si la licence se confirme.

---

## (B) Ce qui manque vraiment : les 38 premiers, par thème

Rang = intérêt pour un généalogiste français (1 = le plus utile). « Pack » = téléchargeable et utilisable sans Internet.

### 🏛 Archives et registres

1. **Registres en ligne commune par commune et année par année** : savoir si l'acte de 1793 de tel village est vraiment
   en ligne, au lieu d'une limite pour tout le département. Sources : inventaires des AD 04
   (data.gouv « registres-d-etat-civil-numerises-par-les-archives-departementales-des-alpes-de-haute-provence »), 22
   (paroissiaux et état civil, `datarmor.cotesdarmor.fr`) et 65 (registres 1893-1922). **Licence Ouverte 2.0** (champ
   data.gouv). **Pack**, < 1 Mo, à compléter quand d'autres AD publient. → pastilles 🏛 `archives-dispo`, « Où chercher ».
2. **Inventaires des archives communales (FranceArchives)** : plus de 4 000 inventaires, avec le titre, les dates, la commune
   et le lien. On voit ce que la mairie a gardé (cadastre, délibérations, registres anciens). data.gouv
   « liste-des-inventaires-darchives-communales-sur-francearchives », **Licence Ouverte 2.0**, CSV de 2,5 Mo (≈ 0,6 Mo
   compressé). **Pack.** → fiche du village, « Où chercher ».
3. **Inventaires des Archives départementales (FranceArchives)** : 56 300 inventaires (séries B notaires et justice, L
   Révolution, Q biens nationaux, R conscription, X assistance…). data.gouv
   « liste-des-inventaires-darchives-departementales-sur-francearchives », **Licence Ouverte 2.0**, CSV de 37 Mo (≈ 6 Mo
   compressé). **Pack.** → « Où chercher », thème 🔎 personnes, « Les séries, c'est quoi ? ».
4. **Lieux indexés par FranceArchives** : pour chaque commune, le lien vers tout ce que les archives ont indexé sous son nom.
   data.gouv « portail-francearchives-les-lieux-des-archives », **Licence Ouverte 2.0**, 7,4 Mo (≈ 2 Mo). **Pack.** → fiche du
   lieu, ligne « 🏛 Ce lieu dans les inventaires ↗ ».
5. **Familles et institutions indexées par FranceArchives** : fonds de famille, seigneuries, couvents, études de notaire.
   data.gouv « portail-francearchives-autorites-personnes-familles-et-institutions », **Licence Ouverte 2.0**, 21,7 Mo.
   **Pack filtré** : familles et institutions seulement ; une personne n'entre que si sa date de mort est connue. → fiche
   d'une personne (homonymes), « Notaires et justice ».
6. **Actes des notaires de Paris, XVIIᵉ – début XXᵉ s.** : inventaires analytiques de six études du Minutier central.
   Archives nationales, data.gouv « les-donnees-du-hackathon-des-archives-nationales », fichier 02 (2,1 Mo). Licence « non
   spécifiée » : ce sont les mêmes informations publiques que Léonore, déjà réutilisée (CRPA L321-1, en citant la source).
   **Pack**, en s'arrêtant à 1925. → « Notaires et justice », rapprochements avec les fiches décédées.
7. **Décrets de naturalisation de 1887 et 1890** : retrouver un ancêtre italien, belge ou allemand devenu français. Même
   jeu de données (fichier 05, 3,3 Mo), même licence. **Pack** (petit). → thème 🔎 personnes, « Émigration et outre-mer ».

### ⚔️ Guerres et mémoire

8. **Morts pour la France publiés par les collectivités** : Loire-Atlantique (25 994 soldats 1914-1918), Toulouse, Lorient,
   Orvault, Belfort (1914-1918 **et 1939-1945**). data.gouv, **Licence Ouverte 2.0** (lu pour chacun). **Pack** ≈ 2 Mo, à
   joindre à « Morts pour la France » (`bo-mpf`). Antibes reste exclu : pas de date de naissance.
9. **Monuments aux morts de France (MémorialGenWeb)** : le lien direct vers la fiche du monument de chaque commune, avec ses
   noms. data.gouv « liste-des-monuments-aux-morts », **CC BY-SA**, 3,5 Mo (2016). Positions possibles par l'OSM (data.gouv,
   **ODbL**). **Pack** (des lieux seulement, pas de noms copiés). → fiche du village, carte « Cimetières et monuments ».
10. **Plaques commémoratives 1939-1945 de Paris** : des résistants, des déportés et des fusillés à l'adresse où ils
    vivaient ou sont tombés. Ville de Paris, **ODbL** (jeu « plaques-commemoratives-1939-1945 »). **Pack** de moins de
    200 Ko : des personnes mortes, honorées publiquement. → plan des adresses de Paris, fiche d'une personne.

### 📊 Chiffres d'époque (Statistique générale de la France)

Les trois packs suivants sont publiés par l'Insee sous **Licence Ouverte 2.0**, mention « Source : Insee »
(`insee.fr/fr/information/2008466`, lu).

11. **L'école primaire de 1829 à 1897, par département** (écoles, élèves, maîtres ; chefs-lieux et villes en 1881 et 1896) :
    « Quand ton arrière-grand-père allait à l'école, dans son département… ». Insee 2659830. **Pack** ≈ 0,5 Mo. → fiche
    d'une personne (âge scolaire), monographie, thème 💶 chiffres.
12. **Les recensements de 1851 à 1921, par département** (âges, professions, étrangers). Insee 2653233. **Pack** ≈ 1-2 Mo.
    → « Son département au recensement de 18.. », 🔀 chiffres.
13. **Territoire et population, 1800-1890** (superficie, population, densité). Insee 2591293. **Pack** ≈ 0,5 Mo. → fiche
    du département, frise.

### 📖 Mots, maladies, lecture des actes

14. **Dictionnaire des maladies et causes de mort d'autrefois** (fièvre putride, mal caduc, fluxion de poitrine, phtisie,
    suites de couches… ≈ 300 mots ; aujourd'hui `l8a-maladies` n'en a que 8). Rédigé pour LCNDA comme `metiers-anciens`
    (CC BY-SA 4.0), avec Littré 1873 (domaine public) et le Wiktionnaire (CC BY-SA 4.0). **Pack** ≈ 60 Ko. → fiche du décès,
    🩺 Santé de la famille, transcription.
15. **Petit glossaire des formules des actes** (« honnête femme », « feu », « sieur », « veuve en premières noces »,
    « majeur de 25 ans »…). Rédigé pour LCNDA (CC BY-SA). Le latin existe déjà, le français ancien manque. **Pack**
    ≈ 40 Ko. → transcription, aide à la lecture.
16. **Expilly, *Dictionnaire géographique des Gaules et de la France* (1762-1770)** : l'article de chaque paroisse sous
    l'Ancien Régime, comme Joanne pour 1869. Domaine public, OCR d'Internet Archive. Les conditions d'Internet Archive
    sont à relire, comme pour `tc-joanne`. **Pack** ≈ 10 Mo, refait sur GitHub. → fiche du village, « Le lieu à travers
    le temps ».

### 👑 Ancien Régime

17. **Élections et subdélégations fiscales en 1789** : les seules couches que l'atlas `dp-ancien-regime` n'a pas
    (`build-ancien-regime.py` le dit). Elles servent à chercher les rôles de taille et la capitation. Aucune source ouverte
    vérifiée pour l'instant : cartes Wikimedia Commons CC BY-SA, comme pour les diocèses ? **À vérifier**, ≈ 0,3 Mo.
    → « Sous l'Ancien Régime ».

### 🗺 Lieux et cartes

18. **Cadastres napoléoniens en données ouvertes** : Hauts-de-Seine (Licence Ouverte), Doubs (ODbL), Brest et Avignon
    (Licence Ouverte 2.0), selon data.gouv. **Pack ou couche**, à étendre département par département ; taille : des
    images, de quelques centaines de Mo à plusieurs Go. → 🗺 Cadastre, Cartes anciennes (le calage existe déjà).
19. **Anciens noms des rues hors de Paris** : Boulogne-Billancourt (Licence Ouverte, data.gouv), puis Lyon, Bordeaux,
    Toulouse, Nantes si leurs portails en publient. Aujourd'hui seul Paris est couvert (`br-paris`). **Pack**, < 1 Mo par
    ville. → boussole des rues, plan des adresses.
20. **Communes d'Europe (Eurostat GISCO LAU)** : placer un ancêtre né en Italie, en Allemagne ou en Pologne sur sa
    commune, et pas seulement sur sa province NUTS 3. Licence « © EuroGeographics » : la page de conditions n'a pas pu
    être lue d'ici, à relire avant toute fabrication. **Pack** ≈ 30-60 Mo. → cartes, « Lieux à placer ».
21. **Changements de communes en Italie depuis 1861** (ISTAT « Variazioni amministrative ») : il n'y a aujourd'hui qu'un
    lien. Licence ISTAT non lue d'ici (annoncée CC BY). **Pack si confirmé**, ≈ 1 Mo. → contrôle « commune qui n'existait
    pas » à l'étranger.
22. **Changements de communes en Suisse** (OFS, répertoire historisé des communes, aujourd'hui un lien `agvchapp`). Licence
    OFS non lue d'ici. **Pack si confirmé**, < 1 Mo. → même contrôle, fiche du lieu.
23. **Changements de communes en Espagne depuis 1842** (INE « Alteraciones de los municipios », aujourd'hui un lien). Licence
    non lue. **Pack si confirmé**, ≈ 1 Mo.
24. **Communes des Pays-Bas depuis 1812** (Repertorium van Nederlandse gemeenten, HisGIS / DANS ; aujourd'hui un lien).
    Licence non lue. **Pack si confirmé.**
25. **Noms de lieux du Québec, y compris les anciens** (Commission de toponymie ; aujourd'hui un lien). Licence de Données
    Québec non lue d'ici. **Pack si confirmé**, ≈ 5 Mo. → noms de lieux du monde (`tj-noms`).

### 🔎 Retrouver une personne (hors de France)

26. **Index de The National Archives (Discovery API)** : testaments anglais (PCC), soldats, naturalisations britanniques.
    La licence n'a pas pu être lue (hôte refusé) ; Discovery est annoncée sous Open Government Licence. **Recherche en
    direct, comme Open Archives** : un nom seulement, jamais pour une fiche vivante ou confidentielle. Pas de pack.
    → « Où chercher », Royaume-Uni.
27. **Catalogue des archives américaines (NARA Catalog API)** : naturalisations, listes de passagers, recensements. Page
    non lue (hôte refusé), annoncée dans le domaine public. **Recherche en direct**, même prudence. → États-Unis — émigration.

### 🏘 Village et patrimoine

28. **Ordres religieux des abbayes et couvents** : savoir quel ordre tenait l'abbaye voisine (cisterciens, bénédictins,
    ursulines…), avec les dates de fondation et de suppression. Wikidata **CC0** (P611 « ordre religieux », P571, P576) ;
    à ajouter au pack `ha-institutions`, qui a les lieux mais pas l'ordre. ≈ +0,3 Mo. → fiche de l'édifice, thème ✝️.
29. **Foires et marchés d'autrefois** : `l8c-foires` n'a que 31 lignes. Les almanachs du XIXᵉ siècle (Internet Archive,
    domaine public) listent les foires de chaque commune avec leurs dates. **Pack**, OCR fabriqué sur GitHub, ≈ 2 Mo.
    → fiche du village, métiers (marchands, maquignons).
30. **Paroisses de 1789 et leur saint patron** : retrouver la paroisse d'avant 1790 et sa fête patronale. Wikidata CC0
    (P417 « patron », lieux de culte avant 1790). À joindre à `dp-ancien-regime`. ≈ 0,5 Mo. → fiche du village, saint du jour.

### ⚔️ Soldats, autres sources

31. **Généraux et officiers de la Révolution et de l'Empire** : le dictionnaire de G. Six (1934) n'est sans doute pas libre ;
    on passerait par Wikidata (CC0) : généraux nés dans la commune, avec leurs dates. **Pack** ≈ 0,3 Mo. → thème ⚔️,
    « nés ici ».
32. **Gardes nationales et levées de 1792-1793** : pas de base ouverte nominative. Le pack 3 (inventaires AD, série R)
    donne les cotes par commune. **Couvert par 3** : rien de plus à fabriquer.

### 💶 Prix et vie quotidienne

33. **Prix du blé par département (mercuriales, XIXᵉ s.)** : `prix-europe` donne les villes d'Europe, pas les
    départements. La SGF les a publiés (*Annuaire statistique*), mais aucun fichier ouvert n'a été trouvé sur insee.fr dans
    les séries SGF. **À chercher** ; sinon lien vers Gallica (C).
34. **Tables de mortalité anciennes** (Deparcieux 1746, Duvillard 1806) : « à 30 ans en 1800, combien d'années à vivre ? ».
    Chiffres du domaine public, recopiés. **Pack** de quelques Ko. → calculette, fiche d'une personne.

### 🌍 Belgique, Suisse, Luxembourg, Québec

35. **Belgique, population des communes depuis 1831** (Statbel, open data annoncé CC BY 4.0 ; page non relue). Ce serait
    l'équivalent de « Population des communes 1876 → 2023 ». **Pack si confirmé**, ≈ 1 Mo.
36. **Luxembourg, anciennes communes et fusions** (data.public.lu, CC0 pour les communes actuelles déjà utilisées) : le
    jeu « historique » est à chercher. **Pack si trouvé.**
37. **Québec, paroisses catholiques et leurs dates d'ouverture** (Wikidata CC0) : savoir dans quelle paroisse chercher
    avant 1900. **Pack** ≈ 0,2 Mo, à joindre à `l10t-quebec`.
38. **Suisse, lieux d'origine (Heimatort) et communes de bourgeoisie** : expliquer qu'on cherche l'acte dans la commune
    d'origine et non dans celle de naissance. Texte rédigé, plus les communes OFS (voir 22). **Petit pack** de texte.

---

## (C) À ajouter seulement en lien

Aucun de ces liens n'existe aujourd'hui (vérifié par recherche dans le code). Un lien ne copie rien : il suffit de citer
le site.

- **Bulletin des lois (naturalisations, pensions, 1789-1931)** — Gallica, recherche plein texte « Bulletin des lois » + nom.
- **Compagnie des Indes, rôles d'équipage 1720-1794** — Mémoire des hommes (SHD Lorient) ; le lien « rôles d'équipage »
  vers FranceArchives existe, pas celui-là.
- **STO, requis du travail obligatoire** — SHD Caen (DAVCC) et FranceArchives (recherche « STO ») ; seulement pour les
  personnes décédées.
- **Médaille de la Résistance (base des médaillés)** — Ordre de la Libération ; aujourd'hui, le mot n'apparaît que comme
  exemple dans un champ.
- **Liste générale des émigrés de la Révolution (1793-1800)** — Gallica et AN série F⁷ (FranceArchives).
- **Tirage au sort et listes de conscription (an VII - 1872)** — FranceArchives, série R des AD (en plus des matricules).
- **Gardes mobiles et armée de la Loire, 1870-1871** — Mémoire des hommes, SHD et AD.
- **GEDBAS** (arbres allemands, genealogy.net) — page non lue d'ici (hôte refusé).
- **Listes de passagers de Hambourg 1850-1934** — Staatsarchiv Hamburg (indexées chez un site payant : lien seulement).
- **Red Star Line (Anvers, 1873-1934)** — base du musée Red Star Line.
- **Drouin (Québec)** — site payant, en lien comme les autres « Sites payants ».
- **HathiTrust** — livres anciens numérisés (généalogies, annuaires américains).
- **Forum Pages 14-18 et site Chtimiste** — historiques des régiments, entraide.
- **Prix du blé (mercuriales) et salaires de la SGF** — Gallica, *Annuaire statistique de la France* (si B-33 ne trouve
  pas de fichier).
- **Plaques commémoratives d'autres villes** — Antibes (Licence Ouverte, data.gouv) : lien vers le jeu ouvert, ou pack
  comme B-10.

---

## (D) Pas possible, et pourquoi

- **Noms de famille 1891-1990 par département (Insee / Géopatronyme)** : aucun fichier ouvert n'a été trouvé ;
  Géopatronyme est un service propriétaire. Le lien existe : on n'en fait pas un pack.
- **Listes nominatives de déportés (Mémorial de la Shoah, Livre-Mémorial FMD, Arolsen)** : bases sous conditions, données
  sensibles ; les liens existent, on n'en fait jamais de pack. Même chose pour les **plaques 1939-1945 en version
  « licence non spécifiée »** : seule la version ODbL convient (B-10).
- **Maitron des fusillés** : notices protégées par le droit d'auteur ; lien seulement (déjà présent).
- **FranceArchives par le site** : il protège ses pages contre les robots (page « JS + cookies ») et on ne contourne pas.
  On passe par les fichiers ouverts de data.gouv.fr (B-2 à B-5).
- **Brevets INPI (XIXᵉ s.)** : le fichier ouvert n'est envoyé qu'après ouverture d'un compte et par courriel (voir A-8).
- **Indexations des matricules et de l'état civil faites par les AD** : licences différentes selon les sites, souvent des
  visionneuses protégées. Liens seulement (déjà présents).
- **Catalogue FamilySearch en masse, Geneanet, Filae, Ancestry** : conditions d'utilisation fermées ; liens seulement.
- **Maires et élus depuis 1990, naturalisations depuis 2016 (data.gouv)** : des personnes vivantes, ou sans intérêt
  généalogique. Exclu.
- **MémorialGenWeb « morts pour la France par département de naissance » (data.gouv)** : ce n'est qu'un modèle de 18 Ko,
  sans les données ; les noms restent sur MémorialGenWeb (lien).
- **Index de noms des Archives nationales (hackathon, fichier 06, 510 Mo)** : trop lourd, et il contient des noms du
  XXᵉ siècle (personnes peut-être vivantes). Lien vers la salle des inventaires virtuelle à la place.
- **Dictionnaire des généraux de G. Six (1934)** : sans doute pas encore dans le domaine public (date de mort de
  l'auteur à vérifier) ; on passe par Wikidata (B-31).
