/* LCNDA — 📰 Faire-part et affiches : naissance, baptême, mariage, décès, cousinade, noces, avis de presse, invitation ;
 * des styles d'époque (Belle Époque, Art nouveau, Art déco, années 50, classique, moderne, deuil). Les textes se remplissent
 * depuis une fiche (noms, dates, lieux, parents), se corrigent avant, puis le faire-part s'ouvre dans le dessin vectoriel
 * pour tout retoucher, et s'imprime ou s'exporte. Listes → Outils de modification → « 📰 Faire-part et affiches ».
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const api = (...a) => A().api(...a);
    const toast = (...a) => A().toast(...a);
    const n2 = v => Math.round((Number(v) || 0) * 100) / 100;
    let seq = 0; const uid = () => 'c' + Date.now().toString(36) + (++seq).toString(36);

    // formats : en centimètres pour le papier, en pixels pour l'écran (96 ppp) ; « Personnalisé » prend la taille qu'on tape
    const CM = c => Math.round(c / 2.54 * 96);
    const FORMATS = [
        ...[['c10', 'Carte 10 × 15 cm', 10, 15], ['a6', 'A6 (10,5 × 14,8 cm)', 10.5, 14.8], ['c12', 'Carte 12 × 17 cm', 12, 17], ['c13', 'Carte 13 × 18 cm', 13, 18], ['c15', 'Carte 15 × 21 cm', 15, 21], ['a5', 'A5 (14,8 × 21 cm)', 14.8, 21], ['c16', 'Carte 16 × 22 cm', 16, 22]].map(f => [...f, 'Cartes']),
        ...[['q12', 'Carré 12 × 12 cm', 12, 12], ['sq', 'Carré 14 × 14 cm', 14, 14], ['q15', 'Carré 15 × 15 cm', 15, 15], ['q17', 'Carré 17 × 17 cm', 17, 17], ['q21', 'Carré 21 × 21 cm', 21, 21]].map(f => [...f, 'Carrés']),
        ...[['dl', 'Allongé DL 10 × 21 cm', 10, 21], ['l11', 'Allongé 11 × 22 cm', 11, 22], ['menu', 'Menu 10 × 25 cm', 10, 25], ['mp', 'Marque-page 5 × 15 cm', 5, 15], ['bd', 'Bandeau 21 × 7 cm (marque-place, ruban)', 21, 7]].map(f => [...f, 'Allongés']),
        ...[['a4', 'Affiche A4 (21 × 29,7 cm)', 21, 29.7], ['a3', 'Affiche A3 (29,7 × 42 cm)', 29.7, 42], ['p40', 'Affiche 40 × 60 cm', 40, 60], ['a2', 'Affiche A2 (42 × 59,4 cm)', 42, 59.4], ['p50', 'Affiche 50 × 70 cm', 50, 70], ['a1', 'Affiche A1 (59,4 × 84,1 cm)', 59.4, 84.1], ['p60', 'Affiche 60 × 80 cm', 60, 80]].map(f => [...f, 'Affiches']),
    ].map(([k, l, w, h, g]) => [k, l, CM(w), CM(h), g]).concat([['ig', 'Carré (1080 × 1080 px)', 1080, 1080, 'Écran et réseaux'], ['st', 'Story, portable (1080 × 1920 px)', 1080, 1920, 'Écran et réseaux'], ['fb', 'Publication large (1200 × 630 px)', 1200, 630, 'Écran et réseaux'], ['ml', 'Courriel (600 × 800 px)', 600, 800, 'Écran et réseaux'], ['tv', 'Écran 16:9 (1920 × 1080 px)', 1920, 1080, 'Écran et réseaux']]);
    const formatOptions = sel => [...new Set(FORMATS.map(f => f[4]))].map(g => `<optgroup label="${esc(g)}">${FORMATS.filter(f => f[4] === g).map(f => `<option value="${f[0]}" ${f[0] === sel ? 'selected' : ''}>${esc(f[1])}</option>`).join('')}</optgroup>`).join('') + `<option value="custom" ${sel === 'custom' ? 'selected' : ''}>✎ Personnalisé (en cm)…</option>`;
    const STYLES = {
        belle: {label: 'Belle Époque (1900)', paper: '#f7f0df', ink: '#3b2a1a', accent: '#8a6a2a', script: '"Snell Roundhand", "Apple Chancery", "Brush Script MT", cursive', serif: 'Didot, "Bodoni 72", Georgia, serif', frame: 'belle'},
        nouveau: {label: 'Art nouveau (1900)', paper: '#f1ecd6', ink: '#2f3b26', accent: '#6f8f4e', script: '"Apple Chancery", "Brush Script MT", cursive', serif: '"Palatino Linotype", Palatino, Georgia, serif', frame: 'nouveau'},
        deco: {label: 'Art déco (1925)', paper: '#14181f', ink: '#e8d9a8', accent: '#c9a25a', script: 'Didot, Georgia, serif', serif: '"Futura", "Gill Sans", "Trebuchet MS", sans-serif', frame: 'deco'},
        annees50: {label: 'Années 50', paper: '#fbf3e4', ink: '#2c4a5a', accent: '#d9705a', script: '"Brush Script MT", cursive', serif: '"Futura", "Trebuchet MS", sans-serif', frame: 'retro'},
        classique: {label: 'Classique', paper: '#ffffff', ink: '#1f2a44', accent: '#a88a4a', script: '"Snell Roundhand", "Brush Script MT", cursive', serif: 'Georgia, "Times New Roman", serif', frame: 'classique'},
        moderne: {label: 'Moderne épuré', paper: '#ffffff', ink: '#222222', accent: '#9aa5b1', script: '"Helvetica Neue", Arial, sans-serif', serif: '"Helvetica Neue", Arial, sans-serif', frame: 'moderne'},
        deuil: {label: 'Deuil (bordure noire)', paper: '#ffffff', ink: '#111111', accent: '#111111', script: '"Snell Roundhand", Georgia, serif', serif: 'Georgia, "Times New Roman", serif', frame: 'deuil'},
    };
    // les modèles : les champs à remplir et la mise en page (du haut vers le bas)
    const KINDS = {
        naissance: {label: '👶 Naissance', style: 'classique', fields: [['intro', 'Phrase d’ouverture', 'Nous avons la joie de vous annoncer la naissance de'], ['name', 'Prénom (grand)', ''], ['date', 'Date et lieu', ''], ['detail', 'Poids, taille…', ''], ['family', 'Parents, frères et sœurs', '']]},
        bapteme: {label: '🕊️ Baptême', style: 'nouveau', fields: [['name', 'Prénom (grand)', ''], ['intro', 'Phrase d’ouverture', 'sera baptisé'], ['date', 'Date, heure et église', ''], ['detail', 'Parrain et marraine', ''], ['family', 'Invitation', 'La cérémonie sera suivie d’un repas en famille']]},
        mariage: {label: '💍 Mariage', style: 'belle', fields: [['intro', 'Phrase d’ouverture', 'ont la joie de vous faire part de leur mariage'], ['name', 'Les mariés (grand)', ''], ['date', 'Date et lieu', ''], ['detail', 'Cérémonie, réception', ''], ['family', 'Les parents', '']]},
        deces: {label: '🕯️ Décès', style: 'deuil', fields: [['intro', 'Phrase d’ouverture', 'ont la douleur de vous faire part du décès de'], ['name', 'Nom (grand)', ''], ['date', 'Survenu le…', ''], ['detail', 'Obsèques', ''], ['family', 'De la part de', '']]},
        cousinade: {label: '🌳 Cousinade', style: 'annees50', fields: [['intro', 'Titre', 'Grande cousinade'], ['name', 'La famille (grand)', ''], ['date', 'Date et lieu', ''], ['detail', 'Descendants de…', ''], ['family', 'Inscriptions, contact', '']]},
        noces: {label: '🥂 Noces (anniversaire de mariage)', style: 'deco', fields: [['intro', 'Titre', 'Noces d’or'], ['name', 'Les époux (grand)', ''], ['date', 'Date et lieu de la fête', ''], ['detail', 'Mariés le…', ''], ['family', 'Enfants et petits-enfants', '']]},
        presse: {label: '📰 Avis dans le journal', style: 'classique', fields: [['intro', 'Ville', ''], ['name', 'Nom', ''], ['date', 'Texte de l’avis', ''], ['detail', 'Cérémonie', ''], ['family', 'De la part de', '']]},
        invitation: {label: '✉️ Invitation, menu', style: 'classique', fields: [['intro', 'Titre', 'Vous êtes invités'], ['name', 'L’occasion (grand)', ''], ['date', 'Date, heure, lieu', ''], ['detail', 'Menu, programme', ''], ['family', 'Réponse souhaitée', '']]},
    };

    /* ═════════ Ornements ═════════ */
    const P = (d, o = {}) => ({id: uid(), type: 'svgpath', name: o.name || 'Ornement', d, fill: o.fill || 'none', stroke: o.stroke || 'none', sw: n2(o.sw || 0), cap: 'round', join: 'round', ...(o.op ? {op: o.op} : {})});
    const R = (x, y, w, h, o = {}) => ({id: uid(), type: 'rect', name: o.name || 'Cadre', x: n2(x), y: n2(y), w: n2(w), h: n2(h), r: o.r || 0, fill: o.fill || 'none', stroke: o.stroke || 'none', sw: n2(o.sw || 0)});
    const curl = (x, y, s, sx, sy) => `M${n2(x)} ${n2(y + sy * s)}C${n2(x)} ${n2(y + sy * s * .35)} ${n2(x + sx * s * .35)} ${n2(y)} ${n2(x + sx * s)} ${n2(y)}M${n2(x + sx * s * .18)} ${n2(y + sy * s * .5)}c${n2(sx * s * .12)} ${n2(-sy * s * .28)} ${n2(sx * s * .3)} ${n2(-sy * s * .3)} ${n2(sx * s * .42)} ${n2(-sy * s * .2)}`;
    function frame(st, W, H) {
        const u = Math.min(W, H) / 400, m = 16 * u, out = [], k = STYLES[st].frame, ink = STYLES[st].ink, ac = STYLES[st].accent;
        if (k === 'deuil') { out.push(R(m * .6, m * .6, W - m * 1.2, H - m * 1.2, {stroke: '#111', sw: 9 * u})); out.push(R(m * 1.4, m * 1.4, W - m * 2.8, H - m * 2.8, {stroke: '#111', sw: 1.2 * u})); }
        else if (k === 'classique' || k === 'belle') { out.push(R(m, m, W - 2 * m, H - 2 * m, {stroke: ac, sw: 2 * u})); out.push(R(m + 5 * u, m + 5 * u, W - 2 * m - 10 * u, H - 2 * m - 10 * u, {stroke: ac, sw: .8 * u}));
            if (k === 'belle') [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]].forEach(([x, y, sx, sy]) => out.push(P(curl(x + sx * 8 * u, y + sy * 8 * u, 46 * u, sx, sy), {stroke: ac, sw: 1.6 * u, name: 'Volute'}))); }
        else if (k === 'nouveau') { // des tiges courbes qui montent sur les côtés, une fleur en haut
            [-1, 1].forEach(s => { const x = s < 0 ? m * 1.5 : W - m * 1.5; out.push(P(`M${n2(x)} ${n2(H - m)}C${n2(x + s * -28 * u)} ${n2(H * .7)} ${n2(x + s * 30 * u)} ${n2(H * .45)} ${n2(x)} ${n2(H * .25)}S${n2(x + s * -20 * u)} ${n2(m * 2)} ${n2(W / 2 + s * -40 * u)} ${n2(m * 1.4)}`, {stroke: ac, sw: 2.2 * u, name: 'Tige'}));
                [0.35, 0.55, 0.75].forEach(t => out.push(P(`M${n2(x)} ${n2(H * t)}c${n2(s * -10 * u)} ${n2(-14 * u)} ${n2(s * -24 * u)} ${n2(-8 * u)} ${n2(s * -26 * u)} ${n2(4 * u)}c${n2(s * 10 * u)} ${n2(4 * u)} ${n2(s * 20 * u)} ${n2(2 * u)} ${n2(s * 26 * u)} ${n2(-4 * u)}Z`, {fill: ac, op: .6, name: 'Feuille'}))); });
            out.push({id: uid(), type: 'star', name: 'Fleur', x: n2(W / 2 - 14 * u), y: n2(m * .6), w: n2(28 * u), h: n2(28 * u), n: 6, inner: 45, fill: ac, stroke: 'none', sw: 0}); }
        else if (k === 'deco') { out.push(R(m, m, W - 2 * m, H - 2 * m, {stroke: ac, sw: 1.5 * u})); out.push(R(m + 8 * u, m + 8 * u, W - 2 * m - 16 * u, H - 2 * m - 16 * u, {stroke: ac, sw: .7 * u}));
            // l'éventail de rayons en haut, des gradins aux coins
            let d = ''; for (let i = 0; i <= 12; i++) { const a = Math.PI + i * Math.PI / 12; d += `M${n2(W / 2)} ${n2(m + 70 * u)}L${n2(W / 2 + Math.cos(a) * 60 * u)} ${n2(m + 70 * u + Math.sin(a) * 60 * u)}`; } out.push(P(d, {stroke: ac, sw: .9 * u, name: 'Soleil'}));
            [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]].forEach(([x, y, sx, sy]) => { let s = ''; for (let i = 1; i <= 3; i++) s += `M${n2(x + sx * 8 * u * i)} ${n2(y)}V${n2(y + sy * 8 * u * i)}H${n2(x)}`; out.push(P(s, {stroke: ac, sw: 1 * u, name: 'Gradins'})); }); }
        else if (k === 'retro') { out.push(R(m, m, W - 2 * m, H - 2 * m, {stroke: ac, sw: 3 * u, r: 14 * u})); for (let i = 0; i < 7; i++) out.push({id: uid(), type: 'ellipse', name: 'Pois', x: n2(m * 1.4 + i * (W - m * 2.8) / 6 - 4 * u), y: n2(H - m * 1.9), w: n2(8 * u), h: n2(8 * u), fill: i % 2 ? ac : ink, stroke: 'none', sw: 0}); }
        else if (k === 'moderne') out.push(R(m * 1.6, m * 1.6, W - m * 3.2, H - m * 3.2, {stroke: ac, sw: .8 * u}));
        return out;
    }
    const sep = (st, W, y, u) => { const ac = STYLES[st].accent; return [P(`M${n2(W / 2 - 70 * u)} ${n2(y)}H${n2(W / 2 - 8 * u)}M${n2(W / 2 + 8 * u)} ${n2(y)}H${n2(W / 2 + 70 * u)}`, {stroke: ac, sw: 1 * u, name: 'Filet'}), P(`M${n2(W / 2)} ${n2(y - 5 * u)}L${n2(W / 2 + 5 * u)} ${n2(y)}L${n2(W / 2)} ${n2(y + 5 * u)}L${n2(W / 2 - 5 * u)} ${n2(y)}Z`, {fill: ac, name: 'Losange'})]; };
    /* ═════════ ❦ Bibliothèque d'ornements anciens (pour le dessin vectoriel : onglet « Ornements ») ═════════
     * Des chemins SVG simples (droites, courbes de Bézier, arcs), chacun dans sa boîte (w × h) ; f = rempli, s = trait (épaisseur), op = transparence.
     * Le dessin les met à l'échelle et à la couleur choisie ; ensuite tout reste modifiable (Sélection directe, Couleur…). */
    const f2 = v => Math.round(v * 100) / 100;
    const circ = (cx, cy, r) => `M${f2(cx - r)} ${f2(cy)}A${f2(r)} ${f2(r)} 0 1 0 ${f2(cx + r)} ${f2(cy)}A${f2(r)} ${f2(r)} 0 1 0 ${f2(cx - r)} ${f2(cy)}Z`;
    const ell = (cx, cy, rx, ry) => `M${f2(cx - rx)} ${f2(cy)}A${f2(rx)} ${f2(ry)} 0 1 0 ${f2(cx + rx)} ${f2(cy)}A${f2(rx)} ${f2(ry)} 0 1 0 ${f2(cx - rx)} ${f2(cy)}Z`;
    /** une feuille en amande de (x1, y1) à (x2, y2), demi-largeur w */
    const leaf = (x1, y1, x2, y2, w) => { const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, L = Math.hypot(x2 - x1, y2 - y1) || 1, nx = -(y2 - y1) / L * w, ny = (x2 - x1) / L * w; return `M${f2(x1)} ${f2(y1)}Q${f2(mx + nx)} ${f2(my + ny)} ${f2(x2)} ${f2(y2)}Q${f2(mx - nx)} ${f2(my - ny)} ${f2(x1)} ${f2(y1)}Z`; };
    /** n pétales autour d'un centre */
    const petals = (cx, cy, n, r1, r2, w, a0 = -Math.PI / 2) => Array.from({length: n}, (_, i) => { const a = a0 + i * 2 * Math.PI / n; return leaf(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1, cx + Math.cos(a) * r2, cy + Math.sin(a) * r2, w); }).join('');
    /** une courbe lisse passant par des points (Catmull-Rom → Bézier) */
    const spline = (pts, closed = false) => { const n = pts.length; if (n < 2) return ''; const Pt = i => closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))];
        let d = `M${f2(pts[0][0])} ${f2(pts[0][1])}`; for (let i = 0; i < (closed ? n : n - 1); i++) { const p0 = Pt(i - 1), p1 = Pt(i), p2 = Pt(i + 1), p3 = Pt(i + 2);
            d += `C${f2(p1[0] + (p2[0] - p0[0]) / 6)} ${f2(p1[1] + (p2[1] - p0[1]) / 6)} ${f2(p2[0] - (p3[0] - p1[0]) / 6)} ${f2(p2[1] - (p3[1] - p1[1]) / 6)} ${f2(p2[0])} ${f2(p2[1])}`; } return d + (closed ? 'Z' : ''); };
    /** les points d'une volute (spirale qui se resserre) : départ à l'angle a0, sens dir (1 : aiguilles d'une montre) */
    const voluteP = (cx, cy, r, turns = 1.5, dir = 1, a0 = 0) => { const N = Math.round(turns * 8), out = []; for (let i = 0; i <= N; i++) { const t = i / N, a = a0 + dir * t * turns * 2 * Math.PI, rr = r * (1 - t * .78); out.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); } return out; };
    const volute = (...a) => spline(voluteP(...a));
    /** symétrie gauche-droite d'un chemin absolu (M L C Q H V Z) autour de x = cx */
    const mirror = (d, cx) => { let k = ''; return String(d).replace(/([MLCQHVZ])|(-?\d*\.?\d+)/gi, (m, c, nb) => { if (c) { k = c.toUpperCase(); mirror.i = 0; return c; } const v = Number(nb), i = mirror.i++; return String(f2(k === 'V' || (k !== 'H' && i % 2 === 1) ? v : 2 * cx - v)); }); };
    const both = (d, cx) => d + mirror(d, cx);
    /** symétrie haut-bas autour de y = cy */
    const mirrorY = (d, cy) => { let k = ''; return String(d).replace(/([MLCQHVZ])|(-?\d*\.?\d+)/gi, (m, c, nb) => { if (c) { k = c.toUpperCase(); mirrorY.i = 0; return c; } const v = Number(nb), i = mirrorY.i++; return String(f2(k === 'H' || (k !== 'V' && i % 2 === 0) ? v : 2 * cy - v)); }); };
    /** les quatre coins d'un cadre (rectangulaire) : le dessin du coin haut-gauche, reflété */
    const corners = (d, cx, cy) => d + mirror(d, cx) + mirrorY(d, cy) + mirrorY(mirror(d, cx), cy);
    const poly = pts => 'M' + pts.map(p => `${f2(p[0])} ${f2(p[1])}`).join('L') + 'Z';
    const starD = (cx, cy, n, R, r, a0 = -Math.PI / 2) => poly(Array.from({length: n * 2}, (_, i) => { const a = a0 + i * Math.PI / n, q = i % 2 ? r : R; return [cx + Math.cos(a) * q, cy + Math.sin(a) * q]; }));
    const rays = (cx, cy, r1, r2, a1, a2, n) => Array.from({length: n}, (_, i) => { const a = (a1 + (a2 - a1) * i / (n - 1)) * Math.PI / 180; return `M${f2(cx + Math.cos(a) * r1)} ${f2(cy + Math.sin(a) * r1)}L${f2(cx + Math.cos(a) * r2)} ${f2(cy + Math.sin(a) * r2)}`; }).join('');
    const pearls = (pts, r) => pts.map(([x, y]) => circ(x, y, r)).join('');
    const rectD = (x, y, w, h) => `M${f2(x)} ${f2(y)}H${f2(x + w)}V${f2(y + h)}H${f2(x)}Z`;
    // un coin à filet rentrant (quart de cercle creusé) : cadre w × h, rayon r, marge m
    const notchRect = (m, w, h, r) => `M${f2(m + r)} ${f2(m)}H${f2(w - m - r)}A${f2(r)} ${f2(r)} 0 0 0 ${f2(w - m)} ${f2(m + r)}V${f2(h - m - r)}A${f2(r)} ${f2(r)} 0 0 0 ${f2(w - m - r)} ${f2(h - m)}H${f2(m + r)}A${f2(r)} ${f2(r)} 0 0 0 ${f2(m)} ${f2(h - m - r)}V${f2(m + r)}A${f2(r)} ${f2(r)} 0 0 0 ${f2(m + r)} ${f2(m)}Z`;
    const lys = (() => { const r = 'M54 58C70 40 92 36 92 52C92 62 82 66 74 60C82 58 84 50 78 48C70 46 60 54 56 64Z'; return 'M50 5C64 22 64 42 50 62C36 42 36 22 50 5Z' + both(r, 50) + 'M28 62H72V69H28Z' + both('M50 69C49 78 44 86 36 92L50 92Z', 50); })();
    const acanthe = (() => { const half = [[50, 97], [45, 82], [30, 80], [37, 68], [21, 62], [32, 52], [18, 42], [33, 36], [26, 22], [41, 24], [50, 4]]; return spline([...half, ...half.slice(1, -1).reverse().map(([x, y]) => [100 - x, y])], true) + leaf(50, 90, 50, 14, 1.6); })();
    const ORN_CATS = [['fleurons', 'Fleurons'], ['coins', 'Coins'], ['filets', 'Filets'], ['culs', 'Culs-de-lampe'], ['cadres', 'Cadres'], ['lettrines', 'Lettrines']];
    const O = (k, n, cat, w, h, parts, extra = {}) => ({k, n, cat, w, h, parts, ...extra});
    const ORNAMENTS = [
        // — fleurons (100 × 100)
        O('fl_feuille', 'Feuille', 'fleurons', 100, 100, [{d: leaf(50, 96, 50, 4, 22) + leaf(50, 88, 50, 14, 1.4), f: 1, eo: 1}], {tags: 'feuille nervure'}),
        O('fl_trefle', 'Trèfle', 'fleurons', 100, 100, [{d: circ(50, 28, 16) + circ(31, 52, 16) + circ(69, 52, 16) + leaf(50, 50, 50, 97, 4), f: 1}], {tags: 'trèfle'}),
        O('fl_quatre', 'Quatre-feuilles', 'fleurons', 100, 100, [{d: circ(50, 27, 19) + circ(73, 50, 19) + circ(50, 73, 19) + circ(27, 50, 19), f: 1}, {d: circ(50, 50, 7), f: 1}], {tags: 'quatrefeuille gothique'}),
        O('fl_rosace6', 'Rosace à six pétales', 'fleurons', 100, 100, [{d: petals(50, 50, 6, 9, 48, 13), f: 1}, {d: circ(50, 50, 8), f: 1}], {tags: 'rosace fleur'}),
        O('fl_rosace8', 'Rosace double', 'fleurons', 100, 100, [{d: petals(50, 50, 8, 10, 48, 9), f: 1}, {d: petals(50, 50, 8, 9, 30, 6, -Math.PI / 2 + Math.PI / 8), f: 1, op: .6}, {d: circ(50, 50, 7), f: 1}], {tags: 'rosace fleur'}),
        O('fl_etoile', 'Rose des vents', 'fleurons', 100, 100, [{d: poly(Array.from({length: 16}, (_, i) => { const a = -Math.PI / 2 + i * Math.PI / 8, r = i % 4 === 0 ? 48 : i % 2 === 0 ? 30 : 10; return [50 + Math.cos(a) * r, 50 + Math.sin(a) * r]; })), f: 1}], {tags: 'étoile boussole'}),
        O('fl_lys', 'Fleur de lys', 'fleurons', 100, 100, [{d: lys, f: 1}], {tags: 'lys royal héraldique'}),
        O('fl_palmette', 'Palmette', 'fleurons', 100, 100, [{d: Array.from({length: 7}, (_, i) => { const a = (-160 + i * 140 / 6) * Math.PI / 180, L = 40 + 14 * Math.sin(Math.PI * i / 6); return leaf(50, 80, 50 + Math.cos(a) * L, 80 + Math.sin(a) * L, 7); }).join('') + 'M30 82Q50 70 70 82Q60 96 50 96Q40 96 30 82Z', f: 1}], {tags: 'palmette antique éventail'}),
        O('fl_coeur', 'Cœur fleuronné', 'fleurons', 100, 100, [{d: 'M50 92C22 72 6 54 16 36C26 20 42 24 50 38C58 24 74 20 84 36C94 54 78 72 50 92Z' + leaf(50, 36, 36, 6, 6) + leaf(50, 36, 64, 6, 6), f: 1}], {tags: 'cœur amour mariage'}),
        O('fl_acanthe', 'Feuille d’acanthe', 'fleurons', 100, 100, [{d: acanthe, f: 1, eo: 1}], {tags: 'acanthe feuille classique'}),
        O('fl_croix', 'Croix fleuronnée', 'fleurons', 100, 100, [{d: rectD(44, 20, 12, 60) + rectD(20, 44, 60, 12) + [0, 90, 180, 270].map(a => { const r = a * Math.PI / 180, at = (x, y) => [50 + (x - 50) * Math.cos(r) - (y - 50) * Math.sin(r), 50 + (x - 50) * Math.sin(r) + (y - 50) * Math.cos(r)]; return [[50, 8, 7], [41, 15, 6], [59, 15, 6]].map(([x, y, rr]) => circ(...at(x, y), rr)).join(''); }).join(''), f: 1}], {tags: 'croix baptême deuil'}),
        O('fl_rinceau', 'Rinceau', 'fleurons', 100, 100, [{d: spline([...voluteP(26, 58, 18, 1.2, -1, 0).reverse(), [50, 50], ...voluteP(74, 42, 18, 1.2, -1, Math.PI)]), s: 3.4}, {d: leaf(50, 50, 40, 30, 5) + leaf(50, 50, 60, 70, 5), f: 1}], {tags: 'rinceau volute s'}),
        O('fl_soleil', 'Soleil', 'fleurons', 100, 100, [{d: circ(50, 50, 16), f: 1}, {d: Array.from({length: 16}, (_, i) => { const a = i * Math.PI / 8, r1 = 21, r2 = i % 2 ? 36 : 47, w = .12; return poly([[50 + Math.cos(a - w) * r1, 50 + Math.sin(a - w) * r1], [50 + Math.cos(a) * r2, 50 + Math.sin(a) * r2], [50 + Math.cos(a + w) * r1, 50 + Math.sin(a + w) * r1]]); }).join(''), f: 1}], {tags: 'soleil rayons'}),
        // — coins (100 × 100, l'angle en haut à gauche)
        O('co_volute', 'Coin à volutes', 'coins', 100, 100, [{d: 'M3 96V3H96', s: 2.4}, {d: 'M11 70V11H70', s: 1}, {d: volute(30, 30, 17, 1.4, 1, Math.PI * .75), s: 2.6}, {d: leaf(70, 11, 88, 11, 4) + leaf(11, 70, 11, 88, 4), f: 1}], {tags: 'belle époque coin volute'}),
        O('co_nouveau', 'Coin Art nouveau', 'coins', 100, 100, [{d: spline([[4, 98], [8, 52], [22, 24], [52, 8], [98, 4]]), s: 2.4}, {d: spline([[14, 92], [18, 46], [42, 20], [92, 14]]), s: 1.2}, {d: leaf(20, 40, 38, 30, 6) + leaf(36, 20, 30, 40, 5) + leaf(10, 70, 26, 60, 5) + leaf(66, 10, 60, 26, 5), f: 1}, {d: circ(24, 24, 5), f: 1}], {tags: 'art nouveau tige fleur'}),
        O('co_deco', 'Coin Art déco', 'coins', 100, 100, [{d: 'M2 98V2H98M12 98V12H98M22 98V22H98', s: 1.6}, {d: rays(2, 2, 34, 62, 12, 78, 7), s: 1.4}, {d: rectD(28, 28, 10, 10), f: 1}], {tags: 'art déco gradins éventail'}),
        O('co_filet', 'Coin à filet arrondi', 'coins', 100, 100, [{d: 'M3 98V34A31 31 0 0 0 34 3H98', s: 3}, {d: 'M12 98V44A32 32 0 0 0 44 12H98', s: 1.2}, {d: circ(12, 12, 5), f: 1}], {tags: 'classique filet arrondi'}),
        O('co_fleuron', 'Coin fleuronné', 'coins', 100, 100, [{d: 'M4 96V4H96', s: 1.4}, {d: leaf(12, 12, 46, 46, 9) + leaf(16, 16, 50, 22, 6) + leaf(16, 16, 22, 50, 6), f: 1}, {d: circ(12, 12, 6), f: 1}], {tags: 'fleuron coin feuilles'}),
        O('co_perle', 'Coin perlé', 'coins', 100, 100, [{d: 'M0 0H58L0 58Z', f: 1}, {d: pearls(Array.from({length: 6}, (_, i) => [68 - i * 12.4, 6 + i * 12.4]), 3.4), f: 1}], {tags: 'perles triangle coin'}),
        // — filets (300 × 40)
        O('fi_losange', 'Filet au losange', 'filets', 300, 40, [{d: 'M8 20H134M166 20H292', s: 2}, {d: poly([[150, 8], [162, 20], [150, 32], [138, 20]]), f: 1}, {d: circ(126, 20, 3) + circ(174, 20, 3), f: 1}], {tags: 'séparateur losange'}),
        O('fi_double', 'Filet double', 'filets', 300, 40, [{d: leaf(6, 15, 294, 15, 2.2), f: 1}, {d: 'M30 25H270', s: 1}], {tags: 'filet anglais gras maigre'}),
        O('fi_onde', 'Filet ondulé', 'filets', 300, 40, [{d: spline(Array.from({length: 13}, (_, i) => [6 + i * 24, 20 + (i % 2 ? -9 : 9) * (i && i < 12 ? 1 : 0)])), s: 2.2}], {tags: 'onde vague'}),
        O('fi_perles', 'Filet perlé', 'filets', 300, 40, [{d: Array.from({length: 15}, (_, i) => circ(10 + i * 20, 20, 1.5 + 4.5 * Math.sin(Math.PI * (i + .5) / 15))).join(''), f: 1}], {tags: 'perles chapelet'}),
        O('fi_chevrons', 'Filet Art déco', 'filets', 300, 40, [{d: 'M6 20H110M190 20H294', s: 1.6}, {d: 'M114 30L126 10L138 30L150 10L162 30L174 10L186 30', s: 2}, {d: 'M6 27H100M200 27H294', s: .8}], {tags: 'art déco chevrons zigzag'}),
        O('fi_volutes', 'Filet à volutes', 'filets', 300, 40, [{d: volute(132, 20, 12, 1.3, 1, Math.PI) + mirror(volute(132, 20, 12, 1.3, 1, Math.PI), 150), s: 2.2}, {d: leaf(10, 20, 118, 20, 2) + leaf(182, 20, 290, 20, 2), f: 1}, {d: poly([[150, 13], [155, 20], [150, 27], [145, 20]]), f: 1}], {tags: 'volutes séparateur'}),
        O('fi_accolade', 'Accolade', 'filets', 300, 40, [{d: both(spline([[8, 32], [60, 30], [120, 28], [140, 22], [150, 8]]), 150), s: 2.4}], {tags: 'accolade titre'}),
        O('fi_fleuron', 'Filet au fleuron', 'filets', 300, 40, [{d: 'M8 20H120M180 20H292', s: 1.6}, {d: circ(150, 13, 6) + circ(142, 22, 6) + circ(158, 22, 6) + leaf(150, 22, 150, 38, 3) + leaf(128, 20, 120, 20, 3) + leaf(172, 20, 180, 20, 3), f: 1}], {tags: 'fleuron trèfle séparateur'}),
        // — culs-de-lampe (160 × 100)
        O('cl_triangle', 'Cul-de-lampe en triangle', 'culs', 160, 100, [{d: Array.from({length: 7}, (_, i) => leaf(10 + i * 9.5, 8 + i * 11, 150 - i * 9.5, 8 + i * 11, 2.2 - i * .18)).join('') + poly([[80, 82], [86, 90], [80, 98], [74, 90]]), f: 1}], {tags: 'triangle fin de chapitre'}),
        O('cl_goutte', 'Goutte et volutes', 'culs', 160, 100, [{d: 'M80 96C64 76 66 54 80 40C94 54 96 76 80 96Z', f: 1}, {d: volute(56, 34, 16, 1.3, -1, 0) + mirror(volute(56, 34, 16, 1.3, -1, 0), 80) + 'M20 12H140', s: 2.2}], {tags: 'goutte larme'}),
        O('cl_fleuri', 'Cul-de-lampe fleuri', 'culs', 160, 100, [{d: both(spline([[80, 20], [60, 34], [34, 36], [14, 24]]), 80), s: 2.2}, {d: leaf(80, 18, 80, 94, 10) + leaf(56, 33, 44, 52, 6) + leaf(104, 33, 116, 52, 6) + leaf(32, 34, 22, 52, 5) + leaf(128, 34, 138, 52, 5) + circ(80, 14, 6), f: 1}], {tags: 'fleur branches'}),
        O('cl_deco', 'Éventail Art déco', 'culs', 160, 100, [{d: 'M8 10H152', s: 2}, {d: rays(80, 14, 10, 78, 20, 160, 11), s: 1.6}, {d: 'M30 16A50 50 0 0 0 130 16', s: 1}, {d: circ(80, 14, 6), f: 1}], {tags: 'art déco éventail soleil'}),
        O('cl_vase', 'Urne', 'culs', 160, 100, [{d: 'M64 10H96L92 18C112 26 114 52 98 70L104 88H56L62 70C46 52 48 26 68 18Z', f: 1}, {d: leaf(64, 30, 20, 20, 9) + leaf(96, 30, 140, 20, 9) + leaf(62, 52, 26, 62, 7) + leaf(98, 52, 134, 62, 7), f: 1}], {tags: 'urne vase antique'}),
        // — cadres (300 × 400)
        O('ca_belle', 'Cadre Belle Époque', 'cadres', 300, 400, [{d: rectD(6, 6, 288, 388), s: 2.4}, {d: rectD(16, 16, 268, 368), s: 1}, {d: corners(volute(40, 40, 22, 1.4, 1, Math.PI * .75), 150, 200), s: 2}, {d: both(spline([[150, 20], [128, 30], [112, 24], [118, 14]]), 150), s: 1.6}, {d: circ(150, 22, 5), f: 1}], {tags: 'belle époque 1900 cadre volutes'}),
        O('ca_nouveau', 'Cadre Art nouveau', 'cadres', 300, 400, [{d: 'M14 394V120A136 106 0 0 1 286 120V394Z', s: 2.4}, {d: 'M26 384V124A124 96 0 0 1 274 124V384Z', s: 1}, {d: both(spline([[8, 396], [16, 300], [4, 210], [22, 130], [70, 40], [150, 6]]), 150), s: 1.8}, {d: [[12, 300, 34, 284], [8, 220, 32, 210], [24, 140, 46, 140], [60, 52, 80, 66]].map(([a, b, c, d]) => leaf(a, b, c, d, 6) + mirror(leaf(a, b, c, d, 6), 150)).join('') + circ(150, 14, 7), f: 1}], {tags: 'art nouveau arche tige 1900'}),
        O('ca_deco', 'Cadre Art déco', 'cadres', 300, 400, [{d: rectD(4, 4, 292, 392), s: 2}, {d: rectD(14, 14, 272, 372), s: 1}, {d: 'M24 70V24H70M230 24H276V70M276 330V376H230M70 376H24V330', s: 2.4}, {d: rays(150, 14, 20, 64, 20, 160, 9), s: 1.2}, {d: rectD(144, 376, 12, 12) + rectD(140, 8, 20, 12), f: 1}], {tags: 'art déco 1925 gradins soleil'}),
        O('ca_medaillon', 'Médaillon perlé', 'cadres', 300, 400, [{d: ell(150, 210, 132, 180), s: 2.6}, {d: ell(150, 210, 120, 168), s: 1}, {d: pearls(Array.from({length: 36}, (_, i) => { const a = i * Math.PI / 18; return [150 + Math.cos(a) * 141, 210 + Math.sin(a) * 189]; }), 3.2) + both('M150 30C130 4 104 6 108 22C112 36 134 34 150 30Z', 150) + circ(150, 30, 7), f: 1}], {tags: 'médaillon ovale perles portrait nœud'}),
        O('ca_cartouche', 'Cartouche à enroulements', 'cadres', 300, 400, [{d: notchRect(20, 300, 400, 34), s: 2.4}, {d: notchRect(30, 300, 400, 30), s: 1}, {d: corners(volute(26, 26, 18, 1.5, 1, Math.PI * .25), 150, 200), s: 2.2}], {tags: 'cartouche enroulements baroque'}),
        O('ca_filets', 'Cadre à filets', 'cadres', 300, 400, [{d: notchRect(6, 300, 400, 26), s: 3.2}, {d: notchRect(16, 300, 400, 22), s: 1}, {d: circ(16, 16, 5) + circ(284, 16, 5) + circ(16, 384, 5) + circ(284, 384, 5), f: 1}], {tags: 'classique filets coins'}),
        // — lettrines (100 × 100 ; la lettre se choisit en la posant)
        O('le_carre', 'Lettrine carrée', 'lettrines', 100, 100, [{d: rectD(3, 3, 94, 94), s: 2.4}, {d: rectD(10, 10, 80, 80), s: .9}, {d: circ(10, 10, 3) + circ(90, 10, 3) + circ(10, 90, 3) + circ(90, 90, 3), f: 1}], {letter: {x: 50, y: 74, size: 62}, tags: 'lettrine initiale'}),
        O('le_medievale', 'Lettrine médiévale', 'lettrines', 100, 100, [{d: rectD(3, 3, 94, 94), f: 1, op: .16}, {d: rectD(3, 3, 94, 94), s: 2.4}, {d: volute(18, 18, 11, 1.3, 1, Math.PI) + volute(82, 82, 11, 1.3, 1, 0), s: 1.6}, {d: leaf(24, 82, 10, 92, 4) + leaf(76, 18, 90, 8, 4), f: 1}], {letter: {x: 50, y: 74, size: 64, font: 'UnifrakturMaguntia, "Old English Text MT", Georgia, serif'}, tags: 'lettrine gothique enluminure'}),
        O('le_nouveau', 'Lettrine Art nouveau', 'lettrines', 100, 100, [{d: 'M8 97V40A42 36 0 0 1 92 40V97Z', s: 2.2}, {d: spline([[4, 98], [6, 60], [14, 30], [40, 8]]), s: 1.4}, {d: leaf(6, 66, 18, 56, 4) + leaf(10, 40, 22, 36, 4) + circ(42, 8, 3.5), f: 1}], {letter: {x: 52, y: 82, size: 58}, tags: 'lettrine art nouveau arche'}),
        O('le_deco', 'Lettrine Art déco', 'lettrines', 100, 100, [{d: rectD(3, 3, 94, 94), s: 1.6}, {d: 'M10 30V10H30M70 10H90V30M90 70V90H70M30 90H10V70', s: 2.4}, {d: rays(50, 3, 6, 18, 30, 150, 5), s: 1.2}], {letter: {x: 50, y: 76, size: 60, font: 'Didot, "Bodoni 72", Georgia, serif'}, tags: 'lettrine art déco'}),
        O('le_cercle', 'Lettrine cerclée', 'lettrines', 100, 100, [{d: circ(50, 50, 46), s: 2.4}, {d: circ(50, 50, 39), s: .9}, {d: pearls(Array.from({length: 8}, (_, i) => [50 + Math.cos(i * Math.PI / 4) * 46, 50 + Math.sin(i * Math.PI / 4) * 46]), 3.4), f: 1}], {letter: {x: 50, y: 70, size: 52}, tags: 'lettrine ronde médaillon'}),
        O('le_feuillage', 'Lettrine au feuillage', 'lettrines', 100, 100, [{d: rectD(3, 3, 94, 94), s: 1.8}, {d: Array.from({length: 12}, (_, i) => { const t = i / 12, x = 50 + 40 * Math.cos(t * 2 * Math.PI), y = 50 + 40 * Math.sin(t * 2 * Math.PI), a = t * 2 * Math.PI + Math.PI / 2; return leaf(x, y, x + Math.cos(a) * 12, y + Math.sin(a) * 12, 3.2); }).join(''), f: 1, op: .55}], {letter: {x: 50, y: 70, size: 50}, tags: 'lettrine couronne feuilles laurier'}),
    ];
    ext.vectorOrnaments = {CATS: ORN_CATS, items: ORNAMENTS};

    /* mesure, pour que les textes tiennent dans la largeur */
    let mc = null; const measure = (t, font, size, bold) => { mc = mc || document.createElement('canvas').getContext('2d'); mc.font = `${bold ? 'bold ' : ''}${size}px ${font}`; return Math.max(...String(t || ' ').split('\n').map(l => mc.measureText(l).width)); };
    const fitSize = (t, font, max, maxW, bold) => { let s = max; while (s > 6 && measure(t, font, s, bold) > maxW) s *= .93; return s; };
    const wrap = (t, font, size, maxW) => String(t || '').split('\n').flatMap(par => { const out = []; let line = ''; par.split(/\s+/).filter(Boolean).forEach(w => { const tt = line ? line + ' ' + w : w; if (measure(tt, font, size) > maxW && line) { out.push(line); line = w; } else line = tt; }); out.push(line); return out; }).join('\n');
    const T = (text, x, y, size, font, fill, o = {}) => ({id: uid(), type: 'text', name: o.name || String(text).split('\n')[0].slice(0, 30), text, x: n2(x), y: n2(y), size: n2(size), font, align: 'middle', fill, sw: 0, ...(o.bold ? {bold: true} : {}), ...(o.italic ? {italic: true} : {}), ...(o.ls ? {ls: o.ls} : {})});

    /* o.fields : les champs dans l'ordre, [{key, role, label, value, hidden, size, italic}] ; role = intro, name, date, detail, family ou custom */
    const CSIZE = {s: 12, n: 14, l: 20, t: 36};
    /** la taille d'une face (ou d'un volet) de la carte, en pixels */
    const cardSize = o => { const fmt = o.format === 'custom' ? ['custom', '', CM(Math.min(120, Math.max(3, Number(o.cw) || 10))), CM(Math.min(120, Math.max(3, Number(o.ch) || 15)))] : (FORMATS.find(f => f[0] === o.format) || FORMATS[0]), land = o.orient === 'land'; return [land ? fmt[3] : fmt[2], land ? fmt[2] : fmt[3]]; };
    /** une face de la carte (W × H) avec les champs de o.fields */
    async function buildOne(o, W, H) {
        const st = STYLES[o.style] ? o.style : 'classique', S = STYLES[st];
        const u = Math.min(W, H) / 400, maxW = W * .76;
        const fields = (o.fields || []).filter(f => !f.hidden && String(f.value || '').trim()), texts = [], photo = [];
        const custom = (f, font, y) => { const s = CSIZE[f.size] * u || 14 * u, fnt = f.size === 't' ? S.script : font, w2 = f.size === 't' ? String(f.value) : wrap(f.value, fnt, s, maxW), sz = f.size === 't' ? fitSize(w2, fnt, s, maxW) : s; texts.push(T(w2, W / 2, y + sz * .95, sz, fnt, f.size === 't' ? S.accent : S.ink, {italic: !!f.italic, bold: !!f.bold, name: f.label})); return (w2.split('\n').length * 1.25 + .8) * sz; };
        let y = H * (o.photo ? .1 : .16);
        if (o.kind === 'presse') { // un avis de journal : colonne étroite, filets, nom en capitales
            const f = S.serif; y = H * .12;
            fields.forEach(fd => { const t = String(fd.value);
                if (fd.role === 'intro') { texts.push(T(t.toLocaleUpperCase('fr-FR'), W / 2, y, 16 * u, f, S.ink, {bold: true, ls: 2 * u, name: fd.label})); y += 26 * u; }
                else if (fd.role === 'name') { const up = t.toLocaleUpperCase('fr-FR'); texts.push(T(up, W / 2, y, fitSize(up, f, 30 * u, maxW, true), f, S.ink, {bold: true, name: fd.label})); y += 22 * u; }
                else if (fd.role === 'custom') y += custom(fd, f, y);
                else { const s = 13 * u, w2 = wrap(t, f, s, maxW); texts.push(T(w2, W / 2, y + s, s, f, S.ink, {name: fd.label})); y += (w2.split('\n').length * 1.2 + 1) * s; } });
            const out = [R(W * .08, H * .06, W * .84, Math.min(H * .88, y), {stroke: S.ink, sw: 1.4 * u, name: 'Filet de l’avis'})];
            return {w: W, h: H, bg: '#ffffff', kind: 'card', objs: [{id: uid(), type: 'group', layer: true, name: 'Cadre', children: out}, {id: uid(), type: 'group', layer: true, name: 'Textes', children: texts}]};
        }
        if (o.photo) { const ph = Math.min(H * .3, W * .45), pw = ph * (o.photoRatio || .78); const clip = {id: uid(), type: 'ellipse', x: n2((W - pw) / 2), y: n2(y), w: n2(pw), h: n2(ph)};
            photo.push({id: uid(), type: 'group', name: 'Photo', clip, children: [{id: uid(), type: 'image', name: 'Photo', src: o.photo, x: clip.x, y: clip.y, w: clip.w, h: clip.h}]}, {...clip, id: uid(), name: 'Cadre de la photo', fill: 'none', stroke: S.accent, sw: n2(2 * u)}); y += ph + 26 * u; }
        const bigF = S.script, serif = S.serif, introS = 15 * u;
        let sepY = null; // le filet se pose sous le nom (ou sous le premier texte s'il n'y a pas de nom)
        const hasName = fields.some(f => f.role === 'name');
        fields.forEach((fd, i) => { const t = String(fd.value).trim();
            if (fd.role === 'name') { const s = fitSize(t, bigF, (o.kind === 'deces' ? 34 : 50) * u, maxW); texts.push(T(t, W / 2, y + s * .95, s, bigF, o.kind === 'deces' ? S.ink : S.accent, {name: fd.label})); y += s * 1.4; }
            else if (fd.role === 'intro') { const w2 = wrap(t, serif, introS, maxW); texts.push(T(w2, W / 2, y + introS, introS, serif, S.ink, {italic: st !== 'moderne', ls: o.kind === 'cousinade' || o.kind === 'noces' ? 2 * u : 0, name: fd.label})); y += (w2.split('\n').length * 1.2 + .8) * introS; }
            else if (fd.role === 'custom') y += custom(fd, serif, y);
            else { const [s0, it] = {date: [17, false], detail: [13.5, true], family: [13, false]}[fd.role] || [14, false], s = s0 * u, w2 = wrap(t, serif, s, maxW); texts.push(T(w2, W / 2, y + s, s, serif, S.ink, {italic: it, name: fd.label})); y += (w2.split('\n').length * 1.25 + .9) * s; }
            if (sepY === null && (fd.role === 'name' || (!hasName && i === 0)) && i < fields.length - 1) { sepY = y + 4 * u; y += 20 * u; } });
        // tout le texte descend un peu s'il reste de la place (centré dans la page)
        const room = Math.max(0, H * .9 - y); if (room > 0) [...texts, ...photo].forEach(t => { if (t.y !== undefined) t.y = n2(t.y + room / 2); if (t.clip) t.clip.y = n2(t.clip.y + room / 2); (t.children || []).forEach(c => { c.y = n2(c.y + room / 2); }); });
        if (sepY !== null) texts.push(...sep(st, W, sepY + room / 2, u));
        return {w: W, h: H, bg: S.paper, kind: 'card', objs: [{id: uid(), type: 'group', layer: true, name: 'Cadre et ornements', children: frame(st, W, H)}, ...(photo.length ? [{id: uid(), type: 'group', layer: true, name: 'Photo', children: photo}] : []), {id: uid(), type: 'group', layer: true, name: 'Textes', children: texts}]};
    }

    /* ═════════ 📄 Recto-verso, cartes pliées, enveloppe assortie ═════════ */
    const FOLDS = {single: {label: 'Carte simple', n: 1}, duplex: {label: 'Recto-verso', n: 1}, fold2: {label: 'Carte pliée en 2', n: 2}, fold3: {label: 'Pliée en 3 volets', n: 3}, fold4: {label: 'Pliée en 4 volets (accordéon)', n: 4}};
    const PANEL_NAMES = {duplex: [['Recto'], ['Verso']], fold2: [['Dos (4e de couverture)', 'Couverture'], ['Intérieur gauche', 'Intérieur droit']], fold3: [['Rabat (se replie dedans)', 'Dos', 'Couverture'], ['Intérieur gauche', 'Intérieur milieu', 'Intérieur droit']], fold4: [['Volet 4', 'Volet 3', 'Dos', 'Couverture'], ['Intérieur 1', 'Intérieur 2', 'Intérieur 3', 'Intérieur 4']]};
    // enveloppes (en mm, posées en paysage) ; « auto » : la plus petite où la carte pliée entre (2 mm de jeu)
    const ENVELOPES = [['c6', 'C6 (16,2 × 11,4 cm)', 162, 114], ['dl', 'DL (22 × 11 cm)', 220, 110], ['c5', 'C5 (22,9 × 16,2 cm)', 229, 162], ['q14', 'Carrée 14 × 14 cm', 140, 140], ['q16', 'Carrée 16 × 16 cm', 160, 160], ['q17', 'Carrée 17 × 17 cm', 170, 170], ['q22', 'Carrée 22 × 22 cm', 220, 220], ['c4', 'C4 (32,4 × 22,9 cm)', 324, 229]];
    const MMPX = mm => Math.round(mm / 25.4 * 96);
    function envFor(W, H, want) {
        if (want && want !== 'auto') { const e = ENVELOPES.find(x => x[0] === want); if (e) return e; }
        const a = Math.max(W, H) / 96 * 25.4 + 2, b = Math.min(W, H) / 96 * 25.4 + 2, square = Math.abs(W - H) / Math.max(W, H) < .08;
        const fits = ENVELOPES.filter(e => e[2] >= a && e[3] >= b).sort((x, y) => x[2] * x[3] - y[2] * y[3]);
        return (square ? fits.find(e => e[2] === e[3]) : fits.find(e => e[2] !== e[3])) || fits[0] || ENVELOPES[ENVELOPES.length - 1];
    }
    const STYLE_ORN = {belle: 'fl_rinceau', nouveau: 'fl_acanthe', deco: 'fl_soleil', annees50: 'fl_rosace6', classique: 'fl_lys', moderne: 'fl_quatre', deuil: 'fl_croix'};
    /** un ornement de la bibliothèque, centré en (cx, cy), de la taille donnée */
    function ornament(k, cx, cy, size, color) {
        const it = ORNAMENTS.find(x => x.k === k), K = ext.boardKit; if (!it || !K?.absPath) return null;
        const s = size / Math.max(it.w, it.h), ox = cx - it.w * s / 2, oy = cy - it.h * s / 2;
        const d = dd => K.pathStr(K.absPath(dd).map(([c, ...a]) => { const r = [c]; for (let j = 0; j < a.length; j += 2) r.push(ox + a[j] * s, oy + a[j + 1] * s); return r; }));
        return {id: uid(), type: 'group', name: it.n, children: it.parts.map(p => ({id: uid(), type: 'svgpath', name: it.n, d: d(p.d), fill: p.f ? color : 'none', stroke: p.s ? color : 'none', sw: p.s ? n2(p.s * s) : 0, cap: 'round', join: 'round', ...(p.eo ? {evenodd: true} : {}), ...(p.op ? {op: p.op} : {})}))};
    }
    const moveAll = (objs, dx, dy) => { const V = ext.vectorInternals; objs.forEach(o => V?.mapObj ? V.mapObj(o, (x, y) => [x + dx, y + dy]) : null); return objs; };
    /** une face toute faite (W × H), posée en (dx, dy) : ses calques fondus dans ceux du document */
    async function facePanel(o, W, H, fields, dx, dy, {photo = false, orn = 0} = {}) {
        const st = STYLES[o.style] ? o.style : 'classique', S = STYLES[st], has = fields.some(f => !f.hidden && String(f.value || '').trim());
        const one = await buildOne({...o, fields, photo: photo ? o.photo : ''}, W, H), out = {};
        one.objs.forEach(l => { out[l.name] = moveAll(l.children || [], dx, dy); });
        if (!has || orn) { const u = Math.min(W, H) / 400, g = ornament(STYLE_ORN[st] || 'fl_lys', dx + W / 2, dy + (has ? H * .82 : H / 2), (has ? 46 : orn === 1 ? 64 : 100) * u, S.accent); if (g) (out['Cadre et ornements'] = out['Cadre et ornements'] || []).push(g); }
        return out;
    }
    /** l'enveloppe : expéditeur en haut à gauche, timbre, destinataire ; même papier, même encre, un filet du style */
    function envelopePanel(o, EW, EH, dx, dy) {
        const st = STYLES[o.style] ? o.style : 'classique', S = STYLES[st], u = Math.min(EW, EH) / 400, objs = [];
        objs.push({id: uid(), type: 'rect', name: 'Enveloppe', x: dx, y: dy, w: EW, h: EH, r: 0, fill: S.paper, stroke: 'none', sw: 0});
        const m = 14 * u; objs.push(R(dx + m, dy + m, EW - 2 * m, EH - 2 * m, {stroke: S.accent, sw: 1.2 * u, name: 'Filet de l’enveloppe'}));
        const sw = MMPX(24), sh = MMPX(30); objs.push({id: uid(), type: 'rect', name: 'Place du timbre', x: n2(dx + EW - m * 2 - sw), y: n2(dy + m * 2), w: sw, h: sh, r: 0, fill: 'none', stroke: S.accent, sw: n2(1 * u), dash: 'dash'});
        objs.push(T('Timbre', dx + EW - m * 2 - sw / 2, dy + m * 2 + sh / 2 + 5 * u, 11 * u, S.serif, S.accent, {italic: true, name: 'Timbre'}));
        const g = ornament(STYLE_ORN[st] || 'fl_lys', dx + m * 2 + 18 * u, dy + m * 2 + 18 * u, 34 * u, S.accent); if (g) objs.push(g);
        const from = String(o.envFrom || '').trim(); if (from) objs.push({...T(from, dx + m * 2 + 44 * u, dy + m * 2 + 12 * u, 11 * u, S.serif, S.ink, {name: 'Expéditeur'}), align: 'start'});
        const to = String(o.envTo || '').trim() || 'Prénom NOM\nAdresse\nCode postal VILLE', lines = to.split('\n').slice(0, 8), fs = Math.min(17 * u, EH * .06);
        const tx = dx + EW * .46, ty = dy + EH * .56;
        objs.push({...T(lines.join('\n'), tx, ty, fs, S.serif, S.ink, {name: 'Destinataire'}), align: 'start'});
        objs.push({id: uid(), type: 'svgpath', name: 'Filets d’adresse', d: lines.map((_, i) => `M${n2(tx)} ${n2(ty + fs * .35 + i * fs * 1.2)}H${n2(dx + EW - m * 3)}`).join(''), fill: 'none', stroke: S.accent, sw: n2(.5 * u), op: .5});
        return objs;
    }
    async function build(o) {
        const mode = FOLDS[o.fold] ? o.fold : 'single', [W, H] = cardSize(o);
        if (mode === 'single' && !o.env) return buildOne(o, W, H);
        const st = STYLES[o.style] ? o.style : 'classique', S = STYLES[st], G = Math.round(Math.max(80, Math.min(W, H) * .16)), names = PANEL_NAMES[mode] || [['Carte']];
        const all = (o.fields || []).map(f => ({...f})), front = all.filter(f => ['intro', 'name', 'date'].includes(f.role) || (f.role === 'custom' && f.size === 't')), rest = all.filter(f => !front.includes(f));
        const layers = {'Cadre et ornements': [], Photo: [], Textes: [], Enveloppe: []}, add = out => Object.entries(out).forEach(([k, v]) => { (layers[k] = layers[k] || []).push(...v); });
        const pages = []; let y = 0;
        if (mode === 'single') { add(await facePanel(o, W, H, all, 0, 0, {photo: true})); pages.push({name: 'Carte', x: 0, y: 0, w: W, h: H, panels: [{name: 'Carte', x: 0, w: W}]}); y = H + G; }
        else {
            const n = FOLDS[mode].n, FW = W * n;
            // dehors : la couverture à droite (le texte principal et la photo), le dos avec un ornement
            for (let i = 0; i < n; i++) { const dx = i * W;
                if (mode === 'duplex' || i === n - 1) add(await facePanel(o, W, H, mode === 'duplex' ? front : front, dx, 0, {photo: true}));
                else add(await facePanel(o, W, H, [], dx, 0, {orn: i === n - 2 ? 1 : 2})); }
            pages.push({name: mode === 'duplex' ? 'Recto' : 'Extérieur', x: 0, y: 0, w: FW, h: H, panels: names[0].map((nm, i) => ({name: nm, x: i * W, w: W}))});
            // dedans : les autres champs, un par volet (le dernier prend ce qui reste)
            const per = Array.from({length: n}, () => []); rest.filter(f => !f.hidden && String(f.value || '').trim()).forEach((f, i) => per[Math.min(i, n - 1)].push(f));
            if (n === 2 && per[0].length && !per[1].length) { per[1] = per[0]; per[0] = []; } // une carte pliée : le texte à droite, l'ornement à gauche
            for (let i = 0; i < n; i++) add(await facePanel(o, W, H, per[i], i * W, H + G, {}));
            pages.push({name: mode === 'duplex' ? 'Verso' : 'Intérieur', x: 0, y: H + G, w: FW, h: H, back: true, panels: names[1].map((nm, i) => ({name: nm, x: i * W, w: W}))});
            y = 2 * (H + G);
        }
        let EW = 0;
        if (o.env) { const e = envFor(W, H, o.envFmt); EW = MMPX(e[2]); const EH = MMPX(e[3]); layers.Enveloppe.push(...envelopePanel(o, EW, EH, 0, y)); pages.push({name: `Enveloppe ${e[1].split(' (')[0]}`, role: 'env', x: 0, y, w: EW, h: EH, panels: [{name: e[1], x: 0, w: EW}]}); y += EH; }
        const docW = Math.max(...pages.map(p => p.w)), docH = y - (o.env ? 0 : G);
        const objs = Object.entries(layers).filter(([, v]) => v.length).map(([k, v]) => ({id: uid(), type: 'group', layer: true, name: k, children: v}));
        return {w: docW, h: docH, bg: S.paper, kind: 'card', objs, pages, fold: {mode, pw: W, ph: H, ...(o.env ? {env: envFor(W, H, o.envFmt)[0]} : {})}};
    }
    /** l'adresse d'une personne : son nom, puis la dernière adresse ou résidence connue */
    async function addressOf(pid) {
        const r = await api('person', {id: pid}), p = r.person || {}, ev = (r.events || []).slice();
        const nm = `${String(p.first_name || '').trim()} ${String(p.last_name || '').trim().toLocaleUpperCase('fr-FR')}`.trim();
        const withAddr = ev.filter(e => String(e.address || '').trim()), resi = ev.filter(e => e.gedcom_tag === 'RESI' && (e.address || e.place_name));
        const best = [...withAddr, ...resi].sort((a, b) => (Number(b.year) || 0) - (Number(a.year) || 0))[0];
        return [nm, best?.address ? String(best.address).trim() : '', best?.place_name || ''].filter(Boolean).join('\n');
    }

    /* ─── remplir depuis une fiche ─── */
    const fmtDate = s => String(s || '').trim();
    async function fillFrom(kind, pid) {
        const r = await api('person', {id: pid}), p = r.person || {}, ev = r.events || [], first = String(p.first_name || '').trim(), last = String(p.last_name || '').trim(), full = `${first} ${last}`.trim();
        const tag = t => ev.find(e => e.gedcom_tag === t), at = e => e ? [fmtDate(e.date_text) ? `le ${fmtDate(e.date_text)}` : '', e.place_name ? `à ${e.place_name}` : ''].filter(Boolean).join(' ') : '';
        const parents = (r.parents || []).map(q => A().personName(q)).filter(Boolean), partners = (r.partners || []).map(q => A().personName(q)).filter(Boolean);
        const b = tag('BIRT'), d = tag('DEAT'), m = tag('MARR'), bap = tag('BAPM') || tag('CHR'), bur = tag('BURI');
        const out = {};
        if (kind === 'naissance') Object.assign(out, {name: first || full, date: at(b), family: parents.length ? `${parents.join(' et ')}` : ''});
        if (kind === 'bapteme') Object.assign(out, {name: first || full, intro: `sera baptisé${p.gender === 'female' ? 'e' : ''}`, date: at(bap) || at(b), family: parents.length ? `Ses parents, ${parents.join(' et ')}` : ''});
        if (kind === 'mariage') Object.assign(out, {name: partners[0] ? `${first} & ${String(partners[0]).split(' ')[0]}` : full, date: at(m), family: parents.length ? `${parents.join(' et ')}` : ''});
        if (kind === 'deces') { const age = p.birth_year && p.death_year ? p.death_year - p.birth_year : 0; Object.assign(out, {name: `${first} ${last.toLocaleUpperCase('fr-FR')}`.trim(), date: [at(d) ? `survenu ${at(d)}` : '', age ? `à l’âge de ${age} ans` : ''].filter(Boolean).join(', '), detail: bur ? `Les obsèques ont eu lieu ${at(bur)}.` : '', family: partners.length ? `${partners.join(', ')}, ses enfants et toute la famille` : 'Ses enfants et toute la famille'}); }
        if (kind === 'cousinade') Object.assign(out, {name: `famille ${last || full}`, detail: partners[0] ? `Tous les descendants de ${full} et ${partners[0]}` : `Tous les descendants de ${full}`});
        if (kind === 'noces') { const y = Number(m?.year) || 0, now = new Date().getFullYear(), n = y ? now - y : 0; Object.assign(out, {intro: n >= 70 ? 'Noces de platine' : n >= 60 ? 'Noces de diamant' : n >= 50 ? 'Noces d’or' : n >= 25 ? 'Noces d’argent' : 'Noces', name: partners[0] ? `${first} & ${String(partners[0]).split(' ')[0]}` : full, detail: m ? `Mariés ${at(m)}` : ''}); }
        if (kind === 'presse') Object.assign(out, {intro: (d?.place_name || b?.place_name || '').toLocaleUpperCase('fr-FR'), name: full, date: d ? `On nous prie d’annoncer le décès de ${full}, ${at(d)}${p.birth_year && p.death_year ? `, dans sa ${p.death_year - p.birth_year}e année` : ''}.` : b ? `On nous annonce la naissance de ${full}, ${at(b)}.` : '', family: partners.length ? `De la part de ${partners.join(', ')} et de toute la famille.` : 'De la part de la famille.'});
        if (kind === 'invitation') Object.assign(out, {name: full});
        const photo = (r.media || []).find(mm => mm.is_person_photo && /\.(jpe?g|png|webp)$/i.test(mm.filename || '')) || (r.media || []).find(mm => /\.(jpe?g|png|webp)$/i.test(mm.filename || ''));
        return {values: out, photo: photo ? photo.filename : '', label: full};
    }
    const toData = async file => { try { const b = await (await fetch(`media/${encodeURIComponent(file)}`)).blob(), im = await createImageBitmap(b), k = Math.min(1, 900 / Math.max(im.width, im.height)), c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); return {src: c.toDataURL('image/jpeg', .86), ratio: c.width / c.height}; } catch (_) { return null; } };

    /* 🧩 les champs de chaque modèle : on en ajoute, on en enlève, on en masque, on les range — retenu pour la prochaine fois */
    const PREF = 'genealogie-faire-part';
    const prefs = () => { try { return JSON.parse(localStorage.getItem(PREF) || '{}') || {}; } catch (_) { return {}; } };
    const savePrefs = p => { try { localStorage.setItem(PREF, JSON.stringify(p)); } catch (_) {} };
    const baseFields = k => KINDS[k].fields.map(([key, label, value]) => ({key, role: key, label, value, hidden: false}));
    function fieldsOf(k) { const saved = prefs().fields?.[k]; if (!Array.isArray(saved) || !saved.length) return baseFields(k);
        const base = Object.fromEntries(baseFields(k).map(f => [f.key, f]));
        return saved.filter(f => f && (f.role === 'custom' || base[f.key])).map(f => f.role === 'custom' ? {key: String(f.key), role: 'custom', label: String(f.label || 'Champ'), value: '', hidden: !!f.hidden, size: CSIZE[f.size] ? f.size : 'n', italic: !!f.italic, bold: !!f.bold} : {...base[f.key], hidden: !!f.hidden}); }
    const keepFields = (k, list) => { const p = prefs(); p.fields = p.fields || {}; p.fields[k] = list.map(({key, role, label, hidden, size, italic, bold}) => role === 'custom' ? {key, role, label, hidden, size, italic, bold} : {key, role, hidden}); savePrefs(p); };

    function openMaker(onDone, kind0 = 'naissance') {
        let photoFile = '', personId = Number(A().state.currentPersonId) || 0, kind = kind0, fields = fieldsOf(kind0);
        const pf = prefs();
        const fieldHtml = (f, i) => { const long = f.role === 'detail' || f.role === 'family' || (kind === 'presse' && f.role === 'date') || (f.role === 'custom' && f.multi);
            return `<div class="h-fp-field ${f.role === 'intro' || f.role === 'name' ? '' : 'span-2'} ${f.hidden ? 'is-off' : ''}" data-fp-i="${i}"><div class="h-fp-fhead">
                <label class="h-fp-vis" title="Afficher ce champ sur le faire-part (décoché : gardé ici, mais pas imprimé)"><input type="checkbox" data-fp-vis ${f.hidden ? '' : 'checked'}></label>
                ${f.role === 'custom' ? `<input class="h-fp-flabel" data-fp-label value="${esc(f.label)}" title="Nom du champ">` : `<b>${esc(f.label)}</b>`}
                <span class="h-fp-ftools">${f.role === 'custom' ? `<select data-fp-size title="Taille du texte">${[['s', 'Petit'], ['n', 'Normal'], ['l', 'Grand'], ['t', 'Titre (calligraphié)']].map(([v, l]) => `<option value="${v}" ${f.size === v ? 'selected' : ''}>${l}</option>`).join('')}</select><button type="button" class="h-fp-tg ${f.italic ? 'on' : ''}" data-fp-it title="Italique"><i>I</i></button><button type="button" class="h-fp-tg ${f.bold ? 'on' : ''}" data-fp-bd title="Gras"><b>G</b></button>` : ''}
                <button type="button" data-fp-up title="Monter" ${i ? '' : 'disabled'}>↑</button><button type="button" data-fp-down title="Descendre" ${i < fields.length - 1 ? '' : 'disabled'}>↓</button><button type="button" data-fp-del title="Enlever ce champ">🗑</button></span></div>
                ${long ? `<textarea name="f_${esc(f.key)}" rows="2">${esc(f.value)}</textarea>` : `<input name="f_${esc(f.key)}" value="${esc(f.value)}">`}</div>`; };
        const missing = () => baseFields(kind).filter(b => !fields.some(f => f.key === b.key));
        const fieldsHtml = () => `${fields.map(fieldHtml).join('') || '<p class="muted span-2">Aucun champ : ajoute-en un.</p>'}<div class="h-fp-addrow span-2"><button type="button" class="button small secondary" data-fp-add>＋ Ajouter un champ</button>
            ${missing().length ? `<select data-fp-back><option value="">Remettre un champ enlevé…</option>${missing().map(m => `<option value="${esc(m.key)}">${esc(m.label)}</option>`).join('')}</select>` : ''}<button type="button" class="button small secondary" data-fp-reset title="Revenir aux champs d’origine de ce modèle">↺ Réinitialiser</button></div>`;
        ext.openDialog({eyebrow: 'FAIRE-PART ET AFFICHES', title: '📰 Un faire-part, une affiche', submitLabel: 'Créer et ouvrir', wide: true,
            body: `<div class="h-fp-form"><div data-fp-presets></div><div class="h-fp-kinds">${Object.entries(KINDS).map(([k, v]) => `<label class="h-fp-kind"><input type="radio" name="kind" value="${k}" ${k === kind0 ? 'checked' : ''}><span>${esc(v.label)}</span></label>`).join('')}</div>
                <div class="form-grid"><label>Style<select name="style">${Object.entries(STYLES).map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join('')}</select></label><label>Format<select name="format">${formatOptions(pf.format || 'c10')}</select></label>
                    <div class="h-fp-custom span-2" ${pf.format === 'custom' ? '' : 'hidden'}><label>Largeur (cm)<input type="number" name="cw" min="3" max="120" step="0.1" value="${esc(pf.cw || 10)}"></label><label>Hauteur (cm)<input type="number" name="ch" min="3" max="120" step="0.1" value="${esc(pf.ch || 15)}"></label></div>
                    <label>Sens<select name="orient"><option value="port">Portrait</option><option value="land" ${pf.orient === 'land' ? 'selected' : ''}>Paysage</option></select></label>
                    <label><span data-help="Recto-verso : deux faces. Pliée en 2, 3 ou 4 : la carte a plusieurs volets ; le dessin montre les plis (traits roses) et s’imprime face par face, ou sur A4 avec les traits de coupe et de pli (⤓ Exporter → Recto-verso sur A4)." data-help-faq="faire-part plié">Pliage</span><select name="fold">${Object.entries(FOLDS).map(([k, v]) => `<option value="${k}" ${(pf.fold || 'single') === k ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select></label>
                    <div><span class="pk-lab"><span data-help="Les noms, dates, lieux et parents de la fiche remplissent les champs ; relis-les et complète avant de créer.">Remplir depuis une fiche</span></span><span class="h-fp-who" data-fp-who>${(window.LCNDA_PICKER || A()).pickerField({name: 'fp_person', kind: 'person'})}<button type="button" class="button small secondary" data-fp-fill>${personId ? '↻ La personne affichée' : 'Remplir'}</button></span></div></div>
                <div class="form-grid h-fp-fields" data-fp-fields data-dnd-off data-ord-off></div>
                <div class="h-fp-photo"><label class="checkbox-line"><input type="checkbox" name="usephoto"> Avec une photo <small class="muted" data-fp-photo>(celle de la fiche, ou à choisir)</small></label> <button type="button" class="button small secondary" data-fp-pickphoto>🖼 Choisir la photo…</button></div>
                <fieldset class="h-fp-env"><legend><label class="checkbox-line"><input type="checkbox" name="env" ${pf.env ? 'checked' : ''}> ✉️ Enveloppe assortie <span data-help="Une page de plus dans le document : l’enveloppe au bon format (C6, DL, C5 ou carrée, selon la carte), dans le même style, avec l’adresse du destinataire et l’expéditeur. Elle s’imprime à sa taille." data-help-faq="enveloppe assortie"></span></label></legend>
                    <div class="form-grid" data-fp-envbox ${pf.env ? '' : 'hidden'}><label>Format de l’enveloppe<select name="envFmt"><option value="auto">Automatique (selon la carte)</option>${ENVELOPES.map(e => `<option value="${e[0]}" ${pf.envFmt === e[0] ? 'selected' : ''}>${esc(e[1])}</option>`).join('')}</select></label>
                        <div data-fp-envwho><span class="pk-lab">Destinataire</span>${(window.LCNDA_PICKER || A()).pickerField({name: 'env_person', kind: 'person'})}</div>
                        <label class="span-2">Adresse du destinataire<textarea name="envTo" rows="3" placeholder="Prénom NOM&#10;12 rue des Écoles&#10;19000 Tulle"></textarea></label>
                        <label class="span-2">Expéditeur (en haut à gauche)<textarea name="envFrom" rows="2" placeholder="Famille Martin&#10;3 place de l’Église, 19000 Tulle">${esc(pf.envFrom || '')}</textarea></label></div></fieldset>
                <p class="muted">Coche ou décoche un champ pour l’afficher ou le masquer, ↑ ↓ pour le ranger, 🗑 pour l’enlever. Le faire-part s’ouvre ensuite dans le dessin vectoriel : tout se retouche (textes, couleurs, polices, ornements), puis « ⤓ Exporter » (PDF, image, impression, recto-verso sur A4).</p></div>`,
            onOpen: dg => {
                const box = dg.querySelector('[data-fp-fields]');
                const grab = () => fields.forEach(f => { const el = box.querySelector(`[name="f_${CSS.escape(f.key)}"]`); if (el) f.value = el.value; });
                const draw = () => { box.innerHTML = fieldsHtml(); };
                const changed = () => { keepFields(kind, fields); draw(); };
                const setKind = k => { grab(); const old = Object.fromEntries(fields.map(f => [f.role === 'custom' ? f.key : f.role, f.value])); kind = k; fields = fieldsOf(k);
                    fields.forEach(f => { const v = old[f.role === 'custom' ? f.key : f.role]; if (v && f.role === 'name') f.value = v; }); draw(); dg.querySelector('[name=style]').value = KINDS[k].style; };
                setKind(kind0);
                box.addEventListener('click', async e => { const b = e.target.closest('button'); if (!b) return; grab();
                    const i = Number(b.closest('[data-fp-i]')?.dataset.fpI);
                    if (b.matches('[data-fp-up]') && i > 0) { [fields[i - 1], fields[i]] = [fields[i], fields[i - 1]]; changed(); }
                    else if (b.matches('[data-fp-down]') && i < fields.length - 1) { [fields[i + 1], fields[i]] = [fields[i], fields[i + 1]]; changed(); }
                    else if (b.matches('[data-fp-del]')) { fields.splice(i, 1); changed(); }
                    else if (b.matches('[data-fp-it]')) { fields[i].italic = !fields[i].italic; changed(); }
                    else if (b.matches('[data-fp-bd]')) { fields[i].bold = !fields[i].bold; changed(); }
                    else if (b.matches('[data-fp-reset]')) { fields = baseFields(kind).map(f => ({...f, value: fields.find(x => x.key === f.key)?.value || f.value})); changed(); }
                    else if (b.matches('[data-fp-add]')) { const label = await A().askText({title: 'Ajouter un champ', message: 'Nom du champ (par exemple « Lieu de la réception », « Menu », « Citation ») :', placeholder: 'Nom du champ', okLabel: 'Ajouter'});
                        if (label === null || !String(label).trim()) return; fields.push({key: 'x' + uid(), role: 'custom', label: String(label).trim().slice(0, 60), value: '', hidden: false, size: 'n', italic: false, bold: false, multi: true}); changed(); box.querySelector(`[data-fp-i="${fields.length - 1}"] textarea, [data-fp-i="${fields.length - 1}"] input[name]`)?.focus(); } });
                box.addEventListener('change', e => { const t = e.target, i = Number(t.closest('[data-fp-i]')?.dataset.fpI); grab();
                    if (t.matches('[data-fp-vis]')) { fields[i].hidden = !t.checked; t.closest('.h-fp-field').classList.toggle('is-off', fields[i].hidden); keepFields(kind, fields); }
                    else if (t.matches('[data-fp-size]')) { fields[i].size = t.value; keepFields(kind, fields); }
                    else if (t.matches('[data-fp-label]')) { fields[i].label = t.value.trim().slice(0, 60) || 'Champ'; keepFields(kind, fields); }
                    else if (t.matches('[data-fp-back]') && t.value) { const b = baseFields(kind).find(x => x.key === t.value); if (b) { const at = KINDS[kind].fields.findIndex(x => x[0] === b.key); let pos = fields.findIndex(f => KINDS[kind].fields.findIndex(x => x[0] === f.key) > at); fields.splice(pos < 0 ? fields.length : pos, 0, b); changed(); } } });
                dg.addEventListener('change', e => { const t = e.target; if (t.name === 'kind') setKind(t.value);
                    if (['format', 'orient', 'cw', 'ch', 'fold', 'envFmt', 'envFrom'].includes(t.name)) { const p = prefs(); p[t.name] = t.value; savePrefs(p); if (t.name === 'format') dg.querySelector('.h-fp-custom').hidden = t.value !== 'custom'; }
                    if (t.name === 'env') { const p = prefs(); p.env = t.checked; savePrefs(p); dg.querySelector('[data-fp-envbox]').hidden = !t.checked; }
                    if (t.name === 'usephoto' && t.checked && !photoFile) pickPhoto(); });
                // la photo : la fenêtre unique des médias, filtrée sur la personne du faire-part (une photo de l'ordinateur y entre et se coche)
                const pickPhoto = async () => { const m = await window.LCNDA_PICKER?.openMediaPicker?.({types: ['image'], person: personId || null, eyebrow: 'FAIRE-PART', title: 'La photo du faire-part', okLabel: 'Prendre cette photo'});
                    if (!m) { if (!photoFile) dg.querySelector('[name=usephoto]').checked = false; return; }
                    photoFile = m.filename; dg.querySelector('[name=usephoto]').checked = true; dg.querySelector('[data-fp-photo]').textContent = `(${m.title || m.filename})`; };
                dg.querySelector('[data-fp-pickphoto]').addEventListener('click', pickPhoto);
                const fill = async pid => { try { const r = await fillFrom(kind, pid); grab(); Object.entries(r.values).forEach(([k, v]) => { const f = fields.find(x => x.role === k); if (f && v) f.value = v; }); draw(); if (r.photo) { photoFile = r.photo; dg.querySelector('[data-fp-photo]').textContent = '(la photo de la fiche)'; } toast(`Rempli depuis la fiche de ${r.label} : relis et complète.`); } catch (e) { toast(e.message, 'error'); } };
                dg.querySelector('[data-fp-fill]').addEventListener('click', () => { if (personId) fill(personId); else dg.querySelector('[data-fp-who] .pk-search:not([hidden]) .pk-input')?.focus(); });
                dg.querySelector('[data-fp-who]').addEventListener('cp-pick', e => { if (!e.detail.id) return; personId = e.detail.id; fill(personId); });
                dg._fpGrab = () => { grab(); return fields; };
                // ✉️ le destinataire : le menu de choix des personnes remplit l'adresse (modifiable)
                dg.querySelector('[data-fp-envwho]').addEventListener('cp-pick', async e => { e.stopPropagation(); if (!e.detail.id) return; try { const a = await addressOf(e.detail.id), ta = dg.querySelector('[name=envTo]'); ta.value = a; if (!/\n/.test(a)) toast('Pas d’adresse connue dans la fiche : complète-la.'); } catch (err) { toast(err.message, 'error'); } });
                // 💾 réglages enregistrés : modèle, style, format, pliage, enveloppe et champs (sans les textes)
                const f0 = dg.querySelector('form') || dg, fv = n => f0.querySelector(`[name="${n}"]`);
                const pbox = ext.vectorPresets?.({tool: 'faire-part', label: 'ces réglages du faire-part', toolName: 'le faire-part',
                    get: () => { grab(); return {kind, style: fv('style').value, format: fv('format').value, cw: fv('cw').value, ch: fv('ch').value, orient: fv('orient').value, fold: fv('fold').value, env: fv('env').checked, envFmt: fv('envFmt').value, envFrom: fv('envFrom').value, fields: fields.map(({key, role, label, hidden, size, italic, bold}) => ({key, role, label, hidden, size, italic, bold}))}; },
                    set: d => { if (KINDS[d.kind]) { const r = f0.querySelector(`[name=kind][value="${d.kind}"]`); if (r) r.checked = true; if (Array.isArray(d.fields)) keepFields(d.kind, d.fields); setKind(d.kind); }
                        ['style', 'format', 'cw', 'ch', 'orient', 'fold', 'envFmt', 'envFrom'].forEach(k => { const el = fv(k); if (el && d[k] !== undefined && (el.tagName !== 'SELECT' || [...el.options].some(op => op.value === String(d[k])))) el.value = String(d[k]); });
                        fv('env').checked = !!d.env; dg.querySelector('[data-fp-envbox]').hidden = !d.env; dg.querySelector('.h-fp-custom').hidden = fv('format').value !== 'custom';
                        const p = prefs(); ['format', 'orient', 'cw', 'ch', 'fold', 'envFmt', 'envFrom'].forEach(k => { p[k] = fv(k).value; }); p.env = !!d.env; savePrefs(p); }});
                if (pbox) dg.querySelector('[data-fp-presets]').appendChild(pbox);
            },
            onSubmit: async f => {
                const dg = f.closest('dialog') || f, o = Object.fromEntries(new FormData(f)); o.kind = kind; o.fields = (dg._fpGrab ? dg._fpGrab() : fields).map(x => ({...x}));
                if (f.querySelector('[name=usephoto]').checked && photoFile) { const im = typeof photoFile === 'string' ? await toData(photoFile) : await (async () => { const i = await new Promise(ok => { const x = new Image(); x.onload = () => ok(x); x.onerror = () => ok(null); x.src = photoFile.data; }); return i ? {src: photoFile.data, ratio: i.naturalWidth / i.naturalHeight} : null; })(); if (im) { o.photo = im.src; o.photoRatio = Math.max(.55, Math.min(1.4, im.ratio)); } }
                o.env = !!f.querySelector('[name=env]')?.checked;
                const doc = await build(o), nm = o.fields.find(x => x.role === 'name')?.value || '';
                ext.openVectorEditor({doc, name: `${KINDS[o.kind].label.replace(/^\S+\s/, '')} — ${nm}`.trim().replace(/ —$/, ''), personId: personId || 0, onSaved: onDone, onClose: onDone});
            }});
    }
    ext.openCardMaker = openMaker;
    ext.cardInternals = {build, buildOne, fillFrom, addressOf, envFor, KINDS, STYLES, FORMATS, FOLDS, ENVELOPES};
    ext.editToolsExtra = ext.editToolsExtra || [];
    ext.editToolsExtra.push({key: 'cards', icon: '📰', label: 'Faire-part et affiches', what: 'faire-part',
        load: async () => ((await api('vector_docs')).docs || []).filter(d => d.kind === 'card').map(d => ({id: d.id, name: d.name, date: d.updated_at, thumb: d.thumb ? `<img src="${esc(d.thumb)}" alt="">` : '<span class="h-et-ico">📰</span>', info: 'Dessin vectoriel'})),
        open: (id, again) => ext.openVectorEditor?.({id, onSaved: again, onClose: again}),
        create: again => openMaker(again),
        rename: (id, name) => api('rename_vector_doc', {}, {method: 'POST', body: {id, name}}),
        remove: id => api('delete_vector_doc', {}, {method: 'POST', body: {id}}), createLabel: '＋ Nouveau faire-part'});
})();
