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
    /* mesure, pour que les textes tiennent dans la largeur */
    let mc = null; const measure = (t, font, size, bold) => { mc = mc || document.createElement('canvas').getContext('2d'); mc.font = `${bold ? 'bold ' : ''}${size}px ${font}`; return Math.max(...String(t || ' ').split('\n').map(l => mc.measureText(l).width)); };
    const fitSize = (t, font, max, maxW, bold) => { let s = max; while (s > 6 && measure(t, font, s, bold) > maxW) s *= .93; return s; };
    const wrap = (t, font, size, maxW) => String(t || '').split('\n').flatMap(par => { const out = []; let line = ''; par.split(/\s+/).filter(Boolean).forEach(w => { const tt = line ? line + ' ' + w : w; if (measure(tt, font, size) > maxW && line) { out.push(line); line = w; } else line = tt; }); out.push(line); return out; }).join('\n');
    const T = (text, x, y, size, font, fill, o = {}) => ({id: uid(), type: 'text', name: o.name || String(text).split('\n')[0].slice(0, 30), text, x: n2(x), y: n2(y), size: n2(size), font, align: 'middle', fill, sw: 0, ...(o.bold ? {bold: true} : {}), ...(o.italic ? {italic: true} : {}), ...(o.ls ? {ls: o.ls} : {})});

    /* o.fields : les champs dans l'ordre, [{key, role, label, value, hidden, size, italic}] ; role = intro, name, date, detail, family ou custom */
    const CSIZE = {s: 12, n: 14, l: 20, t: 36};
    async function build(o) {
        const st = STYLES[o.style] ? o.style : 'classique', S = STYLES[st];
        const fmt = o.format === 'custom' ? ['custom', '', CM(Math.min(120, Math.max(3, Number(o.cw) || 10))), CM(Math.min(120, Math.max(3, Number(o.ch) || 15)))] : (FORMATS.find(f => f[0] === o.format) || FORMATS[0]), land = o.orient === 'land';
        const W = land ? fmt[3] : fmt[2], H = land ? fmt[2] : fmt[3], u = Math.min(W, H) / 400, maxW = W * .76;
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
            body: `<div class="h-fp-form"><div class="h-fp-kinds">${Object.entries(KINDS).map(([k, v]) => `<label class="h-fp-kind"><input type="radio" name="kind" value="${k}" ${k === kind0 ? 'checked' : ''}><span>${esc(v.label)}</span></label>`).join('')}</div>
                <div class="form-grid"><label>Style<select name="style">${Object.entries(STYLES).map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join('')}</select></label><label>Format<select name="format">${formatOptions(pf.format || 'c10')}</select></label>
                    <div class="h-fp-custom span-2" ${pf.format === 'custom' ? '' : 'hidden'}><label>Largeur (cm)<input type="number" name="cw" min="3" max="120" step="0.1" value="${esc(pf.cw || 10)}"></label><label>Hauteur (cm)<input type="number" name="ch" min="3" max="120" step="0.1" value="${esc(pf.ch || 15)}"></label></div>
                    <label>Sens<select name="orient"><option value="port">Portrait</option><option value="land" ${pf.orient === 'land' ? 'selected' : ''}>Paysage</option></select></label>
                    <div><span class="pk-lab">Remplir depuis une fiche</span><span class="h-fp-who" data-fp-who>${(window.LCNDA_PICKER || A()).pickerField({name: 'fp_person', kind: 'person'})}<button type="button" class="button small secondary" data-fp-fill>${personId ? '↻ La personne affichée' : 'Remplir'}</button></span></div></div>
                <div class="form-grid h-fp-fields" data-fp-fields data-dnd-off data-ord-off></div>
                <div class="h-fp-photo"><label class="checkbox-line"><input type="checkbox" name="usephoto"> Avec une photo <small class="muted" data-fp-photo>(celle de la fiche, ou à choisir)</small></label> <button type="button" class="button small secondary" data-fp-pickphoto>🖼 Choisir la photo…</button></div>
                <p class="muted">Coche ou décoche un champ pour l’afficher ou le masquer, ↑ ↓ pour le ranger, 🗑 pour l’enlever. Le faire-part s’ouvre ensuite dans le dessin vectoriel : tout se retouche (textes, couleurs, polices, ornements), puis Fichier → Imprimer / PDF ou Exporter.</p></div>`,
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
                    if (['format', 'orient', 'cw', 'ch'].includes(t.name)) { const p = prefs(); p[t.name] = t.value; savePrefs(p); if (t.name === 'format') dg.querySelector('.h-fp-custom').hidden = t.value !== 'custom'; }
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
            },
            onSubmit: async f => {
                const dg = f.closest('dialog') || f, o = Object.fromEntries(new FormData(f)); o.kind = kind; o.fields = (dg._fpGrab ? dg._fpGrab() : fields).map(x => ({...x}));
                if (f.querySelector('[name=usephoto]').checked && photoFile) { const im = typeof photoFile === 'string' ? await toData(photoFile) : await (async () => { const i = await new Promise(ok => { const x = new Image(); x.onload = () => ok(x); x.onerror = () => ok(null); x.src = photoFile.data; }); return i ? {src: photoFile.data, ratio: i.naturalWidth / i.naturalHeight} : null; })(); if (im) { o.photo = im.src; o.photoRatio = Math.max(.55, Math.min(1.4, im.ratio)); } }
                const doc = await build(o), nm = o.fields.find(x => x.role === 'name')?.value || '';
                ext.openVectorEditor({doc, name: `${KINDS[o.kind].label.replace(/^\S+\s/, '')} — ${nm}`.trim().replace(/ —$/, ''), onSaved: onDone, onClose: onDone});
            }});
    }
    ext.openCardMaker = openMaker;
    ext.cardInternals = {build, fillFrom, KINDS, STYLES, FORMATS};
    ext.editToolsExtra = ext.editToolsExtra || [];
    ext.editToolsExtra.push({key: 'cards', icon: '📰', label: 'Faire-part et affiches', what: 'faire-part',
        load: async () => ((await api('vector_docs')).docs || []).filter(d => d.kind === 'card').map(d => ({id: d.id, name: d.name, date: d.updated_at, thumb: d.thumb ? `<img src="${esc(d.thumb)}" alt="">` : '<span class="h-et-ico">📰</span>', info: 'Dessin vectoriel'})),
        open: (id, again) => ext.openVectorEditor?.({id, onSaved: again, onClose: again}),
        create: again => openMaker(again),
        rename: (id, name) => api('rename_vector_doc', {}, {method: 'POST', body: {id, name}}),
        remove: id => api('delete_vector_doc', {}, {method: 'POST', body: {id}}), createLabel: '＋ Nouveau faire-part'});
})();
