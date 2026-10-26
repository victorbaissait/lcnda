/**
 * ✨ Trésors — 🎲 Jouer en famille :
 *  - 🃏 Jeu des 7 familles : sept familles de l'arbre (par nom de famille ou par branche), six cartes chacune avec photo, dates,
 *    métier et lieu, et au bas de chaque carte les cinq autres membres à demander ; planches à imprimer et découper.
 *  - 🖍️ Arbre à colorier : les ancêtres de quelqu'un sur un grand arbre en traits noirs, feuilles et oiseaux à colorier.
 *  - 📺 Le quiz du repas : sur la télé, en équipes, des questions tirées de l'arbre, compte à rebours, points au clavier.
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const F = ext.tresorFeatures = ext.tresorFeatures || [];
    const COLORS = ['#c0392b', '#2471a3', '#1e8449', '#b9770e', '#7d3c98', '#117a65', '#a04000', '#2e4053', '#b03a2e', '#1f618d'];
    /** une fenêtre d'impression (le même genre que la mise en page) */
    function printWindow(title, css, body) {
        const w = window.open('', '_blank'); if (!w) throw new Error('fenêtre bloquée : autorise les fenêtres pour cette page.');
        w.document.open(); w.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${title}</title><base href="${location.href.replace(/[^/]*$/, '')}"><style>body{margin:0;font-family:system-ui,sans-serif;background:#888}.bar{position:sticky;top:0;display:flex;gap:10px;align-items:center;padding:10px 16px;background:#111;color:#fff;font:14px system-ui;z-index:9}.bar button{font:inherit;padding:6px 14px;border:0;border-radius:6px;background:#2f6bff;color:#fff;cursor:pointer}@media print{.bar{display:none}body{background:none}}${css}</style></head><body><div class="bar"><b>${title}</b><span style="flex:1"></span><button onclick="print()">🖨 Imprimer</button></div>${body}</body></html>`); w.document.close();
        return w;
    }
    ext.tresorPrint = printWindow;

    /* ── 🃏 Jeu des 7 familles ── */
    function buildFamilies(T, tr, mode, n = 7) {
        const groups = new Map(), add = (k, p) => { if (!k) return; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p); };
        if (mode === 'branch') {
            // une famille = les ancêtres d'un des arrière-grands-parents (ou plus haut si l'arbre est petit)
            const st = T.start(tr); if (!st) return [];
            // la génération de « têtes de branche » qui donne le plus de familles d'au moins six (avec leurs frères et sœurs)
            const branch = h => { const hp = tr.byId.get(h.id), ids = new Set([h.id, ...T.ancestors(tr, h.id, 12).map(a => a.id)]); [...ids].forEach(id => { const p = tr.byId.get(id); [p.father, p.mother].filter(Boolean).forEach(par => (tr.kids.get(par) || []).forEach(k => ids.add(k))); }); return [hp, [...ids].map(i => tr.byId.get(i)).filter(p => p && !p.living)]; };
            const tries = [4, 3, 2, 1].map(g => T.ancestors(tr, st.id, g).filter(a => a.gen === g).map(branch)), best = tries.sort((a, b) => b.filter(x => x[1].length >= 6).length - a.filter(x => x[1].length >= 6).length)[0] || [];
            best.forEach(([hp, l]) => l.forEach(p => add(`Branche ${hp.last || T.name(hp)}${hp.first ? ` (${hp.first})` : ''}`, p)));
        } else tr.people.forEach(p => { if (!p.living && p.last) add(p.last.toUpperCase(), p); });
        const score = p => (p.portrait ? 3 : 0) + (p.by ? 1 : 0) + (p.occ ? 1 : 0) + (p.dy ? 0.5 : 0);
        return [...groups.entries()].filter(([, l]) => l.length >= 6).map(([k, l]) => ({name: k, people: l.sort((a, b) => score(b) - score(a)).slice(0, 6).sort((a, b) => (a.by || 9999) - (b.by || 9999))}))
            .sort((a, b) => b.people.reduce((s, p) => s + score(p), 0) - a.people.reduce((s, p) => s + score(p), 0)).slice(0, n);
    }
    const ROLE = (i, p) => [['Le grand-père', 'La grand-mère'], ['Le grand-père', 'La grand-mère'], ['Le père', 'La mère'], ['Le père', 'La mère'], ['Le fils', 'La fille'], ['Le fils', 'La fille']][i][p.gender === 'female' ? 1 : 0];
    /* Les réglages du jeu (sur cet ordinateur) : le style, les couleurs, ce qui s'écrit, et la photo choisie et recadrée de chacun */
    const SEVEN_KEY = 'lcnda-7familles';
    const SEVEN_STYLES = {classique: '🃏 Classique', ancien: '📜 Ancien (papier jauni)', moderne: '◻️ Moderne (grande photo)', enfant: '🧸 Pour les petits', artdeco: '🎩 Années folles', bois: '🪵 Bois gravé'};
    const sevenPrefs = () => { try { const o = JSON.parse(localStorage.getItem(SEVEN_KEY) || '{}'); return {style: 'classique', fx: 'sepia', show: {dates: true, occ: true, place: true, others: true}, colors: {}, photos: {}, back: 'motif', ...o, show: {dates: true, occ: true, place: true, others: true, ...(o.show || {})}}; } catch (_) { return {style: 'classique', fx: 'sepia', show: {dates: true, occ: true, place: true, others: true}, colors: {}, photos: {}, back: 'motif'}; } };
    const sevenSave = p => { try { localStorage.setItem(SEVEN_KEY, JSON.stringify(p)); } catch (_) {} };
    /** la photo d'une carte : celle choisie (recadrée), sinon le portrait de la fiche ; '' = sans photo */
    function photoOf(T, p, prefs) { const c = prefs.photos?.[p.id]; if (c?.none) return null; if (c?.file) return {src: `media/${encodeURIComponent(c.file)}`, x: c.x ?? 50, y: c.y ?? 50, z: c.z ?? 1}; const u = T.portraitUrl(p); return u ? {src: u, x: 50, y: 35, z: 1} : null; }
    const imgTag = ph => `<img src="${ph.src}" alt="" style="object-position:${ph.x}% ${ph.y}%;transform:scale(${ph.z});transform-origin:${ph.x}% ${ph.y}%">`;
    function cardHtml(T, tr, fam, i, color, prefs = sevenPrefs(), edit = false) {
        const p = fam.people[i], ph = photoOf(T, p, prefs), sh = prefs.show;
        return `<div class="card s-${prefs.style} fx-${prefs.fx}" style="--c:${color}"><div class="head"><span>${T.esc(fam.name)}</span><b>${i + 1}</b></div>
            <div class="ph">${ph ? imgTag(ph) : `<span>${p.gender === 'female' ? '👩' : '👨'}</span>`}${edit ? `<button type="button" class="ph-edit" data-7-ph="${p.id}" title="Choisir et recadrer la photo de ${T.esc(T.name(p))}">📷</button>` : ''}</div>
            <div class="role">${T.esc(ROLE(i, p))}</div><div class="nm">${T.esc(T.name(p))}</div>
            <div class="info">${T.esc([sh.dates && T.life(p), sh.occ && p.occ, sh.place && T.place(tr, p.bplace)].filter(Boolean).join(' · '))}</div>
            ${sh.others ? `<ol class="others">${fam.people.map((q, k) => `<li class="${k === i ? 'me' : ''}">${T.esc(q.first || T.name(q))}</li>`).join('')}</ol>` : ''}</div>`;
    }
    const backHtml = (title, color, prefs) => `<div class="card back s-${prefs.style}" style="--c:${color}"><div class="back-in"><b>${title}</b><small>Jeu des familles</small></div></div>`;
    const CARD_CSS = `.sheet{display:grid;grid-template-columns:repeat(3,63mm);gap:4mm;justify-content:center;padding:8mm;background:#fff;width:210mm;box-sizing:border-box;margin:12px auto;break-after:page}
        .sheet.backs{direction:rtl}
        .card{box-sizing:border-box;width:63mm;height:88mm;border:1.2mm solid var(--c);border-radius:4mm;padding:2.5mm;display:flex;flex-direction:column;gap:1.2mm;font-size:8.5pt;color:#111;background:#fff;break-inside:avoid;position:relative;overflow:hidden;direction:ltr}
        .head{display:flex;justify-content:space-between;align-items:center;background:var(--c);color:#fff;margin:-2.5mm -2.5mm 0;padding:1.5mm 2.5mm;font-weight:800;letter-spacing:.04em}.head b{background:#fff;color:var(--c);border-radius:50%;width:6mm;height:6mm;display:grid;place-items:center}
        .ph{height:30mm;display:grid;place-items:center;background:#f3f1ec;border-radius:2mm;overflow:hidden;position:relative}.ph img{width:100%;height:100%;object-fit:cover}.ph span{font-size:28pt}
        .fx-sepia .ph img{filter:sepia(.55) contrast(1.05)}.fx-nb .ph img{filter:grayscale(1) contrast(1.08)}.fx-couleur .ph img{filter:none}
        .ph-edit{position:absolute;right:1.5mm;bottom:1.5mm;border:0;border-radius:50%;width:8mm;height:8mm;background:#fff;box-shadow:0 1px 4px #0006;cursor:pointer;font-size:11pt;line-height:1}
        .role{font-weight:800;color:var(--c);text-transform:uppercase;font-size:8pt}.nm{font-weight:800;font-size:10pt;line-height:1.1}.info{color:#444;font-size:7.5pt;line-height:1.2}
        .others{margin:auto 0 0;padding-left:4mm;font-size:7pt;color:#555;columns:2}.others .me{font-weight:800;color:var(--c)}
        .s-ancien{background:#f4ead2;border-color:#6b5532;border-width:.8mm;outline:.4mm solid #6b5532;outline-offset:-2mm;font-family:Georgia,serif;color:#3a2c14}.s-ancien .head{background:none;color:#6b5532;border-bottom:.4mm solid #6b5532;font-variant:small-caps;letter-spacing:.08em;margin:0;padding:1mm 0}.s-ancien .head b{background:var(--c);color:#fff}.s-ancien .ph{border:.4mm solid #6b5532;border-radius:50%/40%;background:#e8dcbc}.s-ancien .role{color:#6b5532;font-style:italic;text-transform:none;font-size:9pt}.s-ancien .nm{text-align:center}.s-ancien .info{text-align:center;color:#5a4a2a}
        .s-moderne{border:0;border-radius:3mm;box-shadow:inset 0 0 0 .5mm #ddd;padding:0}.s-moderne .head{margin:0;position:absolute;inset:0 0 auto;z-index:1;background:linear-gradient(#0009,#0000);padding:2mm 3mm 6mm}.s-moderne .ph{height:48mm;border-radius:0}.s-moderne .role,.s-moderne .nm,.s-moderne .info,.s-moderne .others{margin-left:3mm;margin-right:3mm}.s-moderne .role{margin-top:1mm;background:var(--c);color:#fff;align-self:flex-start;padding:.3mm 2mm;border-radius:2mm;font-size:7pt}.s-moderne .others{margin-bottom:2mm}
        .s-enfant{border-width:2mm;border-style:dashed;border-radius:7mm;font-family:"Comic Sans MS","Chalkboard SE",cursive}.s-enfant .head{border-radius:4mm 4mm 0 0}.s-enfant .ph{border-radius:50%;width:32mm;height:32mm;margin:0 auto;border:1mm solid var(--c)}.s-enfant .nm{font-size:11pt;text-align:center}.s-enfant .role{text-align:center;font-size:9pt}.s-enfant .info{text-align:center}
        .s-artdeco{background:#14171c;color:#efe6cc;border:.8mm solid #c9a24a;border-radius:1mm;font-family:Georgia,serif}.s-artdeco .head{background:none;color:#c9a24a;border-bottom:.5mm double #c9a24a;margin:0;padding:1mm 0;text-transform:uppercase;letter-spacing:.2em;font-size:7pt}.s-artdeco .head b{background:#c9a24a;color:#14171c;border-radius:0;transform:rotate(45deg)}.s-artdeco .ph{border:.5mm solid #c9a24a;border-radius:0;clip-path:polygon(12% 0,88% 0,100% 15%,100% 100%,0 100%,0 15%)}.s-artdeco .role{color:#c9a24a;letter-spacing:.1em}.s-artdeco .info,.s-artdeco .others{color:#cdbf9c}.s-artdeco .others .me{color:#fff}
        .s-bois{background:repeating-linear-gradient(95deg,#d8b98a 0 3mm,#cfae7d 3mm 5mm,#dcc093 5mm 9mm);border-color:#5b3a1a;color:#2b1a08;font-family:Georgia,serif}.s-bois .head{background:#5b3a1a;color:#f6e7c8}.s-bois .head b{color:#5b3a1a}.s-bois .ph{border:.6mm solid #5b3a1a;background:#e9d4ad}.s-bois .role{color:#5b3a1a}.s-bois .info,.s-bois .others{color:#3d2810}
        .back{padding:0;display:grid;place-items:center;background:var(--c) repeating-linear-gradient(45deg,#fff2 0 2mm,#0000 2mm 5mm)}.back-in{border:.8mm solid #fff;border-radius:3mm;width:80%;height:84%;display:grid;place-content:center;text-align:center;color:#fff;gap:2mm;background:radial-gradient(circle,#fff3 0 30%,#0000 31%)}.back-in b{font-size:16pt;font-family:Georgia,serif}.back-in small{letter-spacing:.2em;text-transform:uppercase;font-size:7pt}
        .back.s-ancien{background:#6b5532 repeating-linear-gradient(0deg,#fff1 0 1mm,#0000 1mm 3mm)}.back.s-artdeco{background:repeating-linear-gradient(60deg,#c9a24a44 0 .4mm,#0000 .4mm 4mm) #14171c}.back.s-artdeco .back-in{border-color:#c9a24a;color:#c9a24a}
        .rules{width:210mm;margin:12px auto;background:#fff;padding:10mm;box-sizing:border-box;font:11pt Georgia,serif}`;
    /** le CSS des cartes, limité à l'aperçu (chaque sélecteur préfixé) */
    const scopeCss = (css, scope) => css.split('}').map(r => { const i = r.indexOf('{'); return i < 0 ? r : r.slice(0, i).split(',').map(sel => `${scope} ${sel.trim()}`).join(',') + r.slice(i); }).join('}');
    /** 📷 choisir la photo d'une carte, puis la recadrer (glisser pour déplacer, molette ou curseur pour zoomer) */
    async function pickPhoto(T, tr, p, prefs, done) {
        let photos = []; try { photos = (await T.api('tresor_photos', {person_id: p.id})).photos || []; } catch (_) {}
        const cur = prefs.photos[p.id] || {}, por = p.portrait ? {id: 0, filename: p.portrait, thumbnail: p.portrait, title: 'Portrait de la fiche', face: null} : null;
        const list = [...(por ? [por] : []), ...photos.filter(x => x.filename !== p.portrait)];
        let sel = cur.none ? null : list.find(x => x.filename === cur.file) || list[0] || null, x = cur.x ?? 50, y = cur.y ?? 40, z = cur.z ?? 1;
        const fromFace = ph => { if (!ph?.face) { x = 50; y = 35; z = 1; return; } const f = ph.face; x = Math.max(0, Math.min(100, f.x + f.w / 2)); y = Math.max(0, Math.min(100, f.y + f.h / 2)); z = Math.max(1, Math.min(4, 45 / Math.max(5, f.h))); };
        if (sel && !cur.file) fromFace(sel);
        ext.openDialog({eyebrow: '🃏 7 FAMILLES', title: `La photo de ${T.esc(T.name(p))}`, submitLabel: 'Garder', body: `<div class="h-tr-7ph">
            <div class="h-tr-7ph-list" role="listbox" aria-label="Les photos">${list.map((m, k) => `<button type="button" class="h-tr-7ph-t${sel === m ? ' is-on' : ''}" data-k="${k}" title="${T.esc(m.title || '')}${m.face ? ' (visage repéré)' : ''}"><img src="media/${encodeURIComponent(m.thumbnail || m.filename)}" alt=""></button>`).join('')}<button type="button" class="h-tr-7ph-t${sel ? '' : ' is-on'}" data-k="-1" title="Sans photo">🚫</button></div>
            ${list.length ? '' : '<p class="h-tr-muted">Aucune photo jointe à cette fiche, ni de visage encadré sur une photo : ajoute-en depuis sa fiche (Médias), puis reviens ici.</p>'}
            <div class="h-tr-7ph-crop" data-crop tabindex="0" aria-label="Le cadrage : glisse pour déplacer, molette ou + et − pour zoomer"></div>
            <label>🔍 Zoom<input type="range" min="1" max="4" step="0.05" data-zoom></label><p class="h-tr-muted">Glisse la photo dans le cadre pour la placer ; la molette (ou + et −) zoome. ${list.some(m => m.face) ? 'Les photos marquées d’un visage se recadrent toutes seules sur lui.' : ''}</p></div>`,
            onOpen: d => { const box = d.querySelector('[data-crop]'), zoom = d.querySelector('[data-zoom]');
                const draw = () => { zoom.value = z; box.innerHTML = sel ? imgTag({src: `media/${encodeURIComponent(sel.filename)}`, x, y, z}) : '<span>🚫 Sans photo</span>'; };
                d.querySelector('.h-tr-7ph-list').addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (!b) return; const k = Number(b.dataset.k); sel = k < 0 ? null : list[k]; if (sel) fromFace(sel); d.querySelectorAll('.h-tr-7ph-t').forEach(t => t.classList.toggle('is-on', t === b)); draw(); });
                zoom.addEventListener('input', () => { z = Number(zoom.value); draw(); });
                box.addEventListener('wheel', e => { e.preventDefault(); z = Math.max(1, Math.min(4, z - Math.sign(e.deltaY) * 0.1)); draw(); }, {passive: false});
                box.addEventListener('keydown', e => { const k = {ArrowLeft: [-2, 0], ArrowRight: [2, 0], ArrowUp: [0, -2], ArrowDown: [0, 2]}[e.key]; if (k) { e.preventDefault(); x = Math.max(0, Math.min(100, x + k[0])); y = Math.max(0, Math.min(100, y + k[1])); draw(); } if (e.key === '+' || e.key === '-') { z = Math.max(1, Math.min(4, z + (e.key === '+' ? 0.1 : -0.1))); draw(); } });
                box.addEventListener('pointerdown', e => { if (!sel) return; box.setPointerCapture(e.pointerId); const sx = e.clientX, sy = e.clientY, x0 = x, y0 = y, r = box.getBoundingClientRect();
                    const mv = ev => { x = Math.max(0, Math.min(100, x0 - (ev.clientX - sx) / r.width * 100 / z)); y = Math.max(0, Math.min(100, y0 - (ev.clientY - sy) / r.height * 100 / z)); draw(); };
                    const up = () => { box.removeEventListener('pointermove', mv); box.removeEventListener('pointerup', up); }; box.addEventListener('pointermove', mv); box.addEventListener('pointerup', up); });
                draw(); },
            onSubmit: () => { prefs.photos[p.id] = sel ? {file: sel.filename, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, z: Math.round(z * 100) / 100} : {none: true}; sevenSave(prefs); done(); }});
    }
    async function renderSeven(host, T) {
        const tr = await T.tree(), prefs = sevenPrefs();
        const opt = (o, cur) => Object.entries(o).map(([k, l]) => `<option value="${k}"${k === cur ? ' selected' : ''}>${T.esc(l)}</option>`).join('');
        host.innerHTML = `<div class="h-tr-panel h-tr-noprint" data-7-opts><div class="h-tr-row"><label>Les familles<select name="mode"><option value="surname">par nom de famille</option><option value="branch">par branche (arrière-grands-parents)</option></select></label>
                <label>Le style<select name="style">${opt(SEVEN_STYLES, prefs.style)}</select></label><label>Les photos<select name="fx">${opt({sepia: 'Sépia', nb: 'Noir et blanc', couleur: 'Couleurs d’origine'}, prefs.fx)}</select></label>
                <label>Le dos<select name="back">${opt({motif: 'Un dos à motif (à imprimer au verso)', aucun: 'Sans dos'}, prefs.back)}</select></label></div>
            <div class="h-tr-row">${[['dates', 'Les dates'], ['occ', 'Le métier'], ['place', 'Le lieu de naissance'], ['others', 'La liste de la famille']].map(([k, l]) => `<label class="checkbox-line"><input type="checkbox" name="sh-${k}"${prefs.show[k] ? ' checked' : ''}> ${l}</label>`).join('')}</div>
            <div class="h-tr-row h-tr-7-cols" data-7-cols></div>
            <div class="h-tr-row"><button class="button" data-7-print>🖨 Planches à imprimer</button><button type="button" class="button secondary" data-7-reset title="Les photos choisies, les couleurs et le style de départ">↺ Remettre comme au départ</button><span class="h-tr-muted">📷 sur une carte : choisir et recadrer sa photo.</span></div></div><div data-7-out></div>`;
        const out = host.querySelector('[data-7-out]'), o = host.querySelector('[data-7-opts]'), mode = o.querySelector('[name=mode]');
        const colorOf = (f, fi) => prefs.colors[f.name] || COLORS[fi % COLORS.length];
        let fams = [];
        const draw = () => { fams = buildFamilies(T, tr, mode.value);
            o.querySelector('[data-7-cols]').innerHTML = fams.map((f, fi) => `<label class="h-tr-7-col"><input type="color" value="${colorOf(f, fi)}" data-7-col="${T.esc(f.name)}"> ${T.esc(f.name)}</label>`).join('');
            out.innerHTML = fams.length < 2 ? '<p class="h-tr-muted">Il faut au moins deux familles d’au moins six personnes (décédées) : complète l’arbre, ou essaie « par branche ».</p>'
                : `<p class="h-tr-muted">${fams.length} famille${fams.length > 1 ? 's' : ''} de 6 cartes (${fams.length * 6} cartes).</p><style>${scopeCss(CARD_CSS, '.h-tr-7')}</style>${fams.map((f, fi) => `<h3 class="h-tr-7-fam">${T.esc(f.name)}</h3><div class="h-tr-7" style="display:flex;flex-wrap:wrap;gap:10px">${f.people.map((_, i) => cardHtml(T, tr, f, i, colorOf(f, fi), prefs, true)).join('')}${prefs.back === 'motif' ? backHtml(T.esc(f.name), colorOf(f, fi), prefs) : ''}</div>`).join('')}`;
            return fams; };
        o.addEventListener('change', e => { const t = e.target;
            if (t.name === 'style' || t.name === 'fx' || t.name === 'back') prefs[t.name] = t.value;
            if (t.name?.startsWith('sh-')) prefs.show[t.name.slice(3)] = t.checked;
            if (t.matches('[data-7-col]')) return; sevenSave(prefs); draw(); });
        o.addEventListener('input', e => { const t = e.target.closest('[data-7-col]'); if (!t) return; prefs.colors[t.dataset['7Col']] = t.value; sevenSave(prefs); out.querySelectorAll('.h-tr-7').forEach((g, k) => { if (fams[k]?.name === t.dataset['7Col']) g.querySelectorAll('.card').forEach(c => c.style.setProperty('--c', t.value)); }); });
        out.addEventListener('click', e => { const b = e.target.closest('[data-7-ph]'); if (!b) return; const p = tr.byId.get(Number(b.dataset['7Ph'])); if (p) pickPhoto(T, tr, p, prefs, draw); });
        o.querySelector('[data-7-reset]').addEventListener('click', () => { const before = JSON.stringify(prefs); Object.assign(prefs, {style: 'classique', fx: 'sepia', show: {dates: true, occ: true, place: true, others: true}, colors: {}, photos: {}, back: 'motif'}); sevenSave(prefs); renderSeven(host, T);
            A().undoToast?.('Jeu remis comme au départ.', {undo: () => { try { localStorage.setItem(SEVEN_KEY, before); } catch (_) {} renderSeven(host, T); }}); });
        draw();
        o.querySelector('[data-7-print]').addEventListener('click', () => { draw(); if (fams.length < 2) return;
            const cards = fams.flatMap((f, fi) => f.people.map((_, i) => [cardHtml(T, tr, f, i, colorOf(f, fi), prefs), backHtml(T.esc(f.name), colorOf(f, fi), prefs)])), sheets = [];
            for (let i = 0; i < cards.length; i += 9) { const page = cards.slice(i, i + 9); sheets.push(`<div class="sheet">${page.map(c => c[0]).join('')}</div>`); if (prefs.back === 'motif') sheets.push(`<div class="sheet backs">${page.map(c => c[1]).join('')}</div>`); }
            printWindow('Jeu des 7 familles', CARD_CSS, `<div class="rules"><h2>🃏 Le jeu des ${fams.length} familles</h2><p>Distribuez 6 cartes à chacun, le reste fait la pioche. À ton tour, demande à un joueur une carte d’une famille dont tu as déjà une carte (« Dans la famille ${T.esc(fams[0].name)}, je voudrais ${T.esc(ROLE(2, fams[0].people[2]).toLowerCase())} »). S’il l’a, il te la donne et tu rejoues ; sinon, « Pioche ! ». Une famille complète se pose devant soi. Celui qui a le plus de familles a gagné.</p><p>Les familles : ${fams.map(f => `<b>${T.esc(f.name)}</b> (${f.people.map(p => T.esc(p.first || T.name(p))).join(', ')})`).join(' ; ')}.</p>${prefs.back === 'motif' ? '<p><i>Impression recto verso (bord long) : chaque page de dos suit sa page de cartes, déjà retournée pour tomber pile derrière.</i></p>' : ''}</div>${sheets.join('')}`); });
    }
    F.push({key: 'sept-familles', group: 'jouer', icon: '🃏', title: 'Jeu des 7 familles', desc: 'Les cartes faites depuis ton arbre : la photo de chacun au choix et recadrée, six styles de cartes, les couleurs, le dos ; à imprimer et découper.', render: renderSeven});
    ext.tresorSeven = {buildFamilies, cardHtml, sevenPrefs, SEVEN_STYLES};

    /* ── 🖍️ Arbre à colorier : plusieurs dessins, tous en traits noirs sur blanc ── */
    const CO_DESIGNS = {arbre: '🌳 Le grand arbre', fleurs: '🌷 Le jardin de fleurs', maisons: '🏡 Le village (une maison chacun)', blasons: '🛡️ Les blasons', ballons: '🎈 Les montgolfières', ruche: '🐝 La ruche (alvéoles)', eventail: '🪭 L’éventail', rosace: '🏵️ La rosace'};
    const CO_FONTS = {serif: 'Georgia, serif', ecole: '"Comic Sans MS", "Chalkboard SE", "Segoe Print", cursive', baton: '"Arial Rounded MT Bold", Arial, Helvetica, sans-serif'};
    /** les ancêtres rangés par génération : [[racine], [père, mère], [4 grands-parents]…] (null là où personne n'est connu) */
    function coGens(tr, root, gens) { const by = [[root]]; for (let g = 1; g < gens; g++) { const row = []; by[g - 1].forEach(c => { const p = c ? tr.byId.get(c.id) : null; row.push(p?.father ? tr.byId.get(p.father) : null, p?.mother ? tr.byId.get(p.mother) : null); }); by.push(row); } return by; }
    function coloringSvg(T, tr, rootId, gens = 4, o = {}) {
        const design = CO_DESIGNS[o.design] ? o.design : 'arbre', font = CO_FONTS[o.font] || CO_FONTS.serif, sw = Number(o.stroke) || 3, label = o.label || 'complet';
        const W = 1100, H = 1400, root = tr.byId.get(rootId), byGen = coGens(tr, root, gens), s = [];
        const txt = (x, y, size, t, extra = '') => `<text x="${x}" y="${y}" font-size="${size}" text-anchor="middle" fill="#000" stroke="none" font-family='${font}'${extra}>${T.esc(t)}</text>`;
        const names = (p, g) => { if (!p) return ['…', '']; const first = (p.first || T.name(p)).split(' ')[0], last = (p.last || '').toUpperCase(); return label === 'prenom' ? [first, ''] : label === 'nom' ? [first, last] : [first, `${last}${p.by ? ` · ${p.by}` : ''}`]; };
        const leaf = (x, y, r, rot) => `<path d="M${x} ${y - r}C${x + r * .9} ${y - r * .4} ${x + r * .9} ${y + r * .5} ${x} ${y + r}C${x - r * .9} ${y + r * .5} ${x - r * .9} ${y - r * .4} ${x} ${y - r}Z" transform="rotate(${rot} ${x} ${y})"/>`;
        const sun = (cx, cy, r) => `<circle cx="${cx}" cy="${cy}" r="${r}"/>${[...Array(12)].map((_, i) => { const a = i * Math.PI / 6; return `<path d="M${cx + Math.cos(a) * r * 1.2} ${cy + Math.sin(a) * r * 1.2}L${cx + Math.cos(a) * r * 1.65} ${cy + Math.sin(a) * r * 1.65}" fill="none"/>`; }).join('')}`;
        const birds = pts => pts.map(([x, y]) => `<path d="M${x - 26} ${y}q13 -16 26 0q13 -16 26 0" fill="none"/>`).join('');
        const cloud = (x, y, k = 1) => `<path d="M${x} ${y}c-${30 * k} 0 -${30 * k} -${34 * k} 0 -${34 * k}c${6 * k} -${26 * k} ${46 * k} -${26 * k} ${52 * k} 0c${30 * k} -${8 * k} ${44 * k} ${30 * k} ${16 * k} ${34 * k}Z"/>`;
        const flower = (x, y, r) => `${[...Array(8)].map((_, i) => `<ellipse cx="${x}" cy="${y - r * 0.95}" rx="${r * 0.42}" ry="${r * 0.62}" transform="rotate(${i * 45} ${x} ${y})"/>`).join('')}<circle cx="${x}" cy="${y}" r="${r * 0.78}"/>`;
        const butterfly = (x, y) => `<path d="M${x} ${y}c-30 -40 -60 -10 -40 10c-20 20 10 40 40 0c30 40 60 20 40 0c20 -20 -10 -50 -40 -10Z"/><path d="M${x} ${y - 14}l-10 -20M${x} ${y - 14}l10 -20" fill="none"/>`;
        const star = (x, y, r) => `<path d="${[...Array(10)].map((_, i) => { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; return `${i ? 'L' : 'M'}${(x + Math.cos(a) * rr).toFixed(1)} ${(y + Math.sin(a) * rr).toFixed(1)}`; }).join('')}Z"/>`;
        const title = o.title || `L’arbre de ${T.name(root)}`;
        if (design === 'eventail' || design === 'rosace') {
            // des anneaux : la personne au centre, chaque génération une couronne de cases
            const full = design === 'rosace', cx = W / 2, cy = full ? 640 : 1040, r0 = full ? 95 : 120, ring = full ? (520 - r0) / (gens - 1) : (900 - r0) / (gens - 1);
            const a0 = full ? -Math.PI / 2 : Math.PI, span = full ? Math.PI * 2 : Math.PI;
            const arc = (r1, r2, b1, b2) => { const p = (r, b) => `${(cx + Math.cos(b) * r).toFixed(1)} ${(cy + Math.sin(b) * r).toFixed(1)}`, big = b2 - b1 > Math.PI ? 1 : 0; return `<path d="M${p(r1, b1)}L${p(r2, b1)}A${r2} ${r2} 0 ${big} 1 ${p(r2, b2)}L${p(r1, b2)}A${r1} ${r1} 0 ${big} 0 ${p(r1, b1)}Z"/>`; };
            if (full) { for (let i = 0; i < 24; i++) { const b = i * Math.PI / 12, R = r0 + ring * (gens - 1) + 8; s.push(`<ellipse cx="${cx + Math.cos(b) * (R + 34)}" cy="${cy + Math.sin(b) * (R + 34)}" rx="16" ry="34" transform="rotate(${b * 180 / Math.PI + 90} ${cx + Math.cos(b) * (R + 34)} ${cy + Math.sin(b) * (R + 34)})"/>`); } }
            s.push(full ? `<circle cx="${cx}" cy="${cy}" r="${r0}"/>` : `<path d="M${cx - r0} ${cy}A${r0} ${r0} 0 0 1 ${cx + r0} ${cy}Z"/>`);
            const [a, b] = names(root, 0); s.push(txt(cx, cy - (full ? 6 : 50), 26, a), b ? txt(cx, cy + (full ? 22 : -22), 16, b) : '');
            for (let g = 1; g < gens; g++) { const row = byGen[g], n = row.length, r1 = r0 + ring * (g - 1), r2 = r1 + ring;
                row.forEach((p, i) => { const b1 = a0 + span * i / n, b2 = a0 + span * (i + 1) / n, mid = (b1 + b2) / 2, rm = (r1 + r2) / 2, [n1, n2] = names(p, g); s.push(arc(r1, r2, b1, b2));
                    const tx = cx + Math.cos(mid) * rm, ty = cy + Math.sin(mid) * rm, deg = mid * 180 / Math.PI, rot = g >= 3 ? deg + (Math.cos(mid) < 0 ? 180 : 0) : deg + 90 + (Math.sin(mid) > 0 ? 180 : 0), fs = Math.max(11, 24 - g * 3.4);
                    s.push(`<g transform="rotate(${rot.toFixed(1)} ${tx.toFixed(1)} ${ty.toFixed(1)})">${txt(tx.toFixed(1), (ty - (n2 ? fs * 0.25 : -fs * 0.35)).toFixed(1), fs, n1)}${n2 ? txt(tx.toFixed(1), (ty + fs * 0.85).toFixed(1), fs * 0.68, n2) : ''}</g>`); }); }
            if (!full) { s.push(sun(130, 130, 50), birds([[930, 110], [1000, 170]])); for (let i = 0; i < 8; i++) s.push(flower(80 + i * 135, 1210, 26)); }
            else s.push(star(110, 110, 50), star(990, 110, 50), star(110, 1180, 40), star(990, 1180, 40));
        } else {
            // en étages, du bas (la personne) vers le haut (les plus anciens)
            const top = 280, bottom = design === 'maisons' ? H - 300 : H - 520, step = (bottom - top) / Math.max(1, gens - 1), pos = [];
            byGen.forEach((row, g) => { const y = bottom - g * step, n = row.length; row.forEach((p, i) => pos.push({p, g, x: W / 2 + (i - (n - 1) / 2) * (W - 140) / Math.max(1, n), y})); });
            const child = k => { const g = Math.floor(Math.log2(k + 1)); if (!g) return null; const idx = k - (2 ** g - 1); return pos[(2 ** (g - 1) - 1) + Math.floor(idx / 2)]; };
            const R = g => (g === 0 ? 70 : Math.min(64 - g * 6, (W - 140) / (2 ** g) / 2.3));
            // le décor du bas et du ciel
            if (design === 'arbre') { s.push(`<path d="M${W / 2 - 70} ${H - 60}C${W / 2 - 40} ${H - 260} ${W / 2 - 50} ${H - 380} ${W / 2 - 20} ${H - 470}L${W / 2 + 20} ${H - 470}C${W / 2 + 50} ${H - 380} ${W / 2 + 40} ${H - 260} ${W / 2 + 70} ${H - 60}Z"/>`, `<path d="M${W / 2 - 60} ${H - 150}c20 -10 40 -6 50 6M${W / 2 + 10} ${H - 250}c18 -6 30 2 36 12M${W / 2 - 30} ${H - 340}c14 -8 28 -6 36 4" fill="none"/>`); }
            if (design !== 'ballons') { s.push(`<path d="M0 ${H - 60}H${W}" fill="none"/>`); [[80, H - 90], [200, H - 80], [920, H - 85], [1020, H - 95]].forEach(([x, y]) => s.push(`<path d="M${x} ${y}q6 -26 12 0q6 -20 12 0" fill="none"/>`)); }
            if (design === 'fleurs') { s.push(`<path d="M${W / 2} ${H - 60}V${bottom + 60}" fill="none" stroke-width="${sw * 2}"/>`, leaf(W / 2 - 40, H - 200, 34, -60), leaf(W / 2 + 40, H - 280, 34, 60), butterfly(150, 160), butterfly(960, 260), sun(980, 110, 40)); }
            if (design === 'maisons') { s.push(`<path d="M0 ${H - 200}C200 ${H - 280} 380 ${H - 230} 560 ${H - 260}S900 ${H - 300} ${W} ${H - 230}" fill="none"/>`, sun(120, 110, 45), cloud(820, 120), cloud(560, 80, 0.7)); }
            if (design === 'ballons') { s.push(cloud(130, 140), cloud(900, 120, 0.9), cloud(300, H - 380, 0.8), cloud(880, H - 420, 0.7), birds([[600, 90], [660, 130]]), `<path d="M0 ${H - 90}C220 ${H - 170} 420 ${H - 120} 600 ${H - 150}S940 ${H - 190} ${W} ${H - 120}" fill="none"/>`); }
            if (design === 'blasons') { s.push(`<path d="M${W / 2 - 60} 70l20 50h80l20 -50l-30 26l-30 -40l-30 40Z"/>`, star(130, 120, 40), star(970, 120, 40)); }
            if (design === 'ruche') { s.push(`<path d="M${W / 2} 40V110" fill="none"/>`, sun(130, 120, 40)); for (let i = 0; i < 4; i++) s.push(`<g transform="translate(${180 + i * 230} ${H - 180})"><ellipse cx="0" cy="0" rx="22" ry="14"/><path d="M-6 -12v24M6 -12v24" fill="none"/><ellipse cx="-6" cy="-18" rx="12" ry="8"/><ellipse cx="8" cy="-18" rx="12" ry="8"/></g>`); }
            // les liens
            pos.forEach((q, k) => { const c = child(k); if (!c) return; const yTop = q.y + R(q.g) * 0.8, yBot = c.y - R(c.g) * 0.8;
                if (design === 'arbre') s.push(`<path d="M${c.x} ${c.y - 40}C${c.x} ${(c.y + q.y) / 2} ${q.x} ${(c.y + q.y) / 2 + 40} ${q.x} ${q.y + 44}" fill="none" stroke-width="${Math.max(sw, 10 - q.g * 2)}"/>`);
                else if (design === 'fleurs') { s.push(`<path d="M${c.x} ${yBot}C${c.x} ${(c.y + q.y) / 2} ${q.x} ${(c.y + q.y) / 2 + 30} ${q.x} ${yTop + 10}" fill="none"/>`); s.push(leaf((c.x + q.x) / 2 + (q.x < c.x ? -10 : 10), (c.y + q.y) / 2 + 10, 14, q.x < c.x ? -50 : 50)); }
                else if (design === 'ballons') s.push(`<path d="M${c.x} ${c.y - R(c.g) * 1.1}Q${(c.x + q.x) / 2} ${(c.y + q.y) / 2 + 30} ${q.x} ${q.y + R(q.g) * 1.55}" fill="none" stroke-dasharray="${sw * 3} ${sw * 3}"/>`);
                else if (design === 'maisons') s.push(`<path d="M${c.x - 8} ${yBot}L${q.x - 8} ${yTop + 40}M${c.x + 8} ${yBot}L${q.x + 8} ${yTop + 40}" fill="none"/>`);
                else s.push(`<path d="M${c.x} ${yBot}L${c.x} ${(yBot + yTop) / 2}L${q.x} ${(yBot + yTop) / 2}L${q.x} ${yTop}" fill="none"/>`); });
            // les cases
            pos.forEach(({p, g, x, y}) => { const r = R(g), [n1, n2] = names(p, g), fs = g === 0 ? 24 : Math.max(11, 21 - g * 2.4);
                if (design === 'arbre') s.push(leaf(x - r * 1.1, y + 6, r * 0.45, -50), leaf(x + r * 1.1, y + 6, r * 0.45, 50), `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * 0.72}"/>`);
                if (design === 'fleurs') s.push(flower(x, y, r * 0.95));
                if (design === 'maisons') { const w = r * 1.9, h = r * 1.15; s.push(`<path d="M${x - w / 2 - 10} ${y - h / 2 + 2}L${x} ${y - h / 2 - r * 0.85}L${x + w / 2 + 10} ${y - h / 2 + 2}Z"/>`, `<rect x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h + 30}"/>`, `<rect x="${x - 10}" y="${y + h / 2 + 4}" width="20" height="26"/>`, `<rect x="${x + w / 4}" y="${y - h / 2 - r * 0.6}" width="14" height="${r * 0.4}"/>`); }
                if (design === 'blasons') { const w = r * 1.85, h = r * 1.5; s.push(`<path d="M${x - w / 2} ${y - h / 2}H${x + w / 2}V${y + h * 0.1}C${x + w / 2} ${y + h * 0.45} ${x + w * 0.15} ${y + h * 0.6} ${x} ${y + h * 0.75}C${x - w * 0.15} ${y + h * 0.6} ${x - w / 2} ${y + h * 0.45} ${x - w / 2} ${y + h * 0.1}Z"/>`); }
                if (design === 'ballons') { s.push(`<path d="M${x} ${y + r * 1.05}C${x - r * 1.5} ${y + r * 0.2} ${x - r * 1.25} ${y - r * 1.2} ${x} ${y - r * 1.2}C${x + r * 1.25} ${y - r * 1.2} ${x + r * 1.5} ${y + r * 0.2} ${x} ${y + r * 1.05}Z"/>`, `<path d="M${x - r * 0.35} ${y + r * 0.85}L${x - r * 0.25} ${y + r * 1.3}M${x + r * 0.35} ${y + r * 0.85}L${x + r * 0.25} ${y + r * 1.3}" fill="none"/>`, `<rect x="${x - r * 0.3}" y="${y + r * 1.3}" width="${r * 0.6}" height="${r * 0.3}"/>`); }
                if (design === 'ruche') { const hx = r * 1.15; s.push(`<path d="${[...Array(6)].map((_, i) => { const a = Math.PI / 6 + i * Math.PI / 3; return `${i ? 'L' : 'M'}${(x + Math.cos(a) * hx).toFixed(1)} ${(y + Math.sin(a) * hx).toFixed(1)}`; }).join('')}Z"/>`); }
                s.push(txt(x, y - (n2 ? 2 : -fs * 0.35), fs, n1), n2 ? txt(x, y + fs * 0.85, Math.max(9, fs * 0.66), n2) : ''); });
            if (design === 'arbre') s.push(sun(120, 120, 50), birds([[930, 110], [1000, 170], [860, 190]]));
        }
        if (o.frame === 'simple') s.push(`<rect x="22" y="22" width="${W - 44}" height="${H - 44}" fill="none" rx="18"/><rect x="34" y="34" width="${W - 68}" height="${H - 68}" fill="none" rx="12"/>`);
        if (o.frame === 'feuilles') { for (let x = 50; x < W - 30; x += 70) s.push(leaf(x, 30, 16, 90), leaf(x + 35, H - 30, 16, 90)); for (let y = 90; y < H - 60; y += 70) s.push(leaf(30, y, 16, 0), leaf(W - 30, y + 35, 16, 0)); }
        if (o.frame === 'etoiles') { for (let x = 50; x < W; x += 100) s.push(star(x, 34, 16), star(x + 50, H - 34, 16)); for (let y = 130; y < H - 80; y += 100) s.push(star(34, y, 16), star(W - 34, y + 50, 16)); }
        s.push(txt(W / 2, H - (o.frame && o.frame !== 'aucun' ? 70 : 20), 30, title));
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#fff"/><g fill="#fff" stroke="#000" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round">${s.join('')}</g></svg>`;
    }
    async function renderColoring(host, T) {
        const tr = await T.tree(), st = T.start(tr); if (!st) { host.innerHTML = '<p class="h-tr-muted">L’arbre est vide.</p>'; return; }
        const KEY = 'lcnda-coloriage', saved = (() => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) { return {}; } })();
        const sel = (name, opts, cur) => `<select name="${name}">${Object.entries(opts).map(([k, l]) => `<option value="${k}"${String(cur) === k ? ' selected' : ''}>${T.esc(l)}</option>`).join('')}</select>`;
        host.innerHTML = `<form class="h-tr-panel h-tr-noprint" data-co><div class="h-tr-row"><div style="min-width:260px"><span class="pk-lab">L’enfant (ou la personne) au pied de l’arbre</span>${T.personField('who', st.id)}</div>
                <label>Générations${sel('g', {3: '3', 4: '4', 5: '5 (petites cases)'}, saved.g || 4)}</label></div>
            <div class="h-tr-co-designs" role="radiogroup" aria-label="Le dessin">${Object.entries(CO_DESIGNS).map(([k, l]) => `<label class="h-tr-co-d"><input type="radio" name="design" value="${k}"${(saved.design || 'arbre') === k ? ' checked' : ''}><span>${T.esc(l)}</span></label>`).join('')}</div>
            <div class="h-tr-row"><label>Les noms${sel('label', {prenom: 'Le prénom seul (petits)', nom: 'Prénom et nom', complet: 'Prénom, nom et année'}, saved.label || 'complet')}</label>
                <label>L’écriture${sel('font', {serif: 'Classique', ecole: 'D’écolier', baton: 'Bâton (lettres rondes)'}, saved.font || 'serif')}</label>
                <label>Le trait${sel('stroke', {2: 'Fin (grands)', 3: 'Moyen', 5: 'Épais (petits, gros feutres)'}, saved.stroke || 3)}</label>
                <label>Le cadre${sel('frame', {aucun: 'Sans', simple: 'Double trait', feuilles: 'Guirlande de feuilles', etoiles: 'Étoiles'}, saved.frame || 'aucun')}</label>
                <label>Le titre<input name="title" value="${T.esc(saved.title || '')}" placeholder="L’arbre de …" maxlength="60"></label></div>
            <div class="h-tr-row"><button class="button" type="submit">Dessiner</button><button type="button" class="button secondary" data-co-print>🖨 Imprimer</button><button type="button" class="button secondary" data-co-svg>⤓ SVG</button><button type="button" class="button secondary" data-co-png>⤓ PNG</button></div></form><div data-co-out style="max-width:720px"></div>`;
        const form = host.querySelector('[data-co]'), out = host.querySelector('[data-co-out]'); let svg = '';
        const opts = () => { const e = form.elements; return {design: e.design.value, label: e.label.value, font: e.font.value, stroke: e.stroke.value, frame: e.frame.value, title: e.title.value.trim(), g: e.g.value}; };
        const draw = () => { const o = opts(); try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (_) {} svg = coloringSvg(T, tr, Number(form.elements.who.value) || st.id, Number(o.g), o); out.innerHTML = svg.replace('<svg ', '<svg class="h-tr-canvas" style="width:100%;height:auto" '); };
        form.addEventListener('submit', e => { e.preventDefault(); draw(); }); form.addEventListener('change', draw);
        host.querySelector('[data-co-print]').addEventListener('click', () => { draw(); printWindow('Arbre à colorier', '@page{size:A4;margin:8mm}.pg{background:#fff;width:190mm;margin:12px auto}.pg svg{width:100%;height:auto}', `<div class="pg">${svg}</div>`); });
        host.querySelector('[data-co-svg]').addEventListener('click', () => { draw(); T.download(`arbre-a-colorier-${form.elements.design.value}.svg`, new Blob([svg], {type: 'image/svg+xml'})); });
        host.querySelector('[data-co-png]').addEventListener('click', () => { draw(); const img = new Image(); img.onload = () => { const c = document.createElement('canvas'); c.width = 2200; c.height = 2800; c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); c.toBlob(b => b && T.download(`arbre-a-colorier-${form.elements.design.value}.png`, b), 'image/png'); }; img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); });
        draw();
    }
    F.push({key: 'coloriage', group: 'jouer', icon: '🖍️', title: 'Arbre à colorier', desc: 'Les vrais ancêtres d’un enfant en traits noirs : un arbre, un jardin de fleurs, un village, des blasons, des montgolfières, une ruche, un éventail ou une rosace.', render: renderColoring});
    ext.tresorColoring = {coloringSvg, CO_DESIGNS};

    /* ── 📺 Le quiz du repas (mode télé) ── */
    /** des questions tirées de l'arbre : {q, options[], answer (indice), why} ; le même tirage pour la même graine */
    function quizQuestions(T, tr, n = 15, seed = Date.now()) {
        const R = T.rng(seed), pick = a => a[Math.floor(R() * a.length)], shuffle = a => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
        const ppl = tr.people.filter(p => p.first), fem = p => p.gender === 'female', e = (s, p) => s.replace(/·e/g, fem(p) ? 'e' : '');
        const places = [...new Set(ppl.map(p => T.place(tr, p.bplace)).filter(Boolean))], jobs = [...new Set(ppl.map(p => p.occ).filter(Boolean))];
        const opts = (good, pool, k = 4) => { const others = shuffle(pool.filter(x => x !== good)).slice(0, k - 1); if (!others.length) return null; const all = shuffle([good, ...others]); return {options: all, answer: all.indexOf(good)}; };
        const makers = [
            () => { const p = pick(ppl.filter(x => x.by)); if (!p) return null; const ys = new Set([p.by]); while (ys.size < 4) ys.add(p.by + (Math.floor(R() * 25) + 3) * (R() < 0.5 ? -1 : 1)); const o = opts(p.by, [...ys]); return o && {q: e(`En quelle année est né·e ${T.name(p)} ?`, p), ...o, why: T.story(tr, p)[0]}; },
            () => { const p = pick(ppl.filter(x => x.bplace)); if (!p || places.length < 2) return null; const o = opts(T.place(tr, p.bplace), places); return o && {q: e(`Où est né·e ${T.name(p)} ?`, p), ...o, why: T.story(tr, p)[0]}; },
            () => { const p = pick(ppl.filter(x => x.occ)); if (!p || jobs.length < 2) return null; const o = opts(p.occ, jobs); return o && {q: `Quel était le métier de ${T.name(p)} ?`, ...o, why: `${T.name(p)} était ${p.occ}.`}; },
            () => { const f = pick(tr.families.filter(x => x.a && x.b)); if (!f) return null; const a = tr.byId.get(f.a), b = tr.byId.get(f.b); if (!a || !b) return null;
                const pool = ppl.filter(x => x.gender === b.gender && x.id !== a.id).map(x => T.name(x)); const o = opts(T.name(b), pool); return o && {q: `Qui a épousé ${T.name(a)} ?`, ...o, why: `${T.name(a)} et ${T.name(b)} se sont mariés${f.my ? ` en ${f.my}` : ''}${f.mplace ? ` à ${T.place(tr, f.mplace)}` : ''}.`}; },
            () => { const p = pick(ppl.filter(x => x.father || x.mother)); if (!p) return null; const par = tr.byId.get(p.mother && R() < 0.5 ? p.mother : p.father || p.mother); if (!par) return null;
                const pool = ppl.filter(x => x.gender === par.gender && x.id !== p.id).map(x => T.name(x)); const o = opts(T.name(par), pool); return o && {q: `Qui est ${fem(par) ? 'la mère' : 'le père'} de ${T.name(p)} ?`, ...o, why: `${T.name(p)} est ${fem(p) ? 'la fille' : 'le fils'} de ${T.name(par)}.`}; },
            () => { const p = pick(ppl.filter(x => (tr.kids.get(x.id) || []).length)); if (!p) return null; const k = new Set(tr.kids.get(p.id)).size, nums = new Set([k]); while (nums.size < 4) nums.add(Math.max(0, k + Math.floor(R() * 7) - 3));
                const o = opts(k, [...nums]); return o && {q: `Combien d’enfants a eus ${T.name(p)} ?`, ...o, why: T.story(tr, p).find(s => /enfant/.test(s)) || ''}; },
            () => { const p = pick(ppl.filter(x => x.by && x.dy && x.dy - x.by > 3)); if (!p) return null; const a = T.ageAt(p, p.dd, p.dy), ages = new Set([a]); while (ages.size < 4) ages.add(Math.max(1, a + (Math.floor(R() * 15) + 2) * (R() < 0.5 ? -1 : 1)));
                const o = opts(a, [...ages]); return o && {q: `À quel âge est ${e('mort·e', p)} ${T.name(p)} ?`, ...o, why: T.story(tr, p).at(-1)}; },
            () => { const two = shuffle(ppl.filter(x => x.by)).slice(0, 2); if (two.length < 2 || two[0].by === two[1].by) return null; const old = two[0].by < two[1].by ? two[0] : two[1];
                return {q: 'Qui est né le premier ?', options: two.map(x => T.name(x)), answer: two.indexOf(old), why: `${T.name(two[0])} : ${two[0].by} ; ${T.name(two[1])} : ${two[1].by}.`}; }];
        const out = [], seen = new Set();
        for (let tries = 0; out.length < n && tries < n * 30; tries++) { const q = makers[Math.floor(R() * makers.length)](); if (q && q.options?.length >= 2 && !seen.has(q.q)) { seen.add(q.q); out.push(q); } }
        return out;
    }
    async function renderQuizTv(host, T) {
        const tr = await T.tree(), st = T.start(tr);
        host.innerHTML = `<form class="h-tr-panel" data-qz-form><div class="h-tr-row"><label style="flex:1;min-width:280px">Les équipes (séparées par des virgules)<input name="teams" value="Les ${T.esc(st?.last || 'Martin')}, Les cousins"></label>
            <label>Questions<input type="number" name="n" min="3" max="60" value="12" style="width:5em"></label><label>Secondes pour répondre<input type="number" name="sec" min="0" max="120" value="20" style="width:5em"></label>
            <button class="button" type="submit">📺 Lancer le quiz</button></div>
            <p class="h-tr-muted">Branche l’ordinateur sur la télé : la question et les quatre réponses s’affichent en grand ; à la fin du compte à rebours (ou avec <b>Entrée</b>), la bonne réponse apparaît, puis on donne le point à l’équipe qui a trouvé (touches <b>1</b> à <b>9</b>). Répondre depuis les téléphones demanderait que l’application soit joignable depuis tout le réseau de la maison : ce n’est pas possible pour l’instant, on joue devant l’écran.</p></form>
            <div data-qz-prev></div>`;
        const form = host.querySelector('[data-qz-form]');
        host.querySelector('[data-qz-prev]').innerHTML = `<h3>Un avant-goût</h3><ol>${quizQuestions(T, tr, 3, 7).map(q => `<li>${T.esc(q.q)}</li>`).join('')}</ol>`;
        form.addEventListener('submit', e => {
            e.preventDefault();
            const teams = form.elements.teams.value.split(',').map(s => s.trim()).filter(Boolean).slice(0, 9), qs = quizQuestions(T, tr, Number(form.elements.n.value) || 12), sec = Math.max(0, Number(form.elements.sec.value) || 0);
            if (!teams.length) return T.toast('Donne au moins une équipe.', 'error'); if (!qs.length) return T.toast('L’arbre est trop petit pour faire des questions.', 'error');
            const score = teams.map(() => 0), ov = document.createElement('div'); ov.className = 'h-tr-veillee h-tr-quiz'; document.body.appendChild(ov);
            let i = 0, shown = false, left = sec, timer = null, alive = true, given = false;
            const L = 'ABCDEFGH', close = () => { alive = false; clearInterval(timer); document.removeEventListener('keydown', key, true); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); ov.remove(); };
            const board = () => `<div class="h-tr-qz-score">${teams.map((t, k) => `<button type="button" data-qz-pt="${k}" ${shown && !given ? '' : 'disabled'}><small>${k + 1}</small> ${T.esc(t)} <b>${score[k]}</b></button>`).join('')}</div>`;
            const draw = () => {
                if (i >= qs.length) { const best = Math.max(...score), win = teams.filter((t, k) => score[k] === best);
                    ov.innerHTML = `<div class="h-tr-vl-slide"><div class="h-tr-vl-ini">🏆</div><h2>${win.length > 1 ? 'Égalité !' : `${T.esc(win[0])} gagne !`}</h2><ol class="h-tr-qz-final">${teams.map((t, k) => [t, score[k]]).sort((a, b) => b[1] - a[1]).map(([t, s]) => `<li>${T.esc(t)} — ${s} point${s > 1 ? 's' : ''}</li>`).join('')}</ol></div><div class="h-tr-vl-bar"><button type="button" data-qz="close">✕ Fermer</button></div>`; return; }
                const q = qs[i];
                ov.innerHTML = `<div class="h-tr-qz"><div class="h-tr-qz-top"><span>Question ${i + 1} / ${qs.length}</span>${sec && !shown ? `<b class="h-tr-qz-time">${left}</b>` : ''}</div><h2>${T.esc(q.q)}</h2>
                    <div class="h-tr-qz-opts">${q.options.map((o, k) => `<div class="h-tr-qz-opt ${shown ? (k === q.answer ? 'is-good' : 'is-bad') : ''}"><b>${L[k]}</b> ${T.esc(o)}</div>`).join('')}</div>
                    ${shown && q.why ? `<p class="h-tr-qz-why">${T.esc(q.why)}</p>` : ''}${board()}
                    <div class="h-tr-vl-bar">${shown ? `<button type="button" data-qz="next">Question suivante ▶</button>` : `<button type="button" data-qz="show">Voir la réponse (Entrée)</button>`}<button type="button" data-qz="close">✕ Fin</button></div></div>`;
            };
            const reveal = () => { clearInterval(timer); shown = true; given = false; draw(); };
            const next = () => { i++; shown = false; given = false; left = sec; draw(); clearInterval(timer); if (sec && i < qs.length) timer = setInterval(() => { left--; if (left <= 0) reveal(); else { const t = ov.querySelector('.h-tr-qz-time'); if (t) t.textContent = left; } }, 1000); };
            const point = k => { if (!shown || given || k < 0 || k >= teams.length) return; score[k]++; given = true; draw(); };
            const key = ev => { if (!alive) return; if (ev.key === 'Escape') { ev.preventDefault(); close(); } else if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); if (i >= qs.length) close(); else if (shown) next(); else reveal(); } else if (/^[1-9]$/.test(ev.key)) point(Number(ev.key) - 1); };
            document.addEventListener('keydown', key, true);
            ov.addEventListener('click', ev => { const b = ev.target.closest('[data-qz],[data-qz-pt]'); if (!b) return; if (b.dataset.qzPt != null) return point(Number(b.dataset.qzPt)); ({close, show: reveal, next})[b.dataset.qz]?.(); });
            ov.requestFullscreen?.().catch(() => {}); i = -1; next();
        });
    }
    F.push({key: 'quiz-tv', group: 'jouer', icon: '📺', title: 'Le quiz du repas', desc: 'Sur la télé, en équipes : des questions tirées de l’arbre (qui a épousé qui, où, quel métier), compte à rebours et scores.', render: renderQuizTv});
    ext.tresorQuiz = {quizQuestions};
})();
