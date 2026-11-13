/* LCNDA — noyau commun de 🧬 l'Arbre des métiers et de 🗺 la Carte de la vie (pour le navigateur et pour Node, sans écran).
 * Rien n'est dessiné ici : l'arbre reprend celui de Graphiques (api tree, cases .tree-card), la carte reprend la « Carte qui
 * raconte » des diagrammes (heritage-diagram-cartes2.js). Les métiers sont classés par le serveur (lib/metiers_carte.php,
 * dictionnaire des métiers anciens).
 *  - link(parentJobs, childJobs)   → 'same' (au moins un métier commun) | 'change' | 'unknown' (un des deux sans métier) ;
 *  - walk(tree, mode)              → les cases et les liens parent → enfant de l'arbre (ascendants ou descendants) ;
 *  - stats(links, jobs)            → la part des fils qui reprennent le métier du père (et des filles, celui de la mère), par siècle ;
 *  - mainSector(jobs), centuryLabel(n), pct(a, b) ;
 *  - orderSteps(steps), splitSteps(steps) : les étapes d'une vie dans l'ordre (année, puis ordre d'arrivée), placées ou non.
 */
(function (root) {
    'use strict';
    const keysOf = jobs => new Set((Array.isArray(jobs) ? jobs : []).map(j => j && j.key).filter(Boolean));
    function link(parentJobs, childJobs) {
        const a = keysOf(parentJobs), b = keysOf(childJobs);
        if (!a.size || !b.size) return 'unknown';
        for (const k of a) if (b.has(k)) return 'same';
        return 'change';
    }
    const idOf = n => Number(n && n.person && n.person.id) || 0;
    /** les cases (une par personne, la première place gardée) et les liens de filiation montrés */
    function walk(tree, mode = 'ancestors') {
        const nodes = [], links = [], seen = new Set();
        const go = (n, depth) => {
            const id = idOf(n); if (!id) return;
            if (!seen.has(id)) { seen.add(id); nodes.push({id, person: n.person, depth}); }
            (Array.isArray(n.children) ? n.children : []).forEach(c => {
                const cid = idOf(c); if (!cid) return;
                // ascendants : sous une case viennent ses parents ; descendants : ses enfants
                const parent = mode === 'descendants' ? n.person : c.person, child = mode === 'descendants' ? c.person : n.person;
                links.push({parent: Number(parent.id), child: Number(child.id), parentGender: parent.gender || '', childGender: child.gender || '', childYear: Number(child.birth_year) || null, at: cid});
                go(c, depth + 1);
            });
        };
        if (tree) go(tree, 0);
        return {nodes, links};
    }
    const centuryOf = y => (Number.isFinite(Number(y)) && y ? Math.floor(Number(y) / 100) + 1 : 0);
    const centuryLabel = c => (c ? `${c}${c === 1 ? 'er' : 'e'} siècle` : 'Sans date');
    const pct = (a, b) => (b ? Math.round(a / b * 100) : 0);
    /** père → fils et mère → fille : combien reprennent le métier, par siècle de naissance de l'enfant */
    function stats(links, jobs = {}) {
        const out = {male: {same: 0, pairs: 0, by: {}}, female: {same: 0, pairs: 0, by: {}}};
        const done = new Set();
        (links || []).forEach(l => {
            const g = l.childGender; if ((g !== 'male' && g !== 'female') || l.parentGender !== g) return;
            const k = l.parent + '|' + l.child; if (done.has(k)) return; done.add(k);
            const r = link(jobs[l.parent], jobs[l.child]); if (r === 'unknown') return;
            const o = out[g], c = centuryOf(l.childYear);
            o.pairs++; if (r === 'same') o.same++;
            o.by[c] = o.by[c] || {century: c, same: 0, pairs: 0}; o.by[c].pairs++; if (r === 'same') o.by[c].same++;
        });
        ['male', 'female'].forEach(g => { out[g].by = Object.values(out[g].by).sort((a, b) => (a.century || 9999) - (b.century || 9999)); });
        return out;
    }
    const mainSector = jobs => (Array.isArray(jobs) && jobs[0] && jobs[0].sector) || '';
    /** les étapes d'une vie : par année (sans année à la fin), à année égale dans l'ordre d'arrivée */
    function orderSteps(steps) {
        return (Array.isArray(steps) ? steps : []).map((s, i) => [s, i]).sort((a, b) => {
            const ya = Number.isFinite(Number(a[0].year)) && a[0].year !== null && a[0].year !== '' ? Number(a[0].year) : 99999;
            const yb = Number.isFinite(Number(b[0].year)) && b[0].year !== null && b[0].year !== '' ? Number(b[0].year) : 99999;
            return ya - yb || a[1] - b[1];
        }).map(x => x[0]);
    }
    const located = s => s && s.lat !== null && s.lat !== undefined && s.lon !== null && s.lon !== undefined && Number.isFinite(Number(s.lat)) && Number.isFinite(Number(s.lon));
    /** placées sur la carte / avec un lieu mais sans position / sans lieu du tout */
    function splitSteps(steps) {
        const out = {located: [], missing: [], noPlace: []};
        (steps || []).forEach(s => { if (!s) return; if (located(s)) out.located.push(s); else if (String(s.place || '').trim()) out.missing.push(s); else out.noPlace.push(s); });
        return out;
    }
    const core = {link, walk, stats, mainSector, centuryOf, centuryLabel, pct, orderSteps, splitSteps, located};
    root.LCNDA_METIERS_CARTE = core;
    if (typeof module !== 'undefined' && module.exports) module.exports = core;
})(typeof window !== 'undefined' ? window : globalThis);
