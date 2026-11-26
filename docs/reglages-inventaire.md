# Inventaire des réglages — « 💾 Réglages enregistrés : toute l’app »

Ce document dit **tout ce que l’app retient** comme préférence, et ce que garde (ou non) un ensemble de
« Réglages enregistrés : toute l’app » (Réglages → Apparence → TOUS LES RÉGLAGES), son fichier exporté et son « ↶ Annuler ».

Le code : le **registre des réglages** dans `assets/js/heritage-studio.js` (`ALL_SKIP`, `ALL_SKIP_RX`, `LCNDA_SKIP`,
`LCNDA_SKIP_RX`, `ALL_EXTRA`, `ALL_OUTSIDE`, `isAllKey`). Le garde-fou : `tests/test-reglages-tout.js`.
La table en bas est produite par le crible du test (toutes les clés de `localStorage` / `sessionStorage` trouvées dans `assets/js`).

## La règle (pour du code nouveau)

1. **Tout réglage rangé dans `localStorage` sous `genealogie-…` ou `lcnda-…` est gardé d’office** : rien à déclarer.
   (`genealogie-…` part aussi dans la base et la sauvegarde ; `lcnda-…` reste sur l’ordinateur, mais un ensemble le garde quand même.)
2. Ce qui **ne doit pas** être gardé est listé dans le registre, **avec sa raison** :
   - secrets (jetons, clés d’API) ;
   - ce qui est propre à cet ordinateur (chemins de dossiers, langue de l’ordinateur, mode simple « propre à cet appareil », mises à jour de l’app installée) ;
   - l’état passager : brouillons, téléchargements ou tâches en cours (`…-dl`), caches, files d’attente, dates et « déjà montré / déjà dit » ;
   - les données : parties, scores, records, calculs, coloriages, temps passé, historique ;
   - ce qui vise une fiche, un acte, une carte précise de la base : clés en `…-<nombre>` ou `…:<nombre>` (ex. pages repliées d’**un** acte, `genealogie-tx-pages-pliees-<acte>` : décision = non gardé, c’est attaché à l’acte, pas un réglage ; de cujus ; panier ; récents de fiches).
3. Une clé **sans** ces préfixes est refusée par le test tant qu’elle n’est pas déclarée (`ALL_EXTRA` = gardée, `ALL_OUTSIDE` = pas gardée, avec la raison). Mieux : la renommer en `lcnda-…` / `genealogie-…` en relisant l’ancien nom (exemple : le puzzle, `lcnda_puzzle-prefs-v1` → `lcnda-puzzle-prefs`).
4. Un nom suspect gardé (`key`, `token`, `draft`, `job`, `cache`, `-dl`, `recent`, `told`, `tip`, `last`…) fait échouer le test tant qu’il n’est pas soit exclu, soit relu (`REVIEWED_KEPT` dans le test).
5. `sessionStorage` : **jamais** gardé (passager par nature, cet onglet).

## Ce que fait un ensemble

- **Enregistrer** : toutes les clés gardées par le registre (+ une copie de « Mes graphiques » rangés dans la base). Le mode simple sans son code de sortie ni la personne qui regarde ; la barre d’une liste (`lcnda-listbar:`) : tri et affichage seulement ; une liste de données (`lcnda-ld:`) : colonnes, colonne GPS, tri, critères, sans la recherche tapée. Marqué `reg: 2`.
- **Appliquer** : demande confirmation, garde **l’état d’avant** dans l’onglet (`sessionStorage` `lcnda-reglages-annuler`), remet tout (les réglages absents de l’ensemble reviennent au départ), envoie les `genealogie-…` à la base, recharge l’écran ; après le rechargement : « Ensemble « … » appliqué. **↶ Annuler** » (une fois). « Annuler » remet tout comme avant et le dit.
  Un ensemble d’avant le registre (sans `reg: 2`) n’efface pas les `lcnda-…` qu’il ne connaissait pas.
  Les secrets, brouillons, la langue, etc. ne sont **ni gardés ni effacés**.
- **Exporter / Importer un fichier** (`.lcnda-reglages.json`, `type: lcnda-reglages`, `reg`) : les mêmes clés, nettoyées (aucun secret, aucun chemin, aucune recherche tapée) ; à l’import, chaque valeur est vérifiée (taille, HTML, types).

## Hors localStorage

| Où | Quoi | Gardé ? | Pourquoi |
|---|---|---|---|
| Base, table `app_settings` | copie des `genealogie-…` (lib/settings.php) | oui (via localStorage) | c’est la même chose que les clés `genealogie-…` |
| Base, `graphs` (lib/graphs.php) | « Mes graphiques » et widgets à soi | oui (copie `genealogie-custom-widgets`) | « Appliquer » les remet, sans effacer ceux faits depuis (des données) |
| Base, `saved_views` | vues nommées | non | des données de la base (suivent la sauvegarde) |
| `SHARED_DATA_DIR/genealogie-ia-serveur.json` | serveur d’IA, **clé** | non | secret + propre à l’ordinateur |
| `SHARED_DATA_DIR/sauvegarde-auto.json`, `…-etat.json` | sauvegarde automatique (dossier) | non | chemins de cet ordinateur, état |
| `SHARED_DATA_DIR/successoral.json` | rangement des dossiers successoraux | non | commun à toutes les généalogies de l’ordinateur (où ranger, quelle base) |
| `DATA_DIR/site-defaults.json` | défauts du site | non (fonction à part : « Définir comme défaut du site ») | réglage d’administration, déjà son propre fichier |
| `DATA_DIR/consultation.json`, `verrou.json`, `site-publish.json`, `telephone-wifi-essais.json` | mode consultation, verrou, publication, wifi | non | sécurité, accès, état |
| `DATA_DIR/cache/*` | caches | non | passager |
| Electron `userData/config.json` | port du serveur local | non | propre à l’ordinateur |
| Electron, préférences de mises à jour | auto / sauter / plus tard | non | propre à l’app installée (reflet : `lcnda-mises-a-jour`) |
| IndexedDB `lcnda-terrain`, `lcnda-visite` | relevés de terrain, carnet de visite | non | des données |
| Cache API `lcnda-face-model` | modèle de reconnaissance des visages | non | cache |
| Cookie `lcnda_lang` | langue pour le serveur | non | va avec `lcnda-langue` (cet ordinateur) |

## Corrigé à cette occasion

- **Avant**, seules les clés `genealogie-…` et 14 clés `lcnda-…` nommées étaient gardées : **68 réglages `lcnda-…`** manquaient (groupes des Trésors, panneau de côté, calques et options des cartes — frontières, cadastre, cartes postales, photos des lieux, comparer —, cartes photos, liste de données avec la colonne GPS et les colonnes cachées, sections repliées de la fiche et du mode simple, Atelier — courbes et place de la calculette, aide à la lecture —, onglets mémorisés, dessin, tableur, site web, jeux — réglages seulement —, puzzle…). Désormais **tout `lcnda-…`** est gardé, sauf la liste d’exceptions.
- **Secret** : `genealogie-artist-keys` (jeton Discogs, clé TMDb) partait dans les ensembles, leurs fichiers… et dans la base (donc la sauvegarde). Il est exclu des ensembles et ajouté aux clés propres à l’ordinateur (`LOCAL_ONLY` d’app.js, `APP_SETTINGS_LOCAL_ONLY` de lib/settings.php).
- **État passager qui était gardé** : brouillons de lecture (`genealogie-tx-draft-new`…), téléchargements en cours (`…-dl`), file d’envoi des réglages, file des données, parties du jeu de l’oie, temps passé, historique des recherches, mots du jour, panier et récents des connexions, « déjà montré ». Retirés.
- **Sections repliées des réglages** (`genealogie-reglages-ouverts`) : désormais gardées (demandé : « sections repliées »).
- **Clé hors préfixe** : `lcnda_puzzle-prefs-v1` → `lcnda-puzzle-prefs` (l’ancien nom est encore lu).
- **↶ Annuler** après « Appliquer » (il n’y en avait pas).

## Résumé chiffré

- 578 clés trouvées dans assets/js : 566 en localStorage, 12 en sessionStorage (jamais gardées).
- localStorage : 470 gardées par « toute l’app », 96 exclues avec leur raison, 0 sans classement.
- Par préfixe : `genealogie-…` 383 gardées / 48 exclues ; `lcnda-…` 87 gardées / 43 exclues ; hors préfixe : 5 (toutes déclarées dans ALL_OUTSIDE).
- Une clé en `…*` est un préfixe (la suite est un nom de liste, d’outil, d’acte…).
- Pour refaire la table : le crible de `tests/test-reglages-tout.js` (`scanKeys`) et le registre (`isAllKey`).

## La table complète (localStorage et sessionStorage, assets/js)

| Clé | Stockage | Fichier | Gardée ? | Raison si non |
|---|---|---|---|---|
| `genealogie-accessibilite` | local | app-access.js | oui |  |
| `genealogie-accessibilite-simulation` | session | app-access.js | non | sessionStorage : passager (cet onglet) |
| `genealogie-accessibilite-simulation` | local | app-access.js | oui |  |
| `genealogie-acts-guess` | local | heritage-transcribe.js | oui |  |
| `genealogie-addrmap` | local | heritage-addrmap.js | oui |  |
| `genealogie-addrmap-*` | local | heritage-addrmap.js | oui |  |
| `genealogie-adn-livres` | local | heritage-adn-livres.js | oui |  |
| `genealogie-adn-prefs` | local | heritage-dna.js | oui |  |
| `genealogie-anim-defaults` | local | heritage-anim-studio.js | oui |  |
| `genealogie-archive-digest-category-order` | local | app-recherche.js | oui |  |
| `genealogie-archive-room` | local | app-piece-archives.js | oui |  |
| `genealogie-archives-en-ligne-vue` | local | app-archives-en-ligne-core.js | oui |  |
| `genealogie-archives-registered` | local | app-listes.js | oui |  |
| `genealogie-artist-book` | local | heritage-artist-catalogue.js | oui |  |
| `genealogie-artist-keys` | local | heritage-artist-import.js | non | 🔑 secrets : jeton Discogs, clé TMDb (heritage-artist-import.js) |
| `genealogie-artist-prefs` | local | heritage-artist.js (+1) | oui |  |
| `genealogie-artist-recview` | local | heritage-artist-music.js | oui |  |
| `genealogie-artist-tracks` | local | heritage-artist-music.js | oui |  |
| `genealogie-assistant-ia` | local | heritage-assistant-ia.js | oui |  |
| `genealogie-atelier-config` | local | heritage-research.js | oui |  |
| `genealogie-atelier-profiles` | local | heritage-research.js | oui |  |
| `genealogie-atelier-timers` | local | app-chrono-recherche.js (+1) | non | chronomètres en marche |
| `genealogie-atelier-widgets-ov` | local | heritage-research.js | oui |  |
| `genealogie-audio-fx-presets` | local | heritage-audio-quick.js | oui |  |
| `genealogie-audio-mode` | local | heritage-audio-quick.js (+1) | oui |  |
| `genealogie-audio-multi-snap` | local | heritage-audio-multi.js | oui |  |
| `genealogie-audio-quick-design` | local | heritage-audio-quick.js (+1) | oui |  |
| `genealogie-audio-studio-spectrum` | local | heritage-audio-studio.js | oui |  |
| `genealogie-audio-transcript-pause` | local | heritage-audio-studio.js | oui |  |
| `genealogie-auto-backup-lock` | local | app.js | non | verrou d’une sauvegarde en cours |
| `genealogie-auto-backup-settings` | local | app.js (+1) | non | chemin d’un dossier de cet ordinateur |
| `genealogie-av-prefs` | local | heritage-av.js | oui |  |
| `genealogie-avatar-shapes` | local | app-apparence.js | oui |  |
| `genealogie-baissait-ui-v2` | local | app.js | non | marque interne (cet ordinateur) |
| `genealogie-base-mode` | local | app.js (+1) | oui |  |
| `genealogie-bases-officielles` | local | heritage-bases-officielles.js | oui |  |
| `genealogie-bases-officielles-dl` | local | heritage-bases-officielles.js | non | téléchargement en cours : passager |
| `genealogie-battue-level-color-presets` | local | app.js | oui |  |
| `genealogie-battue-level-colors` | local | app.js | oui |  |
| `genealogie-bg-photo` | local | app-fond.js | non | la photo du fond des pages (app-fond.js) : lourde, elle reste sur cet ordinateur (et un ensemble ne l’efface pas) |
| `genealogie-board-groups` | local | heritage-boards.js | oui |  |
| `genealogie-board-minimap` | local | heritage-boards.js | oui |  |
| `genealogie-board-prefs` | local | heritage-board-kit.js | oui |  |
| `genealogie-board-prefs-sets` | local | heritage-board-kit.js | oui |  |
| `genealogie-board-templates` | local | heritage-boards.js | oui |  |
| `genealogie-booklet-design` | local | heritage-livrets.js | oui |  |
| `genealogie-booklet-designs` | local | heritage-livrets.js | oui |  |
| `genealogie-boussole-rues` | local | heritage-boussole-rues.js | oui |  |
| `genealogie-boussole-rues-convert` | local | heritage-boussole-rues.js | oui |  |
| `genealogie-branches-isolees` | local | heritage-branches-isolees.js | oui |  |
| `genealogie-brevets-annuaires` | local | heritage-brevets-annuaires.js | oui |  |
| `genealogie-brevets-annuaires-dl` | local | heritage-brevets-annuaires.js | non | téléchargement en cours : passager |
| `genealogie-brush-presets` | local | heritage-studio.js | oui |  |
| `genealogie-calculette` | local | app-apparence.js (+1) | oui |  |
| `genealogie-calculette-presets` | local | heritage-calculette.js | oui |  |
| `genealogie-calendar-choices` | local | heritage-lightbox-layout.js | oui |  |
| `genealogie-carte-territoires` | local | heritage-territoires.js | oui |  |
| `genealogie-carte-vie` | local | heritage-carte-vie.js | oui |  |
| `genealogie-catalogue-tab` | local | heritage-onglets-catalogue.js | oui |  |
| `genealogie-census-details-*` | local | app.js | oui |  |
| `genealogie-chateaux-territoires` | local | heritage-chateaux-territoires.js (+1) | oui |  |
| `genealogie-choix-tri` | local | app-ui.js | oui |  |
| `genealogie-ciel-heure` | local | heritage-ciel-heure.js | oui |  |
| `genealogie-color-tab` | local | app-ui.js | oui |  |
| `genealogie-commune-culture` | local | heritage-commune-culture.js | oui |  |
| `genealogie-commune-plus` | local | heritage-commune-plus.js | oui |  |
| `genealogie-connexions` | local | heritage-connexions.js | oui |  |
| `genealogie-connexions-besoins` | local | heritage-connexions-besoins.js | oui |  |
| `genealogie-connexions-panier` | local | app-inserer.js (+1) | non | le panier et ses derniers éléments, les derniers insérés (des fiches de cette base) |
| `genealogie-connexions-recents` | local | heritage-connexions.js | non | le panier et ses derniers éléments, les derniers insérés (des fiches de cette base) |
| `genealogie-correspondence-sort-*` | local | app.js | oui |  |
| `genealogie-courriers-lettres` | local | heritage-courriers-actes.js (+1) | oui |  |
| `genealogie-courriers-lettres-presets` | local | heritage-courriers-actes.js | oui |  |
| `genealogie-custom-tabs` | local | app-onglets-plus.js (+1) | oui |  |
| `genealogie-custom-widgets` | local | app.js (+2) | oui |  |
| `genealogie-cx-put-recents` | local | heritage-connexions.js | non | le panier et ses derniers éléments, les derniers insérés (des fiches de cette base) |
| `genealogie-cx-take-split` | local | heritage-connexions.js | oui |  |
| `genealogie-daboville-map` | local | app.js | non | calcul de cette base |
| `genealogie-daboville-root` | local | app.js | non | une fiche précise |
| `genealogie-daboville-root-name` | local | app.js | non | une fiche précise |
| `genealogie-dash-next-skip` | local | app-tableau-de-bord.js | non | des fiches, pages ou suggestions précises de cette base |
| `genealogie-dash-period` | local | app-tableau-de-bord.js | oui |  |
| `genealogie-dashboard-blocks` | local | app.js | oui |  |
| `genealogie-dashboard-recent-people` | local | app.js | non | fiches récentes de cette base |
| `genealogie-dashboard-widget-catalog-hidden` | local | app.js | oui |  |
| `genealogie-dashboard-widget-catalog-order` | local | app.js | oui |  |
| `genealogie-decor-tree-formats` | local | heritage-vector-tree.js | oui |  |
| `genealogie-decor-tree-styles` | local | heritage-vector-tree.js | oui |  |
| `genealogie-design` | local | app-access.js (+12) | oui |  |
| `genealogie-design-custom-presets` | local | app.js | oui |  |
| `genealogie-designs` | local | app-designs.js | oui |  |
| `genealogie-desk-countdown` | local | heritage-desk-widgets.js | oui |  |
| `genealogie-diagram-kinds` | local | heritage-diagram-kinds.js | oui |  |
| `genealogie-diagram-perso-open` | local | heritage-diagram-perso.js | oui |  |
| `genealogie-diagram-style-default` | local | heritage-diagram-perso.js | oui |  |
| `genealogie-diagram-styles` | local | heritage-diagram-perso.js | oui |  |
| `genealogie-documents-tab` | local | heritage-onglets-documents.js | oui |  |
| `genealogie-donnees-file` | local | app-listes-maj.js | non | la date de la dernière mise à jour des données, la file des téléchargements : passager |
| `genealogie-donnees-filtre` | local | app-listes-maj.js | oui |  |
| `genealogie-donnees-maj-auto` | local | app-listes-maj.js | oui |  |
| `genealogie-donnees-maj-dernier` | local | app-listes-maj.js | non | la date de la dernière mise à jour des données, la file des téléchargements : passager |
| `genealogie-dp-locks` | local | heritage-depouillements.js | non | des fiches, pages ou suggestions précises de cette base |
| `genealogie-droit-pouvoir` | local | heritage-droit-pouvoir.js | oui |  |
| `genealogie-edit-tools-order` | local | heritage-edittools.js | oui |  |
| `genealogie-editor-cmds` | local | heritage-keynote.js | non | noté par l’app (commandes des éditeurs), refait tout seul |
| `genealogie-editor-full` | local | heritage-studio-av.js (+1) | oui |  |
| `genealogie-editor-shortcuts-tab` | local | heritage-audio-studio.js (+4) | oui |  |
| `genealogie-edittools-sort` | local | heritage-edittools.js | oui |  |
| `genealogie-edittools-tab` | local | heritage-edittools.js | oui |  |
| `genealogie-edittools-view` | local | heritage-edittools.js | oui |  |
| `genealogie-elections` | local | heritage-elections.js | oui |  |
| `genealogie-elections-dl` | local | heritage-elections.js | non | téléchargement en cours : passager |
| `genealogie-enquetes-prefs` | local | app-enquetes.js | oui |  |
| `genealogie-epoque-travail` | local | heritage-epoque-travail.js | oui |  |
| `genealogie-events-filter` | local | app.js | oui |  |
| `genealogie-events-filter-*` | local | app.js | oui |  |
| `genealogie-export-privacy` | local | app-mode-simple.js (+3) | oui |  |
| `genealogie-external-links` | local | app.js | oui |  |
| `genealogie-faire-part` | local | heritage-vector-cards.js | oui |  |
| `genealogie-family-book` | local | heritage-book.js (+1) | oui |  |
| `genealogie-fiches-edifices` | local | heritage-fiche-edifice.js | oui |  |
| `genealogie-fonds-esri` | local | heritage-fonds-libres.js | oui |  |
| `genealogie-formats` | local | app-formats.js | oui |  |
| `genealogie-gabarits-perso` | local | heritage-transcribe-gabarit.js | oui |  |
| `genealogie-gaps-gen` | local | heritage-research-gaps.js | oui |  |
| `genealogie-gaps-group` | local | heritage-research-gaps.js | oui |  |
| `genealogie-gender-colors` | local | app.js | oui |  |
| `genealogie-glyphs-recent` | local | heritage-studio.js | oui |  |
| `genealogie-goose-active-v1` | local | app-jeu.js | non | les parties en cours du jeu de l'oie : des données |
| `genealogie-goose-games-v1` | local | app-jeu.js | non | les parties en cours du jeu de l'oie : des données |
| `genealogie-goose-lists-v1` | local | app-jeu.js | oui |  |
| `genealogie-gov` | local | heritage-gov.js | oui |  |
| `genealogie-gov-dl` | local | heritage-gov.js | non | téléchargement en cours : passager |
| `genealogie-gradients` | local | heritage-studio.js | oui |  |
| `genealogie-grande-carte` | local | heritage-cartes-outils.js | oui |  |
| `genealogie-graph-diagram-hidden` | local | app.js | oui |  |
| `genealogie-graph-diagram-order` | local | app.js | oui |  |
| `genealogie-graph-stats-hidden` | local | app.js | oui |  |
| `genealogie-graph-stats-order` | local | app.js | oui |  |
| `genealogie-heritage-flags` | local | heritage.js | oui |  |
| `genealogie-hidden-rows` | local | app-harmony.js | oui |  |
| `genealogie-histoire-autour` | local | heritage-histoire-autour.js | oui |  |
| `genealogie-histoire-dl` | local | heritage-histoire.js | non | téléchargement en cours : passager |
| `genealogie-historical-timeline` | local | app-chronologie.js | oui |  |
| `genealogie-horloges` | local | heritage-horloges.js | oui |  |
| `genealogie-horloges-carte` | local | heritage-horloges.js | oui |  |
| `genealogie-horloges-couleurs` | local | heritage-horloges.js | oui |  |
| `genealogie-horloges-pays` | local | heritage-horloges.js | oui |  |
| `genealogie-horloges-style` | local | heritage-horloges.js | oui |  |
| `genealogie-horloges-vue` | local | heritage-horloges.js | oui |  |
| `genealogie-house-lib` | local | heritage-house-lib.js | oui |  |
| `genealogie-house-oldonly` | local | heritage-house-lib.js | oui |  |
| `genealogie-house-sets` | local | heritage-house.js | oui |  |
| `genealogie-house-snap` | local | heritage-house.js | oui |  |
| `genealogie-house-style` | local | heritage-house-lib.js | oui |  |
| `genealogie-houses-view` | local | heritage-house.js | oui |  |
| `genealogie-htr-fix` | local | heritage-transcribe.js | oui |  |
| `genealogie-htr-fix-level` | local | heritage-transcribe.js | oui |  |
| `genealogie-htr-image-mode` | local | heritage-transcribe-acte.js | oui |  |
| `genealogie-htr-lexique` | local | heritage-transcribe.js | oui |  |
| `genealogie-htr-model` | local | heritage-transcribe.js | oui |  |
| `genealogie-htr-python` | local | heritage-more.js | oui |  |
| `genealogie-htr-word-color` | local | heritage-transcribe-contexte.js | oui |  |
| `genealogie-identity-empty-*` | local | app.js | oui |  |
| `genealogie-identity-name-variants-display` | local | app.js | oui |  |
| `genealogie-idphoto` | local | heritage-studio.js | oui |  |
| `genealogie-insee-auto` | local | app.js | oui |  |
| `genealogie-inserer` | local | app-inserer.js | oui |  |
| `genealogie-inserer-recents` | local | app-inserer.js | non | le panier et ses derniers éléments, les derniers insérés (des fiches de cette base) |
| `genealogie-jeux-famille-presets` | local | app-jeu-famille.js | oui |  |
| `genealogie-jeux-tri` | local | app-jeu.js | oui |  |
| `genealogie-journee` | local | heritage-journee.js | oui |  |
| `genealogie-keynote-prefs` | local | heritage-keynote.js | oui |  |
| `genealogie-kin-head` | local | app.js | oui |  |
| `genealogie-kin-show` | local | app.js | oui |  |
| `genealogie-last-route` | local | app.js | non | la page ouverte : navigation |
| `genealogie-layout-defaults` | local | heritage-layout.js | oui |  |
| `genealogie-layout-fonts` | local | heritage-keynote.js (+1) | oui |  |
| `genealogie-layout-formats` | local | app-formats.js (+1) | oui |  |
| `genealogie-layout-panel-w` | local | heritage-layout.js | oui |  |
| `genealogie-layout-profiles` | local | heritage-studio.js | non | les ensembles eux-mêmes |
| `genealogie-layout-reviewer` | local | heritage-layout.js | non | le nom de la personne qui relit : privé |
| `genealogie-layout-send-theme` | local | heritage-layout.js | oui |  |
| `genealogie-layout-send-to` | local | heritage-layout.js | oui |  |
| `genealogie-layout-stylesets` | local | heritage-layout.js | oui |  |
| `genealogie-layout-with-tr` | local | heritage-layout.js | oui |  |
| `genealogie-left-column` | local | app-colonne.js | oui |  |
| `genealogie-liens-learn` | local | heritage-liens.js | oui |  |
| `genealogie-lieux-patrimoine` | local | heritage-lieux-patrimoine.js | oui |  |
| `genealogie-lieux-patrimoine-dl` | local | heritage-lieux-patrimoine.js | non | téléchargement en cours : passager |
| `genealogie-lieux-patrimoine-offres` | local | heritage-lieux-patrimoine.js | oui |  |
| `genealogie-lightbox-sections` | local | heritage-lightbox-layout.js | oui |  |
| `genealogie-lineage` | local | app.js | oui |  |
| `genealogie-lineage-*` | local | app.js | oui |  |
| `genealogie-list-columns` | local | heritage-columns.js | oui |  |
| `genealogie-list-hidden` | local | app-listes.js (+1) | oui |  |
| `genealogie-list-order` | local | app-listes.js (+1) | oui |  |
| `genealogie-list-saved-filters` | local | app-listes.js | oui |  |
| `genealogie-listes-donnees` | local | app-listes-donnees.js | oui |  |
| `genealogie-lot10-objets-traces` | local | heritage-lot10-objets-traces.js | oui |  |
| `genealogie-lot10-voir-village` | local | heritage-lot10-voir-village.js | oui |  |
| `genealogie-lot8-ciel-metier` | local | heritage-lot8-ciel-metier.js | oui |  |
| `genealogie-lot8-monde-village` | local | heritage-lot8-monde-village.js | oui |  |
| `genealogie-lot8-soldats-noms` | local | heritage-lot8-soldats-noms.js | oui |  |
| `genealogie-lot9-cles` | local | heritage-lot9-sons-enfance.js | oui |  |
| `genealogie-lot9-offre-vue` | local | heritage-lot9-sons-enfance.js | oui |  |
| `genealogie-lot9-sons-enfance` | local | heritage-lot9-sons-enfance.js | oui |  |
| `genealogie-lune-prefs` | local | heritage-lune.js | oui |  |
| `genealogie-maintenance-groups` | local | app-maintenance.js | oui |  |
| `genealogie-maintenance-order` | local | app-maintenance.js (+1) | oui |  |
| `genealogie-map-hidden` | local | app.js | oui |  |
| `genealogie-map-lineage` | local | app-carte.js | oui |  |
| `genealogie-map-options` | local | app-carte.js | oui |  |
| `genealogie-map-order` | local | app.js | oui |  |
| `genealogie-maternity-gaps-*` | local | app.js | oui |  |
| `genealogie-media-alt` | local | app-access.js | non | descriptions des médias de CETTE base : des données |
| `genealogie-media-order-*` | local | app.js | oui |  |
| `genealogie-menu-*` | local | app.js (+1) | oui |  |
| `genealogie-menu-added` | local | app-onglets-plus.js | oui |  |
| `genealogie-menu-adn` | local | app.js | oui |  |
| `genealogie-menu-animaux` | local | app.js | oui |  |
| `genealogie-menu-catalogue` | local | app.js | oui |  |
| `genealogie-menu-documents` | local | app.js | oui |  |
| `genealogie-menu-fiches` | local | app.js | oui |  |
| `genealogie-menu-hidden` | local | app-onglets-plus.js (+3) | oui |  |
| `genealogie-menu-icons` | local | app.js | oui |  |
| `genealogie-menu-names` | local | app.js | oui |  |
| `genealogie-menu-order` | local | app.js (+1) | oui |  |
| `genealogie-menu-own-last` | local | app.js | oui |  |
| `genealogie-menu-successoral` | local | app.js | oui |  |
| `genealogie-menu-suivi` | local | app.js | oui |  |
| `genealogie-menu-tresors` | local | app.js | oui |  |
| `genealogie-mes-cartes-presets` | local | heritage-cartes-perso.js | oui |  |
| `genealogie-messages` | local | app.js | oui |  |
| `genealogie-meteo` | local | heritage-meteo.js | oui |  |
| `genealogie-meteo-dl` | local | heritage-meteo.js | non | téléchargement en cours : passager |
| `genealogie-metiers-rivieres` | local | heritage-metiers-rivieres.js | oui |  |
| `genealogie-minicarte-nb` | local | heritage-mini-carte.js | oui |  |
| `genealogie-mode-simple` | local | app-apparence.js (+2) | oui |  |
| `genealogie-mode-simple-presets` | local | app-mode-simple.js | oui |  |
| `genealogie-monde-contexte` | local | heritage-monde-contexte.js | oui |  |
| `genealogie-montage-layout-sets` | local | heritage-studio-av.js | oui |  |
| `genealogie-montage-page-order` | local | heritage-studio-av.js | oui |  |
| `genealogie-montage-panel` | local | heritage-studio-av.js | oui |  |
| `genealogie-montage-prefs` | local | heritage-studio-av.js | oui |  |
| `genealogie-mouvements` | local | heritage-mouvements.js | oui |  |
| `genealogie-occtree` | local | heritage-metiers-arbre.js | oui |  |
| `genealogie-oeuvres-prefs` | local | heritage-oeuvres.js | oui |  |
| `genealogie-online-sheet-side` | local | app.js | oui |  |
| `genealogie-online-sheets-open` | local | app.js | oui |  |
| `genealogie-ouc-plan-tout` | local | heritage-ou-chercher-plus.js | oui |  |
| `genealogie-ouc-registres` | local | heritage-ou-chercher-plus.js | oui |  |
| `genealogie-owner-first` | local | heritage-book.js | oui |  |
| `genealogie-parents-celebres` | local | heritage-parents-celebres.js | oui |  |
| `genealogie-patterns` | local | heritage-studio.js | oui |  |
| `genealogie-pays-memoire` | local | heritage-pays-memoire.js | oui |  |
| `genealogie-people-column` | local | app.js | oui |  |
| `genealogie-periodicals-view` | local | heritage-periodicals.js | oui |  |
| `genealogie-person-badge-color-presets` | local | app.js | oui |  |
| `genealogie-person-badge-colors` | local | app.js | oui |  |
| `genealogie-person-blocks-*` | local | app.js | oui |  |
| `genealogie-person-header` | local | app-apparence.js | oui |  |
| `genealogie-pet-prefs` | local | heritage-pets.js | oui |  |
| `genealogie-pet-presets` | local | heritage-pets.js | oui |  |
| `genealogie-pet-sections` | local | app-sections.js | oui |  |
| `genealogie-pets-merged` | local | heritage-pets.js | oui |  |
| `genealogie-pistes-auto` | local | heritage-pistes-auto.js | oui |  |
| `genealogie-pistes-filtres` | local | heritage-pistes-auto.js | oui |  |
| `genealogie-portraits` | local | app-portraits.js | oui |  |
| `genealogie-prenoms-pays` | local | heritage-prenoms-pays.js | oui |  |
| `genealogie-prenoms-pays-dl` | local | heritage-prenoms-pays.js | non | téléchargement en cours : passager |
| `genealogie-prenoms-zone` | local | heritage.js | oui |  |
| `genealogie-print-prefs` | local | app-actions.js | oui |  |
| `genealogie-prix-europe` | local | heritage-prix-europe.js | oui |  |
| `genealogie-questions-rapides` | local | heritage-questions-plus.js | oui |  |
| `genealogie-recent-colors` | local | app-ui.js | oui |  |
| `genealogie-recent-fonts` | local | app-ui.js | oui |  |
| `genealogie-recent-icons` | local | app-icones.js | oui |  |
| `genealogie-recherche-fr` | local | heritage-recherche-fr.js | oui |  |
| `genealogie-recueil-trous-ok` | local | heritage-recueil-etat.js | oui |  |
| `genealogie-recueils-caches-consultation` | local | heritage-recueil-fiche.js | oui |  |
| `genealogie-recueils-fonds` | local | heritage-recueil-fonds.js | oui |  |
| `genealogie-recueils-vue` | local | heritage-recueil-fonds.js | oui |  |
| `genealogie-reglages-*` | local | heritage-vector.js | oui |  |
| `genealogie-reglages-ouverts` | local | app-ui.js | oui |  |
| `genealogie-reglages-presentation` | local | app.js | oui |  |
| `genealogie-relief-3d` | local | heritage-cartes-outils.js | oui |  |
| `genealogie-research-clock` | local | app-chrono-recherche.js | non | le temps passé, l'historique des recherches, les mots du jour : des données |
| `genealogie-research-history` | local | app-recherche-outils.js | non | le temps passé, l'historique des recherches, les mots du jour : des données |
| `genealogie-research-kind-hidden` | local | app-recherche.js | oui |  |
| `genealogie-research-kind-order` | local | app-recherche.js | oui |  |
| `genealogie-research-replace` | local | app-recherche-outils.js | oui |  |
| `genealogie-retouch-actions` | local | heritage-studio.js | oui |  |
| `genealogie-retouch-chpage` | local | heritage-studio.js | oui |  |
| `genealogie-retouch-crease` | local | heritage-studio.js | oui |  |
| `genealogie-retouch-glset` | local | heritage-studio.js | oui |  |
| `genealogie-retouch-gradient` | local | heritage-studio.js | oui |  |
| `genealogie-retouch-layout` | local | heritage-studio-av.js (+1) | oui |  |
| `genealogie-retouch-mode` | local | heritage-retouch-simple.js (+1) | oui |  |
| `genealogie-retouch-panel-w` | local | heritage-studio.js | oui |  |
| `genealogie-retouch-pattern` | local | heritage-studio.js | oui |  |
| `genealogie-retouch-raall` | local | heritage-studio.js | oui |  |
| `genealogie-retouch-rotate` | local | heritage-studio.js | oui |  |
| `genealogie-retouch-side-closed` | local | heritage-studio.js | oui |  |
| `genealogie-retouch-tip` | local | heritage-studio.js | non | « déjà montré » (un ensemble ne les fait pas revenir) |
| `genealogie-sante` | local | heritage-sante.js | oui |  |
| `genealogie-settings-profiles` | local | heritage-studio.js | non | les ensembles eux-mêmes |
| `genealogie-sheet-head` | local | app-apparence.js (+1) | oui |  |
| `genealogie-sheet-sections` | local | app-sections.js (+1) | oui |  |
| `genealogie-shortcut-presets` | local | app.js | oui |  |
| `genealogie-shortcut-widget-presets` | local | heritage-shortcuts.js | oui |  |
| `genealogie-shortcuts` | local | app.js (+1) | oui |  |
| `genealogie-side-folders` | local | app-side-folders.js | oui |  |
| `genealogie-site-defaults-applied` | local | app.js | non | marque « défauts du site déjà appliqués » |
| `genealogie-site-familial` | local | heritage-comptes-famille.js | oui |  |
| `genealogie-site-web` | local | heritage-site-web.js | oui |  |
| `genealogie-slideshow-kind` | local | heritage-slideshow.js | oui |  |
| `genealogie-sommaire-niveau` | local | heritage-recueil-sommaire.js | oui |  |
| `genealogie-sommaire-plie` | local | heritage-recueil-sommaire.js | oui |  |
| `genealogie-sosa-map` | local | app.js (+1) | non | calcul du Sosa de cette base |
| `genealogie-sosa-multi` | local | app.js | non | fiches du Sosa multiple |
| `genealogie-sosa-off` | local | app.js | non | des fiches, pages ou suggestions précises de cette base |
| `genealogie-sosa-root` | local | app.js (+3) | non | de cujus : une fiche précise |
| `genealogie-sosa-root-name` | local | app-listes.js (+1) | non | de cujus : une fiche précise |
| `genealogie-sources-gratuites` | local | app-archives-en-ligne-core.js (+1) | oui |  |
| `genealogie-sources-ouvertes-2-canton` | local | heritage-archives-en-ligne.js | oui |  |
| `genealogie-sources-ouvertes-3-sites` | local | heritage-sources-ouvertes-3.js | oui |  |
| `genealogie-sources-ouvertes-4-sites` | local | heritage-diagram-cartes-plus.js (+1) | oui |  |
| `genealogie-sources-ouvertes-5-sites` | local | heritage-sources-ouvertes-5.js | oui |  |
| `genealogie-sources-ouvertes-6-sites` | local | heritage-sources-ouvertes-6.js | oui |  |
| `genealogie-sources-ouvertes-7-sites` | local | heritage-sources-ouvertes-7.js | oui |  |
| `genealogie-stats-colors` | local | app.js | oui |  |
| `genealogie-stats-colors-presets` | local | app.js | oui |  |
| `genealogie-stats-defaults` | local | app.js | oui |  |
| `genealogie-story-options` | local | heritage-slideshow.js | oui |  |
| `genealogie-succ-bell` | local | heritage-successoral-outils.js | oui |  |
| `genealogie-succ-famtab` | local | heritage-successoral.js | oui |  |
| `genealogie-succ-filter` | local | heritage-successoral-dossiers.js | oui |  |
| `genealogie-succ-me` | local | heritage-successoral-audit.js | non | des fiches, pages ou suggestions précises de cette base |
| `genealogie-succ-npages` | local | heritage-successoral.js | oui |  |
| `genealogie-succ-people-view` | local | heritage-successoral-dossiers.js | oui |  |
| `genealogie-succ-tab` | local | heritage-successoral.js | oui |  |
| `genealogie-succ-view` | local | heritage-successoral-dossiers.js (+1) | oui |  |
| `genealogie-suivi-causes` | local | heritage-suivi-fiche.js | oui |  |
| `genealogie-suivi-hint-closed` | local | heritage-suivi.js | non | « déjà montré » (un ensemble ne les fait pas revenir) |
| `genealogie-suivi-map` | local | heritage-suivi.js | oui |  |
| `genealogie-suivi-seuils` | local | heritage-suivi-audit.js | oui |  |
| `genealogie-tab-web-notes` | local | heritage-tabs.js | oui |  |
| `genealogie-tableur` | local | heritage-tableur.js | oui |  |
| `genealogie-tableur-actions` | local | heritage-tableur-outils.js | oui |  |
| `genealogie-tableur-base` | local | heritage-tableur-base.js | oui |  |
| `genealogie-telech-b` | local | heritage-telech-b-village.js | oui |  |
| `genealogie-telech-c` | local | heritage-telech-c.js | oui |  |
| `genealogie-telech-c-tables` | local | heritage-telech-c.js | oui |  |
| `genealogie-telech-d` | local | heritage-telech-d-traduire.js (+1) | oui |  |
| `genealogie-terre-mots` | local | heritage-terre-mots.js | oui |  |
| `genealogie-terre-quotidien` | local | heritage-terre-quotidien.js | oui |  |
| `genealogie-terroir` | local | heritage-terroir.js | oui |  |
| `genealogie-tile-cat-order` | local | app.js | oui |  |
| `genealogie-tile-custom-cats` | local | app.js | oui |  |
| `genealogie-tile-hidden` | local | app.js (+1) | oui |  |
| `genealogie-tile-hidden-cats` | local | app.js | oui |  |
| `genealogie-tile-items-*` | local | app.js | oui |  |
| `genealogie-tile-user` | local | app.js (+1) | oui |  |
| `genealogie-toggles` | local | app-designs.js | oui |  |
| `genealogie-toolbar-defs` | local | heritage-keynote.js (+1) | non | noté par l’app (boutons connus des éditeurs), refait tout seul |
| `genealogie-toolbar-sets` | local | heritage-studio-av.js (+2) | oui |  |
| `genealogie-toolbars` | local | heritage-studio-av.js (+1) | oui |  |
| `genealogie-topbar-buttons` | local | app-apparence.js | oui |  |
| `genealogie-tout-sur` | local | heritage-tout-sur.js | oui |  |
| `genealogie-tout-sur-outil` | local | heritage-tout-sur.js | oui |  |
| `genealogie-trade-tab` | local | heritage-metiers-anciens.js | oui |  |
| `genealogie-trades-list` | local | heritage-metiers-anciens.js | oui |  |
| `genealogie-traitement-texte` | local | heritage-traitement-texte-outils.js (+1) | oui |  |
| `genealogie-traitement-texte-glyphes` | local | heritage-traitement-texte-outils.js | oui |  |
| `genealogie-traitement-texte-reglages` | local | heritage-traitement-texte-outils.js | oui |  |
| `genealogie-traitements-lot` | local | heritage-lot.js | oui |  |
| `genealogie-trajets` | local | heritage-cartes-outils.js | oui |  |
| `genealogie-transcribe-bar` | local | heritage-transcribe-view.js | oui |  |
| `genealogie-transcribe-modele` | local | heritage-transcribe-gabarit.js | oui |  |
| `genealogie-transcribe-pages-mode` | local | heritage-transcribe-pages.js | oui |  |
| `genealogie-transcribe-useenh` | local | heritage-transcribe.js | oui |  |
| `genealogie-transcription-layout` | local | app.js | oui |  |
| `genealogie-tree-card-fields` | local | app.js | oui |  |
| `genealogie-tree-pets` | local | app-graphiques.js | oui |  |
| `genealogie-tree-solidite` | local | heritage-preuve.js | oui |  |
| `genealogie-tresors-favs` | local | heritage-tresors.js | oui |  |
| `genealogie-tresors-recent` | local | heritage-tresors.js | oui |  |
| `genealogie-trouve-prefs` | local | heritage-transcribe-trouve.js | oui |  |
| `genealogie-tx-abrev` | local | heritage-transcribe-view.js | oui |  |
| `genealogie-tx-aide-ia-place` | local | heritage-transcribe-view.js | oui |  |
| `genealogie-tx-apercu-lignes` | local | heritage-transcribe-contexte.js | oui |  |
| `genealogie-tx-car-favoris` | local | heritage-transcribe.js | oui |  |
| `genealogie-tx-cmp-draft-` | local | heritage-transcribe-compare.js | non | brouillon |
| `genealogie-tx-cmp-ma-lecture` | local | heritage-transcribe-compare.js | oui |  |
| `genealogie-tx-cmp-mode` | local | heritage-transcribe-compare.js | oui |  |
| `genealogie-tx-comparer-image` | local | heritage-transcribe-compare.js | oui |  |
| `genealogie-tx-deep-limit` | local | heritage-transcribe-acte.js | oui |  |
| `genealogie-tx-deep-lines` | local | app-lignes-alignement.js | oui |  |
| `genealogie-tx-deep-model` | local | heritage-assistant-ia.js (+2) | oui |  |
| `genealogie-tx-garder-lectures` | local | heritage-transcribe-compare.js | oui |  |
| `genealogie-tx-lang` | local | heritage-transcribe.js | oui |  |
| `genealogie-tx-linenos` | local | heritage-transcribe-view.js | oui |  |
| `genealogie-tx-lire-choix` | local | heritage-transcribe.js | oui |  |
| `genealogie-tx-mains` | local | heritage-atelier-suivant.js | oui |  |
| `genealogie-tx-montants` | local | heritage-transcribe-view.js | oui |  |
| `genealogie-tx-pages-pliees-` | local | heritage-transcribe-blocs.js | non | pages repliées d’UN acte |
| `genealogie-tx-regle` | local | heritage-atelier-regle.js | oui |  |
| `genealogie-tx-regle-force` | local | heritage-atelier-regle.js | oui |  |
| `genealogie-tx-relecture` | local | heritage-transcribe-view.js | oui |  |
| `genealogie-tx-search-near` | local | heritage-atelier-recherche.js | oui |  |
| `genealogie-tx-suivre` | local | heritage-transcribe.js | oui |  |
| `genealogie-tx-train-engine` | local | heritage-atelier-entrainer.js | oui |  |
| `genealogie-tx-trouve-mode` | local | heritage-transcribe-view.js | oui |  |
| `genealogie-tx-trouve-ouvert` | local | heritage-transcribe.js | oui |  |
| `genealogie-tx-zone-opacity` | local | heritage-transcribe.js | oui |  |
| `genealogie-ui-sections` | local | app-apparence.js (+2) | oui |  |
| `genealogie-usage` | local | app-apparence.js (+5) | oui |  |
| `genealogie-vector-map-palette` | local | heritage-vector-map.js | oui |  |
| `genealogie-veille-deces` | local | heritage-veille-deces.js | oui |  |
| `genealogie-verrou-bouton` | local | app-apparence.js | oui |  |
| `genealogie-village-layout` | local | heritage-more.js | oui |  |
| `genealogie-village-maps` | local | heritage-more.js | oui |  |
| `genealogie-visite-guidee` | local | app-visite.js | oui |  |
| `genealogie-web-search` | local | app.js | oui |  |
| `genealogie-web-search-*` | local | app.js | oui |  |
| `genealogie-web-search-custom` | local | app-archives-en-ligne-core.js (+2) | oui |  |
| `genealogie-web-search-custom-presets` | local | heritage-sources-ouvertes-5.js | oui |  |
| `genealogie-web-search-middle` | local | app.js | oui |  |
| `genealogie-wikidata-autour` | local | heritage-wikidata-autour.js | oui |  |
| `genealogie-world-block` | local | heritage-monde.js | oui |  |
| `genealogie-world-list` | local | heritage-monde.js | oui |  |
| `lcnda_puzzle-base-v2` | local | app-puzzle.js | non | les parties de puzzle : des données |
| `lcnda_puzzle-list-v2:` | local | app-puzzle.js | non | les parties de puzzle : des données |
| `lcnda_puzzle-pending-v2:` | local | app-puzzle.js | non | puzzle en cours : passager |
| `lcnda_puzzle-prefs-v1` | local | app-puzzle.js | non | ancien nom des réglages du puzzle, repris sous « lcnda-puzzle-prefs » (app-puzzle.js) |
| `lcnda-7familles` | local | heritage-tresors-jeux.js | oui |  |
| `lcnda-a11y-tab` | session | app-mode-simple.js | non | sessionStorage : passager (cet onglet) |
| `lcnda-a11y-tab` | local | app-mode-simple.js | oui |  |
| `lcnda-abc-*` | local | heritage-alphabets.js | oui |  |
| `lcnda-act-relation` | local | heritage-more.js | oui |  |
| `lcnda-act-requester` | local | heritage-more.js | non | ton nom de signature : privé |
| `lcnda-acts-all` | local | heritage-more.js | oui |  |
| `lcnda-acts-kind` | local | heritage-more.js | oui |  |
| `lcnda-ael-reminded` | local | heritage-arbres-en-ligne.js | non | « déjà dit » (date) |
| `lcnda-ael-site` | local | heritage-arbres-en-ligne.js | oui |  |
| `lcnda-aide-lecture-lang` | local | heritage-lecture-autrefois.js | oui |  |
| `lcnda-aide-lecture-scores` | local | heritage-lecture-autrefois.js | non | scores |
| `lcnda-aide-lecture-tab` | local | heritage-lecture-autrefois.js | oui |  |
| `lcnda-ambiances` | local | heritage-tresors-merveilles.js | oui |  |
| `lcnda-archives-dispo` | local | heritage-archives-dispo.js | oui |  |
| `lcnda-autrefois-region` | local | heritage-lecture-autrefois.js (+1) | oui |  |
| `lcnda-autrefois-tab` | local | heritage-lecture-autrefois.js | oui |  |
| `lcnda-bp-tab` | session | heritage-board-kit.js (+1) | non | sessionStorage : passager (cet onglet) |
| `lcnda-bunker` | local | heritage-bunker.js | non | les parties et coloriages : des données |
| `lcnda-bunker-records` | local | heritage-bunker.js | non | scores et records : des données |
| `lcnda-cadastre-layer` | local | heritage-cadastre.js | oui |  |
| `lcnda-calculette-courbes` | local | heritage-calculette.js | oui |  |
| `lcnda-calculette-memoire` | local | heritage-calculette.js | non | les calculs faits : des données |
| `lcnda-calculette-ouverte` | local | heritage-calculette.js | oui |  |
| `lcnda-calculette-place` | local | heritage-calculette.js | oui |  |
| `lcnda-calculette-ruban` | local | heritage-calculette.js | non | les calculs faits : des données |
| `lcnda-calculette-widget` | local | heritage-calculette.js | non | les calculs faits : des données |
| `lcnda-calmore-*` | local | heritage-calendar-more.js | oui |  |
| `lcnda-cartes-couches` | local | heritage-cartes-outils.js | oui |  |
| `lcnda-ce-later` | session | heritage-complements.js | non | sessionStorage : passager (cet onglet) |
| `lcnda-cite-style` | local | heritage-citations.js | oui |  |
| `lcnda-coloriage` | local | heritage-tresors-jeux.js | non | les parties et coloriages : des données |
| `lcnda-controle-filtres` | local | heritage-controle.js | oui |  |
| `lcnda-cousinade-tab` | local | heritage-cousinade.js | oui |  |
| `lcnda-creations-group:*` | local | heritage-creations.js | oui |  |
| `lcnda-decennale-gabarits` | local | heritage-decennales.js | oui |  |
| `lcnda-decor-tree` | local | heritage-vector-tree.js | oui |  |
| `lcnda-decor-tree-card` | local | heritage-vector-tree.js | oui |  |
| `lcnda-designs-open-v2` | local | app-designs.js | oui |  |
| `lcnda-designs-prev-v2` | local | app-designs.js | oui |  |
| `lcnda-designs-ui-v2` | local | app-designs.js | non | copie des designs au choix pour index.php : refaite à partir de « genealogie-designs » |
| `lcnda-faces-job` | local | heritage-faces.js | non | tâche en cours |
| `lcnda-faces-speed` | local | heritage-faces.js | oui |  |
| `lcnda-family-share` | local | heritage-partage.js | oui |  |
| `lcnda-find` | local | app.js | oui |  |
| `lcnda-find-current` | local | app.js | oui |  |
| `lcnda-fond-ecran` | local | heritage-tresors-ateliers.js | oui |  |
| `lcnda-gazette-style` | local | heritage-tresors-ateliers.js | oui |  |
| `lcnda-graphs-ping` | local | heritage-widgets.js | non | signal entre onglets |
| `lcnda-i18n-banner-closed` | local | app-i18n.js | non | « déjà montré » (bandeau de langue) |
| `lcnda-imgdup-mode` | local | heritage-images-similaires.js | oui |  |
| `lcnda-imgdup-sens` | local | heritage-images-similaires.js | oui |  |
| `lcnda-insee-checked` | local | app.js | non | date |
| `lcnda-insee-told` | local | app.js | non | « déjà dit » |
| `lcnda-jeux-dos-image` | local | app-jeu-famille.js | non | l'image du dos des cartes : lourde (comme la photo du fond) |
| `lcnda-jeux-famille-prefs-v1` | local | app-jeu-famille.js | oui |  |
| `lcnda-jeux-famille-v1` | local | app-jeu-famille.js | non | les parties et coloriages : des données |
| `lcnda-jeux-plateau-records` | local | app-jeu-plateau.js | non | scores et records : des données |
| `lcnda-jeux-tri-plies` | local | app-jeu.js | oui |  |
| `lcnda-journal-erreurs` | local | app-journal.js | non | journal des erreurs |
| `lcnda-laby-games-v1` | local | app-labyrinthe.js | non | les parties et coloriages : des données |
| `lcnda-laby-prefs-v1` | local | app-labyrinthe.js | oui |  |
| `lcnda-laby-presets-v1` | local | app-labyrinthe.js | oui |  |
| `lcnda-langue` | local | app-i18n.js | non | la langue de CET ordinateur (avec le cookie lcnda_lang lu par le serveur) ; un ensemble reçu d'un cousin ne la change pas |
| `lcnda-lap-online-ok` | session | heritage-lieux-a-placer.js | non | sessionStorage : passager (cet onglet) |
| `lcnda-layout-cite-style` | local | heritage-layout.js | oui |  |
| `lcnda-ld:*` | local | app-listes-donnees.js | oui |  |
| `lcnda-lieux-a-placer` | local | heritage-lieux-a-placer.js | oui |  |
| `lcnda-listbar:` | local | app-ui.js (+1) | oui |  |
| `lcnda-listbar:listes:*` | local | app-listes.js | oui |  |
| `lcnda-lot-derniere` | local | heritage-lot.js | oui |  |
| `lcnda-map-compare` | local | heritage-cartes-plus.js | oui |  |
| `lcnda-map-frontieres` | local | heritage-cartes-plus.js | oui |  |
| `lcnda-map-place-photos` | local | heritage-place-photos.js | oui |  |
| `lcnda-map-postcards` | local | heritage-postcards.js | oui |  |
| `lcnda-media-picker-recent` | local | app-media-picker.js | non | derniers médias de cette base |
| `lcnda-media-picker-size` | local | app-media-picker.js | oui |  |
| `lcnda-mes-cartes-cur` | local | heritage-cartes-perso.js | non | la carte ouverte (de cette base) |
| `lcnda-mes-cartes-panel` | local | heritage-cartes-perso.js | oui |  |
| `lcnda-mises-a-jour` | local | app-mises-a-jour.js | non | « Vérifier les mises à jour » : réglage de l'app installée sur cet ordinateur (Electron) |
| `lcnda-mode-simple-device` | local | app-mode-simple.js | non | le mode simple « propre à cet appareil » : jamais ailleurs, par définition |
| `lcnda-mode-simple-local` | local | app-apparence.js (+1) | non | le mode simple « propre à cet appareil » : jamais ailleurs, par définition |
| `lcnda-mode-simple-open` | local | app-mode-simple.js | oui |  |
| `lcnda-mt-rush-sort` | local | heritage-studio-av.js | oui |  |
| `lcnda-museum-voice-rate` | local | museum-viewer.js | oui |  |
| `lcnda-patiences-records` | local | app-jeu-patience.js | non | scores et records : des données |
| `lcnda-photomaps-current` | local | heritage-photomaps.js | non | la carte ouverte (de cette base) |
| `lcnda-photomaps-hidden` | local | heritage-photomaps.js | oui |  |
| `lcnda-photomaps-pills` | local | heritage-photomaps.js | oui |  |
| `lcnda-photomaps-shape` | local | heritage-photomaps.js | oui |  |
| `lcnda-photomaps-time` | local | heritage-photomaps.js | oui |  |
| `lcnda-photomaps-track-all` | local | heritage-photomaps.js | oui |  |
| `lcnda-photomaps-type` | local | heritage-photomaps.js | oui |  |
| `lcnda-photomaps-view:*` | local | heritage-photomaps.js | oui |  |
| `lcnda-premier-choice` | local | app-premier.js | non | premier lancement, « déjà montré », dates |
| `lcnda-premier-go` | session | app-premier.js | non | sessionStorage : passager (cet onglet) |
| `lcnda-premier-go` | local | app-premier.js | non | premier lancement, « déjà montré », dates |
| `lcnda-puzzle-prefs` | local | app-puzzle.js | oui |  |
| `lcnda-reglages-*` | local | heritage-vector.js | oui |  |
| `lcnda-reglages-annuler` | session | heritage-studio.js | non | sessionStorage : passager (cet onglet) |
| `lcnda-reglages-annuler` | local | heritage-studio.js | oui |  |
| `lcnda-research-forms` | local | app-recherche-outils.js | non | les formulaires de recherche remplis : des brouillons |
| `lcnda-roles-view:*` | local | heritage-scene-actor.js | non | vue d’UN projet |
| `lcnda-sa-warned` | local | heritage-sauvegarde.js | non | « déjà dit » (date) |
| `lcnda-saved-search-notified` | session | heritage.js | non | sessionStorage : passager (cet onglet) |
| `lcnda-scene-view:*` | local | heritage-scene-list.js | non | vue d’UN projet |
| `lcnda-sd-warned` | local | heritage-sauvegarde.js | non | « déjà dit » (date) |
| `lcnda-shape-one` | local | app-portraits.js | non | « déjà montré » |
| `lcnda-sheet-edit-tab` | local | app-sections.js | oui |  |
| `lcnda-sheet-sections-open` | local | app-sections.js | oui |  |
| `lcnda-sheet-tab` | local | app-sections.js | oui |  |
| `lcnda-side-order` | local | app-reordonner.js | oui |  |
| `lcnda-side-panel-height` | local | app.js | oui |  |
| `lcnda-side-panel-orientation` | local | app.js | oui |  |
| `lcnda-side-panel-width` | local | app.js | oui |  |
| `lcnda-signaler` | local | app-signaler.js | non | une adresse e-mail : privée |
| `lcnda-sort:*` | local | app-ui.js | oui |  |
| `lcnda-sort:prenoms-transmis` | local | heritage-prenoms-france.js | oui |  |
| `lcnda-succ-bell-told` | session | heritage-successoral-outils.js | non | sessionStorage : passager (cet onglet) |
| `lcnda-succ-chrono` | local | app-chrono-recherche.js (+1) | non | le chronomètre des Successions en marche |
| `lcnda-succ-chrono-act` | local | heritage-successoral-outils.js | non | le chronomètre des Successions en marche |
| `lcnda-succ-pending` | session | heritage-successoral-dossiers.js | non | sessionStorage : passager (cet onglet) |
| `lcnda-succ-share` | session | heritage-successoral-plus2.js | non | sessionStorage : passager (cet onglet) |
| `lcnda-succ-share` | local | heritage-successoral-plus2.js | oui |  |
| `lcnda-suffrage-who` | local | heritage-voters.js | oui |  |
| `lcnda-terrain-n` | local | app-terrain.js | non | compte (cache) |
| `lcnda-tr-era` | local | heritage-tresors-outils.js | oui |  |
| `lcnda-tr-mystery` | local | heritage-tresors-histoires.js | non | scores |
| `lcnda-trajets-jour` | local | heritage-cartes-outils.js | oui |  |
| `lcnda-trajets-onglet` | local | heritage-cartes-outils.js | oui |  |
| `lcnda-tresors-order` | local | heritage-tresors.js | oui |  |
| `lcnda-vault-owner` | local | heritage-more.js | non | ton nom : privé |
| `lcnda-vault-reminded` | session | heritage-more.js | non | sessionStorage : passager (cet onglet) |
| `lcnda-vd-told` | local | heritage-veille-deces.js | non | « déjà dit » |
| `lcnda-view:` | local | app-ui.js | oui |  |
| `lcnda-vx-alignto` | local | heritage-vector.js | oui |  |
| `lcnda-vx-folds` | local | heritage-vector.js | oui |  |
| `lcnda-vx-orncol` | local | heritage-vector.js | oui |  |
| `lcnda-vx-panel-w` | local | heritage-vector.js | oui |  |
| `lcnda-vx-recent-colors` | local | heritage-vector.js | oui |  |
| `lcnda-vx-smart` | local | heritage-vector.js | oui |  |
| `theme` | local | heritage-site-web-cssjs-ref.js | non | pas une clé de l’app : un exemple de code dans l’aide-mémoire JavaScript du site web (heritage-site-web-cssjs-ref.js) |
