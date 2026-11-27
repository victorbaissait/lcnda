# Harmonisation : que la même chose se ressemble partout

Ce document fait le point sur **l’aspect et les pièces** de l’interface : une même chose doit avoir le même dessin, la même place, le même mot et le même symbole sur tous les écrans. (Le comportement : annuler, confirmer, trier, exporter, raccourcis… est suivi à part.)

Comment ça a été vérifié : une recherche dans tout le code, puis l’app ouverte pour de vrai dans un navigateur, avec une petite généalogie inventée (MAZAUD, LACOMBE, DURAND), sur **268 écrans** : tous les onglets, toutes les listes, toutes les pages des Réglages et une fiche. Pour chaque écran, on a relevé les boutons et leurs symboles, les boutons « Fermer », les cases de recherche, les messages « rien ici », les messages d’attente et les onglets.

La règle de base est déjà écrite dans `docs/REGLES-INTERFACE.md` (C1 à C8, K1 à K20, H7, H10, L1 à L6). La plus grande partie de l’app la suit. Ce qui suit, ce sont les écarts restants.

---

## 1. Déjà corrigé (sans rien inventer : les écrans passent sur la pièce commune)

| Ce qui changeait | Où | Ce qui est fait |
|---|---|---|
| **Le bouton pour fermer** était parfois « ✕ » au lieu de « × ». La règle C8 dit : × pour fermer, ✕ ou 🗑 pour retirer. | 11 boutons : le panneau « À côté », la bulle d’un point sur la Carte, le lecteur audio et vidéo, les fenêtres Châteaux et territoires, Droit et pouvoir, Fiche d’un édifice, « Personnaliser la monographie », la recherche dans le code du site web, les deux fenêtres des téléchargements D (article, traduction hors ligne). | Tous en « × ». |
| **L’attente** : 25 phrases « Chargement… », « Recherche des données en ligne… », « Lecture du manifeste… » étaient écrites seules, en gris, sans le rond qui tourne (C7). | Recherche (INSEE, ce qui est installé), bases officielles, brevets, élections, météo, histoire, prénoms, patrimoine, fiches thématiques, recueils (IIIF, sommaire, sens de lecture), territoires, transcriptions, assistant de diagramme, IA locale, mises à jour des listes… | Toutes passent par le rond commun (`UI.spinner`). |
| **« Rien ici »** : 44 phrases « Aucun… », « Pas encore… » étaient écrites à la main en gris au lieu de la petite ligne commune K10. | Lieux en double, recherche dans les sources et citations, historique d’une fiche, auteurs à la BnF, studio d’animation, conversations de l’assistant, territoires, doutes, besoins, enquêtes d’une personne, droit et pouvoir, édifices, fiches thématiques (dates, carte), batailles, notices d’archives, fêtes, parties, ventes, documents, recueils, dossiers de succession, héritiers, factures, temps, tables, articles, prénoms, modèles d’IA, transcriptions, veille des décès. | Toutes passent par `empty()` (la petite ligne avec son icône). |
| **Vider ce qui est gardé sur l’ordinateur** : le même bouton s’appelait « 🗑 Effacer les réponses gardées » (9 écrans), « 🗑 Vider » (3) ou « 🗑 Tout oublier » (2). | Réglages : Objets et traces, Sons de l’enfance, Voir son village, Téléchargements A et D. | Partout « 🗑 Effacer les réponses gardées » (le mot déjà le plus utilisé, déjà traduit). |
| **Les messages avec « ↶ Annuler »** sont noirs (H7). 7 étaient verts. | À trier (photos reliées, inhumation, texte), Réseau de la maison (réglage, appareil retiré, appareil autorisé). | Noirs, comme les autres. |
| **⚙️ Réglages** : 12 boutons avaient le ⚙ « sans couleur » (un petit trait selon l’ordinateur) au lieu de ⚙️. | « ⚙ Colonnes » des listes de données et de l’ADN, « ⚙ Réglages » et « Organiser le récap » des Données, « Réglages des listes », « Couleurs… » de la Carte, « Réglages de l’onglet » des Diagrammes, « Les écrans du site », « ⚙︎ Personnaliser » de la monographie. | Tous en ⚙️. |
| **« ↺ Remettre comme au départ »** (K3) : 7 boutons gardaient un autre mot parce que le ↺ était posé à part : « Comme au départ », « Valeurs de départ », « Les rayons de départ », « Tout remettre comme au départ », « Réglages de départ ». | 🧭 Je veux…, Horloges (2), réglages de l’onglet Diagrammes, rayons des Données, Keynote, arbre vectoriel. | Tous « ↺ Remettre comme au départ ». |
| **Chercher = 🔍** (K11). 13 boutons pour chercher avaient 🔎. (🔎 reste le signe de l’onglet Recherche et de « Tout ce qui le concerne ».) | Chercher dans tous les actes, bases officielles (4), annuaires, « Trouver un lieu ancien » (2), « Chercher sur cet ordinateur » (IA), « Retrouver les lieux sans position » (2 cartes), mode « Trouver » de 🧭 Je veux…. | Tous en 🔍 (traductions mises à jour). |
| **Les onglets segmentés** : 12 groupes marquaient le choix seulement « pour les lecteurs d’écran » : **à l’écran, aucun bouton n’était allumé**. | 📈 Diagrammes (Vignettes / Liste, réglages), 🧭 Je veux… (Jamais / La 1re fois / Toujours…), Données plus (Comparer, Style, Format, Vitesse, Taille…). | Le choix pressé s’allume en bleu, comme partout, en clair, en sombre et avec les styles de bouton « contour » et « texte ». |

**Gardes ajoutées** (ces écarts ne peuvent plus revenir) : `tests/test-harmo-pieces.js` (nouveau : ×, « Effacer les réponses gardées », messages noirs, onglets allumés vérifiés dans le navigateur, en clair et en sombre), et trois gardes élargies : `tests/test-harmo-indicateurs.js` (les « Aucun… » traduits), `tests/test-harmo-chargement.js` (les « Chargement… » traduits), `tests/test-harmo-mots-symboles.js` (⚙/⚙︎ → ⚙️, 🔎 pour chercher, les anciens mots de « Remettre » posés à côté du ↺).

---

## 2. Ce qui reste à décider ou à faire (par ordre de ce qui se voit le plus)

Pour chaque point : ce qui change d’un écran à l’autre, où, ce que je te conseille, et le travail que ça demande (petit = une heure ou deux, moyen = une demi-journée à une journée, gros = plusieurs jours, à faire par lots).

### 1. Les fenêtres faites à la main (titre, × et boutons du bas pas toujours à la même place)
- **Ce qui change** : la plupart des fenêtres passent par la fenêtre commune (titre en haut à gauche, × en haut à droite, en bas « Annuler » puis le bouton bleu). Environ **30 outils** fabriquent encore leur propre fenêtre : le titre est parfois un petit titre (h3), le × est parfois absent ou dans le corps, la phrase d’aide est à une autre place.
- **Où** : choix d’une image, Paniers, Artistes et œuvres (assistant, métiers), Assembler, son rapide, blocs de la fiche, Bunker, Cartes et données, Comptes de la famille, Diagrammes, Employeurs, Keynote, Lieux à placer, Coutumes du monde, Comparer deux photos, retouche simple, Site web, Diaporama, Tableur, Téléchargements D (article, traduction), Territoires, Traitement de texte, Relecture et Atelier de transcription, Dessin vectoriel.
- **Je te conseille** : les passer une par une sur la fenêtre commune (`openDialog`), en commençant par les plus ouvertes (Paniers, Tableur, Site web, Transcription). Les éditeurs plein écran (Keynote, Dessin, Bunker) gardent leur cadre : seulement le × à droite.
- **Travail** : gros (par lots de 5 outils).

### 2. Un même symbole pour des choses différentes
- **Ce qui change** :
  - **📋** veut dire « Copier » (13 fois), « Coller » (4), mais aussi « Mes listes », « Tous les doutes », « Registre matricule », « Partir d’un modèle », « Ranger dans le Registre », « Recensements »…
  - **📎** veut dire « Insérer une info » (le standard), mais aussi « photo jointe », « fiche liée », « Médias », « Autre ».
  - **⤓** veut dire « Exporter » (le standard) et « Télécharger », mais aussi **« Installer »** un paquet de données (61 boutons, dans les Réglages des données).
  - **🔎 / 🔍** : 🔍 = chercher ; 🔎 = l’onglet Recherche, « Tout ce qui le concerne », « Pistes », « Introuvable », « OCR »…
- **Je te conseille** : garder 📋 pour copier / coller, 📎 pour insérer / joindre, ⤓ pour sortir un fichier de l’app ; prendre un autre signe pour « Installer » (par exemple 📦 « Installer ») ; pour les listes et registres, le signe de la liste concernée (📑, 🎖…). Je peux te préparer une page d’essai avec les deux versions côte à côte.
- **Travail** : moyen (c’est surtout choisir ; le changement est mécanique, traductions comprises).

### 3. Les liens qui sortent de l’app (↗ et le nom du site)
- **Ce qui change** : environ **180 liens** vers un site extérieur ont le ↗ (« ↗ Geneanet »), **160 ne l’ont pas** (« FranceArchives », « swisstopo », « Ouvrir », « la source », un simple 🔗 ou 🪦). On ne sait pas toujours qu’on va quitter l’app, ni vers quel site.
- **Où** : un peu partout (téléchargements de données, cartes, archives, Où chercher, fiches de lieu, bases officielles…).
- **Je te conseille** : une seule pièce `UI.extLink(adresse, nom du site)` qui écrit toujours « ↗ Nom du site » (et l’adresse en bulle), puis l’utiliser partout.
- **Travail** : moyen.

### 4. Le même geste, plusieurs mots : Supprimer, Effacer, Vider, Retirer
- **Ce qui change** : « Supprimer » est le mot validé. On trouve aussi « Effacer » (19 boutons : « Effacer les temps », « Effacer les lignes du registre », « Effacer les petites taches »…) et « Vider » (9 : « Vider la corbeille », « 🗑 Vider le journal », « Vider »…).
- **Je te conseille** : **Supprimer** = la chose disparaît ; **Retirer** = elle reste ailleurs (déjà la règle) ; **Vider** = seulement pour un contenant (corbeille, panier, journal) ; **Effacer** = seulement pour un dessin ou une retouche (gomme, taches) et pour « les réponses gardées ».
- **Travail** : petit.

### 5. Les « rien ici » encore faits à la main
- **Ce qui change** : quelques listes vides ont encore leur propre phrase ou leur propre boîte, sans l’icône ni le bouton pour commencer (K10).
- **Où** : 📈 Diagrammes (« Pas encore de diagramme. ＋ crée-en un »), fiche (« Aucune variante enregistrée », « Aucune étiquette »), Jeu de l’oie (« Aucune case ajoutée »), Listes Sosa / d’Aboville (« Aucune personne racine définie »), Étiquettes (« Aucune règle pour l’instant »), et une dizaine de petites phrases dans des listes à puces.
- **Je te conseille** : la petite ligne commune, avec le bouton « ＋ … » quand on peut commencer d’ici (pour Sosa : « ⭐ Choisir la personne de départ »).
- **Travail** : petit.

### 6. Combien de temps restent les messages
- **Ce qui change** : la règle H7 dit 6 secondes pour tous. 16 messages ont leur propre durée : 10 s (4), 12 s, 15 s (9), 30 s, 60 s.
- **Je te conseille** : 6 s partout ; seulement un message qui demande de lire quelque chose de long peut rester plus (et c’est la souris dessus qui le garde, comme aujourd’hui). À voir avec le travail sur le comportement (annuler).
- **Travail** : petit.

### 7. Les boutons « Remettre » qui disent ce qu’ils remettent
- **Ce qui change** : quelques boutons gardent un mot précis : « ↺ Remettre les couleurs de départ » (Carte), « ↺ Rétablir l’ordre de départ » (3 : onglets Données et Diagrammes), « ↺ Remettre l’image comme au départ » (transcription), « ↺ Revenir à l’état calculé » (recueils).
- **Je te conseille** : c’est une question de goût. Soit tout « ↺ Remettre comme au départ » (le plus simple, la bulle dit ce qui est remis), soit on garde la précision **seulement** quand l’écran a plusieurs boutons « remettre ».
- **Travail** : petit.

### 8. Les cases pour choisir une étiquette
- **Ce qui change** : 5 cases « Tape pour chercher une étiquette… » sont faites à la main, au lieu du menu de choix unique (loupe, liste, pastille, « ＋ Créer… »).
- **Où** : fiche d’une personne (étiquettes), Listes, aide.
- **Je te conseille** : le menu de choix unique pour les étiquettes (pastille de couleur), comme pour les lieux et les sources.
- **Travail** : moyen.

### 9. Les onglets segmentés : deux façons de les écrire dans le code
- **Ce qui change** : à l’écran c’est corrigé (voir plus haut), mais dans le code, 12 groupes marquent le choix d’une façon et les autres d’une autre. Un nouveau style d’onglet risquerait d’oublier l’une des deux.
- **Je te conseille** : une seule petite pièce pour fabriquer un groupe d’onglets, qui met les deux marques.
- **Travail** : petit.

### 10. Deux petits signes à trancher
- « ✕ Fermer l’essai » (mode simple) et le ✕ « Retour » du musée : le texte dit fermer, le signe dit retirer. Je conseille « × » (ou pas de signe du tout sur un bouton écrit).
- **📥 « Prendre depuis… »** en bouton d’icône seule (Connexions, Recherche) et « + N » dans deux phrases d’aide : le test K11 les refuse déjà (il est rouge aujourd’hui, ce n’est pas venu de ce travail). Soit on admet 📥 pour « Prendre depuis… » (c’est son vrai sens) et on l’écrit dans la règle, soit on change le signe.
- **Travail** : petit.

---

## 3. Ce qui est déjà bien partout (vérifié)

- En-têtes de page (K5) : 100 % des listes et des pages des Réglages ont le même en-tête (sur-titre, titre, 1 bouton bleu au plus, 2 boutons avant ⋯).
- Cases de recherche (C1) : toutes ont la loupe, le × pour vider, Échap et « / » (les mots « Rechercher » / « Filtrer » sont remis en « Chercher… » tout seuls).
- Onglets (C5) : tous les groupes trouvés utilisent la même classe pour le choix actif.
- Bas des fenêtres : aucune fenêtre trouvée avec le bouton bleu avant « Annuler ».
- Mode sombre et 390 px : déjà vérifiés par les gardes existantes (`test-harmo-pages.js`, `test-rien-de-colle.js`, `test-mise-en-page-ecrasee.js`).

---

# Comportements : que le même geste marche de la même façon partout

Cette partie-ci parle des **gestes** (et pas du dessin) : supprimer puis « ↶ Annuler », chercher dans une liste, cocher plusieurs lignes, exporter, trier, replier une section, ouvrir une fiche… Même méthode : une recherche dans tout le code, puis l’app ouverte pour de vrai dans un navigateur avec la petite généalogie inventée (MAZAUD, LACOMBE, DURAND).

Bonne nouvelle d’abord : l’essentiel est déjà commun. « ↶ Annuler » (H7) sert dans plus de 220 fichiers, la barre des listes (H10) dans 72, plus aucun `confirm()` ni `alert()` du navigateur (seulement en secours), l’impression passe par la fenêtre commune (L1) partout où elle existe, les dates « mises à jour » passent par le même petit texte (« il y a 3 jours »).

## 1. Déjà corrigé (en reprenant la pièce commune, rien d’inventé)

| Ce qui changeait | Où | Ce qui est fait |
|---|---|---|
| **Chercher sans les accents** : dans la plupart des listes, « eglise » trouve « Église » et « LACOMBE » = « lacombe ». Dans 13 cases de recherche, il fallait taper l’accent exact. | Revues et journaux, Atelier de recherche (bibliothèque), listes des Registres, Actes manquants, recherche dans les pages d’un recueil, Suivi des animaux (observations, animaux), fiche d’un animal suivi (observations), Lieux à placer, Liens utiles, Métiers et rivières, Lieux-dits et patrimoine, les noms de famille proposés (Carte), les étiquettes proposées (fiche, Listes). | Toutes cherchent comme les autres : sans accents ni majuscules (la même règle que `UI.listMatch`). |
| **⌘F (chercher dans l’écran)** ne trouvait « Église » que si on tapait l’accent. | Partout (⌘F / Ctrl+F). | « eglise » trouve « Église », le surlignage tombe toujours juste sur le mot. |
| **« Es-tu sûr ? » avant ce qui se défait** (H7). | Réglages → Animaux : supprimer un champ, une catégorie, une espèce. | Supprimé tout de suite, message « 🗑 Champ « … » supprimé · ↶ Annuler » (et « ↷ Rétablir »). |
| Idem. | Fiche → Langues parlées : supprimer une langue. | Supprimée tout de suite ; « ↶ Annuler » la remet avec sa certitude, sa note et « transmise à la descendance ». |
| Idem. | Jeu (oie, serpents, petits chevaux) : supprimer une partie. | Supprimée tout de suite ; « ↶ Annuler » la remet **avec sa progression**. |
| **Question ET « ↶ Annuler »** pour la même chose (deux fois la même précaution). | Mes listes de données : supprimer une liste (la question disait déjà « ↶ Annuler reste possible »). | Plus de question : la liste est mise de côté, « ↶ Annuler » la remet. |
| **Une section repliée reste repliée** (et une section ouverte reste ouverte). Seuls les panneaux d’outils s’en souvenaient ; les quelque 340 autres (« ▸ Plus d’options », « Pour aller plus loin », parties des Réglages…) se rouvraient comme au départ. | Partout (toute section repliable faite à la main). | Elles retiennent leur état sur l’ordinateur, avec la même mémoire que les panneaux. Seul un clic sur le titre compte. Pas retenus : les menus (« ⤓ Exporter ▾ », « ⋯ »…), une section répétée dans une liste, et ce qui s’ouvre seulement pour montrer une erreur. |
| **Chercher « un mot puis un autre »** : 13 listes cherchaient la phrase exacte (« jean tulle » ne trouvait rien). | Liens utiles, Lieux à placer, pages d’un recueil, Suivi des animaux (observations, animaux, sites, groupes), fiche d’un animal suivi, Actes manquants, Métiers et rivières, Lieux-dits, Ambiances (Trésors), Sons et vidéos, catalogue de l’artiste, souvenirs (Trésors), bibliothèque du plan de maison. | La même règle que les autres listes (`UI.listMatch.text`) : chaque mot, dans n’importe quel ordre, sans accents. « jean tulle » trouve « Jean MAZAUD, né à Tulle ». |
| **Petites cases de recherche dans les fenêtres** : il fallait l’accent exact. | Étiquettes à poser (Réglages des blocs), personnes des horloges, mots-clés de l’Atelier, formes du dessin, personnes et diagrammes de l’animation, champs de l’artiste, projets proposés dans les diagrammes. | Sans accents, chaque mot. La case « ＋ Créer » garde sa vérification exacte (un nom qui existe déjà n’est pas recréé). |
| **Ouvrir une fiche** : deux façons dans le code ; un nom ajouté plus tard (après « Voir les suivants », un tri, un filtre) pouvait rester sans effet. | Partout (`data-open-person` et `data-h-person`). | Un seul geste, écouté une fois pour toute l’app : clic = la fiche (la fenêtre autour se ferme), ⌘ ou Ctrl + clic = dans l’autre moitié, clic droit = le menu de la personne (Ouvrir, Modifier, signets, ton lien…). |
| **Le nom d’une personne recollé à la main** (« prénom nom » : double espace, « sans nom » oublié). | 35 endroits dans 17 fichiers : chronologie, comparaison, listes d’étiquettes, tableau de bord, carte, sépultures, étiquettes sur les photos, fusions, dépouillements, employeurs, fiches à thème, mise en page, métiers anciens, recensements, musée, questions, studio, arbre décoratif… | La pièce commune (`A().personName`) partout. |
| **Listes qui oubliaient leur tri.** | Onglet Diagrammes, Réglages → journal des modifications, saints du jour (personnes). (Le Jeu retenait déjà le sien.) | Le tri est retenu pour chaque liste, comme les listes avec la barre commune. |
| **Supprimer un projet d’outil** : la question, puis parfois aussi « ↶ Annuler ». | Listes → Outils de modification et les fenêtres « 📂 Projets » : montage, son, retouche, dessin (et arbre décoratif, faire-part, carte, sceau), livre, maison, diaporama, classeur, comparaison de photos, site web, document, cousinade, trésors, animation. | Plus de question : le projet part tout de suite, « ↶ Annuler » le remet (même numéro, gardé un jour), puis « ↷ Rétablir ». La question reste seulement pour les outils qui ne savent pas encore remettre (tableaux, transcriptions, rapports). |

**Gardes** : `tests/test-harmonisation-comportements.js` (nouveau : vérifie le code des 13 recherches, puis dans le navigateur ⌘F, la langue, le champ des animaux et la partie du Jeu, avec Annuler et Rétablir) ; `tests/test-h7-sans-question.js` élargi (les 6 questions retirées ne peuvent pas revenir) ; `tests/test-listes-perso.js` mis à jour (supprimer une liste sans question, puis ↶ Annuler). ; `tests/test-harmonisation-gestes.js` (nouveau : sections qui retiennent leur état, recherche « chaque mot », fiche ouverte par un nom ajouté plus tard et clic droit, noms, tris retenus, projet supprimé puis « ↶ Annuler ») ; `tests/test-site-web-complet.js` mis à jour (supprimer un site sans question, puis ↶ Annuler).

## 2. Ce qui reste à décider ou à faire (par ordre de ce qui se voit le plus)

Petit = une heure ou deux · moyen = une demi-journée à une journée · gros = plusieurs jours, par lots.

### 1. Encore des « Es-tu sûr ? » avant des choses qu’on pourrait défaire
- **Ce qui change** : la règle H7 dit « on supprime et on propose ↶ Annuler ». Une vingtaine de suppressions posent encore la question, parce que l’app ne sait pas (encore) remettre la chose une fois partie.
- **Où** : une recherche enregistrée (Recherche → Poser une question), une demande d’entraide, un message du livre d’or et un objet retiré d’une salle (Musée), une salle du musée, une fiche d’employeur, un article de revue, une liste et une fiche des Registres, des lignes d’un tableau de recueil, une personne d’un dépouillement, une ligne d’un bloc de la fiche, une copie chez un cousin, une liste de l’Atelier (Mes listes, Réglages → Éditeur de listes), les cartes d’électeur d’une fiche, le parcours de résistant, un projet de montage (la question **et** « ↶ Annuler » quand l’outil sait le remettre).
- **Je te conseille** : pour chacun, garder une copie au moment de supprimer (le journal des modifications le fait déjà pour les notes, sources, événements, rappels…) et brancher « ↶ Annuler » dessus, puis retirer la question. Garder la question seulement pour ce qui ne se remet pas (une fiche entière, vider la corbeille, écraser une base, un fichier importé entier).
- **Travail** : moyen à gros (par lots de 5 ; chaque sorte a besoin de sa petite « remise » côté serveur).

### 2. Cocher plusieurs lignes : une barre commune peu utilisée
- **Ce qui change** : la barre « 3 fiches cochées · 🏷 Étiqueter · ★ Mes listes · ⤓ Exporter · 🗑 Supprimer · ✕ Décocher » (avec Maj+clic pour une suite) existe, mais seulement dans Personnes, Événements, Sources, l’onglet Documents et les événements d’une fiche. Les listes de données ont leur propre « ☑ Choisir des lignes » (« Tout cocher (N) », « × Désélectionner »). Une vingtaine d’autres listes ont leurs cases faites à la main (Recueils, Revues, Paniers, ADN, Atelier, Imports…), chacune avec ses mots (« Tout sélectionner », « Tout cocher », rien du tout) et sans Maj+clic.
- **Je te conseille** : une seule façon : le bouton « ☑ Choisir des lignes » dans la barre H10, puis la barre commune en bas (Tout cocher (N), Maj+clic, les actions de la liste, ✕ Décocher). Commencer par les listes où l’on agit souvent sur plusieurs lignes : Médias, Recueils, Revues, Paniers.
- **Travail** : gros (par lots).

### 4. Exporter : la fenêtre commune pour tout ce qui sort en fichier
- **Ce qui change** : 31 outils passent par la fenêtre « ⤓ Exporter » commune (formats, nom du fichier, aperçu, « Ranger aussi une copie dans les médias »). Environ 35 autres fabriquent leur fichier CSV eux-mêmes, d’un clic, sans choix du nom ni des colonnes (Revues, Paniers, Registres, Suivi des animaux, Contrôle de la base, Successions, Tableau de bord, Rapports, ADN des cousins…).
- **Je te conseille** : tout « ⤓ Exporter » ouvre la même fenêtre ; pour une liste : 📄 CSV, 🧮 Ouvrir dans le tableur, 📊 Excel, et « ce qu’on voit / toute la liste » (comme Mes listes).
- **Travail** : moyen à gros.

## 3. Ce qui est déjà pareil partout (vérifié)

- **Annuler** : un seul message en bas à gauche, 6 s, « ↶ Annuler » puis « ↷ Rétablir », un deuxième Annuler dit « Déjà remis ».
- **Confirmer** : une seule fenêtre (`confirmBox`), bouton rouge pour ce qui supprime, le bouton « Annuler » choisi d’office (Entrée ne supprime pas par erreur).
- **Échap** ferme les fenêtres, les menus et la barre ⌘F ; **Entrée** valide les fenêtres ; **/** va dans la case de recherche de la liste.
- **Listes** : recherche, filtres, tri et affichage retenus pour chaque liste (72 écrans) ; « Voir les N suivants ↓ » la même pièce partout.
- **🧺 Panier et 📎 Insérer une info** : déjà audités et branchés, voir `docs/audit-panier-inserer.md`.
- **Liens qui sortent** : ils s’ouvrent hors de l’app sans lui donner la main (`noopener`) ; ce qui reste est le ↗ écrit ou non (voir la partie Apparence, point 3).
