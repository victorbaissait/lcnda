'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🎚️ Retouche — 💧 Fluidité (heritage-retouch-fluidite.js) :   node tests/test-retouche-fluidite.js
 *   le calcul (Node) : pousser déplace la couleur dans le sens de la main ; gonfler / dégonfler s'opposent ; reconstruire ramène ;
 *   dans la retouche : menu Image → 💧, on pousse le rouge dans le bleu, ↶ annule le coup, « Appliquer » crée le calque
 *   « Fluidité » et la photo affichée a changé à cet endroit ; aucune erreur.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');
const L = require('../assets/js/heritage-retouch-fluidite.js');
const appRoot = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-fluidite-')); fs.mkdirSync(path.join(tmp, 'media'));
const env = { ...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1' };
let failed = 0, count = 0;
const t = async (name, fn) => { try { await fn(); count++; console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };

(async () => {
    const W = 40, H = 40, src = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const o = (y * W + x) * 4; src[o] = x < 20 ? 255 : 0; src[o + 2] = x < 20 ? 0 : 255; src[o + 3] = 255; }
    await t('pousser : le rouge avance vers la droite, sous le pinceau seulement', () => {
        const f = L.field(W, H), out = new Uint8ClampedArray(src.length); L.brush(f, 'push', 20, 20, 8, 1, 4, 0); L.render(src, f, out);
        assert.equal(out[(20 * W + 21) * 4], 255, 'le rouge a gagné'); assert.equal(out[(2 * W + 21) * 4], 0, 'loin du pinceau : rien'); assert.ok(L.moved(f));
    });
    await t('gonfler et dégonfler s’opposent ; reconstruire ramène vers zéro ; hors de l’image : rien', () => {
        const a = L.field(W, H), b = L.field(W, H); L.brush(a, 'bloat', 20, 20, 10, 1); L.brush(b, 'pinch', 20, 20, 10, 1);
        assert.ok(a.dx[20 * W + 25] < 0 && b.dx[20 * W + 25] > 0); const v = Math.abs(a.dx[20 * W + 25]);
        L.brush(a, 'restore', 20, 20, 10, 1); assert.ok(Math.abs(a.dx[20 * W + 25]) < v);
        assert.equal(L.brush(a, 'push', -50, -50, 5, 1, 1, 0), null);
    });
    let pw = null; for (const m of ['playwright', '/opt/node-tools/node_modules/playwright']) { try { pw = require(m); break; } catch (_) {} }
    const phpPath = findPhp([devBundledPhp()]);
    if (!pw || !phpPath) { console.log('— navigateur : Playwright ou PHP absent, partie sautée'); return finish(); }
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`require 'lib/paths.php'; $p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null; require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(first_name,last_name,gender) VALUES('Louise','Martin','female')");
$img = imagecreatetruecolor(400, 300); imagefilledrectangle($img, 0, 0, 199, 299, imagecolorallocate($img, 220, 20, 20)); imagefilledrectangle($img, 200, 0, 399, 299, imagecolorallocate($img, 20, 40, 220)); imagejpeg($img, MEDIA_DIR . '/deux.jpg', 95);
$pdo->exec("INSERT INTO media(id,title,media_type,filename,thumbnail) VALUES(1,'Deux couleurs','image','deux.jpg','deux.jpg')"); echo 'ok';`], { cwd: appRoot, encoding: 'utf8', env });
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
        await page.goto(base); await page.waitForFunction(() => window.LCNDA_EXT?.rtPlus?.liquify && window.LCNDA_EXT?.openRetouch && window.LCNDA_APP?.state?.bootstrap, null, { timeout: 30000 });
        await page.evaluate(() => { const S = window.LCNDA_APP.state; S.lightboxMedia = [{ id: 1, filename: 'deux.jpg', title: 'Deux couleurs', media_type: 'image' }]; S.lightboxIndex = 0; window.LCNDA_EXT.openRetouch('', null, { advanced: true }); });
        await page.waitForSelector('dialog.h-retouch [data-rt-canvas]'); await page.waitForTimeout(500);
        const pixel = (sel, x, y) => page.evaluate(([sel, x, y]) => { const c = document.querySelector(sel); return Array.from(c.getContext('2d').getImageData(Math.round(x * c.width), Math.round(y * c.height), 1, 1).data); }, [sel, x, y]);
        const LQ = 'dialog.h-retouch .h-rt-liq [data-lq-canvas]', MAIN = 'dialog.h-retouch [data-rt-canvas]';
        await t('menu Image → 💧 Fluidité ouvre la fenêtre, avec ses six pinceaux', async () => {
            await page.evaluate(() => document.querySelector('dialog.h-retouch [data-rt-cmd="plus:liquify"]').click());
            await page.waitForSelector(LQ); assert.equal(await page.$$eval('dialog.h-retouch .h-rt-liq [data-lq-tool]', l => l.length), 6);
        });
        const drag = async () => { const b = await page.$eval(LQ, c => { const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
            await page.$eval('dialog.h-retouch .h-rt-liq [data-lq="force"]', i => { i.value = '100'; i.dispatchEvent(new Event('input', { bubbles: true })); });
            await page.mouse.move(b.x + b.w * 0.38, b.y + b.h / 2); await page.mouse.down(); await page.mouse.move(b.x + b.w * 0.70, b.y + b.h / 2, { steps: 16 }); await page.mouse.up(); await page.waitForTimeout(100); };
        await t('➡ pousser le rouge dans le bleu ; ↶ annule le coup', async () => {
            const before = await pixel(LQ, 0.55, 0.5); assert.ok(before[2] > 150, `bleu au départ : ${before}`);
            await drag(); const after = await pixel(LQ, 0.55, 0.5); assert.ok(after[0] > 150 && after[2] < 100, `rouge poussé : ${after}`);
            await page.click('dialog.h-retouch .h-rt-liq [data-lq-undo]'); const back = await pixel(LQ, 0.55, 0.5); assert.ok(back[2] > 150, `revenu : ${back}`);
        });
        await t('« Appliquer » : un calque « Fluidité », la photo affichée a changé, une étape d’historique', async () => {
            await drag(); await page.click('dialog.h-retouch .h-rt-liq [data-lq-ok]'); await page.waitForTimeout(400);
            assert.equal(await page.$('dialog.h-retouch .h-rt-liq'), null);
            const c = await pixel(MAIN, 0.55, 0.5); assert.ok(c[0] > 150 && c[2] < 100, `photo déformée : ${c}`);
            const far = await pixel(MAIN, 0.9, 0.1); assert.ok(far[2] > 150, 'le reste ne bouge pas');
            assert.ok((await page.$$eval('dialog.h-retouch .h-rt-history li span', l => l.map(s => s.textContent))).some(s => /Fluidité/.test(s)));
            assert.match(await page.$eval('dialog.h-retouch [data-rt-pane="layers"]', p => p.innerHTML), /Fluidité/);
        });
        await t('aucune erreur dans la page', () => assert.deepEqual(errors, []));
    } finally { await browser.close(); srv.kill(); }
    finish();
})();
function finish() { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {} console.log(`${failed ? '✗' : '✓'} retouche, fluidité : ${count} vérifications${failed ? `, ${failed} en échec` : ''}`); process.exit(failed ? 1 : 0); }
