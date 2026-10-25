'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * ✨ Trésors de famille (assets/js/heritage-tresors*.js, lib/tresors.php) :   node tests/test-tresors.js
 * Un petit arbre (tests/tresors-seed.php), puis dans le navigateur chaque nouveauté de l'onglet ✨ Trésors.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');
const appRoot = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-tresors-')); fs.mkdirSync(path.join(tmp, 'media'));
const env = { ...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1' };
let failed = 0, count = 0;
const only = process.env.TRESORS_ONLY || '';
const t = async (name, fn) => { if (only && !name.includes(only)) return; try { await fn(); count++; console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };

(async () => {
    let pw = null; for (const m of ['playwright', '/opt/node-tools/node_modules/playwright']) { try { pw = require(m); break; } catch (_) {} }
    const phpPath = findPhp([devBundledPhp()]);
    if (!pw || !phpPath) { console.log('— Playwright ou PHP absent : sauté'); return finish(); }
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), path.join(__dirname, 'tresors-seed.php')], { cwd: appRoot, encoding: 'utf8', env });
    if (r.status !== 0 || !/ok$/.test(r.stdout)) throw new Error(r.stderr || r.stdout);
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const pp = s.address().port; s.close(() => res(pp)); }); });
    const srv = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env, stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
    const browser = await pw.chromium.launch(), errors = [];
    try {
        const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 }, acceptDownloads: true });
        const page = await ctx.newPage();
        page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => { errors.push('dialogue : ' + d.message()); d.dismiss(); });
        page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(m.text()); });
        await page.goto(base); await page.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.tresors && window.LCNDA_EXT.tresorFeatures?.length, null, { timeout: 30000 });
        const open = async key => { await page.evaluate(k => window.LCNDA_EXT.tresors.open(k), key); await page.waitForSelector(`[data-tr-page="${key}"] [data-tr-body] > *`, { timeout: 15000 }); await page.waitForTimeout(250); };
        const body = () => page.$eval('[data-tr-body]', b => b.innerText);
        const ctxT = { page, open, body, base, tmp };

        await t('l’onglet ✨ Trésors : la page d’accueil et ses cartes, rangées par groupe', async () => {
            // caché au départ : on l'affiche comme le ferait « Menus, onglets et listes »
            assert.equal(await page.$eval('.nav-item[data-module="tresors"]', b => b.offsetParent !== null), false, 'l’onglet est caché au départ');
            await page.evaluate(() => { localStorage.setItem('genealogie-menu-tresors', '1'); window.LCNDA_APP.applyMenuOrder(); });
            await page.click('.nav-item[data-module="tresors"]'); await page.waitForSelector('.h-tr .h-tr-card');
            // pas de colonne de gauche : rien à gauche (pas celle de l'onglet d'avant)
            assert.equal(await page.$eval('#app', a => a.classList.contains('no-side')), true, 'colonne de gauche vide');
            // ⚙️ Réglages : cacher un trésor, il disparaît ; on le remontre
            const n0 = await page.$$eval('.h-tr .h-tr-card', l => l.length);
            await page.click('[data-tr-settings]'); await page.click('.dashboard-reorder-row:nth-child(1) [data-eye]'); await page.click('dialog [data-save]');
            assert.equal(await page.$$eval('.h-tr .h-tr-card', l => l.length), n0 - 1, 'un trésor caché');
            await page.click('[data-tr-settings]'); await page.click('dialog [data-reset]'); await page.click('dialog [data-save]');
            assert.equal(await page.$$eval('.h-tr .h-tr-card', l => l.length), n0, 'tous remontrés');
            const n = await page.$$eval('.h-tr .h-tr-card', l => l.length); assert.ok(n >= 5, `${n} cartes`);
            await page.click('.h-tr-card[data-tr-open="aton-age"]'); await page.waitForSelector('[data-tr-page="aton-age"]');
            await page.click('[data-tr-home]'); await page.waitForSelector('.h-tr-card');
        });
        for (const f of fs.readdirSync(__dirname).filter(x => /^tresors-cas-.*\.js$/.test(x)).sort()) await require(path.join(__dirname, f))(t, ctxT, assert);
        await t('aucune erreur dans la page', () => assert.deepEqual(errors, []));
    } finally { await browser.close(); srv.kill(); }
    finish();
})();
function finish() { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {} console.log(`${failed ? '✗' : '✓'} trésors de famille : ${count} vérifications${failed ? `, ${failed} en échec` : ''}`); process.exit(failed ? 1 : 0); }
