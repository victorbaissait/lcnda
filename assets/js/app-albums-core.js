/* LCNDA — 📒 Albums photo : les calculs sans écran (testés sans navigateur : tests/test-albums.js).
 *  - pages(items, perPage) : les pages de l'album comme dans un vrai album (N photos par page, « nouvelle page avant » respectée) ;
 *  - range(items) : la plus ancienne et la plus récente année des photos (« 1920–1935 ») ;
 *  - move(ids, from, to) : un glisser (l'ordre des photos) ; moveBy(ids, id, ±1) : ↑ ↓ au clavier ;
 *  - captionOf(item) : la légende montrée (celle écrite, sinon le titre du document).
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.LCNDA_ALBUMS_CORE = api;
})(typeof window !== 'undefined' ? window : null, () => {
    'use strict';
    const PER_PAGE = [1, 2, 3, 4, 6];
    const STYLES = [['classique', 'Pages blanches'], ['noir', 'Pages noires, encre blanche (album ancien)'], ['kraft', 'Papier kraft']];
    const okPer = n => (PER_PAGE.includes(Number(n)) ? Number(n) : 4);
    /** [{item…}] → [[item…], …] : perPage photos par page ; une photo marquée page_break commence une nouvelle page */
    function pages(items, perPage = 4) {
        const k = okPer(perPage), out = [];
        let cur = [];
        (items || []).forEach(it => {
            if (cur.length && (cur.length >= k || Number(it?.page_break))) { out.push(cur); cur = []; }
            cur.push(it);
        });
        if (cur.length) out.push(cur);
        return out;
    }
    const yearOf = s => { const m = /\b(1[0-9]{3}|20[0-9]{2})\b/.exec(String(s || '')); return m ? Number(m[1]) : null; };
    /** la fourchette d'années des photos (null si aucune n'est datée) */
    function range(items) {
        const ys = (items || []).map(it => Number(it?.media?.year) || yearOf(it?.media?.date_text)).filter(Boolean);
        if (!ys.length) return null;
        const from = Math.min(...ys), to = Math.max(...ys);
        return {from, to, text: from === to ? String(from) : `${from}–${to}`};
    }
    /** déplacer l'élément d'index from à l'index to (copie) */
    function move(ids, from, to) {
        const a = [...(ids || [])]; if (from < 0 || from >= a.length) return a;
        const [x] = a.splice(from, 1); a.splice(Math.max(0, Math.min(a.length, to)), 0, x); return a;
    }
    /** ↑ / ↓ : l'élément id d'une place (d = -1 ou +1) */
    function moveBy(ids, id, d) { const i = (ids || []).indexOf(id); return i < 0 ? [...(ids || [])] : move(ids, i, i + d); }
    const captionOf = it => String(it?.caption || '').trim() || String(it?.media?.title || '').trim();
    /** n° de page (1…) de chaque photo : {itemId: page} */
    function pageOf(items, perPage) { const m = {}; pages(items, perPage).forEach((p, i) => p.forEach(it => { m[it.id] = i + 1; })); return m; }
    return {PER_PAGE, STYLES, okPer, pages, range, move, moveBy, captionOf, pageOf, yearOf};
});
