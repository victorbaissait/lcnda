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
    /** la page HTML à imprimer (comme « PDF par l'impression ») */
    function html(doc0, name) {
        const K = ext.layoutKit, doc = K.resolveDoc(doc0), W = doc.page.w, H = doc.page.h, sides = order(doc.pages.length), r1 = v => Math.round(v * 10) / 10;
        const page = i => i < 0 ? `<div class="lb-blank" style="width:${K.px(W)}px;height:${K.px(H)}px"></div>` : K.pageHtml(doc, i, {print: true, preview: true, keyPrefix: 'b' + i});
        const body = sides.map((s, k) => `<div class="lb-side" data-side="${k % 2 ? 'verso' : 'recto'}"><div class="lb-half">${page(s[0])}</div><div class="lb-half">${page(s[1])}</div><span class="lb-mark">Feuille ${Math.floor(k / 2) + 1} · ${k % 2 ? 'verso' : 'recto'}</span></div>`).join('');
        return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(name)} — livret</title><base href="${esc(location.href.replace(/[^/]*$/, ''))}"><style>${K.BASE_CSS}${K.docCss(doc, 'body')}
@page{size:${r1(2 * W)}mm ${r1(H)}mm;margin:0}html,body{margin:0;background:#888}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
.lb-side{position:relative;display:flex;width:${K.px(2 * W)}px;height:${K.px(H)}px;margin:14px auto;background:#fff;box-shadow:0 2px 12px rgba(0,0,0,.35);overflow:hidden}
.lb-half{width:50%;height:100%;overflow:hidden}.lb-half .ly-page{margin:0;box-shadow:none}.lb-blank{background:#fff}
.lb-side::after{content:"";position:absolute;left:50%;top:0;bottom:0;border-left:1px dashed rgba(0,0,0,.25)}
.lb-mark{position:absolute;right:8px;bottom:4px;font:10px system-ui;color:#999}
.lb-bar{position:sticky;top:0;z-index:9;display:flex;gap:10px;align-items:center;padding:10px 16px;background:#111;color:#fff;font:14px system-ui}.lb-bar button{font:inherit;padding:6px 14px;border-radius:6px;border:0;background:#2f6bff;color:#fff;cursor:pointer}
@media print{html,body{background:none}.lb-bar,.lb-mark,.lb-side::after{display:none}.lb-side{margin:0;box-shadow:none;break-after:page;page-break-after:always}}</style></head><body>
<div class="lb-bar"><b>📖 ${esc(name)}</b> · ${sides.length / 2} feuille${sides.length > 2 ? 's' : ''} pliée${sides.length > 2 ? 's' : ''} (${sides.length * 2} pages${sides.length * 2 > doc.pages.length ? `, dont ${sides.length * 2 - doc.pages.length} blanche${sides.length * 2 - doc.pages.length > 1 ? 's' : ''}` : ''}) · imprimer en <b>recto verso, retournement sur le petit côté</b>, puis plier et agrafer au milieu<span style="flex:1"></span><button onclick="print()">🖨 Imprimer / enregistrer en PDF</button></div>${body}</body></html>`;
    }
    function open(doc, name) {
        const w = window.open('', '_blank'); if (!w) throw new Error('fenêtre bloquée : autorise les fenêtres pour cette page.');
        w.document.open(); w.document.write(html(doc, name)); w.document.close();
    }
    ext.layoutBooklet = {order, html, open};
    if (typeof module === 'object' && module.exports) module.exports = {order};
})(typeof window !== 'undefined' ? window : globalThis);
