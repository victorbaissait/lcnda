# Téléchargements — lot L (« 🌐 Les équivalents d'ailleurs »)

Lu et vérifié le 26 novembre 2026. Les 26 équivalents internationaux validés par l'utilisateur : pour chacun, ce qui existait déjà,
la licence (citée, avec l'adresse), ce qui est **construit**, **prolongé**, **fabriqué sur GitHub** (atelier) ou **en lien
seulement**, et pourquoi. Même règles que les lots J et K : rien en ligne pour une personne vivante ou confidentielle, rien en
ligne en consultation ni pour un invité du réseau local (aucune tuile, aucune image), chaque donnée avec « ↗ source ».

## Fichiers

| Rôle | Fichier |
|---|---|
| Écran (fiche, village, listes, listes réunies, cartes, à la demande, Réglages) | `assets/js/heritage-telech-l.js` |
| Style | `assets/css/telech-l.css` (classes `tlx-…`) |
| Fabrication des données | `scripts/telech-l/build_{crues,elus,prix,wikidata,github_only}.py` (+ `wm.py`), lancés avec `python3 -I` |
| Atelier GitHub | `.github/workflows/telech-l.yml` (`quoi` = tout, fichiers, wikidata, mines, lieux_gb, bagnards ; astuce du « push », `if: github.event_name != 'push'`, cache dans `$RUNNER_TEMP` par `$GITHUB_ENV`) |
| Données livrées | `assets/data/tl-crues`, `tl-elus`, `tl-prix`, `tl-mesures` (+ `tl-memoriaux`, `tl-cimetieres`, `tl-villages` quand le service de requêtes de Wikidata répond) |
| Textes traduits | `assets/i18n/src/telech-l.tsv` (fr en es de it pt pl nl) |
| Essai | `tests/test-telech-l.js` |

Petites lignes dans des fichiers partagés : `index.php` (2 balises ; `?v=` relevés : `heritage-tout-sur.js`, `app-i18n.js`,
`heritage-prenoms-pays.js`, `app-listes-reunies.js`, `heritage-telech-m.js`, `app-donnees-accueil.js`, `app-donnees-plus.js`,
`app-paniers.js`), `assets/js/heritage-tout-sur.js` (`[/^tlxp_/, 'telech_l']`), `assets/js/app-i18n.js` (`VERSION`),
`scripts/donnees-manifest.js` (`[/^tl-/, 'scripts/telech-l']` ; et la zone couverte `bbox` / `country` d'un pack, reprise de ses
métadonnées), `lib/donnees_maj.php` (`bbox`, `country` dans `donnees_maj_status`), `assets/data/manifest.json` (les packs `tl-*`
seulement). Prénoms : `scripts/prenoms/build-prenoms.py`, `lib/prenoms_pays.php`, `assets/js/heritage-prenoms-pays.js` (les
États-Unis). Le moteur des listes (`app-listes-donnees.js`) n'est pas touché : les listes disent `theme` et `merge`.
Réglages → « 🌐 Les équivalents d'ailleurs » (clé `genealogie-telech-l`) : chaque sujet s'éteint (↶ Annuler), le rayon autour de
ses lieux (5 km, ↶) et celui des crues (50 km, ↶), « À propos des données », « En lien seulement » (caché en consultation).

## Ce qui part sur Internet

**Rien.** Les fichiers sont dans l'app, tout est calculé dans la page, **seulement pour une personne décédée (ou née il y a plus
de 110 ans) et non confidentielle**. Aucun nom de l'arbre n'est envoyé : l'homonyme au Congrès est comparé sur l'ordinateur ; les
liens vers des recherches en ligne (London Gazette, recensements, registres…) s'ouvrent **sans** nom, et n'existent pas en
consultation. Aucun fond de carte ni calque nouveau (conditions des tuiles pas relues) : ce lot ne charge aucune tuile ni image.
L'essai coupe et compte toute requête qui sortirait.

## Licences lues (le 2026-11-26)

- **HANZE** (Paprotny, « HANZE database of historical flood impacts in Europe, 1870-2025 », v3.0.2 beta) — notice Zenodo
  <https://zenodo.org/api/records/23670886> (relue par `build_crues.py`) : `"license": {"id": "cc-by-4.0"}`. → CC BY 4.0, cité.
- **unitedstates/congress-legislators** — README <https://github.com/unitedstates/congress-legislators> (relu par `build_elus.py`) :
  « The project is in the public domain within the United States, and copyright and related rights in the work worldwide are waived
  through the CC0 1.0 Universal public domain dedication ». Données du Biographical Directory of the U.S. Congress. → CC0.
- **datasets/cpi-us** — `datapackage.json` <https://github.com/datasets/cpi-us> (relu par `build_prix.py`) : `"ODC-PDDL-1.0"` ;
  série BLS CPI-U (œuvre fédérale, domaine public). → domaine public.
- **Wikidata** — <https://www.wikidata.org/wiki/Wikidata:Copyright> (relu par `build_wikidata.py`) : « All structured data from
  the main, Property, Lexeme, and EntitySchema namespaces is available under the Creative Commons CC0 License ». → CC0.
- **Fabriqués seulement sur GitHub** (licence relue par le script, qui s'arrête si elle a changé) : USGS « Copyrights and Credits »
  (doit dire « public domain ») pour MRDS ; Open Government Licence v3 (page des National Archives) pour OS Open Names ;
  `license_id` « cc-by… » de la notice CKAN pour les bagnards du Queensland ; la page « limits » de la SSA (doit proposer
  `names.zip`) pour les prénoms des États-Unis.
- **Pas relus (refusés par le réseau de l'atelier)** : ssa.gov, ssb.no, ons.gov.uk, nrscotland.gov.uk, cso.ie, scb.se, dst.dk,
  dvv.fi, ine.es, census.gov, geo.admin.ch / swisstopo, pdok.nl, dataforsyningen.dk, geoservices.wallonie.be, bgs.ac.uk,
  nationalmap.gov, mrdata.usgs.gov, data.qld.gov.au, thegazette.co.uk, bioguide.congress.gov, historicengland.org.uk,
  digitalarkivet.no, aucklandmuseum.com, veterans.gc.ca, naa.gov.au, eAmbrosia, fao.org (DAD-IS), gpih.ucdavis.edu. → rien n'en est copié.

## Les 26 idées

| N° | Idée | Ce qui est fait |
|---|---|---|
| 1 | Prénoms par année | **prolongé** (`pp_prenoms`, pas de liste parallèle) : les États-Unis depuis 1880 (SSA, domaine public) entrent dans le pack « Prénoms d'ici et d'ailleurs » par son atelier (`build-prenoms.py` : relit la page de la SSA, `names.zip`, zone `US`, « aux États-Unis » ; sans la SSA, le pack se fait comme avant). **Atelier** (ssa.gov refusé ici). Norvège, Angleterre et pays de Galles, Écosse, Irlande, Suède, Danemark, Finlande, Espagne, Nouvelle-Zélande, provinces du Canada, États d'Australie : **liens** (sites refusés, formats et licences pas relus) |
| 2 | Noms de famille (recensement des États-Unis, INE, nordiques) | **liens** (sites refusés) |
| 3 | Cartes anciennes | **existaient** : swisstopo Dufour et Siegfried, NLS 6-inch (et 25-inch, 1-inch), USGS topo, minutes de l'IGN espagnol, lien TopoTijdreis (`heritage-fonds-libres.js`). Danemark, Suède, Norvège : **liens** (conditions des tuiles pas relues) ; jamais en consultation |
| 4 | Photos aériennes anciennes | **existaient** : USGS imagery ; swisstopo, Danemark 1954, Pays-Bas 1945, Wallonie : **liens** (conditions pas relues) |
| 5 | Soldats (NZ, Canada, Australie) | **liens** (pas de fichier en bloc lisible ; sites refusés) ; ABMC existait (Où chercher). « Soldats réunis » inchangée |
| 6 | London Gazette | **lien** (recherche ouverte sans nom de l'arbre) ; pas d'index (site refusé) |
| 7 | Monuments aux morts du monde | **construit** (`tl-memoriaux`, Wikidata CC0, hors de France ; rejoint « 🏛 Monuments réunis » par `merge`, même Q) quand le service de requêtes répond ; sinon **atelier** (`quoi` = wikidata). Registres d'Australie et de Nouvelle-Zélande : **liens** |
| 8 | Paroisses britanniques et irlandaises | **liens** (FreeREG, FamilySearch Wiki, ScotlandsPeople, NLI) ; contours ouverts pas relus |
| 9 | Recensements transcrits (Norvège, Islande, Danemark, Canada) | **liens** (fichiers et licences pas relus ; jamais de nom envoyé) |
| 10 | Registres indexés (Riksarkivet, HisKi, DDD) | **liens** |
| 11 | Émigration (Norvège, Brême) | **liens** |
| 12 | Bagnards envoyés en Australie (SLQ, CC BY) | **atelier** (`quoi` = bagnards : licence CKAN relue ; colonnes reconnues ; seulement des départs de plus de 110 ans) ; liste `tl_bagnards` cachée tant que le pack n'est pas là |
| 13 | Populations des communes (Suisse, Norvège, Pays-Bas) | **liens** (sites refusés) |
| 14 | Villages désertés | **construit** (`tl-villages`, Wikidata CC0 : « abandoned village » Q350895 et « deserted medieval village » Q21751582 — dont les Wüstungen et les villages médiévaux désertés d'Angleterre repris de Historic England, avec le numéro NHLE → fiche officielle) quand le service répond ; sinon atelier. Registre Historic England : lien |
| 15 | Indications géographiques (eAmbrosia) | **lien** (site refusé) ; les AOC françaises inchangées |
| 16 | Races FAO DAD-IS | **lien** (licence pas relue) |
| 17 | Mesures anciennes du monde | **construit** (`tl-mesures`, Wikidata CC0 : unités liées à un pays avec leur valeur SI ; longueurs, aires, volumes, masses) ; liste `tl_mesures` (thème 💶 prix). Les mesures de France restent dans `tm_mesures` |
| 18 | Annuaires de commerce | **liens** (Internet Archive, Leicester) |
| 19 | (déjà là : séismes d'Europe) | — |
| 20 | Crues d'Europe HANZE (CC BY 4.0) | **construit** (`tl-crues` : 2 780 crues 1871-2025 ; centre de la première région NUTS 3, calculé des contours de HANZE, ETRS89-LAEA → degrés) ; **rejoint « 🌊 Crues réunies »** (rang 5, `HANZE`) ; fiche (« De son vivant, 3 grandes crues à moins de 50 km… ; la plus meurtrière : 1966-11-04, Firenze »), village, carte, à la demande |
| 21 | Géologie (BGS, USGS, Europe) | **liens** (conditions des services de cartes pas relues : aucun calque ajouté) ; la carte géologique du BRGM existait |
| 22 | Mines (Coal Authority, USGS MRDS) | MRDS : **atelier** (`quoi` = mines, domaine public) ; Coal Authority : **lien** |
| 23 | Élus | **construit** (`tl-elus` : 9 667 membres du Congrès des États-Unis nés il y a plus de 110 ans, CC0 ; fiche officielle bioguide) ; fiche : « un homonyme au Congrès » (même prénom, même nom, née à un an près ; une piste, comparé sur l'ordinateur) |
| 24 | Prix et salaires | **construit** (`tl-prix` : CPI-U des États-Unis 1913-2024, domaine public) ; liste avec « 1 $ de cette année en $ d'aujourd'hui », fiche (« En 1920, un dollar valait autant que … dollars de 2024 ») pour une vie passée aux États-Unis. Avant 1913 et GPIH : **liens** (pas de licence ouverte lue). Le convertisseur français est inchangé |
| 25 | Cimetières du monde | **construit** (`tl-cimetieres`, Wikidata CC0, hors de France) quand le service répond ; sinon atelier. Fiche : « le cimetière le plus proche de son lieu de décès » (une piste) |
| 26 | Noms de lieux (OS Open Names, registres nordiques) | OS Open Names : **atelier** (`quoi` = lieux_gb : OGL v3 relue ; hameaux, villages ; OSGB36 → WGS84) ; registres de Norvège, Suède, Finlande : **liens** |

## Où l'utilisateur le voit

- Fiche d'une personne décédée : bloc « 🌐 Les équivalents d'ailleurs » (crues de sa vie, monument aux morts, cimetière, village
  déserté, homonyme au Congrès, le dollar de son temps).
- Fiche d'un village : grandes crues (HANZE), et hors de France monuments aux morts, cimetières, villages désertés.
- Listes : 🌊 « Crues réunies » (+ HANZE) et `tl_crues` ; 🏛 « Monuments réunis » (+ monuments aux morts) ; ⚔️ `tl_memoriaux` ;
  ✝️ `tl_cimetieres` ; 🗺 `tl_villages` ; 👑 `tl_elus` ; 💶 `tl_prix`, `tl_mesures` ; et, quand ils sont fabriqués, ⚒️ `tl_mines`,
  🗺 `tl_lieux_gb`, 🔎 `tl_bagnards`. 📊 Statistiques → Prénoms : les États-Unis quand le pack est refait.
- Cartes : quatre couches de points (crues, monuments aux morts, cimetières, villages désertés). À la demande : trois sources
  « personne », quatre « lieu » (toutes hors ligne).

## Les restes faits avec ce lot

- **🧺 Panier envoyé à un compte du site familial** : `lib/partages_famille.php` ; famille.php `partages` (GET, lecture seule),
  `partages_vu` et `partage_retirer` (POST, CSRF) ; une seule vue « 📥 Ce qu'on m'a partagé » (🧺 paniers reçus + 📊 listes) ;
  filtre à l'envoi (vivant, confidentiel, note, nom d'une personne cachée) **et** à chaque lecture (vivants d'aujourd'hui, branche
  du compte) ; l'envoyeur voit « envoyé, pas encore lu · lu le … · retiré par le destinataire ». Essai `tests/test-panier-site-familial.js`.
- **🚲 Compétitions sportives** : la pastille « Tour de France » allumée propose les vues de la liste du Tour (Éditions · Étapes ·
  🗺 Carte) — `MERGE.painted` dans `heritage-telech-m.js` (appelé par `app-listes-reunies.js`).
- **📊 Récap « À faire »** : « dont N utiles pour tes lieux » (seulement les listes pas installées dont la zone est connue : `cover`
  de la liste, ou `bbox` / `country` du pack dans le sommaire ; sinon la ligne n'est pas écrite) ; « ✨ Nouveau : thème » (la date
  où chaque thème est apparu sur cet ordinateur, 30 jours), dans le récap lui-même.

## Essais

- `node tests/test-telech-l.js` : fichiers, licences, manifeste ; crues de Florence 1966 ; homonyme d'Abraham Lincoln ; dollar de
  1913 ; scripts et atelier ; i18n ; fiche ; vivant, confidentiel, consultation sans liens ni requête ; listes, listes réunies,
  cartes, village ; Réglages ↶ ; vues du Tour ; récap ; 390 px sombre ; aucune erreur.
- `node tests/test-panier-site-familial.js`.
