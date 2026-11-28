/* LCNDA — 🤝 Son réseau : les relations hors famille enregistrées pour elles-mêmes (idée de Family Historian 8 ; le « réseau »
 * ou « FAN club » des généalogistes : amis, associés, voisins). Serveur : lib/relations_reseau.php (table person_relations).
 * Où on le voit :
 *  - la fiche : bloc « 🤝 Son réseau » (ami, voisin, associé, collègue, maître / domestique, employeur / employé, tuteur, parrain
 *    hors acte, nourrice, compagnon d'armes, liens affectifs…), avec dates, lieu, note, source ↗ ; l'autre fiche le montre à
 *    l'envers toute seule ; ＋ Ajouter, ✎ Changer, 🗑 Retirer (↶ Annuler) ;
 *  - Listes → 🧰 Données : « 🤝 Relations hors famille » (LCNDA_EXT.dataLists) ;
 *  - Graphiques → Réseau social (api.php graph_network_data) : les relations y sont ajoutées ;
 *  - Graphiques → Génogramme : les liens affectifs (très proches, conflit, distance, rupture, amitié) tracés entre les cases ;
 *  - 🔎 Ce qui le concerne / 🧰 Données (LCNDA_EXT.dataSources, id « reseau_personne ») ;
 *  - Réglages → « 🤝 Son réseau » : allumer / éteindre chaque partie (genealogie-reseau, gardé dans la base).
 * GEDCOM : ASSO + RELA (5.5.1), ASSO + ROLE / PHRASE (7) — lib/gedcom.php. Essai : tests/test-relations-reseau.js
 */
(() => {
    'use strict';
    const W = window;
    const A = () => W.LCNDA_APP || {};
    const UI = () => W.LCNDA_UI || {};
    const ext = W.LCNDA_EXT = W.LCNDA_EXT || {};
    const T = (s, v) => (W.LCNDA_I18N ? W.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? String(v[k]) : m)));
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const api = (a, q = {}) => A().api(a, q);
    const post = async (a, body) => { const r = await A().api(a, {}, {method: 'POST', body}); return r?.result || r; };
    const toast = (m, k) => A().toast?.(m, k);
    const P = () => W.LCNDA_PICKER || A();

    /* ═════════════ réglages (dans la base : le serveur s'en sert pour le diagramme) ═════════════ */
    const PARTS = [
        ['fiche', '👤 Le bloc « 🤝 Son réseau » sur la fiche', 'Les amis, voisins, associés, maîtres, tuteurs… de la personne, avec dates, lieu et source.'],
        ['listes', '📋 La liste dans Listes → 🧰 Données', 'Toutes les relations hors famille, à trier, filtrer, exporter.'],
        ['diagramme', '🕸 Dans le diagramme « Réseau social »', 'Les relations ajoutées aux témoins, parrains et voisins de recensement.'],
        ['genogramme', '💞 Les liens affectifs sur le génogramme', 'Très proches, en conflit, éloignés, brouillés, amis : un trait entre les deux cases.']];
    let SET = null, TYPES = null;
    async function loadSettings(force = false) {
        if (SET && !force) return SET;
        try { const r = await api('reseau_settings'); SET = r.settings; TYPES = r.types; } catch (_) { SET = SET || {fiche: true, listes: true, diagramme: true, genogramme: true}; }
        return SET;
    }
    const on = k => !SET || SET[k] !== false;

    /* ═════════════ le bloc de la fiche ═════════════ */
    const yearsOf = p => p && (p.by || p.dy) ? ` <small class="muted">${esc(`${p.by || ''}–${p.dy || ''}`)}</small>` : '';
    const datesOf = r => r.date_from && r.date_to ? T('de {a} à {b}', {a: r.date_from, b: r.date_to}) : r.date_from ? T('depuis {a}', {a: r.date_from}) : r.date_to ? T('jusqu’à {b}', {b: r.date_to}) : '';
    function rowHtml(r) {
        const who = r.other ? `<button type="button" class="link-button" data-open-person="${Number(r.other.id)}">${esc(r.other.name)}</button>${yearsOf(r.other)}` : `<span>${esc(r.other_name)}</span> <small class="muted">${esc(T('(sans fiche)'))}</small>`;
        const bits = [datesOf(r), r.place ? T('à {p}', {p: r.place.name}) : ''].filter(Boolean).join(' · ');
        const src = (r.sources || []).map(s => s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer" title="${esc(s.title)}">${esc(T('↗ source'))}</a>` : `<small class="muted" title="${esc(s.page)}">📚 ${esc(s.title)}</small>`).join(' ');
        return `<li class="rs-row" data-rs-id="${r.id}"><span class="rs-ico" aria-hidden="true">${esc(r.icon)}</span><div class="rs-main"><div><b class="rs-role">${esc(r.label)}</b> : ${who}${bits ? ` <small class="muted">· ${esc(bits)}</small>` : ''} ${src}</div>
            ${r.note ? `<details class="rs-note"><summary>${esc(T('▸ plus'))}</summary><p>${esc(r.note)}</p>${(r.sources || []).map(s => `<p class="muted">📚 ${esc(s.title)}${s.page ? ` — ${esc(s.page)}` : ''}</p>`).join('')}</details>` : ''}</div>
            <span class="rs-acts"><button type="button" class="icon-button" data-rs-edit="${r.id}" title="${esc(T('Changer'))}" aria-label="${esc(T('Changer'))}">✎</button><button type="button" class="icon-button" data-rs-del="${r.id}" title="${esc(T('Retirer'))}" aria-label="${esc(T('Retirer'))}">🗑</button></span></li>`;
    }
    const CACHE = new Map();
    async function blockHtml(pid) {
        const d = await api('reseau_person', {id: pid}); CACHE.set(pid, d); TYPES = d.types || TYPES; SET = d.settings || SET;
        const list = d.relations || [];
        if (!list.length) return `<p class="muted rs-empty">${esc(T('Amis, voisins, associés, maîtres, tuteurs… : les gens autour de lui ou d’elle, hors famille.'))}</p>`;
        const groups = {}; list.forEach(r => (groups[r.group] = groups[r.group] || []).push(r));
        return Object.entries(groups).map(([g, rows]) => `<h4 class="rs-group">${esc(T(g))}</h4><ul class="rs-list">${rows.map(rowHtml).join('')}</ul>`).join('');
    }
    async function fill(host) {
        const pid = Number(host.dataset.rsPerson);
        try { host.innerHTML = await blockHtml(pid); } catch (e) { host.innerHTML = `<p class="muted">${esc(e.message)}</p>`; }
        const n = (CACHE.get(pid)?.relations || []).length;
        const card = host.closest('[data-pblock]') || host.closest('section.card');
        const count = card?.querySelector('.card-title h3 small'); if (count) count.textContent = n ? `(${n})` : '';
        host.dataset.rsReady = '1';
    }
    ext.personBlocks = ext.personBlocks || {};
    ext.personBlocks.reseau = (index, detail) => {
        const p = detail?.person; if (!p?.id || p.kind === 'animal' || !on('fiche')) return '';
        return A().card(index, T('🤝 Son réseau'), '', `<div class="rs-block" data-rs-person="${Number(p.id)}"></div>`, 'span-12', `<button type="button" class="button small secondary" data-rs-add="${Number(p.id)}">${esc(T('＋ Ajouter une relation'))}</button>`);
    };
    (ext.afterPerson = ext.afterPerson || []).push(() => { document.querySelectorAll('#workspace [data-rs-person]:not([data-rs-done])').forEach(h => { h.dataset.rsDone = '1'; fill(h); }); });
    const refresh = pid => document.querySelectorAll('#workspace [data-rs-person]').forEach(h => { if (!pid || Number(h.dataset.rsPerson) === Number(pid) || h.querySelector(`[data-open-person="${Number(pid)}"]`)) fill(h); });

    /* ═════════════ la fenêtre « Ajouter / changer une relation » ═════════════ */
    function typeOptions(sel, gender) {
        const groups = {}; (TYPES || []).forEach(t => (groups[t.group] = groups[t.group] || []).push(t));
        return Object.entries(groups).map(([g, ts]) => `<optgroup label="${esc(T(g))}">${ts.map(t => `<option value="${esc(t.key)}"${t.key === sel ? ' selected' : ''}>${esc(t.icon)} ${esc(T(gender === 'female' ? t.f : gender === 'male' ? t.m : t.label))}</option>`).join('')}</optgroup>`).join('');
    }
    async function openForm(pid, rel = null) {
        await loadSettings();
        if (!TYPES) { try { TYPES = (await api('reseau_settings')).types; } catch (_) { TYPES = []; } }
        const me = CACHE.get(pid)?.person || {name: ''};
        // toujours vue depuis cette fiche : « l'autre était son … » (une relation rangée depuis l'autre fiche est enregistrée dans ce sens-ci)
        const base = rel ? {other: rel.other ? rel.other.id : `txt:${rel.other_name}`, type: rel.type, label: rel.rel_label, from: rel.date_from, to: rel.date_to, place: rel.place?.id || null, note: rel.note, source: rel.sources?.[0]?.id || null, page: rel.sources?.[0]?.page || ''}
            : {other: null, type: 'ami', label: '', from: '', to: '', place: null, note: '', source: null, page: ''};
        const who = me.name;
        const dlg = document.createElement('dialog'); dlg.className = 'modal rs-modal';
        dlg.innerHTML = `<form method="dialog" class="rs-form"><div class="modal-head"><div><span class="eyebrow">${esc(T('SON RÉSEAU'))}</span><h2>${esc(rel ? T('Changer la relation') : T('Ajouter une relation'))}</h2></div><button class="icon-button" value="cancel" aria-label="${esc(T('Fermer'))}">×</button></div>
            <div class="h-dialog-body form-grid">
            <div class="span-2"><span class="pk-lab">${esc(T('Avec qui ? (une fiche, ou un nom sans fiche)'))}</span>${P().pickerField({name: 'other', kind: 'person', allowFree: true, value: base.other})}</div>
            <label class="span-2">${esc(who ? T('Ce que cette personne était pour {name}', {name: who}) : T('Ce que cette personne était pour elle'))}<select name="rel_type">${typeOptions(base.type)}</select></label>
            <label class="span-2" data-rs-free ${base.type === 'autre' ? '' : 'hidden'}>${esc(T('Le mot exact (ex. colocataire, compagnon de voyage)'))}<input name="rel_label" maxlength="80" value="${esc(base.label)}"></label>
            <label>${esc(T('Depuis'))}<input name="date_from" maxlength="60" placeholder="${esc(T('ex. 1852, vers 1850'))}" value="${esc(base.from)}"></label>
            <label>${esc(T('Jusqu’à'))}<input name="date_to" maxlength="60" placeholder="${esc(T('ex. 1860'))}" value="${esc(base.to)}"></label>
            <div class="span-2"><span class="pk-lab">${esc(T('Lieu'))}</span>${P().pickerField({name: 'place_id', kind: 'place', value: base.place})}</div>
            <label class="span-2">${esc(T('Note'))}<textarea name="note" rows="3" maxlength="4000">${esc(base.note)}</textarea></label>
            <div class="span-2"><span class="pk-lab">${esc(T('Source'))}</span>${P().pickerField({name: 'source_id', kind: 'source', value: base.source})}</div>
            <label class="span-2">${esc(T('Page, cote ou précision de la source'))}<input name="source_page" maxlength="400" value="${esc(base.page)}"></label>
            <p class="span-2 muted">${esc(T('La relation s’affiche aussi, à l’envers, sur la fiche de l’autre personne (« employeur » ↔ « employé »).'))}</p></div>
            <div class="modal-actions"><span class="spacer"></span><button class="button secondary" value="cancel">${esc(T('Annuler'))}</button><button class="button" value="ok">${esc(T('Enregistrer'))}</button></div></form>`;
        document.body.appendChild(dlg);
        const f = dlg.querySelector('form');
        f.elements.rel_type.addEventListener('change', () => { dlg.querySelector('[data-rs-free]').hidden = f.elements.rel_type.value !== 'autre'; });
        dlg.addEventListener('close', async () => {
            const ok = dlg.returnValue === 'ok';
            const val = name => f.querySelector(`.pk input[type=hidden][name="${name}"]`)?.value || '';
            const body = {id: rel?.id || 0, rel_type: f.elements.rel_type.value, rel_label: f.elements.rel_label.value, date_from: f.elements.date_from.value, date_to: f.elements.date_to.value,
                place_id: val('place_id'), note: f.elements.note.value, source_id: val('source_id'), source_page: f.elements.source_page.value};
            const other = val('other');
            body.person_id = pid;
            if (/^\d+$/.test(other)) body.other_id = Number(other); else body.other_name = other.replace(/^txt:/, '');
            dlg.remove();
            if (!ok) return;
            try {
                const r = await post('reseau_save', body);
                const undo = r.before ? async () => { await post('reseau_restore', {row: r.before}); refresh(); } : async () => { await post('reseau_delete', {id: r.id}); refresh(); };
                A().undoToast?.(rel ? T('Relation changée') : T('Relation ajoutée'), {icon: '🤝', undo, redo: async () => { await post('reseau_save', {...body, id: r.id}); refresh(); }});
                refresh();
            } catch (e) { toast(e.message, 'error'); }
        });
        dlg.showModal();
    }
    async function removeRel(pid, id) {
        try {
            const r = await post('reseau_delete', {id});
            A().undoToast?.(T('Relation retirée'), {icon: '🗑', undo: async () => { await post('reseau_restore', {row: r.row}); refresh(); }, redo: async () => { await post('reseau_delete', {id}); refresh(); }});
            refresh();
        } catch (e) { toast(e.message, 'error'); }
    }
    document.addEventListener('click', e => {
        const b = e.target.closest?.('[data-rs-add], [data-rs-edit], [data-rs-del]'); if (!b) return;
        e.preventDefault(); e.stopPropagation();
        const host = b.closest('[data-pblock], section.card')?.querySelector('[data-rs-person]') || b.closest('[data-rs-person]');
        const pid = Number(b.dataset.rsAdd || host?.dataset.rsPerson || A().state?.currentPersonId);
        if (b.dataset.rsAdd !== undefined) return openForm(pid);
        const rel = (CACHE.get(pid)?.relations || []).find(x => x.id === Number(b.dataset.rsEdit || b.dataset.rsDel));
        if (!rel) return;
        if (b.dataset.rsEdit !== undefined) return openForm(pid, rel);
        return removeRel(pid, rel.id);
    }, true);

    /* ═════════════ Listes → 🧰 Données ═════════════ */
    (ext.dataLists = ext.dataLists || []).push({id: 'reseau', icon: '🤝', label: T('Relations hors famille (son réseau)'), group: 'La personne', source: T('Ta généalogie (fiches et sources reliées)'), sourceUrl: '',
        enabled: () => on('listes'),
        load: async () => (await api('reseau_list')).rows.map(r => ({...r, url: r.source_url})),
        fields: [{key: 'person', label: T('Personne'), type: 'text'}, {key: 'role', label: T('L’autre est son…'), type: 'enum'}, {key: 'other', label: T('Avec'), type: 'text'}, {key: 'role_back', label: T('Et elle est son…'), type: 'enum'},
            {key: 'group', label: T('Sorte'), type: 'enum'}, {key: 'date_from', label: T('Depuis'), type: 'text'}, {key: 'date_to', label: T('Jusqu’à'), type: 'text'}, {key: 'year_from', label: T('Année'), type: 'year'},
            {key: 'place', label: T('Lieu'), type: 'place'}, {key: 'note', label: T('Note'), type: 'text'}, {key: 'source', label: T('Source'), type: 'text'}, {key: 'url', label: T('↗ source'), type: 'url'}],
        period: r => [r.year_from, r.year_to], geo: r => (r.lat != null ? [r.lat, r.lon] : null), open: r => A().openPersonById?.(r.person_id)});

    /* ═════════════ 🔎 Ce qui le concerne / 🧰 Données ═════════════ */
    (ext.dataSources = ext.dataSources || []).push({id: 'reseau_personne', icon: '🤝', label: T('Son réseau (hors famille)'), group: 'La personne', needs: ['person'], enabled: () => on('fiche'),
        run: async (ctx, host) => { const pid = Number(ctx?.person?.id || ctx?.id); if (!pid) return false; const d = await api('reseau_person', {id: pid}); if (!(d.relations || []).length) { host.innerHTML = ''; return false; } CACHE.set(pid, d); host.innerHTML = `<div class="rs-block">${await blockHtml(pid)}</div>`; return true; }});

    /* ═════════════ 💞 Génogramme : les liens affectifs entre les cases ═════════════ */
    const AFFECT = {proche: ['#2e7d32', '', 3], ami: ['#2e7d32', '6 4', 2], conflit: ['#c62828', 'zig', 2], distance: ['#757575', '2 6', 2], rupture: ['#6d4c41', 'cut', 2]};
    async function decorateGenogram(stage) {
        await loadSettings();
        if (!on('genogramme') || stage.dataset.rsGeno) return;
        stage.dataset.rsGeno = '1';
        const cards = [...stage.querySelectorAll('[data-tree-person]')];
        const ids = [...new Set(cards.map(c => Number(c.dataset.treePerson)))];
        if (ids.length < 2) return;
        let d; try { d = await api('reseau_among', {ids: ids.join(',')}); } catch (_) { return; }
        const links = (d.links || []).filter(l => AFFECT[l.type]); if (!links.length) return;
        const pos = id => { const c = cards.find(x => Number(x.dataset.treePerson) === id); if (!c) return null; return {x: parseFloat(c.style.left), y: parseFloat(c.style.top)}; };
        const svg = stage.querySelector('svg'); if (!svg) return;
        const NS = 'http://www.w3.org/2000/svg';
        const g = document.createElementNS(NS, 'g'); g.setAttribute('class', 'rs-affect');
        links.forEach(l => {
            const a = pos(l.a), b = pos(l.b); if (!a || !b) return;
            const [color, dash, w] = AFFECT[l.type];
            const p = document.createElementNS(NS, 'path');
            let dpath = `M${a.x} ${a.y + 28} L${b.x} ${b.y + 28}`;
            if (dash === 'zig') { const n = 14, pts = []; for (let i = 0; i <= n; i++) { const t = i / n, x = a.x + (b.x - a.x) * t, y = a.y + 28 + (b.y - a.y) * t, len = Math.hypot(b.x - a.x, b.y - a.y) || 1, ox = -(b.y - a.y) / len * 6 * (i % 2 ? 1 : -1), oy = (b.x - a.x) / len * 6 * (i % 2 ? 1 : -1); pts.push(`${i ? 'L' : 'M'}${x + (i && i < n ? ox : 0)} ${y + (i && i < n ? oy : 0)}`); } dpath = pts.join(' '); }
            p.setAttribute('d', dpath); p.setAttribute('stroke', color); p.setAttribute('stroke-width', String(w)); p.setAttribute('fill', 'none');
            if (dash && dash !== 'zig' && dash !== 'cut') p.setAttribute('stroke-dasharray', dash);
            p.dataset.rsAffect = l.type;
            const tt = document.createElementNS(NS, 'title'); tt.textContent = l.label; p.appendChild(tt); g.appendChild(p);
            if (dash === 'cut') { const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 + 28; const c = document.createElementNS(NS, 'path'); c.setAttribute('d', `M${mx - 4} ${my - 9} L${mx - 4} ${my + 9} M${mx + 4} ${my - 9} L${mx + 4} ${my + 9}`); c.setAttribute('stroke', color); c.setAttribute('stroke-width', '2'); g.appendChild(c); }
        });
        svg.appendChild(g);
        const legend = stage.parentElement?.querySelector('.genogram-legend');
        if (legend && !legend.querySelector('[data-rs-legend]')) {
            const used = [...new Set(links.map(l => l.type))];
            const NAMES = {proche: T('💚 très proches'), ami: T('🤝 amis'), conflit: T('⚡ en conflit'), distance: T('〰️ éloignés'), rupture: T('✂️ brouillés')};
            legend.insertAdjacentHTML('beforeend', `<span data-rs-legend>${esc(T('Liens affectifs (🤝 Son réseau) :'))} ${used.map(k => `<span class="rs-leg is-${k}">${esc(NAMES[k])}</span>`).join(' ')}</span>`);
        }
    }
    new MutationObserver(() => { document.querySelectorAll('#workspace .special-diagram.genogram:not([data-rs-geno])').forEach(s => decorateGenogram(s)); }).observe(document.documentElement, {childList: true, subtree: true});

    /* ═════════════ Réglages → 🤝 Son réseau ═════════════ */
    const TAB = ['reseau', '25r', '🤝 Son réseau (hors famille)'];
    async function drawSettings(token) {
        const ws = document.getElementById('workspace'); if (!ws) return;
        await loadSettings(true);
        if (token !== undefined && A().state && token !== A().state.workspaceToken) return;
        ws.innerHTML = `<section class="page rs-settings" data-rs-settings>${UI().pageHeader ? UI().pageHeader({title: T('Son réseau (hors famille)'), icon: '🤝', where: T('Réglages · Données'),
            help: esc(T('Les relations hors famille enregistrées pour elles-mêmes : amis, voisins, associés, collègues, maîtres et domestiques, employeurs, tuteurs, parrains hors acte, nourrices, compagnons d’armes, liens affectifs. On les ajoute sur la fiche (bloc « 🤝 Son réseau »).'))}) : `<h2>🤝 ${esc(T('Son réseau (hors famille)'))}</h2>`}
            <div class="maintenance-panel"><h3>${esc(T('Ce qui s’affiche'))}</h3>${PARTS.map(([k, l, sub]) => `<label class="checkbox-line" data-rs-tg="${k}"><input type="checkbox" ${on(k) ? 'checked' : ''}><span><b>${esc(T(l))}</b><br><small class="muted">${esc(T(sub))}</small></span></label>`).join('')}</div>
            <div class="maintenance-panel"><h3>${esc(T('Échanges et partage'))}</h3><ul>
                <li>${esc(T('GEDCOM 5.5.1 : « ASSO » avec « RELA » (le rôle) ; GEDCOM 7 : « ASSO » avec « ROLE » et « PHRASE ». Les dates et le lieu sont dans la note de la relation ; les sources suivent.'))}</li>
                <li>${esc(T('À l’import, un « ASSO » sans événement devient une relation (avant : une simple note).'))}</li>
                <li>${esc(T('Une relation avec une personne vivante ou confidentielle cachée par l’export ne part pas (ni ses sources) ; un nom sans fiche ne part pas en mode « pour partager ».'))}</li></ul></div></section>`;
    }
    document.addEventListener('change', async e => {
        const t = e.target.closest?.('[data-rs-tg]'); if (!t || !e.target.matches('input')) return;
        const k = t.dataset.rsTg, v = e.target.checked, label = T((PARTS.find(p => p[0] === k) || [])[1] || k);
        const apply = async val => { const r = await post('reseau_settings_save', {[k]: val ? 1 : 0}); SET = r.settings; };
        try {
            await apply(v);
            A().undoToast?.(T(v ? '« {p} » s’affichera.' : '« {p} » ne s’affichera plus.', {p: label}), {icon: '🤝', undo: async () => { await apply(!v); drawSettings(); }, redo: async () => { await apply(v); drawSettings(); }});
        } catch (err) { toast(err.message, 'error'); e.target.checked = !v; }
    });
    ext.maintenance = ext.maintenance || {};
    ext.maintenance[TAB[0]] = token => drawSettings(token);
    function register() {
        const app = A(), tabs = app.defaultMaintenanceTabs;
        if (!Array.isArray(tabs)) return false;
        if (!tabs.some(t => t[0] === TAB[0])) tabs.push(TAB);
        const B = app.defaultPersonBlocks;
        if (Array.isArray(B) && !B.some(b => b[0] === 'reseau')) { const i = B.findIndex(b => b[0] === 'descendants'); B.splice(i < 0 ? B.length : i + 1, 0, ['reseau', '🤝 Son réseau']); }
        if (app.defaultPersonBlockSpans) app.defaultPersonBlockSpans.reseau ||= '12';
        return true;
    }
    if (!register()) document.addEventListener('DOMContentLoaded', register, {once: true});
    loadSettings().catch(() => {});

    ext.reseau = {loadSettings, openForm, blockHtml, decorateGenogram, openSettings: () => { const st = A().state; if (!st) return; st.maintenanceTab = TAB[0]; A().persistUiState?.(); A().setModule?.('maintenance'); }};
})();
