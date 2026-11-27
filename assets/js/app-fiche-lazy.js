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
    const MARGIN = 600;
    const EAGER = new Set(['identity']);
    const held = new Map(); // section → fragment
    const rides = new Map(); // bloc visible → les blocs cachés (« montré s'il a quelque chose ») qui arrivent avec lui
    let io = null, detail = null, batch = null;

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
        try { (window.LCNDA_EXT?.afterPerson || []).forEach(fn => { try { fn(detail); } catch (e) { console.error(e); } }); }
        finally { D.querySelector = Q.dqs; D.querySelectorAll = Q.dqa; E.querySelector = Q.eqs; E.querySelectorAll = Q.eqa; }
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
            if (held.has(sec) || EAGER.has(sec.dataset.pblock) || near(sec)) return;
            const keep = sec.querySelector(':scope > header.card-head');
            const kids = [...sec.childNodes].filter(n => n !== keep); if (!kids.length) return;
            const h = sec.getBoundingClientRect().height;
            const frag = document.createDocumentFragment(); kids.forEach(n => frag.appendChild(n));
            held.set(sec, frag); sec.classList.add('is-lazy'); sec.setAttribute('aria-busy', 'true');
            sec.style.minHeight = `${Math.max(96, Math.min(h || 0, 640))}px`;
            if (!sec.hidden) io.observe(sec);
        });
        // un bloc caché tant qu'il n'a rien (il se montre une fois rempli) : il arrive avec le bloc visible juste avant lui (ou après)
        const all = [...page.querySelectorAll('[data-pblock]')];
        all.forEach((sec, i) => {
            if (!held.has(sec) || !sec.hidden) return;
            const nb = [...all.slice(0, i).reverse(), ...all.slice(i + 1)].find(x => !x.hidden && x.parentElement === sec.parentElement) || all.slice(0, i).reverse().find(x => !x.hidden);
            if (!nb || !held.has(nb)) { restore(sec); return; }
            if (!rides.has(nb)) rides.set(nb, []); rides.get(nb).push(sec);
        });
        batch = null; // (restaurés pendant le dessin : les modules les rempliront avec le reste)
    }

    // ce qui a besoin de toute la fiche : imprimer (le navigateur, ou le bouton de l'app) et la recherche dans la page
    window.addEventListener('beforeprint', () => { [...held.keys()].forEach(restore); });
    document.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && !e.altKey && String(e.key).toLowerCase() === 'f' && held.size) [...held.keys()].forEach(restore); }, true);

    window.LCNDA_SHEET_LAZY = {veil, show, showAll, eager: key => { EAGER.add(String(key)); }, pending: () => held.size, MARGIN};
})();
