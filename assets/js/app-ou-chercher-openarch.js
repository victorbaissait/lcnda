/* LCNDA — 🌍 « Où chercher ? » → 🇳🇱🇧🇪 Open Archives : ranger les actes trouvés (lib/ou_chercher_openarch.php, GET
 * ou_chercher_openarch) du plus probable au moins probable pour CETTE personne, et dire pourquoi. Calculs purs, SANS RÉSEAU
 * (window.LCNDA_OUC_OA ; aussi require() dans Node pour les tests).
 *  - score(ligne, personne) → {score, level: 'high' | 'mid' | 'low', reasons: [phrases]}
 *  - rank(lignes, personne, marques) → {list, no: écartés « ✗ Pas lui », added: déjà ajoutés}
 *  - MAIN_ROLES : les rôles où la personne est le sujet de l'acte (elle-même baptisée, mariée, décédée…)
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.LCNDA_OUC_OA = api;
})(typeof window !== 'undefined' ? window : null, function () {
    'use strict';
    const I18 = () => (typeof window !== 'undefined' && window.LCNDA_I18N && window.LCNDA_I18N.lang !== 'fr' ? window.LCNDA_I18N : null);
    const T = (s, v0) => { const v = v0 && Object.fromEntries(Object.entries(v0).map(([k, x]) => [k, typeof x === 'number' ? String(x) : x])); const I = I18(); return I ? I.t(s, v) : String(s).replace(/\{([a-z_]+)\}/gi, (m, k) => (v && k in v ? String(v[k]) : m)); };
    const fold = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, "'").replace(/[-_.]/g, ' ').replace(/\s+/g, ' ').trim();
    const MAIN_ROLES = ['kind', 'dopeling', 'gedoopte', 'bruid', 'bruidegom', 'overledene', 'begravene', 'hoofdpersoon', 'geregistreerde'];
    const PARENT_ROLES = ['vader', 'moeder'];
    const BIRTH = ['geboorte', 'doop'], DEATH = ['overlijden', 'begraven', 'begrafenis'], MARR = ['huwelijk', 'ondertrouw'];
    /** les mots d'un nom, sans les petits mots (« Pieter de Bakker » → pieter, bakker) */
    const words = s => fold(s).split(' ').filter(w => w && !['van', 'von', 'de', 'der', 'den', 'ter', 'ten', 'het', 'la', 'le', 'du', 'da', 'di', 'del', 'des', 'wed', 'wed.'].includes(w));

    function score(row, person) {
        const p = person || {}, r = row || {}, reasons = [];
        let s = 0;
        const nw = words(r.name), last = words(p.last), first = fold((p.first || '').split(/[\s,]+/)[0]);
        // le nom
        if (last.length && last.every(w => nw.includes(w))) s += 3; else if (last.length && last.some(w => nw.some(x => x.startsWith(w.slice(0, 4))))) { s += 1; reasons.push(T('nom approchant')); } else s -= 2;
        if (first && nw[0] === first) { s += 3; reasons.push(T('même prénom')); }
        else if (first && nw.includes(first)) { s += 1.5; reasons.push(T('son prénom, pas en premier')); }
        else if (first && nw[0] && (nw[0].startsWith(first.slice(0, 3)) || first.startsWith(nw[0].slice(0, 3)))) { s += 0.5; reasons.push(T('prénom approchant')); }
        else if (first) s -= 1.5;
        // le rôle et l'année
        const role = fold(r.role_nl || r.role), type = fold(r.type_nl || r.type), y = Number(r.year) || 0, by = Number(p.birth_year) || 0, dy = Number(p.death_year) || 0;
        const main = MAIN_ROLES.includes(role);
        if (main && BIRTH.includes(type) && y && by) {
            const d = Math.abs(y - by);
            if (d <= 1) { s += 3; reasons.push(T('né(e) en {y} : son année', {y})); } else if (d <= 3) { s += 1; reasons.push(T('{n} ans d’écart avec sa naissance', {n: d})); } else s -= 3;
        } else if (main && DEATH.includes(type) && y) {
            if (dy && Math.abs(y - dy) <= 1) { s += 3; reasons.push(T('décès en {y} : son année', {y})); }
            else if (dy) s -= 3;
            else if (by && y - by >= 0 && y - by <= 105) { s += 0.5; reasons.push(T('décès à {n} ans : possible', {n: y - by})); }
            else if (by) s -= 3;
        } else if (main && MARR.includes(type) && y && by) {
            const age = y - by;
            if (age >= 16 && age <= 60) { s += 1; reasons.push(T('marié(e) à {n} ans : possible', {n: age})); } else s -= 2;
        } else if (PARENT_ROLES.includes(role) && y && by) {
            const age = y - by;
            if (age >= 16 && age <= 60) { s += 0.5; reasons.push(T('{role} dans cet acte : un de ses enfants ?', {role: r.role || role})); } else s -= 2;
        } else if (y && by && (y < by - 1 || y > (dy || by + 100) + 1)) s -= 2;
        if (main) s += 0.5;
        // le lieu
        const pl = fold(String(r.place || '').split(',')[0]);
        const hit = pl && (p.places || []).find(x => fold(String(x).split(',')[0]) === pl);
        if (hit) { s += 3; reasons.unshift(T('à {place}, un lieu de sa vie', {place: hit})); }
        const level = s >= 8 ? 'high' : s >= 4.5 ? 'mid' : 'low';
        return {score: Math.round(s * 10) / 10, level, reasons: reasons.slice(0, 3)};
    }
    const LEVEL = {high: ['Très probable', 'green'], mid: ['Possible', 'yellow'], low: ['Peu probable', 'grey']};

    /** les lignes rangées : ✗ Pas lui à part ; ✓ déjà ajoutés gardés (marqués) */
    function rank(rows, person, marks = {}) {
        const list = [], no = [];
        (rows || []).forEach(r => {
            if (!r || !r.key) return;
            const m = marks?.[r.key] || null;
            const x = {...r, ...score(r, person), mark: m};
            if (m?.verdict === 'no') no.push(x); else list.push(x);
        });
        list.sort((a, b) => b.score - a.score || (Number(a.year) || 0) - (Number(b.year) || 0));
        return {list, no, added: list.filter(x => x.mark?.verdict === 'added').length};
    }
    /** « 4 septembre 1781 », « 1781 » */
    const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    const dateText = r => (r.year ? [r.day || '', r.month ? T(MOIS[r.month - 1]) : '', r.year].filter(Boolean).join(' ') : '');

    return {score, rank, LEVEL, MAIN_ROLES, dateText, fold, words};
});
