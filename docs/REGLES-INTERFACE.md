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
- **C2 Couleur** : pastille + nom/code ; fenêtre avec couleurs de l'app, couleurs récentes (partagées), 💧 pipette, 🎨 autre couleur, code #, « Aucune » (hachuré) quand ça a un sens, transparence quand ça a un sens.
- **C3 Curseurs** : libellé · curseur · case chiffrée tapable avec unité (%, mm, °, px, ppp) ; double-clic = valeur de départ.
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
