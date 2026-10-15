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
        ['genea', 'Généalogie', '🌳'], ['people', 'Personnes', '👪'], ['places', 'Lieux et bâtiments', '⛪'], ['objects', 'Objets', '🔑'], ['nature', 'Nature', '🍃'], ['mine', 'Mes formes', '✏️']];
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
    const SHAPES = RAW.map(([k, n, c, d, eo, tags]) => ({k, n, c, d, eo: !!eo, tags: tags || ''}));
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
    };
    const COLOR_CATS = [['fill', 'Fond des formes, étiquettes, dossiers'], ['stroke', 'Bord des formes et contour des médias'], ['text', 'Couleur du texte, des traits et flèches'], ['pen', 'Dessin à main levée'], ['note', 'Notes'], ['bg', 'Fond du tableau']];
    const PALETTE_PRESETS = {
        'Archives': {fill: ['transparent', '#f4ecd8', '#e9dcc0', '#d8c3a5', '#b08968', '#7f5539', '#9c6644', '#e6ccb2', '#ffffff'], stroke: ['transparent', '#3b2f2f', '#7f5539', '#b08968', '#9c6644', '#d8c3a5'], text: ['#2b2118', '#5c4033', '#7f5539', '#9c6644', '#8b0000', '#1f3a5f'], pen: ['#2b2118', '#5c4033', '#8b0000', '#1f3a5f', '#556b2f'], note: ['#f4ecd8', '#e9dcc0', '#efe3c8', '#e6ccb2'], bg: ['#fbf6ea', '#f4ecd8', '#efe6d2']},
        'Pastel': {fill: ['transparent', '#ffd6e0', '#ffefcf', '#fdffb6', '#caffbf', '#9bf6ff', '#a0c4ff', '#bdb2ff', '#ffc6ff', '#ffffff'], stroke: ['transparent', '#6c757d', '#ffadad', '#ffd6a5', '#9bf6ff', '#a0c4ff', '#bdb2ff'], text: ['#343a40', '#6c757d', '#e5989b', '#6d6875', '#457b9d'], pen: ['#343a40', '#e5989b', '#457b9d', '#6d6875', '#b5838d'], note: ['#ffd6e0', '#ffefcf', '#fdffb6', '#caffbf', '#bdb2ff'], bg: ['#ffffff', '#fdf0f4', '#f1f7ff']},
        'Contraste fort': {fill: ['transparent', '#000000', '#ffffff', '#ff0000', '#ffff00', '#00a000', '#0000ff'], stroke: ['transparent', '#000000', '#ffffff', '#ff0000', '#0000ff'], text: ['#000000', '#ffffff', '#ff0000', '#0000ff'], pen: ['#000000', '#ff0000', '#0000ff', '#00a000'], note: ['#ffff00', '#ffffff', '#00ffff'], bg: ['#ffffff', '#000000']},
    };
    const TOOLS = [['select', 'Choisir'], ['hand', 'Se déplacer'], ['text', 'Texte'], ['note', 'Note'], ['shape', 'Formes'], ['line', 'Trait'], ['arrow', 'Flèche'], ['pen', 'Dessin'], ['eraser', 'Gomme'], ['table', 'Tableur']];
    const HEADER = [['undo', '↶ Annuler'], ['redo', '↷ Rétablir'], ['bg', 'Fond'], ['snaps', '📸 Instantanés'], ['copy', '⧉ Copie'], ['export', '⬇ Exporter / imprimer'], ['full', '⛶ Plein écran'], ['lockall', '🔒 Verrouiller'], ['delete', '🗑 Supprimer'], ['close', '✕ Fermer']];
    const INSPECTOR = [['fill', 'Fond'], ['stroke', 'Bord / contour'], ['color', 'Couleur du texte ou du trait'], ['sw', 'Épaisseur et style du trait'], ['shape', 'Forme'], ['radius', 'Arrondi'], ['text', 'Taille et style du texte'], ['list', 'Puces et numéros'], ['font', 'Police'], ['heads', 'Pointes des flèches'], ['linepath', 'Forme du trait et légende'], ['table', 'Tableur'], ['brush', 'Pinceau'], ['title', 'Titre, étiquette, adresse'], ['preview', 'Aperçu vivant'], ['opacity', 'Opacité'], ['actions', 'Boutons (dupliquer, verrouiller…)']];
    const ADD = [['files', 'Des fichiers'], ['media', 'Un média de l’app'], ['web', 'D’ailleurs (web)'], ['person', 'Une fiche'], ['screen', 'Un écran de l’app'], ['widget', 'Un de mes widgets'], ['recueil', 'Un recueil'], ['tag', 'Une étiquette'], ['table', 'Un tableur'], ['folder', 'Un dossier'], ['import', 'Importer un tableau']];
    const HEADS = ['none', 'triangle', 'stealth', 'open', 'double', 'half', 'circle', 'ring', 'dot', 'square', 'square_o', 'diamond', 'diamond_o', 'bar', 'fork', 'tail'];
    const DEFAULTS = () => ({
        palettes: [{id: 'p0', name: 'Couleurs de l’app', colors: JSON.parse(JSON.stringify(PALETTE0))}], palette: 'p0',
        heads: HEADS.slice(), headsHidden: [], headStart: 'none', headEnd: 'triangle',
        shapeCats: CATS.map(c => c[0]), shapeOrder: {}, shapesHidden: [], quickShapes: ['rect', 'round', 'ellipse', 'triangle', 'diamond', 'star', 'hexagon', 'bubble', 'cloud', 'arrow_r', 'heart', 'tree'],
        customShapes: [],
        fontLists: [{name: 'Pour tous les jours', fonts: ['system-ui', 'Georgia', 'Helvetica Neue', 'Times New Roman', 'Courier New']}, {name: 'Écritures anciennes', fonts: ['Garamond', 'Baskerville', 'Didot', 'Palatino', 'Apple Chancery', 'Snell Roundhand']}],
        strokeMin: 0.5, strokeMax: 60, textMin: 6, textMax: 200, radius: 14,
        table: {rows: 4, cols: 3, header: true, hcol: false, stripes: true, hfill: '#e8eef7', fs: 14, headers: 'Nom;Année;Lieu'},
        brushes: [],
        toolsOrder: TOOLS.map(t => t[0]), toolsHidden: [], headerOrder: HEADER.map(t => t[0]), headerHidden: [],
        inspectorOrder: INSPECTOR.map(t => t[0]), inspectorHidden: [], addOrder: ADD.map(t => t[0]), addHidden: [],
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
        for (const k of ['heads', 'headsHidden', 'shapeCats', 'shapesHidden', 'quickShapes', 'toolsOrder', 'toolsHidden', 'headerOrder', 'headerHidden', 'inspectorOrder', 'inspectorHidden', 'addOrder', 'addHidden']) p[k] = (Array.isArray(p[k]) ? p[k] : d[k]).map(String).slice(0, 400);
        p.heads = sortBy(HEADS, p.heads);
        p.shapeCats = sortBy(CATS.map(c => c[0]), p.shapeCats);
        p.toolsOrder = sortBy(TOOLS.map(t => t[0]), p.toolsOrder); p.headerOrder = sortBy(HEADER.map(t => t[0]), p.headerOrder);
        p.inspectorOrder = sortBy(INSPECTOR.map(t => t[0]), p.inspectorOrder); p.addOrder = sortBy(ADD.map(t => t[0]), p.addOrder);
        if (!HEADS.includes(p.headStart)) p.headStart = 'none'; if (!HEADS.includes(p.headEnd)) p.headEnd = 'triangle';
        p.shapeOrder = Object.fromEntries(Object.entries(p.shapeOrder && typeof p.shapeOrder === 'object' && !Array.isArray(p.shapeOrder) ? p.shapeOrder : {}).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, v.map(String).slice(0, 500)]));
        p.customShapes = (Array.isArray(p.customShapes) ? p.customShapes : []).filter(s => s && typeof s === 'object' && (s.d || s.mask)).slice(0, 200).map(s => ({k: 'my_' + String(s.k || '').replace(/^my_/, '').replace(/[^\w-]/g, '').slice(0, 30), n: String(s.n || 'Ma forme').slice(0, 60), c: 'mine',
            d: /^[MLHVCSQTAZmlhvcsqtaz0-9.,\s-]{0,30000}$/.test(String(s.d || '')) ? String(s.d || '') : '', eo: !!s.eo, mask: /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(String(s.mask || '')) ? String(s.mask).slice(0, 400000) : '', tags: ''}));
        p.fontLists = (Array.isArray(p.fontLists) ? p.fontLists : d.fontLists).filter(l => l && typeof l === 'object').slice(0, 30).map(l => ({name: String(l?.name || 'Ma liste').slice(0, 60), fonts: (Array.isArray(l?.fonts) ? l.fonts : []).map(f => String(f).replace(/[^\w\s,'\-À-ÿ.]/g, '').trim()).filter(Boolean).slice(0, 200)}));
        const t = p.table && typeof p.table === 'object' ? p.table : {};
        p.table = {rows: num(t.rows, 1, 100, 4), cols: num(t.cols, 1, 30, 3), header: t.header !== false, hcol: !!t.hcol, stripes: t.stripes !== false, hfill: isColor(t.hfill) ? t.hfill : '#e8eef7', fs: num(t.fs, 6, 80, 14), headers: String(t.headers ?? d.table.headers).slice(0, 600)};
        p.brushes = (Array.isArray(p.brushes) ? p.brushes : []).filter(b0 => b0 && typeof b0 === 'object').slice(0, 60).map(b0 => ({id: 'b_' + String(b0.id || '').replace(/^b_/, '').replace(/[^\w-]/g, '').slice(0, 30), name: String(b0.name || 'Mon pinceau').slice(0, 40), icon: String(b0.icon || '🖌').slice(0, 4),
            base: ['pen', 'mono', 'marker', 'pencil', 'pastel', 'fountain', 'calligraphy', 'brushstroke', 'watercolor', 'fill', 'highlight', 'chalk', 'neon', 'spray', 'dotted'].includes(b0.base) ? b0.base : 'pen',
            sw: num(b0.sw, 0.5, 500, 4), opacity: num(b0.opacity, 0.05, 1, 1), hardness: num(b0.hardness, 0, 100, 100), color: isColor(b0.color) ? b0.color : '', dash: ['', 'dash', 'long', 'dot', 'dashdot'].includes(b0.dash) ? b0.dash : ''}));
        return p;
    };
    let cache = null;
    const prefs = () => { if (cache) return cache; let raw = null; try { raw = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (_) {} try { cache = clean(raw); } catch (_) { cache = clean(null); } return cache; };
    // réglages changés ailleurs (autre fenêtre, réglages du site) : on relit
    window.addEventListener('storage', e => { if (e.key === KEY) cache = null; });
    const savePrefs = p => { cache = clean(p); try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch (e) { toast('Réglages trop lourds pour être gardés (retire des formes faites d’une image).', 'error'); } return cache; };
    const palette = (cat, p = prefs()) => (p.palettes.find(x => x.id === p.palette) || p.palettes[0]).colors[cat] || PALETTE0[cat];
    const allShapes = (p = prefs()) => [...SHAPES, ...p.customShapes];
    const shapesOf = (cat, p = prefs()) => { const l = allShapes(p).filter(s => s.c === cat); return sortBy(l.map(s => s.k), p.shapeOrder[cat] || []).map(k => l.find(s => s.k === k)); };
    const shapeByKey = (k, p = prefs()) => SHAPE_MAP[k] || p.customShapes.find(s => s.k === k);
    const shapeSvg = (s, size = 28) => s?.mask ? `<span class="h-bk-shmask" style="width:${size}px;height:${size}px;-webkit-mask-image:url(${s.mask});mask-image:url(${s.mask})"></span>` : `<svg viewBox="-4 -4 108 108" width="${size}" height="${size}"><path d="${s?.d || ''}" ${s?.eo ? 'fill-rule="evenodd"' : ''} fill="currentColor" stroke="currentColor" stroke-width="2" stroke-opacity=".5"/></svg>`;
    ext.boardKit = {CATS, SHAPES, SHAPE_MAP, COLOR_CATS, PALETTE0, TOOLS, HEADER, INSPECTOR, ADD, HEADS, prefs, savePrefs, palette, allShapes, shapesOf, shapeByKey, shapeSvg, sortBy, clean, circ};

    /* ═════════ Maintenance → Réglages des tableaux ═════════ */
    let tab = 'colors';
    const orderList = (id, items, order, hidden, extra = () => '') => `<div class="h-bp-order" data-bp-order="${id}">${sortBy(items.map(i => i[0]), order).map(k => { const it = items.find(i => i[0] === k); return `<div class="h-bp-row" draggable="true" data-k="${esc(k)}"><label class="checkbox-line"><input type="checkbox" data-bp-show ${hidden.includes(k) ? '' : 'checked'}> <span>${it[2] || ''}${esc(it[1])}</span></label>${extra(k)}<span class="h-bp-mv"><button type="button" class="h-bt" data-bp-up title="Monter">↑</button><button type="button" class="h-bt" data-bp-down title="Descendre">↓</button></span></div>`; }).join('')}</div>`;
    const readOrder = (box) => { const rows = [...box.querySelectorAll(':scope > .h-bp-row')]; return {order: rows.map(r => r.dataset.k), hidden: rows.filter(r => !r.querySelector('[data-bp-show]').checked).map(r => r.dataset.k)}; };
    function bindOrder(root) {
        root.querySelectorAll('[data-bp-order]').forEach(box => {
            box.addEventListener('click', e => { const r = e.target.closest('.h-bp-row'); if (!r) return; if (e.target.closest('[data-bp-up]') && r.previousElementSibling) r.parentNode.insertBefore(r, r.previousElementSibling); if (e.target.closest('[data-bp-down]') && r.nextElementSibling) r.parentNode.insertBefore(r.nextElementSibling, r); });
            let dragged = null;
            box.addEventListener('dragstart', e => { dragged = e.target.closest('.h-bp-row'); dragged?.classList.add('is-drag'); e.dataTransfer?.setData('text/plain', ''); });
            box.addEventListener('dragend', () => { dragged?.classList.remove('is-drag'); dragged = null; });
            box.addEventListener('dragover', e => { if (!dragged) return; e.preventDefault(); const r = e.target.closest('.h-bp-row'); if (!r || r === dragged || r.parentNode !== box) return; const bb = r.getBoundingClientRect(); box.insertBefore(dragged, e.clientY < bb.top + bb.height / 2 ? r : r.nextSibling); });
        });
    }
    const swatchEditor = (cat, colors) => `<div class="h-bp-colors" data-bp-colors="${cat}">${colors.map((c, i) => `<span class="h-bp-color" draggable="true" data-c="${esc(c)}" data-i="${i}"><span class="h-bp-chip" style="background:${c === 'transparent' ? 'repeating-conic-gradient(#ccc 0 25%,#fff 0 50%) 0/10px 10px' : esc(c)}" title="${esc(c)}"></span><button type="button" class="h-bp-x" data-bp-delc title="Retirer">×</button><button type="button" class="h-bp-mvc" data-bp-left title="Avant">‹</button><button type="button" class="h-bp-mvc" data-bp-right title="Après">›</button></span>`).join('')}
        <span class="h-bp-addc"><input type="color" value="#2a7de1" data-bp-pick><button type="button" class="button small secondary" data-bp-addc>+ cette couleur</button><button type="button" class="button small secondary" data-bp-addt title="Sans couleur">+ transparent</button></span></div>`;

    ext.maintenance.board_prefs = async token => {
        const st = A().state;
        let p = JSON.parse(JSON.stringify(prefs()));
        const ws = A().$('#workspace');
        ext.maintenance.board_prefs.ac?.abort(); const ac = ext.maintenance.board_prefs.ac = new AbortController(), signal = ac.signal;
        const pal = () => p.palettes.find(x => x.id === p.palette) || p.palettes[0];
        const TABS = [['colors', '🎨 Couleurs'], ['heads', '➤ Pointes'], ['shapes', '⬠ Formes'], ['fonts', '🔤 Polices'], ['sizes', '📏 Tailles et arrondi'], ['table', '▦ Tableur'], ['brushes', '🖌 Pinceaux'], ['menus', '☰ Menus et options']];
        const draw = () => {
            if (token !== st.workspaceToken) return;
            const HEAD_NAMES = {none: 'aucune', triangle: '▶ triangle', stealth: '➤ flèche fine', open: '› ouverte', double: '⏩ double', half: '◣ demi-flèche', circle: '● rond', ring: '○ rond vide', dot: '• point', square: '■ carré', square_o: '□ carré vide', diamond: '◆ losange', diamond_o: '◇ losange vide', bar: '| barre', fork: '⋔ patte d’oie', tail: '» plumes'};
            const body = {
                colors: () => `<p class="muted">Les couleurs proposées dans les tableaux, catégorie par catégorie, dans l’ordre voulu (glisse une pastille, ou ‹ ›). Le sélecteur « autre couleur » reste toujours là. Tu peux avoir plusieurs palettes et choisir celle des tableaux.</p>
                    <div class="h-bp-palbar"><label>Palette utilisée <select data-bp-pal>${p.palettes.map(x => `<option value="${esc(x.id)}" ${x.id === p.palette ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
                    <input data-bp-palname value="${esc(pal().name)}" aria-label="Nom de la palette" maxlength="60"><button type="button" class="button small secondary" data-bp-palnew>+ Nouvelle palette</button><button type="button" class="button small secondary" data-bp-paldup>Dupliquer</button>
                    <select data-bp-preset><option value="">Partir d’un modèle…</option>${Object.keys(PALETTE_PRESETS).map(k => `<option>${esc(k)}</option>`).join('')}<option value="__app">Couleurs de l’app</option></select>${p.palettes.length > 1 ? '<button type="button" class="button small secondary danger" data-bp-paldel>Supprimer la palette</button>' : ''}</div>
                    ${COLOR_CATS.map(([k, l]) => `<section class="h-bp-sec"><h4>${esc(l)}</h4>${swatchEditor(k, pal().colors[k] || [])}</section>`).join('')}`,
                heads: () => `<p class="muted">Les pointes proposées pour les traits et les flèches, dans l’ordre voulu ; décoche celles que tu ne veux pas voir.</p>
                    <div class="h-bp-two"><label>Pointe au début, par défaut <select data-bp-hs>${HEADS.map(h => `<option value="${h}" ${p.headStart === h ? 'selected' : ''}>${HEAD_NAMES[h]}</option>`).join('')}</select></label><label>Pointe à la fin, par défaut (outil Flèche) <select data-bp-he>${HEADS.map(h => `<option value="${h}" ${p.headEnd === h ? 'selected' : ''}>${HEAD_NAMES[h]}</option>`).join('')}</select></label></div>
                    ${orderList('heads', HEADS.map(h => [h, HEAD_NAMES[h]]), p.heads, p.headsHidden)}`,
                shapes: () => `<p class="muted">Les catégories de formes et leurs formes, dans l’ordre voulu ; décoche ce que tu ne veux pas voir. « Accès rapide » : les formes proposées directement dans la barre de l’outil Formes.</p>
                    <section class="h-bp-sec"><h4>Accès rapide</h4><div class="h-bp-quick" data-bp-quick>${p.quickShapes.map(k => shapeByKey(k, p)).filter(Boolean).map(s => `<span class="h-bp-shape is-quick" data-k="${esc(s.k)}" title="${esc(s.n)}">${shapeSvg(s, 30)}<button type="button" class="h-bp-x" data-bp-unquick title="Retirer">×</button></span>`).join('')}</div><small class="muted">Clique ⚡ sur une forme ci-dessous pour l’ajouter ici.</small></section>
                    <section class="h-bp-sec"><h4>Catégories</h4>${orderList('cats', CATS.map(c => [c[0], c[1], c[2] + ' ']), p.shapeCats, p.shapesHidden.filter(k => k.startsWith('cat:')).map(k => k.slice(4)))}</section>
                    ${p.shapeCats.map(c => { const cat = CATS.find(x => x[0] === c); const l = shapesOf(c, p); return `<section class="h-bp-sec"><h4>${cat[2]} ${esc(cat[1])} <small class="muted">${l.length}</small></h4><div class="h-bp-shapes" data-bp-shapes="${c}">${l.map(s => `<span class="h-bp-shape ${p.shapesHidden.includes(s.k) ? 'is-off' : ''}" draggable="true" data-k="${esc(s.k)}" title="${esc(s.n)}">${shapeSvg(s, 30)}<small>${esc(s.n)}</small><span class="h-bp-shtools"><button type="button" data-bp-shtoggle title="Montrer / cacher">${p.shapesHidden.includes(s.k) ? '🙈' : '👁'}</button><button type="button" data-bp-shquick title="Accès rapide">⚡</button>${s.c === 'mine' ? '<button type="button" data-bp-shdel title="Supprimer cette forme">🗑</button>' : ''}</span></span>`).join('') || '<p class="muted">Aucune pour l’instant : dans un tableau, outil Formes → « ＋ Créer une forme ».</p>'}</div></section>`; }).join('')}`,
                fonts: () => `<p class="muted">Des listes de polices à toi, proposées dans le choix de la police d’un texte. « Polices de l’ordinateur » lit celles installées (Chrome, Edge, l’app sur Mac ; le navigateur te le demande la première fois).</p>
                    <div class="h-bp-fontbar"><button type="button" class="button small secondary" data-bp-local>🖥 Voir les polices de l’ordinateur</button><button type="button" class="button small secondary" data-bp-flnew>+ Nouvelle liste</button></div><div class="h-bp-localfonts" data-bp-localbox hidden></div>
                    ${p.fontLists.map((l, i) => `<section class="h-bp-sec h-bp-fontlist" data-fl="${i}"><div class="h-bp-flhead"><input value="${esc(l.name)}" data-bp-flname maxlength="60"><button type="button" class="button small secondary danger" data-bp-fldel>Supprimer la liste</button></div>
                        <div class="h-bp-fonts">${l.fonts.map((f, j) => `<span class="h-bp-font" data-j="${j}" style="font-family:'${esc(f)}',${esc(f)}">${esc(f)}<button type="button" class="h-bp-x" data-bp-fdel title="Retirer">×</button></span>`).join('')}</div>
                        <div class="h-bp-fadd"><input placeholder="Nom d’une police (ex. Garamond)" data-bp-fname list="h-bp-fdl"><button type="button" class="button small secondary" data-bp-fadd>+ Ajouter</button></div></section>`).join('')}<datalist id="h-bp-fdl"></datalist>`,
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
                menus: () => `<p class="muted">L’ordre de tout ce qu’on voit dans un tableau ; décoche pour cacher. Glisse les lignes, ou ↑ ↓.</p>
                    <div class="h-bp-cols"><section class="h-bp-sec"><h4>Outils (barre du haut)</h4>${orderList('tools', TOOLS, p.toolsOrder, p.toolsHidden)}</section>
                    <section class="h-bp-sec"><h4>Boutons de l’en-tête</h4>${orderList('header', HEADER, p.headerOrder, p.headerHidden)}</section>
                    <section class="h-bp-sec"><h4>Réglages à droite (texte, forme, trait…)</h4>${orderList('inspector', INSPECTOR, p.inspectorOrder, p.inspectorHidden)}</section>
                    <section class="h-bp-sec"><h4>Menu « ＋ Ajouter »</h4>${orderList('add', ADD, p.addOrder, p.addHidden)}</section></div>`,
            }[tab]();
            ws.innerHTML = `<section class="page h-bp"><header class="page-header"><div><span class="eyebrow">MAINTENANCE</span><h2>Réglages des tableaux</h2><p>Ce que proposent les tableaux (Enquêtes → Tableaux) : couleurs, pointes, formes, polices, tailles, tableur, pinceaux, et l’ordre des menus.</p></div>
                <div class="page-actions"><button type="button" class="button secondary" data-bp-reset>Revenir aux réglages d’origine</button><button type="button" class="button" data-bp-save>Enregistrer</button></div></header>
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
            if (tab === 'menus') for (const [id, ok, hk] of [['tools', 'toolsOrder', 'toolsHidden'], ['header', 'headerOrder', 'headerHidden'], ['inspector', 'inspectorOrder', 'inspectorHidden'], ['add', 'addOrder', 'addHidden']]) { const o = readOrder(q(`[data-bp-order="${id}"]`)); p[ok] = o.order; p[hk] = o.hidden.filter(k => !(id === 'tools' && k === 'select')); }
            p = clean(p);
        };
        draw();
        ws.addEventListener('click', async e => {
            if (token !== st.workspaceToken) return;
            const t = e.target.closest('[data-bp-tab]'); if (t) { collect(); tab = t.dataset.bpTab; draw(); return; }
            if (e.target.closest('[data-bp-save]')) { collect(); savePrefs(p); toast('Réglages des tableaux enregistrés : ils servent dès le prochain tableau ouvert.'); return; }
            if (e.target.closest('[data-bp-reset]')) { if (!confirm('Revenir aux réglages d’origine des tableaux ? Tes palettes, formes, listes de polices et pinceaux à toi seront retirés.')) return; p = DEFAULTS(); savePrefs(p); draw(); toast('Réglages d’origine remis.'); return; }
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
            if (e.target.closest('[data-bp-paldel]')) { if (!confirm(`Supprimer la palette « ${pal().name} » ?`)) return; p.palettes = p.palettes.filter(x => x.id !== p.palette); p.palette = p.palettes[0].id; draw(); return; }
            // formes
            const sh = e.target.closest('.h-bp-shape');
            if (sh && e.target.closest('[data-bp-shtoggle]')) { collect(); const k = sh.dataset.k; p.shapesHidden = p.shapesHidden.includes(k) ? p.shapesHidden.filter(x => x !== k) : [...p.shapesHidden, k]; draw(); return; }
            if (sh && e.target.closest('[data-bp-shquick]')) { collect(); if (!p.quickShapes.includes(sh.dataset.k)) p.quickShapes.push(sh.dataset.k); draw(); return; }
            if (sh && e.target.closest('[data-bp-unquick]')) { collect(); p.quickShapes = p.quickShapes.filter(k => k !== sh.dataset.k); draw(); return; }
            if (sh && e.target.closest('[data-bp-shdel]')) { if (!confirm('Supprimer cette forme ? (les tableaux qui l’utilisent la gardent)')) return; collect(); p.customShapes = p.customShapes.filter(s => s.k !== sh.dataset.k); p.quickShapes = p.quickShapes.filter(k => k !== sh.dataset.k); draw(); return; }
            // polices
            if (e.target.closest('[data-bp-flnew]')) { collect(); p.fontLists.push({name: 'Ma liste', fonts: []}); draw(); return; }
            const fl = e.target.closest('[data-fl]');
            if (fl && e.target.closest('[data-bp-fldel]')) { if (!confirm('Supprimer cette liste de polices ?')) return; collect(); p.fontLists.splice(Number(fl.dataset.fl), 1); draw(); return; }
            if (fl && e.target.closest('[data-bp-fdel]')) { collect(); p.fontLists[Number(fl.dataset.fl)].fonts.splice(Number(e.target.closest('[data-j]').dataset.j), 1); draw(); return; }
            if (fl && e.target.closest('[data-bp-fadd]')) { const v = fl.querySelector('[data-bp-fname]').value.trim(); if (!v) return; collect(); const l = p.fontLists[Number(fl.dataset.fl)]; if (!l.fonts.includes(v)) l.fonts.push(v); draw(); return; }
            if (e.target.closest('[data-bp-local]')) {
                const boxL = ws.querySelector('[data-bp-localbox]');
                if (!window.queryLocalFonts) { toast('Ce navigateur ne sait pas lire les polices de l’ordinateur : tape le nom de la police.', 'error'); return; }
                try { const fonts = [...new Set((await window.queryLocalFonts()).map(f => f.family))].sort((a, b) => a.localeCompare(b, 'fr'));
                    ws.querySelector('#h-bp-fdl').innerHTML = fonts.map(f => `<option value="${esc(f)}">`).join('');
                    boxL.hidden = false; boxL.innerHTML = `<p class="muted">${fonts.length} polices. Clique une police pour l’ajouter à la première liste (ou tape son nom dans une liste).</p><div class="h-bp-fonts">${fonts.map(f => `<button type="button" class="h-bp-font" data-bp-lf="${esc(f)}" style="font-family:'${esc(f)}'">${esc(f)}</button>`).join('')}</div>`;
                } catch (error) { toast('Lecture des polices refusée : ' + error.message, 'error'); }
                return;
            }
            const lf = e.target.closest('[data-bp-lf]'); if (lf) { collect(); if (!p.fontLists.length) p.fontLists.push({name: 'Ma liste', fonts: []}); if (!p.fontLists[0].fonts.includes(lf.dataset.bpLf)) p.fontLists[0].fonts.push(lf.dataset.bpLf); lf.classList.add('is-on'); toast(`« ${lf.dataset.bpLf} » ajoutée à « ${p.fontLists[0].name} ».`); return; }
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
