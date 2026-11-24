/* LCNDA — 📇 Les tables et index d'un recueil (maquette docs/design/registres-etat-fonds.html, partie 9 « Tables et index »).
 * Une page se marque « 📇 Table ou index » (onglet 🗂 État, ou sur la page) ; son « 📊 Tableau de la page » (qui existe) se remplit une ligne
 * par entrée, avec une colonne de renvoi (« f° 12 », « p. 3 », « 12 »). Ici, dans l'onglet « 📑 Sommaire » : toutes les entrées des tables,
 * chacune avec un lien vers la page annoncée ; ce que la table annonce mais qui manque est signalé (page absente, page introuvable).
 *   ext.recueilIndex.mount(el, ctx)
 * Essai : tests/test-recueil-index.js.
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP;
    const T = (k, v) => (window.LCNDA_I18N?.t ? window.LCNDA_I18N.t(k, v) : String(k).replace(/\{(\w+)\}/g, (_, x) => v?.[x] ?? ''));
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const plural = (n, one, many) => (A()?.plural ? A().plural(n, one, many) : `${n} ${n > 1 ? many : one}`);
    const REF_COL = /\b(page|pages|p\.?|f°|fo|fol|folio|feuillet|renvoi|vue|n°|no)\b/i;

    /** la colonne de renvoi d'un tableau : son nom (« Page », « f° », « Renvoi »…), sinon la colonne où les cases ressemblent à des numéros de page */
    function refColumn(t) {
        const cols = t.cols || [];
        const byName = cols.find(c => REF_COL.test(String(c.name || '')));
        if (byName) return byName.id;
        let best = null, score = 0;
        cols.forEach(c => { const n = (t.rows || []).filter(r => /^\s*(f°?|fo|fol\.?|p\.?|page)?\s*\d{1,5}\s*(bis|r°?|v°?|recto|verso)?\s*$/i.test(String(r.c?.[c.id] || ''))).length; if (n > score) { score = n; best = c.id; } });
        return score ? best : null;
    }
    /** trouve la page d'un renvoi : par le nom des pages (f° 12 r°, p. 3), sinon par la place (12 = la 12ᵉ page) */
    function findPage(D, ref) {
        const E = ext.recueilEtat, x = E?.parseLabel ? E.parseLabel(String(ref).trim()) : null;
        if (!x) return null;
        const labeled = D.pages.map(p => ({p, y: p.label ? E.parseLabel(p.label) : null}));
        if (x.kind === 'folio') {
            const hit = labeled.find(({y}) => y && y.kind === 'folio' && y.n === x.n && (x.side === null || y.side === null || y.side === x.side));
            if (hit) return hit.p;
        }
        const hit = labeled.find(({y}) => y && y.n === x.n && (y.kind === x.kind || x.kind === 'page'));
        if (hit) return hit.p;
        return labeled.some(({y}) => y) ? null : D.pages.find(p => p.num === x.n) || null; // pas de nom de page : la place dans le recueil
    }
    function entries(D) {
        const out = [];
        D.pages.filter(p => p.page_kind === 'table').forEach(tp => {
            const t = tp.table; if (!t || !(t.rows || []).length) { out.push({tp, empty: true}); return; }
            const ref = refColumn(t), other = (t.cols || []).filter(c => c.id !== ref);
            t.rows.forEach(r => {
                const text = other.map(c => String(r.c?.[c.id] || '').trim()).filter(Boolean).join(' · '), rf = ref ? String(r.c?.[ref] || '').trim() : '';
                if (!text && !rf) return;
                const page = rf ? findPage(D, rf) : null;
                out.push({tp, text, ref: rf, page, state: !rf ? 'noref' : !page ? 'missing' : page.absent && page.absent !== 'blanche' ? 'absent' : 'ok'});
            });
        });
        return out;
    }
    const ui = new Map();
    function mount(el, ctx) {
        if (!el) return;
        const D = ctx.D(), tables = D.pages.filter(p => p.page_kind === 'table'), st = ui.get(D.recueil.id) || {q: '', only: ''}; ui.set(D.recueil.id, st);
        if (!tables.length) { el.innerHTML = `<h3>📇 ${esc(T('Tables et index'))}</h3><p class="muted">${esc(T('Une table décennale, un index en fin de registre ? Marque la page « 📇 Table ou index » (onglet 🗂 État ou sur la page), puis fais son « 📊 Tableau de la page » : une ligne par entrée, une colonne pour le renvoi (f° 12, p. 3). Elles arrivent ici, avec un lien vers chaque page annoncée.'))}</p>`; return; }
        const all = entries(D), list = all.filter(e => !e.empty);
        const n = {ok: list.filter(e => e.state === 'ok').length, absent: list.filter(e => e.state === 'absent').length, missing: list.filter(e => e.state === 'missing').length};
        const q = fold(st.q).trim();
        const shown = list.filter(e => (!q || fold(`${e.text} ${e.ref}`).includes(q)) && (!st.only || e.state === st.only));
        const badge = e => (e.state === 'ok' ? `<button type="button" class="link-button" data-ri-go="${e.page.id}">→ ${esc(e.page.label || T('p. {x}', {x: String(e.page.num)}))}</button>`
            : e.state === 'absent' ? `<button type="button" class="link-button ri-abs" data-ri-go="${e.page.id}">⛔ ${esc(T('{r} : page absente', {r: e.ref}))}</button>`
            : e.state === 'missing' ? `<span class="ri-miss">❔ ${esc(T('pas de page « {r} »', {r: e.ref}))}</span>` : `<span class="muted">${esc(T('sans renvoi'))}</span>`);
        el.innerHTML = `<h3>📇 ${esc(T('Tables et index'))} <small class="muted">· ${esc(plural(list.length, 'entrée', 'entrées'))} · ${esc(plural(tables.length, 'table', 'tables'))}</small></h3>
            <p class="ri-sum">${esc(T('{a} renvois trouvés · {b} vers des pages absentes · {c} introuvables', {a: String(n.ok), b: String(n.absent), c: String(n.missing)}))}</p>
            ${all.filter(e => e.empty).map(e => `<p class="re-msg">📇 ${esc(T('« {p} » est une table, mais son tableau est vide : ouvre la page → « 📊 Tableau de la page » (une ligne par entrée, une colonne pour le renvoi).', {p: e.tp.label || T('p. {x}', {x: String(e.tp.num)})}))} <button type="button" class="button small secondary" data-ri-go="${e.tp.id}">↗ ${esc(T('Ouvrir la page'))}</button></p>`).join('')}
            ${list.length ? `<div class="ri-tools"><input type="search" data-ri-q value="${esc(st.q)}" placeholder="${esc(T('Chercher dans les tables…'))}" aria-label="${esc(T('Chercher dans les tables'))}">
                <select data-ri-only aria-label="${esc(T('Montrer'))}">${[['', T('Toutes les entrées')], ['ok', T('Renvois trouvés')], ['absent', T('Vers des pages absentes')], ['missing', T('Introuvables')]].map(([k, l]) => `<option value="${k}" ${st.only === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
            <ul class="ri-list">${shown.slice(0, 500).map(e => `<li class="is-${e.state}"><span class="ri-t">${esc(e.text || '—')}</span>${badge(e)}<small class="muted">${esc(T('dans {p}', {p: e.tp.label || T('p. {x}', {x: String(e.tp.num)})}))}</small></li>`).join('')}</ul>
            ${shown.length > 500 ? `<p class="muted">${esc(T('… et {n} autres : affine la recherche.', {n: String(shown.length - 500)}))}</p>` : ''}` : ''}`;
        let timer = 0;
        el.querySelector('[data-ri-q]')?.addEventListener('input', e => { clearTimeout(timer); timer = setTimeout(() => { st.q = e.target.value; mount(el, ctx); const i = el.querySelector('[data-ri-q]'); i?.focus(); i?.setSelectionRange(i.value.length, i.value.length); }, 200); });
        el.querySelector('[data-ri-only]')?.addEventListener('change', e => { st.only = e.target.value; mount(el, ctx); });
        el.querySelectorAll('[data-ri-go]').forEach(b => b.addEventListener('click', () => ctx.openPage(Number(b.dataset.riGo))));
    }
    ext.recueilIndex = {mount, entries, refColumn, findPage};
})();
