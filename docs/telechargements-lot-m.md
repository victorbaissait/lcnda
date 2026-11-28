# Téléchargements — lot M (« 🏆 Sport et Expositions »)

Lu et vérifié le 26 novembre 2026. Pour chaque idée : ce qui existait déjà, la licence (citée, avec l'adresse), ce qui est construit
ou seulement en lien, et où l'utilisateur le voit. Maquettes validées suivies : `docs/design/sport-tour-de-france.html` (avec ses
Décisions) et `docs/design/listes-categories.html` (thèmes `sport` et `fetes`, listes réunies).

## Fichiers

| Rôle | Fichier |
|---|---|
| Écran (fiche, village, monographie, listes, cartes, à la demande, Réglages) | `assets/js/heritage-telech-m.js` |
| Style | `assets/css/telech-m.css` (classes `tsx-…` : le préfixe `tm-` est déjà pris par « Terre et mots ») |
| Fabrication des données | `scripts/telech-m/build_{competitions,matchs,athletes,expos}.py` (+ `wm.py`) |
| Atelier GitHub | `.github/workflows/telech-m.yml` (`quoi` = tout, competitions, matchs, athletes, expos ; astuce du « push », `if: github.event_name != 'push'`, cache dans `$RUNNER_TEMP` par `$GITHUB_ENV`) |
| Données livrées | `assets/data/ts-{competitions,etapes,matchs,jo,athletes}.json.gz`, `assets/data/tx-expos.json.gz` |
| Textes traduits | `assets/i18n/src/telech-m.tsv` (fr en es de it pt pl nl) |
| Essai | `tests/test-telech-m.js` |

Petites lignes ajoutées dans des fichiers partagés : `index.php` (2 balises ; `heritage-lot8-monde-village.js?v=`, `heritage-tout-sur.js?v=`,
`designs-gen.css?v=` relevés), `assets/js/heritage-tout-sur.js` (`[/^tsxp_/, 'telech_m']`), `scripts/donnees-manifest.js`
(`[/^ts-|^tx-/, 'scripts/telech-m']`), `assets/data/manifest.json` et `assets/css/designs-gen.css` (refaits par leur script).
`assets/js/heritage-lot8-monde-village.js` (« 🎡 Le monde de son village ») est **prolongé**, pas dupliqué : voir « Le Tour de France ».
Le moteur des thèmes et des listes réunies (`app-listes-donnees.js`, `app-listes-reunies.js`) n'est pas touché : les listes disent
seulement `theme` et `merge`.
Réglages → « 🏆 Sport et Expositions » (clé `genealogie-telech-m`) : chaque sujet s'éteint (↶ Annuler), le rayon « près de chez lui »
(15 km par défaut, ↶), les vainqueurs (montrés ou non, ↶), la vue d'ouverture du Tour (éditions, étapes ou carte, ↶), « À propos des
données » (source, lignes, licence, date ; tableau des 28 compétitions ; ce qui n'est qu'en lien et pourquoi).
Les packs apparaissent dans Réglages → 🗂 Données (lu dans le manifeste).

## Ce qui part sur Internet

**Rien.** Les fichiers sont dans l'app ; aucun nom, aucun lieu n'est envoyé. Tous les rapprochements (ce jour-là, les Jeux de sa vie,
le sport près de chez lui, les sportifs de son village, l'homonyme) sont calculés dans la page, **seulement pour une personne décédée
(ou née il y a plus de 110 ans) et non confidentielle** ; rien pour une fiche vivante. La comparaison des noms (« un homonyme
champion ? ») n'est jamais faite pour une fiche vivante ou confidentielle, ni en consultation (kiosque) ni pour un invité du réseau
local (`LCNDA_GUEST`). Les listes de personnes (médaillés, sportifs) déclarent `personMatch.historic` : le moteur commun ne les compare
jamais à une fiche vivante. Seuls les liens « ↗ » ouvrent une page, sur un clic. L'essai coupe et compte toute requête qui sortirait.

## Licences lues (le 2026-11-26)

- **Wikidata** — <https://www.wikidata.org/wiki/Wikidata:Copyright> (lu par `action=raw`) : « All structured data from the main,
  Property, Lexeme, and EntitySchema namespaces is available under the Creative Commons CC0 License ». → CC0, données copiées.
  Service de requêtes : un appel à la fois, pause entre deux appels, `Retry-After` respecté, réponse coupée jamais gardée
  (`wm.py`, `check=json.loads`), grosses requêtes découpées (sportifs : 5 tranches).
- **Wikipédia en anglais** — <https://en.wikipedia.org/wiki/Wikipedia:Copyrights> (lu par `action=raw`) : « Permission is granted to
  copy, distribute and/or modify Wikipedia's text under the terms of the Creative Commons Attribution-ShareAlike 4.0 International
  License ». → seulement l'**année et le nom du vainqueur** des listes nommées ci-dessous, avec « les contributeurs de Wikipédia » et
  le lien de chaque liste (Réglages → À propos des données).
- **Wikipédia en français** — <https://fr.wikipedia.org/wiki/Wikip%C3%A9dia:Citation_et_r%C3%A9utilisation_du_contenu_de_Wikip%C3%A9dia> :
  le texte est sous CC BY-SA 4.0. → la liste des onze Expositions des produits de l'industrie (une ligne chacune, recopiée), et la
  phrase de l'article d'une exposition coloniale qui parle de ses « villages » (5 phrases), avec le lien et « les contributeurs de
  Wikipédia ».
- **martj42/international_results** (Mart Jürisoo) — fichier `LICENSE` lu sur
  <https://raw.githubusercontent.com/martj42/international_results/master/LICENSE> : « CC0 1.0 Universal ». → les 50 093 matchs copiés ;
  le script relit ce fichier à chaque fabrication et **s'arrête** s'il n'est plus CC0.
- **openfootball** — `LICENSE.md` de <https://github.com/openfootball/worldcup>, `worldcup.json`, `football.json` : « CC0 1.0 Universal » ;
  README de football.json : « dedicated to the public domain ». **Lu, pas utilisé** : les matchs de Coupe du monde sont déjà tous dans
  martj42 (CC0) ; les championnats de clubs de football.json ne commencent qu'en 2010-2011 et leurs équipes ne disent pas leur ville
  (pas de « près de chez lui » possible sans recopier autre chose) — à reprendre si on le veut.
- **Jeff Sackmann, tennis_atp / tennis_wta** (<https://github.com/JeffSackmann/tennis_atp>) — annoncé CC BY-NC-SA 4.0 (pas d'usage
  commercial) ; les fichiers README / LICENSE n'ont **pas pu être relus d'ici** (404 sur raw.githubusercontent.com, API sans licence).
  Pas ouvert → **lien seulement**.
- **jolpica-f1 (suite d'Ergast)** — <https://github.com/jolpica/jolpica-f1/blob/main/TERMS.md> (« Last updated: August 27, 2025 ») :
  « The data is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International (CC BY-NC-SA 4.0) » ;
  l'API (api.jolpi.ca) est refusée par le réseau de l'atelier. Pas ouvert → **lien seulement**.
- **BoxRec** (champions du monde de boxe) — boxrec.com refusé par le réseau de l'atelier ; base privée → **lien seulement**. Wikidata
  n'a pas de liste fiable des champions du monde de boxe par fédération : **rien construit**.
- **Internet Archive** — on ne copie rien : l'API `advancedsearch` donne l'identifiant, le titre, l'année (et la licence affichée
  quand il y en a) des catalogues d'exposants ; chaque volume s'ouvre sur un clic, et l'utilisateur y cherche lui-même un nom.
- Sources citées pour les « zoos humains » (liens, rien copié) : Nicolas Bancel, Pascal Blanchard et Sandrine Lemaire, « Ces zoos
  humains de la République coloniale », *Le Monde diplomatique*, août 2000, p. 16-17
  (<https://www.monde-diplomatique.fr/2000/08/BANCEL/1944>) ; exposition « Exhibitions. L'invention du sauvage », musée du quai Branly,
  29 novembre 2011 – 3 juin 2012 ; article « Zoo humain » de Wikipédia (<https://fr.wikipedia.org/wiki/Zoo_humain>).
- Déjà dans l'app et réutilisé : `l8c-tour` (étapes du Tour, Wikidata CC0), `l8c-expos` (22 Expositions choisies à la main, phrases de
  Wikipédia CC BY-SA), `cc-communes` (communes, Licence Ouverte 2.0).

## A. « 🏆 Compétitions sportives » (thème `sport`)

### Les éditions et leurs vainqueurs — `ts-competitions` (2 404 éditions, 28 compétitions)

Wikidata : éditions = `P3450` (saison de la compétition) ou `P31` ; dates `P585`/`P580`/`P582` ; lieu `P276` (position `P625`, INSEE
`P374`) ; vainqueur `P1346`, le **vainqueur du classement général** quand le qualificatif `P2501` le dit (Q20882667), sinon les vainqueurs
sans qualificatif ; « non attribué » (Q66666778) → **« titre retiré »** (Tour 1999-2005). Une année = une ligne (sans les éliminatoires ;
les Jeux annulés de 1916, 1940 et 1944 enlevés). **Un pays ou une région n'est pas un lieu** : pas de position pour Tour, Giro, Vuelta,
Six Nations, championnats de France, Coupe de France, Ligue des champions, Dakar (sinon « près de chez lui » au centre du pays).

| Compétition | Wikidata | Éditions | Années | Avec vainqueur | Vainqueurs pris ailleurs |
|---|---|---|---|---|---|
| 🚲 Tour de France | Q33881 | 113 | 1903–2026 | 113 (1999-2005 : titre retiré) | |
| 🚴 Tour d'Italie | Q33861 | 109 | 1909–2026 | 109 | |
| 🚴 Tour d'Espagne | Q33937 | 81 | 1935–2026 | 81 | |
| 🚴 Paris-Roubaix | Q33992 | 124 | 1896–2026 | 124 | |
| 🚴 Milan-San Remo | Q33951 | 117 | 1907–2026 | 117 | |
| 🌈 Championnats du monde sur route | Q506424 | 99 | 1921–2026 | 94 | Wikipédia (en), « UCI Road World Championships – Men's road race » |
| 🏅 Jeux olympiques d'été | Q159821 | 30 | 1896–2024 | ville hôte | médailles : `ts-jo` |
| ⛷ Jeux olympiques d'hiver | Q82414 | 25 | 1924–2026 | ville hôte | médailles : `ts-jo` |
| ⚽ Coupe du monde | Q19317 | 25 | 1930–2026 | 23 | finale (score, ville, date) : martj42 |
| ⚽ Championnat d'Europe | Q260858 | 17 | 1960–2024 | 17 | finale : martj42 |
| ⚽ Championnat de France de football | Q13394 | 95 | 1932–2026 | 87 | |
| ⚽ Coupe de France | Q212412 | 109 | 1917–2026 | 107 | |
| ⚽ Coupe des clubs champions / Ligue des champions | Q18756 | 72 | 1955–2026 | 71 | |
| 🏉 Tournoi des Cinq / Six Nations | Q16642 | 131 | 1882–2026 | 125 | |
| 🏉 Championnat de France de rugby | Q5798 | 127 | 1892–2026 | 124 | |
| 🎾 Roland-Garros (simple messieurs et dames) | Q43605 | 130 | 1891–2026 | 130 | Wikipédia (en), listes des champions |
| 🎾 Wimbledon | Q41520 | 139 | 1877–2026 | 139 | idem |
| 🎾 US Open | Q123577 | 146 | 1881–2026 | 146 | idem |
| 🎾 Open d'Australie | Q60874 | 113 | 1905–2026 | 113 | idem |
| 🏁 24 Heures du Mans (pilotes) | Q187579 | 95 | 1923–2026 | 94 | Wikipédia (en), « List of 24 Hours of Le Mans winners » |
| 🚗 Rallye Monte-Carlo | Q725531 | 94 | 1911–2026 | 55 | |
| 🏜 Rallye Dakar | Q181336 | 46 | 1979–2026 | 40 | |
| ⛵ Vendée Globe | Q1137923 | 10 | 1989–2024 | 6 | |
| ⛵ Route du Rhum | Q833088 | 12 | 1978–2022 | 12 | Wikipédia (en), « Route du Rhum » |
| 🐎 Prix de l'Arc de Triomphe | Q422296 | 105 | 1920–2026 | 105 | Wikipédia (en) avant 1971 (Wikidata commence en 1971) |
| 🏃 Marathon de Paris | Q1071285 | 55 | 1896–2026 | 54 | Wikipédia (en), « Paris Marathon » |
| 🏃 Marathon de New York | Q752138 | 57 | 1970–2026 | 56 | Wikipédia (en), « List of winners of the New York City Marathon » |
| 🏃 Marathon de Boston | Q826087 | 128 | 1897–2026 | 128 | Wikipédia (en), « List of winners of the Boston Marathon » |

Les vainqueurs pris dans Wikipédia sont reliés à leur élément Wikidata par le titre de leur article (3 154 vainqueurs sur 3 259 ont un
identifiant Wikidata). Les tennis « non reconnus » (1941-1945) sont marqués.

### 🚲 Le Tour de France — **prolongé, pas dupliqué** (maquette validée)

- **Existait** : `l8c-tour` (2 446 étapes 1903-2027, départ et arrivée), listes `l8c_tour` / `l8c_tour_annee`, bloc « Le Tour de France
  est passé ici » (3 km). Les étapes **ne sont pas recopiées** : tout est lu dans `l8c-tour`.
- **Ajouté** : `ts-etapes` = 2 425 vainqueurs d'étape (`P1346` des étapes, qualificatif « vainqueur d'étape » Q20882747) et le maillot
  jaune au soir de l'étape (Q20882763), par identifiant d'étape ; le maillot jaune de chaque édition dans `ts-competitions`.
- **Compter comme on le dit** : « 22 étapes + prologue » (1976 : 27 tronçons ; les demi-étapes 5a/5b, 18a/18b/18c, 22a/22b comptent
  pour une) — dans « cette année-là », la vue Éditions et la liste `l8c_tour` (colonne Étape : `prologue`, `5a`…).
- **Rayon** : 15 km par défaut (Décisions de la maquette), réglable dans Réglages → 🏆 (`genealogie-telech-m.km`), lu aussi par
  `heritage-lot8-monde-village.js`. Les phrases disent « Le Tour de France est arrivé à Tulle, à 7 km de Gimel », « parti ou arrivé à
  moins de 15 km d'ici N fois », et la note « Départ ou arrivée seulement : le fichier ne connaît pas les villages traversés » —
  **jamais « passé devant chez lui »** (l'essai le vérifie).
- Fiche du village : « Maillot jaune en 1996 : … » ; bouton « 🏆 Tout le Tour de France dans 🏆 Sport ». Fiche d'une personne
  décédée : « L'année de sa naissance (1912), Odile Defraye gagnait le Tour de France. »
- Liste `ts_tour` (thème `sport`) : vues **Éditions** (par défaut, réglable) · **Étapes** · 🗺 Carte ; une édition ouvre ses étapes
  (`sub`, « ☑ Toutes ses étapes ») ; colonne « 👪 Dans la famille » (`familyColumn` ; son rayon est celui de Réglages → 🧰 Listes de données, 15 km au départ).

### ⚽ Les matchs — `ts-matchs` (50 093 matchs, 30 novembre 1872 → 17 novembre 2026)

martj42 (CC0) : tous les matchs internationaux masculins d'équipes A (date, score, tirs au but, tournoi, ville, pays). Noms des
équipes et des tournois les plus courants en français. **901 matchs joués en France** placés sur leur commune (nom unique dans
`cc-communes`, ou la grande ville choisie à la main : Colombes, Saint-Denis, Lyon…) : ce sont eux qui servent à « près de chez lui ».

### 🏅 Médailles olympiques — `ts-jo` (919 médailles de 652 sportifs français, 1896 → 2026)

Wikidata : `P1344` (participant à une épreuve) avec le qualificatif `P166` = or / argent / bronze, pour les personnes de nationalité
française (`P27`). Wikidata n'a pas toutes les médailles (la France en compte davantage) : l'app le dit par sa source.

### 🏃 Sportifs nés en France — `ts-athletes` (10 358 sportifs, 1 794 communes)

Wikidata : personnes (`Q5`) nées (`P19`) dans une commune avec un code INSEE, avec un sport (`P641`), connues d'au moins 5 projets
Wikimedia (`wikibase:sitelinks ≥ 5`, pour garder les sportifs dont on parle). Sport, années, article de Wikipédia.

### Les rapprochements avec l'arbre (sur l'ordinateur, personne décédée et non confidentielle seulement)

- **📅 Ce jour-là** : le jour exact de sa naissance, de son mariage, de sa mort (date complète) : l'étape du Tour, le match de la
  France (ou de Coupe du monde / Euro / JO), l'édition d'une compétition qui commence ou finit ce jour-là.
- **🏅 Les Jeux de sa vie** : les JO d'été et d'hiver de son vivant, avec son âge ; ceux qui étaient près de chez lui d'abord.
- **📍 Le sport près de chez lui** (rayon réglable) : les matchs internationaux et les compétitions à lieu fixe (Le Mans, Roubaix,
  Roland-Garros, l'Arc, Monaco, Les Sables, Saint-Malo…) de son vivant (dès 6 ans) ; le Tour reste dans « 🎡 Le monde de son village ».
- **🏃 Les sportifs de son village** : nés dans sa commune de naissance (code INSEE, sinon 2 km), contemporains d'abord ; médaillés.
- **🔎 Un homonyme champion ?** : même premier prénom et même nom (sans accents ni particule) qu'un sportif, un médaillé ou un
  vainqueur ; « même année de naissance » quand elle est à ± 3 ans. Jamais pour une fiche vivante, confidentielle, ni en consultation.

### Liens seulement

Tous les matchs de tennis ATP/WTA (Jeff Sackmann, CC BY-NC-SA), la Formule 1 (jolpica-f1 / Ergast, CC BY-NC-SA 4.0), les champions du
monde de boxe (BoxRec) : liens dans Réglages → 🏆 → « En lien seulement », avec la raison.

## B. « 🎪 Expositions du monde » (thème `fetes`) — `tx-expos` (184 expositions, 1798 → 2025)

- **Existait** : `l8c-expos` (22 expositions choisies à la main, avec la phrase de l'article pour les visiteurs et « ce qu'on y a vu »).
  **Gardé tel quel** : ses phrases restent, ses lignes ne sont pas recopiées ; dans `tx-expos` elles sont seulement marquées
  `hand` (19 retrouvées par leur identifiant Wikidata), et la liste `tx_expos` les montre avec « choisie à la main ».
- **Wikidata (CC0)** : 150 expositions universelles, internationales, spécialisées, horticoles, Floriades (instances d'une sous-classe de
  Q172754) ; 18 **expositions coloniales** (Q3062234 : Amsterdam 1883, Londres 1886, Lyon 1894, Berlin 1896, Hanoï 1902, Marseille 1906,
  Nogent 1907, Strasbourg 1924, Wembley 1924, La Rochelle 1927, Anvers 1930, Oran 1930, Porto 1934…) ; 5 expositions nationales ou
  régionales de France connues de Wikidata (Nancy 1909, Roubaix 1911, Grenoble 1925, l’Exposition internationale du textile de 1951…). Paris 1931 et Marseille 1922 sont dans
  `l8c-expos`.
- **Wikipédia (fr)** : les **11 Expositions des produits de l'industrie française** (1798, 1801, 1802, 1806, 1819, 1823, 1827, 1834,
  1839, 1844, 1849), la ligne de l'article recopiée (jours, lieu, exposants, récompenses) ; quand Wikipédia la marque « référence
  nécessaire », l'app écrit « Wikipédia demande une source pour ces chiffres ».
- **Les expositions coloniales, sans euphémisme** : pour chacune, l'app dit que beaucoup d'expositions coloniales montraient au public
  des hommes, des femmes et des enfants venus des colonies dans des « villages » reconstitués — les « zoos humains » —, cite l'article
  « Zoo humain » et ses sources (Le Monde diplomatique 2000, musée du quai Branly 2011-2012) ; quand l'article de l'exposition le dit,
  sa phrase est recopiée (Lyon 1894, Berlin 1896, Nogent 1907, Strasbourg 1924, Porto 1934) ; sinon l'app écrit « La source ne dit pas
  si ce fut le cas ici » (rien d'inventé).
- **Catalogues d'exposants (Internet Archive, liens seulement)** : pour les expositions de France jusqu'en 1937, jusqu'à 4 volumes
  trouvés par titre (11 expositions), plus « ↗ d'autres catalogues de {année} » ; sur la fiche d'un artisan, d'un fabricant, d'un
  négociant… : « il ou elle a peut-être exposé » et les catalogues des Expositions de ses années actives. L'app ne cherche pas le nom :
  elle ouvre le catalogue.

## Où l'utilisateur le voit

- Fiche d'une personne décédée : bloc « 🏆 Le sport et les Expositions de sa vie » ; et dans « 🎡 Le monde de son village » le Tour à
  15 km et le maillot jaune de sa naissance.
- Fiche d'un village et monographie : compétitions courues ici, matchs internationaux joués ici, sportifs nés ici, Expositions ici.
- Listes → 🏆 Sport : `ts_competitions` (rejoint la liste réunie « 🔀 Compétitions sportives », `merge: {into: 'competitions'}`, une
  pastille par compétition), `ts_tour` (Éditions · Étapes · Carte), `ts_matchs` (les matchs de la France en Coupe du monde et à l'Euro
  rejoignent aussi la liste réunie), `ts_jo`, `ts_athletes` ; `l8c_tour` et `l8c_clubs` y sont rangés (`theme: 'sport'`).
  Listes → 🎉 Fêtes, jeux et vie de tous les jours : `tx_expos` et `l8c_expos` (`theme: 'fetes'`). La liste réunie `competitions` est
  déclarée dans `LCNDA_EXT.dataListMerges` par ce module seulement si le moteur ne l'a pas déjà (`same: {by: 'key'}` : rien n'est
  fondu à tort).
- Cartes : lieux des éditions, matchs joués en France, communes de naissance des sportifs, Expositions.
- À la demande : ce jour-là, les Jeux, près de chez lui, le village et l'homonyme, les Expositions ; les vainqueurs d'une année ; les
  quatre parties « lieu ».

## Essais

- `node tests/test-telech-m.js` : 14 essais (fichiers, licences, manifeste ; Tour 1976 « 22 étapes + prologue », 27 tronçons, Van Impe,
  titre retiré 1999-2005 ; JO, Coupe du monde, Roland-Garros, Mans, Arc ; Expositions ; calcul ; fiches ; vivant et consultation sans
  rien d'envoyé ; village, listes, cartes, à la demande ; Réglages ↶ et rayon 15 → 3 → 15 km ; 390 px sombre ; aucune erreur).
- `node tests/test-lot8-monde-village.js` : inchangé, passe (le Tour à Tulle, les Expositions de 1900…).
