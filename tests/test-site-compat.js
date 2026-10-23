'use strict';
/**
 * 🌐 Mon site web — « Ça marche partout ? » (assets/js/heritage-site-web-compat.js) :   node tests/test-site-compat.js
 *  chargé dans un vm avec un faux window : la base (≈ 80 fonctions et plus, versions bien formées), détections CSS / HTML / JS
 *  (y compris le CSS des <style> et style="…", le JS des <script>), rien dans les commentaires ni les chaînes, numéro de ligne
 *  de la première occurrence, un seul résultat par fonction et par fichier, tri par gravité, navigateurs visés modifiables,
 *  ua(), chrome(), panelHtml() (data-compat-goto, échappement, message rassurant).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; }; const plain = v => v === undefined ? v : JSON.parse(JSON.stringify(v)); // objets venus du vm → objets de ce contexte
const eq = (a, b, m) => { assert.deepStrictEqual(plain(a), b, m); n++; };
const src = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'heritage-site-web-compat.js'), 'utf8');
const win = {}; vm.runInNewContext(src, {window: win});
const C = win.LCNDA_EXT && win.LCNDA_EXT.siteCompat;
ok(C && typeof C.scan === 'function', 'window.LCNDA_EXT.siteCompat posé');

/* la base */
eq(C.BROWSERS.map(b => b.id).sort(), ['chrome', 'edge', 'firefox', 'ios', 'safari', 'samsung'], 'six navigateurs');
ok(C.BROWSERS.every(b => b.name && b.icon && b.market > 0), 'nom, icône, part de marché');
ok(C.FEATURES.length >= 80, `au moins 80 fonctions (${C.FEATURES.length})`);
eq(new Set(C.FEATURES.map(f => f.id)).size, C.FEATURES.length, 'identifiants uniques');
for (const f of C.FEATURES) {
    ok(['css', 'html', 'js'].includes(f.type) && f.label && f.advice && f.test, 'fiche complète : ' + f.id);
    ok(C.BROWSERS.every(b => f.since[b.id] === null || (typeof f.since[b.id] === 'number' && f.since[b.id] > 0)), 'versions : ' + f.id);
}
const fx = id => C.FEATURES.find(f => f.id === id);
eq(fx('css-has').since, {chrome: 105, edge: 105, firefox: 121, safari: 15.4, ios: 15.4, samsung: 20}, ':has() : versions (Edge, iOS, Samsung déduits)');
eq(fx('js-idle-callback').since.safari, null, 'requestIdleCallback : jamais sur Safari');
['css-has', 'css-container', 'css-nesting', 'css-subgrid', 'css-color-mix', 'css-oklch', 'css-text-balance', 'css-text-pretty', 'css-layer', 'css-scope', 'css-property', 'css-anchor',
 'js-view-transition', 'css-scroll-timeline', 'css-viewport-units', 'css-focus-visible', 'css-backdrop-filter', 'css-flex-gap', 'css-aspect-ratio', 'css-inset', 'css-accent-color',
 'css-field-sizing', 'html-popover', 'html-dialog', 'html-details-name', 'html-lazy-img', 'html-inert', 'js-structured-clone', 'js-array-at', 'js-find-last', 'js-change-by-copy',
 'js-has-own', 'js-with-resolvers', 'js-tla', 'html-importmap', 'js-segmenter', 'js-abort-timeout', 'js-navigation', 'css-starting-style', 'css-light-dark', 'css-user-invalid', 'css-text-box']
    .forEach(id => ok(fx(id), 'dans la base : ' + id));

/* détections */
const ids = r => r.map(x => x.id);
const css = `/* :has(  @container  color-mix(  — tout ça est en commentaire */
.carte { color: red; }
.carte:has(img) { padding: 1rem; }
.zone { container-type: inline-size; }
.titre { text-wrap: balance; color: oklch(70% 0.1 200); }
.verre { backdrop-filter: blur(4px); }
.menu { display: flex; gap: 1rem; inset: 0; }
.parent { color: blue; & .enfant { color: red; } }
.b:has(p) {}
.x::before { content: ":has( @layer field-sizing: content" }
textarea { field-sizing: content; height: 100dvh; }`;
const r1 = C.scan({css: [{name: 'style.css', text: css}]});
const has = r1.find(x => x.id === 'css-has');
eq([has.file, has.line], ['style.css', 3], ':has() : première occurrence ligne 3 (pas le commentaire de la ligne 1)');
eq(r1.filter(x => x.id === 'css-has').length, 1, 'un seul résultat par fonction et par fichier');
['css-container', 'css-text-balance', 'css-oklch', 'css-backdrop-filter', 'css-flex-gap', 'css-inset', 'css-nesting', 'css-field-sizing', 'css-viewport-units']
    .forEach(id => ok(ids(r1).includes(id), 'détecté : ' + id));
eq(r1.find(x => x.id === 'css-nesting').line, 8, 'imbrication : ligne 8');
ok(!ids(r1).includes('css-color-mix') && !ids(r1).includes('css-layer'), 'rien dans les commentaires ni les chaînes');
ok(!ids(C.scan({css: [{name: 'a.css', text: '@media (min-width: 600px) { .a { color: red } }\n@keyframes k { from { opacity: 0 } }'}]})).includes('css-nesting'), '@media et @keyframes ne sont pas de l\'imbrication');
ok(!ids(C.scan({css: [{name: 'a.css', text: '.v { -webkit-backdrop-filter: blur(2px); backdrop-filter: blur(2px); }'}]})).includes('css-backdrop-filter'), 'backdrop-filter avec -webkit- : rien à dire');
ok(ids(C.scan({css: [{name: 'a.css', text: 'p { user-select: none; }'}]})).includes('css-user-select'), 'user-select sans -webkit-');

const js = `// structuredClone( dans un commentaire
const s = "Promise.withResolvers( dans une chaîne";
/* Object.hasOwn( */
const copie = structuredClone(data);
const dernier = liste.at(-1);
const tri = liste.toSorted();
const ok = Object.hasOwn(o, 'x');
const { promise, resolve } = Promise.withResolvers();
navigation.addEventListener('navigate', e => {});
const ctl = AbortSignal.timeout(5000);
requestIdleCallback(() => {});
const seg = new Intl.Segmenter('fr');`;
const r2 = C.scan({js: [{name: 'script.js', text: js}]});
['js-structured-clone', 'js-array-at', 'js-change-by-copy', 'js-has-own', 'js-with-resolvers', 'js-navigation', 'js-abort-timeout', 'js-idle-callback', 'js-segmenter']
    .forEach(id => ok(ids(r2).includes(id), 'détecté : ' + id));
eq(r2.find(x => x.id === 'js-structured-clone').line, 4, 'structuredClone : ligne 4, pas le commentaire');
eq(r2.find(x => x.id === 'js-with-resolvers').line, 8, 'withResolvers : ligne 8, pas la chaîne');
eq(r2.find(x => x.id === 'js-has-own').line, 7, 'hasOwn : ligne 7, pas le commentaire /* */');
ok(ids(C.scan({js: [{name: 'm.js', text: 'const data = await fetch("/x");'}]})).includes('js-tla'), 'await au premier niveau');
ok(!ids(C.scan({js: [{name: 'm.js', text: 'async function f() {\n  const d = await fetch("/x");\n}'}]})).includes('js-tla'), 'await dans une fonction : pas au premier niveau');
ok(!ids(C.scan({js: [{name: 'm.js', text: 'const a = b ? .5 : 1;'}]})).includes('js-optional-chaining'), 'ternaire ? .5 : pas du chaînage optionnel');

const html = `<!doctype html>
<!-- <dialog> popover inert : commentaire -->
<p>Un texte qui parle de popover et de inert sans en être.</p>
<button popovertarget="m">Menu</button>
<div id="m" popover>…</div>
<details name="faq"><summary>Q</summary></details>
<img src="a.avif" loading="lazy" alt="">
<script type="importmap">{"imports": {}}</script>
<style>.a:has(b) { color: light-dark(#000, #fff); }</style>
<script>const c = structuredClone(x);</script>
<p style="aspect-ratio: 16/9">x</p>
<?php echo '<dialog>'; ?>`;
const r3 = C.scan({html: [{name: 'index.html', text: html}]});
['html-popover', 'html-details-name', 'html-lazy-img', 'html-avif', 'html-importmap', 'css-has', 'css-light-dark', 'js-structured-clone', 'css-aspect-ratio']
    .forEach(id => ok(ids(r3).includes(id), 'page : détecté ' + id));
eq(r3.find(x => x.id === 'html-popover').line, 4, 'popover : ligne 4 (pas le commentaire ni le texte)');
eq(r3.find(x => x.id === 'css-has').line, 9, 'CSS d\'un <style> : ligne 9');
eq(r3.find(x => x.id === 'js-structured-clone').line, 10, 'JS d\'un <script> : ligne 10');
ok(!ids(r3).includes('html-dialog') && !ids(r3).includes('html-inert'), 'rien dans les commentaires, le texte ni le PHP');
ok(!ids(C.scan({html: [{name: 'p.html', text: '<script type="application/json">{"x": "structuredClone("}</script>'}]})).includes('js-structured-clone'), 'JSON : pas lu comme du JS');

/* navigateurs et tri */
const pb = r1.find(x => x.id === 'css-field-sizing');
eq(pb.browsers.map(b => b.id).sort(), ['firefox', 'ios', 'safari'], 'field-sizing : pas sur Firefox ni Safari');
ok(pb.browsers.every(b => b.ok === false && b.name && 'since' in b), 'navigateur : {id, name, since, ok:false}');
ok(r1.find(x => x.id === 'css-has').browsers.length === 0, ':has() : bon pour les navigateurs visés par défaut');
const vieux = C.scan({css: [{name: 'style.css', text: css}]}, {targets: {firefox: 115}});
eq(vieux.find(x => x.id === 'css-has').browsers.map(b => [b.id, b.since]), [['firefox', 121]], 'Firefox 115 visé : :has() signalé (avant 121)');
const sansFx = C.scan({css: [{name: 'style.css', text: css}]}, {targets: {firefox: false}});
ok(sansFx.every(x => x.browsers.every(b => b.id !== 'firefox')), 'Firefox retiré des navigateurs visés');
const all = C.scan({css: [{name: 'style.css', text: css}], js: [{name: 'script.js', text: js}], html: [{name: 'index.html', text: html}]});
for (let i = 1; i < all.length; i++) ok(all[i - 1].score >= all[i].score, 'tri par gravité ' + i);
ok(all[0].browsers.length > 0 && all[all.length - 1].browsers.length === 0, 'les problèmes d\'abord, ce qui marche à la fin');
ok(all[0].browsers.some(b => b.id === 'ios' || b.id === 'safari'), 'le plus grave touche Safari');
eq(C.scan({}).length, 0, 'rien à lire : rien');

/* ua, chrome */
ok(/Chrome\/\d+/.test(C.ua('chrome')) && !/Edg\//.test(C.ua('chrome')), 'ua Chrome');
ok(/Edg\/\d+/.test(C.ua('edge')), 'ua Edge');
ok(/Firefox\/\d+/.test(C.ua('firefox')) && /Gecko\//.test(C.ua('firefox')), 'ua Firefox');
ok(/Macintosh.*Version\/[\d.]+ Safari/.test(C.ua('safari')), 'ua Safari');
ok(/iPhone.*Mobile\/\w+ Safari/.test(C.ua('ios')), 'ua Safari iOS');
ok(/SamsungBrowser\/\d+/.test(C.ua('samsung')), 'ua Samsung');
eq(C.ua('netscape'), '', 'navigateur inconnu : rien');
for (const b of C.BROWSERS) { const h = C.chrome(b.id, {url: 'x.fr/<b>'}); ok(h.includes(`data-browser="${b.id}"`) && !/<img|url\(/.test(h) && h.includes('x.fr/&lt;b&gt;') && !h.includes('<b>'), 'barre ' + b.id + ' (sans image, échappée)'); }
ok(C.chrome('safari').includes('#ff5f57'), 'Safari : les trois pastilles');

/* panelHtml */
const p = C.panelHtml(all);
ok(p.includes('data-compat-goto="style.css:11"'), 'data-compat-goto fichier:ligne');
ok(/⚠️ <b>[^<]+<\/b> — pas sur /.test(p), 'ligne ⚠️ … — pas sur …');
ok(p.includes('ligne 11 de style.css'), 'la ligne et le fichier en clair');
ok(p.includes('Navigateurs visés'), 'navigateurs visés rappelés');
const pv = C.panelHtml(vieux, {targets: {firefox: 115}});
ok(pv.includes('pas sur Firefox avant 121'), '« pas sur Firefox avant 121 »');
const vide = C.panelHtml([]);
ok(/Rien à signaler/.test(vide) && !vide.includes('data-compat-goto'), 'message rassurant quand il n\'y a rien');
const tousBons = C.panelHtml(C.scan({css: [{name: 's.css', text: '.a { aspect-ratio: 1; }'}]}));
ok(/Rien à signaler/.test(tousBons) && tousBons.includes('data-compat-goto="s.css:1"'), 'que des fonctions bien prises en charge : rassurant, avec la liste repliée');
ok(!C.panelHtml([{id: 'x', label: '<img onerror=1>', type: 'css', file: 'a"b.css', line: 1, browsers: [{id: 'firefox', name: 'Firefox', since: null, ok: false}], advice: '<script>'}]).match(/<img|<script|a"b/), 'panneau échappé');

console.log(`✓ compatibilité du site : ${n} vérifications`);
