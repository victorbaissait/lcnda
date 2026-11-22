/* LCNDA — 🔐 l'écran « … est verrouillée » (lib/verrou_page.php ; serveur : lib/verrou.php, glock_guard).
 * Un seul essai à la fois ; après un échec, le bouton attend le délai donné par le serveur (1 s, 2 s, 4 s… jusqu'à 60 s).
 * Rien n'est gardé dans le navigateur (ni le mot de passe, ni un brouillon) ; le champ est vidé après chaque essai.
 * « ⇄ Ouvrir une autre généalogie » : seulement les noms (le serveur n'en donne pas plus quand c'est verrouillé). */
(() => {
    'use strict';
    const t = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s).replace(/\{(\w+)\}/g, (_, k) => (v && k in v ? v[k] : `{${k}}`)));
    const $ = s => document.querySelector(s);
    const form = $('[data-glock-form]'), input = $('#glock-pw'), btn = $('[data-glock-open]'), msg = $('[data-glock-msg]');
    if (!form) return;
    const csrf = () => window.INSTALL_CSRF || '';
    const headers = () => ({'Content-Type': 'application/json', 'X-CSRF-Token': csrf(), 'X-Genealogy': window.LCNDA_GENEALOGY || 'main', ...(window.LCNDA_I18N && window.LCNDA_I18N.lang !== 'fr' ? {'X-LCNDA-Lang': window.LCNDA_I18N.lang} : {})});
    const post = (action, body) => fetch(`api.php?action=${action}`, {method: 'POST', credentials: 'same-origin', headers: headers(), body: JSON.stringify({...body, csrf: csrf()})});
    let timer = 0;
    const say = (text, kind = '') => { msg.textContent = text; msg.className = 'gl-msg' + (kind ? ' is-' + kind : ''); };
    function wait(sec) {
        clearInterval(timer);
        let n = Math.max(0, Math.ceil(sec));
        if (!n) { btn.disabled = false; return; }
        btn.disabled = true;
        const tick = () => { if (n <= 0) { clearInterval(timer); btn.disabled = false; btn.textContent = t('Ouvrir'); input.focus(); return; } btn.textContent = t('Patiente {n} s', {n}); n--; };
        tick(); timer = setInterval(tick, 1000);
    }
    form.addEventListener('submit', async e => {
        e.preventDefault();
        if (btn.disabled) return;
        const password = input.value;
        if (!password) { say(t('Tape le mot de passe.'), 'error'); input.focus(); return; }
        btn.disabled = true; say(t('Vérification…'));
        let r, j = {};
        try { r = await post('glock_unlock', {password}); j = await r.json().catch(() => ({})); }
        catch (_) { say(t('Le serveur de l’app ne répond pas. Réessaie.'), 'error'); btn.disabled = false; return; }
        finally { input.value = ''; }
        if (r.ok && j.ok) {
            say(t('Ouverture…'), 'ok');
            // la page complète, avec ses données, est demandée seulement maintenant (aucune copie gardée de l'écran de verrou)
            location.replace(location.pathname + location.search + (location.hash || ''));
            return;
        }
        say(j.error || t('Mot de passe incorrect.'), 'error');
        wait(Number(j.wait) || 0);
        if (!j.wait) btn.disabled = false;
        input.focus();
    });
    // le délai d'un essai raté plus tôt (autre fenêtre, page rechargée) est respecté dès l'arrivée
    fetch('api.php?action=glock_state', {credentials: 'same-origin', headers: {'X-Genealogy': window.LCNDA_GENEALOGY || 'main'}})
        .then(r => r.json()).then(s => { if (s && s.unlocked) location.replace(location.pathname + location.search); else if (s && s.wait) { say(t('Patiente {n} s avant de réessayer.', {n: s.wait}), 'error'); wait(s.wait); } }).catch(() => {});

    const forgot = $('[data-glock-forgot]'), forgotText = $('[data-glock-forgot-text]');
    forgot.addEventListener('click', () => { forgotText.hidden = !forgotText.hidden; forgot.setAttribute('aria-expanded', String(!forgotText.hidden)); });

    const list = $('[data-glock-list]');
    $('[data-glock-others]')?.addEventListener('click', async () => {
        if (!list.hidden) { list.hidden = true; return; }
        list.hidden = false; list.textContent = t('Chargement…');
        let data;
        try { data = await (await fetch('api.php?action=genealogies', {credentials: 'same-origin', headers: {'X-Genealogy': window.LCNDA_GENEALOGY || 'main'}})).json(); }
        catch (_) { list.textContent = t('Le serveur de l’app ne répond pas. Réessaie.'); return; }
        const others = (data.genealogies || []).filter(g => !g.active);
        list.textContent = '';
        if (!others.length) { list.textContent = t('Il n’y a pas d’autre généalogie.'); return; }
        const ul = document.createElement('ul'); ul.className = 'gl-gen-list';
        for (const g of others) {
            const li = document.createElement('li');
            const b = document.createElement('button'); b.type = 'button'; b.className = 'gl-gen';
            b.textContent = (g.locked ? '🔐 ' : '🌳 ') + String(g.name || ''); // textContent : un nom piégé reste du texte
            b.setAttribute('data-i18n-off', '');
            b.addEventListener('click', async () => {
                b.disabled = true;
                try {
                    const r = await post('genealogy_switch', {id: String(g.id ?? '')});
                    if (!r.ok) throw new Error();
                    ['genealogie-last-route', 'genealogie-baissait-ui-v2'].forEach(k => { try { localStorage.removeItem(k); } catch (_) {} });
                    location.replace(location.pathname);
                } catch (_) { b.disabled = false; say(t('Impossible d’ouvrir cette généalogie.'), 'error'); }
            });
            li.appendChild(b); ul.appendChild(li);
        }
        list.appendChild(ul);
    });
})();
