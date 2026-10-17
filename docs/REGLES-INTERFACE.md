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
