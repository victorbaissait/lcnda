# LCNDA — règles de l’interface

Application de généalogie en français (PHP 8 + SQLite, JavaScript sans framework). L'utilisateur n'est pas développeur : textes de l'interface en français simple, tutoiement.

## Choix d'une personne : UN SEUL modèle, partout (validé par l'utilisateur — très important)

Chaque fois qu'un outil (existant ou nouveau) demande de choisir une ou plusieurs personnes, il utilise le modèle unique validé, jamais un champ fait à la main :

- Maquettes validées : `docs/design/choix-personne.html` (une personne / plusieurs) et `docs/design/choix-personnes-roles.html` (personne principale + principales + secondaires).
- **Au repos** : loupe 🔍, texte d'aide « Nom, prénom… (2 lettres suffisent) ».
- **Liste** : « N fiches trouvées » ; chaque ligne = rond d'initiales (bleu homme, rose femme, gris inconnu, orange 🐾 animal ; la photo de la fiche si elle existe), Prénom NOM (nom en capitales, lettres tapées surlignées), « ° date lieu · † date lieu », indice si homonymes (« fils de… », « épouse de… »), badge Sosa à droite. Clavier ↑ ↓ Entrée Échap. En bas « ＋ Créer la fiche « … » » et, seulement là où un nom libre a du sens, « ✎ Garder le texte sans fiche ». Rien trouvé : « Aucune fiche pour « … ». Vérifie l'orthographe, ou : ＋ Créer la fiche ».
- **Choisie** : une pastille (initiales/photo, nom, années, Sosa) avec « ↗ Fiche » et « × » pour changer. Plusieurs personnes : des pastilles + une case « ＋ Ajouter une personne… ».
- **Avec des rôles** : « ⭐ Personne principale » (une seule, grande carte avec « ★ PRINCIPALE », « ↗ Fiche », « Changer » — l'ancienne descend dans les principales), zone bleue « ★ Autres personnes principales », zone grise « ☆ Personnes secondaires » ; sur chaque pastille un rôle facultatif (témoin, parrain, marraine, voisin, employeur, officier, déclarant… ou mot libre), ★/☆ pour changer de zone (ou glisser), × pour retirer ; une personne sans fiche = pastille grise « ? ». À la lecture : la principale en grand, puis lignes « ★ Principales » (pastilles bleues) et « ☆ Secondaires » (pastilles grises), rôle à côté du nom, clic = ouvrir la fiche.

## Choisir un lieu, et toute autre chose : même modèle (validé)

> **STANDARD OBLIGATOIRE** (validé par l'utilisateur) : personnes, lieux et tout le reste (sources, médias, enquêtes, battues, étiquettes, maisons, revues, employeurs, recensements, événements…) se choisissent **toujours** avec ce même menu de recherche. Tout nouvel outil qui fait choisir quelque chose dans la base l'utilise tel quel, sans variante ni champ fait à la main.

Maquette : `docs/design/choix-lieux-et-autres.html`. Même champ, même liste, même pastille, mêmes touches que pour les personnes ; seuls le symbole de gauche et la ligne grise changent.

- **Lieux** : icône 📍 dans le champ. Liste rangée en groupes : « Dans ta généalogie » (repère bleu plein + badge « N événements »), « Communes de France (pas encore dans ta base) » (repère blanc + badge « Commune »), puis « Villes du monde » (repère blanc + pays). Chaque ligne : nom (lettres tapées surlignées), « Département (n°) · Région · Pays » ou « Région · Pays », population, ancien nom si connu.
  - **Jamais bloqué par les homonymes** : pas de limite fixe — la liste défile et charge la suite en descendant ; on peut préciser en tapant le département, son numéro, la région ou le pays après le nom (« saint-martin gers », « saint-martin 32 », « springfield usa ») ; les plus peuplées d'abord à pertinence égale.
  - En bas : « ＋ Créer le lieu « … » » et « 🗺 Choisir sur la carte ». Rien trouvé : « Aucun lieu pour « … ». Vérifie l'orthographe, ou : ».
  - Choisi : pastille (repère, nom, département) avec « ↗ Lieu », « 🗺 » (sur la carte) et « × ». Plusieurs lieux : pastilles + « ＋ Ajouter un lieu… ».
  - Un lieu « pas encore dans ta base » n'y entre qu'une fois choisi.
- **Tout le reste** (sources 📚, médias en vignette, enquêtes 🔍, battues, étiquettes en pastille de couleur, maisons en vignette, revues, employeurs, recensements, événements…) : symbole ou vignette à gauche, nom, ligne grise utile, badge à droite ; choisi → même pastille avec « ↗ Ouvrir » et « × ».
- **Recherche mélangée** (« une personne, une enquête, un lieu… ») : filtres en haut avec le nombre trouvé (« Tout (9) », « 👤 Personnes (2) »…), résultats rangés par sorte, chaque ligne au format de sa sorte ; Tab passe d'un filtre à l'autre.
- **Ne changent pas** : les petits menus à choix fixes (Portrait / Paysage, Style, État…) restent des menus déroulants simples.

## Choisir une image (ou un son, une vidéo) dans la base : fenêtre unique en vignettes (validé)

> **STANDARD OBLIGATOIRE** (validé par l'utilisateur) : partout où l'on prend une image, un son ou une vidéo de l'app (faire-part, mise en page, retouche, diaporama, montage, tableaux, maison, sceaux, musée, tableau de bord…), c'est cette fenêtre, jamais une galerie faite à la main.

Maquette : `docs/design/choix-image.html`.
- **En haut** : case de recherche au style du menu de choix (titre, cote, personnes, lieu, année) + filtres avec le nombre trouvé : « Tout (n) », « 📷 Photos (n) », « 📄 Documents (n) », la personne de l'outil (pastille « 👤 Nom × », mise d'office si l'outil en a une), « 🕘 Récentes », « ⭐ Portraits » ; taille des vignettes (grandes / petites / liste), retenue d'une fois sur l'autre.
- **Vignettes** : image, étiquette de sorte (PHOTO, ACTE, CARTE…), titre, « année · lieu » ou cote. Une seule image : clic = choisie, Entrée = valider. Plusieurs : case ✓ sur chaque vignette, compteur « N images · N choisies », bouton « Utiliser ces N images ». Clavier ↑ ↓ ← →, Espace pour cocher, Entrée.
- **Aperçu à droite** : l'image en grand, titre, sorte · année · lieu, taille en pixels et « assez grande pour imprimer en A5 » (ou trop petite), cote, pastilles des personnes, « ↗ Ouvrir le média ».
- **En bas** : zone « 📁 Glisse une image ici, colle-la (⌘V) ou importe-la depuis l'ordinateur » ; boutons « 📁 Importer… » et « 📋 Coller » à gauche ; « Annuler » et le bouton principal à droite. Une image importée entre dans les médias et se coche.
- **Dans un champ** : la même pastille que le menu de choix (petite vignette, titre, année, « ↗ Ouvrir », « 🖼 Changer », « × ») ; « Changer » rouvre la fenêtre filtrée sur la personne de l'outil.
- **Sons et vidéos** : même fenêtre, vignette avec ▶ et la durée.

## Champs et petits éléments communs (C1 à C8, validés)

Maquette : `docs/design/champs-communs.html`. Un seul composant pour chacun, partout :
- **C1 Cases de recherche / filtres de listes** : comme le menu de choix — loupe à gauche, « Chercher… » + exemples, × pour vider, Échap vide aussi, touche « / » pour aller dans la case ; plus de bouton ⌕.
- **C2 Couleur — le standard pour choisir une couleur, partout dans l'app** (validé) : pastille + nom/code, puis une seule fenêtre, la même partout (texte, formes, tableaux, réglages, retouche, montage…), jamais la fenêtre du système :
  1. **Couleurs de l'app**, puis **Récentes** (partagées), d'un clic ;
  2. **Choisir une autre couleur** : bandeau « nouvelle » / « actuelle », puis 4 onglets — **Nuances** (carré clair/foncé × terne/vif et barre des teintes, comme Photoshop), **TLS** (Teinte, Lumière, Saturation), **RVB** (Rouge, Vert, Bleu, 0 à 255), **CMJN** (Cyan, Magenta, Jaune, Noir, en %) ; les fonds des curseurs montrent la couleur obtenue ; l'onglet choisi est retenu ;
  3. **💧 Pipette** (n'importe où dans la fenêtre) et le **code #** (à taper ou coller), « Aucune » (hachuré) et la transparence quand ça a un sens ;
  4. **Annuler** (remet la couleur d'avant) / **OK**.
  Style : celui de l'app — cases carrées à trait noir, cadre noir et ombre bleue ; tout est carré (repère du carré de nuances, poignées des curseurs). La fenêtre se replace pour rester dans l'écran. Dans la retouche, les deux carrés (devant / derrière) ouvrent cette fenêtre ; ils sont noir et blanc au départ, X les intervertit, D les remet.
- **C3 Curseurs** : libellé · curseur · case chiffrée tapable avec unité (%, mm, °, px, ppp) ; double-clic = valeur de départ.
- **Largeurs des blocs et sections** (validé) : toujours proposées dans cet ordre, partout (fiches, pages de profils et d'artiste, Fiches, onglets, widgets, tableau de bord, village, livrets) : **1 (toute la ligne), ½, ⅓, ¼, ⅔, ¾** — en boutons ou en menu, même ordre.
- **C4 Dates** : texte libre comme dans un acte (« 7 mai 1925 », « 08/12/1960 », « vers 1784 », « avant 1800 », « entre 1880 et 1885 », « an II ») ; dessous « ✓ Compris : … » ou « ⚠️ date impossible » ; 📅 facultatif.
- **C5 Onglets** : deux modèles seulement — onglets de page (segmenté, bleu = actif) et filtres (pastilles avec le nombre trouvé, noir = actif) ; classe active unique `is-active`.
- **C6 Listes** : barre « N éléments · Trier : [menu] » (plus récents, plus anciens, A → Z, Z → A + choix propres) et « Voir les N suivants ↓ » en bas.
- **C7 Chargement et messages** : un seul rond qui tourne + texte (ou squelettes gris pour une liste) ; messages dans la page en 4 sortes : ℹ️ info (bleu), ⚠️ attention (jaune), ⛔ erreur (rouge), ✓ réussi (vert).
- **C8 Aide et petits boutons** : bulle « ? » (une phrase + « En savoir plus (FAQ) → ») ; 3 tailles de boutons icône (32, 26, outil) ; × pour fermer partout, ✕/🗑 pour retirer ; un seul aspect désactivé (opacité .45, curseur interdit) ; interrupteur pour on/off.

## Éditeurs (E1 à E5, validés)

Maquette : `docs/design/editeurs.html`.
- **E1 Barre du haut** : icône · nom tapable · menus (Fichier, Édition, Objet, Affichage…) · ↶ ↷ · … · « ✓ Enregistré » · ⚙️ Personnaliser · ⤓ Exporter ▾ (un seul menu) · 💾 Enregistrer (bleu) · ⛶ · ×. « ✓ Enregistré » toujours dans cette zone, sans toast.
- **E2 Panneau de droite** : sections repliables dans le même ordre (Position et taille, Couleur, Texte, Effets…), mêmes champs (C2, C3), sections ouvertes retenues.
- **E3 Export** : une seule fenêtre — PDF, PNG, JPG, SVG, Imprimer, Fichier de l'outil ; qualité ; fond perdu et traits de coupe ; nom du fichier ; « Ranger aussi une copie dans les médias » ; aperçu ; Annuler / « ⤓ Exporter en … ».
- **E4 Déposer un fichier** : partout la même zone « 📁 Glisse ici…, colle-le (⌘V) ou choisis-le » qui s'allume en bleu au survol ; le fichier entre dans les médias.
- **E5 Police** : une seule liste — recherche, récentes en haut, polices de l'app et de l'ordinateur, chaque nom écrit dans sa police avec le texte choisi.

## Messages après une action et barre des listes (H7 et H10, validés)

Maquette : `docs/design/messages-et-listes.html`.
- **H7 Défaire au lieu de demander avant** : tous les messages après une action s'affichent au même endroit (en bas à gauche), pendant la même durée (6 s, avec une barre bleue du temps qui reste, en pause quand la souris est dessus). Quatre sortes : action faite avec « ↶ Annuler » (noir), « ✓ Enregistré » (vert), « ↶ Annulé : … » avec « ↷ Rétablir » (noir), erreur avec « Réessayer » (rouge). Pour ce qu'on peut défaire (une note, un objet, une ligne…), plus de question avant : on supprime et on propose « ↶ Annuler ». La fenêtre « Es-tu sûr ? » (`confirmBox`) reste seulement pour ce qui ne se défait pas (une fiche entière avec tout ce qui s'y rattache, vider la corbeille, écraser une base).
- **H10 Même barre au-dessus de toutes les listes**, toujours dans cet ordre : 🔍 Chercher (C1) · Filtrer ▾ (avec le nombre de filtres actifs en pastille bleue) · [Liste | Fiches] · Trier : … ▾ (C6). Le menu Filtrer est rangé par rubriques (Genre, Lieu de naissance avec le menu de choix de lieu, Étiquette…). Les filtres actifs s'affichent sous la barre en pastilles bleues « Femmes × » qu'on retire d'un clic, plus « Tout effacer ». Chaque liste retient ses réglages (recherche, filtres, tri, affichage).

## Colonne de gauche (validé)

- **Pas de colonne de gauche → rien à gauche.** Un écran qui n'a pas sa propre colonne de gauche (✨ Trésors, par exemple) n'en affiche aucune : la page prend toute la largeur, sans bouton « Liste → ». Jamais la colonne de l'écran d'avant (avant, les Réglages restaient affichés dans Trésors). Ça vaut pour tout écran, présent ou à venir : `renderSidebar` (app.js) ne garde la colonne que pour les onglets de `SIDEBAR_MODULES` ; un nouvel onglet qui a une colonne s'y ajoute, sinon il n'a rien à gauche (classe `no-side` sur `#app`).

## Artistes, œuvres et catalogue raisonné (validé)

Maquette : `docs/design/artistes.html` (fiches A à H). Un seul moteur de « types » configurables : chaque sorte (disque, album, morceau, enregistrement, exemplaire, livre, œuvre d'art, exposition, film…) est une définition (groupes, champs typés, champs affichés par défaut, liens possibles).
- **Musique** : Morceau (l'œuvre) → Enregistrements (prise, mixage, remaster, version, en public ; fichier son, crédits, « fait d'après ») → Pistes → Parutions (album, single, réédition, pressage : label, n° de catalogue, format, pays) → Exemplaire. Crédits à chaque niveau avec le menu de choix des personnes et un rôle.
- **Œuvre d'art** : numéros (catalogue raisonné, inventaires), technique, dimensions, signature, où elle est et propriétaire, attribution ; provenance (étapes, ventes, prix), expositions (fiches liées), bibliographie, états et restaurations, œuvres liées, tirages et fontes.
- **Partout** : « ＋ Ajouter un champ », liens lisibles des deux côtés (« Lié à »), images et sons par la fenêtre unique.
- **Modulable** : panneau « ⚙️ Champs affichés » (👁 afficher/masquer, ⠿ ou ↑↓ réordonner, champs perso, ↺) pour la fiche, la liste, les vignettes et l'export ; page de l'artiste à sections ordonnables ; tout dans les « 💾 Réglages enregistrés ».
- **Catalogue raisonné** : liste dédiée (barre H10) et, dans la mise en page, l'assistant « 📖 Nouveau catalogue raisonné » (et « 💿 Discographie ») : parties et champs de notice à choisir, notices dynamiques.

## Profils, types d'œuvres et blocs communs (validé)

Maquette : `docs/design/profils-et-oeuvres.html` (images I à AC). Même moteur de « types » configurables que les outils Artistes : tout est une fiche d'un type (définition : champs, groupes, liens, affichage par défaut), avec les mêmes listes (H10), le même panneau « ⚙️ Champs affichés », la même frise et la même carte.
- **Types d'œuvres** : 131 types en 12 familles (arts visuels, musique, scène, écrit, image animée et son, design et métiers d'art, espace et paysage, numérique et jeux, modélisme et loisirs, saveurs et senteurs, fiches qui relient, mes types). Chaînes : sculpture → fontes, pièce → mises en scène → représentations → tournées, série → saisons → épisodes, morceau → enregistrements → parutions.
- **Créer son type** : assistant en 5 étapes, 24 sortes de champs, champs repris d'autres types, liens, liste et vignettes.
- **Métiers d'art** : les 16 domaines et la liste officielle des métiers ; profil « artisan d'art » (apprentissage, compagnonnage, MOF, Maître d'art, EPV, atelier, poinçons).
- **Inventions et découvertes** : brevets par pays, prototypes, licences ; découvertes (espèce, comète, gène, site…), nommage, publications.
- **Profils à cocher** sur une fiche (artiste, artisan d'art, acteur/performeur, sportif, politique, scientifique, explorateur, militaire, agriculteur… et ses propres profils) : chaque profil ajoute ses sections ; une personne peut en avoir plusieurs ; page combinée avec frise colorée par profil.
- **Représentations façon setlist.fm** : concert/spectacle avec setlist (rappels, reprises, invités, notes), tournées, statistiques (titres les plus joués, première/dernière fois…).
- **Blocs pour toute personne** : « 📰 Dans les médias » (+ liste Revue de presse), « 🏆 Concours et récompenses » (décorations, championnats, concours insolites ; liste Palmarès), « 🎓 Diplômes et formation ».

**Mode d’emploi technique (à suivre pour tout nouvel outil) : `docs/PICKER.md`** — composant `assets/js/app-picker.js` (`pickerField`, `pickerView`, `openPicker`), styles `assets/css/picker.css`, recherche `lib/picker.php` (`picker_search`).

## Outils communs à utiliser (window.LCNDA_APP)

- `confirmBox(message, {title, okLabel, danger})` au lieu de `confirm()` ; `toast()` au lieu de `alert()` ; `askText()` pour une question.
- `plural(n, 'personne')` pour tout nombre variable (0 et 1 au singulier, jamais « (s) »).
- `emptyState({icon, text, hint, action})` / `empty(text, {...})` pour une liste vide, avec le bouton pour commencer.
- Mots : « Enregistrer » (pas « Sauvegarder », sauf la « Sauvegarde » de la base), « Supprimer », « Retirer » (détacher sans supprimer), « Modifier », « Annuler », « Fermer », « ＋ Ajouter… », « ＋ Nouveau… ».
- Bas des fenêtres (`.modal-actions`) : Supprimer à gauche, Annuler puis bouton principal à droite.
- Raccourci clavier d'un bouton : `data-shortcut="⌘S"` (affiché dans la bulle d'aide).
- Pas de `<input type=file>` nu : app-harmony.js le transforme en « 📁 Choisir un fichier ».

## Habitudes

- Après une modif d'un asset, monter son `?v=N` dans `index.php`.
- Nouveau CSS : avant le bloc « Mode sombre automatique » de `app.css` / `heritage.css`, puis `python3 scripts/build-dark-css.py`.
- Ajouter une entrée à la FAQ (`assets/js/heritage-more.js`) pour chaque nouveauté visible.
