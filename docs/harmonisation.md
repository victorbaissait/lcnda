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
