/* LCNDA — 📜 Atelier de transcription, vague 2 : 👁 la relecture ligne à ligne en plein écran (maquette docs/design/atelier-transcription-idees.html,
 * F1 ; décision 7 : un réglage, conseillé oui). Le morceau d'image de la ligne (sa zone) juste au-dessus de la ligne de texte, qu'on corrige
 * sur place : le texte de l'acte suit tout de suite (zones et personnes décalées comme quand on écrit dans l'Atelier).
 * Entrée : la ligne est relue, on passe à la suivante · ⇧ Entrée : ligne d'avant · ↑ ↓ : sans marquer · Échap : fermer · « ↶ Annuler ».
 * Les lignes relues sont gardées avec l'acte (data.reviewed : l'empreinte de chaque ligne relue ; une ligne changée ensuite n'est plus relue).
 * Ouvert par heritage-transcribe.js : ext.txReview.open(ctx) — essai : tests/test-atelier-vague2.js.
 */
(() => {
    'use strict';
    const i18n = (s, v) => { const I = window.LCNDA_I18N; if (v) v = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, typeof x === 'number' ? String(x) : x])); return I ? I.t(s, v) : (v ? String(s).replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m)) : s); };
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const plural = (n, one, many) => (A()?.plural ? A().plural(n, one, many) : `${n} ${n > 1 ? many || one + 's' : one}`);

    /** l'empreinte d'une ligne (FNV-1a, base 36) : les espaces en trop ne comptent pas */
    const lineKey = s => { let h = 0x811c9dc5; for (const ch of String(s).replace(/\s+/g, ' ').trim()) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(36); };
    /** les lignes du texte : {n (numéro dans la marge), s, e, text} ; seulement celles qui ont des lettres */
    const linesOf = text => { const out = []; let at = 0; String(text).split('\n').forEach((l, i) => { if (l.trim()) out.push({n: i + 1, s: at, e: at + l.length, text: l}); at += l.length + 1; }); return out; };
    /** combien de lignes relues (pour l'avancement) */
    const reviewedCount = (text, keys) => { const set = new Set(keys || []); const ls = linesOf(text); return {done: ls.filter(l => set.has(lineKey(l.text))).length, total: ls.length}; };

    /**
     * open({title, text(), replace(s, e, str), zones(), imageSrc(), filter(), reviewed: () => [clés], setReviewed([clés]), start (position dans le texte), onClose(ligne)})
     */
    function open(ctx) {
        let lines = linesOf(ctx.text());
        if (!lines.length) { A().toast(i18n('Le texte est vide : lis ou écris d’abord l’acte.'), 'error'); return null; }
        let idx = Math.max(0, lines.findIndex(l => ctx.start != null && ctx.start >= l.s && ctx.start <= l.e)), zoomK = 1, im = null, editBefore = null;
        const undo = []; // [{n, text}] : la ligne d'avant chaque correction
        const dlg = document.createElement('dialog'); dlg.className = 'modal is-full h-txr-dlg';
        dlg.innerHTML = `<div class="h-txr" role="document">
            <header class="h-txr-top"><b>👁 ${esc(i18n('Relecture'))}</b><span class="h-txr-title" data-i18n-off>${esc(ctx.title || '')}</span><span class="h-txr-pos" data-txr-pos></span>
                <span class="h-txr-prog" data-txr-prog><span class="h-txr-progbar"><b data-txr-progfill></b></span><small data-txr-done></small></span><span class="spacer"></span>
                <button type="button" class="button small secondary" data-txr="close" title="${esc(i18n('Fermer'))}" data-shortcut="Échap">× ${esc(i18n('Fermer'))}</button></header>
            <div class="h-txr-body">
                <p class="h-txr-ctx" data-txr-prev data-i18n-off></p>
                <div class="h-txr-band" data-txr-band><canvas data-txr-img role="img" aria-label="${esc(i18n('Le morceau d’image de la ligne'))}"></canvas><p class="h-txr-noimg" data-txr-noimg hidden>${esc(i18n('Pas de zone pour cette ligne : dessine-la sur l’image (▭), elle restera reliée.'))}</p></div>
                <div class="h-txr-edit"><span class="h-txr-n" data-txr-n></span><input type="text" class="h-txr-line" data-txr-line spellcheck="false" autocomplete="off" data-ui-off aria-label="${esc(i18n('Ligne à relire'))}"><span class="h-txr-ok" data-txr-ok hidden title="${esc(i18n('Relue'))}">✓</span></div>
                <p class="h-txr-ctx" data-txr-next data-i18n-off></p>
            </div>
            <footer class="h-txr-bar">
                <button type="button" class="button small secondary" data-txr="prev" data-shortcut="⇧↩">‹ ${esc(i18n('Ligne d’avant'))}</button>
                <button type="button" class="button small" data-txr="next" data-shortcut="↩">✓ ${esc(i18n('Ligne suivante', {ctx: 'atelier'}))}</button>
                <span class="h-txr-zoom"><button type="button" class="button small secondary" data-txr="zout" title="${esc(i18n('Zoom arrière'))}" aria-label="${esc(i18n('Zoom arrière'))}">−</button><span data-txr-zk>100 %</span><button type="button" class="button small secondary" data-txr="zin" title="${esc(i18n('Zoom avant'))}" aria-label="${esc(i18n('Zoom avant'))}">＋</button></span>
                <button type="button" class="button small secondary" data-txr="undo" disabled>↶ ${esc(i18n('Annuler'))}</button>
                <small class="h-txr-hint">${esc(i18n('Entrée : la ligne est relue, ligne suivante · ⇧ Entrée : ligne d’avant · ↑ ↓ : changer de ligne sans la marquer · Échap : fermer'))}</small>
            </footer></div>`;
        document.body.appendChild(dlg); dlg.showModal();
        const $ = s => dlg.querySelector(s), input = $('[data-txr-line]'), cv = $('[data-txr-img]');
        const keys = () => new Set(ctx.reviewed() || []);
        /** le morceau d'image : la zone qui couvre le plus la ligne, un peu élargie en hauteur */
        const zoneOf = l => { let best = null, bo = 0; (ctx.zones() || []).forEach(z => { if (!(z.e > z.s)) return; const o = Math.min(z.e, l.e) - Math.max(z.s, l.s); if (o > bo) { bo = o; best = z; } }); return best; };
        function drawBand() {
            const l = lines[idx], z = l && zoneOf(l), band = $('[data-txr-band]');
            $('[data-txr-noimg]').hidden = !!z; cv.hidden = !z; dlg.dataset.txrZone = z ? z.id : '';
            if (!z || !im?.naturalWidth) return;
            const padY = Math.round(z.h * .25), x = Math.max(0, z.x - 6), y = Math.max(0, z.y - padY), w = Math.min(im.naturalWidth - x, z.w + 12), h = Math.min(im.naturalHeight - y, z.h + padY * 2);
            const avail = Math.max(120, band.clientWidth - 4), k = Math.min(avail / w, 160 / h) * zoomK, dpr = devicePixelRatio || 1;
            cv.width = Math.max(1, Math.round(w * k * dpr)); cv.height = Math.max(1, Math.round(h * k * dpr)); cv.style.width = `${Math.round(w * k)}px`; cv.style.height = `${Math.round(h * k)}px`;
            const g = cv.getContext('2d'); g.filter = ctx.filter?.() || 'none'; g.imageSmoothingQuality = 'high'; g.drawImage(im, x, y, w, h, 0, 0, cv.width, cv.height);
            $('[data-txr-zk]').textContent = `${Math.round(zoomK * 100)} %`;
        }
        function paint({focus = true} = {}) {
            lines = linesOf(ctx.text()); idx = Math.min(idx, lines.length - 1); const l = lines[idx]; if (!l) return close();
            const set = keys(), done = lines.filter(x => set.has(lineKey(x.text))).length, prev = lines[idx - 1], next = lines[idx + 1];
            $('[data-txr-pos]').textContent = i18n('Ligne {n} sur {total}', {n: idx + 1, total: lines.length});
            $('[data-txr-done]').textContent = plural(done, 'ligne relue', 'lignes relues'); $('[data-txr-progfill]').style.width = `${Math.round(done / lines.length * 100)}%`;
            $('[data-txr-prev]').textContent = prev ? `${prev.n} · ${prev.text}` : ''; $('[data-txr-next]').textContent = next ? `${next.n} · ${next.text}` : '';
            $('[data-txr-n]').textContent = String(l.n); if (input.value !== l.text || document.activeElement !== input) input.value = l.text;
            $('[data-txr-ok]').hidden = !set.has(lineKey(l.text)); $('[data-txr="prev"]').disabled = idx === 0; $('[data-txr="undo"]').disabled = !undo.length;
            dlg.dataset.txrLine = String(l.n); dlg.dataset.txrVisit = ''; editBefore = l.text;
            drawBand(); if (focus) { input.focus({preventScroll: true}); }
        }
        const go = (d, mark = false) => {
            if (mark) { const l = lines[idx], set = keys(); set.add(lineKey(l.text)); ctx.setReviewed([...set]); }
            if (idx + d >= 0 && idx + d < lines.length) idx += d;
            else if (mark && idx === lines.length - 1) A().toast?.(lines.length > 1 && keys().size >= lines.length ? i18n('Toutes les lignes sont relues.') : i18n('C’était la dernière ligne.'));
            paint(); input.select();
        };
        /** la ligne corrigée : le texte de l'acte suit (une seule entrée « ↶ Annuler » par visite de la ligne) */
        input.addEventListener('input', () => {
            const l = lines[idx]; if (!l) return; const v = input.value.replace(/\n/g, ' ');
            if (editBefore != null && !undo.some(u => u.visit === dlg.dataset.txrVisit)) { dlg.dataset.txrVisit = String(Date.now()); undo.push({n: l.n, text: editBefore, visit: dlg.dataset.txrVisit}); }
            ctx.replace(l.s, l.e, v); lines = linesOf(ctx.text()); $('[data-txr="undo"]').disabled = false; $('[data-txr-ok]').hidden = !keys().has(lineKey(v));
        });
        input.addEventListener('focus', () => { dlg.dataset.txrVisit = ''; });
        function undoLast() {
            const u = undo.pop(); if (!u) return A().toast?.(i18n('Rien à annuler'));
            const all = linesOf(ctx.text()), l = all.find(x => x.n === u.n); if (!l) return;
            ctx.replace(l.s, l.e, u.text); idx = Math.max(0, linesOf(ctx.text()).findIndex(x => x.n === u.n)); dlg.dataset.txrVisit = ''; paint(); input.select();
        }
        function close() { if (!dlg.isConnected) return; dlg.close(); }
        dlg.addEventListener('close', () => { const l = lines[idx]; dlg.remove(); ctx.onClose?.(l ? linesOf(ctx.text()).find(x => x.n === l.n) || null : null); });
        dlg.addEventListener('cancel', e => { e.preventDefault(); close(); });
        dlg.addEventListener('click', e => { const b = e.target.closest('[data-txr]'); if (!b) return; const k = b.dataset.txr;
            if (k === 'close') return close(); if (k === 'next') return go(1, true); if (k === 'prev') return go(-1); if (k === 'undo') return undoLast();
            if (k === 'zin' || k === 'zout') { zoomK = Math.max(.5, Math.min(4, zoomK * (k === 'zin' ? 1.25 : .8))); drawBand(); } });
        dlg.addEventListener('keydown', e => {
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); return close(); }
            if (e.target !== input) return;
            if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); return go(e.shiftKey ? -1 : 1, !e.shiftKey); }
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); return go(e.key === 'ArrowDown' ? 1 : -1); }
            if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && undo.length && input.value === editBefore) { e.preventDefault(); e.stopPropagation(); undoLast(); }
        });
        const ro = new ResizeObserver(() => drawBand()); ro.observe($('[data-txr-band]')); dlg.addEventListener('close', () => ro.disconnect());
        im = new Image(); im.onload = () => { if (dlg.isConnected) drawBand(); }; const src = ctx.imageSrc?.(); if (src) im.src = src;
        paint(); input.select();
        dlg.txReview = {get index() { return idx; }, lines: () => lines};
        return dlg;
    }
    ext.txReview = {open, lineKey, linesOf, reviewedCount};
})();
