/* LCNDA — Recueils › État : « 🔍 Pages blanches et photos en double ».
 * Chaque photo rangée sur une page est réduite en tout petit : une page presque uniforme et sans encre est proposée
 * « page blanche » ; deux photos qui se ressemblent (leur forme en 24 × 32 cases, comparée point à point) sont proposées « en double ».
 * Rien ne change tout seul : on coche, on valide, et « ↶ Annuler » remet tout.
 *   window.LCNDA_EXT.recueilVerif = {sigOf, sim, find, open(ctx)} */
(function (root) {
    'use strict';
    /** empreinte d'une image en niveaux de gris : g (Float32Array ou tableau) de w × h valeurs 0..255
     *  → {blank, vec (24 × 32 valeurs centrées réduites : la « forme » de la page), ink (part de points sombres), sd (écart type)} */
    const GW = 24, GH = 32;
    function sigOf(g, w, h) {
        const n = w * h; let s = 0, s2 = 0; for (let i = 0; i < n; i++) { s += g[i]; s2 += g[i] * g[i]; }
        const m = s / n, sd = Math.sqrt(Math.max(0, s2 / n - m * m)); let dark = 0; for (let i = 0; i < n; i++) if (g[i] < m - 45) dark++;
        const ink = dark / n, v = new Array(GW * GH);
        for (let cy = 0; cy < GH; cy++) for (let cx = 0; cx < GW; cx++) { const x0 = Math.floor(cx * w / GW), x1 = Math.max(x0 + 1, Math.floor((cx + 1) * w / GW)), y0 = Math.floor(cy * h / GH), y1 = Math.max(y0 + 1, Math.floor((cy + 1) * h / GH)); let t = 0, k = 0;
            for (let y = y0; y < y1 && y < h; y++) for (let x = x0; x < x1 && x < w; x++) { t += g[y * w + x]; k++; } v[cy * GW + cx] = k ? t / k : m; }
        let vm = 0; v.forEach(x => { vm += x; }); vm /= v.length; let vs = 0; v.forEach(x => { vs += (x - vm) ** 2; }); vs = Math.sqrt(vs / v.length) || 1;
        return {blank: ink < 0.004 && sd < 14, vec: v.map(x => Math.round((x - vm) / vs * 100) / 100), ink, sd};
    }
    /** ressemblance de deux pages : 1 = la même photo, autour de 0 = rien à voir (corrélation) */
    function sim(a, b) { if (!a || !b || a.length !== b.length) return 0; let t = 0; for (let i = 0; i < a.length; i++) t += a[i] * b[i]; return t / a.length; }
    /** items : [{id, page_id, sig}] → {blank: [items], dups: [[a, b, ressemblance]]} ; une page blanche n'est pas comparée (toutes les pages blanches se ressemblent) */
    function find(items, {min = .88} = {}) {
        const blank = items.filter(i => i.sig.blank), rest = items.filter(i => !i.sig.blank), dups = [];
        for (let i = 0; i < rest.length; i++) for (let j = i + 1; j < rest.length; j++) { const d = sim(rest[i].sig.vec, rest[j].sig.vec); if (d >= min) dups.push([rest[i], rest[j], d]); }
        return {blank, dups: dups.sort((a, b) => b[2] - a[2])};
    }

    const api = {sigOf, sim, find};
    if (typeof module === 'object' && module.exports) { module.exports = api; return; }
    const ext = root.LCNDA_EXT = root.LCNDA_EXT || {}, A = () => root.LCNDA_APP;
    const T = (s, v) => (root.LCNDA_I18N ? root.LCNDA_I18N.t(s, v) : String(s).replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const url = i => `media/${encodeURIComponent(i.thumbnail || i.filename)}`;
    const load = src => new Promise(ok => { const im = new Image(); const to = setTimeout(() => ok(null), 8000); im.onload = () => { clearTimeout(to); ok(im); }; im.onerror = () => { clearTimeout(to); ok(null); }; im.src = src; });
    async function sigOfImage(src) {
        const im = await load(src); if (!im || !im.naturalWidth) return null;
        const W = 72, H = 64, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d', {willReadFrequently: true});
        // les bords de la photo (table, règle, doigts) faussent tout : on garde le centre (90 %)
        const mx = im.naturalWidth * .05, my = im.naturalHeight * .05; g.drawImage(im, mx, my, im.naturalWidth - 2 * mx, im.naturalHeight - 2 * my, 0, 0, W, H);
        const d = g.getImageData(0, 0, W, H).data, gray = new Float32Array(W * H); for (let i = 0; i < W * H; i++) gray[i] = .299 * d[i * 4] + .587 * d[i * 4 + 1] + .114 * d[i * 4 + 2];
        return sigOf(gray, W, H);
    }
    async function open(ctx) {
        const D = ctx.D(), pageOf = id => D.pages.find(p => p.id === id), name = p => (p ? (p.label ? `p. ${p.num} — ${p.label}` : T('Page {n}', {n: String(p.num)})) : T('À ranger'));
        const imgs = D.images.filter(i => i.page_id && /^image/.test(i.media_type || 'image') && (i.thumbnail || i.filename));
        const dg = document.createElement('dialog'); dg.className = 'modal rv-dlg'; document.body.appendChild(dg);
        dg.innerHTML = `<form method="dialog"><div class="modal-head"><div><span class="eyebrow">🗂 ${esc(D.recueil.title)}</span><h2>🔍 ${esc(T('Pages blanches et photos en double'))}</h2></div><button type="button" class="icon-button" data-rv-x aria-label="${esc(T('Fermer'))}">×</button></div>
            <div class="rv-body" data-rv-body><p>${esc(T('Je regarde les {n} photos…', {n: String(imgs.length)}))} <progress data-rv-prog max="${imgs.length}" value="0"></progress></p></div>
            <div class="modal-actions"><span class="spacer"></span><button type="button" class="button secondary" data-rv-x>${esc(T('Fermer'))}</button><button type="button" class="button" data-rv-ok disabled>${esc(T('Faire ce qui est coché'))}</button></div></form>`;
        dg.showModal(); const close = () => { dg.close(); dg.parentNode?.removeChild(dg); };
        dg.addEventListener('click', e => { if (e.target.closest('[data-rv-x]')) close(); }); dg.addEventListener('cancel', () => { dg.parentNode?.removeChild(dg); });
        const items = []; let k = 0;
        for (const i of imgs) { const s = await sigOfImage(url(i)); if (!dg.isConnected) return; k++; const pr = dg.querySelector('[data-rv-prog]'); if (pr) pr.value = k; if (s) items.push({...i, sig: s}); }
        const F = find(items), already = new Set(D.pages.filter(p => p.absent === 'blanche').map(p => p.id));
        const blank = F.blank.filter(i => !already.has(i.page_id) && !D.images.some(j => j.page_id === i.page_id && j.id !== i.id && !F.blank.includes(j)));
        const th = i => `<img src="${esc(url(i))}" alt="" loading="lazy">`;
        dg.querySelector('[data-rv-body]').innerHTML = !blank.length && !F.dups.length ? `<p>✓ ${esc(T('Rien à signaler : aucune page blanche, aucune photo en double.'))}</p>` : `
            ${blank.length ? `<h3>▫ ${esc(T('Pages qui semblent blanches'))} (${blank.length})</h3><p class="muted">${esc(T('Cochées : elles seront marquées « Page blanche » (pas absentes : vides).'))}</p><div class="rv-grid">${blank.map(i => `<label class="rv-card"><input type="checkbox" data-rv-blank="${i.page_id}" checked>${th(i)}<span>${esc(name(pageOf(i.page_id)))}</span></label>`).join('')}</div>` : ''}
            ${F.dups.length ? `<h3>⧉ ${esc(T('Photos qui se ressemblent'))} (${F.dups.length})</h3><p class="muted">${esc(T('Coche la photo à retirer du recueil (elle reste dans Médias).'))}</p>${F.dups.map(([a, b, d], n) => `<div class="rv-pair"><label class="rv-card"><input type="checkbox" data-rv-drop="${a.id}" data-rv-pair="${n}">${th(a)}<span>${esc(name(pageOf(a.page_id)))}</span></label><span class="rv-eq">${d > .98 ? '=' : '≈'}<small>${esc(T('{p} % pareilles', {p: String(Math.round(d * 100))}))}</small></span><label class="rv-card"><input type="checkbox" data-rv-drop="${b.id}" data-rv-pair="${n}" ${a.page_id === b.page_id ? 'checked' : ''}>${th(b)}<span>${esc(name(pageOf(b.page_id)))}</span></label></div>`).join('')}` : ''}`;
        const ok = dg.querySelector('[data-rv-ok]'); ok.disabled = !(blank.length || F.dups.length);
        ok.addEventListener('click', async () => {
            ok.disabled = true;
            const pids = [...dg.querySelectorAll('[data-rv-blank]:checked')].map(x => Number(x.dataset.rvBlank)), drop = [...new Set([...dg.querySelectorAll('[data-rv-drop]:checked')].map(x => Number(x.dataset.rvDrop)))];
            const undo = [];
            try {
                if (pids.length) { const r = await ctx.post('recueil_pages_set', {recueil_id: D.recueil.id, page_ids: pids, fields: {absent: 'blanche', absent_note: '', absent_until: ''}, gap: false}); const x = r.result || r; undo.push(() => ctx.post('recueil_pages_restore', {recueil_id: D.recueil.id, before: x.before, gap_id: x.gap_id})); }
                for (const id of drop) { const r = await ctx.post('remove_recueil_image', {id}); const x = r.result || r; if (x.restore) undo.push(() => ctx.post('restore_recueil_image', x.restore)); }
            } catch (e) { A().toast(e.message, 'error'); }
            close(); await ctx.reload();
            if (undo.length) A().undoToast?.(T('{b} page(s) blanche(s), {d} photo(s) en double retirée(s)', {b: String(pids.length), d: String(drop.length)}), {icon: '🔍', undo: async () => { for (const u of undo.reverse()) await u(); await ctx.reload(); }});
        });
        return F;
    }
    ext.recueilVerif = {...api, sigOfImage, open};
    if (!document.getElementById('rv-css')) { const st = document.createElement('style'); st.id = 'rv-css'; st.textContent = `
.rv-dlg{width:min(900px,96vw)}.rv-body{max-height:65vh;overflow:auto}.rv-body h3{margin:12px 0 4px}
.rv-grid{display:flex;flex-wrap:wrap;gap:10px}.rv-card{display:grid;gap:4px;justify-items:center;border:2px solid var(--line,#c9ced8);padding:6px;width:132px;font-size:12.5px;cursor:pointer;text-align:center}
.rv-card:has(input:checked){border-color:var(--accent,#055dff)}.rv-card img{width:110px;height:140px;object-fit:contain;background:var(--surface-2,#f4f5f7)}
.rv-pair{display:flex;align-items:center;gap:10px;margin:8px 0;flex-wrap:wrap}.rv-eq{display:grid;justify-items:center;font-size:22px}.rv-eq small{font-size:11px;color:var(--muted,#666)}
`; document.head.appendChild(st); }
})(typeof window !== 'undefined' ? window : null);
