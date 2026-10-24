'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🎚️ Retouche — 🪄 Gomme magique (heritage-retouch-gomme.js) et ✨ affiner le bord (heritage-retouch-bord.js) :   node tests/test-retouche-gomme.js
 *   le calcul (Node) : zone voisine ou couleur partout, bord adouci ; dans la retouche : un clic sur le papier blanc le rend
 *   transparent (le texte noir reste), ↶ annule, « Appliquer » pose le masque de la photo, une étape d'historique ; aucune erreur.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');
const G = require('../assets/js/heritage-retouch-gomme.js'), R = require('../assets/js/heritage-retouch-bord.js');
const appRoot = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-gomme-')); fs.mkdirSync(path.join(tmp, 'media'));
const env = { ...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1' };
let failed = 0, count = 0;
const t = async (name, fn) => { try { await fn(); count++; console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };

(async () => {
    await t('zone voisine : s’arrête au trait noir ; partout : prend aussi le blanc de l’autre côté ; bord adouci', () => {
        const W = 6, d = new Uint8ClampedArray([255, 255, 255, 255, 250, 250, 250, 255, 0, 0, 0, 255, 255, 255, 255, 255, 235, 235, 235, 255, 255, 255, 255, 255]);
        assert.deepEqual([...G.erase(d, W, 1, 0, 0, { tol: 5 })], [255, 255, 0, 0, 0, 0]);
        assert.deepEqual([...G.erase(d, W, 1, 0, 0, { tol: 5, contiguous: false })].map(v => v > 0 ? (v === 255 ? 1 : 0.5) : 0), [1, 1, 0, 1, 0.5, 1]);
    });
    await t('✨ affiner (Node) : décaler le bord rentre ou sort, lisser adoucit l’escalier, contraste durcit ; le rayon intelligent suit la photo', () => {
        const W = 40, H = 40, m = new Float32Array(W * H), g = new Float32Array(W * H);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { m[y * W + x] = x >= 10 && x < 30 && y >= 10 && y < 30 ? 1 : 0; g[y * W + x] = x >= 14 && x < 30 && y >= 10 && y < 30 ? 1 : 0; }
        const inn = R.refine(m, g, W, H, { shift: -4 }), out = R.refine(m, g, W, H, { shift: 4 });
        assert.ok(inn[20 * W + 11] < 0.5 && inn[20 * W + 20] > 0.99, 'rentre'); assert.ok(out[20 * W + 8] > 0.5, 'sort');
        const sm = R.refine(m, g, W, H, { smooth: 4 }); assert.ok(sm[20 * W + 10] > 0.2 && sm[20 * W + 10] < 0.9, 'adouci');
        const sg = R.refine(m, g, W, H, { smart: 4 }); assert.ok(sg[20 * W + 11] < 0.8, `le bord va sur le contour de la photo (${sg[20 * W + 11]})`);
    });
    let pw = null; for (const m of ['playwright', '/opt/node-tools/node_modules/playwright']) { try { pw = require(m); break; } catch (_) {} }
    const phpPath = findPhp([devBundledPhp()]);
    if (!pw || !phpPath) { console.log('— navigateur : Playwright ou PHP absent, partie sautée'); return finish(); }
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`require 'lib/paths.php'; $p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null; require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(first_name,last_name,gender) VALUES('Louise','Martin','female')");
$img = imagecreatetruecolor(400, 300); imagefill($img, 0, 0, imagecolorallocate($img, 245, 240, 230)); imagefilledrectangle($img, 150, 100, 250, 200, imagecolorallocate($img, 20, 20, 20)); imagepng($img, MEDIA_DIR . '/acte.png');
$pdo->exec("INSERT INTO media(id,title,media_type,filename,thumbnail) VALUES(1,'Acte','image','acte.png','acte.png')"); echo 'ok';`], { cwd: appRoot, encoding: 'utf8', env });
    if (r.status !== 0) throw new Error(r.stderr || r.stdout);
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const pp = s.address().port; s.close(() => res(pp)); }); });
    const srv = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env, stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
    const browser = await pw.chromium.launch(), errors = [];
    try {
        const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
        await ctx.addInitScript(() => { try { localStorage.setItem('genealogie-retouch-mode', 'advanced'); } catch (_) {} });
        const page = await ctx.newPage();
        page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => { errors.push('dialogue : ' + d.message()); d.dismiss(); });
        await page.goto(base); await page.waitForFunction(() => window.LCNDA_EXT?.rtPlus?.magicErase && window.LCNDA_EXT?.openRetouch && window.LCNDA_APP?.state?.bootstrap, null, { timeout: 30000 });
        await page.evaluate(() => { const S = window.LCNDA_APP.state; S.lightboxMedia = [{ id: 1, filename: 'acte.png', title: 'Acte', media_type: 'image' }]; S.lightboxIndex = 0; window.LCNDA_EXT.openRetouch('', null, { advanced: true }); });
        await page.waitForSelector('dialog.h-retouch [data-rt-canvas]'); await page.waitForTimeout(500);
        const alpha = (sel, x, y) => page.evaluate(([sel, x, y]) => { const c = document.querySelector(sel); return c.getContext('2d').getImageData(Math.round(x * c.width), Math.round(y * c.height), 1, 1).data[3]; }, [sel, x, y]);
        const MG = 'dialog.h-retouch .h-rt-magic [data-mg-canvas]', MAIN = 'dialog.h-retouch [data-rt-canvas]';
        await t('🪄 un clic sur le papier : il devient transparent, le carré noir reste ; ↶ annule', async () => {
            await page.evaluate(() => document.querySelector('dialog.h-retouch [data-rt-cmd="plus:magicErase"]').click()); await page.waitForSelector(MG);
            const b = await page.$eval(MG, c => { const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
            await page.mouse.click(b.x + b.w * 0.05, b.y + b.h * 0.05); await page.waitForTimeout(150);
            assert.equal(await alpha(MG, 0.9, 0.9), 0); assert.equal(await alpha(MG, 0.5, 0.5), 255);
            await page.click('dialog.h-retouch .h-rt-magic [data-mg-undo]'); assert.equal(await alpha(MG, 0.9, 0.9), 255);
            await page.mouse.click(b.x + b.w * 0.05, b.y + b.h * 0.05); await page.waitForTimeout(150);
        });
        await t('« Appliquer » : masque de la photo (le papier transparent dans la retouche), une étape d’historique', async () => {
            await page.click('dialog.h-retouch .h-rt-magic [data-mg-ok]'); await page.waitForTimeout(400);
            assert.equal(await page.$('dialog.h-retouch .h-rt-magic'), null);
            assert.ok(await alpha(MAIN, 0.9, 0.9) < 20, 'papier transparent'); assert.equal(await alpha(MAIN, 0.5, 0.5), 255);
            assert.ok((await page.$$eval('dialog.h-retouch .h-rt-history li span', l => l.map(s => s.textContent))).some(s => /Gomme magique/.test(s)));
        });
        await t('✨ affiner le bord du masque de la photo : « Décaler le bord » de −10 px rentre le bord du carré', async () => {
            assert.equal(await alpha(MAIN, 0.385, 0.5), 255, 'avant : le bord du carré est gardé');
            await page.evaluate(() => document.querySelector('dialog.h-retouch [data-rt-cmd="plus:refineEdge"]').click()); await page.waitForSelector('dialog.h-retouch .h-rt-refine');
            for (const [k, v] of [['smart', '0'], ['smooth', '0'], ['contrast', '0'], ['shift', '-10']]) await page.$eval(`dialog.h-retouch .h-rt-refine [data-rf="${k}"]`, (i, v) => { i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); }, v);
            await page.click('dialog.h-retouch .h-rt-refine [data-rf-ok]'); await page.waitForTimeout(400);
            assert.ok(await alpha(MAIN, 0.385, 0.5) < 60, 'le liseré est parti'); assert.equal(await alpha(MAIN, 0.5, 0.5), 255);
            assert.ok((await page.$$eval('dialog.h-retouch .h-rt-history li span', l => l.map(s => s.textContent))).some(s => /Bord du masque affiné/.test(s)));
        });
        await t('aucune erreur dans la page', () => assert.deepEqual(errors, []));
    } finally { await browser.close(); srv.kill(); }
    finish();
})();
function finish() { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {} console.log(`${failed ? '✗' : '✓'} retouche, gomme magique : ${count} vérifications${failed ? `, ${failed} en échec` : ''}`); process.exit(failed ? 1 : 0); }
