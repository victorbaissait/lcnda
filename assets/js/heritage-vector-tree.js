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
        classique: {label: 'Classique', paper: '#ffffff', ink: '#2b2b2b', font: 'Georgia', pat: ['#cfe0f3', '#b8d0ec'], mat: ['#f6d3dc', '#efbecc'], center: '#f4e7b0', empty: '#f6f6f6', trunk: '#7a5634', leaf: ['#6f9c4a', '#86b35c', '#5d8a3b'], title: '#1d3557', frame: true},
        botanique: {label: 'Botanique (vert)', paper: '#f7f5ec', ink: '#2f3b26', font: 'Garamond', pat: ['#cfe3c0', '#bad6a5'], mat: ['#e8eec8', '#d8e3b1'], center: '#f1e6b8', empty: '#f3f3ea', trunk: '#5c4127', leaf: ['#5f8a3a', '#78a24c', '#4c7430', '#9bbb5e'], title: '#2f4a1c', frame: false},
        heraldique: {label: 'Héraldique (azur, gueules et or)', paper: '#f8f1dc', ink: '#1c2a4a', font: 'Times New Roman', pat: ['#2c4f8f', '#3a62a8'], mat: ['#a83232', '#bf4646'], center: '#e3bb4a', empty: '#ece4cc', trunk: '#5a4630', leaf: ['#3f6b3a', '#56844e'], title: '#1c2a4a', frame: true},
        moderne: {label: 'Moderne (pastel)', paper: '#ffffff', ink: '#222222', font: 'Helvetica', pat: ['#a9cdee', '#c4ddf3'], mat: ['#f4b2c2', '#f8cad5'], center: '#ffd57a', empty: '#f4f4f4', trunk: '#8a8a8a', leaf: ['#8bc34a', '#a5d16a'], title: '#222222', frame: false},
        nb: {label: 'Noir et blanc (à imprimer)', paper: '#ffffff', ink: '#111111', font: 'Georgia', pat: ['#ffffff', '#f1f1f1'], mat: ['#ffffff', '#f1f1f1'], center: '#ffffff', empty: '#ffffff', trunk: '#333333', leaf: ['#9a9a9a', '#bdbdbd'], title: '#111111', frame: true},
    };
    // formats en pixels (96 points par pouce), en portrait
    const FORMATS = [['a4', 'A4 (21 × 29,7 cm)', 794, 1123], ['a3', 'A3 (29,7 × 42 cm)', 1123, 1587], ['a2', 'A2 (42 × 59,4 cm)', 1587, 2245], ['a1', 'A1 (59,4 × 84,1 cm)', 2245, 3179], ['a0', 'A0 (84,1 × 118,9 cm)', 3179, 4494],
        ['p50', 'Affiche 50 × 70 cm', 1890, 2646], ['p70', 'Affiche 70 × 100 cm', 2646, 3780], ['sq', 'Carré 60 × 60 cm', 2268, 2268]];
    const SHAPES = [['fan180', 'Éventail (demi-cercle)', 'land'], ['fan240', 'Éventail ouvert (240°)', 'land'], ['wheel', 'Roue (cercle complet)', 'port'], ['tree', 'Arbre dessiné (tronc et branches)', 'port']];

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
        const walk = (node, s) => { if (!node || s > 4096) return; map.set(s, node.person); const kids = [...(node.children || [])].sort((a, b) => (a.person?.gender === 'female') - (b.person?.gender === 'female')); kids.forEach(k => walk(k, k.person?.gender === 'female' ? 2 * s + 1 : 2 * s)); };
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
        const G = o.gens, span = o.shape === 'fan180' ? 180 : o.shape === 'fan240' ? 240 : 360, m = Math.min(W, H) * .045;
        const top = o.titlePos === 'top' ? band : 0, bottom = o.titlePos === 'bottom' ? band : 0;
        // le rayon le plus grand qui tient dans la page
        const usableH = H - 2 * m - top - bottom, usableW = W - 2 * m;
        const R = span === 180 ? Math.min(usableW / 2, usableH * .97) : span === 240 ? Math.min(usableW / 2, usableH / 1.5) : Math.min(usableW, usableH) / 2;
        const cx = W / 2, cy = span === 180 ? H - m - bottom - R * .03 : span === 240 ? m + top + R : m + top + usableH / 2;
        // anneaux : plus larges pour les générations lointaines (le texte y est écrit dans le sens du rayon)
        const weights = Array.from({length: G}, (_, i) => i < 3 ? 1 : 1 + (i - 2) * .22), r0 = R * (G <= 4 ? .2 : G <= 6 ? .14 : .1), tot = weights.reduce((a, b) => a + b, 0);
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
        if (o.genLabels && span !== 360) for (let g = 1; g <= G; g++) { const rm = (radii[g - 1] + radii[g]) / 2, a = (start - 3 - 90) * Math.PI / 180, x = cx + rm * Math.cos(a), y = cy + rm * Math.sin(a); labels.push({id: uid(), type: 'text', name: `Génération ${g + 1}`, text: g === 1 ? 'Parents' : g === 2 ? 'Grands-parents' : `${g + 1}ᵉ gén.`, x: n2(x), y: n2(y), size: n2(11 * unit * 1.4), font: T.font, align: 'middle', fill: T.ink, sw: 0, italic: true, op: .75, rot: n2(start + 90)}); } // le long du bord gauche, lisible
        return {groups, labels, box: {cx, cy, R}};
    }

    /* ═════════ Arbre dessiné : tronc, branches, médaillons, feuillage ═════════ */
    function buildTree(people, o, T, W, H, band) {
        const G = Math.min(o.gens, 7), m = Math.min(W, H) * .05, unit = Math.min(W, H) / 1000, top = o.titlePos === 'top' ? band : 0, bottom = o.titlePos === 'bottom' ? band : 0;
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
        const T = THEMES[o.theme] || THEMES.classique, fmt = FORMATS.find(f => f[0] === o.format) || FORMATS[1], land = o.orient === 'land' || (o.orient === 'auto' && SHAPES.find(s => s[0] === o.shape)?.[2] === 'land');
        const W = land ? fmt[3] : fmt[2], H = land ? fmt[2] : fmt[3], band = (o.title || o.subtitle) ? Math.min(W, H) * .11 : 0;
        const r = await api('tree', {id: o.person, mode: 'ancestors', depth: Math.min(o.gens, o.shape === 'tree' ? 7 : 10), places: 1});
        if (!r.tree) throw new Error('Aucune ascendance pour cette personne.');
        const people = bySosa(r.tree);
        if (o.photos) { let n = 0; for (const [s, p] of people) { if (n >= 40 || genOf(s) > 4) continue; if (p?.portrait) { p.portraitData = await portraitData(p.portrait); n++; } } }
        const built = o.shape === 'tree' ? buildTree(people, o, T, W, H, band) : buildFan(people, o, T, W, H, band), d = decor(o, T, W, H, band);
        const layer = (name, children) => ({id: uid(), type: 'group', layer: true, name, children});
        const objs = [layer('Cadre et ornements', d.frame), ...(built.branches ? [layer('Tronc et branches', built.branches)] : []), ...(built.leaves?.length ? [layer('Feuillage', built.leaves)] : []), layer('Ancêtres', built.groups), ...(built.labels.length ? [layer('Générations', built.labels)] : []), layer('Titre', d.titles)];
        return {w: W, h: H, bg: T.paper, grid: 0, snap: false, kind: 'tree', objs, count: [...people.values()].filter(Boolean).length};
    }

    const PREF = 'lcnda-decor-tree';
    function openMaker(onDone) {
        const S = A().state, cur = Number(S.currentPersonId) || Number(S.bootstrap?.startPersonId) || 0;
        let saved = {}; try { saved = JSON.parse(localStorage.getItem(PREF) || '{}') || {}; } catch (_) {}
        const v = (k, d) => saved[k] ?? d, sel = (name, list, cur2) => `<select name="${name}">${list.map(([k, l]) => `<option value="${k}" ${String(cur2) === String(k) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
        const chk = (name, label, on) => `<label class="checkbox-line"><input type="checkbox" name="${name}" ${on ? 'checked' : ''}> ${label}</label>`;
        let chosen = cur, chosenName = '';
        ext.openDialog({eyebrow: 'ARBRE DÉCORATIF', title: '🌳 Un arbre à imprimer en grand', submitLabel: 'Fabriquer l’arbre',
            body: `<div class="h-dt-form"><p class="muted">L’arbre est fabriqué comme un dessin : il s’ouvre ensuite dans l’outil de dessin vectoriel pour changer les couleurs, les polices, les textes, ajouter des ornements, un blason… puis l’exporter en PDF ou en image, à la taille voulue.</p>
                <label>Personne au centre (ou au pied de l’arbre)<input type="search" data-dt-q placeholder="Nom, prénom…" autocomplete="off"></label><div data-dt-res class="h-dt-res"></div><p class="h-dt-who" data-dt-who>${cur ? 'La personne affichée en ce moment' : 'Choisis une personne'}</p>
                <div class="h-dt-shapes">${SHAPES.map(([k, l]) => `<label class="h-dt-shape"><input type="radio" name="shape" value="${k}" ${v('shape', 'fan180') === k ? 'checked' : ''}><span>${{fan180: '◠', fan240: '◔', wheel: '◉', tree: '🌳'}[k]}</span><small>${esc(l)}</small></label>`).join('')}</div>
                <div class="form-grid"><label>Générations${sel('gens', [2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => [n, `${n} générations${n > 7 ? ' (éventail, roue)' : ''}`]), v('gens', 5))}</label>
                    <label>Format${sel('format', FORMATS.map(f => [f[0], f[1]]), v('format', 'a3'))}</label>
                    <label>Sens${sel('orient', [['auto', 'Selon la forme'], ['land', 'Paysage'], ['port', 'Portrait']], v('orient', 'auto'))}</label>
                    <label>Style${sel('theme', Object.entries(THEMES).map(([k, t]) => [k, t.label]), v('theme', 'parchemin'))}</label>
                    <label>Couleurs${sel('colors', [['branch', 'Côté paternel / maternel'], ['gender', 'Hommes / femmes'], ['generation', 'Dégradé par génération'], ['none', 'Une seule couleur']], v('colors', 'branch'))}</label>
                    <label>Noms${sel('layoutNames', [['two', 'Prénom, puis NOM dessous'], ['one', 'Prénom NOM sur une ligne']], v('layoutNames', 'two'))}</label></div>
                <div class="h-dt-checks">${chk('dates', 'Années', v('dates', true))}${chk('fullDates', 'Dates complètes', v('fullDates', false))}${chk('places', 'Lieu de naissance', v('places', false))}${chk('jobs', 'Métier', v('jobs', false))}${chk('sosa', 'Numéro Sosa', v('sosa', false))}${chk('empty', 'Cases vides (ancêtres à trouver)', v('empty', true))}${chk('photos', 'Portraits (arbre dessiné)', v('photos', false))}${chk('leaves', 'Feuillage (arbre dessiné)', v('leaves', true))}${chk('frame', 'Cadre et ornements', v('frame', true))}${chk('genLabels', 'Noms des générations (éventail)', v('genLabels', true))}</div>
                <div class="form-grid"><label>Titre<input name="title" maxlength="120" value="${esc(v('title', ''))}" placeholder="Arbre de la famille …"></label><label>Sous-titre<input name="subtitle" maxlength="160" value="${esc(v('subtitle', ''))}" placeholder="Établi par … en ${new Date().getFullYear()}"></label>
                    <label>Place du titre${sel('titlePos', [['bottom', 'En bas'], ['top', 'En haut']], v('titlePos', 'bottom'))}</label></div></div>`,
            onOpen: dg => { const q = dg.querySelector('[data-dt-q]'), res = dg.querySelector('[data-dt-res]'); let t = 0;
                q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(async () => { const rows = (await api('search', {type: 'persons', q: q.value.trim(), limit: 10}).catch(() => ({data: []}))).data || [];
                    res.innerHTML = rows.map(p => `<button type="button" class="link-button" data-dt-pick="${Number(p.id)}">${esc(A().personName(p))}</button>`).join('') || '<small class="muted">Personne trouvée.</small>'; }, 220); });
                res.addEventListener('click', e => { const b = e.target.closest('[data-dt-pick]'); if (!b) return; chosen = Number(b.dataset.dtPick); chosenName = b.textContent; dg.querySelector('[data-dt-who]').textContent = `✓ ${chosenName}`; res.innerHTML = ''; q.value = ''; });
                if (cur) api('person', {id: cur}).then(r => { const p = r.person || r; const n = A().personName(p); if (n) { chosenName = n; dg.querySelector('[data-dt-who]').textContent = `✓ ${n}`; const tt = dg.querySelector('[name=title]'); if (!tt.value && p.last_name) tt.placeholder = `Arbre de la famille ${p.last_name}`; } }).catch(() => {}); },
            onSubmit: async f => {
                if (!chosen) { toast('Choisis une personne.', 'error'); return false; }
                const o = {person: chosen}; ['shape', 'gens', 'format', 'orient', 'theme', 'colors', 'layoutNames', 'title', 'subtitle', 'titlePos'].forEach(k => { const el = f.querySelector(`[name=${k}]:checked`) || f.querySelector(`[name=${k}]`); o[k] = el?.value ?? ''; });
                o.gens = clamp(Number(o.gens) || 5, 2, 10); ['dates', 'fullDates', 'places', 'jobs', 'sosa', 'empty', 'photos', 'leaves', 'frame', 'genLabels'].forEach(k => { o[k] = !!f.querySelector(`[name=${k}]`)?.checked; });
                try { localStorage.setItem(PREF, JSON.stringify({...o, person: undefined})); } catch (_) {}
                toast('Fabrication de l’arbre…');
                try { const doc = await build(o); if (!doc.count) { toast('Aucun ancêtre trouvé.', 'error'); return false; } delete doc.count;
                    ext.openVectorEditor({doc, name: o.title || `Arbre — ${chosenName || 'famille'}`, onSaved: onDone, onClose: onDone}); }
                catch (e) { toast(e.message, 'error'); return false; }
            }});
    }
    ext.openDecorTree = openMaker;
    ext.decorTreeInternals = {build, bySosa, THEMES, FORMATS, SHAPES};

    // Listes → Outils de modification : l'onglet des arbres décoratifs (des dessins vectoriels marqués « tree »)
    ext.editToolsExtra = ext.editToolsExtra || [];
    ext.editToolsExtra.push({key: 'decortree', icon: '🌳', label: 'Arbre décoratif', what: 'arbre',
        load: async () => ((await api('vector_docs')).docs || []).filter(d => d.kind === 'tree').map(d => ({id: d.id, name: d.name, date: d.updated_at, thumb: d.thumb ? `<img src="${esc(d.thumb)}" alt="">` : '<span class="h-et-ico">🌳</span>', info: `${d.objects} calque${d.objects > 1 ? 's' : ''}`})),
        open: (id, again) => ext.openVectorEditor?.({id, onSaved: again, onClose: again}),
        create: again => openMaker(again),
        rename: (id, name) => api('rename_vector_doc', {}, {method: 'POST', body: {id, name}}),
        remove: id => api('delete_vector_doc', {}, {method: 'POST', body: {id}}), createLabel: '＋ Nouvel arbre décoratif'});
})();
