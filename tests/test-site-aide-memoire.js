'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 📖 Mon site web : l'aide-mémoire HTML / Attributs / CSS / JS du panneau « Ceci est… » et la section 🏷 Attributs HTML.
 *   node tests/test-site-aide-memoire.js
 *  1. les fichiers de données citent leur source et leur licence (WHATWG CC BY 4.0, notice W3C) ;
 *  2. les quatre onglets, la recherche, « Écrire dans le code » au bon endroit (HTML, CSS, JS) ;
 *  3. l'élément choisi : sa description, ses attributs (ajouter, retirer), les on… refusés.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
let failed = 0, count = 0;
const t = async (name, fn) => { try { await fn(); count++; console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
const finish = () => { console.log(`${failed ? '✗' : '✓'} site : aide-mémoire : ${count} vérifications${failed ? `, ${failed} en échec` : ''}`); process.exit(failed ? 1 : 0); };

(async () => {
    let chromium = null;
    try { ({chromium} = require('playwright')); } catch (_) { try { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); } catch (__) { chromium = null; } }
    let phpPath = null;
    try { const {findPhp, devBundledPhp} = require('../electron/php-server'); phpPath = findPhp([devBundledPhp()]); } catch (_) { phpPath = null; }
    if (!chromium || !phpPath) { console.log('— navigateur : Playwright ou PHP absent, partie sautée'); finish(); return; }
    const {phpRuntimeArgs} = require('../electron/php-server');
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-aide-')); fs.mkdirSync(path.join(dir, 'media'));
    const env = {...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media'), GENEALOGY_SKIP_REFERENCE: '1'};
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p->exec("INSERT INTO persons(first_name,last_name,gender,living_status) VALUES('Louise','BORIE','female','deceased')");
$p = null; require 'lib/bootstrap.php'; db(); echo 'ok';`], {cwd: root, encoding: 'utf8', env});
    if (r.status !== 0) throw new Error(r.stderr || r.stdout);
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
    await t('les données citent leur source et leur licence', () => {
        const rd = f => fs.readFileSync(path.join(root, f), 'utf8');
        assert.match(rd('assets/js/heritage-site-web-html-ref.js'), /WHATWG[\s\S]*Creative Commons Attribution 4\.0[\s\S]*Modifications/);
        assert.match(rd('assets/js/heritage-site-web-html-attrs.js'), /WHATWG[\s\S]*Creative Commons Attribution 4\.0[\s\S]*Modifications/);
        const c = rd('assets/js/heritage-site-web-cssjs-ref.js'); assert.match(c, /W3C Software and Document NOTICE/); assert.match(c, /Permission to copy, modify, and distribute this work/); assert.match(c, /Changes:/);
        for (const f of ['heritage-site-web-html-ref.js', 'heritage-site-web-html-attrs.js', 'heritage-site-web-cssjs-ref.js']) assert.ok(rd('index.php').includes(`assets/js/${f}?v=`), f);
    });
    const browser = await chromium.launch();
    const page = await browser.newPage({viewport: {width: 1440, height: 950}});
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    try {
        await page.goto(base); await page.waitForFunction(() => window.LCNDA_APP?.state?.bootstrap && window.LCNDA_EXT?.siteWeb && window.LCNDA_EXT.siteHtmlAttrs && window.LCNDA_EXT.siteCssJsRef);
        await page.evaluate(() => { localStorage.setItem('genealogie-site-web', JSON.stringify({view: 'split', codeTab: 'html'})); new window.LCNDA_EXT.siteWeb.Editor({name: 'T'}).open(); });
        await page.waitForSelector('.sw-dlg [data-sw-frame]'); await page.waitForTimeout(800);
        const E = fn => page.evaluate(fn);
        await t('quatre onglets, avec leur nombre ; la source sous chacun', async () => {
            const k = await page.locator('[data-sw-refkind]').allTextContents();
            assert.deepEqual(k.map(x => x.replace(/\s*\d+$/, '')), ['HTML', 'Attributs', 'CSS', 'JS']);
            assert.match(await page.locator('.sw-ref-src').textContent(), /WHATWG.*CC BY 4\.0/);
            await page.click('[data-sw-refkind="css"]'); assert.match(await page.locator('.sw-ref-src').textContent(), /W3C Software and Document License/);
            await page.click('[data-sw-refkind="js"]'); assert.match(await page.locator('.sw-ref-src').textContent(), /écrits pour LCNDA/);
        });
        await t('HTML : chercher, puis écrire <h2></h2> dans le code', async () => {
            await page.click('[data-sw-refkind="html"]'); await page.fill('[data-sw-refq]', 'h2');
            assert.match(await page.locator('.sw-ref-el[open] summary').textContent(), /Titre \(niveau 2\)/);
            await page.click('.sw-ref-el[open] [data-sw-refins]'); await page.waitForTimeout(200);
            assert.match(await E(() => window.LCNDA_EXT.siteWeb.current.page().html), /<h2><\/h2>/);
        });
        await t('CSS : « marge » trouve margin ; « gap » s’écrit dans style.css', async () => {
            await page.click('[data-sw-refkind="css"]'); await page.fill('[data-sw-refq]', 'marge');
            assert.ok((await page.locator('.sw-ref-el summary').allTextContents()).some(x => /^margin /.test(x)));
            await page.fill('[data-sw-refq]', 'gap'); await page.click('.sw-ref-el[open] [data-sw-refins]'); await page.waitForTimeout(200);
            assert.match(await E(() => window.LCNDA_EXT.siteWeb.current.site.css), /gap: ;/);
            assert.equal(await E(() => window.LCNDA_EXT.siteWeb.current.codeTab), 'css');
        });
        await t('JS : « clic » trouve addEventListener ; l’exemple s’écrit dans script.js', async () => {
            await page.click('[data-sw-refkind="js"]'); await page.fill('[data-sw-refq]', 'clic');
            await page.locator('.sw-ref-el summary').first().click(); await page.locator('.sw-ref-el[open] [data-sw-refins]').click(); await page.waitForTimeout(200);
            assert.match(await E(() => window.LCNDA_EXT.siteWeb.current.site.js), /addEventListener\('click'/);
        });
        await t('Attributs : « nouvel onglet » trouve target', async () => {
            await page.click('[data-sw-refkind="attr"]'); await page.fill('[data-sw-refq]', 'nouvel onglet');
            assert.match((await page.locator('.sw-ref-el summary').allTextContents()).join(' '), /^target /);
        });
        await t('l’élément choisi : description, attributs, ajouter target, refuser onclick, retirer', async () => {
            await E(() => { const e = window.LCNDA_EXT.siteWeb.current, K = window.LCNDA_EXT.siteKit, doc = K.parse(e.page().html); e.post({type: 'select', path: K.pathOf(doc.querySelector('a.site-nom')), report: true}); });
            await page.waitForTimeout(700);
            assert.match(await page.locator('.sw-ref-this summary').textContent(), /<a> : Lien hypertexte/);
            assert.deepEqual(await page.locator('.sw-attr code').allTextContents(), ['href']);
            assert.equal(await page.locator('[data-sw-attrnew] option[value="target"]').count(), 1);
            await E(async () => { const A = window.LCNDA_APP, o = A.askText; A.askText = async () => '_blank'; try { await window.LCNDA_EXT.siteWeb.current.addAttrAsk('target'); } finally { A.askText = o; } });
            await page.waitForTimeout(500);
            assert.match(await E(() => window.LCNDA_EXT.siteWeb.current.page().html), /<a class="site-nom" href="index.html" target="_blank">/);
            await E(() => window.LCNDA_EXT.siteWeb.current.setAttr('onclick', 'alert(1)'));
            assert.doesNotMatch(await E(() => window.LCNDA_EXT.siteWeb.current.page().html), /onclick/);
            await E(() => document.querySelector('.sw-attr [data-sw-act="attr-del"][data-v="target"]').click()); await page.waitForTimeout(400);
            assert.doesNotMatch(await E(() => window.LCNDA_EXT.siteWeb.current.page().html), /target=/);
        });
        await t('aucune erreur JavaScript', async () => assert.deepEqual(errs, []));
    } finally { await browser.close(); proc.kill(); }
    finish();
})();
