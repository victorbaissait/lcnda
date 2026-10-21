/* LCNDA — Harmonisation K4, K8, K10 (validé) : dates de création / modification, pastilles de statut, « rien ici ».
 * Mode d'emploi : docs/UI.md (sections K4, K8, K10). Styles : assets/css/indicateurs.css.
 * API : window.LCNDA_UI.when / whenText / whenFull / badge / badgeKind (aussi window.LCNDA_APP.when et .badge).
 * Ne sert PAS aux dates généalogiques (naissance, actes…), qui suivent C4.
 */
(() => {
    'use strict';
    const UI = window.LCNDA_UI = window.LCNDA_UI || {};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

    /* ═════ K4 — « aujourd’hui à 10 h 22 », « hier à … », « mardi à … » (moins de 7 jours), puis « 17 oct. 2026 » ═════ */
    const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
    /** parse(d) → {date, time} : time = false quand on ne connaît que le jour */
    function parse(d) {
        if (d == null || d === '') return null;
        if (d instanceof Date) return isNaN(d) ? null : {date: d, time: true};
        if (typeof d === 'number') { const x = new Date(d < 1e11 ? d * 1000 : d); return isNaN(x) ? null : {date: x, time: true}; }
        const s = String(d).trim();
        let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);                                   // 2026-10-17 : un jour
        if (m) return {date: new Date(+m[1], m[2] - 1, +m[3], 12), time: false};
        m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ ,à]+(\d{1,2})[:h](\d{2})(?:[:m](\d{2}))?s?)?$/); // 17/10/2026 (23:39:32) : écrit à la française, heure locale
        if (m) { const x = new Date(+m[3], m[2] - 1, +m[1], m[4] != null ? +m[4] : 12, m[5] != null ? +m[5] : 0, +(m[6] || 0)); return isNaN(x) ? null : {date: x, time: m[4] != null}; }
        m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/); // SQLite (UTC) ou ISO
        if (m) { const x = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] || '00'}${m[7] || ''}${m[8] || 'Z'}`); return isNaN(x) ? null : {date: x, time: true}; }
        const x = new Date(s);
        return isNaN(x) ? null : {date: x, time: /\d:\d/.test(s)};
    }
    const hm = x => `${x.getHours()} h ${String(x.getMinutes()).padStart(2, '0')}`;
    const dayStart = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    /** whenText(date, {label, now}) → « aujourd’hui à 10 h 22 » ; label: 'Modifié' → « Modifié aujourd’hui à 10 h 22 » / « Modifié le 17 oct. 2026 » */
    UI.whenText = (d, {label = '', now = new Date()} = {}) => {
        const p = parse(d); if (!p) return '';
        const x = p.date, days = Math.round((dayStart(now) - dayStart(x)) / 86400000), at = p.time ? ` à ${hm(x)}` : '';
        let txt, rel = true;
        if (days === 0) txt = `aujourd’hui${at}`;
        else if (days === 1) txt = `hier${at}`;
        else if (days > 1 && days < 7) txt = `${DAYS[x.getDay()]}${at}`;
        else { txt = x.toLocaleDateString('fr-FR', {day: 'numeric', month: 'short', year: 'numeric'}); rel = false; }
        if (!label) return txt;
        return `${label} ${rel ? '' : 'le '}${txt}`;
    };
    /** whenFull(date) → « samedi 17 octobre 2026 à 23 h 39 » (la bulle au survol) */
    UI.whenFull = d => {
        const p = parse(d); if (!p) return '';
        const x = p.date;
        return `${DAYS[x.getDay()]} ${x.toLocaleDateString('fr-FR', {day: 'numeric', month: 'long', year: 'numeric'})}${p.time ? ` à ${hm(x)}` : ''}`;
    };
    /** when(date, {label}) → HTML <time> avec la date complète au survol (titre) ; '' si la date est vide ou illisible */
    UI.when = (d, o = {}) => {
        const p = parse(d); if (!p) return '';
        const iso = p.time ? p.date.toISOString() : `${p.date.getFullYear()}-${String(p.date.getMonth() + 1).padStart(2, '0')}-${String(p.date.getDate()).padStart(2, '0')}`;
        return `<time class="ui-when" datetime="${esc(iso)}" title="${esc(UI.whenFull(d))}">${esc(UI.whenText(d, o))}</time>`;
    };
    UI.whenParse = d => parse(d)?.date || null;

    /* ═════ K8 — une seule pastille, 6 couleurs qui veulent dire la même chose partout ═════
     * blue : en cours · green : fait / certain · yellow : à vérifier · red : problème · grey : fermé / archivé · black : décès ; sosa : bleu plein */
    const KINDS = ['blue', 'green', 'yellow', 'red', 'grey', 'black', 'sosa'];
    const ALIAS = {
        open: 'blue', active: 'blue', current: 'blue', progress: 'blue', in_progress: 'blue', en_cours: 'blue', paused: 'yellow', pending: 'yellow', waiting: 'yellow', sent: 'blue',
        done: 'green', ok: 'green', success: 'green', confirmed: 'green', certain: 'green', verified: 'green', living: 'green', received: 'green', answered: 'green', yes: 'green',
        warn: 'yellow', warning: 'yellow', check: 'yellow', probable: 'yellow', possible: 'yellow', unknown: 'yellow', todo: 'yellow', draft: 'yellow',
        error: 'red', problem: 'red', rejected: 'red', uncertain: 'red', late: 'red', overdue: 'red', no: 'red', missing: 'red',
        closed: 'grey', archived: 'grey', done_old: 'grey', neutral: 'grey', none: 'grey', gray: 'grey',
        deceased: 'black', dead: 'black', death: 'black',
    };
    /** badgeKind('closed') → 'grey' : la couleur d'un statut */
    UI.badgeKind = k => { const v = String(k || '').toLowerCase(); return KINDS.includes(v) ? v : ALIAS[v] || 'grey'; };
    /** badge(texte, sorte, {title, attrs, cls, html}) → <span class="ui-badge is-…"> (texte échappé, sauf html:true) */
    UI.badge = (text, kind = 'grey', {title = '', attrs = '', cls = '', html = false} = {}) =>
        `<span class="ui-badge is-${UI.badgeKind(kind)}${cls ? ' ' + cls : ''}"${title ? ` title="${esc(title)}"` : ''}${attrs ? ' ' + attrs : ''}>${html ? text : esc(text)}</span>`;

    const attach = () => { const app = window.LCNDA_APP; if (!app) return; ['when', 'whenText', 'whenFull', 'badge'].forEach(k => { if (!app[k]) app[k] = UI[k]; }); };
    attach();
    document.addEventListener('DOMContentLoaded', attach);
    addEventListener('load', attach);
})();
