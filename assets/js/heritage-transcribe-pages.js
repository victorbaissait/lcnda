/* LCNDA — 📑 L'Atelier de transcription sur un document en plusieurs pages (vague 3, sous-étape 3a ; maquette
 * docs/design/atelier-transcription-idees.html, F2 ; décision 5 : au choix, un seul texte coupé par « — page 2 — » (conseillé)
 * ou un texte par page). Les pages d'un document : lib/media_pages.php, assets/js/heritage-pages.js.
 * Ici, ce qui ne dépend pas de la fenêtre (pour heritage-transcribe.js, heritage-transcribe-trouve.js et les essais) :
 *  - les repères « — page 2 — » : une ligne entière « — <un mot> <nombre> — » (le mot suit la langue de l'écran ; le serveur lit
 *    la même chose, lib/transcriptions.php, ACT_PAGE_MARK) ; le morceau n° i du texte est la page data.pages[i] ;
 *  - où est une position du texte : sa page et sa ligne dans la page (« page 3, ligne 7 ») ;
 *  - le réglage « Plusieurs pages » (un seul texte, conseillé ; ou un texte par page).
 *   ext.txPages = {marks, segments, segAt, lineOf, markerText, mode, setMode, MODE_KEY}
 */
(() => {
    'use strict';
    const G = typeof window !== 'undefined' ? window : globalThis;
    const ext = G.LCNDA_EXT = G.LCNDA_EXT || {};
    const T = (k, v) => (G.LCNDA_I18N?.t ? G.LCNDA_I18N.t(k, v) : String(k).replace(/\{(\w+)\}/g, (_, x) => v?.[x] ?? ''));
    const RX = () => /^—[ \t]*[\p{L}.]+[ \t]+\d+[^\n—]*—[ \t]*$/gmu;
    /** les lignes « — page N — » : [{at, end, n}] (at : début de la ligne, end : sa fin, avant le retour à la ligne) */
    function marks(body) {
        const out = [], rx = RX(); let m; const s = String(body || '');
        while ((m = rx.exec(s))) { out.push({at: m.index, end: m.index + m[0].length, n: Number((m[0].match(/\d+/) || [0])[0])}); if (m[0].length === 0) rx.lastIndex++; }
        return out;
    }
    /** les morceaux du texte, un par page : [{s, e}] (le texte du morceau = body.slice(s, e), sans les repères) */
    function segments(body) {
        const s = String(body || ''), mk = marks(s), out = []; let from = 0;
        mk.forEach(k => { out.push({s: from, e: Math.max(from, k.at - 1)}); from = Math.min(s.length, k.end + 1); });
        out.push({s: from, e: Math.max(from, s.length)});
        return out;
    }
    /** le morceau (la page dans l'ordre du texte) d'une position ; sur un repère : la page qui commence */
    function segAt(body, pos) {
        const mk = marks(body); let i = 0;
        for (const k of mk) { if (pos >= k.at) i++; else break; }
        return i;
    }
    /** la page (n° de morceau) et la ligne dans la page d'une position du texte (lignes comptées à partir de 1, repère exclu) */
    function lineOf(body, pos) {
        const s = String(body || ''), i = segAt(s, pos), sg = segments(s)[i] || {s: 0};
        return {seg: i, line: s.slice(sg.s, Math.max(sg.s, pos)).split('\n').length};
    }
    const markerText = n => T('— page {n} —', {n});
    /* le réglage « Plusieurs pages » : 'one' = un seul texte coupé par « — page 2 — » (conseillé), 'per' = un texte par page */
    const MODE_KEY = 'genealogie-transcribe-pages-mode';
    const mode = () => { try { return G.localStorage?.getItem(MODE_KEY) === 'per' ? 'per' : 'one'; } catch (_) { return 'one'; } };
    const setMode = v => { try { G.localStorage?.setItem(MODE_KEY, v === 'per' ? 'per' : 'one'); } catch (_) {} };
    ext.txPages = {marks, segments, segAt, lineOf, markerText, mode, setMode, MODE_KEY};
    if (typeof module !== 'undefined' && module.exports) module.exports = ext.txPages;
})();
