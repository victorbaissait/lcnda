# Téléchargements — lot E (« 🌌 Ciel, climat et mémoire »)

Lu et vérifié le 26 novembre 2026. Pour chaque idée : ce qui existait déjà, la licence (citée, avec l'adresse), ce qui est
construit ou seulement en lien, et où l'utilisateur le voit.

## Fichiers

| Rôle | Fichier |
|---|---|
| Écran (fiche, village, monographie, listes, cartes, à la demande, Où chercher, Réglages) | `assets/js/heritage-telech-e.js` |
| Style | `assets/css/telech-e.css` |
| Fabrication des données | `scripts/telech-e/build_{ciel,secheresses,hivers,inscriptions,fossiles,libertes,religion}.py` (+ `wm.py`), lancés avec `python3 -I` |
| Atelier GitHub | `.github/workflows/telech-e.yml` (entrée `quoi`, astuce du « push » avec `if: github.event_name != 'push'`, cache dans `$RUNNER_TEMP` par `$GITHUB_ENV`) |
| Données livrées | `assets/data/te-{ciel,secheresses,hivers,inscriptions,religion,libertes}.json.gz` (≈ 1,1 Mo en tout) |
| Textes traduits | `assets/i18n/src/telech-e.tsv` (fr en es de it pt pl nl, 202 lignes) |
| Essai | `tests/test-telech-e.js` |

Petites lignes ajoutées dans des fichiers partagés : `index.php` (1 style, 1 script, `heritage-tout-sur.js?v=16`),
`assets/js/heritage-tout-sur.js` (`[/^tep_/, 'telech_e']` dans `BLOCK_OF` — 1 ligne), `scripts/donnees-manifest.js`
(`[/^te-/, 'scripts/telech-e']`), `assets/data/manifest.json` (refait par le script). Les packs `te-*` apparaissent d'eux-mêmes
dans Réglages → 🗂 Données (thème « Livrées avec l'app », taille, date, source, licence) : rien à changer dans `app-listes-maj.js`.
Réglages → « 🌌 Ciel, climat et mémoire » (clé `genealogie-telech-e`) : chaque partie s'éteint (↶ Annuler), « À propos des données ».

## Ce qui part sur Internet

**Rien.** Le module ne fait aucun appel au serveur ni à un site : il lit seulement ses fichiers `assets/data/te-*.json.gz`.
Les liens « ↗ » ouvrent une page sur un clic. « 📋 Chercher ce nom » (bases de J.-C. Farcy) copie le nom dans le presse-papiers de
l'ordinateur et ouvre la page d'accueil du site : le nom n'est jamais dans une adresse. Ce bouton n'existe que pour une personne
décédée (décès connu, ou née avant 1900), jamais pour une fiche vivante ou confidentielle, et jamais en mode consultation ou
pour un appareil invité (`body.is-kiosk`, `LCNDA_GUEST`). Il n'y a donc pas de partie serveur (pas de `lib/telech_e.php`).

## Par idée

### 1. Le ciel noir d'autrefois — **construit, avec une autre source que celle demandée**
- **Existait** : non (le ciel de naissance de `heritage-tresors-ciel.js` dessine les étoiles, pas la pollution lumineuse).
- **Falchi et al. 2016** (GFZ Data Services, doi:10.5880/GFZ.1.4.2016.001) : `dataservices.gfz-potsdam.de` et `b2find.eudat.eu`
  refusés par le réseau de l'atelier → page de licence **pas lue directement**. Ce qu'on a pu lire : la notice B2FIND (par une
  recherche) indique la licence **CC BY-NC 4.0** et un téléchargement par formulaire ; le README de Hotham (2026, ci-dessous) écrit :
  « its GeoTIFF is distributed with a 2016 note that further distribution is prohibited, and under a non-commercial licence ».
  Pas ouvert → **lien seulement** (DOI, dans le bloc et dans Réglages).
- **Source retenue** : Hotham, T. (2026), « Darkest Skies… A Sky Glow Model of the World… from VIIRS Night Lights », Zenodo,
  https://doi.org/10.5281/zenodo.23757708 — notice Zenodo lue le 2026-11-26 : licence `cc-by-4.0` ; README : « Text, figures and
  derived data: CC BY 4.0 » (lumières : Earth Observation Group VIIRS via WorldPop, CC BY 4.0). Même grandeur que Falchi (clarté
  artificielle au zénith) et mêmes seuils (174 µcd/m² naturel, 688 µcd/m² : plus de Voie lactée). Le script relit la licence.
- **Construit** : `te-ciel.json.gz` (88 Ko : la grille à 5′ ≈ 9 km de l'Europe de l'Ouest, un octet par carreau). L'app calcule la
  magnitude du ciel, la magnitude limite à l'œil nu et le nombre d'étoiles visibles (≈ 3 000 sous un ciel naturel ; Paris ≈ 70).
- **Où** : fiche (lieu de naissance avant 1950 : « Né à Allanche en 1890, il voyait la nuit un ciel noir… Aujourd'hui… »),
  village, monographie, à la demande ; liens lightpollutionmap.info (coordonnées du lieu, sur un clic) et Falchi.

### 2. Pluies d'étoiles filantes — **construit (calculé, sans fichier)**
- **Existait** : non (seulement les météorites tombées, `heritage-terre-quotidien.js`).
- **Source** : liste de travail des essaims de l'IMO (dates d'activité, maximum en longitude solaire J2000, taux zénithal).
  www.imo.net refusé par le réseau de l'atelier : rien n'en est copié, seulement une dizaine de valeurs publiées partout (faits).
  La longitude du Soleil est calculée (Meeus) pour chaque année. Géminides comptées à partir de 1862, Quadrantides de 1835.
- **Grandes pluies d'étoiles** (texte écrit ici, liens Wikipédia) : Léonides 1799 (Humboldt ; vue jusqu'en Europe), 1833 (**vue en
  Amérique du Nord : en Europe il faisait jour** — dit honnêtement, pas montrée comme « vue de France »), 1866 (toute l'Europe),
  Andromédides 1872 et 1885, Draconides 1933, Léonides 1999.
- **Où** : fiche (« La nuit de sa naissance (12 août), c'étaient les Perséides, à leur maximum… » ; « elle a pu voir la pluie
  d'étoiles des Léonides (1866, à 46 ans) »), Listes « ☄️ Essaims d'étoiles filantes », à la demande.

### 3. Atlas des sécheresses d'Europe — **construit**
- **Existait** : non (des sécheresses citées dans le texte, rien par lieu et par année).
- **Licence** : Old World Drought Atlas, Cook et al. 2015, NOAA/NCEI, https://www.ncei.noaa.gov/access/paleo-search/study/19419 —
  readme NCEI/WDS Paleoclimatology lu le 2026-11-26 (https://www.ncei.noaa.gov/pub/data/paleo/aar/readme-ncei-wds-paleoclimatology.txt) :
  « Users may access and download these data free of charge; please cite the original references provided in the data documentation
  for each data set. » ; fiche ISO de l'étude : « Cite as: Cook, E.R. (2015-11-06): NOAA/WDS Paleoclimatology - Old World Drought
  Atlas… https://doi.org/10.25921/rjm6-mq74 », contraintes d'accès « None ». Citation affichée sous chaque ligne.
- **Construit** : `te-secheresses.json.gz` (458 Ko : 436 carreaux de 0,5° France-Belgique-Luxembourg-Suisse, années 1000 à 2012,
  scPDSI ×10). Années avant 1000 laissées de côté (taille ; rien de généalogique).
- **Où** : fiche (l'été le plus sec et le plus humide de sa vie, avec l'âge ; petite bande des étés), village (les étés les plus
  secs et les plus humides depuis 1500), monographie, à la demande.

### 4. Les hivers terribles — **construit, avec une autre série que celle demandée**
- **Existait** : en partie — `tq-climat` (« Terre et quotidien ») compare l'**année** de naissance à son siècle, par pays. Rien
  par saison ni au carreau : ajouté ici, pas refait.
- **van Engelen et al.** (indice des hivers des Pays-Bas, 800-1998) : **introuvable sur le dépôt NOAA/NCEI** (recherche de l'API
  paleo-search et du dossier `historical/europe/`, le 2026-11-26). Pas pris.
- **Source retenue** : Luterbacher et al. 2004 (Science 303, 1499-1503), « European Seasonal Temperature Reconstructions »,
  NOAA/NCEI, https://www.ncei.noaa.gov/pub/data/paleo/historical/europe-seasonal.txt — mêmes conditions NCEI (citées au n° 3).
  Hivers (déc.-févr.) et étés (juin-août) au carreau de 0,5°, 1500-2002 (les fichiers par année s'arrêtent en 2002).
- **Construit** : `te-hivers.json.gz` (373 Ko, 516 carreaux, écart à 1901-2000 en dixièmes de degré).
- **Où** : fiche (« L'hiver 1829-1830 (à 10 ans) fut le plus froid de sa vie à Paris : −4,9 °C… l'un des trois plus froids du
  XIXe siècle »), village (les 5 hivers les plus froids et étés les plus chauds depuis 1500), monographie, à la demande.

### 5. Fossiles trouvés près du village — **code prêt, données à fabriquer sur GitHub**
- **Existait** : non (on peut noter un fossile comme « découverte » à la main, `heritage-sciences.js`).
- **Licence** : la PBDB publie ses données sous CC BY 4.0, mais **paleobiodb.org est refusé par le réseau de l'atelier** : la page
  n'a pas pu être lue ici. Le script `build_fossiles.py` **lit la licence au moment de fabriquer** (réponse `datainfo` de l'API et
  page https://paleobiodb.org/data1.2/) et s'arrête s'il n'y trouve pas une licence CC BY sans « NC » ; la phrase lue est gardée
  dans le fichier (`quote`) et montrée dans Réglages.
- **À faire** : Actions → « Ciel, climat et mémoire (lot E) » → `quoi = fossiles`. En attendant, la partie se tait (Réglages dit
  « Pas encore fabriqué »).
- **Où** (ensuite) : village (gisements à moins de 10 km, groupes : ammonites, oursins…, âge), monographie, Listes, Cartes.

### 6. Vieux puits et forages (BRGM, BSS) — **lien seulement**
- **Existait** : un lien vers la carte géologique InfoTerre (« Terre et mots »).
- **Constaté le 2026-11-26** : la page d'accueil d'InfoTerre marque « Base de données BSS départementale au format tableur » comme
  **non disponible** ; le service WFS `geoservices.brgm.fr` répond « Request Rejected » aux programmes (pas contourné) ; le jeu
  data.gouv.fr du BRGM (« BSS - Ouvrages de la Banque du Sous-Sol ») n'a **ni fichier ni licence** (« notspecified ») ; un export
  de 2019 sous Licence Ouverte existe mais déposé par un particulier, sur un miroir injoignable — pas retenu.
- **Fait** : sur la fiche d'un village et dans la monographie, une ligne « 🕳 » avec le lien vers la carte InfoTerre ; « Où chercher ».

### 7. Inscriptions romaines de la commune — **construit**
- **Existait** : non (l'aide à la lecture latine existe : `aide-langues/la.js`, renvoyée dans le texte d'aide).
- **Licence** : Epigraphic Database Heidelberg, fichiers EpiDoc, Zenodo https://doi.org/10.5281/zenodo.3575155 — notice lue le
  2026-11-26 : « These files can be reused under the CC BY-SA 4.0 licence. » ; chaque fichier XML porte
  `<licence target="http://creativecommons.org/licenses/by-sa/4.0/">`. README du miroir GitHub de l'EDH (lu) : « All data can be
  reused under the CC BY_SA 4.0 licence. » Le script vérifie les deux.
- **Construit** : `te-inscriptions.json.gz` (184 Ko : 3 400 inscriptions de France, Suisse, Belgique — n° HD, lieu moderne et
  antique, province, sorte traduite, datation, texte de l'EDH). Position : GeoNames de la fiche → Wikidata (P1566, CC0) ; sinon le
  nom de la commune s'il est unique (fichier des communes de l'app) → « position approchée ». 967 inscriptions sans position
  laissées de côté. Dump Zenodo de 2019 (le plus récent avec une adresse stable).
- **Où** : village (« 80 inscriptions romaines trouvées à Nîmes : … »), monographie, Listes, Cartes, à la demande.

### 8. Arbres de la Liberté — **construit en partie ; OpenStreetMap à fabriquer sur GitHub**
- **Existait** : non.
- **Licences** : Wikidata CC0 (https://www.wikidata.org/wiki/Wikidata:Licensing : « All structured data … is released into the
  public domain under Creative Commons Zero ») ; OpenStreetMap ODbL 1.0 (https://www.openstreetmap.org/copyright, page injoignable
  depuis l'atelier ce jour-là ; licence connue et déjà citée au lot B), attribution affichée.
- **Construit** : `te-libertes.json.gz` — Wikidata n'en connaît que **2** en France (Bayeux, Sainte-Marie-aux-Mines), sans année.
  Overpass refusé par le réseau de l'atelier : `build_libertes.py --osm` les cherche sur GitHub (nom « Arbre de la Liberté »,
  année tirée de `start_date` ou du nom). Sans `--osm`, le script garde les arbres OSM déjà fabriqués.
- **Où** : fiche (« En 1848, à 18 ans, on planta un arbre de la Liberté près de chez lui… », dès qu'une année est connue), village,
  monographie, Listes, Cartes.

### 9. Camisards, dragonnades, guerres de Religion — **construit**
- **Existait** : la frise de `app-chronologie.js` (dates nationales : guerres de Religion, Saint-Barthélemy, édit de Nantes). Rien
  par lieu : ajouté, pas refait.
- **Licence** : Wikidata CC0 (ci-dessus).
- **Construit** : `te-religion.json.gz` (64 événements avec un lieu : batailles, sièges, massacres, de 1562 à 1703 ; 3 de la guerre
  des Camisards). **Dragonnades : aucun événement localisé dans Wikidata** — dit ici, rien d'inventé. Des lieux et des dates, aucun nom.
- **Où** : fiche (événements à moins de 40 km de ses lieux de son vivant, avant 1715), village (30 km), monographie, Listes, Cartes.

### 10. Insurgés de juin 1848 et poursuivis de 1851 (J.-C. Farcy) — **lien seulement**
- **Existait** : non.
- **Sites** (adresses vérifiées par une recherche le 2026-11-26 ; les sites eux-mêmes sont refusés par le réseau de l'atelier) :
  https://inculpes-juin-1848.fr/index.php (11 662 personnes jugées) et https://poursuivis-decembre-1851.fr/index.php (26 848
  personnes), hébergés par le LIR3S (Université Bourgogne Europe, https://lir3s.ube.fr/bases-de-donnees/). Aucune licence ouverte
  trouvée → rien de copié, pas de recherche automatique.
- **Fait** : sur la fiche d'une personne **décédée**, adulte (15-80 ans) en 1848 (et un lieu à moins de 25 km de Paris) ou en 1851
  (en France) : une ligne « Une piste… » et « 📋 Chercher ce nom » (copie le nom sur l'ordinateur, ouvre le site). Rien pour une
  fiche vivante ou confidentielle, ni en consultation. Aussi dans « Où chercher » (adresse fixe, jamais le nom).

## Sécurité (relue)
- Chaque texte venu d'un fichier est échappé ; chaque adresse passe par `safeUrl` (seulement `http(s)://`, sans guillemets ni
  chevrons) ; les adresses Wikidata/OSM/PBDB/EDH sont refaites à partir d'un identifiant vérifié (`Q\d+`, `[nwr]\d+`, nombre, `HD\d+`).
- Pas de code serveur, donc pas de requête sortante depuis l'app. Les scripts de fabrication n'appellent que des adresses fixes ;
  `build_inscriptions.py` refuse une adresse de fichier qui ne serait pas celle du dépôt Zenodo.

## Ce qui reste à faire
- Lancer une fois Actions → « Ciel, climat et mémoire (lot E) » avec `quoi = tout` (ou `fossiles` puis `libertes`) : il fabrique
  `te-fossiles` (PBDB) et ajoute les arbres de la Liberté d'OpenStreetMap, puis refait `assets/data/manifest.json`.
- Hôtes refusés par le réseau de l'atelier pendant le travail : dataservices.gfz-potsdam.de, api.datacite.org, b2find.eudat.eu,
  paleobiodb.org, edh.ub.uni-heidelberg.de, www.imo.net, overpass-api.de, www.openstreetmap.org, inculpes-juin-1848.fr,
  poursuivis-decembre-1851.fr, data.cquest.org ; geoservices.brgm.fr répond « Request Rejected ».
