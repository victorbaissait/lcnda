# Lot O — 75 nouvelles idées de données : ce qui existe, d'où ça viendrait, par où commencer

Préparé le 27 novembre 2026. **Rien n'est encore fabriqué** : ce fichier sert à décider et à construire ensuite.
La maquette des nouveaux outils est dans `docs/design/lot-o.html` (s'ouvre seule, en clair et en sombre).

## Comment j'ai vérifié

1. **Déjà dans l'app ?** Chaque idée a été cherchée (mots et synonymes, avec les accents) dans `assets/js`, `lib`, `scripts`,
   `config`, `assets/data/manifest.json` (253 packs), les listes de `assets/data/grands-mouvements.json` et la partie
   « Ce qui existe déjà » de `docs/donnees-manquantes.md`. Trois réponses :
   - **déjà là** : l'app le fait ; on dit où (rien à refaire, au plus une petite option) ;
   - **à moitié** : une partie existe ; on dit ce qui manque ;
   - **nouveau** : rien de tel dans l'app.
2. **D'où viendraient les données ?** Cinq sortes :
   - **Pack** : données ouvertes, fichier lisible d'ici → fabriqué ici, livré avec l'app ;
   - **Pack GitHub** : données ouvertes, mais le site est refusé par le réseau de l'atelier (OpenStreetMap, Persée, HAL,
     figshare) → fabriqué par un atelier GitHub (`.github/workflows/…`), comme les lots B, F, H ;
   - **Calcul** : rien à télécharger, l'app calcule avec l'arbre de l'utilisateur ou une formule, sur l'ordinateur ;
   - **Texte** : une courte explication écrite pour LCNDA (CC BY-SA, comme `metiers-anciens`), chaque phrase avec sa source
     (livre du domaine public, Wikipédia, Wikisource) et un lien ↗ ;
   - **Lien seulement** : la source n'est pas ouverte, ou sa licence n'a pas pu être lue.
3. **Jamais** : de copie de page web « à la main » (pas de moissonnage HTML), de contournement d'une protection anti-robot, ni rien
   sur une personne vivante. Les calculs sur l'arbre ne montrent jamais une fiche vivante ou confidentielle.

## Licences lues (le 27/11/2026)

- **Wikidata** — <https://www.wikidata.org/wiki/Wikidata:Copyright> (lu par `action=raw`) : « All structured data from the main,
  Property, Lexeme, and EntitySchema namespaces is available under the Creative Commons CC0 License ». → **CC0**.
- **Wikipédia en français** — <https://fr.wikipedia.org/wiki/Wikip%C3%A9dia:Citation_et_r%C3%A9utilisation_du_contenu_de_Wikip%C3%A9dia>
  (lu par `action=raw`) : « Le contenu textuel de Wikipédia est sous CC BY-SA 4.0, licence libre, laquelle permet une
  réutilisation gratuite… ». → **CC BY-SA 4.0** (phrases citées avec « les contributeurs de Wikipédia » et le lien).
- **Insee** — <https://www.insee.fr/fr/information/2008466> : « Sauf mention contraire, les informations publiques diffusées sur ce site
  (données, bases de données, publications, fichiers téléchargeables) sont mises à disposition sous la Licence Ouverte / Open
  Licence version 2.0 (Etalab). […] sous réserve de mentionner la source sous la forme « Source : Insee » ». → **Licence Ouverte 2.0**.
  La page des séries historiques SGF (<https://www.insee.fr/fr/statistiques/2591397>) ne propose que **4 séries** : territoire et
  population 1800-1890, recensements 1851-1921, mouvement de la population 1800-1925, enseignement primaire 1829-1897 —
  toutes déjà dans l'app (`tc-sgf-deces`, `tn2-sgf-*`). **Pas de salaires, pas d'agriculture (cheptel), pas de recrutement
  (taille des conscrits)** à l'Insee.
- **Zenodo 11196161** — « Postal horse relays and roads in France, from the 17th to the 19th centuries » (N. Verdier,
  T. Giraud, C. Mimeur, A. Bretagnolle) — <https://zenodo.org/records/11196161>, lu par l'API (`/api/records/11196161`) : champ
  licence **`odc-odbl`** ; description : « This database contains the postal horse roads and their relays from 1632 to 1833
  (7 dates). » Fichiers : relais et routes de 1632, 1708, 1733, 1758, 1783, **1810**, 1833 (CSV, ≈ 1,2 Mo en tout) +
  `Post_Roads.gpkg` (3,6 Mo). → **ODbL** (« © les auteurs, Zenodo, ODbL » ; les données dérivées restent sous ODbL).
- **Internet Archive** — la page des conditions (<https://archive.org/about/terms>) ne s'affiche qu'avec JavaScript :
  **page non lue**. On lit donc **la notice de chaque volume** (API `archive.org/metadata/<id>`), comme pour `tc-joanne` :
  - `bub_gb_j84Z0Ff54UAC` *Livre de poste… 1831* : `licenseurl` = « http://creativecommons.org/publicdomain/mark/1.0/ » ;
  - `livredeposteout00frangoog` *Livre de poste* 1841 : `possible-copyright-status` = « NOT_IN_COPYRIGHT » ;
  - `mlangessurlesla00mlgoog` *Mélanges sur les langues, dialectes et patois* (1831) : « NOT_IN_COPYRIGHT » ;
  - `enquteagricoled00unkngoog` *Enquête agricole, 2ᵉ série, enquêtes départementales* (1867) : « NOT_IN_COPYRIGHT » ;
  - `bub_gb_915TAAAAMAAJ` *Statistique du département de la Roer* (1804) : « publicdomain/mark/1.0 » ;
  - `1779885735-bmlbml-00-goo-0100137001104367318` *Salaires et coût de l'existence à diverses époques jusqu'en 1910*
    (Statistique générale de la France, 1911) : pas de champ licence ; publication de l'État de 1911, auteur collectif
    → domaine public par l'âge, **à confirmer** avant fabrication (le scan vient de la Bibliothèque municipale de Lyon,
    Numelyo : sa page de conditions n'a pas été lue).
- **Wikisource** — *Mémoires de Léonard, ancien garçon maçon* (Martin Nadaud, 1895 ; Nadaud est mort en 1898) : texte du
  domaine public, trouvé par l'API de recherche de fr.wikisource.org. → citations courtes avec le lien de la page.
- **OpenStreetMap** — <https://www.openstreetmap.org/copyright> : **page non lue** (hôte refusé par le réseau de l'atelier).
  Licence ODbL déjà citée et suivie par les packs `tb-osm-*`, `tf-osm-*`, `th-osm-*` (fabriqués sur GitHub). Même chemin ici.
- **Gallica** (conditions d'utilisation) : la page répond 403 depuis l'atelier → **page non lue** ; les lots précédents l'ont notée
  « réutilisation non commerciale » : **lien seulement**, jamais de copie.
- **Persée, HAL, figshare** : hôtes refusés → **pages non lues** ; aucune donnée prise là.
- **editmontbret.hypotheses.org** (édition des documents Coquebert de Montbret, S. Ködel) : **page non lue** ; lien seulement.

## Résumé

| | Nombre |
|---|---|
| **Déjà là** | 25 |
| **À moitié** | 32 |
| **Nouveau** | 18 |
| **Total** | 75 |

Les plus grosses surprises :
- Beaucoup d'idées « Arbre » **existent déjà** : conceptions avant mariage (diagramme 🤰), centre de gravité (🎯, diagramme et
  statistique), veuvage et remariage (💔), prénoms transmis par le parrain (🎀), savoir signer (✍️) et le mur des signatures,
  temps clos Avent/Carême (fiche et village), coefficient de consanguinité (Wright).
- **La carte des coutumes (droit écrit / coutume) et son explication du partage existent** (`l10-regles`, bloc « ⚖️ Les règles de
  sa vie », calque de carte). La maquette ne propose qu'une présentation plus claire.
- Gabelle, octroi, nourrices, terre-neuvas, compagnons du Tour de France, croix, lavoirs, fours, fontaines, pèlerinages,
  avalanches, épaves, choléra, villages de colonisation d'Algérie, célébrités du village, sons anciens, jouets, almanachs,
  population du monde : **tout est déjà là**.
- **Trouvaille** : une base ouverte (Zenodo, **ODbL**) de **tous les relais de poste et routes de 1632 à 1833**, dont **1810**.
  Elle remplace la liste Wikidata incomplète (`l10t-relais`) et permet le **temps de trajet vers Paris** par le vrai réseau.
- **Pas ouvert ou introuvable** : la taille des conscrits, le cheptel par commune, les salaires de la SGF ne sont **pas** à l'Insee ;
  il faut passer par des livres anciens (domaine public) ou rester en texte et lien. Les listes de passagers du Havre ont
  presque toutes disparu (lien seulement). Pas de base ouverte des brigades de gendarmerie anciennes, ni des dates
  d'électrification par commune.

Abréviations des endroits : **fiche** = fiche d'une personne ; **village** = fiche du village et monographie ; **Listes** = Listes →
thème ; **carte** = un calque de carte ; **⌘K** = la recherche rapide ; **🧭** = « 🧭 Je veux… » ; **Diagrammes** = « ＋ Nouveau
diagramme ». Effort : **petit** (moins d'une journée), **moyen** (1 à 3 jours), **gros** (plus).

---

## 🌳 Arbre (calculé avec l'arbre de l'utilisateur)

Aucune donnée à télécharger pour ce groupe : **Calcul** sur l'ordinateur, jamais pour une fiche vivante ou confidentielle.

1. **Carême et Avent dans les mariages** — **à moitié**. Existe : `heritage-lot10-regles-actes.js` (« 💒 temps clos » sur la fiche
   quand un mariage tombe pendant l'Avent ou le Carême ; mariages par mois d'une commune, avec la date de Pâques de chaque
   année, calendrier julien avant 1583). Manque : **le calendrier de toute la famille** (ou d'une branche), mois par mois, avec
   les temps clos grisés, et la liste des mariages « en temps clos » à vérifier. Source de la règle : déjà citée (Wikisource,
   domaine public). **Calcul** · ≈ 0 Ko · Diagrammes, Listes → 💒, ⌘K « mariages Carême », 🧭 « Voir quand ma famille se
   mariait » · effort **petit** (le calcul `tempsClos` existe).
2. **Dispense de consanguinité** — **à moitié**. Existe : coefficient de consanguinité F (Wright) et boucles d'implexe
   (`heritage-diagram-lot-a.js`). Manque : **le degré selon l'Église** (comput germanique : on compte les générations jusqu'à
   l'ancêtre commun, la plus longue branche) et **« fallait-il une dispense à cette date ? »** (jusqu'au 4ᵉ degré depuis le
   concile de Latran IV, 1215 ; jusqu'au 3ᵉ degré à partir du Code de 1917) ; plus l'affinité (beau-frère, belle-sœur).
   Texte : Wikipédia « Empêchement de mariage » (CC BY-SA 4.0) et canons du concile de Latran IV (domaine public, Wikisource).
   **Calcul + Texte** · < 5 Ko · fiche du couple (« 🔗 Ils étaient cousins au 3ᵉ degré : dispense nécessaire »), outil à la demande
   (deux personnes), « Où chercher » (dispenses dans les registres de l'évêché, série G des AD — lien vers `tn-inv-dep`) ·
   effort **moyen**.
3. **Conceptions prénuptiales (avec tact)** — **déjà là** : diagramme « 🤰 Conceptions avant mariage » (`heritage-diagram-vie.js`,
   premier enfant né avant le mariage ou moins de 8 mois après). À ajouter seulement : l'**option de tact** — par défaut, des
   nombres et des pourcentages par époque, **sans noms** ; « montrer les personnes » rangé dans ⚙️ Personnaliser ; une phrase
   qui remet dans le contexte (c'était courant). **Calcul** · effort **petit**.
4. **Centre de gravité de la famille** — **déjà là** : diagramme « 🎯 centre de gravité par génération » (`heritage-diagram-plus.js`)
   et statistique « Migration — centre familial ». Rien à faire (la maquette le rappelle).
5. **Rayon des mariages** — **à moitié**. Existe : « 🎼 Diagramme d'accord » (mariages entre villages), « 🧭 Loin du berceau »,
   « 🚶 Le temps de marche jusqu'à son conjoint » (une personne, `heritage-lot10-terre-gens.js`). Manque : **pour toute la
   famille**, la distance entre les villages des deux époux, siècle par siècle (médiane, « 8 mariages sur 10 à moins de 12 km »)
   et le cercle sur la carte. **Calcul** · Diagrammes, carte, Listes · effort **petit**.
6. **Délai de remariage** — **déjà là** : « 💔 Veuvage et remariage » (temps avant de se remarier, hommes et femmes) et
   statistique « Remariage, veuvage, célibat ». Rien à faire.
7. **Parrain → prénom** — **déjà là** : diagramme « 🎀 les prénoms transmis » (parrain ou marraine → filleul) et les pistes
   « même prénom que son parrain » (`heritage-more.js`). Rien à faire.
8. **Posthumes et orphelins** — **à moitié**. Existe : le contrôle « Enfant posthume » (`heritage-controle.js`). Manque : la
   **liste avec tact** des enfants nés après la mort du père, et des enfants qui ont perdu un parent avant 10 ans (âge, qui les
   a élevés : tuteur, remariage du parent survivant), plus un chiffre par génération. **Calcul** · fiche (« Il avait 4 ans quand
   son père est mort »), Listes, Diagrammes · effort **petit**.
9. **Quand la famille a quitté la terre** — **à moitié**. Existe : métiers dans le temps, par génération, par branche, et la part
   des métiers de la terre comparée à la France (« Ta famille et l'histoire de France »). Manque : **la phrase** « Ta famille a
   quitté la terre à la 4ᵉ génération (vers 1890, avec Jean MAZAUD, devenu cheminot) », branche par branche. Classement des
   métiers déjà fait par `metiers-anciens`. **Calcul** · fiche, Diagrammes, 🧭 · effort **petit**.
10. **Chaîne des signatures** — **à moitié**. Existe : « ✍️ Le mur des signatures » (Trésors : toutes les signatures découpées,
    rangées par époque) et « ✍️ Savoir signer » (pourcentages). Manque : **la chaîne** de père en fils (ou de mère en fille),
    une signature par génération, avec l'année et l'acte 📎. Réutilise les signatures identifiées. **Calcul** · Trésors, fiche,
    impression · effort **petit**.

## 🚶 Partir

11. **Migrations saisonnières** (maçons creusois, ramoneurs savoyards, scieurs de long, moissonneurs) — **à moitié**. Existe :
    `grands-mouvements.json` (CC BY-SA, écrit pour l'app) contient « creusois » (1800-1914) et « savoyards » (1800-1914), et la
    carte des migrations. Manque : **le caractère saisonnier** (partir au printemps, rentrer à l'hiver), les **scieurs de long**
    (Livradois, Forez), les **moissonneurs** (Massif central → Bas-Languedoc, Bretons → Beauce), les **Auvergnats colporteurs**, et
    le repérage dans l'arbre (enfants nés tous en hiver, métier « maçon » noté à Paris). Sources : Martin Nadaud, *Mémoires
    de Léonard* (Wikisource, domaine public), Wikipédia « Maçons de la Creuse », « Ramoneur » (CC BY-SA 4.0). **Texte**
    (≈ 8 mouvements de plus, ≈ 15 Ko) + **Calcul** · carte « 🧳 migrations saisonnières », fiche, Listes → Histoire · effort **moyen**.
12. **Relais de poste et diligences (Livre de poste 1810)** — **à moitié**. Existe : `l10t-relais` (Wikidata, incomplet) et « 🐴 les
    relais de poste sur sa route ». Nouveau : la base **Zenodo 11196161** (ODbL), relais et routes de 1632 à 1833 dont 1810.
    **Pack** · ≈ 0,5 Mo compressé (7 dates) · fiche, village (« le relais le plus proche en 1810 : Uzerche, à 9 km »), carte
    « 🐴 routes de poste » avec le curseur des années · effort **moyen**.
13. **Temps de trajet vers Paris (1765, 1840, 1887)** — **à moitié**. Existe : `travel()` dans `app-cartes-outils-core.js` (distance
    × vitesse selon l'année : pied, cheval, diligence, train). Manque : le **vrai chemin** par les routes de poste (pack 12) et la
    **carte en anneaux de temps** depuis Paris (ou depuis le village de l'ancêtre). Les cartes célèbres d'Arbellot (1973) ne sont
    pas libres : on ne les recopie pas, on **recalcule** avec les routes ouvertes. **Calcul** (sur le pack 12) · carte, fiche
    (« en 1840, Paris était à 3 jours ½ de diligence »), 🧭 · effort **moyen**.
14. **Bacs et passeurs** — **nouveau**. Wikidata n'en connaît presque pas (4 « bacs » en France). OpenStreetMap a les traversées
    (`route=ferry`) et les anciens bacs (`historic=*`), sous **ODbL** (page non lue d'ici). **Pack GitHub** (atelier comme
    `tb-osm-*`) · ≈ 0,2 Mo · village (« un bac traversait la Dordogne ici »), carte, fiche d'un passeur ou marinier · effort **moyen**.
15. **Barrières d'octroi** — **déjà là** : « 🚧 L'octroi de sa ville » (`heritage-lot9-monde-coutumes.js`) et les bureaux d'octroi du
    lot B (`tb-wd-bornes`, `tb-osm-bornes`).
16. **Terre-neuvas, ports de grande pêche** — **déjà là** : « 🐟 Les terre-neuvas » (`heritage-telech-h.js`).
17. **Départs d'émigrants du Havre** — **à moitié**. Existe : mouvement « bretons-havre », liens d'arrivée (Castle Garden, Ellis
    Island, Bremen, Red Star Line à venir). Les listes de départ du Havre ont presque toutes disparu : pas de base ouverte.
    **Texte** (ce qu'on peut encore trouver : listes d'arrivée, passeports en série M des AD) + **Lien seulement** · fiche d'un
    émigré, « Où chercher » · effort **petit**.
18. **Colporteurs** — **nouveau**. Pas de base ouverte. **Texte** (les colporteurs de l'Oisans, du Briançonnais, du Cantal ; le
    livre de colportage ; le passeport intérieur) avec Wikipédia « Colportage » (CC BY-SA 4.0) · fiche d'un colporteur ou
    marchand ambulant, Listes → Métiers · effort **petit**.
19. **Nourrices du Morvan** — **déjà là** : « 👶 Les nourrices » (`heritage-lot9-monde-coutumes.js`) et les registres de nourrices dans
    « Où chercher ». Ajouter une phrase « Morvan » dans le texte existant suffit.

## 💶 Argent

20. **Salaires journaliers par métier et région (1852, 1882)** — **à moitié**. Existe : le salaire d'une journée (`app.js`, ordres de
    grandeur nationaux) et le « 💰 pouvoir d'achat ». Manque : **par département**. Source : SGF, *Salaires et coût de
    l'existence à diverses époques jusqu'en 1910* (1911), Internet Archive `1779885735-bmlbml-00-goo-0100137001104367318`
    (domaine public par l'âge, à confirmer). **Pack** de quelques tableaux recopiés (journaliers agricoles par département
    1852, 1862, 1882, 1892 ; quelques métiers de ville) · ≈ 30 Ko · fiche (« un journalier gagnait 1,60 F par jour en Corrèze en
    1852 »), calculette, Listes → 💶 · effort **moyen** (tableaux à relire à la main).
21. **« Combien de journées pour… »** — **déjà là** : « 💰 Le pouvoir d'achat » (somme → euros, kilos de pain, journées de travail,
    `heritage-tresors-decouvrir.js`) et l'onglet du convertisseur d'autrefois. Profitera du pack 20.
22. **Prix d'un remplaçant militaire** — **nouveau**. **Texte** : le remplacement (1800-1872), son prix (de 1 000 à plus de 2 000 F
    selon les années et les guerres), les compagnies d'assurance contre le tirage au sort ; Wikipédia « Remplacement militaire »
    (CC BY-SA 4.0). Exprimé aussi en journées de travail (calcul 21). · fiche d'un conscrit (« il a pu payer un remplaçant ? »),
    Listes → ⚔️ · effort **petit**.
23. **Tirage au sort, « mauvais numéro »** — **à moitié**. Existe : le lien « Tirage au sort et listes de conscription (an VII - 1872) »
    (`app-liens-archives-core.js`). Manque : **le texte** (bon et mauvais numéro, exemptions, durée du service selon les lois :
    déjà dans `scripts/droit-pouvoir/lois.json`) et la phrase sur la fiche d'un homme qui avait 20 ans entre 1800 et 1905.
    **Texte + Calcul** · fiche, Listes · effort **petit**.
24. **Caisses d'épargne (dates)** — **nouveau**. Wikidata n'en a presque pas (1 en France). **Texte** (1818 : Paris ; loi de 1835 ;
    Caisse nationale d'épargne postale 1881) + **Lien seulement** vers les archives des caisses · fiche (« le livret de caisse
    d'épargne de son époque »), Listes → 💶 · effort **petit**.
25. **Pays de grande et petite gabelle** — **déjà là** : « 🧂 Le prix du sel » et le calque de carte gabelle (lot 9), plus « 🧂 L'impôt
    du sel de son vivant » (lot 10).

## ⚖️ Lois

26. **Carte des coutumes (droit écrit / coutumier)** — **déjà là** : `l10-regles` (régimes par province, pays mixtes comme
    l'Auvergne, coutumes nommées comme Normandie, règles du partage « paterna paternis… », carte de Klimrath 1837 sur Commons),
    bloc « ⚖️ La coutume de son pays », calque de carte « droit écrit / coutume ». La maquette propose seulement une
    présentation plus lisible (carte + « ce que ça change pour l'héritage »).
27. **Justices de paix par canton (1790-1958)** — **nouveau**. Une justice de paix par canton, au chef-lieu : on peut le **calculer**
    avec les cantons et chefs-lieux (historique des communes livré, `communes-decoupage`), sans nouvelle donnée. **Calcul +
    Texte** (tutelles, conseils de famille, émancipations, conciliations ; archives en série U des AD, lien vers `tn-inv-dep`) ·
    fiche (« son conseil de famille se tenait chez le juge de paix de Seilhac »), village, « Où chercher » · effort **moyen**
    (les cantons d'avant 1943 sont à vérifier : l'historique officiel commence en 1943).
28. **Brigades de gendarmerie** — **nouveau**. Les fichiers ouverts de data.gouv.fr (« Point d'accueil gendarmerie », Licence
    Ouverte) sont **d'aujourd'hui** ; pas de liste ancienne ouverte. **Lien seulement** (Service historique de la Défense,
    gendarmerie ; registres de brigade aux AD) + une phrase · « Où chercher » · effort **petit**.
29. **Jours chômés, fêtes d'obligation** — **nouveau**. **Calcul + Texte** : avant 1802, des dizaines de fêtes selon le diocèse ; le
    Concordat (indult de 1802) n'en garde que 4 (Noël, Ascension, Assomption, Toussaint) en plus des dimanches ; la date de
    Pâques est déjà calculée. Sources : Wikipédia « Fête d'obligation » (CC BY-SA 4.0). · date d'un événement (« le 15 août
    1830 était une fête chômée »), bulletin du jour (73) · effort **petit**.

## 🌦 Nature

30. **Choléra 1832, 1849, 1854** — **déjà là** : `tc-sgf-deces` (Insee, Licence Ouverte), « ⚰️ Les années de choléra » et la liste
    « Épidémies, guerres, hivers terribles ».
31. **Épizooties** — **à moitié**. Existe : `et-fleaux` (phylloxéra, oïdium, mildiou, black-rot, pébrine). Manque : peste bovine
    (1814-1815, 1870-1871), fièvre aphteuse, péripneumonie. **Texte** (≈ 5 fléaux de plus dans `et-fleaux`, même forme, Wikipédia
    CC BY-SA 4.0) · fiche d'un éleveur, d'un laboureur · effort **petit**.
32. **Hannetons, sauterelles, grêle** — **nouveau**. Pas de base ouverte datée et placée. **Texte** (les « années à hannetons »,
    les procès faits aux insectes, les invasions de criquets en Provence ; la grêle et les assurances mutuelles) + la grêle
    notée par les stations dans la météo (`build-meteo.py` lit déjà la grêle) · fiche, monographie · effort **petit**.
33. **Rivières gelées, débâcles** — **à moitié**. Existe : `te-hivers` (chaque hiver depuis 1500) et les hivers terribles. Manque :
    les **rivières prises par les glaces** (Seine 1709, 1789, 1830, 1880 ; Loire 1789 ; débâcle de 1880). **Texte** (≈ 20 lignes
    datées, Wikipédia CC BY-SA 4.0) · fiche (« l'hiver de ses 10 ans, la Seine a gelé »), village au bord d'une rivière · effort **petit**.
34. **Avalanches historiques** — **déjà là** : `l10t-avalanches` (Wikidata, « 🏔️ Les avalanches historiques »).
35. **Cheptel communal 1852 et 1892** — **nouveau**. Pas à l'Insee. Les volumes de la *Statistique agricole* (1852, par canton) et
    de l'*Enquête agricole* existent en scans du domaine public (Internet Archive, « NOT_IN_COPYRIGHT ») mais ce sont des
    tableaux à lire par OCR, peu fiables. **Lien seulement** pour l'instant (volume par département) ; un **Pack** si un fichier
    déjà saisi et ouvert est trouvé · village · effort **gros** si on saisit.
36. **Taille des conscrits par canton** — **nouveau**. Pas à l'Insee ; aucun jeu ouvert trouvé (Zenodo : rien ; l'ouvrage de
    référence d'Aron, Dumont et Le Roy Ladurie, 1972, n'est pas libre). **Texte + petit Pack** recopié de publications du domaine
    public (exemptions pour défaut de taille par département dans les *Comptes rendus sur le recrutement de l'armée*,
    XIXᵉ siècle — volumes à retrouver et à relire) · fiche d'un conscrit (sa taille notée dans le registre matricule, comparée
    à la moyenne du département) · effort **moyen**. En attendant : **Lien seulement** (SHD).
37. **Régions du goitre** — **à moitié**. Existe : le mot « goitre » dans `tn2-maladies` (« manque d'iode : Alpes, Pyrénées,
    Vosges… »). **Texte** + petite carte des départements les plus touchés d'après le rapport Baillarger (1873, domaine public,
    à retrouver sur Internet Archive) · fiche (cause de décès, exemption au conseil de révision), carte · effort **petit**.

## 🏡 Village

38. **Croix de chemin, calvaires** — **déjà là** : `tb-wd-croix`, `tb-osm-croix` (lot B).
39. **Lavoirs, fours banaux, puits** — **déjà là** : `tb-wd-eau`, `tb-wd-village` et leurs versions OSM (lot B), fours banaux sur la
    fiche (lot H), puits BRGM en lien (lot E).
40. **Fontaines, sources miraculeuses, pèlerinages** — **déjà là** : `pm-fontaines` (« ⛲ Fontaines et saints ») et
    `l10o-pelerinages`.
41. **Carrières, ardoisières, tuileries** — **déjà là** : `metiers-mines` (mines et carrières, Wikidata), `casias` (tuileries,
    briqueteries), « 🕳️ Carrières et cavités » (Géorisques, lot 10).
42. **Arrivée de l'électricité, de l'eau, du téléphone, de la poste** — **à moitié**. Existe : « 🕯️ L'éclairage de sa rue (gaz,
    électricité) » (lot 9), `et-nouveautes` (les nouveautés en France). Manque : la date **par commune** — aucune base ouverte.
    **Lien seulement** : les monographies communales des instituteurs (1899), aux AD ; **Texte** pour les dates nationales
    (bureaux de poste ruraux en 1830, réseau électrique rural après 1920 : déjà en partie dans `et-nouveautes`) · village · effort **petit**.
43. **Télégraphe Chappe** — **nouveau**. ≈ 530 stations en France (1794-1855). Wikidata n'en connaît qu'une poignée ; OpenStreetMap
    a l'étiquette `historic=optical_telegraph` (ODbL, page non lue d'ici). **Pack GitHub** (OSM) + lignes du réseau en **Texte**
    (Wikipédia « Télégraphe Chappe », CC BY-SA 4.0) · ≈ 50 Ko · village (« une tour Chappe à 6 km, sur la ligne Paris-Lyon »),
    carte · effort **moyen**.
44. **Sapeurs-pompiers** — **nouveau**. Pas de base ancienne (Wikidata : 91 casernes en France, surtout d'aujourd'hui). **Texte**
    (compagnies communales au XIXᵉ s., pompe à bras, Sainte-Barbe) + **Lien** (archives communales, `tn-inv-communes`) · fiche
    d'un pompier, village · effort **petit**.
45. **Orientation et altitude de la maison** — **à moitié**. Existe : l'altitude du lieu (`heritage-meteo.js`), les maisons du hameau
    encore debout (BD TOPO, `heritage-lot10-voir-village.js`). Manque : **l'orientation** de la façade (calculée sur le contour
    du bâtiment) et la phrase « exposée au sud, à 420 m ». **Calcul** (sur ce qui est déjà demandé à la demande) · Maisons de
    famille, village · effort **petit**.

## 👥 Société

46. **Sociétés de secours mutuels** — **à moitié** : « 🎺 Sociétés d'autrefois » (phrase + liens, `heritage-telech-i.js`). Wikidata
    n'en a presque pas : rien de plus à fabriquer. **Texte** un peu plus long (cotisation, médecin, enterrement) · effort **petit**.
47. **Orphéons et fanfares** — **à moitié** : kiosques et sociétés de musique (`th-kiosques`, lot H) + « 🎺 Sociétés d'autrefois ».
    Rien de plus d'ouvert (Wikidata : 1 fanfare en France).
48. **Compagnonnage** — **déjà là** : « 🛠️ Les compagnons du Tour de France » (lot 9).
49. **Confréries** — **nouveau**. Wikidata : 14 en France. **Texte** (confréries de charité, de pénitents, du Rosaire ; leurs
    registres) + **Lien** (série G et V des AD, `tn-inv-dep`) · fiche, village · effort **petit**.
50. **Parabole de l'enfant prodigue en patois (enquête Coquebert de Montbret, 1806-1812)** — **nouveau**. Pas de jeu de données
    ouvert. Source utilisable : *Mélanges sur les langues, dialectes et patois* (Bottin, 1831), Internet Archive
    `mlangessurlesla00mlgoog`, « NOT_IN_COPYRIGHT » — plusieurs dizaines de versions de la parabole, chacune avec son lieu.
    **Pack** (OCR relu, une version par lieu, la plus proche du village) · ≈ 200 Ko · village (« voici comment on parlait près de
    chez lui en 1807 »), à côté de « 🎙️ Le parler de son coin » · effort **gros** (OCR des patois à relire).
51. **Jouets et jeux** — **déjà là** : `l9a-jouets` (Commons) et `td-jeux`.
52. **Menus de noce** — **à moitié** : « 💍 Les coutumes du mariage dans sa région » (lot 9), recettes du domaine public
    (`l9a-recettes`), menus de la NYPL en lien. **Texte** (repas de noce selon les régions, Wikipédia CC BY-SA 4.0) · effort **petit**.
53. **Almanachs** — **déjà là** : `td-almanachs` (« 📅 les almanachs de son année »).

## 📋 Enquêtes

54. **Mémoires statistiques des préfets (an IX - an XIII)** — **à moitié** : en lien seulement (`heritage-telech-c.js`). Possible :
    un **Pack de liens** — pour chaque département, le volume trouvé sur Internet Archive avec sa licence (exemple : Roer,
    1804, « publicdomain/mark/1.0 ») · < 20 Ko · village, monographie · effort **petit**.
55. **Enquête de 1848 sur le travail agricole et industriel** — **nouveau**. Réponses par canton, restées manuscrites (Archives
    nationales, C 943-969) ; aucune base ouverte. **Lien seulement** + une phrase · monographie, « Où chercher » · effort **petit**.
56. **Enquête agricole de 1866** — **nouveau**. Volumes publiés (1867-1872), domaine public, sur Internet Archive
    (`enquteagricoled00unkngoog`… « NOT_IN_COPYRIGHT »). **Pack de liens** par département (volume, page de la circonscription) ·
    village, fiche d'un cultivateur · effort **moyen** (retrouver chaque volume).
57. **Enquête de l'abbé Grégoire (1790, sur les patois)** — **nouveau**. Réponses publiées par A. Gazier, *Lettres à Grégoire sur les
    patois de France* (1880, domaine public) : volume **pas trouvé** sur Internet Archive ni Wikisource par la recherche d'ici.
    **Texte + Lien** (Wikipédia « Rapport Grégoire », CC BY-SA 4.0) · village (« ce que le curé de… répondait en 1790 » si la
    réponse existe) · effort **petit** pour le texte.

## ⚠️ Dangers

58. **Catastrophes minières** — **à moitié** : Courrières dans les crises, la cause « coup de grisou » repérée (`lib/heritage_more.php`).
    **Pack** Wikidata (CC0) : ≈ 40 catastrophes minières en France datées et placées (coups de grisou, effondrements) ·
    < 20 Ko · fiche d'un mineur (« 3 ans avant sa mort, le coup de grisou de… à 8 km »), village, Listes → ⚠️ · effort **petit**.
59. **Poudreries, incendies de villes** — **à moitié** : poudrières et poudreries (`tg-poudres`, lot G). Les grands incendies de
    villes : Wikidata n'en a qu'une dizaine en France avant 1950. **Texte** (≈ 20 grands incendies : Rennes 1720, Limoges 1864…,
    Wikipédia CC BY-SA 4.0) · village, crises · effort **petit**.
60. **Naufrages, épaves** — **déjà là** : `l10t-epaves` (« ⚓ Les épaves au large de son port »).
61. **Lieux d'exécution, grands procès anciens (avec tact)** — **à moitié** : `tm-affaires` (affaires criminelles, Wikidata). Les
    lieux d'exécution : **Texte seulement**, pas de carte (c'est un sujet blessant pour des familles) ; jamais rapproché d'une
    personne de l'arbre automatiquement · Listes → ⚖️ · effort **petit**.

## 🌍 Ailleurs

62. **Colons d'Algérie (lien ANOM)** — **déjà là** : `l10t-algerie` (« 🏘️ villages de colonisation ») et le lien ANOM.
63. **Barcelonnettes au Mexique** — **déjà là** : mouvement « barcelonnettes » (1821-1950) dans « 🌍 Ta famille dans les grands
    mouvements ».
64. **Basques et Béarnais d'Argentine et d'Uruguay** — **à moitié** : mouvements « basques-ameriques », « aveyron-argentine »,
    `tj-villages` (Pigüé…), liens CEMLA. Manque : l'**Uruguay** (Montevideo) et les sources uruguayennes. **Texte + Lien** · effort **petit**.
65. **Alsaciens du Texas (Castroville)** — **à moitié** : mouvement « alsaciens-usa » et Castroville dans `tj-villages`. **Texte**
    (Henri Castro, 1844) · effort **petit**.
66. **Français de Russie avant 1917** — **à moitié** : liens « Russie et URSS » (`app-sources-ouvertes-5-core.js`) ; mouvement
    inverse « russes-blancs ». Manque : **le mouvement** (gouvernantes, précepteurs, commerçants, colonie de Moscou et de
    Saint-Pétersbourg ; retour en 1918) en **Texte** (Wikipédia CC BY-SA 4.0) · fiche, grands mouvements · effort **petit**.

## 🎈 Amusant

67. **Voisins célèbres** — **déjà là** : « 🖋️ Les célébrités de passage » (lot 9) et « célébrités nées au même endroit »
    (`heritage-wikidata-autour.js`).
68. **Ce que coûtait une journée de travail à ses 20 ans** — **à moitié** : « 🪙 la pièce dans sa poche à 20 ans », pouvoir d'achat,
    prix (`prix-reference`). Manque : la **phrase** « À ses 20 ans (1872), une journée de journalier = 6 kg de pain » →
    **Calcul** (meilleur avec le pack 20) · fiche · effort **petit**.
69. **Le monde à sa naissance (populations)** — **déjà là** : « 🌍 La planète de son vivant » (`l9b-planete`) et « 🌍 les pays en
    chiffres » (`monde-chiffres`). Les villes (Reba, CC0) restent à faire (A-7 de `donnees-manquantes.md`).
70. **Durée du jour à sa naissance** — **à moitié** : lever et coucher du soleil calculés dans « 🌌 Le ciel de naissance »
    (`heritage-tresors-ciel.js`). Manque : la **durée** et la phrase (« le 21 décembre 1803 à Tulle : 8 h 37 de jour »).
    **Calcul** · bulletin du jour (73) · effort **petit**.
71. **Son âge à chaque grand événement** — **à moitié** : le bloc « 🌍 Le monde autour » dit déjà « Jean a 19 ans quand la guerre de
    1870 commence ». Nouveau : la **règle des âges** (une vue compacte, un âge par événement, à imprimer) · **Calcul** · fiche ·
    effort **petit**.
72. **Sons enregistrés anciens libres** — **déjà là** : `l9a-sons` (78 tours et cylindres, Internet Archive, domaine public / CC0 / CC BY).
73. **Bulletin du jour de sa naissance** — **à moitié** : tous les morceaux existent (météo du jour, « Ce jour-là dans le monde »,
    saint et dicton `l10-jours`, lune, sport `telech-m`, prix du pain, gazette de l'année, « Une journée dans la vie de… »).
    Nouveau : **une seule carte** qui les assemble, comme la une d'un petit journal, à imprimer ou à poser dans les médias
    (📎). **Calcul** (assemblage, aucune donnée nouvelle) · fiche, Trésors, 🧭 « Faire le bulletin de sa naissance » · effort **moyen**.
74. **Objets du quotidien par décennie** — **à moitié** : `et-mode` (gravures et photos par décennie), `l9a-marques` (objets et marques
    avec une image libre), `tk-collections` (Metropolitan Museum, CC0). Manque : **une page par décennie** qui les réunit.
    Paris Musées (images en CC0 annoncées) : page non lue d'ici. **Calcul** (réunir ce qui existe) · Listes → Images,
    fiche (« les objets de ses 20 ans ») · effort **petit**.
75. **Horloge de sa vie** — **nouveau**. Toute la vie ramenée à une journée de 24 h (né à 0 h, mort à minuit) : « il s'est marié à
    8 h 12, son premier enfant est né à 9 h 05 ». **Calcul** · fiche, Trésors (image à garder 📎) · effort **petit**.

---

## Ce qu'on ne fera pas (et pourquoi)

- **Listes de passagers du Havre** : presque toutes perdues ; aucune base ouverte (17).
- **Brigades de gendarmerie anciennes, électrification par commune** : aucune base ouverte (28, 42).
- **Cartes de temps de trajet d'Arbellot** : pas libres ; on recalcule avec des routes ouvertes (13).
- **Anthropologie du conscrit (1972)** : pas libre ; on passe par des publications du domaine public (36).
- **Gallica, Persée, HAL** : pas de copie (conditions non commerciales ou pages non lues) ; liens seulement.
- **Lieux d'exécution sur une carte** : non, par tact ; un texte seulement (61).

## Ordre de construction conseillé

- **Lot O1 — Les calculs de l'arbre** (aucune donnée, tout sur l'ordinateur) : 1 calendrier Avent/Carême, 5 rayon des mariages,
  8 posthumes et orphelins, 9 quitter la terre, 10 chaîne des signatures, 75 horloge de sa vie, 71 règle des âges, 70 durée du
  jour, 3 option « avec tact ». Le plus utile pour l'effort le plus petit.
- **Lot O2 — Règles et dates** : 2 dispense de consanguinité (degré canonique), 29 jours chômés, 23 tirage au sort, 22 remplaçant,
  27 justices de paix (calcul par canton), 26 présentation plus claire de la carte des coutumes.
- **Lot O3 — Les routes de poste (Zenodo, ODbL)** : 12 relais 1632-1833, puis 13 temps de trajet vers Paris (carte en anneaux).
- **Lot O4 — Le bulletin et les assemblages** : 73 bulletin du jour de sa naissance, 68 journée de travail à 20 ans, 74 objets par décennie.
- **Lot O5 — Les textes rédigés** (un seul fichier TSV sourcé, comme `tn2-formules`) : 11 migrations saisonnières (+ carte),
  17, 18, 24, 31, 32, 33, 37, 44, 46, 49, 52, 57, 59, 61, 64, 65, 66.
- **Lot O6 — Petits packs Wikidata** : 58 catastrophes minières.
- **Lot O7 — Livres du domaine public (Internet Archive)** : 20 salaires SGF 1911 (après confirmation), 54 et 56 packs de liens par
  département, 50 parabole en patois (le plus long : OCR à relire).
- **Lot O8 — Ateliers GitHub (OpenStreetMap)** : 43 télégraphe Chappe, 14 bacs et passeurs.
- **Plus tard, si une source ouverte apparaît** : 35 cheptel, 36 taille des conscrits, 55 enquête de 1848, 28, 42.
