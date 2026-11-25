/* LCNDA — ⭐ Parents célèbres (serveur : lib/parents_celebres.php ; style : assets/css/pistes-branches-celebres.css).
 * Un lien de parenté ou d'alliance avec un personnage connu, trouvé en suivant les liens de famille de Wikidata (CC0) depuis les
 * fiches de l'arbre reliées à Wikidata, et (si tu l'allumes) le « Connection Finder » de WikiTree. Chaque maillon a sa source
 * (↗ fiche, ↗ Wikidata, ↗ WikiTree) et la mention « à vérifier : ces arbres sont collaboratifs ».
 * Où : Listes → « ⭐ Parents célèbres » (chercher, proposer des fiches Wikidata à valider, la liste, les chemins), une ligne sur la
 * fiche (« ⭐ Parent éloigné de Victor Hugo, 9 degrés »), Réglages → « 🔎 Pistes, branches, célèbres » (localStorage
 * « genealogie-parents-celebres » : bloc de la fiche, WikiTree). Pour d'autres fichiers : LCNDA_EXT.parentsCelebres.
 * Essai : tests/test-parents-celebres.js
 */
(function (root) {
    'use strict';
    const T = (s, v) => { const w = v && Object.fromEntries(Object.entries(v).map(([k, x]) => [k, typeof x === 'number' ? String(x) : x]));
        return root.LCNDA_I18N ? root.LCNDA_I18N.t(s, w) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (w && w[k] != null ? w[k] : m)); };
    const A = () => root.LCNDA_APP || {};
    const UI = () => root.LCNDA_UI || {};
    const ext = root.LCNDA_EXT = root.LCNDA_EXT || {};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const get = (a, q) => A().api(a, q);
    const post = (a, b) => A().api(a, {}, {method: 'POST', body: b}).then(r => (r && r.result !== undefined ? r.result : r));
    const fmt = n => Number(n || 0).toLocaleString('fr-FR');
    const KEY = 'genealogie-parents-celebres';
    const LIST = 'data_celebres', BLOCK = ['celebres', '⭐ Parents célèbres'];
    const DEF = {block: true, wikitree: false};
    function settings() { let s = {}; try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) { s = {}; } return {...DEF, ...s}; }
    const link = (url, label) => (url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>` : esc(label));
    const emptyLine = (text, icon = '⭐', hint = '') => (A().emptyState ? A().emptyState({text, icon, hint, size: 'small'}) : `<p class="muted">${esc(text)}</p>`);
    const goList = () => { const st = A().state; if (!st) return; st.listType = LIST; A().setModule?.('listes'); };
    const WARN = () => `<p class="pc-warn">⚠️ ${esc(T('À vérifier : ces arbres sont collaboratifs (Wikidata, WikiTree) ; un lien peut être faux.'))}</p>`;
    const years = r => (r.born || r.died ? ` (${r.born ?? ''}–${r.died ?? ''})` : '');

    /* ═════════ les mots d'un chemin ═════════ */
    const TREE_REL = {father: 'son père', mother: 'sa mère', parent: 'son parent', son: 'son fils', daughter: 'sa fille', child: 'son enfant', husband: 'son mari', wife: 'sa femme', spouse: 'son conjoint'};
    const WD_REL = {father: ['son père', 'son père'], mother: ['sa mère', 'sa mère'], spouse: ['son mari', 'sa femme', 'son conjoint'], child: ['son fils', 'sa fille', 'son enfant'], sibling: ['son frère', 'sa sœur', 'son frère ou sa sœur']};
    const wdWord = h => { const w = WD_REL[h.rel] || [h.rel]; return T(w.length === 2 ? w[0] : h.gender === 'male' ? w[0] : h.gender === 'female' ? w[1] : w[2]); };
    function headline(r) {
        if (!r.degrees) return T('{n} est lui-même dans Wikipédia', {n: r.label});
        return r.by_marriage ? T('Allié(e) de {n}, {d} degrés', {n: r.label, d: r.degrees}) : T('Parent éloigné de {n}, {d} degrés', {n: r.label, d: r.degrees});
    }
    function pathHtml(r) {
        const steps = [`<li><b>${esc(r.from.name)}</b></li>`];
        r.tree.forEach(t => steps.push(`<li><span class="pc-rel">${esc(T(TREE_REL[t.rel] || t.rel))}</span> <button type="button" class="pst-who" data-pc-person="${t.id}">${esc(t.name)}</button> <small class="pc-src">${esc(T('ta fiche'))}</small></li>`));
        if (r.wikidata.length || r.tree.length) steps.push(`<li class="pc-bridge">${esc(T('= {n} sur Wikidata', {n: r.via.name}))} ${link(r.via.url, `↗ ${r.via.q}`)}</li>`);
        r.wikidata.forEach(h => steps.push(`<li><span class="pc-rel">${esc(wdWord(h))}</span> <b>${esc(h.label)}</b>${esc(years(h))} <small class="pc-src">${link(h.from_url, T('↗ Wikidata ({p})', {p: h.prop}))}</small></li>`));
        return `<ol class="pc-path">${steps.join('')}</ol>`;
    }
    function resultHtml(r, {open = false} = {}) {
        return `<div class="pc-result"><p class="cplus-lead">⭐ ${esc(headline(r))}${r.desc ? ` <small class="muted">— ${esc(r.desc)}</small>` : ''}</p>
            <details class="cplus-more" ${open ? 'open' : ''}><summary>${esc(T('▸ le chemin ({t} dans ton arbre, {w} dans Wikidata)', {t: r.tree_hops, w: r.wd_hops}))}</summary>${pathHtml(r)}</details>
            <p class="cplus-src">${esc(T('Source :'))} Wikidata — CC0 1.0 · ${link(r.url, T('↗ {n} sur Wikidata', {n: r.label}))}${r.wiki_url ? ` · ${link(r.wiki_url, T('↗ Wikipédia'))}` : ''}</p></div>`;
    }
    function wtHtml(w) {
        if (w.length === null || w.length === undefined) return `<p class="muted">🌲 ${esc(T('WikiTree : pas de chemin trouvé vers {n}.', {n: w.label}))} ${link(w.finder_url, T('↗ Connection Finder'))}</p>`;
        const steps = w.path.map(p => `<li>${p.rel ? `<span class="pc-rel">${esc(p.rel)}</span> ` : ''}${p.wt ? link(`https://www.wikitree.com/wiki/${encodeURIComponent(p.wt)}`, p.name) : esc(p.hidden ? T('(fiche privée)') : p.name)}${p.born || p.died ? ` <small>(${esc(p.born)}–${esc(p.died)})</small>` : ''}</li>`).join('');
        return `<div class="pc-result"><p class="cplus-lead">🌲 ${esc(T('WikiTree : relié(e) à {n}, {d} degrés', {n: w.label, d: w.length}))}</p><details class="cplus-more"><summary>${esc(T('▸ le chemin'))}</summary><ol class="pc-path">${steps}</ol></details>
            <p class="cplus-src">${esc(T('Source :'))} WikiTree — ${link(w.finder_url, T('↗ Connection Finder'))}</p></div>`;
    }

    /* ═════════ la fiche ═════════ */
    ext.personBlocks = ext.personBlocks || {};
    ext.personBlocks[BLOCK[0]] = (index, detail) => {
        const p = detail?.person; if (!p?.id || p.kind === 'animal' || !settings().block) return '';
        return A().card(index, T(BLOCK[1]), '', `<div class="pc-block" data-pc-person-block="${Number(p.id)}"></div>`, 'span-12', `<button type="button" class="button small secondary" data-pc-go>${esc(T('Tous les parents célèbres'))}</button>`).replace(/^(\s*<section class="card[^"]*")/, '$1 hidden');
    };
    async function fillPerson(host) {
        const id = Number(host.dataset.pcPersonBlock);
        let r; try { r = await get('celeb_person', {id}); } catch (_) { return; }
        if (!host.isConnected) return;
        const s = settings();
        const wtIds = r.wikitree_ids || [];
        const parts = [];
        if (r.results.length) parts.push(resultHtml(r.results[0]) + (r.results.length > 1 ? `<details class="cplus-more"><summary>${esc(T('▸ plus ({n})', {n: r.results.length - 1}))}</summary>${r.results.slice(1).map(x => resultHtml(x)).join('')}</details>` : ''));
        if (r.wikitree.some(w => w.length)) parts.push(r.wikitree.filter(w => w.length).map(wtHtml).join(''));
        if (s.wikitree && wtIds.length && r.can_send) parts.push(`<p class="pc-wt"><button type="button" class="button small secondary" data-pc-wt="${id}">${esc(T('🌲 Chercher dans WikiTree (Connection Finder)'))}</button> <small class="muted">${esc(T('identifiant {w}', {w: wtIds[0].wt}))} ${link(wtIds[0].url, '↗')}</small></p>`);
        else if (s.wikitree && r.can_send && !wtIds.length) parts.push(`<form class="pc-wtform" data-pc-wtform="${id}"><label>🌲 ${esc(T('Son identifiant WikiTree'))} <input name="wt" placeholder="Hugo-215" maxlength="80"></label> <button type="submit" class="button small secondary">${esc(T('Enregistrer'))}</button></form>`);
        else if (wtIds.length) parts.push(`<p class="muted"><small>🌲 ${link(`https://www.wikitree.com/index.php?title=Special:Connection&action=connect&person1Name=${encodeURIComponent(wtIds[0].wt)}`, T('↗ Chercher toi-même ses liens dans WikiTree (Connection Finder)'))}</small></p>`);
        host.innerHTML = parts.length ? parts.join('') + (r.results.length || r.wikitree.some(w => w.length) ? WARN() : '') : '';
        const card = host.closest('section.card'); if (card) card.hidden = !parts.length;
    }
    document.addEventListener('submit', async e => {
        const f = e.target.closest?.('[data-pc-wtform]'); if (!f) return;
        e.preventDefault();
        const pid = Number(f.dataset.pcWtform);
        try {
            const r = await post('celeb_wikitree_set', {person_id: pid, wt: f.elements.wt.value});
            A().undoToast?.(T('Identifiant WikiTree enregistré : {w}', {w: r.wt}), {undo: async () => { await post('celeb_wikitree_set', {person_id: pid, wt: r.before || ''}); document.querySelectorAll(`[data-pc-person-block="${pid}"]`).forEach(h => fillPerson(h)); }});
            document.querySelectorAll(`[data-pc-person-block="${pid}"]`).forEach(h => fillPerson(h));
        } catch (err) { A().toast?.(err.message, 'error'); }
    });
    (ext.afterPerson = ext.afterPerson || []).push(() => { document.querySelectorAll('#workspace [data-pc-person-block]:not([data-pc-done])').forEach(h => { h.dataset.pcDone = '1'; fillPerson(h); }); });
    async function wikitreeCheck(pid, btn) {
        let about; try { about = await get('celeb_about'); } catch (e) { return A().toast?.(e.message, 'error'); }
        const targets = about.targets || [];
        let found = 0;
        for (let i = 0; i < targets.length; i++) {
            if (btn) btn.textContent = T('🌲 WikiTree : {i} / {n}…', {i: i + 1, n: targets.length});
            try { const r = await post('celeb_wikitree_check', {person_id: pid, target: targets[i].wt}); if (r.result) found++; if (r.net) await new Promise(res => setTimeout(res, 1200)); }
            catch (e) { A().toast?.(e.message, 'error'); break; }
        }
        A().toast?.(found ? T('WikiTree : {n} chemins trouvés.', {n: found}) : T('WikiTree : aucun chemin trouvé vers ces célébrités.'));
        document.querySelectorAll(`[data-pc-person-block="${pid}"]`).forEach(h => fillPerson(h));
    }

    /* ═════════ la recherche pas à pas ═════════ */
    const RUN = {job: null, on: false, timer: 0, busy: false};
    function jobLine(j) {
        if (!j) return '';
        const c = j.counts || {}, pct = j.total && (j.label || '').startsWith(T('Propositions')) ? Math.round(100 * j.pos / j.total) : (j.status === 'done' ? 100 : Math.min(95, Math.round(100 * (c.done || 0) / Math.max(1, c.nodes || 1))));
        const st = {running: T('en cours'), paused: T('en pause'), done: T('finie'), stopped: T('arrêtée')}[j.status] || j.status;
        return `<div class="pst-job is-${esc(j.status)}"><div class="pst-job-top"><b>${esc(j.label)}</b> <span class="ui-badge is-grey">${esc(st)}</span><span class="pst-job-acts">${j.status === 'running' ? `<button type="button" class="button small secondary" data-pc-ctl="pause">${esc(T('⏸ Pause'))}</button>` : j.status === 'paused' ? `<button type="button" class="button small" data-pc-ctl="resume">${esc(T('▶ Reprendre'))}</button>` : ''}${['running', 'paused'].includes(j.status) ? `<button type="button" class="button small secondary" data-pc-ctl="stop">${esc(T('■ Arrêter'))}</button>` : ''}</span></div>
            <div class="pst-bar"><span style="width:${pct}%"></span></div><small class="muted">${esc(T('{d} personnes lues · {f} trouvées · {n} questions à Wikidata', {d: fmt(c.done), f: fmt(c.found), n: fmt(c.net)}))}</small>${j.message ? `<p class="pst-msg">${esc(j.message)}</p>` : ''}</div>`;
    }
    const paint = () => document.querySelectorAll('[data-pc-jobhost]').forEach(h => { h.innerHTML = jobLine(RUN.job); });
    async function tick() {
        clearTimeout(RUN.timer);
        if (!RUN.on || !RUN.job || RUN.busy) return;
        RUN.busy = true; let wait = 1000;
        try { const r = await post('celeb_step', {id: RUN.job.id}); RUN.job = r.job; wait = Math.max(150, Number(r.wait_ms) || 0); if (r.job.status !== 'running') { RUN.on = false; redraw(); } }
        catch (e) { wait = 15000; RUN.job = {...RUN.job, message: e.message}; }
        finally { RUN.busy = false; }
        paint();
        if (RUN.on) RUN.timer = setTimeout(tick, wait);
    }
    async function startJob(action, body) { const r = await post(action, body); RUN.job = r.job; RUN.on = true; paint(); tick(); return r.job; }
    const redraw = () => document.querySelectorAll('[data-pc-host]').forEach(h => h.__pcRedraw?.());

    /* ═════════ Listes → ⭐ Parents célèbres ═════════ */
    async function renderList(token) {
        const S = A().state, ok = () => token === S.workspaceToken && S.module === 'listes' && S.listType === LIST, ws = document.getElementById('workspace');
        ws.innerHTML = `<section class="page pc-page">${UI().spinner ? UI().spinner(T('On cherche les parents célèbres…')) : ''}</section>`;
        const head = UI().pageHeader ? UI().pageHeader({icon: '⭐', title: T('Parents célèbres'), help: esc(T('Les personnages connus liés à ta famille, d’après les liens de famille de Wikidata (et de WikiTree si tu l’allumes). Chaque maillon a sa source.'))}) : `<h2>${esc(T('⭐ Parents célèbres'))}</h2>`;
        ws.innerHTML = `<section class="page pc-page" data-pc-host>${head}
            <section class="maintenance-panel pst-launch"><h3>${esc(T('Chercher'))}</h3>
                <div class="pst-launch-row"><label>${esc(T('Pour'))} <select data-pc-scope><option value="all">${esc(T('Tout l’arbre'))}</option><option value="sosa">${esc(T('Mes ancêtres (Sosa)'))}</option></select></label>
                <button type="button" class="button" data-pc-start>${esc(T('⭐ Chercher les parents célèbres'))}</button>
                <button type="button" class="button secondary" data-pc-propose>${esc(T('🔎 Proposer des fiches Wikidata pour mes ancêtres'))}</button></div>
                <p class="muted"><small>${esc(T('On part des fiches déjà reliées à Wikidata (un identifiant « Q… » dans Références externes). « Proposer » cherche, pour tes ancêtres décédés nés avant 1900, une fiche Wikidata au même nom, même prénom et mêmes années : à toi de dire « ✓ C’est lui ». Rien n’est envoyé pour une personne vivante ou une fiche confidentielle.'))}</small></p>
                <div data-pc-jobhost></div></section>
            <div data-pc-props></div><div data-pc-results></div><div data-pc-linked></div></section>`;
        const host = ws.querySelector('[data-pc-host]');
        const draw = async () => {
            let d; try { d = await get('celeb_list'); } catch (e) { if (host.isConnected) host.querySelector('[data-pc-results]').innerHTML = emptyLine(e.message); return; }
            if (!host.isConnected) return;
            if (!RUN.on) RUN.job = d.job; paint();
            if (RUN.job?.status === 'running' && !RUN.on) { RUN.on = true; tick(); }
            host.querySelector('[data-pc-props]').innerHTML = d.proposals.length ? `<section class="maintenance-panel"><h3>${esc(T('Fiches Wikidata proposées ({n}) — à vérifier', {n: d.proposals.length}))}</h3><div class="ctl-list">${d.proposals.map(p => `<article class="ctl-row is-yellow"><div class="ctl-row-main"><h3><button type="button" class="pst-who" data-pc-person="${p.person_id}"><b>${esc(p.person)}</b></button> = ${link(p.url, `${p.label} ↗`)} <span class="pst-score ${p.score >= 90 ? 'is-high' : 'is-mid'}">${p.score} %</span></h3>
                <div class="ctl-checks">${p.why.map(([k, t]) => `<span class="ctl-check is-${k === 'ok' ? 'ok' : k === 'no' ? 'no' : 'q'}">${k === 'ok' ? '✓' : k === 'no' ? '✗' : '?'} ${esc(t)}</span>`).join('')}</div></div>
                <div class="ctl-row-acts"><button type="button" class="button small" data-pc-yes="${p.person_id}|${esc(p.q)}">${esc(T('✓ C’est lui'))}</button><button type="button" class="button small secondary" data-pc-no="${p.person_id}|${esc(p.q)}">${esc(T('✗ Pas lui'))}</button></div></article>`).join('')}</div></section>` : '';
            host.querySelector('[data-pc-results]').innerHTML = d.rows.length ? `<section class="maintenance-panel"><h3>${esc(T('⭐ {n} personnages connus liés à ta famille', {n: d.rows.length}))}</h3>
                ${d.rows.map(r => `<article class="pc-row" data-pc-q="${esc(r.q)}">${r.not_linked ? `<p class="cplus-lead">⭐ ${esc(T('{n} : lié(e) à {v}, une fiche que rien ne relie à {r}', {n: r.label, v: r.via.name, r: d.root?.name || ''}))}</p>${pathHtml(r)}` : resultHtml(r)}</article>`).join('')}${WARN()}</section>`
                : emptyLine(d.linked.length ? T('Aucun personnage connu trouvé pour l’instant') : T('Aucune fiche reliée à Wikidata'), '⭐', d.linked.length ? T('Lance « ⭐ Chercher les parents célèbres ».') : T('Commence par « 🔎 Proposer des fiches Wikidata pour mes ancêtres », ou ajoute un identifiant Q sur une fiche (Références externes).'));
            host.querySelector('[data-pc-linked]').innerHTML = d.linked.length ? `<details class="maintenance-panel"><summary>${esc(T('{n} fiches reliées à Wikidata (le point de départ)', {n: d.linked.length}))}</summary><ul class="pc-linked">${d.linked.map(l => `<li><button type="button" class="pst-who" data-pc-person="${l.id}">${esc(l.name)}</button> ${link(l.url, `↗ ${l.q}`)}${l.found ? ` · ${esc(T('{n} célébrités', {n: l.found}))}` : ''}</li>`).join('')}</ul></details>` : '';
        };
        host.__pcRedraw = draw;
        host.addEventListener('click', async e => {
            const b = e.target.closest('button'); if (!b) return;
            const d = b.dataset, scope = host.querySelector('[data-pc-scope]').value;
            try {
                if (d.pcStart !== undefined) await startJob('celeb_start', {scope});
                else if (d.pcPropose !== undefined) await startJob('celeb_propose_start', {scope: scope === 'all' ? 'all' : 'sosa'});
                else if (d.pcYes) { const [pid, q] = d.pcYes.split('|'); const r = await post('celeb_link_ok', {person_id: Number(pid), q}); A().undoToast?.(T('Fiche reliée à Wikidata ({q}).', {q}), {undo: async () => { await post('celeb_link_undo', {person_id: Number(pid), q, before: r.before}); draw(); }}); draw(); }
                else if (d.pcNo) { const [pid, q] = d.pcNo.split('|'); await post('celeb_link_no', {person_id: Number(pid), q}); A().undoToast?.(T('Proposition écartée : elle ne reviendra pas.'), {undo: async () => { await post('celeb_link_unno', {person_id: Number(pid), q}); draw(); }}); draw(); }
            } catch (err) { A().toast?.(err.message, 'error'); }
        });
        if (!ok()) return;
        draw();
    }
    document.addEventListener('click', e => {
        const b = e.target.closest?.('[data-pc-person], [data-pc-go], [data-pc-ctl], [data-pc-wt]'); if (!b) return;
        const d = b.dataset;
        if (d.pcPerson) A().openPersonById?.(Number(d.pcPerson));
        else if (d.pcGo !== undefined) goList();
        else if (d.pcWt) { b.disabled = true; wikitreeCheck(Number(d.pcWt), b).finally(() => { b.disabled = false; }); }
        else if (d.pcCtl && RUN.job) post(`celeb_${d.pcCtl}`, {id: RUN.job.id}).then(r => { RUN.job = r.job; RUN.on = r.job.status === 'running'; paint(); if (RUN.on) tick(); }).catch(err => A().toast?.(err.message, 'error'));
    });

    /* ═════════ enregistrement ═════════ */
    ext.pistesSettings = ext.pistesSettings || [];
    ext.pistesSettings.push({id: 'celebres', title: T('⭐ Parents célèbres'), key: KEY, items: [['block', T('Sur la fiche : « Parent éloigné de… »'), true], ['wikitree', T('Chercher aussi dans WikiTree (API officielle, Connection Finder) — éteint au départ : ses conditions n’ont pas pu être relues'), false]]});
    ext.lists = ext.lists || {};
    ext.lists[LIST] = token => renderList(token);
    (ext.dataSources = ext.dataSources || []).push({id: 'parents_celebres', icon: '⭐', label: T('Ses parents célèbres'), group: 'La personne', needs: ['person'], installed: () => true, enabled: () => settings().block,
        run: async (ctx, host) => { const id = Number(ctx.person?.id || ctx.person) || 0; if (!id) { host.innerHTML = emptyLine(T('Choisis une personne.')); return; } host.innerHTML = `<div data-pc-person-block="${id}"></div>`; await fillPerson(host.firstElementChild); if (!host.textContent.trim()) host.innerHTML = emptyLine(T('Aucun parent célèbre connu pour cette personne.')); }});
    function register() {
        const app = A(); if (!app.defaultListTypes) return false;
        if (!app.defaultListTypes.some(x => x[0] === LIST)) app.defaultListTypes.push([LIST, '90d', T('⭐ Parents célèbres')]);
        const G = (ext.listGroupDefaults || []).find(g => g[0] === 'g_tresors'); if (G && Array.isArray(G[3]) && !G[3].includes(LIST)) G[3].push(LIST);
        const B = app.defaultPersonBlocks; if (Array.isArray(B) && !B.some(b => b[0] === BLOCK[0])) { const i = B.findIndex(b => b[0] === 'terre_mots' || b[0] === 'world'); B.splice(i < 0 ? B.length : i + 1, 0, [BLOCK[0], T(BLOCK[1])]); }
        if (app.defaultPersonBlockSpans) app.defaultPersonBlockSpans[BLOCK[0]] ||= '12';
        return true;
    }
    if (!register()) document.addEventListener('DOMContentLoaded', register, {once: true});
    ext.parentsCelebres = {settings, fillPerson, resultHtml, headline, openList: goList, wikitreeCheck};
})(typeof window !== 'undefined' ? window : globalThis);
