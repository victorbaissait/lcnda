/* ▶ Visite guidée (validée) : 6 étapes qui montrent les vrais boutons de l'app.
 *
 * 1 créer une fiche · 2 ajouter un parent · 3 ajouter une photo · 4 un événement et son lieu
 * 5 faire une sauvegarde · 6 où sont les Réglages et la FAQ.
 *
 * Chaque étape : une bulle qui pointe le vrai bouton (halo autour, le reste un peu assombri),
 * « Précédent », « Suivant » (« Terminer » à la fin), « Passer la visite », « 2 / 6 ».
 * On peut cliquer le bouton entouré pour le faire pour de vrai : la visite se met en pause
 * tant qu'une fenêtre de l'app est ouverte, puis reprend à l'étape suivante.
 * Un bouton caché ou absent (fiche verrouillée, bloc masqué, onglet retiré…) : l'étape est sautée.
 * Clavier → ← Échap, annonce aria-live, mode sombre, 390 px, « Réduire les animations ».
 * Jamais en mode simple (html.ms-open) ni en consultation (body.is-kiosk).
 * « Déjà vue » retenue sur cet appareil (localStorage « genealogie-visite-guidee »).
 *
 * API : window.LCNDA_EXT.tour = {start, offer, stop, isActive, seen, forget, steps}
 *       window.LCNDA_APP.startTour(opts) = LCNDA_EXT.tour.start(opts)
 *   start({force, at})  lance la visite tout de suite (même déjà vue) ; rend false si impossible ici
 *   offer()             au premier lancement : propose la visite (petite bulle « ▶ Commencer · Plus tard ·
 *                       Ne plus proposer ») seulement si elle n'a jamais été vue ni refusée sur cet appareil
 * Relancer : Réglages → FAQ / tuto → « ▶ Relancer la visite guidée », recherche rapide (« visite »),
 * ou tout bouton [data-tour-start].
 */
(function () {
    'use strict';
    const KEY = 'genealogie-visite-guidee';
    const A = () => window.LCNDA_APP || {};
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    // espaces insécables du français : jamais « : » ou « » » seuls en début de ligne
    const fr = t => String(t).replace(/ ([:;?!»])/g, '\u00a0$1').replace(/« /g, '«\u00a0');

    const lsGet = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null') || {}; } catch (_) { return {}; } };
    const lsSet = v => { try { localStorage.setItem(KEY, JSON.stringify({...lsGet(), ...v})); } catch (_) {} };

    const blocked = () => document.documentElement.classList.contains('ms-open') || document.body.classList.contains('is-kiosk')
        || !!document.querySelector('#app.is-not-ready') || !!document.querySelector('.ms-root:not([hidden])');
    const calm = () => document.documentElement.classList.contains('a11y-calm') || !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const dialogOpen = () => !!document.querySelector('dialog[open]');

    /* ───── aller au bon écran avant de chercher le bouton ───── */
    const st = () => A().state || {};
    async function goPersons() {
        if (st().module !== 'personnes') { try { await A().setModule?.('personnes'); } catch (_) {} }
    }
    async function goSheet() {
        await goPersons();
        // une fiche ouverte (l'écran Personnes ouvre la dernière, ou la première)
        if (!document.querySelector('#workspace .person-page')) {
            const first = document.querySelector('#sidebar-content [data-person-id]');
            if (first && !st().currentPersonId) first.click();
        }
    }
    async function goSettings(tab) {
        if (st().module === 'maintenance' && (!tab || st().maintenanceTab === tab)) return;
        if (tab && st()) st().maintenanceTab = tab;
        try { await A().setModule?.('maintenance'); } catch (_) {}
    }
    /* un bloc de la fiche rangé dans une section repliée ou un autre onglet : on l'ouvre (comme « ↗ Santé ») */
    function revealIn(el) {
        const card = el.closest('[data-pblock]');
        if (card && window.LCNDA_SECTIONS?.revealBlock) { try { window.LCNDA_SECTIONS.revealBlock(card.dataset.pblock, {scroll: false}); } catch (_) {} }
    }

    const STEPS = [
        {id: 'fiche', icon: '👤', title: 'Créer une fiche',
            text: 'Chaque personne a sa fiche. Ce bouton en crée une : un prénom, un nom, et c’est parti.',
            go: goPersons, targets: ['#new-person']},
        {id: 'parent', icon: '👪', title: 'Ajouter un parent',
            text: 'Sur une fiche, le « ＋ » de « Parents » relie un père ou une mère : choisis une fiche qui existe, ou crée-la. C’est comme ça que l’arbre se construit.',
            go: goSheet, reveal: true, targets: ['#workspace [data-empty-click=\'[data-add-relation="parent"]\']', '#workspace [data-add-relation="parent"]']},
        {id: 'photo', icon: '📷', title: 'Ajouter une photo',
            text: 'Ici, tu ajoutes des photos et des actes à la fiche : prends-les dans tes médias, ou glisse-les depuis l’ordinateur.',
            go: goSheet, reveal: true, targets: ['#workspace [data-empty-click="[data-add-media-inline]"]', '#workspace [data-add-media-inline]']},
        {id: 'evenement', icon: '📅', title: 'Un événement et son lieu',
            text: 'Naissance, mariage, décès… Ajoute un événement avec sa date et son lieu : tape les premières lettres de la commune, l’app la trouve.',
            go: goSheet, reveal: true, targets: ['#workspace [data-add-event-inline]']},
        {id: 'sauvegarde', icon: '💾', title: 'Faire une sauvegarde',
            text: 'De temps en temps, fais une sauvegarde : ce fichier garde toute ta généalogie et tes photos. Range-le sur une clé USB ou un autre disque.',
            go: () => goSettings('export'), targets: ['#workspace a[href*="export_full_backup"]']},
        {id: 'reglages', icon: '⚙️', title: 'Les Réglages et l’aide',
            text: 'Tout se règle ici : apparence, import, sauvegardes… Dans les Réglages, la page « FAQ / tuto » répond à tes questions ; tu peux aussi y relancer cette visite.',
            go: null, targets: ['.main-nav .nav-item[data-module="maintenance"]']},
    ];

    const visible = el => {
        if (!el || !el.isConnected || el.closest('[hidden]')) return false;
        const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return false;
        for (let a = el; a && a !== document.body; a = a.parentElement) { const cs = getComputedStyle(a); if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false; }
        return true;
    };
    function findTarget(step) {
        for (const sel of step.targets) {
            let list = []; try { list = [...document.querySelectorAll(sel)]; } catch (_) { continue; }
            for (const el of list) {
                if (step.reveal && !visible(el)) revealIn(el);
                if (visible(el) && !el.disabled) return el;
            }
        }
        return null;
    }

    /* ───── l'affichage : 4 panneaux sombres autour du trou, le halo, la bulle ───── */
    let T = null; // l'état de la visite en cours
    const ACTIONS = {
        tour: '<button type="button" class="vg-skip" data-vg="skip">Passer la visite</button><span class="vg-spacer"></span><button type="button" class="button secondary small" data-vg="prev">← Précédent</button><button type="button" class="button small" data-vg="next">Suivant →</button>',
        offer: '<button type="button" class="vg-skip" data-vg="never">Ne plus proposer</button><span class="vg-spacer"></span><button type="button" class="button secondary small" data-vg="later">Plus tard</button><button type="button" class="button small" data-vg="go">▶ Commencer</button>',
    };
    const setActions = kind => { const a = T.root.querySelector('.vg-actions'); if (a.dataset.kind !== kind) { a.innerHTML = ACTIONS[kind]; a.dataset.kind = kind; } };
    function build() {
        const root = document.createElement('div');
        root.className = 'vg-root'; root.dataset.ctxOff = '';
        root.innerHTML = `${['t', 'r', 'b', 'l'].map(s => `<div class="vg-dim vg-dim-${s}" data-vg-dim aria-hidden="true"></div>`).join('')}
            <div class="vg-halo" aria-hidden="true"></div>
            <div class="vg-bubble" role="dialog" aria-modal="false" aria-labelledby="vg-title" aria-describedby="vg-text" tabindex="-1">
                <span class="vg-arrow" aria-hidden="true"></span>
                <div class="vg-head"><span class="vg-ico" aria-hidden="true"></span><h2 id="vg-title" class="vg-title"></h2><span class="vg-count"></span></div>
                <p id="vg-text" class="vg-text"></p>
                <p class="vg-hint ui-hint">Tu peux cliquer le bouton entouré pour le faire pour de vrai, ou juste avancer.</p>
                <div class="vg-dots" aria-hidden="true">${STEPS.map(() => '<i></i>').join('')}</div>
                <div class="vg-actions" data-kind="tour">${ACTIONS.tour}</div>
            </div>
            <div class="vg-live" aria-live="polite" aria-atomic="true"></div>`;
        document.body.appendChild(root);
        root.addEventListener('click', e => {
            const b = e.target.closest('[data-vg]');
            if (b) { e.preventDefault(); const a = b.dataset.vg; if (a === 'next') next(); else if (a === 'prev') prev(); else if (a === 'skip') stop('skip'); else if (a === 'go') begin(); else if (a === 'later') stop('later'); else if (a === 'never') stop('never'); return; }
            if (e.target.closest('[data-vg-dim]')) { e.preventDefault(); nudge(); }
        });
        return root;
    }
    function nudge() { const b = T?.root?.querySelector('.vg-bubble'); if (!b || calm()) return; b.classList.remove('is-nudge'); void b.offsetWidth; b.classList.add('is-nudge'); }

    function place() {
        if (!T || !T.root) return;
        const root = T.root, el = T.target, vw = innerWidth, vh = innerHeight;
        const dims = root.querySelectorAll('[data-vg-dim]'), halo = root.querySelector('.vg-halo'), bub = root.querySelector('.vg-bubble'), arrow = root.querySelector('.vg-arrow');
        let r = null;
        if (el && el.isConnected) { const b = el.getBoundingClientRect(); const pad = 6; r = {x: Math.max(0, b.left - pad), y: Math.max(0, b.top - pad), r: Math.min(vw, b.right + pad), b: Math.min(vh, b.bottom + pad)}; if (r.r <= r.x || r.b <= r.y) r = null; }
        if (!r) { // pas de cible (invitation) : tout l'écran un peu assombri, la bulle au milieu
            dims[0].style.cssText = `left:0;top:0;width:${vw}px;height:${vh}px`; for (let i = 1; i < 4; i++) dims[i].style.cssText = 'display:none';
            halo.style.display = 'none'; arrow.style.display = 'none';
            const bw = Math.min(440, vw - 32); bub.style.width = bw + 'px';
            bub.style.left = Math.round((vw - bw) / 2) + 'px'; bub.style.top = Math.max(16, Math.round((vh - bub.offsetHeight) / 2)) + 'px';
            return;
        }
        dims[0].style.cssText = `left:0;top:0;width:${vw}px;height:${r.y}px`;
        dims[2].style.cssText = `left:0;top:${r.b}px;width:${vw}px;height:${Math.max(0, vh - r.b)}px`;
        dims[3].style.cssText = `left:0;top:${r.y}px;width:${r.x}px;height:${r.b - r.y}px`;
        dims[1].style.cssText = `left:${r.r}px;top:${r.y}px;width:${Math.max(0, vw - r.r)}px;height:${r.b - r.y}px`;
        halo.style.cssText = `left:${r.x}px;top:${r.y}px;width:${r.r - r.x}px;height:${r.b - r.y}px`;
        // la bulle : dessous s'il y a la place, sinon dessus, sinon à côté (grand écran) ; 16 px du bord
        const bw = Math.min(380, vw - 32); bub.style.width = bw + 'px';
        const bh = bub.offsetHeight, gap = 14, cx = (r.x + r.r) / 2;
        let top, left, side;
        if (vh - r.b >= bh + gap + 8) { side = 'below'; top = r.b + gap; }
        else if (r.y >= bh + gap + 8) { side = 'above'; top = r.y - gap - bh; }
        else if (vw - r.r >= bw + gap + 16) { side = 'right'; left = r.r + gap; top = Math.min(Math.max(16, (r.y + r.b) / 2 - bh / 2), vh - bh - 16); }
        else if (r.x >= bw + gap + 16) { side = 'left'; left = r.x - gap - bw; top = Math.min(Math.max(16, (r.y + r.b) / 2 - bh / 2), vh - bh - 16); }
        else { side = 'none'; top = Math.max(16, vh - bh - 16); }
        if (left == null) left = Math.min(Math.max(16, cx - bw / 2), vw - bw - 16);
        bub.style.left = Math.round(left) + 'px'; bub.style.top = Math.round(Math.max(8, top)) + 'px';
        bub.dataset.side = side;
        if (side === 'below' || side === 'above') { arrow.style.display = ''; arrow.style.left = Math.round(Math.min(Math.max(18, cx - left), bw - 18)) + 'px'; arrow.style.top = ''; }
        else if (side === 'left' || side === 'right') { arrow.style.display = ''; arrow.style.top = Math.round(Math.min(Math.max(18, (r.y + r.b) / 2 - top), bh - 18)) + 'px'; arrow.style.left = ''; }
        else arrow.style.display = 'none';
    }
    let raf = 0;
    const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; place(); }); };

    function paint(i) {
        const s = STEPS[i], root = T.root;
        root.classList.remove('is-offer'); setActions('tour');
        root.querySelector('.vg-ico').textContent = s.icon;
        root.querySelector('.vg-title').textContent = s.title;
        root.querySelector('.vg-text').textContent = fr(s.text);
        root.querySelector('.vg-count').textContent = `${i + 1} / ${STEPS.length}`;
        root.querySelector('.vg-count').setAttribute('aria-label', `Étape ${i + 1} sur ${STEPS.length}`);
        root.querySelector('.vg-hint').hidden = false;
        root.querySelectorAll('.vg-dots i').forEach((d, k) => { d.className = k < i ? 'is-done' : k === i ? 'is-on' : ''; });
        const prevB = root.querySelector('[data-vg="prev"]'), nextB = root.querySelector('[data-vg="next"]');
        prevB.hidden = false; prevB.disabled = i <= firstAvailable(); nextB.dataset.vg = 'next';
        nextB.textContent = isLast(i) ? '✓ Terminer' : 'Suivant →';
        root.querySelector('[data-vg="skip"]').hidden = false;
        root.querySelector('.vg-live').textContent = `Visite guidée, étape ${i + 1} sur ${STEPS.length} : ${s.title}. ${s.text}`;
        root.hidden = false;
        place();
        nextB.focus({preventScroll: true});
    }
    const firstAvailable = () => T?.first ?? 0;
    const isLast = i => { for (let k = i + 1; k < STEPS.length; k++) if (!T.skipped.has(k)) return false; return true; };

    /* ───── aller à une étape (dir = +1 / −1 : sens où l'on saute une étape impossible) ───── */
    async function show(i, dir = 1) {
        if (!T) return;
        const token = ++T.token;
        while (i >= 0 && i < STEPS.length) {
            const s = STEPS[i];
            T.root.hidden = true; T.target = null;
            try { if (s.go) await s.go(); } catch (_) {}
            if (!T || token !== T.token) return;
            let el = null;
            for (let t = 0; t < 30 && !el; t++) { el = findTarget(s); if (!el) await sleep(100); if (!T || token !== T.token) return; } // l'écran se dessine
            if (el) {
                T.skipped.delete(i); T.i = i; T.target = el;
                if (T.first == null || i < T.first) T.first = i;
                el.scrollIntoView({block: 'center', inline: 'center', behavior: calm() ? 'auto' : 'smooth'});
                await sleep(calm() ? 30 : 320);
                if (!T || token !== T.token) return;
                { const b = el.getBoundingClientRect(); if (b.top < 56 || b.bottom > innerHeight - 24) el.scrollIntoView({block: 'center', inline: 'nearest', behavior: 'auto'}); } // l'écran a bougé pendant le défilement
                paint(i); lsSet({step: s.id});
                return;
            }
            T.skipped.add(i); i += dir;
        }
        if (dir < 0) return show(T.i ?? 0, 1);
        stop(T.i == null ? 'empty' : 'done');
    }
    const next = () => { if (!T) return; if (isLast(T.i)) return stop('done'); show(T.i + 1, 1); };
    const prev = () => { if (!T || T.i <= firstAvailable()) return; show(T.i - 1, -1); };

    /* le bouton entouré, cliqué pour de vrai : pause pendant la fenêtre de l'app, puis l'étape suivante */
    function onRealClick(e) {
        if (!T || T.paused || T.root.classList.contains('is-offer') || !T.target || !T.target.contains(e.target)) return;
        T.paused = true; T.root.hidden = true;
        const token = T.token, last = isLast(T.i);
        (async () => {
            await sleep(500);
            let n = 0;
            while (T && token === T.token && dialogOpen() && n++ < 3600) await sleep(250);
            await sleep(350); // l'écran se redessine après l'enregistrement
            if (!T || token !== T.token) return;
            T.paused = false;
            if (blocked()) return stop('blocked');
            if (last) return stop('done');
            show(T.i + 1, 1);
        })();
    }

    function onKey(e) {
        if (!T || T.paused || dialogOpen() || e.defaultPrevented) return;
        const tag = (e.target.tagName || '').toLowerCase();
        const typing = (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) && !T.root.contains(e.target);
        if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); stop(T.root.classList.contains('is-offer') ? 'later' : 'skip'); return; }
        if (typing || e.altKey || e.ctrlKey || e.metaKey) return;
        if (T.root.classList.contains('is-offer')) return;
        if (e.key === 'ArrowRight') { e.preventDefault(); e.stopImmediatePropagation(); next(); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopImmediatePropagation(); prev(); }
        else if (e.key === 'Tab' && !T.root.contains(document.activeElement)) { e.preventDefault(); T.root.querySelector('[data-vg="next"]')?.focus(); }
    }
    let watch = 0;
    function attach() {
        document.addEventListener('keydown', onKey, true);
        document.addEventListener('click', onRealClick, true);
        addEventListener('resize', schedule); addEventListener('scroll', schedule, true);
        watch = setInterval(() => { if (!T) return; if (blocked()) return stop('blocked'); if (!T.paused && !T.root.hidden) { if (T.target && !T.target.isConnected) { const el = findTarget(STEPS[T.i]); if (el) T.target = el; } place(); } }, 400);
    }
    function detach() {
        document.removeEventListener('keydown', onKey, true);
        document.removeEventListener('click', onRealClick, true);
        removeEventListener('resize', schedule); removeEventListener('scroll', schedule, true);
        clearInterval(watch);
    }

    function open() {
        if (T) return true;
        if (blocked()) return false;
        T = {root: build(), i: null, first: null, token: 0, skipped: new Set(), paused: false, target: null, back: document.activeElement};
        T.root.classList.toggle('is-calm', calm());
        attach();
        return true;
    }
    async function begin(at = 0) {
        if (!T && !open()) return false;
        T.root.classList.remove('is-offer');
        lsSet({started: new Date().toISOString()});
        await show(Math.max(0, Math.min(STEPS.length - 1, Number(at) || 0)), 1);
        return true;
    }
    function start(opts = {}) {
        if (blocked()) return false;
        if (T) stop('restart', true);
        if (!open()) return false;
        begin(opts.at);
        return true;
    }
    /* premier lancement : l'invitation (une bulle au milieu), jamais si déjà vue, refusée ou impossible ici */
    function offer() {
        const s = lsGet();
        if (s.seen || s.never || blocked() || T) return false;
        if (!open()) return false;
        const root = T.root; root.classList.add('is-offer');
        root.querySelector('.vg-ico').textContent = '▶';
        root.querySelector('.vg-title').textContent = 'Une petite visite ?';
        root.querySelector('.vg-text').textContent = fr(`En ${STEPS.length} étapes, l’app te montre où créer une fiche, ajouter un parent, une photo, un événement, faire une sauvegarde et trouver l’aide. Ça prend deux minutes.`);
        root.querySelector('.vg-count').textContent = '';
        root.querySelector('.vg-hint').hidden = true;
        root.querySelectorAll('.vg-dots i').forEach(d => { d.className = ''; });
        setActions('offer');
        root.querySelector('.vg-live').textContent = 'Une petite visite guidée de l’app est proposée. Commencer, plus tard, ou ne plus proposer.';
        root.hidden = false; T.target = null; place();
        root.querySelector('[data-vg="go"]').focus({preventScroll: true});
        return true;
    }
    function stop(why = 'skip', silent = false) {
        if (!T) return;
        const t = T; T = null; t.token++;
        detach();
        t.root.remove();
        if (why === 'done' || why === 'skip' || why === 'empty') lsSet({seen: true, at: new Date().toISOString(), how: why});
        if (why === 'never') lsSet({never: true});
        if (silent) return;
        const toast = A().toast;
        if (why === 'done') toast?.('✓ Visite terminée. Pour la revoir : Réglages → FAQ / tuto → « ▶ Relancer la visite guidée ».', 'success');
        else if (why === 'skip' || why === 'later' || why === 'never') toast?.('Visite guidée fermée. Tu la retrouves dans Réglages → FAQ / tuto.');
        else if (why === 'empty') toast?.('Rien à montrer sur cet écran pour l’instant.');
        try { if (t.back && t.back.isConnected && !dialogOpen()) t.back.focus({preventScroll: true}); } catch (_) {}
    }

    // tout bouton [data-tour-start] relance la visite (FAQ, aide…)
    document.addEventListener('click', e => {
        const b = e.target.closest?.('[data-tour-start]'); if (!b) return;
        e.preventDefault();
        if (!start({force: true})) A().toast?.(document.body.classList.contains('is-kiosk') ? 'Pas de visite guidée en mode consultation.' : 'La visite guidée n’est pas possible ici.');
    });

    ext.tour = {start, offer, stop: (why) => stop(why || 'skip'), isActive: () => !!T, seen: () => !!lsGet().seen, forget: () => { try { localStorage.removeItem(KEY); } catch (_) {} }, steps: () => STEPS.map(({id, title, text, targets}) => ({id, title, text, targets: [...targets]})), KEY};
    const app = window.LCNDA_APP = window.LCNDA_APP || {};
    app.startTour = opts => start(opts || {});
    app.offerTour = () => offer();
})();
