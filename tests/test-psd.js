'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🗂 PSD (heritage-psd.js) :   node tests/test-psd.js
 *   Node : écrire puis relire (calques rognés, nom avec accents, opacité, caché, fusion « Produit », image aplatie) ; un PSD
 *   compressé RLE (PackBits) et un PSD en niveaux de gris lus ; un faux fichier refusé ; Pillow (si présent) relit nos PSD ;
 *   retouche : 🗂 Importer les calques d'un PSD (calques posés, à la taille de la photo), puis 🗂 Exporter en PSD (relu).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');
const P = require('../assets/js/heritage-psd.js');
const appRoot = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-psd-')); fs.mkdirSync(path.join(tmp, 'media'));
const env = { ...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1' };
let failed = 0, count = 0;
const t = async (name, fn) => { try { await fn(); count++; console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
const hasPil = spawnSync('python3', ['-I', '-c', 'from PIL import PsdImagePlugin'], { encoding: 'utf8' }).status === 0;
/** un petit PSD fait à la main : compression 1 (RLE) pour l'image aplatie, mode 3 (RVB) ou 1 (gris) */
function rlePsd(mode) {
    const W = 4, H = 2, nch = mode === 3 ? 3 : 1, b = [], be = (n, v) => { for (let i = n - 1; i >= 0; i--) b.push((v >> (i * 8)) & 255); };
    [...'8BPS'].forEach(c => b.push(c.charCodeAt(0))); be(2, 1); for (let i = 0; i < 6; i++) b.push(0); be(2, nch); be(4, H); be(4, W); be(2, 8); be(2, mode); be(4, 0); be(4, 0); be(4, 0);
    be(2, 1); for (let i = 0; i < nch * H; i++) be(2, 2); // chaque ligne : 2 octets compressés
    for (let c = 0; c < nch; c++) for (let y = 0; y < H; y++) b.push(253, [10, 120, 230][c] + y); // 4 fois la même valeur
    return Uint8Array.from(b);
}
(async () => {
    const W = 30, H = 20, comp = new Uint8ClampedArray(W * H * 4), l1 = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < W * H; i++) comp.set([200, 100, 50, 255], i * 4);
    for (let y = 5; y < 10; y++) for (let x = 10; x < 20; x++) l1.set([0, 255, 0, 128], (y * W + x) * 4);
    const bytes = P.write({ w: W, h: H, composite: comp, layers: [{ name: 'Photo', rgba: comp, opacity: 1, visible: true, blend: 'source-over' }, { name: 'Été vert', rgba: l1, opacity: 0.5, visible: false, blend: 'multiply' }] });
    fs.writeFileSync(path.join(tmp, 'a.psd'), bytes);
    await t('écrire puis relire : calques rognés, nom accentué, opacité, caché, Produit, image aplatie', () => {
        const r = P.read(bytes); assert.equal(r.w, 30); assert.equal(r.h, 20); assert.deepEqual([...r.composite.slice(0, 4)], [200, 100, 50, 255]);
        const [a, b] = r.layers; assert.equal(a.name, 'Photo'); assert.deepEqual([b.name, b.left, b.top, b.w, b.h, b.visible, b.blend], ['Été vert', 10, 5, 10, 5, false, 'multiply']);
        assert.ok(Math.abs(b.opacity - 0.5) < 0.01); assert.deepEqual([...b.rgba.slice(0, 4)], [0, 255, 0, 128]);
    });
    await t('lire un PSD compressé (RLE) en couleurs et en niveaux de gris ; refuser un faux fichier', () => {
        const c = P.read(rlePsd(3)); assert.deepEqual([...c.composite.slice(0, 4)], [10, 120, 230, 255]); assert.deepEqual([...c.composite.slice(16, 20)], [11, 121, 231, 255]);
        const g = P.read(rlePsd(1)); assert.deepEqual([...g.composite.slice(0, 4)], [10, 10, 10, 255]);
        assert.throws(() => P.read(new TextEncoder().encode('GIF89a et pas un PSD du tout')), /pas un fichier PSD/);
    });
    if (hasPil) await t('Pillow relit notre PSD : taille, 2 calques, couleur', () => {
        const r = spawnSync('python3', ['-I', '-c', 'import sys;from PIL import Image;im=Image.open(sys.argv[1]);print(im.size,len(im.layers),im.convert("RGB").getpixel((0,0)))', path.join(tmp, 'a.psd')], { encoding: 'utf8' });
        assert.equal(r.stdout.trim(), '(30, 20) 2 (200, 100, 50)', r.stderr);
    });
    let pw = null; for (const m of ['playwright', '/opt/node-tools/node_modules/playwright']) { try { pw = require(m); break; } catch (_) {} }
    const phpPath = findPhp([devBundledPhp()]);
    if (!pw || !phpPath) { console.log('— navigateur : Playwright ou PHP absent, partie sautée'); return finish(); }
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`require 'lib/paths.php'; $p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null; require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(first_name,last_name,gender) VALUES('Louise','Martin','female')");
$img = imagecreatetruecolor(300, 200); imagefill($img, 0, 0, imagecolorallocate($img, 200, 100, 50)); imagejpeg($img, MEDIA_DIR . '/fond.jpg', 95);
$pdo->exec("INSERT INTO media(id,title,media_type,filename,thumbnail) VALUES(1,'Fond orange','image','fond.jpg','fond.jpg')"); echo 'ok';`], { cwd: appRoot, encoding: 'utf8', env });
    if (r.status !== 0) throw new Error(r.stderr || r.stdout);
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const pp = s.address().port; s.close(() => res(pp)); }); });
    const srv = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env, stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
    const browser = await pw.chromium.launch(), errors = [];
    try {
        const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 }, acceptDownloads: true });
        await ctx.addInitScript(() => { try { localStorage.setItem('genealogie-retouch-mode', 'advanced'); } catch (_) {} });
        const page = await ctx.newPage();
        page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => { errors.push('dialogue : ' + d.message()); d.dismiss(); });
        await page.goto(base); await page.waitForFunction(() => window.LCNDA_EXT?.rtPsd && window.LCNDA_EXT?.openRetouch && window.LCNDA_APP?.state?.bootstrap, null, { timeout: 30000 });
        await page.evaluate(() => { const S = window.LCNDA_APP.state; S.lightboxMedia = [{ id: 1, filename: 'fond.jpg', title: 'Fond orange', media_type: 'image' }]; S.lightboxIndex = 0; window.LCNDA_EXT.openRetouch('', null, { advanced: true }); });
        await page.waitForSelector('dialog.h-retouch [data-rt-canvas]'); await page.waitForTimeout(500);
        const cmd = k => page.evaluate(k => document.querySelector(`dialog.h-retouch [data-rt-cmd="${k}"]`).click(), k);
        await t('🗂 importer les calques d’un PSD : posés sur la photo (le vert à sa place), une étape d’historique', async () => {
            await page.click('dialog.h-retouch .h-rt-menubar details:has([data-rt-cmd="psd:import"]) > summary'); await page.click('dialog.h-retouch [data-rt-cmd="psd:import"]');
            await page.waitForSelector('dialog.k-import[open] input[type=file]', { state: 'attached' }); await page.setInputFiles('dialog.k-import[open] input[type=file]', path.join(tmp, 'a.psd')); await page.waitForSelector('dialog.k-import[open] [data-k-go]:not([disabled]):not([hidden])'); await page.click('dialog.k-import[open] [data-k-go]'); await page.waitForTimeout(600);
            const html = await page.$eval('dialog.h-retouch [data-rt-pane="layers"]', p => p.innerHTML); assert.match(html, /Été vert/);
            assert.ok((await page.$$eval('dialog.h-retouch .h-rt-history li span', l => l.map(s => s.textContent))).some(s => /PSD importé/.test(s)));
        });
        await t('🗂 exporter en PSD : la photo et les calques (relus), même taille que la photo', async () => {
            const dl = page.waitForEvent('download'); await cmd('psd:export'); const d = await dl; assert.match(d.suggestedFilename(), /\.psd$/);
            const rr = P.read(fs.readFileSync(await d.path())); assert.deepEqual([rr.w, rr.h], [300, 200]);
            assert.deepEqual(rr.layers.map(l => l.name).slice(0, 3), ['Photo', 'Photo', 'Été vert']); assert.equal(rr.layers[2].visible, false); assert.equal(rr.layers[2].blend, 'multiply');
            const c = rr.composite; assert.ok(c[0] > 180 && c[1] > 80 && c[1] < 120, `image aplatie orange : ${[...c.slice(0, 3)]}`);
            const g = rr.layers[2]; assert.ok(Math.abs(g.left - 100) <= 2 && Math.abs(g.top - 50) <= 2 && Math.abs(g.w - 100) <= 3, `le vert à sa place : ${[g.left, g.top, g.w, g.h]}`);
        });
        await t('aucune erreur dans la page', () => assert.deepEqual(errors, []));
    } finally { await browser.close(); srv.kill(); }
    finish();
})();
function finish() { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {} console.log(`${failed ? '✗' : '✓'} PSD : ${count} vérifications${failed ? `, ${failed} en échec` : ''}`); process.exit(failed ? 1 : 0); }
