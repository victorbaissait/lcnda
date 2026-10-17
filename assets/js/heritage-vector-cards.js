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

    // formats en pixels (96 ppp)
    const FORMATS = [['c10', 'Carte 10 × 15 cm', 378, 567], ['a6', 'A6 (10,5 × 14,8 cm)', 397, 559], ['a5', 'A5 (14,8 × 21 cm)', 559, 794], ['sq', 'Carré 14 × 14 cm', 529, 529], ['a4', 'Affiche A4', 794, 1123], ['a3', 'Affiche A3', 1123, 1587]];
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
        bapteme: {label: '🕊️ Baptême', style: 'nouveau', fields: [['intro', 'Phrase d’ouverture', 'sera baptisé'], ['name', 'Prénom (grand)', ''], ['date', 'Date, heure et église', ''], ['detail', 'Parrain et marraine', ''], ['family', 'Invitation', 'La cérémonie sera suivie d’un repas en famille']]},
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

    async function build(o) {
        const st = STYLES[o.style] ? o.style : 'classique', S = STYLES[st], fmt = FORMATS.find(f => f[0] === o.format) || FORMATS[0], land = o.orient === 'land';
        const W = land ? fmt[3] : fmt[2], H = land ? fmt[2] : fmt[3], u = Math.min(W, H) / 400, maxW = W * .76;
        const texts = [], photo = [];
        let y = H * (o.photo ? .1 : .16);
        if (o.kind === 'presse') { // un avis de journal : colonne étroite, filets, nom en capitales
            const f = S.serif; y = H * .12;
            texts.push(T(String(o.intro || '').toLocaleUpperCase('fr-FR'), W / 2, y, 16 * u, f, S.ink, {bold: true, ls: 2 * u})); y += 26 * u;
            texts.push(T(String(o.name || '').toLocaleUpperCase('fr-FR'), W / 2, y, fitSize(String(o.name || '').toLocaleUpperCase('fr-FR'), f, 30 * u, maxW, true), f, S.ink, {bold: true})); y += 22 * u;
            [o.date, o.detail, o.family].filter(Boolean).forEach(t => { const s = 13 * u, w2 = wrap(t, f, s, maxW); texts.push(T(w2, W / 2, y + s, s, f, S.ink)); y += (w2.split('\n').length * 1.2 + 1) * s; });
            const out = [R(W * .08, H * .06, W * .84, Math.min(H * .88, y), {stroke: S.ink, sw: 1.4 * u, name: 'Filet de l’avis'})];
            return {w: W, h: H, bg: '#ffffff', kind: 'card', objs: [{id: uid(), type: 'group', layer: true, name: 'Cadre', children: out}, {id: uid(), type: 'group', layer: true, name: 'Textes', children: texts}]};
        }
        if (o.photo) { const ph = Math.min(H * .3, W * .45), pw = ph * (o.photoRatio || .78); const clip = {id: uid(), type: 'ellipse', x: n2((W - pw) / 2), y: n2(y), w: n2(pw), h: n2(ph)};
            photo.push({id: uid(), type: 'group', name: 'Photo', clip, children: [{id: uid(), type: 'image', name: 'Photo', src: o.photo, x: clip.x, y: clip.y, w: clip.w, h: clip.h}]}, {...clip, id: uid(), name: 'Cadre de la photo', fill: 'none', stroke: S.accent, sw: n2(2 * u)}); y += ph + 26 * u; }
        const big = String(o.name || '').trim(), introS = 15 * u, bigF = S.script, serif = S.serif;
        if (o.kind === 'bapteme' && big) { texts.push(T(big, W / 2, y + 40 * u, fitSize(big, bigF, 52 * u, maxW), bigF, S.accent, {name: 'Prénom'})); y += 62 * u; if (o.intro) { const w2 = wrap(o.intro, serif, introS, maxW); texts.push(T(w2, W / 2, y + introS, introS, serif, S.ink, {italic: true})); y += (w2.split('\n').length * 1.2 + .6) * introS; } }
        else {
            if (o.intro) { const w2 = wrap(o.intro, serif, introS, maxW); texts.push(T(w2, W / 2, y + introS, introS, serif, S.ink, {italic: st !== 'moderne', ls: o.kind === 'cousinade' || o.kind === 'noces' ? 2 * u : 0})); y += (w2.split('\n').length * 1.2 + .8) * introS; }
            if (big) { const s = fitSize(big, bigF, (o.kind === 'deces' ? 34 : 50) * u, maxW); texts.push(T(big, W / 2, y + s * .95, s, bigF, o.kind === 'deces' ? S.ink : S.accent, {name: 'Nom'})); y += s * 1.4; }
        }
        const sepY = y + 4 * u; y += 20 * u; // le filet se pose après le centrage (plus bas)
        [['date', 17, false], ['detail', 13.5, true], ['family', 13, false]].forEach(([k, s0, it]) => { const t = String(o[k] || '').trim(); if (!t) return; const s = s0 * u, w2 = wrap(t, serif, s, maxW); texts.push(T(w2, W / 2, y + s, s, serif, S.ink, {italic: it, name: {date: 'Date et lieu', detail: 'Détails', family: 'Famille'}[k]})); y += (w2.split('\n').length * 1.25 + .9) * s; });
        // tout le texte descend un peu s'il reste de la place (centré dans la page)
        const room = Math.max(0, H * .9 - y); if (room > 0) [...texts, ...photo].forEach(t => { if (t.y !== undefined) t.y = n2(t.y + room / 2); if (t.clip) t.clip.y = n2(t.clip.y + room / 2); (t.children || []).forEach(c => { c.y = n2(c.y + room / 2); }); });
        texts.push(...sep(st, W, sepY + room / 2, u));
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

    function openMaker(onDone, kind0 = 'naissance') {
        let photoFile = '', personId = Number(A().state.currentPersonId) || 0;
        const fieldsHtml = k => KINDS[k].fields.map(([f, l, dv]) => `<label class="${f === 'intro' || f === 'name' ? '' : 'span-2'}">${esc(l)}${f === 'detail' || f === 'family' || (k === 'presse' && f === 'date') ? `<textarea name="${f}" rows="2">${esc(dv)}</textarea>` : `<input name="${f}" value="${esc(dv)}">`}</label>`).join('');
        ext.openDialog({eyebrow: 'FAIRE-PART ET AFFICHES', title: '📰 Un faire-part, une affiche', submitLabel: 'Créer et ouvrir',
            body: `<div class="h-fp-form"><div class="h-fp-kinds">${Object.entries(KINDS).map(([k, v]) => `<label class="h-fp-kind"><input type="radio" name="kind" value="${k}" ${k === kind0 ? 'checked' : ''}><span>${esc(v.label)}</span></label>`).join('')}</div>
                <div class="form-grid"><label>Style<select name="style">${Object.entries(STYLES).map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join('')}</select></label><label>Format<select name="format">${FORMATS.map(f => `<option value="${f[0]}">${esc(f[1])}</option>`).join('')}</select></label><label>Sens<select name="orient"><option value="port">Portrait</option><option value="land">Paysage</option></select></label>
                    <label>Remplir depuis une fiche<span class="h-fp-who">${A().collectionPersonField('fp_person', null, 'Nom, prénom…')}<button type="button" class="button small secondary" data-fp-fill>${personId ? '↻ La personne affichée' : 'Remplir'}</button></span></label></div>
                <div class="form-grid" data-fp-fields>${fieldsHtml(kind0)}</div>
                <label class="checkbox-line"><input type="checkbox" name="usephoto"> Avec une photo <small class="muted" data-fp-photo>(celle de la fiche, ou à choisir)</small></label><input type="file" name="photofile" accept="image/*" hidden>
                <p class="muted">Le faire-part s’ouvre ensuite dans le dessin vectoriel : tout se retouche (textes, couleurs, polices, ornements), puis Fichier → Imprimer / PDF ou Exporter.</p></div>`,
            onOpen: dg => {
                const form = dg.querySelector('form') || dg, setKind = k => { dg.querySelector('[data-fp-fields]').innerHTML = fieldsHtml(k); dg.querySelector('[name=style]').value = KINDS[k].style; };
                setKind(kind0);
                dg.addEventListener('change', e => { if (e.target.name === 'kind') setKind(e.target.value); if (e.target.name === 'usephoto' && e.target.checked && !photoFile) dg.querySelector('[name=photofile]').click(); if (e.target.name === 'photofile' && e.target.files?.[0]) { const f = e.target.files[0], r = new FileReader(); r.onload = () => { photoFile = {data: r.result}; dg.querySelector('[data-fp-photo]').textContent = `(${f.name})`; }; r.readAsDataURL(f); } });
                const fill = async pid => { const kind = dg.querySelector('[name=kind]:checked').value; try { const r = await fillFrom(kind, pid); Object.entries(r.values).forEach(([k, v]) => { const el = dg.querySelector(`[data-fp-fields] [name=${k}]`); if (el && v) el.value = v; }); if (r.photo) { photoFile = r.photo; dg.querySelector('[data-fp-photo]').textContent = '(la photo de la fiche)'; } toast(`Rempli depuis la fiche de ${r.label} : relis et complète.`); } catch (e) { toast(e.message, 'error'); } };
                dg.querySelector('[data-fp-fill]').addEventListener('click', () => { if (personId) fill(personId); else dg.querySelector('[data-cp-input]').focus(); });
                dg.querySelector('[data-cp-input="fp_person"]').parentElement.addEventListener('cp-pick', e => { personId = e.detail.id; fill(personId); });
                void form;
            },
            onSubmit: async f => {
                const o = Object.fromEntries(new FormData(f)); o.kind = f.querySelector('[name=kind]:checked').value;
                if (f.querySelector('[name=usephoto]').checked && photoFile) { const im = typeof photoFile === 'string' ? await toData(photoFile) : await (async () => { const i = await new Promise(ok => { const x = new Image(); x.onload = () => ok(x); x.onerror = () => ok(null); x.src = photoFile.data; }); return i ? {src: photoFile.data, ratio: i.naturalWidth / i.naturalHeight} : null; })(); if (im) { o.photo = im.src; o.photoRatio = Math.max(.55, Math.min(1.4, im.ratio)); } }
                const doc = await build(o);
                ext.openVectorEditor({doc, name: `${KINDS[o.kind].label.replace(/^\S+\s/, '')} — ${o.name || ''}`.trim(), onSaved: onDone, onClose: onDone});
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
