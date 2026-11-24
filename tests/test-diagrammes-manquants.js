'use strict';
/**
 * 📊 Les diagrammes qui manquaient (assets/js/heritage-diagram-manquants.js, comparés au « Data Viz Catalogue ») :
 * chaque sorte se dessine avec son exemple, à 900 et 390 px, avec chacun de ses réglages, sans NaN ; vide et lignes abîmées : un message ;
 * un texte piégé reste du texte ; les calculs (dates approchées, densité, tige et feuilles, ensembles parallèles) ;
 * « Prendre dans ma base » sur une petite famille fictive (MAZAUD, LACOMBE, DURAND).
 *     node tests/test-diagrammes-manquants.js
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
let failed = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
const same = (a, b, m) => assert.equal(JSON.stringify(a), JSON.stringify(b), m); // les objets viennent d'un autre « monde » (vm)
const BAD = /NaN|undefined|Infinity|Dessin impossible/;
const TRAP = '<img src=x onerror="window.__xss=1">\'"&';
const MINE = ['parsets', 'uncertain', 'lifespans', 'density', 'stemleaf', 'tally', 'chordlines', 'unitdots', 'proparea', 'radialcol', 'stackarea', 'flowtext', 'annotated', 'timetable'];
const D = {people: [
    {id: 1, f: 'Pierre', l: 'MAZAUD', g: 'm', by: 1750, dy: 1810, bp: 10, dp: 10, bt: 'vers 1750', dt: '3 mars 1810', occ: 'Cultivateur'},
    {id: 2, f: 'Marie', l: 'LACOMBE', g: 'f', by: 1755, dy: 1820, bp: 11, dp: 10, bt: 'avant 1756', dt: '1820-07-14', occ: ''},
    {id: 3, f: 'Jean', l: 'MAZAUD', g: 'm', by: 1780, dy: 1850, bp: 10, dp: 12, bt: '12 janvier 1780', dt: 'entre 1849 et 1851', occ: 'Porteur d’eau'},
    {id: 4, f: 'Anne', l: 'DURAND', g: 'f', by: 1785, dy: 1860, bp: 12, dp: 12, bt: '1785-02-03', dt: '', occ: ''},
    {id: 5, f: 'Jean', l: 'MAZAUD', g: 'm', by: 1810, dy: 1880, bp: 12, dp: 12, bt: '5 août 1810', dt: '', occ: 'Marchand'}],
    places: {10: ['Aurillac', 44.9, 2.4], 11: ['Mauriac', 45.2, 2.3], 12: ['Paris', 48.9, 2.35]}, events: [], couples: [[1, 2, 1778, 10], [3, 4, 1808, 12]], root: 5};

const sb = {window: {}, console, setTimeout, clearTimeout, Intl, document: {addEventListener() {}, querySelectorAll: () => []}};
sb.window.LCNDA_APP = {state: {bootstrap: {startPersonId: 1}}, api: async a => (a === 'anim_people' ? JSON.parse(JSON.stringify(D)) : {}), toast() {}};
vm.createContext(sb);
for (const f of ['heritage-diagrams-render.js', 'heritage-diagram-manquants.js']) vm.runInContext(fs.readFileSync(path.join(root, 'assets/js', f), 'utf8'), sb, {filename: f});
const ext = sb.window.LCNDA_EXT, R = ext.diagramRender, M = ext.diagramManquants;
const draw = (spec, W = 700) => R.svg(spec, W);

(async () => {
    await t('les 14 sortes sont au catalogue, avec un exemple, des tableaux et des réglages', () => {
        same(M.KINDS, MINE);
        for (const k of MINE) { const K = R.KINDS[k]; assert.ok(K && K.icon && K.label && K.render && K.grids?.length && K.options?.length && typeof K.sample === 'function', k); }
    });
    await t('chaque exemple se dessine à 900 et 390 px, sans NaN ni « undefined »', () => {
        for (const k of MINE) for (const W of [900, 390]) { const svg = draw({kind: k, ...R.KINDS[k].sample()}, W); assert.ok(svg.length > 400, `${k} ${W}`); assert.doesNotMatch(svg, BAD, `${k} ${W}`); }
    });
    await t('chaque réglage (case, menu, couleur, curseur) se dessine sans erreur', () => {
        for (const k of MINE) {
            const K = R.KINDS[k];
            for (const o of K.options) {
                const vals = o.type === 'select' ? o.choices.map(c => c[0]) : o.type === 'check' ? [true, false] : o.type === 'range' ? [o.min, o.max] : o.type === 'color' ? ['#123456', 'rouge?'] : o.type === 'number' ? ['', 0, 7, -3] : ['', 'x'];
                for (const v of vals) { const s = {kind: k, ...K.sample()}; s.o = {...s.o, [o.k]: v}; const svg = draw(s, 700); assert.doesNotMatch(svg, BAD, `${k} ${o.k}=${v}`); }
            }
        }
    });
    await t('vide, lignes abîmées : un message (pas une erreur) ; un texte piégé reste du texte', () => {
        for (const k of MINE) {
            assert.doesNotMatch(draw({kind: k, rows: []}), BAD, k);
            assert.doesNotMatch(draw({kind: k, rows: [null, 3, 'x', {}, {value: 'abc', from: 'zz', start: '99:99'}]}), BAD, k);
            const s = {kind: k, ...R.KINDS[k].sample()}; s.rows = s.rows.map(r => Object.fromEntries(Object.entries(r).map(([a, b]) => [a, typeof b === 'string' ? TRAP + b : b]))); s.o = {...s.o, title: TRAP, center: TRAP, axisA: TRAP, img: 'x"onload="1.png'};
            const svg = draw(s); assert.doesNotMatch(svg, /<img|onerror="|onload="1/, k);
        }
    });
    await t('dates approchées : vers, avant, après, entre, ?, sûre', () => {
        const f = M.fuzzy;
        same(f('vers 1750', 5, 20), {lo: 1745, best: 1750, hi: 1755, kind: 'about'});
        same(f('avant 1802', 5, 20), {lo: 1782, best: 1802, hi: 1802, kind: 'before'});
        same(f('après 1810'), {lo: 1810, best: 1810, hi: 1830, kind: 'after'});
        same(f('entre 1750 et 1760'), {lo: 1750, best: 1755, hi: 1760, kind: 'range'});
        same(f('1750/1756'), {lo: 1750, best: 1753, hi: 1756, kind: 'range'});
        assert.equal(f('1758?').kind, 'about'); assert.equal(f('12 février 1745').kind, 'sure'); assert.equal(f('1745-02-12').kind, 'sure'); assert.equal(f('ABT 1700').kind, 'about'); assert.equal(f(''), null);
    });
    await t('densité : l’aire sous la courbe vaut 1 ; tige et feuilles : toutes les valeurs écrites', () => {
        const d = M.kde([10, 20, 30, 40, 50], 8, -40, 100, 400), dx = 140 / 400, area = d.reduce((s, [, y]) => s + y * dx, 0);
        assert.ok(Math.abs(area - 1) < .02, String(area));
        const svg = draw({kind: 'stemleaf', rows: [{value: 23}, {value: 27}, {value: 31}]}); assert.match(svg, />3</); assert.match(svg, />7</); assert.match(svg, />2</);
    });
    await t('ensembles parallèles : les bandes d’un axe font le total ; 2 axes ou 3', () => {
        const s3 = draw({kind: 'parsets', ...R.KINDS.parsets.sample()}); assert.equal((s3.match(/<path /g) || []).length > 8, true);
        const s2 = draw({kind: 'parsets', rows: [{a: 'A', b: 'X', value: 2}, {a: 'B', b: 'X', value: 1}]}); assert.match(s2, /A \(2\)/); assert.match(s2, /X \(3\)/);
    });
    /* « Prendre dans ma base » : chaque panneau, sa donnée */
    const fromApp = async (k, set = {}) => {
        const html = R.KINDS[k].fromApp.html({o: {}}); const fields = {}; for (const m of html.matchAll(/data-dgm="(\w+)"/g)) fields[m[1]] = {value: (set[m[1]] ?? (html.match(new RegExp(`data-dgm="${m[1]}"[^>]*>(?:[^]*?<option value="([^"]*)"[^>]*selected)?`))?.[1] ?? (m[1] === 'top' ? '12' : '')))};
        let applied = null, click = null;
        const pane = {querySelector: q => { if (q === '[data-dgm-go]') return {disabled: false, addEventListener: (_, fn) => { click = fn; }}; if (q === '[data-dgm-msg]') return {textContent: '', isConnected: true}; const m = q.match(/data-dgm="(\w+)"/); return m ? fields[m[1]] || null : null; }};
        R.KINDS[k].fromApp.bind(pane, {spec: () => ({kind: k, rows: [], o: {}}), apply: s => { applied = s; }});
        await click(); return applied;
    };
    await t('Prendre dans ma base : parcours, dates approchées, vies, âges, comptes, mariages, points, mois, aires', async () => {
        const p = await fromApp('parsets', {a: 'bplace', b: 'occ', c: ''}); assert.ok(p.rows.some(r => r.a === 'Aurillac' && r.b === 'Cultivateur' && r.value === 1), JSON.stringify(p.rows)); assert.equal(p.o.axisA, 'Lieu de naissance');
        const u = await fromApp('uncertain'); same(u.rows.map(r => r.date).sort(), ['avant 1756', 'entre 1849 et 1851', 'vers 1750']);
        const l = await fromApp('lifespans', {g: 'surname', sur: 'mazaud'}); assert.equal(l.rows.length, 3); same(l.rows[0], {name: 'Pierre MAZAUD', from: 1750, to: 1810, group: 'MAZAUD'});
        const d = await fromApp('density', {g: ''}); assert.equal(d.rows.length, 5);
        const tl = await fromApp('tally', {k: 'decade'}); same(tl.rows.map(r => r.label), ['1750', '1780', '1810']);
        const c = await fromApp('chordlines', {by: 'surname'}); same(c.rows.map(r => [r.from, r.to]).sort(), [['DURAND', 'MAZAUD'], ['LACOMBE', 'MAZAUD']]);
        const ud = await fromApp('unitdots', {c: 'century', g: 'sex'}); assert.ok(ud.rows.some(r => /XVIIIe/.test(r.column) && r.group === 'Homme' && r.value === 2), JSON.stringify(ud.rows));
        const rc = await fromApp('radialcol', {what: 'bt'}); same(rc.rows.map(r => r.value), [1, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0]);
        const sa = await fromApp('stackarea', {g: 'surname'}); assert.ok(sa.rows.some(r => r.x === 1780 && r.series === 'MAZAUD' && r.value === 1));
        const pa = await fromApp('proparea', {k: 'bplace'}); same(pa.rows[0], {label: 'Aurillac', value: 2});
        for (const s of [p, u, l, d, tl, c, ud, rc, sa, pa]) assert.doesNotMatch(draw(s), BAD);
    });
    console.log(failed ? `${failed} essai(s) en échec` : 'Les diagrammes qui manquaient marchent.');
    process.exit(failed ? 1 : 0);
})();
