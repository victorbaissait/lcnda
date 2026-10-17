/* LCNDA — 🌳 Arbre décoratif à imprimer en grand format : éventail (demi-cercle ou ouvert), roue, arbre dessiné (tronc,
 * branches, médaillons, feuillage). L'arbre est fabriqué comme un dessin vectoriel : il s'ouvre ensuite dans l'outil de
 * dessin pour tout retoucher (couleurs, polices, textes, ornements, calques) puis s'exporte en PDF, PNG, SVG… à n'importe
 * quelle taille. Listes → Outils de modification → « 🌳 Arbre décoratif », ou Graphiques → « Arbre décoratif à imprimer ».
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const api = (...a) => A().api(...a);
    const toast = (...a) => A().toast(...a);
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const n2 = v => Math.round((Number(v) || 0) * 100) / 100;
    let seq = 0; const uid = () => 't' + Date.now().toString(36) + (++seq).toString(36);

    const THEMES = {
        parchemin: {label: 'Parchemin ancien', paper: '#efe2c2', ink: '#4a3420', font: 'Palatino Linotype', pat: ['#e2c595', '#d6b47f'], mat: ['#dccaa6', '#cfb88f'], center: '#e9d2a3', empty: '#f3e9d2', trunk: '#6b4a2b', leaf: ['#7d8f4e', '#93a45c', '#6a7d3f'], title: '#5a2e12', frame: true},
        lcnda: {label: 'Comme l’application (noir, blanc et bleu)', paper: '#ffffff', ink: '#080808', font: 'Arial', pat: ['#eaf2ff', '#d6e6ff'], mat: ['#f4f4f4', '#e8e8e8'], center: '#cfe0ff', empty: '#ffffff', trunk: '#080808', leaf: ['#055dff', '#0066cc', '#5b93ff'], title: '#055dff', frame: true},
        classique: {label: 'Classique', paper: '#ffffff', ink: '#2b2b2b', font: 'Georgia', pat: ['#cfe0f3', '#b8d0ec'], mat: ['#f6d3dc', '#efbecc'], center: '#f4e7b0', empty: '#f6f6f6', trunk: '#7a5634', leaf: ['#6f9c4a', '#86b35c', '#5d8a3b'], title: '#1d3557', frame: true},
        botanique: {label: 'Botanique (vert)', paper: '#f7f5ec', ink: '#2f3b26', font: 'Garamond', pat: ['#cfe3c0', '#bad6a5'], mat: ['#e8eec8', '#d8e3b1'], center: '#f1e6b8', empty: '#f3f3ea', trunk: '#5c4127', leaf: ['#5f8a3a', '#78a24c', '#4c7430', '#9bbb5e'], title: '#2f4a1c', frame: false},
        heraldique: {label: 'Héraldique (azur, gueules et or)', paper: '#f8f1dc', ink: '#1c2a4a', font: 'Times New Roman', pat: ['#2c4f8f', '#3a62a8'], mat: ['#a83232', '#bf4646'], center: '#e3bb4a', empty: '#ece4cc', trunk: '#5a4630', leaf: ['#3f6b3a', '#56844e'], title: '#1c2a4a', frame: true},
        moderne: {label: 'Moderne (pastel)', paper: '#ffffff', ink: '#222222', font: 'Helvetica', pat: ['#a9cdee', '#c4ddf3'], mat: ['#f4b2c2', '#f8cad5'], center: '#ffd57a', empty: '#f4f4f4', trunk: '#8a8a8a', leaf: ['#8bc34a', '#a5d16a'], title: '#222222', frame: false},
        sepia: {label: 'Encre sépia', paper: '#f4ead8', ink: '#3b2a1a', font: 'Baskerville', pat: ['#e6d3b3', '#d9c29b'], mat: ['#eedcc0', '#e2cba6'], center: '#d8b98a', empty: '#f6efe2', trunk: '#5b3f26', leaf: ['#8a7a4e', '#a08f5c'], title: '#3b2a1a', frame: true},
        artdeco: {label: 'Art déco (noir et or)', paper: '#14161b', ink: '#e9d9a6', font: 'Didot', pat: ['#2a2d35', '#343844'], mat: ['#3a3226', '#463c2d'], center: '#c9a24a', empty: '#1d2027', trunk: '#c9a24a', leaf: ['#b8933f', '#d9b864'], title: '#e3c26b', frame: true},
        nuit: {label: 'Nuit étoilée (bleu nuit)', paper: '#0f1f3a', ink: '#eef3ff', font: 'Georgia', pat: ['#284a7e', '#30589a'], mat: ['#4a3a78', '#584791'], center: '#f2c94c', empty: '#16294a', trunk: '#9fb3d1', leaf: ['#5f84b8', '#7aa0d4'], title: '#f2c94c', frame: true},
        aquarelle: {label: 'Aquarelle (doux)', paper: '#fdfbf6', ink: '#3d3d46', font: 'Garamond', pat: ['#bfdcea', '#d3e7f0'], mat: ['#f6cfd5', '#f9dfe3'], center: '#fbe3a7', empty: '#f7f5f0', trunk: '#8b6f55', leaf: ['#9cc7a4', '#b5d6a0', '#e8c0c8'], title: '#5b4b6a', frame: false},
        provence: {label: 'Provence (lavande et olive)', paper: '#faf6ec', ink: '#3e3a2f', font: 'Palatino Linotype', pat: ['#c9c0e3', '#b8addb'], mat: ['#dfe3b8', '#cfd59e'], center: '#f2c75c', empty: '#f5f1e6', trunk: '#7a6243', leaf: ['#8a9a5b', '#a3b26c', '#9c8fc9'], title: '#5b4a8a', frame: true},
        breton: {label: 'Marine (bleu et blanc)', paper: '#ffffff', ink: '#13315c', font: 'Georgia', pat: ['#d6e4f5', '#c2d6ef'], mat: ['#e9eef6', '#dbe4f1'], center: '#13315c', empty: '#f7f9fc', trunk: '#13315c', leaf: ['#4b79b3', '#7aa0cf'], title: '#13315c', frame: true},
        nb: {label: 'Noir et blanc (à imprimer)', paper: '#ffffff', ink: '#111111', font: 'Georgia', pat: ['#ffffff', '#f1f1f1'], mat: ['#ffffff', '#f1f1f1'], center: '#ffffff', empty: '#ffffff', trunk: '#333333', leaf: ['#9a9a9a', '#bdbdbd'], title: '#111111', frame: true},
    };
    // formats en pixels (96 points par pouce), en portrait
    const px = cm => Math.round(cm / 2.54 * 96), fcm = v => String(Math.round(v * 10) / 10).replace('.', ',');
    const FMT0 = [['a5', 'A5', 14.8, 21], ['a4', 'A4', 21, 29.7], ['a3', 'A3', 29.7, 42], ['a2', 'A2', 42, 59.4], ['a1', 'A1', 59.4, 84.1], ['a0', 'A0', 84.1, 118.9], ['letter', 'Lettre US', 21.6, 27.9], ['tabloid', 'Tabloïd US', 27.9, 43.2],
        ['c3040', 'Cadre 30 × 40', 30, 40], ['c4050', 'Cadre 40 × 50', 40, 50], ['p50', 'Affiche 50 × 70', 50, 70], ['p60', 'Affiche 60 × 80', 60, 80], ['p70', 'Affiche 70 × 100', 70, 100], ['p100', 'Grande affiche 100 × 140', 100, 140],
        ['sq30', 'Carré 30 × 30', 30, 30], ['sq', 'Carré 60 × 60', 60, 60], ['sq100', 'Carré 100 × 100', 100, 100], ['ban', 'Bannière 150 × 50', 50, 150], ['rouleau', 'Rouleau 90 × 200', 90, 200]];
    const FKEY = 'genealogie-decor-tree-formats', SKEY = 'genealogie-decor-tree-styles';
    const readJ = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v && typeof v === 'object' ? v : d; } catch (_) { return d; } };
    const writeJ = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };
    const ordered = (keys, pref) => { const o = Array.isArray(pref.order) ? pref.order : []; return [...o.filter(k => keys.includes(k)), ...keys.filter(k => !o.includes(k))]; };
    /** tous les formats (de base et à soi) : [clé, nom affiché, largeur px, hauteur px, à soi ?] ; « visible » : sans les cachés, dans l'ordre choisi */
    function formats(visible = false) {
        const pref = readJ(FKEY, {}), mine = (Array.isArray(pref.custom) ? pref.custom : []).filter(f => f && /^my_[a-z0-9]{3,20}$/.test(f.id) && f.w > 0 && f.h > 0);
        const all = [...FMT0.map(([k, l, w, h]) => [k, `${l} (${fcm(w)} × ${fcm(h)} cm)`, px(w), px(h), false]), ...mine.map(f => [f.id, `${String(f.label || 'Mon format').slice(0, 60)} (${fcm(f.w)} × ${fcm(f.h)} cm)`, px(Math.min(500, f.w)), px(Math.min(500, f.h)), true])];
        const keys = ordered(all.map(f => f[0]), pref), list = keys.map(k => all.find(f => f[0] === k));
        return visible ? list.filter(f => !(Array.isArray(pref.hidden) ? pref.hidden : []).includes(f[0])) : list;
    }
    const FORMATS = formats();
    /** tous les styles (de base et à soi) */
    function themes(visible = false) {
        const pref = readJ(SKEY, {}), mine = Object.entries(pref.custom || {}).filter(([k, t]) => /^my_[a-z0-9]{3,20}$/.test(k) && t && typeof t === 'object').map(([k, t]) => [k, cleanTheme(t), true]);
        const all = [...Object.entries(THEMES).map(([k, t]) => [k, t, false]), ...mine], keys = ordered(all.map(x => x[0]), pref), list = keys.map(k => all.find(x => x[0] === k));
        return visible ? list.filter(x => !(Array.isArray(pref.hidden) ? pref.hidden : []).includes(x[0])) : list;
    }
    const HEX = /^#[0-9a-f]{6}$/i, hx = (v, d) => HEX.test(v || '') ? v : d;
    function cleanTheme(t) { const b = THEMES.classique; return {label: String(t.label || 'Mon style').replace(/[<>]/g, '').slice(0, 60), paper: hx(t.paper, b.paper), ink: hx(t.ink, b.ink), font: String(t.font || b.font).replace(/[^\p{L}\p{N} \-]/gu, '').slice(0, 60) || b.font,
        pat: [hx(t.pat?.[0], b.pat[0]), hx(t.pat?.[1], b.pat[1])], mat: [hx(t.mat?.[0], b.mat[0]), hx(t.mat?.[1], b.mat[1])], center: hx(t.center, b.center), empty: hx(t.empty, b.empty), trunk: hx(t.trunk, b.trunk), leaf: (() => { const l = (Array.isArray(t.leaf) ? t.leaf : []).filter(c => HEX.test(c)).slice(0, 5); return l.length ? l : b.leaf; })(), title: hx(t.title, b.title), frame: t.frame !== false}; }
    const themeOf = k => (themes().find(x => x[0] === k) || themes()[0])[1];
    const SHAPES = [['fan180', 'Éventail (demi-cercle)', 'land', 12], ['fan240', 'Éventail ouvert (240°)', 'land', 12], ['fan270', 'Éventail trois-quarts (270°)', 'land', 12], ['wheel', 'Roue (cercle complet)', 'port', 12],
        ['tree', 'Arbre dessiné (tronc et branches)', 'port', 8], ['boxesV', 'Arbre en cases (de bas en haut)', 'land', 7], ['boxesH', 'Tableau d’ascendance (de gauche à droite)', 'land', 7]];
    // la petite image de chaque forme (dans le choix)
    const SHAPE_ICON = {fan180: '<path d="M4 30a20 20 0 0 1 40 0Z M14 30a10 10 0 0 1 20 0" fill="none" stroke="currentColor" stroke-width="2"/>', fan240: '<path d="M7.7 34A20 20 0 1 1 40.3 34L24 24Z M24 24L14.3 9.4M24 24l9.7-14.6" fill="none" stroke="currentColor" stroke-width="2"/>',
        fan270: '<path d="M9.9 38.1A20 20 0 1 1 38.1 38.1L24 24Z M24 24V4M24 24H4M24 24h20" fill="none" stroke="currentColor" stroke-width="2"/>', wheel: '<circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="24" cy="24" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M24 4v12M24 32v12M4 24h12M32 24h12" stroke="currentColor" stroke-width="2"/>',
        tree: '<path d="M24 44V26M24 30l-9-9M24 28l9-10" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round"/><circle cx="24" cy="15" r="11" fill="currentColor" opacity=".35"/>', boxesV: '<g fill="none" stroke="currentColor" stroke-width="2"><rect x="18" y="38" width="12" height="7"/><rect x="7" y="22" width="12" height="7"/><rect x="29" y="22" width="12" height="7"/><rect x="2" y="6" width="9" height="6"/><rect x="13" y="6" width="9" height="6"/><rect x="26" y="6" width="9" height="6"/><rect x="37" y="6" width="9" height="6"/><path d="M24 38v-5H13v-4M24 33h11v-4"/></g>',
        boxesH: '<g fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="20" width="12" height="8"/><rect x="18" y="9" width="12" height="7"/><rect x="18" y="32" width="12" height="7"/><rect x="34" y="3" width="12" height="6"/><rect x="34" y="14" width="12" height="6"/><rect x="34" y="28" width="12" height="6"/><rect x="34" y="39" width="12" height="6"/><path d="M14 24h2v-11h2M16 24v11h2"/></g>'};

    /* mesure des textes (pour qu'ils tiennent dans leur case) */
    let mctx = null;
    const measure = (t, font, bold, italic) => { mctx = mctx || document.createElement('canvas').getContext('2d'); mctx.font = `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}100px ${font}`; return mctx.measureText(t || ' ').width / 100; };
    const lum = hex => { const m = String(hex).match(/^#(..)(..)(..)$/); if (!m) return 1; const [r, g, b] = m.slice(1).map(x => parseInt(x, 16) / 255); return 0.299 * r + 0.587 * g + 0.114 * b; };
    const ink = (fill, T) => lum(fill) < .48 ? '#ffffff' : T.ink;

    /** les lignes d'une personne, de la plus importante à la moins importante */
    function linesOf(p, o, sosa) {
        if (!p) return [];
        const first = String(p.first_name || '').trim(), last = String(p.last_name || '').trim().toLocaleUpperCase('fr-FR');
        const out = [];
        if (o.layoutNames === 'one') out.push(`${first} ${last}`.trim() || 'Sans nom'); else { if (first) out.push(first); if (last) out.push(last); if (!first && !last) out.push('Sans nom'); }
        const b = o.fullDates ? (p.birth_date || p.birth_year || '') : (p.birth_year || ''), d = o.fullDates ? (p.death_date || p.death_year || '') : (p.death_year || '');
        if (o.dates && (b || d)) out.push(o.fullDates ? [b ? `° ${b}` : '', d ? `† ${d}` : ''].filter(Boolean).join('  ') : `${b || '?'} – ${d || (p.living_status === 'living' ? '' : '?')}`.trim());
        if (o.places && p.birth_place) out.push(String(p.birth_place));
        if (o.jobs && p.occupation) out.push(String(p.occupation).slice(0, 60));
        if (o.sosa && sosa) out.push(`n° ${sosa}`);
        return out;
    }
    /** taille de police pour que « lines » tienne dans w × h ; on enlève les lignes de fin si c'est trop petit */
    function fitLines(lines, w, h, T, max, min) {
        let L = lines.slice();
        while (L.length) {
            const widest = Math.max(...L.map((l, i) => measure(l, T.font, i === (L.length > 1 && /[A-Z]{2}/.test(L[1]) ? 1 : -1), false)));
            const s = Math.min(max, w / Math.max(widest, .1), h / (L.length * 1.18));
            if (s >= min || L.length === 1) return {lines: L, size: Math.max(s, min * .7)};
            L = L.slice(0, -1);
        }
        return {lines: [], size: 0};
    }
    /** un texte centré sur (x, y), tourné de « rot » degrés */
    const textObj = (lines, x, y, size, rot, fill, T, name) => ({id: uid(), type: 'text', name: name || lines[0] || 'Texte', text: lines.join('\n'), x: n2(x), y: n2(y - lines.length * 1.2 * size / 2 + size * .86), size: n2(size), font: T.font, align: 'middle', fill, sw: 0, rot: n2(((rot % 360) + 360) % 360)});
    const wedgeD = (cx, cy, r1, r2, a0, a1) => { // angles en degrés, 0 = haut, sens des aiguilles d'une montre
        const P = (r, a) => { const t = (a - 90) * Math.PI / 180; return [cx + r * Math.cos(t), cy + r * Math.sin(t)]; }, big = a1 - a0 > 180 ? 1 : 0;
        const [x1, y1] = P(r2, a0), [x2, y2] = P(r2, a1), [x3, y3] = P(r1, a1), [x4, y4] = P(r1, a0);
        if (r1 <= 0.01) return `M${n2(cx)} ${n2(cy)}L${n2(x1)} ${n2(y1)}A${n2(r2)} ${n2(r2)} 0 ${big} 1 ${n2(x2)} ${n2(y2)}Z`;
        return `M${n2(x1)} ${n2(y1)}A${n2(r2)} ${n2(r2)} 0 ${big} 1 ${n2(x2)} ${n2(y2)}L${n2(x3)} ${n2(y3)}A${n2(r1)} ${n2(r1)} 0 ${big} 0 ${n2(x4)} ${n2(y4)}Z`;
    };

    /** les ancêtres numérotés (sosa) à partir de l'arbre renvoyé par l'API (père d'abord) */
    function bySosa(root) {
        const map = new Map();
        const walk = (node, s) => { if (!node || s > 16383) return; map.set(s, node.person); const kids = [...(node.children || [])].sort((a, b) => (a.person?.gender === 'female') - (b.person?.gender === 'female')); kids.forEach(k => walk(k, k.person?.gender === 'female' ? 2 * s + 1 : 2 * s)); };
        walk(root, 1); return map;
    }
    const genOf = s => Math.floor(Math.log2(s));
    /** la couleur d'une case : par branche (côté paternel / maternel), par sexe, par génération, ou unie */
    function fillOf(s, p, o, T, G) {
        if (!p) return T.empty;
        if (s === 1) return T.center;
        const g = genOf(s), k = (g + s) % 2;
        if (o.colors === 'gender') return p.gender === 'female' ? T.mat[k] : p.gender === 'male' ? T.pat[k] : T.empty;
        if (o.colors === 'generation') { const a = T.pat[0], b = T.mat[0], t = (g - 1) / Math.max(1, G - 1), mix = (i) => Math.round(parseInt(a.slice(1 + i * 2, 3 + i * 2), 16) * (1 - t) + parseInt(b.slice(1 + i * 2, 3 + i * 2), 16) * t).toString(16).padStart(2, '0'); return `#${mix(0)}${mix(1)}${mix(2)}`; }
        if (o.colors === 'none') return T.pat[1];
        const paternal = (s >> (g - 1)) === 2; // le premier ancêtre de la lignée : 2 = père, 3 = mère
        return (paternal ? T.pat : T.mat)[k];
    }

    /* ═════════ Éventails et roue ═════════ */
    function buildFan(people, o, T, W, H, band) {
        const G = o.gens, span = o.shape === 'fan180' ? 180 : o.shape === 'fan240' ? 240 : o.shape === 'fan270' ? 270 : 360, m = Math.min(W, H) * .045, low = 1 + Math.cos((360 - span) / 2 * Math.PI / 180); // hauteur de l'éventail ouvert, en rayons
        const top = o.titlePos === 'top' ? band : 0, bottom = o.titlePos === 'bottom' ? band : 0;
        // le rayon le plus grand qui tient dans la page
        const usableH = H - 2 * m - top - bottom, usableW = W - 2 * m;
        const R = span === 180 ? Math.min(usableW / 2, usableH * .97) : span < 360 ? Math.min(usableW / 2, usableH / low) : Math.min(usableW, usableH) / 2;
        const cx = W / 2, cy = span === 180 ? H - m - bottom - R * .03 : span < 360 ? m + top + R + (usableH - R * low) / 2 : m + top + usableH / 2;
        // anneaux : plus larges pour les générations lointaines (le texte y est écrit dans le sens du rayon)
        const weights = Array.from({length: G}, (_, i) => i < 3 ? 1 : 1 + (i - 2) * (G > 8 ? .32 : .22)), r0 = R * (G <= 4 ? .2 : G <= 6 ? .14 : G <= 9 ? .1 : .07), tot = weights.reduce((a, b) => a + b, 0);
        const radii = [r0]; weights.forEach(w => radii.push(radii.at(-1) + (R - r0) * w / tot));
        const start = -span / 2, groups = [], unit = Math.min(W, H) / 1000;
        for (let g = 0; g <= G; g++) {
            const n = 2 ** g;
            for (let i = 0; i < n; i++) {
                const s = n + i, p = people.get(s); if (!p && !o.empty) continue;
                const a0 = start + span * i / n, a1 = start + span * (i + 1) / n, r1 = g ? radii[g - 1] : 0, r2 = radii[g];
                const fill = fillOf(s, p, o, T, G), shape = {id: uid(), type: 'svgpath', name: 'Case', d: g === 0 && span === 360 ? `M${n2(cx - r2)} ${n2(cy)}a${n2(r2)} ${n2(r2)} 0 1 0 ${n2(2 * r2)} 0a${n2(r2)} ${n2(r2)} 0 1 0 ${n2(-2 * r2)} 0Z` : wedgeD(cx, cy, r1, r2, g === 0 ? start : a0, g === 0 ? start + span : a1), fill, stroke: T.ink, sw: n2(Math.max(.6, 1.6 * unit * (g < 4 ? 1 : .7))), join: 'round'};
                const kids = [shape];
                const mid = g === 0 ? 0 : (a0 + a1) / 2, rm = g === 0 ? (span === 360 ? 0 : r2 * .45) : (r1 + r2) / 2, arc = g === 0 ? 2 * r2 * (span === 360 ? .8 : .9) : rm * (a1 - a0) * Math.PI / 180, depth = r2 - r1;
                const t = (mid - 90) * Math.PI / 180, px = cx + rm * Math.cos(t), py = cy + rm * Math.sin(t);
                const lines = p ? linesOf(p, o, s) : (o.empty ? ['?'] : []);
                if (lines.length) {
                    const tangential = g === 0 || arc * .9 >= depth * .9; // assez de largeur : on écrit en travers
                    const fw = tangential ? arc * .86 : depth * .86, fh = tangential ? (g === 0 ? (span === 360 ? r2 * 1.3 : r2 * .75) : depth * .82) : arc * .84;
                    const {lines: L, size} = fitLines(lines, fw, fh, T, (g === 0 ? 44 : g < 3 ? 30 : 22) * unit * 1.6, 4.5 * unit);
                    let rot = g === 0 ? 0 : tangential ? mid : mid - 90;
                    const norm = ((rot % 360) + 360) % 360; if (norm > 90 && norm < 270) rot += 180; // jamais la tête en bas
                    if (L.length) kids.push(textObj(L, px, py, size, rot, p ? ink(fill, T) : T.ink, T, p ? `${p.first_name || ''} ${p.last_name || ''}`.trim() : '?'));
                }
                groups.push({id: uid(), type: 'group', name: p ? `${s}. ${`${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Sans nom'}` : `${s}. (à trouver)`, children: kids});
            }
        }
        // les numéros de génération le long du bord, pour s'y retrouver
        const labels = [];
        if (o.genLabels && span !== 360) for (let g = 1; g <= G; g++) { const rm = (radii[g - 1] + radii[g]) / 2, a = (start - 3 - 90) * Math.PI / 180, x = cx + rm * Math.cos(a), y = cy + rm * Math.sin(a); labels.push({id: uid(), type: 'text', name: `Génération ${g + 1}`, text: g === 1 ? 'Parents' : g === 2 ? 'Grands-parents' : `${g + 1}ᵉ gén.`, x: n2(x), y: n2(y), size: n2(Math.min(11 * unit * 1.4, (radii[g] - radii[g - 1]) * .9 / Math.max(1, measure(g === 1 ? 'Parents' : g === 2 ? 'Grands-parents' : `${g + 1}ᵉ gén.`, T.font, false, true)))), font: T.font, align: 'middle', fill: T.ink, sw: 0, italic: true, op: .75, rot: n2(start + 90)}); } // le nom tient dans la largeur de l'anneau // le long du bord gauche, lisible
        return {groups, labels, box: {cx, cy, R}};
    }

    /* ═════════ Arbre dessiné : tronc, branches, médaillons, feuillage ═════════ */
    function buildTree(people, o, T, W, H, band) {
        const G = Math.min(o.gens, 8), m = Math.min(W, H) * .05, unit = Math.min(W, H) / 1000, top = o.titlePos === 'top' ? band : 0, bottom = o.titlePos === 'bottom' ? band : 0;
        // la couronne : des arcs de cercle concentriques au-dessus d'un tronc court ; le pied (la personne) en bas
        const usableW = W - 2 * m, availH = H - 2 * m - top - bottom, rootH = Math.min(availH * .1, usableW * .12);
        // couronne ovale : aussi large que la page, aussi haute que la place le permet
        const crownRx = usableW / 2 * .97, crownRy = Math.min(crownRx * 1.45, (availH - rootH * 1.6) / 1.38), crownR = (crownRx + crownRy) / 2, ccx = W / 2, ccy = m + top + crownRy * 1.03;
        const span = 224, start = -span / 2, rootX = W / 2, rootY = Math.min(H - m - bottom - rootH * .6, ccy + crownRy * .38 + rootH);
        // anneaux plus larges près du tronc (peu de monde, de grands médaillons) et au bord (les noms y sont écrits en long)
        const wts = Array.from({length: G}, (_, i) => i === 0 ? 1.5 : i === 1 ? 1.3 : i === G - 1 ? 1.35 : 1), wsum = wts.reduce((a, b) => a + b, 0), fr = [.16]; wts.forEach(w => fr.push(fr.at(-1) + .84 * w / wsum));
        const ringR = g => crownR * fr[g], dRof = g => crownR * (fr[g] - fr[g - 1]);
        const pos = s => { if (s === 1) return [rootX, rootY]; const g = genOf(s), n = 2 ** g, i = s - n, a = start + span * (i + .5) / n, t = (a - 90) * Math.PI / 180; return [ccx + crownRx * fr[g] * Math.cos(t), ccy + crownRy * fr[g] * Math.sin(t)]; };
        const angOf = s => { const g = genOf(s), n = 2 ** g; return start + span * (s - n + .5) / n; };
        const branches = [], leaves = [], groups = [];
        const trunkW = crownR * .16;
        // le tronc (forme pleine, évasée en bas, avec des racines)
        const tY0 = ccy - crownR * .02, tY1 = rootY - rootH * .45;
        branches.push({id: uid(), type: 'svgpath', name: 'Tronc', d: `M${n2(rootX - trunkW * .45)} ${n2(tY0)}C${n2(rootX - trunkW * .5)} ${n2((tY0 + tY1) / 2)} ${n2(rootX - trunkW * .6)} ${n2(tY1 - trunkW)} ${n2(rootX - trunkW * 1.6)} ${n2(tY1 + trunkW * .25)}L${n2(rootX - trunkW * .9)} ${n2(tY1 + trunkW * .1)}Q${n2(rootX - trunkW * .5)} ${n2(tY1 + trunkW * .35)} ${n2(rootX - trunkW * .7)} ${n2(tY1 + trunkW * .8)}L${n2(rootX)} ${n2(tY1 + trunkW * .2)}L${n2(rootX + trunkW * .7)} ${n2(tY1 + trunkW * .8)}Q${n2(rootX + trunkW * .5)} ${n2(tY1 + trunkW * .35)} ${n2(rootX + trunkW * .9)} ${n2(tY1 + trunkW * .1)}L${n2(rootX + trunkW * 1.6)} ${n2(tY1 + trunkW * .25)}C${n2(rootX + trunkW * .6)} ${n2(tY1 - trunkW)} ${n2(rootX + trunkW * .5)} ${n2((tY0 + tY1) / 2)} ${n2(rootX + trunkW * .45)} ${n2(tY0)}Z`, fill: T.trunk, stroke: T.ink, sw: n2(unit), join: 'round'});
        // les branches : de chaque personne vers ses deux parents, de plus en plus fines
        for (let s = 2; s < 2 ** (G + 1); s++) {
            if (!people.get(s) && !o.empty) continue;
            const [x1, y1] = s < 4 ? [rootX, tY0] : pos(s >> 1), [x2, y2] = pos(s), g = genOf(s), w = Math.max(1.2 * unit, trunkW * .55 * .68 ** (g - 1));
            branches.push({id: uid(), type: 'svgpath', name: `Branche ${s}`, d: `M${n2(x1)} ${n2(y1)}C${n2(x1)} ${n2(y1 - (y1 - y2) * .55)} ${n2(x2 + (x1 - x2) * .25)} ${n2(y2 + (y1 - y2) * .25)} ${n2(x2)} ${n2(y2)}`, fill: 'none', stroke: T.trunk, sw: n2(w), cap: 'round'});
        }
        // le feuillage : des feuilles autour des générations lointaines (toujours au même endroit pour un même arbre)
        if (o.leaves) {
            let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
            const leafD = (x, y, s, a) => { const c = Math.cos(a), sn = Math.sin(a), P = (u, v) => `${n2(x + u * s * c - v * s * sn)} ${n2(y + u * s * sn + v * s * c)}`; return `M${P(0, 0)}C${P(.35, -.32)} ${P(.75, -.25)} ${P(1, 0)}C${P(.75, .25)} ${P(.35, .32)} ${P(0, 0)}Z`; };
            const n = clamp(40 * G, 80, 420);
            for (let k = 0; k < n; k++) { const g = 1 + Math.floor(rnd() * G), a = start - 8 + (span + 16) * rnd(), f2 = fr[g] + (rnd() - .4) * .12, t = (a - 90) * Math.PI / 180, x = ccx + crownRx * f2 * Math.cos(t), y = ccy + crownRy * f2 * Math.sin(t), sz = crownR * (.035 + rnd() * .04);
                leaves.push({id: uid(), type: 'svgpath', name: 'Feuille', d: leafD(x, y, sz, rnd() * Math.PI * 2), fill: T.leaf[Math.floor(rnd() * T.leaf.length)], stroke: 'none', sw: 0, op: n2(.55 + rnd() * .4)}); }
        }
        // les médaillons
        for (let s = 1; s < 2 ** (G + 1); s++) {
            const p = people.get(s); if (!p && !o.empty) continue;
            const g = genOf(s), n = 2 ** g, [x, y] = pos(s), tt = s > 1 ? (angOf(s) - 90) * Math.PI / 180 : 0, kl = Math.hypot(crownRx * Math.cos(tt), crownRy * Math.sin(tt)) || crownR; // l'ovale est plus serré sur les côtés
            const arc = kl * fr[g] * span * Math.PI / 180 / n, deep = g === G ? kl * .3 : kl * (fr[g] - fr[g - 1]);
            // assez de place en travers : médaillon couché ; sinon, il suit sa branche (dans le sens du rayon)
            const radial = s > 1 && arc < deep * 1.05, ang = s > 1 ? angOf(s) : 0;
            const mw = s === 1 ? Math.min(usableW * .34, rootH * 2.6) : radial ? deep * .92 : Math.min(arc * .82, crownR * .4), mh = s === 1 ? rootH * 1.1 : radial ? Math.min(arc * .86, deep * .6) : Math.min(deep * .72, mw * .62);
            let rotE = radial ? ang - 90 : 0; const nrm = ((rotE % 360) + 360) % 360; if (nrm > 90 && nrm < 270) rotE += 180;
            const fill = fillOf(s, p, o, T, G), kids = [{id: uid(), type: 'ellipse', name: 'Médaillon', x: n2(x - mw / 2), y: n2(y - mh / 2), w: n2(mw), h: n2(mh), fill, stroke: T.ink, sw: n2(Math.max(.6, 1.4 * unit)), ...(radial ? {rot: n2(((rotE % 360) + 360) % 360)} : {})}];
            let ty = y, th = mh * .78;
            if (o.photos && p?.portraitData && g <= 3 && !radial) { const ph = mh * .9, cxp = x, cyp = y - mh / 2 - ph * .42, clip = {id: uid(), type: 'ellipse', x: n2(cxp - ph / 2), y: n2(cyp - ph / 2), w: n2(ph), h: n2(ph)};
                kids.push({id: uid(), type: 'group', name: 'Portrait', clip, children: [{id: uid(), type: 'image', name: 'Portrait', src: p.portraitData, x: clip.x, y: clip.y, w: clip.w, h: clip.h}]}, {...clip, id: uid(), type: 'ellipse', name: 'Cadre du portrait', fill: 'none', stroke: T.ink, sw: n2(Math.max(.6, 1.2 * unit))}); }
            const lines = p ? linesOf(p, o, s) : ['?'];
            const {lines: L, size} = fitLines(lines, mw * .8, mh * .74, T, (s === 1 ? 40 : 24) * unit * 1.5, 4.5 * unit);
            if (L.length) kids.push(textObj(L, x, ty, size, rotE, p ? ink(fill, T) : T.ink, T)); void th;
            groups.push({id: uid(), type: 'group', name: p ? `${s}. ${`${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Sans nom'}` : `${s}. (à trouver)`, children: kids});
        }
        return {groups, branches, leaves, labels: [], box: {cx: ccx, cy: ccy, R: crownR}};
    }

    /* ═════════ Arbre en cases : de bas en haut, ou tableau d'ascendance de gauche à droite ═════════ */
    function buildBoxes(people, o, T, W, H, band, vertical) {
        const G = Math.min(o.gens, 7), m = Math.min(W, H) * .05, unit = Math.min(W, H) / 1000, top = o.titlePos === 'top' ? band : 0, bottom = o.titlePos === 'bottom' ? band : 0;
        const x0 = m, y0 = m + top, w = W - 2 * m, h = H - 2 * m - top - bottom, cols = G + 1, lab = o.genLabels ? (vertical ? w * .07 : h * .04) : 0;
        const box = s => { const g = genOf(s), n = 2 ** g, i = s - n;
            if (!vertical) { const cw = w / cols, slot = (h - lab) / n, bw = cw * .8, bh = Math.min(slot * .84, cw * .62); return {x: x0 + g * cw, y: y0 + lab + slot * (i + .5) - bh / 2, w: bw, h: bh}; }
            const rh = h / cols, slot = (w - lab) / n, bh = rh * .66, bw = Math.min(slot * .9, rh * 2.2); return {x: x0 + lab + slot * (i + .5) - bw / 2, y: y0 + h - (g + 1) * rh + (rh - bh) / 2, w: bw, h: bh}; };
        const groups = [], links = [], labels = [], sw = n2(Math.max(.6, 1.4 * unit));
        for (let s = 1; s < 2 ** (G + 1); s++) {
            const p = people.get(s); if (!p && !o.empty) continue;
            const b = box(s), fill = fillOf(s, p, o, T, G), kids = [{id: uid(), type: 'rect', name: 'Case', x: n2(b.x), y: n2(b.y), w: n2(b.w), h: n2(b.h), r: n2(Math.min(b.w, b.h) * .12), fill, stroke: T.ink, sw}];
            const turn = vertical && b.w < b.h * .8, lines = p ? linesOf(p, o, s) : ['?'];
            const {lines: L, size} = fitLines(lines, (turn ? b.h : b.w) * .88, (turn ? b.w : b.h) * .8, T, (s === 1 ? 34 : 24) * unit * 1.5, 4 * unit);
            if (L.length) kids.push(textObj(L, b.x + b.w / 2, b.y + b.h / 2, size, turn ? 270 : 0, p ? ink(fill, T) : T.ink, T));
            groups.push({id: uid(), type: 'group', name: p ? `${s}. ${`${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Sans nom'}` : `${s}. (à trouver)`, children: kids});
            if (s > 1) { const c = box(s >> 1), d = vertical ? (() => { const x1 = c.x + c.w / 2, y1 = c.y, x2 = b.x + b.w / 2, y2 = b.y + b.h, ym = (y1 + y2) / 2; return `M${n2(x1)} ${n2(y1)}V${n2(ym)}H${n2(x2)}V${n2(y2)}`; })()
                : (() => { const x1 = c.x + c.w, y1 = c.y + c.h / 2, x2 = b.x, y2 = b.y + b.h / 2, xm = (x1 + x2) / 2; return `M${n2(x1)} ${n2(y1)}H${n2(xm)}V${n2(y2)}H${n2(x2)}`; })();
                links.push({id: uid(), type: 'svgpath', name: `Lien ${s}`, d, fill: 'none', stroke: T.trunk, sw: n2(Math.max(.8, 2 * unit * .85 ** genOf(s))), join: 'round'}); }
        }
        if (o.genLabels) for (let g = 0; g <= G; g++) { const name = g === 0 ? '' : g === 1 ? 'Parents' : g === 2 ? 'Grands-parents' : g === 3 ? 'Arrière-grands-parents' : `${g + 1}ᵉ génération`; if (!name) continue;
            const b = box(2 ** g); labels.push({id: uid(), type: 'text', name, text: name, x: n2(vertical ? x0 + lab / 2 : b.x + b.w / 2), y: n2(vertical ? b.y + b.h / 2 : y0 + lab * .7), size: n2(Math.min(14 * unit * 1.4, vertical ? lab * .3 : lab * .6)), font: T.font, align: 'middle', fill: T.ink, sw: 0, italic: true, op: .75, rot: vertical ? 270 : 0}); }
        return {groups, branches: links, leaves: [], labels, box: {cx: W / 2, cy: H / 2, R: Math.min(w, h) / 2}};
    }

    /* ═════════ Habillage : cadre, titre ═════════ */
    function decor(o, T, W, H, band) {
        const out = [], unit = Math.min(W, H) / 1000, m = Math.min(W, H) * .02;
        if (o.frame && T.frame) {
            out.push({id: uid(), type: 'rect', name: 'Cadre', x: m, y: m, w: W - 2 * m, h: H - 2 * m, fill: 'none', stroke: T.ink, sw: n2(3 * unit)});
            out.push({id: uid(), type: 'rect', name: 'Filet', x: m + 8 * unit, y: m + 8 * unit, w: W - 2 * m - 16 * unit, h: H - 2 * m - 16 * unit, fill: 'none', stroke: T.ink, sw: n2(unit)});
            [[m, m], [W - m, m], [m, H - m], [W - m, H - m]].forEach(([x, y], i) => out.push({id: uid(), type: 'star', name: `Ornement ${i + 1}`, x: n2(x - 16 * unit), y: n2(y - 16 * unit), w: n2(32 * unit), h: n2(32 * unit), n: 4, inner: 35, fill: T.title, stroke: 'none', sw: 0}));
        }
        const title = String(o.title || '').trim(), sub = String(o.subtitle || '').trim();
        const titles = [];
        if (title || sub) {
            const y0 = o.titlePos === 'top' ? m + band * .2 : H - m - band * .85, ts = Math.min(band * .42, (W * .8) / Math.max(4, measure(title, T.font, true) || 1));
            if (title) titles.push({id: uid(), type: 'text', name: 'Titre', text: title, x: n2(W / 2), y: n2(y0 + ts), size: n2(ts), font: T.font, align: 'middle', bold: true, italic: T.frame, fill: T.title, sw: 0, ls: n2(ts * .04)});
            if (sub) titles.push({id: uid(), type: 'text', name: 'Sous-titre', text: sub, x: n2(W / 2), y: n2(y0 + ts + ts * .62 + 6 * unit), size: n2(ts * .45), font: T.font, align: 'middle', italic: true, fill: T.ink, sw: 0});
        }
        return {frame: out, titles};
    }

    async function portraitData(file) {
        try { const blob = await (await fetch(`media/${encodeURIComponent(file)}`)).blob(); const img = await createImageBitmap(blob); const k = Math.min(1, 220 / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', .82); } catch (_) { return ''; }
    }

    /** fabrique le dessin complet */
    async function build(o) {
        const T = themeOf(o.theme), fmt = formats().find(f => f[0] === o.format) || formats().find(f => f[0] === 'a3'), land = o.orient === 'land' || (o.orient === 'auto' && SHAPES.find(s => s[0] === o.shape)?.[2] === 'land');
        const W = land ? fmt[3] : fmt[2], H = land ? fmt[2] : fmt[3], band = (o.title || o.subtitle) ? Math.min(W, H) * .11 : 0;
        const r = await api('tree', {id: o.person, mode: 'ancestors', depth: Math.min(o.gens, SHAPES.find(x => x[0] === o.shape)?.[3] || 10), places: 1});
        if (!r.tree) throw new Error('Aucune ascendance pour cette personne.');
        const people = bySosa(r.tree);
        if (o.photos) { let n = 0; for (const [s, p] of people) { if (n >= 40 || genOf(s) > 4) continue; if (p?.portrait) { p.portraitData = await portraitData(p.portrait); n++; } } }
        const built = o.shape === 'tree' ? buildTree(people, o, T, W, H, band) : o.shape === 'boxesV' || o.shape === 'boxesH' ? buildBoxes(people, o, T, W, H, band, o.shape === 'boxesV') : buildFan(people, o, T, W, H, band), d = decor(o, T, W, H, band);
        const layer = (name, children) => ({id: uid(), type: 'group', layer: true, name, children});
        const objs = [layer('Cadre et ornements', d.frame), ...(built.branches ? [layer('Tronc et branches', built.branches)] : []), ...(built.leaves?.length ? [layer('Feuillage', built.leaves)] : []), layer('Ancêtres', built.groups), ...(built.labels.length ? [layer('Générations', built.labels)] : []), layer('Titre', d.titles)];
        return {w: W, h: H, bg: T.paper, grid: 0, snap: false, kind: 'tree', objs, count: [...people.values()].filter(Boolean).length};
    }

    const PREF = 'lcnda-decor-tree';
    const rid = () => 'my_' + Math.random().toString(36).slice(2, 10);
    /** ⚙️ Les listes réglables (formats, styles) : ranger ↑ ↓, montrer / cacher, et les siens (＋, ✎, 🗑) */
    function manageList({key, title, intro, all, addLabel, onAdd, onEdit, onDelete, onDone}) {
        const rowsHtml = () => { const pref = readJ(key, {}), hidden = pref.hidden || []; return all().map(([k, l, mine]) => `<li class="h-pet-lrow" data-k="${esc(k)}"><input type="checkbox" ${hidden.includes(k) ? '' : 'checked'} title="Montrer dans la liste"><span>${esc(l)}${mine ? ' <small class="muted">· à moi</small>' : ''}</span>${mine ? `<button type="button" class="h-bt" data-ed title="Modifier">✎</button><button type="button" class="h-bt" data-del title="Supprimer">🗑</button>` : ''}<button type="button" class="h-bt" data-up title="Monter">↑</button><button type="button" class="h-bt" data-down title="Descendre">↓</button></li>`).join(''); };
        const save = dg => { const pref = readJ(key, {}), li = [...dg.querySelectorAll('[data-k]')]; pref.order = li.map(x => x.dataset.k); pref.hidden = li.filter(x => !x.querySelector('input').checked).map(x => x.dataset.k); if (pref.hidden.length >= li.length) { toast('Garde-en au moins un.', 'error'); return false; } writeJ(key, pref); };
        ext.openDialog({eyebrow: 'ARBRE DÉCORATIF', title, submitLabel: 'Enregistrer', body: `<p class="muted">${intro}</p><ol class="h-pet-layout h-dt-mlist" data-list>${rowsHtml()}</ol><div class="h-dt-mrow"><button type="button" class="button small" data-add>${esc(addLabel)}</button><button type="button" class="button small secondary" data-reset>↺ Remettre comme au départ</button></div>`,
            onOpen: dg => dg.addEventListener('click', async e => { const b = e.target.closest('button'); if (!b) return; const li = b.closest('[data-k]'), list = dg.querySelector('[data-list]');
                if (b.hasAttribute('data-up')) li.previousElementSibling?.before(li); else if (b.hasAttribute('data-down')) li.nextElementSibling?.after(li);
                else if (b.hasAttribute('data-add') || b.hasAttribute('data-ed')) { save(dg); const ok = await (b.hasAttribute('data-add') ? onAdd() : onEdit(li.dataset.k)); if (ok) list.innerHTML = rowsHtml(); }
                else if (b.hasAttribute('data-del')) { if (!await A().confirmBox('', {title: `Supprimer « ${all().find(([k]) => k === li.dataset.k)?.[1] || 'cet élément'} » ?`, okLabel: 'Supprimer'})) return; onDelete(li.dataset.k); li.remove(); }
                else if (b.hasAttribute('data-reset')) { const pref = readJ(key, {}); delete pref.order; delete pref.hidden; writeJ(key, pref); list.innerHTML = rowsHtml(); } }),
            onSubmit: dg => { if (save(dg) === false) return false; onDone?.(); }});
    }
    function editFormat(id) {
        return new Promise(res => { const pref = readJ(FKEY, {}), f = (pref.custom || []).find(x => x.id === id) || {label: '', w: 50, h: 70};
            ext.openDialog({eyebrow: 'FORMATS', title: id ? 'Modifier le format' : '＋ Un format à moi', submitLabel: 'Enregistrer', body: `<div class="form-grid"><label>Nom<input name="label" maxlength="60" value="${esc(f.label)}" placeholder="Cadre du salon, toile 80 × 120…" required></label><label>Largeur (cm)<input name="w" type="number" min="5" max="500" step="0.1" value="${f.w}" required></label><label>Hauteur (cm)<input name="h" type="number" min="5" max="500" step="0.1" value="${f.h}" required></label></div><p class="muted">De 5 à 500 cm. Le sens (portrait ou paysage) se choisit ensuite à part.</p>`,
                onSubmit: dg => { const label = dg.querySelector('[name=label]').value.trim(), w = Number(dg.querySelector('[name=w]').value), h = Number(dg.querySelector('[name=h]').value); if (!label || !(w >= 5 && w <= 500 && h >= 5 && h <= 500)) { toast('Un nom, et des mesures de 5 à 500 cm.', 'error'); return false; }
                    const p2 = readJ(FKEY, {}), list = Array.isArray(p2.custom) ? p2.custom : [], i = list.findIndex(x => x.id === id), item = {id: id || rid(), label: label.slice(0, 60), w, h}; if (i >= 0) list[i] = item; else list.push(item); p2.custom = list.slice(0, 60); writeJ(FKEY, p2); res(item.id); } }).addEventListener('close', () => res(null)); });
    }
    const THEME_FIELDS = [['paper', 'Papier (fond)'], ['ink', 'Encre (textes, traits)'], ['title', 'Titre'], ['center', 'Case de la personne'], ['pat0', 'Côté paternel'], ['pat1', 'Côté paternel (2e teinte)'], ['mat0', 'Côté maternel'], ['mat1', 'Côté maternel (2e teinte)'], ['empty', 'Cases vides'], ['trunk', 'Tronc, branches, liens'], ['leaf0', 'Feuilles'], ['leaf1', 'Feuilles (2e teinte)'], ['leaf2', 'Feuilles (3e teinte)']];
    function editTheme(id, fromKey) {
        return new Promise(res => { const base = id ? themeOf(id) : themeOf(fromKey || 'parchemin'), get = k => /\d$/.test(k) ? (base[k.slice(0, -1)] || [])[Number(k.slice(-1))] || (base[k.slice(0, -1)] || [])[0] : base[k];
            const fonts = ['Palatino Linotype', 'Georgia', 'Garamond', 'Baskerville', 'Times New Roman', 'Didot', 'Book Antiqua', 'Cochin', 'Helvetica', 'Avenir', 'Futura', 'Gill Sans', 'Optima', 'Trebuchet MS', 'Verdana', 'Brush Script MT', 'Apple Chancery', 'Zapfino', 'Snell Roundhand', 'Lucida Calligraphy'];
            const preview = dg => { const v = k => dg.querySelector(`[name=${k}]`).value, box = dg.querySelector('[data-pv]'); box.style.background = v('paper'); box.style.color = v('ink'); box.style.fontFamily = `"${v('font')}", serif`;
                box.innerHTML = `<b style="color:${v('title')}">Famille Martin</b><div class="h-dt-pvrow"><span style="background:${v('pat0')}">Père</span><span style="background:${v('center')}">Moi</span><span style="background:${v('mat0')}">Mère</span><span style="background:${v('empty')};border:1px dashed ${v('ink')}">?</span></div><div class="h-dt-pvrow"><i style="background:${v('trunk')}"></i><i style="background:${v('leaf0')}"></i><i style="background:${v('leaf1')}"></i><i style="background:${v('leaf2')}"></i></div>`; };
            ext.openDialog({eyebrow: 'STYLES', title: id ? 'Modifier mon style' : '＋ Créer un style', submitLabel: 'Enregistrer', wide: true,
                body: `<div class="h-dt-theme"><div><label>Nom<input name="label" maxlength="60" value="${esc(id ? base.label : '')}" placeholder="Mon style" required></label>${id ? '' : `<label>Partir de<select name="from">${themes().map(([k, t]) => `<option value="${esc(k)}" ${k === (fromKey || 'parchemin') ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}</select></label>`}
                    <label>Police<input name="font" list="h-dt-fonts" value="${esc(base.font)}"><datalist id="h-dt-fonts">${fonts.map(f => `<option value="${esc(f)}">`).join('')}</datalist></label>
                    <div class="h-dt-colors">${THEME_FIELDS.map(([k, l]) => `<label><input type="color" name="${k}" value="${esc(get(k) || '#888888')}"> ${esc(l)}</label>`).join('')}</div>
                    <label class="checkbox-line"><input type="checkbox" name="frame" ${base.frame ? 'checked' : ''}> Cadre et ornements possibles</label></div><div class="h-dt-pv" data-pv></div></div>`,
                onOpen: dg => { preview(dg); dg.addEventListener('input', () => preview(dg)); dg.querySelector('[name=from]')?.addEventListener('change', e => { const t = themeOf(e.target.value); THEME_FIELDS.forEach(([k]) => { const v = /\d$/.test(k) ? (t[k.slice(0, -1)] || [])[Number(k.slice(-1))] || (t[k.slice(0, -1)] || [])[0] : t[k]; if (v) dg.querySelector(`[name=${k}]`).value = v; }); dg.querySelector('[name=font]').value = t.font; dg.querySelector('[name=frame]').checked = !!t.frame; preview(dg); }); },
                onSubmit: dg => { const v = k => dg.querySelector(`[name=${k}]`).value, label = v('label').trim(); if (!label) { toast('Donne un nom au style.', 'error'); return false; }
                    const t = cleanTheme({label, paper: v('paper'), ink: v('ink'), title: v('title'), center: v('center'), empty: v('empty'), trunk: v('trunk'), font: v('font'), pat: [v('pat0'), v('pat1')], mat: [v('mat0'), v('mat1')], leaf: [v('leaf0'), v('leaf1'), v('leaf2')], frame: dg.querySelector('[name=frame]').checked});
                    const p2 = readJ(SKEY, {}), key = id || rid(); p2.custom = {...(p2.custom || {}), [key]: t}; if (Object.keys(p2.custom).length > 60) { toast('60 styles au plus.', 'error'); return false; } writeJ(SKEY, p2); res(key); } }).addEventListener('close', () => res(null)); });
    }
    function openMaker(onDone) {
        const S = A().state, cur = Number(S.currentPersonId) || Number(S.bootstrap?.startPersonId) || 0;
        const saved = readJ(PREF, {});
        const v = (k, d) => saved[k] ?? d, sel = (name, list, cur2) => `<select name="${name}">${list.map(([k, l]) => `<option value="${esc(k)}" ${String(cur2) === String(k) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
        const chk = (name, label, on) => `<label class="checkbox-line"><input type="checkbox" name="${name}" ${on ? 'checked' : ''}> ${label}</label>`;
        const gensOpts = shape => { const max = SHAPES.find(x => x[0] === shape)?.[3] || 10; return Array.from({length: max - 1}, (_, i) => i + 2).map(n => [n, `${n} générations${n >= 9 ? ` (${2 ** (n + 1) - 1} cases)` : ''}`]); };
        const fmtOpts = cur2 => { const vis = formats(true), list = vis.some(f => f[0] === cur2) ? vis : [...vis, ...formats().filter(f => f[0] === cur2)]; return list.map(f => [f[0], f[1]]); };
        const themeSel = cur2 => { const vis = themes(true), list = vis.some(x => x[0] === cur2) ? vis : [...vis, ...themes().filter(x => x[0] === cur2)], base = list.filter(x => !x[2]), mine = list.filter(x => x[2]);
            const o = l => l.map(([k, t]) => `<option value="${esc(k)}" ${k === cur2 ? 'selected' : ''}>${esc(t.label)}</option>`).join(''); return `<select name="theme">${o(base)}${mine.length ? `<optgroup label="Mes styles">${o(mine)}</optgroup>` : ''}</select>`; };
        const shape0 = SHAPES.some(x => x[0] === v('shape')) ? v('shape') : 'fan180';
        let chosenName = '';
        ext.openDialog({eyebrow: 'ARBRE DÉCORATIF', title: '🌳 Un arbre à imprimer en grand', submitLabel: 'Fabriquer l’arbre', wide: true,
            body: `<div class="h-dt-form"><p class="muted">L’arbre est fabriqué comme un dessin : il s’ouvre ensuite dans l’outil de dessin vectoriel pour changer les couleurs, les polices, les textes, ajouter des ornements, un blason… puis l’exporter en PDF ou en image, à la taille voulue.</p>
                <label class="h-dt-person">Personne au centre (ou au pied de l’arbre)${A().collectionPersonField('person', null, 'Tape un nom…')}</label>
                <fieldset class="h-dt-shapes-box"><legend>Forme</legend><input type="hidden" name="shape" value="${shape0}"><div class="h-dt-shapes" data-tbg="dt-shapes" data-tbg-label="Formes de l’arbre">${SHAPES.map(([k, l]) => `<button type="button" class="h-dt-shape${shape0 === k ? ' is-on' : ''}" data-dt-shape="${k}" data-tb-label="${esc(l)}" aria-pressed="${shape0 === k}"><svg viewBox="0 0 48 48" aria-hidden="true">${SHAPE_ICON[k]}</svg><small>${esc(l)}</small></button>`).join('')}</div></fieldset>
                <div class="h-dt-tools" data-tbg="dt-tools" data-tbg-label="Boutons de la fenêtre"><button type="button" class="button small secondary" data-dt-cmd="fmts">⚙️ Mes formats</button><button type="button" class="button small secondary" data-dt-cmd="themes">🎨 Mes styles</button><button type="button" class="button small secondary" data-dt-cmd="newtheme">＋ Créer un style</button><button type="button" class="button small secondary" data-dt-cmd="reset">↺ Réglages par défaut</button>${ext.tbButton ? ext.tbButton('decortree') : ''}</div>
                <div class="form-grid"><label>Générations<select name="gens">${gensOpts(shape0).map(([k, l], _, all) => `<option value="${k}" ${Math.min(Number(v('gens', 5)) || 5, all.at(-1)[0]) === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
                    <label>Format<span class="h-dt-withbtn"><span data-fmtbox>${sel('format', fmtOpts(v('format', 'a3')), v('format', 'a3'))}</span><button type="button" class="button small secondary" data-dt-cmd="fmts" title="Mes formats ; ranger, montrer ou cacher">⚙️</button></span></label>
                    <label>Sens${sel('orient', [['auto', 'Selon la forme'], ['land', 'Paysage'], ['port', 'Portrait']], v('orient', 'auto'))}</label>
                    <label>Style<span class="h-dt-withbtn"><span data-themebox>${themeSel(v('theme', 'parchemin'))}</span><button type="button" class="button small secondary" data-dt-cmd="newtheme" title="Créer un style (à partir de celui choisi)">＋</button><button type="button" class="button small secondary" data-dt-cmd="themes" title="Mes styles ; ranger, montrer ou cacher">⚙️</button></span></label>
                    <label>Couleurs${sel('colors', [['branch', 'Côté paternel / maternel'], ['gender', 'Hommes / femmes'], ['generation', 'Dégradé par génération'], ['none', 'Une seule couleur']], v('colors', 'branch'))}</label>
                    <label>Noms${sel('layoutNames', [['two', 'Prénom, puis NOM dessous'], ['one', 'Prénom NOM sur une ligne']], v('layoutNames', 'two'))}</label></div>
                <fieldset class="h-dt-checks"><legend>Dans les cases</legend>${chk('dates', 'Années', v('dates', true))}${chk('fullDates', 'Dates complètes', v('fullDates', false))}${chk('places', 'Lieu de naissance', v('places', false))}${chk('jobs', 'Métier', v('jobs', false))}${chk('sosa', 'Numéro Sosa', v('sosa', false))}${chk('empty', 'Cases vides (ancêtres à trouver)', v('empty', true))}</fieldset>
                <fieldset class="h-dt-checks"><legend>Habillage</legend>${chk('photos', 'Portraits (arbre dessiné)', v('photos', false))}${chk('leaves', 'Feuillage (arbre dessiné)', v('leaves', true))}${chk('frame', 'Cadre et ornements', v('frame', true))}${chk('genLabels', 'Noms des générations', v('genLabels', true))}</fieldset>
                <div class="form-grid"><label>Titre<input name="title" maxlength="120" value="${esc(v('title', ''))}" placeholder="Arbre de la famille …"></label><label>Sous-titre<input name="subtitle" maxlength="160" value="${esc(v('subtitle', ''))}" placeholder="Établi par … en ${new Date().getFullYear()}"></label>
                    <label>Place du titre${sel('titlePos', [['bottom', 'En bas'], ['top', 'En haut']], v('titlePos', 'bottom'))}</label></div></div>`,
            onOpen: dg => {
                const hid = dg.querySelector('input[type=hidden][name=person]'), inp = dg.querySelector('[data-cp-input="person"]');
                dg.addEventListener('cp-pick', e => { chosenName = e.detail.name; });
                if (cur) { hid.value = cur; api('person', {id: cur}).then(r => { const p = r.person || r, n = A().personName(p); if (n && !inp.value) { inp.value = n; chosenName = n; } const tt = dg.querySelector('[name=title]'); if (!tt.value && p.last_name) tt.placeholder = `Arbre de la famille ${p.last_name}`; }).catch(() => {}); }
                // le nombre de générations suit la forme choisie
                const setShape = k => { dg.querySelector('input[name=shape]').value = k; dg.querySelectorAll('[data-dt-shape]').forEach(b => { b.classList.toggle('is-on', b.dataset.dtShape === k); b.setAttribute('aria-pressed', b.dataset.dtShape === k); });
                    const g = dg.querySelector('[name=gens]'), cur2 = Number(g.value), opts = gensOpts(k); g.innerHTML = opts.map(([n, l]) => `<option value="${n}" ${Math.min(cur2, opts.at(-1)[0]) === n ? 'selected' : ''}>${l}</option>`).join(''); };
                dg.querySelector('[type=submit]')?.setAttribute('data-dt-cmd', 'make');
                ext.tbApply?.(dg, 'decortree'); ext.editorKeysAttach?.(dg, 'decortree'); // formes et boutons rangés à sa façon, raccourcis à soi
                const refill = () => { const f = dg.querySelector('[name=format]').value, t = dg.querySelector('[name=theme]').value; dg.querySelector('[data-fmtbox]').innerHTML = sel('format', fmtOpts(f), f); dg.querySelector('[data-themebox]').innerHTML = themeSel(t); };
                dg.addEventListener('click', async e => { const b = e.target.closest('button'); if (!b) return; const c = b.dataset.dtCmd;
                    if (b.dataset.dtShape) return setShape(b.dataset.dtShape);
                    if (c === 'reset') { if (!await A().confirmBox('Forme, format, style, cases… reviennent comme au départ.', {title: 'Revenir aux réglages de départ de l’arbre ?', okLabel: 'Réinitialiser'})) return; try { localStorage.removeItem(PREF); } catch (_) {} dg.close(); setTimeout(() => openMaker(onDone), 50); return; }
                    if (c === 'fmts') manageList({key: FKEY, title: '⚙️ Les formats', intro: 'Coche ceux qu’on voit dans la liste, range-les avec ↑ ↓, et crée les tiens (en cm).', all: () => formats().map(f => [f[0], f[1], f[4]]), addLabel: '＋ Un format à moi',
                        onAdd: () => editFormat(null), onEdit: id => editFormat(id), onDelete: id => { const p2 = readJ(FKEY, {}); p2.custom = (p2.custom || []).filter(x => x.id !== id); writeJ(FKEY, p2); }, onDone: refill});
                    if (c === 'themes') manageList({key: SKEY, title: '🎨 Les styles', intro: 'Coche ceux qu’on voit dans la liste, range-les avec ↑ ↓ ; crée les tiens (couleurs, police, cadre), modifie-les ou supprime-les.', all: () => themes().map(([k, t, mine]) => [k, t.label, mine]), addLabel: '＋ Créer un style',
                        onAdd: () => editTheme(null, dg.querySelector('[name=theme]').value), onEdit: id => editTheme(id), onDelete: id => { const p2 = readJ(SKEY, {}); delete (p2.custom || {})[id]; writeJ(SKEY, p2); }, onDone: refill});
                    if (c === 'newtheme') { const k = await editTheme(null, dg.querySelector('[name=theme]').value); if (k) { refill(); dg.querySelector('[name=theme]').value = k; } }
                });
            },
            onSubmit: async f => {
                const chosen = Number(f.querySelector('input[type=hidden][name=person]')?.value) || 0;
                if (!chosen) { toast('Choisis une personne dans la liste.', 'error'); return false; }
                const o = {person: chosen}; ['gens', 'format', 'orient', 'theme', 'colors', 'layoutNames', 'title', 'subtitle', 'titlePos'].forEach(k => { const el = f.querySelector(`[name=${k}]:checked`) || f.querySelector(`[name=${k}]`); o[k] = el?.value ?? ''; });
                o.shape = f.querySelector('input[name=shape]').value; o.gens = clamp(Number(o.gens) || 5, 2, SHAPES.find(x => x[0] === o.shape)?.[3] || 10); ['dates', 'fullDates', 'places', 'jobs', 'sosa', 'empty', 'photos', 'leaves', 'frame', 'genLabels'].forEach(k => { o[k] = !!f.querySelector(`[name=${k}]`)?.checked; });
                writeJ(PREF, {...o, person: undefined});
                toast('Fabrication de l’arbre…');
                try { const doc = await build(o); if (!doc.count) { toast('Aucun ancêtre trouvé.', 'error'); return false; } delete doc.count;
                    ext.openVectorEditor({doc, name: o.title || `Arbre — ${chosenName || f.querySelector('[data-cp-input="person"]')?.value || 'famille'}`, onSaved: onDone, onClose: onDone}); }
                catch (e) { toast(e.message, 'error'); return false; }
            }});
    }
    ext.openDecorTree = openMaker;
    ext.decorTreeInternals = {build, bySosa, THEMES, FORMATS, SHAPES, formats, themes};
    /* Maintenance → Montage, retouche, mise en page et son : les réglages de l'arbre décoratif */
    ext.decorTreePrefs = {
        html: () => { const sv = readJ(PREF, {}), o = (list, cur2) => list.map(([k, l]) => `<option value="${esc(k)}" ${String(cur2) === String(k) ? 'selected' : ''}>${esc(l)}</option>`).join('');
            return `<div class="form-grid h-mtp-grid"><label>Forme au départ<select data-dtp="shape">${o(SHAPES.map(x => [x[0], x[1]]), sv.shape || 'fan180')}</select></label><label>Générations<select data-dtp="gens">${o(Array.from({length: 11}, (_, i) => [i + 2, `${i + 2} générations`]), sv.gens || 5)}</select></label>
                <label>Format<select data-dtp="format">${o(formats(true).map(f => [f[0], f[1]]), sv.format || 'a3')}</select></label><label>Style<select data-dtp="theme">${o(themes(true).map(([k, t]) => [k, t.label]), sv.theme || 'parchemin')}</select></label>
                <label>Couleurs<select data-dtp="colors">${o([['branch', 'Côté paternel / maternel'], ['gender', 'Hommes / femmes'], ['generation', 'Dégradé par génération'], ['none', 'Une seule couleur']], sv.colors || 'branch')}</select></label><label>Place du titre<select data-dtp="titlePos">${o([['bottom', 'En bas'], ['top', 'En haut']], sv.titlePos || 'bottom')}</select></label></div>
                <div class="h-mtp-row"><button type="button" class="button small secondary" data-dtp-cmd="fmts">⚙️ Les formats (à moi, montrés, rangés)</button><button type="button" class="button small secondary" data-dtp-cmd="themes">🎨 Les styles (à moi, montrés, rangés)</button><button type="button" class="button small secondary" data-dtp-cmd="reset">↺ Réglages de départ</button></div>`; },
        bind: (box, redraw) => {
            box.addEventListener('change', e => { const k = e.target.dataset.dtp; if (!k) return; const sv = readJ(PREF, {}); sv[k] = k === 'gens' ? Number(e.target.value) : e.target.value; if (k === 'shape' || k === 'gens') sv.gens = Math.min(sv.gens || 5, SHAPES.find(x => x[0] === sv.shape)?.[3] || 10); writeJ(PREF, sv); toast('Enregistré.'); });
            box.addEventListener('click', e => { const c = e.target.closest('[data-dtp-cmd]')?.dataset.dtpCmd; if (!c) return;
                if (c === 'reset') { try { localStorage.removeItem(PREF); } catch (_) {} redraw(); toast('Réglages de départ.'); }
                if (c === 'fmts') manageList({key: FKEY, title: '⚙️ Les formats', intro: 'Coche ceux qu’on voit dans la liste, range-les avec ↑ ↓, et crée les tiens (en cm).', all: () => formats().map(f => [f[0], f[1], f[4]]), addLabel: '＋ Un format à moi', onAdd: () => editFormat(null), onEdit: id => editFormat(id), onDelete: id => { const p2 = readJ(FKEY, {}); p2.custom = (p2.custom || []).filter(x => x.id !== id); writeJ(FKEY, p2); }, onDone: redraw});
                if (c === 'themes') manageList({key: SKEY, title: '🎨 Les styles', intro: 'Coche ceux qu’on voit dans la liste, range-les avec ↑ ↓ ; crée les tiens, modifie-les ou supprime-les.', all: () => themes().map(([k, t, mine]) => [k, t.label, mine]), addLabel: '＋ Créer un style', onAdd: () => editTheme(null, 'parchemin'), onEdit: id => editTheme(id), onDelete: id => { const p2 = readJ(SKEY, {}); delete (p2.custom || {})[id]; writeJ(SKEY, p2); }, onDone: redraw}); });
        },
    };

    // Listes → Outils de modification : l'onglet des arbres décoratifs (des dessins vectoriels marqués « tree »)
    ext.editToolsExtra = ext.editToolsExtra || [];
    ext.editToolsExtra.push({key: 'decortree', icon: '🌳', label: 'Arbre décoratif', what: 'arbre',
        load: async () => ((await api('vector_docs')).docs || []).filter(d => d.kind === 'tree').map(d => ({id: d.id, name: d.name, date: d.updated_at, thumb: d.thumb ? `<img src="${esc(d.thumb)}" alt="">` : '<span class="h-et-ico">🌳</span>', info: `${d.objects} calque${d.objects > 1 ? 's' : ''}`})),
        open: (id, again) => ext.openVectorEditor?.({id, onSaved: again, onClose: again}),
        create: again => openMaker(again),
        rename: (id, name) => api('rename_vector_doc', {}, {method: 'POST', body: {id, name}}),
        remove: id => api('delete_vector_doc', {}, {method: 'POST', body: {id}}), createLabel: '＋ Nouvel arbre décoratif'});
})();
