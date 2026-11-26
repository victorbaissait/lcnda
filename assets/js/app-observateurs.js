/* ⏱ Observateurs de la page regroupés par image (docs/perf-chargement.md).
 *
 * Une centaine de modules surveillent TOUTE la page (MutationObserver sur document / <html> / <body>, subtree) pour décorer ce qui
 * apparaît (boutons, liens, traductions…). Mesuré à l'ouverture : ≈ 800 vagues de changements × 160 observateurs = 80 000 appels,
 * ≈ 5,5 s de processeur, chacun relisant toute la page (querySelectorAll) à chaque petite modification.
 *
 * Ici, pour ces observateurs-là seulement : le premier appel d'une image passe tout de suite (comme avant) ; les changements suivants de
 * la même image sont mis de côté et donnés en une fois juste avant le prochain dessin (requestAnimationFrame, donc avant que l'écran ne
 * soit peint : rien ne se voit), ou après 100 ms si la fenêtre est cachée. Les observateurs d'un élément précis ne changent pas.
 * disconnect() oublie les changements mis de côté (comme le navigateur) ; takeRecords() les rend.
 * Un observateur qui doit rester immédiat (la traduction de la page : aucun texte français entre deux tâches) passe
 * { lcndaImmediate: true } à observe() (option ignorée par le navigateur).
 * Chargé en tout premier (index.php, sans defer), avant tout script qui crée un observateur. */
(function () {
    'use strict';
    var Native = window.MutationObserver;
    if (typeof Native !== 'function' || Native.__lcndaParImage) return;
    var raf = typeof window.requestAnimationFrame === 'function' ? window.requestAnimationFrame.bind(window) : null;
    var isPage = function (target, opts) {
        return !!(opts && opts.subtree) && !opts.lcndaImmediate && (target === document || target === document.documentElement || target === document.body);
    };
    function ParImage(callback) {
        var pending = [], hot = false, page = false, timer = 0, frame = 0;
        var end = function () {
            if (timer) clearTimeout(timer); if (frame && window.cancelAnimationFrame) window.cancelAnimationFrame(frame);
            timer = 0; frame = 0; hot = false;
            if (!pending.length) return;
            var recs = pending; pending = [];
            hot = true; soon(); // ce qui arrive pendant cet appel attend l'image suivante
            callback.call(obs, recs, obs);
        };
        var soon = function () { if (raf) frame = raf(end); timer = setTimeout(end, 100); };
        var obs = Reflect.construct(Native, [function (recs) {
            if (!page) return callback.call(obs, recs, obs);
            if (!hot) { hot = true; soon(); return callback.call(obs, recs, obs); }
            for (var i = 0; i < recs.length; i++) pending.push(recs[i]);
        }], new.target || ParImage);
        var observe = obs.observe, disconnect = obs.disconnect, take = obs.takeRecords;
        Object.defineProperties(obs, {
            observe: { value: function (target, opts) { if (isPage(target, opts)) page = true; return observe.call(obs, target, opts); }, configurable: true, writable: true },
            disconnect: { value: function () { pending = []; return disconnect.call(obs); }, configurable: true, writable: true },
            takeRecords: { value: function () { var r = pending.concat(take.call(obs)); pending = []; return r; }, configurable: true, writable: true },
        });
        return obs;
    }
    ParImage.prototype = Native.prototype;
    ParImage.__lcndaParImage = true;
    ParImage.Native = Native;
    window.MutationObserver = ParImage;
})();

/* ⏱ LCNDA_PERF.whenSeen(el, fn) : fn(el) quand l'élément arrive près de l'écran (200 px), puis au premier moment calme (au plus 1,5 s).
 * Pour un widget ou un bloc qui calcule beaucoup ou interroge Internet : rien n'est fait pour ce qu'on ne regarde pas.
 * Sans IntersectionObserver (ancien navigateur) : tout de suite. Renvoie une fonction qui annule. */
(function () {
    'use strict';
    var idle = function (fn) { return typeof window.requestIdleCallback === 'function' ? window.requestIdleCallback(fn, { timeout: 1500 }) : setTimeout(fn, 1); };
    var whenSeen = function (el, fn, opts) {
        if (!el || typeof fn !== 'function') return function () {};
        var done = false, io = null;
        var go = function () { if (done) return; done = true; if (io) io.disconnect(); if (opts && opts.now) fn(el); else idle(function () { fn(el); }); };
        if (typeof window.IntersectionObserver !== 'function') { go(); return function () {}; }
        io = new IntersectionObserver(function (es) { for (var i = 0; i < es.length; i++) if (es[i].isIntersecting) { go(); return; } }, { rootMargin: (opts && opts.margin) || '200px' });
        io.observe(el);
        return function () { done = true; io.disconnect(); };
    };
    window.LCNDA_PERF = Object.assign(window.LCNDA_PERF || {}, { whenSeen: whenSeen, idle: idle });
})();
