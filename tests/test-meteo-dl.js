#!/usr/bin/env node
/* 🌦 Météo d'autrefois : « ⤓ Installer » en un bouton (lib/meteo_dl.php, heritage-meteo.js, .github/workflows/meteo.yml).
 * Le « serveur » des données (la version « meteo-donnees » du dépôt) est un dossier local (GENEALOGY_TEST=1 + LCNDA_TEST_METEO_DIR) :
 * le pack d'essai (scripts/meteo/make-fixture.py) coupé en 3 morceaux + meteo-manifest.json.
 *  1. serveur : le sommaire lu (un pack mal décrit est écarté) ; télécharger par tranches, reprendre, abandonner ; vérifié puis rangé ;
 *  2. Réglages → 🌦 Météo d'autrefois : « ⤓ Installer » → la barre d'avancée → « installé » (↶ Annuler le retire) ; rien n'est livré avec l'app.
 *   node tests/test-meteo-dl.js */
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const crypto = require('crypto');
const {spawn, spawnSync} = require('child_process');
let chromium; try { ({chromium} = require('playwright')); } catch (_) { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); }
const root = path.join(__dirname, '..');
const {findPhp, phpRuntimeArgs, devBundledPhp} = require('../electron/php-server.js');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-meteodl-')), fx = path.join(tmp, 'fx'), site = path.join(tmp, 'site'), appMeteo = path.join(tmp, 'app-meteo');
    [path.join(tmp, 'media'), site, appMeteo].forEach(d => fs.mkdirSync(d, {recursive: true}));
    const mk = spawnSync('python3', [path.join(root, 'scripts/meteo/make-fixture.py'), fx], {encoding: 'utf8'});
    if (mk.status !== 0) { console.error(mk.stderr || mk.stdout); process.exit(1); }
    // le pack coupé en 3 morceaux de tailles différentes, comme la version GitHub
    const buf = fs.readFileSync(path.join(fx, 'meteo-pack-complet.lcmeteo')), cut = [0, Math.floor(buf.length / 3), Math.floor(buf.length * 0.8), buf.length];
    const parts = [0, 1, 2].map(i => { const name = `meteo-pack-complet.lcmeteo.00${i}`; fs.writeFileSync(path.join(site, name), buf.subarray(cut[i], cut[i + 1])); return {name, size: cut[i + 1] - cut[i]}; });
    fs.writeFileSync(path.join(site, 'meteo-manifest.json'), JSON.stringify({version: '2026-11', packs: {
        complet: {size: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex'), built: '2026-11-24', parts},
        europe: {size: 999, parts: [{name: 'meteo-pack-europe.lcmeteo.000', size: 5}]}}}));  // tailles fausses : écarté
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4', GENEALOGY_TEST: '1', LCNDA_TEST_METEO_DIR: site, LCNDA_METEO_DIR: appMeteo};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start) VALUES(1,'Jean','MAZAUD','male','deceased',1)");
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
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_EXT?.meteoDl && window.LCNDA_APP?.state?.csrf, null, {timeout: 30000});
        const api = (x, q = {}) => p.evaluate(([y, z]) => window.LCNDA_APP.api(y, z).catch(e => ({error: e.message})), [x, q]);
        const post = (a, b) => p.evaluate(async ([x, y]) => { try { const r = await window.LCNDA_APP.api(x, {}, {method: 'POST', body: y}); return r.result || r; } catch (e) { return {error: e.message}; } }, [a, b]);
        await t('serveur : le sommaire en ligne (un pack mal décrit est écarté) ; rien de météo dans l’app au départ', async () => {
            const r = await api('meteo_dl_info');
            assert.deepStrictEqual(Object.keys(r.packs), ['complet']); assert.strictEqual(r.packs.complet.size, buf.length); assert.strictEqual(r.packs.complet.parts.length, 3);
            assert.strictEqual((await api('meteo_status')).installed, false);
        });
        await t('serveur : par tranches, reprendre où on s’est arrêté, abandonner', async () => {
            const s = await post('meteo_dl_start', {kind: 'complet'}); assert.ok(s.id, JSON.stringify(s));
            const a = await post('meteo_dl_step', {id: s.id}); assert.strictEqual(a.received, parts[0].size, 'le 1er morceau');
            const r = await api('meteo_dl_resume', {id: s.id}); assert.deepStrictEqual([r.exists, r.kind, r.received], [true, 'complet', parts[0].size]);
            await post('meteo_dl_cancel', {id: s.id}); assert.strictEqual((await api('meteo_dl_resume', {id: s.id})).exists, false);
            assert.match((await post('meteo_dl_start', {kind: 'europe'})).error, /pas encore en ligne/);
        });
        await t('Réglages → 🌦 Météo : « ⤓ Installer » → la barre → installé et vérifié ; ↶ Annuler le retire', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'meteo'; A.setModule('maintenance'); });
            await p.waitForSelector('[data-wx-dl="complet"]', {timeout: 20000});
            assert.match(await p.textContent('[data-wx-dl="complet"]'), /Installer/);
            assert.ok(!(await p.$('[data-wx-dl="europe"]')), 'pas de bouton pour un pack absent');
            await p.click('[data-wx-dl="complet"]');
            await p.waitForFunction(() => /installé/.test([...document.querySelectorAll('.ui-toast')].map(x => x.textContent).join(' ')), null, {timeout: 30000});
            const st = await api('meteo_status'); assert.strictEqual(st.installed, true); assert.ok(st.files.complet?.ok, 'le pack est rangé et lisible');
            assert.ok(fs.existsSync(path.join(tmp, 'meteo', 'meteo-complet.sqlite')), 'dans le dossier des données, pas dans l’app');
            assert.deepStrictEqual(fs.readdirSync(appMeteo), [], 'rien dans le dossier de l’app');
            assert.strictEqual(await p.evaluate(() => localStorage.getItem('genealogie-meteo-dl')), '{}');
            await p.evaluate(() => [...document.querySelectorAll('.ui-toast')].reverse().find(x => /installé/.test(x.textContent)).querySelector('button').click()); await sleep(800);
            assert.strictEqual((await api('meteo_status')).installed, false, '↶ Annuler');
        });
        await t('aucune erreur JavaScript', async () => { assert.deepStrictEqual(errs, []); });
    } finally { await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true}); }
    console.log(fails ? `${fails} essai(s) en échec` : 'La météo en un bouton marche.');
    process.exit(fails ? 1 : 0);
})();
