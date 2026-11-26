# Audit — 🧺 Panier et 📎 « Insérer une info » dans les outils

Novembre 2026. Code : `assets/js/heritage-connexions.js` (🧺), `assets/js/app-inserer.js` (📎),
`assets/js/heritage-connexions-outils.js` (ce qui a été ajouté). Essai : `tests/test-panier-inserer-outils.js`.

Légende : **oui** = déjà là avant · **ajouté** = fait dans ce lot · **non** = laissé de côté (la raison est dans la colonne « Manque »).
« 📎 générique » veut dire qu'un `textarea` ou un `contentEditable` reçoit déjà le 📎, avec « [↗ source] » écrit dans le texte.

## Les outils

| Outil | 🧺 Prendre (sa sélection) | 🧺 Recevoir (Mettre dans… / Prendre depuis…) | 📎 dans ses textes | Manque, ce qui a été fait |
|---|---|---|---|---|
| 📝 Traitement de texte | **ajouté** (le passage choisi) | avant : un *nouveau* document seulement · **ajouté** : « Ici : le document », au curseur | 📎 générique · **ajouté** : la source en note de bas de page, bouton 📎 dans la barre | — |
| 🧾 Tableur | **ajouté** (les cellules choisies : une ligne ou un ensemble) | avant : un *nouveau* classeur · **ajouté** : sous les données, colonne « Source » | 📎 générique (case en cours d'écriture) · bouton 📎 → des lignes | — |
| 🎞️ Présentation | **ajouté** (la diapositive affichée) | avant : une *nouvelle* présentation · **ajouté** : une diapositive par élément (ensemble : tableau), source dans les notes | 📎 générique sur une zone de texte · **ajouté** : la source va dans les notes de l'orateur ; bouton 📎 | — |
| 🎞 Studio d'animation | non | avant : par « 📤 Envoyer vers… » seulement · **ajouté** : « Mettre dans… » une image → un nouveau film | non (champs d'une ligne, pas de texte libre) | Rien d'« ici » : un film reçoit une image par le Studio lui-même (choix du plan) |
| 🎬 Montage | non | oui (« Un nouveau montage vidéo » : les images sur la piste) | 📎 générique (texte d'un titre, inspecteur) | Recevoir dans le montage *ouvert* : laissé (pas d'accès propre à l'éditeur ouvert ; le texte d'un titre a déjà le 📎) |
| ✒️ Vectoriel (et faire-part, cartes de vœux faites dedans) | **ajouté** (textes et images choisis) | avant : « 📤 » d'une image · **ajouté** : « Ici : le dessin », une étiquette + sa source (un média : son image) | 📎 générique (case « Texte » de l'inspecteur) · bouton 📎 → des étiquettes | — |
| 🎚️ Retouche | non | avant : « 📤 » · **ajouté** : « Mettre dans… » une photo → la Retouche s'ouvre dessus | 📎 générique sur la zone de texte posée sur l'image · **ajouté** : le 📎 ne termine plus l'écriture | Calque d'image / texte dans la retouche *ouverte* : laissé (éditeur à calques sur canevas, 4 600 lignes ; risque élevé) |
| 🌐 Site familial (pages, blocs) | non | avant : choix du site puis de la page · **ajouté** : « Ici : la page », un bloc « Document » avec « Source : » | non dans la page (elle vit dans un `iframe`) · **ajouté** : bouton 📎 → un bloc sourcé | Écrire au curseur dans l'`iframe` : laissé (pont `postMessage`, autre chantier) |
| 📖 Livre de famille | non | avant : « Mot de la fin » (sans « ici ») · **ajouté** : « Ici : le Livre », bouton 📎 · 📥 sous « Mot de la fin » | 📎 générique (Préface, Mot de la fin) | — |
| 📋 Rapports sans code | non | non | non (des règles et des titres, pas de texte libre) | Rien à recevoir ni à écrire : rien ajouté |
| 📨 Publipostage / faire-part | (Traitement de texte / Vectoriel) | (idem) | (idem) | Couvert par les deux outils |
| 📮 Courriers | oui (registre : barre de sélection) | non | 📎 générique (objet, texte) | Destination « courrier » : laissée (un courrier n'est pas un endroit où ranger) |
| 📊 Diagrammes (titres, notes) | non | non | **ajouté** : Titre, Sous-titre, Source comptent comme des champs ; la source va dans « Source / note en bas » ; bouton 📎 | Recevoir des lignes : laissé (la forme des données dépend du diagramme ; « Coller un tableau » existe) |
| 🗺️ Cartes postales | oui (fiches : clic droit) | non | 📎 générique (verso, adresse, notes) | — |
| 📚 Recueils / transcription | oui (clic droit sur une ligne) | non | 📎 générique (transcription, notes) | — |
| 🔍 Comparer (photos) | non | oui (« Comparer avec une autre photo », par « 📤 ») | 📎 générique (notes de comparaison) | — |

## Partout ailleurs : deux crochets communs (aucun code par écran)

1. **🧺 clic droit (et ⋯ d'une ligne) sur tout élément marqué** — `heritage-connexions-outils.js` lit les attributs que les écrans posent déjà
   (`data-open-person`, `data-h-person`, `data-tree-person`, `data-open-dashboard-person`, `data-person-id`, `data-pid`, `data-event-id`, `data-edit-event`,
   `data-media-id`, `data-open-media`, `data-media-card-id`, `data-place`, `data-place-id`, `data-act`…) : « 🧺 Prendre « … » » et « 📍 Mettre « … » dans… »
   gardent la **sorte et le numéro** (fiche, événement, média, lieu, acte, source), pas seulement le texte. Les actions (« supprimer », « ajouter une source à
   l'événement », onglets, coordonnées) sont écartées. Rien n'apparaît au repos : seulement dans le menu.
2. **📎 « Insérer… »** — dans chaque menu « 📤 Envoyer vers… » qui donne un texte ou un tableau, et dans chaque fenêtre d'export qui propose « 🧾 Tableur »
   (même tableau, posé au curseur du dernier texte, dans une note…, ou copié, avec la source). Les textes libres (`textarea`, `contentEditable`) ont déjà le 📎.

| Écran | 🧺 Prendre | 🧺 Recevoir | 📎 | Manque |
|---|---|---|---|---|
| 👤 Personnes / fiche : événements, notes, sources, médias, proches | **ajouté** : clic droit typé (événement, fiche, média) ; avant : texte précis | oui (« Ici : une note sur la fiche ») | oui (notes : la fiche d'abord) | — |
| 📋 Listes (natives et de données) | oui (barre de sélection « 🧺 Au panier », `listBar` des listes de données) · **ajouté** : clic droit typé sur une ligne | « Mes listes » (fiches) | 📎 depuis une liste (`insertBlock`) | — |
| 📄 Documents et recueils | oui (clic droit, texte) | non | 📎 générique | Un document n'a pas de numéro « à prendre » (`data-ong-doc`) : laissé, le texte précis suffit |
| 📅 Chronologie | **ajouté** : l'événement (et la fiche) au clic droit | non | non (pas de texte libre) | — |
| 🔍 Comparaison | oui (texte précis) | « Comparer avec une autre photo » | 📎 générique (notes) | — |
| 🗺️ Carte et ses bulles | non dans la carte (Leaflet garde son clic droit) | oui (« La carte » : ce qui a une position) | 📎 générique (descriptions) | Bulles : à faire dans `app-carte.js` (autre chantier en cours) |
| 📈 Graphiques / diagrammes | **ajouté** : les fiches des arbres et graphiques au clic droit | non | **ajouté** : titres et « Source » d'un diagramme | — |
| 🧱 Tableau de bord (widgets) | **ajouté** : fiches, événements, médias des widgets au clic droit | non | 📎 générique (objectif de séance) | — |
| 💎 Trésors | oui (texte précis) · **ajouté** : éléments marqués d'une fiche | non | 📎 générique | — |
| 🕵️ Enquêtes : pistes, pièces | oui | oui (« Ici : l'enquête ») | oui (la source va dans les pièces) | 🧩 Tableaux : autre chantier |
| 📚 Atelier (éléments) | oui | oui (« Ici : l'élément / le projet ») | 📎 générique | — |
| 📒 Fiches (blocs) | oui | oui (bloc « Données » figé) | 📎 générique | Bloc Données : `heritage-fiches.js` (autre chantier) |
| 🧰 Données récap | oui (`listBar`) | non | 📎 « Insérer… » des exports | — |
| 🗓️ Calendriers | oui (texte précis, événements marqués au clic droit) | non | non | — |
| 🧬 ADN | oui (texte précis ; fiches marquées au clic droit) | non | 📎 générique (notes) | — |
| 🐾 Battue (dépouillements) | oui (clic droit sur une ligne) | non | 📎 générique | — |
| ☁️ Météo, 🏛 Histoire locale, « Tout ce qui le concerne » | oui (déjà : « 🧺 » des panneaux, `heritage-tout-sur.js`, `heritage-meteo.js`) | non | 📎 « Insérer une info » les trouve (listes de données) | — |
| 🏘 Village / monographie d'un lieu | oui (texte précis ; lieux et fiches marqués) | non | 📎 générique | — |
| 📓 Journal, 📝 Notes, 🔖 Sources, ⏰ Rappels | oui | Notes, Rappels : oui | 📎 générique (Notes : classées) | — |
| 🔎 Recherche (résultats) | (autre chantier : `app-recherche.js`) | — | — | — |

## Ce qui commande tout

- Réglages → 🧺 Panier et connexions : « Panier » éteint → plus de 📥 ni d'« Ici » ; « Insérer une info » éteint → le 📎 de la barre se cache.
- Mode consultation (kiosque, base en lecture seule) : pas de boutons, « Ici » se tait, recevoir est refusé.
- Toujours « ↶ Annuler » (par l'historique de l'outil : ↶ du document, de la présentation, du tableur, du dessin, du site).
- Personnes vivantes et confidentielles : rien de nouveau, tout passe par le panier et « Prendre depuis… », qui appliquent déjà les règles.
