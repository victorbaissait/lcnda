/* LCNDA — 🏛 Commune qui n'existait pas encore ou plus à la date d'un événement (idée « CountyCheck » de RootsMagic).
 * Serveur : lib/commune_histoire.php (historique officiel des communes de l'INSEE depuis 1943, livré avec l'app, Licence Ouverte 2.0).
 * Où on le voit :
 *  - ✅ Contrôle de la base, 📍 Lieux → « Commune pas encore ou plus là » : « 🏛 Corriger le lieu » (la commune d'alors, ↶ Annuler) et « ↗ source » ;
 *    le bandeau « ⚠️ N choses à vérifier » de la fiche aussi (heritage-controle.js, registre LCNDA_EXT.controleActions) ;
 *  - la fenêtre d'un événement : un petit avertissement sous la case « Lieu », avec « Mettre « … » » ;
 *  - 🔎 Ce qui le concerne / 🧰 Données (LCNDA_EXT.dataSources, id « commune_epoque ») ;
 *  - Réglages → « 🏛 Communes de l’époque » : allumer / éteindre chaque partie (genealogie-commune-histoire), la source et sa licence.
 * Essai : tests/test-commune-anachronique.js
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
    const link = (url, label = T('↗ source'), title = '') => (url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer"${title ? ` title="${esc(title)}"` : ''}>${esc(label)}</a>` : '');
    const READ = '25/11/2026';

    /* ═════════════ réglages (sur l'ordinateur : la fenêtre et 🔎 ; dans la base : le contrôle) ═════════════ */
    const KEY = 'genealogie-commune-histoire';
    const PARTS = [
        ['controle', '✅ Dans le contrôle de la base', 'Les lieux d’événements qui n’étaient pas (ou plus) une commune à cette date, dans 📍 Lieux.'],
        ['evenement', '📅 Dans la fenêtre d’un événement', 'Un petit avertissement sous la case « Lieu », avec la commune de l’époque.'],
        ['concerne', '🔎 Dans « Ce qui le concerne »', 'Les communes de l’époque des actes de la personne.']];
    function settings() { let s = {}; try { s = JSON.parse(W.localStorage?.getItem(KEY) || '{}') || {}; } catch (_) { s = {}; } return {evenement: true, concerne: true, ...s}; }
    function save(s) { try { W.localStorage?.setItem(KEY, JSON.stringify(s)); } catch (_) {} }
    const on = k => settings()[k] !== false;

    const srcHtml = s => s ? `<small class="ch-src">${esc(T('Source :'))} ${link(s.url, T(s.label))} — ${esc(s.licence)}${s.commune_url ? ` · ${link(s.commune_url, T('↗ la commune sur insee.fr'))}` : ''} · ${link(s.dataset, T('↗ le fichier'))}</small>` : '';

    /* ═════════════ ✅ Contrôle de la base : « 🏛 Corriger le lieu » ═════════════ */
    function modal(title, body, okLabel) {
        return new Promise(resolve => {
            const dlg = document.createElement('dialog'); dlg.className = 'modal ch-modal';
            dlg.innerHTML = `<form method="dialog"><div class="modal-head"><div><span class="eyebrow">${esc(T('COMMUNE DE L’ÉPOQUE'))}</span><h2>${esc(title)}</h2></div><button class="icon-button" value="cancel" aria-label="${esc(T('Fermer'))}">×</button></div>
                <div class="h-dialog-body">${body}</div><div class="modal-actions"><button type="button" class="button secondary" data-ch-open>${esc(T('Ouvrir l’événement'))}</button><span class="spacer"></span><button class="button secondary" value="cancel">${esc(T('Annuler'))}</button><button class="button" value="ok" data-ch-ok>${esc(okLabel)}</button></div></form>`;
            document.body.appendChild(dlg);
            dlg.querySelector('[data-ch-open]').addEventListener('click', () => { dlg.close('open'); });
            dlg.addEventListener('close', () => { const v = dlg.returnValue; const pick = dlg.querySelector('input[name="ch_then"]:checked'); dlg.remove(); resolve(v === 'ok' ? (pick ? JSON.parse(pick.value) : null) : v === 'open' ? 'open' : null); });
            dlg.showModal();
        });
    }
    async function openEvent(a) {
        const pid = Number(a.fix?.person_id || a.people?.[0]), eid = Number(a.fix?.event_id || 0); if (!pid) return;
        const already = A().state?.module === 'personnes' && Number(A().state?.currentPersonId) === pid;
        if (!already) A().openPersonById?.(pid);
        for (let i = 0; i < 60; i++) { const b = document.querySelector(`#workspace [data-edit-event="${eid}"]`); if (b && (already || i > 1)) { b.click(); return; } await new Promise(r => setTimeout(r, 100)); }
    }
    async function fixAlert(a, after) {
        const c = a.commune || {}; const then = c.then || [];
        if (!then.length) return openEvent(a);
        const body = `<p>${esc(a.detail || '')}</p><p><b>${esc(T('Quelle commune mettre sur l’événement ?'))}</b></p>
            <div class="ch-choices">${then.map((t, i) => `<label class="checkbox-line"><input type="radio" name="ch_then" value="${esc(JSON.stringify(t))}" ${i ? '' : 'checked'}><span><b>${esc(t.name)}</b> <small class="muted">${esc(T('code INSEE {c}', {c: t.code}))}</small></span></label>`).join('')}</div>
            <p class="muted">${esc(T('Si elle n’est pas encore dans tes lieux, elle y est ajoutée comme ancienne commune. Le lieu d’avant reste dans la base.'))}</p>${srcHtml(c.source)}`;
        const pick = await modal(a.title, body, T('Mettre cette commune'));
        if (pick === 'open') return openEvent(a);
        if (!pick) return;
        const eid = Number(a.fix?.event_id);
        try {
            const r = await post('commune_hist_fix', {event_id: eid, code: pick.code, name: pick.name});
            A().undoToast?.(T('Lieu corrigé : {old} → {new}', {old: a.place?.name || '?', new: r.place_name}), {icon: '🏛',
                undo: async () => { await post('commune_hist_fix', {event_id: eid, place_id: r.before_place_id, drop_place: r.created ? r.place_id : 0}); after?.(); },
                redo: async () => { await post('commune_hist_fix', {event_id: eid, code: pick.code, name: pick.name}); after?.(); }});
            after?.();
        } catch (e) { toast(e.message, 'error'); }
    }
    (ext.controleActions = ext.controleActions || []).push({
        match: a => a.check === 'commune-anachro',
        html: (a, i) => `<button type="button" class="button small secondary" data-ctl-custom="${i}">${esc(T('🏛 Corriger le lieu'))}</button>${a.commune?.source?.url ? `<a class="button small secondary" href="${esc(a.commune.source.url)}" target="_blank" rel="noopener noreferrer" title="${esc(a.commune.quote || '')}">${esc(T('↗ source'))}</a>` : ''}`,
        run: fixAlert});

    /* ═════════════ la fenêtre d'un événement : un petit avertissement sous « Lieu » ═════════════ */
    let lastKey = '', seq = 0;
    async function checkDialog(force = false) {
        const dlg = document.getElementById('event-dialog'), form = document.getElementById('event-form');
        if (!dlg || !form || !dlg.open) return;
        const box = () => form.querySelector('[data-ch-warn]');
        if (!on('evenement')) { box()?.remove(); return; }
        const place = form.elements.place_id?.value || '', date = form.elements.date_text?.value || '';
        const key = `${place}|${date}`;
        if (!force && key === lastKey) return;
        lastKey = key;
        if (!place || !/\d{3,4}/.test(date)) { box()?.remove(); return; }
        const my = ++seq;
        let r; try { r = await api('commune_hist_check', {place_id: place, date_text: date, label: form.elements.event_type_id?.selectedOptions?.[0]?.textContent?.trim() || T('Événement')}); } catch (_) { return; }
        if (my !== seq) return;
        const al = r?.alert;
        if (!al || al.level === 'info') { box()?.remove(); return; }
        let el = box();
        if (!el) { el = document.createElement('div'); el.dataset.chWarn = '1'; const host = form.elements.place_id.closest('.pk-host') || form.elements.place_id.parentElement; host.after(el); }
        el.className = `ch-warn is-${al.level} span-2`;
        el.innerHTML = `<p>⚠️ <b>${esc(al.title)}</b></p><p>${esc(al.detail)}</p>
            ${al.then?.length ? `<div class="ch-warn-acts">${al.then.map(t => `<button type="button" class="button small secondary" data-ch-use="${esc(JSON.stringify(t))}">${esc(T('Mettre « {name} »', {name: t.name}))}</button>`).join('')}</div>` : ''}${srcHtml(al.source)}`;
    }
    document.addEventListener('click', async e => {
        const b = e.target.closest?.('[data-ch-use]'); if (!b) return;
        e.preventDefault();
        const form = document.getElementById('event-form'); const t = JSON.parse(b.dataset.chUse);
        const field = form?.querySelector('[data-place-picker] .pk') || form?.elements.place_id?.closest('.pk');
        const P = W.LCNDA_PICKER; if (!field || !P?.pickerSet) return;
        const prev = P.pickerValue ? P.pickerValue(field) : form.elements.place_id.value;
        try {
            const r = await post('commune_hist_place', {code: t.code, name: t.name, like_place_id: form.elements.place_id.value || 0});
            P.pickerSet(field, {id: r.place_id, title: r.name}); form.elements.place_id.value = String(r.place_id);
            if (form.elements.place_name) form.elements.place_name.value = r.name;
            A().undoToast?.(T('Lieu mis dans la fenêtre : {name} (enregistre l’événement pour le garder)', {name: r.name}), {icon: '🏛',
                undo: () => { P.pickerSet(field, prev || null); form.elements.place_id.value = prev ? String(prev) : ''; checkDialog(true); }});
            checkDialog(true);
        } catch (err) { toast(err.message, 'error'); }
    });
    function watchDialog() {
        const dlg = document.getElementById('event-dialog'); if (!dlg || dlg.__chWatch) return !!dlg;
        dlg.__chWatch = true;
        new MutationObserver(() => { if (dlg.open) { lastKey = ''; setTimeout(() => checkDialog(true), 250); } else { dlg.querySelector('[data-ch-warn]')?.remove(); } }).observe(dlg, {attributes: true, attributeFilter: ['open']});
        dlg.addEventListener('change', () => setTimeout(() => checkDialog(), 50));
        dlg.addEventListener('input', () => { clearTimeout(watchDialog.t); watchDialog.t = setTimeout(() => checkDialog(), 600); });
        setInterval(() => { if (dlg.open) checkDialog(); }, 1500); // la case Lieu (menu de choix) ne dit pas toujours qu'elle a changé
        return true;
    }
    if (!watchDialog()) document.addEventListener('DOMContentLoaded', watchDialog, {once: true});

    /* ═════════════ 🔎 Ce qui le concerne / 🧰 Données ═════════════ */
    async function personHtml(pid) {
        let d; try { d = await api('controle_person', {id: pid}); } catch (_) { return ''; }
        const list = (d.alerts || []).filter(a => a.check === 'commune-anachro');
        if (!list.length) return '';
        return `<div class="ch-person"><ul>${list.map(a => `<li><b>${esc(a.title)}</b> — ${esc(a.detail)} ${link(a.commune?.source?.url, T('↗ source'), a.commune?.quote || '')}</li>`).join('')}</ul>
            <p class="muted">${esc(T('À corriger dans ✅ Contrôle de la base (📍 Lieux) ou dans la fenêtre de l’événement.'))}</p>${srcHtml(list[0].commune?.source)}</div>`;
    }
    (ext.dataSources = ext.dataSources || []).push({id: 'commune_epoque', icon: '🏛', label: T('Les communes à l’époque de ses actes'), group: 'La personne', needs: ['person'],
        enabled: () => on('concerne'),
        run: async (ctx, host) => { if (!on('concerne')) { host.innerHTML = ''; return false; } const pid = Number(ctx?.person?.id || ctx?.id); const html = pid ? await personHtml(pid) : ''; host.innerHTML = html; return !!html; }});

    /* ═════════════ Réglages → 🏛 Communes de l’époque ═════════════ */
    const TAB = ['commune_histoire', '02c', '🏛 Communes de l’époque'];
    async function drawSettings(token) {
        const ws = document.getElementById('workspace'); if (!ws) return;
        let about = {}; try { about = await api('commune_hist_about'); } catch (_) {}
        if (token !== undefined && A().state && token !== A().state.workspaceToken) return;
        const s = {...settings(), controle: about.enabled !== false};
        const mo = b => `${String(Math.round((b || 0) / 1e5) / 10).replace('.', ',')} Mo`;
        ws.innerHTML = `<section class="page ch-settings" data-ch-settings>${UI().pageHeader ? UI().pageHeader({title: T('Communes de l’époque'), icon: '🏛', where: T('Réglages · Qualité des données'),
            help: esc(T('Un lieu d’événement qui n’était pas (ou plus) une commune à la date de l’événement : commune créée après, ou réunie à une autre avant. D’après l’historique officiel des communes de l’INSEE depuis 1943.'))}) : `<h2>🏛 ${esc(T('Communes de l’époque'))}</h2>`}
            <div class="maintenance-panel"><h3>${esc(T('Ce qui s’affiche'))}</h3>${PARTS.map(([k, l, sub]) => `<label class="checkbox-line" data-ch-tg="${k}"><input type="checkbox" ${s[k] ? 'checked' : ''}><span><b>${esc(T(l))}</b><br><small class="muted">${esc(T(sub))}</small></span></label>`).join('')}</div>
            <div class="maintenance-panel"><h3>${esc(T('Prudence'))}</h3><ul>
                <li>${esc(T('Rien avant 1790 : avant la Révolution, il y avait des paroisses, pas des communes.'))}</li>
                <li>${esc(T('Le fichier commence en 1943 : une commune créée ou réunie avant 1943 n’est pas contrôlée.'))}</li>
                <li>${esc(T('Une date approximative (« vers », « avant », « entre »…) doit être à plus de 10 ans du changement.'))}</li>
                <li>${esc(T('Un hameau ou un lieu-dit n’est jamais signalé ; une commune devenue « associée » ou « déléguée » garde son état civil : pas signalée.'))}</li>
                <li>${esc(T('Un simple changement de nom n’est pas une erreur : il n’est pas signalé.'))}</li></ul></div>
            <div class="maintenance-panel"><h3>${esc(T('À propos des données'))}</h3><table class="data-table"><thead><tr><th>${esc(T('Source'))}</th><th>${esc(T('Ce qu’elle donne'))}</th><th>${esc(T('Où'))}</th><th>${esc(T('Licence'))}</th></tr></thead><tbody>
                <tr><td>${link(about.url || 'https://www.insee.fr/fr/information/2560452', T('INSEE, Code officiel géographique (COG)'))}</td><td>${esc(T('Communes depuis 1943 (noms, dates de début et de fin) et événements survenus aux communes (créations, fusions, communes nouvelles, rétablissements)'))}</td>
                <td>${esc(about.files ? T('dans l’app ({s}, {n} communes)', {s: mo((about.files.mvt || 0) + (about.files.com || 0)), n: Number(about.communes || 0).toLocaleString('fr-FR')}) : T('pas encore là'))}</td><td>${link('https://www.etalab.gouv.fr/licence-ouverte-open-licence/', T('Licence Ouverte 2.0 (Etalab)'))} <small class="muted">${esc(T('lu le {d}', {d: READ}))}</small></td></tr>
                <tr><td>${link('https://www.insee.fr/fr/metadonnees/historique-commune', T('INSEE, historique des communes (recherche)'))}</td><td>${esc(T('La page officielle où vérifier chaque commune (lien « ↗ source » de chaque alerte)'))}</td><td>${esc(T('lien seulement'))}</td><td>${esc(T('Licence Ouverte 2.0 (Etalab)'))}</td></tr>
                <tr><td>${link('https://cassini.ehess.fr/', T('Des villages de Cassini aux communes d’aujourd’hui (EHESS)'))}</td><td>${esc(T('Les changements d’avant 1943'))}</td><td>${esc(T('lien seulement'))}</td><td>${esc(T('licence non vérifiée : rien n’est copié'))}</td></tr>
                </tbody></table><p class="muted">${esc(T('Rien n’est envoyé sur Internet : tout est lu dans les fichiers livrés avec l’app (les mêmes que « 🏛 Frontières anciennes »).'))}</p></div></section>`;
    }
    document.addEventListener('change', async e => {
        const t = e.target.closest?.('[data-ch-tg]'); if (!t || !e.target.matches('input')) return;
        const k = t.dataset.chTg, v = e.target.checked;
        const label = T((PARTS.find(p => p[0] === k) || [])[1] || k);
        const apply = async val => {
            if (k === 'controle') await post('commune_hist_setting', {controle: val ? 1 : 0});
            else { const s = settings(); s[k] = val; save(s); }
        };
        try {
            await apply(v);
            A().undoToast?.(T(v ? '« {p} » s’affichera.' : '« {p} » ne s’affichera plus.', {p: label}), {icon: '🏛', undo: async () => { await apply(!v); drawSettings(); }, redo: async () => { await apply(v); drawSettings(); }});
        } catch (err) { toast(err.message, 'error'); e.target.checked = !v; }
    });
    ext.maintenance = ext.maintenance || {};
    ext.maintenance[TAB[0]] = token => drawSettings(token);
    function register() {
        const tabs = A().defaultMaintenanceTabs;
        if (!Array.isArray(tabs)) return false;
        if (!tabs.some(t => t[0] === TAB[0])) { const i = tabs.findIndex(t => t[0] === 'controle_seuils'); tabs.splice(i < 0 ? tabs.length : i + 1, 0, TAB); }
        return true;
    }
    if (!register()) document.addEventListener('DOMContentLoaded', register, {once: true});

    ext.communeHistoire = {settings, checkDialog, fixAlert, personHtml, openSettings: () => { const st = A().state; if (!st) return; st.maintenanceTab = TAB[0]; A().persistUiState?.(); A().setModule?.('maintenance'); }};
})();
