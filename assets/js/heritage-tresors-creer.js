/**
 * ✨ Trésors — 🎨 Créer et fabriquer :
 *  - 💌 Le faire-part d'un événement de l'arbre : une naissance, un mariage ou un décès choisi, et le faire-part se compose tout seul
 *    (les parents, les dates, les lieux, l'âge), dans le style d'une époque ; le texte se retouche, puis SVG, PNG ou impression.
 *  - ✍️ Le mur des signatures : toutes les signatures repérées sur les documents (visionneuse → « Identifier une signature »),
 *    découpées et rangées par époque, avec le nom de chacun ; une affiche à télécharger.
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const F = ext.tresorFeatures = ext.tresorFeatures || [];

    /* ── 💌 Le faire-part ── */
    const STYLES = {classique: {label: 'Classique (1900)', bg: '#fffdf6', ink: '#2a2016', accent: '#8a6b3a', font: 'Georgia, serif'}, artdeco: {label: 'Art déco (1925)', bg: '#16222e', ink: '#f3e7c9', accent: '#d4af37', font: '"Futura", "Century Gothic", sans-serif'},
        fleuri: {label: 'Fleuri', bg: '#fff7f8', ink: '#4a2a32', accent: '#c96f86', font: 'Georgia, serif'}, moderne: {label: 'Moderne', bg: '#ffffff', ink: '#1d2330', accent: '#2a7de1', font: 'system-ui, sans-serif'}, deuil: {label: 'Deuil (liseré noir)', bg: '#ffffff', ink: '#111111', accent: '#111111', font: 'Georgia, serif'}};
    const couple = (T, a, b) => (a && b ? `${T.name(a)} et ${T.name(b)}` : a || b ? T.name(a || b) : '');
    /** les événements dont on peut faire un faire-part, pour une personne */
    function eventsOf(T, tr, p) {
        const out = []; if (!p) return out;
        if (p.by) out.push({key: 'b', label: `Naissance (${T.dateFr(p.bd, p.by)})`});
        (tr.fams.get(p.id) || []).forEach(f => { const o = tr.byId.get(f.a === p.id ? f.b : f.a); if (o || f.my) out.push({key: 'm' + f.id, label: `Mariage${o ? ` avec ${T.name(o)}` : ''}${f.my ? ` (${T.dateFr(f.md, f.my)})` : ''}`}); });
        if (p.dy) out.push({key: 'd', label: `Décès (${T.dateFr(p.dd, p.dy)})`});
        return out;
    }
    /** les lignes du faire-part : [{t, s: 's'|'m'|'l'}] et le style conseillé */
    function announce(T, tr, p, key) {
        const at = (d, y, pl) => `${d ? 'le ' : 'en '}${T.dateFr(d, y)}${pl ? ` à ${T.place(tr, pl)}` : ''}`, f = p.gender === 'female';
        if (key === 'b') { const fa = tr.byId.get(p.father), mo = tr.byId.get(p.mother);
            return {style: (p.by || 2000) < 1915 ? 'classique' : (p.by < 1940 ? 'artdeco' : 'fleuri'), lines: [couple(T, fa, mo) && {t: couple(T, fa, mo), s: 'm'}, {t: `${fa && mo ? 'ont' : 'a'} la joie de vous annoncer la naissance de ${fa || mo ? (f ? 'leur fille' : 'leur fils').replace(/^leur/, fa && mo ? 'leur' : f ? 'sa' : 'son') : ''}`.trim(), s: 's'}, {t: p.first || T.name(p), s: 'l'}, {t: at(p.bd, p.by, p.bplace), s: 's'}].filter(Boolean)}; }
        if (key === 'd') { const a = T.ageAt(p, p.dd, p.dy), kids = [...new Set(tr.kids.get(p.id) || [])].map(k => tr.byId.get(k)).filter(Boolean), sp = (tr.fams.get(p.id) || []).map(fa => tr.byId.get(fa.a === p.id ? fa.b : fa.a)).filter(Boolean);
            return {style: 'deuil', lines: [{t: 'On nous prie d’annoncer le décès de', s: 's'}, {t: T.name(p), s: 'l'}, {t: `${f ? 'survenue' : 'survenu'} ${at(p.dd, p.dy, p.dplace)}${a != null ? `, dans sa ${a + 1}e année` : ''}`, s: 's'}, p.occ && {t: p.occ, s: 's'},
                (sp.length || kids.length) && {t: 'De la part de', s: 's'}, sp.length && {t: sp.map(x => `${x.gender === 'female' ? 'Madame' : 'Monsieur'} ${T.name(x)}, ${x.gender === 'female' ? 'son épouse' : 'son époux'}`).join(' ; '), s: 'm'},
                kids.length && {t: `${kids.map(k => T.name(k)).join(', ')}, ${kids.length > 1 ? 'ses enfants' : kids[0].gender === 'female' ? 'sa fille' : 'son fils'}`, s: 'm'}].filter(Boolean)}; }
        const fam = tr.families.find(x => 'm' + x.id === key); if (!fam) return {style: 'classique', lines: []};
        const a = tr.byId.get(fam.a), b = tr.byId.get(fam.b), par = x => couple(T, tr.byId.get(x?.father), tr.byId.get(x?.mother));
        return {style: (fam.my || 2000) < 1915 ? 'classique' : (fam.my < 1940 ? 'artdeco' : 'fleuri'), lines: [par(a) && {t: par(a), s: 'm'}, par(b) && {t: par(b), s: 'm'}, {t: par(a) || par(b) ? 'ont l’honneur de vous faire part du mariage de leurs enfants' : 'ont la joie de vous faire part de leur mariage', s: 's'},
            {t: `${a?.first || T.name(a)} & ${b?.first || T.name(b)}`, s: 'l'}, (fam.my || fam.mplace) && {t: `célébré ${fam.my ? at(fam.md, fam.my, fam.mplace) : `à ${T.place(tr, fam.mplace)}`}`, s: 's'}].filter(Boolean)};
    }
    const wrap = (t, n) => { const out = []; let cur = ''; String(t).split(/\s+/).forEach(w => { if ((cur + ' ' + w).trim().length > n && cur) { out.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }); if (cur) out.push(cur); return out; };
    function cardSvg(T, lines, styleKey) {
        const S = STYLES[styleKey] || STYLES.classique, W = 600, H = 850, size = {s: 22, m: 27, l: 58}, per = {s: 40, m: 34, l: 18};
        const rows = lines.flatMap(l => wrap(l.t, per[l.s] || 40).map(t => ({t, s: l.s}))), total = rows.reduce((n, r) => n + size[r.s] * 1.55, 0) + 30 * lines.length;
        let y = (H - total) / 2 + 20; const txt = rows.map(r => { const fs = size[r.s]; y += fs * 1.35; const el = `<text x="${W / 2}" y="${y.toFixed(1)}" font-size="${fs}" ${r.s === 'l' ? `fill="${S.accent}" font-style="${styleKey === 'artdeco' || styleKey === 'moderne' ? 'normal' : 'italic'}" font-weight="700"` : ''}>${T.esc(r.t)}</text>`; y += fs * 0.25 + (r.s === 'l' ? 14 : 4); return el; }).join('');
        const deco = {classique: `<rect x="24" y="24" width="${W - 48}" height="${H - 48}" fill="none" stroke="${S.accent}" stroke-width="3"/><rect x="34" y="34" width="${W - 68}" height="${H - 68}" fill="none" stroke="${S.accent}" stroke-width="1"/><path d="M${W / 2 - 60} 110 q60 -30 120 0 M${W / 2 - 60} ${H - 110} q60 30 120 0" fill="none" stroke="${S.accent}" stroke-width="2"/>`,
            artdeco: `<rect x="22" y="22" width="${W - 44}" height="${H - 44}" fill="none" stroke="${S.accent}" stroke-width="2"/>${[0, 1, 2].map(i => `<path d="M${W / 2} ${60 + i * 14} L${W / 2 - 120 + i * 30} ${130} M${W / 2} ${60 + i * 14} L${W / 2 + 120 - i * 30} 130 M${W / 2} ${H - 60 - i * 14} L${W / 2 - 120 + i * 30} ${H - 130} M${W / 2} ${H - 60 - i * 14} L${W / 2 + 120 - i * 30} ${H - 130}" stroke="${S.accent}" stroke-width="1.5"/>`).join('')}`,
            fleuri: [[60, 60], [W - 60, 60], [60, H - 60], [W - 60, H - 60]].map(([cx, cy]) => `<g fill="${S.accent}" opacity=".8">${[0, 72, 144, 216, 288].map(a => `<ellipse cx="${cx}" cy="${cy - 16}" rx="9" ry="17" transform="rotate(${a} ${cx} ${cy})"/>`).join('')}<circle cx="${cx}" cy="${cy}" r="7" fill="#e8c35a"/></g>`).join(''),
            moderne: `<rect x="0" y="0" width="${W}" height="26" fill="${S.accent}"/><rect x="0" y="${H - 26}" width="${W}" height="26" fill="${S.accent}"/>`,
            deuil: `<rect x="14" y="14" width="${W - 28}" height="${H - 28}" fill="none" stroke="#111" stroke-width="14"/><path d="M${W / 2 - 14} 120 h28 M${W / 2} 104 v34" stroke="#111" stroke-width="3"/>`}[styleKey] || '';
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="${S.bg}"/>${deco}<g text-anchor="middle" font-family='${S.font}' fill="${S.ink}">${txt}</g></svg>`;
    }
    const svgToPng = (svg, scale = 2) => new Promise((res, rej) => { const img = new Image(); img.onload = () => { const c = document.createElement('canvas'); c.width = img.width * scale; c.height = img.height * scale; const x = c.getContext('2d'); x.scale(scale, scale); x.drawImage(img, 0, 0); c.toBlob(b => (b ? res(b) : rej(new Error('image impossible'))), 'image/png'); }; img.onerror = () => rej(new Error('image impossible')); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); });
    async function renderCard(host, T) {
        const tr = await T.tree(), st = T.start(tr), first = tr.people.find(p => p.by && !p.living) || st;
        host.innerHTML = `<div class="h-tr-split"><form class="h-tr-panel" data-fp><div><span class="pk-lab">La personne</span>${T.personField('who', first?.id)}</div>
            <label>L’événement<select name="ev"></select></label><label>Le style<select name="st">${Object.entries(STYLES).map(([k, s]) => `<option value="${k}">${T.esc(s.label)}</option>`).join('')}</select></label>
            <label style="display:grid">Le texte (une ligne par ligne ; * devant une ligne = en grand)<textarea name="txt" rows="9"></textarea></label>
            <p class="h-tr-row"><button type="button" class="button" data-fp-png>⬇ Image PNG</button><button type="button" class="button secondary" data-fp-svg>⬇ SVG</button><button type="button" class="button secondary" data-fp-print>🖨 Imprimer</button></p></form>
            <div data-fp-out class="h-tr-fp-out"></div></div>`;
        const form = host.querySelector('[data-fp]'), out = host.querySelector('[data-fp-out]'), el = n => form.elements[n];
        const parse = () => el('txt').value.split('\n').map(s => s.trim()).filter(Boolean).map(s => (s.startsWith('*') ? {t: s.slice(1).trim(), s: 'l'} : {t: s, s: s.length < 34 && /[A-ZÉ]{2,}/.test(s) ? 'm' : 's'}));
        const paint = () => { out.innerHTML = cardSvg(T, parse(), el('st').value); };
        const compose = () => { const p = tr.byId.get(Number(el('who').value)), evs = eventsOf(T, tr, p), cur = el('ev').value;
            el('ev').innerHTML = evs.length ? evs.map(e => `<option value="${e.key}">${T.esc(e.label)}</option>`).join('') : '<option value="">(aucun événement daté)</option>';
            if (evs.some(e => e.key === cur)) el('ev').value = cur;
            const a = p && el('ev').value ? announce(T, tr, p, el('ev').value) : {lines: [], style: 'classique'};
            el('txt').value = a.lines.map(l => (l.s === 'l' ? '* ' : '') + l.t).join('\n'); el('st').value = a.style; paint(); };
        form.addEventListener('change', e => { if (e.target.name === 'who' || e.target.name === 'ev') compose(); else paint(); });
        el('txt').addEventListener('input', paint);
        const fname = () => `faire-part-${(tr.byId.get(Number(el('who').value))?.first || 'famille').toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-')}`;
        host.addEventListener('click', async e => {
            const svg = () => cardSvg(T, parse(), el('st').value);
            if (e.target.closest('[data-fp-svg]')) T.download(fname() + '.svg', new Blob([svg()], {type: 'image/svg+xml'}));
            if (e.target.closest('[data-fp-png]')) { try { T.download(fname() + '.png', await svgToPng(svg())); } catch (err) { T.toast(err.message, 'error'); } }
            if (e.target.closest('[data-fp-print]')) ext.tresorPrint('Faire-part', 'section{display:grid;place-items:center;padding:10mm}section svg{width:148mm;height:auto;background:#fff;box-shadow:0 2px 12px #0004}@media print{section svg{box-shadow:none}}', `<section>${svg()}</section>`);
        });
        compose();
    }
    F.push({key: 'faire-part', group: 'creer', icon: '💌', title: 'Le faire-part d’un événement', desc: 'Une naissance, un mariage ou un décès de l’arbre : le faire-part se compose tout seul, dans le style de l’époque.', render: renderCard});
    ext.tresorCard = {announce, cardSvg, eventsOf, svgToPng};

    /* ── ✍️ Le mur des signatures ── */
    const PERIODS = [[0, 1699, 'Avant 1700'], [1700, 1789, 'Le XVIIIe siècle'], [1790, 1815, 'Révolution et Empire'], [1816, 1870, 'Le XIXe siècle'], [1871, 1914, 'La Belle Époque'], [1915, 1945, 'Les deux guerres'], [1946, 9999, 'Depuis 1946']];
    const loadImg = src => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
    function cropTo(img, s, h = 90) { const sx = s.x / 100 * img.naturalWidth, sy = s.y / 100 * img.naturalHeight, sw = Math.max(1, s.w / 100 * img.naturalWidth), sh = Math.max(1, s.h / 100 * img.naturalHeight), c = document.createElement('canvas'); c.height = h; c.width = Math.round(Math.min(4, sw / sh) * h); c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height); return c; }
    async function renderSignatures(host, T) {
        const tr = await T.tree(), r = await T.api('tresor_signatures').catch(() => ({signatures: []})), sigs = (r.signatures || []).map(s => { const p = tr.byId.get(s.person_id); return {...s, p, yr: s.year || (p?.by ? p.by + 30 : null)}; }).sort((a, b) => (a.yr || 9999) - (b.yr || 9999));
        if (!sigs.length) { host.innerHTML = '<div class="h-tr-panel"><p>Aucune signature repérée pour l’instant.</p><p class="h-tr-muted">Ouvre un acte dans la visionneuse des médias, puis « ＋ Identifier une signature » : encadre la signature et dis de qui elle est. Elle viendra se poser ici, rangée par époque.</p></div>'; return; }
        host.innerHTML = `<div class="h-tr-row h-tr-noprint"><span class="h-tr-big">${sigs.length} signature${sigs.length > 1 ? 's' : ''}</span><button type="button" class="button" data-sg-poster>⬇ L’affiche (PNG)</button></div><div data-sg-wall></div>`;
        const wall = host.querySelector('[data-sg-wall]'), imgs = new Map();
        for (const s of sigs) if (!imgs.has(s.filename)) imgs.set(s.filename, await loadImg(`media/${encodeURIComponent(s.filename)}`));
        PERIODS.forEach(([a, b, label]) => { const l = sigs.filter(s => s.yr != null && s.yr >= a && s.yr <= b); if (!l.length) return; wall.insertAdjacentHTML('beforeend', `<h3>${T.esc(label)}</h3><div class="h-tr-sigs" data-sg-p="${a}"></div>`);
            const box = wall.querySelector(`[data-sg-p="${a}"]`); l.forEach(s => { const img = imgs.get(s.filename), fig = document.createElement('figure'); fig.className = 'h-tr-sig'; if (img) fig.appendChild(cropTo(img, s)); fig.insertAdjacentHTML('beforeend', `<figcaption><b>${T.esc(s.p ? T.name(s.p) : '?')}</b>${s.yr ? ` · ${s.year ? '' : 'vers '}${s.yr}` : ''}</figcaption>`); box.appendChild(fig); }); });
        const undated = sigs.filter(s => s.yr == null); if (undated.length) { wall.insertAdjacentHTML('beforeend', '<h3>Sans date</h3><div class="h-tr-sigs" data-sg-p="x"></div>'); undated.forEach(s => { const img = imgs.get(s.filename), fig = document.createElement('figure'); fig.className = 'h-tr-sig'; if (img) fig.appendChild(cropTo(img, s)); fig.insertAdjacentHTML('beforeend', `<figcaption><b>${T.esc(s.p ? T.name(s.p) : '?')}</b></figcaption>`); wall.querySelector('[data-sg-p="x"]').appendChild(fig); }); }
        host.querySelector('[data-sg-poster]').addEventListener('click', () => {
            const W = 1600, cols = 4, cw = W / cols, ch = 170, rows = Math.ceil(sigs.length / cols), c = document.createElement('canvas'); c.width = W; c.height = 160 + rows * ch + 40; const x = c.getContext('2d');
            x.fillStyle = '#fbf6ea'; x.fillRect(0, 0, c.width, c.height); x.fillStyle = '#3a2c1a'; x.textAlign = 'center'; x.font = 'italic 54px Georgia'; x.fillText(`Les signatures de la famille ${T.start(tr)?.last || ''}`.trim(), W / 2, 95);
            sigs.forEach((s, k) => { const cx = (k % cols) * cw, cy = 160 + Math.floor(k / cols) * ch, img = imgs.get(s.filename); if (img) { const cr = cropTo(img, s, 100), w = Math.min(cw - 30, cr.width); x.drawImage(cr, cx + (cw - w) / 2, cy, w, w / cr.width * 100); }
                x.font = '22px Georgia'; x.fillText(`${s.p ? T.name(s.p) : '?'}${s.yr ? ` (${s.yr})` : ''}`, cx + cw / 2, cy + 135); });
            c.toBlob(b => b && T.download('mur-des-signatures.png', b), 'image/png');
        });
    }
    F.push({key: 'signatures', group: 'creer', icon: '✍️', title: 'Le mur des signatures', desc: 'Toutes les signatures repérées sur les actes, découpées et rangées par époque : l’écriture de chaque génération.', render: renderSignatures});
})();
