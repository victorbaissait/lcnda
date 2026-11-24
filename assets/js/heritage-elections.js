/* LCNDA — 🗳 Élections d'autrefois (serveur : lib/elections.php ; pack : scripts/elections/build-elections.py).
 * CACHÉ PAR DÉFAUT : rien ne se montre (ni bloc, ni ligne dans la liste des blocs) tant que l'interrupteur de
 * Réglages → 🗳 Élections d'autrefois n'est pas mis. Seule cette page de réglages existe, pour l'allumer.
 *  · Réglages → 🗳 Élections d'autrefois : l'interrupteur, « ⤓ Installer » le pack (par tranches, pause, reprise même
 *    après avoir fermé l'app ; vérifié avant d'être rangé ; ↶ Annuler), le supprimer, la source à citer.
 *  · bloc de fiche « 🗳 Comment votait sa commune » : les élections de sa vie d'adulte, dans la commune où elle vivait
 *    (« À Tulle, 62 % votent républicain »), et pour un profil « Homme / femme politique » les élections trouvées sous
 *    son nom (mandats de député Wikidata, candidats à la présidentielle), à ajouter au profil « À vérifier » (↶ Annuler).
 * Réglage : localStorage['genealogie-elections'] = {on}. Mode consultation 🔒, fiche verrouillée : lecture seule.
 */
(() => {
    'use strict';
    const i18n = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? v[k] : m)));
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP || {};
    const UI = () => window.LCNDA_UI || {};
    const esc = v => (A().escapeHtml ? A().escapeHtml(String(v ?? '')) : String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c])));
    const api = (...a) => A().api(...a);
    const post = (a, b) => api(a, {}, {method: 'POST', body: b}).then(r => r.result || r);
    const KEY = 'genealogie-elections', DL_KEY = 'genealogie-elections-dl';
    const TAB = ['elections', '25l', '🗳 Élections d’autrefois'], BLOCK = ['elections', '🗳 Comment votait sa commune'];
    const settings = () => { try { const s = JSON.parse(localStorage.getItem(KEY) || '{}'); return {on: !!s?.on}; } catch (_) { return {on: false}; } };
    const save = s => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) {} };
    const isOn = () => settings().on;
    const kiosk = () => document.body.classList.contains('is-kiosk') || document.body.classList.contains('ms-on');
    const pctTxt = p => `${String(Math.round(p)).replace('.', ',')} %`;
    const fmtSize = b => (b >= 1e9 ? `${String(Math.round(b / 1e8) / 10).replace('.', ',')} Go` : b >= 1e6 ? `${Math.round(b / 1e6)} Mo` : `${Math.max(1, Math.round(b / 1e3))} Ko`);

    /* ═════════ La page des Réglages existe toujours ; le bloc seulement quand c'est allumé ═════════ */
    function register() {
        const app = A(); if (!app.defaultMaintenanceTabs) return false;
        if (!app.defaultMaintenanceTabs.some(t => t[0] === TAB[0])) app.defaultMaintenanceTabs.push(TAB);
        const blocks = app.defaultPersonBlocks;
        if (Array.isArray(blocks)) {
            const i = blocks.findIndex(b => b[0] === BLOCK[0]);
            if (isOn() && i < 0) blocks.push(BLOCK);
            if (!isOn() && i >= 0) blocks.splice(i, 1);
        }
        if (app.defaultPersonBlockSpans && !app.defaultPersonBlockSpans.elections) app.defaultPersonBlockSpans.elections = '12';
        return true;
    }
    if (!register()) document.addEventListener('DOMContentLoaded', register);

    /* ═════════ Couleurs des familles (les mêmes en clair et en sombre : teintes moyennes) ═════════ */
    const FAM = {extreme_gauche: '#b4232c', gauche: '#e0525a', centre_gauche: '#e8908f', republicains: '#d4553f', centre: '#e3b23c', centre_droit: '#7fa7d9', droite: '#3f6fb5', conservateurs: '#3f5f8f', extreme_droite: '#26365c', divers: '#9a9a9a'};
    const OTHER = ['#7a6a8f', '#4f9d95', '#c75f7a', '#8aa64b', '#d96b43', '#5b9bd5', '#999999'];
    const color = (g, i) => FAM[g.family] || OTHER[i % OTHER.length];
    (function css() {
        if (document.getElementById('el-css')) return;
        const st = document.createElement('style'); st.id = 'el-css';
        st.textContent = `.el-list{display:grid;gap:8px}.el-row{display:grid;grid-template-columns:4.2em 1fr;gap:4px 10px;align-items:start}.el-y{font-weight:700;font-variant-numeric:tabular-nums}
.el-bar{display:flex;height:10px;border-radius:5px;overflow:hidden;background:color-mix(in srgb,currentColor 12%,transparent);margin:3px 0}.el-bar i{display:block;height:100%}
.el-txt small{display:block;opacity:.75}.el-legend{display:flex;flex-wrap:wrap;gap:2px 10px;font-size:.88em}.el-legend b{display:inline-block;width:.8em;height:.8em;border-radius:2px;margin-right:4px;vertical-align:-1px}
.el-src{margin-top:10px;font-size:.82em;opacity:.75}.el-prop{margin-top:12px;padding:10px;border:1px dashed color-mix(in srgb,currentColor 35%,transparent);border-radius:8px}.el-prop-row{display:flex;gap:8px;align-items:center;justify-content:space-between;margin-top:6px}
.el-set .el-data{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:8px 0}.el-prog{display:inline-block;width:160px;height:8px;border-radius:4px;background:color-mix(in srgb,currentColor 15%,transparent);overflow:hidden;vertical-align:middle}.el-prog i{display:block;height:100%;background:var(--accent,#3f6fb5)}`;
        (document.head || document.documentElement).appendChild(st);
    })();

    /* ═════════ Le bloc « 🗳 Comment votait sa commune » ═════════ */
    ext.personBlocks = ext.personBlocks || {};
    ext.personBlocks.elections = (index, detail, opt = {}) => {
        const p = detail?.person;
        if (!isOn() || !p?.id || p.kind === 'animal') return '';
        const locked = Number(p.is_locked) === 1 || kiosk();
        return A().card(index, BLOCK[1], '', `<div class="el-host" data-el-person="${Number(p.id)}" data-el-locked="${locked ? 1 : 0}">${UI().skeleton ? UI().skeleton(3) : ''}</div>`, 'span-12');
    };
    const cache = new Map();
    const verb = g => g.phrase || `pour ${g.label}`;
    function rowHtml(el, female) {
        const top = el.groups[0];
        const bar = el.groups.map((g, i) => `<i style="width:${Math.max(0, g.pct)}%;background:${color(g, i)}" title="${esc(`${g.label} : ${pctTxt(g.pct)}`)}"></i>`).join('');
        const legend = el.groups.slice(0, 5).map((g, i) => `<span><b style="background:${color(g, i)}"></b>${esc(g.label)} ${esc(pctTxt(g.pct))}</span>`).join('');
        const phrase = top ? i18n('À {c}, {p} votent {v} en {y}.', {c: el.commune.name, p: pctTxt(top.pct), v: verb(top), y: String(el.year)}) : '';
        const note = !el.could_vote && female ? ` ${i18n('Elle ne votait pas encore : les femmes votent depuis 1945.')}` : '';
        return `<div class="el-row"><span class="el-y">${el.year}</span><div class="el-txt"><b>${esc(el.label)}</b> · ${esc(el.commune.name)}${el.age != null ? ` <small>${esc(i18n('à {n} ans', {n: String(el.age)}))}</small>` : ''}
            <div class="el-bar" role="img" aria-label="${esc(phrase)}">${bar}</div><div class="el-legend">${legend}</div><small>${esc(phrase + note)}</small></div></div>`;
    }
    async function fill(host) {
        const pid = Number(host.dataset.elPerson), locked = host.dataset.elLocked === '1';
        let d = cache.get(pid);
        if (!d) { try { d = await api('elections_person', {id: pid}); } catch (e) { host.innerHTML = A().empty ? A().empty(e.message, {icon: '⛔'}) : esc(e.message); return; } cache.set(pid, d); }
        if (!host.isConnected) return;
        if (!d.installed) { host.innerHTML = A().empty(i18n('Les résultats des élections ne sont pas installés.'), {icon: '🗳', action: {label: i18n('⤓ Installer les données électorales'), attrs: 'data-el-goset'}}); return; }
        const female = d.gender === 'female';
        let body;
        if (!d.elections.length) body = A().empty(d.no_place ? i18n('Aucun événement daté avec un lieu en France : place sa commune pour voir comment on y votait.') : i18n('Aucune élection connue dans sa commune pendant sa vie d’adulte.'), {icon: '🗳'});
        else {
            const all = host.dataset.elAll === '1', list = all ? d.elections : d.elections.slice(0, 12);
            body = `<div class="el-list">${list.map(el => rowHtml(el, female)).join('')}</div>${d.elections.length > list.length ? `<button type="button" class="link-button" data-el-all>${esc(i18n('Tout voir ({n})', {n: String(d.elections.length)}))}</button>` : ''}`;
        }
        const props = (d.proposals || []).filter(x => !x.added);
        const propHtml = props.length ? `<div class="el-prop"><b>${esc(i18n('Pour son profil « Homme / femme politique »'))}</b><small class="muted"> · ${esc(i18n('trouvé sous son nom, à vérifier'))}</small>
            ${props.map(x => `<div class="el-prop-row"><span>🗳 ${esc(x.title)}${x.name ? ` <small class="muted">(${esc(x.name)}${x.sycomore ? ` · Sycomore n° ${esc(x.sycomore)}` : ''})</small>` : ''}</span>${locked ? '' : `<button type="button" class="button small secondary" data-el-add="${esc(x.key)}">${esc(i18n('＋ Ajouter au profil (à vérifier)'))}</button>`}</div>`).join('')}</div>` : '';
        const card = host.closest('.card'), h = card?.querySelector('.card-title h3');
        if (h && !h.querySelector('small') && d.elections.length) h.insertAdjacentHTML('beforeend', ` <small>(${d.elections.length})</small>`);
        host.innerHTML = `${body}${propHtml}<p class="el-src">${esc(i18n('Source : {c}', {c: d.citation || ''}))}${d.fixture ? ` · ${esc(i18n('données d’essai, inventées'))}` : ''}</p>`;
    }
    async function addProposal(host, key) {
        const pid = Number(host.dataset.elPerson), d = cache.get(pid), x = (d?.proposals || []).find(y => y.key === key);
        if (!x) return;
        let r;
        try { r = await post('art_write', {op: 'save_item', person_id: pid, kind: 'pol_election', data: x.data}); } catch (e) { return A().toast(e.message, 'error'); }
        x.added = Number(r.id) || 0; fill(host);
        const undo = async () => { try { await post('art_write', {op: 'delete_item', person_id: pid, id: x.added}); } catch (e) { A().toast(e.message, 'error'); } x.added = 0; document.querySelectorAll(`[data-el-person="${pid}"]`).forEach(fill); };
        A().undoToast ? A().undoToast(i18n('🗳 Ajouté au profil, à vérifier : {t}', {t: x.data.title}), {undo}) : A().toast(i18n('🗳 Ajouté au profil, à vérifier : {t}', {t: x.data.title}));
    }
    document.addEventListener('click', e => {
        const add = e.target.closest?.('[data-el-add]'); if (add) { const host = add.closest('[data-el-person]'); if (host) addProposal(host, add.dataset.elAdd); return; }
        const all = e.target.closest?.('[data-el-all]'); if (all) { const host = all.closest('[data-el-person]'); if (host) { host.dataset.elAll = '1'; fill(host); } return; }
        if (e.target.closest?.('[data-el-goset]')) openSettings();
    });
    (ext.afterPerson = ext.afterPerson || []).push(detail => {
        if (!isOn()) return;
        cache.delete(Number(detail?.person?.id) || 0);
        document.querySelectorAll('#workspace [data-el-person]').forEach(fill);
    });
    function openSettings() { const st = A().state; if (!st) return; st.maintenanceTab = 'elections'; A().persistUiState?.(); A().setModule?.('maintenance'); }

    /* ═════════ Réglages → 🗳 Élections d'autrefois : l'interrupteur et ⤓ Installer ═════════ */
    const DL = {online: undefined, err: '', run: null, paused: null};
    const dlSaved = () => { try { return localStorage.getItem(DL_KEY) || ''; } catch (_) { return ''; } };
    const dlRemember = id => { try { localStorage.setItem(DL_KEY, id); } catch (_) {} };
    const dlForget = () => { try { localStorage.removeItem(DL_KEY); } catch (_) {} };
    const pct = (a, b) => (b ? Math.floor(a / b * 100) : 0);
    let redraw = () => {}, refresh = async () => {};
    function dlActs(st) {
        if (st.installed) return `<button type="button" class="button small secondary" data-el-remove>🗑 ${esc(i18n('Supprimer les données'))}</button>`;
        if (DL.run) return `<span data-el-dl-box><span class="el-prog"><i style="width:${pct(DL.run.received, DL.run.size)}%"></i></span> <small data-el-dl-txt>${esc(`${pct(DL.run.received, DL.run.size)} % · ${fmtSize(DL.run.received)} ${i18n('sur')} ${fmtSize(DL.run.size)}`)}</small> <button type="button" class="button small secondary" data-el-pause>⏸ ${esc(i18n('Pause'))}</button></span>`;
        if (DL.paused) return `<span class="el-prog"><i style="width:${pct(DL.paused.received, DL.paused.size)}%"></i></span> <small>${esc(i18n('En pause : {p} %', {p: String(pct(DL.paused.received, DL.paused.size))}))}</small> <button type="button" class="button small" data-el-dl>▶ ${esc(i18n('Reprendre'))}</button> <button type="button" class="button small secondary" data-el-cancel>✕ ${esc(i18n('Abandonner'))}</button>`;
        if (DL.online === undefined) return `<small class="muted">${esc(i18n('Recherche des données en ligne…'))}</small>`;
        if (!DL.online) return `<small class="muted" title="${esc(DL.err)}">${esc(DL.err ? i18n('Pas de connexion aux données en ligne.') : i18n('Pas encore en ligne.'))}</small>`;
        return `<button type="button" class="button small" data-el-dl>⤓ ${esc(i18n('Installer ({s})', {s: fmtSize(DL.online.size)}))}</button>`;
    }
    function dlPaint() { const box = document.querySelector('[data-el-dl-box]'); if (!DL.run || !box) return; box.querySelector('.el-prog i').style.width = `${pct(DL.run.received, DL.run.size)}%`; box.querySelector('[data-el-dl-txt]').textContent = `${pct(DL.run.received, DL.run.size)} % · ${fmtSize(DL.run.received)} ${i18n('sur')} ${fmtSize(DL.run.size)}`; }
    async function dlRun() {
        if (DL.run) return;
        let id = DL.paused?.id || dlSaved(), run;
        try {
            if (id) { const r = await api('elections_dl_resume', {id}); if (!r.exists) id = ''; else run = {id, received: r.received, size: r.size}; }
            if (!id) { const r = await post('elections_dl_start', {}); id = r.id; run = {id, received: 0, size: r.size}; }
        } catch (x) { return A().toast(x.message, 'error'); }
        dlRemember(id); DL.paused = null; DL.run = {...run, stop: false}; redraw();
        let fails = 0;
        while (!DL.run.stop) {
            try { const r = await post('elections_dl_step', {id}); DL.run.received = r.received; fails = 0; dlPaint(); if (r.done) break; }
            catch (x) { if (++fails >= 3) { A().toast(i18n('Téléchargement arrêté : {e}', {e: x.message}), 'error'); DL.paused = {id, received: DL.run.received, size: DL.run.size}; DL.run = null; return redraw(); } await new Promise(r => setTimeout(r, 1500 * fails)); }
        }
        if (DL.run.stop) { DL.paused = {id, received: DL.run.received, size: DL.run.size}; DL.run = null; return redraw(); }
        const t = document.querySelector('[data-el-dl-txt]'); if (t) t.textContent = i18n('Vérification et installation…');
        try {
            const r = await post('elections_dl_finish', {id}); dlForget(); DL.run = null; cache.clear();
            await refresh();
            A().undoToast?.(i18n('🗳 Données électorales installées ({n} élections).', {n: String(r.elections || 0)}), {undo: async () => { await post('elections_pack_undo', {}); cache.clear(); await refresh(); }});
        } catch (x) { dlForget(); DL.run = null; redraw(); A().toast(x.message, 'error'); }
    }
    async function dlCancel() { const id = DL.paused?.id || dlSaved(); DL.paused = null; dlForget(); if (id) { try { await post('elections_dl_cancel', {id}); } catch (_) {} } redraw(); }

    ext.maintenance = ext.maintenance || {};
    ext.maintenance.elections = async token => {
        const ws = document.getElementById('workspace'); if (!ws) return;
        let st = {installed: false};
        try { st = await api('elections_status'); } catch (_) {}
        if (token !== undefined && A().state && token !== A().state.workspaceToken) return;
        const draw = () => {
            const s = settings(), K = UI().toggleHtml || ((l, o) => `<label class="ui-toggle"><input type="checkbox" ${o.attrs} ${o.checked ? 'checked' : ''}><i></i>${esc(l)}</label>`);
            const desc = st.installed ? `${A().plural ? A().plural(st.elections, 'élection') : st.elections + ' élections'} · ${st.years?.a || ''} → ${st.years?.b || ''} · ${A().plural ? A().plural(st.communes, 'commune') : st.communes} · ${fmtSize(st.size || 0)}${st.built ? ` · ${i18n('fabriqué le {d}', {d: st.built})}` : ''}${st.fixture ? ` · ${i18n('données d’essai, inventées')}` : ''}`
                : i18n('Résultats des législatives (1848 → 2022) et des présidentielles, commune par commune, et les députés (Wikidata).');
            ws.innerHTML = `<section class="page el-set">${UI().pageHeader ? UI().pageHeader({title: 'Élections d’autrefois', icon: '🗳', where: 'Réglages · Données', help: 'Comment votait la commune de tes ancêtres. Éteint au départ : rien ne se montre tant que ce n’est pas allumé.'}) : `<h2>🗳 ${esc(i18n('Élections d’autrefois'))}</h2>`}
                <section class="card"><h3>${esc(i18n('Montrer'))}</h3>
                    ${K(i18n('🗳 Élections d’autrefois'), {checked: s.on, attrs: 'data-el-on', sub: i18n('Allumé : le bloc « 🗳 Comment votait sa commune » sur les fiches, et les élections à ajouter au profil « Homme / femme politique ».')})}
                </section>
                <section class="card"><h3>${esc(i18n('Les données'))}</h3>
                    <div class="el-data"><span><b>${esc(i18n('Résultats par commune'))}</b><br><small>${esc(desc)}</small></span>${UI().badge ? UI().badge(i18n(st.installed ? 'Installé' : 'Pas installé'), st.installed ? 'green' : 'grey') : ''}<span>${dlActs(st)}</span></div>
                    ${UI().notice ? UI().notice('info', i18n('Le téléchargement se fait une fois ; ensuite l’app n’a plus besoin d’Internet. Rien n’est envoyé.')) : ''}
                    <p class="el-src"><b>${esc(i18n('Sources à citer'))}</b> : Julia Cagé et Thomas Piketty (2023), <i>Une histoire du conflit politique. Élections et inégalités sociales en France, 1789-2022</i>, Paris, Le Seuil ; ${esc(i18n('données'))} <a href="https://unehistoireduconflitpolitique.fr/telecharger.html" target="_blank" rel="noopener">unehistoireduconflitpolitique.fr</a> (${esc(i18n('téléchargement libre, en citant la source'))}). ${esc(i18n('Députés : Wikidata (CC0), avec le numéro de leur fiche Sycomore de l’Assemblée nationale.'))}</p>
                </section></section>`;
        };
        draw();
        redraw = () => { if (ws.querySelector('.el-set')) draw(); };
        const loadInfo = () => api('elections_dl_info').then(r => { DL.online = r.pack || null; DL.err = r.error || ''; }).catch(x => { DL.online = null; DL.err = x.message; }).finally(async () => {
            const id = dlSaved(); if (id && !DL.run) { try { const r = await api('elections_dl_resume', {id}); if (r.exists) DL.paused = {id, received: r.received, size: r.size}; else dlForget(); } catch (_) {} }
            redraw(); });
        refresh = async () => { try { st = await api('elections_status'); } catch (_) {} redraw(); if (!st.installed && DL.online === undefined) loadInfo(); };
        if (!st.installed) loadInfo();
        if (ws.__elBound !== true) {
            ws.__elBound = true;
            ws.addEventListener('change', e => {
                const t = e.target.closest?.('[data-el-on]'); if (!t || !ws.querySelector('.el-set')) return;
                save({...settings(), on: !!t.checked}); register(); cache.clear();
                const on = !!t.checked;
                A().undoToast?.(on ? i18n('🗳 Élections d’autrefois allumées : le bloc apparaît sur les fiches.') : i18n('🗳 Élections d’autrefois éteintes.'), {undo: () => { save({...settings(), on: !on}); register(); draw(); }});
            });
            ws.addEventListener('click', async e => {
                if (!ws.querySelector('.el-set')) return;
                if (e.target.closest('[data-el-dl]')) return dlRun();
                if (e.target.closest('[data-el-pause]')) { if (DL.run) DL.run.stop = true; return; }
                if (e.target.closest('[data-el-cancel]')) return dlCancel();
                if (e.target.closest('[data-el-remove]')) {
                    try { await post('elections_pack_remove', {}); } catch (x) { return A().toast(x.message, 'error'); }
                    cache.clear(); await refresh();
                    A().undoToast?.(i18n('🗑 Données électorales supprimées'), {undo: async () => { await post('elections_pack_restore', {}); await refresh(); }});
                }
            });
        }
    };
    ext.elections = {settings, isOn, register, openSettings, run: dlRun, state: DL, rowHtml};
})();
