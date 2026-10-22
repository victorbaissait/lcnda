'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * Test de 🔄 Image → Rotation de l'image (Retouche : heritage-retouch-rotation.js, heritage-studio.js, heritage-retouch-simple.js) :
 *     node tests/test-retouche-rotation.js
 * 1. Le moteur, sans écran : étapes combinées (4 × 90° = rien, deux symétries = rien), coordonnées (textes, formes, images placées,
 *    traits, retouches de la photo, perspective, recadrage, zone de travail, taille finale), Exif (orientation 6, taille du JPEG).
 * 2. Dans le navigateur : un document à 2 calques + un masque + un texte + une sélection tourne d'un bloc (largeur ↔ hauteur,
 *    points au bon endroit, masques et sélection tournés), ↶ ↷ (une seule étape), 4 × 90° = la même image au point près,
 *    symétries, angle libre (zone agrandie, coins transparents), 📐 redresser l'horizon, enregistrement (nouvelle version, original
 *    gardé), projet rouvert, photo de téléphone (Exif 6) « ↻ Remettre droite », ↺ ↻ de la retouche rapide, 390 px et mode sombre.
 * Navigateur nécessaire (Playwright) pour la 2e partie ; sans lui, le test le dit et s'arrête après la 1re.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');
const O = require('../assets/js/heritage-retouch-rotation.js');

const checks = [];
const check = (name, fn) => checks.push([name, fn]);
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;
const nearPt = (p, q, tol = 1e-9) => near(p[0], q[0], tol) && near(p[1], q[1], tol);

/* ═════ 1. Le moteur ═════ */
check('étapes : 4 × 90° = rien, horaire + antihoraire = rien, deux symétries = rien, 180° + 180° = rien', () => {
    let L = []; for (let i = 0; i < 4; i++) L = O.push(L, {r: 90}); assert.deepEqual(L, []);
    assert.deepEqual(O.push(O.push([], {r: 90}), {r: -90}), []);
    assert.deepEqual(O.push(O.push([], {f: 'h'}), {f: 'h'}), []);
    assert.deepEqual(O.push(O.push([], {f: 'v'}), {f: 'v'}), []);
    assert.deepEqual(O.push(O.push([], {r: 180}), {r: 180}), []);
    assert.deepEqual(O.push(O.push([], {r: 90}), {r: 90}), [{r: 180}]);
    assert.deepEqual(O.push(O.push([], {f: 'h'}), {f: 'v'}), [{r: 180}]); // les deux symétries = un demi-tour
    const free = O.push(O.push([], {r: 90}), {r: 12.5, bg: '#FFFFFF'}); assert.deepEqual(free, [{r: 90}, {r: 12.5, bg: '#ffffff'}]);
    assert.equal(O.clean({r: 30, bg: 'url(x)'}).bg, 'transparent'); assert.equal(O.clean({r: 'x'}), null); assert.equal(O.clean({f: 'z'}), null);
});
check('coordonnées : 90° horaire (x, y) → (1 − y, x), les mêmes que la matrice en points ; tailles en points gardées', () => {
    const X = O.mapper({r: 90}, 300, 200, 200, 300);
    assert.deepEqual(X.pt([0.1, 0.2]), [0.8, 0.1]);
    const M = O.matrix(300, 200, 200, 300, {r: 90}), P = [0.1 * 300, 0.2 * 200], Q = [M[0] * P[0] + M[2] * P[1] + M[4], M[1] * P[0] + M[3] * P[1] + M[5]];
    assert.ok(nearPt([Q[0] / 200, Q[1] / 300], [0.8, 0.1]));
    assert.ok(near(X.kW, 1.5)); assert.deepEqual(X.orient(10, false), [100, false]); assert.deepEqual(O.mapper({f: 'h'}, 300, 200, 300, 200).orient(10, false), [-10, true]);
    // angle libre : le centre reste au centre, la taille grandit
    assert.deepEqual(O.dims(300, 200, {r: 30}), [360, 323]);
    const F = O.mapper({r: 30}, 300, 200, 360, 323); assert.ok(nearPt(F.pt([0.5, 0.5]), [0.5, 0.5], 1e-12));
});
check('document : textes, formes, images placées, traits, masques, sélection et retouches de la photo suivent', () => {
    const snap = {st: {exposure: 10, crop: {x: 0.1, y: 0.2, w: 0.3, h: 0.4, a: 5}, persp: [[0.1, 0.1], [0.9, 0.05], [0.95, 0.9], [0.05, 0.95]], board: {w: 1.2, h: 1.1, ax: 0, ay: 0, bg: '#ffffff'}, size: {w: 600, h: 400, keep: true}, filters: {chain: [{t: 'spin', angle: 8, cx: 20, cy: 30}]}},
        strokes: [{tool: 'heal', dabs: [{x: 0.25, y: 0.5, r: 0.02}]}, {tool: 'clone', dabs: [{x: 0.5, y: 0.5, r: 0.01, ox: 0.1, oy: 0}]}, {tool: 'fill', mask: 'k1', color: '#ff0000'}, {tool: 'patch', mask: 'k2', dx: 0.1, dy: 0}],
        layers: [{id: 'photo', type: 'photo', mask: [{type: 'sel', mask: 'k3'}]},
            {id: 'l1', type: 'layer', ops: [{type: 'text', text: 'AB', x: 0.6, y: 0.5, size: 0.1, lead: 0.12}, {type: 'shape', kind: 'rect', x1: 0.1, y1: 0.1, x2: 0.4, y2: 0.2, size: 0.01}, {type: 'image', mask: 'k9', x: 0.5, y: 0.5, w: 0.2, h: 0.3, rot: 0}, {points: [[0.1, 0.1], [0.4, 0.1]], size: 0.02, color: '#000'}, {type: 'pixels', mask: 'k4', dx: 0.1, dy: 0, _bb: {x: 1}}], mask: [{type: 'sel', mask: 'k5'}, {points: [[0.2, 0.2]], size: 0.05, mode: 'hide'}]},
            {id: 'g1', type: 'group', children: [{id: 'a1', type: 'adjust', st: {filters: {chain: [{t: 'flare', x: 25, y: 25}]}}}]}],
        selId: 'k6'};
    const seen = [];
    const r = O.doc(snap, {r: 90}, {W0: 300, H0: 200, W1: 200, H1: 300, mask: (id, kind) => { seen.push(kind + ':' + id); return kind === 'doc' ? id + 'r' : id; }});
    const t = r.layers[1].ops[0], sh = r.layers[1].ops[1], im = r.layers[1].ops[2], br = r.layers[1].ops[3], pxo = r.layers[1].ops[4];
    assert.ok(nearPt([t.x, t.y], [0.5, 0.6])); assert.equal(t.rot, 90); assert.ok(near(t.size, 0.15)); assert.ok(near(t.lead, 0.18));
    // le rectangle : couché → debout (pas d'angle), mêmes points
    assert.ok(near(sh.x1, 0.8) && near(sh.x2, 0.9) && near(sh.y1, 0.1) && near(sh.y2, 0.4), JSON.stringify(sh)); assert.equal(sh.rot, undefined);
    assert.equal(im.rot, 90); assert.ok(near(im.w, 0.2 * 1.5) && near(im.h, 0.3 * 200 / 300)); assert.equal(im.mask, 'k9'); // l'image placée garde son image, tourne
    assert.deepEqual(br.points.map(p => p.map(v => Math.round(v * 1e9) / 1e9)), [[0.9, 0.1], [0.9, 0.4]]);
    assert.equal(pxo.mask, 'k4r'); assert.ok(nearPt([pxo.dx, pxo.dy], [0, 0.1])); assert.equal(pxo._bb, undefined);
    assert.equal(r.layers[0].mask[0].mask, 'k3r'); assert.equal(r.layers[1].mask[0].mask, 'k5r'); assert.ok(nearPt(r.layers[1].mask[1].points[0], [0.8, 0.2]));
    assert.equal(r.selId, 'k6r'); assert.equal(r.strokes[2].mask, 'k1r'); assert.equal(r.strokes[3].mask, 'k2r'); assert.ok(nearPt([r.strokes[3].dx, r.strokes[3].dy], [0, 0.1]));
    assert.ok(nearPt([r.strokes[0].dabs[0].x, r.strokes[0].dabs[0].y], [0.5, 0.25])); assert.ok(nearPt([r.strokes[1].dabs[0].ox, r.strokes[1].dabs[0].oy], [0, 0.1]));
    assert.ok(seen.includes('doc:k6') && !seen.includes('doc:k9'), seen.join());
    // le recadrage : debout aussi, même redressement ; la perspective : coins rangés pour la nouvelle image ; zone et taille échangées
    assert.ok(near(r.st.crop.w, 0.4) && near(r.st.crop.h, 0.3) && r.st.crop.a === 5);
    const T = p => [1 - p[1], p[0]], q = snap.st.persp; [T(q[3]), T(q[0]), T(q[1]), T(q[2])].forEach((p, i) => assert.ok(nearPt(r.st.persp[i], p), 'coin ' + i));
    assert.deepEqual([r.st.board.w, r.st.board.h, r.st.board.ax, r.st.board.ay], [1.1, 1.2, 1, 0]); assert.deepEqual([r.st.size.w, r.st.size.h], [400, 600]);
    assert.deepEqual([r.st.filters.chain[0].cx, r.st.filters.chain[0].cy], [70, 20]); assert.deepEqual([r.layers[2].children[0].st.filters.chain[0].x, r.layers[2].children[0].st.filters.chain[0].y], [75, 25]);
    assert.deepEqual(r.st.docXf, [{r: 90}]);
    // 4 × 90° : tout revient
    let s4 = snap; for (let i = 0; i < 4; i++) s4 = O.doc(s4, {r: 90}, {W0: i % 2 ? 200 : 300, H0: i % 2 ? 300 : 200});
    const t4 = s4.layers[1].ops[0]; assert.ok(nearPt([t4.x, t4.y], [0.6, 0.5], 1e-12) && !t4.rot && near(t4.size, 0.1, 1e-12)); assert.deepEqual(s4.st.docXf, []);
    s4.st.persp.forEach((p, i) => assert.ok(nearPt(p, snap.st.persp[i], 1e-12)));
    // symétrie horizontale : texte retourné, recadrage redressé dans l'autre sens
    const h = O.doc(snap, {f: 'h'}, {W0: 300, H0: 200}); assert.equal(h.layers[1].ops[0].mirror, true); assert.ok(near(h.layers[1].ops[0].x, 0.4)); assert.equal(h.st.crop.a, -5);
    // angle libre : le recadrage ne tient plus (retiré, signalé), la perspective est à figer dans l'image (signalé)
    const f = O.doc(snap, {r: 20}, {W0: 300, H0: 200}); assert.equal(f.st.crop, null); assert.ok(f.notes.includes('crop') && f.notes.includes('persp')); assert.equal(f.layers[1].ops[1].rot, 20);
});
check('Exif : orientation 6 lue, taille du JPEG lue, « pas appliquée » si la taille montrée est celle du fichier', () => {
    const py = spawnSync('python3', ['-c', String.raw`
import sys, io
from PIL import Image
im = Image.new('RGB', (64, 32), (200, 0, 0))
ex = Image.Exif(); ex[0x0112] = 6
b = io.BytesIO(); im.save(b, 'JPEG', exif=ex.tobytes()); sys.stdout.buffer.write(b.getvalue())`], { maxBuffer: 1e7 });
    assert.equal(py.status, 0, String(py.stderr));
    const bytes = new Uint8Array(py.stdout);
    assert.equal(O.exifOrientation(bytes), 6); assert.deepEqual(O.jpegSize(bytes), [64, 32]);
    assert.deepEqual(O.exifState(bytes, 64, 32), {o: 6, applied: false, steps: [{r: 90}]}); // montrée couchée : à remettre droite
    assert.equal(O.exifState(bytes, 32, 64).applied, true); // le navigateur l'a déjà tournée
    assert.deepEqual(O.exifSteps(8), [{r: -90}]); assert.deepEqual(O.exifSteps(5), [{f: 'h'}, {r: -90}]);
    const [w, h] = O.innerRect(300, 200, 10); assert.ok(w > 200 && w < 300 && h > 100 && h < 200);
});

function runChecks() {
    let failed = 0;
    for (const [name, fn] of checks) { try { fn(); console.log('  ✓', name); } catch (e) { failed++; console.log('  ✗', name, '\n   ', String(e.stack || e.message).slice(0, 900)); } }
    console.log(failed ? `${failed} échec(s)` : `${checks.length} vérifications réussies`);
    return failed;
}

/* ═════ 2. Dans le navigateur ═════ */
const appRoot = path.resolve(__dirname, '..');
const phpPath = findPhp([devBundledPhp()]);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-retouche-rotation-'));
const media = path.join(tmp, 'media');
const shots = process.env.RT_SHOTS || '';
fs.mkdirSync(media, { recursive: true });
const envFor = d => ({ ...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1' });
const done = code => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {} process.exit(code); };

// une photo de 300 × 200 : coin rouge en haut à gauche, coin bleu en bas à droite, une bande verte au tiers ; une photo de téléphone (Exif 6)
const py = spawnSync('python3', ['-c', String.raw`
import sys
from PIL import Image, ImageDraw
out = sys.argv[1]
im = Image.new('RGB', (300, 200), (128, 128, 128)); d = ImageDraw.Draw(im)
d.rectangle((0, 0, 29, 19), fill=(255, 0, 0)); d.rectangle((270, 180, 299, 199), fill=(0, 0, 255)); d.rectangle((0, 120, 299, 129), fill=(0, 200, 0))
im.save(out + '/coins.png')
ph = Image.new('RGB', (240, 160), (90, 140, 200)); d = ImageDraw.Draw(ph); d.rectangle((0, 0, 39, 39), fill=(255, 255, 0))
ex = Image.Exif(); ex[0x0112] = 6; ph.save(out + '/telephone.jpg', 'JPEG', quality=95, exif=ex.tobytes())
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
foreach ([['Coins', 'coins.png'], ['Téléphone', 'telephone.jpg']] as [$t, $f]) $ins->execute([$t, $f, $f]);
$pdo->exec("INSERT INTO media_links(media_id,entity_type,entity_id,position) VALUES(1,'person',1,1)");
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
    if (!pw) { console.log('  – navigateur : sauté (Playwright absent)'); done(runChecks() ? 1 : 0); }
    const port = Number(process.env.RT_PORT) || await freePort();
    const srv = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env: envFor(tmp), stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
    const browser = await launch(pw);
    const out = {}, errors = [];
    const D = 'dialog.h-retouch';
    try {
        const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
        await ctx.addInitScript(() => { try { localStorage.setItem('genealogie-retouch-mode', 'advanced'); } catch (_) {} });
        const page = await ctx.newPage();
        page.setDefaultTimeout(15000);
        page.on('pageerror', e => errors.push(String(e.message)));
        page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(m.text()); });
        page.on('dialog', d => { errors.push('dialogue natif : ' + d.message()); d.dismiss(); });
        await page.goto(base);
        await page.waitForFunction(() => window.LCNDA_EXT?.openRetouch && window.LCNDA_EXT?.rtOrient && window.LCNDA_EXT?.openRetouchSimple && window.LCNDA_APP?.api, null, { timeout: 30000 });

        const openRt = async (id, filename, title, simple = false) => {
            await page.evaluate(() => document.querySelectorAll('dialog.h-retouch, dialog.h-retouch-simple').forEach(d => { d.dataset.ownClose = ''; d.close(); }));
            await page.evaluate(([id, filename, title, simple]) => { const S = window.LCNDA_APP.state; S.lightboxMedia = [{id, filename, title, media_type: 'image'}]; S.lightboxIndex = 0; if (simple) window.LCNDA_EXT.openRetouchSimple(); else window.LCNDA_EXT.openRetouch('', null, {advanced: true}); }, [id, filename, title, simple]);
            await page.waitForSelector(simple ? 'dialog.h-retouch-simple [data-rs-canvas]' : `${D} [data-rt-canvas]`);
            await page.waitForTimeout(500);
        };
        const at = async (fx, fy) => { const r = await page.$eval(`${D} [data-rt-canvas]`, c => { const b = c.getBoundingClientRect(); return [b.x, b.y, b.width, b.height]; }); return [r[0] + fx * r[2], r[1] + fy * r[3]]; };
        const click = async (fx, fy) => { const [x, y] = await at(fx, fy); await page.mouse.click(x, y); await page.waitForTimeout(150); };
        const drag = async (a, b) => { const [x0, y0] = await at(...a), [x1, y1] = await at(...b); await page.mouse.move(x0, y0); await page.mouse.down(); await page.mouse.move(x1, y1, { steps: 10 }); await page.mouse.up(); await page.waitForTimeout(200); };
        const mode = k => page.click(`${D} .h-rt-vtools [data-rt-mode="${k}"]`);
        const cmd = async k => { await page.evaluate(k => document.querySelector(`dialog.h-retouch [data-rt-cmd="${k}"]`).click(), k); await page.waitForTimeout(350); };
        const px = (x, y, sel = `${D} [data-rt-canvas]`) => page.evaluate(([x, y, sel]) => { const c = document.querySelector(sel); return Array.from(c.getContext('2d').getImageData(Math.round(x * (c.width - 1)), Math.round(y * (c.height - 1)), 1, 1).data); }, [x, y, sel]);
        const dims = (sel = `${D} [data-rt-canvas]`) => page.$eval(sel, c => [c.width, c.height]);
        const hash = (sel = `${D} [data-rt-canvas]`) => page.evaluate(sel => { const c = document.querySelector(sel), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let h = 2166136261; for (let i = 0; i < d.length; i++) h = Math.imul(h ^ d[i], 16777619); return c.width + 'x' + c.height + ':' + (h >>> 0); }, sel);
        const hist = () => page.$$eval(`${D} .h-rt-history li span`, l => l.map(s => s.textContent));
        const red = p => p[0] > 200 && p[1] < 60 && p[2] < 60, blue = p => p[2] > 200 && p[0] < 60, green = p => p[1] > 150 && p[0] < 60 && p[2] < 60;

        // ── Un document : la photo, « Annotations » (un trait), un texte avec un masque (d'après une sélection), la sélection gardée ──
        await openRt(1, 'coins.png', 'Coins');
        await mode('brush'); await drag([0.1, 0.4], [0.4, 0.4]);
        await mode('text'); await click(0.55, 0.45); await page.keyboard.type('AB'); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
        await mode('marquee'); await drag([0.5, 0.3], [0.95, 0.75]);
        await cmd('mask:sel'); await page.waitForTimeout(300);
        await mode('hand');
        out.d0 = await dims(); out.h0 = await hash(); out.n0 = (await hist()).length;
        out.p0 = {red: await px(0.03, 0.03), blue: await px(0.97, 0.97), stroke: await px(0.25, 0.4), green: await px(0.5, 0.625)};
        // ↻ 90° horaire : (x, y) → (1 − y, x)
        await cmd('rot:cw');
        out.d1 = await dims(); out.h1 = await hash(); out.hist1 = await hist();
        out.p1 = {red: await px(0.97, 0.03), blue: await px(0.03, 0.97), stroke: await px(0.6, 0.25), green: await px(0.375, 0.5)};
        out.overlay1 = await dims(`${D} [data-rt-overlay]`);
        out.where1 = await page.$eval(`${D} .ed-status, ${D} [class*=ed-status]`, e => e.textContent).catch(() => '');
        // ↶ revient tout entier, ↷ refait
        await page.click(`${D} [data-rt-undo]`); await page.waitForTimeout(400); out.hU = await hash(); out.dU = await dims();
        await page.click(`${D} [data-rt-redo]`); await page.waitForTimeout(400); out.hR = await hash();
        // 3 × 90° de plus : la même image qu'au départ, au point près
        await cmd('rot:cw'); await cmd('rot:cw'); await cmd('rot:cw'); out.h4 = await hash(); out.d4 = await dims();
        // ↺ antihoraire : (x, y) → (y, 1 − x)
        await cmd('rot:ccw'); out.pC = {red: await px(0.03, 0.97), blue: await px(0.97, 0.03)}; await page.click(`${D} [data-rt-undo]`); await page.waitForTimeout(400);
        // symétries
        await cmd('flip:h'); out.pH = {red: await px(0.97, 0.03), stroke: await px(0.75, 0.4), d: await dims()}; out.labH = (await hist()).slice(-1)[0];
        await cmd('flip:h'); out.hHH = await hash();
        await cmd('flip:v'); out.pV = {red: await px(0.03, 0.97), green: await px(0.5, 1 - 0.625)}; await page.click(`${D} [data-rt-undo]`); await page.waitForTimeout(400);
        await cmd('rot:180'); out.p180 = {red: await px(0.97, 0.97), blue: await px(0.03, 0.03)}; await page.click(`${D} [data-rt-undo]`); await page.waitForTimeout(400);
        // l'état interne après 90° : texte tourné, masque et sélection à la taille de l'image tournée
        await cmd('rot:cw');
        if (shots) { await page.screenshot({ path: path.join(shots, 'rotation-90-1440.png') }); }
        // 💾 Enregistrer sans l'afficher : une nouvelle version, tournée ; l'original est gardé
        await page.click(`${D} .ed-save-more`); await page.click('.ui-actmenu-i:has-text("Enregistrer sans l’afficher")');
        await page.waitForFunction(() => !document.querySelector('dialog.h-retouch'), null, { timeout: 30000 });
        out.saved = await page.evaluate(async () => {
            const vs = (await window.LCNDA_APP.api('media_versions', {id: 1})).versions, v = vs.find(x => !x.is_original); if (!v) return null;
            const im = new Image(); im.src = 'media/' + encodeURIComponent(v.filename) + '?t=' + Date.now(); await im.decode();
            const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; const g = c.getContext('2d'); g.drawImage(im, 0, 0);
            return {w: im.naturalWidth, h: im.naturalHeight, red: Array.from(g.getImageData(im.naturalWidth - 5, 5, 1, 1).data), versions: vs.length, original: vs.some(x => x.is_original && x.filename === 'coins.png')};
        });

        // ── Angle libre (fenêtre) et projet rouvert ──
        await openRt(1, 'coins.png', 'Coins');
        await mode('text'); await click(0.2, 0.7); await page.keyboard.type('Z'); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
        await cmd('rot:angle'); await page.waitForSelector('dialog.rt-fmt-dlg[open] [data-ra-angle]');
        await page.fill('dialog.rt-fmt-dlg[open] [data-ra-angle]', '30'); await page.click('dialog.rt-fmt-dlg[open] [data-ra-dir="cw"]');
        out.angleAfter = await page.$eval('dialog.rt-fmt-dlg[open] [data-ra-after]', e => e.textContent);
        if (shots) await page.screenshot({ path: path.join(shots, 'rotation-angle-1440.png') });
        await page.click('dialog.rt-fmt-dlg[open] .modal-actions .button:not(.secondary)'); await page.waitForTimeout(500);
        out.dA = await dims(); out.cornerA = await px(0, 0); out.labA = (await hist()).slice(-1)[0];
        await page.click(`${D} [data-rt-projsave]`); await page.waitForTimeout(1200);
        const proj = await page.evaluate(async () => (await window.LCNDA_APP.api('retouch_projects')).projects[0]);
        await page.evaluate(() => { const d = document.querySelector('dialog.h-retouch'); d.close(); });
        await page.evaluate(id => window.LCNDA_EXT.openRetouchProject(id), proj.id); await page.waitForSelector(`${D} [data-rt-canvas]`); await page.waitForTimeout(900);
        out.dP = await dims(); out.labP = (await hist()).slice(-1)[0];
        out.projText = await page.$$eval(`${D} [data-rt-pane="layers"] [data-rt-lname]`, l => l.map(i => i.value));
        await page.click(`${D} [data-rt-undo]`); await page.waitForTimeout(400); out.dPU = await dims();

        // ── 📐 Redresser l'horizon : une ligne un peu penchée → la fenêtre propose l'angle, avec le recadrage ──
        await openRt(1, 'coins.png', 'Coins');
        await cmd('rot:level');
        await drag([0.1, 0.5], [0.9, 0.6]);
        await page.waitForSelector('dialog.rt-fmt-dlg[open] [data-ra-angle]');
        out.levelAngle = Number(await page.$eval('dialog.rt-fmt-dlg[open] [data-ra-angle]', e => e.value)); out.levelDir = await page.$eval('dialog.rt-fmt-dlg[open] [data-ra-dir].is-active', e => e.dataset.raDir); out.levelCrop = await page.$eval('dialog.rt-fmt-dlg[open] [data-ra-crop]', e => e.checked);
        await page.click('dialog.rt-fmt-dlg[open] .modal-actions .button:not(.secondary)'); await page.waitForTimeout(500);
        out.labL = (await hist()).slice(-1)[0];

        // ── 📱 Photo de téléphone (Exif 6) : ce navigateur la montre droite ; sinon « ↻ Remettre droite » ──
        await openRt(2, 'telephone.jpg', 'Téléphone'); await page.waitForTimeout(500);
        out.dT = await dims(); out.bannerAuto = await page.$$eval(`${D} .h-rt-exif`, l => l.length);
        await page.evaluate(() => { const O = window.LCNDA_EXT.rtOrient; O._exifState = O.exifState; O.exifState = () => ({o: 6, applied: false, steps: [{r: 90}]}); });
        await openRt(2, 'telephone.jpg', 'Téléphone'); await page.waitForSelector(`${D} .h-rt-exif [data-rt-exif-fix]`);
        if (shots) await page.screenshot({ path: path.join(shots, 'rotation-exif-1440.png') });
        await page.click(`${D} .h-rt-exif [data-rt-exif-fix]`); await page.waitForTimeout(400);
        out.dTfix = await dims(); out.labT = (await hist()).slice(-1)[0]; out.nT = (await hist()).length;
        await page.evaluate(() => { const O = window.LCNDA_EXT.rtOrient; O.exifState = O._exifState; });

        // ── ⚡ Retouche rapide : ↺ ↻ ──
        const R = 'dialog.h-retouch-simple [data-rs-canvas]';
        await openRt(1, 'coins.png', 'Coins', true);
        out.sd0 = await dims(R); out.sh0 = await hash(R);
        await page.click('dialog.h-retouch-simple [data-rs-rot="cw"]'); await page.waitForTimeout(400);
        out.sd1 = await dims(R); out.sred = await px(0.97, 0.03, R);
        await page.click('dialog.h-retouch-simple [data-rs-rot="ccw"]'); await page.waitForTimeout(400); out.sh2 = await hash(R);
        await page.click('dialog.h-retouch-simple [data-rs-undo]'); await page.waitForTimeout(400); out.sd3 = await dims(R);
        await page.evaluate(() => { const d = document.querySelector('dialog.h-retouch-simple'); d.close(); });

        // ── 390 px et mode sombre ──
        await page.setViewportSize({ width: 390, height: 844 });
        await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
        await openRt(1, 'coins.png', 'Coins');
        out.narrowScroll0 = await page.evaluate(() => document.querySelector('dialog.h-retouch').scrollWidth - document.querySelector('dialog.h-retouch').clientWidth);
        await cmd('rot:ccw');
        out.narrowScroll = await page.evaluate(() => document.querySelector('dialog.h-retouch').scrollWidth - document.querySelector('dialog.h-retouch').clientWidth);
        out.dN = await dims();
        if (shots) await page.screenshot({ path: path.join(shots, 'rotation-390-sombre.png') });
        await page.evaluate(() => { const m = document.querySelector('dialog.h-retouch details.h-rt-menu:nth-of-type(3)'); if (m) m.open = true; });
        if (shots) await page.screenshot({ path: path.join(shots, 'rotation-menu-390-sombre.png') });
    } catch (e) { errors.push('test : ' + (e.stack || e.message)); }
    finally { await browser.close(); srv.kill(); }

    const red = p => p && p[0] > 200 && p[1] < 60 && p[2] < 60, blue = p => p && p[2] > 200 && p[0] < 60, green = p => p && p[1] > 150 && p[0] < 60 && p[2] < 60, dark = p => p && p[0] < 60 && p[1] < 60 && p[2] < 60;
    check('le document de départ : 300 × 200, coins et trait au bon endroit', () => { assert.deepEqual(out.d0, [300, 200]); assert.ok(red(out.p0.red) && blue(out.p0.blue) && dark(out.p0.stroke) && green(out.p0.green), JSON.stringify(out.p0)); });
    check('↻ 90° horaire : 200 × 300, chaque point au bon endroit (coins, trait du calque, bande), une seule étape', () => {
        assert.deepEqual(out.d1, [200, 300]); assert.deepEqual(out.overlay1, [200, 300]);
        assert.ok(red(out.p1.red) && blue(out.p1.blue) && dark(out.p1.stroke) && green(out.p1.green), JSON.stringify(out.p1));
        assert.equal(out.hist1.length, out.n0 + 1); assert.match(out.hist1.slice(-1)[0], /Rotation de l’image : 90° horaire/);
    });
    check('↶ défait tout (300 × 200, la même image), ↷ refait', () => { assert.deepEqual(out.dU, [300, 200]); assert.equal(out.hU, out.h0); assert.equal(out.hR, out.h1); });
    check('4 × 90° = la même image au point près', () => { assert.deepEqual(out.d4, [300, 200]); assert.equal(out.h4, out.h0); });
    check('↺ antihoraire, 180°, symétries horizontale et verticale', () => {
        assert.ok(red(out.pC.red) && blue(out.pC.blue), JSON.stringify(out.pC)); assert.ok(red(out.p180.red) && blue(out.p180.blue), JSON.stringify(out.p180));
        assert.ok(red(out.pH.red) && dark(out.pH.stroke), JSON.stringify(out.pH)); assert.deepEqual(out.pH.d, [300, 200]); assert.match(out.labH, /Symétrie horizontale/);
        assert.equal(out.hHH, out.h0); assert.ok(red(out.pV.red) && green(out.pV.green), JSON.stringify(out.pV));
    });
    check('💾 enregistrement : une nouvelle version tournée (200 × 300, rouge en haut à droite), l’original gardé', () => { assert.ok(out.saved, 'pas de version'); assert.deepEqual([out.saved.w, out.saved.h], [200, 300]); assert.ok(red(out.saved.red), String(out.saved.red)); assert.ok(out.saved.original && out.saved.versions >= 2); });
    check('Angle… 30° : zone agrandie (360 × 323), coins transparents', () => { assert.match(out.angleAfter, /360 × 323/); assert.deepEqual(out.dA, [360, 323]); assert.equal(out.cornerA[3], 0); assert.match(out.labA, /30° horaire/); });
    check('projet rouvert : toujours tourné, calques là, ↶ revient à 300 × 200', () => { assert.deepEqual(out.dP, [360, 323]); assert.ok(out.projText.some(n => /Z/.test(n)), String(out.projText)); assert.deepEqual(out.dPU, [300, 200]); });
    check('📐 redresser l’horizon : l’angle de la ligne proposé (≈ 4,76° antihoraire), recadrage coché', () => { assert.ok(Math.abs(out.levelAngle - 4.76) < 0.3, String(out.levelAngle)); assert.equal(out.levelDir, 'ccw'); assert.equal(out.levelCrop, true); assert.match(out.labL, /Horizon redressé/); });
    check('📱 Exif 6 : montrée droite par ce navigateur (160 × 240, pas de bandeau) ; sinon « ↻ Remettre droite » en une étape', () => { assert.deepEqual(out.dT, [160, 240]); assert.equal(out.bannerAuto, 0); assert.deepEqual(out.dTfix, [240, 160]); assert.match(out.labT, /remise droite/); });
    check('⚡ retouche rapide : ↻ (200 × 300, rouge en haut à droite), ↺ revient, ↶', () => { assert.deepEqual(out.sd0, [300, 200]); assert.deepEqual(out.sd1, [200, 300]); assert.ok(red(out.sred), String(out.sred)); assert.equal(out.sh2, out.sh0); assert.deepEqual(out.sd3, [200, 300]); });
    check('390 px, sombre : tournée, la rotation n’élargit pas la fenêtre', () => { assert.deepEqual(out.dN, [200, 300]); assert.ok(out.narrowScroll <= Math.max(1, out.narrowScroll0), `${out.narrowScroll0} → ${out.narrowScroll}`); });
    check('aucune erreur JavaScript, aucun dialogue natif', () => assert.deepEqual(errors, []));
    done(runChecks() ? 1 : 0);
})().catch(e => { console.error(e); done(1); });
