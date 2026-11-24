'use strict';
/**
 * Test des objets en plus du plan de maison (assets/js/heritage-house-objets.js), sans navigateur :
 * le catalogue grandit de plus de 2 500 objets (meubles de style + objets un par un), chacun une seule fois, avec un modèle qui existe,
 * de vraies dimensions, des mots-clés, son dessin vu de dessus (sans NaN) ; un nom de style se traduit en deux morceaux
 * (LCNDA_I18N.compose) ; le choix « 🎨 Style » du catalogue (tous, sans, un seul style).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
let failed = 0;
const t = (name, fn) => { try { fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e.message); } };
const store = {};
const doc = {addEventListener() {}, querySelector() { return null; }, getElementById() { return null; }, createElement() { return {getContext() { return null; }, style: {}}; }, head: {appendChild() {}}, body: {appendChild() {}}};
const win = {setTimeout: () => 0, clearTimeout() {}, requestAnimationFrame: () => 0, LCNDA_EXT: {}, document: doc, addEventListener() {}, localStorage: {getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }}};
win.LCNDA_APP = {api: async () => ({objects: []}), plural: (n, a, b) => `${n} ${n > 1 ? b : a}`};
win.window = win; const ctx = vm.createContext(win); ctx.globalThis = ctx;
const files = ['heritage-house-vides', 'heritage-house-plus', 'heritage-house', 'heritage-house-lib', 'heritage-house-more', 'heritage-house-metiers', 'heritage-house-cultes', 'heritage-house-equip'];
for (const f of files) vm.runInContext(fs.readFileSync(path.join(root, 'assets/js', `${f}.js`), 'utf8'), ctx, {filename: f});
const E = win.LCNDA_EXT, LIB = E.houseLib.LIB;
try { E.houseLibUI.pane({cat: 'Chambre', q: '', mine: [], sym2d: () => ''}); } catch (_) {} // extend() : tout le catalogue d'avant
const before = LIB.length;
// la traduction en deux morceaux : un petit LCNDA_I18N chargé pour de vrai (app-i18n.js), en anglais
win.LCNDA_I18N = require('../assets/js/app-i18n.js');
vm.runInContext(fs.readFileSync(path.join(root, 'assets/js/heritage-house-objets.js'), 'utf8'), ctx, {filename: 'objets'});
const O = E.houseObjets;
O.addAll(); O.addAll();
const added = LIB.slice(before), CATS = E.houseLibUI.CATS;

t('plus de 2 500 objets en plus : le catalogue fait au moins 4 fois celui d’avant, chaque objet une seule fois', () => {
    assert.ok(added.length >= 2500, `${added.length} objets ajoutés`);
    assert.equal(O.added(), added.length);
    const keys = LIB.map(l => l[0]); assert.equal(new Set(keys).size, keys.length, 'clés en double');
    const old = new Set(LIB.slice(0, before).map(l => l[1].toLowerCase())), names = added.map(l => l[1].toLowerCase());
    assert.equal(new Set(names).size, names.length, 'noms en double'); const again = names.filter(n => old.has(n)); assert.equal(again.length, 0, 'déjà dans le catalogue : ' + again.slice(0, 10).join(' | '));
    assert.ok(LIB.length >= 4 * before, `catalogue : ${LIB.length} (avant : ${before})`);
});
t('chaque objet : catégorie connue, vraies dimensions, couleur, mots-clés, dessin et forme 3D de son modèle', () => {
    for (const l of added) {
        const [k, n, cat, w, d, h, c, s2, , o] = l;
        assert.ok(/^o_[a-z0-9_]+$/.test(k), k); assert.ok(CATS.includes(cat), `${k} : ${cat}`); assert.ok(n.length > 2, k);
        for (const v of [w, d, h]) assert.ok(Number.isFinite(v) && v >= 1 && v <= 2500, `${k} : ${w}×${d}×${h}`);
        assert.match(c, /^#[0-9a-f]{6}$/i, k); assert.ok(typeof s2 === 'string' && s2, `${k} : dessin`); assert.ok(o.kw.length > 2, `${k} : mots-clés`);
        assert.ok(!o.custom && !o.id, `${k} : rien de copié d’un objet à moi`);
    }
});
t('le dessin vu de dessus de chaque objet (le vrai sym2d du plan) : du SVG, sans NaN ni undefined', () => {
    const sym2d = E.houseInternals.sym2d;
    for (const l of added) {
        const out = sym2d({kind: l[0], w: l[3], d: l[4], color: l[6]});
        assert.equal(typeof out, 'string', l[0]); assert.ok(out.length > 20, l[0]); assert.doesNotMatch(out, /NaN|undefined/, `${l[0]} (${l[7]})`);
    }
});
t('meubles de style : époques, d’ailleurs, régions, modernes ; anciens marqués « ancien » ; le style est noté', () => {
    const st = added.filter(l => l[9].style);
    assert.ok(st.length >= 2000, `${st.length} meubles de style`);
    const armoire = LIB.find(l => l[1] === 'Armoire Louis XV'); assert.ok(armoire, 'Armoire Louis XV'); assert.equal(armoire[9].style, 'Louis XV'); assert.equal(armoire[9].old, 1);
    const scandi = LIB.find(l => l[1] === 'Commode scandinave'); assert.ok(scandi && !scandi[9].old, 'Commode scandinave, moderne');
    assert.ok(LIB.find(l => l[1] === 'Vaisselier breton' || l[1] === 'Buffet breton'), 'un meuble breton');
    assert.ok(!LIB.some(l => l[1] === 'Meuble TV Louis XV'), 'pas de meuble TV Louis XV');
});
t('objets un par un : jardin, ferme, cuisine, enfants, musique, garage… ; les anciens filtrables', () => {
    const one = added.filter(l => !l[9].style), by = c => one.filter(l => l[2] === c).length;
    assert.ok(one.length >= 500, `${one.length}`);
    for (const c of ['Jardin, extérieur', 'Ferme, animaux', 'Cuisine', 'Enfants', 'Musique', 'Garage', 'Décoration', 'Luminaires']) assert.ok(by(c) >= 15, `${c} : ${by(c)}`);
    assert.ok(LIB.find(l => l[1] === 'Vache normande'), 'Vache normande');
    assert.ok(one.filter(l => l[9].old).length >= 60, 'objets d’autrefois');
});
t('le nom d’un meuble de style se traduit en deux morceaux (« Armoire » + « Louis XV »), le français ne change pas', () => {
    const I = win.LCNDA_I18N; assert.ok(I?.compose, 'LCNDA_I18N.compose');
    assert.equal(I.t('Armoire Louis XV'), 'Armoire Louis XV');
    I.provide('en', {'Armoire': 'Wardrobe', 'Louis XV': 'Louis XV', 'scandinave': 'Scandinavian'}); I.setLang('en');
    assert.equal(I.t('Armoire Louis XV'), 'Wardrobe · Louis XV');
    assert.equal(I.t('Armoire scandinave'), 'Wardrobe · Scandinavian');
    assert.equal(I.t('Un texte inconnu'), 'Un texte inconnu');
    I.setLang('fr');
});
t('🎨 le choix du style dans le catalogue : tous (par défaut), sans les meubles de style, un seul style', () => {
    const tiles = () => { const h = E.houseLibUI.pane({cat: 'Chambre', q: '', mine: [], sym2d: () => '<rect/>'}); return (h.match(/data-hs-lib="/g) || []).length; };
    const all = tiles(); assert.match(E.houseLibUI.pane({cat: 'Chambre', q: '', mine: [], sym2d: () => ''}), /data-hs-style/);
    store['genealogie-house-style'] = 'none'; const none = tiles();
    store['genealogie-house-style'] = 'Louis XV'; const lxv = tiles();
    delete store['genealogie-house-style'];
    assert.ok(all > none && none > 20 && lxv > 3 && lxv < 20, `tous ${all}, sans ${none}, Louis XV ${lxv}`);
});
console.log(failed ? `${failed} essai(s) en échec` : 'Les objets en plus de la maison marchent.');
process.exit(failed ? 1 : 0);
