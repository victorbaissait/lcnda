/* LCNDA — 🖧 Plusieurs ordinateurs (maquette docs/design/plusieurs-ordinateurs.html, partie « simple » ; porte du wifi :
 * electron/lan-gate.js ; ce que PHP refuse à un appareil invité : lib/reseau_local.php).
 *  - Réglages → Données → « 🖧 Plusieurs ordinateurs » : l'interrupteur (coupé au départ), l'adresse à taper sur l'autre
 *    ordinateur et son QR code, le code d'invitation (10 min, une fois), « ⏻ Tout couper » ; les demandes d'accès (code à
 *    6 chiffres à comparer, ✕ Refuser / ✓ Autoriser) ; les appareils autorisés (liste H10, « Retirer » + ↶ Annuler 10 s) ;
 *    chaque choix de la maquette en réglage, l'option conseillée réglée au départ.
 *  - Une demande d'accès ouvre d'elle-même une fenêtre sur cet ordinateur (seulement quand c'est ouvert).
 *  - Barre du haut : pastille « 🖧 N » tant que c'est ouvert (N : appareils connectés) → cette page.
 *  - Sur un appareil invité (window.LCNDA_GUEST) ou hors de l'app de bureau : la page dit seulement où ça se règle.
 * Tous les appareils invités sont en lecture seule pour l'instant (pas de modification à plusieurs). */
(() => {
    'use strict';
    const i18n = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s).replace(/\{(\w+)\}/g, (_, k) => (v && k in v ? v[k] : `{${k}}`)));
    const A = () => window.LCNDA_APP;
    const UI = () => window.LCNDA_UI || {};
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    ext.maintenance = ext.maintenance || {};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const NET = () => window.lcnda?.reseau || null;
    const GUEST = () => window.LCNDA_GUEST || null;
    const SECONDARY = (() => { try { return !!new URLSearchParams(location.search).get('view') || window.self !== window.top; } catch (_) { return true; } })();
    const toast = (m, k, o) => (A()?.toast ? A().toast(m, k, o) : null);
    const S = () => A().state;
    const TAB = 'reseau_local';
    const goTab = () => { S().maintenanceTab = TAB; A().setModule('maintenance'); };
    ext.openReseauLocal = goTab;

    function registerTab() {
        const tabs = A()?.defaultMaintenanceTabs;
        if (tabs && !tabs.some(t => t[0] === TAB)) tabs.push([TAB, '14e', '🖧 Plusieurs ordinateurs']);
    }
    registerTab(); document.addEventListener('DOMContentLoaded', registerTab, {once: true});

    /* ═══════════ Les réglages (chaque choix de la maquette ; le premier est le conseillé) ═══════════ */
    const CHOICES = [
        ['relaunch', 'Au prochain lancement de l’app', [['coupe', 'reste coupé, il faut le rouvrir'], ['rouvre', 'se rouvre tout seul']]],
        ['wake', 'Après une mise en veille', [['rouvre', 'se rouvre au réveil si l’app est restée ouverte'], ['coupe', 'reste coupé']]],
        ['password', 'Mot de passe de la généalogie', [['obligatoire', 'obligatoire pour ouvrir au réseau'], ['facultatif', 'facultatif (déconseillé)']]],
        ['invite', 'Code d’invitation', [['demande', 'demandé en plus du code à 6 chiffres'], ['sans', 'seulement le code à 6 chiffres']]],
        ['duration', 'Durée d’un accès', [['toujours', 'jusqu’à ce que tu le retires'], ['30j', '30 jours'], ['fermeture', 'pour cette fois seulement']]],
        ['preventSleep', 'Empêcher la veille tant qu’un appareil est connecté', [['non', 'non'], ['oui', 'oui (cet ordinateur ne s’endort plus)']]],
        ['network', 'Si cet ordinateur change de réseau', [['couper', 'tout couper'], ['demander', 'tout couper, puis demander s’il faut rouvrir']]],
        ['stale', 'Appareil pas vu depuis 30 jours', [['proposer', 'proposer de le retirer'], ['rien', 'rien']]],
    ];
    const choiceHtml = (st) => CHOICES.map(([key, label, opts]) => `<div class="rl-choice"><b>${esc(i18n(label))}</b><div class="glk-mins" role="radiogroup" aria-label="${esc(i18n(label))}">${opts.map(([v, l], i) =>
        `<label class="glk-chip"><input type="radio" name="rl-${key}" value="${esc(v)}" data-rl-set="${esc(key)}"${st.settings[key] === v ? ' checked' : ''}> ${esc(i18n(l))}${i === 0 ? ` <small class="rl-rec">${esc(i18n('conseillé'))}</small>` : ''}</label>`).join('')}</div></div>`).join('');

    /* ═══════════ Petits morceaux ═══════════ */
    const code6 = c => `${String(c).slice(0, 3)} ${String(c).slice(3)}`;
    const invite = c => `${String(c).slice(0, 3)}-${String(c).slice(3)}`;
    const dateTxt = ms => { try { return new Date(Number(ms)).toLocaleDateString(window.LCNDA_I18N?.locale?.() || undefined, {day: 'numeric', month: 'short', year: 'numeric'}); } catch (_) { return ''; } };
    const timeTxt = ms => { try { return new Date(Number(ms)).toLocaleTimeString(window.LCNDA_I18N?.locale?.() || undefined, {hour: '2-digit', minute: '2-digit'}); } catch (_) { return ''; } };
    const seenTxt = d => (d.connected ? i18n('connecté maintenant') : d.lastSeen ? (UI().whenText ? UI().whenText(new Date(d.lastSeen).toISOString()) : dateTxt(d.lastSeen)) : i18n('jamais venu'));
    const qrHtml = url => { try { return ext.qr?.svg ? ext.qr.svg(url, {quiet: 2}).svg.replace(/width="\d+" height="\d+"/, 'width="132" height="132"') : ''; } catch (_) { return ''; } };
    let genealogyName = '';
    async function readName() {
        try { const r = await fetch('api.php?action=glock_state', {credentials: 'same-origin'}); const j = await r.json(); genealogyName = String(j.name || ''); return j; } catch (_) { return {}; }
    }

    /* ═══════════ La page des Réglages ═══════════ */
    ext.maintenance[TAB] = async token => {
        const ws = A().$('#workspace');
        const head = (o = {}) => (UI().pageHeader ? UI().pageHeader({title: i18n('Plusieurs ordinateurs'), help: esc(i18n('Ouvrir cette généalogie aux autres ordinateurs de la maison, par le wifi, jamais par internet.')), ...o}) : `<h2>🖧 ${esc(i18n('Plusieurs ordinateurs'))}</h2>`);
        if (GUEST() || !NET() || SECONDARY) {
            const why = GUEST() ? i18n('Ce réglage ne se change que sur l’ordinateur principal : cet appareil est un appareil invité, en lecture seule.')
                : i18n('Seulement dans l’app de bureau LCNDA, sur l’ordinateur qui garde la généalogie.');
            ws.innerHTML = `<section class="page rl-page" data-rl-page>${head()}${UI().notice ? UI().notice('info', why) : esc(why)}</section>`;
            return;
        }
        const [st, lock] = await Promise.all([NET().status(), readName()]);
        if (token !== S().workspaceToken || S().module !== 'maintenance' || S().maintenanceTab !== TAB) return;
        const noPw = st.settings.password === 'obligatoire' && !lock.locked;
        const primary = st.on ? `<button type="button" class="button danger" data-rl-close>${esc(i18n('⏻ Tout couper maintenant'))}</button>` : '';
        const more = [`<button type="button" role="menuitem" data-rl-log>${esc(i18n('📜 Qui a vu quoi'))}</button>`];
        const sw = `<label class="checkbox-line rl-open-cb"><input type="checkbox" data-rl-switch${st.on ? ' checked' : ''}${noPw && !st.on ? ' disabled' : ''}>
            <span><b>${esc(i18n('Ouvrir « {name} » aux autres ordinateurs de la maison', {name: genealogyName}))}</b><br><small class="muted">${st.on
                ? esc(i18n('Ouvert depuis {time}. Se coupe si cet ordinateur se met en veille, change de réseau ou ferme l’app.', {time: timeTxt(st.since)}))
                : esc(i18n('Coupé : l’app ne répond qu’à cet ordinateur (comme aujourd’hui).'))}</small></span></label>`;
        const warn = [];
        if (noPw) warn.push(`<div class="rl-warn">${UI().notice ? UI().notice('warn', i18n('Avant d’ouvrir : cette généalogie n’a pas de mot de passe. Il en faut un pour l’ouvrir au réseau.')) : ''}<div class="page-actions"><button type="button" class="button secondary" data-rl-pw>${esc(i18n('🔐 En mettre un'))}</button></div></div>`);
        if (!st.on && !st.canOpen) warn.push(UI().notice ? UI().notice('warn', i18n('Cet ordinateur n’est relié à aucun réseau de la maison (adresse privée introuvable) : branche le wifi, puis réessaie.')) : '');
        if (st.pauseUntil) warn.push(UI().notice ? UI().notice('warn', st.pauseReason === 'code' ? i18n('5 codes d’invitation faux : plus aucune demande jusqu’à {time}.', {time: timeTxt(st.pauseUntil)}) : i18n('5 demandes refusées : plus aucune demande jusqu’à {time}.', {time: timeTxt(st.pauseUntil)})) : '');
        if (!st.on && st.closedReason === 'reseau') warn.push(UI().notice ? UI().notice('info', i18n('Le réseau a changé : tout a été coupé.')) : '');
        const openBox = st.on ? `<div class="rl-open">
                <div class="rl-addr"><span class="muted">${esc(i18n('Adresse à taper sur l’autre ordinateur'))}</span><code class="rl-url" data-i18n-off>${esc(st.url)}</code>
                    <button type="button" class="button secondary small" data-rl-copy>${esc(i18n('📋 Copier'))}</button></div>
                ${st.invite ? `<div class="rl-inv"><span class="muted">${esc(i18n('Code d’invitation (valable 10 min, une seule fois)'))}</span><code class="rl-code" data-i18n-off>${esc(invite(st.invite.code))}</code>
                    <button type="button" class="button secondary small" data-rl-invite>${esc(i18n('↻ Nouveau code'))}</button></div>` : ''}
                <div class="rl-qr" aria-hidden="true">${qrHtml(st.url)}</div>
                <p class="ui-hint">${esc(i18n('Sur l’autre ordinateur : ouvre un navigateur (Chrome, Firefox, Safari, Edge), tape cette adresse, puis le code. Ensuite, c’est toi qui acceptes ici, en comparant le code à 6 chiffres affiché des deux côtés.'))}</p></div>` : '';
        const reqs = st.requests.length ? `<div class="maintenance-panel rl-reqs"><h3>${esc(i18n('Demandes d’accès'))}</h3>${st.requests.map(r => `<div class="rl-req" data-rl-req="${esc(r.id)}">
                <div><b data-i18n-off>${esc(r.name)}</b> <small class="muted" data-i18n-off>${esc(r.ip)}</small><br><span class="rl-six" data-i18n-off>${esc(code6(r.code))}</span></div>
                <div class="page-actions"><button type="button" class="button secondary" data-rl-refuse="${esc(r.id)}">${esc(i18n('✕ Refuser'))}</button><button type="button" class="button" data-rl-accept="${esc(r.id)}">${esc(i18n('✓ Autoriser'))}</button></div></div>`).join('')}</div>` : '';
        const devs = `<div class="maintenance-panel rl-devs"><h3>${esc(i18n('Appareils autorisés'))}</h3><p class="ui-hint">${esc(i18n('Tous les appareils invités sont en lecture seule : ils regardent la généalogie, rien ne peut être modifié depuis eux.'))}</p><div data-rl-list></div></div>`;
        const honest = `<div class="rl-honest"><p><b>${esc(i18n('Ce qu’il faut savoir'))}</b></p>
            <p>${esc(i18n('🧱 La première fois, Windows (« Autoriser LCNDA sur les réseaux privés ? ») ou macOS (« Accepter les connexions entrantes ? ») pose la question : réponds oui, et sous Windows seulement pour les réseaux privés.'))}</p>
            <p>${esc(i18n('📶 Dans cette version, ce qui passe dans le wifi n’est pas chiffré : n’ouvre que sur le wifi de la maison, protégé par sa clé, jamais sur un wifi d’hôtel, de gare ou de médiathèque.'))}</p>
            <p>${esc(i18n('🖥 Cet ordinateur doit rester allumé, avec LCNDA ouvert : s’il dort ou que tu fermes l’app, les autres ne voient plus rien.'))}</p></div>`;
        ws.innerHTML = `<section class="page rl-page" data-rl-page>${head({primary, more})}
            ${warn.join('')}<div class="rl-grid"><div><div class="maintenance-panel">${sw}${openBox}</div>${reqs}${devs}
            <details class="maintenance-panel rl-settings"><summary><b>${esc(i18n('⚙️ Réglages'))}</b></summary>${choiceHtml(st)}</details></div><div>${honest}</div></div></section>`;
        const root = ws.querySelector('[data-rl-page]');
        drawDevices(root.querySelector('[data-rl-list]'), st);
        bindPage(root, st);
    };

    function drawDevices(box, st) {
        if (!box) return;
        const rows = st.devices;
        const draw = q => {
            const list = rows.filter(d => !q || (UI().listMatch?.text ? UI().listMatch.text(q, `${d.name} ${d.lastIp}`) : `${d.name} ${d.lastIp}`.toLowerCase().includes(String(q).toLowerCase())))
                .sort((a, b) => (Number(b.connected) - Number(a.connected)) || (b.lastSeen - a.lastSeen));
            const items = list.map(d => ({name: d.name, cls: d.connected ? 'is-on' : '', thumb: `<span class="ui-card-ico">${d.connected ? '🟢' : '🖥'}</span>`,
                lines: [[d.lastIp, i18n('autorisé le {date}', {date: dateTxt(d.created)})].filter(Boolean).join(' · '), `👁 ${i18n('lecture seule')} · ${seenTxt(d)}${d.duration === '30j' && d.expires ? ' · ' + i18n('jusqu’au {date}', {date: dateTxt(d.expires)}) : d.duration === 'fermeture' ? ' · ' + i18n('pour cette fois seulement') : ''}`,
                    d.stale ? `⚠️ ${i18n('Pas vu depuis plus de 30 jours : le retirer ?')}` : ''].filter(Boolean),
                actions: `<button type="button" class="button secondary small danger" data-rl-remove="${esc(d.id)}">${esc(i18n('Retirer'))}</button>`}));
            const html = !rows.length ? (A().empty ? A().empty(i18n('Aucun appareil autorisé pour l’instant.'), {icon: '🖧'}) : esc(i18n('Aucun appareil autorisé pour l’instant.')))
                : items.length ? (UI().rowsHtml ? UI().rowsHtml(items) : '') : `<p class="empty-line">🔍 ${esc(i18n('Aucun appareil ne correspond.'))}</p>`;
            box.innerHTML = html;
            box.querySelectorAll('.ui-row-name').forEach(n => n.setAttribute('data-i18n-off', ''));
            bar?.setCount?.(i18n('Appareils : {n} · connectés : {c}', {n: rows.length, c: st.connected}));
        };
        const bar = rows.length && UI().listBar ? UI().listBar({key: 'reglages:appareils', search: {placeholder: i18n('Chercher un appareil…')}, count: false, onChange: s => draw(s.q)}) : null;
        if (bar) box.before(bar);
        draw(bar ? bar.state?.q : '');
    }

    const refresh = () => { if (S()?.module === 'maintenance' && S().maintenanceTab === TAB) ext.maintenance[TAB](++S().workspaceToken); };
    async function run(fn, okMsg) {
        try { const r = await fn(); if (r && r.ok === false) { toast(errText(r.error), 'error'); return r; } if (okMsg) toast(okMsg, 'success'); return r; }
        catch (e) { toast(e.message || String(e), 'error'); return null; }
    }
    const errText = e => ({nopw: i18n('Avant d’ouvrir : cette généalogie n’a pas de mot de passe. Il en faut un pour l’ouvrir au réseau.'),
        noprivate: i18n('Cet ordinateur n’est relié à aucun réseau de la maison (adresse privée introuvable) : branche le wifi, puis réessaie.'),
        listen: i18n('La porte du wifi n’a pas pu s’ouvrir (pare-feu, ou adresse déjà prise). Réessaie dans un instant.'),
        gone: i18n('Cette demande n’existe plus (refusée, ou plus de 2 minutes sans réponse).'), late: i18n('Trop tard pour annuler : autorise l’appareil de nouveau.')}[e] || i18n('Refusé.'));

    function bindPage(root, st) {
        root.querySelector('[data-rl-switch]')?.addEventListener('change', async e => {
            if (e.currentTarget.checked) { const r = await run(() => NET().open()); if (r && r.ok) toast(i18n('🖧 Ouvert aux ordinateurs de la maison.'), 'success'); }
            else await run(() => NET().close(), i18n('🖧 Coupé : l’app ne répond plus qu’à cet ordinateur.'));
            refresh();
        });
        root.querySelectorAll('[data-rl-close]').forEach(b => b.addEventListener('click', async () => { await run(() => NET().close(), i18n('🖧 Coupé : l’app ne répond plus qu’à cet ordinateur.')); refresh(); }));
        root.querySelectorAll('[data-rl-invite]').forEach(b => b.addEventListener('click', async () => { await run(() => NET().newInvite()); refresh(); }));
        root.querySelector('[data-rl-log]')?.addEventListener('click', () => ext.openAccessLog?.());
        root.querySelector('[data-rl-pw]')?.addEventListener('click', () => ext.openGlockSettings?.());
        root.querySelector('[data-rl-copy]')?.addEventListener('click', async () => { try { await navigator.clipboard.writeText(st.url); toast(i18n('Adresse copiée'), 'success'); } catch (_) { toast(st.url); } });
        root.querySelectorAll('[data-rl-accept]').forEach(b => b.addEventListener('click', () => answer(b.dataset.rlAccept, true, st.requests.find(r => r.id === b.dataset.rlAccept))));
        root.querySelectorAll('[data-rl-refuse]').forEach(b => b.addEventListener('click', () => answer(b.dataset.rlRefuse, false)));
        root.addEventListener('click', async e => {
            const b = e.target.closest?.('[data-rl-remove]'); if (!b) return;
            const r = await run(() => NET().remove(b.dataset.rlRemove));
            if (r && r.ok) {
                const id = b.dataset.rlRemove;
                toast(i18n('✓ « {name} » retiré : il ne peut plus se connecter.', {name: r.name}), 'success', {duration: 10000, action: {label: i18n('↶ Annuler'), run: async () => { await run(() => NET().undoRemove(id), i18n('« {name} » peut de nouveau se connecter.', {name: r.name})); refresh(); }}});
            }
            refresh();
        });
        root.querySelectorAll('[data-rl-set]').forEach(x => x.addEventListener('change', async () => {
            const key = x.dataset.rlSet, prev = st.settings[key];
            const r = await run(() => NET().setSettings({[key]: x.value}));
            if (r && r.ok) toast(i18n('Réglage enregistré'), 'success', {action: {label: i18n('↶ Annuler'), run: async () => { await NET().setSettings({[key]: prev}); refresh(); }}});
            refresh();
        }));
    }

    /* ═══════════ Une demande d'accès : la fenêtre qui s'ouvre d'elle-même ═══════════ */
    const dialogs = new Map();
    async function answer(id, yes, req) {
        dialogs.get(id)?.close();
        if (!yes) { await run(() => NET().refuse(id), i18n('Demande refusée.')); refresh(); return; }
        const r = await run(() => NET().accept(id));
        if (r && r.ok) {
            const dev = r.device;
            toast(i18n('✓ « {name} » autorisé, en lecture seule.', {name: dev.name}), 'success', {duration: 10000, action: {label: i18n('↶ Annuler'), run: async () => { await NET().remove(dev.id); refresh(); }}});
        }
        refresh();
    }
    function requestDialog(r) {
        if (dialogs.has(r.id) || !document.body) return;
        const dl = document.createElement('dialog'); dl.className = 'modal h-modal rl-dialog';
        dl.innerHTML = `<div class="modal-head"><div><span class="eyebrow">🖧 ${esc(i18n('Demande d’accès'))}</span><h2>${esc(i18n('Un appareil veut ouvrir « {name} »', {name: genealogyName || ''}))}</h2></div><button type="button" class="icon-button" data-x aria-label="${esc(i18n('Fermer'))}">×</button></div>
            <div class="h-dialog-body"><dl class="rl-dl"><dt>${esc(i18n('Nom donné'))}</dt><dd><b data-i18n-off>${esc(r.name)}</b> <small class="muted">${esc(i18n('(il peut être faux : compare le code)'))}</small></dd>
                <dt>${esc(i18n('Adresse'))}</dt><dd data-i18n-off>${esc(r.ip)}</dd><dt>${esc(i18n('Code affiché'))}</dt><dd><span class="rl-six rl-six-big" data-i18n-off>${esc(code6(r.code))}</span></dd></dl>
                <p><b>${esc(i18n('Regarde l’écran de l’appareil : il doit montrer le même code. Sinon, refuse.'))}</b></p>
                <p class="ui-hint">${esc(i18n('Ce qu’il pourra faire : 👁 lecture seule (rien ne peut être modifié depuis cet appareil). Il devra aussi donner le mot de passe de la généalogie.'))}</p>
                <p class="ui-hint">${esc(i18n('Sans réponse en 2 minutes, la demande disparaît toute seule (refusée).'))}</p></div>
            <div class="modal-actions"><span class="spacer"></span><button type="button" class="button secondary" data-no>${esc(i18n('✕ Refuser'))}</button><button type="button" class="button" data-yes>${esc(i18n('✓ Autoriser « {name} »', {name: r.name}))}</button></div>`;
        document.body.appendChild(dl);
        dialogs.set(r.id, dl);
        dl.addEventListener('close', () => { dialogs.delete(r.id); dl.remove(); });
        dl.querySelector('[data-x]').addEventListener('click', () => dl.close()); // fermer sans répondre : la demande reste dans la page des réglages
        dl.querySelector('[data-no]').addEventListener('click', () => answer(r.id, false));
        dl.querySelector('[data-yes]').addEventListener('click', () => answer(r.id, true, r));
        dl.showModal();
        dl.querySelector('[data-no]').focus(); // le bouton sûr d'abord
    }

    /* ═══════════ Barre du haut : 🖧 N tant que c'est ouvert ═══════════ */
    async function topPill(st) {
        const meta = document.querySelector('.topbar-meta'); if (!meta) return;
        let b = meta.querySelector('#rl-pill');
        if (!st || !st.on) { b?.remove(); return; }
        if (!b) {
            b = document.createElement('button'); b.type = 'button'; b.id = 'rl-pill'; b.className = 'screen-tool rl-pill';
            b.addEventListener('click', goTab);
            meta.insertBefore(b, meta.querySelector('#genealogy-switch') || null);
        }
        b.textContent = `🖧 ${st.connected}`;
        b.title = i18n('Ouvert aux ordinateurs de la maison · appareils connectés : {n}', {n: st.connected});
        b.setAttribute('aria-label', b.title);
    }

    let pending = null;
    function onChange() {
        clearTimeout(pending);
        pending = setTimeout(async () => {
            let st = null; try { st = await NET().status(); } catch (_) {}
            topPill(st);
            if (S()?.module === 'maintenance' && S().maintenanceTab === TAB && !document.querySelector('.rl-page :focus-within input[type=search]')) refresh();
        }, 250);
    }
    function start() {
        if (!NET() || GUEST() || SECONDARY) return;
        NET().onEvent(e => {
            if (e.type === 'request') { readName().finally(() => requestDialog(e)); }
            if (e.type === 'request-gone') dialogs.get(e.id)?.close();
            if (e.type === 'network-changed') {
                toast(i18n('Le réseau a changé : tout a été coupé.'), '', e.policy === 'demander' ? {duration: 15000, action: {label: i18n('🖧 Rouvrir sur ce réseau'), run: async () => { await run(() => NET().open()); onChange(); }}} : {});
            }
            if (e.type === 'reopen-failed') toast(errText(e.error), 'error');
            onChange();
        });
        onChange();
        // les demandes déjà là (page rechargée pendant qu'un appareil attendait)
        NET().status().then(st => { (st.requests || []).forEach(r => readName().finally(() => requestDialog(r))); }).catch(() => {});
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once: true}); else start();
})();
