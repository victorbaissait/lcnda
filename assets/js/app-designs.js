/* LCNDA — 🎨 Designs au choix (A1 à A8) (Réglages → 🎨 Designs au choix).
 *
 * Maquette validée : designs-A (« Designs au choix ») ; mode d'emploi : docs/UI.md « Designs au choix ».
 * Un design change seulement la FORME : traits, ombres, coins, densité, icônes, en-tête de fiche, cases d'arbre, boutons,
 *   mouvements, listes. Jamais la police, la taille du texte ni les couleurs : le premier cadre de Réglages → Apparence
 *   (Preset, Couleur principale, Police de caractères, Taille typographique, Menu des onglets…) passe toujours devant.
 * Réglage : localStorage['genealogie-designs'] = {ver: 2, a1: {v: 'avant'|'doux'|'papier'|'sobre', r, bw, sh} (les fiches seulement), a2: {…}, … a8: {…}}
 *   (v = la grande carte choisie, le reste = les « Réglages en plus » ; une valeur différente de celle de la carte = « retouché »).
 *   Un ancien réglage (sans ver : A1 à A10, A7 police, A10 tableau de bord) est relu tel quel sans erreur : A7 et A10 sont
 *   ignorés, A8 Mouvements devient A7, A9 Listes devient A8, la couleur d'accent d'A1 est oubliée (migrate). Au chargement,
 *   la copie gardée dans le navigateur est réécrite à neuf, et les anciennes clés (ensembles enregistrés…) sont effacées.
 * « Comme avant » partout (le départ) : rien n'est posé, l'app ne change pas d'un pixel.
 * Sinon : des attributs data-lc-* et des variables --lc-* sur <html> (styles : assets/css/designs.css et designs-gen.css, toutes
 *   leurs règles commencent par un de ces attributs), et quelques petits passages sur l'écran (icônes au trait, en-tête de la fiche,
 *   petit portrait des lignes, Sosa des cases d'arbre, secondes des messages).
 *   index.php pose les attributs au plus tôt (copie gardée dans 'lcnda-designs-ui-v2'), pour qu'il n'y ait pas de clignotement.
 * Recoupements (une seule source chaque fois) :
 *   A1 traits : leur couleur vient des couleurs de l'Apparence ; un thème à soi avec ses propres traits (« ✎ Mes thèmes ») garde les siens ;
 *   A5 couleurs homme / femme = celles des portraits (K7, app-portraits.js : 'genealogie-portraits'.m / .f) ;
 *   A7 : Accessibilité → « Réduire les animations » garde toujours la priorité (rien ne bouge) ;
 *   A2 : la colonne de gauche compacte (K15) et la « Taille typographique » d'Apparence restent à part, et s'ajoutent.
 * API : window.LCNDA_DESIGNS = {KEY, DEFS, IDS, read, write, clean, migrate, portable, apply, attrsOf, applyTo, decorate, isOn, isModified, …}
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP || {};
    const UI = () => window.LCNDA_UI || {};
    const P = () => window.LCNDA_PORTRAITS;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const toast = (m, k) => (A().toast ? A().toast(m, k) : console.info(m));
    const clone = o => JSON.parse(JSON.stringify(o));
    const HEX = /^#[0-9a-f]{6}$/i;
    const KEY = 'genealogie-designs';
    const VER = 2; // A1 à A8 (avant : A1 à A10, sans numéro de version)
    const CACHE_KEY = 'lcnda-designs-ui-v2'; // la copie des attributs lue par index.php avant tout le reste (pas un réglage)
    const OPEN_KEY = 'lcnda-designs-open-v2'; // sections ouvertes de la page
    const PREV_KEY = 'lcnda-designs-prev-v2'; // clair / sombre / les deux, pour chaque aperçu
    // ce que les anciennes versions gardaient, effacé au chargement : les ensembles enregistrés (retirés), les copies d’avant
    const OLD_KEYS = ['genealogie-designs-presets', 'lcnda-designs-ui-v1', 'lcnda-designs-open', 'lcnda-designs-prev-tab'];
    const K7_DEF = {m: '#3c78d8', f: '#d9488f'};

    /* ═════════════════════════ Les 8 réglages (textes de la maquette validée) : la forme, jamais la police ni les couleurs ═════════════════════════ */
    const DEFS = {
        a1: {n: 'A1', icon: '🎨', title: 'Style des fiches', q: 'Quel style pour les fiches ?', help: 'Les traits, les ombres et les coins des fiches des personnes et des animaux : blocs, boutons, champs. Le reste de l’app ne change pas ; les couleurs et la police restent celles de l’Apparence.', cols: 'four', screens: ['fiche'],
            variants: [
                {k: 'avant', t: 'Comme avant', sub: 'traits épais, ombres franches', d: {r: 0, bw: 2, sh: 'franches'},
                    why: [['👍', '<b>Rien ne bouge</b> : le style « néo-brutal » que tu connais, net et très lisible.'], ['👎', 'Beaucoup de traits épais et d’ombres décalées : ça peut paraître chargé sur un grand écran plein de blocs.']]},
                {k: 'doux', t: 'Doux', sub: 'coins arrondis, ombres légères', d: {r: 10, bw: 1, sh: 'douces'},
                    why: [['👍', '<b>Plus calme pour les yeux</b> : traits fins et pâles, coins ronds, ombres floues comme sur un téléphone.'], ['👎', 'Les blocs se détachent un peu moins du fond.']]},
                {k: 'papier', t: 'Papier ancien', sub: 'traits fins, grain du papier', d: {r: 3, bw: 1.5, sh: 'douces'},
                    why: [['👍', '<b>L’ambiance des archives</b> : coins presque droits, traits fins, un léger grain de papier derrière les pages. Pour le fond crème, choisis le Preset « Archive papier » dans Apparence.'], ['👎', 'Plus discret que « Comme avant » : les blocs se détachent un peu moins.']]},
                {k: 'sobre', t: 'Sobre', sub: 'sans ombres, traits clairs', d: {r: 4, bw: 1, sh: 'aucune'},
                    why: [['👍', '<b>Le plus discret</b> : rien ne dépasse, seul le contenu compte. Idéal pour imprimer ou faire des captures.'], ['👎', 'Un peu « bureau » : moins de caractère que les autres.']]},
            ],
            settings: [
                {k: 'r', type: 'range', label: 'Arrondi des coins', min: 0, max: 50, step: 1, unit: 'px', why: 'Des coins droits font « dossier d’archives » ; arrondis, l’app paraît plus douce et plus moderne. Le même arrondi va sur toute la fiche (blocs, boutons, champs).'},
                {k: 'bw', type: 'range', label: 'Épaisseur des traits', min: .5, max: 6, step: .5, unit: 'px', why: 'Des traits épais séparent nettement les blocs (utile si tu vois mal) ; des traits fins allègent les pages pleines de cadres. Leur couleur suit les couleurs de l’Apparence ; un thème à toi qui a ses propres traits (Apparence → ✎ Mes thèmes) garde les siens.'},
                {k: 'sh', type: 'select', label: 'Ombres', options: [['franches', 'Franches, décalées en bleu (comme avant)'], ['douces', 'Douces et floues'], ['aucune', 'Aucune ombre']], why: 'L’ombre dit « ceci est un bloc qu’on peut toucher ». Franches, elles donnent du relief ; douces, elles sont presque invisibles ; sans ombre, c’est le plus sobre (et le plus net à l’impression).'},
            ]},
        a2: {n: 'A2', icon: '↕', title: 'Densité', q: 'Combien d’espace autour des choses ?', help: 'L’espace dans et entre les blocs, la hauteur des lignes de liste, la marge des boutons.', cols: 'three', screens: ['liste', 'fiche', 'dash'],
            variants: [
                {k: 'avant', t: 'Normale', sub: 'comme avant', d: {sp: 100, rowh: 38, auto: false},
                    why: [['👍', '<b>Rien ne bouge</b> : l’équilibre actuel entre place et lisibilité.'], ['👎', 'Sur un petit portable, il faut souvent faire défiler.']]},
                {k: 'aeree', t: 'Aérée', sub: 'plus d’espace partout', d: {sp: 130, rowh: 46, auto: false},
                    why: [['👍', '<b>Reposant et facile à cliquer</b> : les lignes sont hautes, on ne se trompe pas de ligne.'], ['👎', 'Moins de choses visibles d’un coup ; plus de défilement.']]},
                {k: 'compacte', t: 'Compacte', sub: 'serré, plus de lignes', d: {sp: 70, rowh: 28, auto: false},
                    why: [['👍', '<b>Plus d’informations à l’écran</b> : parfait pour les longues listes et les petits écrans.'], ['👎', 'Les cibles sont plus petites : demande plus de précision à la souris.']]},
            ],
            settings: [
                {k: 'sp', type: 'range', label: 'Espace dans les blocs', min: 60, max: 140, step: 5, unit: '%', why: 'Agit sur les marges intérieures et l’écart entre les blocs. 100 % = comme avant. La « Taille typographique » de l’Apparence reste à part et s’ajoute ; une colonne de gauche réglée « Compacte » (onglet Colonne) garde sa propre taille : la Densité ne la touche pas.'},
                {k: 'rowh', type: 'range', label: 'Hauteur des lignes', min: 24, max: 56, step: 1, unit: 'px', why: 'Pour les listes, les tableaux et le menu de choix. Plus haut = plus facile à viser ; plus bas = plus de lignes visibles.'},
                {k: 'auto', type: 'toggle', label: 'Petit écran', text: 'Passer en compact tout seul sur un petit écran', why: 'Sur un téléphone ou une tablette, l’app se resserre d’elle-même, puis reprend ton réglage sur le grand écran.'},
            ]},
        a3: {n: 'A3', icon: '✏️', title: 'Icônes', q: 'Quelles icônes veux-tu ?', help: 'Les petits dessins des boutons, des barres d’outils et des rubriques.', cols: 'three', screens: ['fiche', 'dash', 'boutons'],
            variants: [
                {k: 'avant', t: 'Émojis', sub: 'comme avant', d: {ic: 16, icw: 1.8, red: true, lbl: false},
                    why: [['👍', '<b>Rien ne bouge</b> : des émojis en couleur, faciles à reconnaître.'], ['👎', 'Leur dessin change d’un ordinateur à l’autre (Mac, Windows) et certains sont un peu enfantins.']]},
                {k: 'trait', t: 'Dessin au trait', sub: 'icônes fines, une seule couleur', d: {ic: 16, icw: 1.8, red: true, lbl: false},
                    why: [['👍', '<b>Net et régulier</b> : toutes les icônes ont le même trait et prennent la couleur du texte (aussi en mode sombre).'], ['👎', 'Sans couleur, il faut parfois une seconde de plus pour les reconnaître.']]},
                {k: 'deux', t: 'Les deux', sub: 'trait pour agir, émoji pour les rubriques', d: {ic: 16, icw: 1.8, red: true, lbl: false},
                    why: [['👍', '<b>Le meilleur des deux</b> : boutons et barres d’outils au trait, rubriques et contenus en émoji (💍 conjoints, 🎂 anniversaires…).'], ['👎', 'Deux styles à l’écran en même temps.']]},
            ],
            settings: [
                {k: 'ic', type: 'range', label: 'Taille des icônes', min: 13, max: 24, step: 1, unit: 'px', why: 'Plus grandes, elles se voient de loin ; plus petites, les barres d’outils prennent moins de place.'},
                {k: 'icw', type: 'range', label: 'Épaisseur du trait', min: 1, max: 2.5, step: .25, unit: 'px', only: ['trait', 'deux'], why: 'Un trait épais ressemble aux traits noirs de l’app ; un trait fin fait plus élégant. Seulement pour les icônes au trait.'},
                {k: 'red', type: 'toggle', label: 'Supprimer en rouge', text: 'La corbeille 🗑 toujours en rouge', why: 'Le rouge prévient avant de cliquer : on ne supprime pas une fiche par erreur.'},
                {k: 'lbl', type: 'toggle', label: 'Noms à côté', text: 'Écrire le nom à côté des boutons de la fiche', why: 'Pratique pour apprendre l’app : plus besoin de passer la souris pour savoir ce que fait chaque bouton. Prend un peu plus de place.'},
            ]},
        a4: {n: 'A4', icon: '👤', title: 'Fiche d’une personne', q: 'Quel en-tête pour la fiche d’une personne ?', help: 'Le haut de la fiche : portrait, nom, dates, pastilles et boutons.', cols: 'four', screens: ['fiche'],
            variants: [
                {k: 'avant', t: 'En-tête actuel', sub: 'carré photo, grand nom', d: {photo: true, under: 'dates', badges: 'droite', bh: 150},
                    why: [['👍', '<b>Rien ne bouge</b> : grand nom très lisible, outils toujours à droite.'], ['👎', 'Beaucoup de blanc sous le nom ; la photo est petite et en gris.']]},
                {k: 'bandeau', t: 'Bandeau photo large', sub: 'une photo de famille en haut', d: {photo: true, under: 'lieux', badges: 'sous', bh: 150},
                    why: [['👍', '<b>Chaleureux</b> : une grande photo (la maison, la famille, le village) et le portrait rond par-dessus, comme un profil.'], ['👎', 'Prend de la hauteur ; sans photo, le bandeau prend la couleur principale (Apparence).']]},
                {k: 'acte', t: 'Style « acte ancien »', sub: 'papier, phrase d’état civil', d: {photo: true, under: 'tout', badges: 'sous', bh: 150},
                    why: [['👍', '<b>Se lit comme un acte</b> : « Née le … à …, décédée le … », portrait ovale sépia, tampon Sosa.'], ['👎', 'Moins de place pour les boutons ; plus décoratif que pratique.']]},
                {k: 'carte', t: 'Style « carte d’identité »', sub: 'champs rangés, photo d’identité', d: {photo: true, under: 'tout', badges: 'droite', bh: 150},
                    why: [['👍', '<b>Tout d’un coup d’œil</b> : nom, prénoms, naissance, décès rangés dans des cases fixes.'], ['👎', 'Le nom est moins grand ; un style plus « administratif ».']]},
            ],
            settings: [
                {k: 'photo', type: 'toggle', label: 'Photo', text: 'Montrer la photo de la fiche quand elle existe', why: 'Une photo rend la fiche vivante. Sans elle, les initiales prennent sa place (le bandeau prend la couleur principale de l’Apparence).'},
                {k: 'under', type: 'select', label: 'Sous le nom', options: [['dates', 'Les dates seules (comme avant)'], ['lieux', 'Les dates et les lieux'], ['tout', 'Dates, lieux et métier']], why: 'Les lieux évitent d’ouvrir les blocs pour savoir d’où vient la personne ; le métier aide à distinguer les homonymes.'},
                {k: 'badges', type: 'select', label: 'Pastilles', options: [['droite', 'À droite, les unes sous les autres (comme avant)'], ['sous', 'Sous le nom, sur une ligne']], why: 'À droite, elles ne gênent pas le nom ; sous le nom, elles se lisent avec lui et l’en-tête est moins haut.'},
                {k: 'bh', type: 'range', label: 'Hauteur du bandeau', min: 90, max: 240, step: 10, unit: 'px', only: ['bandeau'], why: 'Plus haut, la photo se voit mieux ; plus bas, la fiche commence plus tôt. Seulement pour le bandeau photo.'},
            ]},
        a5: {n: 'A5', icon: '🌳', title: 'Cases des arbres', q: 'Quelles cases pour les arbres ?', help: 'Les cases des personnes dans les arbres (Graphiques) : ascendants, descendants, sablier…', cols: 'four', screens: ['arbre'],
            variants: [
                {k: 'avant', t: 'Blanches', sub: 'comme avant', d: {tw: 175, m: K7_DEF.m, f: K7_DEF.f, links: 'droits', dates: true, sosa: false},
                    why: [['👍', '<b>Rien ne bouge</b> : cases nettes, faciles à imprimer en noir et blanc.'], ['👎', 'Toutes pareilles : on ne voit pas d’un coup les hommes, les femmes ni les ancêtres directs.']]},
                {k: 'genre', t: 'Couleurs homme / femme', sub: 'fond pâle et bande de couleur', d: {tw: 175, m: K7_DEF.m, f: K7_DEF.f, links: 'droits', dates: true, sosa: false},
                    why: [['👍', '<b>Repérage immédiat</b> : bleu pour les hommes, rose pour les femmes (couleurs à ton goût).'], ['👎', 'Plus coloré : à l’impression, garde des couleurs pâles.']]},
                {k: 'photo', t: 'Avec photo', sub: 'le portrait au-dessus du nom', d: {tw: 160, m: K7_DEF.m, f: K7_DEF.f, links: 'arrondis', dates: true, sosa: true},
                    why: [['👍', '<b>On reconnaît les visages</b> ; sans photo, des initiales à la couleur du genre.'], ['👎', 'Cases plus hautes : moins de générations à l’écran.']]},
                {k: 'mini', t: 'Mini', sub: 'le nom seul', d: {tw: 120, m: K7_DEF.m, f: K7_DEF.f, links: 'droits', dates: false, sosa: false},
                    why: [['👍', '<b>Beaucoup de générations</b> d’un coup : idéal pour les grands arbres et les petits écrans.'], ['👎', 'Les dates n’apparaissent qu’au survol (sauf si tu les remets).']]},
            ],
            settings: [
                {k: 'tw', type: 'range', label: 'Largeur des cases', min: 100, max: 240, step: 5, unit: 'px', why: 'Des cases larges montrent les noms en entier ; étroites, l’arbre tient sur l’écran.'},
                {k: ['m', 'f'], type: 'colors', label: 'Couleurs du genre', labels: ['Homme', 'Femme'], why: 'Ce sont aussi les couleurs des portraits ronds (Apparence → 👤 Portraits : menu de choix, listes). Les changer ici les change partout.'},
                {k: 'links', type: 'select', label: 'Traits entre les cases', options: [['droits', 'Droits, à angle (comme avant)'], ['arrondis', 'Coins arrondis']], why: 'Les angles droits vont avec les traits de l’app ; les coins arrondis rendent les grands arbres plus faciles à suivre de l’œil.'},
                {k: 'dates', type: 'toggle', label: 'Dates', text: 'Écrire les dates dans les cases', why: 'Les dates évitent de confondre deux Louise BORIE ; sans elles, l’arbre est plus léger (elles restent au survol).'},
                {k: 'sosa', type: 'toggle', label: 'Sosa', text: 'Petit badge Sosa sur la case', why: 'Tu vois tout de suite le numéro de chaque ancêtre direct, utile pour parler d’un ancêtre (« le 6 »).'},
            ]},
        a6: {n: 'A6', icon: '🔘', title: 'Boutons', q: 'Quels boutons veux-tu ?', help: 'Les boutons secondaires (Annuler, Modifier, ＋ Ajouter…) ; le bouton principal reste toujours plein, à la couleur principale de l’Apparence.', cols: 'three', screens: ['fenetre', 'boutons', 'fiche'],
            variants: [
                {k: 'avant', t: 'Pleins', sub: 'comme avant', d: {size: 'normale', shadow: true, shape: 'blocs'},
                    why: [['👍', '<b>Rien ne bouge</b> : chaque bouton est une vraie « touche » encadrée, avec son ombre.'], ['👎', 'Quand il y a beaucoup de boutons, on ne voit plus lequel est important.']]},
                {k: 'contour', t: 'Contour', sub: 'un trait fin, fond transparent', d: {size: 'normale', shadow: false, shape: 'blocs'},
                    why: [['👍', '<b>Le bouton principal ressort</b> : les autres restent visibles mais plus légers.'], ['👎', 'Un peu moins « cliquable » au premier regard.']]},
                {k: 'texte', t: 'Texte seul', sub: 'pour les boutons secondaires', d: {size: 'normale', shadow: true, shape: 'blocs'},
                    why: [['👍', '<b>Le plus épuré</b> : « Annuler », « Modifier » deviennent des mots en couleur, soulignés au survol.'], ['👎', 'Peut se confondre avec un lien ; demande un peu d’habitude.']]},
            ],
            settings: [
                {k: 'size', type: 'select', label: 'Taille', options: [['mini', 'Très petite (30 px)'], ['petite', 'Petite (34 px)'], ['moins', 'Un peu petite (38 px)'], ['normale', 'Normale, 42 px (comme avant)'], ['plus', 'Un peu grande (46 px)'], ['grande', 'Grande (50 px)'], ['tresgrande', 'Très grande (56 px)'], ['enorme', 'Énorme (62 px)']], why: 'La hauteur et la marge des boutons : les grands sont plus faciles à viser, surtout sur une tablette ; les petits laissent plus de place au contenu. La taille des lettres reste celle de l’Apparence.'},
                {k: 'shadow', type: 'toggle', label: 'Ombre', text: 'Une ombre sous les boutons', why: 'L’ombre fait « touche qu’on enfonce ». Elle suit le style général (franche, douce ou aucune).'},
                {k: 'shape', type: 'select', label: 'Coins', options: [['blocs', 'Comme les blocs (réglage A1)'], ['pilule', 'Bien ronds (pilule)']], why: 'Des boutons bien ronds se distinguent des cadres et des champs ; comme les blocs, tout reste cohérent.'},
            ]},
        a7: {n: 'A7', icon: '🎞', title: 'Mouvements', q: 'Comment les choses apparaissent-elles ?', help: 'Les fenêtres qui s’ouvrent, les menus, les messages en bas à gauche, les boutons au survol. L’aperçu tourne en boucle.', cols: 'three', screens: ['motion', 'boutons'],
            variants: [
                {k: 'avant', t: 'Instantané', sub: 'comme avant', d: {dur: 150, hover: true, bar: true, reduce: true},
                    why: [['👍', '<b>Rien ne bouge</b> : fenêtres et menus apparaissent d’un coup ; les boutons s’enfoncent au survol, le message glisse un peu.'], ['👎', 'L’apparition brusque peut surprendre : on ne voit pas d’où vient la fenêtre.']]},
                {k: 'petit', t: 'Petit mouvement', sub: 'doux et court (0,18 s)', d: {dur: 180, hover: true, bar: true, reduce: true},
                    why: [['👍', '<b>On suit ce qui se passe</b> : la fenêtre monte un peu en s’éclaircissant, l’onglet choisi glisse.'], ['👎', 'Très léger temps d’attente (moins d’un quart de seconde).']]},
                {k: 'aucun', t: 'Aucune animation', sub: 'rien ne bouge jamais', d: {dur: 0, hover: false, bar: false, reduce: true},
                    why: [['👍', '<b>Le plus calme</b> : utile si les mouvements donnent mal à la tête ou sur un vieil ordinateur.'], ['👎', 'Le temps qui reste d’un message s’écrit en chiffres au lieu d’une barre qui se vide.']]},
            ],
            settings: [
                {k: 'dur', type: 'range', label: 'Vitesse', min: 100, max: 400, step: 10, unit: 'ms', only: ['petit'], why: 'Plus court = plus vif ; plus long = plus visible. Au-delà de 0,3 s, l’app paraît lente. Seulement pour « Petit mouvement ».'},
                {k: 'hover', type: 'toggle', label: 'Survol', text: 'Les boutons s’enfoncent sous la souris', why: 'Montre que le bouton réagit avant même de cliquer.'},
                {k: 'bar', type: 'toggle', label: 'Messages', text: 'Barre bleue du temps qui reste (messages H7)', why: 'La barre qui se vide montre combien de temps il reste pour cliquer « ↶ Annuler ». Sans elle, le temps s’écrit en secondes.'},
                {k: 'reduce', type: 'toggle', label: 'Ordinateur', text: 'Suivre le réglage « réduire les animations » de l’ordinateur', why: 'Si tu as demandé moins d’animations à ton Mac ou à Windows, l’app passe toute seule en « Aucune animation ». Et si « Réduire les animations » est coché dans Réglages → Accessibilité, rien ne bouge, quel que soit ce choix.'},
            ]},
        a8: {n: 'A8', icon: '☰', title: 'Listes', q: 'Comment séparer les lignes des listes ?', help: 'Les listes (Listes, Personnes, Recherche…), la colonne des personnes et les tableaux.', cols: 'four', screens: ['liste', 'side'],
            variants: [
                {k: 'avant', t: 'Comme avant', sub: 'chaque liste garde le sien', d: {hover: 'pale', sel: 'plein', av: false, sticky: true},
                    why: [['👍', '<b>Rien ne bouge</b> : traits dans les Listes, cartes encadrées dans la colonne Personnes.'], ['👎', 'Deux façons de faire selon l’endroit.']]},
                {k: 'traits', t: 'Traits entre les lignes', sub: 'un seul cadre, lignes fines', d: {hover: 'pale', sel: 'pale', av: true, sticky: true},
                    why: [['👍', '<b>Compact et clair</b> : comme un registre, on voit beaucoup de lignes.'], ['👎', 'Sur un grand écran, l’œil peut sauter de ligne.']]},
                {k: 'zebre', t: 'Une ligne sur deux grisée', sub: 'sans traits', d: {hover: 'trait', sel: 'pale', av: true, sticky: true},
                    why: [['👍', '<b>On suit la ligne sans se tromper</b>, même dans un tableau large avec beaucoup de colonnes.'], ['👎', 'Le gris peut se confondre avec une ligne choisie si l’écran est pâle.']]},
                {k: 'cartes', t: 'Cartes espacées', sub: 'chaque ligne dans son cadre', d: {hover: 'trait', sel: 'plein', av: true, sticky: false},
                    why: [['👍', '<b>Chaque fiche est un objet</b> qu’on attrape : facile à glisser, à viser sur une tablette.'], ['👎', 'Moins de lignes visibles ; plus de défilement.']]},
            ],
            settings: [
                {k: 'hover', type: 'select', label: 'Sous la souris', options: [['pale', 'Fond pâle (comme avant)'], ['trait', 'Trait de la couleur principale à gauche']], why: 'Le fond pâle se voit de loin ; le trait à gauche ne cache pas le gris des lignes alternées.'},
                {k: 'sel', type: 'select', label: 'Ligne choisie', options: [['plein', 'Couleur principale pleine, texte blanc (comme avant)'], ['pale', 'Couleur principale pâle avec un trait']], why: 'Elle prend la couleur principale de l’Apparence (un rouge devient rouge pâle). La couleur pleine ne peut pas se rater ; la couleur pâle laisse lire les gris et les badges.'},
                {k: 'av', type: 'toggle', label: 'Portrait', text: 'Un petit portrait au début de chaque ligne', why: 'Les visages et les couleurs du genre aident à retrouver une personne sans lire.'},
                {k: 'sticky', type: 'toggle', label: 'En-têtes', text: 'Les titres des colonnes restent en haut quand on fait défiler', why: 'Dans une longue liste, tu sais toujours quelle colonne est la naissance et laquelle est le décès.'},
            ]},
    };
    const IDS = Object.keys(DEFS);
    const V = (id, k) => DEFS[id].variants.find(v => v.k === k) || DEFS[id].variants[0];
    const defOf = (id, k) => ({v: V(id, k).k, ...clone(V(id, k).d)});
    const SHARED = new Set(['m', 'f']); // A5 : les couleurs des portraits (K7), pas « retouché »

    /** tout « Comme avant » (le départ) */
    const defaults = (colors = null) => clean({}, colors);

    /* ═════════════════════════ Le réglage : lu, vérifié, gardé ═════════════════════════ */
    const k7Colors = () => { try { const S = P()?.read?.(); return {m: HEX.test(S?.m || '') ? S.m : K7_DEF.m, f: HEX.test(S?.f || '') ? S.f : K7_DEF.f}; } catch (_) { return {...K7_DEF}; } };
    const snap = (v, s) => { const n = Math.round((v - s.min) / s.step) * s.step + s.min; return Math.round(Math.max(s.min, Math.min(s.max, n)) * 1000) / 1000; };
    const isObj = o => !!o && typeof o === 'object' && !Array.isArray(o);
    /** un ancien réglage (A1 à A10, sans « ver ») → A1 à A8 : A7 police et A10 tableau de bord sont oubliés,
     *  A8 Mouvements devient A7, A9 Listes devient A8 (la couleur d'accent d'A1 est oubliée par clean) */
    function migrate(raw) {
        if (!isObj(raw)) return {};
        if (raw.ver === VER) return raw;
        const o = {};
        ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'].forEach(id => { if (isObj(raw[id])) o[id] = raw[id]; });
        if (isObj(raw.a8)) o.a7 = raw.a8;
        if (isObj(raw.a9)) o.a8 = raw.a9;
        return o;
    }
    /** seulement des valeurs connues (elles sont écrites telles quelles dans les styles) */
    function clean(raw, colors = null) {
        const r = migrate(raw);
        const G = {ver: VER}; // (un réglage déjà relu ne repasse pas par migrate)
        IDS.forEach(id => {
            const x = r[id] && typeof r[id] === 'object' ? r[id] : {};
            const v = DEFS[id].variants.some(o => o.k === x.v) ? x.v : 'avant';
            const o = defOf(id, v);
            DEFS[id].settings.forEach(s => {
                (Array.isArray(s.k) ? s.k : [s.k]).forEach(k => {
                    const val = x[k];
                    if (s.type === 'range') { const n = Number(val); if (val !== null && val !== '' && Number.isFinite(n) && n !== o[k]) o[k] = snap(n, s); } // la valeur de la carte reste telle quelle
                    else if (s.type === 'select') { if (s.options.some(([ov]) => ov === val)) o[k] = val; }
                    else if (s.type === 'toggle') { if (typeof val === 'boolean') o[k] = val; }
                    else if (s.type === 'colors') { if (HEX.test(String(val || ''))) o[k] = String(val).toLowerCase(); }
                });
            });
            G[id] = o;
        });
        const c = colors || k7Colors();
        G.a5.m = c.m; G.a5.f = c.f;
        return G;
    }
    /** ce qui est gardé (et emporté par les réglages enregistrés, le défaut du site…) : avec son numéro de version, sans les couleurs des portraits */
    const stored = G => { const o = {...clone(G), ver: VER}; delete o.a5.m; delete o.a5.f; return o; };
    const readRaw = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (_) { return null; } };
    function read() { return clean(readRaw()); }
    /** une valeur de 'genealogie-designs' venue d'ailleurs (fichier, autre version) → la même, à neuf ('' si tout est « Comme avant ») */
    function portable(raw) { const g = clean(typeof raw === 'string' ? (() => { try { return JSON.parse(raw); } catch (_) { return null; } })() : raw); return IDS.some(id => isOn(g, id)) ? JSON.stringify(stored(g)) : ''; }
    function write(G, {silent = false} = {}) {
        const g = clean(G, {m: HEX.test(G?.a5?.m || '') ? G.a5.m.toLowerCase() : k7Colors().m, f: HEX.test(G?.a5?.f || '') ? G.a5.f.toLowerCase() : k7Colors().f});
        try {
            if (IDS.every(id => !isOn(g, id))) localStorage.removeItem(KEY); else localStorage.setItem(KEY, JSON.stringify(stored(g)));
        } catch (_) { if (!silent) toast('Enregistrement impossible : la place du navigateur est pleine ?', 'error'); }
        // A5 : les couleurs homme / femme sont celles des portraits (une seule source)
        const k = k7Colors();
        if (P() && (g.a5.m !== k.m || g.a5.f !== k.f)) P().write({...P().read(), m: g.a5.m, f: g.a5.f});
        apply();
        return g;
    }
    const isModified = (G, id) => { const d = defOf(id, G[id].v); return Object.keys(d).some(k => !SHARED.has(k) && k !== 'v' && G[id][k] !== d[k]); };
    const isOn = (G, id) => G[id].v !== 'avant' || isModified(G, id);

    /* ── couleurs ── */
    const hx = h => [0, 2, 4].map(i => parseInt(h.slice(1 + i, 3 + i), 16));
    const toHex = a => '#' + a.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
    const mix = (a, b, t) => { const x = hx(a), y = hx(b); return toHex(x.map((v, i) => v * (1 - t) + y[i] * t)); };

    /* ═════════════════════════ Attributs et variables posés sur <html> ═════════════════════════ */
    const ATTRS = ['style', 'lines', 'sh', 'r', 'density', 'dauto', 'icons', 'icred', 'iclbl', 'fiche', 'fphoto', 'funder', 'fbadges', 'tree', 'tw', 'tlinks', 'tdates', 'tsosa',
        'btn', 'bsize', 'bshadow', 'bshape', 'motion', 'mhover', 'mbar', 'mreduce', 'list', 'lhover', 'lsel', 'lav', 'lsticky'].map(a => 'data-lc-' + a);
    const VARS = ['--lc-k', '--lc-r', '--lc-sp', '--lc-rowh', '--lc-ic', '--lc-icw', '--lc-bh', '--lc-tw', '--lc-tm', '--lc-tf',
        '--lc-tm-bg', '--lc-tf-bg', '--lc-tm-tx', '--lc-tf-tx', '--lc-tm-bgd', '--lc-tf-bgd', '--lc-tm-txd', '--lc-tf-txd', '--lc-dur'];
    // posés par les anciennes versions (couleur d'accent, palette, A7 police, A10 tableau de bord) : toujours retirés
    const OLD_ATTRS = ['acc', 'cards', 'font', 'fz', 'lh', 'caps', 'titles', 'dash', 'wgap', 'dnum', 'dempty'].map(a => 'data-lc-' + a);
    const OLD_VARS = ['--lc-acc-l', '--lc-acc-d', '--lc-acc-soft-l', '--lc-acc-soft-d', '--lc-on-acc-l', '--lc-on-acc-d', '--lc-fz', '--lc-lh', '--lc-cols', '--lc-jw', '--lc-wgap'];
    /** {attrs, vars} d'un réglage : rien du tout pour « Comme avant » */
    function attrsOf(G) {
        const a = {}, v = {}, B = id => defOf(id, 'avant');
        if (isOn(G, 'a1')) {
            const d = G.a1, b = B('a1');
            a['data-lc-style'] = d.v; // (jamais de couleur : celles de l'Apparence restent)
            if (d.v !== 'avant' || d.bw !== b.bw) { a['data-lc-lines'] = '1'; v['--lc-k'] = String(d.bw / 2); }
            if (d.sh !== b.sh) a['data-lc-sh'] = d.sh;
            if (d.r !== b.r) { a['data-lc-r'] = '1'; v['--lc-r'] = `${d.r}px`; }
        }
        if (isOn(G, 'a2')) {
            const d = G.a2; a['data-lc-density'] = d.v; v['--lc-sp'] = String(d.sp / 100); v['--lc-rowh'] = `${d.rowh}px`;
            if (d.auto) a['data-lc-dauto'] = '1';
        }
        if (isOn(G, 'a3')) {
            const d = G.a3, b = B('a3'); a['data-lc-icons'] = d.v; v['--lc-ic'] = `${d.ic}px`; v['--lc-icw'] = String(d.icw);
            if (!d.red) a['data-lc-icred'] = 'off';
            if (d.lbl) a['data-lc-iclbl'] = '1';
            if (d.v === 'avant' && d.ic === b.ic && d.red && !d.lbl) delete v['--lc-ic'];
        }
        if (isOn(G, 'a4')) {
            const d = G.a4; a['data-lc-fiche'] = d.v; v['--lc-bh'] = `${d.bh}px`;
            if (!d.photo) a['data-lc-fphoto'] = 'off';
            if (d.under !== 'dates') a['data-lc-funder'] = d.under;
            if (d.badges !== 'droite') a['data-lc-fbadges'] = d.badges;
        }
        if (isOn(G, 'a5')) {
            const d = G.a5, b = B('a5'); a['data-lc-tree'] = d.v;
            if (d.tw !== b.tw) { a['data-lc-tw'] = '1'; v['--lc-tw'] = `${d.tw}px`; }
            if (d.links !== b.links) a['data-lc-tlinks'] = d.links;
            if (!d.dates) a['data-lc-tdates'] = 'off';
            if (d.sosa) a['data-lc-tsosa'] = '1';
            [['m', d.m], ['f', d.f]].forEach(([g, c]) => { v[`--lc-t${g}`] = c; v[`--lc-t${g}-bg`] = mix(c, '#ffffff', .86); v[`--lc-t${g}-tx`] = mix(c, '#000000', .55); v[`--lc-t${g}-bgd`] = mix(c, '#242424', .74); v[`--lc-t${g}-txd`] = mix(c, '#ffffff', .62); });
        }
        if (isOn(G, 'a6')) {
            const d = G.a6; a['data-lc-btn'] = d.v;
            if (d.size !== 'normale') a['data-lc-bsize'] = d.size;
            if (!d.shadow) a['data-lc-bshadow'] = 'off';
            if (d.shape !== 'blocs') a['data-lc-bshape'] = d.shape;
        }
        if (isOn(G, 'a7')) {
            const d = G.a7; a['data-lc-motion'] = d.v; v['--lc-dur'] = `${d.v === 'petit' ? d.dur : d.v === 'aucun' ? 0 : 150}ms`;
            if (!d.hover) a['data-lc-mhover'] = 'off';
            if (!d.bar) a['data-lc-mbar'] = 'off';
            if (d.reduce) a['data-lc-mreduce'] = '1';
        }
        if (isOn(G, 'a8')) {
            const d = G.a8, b = B('a8'); a['data-lc-list'] = d.v;
            if (d.hover !== b.hover) a['data-lc-lhover'] = d.hover;
            if (d.sel !== b.sel) a['data-lc-lsel'] = d.sel;
            if (d.av) a['data-lc-lav'] = '1';
            if (!d.sticky) a['data-lc-lsticky'] = 'off';
        }
        return {attrs: a, vars: v};
    }
    /* A1 (traits, ombres, coins) ne vaut que dans les fiches : ses attributs vont sur la fiche ouverte, pas sur <html>
       (les feuilles disent « :is([data-lc-r], [data-lc-r] *) », scripts/scope-a1-css.py). La colonne de gauche a les siens (app-colonne.js). */
    const A1_ATTRS = ['data-lc-style', 'data-lc-lines', 'data-lc-sh', 'data-lc-r'], A1_VARS = ['--lc-k', '--lc-r'];
    const pick = (o, keep) => Object.fromEntries(Object.entries(o).filter(([k]) => keep(k)));
    /** les attributs du style A1 d'un réglage : {attrs, vars} */
    const a1Of = G => { const {attrs, vars} = attrsOf(G); return {attrs: pick(attrs, k => A1_ATTRS.includes(k)), vars: pick(vars, k => A1_VARS.includes(k))}; };
    /** pose (ou retire) des attributs A1 sur un élément : la fiche, la colonne de gauche ; et allume les feuilles qui en ont besoin */
    function setScope(el, part) {
        if (!el) return;
        A1_ATTRS.forEach(n => { if (n in part.attrs) { if (el.getAttribute(n) !== part.attrs[n]) el.setAttribute(n, part.attrs[n]); } else if (el.hasAttribute(n)) el.removeAttribute(n); });
        A1_VARS.forEach(n => { if (n in part.vars) el.style.setProperty(n, part.vars[n]); else el.style.removeProperty(n); });
        const doc = el.ownerDocument || document;
        if (part.attrs['data-lc-lines']) { const s = doc.getElementById('lc-frame-css'); if (s && s.media !== 'all') s.media = 'all'; }
        if (Object.keys(part.attrs).length) { const g = doc.getElementById('lc-designs-gen'); if (g && g.media !== 'all') g.media = 'all'; }
    }
    /** la fiche ouverte (personne ou animal) prend le style A1 choisi */
    function ficheScope(G = cur()) { if (typeof document === 'undefined') return; const part = a1Of(G); document.querySelectorAll('#workspace .person-page').forEach(el => setScope(el, part)); }
    /** pose un réglage sur un élément <html> (un aperçu : tout ; la page : sans A1, qui va sur la fiche) */
    function applyTo(el, G, {noA1 = false} = {}) {
        let {attrs, vars} = attrsOf(G);
        if (noA1) { attrs = pick(attrs, k => !A1_ATTRS.includes(k)); vars = pick(vars, k => !A1_VARS.includes(k)); }
        [...ATTRS, ...OLD_ATTRS].forEach(n => { if (!(n in attrs) && el.hasAttribute(n)) el.removeAttribute(n); });
        [...VARS, ...OLD_VARS].forEach(n => { if (!(n in vars)) el.style.removeProperty(n); });
        Object.entries(attrs).forEach(([n, x]) => { if (el.getAttribute(n) !== x) el.setAttribute(n, x); });
        Object.entries(vars).forEach(([n, x]) => el.style.setProperty(n, x));
        const doc = el.ownerDocument || document;
        if (attrs['data-lc-lines']) { const s = doc.getElementById('lc-frame-css'); if (s && s.media !== 'all') s.media = 'all'; }
        if (Object.keys(attrs).length) { const g = doc.getElementById('lc-designs-gen'); if (g && g.media !== 'all') g.media = 'all'; } // la feuille fabriquée ne sert que si un design est choisi
        return {attrs, vars};
    }
    let current = null;
    /** « Fond quadrillé » a quitté le style (A1) pour Apparence → Thème et couleurs ('genealogie-design'.grid = 'off') :
     *  un ancien choix sans quadrillage (case décochée, ou Doux / Papier ancien / Sobre qui l'enlevaient) y est recopié une fois */
    function migrateGrid() {
        try {
            const raw = migrate(readRaw()), x = raw.a1; if (!isObj(x)) return;
            const d = JSON.parse(localStorage.getItem('genealogie-design') || '{}') || {}; if ('grid' in d) return;
            const off = typeof x.grid === 'boolean' ? !x.grid : ['doux', 'papier', 'sobre'].includes(x.v);
            if (off) { d.grid = 'off'; localStorage.setItem('genealogie-design', JSON.stringify(d)); A().applyDesign?.(); }
        } catch (_) {}
    }
    migrateGrid();
    function apply() {
        const G = read(), root = document.documentElement;
        current = G;
        const out = applyTo(root, G, {noA1: true});
        ficheScope(G);
        try { if (Object.keys(out.attrs).length) localStorage.setItem(CACHE_KEY, JSON.stringify({a: out.attrs, v: out.vars})); else localStorage.removeItem(CACHE_KEY); } catch (_) {}
        scheduleDecorate();
        return G;
    }
    const cur = () => current || read();
    let PREVIEW_G = null;

    /* ═════════════════════════ A3 : les icônes au trait (SVG 24 × 24, une seule couleur) ═════════════════════════ */
    const SV = {
        import: '<path d="M12 20V9M7 13l5-5 5 5M5 4h14"/>', export: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
        save: '<path d="M5 4h11l3 3v13H5z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/>', print: '<path d="M7 9V4h10v5M7 17H5v-7h14v7h-2"/><path d="M7 14h10v6H7z"/>',
        edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>', trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
        close: '<path d="M6 6l12 12M18 6 6 18"/>', open: '<path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/>', undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
        redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>', gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
        search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>', plus: '<path d="M12 5v14M5 12h14"/>', copy: '<rect x="8" y="8" width="12" height="12" rx="1.5"/><path d="M16 8V4H4v12h4"/>',
        clip: '<rect x="5" y="4" width="14" height="17" rx="1.5"/><path d="M9 4V2.5h6V4M9 10h6M9 14h6M9 18h3"/>', dup: '<rect x="8" y="8" width="12" height="12" rx="1.5"/><rect x="4" y="4" width="12" height="12" rx="1.5"/>',
        more: '<path d="M5 12h.01M12 12h.01M19 12h.01" stroke-width="3"/>', star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
        folder: '<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H10l2 2h7.5A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z"/>',
        link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
        reset: '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v5h5"/>', full: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>', share: '<path d="M12 15V4M7 9l5-5 5 5M5 14v6h14v-6"/>',
        check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>', sparkle: '<path d="M12 3c.6 4.4 2.6 6.4 7 7-4.4.6-6.4 2.6-7 7-.6-4.4-2.6-6.4-7-7 4.4-.6 6.4-2.6 7-7z"/>',
        bookmark: '<path d="M6 3h12v18l-6-4-6 4z"/>', lock: '<rect x="5" y="11" width="14" height="10" rx="1.5"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
        unlock: '<rect x="5" y="11" width="14" height="10" rx="1.5"/><path d="M8 11V7a4 4 0 0 1 7.6-1.7"/>', history: '<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.5"/><path d="M3.5 3.5v5h5M12 7.5V12l3 2"/>',
        users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2a6.3 6.3 0 0 1 3.5 5.8"/>',
        user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>', ring: '<circle cx="12" cy="14.5" r="6"/><path d="m9 5.5 3 3 3-3-1.5-2h-3z"/>',
        baby: '<circle cx="12" cy="12" r="8.5"/><path d="M9 11h.01M15 11h.01M9.5 15a3.5 3.5 0 0 0 5 0M12 3.5c-1 1.5-.5 3 1 3"/>',
        pin: '<path d="M12 21s-7-6.4-7-12a7 7 0 0 1 14 0c0 5.6-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/>', calendar: '<rect x="3.5" y="5" width="17" height="15" rx="1.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
        book: '<path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z"/><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3"/>',
        bookopen: '<path d="M3 5.5C6 4 9 4 12 6c3-2 6-2 9-.5V19c-3-1.5-6-1.5-9 .5-3-2-6-2-9-.5z"/><path d="M12 6v13.5"/>',
        image: '<rect x="3" y="4" width="18" height="16" rx="1.5"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>', camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
        palette: '<path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2s-1-2 0-3 3 0 4.5-1S21 13 21 11c0-4.4-4-8-9-8z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7.5" r="1"/>',
        chart: '<path d="M4 20V4M4 20h16M8.5 16v-5M13 16V8M17.5 16v-3"/>', tree: '<rect x="9" y="3" width="6" height="5" rx="1"/><rect x="3" y="16" width="6" height="5" rx="1"/><rect x="15" y="16" width="6" height="5" rx="1"/><path d="M12 8v4M6 16v-4h12v4"/>',
        paw: '<circle cx="6.5" cy="10.5" r="1.8"/><circle cx="17.5" cy="10.5" r="1.8"/><circle cx="9.8" cy="6" r="1.8"/><circle cx="14.2" cy="6" r="1.8"/><path d="M12 12c-3 0-5.2 3.6-5.2 5.6S9 20.5 12 19.6s5.2.6 5.2-1.9S15 12 12 12z"/>',
        cake: '<path d="M4 21h16v-8H4zM4 16.5c2 1.5 4 1.5 6 0s4-1.5 6 0 3 1.5 4 0M12 13V9.5M12 6.5v.01"/>', bell: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
        home: '<path d="M3.5 11 12 4l8.5 7M6 9.5V20h12V9.5"/>', info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/>', warn: '<path d="M12 4 2.5 20h19z"/><path d="M12 10v4.5M12 17.5v.01"/>',
        dna: '<path d="M7 3c0 6 10 6 10 12s-10 3-10 6M17 3c0 6-10 6-10 12s10 3 10 6M8.5 6.5h7M8.5 17.5h7M10 12h4"/>', map: '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>',
        note: '<path d="M5 3h10l4 4v14H5z"/><path d="M14 3v5h5M8 12h8M8 16h6"/>', mail: '<rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="m3.5 6 8.5 7 8.5-7"/>',
        tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.3"/>', puzzle: '<path d="M4 8h4a2 2 0 1 1 4 0h4v4a2 2 0 1 1 0 4v4H4v-4a2 2 0 1 0 0-4z"/>',
        tools: '<path d="M14.5 6.5a4 4 0 0 0 5 5L12 19l-3-3 7.5-7.5"/><path d="M4 20l5-5M6 4l4 4-2 2-4-4z"/>', blocks: '<rect x="3" y="13" width="8" height="7"/><rect x="13" y="13" width="8" height="7"/><rect x="8" y="5" width="8" height="7"/>',
        broom: '<path d="M14 4l6 6M12 8l4 4-5 8H6l-2-2 4-6z"/><path d="M7 15l3 3"/>', box: '<path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z"/><path d="M3 7.5 12 12l9-4.5M12 12v9"/>',
        help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.7M12 17v.01"/>', eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
        film: '<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/>', music: '<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
        compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>', trophy: '<path d="M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 14v4M8 21h8M9 18h6"/>',
        grad: '<path d="m2.5 9 9.5-4.5L21.5 9 12 13.5z"/><path d="M6.5 11v5c3 2.5 8 2.5 11 0v-5M21.5 9v5"/>', news: '<path d="M4 5h13v14H6a2 2 0 0 1-2-2z"/><path d="M17 9h3v8a2 2 0 0 1-2 2M7 9h7M7 13h7M7 16h4"/>',
        column: '<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M9 4v16"/>', back: '<path d="M19 12H5M11 6l-6 6 6 6"/>', filter: '<path d="M4 5h16l-6 7.5V19l-4 1.5v-8z"/>',
        send: '<path d="M21 3 10 14M21 3l-7 18-4-7-7-4z"/>', mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>', play: '<path d="M7 4.5v15l12-7.5z"/>',
        heart: '<path d="M12 20s-7.5-4.5-7.5-10A4.3 4.3 0 0 1 12 7.3 4.3 4.3 0 0 1 19.5 10c0 5.5-7.5 10-7.5 10z"/>', cross: '<path d="M12 3v18M7 8h10"/>', globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/>',
        key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3"/>', layout: '<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M3 10h18M10 10v10"/>', scan: '<path d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4M7 12h10"/>',
    };
    /** l'émoji (ou le signe) de l'app → son dessin au trait ; kind 'a' = une action (boutons), 'r' = une rubrique */
    const GLYPHS = [
        ['⤒', 'import', 'a'], ['⤓', 'export', 'a'], ['💾', 'save', 'a'], ['🖨', 'print', 'a'], ['✎', 'edit', 'a'], ['✏️', 'edit', 'a'], ['✏', 'edit', 'a'], ['🖊', 'edit', 'a'], ['🗑', 'trash', 'a'], ['×', 'close', 'a'], ['✕', 'close', 'a'],
        ['↗', 'open', 'a'], ['↶', 'undo', 'a'], ['↷', 'redo', 'a'], ['⚙️', 'gear', 'a'], ['⚙', 'gear', 'a'], ['🔍', 'search', 'a'], ['🔎', 'search', 'a'], ['＋', 'plus', 'a'], ['📋', 'clip', 'a'], ['⧉', 'dup', 'a'],
        ['⋯', 'more', 'a'], ['⭐', 'star', 'a'], ['☆', 'star', 'a'], ['★', 'star', 'a'], ['📁', 'folder', 'a'], ['📂', 'folder', 'a'], ['🔗', 'link', 'a'], ['↺', 'reset', 'a'], ['⛶', 'full', 'a'], ['📤', 'share', 'a'],
        ['✓', 'check', 'a'], ['✔', 'check', 'a'], ['✨', 'sparkle', 'a'], ['🔖', 'bookmark', 'a'], ['🔒', 'lock', 'a'], ['🔓', 'unlock', 'a'], ['🕘', 'history', 'a'], ['🕓', 'history', 'a'], ['⏱', 'history', 'a'],
        ['←', 'back', 'a'], ['⚲', 'filter', 'a'], ['▶', 'play', 'a'], ['🎙', 'mic', 'a'], ['🎤', 'mic', 'a'], ['✉️', 'mail', 'a'], ['✉', 'mail', 'a'], ['🗂', 'folder', 'r'],
        ['👥', 'users', 'r'], ['👤', 'user', 'r'], ['💍', 'ring', 'r'], ['👶', 'baby', 'r'], ['📍', 'pin', 'r'], ['📅', 'calendar', 'r'], ['🗓', 'calendar', 'r'], ['📚', 'book', 'r'], ['📖', 'bookopen', 'r'], ['📘', 'bookopen', 'r'],
        ['🖼', 'image', 'r'], ['📷', 'camera', 'r'], ['📸', 'camera', 'r'], ['🎨', 'palette', 'r'], ['📊', 'chart', 'r'], ['📈', 'chart', 'r'], ['🌳', 'tree', 'r'], ['🐾', 'paw', 'r'], ['🎂', 'cake', 'r'], ['🔔', 'bell', 'r'],
        ['🏠', 'home', 'r'], ['🏡', 'home', 'r'], ['ℹ️', 'info', 'r'], ['ℹ', 'info', 'r'], ['⚠️', 'warn', 'r'], ['⚠', 'warn', 'r'], ['🧬', 'dna', 'r'], ['🗺', 'map', 'r'], ['📝', 'note', 'r'], ['📄', 'note', 'r'], ['📃', 'note', 'r'], ['🏷', 'tag', 'r'],
        ['🧩', 'puzzle', 'r'], ['🛠️', 'tools', 'r'], ['🛠', 'tools', 'r'], ['🔧', 'tools', 'r'], ['🧱', 'blocks', 'r'], ['🧹', 'broom', 'r'], ['📦', 'box', 'r'], ['❓', 'help', 'r'], ['👁', 'eye', 'r'], ['🎞', 'film', 'r'],
        ['🎬', 'film', 'r'], ['🎵', 'music', 'r'], ['🎶', 'music', 'r'], ['💿', 'music', 'r'], ['🧭', 'compass', 'r'], ['🏆', 'trophy', 'r'], ['🎓', 'grad', 'r'], ['📰', 'news', 'r'], ['▤', 'column', 'r'], ['📮', 'send', 'r'],
        ['❤️', 'heart', 'r'], ['✝', 'cross', 'r'], ['†', 'cross', 'r'], ['🌍', 'globe', 'r'], ['🌐', 'globe', 'r'], ['🔑', 'key', 'r'], ['🗝', 'key', 'r'], ['▦', 'layout', 'r'], ['📑', 'note', 'r'], ['🔬', 'search', 'r'], ['🖌', 'palette', 'r'],
    ];
    const GLYPH_MAP = new Map(GLYPHS.map(([g, n, k]) => [g, {n, k}]));
    const GLYPH_RE = new RegExp('^(\\s*)(' + GLYPHS.map(([g]) => g).sort((a, b) => b.length - a.length).map(g => g.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')️?(?=\\s|$|[\\p{L}\\p{N}«])', 'u');
    const svgOf = n => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${SV[n] || ''}</svg>`;
    // où l'on regarde : les boutons et barres d'outils (actions), les rubriques (menus, titres de pages et de blocs)
    const ACT_SEL = 'button, a.button, label.button, .button, summary, [role=menuitem], .ui-actmenu-ico, .pk-chip .go';
    const RUB_SEL = '.mt-gicon, .ui-ph-ico, .side-menu-item, .nav-item, .card-head h3, .section-label, .rel-title, .relations-strip h4, .relation-head, .person-meta, .empty-line-ico, .empty-box-ico, .wl, .relation-empty';
    const SKIP_SEL = 'input, textarea, select, [contenteditable], .lcd-keep, .ui-toast, .pk-list mark, svg, code, kbd, pre, .lc-ic, [data-lc-ic-off], .ui-badge';
    /** un nœud de texte qui commence par un signe connu → <span class="lc-ic"> (l'émoji reste dans le texte, caché à l'œil, pour
     *  les lecteurs d'écran et pour le code qui lit le texte des boutons). mode : 'avant' (émoji gardé, seulement sa taille),
     *  'trait' (tout au trait), 'deux' (les actions au trait, les rubriques gardent leur émoji). */
    function wrapIcons(root, mode, docRef) {
        const doc = docRef || root.ownerDocument || document;
        const els = new Set();
        const pick = sel => { try { if (root.matches?.(sel)) els.add(root); root.querySelectorAll(sel).forEach(el => els.add(el)); } catch (_) {} };
        pick(ACT_SEL); if (mode !== 'deux') pick(RUB_SEL);
        els.forEach(el => {
            if (el.closest('input, textarea, select, [contenteditable], .lcd-keep, [data-lc-ic-off]')) return;
            if (mode === 'deux' && el.closest(RUB_SEL) && !el.matches(ACT_SEL)) return;
            const walker = doc.createTreeWalker(el, 4);
            let t = walker.nextNode(), seen = 0;
            while (t && seen < 2) {
                const parent = t.parentElement;
                if (!parent || parent.closest('.lc-ic, svg, kbd, code, mark, .ui-badge, .pk-badge, .lc-dz-keep')) { t = walker.nextNode(); continue; }
                const txt = t.nodeValue;
                if (txt && txt.trim()) {
                    seen++;
                    const m = txt.match(GLYPH_RE);
                    if (m) {
                        const g = GLYPH_MAP.get(m[2]);
                        const svg = mode !== 'avant' && !!SV[g.n];
                        const vs = m[0].endsWith('\uFE0F') ? '\uFE0F' : '';
                        const span = doc.createElement('span');
                        span.className = `lc-ic is-${g.n} ${svg ? 'is-svg' : 'is-emo'}`;
                        span.innerHTML = `<span class="lc-ic-e">${esc(m[2] + vs)}</span>${svg ? svgOf(g.n) : ''}`;
                        t.nodeValue = txt.slice(m[0].length);
                        parent.insertBefore(span, t);
                        if (m[1]) parent.insertBefore(doc.createTextNode(m[1]), span);
                        break;
                    }
                }
                t = walker.nextNode();
            }
        });
    }
    /** remet les émojis comme avant (le texte n'a jamais changé) */
    function unwrapIcons(root) {
        root.querySelectorAll('.lc-ic').forEach(span => {
            const e = span.querySelector('.lc-ic-e')?.textContent ?? span.dataset.lcIc ?? '';
            const next = span.nextSibling;
            if (next && next.nodeType === 3) { next.nodeValue = e + next.nodeValue; span.remove(); } else span.replaceWith(span.ownerDocument.createTextNode(e));
        });
    }

    /* ═════════════════════════ A4 : l'en-tête de la fiche, avec ses vraies données ═════════════════════════ */
    const fem = p => p?.gender === 'female';
    const nameOf = p => [p?.first_name, p?.middle_name, p?.last_name].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim() || 'Sans nom';
    const evOf = (detail, tags) => { for (const t of tags) { const e = (detail?.events || []).find(x => x.gedcom_tag === t && (x.date_text || x.place_name)); if (e) return e; } return null; };
    const placeLong = e => { if (!e?.place_name) return ''; const dep = e.county || e.state || ''; return dep && dep !== e.place_name ? `${e.place_name} (${dep})` : e.place_name; };
    const occOf = detail => String(detail?.person?.occupation || evOf(detail, ['OCCU'])?.description || evOf(detail, ['OCCU'])?.value || '').trim();
    const mediaUrl = f => (f ? `media/${encodeURIComponent(f)}` : '');
    const bandPhoto = detail => {
        const p = detail?.person || {}, list = (detail?.media || []).filter(m => (m.media_type === 'image' || m.media_type === 'photo') && (m.filename || m.thumbnail));
        const other = list.find(m => m.filename !== p.portrait) || list[0];
        return other ? mediaUrl(other.filename || other.thumbnail) : '';
    };
    /** la phrase d'état civil (« Née le … à …, fille de … et de …, épouse de …, décédée le … ») */
    function acteText(detail, under) {
        const p = detail.person || {}, f = fem(p), b = evOf(detail, ['BIRT', 'BAPT', 'CHR']), d = evOf(detail, ['DEAT', 'BURI']);
        const parts = [];
        const at = e => (under !== 'dates' && e?.place_name ? ` à <b>${esc(placeLong(e))}</b>` : '');
        if (b) parts.push(`${b.gedcom_tag === 'BIRT' ? (f ? 'Née' : 'Né') : (f ? 'Baptisée' : 'Baptisé')}${b.date_text ? ` le <b>${esc(b.date_text)}</b>` : ''}${at(b)}`);
        const occ = occOf(detail); if (under === 'tout' && occ) parts.push(`<b>${esc(occ.toLocaleLowerCase('fr-FR'))}</b>`);
        const par = (detail.parents || []).slice(0, 2);
        if (par.length) parts.push(`${f ? 'fille' : 'fils'} de ${par.map(x => esc(nameOf(x))).join(' et de ')}`);
        const sp = (detail.partners || [])[0];
        if (sp && under !== 'dates') parts.push(`${f ? 'épouse' : 'époux'} de ${esc(nameOf(sp))}`);
        if (d) parts.push(`${d.gedcom_tag === 'DEAT' ? (f ? 'décédée' : 'décédé') : (f ? 'inhumée' : 'inhumé')}${d.date_text ? ` le <b>${esc(d.date_text)}</b>` : ''}${at(d)}`);
        if (!parts.length) return `${esc(nameOf(p))} : rien n’est encore noté sur sa naissance ni sur son décès.`;
        const s = parts.join(', ') + '.';
        return s.charAt(0).toLocaleUpperCase('fr-FR') + s.slice(1);
    }
    const cls = (...c) => c.filter(Boolean).join(' '); // (les noms de classes sont assemblés ici : pas de dessin de portrait écrit à la main)
    function initialsHtml(p, extra) { return `<div class="${cls('portrait', 'portrait-placeholder', 'lc-dz', extra)}">${esc(((p.first_name || '')[0] || '') + ((p.last_name || '')[0] || ''))}</div>`; }
    const HERO_CLS = ['lc-hero', 'lc-hero-avant', 'lc-hero-bandeau', 'lc-hero-acte', 'lc-hero-carte', 'lc-nophoto'];
    const PART_CLS = ['lc-h-pt', 'lc-h-nm', 'lc-h-tl'];
    function undecorateHero(hero) {
        hero.querySelectorAll('.lc-dz').forEach(x => x.remove());
        hero.querySelectorAll('.lc-dz-hide').forEach(x => x.classList.remove('lc-dz-hide'));
        hero.classList.remove(...HERO_CLS);
        hero.querySelectorAll('.' + PART_CLS.join(', .')).forEach(x => x.classList.remove(...PART_CLS));
    }
    function decorateHero(hero, detail, G) {
        if (!hero) return;
        undecorateHero(hero);
        if (!isOn(G, 'a4') || !detail?.person) return;
        const d = G.a4, p = detail.person, doc = hero.ownerDocument;
        const pt = [...hero.children].find(c => c.matches('.portrait, .portrait-lc, img, .lc-av, .lc-av-wrap'));
        const nm = [...hero.children].find(c => c.querySelector(':scope > h2, :scope > h1'));
        const tl = hero.querySelector(':scope > .person-hero-tools');
        pt?.classList.add('lc-h-pt'); nm?.classList.add('lc-h-nm'); tl?.classList.add('lc-h-tl');
        hero.classList.add('lc-hero', `lc-hero-${d.v}`);
        const add = (html, where = 'beforeend', ref = hero) => { ref.insertAdjacentHTML(where, html); };
        // la photo : montrée ou remplacée par les initiales
        const hasPhoto = !!p.portrait;
        if (!d.photo && pt && hasPhoto) {
            hero.classList.add('lc-nophoto');
            pt.classList.add('lc-dz-hide');
            const lcAv = UI().avatarOn?.() ? `<span class="portrait-lc lc-dz lc-h-pt" aria-hidden="true">${UI().avatar({...p, name: nameOf(p), photo: ''}, 88)}</span>` : initialsHtml(p, 'lc-h-pt');
            pt.insertAdjacentHTML('afterend', lcAv);
        }
        // sous le nom : les dates (comme avant), les lieux, le métier
        const meta = nm?.querySelector('.person-meta');
        if (meta && d.under !== 'dates' && d.v !== 'carte') {
            const b = evOf(detail, ['BIRT', 'BAPT', 'CHR']), dd = evOf(detail, ['DEAT', 'BURI']), occ = occOf(detail);
            const first = meta.querySelector(':scope > span');
            const bits = [];
            if (b) bits.push(`<span class="lc-dz">° ${esc(b.date_text || '?')}${b.place_name ? ` ${esc(b.place_name)}` : ''}</span>`);
            if (dd) bits.push(`<span class="lc-dz">† ${esc(dd.date_text || '?')}${dd.place_name ? ` ${esc(dd.place_name)}` : ''}</span>`);
            if (d.under === 'tout' && occ) bits.push(`<span class="lc-dz">Métier : <strong>${esc(occ)}</strong></span>`);
            if (bits.length && first) { first.classList.add('lc-dz-hide'); first.insertAdjacentHTML('beforebegin', bits.join('')); }
        }
        if (d.v === 'bandeau') {
            const ph = d.photo ? bandPhoto(detail) : '';
            add(`<div class="lc-hero-band lc-dz${ph ? ' has-photo' : ''}" aria-hidden="true"${ph ? ` style="background-image:url('${esc(ph)}')"` : ''}></div>`, 'afterbegin');
        }
        if (d.v === 'acte') {
            add('<div class="lc-acte-orn lc-dz" aria-hidden="true">— ❦ —</div>', 'afterbegin');
            const grp = p.surname_group ? ` · Groupe ${esc(p.surname_group)}` : '';
            nm?.querySelector('h2, h1')?.insertAdjacentHTML('beforebegin', `<div class="lc-acte-k lc-dz">Extrait de la fiche n° ${esc(p.id)}${grp}</div>`);
            add(`<p class="lc-acte-txt lc-dz">${acteText(detail, d.under)}</p>`);
            const sosa = hero.querySelector('.ui-badge.is-sosa');
            if (sosa) { const n = (sosa.textContent.match(/[\d&\s]+$/) || [''])[0].trim(); sosa.classList.add('lc-dz-hide'); sosa.insertAdjacentHTML('beforebegin', `<span class="lc-acte-stamp lc-dz" title="${esc(sosa.title || 'Numéro Sosa')}"><span>SOSA<b>${esc(n)}</b></span></span>`); }
        }
        if (d.v === 'carte') {
            const b = evOf(detail, ['BIRT', 'BAPT', 'CHR']), dd = evOf(detail, ['DEAT', 'BURI']), occ = occOf(detail), f = fem(p);
            const prenoms = [p.first_name, p.middle_name].filter(Boolean).join(' ') || '—';
            const cell = (k, v, wide) => `<div class="${wide ? 'is-wide' : ''}"><small>${k}</small><b>${v ? esc(v) : '—'}</b></div>`;
            const gender = p.gender === 'female' ? 'F' : p.gender === 'male' ? 'M' : '?';
            const rows = [cell('Nom', p.last_name || '', true), cell('Prénom(s)', prenoms, true),
                cell(b && b.gedcom_tag !== 'BIRT' ? (f ? 'Baptisée le' : 'Baptisé le') : (f ? 'Née le' : 'Né le'), b?.date_text), d.under === 'dates' ? cell('Sexe', gender) : cell('à', placeLong(b)),
                cell(dd && dd.gedcom_tag !== 'DEAT' ? (f ? 'Inhumée le' : 'Inhumé le') : (f ? 'Décédée le' : 'Décédé le'), dd?.date_text), d.under === 'dates' ? cell('Groupe', p.surname_group) : cell('à', placeLong(dd))];
            if (d.under === 'tout') rows.push(cell('Métier', occ, true));
            add(`<div class="lc-carte-top lc-dz" aria-hidden="true"><span>FICHE DE FAMILLE</span><span>N° ${esc(String(p.id).padStart(6, '0'))}</span></div>`, 'afterbegin');
            (pt || hero.firstElementChild).insertAdjacentHTML('afterend', `<div class="lc-carte-f lc-dz">${rows.join('')}</div>`);
        }
    }
    /** la fiche ouverte : redessinée si le réglage change */
    let lastDetail = null;
    ext.afterPerson = ext.afterPerson || [];
    ext.afterPerson.push(detail => { lastDetail = detail; ficheScope(); const run = () => decorateHero(document.querySelector('#workspace .person-hero'), detail, cur()); run(); setTimeout(run, 0); });

    /* ═════════════════════════ Les petits passages sur l'écran (A3, A5, A7, A8) ═════════════════════════ */
    /** A8 : un petit portrait au début des lignes des tableaux de personnes */
    const peopleCache = new Map(); let peopleAsked = false;
    function rowAvatars(root, on, people) {
        root.querySelectorAll('.lc-row-av').forEach(x => { if (!on) x.remove(); });
        if (!on || !UI().avatar) return;
        (people || []).forEach(p => p && p.id && peopleCache.set(String(p.id), p));
        // une liste ouverte sans la colonne des personnes : on demande une fois les noms (genre, photo) à la base
        if (root === document.body && !peopleAsked && root.querySelector('.data-table .table-link[data-open-person]') && A().api) {
            peopleAsked = true;
            A().api('people', {limit: 1000}).then(r => { (r?.people || []).forEach(p => peopleCache.set(String(p.id), p)); root.querySelectorAll('.lc-row-av').forEach(x => x.remove()); scheduleDecorate(); }).catch(() => {});
        }
        const byId = peopleCache;
        root.querySelectorAll('.data-table td > .table-link[data-open-person]').forEach(b => {
            if (b.previousElementSibling?.classList.contains('lc-row-av')) return;
            const p = byId.get(String(b.dataset.openPerson)) || {name: b.textContent.trim()};
            b.insertAdjacentHTML('beforebegin', `<span class="lc-row-av lc-dz">${UI().avatar({...p, name: p.name || nameOf(p), photo: p.portrait ? mediaUrl(p.portrait) : (p.photo || '')}, 22)}</span>`);
        });
    }
    /** A5 : Sosa sur les cases, dates au survol */
    function treeCards(root, G) {
        root.querySelectorAll('.tree-card .lc-tree-sosa').forEach(x => x.remove());
        const on = isOn(G, 'a5');
        root.querySelectorAll('.tree-card').forEach(c => {
            const sm = c.querySelector(':scope > small');
            if (on && !G.a5.dates && sm && !c.title) { c.title = sm.textContent.trim(); c.dataset.lcTitle = '1'; }
            else if ((!on || G.a5.dates) && c.dataset.lcTitle) { c.removeAttribute('title'); delete c.dataset.lcTitle; }
            if (on && G.a5.sosa) { const id = Number(c.dataset.treePerson) || 0; let s = 0; try { s = Number(A().sosaNumberFor?.(id)) || 0; } catch (_) {} if (!s && c.dataset.lcSosa) s = Number(c.dataset.lcSosa); if (s) c.insertAdjacentHTML('beforeend', `<span class="lc-tree-sosa lc-dz" title="Sosa ${s}">${s}</span>`); }
        });
    }
    /** A7 : sans la barre bleue, le temps qui reste s'écrit en secondes */
    function toastSeconds(root, on) {
        root.querySelectorAll('.toast.ui-toast').forEach(t => {
            const bar = t.querySelector('.ui-toast-bar'); let sec = t.querySelector('.lc-toast-s');
            if (!on || !bar) { sec?.remove(); return; }
            const total = Number(t.dataset.lcTotal) || 6000, left = Math.max(0, parseFloat(bar.style.width || '100') / 100 * total);
            if (!sec) { sec = t.ownerDocument.createElement('span'); sec.className = 'lc-toast-s'; sec.setAttribute('aria-hidden', 'true'); (t.querySelector('.ui-toast-acts') || bar).before(sec); }
            const txt = `${Math.ceil(left / 1000)} s`; if (sec.textContent !== txt) sec.textContent = txt;
        });
    }
    const icMode = new WeakMap(); // la façon dont les icônes de chaque page sont dessinées
    /** tout ce qui se dessine sur l'écran d'un réglage, sur une page ou un aperçu */
    function decorate(root, G, ctx = {}) {
        if (!root) return;
        const iconsOn = isOn(G, 'a3');
        const want = iconsOn ? G.a3.v : '';
        const doc = root.ownerDocument || document;
        if ((icMode.get(doc) || '') !== want) { unwrapIcons(root); icMode.set(doc, want); }
        if (want) wrapIcons(root, want, doc);
        rowAvatars(root, isOn(G, 'a8') && G.a8.av, ctx.people || A().state?.people);
        treeCards(root, G);
        toastSeconds(root, isOn(G, 'a7') && !G.a7.bar);
        if (ctx.detail) decorateHero(root.querySelector('.person-hero'), ctx.detail, G);
    }
    // sur la page : un seul passage par image, seulement quand un réglage le demande
    let queued = false, mo = null, busy = false;
    const needsWork = G => isOn(G, 'a3') || (isOn(G, 'a8') && G.a8.av) || isOn(G, 'a5') || (isOn(G, 'a7') && !G.a7.bar)
        || document.querySelector('.lc-ic, .lc-row-av, .lc-tree-sosa, .lc-toast-s, [data-lc-title]');
    function scheduleDecorate() {
        if (queued || typeof requestAnimationFrame !== 'function') return; queued = true;
        requestAnimationFrame(() => {
            queued = false; const G = cur();
            ficheScope(G); // une fiche qui vient de s'afficher prend son style
            if (!document.body || !needsWork(G)) return;
            busy = true;
            try { decorate(document.body, G); const hero = document.querySelector('#workspace .person-hero'); if (hero && lastDetail && Number(lastDetail.person?.id) === Number(A().state?.currentPersonId) && !hero.classList.contains('lc-hero') && isOn(G, 'a4')) decorateHero(hero, lastDetail, G); } catch (e) { console.warn(e); }
            mo?.takeRecords(); busy = false;
        });
    }
    function watch() {
        if (!document.body || typeof MutationObserver === 'undefined') return false;
        mo = new MutationObserver(recs => { if (busy) return; if (recs.some(r => r.addedNodes.length)) scheduleDecorate(); });
        mo.observe(document.body, {childList: true, subtree: true});
        // les secondes des messages : une fois par seconde, seulement s'il y en a
        setInterval(() => { const G = cur(); if (isOn(G, 'a7') && !G.a7.bar && document.querySelector('.toast.ui-toast')) toastSeconds(document.body, true); }, 500);
        return true;
    }
    if (typeof document !== 'undefined' && document.addEventListener) { if (!watch()) document.addEventListener('DOMContentLoaded', () => { watch(); scheduleDecorate(); }, {once: true}); }

    /* ═════════════════════════ Aperçus : de vrais morceaux de l'app, avec ses feuilles de style ═════════════════════════
     * Chaque aperçu est une petite page à part (iframe) : les styles de l'app, les attributs du réglage montré sur son <html>,
     * et les écrans dessinés avec les classes de l'app et tes données (la fiche ouverte, tes personnes, ton arbre, ton tableau
     * de bord tel qu'il s'est affiché). Rien n'y est cliquable : on choisit en cliquant la carte. */
    const SNAP = {}; // dernières vues de l'app (en mémoire seulement) : dash, fiche
    function cleanClone(el) {
        const c = el.cloneNode(true);
        unwrapIcons(c);
        c.querySelectorAll('.person-hero').forEach(undecorateHero);
        c.querySelectorAll('.lc-dz, .lc-journal, .lc-row-av, .lc-tree-sosa, script').forEach(x => x.remove());
        c.querySelectorAll('[id]').forEach(x => x.removeAttribute('id'));
        return c;
    }
    function snapshot() {
        try {
            const dash = document.querySelector('#workspace > .dashboard-page');
            if (dash && dash.querySelector('.dashboard-widget')) {
                const c = cleanClone(dash);
                const grid = c.querySelector(':scope > .dashboard-grid');
                if (grid) { [...grid.children].slice(8).forEach(x => x.remove()); grid.querySelectorAll('.dashboard-widget.is-editing').forEach(x => x.classList.remove('is-editing')); }
                c.querySelector('.dash-pages')?.remove();
                const html = c.outerHTML; if (html.length < 400000) SNAP.dash = html;
            }
            const page = document.querySelector('#workspace > .person-page');
            if (page && lastDetail && page.querySelector('.person-hero')) {
                const c = cleanClone(page);
                const grid = c.querySelector('.card-grid'); if (grid) [...grid.children].slice(2).forEach(x => x.remove());
                c.querySelectorAll('.person-hero-labels').forEach(x => x.remove());
                const html = c.outerHTML; if (html.length < 400000) SNAP.fiche = {html, detail: lastDetail};
            }
        } catch (_) {}
    }
    const PERSON_ICONS = {
        bookmark: '<path d="M7 4h10v16l-5-4-5 4z"/>', delete: '<path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5m4-5v5"/>',
        unlock: '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 7.3-2.2M12 14v3"/>', history: '<path d="M12 8v5l3 2"/><path d="M4 12a8 8 0 1 0 2.3-5.7M4 4v5h5"/>',
        add: '<path d="M12 5v14M5 12h14"/>', edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    };
    const iconAction = (k, label) => `<button type="button" class="icon-action icon-${k}${k === 'delete' ? ' is-danger' : ''}" aria-label="${esc(label)}" title="${esc(label)}"><svg viewBox="0 0 24 24" aria-hidden="true">${PERSON_ICONS[k]}</svg></button>`;
    const pName = p => esc([p.first_name, p.last_name].filter(Boolean).join(' ') || p.name || 'Sans nom');
    const yearsTxt = p => { const b = p.birth_date || p.birth_year || '', d = p.death_date || p.death_year || ''; return b || d ? `${b || '?'} — ${d || (p.living_status === 'living' ? '' : '?')}` : ''; };
    const relYears = p => `${p.birth_year || '?'} — ${p.death_year || (p.living_status === 'living' ? '…' : '?')}`;
    function portraitHtml(p, size = 88) {
        if (UI().avatarOn?.()) return `<span class="portrait-lc" aria-hidden="true">${UI().avatar({...p, name: nameOf(p), photo: p.portrait ? mediaUrl(p.portrait) : ''}, size)}</span>`;
        return p.portrait ? `<img class="portrait" src="${esc(mediaUrl(p.portrait))}" alt="">` : `<div class="${cls('portrait', 'portrait-placeholder')}">${esc(((p.first_name || '')[0] || '') + ((p.last_name || '')[0] || ''))}</div>`;
    }
    const badge = (t, k) => `<span class="ui-badge is-${k}">${esc(t)}</span>`;
    function ficheHtml(D, {full = true} = {}) {
        if (SNAP.fiche && D && SNAP.fiche.detail?.person?.id === D.person?.id) {
            if (full) return SNAP.fiche.html;
            const box = document.createElement('div'); box.innerHTML = SNAP.fiche.html;
            box.querySelectorAll('.card-grid, .relations-strip').forEach(x => x.remove());
            return box.innerHTML;
        }
        const p = D?.person || {first_name: 'Louise', last_name: 'BORIE', gender: 'female', id: 1, living_status: 'deceased'};
        let sosa = 0; try { sosa = Number(A().sosaNumberFor?.(p.id)) || 0; } catch (_) {}
        const status = `${sosa ? badge(`Sosa ${sosa}`, 'sosa') : ''}${badge(`${p.living_status === 'deceased' ? '† ' : ''}${p.living_status === 'living' ? (fem(p) ? 'Vivante' : 'Vivant') : p.living_status === 'deceased' ? (fem(p) ? 'Décédée' : 'Décédé') : 'À vérifier'}`, ({living: 'green', deceased: 'black'})[p.living_status] || 'yellow')}${Number(p.is_artist) ? '<span class="ui-badge artist-badge">🎨 Artiste</span>' : ''}`;
        const hero = `<div class="person-hero">${portraitHtml(p)}<div><span class="eyebrow">FICHE INDIVIDUELLE · #${esc(p.id)}</span><h2>${pName(p)}</h2><div class="person-meta"><span>${esc(yearsTxt(p))}</span><span>Genre : <strong>${p.gender === 'female' ? 'Féminin' : p.gender === 'male' ? 'Masculin' : 'Inconnu'}</strong></span>${p.surname_group ? `<span>Groupe : <strong>${esc(p.surname_group)}</strong></span>` : ''}</div></div>
            <div class="person-hero-tools"><div class="person-hero-status">${status}</div><div class="person-hero-actions">${iconAction('bookmark', 'Ajouter aux signets')}${iconAction('delete', 'Supprimer cette fiche')}${iconAction('unlock', 'Verrouiller la fiche')}${iconAction('history', 'Historique de la fiche')}</div></div></div>`;
        if (!full) return `<article class="page person-page">${hero}</article>`;
        const chips = (label, list, w) => `<div class="relation-group"><div class="relation-heading"><span>${label}</span>${w ? iconAction('add', `Ajouter : ${label}`) : ''}</div><div class="relation-chips">${list.length ? list.map(x => `<div class="relation-entry"><button class="relation-chip"><strong>${pName(x)}</strong><small>${esc(relYears(x))}</small></button></div>`).join('') : `<div class="empty-line"><span class="empty-line-ico" aria-hidden="true">${w === 'child' ? '👶' : w === 'spouse' ? '💍' : '👥'}</span><span class="empty-line-text">${w === 'child' ? 'Aucun enfant' : w === 'spouse' ? 'Aucun conjoint' : 'Aucun connu'}</span>${w ? `<button type="button" class="button small secondary">＋ Ajouter un ${w === 'child' ? 'enfant' : 'conjoint'}</button>` : ''}</div>`}</div></div>`;
        const rel = `<div class="relations-strip">${chips('Parents', D?.parents || [], 'parent')}${chips('Conjoints', D?.partners || [], 'spouse')}${chips('Enfants', D?.children || [], 'child')}${chips('Frères &amp; sœurs', D?.siblings || [], '')}</div>`;
        const kv = [['Prénom', p.first_name], ['Nom inscrit', p.last_name], ['Genre', p.gender === 'female' ? 'Féminin' : p.gender === 'male' ? 'Masculin' : '—'], ['Métier', occOf(D) || '—']];
        const ident = `<section class="card span-4"><header class="card-head"><div class="card-title"><span class="card-index">01</span><h3>Identité</h3></div><div class="card-head-actions">${iconAction('edit', 'Modifier')}</div></header><div class="card-body"><dl class="data-list">${kv.map(([k, v]) => `<div class="data-row"><dt>${esc(k)}</dt><dd>${esc(v || '—')}</dd></div>`).join('')}</dl></div></section>`;
        const evs = (D?.events || []).slice(0, 3).map(e => `<div class="event-row"><span class="event-icon" style="--event-color:${esc(/^#[0-9a-f]{3,8}$/i.test(e.color || '') ? e.color : '#0066cc')}">${e.gedcom_tag === 'DEAT' ? '✝' : e.gedcom_tag === 'MARR' ? '∞' : '✶'}</span><div class="event-date">${esc(e.date_text || 'Date inconnue')}</div><div class="event-content"><div class="item-title-row"><strong>${esc(e.type_label || e.gedcom_tag)}</strong></div><small>${esc(e.place_name || '')}</small></div></div>`).join('');
        const events = `<section class="card span-8"><header class="card-head"><div class="card-title"><span class="card-index">02</span><h3>Événements <small>(${(D?.events || []).length})</small></h3></div><div class="card-head-actions">${iconAction('add', 'Ajouter un événement')}</div></header><div class="card-body"><div class="event-list">${evs || '<div class="empty-line"><span class="empty-line-ico" aria-hidden="true">📅</span><span class="empty-line-text">Aucun événement</span></div>'}</div></div></section>`;
        return `<article class="page person-page">${hero}${rel}<div class="card-grid">${ident}${events}</div></article>`;
    }
    function listeHtml(people, n = 7) {
        const rows = (people || []).slice(0, n);
        const st = s => ({deceased: 'Décédé(e)', living: 'Vivant(e)'})[s] || 'À vérifier';
        return `<section class="page lcd-pv-list"><div class="lcd-pv-count">${esc(A().plural ? A().plural((people || []).length, 'personne') : (people || []).length + ' personnes')}</div><div class="data-table-wrap"><table class="data-table"><thead><tr><th><button>Nom</button></th><th><button>Naissance</button></th><th><button>Décès</button></th><th><button>Groupe</button></th></tr></thead><tbody>${rows.map((p, i) => `<tr${i === 3 ? ' class="is-selected"' : ''}><td><button class="table-link" data-open-person="${esc(p.id)}">${pName(p)}</button></td><td>${esc(p.birth_date || '—')}</td><td>${esc(p.death_date || '—')}</td><td>${esc(p.surname_group || p.last_name || '—')}</td></tr>`).join('')}</tbody></table></div></section>`;
    }
    function sideHtml(people, curId) {
        const rows = (people || []).slice(0, 5);
        const PG = PREVIEW_G || cur(), lcAv = UI().avatarOn?.() || (isOn(PG, 'a8') && PG.a8.av);
        return `<div class="lcd-pv-side"><div class="person-list">${rows.map((p, i) => `<button class="person-list-item ${lcAv ? 'has-lc-av' : ''} ${(curId ? Number(p.id) === Number(curId) : i === 2) ? 'is-active' : ''}"><span class="life-dot ${esc(p.living_status || '')}"></span>${lcAv && UI().avatar ? UI().avatar({...p, name: nameOf(p), photo: p.portrait ? mediaUrl(p.portrait) : ''}, 34) : ''}<span class="person-list-copy"><strong>${pName(p)}</strong><small>${esc(yearsTxt(p) || '—')}</small></span></button>`).join('')}</div></div>`;
    }
    function menuHtml(people) {
        const q = 'bor', rows = (people || []).filter(p => /bor/i.test(p.last_name || '')).slice(0, 5);
        const list = rows.length ? rows : (people || []).slice(0, 5);
        const hl = s => esc(s).replace(/^(bor)/i, '<mark>$1</mark>');
        const av = p => (UI().avatarOn?.() ? UI().avatar({...p, name: nameOf(p)}, 34) : `<span class="${cls('pk-av', p.gender === 'male' ? 'm' : p.gender === 'female' ? 'f' : 'u')}" aria-hidden="true">${esc(((p.first_name || '')[0] || '') + ((p.last_name || '')[0] || ''))}</span>`);
        return `<div class="lcd-pv-menu"><div class="pk-search"><div class="pk-box"><span class="pk-ico" aria-hidden="true">🔍</span><input type="text" class="pk-input" value="${q}" readonly tabindex="-1"><span class="pk-kbd">Échap</span></div><div class="pk-list" role="listbox"><div class="pk-hint">${esc(A().plural ? A().plural(list.length, 'fiche trouvée', 'fiches trouvées') : list.length + ' fiches trouvées')}</div>${list.map((p, i) => { let s = 0; try { s = Number(A().sosaNumberFor?.(p.id)) || 0; } catch (_) {} const meta = [p.birth_date ? `° ${p.birth_date}` : '', p.death_date ? `† ${p.death_date}` : ''].filter(Boolean).join(' · '); return `<div class="pk-item pk-row${i === 0 ? ' on' : ''}" role="option"><span class="lcd-pk-sym">${av(p)}</span><div class="pk-txt"><div class="pk-name">${esc(p.first_name || '')} ${hl(p.last_name || '')}</div>${meta ? `<div class="pk-meta">${esc(meta)}</div>` : ''}</div>${s ? `<span class="pk-badge sosa">Sosa ${s}</span>` : ''}</div>`; }).join('')}<div class="pk-item pk-create"><span class="pk-ic" aria-hidden="true">＋</span><div class="pk-txt"><div class="pk-name">Créer la fiche « Bor »</div></div></div></div></div></div>`;
    }
    function fenetreHtml(people) {
        const sp = (people || []).find(p => p.gender === 'male') || (people || [])[0] || {first_name: 'Jean', last_name: 'MARTIN'};
        return `<div class="lcd-pv-modal"><div class="modal is-preview" role="presentation"><div class="modal-head"><div><span class="eyebrow">LIEN FAMILIAL</span><h2>Ajouter un conjoint</h2></div><button type="button" class="icon-button" aria-label="Fermer">×</button></div>
            <div class="form-grid one-column"><label>Utiliser<select><option>Une personne existante</option></select></label><label>Personne<span class="pk-chip"><span class="lcd-chip-av">${UI().avatarOn?.() ? UI().avatar({...sp, name: nameOf(sp)}, 22) : ''}</span><span><b>${pName(sp)}</b> <small>${esc(relYears(sp))}</small></span><button type="button" class="go">↗ Fiche</button><button type="button" class="x">×</button></span></label><label>Date du mariage<input type="text" value="12 juin 1948" readonly></label></div>
            <div class="modal-actions"><button type="button" class="button secondary danger">🗑 Supprimer</button><span class="spacer"></span><button type="button" class="button secondary">Annuler</button><button type="button" class="button">Ajouter la relation</button></div></div></div>`;
    }
    function boutonsHtml() {
        return `<div class="lcd-pv-btns"><button type="button" class="button">✓ Enregistrer</button><button type="button" class="button secondary">Annuler</button><button type="button" class="button secondary">✎ Modifier</button><button type="button" class="button secondary">＋ Ajouter un conjoint</button><button type="button" class="button secondary danger">🗑 Supprimer</button><button type="button" class="button small secondary">⤓ Exporter</button><button type="button" class="icon-button" title="Réglages">⚙️</button><button type="button" class="icon-button" title="Fermer">×</button></div>`;
    }
    function navHtml() {
        const tabs = [['01', 'Tableau de bord'], ['02', 'Personnes', 1], ['03', 'Graphiques'], ['04', 'Carte'], ['05', 'Listes'], ['06', 'Chronologie']];
        return `<div class="lcd-pv-nav"><nav class="main-nav">${tabs.map(([n, t, on]) => `<button class="nav-item${on ? ' is-active' : ''}"><span>${n}</span>${t}</button>`).join('')}</nav></div>`;
    }
    function arbreHtml(tree, people) {
        const th = window.LCNDA_PARTS?.treeHtml;
        if (tree && th) { try { return `<div class="lcd-pv-tree"><div class="tree"><ul><li>${th(tree)}</li></ul></div></div>`; } catch (_) {} }
        const ps = (people || []).slice(0, 7);
        const card = p => (p ? `<div class="tree-node-shell"><div class="tree-person-unit"><button class="tree-card gender-${esc(p.gender || 'unknown')}" data-tree-person="${esc(p.id)}"><strong>${pName(p)}</strong><small>${esc(relYears(p))}</small></button></div></div>` : '');
        const li = (p, kids) => `<li>${card(p)}${kids ? `<ul>${kids.join('')}</ul>` : ''}</li>`;
        return `<div class="lcd-pv-tree"><div class="tree"><ul>${li(ps[0], [li(ps[1], [li(ps[3]), li(ps[4])]), li(ps[2], [li(ps[5]), li(ps[6])])])}</ul></div></div>`;
    }
    function dashHtml(stats) {
        if (SNAP.dash) return SNAP.dash;
        const s = stats || A().state?.bootstrap?.stats || {};
        const kpi = [['personnes', 'Personnes'], ['événements', 'Événements'], ['médias', 'Médias'], ['familles', 'Familles']].map(([k, t]) => `<div><strong>${esc(s[k] ?? 0)}</strong><span>${t}</span></div>`).join('');
        const w = (i, title, body, span, extra = '') => `<section class="card ${span} dashboard-widget"><header class="card-head"><div class="card-title"><span class="card-index">${i}</span><h3>${title}</h3></div><div class="dashboard-widget-tools"><button type="button" class="icon-action" title="Modifier le widget">✎</button><button type="button" class="icon-action danger" title="Supprimer ce widget">×</button></div></header><div class="card-body">${body}</div>${extra}</section>`;
        return `<section class="page dashboard-page"><header class="page-header"><div><span class="eyebrow">TABLEAU DE BORD</span><h2>Vue d’ensemble</h2><p>Un point rapide sur la base, les dates qui approchent, les modifications récentes et le travail à suivre.</p></div></header><div class="card-grid dashboard-grid">
            ${w('01', 'Chiffres clés', `<div class="dashboard-metrics">${kpi}</div>`, 'span-12')}
            ${w('02', 'Bilan de recherche', '<p>Ce mois-ci : des fiches créées et des sources ajoutées.</p>', 'span-6')}
            ${w('03', 'Rappels', '<div class="empty-line"><span class="empty-line-ico" aria-hidden="true">🔔</span><span class="empty-line-text">Aucun rappel</span></div>', 'span-6')}
            ${w('04', 'Anniversaires du jour', '<div class="empty-line"><span class="empty-line-ico" aria-hidden="true">🎂</span><span class="empty-line-text">Aucun anniversaire aujourd’hui</span></div>', 'span-4')}
        </div></section>`;
    }
    function motionHtml() {
        return `<div class="lcd-mv"><div class="lcd-mv-page"><div class="segmented lcd-mv-tabs"><button class="is-active">Fiche</button><button>Notes</button><i aria-hidden="true"></i></div><button type="button" class="button secondary lcd-mv-press">＋ Ajouter un conjoint</button></div>
            <div class="lcd-mv-veil"></div><div class="lcd-mv-win"><div class="modal is-preview"><div class="modal-head"><div><span class="eyebrow">LIEN FAMILIAL</span><h2>Ajouter un conjoint</h2></div></div><div class="modal-actions"><span class="spacer"></span><button type="button" class="button secondary">Annuler</button><button type="button" class="button">Ajouter</button></div></div></div>
            <div class="lcd-mv-toast"><div class="toast ui-toast" data-lc-total="6000"><span class="ui-toast-text">✓ Conjoint ajouté</span><span class="ui-toast-acts"><button type="button" class="ui-toast-btn">↶ Annuler</button></span><span class="lcd-mv-sec" aria-hidden="true"></span><span class="ui-toast-bar" aria-hidden="true"></span></div></div><i class="lcd-mv-cur" aria-hidden="true"></i></div>`;
    }
    const SCREENS = {
        nav: ['La barre du haut', () => navHtml(), 900],
        fiche: ['La fiche d’une personne', d => ficheHtml(d.detail), 1000],
        ficheHead: ['L’en-tête de la fiche', d => ficheHtml(d.detail, {full: false}), 1000],
        liste: ['Une liste (Listes · Personnes)', d => listeHtml(d.people), 860],
        side: ['La colonne Personnes', d => sideHtml(d.people, d.detail?.person?.id), 340],
        menu: ['Le menu de choix d’une personne', d => menuHtml(d.people), 560],
        fenetre: ['Une fenêtre', d => fenetreHtml(d.people), 700],
        arbre: ['L’arbre (Graphiques)', d => arbreHtml(d.tree, d.people), 900],
        dash: ['Le tableau de bord', d => dashHtml(d.stats), 1200],
        boutons: ['Des boutons', () => boutonsHtml(), 760],
        motion: ['Ouvrir une fenêtre, un message', () => motionHtml(), 560],
    };

    /* ── une petite page d'aperçu ── */
    const DARK = {blue: '#4d9fff', bg: '#1a1a1a', paper: '#1a1a1a', card: '#242424', cardHead: '#2e2e2e'};
    const LIGHT = {blue: '#0066cc', bg: '#ffffff', paper: '#ffffff', card: '#ffffff', cardHead: '#fafafa'};
    function frameDocHtml(inner, W) {
        const links = [...document.querySelectorAll('link[rel="stylesheet"]')].map(l => `<link rel="stylesheet" href="${esc(l.href)}"${l.id ? ` id="${esc(l.id)}"` : ''} media="${esc(l.getAttribute('media') || 'all')}">`).join('');
        const styles = [...document.head.querySelectorAll('style')].map(s => `<style>${s.textContent.replace(/<\/style/gi, '<\\/style')}</style>`).join('');
        return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><base href="${esc(location.href.split('#')[0])}">${links}${styles}<style>html,body{overflow:hidden!important;height:auto!important;min-height:0!important}body{margin:0;background:var(--paper)}.lcd-pv-root{width:${W}px;box-sizing:border-box;padding:14px}:root[data-lc-fz] .lcd-pv-root{width:calc(${W}px / var(--lc-fz))}</style></head><body class="lcd-pv-body"><div class="lcd-pv-root">${inner}</div></body></html>`;
    }
    function copyRoot(r, dark) {
        const src = document.documentElement;
        [...src.attributes].forEach(at => { if (at.name === 'style' || at.name === 'id' || at.name.startsWith('data-lc-')) return; r.setAttribute(at.name, at.value); });
        r.style.cssText = src.style.cssText;
        VARS.forEach(n => r.style.removeProperty(n));
        const isDark = src.dataset.theme === 'dark';
        if (dark && !isDark) { r.dataset.theme = 'dark'; ['--blue', '--bg', '--paper', '--card-bg', '--card-head-bg'].forEach((k, i) => r.style.setProperty(k, [DARK.blue, DARK.bg, DARK.paper, DARK.card, DARK.cardHead][i])); r.classList.remove('lc-frame'); r.style.removeProperty('--ink'); }
        if (!dark && isDark) { r.removeAttribute('data-theme'); ['--blue', '--bg', '--paper', '--card-bg', '--card-head-bg'].forEach((k, i) => r.style.setProperty(k, [LIGHT.blue, LIGHT.bg, LIGHT.paper, LIGHT.card, LIGHT.cardHead][i])); r.classList.remove('lc-frame'); r.style.removeProperty('--ink'); }
    }
    const fitAll = new Set();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(entries => entries.forEach(e => e.target.lcdFit?.())) : null;
    /** pose un aperçu dans slot : {G, dark, screens, data, W, labels} ; l'ancien reste jusqu'à ce que le nouveau soit prêt */
    function mountFrame(slot, o) {
        if (!slot) return;
        const W = o.W || Math.max(...o.screens.map(k => SCREENS[k][2]));
        PREVIEW_G = o.G; // les écrans dessinés pour cet aperçu suivent son réglage (portrait des cases d'arbre, des lignes)
        let inner;
        try { inner = o.html != null ? `<div class="lcd-pv-screen" data-s="html">${o.html}</div>` : o.screens.map(k => `${o.labels ? `<div class="lcd-pv-label">${esc(SCREENS[k][0])}${o.labelSuffix || ''}</div>` : ''}<div class="lcd-pv-screen" data-s="${k}">${SCREENS[k][1](o.data || {})}</div>`).join(''); } finally { PREVIEW_G = null; }
        const f = document.createElement('iframe');
        f.className = 'lcd-frame is-loading'; f.setAttribute('aria-hidden', 'true'); f.tabIndex = -1; f.title = 'Aperçu';
        f.style.width = `${W}px`;
        const token = (slot.lcdToken = (slot.lcdToken || 0) + 1);
        slot.lcdFit = () => { const fr = slot.querySelector('.lcd-frame:not(.is-loading)'); if (!fr) return; if (Number(fr.dataset.h || 0) < 20 && fr.lcdMeasure && slot.clientWidth) fr.lcdMeasure(); const FW = Number(fr.dataset.w) || W, k = Math.min(1, (slot.clientWidth || FW) / FW); fr.style.transform = `scale(${k})`; slot.style.height = `${Math.ceil((Number(fr.dataset.h) || 200) * k)}px`; };
        f.addEventListener('load', () => {
            if (slot.lcdToken !== token) { f.remove(); return; }
            const d = f.contentDocument; if (!d) return;
            copyRoot(d.documentElement, !!o.dark);
            applyTo(d.documentElement, o.G);
            d.documentElement.classList.add('lcd-pv-html');
            try { decorate(d.body, o.G, {detail: o.data?.detail, people: o.data?.people, stats: o.data?.stats}); } catch (e) { console.warn(e); }
            const measure = () => { const root = d.querySelector('.lcd-pv-root'); const h = Math.ceil(root ? root.getBoundingClientRect().height : 200); f.dataset.h = String(h); f.style.height = `${h}px`; const sw = Math.ceil(root ? root.scrollWidth + 60 : W); if (sw > W + 2) { f.dataset.w = String(sw); f.style.width = `${sw}px`; root.style.width = `${sw}px`; } }; // un arbre plus large que prévu : tout l'aperçu rapetisse
            f.lcdMeasure = measure; // un aperçu dessiné caché (onglet pas encore ouvert) se remesure quand il apparaît
            requestAnimationFrame(() => {
                measure();
                slot.querySelectorAll('.lcd-frame').forEach(x => { if (x !== f) x.remove(); });
                f.classList.remove('is-loading'); slot.lcdFit();
                setTimeout(() => { if (f.isConnected) { measure(); slot.lcdFit(); } }, 350); // les polices et les images arrivent
            });
        }, {once: true});
        f.srcdoc = frameDocHtml(inner, W);
        slot.appendChild(f);
        if (ro && !slot.lcdObs) { slot.lcdObs = true; ro.observe(slot); }
    }

    /* ═════════════════════════ Réglages → 🎨 Designs au choix ═════════════════════════ */
    const PCARD = {a1: ['ficheHead'], a2: ['liste', 'ficheHead'], a3: ['ficheHead', 'boutons'], a4: ['ficheHead'], a5: ['arbre'], a6: ['fenetre', 'boutons'], a7: ['motion'], a8: ['liste', 'side']};
    const PPREV = {a1: ['fiche'], a2: ['liste', 'fiche', 'side', 'menu'], a3: ['fiche', 'dash', 'boutons'], a4: ['fiche'], a5: ['arbre'], a6: ['fenetre', 'boutons', 'ficheHead'], a7: ['motion', 'boutons'], a8: ['liste', 'side', 'menu']};
    const lsGet = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v ?? d; } catch (_) { return d; } };
    const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };
    const openSet = () => { const o = lsGet(OPEN_KEY, []); return new Set(Array.isArray(o) ? o.filter(x => IDS.includes(x)) : []); };
    const prevPrefs = () => { const o = lsGet(PREV_KEY, {}); return o && typeof o === 'object' ? o : {}; };
    const modeOf = id => { const m = prevPrefs()[id]; return ['clair', 'sombre', 'deux'].includes(m) ? m : (A().state && document.documentElement.dataset.theme === 'dark' ? 'sombre' : 'clair'); };
    const choiceName = (G, id) => { const v = V(id, G[id].v); return v.t + (G[id].v === 'avant' && !/comme avant/i.test(v.t) ? ' (comme avant)' : ''); };
    const tagHtml = (v, mod) => `${v.k === 'avant' ? '<span class="lcd-tag">Par défaut</span>' : '<span class="lcd-tag is-new">Nouveau</span>'}${mod ? '<span class="lcd-tag is-mod">retouché</span>' : ''}`;
    const whyList = why => `<ul class="lcd-why-list">${why.map(([i, t]) => `<li><span aria-hidden="true">${i}</span><span>${t}</span></li>`).join('')}</ul>`;
    let PAGE = null; // {box, data, G}
    /** la page n'a plus A5 : les cases des arbres se règlent dans Graphiques → 🎨 Couleurs (fenêtre « Statistiques et arbres », ext.treeCards plus bas) */
    const PAGE_IDS = IDS.filter(id => !['a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8'].includes(id)); // A7 Mouvements : dans Réglages → Accessibilité, onglet « 🎞 Mouvement » ; A6 Boutons : dans Réglages → Notifications et boutons ; A2 Densité, A3 Icônes, A8 Listes : dans Menus, colonne et listes (même moteur, même stockage)
    /** A4 « Fiche d'une personne » est dans Réglages → Apparence → Fiches personnes et animaux (cadre « Forme de l'en-tête ») : même moteur, même stockage */
    const EMBS = {}; // {a4: {box, data}, a6: …} : les cadres posés ailleurs (A4 dans la page des fiches, A6 dans Notifications et boutons)
    const embOf = id => (EMBS[id]?.box.isConnected ? EMBS[id] : null);
    const ctxOf = box => Object.values(EMBS).find(e => e.box === box) || PAGE;

    function summaryHtml(id, G) {
        const D = DEFS[id], mod = isModified(G, id);
        return `<span class="lcd-sec-ic" aria-hidden="true">${D.icon}</span><b class="lcd-sec-t">${esc(D.title)}</b><span class="lcd-sep">—</span><span class="lcd-cur${isOn(G, id) ? ' is-chg' : ''}">${esc(V(id, G[id].v).t)}</span>${mod ? '<span class="lcd-tag is-mod">retouché</span>' : ''}`;
    }
    function tocHtml(G) {
        return `<nav class="lcd-toc" aria-label="Aller à un réglage"><ol>${PAGE_IDS.map(id => [id, DEFS[id].icon, DEFS[id].title]).map(([id, n, t]) => {
            const curT = choiceName(G, id) + (isModified(G, id) ? ' · retouché' : '');
            const chg = isOn(G, id);
            return `<li><button type="button" class="lcd-toc-i" data-lcd-go="${id}"><span class="lcd-toc-ic" aria-hidden="true">${n}</span><span class="lcd-toc-tx"><b>${esc(t)}</b><small class="${chg ? 'is-chg' : ''}">${esc(curT)}</small></span></button></li>`;
        }).join('')}</ol></nav>`;
    }
    function sectionShell(id, open) {
        const D = DEFS[id];
        return `<details class="lcd-sec" id="lcd-${id}" data-lcd-sec="${id}"${open ? ' open' : ''}><summary class="lcd-sum"><span class="lcd-sum-t" data-lcd-sum></span><span class="lcd-saved" data-lcd-saved role="status"></span><span class="lcd-chev" aria-hidden="true"></span></summary><div class="lcd-body" data-lcd-body>${open ? '' : ''}</div></details>`;
    }
    function bodyHtml(id, G) {
        const D = DEFS[id];
        return `<div class="lcd-head"><p class="muted">${esc(D.q)} ${esc(D.help)}</p><button type="button" class="button small secondary" data-lcd-reset="${id}">↺ Remettre comme au départ</button></div>
            <div class="lcd-choices ${D.cols}" role="radiogroup" aria-label="${esc(D.title)}" data-lcd-choices="${id}"></div>
            <div class="lcd-settings"><div class="lcd-settings-col"><h4 class="lcd-h"><span class="lcd-step is-small">2</span>Réglages en plus</h4><p class="muted lcd-sub">Ils partent du choix du dessus. Si tu en changes un, la carte choisie affiche « retouché ».</p><div class="lcd-set-list" data-lcd-set="${id}"></div></div>
            <aside class="lcd-preview" data-lcd-preview="${id}"><div class="lcd-preview-head"><b>👁 Aperçu vivant</b>${modeSeg(id)}</div><div class="lcd-preview-body" data-lcd-prevbody></div></aside></div>
            <div class="lcd-foot"><button type="button" class="button secondary" data-lcd-reset="${id}">↺ Remettre comme au départ</button><p class="muted">Le changement est gardé tout de suite (« ✓ Enregistré »), sans bouton. Un message en bas à gauche propose « ↶ Annuler ».</p></div>`;
    }
    function modeSeg(id) { const m = modeOf(id); return `<div class="segmented lcd-mode" role="group" aria-label="Clair ou sombre" data-lcd-mode="${id}">${[['clair', '☀︎ Clair'], ['sombre', '☾ Sombre'], ['deux', 'Les deux']].map(([k, t]) => `<button type="button" data-m="${k}" class="${m === k ? 'is-active' : ''}" aria-pressed="${m === k}">${t}</button>`).join('')}</div>`; }
    function choicesFill(box, id, G, data) {
        const host = box.querySelector(`[data-lcd-choices="${id}"]`); if (!host) return;
        const D = DEFS[id], curV = G[id].v;
        host.innerHTML = D.variants.map(v => { const on = curV === v.k, mod = on && isModified(G, id);
            return `<div class="lcd-choice${on ? ' is-active' : ''}" role="radio" tabindex="0" aria-checked="${on}" data-lcd-v="${v.k}"><div class="lcd-choice-top"><span class="lcd-radio"></span><h3>${esc(v.t)}</h3>${tagHtml(v, mod)}</div><div class="lcd-choice-sub muted">${esc(v.sub || '')}</div><div class="lcd-stage${id === 'a7' ? ' is-tall' : ''}" data-lcd-stage></div>${whyList(v.why)}</div>`; }).join('');
        host.querySelectorAll('[data-lcd-v]').forEach(c => { const S = clone(G); S[id] = c.dataset.lcdV === curV ? clone(G[id]) : {...defOf(id, c.dataset.lcdV), ...(id === 'a5' ? {m: G.a5.m, f: G.a5.f} : {})}; mountFrame(c.querySelector('[data-lcd-stage]'), {G: S, dark: false, screens: PCARD[id], data, W: ({a5: 880, a7: 560})[id] || 880}); });
    }
    function settingsFill(box, id, G) {
        const host = box.querySelector(`[data-lcd-set="${id}"]`); if (!host) return;
        const o = G[id];
        host.innerHTML = DEFS[id].settings.map((s, i) => {
            const off = s.only && !s.only.includes(o.v);
            const onlyNames = s.only ? s.only.map(k => `« ${V(id, k).t} »`).join(' ou ') : '';
            let ctl = '';
            const key = Array.isArray(s.k) ? s.k.join('-') : s.k;
            if (s.type === 'select') ctl = `<select data-lcd-k="${s.k}" aria-label="${esc(s.label)}"${off ? ' disabled' : ''}>${s.options.map(([v, t]) => `<option value="${v}"${o[s.k] === v ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
            if (s.type === 'toggle') ctl = `<label class="ui-toggle"><input type="checkbox" data-lcd-k="${s.k}"${o[s.k] ? ' checked' : ''}${off ? ' disabled' : ''}><i></i><span>${esc(s.text)}</span></label>`;
            if (s.type === 'range' || s.type === 'colors') ctl = `<span class="lcd-slot" data-lcd-slot="${key}"></span>`;
            return `<div class="lcd-set${off ? ' is-off' : ''}" data-lcd-row="${key}"><div class="lcd-set-row"><span class="lcd-lab">${esc(s.label)}</span><div class="lcd-ctl">${ctl}</div></div>${off ? `<span class="lcd-offnote">Seulement avec ${esc(onlyNames)}.</span>` : ''}<p class="lcd-why"><b>Pourquoi ?</b> ${esc(s.why)}</p></div>`;
        }).join('');
        DEFS[id].settings.forEach(s => {
            const off = s.only && !s.only.includes(o.v);
            if (s.type === 'range') {
                const slot = host.querySelector(`[data-lcd-slot="${s.k}"]`); if (!slot) return;
                const d = defOf(id, o.v)[s.k];
                const field = UI().rangeField ? UI().rangeField({min: s.min, max: s.max, step: s.step, value: o[s.k], unit: s.unit, default: d, label: ''}) : null;
                let inp;
                if (field) { slot.appendChild(field); inp = field.input; field.querySelector('.ui-num-input')?.setAttribute('aria-label', `${s.label} (nombre)`); }
                else { slot.innerHTML = `<input type="range" min="${s.min}" max="${s.max}" step="${s.step}" value="${o[s.k]}">`; inp = slot.querySelector('input'); }
                inp.dataset.lcdK = s.k; inp.setAttribute('aria-label', s.label); if (off) { inp.disabled = true; field?.classList.add('is-disabled'); }
            }
            if (s.type === 'colors') {
                const keys = s.k, slot = host.querySelector(`[data-lcd-slot="${keys.join('-')}"]`); if (!slot) return;
                keys.forEach((k, i) => {
                    const val = o[k] || '#3c78d8';
                    const wrap = document.createElement('label'); wrap.className = 'lcd-color';
                    wrap.innerHTML = `<span>${esc(s.labels[i])}</span>`;
                    if (UI().colorField) { const f = UI().colorField({value: /^#[0-9a-f]{6}$/i.test(val) ? val : '#0066cc', compact: false}); f.input.dataset.lcdK = k; wrap.appendChild(f); }
                    else { wrap.insertAdjacentHTML('beforeend', `<input type="color" value="${esc(val)}" data-lcd-k="${k}">`); }
                    slot.appendChild(wrap);
                });
            }
        });
        UI().scan?.(host);
    }
    function previewFill(box, id, G, data) {
        const pv = box.querySelector(`[data-lcd-preview="${id}"]`); if (!pv) return;
        const m = modeOf(id);
        pv.querySelectorAll(`[data-lcd-mode="${id}"] button`).forEach(b => { b.classList.toggle('is-active', b.dataset.m === m); b.setAttribute('aria-pressed', String(b.dataset.m === m)); });
        const body = pv.querySelector('[data-lcd-prevbody]');
        const modes = m === 'deux' ? [false, true] : [m === 'sombre'];
        const screens = PPREV[id], W = undefined;
        if (body.children.length !== modes.length) body.innerHTML = modes.map(() => '<div class="lcd-stage is-preview"></div>').join('');
        [...body.children].forEach((slot, i) => mountFrame(slot, {G, dark: modes[i], screens, data, labels: true, W, labelSuffix: modes.length > 1 ? (modes[i] ? ' · sombre' : ' · clair') : ''}));
    }
    function fillEmbedded(id = 'a4') {
        const E = embOf(id); if (!E) { delete EMBS[id]; return; }
        const G = cur(), body = E.box.querySelector('[data-lcd-body]');
        E.box.querySelector('[data-lcd-sum]').innerHTML = `— ${esc(V(id, G[id].v).t)}${isModified(G, id) ? ' <span class="lcd-tag is-mod">retouché</span>' : ''}`;
        if (!body.firstElementChild) body.innerHTML = bodyHtml(id, G);
        choicesFill(body, id, G, E.data); settingsFill(body, id, G); previewFill(body, id, G, E.data);
    }
    function fillSection(id) {
        if (EMBS[id]) return fillEmbedded(id);
        if (!PAGE) return;
        const sec = PAGE.box.querySelector(`[data-lcd-sec="${id}"]`); if (!sec) return;
        const G = cur();
        sec.querySelector('[data-lcd-sum]').innerHTML = summaryHtml(id, G);
        if (!sec.open) { sec.querySelector('[data-lcd-body]').innerHTML = ''; return; }
        const body = sec.querySelector('[data-lcd-body]');
        if (!body.firstElementChild) body.innerHTML = bodyHtml(id, G);
        choicesFill(body, id, G, PAGE.data);
        settingsFill(body, id, G);
        previewFill(body, id, G, PAGE.data);
    }
    function refreshAll(only) {
        Object.keys(EMBS).forEach(id => { if (!only || only.includes(id)) fillEmbedded(id); });
        if (!PAGE || !PAGE.box.isConnected) { PAGE = null; return; }
        PAGE.box.querySelector('.lcd-toc').outerHTML = tocHtml(cur());
        PAGE_IDS.forEach(id => { if (!only || only.includes(id)) fillSection(id); else { const sec = PAGE.box.querySelector(`[data-lcd-sec="${id}"]`); if (sec) sec.querySelector('[data-lcd-sum]').innerHTML = summaryHtml(id, cur()); } });
    }
    function flash(id) {
        const s = (embOf(id)?.box || PAGE?.box)?.querySelector(`[data-lcd-sec="${id}"] [data-lcd-saved]`); if (s) { s.textContent = '✓ Enregistré'; s.classList.remove('is-fresh'); void s.offsetWidth; s.classList.add('is-fresh'); }
        UI().pageSaved?.('saved');
    }
    /** un changement : gardé tout de suite, « ✓ Enregistré », et « ↶ Annuler » en bas à gauche (H7) */
    function commit(next, label, id) {
        const keys = [KEY, P()?.KEY || 'genealogie-portraits'];
        const after = () => { apply(); refreshScreens(); refreshAll(); };
        const change = () => { write(next); };
        if (A().undoLocalChange) A().undoLocalChange(label, keys, change, after); else change();
        refreshScreens();
        refreshAll(!id ? null : [id]);
        if (id) flash(id); else UI().pageSaved?.('saved');
    }
    /** ce qui se dessine à part dans l'app (colonne des personnes, fiche ouverte) */
    function refreshScreens() { scheduleDecorate(); }
    let liveTimer = 0;
    function live(id, k, val) { // un curseur qu'on fait glisser : l'aperçu suit, rien n'est encore gardé
        const P0 = embOf(id) || PAGE; if (!P0) return; const G = clone(cur()); G[id][k] = val; const emb = P0 !== PAGE;
        clearTimeout(liveTimer); liveTimer = setTimeout(() => { const sec = P0.box.querySelector(`[data-lcd-sec="${id}"]`) || (emb ? P0.box : null); if (sec && (sec.open || emb)) previewFill(sec, id, G, P0.data); }, 140);
    }
    async function loadData() {
        const st = A().state || {}, api = A().api;
        const data = {stats: st.bootstrap?.stats || {}, people: (st.people || []).filter(p => p.kind !== 'animal')};
        let pid = Number(st.currentPersonId) || Number(st.bootstrap?.startPersonId) || 0;
        try {
            if (!data.people.length && api) data.people = ((await api('people', {limit: 60, kind: 'human'})).people || []);
            if (!pid) pid = Number(data.people[0]?.id) || 0;
            if (pid && api) data.detail = SNAP.fiche && SNAP.fiche.detail?.person?.id === pid ? SNAP.fiche.detail : await api('person', {id: pid});
            if (pid && api) data.tree = (await api('tree', {id: pid, mode: 'ancestors', depth: 3}))?.tree || null;
        } catch (e) { console.warn(e); }
        return data;
    }
    async function renderPage(token) {
        const st = A().state; if (st && token !== st.workspaceToken) return;
        const ws = document.getElementById('workspace'); if (!ws) return;
        const G = cur(), opened = openSet();
        ws.innerHTML = `<section class="page lcd-page"><header class="page-header"><div><span class="eyebrow">RÉGLAGES</span><h2>🎨 Designs au choix</h2><p>Le style général des éléments de l’app (traits, coins, ombres) ; les mouvements se règlent dans Accessibilité → « 🎞 Mouvement » (la forme de l’en-tête des fiches se règle dans Fiches personnes et animaux, les boutons dans Notifications et boutons ; les listes, les icônes et la densité dans Menus, colonne et listes). Pour chacun, tu cliques sur la grande carte que tu préfères, puis tu peux affiner en dessous ; l’aperçu montre de vrais écrans de l’app avec tes données. Tant que tu ne touches à rien, tout reste comme avant.</p></div><div class="page-actions"><button type="button" class="button secondary" data-lcd-reset="all">↺ Remettre comme au départ</button><button type="button" class="button secondary" data-lcd-apparence>🎨 Apparence →</button></div></header>
            ${tocHtml(G)}
            <div class="lcd-secs">${PAGE_IDS.map(id => sectionShell(id, opened.has(id))).join('')}</div></section>`;
        const box = ws.querySelector('.lcd-page');
        PAGE = {box, data: {stats: st?.bootstrap?.stats || {}, people: st?.people || []}, G};
        PAGE_IDS.forEach(id => { const sec = box.querySelector(`[data-lcd-sec="${id}"]`); sec.querySelector('[data-lcd-sum]').innerHTML = summaryHtml(id, G); });
        bindPage(box);
        PAGE.data = await loadData();
        if (st && token !== st.workspaceToken) return;
        PAGE_IDS.forEach(id => fillSection(id));
        UI().autoSave?.(box, {redraw: () => { apply(); refreshAll(); }});
    }
    function bindPage(box) {
        box.addEventListener('toggle', e => {
            const sec = e.target.closest?.('[data-lcd-sec]'); if (!sec || e.target !== sec) return;
            const s = openSet(); if (sec.open) s.add(sec.dataset.lcdSec); else s.delete(sec.dataset.lcdSec); lsSet(OPEN_KEY, [...s]);
            fillSection(sec.dataset.lcdSec);
        }, true);
        box.addEventListener('click', e => {
            const go = e.target.closest('[data-lcd-go]');
            if (go) { const sec = box.querySelector(`[data-lcd-sec="${go.dataset.lcdGo}"]`); if (sec) { if (!sec.open) sec.open = true; sec.scrollIntoView({behavior: document.documentElement.classList.contains('a11y-calm') ? 'auto' : 'smooth', block: 'start'}); sec.querySelector('summary')?.focus({preventScroll: true}); } return; }
            const rs = e.target.closest('[data-lcd-reset]');
            if (rs) { const id = rs.dataset.lcdReset, G = cur(); if (id === 'all') { if (PAGE_IDS.every(i => !isOn(G, i))) return; const N = defaults(G.a5); N.a5 = clone(G.a5); N.a4 = clone(G.a4); N.a6 = clone(G.a6); commit(N, 'Designs remis comme au départ', null); return; } /* A5 (cases des arbres) a sa place ailleurs : il ne bouge pas */ if (!isOn(G, id)) return; const N = clone(G); N[id] = {...defOf(id, 'avant'), ...(id === 'a5' ? {m: G.a5.m, f: G.a5.f} : {})}; commit(N, `${DEFS[id].n} ${DEFS[id].title} remis comme au départ`, id); return; }
            const ch = e.target.closest('[data-lcd-v]'); if (ch) { pickVariant(ch); return; }
            const md = e.target.closest('[data-lcd-mode] button');
            if (md) { const id = md.closest('[data-lcd-mode]').dataset.lcdMode, p = prevPrefs(); p[id] = md.dataset.m; lsSet(PREV_KEY, p); const sec = box.querySelector(`[data-lcd-sec="${id}"]`) || box; if (sec) previewFill(sec, id, cur(), ctxOf(box)?.data || {}); }
        });
        box.addEventListener('keydown', e => {
            const c = e.target.closest?.('[data-lcd-v]'); if (!c) return;
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickVariant(c); return; }
            if (['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(e.key)) { e.preventDefault(); const all = [...c.parentElement.querySelectorAll('[role=radio][tabindex]')], i = all.indexOf(c); all[(i + (/Right|Down/.test(e.key) ? 1 : all.length - 1)) % all.length]?.focus(); }
        });
        const secOf = el => el.closest('[data-lcd-sec]')?.dataset.lcdSec;
        box.addEventListener('input', e => {
            const t = e.target, id = secOf(t), k = t.dataset?.lcdK; if (!id || !k || !DEFS[id]) return;
            const s = DEFS[id].settings.find(x => x.k === k || (Array.isArray(x.k) && x.k.includes(k))); if (!s) return;
            if (s.type === 'range') live(id, k, Number(t.value));
            if (s.type === 'colors') { if (HEX.test(t.value)) live(id, k, t.value.toLowerCase()); }
        });
        box.addEventListener('change', e => {
            const t = e.target, id = secOf(t), k = t.dataset?.lcdK; if (!id || !k || !DEFS[id]) return;
            const s = DEFS[id].settings.find(x => x.k === k || (Array.isArray(x.k) && x.k.includes(k))); if (!s) return;
            const G = cur(), N = clone(G);
            const val = s.type === 'toggle' ? !!t.checked : s.type === 'range' ? snap(Number(t.value), s) : s.type === 'select' ? t.value : String(t.value || '').toLowerCase();
            if (s.type === 'colors' && !HEX.test(val)) return;
            if (N[id][k] === val) return;
            N[id][k] = val;
            const shown = s.type === 'toggle' ? (val ? 'activé' : 'désactivé') : s.type === 'select' ? (s.options.find(o => o[0] === val) || [0, val])[1] : s.type === 'range' ? `${String(val).replace('.', ',')} ${s.unit}` : val;
            const lab = s.labels ? s.labels[s.k.indexOf(k)] : s.label;
            commit(N, `${DEFS[id].title} : ${lab} — ${shown}`, id);
        });
    }
    function pickVariant(c) {
        const id = c.closest('[data-lcd-sec]').dataset.lcdSec, k = c.dataset.lcdV, G = cur();
        if (G[id].v === k && !isModified(G, id)) return;
        const N = clone(G); N[id] = {...defOf(id, k), ...(id === 'a5' ? {m: G.a5.m, f: G.a5.f} : {})};
        commit(N, `${DEFS[id].title} : ${V(id, k).t}`, id);
        requestAnimationFrame(() => (embOf(id)?.box || PAGE?.box)?.querySelector(`[data-lcd-sec="${id}"] [data-lcd-v="${k}"]`)?.focus({preventScroll: true}));
    }
    /* ═════════════════════════ 🌳 Cases des arbres (A5) : dans la fenêtre « Couleurs des statistiques et des arbres » ═════════════════════════
     * Graphiques → 🎨 Couleurs (index.php #stats-colors-dialog, app.js openStatsColorsDialog) : les 4 choix et leurs réglages,
     * gardés comme avant dans 'genealogie-designs'.a5 (réglages enregistrés, défaut du site, anciens réglages : rien ne change).
     * Les couleurs homme / femme (celles des portraits K7) sont dans la rubrique « Couleurs par sexe » de la même fenêtre.
     * La fenêtre a son bouton « Enregistrer » : ici on prépare, rien n'est gardé avant (ext.treeCards.save). */
    const TC_SET = ['tw', 'links', 'dates', 'sosa'];
    const tcSettings = () => DEFS.a5.settings.filter(x => TC_SET.includes(x.k));
    function tcMount(host) {
        if (!host) return null;
        const st = {w: clone(cur().a5), data: null};
        const paintCards = () => {
            const box = host.querySelector('[data-tc-choices]'); if (!box) return;
            const mod = isModified({a5: st.w}, 'a5');
            box.innerHTML = DEFS.a5.variants.map(v => { const on = st.w.v === v.k;
                return `<div class="lcd-choice${on ? ' is-active' : ''}" role="radio" tabindex="${on ? 0 : -1}" aria-checked="${on}" data-tc-v="${v.k}"><div class="lcd-choice-top"><span class="lcd-radio"></span><h3>${esc(v.t)}</h3>${tagHtml(v, on && mod)}</div><div class="lcd-choice-sub muted">${esc(v.sub || '')}</div><div class="lcd-stage" data-tc-stage></div></div>`; }).join('');
            box.querySelectorAll('[data-tc-v]').forEach(c => { const w = c.dataset.tcV === st.w.v ? clone(st.w) : {...defOf('a5', c.dataset.tcV), m: st.w.m, f: st.w.f}; const S = clone(cur()); S.a5 = w; mountFrame(c.querySelector('[data-tc-stage]'), {G: S, dark: document.documentElement.dataset.theme === 'dark', screens: ['arbre'], data: st.data || {}, W: 880}); });
        };
        const paintSet = () => {
            const box = host.querySelector('[data-tc-set]'); if (!box) return;
            box.innerHTML = tcSettings().map(x => {
                let ctl = '';
                if (x.type === 'select') ctl = `<select data-tc-k="${x.k}" aria-label="${esc(x.label)}">${x.options.map(([v, t]) => `<option value="${v}"${st.w[x.k] === v ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
                if (x.type === 'toggle') ctl = `<label class="ui-toggle"><input type="checkbox" data-tc-k="${x.k}"${st.w[x.k] ? ' checked' : ''}><i></i><span>${esc(x.text)}</span></label>`;
                if (x.type === 'range') ctl = '<span class="lcd-slot" data-tc-slot></span>';
                return `<div class="lcd-set"><div class="lcd-set-row"><span class="lcd-lab">${esc(x.label)}</span><div class="lcd-ctl">${ctl}</div></div><p class="lcd-why muted"><b>Pourquoi ?</b> ${esc(x.why)}</p></div>`;
            }).join('');
            const r = tcSettings().find(x => x.type === 'range'), slot = box.querySelector('[data-tc-slot]');
            if (r && slot) {
                const field = UI().rangeField ? UI().rangeField({min: r.min, max: r.max, step: r.step, value: st.w[r.k], unit: r.unit, default: defOf('a5', st.w.v)[r.k], label: ''}) : null;
                let inp; if (field) { slot.appendChild(field); inp = field.input; } else { slot.innerHTML = `<input type="number" min="${r.min}" max="${r.max}" step="${r.step}" value="${st.w[r.k]}" data-unit="${r.unit}">`; inp = slot.querySelector('input'); }
                inp.dataset.tcK = r.k; inp.setAttribute('aria-label', r.label);
            }
            UI().scan?.(box);
        };
        host.innerHTML = `<div class="lcd-trees"><div class="lcd-choices two" role="radiogroup" aria-label="Cases des arbres" data-tc-choices></div><div class="lcd-trees-set" data-tc-set></div></div>`;
        st.pick = el => { const k = el.dataset.tcV; if (k === st.w.v && !isModified({a5: st.w}, 'a5')) return; st.w = {...defOf('a5', k), m: st.w.m, f: st.w.f}; paintCards(); paintSet(); host.querySelector(`[data-tc-v="${k}"]`)?.focus({preventScroll: true}); };
        st.set = t => { const k = t.dataset?.tcK, x = k && tcSettings().find(y => y.k === k); if (!x) return; st.w[k] = x.type === 'toggle' ? !!t.checked : x.type === 'range' ? snap(Number(t.value), x) : t.value; paintCards(); };
        if (!host.dataset.tcBound) { // une seule écoute par fenêtre, même si on la rouvre
            host.dataset.tcBound = '1';
            host.addEventListener('click', e => { const c = e.target.closest('[data-tc-v]'); if (c) host.tcState?.pick(c); });
            host.addEventListener('keydown', e => {
                const c = e.target.closest?.('[data-tc-v]'), S = host.tcState; if (!c || !S) return;
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); S.pick(c); return; }
                if (['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(e.key)) { e.preventDefault(); const all = [...c.parentElement.querySelectorAll('[data-tc-v]')], i = all.indexOf(c); S.pick(all[(i + (/Right|Down/.test(e.key) ? 1 : all.length - 1)) % all.length]); }
            });
            host.addEventListener('change', e => host.tcState?.set(e.target));
        }
        host.tcState = st; st.paintCards = paintCards; st.paint = () => { paintCards(); paintSet(); };
        paintCards(); paintSet();
        loadData().then(d => { if (!host.isConnected || host.tcState !== st) return; st.data = d; paintCards(); }).catch(() => {});
        return st;
    }
    ext.treeCards = {
        /** dessine les choix dans host (la fenêtre des couleurs) à partir du réglage gardé */
        mount: host => tcMount(host),
        /** les couleurs homme / femme de la rubrique « Couleurs par sexe » : les aperçus les suivent */
        colors: (host, m, f) => { const st = host?.tcState; if (!st) return; if (HEX.test(m || '')) st.w.m = m.toLowerCase(); if (HEX.test(f || '')) st.w.f = f.toLowerCase(); clearTimeout(st.t); st.t = setTimeout(() => { if (host.isConnected) st.paintCards(); }, 250); },
        /** comme au départ (avant « Enregistrer ») */
        reset: host => { const st = host?.tcState; if (!st) return; st.w = {...defOf('a5', 'avant'), m: K7_DEF.m, f: K7_DEF.f}; st.paint(); return {m: K7_DEF.m, f: K7_DEF.f}; },
        /** les couleurs gardées (portraits K7) pour remplir la rubrique */
        current: () => ({m: cur().a5.m, f: cur().a5.f}),
        /** « Enregistrer » de la fenêtre : garde A5 (et les couleurs des portraits), redessine l'app */
        save: (host, m, f) => { const st = host?.tcState; const N = clone(cur()); N.a5 = {...(st ? st.w : N.a5)}; if (HEX.test(m || '')) N.a5.m = m.toLowerCase(); if (HEX.test(f || '')) N.a5.f = f.toLowerCase(); write(N); scheduleDecorate(); refreshAll(); },
        isOn: () => isOn(cur(), 'a5'),
    };

    ext.maintenance = ext.maintenance || {};
    // la page « Designs au choix » a quitté les Réglages : le style va avec les fiches, les mouvements dans Accessibilité ;
    // une ancienne adresse ouvre « Fiches personnes et animaux » (le style des fiches)
    ext.maintenance.designs = async token => { const st = A().state; if (st && token !== st.workspaceToken) return; if (st) st.maintenanceTab = 'design_sheets'; await A().setModule?.('maintenance'); };
    /** le cadre « Forme de l'en-tête » (A4) dans Réglages → Apparence → Fiches personnes et animaux : 4 cartes 👍 / 👎, Réglages en plus, aperçu réel */
    async function embedFrame(host, id, title, note) {
        if (!host) return;
        host.innerHTML = `<div class="lcd-embed" data-lcd-sec="${id}" id="lcd-${id}-emb"><div class="lcd-embed-head"><h4><span aria-hidden="true">${DEFS[id].icon}</span> ${title} <span class="lcd-embed-sum" data-lcd-sum></span></h4><span class="lcd-saved" data-lcd-saved role="status"></span></div><p class="muted">${note}.</p><div class="lcd-body" data-lcd-body></div></div>`;
        const box = host.querySelector('.lcd-embed');
        const st = A().state;
        EMBS[id] = {box, data: {stats: st?.bootstrap?.stats || {}, people: st?.people || []}};
        box.addEventListener('click', e => { if (e.target.closest('[data-lcd-go-designs2]')) goDesigns(); });
        bindPage(box);
        fillEmbedded(id);
        const data = await loadData(); if (EMBS[id]?.box === box) { EMBS[id].data = data; fillEmbedded(id); }
    }
    /** « Fiches personnes et animaux » : la forme de l'en-tête (A4) et, dans le même cadre, le style des fiches (A1 : traits, ombres, coins) */
    ext.designsA4Frame = host => {
        if (!host) return;
        host.innerHTML = '<div class="lcd-merged"><div data-lcd-a4-part></div><div data-lcd-a1-part></div></div>';
        embedFrame(host.querySelector('[data-lcd-a4-part]'), 'a4', 'Forme de l’en-tête', 'Le haut de la fiche. Les traits, les ombres et les coins de la fiche se règlent juste en dessous');
        embedFrame(host.querySelector('[data-lcd-a1-part]'), 'a1', 'Style des fiches', 'Les traits, les ombres et les coins des fiches (personnes et animaux) seulement : le reste de l’app ne change pas. La colonne de gauche a les siens (Menus, colonne et listes → Colonne)');
    };
    /** le cadre « Boutons » (A6) à la fin de Réglages → Notifications et boutons */
    ext.designsA2Frame = host => embedFrame(host, 'a2', 'Densité', 'L’espace dans et entre les blocs, la hauteur des lignes de liste, la marge des boutons. Une colonne de gauche réglée « Compacte » (onglet Colonne) garde sa propre taille : les deux ne s’additionnent pas');
    ext.designsA3Frame = host => embedFrame(host, 'a3', 'Icônes', 'Les petits dessins des boutons, des barres d’outils et des rubriques. Les traits et les ombres suivent');
    ext.designsA8Frame = host => embedFrame(host, 'a8', 'Forme des listes', 'Les lignes des listes (Listes, Personnes, Recherche…), la colonne des personnes et les tableaux. Les traits et les ombres suivent');
    ext.designsA7Frame = host => embedFrame(host, 'a7', 'Mouvements', 'Comment les fenêtres, les menus et les messages apparaissent. L’aperçu tourne en boucle');
    ext.designsA6Frame = host => embedFrame(host, 'a6', 'Boutons', 'Les boutons secondaires (Annuler, Modifier, ＋ Ajouter…). Les traits et les ombres suivent');

    /* ═════════════════════════ Apparence ↔ Designs au choix ═════════════════════════
     * Apparence garde la priorité : un design ne touche ni au Preset, ni à la couleur principale, ni à la police, ni à la taille.
     * Le petit cadre en haut d'Apparence le dit, avec le lien et les designs changés. */
    const goDesigns = () => { const st = A().state; if (st) st.maintenanceTab = 'design_sheets'; A().setModule?.('maintenance'); };
    function apparenceNoteHtml(G) {
        const on = isOn(G, 'a1') ? `<small class="lcd-link-on">${esc(`Style des fiches : ${V('a1', G.a1.v).t}${isModified(G, 'a1') ? ' (retouché)' : ''}.`)}</small>` : '';
        return `<div class="ui-notice ui-notice-info lcd-link" id="lcd-apparence-link"><span class="ui-notice-ic" aria-hidden="true">ℹ️</span><span>La forme des éléments est rangée là où on s’en sert : <button type="button" class="link-button" data-lcd-go-designs>🎨 le style des fiches</button> (traits, coins, ombres) dans Fiches personnes et animaux ; la colonne, la densité, les icônes et les listes dans Menus, colonne et listes ; les boutons dans Notifications et boutons ; les mouvements dans Accessibilité. La police, la taille et les couleurs se règlent ici. ${on}</span></div>`;
    }
    ext.afterDesign = ext.afterDesign || [];
    ext.afterDesign.push(() => {
        const st = A().state; if (st?.maintenanceTab !== 'design') return;
        const form = document.getElementById('design-form'); if (!form || document.getElementById('lcd-apparence-link')) return;
        form.insertAdjacentHTML('beforebegin', apparenceNoteHtml(cur()));
        document.getElementById('lcd-apparence-link').addEventListener('click', e => { if (e.target.closest('[data-lcd-go-designs]')) goDesigns(); });
    });
    // A6 Boutons : à la fin de « Notifications et boutons » (juste après les messages), dans les deux présentations des Réglages
    ext.afterDesign.push(() => {
        const st = A().state; if (!['design', 'look_msgs'].includes(st?.maintenanceTab)) return;
        const tp = document.querySelector('#workspace .toast-prefs'); if (!tp || document.getElementById('lc-a6-host')) return;
        tp.insertAdjacentHTML('afterend', '<section class="person-block-config lc-a6-host" id="lc-a6-host"><header><span class="eyebrow">BOUTONS</span><h3>Forme des boutons</h3><p>Les boutons secondaires de toute l’app (Annuler, Modifier, ＋ Ajouter…) ; le bouton principal reste plein, à la couleur principale.</p></header><div data-a6-host></div></section>');
        ext.designsA6Frame(document.querySelector('#lc-a6-host [data-a6-host]'));
    });
    // A8 Listes : dans « Menus, colonne et listes » (onglet Listes), dans les deux présentations des Réglages
    ext.afterDesign.push(() => {
        const st = A().state; if (!['design', 'nav_menus'].includes(st?.maintenanceTab) || document.getElementById('lc-a8-host')) return;
        const at = document.querySelector('#workspace #lc-topbar-buttons') || document.querySelector('#workspace .design-order-grid') || document.querySelector('#workspace > .page > :last-child'); if (!at) return; // après « Boutons en haut à droite » (qui suit l'ordre du menu)
        at.insertAdjacentHTML('afterend', '<section class="person-block-config lc-a8-host" id="lc-a8-host"><header><span class="eyebrow">LISTES</span><h3>Forme des listes</h3><p>Comment se séparent les lignes des listes, de la colonne des personnes et des tableaux.</p></header><div data-a8-host></div></section>'
            + '<section class="person-block-config lc-a3-host" id="lc-a3-host"><header><span class="eyebrow">ICÔNES</span><h3>Icônes</h3><p>Émojis, traits, pictogrammes… les petits dessins des boutons, des barres d’outils et des rubriques.</p></header><div data-a3-host></div></section>'
            + '<section class="person-block-config lc-a2-host" id="lc-a2-host"><header><span class="eyebrow">DENSITÉ</span><h3>Densité</h3><p>Combien d’espace autour des choses : dans et entre les blocs, entre les lignes, autour des boutons.</p></header><div data-a2-host></div></section>');
        ext.designsA8Frame(document.querySelector('#lc-a8-host [data-a8-host]'));
        ext.designsA3Frame(document.querySelector('#lc-a3-host [data-a3-host]'));
        ext.designsA2Frame(document.querySelector('#lc-a2-host [data-a2-host]'));
    });
    /** les « 💾 Réglages enregistrés » de l'Apparence (designs) emportent aussi les designs au choix (champ a_designs) ;
     *  un ancien réglage (A1 à A10, ensembles…) revient sans erreur : A7 police et A10 sont ignorés */
    const prevFlat = ext.lookFlat, prevFromFlat = ext.lookFromFlat;
    ext.lookFlat = () => ({...(prevFlat?.() || {}), a_designs: portable(readRaw())});
    ext.lookFromFlat = d => {
        prevFromFlat?.(d);
        if (!d || typeof d.a_designs !== 'string') return;
        const v = d.a_designs ? portable(d.a_designs) : '';
        try { if (v) localStorage.setItem(KEY, v); else localStorage.removeItem(KEY); } catch (_) {}
        apply();
    };

    /* ═════════════════════════ Démarrage ═════════════════════════ */
    /** les anciens choix gardés sur l'ordinateur (A7 police, A10 tableau de bord, ensembles enregistrés, couleur d'accent) :
     *  nettoyés une fois, l'écran revient comme avant pour ces parties */
    function tidyStorage() {
        try {
            OLD_KEYS.forEach(k => { if (localStorage.getItem(k) !== null) localStorage.removeItem(k); });
            const raw = readRaw();
            if (raw !== null && !(isObj(raw) && raw.ver === VER)) { const v = portable(raw); if (v) localStorage.setItem(KEY, v); else localStorage.removeItem(KEY); }
        } catch (_) {}
    }
    let snapTimer = 0;
    if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined') {
        const watchWs = () => { const ws = document.getElementById('workspace'); if (!ws) return false; new MutationObserver(() => { clearTimeout(snapTimer); snapTimer = setTimeout(snapshot, 900); }).observe(ws, {childList: true, subtree: true}); return true; };
        if (!watchWs()) document.addEventListener?.('DOMContentLoaded', watchWs, {once: true});
    }
    // si le réglage change dans un autre onglet du navigateur
    if (typeof window !== 'undefined') window.addEventListener?.('storage', e => { if (e.key === KEY || e.key === (P()?.KEY || 'genealogie-portraits')) { apply(); refreshAll(); } });
    window.LCNDA_DESIGNS = {A1_ATTRS, A1_VARS, setScope, ficheScope, KEY, VER, CACHE_KEY, OPEN_KEY, OLD_KEYS, DEFS, IDS, ATTRS, VARS, OLD_ATTRS, SV, GLYPHS, read, write, clean, migrate, portable, defaults, tidyStorage, apply, applyTo, attrsOf, decorate, decorateHero, wrapIcons, unwrapIcons, isOn, isModified, defOf, acteText, apparenceNoteHtml,
        treePhoto: () => { const G = PREVIEW_G || cur(); return isOn(G, 'a5') && G.a5.v === 'photo'; },
        listAv: () => { const G = PREVIEW_G || cur(); return isOn(G, 'a8') && G.a8.av; },
        snapshots: SNAP, render: renderPage,
        /** un aperçu vivant fait d'un HTML de l'app (ex. la vraie fiche, Réglages → Fiches) : même cadre réduit (scale), mêmes designs */
        frame: (slot, {html = '', W = 1000, dark, detail = null} = {}) => mountFrame(slot, {G: cur(), dark: dark ?? document.documentElement.dataset.theme === 'dark', screens: [], html, W, data: {detail}})};
    tidyStorage();
    apply();
})();
