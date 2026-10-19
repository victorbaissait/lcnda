/* LCNDA — Tableaux : la bibliothèque de formes (façon Freeform) et les préférences des tableaux.
 * ext.boardKit.shapes : catégories et formes (chemins SVG dans une boîte 100 × 100).
 * ext.boardKit.prefs() : les réglages (couleurs par catégorie et palettes, pointes, formes, polices, plages d'épaisseur
 * et de taille du texte, arrondi, tableur par défaut, pinceaux à soi, ordre des menus) — Maintenance → Réglages des tableaux.
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    ext.maintenance = ext.maintenance || {};
    const A = () => window.LCNDA_APP;
    const esc = v => A().escapeHtml(v ?? '');
    const toast = (...a) => A().toast(...a);

    /* ═════════ Formes ═════════ */
    const circ = (cx, cy, r) => `M${cx - r} ${cy} A${r} ${r} 0 1 0 ${cx + r} ${cy} A${r} ${r} 0 1 0 ${cx - r} ${cy}Z`;
    const poly = (n, r = 48, rot = -90) => 'M' + Array.from({length: n}, (_, i) => { const t = (rot + i * 360 / n) * Math.PI / 180; return `${(50 + Math.cos(t) * r).toFixed(1)} ${(50 + Math.sin(t) * r).toFixed(1)}`; }).join(' L') + 'Z';
    const star = (n, r1 = 48, r2 = 20, rot = -90) => 'M' + Array.from({length: n * 2}, (_, i) => { const r = i % 2 ? r2 : r1, t = (rot + i * 180 / n) * Math.PI / 180; return `${(50 + Math.cos(t) * r).toFixed(1)} ${(50 + Math.sin(t) * r).toFixed(1)}`; }).join(' L') + 'Z';
    const CLOUD = 'M25 85 C2 85 0 50 20 45 C15 15 50 5 55 30 C65 10 95 20 85 50 C100 55 100 85 78 85Z';
    const CATS = [['elem', 'Élémentaire', '◻️'], ['geo', 'Géométrie', '🔷'], ['arrows', 'Flèches', '➡️'], ['bubbles', 'Bulles', '💬'], ['stars', 'Étoiles et badges', '⭐'], ['symbols', 'Symboles', '❤️'],
        ['genea', 'Généalogie', '🌳'], ['people', 'Personnes', '👪'], ['faith', 'Croyances et mémoire', '🕯️'], ['docs', 'Écrits et documents', '📜'], ['places', 'Lieux et bâtiments', '⛪'], ['house', 'Maison et objets', '🏠'],
        ['clothes', 'Vêtements et parures', '👔'], ['jobs', 'Métiers et outils', '🔨'], ['transport', 'Transports et voyages', '🚂'], ['animals', 'Animaux', '🐾'], ['nature', 'Nature', '🍃'], ['weather', 'Météo et ciel', '🌦️'],
        ['food', 'Cuisine et repas', '🍞'], ['leisure', 'Musique, jeux et sport', '🎻'], ['health', 'Santé et corps', '🩺'], ['objects', 'Objets', '🔑'], ['mine', 'Mes formes', '✏️']];
    // [clé, nom, catégorie, chemin, evenodd?, mots pour la recherche]
    const RAW = [
        ['rect', 'Rectangle', 'elem', 'M0 0H100V100H0Z'], ['round', 'Rectangle arrondi', 'elem', 'M18 0H82A18 18 0 0 1 100 18V82A18 18 0 0 1 82 100H18A18 18 0 0 1 0 82V18A18 18 0 0 1 18 0Z'], ['ellipse', 'Ovale', 'elem', circ(50, 50, 50), 0, 'rond cercle'],
        ['triangle', 'Triangle', 'elem', 'M50 0L100 100H0Z'], ['right_tri', 'Triangle rectangle', 'elem', 'M0 100V0L100 100Z'], ['diamond', 'Losange', 'elem', 'M50 0L100 50L50 100L0 50Z'],
        ['pentagon', 'Pentagone', 'elem', poly(5, 50)], ['hexagon', 'Hexagone', 'elem', 'M25 0H75L100 50L75 100H25L0 50Z'], ['star', 'Étoile', 'elem', star(5, 50, 20)],
        ['bubble', 'Bulle', 'elem', 'M8 0H92Q100 0 100 10V70Q100 80 92 80H35L18 100L22 80H8Q0 80 0 70V10Q0 0 8 0Z', 0, 'dialogue'], ['cloud', 'Nuage', 'elem', CLOUD],
        ['arrow_r', 'Flèche', 'elem', 'M0 32H58V8L100 50L58 92V68H0Z'], ['arrow_lr', 'Double flèche', 'elem', 'M0 50L30 14V36H70V14L100 50L70 86V64H30V86Z'], ['tab', 'Étiquette', 'elem', 'M12 0H100V100H12L0 88V12Z'],
        // géométrie
        ['parallelogram', 'Parallélogramme', 'geo', 'M24 14H100L76 86H0Z'], ['trapezoid', 'Trapèze', 'geo', 'M24 14H76L100 86H0Z'], ['rhombus', 'Losange plat', 'geo', 'M50 22L100 50L50 78L0 50Z'],
        ['pill', 'Pilule', 'geo', 'M28 22H72A28 28 0 0 1 72 78H28A28 28 0 0 1 28 22Z'], ['cylinder', 'Cylindre', 'geo', 'M8 14A42 12 0 0 1 92 14V86A42 12 0 0 1 8 86Z M8 14A42 12 0 0 0 92 14'],
        ['cube', 'Cube', 'geo', 'M6 30H70V96H6Z M6 30L30 6H94L70 30Z M70 30L94 6V72L70 96Z'], ['box3d', 'Pavé', 'geo', 'M4 44H74V90H4Z M4 44L26 26H96L74 44Z M74 44L96 26V72L74 90Z'],
        ['pyramid', 'Pyramide', 'geo', 'M50 4L94 80L60 96Z M50 4L60 96L6 76Z'], ['cone', 'Cône', 'geo', 'M50 2L90 82A40 14 0 0 1 10 82Z'], ['tetra', 'Tétraèdre', 'geo', 'M50 4L96 90H4Z M50 4L50 66 M4 90L50 66L96 90'],
        ['heptagon', 'Heptagone', 'geo', poly(7, 50)], ['octagon', 'Octogone', 'geo', poly(8, 50, -112.5)], ['decagon', 'Décagone', 'geo', poly(10, 50)], ['dodeca', 'Dodécagone', 'geo', poly(12, 50)],
        ['donut', 'Anneau', 'geo', circ(50, 50, 48) + circ(50, 50, 26), 1, 'cercle rond'], ['half', 'Demi-cercle', 'geo', 'M0 75A50 50 0 0 1 100 75Z'], ['quarter', 'Quart de cercle', 'geo', 'M0 100V0A100 100 0 0 1 100 100Z'],
        ['frame', 'Cadre', 'geo', 'M0 0H100V100H0Z M14 14V86H86V14Z', 1], ['lshape', 'Équerre', 'geo', 'M0 0H26V74H100V100H0Z'], ['chevron_shape', 'Chevron', 'geo', 'M0 0H60L100 50L60 100H0L40 50Z'],
        ['tri_up_down', 'Sablier (forme)', 'geo', 'M0 0H100L50 50L100 100H0L50 50Z'], ['semi_rect', 'Arche', 'geo', 'M0 100V40A50 40 0 0 1 100 40V100Z', 0, 'porte fenêtre'],
        // flèches
        ['arrow_l', 'Flèche à gauche', 'arrows', 'M100 32H42V8L0 50L42 92V68H100Z'], ['arrow_u', 'Flèche en haut', 'arrows', 'M32 100V42H8L50 0L92 42H68V100Z'], ['arrow_d', 'Flèche en bas', 'arrows', 'M32 0V58H8L50 100L92 58H68V0Z'],
        ['arrow_ud', 'Double flèche verticale', 'arrows', 'M50 0L86 30H64V70H86L50 100L14 70H36V30H14Z'], ['arrow_4', 'Quatre directions', 'arrows', 'M50 0L66 18H58V42H82V34L100 50L82 66V58H58V82H66L50 100L34 82H42V58H18V66L0 50L18 34V42H42V18H34Z'],
        ['chevron', 'Chevron', 'arrows', 'M0 14H58L94 50L58 86H0L36 50Z'], ['notched', 'Flèche à encoche', 'arrows', 'M0 30H60V10L100 50L60 90V70H0L18 50Z'], ['curved', 'Flèche courbe', 'arrows', 'M6 94C6 40 38 18 70 18V2L98 30L70 58V40C46 40 28 58 28 94Z'],
        ['uturn', 'Demi-tour', 'arrows', 'M82 98V40C82 20 68 6 50 6S18 20 18 40V60H2L28 94L54 60H38V40C38 32 44 26 50 26S62 32 62 40V98Z'], ['arrow_thin', 'Flèche fine', 'arrows', 'M0 44H76V28L100 50L76 72V56H0Z'],
        ['arrow_block', 'Pavé flèche', 'arrows', 'M0 0H70L100 50L70 100H0Z'], ['circle_arrow', 'Flèche ronde', 'arrows', 'M50 8A42 42 0 1 1 9 58H23A28 28 0 1 0 50 22V36L28 15L50 -6Z'],
        // bulles
        ['bubble_round', 'Bulle ronde', 'bubbles', 'M50 6C76 6 96 22 96 42S76 78 50 78C44 78 38 77 33 76L12 96L19 70C9 63 4 53 4 42C4 22 24 6 50 6Z'], ['callout', 'Encadré', 'bubbles', 'M0 0H100V72H42L20 98L24 72H0Z'],
        ['thought', 'Pensée', 'bubbles', CLOUD.replace(/\d+(\.\d+)?/g, m => String(+(m * .86).toFixed(1))) + circ(18, 86, 6) + circ(7, 96, 3.5)], ['shout', 'Cri', 'bubbles', star(14, 50, 34, -80)],
        ['bubble_l', 'Bulle (gauche)', 'bubbles', 'M92 0H8Q0 0 0 10V70Q0 80 8 80H65L82 100L78 80H92Q100 80 100 70V10Q100 0 92 0Z'], ['speech_rect', 'Bulle carrée', 'bubbles', 'M0 0H100V76H30L10 100V76H0Z'],
        // étoiles et badges
        ['star4', 'Étoile à 4 branches', 'stars', star(4, 50, 16)], ['star6', 'Étoile à 6 branches', 'stars', star(6, 50, 26)], ['star8', 'Étoile à 8 branches', 'stars', star(8, 50, 30)],
        ['burst', 'Éclat', 'stars', star(12, 50, 38)], ['seal', 'Sceau', 'stars', star(24, 50, 43)], ['compass', 'Rose des vents', 'stars', star(8, 50, 12)],
        ['ribbon', 'Ruban', 'stars', 'M0 30H100L88 50L100 70H0L12 50Z'], ['badge', 'Médaille', 'stars', circ(50, 62, 32) + 'M28 0H46L56 34H38Z M54 0H72L62 34H44Z'], ['shield', 'Écu', 'stars', 'M50 2L92 14V46C92 72 74 88 50 98C26 88 8 72 8 46V14Z', 0, 'blason armoiries'],
        ['banner', 'Bannière', 'stars', 'M0 10H100V90L50 70L0 90Z'], ['rosette', 'Cocarde', 'stars', star(16, 44, 36) + 'M34 76L22 100L34 94L42 100L46 80Z M66 76L78 100L66 94L58 100L54 80Z'],
        // symboles
        ['heart', 'Cœur', 'symbols', 'M50 90C20 68 2 52 2 32C2 15 15 4 29 4C39 4 46 10 50 18C54 10 61 4 71 4C85 4 98 15 98 32C98 52 80 68 50 90Z', 0, 'amour'],
        ['check', 'Coche', 'symbols', 'M4 52L20 36L40 56L80 12L96 28L40 88Z', 0, 'ok valide'], ['xmark', 'Croix (X)', 'symbols', 'M18 4L50 36L82 4L96 18L64 50L96 82L82 96L50 64L18 96L4 82L36 50L4 18Z', 0, 'non faux'],
        ['plus', 'Plus', 'symbols', 'M36 0H64V36H100V64H64V100H36V64H0V36H36Z'], ['minus', 'Moins', 'symbols', 'M0 36H100V64H0Z'], ['moon', 'Lune', 'symbols', 'M62 4A46 46 0 1 0 98 72A38 38 0 1 1 62 4Z', 0, 'croissant nuit'],
        ['lightning', 'Éclair', 'symbols', 'M58 0L14 56H44L36 100L86 40H56Z'], ['drop', 'Goutte', 'symbols', 'M50 2C50 2 14 46 14 66A36 36 0 0 0 86 66C86 46 50 2 50 2Z'], ['pin', 'Repère', 'symbols', 'M50 100C50 100 12 58 12 36A38 38 0 0 1 88 36C88 58 50 100 50 100Z' + circ(50, 36, 14), 1, 'carte lieu'],
        ['flag', 'Drapeau', 'symbols', 'M10 0H20V100H10Z M20 6C40 -2 58 18 92 6V54C58 66 40 46 20 54Z'], ['question', 'Point d’interrogation', 'symbols', 'M32 32C32 14 44 4 52 4C68 4 78 14 78 28C78 46 58 48 58 66H42C42 40 62 40 62 28C62 22 58 18 52 18C46 18 46 24 46 32Z' + circ(50, 86, 10)],
        ['exclam', 'Point d’exclamation', 'symbols', 'M40 2H60L56 68H44Z' + circ(50, 86, 10)], ['info', 'Information', 'symbols', circ(50, 50, 48) + 'M44 42H56V78H44Z' + circ(50, 28, 7), 1],
        ['infinity', 'Infini', 'symbols', 'M50 40C40 26 32 22 24 22C10 22 0 34 0 50S10 78 24 78C32 78 40 74 50 60C60 74 68 78 76 78C90 78 100 66 100 50S90 22 76 22C68 22 60 26 50 40Z M50 50C42 60 34 64 26 64C18 64 14 58 14 50S18 36 26 36C34 36 42 40 50 50Z M50 50C58 40 66 36 74 36C82 36 86 42 86 50S82 64 74 64C66 64 58 60 50 50Z', 1],
        ['sun', 'Soleil', 'symbols', star(12, 50, 34) + circ(50, 50, 26), 0], ['hexmark', 'Signe', 'symbols', poly(6, 48, 0) + poly(6, 30, 0), 1],
        // généalogie
        ['tree', 'Arbre', 'genea', circ(50, 38, 36) + 'M43 60H57V100H43Z', 0, 'arbre généalogique'], ['oak', 'Chêne', 'genea', 'M50 4C66 4 74 14 74 22C88 22 96 34 92 46C100 56 94 72 80 72C76 80 66 84 58 80V100H42V80C34 84 24 80 20 72C6 72 0 56 8 46C4 34 12 22 26 22C26 14 34 4 50 4Z'],
        ['rings', 'Alliances', 'genea', circ(34, 56, 28) + circ(34, 56, 20) + circ(66, 56, 28) + circ(66, 56, 20), 1, 'mariage'], ['crown', 'Couronne', 'genea', 'M4 78L10 22L32 50L50 10L68 50L90 22L96 78Z M6 84H94V96H6Z', 0, 'noblesse roi'],
        ['latin_cross', 'Croix', 'genea', 'M42 0H58V26H82V42H58V100H42V42H18V26H42Z', 0, 'décès baptême religion'], ['tomb', 'Tombe', 'genea', 'M12 100V40C12 16 30 2 50 2S88 16 88 40V100Z M44 22H56V34H68V46H56V76H44V46H32V34H44Z', 1, 'sépulture décès cimetière'],
        ['cradle', 'Berceau', 'genea', 'M8 40H92C92 64 74 80 50 80S8 64 8 40Z M12 34C12 14 30 4 50 4V34Z M14 84H86C80 92 70 96 50 96S20 92 14 84Z', 0, 'naissance bébé'],
        ['scroll', 'Parchemin', 'genea', 'M18 8H84A10 10 0 0 1 84 28H78V82A10 10 0 0 1 68 92H14A10 10 0 0 1 14 72H22V18A10 10 0 0 1 18 8Z', 0, 'acte archive document'],
        ['quill', 'Plume', 'genea', 'M96 2C62 6 30 30 20 70L14 98L22 96L28 76C62 70 86 40 96 2Z', 0, 'écriture'], ['book', 'Livre', 'genea', 'M4 14C18 6 36 6 48 16V94C36 84 18 84 4 90Z M52 16C64 6 82 6 96 14V90C82 84 64 84 52 94Z', 0, 'registre'],
        ['envelope', 'Lettre', 'genea', 'M4 24L50 56L96 24V84H4Z M8 16H92L50 46Z', 0, 'courrier'], ['hourglass', 'Sablier', 'genea', 'M16 2H84V10H78C78 34 58 44 56 50C58 56 78 66 78 90H84V98H16V90H22C22 66 42 56 44 50C42 44 22 34 22 10H16Z', 0, 'temps'],
        ['candle', 'Bougie', 'genea', 'M38 40H62V100H38Z M50 4C58 16 60 24 50 34C40 24 42 16 50 4Z', 0, 'souvenir'], ['seal_wax', 'Cachet de cire', 'genea', star(18, 48, 42) + circ(50, 50, 26), 1],
        ['fleur', 'Fleur de lys', 'genea', 'M50 2C62 16 62 34 54 50H46C38 34 38 16 50 2Z M44 52C30 30 10 34 6 50C4 62 16 70 24 60C14 58 16 46 26 48C34 50 38 56 40 60Z M56 52C70 30 90 34 94 50C96 62 84 70 76 60C86 58 84 46 74 48C66 50 62 56 60 60Z M30 60H70V70H30Z M44 70H56L62 98H38Z', 0, 'blason royauté'],
        ['branch', 'Branche', 'genea', 'M4 92C30 70 52 58 96 52L94 60C58 64 38 74 10 98Z M40 72C38 56 46 46 60 42C60 56 52 66 40 72Z M60 60C64 46 76 40 88 42C84 54 74 60 60 60Z M22 84C14 72 18 60 30 54C34 66 30 78 22 84Z'],
        // personnes
        ['person', 'Personne', 'people', circ(50, 22, 18) + 'M14 100C14 66 30 48 50 48S86 66 86 100Z'], ['woman', 'Femme', 'people', circ(50, 20, 16) + 'M50 40C66 40 72 52 76 64L88 100H12L24 64C28 52 34 40 50 40Z'],
        ['couple', 'Couple', 'people', circ(30, 24, 14) + 'M4 100C4 70 15 50 30 50S56 70 56 100Z' + circ(70, 24, 14) + 'M44 100C44 70 55 50 70 50S96 70 96 100Z'],
        ['family', 'Famille', 'people', circ(22, 26, 12) + 'M0 100C0 74 9 54 22 54S44 74 44 100Z' + circ(78, 26, 12) + 'M56 100C56 74 65 54 78 54S100 74 100 100Z' + circ(50, 54, 9) + 'M34 100C34 82 41 70 50 70S66 82 66 100Z'],
        ['child', 'Enfant', 'people', circ(50, 30, 16) + 'M24 100C24 74 36 56 50 56S76 74 76 100Z'], ['bust', 'Portrait (médaillon)', 'people', circ(50, 50, 48) + circ(50, 40, 16) + 'M22 84C26 66 38 60 50 60S74 66 78 84Z', 1],
        ['soldier', 'Soldat', 'people', 'M30 20C30 8 40 2 50 2S70 8 70 20H76V26H24V20Z' + circ(50, 36, 12) + 'M18 100C18 70 32 52 50 52S82 70 82 100Z', 0, 'poilu militaire guerre'],
        // lieux et bâtiments
        ['house', 'Maison', 'places', 'M50 4L96 44H84V96H60V66H40V96H16V44H4Z'], ['church', 'Église', 'places', 'M46 0H54V8H62V16H54V24L74 42V54L96 64V100H4V64L26 54V42L46 24V16H38V8H46Z M44 100V80A6 6 0 0 1 56 80V100Z', 1, 'paroisse baptême'],
        ['castle', 'Château', 'places', 'M8 100V20H20V30H32V20H44V30H56V20H68V30H80V20H92V100H62V76A12 12 0 0 0 38 76V100Z', 0, 'tour'], ['mairie', 'Mairie', 'places', 'M50 2L98 30H2Z M8 34H92V40H8Z M14 44H24V86H14Z M32 44H42V86H32Z M58 44H68V86H58Z M76 44H86V86H76Z M4 90H96V100H4Z', 0, 'état civil'],
        ['mill', 'Moulin', 'places', 'M36 100L40 44H60L64 100Z M50 44L14 8L8 14Z M50 44L92 8L86 2Z M50 44L86 86L92 80Z M50 44L8 80L14 86Z'], ['boat', 'Bateau', 'places', 'M6 64H94L80 92H20Z M47 6V60H53V6Z M53 10L84 52H53Z M47 16L20 52H47Z', 0, 'émigration voyage'],
        ['factory', 'Usine', 'places', 'M4 100V44L28 58V44L52 58V44L76 58V8H90V100Z', 0, 'métier travail'], ['mountain', 'Montagne', 'places', 'M0 92L36 28L52 52L66 34L100 92Z'], ['bridge', 'Pont', 'places', 'M0 40H100V54H90V96H78V72A28 22 0 0 0 22 72V96H10V54H0Z'],
        // objets
        ['key', 'Clé', 'objects', circ(26, 50, 22) + circ(26, 50, 9) + 'M46 44H98V58H90V72H80V58H72V68H62V58H46Z', 1], ['lamp', 'Lampe', 'objects', 'M30 4H70L84 46H16Z M46 46H54V86H46Z M24 86H76V96H24Z'],
        ['chair', 'Chaise', 'objects', 'M22 2H32V48H76V58H72V98H64V64H32V98H24V58H22Z'], ['clock', 'Horloge', 'objects', circ(50, 50, 48) + circ(50, 50, 40) + 'M47 18H53V50H47Z M47 47H74V53H47Z', 1],
        ['glasses', 'Lunettes', 'objects', circ(26, 54, 22) + circ(26, 54, 15) + circ(74, 54, 22) + circ(74, 54, 15) + 'M44 48H56V54H44Z', 1], ['umbrella', 'Parapluie', 'objects', 'M2 50C6 22 26 6 50 6S94 22 98 50C90 44 82 44 76 50C70 44 62 44 56 50V86A10 10 0 0 1 36 86H44A2 2 0 0 0 46 86V50C40 44 32 44 26 50C20 44 10 44 2 50Z'],
        ['bulb', 'Ampoule', 'objects', 'M50 2A32 32 0 0 1 72 58C66 64 64 70 64 76H36C36 70 34 64 28 58A32 32 0 0 1 50 2Z M36 80H64V86H36Z M40 90H60L56 98H44Z', 0, 'idée'],
        ['magnifier', 'Loupe', 'objects', circ(40, 40, 32) + circ(40, 40, 22) + 'M62 68L70 60L98 88L90 96Z', 1, 'chercher enquête'], ['gift', 'Cadeau', 'objects', 'M6 32H94V50H6Z M12 50H88V98H12Z M50 32C38 10 16 14 28 32Z M50 32C62 10 84 14 72 32Z'],
        ['cup', 'Tasse', 'objects', 'M10 22H72V60A26 26 0 0 1 46 86H36A26 26 0 0 1 10 60Z M72 32H80A14 14 0 0 1 80 60H72V52H80A6 6 0 0 0 80 40H72Z'], ['camera', 'Appareil photo', 'objects', 'M4 30H28L36 16H64L72 30H96V88H4Z' + circ(50, 58, 20), 1, 'photo'],
        ['phone', 'Téléphone', 'objects', 'M28 2H72A6 6 0 0 1 78 8V92A6 6 0 0 1 72 98H28A6 6 0 0 1 22 92V8A6 6 0 0 1 28 2Z M28 12H72V84H28Z', 1], ['pencil', 'Crayon', 'objects', 'M72 4L96 28L36 88L6 96L12 64Z'],
        ['bag', 'Sac', 'objects', 'M12 34H88L94 98H6Z M34 34V24A16 16 0 0 1 66 24V34H58V24A8 8 0 0 0 42 24V34Z'], ['suitcase', 'Valise', 'objects', 'M4 28H96V92H4Z M36 28V16H64V28H56V22H44V28Z', 0, 'voyage'],
        ['hat', 'Chapeau', 'objects', 'M28 18H72L76 70H24Z M2 72C2 66 98 66 98 72C98 82 2 82 2 72Z'], ['bell', 'Cloche', 'objects', 'M50 4A6 6 0 0 1 56 10C72 14 80 28 80 48V68L90 80H10L20 68V48C20 28 28 14 44 10A6 6 0 0 1 50 4Z M40 84H60A10 10 0 0 1 40 84Z'],
        ['anchor', 'Ancre', 'objects', circ(50, 14, 10) + circ(50, 14, 4) + 'M46 24H54V86C68 84 80 76 84 60L76 62L88 44L94 66L88 62C84 82 68 96 50 96S16 82 12 62L6 66L12 44L24 62L16 60C20 76 32 84 46 86Z M30 34H70V42H30Z', 1, 'marin'],
        // nature
        ['leaf', 'Feuille', 'nature', 'M8 92C8 40 40 6 94 6C94 60 60 92 8 92Z'], ['flower', 'Fleur', 'nature', circ(50, 22, 18) + circ(77, 42, 18) + circ(66, 74, 18) + circ(34, 74, 18) + circ(23, 42, 18)],
        ['pine', 'Sapin', 'nature', 'M50 2L80 40H66L90 72H56V98H44V72H10L34 40H20Z'], ['wave', 'Vague', 'nature', 'M0 50C12 30 24 30 36 50S60 70 72 50C80 36 90 32 100 36V100H0Z', 0, 'mer'],
        ['fish', 'Poisson', 'nature', 'M4 50C20 22 58 18 76 44L98 24V76L76 56C58 82 20 78 4 50Z'], ['bird', 'Oiseau', 'nature', 'M2 56C18 40 32 40 44 50C50 30 68 16 98 20C82 28 74 44 72 58C66 82 40 90 20 78L2 56Z'],
        ['snow', 'Flocon', 'nature', star(6, 50, 10) + star(6, 34, 8, -60)], ['apple', 'Pomme', 'nature', 'M50 28C40 20 22 20 14 34C4 54 18 92 34 94C42 96 46 90 50 90S58 96 66 94C82 92 96 54 86 34C78 20 60 20 50 28Z M50 26C50 14 56 6 66 4C66 16 60 24 50 26Z'],
        ['mushroom', 'Champignon', 'nature', 'M4 50C4 22 26 4 50 4S96 22 96 50Z M36 50H64L68 96H32Z'], ['paw', 'Patte', 'nature', 'M50 50C66 50 80 66 80 80C80 92 66 94 50 90C34 94 20 92 20 80C20 66 34 50 50 50Z' + circ(22, 40, 10) + circ(40, 22, 10) + circ(60, 22, 10) + circ(78, 40, 10), 0, 'animal'],
    ];
    // formes géométriques calculées : polygones, étoiles, anneaux, parts de disque, croissants, cadres
    const sector = (deg, r0 = 0) => { const a1 = -90 * Math.PI / 180, a2 = (deg - 90) * Math.PI / 180, big = deg > 180 ? 1 : 0, P = (a, r) => `${(50 + Math.cos(a) * r).toFixed(1)} ${(50 + Math.sin(a) * r).toFixed(1)}`;
        return r0 ? `M${P(a1, 48)} A48 48 0 ${big} 1 ${P(a2, 48)} L${P(a2, r0)} A${r0} ${r0} 0 ${big} 0 ${P(a1, r0)}Z` : `M50 50 L${P(a1, 48)} A48 48 0 ${big} 1 ${P(a2, 48)}Z`; };
    const GEN = [
        ...[3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => [`poly_${n}`, `Polygone à ${n} côtés`, 'geo', poly(n, 50, n === 4 ? -45 : -90), 0, 'polygone']),
        ...[3, 4, 5, 6, 7, 8, 10, 12, 16, 20].flatMap(n => [[`starf_${n}`, `Étoile fine à ${n} branches`, 'stars', star(n, 50, n > 10 ? 38 : 18), 0, 'étoile'], [`starr_${n}`, `Étoile ronde à ${n} branches`, 'stars', star(n, 50, n > 10 ? 44 : 32), 0, 'étoile']]),
        ...[[90, 'Quart de disque'], [120, 'Tiers de disque'], [180, 'Demi-disque'], [240, 'Deux tiers de disque'], [270, 'Trois quarts de disque'], [300, 'Camembert']].map(([d, n]) => [`sector_${d}`, n, 'geo', sector(d), 0, 'part secteur']),
        ...[[90, 'Quart d’anneau'], [180, 'Demi-anneau'], [270, 'Trois quarts d’anneau']].map(([d, n]) => [`arc_${d}`, n, 'geo', sector(d, 28), 0, 'arc anneau']),
        ['ring_thin', 'Anneau fin', 'geo', circ(50, 50, 48) + circ(50, 50, 40), 1, 'cercle'], ['ring_thick', 'Anneau épais', 'geo', circ(50, 50, 48) + circ(50, 50, 16), 1, 'cercle'], ['rings2', 'Deux anneaux', 'geo', circ(36, 50, 30) + circ(36, 50, 22) + circ(64, 50, 30) + circ(64, 50, 22), 1, ''],
        ['frame_thin', 'Cadre fin', 'geo', 'M0 0H100V100H0Z M6 6V94H94V6Z', 1, ''], ['frame_round', 'Cadre arrondi', 'geo', 'M14 0H86A14 14 0 0 1 100 14V86A14 14 0 0 1 86 100H14A14 14 0 0 1 0 86V14A14 14 0 0 1 14 0Z M16 12A4 4 0 0 0 12 16V84A4 4 0 0 0 16 88H84A4 4 0 0 0 88 84V16A4 4 0 0 0 84 12Z', 1, ''],
        ['frame_oval', 'Médaillon', 'geo', 'M50 0A40 50 0 1 0 50.01 0Z M50 8A32 42 0 1 1 49.99 8Z', 1, 'portrait cadre'], ['oval_v', 'Ovale vertical', 'geo', 'M50 0A34 50 0 1 0 50.01 0Z', 0, ''], ['oval_h', 'Ovale horizontal', 'geo', 'M0 50A50 34 0 1 0 0 50.01Z', 0, ''],
        ['crescent_thin', 'Croissant fin', 'symbols', 'M66 4A46 46 0 1 0 98 80A40 40 0 1 1 66 4Z', 0, 'lune'], ['drop_inv', 'Goutte inversée', 'symbols', 'M50 98C50 98 14 54 14 34A36 36 0 0 1 86 34C86 54 50 98 50 98Z', 0, ''],
        ['heart_double', 'Deux cœurs', 'symbols', 'M34 70C14 56 2 46 2 32C2 20 11 12 21 12C28 12 32 16 34 21C36 16 40 12 47 12C57 12 66 20 66 32C66 46 54 56 34 70Z M66 88C50 77 40 69 40 58C40 49 47 43 55 43C60 43 64 46 66 50C68 46 72 43 77 43C85 43 92 49 92 58C92 69 82 77 66 88Z', 0, 'amour couple'],
        ['cross_greek', 'Croix grecque', 'faith', 'M38 0H62V38H100V62H62V100H38V62H0V38H38Z', 0, 'croix'], ['cross_maltese', 'Croix de Malte', 'faith', 'M50 50L30 0H70Z M50 50L100 30V70Z M50 50L70 100H30Z M50 50L0 70V30Z', 0, 'croix ordre'],
        ['cross_lorraine', 'Croix de Lorraine', 'faith', 'M44 0H56V18H76V28H56V42H84V52H56V100H44V52H16V42H44V28H24V18H44Z', 0, 'croix résistance'], ['cross_ortho', 'Croix orthodoxe', 'faith', 'M45 0H55V14H70V22H55V36H80V46H55V100H45V70L30 64L32 58L45 62V46H20V36H45V22H30V14H45Z', 0, 'croix'],
        ['banner_wave', 'Bannière ondulée', 'stars', 'M0 20C20 10 30 30 50 20S80 10 100 20V80C80 70 70 90 50 80S20 70 0 80Z', 0, 'ruban'], ['scroll_wide', 'Phylactère', 'stars', 'M12 30H88V20L100 32L88 44V70H12V80L0 68L12 56Z', 0, 'ruban banderole'],
        ['label_round', 'Étiquette ronde', 'elem', 'M20 20H100V80H20L0 50Z' + circ(18, 50, 5), 1, 'étiquette'], ['speech_oval', 'Bulle ovale', 'bubbles', 'M50 4C78 4 98 18 98 38S78 72 50 72C46 72 42 72 38 71L18 92L24 66C10 59 2 49 2 38C2 18 22 4 50 4Z', 0, 'bulle'],
        ['speech_round_r', 'Bulle (droite)', 'bubbles', 'M50 6C76 6 96 22 96 42C96 53 91 63 81 70L88 96L67 76C61 77 56 78 50 78C24 78 4 62 4 42S24 6 50 6Z', 0, 'bulle'], ['thought_small', 'Petite pensée', 'bubbles', circ(50, 40, 34) + circ(24, 82, 8) + circ(12, 94, 4), 0, 'pensée'],
    ];
    const SHAPES = [...RAW, ...GEN].map(([k, n, c, d, eo, tags]) => ({k, n, c, d, eo: !!eo, tags: tags || '', s: 100}));
    // pictogrammes ajoutés (heritage-board-shapes.js) : boîte 24 × 24
    for (const [c, rows] of Object.entries(ext.boardShapesExtra || {})) for (const [k, n, d, tags] of rows) SHAPES.push({k, n, c, d, eo: false, tags: tags || '', s: 24});
    const SHAPE_MAP = Object.fromEntries(SHAPES.map(s => [s.k, s]));

    /* ═════════ Préférences ═════════ */
    const KEY = 'genealogie-board-prefs';
    const PALETTE0 = {
        fill: ['transparent', '#d0021b', '#f5a623', '#f8e71c', '#7ed321', '#2a7de1', '#9013fe', '#ff6fb5', '#ffffff', '#bde0fe', '#fff3a3', '#caffbf'],
        stroke: ['transparent', '#111111', '#555555', '#d0021b', '#f5a623', '#f8e71c', '#7ed321', '#2a7de1', '#9013fe', '#ff6fb5', '#ffffff'],
        text: ['#111111', '#555555', '#d0021b', '#f5a623', '#f8e71c', '#7ed321', '#2a7de1', '#9013fe', '#ff6fb5', '#ffffff'],
        pen: ['#111111', '#555555', '#d0021b', '#f5a623', '#f8e71c', '#7ed321', '#2a7de1', '#9013fe', '#ff6fb5', '#ffffff'],
        note: ['#fff3a3', '#ffd6a5', '#caffbf', '#bde0fe', '#e4c1f9', '#ffc6d9', '#f1f1f1'],
        bg: ['#ffffff', '#fbf6ea', '#f3f5f8', '#eef6ee', '#fdf0f4', '#1e2227', '#c9a46b'],
        label: ['#111111', '#555555', '#d0021b', '#2a7de1', '#2b8a3e', '#c2185b', '#7b2cbf', '#ffffff'],
        labelbg: ['transparent', '#ffffff', '#fff3a3', '#e8f0ff', '#eef6ee', '#fdf0f4', '#111111'],
        labelborder: ['#111111', '#555555', '#d0021b', '#2a7de1', '#2b8a3e', '#c2185b'],
    };
    const COLOR_CATS = [['fill', 'Fond des formes, étiquettes, dossiers'], ['stroke', 'Bord des formes et contour des médias'], ['text', 'Couleur du texte, des traits et flèches'], ['pen', 'Dessin à main levée'], ['note', 'Notes'], ['bg', 'Fond du tableau'], ['label', 'Légendes des traits : texte'], ['labelbg', 'Légendes des traits : fond du cadre'], ['labelborder', 'Légendes des traits : bord du cadre']];
    const PALETTE_PRESETS = {
        'Archives': {fill: ['transparent', '#f4ecd8', '#e9dcc0', '#d8c3a5', '#b08968', '#7f5539', '#9c6644', '#e6ccb2', '#ffffff'], stroke: ['transparent', '#3b2f2f', '#7f5539', '#b08968', '#9c6644', '#d8c3a5'], text: ['#2b2118', '#5c4033', '#7f5539', '#9c6644', '#8b0000', '#1f3a5f'], pen: ['#2b2118', '#5c4033', '#8b0000', '#1f3a5f', '#556b2f'], note: ['#f4ecd8', '#e9dcc0', '#efe3c8', '#e6ccb2'], bg: ['#fbf6ea', '#f4ecd8', '#efe6d2']},
        'Pastel': {fill: ['transparent', '#ffd6e0', '#ffefcf', '#fdffb6', '#caffbf', '#9bf6ff', '#a0c4ff', '#bdb2ff', '#ffc6ff', '#ffffff'], stroke: ['transparent', '#6c757d', '#ffadad', '#ffd6a5', '#9bf6ff', '#a0c4ff', '#bdb2ff'], text: ['#343a40', '#6c757d', '#e5989b', '#6d6875', '#457b9d'], pen: ['#343a40', '#e5989b', '#457b9d', '#6d6875', '#b5838d'], note: ['#ffd6e0', '#ffefcf', '#fdffb6', '#caffbf', '#bdb2ff'], bg: ['#ffffff', '#fdf0f4', '#f1f7ff']},
        'Contraste fort': {fill: ['transparent', '#000000', '#ffffff', '#ff0000', '#ffff00', '#00a000', '#0000ff'], stroke: ['transparent', '#000000', '#ffffff', '#ff0000', '#0000ff'], text: ['#000000', '#ffffff', '#ff0000', '#0000ff'], pen: ['#000000', '#ff0000', '#0000ff', '#00a000'], note: ['#ffff00', '#ffffff', '#00ffff'], bg: ['#ffffff', '#000000']},
    };
    const TOOLS = [['select', 'Choisir'], ['hand', 'Se déplacer'], ['text', 'Texte'], ['note', 'Note'], ['shape', 'Formes'], ['line', 'Trait'], ['arrow', 'Flèche'], ['pen', 'Dessin'], ['eraser', 'Gomme'], ['table', 'Tableur']];
    const HEADER = [['undo', '↶ Annuler'], ['redo', '↷ Rétablir'], ['bg', 'Fond'], ['snaps', '📸 Instantanés'], ['copy', '⧉ Copie'], ['export', '⤓ Exporter / imprimer'], ['full', '⛶ Plein écran'], ['lockall', '🔒 Verrouiller'], ['hyp', '❓ Pistes à vérifier (compteur)'], ['search', '🔍 Chercher dans le tableau'], ['layers', '🗂 Calques'], ['snapgrid', '🧲 Grille aimantée'], ['minimap', '🗺 Mini-carte'], ['present', '▶ Présenter'], ['prefs', '⚙️ Réglages des tableaux'], ['delete', '🗑 Supprimer'], ['close', '✕ Fermer']];
    const INSPECTOR = [['fill', 'Fond'], ['stroke', 'Bord / contour'], ['color', 'Couleur du texte ou du trait'], ['sw', 'Épaisseur et style du trait'], ['shape', 'Forme'], ['radius', 'Arrondi'], ['text', 'Taille et style du texte'], ['list', 'Puces et numéros'], ['font', 'Police'], ['heads', 'Pointes des flèches'], ['linepath', 'Forme du trait et légende'], ['table', 'Tableur'], ['brush', 'Pinceau'], ['title', 'Titre, étiquette, adresse'], ['preview', 'Aperçu vivant'], ['pshow', 'Fiche : ce qu’elle montre'], ['hyp', 'Piste : à vérifier, confirmée, fausse'], ['tl', 'Frise vivante'], ['map', 'Carte et repères'], ['connector', 'Liens tout prêts (frère de…)'], ['align', 'Aligner et répartir'], ['layer', 'Calque'], ['comments', 'Commentaires'], ['opacity', 'Opacité'], ['actions', 'Boutons (dupliquer, verrouiller…)']];
    const ADD = [['files', 'Des fichiers'], ['media', 'Un média de l’app'], ['web', 'D’ailleurs (web)'], ['person', 'Une fiche'], ['screen', 'Un écran de l’app'], ['widget', 'Un de mes widgets'], ['recueil', 'Un recueil'], ['tag', 'Une étiquette'], ['table', 'Un tableur'], ['folder', 'Un dossier'], ['tree', 'Un arbre automatique'], ['timeline', 'Une frise vivante'], ['map', 'Une carte'], ['frame', 'Un cadre (section)'], ['memo', 'Un mémo vocal'], ['import', 'Importer un tableau']];
    // les réglages d'une légende de trait (panneau de droite), dans l'ordre voulu
    const LEGEND = [['lbSize', 'Taille du texte'], ['lbFont', 'Police'], ['lbStyle', 'Gras, italique'], ['lbColor', 'Couleur du texte'], ['lbBg', 'Fond du cadre'], ['lbBorder', 'Bord du cadre'], ['lbBw', 'Épaisseur du bord'], ['lbPad', 'Marge dans le cadre'], ['lbRadius', 'Arrondi du cadre'], ['lbPos', 'Position le long du trait'], ['lbSide', 'Côté'], ['lbOffset', 'Écart avec le trait'], ['lbRotate', 'Suivre l’angle du trait']];
    const HEADS = ['none', 'triangle', 'stealth', 'open', 'double', 'half', 'circle', 'ring', 'dot', 'square', 'square_o', 'diamond', 'diamond_o', 'bar', 'fork', 'tail',
        'triangle_o', 'line_arrow', 'chevron2', 'cross', 'plus', 'star', 'heart', 'one', 'many', 'semicircle'];
    /* Les pointes des traits : dessin (boîte 10 × 10, pointe vers la droite), point d'accroche, nom ; et les pointes à soi (réglages) */
    const HEAD_NAMES = {none: 'aucune', triangle: '▶ triangle', stealth: '➤ flèche fine', open: '› ouverte', double: '⏩ double', half: '◣ demi-flèche', circle: '● rond', ring: '○ rond vide', dot: '• point', square: '■ carré', square_o: '□ carré vide', diamond: '◆ losange', diamond_o: '◇ losange vide', bar: '| barre', fork: '⋔ patte d’oie', tail: '» plumes',
        triangle_o: '▷ triangle vide', line_arrow: '⟶ flèche longue', chevron2: '» double chevron', cross: '✕ croix', plus: '＋ plus', star: '★ étoile', heart: '♥ cœur', one: '‖ un (deux barres)', many: '⋲ plusieurs (pied de corbeau)', semicircle: '◗ demi-rond'};
    const HEAD_REF = {triangle: 8, open: 8, stealth: 8, double: 8, half: 8, circle: 5, ring: 5, dot: 5, square: 5, square_o: 5, diamond: 5, diamond_o: 5, bar: 5, fork: 9, tail: 3,
        triangle_o: 8, line_arrow: 9, chevron2: 8, cross: 5, plus: 5, star: 5, heart: 5, one: 7, many: 9, semicircle: 3};
    const HEAD_SVG = {
        triangle: c => `<path d="M0,0 L10,5 L0,10 z" fill="${c}"/>`,
        open: c => `<path d="M1,1 L9,5 L1,9" fill="none" stroke="${c}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`,
        circle: c => `<circle cx="5" cy="5" r="4.2" fill="${c}"/>`,
        square: c => `<rect x="1" y="1" width="8" height="8" fill="${c}"/>`,
        diamond: c => `<path d="M0,5 L5,0 L10,5 L5,10 z" fill="${c}"/>`,
        bar: c => `<rect x="4" y="0" width="2" height="10" fill="${c}"/>`,
        stealth: c => `<path d="M0,0 L10,5 L0,10 L3,5 z" fill="${c}"/>`,
        double: c => `<path d="M0,0 L5,5 L0,10 z M5,0 L10,5 L5,10 z" fill="${c}"/>`,
        half: c => `<path d="M0,0 L10,5 L0,5 z" fill="${c}"/>`,
        ring: c => `<circle cx="5" cy="5" r="3.6" fill="#fff" stroke="${c}" stroke-width="1.6"/>`,
        dot: c => `<circle cx="5" cy="5" r="2.4" fill="${c}"/>`,
        square_o: c => `<rect x="1.6" y="1.6" width="6.8" height="6.8" fill="#fff" stroke="${c}" stroke-width="1.6"/>`,
        diamond_o: c => `<path d="M1,5 L5,1 L9,5 L5,9 z" fill="#fff" stroke="${c}" stroke-width="1.6"/>`,
        fork: c => `<path d="M10,5 L1,0 M10,5 L1,5 M10,5 L1,10" fill="none" stroke="${c}" stroke-width="1.6" stroke-linecap="round"/>`,
        tail: c => `<path d="M0,0 L4,5 L0,10 M3,0 L7,5 L3,10" fill="none" stroke="${c}" stroke-width="1.6" stroke-linecap="round"/>`,
        triangle_o: c => `<path d="M1,1 L9,5 L1,9 z" fill="#fff" stroke="${c}" stroke-width="1.5" stroke-linejoin="round"/>`,
        line_arrow: c => `<path d="M0,2.5 L10,5 L0,7.5 z" fill="${c}"/>`,
        chevron2: c => `<path d="M0,1 L4,5 L0,9 M5,1 L9,5 L5,9" fill="none" stroke="${c}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`,
        cross: c => `<path d="M2,2 L8,8 M8,2 L2,8" fill="none" stroke="${c}" stroke-width="1.8" stroke-linecap="round"/>`,
        plus: c => `<path d="M5,1 V9 M1,5 H9" fill="none" stroke="${c}" stroke-width="1.8" stroke-linecap="round"/>`,
        star: c => `<path d="M5,0 L6.2,3.4 L9.8,3.5 L7,5.7 L8,9.2 L5,7.2 L2,9.2 L3,5.7 L0.2,3.5 L3.8,3.4 z" fill="${c}"/>`,
        heart: c => `<path d="M5,9 C1,6 0,4 1,2.2 C2.2,0.4 4.3,1 5,2.6 C5.7,1 7.8,0.4 9,2.2 C10,4 9,6 5,9 z" fill="${c}" transform="rotate(-90 5 5)"/>`,
        one: c => `<path d="M5,0 V10 M8,0 V10" fill="none" stroke="${c}" stroke-width="1.5"/>`,
        many: c => `<path d="M10,0 L1,5 L10,10 M1,5 H10 M3,0 V10" fill="none" stroke="${c}" stroke-width="1.4"/>`,
        semicircle: c => `<path d="M3,0 A5,5 0 0 1 3,10 z" fill="${c}"/>`,
    };
    const customHead = (k, p) => ((p || prefs()).customHeads || []).find(h => h.k === k);
    const headSvg = (k, c, p) => {
        if (HEAD_SVG[k]) return HEAD_SVG[k](c);
        const h = customHead(k, p); if (!h) return HEAD_SVG.triangle(c);
        const s = 10 / (h.box || 100);
        return `<g transform="rotate(${h.rot || 0} 5 5) scale(${s})"><path d="${h.d}" ${h.fill === false ? `fill="none" stroke="${c}" stroke-width="${(1.6 / s).toFixed(2)}" stroke-linejoin="round" stroke-linecap="round"` : `fill="${c}"`} ${h.eo ? 'fill-rule="evenodd"' : ''}/></g>`;
    };
    const headRef = (k, p) => HEAD_REF[k] ?? (customHead(k, p)?.ref ?? 8);
    const headName = (k, p) => HEAD_NAMES[k] || (customHead(k, p) ? '✏️ ' + customHead(k, p).n : k);
    const headExists = (k, p) => k === 'none' || !!HEAD_SVG[k] || !!customHead(k, p);
    const allHeads = p => [...HEADS, ...((p || prefs()).customHeads || []).map(h => h.k)];
    const headPreview = (k, p, c = '#333') => k === 'none' ? '<svg viewBox="0 0 44 12" width="44" height="12"><line x1="2" y1="6" x2="40" y2="6" stroke="#333" stroke-width="2"/></svg>' : `<svg viewBox="0 0 44 12" width="44" height="12" style="overflow:visible"><line x1="2" y1="6" x2="${34 - (10 - headRef(k, p))}" y2="6" stroke="${c}" stroke-width="2"/><g transform="translate(30,1)">${headSvg(k, c, p)}</g></svg>`;
    const DEFAULTS = () => ({
        palettes: [{id: 'p0', name: 'Couleurs de l’app', colors: JSON.parse(JSON.stringify(PALETTE0))}], palette: 'p0',
        heads: HEADS.slice(), headsHidden: [], headStart: 'none', headEnd: 'triangle',
        shapeCats: CATS.map(c => c[0]), shapeOrder: {}, shapesHidden: [], quickShapes: ['rect', 'round', 'ellipse', 'triangle', 'diamond', 'star', 'hexagon', 'bubble', 'cloud', 'arrow_r', 'heart', 'tree'],
        customShapes: [],
        fontLists: [{name: 'Pour tous les jours', fonts: ['system-ui', 'Georgia', 'Helvetica Neue', 'Times New Roman', 'Courier New']}, {name: 'Écritures anciennes', fonts: ['Garamond', 'Baskerville', 'Didot', 'Palatino', 'Apple Chancery', 'Snell Roundhand']}],
        strokeMin: 0.5, strokeMax: 60, textMin: 6, textMax: 200, radius: 14,
        table: {rows: 4, cols: 3, header: true, hcol: false, stripes: true, hfill: '#e8eef7', fs: 14, headers: 'Nom;Année;Lieu'},
        brushes: [], cmtWords: ['À vérifier', 'Question', 'Idée', 'Source ?', 'Important'],
        toolsOrder: TOOLS.map(t => t[0]), toolsHidden: [], headerOrder: HEADER.map(t => t[0]), headerHidden: [],
        layout: {toolbar: 'top', inspector: 'right', size: 'm', title: 'show'},
        inspectorOrder: INSPECTOR.map(t => t[0]), inspectorHidden: [], addOrder: ADD.map(t => t[0]), addHidden: [], legendOrder: LEGEND.map(t => t[0]), legendHidden: [],
    });
    const sortBy = (list, order) => [...list].sort((a, b) => { const i = order.indexOf(a), j = order.indexOf(b); return (i < 0 ? 1e3 : i) - (j < 0 ? 1e3 : j); });
    const clean = raw => {
        const d = DEFAULTS(), p = {...d, ...(raw && typeof raw === 'object' ? raw : {})};
        const num = (v, a, z, def) => Number.isFinite(Number(v)) ? Math.max(a, Math.min(z, Number(v))) : def;
        p.strokeMin = num(p.strokeMin, 0.5, 500, d.strokeMin); p.strokeMax = num(p.strokeMax, p.strokeMin, 500, d.strokeMax);
        p.textMin = num(p.textMin, 2, 500, d.textMin); p.textMax = num(p.textMax, p.textMin, 500, d.textMax); p.radius = num(p.radius, 0, 200, d.radius);
        const isColor = c => /^(#[0-9a-f]{3,8}|transparent)$/i.test(String(c));
        p.palettes = (Array.isArray(p.palettes) ? p.palettes : []).filter(x => x && typeof x === 'object' && x.colors && typeof x.colors === 'object').slice(0, 30).map((x, i) => ({id: String(x.id || 'p' + i).replace(/[^\w-]/g, '') || 'p' + i, name: String(x.name || 'Palette').slice(0, 60),
            colors: Object.fromEntries(COLOR_CATS.map(([k]) => [k, (Array.isArray(x.colors[k]) ? x.colors[k] : PALETTE0[k]).filter(isColor).slice(0, 40)]))}));
        if (!p.palettes.length) p.palettes = d.palettes;
        if (!p.palettes.some(x => x.id === p.palette)) p.palette = p.palettes[0].id;
        for (const k of ['heads', 'headsHidden', 'shapeCats', 'shapesHidden', 'quickShapes', 'toolsOrder', 'toolsHidden', 'headerOrder', 'headerHidden', 'inspectorOrder', 'inspectorHidden', 'addOrder', 'addHidden', 'legendOrder', 'legendHidden']) p[k] = (Array.isArray(p[k]) ? p[k] : d[k]).map(String).slice(0, 400);
        { const L = p.layout && typeof p.layout === 'object' ? p.layout : {}; p.layout = {toolbar: ['top', 'left', 'right', 'bottom'].includes(L.toolbar) ? L.toolbar : 'top', inspector: ['right', 'left', 'hidden'].includes(L.inspector) ? L.inspector : 'right', size: ['s', 'm', 'l'].includes(L.size) ? L.size : 'm', title: ['show', 'compact'].includes(L.title) ? L.title : 'show'}; }
        p.cmtWords = (Array.isArray(p.cmtWords) ? p.cmtWords : d.cmtWords).map(w => String(w).trim().slice(0, 30)).filter(Boolean).slice(0, 30); if (!p.cmtWords.length) p.cmtWords = d.cmtWords;
        p.customHeads = (Array.isArray(p.customHeads) ? p.customHeads : []).filter(h => h && typeof h === 'object' && /^[MLHVCSQTAZmlhvcsqtazEe0-9.,\s+-]{1,30000}$/.test(String(h.d || ''))).slice(0, 100).map(h => ({k: 'myh_' + String(h.k || '').replace(/^myh_/, '').replace(/[^\w-]/g, '').slice(0, 30), n: String(h.n || 'Ma pointe').slice(0, 60),
            d: String(h.d), box: Math.max(1, Math.min(1000, Number(h.box) || 100)), rot: [0, 90, 180, 270].includes(Number(h.rot)) ? Number(h.rot) : 0, fill: h.fill !== false, eo: !!h.eo, ref: Math.max(0, Math.min(10, Number(h.ref ?? 8)))})).filter(h => h.k !== 'myh_');
        p.heads = sortBy(allHeads(p), p.heads);
        p.shapeCats = sortBy(CATS.map(c => c[0]), p.shapeCats);
        p.toolsOrder = sortBy(TOOLS.map(t => t[0]), p.toolsOrder); p.headerOrder = sortBy(HEADER.map(t => t[0]), p.headerOrder);
        p.inspectorOrder = sortBy(INSPECTOR.map(t => t[0]), p.inspectorOrder); p.addOrder = sortBy(ADD.map(t => t[0]), p.addOrder); p.legendOrder = sortBy(LEGEND.map(t => t[0]), p.legendOrder);
        if (!allHeads(p).includes(p.headStart)) p.headStart = 'none'; if (!allHeads(p).includes(p.headEnd)) p.headEnd = 'triangle';
        p.shapeOrder = Object.fromEntries(Object.entries(p.shapeOrder && typeof p.shapeOrder === 'object' && !Array.isArray(p.shapeOrder) ? p.shapeOrder : {}).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, v.map(String).slice(0, 500)]));
        p.customShapes = (Array.isArray(p.customShapes) ? p.customShapes : []).filter(s => s && typeof s === 'object' && (s.d || s.mask)).slice(0, 200).map(s => ({k: 'my_' + String(s.k || '').replace(/^my_/, '').replace(/[^\w-]/g, '').slice(0, 30), n: String(s.n || 'Ma forme').slice(0, 60), c: 'mine',
            d: /^[MLHVCSQTAZmlhvcsqtazEe0-9.,\s+-]{0,30000}$/.test(String(s.d || '')) ? String(s.d || '') : '', eo: !!s.eo, mask: /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(String(s.mask || '')) ? String(s.mask).slice(0, 400000) : '', tags: ''}));
        p.fontLists = (Array.isArray(p.fontLists) ? p.fontLists : d.fontLists).filter(l => l && typeof l === 'object').slice(0, 30).map(l => ({name: String(l?.name || 'Ma liste').slice(0, 60), fonts: (Array.isArray(l?.fonts) ? l.fonts : []).map(f => String(f).replace(/[^\w\s,'\-À-ÿ.]/g, '').trim()).filter(Boolean).slice(0, 200)}));
        const t = p.table && typeof p.table === 'object' ? p.table : {};
        p.table = {rows: num(t.rows, 1, 100, 4), cols: num(t.cols, 1, 30, 3), header: t.header !== false, hcol: !!t.hcol, stripes: t.stripes !== false, hfill: isColor(t.hfill) ? t.hfill : '#e8eef7', fs: num(t.fs, 6, 80, 14), headers: String(t.headers ?? d.table.headers).slice(0, 600)};
        p.brushes = (Array.isArray(p.brushes) ? p.brushes : []).filter(b0 => b0 && typeof b0 === 'object').slice(0, 60).map(b0 => ({id: 'b_' + String(b0.id || '').replace(/^b_/, '').replace(/[^\w-]/g, '').slice(0, 30), name: String(b0.name || 'Mon pinceau').slice(0, 40), icon: String(b0.icon || '🖌').slice(0, 4),
            base: ['pen', 'mono', 'marker', 'pencil', 'pastel', 'fountain', 'calligraphy', 'brushstroke', 'watercolor', 'fill', 'highlight', 'chalk', 'neon', 'spray', 'dotted'].includes(b0.base) ? b0.base : 'pen',
            sw: num(b0.sw, 0.5, 500, 4), opacity: num(b0.opacity, 0.05, 1, 1), hardness: num(b0.hardness, 0, 100, 100), color: isColor(b0.color) ? b0.color : '', dash: ['', 'dash', 'long', 'dot', 'dashdot'].includes(b0.dash) ? b0.dash : ''}));
        return p;
    };
    let cache = null;
    // des ensembles de réglages gardés sous un nom (comme les designs d'Apparence)
    const SETS_KEY = 'genealogie-board-prefs-sets';
    const sets = () => { try { const l = JSON.parse(localStorage.getItem(SETS_KEY) || '[]'); return Array.isArray(l) ? l.filter(x => x && typeof x.name === 'string' && x.prefs && typeof x.prefs === 'object').slice(0, 50) : []; } catch (_) { return []; } };
    const saveSets = l => { try { localStorage.setItem(SETS_KEY, JSON.stringify(l)); return true; } catch (_) { toast('Trop lourd pour être gardé (retire des formes faites d’une image).', 'error'); return false; } };
    const prefs = () => { if (cache) return cache; let raw = null; try { raw = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (_) {} try { cache = clean(raw); } catch (_) { cache = clean(null); } return cache; };
    // réglages changés ailleurs (autre fenêtre, réglages du site) : on relit
    window.addEventListener('storage', e => { if (e.key === KEY) cache = null; });
    const savePrefs = p => { cache = clean(p); try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch (e) { toast('Réglages trop lourds pour être gardés (retire des formes faites d’une image).', 'error'); } return cache; };
    const palette = (cat, p = prefs()) => (p.palettes.find(x => x.id === p.palette) || p.palettes[0]).colors[cat] || PALETTE0[cat];
    const allShapes = (p = prefs()) => [...SHAPES, ...p.customShapes];
    const shapesOf = (cat, p = prefs()) => { const l = allShapes(p).filter(s => s.c === cat); return sortBy(l.map(s => s.k), p.shapeOrder[cat] || []).map(k => l.find(s => s.k === k)); };
    const shapeByKey = (k, p = prefs()) => SHAPE_MAP[k] || p.customShapes.find(s => s.k === k);
    const shapeSvg = (s, size = 28) => s?.mask ? `<span class="h-bk-shmask" style="width:${size}px;height:${size}px;-webkit-mask-image:url(${s.mask});mask-image:url(${s.mask})"></span>` : `<svg viewBox="${-(s?.s || 100) * .04} ${-(s?.s || 100) * .04} ${(s?.s || 100) * 1.08} ${(s?.s || 100) * 1.08}" width="${size}" height="${size}"><path d="${s?.d || ''}" ${s?.eo ? 'fill-rule="evenodd"' : ''} fill="currentColor" stroke="currentColor" stroke-width="${(s?.s || 100) / 50}" stroke-opacity=".5"/></svg>`;
    ext.boardKit = {CATS, SHAPES, SHAPE_MAP, COLOR_CATS, PALETTE0, TOOLS, HEADER, INSPECTOR, ADD, LEGEND, HEADS, HEAD_NAMES, headSvg, headRef, headName, headExists, allHeads, headPreview, prefs, savePrefs, palette, allShapes, shapesOf, shapeByKey, shapeSvg, sortBy, clean, circ};

    /* ═════════ Chemins : lire un tracé SVG, le transformer (tourner, retourner, étirer), le recadrer ═════════ */
    // Tout est ramené à des segments absolus M / L / C / Z (les arcs deviennent des courbes) : une transformation est alors exacte.
    function parsePath(d) {
        const out = []; let i = 0; const str = String(d || ''), len = str.length;
        const num = () => { const m = /^[\s,]*([+-]?(?:\d*\.\d+|\d+\.?)(?:[eE][+-]?\d+)?)/.exec(str.slice(i)); if (!m) return null; i += m[0].length; return parseFloat(m[1]); };
        const flag = () => { const m = /^[\s,]*([01])/.exec(str.slice(i)); if (!m) return null; i += m[0].length; return +m[1]; };
        const COUNT = {M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0};
        while (i < len) {
            const m = /^[\s,]*([MLHVCSQTAZmlhvcsqtaz])/.exec(str.slice(i)); if (!m) break; i += m[0].length;
            const cmd = m[1], n = COUNT[cmd.toUpperCase()];
            if (!n) { out.push([cmd]); continue; }
            let first = true;
            for (;;) {
                const args = [];
                for (let k = 0; k < n; k++) { const v = cmd.toUpperCase() === 'A' && (k === 3 || k === 4) ? flag() : num(); if (v === null) break; args.push(v); }
                if (args.length < n) break;
                out.push([first || !'Mm'.includes(cmd) ? cmd : (cmd === 'M' ? 'L' : 'l'), ...args]); first = false;
            }
        }
        return out;
    }
    function arcToCubics(x1, y1, rx, ry, phi, fa, fs, x2, y2) {
        if (!rx || !ry) return [[x1, y1, x2, y2, x2, y2]];
        const r = phi * Math.PI / 180, cos = Math.cos(r), sin = Math.sin(r);
        const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2, x1p = cos * dx + sin * dy, y1p = -sin * dx + cos * dy;
        rx = Math.abs(rx); ry = Math.abs(ry); const lam = x1p * x1p / (rx * rx) + y1p * y1p / (ry * ry); if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
        const sign = fa === fs ? -1 : 1, num0 = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p, co = sign * Math.sqrt(Math.max(0, num0 / (rx * rx * y1p * y1p + ry * ry * x1p * x1p)));
        const cxp = co * rx * y1p / ry, cyp = -co * ry * x1p / rx, cx = cos * cxp - sin * cyp + (x1 + x2) / 2, cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
        const ang = (ux, uy, vx, vy) => { const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy); return a; };
        let t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry), dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
        if (!fs && dt > 0) dt -= 2 * Math.PI; if (fs && dt < 0) dt += 2 * Math.PI;
        const segs = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2))), d = dt / segs, k = 4 / 3 * Math.tan(d / 4), out = [];
        const pt = (t) => [cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin, cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos];
        const dpt = (t) => [-rx * Math.sin(t) * cos - ry * Math.cos(t) * sin, -rx * Math.sin(t) * sin + ry * Math.cos(t) * cos];
        for (let s0 = 0; s0 < segs; s0++) { const a = t1 + s0 * d, b = a + d, p0 = pt(a), p3 = pt(b), d0 = dpt(a), d3 = dpt(b); out.push([p0[0] + k * d0[0], p0[1] + k * d0[1], p3[0] - k * d3[0], p3[1] - k * d3[1], p3[0], p3[1]]); }
        return out;
    }
    /** → [['M',x,y],['L',x,y],['C',x1,y1,x2,y2,x,y],['Z']] en absolu */
    function absPath(d) {
        const out = []; let x = 0, y = 0, sx = 0, sy = 0, lc = null, lq = null;
        for (const [cmd, ...a] of parsePath(d)) {
            const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase(), ox = rel ? x : 0, oy = rel ? y : 0;
            if (C === 'M') { x = a[0] + ox; y = a[1] + oy; sx = x; sy = y; out.push(['M', x, y]); lc = lq = null; }
            else if (C === 'L') { x = a[0] + ox; y = a[1] + oy; out.push(['L', x, y]); lc = lq = null; }
            else if (C === 'H') { x = a[0] + (rel ? x : 0); out.push(['L', x, y]); lc = lq = null; }
            else if (C === 'V') { y = a[0] + (rel ? y : 0); out.push(['L', x, y]); lc = lq = null; }
            else if (C === 'C') { const c = [a[0] + ox, a[1] + oy, a[2] + ox, a[3] + oy, a[4] + ox, a[5] + oy]; out.push(['C', ...c]); lc = [c[2], c[3]]; lq = null; x = c[4]; y = c[5]; }
            else if (C === 'S') { const r1 = lc ? [2 * x - lc[0], 2 * y - lc[1]] : [x, y], c = [...r1, a[0] + ox, a[1] + oy, a[2] + ox, a[3] + oy]; out.push(['C', ...c]); lc = [c[2], c[3]]; lq = null; x = c[4]; y = c[5]; }
            else if (C === 'Q' || C === 'T') { const q = C === 'Q' ? [a[0] + ox, a[1] + oy] : (lq ? [2 * x - lq[0], 2 * y - lq[1]] : [x, y]), e = C === 'Q' ? [a[2] + ox, a[3] + oy] : [a[0] + ox, a[1] + oy];
                out.push(['C', x + 2 / 3 * (q[0] - x), y + 2 / 3 * (q[1] - y), e[0] + 2 / 3 * (q[0] - e[0]), e[1] + 2 / 3 * (q[1] - e[1]), e[0], e[1]]); lq = q; lc = null; x = e[0]; y = e[1]; }
            else if (C === 'A') { const ex = a[5] + ox, ey = a[6] + oy; for (const c of arcToCubics(x, y, a[0], a[1], a[2], a[3], a[4], ex, ey)) out.push(['C', ...c]); x = ex; y = ey; lc = lq = null; }
            else if (C === 'Z') { out.push(['Z']); x = sx; y = sy; lc = lq = null; }
        }
        return out;
    }
    const mapPath = (segs, f) => segs.map(([c, ...a]) => { const o = [c]; for (let k = 0; k < a.length; k += 2) o.push(...f(a[k], a[k + 1])); return o; });
    const pathBox = segs => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const [, ...a] of segs) for (let k = 0; k < a.length; k += 2) { x0 = Math.min(x0, a[k]); x1 = Math.max(x1, a[k]); y0 = Math.min(y0, a[k + 1]); y1 = Math.max(y1, a[k + 1]); } return isFinite(x0) ? {x0, y0, x1, y1, w: x1 - x0, h: y1 - y0} : null; };
    const pathStr = segs => segs.map(([c, ...a]) => c + a.map(v => +v.toFixed(2)).join(' ')).join('');
    /** Une forme ramenée dans la boîte 100 × 100, puis transformée : retournée, tournée (degrés), étirée, déplacée et mise à l'échelle */
    function shapeSegs(sh, {flipH = false, flipV = false, rot = 0, sx = 1, sy = 1, cx = 50, cy = 50, size = 1} = {}) {
        const k = 100 / (sh.s || 100), r = rot * Math.PI / 180, cos = Math.cos(r), sin = Math.sin(r);
        return mapPath(absPath(sh.d), (x, y) => { let X = x * k - 50, Y = y * k - 50; if (flipH) X = -X; if (flipV) Y = -Y; X *= sx; Y *= sy; const rx = X * cos - Y * sin, ry = X * sin + Y * cos; return [cx + rx * size, cy + ry * size]; });
    }
    /** Recadre un ensemble de segments dans 0..100 (proportions gardées, centré) */
    function fitSegs(segs) { const b = pathBox(segs); if (!b || !b.w || !b.h) return segs; const k = 100 / Math.max(b.w, b.h), ox = (100 - b.w * k) / 2, oy = (100 - b.h * k) / 2; return mapPath(segs, (x, y) => [ox + (x - b.x0) * k, oy + (y - b.y0) * k]); }

    /** Créer une forme à partir d'une autre : la retourner, la tourner, l'étirer, lui ajouter d'autres formes ou y percer des trous */
    function openComposer({base = 'heart', onSave} = {}) {
        const st = {base, flipH: false, flipV: false, rot: 0, sw: 100, sh: 100, pieces: []};
        const byKey = k => shapeByKey(k, prefs());
        const usable = () => allShapes(prefs()).filter(sh => sh.d && !sh.mask);
        const compute = () => {
            const b0 = byKey(st.base); if (!b0?.d) return {d: '', eo: false};
            let segs = shapeSegs(b0, {flipH: st.flipH, flipV: st.flipV, rot: st.rot, sx: st.sw / 100, sy: st.sh / 100});
            let eo = false;
            for (const pc of st.pieces) { const sh = byKey(pc.k); if (!sh?.d) continue; segs = segs.concat(shapeSegs(sh, {rot: pc.rot, cx: pc.x, cy: pc.y, size: pc.size / 100, flipH: pc.flipH})); if (pc.op === 'hole') eo = true; }
            return {d: pathStr(fitSegs(segs)), eo};
        };
        const picker = (attr, cur) => `<div class="h-cmp-pick" ${attr}><input type="search" placeholder="Chercher une forme (cœur, maison, chien…)" data-cmp-q><div class="h-cmp-res" data-cmp-res>${resHtml('', cur)}</div></div>`;
        const resHtml = (q, cur) => { const n = q.toLowerCase(); let l = usable().filter(sh => !n || (sh.n + ' ' + sh.tags).toLowerCase().includes(n)).slice(0, n ? 60 : 36); const curSh = cur && byKey(cur); if (curSh && !l.includes(curSh)) l = [curSh, ...l]; return l.map(sh => `<button type="button" class="h-bd-shcell ${sh.k === cur ? 'is-on' : ''}" data-cmp-k="${esc(sh.k)}" title="${esc(sh.n)}">${shapeSvg(sh, 28)}</button>`).join('') || '<p class="muted">Rien trouvé.</p>'; };
        const pieceRow = (pc, i) => `<div class="h-cmp-piece" data-pc="${i}"><span class="h-cmp-pshape">${shapeSvg(byKey(pc.k), 26)}</span><label>${esc(byKey(pc.k)?.n || '')}<select data-pcf="op"><option value="add" ${pc.op === 'add' ? 'selected' : ''}>➕ ajouter (réunir)</option><option value="hole" ${pc.op === 'hole' ? 'selected' : ''}>⭕ percer (trou)</option></select></label>
            <label>Gauche → droite<input type="range" min="-20" max="120" value="${pc.x}" data-pcf="x"></label><label>Haut → bas<input type="range" min="-20" max="120" value="${pc.y}" data-pcf="y"></label><label>Taille<input type="range" min="5" max="150" value="${pc.size}" data-pcf="size"></label><label>Rotation<input type="range" min="-180" max="180" value="${pc.rot}" data-pcf="rot"></label>
            <label class="checkbox-line"><input type="checkbox" data-pcf="flipH" ${pc.flipH ? 'checked' : ''}> <span>miroir</span></label><button type="button" class="h-pet-x" data-pc-del title="Retirer" aria-label="Retirer">×</button></div>`;
        ext.openDialog({eyebrow: 'FORMES', title: 'Créer une forme à partir d’une autre', wide: true, submitLabel: 'Enregistrer la forme',
            body: `<div class="h-cmp"><div class="h-cmp-left">
                <h4>1. La forme de départ</h4>${picker('data-cmp-base', st.base)}
                <h4>2. La transformer</h4><div class="h-cmp-row"><button type="button" class="h-bt" data-cmp-flip="flipH" title="Retourner (miroir gauche-droite)">⇋ Miroir</button><button type="button" class="h-bt" data-cmp-flip="flipV" title="Retourner (haut-bas)">⇵ Haut-bas</button><button type="button" class="h-bt" data-cmp-rot="-90">↺ 90°</button><button type="button" class="h-bt" data-cmp-rot="90">↻ 90°</button></div>
                <label>Rotation <input type="range" min="-180" max="180" value="0" data-cmp-n="rot"> <output data-cmp-o="rot">0°</output></label>
                <label>Largeur <input type="range" min="20" max="300" value="100" data-cmp-n="sw"> <output data-cmp-o="sw">100 %</output></label><label>Hauteur <input type="range" min="20" max="300" value="100" data-cmp-n="sh"> <output data-cmp-o="sh">100 %</output></label>
                <h4>3. Lui ajouter d’autres formes, ou y percer un trou <small class="muted">(facultatif)</small></h4><div data-cmp-pieces></div>
                <details class="h-cmp-add"><summary class="button small secondary">＋ Ajouter une forme</summary>${picker('data-cmp-addpick', '')}</details></div>
                <div class="h-cmp-right"><div class="h-cmp-prev" data-cmp-prev></div><label>Nom de la nouvelle forme<input data-cmp-name maxlength="60" value=""></label><p class="muted">Elle ira dans « Mes formes », et dans l’accès rapide.</p></div></div>`,
            onOpen: d => {
                const prev = () => { const r = compute(); d.querySelector('[data-cmp-prev]').innerHTML = `<svg viewBox="-4 -4 108 108" width="220" height="220"><path d="${r.d}" ${r.eo ? 'fill-rule="evenodd"' : ''} fill="#2a7de1" stroke="#1d3557" stroke-width="1"/></svg>`; };
                const drawPieces = () => { d.querySelector('[data-cmp-pieces]').innerHTML = st.pieces.map(pieceRow).join(''); prev(); };
                const nameIn = d.querySelector('[data-cmp-name]'); nameIn.value = (byKey(st.base)?.n || 'Forme') + ' (à moi)';
                d.addEventListener('input', e => {
                    const q = e.target.closest('[data-cmp-q]'); if (q) { const box = q.closest('.h-cmp-pick'); box.querySelector('[data-cmp-res]').innerHTML = resHtml(q.value.trim(), box.matches('[data-cmp-base]') ? st.base : ''); return; }
                    const n = e.target.closest('[data-cmp-n]'); if (n) { st[n.dataset.cmpN] = Number(n.value); d.querySelector(`[data-cmp-o="${n.dataset.cmpN}"]`).textContent = n.value + (n.dataset.cmpN === 'rot' ? '°' : ' %'); prev(); return; }
                    const f = e.target.closest('[data-pcf]'); if (f) { const pc = st.pieces[Number(f.closest('[data-pc]').dataset.pc)]; pc[f.dataset.pcf] = f.type === 'checkbox' ? f.checked : f.tagName === 'SELECT' ? f.value : Number(f.value); prev(); }
                });
                d.addEventListener('change', e => { const f = e.target.closest('[data-pcf]'); if (f && (f.type === 'checkbox' || f.tagName === 'SELECT')) { const pc = st.pieces[Number(f.closest('[data-pc]').dataset.pc)]; pc[f.dataset.pcf] = f.type === 'checkbox' ? f.checked : f.value; prev(); } });
                d.addEventListener('click', e => {
                    const c = e.target.closest('[data-cmp-k]');
                    if (c && c.closest('[data-cmp-base]')) { st.base = c.dataset.cmpK; c.closest('[data-cmp-res]').querySelectorAll('.is-on').forEach(x => x.classList.remove('is-on')); c.classList.add('is-on'); if (!nameIn.dataset.touched) nameIn.value = (byKey(st.base)?.n || 'Forme') + ' (à moi)'; prev(); return; }
                    if (c && c.closest('[data-cmp-addpick]')) { st.pieces.push({k: c.dataset.cmpK, op: 'add', x: 75, y: 25, size: 40, rot: 0, flipH: false}); c.closest('details').open = false; drawPieces(); return; }
                    const fl = e.target.closest('[data-cmp-flip]'); if (fl) { st[fl.dataset.cmpFlip] = !st[fl.dataset.cmpFlip]; fl.classList.toggle('is-on', st[fl.dataset.cmpFlip]); prev(); return; }
                    const rt = e.target.closest('[data-cmp-rot]'); if (rt) { st.rot = ((st.rot + Number(rt.dataset.cmpRot) + 540) % 360) - 180; d.querySelector('[data-cmp-n="rot"]').value = st.rot; d.querySelector('[data-cmp-o="rot"]').textContent = st.rot + '°'; prev(); return; }
                    if (e.target.closest('[data-pc-del]')) { st.pieces.splice(Number(e.target.closest('[data-pc]').dataset.pc), 1); drawPieces(); }
                });
                nameIn.addEventListener('input', () => { nameIn.dataset.touched = '1'; });
                prev();
            },
            onSubmit: () => {
                const r = compute(); if (!r.d) { toast('Choisis une forme de départ.', 'error'); return false; }
                if (r.d.length > 29000) { toast('Forme trop détaillée : retire des formes ajoutées.', 'error'); return false; }
                const name = (document.querySelector('dialog[open] [data-cmp-name]')?.value || '').trim().slice(0, 60) || 'Ma forme';
                const p = JSON.parse(JSON.stringify(prefs())), k = 'my_' + Date.now().toString(36);
                p.customShapes.push({k, n: name, c: 'mine', d: r.d, eo: r.eo, mask: ''});
                if (!p.quickShapes.includes(k)) p.quickShapes.push(k);
                savePrefs(p);
                toast(`Forme « ${name} » créée : elle est dans « Mes formes ».`);
                onSave?.(k);
            }});
    }
    /* ═════════ La plume (comme dans Photoshop) : tracer une forme avec des points et des courbes de Bézier ═════════
     * clic : point d'angle · cliquer-glisser : point arrondi (poignées symétriques) · clic sur le premier point : forme fermée
     * glisser un point : le déplacer · glisser une poignée : la courbe (⌥ / Alt : poignées indépendantes)
     * ⌥ / Alt + clic sur un point : angle ↔ arrondi · double-clic sur un point : le supprimer · un nouveau tracé dans la forme : un trou */
    function penEditor(svg, onChange = () => {}) {
        let paths = [{nodes: [], closed: false}], drag = null, sel = null; // sel = [indice du tracé, indice du point]
        const cur = () => paths[paths.length - 1];
        const pt = e => { const r = svg.getBoundingClientRect(); return [Math.round((e.clientX - r.left) / r.width * 1000) / 10, Math.round((e.clientY - r.top) / r.height * 1000) / 10]; };
        const segD = (a, b) => (!a.h2 && !b.h1) ? ` L${b.x} ${b.y}` : ` C${+(a.x + (a.h2?.[0] || 0)).toFixed(1)} ${+(a.y + (a.h2?.[1] || 0)).toFixed(1)} ${+(b.x + (b.h1?.[0] || 0)).toFixed(1)} ${+(b.y + (b.h1?.[1] || 0)).toFixed(1)} ${b.x} ${b.y}`;
        const pathD = P => { const n = P.nodes; if (!n.length) return ''; let d = `M${n[0].x} ${n[0].y}`; for (let i = 1; i < n.length; i++) d += segD(n[i - 1], n[i]); if (P.closed && n.length > 2) d += segD(n[n.length - 1], n[0]) + ' Z'; return d; };
        const result = () => paths.filter(P => P.closed && P.nodes.length > 2).map(pathD).join(' ');
        function draw() {
            const live = paths.map(pathD).join(' ');
            const nodes = paths.flatMap((P, pi) => P.nodes.map((n, ni) => ({n, pi, ni, first: ni === 0 && !P.closed && pi === paths.length - 1 && P.nodes.length > 2})));
            const handles = nodes.filter(({pi, ni}) => sel && sel[0] === pi && Math.abs(sel[1] - ni) <= 1 || (pi === paths.length - 1 && !cur().closed && ni === cur().nodes.length - 1)).flatMap(({n, pi, ni}) => ['h1', 'h2'].filter(h => n[h]).map(h => ({n, pi, ni, h})));
            svg.innerHTML = `<defs><pattern id="pen-grid" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M10 0H0V10" fill="none" stroke="#dfe3e8" stroke-width=".3"/></pattern></defs><rect width="100" height="100" fill="url(#pen-grid)"/>
                <path d="${live}" fill="#2a7de1" fill-opacity=".25" fill-rule="evenodd" stroke="#1d3557" stroke-width=".6"/>
                ${handles.map(({n, h}) => `<line x1="${n.x}" y1="${n.y}" x2="${n.x + n[h][0]}" y2="${n.y + n[h][1]}" stroke="#888" stroke-width=".35"/>`).join('')}
                ${handles.map(({n, pi, ni, h}) => `<circle cx="${n.x + n[h][0]}" cy="${n.y + n[h][1]}" r="1.4" fill="#fff" stroke="#d0021b" stroke-width=".4" data-ph="${pi}:${ni}:${h}" style="cursor:move"/>`).join('')}
                ${nodes.map(({n, pi, ni, first}) => `<rect x="${n.x - 1.4}" y="${n.y - 1.4}" width="2.8" height="2.8" fill="${sel && sel[0] === pi && sel[1] === ni ? '#1d3557' : first ? '#ffd166' : '#fff'}" stroke="#1d3557" stroke-width=".4" data-pn="${pi}:${ni}" style="cursor:${first ? 'pointer' : 'move'}"><title>${first ? 'Fermer la forme' : 'Point'}</title></rect>`).join('')}`;
            onChange();
        }
        svg.addEventListener('pointerdown', e => {
            e.preventDefault(); svg.setPointerCapture(e.pointerId);
            const [x, y] = pt(e), hd = e.target.closest?.('[data-ph]'), nd = e.target.closest?.('[data-pn]');
            if (hd) { const [pi, ni, h] = hd.dataset.ph.split(':'); drag = {kind: 'handle', n: paths[+pi].nodes[+ni], h, free: e.altKey}; sel = [+pi, +ni]; return; }
            if (nd) {
                const [pi, ni] = nd.dataset.pn.split(':').map(Number), P = paths[pi], n = P.nodes[ni];
                if (pi === paths.length - 1 && !P.closed && ni === 0 && P.nodes.length > 2) { P.closed = true; sel = null; draw(); return; } // fermer
                if (e.altKey) { if (n.h1 || n.h2) { n.h1 = n.h2 = null; draw(); return; } drag = {kind: 'newhandle', n}; sel = [pi, ni]; return; } // angle ↔ arrondi
                drag = {kind: 'move', n, x0: x, y0: y, nx: n.x, ny: n.y}; sel = [pi, ni]; draw(); return;
            }
            if (cur().closed) paths.push({nodes: [], closed: false}); // la forme est fermée : un nouveau tracé (un trou s'il est dedans)
            const n = {x, y, h1: null, h2: null}; cur().nodes.push(n); sel = [paths.length - 1, cur().nodes.length - 1];
            drag = {kind: 'newhandle', n}; draw();
        });
        svg.addEventListener('pointermove', e => {
            if (!drag) return; const [x, y] = pt(e);
            if (drag.kind === 'move') { drag.n.x = +(drag.nx + x - drag.x0).toFixed(1); drag.n.y = +(drag.ny + y - drag.y0).toFixed(1); }
            if (drag.kind === 'newhandle') { const dx = +(x - drag.n.x).toFixed(1), dy = +(y - drag.n.y).toFixed(1); if (Math.hypot(dx, dy) < 1) return; drag.n.h2 = [dx, dy]; drag.n.h1 = [-dx, -dy]; }
            if (drag.kind === 'handle') { const dx = +(x - drag.n.x).toFixed(1), dy = +(y - drag.n.y).toFixed(1); drag.n[drag.h] = [dx, dy]; const o = drag.h === 'h1' ? 'h2' : 'h1'; if (!drag.free && !e.altKey && drag.n[o]) { const L = Math.hypot(...drag.n[o]); const k = L / (Math.hypot(dx, dy) || 1); drag.n[o] = [+(-dx * k).toFixed(1), +(-dy * k).toFixed(1)]; } }
            draw();
        });
        const end = () => { drag = null; };
        svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
        svg.addEventListener('dblclick', e => { const nd = e.target.closest?.('[data-pn]'); if (!nd) return; const [pi, ni] = nd.dataset.pn.split(':').map(Number); paths[pi].nodes.splice(ni, 1); if (paths[pi].nodes.length < 3) paths[pi].closed = false; if (!paths[pi].nodes.length && paths.length > 1) paths.splice(pi, 1); sel = null; draw(); });
        draw();
        return {
            path: result, count: () => paths.filter(P => P.closed && P.nodes.length > 2).length, open: () => !cur().closed && cur().nodes.length > 0,
            close: () => { if (cur().nodes.length > 2) { cur().closed = true; sel = null; draw(); } },
            newPath: () => { if (cur().nodes.length) { if (cur().nodes.length > 2) cur().closed = true; paths.push({nodes: [], closed: false}); sel = null; draw(); } },
            undo: () => { const P = cur(); if (P.closed) P.closed = false; else if (P.nodes.length) P.nodes.pop(); else if (paths.length > 1) { paths.pop(); } sel = null; draw(); },
            clear: () => { paths = [{nodes: [], closed: false}]; sel = null; draw(); },
            delSel: () => { if (!sel) return; const [pi, ni] = sel; paths[pi]?.nodes.splice(ni, 1); if ((paths[pi]?.nodes.length || 0) < 3 && paths[pi]) paths[pi].closed = false; sel = null; draw(); },
        };
    }
    /** Créer une pointe : à partir d'une forme, ou tracée à la plume ; tournée, pleine ou en contour, accrochée au bout ou au milieu */
    function headMaker(p, onSave) {
        let mode = 'shape', picked = null, pen = null;
        const cur = () => {
            const rot = Number(document.querySelector('[data-hm-rot]:checked')?.value || 0), fill = document.querySelector('[data-hm-fill]')?.value !== 'line', ref = Number(document.querySelector('[data-hm-ref]')?.value ?? 8);
            if (mode === 'pen') { const d = pen?.path() || ''; return d ? {d, box: 100, rot, fill, eo: (pen?.count() || 0) > 1, ref} : null; }
            if (!picked?.d) return null; return {d: picked.d, box: picked.s || 100, rot, fill, eo: !!picked.eo, ref};
        };
        const prev = () => { const h = cur(), box = document.querySelector('[data-hm-prev]'); if (!box) return; if (!h) { box.innerHTML = '<p class="muted">Choisis une forme ou trace la pointe.</p>'; return; } const pp = {...p, customHeads: [{...h, k: 'myh_prev', n: ''}]}; box.innerHTML = `<svg viewBox="0 0 120 40" width="240" height="80" style="overflow:visible"><line x1="6" y1="20" x2="${96 - (10 - h.ref) * 2.4}" y2="20" stroke="#1d3557" stroke-width="3"/><g transform="translate(84,8) scale(2.4)">${headSvg('myh_prev', '#1d3557', pp)}</g></svg>`; };
        const shapes = allShapes(p).filter(s => s.d && !s.mask);
        const grid = q => shapes.filter(s => !q || (s.n + ' ' + (s.tags || '')).toLowerCase().includes(q.toLowerCase())).slice(0, 240).map(s => `<button type="button" class="h-bd-shcell ${picked?.k === s.k ? 'is-on' : ''}" data-hm-shape="${esc(s.k)}" title="${esc(s.n)}">${shapeSvg(s, 30)}</button>`).join('');
        ext.openDialog({eyebrow: 'RÉGLAGES DES TABLEAUX', title: 'Créer une pointe', wide: true, submitLabel: 'Créer la pointe',
            body: `<div class="h-hm"><div class="h-bd-makertabs"><button type="button" class="is-on" data-hm-mode="shape">⬠ À partir d’une forme</button><button type="button" data-hm-mode="pen">✒️ Tracée à la plume</button></div>
                <div data-hm-pane="shape"><input type="search" placeholder="Chercher une forme (flèche, cœur, étoile…)" data-hm-q><div class="h-bd-shgrid h-hm-grid" data-hm-grid>${grid('')}</div></div>
                <div data-hm-pane="pen" hidden><p class="muted">Trace la pointe tournée vers la droite (→) : clic pour un angle, cliquer-glisser pour un arrondi, clic sur le premier point pour fermer.</p><svg class="h-bd-tracer" viewBox="0 0 100 100" data-hm-tracer></svg><div class="h-bd-row"><button type="button" class="h-bt" data-pen="close">◯ Fermer</button><button type="button" class="h-bt" data-pen="undo">↶ Annuler</button><button type="button" class="h-bt" data-pen="clear">Tout effacer</button></div></div>
                <div class="h-hm-opts"><span>Tourner</span>${[0, 90, 180, 270].map((r, i) => `<label class="checkbox-line"><input type="radio" name="hmrot" data-hm-rot value="${r}" ${i ? '' : 'checked'}> ${r}°</label>`).join('')}
                    <label>Dessin <select data-hm-fill><option value="fill">plein</option><option value="line">contour</option></select></label>
                    <label>Accrochée <select data-hm-ref><option value="9">par la pointe (au bout du trait)</option><option value="8" selected>presque au bout</option><option value="5">par le milieu</option><option value="1">par l’arrière</option></select></label>
                    <label>Nom <input data-hm-name value="Ma pointe" maxlength="60"></label></div>
                <div class="h-hm-prev" data-hm-prev></div></div>`,
            onOpen: d => {
                pen = penEditor(d.querySelector('[data-hm-tracer]'), prev);
                d.querySelectorAll('[data-pen]').forEach(bt => bt.addEventListener('click', () => pen?.[bt.dataset.pen]?.()));
                d.addEventListener('click', e => {
                    const m = e.target.closest('[data-hm-mode]'); if (m) { mode = m.dataset.hmMode; d.querySelectorAll('[data-hm-mode]').forEach(x => x.classList.toggle('is-on', x === m)); d.querySelectorAll('[data-hm-pane]').forEach(x => { x.hidden = x.dataset.hmPane !== mode; }); prev(); return; }
                    const s = e.target.closest('[data-hm-shape]'); if (s) { picked = shapes.find(x => x.k === s.dataset.hmShape); d.querySelectorAll('[data-hm-shape]').forEach(x => x.classList.toggle('is-on', x === s)); const nm = d.querySelector('[data-hm-name]'); if (nm.value === 'Ma pointe' || nm.dataset.auto) { nm.value = picked.n; nm.dataset.auto = '1'; } prev(); }
                });
                d.addEventListener('input', e => { if (e.target.matches('[data-hm-q]')) d.querySelector('[data-hm-grid]').innerHTML = grid(e.target.value.trim()); });
                d.addEventListener('change', prev); prev();
            },
            onSubmit: form => {
                const h = cur(); if (!h) { toast(mode === 'pen' ? 'Trace la pointe (au moins trois points, puis ferme-la).' : 'Choisis une forme.', 'error'); return false; }
                if (h.d.length > 29000) { toast('Cette forme est trop détaillée pour une pointe.', 'error'); return false; }
                onSave({k: 'myh_' + Date.now().toString(36), n: form.querySelector('[data-hm-name]').value.trim() || 'Ma pointe', ...h});
            }});
    }
    Object.assign(ext.boardKit, {parsePath, absPath, pathStr, shapeSegs, fitSegs, openComposer, penEditor, headMaker});

    /* ═════════ Maintenance → Réglages des tableaux ═════════ */
    let tab = 'colors';
    const orderList = (id, items, order, hidden, extra = () => '') => `<div class="h-bp-order" data-bp-order="${id}">${sortBy(items.map(i => i[0]), order).map(k => { const it = items.find(i => i[0] === k); return `<div class="h-bp-row" draggable="true" data-k="${esc(k)}"><label class="checkbox-line"><input type="checkbox" data-bp-show ${hidden.includes(k) ? '' : 'checked'}> <span>${it[2] || ''}${esc(it[1])}</span></label>${extra(k)}<span class="h-bp-mv"><button type="button" class="h-bt" data-bp-up title="Monter">↑</button><button type="button" class="h-bt" data-bp-down title="Descendre">↓</button></span></div>`; }).join('')}</div>`;
    const readOrder = (box) => { const rows = [...box.querySelectorAll(':scope > .h-bp-row')]; return {order: rows.map(r => r.dataset.k), hidden: rows.filter(r => !r.querySelector('[data-bp-show]').checked).map(r => r.dataset.k)}; };
    function bindOrder(root) {
        root.querySelectorAll('[data-bp-order]').forEach(box => {
            box.addEventListener('click', e => { const r = e.target.closest('.h-bp-row'); if (!r) return; if (e.target.closest('[data-bp-up]') && r.previousElementSibling) r.parentNode.insertBefore(r, r.previousElementSibling); if (e.target.closest('[data-bp-down]') && r.nextElementSibling) r.parentNode.insertBefore(r.nextElementSibling, r); });
            let dragged = null;
            box.addEventListener('dragstart', e => { dragged = e.target.closest?.('.h-bp-row'); dragged?.classList.add('is-drag'); e.dataTransfer?.setData('text/plain', ''); });
            box.addEventListener('dragend', () => { dragged?.classList.remove('is-drag'); dragged = null; });
            box.addEventListener('dragover', e => { if (!dragged) return; e.preventDefault(); const r = e.target.closest('.h-bp-row'); if (!r || r === dragged || r.parentNode !== box) return; const bb = r.getBoundingClientRect(); box.insertBefore(dragged, e.clientY < bb.top + bb.height / 2 ? r : r.nextSibling); });
        });
    }
    const swatchEditor = (cat, colors) => `<div class="h-bp-colors" data-bp-colors="${cat}">${colors.map((c, i) => `<span class="h-bp-color" draggable="true" data-c="${esc(c)}" data-i="${i}"><span class="h-bp-chip" style="background:${c === 'transparent' ? 'repeating-conic-gradient(#ccc 0 25%,#fff 0 50%) 0/10px 10px' : esc(c)}" title="${esc(c)}"></span><button type="button" class="h-bp-x" data-bp-delc title="Retirer">×</button><button type="button" class="h-bp-mvc" data-bp-left title="Avant">‹</button><button type="button" class="h-bp-mvc" data-bp-right title="Après">›</button></span>`).join('')}
        <span class="h-bp-addc"><input type="color" value="#2a7de1" data-bp-pick><button type="button" class="button small secondary" data-bp-addc>+ cette couleur</button><button type="button" class="button small secondary" data-bp-addt title="Sans couleur">+ transparent</button></span></div>`;

    ext.maintenance.board_prefs = async token => {
        try { const t0 = sessionStorage.getItem('lcnda-bp-tab'); if (t0) { tab = t0; sessionStorage.removeItem('lcnda-bp-tab'); } } catch (_) {} // ⚙️ d'un tableau : directement « Menus et options »
        const st = A().state;
        let p = JSON.parse(JSON.stringify(prefs()));
        const ws = A().$('#workspace');
        ext.maintenance.board_prefs.ac?.abort(); const ac = ext.maintenance.board_prefs.ac = new AbortController(), signal = ac.signal;
        const pal = () => p.palettes.find(x => x.id === p.palette) || p.palettes[0];
        // H7 : retirer une palette, une pointe, une forme, une liste de polices : tout de suite, « ↶ Annuler » remet le brouillon d'avant (rien n'est enregistré avant « Enregistrer »)
        const draftUndo = msg => { const before = JSON.stringify(p), tk = token; setTimeout(() => { const after = JSON.stringify(p); const here = () => { if (tk !== st.workspaceToken) throw new Error('les réglages des tableaux sont fermés'); }; A().undoToast?.(msg, {undo: () => { here(); p = JSON.parse(before); draw(); }, redo: () => { here(); p = JSON.parse(after); draw(); }}); }); };
        const TABS = [['colors', '🎨 Couleurs'], ['heads', '➤ Pointes'], ['shapes', '⬠ Formes'], ['fonts', '🔤 Polices'], ['sizes', '📏 Tailles et arrondi'], ['table', '▦ Tableur'], ['brushes', '🖌 Pinceaux'], ['menus', '☰ Menus et options']];
        const draw = () => {
            if (token !== st.workspaceToken) return;
            // (les noms des pointes : headName)
            const body = {
                colors: () => `<p class="muted">Les couleurs proposées dans les tableaux, catégorie par catégorie, dans l’ordre voulu (glisse une pastille, ou ‹ ›). Le sélecteur « autre couleur » reste toujours là. Tu peux avoir plusieurs palettes et choisir celle des tableaux.</p>
                    <div class="h-bp-palbar"><label>Palette utilisée <select data-bp-pal>${p.palettes.map(x => `<option value="${esc(x.id)}" ${x.id === p.palette ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
                    <input data-bp-palname value="${esc(pal().name)}" aria-label="Nom de la palette" maxlength="60"><button type="button" class="button small secondary" data-bp-palnew>+ Nouvelle palette</button><button type="button" class="button small secondary" data-bp-paldup>Dupliquer</button>
                    <select data-bp-preset><option value="">Partir d’un modèle…</option>${Object.keys(PALETTE_PRESETS).map(k => `<option>${esc(k)}</option>`).join('')}<option value="__app">Couleurs de l’app</option></select>${p.palettes.length > 1 ? '<button type="button" class="button small secondary danger" data-bp-paldel>Supprimer la palette</button>' : ''}</div>
                    ${COLOR_CATS.map(([k, l]) => `<section class="h-bp-sec"><h4>${esc(l)}</h4>${swatchEditor(k, pal().colors[k] || [])}</section>`).join('')}`,
                heads: () => `<p class="muted">Les pointes proposées pour les traits et les flèches, dans l’ordre voulu ; décoche celles que tu ne veux pas voir. « ＋ Créer une pointe » : à partir d’une forme (n’importe laquelle des formes, ou une des tiennes) ou tracée à la plume.</p>
                    <div class="h-bp-two"><label>Pointe au début, par défaut <select data-bp-hs>${allHeads(p).map(h => `<option value="${h}" ${p.headStart === h ? 'selected' : ''}>${esc(headName(h, p))}</option>`).join('')}</select></label><label>Pointe à la fin, par défaut (outil Flèche) <select data-bp-he>${allHeads(p).map(h => `<option value="${h}" ${p.headEnd === h ? 'selected' : ''}>${esc(headName(h, p))}</option>`).join('')}</select></label></div>
                    <p><button type="button" class="button small" data-bp-hnew>＋ Créer une pointe</button></p>
                    ${orderList('heads', allHeads(p).map(h => [h, headName(h, p), `<span class="h-bp-headprev">${headPreview(h, p)}</span> `]), p.heads, p.headsHidden, h => h.startsWith('myh_') ? `<button type="button" class="h-bt" data-bp-hdel="${esc(h)}" title="Supprimer cette pointe">🗑</button>` : '')}`,
                shapes: () => `<p class="muted">Les catégories de formes et leurs formes, dans l’ordre voulu ; décoche ce que tu ne veux pas voir. « Accès rapide » : les formes proposées directement dans la barre de l’outil Formes.</p>
                    ${ext.openVectorEditor ? '<p class="h-bp-vecbar"><button type="button" class="button small" data-bp-shvecnew>✒️ Dessiner une nouvelle forme (dessin vectoriel)</button> <small class="muted">ou ✒️ sur une forme ci-dessous pour la reprendre : plume, points et poignées, Pathfinder, import SVG…</small></p>' : ''}
                    ${ext.boardKit?.loadLibrary && !ext.boardKit.libraryLoaded ? '<p class="h-bp-vecbar"><button type="button" class="button small secondary" data-bp-shlib>📚 Montrer aussi les 2 900 formes de la grande bibliothèque</button> <small class="muted">lettres et chiffres, armoiries, cadres, étiquettes, drapeaux, symboles… (elles sont toujours dans la bibliothèque des tableaux ; ici, pour les cacher, les ranger ou les mettre dans l’accès rapide)</small></p>' : ''}
                    <section class="h-bp-sec"><h4>Accès rapide <small class="muted">${p.quickShapes.length}</small></h4><div class="h-bp-quick" data-bp-quick>${p.quickShapes.map(k => shapeByKey(k, p)).filter(Boolean).map(s => `<span class="h-bp-shape is-quick" draggable="true" data-k="${esc(s.k)}" title="${esc(s.n)}">${shapeSvg(s, 30)}<button type="button" class="h-bp-x" data-bp-unquick title="Retirer">×</button><span class="h-bp-qmv"><button type="button" data-bp-qleft title="Avant">‹</button><button type="button" data-bp-qright title="Après">›</button></span></span>`).join('')}</div><small class="muted">Glisse une forme (ou ‹ ›) pour changer l’ordre ; ⚡ sur une forme ci-dessous l’ajoute ici ; ✏️ crée une forme à partir d’elle.</small></section>
                    <section class="h-bp-sec"><h4>Catégories</h4>${orderList('cats', CATS.map(c => [c[0], c[1], c[2] + ' ']), p.shapeCats, p.shapesHidden.filter(k => k.startsWith('cat:')).map(k => k.slice(4)))}</section>
                    ${p.shapeCats.map(c => { const cat = CATS.find(x => x[0] === c); const l = shapesOf(c, p); return `<section class="h-bp-sec"><h4>${cat[2]} ${esc(cat[1])} <small class="muted">${l.length}</small></h4><div class="h-bp-shapes" data-bp-shapes="${c}">${l.map(s => `<span class="h-bp-shape ${p.shapesHidden.includes(s.k) ? 'is-off' : ''}" draggable="true" data-k="${esc(s.k)}" title="${esc(s.n)}">${shapeSvg(s, 30)}<small>${esc(s.n)}</small><span class="h-bp-shtools"><button type="button" data-bp-shtoggle title="Montrer / cacher">${p.shapesHidden.includes(s.k) ? '🙈' : '👁'}</button><button type="button" data-bp-shquick class="${p.quickShapes.includes(s.k) ? 'is-on' : ''}" title="${p.quickShapes.includes(s.k) ? 'Déjà dans l’accès rapide' : 'Ajouter à l’accès rapide'}">⚡</button>${s.d && !s.mask ? '<button type="button" data-bp-shfrom title="Créer une forme à partir de celle-ci">✏️</button><button type="button" data-bp-shvec title="La reprendre dans le dessin vectoriel (plume, points, Pathfinder…)">✒️</button>' : ''}${s.c === 'mine' ? '<button type="button" data-bp-shdel title="Supprimer cette forme">🗑</button>' : ''}</span></span>`).join('') || '<p class="muted">Aucune pour l’instant : dans un tableau, outil Formes → « ＋ Créer une forme ».</p>'}</div></section>`; }).join('')}`,
                fonts: () => `<p class="muted">Des listes de polices à toi, proposées dans le choix de la police d’un texte. « Toutes les polices » ouvre la liste commune (polices de l’app et de l’ordinateur, chacune écrite dans sa police).</p>
                    <div class="h-bp-fontbar"><button type="button" class="button small secondary" data-bp-local>Aa Toutes les polices…</button><button type="button" class="button small secondary" data-bp-flnew>+ Nouvelle liste</button></div><div class="h-bp-localfonts" data-bp-localbox hidden></div>
                    ${p.fontLists.map((l, i) => `<section class="h-bp-sec h-bp-fontlist" data-fl="${i}"><div class="h-bp-flhead"><input value="${esc(l.name)}" data-bp-flname maxlength="60"><button type="button" class="button small secondary danger" data-bp-fldel>Supprimer la liste</button></div>
                        <div class="h-bp-fonts">${l.fonts.map((f, j) => `<span class="h-bp-font" data-j="${j}" style="font-family:'${esc(f)}',${esc(f)}">${esc(f)}<button type="button" class="h-bp-x" data-bp-fdel title="Retirer">×</button></span>`).join('')}</div>
                        <div class="h-bp-fadd"><button type="button" class="button small secondary" data-bp-fpick>＋ Ajouter une police…</button></div></section>`).join('')}`,
                sizes: () => `<p class="muted">De quelle taille à quelle taille vont les curseurs (épaisseur des traits et des contours : de 0,5 à 500 px ; texte : jusqu’à 500 px). La case de saisie à côté du curseur accepte toujours toute la plage.</p>
                    <div class="h-bp-grid"><label>Épaisseur mini (px)<input type="number" min="0.5" max="500" step="0.5" value="${p.strokeMin}" data-bp-n="strokeMin"></label><label>Épaisseur maxi (px)<input type="number" min="0.5" max="500" step="0.5" value="${p.strokeMax}" data-bp-n="strokeMax"></label>
                    <label>Texte mini (px)<input type="number" min="2" max="500" value="${p.textMin}" data-bp-n="textMin"></label><label>Texte maxi (px)<input type="number" min="2" max="500" value="${p.textMax}" data-bp-n="textMax"></label>
                    <label>Arrondi par défaut des éléments arrondis (px)<input type="number" min="0" max="200" value="${p.radius}" data-bp-n="radius"></label></div>`,
                table: () => `<p class="muted">Comment est un tableur quand tu le poses dans un tableau.</p>
                    <div class="h-bp-grid"><label>Lignes<input type="number" min="1" max="100" value="${p.table.rows}" data-bp-t="rows"></label><label>Colonnes<input type="number" min="1" max="30" value="${p.table.cols}" data-bp-t="cols"></label><label>Taille du texte (px)<input type="number" min="6" max="80" value="${p.table.fs}" data-bp-t="fs"></label>
                    <label>Fond des titres<input type="color" value="${/^#[0-9a-f]{6}$/i.test(p.table.hfill) ? p.table.hfill : '#e8eef7'}" data-bp-t="hfill"></label><label class="span-2">Titres des colonnes, séparés par ; <input value="${esc(p.table.headers)}" data-bp-t="headers" placeholder="Nom;Année;Lieu"></label></div>
                    <label class="checkbox-line"><input type="checkbox" data-bp-tc="header" ${p.table.header ? 'checked' : ''}> <span>première ligne en titre</span></label><label class="checkbox-line"><input type="checkbox" data-bp-tc="hcol" ${p.table.hcol ? 'checked' : ''}> <span>première colonne en titre</span></label><label class="checkbox-line"><input type="checkbox" data-bp-tc="stripes" ${p.table.stripes ? 'checked' : ''}> <span>une ligne sur deux teintée</span></label>`,
                brushes: () => `<p class="muted">Tes pinceaux à toi : un pinceau de départ, une épaisseur, une opacité, une <strong>dureté</strong> (100 % = bord net ; plus bas = bord flou, comme dans Photoshop), une couleur si tu veux. Ils apparaissent en tête du menu des pinceaux.</p>
                    <div class="h-bp-brushes">${p.brushes.map((b0, i) => `<div class="h-bp-brush" data-bi="${i}"><input value="${esc(b0.icon)}" data-bp-b="icon" class="h-bp-icon" maxlength="4" aria-label="Icône"><input value="${esc(b0.name)}" data-bp-b="name" maxlength="40" aria-label="Nom">
                        <label>Départ <select data-bp-b="base">${['pen', 'mono', 'marker', 'pencil', 'pastel', 'fountain', 'calligraphy', 'brushstroke', 'watercolor', 'fill', 'highlight', 'chalk', 'neon', 'spray', 'dotted'].map(k => `<option value="${k}" ${b0.base === k ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
                        <label>Épaisseur <input type="number" min="0.5" max="500" step="0.5" value="${b0.sw}" data-bp-b="sw"> px</label><label>Opacité <input type="number" min="5" max="100" value="${Math.round(b0.opacity * 100)}" data-bp-b="opacity"> %</label><label>Dureté <input type="range" min="0" max="100" value="${b0.hardness}" data-bp-b="hardness"><output>${b0.hardness} %</output></label>
                        <label>Couleur <input type="checkbox" data-bp-bc ${b0.color ? 'checked' : ''} title="Imposer une couleur"><input type="color" value="${b0.color || '#111111'}" data-bp-b="color"></label><label>Trait <select data-bp-b="dash">${[['', 'plein'], ['dash', 'tirets'], ['long', 'longs tirets'], ['dot', 'points'], ['dashdot', 'tiret-point']].map(([k, l]) => `<option value="${k}" ${b0.dash === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
                        <button type="button" class="button small secondary danger" data-bp-bdel>Supprimer</button></div>`).join('') || '<p class="muted">Pas encore de pinceau à toi.</p>'}</div><button type="button" class="button small secondary" data-bp-bnew>+ Nouveau pinceau</button>`,
                menus: () => `<p class="muted">La place de chaque partie, puis l’ordre de tout ce qu’on voit dans un tableau ; décoche pour cacher. Glisse les lignes, ou ↑ ↓.</p>
                    <section class="h-bp-sec h-bp-layout"><h4>🧭 Disposition du tableau</h4><div class="h-bp-grid">
                        <label>Barre d’outils<select data-bp-layout="toolbar">${[['top', 'en haut'], ['left', 'à gauche (en colonne)'], ['right', 'à droite (en colonne)'], ['bottom', 'en bas']].map(([k, l]) => `<option value="${k}" ${p.layout.toolbar === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
                        <label>Réglages (texte, forme, trait…)<select data-bp-layout="inspector">${[['right', 'à droite'], ['left', 'à gauche'], ['hidden', 'cachés (plus de place)']].map(([k, l]) => `<option value="${k}" ${p.layout.inspector === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
                        <label>Taille des boutons<select data-bp-layout="size">${[['s', 'petits'], ['m', 'normaux'], ['l', 'grands']].map(([k, l]) => `<option value="${k}" ${p.layout.size === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
                        <label>En-tête (titre, propriétaire, état)<select data-bp-layout="title">${[['show', 'complet'], ['compact', 'compact (une ligne)']].map(([k, l]) => `<option value="${k}" ${p.layout.title === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div></section>
                    <div class="h-bp-cols"><section class="h-bp-sec"><h4>Outils (barre du haut)</h4>${orderList('tools', TOOLS, p.toolsOrder, p.toolsHidden)}</section>
                    <section class="h-bp-sec"><h4>Boutons de l’en-tête</h4><p class="muted"><small>↶ ↷ restent à côté du nom ; ⚙️ Personnaliser, ⤓ Exporter, ⛶ et × restent à droite, dans cet ordre (comme dans tous les éditeurs) : ici, tu peux seulement les montrer ou les cacher.</small></p>${orderList('header', HEADER, p.headerOrder, p.headerHidden)}</section>
                    <section class="h-bp-sec"><h4>Réglages à droite (texte, forme, trait…)</h4>${orderList('inspector', INSPECTOR, p.inspectorOrder, p.inspectorHidden)}</section>
                    <section class="h-bp-sec"><h4>Menu « ＋ Ajouter »</h4>${orderList('add', ADD, p.addOrder, p.addHidden)}</section>
                    <section class="h-bp-sec"><h4>Réglages d’une légende de trait</h4><p class="muted">Dans « Réglages de la légende » (choisis un trait). Les couleurs proposées : onglet 🎨 Couleurs.</p>${orderList('legend', LEGEND, p.legendOrder, p.legendHidden)}</section></div>`,
            }[tab]();
            ws.innerHTML = `<section class="page h-bp"><header class="page-header"><div><span class="eyebrow">MAINTENANCE</span><h2>Réglages des tableaux</h2><p>Ce que proposent les tableaux (Enquêtes → Tableaux) : couleurs, pointes, formes, polices, tailles, tableur, pinceaux, et l’ordre des menus.</p></div>
                <div class="page-actions"><span class="h-bp-sets"><strong>💾 Réglages enregistrés</strong><select data-bp-set aria-label="Réglages enregistrés"><option value="">— choisir —</option>${sets().map((x, n) => `<option value="${n}">${esc(x.name)}</option>`).join('')}</select><button type="button" class="button small secondary" data-bp-setapply title="Reprendre ces réglages">Appliquer</button><button type="button" class="button small secondary danger" data-bp-setdel title="Supprimer ces réglages enregistrés">🗑</button><button type="button" class="button small secondary" data-bp-setexport title="Enregistrer ces réglages dans un fichier, pour les garder ou les donner">⤓ Exporter</button><button type="button" class="button small secondary" data-bp-setsave title="Garder tous les réglages actuels sous un nom">💾 Enregistrer sous un nom…</button><button type="button" class="button small secondary" data-bp-setimport title="Reprendre des réglages exportés (fichier .json)">⤒ Importer un réglage</button></span><button type="button" class="button secondary" data-bp-reset>↺ Remettre comme au départ</button><button type="button" class="button" data-bp-save>Enregistrer</button></div></header>
                <nav class="h-bp-tabs">${TABS.map(([k, l]) => `<button type="button" class="${tab === k ? 'is-active' : ''}" data-bp-tab="${k}">${l}</button>`).join('')}</nav><div class="h-bp-body">${body}</div></section>`;
            bindOrder(ws);
        };
        // ce qui est à l'écran → p (avant de changer d'onglet ou d'enregistrer)
        const collect = () => {
            const q = s => ws.querySelector(s);
            if (tab === 'colors') { pal().name = q('[data-bp-palname]')?.value.trim() || pal().name; ws.querySelectorAll('[data-bp-colors]').forEach(box => { pal().colors[box.dataset.bpColors] = [...box.querySelectorAll('.h-bp-color')].map(x => x.dataset.c); }); }
            if (tab === 'heads') { const o = readOrder(q('[data-bp-order="heads"]')); p.heads = o.order; p.headsHidden = o.hidden; p.headStart = q('[data-bp-hs]').value; p.headEnd = q('[data-bp-he]').value; }
            if (tab === 'shapes') {
                const o = readOrder(q('[data-bp-order="cats"]')); p.shapeCats = o.order; p.shapesHidden = [...p.shapesHidden.filter(k => !k.startsWith('cat:')), ...o.hidden.map(k => 'cat:' + k)];
                ws.querySelectorAll('[data-bp-shapes]').forEach(box => { p.shapeOrder[box.dataset.bpShapes] = [...box.querySelectorAll('.h-bp-shape')].map(x => x.dataset.k); });
                p.quickShapes = [...ws.querySelectorAll('[data-bp-quick] .h-bp-shape')].map(x => x.dataset.k);
            }
            if (tab === 'fonts') ws.querySelectorAll('[data-fl]').forEach(sec => { const l = p.fontLists[Number(sec.dataset.fl)]; if (l) l.name = sec.querySelector('[data-bp-flname]').value.trim() || l.name; });
            if (tab === 'sizes') ws.querySelectorAll('[data-bp-n]').forEach(x => { p[x.dataset.bpN] = Number(x.value); });
            if (tab === 'table') { ws.querySelectorAll('[data-bp-t]').forEach(x => { p.table[x.dataset.bpT] = x.type === 'number' ? Number(x.value) : x.value; }); ws.querySelectorAll('[data-bp-tc]').forEach(x => { p.table[x.dataset.bpTc] = x.checked; }); }
            if (tab === 'brushes') ws.querySelectorAll('[data-bi]').forEach(row => { const b0 = p.brushes[Number(row.dataset.bi)]; if (!b0) return; row.querySelectorAll('[data-bp-b]').forEach(x => { const k = x.dataset.bpB; b0[k] = ['sw', 'hardness'].includes(k) ? Number(x.value) : k === 'opacity' ? Number(x.value) / 100 : x.value; }); if (!row.querySelector('[data-bp-bc]').checked) b0.color = ''; });
            if (tab === 'menus') ws.querySelectorAll('[data-bp-layout]').forEach(x => { p.layout[x.dataset.bpLayout] = x.value; });
            if (tab === 'menus') for (const [id, ok, hk] of [['tools', 'toolsOrder', 'toolsHidden'], ['header', 'headerOrder', 'headerHidden'], ['inspector', 'inspectorOrder', 'inspectorHidden'], ['add', 'addOrder', 'addHidden'], ['legend', 'legendOrder', 'legendHidden']]) { const o = readOrder(q(`[data-bp-order="${id}"]`)); p[ok] = o.order; p[hk] = o.hidden.filter(k => !(id === 'tools' && k === 'select')); }
            p = clean(p);
        };
        draw();
        ws.addEventListener('click', async e => {
            if (token !== st.workspaceToken) return;
            const t = e.target.closest('[data-bp-tab]'); if (t) { collect(); tab = t.dataset.bpTab; draw(); return; }
            if (e.target.closest('[data-bp-save]')) { collect(); savePrefs(p); toast('Réglages des tableaux enregistrés : ils servent dès le prochain tableau ouvert.'); return; }
            if (e.target.closest('[data-bp-setsave]')) {
                collect();
                const l0 = sets(), cur = l0[Number(ws.querySelector('[data-bp-set]').value)]?.name || '';
                ext.openDialog({eyebrow: 'RÉGLAGES DES TABLEAUX', title: 'Enregistrer sous un nom', submitLabel: 'Enregistrer',
                    body: `<div class="form-grid"><label class="span-2">Nom de ces réglages<input name="name" maxlength="60" required value="${esc(cur || 'Mes réglages')}" list="h-bp-setnames"><datalist id="h-bp-setnames">${l0.map(x => `<option value="${esc(x.name)}">`).join('')}</datalist></label>
                        <p class="muted span-2">Tout ce qui est réglé ici est gardé : couleurs et palettes, pointes, formes (et tes formes), polices, tailles et arrondi, tableur, pinceaux, ordre des menus. Un nom déjà pris remplace ses réglages.</p></div>`,
                    onSubmit: async form => {
                        const name = form.elements.name.value.trim().slice(0, 60); if (!name) return false;
                        const l = sets(), at = l.findIndex(x => x.name === name);
                        if (at >= 0 && !await A().confirmBox(`Remplacer les réglages « ${name} » déjà enregistrés ?`, {title: 'Réglages déjà enregistrés', okLabel: 'Remplacer'})) return false;
                        const item = {name, prefs: clean(p), saved_at: new Date().toISOString()};
                        if (at >= 0) l[at] = item; else l.push(item);
                        if (!saveSets(l)) return false;
                        savePrefs(p); draw(); ws.querySelector('[data-bp-set]').value = String(at >= 0 ? at : l.length - 1); toast(`Réglages enregistrés sous « ${name} » (et utilisés dès maintenant).`);
                    }});
                return;
            }
            // ⤓ Exporter / ⤒ Importer un réglage (fichier lcnda-reglage-tableaux-<nom>.json)
            if (e.target.closest('[data-bp-setexport]')) {
                const it = sets()[Number(ws.querySelector('[data-bp-set]').value)];
                if (ws.querySelector('[data-bp-set]').value === '' || !it) { toast('Choisis d’abord, dans la liste, les réglages à exporter.', 'error'); return; }
                A().exportSettingFile?.('tableaux', it.name, {prefs: clean(it.prefs)}); return;
            }
            if (e.target.closest('[data-bp-setimport]')) {
                const got = await A().importSettingFile?.('tableaux', {names: sets().map(x => x.name), check: d => d.prefs && typeof d.prefs === 'object' && !Array.isArray(d.prefs)});
                if (!got) return;
                const l = sets(); l.push({name: got.nom, prefs: clean(got.donnees.prefs), saved_at: new Date().toISOString()});
                if (!saveSets(l)) return;
                collect(); draw(); ws.querySelector('[data-bp-set]').value = String(l.length - 1);
                toast(`Réglages « ${got.nom} » importés : « Appliquer » pour t’en servir.`); return;
            }
            if (e.target.closest('[data-bp-setapply]')) {
                const n = ws.querySelector('[data-bp-set]').value, it = sets()[Number(n)];
                if (n === '' || !it) { toast('Choisis d’abord des réglages enregistrés.', 'error'); return; }
                if (!await A().confirmBox(`Reprendre les réglages « ${it.name} » ? Les réglages actuels sont remplacés (enregistre-les d’abord sous un nom si tu veux les garder).`, {title: 'Reprendre ces réglages', okLabel: 'Reprendre les réglages'})) return;
                p = clean(it.prefs); savePrefs(p); draw(); toast(`Réglages « ${it.name} » appliqués.`);
                return;
            }
            if (e.target.closest('[data-bp-setdel]')) {
                const n = ws.querySelector('[data-bp-set]').value, l = sets(), it = l[Number(n)];
                if (n === '' || !it) { toast('Choisis d’abord les réglages à supprimer.', 'error'); return; }
                // H7 : supprimés tout de suite, « ↶ Annuler » les remet (gardés sur cet ordinateur)
                const tk = token, again = () => { if (tk === st.workspaceToken) { collect(); draw(); } };
                collect(); A().undoLocalChange(`Réglages « ${it.name} » supprimés`, [SETS_KEY], () => { l.splice(Number(n), 1); saveSets(l); }, again); draw();
                return;
            }
            if (e.target.closest('[data-bp-reset]')) { if (!await A().confirmBox('Revenir aux réglages d’origine des tableaux ? Tes palettes, formes, listes de polices et pinceaux à toi seront retirés.', {title: 'Réglages d’origine', okLabel: 'Revenir aux réglages d’origine', danger: true})) return; p = DEFAULTS(); savePrefs(p); draw(); toast('Réglages d’origine remis.'); return; }
            // couleurs
            const box = e.target.closest('[data-bp-colors]');
            if (box) {
                const sw = e.target.closest('.h-bp-color');
                if (e.target.closest('[data-bp-delc]')) sw.remove();
                if (e.target.closest('[data-bp-left]') && sw.previousElementSibling?.classList.contains('h-bp-color')) box.insertBefore(sw, sw.previousElementSibling);
                if (e.target.closest('[data-bp-right]') && sw.nextElementSibling?.classList.contains('h-bp-color')) box.insertBefore(sw.nextElementSibling, sw);
                if (e.target.closest('[data-bp-addc], [data-bp-addt]')) { collect(); const c = e.target.closest('[data-bp-addt]') ? 'transparent' : box.querySelector('[data-bp-pick]').value; const l = pal().colors[box.dataset.bpColors]; if (!l.includes(c)) l.push(c); draw(); }
                return;
            }
            if (e.target.closest('[data-bp-palnew], [data-bp-paldup]')) { collect(); const dup = !!e.target.closest('[data-bp-paldup]'); const n = {id: 'p' + Date.now().toString(36), name: dup ? pal().name + ' (copie)' : 'Ma palette', colors: JSON.parse(JSON.stringify(dup ? pal().colors : PALETTE0))}; p.palettes.push(n); p.palette = n.id; draw(); return; }
            if (e.target.closest('[data-bp-paldel]')) { draftUndo(`Palette « ${pal().name} » retirée`); p.palettes = p.palettes.filter(x => x.id !== p.palette); p.palette = p.palettes[0].id; draw(); return; }
            // formes
            const sh = e.target.closest('.h-bp-shape');
            if (sh && e.target.closest('[data-bp-shtoggle]')) { collect(); const k = sh.dataset.k; p.shapesHidden = p.shapesHidden.includes(k) ? p.shapesHidden.filter(x => x !== k) : [...p.shapesHidden, k]; draw(); return; }
            if (e.target.closest('[data-bp-hnew]')) { collect(); headMaker(p, h => { p.customHeads.push(h); p.heads.push(h.k); draw(); toast(`Pointe « ${h.n} » créée : elle est dans la liste (n’oublie pas « Enregistrer »).`); }); return; }
            const hd = e.target.closest('[data-bp-hdel]'); if (hd) { collect(); draftUndo('Pointe retirée (les traits qui l’utilisent prennent un triangle)'); p.customHeads = p.customHeads.filter(h => h.k !== hd.dataset.bpHdel); p.heads = p.heads.filter(h => h !== hd.dataset.bpHdel); if (p.headStart === hd.dataset.bpHdel) p.headStart = 'none'; if (p.headEnd === hd.dataset.bpHdel) p.headEnd = 'triangle'; draw(); return; }
            if (sh && e.target.closest('[data-bp-shquick]')) { collect(); const nm = shapeByKey(sh.dataset.k, p)?.n || 'La forme'; if (p.quickShapes.includes(sh.dataset.k)) { toast(`⚡ « ${nm} » est déjà dans l’accès rapide (en haut de cet onglet ; ✕ sur elle pour l’en retirer).`); return; } p.quickShapes.push(sh.dataset.k); draw(); toast(`⚡ « ${nm} » ajoutée à l’accès rapide : elle est en haut de cet onglet, et dans la barre de l’outil Formes. N’oublie pas « Enregistrer ».`); return; }
            if (sh && e.target.closest('[data-bp-qleft], [data-bp-qright]')) { const sib = e.target.closest('[data-bp-qleft]') ? sh.previousElementSibling : sh.nextElementSibling; if (sib) sh.parentNode.insertBefore(...(e.target.closest('[data-bp-qleft]') ? [sh, sib] : [sib, sh])); return; }
            const vecDone = k => { const made = prefs().customShapes.find(x => x.k === k); if (made) { const i = p.customShapes.findIndex(x => x.k === k); if (i >= 0) p.customShapes[i] = made; else p.customShapes.push(made); if (!p.quickShapes.includes(k)) p.quickShapes.push(k); savePrefs(p); } draw(); };
            if (e.target.closest('[data-bp-shvecnew]')) { collect(); ext.openVectorEditor?.({onShape: vecDone}); return; }
            if (e.target.closest('[data-bp-shlib]')) { collect(); const bt = e.target.closest('[data-bp-shlib]'); bt.disabled = true; bt.textContent = 'Chargement des formes…'; ext.boardKit.loadLibrary().then(() => draw()).catch(() => { bt.disabled = false; bt.textContent = '📚 Réessayer de charger les formes'; toast('Les formes n’ont pas pu être chargées. Réessaie.', 'error'); }); return; }
            if (sh && e.target.closest('[data-bp-shvec]')) { collect(); const s0 = shapeByKey(sh.dataset.k, p); if (s0) ext.openVectorEditor?.({shape: {...s0, d: s0.s && s0.s !== 100 ? s0.d : s0.d}, onShape: vecDone}); return; }
            if (sh && e.target.closest('[data-bp-shfrom]')) { collect(); openComposer({base: sh.dataset.k, onSave: k => { const made = prefs().customShapes.find(x => x.k === k); if (made) { p.customShapes.push(made); if (!p.quickShapes.includes(k)) p.quickShapes.push(k); savePrefs(p); } draw(); }}); return; }
            if (sh && e.target.closest('[data-bp-unquick]')) { collect(); p.quickShapes = p.quickShapes.filter(k => k !== sh.dataset.k); draw(); return; }
            if (sh && e.target.closest('[data-bp-shdel]')) { collect(); draftUndo('Forme retirée (les tableaux qui l’utilisent la gardent)'); p.customShapes = p.customShapes.filter(s => s.k !== sh.dataset.k); p.quickShapes = p.quickShapes.filter(k => k !== sh.dataset.k); draw(); return; }
            // polices
            if (e.target.closest('[data-bp-flnew]')) { collect(); p.fontLists.push({name: 'Ma liste', fonts: []}); draw(); return; }
            const fl = e.target.closest('[data-fl]');
            if (fl && e.target.closest('[data-bp-fldel]')) { collect(); draftUndo('Liste de polices retirée'); p.fontLists.splice(Number(fl.dataset.fl), 1); draw(); return; }
            if (fl && e.target.closest('[data-bp-fdel]')) { collect(); p.fontLists[Number(fl.dataset.fl)].fonts.splice(Number(e.target.closest('[data-j]').dataset.j), 1); draw(); return; }
            if (fl && e.target.closest('[data-bp-fpick]')) {
                const f = await window.LCNDA_UI?.openFontPicker?.({title: 'Ajouter une police à la liste'}); if (!f) return;
                collect(); const l = p.fontLists[Number(fl.dataset.fl)]; if (!l.fonts.includes(f)) l.fonts.push(f); draw(); toast(`« ${f} » ajoutée à « ${l.name} ».`); return;
            }
            if (e.target.closest('[data-bp-local]')) { // la liste de polices commune : la police choisie va dans la première liste
                const f = await window.LCNDA_UI?.openFontPicker?.({title: 'Toutes les polices'}); if (!f) return;
                collect(); if (!p.fontLists.length) p.fontLists.push({name: 'Ma liste', fonts: []}); if (!p.fontLists[0].fonts.includes(f)) p.fontLists[0].fonts.push(f); draw(); toast(`« ${f} » ajoutée à « ${p.fontLists[0].name} ».`);
                return;
            }
            // pinceaux
            if (e.target.closest('[data-bp-bnew]')) { collect(); p.brushes.push({id: 'b_' + Date.now().toString(36), name: 'Mon pinceau', icon: '🖌', base: 'pen', sw: 6, opacity: 1, hardness: 60, color: '', dash: ''}); draw(); return; }
            const br = e.target.closest('[data-bi]'); if (br && e.target.closest('[data-bp-bdel]')) { collect(); p.brushes.splice(Number(br.dataset.bi), 1); draw(); }
        }, {signal});
        ws.addEventListener('input', e => { const o = e.target.closest('[data-bp-b="hardness"]'); if (o) o.nextElementSibling.textContent = o.value + ' %'; }, {signal});
        ws.addEventListener('change', e => {
            if (e.target.matches('[data-bp-pal]')) { collect(); p.palette = e.target.value; draw(); }
            if (e.target.matches('[data-bp-preset]') && e.target.value) { collect(); const v = e.target.value; pal().colors = JSON.parse(JSON.stringify(v === '__app' ? PALETTE0 : {...PALETTE0, ...PALETTE_PRESETS[v]})); if (v !== '__app' && pal().name.startsWith('Ma palette')) pal().name = v; draw(); }
        }, {signal});
        // glisser les pastilles et les formes
        let dragEl = null;
        ws.addEventListener('dragstart', e => { dragEl = e.target.closest?.('.h-bp-color, .h-bp-shape'); if (dragEl) e.dataTransfer?.setData('text/plain', ''); }, {signal});
        ws.addEventListener('dragover', e => { if (token !== st.workspaceToken || !dragEl) return; const over = e.target.closest?.(dragEl.classList.contains('h-bp-color') ? '.h-bp-color' : '.h-bp-shape'); if (!over || over === dragEl || over.parentNode !== dragEl.parentNode) return; e.preventDefault(); const bb = over.getBoundingClientRect(); over.parentNode.insertBefore(dragEl, e.clientX < bb.left + bb.width / 2 ? over : over.nextSibling); }, {signal});
        ws.addEventListener('dragend', () => { dragEl = null; }, {signal});
    };
})();
