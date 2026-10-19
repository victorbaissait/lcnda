'use strict';
/**
 * Test du catalogue « Mobilier » du plan de maison (assets/js/heritage-house-more.js), sans navigateur :
 * clés uniques, vraies dimensions, nom et mots-clés, catégorie connue, dessin vu de dessus pour chaque forme,
 * et rien d'injecté dans le dessin (le texte d'un objet n'y entre pas).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const LIB = [['commode', 'Commode', 'Chambre', 100, 50, 85, '#8a5a32', 'drawers', 'drawers', null]];
const ext = {houseLib: {LIB, libOf: k => LIB.find(l => l[0] === k)}};
const sandbox = {window: {LCNDA_EXT: ext}, document: {addEventListener() {}}, setTimeout: () => 0, console};
vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/js/heritage-house-more.js'), 'utf8'), sandbox);
const libSrc = fs.readFileSync(path.join(root, 'assets/js/heritage-house-lib.js'), 'utf8');
const CATS = eval(libSrc.match(/const CATS = (\[[^\]]+\]);/)[1]); // eslint-disable-line no-eval

let failed = 0;
const t = (name, fn) => { try { fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e.message); } };
const rows = Object.entries(ext.houseMore.ROWS).flatMap(([cat, r]) => r.map(l => [cat, ...l]));

t('au moins 150 objets en plus, entrés dans le catalogue une seule fois', () => {
    assert.ok(rows.length >= 150, `${rows.length} objets`);
    const keys = rows.map(r => r[1]); assert.equal(new Set(keys).size, keys.length, 'clés en double');
    ext.houseMore.addAll(); ext.houseMore.addAll();
    assert.equal(LIB.length, 1 + rows.length);
});
t('chaque objet : catégorie connue, nom français, dimensions réalistes (cm), couleur, mots-clés', () => {
    for (const [cat, k, n, w, d, h, c, s, o] of rows) {
        assert.ok(CATS.includes(cat), `${k} : catégorie ${cat}`);
        assert.ok(n && n.length > 3, k); assert.match(c, /^#[0-9a-f]{6}$/i, k);
        for (const v of [w, d, h]) assert.ok(Number.isFinite(v) && v >= 1 && v <= 1000, `${k} : ${w}×${d}×${h}`);
        assert.ok(typeof s === 'string' && s, k); assert.ok(o?.kw && o.kw.length > 2, `${k} : mots-clés`);
        if (o.elev) assert.ok(o.elev > 0 && o.elev < 260, `${k} : hauteur au sol`);
    }
});
t('les catégories de pièce demandées existent', () => {
    for (const c of ['Séjour', 'Cuisine', 'Salle à manger', 'Chambre', 'Salle d’eau', 'Bureau', 'Entrée', 'Buanderie', 'Jardin, extérieur', 'Garage', 'Luminaires', 'Décoration', 'Électroménager', 'Musique']) assert.ok(CATS.includes(c), c);
    assert.ok(rows.filter(r => r[8]?.old).length >= 30, 'objets d’autrefois');
});
t('chaque forme « x… » a son dessin vu de dessus, sans texte injecté', () => {
    const S = 'stroke="#000"', R = (x, y, w, h, f = '#000', ex = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${f}" ${S} ${ex}/>`;
    for (const [, k, , w, d, , c, s] of rows) {
        if (s[0] !== 'x') continue;
        const out = ext.houseSym2dX(s, {kind: k, w, d, color: c, color2: '<img onerror=x>'}, {R, S, c, w, d, x0: -w / 2, y0: -d / 2});
        assert.equal(typeof out, 'string', `${k} (${s}) sans dessin`); assert.ok(out.length > 20, k);
        assert.doesNotMatch(out, /NaN|undefined|onerror|<img/, `${k} (${s})`);
    }
});
if (failed) { console.error(`${failed} échec(s)`); process.exit(1); }
console.log('Catalogue du mobilier : OK');
