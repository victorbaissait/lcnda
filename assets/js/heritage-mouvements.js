/**
 * 🌍 Ta famille dans les grands mouvements — les déplacements de la famille comparés aux grandes migrations de l'histoire
 * (exode rural, bougnats, Barcelonnettes, Italiens, rapatriés d'Algérie…). Calcul : lib/mouvements.php
 * (GET grands_mouvements, person_movements ; POST movement_mark, save_own_movement, delete_own_movement).
 *  - Listes → Histoire → « 🌍 Ta famille dans les grands mouvements » : chaque mouvement, les personnes qui y ont pris part
 *    (« sûr » ou « possible »), « Oui, c'est ça » / « Non », ＋ Ajouter un mouvement (les miens) ;
 *  - fiche, bloc « 🌍 Le monde autour » : « Pierre a fait partie de l'exode rural vers Paris (1850-1930) ».
 * Essai : tests/test-mouvements.js
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const UI = () => window.LCNDA_UI || {};
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    ext.lists = ext.lists || {};
    const T = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s).replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));
    const esc = v => A().escapeHtml(v ?? '');
    const S = () => A().state;
    const post = async (action, body) => { const r = await A().api(action, {}, {method: 'POST', body}); return r?.result ?? r ?? {}; };
    const PREF = 'genealogie-mouvements';
    const pref = () => { try { return {mine: true, ...(JSON.parse(localStorage.getItem(PREF) || '{}') || {})}; } catch (_) { return {mine: true}; } };
    const setPref = p => { try { localStorage.setItem(PREF, JSON.stringify({...pref(), ...p})); } catch (_) {} };
    const yrs = m => (m.to > m.from ? `${m.from}–${m.to}` : String(m.from));
    const srcLink = m => (m.url ? `<a href="${esc(m.url)}" target="_blank" rel="noopener noreferrer">${esc(m.src || T('Source'))} ↗</a>` : esc(m.src || ''));
    const badge = (t, c) => (UI().badge ? UI().badge(t, c) : `<span class="badge">${esc(t)}</span>`);
    const levelBadge = p => (p.verdict === 'oui' ? badge(T('Confirmé'), 'green') : p.level === 'sur' ? badge(T('Sûr'), 'blue') : badge(T('Possible'), 'yellow'));

    function personRow(m, p) {
        const trip = `${esc(p.from)} → ${esc(p.to)}${p.y1 ? `, ${p.y1}` : ''}`;
        return `<li class="mv-who" data-mv-row="${p.id}|${esc(m.id)}"><button type="button" class="table-link" data-mv-open="${p.id}">${esc(p.name || '?')}</button> <span class="muted">(${trip})</span> ${levelBadge(p)}
            <span class="mv-acts">${p.verdict === 'oui' ? '' : `<button type="button" class="button small secondary" data-mv-mark="oui" data-mv-p="${p.id}" data-mv-m="${esc(m.id)}">${T('Oui, c’est ça')}</button>`}
            ${p.verdict === 'non' ? '' : `<button type="button" class="button small secondary" data-mv-mark="non" data-mv-p="${p.id}" data-mv-m="${esc(m.id)}">${T('Non')}</button>`}</span></li>`;
    }

    function cardHtml(m) {
        const n = m.people.length;
        return `<article class="mv-card${n ? ' has-people' : ''}" data-mv-card="${esc(m.id)}">
            <header><span class="mv-years">${esc(yrs(m))}</span><h3>${esc(m.title)}</h3>${m.own ? ` ${badge(T('Ajouté par toi'), 'grey')}` : ''}
                ${n ? `<span class="mv-count">${esc(A().plural(n, T('personne')))}</span>` : ''}</header>
            <p class="mv-route">${esc(m.de_text)} → ${esc(m.vers_text)}</p>
            ${m.desc ? `<p class="muted">${esc(m.desc)}</p>` : ''}
            ${n ? `<ul class="mv-people">${m.people.map(p => personRow(m, p)).join('')}</ul>` : ''}
            <footer>${m.src ? `<small>${T('Source')} : ${srcLink(m)}</small>` : '<span></span>'}
                ${n ? `<button type="button" class="button small secondary" data-mv-map="${esc(m.id)}">🗺 ${T('Sur la carte des migrations')}</button>` : ''}
                ${m.own ? `<span><button type="button" class="icon-button" data-mv-edit="${m.own}" title="${esc(T('Modifier'))}" aria-label="${esc(T('Modifier ce mouvement'))}">✎</button><button type="button" class="icon-button" data-mv-del="${m.own}" title="${esc(T('Supprimer'))}" aria-label="${esc(T('Supprimer ce mouvement'))}">🗑</button></span>` : ''}</footer></article>`;
    }

    ext.lists.grands_mouvements = async token => {
        const ws = A().$('#workspace');
        let d; try { d = last = await A().api('grands_mouvements', {}); } catch (e) { ws.innerHTML = A().emptyState({icon: '⛔', text: e.message}); return; }
        if (token !== S().workspaceToken || S().module !== 'listes') return;
        const st = pref();
        const rows = st.mine ? d.mouvements.filter(m => m.people.length) : d.mouvements;
        ws.innerHTML = `<section class="page collection-page mv-page">${UI().pageHeader({title: T('🌍 Ta famille dans les grands mouvements'),
                help: T('L’app croise les déplacements de chaque personne (naissance, mariage, résidence, décès…) avec les grandes migrations de l’histoire : même départ, même arrivée, même époque. « Sûr » ou « possible », jamais imposé : c’est toi qui confirmes.'),
                actions: [`<button type="button" class="button" data-mv-new>${T('＋ Ajouter un mouvement')}</button>`]})}
            <div class="mv-bar"><p class="mv-lead">${d.found ? esc(T('{n} mouvements où l’on retrouve ta famille ({p}), sur {t}.', {n: d.found, p: A().plural(d.people, T('personne')), t: d.total})) : esc(T('Aucun déplacement de ta famille ne correspond pour l’instant à un grand mouvement ({t} dans la liste).', {t: d.total}))}</p>
                <label class="ui-toggle"><input type="checkbox" data-mv-mine ${st.mine ? 'checked' : ''}><i></i>${T('Seulement ceux de ma famille')}</label></div>
            ${rows.length ? `<div class="mv-list">${rows.map(cardHtml).join('')}</div>` : A().emptyState({icon: '🌍', text: T('Personne de ta famille dans ces mouvements'), hint: T('Ajoute des lieux et des dates (naissance, mariage, décès, résidence) : l’app pourra alors comparer.'), action: {label: T('Voir tous les mouvements'), attrs: 'data-empty-click="[data-mv-mine]"'}})}
            <section class="maintenance-panel"><h3>${T('D’où viennent ces mouvements ?')}</h3><p>${esc(d.credit)}</p><p>${T('Licence')} <a href="${esc(d.licence_url)}" target="_blank" rel="noopener noreferrer">${esc(d.licence)} ↗</a>.</p></section></section>`;
    };
    const relist = () => { if (S().module === 'listes' && S().listType === 'grands_mouvements') A().renderList?.(); document.querySelectorAll('[data-mv-person]').forEach(fillPerson); };

    /* ─────────── 🗺 la carte des migrations de ces personnes (un diagramme « flowmap » prêt à garder) ─────────── */
    let last = null;
    const foldK = x => String(x ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[’'`]/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
    function flowSpec(m) {
        const places = {}, count = {};
        m.people.forEach(p => {
            if (p.from_ll) places[foldK(p.from)] = {lat: p.from_ll[0], lon: p.from_ll[1], n: p.from};
            if (p.to_ll) places[foldK(p.to)] = {lat: p.to_ll[0], lon: p.to_ll[1], n: p.to};
            const k = p.from + '\u0000' + p.to; count[k] = (count[k] || 0) + 1;
        });
        const rows = Object.entries(count).map(([k, value]) => { const [from, to] = k.split('\u0000'); return {from, to, value}; });
        return {kind: 'flowmap', o: {title: m.title, subtitle: `${yrs(m)} · ${m.de_text} → ${m.vers_text}`, map: m.people.some(p => p.abroad) ? 'monde' : 'fr', level: 'dep', unit: T('personnes'), source: m.src}, places, rows};
    }
    async function openMap(id) {
        const m = (last || (await A().api('grands_mouvements', {}))).mouvements.find(x => String(x.id) === String(id));
        if (!m || !m.people.length) return;
        if (!ext.openDiagramEditor) { A().toast(T('Les diagrammes ne sont pas chargés.'), 'error'); return; }
        ext.openDiagramEditor(null, {spec: flowSpec(m), name: m.title});
    }

    /* ─────────── la fiche : dans « 🌍 Le monde autour » ─────────── */
    async function fillPerson(host) {
        const pid = Number(host.dataset.mvPerson) || 0; if (!pid) return;
        let r; try { r = await A().api('person_movements', {id: pid}); } catch (_) { host.innerHTML = ''; return; }
        if (!host.isConnected) return;
        const first = host.dataset.mvFirst || T('Cette personne');
        host.innerHTML = (r.moves || []).length ? `<div class="mv-person"><h4>${T('Dans les grands mouvements')}</h4><ul>${r.moves.map(m => `<li>${esc(m.level === 'sur' ? T('{p} a fait partie de : {m} ({y}).', {p: first, m: m.title, y: `${m.m_from}–${m.m_to}`}) : T('{p} a peut-être fait partie de : {m} ({y}).', {p: first, m: m.title, y: `${m.m_from}–${m.m_to}`}))}
            <span class="muted">${esc(m.from)} → ${esc(m.to)}${m.y1 ? `, ${m.y1}` : ''}</span> ${m.verdict === 'oui' ? badge(T('Confirmé'), 'green') : ''}${m.src ? ` <small>${T('Source')} : ${srcLink(m)}</small>` : ''}
            ${m.verdict === 'oui' ? '' : `<span class="mv-acts"><button type="button" class="button small secondary" data-mv-mark="oui" data-mv-p="${pid}" data-mv-m="${esc(m.id)}">${T('Oui, c’est ça')}</button><button type="button" class="button small secondary" data-mv-mark="non" data-mv-p="${pid}" data-mv-m="${esc(m.id)}">${T('Non')}</button></span>`}</li>`).join('')}</ul>
            <button type="button" class="table-link" data-mv-list>${T('Voir toute la famille dans les grands mouvements →')}</button></div>` : '';
    }
    const scan = () => document.querySelectorAll('[data-mv-person]:not([data-mv-done])').forEach(h => { h.dataset.mvDone = '1'; fillPerson(h); });
    new MutationObserver(scan).observe(document.documentElement, {childList: true, subtree: true});

    /* ─────────── mes mouvements ─────────── */
    async function editOwn(id = 0) {
        let v = {from_year: '', to_year: ''};
        if (id) { const d = await A().api('grands_mouvements', {}); const m = d.mouvements.find(x => Number(x.own) === Number(id)); if (m) v = {title: m.title, from_year: m.from, to_year: m.to, de: m.de_text, vers: m.vers_text, description: m.desc, source: m.src, url: m.url}; }
        ext.openDialog({eyebrow: T('GRANDS MOUVEMENTS'), title: id ? T('Modifier le mouvement') : T('Nouveau mouvement'), body: `<div class="form-grid">
                <label class="span-2">${T('Nom')}<input name="title" required maxlength="200" value="${esc(v.title || '')}" placeholder="${esc(T('Les verriers de Carmaux vers Albi'))}" data-error="${esc(T('Donne un nom au mouvement.'))}"></label>
                <label>${T('Année de début')}<input name="from_year" type="number" min="1000" max="2100" required value="${esc(v.from_year)}"></label>
                <label>${T('Année de fin')}<input name="to_year" type="number" min="1000" max="2100" value="${esc(v.to_year)}"></label>
                <label class="span-2">${T('D’où')} <small>${T('(numéros de départements, villes ou pays, séparés par des virgules)')}</small><input name="de" required maxlength="500" value="${esc(v.de || '')}" placeholder="81, Carmaux"></label>
                <label class="span-2">${T('Vers où')}<input name="vers" required maxlength="500" value="${esc(v.vers || '')}" placeholder="Albi, Toulouse"></label>
                <label class="span-2">${T('Ce qu’il faut savoir')}<textarea name="description" rows="3" maxlength="4000">${esc(v.description || '')}</textarea></label>
                <label>${T('Source')}<input name="source" maxlength="500" value="${esc(v.source || '')}"></label>
                <label>${T('Lien')} <small>${T('(facultatif)')}</small><input name="url" type="url" maxlength="1000" value="${esc(v.url || '')}" placeholder="https://…"></label></div>`,
            onSubmit: async f => { const data = Object.fromEntries(new FormData(f)); data.id = id; await post('save_own_movement', data); A().toast(id ? T('Enregistré') : T('Mouvement ajouté'), 'success'); relist(); }});
    }
    async function deleteOwn(id) {
        try {
            const r = await post('delete_own_movement', {id}); relist();
            const w = r.row || {}; let back = 0;
            A().undoToast?.(T('Mouvement « {t} » supprimé', {t: w.title}), {undo: async () => { back = (await post('save_own_movement', {title: w.title, from_year: w.from_year, to_year: w.to_year, de: w.de, vers: w.vers, description: w.description, source: w.source, url: w.url})).id; relist(); },
                redo: async () => { if (back) await post('delete_own_movement', {id: back}); relist(); }});
        } catch (e) { A().toast(e.message, 'error'); }
    }
    async function mark(pid, mid, verdict) {
        try {
            const r = await post('movement_mark', {person_id: pid, movement_id: mid, verdict}); relist();
            A().undoToast?.(verdict === 'oui' ? T('Confirmé') : T('Retiré de ce mouvement'), {undo: async () => { await post('movement_mark', {person_id: pid, movement_id: mid, verdict: r.old || ''}); relist(); },
                redo: async () => { await post('movement_mark', {person_id: pid, movement_id: mid, verdict}); relist(); }});
        } catch (e) { A().toast(e.message, 'error'); }
    }

    document.addEventListener('click', e => {
        const t = e.target;
        if (t.closest?.('[data-mv-new]')) { e.preventDefault(); editOwn(0); return; }
        const ed = t.closest?.('[data-mv-edit]'); if (ed) { editOwn(Number(ed.dataset.mvEdit)); return; }
        const del = t.closest?.('[data-mv-del]'); if (del) { deleteOwn(Number(del.dataset.mvDel)); return; }
        const mp = t.closest?.('[data-mv-map]'); if (mp) { openMap(mp.dataset.mvMap); return; }
        const mk = t.closest?.('[data-mv-mark]'); if (mk) { mark(Number(mk.dataset.mvP), mk.dataset.mvM, mk.dataset.mvMark); return; }
        const op = t.closest?.('[data-mv-open]'); if (op) { S().currentPersonId = Number(op.dataset.mvOpen); A().setModule('personnes'); return; }
        if (t.closest?.('[data-mv-list]')) { e.preventDefault(); S().listType = 'grands_mouvements'; A().setModule('listes'); }
    });
    document.addEventListener('change', e => { if (e.target.matches?.('[data-mv-mine]')) { setPref({mine: e.target.checked}); relist(); } });

    const boot = () => {
        const L = A()?.defaultListTypes; if (Array.isArray(L) && !L.some(x => x[0] === 'grands_mouvements')) { const i = L.findIndex(x => x[0] === 'historical_context'); L.splice(i < 0 ? L.length : i, 0, ['grands_mouvements', '34b', '🌍 Ta famille dans les grands mouvements']); }
    };
    boot(); document.addEventListener('DOMContentLoaded', boot, {once: true});
    ext.mouvements = {editOwn, mark, fillPerson, flowSpec, openMap};
})();
