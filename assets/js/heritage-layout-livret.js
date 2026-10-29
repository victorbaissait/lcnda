/**
 * 📐 Mise en page — 📖 Livret à plier (imposition « piqûre à cheval ») : les pages remises dans l'ordre d'impression,
 * deux par face de feuille, pour un cahier plié en deux et agrafé au milieu. Le nombre de pages est complété à un multiple
 * de 4 par des pages blanches (avant la 4e de couverture). On imprime en recto verso, retournement sur le petit côté.
 * Feuille : deux pages côte à côte (A5 → A4 paysage, A4 → A3 paysage).
 * Sans écran (Node, essais) : ext.layoutBooklet.order(n) → [[gauche, droite], …] (indices des pages, -1 = page blanche).
 */
(function (root) {
    'use strict';
    const ext = root.LCNDA_EXT = root.LCNDA_EXT || {};
    /** les faces de feuille dans l'ordre d'impression : feuille 1 recto, feuille 1 verso, feuille 2 recto… */
    function order(n) {
        const N = Math.max(4, Math.ceil(n / 4) * 4), blanks = N - n;
        // les pages blanches vont juste avant la dernière (la 4e de couverture reste au dos)
        const at = k => { if (n < 2) return k < n ? k : -1; if (k === N - 1) return n - 1; return k < n - 1 ? k : -1; };
        const out = []; void blanks;
        for (let s = 0; s < N / 4; s++) { out.push([at(N - 1 - 2 * s), at(2 * s)]); out.push([at(2 * s + 1), at(N - 2 - 2 * s)]); }
        return out;
    }
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    /** L1 — les feuilles du livret pour la fenêtre « Imprimer » commune : c = {fold (ordre du pliage), flip ('side' | 'top'), lines (traits de pli)} */
    function sheets(doc0, name, c = {}) {
        const K = ext.layoutKit, UI = root.LCNDA_UI, doc = K.resolveDoc(doc0), W = doc.page.w, H = doc.page.h, n = doc.pages.length;
        const sides = c.fold === false ? Array.from({length: Math.ceil(n / 2)}, (_, k) => [2 * k, 2 * k + 1 < n ? 2 * k + 1 : -1]) : order(n);
        const page = i => i < 0 ? `<div class="lb-blank" style="width:${K.px(W)}px;height:${K.px(H)}px"></div>` : K.pageHtml(doc, i, {print: true, preview: true, keyPrefix: 'b' + i});
        const pages = sides.map((sd, k) => ({w: 2 * W, h: H, cls: `lb-side${c.fold !== false && c.flip === 'top' && k % 2 ? ' is-turned' : ''}${c.lines !== false ? ' has-fold' : ''}`, html: `<div class="lb-half">${page(sd[0])}</div><div class="lb-half">${page(sd[1])}</div>`}));
        return UI.printSheets({title: `${name} — livret`, pages, css: `${K.BASE_CSS}${K.docCss(doc, 'body')}.lb-side{flex-direction:row!important}.lb-half{width:50%;height:100%;overflow:hidden}.lb-half .ly-page{margin:0;box-shadow:none}.lb-blank{background:#fff}.lb-side.is-turned{transform:rotate(180deg)}.lb-side.has-fold::after{content:"";position:absolute;left:50%;top:0;bottom:0;border-left:.3mm dashed rgba(0,0,0,.35)}`});
    }
    const OPTIONS = [{key: 'fold', label: 'Pages remises dans l’ordre du pliage', checked: true},
        {key: 'flip', type: 'radio', label: 'L’imprimante retourne la feuille', value: 'side', show: c => c.fold !== false, choices: [['side', 'Retourner sur le côté', '(petit côté, le plus courant)'], ['top', 'Retourner par le haut']]},
        {key: 'lines', label: 'Traits de pli', checked: true}];
    /** « 📖 Livret à plier » : la fenêtre « Imprimer » commune (recto verso, puis plier et agrafer au milieu) */
    function open(doc, name) {
        const UI = root.LCNDA_UI, K = ext.layoutKit; if (!UI?.openPrintDialog) throw new Error('la fenêtre « Imprimer » n’est pas chargée');
        const d = K.resolveDoc(doc), N = Math.max(4, Math.ceil(d.pages.length / 4) * 4);
        UI.openPrintDialog({title: `${name} — livret`, key: 'livret', zone: 'Livret plié', photos: false, margin: 0, sizeLocked: true, ...UI.printPaper(2 * d.page.w, d.page.h),
            info: `${N / 4} feuille${N > 4 ? 's' : ''} pliée${N > 4 ? 's' : ''} (${N} pages) : imprime en recto verso, puis plie et agrafe au milieu.`,
            options: OPTIONS, html: c => sheets(doc, name, c)});
    }
    ext.layoutBooklet = {order, html: (doc, name) => sheets(doc, name, {}), open, sheets, OPTIONS};
    if (typeof module === 'object' && module.exports) module.exports = {order};
})(typeof window !== 'undefined' ? window : globalThis);
