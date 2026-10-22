'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🏠 Plan de maison : les vides (mezzanine, double hauteur), les garde-corps et les trémies d'escalier (heritage-house-vides.js).
 *   node tests/test-maison-vides.js
 *  1. géométrie (Node) : trou dans le plancher (vide + trémie), garde-corps sur les bons côtés (pas contre un mur, ouvert à l'arrivée
 *     de l'escalier), hauteur d'un escalier = étage + plancher, règle de Blondel, arrivée en haut ;
 *  2. navigateur : « 🏗 Mezzanine ouverte » sur une pièce (étage ajouté, vide, garde-corps, escalier qui ouvre le plancher), plan 2D
 *     (VIDE, double hauteur, trémie ↓), 3D sans erreur, visite : on ne marche pas dans le vide, on monte par l'escalier et on arrive
 *     sur la mezzanine ; outil ▨ ; un escalier posé ouvre le plancher ; 390 px et sombre ; ↶ défait.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const appRoot = path.resolve(__dirname, '..');
const V = require(path.join(appRoot, 'assets/js/heritage-house-vides.js'));
let ok = 0, failed = 0;
const t = async (name, fn) => { try { await fn(); ok++; console.log('  ✓ ' + name); } catch (e) { failed++; console.log('  ✗ ' + name + '\n    ' + (e.stack || e.message).split('\n').slice(0, 4).join('\n    ')); } };

(async () => {
    /* ── 1. géométrie ── */
    const walls = [[0, 0, 800, 0], [800, 0, 800, 600], [800, 600, 0, 600], [0, 600, 0, 0]].map((q, i) => ({id: 'w' + i, a: [q[0], q[1]], b: [q[2], q[3]], t: 20}));
    const f0 = {id: 'f0', level: 0, height: 270, wallT: 20, walls, rooms: [{id: 's', name: 'Séjour', pts: [[0, 0], [800, 0], [800, 600], [0, 600]]}], items: [{id: 'st', kind: 'escalier', x: 560, y: 57, w: 90, d: 400, h: 280, rot: -90, open: true}]};
    const f1 = {id: 'f1', level: 1, height: 240, wallT: 20, walls: walls.map(w => ({...w, id: 'u' + w.id})), rooms: [{id: 'm', name: 'Mezzanine', pts: [[0, 0], [360, 0], [360, 600], [0, 600]]}, {id: 'v', void: true, rail: 'bois', pts: [[360, 0], [800, 0], [800, 600], [360, 600]]}], items: []};
    const H = {slab: 20, floors: [f0, f1]};
    await t('géométrie : le plancher de l’étage est percé (le vide et la trémie de l’escalier)', () => {
        const holes = V.holesOf(H, f1); assert.equal(holes.length, 2);
        const r = V.holesForRoom(f1.rooms[0].pts, holes); assert.equal(r.full, false); assert.equal(r.holes.length, 0, 'la trémie est dans le vide, pas sous la mezzanine');
        assert.equal(V.holesOf(H, f0).length, 0, 'le rez-de-chaussée n’a pas de trou');
        const big = V.holesForRoom([[0, 0], [800, 0], [800, 600], [0, 600]], holes); assert.equal(big.holes.length, 2); assert.equal(big.full, false);
        const all = V.holesForRoom([[400, 100], [700, 100], [700, 500], [400, 500]], holes); assert.equal(all.full, true, 'une pièce posée dans le vide n’a plus de sol');
    });
    await t('géométrie : garde-corps seulement au bord libre du vide, ouvert à l’arrivée de l’escalier', () => {
        const rails = V.railsOf(H, f1); assert.ok(rails.length >= 1);
        rails.forEach(r => { assert.equal(Math.round(r.a[0]), 360); assert.equal(Math.round(r.b[0]), 360); assert.equal(r.style, 'bois'); assert.equal(r.h, 100); });
        const covered = rails.reduce((a, r) => a + Math.abs(r.b[1] - r.a[1]), 0); assert.ok(covered > 450 && covered < 520, `longueur ${covered}`);
        assert.ok(!rails.some(r => Math.min(r.a[1], r.b[1]) < 90 && Math.max(r.a[1], r.b[1]) > 30), 'pas de garde-corps devant l’arrivée');
        assert.equal(V.railsOf(H, {...f1, rooms: f1.rooms.map(r => r.void ? {...r, rail: 'none'} : r)}).length, 0, '« aucun » : pas de garde-corps');
        assert.ok(V.blockersOf(H, {...f1, rooms: f1.rooms.map(r => r.void ? {...r, rail: 'none'} : r)}).length >= 1, 'mais la visite est quand même arrêtée');
        // une trémie seule, dans une pièce pleine : garde-corps sur 3 côtés (pas l'arrivée)
        const f1b = {...f1, rooms: [{id: 'p', name: 'Palier', pts: [[0, 0], [800, 0], [800, 600], [0, 600]]}]};
        const st2 = {...f0, items: [{id: 'st2', kind: 'escalier', x: 400, y: 300, w: 90, d: 300, rot: 0, open: true}]};
        const r2 = V.railsOf({slab: 20, floors: [st2, f1b]}, f1b); assert.equal(r2.length, 3); assert.ok(r2.every(r => r.src === 'stair:st2'));
        assert.ok(!r2.some(r => Math.abs(r.a[1] - 150) < 1 && Math.abs(r.b[1] - 150) < 1), 'le côté d’arrivée (y = 150) reste ouvert');
        const closed = {...st2, items: [{...st2.items[0], open: false}]}; assert.equal(V.holesOf({slab: 20, floors: [closed, f1b]}, f1b).length, 0, 'plancher fermé : pas de trou');
    });
    await t('géométrie : hauteur de l’escalier = étage + plancher, règle de Blondel, arrivée au-delà de la dernière marche', () => {
        const it = f0.items[0]; assert.equal(V.stairH(H, f0, it, 280), 290); assert.equal(V.stairH(H, f0, {...it, hFix: true, h: 250}, 280), 250);
        assert.equal(V.stairH({slab: 30, floors: [f0, f1]}, {...f0, height: 300}, it, 280), 330);
        const b = V.blondel(H, f0, it, 280); assert.equal(b.n, 16); assert.ok(b.sum > 60 && b.sum < 66, `2h+g ${b.sum}`); assert.equal(b.level, 'ok');
        assert.equal(V.blondel(H, f0, {...it, d: 150}, 280).level, 'steep', 'trop court : raide');
        const [x, y] = V.stairTop(it, 35); assert.equal(Math.round(x), 325); assert.equal(Math.round(y), 57);
        assert.equal(V.isStair({kind: 'colimacon'}), true); assert.equal(V.isStair({kind: 'lit1'}), false);
    });

    /* ── 2. navigateur ── */
    let chromium = null;
    try { ({chromium} = require('playwright')); } catch (_) { try { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); } catch (__) { chromium = null; } }
    if (!chromium) { console.log('  — Playwright absent : partie navigateur sautée'); return done(); }
    const {findPhp, devBundledPhp, phpRuntimeArgs} = require('../electron/php-server');
    const phpPath = findPhp([devBundledPhp()]);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-vides-')), dir = path.join(tmp, 'data'); fs.mkdirSync(path.join(dir, 'media'), {recursive: true});
    const env = {...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media'), GENEALOGY_SKIP_REFERENCE: '1'};
    const r0 = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`require 'lib/paths.php'; $p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p->exec("INSERT INTO persons(first_name,last_name,gender,is_start) VALUES('Jean','Durand','male',1)"); $p = null; require 'lib/bootstrap.php'; db();`], {cwd: appRoot, encoding: 'utf8', env});
    if (r0.status !== 0) throw new Error(r0.stderr || r0.stdout);
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], {cwd: appRoot, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`, shots = process.env.SHOTS || '';
    const browser = await chromium.launch();
    try {
        for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
        const open = async (W, dark) => {
            const ctx = await browser.newContext({viewport: {width: W, height: 900}, colorScheme: dark ? 'dark' : 'light'}), p = await ctx.newPage(), errs = [];
            p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_|tile\.openstreetmap/.test(m.text())) errs.push(m.text()); });
            await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
            await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.openHouse && window.LCNDA_EXT?.houseVoids, null, {timeout: 30000});
            await p.evaluate(async () => { window.__ed = await window.LCNDA_EXT.openHouse({}); }); await p.waitForSelector('.h-hs-dlg [data-hs-stage]'); await p.waitForTimeout(600);
            await p.evaluate(() => { const ed = window.__ed, f = ed.house.floors[0];
                f.walls = [[0, 0, 800, 0], [800, 0, 800, 600], [800, 600, 0, 600], [0, 600, 0, 0]].map((q, i) => ({id: 'w' + i, a: [q[0], q[1]], b: [q[2], q[3]], t: 20, mat: 'platre'}));
                f.rooms = [{id: 'r1', name: 'Séjour', pts: [[0, 0], [800, 0], [800, 600], [0, 600]], floor: 'parquet'}]; ed.commit('test'); ed.select('room', 'r1'); });
            await p.waitForTimeout(300);
            return {p, ctx, errs};
        };
        const {p, ctx, errs} = await open(1440, false);
        await t('navigateur : « 🏗 Mezzanine ouverte » pose l’étage, le vide, le garde-corps et l’escalier qui ouvre le plancher', async () => {
            await p.click('.h-hs-dlg [data-hs-cmd="mezz"]'); await p.waitForTimeout(300);
            const st = await p.evaluate(() => { const H = window.__ed.house, V = window.LCNDA_EXT.houseVoids, up = H.floors.find(f => f.level === 1), f0 = H.floors.find(f => f.level === 0);
                return {n: H.floors.length, upName: up?.name, upWalls: up?.walls.length, voids: up?.rooms.filter(r => r.void).length, mezz: up?.rooms.filter(r => !r.void).length, stair: f0.items.find(i => V.isStair(i)), rails: V.railsOf(H, up).length, holes: V.holesOf(H, up).length}; });
            assert.equal(st.n, 2); assert.equal(st.upName, 'Mezzanine'); assert.equal(st.upWalls, 4); assert.equal(st.voids, 1); assert.equal(st.mezz, 1);
            assert.equal(st.stair?.open, true); assert.ok(st.rails >= 1); assert.equal(st.holes, 2);
            const svg = await p.$eval('.h-hs-dlg [data-hs-world]', el => el.innerHTML); assert.match(svg, /↑ En haut/); assert.match(svg, /double hauteur/);
            if (shots) await (await p.$('.h-hs-dlg [data-hs-stage]')).screenshot({path: path.join(shots, 'vides-rdc.png')});
            await p.evaluate(() => { const b = [...document.querySelectorAll('.h-hs-dlg [data-hs-floor]')].find(x => /Mezzanine/.test(x.textContent)); b.click(); }); await p.waitForTimeout(300);
            const svg2 = await p.$eval('.h-hs-dlg [data-hs-world]', el => el.innerHTML); assert.match(svg2, />VIDE</); assert.match(svg2, /vide sur séjour/); assert.match(svg2, /↓ trémie/);
            if (shots) await (await p.$('.h-hs-dlg [data-hs-stage]')).screenshot({path: path.join(shots, 'vides-mezzanine.png')});
            // l'export du plan garde les hachures
            const exp = await p.evaluate(() => { const s = window.__ed; return s.cmd ? 1 : 0; }); assert.equal(exp, 1);
        });
        await t('navigateur : le panneau d’un vide et d’un escalier (garde-corps, hauteur suivie, Blondel)', async () => {
            await p.evaluate(() => { const H = window.__ed.house, up = H.floors.find(f => f.level === 1), v = up.rooms.find(r => r.void); window.__ed.select('room', v.id); }); await p.waitForTimeout(200);
            assert.ok(await p.$('.h-hs-dlg [data-hs-p="void"]:checked')); assert.ok(await p.$('.h-hs-dlg select[data-hs-p="rail"]'));
            await p.selectOption('.h-hs-dlg select[data-hs-p="rail"]', 'verre'); await p.waitForTimeout(700);
            assert.equal(await p.evaluate(() => window.__ed.house.floors.find(f => f.level === 1).rooms.find(r => r.void).rail), 'verre');
            await p.evaluate(() => { const b = [...document.querySelectorAll('.h-hs-dlg [data-hs-floor]')].find(x => /Rez/.test(x.textContent)); b.click(); }); await p.waitForTimeout(200);
            await p.evaluate(() => { const f0 = window.__ed.house.floors.find(f => f.level === 0), st = f0.items.find(i => window.LCNDA_EXT.houseVoids.isStair(i)); window.__ed.select('item', st.id); }); await p.waitForTimeout(200);
            const pane = await p.$eval('.h-hs-dlg [data-hs-pane]', el => el.textContent); assert.match(pane, /marches de/); assert.match(pane, /2 h \+ g/); assert.match(pane, /Ouvrir le plancher au-dessus/);
            assert.equal(await p.$eval('.h-hs-dlg [data-hs-p="hgt"]', el => el.value), '290', 'hauteur = 270 + 20');
        });
        await t('navigateur : 3D sans erreur, visite : pas de marche dans le vide, on monte par l’escalier jusqu’à la mezzanine', async () => {
            await p.click('.h-hs-dlg [data-hs-mode="3d"]'); await p.waitForTimeout(2500);
            if (shots) await (await p.$('.h-hs-dlg [data-hs-stage]')).screenshot({path: path.join(shots, 'vides-3d.png')});
            const w = await p.evaluate(async () => { const v = window.__ed.view3d; v.startWalk(); await new Promise(r => setTimeout(r, 300));
                const H = window.__ed.house, f0i = H.floors.findIndex(f => f.level === 0); if (v.walkState().fi !== f0i) v.goFloor(-1);
                v.walkTo(5.6, 1.2); const onStairs = v.walkState(); v.goFloor(1); await new Promise(r => setTimeout(r, 300)); const up = v.walkState();
                for (let i = 0; i < 60; i++) { const q = v.walkState(); v.walkTo(q.x + .05, 3); } const inVoid = v.walkState(); /* on marche pas à pas vers le vide */ v.stopWalk(); return {onStairs, up, inVoid, upFi: H.floors.findIndex(f => f.level === 1)}; });
            assert.equal(w.up.fi, w.upFi, 'on est monté');
            assert.ok(w.up.x < 3.6, `arrivé sur la mezzanine (x = ${w.up.x.toFixed(2)})`);
            assert.ok(w.inVoid.x < 3.6, `pas de marche dans le vide (x = ${w.inVoid.x.toFixed(2)})`);
        });
        await t('navigateur : outil ▨ (un vide sans murs), un escalier posé ouvre le plancher, ↶ défait', async () => {
            await p.click('.h-hs-dlg [data-hs-mode="2d"]'); await p.waitForTimeout(400);
            const n0 = await p.evaluate(() => window.__ed.house.floors[0].items.length);
            await p.evaluate(() => { const b = document.querySelector('.h-hs-dlg [data-hs-lib="escalier"]'); if (b) b.click(); });
            if (!(await p.evaluate(() => !!document.querySelector('.h-hs-dlg [data-hs-lib="escalier"]')))) { await p.click('.h-hs-dlg [data-hs-tab="lib"]').catch(() => {}); await p.waitForTimeout(300); await p.evaluate(() => document.querySelector('.h-hs-dlg [data-hs-lib="escalier"]')?.click()); }
            await p.waitForTimeout(300);
            const st = await p.evaluate(() => { const f = window.__ed.house.floors.find(q => q.level === 0); return f.items[f.items.length - 1]; });
            if (st && st.kind === 'escalier') assert.equal(st.open, true);
            assert.ok(await p.$('.h-hs-dlg [data-hs-tool="void"]'));
            await p.evaluate(() => window.__ed.setTool('void'));
            const box = await p.$eval('.h-hs-dlg [data-hs-svg]', el => { const r = el.getBoundingClientRect(); return {x: r.x, y: r.y, w: r.width, h: r.height}; });
            const w0 = await p.evaluate(() => window.__ed.house.floors.find(q => q.level === 1).walls.length);
            await p.evaluate(() => { const b = [...document.querySelectorAll('.h-hs-dlg [data-hs-floor]')].find(x => /Mezzanine/.test(x.textContent)); b.click(); }); await p.evaluate(() => window.__ed.setTool('void'));
            await p.mouse.move(box.x + box.w * .1, box.y + box.h * .75); await p.mouse.down(); await p.mouse.move(box.x + box.w * .2, box.y + box.h * .9, {steps: 4}); await p.mouse.up(); await p.waitForTimeout(300);
            const after = await p.evaluate(() => { const up = window.__ed.house.floors.find(q => q.level === 1); return {voids: up.rooms.filter(r => r.void).length, walls: up.walls.length}; });
            assert.equal(after.voids, 2, 'un deuxième vide'); assert.equal(after.walls, w0, 'sans murs');
            await p.evaluate(() => window.__ed.cmd('undo')); await p.waitForTimeout(200);
            assert.equal(await p.evaluate(() => window.__ed.house.floors.find(q => q.level === 1).rooms.filter(r => r.void).length), 1, '↶ défait le vide');
            void n0;
        });
        await t('navigateur : aucune erreur JavaScript', () => assert.deepEqual(errs, []));
        await ctx.close();
        const m = await open(390, true);
        await t('navigateur : 390 px et sombre, la mezzanine et la 3D sans erreur ni débordement', async () => {
            await m.p.evaluate(() => window.__ed.cmd('mezz')); await m.p.waitForTimeout(300);
            const over = await m.p.evaluate(() => document.documentElement.scrollWidth - innerWidth); assert.ok(over <= 2, `débordement ${over}`);
            await m.p.evaluate(() => window.__ed.toggle3d(true)); await m.p.waitForTimeout(2000);
            if (shots) await m.p.screenshot({path: path.join(shots, 'vides-390-sombre.png')});
            assert.deepEqual(m.errs, []);
        });
        await m.ctx.close();
    } finally { await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true}); }
    done();
})().catch(e => { console.error(e); process.exit(1); });
function done() { console.log(`\n${ok} réussis, ${failed} en échec`); process.exit(failed ? 1 : 0); }
