/* LCNDA — 🖧 « Demander l'accès » : la page qu'un appareil inconnu voit en tapant l'adresse de l'ordinateur principal
 * (servie par la porte du wifi, electron/lan-gate.js ; rien de la généalogie). Trois gestes : 1. le nom de cet appareil et
 * le code d'invitation ; 2. « En attente » : le code à 6 chiffres, à comparer avec l'écran de l'ordinateur principal ;
 * 3. accepté : la page se recharge et l'app demande le mot de passe de la généalogie. Rien n'est gardé ici sauf le jeton
 * de l'appareil, dans un cookie que la page ne peut pas lire (HttpOnly). */
(() => {
    'use strict';
    const I = window.LCNDA_I18N;
    const t = (s, v) => (I ? I.t(s, v) : String(s).replace(/\{(\w+)\}/g, (_, k) => (v && k in v ? v[k] : `{${k}}`)));
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const root = document.getElementById('lan-pair');
    const cfg = window.LCNDA_LAN_PAIR || {invite: true};
    // 📱 venu du QR code « ＋ Ajouter un téléphone de terrain » (/terrain#i=CODE) : la demande propose cette sorte, le code est déjà là
    const hashInvite = (() => { try { return (new URLSearchParams(String(location.hash || '').slice(1)).get('i') || '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 12); } catch (_) { return ''; } })();
    let timer = null;
    const msg = (text, kind = '') => { const p = root.querySelector('[data-msg]'); if (p) { p.textContent = text; p.className = `lan-msg ${kind ? 'is-' + kind : ''}`; } };
    const guessName = () => { const ua = navigator.userAgent || ''; return /iPad|Tablet/i.test(ua) ? t('Tablette') : /iPhone|Android.+Mobile/i.test(ua) ? t('Téléphone') : t('Autre ordinateur'); };

    function step1(text = '') {
        clearInterval(timer);
        document.title = `🖧 ${t('Se connecter')}`;
        root.innerHTML = `<section class="lan-card"><div class="lan-ico" aria-hidden="true">${cfg.terrain ? '📱' : '🖧'}</div><h1>${esc(cfg.terrain ? t('📱 Envoyer des photos à l’ordinateur principal') : t('Se connecter à l’ordinateur principal'))}</h1>
            <p class="lan-lead">${esc(t('Cet appareil n’est pas encore autorisé. Demande l’accès : c’est sur l’ordinateur principal qu’on l’accepte.'))}</p>
            <form class="lan-form" autocomplete="off" novalidate>
                <label>${esc(t('Nom de cet appareil'))}<input name="name" maxlength="40" required value="${esc(guessName())}"></label>
                ${cfg.invite ? `<label>${esc(t('Code d’invitation'))} <small>${esc(t('(affiché sur l’ordinateur principal)'))}</small><input name="invite" maxlength="12" autocapitalize="characters" spellcheck="false" inputmode="text" placeholder="ABC-123" value="${esc(hashInvite)}"></label>` : ''}
                <button type="submit" class="lan-button">${esc(t('Demander l’accès'))}</button>
                <p data-msg class="lan-msg" role="status" aria-live="polite"></p></form></section>`;
        if (text) msg(text, 'error');
        const f = root.querySelector('form');
        (cfg.invite && !hashInvite ? f.elements.invite : f.elements.name).focus();
        f.addEventListener('submit', async e => {
            e.preventDefault();
            const name = f.elements.name.value.trim();
            if (!name) { msg(t('Donne un nom à cet appareil.'), 'error'); return; }
            f.querySelector('button').disabled = true;
            let r, j = {};
            try { r = await fetch('/__lan/demande', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({name, invite: cfg.invite ? f.elements.invite.value : '', kind: cfg.terrain ? 'terrain' : ''})}); j = await r.json().catch(() => ({})); }
            catch (_) { f.querySelector('button').disabled = false; msg(t('L’ordinateur principal ne répond pas (en veille, éteint, ou porte coupée).'), 'error'); return; }
            f.querySelector('button').disabled = false;
            if (r.ok && j.id) { step2(j); return; }
            const why = {invite: t('Code d’invitation faux ou périmé. Demande le code affiché sur l’ordinateur principal.'), pause: t('Trop d’essais : réessaie dans {n} min.', {n: Math.max(1, Math.ceil((j.wait || 60) / 60))}),
                pending: t('Une demande de cet appareil attend déjà sa réponse.'), busy: t('Trop de demandes en même temps : réessaie dans un instant.')}[j.error] || t('Demande refusée.');
            msg(why, 'error');
        });
    }

    function step2(req) {
        document.title = `🖧 ${t('En attente')}`;
        root.innerHTML = `<section class="lan-card"><div class="lan-ico" aria-hidden="true">⏳</div><h1>${esc(t('En attente'))}</h1>
            <p class="lan-lead">${esc(t('Va sur l’ordinateur principal et vérifie qu’il affiche ce code :'))}</p>
            <p class="lan-six" data-i18n-off>${esc(String(req.code).slice(0, 3))} ${esc(String(req.code).slice(3))}</p>
            <p class="lan-hint">${esc(t('Sans réponse en 2 minutes, la demande disparaît toute seule (refusée).'))}</p>
            <p data-msg class="lan-msg" role="status" aria-live="polite"></p></section>`;
        const poll = async () => {
            let j = {};
            try { const r = await fetch(`/__lan/etat?id=${encodeURIComponent(req.id)}&k=${encodeURIComponent(req.poll)}`, {cache: 'no-store'}); j = await r.json().catch(() => ({})); }
            catch (_) { msg(t('L’ordinateur principal ne répond pas (en veille, éteint, ou porte coupée).'), 'error'); return; }
            if (j.state === 'attente') return;
            clearInterval(timer);
            if (j.state === 'accepte') {
                root.innerHTML = `<section class="lan-card"><div class="lan-ico" aria-hidden="true">✓</div><h1>${esc(t('Accepté'))}</h1><p class="lan-lead">${esc(t('Ouverture de la généalogie… Elle demande ensuite son mot de passe : il est vérifié par l’ordinateur principal, jamais gardé ici.'))}</p></section>`;
                setTimeout(() => location.replace(cfg.terrain ? '/terrain' : cfg.famille ? '/famille.php' + location.hash : '/'), 900); // 👪 l'invitation (#inv=…) reste dans l'adresse, jamais envoyée au serveur
                return;
            }
            step1(j.state === 'refuse' ? t('Demande refusée.') : t('La demande a expiré (2 minutes sans réponse). Recommence.'));
        };
        timer = setInterval(poll, 2000);
    }
    step1();
})();
