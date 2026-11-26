# Téléchargements — lot K (« 🌍 Le monde à côté »)

Lu et vérifié le 26 novembre 2026. Pour chaque idée : ce qui existait déjà, la licence (citée, avec l'adresse), ce qui est construit
ou seulement en lien, et où l'utilisateur le voit. Maquette suivie : `docs/design/listes-categories.html` (thèmes `monuments`, `images`,
`livres`, `ciel`, `noms` ; listes réunies ; Décisions : une liste = un thème, un thème s'ouvre sur sa liste réunie).

## Fichiers

| Rôle | Fichier |
|---|---|
| Écran (fiche, village, monographie, listes, liste réunie, cartes, à la demande, Réglages) | `assets/js/heritage-telech-k.js` |
| Style | `assets/css/telech-k.css` (classes `tkx-…`) |
| Fabrication des données | `scripts/telech-k/build_{patrimoine,musees,collections,langues,climat,prenoms}.py` (+ `wm.py`), lancés avec `python3 -I` |
| Atelier GitHub | `.github/workflows/telech-k.yml` (`quoi` = tout, patrimoine, musees, collections, monde ; `pays` = codes séparés par des espaces, `monde` ou `tout` ; astuce du « push », `if: github.event_name != 'push'`, cache dans `$RUNNER_TEMP` par `$GITHUB_ENV`) |
| Données livrées | `assets/data/tk-patrimoine_{monde,lu,ie,…}.json.gz`, `tk-collections`, `tk-langues`, `tk-cerisiers`, `tk-prenoms`, `tk-ciel`, `tk-secheresses` |
| Textes traduits | `assets/i18n/src/telech-k.tsv` (fr en es de it pt pl nl) |
| Essai | `tests/test-telech-k.js` |

Petites lignes ajoutées dans des fichiers partagés : `index.php` (2 balises ; `heritage-telech-e.js?v=`, `heritage-tout-sur.js?v=`,
`designs-gen.css?v=`, `app-i18n.js?v=` relevés), `assets/js/heritage-tout-sur.js` (`[/^tkxp_/, 'telech_k']` dans `BLOCK_OF`), `assets/js/app-i18n.js` (`VERSION`), `scripts/donnees-manifest.js` (`[/^tk-/, 'scripts/telech-k']`),
`assets/data/manifest.json`, `assets/css/designs-gen.css` et `assets/i18n/*.json` (refaits par leur script).
**`assets/js/heritage-telech-e.js` (lot E) est prolongé, pas dupliqué** : voir « Ciel noir et sécheresses du monde ».
Le moteur des thèmes et des listes réunies (`app-listes-donnees.js`, `app-listes-themes.js`, `app-listes-reunies.js`) n'est pas
touché : les listes disent seulement `theme` et `merge`, et la liste réunie « 🏛 Patrimoine du monde » est **déclarée** dans
`LCNDA_EXT.dataListMerges` (avec `sources` pour Mérimée et le Québec, dont les fichiers ne sont pas touchés non plus).
Réglages → « 🌍 Le monde à côté » (clé `genealogie-telech-k`) : chaque sujet s'éteint (↶ Annuler), le rayon du patrimoine (5 km,
↶) et des musées (25 km, ↶), « À propos des données » (source, lignes, licence, date ; les pays déjà fabriqués et ceux qui ne le
sont pas ; ce qui n'est qu'en lien et pourquoi). Les packs apparaissent dans Réglages → 🗂 Données (lu dans le manifeste).

## Ce qui part sur Internet

**Rien.** Les fichiers sont dans l'app et tout est calculé dans la page, **seulement pour une personne décédée (ou née il y a plus
de 110 ans) et non confidentielle** ; rien pour une fiche vivante. Aucune image n'est chargée : les œuvres et les sites s'ouvrent
sur le site du musée ou du registre, sur un clic. « 🔎 Chercher « lieu » dans les collections ouvertes (en ligne) » donne des liens
(Met, Smithsonian, Art Institute of Chicago, Cleveland, National Gallery of Art, Rijksmuseum, SMK, Nationalmuseum, Paris Musées,
Musée de Bretagne, Wellcome, Te Papa, Europeana, Racinet sur Commons) : **le nom du lieu part seulement quand on clique**, et ces
liens **n'existent pas** en consultation (kiosque) ni pour un invité du réseau local (`LCNDA_GUEST`). Aucune clé d'API dans l'app
(Paris Musées, le Smithsonian et Europeana en demandent une : liens seulement). L'essai coupe et compte toute requête qui sortirait.

## Licences lues (le 2026-11-26)

- **Wikidata** — <https://www.wikidata.org/wiki/Wikidata:Copyright> (lu par `action=raw`, relu par `build_patrimoine.py` à chaque
  fabrication) : « All structured data from the main, Property, Lexeme, and EntitySchema namespaces is available under the Creative
  Commons CC0 License ». → CC0, données copiées (patrimoine, musées). Le service de requêtes répond 429 avec `Retry-After: 1000`
  quand on va trop vite : une requête à la fois, une minute entre deux (`TK_WDQS_GAP`), Retry-After respecté, réponse coupée jamais
  gardée (`check=json.loads`) ; l'API (`wbgetentities`, recherche `haswbstatement`) sert aux petits pays et au patrimoine mondial.
- **The Metropolitan Museum of Art, Open Access** — README de <https://github.com/metmuseum/openaccess> (relu par le script) :
  « To the extent possible under law, The Metropolitan Museum of Art has waived all copyright and related or neighboring rights to this
  dataset using Creative Commons Zero » ; « Images are not included and are not part of the dataset ». → CC0, un index copié ; aucune image.
- **Cleveland Museum of Art** (README de <https://github.com/ClevelandMuseumArt/openaccess> : « has waived all copyright … using
  Creative Commons Zero ») et **National Gallery of Art** (README de <https://github.com/NationalGalleryOfArt/opendata> : « releasing
  this dataset under the Creative Commons Zero designation ») — **lus, pas copiés** : leurs fichiers sont en Git LFS ou sans lieu ;
  cherchés en ligne sur un clic. À reprendre si l'on veut un index plus large.
- **Glottolog** — README de <https://github.com/glottolog/glottolog-cldf> (relu par le script) : « This dataset is licensed under a
  CC-BY-4.0 license » ; citation : Hammarström, Forkel, Haspelmath, Bank, Glottolog 5.4 (2026). → CC BY 4.0, cité sous chaque ligne.
- **NOAA/NCEI WDS Paleoclimatology** — <https://www.ncei.noaa.gov/pub/data/paleo/aar/readme-ncei-wds-paleoclimatology.txt> (relu par
  le script) : « Users may access and download these data free of charge; please cite the original references provided in the data
  documentation for each data set. » ; en-tête du fichier de Kyoto : « Please cite Publication, and Online_Resource and date accessed
  when using these data. » ; readme du MADA : « PLEASE CITE ORIGINAL REFERENCE WHEN USING THIS DATA ». → libre, cité.
- **Zenodo, Hotham 2026** — notice <https://zenodo.org/api/records/23757708> : licence `cc-by-4.0` ; README : « Text, figures and
  derived data: CC BY 4.0 » (relus par le script, comme au lot E).
- **WGND 2.0** — notice Harvard Dataverse <https://dataverse.harvard.edu/api/datasets/:persistentId/?persistentId=doi:10.7910/DVN/MSEGSJ>
  (relue par le script) : `"license": {"name": "CC0 1.0"}`. → CC0.
- **Pas relus (refusés par le réseau de l'atelier)** : whc.unesco.org (annoncé CC BY-SA 3.0 IGO), historicengland.org.uk et les autres
  registres nationaux, api.si.edu, api.artic.edu, openaccess-api.clevelandart.org, api.nga.gov, data.rijksmuseum.nl, api.smk.dk,
  parismuseescollections.paris.fr, nomisma.org, nsidc.org, ncdrisc.org, bankofengland.co.uk, ine.es, abmc.gov, figshare.com,
  sedac.ciesin.columbia.edu, glottolog.org. → **rien n'en est copié** : liens seulement.

## A. « 🏛 Patrimoine du monde » (thème `monuments`) — une liste réunie

- **Existait** : Mérimée (`lp_merimee`, Licence Ouverte, la France), le Répertoire du patrimoine culturel du Québec (`l10t_quebec`,
  Wikidata P633). **Gardés tels quels** et **déclarés** dans la liste réunie `patrimoine_monde` (`same: {by: 'key'}`), rang 1.
- **Ajouté** : la liste `tk_patrimoine` (Wikidata, rang 2, `merge: {into: 'patrimoine_monde'}`). Un même bien = **même identifiant
  de registre officiel** (dans cet ordre : Mérimée P380, RPCQ P633, UNESCO P757, NHLE P1216, HES P709, Cadw P1459, NIEA P1460,
  Rijksmonument P359, Onroerend Erfgoed P1764, NRHP P649, Canada P477, KGS P381, BDA P2951, DGPC P1702, BIC P808, …), sinon même Q
  de Wikidata. Le nom du registre et l'adresse de sa fiche (`P1630`, « formatter URL ») sont **lus sur Wikidata** au moment de
  fabriquer : chaque bien ouvre sa fiche officielle (http(s) seulement, identifiant encodé), rien n'est copié des registres.
- **Packs** : un par pays (Europe sans la France, Canada, États-Unis) : nom, position, protection, année (création P571, sinon début
  de la protection), commune, identifiant du registre. Pays mis à part pour garder chaque pack petit et l'installer à la demande.

| Pack | Biens | Taille | Fabriqué |
|---|---|---|---|
| `tk-patrimoine_monde` (patrimoine mondial de l'UNESCO, P1435 = Q9259) | 1 888 (1 364 avec l'identifiant UNESCO, 88 avec Mérimée) | 82 Ko | ici (API) |
| `tk-patrimoine_lu` (Luxembourg) | 109 | 4 Ko | ici (API) |
| `tk-patrimoine_ie` (Irlande) | 705 | 19 Ko | ici (API) |
| les autres pays (gb nl be de ch at it es pt dk no se fi is ee lv lt pl cz sk hu si hr ro bg gr mt mc ad li ca us) | — | — | **sur GitHub** : Actions → « Le monde à côté (lot K) », `quoi` = patrimoine, `pays` = … |

- **Registres nationaux en fichiers** (Historic England OGL, HES, Cadw, NIAH, Rijksmonumenten CC0, Onroerend Erfgoed, Wallonie,
  Bruxelles, INPA, Länder, KGS, BDA, ICCD, K-samsök, NID, Québec, Canada, NRHP…) : **pas copiés** (sites refusés par le réseau de
  l'atelier, licences pas relues ici) ; Wikidata porte leurs identifiants, chaque bien ouvre la fiche officielle. Le format des lignes
  (`key`) est prêt pour qu'un pack de registre (rang 1) rejoigne la même liste réunie plus tard.
- **UNESCO** : rien de whc.unesco.org n'est copié (licence CC BY-SA 3.0 IGO annoncée, page pas relue) ; les sites viennent de Wikidata
  (CC0) avec le lien `whc.unesco.org/en/list/<n>`.
- **Où** : fiche d'une personne décédée (« Mont-Saint-Michel et sa baie, à 1 km de Le Mont-Saint-Michel : patrimoine mondial » ; le
  patrimoine mondial d'abord ; rayon 5 km réglable ; « protégés souvent bien après sa vie »), village et monographie (≥ 10 km),
  Listes → 🏛 Monuments (liste réunie, et `tk_patrimoine` avec 👪 « Dans la famille »), Cartes, à la demande.

## B. « 🖼 Musées du monde » (thème `images`) — une liste, deux vues

- **Existait** : « 🖼️ Ton village au musée » (POP, en ligne, `heritage-metiers-rivieres.js`) pour la France. Gardé ; rien de repris.
- **Vue « Musées »** : l'annuaire des musées de Wikidata (P31/P279* Q33506, avec une position : nom, sorte, commune, pays, création,
  site officiel http(s)), **un pack par continent** (`tk-musees_{eu,am,as,af,oc}`), **fabriqué sur GitHub** (`quoi` = musees :
  un pays à la fois, une minute entre deux requêtes) — le service de requêtes était saturé depuis l'atelier. Tant qu'il n'est pas là,
  Réglages le dit et la liste s'ouvre sur les œuvres.
- **Vue « Œuvres du domaine public »** : `tk-collections` = **28 703 œuvres** du Metropolitan Museum (CC0), 567 Ko : domaine public,
  1500-1950, estampes, dessins, photographies, peintures, éphémères, textiles, costumes, monnaies, médailles, **qui montrent la vie des
  gens** (étiquettes du Met : métiers, enfants, familles, mariages, maisons, villes, villages, églises, marchés, fermes, pêche, bateaux,
  soldats, écoles, repas, danse… ; un portrait seul seulement s'il est photographique — les cartes de visite de gens ordinaires) :
  titre, années, lieu, culture, sorte, sujets. **Pas d'image** : un clic ouvre la fiche du musée.
- **Recherche sur la fiche** (sur l'ordinateur) : son métier (forgeron → « blacksmith », tisserand → « weaver », blanchisseuse →
  « laundress »… 36 métiers) dans les titres, de son temps à trente ans près ; son lieu de naissance (mot entier) dans les titres et les
  lieux. Phrase prudente : « un métier montré, pas votre ancêtre ».
- **Les autres collections ouvertes** (Smithsonian, AIC, Cleveland, NGA, Walters, Mia, Yale, NYPL, Paris Musées, Musée de Bretagne,
  Rijksmuseum, SMK, Nationalmuseum, Wellcome, British Library, Te Papa, Auckland, Museums Victoria, Getty, Brooklyn, Harvard) : **pas
  copiées** ; « 🔎 Chercher « lieu » dans les collections ouvertes » ouvre leurs recherches filtrées sur l'accès libre, **sur un clic**,
  jamais en consultation. Les sites dont l'API demande une clé (Paris Musées, Smithsonian, Europeana) : pas de clé dans l'app.

## C. Les idées 26 à 50

| N° | Idée | Ce qui est fait |
|---|---|---|
| 26-29 | Collections de musées | dans B (index du Met ; liens de recherche pour les autres) |
| 30 | Racinet, « Le costume historique » (1888, domaine public) | **lien** (recherche Wikimedia Commons, dans les liens de collections et Réglages) ; aucune planche copiée |
| 31 | Nomisma (CC BY) | **lien** : nomisma.org refusé par le réseau de l'atelier ; les pièces de « La pièce dans sa poche » (`heritage-terre-quotidien.js`) sont des XIXe-XXe s., hors de Nomisma (types antiques) — rien à prolonger utilement |
| 32 | Cerisiers de Kyoto depuis 812 (Aono) | **construit** : `tk-cerisiers` = 785 années (812-2010), NOAA/NCEI étude 26430 (libre, à citer) ; fiche (« L'année de sa naissance (1850), les cerisiers de Kyoto fleurirent le 19 avril : à la date habituelle de son siècle »), liste `tk_cerisiers` (thème `ciel`). Les mises à jour d'Aono (site de l'université d'Osaka) : injoignable |
| 33-34 | Glace du lac Suwa (1443), du Torne à Tornio (1693) | **lien** : NSIDC refusé par le réseau de l'atelier ; pas trouvé sur NCEI |
| 35 | Crues du Nil (nilomètre de Roda) | **lien** : pas de fichier ouvert trouvé avec sa licence (NCEI ne l'a pas) |
| 36 | North American Drought Atlas (NOAA) | **construit, prolonge le lot E** : 286 carreaux de 2,5°, 1500-2006 (`tk-secheresses`) |
| 37 | Monsoon Asia Drought Atlas (NOAA) | **construit, prolonge le lot E** : 534 carreaux de 2,5°, 1500-2005 (même pack, 410 Ko) |
| 38 | Ciel noir du monde entier (Hotham 2026, CC BY 4.0) | **construit, prolonge le lot E** : `tk-ciel` = le monde de 75° N à 60° S, carreaux de 10′ (le plus clair des 4 carreaux de 5′), 532 Ko |
| 39 | Populations des villes 3700 av. J.-C.-2000 (Reba et al. 2016, CC0) | **lien** : figshare et SEDAC refusés par le réseau de l'atelier, licence pas relue ici — à fabriquer plus tard |
| 40 | Taille par pays (NCD-RisC, CC BY 4.0) | **lien** : ncdrisc.org refusé |
| 41 | Bank of England, « A millennium of macroeconomic data » (OGL) | **lien** : bankofengland.co.uk refusé |
| 42 | WGND 2.0 (CC0) | **construit** : `tk-prenoms` = 4 427 prénoms d'homme dans un pays d'Europe ou d'Amérique du Nord et de femme dans un autre (≥ 90 % de chaque côté : Andrea, Simone, Nicola, Joan, Kim…), 27 Ko ; fiche (« Son prénom (Andrea) est un prénom d'homme en Italie, mais de femme en France… le genre peut s'être trompé »), liste `tk_prenoms` (thème `noms`). Les prénoms par pays et par année existaient (`pp_prenoms`) : pas repris |
| 43 | Glottolog (CC BY 4.0) | **construit** : `tk-langues` = 8 312 langues (246 familles), 214 Ko ; fiche (lieux hors de France : « Autour de Milan : le Lombard (Indo-European), dont le point est à 49 km » — « une piste, pas une preuve » ; les 1 120 langues éteintes (vitalité AES de Glottolog) restent dans la liste mais ne sont jamais dites « autour » d'un ancêtre), village, liste `tk_langues` (thème `livres`), carte |
| 44 | Noms de famille par province (INE) | **lien** : ine.es refusé |
| 45 | DFD (Allemagne) | **lien** : pas de licence ouverte pour une copie |
| 46 | ABMC (soldats américains en France) | **existait** (`app-sources-ouvertes-8-core.js`, `so8_abmc`) ; lien rappelé dans Réglages |
| 47 | Travailleurs chinois de la Grande Guerre | **lien** (cimetière de Nolette, Noyelles-sur-Mer) |
| 48 | Lomax, Global Jukebox | **lien** |
| 49 | Missions étrangères de Paris, IRFA | **lien** |
| 50 | Griffith's Valuation | **existait** (`app-ou-chercher-monde.js`) ; lien rappelé |

### Ciel noir et sécheresses du monde — **le lot E prolongé**

`heritage-telech-e.js` lit maintenant aussi `tk-ciel` et `tk-secheresses` (petites lignes : `worldOf`, `skyAt` → `G.world` hors de
la grille d'Europe, `cellAt` → carreaux de 2,5° (`r.s`), source par atlas `ATLAS[cell.a]`, phrase « carreau de 250 km » pour ces
carreaux). Mêmes phrases, même bloc « 🌌 Ciel, climat et mémoire » : Mary SMITH, née à New York en 1870, a son ciel d'aujourd'hui et
ses étés secs (atlas d'Amérique du Nord) ; Paris garde la grille d'Europe et l'Old World Drought Atlas. Sans les fichiers du lot K,
le lot E se comporte comme avant.

## Où l'utilisateur le voit

- Fiche d'une personne décédée : bloc « 🌍 Le monde à côté » (patrimoine, musée le plus proche, œuvres de son métier et de son lieu,
  langues, cerisiers, prénom) ; et dans « 🌌 Ciel, climat et mémoire » le ciel et les étés du monde entier.
- Fiche d'un village et monographie : patrimoine protégé, musées, le lieu dans les musées (et les langues hors de France).
- Listes : 🏛 Monuments → liste réunie « Patrimoine du monde » (Mérimée + Québec + Wikidata) et `tk_patrimoine` ; 🖼 Musées →
  `tk_musees` (Musées · Œuvres du domaine public) ; 📚 → `tk_langues` ; ⛅ → `tk_cerisiers` ; 👶 → `tk_prenoms`.
- Cartes : patrimoine protégé, musées, langues. À la demande : trois sources « personne », quatre « lieu » (toutes hors ligne).

## Essais

- `node tests/test-telech-k.js` : 12 essais (fichiers, licences, manifeste ; clés de réunion et fiche officielle sûre, Mont-Saint-Michel ;
  forgerons au Met, Paris ; breton près de Quimper, Kyoto 1850, Andrea ; le lot E prolongé à New York et Hong Kong ; fiches ; vivant,
  confidentiel et consultation sans rien d'envoyé ni lien de recherche ; village, listes et liste réunie, cartes, à la demande ;
  Réglages ↶ et rayon 5 → 2 → 5 km ; 390 px sombre ; aucune erreur).
- `node tests/test-telech-e.js` : inchangé, passe.
