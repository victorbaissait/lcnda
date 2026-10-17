# LCNDA — règles de l’interface

Application de généalogie en français (PHP 8 + SQLite, JavaScript sans framework). L'utilisateur n'est pas développeur : textes de l'interface en français simple, tutoiement.

## Choix d'une personne : UN SEUL modèle, partout (validé par l'utilisateur — très important)

Chaque fois qu'un outil (existant ou nouveau) demande de choisir une ou plusieurs personnes, il utilise le modèle unique validé, jamais un champ fait à la main :

- Maquettes validées : `docs/design/choix-personne.html` (une personne / plusieurs) et `docs/design/choix-personnes-roles.html` (personne principale + principales + secondaires).
- **Au repos** : loupe 🔍, texte d'aide « Nom, prénom… (2 lettres suffisent) ».
- **Liste** : « N fiches trouvées » ; chaque ligne = rond d'initiales (bleu homme, rose femme, gris inconnu, orange 🐾 animal ; la photo de la fiche si elle existe), Prénom NOM (nom en capitales, lettres tapées surlignées), « ° date lieu · † date lieu », indice si homonymes (« fils de… », « épouse de… »), badge Sosa à droite. Clavier ↑ ↓ Entrée Échap. En bas « ＋ Créer la fiche « … » » et, seulement là où un nom libre a du sens, « ✎ Garder le texte sans fiche ». Rien trouvé : « Aucune fiche pour « … ». Vérifie l'orthographe, ou : ＋ Créer la fiche ».
- **Choisie** : une pastille (initiales/photo, nom, années, Sosa) avec « ↗ Fiche » et « × » pour changer. Plusieurs personnes : des pastilles + une case « ＋ Ajouter une personne… ».
- **Avec des rôles** : « ⭐ Personne principale » (une seule, grande carte avec « ★ PRINCIPALE », « ↗ Fiche », « Changer » — l'ancienne descend dans les principales), zone bleue « ★ Autres personnes principales », zone grise « ☆ Personnes secondaires » ; sur chaque pastille un rôle facultatif (témoin, parrain, marraine, voisin, employeur, officier, déclarant… ou mot libre), ★/☆ pour changer de zone (ou glisser), × pour retirer ; une personne sans fiche = pastille grise « ? ». À la lecture : la principale en grand, puis lignes « ★ Principales » (pastilles bleues) et « ☆ Secondaires » (pastilles grises), rôle à côté du nom, clic = ouvrir la fiche.

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
