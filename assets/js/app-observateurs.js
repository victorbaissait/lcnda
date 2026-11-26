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
 * Chargé en tout premier (index.php, sans defer), avant tout script qui crée un observateur. */
(function () {
    'use strict';
    var Native = window.MutationObserver;
    if (typeof Native !== 'function' || Native.__lcndaParImage) return;
    var raf = typeof window.requestAnimationFrame === 'function' ? window.requestAnimationFrame.bind(window) : null;
    var isPage = function (target, opts) {
        return !!(opts && opts.subtree) && (target === document || target === document.documentElement || target === document.body);
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
