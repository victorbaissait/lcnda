'use strict';
/**
 * 🌐 Mon site web — l'éditeur de code complet (assets/js/heritage-site-web-code.js) :  node tests/test-site-code-outils.js
 *  1. sans écran : commenter / décommenter (HTML, CSS, JS), chercher (mot entier, majuscules, expression régulière), accolade jumelle,
 *     remettre en forme, vérification (balises non fermées, accolades, guillemets, image sans alt, id en double) ;
 *  2. navigateur : ⌘F (compte, suivant, remplacer, tout remplacer), ⌃G, ⌘/, ⇧⌥↓, ⌥↑, ⇧⌘K, Tab sur plusieurs lignes, ( et " fermés tout seuls,
 *     ⌘D, ⇧⌥F, la barre du bas (ligne, colonne, vérification), ⌨ raccourcis.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../assets/js/heritage-site-web-code.js');
let failed = 0, n = 0;
const t = async (name, fn) => { try { await fn(); n++; console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
(async () => {
    await t('commenter puis décommenter : HTML, CSS, JS (plusieurs lignes)', () => {
        let r = C.toggleComment('<p>a</p>\n<p>b</p>', 0, 3, 'html'); assert.equal(r.text, '<!-- <p>a</p> -->\n<p>b</p>'); assert.equal(C.toggleComment(r.text, 2, 2, 'html').text, '<p>a</p>\n<p>b</p>');
        r = C.toggleComment('a { color: red; }', 0, 0, 'css'); assert.equal(r.text, '/* a { color: red; } */'); assert.equal(C.toggleComment(r.text, 0, 0, 'css').text, 'a { color: red; }');
        r = C.toggleComment('  let a = 1;\n  let b = 2;', 0, 20, 'js'); assert.equal(r.text, '  // let a = 1;\n  // let b = 2;'); assert.equal(C.toggleComment(r.text, 0, r.text.length, 'js').text, '  let a = 1;\n  let b = 2;');
    });
    await t('chercher : majuscules, mot entier, expression régulière (fausse = null)', () => {
        const v = 'Carte carte cartes CARTE'; assert.equal(C.findAll(v, 'carte').length, 4); assert.equal(C.findAll(v, 'carte', {cs: true}).length, 2);
        assert.equal(C.findAll(v, 'carte', {word: true}).length, 3); assert.equal(C.findAll(v, 'cart(e|es)$', {regex: true}).length, 1); assert.equal(C.findAll(v, '(', {regex: true}), null); assert.deepEqual(C.findAll(v, ''), []);
        assert.equal(C.findAll('a.b a-b', 'a.b').length, 1, 'le point est un vrai point sans « .* »');
    });
    await t('accolade jumelle', () => { const v = 'a { b(c[1]) }'; assert.equal(C.matchBracket(v, 2), 12); assert.equal(C.matchBracket(v, 13), 2); assert.equal(C.matchBracket(v, 5), 10); assert.equal(C.matchBracket('abc', 1), -1); });
    await t('remettre en forme : HTML et CSS / JS', () => {
        assert.equal(C.formatCode('<ul>\n<li>a</li>\n<li>b</li>\n</ul>', 'html'), '<ul>\n  <li>a</li>\n  <li>b</li>\n</ul>');
        assert.equal(C.formatCode('a {\ncolor: red;\n}\n@media (x) {\nb {\nc: d;\n}\n}', 'css'), 'a {\n  color: red;\n}\n@media (x) {\n  b {\n    c: d;\n  }\n}');
        assert.equal(C.formatCode('if (a) {\nf("{");\n}', 'js'), 'if (a) {\n  f("{");\n}', 'une accolade dans une chaîne ne compte pas');
        assert.equal(C.formatCode('<img src="x">\n<p>\nok\n</p>', 'html'), '<img src="x">\n<p>\n  ok\n</p>', 'une balise vide n’ouvre rien');
    });
    await t('vérification : ce qui cloche, et rien quand tout va bien', () => {
        assert.deepEqual(C.lintCode('<div><p>ok</p></div>\n<img src="a.jpg" alt="x">', 'html'), []);
        const h = C.lintCode('<div>\n<section>\n</div>\n<img src="a.jpg">\n<b id="x"></b><i id="x"></i>', 'html').map(x => x.msg).join(' | ');
        assert.match(h, /<section> n’est pas fermée/); assert.match(h, /sans alt/); assert.match(h, /« x » est donné deux fois/);
        assert.match(C.lintCode('</span>', 'html')[0].msg, /pas ouverte/);
        assert.deepEqual(C.lintCode('a { color: red; }\n/* } */', 'css'), []);
        assert.match(C.lintCode('a { color: red;\n', 'css').map(x => x.msg).join(), /« \{ » n’est pas fermé/);
        assert.match(C.lintCode('f(1));\nconst s = "a', 'js').map(x => x.msg).join(), /en trop.*|guillemets/);
        assert.deepEqual(C.lintCode('const a = "}"; // )\nlet b = `x\ny`;', 'js'), [], 'chaînes, commentaires et gabarits sur plusieurs lignes ignorés');
    });
    /* ── 2. navigateur ── */
    let chromium = null; try { ({chromium} = require('playwright')); } catch (_) {}
    if (!chromium) { console.log('— navigateur : Playwright absent, partie sautée'); }
    else {
        const b = await chromium.launch(); const p = await b.newPage({viewport: {width: 1100, height: 700}}); const errs = []; p.on('pageerror', e => errs.push(e.message));
        await p.setContent(`<!doctype html><html><head><style>:root{--sw-code-bg:#fff;--sw-code-ink:#111;--sw-line:#ccc;--sw-bg:#fff;--sw-ink:#111;--sw-blue:#055dff;--sw-com:#888}${fs.readFileSync(path.join(__dirname, '../assets/css/site-web.css'), 'utf8')}</style></head><body><div id="h" style="position:relative;width:900px;height:500px"></div><script>${fs.readFileSync(path.join(__dirname, '../assets/js/heritage-site-web-code.js'), 'utf8')}</script></body></html>`);
        await p.evaluate(() => { window.ed = window.LCNDA_EXT.siteCode.create(document.getElementById('h'), {lang: 'html', value: '<ul>\n<li>Carte</li>\n<li>carte</li>\n</ul>'}); });
        const val = () => p.evaluate(() => window.ed.value), sel = (a, z = a) => p.evaluate(([a, z]) => { window.ed.ta.focus(); window.ed.ta.setSelectionRange(a, z); }, [a, z]);
        const M = process.platform === 'darwin' ? 'Meta' : 'Control';
        await t('⌘F : compte, suivant, remplacer, tout remplacer ; Échap ferme', async () => {
            await sel(0); await p.keyboard.press('Meta+f'); await p.waitForSelector('.swc-find:not([hidden])');
            await p.fill('.swc-q', 'carte'); assert.match(await p.textContent('.swc-count'), /1 sur 2/); assert.equal(await p.locator('.swc-hits i').count(), 2);
            await p.press('.swc-q', 'Enter'); assert.match(await p.textContent('.swc-count'), /2 sur 2/);
            await p.click('[data-swc-f="toggle"]'); await p.fill('.swc-r', 'Plan'); await p.click('[data-swc-f="all"]');
            assert.equal(await val(), '<ul>\n<li>Plan</li>\n<li>Plan</li>\n</ul>'); assert.match(await p.textContent('.swc-count'), /2 remplacés/);
            await p.press('.swc-q', 'Escape'); assert.equal(await p.locator('.swc-find[hidden]').count(), 1);
        });
        await t('⇧⌥F remet en forme, ⌘/ commente la ligne, ⇧⌥↓ duplique, ⌥↑ remonte, ⇧⌘K supprime', async () => {
            await sel(0); await p.keyboard.press('Shift+Alt+KeyF'); assert.equal(await val(), '<ul>\n  <li>Plan</li>\n  <li>Plan</li>\n</ul>');
            await sel(6); await p.keyboard.press('Meta+Slash'); assert.equal((await val()).split('\n')[1], '  <!-- <li>Plan</li> -->'); await p.keyboard.press('Meta+Slash'); assert.equal((await val()).split('\n')[1], '  <li>Plan</li>');
            await sel(6); await p.keyboard.press('Shift+Alt+ArrowDown'); assert.equal((await val()).split('\n').length, 5);
            await p.evaluate(() => { window.ed.value = 'a\nb\nc'; }); await sel(4); await p.keyboard.press('Alt+ArrowUp'); assert.equal(await val(), 'a\nc\nb');
            await sel(2); await p.keyboard.press('Meta+Shift+KeyK'); assert.equal(await val(), 'a\nb');
        });
        await t('Tab et ⇧Tab sur plusieurs lignes ; ( et " fermés tout seuls ; ⌘D choisit le mot suivant pareil', async () => {
            await p.evaluate(() => { window.ed.value = 'a\nb'; }); await sel(0, 3); await p.keyboard.press('Tab'); assert.equal(await val(), '  a\n  b'); await p.keyboard.press('Shift+Tab'); assert.equal(await val(), 'a\nb');
            await p.evaluate(() => { window.ed.setLang('js'); window.ed.value = ''; }); await sel(0); await p.keyboard.type('f('); assert.equal(await val(), 'f()'); await p.keyboard.type('"x'); assert.equal(await val(), 'f("x")'); await p.keyboard.type('")'); assert.equal(await val(), 'f("x")', 'on passe par-dessus');
            await p.evaluate(() => { window.ed.value = 'abc x abc'; }); await sel(1); await p.keyboard.press('Meta+d'); assert.deepEqual(await p.evaluate(() => [window.ed.ta.selectionStart, window.ed.ta.selectionEnd]), [0, 3]); await p.keyboard.press('Meta+d'); assert.deepEqual(await p.evaluate(() => [window.ed.ta.selectionStart, window.ed.ta.selectionEnd]), [6, 9]);
        });
        await t('barre du bas : ligne et colonne, jumelle, vérification (clic : la ligne) ; ⌨ les raccourcis', async () => {
            await p.waitForTimeout(1900); await p.evaluate(() => { window.ed.value = 'if (a) {\n  b(\n}'; }); await sel(7); await p.keyboard.press('ArrowRight'); await p.keyboard.press('ArrowLeft');
            assert.match(await p.textContent('.swc-pos'), /Ligne 1, colonne 8 · jumelle ligne/); await p.waitForTimeout(600); assert.match(await p.textContent('.swc-lint'), /⚠️ \d à vérifier/);
            await p.click('.swc-lint'); assert.match(await p.textContent('.swc-pos'), /Ligne \d : /);
            await p.click('[data-swc-act="keys"]'); assert.ok(await p.locator('.swc-keys dt').count() >= 10); await p.mouse.click(5, 690); await p.waitForTimeout(100); assert.equal(await p.locator('.swc-keys').count(), 0);
            await p.evaluate(() => { window.ed.value = 'ok();'; }); await p.waitForTimeout(600); assert.match(await p.textContent('.swc-lint'), /Rien à signaler/);
        });
        await t('aucune erreur JavaScript', () => assert.deepEqual(errs, []));
        void M; await b.close();
    }
    console.log(`${failed ? '✗' : '✓'} éditeur de code complet : ${n} vérifications${failed ? `, ${failed} en échec` : ''}`);
    process.exit(failed ? 1 : 0);
})();
