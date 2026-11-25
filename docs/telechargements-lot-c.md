# Téléchargements — lot C : leur commune dans les livres d’époque, et la vie en chiffres

Code : `assets/js/heritage-telech-c.js`, `assets/css/telech-c.css`, traductions `assets/i18n/src/telech-c.tsv`.
Données : `assets/data/tc-sgf-deces.json.gz` (15 Ko, refait par `scripts/telech-c/build_sgf_deces.py`) ; pack `assets/data/tc-joanne/<département>.json.gz`
(fabriqué sur GitHub par `.github/workflows/telech-c-joanne.yml` → `scripts/telech-c/build_joanne.py`). Les deux paraissent dans
Réglages → 🗂 Données (sommaire `assets/data/manifest.json`, `scripts/donnees-manifest.js`, préfixe `tc-` → `scripts/telech-c`).
Essai : `node tests/test-telech-c.js`.

Où cela se voit :
- fiche d’une personne : bloc « 📊 Sa vie en chiffres » (⚰️ choléra, 🧮 survie HMD, 👶 fécondité HFD) — caché quand il n’y a rien ;
- fiche d’un village et Monographie de commune : « 📚 La commune dans les livres d’époque », « ⚰️ Les années de choléra dans le département » ;
- Listes : « Décès par département et par année (an IX – 1855) », colonne Source ;
- à la demande (`LCNDA_EXT.dataSources`) : `tc_p_cholera`, `tc_p_survie`, `tc_p_fecondite`, `tc_livres`, `tc_cholera_lieu`, `tc_liens` ;
- Réglages → « 📊 La vie en chiffres » : chaque sujet s’éteint (↶), ouverture des tables HMD / HFD, tableau « À propos » des 15 idées.

Rien de personnel ne part sur Internet : le module ne fait aucune requête externe ; les liens ne contiennent que le nom de la commune ou du département
et ne s’ouvrent qu’au clic ; les tables HMD / HFD sont lues sur l’ordinateur et gardées dans le navigateur.

Licences lues le 2026-11-25. Depuis l’atelier, mortality.org, humanfertility.org, menus.nypl.org et gallica.bnf.fr n’étaient pas joignables :
pour HMD et HFD les citations viennent de leurs pages officielles telles que les montre le moteur de recherche (à relire quand ces sites
seront autorisés) ; pour la NYPL aucune licence officielle n’a pu être lue → lien seulement.

## 28. Joanne, Dictionnaire géographique et administratif de la France
- **Déjà dans l’app ?** Non.
- **Licence.** Adolphe Joanne est mort en 1881, Paul Joanne en 1922 : textes dans le domaine public. Édition de 1869 sur Internet Archive
  (https://archive.org/details/dictionnairego00joanuoft, scan de l’Université de Toronto), métadonnée « possible-copyright-status: NOT_IN_COPYRIGHT ».
  Édition 1890-1905 (7 vol.) : Gallica — « réutilisation non commerciale » avec la mention « Source gallica.bnf.fr / BnF » → **lien seulement**.
  Pas de transcription Wikisource trouvée.
- **Fait.** Lien par commune « chercher dans le livre » (recherche dans le texte d’Internet Archive). Pack `tc-joanne` : l’article OCR de chaque
  commune avec le lien vers sa page, fabriqué sur GitHub (les serveurs de fichiers d’Internet Archive sont refusés depuis l’atelier). Le
  script ne garde un article que s’il commence par « Nom, », nomme un département de 1869 et donne une population ; il s’arrête sans rien écrire
  sous 8 000 articles ou si les communes témoins manquent. **À vérifier au premier passage du workflow** (format du texte OCR non vu ici).
- **Où.** Village, monographie, à la demande.

## 29. Statistiques des départements des préfets (an IX – an XIII)
- **Déjà ?** Non.
- **Licence.** Domaine public ; scans Internet Archive (« Public Domain Mark ») et Gallica → liens.
- **Fait.** Lien par département (Internet Archive et Gallica). Les chiffres de ces années-là sont livrés : les décès par département de l’an IX
  à l’an XIV viennent du tableau SGF T90 (voir 39).
- **Où.** Village, monographie.

## 30. Guides Joanne / Baedeker
- **Déjà ?** Non.
- **Licence.** Livres du domaine public sur Internet Archive (ex. Baedeker, *Le Midi de la France*, 1886 ; Joanne, *Itinéraire général de la France : le Nord*, 1869, « Public Domain Mark »).
- **Fait.** Lien « ce qu’en disait le voyageur » : recherche du nom de la commune dans le texte des guides Joanne et Baedeker. Lien seulement.
- **Où.** Village, monographie ; liste Baedeker dans « liens d’époque ».

## 31. Indicateur Chaix
- **Déjà ?** Oui en partie : le temps de voyage entre ses lieux (marche, diligence, train selon les gares ouvertes, Wikidata) est déjà calculé
  dans `heritage-histoire.js` (« 🧭 Le voyage entre ses lieux »).
- **Licence.** *Livret Chaix continental* 1869 sur Internet Archive ; Livrets Chaix sur Gallica → liens.
- **Fait.** Liens seulement (pas de re-calcul : l’estimation existante suffit).

## 32. Catalogues Manufrance / grands magasins (prix 1900-1914)
- **Déjà ?** Prix sourcés : `prix-reference.json` (Une journée dans la vie de…), `prix-europe.json` (Allen), 🪙 Convertisseur d’autrefois.
- **Licence.** Aucune transcription ouverte des tarifs-albums trouvée ; scans sur Gallica (non commercial) → lien.
- **Fait.** Lien seulement (« Menus, catalogues, horaires de trains d’époque »).

## 33. Tarifs postaux historiques
- **Déjà ?** **Oui** : « ✉️ Le prix d’un timbre » (`assets/data/tq-timbre.json`, Wikipédia « Évolution du prix du timbre en France », CC BY-SA 4.0,
  une phrase-preuve et un lien par période), dans « 🧺 Vie de tous les jours ». Rien ajouté.

## 34. Menus historiques NYPL « What’s on the menu? »
- **Déjà ?** Non.
- **Licence.** menus.nypl.org injoignable depuis l’atelier ; la recherche n’a trouvé aucune déclaration officielle CC0 ou domaine public pour les
  données (seulement des pages tierces). Non vérifiable → **lien seulement**.
- **Où.** « Menus, catalogues, horaires de trains d’époque (liens) » (à la demande).

## 35. Livres de cuisine Belle Époque
- **Déjà ?** **Oui** : `assets/data/l9a-recettes.json.gz` (Wikisource et Internet Archive, auteurs morts depuis plus de 70 ans, avec une liste de
  livres écartés par prudence). Rien ajouté.

## 36. Human Mortality Database
- **Déjà ?** Espérance de vie Insee depuis 1994 (`tq-esperance.json`) ; mortalité des enfants par département (FHMD, frdata.org) ; espérance de vie
  à la naissance par pays (Clio-Infra).
- **Licence.** Page officielle https://www.mortality.org/Data/UserAgreement : « The HMD data are licensed under a Creative Commons Attribution 4.0
  International License » ; mais « before gaining full access to the database, you must become a registered user, which requires accepting our
  user agreement ». Libre, mais derrière un compte → on ne télécharge pas à la place de la personne.
- **Fait.** Réglages → 📊 : « Ouvrir un fichier HMD ou HFD » (table 1x1 du moment ou par génération, femmes / hommes / ensemble), lue sur
  l’ordinateur. Sur la fiche : « Sur 100 enfants nés en 1850 (France), 80 atteignaient 1 an, … ; il a vécu 60 ans : 36 sur 100 de sa génération
  sont allés aussi loin. » (la table par génération d’abord). Source et licence sous la phrase.

## 37. Human Fertility Database
- **Déjà ?** Moyennes françaises par époque (`moyennes-france.json`).
- **Licence.** https://www.humanfertility.org/Data/UserAgreement : « The HFD data is licensed under a Creative Commons Attribution 4.0
  International License » ; inscription obligatoire (« before gaining full access to the database, you must become a registered user »).
- **Fait.** Même ouverture de fichier (TFR, MAB, CCF ; fichier d’un pays ou de tous). Sur la fiche : l’indicateur de fécondité de l’année de son
  mariage (sinon de sa naissance).

## 38. Taille moyenne des conscrits par département
- **Déjà ?** Taille moyenne des hommes par pays et décennie de naissance (Clio-Infra, CC0) dans `monde-chiffres.json`.
- **Licence.** Aucun jeu de données ouvert par département trouvé (les travaux d’anthropométrie historique publient des résultats, pas les
  données ; tableaux SGF « Territoire et population » vérifiés : pas de taille). **Rien de plus.**

## 39. Choléra 1832 / 1849 / 1854
- **Déjà ?** Les épidémies (dates, régions) dans les événements de « 🌍 Le monde autour » (`monde-autour.json`).
- **Licence.** Insee, « Données historiques de la Statistique générale de France (SGF) 1800-1925 », Mouvement de la population
  (https://www.insee.fr/fr/statistiques/2659665?sommaire=2591397). Mentions légales (https://www.insee.fr/fr/information/2008466) : « Sauf mention
  contraire, les informations publiques diffusées sur ce site sont mises à disposition sous la Licence Ouverte / Open Licence version 2.0
  (Etalab). Cette licence autorise la réutilisation libre, y compris à des fins commerciales, sous réserve de mentionner la source sous la forme
  « Source : Insee » ».
- **Fait.** `tc-sgf-deces.json.gz` : nombre total de décès de chaque département, an IX (1800-1801) → 1850, 1853, 1854, 1855 (tableaux T90,
  T170, T74, T100, T92 ; chaque colonne lue est notée). Pour 1832, 1849, 1854 : décès de l’année comparés à la moyenne des années voisines
  (jusqu’à 3 de chaque côté, sans les autres années de choléra), par ex. Seine 1832 : +74 %, Aisne 1832 : +55 %. Les tableaux ne donnent
  pas la cause : c’est dit sous la phrase. Pas de données ouvertes par commune trouvées.
- **Où.** Fiche (avec son âge cette année-là), village, monographie, Listes.

## 40. Répartition des noms de famille 1891-1990
- **Déjà ?** **Oui** : lien « 🔤 Le même nom de 1891 à 1990 (Géopatronyme) » (`heritage-sources-ouvertes-4.js`, utilisé par « 🌍 Terre et gens »).
- **Licence.** Le fichier Insee des patronymes n’est pas diffusé en données ouvertes (Géopatronyme en est une exploitation commerciale) → le lien
  existant suffit.

## 41. Salaires et prix, Statistique générale de la France
- **Déjà ?** Prix et salaires sourcés (`prix-reference.json`, SMIC Insee), prix européens (Allen).
- **Licence.** Les tableaux SGF publiés par l’Insee couvrent recensements, mouvement de la population, enseignement, territoire : pas de série
  ouverte de salaires et prix trouvée. **Rien de plus.**

## 42. Convertisseur franc → euro Insee
- **Déjà ?** **Oui** : 🪙 Convertisseur d’autrefois (`app-autrefois-engine.js`), source citée « INSEE, convertisseur franc-euro « Pouvoir
  d’achat de l’euro et du franc » » avec le lien https://www.insee.fr/fr/information/2417794, repris par « Montants et mesures »
  (`app-montants-core.js`). Rien ajouté.
