/* LCNDA — 📜 Atelier de transcription, vague 3 (3c) : le même texte, montré pareil (maquette docs/design/atelier-transcription-idees.html, K7).
 * La visionneuse et la page du document montrent le texte de l'Atelier avec les mêmes numéros de ligne dans la marge (le réglage
 * « Numéros de ligne » de l'Atelier, conseillé : oui) :
 *   - numberedHtml(text) : le texte en lecture, une ligne = un numéro (page du document) ;
 *   - gutter(textarea) : les numéros à gauche d'une case qu'on peut modifier (visionneuse), qui suivent l'écriture et le défilement.
 * Les numéros sont ceux de l'Atelier (toutes les lignes comptent, comme « l. 3 » du gabarit et de « Ce que l'app a trouvé »).
 * Essai : tests/test-atelier-aligne.js.
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const on = () => (ext.txView?.lineNos ? ext.txView.lineNos() : true);
    const lines = text => String(text ?? '').replace(/\r\n?/g, '\n').split('\n');

    /** le texte en lecture : <div class="tx-num"> une ligne par <span data-n> (sans numéros si le réglage est éteint) */
    function numberedHtml(text, {cls = ''} = {}) {
        const L = lines(text); if (!on()) return `<div class="tx-plain ${cls}">${esc(L.join('\n'))}</div>`;
        return `<div class="tx-num ${cls}">${L.map((l, i) => `<span class="tx-ln" data-n="${i + 1}">${esc(l) || '​'}</span>`).join('')}</div>`;
    }

    /** les numéros à gauche d'une case modifiable : un « miroir » derrière la case, qui coupe les lignes exactement comme elle */
    function gutter(area) {
        if (!area || area.dataset.txGutter) return area?._txGutter || null;
        const wrap = document.createElement('div'); wrap.className = 'tx-gut'; area.parentNode.insertBefore(wrap, area); wrap.appendChild(area);
        const mirror = document.createElement('div'); mirror.className = 'tx-gut-mirror'; mirror.setAttribute('aria-hidden', 'true'); wrap.insertBefore(mirror, area);
        area.dataset.txGutter = '1';
        const paint = () => {
            wrap.classList.toggle('is-on', on()); if (!on()) { mirror.textContent = ''; return; }
            const cs = getComputedStyle(area); ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'wordSpacing', 'tabSize', 'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight', 'borderTopWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderRightWidth'].forEach(k => { mirror.style[k] = cs[k]; });
            const bl = parseFloat(cs.borderLeftWidth) || 0, br = parseFloat(cs.borderRightWidth) || 0, bt = parseFloat(cs.borderTopWidth) || 0, bb = parseFloat(cs.borderBottomWidth) || 0;
            mirror.style.width = `${area.clientWidth + bl + br}px`; mirror.style.height = `${area.clientHeight + bt + bb}px`; mirror.style.left = `${area.offsetLeft}px`; mirror.style.top = `${area.offsetTop}px`;
            mirror.innerHTML = lines(area.value).map((l, i) => `<span class="tx-ln" data-n="${i + 1}">${esc(l) || '​'}</span>`).join('');
            mirror.scrollTop = area.scrollTop;
        };
        area.addEventListener('input', paint); area.addEventListener('scroll', () => { mirror.scrollTop = area.scrollTop; });
        // la visionneuse remplit la case sans événement (area.value = …) : on repeint aussi à ce moment-là (une fois par image affichée)
        const desc = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value'); let raf = 0;
        if (desc?.set) Object.defineProperty(area, 'value', {configurable: true, get() { return desc.get.call(this); },
            set(v) { desc.set.call(this, v); if (!raf) raf = requestAnimationFrame(() => { raf = 0; paint(); }); }});
        const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => paint()) : null; ro?.observe(area);
        window.addEventListener('lcnda-txbar-change', paint);
        area._txGutter = {paint, wrap}; paint();
        return area._txGutter;
    }
    ext.txAligne = {numberedHtml, gutter, lines};
})();
