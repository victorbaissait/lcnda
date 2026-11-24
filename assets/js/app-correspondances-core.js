/* LCNDA — ✉️ Correspondances et 🏷 sortes de documents (maquette docs/design/correspondances.html) : les calculs, sans page.
 * window.LCNDA_CORRESP (aussi require() dans Node : tests/test-correspondances.js). Les documents sont ceux de l'onglet Documents
 * (api onglets&op=documents : corr = sorte de correspondance, corrs = correspondants, people = fiches reliées, reply_to).
 *   dayOf(texte)                 « 3 août 1914 », « 1914-08-03 », « 03/08/1914 », « août 1914 », « 1914 » → {day (jours), precision: 'day'|'month'|'year'} ou null
 *   exchanges(docs)              les correspondances : [{key, names: [noms], title « Pierre MAZAUD ⇄ Marie LACOMBE », pieces (dans l'ordre), from, to, transcribed, gaps, replies, avgDelay}]
 *   gaps(pièces, mois)           les trous (plus de N mois sans pièce) : [{after, before, months}]
 *   SORTS / sortOf(doc)          🏷 la sorte d'un document (cartes postales, lettres, photos, actes, faire-part, militaire, presse…)
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.LCNDA_CORRESP = api;
})(typeof window !== 'undefined' ? window : null, function () {
    'use strict';
    const fold = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const MONTHS = ['janv', 'fev', 'mars', 'avr', 'mai', 'juin', 'juil', 'aou', 'sept', 'oct', 'nov', 'dec'];
    const dayNum = (y, m, d) => Math.floor(Date.UTC(y, m - 1, d) / 864e5);
    /** une date écrite → le jour (nombre de jours depuis 1970, négatif avant) et sa précision */
    function dayOf(text) {
        const s = fold(text).trim(); if (!s) return null;
        let m = s.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/); if (m) return {day: dayNum(+m[1], +m[2], +m[3]), precision: 'day', year: +m[1]};
        m = s.match(/\b(\d{1,2})[/.](\d{1,2})[/.](\d{4})\b/); if (m) return {day: dayNum(+m[3], +m[2], +m[1]), precision: 'day', year: +m[3]};
        m = s.match(/\b(\d{1,2})(?:er)?\s+([a-z]+)\.?\s+(\d{4})\b/); if (m) { const k = MONTHS.findIndex(x => m[2].startsWith(x)); if (k >= 0) return {day: dayNum(+m[3], k + 1, +m[1]), precision: 'day', year: +m[3]}; }
        m = s.match(/\b([a-z]+)\.?\s+(\d{4})\b/); if (m) { const k = MONTHS.findIndex(x => m[1].startsWith(x)); if (k >= 0) return {day: dayNum(+m[2], k + 1, 15), precision: 'month', year: +m[2]}; }
        m = s.match(/\b(1[0-9]{3}|20[0-9]{2})\b/); if (m) return {day: dayNum(+m[1], 7, 1), precision: 'year', year: +m[1]};
        return null;
    }
    const isLetter = d => !!String(d.corr || '').trim();
    /** les personnes d'une pièce : les fiches reliées et les correspondants (sans doublon de nom) */
    function partiesOf(d) {
        const out = new Map();
        [...(d.people || []), ...(d.corrs || [])].forEach(p => { const n = String(p.name || '').trim(); if (n && !out.has(fold(n))) out.set(fold(n), {id: Number(p.id) || 0, name: n}); });
        return [...out.values()].sort((a, b) => fold(a.name).localeCompare(fold(b.name)));
    }
    /** les trous d'un fil : plus de `months` mois entre deux pièces datées au jour ou au mois */
    function gaps(pieces, months = 2) {
        const dated = pieces.filter(p => p._day && p._day.precision !== 'year'), out = [];
        for (let i = 1; i < dated.length; i++) {
            const a = dated[i - 1], b = dated[i], m = (b._day.day - a._day.day) / 30.44;
            if (m >= months) out.push({after: a.id, before: b.id, months: Math.round(m), from: a.date_text, to: b.date_text});
        }
        return out;
    }
    /** les correspondances : une par groupe de personnes (fiches reliées + correspondants) ; « Correspondant inconnu » à la fin */
    function exchanges(docs, {gapMonths = 2} = {}) {
        const by = new Map();
        (docs || []).filter(isLetter).forEach(d => {
            const parts = partiesOf(d), key = parts.length ? parts.map(p => fold(p.name)).join('|') : '';
            if (!by.has(key)) by.set(key, {key, parties: parts, pieces: []});
            by.get(key).pieces.push({...d, _day: dayOf(d.date_text) || (d.year ? {day: dayNum(d.year, 7, 1), precision: 'year', year: d.year} : null)});
        });
        const out = [...by.values()].map(x => {
            x.pieces.sort((a, b) => (a._day ? a._day.day : Infinity) - (b._day ? b._day.day : Infinity) || a.id - b.id);
            const years = x.pieces.map(p => p._day?.year).filter(Boolean), ids = new Map(x.pieces.map(p => [p.id, p]));
            // ↩ les réponses : le délai entre une pièce et celle à laquelle elle répond (jours connus des deux côtés)
            const replies = x.pieces.filter(p => p.reply_to && ids.has(p.reply_to)).map(p => { const q = ids.get(p.reply_to); return {id: p.id, to: q.id, days: p._day && q._day && p._day.precision === 'day' && q._day.precision === 'day' ? p._day.day - q._day.day : null}; });
            const known = replies.filter(r => r.days != null && r.days >= 0);
            return {key: x.key, names: x.parties.map(p => p.name), parties: x.parties, title: x.parties.length ? x.parties.map(p => p.name).join(' ⇄ ') : '',
                pieces: x.pieces, from: years.length ? Math.min(...years) : null, to: years.length ? Math.max(...years) : null,
                transcribed: x.pieces.filter(p => p.has_tr).length, gaps: gaps(x.pieces, gapMonths), replies,
                avgDelay: known.length ? Math.round(known.reduce((s, r) => s + r.days, 0) / known.length) : null, maxDelay: known.length ? Math.max(...known.map(r => r.days)) : null};
        });
        return out.sort((a, b) => (a.key === '') - (b.key === '') || b.pieces.length - a.pieces.length || fold(a.title).localeCompare(fold(b.title)));
    }

    /* 🏷 les sortes de documents (partie 4 bis) : [clé, émoji, nom] ; la sorte vient de ce qui est noté, sinon du titre */
    const SORTS = [['postcard', '🏞', 'Cartes postales'], ['letter', '✉️', 'Lettres, télégrammes'], ['photo', '📷', 'Photos de famille'], ['civil', '📜', 'Actes d’état civil et paroissiaux'],
        ['notarial', '🖋', 'Actes notariés'], ['military', '🎖', 'Papiers militaires'], ['announce', '🕊', 'Faire-part, souvenirs mortuaires'], ['press', '📰', 'Presse'],
        ['identity', '🪪', 'Papiers d’identité et de vie'], ['school', '🎓', 'École et travail'], ['map', '🗺', 'Cartes, plans, cadastre'], ['av', '🎙', 'Sons et vidéos'], ['other', '📦', 'Autres']];
    const KIND_CIVIL = ['naissance', 'bapteme', 'mariage', 'deces', 'sepulture', 'recensement'];
    function sortOf(d) {
        const t = fold(`${d.title || ''} ${d.subject || ''}`), mt = fold(d.media_type), corr = fold(d.corr), kinds = d.kinds || [];
        if (mt === 'audio' || mt === 'video') return 'av';
        if (/^(photo|portrait)\b/.test(fold(d.title)) && !corr) return 'photo';
        if (/carte postale|postcard/.test(corr) || /\bcartes? postales?\b|\bcpa\b/.test(t)) return 'postcard';
        if (corr || /\b(lettre|courrier|telegramme|correspondance)\b/.test(t)) return 'letter';
        if (/\b(faire[- ]part|souvenir mortuaire|image pieuse|avis de deces|memento)\b/.test(t)) return 'announce';
        if (kinds.includes('militaire') || /\b(matricule|militaire|regiment|livret militaire|citation|medaille|mobilisation|conscri)/.test(t)) return 'military';
        if (kinds.includes('notarial') || kinds.includes('notoriete') || /\b(notari|contrat de mariage|testament|inventaire|vente|bail|partage|donation)/.test(t)) return 'notarial';
        if (kinds.some(k => KIND_CIVIL.includes(k)) || /\b(acte de|naissance|bapteme|deces|sepulture|registre|etat civil|recensement)\b/.test(t)) return 'civil';
        if (/\b(journal|presse|coupure|gazette|article|quotidien)\b/.test(t)) return 'press';
        if (/\b(livret de famille|passeport|carte d'identite|permis|carte d'electeur|carte de|livret)\b/.test(t)) return 'identity';
        if (/\b(diplome|bulletin|certificat d'etudes|ecole|lycee|contrat de travail|fiche de paie|apprentissage|certificat de travail)\b/.test(t)) return 'school';
        if (/\b(plan|cadastr|matrice|carte de|carte d'etat-major)\b/.test(t)) return 'map';
        if (mt === 'image') return 'photo';
        return 'other';
    }
    const sortMeta = k => SORTS.find(s => s[0] === k) || SORTS[SORTS.length - 1];

    return {fold, dayOf, partiesOf, gaps, exchanges, SORTS, sortOf, sortMeta, isLetter};
});
