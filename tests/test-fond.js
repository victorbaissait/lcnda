'use strict';
/** 🧩 Fond des pages (assets/js/app-fond.js) : les réglages nettoyés, les fonds, les priorités.   node tests/test-fond.js */
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const store = {};
global.window = {}; global.localStorage = {getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; }};
require('../assets/js/app-fond.js');
const F = window.LCNDA_FOND;
let n = 0; const t = (name, fn) => { fn(); n++; console.log('✓', name); };
const read = s => fs.readFileSync(path.join(__dirname, '..', s), 'utf8');
t('par défaut : petits carreaux, moyens, intensité 4, bleu pâle, toutes les pages (= le fond d’avant)', () => {
    assert.deepEqual(F.read({}), {kind: 'carreaux', size: 'm', int: 4, color: 'avant', off: [], blur: 10});
});
t('les anciens réglages : « grid: off » = Uni, et passe devant', () => {
    assert.equal(F.read({grid: 'off'}).kind, 'uni'); assert.equal(F.read({grid: 'off', bgKind: 'points'}).kind, 'uni'); assert.equal(F.read({grid: 'on', bgKind: 'points'}).kind, 'points');
});
t('valeurs inconnues ou piégées : remises au départ (elles vont dans des styles)', () => {
    const r = F.read({bgKind: 'x;}', bgSize: 'xxl', bgInt: '99', bgColor: 'red;background:url(x)', bgWhere: 'dash <img> fiche', bgBlur: '-3'});
    assert.deepEqual(r, {kind: 'carreaux', size: 'm', int: 4, color: 'avant', off: ['dash', 'fiche'], blur: 10});
    assert.equal(F.read({bgColor: '#12ab34'}).color, '#12ab34');
});
t('chaque fond donne une image (sauf uni) ; en sombre le motif devient clair ; couleur principale et traits du thème suivis', () => {
    for (const [k] of F.KINDS) { const b = F.bgOf(F.read({bgKind: k}), {dark: false, blue: '#0066cc'}, k, true); if (k === 'uni') assert.equal(b.img, 'none'); else assert.notEqual(b.img, 'none', k); }
    assert.match(F.bgOf(F.read({bgKind: 'points'}), {dark: true}).img, /255,255,255/);
    assert.match(F.bgOf(F.read({bgKind: 'points', bgColor: 'principale'}), {blue: '#c0392b'}).img, /192,57,43/);
    assert.match(F.bgOf(F.read({bgKind: 'points', bgColor: 'theme'}), {line: '#aa2878'}).img, /170,40,120/);
});
t('la photo reste sur cet ordinateur : pas dans la base, pas dans le défaut du site', () => {
    const app = read('assets/js/app.js');
    assert.match(app, /LOCAL_ONLY=new Set\(\[[^\]]*'genealogie-bg-photo'/);
    assert.doesNotMatch(app.match(/const SITE_DEFAULT_KEYS = \[([\s\S]*?)\];/)[1], /genealogie-bg-photo/);
});
t('priorités : Contraste élevé et « Une chose à la fois » mettent un fond uni par-dessus ; les pages décochées sont unies ; jamais imprimé', () => {
    assert.match(read('assets/css/access.css'), /html\.a11y-contrast \.workspace \{ background-image: none !important/);
    assert.match(read('assets/css/access.css'), /html\.a11y-simple \.workspace \{ background-image: none !important/);
    const css = read('assets/css/app.css');
    assert.match(css, /:root\[data-lc-bgoff~="dash"\]\[data-lcnda-page="dashboard"\] \.workspace/);
    assert.match(css, /@media print \{ \.workspace \{ background-image: none !important; \} \}/);
    assert.match(read('assets/js/app.js'), /setAttribute\('data-lcnda-page',module\)/);
});
console.log(`✓ fond des pages : ${n} vérifications`);
