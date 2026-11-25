/* LCNDA — 🧩 Branches isolées (« diagnostic de l'arbre » ; serveur : lib/branches_isolees.php ; style : assets/css/pistes-branches-celebres.css).
 * Dans Réglages → ✅ Contrôle de la base, un cadre au-dessus de la liste : les groupes de fiches qu'aucun lien de parenté ou
 * d'union ne relie à la personne de départ. Pour chacun : taille, noms principaux, d'où il vient (import, fusion, date de
 * création), « 👁 Voir ces fiches », « 🔗 Relier à… » (une fiche du groupe, une fiche de l'arbre, le lien : parent, enfant ou
 * conjoint ; ↶ Annuler), « C'est voulu » (retenu, ↶ ; « 🙈 écartés » pour les revoir). Réglage : « genealogie-branches-isolees ».
 * Pour d'autres fichiers : LCNDA_EXT.branchesIsolees. Essai : tests/test-branches-isolees.js
 */
(function (root) {
    'use strict';
    const T = (s, v) => { const w = v && Object.fromEntries(Object.entries(v).map(([k, x]) => [k, typeof x === 'number' ? String(x) : x]));
        return root.LCNDA_I18N ? root.LCNDA_I18N.t(s, w) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (w && w[k] != null ? w[k] : m)); };
    const A = () => root.LCNDA_APP || {};
    const ext = root.LCNDA_EXT = root.LCNDA_EXT || {};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const get = (a, q) => A().api(a, q);
    const post = (a, b) => A().api(a, {}, {method: 'POST', body: b}).then(r => (r && r.result !== undefined ? r.result : r));
    const fmt = n => Number(n || 0).toLocaleString('fr-FR');
    const KEY = 'genealogie-branches-isolees';
    const on = () => { try { return (JSON.parse(localStorage.getItem(KEY) || '{}') || {}).panel !== false; } catch (_) { return true; } };
    const frDate = d => (/^\d{4}-\d\d-\d\d/.test(d || '') ? new Date(d.slice(0, 10) + 'T12:00').toLocaleDateString('fr-FR', {day: 'numeric', month: 'long', year: 'numeric'}) : d || '');
    const nm = p => `${p.first_name || ''} ${String(p.last_name || '').toUpperCase()}`.trim() || T('Personne sans nom');
    const yrs = p => (p.birth_year || p.death_year ? `${p.birth_year || ''}–${p.death_year || ''}` : '');

    function originText(g) {
        const o = g.origin;
        if (o?.kind === 'import') return o.label ? T('venu de l’import « {l} » du {d}', {l: o.label, d: frDate(o.at)}) : T('venu d’un import (le {d})', {d: frDate(o.at)});
        if (o?.kind === 'merge') return T('peut-être venu d’une fusion d’arbre ({d} : {l})', {d: frDate(o.at), l: o.label});
        return g.created_from === g.created_to ? T('fiches créées le {d}', {d: frDate(g.created_from)}) : T('fiches créées entre le {a} et le {b}', {a: frDate(g.created_from), b: frDate(g.created_to)});
    }
    function groupHtml(g, ignored = false) {
        const names = g.names.map(n => `${esc(n.name)} (${fmt(n.n)})`).join(', ');
        const title = g.alone ? T('{n} fiches seules, reliées à personne', {n: fmt(g.size)}) : T('Groupe de {n} fiches', {n: fmt(g.size)});
        return `<article class="ctl-row is-yellow bis-row" data-bis-key="${esc(g.key)}"><div class="ctl-row-main"><h3>🧩 ${esc(title)}${names ? ` — <span class="bis-names">${esc(T('surtout'))} ${names}</span>` : ''}</h3>
            <p class="ctl-detail">${esc(originText(g))}${g.sample?.length ? ` · ${esc(T('par ex. {l}', {l: g.sample.slice(0, 3).map(p => p.name).join(', ')}))}` : ''}</p></div>
            <div class="ctl-row-acts"><button type="button" class="button small secondary" data-bis-see="${esc(g.key)}">${esc(T('👁 Voir ces fiches'))}</button>
            ${ignored ? `<button type="button" class="button small secondary" data-bis-again="${esc(g.key)}">${esc(T('↺ Signaler de nouveau'))}</button>`
            : `<button type="button" class="button small" data-bis-link="${esc(g.key)}">${esc(T('🔗 Relier à…'))}</button><button type="button" class="button small secondary" data-bis-ok="${esc(g.key)}" data-bis-size="${g.size}">${esc(T('C’est voulu'))}</button>`}</div></article>`;
    }
    let DATA = null;
    async function fill(box) {
        try { DATA = await get('isoles_list'); } catch (e) { box.innerHTML = ''; return; }
        if (!box.isConnected) return;
        const d = DATA;
        if (!d.groups.length && !d.ignored.length) { box.innerHTML = ''; box.hidden = true; return; }
        box.hidden = false;
        const lead = d.groups.length
            ? T('{n} fiches ne sont reliées à {r} par aucun lien de parenté ou d’union ({g} groupes).', {n: fmt(d.isolated), r: d.root?.name || T('la personne de départ'), g: fmt(d.groups.length)})
            : T('Aucune branche isolée : toutes les fiches sont reliées à {r}.', {r: d.root?.name || T('la personne de départ')});
        box.innerHTML = `<details class="maintenance-panel bis-panel" ${d.groups.length && d.groups.length <= 5 ? 'open' : ''}><summary><b>${esc(T('🧩 Branches isolées'))}</b> <span class="ctl-n">(${fmt(d.groups.length)})</span> — ${esc(lead)}</summary>
            <p class="muted"><small>${esc(T('Un groupe isolé vient souvent d’un import ou d’une fusion, ou d’un lien oublié. Relie-le à la bonne fiche, ou dis « C’est voulu » (témoins, homonymes gardés à part…).'))}</small></p>
            <div class="ctl-list">${d.groups.map(g => groupHtml(g)).join('')}</div>
            ${d.ignored.length ? `<details class="cplus-more"><summary>${esc(T('🙈 {n} groupes écartés (« C’est voulu »)', {n: d.ignored.length}))}</summary><div class="ctl-list">${d.ignored.map(g => groupHtml(g, true)).join('')}</div></details>` : ''}
            <p class="muted"><small>${esc(T('Calculé en {ms} ms sur {n} fiches.', {ms: d.ms, n: fmt(d.total)}))}</small></p></details>`;
    }
    const refresh = () => document.querySelectorAll('[data-bis-box]').forEach(b => fill(b));

    /* ═════════ 👁 Voir ces fiches / 🔗 Relier à… ═════════ */
    function dialog(title, body, foot = '') {
        const dlg = document.createElement('dialog'); dlg.className = 'modal bis-dialog';
        dlg.innerHTML = `<form method="dialog"><div class="modal-head"><div><span class="eyebrow">${esc(T('BRANCHES ISOLÉES'))}</span><h2>${esc(title)}</h2></div><button class="icon-button" value="cancel" aria-label="${esc(T('Fermer'))}">×</button></div>
            <div class="h-dialog-body">${body}</div><div class="modal-actions"><span class="spacer"></span>${foot}<button class="button secondary" value="cancel">${esc(T('Fermer'))}</button></div></form>`;
        document.body.appendChild(dlg); dlg.addEventListener('close', () => dlg.remove()); dlg.showModal?.();
        return dlg;
    }
    async function see(key) {
        let r; try { r = await get('isoles_group', {key}); } catch (e) { return A().toast?.(e.message, 'error'); }
        const rows = r.people.map(p => `<tr><td><b>${esc(nm(p))}</b></td><td>${esc(yrs(p))}</td><td>${p.links ? esc(T('{n} liens', {n: p.links})) : esc(T('aucun lien'))}</td><td><small>${esc(frDate(p.created_at))}</small></td><td><button type="button" class="button small secondary" data-bis-open="${p.id}">${esc(T('↗ Fiche'))}</button></td></tr>`).join('');
        const dlg = dialog(T('{n} fiches', {n: fmt(r.people.length)}), `<p class="muted">${esc(originText(r.group))}</p><div class="cplus-scroll"><table class="data-table"><thead><tr><th>${esc(T('Nom'))}</th><th>${esc(T('Années'))}</th><th>${esc(T('Liens'))}</th><th>${esc(T('Créée le'))}</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`,
            `<button type="button" class="button" data-bis-link="${esc(key)}">${esc(T('🔗 Relier à…'))}</button>`);
        dlg.addEventListener('click', e => { const b = e.target.closest('[data-bis-open]'); if (b) { e.preventDefault(); dlg.close(); A().openPersonById?.(Number(b.dataset.bisOpen)); } const l = e.target.closest('[data-bis-link]'); if (l) { e.preventDefault(); dlg.close(); linkTo(key); } });
    }
    const REL = [['parent', 'est le père ou la mère de'], ['child', 'est l’enfant de'], ['spouse', 'est le conjoint de']];
    async function linkTo(key) {
        let r; try { r = await get('isoles_group', {key}); } catch (e) { return A().toast?.(e.message, 'error'); }
        // 1. la fiche du groupe à relier (la plus ancienne génération d'abord)
        const opts = r.people.slice(0, 500).map(p => `<option value="${p.id}">${esc(nm(p))}${yrs(p) ? ` (${esc(yrs(p))})` : ''}</option>`).join('');
        const dlg = dialog(T('Relier ce groupe à l’arbre'), `<label class="bis-field">${esc(T('La fiche du groupe'))}<select name="who">${opts}</select></label>
            <label class="bis-field">${esc(T('Le lien'))}<select name="rel">${REL.map(([v, l]) => `<option value="${v}">${esc(T(l))}</option>`).join('')}</select></label>
            <p class="muted"><small>${esc(T('Ensuite, choisis la fiche de l’arbre. Exemple : « Pierre LACOMBE est l’enfant de Jean MAZAUD ».'))}</small></p>`,
            `<button type="submit" class="button" value="ok">${esc(T('Choisir la fiche de l’arbre…'))}</button>`);
        dlg.addEventListener('close', async () => {
            if (dlg.returnValue !== 'ok') return;
            const f = dlg.querySelector('form'); const who = Number(f.elements.who.value), rel = f.elements.rel.value;
            const P = root.LCNDA_PICKER || A();
            const it = await P.openPicker?.({kind: 'person', title: T('Relier à quelle fiche de l’arbre ?'), eyebrow: T('BRANCHES ISOLÉES')});
            if (!it?.id) return;
            // add_relation : person_id = la fiche du groupe ; « parent » = related_id est le parent de person_id
            const type = rel === 'parent' ? 'child' : rel === 'child' ? 'parent' : 'spouse';
            const body = {person_id: who, related_id: Number(it.id), relation_type: type};
            try {
                await post('add_relation', body);
                const label = `${nm(r.people.find(p => p.id === who) || {})} ${T(REL.find(x => x[0] === rel)[1])} ${it.title || it.name || ''}`.trim();
                A().undoToast?.(T('Lien ajouté : {l}', {l: label}), {icon: '🔗', undo: async () => { await post('remove_relation', body); refresh(); }});
                try { root.dispatchEvent(new CustomEvent('lcnda:data-changed')); } catch (_) {}
                refresh();
            } catch (e) { A().toast?.(e.message, 'error'); }
        });
    }
    async function setIgnored(key, onOff, size) {
        try {
            await post(onOff ? 'isoles_ignore' : 'isoles_unignore', {key, size});
            A().undoToast?.(onOff ? T('Groupe écarté : il ne sera plus signalé.') : T('Groupe signalé de nouveau.'), {undo: async () => { await post(onOff ? 'isoles_unignore' : 'isoles_ignore', {key, size}); refresh(); }});
            refresh();
        } catch (e) { A().toast?.(e.message, 'error'); }
    }
    document.addEventListener('click', e => {
        const b = e.target.closest?.('[data-bis-see], [data-bis-link], [data-bis-ok], [data-bis-again]'); if (!b || b.closest('dialog')) return;
        const d = b.dataset;
        if (d.bisSee) see(d.bisSee);
        else if (d.bisLink) linkTo(d.bisLink);
        else if (d.bisOk) setIgnored(d.bisOk, true, Number(d.bisSize) || 0);
        else if (d.bisAgain) setIgnored(d.bisAgain, false, 0);
    });

    /* ═════════ dans le Contrôle de la base : le cadre au-dessus de la liste ═════════ */
    function decorate() {
        if (!on()) return;
        const page = document.querySelector('#workspace .ctl-page');
        if (!page || page.querySelector('[data-bis-box]')) return;
        const anchor = page.querySelector('[data-ctl-bar]'); if (!anchor) return;
        anchor.insertAdjacentHTML('beforebegin', '<div class="bis-box" data-bis-box hidden></div>');
        fill(page.querySelector('[data-bis-box]'));
    }
    let pending = 0;
    new MutationObserver(() => { if (pending) return; pending = requestAnimationFrame(() => { pending = 0; try { decorate(); } catch (e) { console.error(e); } }); }).observe(document.documentElement, {childList: true, subtree: true});

    /* Réglages (page commune, heritage-pistes-auto.js) */
    ext.pistesSettings = ext.pistesSettings || [];
    ext.pistesSettings.push({id: 'isoles', title: T('🧩 Branches isolées'), key: KEY, items: [['panel', T('Dans le Contrôle de la base : les groupes de fiches détachés du reste de l’arbre')]]});
    ext.branchesIsolees = {refresh, fill, linkTo, see, data: () => DATA};
})(typeof window !== 'undefined' ? window : globalThis);
