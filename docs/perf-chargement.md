# ⏱ Chargement de l'app : mesures et allègements (2026-11-26)

Mesure : `node scripts/mesure-chargement.js [--runs 2] [--root <copie de l'app d'avant>] [--no-nav] [--profile f.cpuprofile] [--profile-nav dossier] [--init instrumentation.js]`
— base d'exemple (`scripts/exemple-base.php`), `php -S` à 4 PHP comme `serve.sh`, Internet coupé (proxy inexistant ; pas `page.route`, qui
désactiverait le cache du navigateur), Chromium (Playwright), 1440 × 900. « Avant » = la même mesure sur `git archive dac0af5`.
Test de garde : `node tests/test-chargement-perf.js`.

⚠️ L'ordinateur de mesure était très chargé (charge moyenne 25 à 30 sur 4 cœurs, d'autres agents et tests tournaient) : les durées « au mur »
varient du simple au double d'un essai à l'autre. Les mesures avant / après ont été **alternées** (A, B, A, B) dans les mêmes conditions ;
les chiffres de travail (longues tâches, temps JavaScript, appels, octets, mémoire) sont plus fiables que les durées.

## Ce qu'on a trouvé

- **530 scripts (30,6 Mo) et 157 feuilles de style (3,8 Mo)** à chaque ouverture, **jamais gardés par le navigateur** : `php -S` ne
  donne ni `ETag` ni `Last-Modified`, donc chaque ouverture retéléchargeait 55 Mo (1 130 requêtes) et recompilait tout le JavaScript.
  (L'app de bureau empaquetée les gardait déjà : `electron/php-server.js`, `cacheAssets`.)
- L'évaluation des scripts eux-mêmes est raisonnable : ≈ 1 s de code « au premier niveau » pour les 530 fichiers.
- Le vrai poids venait **après** le premier écran : ≈ 20 à 35 s de longues tâches pendant les 30 à 60 s suivantes :
  - **160 MutationObserver**, dont ≈ 110 sur toute la page, chacun relisant toute la page (`querySelectorAll`) à chaque petite
    modification : **≈ 82 000 appels, 6 à 12 s** de processeur à l'ouverture (heritage-diagrams 1,5 s, `addLongSButtons` 1 s, monde-contexte,
    recueils, santé, journal…), et une cascade (un observateur qui décore réveille tous les autres) ;
  - le widget **🔎 « Ce qui le concerne »** du tableau de bord interrogeait toutes les données installées (éclipses, données téléchargées…)
    et **renotait toutes les suggestions à chaque réponse** (N², ≈ 2 s ; plus ≈ 2 s d'éclipses et 200 Mo de données lues) — même quand il
    est hors de l'écran ;
  - `linkMentions` (« @[Nom|id] ») relisait tous les textes de la page à chaque changement (0,8 s) ; poignées ⠿ (0,5 s) ;
    Designs (`needsWork` : toute la page à chaque image, 0,4 s) ; `toLocaleString('fr-FR')` à chaque `{n}` des textes (0,3 s) ;
  - en naviguant : la colonne des Listes et l'en-tête des pages (`orderedListTypes` pour chaque carte, `UI.pagePlace` toutes les 150 ms)
    — 2 à 10 s par fiche de village, Listes → Données, Réglages (une partie a été corrigée en parallèle par l'audit des listes).
- Les appels en ligne (CORINE `telech_a_clc`, ≈ 6,5 s, les sources en ligne de « Ce qui le concerne ») partaient même pour une partie de
  la fiche qu'on ne regarde pas, et tenaient un PHP sur 4.

## Ce qui a changé

| Changement | Fichier |
|---|---|
| Les observateurs **de toute la page** (document, `<html>`, `<body>` + subtree) : le 1er appel d'une image passe tout de suite, les suivants de la même image sont regroupés juste avant le dessin (rAF ; 100 ms si la fenêtre est cachée). Rien ne se voit (avant la peinture) ; `disconnect` / `takeRecords` respectés ; les observateurs d'un élément précis inchangés. Plus `LCNDA_PERF.whenSeen(el, fn)` (quand l'élément arrive près de l'écran, puis au calme) et `LCNDA_PERF.idle`. | `assets/js/app-observateurs.js` (1er script d'index.php) |
| `.js` / `.css` servis avec `ETag`, `Last-Modified`, `Cache-Control: no-cache` et **304** : le navigateur garde fichiers et code compilé, et revérifie à chaque ouverture (un fichier changé sans nouveau `?v=` est quand même repris). | `router.php` (`router_serve_static`) |
| 🔎 widget : rempli quand on le voit ; chaque résultat noté une fois (WeakMap) ; redessin au plus une fois par image. Bloc de la fiche : redessin par image (ses sources en ligne partent toujours après 2,5 s : tests/test-tout-sur.js l'attend, et le badge 🔎 de l'en-tête en dépend). | `heritage-tout-sur.js` |
| « Le village tel qu'il était » (CORINE, en ligne) : demandé quand la partie arrive à l'écran ; rien si on est parti. | `heritage-telech-a.js` |
| Mentions : seulement ce qui vient d'apparaître ou de changer. | `heritage-links.js` |
| Poignées ⠿ : cherchées dans `#workspace` et les fenêtres ouvertes, sans celles déjà prêtes ; un bouton déjà examiné n'est plus relu (WeakSet, rien d'écrit dans la page). | `heritage-dnd.js` |
| Designs : la page n'est relue (décorations à enlever) que si elle a été décorée ; l'aperçu de la page pris au calme. | `app-designs.js` |
| Diagrammes posés dans une page, « ſ » des transcriptions : seulement quand des éléments arrivent (au plus toutes les 60 ms). | `heritage-diagrams.js`, `app.js` |
| `{n}` des textes : un seul `Intl.NumberFormat` (même écriture). La traduction de la page garde un observateur immédiat (`lcndaImmediate`) : aucun texte français entre deux tâches. | `app-i18n.js` |
| K2 « ✓ Enregistré » : `genealogie-organiser-vus` (les « Nouveau » déjà vus, écrits au premier dessin) ne compte pas comme un réglage changé (sinon un « Réglage changé » de trop pouvait apparaître avant celui de l'utilisateur). | `app-pages.js` |
| L'endroit de la page (« Listes · … ») gardé 1 s (et recalculé dès que l'ordre / les groupes changent). | `app-pages.js` |

## Avant / après

**Ordinateur au calme** (charge 1 à 5, une mesure chacune, ouverture du tableau de bord puis 2 réouvertures) :

| | avant (froid / chaud 1 / chaud 2) | après |
|---|---|---|
| première peinture | 0,99 / 0,41 / 0,74 s | 0,83 / 0,45 / 0,35 s |
| utilisable (jeton + écran) | 2,6 / 2,2 / 3,5 s | 2,8 / 2,5 / 2,4 s |
| **calme** (plus de longue tâche > 200 ms ni de requête) | **19,2 / 20,5 / 20,2 s** | **4,1 / 3,2 / 3,1 s** |
| longues tâches (> 50 ms) : nombre / total | 85 – 100 / 8,3 – 10,2 s | 2 – 4 / 0,7 – 1,3 s |
| temps JavaScript (CDP ScriptDuration) | 9,6 / 8,0 / 6,9 s | 3,0 / 0,9 / 1,2 s |
| temps des tâches (CDP TaskDuration) | 23,3 / 20,8 / 19,8 s | 9,5 / 3,5 / 3,5 s |
| requêtes / octets | 1 156 / 55 Mo à chaque fois | 875 / 34,7 Mo, puis 839 / **1,3 Mo** (304) |
| mémoire JavaScript | 264 – 314 Mo | 28 – 36 Mo |

Dans l'app ouverte, au calme (affiché → calme ; longues tâches : nombre / total / la plus longue) :

| | avant | après |
|---|---|---|
| fiche personne | 0,8 → 31,0 s ; 80 / 25,0 s / 3,8 s | 1,1 → 29,6 s ; 83 / 11,6 s / 1,6 s |
| fiche village | 6,0 → 18,3 s ; 33 / 9,6 s / 3,8 s | 1,1 → 3,6 s ; 4 / 1,1 s / 0,9 s |
| Listes → 🧰 Données (Récap) | 5,0 → 9,9 s ; 7 / 9,0 s / 4,3 s | 0,4 → 0,4 s ; 1 / 0,1 s |
| Carte | 0,3 → 0,3 s ; 2 / 0,1 s | 1,0 → 1,4 s ; 7 / 0,6 s / 0,1 s |
| Réglages | 0,2 → 14,6 s ; 11 / 5,0 s / 4,3 s | 0,2 → 2,2 s ; 5 / 0,7 s / 0,3 s |
| retour au tableau de bord | 5,6 → 29,8 s ; 14 / 5,4 s / 4,4 s | 1,1 → 11,1 s ; 3 / 0,4 s / 0,2 s |

(La fiche personne reste longue à se calmer : son bloc 🔎 « Ce qui le concerne » calcule vraiment — éclipses visibles de ses lieux de vie,
données téléchargées — par petits morceaux, sans longue tâche de plus de 1,6 s. La Carte, plus lente ici, varie d'un essai à l'autre.)

**Ordinateur très chargé** (charge 25 à 30), deux paires alternées A/B (fourchettes) :

| | avant | après |
|---|---|---|
| première peinture (froid) | 1,9 – 8,9 s | 1,0 – 1,9 s |
| utilisable (jeton + écran), froid | 4,3 – 13,9 s | 5,7 – 7,3 s |
| utilisable, 2e / 3e ouverture | 1,8 – 9,0 s | 1,4 – 5,1 s |
| **calme** (plus de longue tâche > 200 ms ni de requête) | **56 – 61 s** | **7,5 – 13,4 s** |
| longues tâches (> 50 ms) : nombre / total | 195 – 228 / **30 – 36 s** | 11 – 32 / **1,6 – 7,1 s** |
| temps JavaScript (CDP ScriptDuration) | 18,6 – 23,4 s | 1,7 – 4,0 s |
| temps des tâches (CDP TaskDuration) | 49 – 55 s | 6,6 – 14,2 s |
| appels des observateurs | ≈ 82 000 (6 – 12 s) | 2 500 – 7 400 (0,3 – 0,6 s) |
| requêtes / octets, froid | 1 011 – 1 142 / 44 – 55 Mo | 864 – 873 / 34,7 Mo |
| requêtes / octets, 2e ouverture | 1 017 – 1 134 / 45 – 55 Mo | 839 – 869 / **1,3 – 2,6 Mo** (304) |
| mémoire JavaScript | 145 – 300 Mo | 28 – 40 Mo |

Dans l'app ouverte, ordinateur chargé (une mesure chacune) :

| | avant : affiché / longues tâches / la plus longue | après |
|---|---|---|
| fiche personne | 1,2 s / 28,9 s / 4,8 s | 1,7 s / 14,5 s / 1,0 s |
| fiche village | 16,8 s / 23,6 s / 5,7 s | 1,5 s / 10,5 s / 1,8 s |
| Listes → 🧰 Données (Récap) | 17,2 s / 28,5 s / 13,7 s | 0,7 s / 5,8 s / 4,7 s |
| Carte | 1,2 s / 4,2 s / 0,7 s | 2,1 s / 2,0 s / 0,4 s |
| Réglages | 0,3 s / 42,8 s / 14,4 s | 0,5 s / 2,4 s / 1,4 s |
| retour au tableau de bord | 11,6 s / 18,4 s / 8,4 s | 5,7 s / 10,2 s / 0,9 s |

(Les listes et la colonne ont aussi profité, en même temps, des corrections de l'audit des listes : `labelsMemo`, `savedOrder` avec des
ensembles, l'index des thèmes.)

## Pas fait (et pourquoi)

- **Charger les modules à la demande / paquets concaténés** : le code au premier niveau des 530 fichiers ne coûte que ≈ 1 s ; la compilation
  est maintenant gardée par le navigateur dès la 2e ouverture (304 + cache du code). Les registres (`dataLists`, `personBlocks`,
  `villageSections`, ~110 observateurs de page…) sont remplis par les fichiers eux-mêmes : les charger plus tard changerait ce qu'on voit.
  Concaténer ferait qu'une erreur dans un fichier arrête les suivants. Gain restant estimé : 1 à 3 s à la toute première ouverture.
- **gzip** : tout passe par 127.0.0.1 (serve.sh, relais d'Electron, porte du wifi) : compresser coûterait du processeur sans rien gagner.
- `Cache-Control: immutable` pour `?v=` hors Electron : risqué tant qu'un fichier peut changer sans changer de numéro ; l'app de bureau
  empaquetée le fait déjà (son cache est vidé à chaque version).
- À regarder ensuite : un élément de la fiche personne qui modifie la page ≈ 20 fois par seconde au repos (les observateurs tournent sans
  arrêt) ; `heritage-monde-contexte.js` (scan de page) ; le catalogue des éclipses (0,8 s d'un seul tenant) ; `menuHiddenKeys` /
  `listShown` relus pour chacune des 600 listes.

## Risques

- Les observateurs de page reçoivent parfois leurs changements une image plus tard (jamais après le dessin). Un code qui modifie la page
  puis lit **dans la même tâche** une décoration posée par un autre module ne la verrait pas encore — c'était déjà le cas avec les
  observateurs du navigateur (ils passent après la tâche).
- Le widget « Ce qui le concerne » et la partie CORINE d'un village ne se remplissent qu'à l'écran : une capture de page entière sans
  défilement les montre en attente.
