/* LCNDA — 🏠 Plan de maison (comme un logiciel d'architecte, en plus simple) : des étages, des murs tracés au clic (aimantés à
 * la grille, aux coins et aux angles), des pièces dessinées d'un coup (murs compris) avec leur surface, des portes et des
 * fenêtres posées sur les murs, des cotes, du mobilier (plus de 50 objets d'hier et d'aujourd'hui, et ses propres objets :
 * image vue de dessus, ou fichier 3D OBJ, STL, glTF, GLB), des textures de murs et de sols, un plan scanné à calquer,
 * et la vue en 3D (heritage-house3d.js) avec toit. La maison est reliée à un lieu, à ses habitants, et chaque pièce peut
 * garder ses souvenirs (« la chambre où est née… »). Serveur : lib/houses.php.
 * Listes → « 🏠 Maisons de famille », ou Listes → Outils de modification → « 🏠 Plan de maison ».
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const api = (...a) => A().api(...a);
    const post = (action, body) => api(action, {}, {method: 'POST', body});
    const toast = (...a) => A().toast(...a);
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const r1 = v => Math.round(v * 10) / 10;
    let seq = 0; const uid = p => p + Date.now().toString(36) + (++seq).toString(36);
    const fmtLen = cm => cm >= 100 ? `${(Math.round(cm) / 100).toFixed(2).replace('.', ',')} m` : `${String(r1(cm)).replace('.', ',')} cm`;
    /** « 350 », « 3,5 m », « 35 mm » → centimètres */
    const parseLen = s => { const m = String(s ?? '').trim().toLowerCase().replace(',', '.').match(/^(\d+(?:\.\d+)?)\s*(m|cm|mm)?$/); if (!m) return NaN; const v = Number(m[1]); return m[2] === 'm' ? v * 100 : m[2] === 'mm' ? v / 10 : v; };
    /* les aimants (gardés pour toutes les maisons) */
    const SNAP_KEY = 'genealogie-house-snap', SNAP0 = {grid: true, corner: true, mid: true, wall: true, angle: true, align: true, step: 45};
    const snapPrefs = () => { try { return {...SNAP0, ...(JSON.parse(localStorage.getItem(SNAP_KEY) || '{}') || {})}; } catch (_) { return {...SNAP0}; } };

    /* ═════════ Matériaux et mobilier ═════════ */
    const WALL_MATS = [['platre', 'Plâtre blanc', '#f2efe8'], ['chaux', 'Enduit à la chaux', '#e9e1cf'], ['pierre', 'Pierre apparente', '#b9ac97'], ['brique', 'Brique', '#a9583e'], ['colombage', 'Colombage (pans de bois)', '#efe6cf'],
        ['lambris', 'Lambris de bois', '#b88a5a'], ['papier', 'Papier peint', '#c9b6a0'], ['carrelage', 'Carrelage', '#e6e9ea'], ['beton', 'Béton', '#a7a7a7'], ['torchis', 'Torchis', '#c9ad84']];
    const FLOOR_MATS = [['parquet', 'Parquet', '#b98b5c'], ['point', 'Parquet à bâtons rompus', '#a87b4d'], ['tomettes', 'Tomettes', '#b4553a'], ['carreaux', 'Carreaux de ciment', '#d9d2c4'], ['damier', 'Damier noir et blanc', '#dddddd'],
        ['dalles', 'Dalles de pierre', '#a9a296'], ['terre', 'Terre battue', '#8a6a4a'], ['tapis', 'Moquette, tapis', '#7a8fa6'], ['beton', 'Béton', '#9c9c9c'], ['herbe', 'Herbe (extérieur)', '#7aa35a'], ['gravier', 'Gravier, cour', '#c2b8a3']];
    // [clé, nom, catégorie, largeur, profondeur, hauteur (cm), couleur, forme vue de dessus]
    const LIB = [
        ['lit1', 'Lit d’une personne', 'Chambre', 90, 190, 50, '#d9cbb3', 'bed1'], ['lit2', 'Lit double', 'Chambre', 140, 190, 55, '#d9cbb3', 'bed2'], ['litclos', 'Lit clos (breton)', 'Chambre', 150, 180, 200, '#7a4f2a', 'litclos'],
        ['berceau', 'Berceau', 'Chambre', 50, 90, 90, '#c9a77a', 'bed1'], ['litenfant', 'Lit d’enfant', 'Chambre', 70, 140, 80, '#c9a77a', 'bed1'], ['chevet', 'Table de chevet', 'Chambre', 45, 40, 55, '#8a5a32', 'box'],
        ['commode', 'Commode', 'Chambre', 110, 50, 85, '#8a5a32', 'drawers'], ['coiffeuse', 'Coiffeuse', 'Chambre', 100, 45, 140, '#9a6a3a', 'box'], ['prieDieu', 'Prie-Dieu', 'Chambre', 50, 60, 85, '#6a4026', 'chair'],
        ['tablerect', 'Table', 'Séjour', 160, 90, 75, '#8a5a32', 'table'], ['tableronde', 'Table ronde', 'Séjour', 110, 110, 75, '#8a5a32', 'round'], ['chaise', 'Chaise', 'Séjour', 45, 45, 90, '#7a4f2a', 'chair'],
        ['fauteuil', 'Fauteuil', 'Séjour', 80, 80, 90, '#8b3a3a', 'armchair'], ['canape', 'Canapé', 'Séjour', 200, 90, 80, '#5f6f8a', 'sofa'], ['banc', 'Banc', 'Séjour', 150, 35, 45, '#7a4f2a', 'box'],
        ['buffet', 'Buffet', 'Séjour', 150, 50, 95, '#7a4f2a', 'cabinet'], ['vaisselier', 'Vaisselier', 'Séjour', 140, 50, 200, '#7a4f2a', 'cabinet'], ['horloge', 'Horloge comtoise', 'Séjour', 45, 30, 220, '#6a4026', 'clock'],
        ['piano', 'Piano droit', 'Séjour', 150, 60, 130, '#2b211b', 'piano'], ['bibli', 'Bibliothèque', 'Séjour', 100, 35, 200, '#7a4f2a', 'shelves'], ['bureau', 'Bureau', 'Séjour', 120, 60, 75, '#7a4f2a', 'desk'],
        ['cheminee', 'Cheminée', 'Séjour', 150, 50, 120, '#bfb4a3', 'fireplace'], ['poele', 'Poêle à bois', 'Séjour', 60, 60, 80, '#2f2f2f', 'stove'], ['tapis', 'Tapis', 'Séjour', 200, 140, 1, '#8a3a3a', 'rug'],
        ['lampe', 'Lampadaire', 'Séjour', 40, 40, 160, '#d9c27a', 'roundsmall'], ['plante', 'Plante', 'Séjour', 50, 50, 120, '#5f8a3a', 'plant'], ['radio', 'Poste de radio (TSF)', 'Séjour', 50, 30, 40, '#6a4026', 'box'],
        ['cuisiniere', 'Cuisinière à bois', 'Cuisine', 100, 65, 85, '#3a3a3a', 'range'], ['evier', 'Évier en pierre', 'Cuisine', 100, 55, 85, '#bdb5a6', 'sink'], ['petrin', 'Pétrin', 'Cuisine', 140, 60, 80, '#8a5a32', 'box'],
        ['garde', 'Garde-manger', 'Cuisine', 70, 45, 160, '#9a6a3a', 'cabinet'], ['frigo', 'Réfrigérateur', 'Cuisine', 60, 65, 180, '#eeeeee', 'box'], ['plan', 'Plan de travail', 'Cuisine', 180, 60, 90, '#cfc6b3', 'box'],
        ['baignoire', 'Baignoire', 'Salle d’eau', 170, 75, 55, '#f4f4f4', 'bath'], ['douche', 'Douche', 'Salle d’eau', 90, 90, 200, '#e6eef2', 'shower'], ['wc', 'WC', 'Salle d’eau', 40, 65, 80, '#f4f4f4', 'wc'],
        ['lavabo', 'Lavabo', 'Salle d’eau', 60, 45, 85, '#f4f4f4', 'basin'], ['broc', 'Table de toilette (broc et cuvette)', 'Salle d’eau', 80, 45, 80, '#9a6a3a', 'basin'],
        ['armoire', 'Armoire', 'Rangement', 120, 60, 200, '#7a4f2a', 'wardrobe'], ['coffre', 'Coffre', 'Rangement', 100, 50, 50, '#6a4026', 'chest'], ['etagere', 'Étagère', 'Rangement', 100, 30, 180, '#9a6a3a', 'shelves'],
        ['rouet', 'Rouet', 'Métiers, ferme', 70, 50, 90, '#8a5a32', 'wheel'], ['metier', 'Métier à tisser', 'Métiers, ferme', 180, 150, 180, '#7a4f2a', 'loom'], ['etabli', 'Établi', 'Métiers, ferme', 200, 70, 90, '#9a6a3a', 'desk'],
        ['tonneau', 'Tonneau', 'Métiers, ferme', 70, 70, 100, '#8a5a32', 'barrel'], ['machine', 'Machine à coudre', 'Métiers, ferme', 80, 45, 80, '#2b2b2b', 'desk'], ['enclume', 'Enclume', 'Métiers, ferme', 70, 30, 80, '#3a3a3a', 'box'],
        ['mangeoire', 'Mangeoire, crèche', 'Métiers, ferme', 200, 60, 80, '#8a6a4a', 'box'], ['charrette', 'Charrette', 'Métiers, ferme', 300, 150, 150, '#8a6a4a', 'cart'], ['puits', 'Puits', 'Extérieur', 120, 120, 100, '#a9a296', 'well'],
        ['arbre', 'Arbre', 'Extérieur', 300, 300, 600, '#4f7a2f', 'tree'], ['voiture', 'Voiture', 'Extérieur', 420, 180, 150, '#5f6f8a', 'car'], ['bancjardin', 'Banc de jardin', 'Extérieur', 150, 50, 80, '#6a8a4a', 'box'],
        ['escalier', 'Escalier droit', 'Structure', 90, 300, 280, '#9a7a5a', 'stairs'], ['escaliert', 'Escalier tournant', 'Structure', 200, 200, 280, '#9a7a5a', 'stairsL'], ['poteau', 'Poteau, pilier', 'Structure', 30, 30, 280, '#9a8a7a', 'box'],
        ['cloison', 'Placard', 'Structure', 120, 60, 240, '#d9d2c4', 'wardrobe']];
    const libOf = k => LIB.find(l => l[0] === k);
    ext.houseLib = {LIB, WALL_MATS, FLOOR_MATS, libOf};

    /** le dessin vu de dessus d'un meuble, centré en (0, 0), dans une boîte w × d */
    function sym2d(item) {
        const L = libOf(item.kind), w = item.w, d = item.d, c = item.color || L?.[6] || '#9a8a7a', k = item.img ? 'img' : item.model ? 'model' : L?.[7] || 'box', S = 'stroke="#3a3530" stroke-width="1.6" vector-effect="non-scaling-stroke"';
        const R = (x, y, ww, hh, f = c, ex = '') => `<rect x="${x}" y="${y}" width="${ww}" height="${hh}" fill="${f}" ${S} ${ex}/>`;
        const x0 = -w / 2, y0 = -d / 2;
        switch (k) {
            case 'img': return `<image href="${esc(item.img)}" x="${x0}" y="${y0}" width="${w}" height="${d}" preserveAspectRatio="none"/>${R(x0, y0, w, d, 'none')}`;
            case 'bed1': case 'bed2': { const pw = k === 'bed2' ? w / 2 - 6 : w - 12; return R(x0, y0, w, d) + R(x0 + 6, y0 + 6, pw, 22, '#fff') + (k === 'bed2' ? R(6, y0 + 6, pw, 22, '#fff') : '') + `<path d="M${x0} ${y0 + d * .38}L${w / 2} ${y0 + d * .38}" ${S} fill="none"/>`; }
            case 'litclos': return R(x0, y0, w, d) + R(x0 + 8, y0 + d * .2, w - 16, d * .6, '#e9dcc3') + `<path d="M0 ${y0}V${y0 + d}" ${S}/>`;
            case 'table': case 'desk': return R(x0, y0, w, d) + (k === 'desk' ? R(x0 + w * .62, y0 + 4, w * .34, d - 8, 'none') : '');
            case 'round': case 'roundsmall': case 'barrel': return `<ellipse rx="${w / 2}" ry="${d / 2}" fill="${c}" ${S}/>` + (k === 'barrel' ? `<ellipse rx="${w * .35}" ry="${d * .35}" fill="none" ${S}/>` : '');
            case 'chair': return R(x0, y0 + d * .2, w, d * .8) + R(x0, y0, w, d * .2);
            case 'armchair': return R(x0, y0, w, d) + R(x0 + w * .18, y0 + d * .25, w * .64, d * .7, '#fff8') + R(x0, y0, w, d * .22);
            case 'sofa': return R(x0, y0, w, d) + R(x0 + 14, y0 + d * .3, w - 28, d * .65, '#fff6');
            case 'cabinet': case 'wardrobe': return R(x0, y0, w, d) + `<path d="M${x0} ${y0}L${w / 2} ${d / 2}M${w / 2} ${y0}L${x0} ${d / 2}" ${S} opacity=".5"/>`;
            case 'drawers': case 'chest': return R(x0, y0, w, d) + `<path d="M${x0} ${y0 + 6}H${w / 2}" ${S}/>`;
            case 'shelves': return R(x0, y0, w, d) + [1, 2, 3].map(i => `<path d="M${x0 + w * i / 4} ${y0}V${d / 2}" ${S} opacity=".5"/>`).join('');
            case 'clock': return R(x0, y0, w, d) + `<circle r="${Math.min(w, d) * .3}" fill="#fff" ${S}/>`;
            case 'piano': return R(x0, y0, w, d) + R(x0, y0 + d * .65, w, d * .35, '#fff') + Array.from({length: 14}, (_, i) => `<path d="M${x0 + w * (i + .5) / 14} ${y0 + d * .65}v${d * .2}" stroke="#222" stroke-width="2" vector-effect="non-scaling-stroke"/>`).join('');
            case 'fireplace': return R(x0, y0, w, d) + R(x0 + w * .2, y0 + d * .3, w * .6, d * .7, '#4a3a2a');
            case 'stove': case 'range': return R(x0, y0, w, d) + `<circle cx="${-w * .2}" cy="0" r="${Math.min(w, d) * .18}" fill="none" ${S}/><circle cx="${w * .2}" cy="0" r="${Math.min(w, d) * .18}" fill="none" ${S}/>`;
            case 'sink': case 'basin': return R(x0, y0, w, d) + `<rect x="${x0 + w * .15}" y="${y0 + d * .2}" width="${w * .7}" height="${d * .6}" rx="${d * .2}" fill="#fff" ${S}/>`;
            case 'bath': return R(x0, y0, w, d) + `<rect x="${x0 + 8}" y="${y0 + 8}" width="${w - 16}" height="${d - 16}" rx="${d * .35}" fill="#fff" ${S}/>`;
            case 'shower': return R(x0, y0, w, d) + `<path d="M${x0} ${y0}L${w / 2} ${d / 2}M${w / 2} ${y0}L${x0} ${d / 2}" ${S} opacity=".4"/><circle r="5" fill="#888"/>`;
            case 'wc': return R(x0 + w * .1, y0, w * .8, d * .3) + `<ellipse cy="${d * .15}" rx="${w / 2}" ry="${d * .35}" fill="${c}" ${S}/>`;
            case 'rug': return R(x0, y0, w, d, c, 'opacity=".55"') + R(x0 + 10, y0 + 10, w - 20, d - 20, 'none');
            case 'plant': case 'tree': return `<circle r="${Math.min(w, d) / 2}" fill="${c}" ${S} opacity=".85"/>` + [0, 1, 2, 3, 4].map(i => `<circle cx="${Math.cos(i * 1.256) * w * .22}" cy="${Math.sin(i * 1.256) * d * .22}" r="${Math.min(w, d) * .14}" fill="#0002"/>`).join('');
            case 'wheel': return `<circle cx="${-w * .1}" r="${Math.min(w, d) * .38}" fill="none" ${S}/>` + R(w * .1, -6, w * .35, 12);
            case 'loom': return R(x0, y0, w, d, 'none') + R(x0, y0, w, 12) + R(x0, d / 2 - 12, w, 12) + `<path d="M${x0 + 10} 0H${w / 2 - 10}" ${S}/>`;
            case 'cart': return R(x0 + w * .15, y0, w * .85, d) + `<path d="M${x0} 0H${x0 + w * .15}" ${S}/>` + R(x0 + w * .45, y0 - 8, w * .2, 8, '#3a3530') + R(x0 + w * .45, d / 2, w * .2, 8, '#3a3530');
            case 'well': return `<circle r="${Math.min(w, d) / 2}" fill="${c}" ${S}/><circle r="${Math.min(w, d) * .32}" fill="#2a3a4a" ${S}/>`;
            case 'car': return `<rect x="${x0}" y="${y0}" width="${w}" height="${d}" rx="${d * .3}" fill="${c}" ${S}/>` + R(x0 + w * .3, y0 + 10, w * .35, d - 20, '#cfe0ee');
            case 'stairs': { const n = Math.max(4, Math.round(d / 25)); return R(x0, y0, w, d, '#e8dccb') + Array.from({length: n - 1}, (_, i) => `<path d="M${x0} ${y0 + d * (i + 1) / n}H${w / 2}" ${S}/>`).join('') + `<path d="M0 ${d / 2 - 10}V${y0 + 14}M-8 ${y0 + 26}L0 ${y0 + 14}L8 ${y0 + 26}" fill="none" stroke="#c0392b" stroke-width="2" vector-effect="non-scaling-stroke"/>`; }
            case 'stairsL': return R(x0, y0, w, d, '#e8dccb') + Array.from({length: 6}, (_, i) => `<path d="M0 0L${Math.cos(Math.PI + i * Math.PI / 10) * w / 2} ${Math.sin(Math.PI + i * Math.PI / 10) * d / 2}" ${S}/>`).join('') + Array.from({length: 4}, (_, i) => `<path d="M${x0 + w * (i + 1) / 5} 0V${d / 2}" ${S}/>`).join('');
            case 'model': return R(x0, y0, w, d, '#c9d6e3') + `<path d="M${x0} ${y0}L${w / 2} ${d / 2}M${w / 2} ${y0}L${x0} ${d / 2}" ${S} opacity=".35"/>`;
            default: return R(x0, y0, w, d);
        }
    }
    /** les motifs des sols (vus de dessus) */
    function floorPattern(key, color, id) {
        const c = color || FLOOR_MATS.find(f => f[0] === key)?.[2] || '#ddd', P = (w, h, body) => `<pattern id="${id}" width="${w}" height="${h}" patternUnits="userSpaceOnUse"><rect width="${w}" height="${h}" fill="${c}"/>${body}</pattern>`, ln = 'stroke="#0003" stroke-width="1"';
        switch (key) {
            case 'parquet': return P(80, 20, `<path d="M0 20H80M40 0V20" ${ln}/>`);
            case 'point': return P(40, 40, `<path d="M0 0L20 20L0 40M20 0L40 20L20 40" fill="none" ${ln}/>`);
            case 'tomettes': return P(30, 26, `<path d="M8 0L22 0L30 13L22 26L8 26L0 13Z" fill="none" stroke="#7a3020" stroke-width="1.4"/>`);
            case 'carreaux': return P(40, 40, `<rect width="40" height="40" fill="none" ${ln}/><circle cx="20" cy="20" r="9" fill="#0001"/>`);
            case 'damier': return P(60, 60, '<rect width="30" height="30" fill="#2b2b2b"/><rect x="30" y="30" width="30" height="30" fill="#2b2b2b"/>');
            case 'dalles': return P(90, 60, `<path d="M0 0H90V60M0 30H50M50 0V30M30 30V60" fill="none" ${ln}/>`);
            case 'terre': return P(30, 30, '<circle cx="7" cy="9" r="1.4" fill="#0002"/><circle cx="21" cy="22" r="1.2" fill="#0002"/>');
            case 'herbe': return P(20, 20, '<path d="M5 15l2-6 2 6M14 8l2-6 2 6" stroke="#3f6a2a" fill="none"/>');
            case 'gravier': return P(14, 14, '<circle cx="3" cy="4" r="1.6" fill="#0002"/><circle cx="10" cy="10" r="1.3" fill="#0002"/>');
            default: return P(10, 10, '');
        }
    }
    const area = pts => { let a = 0; pts.forEach((p, i) => { const q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; }); return Math.abs(a / 2); };
    const centroid = pts => { const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]); return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]; };
    const newFloor = (n = 0) => ({id: uid('f'), name: n === 0 ? 'Rez-de-chaussée' : n === -1 ? 'Cave' : n === 1 ? '1er étage' : `${n}e étage`, level: n, height: 270, wallT: 20, walls: [], openings: [], rooms: [], items: [], dims: [], labels: []});
    const newHouse = () => ({unit: 'cm', grid: 10, floors: [newFloor(0)], roof: {on: true, pitch: 40, color: '#8a4b3a', kind: 'tuiles'}, meta: {people: [], note: ''}, ref: null});

    /* un plan ouvert depuis la base (ou une base reçue d'ailleurs) : seuls des nombres, des couleurs, des images sûres et
       des mots-clés simples ; le texte libre (noms, notes) est toujours échappé à l'affichage */
    const H_FREE = new Set(['name', 'note', 'text', 'title', 'label', 'period', 'place', 'place_text', 'caption']);
    const H_WORD = new Set(['mtl', 'style', 'mat', 'floor', 'kind', 'type', 'id', 'unit', 'swing', 'role', 'wall', 'room', 'icon', 'ext', 'side', 'model', 'pid', 'key', 'cat', 'shape']);
    const H_COLOR = /^(color|.*Color)$/, H_IMG = /^(src|img|image|href|top|thumb|tex|texture)$/;
    const imgSafe = v => /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(v) || /^media\/[\w.%-]+$/.test(v) || /^api\.php\?action=house_model_file&id=\d+$/.test(v);
    function cleanHouse(v, key = '') {
        if (Array.isArray(v)) return v.slice(0, 20000).map(x => cleanHouse(x, key));
        if (v && typeof v === 'object') { const o = {}; Object.entries(v).slice(0, 200).forEach(([k, x]) => { if (/^[\w$-]{1,40}$/.test(k)) o[k] = cleanHouse(x, k); }); return o; }
        if (typeof v === 'string') {
            if (H_FREE.has(key)) return v.slice(0, 2000);
            if (H_COLOR.test(key)) return /^#[0-9a-f]{3,8}$/i.test(v) ? v : '#999999';
            if (H_IMG.test(key)) return imgSafe(v) ? v : '';
            if (H_WORD.has(key)) return /^[\w.:-]{0,60}$/.test(v) ? v : '';
            const n = Number(v); return Number.isFinite(n) ? n : 0;
        }
        if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
        return typeof v === 'boolean' || v === null ? v : null;
    }

    /* ═════════ L'éditeur ═════════ */
    async function open(ctx = {}) {
        let id = 0, name = 'Maison de famille', placeId = 0, placeText = '', period = '', H = newHouse();
        if (ctx.id) { try { const r = await api('house', {id: ctx.id}); id = r.id; name = r.name; placeId = r.place_id; placeText = r.place_text; period = r.period; H = {...newHouse(), ...cleanHouse(r.house || {})}; if (!Array.isArray(H.floors) || !H.floors.length) H.floors = [newFloor(0)]; } catch (e) { return toast(e.message, 'error'); } }
        let fi = H.floors.findIndex(f => f.level === 0); if (fi < 0) fi = 0;
        let exporting = false, tool = 'select', zoom = .6, panX = 80, panY = 80, sel = null, drag = null, draft = null, hover = null, dirty = false, hist = [], hpos = -1, view3d = null, tab = 'props', libCat = 'Chambre', libQ = '', mine = [];
        const F = () => H.floors[fi];
        const dlg = document.createElement('dialog'); dlg.className = 'modal is-full h-hs-dlg';
        dlg.innerHTML = `<div class="h-hs">
            <header class="h-hs-top"><span class="h-hs-logo">🏠</span><input class="h-hs-name" data-hs-name value="${esc(name)}" maxlength="200">
                <nav class="h-hs-floors" data-hs-floors></nav>
                <span class="segmented h-hs-mode"><button type="button" class="is-active" data-hs-mode="2d">Plan 2D</button><button type="button" data-hs-mode="3d">Vue 3D</button></span>
                <span class="spacer"></span><span class="muted" data-hs-status></span>
                <span class="h-hs-acts" data-tbg="hs-top" data-tbg-label="Barre du haut"><button type="button" class="button small secondary" data-hs-cmd="undo" title="Annuler (⌘Z)">↶</button><button type="button" class="button small secondary" data-hs-cmd="redo" title="Rétablir (⇧⌘Z)">↷</button>
                <details class="h-hs-menu h-hs-snapm"><summary class="button small secondary" title="Aimants et précision">🧲 Aimants</summary><div data-hs-snapbox></div></details>
                <details class="h-hs-menu"><summary class="button small secondary">📥 Importer</summary><div><button type="button" data-hs-cmd="import3d">🧊 Un objet 3D (OBJ, STL, glTF, GLB)…</button><button type="button" data-hs-cmd="importimg">🖼️ Un objet en image (vue de dessus)…</button><button type="button" data-hs-cmd="importplan">📐 Un plan scanné, à calquer…</button></div></details>
                <details class="h-hs-menu"><summary class="button small secondary">⤓ Exporter</summary><div><button type="button" data-hs-cmd="png">🖼️ Plan en image (PNG)</button><button type="button" data-hs-cmd="svg">✒️ Plan en SVG</button><button type="button" data-hs-cmd="print">🖨️ Imprimer le plan</button><button type="button" data-hs-cmd="shot3d">📷 Capture de la vue 3D</button></div></details>
                <button type="button" class="button small" data-hs-cmd="save">💾 Enregistrer</button>${ext.tbButton ? ext.tbButton('house') : ''}</span><button type="button" class="icon-button" data-hs-cmd="close">×</button></header>
            <div class="h-hs-main">
                <nav class="h-hs-tools" data-tbg="hs-tools" data-tbg-label="Outils (colonne de gauche)">${[['select', '➤', 'Choisir, déplacer (V)'], ['pan', '✋', 'Déplacer la vue (H ou barre d’espace)'], ['room', '⬚', 'Pièce rectangulaire, murs compris (R) : glisser'], ['wall', '▬', 'Mur (W) : un clic par coin, double-clic ou Entrée pour finir'], ['zone', '▱', 'Pièce de forme libre, sans murs (P) : un clic par coin'], ['door', '🚪', 'Porte (D) : clic sur un mur'], ['window', '🪟', 'Fenêtre (F) : clic sur un mur'], ['dim', '📏', 'Cote, mesure (M) : deux clics'], ['text', 'T', 'Texte (T)']].map(([k, i, l]) => `<button type="button" data-hs-tool="${k}" title="${esc(l)}">${i}</button>`).join('')}</nav>
                <section class="h-hs-stage" data-hs-stage tabindex="-1"><svg data-hs-svg><defs data-hs-defs></defs><g data-hs-world></g></svg><div class="h-hs-3d" data-hs-3d hidden></div><div class="h-hs-3dbar" data-h3bar data-tbg="hs-3d" data-tbg-label="Barre de la vue 3D" hidden><label class="checkbox-line" data-tb="h3-all"><input type="checkbox" data-h3="all" checked> Tous les étages</label><label class="checkbox-line" data-tb="h3-roof"><input type="checkbox" data-h3="roof"> Toit</label><label class="checkbox-line" data-tb="h3-cut"><input type="checkbox" data-h3="cut"> Murs coupés (voir dedans)</label><label class="checkbox-line" data-tb="h3-dims"><input type="checkbox" data-h3="dims"> Cotes</label><button type="button" class="button small secondary" data-h3="measure" title="Deux clics sur la maison : la distance (et la hauteur entre les deux points)">📏 Mesurer</button><span class="segmented" data-tb="h3-views" data-tb-label="Vues dessus / face / côté"><button type="button" data-h3="view" data-v="top" title="Vue de dessus">Dessus</button><button type="button" data-h3="view" data-v="front" title="Vue de face">Face</button><button type="button" data-h3="view" data-v="side" title="Vue de côté">Côté</button></span><button type="button" class="button small secondary" data-h3="walk">🚶 Visiter</button><button type="button" class="button small secondary" data-h3="home">⌂ Vue d’ensemble</button></div><div class="h-hs-hint" data-hs-hint></div><div class="h-hs-pbar" data-hs-pbar><span data-hs-xy>X — · Y —</span><span data-hs-seg></span><input data-hs-num autocomplete="off" spellcheck="false" hidden></div></section>
                <aside class="h-hs-side"><nav class="segmented h-hs-tabs" data-tbg="hs-tabs" data-tbg-label="Onglets du panneau de droite">${[['props', 'Propriétés'], ['lib', 'Mobilier'], ['floor', 'Étage'], ['house', 'Maison']].map(([k, l]) => `<button type="button" data-hs-tab="${k}">${l}</button>`).join('')}</nav><div class="h-hs-pane" data-hs-pane></div></aside>
            </div></div>`;
        document.body.appendChild(dlg); dlg.showModal();
        const $ = s => dlg.querySelector(s), svg = $('[data-hs-svg]'), world = $('[data-hs-world]'), stage = $('[data-hs-stage]'), pane = $('[data-hs-pane]');
        const status = s => { $('[data-hs-status]').textContent = s || ''; };
        const hint = s => { $('[data-hs-hint]').textContent = s || ''; };
        /* ─── historique ─── */
        const snap0 = () => JSON.stringify(H);
        const commit = (label = '') => { hist = hist.slice(0, hpos + 1); hist.push(snap0()); if (hist.length > 120) hist.shift(); hpos = hist.length - 1; dirty = true; status(label ? `✓ ${label}` : 'modifié'); render(); };
        const restore = i => { if (i < 0 || i >= hist.length) return; hpos = i; H = JSON.parse(hist[hpos]); fi = clamp(fi, 0, H.floors.length - 1); sel = null; dirty = true; render(); };
        /* ─── vue ─── */
        const toW = e => { const r = svg.getBoundingClientRect(); return [(e.clientX - r.left - panX) / zoom, (e.clientY - r.top - panY) / zoom]; };
        const applyView = () => world.setAttribute('transform', `translate(${panX} ${panY}) scale(${zoom})`);
        const fit = () => { const f = F(), pts = [...f.walls.flatMap(w => [w.a, w.b]), ...f.rooms.flatMap(r => r.pts), ...f.items.map(i => [i.x, i.y])]; const r = stage.getBoundingClientRect();
            if (!pts.length) { zoom = .6; panX = r.width / 2 - 500 * zoom; panY = r.height / 2 - 400 * zoom; applyView(); return; }
            const x0 = Math.min(...pts.map(p => p[0])), x1 = Math.max(...pts.map(p => p[0])), y0 = Math.min(...pts.map(p => p[1])), y1 = Math.max(...pts.map(p => p[1]));
            zoom = clamp(Math.min((r.width - 120) / Math.max(100, x1 - x0), (r.height - 120) / Math.max(100, y1 - y0)), .05, 6); panX = r.width / 2 - (x0 + x1) / 2 * zoom; panY = r.height / 2 - (y0 + y1) / 2 * zoom; applyView(); };
        /* ─── aimants : grille, coins des murs, angles ─── */
        let snapO = snapPrefs(), guides = [], lastXY = null;
        const snapPt = (x, y, e, from = null) => {
            guides = [];
            if (e?.altKey) return [r1(x), r1(y)];
            const tol = 14 / zoom, f = F(), g = H.grid || 10, gr = v => snapO.grid ? Math.round(v / g) * g : Math.round(v); // sans grille : au centimètre
            if (snapO.corner) { for (const w of f.walls) for (const p of [w.a, w.b]) if (Math.hypot(p[0] - x, p[1] - y) < tol) { guides.push({pt: p}); return [p[0], p[1]]; } // un coin existant
                for (const rm of f.rooms) for (const p of rm.pts) if (Math.hypot(p[0] - x, p[1] - y) < tol) { guides.push({pt: p}); return [p[0], p[1]]; } }
            if (snapO.mid) for (const w of f.walls) { const m = [r1((w.a[0] + w.b[0]) / 2), r1((w.a[1] + w.b[1]) / 2)]; if (Math.hypot(m[0] - x, m[1] - y) < tol) { guides.push({pt: m, mid: true}); return m; } } // le milieu d'un mur
            if (from && (snapO.angle || e?.shiftKey)) { const dx = x - from[0], dy = y - from[1], L = Math.hypot(dx, dy), a = Math.atan2(dy, dx), st = (e?.shiftKey ? 45 : snapO.step) * Math.PI / 180, s2 = Math.round(a / st) * st; // angles droits, 45°, 15°…
                if (L > 1 && (Math.abs(a - s2) < Math.min(.12, st / 2.5) || e?.shiftKey)) { const L2 = gr(L), p = [r1(from[0] + Math.cos(s2) * L2), r1(from[1] + Math.sin(s2) * L2)]; guides.push({a: from, b: p, ang: true}); return p; } }
            if (snapO.wall) { const nw = nearestWall(x, y); if (nw && nw.d < tol * .7) { const w = nw.w, L = wallLen(w) || 1, d0 = Math.round(nw.t * L); guides.push({pt: [nw.px, nw.py]}); return [r1(w.a[0] + (w.b[0] - w.a[0]) / L * d0), r1(w.a[1] + (w.b[1] - w.a[1]) / L * d0)]; } } // sur un mur, au cm
            let px = gr(x), py = gr(y);
            if (snapO.align) { let bx = null, by = null; // dans l'alignement d'un coin existant (lignes de rappel)
                for (const w of f.walls) for (const p of [w.a, w.b]) { if (Math.abs(p[0] - x) < tol && (!bx || Math.abs(p[0] - x) < Math.abs(bx[0] - x))) bx = p; if (Math.abs(p[1] - y) < tol && (!by || Math.abs(p[1] - y) < Math.abs(by[1] - y))) by = p; }
                if (from) { if (Math.abs(from[0] - x) < tol) bx = from; if (Math.abs(from[1] - y) < tol) by = from; }
                if (bx) px = bx[0]; if (by) py = by[1]; if (bx) guides.push({a: bx, b: [px, py]}); if (by) guides.push({a: by, b: [px, py]}); }
            return [px, py];
        };
        const wallLen = w => Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
        /** le point d'un mur le plus proche : {w, t (0..1), d (distance)} */
        const nearestWall = (x, y) => { let best = null; F().walls.forEach(w => { const dx = w.b[0] - w.a[0], dy = w.b[1] - w.a[1], L2 = dx * dx + dy * dy || 1, t = clamp(((x - w.a[0]) * dx + (y - w.a[1]) * dy) / L2, 0, 1), px = w.a[0] + dx * t, py = w.a[1] + dy * t, d = Math.hypot(x - px, y - py); if (!best || d < best.d) best = {w, t, d, px, py}; }); return best; };
        /* ─── dessin du plan ─── */
        const defs = () => { const f = F(), pats = new Map(); f.rooms.forEach(r => { const k = `${r.floor || 'parquet'}|${r.color || ''}`; if (!pats.has(k)) pats.set(k, `hsp${pats.size}`); }); return {pats, html: [...pats].map(([k, idp]) => { const [key, color] = k.split('|'); return floorPattern(key, color, idp); }).join('') + '<marker id="hsarr" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 2L5 5L0 8" fill="none" stroke="#2a5db0" stroke-width="1.5"/></marker>'}; };
        function openingSvg(o, w) {
            const L = wallLen(w), t = clamp(o.pos, 0, 1), dx = (w.b[0] - w.a[0]) / (L || 1), dy = (w.b[1] - w.a[1]) / (L || 1), cx = w.a[0] + dx * L * t, cy = w.a[1] + dy * L * t, ang = Math.atan2(dy, dx) * 180 / Math.PI, th = w.t || F().wallT, half = o.w / 2;
            const isSel = sel?.type === 'opening' && sel.id === o.id;
            let s = `<g transform="translate(${cx} ${cy}) rotate(${ang})" data-hs="opening:${o.id}" class="h-hs-op${isSel ? ' is-sel' : ''}"><rect x="${-half}" y="${-th / 2 - 1}" width="${o.w}" height="${th + 2}" fill="#fff" stroke="none"/>`;
            if (o.type === 'window') s += `<rect x="${-half}" y="${-th / 2}" width="${o.w}" height="${th}" fill="#dfeefa" stroke="#3a3530" stroke-width="1.4" vector-effect="non-scaling-stroke"/><path d="M${-half} 0H${half}" stroke="#3a3530" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
            else { const sg = o.flip ? -1 : 1, hx = o.swing === 'right' ? half : -half, ex = o.swing === 'right' ? -half : half; s += `<path d="M${hx} ${sg * th / 2}L${hx} ${sg * (th / 2 + o.w)}" stroke="#3a3530" stroke-width="1.6" vector-effect="non-scaling-stroke"/><path d="M${hx} ${sg * (th / 2 + o.w)}A${o.w} ${o.w} 0 0 ${(o.swing === 'right') === (sg > 0) ? 0 : 1} ${ex} ${sg * th / 2}" fill="none" stroke="#3a3530" stroke-width="1" stroke-dasharray="4 3" vector-effect="non-scaling-stroke"/>`; }
            return s + `<rect x="${-half}" y="${-th / 2 - 6}" width="${o.w}" height="${th + 12}" fill="transparent"/></g>`;
        }
        function render() {
            if (view3d && !exporting) { view3d.update?.(H, fi); paintSide(); paintFloors(); return; }
            const f = F(), d = defs(); $('[data-hs-defs]').innerHTML = d.html;
            const g = H.grid || 10, r = stage.getBoundingClientRect(); let step = g; while (step * zoom < 8) step *= step % 2 && step < 10 ? 2 : 5;
            const vx0 = -panX / zoom, vy0 = -panY / zoom, vx1 = vx0 + r.width / zoom, vy1 = vy0 + r.height / zoom;
            let h = '';
            if (!exporting) for (let x = Math.floor(vx0 / step) * step; x < vx1; x += step) h += `<path d="M${x} ${vy0}V${vy1}" class="${x % (step * 10) === 0 ? 'h-hs-g2' : 'h-hs-g'}"/>`;
            if (!exporting) for (let y = Math.floor(vy0 / step) * step; y < vy1; y += step) h += `<path d="M${vx0} ${y}H${vx1}" class="${y % (step * 10) === 0 ? 'h-hs-g2' : 'h-hs-g'}"/>`;
            if (H.ref?.src && H.ref.show !== false && (H.ref.floor ?? f.id) === f.id) h += `<image href="${esc(H.ref.src)}" x="${H.ref.x}" y="${H.ref.y}" width="${H.ref.w}" height="${H.ref.h}" opacity="${H.ref.op ?? .45}" preserveAspectRatio="none" style="pointer-events:none"/>`;
            // l'étage du dessous, en transparence, pour superposer les murs
            const below = H.floors.filter(q => q.level < f.level).sort((a, b) => b.level - a.level)[0];
            if (below && f.showBelow !== false) h += `<g opacity=".18" style="pointer-events:none">${below.walls.map(w => `<path d="M${w.a[0]} ${w.a[1]}L${w.b[0]} ${w.b[1]}" stroke="#333" stroke-width="${w.t || below.wallT}" stroke-linecap="square"/>`).join('')}</g>`;
            f.rooms.forEach(rm => { const isSel = sel?.type === 'room' && sel.id === rm.id, [cx, cy] = centroid(rm.pts), fs = clamp(Math.sqrt(area(rm.pts)) / 9, 14, 60);
                h += `<g data-hs="room:${rm.id}" class="h-hs-room${isSel ? ' is-sel' : ''}"><path d="M${rm.pts.map(p => p.join(' ')).join('L')}Z" fill="url(#${d.pats.get(`${rm.floor || 'parquet'}|${rm.color || ''}`)})" stroke="${isSel ? '#2a7de1' : 'none'}" stroke-width="2" vector-effect="non-scaling-stroke"/>
                    <text x="${cx}" y="${cy}" font-size="${fs}" class="h-hs-rname">${esc(rm.name || 'Pièce')}</text><text x="${cx}" y="${cy + fs * 1.1}" font-size="${fs * .65}" class="h-hs-rarea">${String(r1(area(rm.pts) / 10000)).replace('.', ',')} m²${rm.people?.length || rm.note ? ' · 🕯' : ''}</text></g>`; });
            // les murs : un trait sombre, puis un plus clair par-dessus (les angles se raccordent)
            h += f.walls.map(w => `<path d="M${w.a[0]} ${w.a[1]}L${w.b[0]} ${w.b[1]}" stroke="#2f2b27" stroke-width="${w.t || f.wallT}" stroke-linecap="square"/>`).join('');
            h += f.walls.map(w => { const isSel = sel?.type === 'wall' && sel.id === w.id, mc = WALL_MATS.find(m => m[0] === (w.mat || 'platre'))?.[2] || '#bbb'; return `<path data-hs="wall:${w.id}" class="h-hs-wall${isSel ? ' is-sel' : ''}" d="M${w.a[0]} ${w.a[1]}L${w.b[0]} ${w.b[1]}" stroke="${isSel ? '#7fb2f0' : mc}" stroke-width="${Math.max(2, (w.t || f.wallT) - 6)}" stroke-linecap="square"/>`; }).join('');
            h += f.openings.map(o => { const w = f.walls.find(q => q.id === o.wall); return w ? openingSvg(o, w) : ''; }).join('');
            f.items.forEach(it => { const isSel = sel?.type === 'item' && sel.id === it.id;
                h += `<g data-hs="item:${it.id}" class="h-hs-item${isSel ? ' is-sel' : ''}" transform="translate(${it.x} ${it.y}) rotate(${it.rot || 0})">${sym2d(it)}${isSel ? `<rect x="${-it.w / 2 - 4}" y="${-it.d / 2 - 4}" width="${it.w + 8}" height="${it.d + 8}" fill="none" stroke="#2a7de1" stroke-width="1.5" stroke-dasharray="5 3" vector-effect="non-scaling-stroke"/><circle cy="${-it.d / 2 - 26 / zoom}" r="${7 / zoom}" fill="#2a7de1" data-hs-rot="1"/><path d="M0 ${-it.d / 2 - 4}V${-it.d / 2 - 20 / zoom}" stroke="#2a7de1" vector-effect="non-scaling-stroke"/>` : ''}</g>`;
                if (zoom > .35 && it.name) h += `<text x="${it.x}" y="${it.y + it.d / 2 + 16 / zoom}" font-size="${11 / zoom}" class="h-hs-iname">${esc(it.name)}</text>`; });
            // cotes : chaque mur choisi, et les cotes posées
            const dim = (a, b, off, cls = '') => { const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 1) return ''; const nx = -(b[1] - a[1]) / L * off, ny = (b[0] - a[0]) / L * off, ang = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI, flip = ang > 90 || ang < -90, mx = (a[0] + b[0]) / 2 + nx, my = (a[1] + b[1]) / 2 + ny;
                return `<g class="h-hs-dim ${cls}"><path d="M${a[0] + nx} ${a[1] + ny}L${b[0] + nx} ${b[1] + ny}" marker-start="url(#hsarr)" marker-end="url(#hsarr)"/><text x="${mx}" y="${my - 5 / zoom}" font-size="${12 / zoom}" transform="rotate(${flip ? ang + 180 : ang} ${mx} ${my})">${fmtLen(L)}</text></g>`; };
            f.dims.forEach(dm => { h += `<g data-hs="dim:${dm.id}">${dim(dm.a, dm.b, 0, sel?.type === 'dim' && sel.id === dm.id ? 'is-sel' : '')}</g>`; });
            if (f.showDims !== false) f.walls.forEach(w => { h += dim(w.a, w.b, (w.t || f.wallT) / 2 + 22 / zoom, 'is-auto'); });
            f.labels.forEach(lb => { h += `<text data-hs="label:${lb.id}" x="${lb.x}" y="${lb.y}" font-size="${lb.size || 24}" class="h-hs-label${sel?.type === 'label' && sel.id === lb.id ? ' is-sel' : ''}">${esc(lb.text)}</text>`; });
            // la sélection : poignées des murs et des pièces
            if (sel?.type === 'wall') { const w = f.walls.find(q => q.id === sel.id); if (w) h += [w.a, w.b].map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="${7 / zoom}" class="h-hs-handle" data-hs-wp="${i}"/>`).join(''); }
            if (sel?.type === 'room') { const rm = f.rooms.find(q => q.id === sel.id); if (rm) h += rm.pts.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="${6 / zoom}" class="h-hs-handle" data-hs-rp="${i}"/>`).join(''); }
            // ce qu'on est en train de tracer
            if (draft?.pts?.length) { const pts = [...draft.pts, ...(hover ? [hover] : [])], last = draft.pts[draft.pts.length - 1];
                if (draft.kind === 'wall') { h += `<path d="M${pts.map(p => p.join(' ')).join('L')}" stroke="#2a7de1" stroke-opacity=".55" stroke-width="${f.wallT}" fill="none" stroke-linecap="square"/>`; if (hover) h += dim(last, hover, f.wallT / 2 + 20 / zoom, 'is-live'); }
                else if (draft.kind === 'zone') h += `<path d="M${pts.map(p => p.join(' ')).join('L')}Z" fill="#2a7de122" stroke="#2a7de1" stroke-width="1.5" vector-effect="non-scaling-stroke"/>`;
                else if (draft.kind === 'dim' && hover) h += dim(last, hover, 0, 'is-live'); }
            if (draft?.kind === 'room' && draft.b) { const [a, b] = [draft.a, draft.b], x = Math.min(a[0], b[0]), y = Math.min(a[1], b[1]), w = Math.abs(b[0] - a[0]), hh = Math.abs(b[1] - a[1]);
                h += `<rect x="${x}" y="${y}" width="${w}" height="${hh}" fill="#2a7de11a" stroke="#2a7de1" stroke-width="${f.wallT}" stroke-opacity=".5"/>` + dim([x, y], [x + w, y], -f.wallT / 2 - 20 / zoom, 'is-live') + dim([x + w, y], [x + w, y + hh], -f.wallT / 2 - 20 / zoom, 'is-live') + `<text x="${x + w / 2}" y="${y + hh / 2}" font-size="${14 / zoom}" class="h-hs-rarea">${String(r1(w * hh / 10000)).replace('.', ',')} m²</text>`; }
            if (hover && ['wall', 'zone', 'dim', 'room'].includes(tool)) { h += guides.map(q => q.pt ? `<rect x="${q.pt[0] - 6 / zoom}" y="${q.pt[1] - 6 / zoom}" width="${12 / zoom}" height="${12 / zoom}" class="h-hs-snapmk${q.mid ? ' is-mid' : ''}" transform="${q.mid ? `rotate(45 ${q.pt[0]} ${q.pt[1]})` : ''}"/>` : `<path d="M${q.a[0]} ${q.a[1]}L${q.b[0]} ${q.b[1]}" class="h-hs-guide${q.ang ? ' is-ang' : ''}"/>`).join(''); h += `<circle cx="${hover[0]}" cy="${hover[1]}" r="${4 / zoom}" fill="#2a7de1"/>`; }
            world.innerHTML = h; applyView(); paintSide(); paintFloors(); if (lastXY) readout(...lastXY);
        }
        /* ─── étages ─── */
        function paintFloors() {
            $('[data-hs-floors]').innerHTML = [...H.floors].map((f, i) => [f, i]).sort((a, b) => b[0].level - a[0].level).map(([f, i]) => `<button type="button" class="${i === fi ? 'is-on' : ''}" data-hs-floor="${i}" title="Double-clic pour renommer">${esc(f.name)}</button>`).join('') + '<button type="button" data-hs-cmd="addfloor" title="Ajouter un étage ou une cave">＋</button><button type="button" data-hs-cmd="floors" title="Gérer les étages : renommer, hauteur, supprimer">⋯</button>';
        }
        /* ─── panneau de droite ─── */
        const opt = (list, cur) => list.map(([k, l]) => `<option value="${k}" ${cur === k ? 'selected' : ''}>${esc(l)}</option>`).join('');
        function paintSide() {
            dlg.querySelectorAll('[data-hs-tab]').forEach(b => b.classList.toggle('is-active', b.dataset.hsTab === tab));
            if (pane.contains(document.activeElement) && document.activeElement.matches('input:not([type=range]):not([type=color]), textarea')) return;
            const f = F();
            if (tab === 'lib') {
                const cats = [...new Set(LIB.map(l => l[2]))], q = libQ.toLowerCase();
                const list = q ? LIB.filter(l => l[1].toLowerCase().includes(q)) : LIB.filter(l => l[2] === libCat);
                pane.innerHTML = `<input type="search" data-hs-libq placeholder="Chercher : lit, poêle, rouet…" value="${esc(libQ)}"><div class="h-hs-cats">${[...cats, 'Mes objets'].map(c => `<button type="button" class="${c === libCat && !q ? 'is-on' : ''}" data-hs-cat="${esc(c)}">${esc(c)}</button>`).join('')}</div>
                    ${libCat === 'Mes objets' && !q ? `<div class="h-hs-lib">${mine.map(m => `<button type="button" data-hs-mine="${m.id}" title="${esc(m.name)} (${m.ext.toUpperCase()})">${m.thumb ? `<img src="${esc(m.thumb)}" alt="">` : '<span>🧊</span>'}<small>${esc(m.name)}</small></button>`).join('') || '<p class="muted">Aucun objet importé : « 📥 Importer » (en haut) un fichier 3D (OBJ, STL, glTF, GLB) ou une image.</p>'}</div>`
                    : `<div class="h-hs-lib">${list.map(l => `<button type="button" data-hs-lib="${l[0]}" title="${esc(l[1])} — ${l[3]} × ${l[4]} cm"><svg viewBox="${-l[3] / 2 - 6} ${-l[4] / 2 - 6} ${l[3] + 12} ${l[4] + 12}" width="46" height="40">${sym2d({kind: l[0], w: l[3], d: l[4]})}</svg><small>${esc(l[1])}</small></button>`).join('')}</div>`}
                    <p class="muted h-hs-help">Clic sur un objet : il se pose au milieu de la vue ; glisse-le ensuite à sa place (R ou la poignée ronde pour tourner).</p>`;
                return;
            }
            if (tab === 'floor') {
                const below = H.floors.some(q => q.level < f.level);
                pane.innerHTML = `<div class="h-hs-form"><label>Nom de l’étage<input data-hs-f="name" value="${esc(f.name)}"></label><div class="h-hs-g2c"><label>Niveau<input type="number" data-hs-f="level" value="${f.level}" min="-3" max="9"></label><label>Hauteur sous plafond (cm)<input type="number" data-hs-f="height" value="${f.height}" min="150" max="800"></label></div>
                    <label>Épaisseur des nouveaux murs (cm)<input type="number" data-hs-f="wallT" value="${f.wallT}" min="5" max="120"></label>
                    <label class="checkbox-line"><input type="checkbox" data-hs-f="showDims" ${f.showDims !== false ? 'checked' : ''}> Cotes des murs</label>${below ? `<label class="checkbox-line"><input type="checkbox" data-hs-f="showBelow" ${f.showBelow !== false ? 'checked' : ''}> Voir l’étage du dessous en transparence</label>` : ''}
                    <div class="h-hs-g2c"><label>Pas de la grille (cm)<select data-hs-h="grid">${[1, 2, 5, 10, 25, 50, 100].map(v => `<option ${H.grid === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label><label>Épaisseur des planchers (cm)<input type="number" data-hs-h="slab" value="${H.slab ?? 20}" min="0" max="120"></label></div>
                    <div class="h-hs-row"><button type="button" class="button small secondary" data-hs-cmd="dupfloor">⧉ Dupliquer cet étage (murs)</button><button type="button" class="button small danger" data-hs-cmd="delfloor">Supprimer l’étage</button></div>
                    <h4>Toit (vue 3D)</h4><label class="checkbox-line"><input type="checkbox" data-hs-roof="on" ${H.roof?.on !== false ? 'checked' : ''}> Un toit à deux pans sur l’étage le plus haut</label><div class="h-hs-g2c"><label>Pente (°)<input type="number" data-hs-roof="pitch" value="${H.roof?.pitch ?? 40}" min="10" max="70"></label><label>Couverture<select data-hs-roof="kind">${opt([['tuiles', 'Tuiles'], ['ardoises', 'Ardoises'], ['chaume', 'Chaume'], ['zinc', 'Zinc']], H.roof?.kind || 'tuiles')}</select></label></div>
                    ${H.ref?.src ? `<h4>Plan scanné</h4><label>Transparence<input type="range" min="5" max="100" value="${Math.round((H.ref.op ?? .45) * 100)}" data-hs-ref="op"></label><div class="h-hs-row"><label class="checkbox-line"><input type="checkbox" data-hs-ref="show" ${H.ref.show !== false ? 'checked' : ''}> Visible</label><button type="button" class="button small secondary" data-hs-cmd="calib">📏 Mettre à l’échelle (2 points)</button><button type="button" class="button small secondary" data-hs-cmd="refmove">✥ Déplacer</button><button type="button" class="button small danger" data-hs-cmd="refdel">Retirer</button></div>` : ''}</div>`;
                return;
            }
            if (tab === 'house') {
                const m = H.meta || (H.meta = {people: [], note: ''});
                pane.innerHTML = `<div class="h-hs-form"><label>Lieu<input type="search" data-hs-placeq value="${esc(placeText)}" placeholder="Commune, hameau, adresse…" autocomplete="off"></label><div data-hs-placeres class="h-hs-res"></div>
                    <label>Époque<input data-hs-m="period" value="${esc(period)}" placeholder="ex. 1850 – 1930"></label>
                    <h4>👥 Les habitants</h4><ul class="h-hs-people">${(m.people || []).map((p, i) => `<li><button type="button" class="link-button" data-hs-popen="${p.id}">${esc(p.label)}</button><input data-hs-prole="${i}" value="${esc(p.role || '')}" placeholder="rôle, années (né ici, 1880–1920…)"><button type="button" class="icon-button" data-hs-pdel="${i}">×</button></li>`).join('') || '<li class="muted">Personne pour l’instant.</li>'}</ul>
                    <button type="button" class="button small secondary" data-hs-cmd="addpeople">＋ Un habitant…</button>
                    <label>Histoire de la maison<textarea data-hs-m="note" rows="6" placeholder="Construite par…, agrandie en…, vendue en…">${esc(m.note || '')}</textarea></label></div>`;
                return;
            }
            // Propriétés de ce qui est choisi
            const o = !sel ? null : sel.type === 'wall' ? f.walls.find(q => q.id === sel.id) : sel.type === 'room' ? f.rooms.find(q => q.id === sel.id) : sel.type === 'item' ? f.items.find(q => q.id === sel.id) : sel.type === 'opening' ? f.openings.find(q => q.id === sel.id) : sel.type === 'label' ? f.labels.find(q => q.id === sel.id) : sel.type === 'dim' ? f.dims.find(q => q.id === sel.id) : null;
            if (!o) { pane.innerHTML = `<div class="h-hs-form"><p class="muted">Pour commencer : ⬚ <b>glisse une pièce</b> (ses murs se font tout seuls), ou ▬ trace les murs un par un. Puis 🚪 portes et 🪟 fenêtres (un clic sur un mur), et le <b>mobilier</b> (onglet à côté).</p>
                <p class="muted">Clic sur un mur, une pièce, un meuble : ses réglages viennent ici (matériau, couleur, taille, nom, souvenirs). Molette : zoomer ; barre d’espace : déplacer la vue ; Alt : sans aimant.</p>
                <h4>Cet étage</h4><p>${f.walls.length} mur${f.walls.length > 1 ? 's' : ''}, ${f.rooms.length} pièce${f.rooms.length > 1 ? 's' : ''}, ${f.items.length} objet${f.items.length > 1 ? 's' : ''} · ${String(r1(f.rooms.reduce((a, r) => a + area(r.pts), 0) / 10000)).replace('.', ',')} m² habitables</p></div>`; return; }
            let h = '<div class="h-hs-form">';
            if (sel.type === 'wall') h += `<h4>Mur · ${fmtLen(wallLen(o))}</h4><div class="h-hs-g2c"><label>Longueur (cm)<input type="number" data-hs-p="len" value="${Math.round(wallLen(o))}" min="10"></label><label>Épaisseur (cm)<input type="number" data-hs-p="t" value="${o.t || f.wallT}" min="5" max="150"></label></div>
                <label>Matériau (côtés)<select data-hs-p="mat">${opt(WALL_MATS.map(m => [m[0], m[1]]), o.mat || 'platre')}</select></label><label>Couleur (papier peint, enduit)<input type="color" data-hs-p="color" value="${esc(o.color || WALL_MATS.find(m => m[0] === (o.mat || 'platre'))[2])}"></label>
                <label>Angle (°, 0 = vers la droite, 90 = vers le haut)<input type="number" data-hs-p="ang" value="${degOf(o.a, o.b)}" step="0.5"></label><div class="h-hs-g4c"><label>Début X<input type="number" data-hs-p="ax" value="${r1(o.a[0])}" step="1"></label><label>Début Y<input type="number" data-hs-p="ay" value="${r1(o.a[1])}" step="1"></label><label>Fin X<input type="number" data-hs-p="bx" value="${r1(o.b[0])}" step="1"></label><label>Fin Y<input type="number" data-hs-p="by" value="${r1(o.b[1])}" step="1"></label></div>
                <label>Hauteur (cm, vide = celle de l’étage)<input type="number" data-hs-p="h" value="${o.h || ''}" min="20" max="900"></label><div class="h-hs-row"><button type="button" class="button small secondary" data-hs-cmd="split">✂ Couper en deux</button></div>`;
            if (sel.type === 'opening') h += `<h4>${o.type === 'window' ? 'Fenêtre' : 'Porte'}</h4><div class="h-hs-g2c"><label>Largeur (cm)<input type="number" data-hs-p="w" value="${o.w}" min="30" max="600"></label><label>Hauteur (cm)<input type="number" data-hs-p="h" value="${o.h}" min="30" max="400"></label></div>
                ${o.type === 'window' ? `<label>Allège (cm du sol)<input type="number" data-hs-p="sill" value="${o.sill ?? 90}" min="0" max="300"></label>` : `<label>Genre<select data-hs-p="style">${opt([['porte', 'Porte'], ['double', 'Porte double'], ['entree', 'Porte d’entrée'], ['arche', 'Passage, arche'], ['grange', 'Porte de grange']], o.style || 'porte')}</select></label><div class="h-hs-row"><button type="button" class="button small secondary" data-hs-cmd="swing">↔ Sens d’ouverture</button><button type="button" class="button small secondary" data-hs-cmd="flip">⇅ Côté</button></div>`}
                <label>Position sur le mur<input type="range" min="0" max="1000" value="${Math.round(o.pos * 1000)}" data-hs-p="pos"></label>${(() => { const w = f.walls.find(q => q.id === o.wall), L = w ? wallLen(w) : 0, s0 = r1(o.pos * L - o.w / 2); return w ? `<div class="h-hs-g2c"><label>Du début du mur (cm)<input type="number" data-hs-p="from" value="${s0}" min="0" step="1"></label><label>Jusqu’à la fin (cm)<input type="number" data-hs-p="to" value="${r1(L - s0 - o.w)}" min="0" step="1"></label></div>` : ''; })()}`;
            if (sel.type === 'room') h += `<h4>Pièce · ${(area(o.pts) / 10000).toFixed(2).replace('.', ',')} m²</h4><p class="muted">${(() => { const xs = o.pts.map(p => p[0]), ys = o.pts.map(p => p[1]); return `${fmtLen(Math.max(...xs) - Math.min(...xs))} × ${fmtLen(Math.max(...ys) - Math.min(...ys))} hors tout · périmètre ${fmtLen(o.pts.reduce((a, p, i) => a + Math.hypot(o.pts[(i + 1) % o.pts.length][0] - p[0], o.pts[(i + 1) % o.pts.length][1] - p[1]), 0))}`; })()}</p><label>Nom<input data-hs-p="name" value="${esc(o.name || '')}" list="hs-rooms"></label><datalist id="hs-rooms">${['Salle commune', 'Cuisine', 'Chambre', 'Chambre des parents', 'Chambre des enfants', 'Salon', 'Salle à manger', 'Bureau', 'Grenier', 'Cave', 'Cellier', 'Étable', 'Écurie', 'Grange', 'Fournil', 'Atelier', 'Boutique', 'Entrée', 'Couloir', 'Salle d’eau', 'Cour', 'Jardin', 'Potager', 'Basse-cour'].map(v => `<option value="${v}">`).join('')}</datalist>
                <div class="h-hs-g2c"><label>Sol<select data-hs-p="floor">${opt(FLOOR_MATS.map(m => [m[0], m[1]]), o.floor || 'parquet')}</select></label><label>Couleur<input type="color" data-hs-p="color" value="${esc(o.color || FLOOR_MATS.find(m => m[0] === (o.floor || 'parquet'))[2])}"></label></div>
                <h4>🕯 Souvenirs de la pièce</h4><label>Ce qui s’y est passé<textarea data-hs-p="note" rows="4" placeholder="La chambre où est née Marie en 1890 ; la veillée…">${esc(o.note || '')}</textarea></label><label>Époque<input data-hs-p="period" value="${esc(o.period || '')}" placeholder="ex. 1890 – 1920"></label>
                <ul class="h-hs-people">${(o.people || []).map((p, i) => `<li><button type="button" class="link-button" data-hs-popen="${p.id}">${esc(p.label)}</button><button type="button" class="icon-button" data-hs-rpdel="${i}">×</button></li>`).join('')}</ul><button type="button" class="button small secondary" data-hs-cmd="roompeople">＋ Une personne liée à la pièce…</button>`;
            if (sel.type === 'item') { const L = libOf(o.kind); h += `<h4>${esc(o.name || L?.[1] || 'Objet')}</h4><label>Nom<input data-hs-p="name" value="${esc(o.name || '')}" placeholder="${esc(L?.[1] || '')}"></label><div class="h-hs-g3c"><label>Largeur<input type="number" data-hs-p="w" value="${Math.round(o.w)}" min="5"></label><label>Profondeur<input type="number" data-hs-p="d" value="${Math.round(o.d)}" min="1"></label><label>Hauteur<input type="number" data-hs-p="hgt" value="${Math.round(o.h ?? L?.[5] ?? 80)}" min="1"></label></div>
                <div class="h-hs-g2c"><label>Rotation (°)<input type="number" data-hs-p="rot" value="${Math.round(o.rot || 0)}" step="15"></label><label>Couleur<input type="color" data-hs-p="color" value="${esc(o.color || L?.[6] || '#9a8a7a')}"></label></div><div class="h-hs-g3c"><label>X (cm)<input type="number" data-hs-p="x" value="${r1(o.x)}" step="1"></label><label>Y (cm)<input type="number" data-hs-p="y" value="${r1(o.y)}" step="1"></label><label>Du sol (cm)<input type="number" data-hs-p="elev" value="${o.elev || 0}" min="0" max="400"></label></div>
                <label>Souvenir (objet de famille, histoire)<textarea data-hs-p="note" rows="2">${esc(o.note || '')}</textarea></label><div class="h-hs-row"><button type="button" class="button small secondary" data-hs-cmd="rot90">⟳ 90°</button><button type="button" class="button small secondary" data-hs-cmd="dup">⧉ Dupliquer</button></div>`; }
            if (sel.type === 'label') h += `<h4>Texte</h4><label>Texte<input data-hs-p="text" value="${esc(o.text)}"></label><label>Taille<input type="number" data-hs-p="size" value="${o.size || 24}" min="6" max="300"></label>`;
            if (sel.type === 'dim') h += `<h4>Cote · ${fmtLen(Math.hypot(o.b[0] - o.a[0], o.b[1] - o.a[1]))}</h4>`;
            h += '<div class="h-hs-row"><button type="button" class="button small danger" data-hs-cmd="del">🗑 Supprimer</button></div></div>';
            pane.innerHTML = h;
        }
        /* ─── la souris sur le plan ─── */
        const hitOf = e => { const el = e.target.closest?.('[data-hs]'); if (!el) return null; const [type, idv] = el.dataset.hs.split(':'); return {type, id: idv}; };
        let space = false;
        svg.addEventListener('pointerdown', e => {
            stage.focus({preventScroll: true});
            const [x, y] = toW(e); svg.setPointerCapture(e.pointerId);
            if (e.button === 1 || space || tool === 'pan') { drag = {pan: true, sx: e.clientX, sy: e.clientY, px: panX, py: panY}; return; }
            if (e.button !== 0) return;
            const f = F();
            if (tool === 'select') {
                const wp = e.target.closest('[data-hs-wp]'), rp = e.target.closest('[data-hs-rp]'), rot = e.target.closest('[data-hs-rot]');
                if (wp && sel?.type === 'wall') { const w = f.walls.find(q => q.id === sel.id), i = Number(wp.dataset.hsWp), p = [w.a, w.b][i]; drag = {wallEnd: true, w, i, orig: [...p], linked: f.walls.flatMap(q => q === w ? [] : [[q, 'a'], [q, 'b']]).filter(([q, k]) => q[k][0] === p[0] && q[k][1] === p[1])}; return; }
                if (rp && sel?.type === 'room') { drag = {roomPt: true, rm: f.rooms.find(q => q.id === sel.id), i: Number(rp.dataset.hsRp)}; return; }
                if (rot && sel?.type === 'item') { drag = {rot: true, it: f.items.find(q => q.id === sel.id)}; return; }
                if (e.target.closest('[data-hs-ref]')) return;
                const hit = hitOf(e); sel = hit;
                if (hit?.type === 'item') { const it = f.items.find(q => q.id === hit.id); drag = {move: 'item', it, x, y, ox: it.x, oy: it.y}; }
                else if (hit?.type === 'opening') { drag = {move: 'opening', o: f.openings.find(q => q.id === hit.id)}; }
                else if (hit?.type === 'wall') { const w = f.walls.find(q => q.id === hit.id); drag = {move: 'wall', w, x, y, a: [...w.a], b: [...w.b], linked: f.walls.flatMap(q => q === w ? [] : [[q, 'a'], [q, 'b']]).flatMap(([q, k]) => [[w.a, 'a'], [w.b, 'b']].filter(([p]) => q[k][0] === p[0] && q[k][1] === p[1]).map(([, which]) => [q, k, which])), ops: f.openings.filter(o => o.wall === w.id)}; }
                else if (hit?.type === 'room') { const rm = f.rooms.find(q => q.id === hit.id); drag = {move: 'room', rm, x, y, orig: rm.pts.map(p => [...p])}; }
                else if (hit?.type === 'label') { const lb = f.labels.find(q => q.id === hit.id); drag = {move: 'label', lb, x, y, ox: lb.x, oy: lb.y}; }
                else if (H.ref?.moving) { drag = {refMove: true, x, y, ox: H.ref.x, oy: H.ref.y}; }
                render(); return;
            }
            const p = snapPt(x, y, e, draft?.pts?.[draft.pts.length - 1]);
            if (tool === 'room') { draft = {kind: 'room', a: snapPt(x, y, e), b: null}; return; }
            if (tool === 'wall' || tool === 'zone' || tool === 'dim') {
                if (!draft) { draft = {kind: tool, pts: [p]}; render(); return; }
                const first = draft.pts[0];
                if (tool !== 'dim' && draft.pts.length > 2 && Math.hypot(p[0] - first[0], p[1] - first[1]) < 14 / zoom) { draft.pts.push([...first]); finishDraft(true); return; }
                const last = draft.pts[draft.pts.length - 1]; if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 2) { finishDraft(); return; } // double-clic
                draft.pts.push(p); if (tool === 'dim' && draft.pts.length === 2) finishDraft(); else render(); return;
            }
            if (tool === 'door' || tool === 'window') {
                const nw = nearestWall(x, y); if (!nw || nw.d > 60) return toast('Clique sur un mur.', 'error');
                const L = wallLen(nw.w), w = tool === 'window' ? 100 : 90, pos = clamp(nw.t, (w / 2 + 5) / L, 1 - (w / 2 + 5) / L);
                const o = {id: uid('o'), wall: nw.w.id, type: tool, pos, w: Math.min(w, L - 10), h: tool === 'window' ? 120 : 210, sill: tool === 'window' ? 90 : 0, swing: 'left', flip: false, style: 'porte'};
                f.openings.push(o); sel = {type: 'opening', id: o.id}; setTool('select'); commit(tool === 'window' ? 'Fenêtre' : 'Porte'); return;
            }
            if (tool === 'text') { A().askText({title: 'Un texte sur le plan', message: 'Le texte à écrire (nom d’une pièce, d’un lieu, une remarque…)', value: '', okLabel: 'Poser'}).then(t2 => { if (t2) { const lb = {id: uid('t'), x: p[0], y: p[1], text: t2.slice(0, 200), size: 28}; f.labels.push(lb); sel = {type: 'label', id: lb.id}; setTool('select'); commit('Texte'); } }); return; }
        });
        svg.addEventListener('pointermove', e => {
            const [x, y] = toW(e), f = F(); lastXY = [x, y];
            if (drag?.pan) { panX = drag.px + e.clientX - drag.sx; panY = drag.py + e.clientY - drag.sy; applyView(); render(); return; }
            if (draft?.kind === 'room' && tool === 'room') { draft.b = snapPt(x, y, e); render(); return; } // une pièce qu'on glisse
            if (!drag) { if (['wall', 'zone', 'dim', 'room'].includes(tool)) { hover = snapPt(x, y, e, draft?.pts?.[draft.pts.length - 1]); render(); } return; }
            if (drag.wallEnd) { const p = snapPt(x, y, e, drag.i ? drag.w.a : drag.w.b); drag.w[drag.i ? 'b' : 'a'] = p; drag.linked.forEach(([q, k]) => { q[k] = [...p]; }); drag.moved = true; render(); return; }
            if (drag.roomPt) { drag.rm.pts[drag.i] = snapPt(x, y, e); drag.moved = true; render(); return; }
            if (drag.rot) { const it = drag.it, a = Math.atan2(y - it.y, x - it.x) * 180 / Math.PI + 90; it.rot = e.shiftKey ? a : Math.round(a / 15) * 15; drag.moved = true; render(); return; }
            if (drag.refMove) { H.ref.x = drag.ox + x - drag.x; H.ref.y = drag.oy + y - drag.y; drag.moved = true; render(); return; }
            if (drag.move === 'item') { const g = e.altKey ? 1 : (H.grid || 10); drag.it.x = Math.round((drag.ox + x - drag.x) / g) * g; drag.it.y = Math.round((drag.oy + y - drag.y) / g) * g; drag.moved = true; render(); return; }
            if (drag.move === 'label') { drag.lb.x = drag.ox + x - drag.x; drag.lb.y = drag.oy + y - drag.y; drag.moved = true; render(); return; }
            if (drag.move === 'opening') { const o = drag.o, w = f.walls.find(q => q.id === o.wall); if (!w) return; const L = wallLen(w), dx = w.b[0] - w.a[0], dy = w.b[1] - w.a[1], t = ((x - w.a[0]) * dx + (y - w.a[1]) * dy) / (L * L || 1); o.pos = clamp(t, (o.w / 2 + 2) / L, 1 - (o.w / 2 + 2) / L); drag.moved = true; render(); return; }
            if (drag.move === 'wall') { const g = e.altKey ? 1 : (H.grid || 10), dx = Math.round((x - drag.x) / g) * g, dy = Math.round((y - drag.y) / g) * g; drag.w.a = [drag.a[0] + dx, drag.a[1] + dy]; drag.w.b = [drag.b[0] + dx, drag.b[1] + dy]; drag.linked.forEach(([q, k, which]) => { q[k] = [...drag.w[which]]; }); drag.moved = true; render(); return; }
            if (drag.move === 'room') { const g = e.altKey ? 1 : (H.grid || 10), dx = Math.round((x - drag.x) / g) * g, dy = Math.round((y - drag.y) / g) * g; drag.rm.pts = drag.orig.map(p => [p[0] + dx, p[1] + dy]); drag.moved = true; render(); return; }
        });
        svg.addEventListener('pointerup', e => {
            const d = drag; drag = null;
            if (draft?.kind === 'room' && tool === 'room') { const a = draft.a, b = draft.b || snapPt(...toW(e), e); draft = null; makeRoomRect(a, b); return; }
            if (!d || d.pan) return;
            if (d.moved) commit({wallEnd: 'Mur modifié', roomPt: 'Pièce modifiée', rot: 'Objet tourné', refMove: 'Plan scanné déplacé'}[Object.keys(d).find(k => ['wallEnd', 'roomPt', 'rot', 'refMove'].includes(k))] || 'Déplacé');
        });
        svg.addEventListener('dblclick', e => { if (draft) finishDraft(); else { const hit = hitOf(e); if (hit?.type === 'room') { tab = 'props'; sel = hit; render(); pane.querySelector('[data-hs-p="name"]')?.focus(); } } });
        stage.addEventListener('wheel', e => { if (view3d) return; e.preventDefault(); const r = svg.getBoundingClientRect(), cx = e.clientX - r.left, cy = e.clientY - r.top; if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) > Math.abs(e.deltaX)) { const z = clamp(zoom * Math.exp(-e.deltaY * .0018), .03, 8); panX = cx - (cx - panX) * z / zoom; panY = cy - (cy - panY) * z / zoom; zoom = z; } else { panX -= e.deltaX; panY -= e.deltaY; } render(); }, {passive: false});
        /** une pièce rectangulaire : 4 murs (ceux qui existent déjà ne sont pas doublés) et la pièce elle-même */
        function makeRoomRect(a, b) {
            const f = F(), x0 = Math.min(a[0], b[0]), y0 = Math.min(a[1], b[1]), x1 = Math.max(a[0], b[0]), y1 = Math.max(a[1], b[1]);
            if (x1 - x0 < 50 || y1 - y0 < 50) { render(); return toast('Une pièce d’au moins 50 cm de côté.', 'error'); }
            const C = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
            const exists = (p, q) => f.walls.some(w => (w.a[0] === p[0] && w.a[1] === p[1] && w.b[0] === q[0] && w.b[1] === q[1]) || (w.a[0] === q[0] && w.a[1] === q[1] && w.b[0] === p[0] && w.b[1] === p[1]));
            // un côté posé sur un mur existant plus long ne crée pas de mur en double
            const covered = (p, q) => f.walls.some(w => { const onLine = (P) => { const dx = w.b[0] - w.a[0], dy = w.b[1] - w.a[1], L = Math.hypot(dx, dy) || 1; return Math.abs((P[0] - w.a[0]) * dy - (P[1] - w.a[1]) * dx) / L < 1 && (P[0] - w.a[0]) * dx + (P[1] - w.a[1]) * dy >= -1 && (P[0] - w.b[0]) * -dx + (P[1] - w.b[1]) * -dy >= -1; }; return onLine(p) && onLine(q); });
            C.forEach((p, i) => { const q = C[(i + 1) % 4]; if (!exists(p, q) && !covered(p, q)) f.walls.push({id: uid('w'), a: [...p], b: [...q], t: f.wallT, mat: 'platre'}); });
            const n = f.rooms.length + 1, rm = {id: uid('r'), name: `Pièce ${n}`, pts: C, floor: 'parquet'}; f.rooms.push(rm); sel = {type: 'room', id: rm.id}; tab = 'props';
            commit(`Pièce de ${String(r1((x1 - x0) * (y1 - y0) / 10000)).replace('.', ',')} m²`);
            setTimeout(() => { const i = pane.querySelector('[data-hs-p="name"]'); i?.focus(); i?.select(); }, 30);
        }
        function finishDraft(closed = false) {
            const d = draft; draft = null; hover = null; const f = F(); if (!d) return render();
            if (d.kind === 'wall' && d.pts.length > 1) { for (let i = 0; i < d.pts.length - 1; i++) { const a = d.pts[i], b = d.pts[i + 1]; if (Math.hypot(b[0] - a[0], b[1] - a[1]) > 5) f.walls.push({id: uid('w'), a: [...a], b: [...b], t: f.wallT, mat: 'platre'}); }
                if (closed && d.pts.length > 3) f.rooms.push({id: uid('r'), name: `Pièce ${f.rooms.length + 1}`, pts: d.pts.slice(0, -1).map(p => [...p]), floor: 'parquet'}); return commit(`${d.pts.length - 1} mur${d.pts.length > 2 ? 's' : ''}`); }
            if (d.kind === 'zone' && d.pts.length > 2) { const pts = closed ? d.pts.slice(0, -1) : d.pts; const rm = {id: uid('r'), name: `Pièce ${f.rooms.length + 1}`, pts, floor: 'parquet'}; f.rooms.push(rm); sel = {type: 'room', id: rm.id}; tab = 'props'; return commit('Pièce'); }
            if (d.kind === 'dim' && d.pts.length === 2) { f.dims.push({id: uid('m'), a: d.pts[0], b: d.pts[1]}); return commit('Cote'); }
            render();
        }
        const HINTS = {select: 'Clic : choisir · glisser : déplacer · poignées : allonger un mur, déformer une pièce · ⌫ : supprimer', pan: 'Glisser pour déplacer la vue', room: 'Glisse en diagonale : une pièce rectangulaire avec ses quatre murs (la surface s’affiche)', wall: 'Un clic par coin (aimant : grille, coins, angles droits ; Alt : libre) · double-clic ou Entrée : finir · clic sur le 1er point : fermer (et créer la pièce)', zone: 'Une pièce de forme libre (sans murs) : un clic par coin, double-clic pour finir', door: 'Clic sur un mur : une porte (glisse-la ensuite le long du mur)', window: 'Clic sur un mur : une fenêtre', dim: 'Deux clics : une cote (la distance s’affiche)', text: 'Clic : écrire un texte sur le plan'};
        function setTool(t) { if (draft && t !== tool) finishDraft(); tool = t; dlg.querySelectorAll('[data-hs-tool]').forEach(b => b.classList.toggle('is-active', b.dataset.hsTool === t)); stage.dataset.tool = t; hint(HINTS[t] || ''); numField(); }
        /* ─── précision : coordonnées, longueur et angle en direct, saisie au clavier ─── */
        const num = $('[data-hs-num]'), degOf = (a, b) => { const d = Math.atan2(-(b[1] - a[1]), b[0] - a[0]) * 180 / Math.PI; return r1((d + 360) % 360); }; // 0° vers la droite, 90° vers le haut
        function numField() { const on = ['wall', 'zone', 'dim', 'room'].includes(tool); num.hidden = !on; num.placeholder = tool === 'room' ? 'largeur x profondeur (ex. 420 x 350, 4,2 x 3,5 m) ↵' : 'longueur (cm, ou 3,5 m) puis @angle ↵'; if (!on) num.value = ''; }
        function readout(x, y) {
            const p = hover && ['wall', 'zone', 'dim', 'room'].includes(tool) ? hover : [x, y], fmt = v => String(r1(v)).replace('.', ',');
            $('[data-hs-xy]').textContent = `X ${fmt(p[0])} · Y ${fmt(p[1])} cm`;
            const last = draft?.pts?.[draft.pts.length - 1] || (draft?.kind === 'room' ? draft.a : null), q = draft?.kind === 'room' ? draft.b : hover;
            $('[data-hs-seg]').textContent = last && q ? (draft.kind === 'room' ? `${fmt(Math.abs(q[0] - last[0]))} × ${fmt(Math.abs(q[1] - last[1]))} cm` : `↦ ${fmtLen(Math.hypot(q[0] - last[0], q[1] - last[1]))} · ∠ ${String(degOf(last, q)).replace('.', ',')}°`) : '';
        }
        /** ce qu'on tape : « 350 », « 3,5 m », « 350 @ 90 » (angle en degrés, 90 = vers le haut) ; une pièce : « 420 x 350 » */
        function applyNum(raw) {
            const s2 = String(raw || '').trim().toLowerCase(); if (!s2) { if (draft) finishDraft(); return; }
            if (tool === 'room') { const [a, b0] = s2.split(/\s*[x×*]\s*/), b = b0 ?? a, u = (b.match(/(mm|cm|m)\s*$/) || [])[1], W = parseLen(u && !/(mm|cm|m)\s*$/.test(a) && parseLen(a) < 50 ? `${a} ${u}` : a), D = parseLen(b); // « 4,2 x 3,5 m » : l'unité vaut pour les deux (« 420 x 3,5 m » : 420 cm) if (!(W >= 50 && D >= 50)) return toast('Écris largeur x profondeur : 420 x 350 (cm) ou 4,2 x 3,5 m (50 cm au moins).', 'error');
                const r = stage.getBoundingClientRect(), o = draft?.a || hover || snapPt((r.width / 2 - panX) / zoom - W / 2, (r.height / 2 - panY) / zoom - D / 2, null); draft = null; makeRoomRect(o, [o[0] + W, o[1] + D]); num.value = ''; return; }
            if (!draft?.pts?.length) return toast('Clique d’abord le point de départ sur le plan, puis tape la longueur.', 'error');
            const [ls, as] = s2.split(/\s*[@<;]\s*/), L = parseLen(ls); if (!(L > 0)) return toast('Longueur incomprise : 350, 3,5 m, ou 350 @ 90 pour l’angle.', 'error');
            if (L <= 5) return toast(`${String(L).replace('.', ',')} cm, c’est trop court : pour des mètres, écris « ${ls} m ».`, 'error');
            const last = draft.pts[draft.pts.length - 1], prev = draft.pts[draft.pts.length - 2]; let ang;
            if (as !== undefined && as !== '') { const deg = Number(as.replace(',', '.').replace('°', '')); if (!Number.isFinite(deg)) return toast('Angle incompris (en degrés : 0 à droite, 90 en haut).', 'error'); ang = -deg * Math.PI / 180; }
            else if (hover && Math.hypot(hover[0] - last[0], hover[1] - last[1]) > 1) ang = Math.atan2(hover[1] - last[1], hover[0] - last[0]); // dans la direction de la souris
            else ang = prev ? Math.atan2(last[1] - prev[1], last[0] - prev[0]) : 0;
            const p = [r1(last[0] + Math.cos(ang) * L), r1(last[1] + Math.sin(ang) * L)]; draft.pts.push(p); hover = null; num.value = '';
            if (tool === 'dim' && draft.pts.length === 2) finishDraft(); else render(); readout(...p);
        }
        num.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); applyNum(num.value); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); num.value = ''; num.blur(); stage.focus({preventScroll: true}); } });
        /* ─── 🧲 aimants ─── */
        function paintSnap() {
            const box = $('[data-hs-snapbox]'), c = (k, l) => `<label class="checkbox-line"><input type="checkbox" data-hs-snap="${k}" ${snapO[k] ? 'checked' : ''}> ${l}</label>`;
            box.innerHTML = c('grid', 'Grille') + c('corner', 'Coins des murs et des pièces') + c('mid', 'Milieu des murs') + c('wall', 'Le long des murs (au cm)') + c('align', 'Alignements (lignes de rappel)') + c('angle', 'Angles')
                + `<label>Pas des angles<select data-hs-snap="step">${[90, 45, 30, 15, 5, 1].map(v => `<option value="${v}" ${snapO.step === v ? 'selected' : ''}>${v}°</option>`).join('')}</select></label><label>Pas de la grille<select data-hs-snapgrid>${[1, 2, 5, 10, 25, 50, 100].map(v => `<option value="${v}" ${H.grid === v ? 'selected' : ''}>${v} cm</option>`).join('')}</select></label>`
                + '<p class="muted">Alt : aucun aimant (au mm près) · ⇧ : angles à 45° · flèches : décaler ce qui est choisi de 1 cm (⇧ : d’un pas de grille) · en traçant, tape la longueur au clavier.</p>';
        }
        $('[data-hs-snapbox]').addEventListener('click', e => e.stopPropagation());
        $('[data-hs-snapbox]').addEventListener('change', e => { const el = e.target;
            if (el.matches('[data-hs-snapgrid]')) { H.grid = Number(el.value); commit('Grille'); return; }
            const k = el.dataset.hsSnap; if (!k) return; snapO[k] = k === 'step' ? Number(el.value) : el.checked; try { localStorage.setItem(SNAP_KEY, JSON.stringify(snapO)); } catch (_) {} });
        /** décaler au clavier ce qui est choisi */
        function nudge(dx, dy) {
            const f = F(); if (!sel) return;
            const moveCorner = (p, q) => f.walls.forEach(w => ['a', 'b'].forEach(k => { if (w[k][0] === p[0] && w[k][1] === p[1]) w[k] = [...q]; }));
            if (sel.type === 'item' || sel.type === 'label') { const o = f[sel.type === 'item' ? 'items' : 'labels'].find(q => q.id === sel.id); if (o) { o.x = r1(o.x + dx); o.y = r1(o.y + dy); } }
            else if (sel.type === 'wall') { const w = f.walls.find(q => q.id === sel.id); if (!w) return; const a = [...w.a], b = [...w.b], na = [r1(a[0] + dx), r1(a[1] + dy)], nb = [r1(b[0] + dx), r1(b[1] + dy)]; moveCorner(a, na); moveCorner(b, nb); w.a = na; w.b = nb; }
            else if (sel.type === 'room') { const rm = f.rooms.find(q => q.id === sel.id); if (rm) rm.pts = rm.pts.map(p => [r1(p[0] + dx), r1(p[1] + dy)]); }
            else if (sel.type === 'dim') { const dm = f.dims.find(q => q.id === sel.id); if (dm) { dm.a = [dm.a[0] + dx, dm.a[1] + dy]; dm.b = [dm.b[0] + dx, dm.b[1] + dy]; } }
            else if (sel.type === 'opening') { const o = f.openings.find(q => q.id === sel.id), w = o && f.walls.find(q => q.id === o.wall); if (!w) return; const L = wallLen(w) || 1, ux = (w.b[0] - w.a[0]) / L, uy = (w.b[1] - w.a[1]) / L, d = (dx * ux + dy * uy) || dx || dy; o.pos = clamp(o.pos + d / L, (o.w / 2 + 2) / L, 1 - (o.w / 2 + 2) / L); }
            later('Décalé');
        }
        /* ─── les commandes ─── */
        const placeItem = (base) => { const f = F(), r = stage.getBoundingClientRect(), x = (r.width / 2 - panX) / zoom, y = (r.height / 2 - panY) / zoom, g = H.grid || 10; const it = {id: uid('i'), x: Math.round(x / g) * g, y: Math.round(y / g) * g, rot: 0, ...base}; f.items.push(it); sel = {type: 'item', id: it.id}; setTool('select'); tab = 'props'; commit(`${it.name || libOf(it.kind)?.[1] || 'Objet'} posé`); };
        const pickPerson = title => new Promise(res => { let done = false;
            ext.openDialog({eyebrow: 'MAISON', title, submitLabel: 'Ajouter', body: `<label>Personne${A().collectionPersonField('hs_pick', null, 'Nom, prénom…')}</label>`,
                onOpen: dg => { setTimeout(() => dg.querySelector('[data-cp-input]')?.focus(), 30); dg.addEventListener('close', () => { if (!done) res(null); }, {once: true}); },
                onSubmit: f => { const id = Number(f.elements.hs_pick?.value) || 0; if (!id) { toast('Choisis une personne.', 'error'); return false; } done = true; res({id, label: f.querySelector('[data-cp-input]').value}); }}); });
        async function import3d() {
            const inp = Object.assign(document.createElement('input'), {type: 'file', accept: '.obj,.stl,.glb,.gltf,.mtl', multiple: true});
            inp.onchange = async () => {
                const files = [...inp.files]; if (!files.length) return; const main = files.find(f => /\.(obj|stl|glb|gltf)$/i.test(f.name)); if (!main) return toast('Il faut un fichier OBJ, STL, GLB ou glTF.', 'error');
                status('Lecture du modèle…');
                try {
                    // mesurer le modèle (et une vignette) avant de l'envoyer
                    const info = await ext.house3d?.inspect(main, files.find(f => /\.mtl$/i.test(f.name)));
                    const fd = new FormData(); fd.append('file', main); fd.append('name', main.name.replace(/\.[^.]+$/, '')); fd.append('dims', JSON.stringify(info?.dims || {})); fd.append('thumb', info?.thumb || ''); fd.append('csrf', A().state.csrf);
                    const r = await fetch('api.php?action=house_model_upload', {method: 'POST', body: fd, headers: {'X-CSRF-Token': A().state.csrf}}); const j = await r.json().catch(() => ({}));
                    if (!r.ok || j.error) throw new Error(j.error || 'Envoi impossible.');
                    let mtl = 0; const mf = files.find(f => /\.mtl$/i.test(f.name)); if (mf) { const fd2 = new FormData(); fd2.append('file', mf); fd2.append('name', main.name.replace(/\.[^.]+$/, '') + ' (couleurs)'); fd2.append('csrf', A().state.csrf); const r2 = await fetch('api.php?action=house_model_upload', {method: 'POST', body: fd2, headers: {'X-CSRF-Token': A().state.csrf}}); const j2 = await r2.json().catch(() => ({})); mtl = j2.result?.id || 0; }
                    const dims = info?.dims || {w: 100, d: 100, h: 100};
                    await loadMine(); status('Objet importé');
                    placeItem({kind: 'model', name: j.result.name, w: Math.max(5, Math.round(dims.w)), d: Math.max(5, Math.round(dims.d)), h: Math.max(5, Math.round(dims.h)), model: {id: j.result.id, ext: j.result.ext, ...(mtl ? {mtl} : {})}});
                    toast('Objet 3D importé : il est aussi dans Mobilier → « Mes objets », pour toutes les maisons.');
                } catch (e) { status(''); toast(e.message, 'error'); }
            };
            inp.click();
        }
        function importImg() {
            const inp = Object.assign(document.createElement('input'), {type: 'file', accept: 'image/*'});
            inp.onchange = async () => { const f = inp.files?.[0]; if (!f) return; const src = await shrink(f, 600); const im = await loadImg(src); const k = 100 / Math.max(im.naturalWidth, im.naturalHeight);
                placeItem({kind: 'image', name: f.name.replace(/\.[^.]+$/, ''), img: src, w: Math.round(im.naturalWidth * k), d: Math.round(im.naturalHeight * k), h: 80}); toast('Objet posé (vue de dessus) : règle sa taille réelle dans Propriétés.'); };
            inp.click();
        }
        function importPlan() {
            const inp = Object.assign(document.createElement('input'), {type: 'file', accept: 'image/*'});
            inp.onchange = async () => { const f = inp.files?.[0]; if (!f) return; const src = await shrink(f, 2200), im = await loadImg(src), k = 1000 / Math.max(im.naturalWidth, im.naturalHeight);
                H.ref = {src, x: 0, y: 0, w: im.naturalWidth * k, h: im.naturalHeight * k, op: .45, show: true, floor: F().id}; tab = 'floor'; commit('Plan scanné posé'); fit();
                toast('Plan posé en transparence : « 📏 Mettre à l’échelle » (Étage) — clique les deux bouts d’une longueur connue — puis trace les murs par-dessus.'); };
            inp.click();
        }
        function calibrate() {
            if (!H.ref) return; const pts = []; hint('Clique les deux bouts d’une longueur que tu connais sur le plan scanné (un mur, une cote)…'); setTool('select');
            const onDown = e => { e.stopPropagation(); e.preventDefault(); pts.push(toW(e)); if (pts.length < 2) return; svg.removeEventListener('pointerdown', onDown, true);
                const L = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]), real0 = A().askText({title: 'Mettre le plan à l’échelle', message: 'Quelle est la longueur réelle entre ces deux points ? (en cm, ou 5 m)', value: '500', okLabel: 'Mettre à l’échelle'}); hint(HINTS[tool]);
                real0.then(v => { const real = parseLen(v); if (!(real > 0) || L < 1) return; const k = real / L, [ox, oy] = pts[0]; H.ref.x = ox + (H.ref.x - ox) * k; H.ref.y = oy + (H.ref.y - oy) * k; H.ref.w *= k; H.ref.h *= k; commit('Plan scanné mis à l’échelle'); fit(); }); };
            svg.addEventListener('pointerdown', onDown, true);
        }
        const loadImg = src => new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ko(new Error('Image illisible.')); i.src = src; });
        const shrink = async (file, max) => { const src = await new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = ko; r.readAsDataURL(file); }); const im = await loadImg(src), k = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight)), c = document.createElement('canvas'); c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); return c.toDataURL(/png/i.test(file.type) ? 'image/png' : 'image/jpeg', .85); };
        async function loadMine() { try { mine = ((await api('house_models')).items || []).filter(m => m.ext !== 'mtl'); } catch (_) { mine = []; } }
        function planSvg(f = F()) {
            const pts = [...f.walls.flatMap(w => [w.a, w.b]), ...f.rooms.flatMap(r => r.pts), ...f.items.flatMap(i => [[i.x - i.w / 2, i.y - i.d / 2], [i.x + i.w / 2, i.y + i.d / 2]])]; if (!pts.length) return null;
            const m = 80, x0 = Math.min(...pts.map(p => p[0])) - m, y0 = Math.min(...pts.map(p => p[1])) - m, x1 = Math.max(...pts.map(p => p[0])) + m, y1 = Math.max(...pts.map(p => p[1])) + m;
            // l'étage demandé, sans la grille ni la sélection, même depuis la vue 3D ; puis on remet tout
            const z0 = zoom, px = panX, py = panY, s0 = sel, f0 = fi, want = H.floors.indexOf(f); zoom = 1; panX = -x0; panY = -y0; sel = null; if (want >= 0) fi = want; exporting = true;
            let body = '', dfs = ''; try { render(); body = world.innerHTML; dfs = $('[data-hs-defs]').innerHTML; } finally { exporting = false; zoom = z0; panX = px; panY = py; sel = s0; fi = f0; render(); }
            return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0} ${y0} ${x1 - x0} ${y1 - y0}" width="${Math.round(x1 - x0)}" height="${Math.round(y1 - y0)}"><style>.h-hs-rname{font-family:Georgia,serif;text-anchor:middle;fill:#3a3530;font-weight:700}.h-hs-rarea{font-family:Georgia,serif;text-anchor:middle;fill:#6a6560}.h-hs-iname{font-family:Helvetica,sans-serif;text-anchor:middle;fill:#555}.h-hs-label{font-family:Georgia,serif;fill:#3a3530}.h-hs-dim path{stroke:#2a5db0;stroke-width:1;fill:none}.h-hs-dim text{fill:#2a5db0;text-anchor:middle;font-family:Helvetica,sans-serif}</style><defs>${dfs}</defs><rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="#fff"/>${body}<text x="${x0 + 30}" y="${y1 - 30}" font-family="Georgia,serif" font-size="36" fill="#3a3530">${esc(name)} — ${esc(f.name)}</text></svg>`;
        }
        const svgToPng = svgText => new Promise((ok, ko) => { const m = svgText.match(/width="(\d+)" height="(\d+)"/), W = Math.min(6000, +m[1] * 2), Hh = Math.min(6000, +m[2] * 2), url = URL.createObjectURL(new Blob([svgText], {type: 'image/svg+xml'})), i = new Image(); i.onload = () => { const c = document.createElement('canvas'); c.width = W; c.height = Hh; c.getContext('2d').drawImage(i, 0, 0, W, Hh); URL.revokeObjectURL(url); c.toBlob(ok, 'image/png'); }; i.onerror = () => { URL.revokeObjectURL(url); ko(new Error('Image impossible.')); }; i.src = url; });
        const download = (blob, fname) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fname; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
        const fname = ext2 => `${A().safeExportFilename ? A().safeExportFilename(name, 'maison') : 'maison'}.${ext2}`;
        async function thumb() { const s = planSvg(H.floors.find(f => f.level === 0) || F()); if (!s) return ''; try { const b = await svgToPng(s.replace(/width="(\d+)" height="(\d+)"/, (m0, w, h) => { const k = 240 / Math.max(+w, +h); return `width="${Math.round(w * k)}" height="${Math.round(h * k)}"`; })); return await new Promise(ok => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(b); }); } catch (_) { return ''; } }
        async function save() {
            name = $('[data-hs-name]').value.trim() || 'Maison de famille'; status('Enregistrement…');
            try { const r = await post('save_house', {id, name, place_id: placeId, place_text: placeText, period, house: H, thumb: await thumb()}); id = r.result.id; dirty = false; status('✓ Enregistré'); toast('Maison enregistrée (Listes → Maisons de famille).'); ctx.onSaved?.(id); } catch (e) { status(''); toast(e.message, 'error'); }
        }
        async function toggle3d(on) {
            dlg.querySelectorAll('[data-hs-mode]').forEach(b => b.classList.toggle('is-active', b.dataset.hsMode === (on ? '3d' : '2d'))); $('[data-hs-pbar]').hidden = !!on;
            if (on && !view3d) { if (!ext.house3d) return toast('Vue 3D indisponible.', 'error'); status('Construction de la maison en 3D…'); const box = $('[data-hs-3d]'); box.hidden = false; svg.style.display = 'none';
                try { view3d = await ext.house3d.mount(box, H, fi); status(''); hint('Glisser : tourner · clic droit ou ⇧ glisser : déplacer · molette : approcher · 🚶 visite : flèches ou Z Q S D'); } catch (e) { box.hidden = true; svg.style.display = ''; status(''); return toast(e.message, 'error'); } }
            if (!on && view3d) { view3d.destroy(); view3d = null; $('[data-hs-3d]').hidden = true; svg.style.display = ''; hint(HINTS[tool]); render(); }
        }
        function close() { if (dirty && !confirm('Fermer sans enregistrer la maison ?')) return; view3d?.destroy(); document.removeEventListener('keydown', onKey, true); document.removeEventListener('keyup', onKeyUp, true); dlg.close(); dlg.remove(); ctx.onClose?.(); }
        const CMD = {
            close, save, undo: () => restore(hpos - 1), redo: () => restore(hpos + 1),
            del: () => { const f = F(); if (!sel) return; if (sel.type === 'wall') { f.openings = f.openings.filter(o => o.wall !== sel.id); f.walls = f.walls.filter(w => w.id !== sel.id); } else { const k = {room: 'rooms', item: 'items', opening: 'openings', label: 'labels', dim: 'dims'}[sel.type]; f[k] = f[k].filter(q => q.id !== sel.id); } sel = null; commit('Supprimé'); },
            dup: () => { const it = F().items.find(q => q.id === sel?.id); if (!it) return; const c = {...JSON.parse(JSON.stringify(it)), id: uid('i'), x: it.x + 30, y: it.y + 30}; F().items.push(c); sel = {type: 'item', id: c.id}; commit('Dupliqué'); },
            rot90: () => { const it = F().items.find(q => q.id === sel?.id); if (!it) return; it.rot = ((it.rot || 0) + 90) % 360; commit('Tourné'); },
            swing: () => { const o = F().openings.find(q => q.id === sel?.id); if (!o) return; o.swing = o.swing === 'right' ? 'left' : 'right'; commit('Sens d’ouverture'); }, flip: () => { const o = F().openings.find(q => q.id === sel?.id); if (!o) return; o.flip = !o.flip; commit('Côté d’ouverture'); },
            split: () => { const f = F(), w = f.walls.find(q => q.id === sel?.id); if (!w) return; const m = [(w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2], w2 = {...JSON.parse(JSON.stringify(w)), id: uid('w'), a: [...m]}; w.b = [...m]; f.walls.push(w2); f.openings.filter(o => o.wall === w.id).forEach(o => { if (o.pos > .5) { o.wall = w2.id; o.pos = (o.pos - .5) * 2; } else o.pos *= 2; }); commit('Mur coupé'); },
            addfloor: () => { const top = Math.max(...H.floors.map(f => f.level)), low = Math.min(...H.floors.map(f => f.level)), up = newFloor(top + 1).name, down = newFloor(low - 1).name;
                ext.openDialog({eyebrow: 'MAISON', title: '＋ Un étage', submitLabel: 'Ajouter',
                    body: `<fieldset class="h-hs-where"><legend>Où ?</legend><label class="checkbox-line"><input type="radio" name="where" value="up" checked> Au-dessus : <b>${esc(up)}</b></label><label class="checkbox-line"><input type="radio" name="where" value="down"> En dessous : <b>${esc(down)}</b> (cave, sous-sol)</label></fieldset>
                        <div class="form-grid"><label>Nom<input name="name" maxlength="60" placeholder="${esc(up)}"></label><label>Hauteur sous plafond (cm)<input name="height" type="number" min="150" max="800" value="${F().height || 270}"></label></div>
                        <label class="checkbox-line"><input type="checkbox" name="copy"> Reprendre les murs de « ${esc(F().name)} » (et ses fenêtres)</label>`,
                    onOpen: dg => dg.addEventListener('change', e => { if (e.target.name === 'where') dg.querySelector('[name=name]').placeholder = e.target.value === 'up' ? up : down; }),
                    onSubmit: form => { const isUp = form.querySelector('[name=where]:checked').value === 'up', src = F(), f = newFloor(isUp ? top + 1 : low - 1), nm = form.querySelector('[name=name]').value.trim(), hgt = Number(form.querySelector('[name=height]').value);
                        if (nm) f.name = nm.slice(0, 60); if (hgt >= 150 && hgt <= 800) f.height = hgt;
                        if (form.querySelector('[name=copy]').checked) { const map = new Map(); f.walls = src.walls.map(w => { const n = {...JSON.parse(JSON.stringify(w)), id: uid('w')}; map.set(w.id, n.id); return n; }); f.openings = src.openings.filter(o => o.type === 'window').map(o => ({...o, id: uid('o'), wall: map.get(o.wall)})); f.wallT = src.wallT; }
                        H.floors.push(f); fi = H.floors.length - 1; sel = null; commit(`${f.name} ajouté`); }}); },
            floors: () => { const rows = () => [...H.floors].map((f, i) => [f, i]).sort((a, b) => b[0].level - a[0].level);
                ext.openDialog({eyebrow: 'MAISON', title: '⋯ Les étages', submitLabel: 'Enregistrer', wide: true,
                    body: `<p class="muted">Du plus haut au plus bas. Renomme, change la hauteur, ou supprime un étage (avec tout ce qu’il contient).</p><table class="h-hs-floortab"><thead><tr><th>Nom</th><th>Hauteur (cm)</th><th>Contenu</th><th></th></tr></thead><tbody>${rows().map(([f, i]) => `<tr data-fl="${i}"><td><input data-fn value="${esc(f.name)}" maxlength="60"></td><td><input data-fh type="number" min="150" max="800" value="${f.height}"></td><td class="muted">${f.walls.length} mur${f.walls.length > 1 ? 's' : ''}, ${f.rooms.length} pièce${f.rooms.length > 1 ? 's' : ''}, ${f.items.length} objet${f.items.length > 1 ? 's' : ''}</td><td><button type="button" class="button small danger" data-fdel>🗑 Supprimer</button></td></tr>`).join('')}</tbody></table>`,
                    onOpen: dg => dg.addEventListener('click', e => { const b = e.target.closest('[data-fdel]'); if (!b) return; const tr = b.closest('tr'); if (dg.querySelectorAll('tr[data-fl]:not(.is-del)').length < 2) return toast('Il faut au moins un étage.', 'error'); tr.classList.toggle('is-del'); b.textContent = tr.classList.contains('is-del') ? '↺ Garder' : '🗑 Supprimer'; }),
                    onSubmit: form => { const del = []; form.querySelectorAll('tr[data-fl]').forEach(tr => { const f = H.floors[Number(tr.dataset.fl)]; if (tr.classList.contains('is-del')) { del.push(f); return; } f.name = tr.querySelector('[data-fn]').value.trim().slice(0, 60) || f.name; const h = Number(tr.querySelector('[data-fh]').value); if (h >= 150 && h <= 800) f.height = h; });
                        if (del.length && !confirm(`Supprimer ${del.map(f => `« ${f.name} »`).join(', ')} et tout ce qu’${del.length > 1 ? 'ils contiennent' : 'il contient'} ?`)) return false;
                        const cur = F(); H.floors = H.floors.filter(f => !del.includes(f)); fi = Math.max(0, H.floors.indexOf(cur)); if (!H.floors.includes(cur)) fi = Math.max(0, H.floors.findIndex(f => f.level === 0)); sel = null; commit(del.length ? `${del.length} étage${del.length > 1 ? 's' : ''} supprimé${del.length > 1 ? 's' : ''}` : 'Étages'); }}); },
            dupfloor: () => { const src = F(), f = newFloor(Math.max(...H.floors.map(q => q.level)) + 1), map = new Map(); f.walls = src.walls.map(w => { const n = {...JSON.parse(JSON.stringify(w)), id: uid('w')}; map.set(w.id, n.id); return n; }); f.openings = src.openings.filter(o => o.type === 'window').map(o => ({...o, id: uid('o'), wall: map.get(o.wall)})); f.wallT = src.wallT; f.height = src.height; H.floors.push(f); fi = H.floors.length - 1; commit(`${f.name} (murs repris)`); },
            delfloor: () => { if (H.floors.length < 2) return toast('Il faut au moins un étage.', 'error'); if (!confirm(`Supprimer « ${F().name} » et tout ce qu’il contient ?`)) return; H.floors.splice(fi, 1); fi = 0; sel = null; commit('Étage supprimé'); },
            import3d, importimg: importImg, importplan: importPlan, calib: calibrate,
            refmove: () => { if (!H.ref) return; H.ref.moving = !H.ref.moving; toast(H.ref.moving ? 'Glisse le plan scanné (sur un endroit vide). Reclique pour finir.' : 'Plan scanné fixé.'); }, refdel: () => { H.ref = null; commit('Plan scanné retiré'); },
            addpeople: async () => { const p = await pickPerson('Un habitant de la maison'); if (!p) return; H.meta.people = [...(H.meta.people || []), {...p, role: ''}]; tab = 'house'; commit('Habitant ajouté'); },
            roompeople: async () => { const rm = F().rooms.find(q => q.id === sel?.id); if (!rm) return; const p = await pickPerson('Une personne liée à cette pièce'); if (!p) return; rm.people = [...(rm.people || []), p]; commit('Personne liée à la pièce'); },
            png: async () => { const s = planSvg(); if (!s) return toast('Le plan est vide.', 'error'); download(await svgToPng(s), fname('png')); }, svg: () => { const s = planSvg(); if (!s) return toast('Le plan est vide.', 'error'); download(new Blob([s], {type: 'image/svg+xml'}), fname('svg')); },
            print: () => { const s = planSvg(); if (!s) return toast('Le plan est vide.', 'error'); const w = window.open('', '_blank'); if (!w) return toast('Fenêtre bloquée.', 'error'); w.document.write(`<!doctype html><meta charset="utf-8"><title>${esc(name)}</title><style>@page{margin:10mm}body{margin:0;display:flex;justify-content:center}svg{max-width:100%;height:auto;max-height:97vh}</style>${s}<script>onload=()=>setTimeout(()=>print(),250)<\/script>`); w.document.close(); },
            shot3d: async () => { if (!view3d) { await toggle3d(true); await new Promise(r => setTimeout(r, 400)); } const b = await view3d?.shot(); if (b) download(b, fname('png')); },
        };
        /* ─── événements ─── */
        dlg.addEventListener('click', async e => {
            const b = e.target.closest('button'); if (!b) return; const d = b.dataset; b.closest('details')?.removeAttribute('open');
            if (d.hsCmd) return CMD[d.hsCmd]?.();
            if (d.hsTool) { if (view3d) await toggle3d(false); return setTool(d.hsTool); }
            if (d.hsTab) { tab = d.hsTab; if (tab === 'lib' && !mine.length) await loadMine(); return paintSide(); }
            if (d.hsMode) return toggle3d(d.hsMode === '3d');
            if (d.hsFloor !== undefined) { fi = Number(d.hsFloor); sel = null; draft = null; if (view3d) view3d.update(H, fi); render(); return; }
            if (d.hsCat) { libCat = d.hsCat; libQ = ''; if (libCat === 'Mes objets') await loadMine(); return paintSide(); }
            if (d.hsLib) { const L = libOf(d.hsLib); if (view3d) await toggle3d(false); return placeItem({kind: L[0], w: L[3], d: L[4], h: L[5], color: L[6]}); }
            if (d.hsMine) { const m = mine.find(q => q.id === Number(d.hsMine)); if (!m) return; if (view3d) await toggle3d(false); return placeItem({kind: 'model', name: m.name, w: Math.round(m.dims?.w || 100), d: Math.round(m.dims?.d || 100), h: Math.round(m.dims?.h || 100), model: {id: m.id, ext: m.ext}}); }
            if (d.hsPopen) { if (dirty && !confirm('Ouvrir la fiche ? La maison non enregistrée sera perdue (💾 d’abord).')) return; dirty = false; close(); A().openPersonById?.(Number(d.hsPopen)); return; }
            if (d.hsPdel !== undefined) { H.meta.people.splice(Number(d.hsPdel), 1); return commit('Habitant retiré'); }
            if (d.hsRpdel !== undefined) { const rm = F().rooms.find(q => q.id === sel?.id); rm?.people?.splice(Number(d.hsRpdel), 1); return commit('Personne retirée'); }
            if (d.hsPlace !== undefined) { const p = pane.querySelector('[data-hs-placeres]')._rows[Number(d.hsPlace)]; placeId = Number(p.id) || 0; placeText = p.name + (p.detail ? `, ${p.detail}` : ''); if (name === 'Maison de famille') { name = `Maison de ${p.name}`; $('[data-hs-name]').value = name; } pane.querySelector('[data-hs-placeres]').innerHTML = ''; dirty = true; paintSide(); return; }
        });
        dlg.addEventListener('dblclick', e => { const b = e.target.closest('[data-hs-floor]'); if (!b) return; const f = H.floors[Number(b.dataset.hsFloor)]; A().askText({title: 'Renommer l’étage', value: f.name, okLabel: 'Renommer'}).then(n => { if (n?.trim()) { f.name = n.trim().slice(0, 60); commit('Étage renommé'); } }); });
        let tmr = 0;
        pane.addEventListener('input', e => {
            const el = e.target, f = F(), v = el.type === 'checkbox' ? el.checked : el.value;
            if (el.matches('[data-hs-libq]')) { libQ = el.value; clearTimeout(tmr); tmr = setTimeout(() => { const p0 = el.selectionStart; paintSide(); const i = pane.querySelector('[data-hs-libq]'); i.focus(); i.setSelectionRange(p0, p0); }, 200); return; }
            if (el.dataset.hsF) { const k = el.dataset.hsF; f[k] = ['level', 'height', 'wallT'].includes(k) ? Number(v) : v; later('Étage'); return; }
            if (el.dataset.hsH) { H[el.dataset.hsH] = Number(v); later('Grille'); return; }
            if (el.dataset.hsRoof) { H.roof = H.roof || {}; H.roof[el.dataset.hsRoof] = el.dataset.hsRoof === 'pitch' ? Number(v) : v; later('Toit'); return; }
            if (el.dataset.hsRef && H.ref) { if (el.dataset.hsRef === 'op') H.ref.op = Number(v) / 100; else H.ref.show = v; later('Plan scanné'); return; }
            if (el.dataset.hsM) { if (el.dataset.hsM === 'period') period = v; else H.meta[el.dataset.hsM] = v; dirty = true; return; }
            if (el.dataset.hsProle !== undefined) { H.meta.people[Number(el.dataset.hsProle)].role = v; dirty = true; return; }
            if (el.matches('[data-hs-placeq]')) { placeText = el.value; placeId = 0; dirty = true; clearTimeout(tmr); tmr = setTimeout(async () => { const rows = ((await api('board_place_search', {q: el.value.trim()}).catch(() => ({places: []}))).places || []), box = pane.querySelector('[data-hs-placeres]'); box._rows = rows; box.innerHTML = rows.map((p, i) => `<button type="button" class="link-button" data-hs-place="${i}">📍 ${esc(p.name)} <small class="muted">${esc(p.detail || '')}</small></button>`).join(''); }, 250); return; }
            if (el.dataset.hsP && sel) {
                if (sel.type === 'wall' && ['len', 'ang', 'ax', 'ay', 'bx', 'by'].includes(el.dataset.hsP) && !el._geo) return; // la géométrie d'un mur : appliquée une fois la valeur finie (sinon les coins voisins se décrochent en cours de frappe)
                const k = el.dataset.hsP, o = sel.type === 'wall' ? f.walls.find(q => q.id === sel.id) : sel.type === 'room' ? f.rooms.find(q => q.id === sel.id) : sel.type === 'item' ? f.items.find(q => q.id === sel.id) : sel.type === 'opening' ? f.openings.find(q => q.id === sel.id) : sel.type === 'label' ? f.labels.find(q => q.id === sel.id) : null; if (!o) return;
                if (sel.type === 'wall' && k === 'len') { const L = wallLen(o), n = Number(v); if (n > 5 && L) { const nb = [o.a[0] + (o.b[0] - o.a[0]) / L * n, o.a[1] + (o.b[1] - o.a[1]) / L * n]; f.walls.forEach(q => { if (q !== o) ['a', 'b'].forEach(kk => { if (q[kk][0] === o.b[0] && q[kk][1] === o.b[1]) q[kk] = [...nb]; }); }); o.b = nb; } }
                else if (sel.type === 'wall' && ['ang', 'ax', 'ay', 'bx', 'by'].includes(k)) { const n = Number(v); if (v === '' || !Number.isFinite(n)) return; const oa = [...o.a], ob = [...o.b];
                    if (k === 'ang') { const L = wallLen(o); o.b = [r1(o.a[0] + Math.cos(-n * Math.PI / 180) * L), r1(o.a[1] + Math.sin(-n * Math.PI / 180) * L)]; } else { const e2 = k[0] === 'a' ? 'a' : 'b'; o[e2] = k[1] === 'x' ? [n, o[e2][1]] : [o[e2][0], n]; }
                    f.walls.forEach(q => { if (q !== o) ['a', 'b'].forEach(kk => { if (q[kk][0] === oa[0] && q[kk][1] === oa[1]) q[kk] = [...o.a]; else if (q[kk][0] === ob[0] && q[kk][1] === ob[1]) q[kk] = [...o.b]; }); }); }
                else if (sel.type === 'opening' && (k === 'from' || k === 'to')) { const w = f.walls.find(q => q.id === o.wall), L = w ? wallLen(w) : 0, n = Number(v); if (!L || v === '' || !Number.isFinite(n)) return; const s0 = k === 'from' ? n : L - n - o.w; o.pos = clamp((s0 + o.w / 2) / L, (o.w / 2) / L, 1 - (o.w / 2) / L); }
                else if (k === 'pos') o.pos = Number(v) / 1000;
                else if (k === 'hgt') o.h = Number(v);
                else if (['t', 'w', 'd', 'h', 'rot', 'sill', 'size', 'elev'].includes(k)) o[k] = v === '' ? undefined : Number(v);
                else if ((k === 'x' || k === 'y') && v !== '' && Number.isFinite(Number(v))) o[k] = Number(v);
                else o[k] = v;
                later('Réglage'); return;
            }
        });
        pane.addEventListener('change', e => { if (tmr) { clearTimeout(tmr); tmr = 0; } const el = e.target; if (sel?.type === 'wall' && ['len', 'ang', 'ax', 'ay', 'bx', 'by'].includes(el.dataset?.hsP)) { el._geo = true; el.dispatchEvent(new Event('input', {bubbles: true})); el._geo = false; } });
        let laterT = 0; const later = label => { render(); clearTimeout(laterT); laterT = setTimeout(() => commit(label), 500); };
        const onKey = e => {
            if (!dlg.open || document.querySelector('dialog[open]:not(.h-hs-dlg)')) return;
            const mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
            if (mod && k === 's') { e.preventDefault(); save(); return; }
            if (e.target.closest?.('input, textarea, select')) return;
            if (mod && k === 'z') { e.preventDefault(); restore(e.shiftKey ? hpos + 1 : hpos - 1); return; }
            if (k === ' ' && !space) { space = true; stage.dataset.tool = 'pan'; e.preventDefault(); return; }
            if (k === 'escape') { e.preventDefault(); if (draft) { draft = null; hover = null; render(); } else if (sel) { sel = null; render(); } else if (tool !== 'select') setTool('select'); return; }
            if (k === 'enter' && draft) { finishDraft(); return; }
            if ((k === 'delete' || k === 'backspace') && sel) { e.preventDefault(); CMD.del(); return; }
            if (k === 'r' && sel?.type === 'item') { CMD.rot90(); return; }
            const arr = {arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1]}[k]; if (arr && sel && !view3d && !mod) { e.preventDefault(); const st = e.shiftKey ? (H.grid || 10) : 1; nudge(arr[0] * st, arr[1] * st); return; }
            if (/^[0-9]$/.test(e.key) && !mod && !view3d && !num.hidden && (draft?.pts?.length || tool === 'room')) { e.preventDefault(); num.value = e.key; num.focus(); return; } // taper une longueur
            const t = {v: 'select', h: 'pan', w: 'wall', p: 'zone', d: 'door', f: 'window', m: 'dim', t: 'text', r: 'room'}[k]; if (t && !mod) setTool(t);
        };
        const onKeyUp = e => { if (e.key === ' ') { space = false; stage.dataset.tool = tool; } };
        document.addEventListener('keydown', onKey, true); document.addEventListener('keyup', onKeyUp, true);
        dlg.addEventListener('cancel', e => { e.preventDefault(); const ae = document.activeElement; if (ae && dlg.contains(ae) && ae.matches('input, textarea, select')) { ae.blur(); stage.focus({preventScroll: true}); return; } if (draft) { draft = null; render(); return; } if (sel) { sel = null; render(); return; } close(); }); // Échap : quitter le champ, le tracé, la sélection, puis fermer
        new ResizeObserver(() => { if (dlg.isConnected && !view3d) render(); }).observe(stage);
        $('.h-hs-snapm').addEventListener('toggle', e => { if (e.target.open) paintSnap(); }); paintSnap(); ext.tbApply?.(dlg, 'house'); ext.editorKeysAttach?.(dlg, 'house'); // boutons rangés à sa façon (⚙️ Personnaliser), raccourcis à soi
        setTool(H.floors.some(f => f.walls.length) ? 'select' : 'room'); hist = [snap0()]; hpos = 0; fit(); render(); stage.focus({preventScroll: true});
        return {get house() { return H; }, setTool, commit, render, toggle3d, save, cmd: k => CMD[k]?.()};
    }

    /* ═════════ La liste « Maisons de famille » ═════════ */
    async function listPage(token) {
        const S = A().state, ws = A().$('#workspace');
        let items = []; try { items = (await api('houses')).items || []; } catch (e) { toast(e.message, 'error'); }
        if (token !== S.workspaceToken || S.module !== 'listes') return;
        let q = '';
        const draw = () => { const n = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''), list = items.filter(h => n(`${h.name} ${h.place} ${h.period}`).includes(n(q)));
            ws.querySelector('[data-hs-grid]').innerHTML = list.map(h => `<article class="h-hs-card"><button type="button" class="h-hs-cimg" data-hs-open="${h.id}">${h.thumb ? `<img src="${esc(h.thumb)}" alt="">` : '<span>🏠</span>'}</button><div><h3><button type="button" class="table-link" data-hs-open="${h.id}">${esc(h.name)}</button></h3><p class="muted">${esc([h.place, h.period].filter(Boolean).join(' · ') || 'Lieu à préciser')}</p><p class="muted">${h.floors} étage${h.floors > 1 ? 's' : ''} · ${h.rooms} pièce${h.rooms > 1 ? 's' : ''}${h.people ? ` · ${h.people} habitant${h.people > 1 ? 's' : ''}` : ''}</p>
                <div class="h-hs-cact"><button type="button" class="button small" data-hs-open="${h.id}">Ouvrir</button><button type="button" class="button small secondary" data-hs-ren="${h.id}">✎</button><button type="button" class="button small secondary" data-hs-del="${h.id}">🗑</button></div></div></article>`).join('') || A().empty(items.length ? 'Aucune maison ne correspond.' : 'Aucune maison pour l’instant : « ＋ Nouvelle maison ».'); };
        ws.innerHTML = `<section class="page collection-page" data-dnd-off><header class="page-header"><div><span class="eyebrow">LISTES</span><h2>🏠 Maisons de famille</h2><p>Les plans des maisons de la famille, en 2D et en 3D : leurs pièces, leurs meubles, leurs habitants et leurs souvenirs.</p></div><button type="button" class="button" data-hs-new>＋ Nouvelle maison</button></header>
            <div class="h-et-bar"><input type="search" data-hs-q placeholder="Chercher une maison (nom, lieu, époque)…"></div><div class="h-hs-cards" data-hs-grid></div></section>`;
        draw();
        const again = () => { if (S.module === 'listes' && S.listType === 'houses') listPage(++S.workspaceToken); };
        ws.onclick = async e => { const b = e.target.closest('button'); if (!b) return; const d = b.dataset;
            try { if (d.hsNew !== undefined) return open({onSaved: again, onClose: again}); if (d.hsOpen) return open({id: Number(d.hsOpen), onSaved: again, onClose: again});
                if (d.hsRen) { const h = items.find(x => x.id === Number(d.hsRen)), n = await A().askText({title: 'Renommer la maison', message: 'Nouveau nom :', value: h.name, okLabel: 'Renommer'}); if (!n?.trim()) return; await post('rename_house', {id: h.id, name: n.trim()}); return again(); }
                if (d.hsDel) { const h = items.find(x => x.id === Number(d.hsDel)); if (!confirm(`Supprimer « ${h.name} » ?`)) return; await post('delete_house', {id: h.id}); return again(); } } catch (err) { toast(err.message, 'error'); } };
        ws.oninput = e => { if (e.target.matches('[data-hs-q]')) { q = e.target.value; draw(); } };
    }
    ext.lists = ext.lists || {}; ext.lists.houses = listPage;
    ext.openHouse = open;
    ext.houseInternals = {sym2d, area, LIB};
    ext.editToolsExtra = ext.editToolsExtra || [];
    ext.editToolsExtra.push({key: 'house', icon: '🏠', label: 'Maison (plan et 3D)', what: 'maison',
        load: async () => ((await api('houses')).items || []).map(h => ({id: h.id, name: h.name, date: h.updated_at, thumb: h.thumb ? `<img src="${esc(h.thumb)}" alt="">` : '<span class="h-et-ico">🏠</span>', info: [h.place, h.period, `${h.rooms} pièce${h.rooms > 1 ? 's' : ''}`].filter(Boolean).join(' · ')})),
        open: (id, again) => open({id, onSaved: again, onClose: again}), create: again => open({onSaved: again, onClose: again}),
        rename: (id, name) => post('rename_house', {id, name}), remove: id => post('delete_house', {id}), createLabel: '＋ Nouvelle maison'});
})();
