/* LCNDA — 📜 Atelier de transcription, idée 37 : ⏭ « Acte suivant » et « Vue suivante » du même registre, et le champ « ✍ Main »
 * (maquette approuvée docs/design/atelier-idees.html ; réponse 4 : sur un registre IIIF, une vue téléchargée par clic).
 * Une bande discrète au-dessus de l'image, SEULEMENT quand l'acte vient d'un registre (un recueil, ou une vue IIIF, 🌐 40) :
 *   📚 BMS Treignac 1780-1792 · vue 139 / 268 · acte 2 · ✍ Curé J. LACOMBE  ↗ source      ◀   ＋ Acte suivant   Vue suivante →
 * ＋ Acte suivant (même vue) : l'acte d'après s'il existe, sinon un nouvel acte prêt à tracer sa zone sous la dernière zone ; repris :
 * commune, registre, cote, vue, main (la langue est déjà retenue) ; proposé : le même type et l'année (le jour reste vide).
 * Vue suivante → : même registre, vue + 1 (son premier acte, ou un nouvel acte) ; une vue IIIF est téléchargée à ce moment-là.
 * ◀ : l'acte d'avant. Raccourcis (hors des cases de texte) : Alt + → acte suivant, Alt + ⇧ + → vue suivante, Alt + ← acte d'avant.
 * « 📚 Registre et main… » (Édition, ou un clic sur la bande) : registre, cote, vue, main, archives — gardés avec l'acte (data.reg).
 * Serveur : lib/atelier_idees.php (op reg, iiif_open). Essai : tests/test-atelier-idees.js.
 */
(() => {
    'use strict';
    const i18n = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s).replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const get = q => A().api('atelier_idees', q);
    const post = b => A().api('atelier_idees_write', {}, {method: 'POST', body: b}).then(r => r?.result || r);
    const HANDS_KEY = 'genealogie-tx-mains';
    const hands = () => { try { const a = JSON.parse(localStorage.getItem(HANDS_KEY) || '[]'); return Array.isArray(a) ? a.filter(x => typeof x === 'string').slice(0, 60) : []; } catch (_) { return []; } };
    const rememberHand = h => { h = String(h || '').trim(); if (!h) return; try { localStorage.setItem(HANDS_KEY, JSON.stringify([h, ...hands().filter(x => x !== h)].slice(0, 60))); } catch (_) {} };
    const yearOf = s => (String(s || '').match(/\b(1[0-9]{3}|20[0-9]{2})\b/) || [])[1] || '';

    /** la source écrite d'après le registre : « Archives… , BMS Treignac 1780-1792, cote 3 E 271/4, vue 139 / 268 » */
    function sourceOf(reg = {}) {
        const view = reg.view ? (reg.total ? i18n('vue {n} / {total}', {n: reg.view, total: reg.total}) : i18n('vue {n}', {n: reg.view})) : '';
        return [reg.archive && reg.archive !== reg.register ? reg.archive : '', reg.register, reg.cote ? i18n('cote {c}', {c: reg.cote}) : '', view].filter(Boolean).join(', ');
    }
    /** une autre vue dans une source déjà écrite : « vue 139 / 268 » → « vue 140 / 268 » */
    const withView = (src, n, total) => (/\bvue\s*\d+/i.test(src) ? src.replace(/\bvue\s*\d+(\s*(?:\/|sur)\s*\d+)?/i, total ? `vue ${n} / ${total}` : `vue ${n}`) : src);
    ext.txSuivant = {sourceOf, withView}; // pour les essais

    function init(plug) {
        const {dlg, ctx, $} = plug, t = () => plug.t;
        const left = $('.h-tx-left'), stage = $('[data-tx-stage]'); if (!left || !stage) return;
        const strip = document.createElement('div'); strip.className = 'ais-strip'; strip.dataset.aisStrip = ''; strip.hidden = true;
        left.insertBefore(strip, stage);
        let info = null;
        /* ─── un nouvel acte venu de « Acte suivant » / « Vue suivante » / 🌐 : les champs repris ─── */
        const N = ctx.atelierNext;
        if (N) {
            const T = t(); T.data.reg = {...(N.reg || {})};
            const setF = (k, v) => { const el = $(`[data-tx="${k}"]`); if (el && v != null && !el.value) { el.value = v; T[k] = v; } };
            setF('place', N.place || ''); setF('date_text', N.date || ''); setF('source', N.source || sourceOf(T.data.reg));
            plug.touch();
            if (N.below != null) waitImage().then(() => guide(N.below, N.lineH || 40));
        }
        function waitImage() { return new Promise(res => { let k = 0; const f = () => (plug.geo().imgW || ++k > 100 || !dlg.isConnected ? res() : setTimeout(f, 80)); f(); }); }
        /** « nouvel acte : sous la dernière zone » — un repère en pointillé, l'outil ▭ Zone choisi */
        function guide(y, h) {
            const G = plug.geo(); if (!G.imgW) return;
            const zg = $('[data-tx-zones]'), g = document.createElementNS('http://www.w3.org/2000/svg', 'g'); g.setAttribute('data-ais-guide', ''); g.setAttribute('transform', zg.getAttribute('transform') || '');
            const yy = Math.min(G.imgH - 4, y + 4), hh = Math.max(12, Math.min(G.imgH - yy, h));
            g.innerHTML = `<rect x="${G.imgW * .03}" y="${yy}" width="${G.imgW * .94}" height="${hh}" class="ais-guide" rx="3"/><text x="${G.imgW * .04}" y="${yy + hh * .7}" class="ais-guide-t" font-size="${Math.max(12, hh * .45)}">${esc(i18n('nouvel acte : sous la dernière zone'))}</text>`;
            $('[data-tx-world]').appendChild(g); plug.setTool('zone'); plug.reveal({x: 0, y: yy, w: G.imgW, h: hh});
            const off = () => g.remove(); setTimeout(off, 30000); new MutationObserver((_, o) => { if ((plug.t.data.zones || []).some(z => z.y >= y - 2)) { off(); o.disconnect(); } }).observe(zg, {childList: true});
        }
        function paint() {
            const T = t(), reg = T.data.reg || {}, on = !!info?.register;
            strip.hidden = !on; dlg.dataset.aisRegister = on ? info.kind : '';
            if (!on) { strip.innerHTML = ''; return; }
            const title = reg.register || info.title || i18n('Registre');
            const bits = [info.view ? (info.total ? i18n('vue {n} / {total}', {n: info.view, total: info.total}) : i18n('vue {n}', {n: info.view})) : '', info.index && (info.acts_here || []).length > 1 ? i18n('acte {n}', {n: info.index}) : ''].filter(Boolean);
            const src = reg.page_url || info.url || '';
            strip.innerHTML = `<button type="button" class="ais-reg" data-ais-edit title="${esc(i18n('Registre, cote, vue et main de l’écriture (repris par « Acte suivant » et « Vue suivante »)'))}">📚 <b data-i18n-off>${esc(title)}</b>${bits.length ? ` · ${esc(bits.join(' · '))}` : ''}${reg.hand ? ` · <span class="ais-hand" data-i18n-off>✍ ${esc(reg.hand)}</span>` : ` · <span class="ais-hand is-empty">✍ ${esc(i18n('Main ?'))}</span>`}</button>`
                + (/^https?:\/\//i.test(src) ? `<a class="ais-src" href="${esc(src)}" target="_blank" rel="noopener noreferrer" title="${esc(i18n('La page officielle de ce registre'))}">↗ ${esc(i18n('source'))}</a>` : '')
                + `<span class="ais-sp"></span><button type="button" class="ais-btn" data-ais-go="prev" ${info.prev_act ? '' : 'disabled'} title="${esc(i18n('Acte d’avant (Alt + ←)'))}" aria-label="${esc(i18n('Acte d’avant'))}">◀</button>`
                + `<button type="button" class="ais-btn" data-ais-go="next" title="${esc(i18n('Acte suivant sur cette vue (Alt + →)'))}">${info.next_act ? `${esc(i18n('Acte suivant'))} ›` : `＋ ${esc(i18n('Acte suivant'))}`}</button>`
                + `<button type="button" class="ais-btn is-view" data-ais-go="view" ${info.next_view ? '' : 'disabled'} title="${esc(i18n('Vue suivante du registre (Alt + ⇧ + →)'))}">${esc(i18n('Vue suivante'))} →</button>`;
        }
        async function refresh() {
            const T = t(); if (!T.id && !T.media_id) { info = null; paint(); return null; }
            const R = T.id ? {} : Object.fromEntries(['manifest', 'n', 'total', 'register', 'page_url'].filter(k => T.data.reg?.[k]).map(k => [k, T.data.reg[k]])); // pas encore enregistré
            try { info = await get({op: 'reg', act_id: T.id || 0, media_id: T.media_id || 0, ...R}); } catch (_) { info = null; }
            plug.reg = info; paint(); return info;
        }
        /** ce que le prochain acte reprend */
        function carry(view = null) {
            const T = t(), reg = {...(T.data.reg || {})};
            if (info?.kind === 'recueil') { reg.recueil = info.recueil || reg.recueil; if (!reg.register) reg.register = info.title; reg.total = info.total; reg.view = info.view; }
            if (view) { reg.view = view.view; if (view.iiif) reg.n = view.iiif; }
            const src = $('[data-tx="source"]').value.trim(), built = sourceOf(T.data.reg || {});
            const source = !src || src === built ? sourceOf(reg) : view ? withView(src, reg.view, reg.total) : src;
            return {reg, place: $('[data-tx="place"]').value.trim(), date: yearOf($('[data-tx="date_text"]').value), source};
        }
        const kind = () => $('[data-tx="kind"]')?.value || 'apreciser';
        async function goNextAct() {
            const i = await refresh(); if (!i) return;
            if (i.next_act) return plug.switchTo({id: i.next_act});
            const T = t(), zs = (T.data.zones || []).filter(z => plug.onHere(z) && z.h > 0), below = zs.length ? Math.max(...zs.map(z => z.y + z.h)) : 0;
            const lineH = zs.length ? zs.reduce((a, z) => a + z.h, 0) / zs.length : 40;
            return plug.switchTo({mediaId: T.media_id, filename: T.filename, title: '', text: '', kind: kind(), atelierNext: {...carry(), below, lineH}});
        }
        async function goNextView() {
            const i = await refresh(); if (!i) return;
            const v = i.next_view; if (!v) return A().toast(i18n('C’est la dernière vue de ce registre.'));
            if (v.act_id) return plug.switchTo({id: v.act_id});
            let mid = v.media_id, fn = v.filename;
            if (!mid && v.iiif) { // 🌐 une seule vue, téléchargée maintenant (réponse 4)
                const reg = t().data.reg || {};
                plug.status(i18n('Téléchargement de la vue {n}…', {n: v.iiif}));
                try { const r = await post({op: 'iiif_open', url: reg.manifest, n: v.iiif}); mid = r.media_id; fn = r.filename; } catch (e) { plug.status(''); return A().toast(e.message, 'error'); }
                plug.status('');
            }
            if (!mid) return A().toast(i18n('Cette vue n’a pas encore d’image dans le recueil.'), 'error');
            return plug.switchTo({mediaId: mid, filename: fn, title: '', text: '', kind: kind(), atelierNext: carry(v)});
        }
        async function goPrev() { const i = await refresh(); if (i?.prev_act) return plug.switchTo({id: i.prev_act}); }
        // double / triple clic, Alt + → répété : un seul déplacement à la fois (sinon une vue IIIF téléchargée deux ou trois fois)
        let moving = null;
        const once = f => () => moving || (moving = Promise.resolve().then(f).finally(() => { moving = null; }));
        goNextAct = once(goNextAct); goNextView = once(goNextView); goPrev = once(goPrev);
        strip.addEventListener('click', e => {
            const b = e.target.closest('[data-ais-go]'); if (b) { if (b.dataset.aisGo === 'next') goNextAct(); else if (b.dataset.aisGo === 'view') goNextView(); else goPrev(); return; }
            if (e.target.closest('[data-ais-edit]')) editReg();
        });
        const onKey = e => {
            if (!dlg.open || [...document.querySelectorAll('dialog[open]')].at(-1) !== dlg || !info?.register) return;
            if (!e.altKey || e.metaKey || e.ctrlKey || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return;
            if (e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return; // dans le texte, Alt + flèche reste au texte
            e.preventDefault(); e.stopPropagation();
            if (e.key === 'ArrowLeft') goPrev(); else if (e.shiftKey) goNextView(); else goNextAct();
        };
        window.addEventListener('keydown', onKey, true);
        new MutationObserver((_, o) => { if (!dlg.isConnected) { window.removeEventListener('keydown', onKey, true); o.disconnect(); } }).observe(document.body, {childList: true});
        /** 📚 Registre et main : une petite fenêtre (vert = repris par « Acte suivant » et « Vue suivante ») */
        function editReg() {
            const T = t(), reg = {...(T.data.reg || {})};
            if (info?.kind === 'recueil') { if (!reg.register) reg.register = info.title; reg.view = reg.view || info.view; reg.total = reg.total || info.total; }
            const fixedView = info?.kind === 'recueil' || info?.kind === 'iiif';
            const row = (k, label, val, attrs = '') => `<label class="ais-f is-reg"><span>${esc(label)}</span><input data-ais-f="${k}" value="${esc(val ?? '')}" ${attrs}></label>`;
            const body = `<div class="ais-form">${row('register', i18n('Registre'), reg.register, 'maxlength="200" placeholder="BMS 1780-1792"')}${row('cote', i18n('Cote'), reg.cote, 'maxlength="80" placeholder="3 E 271/4"')}
                <label class="ais-f is-reg"><span>${esc(i18n('Vue'))}</span><span class="ais-view"><input data-ais-f="view" type="number" min="1" value="${esc(reg.view || '')}" ${fixedView ? 'readonly' : ''}> / <input data-ais-f="total" type="number" min="1" value="${esc(reg.total || '')}" ${fixedView ? 'readonly' : ''}></span></label>
                ${row('hand', i18n('Main'), reg.hand, `maxlength="120" list="ais-hands" placeholder="${esc(i18n('ex. Curé J. LACOMBE'))}"`)}<datalist id="ais-hands">${hands().map(h => `<option value="${esc(h)}">`).join('')}</datalist>
                ${row('archive', i18n('Archives'), reg.archive, 'maxlength="300"')}${(ext.txRegExtra || []).map(f => { try { return f(plug) || ''; } catch (_) { return ''; } }).join('')}
                <p class="muted ais-note">${esc(i18n('En vert : ce qui est repris par « Acte suivant » et « Vue suivante ». La main sert aussi à entraîner la lecture (🎓).'))}</p></div>`;
            ext.openDialog({eyebrow: i18n('ATELIER'), title: `📚 ${i18n('Registre et main')}`, body, submitLabel: i18n('Garder'),
                onOpen: dg => { dg.classList.add('ais-dlg'); (ext.txRegExtraBind || []).forEach(f => { try { f(dg, plug); } catch (_) {} }); setTimeout(() => dg.querySelector('[data-ais-f="hand"]')?.focus(), 30); },
                onSubmit: f => {
                    const was = JSON.stringify(T.data.reg || {}), oldSrc = sourceOf(T.data.reg || {}), next = {...(T.data.reg || {})};
                    f.querySelectorAll('[data-ais-f]').forEach(i => { const v = i.value.trim(), k = i.dataset.aisF; if (k === 'view' || k === 'total') { if (Number(v) > 0) next[k] = Number(v); else delete next[k]; } else if (v) next[k] = v; else delete next[k]; });
                    if (JSON.stringify(next) === was) return true;
                    T.data.reg = next; rememberHand(next.hand);
                    const src = $('[data-tx="source"]'); if (!src.value.trim() || src.value.trim() === oldSrc) { src.value = sourceOf(next); T.source = src.value; }
                    plug.touch(); paint();
                    A().undoToast?.(i18n('Registre et main gardés'), {icon: '📚', undo: () => { T.data.reg = JSON.parse(was); plug.touch(); paint(); }});
                    return true;
                }});
        }
        plug.suivant = {refresh, editReg, goNextAct, goNextView, goPrev, sourceOf};
        if (t().data.reg?.hand) rememberHand(t().data.reg.hand);
        refresh();
        // après le 1er enregistrement d'un nouvel acte : son numéro (◀ ▶ et « acte n » à jour)
        let lastId = t().id; const st = $('[data-tx-status]');
        if (st) new MutationObserver(() => { if (t().id !== lastId) { lastId = t().id; refresh(); } }).observe(st, {childList: true, subtree: true, characterData: true, attributes: true});
    }

    ext.txPlugins = ext.txPlugins || []; ext.txPlugins.push(init);
    ext.txMenus = ext.txMenus || [];
    ext.txMenus.push((menu, plug) => {
        if (menu === 'Édition' && plug.suivant) return [{icon: '📚', label: `${i18n('Registre et main')}…`, run: () => plug.suivant.editReg()}];
        if (menu === 'Fichier' && plug.reg?.register) return [{icon: '＋', label: i18n('Acte suivant'), shortcut: 'Alt+→', run: () => plug.suivant.goNextAct()}, {icon: '→', label: i18n('Vue suivante'), shortcut: 'Alt+⇧+→', disabled: !plug.reg.next_view, run: () => plug.suivant.goNextView()}];
        return [];
    });
})();
