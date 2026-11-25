# Téléchargements — lot B : la vie du village et la nature

Module : `assets/js/heritage-telech-b-village.js` (+ `assets/css/telech-b.css`, `assets/i18n/src/telech-b.tsv`).
Fabrication : `scripts/telech-b/build.py` (+ `wm.py`), sur GitHub : `.github/workflows/telech-b.yml`.
Essai : `node tests/test-telech-b.js`.
Licences lues le 2026-11-25.

## Où ça s'affiche

- **Fiche d'un village** et **Monographie de commune** (une partie par sujet) : une phrase par sujet, la liste sous « ▸ plus » ; chaque point a « ↗ Wikidata » ou « ↗ OpenStreetMap » (et « ↗ Mérimée », « ↗ Wikipédia » s'il y en a), une ligne « Source : » avec la licence. Plus bas, plié : « 🔗 Pour aller plus loin (liens seulement) ».
- **Fiche d'une personne**, bloc « 🐑 Son village et la nature » : le petit patrimoine à moins de 1,5 km de son lieu de naissance qui existait déjà à sa naissance. Le bloc est caché quand il n'a rien à dire. (Les vendanges de sa naissance, de son mariage et de sa mort sont déjà dans « 🏘 Le lieu à son époque », `heritage-histoire.js` : pas refait.)
- **Listes** (`LCNDA_EXT.dataLists`) : `tb_croix`, `tb_eau`, `tb_village`, `tb_bornes`, `tb_berger`, `tb_cultes`, `tb_cepages` (colonne Source par ligne, période, position).
- **Cartes** (`mapLayerSources`) : un calque par sujet. **À la demande / Ce qui le concerne** (`dataSources`) : `tb_<sujet>_lieu`, `tb_personne` (tous `online: false`).
- **Réglages → « 🐑 Village et nature »** : chaque sujet s'éteint (clé `genealogie-telech-b`, ↶ Annuler) ; « À propos des données » (source, lignes, licence, date) ; les liens. Les fichiers sont aussi dans **Réglages → 🗂 Données** (`assets/data/manifest.json`, script `scripts/telech-b/build.py`).
- **Vie privée** : tout est lu sur l'ordinateur, rien ne part sur Internet (ni nom, ni lieu), pour personne. Seuls les liens « ↗ » ouvrent une page, sur un clic.

## Fichiers (tailles mesurées)

| Fichier | Contenu | Lignes | Taille |
|---|---|---|---|
| `tb-wd-croix` | calvaires, croix de chemin (Wikidata) | 1 368 | 46 Ko |
| `tb-wd-eau` | lavoirs, puits, fontaines (Wikidata) | 4 341 | 98 Ko |
| `tb-wd-village` | fours à pain, fours banaux, pigeonniers (Wikidata) | 375 | 12 Ko |
| `tb-wd-bornes` | bornes frontières, octrois, douanes (Wikidata) | 667 | 13 Ko |
| `tb-wd-berger` | drailles, burons (Wikidata) | 82 | 2 Ko |
| `tb-wd-cultes` | temples protestants, synagogues (Wikidata) | 2 181 | 65 Ko |
| `tb-cepages` | cépages dont on connaît le pays ou le lieu d'origine (Wikidata) | 1 065 | 15 Ko |
| `tb-osm-*` | les mêmes sujets depuis OpenStreetMap : **à fabriquer sur GitHub** (Actions → « Lot B : village et nature », `quoi = osm`) ; arrivent ensuite par Réglages → 🗂 Données. Coupé si un fichier dépasse 15 Mo. | — | — |

En tout ≈ 250 Ko livrés avec l'app (sous la limite de 15 Mo : pas de pack à installer).

## Les licences (citées)

- **Wikidata** — <https://www.wikidata.org/wiki/Wikidata:Licensing> : « All structured data (i.e. the main, Property, Lexeme, and EntitySchema namespaces) is released into the public domain under Creative Commons Zero. » → CC0 1.0, redistribuable.
- **OpenStreetMap** — <https://www.openstreetmap.org/copyright> : Open Database License (ODbL 1.0) ; obligation d'attribution « © les contributeurs d'OpenStreetMap » (affichée sous chaque bloc qui contient un point OSM et dans les listes, colonne « Base »). Fabriqué seulement sur GitHub (Overpass injoignable depuis l'atelier ; pas de récupération de pages web).
- **Wiktionnaire** — <https://fr.wiktionary.org/wiki/Convention:Droit_d’auteur> : « Vous avez la permission de copier, distribuer ou modifier le texte de tous les articles du Wiktionnaire selon les termes de la licence CC-BY-SA 4.0 ». (Pas de fichier livré : voir n° 26.)
- **Dates des vendanges** (pas de copie ici : le pack « Histoire du lieu » les a déjà, liste `hist_vendanges`) — Daux, V. et al. (2012), « An open-access database of grape harvest dates for climate research: data description and quality assessment », *Climate of the Past* 8, 1403–1418, doi:10.5194/cp-8-1403-2012 (article sous CC BY 3.0). L'en-tête du fichier dit : « We present an open-access dataset of grape harvest dates » et « Please cite original reference when using these data, plus the data file URL and date accessed. » Le dépôt NOAA NCEI / World Data Service for Paleoclimatology (<https://www.ncei.noaa.gov/pub/data/paleo/aar/readme-ncei-wds-paleoclimatology.txt>) : « Users may access and download these data free of charge; please cite the original references provided in the data documentation for each data set. » Fichier : <https://www.ncei.noaa.gov/pub/data/paleo/historical/europe/europe2012ghd.txt>, doi:10.25921/2xg2-mt70. → libre, avec la citation (affichée sous chaque ligne 🍇).

**Une seule source pour les vendanges** : la partie « 🍇 Les dates des vendanges » (fiche d'un village, monographie, à la demande `tb_vendanges_lieu`) lit la liste `hist_vendanges` de `assets/js/app-listes-donnees.js` (pack « Histoire du lieu », `lib/histoire.php`) par `LCNDA_EXT.dataListsEngine.list()` → `query({near: {lat, lon, km: 150}})`, et garde la série la plus proche. Sans le pack installé : rien n'est affiché (l'installation se propose dans Réglages → Histoire du lieu). Pas de fichier `tb-vendanges`, pas de 2e liste.

## Chaque idée

| N° | Idée | Déjà dans l'app ? | Verdict licence | Fait |
|---|---|---|---|---|
| 19 | Calvaires et croix de chemin | Non (les plaques OSM de « 🔔 Objets et traces » écartent exprès les croix ; le pack « Patrimoine » n'a que les croix protégées Mérimée) | Wikidata CC0 ; OSM ODbL | **Construit** : `tb-wd-croix` (+ `tb-osm-croix` : `historic=wayside_cross`, `wayside_shrine`, `calvary`) |
| 20 | Lavoirs, fours à pain, pigeonniers, puits, fontaines | En partie : les monuments protégés (Mérimée) sont dans le pack « Patrimoine » ; les fontaines **saintes** dans « ⛲ Fontaines et saints » (pays-memoire) ; le reste non | Wikidata CC0 ; OSM ODbL ; Mérimée déjà dans l'app (Licence Ouverte), pas recopié | **Construit** : `tb-wd-eau`, `tb-wd-village` (+ OSM `amenity=lavoir`, `amenity=fountain`+historic, `man_made=water_well`, `amenity=baking_oven`, `building=bakehouse`, `man_made=dovecote`…) ; lien « ↗ Mérimée » quand l'élément Wikidata a un n° Mérimée |
| 21 | Bornes, anciennes frontières, octrois, douanes | L'octroi est expliqué dans « 🌍 Monde et coutumes » (texte) ; pas de carte | Wikidata CC0 ; OSM ODbL | **Construit** : `tb-wd-bornes` (borne frontière Q921099, bureau/porte d'octroi, bâtiment douanier) + OSM `historic=boundary_stone` |
| 22 | Transhumance, estives, cabanes de berger | Non (le mot « estive » seulement dans les métiers anciens) | Wikidata CC0 ; OSM ODbL | **Construit** : `tb-wd-berger` (drailles Q1168568, burons Q2928590) + OSM (cabanes nommées, drailles, orris). Peu de données Wikidata : l'essentiel viendra d'OSM |
| 23 | Lieux de pèlerinage | **Oui** : `l10o-pelerinages` (« 🔔 Objets et traces » : fiche, lieu, carte, liste) et « ⛲ Fontaines et saints » | — | Rien de refait |
| 24 | Temples protestants, synagogues anciennes | En partie : `l8c-eglises` (lieux de culte **disparus ou fermés** seulement) ; le pack « Patrimoine » (protégés) | Wikidata CC0 ; OSM ODbL | **Construit** : `tb-wd-cultes` (temple protestant Q56242063, synagogue Q34627, ancienne synagogue) avec date de construction ; rappel « Où chercher (SHPF) » |
| 25 | Sobriquets des habitants / blasons populaires | Les **gentilés** (noms officiels des habitants) existent déjà : « Terre et mots » (Wikidata P1549) | Wikidata n'a pas de propriété pour les sobriquets ; les recueils récents sont sous droit ; *Blason populaire de la France* (Gaidoz et Sébillot, 1884) est du domaine public mais seulement en scans à lire | **Lien seulement** : « 🔗 Pour aller plus loin » → recherche Internet Archive du livre |
| 26 | Dictons et proverbes, dictons météo | **Oui** pour les dictons météo : « 🌦️ Les dictons de son jour de naissance » (366 jours, Wikipédia CC BY-SA 4.0, lot 10 « Règles de vie ») | Wiktionnaire CC BY-SA 4.0 : redistribuable, mais presque rien de régional (« Proverbes en occitan » : 4 pages ; alsacien, picard, corse, provençal : pas de catégorie ; breton : une seule annexe). Wikiquote : pas joignable depuis l'atelier, proverbes non classés par région | **Lien seulement** (annexe des proverbes bretons) ; pas de fichier : trop peu pour être utile |
| 27 | Atlas linguistique de la France (1902–1910) | Non | Les cartes de Gilliéron et Edmont sont du domaine public, mais aucune licence publiée n'a pu être lue pour les numérisations (CartoDialect / ShinyALF / Lautkarten : sites injoignables ou sans mention de licence trouvée) | **Lien seulement** (CartoDialect) |
| 46 | Animaux disparus localement | **Oui** : « 🐺 Les loups et bêtes sauvages » (pays-memoire : loup, ours, castor, lynx par département et décennie, GBIF/INPN CC BY 4.0) | — | Rien de refait (piste : ajouter la loutre dans `scripts/pays-memoire/build-data.py`, même méthode GBIF) |
| 47 | Cépages anciens par région | En partie : « Terre et mots » (`tm-fruits`) a 12 cépages qui portent un nom de lieu | Wikidata CC0. OIV : pas de jeu de données ouvert trouvé → rien | **Construit** : `tb-cepages` (1 065 cépages avec pays ou lieu d'origine, couleur, date) — **Listes seulement** : Wikidata n'a presque jamais le lieu précis (2 positions), donc pas de bloc « cépages de sa région » |
| 48 | Dates de floraison / moisson historiques | **Oui pour les vendanges** : pack « Histoire du lieu » (liste « Dates des vendanges (27 régions) », et « L'été de l'année, d'après les vendanges » sur la fiche) ; floraison : non | **PEP725** : compte obligatoire pour télécharger, pas de redistribution → lien. **Observatoire des saisons** : observations depuis 2006 (pas l'histoire), site injoignable pour lire la licence → lien. **Vendanges (Daux et al. 2012)** : libre, à citer (voir plus haut) | **Réutilisé**, pas copié : la fiche d'un village et la monographie montrent la série la plus proche (habitude, plus précoces / tardives, les années de la famille) lues dans `hist_vendanges` ; liens PEP725 et ODS |

## Ce qui reste à faire

- Lancer une fois le workflow « Lot B : village et nature » (`quoi = osm`) pour fabriquer les fichiers `tb-osm-*` ; le workflow refait aussi le sommaire `assets/data/manifest.json`.
- Hôtes à autoriser si on veut relire les licences depuis l'atelier : `cp.copernicus.org`, `www.pep725.eu`, `www.obs-saisons.fr`, `lig-tdcge.imag.fr`, `fr.wikiquote.org`, `overpass-api.de`.
