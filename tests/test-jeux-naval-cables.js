'use strict';
/** ⚓ Bataille navale et 🔌 Câbles (app-jeu-naval.js, app-jeu-cables.js) : la logique sans écran.   node tests/test-jeux-naval-cables.js */
const assert = require('node:assert/strict');
global.window = {};
require('../assets/js/app-jeu-famille-logique.js'); require('../assets/js/app-jeu-naval.js'); require('../assets/js/app-jeu-cables.js');
const L = window.LCNDA_JEUX_LOGIQUE, N = window.LCNDA_JEUX_NAVAL, C = window.LCNDA_JEUX_CABLES;
let n = 0; const t = (name, fn) => { fn(); n++; console.log('✓', name); };
t('la flotte : les bonnes tailles, dans la grille, sans chevauchement ni contact', () => {
    for (const [size, fleet] of [[6, 'petite'], [10, 'classique'], [10, 'grande'], [15, 'grande']]) for (let k = 0; k < 20; k++) {
        const ships = N.placeFleet(size, size, N.FLEETS[fleet], L.rng(`${size}${fleet}${k}`)), cells = ships.flatMap(s => s.cells);
        assert.deepEqual(ships.map(s => s.size), N.FLEETS[fleet]); assert.ok(cells.every(([r, c]) => r >= 0 && c >= 0 && r < size && c < size));
        assert.equal(new Set(cells.map(x => x.join())).size, cells.length);
        if (size >= 10) ships.forEach((a, i) => ships.forEach((b, j) => { if (i < j) a.cells.forEach(([r, c]) => b.cells.forEach(([y, x]) => assert.ok(Math.max(Math.abs(r - y), Math.abs(c - x)) > 1, 'navires collés'))); }));
    }
    assert.throws(() => N.placeFleet(3, 3, [5], L.rng('x')), /ne tient pas/);
});
t('les tirs : à l’eau, touché, coulé, déjà joué ; fin de partie', () => {
    const b = {ships: [{size: 2, cells: [[0, 0], [0, 1]], sunk: false}], shots: N.grid(4, 4)};
    assert.equal(N.fire(b, 3, 3).res, 'eau'); assert.equal(N.fire(b, 3, 3).res, 'deja'); assert.equal(N.fire(b, 0, 0).res, 'touche'); assert.equal(N.allSunk(b), false);
    const r = N.fire(b, 0, 1); assert.equal(r.res, 'coule'); assert.equal(b.shots[0][0], 3); assert.equal(N.allSunk(b), true); assert.equal(N.fire(b, 9, 9).res, 'hors');
});
t('l’ordinateur malin coule une flotte en bien moins de tirs qu’au hasard, sans jamais tirer deux fois au même endroit', () => {
    const avg = lvl => { let tot = 0; for (let k = 0; k < 15; k++) { const b = {ships: N.placeFleet(10, 10, N.FLEETS.classique, L.rng('g' + k)), shots: N.grid(10, 10)}, R = L.rng('a' + k); let s = 0;
        while (!N.allSunk(b)) { const m = N.aiShot(b.shots, lvl, R); assert.equal(b.shots[m[0]][m[1]], 0); N.fire(b, ...m); s++; assert.ok(s <= 100); } tot += s; } return tot / 15; };
    const simple = avg('simple'), malin = avg('moyen'); assert.ok(malin < simple - 15, `${malin} contre ${simple}`);
});
t('les câbles : chaque réseau est un arbre couvrant soluble, avec ou sans bords qui se rejoignent ; le mélange le défait', () => {
    for (const wrap of [false, true]) for (const [r, c] of [[4, 4], [7, 7], [5, 9], [15, 15]]) for (let k = 0; k < 15; k++) {
        const g = C.generate(r, c, wrap, L.rng(`${r}${c}${wrap}${k}`)); assert.ok(C.solved(g.sol, g.server, wrap));
        const links = g.sol.flat().reduce((s, m) => s + C.bits(m), 0) / 2; assert.equal(links, r * c - 1, 'un arbre : n − 1 liaisons');
        assert.ok(g.sol.flat().every(m => m > 0 && C.bits(m) <= 4));
    }
    let crossed = 0; for (let k = 0; k < 10; k++) { const g = C.generate(7, 7, true, L.rng('w' + k)); for (let i = 0; i < 7; i++) { if (g.sol[0][i] & 1) crossed++; if (g.sol[i][0] & 8) crossed++; } }
    assert.ok(crossed > 0, 'en mode « bords qui se rejoignent », des câbles passent d’un bord à l’autre');
    const g = C.generate(4, 4, false, L.rng('nw')); for (let i = 0; i < 4; i++) { assert.equal(g.sol[0][i] & 1, 0); assert.equal(g.sol[i][0] & 8, 0); }
});
t('les câbles : tourner, compter les bouts dans le vide', () => {
    assert.equal(C.rotCW(1), 2); assert.equal(C.rotCW(8), 1); assert.equal(C.rotCCW(1), 8); assert.equal(C.rotCCW(C.rotCW(13)), 13);
    const tiles = [[2, 8]]; assert.ok(C.solved(tiles, [0, 0], false)); tiles[0][1] = C.rotCW(tiles[0][1]); const l = C.lit(tiles, [0, 0], false); assert.equal(l.all, false); assert.equal(l.loose, 2);
    assert.ok(C.solved([[8 | 2, 8 | 2]], [0, 0], true), 'en boucle par les bords'); assert.ok(!C.solved([[8 | 2, 8 | 2]], [0, 0], false));
});
console.log(`✓ bataille navale et câbles : ${n} vérifications`);
