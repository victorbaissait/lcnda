'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * Test des outils ajoutés à la retouche et à l'assemblage :   node tests/test-retouche-more.js
 * (assets/js/heritage-retouch-plus.js, heritage-assemble.js, heritage-studio.js)
 * Des images faites exprès (Python + PIL) dont on connaît la vérité :
 *   ☁️ un paysage (ciel en dégradé, nuages doux, collines, une maison qui dépasse) : le ciel repéré couvre ce qu'il faut ;
 *      dans la retouche, « Coucher de soleil » change bien le haut de la photo, et c'est un calque « Ciel » ;
 *   ✂️ une « personne » (tête, cheveux, manteau) devant un mur texturé : le détourage recouvre la vérité (IoU) ; fond uni ;
 *   🔍 ×2 : bonnes dimensions, plus fidèle qu'un simple agrandissement, calcul dans un fil à part (la page reste libre),
 *      limite de taille ; dans la retouche, une copie ×2 arrive dans les médias ;
 *   🧩 deux morceaux d'une même page : le décalage est retrouvé à quelques points près (et avec une rotation de 1,5°) ;
 *      l'assemblage enregistré a la bonne taille (raccords fondus, coins vides rognés).
 * Navigateur nécessaire (Playwright) ; sans lui, le test le dit et s'arrête.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const phpPath = findPhp([devBundledPhp()]);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-retouche-plus-'));
const media = path.join(tmp, 'media');
fs.mkdirSync(media, { recursive: true });
const envFor = d => ({ ...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1' });
const done = code => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {} process.exit(code); };

// ── les images (vérités comprises) ──
const py = spawnSync('python3', ['-c', String.raw`
import sys, math, random
from PIL import Image, ImageDraw, ImageFilter
out = sys.argv[1]; random.seed(4)
# ☁️ paysage 800 × 500
W, H = 800, 500
img = Image.new('RGB', (W, H)); px = img.load(); truth = Image.new('L', (W, H), 0); tp = truth.load()
hz = lambda x: 200 + 30 * math.sin(x / 60) + 15 * math.sin(x / 23)
for y in range(H):
    for x in range(W):
        h = hz(x)
        if y < h:
            t = y / h
            r, g, b = 40 + 150 * t, 100 + 115 * t, 190 + 50 * t
            c = math.exp(-(((x - 200) / 70) ** 2 + ((y - 80) / 25) ** 2)) + math.exp(-(((x - 560) / 90) ** 2 + ((y - 60) / 20) ** 2))
            c = min(1, c) * 0.85
            px[x, y] = (int(r + (250 - r) * c), int(g + (250 - g) * c), int(b + (252 - b) * c)); tp[x, y] = 255
        else:
            n = random.randint(-28, 28); d = 0.75 if (x // 9 + y // 7) % 3 == 0 else 1
            px[x, y] = (int((60 + n) * d), int((115 + n) * d), int((40 + n // 2) * d))
for y in range(140, 260):
    for x in range(500, 590):
        if y < 175 and abs(x - 545) > (y - 140) * 1.3: continue
        n = random.randint(-20, 20); px[x, y] = (130 + n, 72 + n, 55 + n); tp[x, y] = 0
img.save(out + '/paysage.jpg', quality=95); truth.save(out + '/paysage-verite.png')
# ✂️ personne 600 × 700 devant un mur
W, H = 600, 700
img = Image.new('RGB', (W, H)); px = img.load()
for y in range(H):
    for x in range(W):
        n = random.randint(-14, 14); s = -18 if x % 46 < 4 else 0
        px[x, y] = (182 + n + s, 190 + n + s, 198 + n + s)
d = ImageDraw.Draw(img); truth = Image.new('L', (W, H), 0); dt = ImageDraw.Draw(truth)
d.ellipse((40, 420, 150, 600), fill=(70, 120, 60))
body = [(190, 300), (410, 300), (470, 700), (130, 700)]
d.polygon(body, fill=(135, 32, 42)); dt.polygon(body, fill=255)
d.rectangle((272, 255, 328, 310), fill=(222, 178, 148)); dt.rectangle((272, 255, 328, 310), fill=255)
d.ellipse((240, 120, 360, 270), fill=(225, 180, 150)); dt.ellipse((240, 120, 360, 270), fill=255)
d.chord((236, 112, 364, 250), 180, 360, fill=(58, 38, 28)); dt.chord((236, 112, 364, 250), 180, 360, fill=255)
p2 = img.load()
for y in range(H):
    for x in range(W):
        if truth.getpixel((x, y)):
            r, g, b = p2[x, y]; n = random.randint(-8, 8); p2[x, y] = (max(0, r + n), max(0, g + n), max(0, b + n))
img.save(out + '/personne.jpg', quality=95); truth.save(out + '/personne-verite.png')
# 🧩 une page 1000 × 700, photographiée en deux morceaux qui se recouvrent
W, H = 1000, 700
page = Image.new('RGB', (W, H), (240, 234, 218)); d = ImageDraw.Draw(page)
for line in range(28):
    y = 30 + line * 23; x = 30 + random.randint(0, 30)
    while x < W - 40:
        w = random.randint(8, 46); d.rectangle((x, y, x + w, y + random.randint(7, 12)), fill=(40 + random.randint(0, 50),) * 3); x += w + random.randint(5, 14)
for k in range(6):
    cx, cy = random.randint(80, 920), random.randint(80, 620); d.ellipse((cx - 30, cy - 20, cx + 30, cy + 20), outline=(120, 30, 30), width=3)
pp = page.load()
for y in range(H):
    for x in range(W):
        r, g, b = pp[x, y]; n = random.randint(-6, 6); pp[x, y] = (r + n, g + n, b + n)
page.crop((0, 0, 620, 700)).save(out + '/page-a.jpg', quality=93)
page.crop((380, 30, 1000, 700)).save(out + '/page-b.jpg', quality=93)
print('ok')
`, media], { encoding: 'utf8' });
if (py.status !== 0 || !/ok/.test(py.stdout)) { console.error('Images de test impossibles (python3 + PIL) :', py.stderr || py.stdout); done(1); }

{
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(first_name,last_name,gender) VALUES('Louise','Martin','female')");
$ins = $pdo->prepare("INSERT INTO media(title,media_type,filename,thumbnail) VALUES(?, 'image', ?, ?)");
foreach ([['Paysage', 'paysage.jpg'], ['Portrait en pied', 'personne.jpg'], ['Page, morceau gauche', 'page-a.jpg'], ['Page, morceau droit', 'page-b.jpg']] as [$t, $f]) $ins->execute([$t, $f, $f]);
$pdo->exec("INSERT INTO media_links(media_id,entity_type,entity_id,position) VALUES(1,'person',1,1),(2,'person',1,2)");
echo 'ok';`], { cwd: appRoot, encoding: 'utf8', env: envFor(tmp) });
    if (r.status !== 0 || !/ok$/.test(r.stdout)) { console.error(r.stderr || r.stdout); done(1); }
}

const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
function loadPlaywright() {
    for (const p of ['playwright', '/opt/node-tools/node_modules/playwright', '/opt/node22/lib/node_modules/playwright']) { try { return require(p); } catch (_) {} }
    return null;
}
async function launch(pw) {
    const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(f => fs.existsSync(f));
    try { return await pw.chromium.launch(exe ? { executablePath: exe } : {}); } catch (_) { return pw.chromium.launch(); }
}

(async () => {
    const pw = loadPlaywright();
    if (!pw) { console.log('  – navigateur : sauté (Playwright absent)'); console.log('0 vérification (Playwright absent)'); done(0); }
    const port = await freePort();
    const srv = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env: envFor(tmp), stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
    const browser = await launch(pw);
    const out = {}, errors = [];
    try {
        const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
        await ctx.addInitScript(() => { try { localStorage.setItem('genealogie-retouch-mode', 'advanced'); } catch (_) {} });
        const page = await ctx.newPage();
        page.on('pageerror', e => errors.push(String(e.message)));
        page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(m.text()); });
        page.on('dialog', d => { errors.push('dialogue natif : ' + d.message()); d.dismiss(); });
        await page.goto(base);
        await page.waitForFunction(() => window.LCNDA_EXT?.rtPlus?.algo && window.LCNDA_EXT?.openRetouch && window.LCNDA_EXT?.assembleAlign && window.LCNDA_APP?.api, null, { timeout: 30000 });

        // ── 1. les calculs seuls, comparés à la vérité ──
        out.algo = await page.evaluate(async () => {
            const X = window.LCNDA_EXT.rtPlus.algo;
            const load = f => new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = 'media/' + f; });
            const cv = im => { const c = document.createElement('canvas'); c.width = im.naturalWidth || im.width; c.height = im.naturalHeight || im.height; c.getContext('2d').drawImage(im, 0, 0); return c; };
            const alpha = (c, W, H) => { const t = document.createElement('canvas'); t.width = W; t.height = H; const g = t.getContext('2d'); g.drawImage(c, 0, 0, W, H); const d = g.getImageData(0, 0, W, H).data, a = new Float32Array(W * H); for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3] / 255; return a; };
            const lum = (c, W, H) => { const d = c.getContext('2d').getImageData(0, 0, W, H).data, a = new Float32Array(W * H); for (let i = 0; i < a.length; i++) a[i] = d[i * 4] / 255; return a; };
            const iou = (a, b) => { let i = 0, u = 0; for (let k = 0; k < a.length; k++) { const x = a[k] > 0.5, y = b[k] > 0.5; if (x && y) i++; if (x || y) u++; } return u ? i / u : 0; };
            const R = {};
            // ☁️
            const land = cv(await load('paysage.jpg')), lt = cv(await load('paysage-verite.png')), W = land.width, H = land.height;
            let t0 = performance.now(); const sky = X.skyMask(land); R.skyMs = Math.round(performance.now() - t0);
            const truthSky = lum(lt, W, H); let tc = 0; truthSky.forEach(v => { tc += v; });
            R.sky = {found: sky.found, coverage: sky.coverage, truth: tc / (W * H), iou: iou(alpha(sky.mask, W, H), truthSky), horizon: X.horizonOf(sky.mask)};
            const flat = document.createElement('canvas'); flat.width = 300; flat.height = 200; const fg = flat.getContext('2d'); for (let y = 0; y < 200; y += 4) for (let x = 0; x < 300; x += 4) { fg.fillStyle = `rgb(${60 + (x * 7 + y * 13) % 90},${110 + (x * 3) % 60},40)`; fg.fillRect(x, y, 4, 4); }
            R.noSky = X.skyMask(flat).found;
            // ciels dessinés : le coucher de soleil est chaud en bas, le ciel dégagé bleu en haut
            const px = (c, x, y) => Array.from(c.getContext('2d').getImageData(x, y, 1, 1).data);
            const sun = X.makeSky('sunset', 200, 120, 0.8), clear = X.makeSky('clear', 200, 120, 0.8);
            R.skies = {sunsetLow: px(sun, 100, 92), clearTop: px(clear, 100, 3), all: X.SKIES.map(s => s[0])};
            // ✂️
            const pers = cv(await load('personne.jpg')), ptr = cv(await load('personne-verite.png'));
            t0 = performance.now(); const cut = X.cutout(pers, {x: 120, y: 80, w: 370, h: 620}); R.cutMs = Math.round(performance.now() - t0);
            R.cut = {found: cut.found, iou: iou(alpha(cut.mask, 600, 700), lum(ptr, 600, 700))};
            const cut2 = X.cutout(pers, null); R.cutAll = iou(alpha(cut2.mask, 600, 700), lum(ptr, 600, 700));
            // 🔍 un morceau de la page réduit de moitié puis remis à sa taille : plus proche de l'original qu'un agrandissement simple
            const pa = cv(await load('page-a.jpg')), ref = document.createElement('canvas'); ref.width = 400; ref.height = 300; ref.getContext('2d').drawImage(pa, 100, 100, 400, 300, 0, 0, 400, 300);
            const half = document.createElement('canvas'); half.width = 200; half.height = 150; const hg = half.getContext('2d'); hg.imageSmoothingQuality = 'high'; hg.drawImage(ref, 0, 0, 200, 150);
            const prog = []; let maxGap = 0, last = performance.now(); const iv = setInterval(() => { const n = performance.now(); maxGap = Math.max(maxGap, n - last); last = n; }, 5);
            const job = X.upscaleCanvas(half, 2, {sharp: 0.4}, p => prog.push(p)); const big = await job.promise; clearInterval(iv);
            const simple = document.createElement('canvas'); simple.width = 400; simple.height = 300; const sg = simple.getContext('2d'); sg.imageSmoothingQuality = 'low'; sg.drawImage(half, 0, 0, 400, 300);
            const psnr = (a, b) => { const x = a.getContext('2d').getImageData(4, 4, 392, 292).data, y = b.getContext('2d').getImageData(4, 4, 392, 292).data; let e = 0, n = 0; for (let i = 0; i < x.length; i += 4) for (let c = 0; c < 3; c++) { e += (x[i + c] - y[i + c]) ** 2; n++; } return 10 * Math.log10(255 * 255 / (e / n)); };
            R.up = {w: big.width, h: big.height, psnr: psnr(big, ref), psnrSimple: psnr(simple, ref), prog: prog.length, last: prog[prog.length - 1]};
            const noW = X.upscaleCanvas(half, 4, {grain: true, noWorker: true}); const b4 = await noW.promise; R.up4 = [b4.width, b4.height];
            const huge = document.createElement('canvas'); huge.width = 6100; huge.height = 10; try { X.upscaleCanvas(huge, 2); R.cap = 'accepté'; } catch (e) { R.cap = e.message; }
            // 🧩 deux morceaux de page ; le second aussi tourné de 1,5°
            const ia = await load('page-a.jpg'), ib = await load('page-b.jpg');
            t0 = performance.now(); R.align = await window.LCNDA_EXT.assembleAlign(ia, ib); R.alignMs = Math.round(performance.now() - t0);
            const rot = document.createElement('canvas'); rot.width = ib.naturalWidth; rot.height = ib.naturalHeight; const rg = rot.getContext('2d'); rg.fillStyle = '#f0eada'; rg.fillRect(0, 0, rot.width, rot.height); rg.translate(rot.width / 2, rot.height / 2); rg.rotate(1.5 * Math.PI / 180); rg.drawImage(ib, -rot.width / 2, -rot.height / 2);
            R.alignRot = await window.LCNDA_EXT.assembleAlign(ia, rot);
            const on = new Uint8Array(10 * 6); for (let y = 1; y < 5; y++) for (let x = 2; x < 9; x++) on[y * 10 + x] = 1; on[1 * 10 + 2] = 0;
            R.maxRect = window.LCNDA_EXT.assembleMaxRect(on, 10, 6);
            return R;
        });

        // ── 2. dans la retouche : ☁️ ciel, ✂️ détourage, 🔍 agrandir ──
        const openRt = async (id, filename, title) => {
            await page.evaluate(([id, filename, title]) => { document.querySelectorAll('dialog.h-retouch').forEach(d => d.remove()); const S = window.LCNDA_APP.state; S.lightboxMedia = [{id, filename, title, media_type: 'image'}]; S.lightboxIndex = 0; window.LCNDA_EXT.openRetouch('', null, {advanced: true}); }, [id, filename, title]);
            await page.waitForSelector('dialog.h-retouch [data-rt-canvas]');
            await page.waitForTimeout(500);
        };
        const cmd = k => page.evaluate(k => document.querySelector(`dialog.h-retouch [data-rt-cmd="${k}"]`).click(), k);
        const pixel = (x, y) => page.evaluate(([x, y]) => { const c = document.querySelector('dialog.h-retouch [data-rt-canvas]'); return Array.from(c.getContext('2d').getImageData(Math.round(x * c.width), Math.round(y * c.height), 1, 1).data); }, [x, y]);
        const layerNames = () => page.$$eval('dialog.h-retouch [data-rt-pane="layers"] .h-rt-node', l => l.map(li => [...li.querySelectorAll('input[type=text], input:not([type])')].map(i => i.value).join(' ') || li.textContent.trim().slice(0, 40)));

        await openRt(1, 'paysage.jpg', 'Paysage');
        out.menu = await page.$$eval('dialog.h-retouch [data-rt-cmd^="plus:"]', l => l.map(b => b.dataset.rtCmd));
        out.skyBefore = await pixel(0.1, 0.05);
        await cmd('plus:sky');
        await page.waitForSelector('dialog.h-retouch .h-rt-skypanel');
        out.skyPanelCov = Number(await page.$eval('dialog.h-retouch .h-rt-skypanel', p => p.dataset.coverage));
        await page.click('dialog.h-retouch .h-rt-skypanel [data-sky="sunset"]');
        await page.waitForTimeout(700);
        out.skyAfter = await pixel(0.1, 0.32);
        if (process.env.RT_SHOTS) await page.screenshot({ path: path.join(process.env.RT_SHOTS, 'retouche-ciel.png') });
        out.groundAfter = await pixel(0.1, 0.9);
        await page.click('dialog.h-retouch .h-rt-skypanel [data-sky-ok]');
        await page.waitForTimeout(300);
        out.skyLayers = await layerNames();
        out.skyHistory = await page.$$eval('dialog.h-retouch .h-rt-history li span', l => l.map(s => s.textContent));
        await page.click(`dialog.h-retouch .ed-save-more`); await page.click('.ui-actmenu-i:has-text("Enregistrer sans l’afficher")'); // K19 : les actions de fin dans « 💾 Enregistrer ▾ »
        await page.waitForFunction(() => !document.querySelector('dialog.h-retouch'), null, { timeout: 20000 });
        out.versions = await page.evaluate(async () => (await window.LCNDA_APP.api('media_versions', {id: 1})).versions.length);

        await openRt(2, 'personne.jpg', 'Portrait en pied');
        out.cornerBefore = await pixel(0.03, 0.03);
        await cmd('plus:cutout');
        await page.waitForSelector('dialog.h-retouch .h-rt-cutpanel');
        await page.click('dialog.h-retouch .h-rt-cutpanel [data-cut-run]');
        await page.waitForSelector('dialog.h-retouch .h-rt-cutpanel [data-cut-out]:not([hidden])', { timeout: 30000 });
        out.cutCov = Number(await page.$eval('dialog.h-retouch .h-rt-cutpanel', p => p.dataset.coverage));
        await page.check('dialog.h-retouch .h-rt-cutpanel input[value=color]');
        await page.waitForTimeout(600);
        out.cornerAfter = await pixel(0.03, 0.03);
        out.coatAfter = await pixel(0.5, 0.8);
        await page.click('dialog.h-retouch .h-rt-cutpanel [data-cut-ok]');
        await page.waitForTimeout(300);
        out.cutLayers = await layerNames();
        // 🔍 ×2 en copie dans les médias
        const before = await page.evaluate(async () => (await window.LCNDA_APP.api('media_av_list', {kind: 'image'})).items.length);
        await cmd('plus:upscale');
        await page.waitForSelector('dialog.h-retouch .h-rt-uppanel');
        await page.waitForTimeout(500);
        out.upChoices = await page.$$eval('dialog.h-retouch .h-rt-uppanel input[name=rt-upk]', l => l.map(i => [i.value, i.disabled]));
        out.upPreview = await page.$eval('dialog.h-retouch .h-rt-uppanel [data-up-after]', c => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let s = 0; for (let i = 3; i < d.length; i += 4) s += d[i] > 0; return s; });
        await page.click('dialog.h-retouch .h-rt-uppanel [data-up-go="copy"]');
        await page.waitForFunction(() => document.querySelector('dialog.h-retouch .h-rt-uppanel')?.dataset.size, null, { timeout: 60000 });
        out.upSize = await page.$eval('dialog.h-retouch .h-rt-uppanel', p => p.dataset.size);
        out.upMedia = (await page.evaluate(async () => (await window.LCNDA_APP.api('media_av_list', {kind: 'image'})).items.length)) - before;
        await page.screenshot({ path: path.join(tmp, 'retouche-plus.png') });
        await page.evaluate(() => document.querySelectorAll('dialog.h-retouch').forEach(d => d.remove()));

        // ── 3. 🧩 l'assemblage : aligner tout seul, raccords fondus, coins rognés, enregistré ──
        const before2 = await page.evaluate(async () => (await window.LCNDA_APP.api('media_av_list', {kind: 'image'})).items.map(i => i.id));
        await page.evaluate(() => window.LCNDA_EXT.openAssembler([{id: 3, filename: 'page-a.jpg', title: 'Page, morceau gauche'}, {id: 4, filename: 'page-b.jpg', title: 'Page, morceau droit'}]));
        await page.waitForSelector('dialog.h-as [data-as-auto]');
        await page.click('dialog.h-as [data-as-auto]');
        await page.waitForFunction(() => document.querySelector('dialog.h-as')?.dataset.lastAlign, null, { timeout: 60000 });
        out.uiAlign = JSON.parse(await page.$eval('dialog.h-as', d => d.dataset.lastAlign));
        await page.evaluate(() => { const d = document.querySelector('dialog.h-as'); d.querySelector('[data-as-feather]').checked = true; d.querySelector('[data-as-crop]').checked = true; d.querySelector('[data-as-fmt]').value = 'image/png'; });
        await page.click('dialog.h-as [data-as-save]');
        await page.waitForFunction(() => !document.querySelector('dialog.h-as'), null, { timeout: 30000 });
        out.pano = await page.evaluate(async ids => {
            const items = (await window.LCNDA_APP.api('media_av_list', {kind: 'image'})).items, n = items.find(i => !ids.includes(i.id)); if (!n) return null;
            const im = new Image(); im.src = 'media/' + encodeURIComponent(n.filename); await im.decode();
            const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; const g = c.getContext('2d'); g.drawImage(im, 0, 0);
            const d = g.getImageData(0, 0, c.width, c.height).data; let blank = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] < 250) blank++;
            return {w: im.naturalWidth, h: im.naturalHeight, transparent: blank};
        }, before2);
    } catch (e) { errors.push('test : ' + (e.stack || e.message)); }
    finally { await browser.close(); srv.kill(); }

    const A = out.algo || {};
    const near = (a, b, tol) => Math.abs(a - b) <= tol;
    const checks = [
        ['☁️ ciel repéré : couverture proche de la vérité (± 4 points), IoU ≥ 0,9', () => { assert.ok(A.sky.found); assert.ok(near(A.sky.coverage, A.sky.truth, 0.04), JSON.stringify(A.sky)); assert.ok(A.sky.iou >= 0.9, JSON.stringify(A.sky)); }],
        ['☁️ horizon trouvé vers 40 % de la hauteur', () => assert.ok(near(A.sky.horizon, 0.42, 0.08), String(A.sky.horizon))],
        ['☁️ pas de ciel dans une image sans ciel', () => assert.equal(A.noSky, false)],
        ['☁️ ciels dessinés : coucher chaud près de l’horizon, ciel dégagé bleu en haut', () => { const [r, , b] = A.skies.sunsetLow; assert.ok(r > b + 40, String(A.skies.sunsetLow)); const [r2, , b2] = A.skies.clearTop; assert.ok(b2 > r2 + 60, String(A.skies.clearTop)); assert.equal(A.skies.all.length, 5); }],
        ['✂️ détourage dans un rectangle : IoU ≥ 0,85', () => { assert.ok(A.cut.found); assert.ok(A.cut.iou >= 0.85, String(A.cut.iou)); }],
        ['✂️ détourage sur toute la photo (la plante verte compte aussi) : IoU ≥ 0,6', () => assert.ok(A.cutAll >= 0.6, String(A.cutAll))],
        ['🔍 ×2 : bonnes dimensions, plus fidèle qu’un agrandissement simple', () => { assert.equal(A.up.w, 400); assert.equal(A.up.h, 300); assert.ok(A.up.psnr > A.up.psnrSimple, JSON.stringify(A.up)); assert.ok(A.up.psnr > 20, JSON.stringify(A.up)); }],
        ['🔍 progression par bandes jusqu’à 100 %, ×4 sans fil à part avec lissage du grain', () => { assert.ok(A.up.prog >= 2); assert.equal(A.up.last, 1); assert.deepEqual(A.up4, [800, 600]); }],
        ['🔍 limite : plus de 12 000 points de côté refusé avec un message', () => assert.match(A.cap, /12.000 points de côté/)],
        ['🧩 décalage retrouvé (centre du morceau droit en 690 × 365, à 3 points près)', () => { assert.ok(near(A.align.cx, 690, 3) && near(A.align.cy, 365, 3), JSON.stringify(A.align)); assert.ok(Math.abs(A.align.rot) < 0.3 && near(A.align.s, 1, 0.01), JSON.stringify(A.align)); assert.ok(A.align.ncc > 0.8); }],
        ['🧩 avec une rotation de 1,5° : retrouvée (± 0,3°), position à 5 points près', () => { assert.ok(near(Math.abs(A.alignRot.rot), 1.5, 0.3), JSON.stringify(A.alignRot)); assert.ok(near(A.alignRot.cx, 690, 5) && near(A.alignRot.cy, 365, 5), JSON.stringify(A.alignRot)); }],
        ['🧩 plus grand rectangle couvert', () => { assert.equal(A.maxRect.w * A.maxRect.h, 24); assert.deepEqual([A.maxRect.x, A.maxRect.y], [3, 1]); }],
        ['retouche : quatre entrées au menu (ciel, détourer, agrandir, panorama)', () => { for (const k of ['plus:sky', 'plus:cutout', 'plus:upscale', 'plus:pano']) assert.ok(out.menu.includes(k), out.menu.join()); }],
        ['retouche ☁️ : panneau avec la couverture, le haut devient « coucher de soleil », le sol ne bouge presque pas', () => { assert.ok(out.skyPanelCov > 0.3 && out.skyPanelCov < 0.5, String(out.skyPanelCov)); const [r, , b] = out.skyAfter; assert.ok(r > b, `${out.skyBefore} → ${out.skyAfter}`); assert.ok(out.groundAfter[1] > out.groundAfter[2], String(out.groundAfter)); }],
        ['retouche ☁️ : calques « Ciel » et « Harmonisation », étape d’historique', () => { assert.ok(out.skyLayers.some(t => /Ciel/.test(t)), out.skyLayers.join(' | ')); assert.ok(out.skyLayers.some(t => /Harmonisation/.test(t))); assert.ok(out.skyHistory.some(t => /Ciel remplacé/.test(t)), out.skyHistory.join(' | ')); }],
        ['retouche ☁️ : enregistrée comme nouvelle version (l’original reste)', () => assert.ok(out.versions >= 2, String(out.versions))],
        ['retouche ✂️ : personne trouvée, le fond devient uni, le manteau reste', () => { assert.ok(out.cutCov > 0.2 && out.cutCov < 0.45, String(out.cutCov)); assert.ok(near(out.cornerAfter[0], 0xf2, 6) && near(out.cornerAfter[2], 0xe8, 6), `${out.cornerBefore} → ${out.cornerAfter}`); assert.ok(out.coatAfter[0] > out.coatAfter[2] + 50, String(out.coatAfter)); assert.ok(out.cutLayers.some(t => /Fond uni/.test(t)), out.cutLayers.join(' | ')); }],
        ['retouche 🔍 : ×2 et ×4 proposés, aperçu à 100 % dessiné', () => { assert.deepEqual(out.upChoices, [['2', false], ['4', false]]); assert.ok(out.upPreview > 1000); }],
        ['retouche 🔍 : copie ×2 (1200 × 1400) rangée dans les médias', () => { assert.equal(out.upSize, '1200x1400'); assert.equal(out.upMedia, 1); }],
        ['assemblage 🧩 : « Aligner tout seul » place le morceau droit', () => assert.ok(near(out.uiAlign.cx, 690, 3) && near(out.uiAlign.cy, 365, 3), JSON.stringify(out.uiAlign))],
        ['assemblage 🧩 : image enregistrée ≈ la page entière, coins vides rognés', () => { assert.ok(out.pano, 'pas de nouvelle image'); assert.ok(near(out.pano.w, 1000, 8) && near(out.pano.h, 670, 8), JSON.stringify(out.pano)); assert.equal(out.pano.transparent, 0); }],
        ['aucune erreur JavaScript, aucun dialogue natif', () => assert.deepEqual(errors, [])],
    ];
    let failed = 0;
    for (const [name, fn] of checks) { try { fn(); console.log('  ✓', name); } catch (e) { failed++; console.log('  ✗', name, '\n   ', String(e.message).slice(0, 600)); } }
    if (A.skyMs !== undefined) console.log(`  (ciel ${A.skyMs} ms ; détourage ${A.cutMs} ms ; alignement ${A.alignMs} ms ; IoU ciel ${A.sky?.iou?.toFixed(3)}, détourage ${A.cut?.iou?.toFixed(3)} ; PSNR ×2 ${A.up?.psnr?.toFixed(1)} dB contre ${A.up?.psnrSimple?.toFixed(1)} dB)`);
    if (process.env.RT_SHOTS) { try { fs.copyFileSync(path.join(tmp, 'retouche-plus.png'), path.join(process.env.RT_SHOTS, 'retouche-plus.png')); } catch (_) {} }
    console.log(failed ? `${failed} échec(s)` : `${checks.length} vérifications réussies`);
    done(failed ? 1 : 0);
})().catch(e => { console.error(e); done(1); });
