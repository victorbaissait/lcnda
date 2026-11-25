/* LCNDA — 👪 Le site familial, côté ordinateur principal (maquette validée docs/design/site-familial-comptes.html ; serveur
 * lib/comptes_famille.php, actions fc_* d'api.php ; la page des invités : famille.php + app-famille.js).
 *  - Réglages → « 👪 Site familial » : 👥 Comptes (tableau, ＋ Inviter quelqu'un, Modifier, Retirer + ↶, nouvelle invitation),
 *    📨 Propositions en attente (✓ Accepter, ✎ Accepter en changeant…, ✕ Refuser avec un petit mot, ↶ après coup ; « existe
 *    peut-être déjà » → relier ou créer ; « ⚠ modifié depuis »), 📜 Journal (qui a fait quoi, filtre par personne, ↶),
 *    🌐 En ligne (fondations seulement : paquet « Publier » sans vivants, « Relever » un fichier de propositions).
 *  - 🔔 pastille sur la cloche de la barre du haut tant que des propositions attendent (réglage « genealogie-site-familial »).
 *  - Sur un appareil invité ou en mode consultation : rien ne s'affiche ici (le serveur refuse aussi). */
(() => {
    'use strict';
    // chargé une seule fois : une 2e copie du script (index.php + injection) doublait les écouteurs → deux fenêtres l'une sur l'autre
    if (window.__lcndaComptesFamille) return;
    window.__lcndaComptesFamille = true;
    const i18n = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s).replace(/\{(\w+)\}/g, (_, k) => (v && k in v ? v[k] : `{${k}}`)));
    const A = () => window.LCNDA_APP;
    const UI = () => window.LCNDA_UI || {};
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    ext.maintenance = ext.maintenance || {};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const S = () => A().state;
    const GUEST = () => !!window.LCNDA_GUEST;
    const NET = () => window.lcnda?.reseau || null;
    const toast = (m, k, o) => A()?.toast?.(m, k, o);
    const TAB = 'site_familial';
    const KEY = 'genealogie-site-familial';
    const ROLES = [['lire', '👁 Lire', 'voir seulement'], ['proposer', '✎ Proposer', 'lire + proposer, tu valides'], ['branche', '🌿 Modifier une branche', 'écrit directement dans une branche'], ['gerer', '⚙ Gérer', 'voit tout, écrit partout (déconseillé)']];
    const ROLE_TXT = Object.fromEntries(ROLES.map(r => [r[0], r[1]]));
    const LIVING = {caches: 'cachés', prenom: 'prénom seulement', visibles: 'visibles'};
    const FIELD = {first_name: 'Prénom', last_name: 'Nom', occupation: 'Métier', BIRT: 'Naissance', BAPM: 'Baptême', DEAT: 'Décès', BURI: 'Inhumation'};
    const KIND_ICON = {fait: '📅', note: '💬', photo: '🖼', personne: '👶'};
    let view = 'comptes', DATA = null;
    function cfg() { let s = {}; try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) { s = {}; } return {cloche: true, ...s}; }
    function saveCfg(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) {} }

    function registerTab() {
        const tabs = A()?.defaultMaintenanceTabs;
        if (tabs && !tabs.some(t => t[0] === TAB)) tabs.push([TAB, '14f', '👪 Site familial']);
    }
    registerTab(); document.addEventListener('DOMContentLoaded', registerTab, {once: true});
    const goTab = v => { if (v) view = v; S().maintenanceTab = TAB; A().setModule('maintenance'); };
    ext.siteFamilial = {open: goTab, refresh: () => bell()};

    /* ═════ le serveur (réponse entière, même en cas de refus : « existe peut-être déjà ») ═════ */
    async function call(action, q = {}, body = null) {
        const u = new URL('api.php', location.href); u.searchParams.set('action', action);
        Object.entries(q).forEach(([k, v]) => { if (v !== undefined && v !== '') u.searchParams.set(k, v); });
        const init = {credentials: 'same-origin', headers: {Accept: 'application/json', ...(typeof window.LCNDA_GENEALOGY === 'string' ? {'X-Genealogy': window.LCNDA_GENEALOGY} : {})}};
        if (body) { init.method = 'POST'; init.headers['Content-Type'] = 'application/json'; init.headers['X-CSRF-Token'] = S().csrf; init.body = JSON.stringify({...body, csrf: S().csrf}); }
        const r = await fetch(u, init);
        const d = await r.json().catch(() => ({error: i18n('Réponse illisible du serveur')}));
        if (!r.ok || d.error) { const e = new Error(d.error || `Erreur ${r.status}`); e.status = r.status; e.data = d; throw e; }
        if (body) window.dispatchEvent(new CustomEvent('lcnda:data-changed', {detail: {action}}));
        return d;
    }
    const write = (op, body = {}) => call('fc_write', {}, {op, ...body}).then(d => { bell(d.pending); return d; });

    const when = ts => { if (!ts) return i18n('pas encore venu·e'); try { const d = new Date(ts * 1000); return UI().whenText ? UI().whenText(d.toISOString()) : d.toLocaleString(); } catch (_) { return ''; } };
    const valueText = v => (v && typeof v === 'object' ? [v.date, v.place].filter(Boolean).join(', ') : String(v ?? ''));
    const code8 = c => `${String(c).slice(0, 4)} ${String(c).slice(4)}`;
    const qr = url => { try { return ext.qr?.svg ? ext.qr.svg(url, {quiet: 2}).svg.replace(/width="\d+" height="\d+"/, 'width="150" height="150"') : ''; } catch (_) { return ''; } };
    const scopeTxt = a => a.scope_kind === 'tout' ? i18n('tout l’arbre') : `🌿 ${a.scope_kind === 'ascendants' ? i18n('ancêtres de {n}', {n: a.scope_name}) : i18n('descendants de {n}', {n: a.scope_name})}`;

    /* ═════ la page ═════ */
    ext.maintenance[TAB] = async token => {
        const ws = A().$('#workspace');
        const head = UI().pageHeader ? UI().pageHeader({title: i18n('👪 Site familial'), help: esc(i18n('La famille regarde l’arbre depuis le réseau de la maison et propose des ajouts ; c’est toi qui décides de ce qui entre.'))}) : `<h2>${esc(i18n('👪 Site familial'))}</h2>`;
        if (GUEST()) { ws.innerHTML = `<section class="page cf-page">${head}${UI().notice ? UI().notice('info', i18n('Ce réglage ne se change que sur l’ordinateur principal : cet appareil est un appareil invité, en lecture seule.')) : ''}</section>`; return; }
        const tabs = [['comptes', i18n('👥 Comptes')], ['propositions', i18n('📨 Propositions en attente')], ['journal', i18n('📜 Journal')], ['enligne', i18n('🌐 En ligne')]];
        ws.innerHTML = `<section class="page cf-page" data-cf-page>${head}
            <div class="segmented cf-tabs" role="tablist">${tabs.map(([k, l]) => `<button type="button" role="tab" data-cf-view="${k}" aria-selected="${view === k}" class="${view === k ? 'is-active' : ''}">${esc(l)}${k === 'propositions' ? ' <span class="cf-n" data-cf-n></span>' : ''}</button>`).join('')}</div>
            <div data-cf-body>${UI().spinner ? UI().spinner(i18n('Chargement…')) : ''}</div></section>`;
        const body = ws.querySelector('[data-cf-body]');
        const here = () => token === S().workspaceToken && S().module === 'maintenance' && S().maintenanceTab === TAB;
        try {
            if (view === 'comptes') await paintAccounts(body, here);
            else if (view === 'propositions') await paintProps(body, here);
            else if (view === 'journal') await paintJournal(body, here);
            else await paintOnline(body, here);
        } catch (e) { if (here()) body.innerHTML = UI().notice ? UI().notice('error', e.message) : esc(e.message); }
        bell();
    };
    const refresh = () => { if (S()?.module === 'maintenance' && S().maintenanceTab === TAB) ext.maintenance[TAB](++S().workspaceToken); };

    /* ─── 👥 Comptes ─── */
    async function paintAccounts(body, here) {
        DATA = await call('fc_state'); if (!here()) return;
        const rows = DATA.accounts.map(a => `<tr data-cf-acc="${a.id}">
            <td><b>${esc(a.name)}</b>${a.relation ? ` <small class="muted">${esc(a.relation)}</small>` : ''}<br><small class="muted" data-i18n-off>${esc(a.login)}</small>${a.devices.length ? `<br><small class="muted">${a.devices.map(d => `📱 ${esc(d.device_name)}`).join(' · ')}</small>` : ''}</td>
            <td>${esc(i18n(ROLE_TXT[a.role] || a.role))}</td><td>${esc(scopeTxt(a))}</td><td>${esc(i18n(LIVING[a.living] || a.living))}</td>
            <td>${a.has_password ? esc(when(a.last_seen)) : a.invite_expires ? esc(i18n('invitation envoyée')) : esc(i18n('invitation expirée'))}${a.pending ? `<br><small>⏳ ${a.pending}</small>` : ''}</td>
            <td class="cf-acts"><button type="button" class="button small secondary" data-cf-edit="${a.id}">${esc(i18n('Modifier'))}</button>
                <button type="button" class="button small secondary" data-cf-invite="${a.id}">${esc(a.has_password ? i18n('✉ Nouveau mot de passe') : i18n('✉ Invitation'))}</button>
                <button type="button" class="button small secondary danger" data-cf-remove="${a.id}">${esc(i18n('Retirer'))}</button></td></tr>`).join('');
        const sans = DATA.settings.sans_compte;
        body.innerHTML = `<div class="maintenance-panel"><div class="page-actions"><button type="button" class="button" data-cf-new>${esc(i18n('＋ Inviter quelqu’un'))}</button></div>
            ${DATA.accounts.length ? `<div class="cf-table-wrap"><table class="cf-table"><thead><tr><th>${esc(i18n('Personne'))}</th><th>${esc(i18n('Droits'))}</th><th>${esc(i18n('Sur quelle partie'))}</th><th>${esc(i18n('Vivants'))}</th><th>${esc(i18n('Dernière visite'))}</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`
                : `<p class="ui-hint">${esc(i18n('Aucun compte pour l’instant. Invite un proche : il choisira lui-même son mot de passe.'))}</p>`}
            <p class="ui-hint">${esc(i18n('Les fiches marquées 🔒 confidentielles restent cachées, quel que soit le choix (sauf « ⚙ Gérer »).'))}</p></div>
            <div class="maintenance-panel"><h3>${esc(i18n('Appareils de la maison sans compte'))}</h3><div class="glk-mins" role="radiogroup" aria-label="${esc(i18n('Appareils de la maison sans compte'))}">
                <label class="glk-chip"><input type="radio" name="cf-sans" value="app" data-cf-set="sans_compte"${sans === 'app' ? ' checked' : ''}> ${esc(i18n('regardent toute l’app en lecture seule (comme avant)'))} <small class="rl-rec">${esc(i18n('conseillé'))}</small></label>
                <label class="glk-chip"><input type="radio" name="cf-sans" value="famille" data-cf-set="sans_compte"${sans === 'famille' ? ' checked' : ''}> ${esc(i18n('passent seulement par la page de la famille, avec un compte'))}</label></div>
                <p class="ui-hint">${esc(i18n('Un appareil qui s’est connecté à un compte ne voit plus que la page de la famille.'))}</p>
                <label class="checkbox-line"><input type="checkbox" data-cf-visits${DATA.settings.visites === 'oui' ? ' checked' : ''}> ${esc(i18n('Noter au journal les fiches consultées (un nombre par jour)'))}</label>
                <label class="checkbox-line"><input type="checkbox" data-cf-bellcfg${cfg().cloche ? ' checked' : ''}> ${esc(i18n('🔔 Pastille sur la cloche quand des propositions attendent'))}</label></div>`;
    }

    function accountForm(a = null) {
        return new Promise(resolve => {
            const d = document.createElement('dialog'); d.className = 'cf-dialog';
            const v = a || {name: '', relation: '', role: 'proposer', scope_kind: 'tout', scope_person: 0, scope_name: '', living: 'caches', can_attach: 1, can_notes: 0, login: ''};
            let person = {id: v.scope_person, name: v.scope_name};
            d.innerHTML = `<form method="dialog" class="cf-form"><h3>${esc(a ? i18n('Modifier le compte de {n}', {n: a.name}) : i18n('Inviter quelqu’un'))}</h3>
                <label>${esc(i18n('Son nom (pour toi)'))}<input name="name" required maxlength="80" value="${esc(v.name)}" placeholder="${esc(i18n('ex. Odile (cousine Québec)'))}"></label>
                <label>${esc(i18n('Lien de parenté (facultatif)'))}<input name="relation" maxlength="80" value="${esc(v.relation)}" placeholder="${esc(i18n('ex. cousin'))}"></label>
                ${a ? `<label>${esc(i18n('Identifiant'))}<input name="login" maxlength="60" value="${esc(v.login)}" data-i18n-off></label>` : ''}
                <fieldset><legend>${esc(i18n('Ce qu’il ou elle peut faire'))}</legend>${ROLES.map(([k, l, h]) => `<label class="checkbox-line"><input type="radio" name="role" value="${k}"${v.role === k ? ' checked' : ''}> <b>${esc(i18n(l))}</b> <small class="muted">${esc(i18n(h))}</small></label>`).join('')}</fieldset>
                <fieldset data-cf-scope><legend>${esc(i18n('Sur quelle partie de l’arbre'))}</legend>
                    ${[['tout', 'tout l’arbre'], ['ascendants', 'ancêtres de…'], ['descendants', 'descendants de…']].map(([k, l]) => `<label class="checkbox-line"><input type="radio" name="scope_kind" value="${k}"${v.scope_kind === k ? ' checked' : ''}> ${esc(i18n(l))}</label>`).join('')}
                    <div class="page-actions"><button type="button" class="button small secondary" data-cf-pick>${esc(i18n('Choisir la personne…'))}</button> <span data-cf-pname>${esc(person.name || '')}</span></div></fieldset>
                <fieldset><legend>${esc(i18n('Les vivants'))}</legend>${Object.entries(LIVING).map(([k, l]) => `<label class="checkbox-line"><input type="radio" name="living" value="${k}"${v.living === k ? ' checked' : ''}> ${esc(i18n(l))}</label>`).join('')}
                    <p class="ui-hint">${esc(i18n('« visibles » seulement pour 🌿 (dans sa branche) et ⚙ ; sinon « prénom seulement ».'))}</p></fieldset>
                <label class="checkbox-line"><input type="checkbox" name="can_attach"${Number(v.can_attach) ? ' checked' : ''}> ${esc(i18n('Peut joindre des photos (vérifiées comme les envois du téléphone)'))}</label>
                <label class="checkbox-line"><input type="checkbox" name="can_notes"${Number(v.can_notes) ? ' checked' : ''}> ${esc(i18n('Peut voir les notes des fiches'))}</label>
                <p class="cf-err" data-cf-err role="alert"></p>
                <div class="page-actions"><button type="button" class="button secondary" data-cf-cancel>${esc(i18n('Annuler'))}</button><button type="submit" class="button">${esc(a ? i18n('Enregistrer') : i18n('Créer l’invitation'))}</button></div></form>`;
            document.body.appendChild(d);
            const f = d.querySelector('form');
            d.querySelector('[data-cf-cancel]').addEventListener('click', () => { d.close(); });
            d.querySelector('[data-cf-pick]').addEventListener('click', async () => {
                const P = window.LCNDA_PICKER; if (!P?.openPicker) return;
                const it = await P.openPicker({kind: 'person', title: i18n('Quelle personne ?')});
                if (it?.id) { person = {id: Number(it.id), name: it.label || it.name || ''}; d.querySelector('[data-cf-pname]').textContent = person.name; }
            });
            d.addEventListener('close', () => { d.remove(); resolve(null); });
            f.addEventListener('submit', async e => {
                e.preventDefault();
                const fd = new FormData(f);
                const body = {name: fd.get('name'), relation: fd.get('relation'), role: fd.get('role'), scope_kind: fd.get('scope_kind'), scope_person: person.id || 0, living: fd.get('living'),
                    can_attach: f.elements.can_attach.checked ? 1 : 0, can_notes: f.elements.can_notes.checked ? 1 : 0};
                if (a) { body.id = a.id; body.login = fd.get('login'); }
                try { const r = await write(a ? 'account_save' : 'account_new', body); d.remove(); resolve(r); }
                catch (err) { d.querySelector('[data-cf-err]').textContent = err.message; }
            });
            d.showModal();
        });
    }

    /** L'invitation : le code de 8 chiffres et le lien (avec le QR code quand la porte du wifi est ouverte). */
    async function showInvite(name, inv) {
        let url = '';
        try { const st = await NET()?.status?.(); if (st?.on && st.url) url = `${st.url}/famille.php#${st.invite ? `i=${encodeURIComponent(st.invite.code)}&` : ''}inv=${inv.token}`; } catch (_) {}
        const d = document.createElement('dialog'); d.className = 'cf-dialog';
        const exp = new Date(inv.expires * 1000);
        d.innerHTML = `<div class="cf-form"><h3>${esc(i18n('Invitation pour « {n} »', {n: name}))}</h3>
            <p>${esc(i18n('🏠 À la maison : sur son appareil, elle ouvre l’adresse de 🖧 Plusieurs ordinateurs, demande l’accès (tu l’acceptes ici), puis ouvre la page de la famille et tape ce code :'))}</p>
            <p class="cf-code" data-i18n-off>${esc(code8(inv.code))}</p>
            ${url ? `<p>${esc(i18n('Ou plus simple : elle scanne ce QR code (le code est dedans).'))}</p><div class="cf-qr" aria-hidden="true">${qr(url)}</div><code class="rl-url cf-url" data-i18n-off>${esc(url)}</code>
                <div class="page-actions"><button type="button" class="button small secondary" data-cf-copy>${esc(i18n('📋 Copier le lien'))}</button></div>`
                : `<p class="ui-hint">${esc(i18n('Pour le QR code : ouvre d’abord la porte du wifi (Réglages → 🖧 Plusieurs ordinateurs).'))}</p>`}
            <p class="ui-hint">${esc(i18n('Valable une seule fois, jusqu’au {d}. L’app n’envoie aucun e-mail : donne ce code toi-même. Il ne sera plus montré ensuite.', {d: exp.toLocaleDateString()}))}</p>
            <div class="page-actions"><button type="button" class="button" data-cf-ok>${esc(i18n('C’est noté'))}</button></div></div>`;
        document.body.appendChild(d);
        d.querySelector('[data-cf-ok]').addEventListener('click', () => d.close());
        d.querySelector('[data-cf-copy]')?.addEventListener('click', () => { try { navigator.clipboard.writeText(url); toast(i18n('Lien copié.'), 'success'); } catch (_) {} });
        d.addEventListener('close', () => d.remove());
        d.showModal();
    }

    /* ─── 📨 Propositions ─── */
    let showDecided = false;
    async function paintProps(body, here) {
        const d = await call('fc_props', {status: showDecided ? 'decidees' : 'attente'}); if (!here()) return;
        const groups = new Map();
        d.items.forEach(x => { const k = `${x.account_id}|${x.account}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(x); });
        const line = x => {
            const what = x.kind === 'fait' ? `${esc(i18n(FIELD[x.field] || x.field))} : ${x.old && valueText(x.old) ? `<s>${esc(valueText(x.old))}</s> → ` : ''}<b>${esc(valueText(x.new))}</b>` : esc(x.what);
            const st = x.status === 'attente' ? `<div class="page-actions cf-dec"><button type="button" class="button small" data-cf-acc-ok="${x.id}">${esc(x.kind === 'personne' && x.dups?.length ? i18n('✓ Accepter…') : i18n('✓ Accepter'))}</button>
                    ${['fait', 'note'].includes(x.kind) ? `<button type="button" class="button small secondary" data-cf-acc-chg="${x.id}">${esc(i18n('✎ Accepter en changeant…'))}</button>` : ''}
                    <button type="button" class="button small secondary" data-cf-ref="${x.id}">${esc(i18n('✕ Refuser'))}</button></div>`
                : `<div class="cf-done">${esc({acceptee: x.direct ? i18n('🌿 écrit directement') : i18n('✓ accepté, écrit dans l’arbre'), refusee: i18n('✕ refusé'), retiree: i18n('↩ retirée par son auteur'), annulee: i18n('↶ annulée')}[x.status] || x.status)}${x.note ? ` · « ${esc(x.note)} »` : ''}
                    ${['acceptee', 'refusee'].includes(x.status) ? ` <button type="button" class="button small secondary" data-cf-undo="${x.id}">${esc(i18n('↶ Annuler'))}</button>` : ''}</div>`;
            return `<li class="cf-prop" data-cf-prop="${x.id}"><span class="cf-ico" aria-hidden="true">${KIND_ICON[x.kind] || '•'}</span><div class="cf-prop-main">
                <div><b>${esc(x.label)}</b> — ${what}</div>
                ${x.comment ? `<div class="cf-com">« ${esc(x.comment)} »</div>` : ''}
                ${x.kind === 'note' ? `<div class="cf-com">« ${esc(x.new?.text || '')} »</div>` : ''}
                ${x.file ? `<div class="cf-file"><a href="api.php?action=fc_prop_file&amp;id=${x.id}" target="_blank" rel="noopener"><img alt="${esc(i18n('📎 photo jointe'))}" src="api.php?action=fc_prop_file&amp;id=${x.id}&amp;thumb=1"></a></div>` : ''}
                ${x.changed !== undefined ? `<div class="cf-warn">⚠ ${esc(i18n('Modifié depuis la proposition : actuellement « {v} ».', {v: x.changed || '—'}))}</div>` : ''}
                ${x.dups?.length ? `<div class="cf-warn">⚠ ${esc(i18n('Une fiche existe peut-être déjà :'))} ${x.dups.map(p => `<a href="#" data-cf-open="${p.id}">${esc(p.name)}${p.years ? ` (${esc(p.years)})` : ''}</a>`).join(', ')} · ${esc(i18n('« Accepter » te demandera s’il faut relier ou créer.'))}</div>` : ''}
                <small class="muted">${esc(when(x.at))}${x.device ? ` · ${esc(x.device)}` : ''}${x.origin === 'en_ligne' ? ` · 🌐 ${esc(i18n('en ligne'))}` : ''}</small>${st}</div></li>`;
        };
        body.innerHTML = `<div class="maintenance-panel"><div class="page-actions"><label class="checkbox-line"><input type="checkbox" data-cf-decided${showDecided ? ' checked' : ''}> ${esc(i18n('Voir celles déjà décidées'))}</label></div>
            ${d.items.length ? [...groups.entries()].map(([k, list]) => `<section class="cf-group"><h3>${esc(k.split('|').slice(1).join('|'))} · ${list.length}
                ${!showDecided && list.filter(x => x.kind !== 'personne').length > 1 ? `<button type="button" class="button small secondary" data-cf-all="${esc(k.split('|')[0])}" data-cf-allname="${esc(k.split('|').slice(1).join('|'))}">${esc(i18n('✓ Tout accepter de {n}', {n: k.split('|').slice(1).join('|')}))}</button>` : ''}</h3>
                <ul class="cf-props">${list.map(line).join('')}</ul></section>`).join('') : `<p class="ui-hint">${esc(showDecided ? i18n('Rien de décidé pour l’instant.') : i18n('✓ Aucune proposition en attente.'))}</p>`}</div>`;
        DATA = {...(DATA || {}), props: d.items};
        bell(d.pending);
    }
    async function accept(id, extra = {}) {
        try {
            await write('accept', {id, ...extra});
            A().undoToast(i18n('✓ Accepté, écrit dans l’arbre'), {undo: async () => { await write('undo', {id}); refresh(); }});
            refresh();
        } catch (e) {
            if (e.data?.needs_choice) return chooseDup(id, e.data.dups);
            toast(e.message, 'error');
        }
    }
    function chooseDup(id, dups) {
        const d = document.createElement('dialog'); d.className = 'cf-dialog';
        d.innerHTML = `<div class="cf-form"><h3>${esc(i18n('Une fiche existe peut-être déjà'))}</h3>
            ${dups.map(p => `<button type="button" class="button secondary" data-cf-link="${p.id}">${esc(i18n('🔗 Relier à {n}', {n: `${p.name}${p.years ? ` (${p.years})` : ''}`}))}</button>`).join('')}
            <button type="button" class="button" data-cf-create>${esc(i18n('＋ Créer une nouvelle fiche'))}</button>
            <div class="page-actions"><button type="button" class="button secondary" data-cf-x>${esc(i18n('Annuler'))}</button></div></div>`;
        document.body.appendChild(d);
        d.addEventListener('click', e => {
            const l = e.target.closest('[data-cf-link]'); if (l) { d.close(); accept(id, {choice: 'link', link_to: Number(l.dataset.cfLink)}); return; }
            if (e.target.closest('[data-cf-create]')) { d.close(); accept(id, {choice: 'create'}); return; }
            if (e.target.closest('[data-cf-x]')) d.close();
        });
        d.addEventListener('close', () => d.remove());
        d.showModal();
    }
    function askText(title, label, value = '', {multi = false, okLabel = 'OK'} = {}) {
        return new Promise(resolve => {
            const d = document.createElement('dialog'); d.className = 'cf-dialog';
            d.innerHTML = `<form method="dialog" class="cf-form"><h3>${esc(title)}</h3><label>${esc(label)}${multi ? `<textarea name="v" rows="5">${esc(value)}</textarea>` : `<input name="v" value="${esc(value)}">`}</label>
                <div class="page-actions"><button type="button" class="button secondary" data-cf-x>${esc(i18n('Annuler'))}</button><button type="submit" class="button">${esc(okLabel)}</button></div></form>`;
            document.body.appendChild(d);
            let out = null;
            d.querySelector('[data-cf-x]').addEventListener('click', () => d.close());
            d.querySelector('form').addEventListener('submit', e => { e.preventDefault(); out = d.querySelector('[name=v]').value; d.close(); });
            d.addEventListener('close', () => { d.remove(); resolve(out); });
            d.showModal();
        });
    }

    /* ─── 📜 Journal ─── */
    let jFilter = '', jAccount = '';
    const JW = {modif: 'a modifié', acceptee: 'as accepté la proposition de', refusee: 'as refusé la proposition de', annule: 'a annulé', hors_branche: 'a essayé de modifier (refusé, hors de sa branche)', proposition: 'a proposé',
        retiree: 'a retiré sa proposition', visite: 'a consulté des fiches', connexion: 's’est connecté·e', deconnexion: 's’est déconnecté·e', echec: 'mot de passe incorrect', invitation: 'a choisi son mot de passe', compte: 'compte', refus: 'refusé (droits)'};
    async function paintJournal(body, here) {
        const d = await call('fc_journal', {filter: jFilter, account: jAccount}); if (!here()) return;
        body.innerHTML = `<div class="maintenance-panel"><div class="page-actions cf-jbar"><div class="segmented" role="tablist">${[['', 'tout'], ['modifications', 'modifications'], ['propositions', 'propositions'], ['visites', 'visites']].map(([k, l]) => `<button type="button" role="tab" data-cf-jf="${k}" class="${jFilter === k ? 'is-active' : ''}" aria-selected="${jFilter === k}">${esc(i18n(l))}</button>`).join('')}</div>
            <label>${esc(i18n('Personne :'))} <select data-cf-ja><option value="">${esc(i18n('toutes'))}</option>${d.accounts.map(a => `<option value="${a.id}"${String(a.id) === jAccount ? ' selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label></div>
            ${d.items.length ? `<ul class="cf-journal">${d.items.map(x => `<li><span class="muted">${esc(when(x.ts))}</span> <b>${esc(x.account || i18n('Toi'))}</b> ${esc(i18n(JW[x.kind] || x.kind))}${x.kind === 'visite' ? ` (${x.n})` : ''}
                ${x.label ? ` <b>${esc(x.label)}</b>` : ''}${x.detail ? ` — ${esc(x.detail)}` : ''}${x.device ? ` <small class="muted">· ${esc(x.device)}</small>` : ''}
                ${x.undo ? ` <button type="button" class="button small secondary" data-cf-undo="${x.prop}">${esc(i18n('↶'))}</button>` : ''}</li>`).join('')}</ul>` : `<p class="ui-hint">${esc(i18n('Rien au journal pour l’instant.'))}</p>`}</div>`;
    }

    /* ─── 🌐 En ligne (fondations) ─── */
    async function paintOnline(body, here) {
        let pre = null; try { pre = await call('fc_publish_preview', {photos: 1}); } catch (e) { pre = {error: e.message}; }
        if (!here()) return;
        body.innerHTML = `<div class="maintenance-panel"><h3>${esc(i18n('🌐 Sur ton propre hébergement'))}</h3>
            ${UI().notice ? UI().notice('info', i18n('Pas encore livré : la petite version de l’app à installer sur ton hébergement. Ici, seulement ce qui servira : le paquet « Publier » (sans aucun vivant) et le « Relever » des propositions rapportées.')) : ''}
            ${pre.error ? `<p class="cf-err">${esc(pre.error)}</p>` : `<p>${esc(i18n('Ce qui partirait : {p} personnes, {ph} photos, 0 vivant, 0 fiche confidentielle (laissés chez toi : {lv} vivants, {pr} fiches confidentielles).', {p: pre.counts.people, ph: pre.counts.photos, lv: pre.counts.living_left_home, pr: pre.counts.private_left_home}))}</p>
                <div class="page-actions"><a class="button" href="api.php?action=fc_publish_export&amp;photos=1${typeof window.LCNDA_GENEALOGY === 'string' ? `&amp;g=${encodeURIComponent(window.LCNDA_GENEALOGY)}` : ''}" download>${esc(i18n('⤓ Fabriquer le paquet « Publier »'))}</a></div>`}
            <h3>${esc(i18n('📨 Relever'))}</h3><p class="ui-hint">${esc(i18n('Choisis le fichier de propositions rapporté de l’hébergement : chacune arrive dans 📨 Propositions en attente.'))}</p>
            <input type="file" accept="application/json,.json" data-cf-releve></div>`;
    }

    /* ═════ les gestes ═════ */
    document.addEventListener('click', async e => {
        const page = e.target.closest?.('[data-cf-page]'); if (!page) return;
        const t = e.target;
        const v = t.closest('[data-cf-view]'); if (v) { view = v.dataset.cfView; refresh(); return; }
        if (t.closest('[data-cf-new]')) { const r = await accountForm(); if (r) { refresh(); showInvite(r.account.name, r.invite); } return; }
        const ed = t.closest('[data-cf-edit]');
        if (ed) {
            const a = DATA?.accounts?.find(x => x.id === Number(ed.dataset.cfEdit)); if (!a) return;
            const r = await accountForm(a);
            if (r) { refresh(); A().undoToast(i18n('Compte de {n} modifié', {n: r.account.name}), {undo: async () => { await write('account_save', r.prev); refresh(); }}); }
            return;
        }
        const inv = t.closest('[data-cf-invite]');
        if (inv) { const a = DATA?.accounts?.find(x => x.id === Number(inv.dataset.cfInvite)); try { const r = await write('invite', {id: Number(inv.dataset.cfInvite)}); showInvite(a?.name || '', r.invite); refresh(); } catch (err) { toast(err.message, 'error'); } return; }
        const rm = t.closest('[data-cf-remove]');
        if (rm) {
            const id = Number(rm.dataset.cfRemove), a = DATA?.accounts?.find(x => x.id === id);
            try { await write('account_remove', {id}); refresh(); A().undoToast(i18n('Compte de {n} retiré', {n: a?.name || ''}), {undo: async () => { await write('account_remove', {id, undo: 1}); refresh(); }}); } catch (err) { toast(err.message, 'error'); }
            return;
        }
        const ok = t.closest('[data-cf-acc-ok]'); if (ok) { accept(Number(ok.dataset.cfAccOk)); return; }
        const chg = t.closest('[data-cf-acc-chg]');
        if (chg) {
            const x = (DATA?.props || []).find(p => p.id === Number(chg.dataset.cfAccChg)); if (!x) return;
            if (x.kind === 'note') { const val = await askText(i18n('✎ Accepter en changeant…'), i18n('Le souvenir'), x.new?.text || '', {multi: true, okLabel: i18n('✓ Accepter')}); if (val !== null) accept(x.id, {value: val}); return; }
            const isEv = x.new && typeof x.new === 'object';
            if (isEv) {
                const date = await askText(i18n('✎ Accepter en changeant…'), i18n('Date'), x.new.date || '', {okLabel: i18n('Suivant')}); if (date === null) return;
                const place = await askText(i18n('✎ Accepter en changeant…'), i18n('Lieu'), x.new.place || '', {okLabel: i18n('✓ Accepter')}); if (place === null) return;
                accept(x.id, {value: {date, place}});
            } else { const val = await askText(i18n('✎ Accepter en changeant…'), i18n(FIELD[x.field] || x.field), String(x.new || ''), {okLabel: i18n('✓ Accepter')}); if (val !== null) accept(x.id, {value: val}); }
            return;
        }
        const ref = t.closest('[data-cf-ref]');
        if (ref) {
            const id = Number(ref.dataset.cfRef);
            const note = await askText(i18n('✕ Refuser'), i18n('Un petit mot pour la personne (facultatif)'), '', {multi: true, okLabel: i18n('✕ Refuser')}); if (note === null) return;
            try { await write('refuse', {id, note}); A().undoToast(i18n('✕ refusé'), {undo: async () => { await write('undo', {id}); refresh(); }}); refresh(); } catch (err) { toast(err.message, 'error'); }
            return;
        }
        const un = t.closest('[data-cf-undo]');
        if (un) { try { await write('undo', {id: Number(un.dataset.cfUndo)}); toast(i18n('↶ Annulé : remis comme avant.'), 'success'); refresh(); } catch (err) { toast(err.message, 'error'); } return; }
        const all = t.closest('[data-cf-all]');
        if (all) {
            const ids = (DATA?.props || []).filter(p => String(p.account_id) === all.dataset.cfAll && p.status === 'attente' && p.kind !== 'personne').map(p => p.id);
            const done = [];
            for (const id of ids) { try { await write('accept', {id}); done.push(id); } catch (_) {} }
            refresh();
            A().undoToast(i18n('✓ {n} acceptées de {who}', {n: done.length, who: all.dataset.cfAllname}), {undo: async () => { for (const id of done.reverse()) { try { await write('undo', {id}); } catch (_) {} } refresh(); }});
            return;
        }
        const op = t.closest('[data-cf-open]'); if (op) { e.preventDefault(); A().openPersonById?.(Number(op.dataset.cfOpen)); return; }
        const jf = t.closest('[data-cf-jf]'); if (jf) { jFilter = jf.dataset.cfJf; refresh(); }
    });
    document.addEventListener('change', async e => {
        const page = e.target.closest?.('[data-cf-page]'); if (!page) return;
        const t = e.target;
        if (t.matches('[data-cf-decided]')) { showDecided = t.checked; refresh(); return; }
        if (t.matches('[data-cf-ja]')) { jAccount = t.value; refresh(); return; }
        if (t.matches('[data-cf-set]') || t.matches('[data-cf-visits]')) {
            const s = t.matches('[data-cf-visits]') ? {visites: t.checked ? 'oui' : 'non'} : {[t.dataset.cfSet]: t.value};
            try { const r = await write('settings', {settings: s}); A().undoToast(i18n('Réglage enregistré'), {undo: async () => { await write('settings', {settings: r.prev}); refresh(); }}); } catch (err) { toast(err.message, 'error'); refresh(); }
            return;
        }
        if (t.matches('[data-cf-bellcfg]')) {
            const before = cfg(); saveCfg({...before, cloche: t.checked}); bell();
            A().undoToast(t.checked ? i18n('🔔 Pastille allumée') : i18n('🔔 Pastille éteinte'), {undo: () => { saveCfg(before); bell(); refresh(); }});
            return;
        }
        if (t.matches('[data-cf-releve]')) {
            const f = t.files?.[0]; if (!f) return;
            if (f.size > 2 * 1024 * 1024) { toast(i18n('Fichier de relevé vide ou trop gros (2 Mo au plus).'), 'error'); return; }
            try { const r = await write('releve', {boite: await f.text()}); toast(i18n('📨 {a} proposition(s) relevée(s), {s} ignorée(s).', {a: r.added, s: r.skipped}), 'success'); view = 'propositions'; refresh(); }
            catch (err) { toast(err.message, 'error'); }
        }
    });

    /* ═════ 🔔 la pastille sur la cloche ═════ */
    async function bell(known) {
        if (GUEST() || !window.GENEALOGY_READY) return;
        let n = typeof known === 'number' ? known : null;
        if (n === null) { try { n = (await call('fc_count')).pending || 0; } catch (_) { return; } }
        document.querySelectorAll('[data-cf-n]').forEach(x => { x.textContent = n ? String(n) : ''; });
        const meta = document.querySelector('.topbar-meta'); if (!meta) return;
        let b = document.getElementById('fc-bell-open');
        if (!cfg().cloche || !n) { b?.remove(); return; }
        if (!b) {
            b = document.createElement('button'); b.type = 'button'; b.id = 'fc-bell-open'; b.className = 'screen-tool succ-bell-btn cf-bell';
            b.innerHTML = '<span aria-hidden="true" data-cf-bell-ico>🔔</span><span class="succ-bell-n" data-cf-bell-n></span>';
            b.addEventListener('click', () => goTab('propositions'));
            const succ = document.getElementById('succ-bell-open');
            meta.insertBefore(b, succ || meta.querySelector('#genealogy-switch') || null);
        }
        // la cloche des échéances (usage successoral) est déjà là : celle-ci prend l'enveloppe, pour ne pas montrer deux cloches
        const succVisible = !!document.getElementById('succ-bell-open') && !document.getElementById('succ-bell-open').hidden;
        b.querySelector('[data-cf-bell-ico]').textContent = succVisible ? '📨' : '🔔';
        b.querySelector('[data-cf-bell-n]').textContent = String(n);
        const lab = i18n('📨 Propositions en attente : {n}', {n}); b.title = lab; b.setAttribute('aria-label', lab);
    }
    function start() {
        if (GUEST() || !window.GENEALOGY_READY) return;
        setTimeout(() => bell(), 1800);
        setInterval(() => { if (document.visibilityState === 'visible') bell(); }, 60000);
        window.addEventListener('focus', () => bell());
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once: true}); else start();
})();
