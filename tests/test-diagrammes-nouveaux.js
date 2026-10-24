'use strict';
/**
 * 📊 Six diagrammes de plus (assets/js/heritage-diagram-nouveaux.js) : ⏳ sablier, 📅 Gantt, 🧠 carte mentale, 🎯 barres en cercle,
 * 🫧 bulles groupées, ⭕ anneaux d'avancement.   node tests/test-diagrammes-nouveaux.js
 *  chaque exemple se dessine (900 et 390 px), vide et lignes abîmées sans erreur, textes et couleurs piégés échappés, beaucoup de lignes sans figer.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
let failed = 0, n = 0;
const t = (name, fn) => { try { fn(); n++; console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
const sb = {window: {}, console, setTimeout, clearTimeout, Intl};
vm.createContext(sb);
for (const f of ['heritage-diagrams-render.js', 'heritage-diagram-nouveaux.js']) vm.runInContext(fs.readFileSync(path.join(root, 'assets/js', f), 'utf8'), sb, {filename: f});
const R = sb.window.LCNDA_EXT.diagramRender, MINE = ['hourglass', 'gantt', 'mindmap', 'radialbar', 'circlepack', 'rings'];
const TRAP = '<img src=x onerror="window.__xss=1">\'"&';
t('les 6 types sont au catalogue : icône, groupe, tableau, réglages, exemple', () => {
    assert.deepEqual([...sb.window.LCNDA_EXT.diagramNouveaux.KINDS], MINE);
    MINE.forEach(k => { const K = R.KINDS[k]; assert.ok(K.icon && K.label && K.group && K.grids.length && K.options.length >= 4 && typeof K.sample === 'function', k); });
});
t('chaque exemple se dessine (900 et 390 px)', () => {
    MINE.forEach(k => [900, 390].forEach(W => { const s = R.svg({kind: k, ...R.KINDS[k].sample()}, W);
        assert.match(s, /^<svg [^>]*role="img" aria-label="[^"]+"/, k); assert.doesNotMatch(s, /Dessin impossible|NaN|undefined|Infinity/, `${k} ${W}`); assert.ok(s.length > 1500, `${k} ${W}`); }));
});
t('réglages possibles (grille, autre ordre, couleur unique…) : toujours un dessin', () => {
    const o = {layout: 'grid', colorBy: 'one', colors: 'one', sort: 'none', links: false, curves: false, track: false, progress: false, sweep: 360, hole: 70, cols: 2};
    MINE.forEach(k => { const sp = R.KINDS[k].sample(); const s = R.svg({kind: k, ...sp, o: {...sp.o, ...o}}, 600); assert.doesNotMatch(s, /Dessin impossible|NaN|undefined|Infinity/, k); });
});
t('vide, lignes abîmées, réglages absurdes : un message, jamais d’erreur', () => {
    MINE.forEach(k => {
        for (const spec of [{kind: k}, {kind: k, rows: []}, {kind: k, rows: [null, 'x', 42, [], {}, {name: {}, gen: 'x', task: [], start: 'abc', end: null, value: 'NaN', goal: -5, label: '', branch: null}], o: null},
            {kind: k, rows: [{name: 'a', gen: 1e308, task: 'a', start: '1890', end: '1880', value: 1e308, goal: 1e-308, label: 'a', branch: 'a', leaf: 'b'}], o: {rowHeight: -5, sweep: 'x', hole: 1e9, thick: -1, cols: 99, gap: 1e9, height: -3}}]) {
            const s = R.svg(spec, 400); assert.doesNotMatch(s, /Dessin impossible|NaN|Infinity/, `${k} ${JSON.stringify(spec).slice(0, 90)}`);
        }
    });
});
t('textes et couleurs piégés : échappés, couleurs refusées', () => {
    MINE.forEach(k => {
        const rows = Array.from({length: 10}, (_, i) => ({name: TRAP + i, gen: i - 3, dates: TRAP, note: TRAP, task: TRAP + i, group: TRAP, start: '2026-01-0' + (i % 9 + 1), end: '2026-03-01', done: 50, branch: TRAP + (i % 3), leaf: TRAP + i, label: TRAP + i, value: i + 1, goal: 10}));
        const s = R.svg({kind: k, rows, o: {title: TRAP, center: TRAP, unit: TRAP, upColor: 'javascript:x', midColor: '"><script>', barColor: 'url(javascript:x)', bubbleColor: 'x;y', centerColor: '"/><x', todayColor: 'expression(1)'}}, 700);
        assert.doesNotMatch(s, /<img|<script|onerror="|javascript:|url\(|expression\(/, k);
    });
});
t('beaucoup de lignes : rapide et borné', () => {
    MINE.forEach(k => { const rows = Array.from({length: 5000}, (_, i) => ({name: 'P' + i, gen: (i % 9) - 4, task: 'T' + i, start: String(1800 + (i % 200)), end: String(1810 + (i % 200)), done: i % 100, branch: 'B' + (i % 30), leaf: 'L' + i, label: 'X' + i, value: (i % 50) + 1, goal: 60}));
        const t0 = Date.now(); const s = R.svg({kind: k, rows}, 900); assert.ok(Date.now() - t0 < 4000, k); assert.ok(s.length < 6e6, k); });
});
console.log(`${failed ? '✗' : '✓'} six diagrammes de plus : ${n} vérifications${failed ? `, ${failed} en échec` : ''}`);
process.exit(failed ? 1 : 0);
