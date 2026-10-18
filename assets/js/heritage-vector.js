/* LCNDA — ✒️ Dessin vectoriel (façon Illustrator) : plan de travail, sélection, sélection directe (points et poignées),
 * plume, crayon, rectangle, ellipse, polygone, étoile, ligne, texte, pipette, main, loupe ; calques, groupes, masques
 * d'écrêtage, alignement, Pathfinder (union, soustraction, intersection, exclusion), dégradés, vectorisation d'une image
 * (noir et blanc ou en couleurs) ; blasons (écus, partitions, pièces, émaux, meubles, blasonnement) ;
 * import SVG / PNG / JPG / WEBP / GIF / BMP, export SVG / PNG / JPG / WEBP / PDF ; enregistrement comme forme
 * (« Mes formes » des tableaux), dans les médias d'une fiche ou comme image d'armoiries.
 * Serveur : lib/vector.php. Listes → Outils de modification → « Dessin vectoriel ».
 * Rien d'un SVG importé n'est recopié tel quel : seules la géométrie et des couleurs vérifiées sont lues.
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP;
    const K = () => ext.boardKit;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const api = (...a) => A().api(...a);
    const post = (action, body) => api(action, {}, {method: 'POST', body});
    const toast = (...a) => A().toast(...a);
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const n2 = v => Math.round((Number(v) || 0) * 100) / 100;
    const num = (v, d = 0) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : d; };
    const uid = () => 'o' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    const clone = v => JSON.parse(JSON.stringify(v));
    /** une couleur sûre ; 'none' permis */
    const col = (c, fb = '#000000') => { const t = String(c ?? '').trim(); return t === 'none' || /^#[0-9a-f]{3,8}$/i.test(t) || /^[a-z]{3,20}$/i.test(t) || /^(rgb|hsl)a?\([\d\s.,%]+\)$/i.test(t) ? t : fb; };
    const font = f => String(f || '').replace(/[^\w\s,\-'À-ÿ]/g, '').replace(/'/g, '').slice(0, 80) || 'Georgia';
    const imgOk = s => /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(String(s || '')) || /^media\/[A-Za-z0-9._%\-]{1,240}$/.test(String(s || ''));

    /* ═════════ Émaux, écus, partitions, pièces : les blasons ═════════ */
    const TINCTURES = [['or', 'Or', '#f4c430'], ['argent', 'Argent', '#ffffff'], ['gueules', 'Gueules', '#d81e1e'], ['azur', 'Azur', '#1f4fa3'], ['sinople', 'Sinople', '#1a8a3a'],
        ['sable', 'Sable', '#151515'], ['pourpre', 'Pourpre', '#7b3f8c'], ['orange', 'Orangé', '#e6862a'], ['sanguine', 'Sanguine', '#8e1b1b'], ['carnation', 'Carnation', '#f2c9a8'], ['naturel', 'Au naturel (brun)', '#8b5a2b']];
    const tinctureName = hex => TINCTURES.find(t => t[2].toLowerCase() === String(hex).toLowerCase())?.[0];
    // écus dans une boîte 100 × 120
    const ESCUTCHEONS = [['francais', 'Écu français moderne', 'M0 0H100V92Q100 106 86 106H62Q53 106 50 120Q47 106 38 106H14Q0 106 0 92Z'],
        ['ancien', 'Écu ancien (triangulaire)', 'M0 0H100V44C100 84 76 106 50 120C24 106 0 84 0 44Z'],
        ['espagnol', 'Écu espagnol (arrondi)', 'M0 0H100V70C100 98 78 120 50 120C22 120 0 98 0 70Z'],
        ['suisse', 'Écu suisse', 'M0 10Q25 -2 50 8Q75 -2 100 10V68C100 96 76 112 50 120C24 112 0 96 0 68Z'],
        ['anglais', 'Écu à pointes (anglais)', 'M0 0Q12 9 25 2Q37 9 50 2Q62 9 75 2Q87 9 100 0V62C100 94 76 112 50 120C24 112 0 94 0 62Z'],
        ['allemand', 'Écu allemand (à encoche)', 'M0 4Q30 0 60 4Q58 16 72 18Q86 18 92 6L100 4V66C100 96 76 112 50 120C24 112 0 96 0 66Z'],
        ['losange', 'Losange (dames)', 'M50 0L100 60L50 120L0 60Z'], ['ovale', 'Ovale (ecclésiastiques)', 'M50 0C78 0 100 27 100 60C100 93 78 120 50 120C22 120 0 93 0 60C0 27 22 0 50 0Z'],
        ['rond', 'Rond (cartouche)', 'M50 10C78 10 100 32 100 60C100 88 78 110 50 110C22 110 0 88 0 60C0 32 22 10 50 10Z'],
        ['banniere', 'Bannière (carrée)', 'M0 0H100V120H0Z']];
    // partitions et pièces : des polygones dans la même boîte (l'écu les découpe)
    const DIVISIONS = [['plein', 'Plein (un seul émail)', [], '%a'], ['parti', 'Parti', [[50, 0, 100, 0, 100, 120, 50, 120]], 'Parti %a et %b'], ['coupe', 'Coupé', [[0, 60, 100, 60, 100, 120, 0, 120]], 'Coupé %a et %b'],
        ['tranche', 'Tranché', [[0, 0, 100, 120, 0, 120]], 'Tranché %a et %b'], ['taille', 'Taillé', [[100, 0, 100, 120, 0, 120]], 'Taillé %a et %b'],
        ['ecartele', 'Écartelé', [[50, 0, 100, 0, 100, 60, 50, 60], [0, 60, 50, 60, 50, 120, 0, 120]], 'Écartelé %a et %b'],
        ['sautoir_e', 'Écartelé en sautoir', [[0, 0, 50, 60, 0, 120], [100, 0, 50, 60, 100, 120]], 'Écartelé en sautoir %a et %b'],
        ['tierce_f', 'Tiercé en fasce', [[0, 40, 100, 40, 100, 80, 0, 80]], 'Tiercé en fasce %a, %b et %a'], ['tierce_p', 'Tiercé en pal', [[33.3, 0, 66.6, 0, 66.6, 120, 33.3, 120]], 'Tiercé en pal %a, %b et %a'],
        ['gironne', 'Gironné', [[50, 60, 50, 0, 100, 0], [50, 60, 100, 60, 100, 120], [50, 60, 50, 120, 0, 120], [50, 60, 0, 60, 0, 0]], 'Gironné %a et %b'],
        ['echiquete', 'Échiqueté', Array.from({length: 30}, (_, i) => { const r = Math.floor(i / 5), c = i % 5; return (r + c) % 2 ? [c * 20, r * 20, c * 20 + 20, r * 20, c * 20 + 20, r * 20 + 20, c * 20, r * 20 + 20] : null; }).filter(Boolean), 'Échiqueté %a et %b'],
        ['fasce_x', 'Fascé (6 pièces)', [1, 3, 5].map(i => [0, i * 20, 100, i * 20, 100, i * 20 + 20, 0, i * 20 + 20]), 'Fascé %a et %b'], ['pale_x', 'Palé (6 pièces)', [1, 3, 5].map(i => [i * 16.67, 0, i * 16.67 + 16.67, 0, i * 16.67 + 16.67, 120, i * 16.67, 120]), 'Palé %a et %b']];
    const ORDINARIES = [['aucune', 'Aucune', [], ''], ['chef', 'Chef', [[0, 0, 100, 0, 100, 34, 0, 34]], 'au chef %c'], ['fasce', 'Fasce', [[0, 42, 100, 42, 100, 78, 0, 78]], 'à la fasce %c'],
        ['pal', 'Pal', [[35, 0, 65, 0, 65, 120, 35, 120]], 'au pal %c'], ['bande', 'Bande', [[-12, 10, 10, -12, 112, 110, 90, 132]], 'à la bande %c'], ['barre', 'Barre', [[112, 10, 90, -12, -12, 110, 10, 132]], 'à la barre %c'],
        ['croix', 'Croix', [[38, 0, 62, 0, 62, 120, 38, 120], [0, 40, 100, 40, 100, 64, 0, 64]], 'à la croix %c'], ['sautoir', 'Sautoir', [[-12, 10, 10, -12, 112, 110, 90, 132], [112, 10, 90, -12, -12, 110, 10, 132]], 'au sautoir %c'],
        ['chevron', 'Chevron', [[0, 88, 50, 36, 100, 88, 100, 114, 50, 62, 0, 114]], 'au chevron %c'], ['canton', 'Canton', [[0, 0, 36, 0, 36, 40, 0, 40]], 'au canton %c'],
        ['champagne', 'Champagne', [[0, 92, 100, 92, 100, 120, 0, 120]], 'à la champagne %c'], ['bordure', 'Bordure', 'border', 'à la bordure %c'], ['franc_quartier', 'Franc-quartier', [[0, 0, 50, 0, 50, 60, 0, 60]], 'au franc-quartier %c']];
    const CHARGE_KEYS = ['mdi_fleur_de_lis', 'mdi_crown', 'mdi_chess_rook', 'mdi_castle', 'mdi_star', 'mdi_moon_waxing_crescent', 'mdi_weather_sunny', 'mdi_sword', 'mdi_sword_cross', 'mdi_key_variant', 'mdi_anchor', 'mdi_bee', 'mdi_tree', 'mdi_barley',
        'mdi_heart', 'mdi_cross', 'mdi_cross_celtic', 'mdi_horse', 'mdi_dog_side', 'mdi_bird', 'mdi_fish', 'mdi_zodiac_leo', 'mdi_leaf', 'mdi_flower', 'mdi_hammer', 'mdi_tower_fire', 'mdi_star_david', 'mdi_shield'];

    /* ═════════ Géométrie ═════════ */
    const KAPPA = 0.5522847498;
    const P = (x, y, i = null, o = null) => ({x, y, i, o});
    /** les points (avec poignées) d'une forme simple, pour la convertir en tracé */
    function boxPts(o) {
        const {x, y, w, h} = o;
        if (o.type === 'ellipse') { const rx = w / 2, ry = h / 2, cx = x + rx, cy = y + ry, kx = rx * KAPPA, ky = ry * KAPPA;
            return [P(cx, y, [cx - kx, y], [cx + kx, y]), P(x + w, cy, [x + w, cy - ky], [x + w, cy + ky]), P(cx, y + h, [cx + kx, y + h], [cx - kx, y + h]), P(x, cy, [x, cy + ky], [x, cy - ky])]; }
        if (o.type === 'rect') { const r = clamp(num(o.r), 0, Math.min(w, h) / 2);
            if (!r) return [P(x, y), P(x + w, y), P(x + w, y + h), P(x, y + h)];
            const k = r * (1 - KAPPA);
            return [P(x + r, y, [x + k, y], null), P(x + w - r, y, null, [x + w - k, y]), P(x + w, y + r, [x + w, y + k], null), P(x + w, y + h - r, null, [x + w, y + h - k]),
                P(x + w - r, y + h, [x + w - k, y + h], null), P(x + r, y + h, null, [x + k, y + h]), P(x, y + h - r, [x, y + h - k], null), P(x, y + r, null, [x, y + k])]; }
        if (o.type === 'polygon' || o.type === 'star') {
            const n = clamp(Math.round(num(o.n, o.type === 'star' ? 5 : 6)), 3, 60), cx = x + w / 2, cy = y + h / 2, out = [];
            const steps = o.type === 'star' ? n * 2 : n, inner = clamp(num(o.inner, 45), 5, 100) / 100;
            for (let k = 0; k < steps; k++) { const a = -Math.PI / 2 + k * 2 * Math.PI / steps, f = o.type === 'star' && k % 2 ? inner : 1; out.push(P(cx + Math.cos(a) * w / 2 * f, cy + Math.sin(a) * h / 2 * f)); }
            return out;
        }
        return [];
    }
    const ptsD = (pts, closed) => {
        if (!pts.length) return '';
        let d = `M${n2(pts[0].x)} ${n2(pts[0].y)}`;
        const seg = (a, b) => (a.o || b.i) ? `C${n2((a.o || [a.x, a.y])[0])} ${n2((a.o || [a.x, a.y])[1])} ${n2((b.i || [b.x, b.y])[0])} ${n2((b.i || [b.x, b.y])[1])} ${n2(b.x)} ${n2(b.y)}` : `L${n2(b.x)} ${n2(b.y)}`;
        for (let k = 1; k < pts.length; k++) d += seg(pts[k - 1], pts[k]);
        if (closed && pts.length > 1) d += seg(pts[pts.length - 1], pts[0]) + 'Z';
        return d;
    };
    /** le tracé (attribut d) d'un objet, dans les coordonnées du dessin (sans la rotation) */
    function shapeD(o) {
        if (o.type === 'path') return ptsD(o.pts || [], !!o.closed);
        if (o.type === 'svgpath') return String(o.d || '');
        if (['rect', 'ellipse', 'polygon', 'star'].includes(o.type)) return ptsD(boxPts(o), true);
        return '';
    }
    const segsBox = segs => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const [, ...a] of segs) for (let k = 0; k < a.length; k += 2) { x0 = Math.min(x0, a[k]); x1 = Math.max(x1, a[k]); y0 = Math.min(y0, a[k + 1]); y1 = Math.max(y1, a[k + 1]); } return isFinite(x0) ? {x: x0, y: y0, w: x1 - x0, h: y1 - y0} : null; };
    const measure = (() => { let c = null; return (text, o) => { c = c || document.createElement('canvas').getContext('2d'); c.font = `${o.italic ? 'italic ' : ''}${o.bold ? 'bold ' : ''}${num(o.size, 24)}px ${font(o.font)}`; return Math.max(...String(text || ' ').split('\n').map(l => c.measureText(l || ' ').width)); }; })();
    /** la boîte d'un objet (sans sa rotation) */
    function box(o) {
        if (['rect', 'ellipse', 'polygon', 'star', 'image', 'msym', 'mdeco'].includes(o.type)) return {x: o.x, y: o.y, w: o.w, h: o.h};
        if (o.type === 'text') { const lines = String(o.text || '').split('\n').length, w = measure(o.text, o), h = num(o.size, 24) * 1.2 * lines, ax = o.align === 'middle' ? w / 2 : o.align === 'end' ? w : 0; return {x: o.x - ax, y: o.y - num(o.size, 24), w, h}; }
        if (o.type === 'path') { const xs = [], ys = []; (o.pts || []).forEach(p => { xs.push(p.x); ys.push(p.y); if (p.i) { xs.push(p.i[0]); ys.push(p.i[1]); } if (p.o) { xs.push(p.o[0]); ys.push(p.o[1]); } }); return xs.length ? {x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys)} : {x: 0, y: 0, w: 0, h: 0}; }
        if (o.type === 'svgpath') return (K() && segsBox(K().absPath(o.d))) || {x: 0, y: 0, w: 0, h: 0};
        if (o.type === 'group') { const bs = (o.clip ? [o.clip] : o.children || []).map(rbox).filter(b => b.w || b.h); if (!bs.length) return {x: 0, y: 0, w: 0, h: 0}; const x0 = Math.min(...bs.map(b => b.x)), y0 = Math.min(...bs.map(b => b.y)); return {x: x0, y: y0, w: Math.max(...bs.map(b => b.x + b.w)) - x0, h: Math.max(...bs.map(b => b.y + b.h)) - y0}; }
        return {x: 0, y: 0, w: 0, h: 0};
    }
    /** la boîte d'un objet tourné (alignée sur les axes) */
    function rbox(o) {
        const b = box(o), r = num(o.rot) * Math.PI / 180; if (!r) return b;
        const cx = b.x + b.w / 2, cy = b.y + b.h / 2, c = Math.cos(r), s = Math.sin(r);
        const xs = [], ys = []; [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]].forEach(([x, y]) => { xs.push(cx + (x - cx) * c - (y - cy) * s); ys.push(cy + (x - cx) * s + (y - cy) * c); });
        return {x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys)};
    }
    const unionBox = list => { const bs = list.map(rbox); if (!bs.length) return null; const x0 = Math.min(...bs.map(b => b.x)), y0 = Math.min(...bs.map(b => b.y)); return {x: x0, y: y0, w: Math.max(...bs.map(b => b.x + b.w)) - x0, h: Math.max(...bs.map(b => b.y + b.h)) - y0}; };
    /** applique f(x, y) → [x, y] à toute la géométrie d'un objet (déplacer, étirer, retourner) */
    function mapObj(o, f, fs = 1) {
        if (['rect', 'ellipse', 'polygon', 'star', 'image', 'msym', 'mdeco'].includes(o.type)) { const [x1, y1] = f(o.x, o.y), [x2, y2] = f(o.x + o.w, o.y + o.h); o.x = Math.min(x1, x2); o.y = Math.min(y1, y2); o.w = Math.abs(x2 - x1); o.h = Math.abs(y2 - y1); if (o.type === 'rect' && o.r) o.r = num(o.r) * fs; }
        else if (o.type === 'text') { const [x, y] = f(o.x, o.y); o.x = x; o.y = y; o.size = clamp(num(o.size, 24) * fs, 2, 2000); }
        else if (o.type === 'path') o.pts = (o.pts || []).map(p => { const [x, y] = f(p.x, p.y); return P(x, y, p.i ? f(p.i[0], p.i[1]) : null, p.o ? f(p.o[0], p.o[1]) : null); });
        else if (o.type === 'svgpath' && K()) o.d = K().pathStr(K().absPath(o.d).map(([c, ...a]) => { const out = [c]; for (let k = 0; k < a.length; k += 2) out.push(...f(a[k], a[k + 1])); return out; }));
        else if (o.type === 'group') { (o.children || []).forEach(c => mapObj(c, f, fs)); if (o.clip) mapObj(o.clip, f, fs); }
        if (num(o.sw) && fs !== 1 && o.scaleStroke !== false) o.sw = clamp(num(o.sw) * fs, 0, 500);
        return o;
    }
    const moveObj = (o, dx, dy) => mapObj(o, (x, y) => [x + dx, y + dy]);
    /** une forme simple → tracé modifiable point par point */
    function toPath(o) {
        if (['rect', 'ellipse', 'polygon', 'star'].includes(o.type)) { const n = {...o, type: 'path', pts: boxPts(o), closed: true}; ['x', 'y', 'w', 'h', 'r', 'n', 'inner'].forEach(k => delete n[k]); return n; }
        return o;
    }
    /** un tracé quelconque (attribut d) → points modifiables, s'il n'a qu'un seul sous-tracé */
    function dToPts(d) {
        if (!K()) return null; const segs = K().absPath(d), subs = segs.filter(s => s[0] === 'M').length; if (subs !== 1) return null;
        const pts = []; let closed = false;
        for (const [c, ...a] of segs) {
            if (c === 'M') pts.push(P(a[0], a[1]));
            else if (c === 'L') pts.push(P(a[0], a[1]));
            else if (c === 'C') { pts[pts.length - 1].o = [a[0], a[1]]; pts.push(P(a[4], a[5], [a[2], a[3]], null)); }
            else if (c === 'Z') closed = true;
        }
        if (closed && pts.length > 1) { const f = pts[0], l = pts[pts.length - 1]; if (Math.hypot(f.x - l.x, f.y - l.y) < 0.01) { f.i = l.i; pts.pop(); } }
        return {pts, closed};
    }

    /* ═════════ Dessin (SVG) ═════════ */
    const gradDef = (o, id) => { const g = o.grad; if (!g) return ''; const a = num(g.angle) * Math.PI / 180, x1 = 50 - Math.cos(a) * 50, y1 = 50 - Math.sin(a) * 50;
        return g.type === 'radial' ? `<radialGradient id="${id}"><stop offset="0" stop-color="${col(g.c1, '#fff')}"/><stop offset="1" stop-color="${col(g.c2, '#000')}"/></radialGradient>`
            : `<linearGradient id="${id}" x1="${n2(x1)}%" y1="${n2(y1)}%" x2="${n2(100 - x1 + 0)}%" y2="${n2(100 - y1)}%"><stop offset="0" stop-color="${col(g.c1, '#fff')}"/><stop offset="1" stop-color="${col(g.c2, '#000')}"/></linearGradient>`; };
    const DASH = {'': '', dash: '8 6', dot: '1 5', long: '16 8', dashdot: '10 5 2 5'};
    function styleAttrs(o, defs, pre) {
        let fill = col(o.fill, 'none');
        if (o.grad && o.fill !== 'none') { const id = `${pre}g${String(o.id).replace(/\W/g, '')}`; defs.push(gradDef(o, id)); fill = `url(#${id})`; }
        const sw = clamp(num(o.sw), 0, 500);
        return `fill="${fill}"${o.evenodd ? ' fill-rule="evenodd"' : ''} stroke="${sw ? col(o.stroke, 'none') : 'none'}" stroke-width="${n2(sw)}"${DASH[o.dash] ? ` stroke-dasharray="${DASH[o.dash]}"` : ''} stroke-linecap="${['butt', 'round', 'square'].includes(o.cap) ? o.cap : 'round'}" stroke-linejoin="${['miter', 'round', 'bevel'].includes(o.join) ? o.join : 'round'}"${num(o.op, 1) < 1 ? ` opacity="${n2(clamp(num(o.op, 1), 0, 1))}"` : ''}`;
    }
    const rotAttr = o => { if (!num(o.rot)) return ''; const b = box(o); return ` transform="rotate(${n2(o.rot)} ${n2(b.x + b.w / 2)} ${n2(b.y + b.h / 2)})"`; };
    /* 🗺️ mode Plan (heritage-vector-map.js) : les objets de carte se dessinent là-bas ; contexte = le document en cours */
    const VM = () => ext.vectorMap;
    const mapCtx = (doc, editor) => { const v = VM(); if (!v) return null; const old = {doc: v.ctx.doc, editor: v.ctx.editor}; v.ctx.doc = doc; v.ctx.editor = editor; return old; };
    let MAPPASS = 'all';
    /** une liste d'objets : les traits de plan qui se suivent sont dessinés en deux temps (toutes les bordures, puis tous les dessus) pour que les routes se raccordent */
    function listSvg(arr, one) {
        let out = '', run = [];
        const flush = () => { if (run.length > 1) { MAPPASS = 'casing'; out += run.map(one).join(''); MAPPASS = 'fill'; out += run.map(one).join(''); MAPPASS = 'all'; } else if (run.length) out += one(run[0]); run = []; };
        for (const o of arr || []) { if (!o.hidden && VM()?.isLine(o)) run.push(o); else { flush(); out += one(o); } }
        flush(); return out;
    }
    function objSvg(o, defs, pre = '', ui = false) {
        if (o.hidden && !ui) return '';
        if (o.hidden) return '';
        const vm = VM();
        if (vm && !o._ghost && !vm.inTime(o)) return vm.ctx.editor ? `<g class="vx-ghost" opacity=".13">${objSvg({...o, _ghost: 1}, defs, pre, ui)}</g>` : ''; // hors de l'année choisie
        const id = ui === 'out' ? ` data-vx-out="${esc(o.id)}"` : ui ? ` data-vx="${esc(o.id)}"` : '';
        if (o.map && vm) { const r = vm.svg(o, defs, pre, id, MAPPASS); if (r !== null) return r; }
        if (o.type === 'msym' || o.type === 'mdeco') return '';
        if (o.type === 'group') {
            let clip = '';
            if (o.clip) { const cid = `${pre}c${String(o.id).replace(/\W/g, '')}`; defs.push(`<clipPath id="${cid}"><path d="${esc(shapeD(o.clip))}"${rotAttr(o.clip)}/></clipPath>`); clip = ` clip-path="url(#${cid})"`; }
            return `<g${id}${rotAttr(o)}${num(o.op, 1) < 1 ? ` opacity="${n2(num(o.op, 1))}"` : ''}><g${clip}>${listSvg(o.children, c => objSvg(c, defs, pre, false))}</g></g>`;
        }
        if (o.type === 'text') {
            const lines = String(o.text || '').split('\n'), size = clamp(num(o.size, 24), 2, 2000);
            return `<text${id} x="${n2(o.x)}" y="${n2(o.y)}" font-family="${esc(font(o.font))}" font-size="${n2(size)}"${o.bold ? ' font-weight="700"' : ''}${o.italic ? ' font-style="italic"' : ''} text-anchor="${['start', 'middle', 'end'].includes(o.align) ? o.align : 'start'}"${num(o.ls) ? ` letter-spacing="${n2(o.ls)}"` : ''} ${o.halo ? `${styleAttrs({...o, fill: o.fill ?? '#000', stroke: o.halo, sw: size / 4}, defs, pre)} paint-order="stroke"` : styleAttrs({...o, fill: o.fill ?? '#000'}, defs, pre)}${rotAttr(o)}>${lines.map((l, k) => `<tspan x="${n2(o.x)}" dy="${k ? n2(size * 1.2) : 0}">${esc(l) || ' '}</tspan>`).join('')}</text>`;
        }
        if (o.type === 'image') return imgOk(o.src) ? `<image${id} href="${esc(o.src)}" x="${n2(o.x)}" y="${n2(o.y)}" width="${n2(o.w)}" height="${n2(o.h)}" preserveAspectRatio="none"${num(o.op, 1) < 1 ? ` opacity="${n2(num(o.op, 1))}"` : ''}${rotAttr(o)}/>` : '';
        return `<path${id} d="${esc(shapeD(o))}" ${styleAttrs(o, defs, pre)}${rotAttr(o)}/>`;
    }
    /** le dessin complet, prêt à exporter */
    function docSvg(doc, {only = null, pad = 0} = {}) {
        const defs = [], objs = only || doc.objs, old = mapCtx(doc, false);
        const body = listSvg(objs, o => objSvg(o, defs, 'x'));
        if (old) Object.assign(VM().ctx, old);
        const ref = !only && doc.ref?.print && doc.ref.show !== false && imgOk(doc.ref.src) ? `<image href="${esc(doc.ref.src)}" x="${n2(doc.ref.x)}" y="${n2(doc.ref.y)}" width="${n2(doc.ref.w)}" height="${n2(doc.ref.h)}" preserveAspectRatio="none" opacity="${n2(clamp(num(doc.ref.op, .5), .05, 1))}"${doc.ref.gray ? ' style="filter:grayscale(1)"' : ''}/>` : '';
        let vb = `0 0 ${n2(doc.w)} ${n2(doc.h)}`, W = doc.w, H = doc.h;
        if (only) { const b = unionBox(only) || {x: 0, y: 0, w: 1, h: 1}; vb = `${n2(b.x - pad)} ${n2(b.y - pad)} ${n2(b.w + 2 * pad)} ${n2(b.h + 2 * pad)}`; W = b.w + 2 * pad; H = b.h + 2 * pad; }
        const bg = !only && doc.bg && doc.bg !== 'transparent' ? `<rect x="0" y="0" width="${n2(doc.w)}" height="${n2(doc.h)}" fill="${col(doc.bg, '#fff')}"/>` : '';
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${n2(W)}" height="${n2(H)}"><defs>${defs.join('')}</defs>${bg}${ref}${body}</svg>`;
    }

    /* ═════════ Image → tracés (Pathfinder, vectorisation) ═════════ */
    /** contours d'un masque (1 = dedans) : boucles d'arêtes entre pixels, puis simplifiées */
    function traceMask(mask, W, H, {eps = 1, smooth = true} = {}) {
        const at = (x, y) => x >= 0 && y >= 0 && x < W && y < H && mask[y * W + x];
        const next = new Map(), key = (x, y) => y * (W + 1) + x;
        const add = (x1, y1, x2, y2) => { const k = key(x1, y1); const l = next.get(k); if (l) l.push(key(x2, y2)); else next.set(k, [key(x2, y2)]); };
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            if (!mask[y * W + x]) continue;
            if (!at(x, y - 1)) add(x, y, x + 1, y); if (!at(x + 1, y)) add(x + 1, y, x + 1, y + 1);
            if (!at(x, y + 1)) add(x + 1, y + 1, x, y + 1); if (!at(x - 1, y)) add(x, y + 1, x, y);
        }
        const loops = [];
        for (const start of [...next.keys()]) {
            while (next.get(start)?.length) { // un même coin peut ouvrir plusieurs boucles (pixels en diagonale)
                const loop = []; let k = start, guard = 0;
                while (guard++ < 4e6) { const l = next.get(k); if (!l?.length) break; const nk = l.pop(); if (!l.length) next.delete(k); loop.push([k % (W + 1), Math.floor(k / (W + 1))]); k = nk; if (k === start) break; }
                if (loop.length >= 4) loops.push(loop);
            }
        }
        const rdp = (pts, e) => { if (pts.length < 3) return pts; let dmax = 0, idx = 0; const [ax, ay] = pts[0], [bx, by] = pts[pts.length - 1], L = Math.hypot(bx - ax, by - ay) || 1;
            for (let i = 1; i < pts.length - 1; i++) { const d = Math.abs((by - ay) * pts[i][0] - (bx - ax) * pts[i][1] + bx * ay - by * ax) / L; if (d > dmax) { dmax = d; idx = i; } }
            return dmax > e ? [...rdp(pts.slice(0, idx + 1), e).slice(0, -1), ...rdp(pts.slice(idx), e)] : [pts[0], pts[pts.length - 1]]; };
        return loops.map(loop => {
            // les milieux des marches d'escalier, puis simplifiés (boucle coupée en deux pour garder sa forme)
            const mid = loop.map((p, i) => { const q = loop[(i + 1) % loop.length]; return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]; });
            const h = Math.floor(mid.length / 2); let pts = [...rdp(mid.slice(0, h + 1), eps).slice(0, -1), ...rdp([...mid.slice(h), mid[0]], eps).slice(0, -1)];
            if (pts.length < 3) return null;
            if (!smooth) return {pts: pts.map(([x, y]) => P(x, y)), closed: true};
            // lissage : poignées de Catmull-Rom, sauf aux angles marqués
            const n = pts.length;
            return {closed: true, pts: pts.map((p, i) => { const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
                const v1 = [p[0] - a[0], p[1] - a[1]], v2 = [b[0] - p[0], b[1] - p[1]], cos = (v1[0] * v2[0] + v1[1] * v2[1]) / ((Math.hypot(...v1) * Math.hypot(...v2)) || 1);
                if (cos < 0.72) return P(p[0], p[1]);
                // poignées dans l'axe, jamais plus longues que le tiers de leur segment (pas de débordement)
                const tl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, ux = (b[0] - a[0]) / tl, uy = (b[1] - a[1]) / tl, li = Math.min(tl / 6, Math.hypot(...v1) / 3), lo = Math.min(tl / 6, Math.hypot(...v2) / 3);
                return P(p[0], p[1], [p[0] - ux * li, p[1] - uy * li], [p[0] + ux * lo, p[1] + uy * lo]); })};
        }).filter(Boolean);
    }
    const loopsD = loops => loops.map(l => ptsD(l.pts, true)).join('');


    /** dessine des objets dans un canevas (pour le Pathfinder et « contour en forme ») */
    function paintObj(g, o, mode = 'fill') {
        if (o.hidden) return;
        const b = box(o), r = num(o.rot) * Math.PI / 180;
        g.save();
        if (r) { g.translate(b.x + b.w / 2, b.y + b.h / 2); g.rotate(r); g.translate(-b.x - b.w / 2, -b.y - b.h / 2); }
        if (o.type === 'group') { if (o.clip) g.clip(new Path2D(shapeD(o.clip))); (o.children || []).forEach(c => paintObj(g, c, mode)); }
        else if (o.type === 'text') { g.font = `${o.italic ? 'italic ' : ''}${o.bold ? 'bold ' : ''}${num(o.size, 24)}px ${font(o.font)}`; g.textAlign = o.align === 'middle' ? 'center' : o.align === 'end' ? 'right' : 'left'; String(o.text || '').split('\n').forEach((l, k) => { if (mode === 'stroke') { g.lineWidth = num(o.sw); g.strokeText(l, o.x, o.y + k * num(o.size, 24) * 1.2); } else g.fillText(l, o.x, o.y + k * num(o.size, 24) * 1.2); }); }
        else if (o.type !== 'image') {
            const p = new Path2D(shapeD(o));
            if (mode === 'stroke') { g.lineWidth = num(o.sw); g.lineCap = o.cap || 'round'; g.lineJoin = o.join || 'round'; if (num(o.sw)) g.stroke(p); }
            else { if (o.fill !== 'none' || !num(o.sw)) g.fill(p, o.evenodd ? 'evenodd' : 'nonzero'); if (num(o.sw) && o.stroke !== 'none' && mode === 'all') { g.lineWidth = num(o.sw); g.stroke(p); } }
        }
        g.restore();
    }
    /** des objets → un masque en pixels (opération entre eux), puis retour en tracés, dans les coordonnées du dessin */
    function rasterOp(objs, op, {res = 1100, mode = 'all'} = {}) {
        const b = unionBox(objs); if (!b || !b.w || !b.h) return null;
        const pad = 4, s = res / Math.max(b.w, b.h), W = Math.ceil(b.w * s) + pad * 2, H = Math.ceil(b.h * s) + pad * 2;
        const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
        g.setTransform(s, 0, 0, s, pad - b.x * s, pad - b.y * s); g.fillStyle = '#000'; g.strokeStyle = '#000';
        // chaque forme est dessinée entière (fond, contour, enfants d'un groupe) sur sa propre feuille, puis combinée d'un coup
        const t = document.createElement('canvas'); t.width = W; t.height = H; const tg = t.getContext('2d');
        objs.forEach((o, i) => {
            const blend = i === 0 || op === 'union' || op === 'outline' ? 'source-over' : op === 'intersect' ? 'destination-in' : op === 'subtract' ? 'destination-out' : 'xor';
            if (blend === 'source-over') { paintObj(g, o, op === 'outline' ? 'stroke' : mode); return; }
            tg.setTransform(1, 0, 0, 1, 0, 0); tg.clearRect(0, 0, W, H); tg.setTransform(s, 0, 0, s, pad - b.x * s, pad - b.y * s); tg.fillStyle = '#000'; tg.strokeStyle = '#000';
            paintObj(tg, o, mode);
            g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = blend; g.drawImage(t, 0, 0); g.restore();
        });
        const data = g.getImageData(0, 0, W, H).data, mask = new Uint8Array(W * H);
        for (let i = 0; i < W * H; i++) mask[i] = data[i * 4 + 3] > 127 ? 1 : 0;
        const loops = traceMask(mask, W, H, {eps: 0.9});
        if (!loops.length) return '';
        return loops.map(l => ptsD(l.pts.map(p => P((p.x - pad) / s + b.x, (p.y - pad) / s + b.y, p.i ? [(p.i[0] - pad) / s + b.x, (p.i[1] - pad) / s + b.y] : null, p.o ? [(p.o[0] - pad) / s + b.x, (p.o[1] - pad) / s + b.y] : null)), true)).join('');
    }
    /** une image → des tracés : noir et blanc (seuil) ou en couleurs (k couleurs) */
    async function vectorizeImage(src, {colors = 0, threshold = 128, invert = false, maxSize = 900, eps = 1, smooth = true, skipLight = true} = {}) {
        const img = await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ko(new Error('Image illisible.')); i.src = src; });
        const k = Math.min(1, maxSize / Math.max(img.naturalWidth, img.naturalHeight)), W = Math.max(2, Math.round(img.naturalWidth * k)), H = Math.max(2, Math.round(img.naturalHeight * k));
        const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d', {willReadFrequently: true});
        g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.drawImage(img, 0, 0, W, H);
        const px = g.getImageData(0, 0, W, H).data, out = [];
        if (!colors) {
            const mask = new Uint8Array(W * H);
            for (let i = 0; i < W * H; i++) { const l = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]; mask[i] = (l < threshold) !== invert ? 1 : 0; }
            out.push({color: '#111111', loops: traceMask(mask, W, H, {eps, smooth})});
        } else {
            // k-moyennes sur un échantillon de pixels
            const n = W * H, sample = [], step = Math.max(1, Math.floor(n / 6000));
            for (let i = 0; i < n; i += step) sample.push([px[i * 4], px[i * 4 + 1], px[i * 4 + 2]]);
            // départ : les couleurs les plus éloignées les unes des autres (sinon une petite tache rouge se fond dans le reste)
            let cent = [sample[0].slice()];
            while (cent.length < colors) { let best = null, bd = -1; for (const q of sample) { const d = Math.min(...cent.map(c => (q[0] - c[0]) ** 2 + (q[1] - c[1]) ** 2 + (q[2] - c[2]) ** 2)); if (d > bd) { bd = d; best = q; } } if (!best || bd < 300) break; cent.push(best.slice()); }
            const near = (r, gg, bb) => { let best = 0, bd = Infinity; cent.forEach((q, j) => { const d = (r - q[0]) ** 2 + (gg - q[1]) ** 2 + (bb - q[2]) ** 2; if (d < bd) { bd = d; best = j; } }); return best; };
            for (let it = 0; it < 10; it++) { const acc = cent.map(() => [0, 0, 0, 0]); sample.forEach(p => { const j = near(...p); acc[j][0] += p[0]; acc[j][1] += p[1]; acc[j][2] += p[2]; acc[j][3]++; }); cent = cent.map((q, j) => acc[j][3] ? [acc[j][0] / acc[j][3], acc[j][1] / acc[j][3], acc[j][2] / acc[j][3]] : q); }
            const lab = new Uint8Array(n); for (let i = 0; i < n; i++) lab[i] = near(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]);
            const counts = cent.map((_, j) => lab.reduce((a, v) => a + (v === j), 0));
            cent.map((q, j) => [q, j]).sort((a, b) => counts[b[1]] - counts[a[1]]).forEach(([q, j]) => {
                if (skipLight && q[0] > 232 && q[1] > 232 && q[2] > 232) return;
                const mask = new Uint8Array(n); let any = 0; for (let i = 0; i < n; i++) if (lab[i] === j) { mask[i] = 1; any++; }
                if (any < 6) return;
                out.push({color: '#' + q.map(v => Math.round(v).toString(16).padStart(2, '0')).join(''), loops: traceMask(mask, W, H, {eps, smooth})});
            });
        }
        return {W, H, layers: out.filter(l => l.loops.length)};
    }

    /* ═════════ Import SVG : seulement la géométrie et des couleurs vérifiées ═════════ */
    const M_ID = [1, 0, 0, 1, 0, 0];
    const mmul = (a, b) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
    function parseTransform(t) {
        let m = M_ID.slice(); const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g; let x;
        while ((x = re.exec(String(t || '')))) {
            const v = x[2].split(/[\s,]+/).filter(Boolean).map(Number); let q = M_ID;
            if (x[1] === 'matrix' && v.length === 6) q = v;
            else if (x[1] === 'translate') q = [1, 0, 0, 1, v[0] || 0, v[1] || 0];
            else if (x[1] === 'scale') q = [v[0] ?? 1, 0, 0, v[1] ?? v[0] ?? 1, 0, 0];
            else if (x[1] === 'rotate') { const a = (v[0] || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); q = [c, s, -s, c, 0, 0]; if (v.length >= 3) q = mmul(mmul([1, 0, 0, 1, v[1], v[2]], q), [1, 0, 0, 1, -v[1], -v[2]]); }
            else if (x[1] === 'skewX') q = [1, 0, Math.tan((v[0] || 0) * Math.PI / 180), 1, 0, 0];
            else if (x[1] === 'skewY') q = [1, Math.tan((v[0] || 0) * Math.PI / 180), 0, 1, 0, 0];
            if (q.every(Number.isFinite)) m = mmul(m, q);
        }
        return m;
    }
    function importSvgText(text) {
        if (String(text).length > 6e6) throw new Error('SVG trop gros.');
        const docx = new DOMParser().parseFromString(String(text), 'image/svg+xml'), root = docx.documentElement;
        if (!root || root.nodeName.toLowerCase() !== 'svg' || docx.querySelector('parsererror')) throw new Error('Ce fichier n’est pas un SVG lisible.');
        // couleurs des classes (<style> .cls-1{fill:#…}) et des dégradés (première couleur)
        const cls = {}; docx.querySelectorAll('style').forEach(st => { for (const m of String(st.textContent).matchAll(/((?:\.[\w-]+\s*,?\s*)+)\{([^}]*)\}/g)) m[1].split(',').map(s => s.trim().slice(1)).filter(Boolean).forEach(c => { cls[c] = {...(cls[c] || {}), ...styleMap(m[2])}; }); });
        const grads = {}; docx.querySelectorAll('linearGradient, radialGradient').forEach(g => { const s = g.querySelector('stop'); if (g.id && s) grads[g.id] = s.getAttribute('stop-color') || styleMap(s.getAttribute('style') || '')['stop-color']; });
        function styleMap(css) { const o = {}; String(css || '').split(';').forEach(kv => { const i = kv.indexOf(':'); if (i > 0) o[kv.slice(0, i).trim().toLowerCase()] = kv.slice(i + 1).trim(); }); return o; }
        const paint = v => { if (v === undefined || v === null || v === '') return undefined; const t = String(v).trim(); if (t === 'none' || t === 'transparent') return 'none'; if (t === 'currentColor') return '#000000'; const u = t.match(/^url\(\s*#([^)]+)\)/); if (u) return col(grads[u[1]], '#888888'); return col(t, '#000000'); };
        const vb = (root.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
        let base = M_ID.slice();
        const W0 = parseFloat(root.getAttribute('width')), H0 = parseFloat(root.getAttribute('height'));
        if (vb.length === 4 && vb.every(Number.isFinite) && vb[2] > 0 && vb[3] > 0) base = mmul([W0 > 0 ? W0 / vb[2] : 1, 0, 0, H0 > 0 ? H0 / vb[3] : 1, 0, 0], [1, 0, 0, 1, -vb[0], -vb[1]]);
        const out = []; let count = 0;
        const elD = el => {
            const a = k => parseFloat(el.getAttribute(k)) || 0, tag = el.nodeName.toLowerCase();
            if (tag === 'path') return el.getAttribute('d') || '';
            if (tag === 'rect') { const o = {type: 'rect', x: a('x'), y: a('y'), w: a('width'), h: a('height'), r: a('rx') || a('ry')}; return o.w > 0 && o.h > 0 ? shapeD(o) : ''; }
            if (tag === 'circle') { const r = a('r'); return r > 0 ? shapeD({type: 'ellipse', x: a('cx') - r, y: a('cy') - r, w: 2 * r, h: 2 * r}) : ''; }
            if (tag === 'ellipse') { const rx = a('rx'), ry = a('ry'); return rx > 0 && ry > 0 ? shapeD({type: 'ellipse', x: a('cx') - rx, y: a('cy') - ry, w: 2 * rx, h: 2 * ry}) : ''; }
            if (tag === 'line') return `M${a('x1')} ${a('y1')}L${a('x2')} ${a('y2')}`;
            if (tag === 'polyline' || tag === 'polygon') { const v = String(el.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number).filter(Number.isFinite); if (v.length < 4) return ''; let d = `M${v[0]} ${v[1]}`; for (let k = 2; k + 1 < v.length; k += 2) d += `L${v[k]} ${v[k + 1]}`; return d + (tag === 'polygon' ? 'Z' : ''); }
            return '';
        };
        function walk(el, m, inh, into) {
            if (++count > 20000) return;
            const tag = el.nodeName.toLowerCase();
            if (['defs', 'style', 'script', 'clippath', 'mask', 'symbol', 'metadata', 'title', 'desc', 'lineargradient', 'radialgradient', 'pattern', 'filter', 'foreignobject'].includes(tag)) return;
            const own = {...(el.getAttribute('class') || '').split(/\s+/).filter(Boolean).reduce((o, c) => ({...o, ...(cls[c] || {})}), {}), ...Object.fromEntries(['fill', 'stroke', 'stroke-width', 'opacity', 'fill-opacity', 'fill-rule', 'display', 'visibility', 'font-size', 'font-family', 'font-weight'].filter(k => el.hasAttribute(k)).map(k => [k, el.getAttribute(k)])), ...styleMap(el.getAttribute('style'))};
            const st = {...inh, ...own}; if (st.display === 'none' || st.visibility === 'hidden') return;
            const mm = mmul(m, parseTransform(el.getAttribute('transform')));
            if (tag === 'g' || tag === 'svg' || tag === 'a') { const kids = []; [...el.children].forEach(c => walk(c, mm, st, kids)); if (kids.length > 1 && tag === 'g') into.push({id: uid(), type: 'group', name: el.getAttribute('id')?.slice(0, 40) || 'Groupe', children: kids}); else into.push(...kids); return; }
            const det = Math.sqrt(Math.abs(mm[0] * mm[3] - mm[1] * mm[2])) || 1;
            if (tag === 'text') { const t = (el.textContent || '').trim().slice(0, 2000); if (!t) return; const x = parseFloat(el.getAttribute('x')) || 0, y = parseFloat(el.getAttribute('y')) || 0;
                into.push({id: uid(), type: 'text', name: t.slice(0, 30), text: t, x: mm[0] * x + mm[2] * y + mm[4], y: mm[1] * x + mm[3] * y + mm[5], size: clamp((parseFloat(st['font-size']) || 16) * det, 2, 2000), font: font(st['font-family'] || 'Georgia'), bold: /bold|[6-9]00/.test(st['font-weight'] || ''), fill: paint(st.fill) ?? '#000000', sw: 0}); return; }
            if (tag === 'image') { const href = el.getAttribute('href') || el.getAttribute('xlink:href') || ''; if (!/^data:image\/(png|jpeg|webp|gif);base64,/.test(href) || !imgOk(href)) return;
                const x = parseFloat(el.getAttribute('x')) || 0, y = parseFloat(el.getAttribute('y')) || 0, w = parseFloat(el.getAttribute('width')) || 0, h = parseFloat(el.getAttribute('height')) || 0;
                into.push({id: uid(), type: 'image', name: 'Image', src: href, x: mm[0] * x + mm[4], y: mm[3] * y + mm[5], w: w * Math.abs(mm[0]), h: h * Math.abs(mm[3])}); return; }
            const d = elD(el); if (!d || !K()) return;
            const tx = K().pathStr(K().absPath(d).map(([c, ...v]) => { const o = [c]; for (let k = 0; k < v.length; k += 2) o.push(mm[0] * v[k] + mm[2] * v[k + 1] + mm[4], mm[1] * v[k] + mm[3] * v[k + 1] + mm[5]); return o; }));
            if (!tx) return;
            const fill = paint(st.fill) ?? '#000000', op = clamp(num(st.opacity, 1) * num(st['fill-opacity'], 1), 0, 1);
            const o = {id: uid(), type: 'svgpath', name: tag === 'path' ? 'Tracé' : tag, d: tx, fill, stroke: paint(st.stroke) ?? 'none', sw: paint(st.stroke) && paint(st.stroke) !== 'none' ? clamp(num(st['stroke-width'], 1) * det, 0, 500) : 0, evenodd: st['fill-rule'] === 'evenodd', op};
            const one = dToPts(tx); if (one) { o.type = 'path'; o.pts = one.pts; o.closed = one.closed; delete o.d; }
            into.push(o);
        }
        walk(root, base, {}, out);
        return out;
    }

    /* ═════════ Blasons ═════════ */
    const deT = t => { const n = (TINCTURES.find(x => x[0] === t) || TINCTURES[0])[1].toLowerCase(); return /^[aeiouéo]/i.test(n) ? `d’${n}` : `de ${n}`; };
    const NUMS = ['', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six'];
    const CHARGE_POS = {1: [[50, 58, 46]], 2: [[30, 55, 30], [70, 55, 30]], 3: [[29, 40, 27], [71, 40, 27], [50, 84, 27]], 4: [[30, 38, 25], [70, 38, 25], [30, 78, 25], [70, 78, 25]], 5: [[26, 30, 22], [74, 30, 22], [50, 56, 22], [26, 82, 22], [74, 82, 22]], 6: [[22, 30, 20], [50, 30, 20], [78, 30, 20], [34, 60, 20], [66, 60, 20], [50, 88, 20]]};
    const tHex = t => (TINCTURES.find(x => x[0] === t) || TINCTURES[0])[2];
    const polyD = (p, s, ox, oy) => { let d = ''; for (let k = 0; k < p.length; k += 2) d += (k ? 'L' : 'M') + n2(ox + p[k] * s) + ' ' + n2(oy + p[k + 1] * s); return d + 'Z'; };
    function chargeD(key, cx, cy, size) {
        const sh = K()?.shapeByKey?.(key); if (!sh?.d) return '';
        const segs = K().absPath(sh.d), b = segsBox(segs); if (!b) return '';
        const k = size / Math.max(b.w, b.h);
        return K().pathStr(segs.map(([c, ...a]) => { const o = [c]; for (let j = 0; j < a.length; j += 2) o.push(cx + (a[j] - b.x - b.w / 2) * k, cy + (a[j + 1] - b.y - b.h / 2) * k); return o; }));
    }
    /** un blason complet : écu, partition, pièce, meubles, contour — et son blasonnement */
    function makeBlason(o, {x = 0, y = 0, width = 300} = {}) {
        const s = width / 100, esc0 = ESCUTCHEONS.find(e => e[0] === o.shield) || ESCUTCHEONS[0];
        const shieldD = K() ? K().pathStr(K().absPath(esc0[2]).map(([c, ...a]) => { const r = [c]; for (let j = 0; j < a.length; j += 2) r.push(x + a[j] * s, y + a[j + 1] * s); return r; })) : '';
        const kids = [{id: uid(), type: 'rect', name: 'Champ', x, y, w: 100 * s, h: 120 * s, fill: tHex(o.a), sw: 0}];
        const div = DIVISIONS.find(d => d[0] === o.division) || DIVISIONS[0];
        if (div[2].length) kids.push({id: uid(), type: 'svgpath', name: div[1], d: div[2].map(p => polyD(p, s, x, y)).join(''), fill: tHex(o.b), sw: 0});
        const ord = ORDINARIES.find(d => d[0] === o.ordinary) || ORDINARIES[0];
        if (ord[2] === 'border') kids.push({id: uid(), type: 'svgpath', name: ord[1], d: shieldD, fill: 'none', stroke: tHex(o.c), sw: 24 * s, join: 'miter'});
        else if (ord[2].length) kids.push({id: uid(), type: 'svgpath', name: ord[1], d: ord[2].map(p => polyD(p, s, x, y)).join(''), fill: tHex(o.c), sw: 0});
        const n = clamp(Math.round(num(o.count)), 0, 6), sh = K()?.shapeByKey?.(o.charge);
        if (n && sh) (CHARGE_POS[n] || []).forEach(([cx, cy, sz], i) => { const d = chargeD(o.charge, x + cx * s, y + cy * s, sz * s * (num(o.chargeSize, 100) / 100)); if (d) kids.push({id: uid(), type: 'svgpath', name: `${sh.n} ${i + 1}`, d, fill: tHex(o.d), sw: 0, evenodd: !!sh.eo}); });
        const blason = {id: uid(), type: 'group', name: 'Blason', children: [
            {id: uid(), type: 'group', name: 'Écu', clip: {id: uid(), type: 'svgpath', d: shieldD}, children: kids},
            {id: uid(), type: 'svgpath', name: 'Contour de l’écu', d: shieldD, fill: 'none', stroke: '#222222', sw: Math.max(1, 1.6 * s), join: 'round'}]};
        // blasonnement
        let txt = div[3].replace('%a', deT(o.a)).replace('%b', deT(o.b));
        txt = div[0] === 'plein' ? `D${deT(o.a).slice(1)}` : txt;
        if (ord[3]) txt += (div[0] === 'plein' ? ' ' : ', ') + ord[3].replace('%c', deT(o.c));
        if (n && sh) txt += `${ord[3] ? ', accompagné' + (/^à la/.test(ord[3]) ? 'e' : '') + ' de' : div[0] === 'plein' ? ' à' : ', à'} ${NUMS[n]} ${n > 1 ? sh.n.toLowerCase().replace(/^(\S+?)([sx]?)(\s|$)/, (m, w, e, sp) => w + (e || 's') + sp) : sh.n.toLowerCase()} ${deT(o.d)}${n === 3 ? ', 2 et 1' : n === 6 ? ', 3, 2 et 1' : ''}`;
        return {obj: blason, blazon: txt.replace(/\s+/g, ' ').trim() + '.'};
    }

    ext.vectorInternals = {boxPts, ptsD, shapeD, box, rbox, mapObj, toPath, dToPts, objSvg, docSvg, traceMask, rasterOp, vectorizeImage, importSvgText, parseTransform, makeBlason, TINCTURES, ESCUTCHEONS, DIVISIONS, ORDINARIES, CHARGE_KEYS, col, imgOk, unionBox, loopsD};

    /* ═════════ L'éditeur ═════════ */
    const TOOLS = [['select', '➤', 'Sélection', 'V'], ['direct', '⌖', 'Sélection directe (points et poignées)', 'A'], ['pen', '✒️', 'Plume (clic : point, glisser : courbe)', 'P'], ['pencil', '✏️', 'Crayon (à main levée)', 'N'],
        ['rect', '▭', 'Rectangle', 'M'], ['ellipse', '◯', 'Ellipse', 'L'], ['polygon', '⬡', 'Polygone', 'Y'], ['star', '☆', 'Étoile', 'S'], ['spiral', '🌀', 'Spirale (glisser depuis le centre)', 'O'], ['line', '╱', 'Ligne', '\\'], ['text', 'T', 'Texte', 'T'],
        ['eyedrop', '💧', 'Pipette (prend la couleur d’un objet)', 'I'], ['hand', '✋', 'Main (déplacer la vue)', 'H'], ['zoom', '🔍', 'Loupe (⌥ : dézoomer)', 'Z']];
    const SWATCHES = ['#000000', '#ffffff', '#7f7f7f', '#d81e1e', '#e6862a', '#f4c430', '#1a8a3a', '#1f4fa3', '#7b3f8c', '#8b5a2b', '#f2c9a8', 'none'];
    const newDoc = () => ({w: 800, h: 600, bg: '#ffffff', grid: 0, snap: false, objs: []});
    const cleanDoc = d => { const o = d && typeof d === 'object' ? d : {}; return {w: clamp(num(o.w, 800), 10, 20000), h: clamp(num(o.h, 600), 10, 20000), bg: o.bg === 'transparent' ? 'transparent' : col(o.bg, '#ffffff'), grid: clamp(num(o.grid), 0, 500), snap: !!o.snap, objs: Array.isArray(o.objs) ? o.objs.filter(x => x && typeof x === 'object').slice(0, 20000) : [], ...cleanMap(o), ...(/^[a-z]{2,20}$/.test(o.kind || '') ? {kind: o.kind} : {}), ...(typeof o.blasonOn === 'boolean' ? {blasonOn: o.blasonOn} : {})}; }; // kind : « tree » pour un arbre décoratif, etc.
    /** les réglages du mode Plan et l'image de référence (vérifiés : nombres, style connu, image sûre) */
    function cleanMap(o) {
        const out = {}, m = o.map;
        if (m && typeof m === 'object') {
            const g = m.geo && typeof m.geo === 'object' && ['n', 's', 'w', 'e'].every(k => Number.isFinite(Number(m.geo[k]))) ? {n: num(m.geo.n), s: num(m.geo.s), w: num(m.geo.w), e: num(m.geo.e), lat: num(m.geo.lat), lon: num(m.geo.lon), name: String(m.geo.name || '').slice(0, 120), place_id: Math.max(0, Math.round(num(m.geo.place_id)))} : null;
            out.map = {on: !!m.on, style: VM()?.STYLES?.[m.style] ? m.style : (/^[a-z]{2,20}$/.test(m.style || '') ? m.style : 'modern'), auto: m.auto !== false, year: num(m.year) ? Math.round(clamp(num(m.year), -3000, 3000)) : null, scale: clamp(num(m.scale, 1), 0.001, 1e6), ...(m.kmgrid ? {kmgrid: true} : {}), ...(m.bm && typeof m.bm === 'object' && Number.isFinite(Number(m.bm.lat)) && Number.isFinite(Number(m.bm.lon)) ? {bm: {lat: clamp(num(m.bm.lat), -85, 85), lon: clamp(num(m.bm.lon), -360, 360), km: clamp(num(m.bm.km, 2), 0.05, 2000), bg: /^[a-z0-9_-]{1,30}$/i.test(m.bm.bg || '') ? m.bm.bg : 'osm', name: String(m.bm.name || '').slice(0, 120), place_id: Math.max(0, Math.round(num(m.bm.place_id)))}} : {}), ...(m.askGeo ? {askGeo: true} : {}), ...(g ? {geo: g} : {})};
        }
        const r = o.ref;
        if (r && typeof r === 'object' && imgOk(r.src)) out.ref = {src: r.src, x: num(r.x), y: num(r.y), w: clamp(num(r.w, 100), 1, 100000), h: clamp(num(r.h, 100), 1, 100000), k: clamp(num(r.k, 1), .1, 4), op: clamp(num(r.op, .5), .05, 1), show: r.show !== false, print: !!r.print, gray: !!r.gray};
        return out;
    }

    /**
     * Ouvre l'éditeur. ctx : {id} un dessin enregistré, {shape} une forme des tableaux à reprendre (et onShape(k) après),
     * {coat: {id, title, media}} des armoiries à dessiner (onBlazon(texte), onCoatSaved()), {svg}/{imageSrc} à importer.
     */
    async function openEditor(ctx = {}) {
        let docId = 0, name = 'Mon dessin', doc = newDoc();
        if (ctx.id) { try { const r = await api('vector_doc', {id: ctx.id}); docId = r.id; name = r.name; doc = cleanDoc(r.doc); } catch (e) { return toast(e.message, 'error'); } }
        else if (ctx.doc) { doc = cleanDoc(ctx.doc); name = String(ctx.name || name).slice(0, 200); } // un dessin tout fait (arbre décoratif, faire-part…)
        let MP = null; const isPen = t => t === 'pen' || t === 'mline' || t === 'mzone';
        let sel = [], tool = 'select', zoom = 1, panX = 0, panY = 0, dirty = false, hist = [], hi = -1, clip = null, penPath = null, nodeSel = null, lastBlazon = '';
        const dlg = document.createElement('dialog'); dlg.className = 'modal vx-dlg'; dlg.dataset.ownClose = '1';
        const menu = (label, items) => `<details class="vx-menu" data-tb="menu-${label}" data-tb-label="Menu ${label}"><summary>${label}</summary><div class="vx-menu-list">${items.map(([k, l, sc]) => k === '-' ? '<hr>' : `<button type="button" data-vx-cmd="${k}"><span>${l}</span>${sc ? `<kbd>${sc}</kbd>` : ''}</button>`).join('')}</div></details>`;
        dlg.innerHTML = `<div class="vx-shell">
            <header class="vx-top"><span class="vx-logo">✒️</span><input class="vx-name" data-vx-name value="${esc(name)}" maxlength="200" aria-label="Nom du dessin">
                <nav class="vx-menus" data-tbg="vx-menus" data-tbg-label="Menus du haut">${menu('Fichier', [['new', 'Nouveau dessin'], ['open', 'Ouvrir un dessin…'], ['save', 'Enregistrer', '⌘S'], ['-'], ['import', '⤒ Importer (SVG, PNG, JPG, WEBP, GIF, BMP…)', '⌘I'], ['-'], ['exp_svg', '⤓ Exporter en SVG'], ['exp_png', '⤓ Exporter en PNG'], ['exp_jpg', '⤓ Exporter en JPG'], ['exp_webp', '⤓ Exporter en WEBP'], ['exp_pdf', '🖨️ Imprimer / PDF'], ['exp_sel', '⤓ Exporter la sélection en SVG'], ['copysvg', '📋 Copier le code SVG'], ['copypng', '📋 Copier l’image'], ['-'], ['toshape', '🔷 Enregistrer comme forme (Mes formes)…'], ['tomedia', '🖼️ Enregistrer dans les médias d’une fiche…'], ['tocoat', '🛡️ Enregistrer comme image d’armoiries…']])}
                    ${menu('Édition', [['undo', 'Annuler', '⌘Z'], ['redo', 'Rétablir', '⇧⌘Z'], ['-'], ['cut', 'Couper', '⌘X'], ['copy', 'Copier', '⌘C'], ['paste', 'Coller', '⌘V'], ['dup', 'Dupliquer', '⌘D'], ['del', 'Supprimer', '⌫'], ['-'], ['all', 'Tout sélectionner', '⌘A'], ['none', 'Ne rien sélectionner', 'Échap']])}
                    ${menu('Objet', [['group', 'Grouper', '⌘G'], ['ungroup', 'Dissocier', '⇧⌘G'], ['clipmask', 'Masque d’écrêtage (l’objet du dessus découpe les autres)', '⌘7'], ['unclip', 'Retirer le masque'], ['-'], ['front', 'Premier plan', '⇧⌘]'], ['fwd', 'Avancer', '⌘]'], ['back', 'Reculer', '⌘['], ['bottom', 'Arrière-plan', '⇧⌘['], ['-'], ['flipH', 'Retourner horizontalement'], ['flipV', 'Retourner verticalement'], ['rot90', 'Tourner de 90°'], ['-'], ['topath', 'Convertir en tracé (points modifiables)'], ['outline', 'Contour du trait → forme'], ['simplify', 'Simplifier le tracé…'], ['-'], ['transform', 'Transformer… (échelle, inclinaison, copies)'], ['repeat_circle', 'Répétition en cercle…'], ['repeat_grid', 'Répétition en grille…'], ['-'], ['lock', '🔒 Verrouiller / déverrouiller'], ['hide', '🙈 Masquer'], ['showall', '👁 Tout afficher']])}
                    ${menu('Aligner', [['al_l', 'À gauche'], ['al_c', 'Au centre (horizontal)'], ['al_r', 'À droite'], ['al_t', 'En haut'], ['al_m', 'Au milieu (vertical)'], ['al_b', 'En bas'], ['-'], ['di_h', 'Répartir horizontalement'], ['di_v', 'Répartir verticalement'], ['-'], ['al_art', 'Centrer sur le plan de travail']])}
                    ${menu('Pathfinder', [['pf_union', '⬤ Réunir'], ['pf_subtract', '◐ Soustraire (le dessous moins le reste)'], ['pf_intersect', '◑ Intersection'], ['pf_exclude', '◎ Exclure (là où ils se croisent)']])}
                    ${menu('Blason', [['blason', '🛡️ Créer un blason…'], ['charge', '⚜️ Ajouter un meuble (fleur de lys, lion, étoile…)…'], ['-'], ['vectorize', '🪄 Vectoriser une image (refaire un blason scanné)…']])}
                    ${menu('Plan', [['map_on', '🗺️ Mode Plan (cartes) : oui / non'], ['map_tab', 'Palette du plan (routes, rivières, bâtiments…)'], ['-'], ['map_base', '🗺️ Fond de carte d’un lieu…'], ['map_ref', '🖼️ Image de référence (en transparence)…'], ['-'], ['map_layers', '🗂 Créer les calques d’un plan'], ['map_places', '📍 Lieux de la base sur le plan…'], ['map_links', '🔗 Objets reliés à la famille…']])}
                    ${menu('Affichage', [['zin', 'Zoom avant', '⌘+'], ['zout', 'Zoom arrière', '⌘−'], ['zfit', 'Tout le plan de travail', '⌘0'], ['z100', 'Taille réelle (100 %)', '⌘1'], ['-'], ['grid', 'Grille et magnétisme…'], ['smart', 'Repères commentés (aimanter aux objets) : oui / non']])}</nav>
                <div class="vx-hist" data-tbg="vx-hist" data-tbg-label="Annuler / rétablir (en haut)"><button type="button" data-vx-cmd="undo" title="Annuler (⌘Z)">↶</button><button type="button" data-vx-cmd="redo" title="Rétablir (⇧⌘Z)">↷</button></div>
                <span class="vx-spacer"></span><span class="vx-status" data-vx-status></span><span class="vx-modes" data-tbg="vx-modes" data-tbg-label="Modes (en haut)"><label class="vx-mode" data-tb="vx-mode-blason" title="Montre l’onglet et le menu Blason"><input type="checkbox" data-vx-mode="blason"> 🛡️ Mode Blason</label><label class="vx-mode" data-tb="vx-mode-map" title="Montre l’onglet Plan et ses outils (routes, rivières…)"><input type="checkbox" data-vx-mode="map"> 🗺️ Mode Carte</label></span>${ext.tbButton ? ext.tbButton('vector') : ''}<button type="button" class="button small" data-vx-cmd="save">💾 Enregistrer</button>${ctx.coat ? '<button type="button" class="button small secondary" data-vx-cmd="tocoat">🛡️ Dans ces armoiries</button>' : ''}${ctx.shape || ctx.onShape ? '<button type="button" class="button small secondary" data-vx-cmd="toshape">🔷 Enregistrer la forme</button>' : ''}${ext.fullButton ? ext.fullButton('vector') : ''}<button type="button" class="icon-button" data-vx-close title="Fermer">×</button></header>
            <div class="vx-main"><aside class="vx-tools" data-tbg="vx-tools" data-tbg-label="Outils (colonne de gauche)">${TOOLS.map(([k, ic, l, sc]) => `<button type="button" data-vx-tool="${k}" title="${esc(l)} (${sc})" data-shortcut="${esc(sc)}">${ic}</button>`).join('')}
                    <div class="vx-maptools" data-vx-maptools hidden title="Outils du mode Plan"><button type="button" data-vx-tab-go="map" title="🗺️ Plan : la palette des routes, rivières, bâtiments…">🗺️</button>${[['mline', '🛣️', 'Voie, rivière, limite (un clic par point)'], ['mzone', '▱', 'Zone : forêt, champ, lac, bourg…'], ['msym', '🏠', 'Bâtiment ou symbole'], ['mlabel', '📍', 'Nom de lieu (ville, village, rivière… déjà mis en forme pour une carte ; T = texte libre)'], ['mdeco', '🧭', 'Échelle, rose des vents, cartouche, légende']].map(([k, ic, l]) => `<button type="button" data-vx-tool="${k}" title="${esc(l)}">${ic}</button>`).join('')}</div>
                    <div class="vx-fs" title="Remplissage et contour de la sélection"><span class="vx-fsfill" data-vx-fsfill></span><span class="vx-fsstroke" data-vx-fsstroke></span></div></aside>
                <div class="vx-stage" data-vx-stage tabindex="-1"><div class="vx-crumbs" data-vx-crumbs hidden></div><svg class="vx-svg" data-vx-svg xmlns="http://www.w3.org/2000/svg"><defs data-vx-defs></defs><g data-vx-world><rect data-vx-board class="vx-board"/><g data-vx-ref></g><g data-vx-grid></g><g data-vx-content></g><g data-vx-ui></g></g></svg></div>
                <aside class="vx-panel"><div class="vx-psize" data-vx-psize title="Glisser pour élargir ou rétrécir le panneau (double-clic : taille d’origine)"></div><nav class="segmented vx-tabs" data-tbg="vx-tabs" data-tbg-label="Onglets du panneau de droite"><button type="button" data-vx-tab="props" class="is-active">Propriétés</button><button type="button" data-vx-tab="layers">Calques</button><button type="button" data-vx-tab="map" title="Mode Plan (cartes), fond de carte, image de référence">🗺️ Plan</button><button type="button" data-vx-tab="blason">Blason</button><button type="button" data-vx-tab="doc">Document</button></nav><div class="vx-pane" data-vx-pane></div></aside></div>
            <footer class="vx-foot"><span data-vx-zoom></span><span data-vx-pos></span><span class="vx-hint" data-vx-hint></span></footer>
            <input type="file" data-vx-file hidden accept="image/*,.svg,image/svg+xml,.bmp,.tif,.tiff,.ico,.avif">
        </div>`;
        document.body.appendChild(dlg); ext.fullInit?.(dlg, 'vector', true); // plein écran par défaut ; ⛶ pour passer en fenêtre (retenu)
        try { ext.tbApply?.(dlg, 'vector'); } catch (_) {} // boutons rangés ou cachés (⚙️ Personnaliser, ou Maintenance → Montage, retouche, mise en page et son)
        ext.editorKeysAttach?.(dlg, 'vector'); // ⌨️ raccourcis à soi
        const $ = s => dlg.querySelector(s);
        const svgEl = $('[data-vx-svg]'), world = $('[data-vx-world]'), content = $('[data-vx-content]'), ui = $('[data-vx-ui]'), defsEl = $('[data-vx-defs]'), stage = $('[data-vx-stage]'), pane = $('[data-vx-pane]');
        let tab = ctx.tab === 'map' ? 'map' : 'props';
        const status = t => { $('[data-vx-status]').textContent = t || ''; };
        const hint = t => { $('[data-vx-hint]').textContent = t || ''; };
        /* calques et groupes : on travaille « dans » un calque ou un groupe (mode isolé, comme Illustrator) ;
           scope = le chemin des groupes ouverts ; les nouveaux dessins, la sélection, l'ordre se font dans ce conteneur */
        let scope = [];
        const isLayerGroup = o => o?.type === 'group';
        function cur() {
            let a = doc.objs;
            for (let k = 0; k < scope.length; k++) { const g = a.find(o => o.id === scope[k] && isLayerGroup(o)); if (!g) { scope = scope.slice(0, k); break; } if (!Array.isArray(g.children)) g.children = []; a = g.children; }
            return a;
        }
        const scopeGroup = () => { let a = doc.objs, g = null; for (const gid of scope) { g = a.find(o => o.id === gid); if (!g) return null; a = g.children || []; } return g; };
        const setCur = arr => { const g = scope.length ? scopeGroup() : null; if (g) g.children = arr; else doc.objs = arr; };
        /** un objet n'importe où dans l'arbre : {o, arr (son conteneur), path (les groupes au-dessus)} */
        const findAny = (id, arr = doc.objs, path = []) => { for (const o of arr) { if (o.id === id) return {o, arr, path}; if (isLayerGroup(o)) { const r = findAny(id, o.children || [], [...path, o.id]); if (r) return r; } } return null; };
        const pathName = path => { let a = doc.objs; return path.map(gid => { const g = a.find(o => o.id === gid); a = g?.children || []; return g?.name || 'Groupe'; }); };
        /** entrer dans un groupe : refusé s'il est tourné (les points ne tomberaient plus sous la souris) */
        function enterScope(path) {
            let a = doc.objs; for (const gid of path) { const g = a.find(o => o.id === gid); if (!g) return false; if (num(g.rot)) { toast(`« ${g.name || 'Ce groupe'} » est tourné : remets sa rotation à 0, ou dissocie-le, pour travailler dedans.`, 'error'); return false; } a = g.children || []; }
            if (penPath) finishPen(); scope = path.slice(); sel = []; nodeSel = null; return true;
        }
        /** le dessin : ce qui est hors du calque où l'on travaille est pâli et ne se clique pas */
        function treeSvg(defs) {
            // dans un calque (pas dans un groupe isolé) : les autres calques restent nets et un clic dessus y passe, comme dans Illustrator
            const isolate = scope.some(id => !findAny(id)?.o?.layer);
            const walk = (arr, depth) => listSvg(arr, o => {
                if (!isolate && depth === 0 && o.layer && scope[0] !== o.id && isLayerGroup(o)) { if (o.hidden) return '';
                    let clip = ''; if (o.clip) { const cid = `ec${String(o.id).replace(/\W/g, '')}`; defs.push(`<clipPath id="${cid}"><path d="${esc(shapeD(o.clip))}"${rotAttr(o.clip)}/></clipPath>`); clip = ` clip-path="url(#${cid})"`; } // ✂️ calque masqué
                    return `<g${num(o.op, 1) < 1 ? ` opacity="${n2(num(o.op, 1))}"` : ''}><g${clip}>${listSvg(o.children || [], c => objSvg(c, defs, 'e', c.locked ? false : 'out'))}</g></g>`; }
                if (depth < scope.length && o.id === scope[depth] && isLayerGroup(o)) {
                    if (o.hidden) return '';
                    let clip = ''; if (o.clip) { const cid = `ec${String(o.id).replace(/\W/g, '')}`; defs.push(`<clipPath id="${cid}"><path d="${esc(shapeD(o.clip))}"${rotAttr(o.clip)}/></clipPath>`); clip = ` clip-path="url(#${cid})"`; }
                    return `<g${num(o.op, 1) < 1 ? ` opacity="${n2(num(o.op, 1))}"` : ''}><g${clip}>${walk(o.children || [], depth + 1)}</g></g>`;
                }
                const live = depth === scope.length, svg = objSvg(o, defs, 'e', live || (!isolate && !o.locked ? 'out' : false));
                return live || !isolate ? svg : `<g class="vx-dim">${svg}</g>`;
            });
            return walk(doc.objs, 0);
        }
        const byId = id => cur().find(o => o.id === id);
        const selObjs = () => sel.map(byId).filter(Boolean);
        const editable = o => o && !o.locked && !o.hidden;
        /* historique */
        // l'historique garde les images importées une seule fois (sinon chaque étape recopierait des Mo)
        const imgStore = new Map(), imgKey = new Map();
        const snapshot = () => JSON.stringify(doc, (k, v) => { if (k === 'src' && typeof v === 'string' && v.length > 2000) { let id = imgKey.get(v); if (!id) { id = '@img:' + imgKey.size; imgKey.set(v, id); imgStore.set(id, v); } return id; } return v; });
        const unsnap = t => JSON.parse(t, (k, v) => k === 'src' && typeof v === 'string' && v.startsWith('@img:') ? imgStore.get(v) || '' : v);
        const commit = (label = '') => { hist = hist.slice(0, hi + 1); hist.push(snapshot()); if (hist.length > 150) hist.shift(); hi = hist.length - 1; dirty = true; status(label ? `✓ ${label}` : ''); render(); };
        const restore = i => { if (i < 0 || i >= hist.length) return; hi = i; doc = cleanDoc(unsnap(hist[hi])); sel = sel.filter(id => byId(id)); nodeSel = null; dirty = true; render(); };
        /* vue */
        const applyView = () => { world.setAttribute('transform', `translate(${n2(panX)} ${n2(panY)}) scale(${zoom})`); $('[data-vx-zoom]').textContent = `${Math.round(zoom * 100)} %`; drawUi(); drawGrid(); };
        const fit = () => { const r = stage.getBoundingClientRect(); zoom = clamp(Math.min((r.width - 60) / doc.w, (r.height - 60) / doc.h), 0.02, 40); panX = (r.width - doc.w * zoom) / 2; panY = (r.height - doc.h * zoom) / 2; applyView(); };
        const zoomAt = (f, cx, cy) => { const z = clamp(zoom * f, 0.02, 40); panX = cx - (cx - panX) * z / zoom; panY = cy - (cy - panY) * z / zoom; zoom = z; applyView(); };
        const toDoc = e => { const r = svgEl.getBoundingClientRect(); return [(e.clientX - r.left - panX) / zoom, (e.clientY - r.top - panY) / zoom]; };
        const snap = v => doc.snap && doc.grid > 0 ? Math.round(v / doc.grid) * doc.grid : v;
        function drawGrid() {
            const g = $('[data-vx-grid]'); if (!doc.grid || doc.grid * zoom < 4) { g.innerHTML = ''; return; }
            let h = ''; for (let x = doc.grid; x < doc.w; x += doc.grid) h += `M${x} 0V${doc.h}`; for (let y = doc.grid; y < doc.h; y += doc.grid) h += `M0 ${y}H${doc.w}`;
            g.innerHTML = `<path d="${h}" stroke="#4a90e2" stroke-opacity=".18" stroke-width="${n2(1 / zoom)}" fill="none"/>`;
        }
        /* dessin */
        function drawRef() {
            const g = $('[data-vx-ref]'), r = doc.ref; if (!g) return;
            g.innerHTML = r && r.show !== false && imgOk(r.src) ? `<image href="${esc(r.src)}" x="${n2(r.x)}" y="${n2(r.y)}" width="${n2(r.w)}" height="${n2(r.h)}" preserveAspectRatio="none" opacity="${n2(clamp(num(r.op, .5), .05, 1))}" style="pointer-events:none${r.gray ? ';filter:grayscale(1)' : ''}"/>` : '';
            g.innerHTML += ext.vectorMap?.scaleGridSvg?.(doc) || ''; // la grille d'échelle d'une carte (jamais imprimée)
        }
        function render() {
            mapCtx(doc, true); drawRef();
            const mt = $('[data-vx-maptools]'); if (mt) mt.hidden = !doc.map?.on;
            const b = $('[data-vx-board]'); b.setAttribute('width', doc.w); b.setAttribute('height', doc.h); b.setAttribute('fill', doc.bg === 'transparent' ? 'url(#vxchk)' : col(doc.bg, '#fff'));
            const defs = ['<pattern id="vxchk" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="16" height="16" fill="#fff"/><rect width="8" height="8" fill="#e8e8e8"/><rect x="8" y="8" width="8" height="8" fill="#e8e8e8"/></pattern>'];
            content.innerHTML = treeSvg(defs) + (penPath ? `<path d="${ptsD(penPath.pts, false)}" fill="none" stroke="#1473e6" stroke-width="${n2(1.5 / zoom)}"/>` : '');
            defsEl.innerHTML = defs.join('');
            drawUi(); drawGrid(); paintPanel(); paintFs(); paintCrumbs();
            $('[data-vx-tool="' + tool + '"]')?.classList.add('is-active');
        }
        function paintCrumbs() {
            const c = $('[data-vx-crumbs]'); if (!c) return; c.hidden = !scope.length; if (!scope.length) { c.innerHTML = ''; return; }
            const names = pathName(scope); c.innerHTML = `<button type="button" data-vx-crumb="${scope.length - 1}" title="Sortir d’un niveau (Échap)">⤴</button><button type="button" data-vx-crumb="0">Dessin</button>${names.map((n, i) => `<span>›</span><button type="button" data-vx-crumb="${i + 1}" class="${i === names.length - 1 ? 'is-on' : ''}">${esc(n)}</button>`).join('')}`;
        }
        /* repères commentés : en déplaçant, les bords et centres s'aimantent à ceux des autres objets et du plan de travail (⌘ : sans) */
        const SMART_KEY = 'lcnda-vx-smart'; let smart = (() => { try { return localStorage.getItem(SMART_KEY) !== '0'; } catch (_) { return true; } })();
        function smartSnap(b, dx, dy, ids) {
            if (!b) return {dx, dy, g: null}; const th = 6 / zoom, others = cur().filter(o => !ids.includes(o.id) && !o.hidden).map(rbox).filter(r => r.w || r.h).concat([{x: 0, y: 0, w: doc.w, h: doc.h}]);
            const best = (mine, targets) => { let d = null, v = null; mine.forEach(m => targets.forEach(t => { const dd = t - m; if (Math.abs(dd) < th && (d === null || Math.abs(dd) < Math.abs(d))) { d = dd; v = t; } })); return [d, v]; };
            const [ddx, vx] = best([b.x + dx, b.x + dx + b.w / 2, b.x + dx + b.w], others.flatMap(r => [r.x, r.x + r.w / 2, r.x + r.w]));
            const [ddy, vy] = best([b.y + dy, b.y + dy + b.h / 2, b.y + dy + b.h], others.flatMap(r => [r.y, r.y + r.h / 2, r.y + r.h]));
            const g = []; const nx = dx + (ddx || 0), ny = dy + (ddy || 0);
            if (vx !== null) { const ys = others.filter(r => [r.x, r.x + r.w / 2, r.x + r.w].some(t => Math.abs(t - vx) < .01)).flatMap(r => [r.y, r.y + r.h]); g.push(['x', vx, Math.min(b.y + ny, ...ys), Math.max(b.y + ny + b.h, ...ys)]); }
            if (vy !== null) { const xs = others.filter(r => [r.y, r.y + r.h / 2, r.y + r.h].some(t => Math.abs(t - vy) < .01)).flatMap(r => [r.x, r.x + r.w]); g.push(['y', vy, Math.min(b.x + nx, ...xs), Math.max(b.x + nx + b.w, ...xs)]); }
            return {dx: nx, dy: ny, g: g.length ? g : null};
        }
        const H = () => 9 / zoom;
        function drawUi() {
            let h = '';
            const list = selObjs();
            if (tool === 'direct') {
                list.forEach(o => { const pts = o.type === 'path' ? o.pts : null; if (!pts) { const b = rbox(o); h += `<rect x="${n2(b.x)}" y="${n2(b.y)}" width="${n2(b.w)}" height="${n2(b.h)}" class="vx-selbox" stroke-width="${n2(1 / zoom)}"/>`; return; }
                    const tr = rotAttr(o);
                    h += `<g${tr}>`;
                    pts.forEach((p, i) => {
                        const on = nodeSel && nodeSel.id === o.id && nodeSel.i === i;
                        [['i', p.i], ['o', p.o]].forEach(([w, q]) => { if (q && (on || (nodeSel?.id === o.id && Math.abs(nodeSel.i - i) <= 1))) h += `<line x1="${n2(p.x)}" y1="${n2(p.y)}" x2="${n2(q[0])}" y2="${n2(q[1])}" class="vx-hline" stroke-width="${n2(1 / zoom)}"/><circle cx="${n2(q[0])}" cy="${n2(q[1])}" r="${n2(H() / 2)}" class="vx-hand" data-vx-hand="${esc(o.id)}:${i}:${w}"/>`; });
                        h += `<rect x="${n2(p.x - H() / 2)}" y="${n2(p.y - H() / 2)}" width="${n2(H())}" height="${n2(H())}" class="vx-node${on ? ' is-on' : ''}" data-vx-node="${esc(o.id)}:${i}"/>`;
                    });
                    h += '</g>'; });
            } else if (list.length) {
                const one = list.length === 1 ? list[0] : null, b = one ? box(one) : unionBox(list), tr = one ? rotAttr(one) : '';
                h += `<g${tr}><rect x="${n2(b.x)}" y="${n2(b.y)}" width="${n2(b.w)}" height="${n2(b.h)}" class="vx-selbox" stroke-width="${n2(1 / zoom)}"/>`;
                if (!list.some(o => o.locked)) {
                    [['nw', 0, 0], ['n', .5, 0], ['ne', 1, 0], ['e', 1, .5], ['se', 1, 1], ['s', .5, 1], ['sw', 0, 1], ['w', 0, .5]].forEach(([k, fx, fy]) => { h += `<rect x="${n2(b.x + b.w * fx - H() / 2)}" y="${n2(b.y + b.h * fy - H() / 2)}" width="${n2(H())}" height="${n2(H())}" class="vx-handle" data-vx-h="${k}"/>`; });
                    h += `<line x1="${n2(b.x + b.w / 2)}" y1="${n2(b.y)}" x2="${n2(b.x + b.w / 2)}" y2="${n2(b.y - 26 / zoom)}" class="vx-hline" stroke-width="${n2(1 / zoom)}"/><circle cx="${n2(b.x + b.w / 2)}" cy="${n2(b.y - 26 / zoom)}" r="${n2(H() / 1.6)}" class="vx-rot" data-vx-h="rot"/>`;
                }
                h += '</g>';
            }
            if (drag?.guides) drag.guides.forEach(([k, v, a, b2]) => { h += k === 'x' ? `<line x1="${n2(v)}" y1="${n2(a)}" x2="${n2(v)}" y2="${n2(b2)}" class="vx-guide" stroke-width="${n2(1 / zoom)}"/>` : `<line x1="${n2(a)}" y1="${n2(v)}" x2="${n2(b2)}" y2="${n2(v)}" class="vx-guide" stroke-width="${n2(1 / zoom)}"/>`; });
            if (drag?.marquee) { const m = drag.marquee; h += `<rect x="${n2(Math.min(m[0], m[2]))}" y="${n2(Math.min(m[1], m[3]))}" width="${n2(Math.abs(m[2] - m[0]))}" height="${n2(Math.abs(m[3] - m[1]))}" class="vx-marquee" stroke-width="${n2(1 / zoom)}"/>`; }
            if (penPath?.pts.length) { const p0 = penPath.pts[0], last = penPath.pts.at(-1);
                if (penHover && isPen(tool)) { let [hx, hy, sh] = penHover; if (sh) { const a = Math.round(Math.atan2(hy - last.y, hx - last.x) / (Math.PI / 4)) * Math.PI / 4, L = Math.hypot(hx - last.x, hy - last.y); hx = last.x + Math.cos(a) * L; hy = last.y + Math.sin(a) * L; }
                    const near = penPath.pts.length > 2 && Math.hypot(p0.x - hx, p0.y - hy) < 10 / zoom; if (near) { hx = p0.x; hy = p0.y; }
                    h += `<path d="M${n2(last.x)} ${n2(last.y)}${last.o ? `C${n2(last.o[0])} ${n2(last.o[1])} ${n2(hx)} ${n2(hy)} ${n2(hx)} ${n2(hy)}` : `L${n2(hx)} ${n2(hy)}`}" class="vx-penprev" stroke-width="${n2(1 / zoom)}"/>`;
                    if (near) h += `<circle cx="${n2(p0.x)}" cy="${n2(p0.y)}" r="${n2(H())}" class="vx-penclose"/>`; }
                penPath.pts.forEach((q, i) => { if (q.o && i === penPath.pts.length - 1) h += `<line x1="${n2(q.x)}" y1="${n2(q.y)}" x2="${n2(q.o[0])}" y2="${n2(q.o[1])}" class="vx-hline" stroke-width="${n2(1 / zoom)}"/><circle cx="${n2(q.o[0])}" cy="${n2(q.o[1])}" r="${n2(H() / 2.4)}" class="vx-hand"/>`; h += `<rect x="${n2(q.x - H() / 2.6)}" y="${n2(q.y - H() / 2.6)}" width="${n2(H() / 1.3)}" height="${n2(H() / 1.3)}" class="vx-node"/>`; });
                h += `<circle cx="${n2(p0.x)}" cy="${n2(p0.y)}" r="${n2(H() / 1.4)}" class="vx-penstart"/>`; }
            ui.innerHTML = h;
        }
        function paintFs() {
            const o = selObjs()[0]; const f = o ? o.fill : defaults.fill, s = o ? (num(o.sw) ? o.stroke : 'none') : defaults.stroke;
            const fe = $('[data-vx-fsfill]'), se = $('[data-vx-fsstroke]'); fe.style.background = f === 'none' || !f ? 'repeating-linear-gradient(45deg,#fff 0 4px,#e33 4px 5px)' : col(f, '#000'); se.style.borderColor = s === 'none' || !s ? '#ccc' : col(s, '#000');
        }
        const defaults = {fill: '#f4c430', stroke: '#222222', sw: 2};
        const styleNew = () => ({fill: defaults.fill, stroke: defaults.stroke, sw: defaults.sw});
        /* outils */
        function setTool(t) { if (penPath && (t !== tool || !isPen(t))) finishPen(); if (MP && /^m(line|zone|sym|label|deco)$/.test(t)) MP.choose(t); tool = t; dlg.querySelectorAll('[data-vx-tool]').forEach(b => b.classList.toggle('is-active', b.dataset.vxTool === t)); stage.dataset.tool = t;
            hint({select: 'Clic : choisir (⇧ : en plus) · glisser : déplacer · poignées : agrandir, ⇧ garde les proportions · rond du haut : tourner (⇧ : par 15°)', direct: 'Glisse les points et leurs poignées · ⌥ clic sur un point : angle ↔ courbe · ⌫ : supprimer le point · double-clic sur un tracé : ajouter un point', pen: 'Clic : un point · glisser : une courbe (⌥ : casser la poignée) · ⇧ : angles de 45° · clic sur le 1er point : fermer · ⌫ : retirer le dernier point · Entrée, Échap ou double-clic : terminer · clic sur le bout d’un tracé ouvert choisi : le reprendre', pencil: 'Dessine à main levée : le trait est lissé', text: 'Clic : nouveau texte (écris-le dans « Propriétés »)', eyedrop: 'Clic sur un objet : sa couleur et son trait vont à la sélection', hand: 'Glisser : déplacer la vue (ou barre d’espace, ou la molette)', zoom: 'Clic : zoomer · ⌥ clic : dézoomer · ⌘ molette partout', spiral: 'Glisse depuis le centre : la taille et le départ de la spirale'}[t] || MP?.hint(t) || 'Glisse pour dessiner la forme · ⇧ : carré, cercle, angle droit');
            drawUi(); }
        function finishPen() {
            penHover = null; const zone = penPath?.map && VM()?.ZONES.some(z => z[0] === penPath.map.k);
            if (penPath && penPath.pts.length > (zone ? 2 : 1)) { if (zone) penPath.closed = true; const o = penPath; penPath = null; placeNew(o); commit(o.map ? o.name : 'Tracé à la plume'); } else { penPath = null; render(); }
        }
        /** un nouvel objet : dans le calque où l'on dessine ; en mode Plan (« ranger tout seul »), dans son calque (Routes, Eau, Bâti…) s'il existe */
        function placeNew(o) {
            const key = doc.map?.on && doc.map.auto !== false && MP ? MP.layerOf(o) : null, layer = key && doc.objs.find(l => l.layer && l.mapLayer === key && !l.locked && !l.hidden);
            if (layer && !(scope.length === 1 && scope[0] === layer.id)) { layer.children = layer.children || []; layer.children.push(o); scope = [layer.id]; openGroups.add(layer.id); nodeSel = null; }
            else cur().push(o);
            sel = [o.id];
        }
        /* glisser */
        let drag = null, space = false, penHover = null;
        const hitId = e => e.target.closest?.('[data-vx]')?.dataset.vx;
        svgEl.addEventListener('pointerdown', e => {
            if (document.activeElement?.matches?.('input, textarea, select')) document.activeElement.blur(); stage.focus({preventScroll: true});
            if (e.button === 1 || space || tool === 'hand') { drag = {pan: true, sx: e.clientX, sy: e.clientY, px: panX, py: panY}; svgEl.setPointerCapture(e.pointerId); return; }
            if (e.button !== 0) return;
            { const now = Date.now(), dbl = lastDown && now - lastDown.t < 400 && Math.hypot(e.clientX - lastDown.x, e.clientY - lastDown.y) < 6; lastDown = dbl ? null : {t: now, x: e.clientX, y: e.clientY}; if (dbl) { lastDblAt = now; handleDouble(e); return; } }
            const [x, y] = toDoc(e); svgEl.setPointerCapture(e.pointerId);
            const h = e.target.closest('[data-vx-h]')?.dataset.vxH;
            if (tool === 'zoom') { const r = svgEl.getBoundingClientRect(); zoomAt(e.altKey ? 1 / 1.5 : 1.5, e.clientX - r.left, e.clientY - r.top); return; }
            const out = (tool === 'select' || tool === 'direct' || tool === 'eyedrop') && !e.target.closest('[data-vx]') ? e.target.closest('[data-vx-out]')?.dataset.vxOut : null;
            if (out) { const f = findAny(out); if (f && enterScope(f.path)) { sel = [out]; render(); if (tool !== 'select') return; drag = {move: true, x, y, orig: selObjs().map(q => clone(q))}; return; } }
            if (tool === 'select') {
                if (h) { const list = selObjs(); const one = list.length === 1 ? list[0] : null; drag = {h, x, y, orig: list.map(o => clone(o)), ids: list.map(o => o.id), b: one ? box(one) : unionBox(list), one}; return; }
                const id = hitId(e), o = id && byId(id);
                if (o && !o.locked) { if (e.shiftKey) sel = sel.includes(id) ? sel.filter(s => s !== id) : [...sel, id]; else if (!sel.includes(id)) sel = [id];
                    let dup = false; if (e.altKey) { const copies = selObjs().map(q => { const c = clone(q); reId(c); return c; }); cur().push(...copies); sel = copies.map(q => q.id); dup = true; }
                    drag = {move: true, dup, x, y, orig: selObjs().map(q => clone(q))}; render(); return; }
                if (!e.shiftKey) sel = []; drag = {marquee: [x, y, x, y], add: e.shiftKey ? sel.slice() : []}; render(); return;
            }
            if (tool === 'direct') {
                const nd = e.target.closest('[data-vx-node]')?.dataset.vxNode, hd = e.target.closest('[data-vx-hand]')?.dataset.vxHand;
                if (nd) { const [id, i] = nd.split(':'); const o = byId(id); nodeSel = {id, i: Number(i)}; if (e.altKey) { const p = o.pts[Number(i)]; if (p.i || p.o) { p.i = null; p.o = null; } else { const a = o.pts[(Number(i) - 1 + o.pts.length) % o.pts.length], b2 = o.pts[(Number(i) + 1) % o.pts.length], t = [(b2.x - a.x) / 6, (b2.y - a.y) / 6]; p.i = [p.x - t[0], p.y - t[1]]; p.o = [p.x + t[0], p.y + t[1]]; } commit('Point : angle ↔ courbe'); return; }
                    drag = {node: true, id, i: Number(i), x, y, orig: clone(o)}; drawUi(); return; }
                if (hd) { const [id, i, w] = hd.split(':'); drag = {hand: true, id, i: Number(i), w, orig: clone(byId(id))}; return; }
                const id = hitId(e), o = id && byId(id);
                if (o && !o.locked) { if (o.type !== 'path') { const conv = o.type === 'svgpath' ? dToPts(o.d) : null; const n = o.type === 'svgpath' ? (conv ? {...o, type: 'path', pts: conv.pts, closed: conv.closed} : null) : toPath(o); if (n && n.type === 'path') { if (n.d) delete n.d; cur()[cur().indexOf(o)] = n; commit('Converti en tracé'); } else if (o.type === 'svgpath') hint('Ce tracé a plusieurs morceaux : Objet → Dissocier n’y peut rien ; utilise la Sélection pour le transformer.'); }
                    sel = [id]; nodeSel = null; render(); return; }
                sel = []; nodeSel = null; render(); return;
            }
            if (tool === 'mref') { if (doc.ref) drag = {ref: true, x, y, rx: doc.ref.x, ry: doc.ref.y}; return; }
            if (tool === 'msym' && MP?.pick().kind === 'building') { drag = {create: 'mbuild', x0: snap(x), y0: snap(y), x, y}; return; }
            if (['msym', 'mlabel', 'mdeco'].includes(tool) && MP) { const o = MP.newObj(tool, snap(x), snap(y)); if (!o) return; placeNew(o); if (tool === 'mlabel') { tab = 'props'; setTool('select'); commit(o.name); setTimeout(() => { const t = pane.querySelector('[data-vx-p="text"]'); t?.focus(); t?.select(); }, 30); return; } commit(o.name); return; }
            if (isPen(tool)) {
                if (penPath && penPath.pts.length > 2) { const p0 = penPath.pts[0]; if (Math.hypot(p0.x - x, p0.y - y) < 10 / zoom) { if (tool !== 'mline') penPath.closed = true; finishPen(); return; } }
                if (!penPath && tool !== 'pen') penPath = MP.newPen(tool);
                if (!penPath) {
                    // reprendre un tracé ouvert déjà choisi, en cliquant sur l'un de ses bouts
                    const o = selObjs()[0], tol = 10 / zoom;
                    if (o && o.type === 'path' && !o.closed && !o.locked && (o.pts || []).length > 1 && !num(o.rot)) { const a = o.pts[0], z = o.pts.at(-1), nearA = Math.hypot(a.x - x, a.y - y) < tol, nearZ = Math.hypot(z.x - x, z.y - y) < tol;
                        if (nearA || nearZ) { if (nearA && !nearZ) o.pts.reverse().forEach(q => { const t = q.i; q.i = q.o; q.o = t; }); penPath = o; setCur(cur().filter(q => q !== o)); sel = []; hint('Tracé repris : continue à cliquer · Entrée ou double-clic : terminer'); render(); return; } }
                    penPath = {id: uid(), type: 'path', name: 'Tracé', pts: [], closed: false, ...styleNew(), fill: 'none'};
                }
                let px = snap(x), py = snap(y); const last = penPath.pts.at(-1);
                if (e.shiftKey && last) { const a = Math.round(Math.atan2(py - last.y, px - last.x) / (Math.PI / 4)) * Math.PI / 4, L = Math.hypot(px - last.x, py - last.y); px = last.x + Math.cos(a) * L; py = last.y + Math.sin(a) * L; }
                if (last && Math.hypot(px - last.x, py - last.y) < 1.5 / zoom) { drag = {pen: true}; return; } // le 2e clic d'un double-clic n'ajoute pas de point
                penPath.pts.push(P(px, py)); drag = {pen: true}; render(); return;
            }
            if (tool === 'eyedrop') { const o = byId(hitId(e) || ''); if (!o) return; selObjs().forEach(q => { if (q === o) return; ['fill', 'stroke', 'sw', 'dash', 'grad', 'op'].forEach(k => { if (o[k] !== undefined) q[k] = clone(o[k]); else delete q[k]; }); }); defaults.fill = o.fill ?? defaults.fill; defaults.stroke = o.stroke ?? defaults.stroke; commit('Couleur prise'); return; }
            if (tool === 'text') { const o = {id: uid(), type: 'text', name: 'Texte', text: 'Texte', x: snap(x), y: snap(y), size: 36, font: 'Georgia', fill: defaults.fill === 'none' ? '#000000' : defaults.fill, sw: 0}; cur().push(o); sel = [o.id]; setTool('select'); tab = 'props'; commit('Texte'); setTimeout(() => { const t = pane.querySelector('[data-vx-p="text"]'); t?.focus(); t?.select(); }, 30); return; }
            if (tool === 'pencil') { drag = {pencil: [[x, y]]}; return; }
            drag = {create: tool, x0: snap(x), y0: snap(y), x, y};
        });
        svgEl.addEventListener('pointermove', e => {
            const [x, y] = toDoc(e); $('[data-vx-pos]').textContent = `x ${Math.round(x)} · y ${Math.round(y)}`;
            if (!drag && isPen(tool) && penPath) { penHover = [x, y, e.shiftKey]; drawUi(); return; }
            if (drag?.ref && doc.ref) { doc.ref.x = drag.rx + x - drag.x; doc.ref.y = drag.ry + y - drag.y; drag.moved = true; drawRef(); return; }
            if (!drag) return;
            if (drag.pan) { panX = drag.px + e.clientX - drag.sx; panY = drag.py + e.clientY - drag.sy; applyView(); return; }
            if (drag.move) { let dx = x - drag.x, dy = y - drag.y; if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; } if (doc.snap && doc.grid) { const b = unionBox(drag.orig); dx = snap(b.x + dx) - b.x; dy = snap(b.y + dy) - b.y; }
                drag.guides = null; if (smart && !(e.metaKey || e.ctrlKey) && !(doc.snap && doc.grid)) { const r = smartSnap(unionBox(drag.orig), dx, dy, drag.orig.map(o => o.id)); dx = r.dx; dy = r.dy; drag.guides = r.g; }
                drag.orig.forEach(o0 => { const i = cur().findIndex(o => o.id === o0.id); if (i >= 0) cur()[i] = moveObj(clone(o0), dx, dy); }); drag.moved = true; render(); return; }
            if (drag.marquee) { drag.marquee[2] = x; drag.marquee[3] = y; const m = drag.marquee, x0 = Math.min(m[0], m[2]), x1 = Math.max(m[0], m[2]), y0 = Math.min(m[1], m[3]), y1 = Math.max(m[1], m[3]);
                sel = [...new Set([...drag.add, ...cur().filter(o => !o.locked && !o.hidden).filter(o => { const b = rbox(o); return b.x < x1 && b.x + b.w > x0 && b.y < y1 && b.y + b.h > y0; }).map(o => o.id)])]; drawUi(); return; }
            if (drag.h) { resizeOrRotate(x, y, e); return; }
            if (drag.node || drag.hand) { const o = byId(drag.id); if (!o) return; const [lx, ly] = unrot(o, x, y);
                if (drag.node) { const p = o.pts[drag.i], q = drag.orig.pts[drag.i], dx = snap(lx) - q.x, dy = snap(ly) - q.y; p.x = q.x + dx; p.y = q.y + dy; if (q.i) p.i = [q.i[0] + dx, q.i[1] + dy]; if (q.o) p.o = [q.o[0] + dx, q.o[1] + dy]; }
                else { const p = o.pts[drag.i]; p[drag.w] = [lx, ly]; if (!e.altKey) { const other = drag.w === 'i' ? 'o' : 'i'; if (p[other]) { const len = Math.hypot(p[other][0] - p.x, p[other][1] - p.y), a = Math.atan2(ly - p.y, lx - p.x) + Math.PI; p[other] = [p.x + Math.cos(a) * len, p.y + Math.sin(a) * len]; } } }
                drag.moved = true; render(); return; }
            if (drag.pen) { const p = penPath?.pts.at(-1); if (!p) return; if (Math.hypot(x - p.x, y - p.y) > 2 / zoom) { p.o = [x, y]; if (!e.altKey) p.i = [2 * p.x - x, 2 * p.y - y]; render(); } return; }
            if (drag.pencil) { drag.pencil.push([x, y]); const d = 'M' + drag.pencil.map(p => n2(p[0]) + ' ' + n2(p[1])).join('L'); ui.innerHTML = `<path d="${d}" fill="none" stroke="${col(defaults.stroke, '#222')}" stroke-width="${n2(defaults.sw || 2)}"/>`; return; }
            if (drag.create) { let x1 = snap(x), y1 = snap(y); const t = drag.create;
                if (e.shiftKey) { if (t === 'line') { const a = Math.round(Math.atan2(y1 - drag.y0, x1 - drag.x0) / (Math.PI / 4)) * Math.PI / 4, L = Math.hypot(x1 - drag.x0, y1 - drag.y0); x1 = drag.x0 + Math.cos(a) * L; y1 = drag.y0 + Math.sin(a) * L; } else { const s = Math.max(Math.abs(x1 - drag.x0), Math.abs(y1 - drag.y0)); x1 = drag.x0 + Math.sign(x1 - drag.x0 || 1) * s; y1 = drag.y0 + Math.sign(y1 - drag.y0 || 1) * s; } }
                drag.x1 = x1; drag.y1 = y1; const o = makeShape(t, drag.x0, drag.y0, x1, y1); const defs = []; ui.innerHTML = o ? objSvg(o, defs, 'p') : ''; }
        });
        /** un objet tourné tourne autour du centre de sa boîte : après un changement de taille, on le recale pour que le point (ax, ay) ne bouge pas à l'écran */
        const keepAnchor = (before, after, ax, ay) => { const r = num(after.rot) * Math.PI / 180; if (!r) return; const w = (o, x, y) => { const b = box(o), cx = b.x + b.w / 2, cy = b.y + b.h / 2; return [cx + (x - cx) * Math.cos(r) - (y - cy) * Math.sin(r), cy + (x - cx) * Math.sin(r) + (y - cy) * Math.cos(r)]; }; const p0 = w(before, ax, ay), p1 = w(after, ax, ay); moveObj(after, p0[0] - p1[0], p0[1] - p1[1]); };
        const unrot = (o, x, y) => { const r = -num(o.rot) * Math.PI / 180; if (!r) return [x, y]; const b = box(o), cx = b.x + b.w / 2, cy = b.y + b.h / 2; return [cx + (x - cx) * Math.cos(r) - (y - cy) * Math.sin(r), cy + (x - cx) * Math.sin(r) + (y - cy) * Math.cos(r)]; };
        function makeShape(t, x0, y0, x1, y1) {
            const x = Math.min(x0, x1), y = Math.min(y0, y1), w = Math.abs(x1 - x0), h = Math.abs(y1 - y0);
            if (t === 'mbuild') return MP ? MP.newObj('msym', x0, y0, x1, y1) : null;
            if (t === 'spiral') { const R = Math.hypot(x1 - x0, y1 - y0); if (R < 3) return null; const turns = 3, steps = turns * 8, a0 = Math.atan2(y1 - y0, x1 - x0), dt = (turns * 2 * Math.PI) / steps;
                const pt = k => { const t = k * dt, r = R * k / steps, a = a0 - turns * 2 * Math.PI + t; return [x0 + r * Math.cos(a), y0 + r * Math.sin(a)]; };
                const pts = []; for (let k = 1; k <= steps; k++) { const [px, py] = pt(k), [ax, ay] = pt(k - .01), [bx, by] = pt(Math.min(steps, k + .01)), len = Math.hypot(bx - ax, by - ay) || 1, tl = (R * k / steps) * dt / 3 * Math.max(1, steps / k / 4), tx = (bx - ax) / len * tl, ty = (by - ay) / len * tl; pts.push(P(px, py, [px - tx, py - ty], [px + tx, py + ty])); }
                return {id: uid(), type: 'path', name: 'Spirale', pts, closed: false, fill: 'none', stroke: defaults.stroke === 'none' ? '#222222' : defaults.stroke, sw: defaults.sw || 2}; }
            if (t === 'line') return {id: uid(), type: 'path', name: 'Ligne', pts: [P(x0, y0), P(x1, y1)], closed: false, fill: 'none', stroke: defaults.stroke === 'none' ? '#222222' : defaults.stroke, sw: defaults.sw || 2};
            if (w < 1 || h < 1) return null;
            return {id: uid(), type: t, name: {rect: 'Rectangle', ellipse: 'Ellipse', polygon: 'Polygone', star: 'Étoile'}[t], x, y, w, h, ...styleNew(), ...(t === 'polygon' ? {n: 6} : t === 'star' ? {n: 5, inner: 45} : t === 'rect' ? {r: 0} : {})};
        }
        function resizeOrRotate(x, y, e) {
            const {h, b, orig, ids, one} = drag, cx = b.x + b.w / 2, cy = b.y + b.h / 2;
            if (h === 'rot') {
                let a = (Math.atan2(y - cy, x - cx) - Math.atan2(drag.y - cy, drag.x - cx)) * 180 / Math.PI; if (e.shiftKey) a = Math.round(a / 15) * 15;
                const r = a * Math.PI / 180;
                orig.forEach((o0, k) => { const o = clone(o0), ob = box(o0), ocx = ob.x + ob.w / 2, ocy = ob.y + ob.h / 2;
                    if (!one) { const nx = cx + (ocx - cx) * Math.cos(r) - (ocy - cy) * Math.sin(r), ny = cy + (ocx - cx) * Math.sin(r) + (ocy - cy) * Math.cos(r); moveObj(o, nx - ocx, ny - ocy); }
                    o.rot = ((num(o0.rot) + a) % 360 + 360) % 360; const i = cur().findIndex(q => q.id === ids[k]); if (i >= 0) cur()[i] = o; });
                drag.moved = true; render(); return;
            }
            const [lx, ly] = one ? unrot(one, x, y) : [x, y];
            let x0 = b.x, y0 = b.y, x1 = b.x + b.w, y1 = b.y + b.h;
            if (h.includes('w')) x0 = snap(lx); if (h.includes('e')) x1 = snap(lx); if (h.includes('n')) y0 = snap(ly); if (h.includes('s')) y1 = snap(ly);
            let fx = (x1 - x0) / (b.w || 1), fy = (y1 - y0) / (b.h || 1);
            if (e.shiftKey && h.length === 2) { const f = Math.max(Math.abs(fx), Math.abs(fy)); fx = Math.sign(fx || 1) * f; fy = Math.sign(fy || 1) * f; if (h.includes('w')) x0 = b.x + b.w - b.w * fx; else x1 = b.x + b.w * fx; if (h.includes('n')) y0 = b.y + b.h - b.h * fy; else y1 = b.y + b.h * fy; }
            const ax = h.includes('w') ? b.x + b.w : b.x, ay = h.includes('n') ? b.y + b.h : b.y;
            if (!h.includes('w') && !h.includes('e')) fx = 1; if (!h.includes('n') && !h.includes('s')) fy = 1;
            if (Math.abs(fx) < 0.001 || Math.abs(fy) < 0.001) return;
            const fs = Math.sqrt(Math.abs(fx * fy));
            orig.forEach((o0, k) => { const o = mapObj(clone(o0), (px, py) => [ax + (px - ax) * fx, ay + (py - ay) * fy], fs); if (one) keepAnchor(o0, o, ax, ay); const i = cur().findIndex(q => q.id === ids[k]); if (i >= 0) cur()[i] = o; });
            drag.moved = true; render();
        }
        svgEl.addEventListener('pointerup', e => {
            const d = drag; drag = null; if (!d) return;
            if (d.pan) return;
            if (d.ref) { if (d.moved) commit('Image de référence déplacée'); return; }
            if (d.marquee) { drawUi(); paintPanel(); return; }
            if (d.pen) { render(); return; }
            if (d.move && d.dup && !d.moved) { commit('Dupliqué'); return; }
            if ((d.move || d.h || d.node || d.hand) && d.moved) { commit(d.move ? 'Déplacé' : d.h === 'rot' ? 'Tourné' : d.h ? 'Redimensionné' : 'Point modifié'); return; }
            if (d.pencil) { const pts = d.pencil; if (pts.length < 3) { drawUi(); return; }
                const mask = null; void mask;
                const simp = (() => { const rdp = (p, eps) => { if (p.length < 3) return p; let dm = 0, ix = 0; const [ax, ay] = p[0], [bx, by] = p[p.length - 1], L = Math.hypot(bx - ax, by - ay) || 1; for (let i = 1; i < p.length - 1; i++) { const dd = Math.abs((by - ay) * p[i][0] - (bx - ax) * p[i][1] + bx * ay - by * ax) / L; if (dd > dm) { dm = dd; ix = i; } } return dm > eps ? [...rdp(p.slice(0, ix + 1), eps).slice(0, -1), ...rdp(p.slice(ix), eps)] : [p[0], p[p.length - 1]]; }; return rdp(pts, 1.5 / zoom); })();
                const closed = Math.hypot(simp[0][0] - simp.at(-1)[0], simp[0][1] - simp.at(-1)[1]) < 12 / zoom && simp.length > 3; if (closed) simp.pop();
                const n = simp.length, pp = simp.map((p, i) => { const a = simp[closed ? (i - 1 + n) % n : Math.max(0, i - 1)], b2 = simp[closed ? (i + 1) % n : Math.min(n - 1, i + 1)], t = [(b2[0] - a[0]) / 6, (b2[1] - a[1]) / 6]; return P(p[0], p[1], [p[0] - t[0], p[1] - t[1]], [p[0] + t[0], p[1] + t[1]]); });
                const o = {id: uid(), type: 'path', name: 'Crayon', pts: pp, closed, fill: closed ? defaults.fill : 'none', stroke: defaults.stroke === 'none' ? '#222222' : defaults.stroke, sw: defaults.sw || 2}; cur().push(o); sel = [o.id]; commit('Trait au crayon'); return; }
            if (d.create) { const o = d.x1 !== undefined ? makeShape(d.create, d.x0, d.y0, d.x1, d.y1) : null; if (!o) { drawUi(); return; } placeNew(o); commit(o.name); }
        });
        let lastDown = null, lastDblAt = 0;
        svgEl.addEventListener('dblclick', e => { if (Date.now() - lastDblAt < 600) return; handleDouble(e); });
        /** double-clic (détecté à la main : le dessin est refait entre les deux clics, le navigateur n'envoie alors pas « dblclick ») */
        function handleDouble(e) {
            if (isPen(tool)) { if (penPath) finishPen(); return; }
            let id = hitId(e), o = id && byId(id);
            if (!o && tool === 'select') { const [x, y] = toDoc(e); o = selObjs().find(g => (() => { const r = rbox(g); return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; })()); id = o?.id; } // le cadre de sélection est par-dessus
            if (!o) { if (scope.length && tool === 'select') { scope = scope.slice(0, -1); sel = []; render(); } return; }
            if (o.type === 'text') { sel = [id]; tab = 'props'; render(); pane.querySelector('[data-vx-p="text"]')?.focus(); return; }
            if (tool === 'direct' && o.type === 'path') { // ajouter un point au plus près
                const [x, y] = unrot(o, ...toDoc(e)); let best = 0, bd = Infinity; o.pts.forEach((p, i) => { const q = o.pts[(i + 1) % o.pts.length]; if (!o.closed && i === o.pts.length - 1) return; const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2, dd = Math.hypot(mx - x, my - y); if (dd < bd) { bd = dd; best = i; } });
                o.pts.splice(best + 1, 0, P(x, y)); nodeSel = {id, i: best + 1}; commit('Point ajouté'); return; }
            if (o.type === 'group') { if (enterScope([...scope, o.id])) { openGroups.add(o.id); render(); hint(`Tu es dans « ${o.name || 'le groupe'} » : le reste est pâli. Échap ou ⤴ pour en sortir.`); } }
        }
        stage.addEventListener('wheel', e => { e.preventDefault(); const r = svgEl.getBoundingClientRect(); if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * 0.0022), e.clientX - r.left, e.clientY - r.top); else { panX -= e.deltaX; panY -= e.deltaY; applyView(); } }, {passive: false});
        /* panneau de droite */
        /* couleurs : les émaux et nuances de base, les dernières couleurs libres employées, et 🎨 pour n'importe quelle couleur */
        const RECENT_KEY = 'lcnda-vx-recent-colors';
        const recentColors = () => { try { const a = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); return Array.isArray(a) ? a.filter(c => /^#[0-9a-f]{6}$/i.test(c)).slice(0, 10) : []; } catch (_) { return []; } };
        const rememberColor = c => { if (!/^#[0-9a-f]{6}$/i.test(c || '')) return; try { localStorage.setItem(RECENT_KEY, JSON.stringify([c.toLowerCase(), ...recentColors().filter(x => x !== c.toLowerCase())].slice(0, 10))); } catch (_) {} };
        const hex6 = (c, d = '#000000') => /^#[0-9a-f]{6}$/i.test(c || '') ? c : d;
        const freeColor = (attr, cur, title = 'Couleur libre : n’importe quelle couleur') => `<label class="vx-swfree" title="${esc(title)}">🎨<input type="color" data-vx-free="${attr}" value="${esc(hex6(cur))}"></label>`;
        const swatchRow = (attr, cur) => { const base = [...SWATCHES, ...TINCTURES.map(t => t[2])].filter((c, i, a) => a.indexOf(c) === i), rec = recentColors().filter(c => !base.includes(c));
            const btn = c => `<button type="button" ${attr}="${c}" title="${esc(TINCTURES.find(t => t[2] === c)?.[1] || c)}" class="${c === cur ? 'is-on' : ''}" style="${c === 'none' ? 'background:repeating-linear-gradient(45deg,#fff 0 4px,#e33 4px 5px)' : `background:${c}`}"></button>`;
            return `<div class="vx-sw">${base.map(btn).join('')}${freeColor(attr, cur)}</div>${rec.length ? `<div class="vx-sw vx-recent"><small>Récentes</small>${rec.map(btn).join('')}</div>` : ''}`; };
        const fld = (k, label, v, {type = 'number', step = 1, min = '', max = ''} = {}) => `<label>${esc(label)}<input data-vx-p="${k}" type="${type}" step="${step}" ${min !== '' ? `min="${min}"` : ''} ${max !== '' ? `max="${max}"` : ''} value="${esc(v ?? '')}"></label>`;
        /* ─── panneau Calques : l'arbre des calques et groupes (le haut de la liste = le dessus du dessin) ─── */
        const openGroups = new Set();
        const LIC = {group: '🗂', text: 'T', image: '🖼', path: '✒', svgpath: '✒', rect: '▭', ellipse: '◯', polygon: '⬡', star: '☆'};
        const samePath = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
        function layersPane() {
            const rows = [];
            const walk = (arr, path) => [...arr].reverse().forEach(o => {
                const g = isLayerGroup(o), here = samePath(path, scope), active = g && samePath([...path, o.id], scope), inside = g && scope.length > path.length && scope[path.length] === o.id && samePath(scope.slice(0, path.length), path);
                const open = g && (openGroups.has(o.id) || inside);
                rows.push(`<div class="vx-layer${sel.includes(o.id) && here ? ' is-sel' : ''}${active ? ' is-active' : ''}${here ? '' : ' is-out'}${o.layer ? ' is-layer' : ''}" data-vx-layer="${esc(o.id)}" draggable="true" style="--d:${path.length}">`
                    + (g ? `<button type="button" class="vx-ltw" data-vx-ltoggle title="Déplier / replier">${open ? '▾' : '▸'}</button>` : '<span class="vx-ltw"></span>')
                    + `<span class="vx-lic">${o.layer ? '📄' : LIC[o.type] || '•'}</span><input data-vx-lname readonly title="Double-clic pour renommer" value="${esc(o.name || '')}" placeholder="${esc(o.type)}">`
                    + (g ? `<button type="button" data-vx-lenter title="${active ? 'Sortir de ce ' + (o.layer ? 'calque' : 'groupe') : 'Travailler dans ce ' + (o.layer ? 'calque' : 'groupe') + ' : les nouveaux dessins y vont'}" class="vx-lenter${active ? ' is-on' : ''}">${active ? '●' : '○'}</button>` : '')
                    + (g ? `<button type="button" data-vx-lclip class="vx-lclip${o.clip ? ' is-on' : ''}" title="${o.clip ? 'Retirer le masque : la forme revient tout en haut, rien n’est perdu' : `Masquer avec la forme du dessus : la forme la plus haute de ce ${o.layer ? 'calque' : 'groupe'} le découpe (on ne voit que ce qui est dedans)`}">✂️</button>` : '')
                    + `<button type="button" data-vx-lvis title="Montrer / cacher">${o.hidden ? '🙈' : '👁'}</button><button type="button" data-vx-llock title="Verrouiller">${o.locked ? '🔒' : '🔓'}</button><button type="button" data-vx-lup title="Vers le haut">↑</button><button type="button" data-vx-ldown title="Vers le bas">↓</button><button type="button" data-vx-ldel title="Supprimer">🗑</button></div>`);
                if (open) walk(o.children || [], [...path, o.id]);
            });
            walk(doc.objs, []);
            const where = scope.length ? pathName(scope).map(esc).join(' › ') : 'le dessin (hors calque)';
            return `<div class="vx-ltools"><button type="button" class="button small" data-vx-lnew title="Un calque vide, au-dessus des autres : tu dessines dedans">＋ Calque</button><button type="button" class="button small secondary" data-vx-lgroup title="${sel.length ? 'Range la sélection dans un groupe' : 'Un groupe vide dans le calque actuel'}">🗂 ${sel.length ? 'Grouper la sélection' : 'Groupe'}</button>${(() => { const gs = []; const w = (arr, d) => arr.forEach(o => { if (isLayerGroup(o)) { if (!sel.includes(o.id)) gs.push([o.id, '\u2003'.repeat(d) + (o.layer ? '📄 ' : '🗂 ') + (o.name || (o.layer ? 'Calque' : 'Groupe'))]); w(o.children || [], d + 1); } }); w(doc.objs, 0);
                    return sel.length && gs.length ? `<select class="vx-lmoveto" data-vx-lmoveto title="Ranger la sélection dans un groupe ou un calque, sans glisser"><option value="">📁 Ranger dans…</option>${gs.map(([id, n]) => `<option value="${esc(id)}">${esc(n)}</option>`).join('')}</select>` : ''; })()}${scope.length ? '<button type="button" class="button small secondary" data-vx-lexit title="Revenir au niveau du dessus (Échap)">⤴ Sortir</button>' : ''}</div>
                <p class="vx-lwhere">Tu dessines dans : <strong>${where}</strong></p>
                <div class="vx-layers" data-vx-ltree data-dnd-off data-ord-off>${rows.join('') || A().emptyState({icon: '🗂️', text: 'Aucun calque pour l’instant', hint: 'Dessine avec les outils de gauche, ou Fichier → Importer.', action: {label: '＋ Calque', attrs: 'data-vx-lnew'}})}</div>
                <p class="muted vx-lhelp">Glisse une ligne sur un groupe pour l’y ranger (il devient bleu), entre deux lignes pour changer l’ordre ; ou sélectionne puis « 📁 Ranger dans… ». Double-clic sur un nom pour le renommer. ✂️ : la forme la plus haute du groupe ou du calque le découpe (masque), 2e clic pour le retirer. ○ : travailler dans ce calque ou ce groupe. Dans le dessin : double-clic sur un groupe pour y entrer, Échap pour en sortir.</p>`;
        }
        /** déplacer un objet (n'importe où) avant / après une ligne, ou dans un groupe */
        function moveInTree(id, targetId, where) {
            if (id === targetId) return false;
            const src = findAny(id), dst = findAny(targetId); if (!src || !dst) return false;
            if (dst.path.includes(id) || (where === 'into' && targetId === id)) return false; // pas dans lui-même
            if (where === 'into' && !isLayerGroup(dst.o)) return false;
            src.arr.splice(src.arr.indexOf(src.o), 1);
            if (where === 'into') { dst.o.children = dst.o.children || []; dst.o.children.push(src.o); openGroups.add(dst.o.id); }
            else { const i = dst.arr.indexOf(dst.o); dst.arr.splice(where === 'above' ? i + 1 : i, 0, src.o); } // au-dessus dans la liste = après dans le tableau
            if (!findAny(id) || !samePath(findAny(id).path, scope)) sel = sel.filter(s => s !== id);
            return true;
        }
        function newLayer() {
            const n = doc.objs.filter(o => o.layer).length + 1, g = {id: uid(), type: 'group', layer: true, name: `Calque ${n}`, children: []};
            doc.objs.push(g); enterScope([g.id]); openGroups.add(g.id); return g;
        }
        /** les modes Blason et Carte : cochés en haut, sinon leurs onglets et menus sont cachés */
        const blasonOn = () => doc.blasonOn ?? (doc.kind === 'blason' || /"name":"Blason"/.test(JSON.stringify(doc.objs || []).slice(0, 200000)));
        function paintModes() {
            const b = blasonOn(), m = !!doc.map?.on; if ((tab === 'blason' && !b) || (tab === 'map' && !m)) tab = 'props';
            dlg.querySelectorAll('[data-vx-tab="blason"]').forEach(x => { x.hidden = !b; }); dlg.querySelectorAll('[data-vx-tab="map"]').forEach(x => { x.hidden = !m; });
            const mb = dlg.querySelector('[data-vx-mode="blason"]'), mm = dlg.querySelector('[data-vx-mode="map"]'); if (mb) mb.checked = b; if (mm) mm.checked = m;
            dlg.querySelectorAll('.vx-menus details').forEach(d => { const t = d.querySelector('summary')?.textContent.trim(); if (t === 'Blason') d.hidden = !b; if (t === 'Plan') d.hidden = !m; });
        }
        function paintPanel() {
            paintModes();
            dlg.querySelectorAll('[data-vx-tab]').forEach(b => b.classList.toggle('is-active', b.dataset.vxTab === tab));
            if (document.activeElement && pane.contains(document.activeElement) && document.activeElement.matches('input:not([type=color]):not([type=range]), textarea, select') && tab === 'props') return; // on écrit : ne pas tout redessiner
            if (tab === 'layers') { pane.innerHTML = layersPane(); return; }
            if (tab === 'doc') { pane.innerHTML = `<div class="vx-form"><h4>Plan de travail</h4>${fld('dw', 'Largeur (px)', doc.w, {min: 10, max: 20000})}${fld('dh', 'Hauteur (px)', doc.h, {min: 10, max: 20000})}
                <div class="vx-row">${[['A4 portrait', 794, 1123], ['A4 paysage', 1123, 794], ['Carré', 1000, 1000], ['Écu (5 × 6)', 500, 600], ['16:9', 1280, 720]].map(([l, w, h]) => `<button type="button" class="button small secondary" data-vx-size="${w}x${h}">${l}</button>`).join('')}</div>
                <label>Fond<select data-vx-p="dbg"><option value="#ffffff" ${doc.bg !== 'transparent' ? 'selected' : ''}>Couleur</option><option value="transparent" ${doc.bg === 'transparent' ? 'selected' : ''}>Transparent</option></select></label>${doc.bg !== 'transparent' ? `<label>Couleur du fond<input type="color" data-vx-p="dbgc" value="${esc(/^#[0-9a-f]{6}$/i.test(doc.bg) ? doc.bg : '#ffffff')}"></label>` : ''}
                <h4>Grille</h4>${fld('dgrid', 'Pas de la grille (0 = aucune)', doc.grid, {min: 0, max: 500})}<label class="checkbox-line"><input type="checkbox" data-vx-p="dsnap" ${doc.snap ? 'checked' : ''}> Aimanter à la grille</label>
                <h4>Raccourcis</h4><p class="muted vx-keys">V sélection · A sélection directe · P plume · N crayon · M rectangle · L ellipse · Y polygone · S étoile · \\ ligne · T texte · I pipette · H main · Z loupe · Espace : main · ⌘Z/⇧⌘Z · ⌘C/⌘V/⌘D · ⌘G/⇧⌘G · flèches : 1 px (⇧ : 10 px) · ⌘0 tout voir</p></div>`; return; }
            if (tab === 'blason') { pane.innerHTML = blasonPane(); return; }
            if (tab === 'map') { pane.innerHTML = MP ? MP.paneHtml() : '<p class="muted">Le mode Plan n’est pas chargé.</p>'; return; }
            const list = selObjs(), o = list[0];
            if (!o) { pane.innerHTML = `<div class="vx-form"><p class="muted">Choisis un objet (outil Sélection) pour changer ses couleurs, son trait, sa taille. Les couleurs ci-dessous seront celles des prochaines formes.</p><h4>Remplissage par défaut</h4>${swatchRow('data-vx-dfill', defaults.fill)}<h4>Contour par défaut</h4>${swatchRow('data-vx-dstroke', defaults.stroke)}${fld('dsw', 'Épaisseur du contour', defaults.sw, {min: 0, max: 200, step: .5})}</div>`; return; }
            const b = rbox(o), many = list.length > 1;
            pane.innerHTML = `<div class="vx-form"><h4>${many ? `${list.length} objets` : esc(o.name || o.type)}</h4>
                ${!many ? `<div class="vx-grid4">${fld('x', 'X', n2(b.x))}${fld('y', 'Y', n2(b.y))}${fld('w', 'L', n2(b.w), {min: 0})}${fld('h', 'H', n2(b.h), {min: 0})}</div>` : ''}${fld('rot', 'Rotation (°)', n2(o.rot || 0), {min: -360, max: 360})}
                ${o.type === 'text' ? `<label>Texte<textarea data-vx-p="text" rows="3">${esc(o.text || '')}</textarea></label><div class="vx-grid2"><label>Police<input data-vx-p="font" list="vx-fonts" value="${esc(o.font || 'Georgia')}"></label>${fld('size', 'Taille', o.size, {min: 2, max: 2000})}</div><datalist id="vx-fonts">${['Georgia', 'Times New Roman', 'Garamond', 'Baskerville', 'Palatino', 'Helvetica', 'Arial', 'Verdana', 'Trebuchet MS', 'Courier New', 'Brush Script MT', 'Copperplate', 'Papyrus', 'UnifrakturMaguntia', 'Old English Text MT'].map(f => `<option value="${f}">`).join('')}</datalist>
                    <div class="vx-row"><label class="checkbox-line"><input type="checkbox" data-vx-p="bold" ${o.bold ? 'checked' : ''}> Gras</label><label class="checkbox-line"><input type="checkbox" data-vx-p="italic" ${o.italic ? 'checked' : ''}> Italique</label><select data-vx-p="align">${[['start', 'À gauche'], ['middle', 'Centré'], ['end', 'À droite']].map(([k, l]) => `<option value="${k}" ${(o.align || 'start') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>${fld('ls', 'Espacement des lettres', o.ls || 0, {min: -20, max: 200, step: .5})}` : ''}
                ${o.type === 'rect' ? fld('r', 'Arrondi des coins', o.r || 0, {min: 0, max: 5000}) : ''}${o.type === 'polygon' || o.type === 'star' ? fld('n', o.type === 'star' ? 'Branches' : 'Côtés', o.n, {min: 3, max: 60}) : ''}${o.type === 'star' ? fld('inner', 'Creux (%)', o.inner, {min: 5, max: 100}) : ''}
                ${o.type === 'path' ? `<label class="checkbox-line"><input type="checkbox" data-vx-p="closed" ${o.closed ? 'checked' : ''}> Tracé fermé</label>` : ''}${['path', 'svgpath'].includes(o.type) ? `<label class="checkbox-line"><input type="checkbox" data-vx-p="evenodd" ${o.evenodd ? 'checked' : ''}> Trous (pair-impair)</label>` : ''}
                ${o.type === 'image' ? '<p><button type="button" class="button small" data-vx-cmd="vectorize">🪄 Vectoriser cette image</button></p>' : ''}
                ${!many && MP ? MP.propsHtml(o) : ''}
                ${o.type !== 'image' && o.type !== 'group' && !o.map && !['msym', 'mdeco'].includes(o.type) ? `<h4>Remplissage</h4>${swatchRow('data-vx-fill', o.fill)}<div class="vx-row"><select data-vx-p="gtype"><option value="">Couleur unie</option><option value="linear" ${o.grad?.type === 'linear' ? 'selected' : ''}>Dégradé linéaire</option><option value="radial" ${o.grad?.type === 'radial' ? 'selected' : ''}>Dégradé radial</option></select></div>
                    ${o.grad ? `<div class="vx-row"><input type="color" data-vx-p="gc1" value="${esc(/^#[0-9a-f]{6}$/i.test(o.grad.c1 || '') ? o.grad.c1 : '#ffffff')}"><input type="color" data-vx-p="gc2" value="${esc(/^#[0-9a-f]{6}$/i.test(o.grad.c2 || '') ? o.grad.c2 : '#000000')}">${o.grad.type === 'linear' ? `<input type="number" data-vx-p="gangle" value="${n2(o.grad.angle || 0)}" title="Angle (°)" style="width:70px">` : ''}</div>` : ''}
                    <h4>Contour</h4>${swatchRow('data-vx-stroke', num(o.sw) ? o.stroke : 'none')}<div class="vx-row">${fld('sw', 'Épaisseur', o.sw || 0, {min: 0, max: 500, step: .5})}</div>
                    <div class="vx-grid2"><label>Pointillés<select data-vx-p="dash">${[['', 'plein'], ['dash', 'tirets'], ['dot', 'points'], ['long', 'longs tirets'], ['dashdot', 'tiret-point']].map(([k, l]) => `<option value="${k}" ${(o.dash || '') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label><label>Bouts<select data-vx-p="cap">${[['round', 'ronds'], ['butt', 'plats'], ['square', 'carrés']].map(([k, l]) => `<option value="${k}" ${(o.cap || 'round') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label><label>Angles<select data-vx-p="join">${[['round', 'ronds'], ['miter', 'pointus'], ['bevel', 'biseautés']].map(([k, l]) => `<option value="${k}" ${(o.join || 'round') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>` : ''}
                <label>Opacité (%) <input type="range" data-vx-p="op" min="0" max="100" value="${Math.round(num(o.op, 1) * 100)}"></label>
                <div class="vx-row">${many ? '<button type="button" class="button small secondary" data-vx-cmd="group">Grouper</button>' : ''}${o.type === 'group' ? '<button type="button" class="button small secondary" data-vx-cmd="ungroup">Dissocier</button>' : ''}${['rect', 'ellipse', 'polygon', 'star'].includes(o.type) ? '<button type="button" class="button small secondary" data-vx-cmd="topath">Convertir en tracé</button>' : ''}<button type="button" class="button small secondary" data-vx-cmd="dup">Dupliquer</button><button type="button" class="button small danger" data-vx-cmd="del">Supprimer</button></div></div>`;
        }
        // une valeur du panneau → tous les objets choisis
        function setProp(k, v, el) {
            if (['dw', 'dh', 'dgrid', 'dbg', 'dbgc', 'dsnap', 'dsw'].includes(k)) {
                if (k === 'dw') doc.w = clamp(num(v, doc.w), 10, 20000); if (k === 'dh') doc.h = clamp(num(v, doc.h), 10, 20000); if (k === 'dgrid') doc.grid = clamp(num(v), 0, 500); if (k === 'dsnap') doc.snap = el.checked;
                if (k === 'dbg') { doc.bg = v === 'transparent' ? 'transparent' : '#ffffff'; tab = 'doc'; } if (k === 'dbgc') doc.bg = col(v, '#ffffff'); if (k === 'dsw') { defaults.sw = clamp(num(v), 0, 200); return; }
                return k === 'dbg' || k === 'dsnap' ? commit('Plan de travail') : later('Plan de travail', true);
            }
            const list = selObjs().filter(o => !o.locked); if (!list.length) return;
            list.forEach(o => {
                if (['x', 'y', 'w', 'h'].includes(k)) { const b = rbox(o), val = num(v); if (k === 'x') moveObj(o, val - b.x, 0); if (k === 'y') moveObj(o, 0, val - b.y); const ub = box(o), before = clone(o); if (k === 'w' && ub.w && val > 0) { const f = val / ub.w; mapObj(o, (px, py) => [ub.x + (px - ub.x) * f, py]); keepAnchor(before, o, ub.x, ub.y); } if (k === 'h' && ub.h && val > 0) { const f = val / ub.h; mapObj(o, (px, py) => [px, ub.y + (py - ub.y) * f]); keepAnchor(before, o, ub.x, ub.y); } return; }
                if (k === 'rot') { o.rot = ((num(v) % 360) + 360) % 360; return; }
                if (k === 'op') { o.op = clamp(num(v, 100) / 100, 0, 1); return; }
                if (['bold', 'italic', 'closed', 'evenodd'].includes(k)) { o[k] = el.checked; return; }
                if (k === 'gtype') { if (!v) delete o.grad; else o.grad = {type: v, c1: o.grad?.c1 || '#ffffff', c2: o.grad?.c2 || (o.fill && o.fill !== 'none' ? o.fill : '#000000'), angle: o.grad?.angle || 90}; if (o.fill === 'none') o.fill = '#000000'; return; }
                if (k === 'gc1' || k === 'gc2' || k === 'gangle') { if (o.grad) o.grad[k === 'gangle' ? 'angle' : k.slice(1)] = k === 'gangle' ? num(v) : col(v, '#000'); return; }
                if (k === 'fill') { o.fill = col(v, '#000'); delete o.grad; return; }
                if (k === 'stroke') { o.stroke = col(v, '#000'); if (!num(o.sw)) o.sw = 2; return; }
                if (['sw', 'size', 'r', 'n', 'inner', 'ls'].includes(k)) { o[k] = clamp(num(v), k === 'n' ? 3 : 0, k === 'size' ? 2000 : 5000); return; }
                if (k === 'font') { o.font = font(v); return; }
                if (k === 'text') { o.text = String(v).slice(0, 20000); o.name = o.text.split('\n')[0].slice(0, 30) || 'Texte'; return; }
                if (['dash', 'cap', 'join', 'align'].includes(k)) o[k] = v;
            });
            later('Propriété changée', ['text', 'font', 'x', 'y', 'w', 'h', 'rot', 'size', 'sw', 'r', 'ls', 'gangle', 'n', 'inner', 'fill', 'stroke', 'gc1', 'gc2', 'op'].includes(k));
        }
        let laterT = 0;
        const later = (label, typing = false) => { if (typing) { renderNoPanel(); clearTimeout(laterT); laterT = setTimeout(() => { laterT = 0; commit(label); }, 600); } else commit(label); };
        const renderNoPanel = () => { mapCtx(doc, true); drawRef(); const defs = []; content.innerHTML = treeSvg(defs); defsEl.innerHTML = '<pattern id="vxchk" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="16" height="16" fill="#fff"/><rect width="8" height="8" fill="#e8e8e8"/><rect x="8" y="8" width="8" height="8" fill="#e8e8e8"/></pattern>' + defs.join(''); drawUi(); dirty = true; };
        const applyFree = (attr, c, final) => {
            if (attr === 'data-vx-dfill' || attr === 'data-vx-dstroke') { defaults[attr === 'data-vx-dfill' ? 'fill' : 'stroke'] = c; paintFs(); if (final) { rememberColor(c); paintPanel(); } return; }
            const list = selObjs().filter(o => !o.locked); if (!list.length) return toast('Choisis d’abord un objet.', 'error');
            list.forEach(o => { if (attr === 'data-vx-stroke') { o.stroke = c; if (!num(o.sw)) o.sw = 2; } else if (attr === 'data-bl-tintfree') { if (o.type === 'group') (o.children || []).forEach(ch => { if (ch.fill !== 'none') ch.fill = c; }); else if (o.type !== 'image') { o.fill = c; delete o.grad; } } else { o.fill = c; delete o.grad; } });
            if (final) { rememberColor(c); clearTimeout(laterT); laterT = 0; commit('Couleur libre'); } else later('Couleur libre', true);
        };
        // 🗺️ l'onglet Plan et les réglages de plan d'un objet (heritage-vector-map.js)
        ['click', 'input', 'change'].forEach(ev => pane.addEventListener(ev, e => { if (MP && e.target.closest?.('[data-vm],[data-vmp],[data-vm-pick],[data-vm-cmd],[data-vmp-link],[data-vmp-unlink],[data-vmp-open],[data-vmp-reset]')) { if (MP.onPaneEvent(e)) e.stopImmediatePropagation(); } }, true));
        pane.addEventListener('input', e => { if (e.target.dataset.vxFree) applyFree(e.target.dataset.vxFree, e.target.value, false); });
        pane.addEventListener('change', e => { if (e.target.dataset.vxFree) applyFree(e.target.dataset.vxFree, e.target.value, true); });
        pane.addEventListener('input', e => { const el = e.target; if (el.dataset.vxP) setProp(el.dataset.vxP, el.type === 'checkbox' ? el.checked : el.value, el); else if (el.matches('[data-vx-lname]')) { const o = findAny(el.closest('[data-vx-layer]').dataset.vxLayer)?.o; if (o) { o.name = el.value.slice(0, 60); dirty = true; } } else if (el.dataset.bl !== undefined) { blasonState[el.dataset.bl] = el.value; paintBlasonPreview(); } });
        pane.addEventListener('change', e => { const el = e.target; if (el.dataset.vxP && laterT) { clearTimeout(laterT); laterT = 0; commit('Propriété changée'); } if (el.matches('[data-vx-lname]')) commit('Calque renommé');
            if (el.matches('[data-vx-lmoveto]') && el.value) { const gid = el.value, ids = sel.slice(); let n = 0; ids.forEach(id => { if (moveInTree(id, gid, 'into')) n++; }); if (n) commit('Rangé dans un groupe'); else { toast('Impossible de ranger ici (un groupe ne va pas dans lui-même).', 'error'); paintPanel(); } } });
        const renameLayer = id => setTimeout(() => { const inp = [...pane.querySelectorAll('[data-vx-layer]')].find(r => r.dataset.vxLayer === id)?.querySelector('[data-vx-lname]'); if (!inp) return; inp.readOnly = false; inp.focus(); inp.select(); }, 30);
        pane.addEventListener('focusout', e => { if (e.target.matches?.('[data-vx-lname]')) e.target.readOnly = true; });
        pane.addEventListener('keydown', e => { if (e.target.matches?.('[data-vx-lname]') && e.key === 'Enter') e.target.blur(); });
        pane.addEventListener('focusout', () => { if (laterT) { clearTimeout(laterT); laterT = 0; setTimeout(() => commit('Propriété changée'), 0); } });
        pane.addEventListener('click', async e => {
            const b = e.target.closest('button'); if (!b) return;
            const sw = b.dataset.vxFill ?? b.dataset.vxStroke; if (sw !== undefined) { const k = b.dataset.vxFill !== undefined ? 'fill' : 'stroke'; selObjs().filter(o => !o.locked).forEach(o => { if (k === 'fill') { o.fill = sw; delete o.grad; } else if (sw === 'none') o.sw = 0; else { o.stroke = sw; if (!num(o.sw)) o.sw = 2; } }); commit(k === 'fill' ? 'Remplissage' : 'Contour'); return; }
            if (b.dataset.vxDfill) { defaults.fill = b.dataset.vxDfill; paintPanel(); paintFs(); return; } if (b.dataset.vxDstroke) { defaults.stroke = b.dataset.vxDstroke; paintPanel(); paintFs(); return; }
            if (b.dataset.vxSize) { const [w, h] = b.dataset.vxSize.split('x').map(Number); doc.w = w; doc.h = h; commit('Plan de travail'); fit(); return; }
            if (b.matches('[data-vx-lnew]')) { newLayer(); commit('Nouveau calque'); return; }
            if (b.matches('[data-vx-lgroup]')) { if (sel.length) { CMDS.group(); return; } const g = {id: uid(), type: 'group', name: 'Groupe', children: []}; cur().push(g); const path = [...scope, g.id]; enterScope(path); openGroups.add(g.id); commit('Nouveau groupe'); return; }
            if (b.matches('[data-vx-lexit]')) { scope = scope.slice(0, -1); sel = []; nodeSel = null; render(); return; }
            const row = b.closest('[data-vx-layer]'); if (row) { const f = findAny(row.dataset.vxLayer); if (!f) return; const {o, arr, path} = f, i = arr.indexOf(o);
                if (b.matches('[data-vx-ltoggle]')) { if (openGroups.has(o.id)) openGroups.delete(o.id); else openGroups.add(o.id); paintPanel(); return; }
                if (b.matches('[data-vx-lenter]')) { if (samePath([...path, o.id], scope)) { scope = path.slice(); sel = []; nodeSel = null; render(); } else if (enterScope([...path, o.id])) { openGroups.add(o.id); render(); } return; }
                if (b.matches('[data-vx-lclip]')) { // ✂️ masque d'un groupe ou d'un calque : sa forme la plus haute le découpe ; un 2e clic la rend
                    const what = o.layer ? 'calque' : 'groupe';
                    if (o.clip) { const shape = {...clone(o.clip), id: uid(), name: o.clip.name || 'Forme du masque'}; delete o.clip; (o.children = o.children || []).push(shape); sel = []; commit('Masque retiré'); toast(`Masque retiré : la forme est revenue tout en haut du ${what}.`); return; }
                    const kids = o.children || [], k = kids.map((c, j) => [c, j]).reverse().find(([c]) => c.type !== 'group' && c.type !== 'image' && c.type !== 'text' && shapeD(c));
                    if (!k) return toast(`Pose d’abord une forme (rond, ovale, rectangle, tracé…) tout en haut de ce ${what} : elle servira de découpe.`, 'error');
                    if (kids.length < 2) return toast(`Il faut quelque chose à découper sous la forme, dans ce ${what}.`, 'error');
                    o.clip = clone(k[0]); kids.splice(k[1], 1); sel = sel.filter(x => x !== k[0].id); commit('Masque'); toast(`✂️ Masque posé : on ne voit plus que ce qui est dans « ${k[0].name || 'la forme'} ».`); return; }
                if (b.matches('[data-vx-lvis]')) { o.hidden = !o.hidden; if (o.hidden) sel = sel.filter(s => s !== o.id); commit(o.hidden ? 'Masqué' : 'Affiché'); return; }
                if (b.matches('[data-vx-llock]')) { o.locked = !o.locked; if (o.locked) sel = sel.filter(s => s !== o.id); commit(o.locked ? 'Verrouillé' : 'Déverrouillé'); return; }
                if (b.matches('[data-vx-lup]') && i < arr.length - 1) { [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]]; commit('Calque monté'); return; }
                if (b.matches('[data-vx-ldown]') && i > 0) { [arr[i], arr[i - 1]] = [arr[i - 1], arr[i]]; commit('Calque descendu'); return; }
                if (b.matches('[data-vx-ldel]')) { if (isLayerGroup(o) && (o.children || []).length && !await A().confirmBox('', {title: `Supprimer « ${o.name || 'ce groupe'} » et tout ce qu’il contient ?`, okLabel: 'Supprimer le groupe'})) return; arr.splice(i, 1); sel = sel.filter(s => s !== o.id); if (scope.includes(o.id)) scope = scope.slice(0, scope.indexOf(o.id)); commit('Supprimé'); return; }
                return; }
            if (b.dataset.blCharge) { blasonState.charge = b.dataset.blCharge; paintPanel(); return; }
            if (b.matches('[data-bl-make]')) { const {obj, blazon} = makeBlason(blasonState, {x: (doc.w - Math.min(doc.w * .7, doc.h * .7 / 1.2)) / 2, y: (doc.h - Math.min(doc.w * .7, doc.h * .7 / 1.2) * 1.2) / 2, width: Math.min(doc.w * .7, doc.h * .7 / 1.2)}); cur().push(obj); sel = [obj.id]; lastBlazon = blazon; ctx.onBlazon?.(blazon); commit('Blason créé'); paintPanel(); return; }
            if (b.matches('[data-bl-copy]')) { navigator.clipboard?.writeText(lastBlazon || blasonText()).then(() => toast('Blasonnement copié.')).catch(() => {}); return; }
            if (b.matches('[data-bl-addcharge]')) { addCharge(blasonState.charge, tHex(blasonState.d)); return; }
            if (b.dataset.blTintc) { applyFree('data-bl-tintfree', b.dataset.blTintc, true); return; }
            if (b.dataset.blTint) { const hex = tHex(b.dataset.blTint); selObjs().filter(o => !o.locked && o.type !== 'image').forEach(o => { if (o.type === 'group') (o.children || []).forEach(c => { if (c.fill !== 'none') c.fill = hex; }); else { o.fill = hex; delete o.grad; } }); commit(`Émail : ${b.title}`); return; }
        });
        let lastLClick = {};
        pane.addEventListener('click', e => {
            if (tab !== 'layers' || e.target.closest('button, input')) return;
            const row = e.target.closest('[data-vx-layer]'); if (!row) return;
            const now = Date.now(); if (lastLClick.id === row.dataset.vxLayer && now - lastLClick.t < 450) { lastLClick = {}; renameLayer(row.dataset.vxLayer); return; } lastLClick = {id: row.dataset.vxLayer, t: now}; // double-clic : renommer
            const f = findAny(row.dataset.vxLayer); if (!f || f.o.hidden) return;
            if (!samePath(f.path, scope) && !enterScope(f.path)) return;
            if (f.o.locked) { render(); return; }
            sel = e.shiftKey ? [...new Set([...sel, f.o.id])] : [f.o.id]; setTool(tool === 'direct' ? 'direct' : 'select'); render();
        });
        let lDrag = null;
        pane.addEventListener('dragstart', e => { const row = e.target.closest?.('[data-vx-layer]'); if (!row || tab !== 'layers') return; lDrag = row.dataset.vxLayer; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', lDrag); } catch (_) {} row.classList.add('is-drag'); });
        const dropWhere = (row, e) => { const r = row.getBoundingClientRect(), t = (e.clientY - r.top) / r.height, g = isLayerGroup(findAny(row.dataset.vxLayer)?.o); return g && t > .18 && t < .82 ? 'into' : t < .5 ? 'above' : 'below'; };
        pane.addEventListener('dragover', e => { if (!lDrag) return; const row = e.target.closest('[data-vx-layer]'); pane.querySelectorAll('.vx-drop-above,.vx-drop-below,.vx-drop-into').forEach(x => x.classList.remove('vx-drop-above', 'vx-drop-below', 'vx-drop-into')); if (!row || row.dataset.vxLayer === lDrag) return; e.preventDefault(); row.classList.add('vx-drop-' + dropWhere(row, e)); });
        pane.addEventListener('drop', e => { if (!lDrag) return; const row = e.target.closest('[data-vx-layer]'); const id = lDrag; lDrag = null; if (!row) return; e.preventDefault(); if (moveInTree(id, row.dataset.vxLayer, dropWhere(row, e))) commit('Rangé'); else paintPanel(); });
        pane.addEventListener('dragend', () => { lDrag = null; pane.querySelectorAll('.is-drag,.vx-drop-above,.vx-drop-below,.vx-drop-into').forEach(x => x.classList.remove('is-drag', 'vx-drop-above', 'vx-drop-below', 'vx-drop-into')); });
        /* l'onglet Blason */
        const blasonState = {shield: 'francais', division: 'plein', ordinary: 'aucune', a: 'azur', b: 'or', c: 'gueules', d: 'or', charge: 'mdi_fleur_de_lis', count: '3', chargeSize: '100'};
        const tSel = (k, label) => `<label>${esc(label)}<select data-bl="${k}">${TINCTURES.map(([t, l, h]) => `<option value="${t}" ${blasonState[k] === t ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
        const blasonText = () => makeBlason(blasonState).blazon;
        function blasonPane() {
            const sh = K()?.shapeByKey?.(blasonState.charge);
            return `<div class="vx-form vx-blason"><p class="muted">Compose un blason : l’écu, sa partition, une pièce, des meubles et leurs émaux. Tout reste modifiable ensuite (couleurs, formes, ajouts à la plume…). Pour refaire un blason scanné : Blason → Vectoriser une image.</p>
                <div class="vx-blprev" data-bl-prev></div><p class="vx-blazon" data-bl-text>${esc(blasonText())}</p>
                <label>Écu<select data-bl="shield">${ESCUTCHEONS.map(([k, l]) => `<option value="${k}" ${blasonState.shield === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
                <div class="vx-grid2"><label>Partition<select data-bl="division">${DIVISIONS.map(([k, l]) => `<option value="${k}" ${blasonState.division === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>${tSel('a', 'Émail du champ')}</div>
                <div class="vx-grid2"><span></span>${tSel('b', 'Second émail (partition)')}</div>
                <div class="vx-grid2"><label>Pièce honorable<select data-bl="ordinary">${ORDINARIES.map(([k, l]) => `<option value="${k}" ${blasonState.ordinary === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>${tSel('c', 'Émail de la pièce')}</div>
                <h4>Meubles</h4><div class="vx-charges">${CHARGE_KEYS.map(k => K()?.shapeByKey?.(k)).filter(Boolean).map(s => `<button type="button" data-bl-charge="${esc(s.k)}" class="${blasonState.charge === s.k ? 'is-on' : ''}" title="${esc(s.n)}">${K().shapeSvg(s, 24)}</button>`).join('')}</div>
                <label>Autre meuble (toutes les formes)<input data-vx-chq type="search" placeholder="Chercher : lion, épée, tour, oiseau…" autocomplete="off"></label><div class="vx-charges" data-vx-chres></div>
                <div class="vx-grid2"><label>Nombre<select data-bl="count">${[0, 1, 2, 3, 4, 5, 6].map(n => `<option value="${n}" ${String(blasonState.count) === String(n) ? 'selected' : ''}>${n ? n : 'aucun'}</option>`).join('')}</select></label>${tSel('d', 'Émail des meubles')}</div>
                <label>Taille des meubles (%) <input type="range" data-bl="chargeSize" min="40" max="160" value="${esc(blasonState.chargeSize)}"></label>
                <div class="vx-row"><button type="button" class="button small" data-bl-make>🛡️ Créer ce blason</button><button type="button" class="button small secondary" data-bl-addcharge title="Ajoute un meuble ${esc(sh?.n || '')} seul, à placer où tu veux">⚜️ Ajouter un meuble seul</button><button type="button" class="button small secondary" data-bl-copy>📋 Copier le blasonnement</button></div>
                <h4>Émaux (sur la sélection)</h4><div class="vx-sw">${TINCTURES.map(([t, l, h]) => `<button type="button" data-bl-tint="${t}" title="${esc(l)}" style="background:${h}"></button>`).join('')}${freeColor('data-bl-tintfree', selObjs()[0]?.fill, 'Couleur libre (hors des émaux du blason)')}</div>${recentColors().length ? `<div class="vx-sw vx-recent"><small>Récentes</small>${recentColors().map(c => `<button type="button" data-bl-tintc="${c}" title="${c}" style="background:${c}"></button>`).join('')}</div>` : ''}</div>`;
        }
        function paintBlasonPreview() {
            const box2 = pane.querySelector('[data-bl-prev]'); if (!box2) return;
            const {obj, blazon} = makeBlason(blasonState, {x: 0, y: 0, width: 100}); const defs = [];
            box2.innerHTML = `<svg viewBox="-4 -4 108 128" width="120" height="144">${(() => { const b2 = objSvg(obj, defs, 'bp'); return `<defs>${defs.join('')}</defs>${b2}`; })()}</svg>`;
            const t = pane.querySelector('[data-bl-text]'); if (t) t.textContent = blazon;
        }
        const blObs = new MutationObserver(() => { if (tab === 'blason' && pane.querySelector('[data-bl-prev]') && !pane.querySelector('[data-bl-prev] svg')) paintBlasonPreview(); }); blObs.observe(pane, {childList: true});
        pane.addEventListener('input', e => { if (!e.target.matches('[data-vx-chq]')) return; const q = e.target.value.trim().toLowerCase(), out = pane.querySelector('[data-vx-chres]'); if (q.length < 2 || !K()) { out.innerHTML = ''; return; }
            out.innerHTML = K().allShapes().filter(s => s.d && !s.mask && (s.n || '').toLowerCase().includes(q)).slice(0, 40).map(s => `<button type="button" data-bl-charge="${esc(s.k)}" title="${esc(s.n)}">${K().shapeSvg(s, 24)}</button>`).join('') || '<small class="muted">Rien trouvé.</small>'; });
        function addCharge(key, fill) {
            const s = Math.min(doc.w, doc.h) * .25, d = chargeD(key, doc.w / 2, doc.h / 2, s); if (!d) return toast('Forme introuvable.', 'error');
            const sh = K().shapeByKey(key), one = dToPts(d), o = {id: uid(), type: one ? 'path' : 'svgpath', name: sh?.n || 'Meuble', fill, stroke: '#222222', sw: 0, evenodd: !!sh?.eo, ...(one ? {pts: one.pts, closed: one.closed} : {d})};
            cur().push(o); sel = [o.id]; commit('Meuble ajouté');
        }
        /* commandes */
        const idx = o => cur().indexOf(o);
        const sorted = () => selObjs().sort((a, b) => idx(a) - idx(b));
        async function exportImg(fmt, scale = 2) {
            const svg = await inlineMedia(docSvg(doc));
            const c = await svgCanvas(svg, scale, fmt === 'png' || fmt === 'webp' ? '' : '#ffffff');
            return new Promise(ok => c.toBlob(ok, {png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp'}[fmt], .92));
        }
        const fname = ext2 => `${(A().safeExportFilename ? A().safeExportFilename(name || 'dessin', 'dessin') : 'dessin')}.${ext2}`;
        const download = (blob, n) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = n; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
        const CMDS = {
            undo: () => { if (laterT) { clearTimeout(laterT); laterT = 0; commit(); } restore(hi - 1); }, redo: () => { if (laterT) { clearTimeout(laterT); laterT = 0; commit(); } restore(hi + 1); },
            new: async () => { if (dirty && !await A().confirmBox('Ce qui n’est pas enregistré sera perdu.', {title: 'Commencer un nouveau dessin ?', okLabel: 'Nouveau sans enregistrer', danger: true})) return; docId = 0; name = 'Mon dessin'; $('[data-vx-name]').value = name; doc = newDoc(); sel = []; scope = []; newLayer(); hist = []; hi = -1; commit(); dirty = false; fit(); },
            open: async () => { if (dirty && !await A().confirmBox('Ce qui n’est pas enregistré sera perdu.', {title: 'Ouvrir un autre dessin ?', okLabel: 'Ouvrir sans enregistrer', danger: true})) return; const docs = (await api('vector_docs').catch(() => ({docs: []}))).docs || []; if (!docs.length) return toast('Aucun dessin enregistré.', 'error');
                ext.openDialog({eyebrow: 'DESSIN VECTORIEL', title: 'Ouvrir un dessin', body: `<div class="vx-open">${docs.map(d => `<label class="vx-openitem"><input type="radio" name="pick" value="${d.id}">${d.thumb ? `<img src="${esc(d.thumb)}" alt="">` : '<span>✒️</span>'}<span>${esc(d.name)}</span></label>`).join('')}</div>`, submitLabel: 'Ouvrir',
                    onSubmit: async f => { const id = Number(f.querySelector('[name=pick]:checked')?.value); if (!id) return false; const r = await api('vector_doc', {id}); docId = r.id; name = r.name; $('[data-vx-name]').value = name; doc = cleanDoc(r.doc); sel = []; scope = []; hist = []; hi = -1; commit(); dirty = false; fit(); }}); },
            save: () => saveDoc(),
            import: () => $('[data-vx-file]').click(),
            exp_svg: () => download(new Blob([docSvg(doc)], {type: 'image/svg+xml'}), fname('svg')),
            exp_sel: () => { const l = sorted(); if (!l.length) return toast('Choisis d’abord des objets.', 'error'); download(new Blob([docSvg(doc, {only: l, pad: 2})], {type: 'image/svg+xml'}), fname('svg')); },
            exp_png: async () => download(await exportImg('png'), fname('png')), exp_jpg: async () => download(await exportImg('jpg'), fname('jpg')), exp_webp: async () => download(await exportImg('webp'), fname('webp')),
            exp_pdf: async () => { const w = window.open('', '_blank'); if (!w) return toast('Fenêtre bloquée par le navigateur.', 'error'); const svg = await inlineMedia(docSvg(doc)); w.document.write(`<!doctype html><meta charset="utf-8"><title>${esc(name)}</title><style>@page{margin:10mm}body{margin:0;display:flex;justify-content:center}svg{max-width:100%;height:auto;max-height:97vh}</style>${svg}<script>onload=()=>setTimeout(()=>print(),250)<\/script>`); w.document.close(); },
            copysvg: () => navigator.clipboard?.writeText(docSvg(doc)).then(() => toast('Code SVG copié.')).catch(() => toast('Copie impossible ici.', 'error')),
            copypng: async () => { try { const b = await exportImg('png'); await navigator.clipboard.write([new ClipboardItem({'image/png': b})]); toast('Image copiée.'); } catch (_) { toast('Copie impossible ici : exporte en PNG.', 'error'); } },
            toshape: () => saveAsShape(), tomedia: () => saveToMedia(), tocoat: () => saveToCoat(),
            cut: () => { CMDS.copy(); CMDS.del(); }, copy: () => { const l = sorted(); if (l.length) { clip = clone(l); status(`${l.length} copié${l.length > 1 ? 's' : ''}`); } },
            paste: () => { if (!clip?.length) return; const copies = clip.map(o => { const c = clone(o); reId(c); return moveObj(c, 12, 12); }); clip = clone(copies); cur().push(...copies); sel = copies.map(o => o.id); commit('Collé'); },
            dup: () => { const l = sorted(); if (!l.length) return; const copies = l.map(o => { const c = clone(o); reId(c); return moveObj(c, 12, 12); }); cur().push(...copies); sel = copies.map(o => o.id); commit('Dupliqué'); },
            del: () => { if (nodeSel && tool === 'direct') { const o = byId(nodeSel.id); if (o?.pts?.length > 2) { o.pts.splice(nodeSel.i, 1); nodeSel = null; commit('Point supprimé'); return; } } const ids = new Set(selObjs().filter(o => !o.locked).map(o => o.id)); if (!ids.size) return; setCur(cur().filter(o => !ids.has(o.id))); sel = []; commit('Supprimé'); },
            all: () => { sel = cur().filter(o => !o.locked && !o.hidden).map(o => o.id); render(); }, none: () => { sel = []; nodeSel = null; render(); },
            group: () => { const l = sorted(); if (l.length < 2) return toast('Choisis au moins deux objets.', 'error'); const at = idx(l[l.length - 1]); const g = {id: uid(), type: 'group', name: 'Groupe', children: l}; setCur(cur().filter(o => !l.includes(o))); cur().splice(at - l.length + 1, 0, g); sel = [g.id]; commit('Groupé'); },
            ungroup: () => { const gs = selObjs().filter(o => o.type === 'group'); if (!gs.length) return; const out = []; gs.forEach(g => { const at = idx(g), kids = (g.children || []).map(c => { const c2 = clone(c); if (num(g.rot)) { const gb = box(g), cb = box(c2), r = num(g.rot) * Math.PI / 180, gx = gb.x + gb.w / 2, gy = gb.y + gb.h / 2, cx = cb.x + cb.w / 2, cy = cb.y + cb.h / 2; moveObj(c2, gx + (cx - gx) * Math.cos(r) - (cy - gy) * Math.sin(r) - cx, gy + (cx - gx) * Math.sin(r) + (cy - gy) * Math.cos(r) - cy); c2.rot = (num(c2.rot) + num(g.rot)) % 360; } if (num(g.op, 1) < 1) c2.op = num(c2.op, 1) * num(g.op, 1); return c2; });
                    if (g.clip) toast('Le masque d’écrêtage est retiré en dissociant.'); cur().splice(at, 1, ...kids); out.push(...kids.map(k => k.id)); }); sel = out; commit('Dissocié'); },
            clipmask: () => { const l = sorted(); if (l.length < 2) return toast('Choisis la forme qui découpe (au-dessus) et ce qu’elle découpe.', 'error'); const top = l[l.length - 1]; if (!shapeD(top)) return toast('L’objet du dessus doit être une forme ou un tracé.', 'error'); const rest = l.slice(0, -1), at = idx(rest[rest.length - 1]) - (rest.length - 1); const g = {id: uid(), type: 'group', name: 'Masque', clip: clone(top), children: rest}; setCur(cur().filter(o => !l.includes(o))); cur().splice(clamp(at, 0, cur().length), 0, g); sel = [g.id]; commit('Masque d’écrêtage'); },
            unclip: () => { const g = selObjs().find(o => o.type === 'group' && o.clip); if (!g) return; const shape = {...clone(g.clip), id: uid(), fill: 'none', stroke: '#888888', sw: 1, name: 'Ancien masque'}; delete g.clip; cur().splice(idx(g) + 1, 0, shape); commit('Masque retiré'); },
            front: () => { const l = sorted(); setCur([...cur().filter(o => !l.includes(o)), ...l]); commit('Premier plan'); }, bottom: () => { const l = sorted(); setCur([...l, ...cur().filter(o => !l.includes(o))]); commit('Arrière-plan'); },
            fwd: () => { const l = sorted().reverse(); l.forEach(o => { const i = idx(o); if (i < cur().length - 1 && !l.includes(cur()[i + 1])) [cur()[i], cur()[i + 1]] = [cur()[i + 1], cur()[i]]; }); commit('Avancé'); },
            back: () => { const l = sorted(); l.forEach(o => { const i = idx(o); if (i > 0 && !l.includes(cur()[i - 1])) [cur()[i], cur()[i - 1]] = [cur()[i - 1], cur()[i]]; }); commit('Reculé'); },
            flipH: () => { const l = selObjs(), b = unionBox(l); if (!b) return; l.forEach(o => { mapObj(o, (x, y) => [2 * b.x + b.w - x, y]); if (num(o.rot)) o.rot = 360 - num(o.rot); }); commit('Retourné'); },
            flipV: () => { const l = selObjs(), b = unionBox(l); if (!b) return; l.forEach(o => { mapObj(o, (x, y) => [x, 2 * b.y + b.h - y]); if (num(o.rot)) o.rot = 360 - num(o.rot); }); commit('Retourné'); },
            rot90: () => { selObjs().forEach(o => { o.rot = (num(o.rot) + 90) % 360; }); commit('Tourné'); },
            topath: () => { let n = 0; sel.forEach(id => { const o = byId(id), i = idx(o); if (o && ['rect', 'ellipse', 'polygon', 'star'].includes(o.type)) { cur()[i] = toPath(o); n++; } else if (o?.type === 'svgpath') { const c = dToPts(o.d); if (c) { const p = {...o, type: 'path', pts: c.pts, closed: c.closed}; delete p.d; cur()[i] = p; n++; } } }); if (n) commit('Converti en tracé'); else toast('Rien à convertir.', 'error'); },
            outline: () => { const l = sorted().filter(o => num(o.sw)); if (!l.length) return toast('Choisis un objet qui a un contour.', 'error'); const d = rasterOp(l, 'outline'); if (!d) return; const o = {id: uid(), type: 'svgpath', name: 'Contour', d, fill: l[0].stroke || '#000', sw: 0, evenodd: true}; cur().splice(idx(l[l.length - 1]) + 1, 0, o); sel = [o.id]; commit('Contour → forme'); },
            lock: () => { const l = selObjs(); const v = !l.every(o => o.locked); l.forEach(o => { o.locked = v; }); commit(v ? 'Verrouillé' : 'Déverrouillé'); }, hide: () => { selObjs().forEach(o => { o.hidden = true; }); sel = []; commit('Masqué'); }, showall: () => { cur().forEach(o => { o.hidden = false; }); commit('Tout affiché'); },
            zin: () => { const r = stage.getBoundingClientRect(); zoomAt(1.25, r.width / 2, r.height / 2); }, zout: () => { const r = stage.getBoundingClientRect(); zoomAt(0.8, r.width / 2, r.height / 2); }, zfit: () => fit(), z100: () => { const r = stage.getBoundingClientRect(); zoomAt(1 / zoom, r.width / 2, r.height / 2); },
            grid: () => { tab = 'doc'; paintPanel(); },
            blason: () => { tab = 'blason'; paintPanel(); }, charge: () => { tab = 'blason'; paintPanel(); setTimeout(() => pane.querySelector('[data-vx-chq]')?.focus(), 30); },
            vectorize: () => vectorizeDialog(),
            map_on: () => { doc.map = {...(doc.map || {}), on: !doc.map?.on}; tab = 'map'; commit(doc.map.on ? 'Mode Plan' : 'Mode Plan désactivé'); },
            map_tab: () => { if (!doc.map?.on) { doc.map = {...(doc.map || {}), on: true}; commit('Mode Plan'); } tab = 'map'; paintPanel(); },
            map_base: () => { tab = 'map'; paintPanel(); MP?.basemap(); }, map_ref: () => { tab = 'map'; paintPanel(); MP?.refimg(); },
            map_layers: () => { tab = 'layers'; MP?.layers(); }, map_places: () => MP?.places(), map_links: () => MP?.links(),
            smart: () => { smart = !smart; try { localStorage.setItem(SMART_KEY, smart ? '1' : '0'); } catch (_) {} toast(smart ? 'Repères commentés : en déplaçant, les objets s’aimantent aux autres (⌘ pour s’en passer).' : 'Repères commentés désactivés.'); },
            simplify: () => { const l = selObjs().filter(o => o.type === 'path' && !o.locked && (o.pts || []).length > 3); if (!l.length) return toast('Choisis un tracé (Objet → Convertir en tracé si besoin).', 'error');
                ext.openDialog({eyebrow: 'DESSIN VECTORIEL', title: 'Simplifier le tracé', submitLabel: 'Simplifier', body: `<p class="muted">Retire les points en trop (un trait au crayon, un dessin vectorisé…) en gardant l’allure.</p><label>Force <input type="range" name="t" min="1" max="40" value="6"></label><label class="checkbox-line"><input type="checkbox" name="smooth" checked> Lisser les courbes</label>`,
                    onSubmit: f => { const tol = num(f.querySelector('[name=t]').value, 6) / zoom, smooth = f.querySelector('[name=smooth]').checked; let before = 0, after = 0;
                        l.forEach(o => { before += o.pts.length; const xy = o.pts.map(q => [q.x, q.y]); const rdp = (pp, eps) => { if (pp.length < 3) return pp; let dm = 0, ix = 0; const [ax, ay] = pp[0], [bx, by] = pp[pp.length - 1], L = Math.hypot(bx - ax, by - ay) || 1; for (let i = 1; i < pp.length - 1; i++) { const dd = Math.abs((by - ay) * pp[i][0] - (bx - ax) * pp[i][1] + bx * ay - by * ax) / L; if (dd > dm) { dm = dd; ix = i; } } return dm > eps ? [...rdp(pp.slice(0, ix + 1), eps).slice(0, -1), ...rdp(pp.slice(ix), eps)] : [pp[0], pp[pp.length - 1]]; };
                            const keep = rdp(o.closed ? [...xy, xy[0]] : xy, tol); if (o.closed) keep.pop(); if (keep.length < 2) return; const n = keep.length;
                            o.pts = keep.map((q, i) => { if (!smooth) return P(q[0], q[1]); const a = keep[o.closed ? (i - 1 + n) % n : Math.max(0, i - 1)], c = keep[o.closed ? (i + 1) % n : Math.min(n - 1, i + 1)], t = [(c[0] - a[0]) / 6, (c[1] - a[1]) / 6]; return P(q[0], q[1], [q[0] - t[0], q[1] - t[1]], [q[0] + t[0], q[1] + t[1]]); }); after += o.pts.length; });
                        commit('Tracé simplifié'); toast(`${before} → ${after} points.`); }}); },
            transform: () => { const l = selObjs().filter(o => !o.locked); if (!l.length) return toast('Choisis d’abord des objets.', 'error');
                ext.openDialog({eyebrow: 'DESSIN VECTORIEL', title: 'Transformer', submitLabel: 'Appliquer', body: `<p class="muted">Autour du centre de la sélection. Avec des copies, chaque copie reprend la transformation de la précédente (une frise, un dégradé de tailles…).</p>
                    <div class="vx-grid2"><label>Échelle horizontale (%)<input name="sx" type="number" value="100" step="1"></label><label>Échelle verticale (%)<input name="sy" type="number" value="100" step="1"></label>
                    <label>Inclinaison horizontale (°)<input name="kx" type="number" value="0" min="-80" max="80"></label><label>Inclinaison verticale (°)<input name="ky" type="number" value="0" min="-80" max="80"></label>
                    <label>Rotation (°)<input name="r" type="number" value="0"></label><label>Copies<input name="n" type="number" value="0" min="0" max="200"></label>
                    <label>Décalage X<input name="dx" type="number" value="0"></label><label>Décalage Y<input name="dy" type="number" value="0"></label></div>`,
                    onSubmit: f => { const v = k => num(f.querySelector(`[name=${k}]`).value), sx = v('sx') / 100 || 1, sy = v('sy') / 100 || 1, kx = Math.tan(clamp(v('kx'), -80, 80) * Math.PI / 180), ky = Math.tan(clamp(v('ky'), -80, 80) * Math.PI / 180), r = v('r'), n = clamp(Math.round(v('n')), 0, 200), mx = v('dx'), my = v('dy');
                        const step = list => { const b = unionBox(list), cx = b.x + b.w / 2, cy = b.y + b.h / 2, ra = r * Math.PI / 180;
                            return list.map(o0 => { let o = (kx || ky) && ['rect', 'ellipse', 'polygon', 'star'].includes(o0.type) ? toPath(o0) : o0;
                                mapObj(o, (x, y) => { const X = (x - cx) * sx, Y = (y - cy) * sy; return [cx + X + kx * Y + mx, cy + Y + ky * X + my]; }, Math.sqrt(Math.abs(sx * sy)));
                                if (r) { const ob = box(o), ocx = ob.x + ob.w / 2, ocy = ob.y + ob.h / 2; if (list.length > 1 || n) moveObj(o, cx + mx + (ocx - cx - mx) * Math.cos(ra) - (ocy - cy - my) * Math.sin(ra) - ocx, cy + my + (ocx - cx - mx) * Math.sin(ra) + (ocy - cy - my) * Math.cos(ra) - ocy); o.rot = ((num(o.rot) + r) % 360 + 360) % 360; }
                                return o; }); };
                        if (!n) { const out = step(l); out.forEach((o, i) => { const at = cur().indexOf(l[i]); if (at >= 0) cur()[at] = o; }); commit('Transformé'); return; }
                        let prev = l, made = []; for (let k = 0; k < n; k++) { const copies = prev.map(o => { const c = clone(o); reId(c); return c; }); prev = step(copies); made.push(...prev); }
                        cur().push(...made); sel = made.map(o => o.id); commit(`${n} copie${n > 1 ? 's' : ''} transformée${n > 1 ? 's' : ''}`); }}); },
            repeat_circle: () => { const l = selObjs().filter(o => !o.locked); if (!l.length) return toast('Choisis d’abord des objets.', 'error'); const b = unionBox(l);
                ext.openDialog({eyebrow: 'DESSIN VECTORIEL', title: 'Répétition en cercle', submitLabel: 'Répéter', body: `<p class="muted">Des copies tournent autour d’un centre (une rosace, une couronne de meubles autour d’un écu…). Le tout devient un groupe.</p>
                    <div class="vx-grid2"><label>Nombre (avec l’original)<input name="n" type="number" value="8" min="2" max="120"></label><label>Centre<select name="c"><option value="below">Sous la sélection (rosace)</option><option value="art">Centre du plan de travail</option><option value="self">Centre de la sélection</option></select></label>
                    <label>Distance au centre (si « sous la sélection »)<input name="d" type="number" value="${n2(Math.max(b.w, b.h))}"></label><label class="checkbox-line"><input type="checkbox" name="turn" checked> Tourner chaque copie</label></div>`,
                    onSubmit: f => { const n = clamp(Math.round(num(f.querySelector('[name=n]').value, 8)), 2, 120), mode = f.querySelector('[name=c]').value, dd = num(f.querySelector('[name=d]').value, b.h), turn = f.querySelector('[name=turn]').checked;
                        const c = mode === 'art' ? [doc.w / 2, doc.h / 2] : mode === 'self' ? [b.x + b.w / 2, b.y + b.h / 2] : [b.x + b.w / 2, b.y + b.h / 2 + dd];
                        const all = [...l]; for (let k = 1; k < n; k++) { const a = 2 * Math.PI * k / n, deg = 360 * k / n; l.forEach(o0 => { const o = clone(o0); reId(o); const ob = box(o), ocx = ob.x + ob.w / 2, ocy = ob.y + ob.h / 2; moveObj(o, c[0] + (ocx - c[0]) * Math.cos(a) - (ocy - c[1]) * Math.sin(a) - ocx, c[1] + (ocx - c[0]) * Math.sin(a) + (ocy - c[1]) * Math.cos(a) - ocy); if (turn) o.rot = ((num(o.rot) + deg) % 360 + 360) % 360; all.push(o); }); }
                        const at = Math.min(...l.map(o => cur().indexOf(o))), g = {id: uid(), type: 'group', name: 'Répétition en cercle', children: all}; setCur(cur().filter(o => !l.includes(o))); cur().splice(clamp(at, 0, cur().length), 0, g); sel = [g.id]; commit('Répétition en cercle'); }}); },
            repeat_grid: () => { const l = selObjs().filter(o => !o.locked); if (!l.length) return toast('Choisis d’abord des objets.', 'error'); const b = unionBox(l);
                ext.openDialog({eyebrow: 'DESSIN VECTORIEL', title: 'Répétition en grille', submitLabel: 'Répéter', body: `<p class="muted">Des copies en lignes et colonnes (un semé d’hermines, de fleurs de lys…). Le tout devient un groupe.</p><div class="vx-grid2"><label>Colonnes<input name="c" type="number" value="4" min="1" max="60"></label><label>Lignes<input name="r" type="number" value="3" min="1" max="60"></label><label>Écart horizontal<input name="gx" type="number" value="${n2(b.w * .5)}"></label><label>Écart vertical<input name="gy" type="number" value="${n2(b.h * .5)}"></label></div><label class="checkbox-line"><input type="checkbox" name="stag"> Une ligne sur deux décalée (en quinconce)</label>`,
                    onSubmit: f => { const v = k => num(f.querySelector(`[name=${k}]`).value), C = clamp(Math.round(v('c')), 1, 60), R = clamp(Math.round(v('r')), 1, 60), gx = v('gx'), gy = v('gy'), st = f.querySelector('[name=stag]').checked; if (C * R * l.length > 4000) { toast('Trop de copies (4 000 au plus).', 'error'); return false; }
                        const all = []; for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) { if (!r && !c) { all.push(...l); continue; } l.forEach(o0 => { const o = clone(o0); reId(o); moveObj(o, c * (b.w + gx) + (st && r % 2 ? (b.w + gx) / 2 : 0), r * (b.h + gy)); all.push(o); }); }
                        const at = Math.min(...l.map(o => cur().indexOf(o))), g = {id: uid(), type: 'group', name: 'Répétition en grille', children: all}; setCur(cur().filter(o => !l.includes(o))); cur().splice(clamp(at, 0, cur().length), 0, g); sel = [g.id]; commit('Répétition en grille'); }}); },
        };
        const pf = op => () => { const l = sorted().filter(o => o.type !== 'image'); if (l.length < 2) return toast('Choisis au moins deux formes.', 'error'); status('Calcul…'); setTimeout(() => { const d = rasterOp(l, op); if (d === null) return; if (!d) { status(''); return toast('Le résultat est vide (les formes ne se touchent pas ?).', 'error'); } const base = l[0], o = {id: uid(), type: 'svgpath', name: {union: 'Réunion', subtract: 'Soustraction', intersect: 'Intersection', exclude: 'Exclusion'}[op], d, fill: base.fill === 'none' ? '#000000' : base.fill, grad: base.grad, stroke: base.stroke, sw: base.sw, evenodd: true}; if (!o.grad) delete o.grad; const at = idx(l[0]); setCur(cur().filter(x => !l.includes(x))); cur().splice(Math.min(at, cur().length), 0, o); sel = [o.id]; commit(o.name); }, 20); };
        Object.assign(CMDS, {pf_union: pf('union'), pf_subtract: pf('subtract'), pf_intersect: pf('intersect'), pf_exclude: pf('exclude')});
        const align = k => () => { const l = selObjs().filter(o => !o.locked); if (!l.length) return; const ref = k === 'al_art' || l.length === 1 ? {x: 0, y: 0, w: doc.w, h: doc.h} : unionBox(l);
            if (k === 'di_h' || k === 'di_v') { if (l.length < 3) return toast('Il faut au moins trois objets.', 'error'); const h2 = k === 'di_h', s = [...l].sort((a, b) => h2 ? rbox(a).x - rbox(b).x : rbox(a).y - rbox(b).y), tot = s.reduce((a, o) => a + (h2 ? rbox(o).w : rbox(o).h), 0), gap = ((h2 ? ref.w : ref.h) - tot) / (s.length - 1); let p = h2 ? ref.x : ref.y; s.forEach(o => { const b = rbox(o); moveObj(o, h2 ? p - b.x : 0, h2 ? 0 : p - b.y); p += (h2 ? b.w : b.h) + gap; }); commit('Réparti'); return; }
            l.forEach(o => { const b = rbox(o); const dx = {al_l: ref.x - b.x, al_c: ref.x + ref.w / 2 - b.x - b.w / 2, al_r: ref.x + ref.w - b.x - b.w, al_art: ref.w / 2 - b.x - b.w / 2}[k] || 0, dy = {al_t: ref.y - b.y, al_m: ref.y + ref.h / 2 - b.y - b.h / 2, al_b: ref.y + ref.h - b.y - b.h, al_art: ref.h / 2 - b.y - b.h / 2}[k] || 0; moveObj(o, dx, dy); }); commit('Aligné'); };
        ['al_l', 'al_c', 'al_r', 'al_t', 'al_m', 'al_b', 'di_h', 'di_v', 'al_art'].forEach(k => { CMDS[k] = align(k); });
        const reId = o => { o.id = uid(); (o.children || []).forEach(reId); if (o.clip) o.clip.id = uid(); };
        dlg.addEventListener('click', e => {
            const c = e.target.closest('[data-vx-cmd]'); if (c) { c.closest('details')?.removeAttribute('open'); try { const r = CMDS[c.dataset.vxCmd]?.(); r?.catch?.(err => toast(err.message, 'error')); } catch (err) { toast(err.message, 'error'); } return; }
            const cr = e.target.closest('[data-vx-crumb]'); if (cr) { const n = clamp(Number(cr.dataset.vxCrumb) || 0, 0, scope.length); scope = scope.slice(0, n); sel = []; nodeSel = null; render(); return; }
            const t = e.target.closest('[data-vx-tool]'); if (t) { setTool(t.dataset.vxTool); return; }
            const tb = e.target.closest('[data-vx-tab],[data-vx-tab-go]'); if (tb) { tab = tb.dataset.vxTab || tb.dataset.vxTabGo; paintPanel(); return; }
            if (!e.target.closest('details.vx-menu')) dlg.querySelectorAll('details.vx-menu[open]').forEach(d => d.removeAttribute('open'));
        });
        dlg.addEventListener('toggle', e => { if (e.target.matches?.('details.vx-menu') && e.target.open) dlg.querySelectorAll('details.vx-menu[open]').forEach(d => { if (d !== e.target) d.removeAttribute('open'); }); }, true);
        /* clavier */
        const onKey = e => {
            if (!dlg.isConnected) { document.removeEventListener('keydown', onKey, true); document.removeEventListener('keyup', onKeyUp, true); return; }
            if (!dlg.open || document.querySelector('dialog[open]:not(.vx-dlg)') && document.activeElement?.closest('dialog') !== dlg) return;
            const typing = e.target.closest?.('input, textarea, select, [contenteditable]'), mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
            if (mod && k === 's') { e.preventDefault(); saveDoc(); return; }
            if (typing) return;
            if (k === ' ' && !space) { space = true; stage.dataset.tool = 'hand'; e.preventDefault(); return; }
            const map = mod ? {z: e.shiftKey ? 'redo' : 'undo', y: 'redo', c: 'copy', x: 'cut', v: null, d: 'dup', a: 'all', g: e.shiftKey ? 'ungroup' : 'group', i: 'import', 0: 'zfit', 1: 'z100', '=': 'zin', '+': 'zin', '-': 'zout', 7: 'clipmask', ']': e.shiftKey ? 'front' : 'fwd', '[': e.shiftKey ? 'bottom' : 'back', '}': 'front', '{': 'bottom'} : {};
            if (mod && k in map) { if (map[k]) { e.preventDefault(); CMDS[map[k]](); } return; }
            if ((k === 'delete' || k === 'backspace') && penPath) { e.preventDefault(); penPath.pts.pop(); if (!penPath.pts.length) { penPath = null; penHover = null; } render(); return; }
            if (k === 'delete' || k === 'backspace') { e.preventDefault(); CMDS.del(); return; }
            if (k === 'escape') { e.preventDefault(); if (tool === 'mref') setTool('select'); else if (penPath) finishPen(); else if (sel.length) CMDS.none(); else if (scope.length) { scope = scope.slice(0, -1); render(); } return; }
            if (k === 'enter' && penPath) { finishPen(); return; }
            if (k.startsWith('arrow') && sel.length) { e.preventDefault(); const s2 = e.shiftKey ? 10 : 1, dx = k === 'arrowleft' ? -s2 : k === 'arrowright' ? s2 : 0, dy = k === 'arrowup' ? -s2 : k === 'arrowdown' ? s2 : 0; selObjs().filter(o => !o.locked).forEach(o => moveObj(o, dx, dy)); clearTimeout(laterT); renderNoPanel(); laterT = setTimeout(() => { laterT = 0; commit('Déplacé'); }, 400); return; }
            if (!mod && !e.altKey) { const t = TOOLS.find(x => x[3].toLowerCase() === k); if (t) { setTool(t[0]); e.preventDefault(); } }
        };
        const onKeyUp = e => { if (e.key === ' ') { space = false; stage.dataset.tool = tool; } };
        document.addEventListener('keydown', onKey, true); document.addEventListener('keyup', onKeyUp, true);
        /* coller : image, SVG, objets copiés */
        const onPaste = e => {
            if (!dlg.isConnected) { document.removeEventListener('paste', onPaste); return; }
            if (!dlg.open || e.target.closest?.('input, textarea')) return;
            const f = [...(e.clipboardData?.files || [])].find(x => /^image\//.test(x.type)); if (f) { e.preventDefault(); importFile(f); return; }
            const t = e.clipboardData?.getData('text/plain') || ''; if (/^\s*(<\?xml[^>]*>\s*)?<svg[\s>]/i.test(t)) { e.preventDefault(); addImported(importSvgText(t), 'SVG collé'); return; }
            if (clip?.length) { e.preventDefault(); CMDS.paste(); }
        };
        document.addEventListener('paste', onPaste);
        /* import */
        const fileToDataUrl = f => new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => ko(new Error('Lecture impossible.')); r.readAsDataURL(f); });
        /** une image de n'importe quel format lisible par le navigateur → PNG ou JPG en data URL (réduite à 2400 px au plus) */
        async function normImage(src, type = '') {
            const img = await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ko(new Error('Format d’image non lu par ce navigateur.')); i.src = src; });
            const k = Math.min(1, 2400 / Math.max(img.naturalWidth, img.naturalHeight)); if (k === 1 && /^data:image\/(png|jpeg|webp|gif);base64,/.test(src) && src.length < 6e6) return {src, w: img.naturalWidth, h: img.naturalHeight};
            const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
            return {src: c.toDataURL(/jpe?g/i.test(type) ? 'image/jpeg' : 'image/png', .9), w: c.width, h: c.height};
        }
        function addImported(objs, label) {
            if (!objs.length) return toast('Rien de lisible dans ce fichier.', 'error');
            const b = unionBox(objs); if (b && (b.w > doc.w || b.h > doc.h)) { const f = Math.min(doc.w / b.w, doc.h / b.h) * .9; objs.forEach(o => mapObj(o, (x, y) => [(x - b.x) * f, (y - b.y) * f], f)); }
            const b2 = unionBox(objs); if (b2) objs.forEach(o => moveObj(o, (doc.w - b2.w) / 2 - b2.x, (doc.h - b2.h) / 2 - b2.y));
            cur().push(...objs); sel = objs.map(o => o.id); setTool('select'); commit(label);
        }
        async function importFile(f) {
            if (!f) return; if (f.size > 25e6) return toast('Fichier trop gros (25 Mo au plus).', 'error');
            try {
                if (/svg/i.test(f.type) || /\.svg$/i.test(f.name)) { addImported(importSvgText(await f.text()), `SVG importé : ${f.name}`); return; }
                const im = await normImage(await fileToDataUrl(f), f.type), k = Math.min(1, doc.w * .9 / im.w, doc.h * .9 / im.h);
                addImported([{id: uid(), type: 'image', name: f.name.slice(0, 40) || 'Image', src: im.src, x: 0, y: 0, w: im.w * k, h: im.h * k}], `Image importée : ${f.name}`);
                hint('Image importée : Blason → « Vectoriser une image » la transforme en tracés modifiables.');
            } catch (e) { toast(e.message, 'error'); }
        }
        $('[data-vx-file]').addEventListener('change', e => { importFile(e.target.files?.[0]); e.target.value = ''; });
        stage.addEventListener('dragover', e => { if ([...(e.dataTransfer?.types || [])].includes('Files')) e.preventDefault(); });
        stage.addEventListener('drop', e => { const f = e.dataTransfer?.files?.[0]; if (f) { e.preventDefault(); importFile(f); } });
        /* vectoriser */
        function vectorizeDialog() {
            const img = selObjs().find(o => o.type === 'image') || cur().find(o => o.type === 'image' && !o.hidden);
            if (!img) { toast('Importe d’abord une image (Fichier → Importer), puis choisis-la.', 'error'); $('[data-vx-file]').click(); return; }
            ext.openDialog({eyebrow: 'VECTORISER', title: 'Transformer l’image en tracés', submitLabel: 'Vectoriser',
                body: `<p class="muted">Pour refaire un blason, un sceau, un logo, une signature : l’image devient des formes nettes, modifiables, agrandissables sans flou. L’image d’origine reste dessous (masquée).</p>
                    <label>Mode<select name="mode"><option value="color">En couleurs (blason, logo)</option><option value="bw">Noir et blanc (signature, gravure, dessin au trait)</option></select></label>
                    <label>Nombre de couleurs (mode couleurs)<input name="colors" type="number" min="2" max="16" value="6"></label>
                    <label>Seuil (noir et blanc : plus haut = plus de noir)<input name="threshold" type="range" min="10" max="245" value="128"></label>
                    <label>Précision<select name="eps"><option value="0.6">Très fine</option><option value="1" selected>Normale</option><option value="2">Simplifiée</option><option value="3.5">Très simplifiée</option></select></label>
                    <label>Taille de travail<select name="max"><option value="600">Rapide (600 px)</option><option value="1000" selected>Normale (1000 px)</option><option value="1600">Détaillée (1600 px)</option></select></label>
                    <label class="checkbox-line"><input type="checkbox" name="smooth" checked> Courbes lissées</label><label class="checkbox-line"><input type="checkbox" name="skip" checked> Ignorer le fond blanc</label><label class="checkbox-line"><input type="checkbox" name="invert"> Inverser (noir et blanc)</label>`,
                onSubmit: async f => {
                    const v = Object.fromEntries(new FormData(f)); status('Vectorisation…');
                    try {
                        const src = /^media\//.test(img.src) ? await toDataUrl(img.src) : img.src;
                        const r = await vectorizeImage(src, {colors: v.mode === 'color' ? clamp(num(v.colors, 6), 2, 16) : 0, threshold: num(v.threshold, 128), invert: !!v.invert, eps: num(v.eps, 1), maxSize: num(v.max, 1000), smooth: !!v.smooth, skipLight: !!v.skip});
                        if (!r.layers.length) { status(''); toast('Rien trouvé à vectoriser (essaie un autre seuil).', 'error'); return; }
                        const kx = img.w / r.W, ky = img.h / r.H;
                        const layers = r.layers.map(l => { const o = {id: uid(), type: 'svgpath', name: `Couleur ${l.color}`, d: loopsD(l.loops), fill: l.color, stroke: l.color, sw: Math.max(0.4, 0.5 * kx), join: 'round', evenodd: true}; mapObj(o, (x, y) => [img.x + x * kx, img.y + y * ky]); o.sw = Math.max(0.3, 0.6 * kx); return o; });
                        const g = {id: uid(), type: 'group', name: 'Image vectorisée', children: layers, rot: img.rot || 0};
                        img.hidden = true; cur().splice(idx(img) + 1, 0, g); sel = [g.id]; commit(`Vectorisé : ${layers.length} couleur${layers.length > 1 ? 's' : ''}`);
                        hint('Fait : Objet → Dissocier pour reprendre chaque couleur ; Sélection directe pour les points.');
                    } catch (e) { status(''); toast(e.message, 'error'); return false; }
                }});
        }
        /* enregistrer */
        async function thumb() { try { const c = await svgCanvas(await inlineMedia(docSvg(doc)), Math.min(1, 240 / Math.max(doc.w, doc.h)), '#ffffff'); return c.toDataURL('image/jpeg', .8); } catch (_) { return ''; } }
        async function saveDoc() {
            name = $('[data-vx-name]').value.trim() || 'Mon dessin'; status('Enregistrement…');
            try { const r = await post('save_vector_doc', {id: docId, name, doc, thumb: await thumb()}); docId = Number(r.result?.id || docId); dirty = false; status('✓ Enregistré'); toast('Dessin enregistré (Listes → Outils de modification → Dessin vectoriel).'); ctx.onSaved?.(docId); }
            catch (e) { status(''); toast(e.message, 'error'); }
        }
        /** la sélection (ou tout) → une forme des tableaux (« Mes formes »), dans une boîte 100 × 100 */
        function shapeFromSel() {
            const l = (sel.length ? sorted() : cur().filter(o => !o.hidden)).flatMap(function flat(o) { return o.type === 'group' ? (o.children || []).flatMap(flat) : [o]; }).filter(o => shapeD(o));
            if (!l.length || !K()) return null;
            const ds = l.map(o => { const c = clone(o); if (num(c.rot)) { const b = box(c), r = num(c.rot) * Math.PI / 180, cx = b.x + b.w / 2, cy = b.y + b.h / 2; const p = c.type === 'path' || c.type === 'svgpath' ? c : toPath(c); mapObj(p, (x, y) => [cx + (x - cx) * Math.cos(r) - (y - cy) * Math.sin(r), cy + (x - cx) * Math.sin(r) + (y - cy) * Math.cos(r)]); p.rot = 0; return shapeD(p); } return shapeD(c); }).join('');
            return {d: K().pathStr(K().fitSegs(K().absPath(ds))), eo: l.length > 1 || l.some(o => o.evenodd)};
        }
        function saveAsShape() {
            const r = shapeFromSel(); if (!r?.d) return toast('Il faut des formes ou des tracés (pas seulement du texte ou des images).', 'error');
            if (r.d.length > 30000) return toast('Forme trop détaillée pour « Mes formes » (simplifie-la, ou vectorise en « Simplifiée »).', 'error');
            const p = K().prefs(), mine = ctx.shape && String(ctx.shape.k || '').startsWith('my_') ? p.customShapes.find(s => s.k === ctx.shape.k) : null;
            ext.openDialog({eyebrow: 'MES FORMES', title: 'Enregistrer comme forme', submitLabel: 'Enregistrer',
                body: `<div class="vx-shprev"><svg viewBox="-4 -4 108 108" width="96" height="96"><path d="${esc(r.d)}" ${r.eo ? 'fill-rule="evenodd"' : ''} fill="#333"/></svg></div><label>Nom<input name="n" maxlength="60" value="${esc(mine?.n || $('[data-vx-name]').value || 'Ma forme')}"></label>${mine ? `<label class="checkbox-line"><input type="checkbox" name="replace" checked> Remplacer « ${esc(mine.n)} »</label>` : ''}<p class="muted">Elle ira dans « Mes formes » des tableaux (outil Formes) et dans l’accès rapide.</p>`,
                onSubmit: f => { const n = String(f.querySelector('[name=n]').value || 'Ma forme').trim().slice(0, 60); const p2 = K().prefs();
                    let k = mine && f.querySelector('[name=replace]')?.checked ? mine.k : 'my_' + Date.now().toString(36);
                    const shape = {k, n, c: 'mine', d: r.d, eo: r.eo, mask: ''}, i = p2.customShapes.findIndex(s => s.k === k);
                    if (i >= 0) p2.customShapes[i] = shape; else p2.customShapes.push(shape); if (!p2.quickShapes.includes(k)) p2.quickShapes.push(k);
                    K().savePrefs(p2); k = K().prefs().customShapes.find(s => s.n === n && s.d === r.d)?.k || k;
                    toast(`Forme « ${n} » enregistrée : elle est dans « Mes formes ».`); ctx.onShape?.(k); }});
        }
        async function pngFile() { const b = await exportImg('png'); return new File([b], `${(A().safeExportFilename ? A().safeExportFilename(name || 'dessin', 'dessin') : 'dessin')}.png`, {type: 'image/png'}); }
        async function upload(fields, file) {
            const fd = new FormData(); Object.entries(fields).forEach(([k, v]) => fd.append(k, v)); fd.append('csrf', A().state.csrf); fd.append('files[]', file);
            const res = await fetch('upload.php', {method: 'POST', body: fd}); const j = await res.json().catch(() => ({error: 'Réponse illisible du serveur'}));
            if (!res.ok || j.error) throw new Error(j.error || 'Envoi impossible'); return j;
        }
        function pickPerson(title, onPick) {
            ext.openDialog({eyebrow: 'DESSIN VECTORIEL', title, submitLabel: 'Envoyer',
                body: `<div class="h-pk-solo"><span class="pk-lab">Personne</span>${(window.LCNDA_PICKER || A()).pickerField({name: 'vx_pick', kind: 'person'})}</div><p class="muted">L’image (PNG, nette, fond ${doc.bg === 'transparent' ? 'transparent' : 'compris'}) y est ajoutée.</p>`,
                onOpen: dg => { setTimeout(() => dg.querySelector('.pk-input')?.focus(), 30); },
                onSubmit: async f => { const chosen = Number(f.elements.vx_pick?.value) || 0; if (!chosen) { toast('Choisis une personne.', 'error'); return false; } try { await onPick(chosen); } catch (e) { toast(e.message, 'error'); return false; } }});
        }
        function saveToMedia() { pickPerson('Enregistrer dans les médias d’une fiche', async pid => { status('Envoi…'); await upload({person_id: pid}, await pngFile()); status('✓ Envoyé'); toast('Image ajoutée aux médias de la fiche.'); }); }
        async function saveToCoat() {
            if (ctx.coat?.id) { status('Envoi…'); try { await upload({collection_type: 'coat_of_arms', collection_id: ctx.coat.id, collection_role: ''}, await pngFile()); status('✓ Envoyé'); toast(`Image ajoutée aux armoiries « ${ctx.coat.title || ''} ».`); ctx.onCoatSaved?.(); } catch (e) { status(''); toast(e.message, 'error'); } return; }
            const coats = (await api('coats_of_arms').catch(() => ({coats: []}))).coats || [];
            ext.openDialog({eyebrow: 'ARMOIRIES', title: 'Enregistrer comme image d’armoiries', submitLabel: 'Enregistrer',
                body: `<label>Armoiries<select name="coat"><option value="new">➕ Nouvelles armoiries…</option>${coats.map(c => `<option value="${Number(c.id)}">${esc(c.title)}</option>`).join('')}</select></label><label>Nom (si nouvelles)<input name="title" value="${esc($('[data-vx-name]').value || 'Armes de la famille')}"></label><label>Blasonnement (si nouvelles)<textarea name="blazon" rows="2">${esc(lastBlazon)}</textarea></label>`,
                onSubmit: async f => { try { let id = f.querySelector('[name=coat]').value; if (id === 'new') { const t = f.querySelector('[name=title]').value.trim(); if (!t) { toast('Donne un nom aux armoiries.', 'error'); return false; } const r = await post('save_coat_of_arms', {id: 0, title: t, blazon: f.querySelector('[name=blazon]').value}); id = r.result.id; }
                    await upload({collection_type: 'coat_of_arms', collection_id: Number(id), collection_role: ''}, await pngFile()); toast('Image enregistrée dans les armoiries (fiche d’une personne → bloc Blason, ou Listes → Armoiries).'); } catch (e) { toast(e.message, 'error'); return false; } }});
        }
        /* fermer */
        const close = async () => { if (dirty && !await A().confirmBox('Ce qui n’est pas enregistré sera perdu.', {title: 'Fermer sans enregistrer le dessin ?', okLabel: 'Fermer sans enregistrer', danger: true})) return; document.removeEventListener('keydown', onKey, true); document.removeEventListener('keyup', onKeyUp, true); document.removeEventListener('paste', onPaste); try { blObs.disconnect(); rsObs.disconnect(); } catch (_) {} dlg.close(); dlg.remove(); ctx.onClose?.(); };
        dlg.addEventListener('cancel', e => { e.preventDefault(); if (penPath) { finishPen(); return; } close(); });
        $('[data-vx-close]').addEventListener('click', close);
        $('[data-vx-name]').addEventListener('input', () => { dirty = true; });
        /* largeur du panneau de droite : réglable en le tirant par son bord, comme dans Photoshop */
        const PW_KEY = 'lcnda-vx-panel-w', mainEl = $('.vx-main');
        const setPw = w => { if (w) mainEl.style.setProperty('--vx-pw', `${Math.round(w)}px`); else mainEl.style.removeProperty('--vx-pw'); };
        try { const w0 = Number(localStorage.getItem(PW_KEY)); if (w0 >= 220) setPw(w0); } catch (_) {}
        const ps = $('[data-vx-psize]');
        ps.addEventListener('pointerdown', e => { e.preventDefault(); ps.setPointerCapture(e.pointerId); ps.classList.add('is-on');
            const mv = ev => { const r = mainEl.getBoundingClientRect(); setPw(clamp(r.right - ev.clientX, 220, Math.min(900, r.width * .7))); applyView(); };
            const up = () => { ps.removeEventListener('pointermove', mv); ps.removeEventListener('pointerup', up); ps.classList.remove('is-on'); try { localStorage.setItem(PW_KEY, String(parseInt(getComputedStyle(mainEl).getPropertyValue('--vx-pw')) || '')); } catch (_) {} };
            ps.addEventListener('pointermove', mv); ps.addEventListener('pointerup', up); });
        ps.addEventListener('dblclick', () => { setPw(0); try { localStorage.removeItem(PW_KEY); } catch (_) {} applyView(); });
        dlg.addEventListener('change', e => { const md = e.target.dataset?.vxMode; if (!md) return; const on = e.target.checked;
            if (md === 'map') { doc.map = {...(doc.map || {}), on}; if (on && !doc.kind) doc.kind = 'map'; tab = on ? 'map' : tab; commit(on ? 'Mode Carte' : 'Mode Carte désactivé'); }
            else { doc.blasonOn = on; tab = on ? 'blason' : tab; commit(on ? 'Mode Blason' : 'Mode Blason désactivé'); } paintPanel(); });
        /* 🗺️ le mode Plan reçoit de quoi agir sur ce dessin */
        MP = ext.vectorMap?.attach({doc: () => doc, cur, selObjs, commit, render, uid, dlg, pane, fit, normImage: async (src, type) => (await normImage(src, type)).src, toDataUrl, name: () => $('[data-vx-name]').value,
            setTool: t => { if (penPath) finishPen(); setTool(t); }, paint: paintPanel, redraw: renderNoPanel, close: () => close(),
            reveal: id => { const f = findAny(id); if (!f) return; if (!samePath(f.path, scope) && !enterScope(f.path)) return; sel = [id]; setTool('select'); render(); },
            place: (objs, key) => { const layer = doc.objs.find(l => l.layer && l.mapLayer === key && !l.locked); if (layer) { layer.children = layer.children || []; layer.children.push(...objs); scope = [layer.id]; openGroups.add(layer.id); } else cur().push(...objs); sel = objs.map(o => o.id); }}) || null;
        /* départ */
        dlg.showModal(); stage.focus({preventScroll: true});
        if (!ctx.id && !doc.objs.length) newLayer(); // un nouveau dessin commence avec « Calque 1 »
        if (ctx.coat && !ctx.id) { doc.w = 500; doc.h = 600; name = ctx.coat.title || 'Blason'; $('[data-vx-name]').value = name; tab = 'blason'; }
        if (ctx.shape?.d && !ctx.id) { doc.w = 600; doc.h = 600; name = ctx.shape.n || 'Forme'; $('[data-vx-name]').value = name; const sh = ctx.shape, segs = K().absPath(sh.d), b = segsBox(segs) || {x: 0, y: 0, w: 100, h: 100}, k = 400 / Math.max(b.w, b.h);
            const d = K().pathStr(segs.map(([c, ...a]) => { const o = [c]; for (let j = 0; j < a.length; j += 2) o.push(100 + (a[j] - b.x) * k + (400 - b.w * k) / 2, 100 + (a[j + 1] - b.y) * k + (400 - b.h * k) / 2); return o; }));
            const one = dToPts(d); cur().push({id: uid(), type: one ? 'path' : 'svgpath', name: sh.n || 'Forme', fill: '#3a3a3a', stroke: '#222222', sw: 0, evenodd: !!sh.eo, ...(one ? {pts: one.pts, closed: one.closed} : {d})}); }
        commit(); dirty = false; status(''); setTool('select'); fit();
        if (ctx.svg) addImported(importSvgText(ctx.svg), 'SVG importé');
        if (ctx.imageSrc) { try { const im = await normImage(/^media\//.test(ctx.imageSrc) ? await toDataUrl(ctx.imageSrc) : ctx.imageSrc), k = Math.min(1, doc.w * .9 / im.w, doc.h * .9 / im.h); addImported([{id: uid(), type: 'image', name: 'Image d’origine', src: im.src, x: 0, y: 0, w: im.w * k, h: im.h * k}], 'Image importée'); dirty = false; hint('L’image d’origine est là : Blason → « Vectoriser une image » pour la refaire en tracés, ou dessine par-dessus à la plume.'); } catch (e) { toast(e.message, 'error'); } }
        const rsObs = new ResizeObserver(() => { if (dlg.isConnected) applyView(); }); rsObs.observe(stage);
        return {get doc() { return doc; }, cmd: (k, ...a) => CMDS[k]?.(...a), setTool, select: ids => { sel = ids; render(); }, importSvgText: t => addImported(importSvgText(t), 'SVG'), close: () => { dirty = false; close(); }};
    }

    /* ─── images : SVG → canevas, médias de l'app intégrés ─── */
    function svgCanvas(svg, scale = 1, bg = '') {
        return new Promise((ok, ko) => {
            const m = svg.match(/viewBox="([-\d.]+) ([-\d.]+) ([\d.]+) ([\d.]+)"/), w = Number(m?.[3]) || 800, h = Number(m?.[4]) || 600;
            const W = Math.max(1, Math.min(8000, Math.round(w * scale))), Hh = Math.max(1, Math.min(8000, Math.round(h * scale)));
            const img = new Image(), url = URL.createObjectURL(new Blob([svg], {type: 'image/svg+xml'}));
            img.onload = () => { const c = document.createElement('canvas'); c.width = W; c.height = Hh; const g = c.getContext('2d'); if (bg) { g.fillStyle = bg; g.fillRect(0, 0, W, Hh); } g.drawImage(img, 0, 0, W, Hh); URL.revokeObjectURL(url); ok(c); };
            img.onerror = () => { URL.revokeObjectURL(url); ko(new Error('Image impossible à fabriquer.')); };
            img.src = url;
        });
    }
    async function toDataUrl(src) { const b = await (await fetch(src)).blob(); return new Promise(ok => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(b); }); }
    async function inlineMedia(svg) {
        const refs = [...new Set([...svg.matchAll(/href="(media\/[^"]+)"/g)].map(m => m[1]))];
        for (const r of refs) { try { const d = await toDataUrl(r.replace(/&amp;/g, '&')); if (/^data:image\//.test(d)) svg = svg.split(`href="${r}"`).join(`href="${d}"`); } catch (_) {} }
        return svg;
    }

    ext.openVectorEditor = ctx => openEditor(ctx || {});
    ext.vectorInternals = {boxPts, ptsD, shapeD, box, rbox, mapObj, toPath, dToPts, objSvg, docSvg, traceMask, rasterOp, vectorizeImage, importSvgText, parseTransform, makeBlason, TINCTURES, ESCUTCHEONS, DIVISIONS, ORDINARIES, CHARGE_KEYS, col, imgOk, unionBox, loopsD, svgCanvas};
})();
