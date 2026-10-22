'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🏠 Plan de maison : une autre époque en fantôme (calque 🕰, légende ajouté / disparu, 3D, curseur des années).
 *   node tests/test-maison-epoques.js          (SHOTS=dossier pour garder les captures)
 *  1. calculs (Node) : epochGhost (avant / après / au choix), epochDiff (1 mur ajouté, 1 disparu, tolérance de quelques cm) ;
 *  2. navigateur : menu calque, fantôme sépia, légende 1 / 1, 3D (murs du fantôme), curseur des années, 💾 réglages, 390 px sombre, aucune erreur.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const appRoot = path.resolve(__dirname, '..');
globalThis.LCNDA_SHEET = require(path.join(appRoot, 'assets/js/app-tableur-engine.js'));
require(path.join(appRoot, 'assets/js/heritage-house-vides.js'));
const P = require(path.join(appRoot, 'assets/js/heritage-house-plus.js'));
let ok = 0, failed = 0;
const t = async (name, fn) => { try { await fn(); ok++; console.log('  ✓ ' + name); } catch (e) { failed++; console.log('  ✗ ' + name + '\n    ' + (e.stack || e.message).split('\n').slice(0, 4).join('\n    ')); } };
const W = q => q.map((r, i) => ({id: 'w' + i, a: [r[0], r[1]], b: [r[2], r[3]], t: 20}));
const rect = [[0, 0, 1000, 0], [1000, 0, 1000, 600], [1000, 600, 0, 600], [0, 600, 0, 0]];
const floorOf = (id, extra) => ({id, name: 'Rez-de-chaussée', level: 0, height: 250, wallT: 20, walls: W([...rect, extra]), rooms: [], openings: [], items: [], dims: [], labels: []});
// époque 1900 : un mur de refend à x = 400 ; époque 1950 : il a disparu, un autre est apparu à x = 700 (et le contour bouge de 3 cm : tolérance)
const old = floorOf('fo', [400, 0, 400, 600]), cur = floorOf('fn', [700, 0, 700, 600]); cur.walls[0].a = [0, 3]; cur.walls[0].b = [1000, 3];
const house = () => ({slab: 20, floors: JSON.parse(JSON.stringify([cur])), roof: {on: false}, ver: 'v2', versions: [{id: 'v1', label: 'La ferme', date: '1900', floors: JSON.parse(JSON.stringify([old])), roof: {on: false}}, {id: 'v2', label: 'Agrandie', date: '1950'}, {id: 'v3', label: 'Aujourd’hui', date: '2000', floors: JSON.parse(JSON.stringify([cur])), roof: {on: false}}]});

(async () => {
    await t('calculs : epochGhost — époque d’avant, d’après, au choix ; rien sans époques', () => {
        const H = house();
        assert.equal(P.epochGhost(H, 'prev').v.id, 'v1'); assert.equal(P.epochGhost(H, 'prev').before, true);
        assert.equal(P.epochGhost(H, 'next').v.id, 'v3'); assert.equal(P.epochGhost(H, 'next').before, false);
        assert.equal(P.epochGhost(H, 'v1').v.id, 'v1'); assert.equal(P.epochGhost(H, 'v2'), null, 'pas l’époque montrée');
        assert.equal(P.epochGhost(H), null, 'éteint par défaut'); assert.equal(P.epochGhost({floors: [cur]}, 'prev'), null);
        H.ver = 'v1'; assert.equal(P.epochGhost(H, 'prev'), null, 'pas d’époque avant la première');
    });
    await t('calculs : epochDiff — 1 mur ajouté, 1 disparu, le contour décalé de 3 cm compte pareil', () => {
        const d = P.epochDiff(cur, old); assert.equal(d.added.length, 1); assert.equal(d.gone.length, 1);
        assert.equal(d.added[0].a[0], 700); assert.equal(d.gone[0].a[0], 400);
        assert.deepEqual(P.epochDiff(cur, cur), {added: [], gone: []});
        // un mur coupé en deux à l'autre époque n'est ni ajouté ni disparu
        const split = floorOf('fs', [700, 0, 700, 300]); split.walls.push({id: 'wx', a: [700, 300], b: [700, 600], t: 20}); split.walls[0].a = [0, 3]; split.walls[0].b = [1000, 3];
        assert.deepEqual(P.epochDiff(cur, split), {added: [], gone: []});
    });

    let chromium = null;
    try { ({chromium} = require('playwright')); } catch (_) { try { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); } catch (__) { chromium = null; } }
    if (!chromium) { console.log('  — Playwright absent : partie navigateur sautée'); return done(); }
    const {findPhp, devBundledPhp, phpRuntimeArgs} = require('../electron/php-server');
    const phpPath = findPhp([devBundledPhp()]);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-maisonepoques-')), dir = path.join(tmp, 'data'); fs.mkdirSync(path.join(dir, 'media'), {recursive: true});
    const env = {...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media'), GENEALOGY_SKIP_REFERENCE: '1'};
    const r0 = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`require 'lib/paths.php'; $p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p->exec("INSERT INTO persons(first_name,last_name,gender) VALUES('Marie','Durand','female')");`], {cwd: appRoot, env, encoding: 'utf8'});
    if (r0.status !== 0) throw new Error(r0.stderr || r0.stdout);
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], {cwd: appRoot, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`, shots = process.env.SHOTS || '';
    const browser = await chromium.launch();
    const shot = async (p, name, sel) => { if (!shots) return; if (sel) await (await p.$(sel)).screenshot({path: path.join(shots, name)}); else await p.screenshot({path: path.join(shots, name)}); };
    try {
        for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
        const open = async (W2, dark) => {
            const ctx = await browser.newContext({viewport: {width: W2, height: 900}, colorScheme: dark ? 'dark' : 'light'}), p = await ctx.newPage(), errs = [];
            p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_|tile\.openstreetmap/.test(m.text())) errs.push(m.text()); });
            await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
            await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.openHouse && window.LCNDA_EXT?.housePlus?.epochGhost, null, {timeout: 30000});
            const H = house();
            await p.evaluate(async H => { window.__ed = await window.LCNDA_EXT.openHouse({}); const h = window.__ed.house; Object.keys(H).forEach(k => { h[k] = H[k]; }); window.__ed.render(); window.__ed.setTab('floor'); }, H);
            await p.waitForSelector('.h-hs-dlg [data-hs-stage]'); await p.waitForTimeout(500);
            return {p, ctx, errs};
        };
        const pick = (p, v) => p.evaluate(v => { const s = document.querySelector('.h-hs-dlg [data-hs-floors] [data-hs-ghost]'); s.value = v; s.dispatchEvent(new Event('change', {bubbles: true})); }, v);
        const {p, ctx, errs} = await open(1440, false);
        await t('navigateur : le menu calque propose l’époque d’avant, d’après et la liste des époques', async () => {
            const o = await p.$$eval('.h-hs-dlg [data-hs-floors] [data-hs-ghost] option', l => l.map(x => x.value + '|' + x.textContent));
            assert.ok(o.some(x => x.startsWith('ep:prev|🕰 Époque d’avant'))); assert.ok(o.some(x => x.startsWith('ep:next|🕰 Époque d’après')));
            assert.ok(o.includes('ep:v1|🕰 1900 · La ferme') && o.includes('ep:v3|🕰 2000 · Aujourd’hui'), o.join(' / '));
            assert.equal(await p.$eval('.h-hs-dlg [data-hs-floors] [data-hs-ghost] optgroup', g => g.label), '🕰 Choisir une époque…');
        });
        await t('navigateur : « 🕰 Époque d’avant » dessine le même étage de 1900 en sépia, sans légende tant qu’elle est éteinte', async () => {
            const before = await p.$$eval('.h-hs-dlg [data-hs-world] [stroke="#a8743a"]', l => l.length);
            await pick(p, 'ep:prev'); await p.waitForTimeout(700);
            assert.equal(await p.evaluate(() => window.__ed.house.verGhost), 'prev');
            const n = await p.$$eval('.h-hs-dlg [data-hs-world] g[opacity] [stroke="#a8743a"]', l => l.length); assert.ok(n >= 5 && n > before, `murs du fantôme : ${n}`);
            const lg = await p.$eval('.h-hs-dlg [data-hs-eplegend]', e => ({hidden: e.hidden, txt: e.textContent})); assert.equal(lg.hidden, false); assert.match(lg.txt, /1900 · La ferme/); assert.doesNotMatch(lg.txt, /ajouté/);
            assert.equal(await p.$('.h-hs-dlg [data-hs-epdiff]'), null);
        });
        await t('navigateur : la légende (interrupteur) compte 1 mur ajouté et 1 disparu', async () => {
            await p.evaluate(() => { const i = document.querySelector('.h-hs-dlg [data-hs-eplegend-on]'); i.checked = true; i.dispatchEvent(new Event('change', {bubbles: true})); }); await p.waitForTimeout(700);
            const lg = await p.$eval('.h-hs-dlg [data-hs-eplegend]', e => ({a: e.dataset.added, g: e.dataset.gone, txt: e.textContent}));
            assert.equal(lg.a, '1'); assert.equal(lg.g, '1'); assert.match(lg.txt, /― 1 mur ajouté depuis 1900/); assert.match(lg.txt, /┄ 1 mur disparu depuis 1900/);
            assert.equal(await p.$$eval('.h-hs-dlg [data-ep="added"]', l => l.length), 1); assert.equal(await p.$$eval('.h-hs-dlg [data-ep="gone"]', l => l.length), 1);
            assert.equal(await p.evaluate(() => window.__ed.house.verLegend), true);
            await shot(p, 'maison-epoque-fantome.png', '.h-hs-dlg [data-hs-stage]');
        });
        await t('navigateur : une époque choisie dans la liste, puis l’époque d’après (texte « en 2000 »)', async () => {
            await pick(p, 'ep:v1'); await p.waitForTimeout(500); assert.equal(await p.evaluate(() => window.__ed.house.verGhost), 'v1');
            await pick(p, 'ep:next'); await p.waitForTimeout(500);
            const txt = await p.$eval('.h-hs-dlg [data-hs-eplegend]', e => e.textContent); assert.match(txt, /Fantôme : 2000 · Aujourd’hui.*plus là en 2000/);
            await pick(p, 'none'); await p.waitForTimeout(400);
            assert.equal(await p.evaluate(() => window.__ed.house.verGhost), undefined); assert.equal(await p.$eval('.h-hs-dlg [data-hs-eplegend]', e => e.hidden), true);
        });
        await t('navigateur : 💾 réglages enregistrés gardent l’époque d’avant et la légende', async () => {
            await pick(p, 'ep:prev'); await p.waitForTimeout(300);
            const src = fs.readFileSync(path.join(appRoot, 'assets/js/heritage-house.js'), 'utf8'); assert.match(src, /verGhost: \['prev', 'next'\]\.includes\(H\.verGhost\)/); assert.match(src, /if \('verLegend' in d\) H\.verLegend/);
        });
        await t('navigateur : 3D — « 🕰 Autre époque » construit le fantôme (murs de 1900), éteint en visite', async () => {
            await p.evaluate(() => window.__ed.toggle3d(true)); await p.waitForTimeout(2500);
            const lb = await p.$eval('.h-hs-dlg [data-h3="epoch"]', i => !i.closest('label').hidden); assert.ok(lb, 'interrupteur visible');
            assert.equal(await p.evaluate(() => window.__ed.view3d.epochWalls()), 0);
            await p.evaluate(() => { const i = document.querySelector('.h-hs-dlg [data-h3="epoch"]'); i.checked = true; i.dispatchEvent(new Event('input', {bubbles: true})); }); await p.waitForTimeout(800);
            assert.equal(await p.evaluate(() => window.__ed.view3d.epochWalls()), 5); assert.equal(await p.evaluate(() => window.__ed.house.verGhost3d), true);
            await shot(p, 'maison-epoque-3d.png', '.h-hs-dlg [data-hs-stage]');
            await p.evaluate(() => window.__ed.view3d.startWalk()); await p.waitForTimeout(600); assert.equal(await p.evaluate(() => window.__ed.view3d.epochWalls()), 0, 'pas pendant la visite');
            await p.evaluate(() => window.__ed.view3d.stopWalk()); await p.waitForTimeout(600); assert.equal(await p.evaluate(() => window.__ed.view3d.epochWalls()), 5);
            await p.evaluate(() => window.__ed.toggle3d(false)); await p.waitForTimeout(600);
        });
        await t('navigateur : curseur des années — le fantôme montre l’époque d’avant celle affichée', async () => {
            await pick(p, 'ep:v3'); await p.waitForTimeout(300);
            await p.evaluate(() => window.__ed.setTab('house')); await p.waitForTimeout(400);
            assert.ok(await p.$('.h-hs-dlg [data-hs-plus="epghost"]'), 'interrupteur du curseur');
            await p.evaluate(() => { const r = document.querySelector('.h-hs-dlg [data-hs-plus="year"]'); r.value = '2005'; r.dispatchEvent(new Event('input', {bubbles: true})); }); await p.waitForTimeout(700);
            assert.equal(await p.evaluate(() => [window.__ed.house.ver, window.__ed.house.verGhost].join()), 'v3,prev');
            assert.match(await p.$eval('.h-hs-dlg [data-hs-eplegend]', e => e.textContent), /1950 · Agrandie/);
            await p.evaluate(() => { const r = document.querySelector('.h-hs-dlg [data-hs-plus="year"]'); r.value = '1960'; r.dispatchEvent(new Event('input', {bubbles: true})); }); await p.waitForTimeout(700);
            assert.equal(await p.evaluate(() => window.__ed.house.ver), 'v2'); assert.match(await p.$eval('.h-hs-dlg [data-hs-eplegend]', e => e.textContent), /1900 · La ferme/);
            await p.evaluate(() => { const i = document.querySelector('.h-hs-dlg [data-hs-plus="epghost"]'); i.checked = false; i.dispatchEvent(new Event('input', {bubbles: true})); }); await p.waitForTimeout(500);
            assert.equal(await p.evaluate(() => window.__ed.house.verGhost), undefined);
        });
        await t('navigateur : aucune erreur JavaScript', () => assert.deepEqual(errs, []));
        await ctx.close();
        const m = await open(390, true);
        await t('navigateur : 390 px et sombre, fantôme et légende sans débordement', async () => {
            await pick(m.p, 'ep:prev'); await m.p.evaluate(() => { window.__ed.house.verLegend = true; window.__ed.render(); }); await m.p.waitForTimeout(600);
            assert.equal(await m.p.$eval('.h-hs-dlg [data-hs-eplegend]', e => e.dataset.added), '1');
            const over = await m.p.evaluate(() => document.documentElement.scrollWidth - innerWidth); assert.ok(over <= 2, `débordement ${over}`);
            await shot(m.p, 'maison-epoque-390-sombre.png'); assert.deepEqual(m.errs, []);
        });
        await m.ctx.close();
    } finally { await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true}); }
    done();
})().catch(e => { console.error(e); process.exit(1); });
function done() { console.log(`\n${ok} réussis, ${failed} en échec`); process.exit(failed ? 1 : 0); }
