'use strict';
/**
 * Test de la grande bibliothèque de formes des tableaux :   node tests/test-shapes-lib.js
 * assets/data/shapes-lib.json (chargé à la demande par assets/js/heritage-board-shapelib.js) : au moins 2 000 formes,
 * clés uniques qui ne recouvrent aucune forme déjà là (les tableaux déjà faits s'affichent pareil), tracés sûrs,
 * noms français, alphabet complet ; recherche sans accents ; tracé ramené dans la boîte 100 × 100.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(root, 'assets/data/shapes-lib.json'), 'utf8'));
assert.ok(Array.isArray(data.shapes) && data.shapes.length >= 2000, `au moins 2000 formes (${data.shapes.length})`);
assert.ok(fs.existsSync(path.join(root, 'assets/data/shapes-lib-LICENCES.txt')), 'licences à côté des données');

// un petit navigateur : les scripts des tableaux tels quels
const listeners = {};
const store = new Map();
const ctx = {console, setTimeout, clearTimeout, Promise, JSON, Math, Object, Array, String, Number, Set, Map, WeakMap, RegExp, Error, Date,
    localStorage: {getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k)},
    addEventListener: (t, f) => { (listeners[t] ||= []).push(f); }, CustomEvent: class { constructor(t, o) { this.type = t; this.detail = o?.detail; } },
    document: {dispatchEvent: () => true, querySelector: () => null, addEventListener: () => {}},
    fetch: async url => { assert.match(url, /^assets\/data\/shapes-lib\.json\?v=\d+$/); return {ok: true, json: async () => JSON.parse(JSON.stringify(data))}; }};
ctx.window = ctx; ctx.LCNDA_APP = {escapeHtml: s => String(s), toast: () => {}};
vm.createContext(ctx);
for (const f of ['heritage-board-shapes.js', 'heritage-board-kit.js', 'heritage-board-shapelib.js']) vm.runInContext(fs.readFileSync(path.join(root, 'assets/js', f), 'utf8'), ctx, {filename: f});
const K = ctx.LCNDA_EXT.boardKit;
assert.ok(K && K.loadLibrary && K.searchShapes && K.shapeD100 && K.openShapeLibrary, 'API de la bibliothèque');
const before = new Map(K.SHAPES.map(s => [s.k, JSON.stringify(s)]));
assert.equal(K.libraryLoaded, false, 'rien de chargé au démarrage');
assert.ok(K.CATS.at(-1)[0] === 'mine', '« Mes formes » reste la dernière catégorie');

const PATH_OK = /^[MLHVCSQTAZmlhvcsqtazEe0-9.,\s+-]+$/;
const keys = new Set();
const cats = new Set(K.CATS.map(c => c[0]));
for (const [k, n, c, d, eo, tags, box] of data.shapes) {
    assert.match(k, /^[a-z0-9_]{1,60}$/, 'clé ' + k);
    assert.ok(!keys.has(k), 'clé en double ' + k); keys.add(k);
    assert.ok(!before.has(k), 'clé déjà prise par une forme existante : ' + k);
    assert.ok(typeof n === 'string' && n.length > 0 && n.length <= 80 && !/<|>/.test(n), 'nom ' + k);
    assert.ok(cats.has(c), 'catégorie connue ' + c);
    assert.ok(PATH_OK.test(d), 'tracé sûr ' + k);
    assert.ok([0, 1].includes(eo) && typeof tags === 'string' && [24, 100, 256].includes(box), 'champs ' + k);
}
// l'alphabet entier, les chiffres, les accents
for (const L of 'CDEFGHIJKLMNOPQRSTUVWXYZ') for (const v of ['', '_circle', '_circle_outline', '_box', '_box_outline']) assert.ok(keys.has(`mdi_alpha_${L.toLowerCase()}${v}`), 'lettre ' + L + v);
for (const v of ['', '_box', '_box_outline']) { assert.ok(keys.has('mdi_alpha_a' + v)); assert.ok(keys.has('mdi_alpha_b' + v)); }
for (const l of 'abcdefghijklmnopqrstuvwxyz') for (const v of ['', '_circle', '_circle_outline', '_box', '_box_outline']) assert.ok(keys.has(`lt_${l}${v}`), 'minuscule ' + l + v);
for (let i = 0; i <= 9; i++) assert.ok(keys.has(`mdi_numeric_${i}_box`), 'chiffre ' + i);
for (const ch of 'ÉÈÀÇéèàçœ') assert.ok(keys.has(`lt_u${ch.codePointAt(0).toString(16)}_circle`), 'accent ' + ch);

(async () => {
    await K.loadLibrary();
    assert.equal(K.libraryLoaded, true);
    // les formes existantes n'ont pas bougé
    for (const [k, js] of before) assert.equal(JSON.stringify(K.SHAPE_MAP[k]), js, 'forme existante inchangée ' + k);
    assert.equal(K.SHAPES.length, before.size + data.shapes.length);
    assert.equal(K.shapeByKey('ph_tree').n, 'Arbre (trait fin)');
    assert.ok(K.shapesOf('letters').length > 600, 'catégorie Lettres et chiffres');
    // recherche C1 : sans accents, pluriels, mots dans le désordre
    const names = q => K.searchShapes(q).map(s => s.n);
    assert.ok(names('eglise').includes('Église (trait fin)'), 'sans accents');
    assert.ok(names('ÉCU parti').some(n => /^Écu parti/.test(n)), 'majuscules et accents');
    assert.ok(names('drapeaux').length > 20, 'pluriel');
    assert.equal(K.searchShapes('É')[0].k.startsWith('lt_uc9'), true, 'une lettre tapée : ses formes d’abord');
    assert.ok(names('naissance').some(n => /naissance/i.test(n)), 'mots-clés français');
    assert.equal(K.searchShapes('zzzqqq').length, 0);
    assert.ok(K.searchShapes('', {cat: 'flags'}).every(s => s.c === 'flags'));
    // tracé ramené à 100 × 100
    const d = K.shapeD100('ph_tree'); assert.ok(PATH_OK.test(d));
    const nums = d.match(/-?\d+(\.\d+)?/g).map(Number); assert.ok(Math.max(...nums) <= 100.5 && Math.min(...nums) >= -0.5, 'dans la boîte 100');
    assert.equal(K.shapeD100('rect'), K.shapeByKey('rect').d);
    // données forgées : ignorées sans casser la page
    const bad = {shapes: [['x<script>', 'a', 'genea', 'M0 0Z', 0, '', 24], ['bad_path', 'a', 'genea', 'M0 0Z"/><script>', 0, '', 24], ['bad_cat', 'a', 'nope', 'M0 0Z', 0, '', 24], 'nimporte', null]};
    const ctx2 = {...ctx, LCNDA_EXT: {}, fetch: async () => ({ok: true, json: async () => bad})}; ctx2.window = ctx2; vm.createContext(ctx2);
    for (const f of ['heritage-board-kit.js', 'heritage-board-shapelib.js']) vm.runInContext(fs.readFileSync(path.join(root, 'assets/js', f), 'utf8'), ctx2);
    const n0 = ctx2.LCNDA_EXT.boardKit.SHAPES.length; await ctx2.LCNDA_EXT.boardKit.loadLibrary(); assert.equal(ctx2.LCNDA_EXT.boardKit.SHAPES.length, n0, 'rien de forgé n’entre');
    console.log(`OK — ${data.shapes.length} formes en plus (${K.SHAPES.length} en tout), recherche et tracés vérifiés.`);
})().catch(e => { console.error(e); process.exit(1); });
