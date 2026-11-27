/* LCNDA — 📍 Lieux en double probables (serveur : lib/lieux_doublons.php ; essai : tests/test-lieux-doublons.js).
 *  - menu de choix des lieux (app-picker.js) : sur la ligne la plus faible, « ≈ même lieu que Pernay (Indre-et-Loire) ? »
 *    et « Fusionner… » (ou « Supprimer ce lieu vide (doublon) » quand il n'a aucun lien : un clic, ↶ Annuler) ;
 *  - la petite fenêtre : lieu gardé à gauche, doublon à droite, ce qui passe de l'un à l'autre, lequel garder, Fusionner, ↶ ;
 *  - Réglages → Modifications groupées : la liste des groupes, « Fusionner… » par ligne et « Tout fusionner (sûrs seulement) » ;
 *  - ✅ Contrôle de la base : l'alerte « Lieu en double probable » ouvre la même fenêtre.
 * Rien de tout cela en mode consultation.
 */
(() => {
    'use strict';
    const i18n = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s).replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? v[k] : m)));
    const A = () => window.LCNDA_APP || {};
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const isKiosk = () => document.body.classList.contains('is-kiosk');
    const get = (action, q) => A().api(action, q);
    const post = async (action, body) => { const r = await A().api(action, {}, {method: 'POST', body}); return r?.result ?? r; };
    const toast = (m, k) => A().toast?.(m, k);
    const TABLES = {events: 'événements', census_records: 'recensements', place_populations: 'populations', place_former_names: 'anciens noms', label_links: 'étiquettes',
        media: 'médias', postcards: 'cartes postales', archive_digest_entries: 'dépouillements', place_parishes: 'paroisses', history_events: 'histoire locale', dismissed_issues: 'alertes écartées',
        place_photo_guesses: 'photos', cx_links: 'liens', cx_basket_items: 'paniers', items: 'créations', succession_acts: 'actes de succession', cousinades: 'cousinades'};
    const where = p => [p.county, p.state, p.country].map(x => String(x || '').trim()).filter(Boolean).join(', ');

    /** « ≈ même lieu que Pernay (Indre-et-Loire) ? » sous la ligne du menu de choix */
    function hintHtml(it) {
        const d = it && it.dup_of;
        if (!d || isKiosk() || !it.id) return '';
        const target = d.county ? `${d.name} (${d.county})` : d.name;
        const btn = d.empty
            ? `<button type="button" class="pk-dup-btn" data-pldup-empty="${Number(it.id)}" data-pldup-into="${Number(d.id)}" data-ia-done="1">${esc(i18n('Supprimer ce lieu vide (doublon)'))}</button>`
            : `<button type="button" class="pk-dup-btn" data-pldup-merge="${Number(it.id)}" data-pldup-into="${Number(d.id)}" data-ia-done="1">${esc(i18n('Fusionner…'))}</button>`;
        return `<div class="pk-dup" title="${esc(i18n(d.reason || ''))}"><span class="pk-dup-txt">${esc(i18n('≈ même lieu que {place} ?', {place: target}))}</span>${btn}</div>`;
    }

    function undoAfter(r, label, after) {
        const msg = r.moved || r.set_aside ? i18n('{label} : {n} lien(s) déplacé(s)', {label, n: (r.moved || 0) + (r.set_aside || 0)}) : label;
        if (!r.undo_id || !A().undoToast) { toast(msg); return; }
        A().undoToast(msg, {icon: '📍', undo: async () => { const u = await post('ld_undo', {id: r.undo_id}); await after?.('undo'); return u?.already ? {already: true} : undefined; }});
    }

    /** Un doublon vide : fusionné (il ne reste qu'un lieu) en un clic, ↶ le remet */
    async function removeEmpty(from, to, after) {
        if (isKiosk()) return;
        try { const r = await post('ld_merge', {from, to}); undoAfter(r, i18n('Lieu vide retiré : « {name} »', {name: r.removed?.name || ''}), after); await after?.('merge'); }
        catch (e) { toast(e.message, 'error'); }
    }

    function sideHtml(p, keep) {
        const rows = [[i18n('Où'), where(p) || '—'], [i18n('Code INSEE'), p.admin4_code || '—'],
            [i18n('Coordonnées'), p.latitude != null && p.longitude != null && p.latitude !== '' ? `${Number(p.latitude).toFixed(4)}, ${Number(p.longitude).toFixed(4)}` : '—'], [i18n('Liens'), String(Number(p.links || 0))]];
        return `<section class="ld-side ${keep ? 'is-keep' : 'is-dup'}"><span class="ld-tag">${esc(keep ? i18n('Gardé') : i18n('Doublon (sera retiré)'))}</span><h3>${esc(p.name)}</h3>
            <dl>${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl></section>`;
    }

    /** La petite fenêtre : gardé à gauche, doublon à droite, ce qui bouge, lequel garder, Fusionner */
    function open(from, to, after) {
        if (isKiosk()) return Promise.resolve(null);
        return new Promise(resolve => {
            const d = document.createElement('dialog');
            d.className = 'modal small-modal ld-dialog'; d.dataset.ownClose = '1';
            let pair = [Number(from), Number(to)], data = null, done = null;
            d.innerHTML = `<form method="dialog"><div class="modal-head"><div><span class="eyebrow">${esc(i18n('LIEUX EN DOUBLE'))}</span><h2>${esc(i18n('Fusionner deux lieux'))}</h2></div><button class="icon-button" type="button" data-ld-close aria-label="${esc(i18n('Fermer'))}">×</button></div>
                <div class="ld-body" data-ld-body>${window.LCNDA_UI?.spinner ? window.LCNDA_UI.spinner(i18n('Aperçu…')) : esc(i18n('Aperçu…'))}</div>
                <div class="modal-actions"><span class="spacer"></span><button type="button" class="button secondary" data-ld-close>${esc(i18n('Annuler'))}</button><button type="submit" class="button" data-ld-go disabled>${esc(i18n('Fusionner'))}</button></div></form>`;
            document.body.appendChild(d);
            const body = d.querySelector('[data-ld-body]'), go = d.querySelector('[data-ld-go]');
            const paint = async () => {
                go.disabled = true;
                try { data = await get('ld_preview', {from: pair[0], to: pair[1]}); }
                catch (e) { body.innerHTML = `<p class="ld-warn">${esc(e.message)}</p>`; return; }
                const moves = Object.entries(data.moves || {});
                const gets = Object.keys(data.gets || {}).map(k => ({latitude: i18n('coordonnées'), longitude: '', admin4_code: i18n('code INSEE'), admin2_code: i18n('n° de département'), county: i18n('département'), state: i18n('région'), country: i18n('pays'), alternate_names: i18n('autre nom'), population: i18n('population'), geoname_id: 'GeoNames'}[k] ?? k)).filter(Boolean);
                body.innerHTML = `<div class="ld-sides">${sideHtml(data.to, true)}${sideHtml(data.from, false)}</div>
                    ${data.reason ? `<p class="ld-why">${esc(i18n(data.reason))}</p>` : ''}
                    ${data.warning ? `<p class="ld-warn" role="alert">⚠️ ${esc(i18n(data.warning))}</p>` : ''}
                    <fieldset class="ld-choice"><legend class="sr-only">${esc(i18n('Lequel garder ?'))}</legend><span>${esc(i18n('Lequel garder ?'))}</span>
                        <label><input type="radio" name="ld_keep" value="${Number(data.to.id)}" checked> ${esc(data.to.name)}</label>
                        <label><input type="radio" name="ld_keep" value="${Number(data.from.id)}"> ${esc(data.from.name)}</label></fieldset>
                    <div><b>${esc(i18n('Ce qui passe au lieu gardé'))}</b>${moves.length ? `<ul class="ld-moves">${moves.map(([t, n]) => `<li>${esc(i18n(TABLES[t] || t))} : ${Number(n)}</li>`).join('')}</ul>` : `<p class="muted">${esc(i18n('Rien : ce doublon n’est relié à rien.'))}</p>`}</div>
                    ${gets.length ? `<p class="ld-why">${esc(i18n('Le lieu gardé reçoit ce qui lui manque : {what}.', {what: gets.join(', ')}))}</p>` : ''}`;
                body.querySelectorAll('[name="ld_keep"]').forEach(r => r.addEventListener('change', () => { if (Number(r.value) !== pair[1]) { pair = [pair[1], pair[0]]; paint(); } }));
                go.disabled = false;
            };
            const finish = v => { done = v; d.close(); };
            d.addEventListener('close', () => { d.remove(); resolve(done); });
            d.querySelectorAll('[data-ld-close]').forEach(b => b.addEventListener('click', () => finish(null)));
            d.querySelector('form').addEventListener('submit', async e => {
                e.preventDefault(); if (!data) return;
                go.disabled = true;
                try {
                    const r = await post('ld_merge', {from: pair[0], to: pair[1]});
                    finish(r);
                    undoAfter(r, i18n('Lieux fusionnés : « {name} » gardé', {name: r.kept?.name || ''}), after);
                    await after?.('merge');
                } catch (err) { go.disabled = false; body.insertAdjacentHTML('afterbegin', `<p class="ld-warn" role="alert">${esc(err.message)}</p>`); }
            });
            d.showModal();
            paint();
        });
    }

    const CONF = {sure: 'sûr', medium: 'probable', low: 'à vérifier'};

    /** Réglages → Modifications groupées : « 📍 Lieux en double probables » */
    async function mountMaintenance(token) {
        const S = A().state;
        const live = () => S && token === S.workspaceToken && S.module === 'maintenance' && S.maintenanceTab === 'bulk';
        if (!live()) return;
        let d; try { d = await get('ld_groups'); } catch (_) { return; }
        const ws = document.querySelector('#workspace');
        if (!live() || !ws) return;
        ws.querySelector('[data-ld-panel]')?.remove();
        const ro = isKiosk();
        const sec = document.createElement('section'); sec.className = 'page ld-panel'; sec.dataset.ldPanel = '';
        const refresh = () => mountMaintenance(token);
        const head = window.LCNDA_UI?.pageHeader ? window.LCNDA_UI.pageHeader({title: i18n('Lieux en double probables'), icon: '📍',
            help: esc(i18n('Le même lieu écrit deux fois, souvent par un import : « Pernay » et « Pernay, Indre-et-Loire, Centre-Val de Loire, France ». Deux communes du même nom dans deux départements ne sont jamais proposées ensemble. « Fusionner » déplace tout vers le lieu gardé ; « ↶ Annuler » remet tout.')),
            primary: ro || !d.safe ? '' : `<button class="button" type="button" data-ld-all>${esc(i18n('Tout fusionner (sûrs seulement) : {n}', {n: d.safe}))}</button>`}) : `<h2>${esc(i18n('Lieux en double probables'))}</h2>`;
        sec.innerHTML = `${head}${d.groups.length ? `<div class="ld-groups">${d.groups.map(g => `<article class="ld-group" data-ld-group="${Number(g.survivor.id)}"><h4>${esc(g.survivor.name)} <small>${esc(where(g.survivor))} · ${esc(i18n('Liens : {n}', {n: g.survivor.links}))}</small></h4>
            <ul class="ld-dups">${g.duplicates.map(x => `<li class="ld-dup"><span class="ld-dup-name">${esc(x.place.name)}<small>${esc(i18n(x.reason_text))} · ${esc(i18n('Liens : {n}', {n: x.place.links}))}</small></span>
                <span class="ld-conf is-${esc(x.confidence)}">${esc(i18n(CONF[x.confidence] || x.confidence))}</span>
                ${ro ? '' : `<span class="ld-dup-acts">${x.empty ? `<button class="button small secondary" type="button" data-ld-empty="${Number(x.place.id)}" data-ld-into="${Number(g.survivor.id)}">${esc(i18n('Supprimer ce lieu vide (doublon)'))}</button>` : ''}<button class="button small secondary" type="button" data-ld-merge="${Number(x.place.id)}" data-ld-into="${Number(g.survivor.id)}">${esc(i18n('Fusionner…'))}</button></span>`}</li>`).join('')}</ul></article>`).join('')}</div>`
            : `${window.LCNDA_APP.empty(i18n('Aucun lieu en double probable.'))}`}`;
        const replace = ws.querySelector('[data-pr-panel]');
        if (replace) replace.after(sec); else ws.append(sec);
        sec.addEventListener('click', async e => {
            const m = e.target.closest('[data-ld-merge]');
            if (m) { open(Number(m.dataset.ldMerge), Number(m.dataset.ldInto), refresh); return; }
            const em = e.target.closest('[data-ld-empty]');
            if (em) { removeEmpty(Number(em.dataset.ldEmpty), Number(em.dataset.ldInto), refresh); return; }
            const all = e.target.closest('[data-ld-all]');
            if (all) {
                all.disabled = true;
                try { const r = await post('ld_merge_safe', {}); undoAfter({...r, moved: r.moved}, i18n('Lieux en double fusionnés : {n}', {n: r.merged}), refresh); await refresh(); }
                catch (err) { all.disabled = false; toast(err.message, 'error'); }
            }
        });
    }

    // ✅ Contrôle de la base : l'alerte « Lieu en double probable » ouvre la fenêtre de fusion
    ext.controleActions = ext.controleActions || [];
    ext.controleActions.push({
        match: a => a.check === 'place-dup' && a.dup,
        html: (a, i) => isKiosk() ? '' : `<button type="button" class="button small secondary" data-ctl-custom="${i}">${esc(i18n('Fusionner…'))}</button>`,
        run: (a, after) => open(Number(a.dup.from), Number(a.dup.to), after),
    });

    ext.placeDup = {hintHtml, open, removeEmpty, mountMaintenance};
})();
