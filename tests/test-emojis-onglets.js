#!/usr/bin/env node
/* 😀 Réglages → Menus : choisir l'émoji d'un onglet dans un menu (« ▾ »), « Aucun émoji », et « un émoji conseillé à chaque onglet ».
 *   node tests/test-emojis-onglets.js */
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
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-emojis-'));
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
        await page.goto(base + '#maintenance/nav_menus', {waitUntil: 'load'});
        await page.waitForSelector('#menu-order [data-menu-icon-pick="graphiques"]', {timeout: 30000});
        const icon = key => page.$eval(`#menu-order [data-menu-icon="${key}"]`, i => i.value);

        await t('« ▾ » ouvre un menu : le conseillé, Aucun émoji, d’autres ; un choix remplit la case', async () => {
            await page.click('#menu-order [data-menu-icon-pick="graphiques"]');
            await page.waitForSelector('.ui-actmenu .ui-actmenu-i');
            const labels = await page.$$eval('.ui-actmenu .ui-actmenu-i', b => b.map(x => x.textContent.trim()));
            assert.ok(labels[0].includes('📊') && /conseillé/.test(labels[0]), labels[0]);
            assert.ok(labels.some(l => /Aucun émoji/.test(l)), 'Aucun émoji');
            assert.ok(labels.length > 10, 'd’autres émojis : ' + labels.length);
            await page.locator('.ui-actmenu .ui-actmenu-i').first().click();
            assert.equal(await icon('graphiques'), '📊');
            await page.waitForTimeout(1500); // l’enregistrement automatique redessine la liste
        });
        await t('« Aucun émoji » vide la case', async () => {
            await page.click('#menu-order [data-menu-icon-pick="graphiques"]');
            await page.waitForSelector('.ui-actmenu .ui-actmenu-i');
            await page.locator('.ui-actmenu .ui-actmenu-i', {hasText: 'Aucun émoji'}).click();
            assert.equal(await icon('graphiques'), '');
            await page.waitForTimeout(1500);
            assert.equal(await icon('graphiques'), '', 'toujours vide une fois enregistré');
        });
        await t('« 😀 Un émoji conseillé à chaque onglet » remplit les cases vides, gardés tout seuls après rechargement', async () => {
            await page.click('[data-menu-icons-suggest]');
            assert.equal(await icon('graphiques'), '📊');
            assert.equal(await icon('carte'), '🗺️');
            // la case enregistre toute seule (le bouton « Enregistrer » est caché : enregistrement automatique)
            await page.waitForTimeout(1500);
            await page.waitForTimeout(600);
            const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('genealogie-menu-icons') || '{}'));
            assert.equal(stored.graphiques, '📊');
            await page.reload({waitUntil: 'load'});
            await page.waitForSelector('#menu-order [data-menu-icon="graphiques"]', {timeout: 30000});
            assert.equal(await icon('graphiques'), '📊', 'gardé après rechargement');
        });
        await t('aucune erreur JavaScript', async () => { assert.deepStrictEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true});
    }
    console.log(fails ? `${fails} essai(s) en échec` : 'Les émojis des onglets marchent.');
    process.exit(fails ? 1 : 0);
})();
