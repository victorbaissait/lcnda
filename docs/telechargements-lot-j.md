# Téléchargements — lot J (« 🌍 Partir et nommer »)

Lu et vérifié le 26 novembre 2026. Pour chaque idée : ce qui existait déjà, la licence (citée, avec l'adresse), ce qui est construit
ou seulement en lien, et où l'utilisateur le voit. Maquettes suivies : `docs/design/listes-categories.html` (thèmes, Décisions ; liste
réunie « Anciens noms réunis » prévue au § 7) ; **nouvelle maquette à valider** : `docs/design/noms-de-lieux-monde.html` (« Noms de
lieux d'autrefois : une seule recherche pour tous les pays », dans le style réel de l'app, comme `carte-guerres-temps.html`).

## En chiffres (fabriqués ici le 26 novembre 2026)

| Paquet | Lignes | Taille | Source |
|---|---|---|---|
| `tj-cyclones` | 2 025 tempêtes (1848 → 2027 austral), 45 129 points | 335 Ko | NOAA NCEI IBTrACS v04r01 |
| `tj-noms` | 53 294 noms de 25 080 lieux, dont 36 447 noms officiels datés | 1,2 Mo | Wikidata (CC0) |
| `tj-fusions` | 13 936 communes disparues (18 pays) | 350 Ko | Wikidata (CC0) |
| `tj-pleiades` | 29 277 noms antiques de 16 172 lieux | 530 Ko | Pleiades (CC BY 3.0) |
| `tj-villages` | 25 lieux | 4 Ko | Wikipédia (CC BY-SA 4.0), Wikidata (CC0) |
| `tj-cajuns` | 64 paroisses, 22 en Acadiane | 3 Ko | Wikipédia (en), Wikidata (CC0) |
| `tj-charcot` | 4 personnes (5 lignes : Gourdon est des deux expéditions) | 1 Ko | Wikidata (CC0) |
| `tj-oberamt` | 55 Oberämter, 45 avec le lien de leur description | 2 Ko | Wikidata (CC0), Wikisource (domaine public) |

## Fichiers

| Rôle | Fichier |
|---|---|
| Écran (fiche, village, monographie, listes, liste réunie, cartes, à la demande, Réglages) | `assets/js/heritage-telech-j.js` |
| Style | `assets/css/telech-j.css` (classes `tj-…`) |
| Fabrication des données | `scripts/telech-j/build_{cyclones,pleiades,noms,monde}.py` (+ `wm.py`) |
| Atelier GitHub | `.github/workflows/telech-j.yml` (`quoi` = tout, cyclones, pleiades, noms, fusions, monde ; astuce du « push », `if: github.event_name != 'push'`, cache dans `$RUNNER_TEMP` par `$GITHUB_ENV`) |
| Données livrées | `assets/data/tj-{cyclones,pleiades,noms,fusions,villages,cajuns,charcot,oberamt}.json.gz` |
| Textes traduits | `assets/i18n/src/telech-j.tsv` (fr en es de it pt pl nl) |
| Maquette | `docs/design/noms-de-lieux-monde.html` (à valider) |
| Essai | `tests/test-telech-j.js` |

Petites lignes ajoutées dans des fichiers partagés : `index.php` (2 balises ; `heritage-tout-sur.js?v=`, `designs-gen.css?v=` relevés),
`assets/js/heritage-tout-sur.js` (`[/^tjp_/, 'telech_j']`), `scripts/donnees-manifest.js` (`[/^tj-/, 'scripts/telech-j']`),
`assets/data/manifest.json` et `assets/css/designs-gen.css` (refaits par leur script). Le moteur des thèmes et des listes réunies
(`app-listes-donnees.js`, `app-listes-reunies.js`, `app-listes-themes.js`) n'est pas touché : les listes disent seulement `theme` et `merge`,
et la liste réunie est **déclarée** dans `LCNDA_EXT.dataListMerges` (seulement si le moteur ne l'a pas déjà).
Réglages → « 🌍 Partir et nommer » (clé `genealogie-telech-j`) : chaque partie s'éteint (↶ Annuler), le rayon des cyclones (50, 100 ou
200 km ; 100 au départ, ↶), « À propos des données » (source, lignes, licence, date), « En lien seulement » (chaque lien et sa raison).
Les paquets apparaissent dans Réglages → 🗂 Données (lus dans le manifeste).

## Ce qui part sur Internet

**Rien.** Les fichiers sont dans l'app ; aucun nom, aucun lieu n'est envoyé. Tous les rapprochements (cyclones de sa vie, anciens noms
de ses lieux, paroisse de Louisiane, Oberamt, traversée, Saint-Domingue, homonyme dans les expéditions de Charcot) sont calculés dans la
page, **seulement pour une personne décédée (ou née il y a plus de 110 ans) et non confidentielle** ; rien pour une fiche vivante. En
consultation (kiosque, `is-kiosk` ou `base-readonly`) et pour un invité du réseau local (`LCNDA_GUEST`) : **ni comparaison de noms, ni
lien de carte** (OpenHistoricalMap) ; aucune tuile, aucune image n'est jamais chargée. La liste des membres des expéditions déclare
`personMatch.historic`. Seuls les liens « ↗ » ouvrent une page, sur un clic. L'essai coupe et compte toute requête qui sortirait.

## Licences lues (le 2026-11-26)

- **Wikidata** — <https://www.wikidata.org/wiki/Wikidata:Copyright> (lu par `action=raw`) : « All structured data from the main,
  Property, Lexeme, and EntitySchema namespaces is available under the Creative Commons CC0 License ». → CC0, données copiées.
  Service de requêtes : une requête à la fois, pause longue (`TJ_WDQS_GAP`, 30 s sur GitHub), `Retry-After` respecté, réponse coupée
  jamais gardée (`check=json.loads`), pays groupés ; un pays trop lourd (Allemagne, Tchéquie…) est refait sans libellés, puis ses
  libellés sont demandés à part par paquets de 400.
- **Wikipédia en français** — <https://fr.wikipedia.org/wiki/Wikip%C3%A9dia:Citation_et_r%C3%A9utilisation_du_contenu_de_Wikip%C3%A9dia>
  (lu par `action=raw`) : texte sous « Licence Creative Commons Attribution - Partage dans les mêmes conditions 4.0 International
  (CC BY-SA 4.0) ». → la première phrase (2 au plus) de l'article de chaque village fondé par des Français, avec son lien et « les
  contributeurs de Wikipédia ».
- **Wikipédia en anglais** — <https://en.wikipedia.org/wiki/Wikipedia:Copyrights> (lu par `action=raw`) : « Creative Commons
  Attribution-ShareAlike 4.0 International License ». → seulement la position (coordonnées) et l'élément Wikidata des 64 paroisses
  de Louisiane, par l'API ; aucun texte recopié.
- **NOAA NCEI — IBTrACS v04r01** — page des métadonnées <https://www.ncei.noaa.gov/metadata/geoportal/rest/metadata/item/gov.noaa.ncdc:C01552/html>
  (« Use Constraints : Cite as: Gahtan, J., Knapp, K. R., Schreck, C. J. III, Diamond, H. J., Kossin, J. P., Kruk, M. C. (2024)…
  https://doi.org/10.25921/82ty-9e16 … Users are also asked to cite: Knapp et al. 2010 », « Use liability », « Distribution
  liability ») et <https://www.ncei.noaa.gov/products/international-best-track-archive>. Aucune restriction d'usage, citation
  demandée ; données d'une agence fédérale des États-Unis. → copié, avec les deux citations (Réglages, source de chaque ligne).
  Le script relit la page à chaque fabrication et s'arrête si « Cite as » ou « Use liability » disparaissent.
- **Pleiades** — `README.md` et `LICENSE` du paquet <https://github.com/isawnyu/pleiades.datasets> (lus sur raw.githubusercontent.com) :
  « All content is distributed under the terms of a Creative Commons Attribution license (cc-by) » ; `LICENSE` = « Creative Commons
  Legal Code — Attribution 3.0 Unported » ; version 4.1 du 28 mai 2025. → CC BY 3.0, copié avec « les contributeurs de Pleiades » et le
  lien de chaque lieu. Le script relit les deux fichiers et s'arrête s'ils changent de licence. (pleiades.stoa.org lui-même est refusé
  par le réseau de l'atelier : les fichiers viennent du dépôt GitHub officiel, qui est la voie d'archivage indiquée par le README.)
- **ICOADS** — <https://www.ncei.noaa.gov/products/international-comprehensive-ocean-atmosphere-data-set> (lu) ; les résumés mensuels
  (MSG) sont des archives binaires, une par mois : `…/v3/archive/msg/ICOADS_v3.0.0_MSG-binary_dYYYYMM_c20160606.tar` (1 812 fichiers pour
  1800-1950). Données NOAA (publiques) mais **trop lourd** pour un paquet léger, et la météo d'un jour de traversée ne se reconstruit pas
  sûrement → **lien seulement**, sur la fiche d'une personne qui a traversé la mer.
- **CLIWOC (KNMI)** — la page de téléchargement (<https://projects.knmi.nl/cliwoc/download/cliwoc21.htm>, citée par les dépôts de
  sauvetage `kikocorreoso/cliwoc_showcase` et `sigon426/CLIWOC`) et le site du KNMI sont **refusés** par le réseau de l'atelier : licence
  non lue. Les jeux dérivés de Zenodo (CC BY-SA 4.0, CC BY 4.0) ne disent pas la licence de la base d'origine → **lien seulement**.
- **SlaveVoyages** — <https://www.slavevoyages.org/> refusé par le réseau de l'atelier : licence non lue (et réutilisation commerciale non
  garantie) → **lien seulement**, avec une phrase sobre.
- **Indemnité de Saint-Domingue (1826)** — l'« État détaillé des liquidations opérées… par la commission chargée de répartir l'indemnité
  attribuée aux anciens colons de Saint-Domingue » (1828-1834) est du domaine public, mais : Gallica refuse l'atelier (403), et Internet
  Archive (API `advancedsearch`) ne donne aucun volume par son titre (une seule pétition de 1794). **Aucun texte reconnu fiable** → recherche
  Gallica, Internet Archive, et l'article « Dette de l'indépendance d'Haïti » (Wikipédia), sur un clic ; le contexte est dit sobrement
  (voir plus bas). Rien n'est recopié.
- **Dictionnaire biographique du Canada** — textes protégés → **lien seulement** (on y cherche soi-même un nom).
- **OpenHistoricalMap** — données CC0 annoncées, mais le site et la politique d'usage des tuiles sont **refusés** par le réseau de l'atelier :
  pas de fond de carte dans l'app → un **lien** « ↗ ce lieu sur OpenHistoricalMap en {année} » (`#map=12/lat/lon&date=AAAA-01-01`),
  jamais en consultation ni pour un invité.
- **World Historical Gazetteer, Open Domesday, Logainm (+ townlands.ie), INE (alteraciones de los municipios), OFS (répertoire historisé
  des communes, OGD), carte de Ferraris (KBR), HisGIS (cadastre de 1832), Statistical Accounts of Scotland, Kartverket (stedsnavn),
  Isof, Maanmittauslaitos, Słownik geograficzny, Banque de noms de lieux du Québec, Noms géographiques du Canada (CGNDB), GNIS** : tous
  **refusés** par le réseau de l'atelier (code 000/403 du mandataire) — licence non lue ici → **liens seulement** (Réglages → « En lien
  seulement », avec la raison ; sur la fiche, ceux du pays de ses lieux). Kartverket et Maanmittauslaitos sont annoncés CC BY 4.0, CGNDB
  sous Licence du gouvernement ouvert, GNIS dans le domaine public : à fabriquer plus tard par l'atelier GitHub, après lecture de leur page.
- **Gemeindelexikon** (Autriche-Hongrie, 1900-1910, domaine public) — recherche Internet Archive (lien).
- **Oberamtsbeschreibungen** (Wurtemberg, 1824-1886, domaine public) — de.wikisource.org est refusé par le réseau de l'atelier : le lien
  de chaque description vient de Wikidata (lien de site `de.wikisource.org` de l'élément dont le sujet est l'Oberamt) ; sinon une
  recherche Wikisource. Rien n'est recopié du texte.
- Déjà dans l'app et réutilisé (pas recopié) : `gov_noms` (GOV, CC BY-SA 3.0, paquet à installer) et `wikidata_anciens_noms`
  (`assets/data/wikidata/oldnames.json.gz`, Wikidata CC0 : noms officiels datés des communes et villes, surtout de France). Ils
  recoupent en partie `tj-noms` : la recherche et la liste réunie fondent les doublons (même nom, même lieu).

## Les idées, une par une

| # | Idée | Fait | Pourquoi |
|---|---|---|---|
| 1 | Météo en mer pendant une traversée (ICOADS) | lien | résumés mensuels binaires trop lourds ; la fiche dit seulement « il a traversé la mer entre … et … » et donne le lien, avec « on ne sait pas sur quel navire ni quel jour » |
| 2 | Livres de bord 1750-1854 (CLIWOC) | lien | licence du KNMI illisible d'ici |
| 3 | Cyclones depuis 1842 (IBTrACS) | **construit** `tj-cyclones` | domaine public, citation donnée |
| 4 | Indemnité de Saint-Domingue | lien (recherche) | pas d'OCR fiable trouvé ; contexte sobre |
| 5 | Navires de traite (SlaveVoyages) | lien | licence illisible ; phrase sobre |
| 6 | Villages fondés par des Français | **construit** `tj-villages` | liste à la main, Wikipédia + Wikidata |
| 7 | Cajuns de Louisiane : paroisses | **construit** `tj-cajuns` | 64 paroisses, 22 en Acadiane |
| 8 | Dictionnaire biographique du Canada | lien | textes protégés |
| 9 | Équipages des expéditions de Charcot | **construit** `tj-charcot` | Wikidata (peu de personnes connues) |
| 10 | OpenHistoricalMap | lien à la date | politique des tuiles illisible ; jamais en consultation |
| 11 | World Historical Gazetteer | lien | licences par jeu de données, site illisible |
| 12 | Pleiades | **construit** `tj-pleiades` | CC BY 3.0 lu |
| 13 | Open Domesday | lien | site illisible |
| 14 | Logainm, townlands | lien | clé d'accès, licence illisible |
| 15 | INE (Espagne) | lien + Wikidata | fusions de Wikidata dans `tj-fusions` |
| 16 | OFS (Suisse) | lien + Wikidata | idem |
| 17 | Carte de Ferraris (1777) | lien | scans de la KBR |
| 18 | Cadastre néerlandais de 1832 (HisGIS) | lien + Wikidata | idem (fusions néerlandaises) |
| 19 | Oberamtsbeschreibungen | **construit** `tj-oberamt` (liens par Oberamt) | domaine public, lien par lieu |
| 20 | Statistical Accounts of Scotland | lien | lecture en ligne |
| + | Noms de lieux d'autrefois, tous pays | **construit** `tj-noms`, `tj-fusions` + liste réunie | Wikidata CC0 ; maquette de la recherche à valider |
| + | Scandinavie, Pologne, Autriche-Hongrie, Québec, Canada, GNIS | liens | sites refusés par l'atelier (à fabriquer plus tard) |

## 🌀 Cyclones — `tj-cyclones`

IBTrACS (bassins NA, SI, SP) : les tempêtes dont **au moins un point** passe dans une zone (Antilles et Haïti, Louisiane et golfe du
Mexique, la Réunion et Maurice, Madagascar et Mayotte, Nouvelle-Calédonie, Polynésie française, Guyane, Saint-Pierre-et-Miquelon), et
leurs points (toutes les 6 heures : date, position, vent max) dans la zone élargie de 6°. Les plus anciennes de ces zones datent de 1848
(IBTrACS commence en 1842 ailleurs). Sur la fiche : « Le 12 septembre 1928, le cyclone sans nom passe à 6 km de Pointe-à-Pitre » (de
son vivant ; dans les 15 ans autour de l'événement daté), la catégorie de Saffir-Simpson au plus fort, et la phrase « le centre de la
tempête est passé à cette distance ; les vents et les pluies portent bien plus loin ». Rayon réglable (50/100/200 km).

## 🏷 Noms de lieux d'autrefois — `tj-noms`, `tj-fusions`, `tj-pleiades` et la liste réunie « 🗺 Anciens noms de lieux »

- `tj-noms` (Wikidata) : pour ~85 pays (hors France : la France est surtout dans `wikidata/oldnames`), les **noms officiels datés** (P1448 avec P580 et/ou
  P582 : Pressburg jusqu'en 1920, Breslau…) ; et, pour les villes de plus de 30 000 habitants, leurs **autres noms** en français,
  allemand, anglais, italien, espagnol, polonais et latin (libellés et alias, **sans date**, marqués comme tels : Presbourg, Cracovie,
  Lemberg). Les alias manifestement hors sujet (chiffres, « ville de… », codes, surnoms entre parenthèses) sont écartés.
- `tj-fusions` (Wikidata) : les communes disparues dans une fusion (P576 + P1366) de 18 pays (Suisse, Espagne, Pays-Bas, Belgique,
  Allemagne, Italie, Autriche, Luxembourg, Portugal, Danemark, Tchéquie, Slovaquie, Pologne, Hongrie, Suède, Norvège, Finlande,
  Slovénie) : ce que donnent les registres nationaux (OFS, INE, Pays-Bas), vu par Wikidata ; les registres restent en lien.
- `tj-pleiades` : les noms antiques (Lutetia, Burdigala…) avec les années entre lesquelles ils sont attestés.
- **Liste réunie** `anciens_noms` (thème `lieux`, « 🗺 Anciens noms de lieux ») : un nom par ligne ; « même nom, même lieu » = le nom
  sans accents (ß → ss) et la case d'un demi-degré (`same: {by: 'k'}`) ; rang : registre national 1 (aucun encore, place gardée) >
  GOV 2 > World Historical Gazetteer 3 (lien seulement) > Pleiades 4 > Wikidata 5. Sources : `gov_noms` et `wikidata_anciens_noms`
  (déclarées par la liste réunie : `sources`), `tj_noms`, `tj_fusions`, `tj_pleiades` (déclarées par elles-mêmes : `merge`).
- **La recherche « un nom → le lieu d'aujourd'hui »** : faite dans `heritage-telech-j.js` (`searchNames`, `LCNDA_EXT.telechJ.oldNames`),
  sur l'ordinateur ; **l'écran** est seulement la maquette `docs/design/noms-de-lieux-monde.html` (à valider) — la liste réunie suffit en
  attendant (on y cherche « Presbourg »). Ses six questions sont dans la maquette.

## 🏡 ⚜️ 🧊 📘 Les autres paquets

- `tj-villages` : 25 lieux choisis à la main (Pigüé, San Rafael de Veracruz, Castroville, Demopolis, Gallipolis, New Rochelle,
  Franschhoek, Sainte-Geneviève, Vincennes, La Nouvelle-Orléans, Esperanza, Nueva Helvecia…) en trois sortes (émigrés ; fondation de la Nouvelle-France ou de la Louisiane ; réfugiés), la phrase de
  l'article. Sur la fiche, si un de ses lieux est à moins de 25 km. Quelques titres (Kaskaskia, Détroit, Biloxi, Trochu…) seront ajoutés
  par l'atelier GitHub : l'API de Wikipédia a refusé l'atelier d'ici (429) pendant la dernière fabrication.
- `tj-cajuns` : les 64 paroisses (date de création, chef-lieu, nom français), 22 en **Acadiane** (résolution 496 du parlement de Louisiane,
  1971 : un fait). La paroisse d'un lieu : son nom dans le texte du lieu (« Lafayette Parish », « paroisse … »), sinon le centre le plus
  proche à moins de 35 km, et la fiche dit alors « sans doute ».
- `tj-charcot` : les membres connus de Wikidata des deux expéditions antarctiques (1903-1905, 1908-1910) et du « Pourquoi-Pas ? » —
  seulement 4 personnes (Charcot, Gourdon, Liouville, Quidor) : Wikidata ne relie presque aucun marin à ces expéditions ; l'équipage
  complet n'est qu'en lien (articles de Wikipédia des expéditions, dans le paquet).
  Homonyme (même premier prénom et même nom) seulement pour une personne décédée, jamais en consultation ; « seulement le même nom ».
- `tj-oberamt` : les Oberämter (Wikidata, classe Q1702612 ; sans position, la ville du même nom en Bade-Wurtemberg, clé communale P439
  « 08… ») et le lien de leur description (45 sur 55 trouvés par Wikidata, sinon une recherche Wikisource) ; sur la fiche, l'Oberamt dont le chef-lieu est le plus proche
  (≤ 15 km, dans le Wurtemberg), « à vérifier, les limites ont changé ».

## ⛓ Saint-Domingue, la traite — dit sobrement

- Un lieu à Saint-Domingue (boîte de l'île, ou les mots Saint-Domingue, Haïti, Cap-Français…) avant 1830 : « Saint-Domingue vivait du
  travail de centaines de milliers de personnes réduites en esclavage. En 1825, la France exigea d'Haïti une indemnité pour les anciens
  colons ; la liste des colons indemnisés (« État détaillé des liquidations », 1828-1834) donne leurs noms et leurs biens », les liens de
  recherche, et : « Un lieu à Saint-Domingue ne dit pas qui était cette personne : colon, libre de couleur, esclave affranchi, soldat,
  marin… Les registres le disent. »
- Un métier de la mer (armateur, capitaine, matelot, négociant…) à moins de 15 km d'un port de traite (Nantes, La Rochelle, Bordeaux,
  Le Havre, Saint-Malo, Lorient, Honfleur, Marseille, Dunkerque, Vannes), vivant entre 1700 et 1830 : « Son métier touchait à la mer, à
  …, au temps où des navires de traite partaient de ce port », le lien SlaveVoyages, et « Cela ne dit pas qu'il y a pris part : la plupart
  des navires de ces ports faisaient d'autres voyages. »

## Où l'utilisateur le voit

- Fiche d'une personne décédée : bloc « 🌍 Partir et nommer » (anciens noms de ses lieux et registres de ses pays, cyclones, traversée,
  Saint-Domingue / port de traite, village fondé par des Français, paroisse de Louisiane, Dictionnaire biographique du Canada, homonyme
  dans les expéditions de Charcot, Oberamt).
- Fiche d'un village et monographie : noms d'autrefois du lieu, cyclones passés près d'ici, village fondé par des Français, paroisse de
  Louisiane, Oberamt.
- Listes : 🗺 Lieux et noms de lieux (`tj_noms`, `tj_fusions`, `tj_pleiades`, `tj_villages`, `tj_cajuns`, et la liste réunie
  `reunie_anciens_noms`), ⛅ Climat (`tj_cyclones`, colonne « 👪 Dans la famille » à 100 km), 🔎 Retrouver une personne (`tj_charcot`),
  📚 Livres (`tj_oberamt`).
- Cartes : cyclones (points), villages, noms antiques, noms d'autrefois, paroisses, Oberämter.
- À la demande : quatre parties « personne » (`tjp_…`) et cinq « lieu ».

## Paquets à refaire par l'atelier GitHub

`tj-noms` et `tj-fusions` : le service de requêtes de Wikidata limite fort ; les pays qu'il a refusés pendant la fabrication d'ici (le
journal le dit : « abandonné ») sont repris par Actions → « Partir et nommer (lot J) », `quoi` = `noms` puis `fusions`. Les autres
paquets se refont tels quels (`quoi` = tout). Les sources refusées par le réseau de l'atelier d'ici (Kartverket, CGNDB, GNIS…) restent en
lien : pour les fabriquer, ajouter un script qui lit d'abord leur page de licence.

## Essais

- `node tests/test-telech-j.js` : fichiers, licences, manifeste ; cyclones (1928 à Pointe-à-Pitre, Dina 2002 à la Réunion) ; noms
  (« Presbourg » → Bratislava, « Breslau » → Wrocław, « Lutetia » → Paris, Bordeaux → Burdigala) ; Louisiane (Lafayette en Acadiane),
  Oberamt Ulm, traversée Le Havre → New York, Saint-Domingue, port de traite ; vivant, confidentiel, consultation et invité : rien, ni lien
  de carte ; aucune requête vers Internet ; village, listes (thèmes, liste réunie), cartes, à la demande ; Réglages ↶ et rayon 100 → 50 →
  100 km ; 390 px sombre ; aucune erreur.
