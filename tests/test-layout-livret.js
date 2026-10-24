'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 📐 Mise en page — 📖 livret à plier (heritage-layout-livret.js) :   node tests/test-layout-livret.js
 *   Node : l'ordre d'impression (8 pages : 8|1, 2|7, 6|3, 4|5 ; 6 pages : deux blanches avant la 4e de couverture) ;
 *   navigateur : ⤓ Exporter → 📖 ouvre les feuilles, chaque face avec les bonnes pages, au double de la largeur.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');
const B = require('../assets/js/heritage-layout-livret.js');
const appRoot = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-livret-')); fs.mkdirSync(path.join(tmp, 'media'));
const env = { ...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1' };
let failed = 0, count = 0;
const t = async (name, fn) => { try { await fn(); count++; console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
(async () => {
    await t('ordre d’impression : 8 pages, 6 pages (blanches avant la dernière), 1 page', () => {
        assert.deepEqual(B.order(8), [[7, 0], [1, 6], [5, 2], [3, 4]]);
        assert.deepEqual(B.order(6), [[5, 0], [1, -1], [-1, 2], [3, 4]]);
        assert.deepEqual(B.order(1), [[-1, 0], [-1, -1]]);
        const all = B.order(12).flat(); assert.deepEqual([...all].sort((a, b) => a - b), [...Array(12).keys()], 'chaque page une fois');
    });
    let pw = null; for (const m of ['playwright', '/opt/node-tools/node_modules/playwright']) { try { pw = require(m); break; } catch (_) {} }
    const phpPath = findPhp([devBundledPhp()]);
    if (!pw || !phpPath) { console.log('— navigateur : Playwright ou PHP absent, partie sautée'); return finish(); }
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`require 'lib/paths.php'; $p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null; require 'lib/bootstrap.php'; $pdo = db(); $pdo->exec("INSERT INTO persons(first_name,last_name,gender) VALUES('Jean','Martin','male')"); echo 'ok';`], { cwd: appRoot, encoding: 'utf8', env });
    if (r.status !== 0) throw new Error(r.stderr || r.stdout);
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const pp = s.address().port; s.close(() => res(pp)); }); });
    const srv = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env, stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
    const browser = await pw.chromium.launch(), errors = [];
    try {
        const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
        page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => { errors.push('dialogue : ' + d.message()); d.dismiss(); });
        await page.goto(base); await page.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.layoutKit && window.LCNDA_EXT?.layoutBooklet && window.LCNDA_EXT?.openLayoutDoc);
        const id = await page.evaluate(async () => { const K = window.LCNDA_EXT.layoutKit, d = K.cleanDoc({ page: { w: 148, h: 210 }, pages: [1, 2, 3, 4, 5, 6].map(n => ({ id: 'p' + n, master: '', items: [K.textItem({ id: 't' + n, html: `<p data-ps="ps-body">PAGE${n}</p>` })] })) });
            return (await window.LCNDA_APP.api('save_layout_doc', {}, { method: 'POST', body: { name: 'Livret', is_design: 0, doc: d } })).result.id; });
        await page.evaluate(id => window.LCNDA_EXT.openLayoutDoc(id, () => {}), id); await page.waitForSelector('dialog.ly-editor'); await page.waitForTimeout(500);
        await t('⤓ Exporter → 📖 Livret à plier : 2 feuilles, chaque face dans l’ordre, au double de la largeur (A5 → A4 paysage)', async () => {
            await page.evaluate(() => document.querySelector('dialog.ly-editor [data-ly-cmd="export"]').click()); await page.waitForSelector('dialog.ui-export[open] [data-fmt="booklet"]');
            await page.click('dialog.ui-export[open] [data-fmt="booklet"]'); const pop = page.waitForEvent('popup'); await page.click('dialog.ui-export[open] [data-ui-go]'); const w = await pop;
            await w.waitForSelector('.lb-side'); const sides = await w.$$eval('.lb-side', l => l.map(s => [...s.querySelectorAll('.lb-half')].map(h => (h.textContent.match(/PAGE(\d)/) || [, '-'])[1]).join('|')));
            assert.deepEqual(sides, ['6|1', '2|-', '-|3', '4|5']);
            assert.match(await w.content(), /@page\{size:296mm 210mm/);
        });
        await t('aucune erreur dans la page', () => assert.deepEqual(errors, []));
    } finally { await browser.close(); srv.kill(); }
    finish();
})();
function finish() { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {} console.log(`${failed ? '✗' : '✓'} mise en page, livret : ${count} vérifications${failed ? `, ${failed} en échec` : ''}`); process.exit(failed ? 1 : 0); }
