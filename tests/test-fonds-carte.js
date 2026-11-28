#!/usr/bin/env node
/* 🗺 « ＋ Ajouter un fond de carte » (assets/js/heritage-fonds-carte.js, app.js) : une adresse de tuiles sans clé, vérifiée
 * (https, {z} {x} {y}, pas de clé dans l'adresse) ; elle arrive dans « Mes fonds de carte » de tous les menus de fonds et donne
 * la bonne adresse de tuile ({s}, {-y}) ; retirer → ↶ Annuler. Depuis Réglages › Cartes › Fonds de cartes.
 *   node tests/test-fonds-carte.js */
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const {spawn, spawnSync} = require('child_process');
let chromium; try { ({chromium} = require('playwright')); } catch (_) { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); }
const root = path.join(__dirname, '..');
const {findPhp, phpRuntimeArgs, devBundledPhp} = require('../electron/php-server.js');

let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-fonds-'));
    fs.mkdirSync(path.join(tmp, 'media'));
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4'};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start) VALUES(1,'Pierre','MAZAUD','male','deceased',1)");
echo json_encode(['ok' => 1]);`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0 || !/"ok"/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const errs = [];
    try {
        const p = await (await browser.newContext({viewport: {width: 1440, height: 900}})).newPage();
        p.on('pageerror', e => errs.push(e.message));
        await p.route(/tuiles\.exemple\.org/, r => r.fulfill({status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')}));
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_EXT?.userTiles && window.LCNDA_APP?.state?.csrf, null, {timeout: 30000});
        await t('l’adresse est vérifiée : https, {z} {x} {y}, pas de clé', async () => {
            const r = await p.evaluate(() => { const c = window.LCNDA_EXT.userTiles.check; return [c('http://a.org/{z}/{x}/{y}.png'), c('https://a.org/{z}/{x}.png'), c('https://a.org/{z}/{x}/{y}.png?key=SECRET'), c('https://a.org/{z}/{x}/{y}.png'), c('https://{s}.a.org/{z}/{x}/{-y}.png'), c('https://a.org/{z}/{x}/{y}{r}.png')]; });
            assert.match(r[0], /https/); assert.match(r[1], /Il manque/); assert.match(r[2], /clé/); assert.deepStrictEqual([r[3], r[4]], ['', '']); assert.match(r[5], /Seuls/);
        });
        await t('Réglages › Cartes : « ＋ Ajouter un fond de carte », essayer, ajouter ; il est dans « Mes fonds de carte » de tous les menus', async () => {
            await p.evaluate(async () => { const s = window.LCNDA_APP.state; s.maintenanceTab = 'design_maps'; await window.LCNDA_APP.setModule('maintenance'); });
            await p.waitForSelector('[data-tile-user-add]', {timeout: 20000}); await p.click('[data-tile-user-add]');
            await p.fill('.uft-dlg [data-uft-label]', 'Topo exemple'); await p.fill('.uft-dlg [data-uft-url]', 'https://{s}.tuiles.exemple.org/{z}/{x}/{-y}.png'); await p.fill('.uft-dlg [data-uft-sub]', 'bc');
            await p.click('.uft-dlg [data-uft-try]'); await p.waitForFunction(() => /s’affiche/.test(document.querySelector('.uft-dlg [data-uft-msg]').textContent), null, {timeout: 10000});
            await p.click('.uft-dlg [data-uft-add]'); await p.waitForSelector('.uft-dlg [data-uft-del]');
            const id = await p.evaluate(() => window.LCNDA_EXT.userTiles.list()[0].id);
            const html = await p.evaluate(() => window.LCNDA_APP.mapBackgroundSelectHtml(''));
            assert.match(html, new RegExp(`<optgroup label="— Mes fonds de carte —"><option value="${id}"[^>]*>Topo exemple</option>`));
            assert.strictEqual(await p.evaluate(i => window.LCNDA_APP.mapTileUrl(i, 3, 4, 2), id), 'https://b.tuiles.exemple.org/3/4/5.png', '{s} tourne sur b, c ; {-y} = 2^z − 1 − y');
            await p.click('.uft-dlg [data-uft-x]'); await p.waitForSelector('#tile-cat-order .tile-cat-block[data-tile-cat="mine"]', {timeout: 10000});
        });
        await t('retirer, puis ↶ Annuler le remet', async () => {
            await p.evaluate(() => document.querySelector('[data-tile-user-add]').click()); await p.click('.uft-dlg [data-uft-del]');
            assert.strictEqual(await p.evaluate(() => window.LCNDA_EXT.userTiles.list().length), 0);
            assert.doesNotMatch(await p.evaluate(() => window.LCNDA_APP.mapBackgroundSelectHtml('')), /Mes fonds de carte/);
            await p.evaluate(() => [...document.querySelectorAll('.ui-toast')].reverse().find(x => /retiré/.test(x.textContent)).querySelector('button').click()); await sleep(300);
            assert.strictEqual(await p.evaluate(() => window.LCNDA_EXT.userTiles.list().length), 1);
        });
        await t('aucune erreur JavaScript', async () => { assert.deepStrictEqual(errs, []); });
    } finally { await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true}); }
    console.log(fails ? `${fails} essai(s) en échec` : 'Ajouter un fond de carte marche.');
    process.exit(fails ? 1 : 0);
})();
