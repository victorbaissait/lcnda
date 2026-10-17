/* LCNDA — 🗺️ Mode « Plan » de l'outil vectoriel : dessiner un plan de ville, de village, de région, comme une vraie carte.
 * Des objets qui savent ce qu'ils sont (une route, une rivière, une forêt, une église…), dessinés selon un style d'époque
 * (carte moderne, état-major, cadastre napoléonien, Cassini, parchemin, noir et blanc) ; les noms suivent les rues ;
 * échelle, rose des vents, cartouche, cadre et légende qui se remplit toute seule ; un fond de carte ou une image de
 * référence en transparence pour décalquer ; les lieux de la base posés à leur place ; un lien vers une personne ou un lieu ;
 * un curseur du temps (ce qui existait en telle année).
 * Chargé après heritage-vector.js, qui appelle ext.vectorMap pour dessiner ces objets et pour l'onglet « 🗺️ Plan ».
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const n2 = v => Math.round((Number(v) || 0) * 100) / 100;
    const num = (v, d = 0) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : d; };
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const toast = (...a) => A().toast(...a);
    const api = (...a) => A().api(...a);
    const hex = (c, d) => /^#[0-9a-f]{3,8}$/i.test(String(c || '')) ? c : d;

    /* ═════════ Styles d'époque ═════════ */
    // chaque style : papier, encre, police, et la couleur de chaque genre d'objet
    const STYLES = {
        modern: {label: 'Carte moderne', paper: '#f4f1ea', ink: '#3a3a3a', font: 'Helvetica, Arial, sans-serif', italic: false, halo: '#ffffff',
            highway: ['#c98a2b', '#f6cf66'], road: ['#b9ab90', '#ffffff'], street: ['#c9bea8', '#ffffff'], track: '#9c7d55', footpath: '#9c7d55', rail: '#5a5a5a', ties: false,
            water: '#aacfee', waterInk: '#5f93c6', forest: '#c6e0ad', forestInk: '#7ea463', meadow: '#dcecc6', field: '#f0e9c8', fieldInk: '#d6c98e', vine: '#e2d3ea', vineInk: '#9a76ad', orchard: '#d9ebc0', marsh: '#d7e9e2', town: '#e6ded3', park: '#cfe8b8', cemetery: '#d3dccd', sand: '#f3e6b8', parcel: 'none',
            building: '#d9cec2', buildingInk: '#a39484', wall: '#7c7064', hedge: '#7ea463', border: '#8a5aa8', contour: '#c49a6c', symFill: '#ffffff', label: '#333333', water_label: '#3f73a8'},
        etatmajor: {label: 'Carte d’état-major (XIXᵉ)', paper: '#f2e8cf', ink: '#3b2f24', font: 'Georgia, "Times New Roman", serif', italic: true, halo: '#f2e8cf',
            highway: ['#3b2f24', '#efd9a8'], road: ['#3b2f24', '#f2e8cf'], street: ['#3b2f24', '#f2e8cf'], track: '#3b2f24', footpath: '#3b2f24', rail: '#2a2018', ties: true,
            water: '#c9dde6', waterInk: '#4a7598', forest: '#d6dfc2', forestInk: '#5e7a4c', meadow: '#dfe6c8', field: '#efe4c4', fieldInk: '#cbb98a', vine: '#e6d6d6', vineInk: '#7a5050', orchard: '#dfe5c7', marsh: '#d5e2dc', town: '#e8d6c8', park: '#d8e3c4', cemetery: '#dfe0cf', sand: '#efe1b8', parcel: 'none',
            building: '#d88a78', buildingInk: '#5a2a20', wall: '#3b2f24', hedge: '#5e7a4c', border: '#3b2f24', contour: '#a07850', symFill: '#f2e8cf', label: '#2a2018', water_label: '#3a5f80'},
        cadastre: {label: 'Cadastre napoléonien', paper: '#fbf6ea', ink: '#2b2b2b', font: '"Times New Roman", Georgia, serif', italic: false, halo: '#fbf6ea',
            highway: ['#2b2b2b', '#fbf6ea'], road: ['#2b2b2b', '#fbf6ea'], street: ['#2b2b2b', '#fbf6ea'], track: '#2b2b2b', footpath: '#2b2b2b', rail: '#2b2b2b', ties: true,
            water: '#b9d4ea', waterInk: '#3f6f9c', forest: '#e2ead2', forestInk: '#6d8a5a', meadow: '#e8eed8', field: '#fbf6ea', fieldInk: '#b8ab8a', vine: '#efe3e3', vineInk: '#7a5050', orchard: '#e6edd6', marsh: '#dfeae6', town: '#f3e6dc', park: '#e2ead2', cemetery: '#e6e8dc', sand: '#f3e8c8', parcel: 'none',
            building: '#eaa79b', buildingInk: '#7a2a20', wall: '#2b2b2b', hedge: '#6d8a5a', border: '#2b2b2b', contour: '#a88a6a', symFill: '#fbf6ea', label: '#2b2b2b', water_label: '#2f5f8c'},
        cassini: {label: 'Carte de Cassini (XVIIIᵉ)', paper: '#ede0bd', ink: '#4a3a28', font: 'Garamond, "EB Garamond", Georgia, serif', italic: true, halo: '#ede0bd',
            highway: ['#4a3a28', '#e6d3a5'], road: ['#4a3a28', '#ede0bd'], street: ['#4a3a28', '#ede0bd'], track: '#4a3a28', footpath: '#4a3a28', rail: '#4a3a28', ties: true,
            water: '#b8cdc9', waterInk: '#4f7480', forest: '#d8dcb6', forestInk: '#4f6a3a', meadow: '#e0dfbb', field: '#ede0bd', fieldInk: '#c4ad7c', vine: '#e2d0c2', vineInk: '#6e4a3a', orchard: '#dcdcb8', marsh: '#d3d9c3', town: '#e0c9b0', park: '#dad9b4', cemetery: '#dcd8c0', sand: '#ead8a8', parcel: 'none',
            building: '#b7664f', buildingInk: '#4a2418', wall: '#4a3a28', hedge: '#4f6a3a', border: '#7a3a28', contour: '#9a7a50', symFill: '#ede0bd', label: '#3a2a18', water_label: '#3a5a66'},
        parchment: {label: 'Plan ancien (parchemin)', paper: '#e7d3a8', ink: '#5a3c1c', font: '"Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif', italic: true, halo: '#e7d3a8',
            highway: ['#5a3c1c', '#dcc18c'], road: ['#5a3c1c', '#e7d3a8'], street: ['#5a3c1c', '#e7d3a8'], track: '#5a3c1c', footpath: '#5a3c1c', rail: '#5a3c1c', ties: true,
            water: '#b9c6b8', waterInk: '#4c6a66', forest: '#cfc79a', forestInk: '#5a5a2a', meadow: '#d8cf9e', field: '#e2cd9c', fieldInk: '#b89a64', vine: '#d8c0a0', vineInk: '#6a4a2a', orchard: '#d2c89a', marsh: '#ccc8a8', town: '#d8bf94', park: '#cfc79a', cemetery: '#d2c6a0', sand: '#e2c890', parcel: 'none',
            building: '#c08a5a', buildingInk: '#4a2c10', wall: '#5a3c1c', hedge: '#5a5a2a', border: '#7a2a10', contour: '#9a7040', symFill: '#e7d3a8', label: '#4a2c10', water_label: '#3c5a56'},
        bw: {label: 'Noir et blanc (à imprimer)', paper: '#ffffff', ink: '#111111', font: 'Helvetica, Arial, sans-serif', italic: false, halo: '#ffffff',
            highway: ['#111111', '#ffffff'], road: ['#111111', '#ffffff'], street: ['#111111', '#ffffff'], track: '#111111', footpath: '#111111', rail: '#111111', ties: true,
            water: '#e4e4e4', waterInk: '#111111', forest: '#ffffff', forestInk: '#111111', meadow: '#ffffff', field: '#ffffff', fieldInk: '#777777', vine: '#ffffff', vineInk: '#111111', orchard: '#ffffff', marsh: '#ffffff', town: '#eeeeee', park: '#ffffff', cemetery: '#ffffff', sand: '#f4f4f4', parcel: 'none',
            building: '#bbbbbb', buildingInk: '#111111', wall: '#111111', hedge: '#111111', border: '#111111', contour: '#888888', symFill: '#ffffff', label: '#111111', water_label: '#111111'},
    };
    const S = () => STYLES[ctx.doc?.map?.style] || STYLES.modern;

    /* ═════════ Les genres d'objets ═════════ */
    // traits (tracés ouverts) : [clé, nom, largeur par défaut, groupe, calque]
    const LINES = [['highway', 'Grande route (nationale)', 11, 'Voies', 'routes'], ['road', 'Route', 8, 'Voies', 'routes'], ['street', 'Rue', 6, 'Voies', 'routes'], ['track', 'Chemin', 3, 'Voies', 'routes'], ['footpath', 'Sentier', 1.6, 'Voies', 'routes'],
        ['rail', 'Voie ferrée', 4, 'Voies', 'routes'], ['bridge', 'Pont', 9, 'Voies', 'routes'],
        ['river', 'Rivière (s’élargit vers l’aval)', 14, 'Eau', 'eau'], ['stream', 'Ruisseau', 2.2, 'Eau', 'eau'], ['canal', 'Canal', 9, 'Eau', 'eau'], ['coast', 'Côte, rivage', 2, 'Eau', 'eau'],
        ['wall', 'Mur, enceinte, rempart', 4, 'Bâti', 'bati'], ['hedge', 'Haie', 3, 'Végétation', 'vegetation'], ['contour', 'Courbe de niveau', 1, 'Relief', 'relief'], ['cliff', 'Talus, falaise', 3, 'Relief', 'relief'],
        ['b_country', 'Frontière', 3, 'Limites', 'limites'], ['b_region', 'Limite de province, de région', 2.6, 'Limites', 'limites'], ['b_dept', 'Limite de département', 2.2, 'Limites', 'limites'],
        ['b_canton', 'Limite de canton', 1.6, 'Limites', 'limites'], ['b_commune', 'Limite de commune', 1.4, 'Limites', 'limites'], ['b_parish', 'Limite de paroisse', 1.2, 'Limites', 'limites'], ['b_estate', 'Limite de domaine, de seigneurie', 1.2, 'Limites', 'limites']];
    // zones (tracés fermés) : [clé, nom, groupe, calque]
    const ZONES = [['forest', 'Forêt, bois', 'Végétation', 'vegetation'], ['meadow', 'Pré, prairie', 'Végétation', 'vegetation'], ['field', 'Champ, labour', 'Végétation', 'vegetation'], ['vine', 'Vigne', 'Végétation', 'vegetation'],
        ['orchard', 'Verger', 'Végétation', 'vegetation'], ['park', 'Parc, jardin', 'Végétation', 'vegetation'], ['marsh', 'Marais', 'Eau', 'eau'], ['lake', 'Lac, étang, mare', 'Eau', 'eau'], ['sea', 'Mer', 'Eau', 'eau'],
        ['town', 'Bourg, quartier bâti', 'Bâti', 'bati'], ['cemetery', 'Cimetière', 'Bâti', 'bati'], ['square', 'Place, cour', 'Bâti', 'bati'], ['sand', 'Sable, grève', 'Relief', 'relief'], ['rock', 'Rochers', 'Relief', 'relief'],
        ['parcel', 'Parcelle (cadastre)', 'Parcelles', 'parcelles']];
    // symboles : [clé, nom, dessin (boîte 100 × 100)]
    const SYMS = [
        ['church', 'Église', 'M38 96V46L50 30L62 46V96ZM50 30V4M43 12H57M8 96V60H38M62 60H92V96Z', 'M38 96V46L50 30L62 46V96ZM8 96V60H38V96ZM62 60H92V96H62Z'],
        ['chapel', 'Chapelle', 'M24 94V52L50 30L76 52V94ZM50 30V8M42 16H58M44 94V74Q50 66 56 74V94', 'M24 94V52L50 30L76 52V94Z'],
        ['abbey', 'Abbaye, prieuré', 'M10 94V54L28 40L46 54V94ZM28 40V18M22 25H34M46 94V60H94V94ZM56 70H84V86H56Z', 'M10 94V54L28 40L46 54V94ZM46 60H94V94H46Z'],
        ['castle', 'Château', 'M8 94V30H18V38H26V30H36V50H64V30H74V38H82V30H92V94ZM42 94V74Q50 64 58 74V94', 'M8 94V30H18V38H26V30H36V50H64V30H74V38H82V30H92V94Z'],
        ['manor', 'Manoir, maison de maître', 'M10 94V46L50 20L90 46V94ZM40 94V72H60V94M22 56H34V66H22ZM66 56H78V66H66Z', 'M10 94V46L50 20L90 46V94Z'],
        ['house', 'Maison', 'M14 94V48L50 18L86 48V94ZM42 94V70H58V94', 'M14 94V48L50 18L86 48V94Z'],
        ['farm', 'Ferme', 'M4 94V56L28 36L52 56V94ZM52 94V62L76 46L96 62V94ZM20 94V76H34V94', 'M4 94V56L28 36L52 56V94ZM52 94V62L76 46L96 62V94Z'],
        ['townhall', 'Mairie', 'M8 94V44H92V94ZM4 44L50 20L96 44M50 20V4L66 9L50 14M22 56V82M40 56V82M60 56V82M78 56V82', 'M8 94V44H92V94Z'],
        ['school', 'École', 'M8 94V46H92V94ZM30 46L50 26L70 46M50 26V12M44 12H56V20H44ZM20 58H40V74H20ZM60 58H80V74H60Z', 'M8 94V46H92V94Z'],
        ['windmill', 'Moulin à vent', 'M38 96L42 52H58L62 96ZM50 46L12 12M50 46L88 12M50 46L12 80M50 46L88 80', 'M38 96L42 52H58L62 96Z'],
        ['watermill', 'Moulin à eau', 'M8 94V52L32 34L56 52V94ZM76 70m-20 0a20 20 0 1 0 40 0a20 20 0 1 0-40 0M76 50V90M56 70H96M62 56L90 84M90 56L62 84', 'M8 94V52L32 34L56 52V94Z'],
        ['forge', 'Forge, atelier', 'M10 94V50H72V94ZM72 64H92V94H72ZM80 64V20H90V64M26 66H52L46 78H32Z', 'M10 94V50H72V94ZM72 64H92V94H72Z'],
        ['factory', 'Usine, manufacture', 'M6 94V56L26 42V56L46 42V56L66 42V94ZM72 94V14H84V94Z', 'M6 94V56L26 42V56L46 42V56L66 42V94ZM72 94V14H84V94Z'],
        ['inn', 'Auberge, café', 'M12 94V46L50 20L88 46V94ZM40 94V72H60V94M30 56Q30 66 36 66Q42 66 42 56Z', 'M12 94V46L50 20L88 46V94Z'],
        ['station', 'Gare', 'M6 90V44H94V90ZM2 44L50 24L98 44M18 58H34V76H18ZM42 58H58V90H42ZM66 58H82V76H66ZM0 96H100', 'M6 90V44H94V90Z'],
        ['cemetery', 'Cimetière', 'M8 92V32H92V92ZM32 44V80M24 54H40M66 44V80M58 54H74', 'M8 92V32H92V92Z'],
        ['cross', 'Croix, calvaire', 'M44 92V36H56V92ZM28 44H72V54H28ZM34 92H66', 'M44 92V36H56V92ZM28 44H72V54H28Z'],
        ['well', 'Puits', 'M50 62m-26 0a26 26 0 1 0 52 0a26 26 0 1 0-52 0M50 62m-12 0a12 12 0 1 0 24 0a12 12 0 1 0-24 0M24 30H76M30 30V62M70 30V62', 'M50 62m-26 0a26 26 0 1 0 52 0a26 26 0 1 0-52 0'],
        ['fountain', 'Fontaine, lavoir', 'M10 70H90V90H10ZM50 70V26M50 26Q30 30 30 50M50 26Q70 30 70 50', 'M10 70H90V90H10Z'],
        ['tower', 'Tour, donjon', 'M30 96V26H70V96ZM26 26V12H36V20H46V12H54V20H64V12H74V26', 'M30 96V26H70V96Z'],
        ['lighthouse', 'Phare', 'M36 96L42 34H58L64 96ZM38 34V22H62V34M30 22H70M50 10V22', 'M36 96L42 34H58L64 96Z'],
        ['monument', 'Monument aux morts, obélisque', 'M40 92L44 20L50 8L56 20L60 92ZM28 92H72V98H28Z', 'M40 92L44 20L50 8L56 20L60 92Z'],
        ['tree', 'Arbre remarquable', 'M50 44m-30 0a30 30 0 1 0 60 0a30 30 0 1 0-60 0M46 70H54V96H46Z', 'M50 44m-30 0a30 30 0 1 0 60 0a30 30 0 1 0-60 0'],
        ['bridge_s', 'Pont (symbole)', 'M4 40Q50 10 96 40M4 60Q50 30 96 60M20 46V60M80 46V60', ''],
        ['port', 'Port, quai', 'M50 14m-8 0a8 8 0 1 0 16 0a8 8 0 1 0-16 0M50 22V86M30 40H70M18 64Q22 86 50 88Q78 86 82 64', ''],
        ['mine', 'Mine, carrière', 'M18 86L82 22M28 16L42 30M82 86L18 22M72 16L58 30', ''],
        ['battle', 'Bataille', 'M18 18L82 82M82 18L18 82M10 10L26 26M74 10L90 26', ''],
        ['pin', 'Repère (famille)', 'M50 96C50 96 18 60 18 38A32 32 0 0 1 82 38C82 60 50 96 50 96ZM50 38m-12 0a12 12 0 1 0 24 0a12 12 0 1 0-24 0', 'M50 96C50 96 18 60 18 38A32 32 0 0 1 82 38C82 60 50 96 50 96Z'],
        ['star', 'Lieu important', 'M50 4L61 38H97L68 59L79 94L50 72L21 94L32 59L3 38H39Z', 'M50 4L61 38H97L68 59L79 94L50 72L21 94L32 59L3 38H39Z'],
        ['dot_city', 'Ville (rond)', 'M50 50m-34 0a34 34 0 1 0 68 0a34 34 0 1 0-68 0M50 50m-16 0a16 16 0 1 0 32 0a16 16 0 1 0-32 0', 'M50 50m-34 0a34 34 0 1 0 68 0a34 34 0 1 0-68 0'],
        ['dot_village', 'Village (rond)', 'M50 50m-26 0a26 26 0 1 0 52 0a26 26 0 1 0-52 0', 'M50 50m-26 0a26 26 0 1 0 52 0a26 26 0 1 0-52 0'],
        ['dot_hamlet', 'Hameau (point)', 'M50 50m-14 0a14 14 0 1 0 28 0a14 14 0 1 0-28 0', 'M50 50m-14 0a14 14 0 1 0 28 0a14 14 0 1 0-28 0']];
    // noms de lieux : [clé, nom, taille, gras, italique, capitales, espacement, couleur (clé du style)]
    const LABELS = [['city', 'Ville', 30, true, false, true, 3, 'label'], ['town', 'Bourg', 22, true, false, false, 1, 'label'], ['village', 'Village', 17, false, false, false, 0.5, 'label'],
        ['hamlet', 'Hameau, lieu-dit', 12, false, true, false, 0, 'label'], ['region', 'Région, pays', 34, false, false, true, 10, 'label'], ['water', 'Cours d’eau, lac', 15, false, true, false, 1, 'water_label'],
        ['forest', 'Forêt, bois', 14, false, true, false, 2, 'forestInk'], ['street', 'Rue (texte libre)', 10, false, false, false, 0, 'label'], ['note', 'Note, légende', 11, false, true, false, 0, 'ink']];
    // habillage de la carte
    const DECOS = [['scale', 'Échelle', 260, 40], ['compass', 'Rose des vents', 120, 120], ['cartouche', 'Cartouche (titre)', 320, 140], ['legend', 'Légende (automatique)', 240, 260], ['frame', 'Cadre de carte (tout autour)', 0, 0]];
    // calques préparés (du bas vers le haut)
    const LAYERS = [['relief', 'Relief'], ['eau', 'Eau'], ['vegetation', 'Végétation'], ['parcelles', 'Parcelles'], ['routes', 'Routes et chemins'], ['bati', 'Bâti'], ['limites', 'Limites'], ['noms', 'Noms'], ['genealogie', 'Généalogie'], ['habillage', 'Habillage (échelle, légende…)']];
    const lineOf = k => LINES.find(l => l[0] === k), zoneOf = k => ZONES.find(z => z[0] === k), symOf = k => SYMS.find(s => s[0] === k), labelOf = k => LABELS.find(l => l[0] === k), decoOf = k => DECOS.find(d => d[0] === k);
    const isLine = o => o?.type === 'path' && !!o.map && !!lineOf(o.map.k) && !o.closed;
    const isZone = o => o?.type === 'path' && !!o.map && !!zoneOf(o.map.k);

    /* contexte de dessin : le document (style, année, légende) ; posé par l'éditeur avant de dessiner */
    const ctx = {doc: null, editor: false};

    /* ═════════ Géométrie : lissage et échantillonnage des tracés ═════════ */
    const P = (x, y, i = null, o = null) => ({x, y, i, o});
    /** des points sans poignées → des courbes douces (Catmull-Rom), sauf si l'on a mis ses propres poignées */
    function smooth(pts, closed, on = true) {
        if (!on || pts.length < 3) return pts;
        const n = pts.length;
        return pts.map((p, i) => { if (p.i || p.o) return p; const a = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)], b = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)], t = [(b.x - a.x) / 6, (b.y - a.y) / 6];
            return P(p.x, p.y, [p.x - t[0], p.y - t[1]], [p.x + t[0], p.y + t[1]]); });
    }
    const dOf = (pts, closed) => { if (!pts.length) return ''; let d = `M${n2(pts[0].x)} ${n2(pts[0].y)}`; const seg = (a, b) => (a.o || b.i) ? `C${n2((a.o || [a.x, a.y])[0])} ${n2((a.o || [a.x, a.y])[1])} ${n2((b.i || [b.x, b.y])[0])} ${n2((b.i || [b.x, b.y])[1])} ${n2(b.x)} ${n2(b.y)}` : `L${n2(b.x)} ${n2(b.y)}`;
        for (let k = 1; k < pts.length; k++) d += seg(pts[k - 1], pts[k]); if (closed && pts.length > 1) d += seg(pts[pts.length - 1], pts[0]) + 'Z'; return d; };
    /** un tracé → une suite de points rapprochés (pour élargir une rivière, poser des traverses, des arbres) */
    function sample(pts, closed, per = 10) {
        const out = [], segs = closed ? pts.length : pts.length - 1;
        for (let k = 0; k < segs; k++) { const a = pts[k], b = pts[(k + 1) % pts.length], c1 = a.o || [a.x, a.y], c2 = b.i || [b.x, b.y];
            for (let s = 0; s < per; s++) { const t = s / per, u = 1 - t; out.push([u * u * u * a.x + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * b.x, u * u * u * a.y + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * b.y]); } }
        const last = closed ? pts[0] : pts[pts.length - 1]; if (last) out.push([last.x, last.y]);
        return out;
    }
    const lengthOf = s => { let L = 0; for (let k = 1; k < s.length; k++) L += Math.hypot(s[k][0] - s[k - 1][0], s[k][1] - s[k - 1][1]); return L; };
    /** des points tous les « step » le long du tracé, avec la direction (pour les traverses, les arbres d'une haie) */
    function along(s, step, off = 0) {
        const out = []; let next = off, acc = 0;
        for (let k = 1; k < s.length; k++) { const [ax, ay] = s[k - 1], [bx, by] = s[k], L = Math.hypot(bx - ax, by - ay); if (!L) continue;
            while (next <= acc + L) { const t = (next - acc) / L; out.push([ax + (bx - ax) * t, ay + (by - ay) * t, Math.atan2(by - ay, bx - ax)]); next += step; } acc += L; }
        return out;
    }

    /* ═════════ Motifs des zones ═════════ */
    function pattern(kind, defs, pre) {
        const st = S(), id = `${pre}mp_${kind}_${ctx.doc?.map?.style || 'modern'}`;
        if (defs.some(d => d.includes(`id="${id}"`))) return `url(#${id})`;
        const pat = (w, h, body, bg) => `<pattern id="${id}" width="${w}" height="${h}" patternUnits="userSpaceOnUse">${bg ? `<rect width="${w}" height="${h}" fill="${bg}"/>` : ''}${body}</pattern>`;
        const ink = st.forestInk;
        const P2 = {
            forest: pat(18, 18, `<circle cx="5" cy="6" r="3.2" fill="none" stroke="${ink}" stroke-width=".9"/><path d="M5 9.2V12" stroke="${ink}" stroke-width=".9"/><circle cx="14" cy="14" r="2.6" fill="none" stroke="${ink}" stroke-width=".9"/><path d="M14 16.6V18" stroke="${ink}" stroke-width=".9"/>`, st.forest),
            meadow: pat(14, 12, `<path d="M3 8l1.5-3 1.5 3M9 11l1.2-2.4 1.2 2.4" stroke="${ink}" stroke-width=".7" fill="none"/>`, st.meadow),
            field: pat(8, 8, `<path d="M0 8L8 0" stroke="${st.fieldInk}" stroke-width=".8"/>`, st.field),
            vine: pat(10, 10, `<circle cx="3" cy="3" r="1.1" fill="${st.vineInk}"/><circle cx="8" cy="8" r="1.1" fill="${st.vineInk}"/><path d="M0 3H10" stroke="${st.vineInk}" stroke-width=".3"/>`, st.vine),
            orchard: pat(16, 16, `<circle cx="8" cy="8" r="3" fill="none" stroke="${ink}" stroke-width=".9"/><circle cx="8" cy="8" r=".9" fill="${ink}"/>`, st.orchard),
            park: pat(22, 22, `<circle cx="7" cy="7" r="2.6" fill="${ink}" fill-opacity=".45"/><circle cx="17" cy="17" r="2" fill="${ink}" fill-opacity=".45"/>`, st.park),
            marsh: pat(16, 10, `<path d="M2 7H10M4 7V4M6 7V3M8 7V4" stroke="${st.waterInk}" stroke-width=".7" fill="none"/>`, st.marsh),
            lake: pat(24, 10, `<path d="M2 6q3-3 6 0t6 0" stroke="${st.waterInk}" stroke-width=".6" fill="none" opacity=".7"/>`, st.water),
            sea: pat(28, 14, `<path d="M2 8q3.5-3.5 7 0t7 0" stroke="${st.waterInk}" stroke-width=".6" fill="none" opacity=".6"/>`, st.water),
            town: pat(7, 7, `<path d="M0 7L7 0M-1 1L1 -1M6 8L8 6" stroke="${st.buildingInk}" stroke-width=".5" opacity=".6"/>`, st.town),
            cemetery: pat(14, 14, `<path d="M7 3V11M4.5 5.5H9.5" stroke="${st.ink}" stroke-width=".8"/>`, st.cemetery),
            square: pat(10, 10, '', st.paper),
            sand: pat(9, 9, `<circle cx="2" cy="3" r=".6" fill="${st.ink}" opacity=".5"/><circle cx="6.5" cy="7" r=".6" fill="${st.ink}" opacity=".5"/>`, st.sand),
            rock: pat(16, 16, `<path d="M3 12L6 6L9 12ZM10 8L12.5 3.5L15 8Z" fill="none" stroke="${st.ink}" stroke-width=".7"/>`, st.paper),
            parcel: '',
        };
        if (!P2[kind]) return 'none';
        defs.push(P2[kind]); return `url(#${id})`;
    }

    /* ═════════ Dessin des objets de plan ═════════ */
    const tip = o => { const m = o.map || {}, bits = [m.name, m.note, m.link?.label ? `→ ${m.link.label}` : '', (m.yf || m.yt) ? `${m.yf || '…'}–${m.yt || '…'}` : ''].filter(Boolean); return bits.length ? `<title>${esc(bits.join(' · '))}</title>` : ''; };
    /** ce qui existe à l'année choisie (curseur du temps) */
    function inTime(o) {
        const y = ctx.doc?.map?.year; if (!y || !o) return true;
        const f = num(o.map?.yf ?? o.yf, 0), t = num(o.map?.yt ?? o.yt, 0);
        return !(f && y < f) && !(t && y > t);
    }
    const W = o => clamp(num(o.map?.w, lineOf(o.map?.k)?.[2] || 4), 0.3, 200);
    const labelOnPath = (o, d, defs, pre, size, fill, italic, offset = 0) => {
        const name = String(o.map?.name || '').trim(); if (!name || o.map?.label === false) return '';
        const st = S(), pid = `${pre}lp${String(o.id).replace(/\W/g, '')}`;
        defs.push(`<path id="${pid}" d="${d}"/>`);
        return `<text font-family="${esc(st.font)}" font-size="${n2(size)}"${italic ? ' font-style="italic"' : ''} fill="${fill}" stroke="${st.halo}" stroke-width="${n2(size / 4)}" paint-order="stroke" stroke-linejoin="round" dy="${n2(offset)}" letter-spacing="${n2(size * .08)}"><textPath href="#${pid}" startOffset="50%" text-anchor="middle">${esc(name)}</textPath></text>`;
    };
    /** pour qu'un nom ne soit jamais à l'envers : le tracé qui va de droite à gauche est lu à rebours */
    const readable = s => s.length > 1 && s[s.length - 1][0] < s[0][0] ? [...s].reverse() : s;
    const polyD = s => s.map((p, i) => `${i ? 'L' : 'M'}${n2(p[0])} ${n2(p[1])}`).join('');
    /** un trait de plan, en deux temps : le dessous (bordure) puis le dessus, pour que les croisements se raccordent */
    function lineSvg(o, defs, pre, idAttr, pass = 'all') {
        const st = S(), k = o.map.k, w = W(o), pts = smooth(o.pts || [], false, o.map.smooth !== false), d = dOf(pts, false); if (!d) return '';
        const op = num(o.op, 1) < 1 ? ` opacity="${n2(num(o.op, 1))}"` : '';
        const casing = pass !== 'fill', fill = pass !== 'casing', g = body => body ? `<g${idAttr}${op}>${tip(o)}${body}</g>` : '';
        const strk = (c, sw, extra = '') => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${n2(sw)}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
        let body = '';
        const s = () => sample(pts, false, 12);
        if (['highway', 'road', 'street', 'bridge'].includes(k)) {
            const [cc, fc] = k === 'bridge' ? [st.ink, st.paper] : st[k];
            if (casing) body += strk(cc, w + (k === 'bridge' ? 4 : 2.4), k === 'bridge' ? ' stroke-linecap="butt"' : '');
            if (fill) { body += strk(fc, w, k === 'bridge' ? ' stroke-linecap="butt"' : ''); const fs = clamp(w * .9, 8, 26); body += labelOnPath(o, polyD(readable(s())), defs, pre, fs, st.label, false, fs * .34); }
        } else if (k === 'track' || k === 'footpath') {
            if (fill) { body += strk(st[k], w, k === 'track' ? ' stroke-dasharray="7 4"' : ` stroke-dasharray="${n2(w * .1)} ${n2(w * 2.6)}"`); body += labelOnPath(o, polyD(readable(s())), defs, pre, 9, st.label, true, -w - 3); }
        } else if (k === 'rail') {
            if (st.ties) { if (fill) { body += strk(st.rail, 1.6); body += along(s(), 7, 3).map(([x, y, a]) => { const nx = -Math.sin(a) * w, ny = Math.cos(a) * w; return `<path d="M${n2(x - nx)} ${n2(y - ny)}L${n2(x + nx)} ${n2(y + ny)}" stroke="${st.rail}" stroke-width="1.1"/>`; }).join(''); } }
            else { if (casing) body += strk(st.rail, w + 1.5, ' stroke-linecap="butt"'); if (fill) body += strk('#ffffff', w * .55, ` stroke-linecap="butt" stroke-dasharray="${n2(w * 2.5)} ${n2(w * 2.5)}"`); }
            if (fill) body += labelOnPath(o, polyD(readable(s())), defs, pre, 9, st.label, true, -w - 4);
        } else if (k === 'river') {
            // une rivière s'élargit de sa source (le premier point) vers l'aval
            if (fill) { const sm = s(), L = lengthOf(sm) || 1; let acc = 0; const left = [], right = [];
                sm.forEach((p, i) => { if (i) acc += Math.hypot(p[0] - sm[i - 1][0], p[1] - sm[i - 1][1]); const q = sm[Math.min(sm.length - 1, i + 1)], r = sm[Math.max(0, i - 1)], a = Math.atan2(q[1] - r[1], q[0] - r[0]), hw = (w * (.3 + .7 * acc / L)) / 2; left.push([p[0] - Math.sin(a) * hw, p[1] + Math.cos(a) * hw]); right.push([p[0] + Math.sin(a) * hw, p[1] - Math.cos(a) * hw]); });
                body += `<path d="${polyD([...left, ...right.reverse()])}Z" fill="${st.water}" stroke="${st.waterInk}" stroke-width=".9" stroke-linejoin="round"/>`;
                body += labelOnPath(o, polyD(readable(sm)), defs, pre, clamp(w * .75, 9, 22), st.water_label, true, -w * .7 - 2); }
        } else if (k === 'stream') { if (fill) { body += strk(st.waterInk, w); body += labelOnPath(o, polyD(readable(s())), defs, pre, 9, st.water_label, true, -w - 3); } }
        else if (k === 'canal') { if (casing) body += strk(st.waterInk, w + 2, ' stroke-linecap="butt"'); if (fill) { body += strk(st.water, w, ' stroke-linecap="butt"'); body += labelOnPath(o, polyD(readable(s())), defs, pre, 10, st.water_label, true, -w - 3); } }
        else if (k === 'coast') { if (fill) body += strk(st.waterInk, w) + strk(st.waterInk, .6, ` stroke-dasharray="2 4" transform="translate(0 ${n2(w * 2)})" opacity=".6"`); }
        else if (k === 'wall') { if (fill) body += strk(st.wall, w, ' stroke-linecap="butt" stroke-linejoin="miter"'); }
        else if (k === 'hedge') { if (fill) body += along(s(), Math.max(3, w * 1.5)).map(([x, y]) => `<circle cx="${n2(x)}" cy="${n2(y)}" r="${n2(w * .65)}" fill="${st.forest}" stroke="${st.hedge}" stroke-width=".7"/>`).join(''); }
        else if (k === 'contour') { if (fill) { body += strk(st.contour, w); if (o.map.name) body += labelOnPath(o, polyD(readable(s())), defs, pre, 7, st.contour, false, 2.5); } }
        else if (k === 'cliff') { if (fill) { body += strk(st.ink, w * .5); body += along(s(), 5).map(([x, y, a]) => `<path d="M${n2(x)} ${n2(y)}l${n2(-Math.sin(a) * w * 2)} ${n2(Math.cos(a) * w * 2)}" stroke="${st.ink}" stroke-width=".7"/>`).join(''); } }
        else if (k.startsWith('b_')) {
            const dash = {b_country: '14 4 2 4 2 4', b_region: '12 4 2 4', b_dept: '10 4 2 4', b_canton: '8 3 2 3', b_commune: '6 3', b_parish: '2 3', b_estate: '1 3'}[k];
            if (casing && ['b_country', 'b_region', 'b_dept'].includes(k)) body += strk(st.border, w * 3, ' stroke-opacity=".18"');
            if (fill) { body += strk(st.border, w, ` stroke-dasharray="${dash}" stroke-linecap="butt"`); body += labelOnPath(o, polyD(readable(s())), defs, pre, 8, st.border, true, -w - 3); }
        }
        return g(body);
    }
    function zoneSvg(o, defs, pre, idAttr) {
        const st = S(), k = o.map.k, pts = smooth(o.pts || [], true, o.map.smooth === true), d = dOf(pts, true); if (!d) return '';
        const fill = k === 'parcel' ? 'none' : pattern(k, defs, pre), stroke = k === 'parcel' ? st.ink : ['lake', 'sea', 'marsh'].includes(k) ? st.waterInk : ['forest', 'park', 'orchard', 'meadow'].includes(k) ? st.forestInk : k === 'town' ? st.buildingInk : st.ink;
        const sw = k === 'parcel' ? .7 : ['field', 'meadow', 'square'].includes(k) ? .5 : .9;
        let label = '';
        const name = String(o.map.name || '').trim();
        if (name && o.map.label !== false) { const xs = pts.map(p => p.x), ys = pts.map(p => p.y), cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2, size = k === 'parcel' ? 8 : ['lake', 'sea'].includes(k) ? 13 : 12;
            label = `<text x="${n2(cx)}" y="${n2(cy + size / 3)}" text-anchor="middle" font-family="${esc(st.font)}" font-size="${size}"${k !== 'parcel' ? ' font-style="italic"' : ''} fill="${['lake', 'sea', 'marsh'].includes(k) ? st.water_label : k === 'forest' ? st.forestInk : st.label}" stroke="${st.halo}" stroke-width="${n2(size / 4)}" paint-order="stroke">${esc(name)}</text>`; }
        return `<g${idAttr}${num(o.op, 1) < 1 ? ` opacity="${n2(num(o.op, 1))}"` : ''}>${tip(o)}<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"/>${label}</g>`;
    }
    const rot = o => { const r = num(o.rot); return r ? ` transform="rotate(${n2(r)} ${n2(o.x + o.w / 2)} ${n2(o.y + o.h / 2)})"` : ''; };
    function symSvg(o, defs, pre, idAttr) {
        const st = S(), k = o.map?.k || 'house', x = num(o.x), y = num(o.y), w = Math.max(1, num(o.w, 20)), h = Math.max(1, num(o.h, 20));
        const op = num(o.op, 1) < 1 ? ` opacity="${n2(num(o.op, 1))}"` : '';
        let body;
        if (k === 'building') body = `<rect x="${n2(x)}" y="${n2(y)}" width="${n2(w)}" height="${n2(h)}" fill="${hex(o.map.fill, st.building)}" stroke="${st.buildingInk}" stroke-width=".9"/>`;
        else { const s = symOf(k) || SYMS[5], ink = hex(o.map.ink, st.ink);
            body = `<g transform="translate(${n2(x)} ${n2(y)}) scale(${n2(w / 100)} ${n2(h / 100)})">${s[3] ? `<path d="${s[3]}" fill="${hex(o.map.fill, k === 'pin' ? '#c0392b' : st.symFill)}"/>` : ''}<path d="${s[2]}" fill="none" stroke="${ink}" stroke-width="${n2(clamp(5 * 100 / Math.max(w, h), 2, 12))}" stroke-linejoin="round" stroke-linecap="round"/></g>`; }
        const name = String(o.map?.name || '').trim();
        if (name && o.map.label !== false) { const size = clamp(num(o.map.ls, 11), 5, 80), pos = o.map.lpos || 'right';
            const [tx, ty, anc] = pos === 'below' ? [x + w / 2, y + h + size, 'middle'] : pos === 'above' ? [x + w / 2, y - size * .4, 'middle'] : pos === 'left' ? [x - size * .4, y + h / 2 + size / 3, 'end'] : [x + w + size * .4, y + h / 2 + size / 3, 'start'];
            body += `<text x="${n2(tx)}" y="${n2(ty)}" text-anchor="${anc}" font-family="${esc(st.font)}" font-size="${n2(size)}"${st.italic && k !== 'dot_city' ? ' font-style="italic"' : ''}${k === 'dot_city' ? ' font-weight="700"' : ''} fill="${st.label}" stroke="${st.halo}" stroke-width="${n2(size / 4)}" paint-order="stroke">${esc(name)}</text>`; }
        return `<g${idAttr}${op}${rot(o)}>${tip(o)}${body}</g>`;
    }
    /* habillage */
    function metersPerPx() {
        const m = ctx.doc?.map || {}, g = m.geo;
        if (g && num(g.e) !== num(g.w)) { const lat = (num(g.n) + num(g.s)) / 2; return (num(g.e) - num(g.w)) * 111320 * Math.cos(lat * Math.PI / 180) / (ctx.doc.w || 1); }
        return clamp(num(m.scale, 1), 0.001, 1e6);
    }
    function decoSvg(o, defs, pre, idAttr) {
        const st = S(), k = o.map.k, x = num(o.x), y = num(o.y), w = Math.max(1, num(o.w, 100)), h = Math.max(1, num(o.h, 40)), F = `font-family="${esc(st.font)}"`;
        let body = '';
        if (k === 'scale') {
            const mpp = metersPerPx(), target = w * .8 * mpp, p10 = 10 ** Math.floor(Math.log10(target)), nice = [1, 2, 2.5, 5, 10].map(f => f * p10).filter(v => v <= target).pop() || p10, len = nice / mpp, segs = 4, bh = Math.max(4, h * .22);
            const lab = v => v >= 1000 ? `${String(+(v / 1000).toFixed(2)).replace('.', ',')} km` : `${String(+v.toFixed(1)).replace('.', ',')} m`;
            for (let i = 0; i < segs; i++) body += `<rect x="${n2(x + i * len / segs)}" y="${n2(y + h * .4)}" width="${n2(len / segs)}" height="${n2(bh)}" fill="${i % 2 ? st.paper : st.ink}" stroke="${st.ink}" stroke-width=".8"/>`;
            body += `<text x="${n2(x)}" y="${n2(y + h * .32)}" ${F} font-size="${n2(h * .26)}" fill="${st.ink}" text-anchor="middle">0</text><text x="${n2(x + len)}" y="${n2(y + h * .32)}" ${F} font-size="${n2(h * .26)}" fill="${st.ink}" text-anchor="middle">${lab(nice)}</text>`;
            body += `<text x="${n2(x + len / 2)}" y="${n2(y + h * .4 + bh + h * .3)}" ${F} font-size="${n2(h * .2)}" fill="${st.ink}" text-anchor="middle"${st.italic ? ' font-style="italic"' : ''}>${ctx.doc?.map?.geo ? `1 cm ≈ ${lab(mpp * 37.8)}` : 'Échelle'}</text>`;
            body = `<rect x="${n2(x)}" y="${n2(y)}" width="${n2(w)}" height="${n2(h)}" fill="none"/>` + body;
        } else if (k === 'compass') {
            const cx = x + w / 2, cy = y + h / 2, r = Math.min(w, h) / 2 * .64, star = (rr, a0, n, f) => { let d = ''; for (let i = 0; i < n * 2; i++) { const a = a0 + i * Math.PI / n, q = i % 2 ? rr * f : rr; d += `${i ? 'L' : 'M'}${n2(cx + Math.cos(a) * q)} ${n2(cy + Math.sin(a) * q)}`; } return d + 'Z'; };
            body += `<circle cx="${n2(cx)}" cy="${n2(cy)}" r="${n2(r * .72)}" fill="none" stroke="${st.ink}" stroke-width=".8"/><circle cx="${n2(cx)}" cy="${n2(cy)}" r="${n2(r * .66)}" fill="none" stroke="${st.ink}" stroke-width=".4"/>`;
            body += `<path d="${star(r * .62, -Math.PI / 2 + Math.PI / 4, 4, .18)}" fill="${st.paper}" stroke="${st.ink}" stroke-width=".7"/><path d="${star(r, -Math.PI / 2, 4, .16)}" fill="${st.paper}" stroke="${st.ink}" stroke-width=".9"/>`;
            [0, 1, 2, 3].forEach(i => { const a = -Math.PI / 2 + i * Math.PI / 2; body += `<path d="M${n2(cx)} ${n2(cy)}L${n2(cx + Math.cos(a) * r)} ${n2(cy + Math.sin(a) * r)}L${n2(cx + Math.cos(a + .32) * r * .16)} ${n2(cy + Math.sin(a + .32) * r * .16)}Z" fill="${st.ink}"/>`; });
            const fs = r * .26; [['N', 0, -1], ['E', 1, 0], ['S', 0, 1], ['O', -1, 0]].forEach(([t, dx, dy]) => { body += `<text x="${n2(cx + dx * (r + fs * .8))}" y="${n2(cy + dy * (r + fs * .8) + fs * .36)}" ${F} font-size="${n2(fs)}" font-weight="700" fill="${st.ink}" text-anchor="middle">${t}</text>`; });
            body = `<rect x="${n2(x)}" y="${n2(y)}" width="${n2(w)}" height="${n2(h)}" fill="none"/>` + body;
        } else if (k === 'cartouche') {
            const t = String(o.map.title || 'Plan de …'), sub = String(o.map.sub || ''), date = String(o.map.date || ''), m = Math.min(w, h) * .06, old = ctx.doc?.map?.style !== 'modern' && ctx.doc?.map?.style !== 'bw';
            body += `<rect x="${n2(x)}" y="${n2(y)}" width="${n2(w)}" height="${n2(h)}" fill="${st.paper}" stroke="${st.ink}" stroke-width="1.6"/><rect x="${n2(x + m)}" y="${n2(y + m)}" width="${n2(w - 2 * m)}" height="${n2(h - 2 * m)}" fill="none" stroke="${st.ink}" stroke-width=".6"/>`;
            if (old) [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].forEach(([cx, cy]) => { body += `<circle cx="${n2(cx)}" cy="${n2(cy)}" r="${n2(m * 1.3)}" fill="${st.paper}" stroke="${st.ink}" stroke-width=".8"/><circle cx="${n2(cx)}" cy="${n2(cy)}" r="${n2(m * .5)}" fill="${st.ink}"/>`; });
            const ts = Math.min(h * .26, w / Math.max(6, t.length * .55));
            body += `<text x="${n2(x + w / 2)}" y="${n2(y + h * .42)}" ${F} font-size="${n2(ts)}" font-weight="700"${old ? ' font-style="italic"' : ''} fill="${st.ink}" text-anchor="middle">${esc(t)}</text>`;
            if (sub) body += `<text x="${n2(x + w / 2)}" y="${n2(y + h * .62)}" ${F} font-size="${n2(ts * .5)}" fill="${st.ink}" text-anchor="middle"${old ? ' font-style="italic"' : ''}>${esc(sub)}</text>`;
            if (date) body += `<text x="${n2(x + w / 2)}" y="${n2(y + h * .82)}" ${F} font-size="${n2(ts * .42)}" fill="${st.ink}" text-anchor="middle" letter-spacing="1">${esc(date)}</text>`;
        } else if (k === 'legend') {
            const used = legendKinds(), rowH = Math.max(14, Math.min(26, (h - 30) / Math.max(1, used.length))), fs = rowH * .52, bh = Math.min(h, 38 + Math.max(1, used.length) * rowH); // le cadre suit le nombre de lignes
            body += `<rect x="${n2(x)}" y="${n2(y)}" width="${n2(w)}" height="${n2(h)}" fill="none"/><rect x="${n2(x)}" y="${n2(y)}" width="${n2(w)}" height="${n2(bh)}" fill="${st.paper}" stroke="${st.ink}" stroke-width="1"/><text x="${n2(x + 10)}" y="${n2(y + 20)}" ${F} font-size="${n2(Math.min(16, rowH * .7))}" font-weight="700" fill="${st.ink}">${esc(o.map.title || 'Légende')}</text>`;
            used.forEach(([type, k2, label], i) => { const ry = y + 30 + i * rowH, sx = x + 10, sw2 = 34, cy = ry + rowH / 2, fake = {id: `lg${i}`, map: {k: k2, label: false}, op: 1};
                if (type === 'line') body += lineSvg({...fake, type: 'path', pts: [P(sx, cy), P(sx + sw2, cy)]}, defs, pre + 'lg', '', 'all');
                else if (type === 'zone') body += zoneSvg({...fake, type: 'path', closed: true, pts: [P(sx, ry + 3), P(sx + sw2, ry + 3), P(sx + sw2, ry + rowH - 3), P(sx, ry + rowH - 3)]}, defs, pre + 'lg', '');
                else body += symSvg({...fake, type: 'msym', x: sx + sw2 / 2 - (rowH - 6) / 2, y: ry + 3, w: rowH - 6, h: rowH - 6}, defs, pre + 'lg', '');
                body += `<text x="${n2(sx + sw2 + 10)}" y="${n2(cy + fs / 3)}" ${F} font-size="${n2(fs)}" fill="${st.ink}">${esc(label)}</text>`; });
            if (!used.length) body += `<text x="${n2(x + 10)}" y="${n2(y + 44)}" ${F} font-size="11" font-style="italic" fill="${st.ink}">(se remplit avec ce qui est dessiné)</text>`;
        } else if (k === 'frame') {
            const dw = ctx.doc?.w || w, dh = ctx.doc?.h || h, m = 14, g2 = ctx.doc?.map?.geo;
            body += `<rect x="${m}" y="${m}" width="${n2(dw - 2 * m)}" height="${n2(dh - 2 * m)}" fill="none" stroke="${st.ink}" stroke-width="2.4"/><rect x="${m + 5}" y="${m + 5}" width="${n2(dw - 2 * m - 10)}" height="${n2(dh - 2 * m - 10)}" fill="none" stroke="${st.ink}" stroke-width=".7"/>`;
            // graduations alternées noir / blanc, avec les degrés si le plan est situé
            const step = 40; for (let p = m + 5, i = 0; p < dw - m - 5; p += step, i++) body += `<rect x="${n2(p)}" y="${m}" width="${n2(Math.min(step, dw - m - 5 - p))}" height="5" fill="${i % 2 ? st.paper : st.ink}"/><rect x="${n2(p)}" y="${n2(dh - m - 5)}" width="${n2(Math.min(step, dw - m - 5 - p))}" height="5" fill="${i % 2 ? st.paper : st.ink}"/>`;
            for (let p = m + 5, i = 0; p < dh - m - 5; p += step, i++) body += `<rect x="${m}" y="${n2(p)}" width="5" height="${n2(Math.min(step, dh - m - 5 - p))}" fill="${i % 2 ? st.paper : st.ink}"/><rect x="${n2(dw - m - 5)}" y="${n2(p)}" width="5" height="${n2(Math.min(step, dh - m - 5 - p))}" fill="${i % 2 ? st.paper : st.ink}"/>`;
            if (g2) { const f = v => `${Math.abs(v).toFixed(3).replace('.', ',')}°`; body += `<text x="${m + 8}" y="${m - 3}" ${F} font-size="9" fill="${st.ink}">${f(g2.n)} N · ${f(g2.w)} ${g2.w < 0 ? 'O' : 'E'}</text><text x="${n2(dw - m - 8)}" y="${n2(dh - 3)}" ${F} font-size="9" fill="${st.ink}" text-anchor="end">${f(g2.s)} N · ${f(g2.e)} ${g2.e < 0 ? 'O' : 'E'}</text>`; }
            return `<g${idAttr}>${body}</g>`;
        }
        return `<g${idAttr}${rot(o)}>${body}</g>`;
    }
    /** ce que la légende montre : les genres vraiment dessinés (et visibles à l'année choisie) */
    function legendKinds() {
        const seen = new Map();
        const walk = arr => (arr || []).forEach(o => { if (o.hidden || !inTime(o)) return; if (o.type === 'group') return walk(o.children);
            const m = o.map; if (!m) return;
            if (o.type === 'path' && lineOf(m.k) && !o.closed) seen.set('l' + m.k, ['line', m.k, lineOf(m.k)[1].replace(/ \(.*\)$/, '')]);
            else if (o.type === 'path' && zoneOf(m.k)) seen.set('z' + m.k, ['zone', m.k, zoneOf(m.k)[1]]);
            else if (o.type === 'msym' && m.k !== 'building' && symOf(m.k)) seen.set('s' + m.k, ['sym', m.k, symOf(m.k)[1]]);
            else if (o.type === 'msym' && m.k === 'building') seen.set('sbuilding', ['sym', 'building', 'Bâtiment']); });
        walk(ctx.doc?.objs);
        const order = {line: 0, zone: 1, sym: 2};
        return [...seen.values()].sort((a, b) => order[a[0]] - order[b[0]]).slice(0, 30);
    }
    /** dessine un objet de plan (appelé par l'éditeur vectoriel) ; null = pas un objet de plan */
    function svg(o, defs, pre, idAttr, pass) {
        if (!o?.map) return null;
        if (o.type === 'msym') return symSvg(o, defs, pre, idAttr);
        if (o.type === 'mdeco') return decoSvg(o, defs, pre, idAttr);
        if (o.type === 'path' && lineOf(o.map.k) && !o.closed) return lineSvg(o, defs, pre, idAttr, pass);
        if (o.type === 'path' && zoneOf(o.map.k)) return zoneSvg(o, defs, pre, idAttr);
        return null;
    }
    /** un nom de lieu : un texte avec le style de son genre */
    function styleLabel(o) {
        const L = labelOf(o.map?.k); if (!L || o.map.custom) return o;
        const st = S(); o.font = st.font.split(',')[0].replace(/"/g, ''); o.size = num(o.size, L[2]) || L[2]; o.bold = L[3]; o.italic = L[4] || (st.italic && ['village', 'hamlet'].includes(L[0])); o.ls = L[6]; o.fill = st[L[7]] || st.label; o.halo = st.halo; o.sw = 0;
        if (L[5]) o.text = String(o.text || '').toLocaleUpperCase('fr-FR');
        return o;
    }

    /* ═════════ L'onglet « 🗺️ Plan » et ses fenêtres (branchés sur l'éditeur ouvert) ═════════ */
    // api de l'éditeur : {doc(), cur(), selObjs(), commit(label), render(), setTool(t), fit(), uid(), enterLayer(id), targetFor(o), dlg, pane}
    function attach(ed) {
        let pick = {tool: 'mline', kind: 'road'};
        const mapDoc = () => { const d = ed.doc(); d.map = d.map || {}; return d.map; };
        const palette = (list, tool, title, icon) => `<div class="vx-mpal"><h5>${title}</h5><div class="vx-mpal-row">${list.map(x => `<button type="button" data-vm-pick="${tool}:${x[0]}" class="${pick.tool === tool && pick.kind === x[0] ? 'is-on' : ''}" title="${esc(x[1])}">${icon(x)}<span>${esc(x[1].replace(/ \(.*\)$/, ''))}</span></button>`).join('')}</div></div>`;
        const miniLine = k => `<svg viewBox="0 0 40 14" width="34" height="12">${(() => { const defs = []; const s = lineSvg({id: 'pv' + k, type: 'path', map: {k, label: false, w: Math.min(lineOf(k)[2], 7)}, pts: [P(3, 9), P(20, 4), P(37, 9)]}, defs, 'pv', '', 'all'); return `<defs>${defs.join('')}</defs>${s}`; })()}</svg>`;
        const miniZone = k => `<svg viewBox="0 0 30 18" width="28" height="16">${(() => { const defs = []; const s = zoneSvg({id: 'pz' + k, type: 'path', closed: true, map: {k, label: false}, pts: [P(2, 3), P(28, 2), P(27, 16), P(3, 15)]}, defs, 'pz', ''); return `<defs>${defs.join('')}</defs>${s}`; })()}</svg>`;
        const miniSym = k => `<svg viewBox="0 0 24 24" width="20" height="20">${symSvg({id: 'ps' + k, type: 'msym', map: {k, label: false}, x: 2, y: 2, w: 20, h: 20}, [], 'ps', '')}</svg>`;
        function paneHtml() {
            const m = mapDoc(), d = ed.doc(), on = !!m.on, st = m.style || 'modern';
            const years = (() => { const ys = []; const walk = arr => (arr || []).forEach(o => { const f = num(o.map?.yf ?? o.yf), t = num(o.map?.yt ?? o.yt); if (f) ys.push(f); if (t) ys.push(t); if (o.children) walk(o.children); }); walk(d.objs); return ys; })();
            const y0 = Math.min(1600, ...years), y1 = Math.max(new Date().getFullYear(), ...years);
            const ref = d.ref;
            return `<div class="vx-form vx-map">
                <label class="checkbox-line vx-mon"><input type="checkbox" data-vm="on" ${on ? 'checked' : ''}> <b>Mode Plan</b> : dessiner une carte (routes, rivières, bâtiments…)</label>
                ${on ? `<div class="vx-row"><label>Style<select data-vm="style">${Object.entries(STYLES).map(([k, s]) => `<option value="${k}" ${st === k ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}</select></label></div>
                <div class="vx-row"><button type="button" class="button small secondary" data-vm-cmd="layers" title="Relief, Eau, Végétation, Parcelles, Routes, Bâti, Limites, Noms, Généalogie, Habillage">🗂 Créer les calques d’un plan</button><label class="checkbox-line" title="Chaque objet va tout seul dans son calque (Routes, Eau, Bâti…)"><input type="checkbox" data-vm="auto" ${m.auto !== false ? 'checked' : ''}> Ranger tout seul</label></div>
                <p class="muted vx-mhelp">Choisis ce que tu dessines, puis : <b>traits et zones</b> — un clic par point, double-clic ou Entrée pour finir (les courbes se lissent toutes seules) ; <b>bâtiment</b> — glisse un rectangle ; <b>symbole, nom</b> — un clic.</p>
                ${palette(LINES.filter(l => l[3] === 'Voies'), 'mline', '🛣️ Voies', l => miniLine(l[0]))}
                ${palette(LINES.filter(l => l[3] === 'Eau'), 'mline', '〰️ Eau', l => miniLine(l[0]))}
                ${palette(ZONES, 'mzone', '▱ Zones (forêt, champ, lac, bourg…)', z => miniZone(z[0]))}
                ${palette([['building', 'Bâtiment (glisser un rectangle)'], ...SYMS.map(s => [s[0], s[1]])], 'msym', '🏠 Bâtiments et symboles', s => s[0] === 'building' ? '<svg viewBox="0 0 24 24" width="20" height="20"><rect x="3" y="6" width="18" height="12" fill="#d9cec2" stroke="#a39484"/></svg>' : miniSym(s[0]))}
                ${palette(LINES.filter(l => ['Limites', 'Relief', 'Bâti', 'Végétation'].includes(l[3])), 'mline', '┅ Limites, murs, haies, relief', l => miniLine(l[0]))}
                ${palette(LABELS, 'mlabel', '🔤 Noms de lieux', l => `<b style="font-size:${l[2] > 20 ? 13 : 11}px;${l[4] ? 'font-style:italic;' : ''}">${l[5] ? 'AB' : 'Ab'}</b>`)}
                ${palette(DECOS, 'mdeco', '🧭 Habillage', dd => ({scale: '📏', compass: '🧭', cartouche: '🏷️', legend: '📋', frame: '🖼️'}[dd[0]]))}
                <h4>⏳ Curseur du temps</h4><p class="muted vx-mhelp">Donne à un objet ses années (onglet Propriétés) : en choisissant une année, ne reste que ce qui existait alors.</p>
                <div class="vx-row"><label class="checkbox-line"><input type="checkbox" data-vm="yon" ${m.year ? 'checked' : ''}> Montrer l’année</label><b data-vm-yshow>${m.year || ''}</b></div>
                <input type="range" data-vm="year" min="${y0}" max="${y1}" value="${m.year || y1}" ${m.year ? '' : 'disabled'} style="width:100%">
                <h4>📍 Généalogie</h4><div class="vx-row"><button type="button" class="button small secondary" data-vm-cmd="places" title="${m.geo ? 'Les lieux et adresses de ta base qui tombent sur ce plan' : 'Il faut d’abord un fond de carte (situer le plan)'}">📍 Lieux de la base</button><button type="button" class="button small secondary" data-vm-cmd="links" title="Les objets reliés à une personne ou à un lieu">🔗 Objets reliés</button></div>
                <h4>📏 Échelle</h4>${m.geo ? `<p class="muted vx-mhelp">Plan situé : ${esc(m.geo.name || '')} (1 px ≈ ${String(+metersPerPx().toFixed(2)).replace('.', ',')} m).</p>` : `<label>1 pixel = … mètres<input type="number" data-vm="scale" min="0.001" step="0.1" value="${esc(m.scale || 1)}"></label>`}` : '<p class="muted">Le mode Plan ajoute des outils de carte : routes qui se raccordent, rivières, forêts, bâtiments, symboles (église, moulin, château…), noms qui suivent les rues, échelle, rose des vents, légende automatique, styles d’époque (état-major, cadastre napoléonien, Cassini…).</p>'}
                <h4>🖼️ Fond et image de référence</h4><p class="muted vx-mhelp">Une carte ou une image (cadastre ancien, photo, plan scanné) sous le dessin, en transparence, pour décalquer. Elle ne s’imprime pas, sauf si tu le veux.</p>
                <div class="vx-row"><button type="button" class="button small secondary" data-vm-cmd="basemap">🗺️ Fond de carte d’un lieu…</button><button type="button" class="button small secondary" data-vm-cmd="refimg">🖼️ Image de référence…</button></div>
                ${ref ? `<div class="vx-refbox"><label>Transparence (%) <input type="range" data-vm="refop" min="5" max="100" value="${Math.round(num(ref.op, .5) * 100)}"></label>
                    <div class="vx-row"><label class="checkbox-line"><input type="checkbox" data-vm="refshow" ${ref.show !== false ? 'checked' : ''}> Visible</label><label class="checkbox-line"><input type="checkbox" data-vm="refprint" ${ref.print ? 'checked' : ''}> Dans l’export</label><label class="checkbox-line"><input type="checkbox" data-vm="refgray" ${ref.gray ? 'checked' : ''}> En gris</label></div>
                    <label>Taille (%) <input type="range" data-vm="refscale" min="10" max="400" value="${Math.round(num(ref.k, 1) * 100)}"></label>
                    <div class="vx-row"><button type="button" class="button small secondary" data-vm-cmd="refmove" title="Glisse l’image pour la caler sous le dessin">✥ Déplacer l’image</button><button type="button" class="button small secondary" data-vm-cmd="reffit">⤢ Ajuster au plan de travail</button><button type="button" class="button small danger" data-vm-cmd="refdel">Retirer</button></div></div>` : ''}
            </div>`;
        }
        /** les réglages propres à un objet de plan, dans l'onglet Propriétés */
        function propsHtml(o) {
            if (!mapDoc().on && !o.map) return '';
            const m = o.map || {}, kinds = o.type === 'msym' ? [['building', 'Bâtiment'], ...SYMS.map(s => [s[0], s[1]])] : o.type === 'mdeco' ? DECOS.map(d => [d[0], d[1]]) : isZone(o) ? ZONES.map(z => [z[0], z[1]]) : isLine(o) ? LINES.map(l => [l[0], l[1]]) : o.type === 'text' && m.k ? LABELS.map(l => [l[0], l[1]]) : null;
            let h = '<div class="vx-mprops"><h4>🗺️ Plan</h4>';
            if (kinds) h += `<label>Genre<select data-vmp="k">${kinds.map(([k, l]) => `<option value="${k}" ${m.k === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
            if (o.map && o.type !== 'text' && o.type !== 'mdeco') h += `<label>Nom (s’écrit sur la carte)<input data-vmp="name" value="${esc(m.name || '')}" maxlength="120"></label><label class="checkbox-line"><input type="checkbox" data-vmp="label" ${m.label !== false ? 'checked' : ''}> Écrire le nom</label>`;
            if (isLine(o)) h += `<label>Largeur <input type="range" data-vmp="w" min="0.5" max="60" step="0.5" value="${W(o)}"></label><label class="checkbox-line"><input type="checkbox" data-vmp="smooth" ${m.smooth !== false ? 'checked' : ''}> Courbes lissées</label>`;
            if (o.type === 'msym') h += `<div class="vx-grid2"><label>Nom placé<select data-vmp="lpos">${[['right', 'à droite'], ['left', 'à gauche'], ['above', 'au-dessus'], ['below', 'en dessous']].map(([k, l]) => `<option value="${k}" ${(m.lpos || 'right') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label><label>Taille du nom<input type="number" data-vmp="ls" min="5" max="80" value="${esc(m.ls || 11)}"></label></div>
                <div class="vx-row"><label>Couleur<input type="color" data-vmp="fill" value="${esc(/^#[0-9a-f]{6}$/i.test(m.fill || '') ? m.fill : (m.k === 'building' ? S().building : S().symFill))}"></label><button type="button" class="button small secondary" data-vmp-reset title="Reprendre les couleurs du style">Couleur du style</button></div>`;
            if (o.type === 'mdeco' && m.k === 'cartouche') h += `<label>Titre<input data-vmp="title" value="${esc(m.title || '')}" maxlength="120"></label><label>Sous-titre<input data-vmp="sub" value="${esc(m.sub || '')}" maxlength="160"></label><label>Date, auteur<input data-vmp="date" value="${esc(m.date || '')}" maxlength="120"></label>`;
            if (o.type === 'mdeco' && m.k === 'legend') h += `<label>Titre<input data-vmp="title" value="${esc(m.title || 'Légende')}" maxlength="60"></label><p class="muted vx-mhelp">Elle montre tout seul ce qui est dessiné.</p>`;
            if (o.type === 'text' && m.k) h += `<label class="checkbox-line"><input type="checkbox" data-vmp="custom" ${m.custom ? 'checked' : ''}> Garder ma police et ma couleur (ne pas suivre le style)</label>`;
            // pour tous les objets : époque, lien, note
            h += `<div class="vx-grid2"><label>Existe depuis (année)<input type="number" data-vmp="yf" value="${esc(m.yf ?? o.yf ?? '')}" placeholder="—"></label><label>Jusqu’à (année)<input type="number" data-vmp="yt" value="${esc(m.yt ?? o.yt ?? '')}" placeholder="—"></label></div>
                <div class="vx-mlink">${m.link ? `🔗 <b>${esc(m.link.label)}</b> <button type="button" class="link-button" data-vmp-open>ouvrir</button> <button type="button" class="link-button" data-vmp-unlink>délier</button>` : '<button type="button" class="button small secondary" data-vmp-link="person">🔗 Lier à une personne</button><button type="button" class="button small secondary" data-vmp-link="place">📍 Lier à un lieu</button>'}</div>
                <label>Note (ex. « ici habitait la famille Martin de 1820 à 1870 »)<textarea data-vmp="note" rows="2" maxlength="600">${esc(m.note || '')}</textarea></label></div>`;
            return h;
        }
        function setMapProp(o, k, v, el) {
            o.map = o.map || {};
            const m = o.map;
            if (k === 'k') { m.k = v; if (o.type === 'text') styleLabel(o); if (isLine(o)) m.w = lineOf(v)?.[2] || m.w; return; }
            if (k === 'label' || k === 'smooth' || k === 'custom') { m[k] = el.checked; if (k === 'custom' && !m.custom) styleLabel(o); return; }
            if (k === 'yf' || k === 'yt') { const n = Math.round(num(v, 0)); if (n) m[k] = clamp(n, -3000, 3000); else delete m[k]; delete o[k]; return; }
            if (k === 'w' || k === 'ls') { m[k] = clamp(num(v, 4), 0.3, 200); return; }
            if (k === 'fill') { m.fill = /^#[0-9a-f]{6}$/i.test(v) ? v : undefined; return; }
            m[k] = String(v).slice(0, k === 'note' ? 600 : 160);
        }
        /* les fenêtres */
        async function linkDialog(o, what) {
            ext.openDialog({eyebrow: 'PLAN', title: what === 'person' ? 'Lier à une personne' : 'Lier à un lieu', submitLabel: 'Lier',
                body: `<label>${what === 'person' ? 'Personne' : 'Lieu'}<input type="search" data-q placeholder="${what === 'person' ? 'Nom, prénom…' : 'Commune, lieu…'}" autocomplete="off"></label><div data-res class="vx-pres"></div>`,
                onOpen: dg => { const q = dg.querySelector('[data-q]'), res = dg.querySelector('[data-res]'); let t = 0; q.focus();
                    q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(async () => {
                        const rows = what === 'person' ? ((await api('search', {type: 'persons', q: q.value.trim(), limit: 12}).catch(() => ({data: []}))).data || []).map(p => ({id: Number(p.id), label: A().personName(p)}))
                            : ((await api('board_place_search', {q: q.value.trim()}).catch(() => ({places: []}))).places || []).map(p => ({id: Number(p.id) || 0, label: p.name + (p.detail ? ` (${p.detail})` : ''), lat: p.lat, lon: p.lon}));
                        res.innerHTML = rows.map((r, i) => `<label class="checkbox-line"><input type="radio" name="pick" value="${i}"> ${esc(r.label)}</label>`).join('') || '<p class="muted">Rien trouvé.</p>'; res._rows = rows; }, 220); }); },
                onSubmit: f => { const i = f.querySelector('[name=pick]:checked')?.value, r = f.querySelector('[data-res]')._rows?.[Number(i)]; if (!r) { toast('Choisis dans la liste.', 'error'); return false; }
                    o.map = o.map || {}; o.map.link = {type: what, id: r.id, label: String(r.label).slice(0, 120), ...(r.lat ? {lat: r.lat, lon: r.lon} : {})}; if (!o.map.name && what === 'place' && o.type !== 'text') o.map.name = String(r.label).replace(/ \(.*\)$/, ''); ed.commit('Lien ajouté'); }});
        }
        function openLink(m) { if (!m?.link) return; if (m.link.type === 'person' && m.link.id) { ed.close?.(); A().openPersonById?.(m.link.id); } else toast(`${m.link.label}${m.link.lat ? ` (${num(m.link.lat).toFixed(4)}, ${num(m.link.lon).toFixed(4)})` : ''}`); }
        function linksDialog() {
            const rows = []; const walk = arr => (arr || []).forEach(o => { if (o.map?.link || o.map?.note) rows.push(o); if (o.children) walk(o.children); }); walk(ed.doc().objs);
            ext.openDialog({eyebrow: 'PLAN', title: 'Objets reliés à la famille', submitLabel: 'Fermer',
                body: rows.length ? `<ul class="vx-mlinks">${rows.map((o, i) => `<li><b>${esc(o.map.name || o.text || o.name || 'Objet')}</b>${o.map.link ? ` → ${esc(o.map.link.label)}` : ''}${o.map.note ? `<br><small>${esc(o.map.note)}</small>` : ''}<span><button type="button" class="link-button" data-vm-go="${i}">montrer</button>${o.map.link?.type === 'person' ? ` · <button type="button" class="link-button" data-vm-open="${i}">ouvrir la fiche</button>` : ''}</span></li>`).join('')}</ul>` : '<p class="muted">Aucun objet n’est encore relié. Choisis un objet, puis dans Propriétés : « 🔗 Lier à une personne » ou « 📍 Lier à un lieu ».</p>',
                onOpen: dg => dg.addEventListener('click', e => { const g = e.target.closest('[data-vm-go]'), op = e.target.closest('[data-vm-open]'); if (g) { ed.reveal(rows[Number(g.dataset.vmGo)].id); dg.querySelector('[data-dialog-close],[value=cancel]')?.click(); dg.close?.(); } if (op) openLink(rows[Number(op.dataset.vmOpen)].map); }),
                onSubmit: () => {}});
        }
        /* ─── fond de carte : un lieu, un rayon, un fond → une image de référence calée, et le plan est « situé » ─── */
        const mercY = lat => { const r = clamp(lat, -85, 85) * Math.PI / 180; return Math.log(Math.tan(Math.PI / 4 + r / 2)); };
        const latOfY = y => (2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180 / Math.PI;
        function basemapDialog() {
            const d = ed.doc();
            ext.openDialog({eyebrow: 'PLAN', title: 'Fond de carte d’un lieu', submitLabel: 'Poser le fond',
                body: `<p class="muted">La carte du lieu est posée sous le dessin, en transparence, à la taille du plan de travail : décalque les rues, les rivières, les maisons. Le plan est alors « situé » : l’échelle est juste et les lieux de ta base peuvent s’y placer.</p>
                    <label>Lieu<input type="search" data-q placeholder="Commune, village…" autocomplete="off" value="${esc(d.map?.geo?.name || '')}"></label><div data-res class="vx-pres"></div>
                    <div class="vx-grid2"><label>Largeur couverte<select name="km">${[[0.3, '300 m (un quartier)'], [0.6, '600 m'], [1, '1 km (un bourg)'], [2, '2 km'], [4, '4 km (une commune)'], [8, '8 km'], [15, '15 km (un canton)'], [30, '30 km'], [80, '80 km (un pays)'], [250, '250 km (une région)']].map(([v, l]) => `<option value="${v}" ${v === 2 ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
                    <label>Fond<select name="bg"><option value="offline">Hors ligne (contours des communes)</option>${A().mapBackgroundSelectHtml ? A().mapBackgroundSelectHtml('osm') : '<option value="osm">OpenStreetMap</option>'}</select></label></div>
                    <label>Transparence (%)<input type="range" name="op" min="10" max="100" value="55"></label>`,
                onOpen: dg => { const q = dg.querySelector('[data-q]'), res = dg.querySelector('[data-res]'); let t = 0; q.focus();
                    const go = async () => { const rows = ((await api('board_place_search', {q: q.value.trim()}).catch(() => ({places: []}))).places || []).filter(p => p.lat || p.lon);
                        res.innerHTML = rows.map((r, i) => `<label class="checkbox-line"><input type="radio" name="pick" value="${i}" ${i === 0 ? 'checked' : ''}> ${esc(r.name)} <small class="muted">${esc(r.detail || '')}</small></label>`).join('') || '<p class="muted">Rien trouvé (il faut un lieu avec des coordonnées).</p>'; res._rows = rows; };
                    q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(go, 250); }); if (q.value.trim().length > 1) go(); },
                onSubmit: async f => {
                    const r = f.querySelector('[data-res]')._rows?.[Number(f.querySelector('[name=pick]:checked')?.value)]; if (!r) { toast('Choisis un lieu dans la liste.', 'error'); return false; }
                    const km = num(f.querySelector('[name=km]').value, 2), bg = f.querySelector('[name=bg]').value, op = num(f.querySelector('[name=op]').value, 55) / 100;
                    // emprise : la largeur demandée, la hauteur selon les proportions du plan de travail (en Mercator, comme les tuiles)
                    const lat = num(r.lat), lon = num(r.lon), dLon = km / (111.32 * Math.cos(lat * Math.PI / 180)), x0 = (lon - dLon / 2 + 180) / 360, x1 = (lon + dLon / 2 + 180) / 360;
                    const yc = (1 - mercY(lat) / Math.PI) / 2, hy = (x1 - x0) * d.h / d.w, y0 = yc - hy / 2, y1 = yc + hy / 2;
                    const geo = {n: latOfY((1 - 2 * y0) * Math.PI), s: latOfY((1 - 2 * y1) * Math.PI), w: lon - dLon / 2, e: lon + dLon / 2, lat, lon, name: r.name, place_id: Number(r.id) || 0};
                    toast('Chargement de la carte…');
                    let src;
                    try { src = await stitch(bg, x0, x1, y0, y1, d.w, d.h); }
                    catch (_) { try { src = await stitch('offline', x0, x1, y0, y1, d.w, d.h); toast('Le fond choisi n’a pas pu être lu : fond hors ligne à la place.'); } catch (e2) { toast('Carte impossible à charger.', 'error'); return false; } }
                    const m = mapDoc(); m.on = true; m.geo = geo; d.ref = {src, x: 0, y: 0, w: d.w, h: d.h, k: 1, op, show: true, print: false, gray: false};
                    ed.commit('Fond de carte'); ed.paint();
                }});
        }
        /** assemble les tuiles qui couvrent [x0, x1] × [y0, y1] (coordonnées 0..1 du monde) en une image W × H */
        async function stitch(bg, x0, x1, y0, y1, W2, H2) {
            const outW = Math.min(2400, Math.max(600, W2 * 1.5)), z = clamp(Math.round(Math.log2(outW / ((x1 - x0) * 256))), 2, 18), n = 2 ** z, tx0 = Math.floor(x0 * n), tx1 = Math.floor(x1 * n), ty0 = Math.floor(y0 * n), ty1 = Math.floor(y1 * n);
            if ((tx1 - tx0 + 1) * (ty1 - ty0 + 1) > 120) throw new Error('trop de tuiles');
            const pxW = (x1 - x0) * n * 256, pxH = (y1 - y0) * n * 256, c = document.createElement('canvas'); c.width = Math.round(pxW); c.height = Math.round(pxH);
            const g = c.getContext('2d'); g.fillStyle = '#f2efe9'; g.fillRect(0, 0, c.width, c.height);
            const url = (tx, ty) => bg === 'offline' ? A().offlineTileUrl(z, tx, ty) : (A().mapTileUrl ? A().mapTileUrl(bg, z, tx, ty) : `https://tile.openstreetmap.org/${z}/${tx}/${ty}.png`);
            let ok = 0;
            await Promise.all([...Array(tx1 - tx0 + 1)].flatMap((_, i) => [...Array(ty1 - ty0 + 1)].map(async (__, j) => {
                const tx = tx0 + i, ty = ty0 + j; if (ty < 0 || ty >= n) return;
                const img = await new Promise(res => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => res(im); im.onerror = () => res(null); im.src = url(((tx % n) + n) % n, ty); });
                if (img) { g.drawImage(img, (tx - x0 * n) * 256, (ty - y0 * n) * 256, 256, 256); ok++; } })));
            if (!ok) throw new Error('aucune tuile');
            const out = document.createElement('canvas'); out.width = Math.round(Math.min(2400, W2 * 1.5)); out.height = Math.round(out.width * H2 / W2); out.getContext('2d').drawImage(c, 0, 0, out.width, out.height);
            return out.toDataURL('image/jpeg', .85); // lève une erreur si une tuile n'autorise pas la copie (on retombe alors sur le fond hors ligne)
        }
        /* ─── image de référence quelconque : un fichier ou une photo de la base ─── */
        function refImageDialog() {
            const d = ed.doc();
            ext.openDialog({eyebrow: 'PLAN', title: 'Image de référence', submitLabel: 'Poser l’image',
                body: `<p class="muted">Un cadastre ancien, une photo aérienne, un plan scanné, un croquis… posé sous le dessin, en transparence, pour dessiner par-dessus. Il ne s’exporte pas (sauf si tu le demandes).</p>
                    <label>Fichier de l’ordinateur<input type="file" name="f" accept="image/*"></label><p class="muted">ou une image de la base :</p><label>Chercher dans les médias<input type="search" data-mq placeholder="Titre, nom de fichier…" autocomplete="off"></label><div data-mres class="vx-mmedia"></div>
                    <label>Transparence (%)<input type="range" name="op" min="10" max="100" value="50"></label>`,
                onOpen: dg => { const q = dg.querySelector('[data-mq]'), res = dg.querySelector('[data-mres]'); let t = 0;
                    q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(async () => { const rows = ((await api('list', {type: 'media', q: q.value.trim(), limit: 24}).catch(() => ({data: []}))).data || []).filter(m => /\.(jpe?g|png|webp|gif)$/i.test(m.filename || ''));
                        res.innerHTML = rows.map(m => `<label title="${esc(m.title || m.filename)}"><input type="radio" name="mpick" value="${esc('media/' + m.filename)}"><img src="${esc('media/' + m.filename)}" alt="" loading="lazy"></label>`).join('') || '<p class="muted">Rien trouvé.</p>'; }, 250); }); },
                onSubmit: async f => {
                    const file = f.querySelector('[name=f]').files?.[0], media = f.querySelector('[name=mpick]:checked')?.value, op = num(f.querySelector('[name=op]').value, 50) / 100;
                    let src = '';
                    try { if (file) src = await ed.normImage(await new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = ko; r.readAsDataURL(file); }), file.type); else if (media) src = await ed.normImage(await ed.toDataUrl(media)); }
                    catch (e) { toast(e.message || 'Image illisible.', 'error'); return false; }
                    if (!src) { toast('Choisis un fichier ou une image.', 'error'); return false; }
                    const im = await new Promise(ok => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; }); if (!im) { toast('Image illisible.', 'error'); return false; }
                    const k = Math.min(d.w / im.naturalWidth, d.h / im.naturalHeight);
                    d.ref = {src, x: (d.w - im.naturalWidth * k) / 2, y: (d.h - im.naturalHeight * k) / 2, w: im.naturalWidth * k, h: im.naturalHeight * k, k: 1, op, show: true, print: false, gray: false};
                    ed.commit('Image de référence'); ed.paint();
                }});
        }
        /* ─── lieux de la base qui tombent sur le plan ─── */
        async function placesDialog() {
            const d = ed.doc(), g = mapDoc().geo; if (!g) { toast('Situe d’abord le plan : « 🗺️ Fond de carte d’un lieu ».', 'error'); return; }
            let r; try { r = await api('vector_map_places', {n: g.n, s: g.s, w: g.w, e: g.e}); } catch (e) { return toast(e.message, 'error'); }
            const rows = [...(r.places || []).map(p => ({...p, kind: 'place'})), ...(r.addresses || []).map(p => ({...p, kind: 'address'}))];
            if (!rows.length) return toast('Aucun lieu de ta base n’a de coordonnées dans ce cadre.', 'error');
            const proj = (lat, lon) => [(lon - g.w) / (g.e - g.w) * d.w, (mercY(g.n) - mercY(lat)) / (mercY(g.n) - mercY(g.s)) * d.h];
            ext.openDialog({eyebrow: 'PLAN', title: 'Lieux de la base sur ce plan', submitLabel: 'Poser sur le plan',
                body: `<p class="muted">Chaque lieu devient un symbole à sa place, avec son nom, relié à la base (onglet Propriétés pour le changer).</p>
                    <label>Symbole<select name="sym">${[['pin', 'Repère (famille)'], ['house', 'Maison'], ['dot_village', 'Village (rond)'], ['church', 'Église'], ['star', 'Lieu important']].map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
                    <div class="vx-mplaces">${rows.map((p, i) => `<label class="checkbox-line"><input type="checkbox" name="p" value="${i}" checked> ${p.kind === 'address' ? '🏠' : '📍'} ${esc(p.label)} ${p.detail ? `<small class="muted">${esc(p.detail)}</small>` : ''}</label>`).join('')}</div>`,
                onSubmit: f => { const sym = f.querySelector('[name=sym]').value, pick = [...f.querySelectorAll('[name=p]:checked')].map(x => rows[Number(x.value)]); if (!pick.length) return;
                    const made = pick.map(p => { const [x, y] = proj(num(p.lat), num(p.lon)), s = p.kind === 'address' ? 16 : 20;
                        return {id: ed.uid(), type: 'msym', name: p.label.slice(0, 40), x: x - s / 2, y: sym === 'pin' ? y - s : y - s / 2, w: s, h: s, map: {k: p.kind === 'address' ? (sym === 'pin' ? 'pin' : 'house') : sym, name: p.label.slice(0, 80), label: true, lpos: 'right', ls: 11, note: p.note || '', link: p.kind === 'place' ? {type: 'place', id: Number(p.id) || 0, label: p.label, lat: p.lat, lon: p.lon} : (p.person_id ? {type: 'person', id: Number(p.person_id), label: p.person || p.label} : undefined), ...(p.year ? {yf: Number(p.year)} : {})}}; });
                    ed.place(made, 'genealogie'); ed.commit(`${made.length} lieu${made.length > 1 ? 'x' : ''} posé${made.length > 1 ? 's' : ''}`); }});
        }
        function makeLayers() {
            const d = ed.doc(); let n = 0;
            LAYERS.forEach(([key, label]) => { if (d.objs.some(o => o.layer && o.mapLayer === key)) return; d.objs.push({id: ed.uid(), type: 'group', layer: true, mapLayer: key, name: label, children: []}); n++; });
            // dans l'ordre du plan (du bas vers le haut), les calques à soi restent au-dessus
            const order = LAYERS.map(l => l[0]); d.objs.sort((a, b) => (a.mapLayer ? order.indexOf(a.mapLayer) : 99) - (b.mapLayer ? order.indexOf(b.mapLayer) : 99));
            mapDoc().on = true; ed.commit(n ? `${n} calques de plan créés` : 'Calques déjà là');
        }
        function onPaneEvent(e) {
            const el = e.target;
            if (e.type === 'click') {
                const p = el.closest('[data-vm-pick]'); if (p) { const [tool, kind] = p.dataset.vmPick.split(':'); pick = {tool, kind}; ed.setTool(tool); ed.paint(); return true; }
                const c = el.closest('[data-vm-cmd]'); if (c) { const k = c.dataset.vmCmd;
                    if (k === 'layers') makeLayers(); if (k === 'basemap') basemapDialog(); if (k === 'refimg') refImageDialog(); if (k === 'places') placesDialog(); if (k === 'links') linksDialog();
                    if (k === 'refmove') { ed.setTool('mref'); toast('Glisse l’image de référence pour la caler (Échap ou V pour finir).'); }
                    if (k === 'reffit') { const d = ed.doc(); if (d.ref) { Object.assign(d.ref, {x: 0, y: 0, w: d.w, h: d.h, k: 1}); ed.commit('Image ajustée'); } }
                    if (k === 'refdel') { const d = ed.doc(); delete d.ref; ed.commit('Image de référence retirée'); }
                    return true; }
                const o = ed.selObjs()[0];
                if (o && el.closest('[data-vmp-link]')) { linkDialog(o, el.closest('[data-vmp-link]').dataset.vmpLink); return true; }
                if (o && el.closest('[data-vmp-unlink]')) { delete o.map.link; ed.commit('Lien retiré'); return true; }
                if (o && el.closest('[data-vmp-open]')) { openLink(o.map); return true; }
                if (o && el.closest('[data-vmp-reset]')) { delete o.map.fill; delete o.map.ink; ed.commit('Couleur du style'); return true; }
                return false;
            }
            const vm = el.dataset.vm, vmp = el.dataset.vmp;
            if (vm) { const m = mapDoc(), d = ed.doc(), final = e.type === 'change';
                if (vm === 'on') { m.on = el.checked; ed.commit(m.on ? 'Mode Plan' : 'Mode Plan désactivé'); ed.paint(); return true; }
                if (vm === 'style' && final) { m.style = el.value; if (confirm('Prendre aussi la couleur de papier de ce style pour le fond ?')) d.bg = STYLES[m.style].paper; restyleAll(); ed.commit('Style du plan'); return true; }
                if (vm === 'auto') { m.auto = el.checked; ed.commit('Rangement'); return true; }
                if (vm === 'yon') { m.year = el.checked ? Number(ed.pane.querySelector('[data-vm="year"]').value) : null; ed.commit(m.year ? `Année ${m.year}` : 'Toutes les époques'); ed.paint(); return true; }
                if (vm === 'year') { m.year = Number(el.value); const s = ed.pane.querySelector('[data-vm-yshow]'); if (s) s.textContent = m.year; ed.redraw(); if (final) ed.commit(`Année ${m.year}`); return true; }
                if (vm === 'scale') { m.scale = clamp(num(el.value, 1), 0.001, 1e6); ed.redraw(); if (final) ed.commit('Échelle'); return true; }
                if (d.ref && ['refop', 'refshow', 'refprint', 'refgray', 'refscale'].includes(vm)) {
                    if (vm === 'refop') d.ref.op = clamp(num(el.value) / 100, .05, 1);
                    if (vm === 'refshow') d.ref.show = el.checked; if (vm === 'refprint') d.ref.print = el.checked; if (vm === 'refgray') d.ref.gray = el.checked;
                    if (vm === 'refscale') { const k = clamp(num(el.value) / 100, .1, 4), cx = d.ref.x + d.ref.w / 2, cy = d.ref.y + d.ref.h / 2, k0 = num(d.ref.k, 1); d.ref.w = d.ref.w / k0 * k; d.ref.h = d.ref.h / k0 * k; d.ref.x = cx - d.ref.w / 2; d.ref.y = cy - d.ref.h / 2; d.ref.k = k; }
                    ed.redraw(); if (final || el.type === 'checkbox') ed.commit('Image de référence'); return true; }
                return false;
            }
            if (vmp) { const list = ed.selObjs().filter(o => !o.locked); if (!list.length) return true;
                list.forEach(o => setMapProp(o, vmp, el.type === 'checkbox' ? el.checked : el.value, el));
                if (e.type === 'change' || el.type === 'checkbox' || el.tagName === 'SELECT') ed.commit('Plan : réglage'); else ed.redraw();
                return true; }
            return false;
        }
        function restyleAll() { const walk = arr => (arr || []).forEach(o => { if (o.type === 'text' && o.map?.k) styleLabel(o); if (o.children) walk(o.children); }); walk(ed.doc().objs); }
        /** un nouvel objet de plan, selon ce qui est choisi dans la palette */
        function newObj(kind, x0, y0, x1, y1) {
            const k = pick.kind, st = S();
            if (kind === 'msym') {
                if (k === 'building') { const x = Math.min(x0, x1), y = Math.min(y0, y1), w = Math.abs(x1 - x0), h = Math.abs(y1 - y0); if (w < 2 || h < 2) return null; return {id: ed.uid(), type: 'msym', name: 'Bâtiment', x, y, w, h, map: {k: 'building'}}; }
                const s = ['dot_hamlet', 'dot_village'].includes(k) ? 14 : k === 'dot_city' ? 20 : 26; return {id: ed.uid(), type: 'msym', name: symOf(k)?.[1] || 'Symbole', x: x0 - s / 2, y: y0 - s / 2, w: s, h: s, map: {k, label: true, lpos: 'right', ls: 11}};
            }
            if (kind === 'mlabel') { const L = labelOf(k) || LABELS[2]; return styleLabel({id: ed.uid(), type: 'text', name: L[1], text: L[5] ? 'NOM' : 'Nom', x: x0, y: y0, size: L[2], align: 'middle', map: {k}}); }
            if (kind === 'mdeco') { const D = decoOf(k); if (k === 'frame') return {id: ed.uid(), type: 'mdeco', name: D[1], x: 0, y: 0, w: ed.doc().w, h: ed.doc().h, locked: true, map: {k}};
                return {id: ed.uid(), type: 'mdeco', name: D[1], x: x0 - D[2] / 2, y: y0 - D[3] / 2, w: D[2], h: D[3], map: {k, ...(k === 'cartouche' ? {title: ed.name() || 'Plan', sub: mapDoc().geo?.name || '', date: String(new Date().getFullYear())} : {})}}; }
            void st; return null;
        }
        /** un trait ou une zone qui commence (outil plume du plan) */
        const newPen = tool => ({id: ed.uid(), type: 'path', name: (tool === 'mzone' ? zoneOf(pick.kind) : lineOf(pick.kind))?.[1]?.replace(/ \(.*\)$/, '') || 'Tracé', pts: [], closed: false, fill: 'none', stroke: 'none', sw: 0, map: {k: pick.kind, ...(tool === 'mline' ? {w: lineOf(pick.kind)?.[2]} : {})}});
        const layerOf = o => { const k = o.map?.k; if (o.type === 'text') return 'noms'; if (o.type === 'mdeco') return 'habillage'; if (o.type === 'msym') return ['pin', 'star'].includes(k) ? 'genealogie' : 'bati'; return (lineOf(k)?.[4]) || (zoneOf(k)?.[3]) || null; };
        const DEFAULT = {mline: 'road', mzone: 'forest', msym: 'house', mlabel: 'village', mdeco: 'scale'};
        /** un outil de plan choisi dans la colonne de gauche : garde le genre déjà choisi pour cet outil */
        const choose = tool => { if (pick.tool !== tool && DEFAULT[tool]) pick = {tool, kind: DEFAULT[tool]}; };
        return {paneHtml, propsHtml, onPaneEvent, newObj, newPen, layerOf, choose, pick: () => pick, basemap: basemapDialog, refimg: refImageDialog, places: placesDialog, layers: makeLayers, links: linksDialog,
            hint: tool => ({mline: `${lineOf(pick.kind)?.[1] || 'Trait'} : un clic par point (glisser : courbe à la main) · double-clic ou Entrée pour finir · les courbes se lissent toutes seules`, mzone: `${zoneOf(pick.kind)?.[1] || 'Zone'} : un clic par coin · clic sur le 1er point, double-clic ou Entrée pour fermer`, msym: pick.kind === 'building' ? 'Bâtiment : glisse un rectangle (⇧ : carré) ; tourne-le ensuite avec la Sélection' : `${symOf(pick.kind)?.[1] || 'Symbole'} : un clic pour le poser`, mlabel: 'Nom de lieu : un clic pour le poser, puis écris-le dans Propriétés', mdeco: 'Habillage : un clic pour le poser', mref: 'Glisse l’image de référence pour la caler sous le dessin'}[tool] || '')};
    }

    ext.vectorMap = {ctx, svg, inTime, isLine, isZone, styleLabel, attach, STYLES, LINES, ZONES, SYMS, LABELS, DECOS, LAYERS, legendKinds};
})();
