/* LCNDA — 📜 Atelier de transcription, idée 38 : 🔤 deux couches de texte, fidèle et modernisée (maquette approuvée
 * docs/design/atelier-idees.html ; réponse 2 : « Ajouter à la généalogie » lit le modernisé s'il existe, la citation garde le fidèle).
 * Le texte FIDÈLE (ſ, 9bre, abréviations) reste le texte de l'acte et la référence : rien ne le change ici. La version MODERNISÉE
 * (orthographe actuelle, abréviations développées, noms en capitales) est une aide, gardée avec l'acte (data.modern) :
 *   📖 Développer les abréviations (sans IA : la liste de l'Aide à la lecture) · 🤖 Proposer (l'IA de cet ordinateur, comme la
 *   lecture approfondie) — toujours une proposition à relire (« ✓ relue »).
 * Un petit sélecteur au-dessus du texte, seulement quand une version modernisée existe (ou après Outils → 🔤 Texte modernisé) :
 *   📜 Fidèle · 🔤 Modernisée · ◫ Côte à côte (ligne pour ligne ; une ligne fidèle changée ensuite : « à revoir »).
 * La recherche (🔎 36) regarde les deux ; l'export et la citation gardent le fidèle. Essai : tests/test-atelier-idees.js.
 */
(() => {
    'use strict';
    const i18n = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s).replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const post = b => A().api('atelier_idees_write', {}, {method: 'POST', body: b}).then(r => r?.result || r);
    /** l'empreinte d'une ligne, comme 👁 la relecture (FNV-1a, base 36) */
    const lineKey = s => { let h = 0x811c9dc5; for (const ch of String(s).replace(/\s+/g, ' ').trim()) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(36); };
    const fold = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ſ/g, 's').toLowerCase();
    const keysOf = text => String(text).split('\n').map(l => (l.trim() ? lineKey(l) : ''));

    /** 📖 sans IA : les abréviations connues développées (« 9bre » → « novembre », « lab. » → « laboureur »), ſ → s ; une ligne = une ligne */
    function expand(text, lang = '') {
        const AL = window.LCNDA_AIDE_LECTURE;
        return String(text).split('\n').map(line => {
            let out = line.replace(/ſ/g, 's');
            const found = AL?.abbrevs ? AL.abbrevs(out, lang) : [];
            for (const a of [...found].sort((x, y) => y.s - x.s)) {
                const forms = String(a.item.t).split(/\s*,\s*/).map(f => fold(f.replace(/\.+$/, ''))), means = String(a.item.d).split(/\s*[,;]\s*|\s+\(/).map(x => x.trim()).filter(Boolean);
                if (!means.length) continue;
                const i = Math.max(0, forms.indexOf(fold(a.word.replace(/\.+$/, '')))), m = forms.length === means.length || (forms.length > 1 && means.length > 1) ? means[Math.min(i, means.length - 1)] : means[0];
                if (!m || m.length > 40 || /[«»"=]/.test(m)) continue;
                out = out.slice(0, a.s) + m + out.slice(a.e);
            }
            return out;
        }).join('\n');
    }
    /** les lignes modernisées « à revoir » : la ligne fidèle a changé depuis */
    const toReview = (faithful, modern) => { const k = keysOf(faithful), was = modern?.keys || []; return k.map((x, i) => !!(was[i] && x && was[i] !== x)); };
    ext.txCouches = {expand, toReview, lineKey, keysOf}; // pour les essais

    const plugs = new Set();
    function init(plug) {
        const {dlg, area, $} = plug, editor = $('[data-tx-editor]'); if (!editor) return;
        plugs.add(plug);
        const box = document.createElement('div'); box.className = 'aic'; box.dataset.aic = '';
        box.innerHTML = `<div class="aic-switch ui-seg" role="tablist" aria-label="${esc(i18n('Texte fidèle ou modernisé'))}">${[['f', '📜', 'Fidèle'], ['m', '🔤', 'Modernisée'], ['s', '◫', 'Côte à côte']].map(([k, ic, l]) => `<button type="button" role="tab" data-aic-mode="${k}" aria-selected="false">${ic} ${esc(i18n(l))}</button>`).join('')}</div><div class="aic-pane" data-aic-pane hidden></div>`;
        editor.before(box);
        const pane = box.querySelector('[data-aic-pane]');
        let mode = 'f', shown = !!plug.t.data.modern?.text;
        const M = () => plug.t.data.modern || null;
        const lang = () => window.LCNDA_AIDE_LECTURE?.langForOcr?.($('[data-tx-lang]')?.value || '') || '';
        function setModern(text, from, model = '') {
            const was = M() ? {...M()} : null;
            plug.t.data.modern = {text: String(text), from, keys: keysOf(area.value), ...(model ? {model} : {})}; plug.touch(); paint();
            A().undoToast?.(from === 'ai' ? i18n('Version modernisée proposée par l’IA : relis-la') : i18n('Abréviations développées : relis la version modernisée'), {icon: '🔤', undo: () => { if (was) plug.t.data.modern = was; else delete plug.t.data.modern; plug.touch(); paint(); }});
        }
        function paint() {
            const m = M(); shown = shown || !!m?.text; box.hidden = !shown; dlg.dataset.aicMode = shown ? mode : '';
            box.querySelectorAll('[data-aic-mode]').forEach(b => { const on = b.dataset.aicMode === mode; b.classList.toggle('is-active', on); b.setAttribute('aria-selected', String(on)); });
            pane.hidden = mode === 'f';
            if (mode === 'f') { pane.innerHTML = ''; return; }
            const rev = m ? toReview(area.value, m) : [], nRev = rev.filter(Boolean).length;
            const badge = m ? `<span class="aic-from">${m.from === 'ai' ? `🤖 ${esc(i18n('proposée'))}` : m.from === 'auto' ? `📖 ${esc(i18n('abréviations développées'))}` : `✎ ${esc(i18n('écrite à la main'))}`}${m.checked ? ` · ✓ ${esc(i18n('relue'))}` : ''}</span>` : '';
            const tools = `<div class="aic-tools"><button type="button" class="button small secondary" data-aic-do="expand" title="${esc(i18n('Sans IA : les abréviations connues de l’Aide à la lecture (9bre → novembre, lab. → laboureur) et ſ → s'))}">📖 ${esc(i18n('Développer les abréviations'))}</button><button type="button" class="button small secondary" data-aic-do="ai" title="${esc(i18n('L’IA de cet ordinateur (comme la lecture approfondie) : orthographe actuelle, abréviations développées, noms en capitales ; ligne pour ligne'))}">🤖 ${esc(i18n('Proposer la version modernisée'))}</button>${m ? `<label class="ui-toggle aic-checked"><input type="checkbox" data-aic-checked ${m.checked ? 'checked' : ''}><i></i>${esc(i18n('relue'))}</label><button type="button" class="link-button aic-rm" data-aic-do="rm">${esc(i18n('Retirer'))}</button>` : ''}</div>`;
            if (mode === 'm') {
                pane.innerHTML = `<div class="aic-head"><b>🔤 ${esc(i18n('Modernisée'))}</b> ${badge}${nRev ? ` <span class="aic-rev">${esc(i18n('{n} à revoir', {n: nRev}))}</span>` : ''}</div>
                    <textarea class="aic-ta" data-aic-ta spellcheck="false" placeholder="${esc(i18n('La version modernisée, ligne pour ligne : écris-la, ou fais-la proposer ci-dessous. Le texte fidèle ne change pas.'))}"></textarea>${tools}`;
                pane.querySelector('[data-aic-ta]').value = m?.text || '';
            } else {
                const F = area.value.split('\n'), Mo = (m?.text || '').split('\n');
                pane.innerHTML = `<div class="aic-head"><b>◫ ${esc(i18n('Côte à côte'))}</b> ${badge}${nRev ? ` <span class="aic-rev">${esc(i18n('{n} à revoir', {n: nRev}))}</span>` : ''}</div>
                    <div class="aic-grid" role="table"><div class="aic-gh" role="row"><span role="columnheader">📜 ${esc(i18n('Fidèle'))} <small>${esc(i18n('référence'))}</small></span><span role="columnheader">🔤 ${esc(i18n('Modernisée'))}</span></div>
                    ${F.map((l, i) => (l.trim() || (Mo[i] || '').trim() ? `<div class="aic-row${rev[i] ? ' is-rev' : ''}" role="row"><span class="aic-f" role="cell" data-i18n-off>${esc(l)}</span><span role="cell" class="aic-mcell"><input data-aic-line="${i}" value="${esc(Mo[i] || '')}" spellcheck="false" aria-label="${esc(i18n('Ligne {n} modernisée', {n: i + 1}))}">${rev[i] ? `<small class="aic-revtag">${esc(i18n('à revoir'))}</small>` : ''}</span></div>` : '')).join('')}</div>${tools}`;
            }
        }
        const write = text => { const m = M(); plug.t.data.modern = {...(m || {from: 'hand', keys: keysOf(area.value)}), text}; if (!m) plug.t.data.modern.from = 'hand'; plug.touch(); };
        pane.addEventListener('input', e => {
            if (e.target.matches('[data-aic-ta]')) { write(e.target.value); return; }
            const li = e.target.closest('[data-aic-line]'); if (li) {
                const i = Number(li.dataset.aicLine), lines = (M()?.text || '').split('\n'), F = area.value.split('\n');
                while (lines.length < F.length) lines.push(''); lines[i] = li.value; write(lines.join('\n'));
                const k = M().keys || []; k[i] = F[i]?.trim() ? lineKey(F[i]) : ''; M().keys = k; // corrigée : plus « à revoir »
                li.closest('.aic-row')?.classList.remove('is-rev'); li.parentElement.querySelector('.aic-revtag')?.remove();
            }
        });
        pane.addEventListener('change', e => { if (e.target.matches('[data-aic-checked]') && M()) { M().checked = e.target.checked; if (e.target.checked) M().keys = keysOf(area.value); plug.touch(); paint(); } });
        pane.addEventListener('click', async e => {
            const b = e.target.closest('[data-aic-do]'); if (!b) return;
            if (!area.value.trim()) return A().toast(i18n('Le texte est vide : lis ou écris d’abord l’acte.'), 'error');
            if (b.dataset.aicDo === 'expand') return setModern(expand(area.value, lang()), 'auto');
            if (b.dataset.aicDo === 'rm') { const was = M(); delete plug.t.data.modern; plug.touch(); mode = 'f'; paint(); A().undoToast?.(i18n('Version modernisée retirée'), {icon: '🔤', undo: () => { plug.t.data.modern = was; mode = 'm'; plug.touch(); paint(); }}); return; }
            b.disabled = true; const old = b.innerHTML; b.innerHTML = `${window.LCNDA_UI?.spinner ? window.LCNDA_UI.spinner('', {inline: true}) : '…'} ${esc(i18n('L’IA modernise le texte…'))}`;
            try { const r = await post({op: 'modern_ai', text: area.value, lang: $('[data-tx-lang]')?.value || 'fra'}); setModern(r.text, 'ai', r.model); }
            catch (err) { A().toast(err.message, 'error'); if (b.isConnected) { b.disabled = false; b.innerHTML = old; } }
        });
        box.addEventListener('click', e => { const b = e.target.closest('[data-aic-mode]'); if (b) { mode = b.dataset.aicMode; paint(); } });
        area.addEventListener('input', () => { if (mode === 's') { clearTimeout(area._aicT); area._aicT = setTimeout(paint, 400); } });
        plug.couches = {show: (m = 'm') => { shown = true; mode = m; paint(); }, paint, mode: () => mode, setModern};
        paint();
        new MutationObserver((_, o) => { if (!dlg.isConnected) { plugs.delete(plug); o.disconnect(); } }).observe(document.body, {childList: true});
    }

    /* ─── « Ajouter à la généalogie » : le modernisé s'il existe (même nombre de lignes), la citation garde le fidèle ─── */
    /** une position du texte modernisé → la même personne dans la même ligne du texte fidèle (sinon toute la ligne) */
    function mapBack(faithful, modern, s, e, name = '') {
        const F = faithful.split('\n'), Mo = modern.split('\n'); let at = 0, i = 0;
        for (; i < Mo.length; i++) { if (s <= at + Mo[i].length) break; at += Mo[i].length + 1; }
        let fs = 0; for (let k = 0; k < i && k < F.length; k++) fs += F[k].length + 1;
        const line = F[i] ?? '', fl = fold(line);
        for (const w of [name, ...String(name).split(/\s+/).reverse()].filter(x => x && x.length > 2)) { const p = fl.indexOf(fold(w)); if (p >= 0) return {s: fs + p, e: fs + p + w.length}; }
        const lead = line.length - line.trimStart().length; return {s: fs + lead, e: fs + line.trimEnd().length};
    }
    ext.txCouches.mapBack = mapBack;
    function wrapFound() {
        const X = ext.txActe; if (!X?.openFound || X.openFound._aic) return;
        const orig = X.openFound;
        const w = function (o = {}) {
            const p = [...plugs].find(q => q.dlg.isConnected && (!o.transcriptionId || q.t.id === o.transcriptionId));
            const mod = p?.t.data.modern?.text;
            if (mod && typeof o.text === 'string' && o.text.split('\n').length === mod.split('\n').length) {
                const faithful = o.text, back = list => (list || []).map(q => (q && q.s >= 0 && q.e > q.s ? {...q, ...mapBack(faithful, mod, q.s, q.e, q.name)} : q));
                const onApplied = o.onApplied, onKeepOnly = o.onKeepOnly;
                o = {...o, text: mod, citeText: faithful, modernUsed: true,
                    onApplied: r => onApplied?.({...r, people: back(r.people)}), onKeepOnly: list => onKeepOnly?.(back(list))};
                A().toast(i18n('🔤 Repéré dans la version modernisée ; la citation de la source garde le texte fidèle.'));
            }
            return orig.call(this, o);
        };
        w._aic = true; X.openFound = w;
    }

    ext.txPlugins = ext.txPlugins || [];
    ext.txPlugins.push(plug => { init(plug); wrapFound(); });
    ext.txMenus = ext.txMenus || [];
    ext.txMenus.push((menu, plug) => (menu === 'Outils' && plug.couches ? [{icon: '🔤', label: `${i18n('Texte modernisé')}…`, run: () => plug.couches.show(plug.t.data.modern?.text ? 's' : 'm')}] : []));
})();
