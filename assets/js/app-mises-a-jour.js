/**
 * 🔄 Mises à jour (Réglages → Aide → « 🔄 Mises à jour », menu de l'application de bureau « Rechercher une mise à jour… »).
 *
 * Dans l'application de bureau seulement (window.lcnda.updates, electron/preload.js → electron/main.js → electron/updates.js) :
 * au démarrage, au plus une fois par jour, le processus principal regarde la dernière version publiée sur GitHub
 * (victorbaissait/lcnda, API publique, sans clé ; rien d'autre n'est envoyé). Plus récente : message H7 « Une nouvelle
 * version 0.9.2 est disponible » — ⤓ Télécharger · Voir les nouveautés · Plus tard · Ne plus me prévenir pour cette version.
 * Téléchargement dans « Téléchargements » avec barre de progression, vérifié par l'empreinte (SHA256SUMS.txt), puis
 * « Ouvrir » : la personne installe elle-même (pas de remplacement silencieux : installateurs non signés).
 * Réglage K2 « Vérifier les mises à jour : Automatiquement / Jamais » (localStorage « lcnda-mises-a-jour », recopié dans
 * config.json du bureau). Rien en mode simple ni en mode consultation. Dans un navigateur : un lien vers la page des versions.
 */
(() => {
    'use strict';
    const i18n = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : s); // 🌐 docs/I18N.md
    const A = () => window.LCNDA_APP;
    const UI = () => window.LCNDA_UI;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const esc = v => (A()?.escapeHtml ? A().escapeHtml(v ?? '') : String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c])));
    const U = () => window.lcnda?.updates || null;
    const KEY = 'lcnda-mises-a-jour';
    const RELEASES = 'https://github.com/victorbaissait/lcnda/releases';
    const OS = {darwin: 'Mac', win32: 'Windows', linux: 'Linux'};
    const FMT = {dmg: '.dmg', exe: '.exe', AppImage: 'AppImage', deb: '.deb'};
    const mb = b => (b >= 1e6 ? `${Math.round(b / 1e6)} Mo` : `${Math.max(1, Math.round(b / 1e3))} Ko`);
    const quiet = () => document.body?.classList.contains('is-kiosk') || document.documentElement.classList.contains('ms-open');
    const readPref = () => { try { const o = JSON.parse(localStorage.getItem(KEY) || '{}'); return o && typeof o === 'object' ? o : {}; } catch (_) { return {}; } };
    const writePref = o => { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (_) {} };
    let last = null; // dernier résultat de « regarder »
    let busy = false;

    /* ─────────── télécharger ─────────── */
    let progressBound = false, onProg = null;
    async function download(info = last) {
        const u = U(); if (!u || !info?.asset) return;
        let doneFile = null;
        const d = ext.openDialog({eyebrow: 'MISE À JOUR', title: i18n('Télécharger LCNDA {v}', {v: info.latest}), body: `<div class="mj-dl">
                <p><b>${esc(info.asset.name)}</b>${info.asset.size ? ` · ${mb(info.asset.size)}` : ''}</p>
                <progress class="mj-progress" max="100" value="0" data-mj-bar></progress>
                <p class="ui-hint" data-mj-state>Téléchargement dans ton dossier « Téléchargements »…</p>
            </div>`, onOpen: dlg => {
                dlg.classList.add('small-modal');
                dlg.querySelector('.modal-actions').innerHTML = '<span class="spacer"></span><button type="button" class="button secondary" data-mj-stop>Annuler</button><button type="button" class="button secondary" data-mj-show hidden>📁 Afficher dans le dossier</button><button type="button" class="button" data-mj-open hidden>↗ Ouvrir</button>';
            }});
        const bar = d.querySelector('[data-mj-bar]'), state = d.querySelector('[data-mj-state]');
        onProg = ({received, total}) => { if (!d.isConnected) return; if (total) bar.value = Math.min(100, received / total * 100); else bar.removeAttribute('value'); state.textContent = total ? i18n('{a} sur {b}…', {a: mb(received), b: mb(total)}) : `${mb(received)}…`; };
        if (!progressBound) { progressBound = true; u.onProgress?.(p => onProg?.(p)); }
        d.querySelector('[data-mj-stop]').addEventListener('click', () => { if (!doneFile) u.cancel?.(); d.close(); });
        d.querySelector('[data-mj-show]').addEventListener('click', async () => { const r = await u.show(); if (!r?.ok) A().toast(r?.error || 'Impossible d’ouvrir le dossier.', 'error'); });
        d.querySelector('[data-mj-open]').addEventListener('click', async () => { const r = await u.open(); if (!r?.ok) A().toast(r?.error || 'Impossible d’ouvrir le fichier.', 'error'); else d.close(); });
        const r = await u.download();
        if (!d.isConnected) return r;
        if (r?.ok) {
            doneFile = r.name; bar.value = 100;
            const fmt = info.asset.name.split('.').pop();
            state.innerHTML = `<span class="ui-hint is-ok">✓ Téléchargé et vérifié (empreinte identique à celle publiée) : <b>${esc(r.name)}</b>.</span><br>${fmt === 'dmg' ? 'Ouvre-le, puis glisse LCNDA dans « Applications » (à la place de l’ancienne). Ta généalogie ne bouge pas.' : fmt === 'exe' ? 'Ouvre-le et suis l’installation : elle remplace l’ancienne version. Ta généalogie ne bouge pas. Windows peut afficher « Windows a protégé votre ordinateur » : « Informations complémentaires » → « Exécuter quand même ».' : fmt === 'AppImage' ? 'Ferme LCNDA, puis lance ce nouveau fichier (il est prêt à être lancé) à la place de l’ancien. Ta généalogie ne bouge pas.' : 'Ouvre-le avec l’installateur de paquets (ou « sudo apt install ./ce-fichier.deb »). Ta généalogie ne bouge pas.'}`;
            d.querySelector('[data-mj-stop]').textContent = 'Fermer';
            d.querySelector('[data-mj-show]').hidden = false;
            d.querySelector('[data-mj-open]').hidden = false;
            d.querySelector('[data-mj-open]').focus();
        } else if (!r?.aborted) {
            state.innerHTML = `<span class="ui-hint is-error">⛔ ${esc(r?.error || 'Téléchargement impossible.')}</span>`;
            d.querySelector('[data-mj-stop]').textContent = 'Fermer';
        }
        return r;
    }
    const seeNotes = async () => { const u = U(); const r = u ? await u.page() : null; if (!r?.ok) window.open(RELEASES + '/latest', '_blank', 'noopener'); };
    async function skip(info) {
        const u = U(); if (!u) return;
        await u.setPrefs({skip: info.latest});
        A().undoToast(i18n('Plus de message pour la version {v}', {v: info.latest}), {icon: '', undo: async () => { await u.setPrefs({skip: ''}); redrawIfOpen(); }, redo: async () => { await u.setPrefs({skip: info.latest}); redrawIfOpen(); }});
        redrawIfOpen();
    }

    /* ─────────── au démarrage : au plus une fois par jour ─────────── */
    function notify(info) {
        const u = U();
        u.setPrefs({later: true}); // montré : pas de deuxième message avant demain
        const item = A().toast(i18n('🔄 Une nouvelle version {v} est disponible.', {v: info.latest}), '', {actions: [
            ...(info.asset ? [{label: '⤓ Télécharger', run: () => download(info)}] : []),
            {label: 'Voir les nouveautés', run: seeNotes},
            {label: 'Plus tard', run: () => u.setPrefs({later: true})},
            {label: 'Ne plus me prévenir pour cette version', run: () => skip(info)},
        ]});
        item?.classList?.add('mj-toast');
    }
    async function startupCheck() {
        const u = U(); if (!u || quiet() || !window.GENEALOGY_READY) return;
        try {
            const info = await u.info();
            const p = readPref();
            if (typeof p.auto === 'boolean' && p.auto !== info?.prefs?.auto) await u.setPrefs({auto: p.auto}); // réglage de la page = celui du bureau
            if ((typeof p.auto === 'boolean' ? p.auto : info?.prefs?.auto) === false) return;
            const r = await u.check(false);
            if (r?.ok) last = r;
            if (r?.notify && !quiet()) notify(r);
        } catch (_) { /* pas de réseau : rien à dire au démarrage */ }
    }

    /* ─────────── Réglages → 🔄 Mises à jour ─────────── */
    let force = false, pageInfo = null;
    const redrawIfOpen = () => { const st = A()?.state; if (st?.module === 'maintenance' && st.maintenanceTab === 'mises_a_jour') ext.maintenance.mises_a_jour(); };
    function statusHtml(info, desk) {
        if (busy) return UI().spinner('Recherche de la dernière version…', {inline: true});
        if (!info) return `<p class="ui-hint">${i18n(desk.prefs?.lastCheck ? '« 🔍 Rechercher une mise à jour » regarde tout de suite.' : 'Pas encore regardé sur cet ordinateur. « 🔍 Rechercher une mise à jour » regarde tout de suite.')}</p>`;
        if (!info.ok) return UI().notice('warn', info.error || 'La recherche n’a pas abouti.');
        const when = desk.prefs?.lastCheck ? ` · ${i18n('regardé {when}', {when: UI().when ? UI().when(new Date(desk.prefs.lastCheck).toISOString()) : ''})}` : '';
        if (!info.newer) return `<p class="mj-line">${UI().badge('À jour', 'green')} <span>${i18n('Tu as la dernière version publiée ({v}){when}.', {v: esc(info.latest), when})}</span></p>`;
        const skipped = desk.prefs?.skip && desk.prefs.skip === info.latest;
        return `<div class="mj-new">${UI().notice('info', i18n('Une nouvelle version {v} est disponible (tu as la {cur}).', {v: info.latest, cur: info.current}))}
            <div class="mj-acts">${info.asset ? `<button type="button" class="button" data-mj-download>⤓ Télécharger <small>${esc(info.asset.name)}${info.asset.size ? ` · ${mb(info.asset.size)}` : ''}</small></button>` : `<span class="ui-hint">Pas d’installateur pour cet ordinateur dans cette version : regarde la page des nouveautés.</span>`}
            <button type="button" class="button secondary" data-mj-notes>↗ Voir les nouveautés</button>
            ${skipped ? '<button type="button" class="button secondary" data-mj-unskip>↺ Me prévenir de nouveau pour cette version</button>' : '<button type="button" class="button secondary" data-mj-skip>Ne plus me prévenir pour cette version</button>'}</div>
            ${skipped ? `<p class="ui-hint">${i18n('Tu as choisi de ne plus être prévenu pour la {v}{when}.', {v: esc(info.latest), when})}</p>` : `<p class="ui-hint">Le fichier va dans ton dossier « Téléchargements », son empreinte est vérifiée, puis tu l’ouvres pour installer. Ta généalogie ne bouge pas.</p>`}</div>`;
    }
    ext.maintenance = ext.maintenance || {};
    ext.maintenance.mises_a_jour = async token => {
        const ws = document.getElementById('workspace'); if (!ws) return;
        const u = U();
        let desk = null, server = null;
        if (u) { try { desk = await u.info(); } catch (_) {} }
        else { try { server = await A().api('report_info'); } catch (_) {} }
        if (token !== undefined && A().state && token !== A().state.workspaceToken) return;
        pageInfo = desk;
        if (desk) { const p = readPref(); if (p.auto !== desk.prefs?.auto) writePref({...p, auto: desk.prefs?.auto !== false}); } // la page part de ce que garde le bureau
        const draw = () => {
            const auto = readPref().auto !== false;
            const signal = window.LCNDA_EXT?.reportProblem;
            const mail = (() => { try { return JSON.parse(localStorage.getItem(signal?.PREF || 'lcnda-signaler') || '{}').email || ''; } catch (_) { return ''; } })();
            const versionCard = desk
                ? `<section class="card mj-card"><h3>Ta version</h3>
                    <p class="mj-version"><b>LCNDA ${esc(desk.version)}</b> <span class="ui-hint">Application de bureau · ${esc(OS[desk.platform] || desk.platform)} ${esc(desk.arch)}${FMT[desk.format] ? ` (${esc(FMT[desk.format])})` : ''}</span></p>
                    <div data-mj-status>${statusHtml(last, desk)}</div></section>`
                : `<section class="card mj-card"><h3>Ta version</h3>
                    <p class="mj-version"><b>LCNDA ${esc(server?.version || '')}</b> <span class="ui-hint">Dans un navigateur</span></p>
                    ${UI().notice('info', 'Les mises à jour se cherchent et se téléchargent dans l’application de bureau LCNDA (Mac, Windows, Linux).')}
                    <p><a class="button secondary" href="${RELEASES}" target="_blank" rel="noopener noreferrer">↗ Voir les versions publiées</a></p></section>`;
            ws.innerHTML = `<section class="page mj-page">${UI().pageHeader({title: 'Mises à jour', icon: '🔄', attrs: 'data-ph-title', where: 'Réglages · Aide', saved: true, help: 'Ta version de LCNDA, les nouvelles versions, et comment signaler un problème.',
                    primary: desk ? `<button type="button" class="button" data-mj-check${busy ? ' disabled' : ''}>🔍 Rechercher une mise à jour</button>` : '',
                    actions: ['<button type="button" class="button secondary" data-mj-reset data-ui-reset>↺ Remettre comme au départ</button>']})}
                <div class="mj-grid">
                ${versionCard}
                <section class="card mj-card"><h3>Vérifier les mises à jour</h3>
                    <div class="mj-line-set"><span>Vérifier les mises à jour</span><span class="segmented" role="group">${[[true, 'Automatiquement'], [false, 'Jamais']].map(([v, l]) => `<button type="button" class="${auto === v ? 'is-active' : ''}" aria-pressed="${auto === v}" data-mj-auto="${v}"${desk ? '' : ' disabled'}>${l}</button>`).join('')}</span></div>
                    <p class="ui-hint">Au démarrage, une fois par jour au plus. Seule une demande « quelle est la dernière version ? » part vers GitHub : aucune donnée de ta généalogie, aucun identifiant. Rien n’est installé tout seul.</p>
                </section>
                <section class="card mj-card"><h3>🐞 Signaler un problème</h3>
                    <p>Un bouton qui ne répond pas, un écran bizarre, un message d’erreur ? Décris-le : un rapport technique (sans aucune donnée de ta généalogie) est préparé, tu le relis, puis tu l’envoies par GitHub ou par e-mail.</p>
                    <p><button type="button" class="button secondary" data-report-problem>🐞 Signaler un problème…</button></p>
                    <label class="mj-field">Adresse e-mail des signalements<input type="email" maxlength="200" placeholder="vide : seulement GitHub" value="${esc(mail)}" data-mj-mail autocomplete="off" spellcheck="false"></label>
                    <p class="ui-hint">Vide : seul « Ouvrir une demande sur GitHub » est proposé. Remplie : « ✉️ Écrire un e-mail » ouvre ta messagerie avec le message prêt.</p>
                </section>
                </div></section>`;
            const sec = ws.querySelector('.mj-page');
            sec.addEventListener('click', onClick);
            sec.addEventListener('change', onChange);
        };
        const onClick = async e => {
            const t = e.target;
            const auto = t.closest('[data-mj-auto]');
            if (auto && !auto.disabled) { const v = auto.dataset.mjAuto === 'true'; writePref({...readPref(), auto: v}); await U()?.setPrefs({auto: v}); return draw(); }
            if (t.closest('[data-mj-reset]')) { writePref({auto: true}); try { localStorage.removeItem(window.LCNDA_EXT?.reportProblem?.PREF || 'lcnda-signaler'); } catch (_) {} await U()?.setPrefs({auto: true, skip: '', later: false}); return draw(); }
            if (t.closest('[data-mj-check]')) return runCheck(true);
            if (t.closest('[data-mj-download]')) return download(last);
            if (t.closest('[data-mj-notes]')) return seeNotes();
            if (t.closest('[data-mj-skip]')) return last && skip(last);
            if (t.closest('[data-mj-unskip]')) { await U()?.setPrefs({skip: ''}); return redrawIfOpen(); }
        };
        const onChange = e => {
            const m = e.target.closest('[data-mj-mail]'); if (!m) return;
            const v = m.value.trim();
            const key = window.LCNDA_EXT?.reportProblem?.PREF || 'lcnda-signaler';
            if (v && !/^[^\s@<>"',;:()]{1,64}@[\w.-]{1,190}\.[a-z]{2,24}$/i.test(v)) { UI().fail?.(m, 'Cette adresse e-mail n’a pas l’air juste (ex. : nom@exemple.fr).'); return; }
            try { if (v) localStorage.setItem(key, JSON.stringify({email: v})); else localStorage.removeItem(key); } catch (_) {}
        };
        draw();
        UI().autoSave?.(ws, {redraw: async () => { const p = readPref(); await U()?.setPrefs({auto: p.auto !== false}); draw(); }});
        if (force && desk) { force = false; runCheck(true); }
    };
    async function runCheck(f) {
        const u = U(); if (!u || busy) return;
        busy = true; redrawStatus();
        try { last = await u.check(f); } catch (err) { last = {ok: false, error: 'La recherche n’a pas abouti.'}; }
        busy = false;
        try { pageInfo = await u.info(); } catch (_) {}
        redrawStatus();
        if (last?.ok && !last.newer) A().toast(`✓ Tu as la dernière version (${last.latest}).`, 'success');
    }
    function redrawStatus() {
        const box = document.querySelector('#workspace [data-mj-status]');
        if (box && pageInfo) box.innerHTML = statusHtml(last, pageInfo);
        const b = document.querySelector('#workspace [data-mj-check]'); if (b) b.disabled = busy;
    }
    /** menu « Rechercher une mise à jour… » : la page, et on regarde tout de suite */
    function openAndCheck() {
        if (quiet()) return;
        force = true;
        const st = A()?.state; if (!st) return;
        if (st.module === 'maintenance' && st.maintenanceTab === 'mises_a_jour') { force = false; return runCheck(true); }
        st.maintenanceTab = 'mises_a_jour'; A().setModule('maintenance');
    }
    ext.updates = {download, startupCheck, openAndCheck, notify, runCheck};
    document.addEventListener('click', e => { if (!e.target.closest?.('[data-mj-goto]')) return; const st = A()?.state; if (!st) return; st.maintenanceTab = 'mises_a_jour'; A().setModule('maintenance'); });
    try { window.lcnda?.onCommand?.(cmd => { if (cmd === 'check-updates') openAndCheck(); }); } catch (_) {}
    const start = () => setTimeout(startupCheck, 6000); // après le démarrage (et après « ouvrir en mode simple »)
    if (document.readyState === 'complete') start(); else window.addEventListener('load', start, {once: true});
})();
