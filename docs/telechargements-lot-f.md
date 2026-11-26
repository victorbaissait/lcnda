# Téléchargements — lot F (« 🌉 Le pays au XIXe siècle »)

Lu et vérifié le 26 novembre 2026. Pour chaque idée : ce qui existait déjà, la licence (citée, avec l'adresse), ce qui est construit
ou seulement en lien, et où l'utilisateur le voit.

## Fichiers

| Rôle | Fichier |
|---|---|
| Écran (fiche, village, monographie, listes, cartes, à la demande, Réglages) | `assets/js/heritage-telech-f.js` |
| Style | `assets/css/telech-f.css` |
| Fabrication des données | `scripts/telech-f/build_{ballons,ponts,industrie,osm,potager,montyon,rosieres,silence,volcans}.py` (+ `wm.py`) |
| Atelier GitHub | `.github/workflows/telech-f.yml` (`quoi` = tout, osm, ballons…, astuce du « push », `if: github.event_name != 'push'`) |
| Données livrées | `assets/data/tf-{ballons,ponts,forges,salines,potager,montyon,rosieres,silence,volcans}.json.gz` (≈ 45 Ko en tout) |
| Textes traduits | `assets/i18n/src/telech-f.tsv` (fr en es de it pt pl nl, 147 lignes) |
| Essai | `tests/test-telech-f.js` |

Petites lignes ajoutées dans des fichiers partagés : `index.php` (2 balises, `heritage-tout-sur.js?v=` relevé),
`assets/js/heritage-tout-sur.js` (`[/^tfp_/, 'telech_f']` dans `BLOCK_OF`), `scripts/donnees-manifest.js` (`[/^tf-/, 'scripts/telech-f']`),
`assets/data/manifest.json` (refait par son script). Aucun serveur PHP : tout est lu sur l'ordinateur.
Réglages → « 🌉 Le pays au XIXe siècle » (clé `genealogie-telech-f`) : chaque sujet s'éteint (↶ Annuler), « À propos des données ».
Les packs apparaissent dans Réglages → 🗂 Données (« Livrées avec l'app » : taille, date, source, licence, lu dans le manifeste).

## Ce qui part sur Internet

**Rien.** Les fichiers sont dans l'app ; aucun nom, aucun lieu n'est envoyé, pour personne (vivant, confidentiel, invité, mode
consultation : pareil). Seuls les liens « ↗ » ouvrent une page, sur un clic. L'essai coupe et compte toute requête qui sortirait.

## Licences lues (le 2026-11-26)

- **Wikidata** — <https://www.wikidata.org/wiki/Wikidata:Copyright> : « All structured data from the main, Property, Lexeme, and
  EntitySchema namespaces is available under the Creative Commons CC0 License ». → CC0, données copiées.
- **Wikipédia en français** — <https://fr.wikipedia.org/wiki/Wikip%C3%A9dia:Citation_et_r%C3%A9utilisation_du_contenu_de_Wikip%C3%A9dia> :
  « Licence Creative Commons Attribution - Partage dans les mêmes conditions 4.0 International ». → phrases citées telles quelles, avec
  « les contributeurs de Wikipédia » et le lien de l'article. Texte lu par `action=raw` (une requête par article ; l'API était limitée, 429).
- **Wikisource** — API `meta=siteinfo&siprop=rightsinfo` : « Creative Commons Attribution-Share Alike 4.0 »
  (https://creativecommons.org/licenses/by-sa/4.0/deed.fr) ; les textes eux-mêmes (ici un livre de 1883) sont du domaine public.
- **Internet Archive**, « Les Plantes potagères » (Vilmorin-Andrieux, 1883), <https://archive.org/details/lesplantespotag00conggoog> :
  métadonnées « possible-copyright-status: NOT_IN_COPYRIGHT », « year: 1883 » (scan Google, bibliothèque de l'université de Californie).
  Les fichiers du scan (serveurs `*.archive.org`) étaient refusés par le réseau de l'atelier : on lit la **transcription de Wikisource**.
- **NOAA NCEI / World Data Service for Paleoclimatology** — <https://www.ncei.noaa.gov/pub/data/paleo/aar/readme-ncei-wds-paleoclimatology.txt> :
  « Users may access and download these data free of charge; please cite the original references provided in the data documentation
  for each data set. » En-tête du fichier Crowley : « Please cite original reference when using these data, plus the Online Resource and
  date accessed. » → copié, avec les deux références (Crowley et Unterman 2013, doi:10.5194/essd-5-187-2013 ; Gao, Robock et Ammann 2008,
  doi:10.1029/2008JD010239). Le nom des volcans vient de la base NOAA des éruptions déjà livrée (`ha-catastrophes`, domaine public).
- **OpenStreetMap** — <https://www.openstreetmap.org/copyright> : ODbL 1.0, « © les contributeurs d'OpenStreetMap » (page refusée par
  le réseau de l'atelier ce jour ; lue pour le lot B le 2026-11-25, même texte). Les fichiers `tf-osm-*` se fabriquent sur GitHub.
- **data.gouv.fr, cartes de bruit stratégiques** — API data.gouv : 481 jeux « carte de bruit stratégique », un par département ou par
  infrastructure, licence `lov2` (Licence Ouverte 2.0). Trop éparpillés pour un pack : **liens**.
- **Géoplateforme, DGAC « Plan d'Exposition au Bruit (PEB) »** — fiche CSW
  <https://data.geopf.fr/csw?REQUEST=GetRecordById&SERVICE=CSW&VERSION=2.0.2&OUTPUTSCHEMA=http%3A%2F%2Fwww.isotc211.org%2F2005%2Fgmd&elementSetName=full&ID=DGAC_Plan_d_Exposition_au_Bruit_PEB> :
  aucune licence écrite (seulement « Produit par la DGAC ») ; cartes.gouv.fr refusé par le réseau → **pas copié**. Les cartes de bruit
  (CBS) n'y sont publiées que pour les Ardennes (`cbs2022_008`).
- **Académie française** (prix de vertu) — site refusé par le réseau de l'atelier : **lien seulement**.
- **Communes** pour placer les variétés : `assets/data/cc-communes.json.gz`, déjà dans l'app (Licence Ouverte 2.0).

## Par idée

### 11. Ballons montés du siège de Paris (1870-71) — **construit**
- **Existait** : non (seulement la montgolfière de 1783 dans « Époque et travail »).
- **Source** : article « Ballon monté » de Wikipédia (le tableau « Liste des ballons montés », d'après J. Le Pileur et G. L'Héritier) —
  il n'y a pas d'article « Liste des ballons montés… » séparé, et Wikidata n'a aucun élément « ballon monté » (Q805335 : 0 instance).
- **Construit** : `tf-ballons` (68 lignes, 60 lieux d'arrivée placés par Wikidata). Gardé : numéro, date, nom du ballon, départ,
  arrivée, distance, fret. Les noms des pilotes et passagers ne sont pas copiés.
- **Où** : fiche (personne en vie en 1870-71, un lieu de sa vie de 1850 à 1890, ou sans date, à moins de 40 km de l'arrivée) ; village (moins de 30 km) ; monographie ; Listes ;
  Cartes ; à la demande.

### 12. Ponts suspendus (ponts Seguin) — **construit**
- **Existait** : non.
- **Sources** : Wikidata (pont suspendu Q12570 et sous-classes, en France, 88 éléments placés) + les lignes « Suspendu » de la « Liste de
  ponts de France » (Wikipédia : année, commune, {{Coord}}, « conçu par Marc Seguin »). Réunis : `tf-ponts`, 99 ponts, 63 datés.
- **« Un pont a remplacé le bac »** : dit **seulement** quand Wikidata l'écrit (P1365, « remplace ») — aucun cas aujourd'hui ; sinon
  « En 1834, on construit le pont suspendu de … » ; la remarque générale sur les bacs est donnée comme contexte, pas comme fait du lieu.
- **Réutilisé** : les notices Mérimée « pont suspendu » du pack « Patrimoine » (si installé) sur la fiche du village.
- **Où** : fiche (pont à moins de 12 km construit pendant sa vie), village, monographie, Listes, Cartes, à la demande.

### 13. Hauts fourneaux et forges anciennes — **construit (petit) + OpenStreetMap sur GitHub**
- **Existait** : en partie — `heritage-metiers-rivieres.js` (« forge », « saline » parmi les catégories d'industries du pack
  Métiers et rivières) et les notices Mérimée. Ici, réutilisés (Mérimée) et prolongés.
- **Construit** : `tf-forges` (Wikidata : forge, haut-fourneau, usine sidérurgique, fonderie, martinet ; 96 lieux). Wikidata en a peu :
  `tf-osm-forges` (OpenStreetMap, `historic=forge|blast_furnace|furnace|ironworks|smithy`, `historic=industrial`+`industrial=…`,
  `ruins=blast_furnace`, noms « Forge(s) … », « Haut-fourneau … ») **à fabriquer sur GitHub**.
- **Lien aux métiers** : forgeron, maréchal-ferrant, charbonnier, fondeur, maître de forges, taillandier, cloutier, puddleur… (métier de
  la fiche, des recensements, des événements) → rayon 25 km au lieu de 6, et la phrase « Son métier touchait au fer ».

### 14. Salines et marais salants — **construit (petit) + OpenStreetMap sur GitHub**
- **Construit** : `tf-salines` (Wikidata : saline Q1880708, marais salant Q244326 ; 15 lieux) + `tf-osm-salines` (OSM :
  `landuse=salt_pond`, `industrial=salt_works|saline`, `man_made=works`+`product=salt`, `historic=salt_works`, noms) **sur GitHub**.
- **Lien aux métiers** : saunier, paludier, salinier, faux-saunier, gabelou → 25 km et « Son métier touchait au sel ». Mérimée réutilisé.

### 15. Plaques de cocher et bornes Michelin — **à fabriquer sur GitHub (OpenStreetMap)**
- **Existait** : non (le lot B a les bornes frontières `historic=boundary_stone`).
- **Tags** : taginfo.openstreetmap.org était refusé par le réseau : les tags n'ont pas pu être comptés ici. OSM n'a pas de clé propre à
  ces objets ; `build_osm.py` cherche les objets `historic=*`, `tourism=information` ou `man_made=*` dont le nom, l'inscription, la
  description, la note ou l'opérateur dit « cocher » ou « Michelin », et écrit dans le journal le nombre trouvé par chaque question.
  Wikidata : « plaque de cocher » (Q3391688) et « signalétique Michelin » (Q3483627) existent mais n'ont aucun élément placé.
- **Où** (quand le fichier existe) : village (moins de 6 km), monographie, Listes, Cartes. Avant : Réglages le dit, la liste est vide.

### 16. Le potager de 1883 (Vilmorin-Andrieux) — **construit (liens vers les pages et les gravures)**
- **Existait** : non (le mot « potager » seulement dans la maison virtuelle).
- **Construit** : `tf-potager` (691 variétés de 70 légumes, lues dans les titres du livre transcrit sur Wikisource ; 41 portent le nom
  d'une commune française unique — Haricot de Soissons, Chou de Lannilis, Ognon de Cambrai, Asperge d'Argenteuil… ; les mots courants
  « de marais », « ventre de riche », « de quarante jours »… sont écartés).
- **Gravures** : du domaine public (sur Wikimedia Commons, fichiers « … Vilmorin-Andrieux 1883.png ») : l'app garde seulement le nom du
  fichier et met un lien « ↗ la gravure » ; rien n'est copié (taille, et pas d'image chargée sans clic).
- **Où** : fiche (personne en vie en 1883, variété au nom d'une commune à moins de 25 km), village, monographie, Listes, Cartes.

### 17. Prix de vertu Montyon — **construit (très incomplet) + liens**
- **Existait** : non.
- **Sources** : Wikidata « prix de vertu Montyon » (Q33139180) : 17 lauréats (11 avec une commune). Les rapports annuels de l'Académie
  (domaine public, en partie sur Wikisource) ne sont pas un jeu structuré : **liens** (Académie française, recherche Wikisource).
- **Où** : « Une personne de sa commune a été honorée : … reçoit le prix de vertu en 1886 » (moins de 3 km, pendant sa vie) ; village.

### 18. Les rosières — **construit**
- **Existait** : non.
- **Source** : article « Rosière » de Wikipédia (liste des communes d'aujourd'hui + phrases de l'histoire qui nomment une commune ;
  Wikidata n'a pas de propriété « rosière »). `tf-rosieres` : 32 communes (28 aujourd'hui), la phrase citée, « depuis » quand c'est écrit.
  Le nom d'une rosière élue récemment (personne vivante) est coupé de la phrase.
- **Où** : fiche (sa commune, moins de 3 km), village (moins de 15 km), monographie, Listes, Cartes.

### 19. Le silence d'autrefois — **construit (phrases) + liens (bruit d'aujourd'hui)**
- **Existait** : non.
- **Construit** : `tf-silence` : 7 phrases recopiées des articles « Angélus », « Cloche », « Tocsin » de Wikipédia ; le script relit
  l'article à chaque fabrication et refuse d'écrire si une phrase n'y est plus (rien d'inventé).
- **Aujourd'hui** : liens « ↗ cartes de bruit stratégiques (data.gouv.fr) » (recherche du département) et « ↗ le village sur Géoportail ».
  Pas de carte copiée ni d'image chargée : les CBS sont publiées département par département et la couche nationale (DGAC, PEB) n'a pas
  de licence écrite.
- **Où** : fiche (« Pendant sa jeunesse, au village, on entendait : … »), village, monographie.

### 20. La couleur du ciel les années de volcans lointains — **PROLONGÉ (pas dupliqué)**
- **Existait** : oui, deux fois — « 🌅 Les ciels étranges de sa vie » (lot 8, `l8a-ciels` : Laki, Tambora, Krakatoa, Toungouska,
  Pinatubo) et « 🌋 Les volcans qui ont gâché ses récoltes » (lot 10, `l10t-volcans`, phrases de Wikipédia). Leur récit n'est pas recopié.
- **Ajouté** : `tf-volcans` : les **mesures** (épaisseur des aérosols 30-90° N, Crowley et Unterman 2013 ; soufre dans la stratosphère
  de l'hémisphère nord, Gao et al. 2008) pour 1600-2000, et 34 « années de ciel voilé » dont celles que les deux listes n'ont pas :
  1809 (éruption non identifiée), 1832, 1835 (Cosigüina), 1912 (Novarupta), 1982 (El Chichón)… Les années déjà racontées sont marquées
  « raconté aussi dans … ». Une petite courbe de sa vie (SVG, sans bibliothèque).
- **Où** : fiche (âgé d'au moins 5 ans), Listes, à la demande par année.

## Fichiers à fabriquer sur GitHub

Lancer une fois Actions → « Le pays au XIXe siècle (lot F) » avec `quoi = osm` : `tf-osm-cocher`, `tf-osm-forges`, `tf-osm-salines`
(Overpass injoignable depuis l'atelier). Tous les autres packs sont livrés ; `quoi = tout` les refait aussi.

## Limites

- Hôtes refusés par le réseau de l'atelier : overpass-api.de, taginfo.openstreetmap.org, www.openstreetmap.org, cartes.gouv.fr,
  www.academie-francaise.fr, www.biodiversitylibrary.org, data.giss.nasa.gov, les serveurs de fichiers `*.archive.org` ; l'API de
  Wikipédia limitait le débit (429) — `action=raw` et Wikidata ont servi.
- Wikidata connaît peu de forges, salines et lauréats du prix de vertu : les listes sont incomplètes et le disent.
