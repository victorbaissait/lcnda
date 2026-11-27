/* LCNDA — 🌐 Mes arbres en ligne : synchronisation ASSISTÉE avec Ancestry et Geneanet, par fichier (serveur : lib/arbres_en_ligne.php ;
 * style : assets/css/veille-synchro.css).
 * Ni Ancestry ni Geneanet n'ouvrent d'accès à leurs arbres pour les autres logiciels : l'app ne se connecte à aucun compte et ne lit
 * aucune de leurs pages. Elle prépare le fichier à envoyer et compare celui qu'on a téléchargé.
 *  - Réglages → « 🌐 Mes arbres en ligne » : le petit tableau (dernier envoi, dernière réception, changements en attente, rappel) ;
 *    pour chaque site : ⤴ Envoyer (ce qui a changé depuis le dernier envoi, le fichier préparé — « Pour Geneanet » existant,
 *    « Pour Ancestry » —, le lien vers la page officielle, les étapes) et ⤵ Recevoir (le GEDCOM téléchargé du site, comparé à la base,
 *    validé ligne par ligne, ↶ Annuler) ;
 *  - un rappel (facultatif, par site) et un widget du tableau de bord « 🌐 Mes arbres en ligne ».
 * Pour d'autres fichiers : LCNDA_EXT.arbresEnLigne. Essai : tests/test-synchro-ancestry-geneanet.js
 */
(function (root) {
    'use strict';
    const T = (s, v) => (root.LCNDA_I18N ? root.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? String(v[k]) : m)));
    const escRaw = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    /** les réglages d'export de chaque site (vivants, notes, sources, médias) */
    const EXPORT = {
        geneanet: {target: 'geneanet', media: 'liens seulement (Geneanet ne reçoit pas les fichiers)', places: '« [Lieu-dit] - Commune, code INSEE, département, région, pays »'},
        ancestry: {target: 'ancestry', media: 'aucun (Ancestry ne reprend pas les médias d’un GEDCOM)', places: '« Commune, département, région, pays »'},
    };
    function exportParams(site, o = {}) {
        return {target: EXPORT[site].target, gedcom_version: '5.5.1', share: '1', living: o.living === 'drop' ? 'drop' : 'anon', include_living: '1', include_media: site === 'geneanet' ? '1' : '0',
            include_notes: o.notes === false ? '0' : '1', include_sources: o.sources === false ? '0' : '1'};
    }
    const KIND = {event: ['➕', 'Ajouter'], diff: ['≠', 'Différence'], note: ['📝', 'Note'], person: ['👤', 'Nouvelle personne'], couple: ['💍', 'Couple'], child: ['👶', 'Lien parent-enfant'], check: ['❔', 'À vérifier']};
    const core = {exportParams, EXPORT, KIND};
    if (typeof module !== 'undefined' && module.exports) { module.exports = core; return; }

    const A = () => root.LCNDA_APP || {};
    const UI = () => root.LCNDA_UI || {};
    const ext = root.LCNDA_EXT = root.LCNDA_EXT || {};
    const esc = v => (A().escapeHtml ? A().escapeHtml(String(v ?? '')) : escRaw(v));
    const get = (a, q) => A().api(a, q || {});
    const post = (a, b) => A().api(a, {}, {method: 'POST', body: b || {}}).then(r => r.result || r);
    const plural = (n, a, b) => (A().plural ? A().plural(n, a, b) : `${n} ${n > 1 ? (b || a + 's') : a}`);
    const kiosk = () => document.body?.classList.contains('is-kiosk');
    const ls = {get: (k, d = null) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (_) { return d; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} }};
    const TAB = ['arbres_en_ligne', '16b', '🌐 Mes arbres en ligne'];
    const link = (url, label) => `${window.LCNDA_UI.extLink(url, label)}`;
    const when = d => { if (!d) return esc(T('jamais')); const x = new Date(String(d).replace(' ', 'T') + 'Z'); return esc(Number.isNaN(x.getTime()) ? String(d).slice(0, 16) : x.toLocaleString('fr-FR', {dateStyle: 'medium', timeStyle: 'short'})); };
    const VIEW = {site: ls.get('lcnda-ael-site', 'geneanet'), lines: {}, filter: 'pending'};

    async function download(site, o) {
        const params = exportParams(site, o);
        if (ext.exportDownload) return ext.exportDownload('export_gedcom', params, {noun: 'fichier'});
        const url = new URL('api.php', location.href); url.searchParams.set('action', 'export_gedcom'); Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
        const resp = await fetch(url, {credentials: 'same-origin'}); if (!resp.ok) throw new Error(T('Export impossible.'));
        const blob = await resp.blob(); const name = ((resp.headers.get('Content-Disposition') || '').match(/filename="([^"]+)"/) || [])[1] || `genealogie-${site}.ged`;
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        return {name, blob};
    }

    function summaryTable(st) {
        const rows = Object.values(st.sites).map(s => `<tr data-ael-row="${s.site}"><td><b>${esc(s.icon)} ${esc(s.name)}</b></td><td>${when(s.last_sent_at)}</td><td>${when(s.last_received_at)}${s.last_received_file ? `<br><small class="muted">${esc(s.last_received_file)}</small>` : ''}</td>
            <td>${s.changes === null ? esc(T('tout l’arbre (jamais envoyé)')) : esc(plural(s.changes, 'changement'))}${s.reminder_due ? ` <span class="ui-badge is-yellow">${esc(T('à envoyer'))}</span>` : ''}</td><td>${esc(plural(s.pending, 'ligne', 'lignes'))}</td>
            <td><select data-ael-remind="${s.site}" aria-label="${esc(T('Rappel'))}">${[[0, 'Pas de rappel'], [30, 'Tous les mois'], [90, 'Tous les 3 mois'], [180, 'Tous les 6 mois'], [365, 'Tous les ans']].map(([v, l]) => `<option value="${v}" ${Number(s.reminder_days) === v ? 'selected' : ''}>${esc(T(l))}</option>`).join('')}</select></td></tr>`).join('');
        return `<div class="maintenance-panel"><h3>${esc(T('Mes arbres en ligne'))}</h3><div class="cplus-scroll"><table class="data-table ael-table"><thead><tr><th>${esc(T('Site'))}</th><th>${esc(T('Dernier envoi'))}</th><th>${esc(T('Dernière réception'))}</th><th>${esc(T('Changé depuis l’envoi'))}</th><th>${esc(T('En attente'))}</th><th>${esc(T('Rappel'))}</th></tr></thead><tbody>${rows}</tbody></table></div>
            <p class="muted">${esc(T('Ni Ancestry ni Geneanet ne permettent aux autres logiciels de se connecter à leurs arbres : la synchronisation se fait par fichier GEDCOM, que tu envoies ou télécharges toi-même. L’app ne se connecte à aucun compte et ne lit aucune page de ces sites.'))}</p></div>`;
    }
    function lineHtml(l) {
        const [ic, kl] = KIND[l.kind] || ['•', l.kind];
        const x = l.detail || {};
        let sub = '';
        if (l.kind === 'diff') sub = `<small>${esc(T('Chez toi : {a}', {a: x.mine_text}))}<br>${esc(T('Sur le site : {b}', {b: x.site_text}))}</small>`;
        else if (l.kind === 'person' && x.events?.length) sub = `<small>${esc(x.events.slice(0, 4).join(' · '))}</small>`;
        else if (l.kind === 'check') sub = `<small>${esc(T('{n} % de ressemblance', {n: x.score}))}${x.why?.length ? ' · ' + esc(x.why.join(', ')) : ''}${x.against?.length ? ' · ' + esc(T('Différences : {d}', {d: x.against.join(', ')})) : ''}</small>`;
        let acts;
        if (l.status === 'applied') acts = `<span class="ui-badge is-green">${esc(T('✓ ajouté'))}</span> <button type="button" class="button small secondary" data-ael-undo="${l.id}">${esc(T('↶ Annuler'))}</button>`;
        else if (l.status === 'dismissed') acts = `<span class="ui-badge is-grey">${esc(T('✗ gardé la mienne'))}</span> <button type="button" class="button small secondary" data-ael-undo="${l.id}">${esc(T('↶ Annuler'))}</button>`;
        else if (l.kind === 'check') acts = `<button type="button" class="button small" data-ael-apply="${l.id}" data-choice="same">${esc(T('Même personne : compléter ma fiche'))}</button><button type="button" class="button small secondary" data-ael-apply="${l.id}" data-choice="new">${esc(T('Nouvelle personne : l’ajouter'))}</button><button type="button" class="button small secondary" data-ael-dismiss="${l.id}">${esc(T('✗ Ignorer'))}</button>`;
        else acts = `<button type="button" class="button small" data-ael-apply="${l.id}">${esc(l.kind === 'diff' ? T('✓ Prendre la version du site') : T('✓ Ajouter'))}</button><button type="button" class="button small secondary" data-ael-dismiss="${l.id}">${esc(T('✗ Garder la mienne'))}</button>`;
        return `<li class="ael-line is-${esc(l.status)}" data-ael-line="${l.id}" data-kind="${esc(l.kind)}"><span class="ael-ic" title="${esc(T(kl))}">${ic}</span><div class="ael-txt"><span>${esc(l.label)}</span>${sub}</div><div class="ael-acts">${acts}</div></li>`;
    }
    function linesHtml(site) {
        const L = VIEW.lines[site]; if (!L || !L.items.length) return L ? `<p class="muted">${esc(T('Rien de nouveau ni de différent dans le dernier fichier reçu.'))}</p>` : '';
        const shown = L.items.filter(l => VIEW.filter === 'all' || l.status === 'pending');
        const easy = L.items.filter(l => l.status === 'pending' && ['event', 'note', 'person', 'couple', 'child'].includes(l.kind));
        return `<p>${esc(T('Fichier comparé : {f} ({d}).', {f: L.file, d: L.received_at ? String(L.received_at).slice(0, 16) : ''}))} <b>${esc(plural(L.pending, 'ligne à décider', 'lignes à décider'))}</b></p>
            <div class="segmented"><button type="button" data-ael-filter="pending" class="${VIEW.filter === 'pending' ? 'is-active' : ''}">${esc(T('À décider'))}</button><button type="button" data-ael-filter="all" class="${VIEW.filter === 'all' ? 'is-active' : ''}">${esc(T('Tout'))}</button></div>
            ${easy.length ? `<div class="page-actions"><button type="button" class="button small secondary" data-ael-all="${site}">${esc(T('✓ Tout ajouter ({n} : ajouts, notes, personnes et liens ; pas les différences ni « à vérifier »)', {n: easy.length}))}</button></div>` : ''}
            <ul class="ael-lines">${shown.map(lineHtml).join('') || `<li class="muted">${esc(T('Tout est décidé.'))}</li>`}</ul>`;
    }
    function sitePanel(s, ch) {
        const X = EXPORT[s.site];
        const changes = ch.never ? `<p>${esc(T('Jamais envoyé depuis l’app : tout l’arbre partira ({n}).', {n: plural(ch.total, 'fiche')}))}</p>`
            : ch.total ? `<details class="cplus-more"><summary>${esc(T('▸ Ce qui a changé depuis le dernier envoi ({n})', {n: ch.total}))}</summary><ul class="ael-changes">${ch.items.map(c => `<li><small class="muted">${esc(String(c.created_at).slice(0, 16))}</small> ${esc(c.summary)}${c.hidden ? ` <small class="muted">${esc(T('(reste cachée : personne vivante ou confidentielle)'))}</small>` : ''}</li>`).join('')}</ul>${ch.total > ch.items.length ? `<p class="muted">${esc(T('… et {n} de plus.', {n: ch.total - ch.items.length}))}</p>` : ''}</details>`
            : `<p class="muted">${esc(T('Rien n’a changé depuis le dernier envoi ({d}).', {d: String(ch.since).slice(0, 16)}))}</p>`;
        return `<div class="maintenance-panel ael-site" data-ael-site="${s.site}">
            <h3>${esc(s.icon)} ${esc(s.name)}</h3>
            <h4>${esc(T('⤴ Envoyer mon arbre'))}</h4>${changes}
            <form data-ael-send="${s.site}" class="ael-send"><fieldset class="h-rc-modes"><legend>${esc(T('Les vivants et les fiches confidentielles (toujours cachés)'))}</legend>
                <label class="checkbox-line"><input type="radio" name="living" value="anon" checked> ${esc(T('Anonymes (« Personne vivante »), pour que les branches restent reliées'))}</label>
                <label class="checkbox-line"><input type="radio" name="living" value="drop"> ${esc(T('Retirés du fichier'))}</label></fieldset>
                <label class="checkbox-line"><input type="checkbox" name="notes" checked> ${esc(T('Notes'))}</label><label class="checkbox-line"><input type="checkbox" name="sources" checked> ${esc(T('Sources'))}</label>
                <p class="ui-hint">${esc(T('GEDCOM 5.5.1 en UTF-8 ; lieux au format {p} ; médias : {m}.', {p: X.places, m: X.media}))}</p>
                <div class="page-actions"><button type="submit" class="button">${esc(T('⤓ Préparer le fichier pour {s}', {s: s.name}))}</button> ${link(s.help, T('↗ {l}', {l: s.help_label}))}</div></form>
            <ol class="ael-steps">${s.send_steps.map(x => `<li>${esc(T(x))}</li>`).join('')}</ol>
            <h4>${esc(T('⤵ Recevoir ce qui a changé sur {s}', {s: s.name}))}</h4>
            <ol class="ael-steps">${s.receive_steps.map(x => `<li>${esc(T(x))}</li>`).join('')}</ol>
            <form data-ael-receive="${s.site}" class="ael-receive"><label>${esc(T('Fichier GEDCOM téléchargé depuis {s} (.ged)', {s: s.name}))} <input type="file" name="file" accept=".ged,.gedcom" required></label>
                <button type="submit" class="button secondary">${esc(T('Comparer avec ma base'))}</button><p class="muted" data-ael-msg></p></form>
            <div data-ael-lines="${s.site}">${linesHtml(s.site)}</div></div>`;
    }

    async function draw(token) {
        const ws = document.getElementById('workspace'); if (!ws) return;
        if (A().state?.maintenanceTab !== TAB[0] && token === undefined && !ws.querySelector('[data-ael-page]')) return;
        let st, ch, lines;
        try { [st, ch, lines] = await Promise.all([get('enligne_status'), get('enligne_changes', {site: VIEW.site}), get('enligne_lines', {site: VIEW.site})]); }
        catch (e) { ws.innerHTML = `<section class="page"><p class="h-offsite-sentence is-warn">${esc(e.message)}</p></section>`; return; }
        if (token !== undefined && A().state && token !== A().state.workspaceToken) return;
        VIEW.lines[VIEW.site] = lines.received_at ? lines : null;
        const head = UI().pageHeader ? UI().pageHeader({title: T('Mes arbres en ligne'), icon: '🌐', where: T('Réglages · Échanges'), help: esc(T('Envoyer ton arbre à Ancestry ou Geneanet, et récupérer ce qui y a changé, par fichier.'))}) : `<h2>${esc(TAB[2])}</h2>`;
        const tabs = `<div class="segmented ael-tabs">${Object.values(st.sites).map(s => `<button type="button" data-ael-tab="${s.site}" class="${VIEW.site === s.site ? 'is-active' : ''}">${esc(s.icon)} ${esc(s.name)}${s.pending ? ` <span class="ui-badge">${s.pending}</span>` : ''}</button>`).join('')}</div>`;
        ws.innerHTML = `<section class="page ael-page" data-ael-page>${head}${summaryTable(st)}${tabs}${sitePanel(st.sites[VIEW.site], ch)}</section>`;
        A().bindTableLinks?.();
    }
    const redrawLines = async site => { const L = await get('enligne_lines', {site}); VIEW.lines[site] = L.received_at ? L : null; const box = document.querySelector(`[data-ael-lines="${site}"]`); if (box) box.innerHTML = linesHtml(site); };

    async function act(kind, ids, site, choice) {
        try {
            if (kind === 'undo') { await post('enligne_undo', {ids}); A().toast?.(T('↶ Annulé.'), 'success'); }
            else {
                const r = await post(kind === 'apply' ? 'enligne_apply' : 'enligne_dismiss', kind === 'apply' ? {ids, choice} : {ids});
                const n = kind === 'apply' ? (r.applied || []).length : r.dismissed;
                A().undoToast?.(kind === 'apply' ? T('{n} dans ta base.', {n: plural(n, 'changement ajouté', 'changements ajoutés')}) : T('Gardé la tienne : cette ligne ne reviendra pas.'), {undo: async () => { await post('enligne_undo', {ids}); await redrawLines(site); }});
            }
            root.dispatchEvent?.(new CustomEvent('lcnda:data-changed'));
            await redrawLines(site);
        } catch (e) { A().toast?.(e.message, 'error'); }
    }

    document.addEventListener('click', e => {
        const t = e.target.closest?.('[data-ael-tab],[data-ael-filter],[data-ael-apply],[data-ael-dismiss],[data-ael-undo],[data-ael-all],[data-ael-open]'); if (!t) return;
        if (t.matches('[data-ael-open]')) { e.preventDefault(); return open(t.dataset.aelOpen); }
        if (t.matches('[data-ael-tab]')) { VIEW.site = t.dataset.aelTab; ls.set('lcnda-ael-site', VIEW.site); return draw(); }
        if (t.matches('[data-ael-filter]')) { VIEW.filter = t.dataset.aelFilter; const b = document.querySelector(`[data-ael-lines="${VIEW.site}"]`); if (b) b.innerHTML = linesHtml(VIEW.site); return; }
        if (kiosk()) return;
        const site = t.closest('[data-ael-site]')?.dataset.aelSite || VIEW.site;
        if (t.matches('[data-ael-all]')) { const ids = (VIEW.lines[site]?.items || []).filter(l => l.status === 'pending' && ['event', 'note', 'person', 'couple', 'child'].includes(l.kind)).map(l => l.id); t.disabled = true; return act('apply', ids, site); }
        t.disabled = true;
        if (t.matches('[data-ael-apply]')) return act('apply', [Number(t.dataset.aelApply)], site, t.dataset.choice || 'same');
        if (t.matches('[data-ael-dismiss]')) return act('dismiss', [Number(t.dataset.aelDismiss)], site);
        if (t.matches('[data-ael-undo]')) return act('undo', [Number(t.dataset.aelUndo)], site);
    });
    document.addEventListener('submit', async e => {
        const f = e.target;
        if (f.matches?.('[data-ael-send]')) {
            e.preventDefault(); if (kiosk()) return;
            const site = f.dataset.aelSend, btn = f.querySelector('[type=submit]'); btn.disabled = true;
            try {
                await download(site, {living: f.querySelector('[name=living]:checked')?.value, notes: f.elements.notes.checked, sources: f.elements.sources.checked});
                const r = await post('enligne_sent', {site});
                A().undoToast?.(T('Fichier préparé. Envoi noté le {d} : la prochaine liste « ce qui a changé » partira de là.', {d: new Date().toLocaleDateString('fr-FR')}), {undo: async () => { await post('enligne_sent_undo', {site, prev: r.prev}); await draw(); }});
                await draw();
            } catch (err) { A().toast?.(err.message, 'error'); btn.disabled = false; }
        }
        if (f.matches?.('[data-ael-receive]')) {
            e.preventDefault(); if (kiosk()) return;
            const site = f.dataset.aelReceive, file = f.elements.file.files[0]; if (!file) return;
            const msg = f.querySelector('[data-ael-msg]'); msg.textContent = T('Comparaison en cours… (quelques secondes à une minute selon la taille)');
            const fd = new FormData(); fd.append('file', file); fd.append('site', site); fd.append('csrf', A().state?.csrf || '');
            try {
                const resp = await fetch('api.php?action=enligne_receive', {method: 'POST', headers: {'X-CSRF-Token': A().state?.csrf || ''}, body: fd, credentials: 'same-origin'});
                const r = await resp.json(); if (!resp.ok || r.error) throw new Error(r.error || T('Erreur'));
                msg.textContent = r.lines ? T('{n} à décider (rien n’est ajouté sans ton accord).', {n: plural(r.lines, 'changement nouveau ou différent', 'changements nouveaux ou différents')}) + (r.already ? ' ' + T('{n} déjà décidé(s) lors d’une réception précédente.', {n: r.already}) : '')
                    : T('Rien de nouveau ni de différent : ta base a déjà tout.');
                VIEW.filter = 'pending'; await draw();
                const m2 = document.querySelector(`[data-ael-receive="${site}"] [data-ael-msg]`); if (m2) m2.textContent = msg.textContent;
            } catch (err) { msg.textContent = ''; A().toast?.(err.message, 'error'); }
        }
    });
    document.addEventListener('change', async e => {
        const s = e.target.closest?.('[data-ael-remind]'); if (!s || kiosk()) return;
        try { await post('enligne_settings', {site: s.dataset.aelRemind, reminder_days: Number(s.value)}); A().toast?.(T('Rappel enregistré.'), 'success'); } catch (err) { A().toast?.(err.message, 'error'); }
    });

    function open(site) { if (site) { VIEW.site = site; ls.set('lcnda-ael-site', site); } const st = A().state; if (!st) return; st.maintenanceTab = TAB[0]; A().persistUiState?.(); A().setModule?.('maintenance'); }
    ext.maintenance = ext.maintenance || {};
    ext.maintenance[TAB[0]] = token => draw(token);

    ext.dashboard = ext.dashboard || {};
    ext.dashboard.arbres_en_ligne = {
        load: () => get('enligne_status').catch(() => null),
        render: (index, widget, span, d) => {
            const rows = d ? Object.values(d.sites).map(s => `<li><b>${esc(s.icon)} ${esc(s.name)}</b> — ${esc(T('envoyé : {a}', {a: s.last_sent_at ? String(s.last_sent_at).slice(0, 10) : T('jamais')}))}${s.changes ? ` · ${esc(plural(s.changes, 'changement depuis', 'changements depuis'))}` : ''}${s.pending ? ` · ${esc(T('{n} à décider', {n: s.pending}))}` : ''}</li>`).join('') : '';
            const html = `<div class="ael-widget">${d ? `<ul class="ael-w-list">${rows}</ul>` : `<p class="muted">${esc(T('Pas pu être lu.'))}</p>`}</div>`;
            return A().card ? A().card(index, `🌐 ${T('Mes arbres en ligne')}`, '', html, span, `<button type="button" class="button small secondary" data-ael-open="">${esc(T('Voir'))}</button>`) : html;
        },
    };
    /** le rappel : une fois par jour au plus, seulement pour un site dont le rappel est réglé */
    async function remind() {
        if (kiosk()) return;
        const today = new Date().toISOString().slice(0, 10); if (ls.get('lcnda-ael-reminded') === today) return;
        let st; try { st = await get('enligne_status'); } catch (_) { return; }
        const due = Object.values(st.sites).filter(s => s.reminder_due); if (!due.length) return;
        ls.set('lcnda-ael-reminded', today);
        due.forEach(s => A().toast?.(T('🌐 Ton arbre {s} n’a pas été mis à jour depuis le {d} : {n}.', {s: s.name, d: String(s.last_sent_at).slice(0, 10), n: plural(s.changes, 'changement', 'changements')}), '', {action: {label: T('Voir'), run: () => open(s.site)}}));
    }
    function register() {
        const app = A(), tabs = app.defaultMaintenanceTabs;
        if (Array.isArray(tabs) && !tabs.some(t => t[0] === TAB[0])) { const i = tabs.findIndex(t => t[0] === 'fusion'); tabs.splice(i < 0 ? tabs.length : i + 1, 0, TAB); }
        if (Array.isArray(app.defaultDashboardBlocks) && !app.defaultDashboardBlocks.some(x => x[0] === 'arbres_en_ligne')) {
            app.defaultDashboardBlocks.push(['arbres_en_ligne', '🌐 Mes arbres en ligne']);
            if (app.defaultDashboardBlockSpans) app.defaultDashboardBlockSpans.arbres_en_ligne = '6';
            if (app.dashboardWidgetInfo) app.dashboardWidgetInfo.arbres_en_ligne = T('Tes arbres sur Ancestry et Geneanet : dernier envoi, ce qui a changé depuis, ce qui attend ta décision.');
        }
        return !!tabs;
    }
    if (!register()) document.addEventListener('DOMContentLoaded', register, {once: true});
    (function boot(n = 0) { if (!A().state?.csrf) { if (n < 120) setTimeout(() => boot(n + 1), 500); return; } setTimeout(remind, 6000); })();

    ext.arbresEnLigne = {...core, open, draw, download};
})(typeof window !== 'undefined' ? window : globalThis);
