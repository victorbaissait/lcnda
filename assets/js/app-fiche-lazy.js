/* LCNDA — ⏱ La fiche d'une personne se charge à mesure qu'on la lit (un seul mécanisme pour tous les blocs).
 *
 * Après le dessin de la fiche (app.js : renderPerson, une fois tout branché), chaque bloc [data-pblock] loin de l'écran est « mis en
 * attente » : son en-tête reste (le titre, la place, le sommaire), son contenu sort de la page le temps qu'il arrive à 600 px de l'écran
 * (IntersectionObserver). Les modules qui décorent les blocs (MutationObserver sur la page : 🌊 rivière, 🔎 Ce qui le concerne, lots…)
 * ne trouvent donc rien à remplir pour un bloc pas encore lu, et ne demandent rien au serveur ; à son retour, ils le voient arriver et le
 * remplissent comme d'habitude. Les blocs du premier écran ne sont jamais mis en attente.
 *
 * API : window.LCNDA_SHEET_LAZY = {
 *   veil(page)          après le dessin de la fiche (app.js)
 *   show(el)            ce bloc (ou tous ceux contenus dans el) tout de suite
 *   showAll()           toute la fiche (⌘F, imprimer, exporter, « Tout sur », aller à une section) — renvoie une promesse
 *   eager(key)          un bloc qui ne doit jamais attendre (un lot le déclare une fois)
 *   pending()           le nombre de blocs en attente }
 * Sans IntersectionObserver (ancien navigateur) ou dans un aperçu : rien n'est mis en attente.
 */
(function () {
    'use strict';
    const MARGIN = 300;
    // jamais en attente : l'identité et les événements (le cœur de la fiche, que d'autres outils décorent tout de suite : 🌦 météo des événements…)
    const EAGER = new Set(['identity', 'events']);
    const held = new Map(); // section → fragment
    const rides = new Map();
    const soon = []; // blocs cachés (« montré s'il a quelque chose ») tout près de l'écran : chargés juste après le premier écran // bloc visible → les blocs cachés (« montré s'il a quelque chose ») qui arrivent avec lui
    let io = null, detail = null, batch = null;

    /* ce qui arrive au-dessus de ce qu'on regarde ne doit pas le faire sauter : un bloc rempli (ou qui grandit en se remplissant)
     * au-dessus du haut de l'écran décale d'autant la colonne qui défile (comme l'« ancrage » du navigateur, qui ne suit pas ici) */
    const heights = new WeakMap();
    const scroller = el => { for (let e = el.parentElement; e; e = e.parentElement) { if (e.scrollHeight > e.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(e).overflowY)) return e; } return document.scrollingElement; };
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(es => es.forEach(e => {
        const sec = e.target, h = sec.getBoundingClientRect().height, old = heights.get(sec); heights.set(sec, h);
        if (old === undefined || Math.abs(h - old) < 1 || !sec.isConnected) return;
        const sc = scroller(sec); if (!sc) return;
        const top = sc === document.scrollingElement ? 0 : sc.getBoundingClientRect().top;
        if (sec.getBoundingClientRect().bottom <= top + 1) sc.scrollTop += h - old;
    })) : null;
    const watch = sec => { if (!ro) return; heights.set(sec, sec.getBoundingClientRect().height); ro.observe(sec); };

    function restore(sec) {
        const frag = held.get(sec); if (!frag) return;
        held.delete(sec); io?.unobserve(sec);
        sec.appendChild(frag); sec.classList.remove('is-lazy'); sec.style.removeProperty('min-height'); sec.removeAttribute('aria-busy');
        (batch ||= new Set()).add(sec);
        const r = rides.get(sec); if (r) { rides.delete(sec); r.forEach(restore); }
        if (batch.size === 1) queueMicrotask(after);
    }
    /* les modules qui remplissent leur bloc une fois la fiche dessinée (ext.afterPerson) : on les rappelle pour les blocs qui arrivent,
     * en ne leur montrant QUE ces blocs-là (le reste de la fiche, déjà rempli, ne repart pas au serveur) */
    const D = Document.prototype, E = Element.prototype, Q = {dqs: D.querySelector, dqa: D.querySelectorAll, eqs: E.querySelector, eqa: E.querySelectorAll};
    function after() {
        const set = [...(batch || [])].filter(x => x.isConnected); batch = null; if (!set.length || !detail) return;
        const ws = document.getElementById('workspace');
        const ok = el => !ws || !ws.contains(el) || set.some(sec => sec.contains(el) || el.contains(sec));
        const one = f => function (sel) { const el = f.call(this, sel); if (!el || ok(el)) return el; const all = [...(f === Q.dqs ? Q.dqa : Q.eqa).call(this, sel)].filter(ok); return all[0] || null; };
        const many = f => function (sel) { const list = [...f.call(this, sel)].filter(ok); return Object.assign(list, {item: i => list[i] || null}); };
        D.querySelector = one(Q.dqs); D.querySelectorAll = many(Q.dqa); E.querySelector = one(Q.eqs); E.querySelectorAll = many(Q.eqa);
        try { late.forEach(([fn, args]) => { try { fn(...args); } catch (e) { console.error(e); } }); (window.LCNDA_EXT?.afterPerson || []).forEach(fn => { try { fn(detail); } catch (e) { console.error(e); } }); }
        finally { D.querySelector = Q.dqs; D.querySelectorAll = Q.dqa; E.querySelector = Q.eqs; E.querySelectorAll = Q.eqa; }
    }
    /* un bloc qui se branche « juste après son dessin » (setTimeout de 0 dans son rendu : chercher sa case, y poser les clics) ne trouve pas
     * sa case si elle attend : ces petits rappels sont notés pendant le dessin de la fiche et rejoués, comme ext.afterPerson, à son arrivée */
    let late = [], origST = null;
    function capture(on) {
        // seul un rappel qui a cherché quelque chose sans le trouver (sa case attendait) est gardé pour être rejoué : jamais un simple appel au serveur
        if (on) { late = []; if (origST) return; origST = window.setTimeout; window.setTimeout = function (fn, ms, ...args) {
            if (typeof fn !== 'function' || Number(ms) > 50) return origST.call(window, fn, ms, ...args);
            const run = (...a) => { let miss = false; const w = f => function (sel) { const r = f.call(this, sel); if (!r || (typeof r.length === 'number' && !r.length)) miss = true; return r; };
                const keep = [D.querySelector, D.querySelectorAll, E.querySelector, E.querySelectorAll];
                D.querySelector = w(keep[0]); D.querySelectorAll = w(keep[1]); E.querySelector = w(keep[2]); E.querySelectorAll = w(keep[3]);
                try { return fn(...a); } finally { [D.querySelector, D.querySelectorAll, E.querySelector, E.querySelectorAll] = keep; if (miss && held.size) late.push([fn, a]); } };
            return origST.call(window, run, ms, ...args); }; }
        else if (origST) { window.setTimeout = origST; origST = null; }
    }
    function show(el) {
        if (!el) return;
        if (held.has(el)) restore(el);
        el.querySelectorAll?.('[data-pblock].is-lazy').forEach(restore);
        const up = el.closest?.('[data-pblock].is-lazy'); if (up) restore(up);
    }
    function showAll() { [...held.keys()].forEach(restore); return new Promise(ok => requestAnimationFrame(() => setTimeout(ok, 0))); }
    const near = sec => { const r = sec.getBoundingClientRect(); return r.bottom > -MARGIN && r.top < innerHeight + MARGIN && (r.width > 0 || r.height > 0); };

    function veil(page, det = null) {
        held.forEach((_, sec) => { if (!sec.isConnected) { held.delete(sec); io?.unobserve(sec); } });
        rides.forEach((_, sec) => { if (!sec.isConnected) rides.delete(sec); });
        detail = det;
        if (!page || typeof IntersectionObserver !== 'function' || page.closest('.lcd-frame-doc, [data-fsec-live]') || window.LCNDA_SHEET_LAZY_OFF) return;
        if (!io) io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) restore(e.target); }), {rootMargin: `${MARGIN}px 0px`});
        page.querySelectorAll('[data-pblock]').forEach(sec => {
            const key = sec.dataset.pblock;
            if (held.has(sec) || EAGER.has(key) || near(sec)) return;
            const keep = sec.querySelector(':scope > header.card-head');
            const kids = [...sec.childNodes].filter(n => n !== keep); if (!kids.length) return;
            const h = sec.getBoundingClientRect().height;
            const frag = document.createDocumentFragment(); kids.forEach(n => frag.appendChild(n));
            held.set(sec, frag); sec.classList.add('is-lazy'); sec.setAttribute('aria-busy', 'true');
            sec.style.minHeight = `${Math.max(96, Math.min(h || 0, 640))}px`;
            io.observe(sec); // (un bloc caché ne croise jamais l'écran : il arrive avec son voisin, plus bas, ou dès qu'on le montre)
            watch(sec);
        });
        // un bloc caché tant qu'il n'a rien (il se montre une fois rempli) : il arrive avec le bloc visible juste avant lui (ou après)
        const all = [...page.querySelectorAll('[data-pblock]')];
        all.forEach((sec, i) => {
            if (!held.has(sec) || !sec.hidden) return;
            const nb = [...all.slice(0, i).reverse(), ...all.slice(i + 1)].find(x => !x.hidden && x.parentElement === sec.parentElement) || all.slice(0, i).reverse().find(x => !x.hidden);
            if (!nb || !held.has(nb)) { soon.push(sec); return; } // près de l'écran mais invisible tant qu'il est vide : juste après ce qui se voit
            if (!rides.has(nb)) rides.set(nb, []); rides.get(nb).push(sec);
        });
        batch = null;
        // les blocs cachés près de l'écran : quand les lectures de ce qui se voit sont finies (0,5 s sans lecture), au plus 4 s après
        if (soon.length) { const list = soon.splice(0), t0 = performance.now(); let calm = 0;
            const tick = () => { if (!list.some(x => x.isConnected && held.has(x))) return; const busy = window.LCNDA_READS_BUSY?.() || 0; calm = busy ? 0 : calm || performance.now();
                if ((calm && performance.now() - calm > 500) || performance.now() - t0 > 4000) list.forEach(restore); else setTimeout(tick, 100); };
            setTimeout(tick, 100); }
    }

    // ce qui a besoin de toute la fiche : imprimer (le navigateur, ou le bouton de l'app) et la recherche dans la page
    window.addEventListener('beforeprint', () => { [...held.keys()].forEach(restore); });
    document.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && !e.altKey && String(e.key).toLowerCase() === 'f' && held.size) [...held.keys()].forEach(restore); }, true);

    window.LCNDA_SHEET_LAZY = {veil, capture, show, showAll, eager: key => { EAGER.add(String(key)); }, pending: () => held.size, MARGIN};
})();
