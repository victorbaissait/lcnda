/* LCNDA — 👪 La page de la famille (maquette docs/design/site-familial-comptes.html, partie 2 « Ce que voit un cousin qui
 * propose » ; serveur : famille.php + lib/comptes_famille.php). Une page volontairement simple, pas toute l'app : chercher,
 * la fiche et l'arbre autour, « ✎ Proposer une correction » à côté de chaque ligne, « ✎ Proposer un ajout » (souvenir, photo,
 * enfant, conjoint, parent — avec « existe peut-être déjà »), « 📋 Mes propositions ». Un compte 🌿 écrit directement dans sa
 * branche (avec ↶ Annuler). Sur téléphone : la même chose en colonne.
 * Sécurité : aucun texte venu du serveur n'est posé autrement que par esc() ; aucun script en ligne (CSP script-src 'self') ;
 * l'invitation (#inv=…) est lue puis retirée de l'adresse : elle ne part jamais dans une adresse demandée au serveur. */
(() => {
    'use strict';
    const I = window.LCNDA_I18N;
    const t = (s, v) => (I ? I.t(s, v) : String(s).replace(/\{(\w+)\}/g, (_, k) => (v && k in v ? v[k] : `{${k}}`)));
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const root = document.getElementById('fam');
    if (!root) return;
    const S = {csrf: '', g: '', state: null, person: null, invite: '', code: '', busy: false};
    const LABELS = {first_name: 'Prénom', last_name: 'Nom', occupation: 'Métier', BIRT: 'Naissance', BAPM: 'Baptême', DEAT: 'Décès', BURI: 'Inhumation'};
    const ROLE = {lire: '👁 lire', proposer: '✎ proposer', branche: '🌿 modifier une branche', gerer: '⚙ gérer'};

    // l'invitation venue du lien ou du QR code : lue une fois, puis retirée de l'adresse
    (() => {
        try {
            const h = new URLSearchParams(String(location.hash || '').slice(1));
            const inv = (h.get('inv') || '').toLowerCase().replace(/[^a-f0-9]/g, '').slice(0, 48);
            if (inv.length === 48) { S.invite = inv; history.replaceState(null, '', location.pathname); }
        } catch (_) {}
    })();

    /* ═════ le serveur ═════ */
    async function call(action, {q = {}, body = null, form = null} = {}) {
        const u = new URL('famille.php', location.href);
        u.searchParams.set('action', action);
        Object.entries(q).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, v); });
        const init = {credentials: 'same-origin', headers: {Accept: 'application/json'}};
        if (S.g) init.headers['X-Genealogy'] = S.g;
        if (body || form) {
            init.method = 'POST';
            init.headers['X-CSRF-Token'] = S.csrf;
            if (form) { form.append('csrf', S.csrf); init.body = form; }
            else { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify({...body, csrf: S.csrf}); }
        }
        let r;
        try { r = await fetch(u, init); } catch (_) { const e = new Error(t('L’ordinateur principal ne répond pas : il est peut-être éteint, ou l’app est fermée.')); e.status = 0; throw e; }
        const d = await r.json().catch(() => ({error: t('Réponse illisible.')}));
        if (d.csrf) S.csrf = d.csrf;
        if (r.status === 401 && d.login) { S.state = null; showLogin(t('Ta séance s’est fermée : reconnecte-toi.')); const e = new Error(''); e.silent = true; throw e; }
        if (!r.ok || d.error) { const e = new Error(d.error || `Erreur ${r.status}`); e.status = r.status; e.data = d; throw e; }
        return d;
    }

    /* ═════ petits morceaux ═════ */
    let toastT = 0;
    function toast(text, {undo = null, kind = ''} = {}) {
        let el = document.getElementById('fam-toast');
        if (!el) { el = document.createElement('div'); el.id = 'fam-toast'; el.className = 'fam-toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
        el.className = `fam-toast ${kind ? 'is-' + kind : ''}`;
        el.innerHTML = `<span>${esc(text)}</span>${undo ? `<button type="button" data-fam-undo>${esc(t('↶ Annuler'))}</button>` : ''}`;
        el.hidden = false;
        clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, undo ? 10000 : 5000);
        if (undo) el.querySelector('[data-fam-undo]').addEventListener('click', async () => { el.hidden = true; try { await undo(); toast(t('Annulé.')); } catch (e) { if (!e.silent) toast(e.message, {kind: 'error'}); } }, {once: true});
    }
    const valueText = v => (v && typeof v === 'object' ? [v.date, v.place].filter(Boolean).join(', ') : String(v ?? ''));
    const relHtml = r => {
        if (!r) return '';
        if (r.id) return `<a class="fam-chip" href="#p=${Number(r.id)}" data-fam-go="${Number(r.id)}">${esc(r.name)}${r.years ? ` <small>${esc(r.years)}</small>` : ''}</a>`;
        if (r.first) return `<span class="fam-chip is-living">${esc(r.first)} <small>${esc(t('(vivant·e)'))}</small></span>`;
        return `<span class="fam-chip is-living">${esc(t('Personne vivante'))}</span>`;
    };
    const head = () => {
        const a = S.state?.account;
        return `<header class="fam-top"><a class="fam-brand" href="#" data-fam-home>👪 <b>${esc(S.state?.genealogy || t('La famille'))}</b></a>
            <form class="fam-search" data-fam-search role="search"><input type="search" name="q" placeholder="${esc(t('Chercher un nom…'))}" aria-label="${esc(t('Chercher un nom…'))}" autocomplete="off"><button type="submit">${esc(t('Chercher'))}</button></form>
            ${a ? `<div class="fam-me"><span class="fam-who">${esc(a.name)} · ${esc(t(ROLE[a.role] || a.role))}</span>
                ${a.can_propose ? `<button type="button" class="fam-link" data-fam-mine>${esc(t('📋 Mes propositions'))}</button>` : ''}
                <button type="button" class="fam-link" data-fam-logout>${esc(t('Se déconnecter'))}</button></div>` : ''}</header>`;
    };
    const page = inner => { root.innerHTML = head() + `<div class="fam-page">${inner}</div>`; };

    /* ═════ entrer ═════ */
    async function start() {
        try { S.state = await call('state'); } catch (e) { if (!e.silent) root.innerHTML = `<section class="fam-card"><h1>👪</h1><p class="fam-err">${esc(e.message)}</p></section>`; return; }
        S.csrf = S.state.csrf; S.g = S.state.g;
        document.title = `👪 ${S.state.genealogy}`;
        if (S.invite) return showJoin();
        if (!S.state.logged) return showLogin();
        route();
    }
    function showLogin(msg = '') {
        document.title = `👪 ${t('Se connecter')}`;
        root.innerHTML = `<section class="fam-card"><h1>👪 ${esc(S.state?.genealogy || t('La famille'))}</h1>
            <p class="fam-lead">${esc(t('Connecte-toi avec ton identifiant et le mot de passe que tu as choisi.'))}</p>
            <form class="fam-form" data-fam-login autocomplete="on" novalidate>
                <label>${esc(t('Identifiant'))}<input name="login" autocomplete="username" autocapitalize="none" required value="${esc(S.state?.login_hint || '')}"></label>
                <label>${esc(t('Mot de passe'))}<input name="password" type="password" autocomplete="current-password" required></label>
                <button type="submit" class="fam-button">${esc(t('Se connecter'))}</button>
                <p class="fam-msg" data-fam-msg role="alert">${esc(msg)}</p></form>
            <p><button type="button" class="fam-link" data-fam-join>${esc(t('J’ai reçu une invitation (code à 8 chiffres)'))}</button></p></section>`;
        const f = root.querySelector('[data-fam-login]');
        (f.elements.login.value ? f.elements.password : f.elements.login).focus();
        f.addEventListener('submit', async e => {
            e.preventDefault();
            try { await call('login', {body: {login: f.elements.login.value, password: f.elements.password.value}}); S.state = await call('state'); route(); }
            catch (err) { if (!err.silent) { root.querySelector('[data-fam-msg]').textContent = err.message; f.elements.password.value = ''; } }
        });
        root.querySelector('[data-fam-join]').addEventListener('click', () => showJoin());
    }
    function showJoin() {
        document.title = `👪 ${t('Bienvenue')}`;
        root.innerHTML = `<section class="fam-card"><h1>👪 ${esc(t('Bienvenue !'))}</h1>
            <p class="fam-lead">${esc(S.invite ? t('Tu as été invité·e à regarder l’arbre de la famille. Choisis ton mot de passe (8 caractères au moins) : il ne sera demandé qu’à toi.') : t('Tape le code d’invitation à 8 chiffres reçu de la personne qui tient l’arbre, puis choisis ton mot de passe.'))}</p>
            <form class="fam-form" data-fam-joinform novalidate>
                ${S.invite ? '' : `<label>${esc(t('Code d’invitation'))}<input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="12" required></label>`}
                <label>${esc(t('Mot de passe'))}<input name="password" type="password" autocomplete="new-password" minlength="8" required></label>
                <label>${esc(t('Le même mot de passe, encore'))}<input name="password2" type="password" autocomplete="new-password" minlength="8" required></label>
                <button type="submit" class="fam-button">${esc(t('Choisir ce mot de passe'))}</button>
                <p class="fam-msg" data-fam-msg role="alert"></p></form>
            ${S.state?.logged ? '' : `<p><button type="button" class="fam-link" data-fam-back>${esc(t('J’ai déjà un mot de passe'))}</button></p>`}</section>`;
        const f = root.querySelector('[data-fam-joinform]');
        root.querySelector('[data-fam-back]')?.addEventListener('click', () => { S.invite = ''; showLogin(); });
        f.addEventListener('submit', async e => {
            e.preventDefault();
            const body = {password: f.elements.password.value, password2: f.elements.password2.value};
            if (S.invite) body.token = S.invite; else body.code = f.elements.code.value;
            try {
                const r = await call('join', {body});
                S.invite = ''; S.state = await call('state');
                route();
                toast(t('Ton identifiant : {login} — garde-le avec ton mot de passe.', {login: r.login}));
            } catch (err) { if (!err.silent) root.querySelector('[data-fam-msg]').textContent = err.message; }
        });
    }

    /* ═════ les écrans ═════ */
    function route() {
        const h = String(location.hash || '');
        const m = h.match(/^#p=(\d+)$/);
        if (m) return showPerson(Number(m[1]));
        if (h === '#mes') return showMine();
        if (S.state?.home) return showPerson(S.state.home);
        page(`<section class="fam-card"><p>${esc(t('Cherche un nom pour commencer.'))}</p></section>`);
        root.querySelector('[data-fam-search] input')?.focus();
    }
    window.addEventListener('hashchange', () => { if (S.state?.logged) route(); });

    async function search(q) {
        let d;
        try { d = await call('search', {q: {q}}); } catch (e) { if (!e.silent) toast(e.message, {kind: 'error'}); return; }
        page(`<section class="fam-card"><h2>${esc(t('Résultats pour « {q} »', {q}))}</h2>${d.people.length ? `<ul class="fam-results">${d.people.map(p => `<li>${relHtml(p)}</li>`).join('')}</ul>` : `<p class="fam-muted">${esc(t('Personne de ce nom (parmi les fiches que tu peux voir).'))}</p>`}</section>`);
    }

    async function showPerson(id) {
        let d;
        try { d = await call('person', {q: {id}}); } catch (e) { if (!e.silent) page(`<section class="fam-card"><p class="fam-err">${esc(e.message)}</p></section>`); return; }
        S.person = d;
        const p = d.person, can = d.can;
        const act = can.edit || can.propose;
        const factRow = f => `<tr data-fam-fact="${esc(f.field)}"><th scope="row">${esc(f.label)}</th><td>${esc(valueText(f.value)) || `<span class="fam-muted">—</span>`}</td>
            <td class="fam-act">${act && !p.locked ? `<button type="button" class="fam-pen" data-fam-edit="${esc(f.field)}" title="${esc(can.edit ? t('✎ Modifier') : t('✎ Proposer une correction'))}" aria-label="${esc((can.edit ? t('✎ Modifier') : t('✎ Proposer une correction')) + ' : ' + f.label)}">✎</button>` : ''}</td></tr>`;
        const couples = p.couples.map(c => `<div class="fam-couple"><div><span class="fam-k">${esc(t('Conjoint'))}</span> ${c.spouse ? relHtml(c.spouse) : '<span class="fam-muted">?</span>'}${c.marriage ? ` <small>· ${esc(t('mariage'))} ${esc(valueText(c.marriage))}</small>` : ''}</div>
            ${c.children.length ? `<div><span class="fam-k">${esc(t('Enfants'))}</span> ${c.children.map(relHtml).join(' ')}</div>` : ''}</div>`).join('');
        page(`<article class="fam-card fam-person">
            <h1>${esc(p.name)}</h1><p class="fam-years">${esc(p.years)}${p.locked ? ` · 🔒 ${esc(t('fiche verrouillée'))}` : ''}${p.pending ? ` · ⏳ ${esc(t('{n} proposition(s) en attente', {n: p.pending}))}` : ''}</p>
            ${act && !p.locked ? `<div class="fam-actions"><button type="button" class="fam-button" data-fam-add>${esc(can.edit ? t('＋ Ajouter') : t('✎ Proposer un ajout'))}</button></div>` : ''}
            ${can.edit ? `<p class="fam-hint">🌿 ${esc(t('Cette fiche est dans ta branche : ce que tu changes est écrit directement, noté au journal, et peut être annulé (↶).'))}</p>` : ''}
            <table class="fam-facts"><tbody>${p.facts.map(factRow).join('')}</tbody></table>
            <div data-fam-editor></div>
            ${p.events.length ? `<h2>${esc(t('Autres événements'))}</h2><ul class="fam-ev">${p.events.map(e => `<li><b>${esc(e.label)}</b> ${esc(valueText(e))}</li>`).join('')}</ul>` : ''}
            <h2>${esc(t('La famille autour'))}</h2>
            ${p.parents.length ? `<div><span class="fam-k">${esc(t('Parents'))}</span> ${p.parents.map(relHtml).join(' ')}</div>` : ''}
            ${couples || (!p.parents.length ? `<p class="fam-muted">${esc(t('Aucun proche connu.'))}</p>` : '')}
            ${p.photos.length ? `<h2>${esc(t('Photos'))}</h2><div class="fam-photos">${p.photos.map(ph => `<figure><img loading="lazy" alt="${esc(ph.title)}" src="famille.php?action=media&amp;id=${Number(ph.id)}"><figcaption>${esc(ph.title)}</figcaption></figure>`).join('')}</div>` : ''}
            ${p.notes.length ? `<h2>${esc(t('Notes'))}</h2>${p.notes.map(n => `<p class="fam-note">${esc(n).replace(/\n/g, '<br>')}</p>`).join('')}` : ''}
            </article>`);
        document.title = `👪 ${p.name}`;
    }

    /* l'éditeur d'une ligne (proposer une correction, ou modifier dans sa branche) */
    function factEditor(field) {
        const d = S.person; if (!d) return;
        const f = d.person.facts.find(x => x.field === field); if (!f) return;
        const ev = f.type === 'event';
        const direct = d.can.edit;
        const box = root.querySelector('[data-fam-editor]');
        box.innerHTML = `<form class="fam-form fam-editor" data-fam-factform data-field="${esc(field)}" novalidate>
            <h3>${esc(direct ? t('✎ Modifier : {what}', {what: f.label}) : t('✎ Proposer une correction : {what}', {what: f.label}))}</h3>
            <p class="fam-muted">${esc(t('Aujourd’hui :'))} ${esc(valueText(f.value)) || '—'}</p>
            ${ev ? `<label>${esc(t('Date'))}<input name="date" value="${esc(f.value.date)}" placeholder="${esc(t('ex. 4 février 1951, vers 1850'))}"></label>
                <label>${esc(t('Lieu'))}<input name="place" value="${esc(f.value.place)}" placeholder="${esc(t('ex. Naves'))}"></label>`
                : `<label>${esc(f.label)}<input name="value" value="${esc(f.value)}"></label>`}
            <label>${esc(t('D’où ça vient ? (facultatif)'))}<textarea name="comment" rows="2" placeholder="${esc(t('ex. C’est écrit sur le livret de famille de ma grand-mère.'))}"></textarea></label>
            ${d.can.attach ? `<label>${esc(t('📎 Une photo de l’acte (facultatif)'))}<input name="photo" type="file" accept="image/jpeg,image/png,image/webp"></label>` : ''}
            ${direct ? '' : `<p class="fam-hint">${esc(t('Ta proposition est envoyée à la personne qui tient l’arbre. Tu verras ici si elle l’accepte.'))}</p>`}
            <div class="fam-actions"><button type="button" class="fam-link" data-fam-cancel>${esc(t('Annuler'))}</button><button type="submit" class="fam-button">${esc(direct ? t('Enregistrer') : t('Envoyer la proposition'))}</button></div>
            <p class="fam-msg" data-fam-msg role="alert"></p></form>`;
        box.scrollIntoView({block: 'nearest'});
        box.querySelector('input,textarea')?.focus();
    }
    /* « Proposer un ajout » : un souvenir, une photo, une personne (enfant, conjoint, parent) */
    function addEditor(kind = '') {
        const d = S.person; if (!d) return;
        const direct = d.can.edit;
        const box = root.querySelector('[data-fam-editor]');
        const choices = [['note', t('💬 un souvenir')], ['photo', t('🖼 une photo')], ['enfant', t('👶 un enfant')], ['conjoint', t('💍 un conjoint')], ['parent', t('👪 un parent')]]
            .filter(([k]) => k !== 'photo' || d.can.attach);
        const pers = ['enfant', 'conjoint', 'parent'].includes(kind);
        box.innerHTML = `<form class="fam-form fam-editor" data-fam-addform data-kind="${esc(kind)}" novalidate>
            <h3>${esc(direct ? t('＋ Ajouter à {name}', {name: d.person.name}) : t('✎ Proposer un ajout à {name}', {name: d.person.name}))}</h3>
            <div class="fam-choices" role="radiogroup" aria-label="${esc(t('Qu’est-ce que tu veux ajouter ?'))}">${choices.map(([k, l]) => `<button type="button" role="radio" aria-checked="${k === kind}" class="${k === kind ? 'is-on' : ''}" data-fam-kind="${k}">${esc(l)}</button>`).join('')}</div>
            ${kind === 'note' ? `<label>${esc(t('Ton souvenir'))}<textarea name="text" rows="5" required></textarea></label>` : ''}
            ${kind === 'photo' ? `<label>${esc(t('La photo'))}<input name="photo" type="file" accept="image/jpeg,image/png,image/webp" required></label>
                <label>${esc(t('Ce qu’on y voit'))}<input name="caption" placeholder="${esc(t('ex. Antoine et Marie devant la ferme, vers 1925'))}"></label>
                <label>${esc(t('D’où ça vient ?'))}<input name="origin" placeholder="${esc(t('ex. album de ma grand-mère'))}"></label>` : ''}
            ${pers ? `<div class="fam-two"><label>${esc(t('Prénom'))}<input name="first_name" data-fam-sim></label><label>${esc(t('Nom'))}<input name="last_name" data-fam-sim value="${kind === 'enfant' ? esc(d.person.last_name) : ''}"></label></div>
                <label>${esc(t('Sexe'))}<select name="gender"><option value="unknown">${esc(t('je ne sais pas'))}</option><option value="female">${esc(t('femme'))}</option><option value="male">${esc(t('homme'))}</option></select></label>
                <div class="fam-two"><label>${esc(t('Naissance : date'))}<input name="birth_date" data-fam-sim></label><label>${esc(t('Naissance : lieu'))}<input name="birth_place"></label></div>
                <div class="fam-two"><label>${esc(t('Décès : date'))}<input name="death_date"></label><label>${esc(t('Décès : lieu'))}<input name="death_place"></label></div>
                <div data-fam-similar></div>` : ''}
            ${kind && kind !== 'photo' && kind !== 'note' && d.can.attach ? `<label>${esc(t('📎 Une photo (facultatif)'))}<input name="photo" type="file" accept="image/jpeg,image/png,image/webp"></label>` : ''}
            ${kind && kind !== 'note' ? `<label>${esc(t('D’où ça vient ? (facultatif)'))}<textarea name="comment" rows="2"></textarea></label>` : ''}
            ${kind && !direct ? `<p class="fam-hint">${esc(t('La personne qui tient l’arbre verra ta proposition avant qu’elle n’entre dans l’arbre.'))}</p>` : ''}
            <div class="fam-actions"><button type="button" class="fam-link" data-fam-cancel>${esc(t('Annuler'))}</button>${kind ? `<button type="submit" class="fam-button">${esc(direct ? t('Enregistrer') : t('Envoyer'))}</button>` : ''}</div>
            <p class="fam-msg" data-fam-msg role="alert"></p></form>`;
        box.scrollIntoView({block: 'nearest'});
    }
    let simT = 0;
    function similar(form) {
        clearTimeout(simT);
        simT = setTimeout(async () => {
            const box = form.querySelector('[data-fam-similar]'); if (!box) return;
            const first = form.elements.first_name.value.trim(), last = form.elements.last_name.value.trim();
            if (first.length < 2 || last.length < 2) { box.innerHTML = ''; return; }
            try {
                const r = await call('similar', {q: {first, last, year: form.elements.birth_date.value}});
                box.innerHTML = r.people.length ? `<p class="fam-warn">⚠ ${esc(t('Une fiche existe peut-être déjà :'))} ${r.people.map(relHtml).join(' ')}</p>` : '';
            } catch (_) { box.innerHTML = ''; }
        }, 350);
    }

    async function send(form, payload) {
        if (S.busy) return; S.busy = true;
        const d = S.person, direct = d.can.edit;
        const msg = form.querySelector('[data-fam-msg]'); msg.textContent = '';
        const file = form.elements.photo?.files?.[0] || null;
        try {
            let r;
            const body = {person: d.person.id, ...payload};
            if (file) {
                const fd = new FormData();
                Object.entries(body).forEach(([k, v]) => { if (v && typeof v === 'object') Object.entries(v).forEach(([kk, vv]) => fd.append(`${k}[${kk}]`, vv)); else fd.append(k, v); });
                fd.append('photo', file);
                r = await call(direct ? 'edit' : 'propose', {form: fd});
            } else r = await call(direct ? 'edit' : 'propose', {body});
            await showPerson(d.person.id);
            if (direct) toast(t('Enregistré dans l’arbre.'), {undo: async () => { await call('edit_undo', {body: {id: r.id}}); await showPerson(d.person.id); }});
            else toast(t('Proposition envoyée : la personne qui tient l’arbre la regardera.'), {undo: async () => { await call('withdraw', {body: {id: r.id}}); await showPerson(d.person.id); }});
        } catch (e) { if (!e.silent) msg.textContent = e.message; }
        finally { S.busy = false; }
    }

    async function showMine() {
        let d;
        try { d = await call('mine'); } catch (e) { if (!e.silent) toast(e.message, {kind: 'error'}); return; }
        const icon = {attente: '⏳', acceptee: '✓', refusee: '✕', retiree: '↩', directe: '🌿', annulee: '↶'};
        const word = {attente: t('en attente'), acceptee: t('acceptée'), refusee: t('refusée'), retiree: t('retirée'), annulee: t('annulée')};
        page(`<section class="fam-card"><h1>${esc(t('📋 Mes propositions'))}</h1>
            <p class="fam-sum">${esc(t('{a} acceptée(s) ✓ · {w} en attente ⏳ · {r} refusée(s) ✕', {a: d.count.acceptee, w: d.count.attente, r: d.count.refusee}))}</p>
            ${d.items.length ? `<ul class="fam-mine">${d.items.map(x => `<li class="is-${esc(x.status)}"><span class="fam-st" aria-hidden="true">${icon[x.status] || '•'}</span>
                <div><b>${x.person ? `<a href="#p=${Number(x.person)}">${esc(x.label)}</a>` : esc(t('Fiche'))}</b> — ${esc(x.what)} <small>· ${esc(x.direct ? t('modifié directement') : (word[x.status] || x.status))}</small>
                ${x.note ? `<p class="fam-note">« ${esc(x.note)} »</p>` : ''}</div>
                ${x.status === 'attente' ? `<button type="button" class="fam-link" data-fam-withdraw="${Number(x.id)}">${esc(t('Retirer'))}</button>` : ''}</li>`).join('')}</ul>` : `<p class="fam-muted">${esc(t('Aucune proposition pour l’instant.'))}</p>`}</section>`);
    }

    /* ═════ les gestes ═════ */
    root.addEventListener('click', async e => {
        const tg = e.target;
        if (tg.closest('[data-fam-home]')) { e.preventDefault(); location.hash = ''; route(); return; }
        if (tg.closest('[data-fam-mine]')) { location.hash = '#mes'; return; }
        if (tg.closest('[data-fam-logout]')) { try { await call('logout', {body: {}}); } catch (_) {} S.state = await call('state').catch(() => S.state); showLogin(); return; }
        const ed = tg.closest('[data-fam-edit]'); if (ed) { factEditor(ed.dataset.famEdit); return; }
        if (tg.closest('[data-fam-add]')) { addEditor(''); return; }
        const k = tg.closest('[data-fam-kind]'); if (k) { addEditor(k.dataset.famKind); return; }
        if (tg.closest('[data-fam-cancel]')) { const b = root.querySelector('[data-fam-editor]'); if (b) b.innerHTML = ''; return; }
        const w = tg.closest('[data-fam-withdraw]');
        if (w) {
            const id = Number(w.dataset.famWithdraw);
            try { await call('withdraw', {body: {id}}); await showMine(); toast(t('Proposition retirée.'), {undo: async () => { await call('withdraw', {body: {id, undo: 1}}); await showMine(); }}); }
            catch (err) { if (!err.silent) toast(err.message, {kind: 'error'}); }
        }
    });
    root.addEventListener('input', e => { const f = e.target.closest('[data-fam-addform]'); if (f && e.target.matches('[data-fam-sim]')) similar(f); });
    root.addEventListener('submit', e => {
        const s = e.target.closest('[data-fam-search]');
        if (s) { e.preventDefault(); const q = s.elements.q.value.trim(); if (q) search(q); return; }
        const ff = e.target.closest('[data-fam-factform]');
        if (ff) {
            e.preventDefault();
            const field = ff.dataset.field;
            const value = ff.elements.value ? ff.elements.value.value : {date: ff.elements.date.value, place: ff.elements.place.value};
            send(ff, {kind: 'fait', field, value, comment: ff.elements.comment.value});
            return;
        }
        const af = e.target.closest('[data-fam-addform]');
        if (af) {
            e.preventDefault();
            const kind = af.dataset.kind, el = af.elements;
            if (kind === 'note') return send(af, {kind: 'note', text: el.text.value});
            if (kind === 'photo') return send(af, {kind: 'photo', caption: el.caption.value, origin: el.origin.value, comment: el.comment?.value || ''});
            return send(af, {kind: 'personne', relation: kind, first_name: el.first_name.value, last_name: el.last_name.value, gender: el.gender.value,
                birth: {date: el.birth_date.value, place: el.birth_place.value}, death: {date: el.death_date.value, place: el.death_place.value}, comment: el.comment?.value || ''});
        }
    });
    root.addEventListener('click', e => { const a = e.target.closest('a[data-fam-go]'); if (a) { e.preventDefault(); location.hash = `#p=${Number(a.dataset.famGo)}`; } });

    start();
})();
