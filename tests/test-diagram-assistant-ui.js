#!/usr/bin/env node
/* 💬 « Je veux représenter… » et les 14 diagrammes qui manquaient, dans l'app : la galerie « Nouveau diagramme » propose
 * 3 diagrammes faits sur la base (avec une carte), « Faire ce diagramme » ouvre l'éditeur avec ces données ; un nouveau type
 * se choisit dans la galerie et « Prendre dans ma base » le remplit. Famille fictive MAZAUD, LACOMBE, DURAND.
 *   node tests/test-diagram-assistant-ui.js */
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
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-dga-'));
    fs.mkdirSync(path.join(tmp, 'media'));
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4'};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$ty = fn($s) => (int) $pdo->query("SELECT id FROM event_types WHERE slug='$s' LIMIT 1")->fetchColumn();
$pdo->exec("INSERT INTO places(id,name,latitude,longitude) VALUES(1,'Aurillac',44.93,2.44),(2,'Mauriac',45.22,2.33),(3,'Paris',48.86,2.35),(4,'Lyon',45.76,4.84)");
$P = [[1,'Pierre','MAZAUD','male',1750,1810,1,1],[2,'Marie','LACOMBE','female',1755,1820,2,1],[3,'Jean','MAZAUD','male',1780,1850,1,3],[4,'Anne','DURAND','female',1785,1860,3,3],
      [5,'Jean','MAZAUD','male',1810,1880,3,3],[6,'Louise','MAZAUD','female',1812,1890,3,4],[7,'Paul','DURAND','male',1840,1900,4,4],[8,'Rose','LACOMBE','female',1845,1910,2,3],[9,'Secret','DURAND','male',1850,1920,4,4]];
$ins = $pdo->prepare("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start,is_private) VALUES(?,?,?,?,'deceased',?,?)");
$ev = $pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,year,date_text,place_id) VALUES('person',?,?,?,?,?)");
foreach ($P as [$id,$f,$l,$g,$b,$d,$bp,$dp]) { $ins->execute([$id,$f,$l,$g,$id === 5 ? 1 : 0, $id === 9 ? 1 : 0]); $ev->execute([$id,$ty('birth'),$b,(string)$b,$bp]); $ev->execute([$id,$ty('death'),$d,(string)$d,$dp]); }
$ev->execute([3,$ty('residence'),1805,'1805',3]);
$pdo->exec("INSERT INTO families(id,partner1_id,partner2_id) VALUES(1,1,2),(2,3,4)");
$pdo->exec("INSERT INTO family_children(family_id,child_id) VALUES(1,3),(2,5),(2,6)");
$pdo->prepare("INSERT INTO events(scope,family_id,event_type_id,year,date_text,place_id) VALUES('family',?,?,?,?,?)")->execute([2,$ty('marriage'),1808,'1808',3]);
diagrams_ensure($pdo);
$pdo->prepare("INSERT INTO diagrams(id,name,kind,spec_json) VALUES(1,'Naissances par décennie','columns',?)")->execute([json_encode(['kind' => 'columns', 'title' => 'Naissances par décennie', 'rows' => [['label' => '1750', 's0' => 2], ['label' => '1780', 's0' => 2], ['label' => '1810', 's0' => 2], ['label' => '1840', 's0' => 2]]])]);
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
        p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR|tile|arcgis|openstreetmap/i.test(m.text())) errs.push('console : ' + m.text()); });
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_EXT?.diagramAssistant && window.LCNDA_EXT?.diagramsInternals && window.LCNDA_APP?.state?.csrf, null, {timeout: 30000});
        const api = (a, q = {}) => p.evaluate(async ([x, y]) => { try { return await window.LCNDA_APP.api(x, y); } catch (e) { return {error: e.message}; } }, [a, q]);
        const post = (a, b) => p.evaluate(async ([x, y]) => { try { const r = await window.LCNDA_APP.api(x, {}, {method: 'POST', body: y}); return r.result || r; } catch (e) { return {error: e.message}; } }, [a, b]);

        const closeAll = () => p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => { d.close(); d.parentNode?.removeChild(d); }));
        const open = async () => { await p.evaluate(() => { window.__ed = window.LCNDA_EXT.diagramsInternals.openEditor(); }); await p.waitForSelector('.h-dg-gallery [data-dga-q]'); };
        await t('la galerie « Nouveau diagramme » propose 3 diagrammes faits sur la base ; « Faire ce diagramme » ouvre l’éditeur avec ces données', async () => {
            await open();
            await p.fill('.h-dg-gallery [data-dga-q]', 'Les prénoms les plus donnés dans ma famille'); await p.press('.h-dg-gallery [data-dga-q]', 'Enter');
            await p.waitForSelector('.h-dg-gallery [data-dga-pick="2"]', {timeout: 20000});
            const got = await p.$eval('.h-dg-gallery .h-dga-got', e => e.textContent); assert.match(got, /prénoms/); assert.match(got, /classement/);
            assert.equal(await p.$$eval('.h-dg-gallery .h-dga-card svg', l => l.length), 3, 'trois aperçus');
            await p.click('.h-dg-gallery [data-dga-pick="0"]'); await p.waitForSelector('.h-dg-dlg [data-dg-name]');
            const name = await p.$eval('.h-dg-dlg [data-dg-name]', e => e.value); assert.match(name, /prénoms/i);
            const txt = await p.$eval('.h-dg-dlg', e => e.textContent); assert.match(txt, /Jean/);
            await closeAll();
        });
        await t('une carte : « d’où venaient les gens » → carte à symboles', async () => {
            await open();
            await p.fill('.h-dg-gallery [data-dga-q]', 'D’où venaient les gens'); await p.click('.h-dg-gallery [data-dga-go]');
            await p.waitForSelector('.h-dg-gallery [data-dga-pick="0"]', {timeout: 20000});
            const t1 = await p.$eval('.h-dg-gallery .h-dga-card.is-best', e => e.textContent); assert.match(t1, /carte|symboles/i);
            await closeAll();
        });
        await t('un nouveau type (ensembles parallèles) dans la galerie ; « Prendre dans ma base » le remplit', async () => {
            await open();
            const i = await p.evaluate(() => [...document.querySelectorAll('.h-dg-gallery [data-tpl]')].findIndex(b => /Ensembles parallèles/.test(b.textContent))); assert.ok(i >= 0, 'dans la galerie');
            await p.evaluate(j => document.querySelectorAll('.h-dg-gallery [data-tpl]')[j].click(), i);
            await p.waitForSelector('.h-dg-dlg [data-dg-name]');
            if (!(await p.$('.h-dg-dlg [data-dgm-go]'))) { const tabs = await p.$$('.h-dg-dlg [data-dg-tab]'); for (const b of tabs) { const tx = await b.textContent(); if (/Depuis|base|app|Partir des données/i.test(tx)) { await b.click(); break; } } await sleep(300); }
            await p.waitForSelector('.h-dg-dlg [data-dgm-go]', {timeout: 10000});
            await p.click('.h-dg-dlg [data-dgm-go]'); await sleep(1200);
            const txt = await p.$eval('.h-dg-dlg', e => e.textContent); assert.match(txt, /Aurillac/); assert.match(txt, /Lieu de naissance/);
            await closeAll();
        });
        await t('aucune erreur JavaScript', async () => { assert.deepEqual(errs, []); });
    } finally { await browser.close(); proc.kill(); }
    console.log(fails ? `${fails} essai(s) en échec` : '« Je veux représenter… » marche dans l’app.');
    process.exit(fails ? 1 : 0);
})();
