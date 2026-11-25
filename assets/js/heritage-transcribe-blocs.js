/* LCNDA — 📑 L'Atelier de transcription : les pages d'un document l'une sous l'autre, chacune dans son bloc (un seul texte coupé par
 * « — page 2 — », heritage-transcribe-pages.js). Le texte reste UN texte (une seule case, un seul historique, les mêmes numéros de
 * ligne) ; par-dessus la case, une couche dessine :
 *  - pour chaque page, une barre fine « ▾ 📄 Page 2 · 12 lignes · 8 zones » posée sur la ligne du repère « — page 2 — » (la page 1 :
 *    dans la marge du haut), qui reste en haut pendant qu'on fait défiler sa page ; au survol ou au clavier : « ✨ Lire cette page »,
 *    « ↦ Voir l'image » ;
 *  - une page vide : « Page 2 vide — ✨ Lire cette page ou écris ici » (le curseur se pose sur sa ligne vide) ;
 *  - ▸ une page repliée : ses lignes cachées sous un cache (le texte n'est pas touché : enregistré, cherché, numéros des autres
 *    pages inchangés) ; le curseur, une recherche, une zone ou une lecture qui y va la déplie ; Alt + clic : toutes les pages ;
 *    retenu pour cet acte sur cet ordinateur (genealogie-tx-pages-pliees-<acte>).
 * Ctrl/⌘ + ↓ / ↑ : le début de la page suivante / d'avant.
 *   ext.txBlocks = {mount, FOLD_PREFIX, foldGet, foldSet}
 */
(() => {
    'use strict';
    const G = typeof window !== 'undefined' ? window : globalThis;
    const ext = G.LCNDA_EXT = G.LCNDA_EXT || {};
    const T = (k, v) => (G.LCNDA_I18N?.t ? G.LCNDA_I18N.t(k, v) : String(k).replace(/\{(\w+)\}/g, (_, x) => v?.[x] ?? ''));
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const plural = (n, one) => (G.LCNDA_APP?.plural ? G.LCNDA_APP.plural(n, one) : `${n} ${one}${n > 1 ? 's' : ''}`);
    const FOLD_PREFIX = 'genealogie-tx-pages-pliees-';
    const MARK = /^—[ \t]*[\p{L}.]+[ \t]+\d+[^\n—]*—[ \t]*$/u;
    /** les pages repliées d'un acte (les n° de média des pages) */
    function foldGet(key) { try { const v = JSON.parse(G.localStorage?.getItem(FOLD_PREFIX + key) || '[]'); return new Set((Array.isArray(v) ? v : []).map(Number).filter(Boolean)); } catch (_) { return new Set(); } }
    function foldSet(key, set) { try { if (set.size) G.localStorage?.setItem(FOLD_PREFIX + key, JSON.stringify([...set])); else G.localStorage?.removeItem(FOLD_PREFIX + key); } catch (_) {} }
    /** les lignes écrites d'un morceau (sans les lignes vides ni les repères) */
    const linesIn = s => String(s || '').split('\n').filter(l => l.trim() && !MARK.test(l)).length;

    /**
     * o = {editor, area, mirror,
     *      on: () => bool (un seul texte sur plusieurs pages),
     *      pages: () => [{pid, n, name}] dans l'ordre des morceaux du texte,
     *      cur: () => le morceau de la page affichée,
     *      zones: pid => nombre de zones de cette page,
     *      key: () => la clé de l'acte (pour retenir les pages repliées),
     *      show: i => montrer l'image de la page du morceau i, read: i => lire cette page, readTitle: () => la lecture choisie,
     *      caret: () => le curseur a changé de page (l'image suit)}
     */
    function mount(o) {
        const PG = ext.txPages, {editor, area, mirror} = o;
        let layer = null, folded = new Set(), key = null, raf = 0, geo = null;
        const segs = () => PG.segments(area.value);
        const loadFolds = () => { const k = String(o.key() || ''); if (k !== key) { if (key !== null && k && !foldGet(k).size && folded.size) foldSet(k, folded); key = k; folded = foldGet(k); } };
        const pidOf = i => Number(o.pages()[i]?.pid || 0);
        const isFolded = i => folded.has(pidOf(i));
        function setFold(i, on) { const p = pidOf(i); if (!p || folded.has(p) === !!on) return false; if (on) folded.add(p); else folded.delete(p); foldSet(key, folded); paint(); return true; }
        const unfold = i => setFold(i, false);
        function toggleAll() { const n = o.pages().length, anyOpen = [...Array(n).keys()].some(i => !isFolded(i)); o.pages().forEach(p => { if (anyOpen) folded.add(Number(p.pid)); else folded.delete(Number(p.pid)); }); foldSet(key, folded); paint(); }
        /** une position du texte dans une page repliée : la page se déplie */
        function revealPos(pos) { if (!o.on() || !(pos >= 0)) return; loadFolds(); const i = PG.segAt(area.value, pos); if (isFolded(i)) unfold(i); }
        function ensureLayer() {
            if (layer?.isConnected) return layer;
            layer = document.createElement('div'); layer.className = 'h-tx-pgblocks'; layer.dataset.txPgblocks = '';
            editor.appendChild(layer);
            layer.addEventListener('click', e => {
                const hd = e.target.closest('[data-tx-pghd]'); const em = e.target.closest('[data-tx-pgempty]');
                const i = Number((hd || em)?.dataset.seg); if (!(hd || em) || !(i >= 0)) return;
                if (e.target.closest('[data-tx-pgread]')) { e.preventDefault(); o.read(i); return; }
                if (e.target.closest('[data-tx-pgshow]')) { e.preventDefault(); o.show(i); return; }
                if (!hd) return;
                e.preventDefault();
                if (e.altKey) { toggleAll(); return; }
                const was = isFolded(i); setFold(i, !was);
                layer.querySelector(`[data-tx-pghd][data-seg="${i}"] [data-tx-pgfold]`)?.focus({preventScroll: true});
            });
            // la molette sur une barre fait défiler le texte (la barre est posée sur la case)
            layer.addEventListener('wheel', e => { area.scrollTop += e.deltaY; e.preventDefault(); }, {passive: false});
            return layer;
        }
        /** la position (par rapport à la case, en points d'écran) du haut de chaque page ; la fin du texte */
        function measure() {
            const er = editor.getBoundingClientRect(), lh = parseFloat(getComputedStyle(area).lineHeight) || 24, n = segs().length, tops = new Array(n).fill(null);
            const first = mirror.firstElementChild, fr = first?.getClientRects?.()[0];
            tops[0] = (fr ? fr.top - er.top : 12 - area.scrollTop) - lh;
            mirror.querySelectorAll('[data-mk]').forEach(el => { const j = Number(el.dataset.mk), r = el.getClientRects()[0]; if (r && j + 1 < n) tops[j + 1] = r.top - er.top; });
            const last = mirror.lastElementChild?.getClientRects?.(), bottom = last?.length ? last[last.length - 1].bottom - er.top : tops[n - 1] + lh * 2;
            for (let i = 1; i < n; i++) if (tops[i] == null) tops[i] = tops[i - 1] + lh; // un repère pas trouvé (une zone à cheval sur deux pages) : juste après
            return {lh, tops, bottom: Math.max(bottom, tops[n - 1] + lh * 2), h: er.height, w: area.clientWidth, pl: parseFloat(getComputedStyle(area).paddingLeft) || 14};
        }
        function headHtml(i, p, sg, text) {
            const cur = o.cur() === i, fold = isFolded(i), body = text.slice(sg.s, sg.e), nl = linesIn(body), nz = o.zones(p.pid);
            const meta = `${plural(nl, 'ligne')} · ${plural(nz, 'zone')}`;
            const tip = fold ? T('Déplier cette page') : T('Replier cette page');
            return `<div class="h-tx-pghd${cur ? ' is-on' : ''}${fold ? ' is-fold' : ''}" data-tx-pghd data-seg="${i}" role="group" aria-label="${esc(p.name)}">`
                + `<button type="button" class="h-tx-pgfold" data-tx-pgfold aria-expanded="${!fold}" title="${esc(tip + ' ' + T('(Alt + clic : toutes les pages)'))}" aria-label="${esc(tip)}">${fold ? '▸' : '▾'}</button>`
                + `<span class="h-tx-pgt">📄 <b>${esc(p.name)}</b><span class="h-tx-pgmeta"> · ${esc(meta)}</span></span>`
                + `<span class="h-tx-pgact"><button type="button" data-tx-pgread title="${esc(o.readTitle())}">✨<span class="h-tx-pgl"> ${esc(T('Lire cette page'))}</span></button>`
                + `<button type="button" data-tx-pgshow title="${esc(T('Voir l’image de cette page'))}">↦<span class="h-tx-pgl"> ${esc(T('Voir l’image'))}</span></button></span></div>`;
        }
        function paint() {
            if (!o.on() || !PG) { if (layer) { layer.remove(); layer = null; } editor.classList.remove('has-pgblocks'); delete editor.dataset.txPgfold; return; }
            loadFolds();
            editor.classList.add('has-pgblocks'); ensureLayer();
            const text = area.value, S = segs(), P = o.pages(), g = geo = measure(); let html = '';
            S.forEach((sg, i) => {
                const p = P[i] || {pid: 0, n: i + 1, name: T('Page {n}', {n: i + 1})}, top = g.tops[i], end = i + 1 < S.length ? g.tops[i + 1] : g.bottom;
                // 📌 la barre reste en haut pendant qu'on fait défiler sa page ; la suivante la pousse
                const y = top < 0 ? Math.min(0, end - g.lh) : top;
                const empty = !text.slice(sg.s, sg.e).trim();
                if (isFolded(i) && !empty) html += `<div class="h-tx-pgcover" data-tx-pgcover data-seg="${i}" style="top:${top + g.lh}px;height:${Math.max(0, end - top - g.lh)}px;width:${g.w}px"><span>${esc(T('Page repliée : {x} cachées (le texte est gardé) — clique dedans pour la déplier', {x: plural(linesIn(text.slice(sg.s, sg.e)), 'ligne')}))}</span></div>`;
                else if (empty) html += `<div class="h-tx-pgempty" data-tx-pgempty data-seg="${i}" style="top:${top + g.lh}px;left:${g.pl}px;height:${g.lh}px"><span>${esc(T('{page} vide', {page: p.name}))} — </span><button type="button" data-tx-pgread>✨ ${esc(T('Lire cette page'))}</button><span> ${esc(T('ou écris ici'))}</span></div>`;
                if (y > g.h || end < 0) return; // hors de la vue
                html += headHtml(i, p, sg, text).replace('data-tx-pghd ', `data-tx-pghd style="top:${y}px;width:${g.w}px;height:${g.lh}px" `);
            });
            const had = layer.contains(document.activeElement) ? document.activeElement : null, sel = had?.closest('[data-tx-pghd]')?.dataset.seg, which = had?.matches('[data-tx-pgfold]') ? 'pgfold' : had?.matches('[data-tx-pgread]') ? 'pgread' : had?.matches('[data-tx-pgshow]') ? 'pgshow' : '';
            if (layer.innerHTML !== html) layer.innerHTML = html;
            if (sel != null && which) layer.querySelector(`[data-tx-pghd][data-seg="${sel}"] [data-tx-${which}]`)?.focus({preventScroll: true});
            editor.dataset.txPgfold = [...folded].join(',');
        }
        const soon = () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; if (editor.isConnected) paint(); }); };
        area.addEventListener('scroll', soon);
        // le curseur entre dans une page repliée (clic, flèches, frappe, choix) : elle se déplie
        const caretIn = () => { if (o.on()) { revealPos(area.selectionStart); if (area.selectionEnd !== area.selectionStart) revealPos(area.selectionEnd); } };
        ['click', 'keyup', 'input', 'select'].forEach(ev => area.addEventListener(ev, caretIn));
        if (typeof ResizeObserver === 'function') new ResizeObserver(soon).observe(editor);
        /** Ctrl/⌘ + ↓ / ↑ : le curseur au début de la page suivante / d'avant, sa barre en haut de la case */
        function jump(d) {
            if (!o.on()) return false;
            const S = segs(), i = PG.segAt(area.value, area.selectionStart), j = Math.max(0, Math.min(S.length - 1, i + d)); if (j === i) return true;
            if (isFolded(j)) unfold(j);
            const g = measure(), pos = S[j].s; area.setSelectionRange(pos, pos);
            area.scrollTop = Math.max(0, area.scrollTop + g.tops[j]); mirror.scrollTop = area.scrollTop;
            o.caret?.(); paint(); return true;
        }
        /** le texte de la page i commence en haut de la case (un clic sur ↦, une lecture posée) */
        function scrollTo(i) { const g = measure(); if (g.tops[i] == null) return; if (g.tops[i] < 0 || g.tops[i] > g.h - g.lh * 2) { area.scrollTop = Math.max(0, area.scrollTop + g.tops[i]); mirror.scrollTop = area.scrollTop; } soon(); }
        return {paint, soon, unfold, revealPos, isFolded, setFold, toggleAll, jump, scrollTo, folded: () => [...folded], geo: () => geo};
    }
    ext.txBlocks = {mount, FOLD_PREFIX, foldGet, foldSet, linesIn};
})();
