/* LCNDA — 🔐 B7 mot de passe d'une généalogie et 📜 B8 « Qui a vu quoi » (maquette docs/design/onglets-et-successoral-outils.html ;
 * serveur : lib/verrou.php ; écran de verrou : lib/verrou_page.php + app-verrou-ecran.js).
 *  - Réglages → « 🔐 Mot de passe de cette généalogie » : poser (deux fois, case « j'ai compris »), changer, retirer (le mot de
 *    passe actuel est toujours demandé), délai de reverrouillage (5 min, 15 min, 1 h, jamais), 🔐 Verrouiller maintenant ;
 *    la phrase honnête (le fichier n'est pas chiffré) et le conseil de chiffrer le disque.
 *  - Séance ouverte : un geste (souris, clavier, toucher) repousse le délai (glock_touch, au plus toutes les 30 s) ; la page
 *    redemande l'état toutes les 30 s ; une réponse « verrouillée » (en-tête X-LCNDA-Glock) ou le délai passé → la page est
 *    vidée (fenêtres, contenu, titre) et rechargée : le serveur ne renvoie plus que l'écran de verrou.
 *  - Réglages → « 📜 Qui a vu quoi » : liste H10 (🔍, Filtrer, CSV), durée de conservation ; un dossier de succession y renvoie
 *    (ext.accessLogDialog({caseId})). Lecture seule : aucune ligne ne se modifie ni ne s'efface ici.
 * Rien n'est gardé dans le navigateur (ni mot de passe, ni registre). */
(() => {
    'use strict';
    const i18n = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s).replace(/\{(\w+)\}/g, (_, k) => (v && k in v ? v[k] : `{${k}}`)));
    const A = () => window.LCNDA_APP;
    const UI = () => window.LCNDA_UI || {};
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    ext.maintenance = ext.maintenance || {};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const G = () => window.LCNDA_GLOCK || {on: false, minutes: 15};
    const SECONDARY = (() => { try { return window.self !== window.top; } catch (_) { return true; } })();
    const csrf = () => A()?.state?.csrf || window.INSTALL_CSRF || '';
    const toast = (m, k, o) => (A()?.toast ? A().toast(m, k, o) : null);
    async function call(action, body = null, q = {}) {
        const u = new URL('api.php', location.href); u.searchParams.set('action', action); Object.entries(q).forEach(([k, v]) => u.searchParams.set(k, v));
        const r = await fetch(u, body ? {method: 'POST', credentials: 'same-origin', headers: {'Content-Type': 'application/json', 'X-CSRF-Token': csrf()}, body: JSON.stringify({...body, csrf: csrf()})} : {credentials: 'same-origin'});
        const j = await r.json().catch(() => ({error: i18n('Réponse illisible du serveur')}));
        if (!r.ok || j.error) { const e = new Error(j.error || `Erreur ${r.status}`); e.status = r.status; e.wait = j.wait || 0; throw e; }
        return j;
    }

    /* ═══════════ La séance : reverrouiller ═══════════ */
    let relocking = false;
    /** Vide tout ce que la page montre de la généalogie, puis recharge : le serveur ne renvoie plus que l'écran de verrou. */
    function relock() {
        if (relocking || window.LCNDA_GLOCK_SCREEN) return;
        relocking = true;
        try { document.querySelectorAll('dialog').forEach(d => { try { d.close(); } catch (_) {} d.remove(); }); } catch (_) {}
        try { document.title = '🔐'; document.body.replaceChildren(); document.body.style.background = 'var(--paper, #fbfbfb)'; } catch (_) {}
        try { if (window.LCNDA_EXT?.succChronoPause) window.LCNDA_EXT.succChronoPause(); } catch (_) {}
        location.replace(location.pathname + location.search);
    }
    ext.glockRelock = relock;
    async function lockNow() {
        try { await call('glock_lock_now', {}); } catch (_) {}
        relock();
    }
    ext.glockNow = lockNow;

    // toute réponse « verrouillée » (même d'un fetch direct d'un autre outil) : on vide et on recharge
    if (!window.fetch.__lcndaGlock) {
        const orig = window.fetch;
        const wrapped = function (...args) {
            return orig.apply(this, args).then(r => { try { if (r.status === 423 && r.headers.get('X-LCNDA-Glock') === '1') setTimeout(relock, 0); } catch (_) {} return r; });
        };
        wrapped.__lcndaGlock = true; Object.keys(orig).forEach(k => { wrapped[k] = orig[k]; });
        window.fetch = wrapped;
    }

    function watch() {
        if (!G().on || window.LCNDA_GLOCK_SCREEN) return;
        let last = Date.now(), sent = Date.now();
        const touch = () => {
            last = Date.now();
            if (Date.now() - sent < 30000) return;
            sent = Date.now();
            call('glock_touch', {}).catch(() => {});
        };
        ['pointerdown', 'keydown', 'wheel', 'touchstart', 'mousemove'].forEach(ev => window.addEventListener(ev, touch, {passive: true, capture: true}));
        const check = async () => {
            const m = Number(G().minutes) || 0;
            if (m > 0 && Date.now() - last > m * 60000) { return lockNow(); }
            try { const s = await call('glock_state'); if (s.locked && !s.unlocked) relock(); } catch (_) {}
        };
        setInterval(check, 30000);
        document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
    }

    /* ═══════════ Bouton « 🔐 Verrouiller maintenant » en haut à droite ═══════════ */
    /** caché au départ : Réglages → Apparence → Boutons en haut à droite (clé genealogie-verrou-bouton, app-apparence.js) */
    function topButton() {
        if (!G().on || SECONDARY) return;
        const meta = document.querySelector('.topbar-meta'); if (!meta) return;
        let b = meta.querySelector('#glock-now');
        if (!b) {
            b = document.createElement('button'); b.type = 'button'; b.id = 'glock-now'; b.className = 'screen-tool'; b.textContent = '🔐';
            b.title = i18n('Verrouiller maintenant'); b.setAttribute('aria-label', i18n('Verrouiller maintenant'));
            b.addEventListener('click', lockNow);
            const gen = meta.querySelector('#genealogy-switch'); meta.insertBefore(b, gen || null);
        }
        b.hidden = !(window.LCNDA_APPARENCE?.topbarShown ? window.LCNDA_APPARENCE.topbarShown('glock') : false);
    }
    ext.glockButton = topButton;

    /* ═══════════ Réglages : les deux pages ═══════════ */
    function registerTabs() {
        const tabs = A()?.defaultMaintenanceTabs;
        if (!tabs) return;
        if (!tabs.some(t => t[0] === 'verrou')) tabs.push(['verrou', '14c', '🔐 Mot de passe de cette généalogie']);
        if (!tabs.some(t => t[0] === 'qui_a_vu')) tabs.push(['qui_a_vu', '14d', '📜 Qui a vu quoi']);
    }
    registerTabs(); document.addEventListener('DOMContentLoaded', registerTabs, {once: true});
    const S = () => A().state;
    const goTab = tab => { S().maintenanceTab = tab; A().setModule('maintenance'); };
    ext.openGlockSettings = () => goTab('verrou');
    ext.openAccessLog = () => goTab('qui_a_vu');

    const MINS = [[5, '5 min'], [15, '15 min'], [60, '1 h'], [0, 'jamais']];
    /** force simple : longueur et variété ; 0 (vide) à 4 */
    function strength(pw) {
        const n = [...pw].length; if (!n) return 0;
        let s = n >= 16 ? 3 : n >= 12 ? 2 : n >= 8 ? 1 : 0;
        const kinds = [/[a-zà-ÿ]/, /[A-ZÀ-Ý]/, /\d/, /[^\p{L}\d]/u].filter(r => r.test(pw)).length;
        if (n >= 8 && kinds >= 3) s++;
        if (/^(.)\1+$/.test(pw) || /^(?:12345678|azertyui|password|motdepas)/i.test(pw)) s = Math.min(s, 1);
        return Math.max(1, Math.min(4, s));
    }
    const STRENGTH = ['', 'faible', 'moyen', 'bon', 'très bon'];
    const minsHtml = (cur, name = 'minutes') => `<div class="glk-mins" role="radiogroup" aria-label="${esc(i18n('Verrouiller après'))}">${MINS.map(([m, l]) => `<label class="glk-chip"><input type="radio" name="${name}" value="${m}"${m === cur ? ' checked' : ''}> ${esc(i18n(l))}</label>`).join('')}</div>`;
    const pwField = (name, label, auto = 'new-password', meter = false) => `<label>${esc(i18n(label))}<input type="password" name="${name}" maxlength="1024" autocomplete="${auto}" spellcheck="false" autocapitalize="off">${meter ? `<span class="glk-strength"><span class="glk-bar" data-glk-bar><i></i></span><span data-glk-st></span></span>` : ''}</label>`;
    const honest = () => `<div class="glk-honest">
        <p><b>${esc(i18n('Ce que ce mot de passe protège vraiment'))}</b></p>
        <p>${esc(i18n('Ce mot de passe empêche d’ouvrir cette généalogie dans l’app, ici et après chaque délai sans rien toucher.'))}</p>
        <p>${esc(i18n('Le verrou n’empêche pas de lire le fichier si quelqu’un le copie : il n’est pas chiffré. Pour ça, chiffre le disque de ton ordinateur : FileVault sur Mac (Réglages Système → Confidentialité et sécurité), BitLocker sous Windows (Paramètres → Confidentialité et sécurité → Chiffrement de l’appareil).'))}</p>
        <p>${esc(i18n('Les sauvegardes de cette généalogie sont toujours protégées par ce mot de passe (AES-256) : aucune copie ne sort en clair de son dossier.'))}</p>
        <p>${esc(i18n('Mot de passe oublié : il n’y a pas de porte dérobée. Sans lui, cette généalogie ne peut plus être ouverte dans l’app.'))}</p></div>`;
    function bindMeter(root) {
        const input = root.querySelector('input[name="password"]'), bar = root.querySelector('[data-glk-bar]'), st = root.querySelector('[data-glk-st]');
        if (!input || !bar) return;
        const up = () => { const s = strength(input.value); bar.dataset.s = String(s); bar.firstElementChild.style.width = `${s * 25}%`; st.textContent = s ? i18n('Force : {s}', {s: i18n(STRENGTH[s])}) : ''; };
        input.addEventListener('input', up); up();
    }
    const formVal = (f, n) => f.elements[n]?.value ?? '';
    const radio = (f, n) => Number([...f.querySelectorAll(`input[name="${n}"]`)].find(x => x.checked)?.value ?? 15);
    const kioskOn = () => document.body.classList.contains('is-kiosk');

    ext.maintenance.verrou = async token => {
        const ws = A().$('#workspace');
        let st;
        try { st = await call('glock_state'); } catch (e) { if (token === S().workspaceToken) ws.innerHTML = `<section class="page">${UI().notice ? UI().notice('error', e.message) : esc(e.message)}</section>`; return; }
        if (token !== S().workspaceToken || S().module !== 'maintenance' || S().maintenanceTab !== 'verrou') return;
        const head = UI().pageHeader ? UI().pageHeader({title: i18n('Mot de passe de cette généalogie'), help: esc(i18n('Un verrou à l’ouverture de « {name} », sur cet ordinateur et sur les autres.', {name: st.name})),
            primary: st.locked ? `<button type="button" class="button" data-glk-now>${`🔐 ${esc(i18n('Verrouiller maintenant'))}`}</button>` : ''}) : `<h2>${esc(i18n('🔐 Mot de passe de cette généalogie'))}</h2>`;
        const ro = kioskOn();
        const off = `<form class="glk-form maintenance-panel" data-glk-set autocomplete="off">
            <h3>${esc(i18n('Protéger cette généalogie'))}</h3>
            ${pwField('password', 'Mot de passe (8 caractères au moins)', 'new-password', true)}
            ${pwField('password2', 'Le retaper')}
            <div><b>${esc(i18n('Verrouiller après'))}</b> <small class="muted">${esc(i18n('sans rien toucher'))}</small>${minsHtml(15)}</div>
            <label class="glk-ack"><input type="checkbox" name="ack"> <span>${esc(i18n('J’ai compris : sans ce mot de passe, je ne pourrai plus ouvrir cette généalogie dans l’app.'))}</span></label>
            <div class="page-actions"><button type="submit" class="button">${`🔐 ${esc(i18n('Protéger'))}`}</button></div></form>`;
        const on = `<div class="maintenance-panel"><div class="glk-state"><span class="ui-badge is-green">${`🔐 ${esc(i18n('Protégée'))}`}</span><span>${esc(i18n('Se verrouille après {m} sans rien toucher, à la fermeture de l’app et quand on change de généalogie.', {m: i18n((MINS.find(x => x[0] === st.minutes) || MINS[1])[1])}))}</span></div></div>
            <form class="glk-form maintenance-panel" data-glk-edit autocomplete="off">
                <h3>${esc(i18n('Changer, ou retirer'))}</h3>
                ${pwField('old', 'Mot de passe actuel', 'current-password')}
                <div><b>${esc(i18n('Verrouiller après'))}</b>${minsHtml(st.minutes)}<div class="page-actions"><button type="button" class="button secondary small" data-glk-mins>${esc(i18n('Changer le délai'))}</button></div></div>
                <div class="glk-sub">${pwField('password', 'Nouveau mot de passe', 'new-password', true)}${pwField('password2', 'Le retaper')}
                <div class="page-actions"><button type="button" class="button" data-glk-change>${esc(i18n('Changer le mot de passe'))}</button></div></div>
                <div class="glk-sub"><div class="page-actions"><button type="button" class="button secondary danger" data-glk-remove>${esc(i18n('Retirer le mot de passe'))}</button></div></div></form>`;
        ws.innerHTML = `<section class="page glk-page" data-glk-page>${head}${ro ? (UI().notice ? UI().notice('info', i18n('Mode consultation : rien ne peut être modifié.')) : '') : ''}
            <div class="glk-grid"><div>${st.locked ? on : off}</div><div>${honest()}</div></div></section>`;
        const root = ws.querySelector('[data-glk-page]');
        if (ro) root.querySelectorAll('input, button:not([data-glk-now])').forEach(x => { x.disabled = true; });
        bindMeter(root);
        root.querySelector('[data-glk-now]')?.addEventListener('click', lockNow);
        const refresh = () => ext.maintenance.verrou(++S().workspaceToken);
        const fail = (e, f) => { toast(e.message, 'error'); if (e.wait) { f.querySelectorAll('button').forEach(b => { b.disabled = true; }); setTimeout(() => f.querySelectorAll('button').forEach(b => { b.disabled = false; }), e.wait * 1000); } };
        const clear = f => f.querySelectorAll('input[type=password]').forEach(i => { i.value = ''; });
        root.querySelector('[data-glk-set]')?.addEventListener('submit', async e => {
            e.preventDefault(); const f = e.currentTarget;
            const pw = formVal(f, 'password'), pw2 = formVal(f, 'password2');
            if ([...pw].length < 8) return toast(i18n('Le mot de passe doit faire au moins 8 caractères.'), 'error');
            if (pw !== pw2) return toast(i18n('Les deux mots de passe ne sont pas pareils.'), 'error');
            if (!f.elements.ack.checked) return toast(i18n('Coche la case : sans ce mot de passe, tu ne pourras plus ouvrir cette généalogie dans l’app.'), 'error');
            try { const r = await call('glock_set', {password: pw, password2: pw2, minutes: radio(f, 'minutes'), ack: 1}); clear(f); window.LCNDA_GLOCK = {on: true, minutes: r.minutes}; watch(); topButton();
                toast('🔐 ' + i18n('Cette généalogie est maintenant protégée par un mot de passe.'), 'success'); refresh(); }
            catch (err) { clear(f); fail(err, f); }
        });
        const edit = root.querySelector('[data-glk-edit]');
        if (edit) {
            const old = () => formVal(edit, 'old');
            const need = () => { if (!old()) { toast(i18n('Tape d’abord le mot de passe actuel.'), 'error'); edit.elements.old.focus(); return false; } return true; };
            edit.addEventListener('submit', e => e.preventDefault());
            edit.querySelector('[data-glk-mins]').addEventListener('click', async () => {
                if (!need()) return;
                try { const r = await call('glock_minutes', {old: old(), minutes: radio(edit, 'minutes')}); clear(edit); window.LCNDA_GLOCK = {on: true, minutes: r.minutes}; toast(i18n('Délai de reverrouillage changé'), 'success'); refresh(); }
                catch (err) { clear(edit); fail(err, edit); }
            });
            edit.querySelector('[data-glk-change]').addEventListener('click', async () => {
                if (!need()) return;
                const pw = formVal(edit, 'password'), pw2 = formVal(edit, 'password2');
                if ([...pw].length < 8) return toast(i18n('Le mot de passe doit faire au moins 8 caractères.'), 'error');
                if (pw !== pw2) return toast(i18n('Les deux mots de passe ne sont pas pareils.'), 'error');
                try { await call('glock_change', {old: old(), password: pw, password2: pw2}); clear(edit); toast(i18n('Mot de passe changé. Les autres fenêtres ouvertes devront le redemander.'), 'success'); refresh(); }
                catch (err) { clear(edit); fail(err, edit); }
            });
            edit.querySelector('[data-glk-remove]').addEventListener('click', async () => {
                if (!need()) return;
                const ok = await A().confirmBox(i18n('Retirer le mot de passe de « {name} » ? Elle s’ouvrira sans rien demander, et ses sauvegardes ne seront plus forcément protégées.', {name: st.name}), {title: i18n('Retirer le mot de passe'), okLabel: i18n('Retirer le mot de passe'), danger: true});
                if (!ok) return;
                try { await call('glock_remove', {old: old()}); clear(edit); window.LCNDA_GLOCK = {on: false, minutes: 15}; document.getElementById('glock-now')?.remove(); toast(i18n('Mot de passe retiré'), 'success'); refresh(); }
                catch (err) { clear(edit); fail(err, edit); }
            });
        }
    };

    /* ═══════════ 📜 Qui a vu quoi ═══════════ */
    const KIND = {case_open: ['📂', 'Dossier ouvert'], print: ['🖨', 'Impression ou PDF'], export: ['⤓', 'Export'], letters: ['✉️', 'Courriers en série'],
        unlock_ok: ['🔓', 'Généalogie ouverte avec le mot de passe'], unlock_fail: ['⛔', 'Mot de passe refusé'], lock_now: ['🔐', 'Verrouillée à la main'],
        lock_idle: ['🔐', 'Reverrouillée (délai passé ou app relancée)'], lock_set: ['🔐', 'Mot de passe posé'], lock_change: ['🔐', 'Mot de passe changé'],
        lock_remove: ['🔓', 'Mot de passe retiré'], lock_minutes: ['🔐', 'Délai de reverrouillage changé'], purge: ['🧹', 'Lignes anciennes effacées'], retention: ['🧹', 'Durée de conservation changée'],
        // 🖧 plusieurs ordinateurs (electron/lan-gate.js, lib/reseau_local.php)
        lan_open: ['🖧', 'Ouvert au réseau de la maison'], lan_close: ['🖧', 'Fermé au réseau de la maison'], lan_ok: ['🖧', 'Appareil autorisé'], lan_refuse: ['🖧', 'Demande d’accès refusée'],
        lan_remove: ['🖧', 'Appareil retiré'], lan_connect: ['🖧', 'Connexion en lecture seule'],
        // 📱 le téléphone par le wifi (lib/telephone_wifi.php) : le texte venu du téléphone est posé avec esc() comme tout le reste
        tw_depot: ['📥', 'Photo déposée'], tw_refus: ['✕', 'Fichier refusé'], tw_liste: ['👁', 'Liste réduite vue'], tw_relie: ['🔗', 'Photo reliée']};
    const FILTERS = [['open', 'Ouvertures', ['case_open']], ['print', 'Impressions', ['print']], ['export', 'Exports', ['export']], ['letters', 'Courriers', ['letters']],
        ['lock', 'Mot de passe', ['unlock_ok', 'unlock_fail', 'lock_now', 'lock_idle', 'lock_set', 'lock_change', 'lock_remove', 'lock_minutes']], ['lan', 'Plusieurs ordinateurs', ['lan_open', 'lan_close', 'lan_ok', 'lan_refuse', 'lan_remove', 'lan_connect']], ['tw', 'Téléphone de terrain', ['tw_depot', 'tw_refus', 'tw_liste', 'tw_relie']], ['other', 'Lignes anciennes effacées', ['purge', 'retention']]];
    const EXP = {csv: 'CSV', gedcom: 'GEDCOM', plus: 'Autre format', json: 'JSON', sqlite: 'Base .db', backup: 'Sauvegarde complète', report: 'Rapport de recherche', book: 'Livre de famille',
        sync: 'Paquet du travail à deux', vault: 'Copie chez un cousin', museum: 'Musée de famille', list: 'Liste', block: 'Bloc', share: 'Partage avec la famille', website: 'Site web',
        website_publish: 'Site web publié', offsite: 'Copie hors de l’ordinateur', access_csv: 'Registre « Qui a vu quoi » (CSV)', sources: 'Sources', succ_archive: 'Archive du dossier (.zip)',
        map_trademap: 'Carte des métiers', map_mirrormap: 'Carte des deux lignées', map_lifearea: 'Carte de l’aire de vie', map_linkmap: 'Carte des parrains et témoins', map_crisismap: 'Carte des années de crise', // 🗺️ vague 2
        succ_move: 'Dossier déplacé vers une autre généalogie', succ_journal_csv: 'Journal du dossier (CSV)', succ_pdf: 'Tableau, arbre ou parts imprimés',
        // ⚖️ outils de plus (lib/successoral_plus2.php)
        succ_questionnaire: 'Questionnaire d’héritier fabriqué', succ_answers: 'Réponses d’un questionnaire écrites', succ_notary_copy: 'Copie du dossier pour le notaire', succ_invoice: 'Facture émise ou imprimée', succ_invoice_csv: 'Registre des factures (CSV)',
        succ_decompte: 'Décompte des fonds imprimé', succ_research: 'Recherches faites (pour le notaire)', succ_map: 'Image de la carte des héritiers', succ_contract: 'Contrat imprimé', succ_merge: 'Dossiers fusionnés'};
    const WHY = {open: 'pour ouvrir la généalogie', change: 'pour changer le mot de passe', remove: 'pour retirer le mot de passe', minutes: 'pour changer le délai', backup: 'pour une sauvegarde protégée'};
    const MONTHS = [[3, '3 mois'], [6, '6 mois'], [12, '12 mois'], [36, '3 ans'], [0, 'tout garder']];
    function whatText(r) {
        const [code, n] = String(r.what || '').split('|');
        if (r.kind === 'export' && /^succ_(archive|notary_copy|merge)$/.test(code)) { const W = {enc: 'chiffrée', plain: 'sans mot de passe', addr: 'avec les adresses', noaddr: 'sans adresse', two: 'deux défunts', linked: 'dossiers liés'}; return [i18n(EXP[code]), ...String(r.what).split('|').slice(1).map(x => (W[x] ? i18n(W[x]) : x))].join(' · '); } // ⚖️ « chiffrée oui / non »
        if (r.kind === 'export') return code === 'dashboard_csv' ? i18n('Tableau de bord des dossiers (CSV) · dossiers : {n}', {n: Number(n) || 0}) : i18n(EXP[code] || 'Export') + (n ? ` (${n})` : '');
        if (r.kind === 'print') return i18n(EXP[code] || 'Impression ou PDF');
        if (r.kind === 'letters') return code === 'unfile' ? i18n('Lettres retirées (↶ Annuler) : {n}', {n: Number(n) || 0}) : i18n('Lettres rangées : {n}', {n: Number(n) || 0});
        if (r.kind === 'unlock_ok' || r.kind === 'unlock_fail') return i18n(WHY[code] || 'pour ouvrir la généalogie');
        if (r.kind === 'purge') { const [k, m] = [code, n]; return i18n('Lignes effacées : {n} (gardées : {m})', {n: Number(k) || 0, m: i18n((MONTHS.find(x => x[0] === Number(m)) || [0, '?'])[1])}); }
        if (r.kind === 'retention') return `${i18n((MONTHS.find(x => x[0] === Number(code)) || [0, '?'])[1])} → ${i18n((MONTHS.find(x => x[0] === Number(n)) || [0, '?'])[1])}`;
        if (r.kind === 'tw_refus') { const W = {type: 'pas une photo', heic: 'pas une photo', gros: 'trop grosse', enorme: 'trop grande', abime: 'abîmée', nombre: 'trop de fichiers', trop: 'trop de photos', total: 'trop gros en tout', pleine: 'boîte pleine', pourqui: 'personne refusée'}; return W[code] ? i18n(W[code]) : ''; }
        if (r.kind === 'tw_depot' && code === 'gps') return i18n('📍 GPS retiré');
        if (r.kind === 'tw_liste') return i18n('réponses : {n}', {n: Number(code) || 0});
        if (r.kind === 'lan_close') { const W = {main: 'à la main', quit: 'en quittant l’app', veille: 'mise en veille', reseau: 'le réseau a changé'}; return W[code] ? i18n(W[code]) : ''; }
        if (['lock_set', 'lock_change', 'lock_minutes'].includes(r.kind)) { const m = MINS.find(x => x[0] === Number(code)); return m ? i18n('après {m}', {m: i18n(m[1])}) : ''; }
        return '';
    }
    const atTxt = at => { const m = String(at).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : String(at); };
    const rowHtml = r => { const k = KIND[r.kind] || ['•', r.kind]; return `<tr class="${r.kind === 'unlock_fail' ? 'is-fail' : ''}"><td class="b8-when">${esc(atTxt(r.at))}</td>
        <td data-i18n-off>${r.obj_label ? esc(r.obj_label) : '—'}</td><td>${esc(k[0])} ${esc(i18n(k[1]))}${whatText(r) ? ` <small class="muted">· ${esc(whatText(r))}</small>` : ''}</td><td data-i18n-off>${r.device ? `🖧 ${esc(r.device)}` : esc(r.machine)}</td></tr>`; };
    const tableHtml = rows => `<div class="table-wrap"><table class="b8-table"><thead><tr><th>${esc(i18n('Quand'))}</th><th>${esc(i18n('Dossier ou objet'))}</th><th>${esc(i18n('Quoi'))}</th><th>${esc(i18n('Appareil'))}</th></tr></thead><tbody>${rows.map(rowHtml).join('')}</tbody></table></div>`;
    const csvUrl = () => { const u = new URL('api.php', location.href); u.searchParams.set('action', 'access_log_csv'); if (typeof window.LCNDA_GENEALOGY === 'string') u.searchParams.set('g', window.LCNDA_GENEALOGY); return u.toString(); };
    function match(r, st) {
        const f = st.filters?.kind;
        if (f && f.length) { const kinds = FILTERS.filter(x => f.includes(x[0])).flatMap(x => x[2]); if (!kinds.includes(r.kind)) return false; }
        const q = String(st.q || '').trim(); if (!q) return true;
        const txt = [atTxt(r.at), r.obj_label, r.machine, r.device || '', i18n((KIND[r.kind] || ['', ''])[1]), whatText(r)].join(' ');
        return UI().listMatch?.text ? UI().listMatch.text(q, txt) : txt.toLowerCase().includes(q.toLowerCase());
    }

    ext.maintenance.qui_a_vu = async token => {
        const ws = A().$('#workspace');
        let d;
        try { d = await call('access_log'); } catch (e) { if (token === S().workspaceToken) ws.innerHTML = `<section class="page">${UI().notice ? UI().notice('error', e.message) : esc(e.message)}</section>`; return; }
        if (token !== S().workspaceToken || S().module !== 'maintenance' || S().maintenanceTab !== 'qui_a_vu') return;
        const head = UI().pageHeader ? UI().pageHeader({title: i18n('Qui a vu quoi'), help: esc(i18n('Les ouvertures de dossier, les impressions, les exports, les courriers en série et chaque essai du mot de passe, notés par l’app sur ce poste ({machine}).', {machine: d.machine})),
            primary: `<a class="button secondary" href="${esc(csvUrl())}" download data-b8-csv>${'⤓ CSV'}</a>`}) : '';
        ws.innerHTML = `<section class="page b8-page" data-b8-page>${head}
            <div class="b8-keep"><b>${esc(i18n('Garder'))}</b><div class="glk-mins" role="radiogroup" aria-label="${esc(i18n('Garder'))}">${MONTHS.map(([m, l]) => `<label class="glk-chip"><input type="radio" name="b8-months" value="${m}"${m === d.months ? ' checked' : ''}> ${esc(i18n(l))}</label>`).join('')}</div>
            <small class="muted b8-ro">${esc(i18n('Lecture seule : rien ne se modifie ; seule cette durée fait disparaître les lignes plus vieilles (et c’est noté).'))}</small></div>
            <div data-b8-list></div></section>`;
        const root = ws.querySelector('[data-b8-page]'), box = root.querySelector('[data-b8-list]');
        const draw = st => {
            const rows = d.rows.filter(r => match(r, st));
            box.innerHTML = !d.rows.length ? (A().empty ? A().empty(i18n('Rien encore.'), {icon: '📜'}) : esc(i18n('Rien encore.')))
                : rows.length ? tableHtml(rows) : `<p class="empty-line">🔍 ${esc(i18n('Aucune ligne ne correspond.'))}</p>`;
            bar?.setCount?.(i18n('Lignes : {n} sur {t}', {n: rows.length, t: d.total}));
        };
        const bar = d.rows.length && UI().listBar ? UI().listBar({key: 'reglages:qui-a-vu', search: {placeholder: i18n('Dossier, poste, action…')},
            filters: [{id: 'kind', label: i18n('Quoi'), type: 'check', options: FILTERS.map(([k, l]) => [k, i18n(l)])}], count: false, onChange: st => draw(st)}) : null;
        if (bar) box.before(bar);
        draw(bar ? bar.state : {});
        root.querySelector('[data-b8-csv]')?.addEventListener('click', () => setTimeout(() => { if (S().maintenanceTab === 'qui_a_vu') ext.maintenance.qui_a_vu(++S().workspaceToken); }, 1500));
        root.querySelectorAll('input[name="b8-months"]').forEach(x => x.addEventListener('change', async () => {
            const months = Number(x.value), prev = d.months;
            try {
                const r = await call('access_log_settings', {months});
                toast(r.purged ? i18n('Durée changée. Lignes plus anciennes effacées : {n}', {n: r.purged}) : i18n('Durée de conservation changée'), 'success',
                    r.purged ? {} : {action: {label: i18n('↶ Annuler'), run: async () => { try { await call('access_log_settings', {months: prev}); } catch (_) {} ext.maintenance.qui_a_vu(++S().workspaceToken); }}});
                ext.maintenance.qui_a_vu(++S().workspaceToken);
            } catch (e) { toast(e.message, 'error'); }
        }));
    };

    /** Les lignes d'un dossier de succession (🕓 Journal → « 📜 Qui a vu ce dossier »). */
    ext.accessLogDialog = async ({caseId, number = ''} = {}) => {
        let d; try { d = await call('access_log', null, {case_id: caseId}); } catch (e) { return toast(e.message, 'error'); }
        const dl = document.createElement('dialog'); dl.className = 'modal h-modal h-modal-wide b8-dialog';
        dl.innerHTML = `<div class="modal-head"><div><span class="eyebrow">${`📜 ${esc(i18n('Qui a vu quoi'))}`}</span><h2>${esc(i18n('Qui a vu le dossier {n}', {n: number}))}</h2></div><button type="button" class="icon-button" data-x aria-label="${esc(i18n('Fermer'))}">×</button></div>
            <div class="h-dialog-body">${d.rows.length ? tableHtml(d.rows) : `<p class="empty-line">${esc(i18n('Rien encore.'))}</p>`}
            <p class="ui-hint">${esc(i18n('Lecture seule. Tous les dossiers : Réglages → 📜 Qui a vu quoi.'))}</p></div>
            <div class="modal-actions"><button type="button" class="link-button" data-all>${`📜 ${esc(i18n('Tout le registre'))}`}</button><span class="spacer"></span><button type="button" class="button secondary" data-x>${esc(i18n('Fermer'))}</button></div>`;
        document.body.appendChild(dl);
        dl.addEventListener('close', () => dl.remove());
        dl.querySelectorAll('[data-x]').forEach(b => b.addEventListener('click', () => dl.close()));
        dl.querySelector('[data-all]').addEventListener('click', () => { dl.close(); goTab('qui_a_vu'); });
        dl.showModal();
    };

    /* ═══════════ Autres écrans : export, sauvegarde ═══════════ */
    /** Réglages → Export : une généalogie protégée ne sort pas en clair (le serveur refuse ; ici on le dit avant le clic). */
    ext.glockExport = ws => {
        if (!G().on || !ws) return;
        ws.querySelectorAll('a[href*="action=export_sqlite"], a[href*="action=export_full_backup"]').forEach(a => {
            const p = document.createElement('p'); p.className = 'muted'; p.textContent = '🔐 ' + i18n('Cette généalogie est protégée : sa sauvegarde l’est aussi, avec le même mot de passe.');
            a.replaceWith(p);
        });
        const f = ws.querySelector('#protected-backup-form');
        if (f && !f.querySelector('[data-glk-note]')) f.insertAdjacentHTML('afterbegin', `<p class="glk-honest" data-glk-note>🔐 ${esc(i18n('Pour une généalogie protégée, tape son mot de passe : la sauvegarde est chiffrée avec lui (AES-256).'))}</p>`);
    };

    const start = () => { registerTabs(); topButton(); watch(); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once: true}); else start();
})();
