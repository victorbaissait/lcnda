# Téléchargements — lot H (« 🧺 Places, métiers et rivages »)

Lu et vérifié le 26 novembre 2026. Pour chaque idée : ce qui existait déjà, la licence (citée, avec l'adresse), ce qui est construit
ou seulement en lien, et où l'utilisateur le voit.

## Fichiers

| Rôle | Fichier |
|---|---|
| Écran (fiche, village, monographie, listes, cartes, à la demande, Réglages) | `assets/js/heritage-telech-h.js` |
| Style | `assets/css/telech-h.css` |
| Fabrication des données | `scripts/telech-h/build_{wikidata,bastides,textes,trudaine,osm}.py` (+ `wm.py`) |
| Atelier GitHub | `.github/workflows/telech-h.yml` (`quoi` = tout, osm, wikidata, bastides, textes, trudaine ; astuce du « push », `if: github.event_name != 'push'`) |
| Données livrées | `assets/data/th-{kiosques,marianne,halles,funiculaires,eclusieres,tramways,bastides,ateliers,textes,trudaine}.json.gz` (≈ 55 Ko en tout) |
| Textes traduits | `assets/i18n/src/telech-h.tsv` (fr en es de it pt pl nl) |
| Essai | `tests/test-telech-h.js` |

Petites lignes ajoutées dans des fichiers partagés : `index.php` (2 balises ; `heritage-tout-sur.js?v=` et `designs-gen.css?v=` relevés),
`assets/js/heritage-tout-sur.js` (`[/^thp_/, 'telech_h']` dans `BLOCK_OF`), `scripts/donnees-manifest.js` (`[/^th-/, 'scripts/telech-h']`),
`assets/data/manifest.json` (refait par son script), `assets/css/designs-gen.css` (refait par `scripts/build-designs-css.py`).
Réglages → « 🧺 Places, métiers et rivages » (clé `genealogie-telech-h`) : chacun des 17 sujets s'éteint (↶ Annuler), « À propos des données ».
Les packs apparaissent dans Réglages → 🗂 Données (lu dans le manifeste : taille, date, source, licence).

## Ce qui part sur Internet

**Rien.** Les fichiers sont dans l'app ; aucun nom, aucun lieu n'est envoyé, pour personne (vivant, confidentiel, invité du réseau,
mode consultation : pareil — tout est calculé sur l'ordinateur). Seuls les liens « ↗ » ouvrent une page, sur un clic. L'essai coupe et
compte toute requête qui sortirait (fiche d'une personne vivante, mode consultation) : zéro.

## Licences lues (le 2026-11-26)

- **Wikidata** — <https://www.wikidata.org/wiki/Wikidata:Copyright> (lue ce jour) : « All structured data from the main, Property, Lexeme,
  and EntitySchema namespaces is available under the Creative Commons CC0 License ». → CC0, données copiées.
- **Wikipédia en français** — <https://fr.wikipedia.org/wiki/Wikip%C3%A9dia:Citation_et_r%C3%A9utilisation_du_contenu_de_Wikip%C3%A9dia>
  (lue ce jour) : « Creative Commons Attribution - Partage dans les mêmes conditions 4.0 International ». → phrases citées telles quelles,
  avec « les contributeurs de Wikipédia » et le lien de l'article (texte lu par `action=raw`, une requête par article).
- **Wikimedia Commons** — <https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia/fr> (lue ce jour) : chaque
  fichier a sa propre licence. Pour l'Atlas de Trudaine, la licence de **chaque** planche est lue par l'API (`extmetadata`
  `LicenseShortName`) : 160 fichiers dans la catégorie et ses sous-catégories, gardés seulement s'ils sont « Public domain », CC0 ou
  CC BY(-SA) — on ne copie que le **titre** du fichier et sa licence ; l'image n'est jamais copiée ni chargée (lien « ↗ » sur un clic).
- **OpenStreetMap** — <https://www.openstreetmap.org/copyright> : ODbL 1.0, « © les contributeurs d'OpenStreetMap ». Page refusée par le
  réseau de l'atelier ce jour (lue pour le lot B le 2026-11-25, même texte). Les fichiers `th-osm-*` se fabriquent sur GitHub, depuis
  l'extrait Geofabrik de la France (voir plus bas).
- **Atlas d'Ancien Régime** (Th. Fressin) — déjà livré (`dp-ancien-regime`, lot « Droit et pouvoir ») : généralités CC BY 4.0 (licence
  écrite dans le pack, `https://github.com/t-fressin/atlas-ancien-regime`). Réutilisé, pas recopié.
- **Communes** (Trudaine) : `assets/data/cc-communes.json.gz`, déjà dans l'app (Licence Ouverte 2.0).
- **Archives nationales, base Archim (Atlas de Trudaine)** — <https://www.culture.gouv.fr/documentation/archim/atlasdetrudaine.htm> :
  refusée par le réseau de l'atelier ; la licence des images et de la base n'a **pas pu être lue** → **lien seulement**.
- **e-monumen** (inventaire des monuments, bustes de Marianne) — <https://e-monumen.net/> : refusé par le réseau ; licence non lue →
  **lien seulement**.
- **Ifremer, zones de production conchylicole** — `sextant.ifremer.fr` refusé par le réseau ; sur data.gouv.fr (API lue ce jour), il n'y a
  que des morceaux : « zones conchylicoles » de la DDTM de la Manche (`lov2`, un seul département,
  <https://www.data.gouv.fr/datasets/zones-conchylicoles>), « Plan POLMAR — Zones conchylicoles en Occitanie » (licence `notspecified` :
  pas réutilisable), et la liste DGAL des établissements agréés (`fr-lo`, mais elle nomme des entreprises et des exploitants : pas copiée).
  → **lien seulement** (recherche data.gouv.fr « zones conchylicoles »).

## Par idée

### 18. Kiosques à musique et sociétés de musique — **construit + OpenStreetMap sur GitHub**
- **Existait** : non (seulement un « kiosque, gloriette » parmi les objets de la maison virtuelle ; rien de géographique).
- **Construit** : `th-kiosques` (Wikidata : kiosque à musique Q3126170 et sous-classes, 43 ; fanfare Q1426710 et orchestre d'harmonie
  Q762048, 3 — Wikidata connaît très peu de sociétés de musique, c'est dit). `th-osm-kiosques` (`leisure=bandstand`, `amenity=bandstand`,
  noms « Kiosque à musique ») **à fabriquer sur GitHub**. Les notices Mérimée « kiosque » du pack « Patrimoine » (s'il est installé) sont
  réutilisées sur la fiche du village.
- **Métier** : musicien, clairon, tambour, chef de musique… → rayon 15 km au lieu de 3.

### 19. Monuments à la République et bustes de Marianne — **construit (petit) + lien e-monumen**
- **Existait** : non (Marianne n'apparaît que comme timbre ou objet).
- **Construit** : `th-marianne` (44 : œuvres qui « dépeignent » Marianne Q325956, et statues, bustes, fontaines nommés « Monument à la
  République », « Statue de la République »…). e-monumen : lien seulement (voir licences).

### 20. Halles et marchés couverts — **construit + OpenStreetMap sur GitHub ; Mérimée réutilisé**
- **Existait** : en partie — les notices Mérimée « halle » du pack « Patrimoine » (si installé). Réutilisées sur la fiche du village,
  **pas dupliquées**.
- **Construit** : `th-halles` (Wikidata Q2080521 et sous-classes, 320 ; les éléments dont le nom ne dit ni halle, ni marché, ni carreau…
  sont écartés). `th-osm-halles` (`amenity=marketplace` bâti ou couvert, bâtiments « Halle(s) », « Marché couvert ») **sur GitHub**.
- **Métier** : marchand, boucher, poissonnier, regrattier, maraîcher… → 10 km au lieu de 2.

### 21. Fours banals — **EXISTAIT (lot B) : prolongé, pas dupliqué**
- **Existait** : oui — « 🍞 Fours à pain et pigeonniers » du lot B (`tb-wd-village`, `tb-osm-village`, fiche du village).
- **Ajouté** : sur la **fiche d'une personne**, le four du village (moins d'1 km), ou à 5 km pour un boulanger, fournier, meunier
  (« Il était boulanger. Près de ses lieux : Four communal de Chauriat… »). Aucun nouveau fichier : les deux packs du lot B sont lus.

### 22. Funiculaires et ponts transbordeurs — **construit**
- **Existait** : non.
- **Construit** : `th-funiculaires` (Wikidata : funiculaire Q142031, 26 ; pont transbordeur Q506412, 5 — Rouen 1899-1940, Rochefort…).
- **Où** : fiche (« En 1899 : pont transbordeur de Rouen, à 1 km de Rouen » quand il ouvre pendant sa vie), village, monographie, Listes, Cartes.

### 23. Maisons éclusières et gares d'eau — **construit + OpenStreetMap sur GitHub**
- **Existait** : en partie — « 🌉 Ponts, canaux, tunnels » (`heritage-epoque-travail.js`, `et-ouvrages`) montre les **écluses** pour un
  éclusier ou un batelier. Ici, les **maisons** éclusières et les gares d'eau, sans recopier les écluses.
- **Construit** : `th-eclusieres` (Wikidata Q27685913, 218 ; « gare d'eau », 3). `th-osm-eclusieres` (bâtiments « Maison éclusière »,
  « Maison de l'éclusier », « Gare d'eau ») **sur GitHub**.
- **Métier** : marinier, batelier, éclusier, haleur, flotteur, passeur… → 20 km au lieu de 2 (« Il était marinier. Près de ses lieux : … »).

### 24. Tramways départementaux et petits trains disparus — **construit + tracés OpenStreetMap sur GitHub**
- **Existait** : non (« tramway » seulement comme métier dans `epoque-travail`).
- **Construit** : `th-tramways` (Wikidata : réseaux et lignes de tramway, chemins de fer secondaires et d'intérêt local, lignes de chemin
  de fer — **seulement ceux qui ont fermé avant 1975**, 144, avec ouverture et fermeture).
- **Tracés** : `th-osm-traces` (`railway=abandoned|disused|razed`, `abandoned:railway`, `razed:railway`, `disused:railway`, France
  seulement) **à fabriquer sur GitHub** ; géométrie simplifiée (Douglas-Peucker ≈ 150 m, 4 décimales, tronçons sans nom de moins de 300 m
  écartés, fichier refusé au-delà de 15 Mo). Sur la fiche : « Une voie ferrée aujourd'hui disparue passait à … » (moins de 1,5 km) ;
  Cartes : couche de traits « 🛤 Voies ferrées disparues ».

### 25. Atlas de Trudaine (1745-1780) — **lien (Archives nationales) + titres des planches de Commons + généralité réutilisée**
- **Existait** : non. La généralité de chaque commune en 1789 existait (Atlas d'Ancien Régime, lot « Droit et pouvoir ») : réutilisée.
- **Archives nationales / Archim** : injoignables, licence non lue → **lien seulement** (et la cote CP/F/14/8443 à 8507).
- **Construit** : `th-trudaine` — les 160 fichiers de la catégorie Commons « Atlas de Trudaine » (et sous-catégories) ; 23 planches dont
  le titre nomme une commune de France sans ambiguïté (Caen, Tours, Bar-sur-Seine, Joinville, Versailles…). Les mots courants qui sont
  aussi des noms de communes (« Plan », « Château », « Ponts », « Paris » d'une route…) sont écartés.
- **Où** : village (« En 1789, Monpazier était dans la généralité de Bordeaux. … » + planches à moins de 10 km + liens Archim et Commons),
  fiche (une planche nomme sa commune, s'il vivait avant 1830), Listes, Cartes.

### 26. Bastides du Sud-Ouest — **construit**
- **Existait** : non.
- **Source** : Wikipédia « Liste de bastides » (par département, par année, par fondateur ; d'après G. Bernard 1993 et J. Dubourg 2002 ;
  la page dit que la liste n'est pas exhaustive et que les dates varient). Wikidata n'a que 5 éléments « bastide » (Q810652) ; son
  fondateur (P112) et sa date (P571) servent seulement quand la liste ne les donne pas.
- **Construit** : `th-bastides` : 317 communes, 249 datées, 168 avec le fondateur (Alphonse de Poitiers, Édouard Ier, Eustache de
  Beaumarchès, Raymond VII, Philippe IV le Bel…). « Monpazier est une bastide, fondée en 1284 par Édouard Ier. »

### 27 à 31. Coutellerie, ganterie et mégisserie, vannerie, biscuiteries et chocolateries, sardineries et conserveries — **construits**
- **Existait** : en partie — `heritage-metiers-rivieres.js` (pack « Métiers et rivières ») a des catégories d'industries (tannerie,
  teinturerie…) mais pas celles-ci ; rien n'est recopié.
- **Wikidata** : `th-ateliers` (53 : secteur P452, produit P1056 ou nature P31 = coutellerie, couteau, ganterie, gant, mégisserie,
  vannerie, panier, osier, chocolaterie, chocolat, biscuiterie, biscuit, conserverie, sardines à l'huile ; siège P159). Biscuiteries et
  chocolateries : **seulement celles fondées avant 1914** (filtre à l'affichage).
- **Wikipédia** : `th-textes` — les phrases qui contiennent le mot du métier **et** nomment une commune (lien vers un article qui a un
  code INSEE dans Wikidata), la commune devant être nommée à moins de 80 caractères du mot ; articles du métier (Coutellerie, Coutellerie
  de Thiers, Gant, Mégisserie, Vannerie, Chocolaterie, Biscuit, Conserve de sardines à l'huile…) et des communes connues pour ce métier
  (Thiers, Nogent, Laguiole ; Millau, Grenoble, Annonay, Saint-Junien, Chaumont ; Villaines-les-Rochers, Fayl-Billot, Origny-en-Thiérache ;
  Noisiel, Blois ; Douarnenez, Concarneau, Quiberon…). Phrases abîmées (modèle perdu : « depuis le , ») ou d'aujourd'hui (années ≥ 1990)
  refusées ; trois phrases au plus par commune.
- **Métier** (fiche, recensements, événements « métier ») : coutelier, rémouleur ; gantier, mégissier, chamoiseur ; vannier, osiérier ;
  chocolatier, biscuitier, confiseur ; sardinier·ère, friturière, conserveur → 30 à 40 km au lieu de 10, et « Elle était sardinière. »

### 32. Terre-neuvas — **construit (Wikipédia)**
- `th-textes` (articles Terre-neuvas, Grande pêche, Morue, et Fécamp, Saint-Malo, Bègles…) : « Saint-Malo et Fécamp, ainsi que Granville
  devinrent d'importants ports de terre-neuvas. » Marin, matelot, pêcheur, mousse, saleur… → 60 km.

### 33. La mer nourricière — **construit (Wikipédia) + lien Ifremer**
- `th-textes` (Ostréiculture, Goémonier, Pêche à pied ; Cancale, Marennes, Arcachon, Plouguerneau) ; ostréiculteur, parqueur, goémonier,
  pêcheur à pied, mareyeur → 40 km. Zones conchylicoles d'Ifremer : **lien seulement** (voir licences).

### 34. Plantes à teinture — **construit (Wikipédia)**
- `th-textes` (Garance des teinturiers, Pastel des teinturiers, Pays de Cocagne ; Avignon, Albi, Lauragais) : Toulouse, Albi, Gaillac,
  Mazamet, Maurens… Teinturier, pastelier, garancier → 40 km.

## Fichiers à fabriquer sur GitHub

Lancer une fois Actions → « OpenStreetMap France (extrait Geofabrik) » avec `quoi = h` : `th-osm-kiosques`, `th-osm-halles`,
`th-osm-eclusieres`, `th-osm-traces` (voir « OpenStreetMap sans Overpass » plus bas). Secours : « Places, métiers et rivages (lot H) »
avec `quoi = osm` (Overpass). Tous les autres packs sont livrés ; `quoi = tout` les refait (sans OpenStreetMap).
Avant : Réglages le dit, les listes et couches correspondantes sont vides, sans erreur.

## Limites

- Hôtes refusés par le réseau de l'atelier : overpass-api.de, www.openstreetmap.org, e-monumen.net, www.culture.gouv.fr (Archim),
  www.archives-nationales.culture.gouv.fr, sextant.ifremer.fr, geobretagne.fr. Wikidata (SPARQL) et Commons ont limité le débit (429) :
  les scripts attendent et reprennent.
- Wikidata connaît peu de kiosques, de sociétés de musique, de bustes de Marianne et d'ateliers : listes incomplètes, et c'est dit sur la
  fiche. Les phrases de Wikipédia sont choisies par mot-clé : elles peuvent nommer une ville pour une raison secondaire (« rue Ganterie à
  Rouen ») ; elles sont toujours citées avec leur article.
- France métropolitaine seulement (les points hors 41-51,5° N, 5,5° O-10° E sont écartés).

## OpenStreetMap sans Overpass : l'extrait Geofabrik (depuis le 2026-11-26)

Les questions « toute la France » au service public Overpass (overpass-api.de, overpass.kumi.systems) échouaient pendant des heures
(délais dépassés, 502/504) et chargent un service partagé. Les fichiers `th-osm-kiosques`, `th-osm-halles`, `th-osm-eclusieres`, `th-osm-traces` se fabriquent maintenant depuis **un extrait téléchargé** :

- **Lancer** : Actions → « OpenStreetMap France (extrait Geofabrik) » (`.github/workflows/osm-france.yml`) → « Run workflow », `quoi = h`
  (ou `tout` pour les lots B, E, F, G, H d'un coup). Le workflow refait le sommaire `assets/data/manifest.json` et n'enregistre que les
  fichiers OpenStreetMap des lots (`tb-osm-*`, `te-libertes`, `tf-osm-*`, `tg-osm-*`, `th-osm-*`) et le sommaire.
- **Comment** : la somme `france-latest.osm.pbf.md5` est lue d'abord ; l'extrait <https://download.geofabrik.de/europe/france-latest.osm.pbf>
  (~4,5 Go) n'est téléchargé que s'il n'est pas déjà dans le cache GitHub sous cette somme, puis vérifié (`scripts/osm-france/geofabrik.sh`).
  `osmium-tool` (paquet Ubuntu) le trie en un passage (`osmium tags-filter`, expressions tirées **automatiquement** des filtres Overpass
  du script : `python3 -I scripts/osm-france/osm_local.py filtres h` ; toujours plus larges que le filtre exact), puis donne aux chemins
  la position de leurs nœuds (`osmium add-locations-to-ways`, fichier OPL) — `scripts/osm-france/filtrer.sh`. Le script du lot est lancé
  comme avant, avec `OSM_OPL=<fichier>` : `scripts/osm-france/osm_local.py` applique le filtre exact (mêmes règles qu'Overpass : clé
  présente, `=`, `~`, `,i`) et rend les objets comme « out center » d'Overpass (centre du rectangle englobant des chemins et relations).
  **Mêmes lignes, mêmes champs, mêmes fichiers** : l'app ne change pas.
  `th-osm-traces` : les chemins gardent **tout leur tracé** (position de chaque nœud), puis la même simplification Douglas-Peucker
  (~150 m, 4 décimales) et la même limite de 15 Mo qu'avant ; plus besoin de découper la France en carreaux. Commande du script :
  `OSM_OPL=…/h.opl python3 -I scripts/telech-h/build_osm.py assets/data`. Dans `telech-h.yml`, `quoi = tout` ne questionne plus
  Overpass ; `quoi = osm` reste le secours.
- **Différences avec Overpass** : l'extrait Geofabrik déborde de quelques kilomètres sur les pays voisins (Overpass s'arrêtait à la
  frontière) ; une relation n'a de position que si ses membres sont dans l'extrait ; quels territoires d'outre-mer l'extrait « France »
  contient est à vérifier sur la page de Geofabrik (Overpass prenait toute la zone ISO FR).
- **Secours** : l'ancien chemin Overpass reste possible (`.github/workflows/telech-h.yml`, voir plus haut), mais n'est plus lancé
  par défaut.
- **Licences** : données OpenStreetMap, **ODbL 1.0**, attribution « © les contributeurs d'OpenStreetMap »
  (<https://www.openstreetmap.org/copyright>, lue pour le lot B le 2026-11-25 ; les champs `licence`/`licence_url` des fichiers ne
  changent pas). Les extraits Geofabrik sont ces mêmes données OSM, sous la même licence ODbL ; Geofabrik les offre librement et
  demande de ne pas retélécharger sans raison le même fichier (d'où la somme MD5 et le cache). Les pages de Geofabrik
  (<https://download.geofabrik.de/>, <https://www.geofabrik.de/data/download.html>) et celle d'OpenStreetMap ont été **refusées par le
  réseau de l'atelier le 2026-11-26** : conditions **non relues ce jour**, à relire avant le premier lancement.
