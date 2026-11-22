#!/usr/bin/env node
/* K16 au choix : Réglages → Notifications et boutons → « Interrupteurs » (interrupteurs conseillés, ou cases à cocher partout).
 *   node tests/test-interrupteurs-option.js */
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const {spawn, spawnSync} = require('child_process');
const {chromium} = require('playwright');
const root = path.join(__dirname, '..');
const {findPhp, phpRuntimeArgs, devBundledPhp} = require('../electron/php-server.js');

let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 4).join('\n  ')); } };

(async () => {
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-k16-'));
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4'};
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p->exec("INSERT INTO persons(first_name,last_name,gender,living_status) VALUES('Jean','MAZAUD','male','deceased')");
$p = null; require 'lib/bootstrap.php'; db(); echo 'ok';`], {cwd: root, encoding: 'utf8', env});
    if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exit(1); }
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
    const browser = await chromium.launch();
    const errs = [];
    try {
        const page = await (await browser.newContext({viewport: {width: 1440, height: 900}})).newPage();
        page.on('pageerror', e => errs.push(e.message));
        await page.goto(base + '#maintenance/look_msgs', {waitUntil: 'load'});
        await page.waitForSelector('#lc-k16-host', {timeout: 30000});
        await t('option « Cases à cocher » : les interrupteurs deviennent des cases, gardé après rechargement', async () => {
            const box = () => page.$eval('#lc-k16-host .ui-toggle > i', i => { const r = i.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height), getComputedStyle(i).borderRadius]; });
            const a = await box(); assert.ok(a[0] > a[1], 'interrupteur au départ (plus large que haut) : ' + a);
            await page.locator('#lc-k16-host').screenshot({path: '' + (process.env.K16_SHOTS || os.tmpdir()) + '/k16-switch.png'});
            await page.check('#lc-k16-host [name="lc_k16"][value="check"]');
            const b = await box(); assert.equal(b[0], 18, 'case : ' + b); assert.equal(b[1], 18);
            await page.locator('#lc-k16-host').screenshot({path: '' + (process.env.K16_SHOTS || os.tmpdir()) + '/k16-check.png'});
            await page.reload({waitUntil: 'load'}); await page.waitForSelector('#lc-k16-host', {timeout: 30000});
            assert.equal(await page.evaluate(() => document.documentElement.dataset.toggles), 'check');
            await page.check('#lc-k16-host [name="lc_k16"][value="switch"]');
            assert.equal(await page.evaluate(() => document.documentElement.dataset.toggles || ''), '');
        });
        await t('aucune erreur JavaScript', async () => { assert.deepStrictEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true});
    }
    console.log(fails ? `${fails} essai(s) en échec` : 'L’option des interrupteurs marche.');
    process.exit(fails ? 1 : 0);
})();
