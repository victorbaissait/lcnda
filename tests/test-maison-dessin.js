'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🏠 Plan de maison, « Affichage » de l'étage, comme sur un plan d'architecte :
 *   node tests/test-maison-dessin.js
 *  cotes d'ensemble, tableau des pièces (surfaces et total) et cartouche posés sur le plan ; affichage sombre (dessin technique), écran seulement ;
 *  📐 export DXF puis import (calques, unité, pièces nommées) ; 🔁 répéter un objet (en cercle autour d'une table, en ligne) et une fenêtre le long du mur.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
let failed = 0, count = 0;
const t = async (name, fn) => { try { await fn(); count++; console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
const finish = () => { console.log(`${failed ? '✗' : '✓'} plan de maison (dessin technique) : ${count} vérifications${failed ? `, ${failed} en échec` : ''}`); process.exit(failed ? 1 : 0); };

(async () => {
    let chromium = null;
    try { ({chromium} = require('playwright')); } catch (_) { try { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); } catch (__) { chromium = null; } }
    let phpPath = null;
    try { const {findPhp, devBundledPhp} = require('../electron/php-server'); phpPath = findPhp([devBundledPhp()]); } catch (_) { phpPath = null; }
    if (!chromium || !phpPath) { console.log('— navigateur : Playwright ou PHP absent, partie sautée'); finish(); return; }
    const {phpRuntimeArgs} = require('../electron/php-server');
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-maison-dessin-')); fs.mkdirSync(path.join(dir, 'media'));
    const env = {...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media'), GENEALOGY_SKIP_REFERENCE: '1'};
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p->exec("INSERT INTO persons(first_name,last_name,gender,living_status) VALUES('Louise','BORIE','female','deceased')");
$p = null; require 'lib/bootstrap.php'; db(); echo 'ok';`], {cwd: root, encoding: 'utf8', env});
    if (r.status !== 0) throw new Error(r.stderr || r.stdout);
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
    const browser = await chromium.launch();
    const p = await browser.newPage({viewport: {width: 1440, height: 950}});
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    try {
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.openHouse, null, {timeout: 30000});
        await p.evaluate(async () => { window.__ed = await window.LCNDA_EXT.openHouse({}); }); await p.waitForSelector('.h-hs-dlg [data-hs-stage]'); await p.waitForTimeout(500);
        await p.evaluate(() => { const ed = window.__ed, f = ed.house.floors[0], w = q => q.map((r, i) => ({id: 'w' + i, a: [r[0], r[1]], b: [r[2], r[3]], t: 30}));
            f.walls = w([[0, 0, 1200, 0], [1200, 0, 1200, 800], [1200, 800, 0, 800], [0, 800, 0, 0], [700, 0, 700, 800]]);
            f.rooms = [{id: 'r1', name: 'Salle commune', pts: [[0, 0], [700, 0], [700, 800], [0, 800]]}, {id: 'r2', name: 'Cuisine', pts: [[700, 0], [1200, 0], [1200, 800], [700, 800]]}]; ed.commit('test'); ed.setTab('floor'); });
        await p.waitForTimeout(400);
        const tick = sel => p.evaluate(s => { const i = document.querySelector(`.h-hs-dlg ${s}`); i.checked = !i.checked; i.dispatchEvent(new Event('input', {bubbles: true})); }, sel);
        await t('au départ : rien de plus sur le plan', async () => {
            assert.equal(await p.$$eval('.h-hs-dlg .h-hs-ptable, .h-hs-dlg .h-hs-cartouche, .h-hs-dlg .h-hs-dim.is-total', l => l.length), 0);
        });
        await t('cotes d’ensemble : la longueur et la largeur de l’étage', async () => {
            await tick('[data-hs-f="showTotal"]'); await p.waitForTimeout(300);
            const txt = await p.$$eval('.h-hs-dlg .h-hs-dim.is-total text', l => l.map(x => x.textContent));
            assert.deepEqual(txt, ['12,30 m', '8,30 m']);
        });
        await t('tableau des pièces : chaque pièce, sa surface, le total ; tenu à jour', async () => {
            await tick('[data-hs-f="showTable"]'); await p.waitForTimeout(300);
            let tx = await p.textContent('.h-hs-dlg .h-hs-ptable'); assert.match(tx, /Pièces et surfaces/); assert.match(tx, /Salle commune/); assert.match(tx, /Cuisine/); assert.match(tx, /Total/);
            await p.evaluate(() => { const f = window.__ed.house.floors[0]; f.rooms[1].name = 'Grande cuisine'; window.__ed.render(); }); await p.waitForTimeout(200);
            assert.match(await p.textContent('.h-hs-dlg .h-hs-ptable'), /Grande cuisine/);
        });
        await t('cartouche : le nom de la maison, l’étage, la date', async () => {
            await tick('[data-hs-f="showTitle"]'); await p.waitForTimeout(300);
            const tx = await p.textContent('.h-hs-dlg .h-hs-cartouche'); assert.match(tx, /Maison de famille/); assert.match(tx, /Rez-de-chaussée/); assert.match(tx, /\d{2}\/\d{2}\/\d{4}/);
            const f = await p.evaluate(() => window.__ed.house.floors[0]); assert.equal(f.showTotal && f.showTable && f.showTitle, true, 'gardé avec l’étage');
        });
        await t('affichage sombre : à l’écran seulement, gardé avec la maison', async () => {
            await tick('[data-hs-cad]'); await p.waitForTimeout(300);
            assert.equal(await p.evaluate(() => document.querySelector('.h-hs-dlg [data-hs-stage]').classList.contains('is-cad')), true);
            assert.equal(await p.evaluate(() => window.__ed.house.cad), true);
            await tick('[data-hs-cad]'); await p.waitForTimeout(300);
            assert.equal(await p.evaluate(() => document.querySelector('.h-hs-dlg [data-hs-stage]').classList.contains('is-cad')), false);
        });
        await t('📐 DXF : l’étage exporté en calques, puis réimporté dans un nouvel étage (murs, pièces nommées)', async () => {
            await p.waitForTimeout(700); // le dernier réglage coché s'enregistre une demi-seconde après (un seul pas d'annulation)
            const dxf = await p.evaluate(() => window.LCNDA_EXT.houseDxf.toDxf(window.__ed.house.floors[0], {name: 'Maison'}));
            assert.match(dxf, /AC1009/); for (const l of ['MURS', 'MURS_AXES', 'PIECES']) assert.ok(dxf.includes(`\r\n${l}\r\n`), l);
            const file = path.join(dir, 'plan.dxf'); fs.writeFileSync(file, dxf);
            const fc = p.waitForEvent('filechooser'); await p.evaluate(() => { window.__ed.cmd('importdxf'); }); await (await fc).setFiles(file); await p.waitForSelector('dialog[open] [name="lay"]');
            const lay = await p.$$eval('dialog[open] [name="lay"]', l => l.map(x => x.value + ':' + x.checked)); assert.ok(lay.includes('MURS_AXES:true') && lay.includes('MURS:false'), lay.join());
            await p.click('dialog[open] button[type="submit"], dialog[open] .modal-actions .button:not(.secondary)'); await p.waitForTimeout(600);
            const H2 = await p.evaluate(() => window.__ed.house); const nf = H2.floors[H2.floors.length - 1];
            assert.equal(H2.floors.length, 2, 'un nouvel étage'); assert.equal(nf.walls.length, 5); assert.deepEqual(nf.rooms.map(r => r.name).sort(), ['Grande cuisine', 'Salle commune']);
            await p.evaluate(() => { window.__ed.cmd('undo'); }); await p.waitForTimeout(300); assert.equal(await p.evaluate(() => window.__ed.house.floors.length), 1, '↶ annule l’import');
        });
        await t('🔁 répéter : 6 chaises autour de la table (tournées vers elle), puis 3 en ligne', async () => {
            await p.evaluate(() => { const ed = window.__ed, f = ed.house.floors[0]; f.items = [{id: 'tb', kind: 'table', name: 'Table', x: 300, y: 400, w: 120, d: 120, rot: 0}, {id: 'ch', kind: 'chair', name: 'Chaise', x: 300, y: 300, w: 45, d: 45, rot: 0}]; ed.commit('t'); ed.select('item', 'ch'); });
            await p.waitForTimeout(300); await p.evaluate(() => { window.__ed.cmd('repeat'); }); await p.waitForSelector('dialog[open] [name="mode"]');
            assert.equal(await p.$eval('dialog[open] [name="mode"]', e => e.value), 'circle', 'en cercle, proposé près d’une table');
            await p.click('dialog[open] button[type="submit"], dialog[open] .modal-actions .button:not(.secondary)'); await p.waitForTimeout(400);
            let its = await p.evaluate(() => window.__ed.house.floors[0].items.filter(q => q.name === 'Chaise'));
            assert.equal(its.length, 6); its.forEach(c => assert.ok(Math.abs(Math.hypot(c.x - 300, c.y - 400) - 100) < 1, 'à 1 m du centre de la table'));
            assert.deepEqual(its.map(c => c.rot).sort((a, b) => a - b), [0, 60, 120, 180, 240, 300]);
            await p.evaluate(() => window.__ed.cmd('undo')); await p.waitForTimeout(200);
            await p.evaluate(() => { window.__ed.select('item', 'ch'); window.__ed.cmd('repeat'); }); await p.waitForSelector('dialog[open] [name="mode"]');
            await p.selectOption('dialog[open] [name="mode"]', 'line'); await p.fill('dialog[open] [name="n"]', '3'); await p.fill('dialog[open] [name="gap"]', '15');
            await p.click('dialog[open] button[type="submit"], dialog[open] .modal-actions .button:not(.secondary)'); await p.waitForTimeout(400);
            its = await p.evaluate(() => window.__ed.house.floors[0].items.filter(q => q.name === 'Chaise').map(c => c.x));
            assert.deepEqual(its, [300, 360, 420]);
        });
        await t('🔁 répéter une fenêtre : une rangée le long du mur', async () => {
            await p.evaluate(() => { const ed = window.__ed, f = ed.house.floors[0]; f.openings = [{id: 'o1', wall: 'w0', type: 'window', pos: .2, w: 100, h: 120, sill: 90}]; ed.commit('t'); ed.select('opening', 'o1'); });
            await p.waitForTimeout(300); await p.evaluate(() => { window.__ed.cmd('repeat'); }); await p.waitForSelector('dialog[open] [name="gap"]');
            await p.fill('dialog[open] [name="n"]', '4'); await p.fill('dialog[open] [name="gap"]', '140');
            await p.click('dialog[open] button[type="submit"], dialog[open] .modal-actions .button:not(.secondary)'); await p.waitForTimeout(400);
            const pos = await p.evaluate(() => window.__ed.house.floors[0].openings.map(o => Math.round(o.pos * 1200)));
            assert.deepEqual(pos, [240, 480, 720, 960]);
        });
        await t('aucune erreur JavaScript', () => assert.deepEqual(errs, []));
    } finally { await browser.close(); proc.kill(); fs.rmSync(dir, {recursive: true, force: true}); }
    finish();
})().catch(e => { console.error(e); process.exit(1); });
