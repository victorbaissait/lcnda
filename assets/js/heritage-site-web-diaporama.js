/* 🌐 Mon site web — le petit script du bloc « 🎞️ Diaporama », copié dans le site exporté (js/diaporama-lcnda.js).
 * Sans lui, le diaporama marche déjà : les images glissent au doigt ou à la souris (CSS scroll-snap).
 * Avec lui : des boutons ‹ ›, les flèches du clavier et « 2 / 5 » sous l'image. Aucune bibliothèque, rien n'est chargé d'ailleurs.
 * N'est PAS chargé par l'app (index.php) : l'éditeur le pose dans l'aperçu en mode ▶ Tester, lib/website.php dans le site. */
(function () {
    'use strict';
    function setup(box) {
        if (box.getAttribute('data-lc-pret')) return;
        var piste = box.querySelector('.lc-diapo-piste'); if (!piste) return;
        var diapos = piste.querySelectorAll('.lc-diapo'); if (diapos.length < 2) return;
        box.setAttribute('data-lc-pret', '1');
        var num = document.createElement('span'); num.className = 'lc-diapo-num'; num.setAttribute('aria-live', 'polite');
        function at() { return Math.round(piste.scrollLeft / Math.max(1, piste.clientWidth)); }
        function go(i) { i = Math.max(0, Math.min(diapos.length - 1, i)); piste.scrollTo({left: i * piste.clientWidth, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'}); }
        function show() { num.textContent = (at() + 1) + ' / ' + diapos.length; }
        function btn(cls, txt, label, d) { var b = document.createElement('button'); b.type = 'button'; b.className = 'lc-diapo-nav ' + cls; b.textContent = txt; b.setAttribute('aria-label', label); b.addEventListener('click', function () { go(at() + d); }); box.appendChild(b); }
        btn('lc-diapo-prec', '‹', box.getAttribute('data-precedent') || 'Image précédente', -1);
        btn('lc-diapo-suiv', '›', box.getAttribute('data-suivant') || 'Image suivante', 1);
        box.appendChild(num);
        piste.setAttribute('tabindex', '0');
        piste.addEventListener('keydown', function (e) { if (e.key === 'ArrowLeft') { e.preventDefault(); go(at() - 1); } else if (e.key === 'ArrowRight') { e.preventDefault(); go(at() + 1); } });
        var t = 0; piste.addEventListener('scroll', function () { clearTimeout(t); t = setTimeout(show, 60); }, {passive: true});
        show();
    }
    function run() { var l = document.querySelectorAll('.lc-diaporama'); for (var i = 0; i < l.length; i++) setup(l[i]); }
    window.LCNDA_DIAPORAMA = run;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
})();
