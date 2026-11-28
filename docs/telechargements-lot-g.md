# Téléchargements — lot G (« 🏰 Grands noms et remparts »)

Lu et vérifié le 26 novembre 2026. Pour chaque idée : ce qui existait déjà, la licence (citée, avec l'adresse), ce qui est construit
ou seulement en lien, et où l'utilisateur le voit.

## Fichiers

| Rôle | Fichier |
|---|---|
| Écran (fiche, village, monographie, listes, cartes, à la demande, « Où chercher », Réglages) | `assets/js/heritage-telech-g.js` |
| Style | `assets/css/telech-g.css` |
| Fabrication des données | `scripts/telech-g/build_{noms,aviateurs,lloyd,lieux,osm}.py` (+ `wm.py`) |
| Atelier GitHub | `.github/workflows/telech-g.yml` (`quoi` = tout, osm, noms, aviateurs, lloyd, lieux ; astuce du « push », `if: github.event_name != 'push'`) |
| Données livrées | `assets/data/tg-{filles,carignan,deputes,compagnons,aviateurs,lloyd,forts,poudres,semaphores,lazarets,wallace}.json.gz` |
| Textes traduits | `assets/i18n/src/telech-g.tsv` (fr en es de it pt pl nl) |
| Essai | `tests/test-telech-g.js` |

Petites lignes ajoutées dans des fichiers partagés : `index.php` (2 balises, `heritage-tout-sur.js?v=` relevé),
`assets/js/heritage-tout-sur.js` (`[/^tgp_/, 'telech_g']` dans `BLOCK_OF`), `scripts/donnees-manifest.js` (`[/^tg-/, 'scripts/telech-g']`),
`assets/data/manifest.json` (refait par son script). Aucun serveur PHP ajouté : tout est lu sur l'ordinateur.
Réglages → « 🏰 Grands noms et remparts » (clé `genealogie-telech-g`) : chaque sujet s'éteint (↶ Annuler), « À propos des données ».
Les packs apparaissent dans Réglages → 🗂 Données (« Livrées avec l'app » : taille, date, source, licence, lu dans le manifeste).

## Ce qui part sur Internet

**Rien.** Les fichiers sont dans l'app. La comparaison des noms (le nom de la fiche avec les listes) se fait dans la page, sur
l'ordinateur, et **jamais** pour une fiche vivante ou confidentielle. Dans Listes, les noms sont reliés à l'arbre par le mécanisme
déjà présent (`app-listes-personnes.js`, champs `person: true` : index local `lp_index`, rien d'envoyé). Les boutons « 📋 Chercher ce
nom » (listes sans fichier ouvert) copient le nom **sur l'ordinateur** et ouvrent la page : l'utilisateur colle lui-même le nom ;
ils n'existent pas pour une fiche vivante ou confidentielle, ni en consultation (kiosque) ou pour un invité du réseau local
(`LCNDA_GUEST`). Seuls les liens « ↗ » ouvrent une page, sur un clic. L'essai coupe et compte toute requête qui sortirait.

## Licences lues (le 2026-11-26)

- **Wikidata** — <https://www.wikidata.org/wiki/Wikidata:Copyright> (lu par `action=raw`) : « All structured data from the main,
  Property, Lexeme, and EntitySchema namespaces is available under the Creative Commons CC0 License ». → CC0, données copiées.
- **Wikipédia en français** — <https://fr.wikipedia.org/wiki/Wikip%C3%A9dia:Citation_et_r%C3%A9utilisation_du_contenu_de_Wikip%C3%A9dia> :
  « Licence Creative Commons Attribution - Partage dans les mêmes conditions 4.0 International (CC BY-SA 4.0) ». → tableaux cités
  (provinces des Filles du Roy, navires de 1665) avec « les contributeurs de Wikipédia » et le lien de l'article.
- **Wikipédia en anglais** — <https://en.wikipedia.org/wiki/Wikipedia:Copyrights> : « Permission is granted to copy, distribute
  and/or modify Wikipedia's text under the terms of the Creative Commons Attribution-ShareAlike 4.0 International License ». → les
  listes de brevets copiées (numéro, nom, date, pays, mort en vol, remarque coupée à 240 signes), avec le lien de chaque liste.
- **Wikisource** — API `meta=siteinfo&siprop=rightsinfo` : « Creative Commons Attribution-Share Alike 4.0 ». Cherché (vainqueurs de
  la Bastille) ; seul « Les Hommes du 14 juillet » (V. Fournel) en parle, sans la liste nominative : rien copié.
- **Internet Archive, « Lloyd's Registers Collections »** — <https://archive.org/details/lloydsregisters> ; chaque volume porte sa
  licence dans ses métadonnées, p. ex. <https://archive.org/metadata/HECROS1839/metadata> : « creator : Lloyd's Register Foundation,
  Heritage & Education Centre », « licenseurl : https://creativecommons.org/licenses/by-sa/4.0/ ». Sur 301 volumes « Register of
  Shipping » : 154 CC BY-SA 4.0, 128 CC BY-NC-SA 4.0, 1 CC BY-NC-ND 4.0, 18 sans licence écrite. → **aucune page copiée** : seul
  l'index (identifiant, année, partie, licence affichée du volume) est gardé, et le volume s'ouvre sur un clic.
- **Internet Archive, « Combattants français de la guerre américaine 1778-1783 »** — <https://archive.org/details/combattantsfranc00fran>,
  métadonnées <https://archive.org/metadata/combattantsfranc00fran/metadata> : Ministère des Affaires étrangères, 1903 ; numérisé par
  l'Université de Toronto ; **aucun champ de droits** (pas de `rights` ni `licenseurl`). L'ouvrage (publication officielle de 1903)
  est du domaine public par son âge, mais le texte (OCR) est sur les serveurs de fichiers `ia*.us.archive.org`, refusés par le réseau
  de l'atelier : impossible de vérifier la qualité de la lecture automatique → **lien seulement**.
- **Gallica (BnF)** — « Tableau des vainqueurs de la Bastille » (<https://gallica.bnf.fr/ark:/12148/bpt6k853088f/f1.item>, cité par
  l'article Wikipédia « Vainqueurs de la Bastille ») : gallica.bnf.fr refusé par le réseau de l'atelier ; les conditions d'utilisation
  de Gallica (réutilisation non commerciale libre, commerciale soumise à redevance) ne sont pas une licence ouverte → **lien seulement**.
- **Testaments de Poilus** (<https://testamentsdepoilus.huma-num.fr/>) — site refusé par le réseau de l'atelier (403) ; sa licence n'a
  pas pu être lue, data.gouv.fr non plus → **lien seulement**, rien copié.
- **Ordre de la Libération** (<https://www.ordredelaliberation.fr/fr/compagnons>) — refusé par le réseau de l'atelier ; on ne copie
  rien du site (lien seulement) : la liste vient de Wikidata (CC0).
- **HathiTrust** — refusé par le réseau de l'atelier : pas utilisé.
- **OpenStreetMap** — <https://www.openstreetmap.org/copyright> : ODbL 1.0, « © les contributeurs d'OpenStreetMap » (page refusée par
  le réseau de l'atelier ce jour ; lue pour le lot B le 2026-11-25). Les fichiers `tg-osm-*` se fabriquent sur GitHub, depuis
  l'extrait Geofabrik de la France (voir plus bas).

## Par idée

### 1. Filles du Roy (1663-1673) — **construit (petit, Wikidata) + provinces d'origine**
- **Existait** : non (grep « Filles du Roy / filles du roi » : rien).
- **Source** : Wikidata, personnes avec P106 ou P463 = « fille du Roi » (Q747471) : **22** (lieu de naissance pour 13) ; le tableau
  « Provinces et lieux d'origine des Filles du roi » (Silvio Dumas 1972, cité par Wikipédia « Filles du Roy », 11 lignes, 774 filles).
  La liste nominative complète (Yves Landry, PRDH) n'est pas sous licence ouverte : rien copié.
- **Comparaison avec l'arbre** : fiche décédée non confidentielle, femme, en vie en 1663-1673 (12 à 45 ans si l'âge est connu) : même nom
  de famille (sans accents ni particule) et même premier prénom → « homonyme » ; + même année de naissance (± 3) ou né à moins de 20 km →
  « homonyme probable ». Une fille du Roy née dans sa commune (moins de 3 km), de son vivant, est aussi signalée.
- **Où** : fiche, village (« Nés ici »), monographie, Listes (noms reliés à l'arbre), à la demande.

### 2. Régiment de Carignan-Salières (1665) — **construit (petit, Wikidata) + navires**
- **Existait** : non.
- **Source** : Wikidata (P7779, P463 ou P241 = Q3455247) : **12** soldats et officiers ; le tableau des 7 navires arrivés à Québec en
  1665 avec leurs compagnies (Wikipédia « Régiment de Carignan-Salières »). Il n'existe pas de liste Wikipédia des ~1 200 soldats.
- **Où** : fiche (homonyme ; soldat né près de chez lui, de son vivant), village, monographie, Listes, à la demande.

### 3. Combattants français de la guerre d'Amérique (1778-1783) — **lien seulement**
- **Existait** : non.
- Le livre de 1903 est sur Internet Archive, mais son texte (OCR) n'est pas joignable d'ici et la mise en page (listes en colonnes,
  par régiment et par navire) rend la lecture automatique peu fiable : **pas de liste copiée**. « 📋 Chercher ce nom » (copie locale,
  puis la page du livre) pour un homme décédé qui avait de 15 à 60 ans en 1778-1783 ; aussi dans « Où chercher ».

### 4. Vainqueurs de la Bastille — **lien seulement**
- **Existait** : non. Wikidata n'a aucun membre (Q3553311 n'a qu'un article) ; Wikipédia n'a pas de liste ; Gallica n'est pas sous
  licence ouverte. « 📋 Chercher ce nom » pour une personne décédée de 14 à 75 ans en 1789 avec un lieu à moins de 40 km de Paris
  (± 30 ans) ; lien vers l'article Wikipédia ; « Où chercher ».

### 5. Députés aux États généraux, à la Constituante, conventionnels — **construit (Wikidata)**
- **Existait** : non (grep « États généraux / conventionnel » : rien).
- **Source** : Wikidata : P39 = « député aux États généraux de 1789 » (Q59309522) ; P39 = « député de l'Assemblée constituante »
  (Q28218485) avec le mandat P2937 = « Assemblée nationale constituante » (Q876424, la suite des États généraux) et sa circonscription
  (P768) ; P39 = « député de la Convention nationale » (Q20808382). **2 085** personnes (2 032 avec un lieu de naissance placé).
- **Où** : fiche (homonyme ; député né dans sa commune, de son vivant), village et monographie (« Nés ici »), Listes, Cartes (lieux
  de naissance), à la demande.

### 6. Compagnons de la Libération — **construit (Wikidata, personnes décédées seulement)**
- **Existait** : en partie — un lien « Compagnons de la Libération ↗ » dans le bloc Résistance (`heritage-more.js`) : gardé, pas
  dupliqué ; ici la liste elle-même.
- **Source** : Wikidata, P166 = « compagnon de la Libération » (Q2990283), personnes (Q5) seulement (pas les communes ni les unités),
  et **seulement avec une date de mort** (P570) : **1 047** personnes (1 045 avec un lieu de naissance placé ; Wikidata en a un peu plus que les 1 038 officiels — doublons ou erreurs de Wikidata, gardés tels quels). Le dernier Compagnon (Hubert Germain) est mort en 2021 : tous
  sont décédés ; l'essai le vérifie (aucune ligne sans date de mort).
- **Où** : fiche, village, monographie, Listes, Cartes, à la demande.

### 7. Pionniers de l'aviation (brevets de l'Aéro-Club de France) — **construit (1909-1911)**
- **Existait** : non (seulement une mention dans les blocs « école »).
- **Source** : Wikipédia en anglais, « List of pilots awarded an Aviator's Certificate by the Aéro-Club de France in 1909 / 1910 /
  1911 » : **706** brevets (n° 1 Blériot … n° 705), dont 140 morts en vol. Les listes 1912-1914 n'existent pas sur Wikipédia : l'app
  le dit.
- **Où** : fiche (homonyme, en vie en 1909-1911, 15 à 75 ans), Listes (noms reliés à l'arbre), à la demande.

### 8. Testaments de Poilus — **lien seulement**
- Site et licence illisibles d'ici. « 📋 Chercher ce nom » pour un homme décédé de 17 à 50 ans en 1914 ; « Où chercher ».

### 9. Lloyd's Register 1764-1900 — **construit (index seulement) + liens**
- **Existait** : non.
- `tg-lloyd` : **155** volumes (116 années de 1764 à 1900) de la collection de la Lloyd's Register Foundation sur Internet Archive.
  Pour un marin, matelot, capitaine, armateur, pilote, douanier… : les volumes de ses années (un par décennie, 6 au plus) ; à la
  demande : le volume d'une année ; Listes. La recherche d'un navire se fait dans le volume, sur Internet Archive, en tapant soi-même
  le nom (l'app n'envoie rien, ni nom de l'arbre ni nom de navire). HathiTrust : non joignable, pas utilisé.

### 10-12. Forts Séré de Rivières, ligne Maginot, Vauban — **construit (Wikidata) + OpenStreetMap sur GitHub**
- **Existait** : en partie — le module Châteaux (`scripts/chateaux-territoires`) garde les « forteresses » et « forts » (Q57831,
  Q1785071) d'Europe, sans dire à quel système ils appartiennent : pas dupliqué, signalé dans le texte (« Les forteresses plus
  anciennes sont dans le module Châteaux ») ; ici seulement les trois systèmes.
- **Source** : Wikidata, P361 = « système Séré de Rivières » (Q3397) : 44 ; P361 = « ligne Maginot » (Q162746) ou P31 = « ouvrage de
  la ligne Maginot » (Q3358760) : 12 ; architecte P84 = Vauban (Q216362) ou P361 = « Fortifications de Vauban » (Q833781) : 21.
  `tg-osm-forts` (historic=fort, noms « Maginot », « Séré de Rivières », bunkers et casemates) **à fabriquer sur GitHub**.
- **Où** : fiche (moins de 10 km, 30 km pour un militaire : « Il était militaire : … »), village (15 km), monographie, Listes, Cartes.

### 13. Poudrières et poudreries — **construit (petit) + OpenStreetMap sur GitHub**
- **Existait** : non. Wikidata : poudrière (Q17504814) en France : 19 ; poudrerie (Q385422, P31 ou P366) : 2. `tg-osm-poudres` sur GitHub.
- Métier poudrier, salpêtrier, artificier, artilleur → 25 km au lieu de 8.

### 14. Sémaphores de la Marine — **construit (petit) + OpenStreetMap sur GitHub**
- **Existait** : non. Wikidata (Q1874098, France) : 14. `tg-osm-semaphores` sur GitHub. Métier de la mer → 25 km au lieu de 10.

### 15. Lazarets et quarantaines — **construit (très petit) + OpenStreetMap sur GitHub**
- **Existait** : non (le mot « Lazarett » n'apparaît que dans une traduction allemande d'« hôpital militaire »).
- Wikidata (Q859247, P31 ou P366, France) : **2** seulement ; `tg-osm-lazarets` (noms « lazaret », « quarantaine ») sur GitHub.

### 16. Pavillons d'octroi — **déjà dans l'app : pas dupliqué**
- Le lot B (`heritage-telech-b-village.js`, « 🪨 Bornes, octrois et douanes » : `tb-wd-bornes` Wikidata Q138783271/Q110453637 et
  `tb-osm-bornes` OpenStreetMap « octroi ») montre déjà les pavillons et bureaux d'octroi sur la fiche du village ; le lot 9
  (`heritage-lot9-monde-coutumes.js`, « 🚧 L'octroi de sa ville ») explique la taxe. Rien d'ajouté ; Réglages le rappelle.

### 17. Fontaines Wallace — **construit (Wikidata) + OpenStreetMap sur GitHub**
- **Existait** : non. Wikidata (Q829304, dans le monde) : 239 ; `tg-osm-wallace` (amenity=drinking_water|fountain dont le nom, le modèle
  ou la marque dit « Wallace ») sur GitHub.
- **Où** : fiche (personne en vie après 1872, un lieu à moins de 2 km), village (3 km), monographie, Listes, Cartes.

## Fichiers à fabriquer sur GitHub

Lancer une fois Actions → « OpenStreetMap France (extrait Geofabrik) » avec `quoi = g` : `tg-osm-forts`, `tg-osm-poudres`,
`tg-osm-semaphores`, `tg-osm-lazarets`, `tg-osm-wallace` (voir « OpenStreetMap sans Overpass » plus bas). Secours : « Grands noms et
remparts (lot G) » avec `quoi = osm` (Overpass). Tous les autres packs sont livrés ; `quoi = tout` les refait (sans OpenStreetMap).

## Sécurité

Tous les champs des fichiers sont échappés (`esc`) ; les adresses passent par `safeUrl` (http(s) seulement, sans guillemets ni
chevrons) ; les identifiants Internet Archive par `safeId` (`[A-Za-z0-9_.-]`), les liens OpenStreetMap ne prennent qu'un nombre, les
liens Wikidata qu'un `Q…` ; le numéro de fiche des boutons est un nombre. Aucun appel serveur nouveau ; aucun `fetch` hors
`assets/data/tg-*.json.gz` (même origine).

## Limites

- Hôtes refusés par le réseau de l'atelier : overpass-api.de, www.openstreetmap.org, gallica.bnf.fr, testamentsdepoilus.huma-num.fr,
  www.ordredelaliberation.fr, www.data.gouv.fr, www.hathitrust.org, babel.hathitrust.org, les serveurs de fichiers `ia*.us.archive.org` ;
  les API de Wikipédia et de Wikisource limitaient le débit (429) — `action=raw`, Wikidata et l'API de recherche d'Internet Archive ont servi.
- Wikidata connaît peu de Filles du Roy, de soldats de Carignan-Salières, de poudrières, de sémaphores et de lazarets : les listes sont
  incomplètes et le disent ; OpenStreetMap (GitHub) complète les lieux.
- Un même nom ne veut pas dire la même personne : l'app dit « homonyme » (ou « homonyme probable » quand l'année ou le lieu de naissance
  concorde) et ne relie rien toute seule.

## OpenStreetMap sans Overpass : l'extrait Geofabrik (depuis le 2026-11-26)

Les questions « toute la France » au service public Overpass (overpass-api.de, overpass.kumi.systems) échouaient pendant des heures
(délais dépassés, 502/504) et chargent un service partagé. Les fichiers `tg-osm-forts`, `tg-osm-poudres`, `tg-osm-semaphores`, `tg-osm-lazarets`, `tg-osm-wallace` se fabriquent maintenant depuis **un extrait téléchargé** :

- **Lancer** : Actions → « OpenStreetMap France (extrait Geofabrik) » (`.github/workflows/osm-france.yml`) → « Run workflow », `quoi = g`
  (ou `tout` pour les lots B, E, F, G, H d'un coup). Le workflow refait le sommaire `assets/data/manifest.json` et n'enregistre que les
  fichiers OpenStreetMap des lots (`tb-osm-*`, `te-libertes`, `tf-osm-*`, `tg-osm-*`, `th-osm-*`) et le sommaire.
- **Comment** : la somme `france-latest.osm.pbf.md5` est lue d'abord ; l'extrait <https://download.geofabrik.de/europe/france-latest.osm.pbf>
  (~4,5 Go) n'est téléchargé que s'il n'est pas déjà dans le cache GitHub sous cette somme, puis vérifié (`scripts/osm-france/geofabrik.sh`).
  `osmium-tool` (paquet Ubuntu) le trie en un passage (`osmium tags-filter`, expressions tirées **automatiquement** des filtres Overpass
  du script : `python3 -I scripts/osm-france/osm_local.py filtres g` ; toujours plus larges que le filtre exact), puis donne aux chemins
  la position de leurs nœuds (`osmium add-locations-to-ways`, fichier OPL) — `scripts/osm-france/filtrer.sh`. Le script du lot est lancé
  comme avant, avec `OSM_OPL=<fichier>` : `scripts/osm-france/osm_local.py` applique le filtre exact (mêmes règles qu'Overpass : clé
  présente, `=`, `~`, `,i`) et rend les objets comme « out center » d'Overpass (centre du rectangle englobant des chemins et relations).
  **Mêmes lignes, mêmes champs, mêmes fichiers** : l'app ne change pas.
  Commande du script : `OSM_OPL=…/g.opl python3 -I scripts/telech-g/build_osm.py assets/data`. Dans `telech-g.yml`, `quoi = tout` ne
  questionne plus Overpass ; `quoi = osm` reste le secours.
- **Différences avec Overpass** : l'extrait Geofabrik déborde de quelques kilomètres sur les pays voisins (Overpass s'arrêtait à la
  frontière) ; une relation n'a de position que si ses membres sont dans l'extrait ; quels territoires d'outre-mer l'extrait « France »
  contient est à vérifier sur la page de Geofabrik (Overpass prenait toute la zone ISO FR).
- **Secours** : l'ancien chemin Overpass reste possible (`.github/workflows/telech-g.yml`, voir plus haut), mais n'est plus lancé
  par défaut.
- **Licences** : données OpenStreetMap, **ODbL 1.0**, attribution « © les contributeurs d'OpenStreetMap »
  (<https://www.openstreetmap.org/copyright>, lue pour le lot B le 2026-11-25 ; les champs `licence`/`licence_url` des fichiers ne
  changent pas). Les extraits Geofabrik sont ces mêmes données OSM, sous la même licence ODbL ; Geofabrik les offre librement et
  demande de ne pas retélécharger sans raison le même fichier (d'où la somme MD5 et le cache). Les pages de Geofabrik
  (<https://download.geofabrik.de/>, <https://www.geofabrik.de/data/download.html>) et celle d'OpenStreetMap ont été **refusées par le
  réseau de l'atelier le 2026-11-26** : conditions **non relues ce jour**, à relire avant le premier lancement.
