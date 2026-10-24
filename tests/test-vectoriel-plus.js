'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * ✏️ Vectoriel — 📏 cote, 📐 grille de perspective, 〰 largeur variable, ⧉ mélange de formes (heritage-vector-plus.js) :   node tests/test-vectoriel-plus.js
 *   Node : longueurs à la française (cm, mm, po, px), groupe de la cote (flèches, rappels, texte lisible), recalage sur une
 *   ligne de fuite ; navigateur : l'outil 📏 dessine « 10 cm » pour 378 px, Affichage → 📐 montre les lignes de fuite,
 *   une ligne tracée près d'une ligne de fuite s'y aligne, « Annuler » de la fenêtre remet comme avant ; aucune erreur.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');
const V = require('../assets/js/heritage-vector-plus.js');
const appRoot = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-vx-plus-')); fs.mkdirSync(path.join(tmp, 'media'));
const env = { ...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1' };
let failed = 0, count = 0;
const t = async (name, fn) => { try { await fn(); count++; console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
const deg = (x0, y0, x1, y1) => Math.atan2(y1 - y0, x1 - x0) * 180 / Math.PI;

(async () => {
    await t('longueurs : 5 cm, 100 mm, 1 po, 25 px', () => {
        assert.deepEqual([V.lenLabel(96 * 5 / 2.54, 'cm'), V.lenLabel(377.95, 'mm'), V.lenLabel(96, 'in'), V.lenLabel(250, 'px')], ['5 cm', '100 mm', '1 po', '25 px']);
    });
    await t('cote : un groupe (ligne, 2 flèches, 2 rappels, texte) ; de droite à gauche, le texte n’est pas à l’envers ; trop courte : rien', () => {
        const g = V.dimObj(100, 100, 478, 100); assert.equal(g.type, 'group'); assert.equal(g.children.length, 6); assert.equal(g.children[5].text, '10 cm');
        const r = V.dimObj(400, 300, 100, 300).children[5]; assert.ok(!r.rot || Math.abs(r.rot) < 90); assert.equal(V.dimObj(0, 0, 1, 1), null);
        const v = V.dimObj(100, 100, 100, 300).children[5]; assert.equal(Math.abs(v.rot), 90);
    });
    await t('perspective : le tracé ; un trait près d’une ligne de fuite s’y aligne, loin de tout il ne bouge pas', () => {
        const d = { w: 800, h: 600 }, p = { on: true, n: 2, hy: 0.5, v1: 0, v2: 1, k: 8 };
        assert.ok(V.perspPath(d, p).startsWith('M')); assert.equal(V.perspPath(d, { ...p, on: false }), '');
        const [x, y] = V.perspSnap(d, p, 400, 500, 600, 393); assert.ok(Math.abs(deg(400, 500, x, y) - deg(400, 500, 800, 300)) < 0.01);
        assert.deepEqual(V.perspSnap(d, p, 400, 500, 520, 300), [520, 300], 'à plus de 7° : rien');
    });
    await t('〰 largeur variable : un trait devient une forme fermée, de la couleur du trait, effilée aux bouts ; uniforme : rien', () => {
        const o = { type: 'path', closed: false, stroke: '#123456', sw: 10, wp: 'taper', pts: [{ x: 0, y: 0 }, { x: 100, y: 0 }] }, v = V.vary(o);
        assert.equal(v.closed, true); assert.equal(v.fill, '#123456'); assert.equal(v.stroke, 'none');
        const ys = v.pts.map(p => Math.abs(p.y)); assert.ok(ys[0] < 0.5 && Math.max(...ys) >= 4.9, 'fin aux bouts, épais au milieu');
        assert.equal(V.vary({ ...o, wp: '' }), null); assert.equal(V.vary({ ...o, closed: true }), null);
    });
    await t('⧉ mélange : n étapes, la forme et la couleur passent de l’une à l’autre', () => {
        const a = { type: 'path', closed: true, fill: '#ff0000', stroke: 'none', sw: 0, pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }] };
        const b = { type: 'path', closed: true, fill: '#0000ff', stroke: 'none', sw: 0, pts: [{ x: 100, y: 0 }, { x: 120, y: 0 }, { x: 120, y: 20 }, { x: 100, y: 20 }] };
        const m = V.blend(a, b, 3); assert.equal(m.length, 3); assert.equal(m[1].fill, '#800080');
        const cx = m[1].pts.reduce((s, p) => s + p.x, 0) / m[1].pts.length; assert.ok(Math.abs(cx - 57.5) < 0.5, `centre ${cx}`);
    });
    let pw = null; for (const m of ['playwright', '/opt/node-tools/node_modules/playwright']) { try { pw = require(m); break; } catch (_) {} }
    const phpPath = findPhp([devBundledPhp()]);
    if (!pw || !phpPath) { console.log('— navigateur : Playwright ou PHP absent, partie sautée'); return finish(); }
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`require 'lib/paths.php'; $p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null; require 'lib/bootstrap.php'; $pdo = db(); $pdo->exec("INSERT INTO persons(first_name,last_name,gender) VALUES('Louise','Martin','female')"); echo 'ok';`], { cwd: appRoot, encoding: 'utf8', env });
    if (r.status !== 0) throw new Error(r.stderr || r.stdout);
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const pp = s.address().port; s.close(() => res(pp)); }); });
    const srv = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env, stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
    const browser = await pw.chromium.launch(), errors = [];
    try {
        const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
        page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => { errors.push('dialogue : ' + d.message()); d.dismiss(); });
        await page.goto(base); await page.waitForFunction(() => window.LCNDA_EXT?.openVectorEditor && window.LCNDA_EXT?.vectorPlus && window.LCNDA_APP?.state?.bootstrap, null, { timeout: 30000 });
        await page.evaluate(() => window.LCNDA_EXT.openVectorEditor({})); await page.waitForSelector('.vx-dlg [data-vx-stage]'); await page.waitForTimeout(500);
        // du document à l'écran (et retour), par la matrice du dessin
        const scr = (x, y) => page.evaluate(([x, y]) => { const w = document.querySelector('.vx-dlg [data-vx-world]'), m = w.getScreenCTM(), p = new DOMPoint(x, y).matrixTransform(m); return [p.x, p.y]; }, [x, y]);
        const drag = async (a, b) => { const [x0, y0] = await scr(...a), [x1, y1] = await scr(...b); await page.mouse.move(x0, y0); await page.mouse.down(); await page.mouse.move((x0 + x1) / 2, (y0 + y1) / 2, { steps: 4 }); await page.mouse.move(x1, y1, { steps: 4 }); await page.mouse.up(); await page.waitForTimeout(200); };
        await t('📏 la cote : 378 px (10 cm) tirés → un groupe « Cote 10 cm » avec la mesure écrite', async () => {
            await page.click('.vx-dlg [data-vx-tool="dim"]'); await drag([100, 500], [478, 500]);
            const txt = await page.$$eval('.vx-dlg [data-vx-content] text', l => l.map(x => x.textContent)); assert.ok(txt.includes('10 cm'), txt.join());
            await page.click('.vx-dlg [data-vx-tab="layers"]'); await page.waitForTimeout(200);
            assert.ok((await page.$$eval('.vx-dlg .vx-layer input', l => l.map(i => i.value))).some(v => /Cote 10 cm/.test(v)));
        });
        await t('📐 Affichage → Grille de perspective : les lignes de fuite ; « Annuler » les retire', async () => {
            await page.evaluate(() => document.querySelector('.vx-dlg [data-vx-cmd="persp"]').click()); await page.waitForSelector('dialog[open] [name="hy"]');
            assert.ok(await page.$('.vx-dlg [data-vx-persp]')); await page.keyboard.press('Escape'); await page.waitForTimeout(300);
            assert.equal(await page.$('.vx-dlg [data-vx-persp]'), null);
        });
        await t('📐 avec la grille : une ligne tirée près d’une ligne de fuite s’y aligne exactement', async () => {
            await page.evaluate(() => document.querySelector('.vx-dlg [data-vx-cmd="persp"]').click()); await page.waitForSelector('dialog[open] [name="hy"]');
            await page.click('dialog[open] button[type="submit"]'); await page.waitForTimeout(300); assert.ok(await page.$('.vx-dlg [data-vx-persp]'));
            // horizon à 45 % de 600 = 270 ; point de fuite droit à 110 % de 800 = 880
            await page.click('.vx-dlg [data-vx-tool="line"]'); await drag([300, 450], [600, 352]);
            const d = await page.$$eval('.vx-dlg [data-vx-content] path', l => l.map(p => p.getAttribute('d')).filter(s => /^M[\d.\s-]+L[\d.\s-]+$/.test(s.trim())).at(-1));
            const n = d.match(/-?[\d.]+/g).map(Number); const a = deg(n[0], n[1], n[2], n[3]), want = deg(n[0], n[1], 880, 270);
            assert.ok(Math.abs(a - want) < 0.3, `angle ${a} au lieu de ${want} (${d})`);
        });
        await t('〰 dans l’éditeur : une ligne, « Largeur du trait : Plume » → dessinée comme une forme remplie', async () => {
            await page.keyboard.press('Escape'); await page.click('.vx-dlg [data-vx-tool="line"]'); await drag([100, 100], [400, 100]);
            await page.click('.vx-dlg [data-vx-tab="props"]').catch(() => {}); await page.waitForSelector('.vx-dlg [data-vx-p="wp"]');
            await page.selectOption('.vx-dlg [data-vx-p="wp"]', 'swell'); await page.waitForTimeout(300);
            const el = await page.$$eval('.vx-dlg [data-vx-content] path[data-vx]', l => { const p = l.at(-1); return [p.getAttribute('d'), p.getAttribute('fill'), p.getAttribute('stroke')]; });
            assert.match(el[0], /Z\s*$/i, `fermée : ${el[0].slice(-20)}`); assert.notEqual(el[1], 'none');
        });
        await t('⧉ dans l’éditeur : deux rectangles → Objet → Mélange (4 étapes) : un groupe de 6 formes', async () => {
            await page.click('.vx-dlg [data-vx-tool="rect"]'); await drag([100, 200], [160, 260]); await page.click('.vx-dlg [data-vx-tool="rect"]'); await drag([500, 200], [600, 300]);
            await page.click('.vx-dlg [data-vx-tool="select"]'); const [x0, y0] = await scr(80, 180), [x1, y1] = await scr(620, 320);
            await page.mouse.move(x0, y0); await page.mouse.down(); await page.mouse.move(x1, y1, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(200);
            const before = await page.$$eval('.vx-dlg [data-vx-content] g[data-vx] path', l => l.length);
            await page.evaluate(() => document.querySelector('.vx-dlg [data-vx-cmd="blend"]').click()); await page.waitForSelector('dialog[open] [name="n"]');
            await page.fill('dialog[open] [name="n"]', '4'); await page.click('dialog[open] button[type="submit"]'); await page.waitForTimeout(300);
            await page.click('.vx-dlg [data-vx-tab="layers"]'); await page.waitForTimeout(200);
            assert.ok((await page.$$eval('.vx-dlg .vx-layer input', l => l.map(i => i.value))).includes('Mélange'));
            assert.equal(await page.$$eval('.vx-dlg [data-vx-content] g[data-vx] path', l => l.length) - before, 6);
        });
        await t('aucune erreur dans la page', () => assert.deepEqual(errors, []));
    } finally { await browser.close(); srv.kill(); }
    finish();
})();
function finish() { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {} console.log(`${failed ? '✗' : '✓'} vectoriel, cote et perspective : ${count} vérifications${failed ? `, ${failed} en échec` : ''}`); process.exit(failed ? 1 : 0); }
