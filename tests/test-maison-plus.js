'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🏠 Plan de maison : les outils en plus (heritage-house-plus.js) — M1 à M14.
 *   node tests/test-maison-plus.js          (SHOTS=dossier pour garder les captures)
 *  1. calculs (Node) : combles (hauteur sous la pente, loi Carrez), toit par aile (maison en L), murs courbes, vérifier le plan,
 *     coupe, tableau des surfaces (Tableur), copie à partager sans personnes ni souvenirs, époque d'une année ;
 *  2. navigateur : lucarnes et fenêtres de toit, gouttières, combles, mur courbe, personnes d'une pièce (rôle, années) gardées à
 *     l'enregistrement, surfaces et Tableur, vérifier (clic = aller à l'objet), ligne de coupe tracée sur le plan, curseur des années,
 *     arrêts de la visite guidée et lecture, photo d'époque comparée, carte de la pièce en visite, hameau, fichier à partager ouvert
 *     sans l'app (lecture seule, CSP), 🏠 La maison du mode simple (aucun envoi au serveur), 390 px et sombre.
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
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

(async () => {
    /* ── 1. calculs ── */
    const rect = [[0, 0, 1000, 0], [1000, 0, 1000, 600], [1000, 600, 0, 600], [0, 600, 0, 0]];
    const f0 = {id: 'a', name: 'Rez-de-chaussée', level: 0, height: 250, walls: W(rect), rooms: [{id: 'r', name: 'Séjour', pts: [[0, 0], [1000, 0], [1000, 600], [0, 600]]}], openings: [], items: []};
    const f1 = {id: 'b', name: 'Combles', level: 1, height: 260, attic: true, knee: 100, walls: W(rect), rooms: [{id: 'c', name: 'Chambre', pts: [[0, 0], [1000, 0], [1000, 600], [0, 600]]}], openings: [], items: []};
    const H = {slab: 20, floors: [f0, f1], roof: {on: true, shape: 'gable', pitch: 45}};
    await t('calculs : combles — hauteur sous la pente, surface loi Carrez (1,80 m et plus)', () => {
        assert.equal(P.heightAt(H, f1, [500, 0]), 100); assert.equal(P.heightAt(H, f1, [500, 80]), 180); assert.equal(P.heightAt(H, f1, [500, 300]), 260, 'plafonné à la hauteur de l’étage');
        assert.equal(P.heightAt(H, f0, [500, 0]), 250, 'le rez-de-chaussée n’est pas sous le toit');
        const s = P.surfaces(H); assert.equal(s.floors[1].area, 600000); assert.ok(Math.abs(s.floors[1].carrez - 440000) < 2000, `Carrez ${s.floors[1].carrez}`); assert.equal(s.floors[0].carrez, 600000);
        assert.equal(P.atticOf({...H, roof: {on: true, shape: 'flat'}}, f1), null, 'toit plat : pas de combles'); assert.equal(P.atticOf(H, {...f1, attic: false}), null);
        assert.ok(P.lowZones(H, f1).length > 0, 'les bandes de moins de 1,80 m');
    });
    await t('calculs : maison en L — un toit par aile, la petite prolongée jusqu’au faîtage de la grande', () => {
        const L = [[0, 0, 1000, 0], [1000, 0, 1000, 1000], [1000, 1000, 600, 1000], [600, 1000, 600, 600], [600, 600, 0, 600], [0, 600, 0, 0]];
        const fl = {id: 'l', level: 0, height: 250, walls: W(L), rooms: [{id: 'x', pts: [[0, 0], [1000, 0], [1000, 600], [0, 600]]}, {id: 'y', pts: [[600, 600], [1000, 600], [1000, 1000], [600, 1000]]}]};
        const w = P.roofWings(fl, 20, {floors: [fl]}); assert.equal(w.length, 2); assert.deepEqual(w[0], {x0: 0, x1: 1000, y0: 0, y1: 600});
        assert.equal(w[1].x0, 600); assert.equal(w[1].x1, 1000); assert.equal(w[1].y1, 1000); assert.equal(w[1].y0, 300, 'jusqu’au faîtage');
        assert.equal(P.roofWings(f0, 20, H).length, 1, 'un rectangle : un seul toit');
    });
    await t('calculs : mur courbe (flèche) — même courbe en 2D et en 3D', () => {
        const w = {a: [0, 0], b: [400, 0], bulge: 100}; assert.match(P.wallD(w), /Q200 200 400 0/); assert.ok(P.arcLen(w) > 440 && P.arcLen(w) < 480);
        assert.deepEqual(P.bez(w, .5), [200, 100]); assert.equal(P.wallD({a: [0, 0], b: [400, 0]}), 'M0 0L400 0'); assert.equal(P.bulgeOf({a: [0, 0], b: [100, 0], bulge: 900}), 50, 'bornée');
    });
    await t('calculs : vérifier le plan (porte trop large, fenêtre coupée par le plancher, pièce sans porte, escalier raide ou fermé)', () => {
        const fa = JSON.parse(JSON.stringify(f0)); fa.openings = [{id: 'd', type: 'door', wall: 'w0', pos: .5, w: 1200, h: 210}, {id: 'f', type: 'window', wall: 'w1', pos: .5, w: 100, h: 200, sill: 120}];
        fa.items = [{id: 's', kind: 'escalier', x: 300, y: 300, w: 90, d: 150, h: 270}];
        const l = P.checks({slab: 20, floors: [fa, JSON.parse(JSON.stringify(f1))]}), txt = l.map(x => `${x.level} ${x.text}`).join('\n');
        assert.match(txt, /red .*plus large que son mur/); assert.match(txt, /orange .*dépasse le plafond/); assert.match(txt, /orange Escalier un peu raide/);
        assert.match(txt, /yellow .*ne perce pas le plancher/); assert.match(txt, /yellow « Chambre » n’a pas de porte/); assert.equal(l[0].level, 'red', 'le plus grave d’abord');
        assert.ok(l.every(x => x.fid), 'chaque ligne sait où aller');
    });
    await t('calculs : coupe (murs, planchers hachurés, toit), tableau des surfaces, copie à partager, époque d’une année', () => {
        const svg = P.sectionSvg(H, {a: [500, -100], b: [500, 700]}, {title: 'Ma maison'}); assert.match(svg, /^<svg /); assert.match(svg, /cuthatch/); assert.match(svg, /#8a4b3a/); assert.match(svg, /Combles/);
        assert.equal(P.sectionSvg(H, null), null);
        const wb = P.surfacesWorkbook(H, 'x'), c = wb.sheets[0].cells; assert.equal(c.B2.v, 'Séjour'); assert.equal(c.D3.v, 44); assert.match(String(c.D5.v), /^=SOMME\(D2:D3\)$/);
        const h = {...H, meta: {people: [{id: 1, label: 'Jean'}], note: 'privé', census: [{id: 3}]}, floors: [{...f0, rooms: [{...f0.rooms[0], people: [{id: 1}], note: 'n', mem: [{type: 'person', id: 1}]}], items: [{id: 'i', mem: [1], note: 'x'}]}], site: [{id: 2}], oldPhotos: [{src: 'media/a.jpg'}], ref: {src: 'media/p.jpg'}};
        const st = JSON.stringify(P.stripHouse(h)); assert.doesNotMatch(st, /Jean|privé|"mem"|"people"|census|oldPhotos|media\//);
        const hv = {versions: [{id: 'v1', date: '1850'}, {id: 'v2', date: 'vers 1900'}, {id: 'v3', date: '1936'}]};
        assert.equal(P.versionForYear(hv, 1910).id, 'v2'); assert.equal(P.versionForYear(hv, 1800).id, 'v1'); assert.equal(P.versionForYear(hv, 2000).id, 'v3');
    });

    /* ── 2. navigateur ── */
    let chromium = null;
    try { ({chromium} = require('playwright')); } catch (_) { try { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); } catch (__) { chromium = null; } }
    if (!chromium) { console.log('  — Playwright absent : partie navigateur sautée'); return done(); }
    const {findPhp, devBundledPhp, phpRuntimeArgs} = require('../electron/php-server');
    const phpPath = findPhp([devBundledPhp()]);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-maisonplus-')), dir = path.join(tmp, 'data'); fs.mkdirSync(path.join(dir, 'media'), {recursive: true});
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
            const ctx = await browser.newContext({viewport: {width: W2, height: 900}, colorScheme: dark ? 'dark' : 'light'}), p = await ctx.newPage(), errs = [], posts = [];
            p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_|tile\.openstreetmap/.test(m.text())) errs.push(m.text()); });
            p.on('request', r => { if (r.method() === 'POST') posts.push(r.url()); });
            await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
            await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.openHouse && window.LCNDA_EXT?.housePlus, null, {timeout: 30000});
            return {p, ctx, errs, posts};
        };
        const {p, ctx, errs, posts} = await open(1440, false);
        // la grange voisine (une autre maison de la liste)
        const barn = await p.evaluate(async () => { const f = {id: 'g0', name: 'Rez-de-chaussée', level: 0, height: 300, wallT: 30, walls: [[0, 0, 900, 0], [900, 0, 900, 600], [900, 600, 0, 600], [0, 600, 0, 0]].map((q, i) => ({id: 'g' + i, a: [q[0], q[1]], b: [q[2], q[3]], t: 30})), rooms: [], items: [], openings: [], dims: [], labels: []};
            const r = await window.LCNDA_APP.api('save_house', {}, {method: 'POST', body: {id: 0, name: 'La grange', house: {slab: 20, floors: [f], roof: {on: true, shape: 'gable', pitch: 45}}}}); return r.id || r.result?.id; });
        assert.ok(barn > 0, 'grange enregistrée');
        await p.evaluate(async () => { window.__ed = await window.LCNDA_EXT.openHouse({}); }); await p.waitForSelector('.h-hs-dlg [data-hs-stage]'); await p.waitForTimeout(500);
        await p.evaluate(barn => { const ed = window.__ed, H2 = ed.house, f = H2.floors[0], w = q => q.map((r, i) => ({id: 'w' + i, a: [r[0], r[1]], b: [r[2], r[3]], t: 30, mat: 'pierre'}));
            f.height = 260; f.walls = w([[0, 0, 1000, 0], [1000, 0, 1000, 1000], [1000, 1000, 600, 1000], [600, 1000, 600, 600], [600, 600, 0, 600], [0, 600, 0, 0]]);
            f.rooms = [{id: 'r1', name: 'Salle commune', pts: [[0, 0], [600, 0], [600, 600], [0, 600]], floor: 'tomettes', note: 'Souvenir très privé 42'}, {id: 'r2', name: 'Cuisine', pts: [[600, 0], [1000, 0], [1000, 1000], [600, 1000]], floor: 'tomettes'}];
            f.openings = [{id: 'o1', type: 'door', wall: 'w0', pos: .3, w: 90, h: 210}]; f.items = [{id: 's1', kind: 'escalier', x: 300, y: 450, w: 90, d: 300, rot: 0, open: true}];
            H2.floors.push({id: 'fc', name: 'Combles', level: 1, height: 260, wallT: 30, walls: JSON.parse(JSON.stringify(f.walls)).map(q => ({...q, id: 'c' + q.id})), rooms: [{id: 'r3', name: 'Chambre', pts: [[0, 0], [600, 0], [600, 600], [0, 600]]}], items: [], openings: [], dims: [], labels: []});
            H2.roof = {on: true, shape: 'gable', pitch: 45, over: 35}; H2.site = [{id: barn, name: 'La grange', dx: 1500, dy: 0, rot: 0}]; ed.commit('test'); }, barn);

        const blur = () => p.evaluate(() => document.activeElement?.blur?.()); // un champ en cours de frappe garde le panneau tel quel
        const openAll = () => p.evaluate(() => document.querySelectorAll('.h-hs-dlg [data-hs-pane] details').forEach(d => { d.open = true; }));
        await t('navigateur : toit — gouttières, un toit par aile, ＋ Fenêtre de toit / Lucarne / Chien-assis (réglables, × et ↶)', async () => {
            await p.evaluate(() => { const ed = window.__ed; ed.setTab('floor'); });
            await p.evaluate(() => { const d = document.querySelector('.h-hs-dlg [data-ui-section="hs-fl-roof"]'); if (d) d.open = true; }); await p.waitForTimeout(100);
            for (const k of ['gutter', 'wings']) { await p.evaluate(k => { const i = document.querySelector(`.h-hs-dlg [data-hs-roof="${k}"]`); i.checked = true; i.dispatchEvent(new Event('input', {bubbles: true})); }, k); await p.waitForTimeout(650); }
            for (const k of ['velux', 'dormer', 'shed']) { await p.click(`.h-hs-dlg [data-hs-cmd="roofit:${k}"]`); await p.waitForTimeout(150); }
            let r = await p.evaluate(() => window.__ed.house.roof); assert.equal(r.gutter, true); assert.equal(r.wings, true); assert.deepEqual(r.items.map(x => x.type), ['velux', 'dormer', 'shed']);
            await p.selectOption('.h-hs-dlg [data-hs-rit="1:side"]', 'b'); await p.waitForTimeout(650);
            assert.equal(await p.evaluate(() => window.__ed.house.roof.items[1].side), 'b');
            assert.equal(await p.$$eval('.h-hs-dlg [data-hs-rit$=":wing"]', l => l.length), 3, 'le choix de l’aile (maison en L)');
            await p.click('.h-hs-dlg [data-hs-cmd="roofitdel:2"]'); await p.waitForTimeout(150); assert.equal(await p.evaluate(() => window.__ed.house.roof.items.length), 2);
            await p.evaluate(() => window.__ed.cmd('undo')); await p.waitForTimeout(150); assert.equal(await p.evaluate(() => window.__ed.house.roof.items.length), 3, '↶ le remet');
        });
        await t('navigateur : combles — la case, la hauteur des murs bas, la surface loi Carrez et les zones basses sur le plan', async () => {
            await p.evaluate(() => { const b = [...document.querySelectorAll('.h-hs-dlg [data-hs-floor]')].find(x => /Combles/.test(x.textContent)); b.click(); window.__ed.setTab('floor'); }); await p.waitForTimeout(200);
            await p.evaluate(() => { const i = document.querySelector('.h-hs-dlg [data-hs-f="attic"]'); i.checked = true; i.dispatchEvent(new Event('input', {bubbles: true})); }); await p.waitForTimeout(700);
            await p.fill('.h-hs-dlg [data-hs-f="knee"]', '80'); await p.waitForTimeout(700);
            const st = await p.evaluate(() => ({f: window.__ed.house.floors.find(q => q.id === 'fc'), txt: document.querySelector('.h-hs-dlg [data-hs-pane]').textContent, svg: document.querySelector('.h-hs-dlg [data-hs-world]').innerHTML}));
            assert.equal(st.f.attic, true); assert.equal(st.f.knee, 80); assert.match(st.txt, /loi Carrez/); assert.match(st.svg, /Moins de 1,80 m/); assert.match(st.svg, /m² Carrez/);
            await shot(p, 'maison-combles-plan.png', '.h-hs-dlg [data-hs-stage]');
        });
        await t('navigateur : mur courbe — dessiné en arc, le sol de la pièce suit la courbe, cote en longueur d’arc et flèche, fenêtre posée sur la courbe', async () => {
            await blur();
            await p.evaluate(() => { const b = [...document.querySelectorAll('.h-hs-dlg [data-hs-floor]')].find(x => /Rez/.test(x.textContent)); b.click(); window.__ed.select('wall', 'w1'); }); await p.waitForTimeout(200); await openAll();
            await p.fill('.h-hs-dlg [data-hs-p="bulge"]', '-80'); await p.waitForTimeout(700);
            assert.equal(await p.evaluate(() => window.__ed.house.floors[0].walls.find(w => w.id === 'w1').bulge), -80);
            assert.match(await p.$eval('.h-hs-dlg [data-hs="wall:w1"]', el => el.getAttribute('d')), /Q/);
            await p.evaluate(() => { const f = window.__ed.house.floors[0]; f.openings.push({id: 'oc', type: 'window', wall: 'w1', pos: .3, w: 100, h: 120, sill: 90}); f.showDims = true; window.__ed.commit('f'); }); await p.waitForTimeout(200);
            const pl = await p.$eval('.h-hs-dlg [data-hs-world]', el => ({room: el.querySelector('[data-hs="room:r2"] path').getAttribute('d'), txt: el.textContent, op: el.querySelector('[data-hs="opening:oc"]')?.getAttribute('transform')}));
            assert.ok(pl.room.split('L').length > 8, 'le sol suit la courbe'); assert.match(pl.txt, /⌒ .* · flèche 80 cm/); await shot(p, 'maison-mur-courbe.png', '.h-hs-dlg [data-hs-stage]');
            const [, ox] = pl.op.match(/translate\(([-\d.]+)/); assert.ok(Number(ox) > 1010, `la fenêtre est sur la courbe (${ox})`);
            const sec = await p.evaluate(() => window.LCNDA_EXT.housePlus.sectionSvg(window.__ed.house, {a: [-100, 300], b: [1300, 300]})); assert.match(sec, /#bcd8e8/, 'la fenêtre du mur courbe dans la coupe');
        });
        await t('navigateur : les personnes d’une pièce — menu de choix à rôles (principales / secondaires), anciens rôles repris, années gardées', async () => {
            await blur();
            await p.evaluate(() => { const rm = window.__ed.house.floors[0].rooms[0]; rm.people = [{id: 1, label: 'Marie Durand', role: 'née ici, sa chambre'}]; window.__ed.commit('p'); window.__ed.select('room', 'r1'); }); await p.waitForTimeout(200); await openAll();
            const pk = await p.$eval('.h-hs-dlg [data-hs-rpk] .pk', el => ({roles: el.classList.contains('pk-roles'), txt: el.textContent, val: el.dataset.pkValue}));
            assert.equal(pk.roles, true, 'le modèle à rôles'); assert.match(pk.txt, /Marie Durand/); assert.match(pk.val, /née ici, sa chambre/, 'l’ancien rôle texte est repris'); assert.match(pk.val, /"primary":true/, 'une ancienne personne devient principale');
            await p.fill('.h-hs-dlg [data-hs-rpyears="0"]', '1890 – 1925'); await p.waitForTimeout(700); await blur();
            await p.$eval('.h-hs-dlg [data-hs-rpk] .pk', el => el.dispatchEvent(new CustomEvent('picker-change', {bubbles: true, detail: {items: {main: null, people: [{kind: 'person', id: 1, title: 'Marie Durand', role: 'née ici, sa chambre', primary: true}, {kind: 'person', id: null, title: 'le curé Lafon', free: true, role: 'témoin', primary: false}]}}})));
            await p.waitForTimeout(300);
            const ppl = await p.evaluate(() => window.__ed.house.floors[0].rooms[0].people); assert.equal(ppl.length, 2); assert.equal(ppl[0].years, '1890 – 1925', 'les années restent'); assert.equal(ppl[1].free, true); assert.equal(ppl[1].primary, false); assert.equal(ppl[1].role, 'témoin');
            await p.evaluate(() => { const rm = window.__ed.house.floors[0].rooms[0]; rm.people = rm.people.slice(0, 1); window.__ed.commit('p'); });
            await p.evaluate(() => window.__ed.save()); await p.waitForTimeout(800);
            const id = await p.evaluate(async () => { const r = await window.LCNDA_APP.api('houses'); return r.items.find(h => h.name === 'Maison de famille')?.id; });
            const back = await p.evaluate(async id => (await window.LCNDA_APP.api('house', {id})).house.floors[0].rooms[0].people[0], id);
            assert.equal(back.role, 'née ici, sa chambre'); assert.equal(back.years, '1890 – 1925');
            await p.evaluate(async id => { window.__ed2 = await window.LCNDA_EXT.openHouse({id}); }, id); await p.waitForTimeout(600);
            assert.equal(await p.evaluate(() => window.__ed2.house.floors[0].rooms[0].people[0].role), 'née ici, sa chambre', 'relu par l’éditeur');
            await p.evaluate(() => { window.__ed2.cmd('close'); }); await p.waitForTimeout(300);
        });
        await t('navigateur : 🧰 surfaces (et 🧮 Tableur), ⚠️ vérifier (clic = aller à l’objet), ✂ ligne de coupe tracée sur le plan', async () => {
            await blur();
            await p.evaluate(() => window.__ed.setTab('house')); await p.waitForTimeout(200); await openAll();
            assert.ok(await p.$('.h-hs-dlg [data-hs-cmd="plus:surfaces"]'), await p.$eval('.h-hs-dlg [data-hs-pane]', el => el.textContent.slice(0, 400)));
            await p.click('.h-hs-dlg [data-hs-cmd="plus:surfaces"]'); await p.waitForTimeout(300);
            const dlgTxt = await p.evaluate(() => [...document.querySelectorAll('dialog[open]')].pop().textContent); assert.match(dlgTxt, /Loi Carrez/); assert.match(dlgTxt, /Chambre/);
            await p.evaluate(() => [...document.querySelectorAll('dialog[open]')].pop().querySelector('[data-hs-plus-sheet]').click()); await p.waitForTimeout(1200);
            assert.ok(await p.evaluate(() => [...document.querySelectorAll('dialog[open], .tb-root, [class*="tableur"]')].some(d => /Surfaces/.test(d.textContent))), 'le Tableur s’ouvre');
            await p.keyboard.press('Escape'); await p.waitForTimeout(200); await p.evaluate(() => document.querySelectorAll('dialog[open]:not(.h-hs-dlg)').forEach(d => d.close())); await p.waitForTimeout(200);
            await p.evaluate(() => window.__ed.setTab('house')); await p.waitForTimeout(150);
            await p.click('.h-hs-dlg [data-hs-cmd="plus:check"]'); await p.waitForTimeout(300);
            const n = await p.$$eval('dialog[open] [data-hs-plus-go]', l => l.map(b => b.textContent)); assert.ok(n.some(x => /Cuisine.*n’a pas de porte/.test(x)), n.join(' | '));
            const i = n.findIndex(x => /Cuisine/.test(x)); await p.click(`dialog[open] [data-hs-plus-go="${i}"]`); await p.waitForTimeout(300);
            assert.match(await p.$eval('.h-hs-dlg [data-hs-world]', el => el.innerHTML), /data-hs="room:r2" class="h-hs-room is-sel"/, 'la pièce est choisie');
            await p.evaluate(() => window.__ed.setTab('house')); await p.waitForTimeout(150);
            await p.click('.h-hs-dlg [data-hs-cmd="plus:cutline"]'); await p.waitForTimeout(150);
            const b = await p.$eval('.h-hs-dlg [data-hs-svg]', el => { const r = el.getBoundingClientRect(); return {x: r.x, y: r.y, w: r.width, h: r.height}; });
            await p.mouse.click(b.x + b.w * .5, b.y + b.h * .1); await p.waitForTimeout(100); await p.mouse.click(b.x + b.w * .5, b.y + b.h * .9); await p.waitForTimeout(500);
            assert.ok(await p.evaluate(() => !!window.__ed.house.cut?.b), 'la ligne de coupe est gardée');
            const cut = await p.evaluate(() => [...document.querySelectorAll('dialog[open]')].pop().innerHTML); assert.match(cut, /Coupe de la maison/); assert.match(cut, /<svg/); assert.match(cut, /Imprimer/);
            await shot(p, 'maison-coupe.png');
            await p.evaluate(() => [...document.querySelectorAll('dialog[open]')].pop().querySelector('.modal-actions button, [type=submit]')?.click()); await p.waitForTimeout(200);
            assert.match(await p.$eval('.h-hs-dlg [data-hs-world]', el => el.innerHTML), /h-hs-cutline/, 'tracée sur le plan');
        });
        await t('navigateur : 🕰 le curseur des années change d’époque (plan et 3D)', async () => {
            await blur();
            await p.evaluate(() => { const H2 = window.__ed.house; H2.versions = [{id: 'v1', label: 'Avant', date: '1850'}, {id: 'v2', label: 'Après', date: '1920', floors: JSON.parse(JSON.stringify(H2.floors)).slice(0, 1)}]; H2.ver = 'v1'; window.__ed.commit('v'); window.__ed.setTab('house'); }); await p.waitForTimeout(250);
            await p.$eval('.h-hs-dlg [data-hs-plus="year"]', el => { el.value = '1930'; el.dispatchEvent(new Event('input', {bubbles: true})); }); await p.waitForTimeout(250);
            assert.equal(await p.evaluate(() => window.__ed.house.ver), 'v2');
            await p.evaluate(() => window.__ed.switchVer('v1', true)); await p.evaluate(() => { window.__ed.house.versions = []; delete window.__ed.house.ver; window.__ed.commit('v'); });
        });
        await t('navigateur : 3D sans erreur (lucarnes, gouttières, combles, voisin) ; visite : carte de la pièce, arrêt de la visite guidée, photo d’époque', async () => {
            await p.evaluate(() => { const b = [...document.querySelectorAll('.h-hs-dlg [data-hs-floor]')].find(x => /Combles/.test(x.textContent)); b.click(); }); await p.waitForTimeout(150);
            await p.evaluate(() => window.__ed.toggle3d(true)); await p.waitForTimeout(2500);
            await p.evaluate(() => { const r = document.querySelector('.h-hs-dlg [data-h3="roof"]'); if (r && !r.checked) r.click(); }); await p.waitForTimeout(1500);
            await shot(p, 'maison-3d-toit.png', '.h-hs-dlg [data-hs-stage]');
            await p.evaluate(() => { const v = window.__ed.view3d; v.orbit(2.3, -.3); v.zoomBy(1.8); }); await p.waitForTimeout(800); await shot(p, 'maison-3d-hameau.png', '.h-hs-dlg [data-hs-stage]');
            await p.evaluate(() => { const b = [...document.querySelectorAll('.h-hs-dlg [data-hs-floor]')].find(x => /Rez/.test(x.textContent)); b.click(); }); await p.waitForTimeout(300);
            await p.evaluate(() => { window.__ed.house.floors[0].rooms[0].people = [{id: 1, label: 'Marie Durand', role: 'née ici', years: '1890'}]; window.__ed.view3d.startWalk(); }); await p.waitForTimeout(300);
            await p.evaluate(() => window.__ed.view3d.walkTo(8, 5)); await p.waitForTimeout(400); await p.evaluate(() => window.__ed.view3d.walkTo(1.5, 1.5)); await p.waitForTimeout(500);
            const card = await p.$eval('.h-hs-dlg .h-hs-roomcard', el => ({hidden: el.hidden, txt: el.textContent})); assert.equal(card.hidden, false); assert.match(card.txt, /Salle commune/); assert.match(card.txt, /Marie Durand/); assert.match(card.txt, /née ici · 1890/);
            await shot(p, 'maison-visite-carte.png', '.h-hs-dlg [data-hs-stage]');
            await p.click('.h-hs-dlg [data-wk="stop+"]'); await p.waitForSelector('dialog[open] input, dialog[open] textarea'); await p.fill('dialog[open] input, dialog[open] textarea', 'Ici, on veillait l’hiver.');
            await p.evaluate(() => [...document.querySelectorAll('dialog[open]')].pop().querySelector('[type=submit], .button:not(.secondary)').click()); await p.waitForTimeout(400);
            const tour = await p.evaluate(() => window.__ed.house.tour); assert.equal(tour.length, 1); assert.equal(tour[0].text, 'Ici, on veillait l’hiver.'); assert.equal(Math.round(tour[0].x), 150);
            await p.evaluate(() => { window.__ed.view3d.walkTo(8, 5); window.__ed.view3d.playTour(); }); await p.waitForTimeout(600);
            assert.match(await p.$eval('.h-hs-dlg .h-hs-tourbox', el => el.hidden ? '' : el.textContent), /Arrêt 1 sur 1.*veillait/s);
            const ws = await p.evaluate(() => window.__ed.view3d.walkState()); assert.ok(Math.abs(ws.x - 1.5) < .05 && Math.abs(ws.z - 1.5) < .05, 'la visite guidée y mène');
            await p.evaluate(() => window.__ed.view3d.stopTour());
            await p.evaluate(png => { const ed = window.__ed; ed.house.oldPhotos = [{id: 'ph', fid: ed.house.floors[0].id, x: 300, z: 300, yaw: 0, pitch: 0, src: png, title: 'La salle en 1910'}]; ed.commit('photo'); ed.view3d.showPhoto(0); }, PNG); await p.waitForTimeout(300);
            const ph = await p.$eval('.h-hs-dlg .h-hs-oldphoto', el => ({hidden: el.hidden, src: el.querySelector('img').getAttribute('src').slice(0, 15), txt: el.textContent})); assert.equal(ph.hidden, false); assert.equal(ph.src, 'data:image/png;'); assert.match(ph.txt, /Autrefois.*Aujourd’hui/);
            await p.$eval('.h-hs-dlg .h-hs-oldphoto [data-op="mix"]', el => { el.value = '100'; el.dispatchEvent(new Event('input', {bubbles: true})); });
            assert.equal(await p.$eval('.h-hs-dlg .h-hs-oldphoto img', el => el.style.opacity), '0');
            await p.evaluate(() => window.__ed.view3d.stopWalk()); await p.evaluate(() => window.__ed.toggle3d(false)); await p.waitForTimeout(300);
            const svg = await p.$eval('.h-hs-dlg [data-hs-world]', el => el.innerHTML); assert.match(svg, /📷/); assert.match(svg, /La grange/, 'le voisin en pointillés'); assert.match(svg, />1<\/text>/, 'l’arrêt n° 1');
        });
        await t('navigateur : 🎬 la vidéo de la visite guidée (sous-titres), exportée et rangée dans les médias', async () => {
            await blur(); await p.evaluate(() => window.__ed.setTab('house')); await p.waitForTimeout(200); await openAll();
            await p.click('.h-hs-dlg [data-hs-cmd="plus:tourvideo"]'); await p.waitForTimeout(300);
            const lab = await p.evaluate(() => [...document.querySelectorAll('dialog[open]')].pop().textContent); assert.match(lab, /Exporter la vidéo en (MP4|WebM)/); assert.match(lab, /Ranger aussi une copie dans les médias/);
            await p.evaluate(() => { const d = [...document.querySelectorAll('dialog[open]')].pop(); d.querySelector('[name=size]').value = '1280x720'; });
            posts.length = 0; const dl = p.waitForEvent('download', {timeout: 60000});
            await p.evaluate(() => [...document.querySelectorAll('dialog[open]')].pop().querySelector('[type=submit]').click());
            const d = await dl; assert.match(d.suggestedFilename(), /visite-guidee\.(mp4|webm)$/); const fp = path.join(tmp, d.suggestedFilename()); await d.saveAs(fp); assert.ok(fs.statSync(fp).size > 5000, `vidéo de ${fs.statSync(fp).size} octets`);
            await p.waitForTimeout(1500); assert.ok(posts.some(u => /retouch_media/.test(u)), 'une copie dans les médias');
            await p.evaluate(() => window.__ed.toggle3d(false)); await p.waitForTimeout(200);
        });
        await t('navigateur : toit plat — verrière, lanterneau, édicule (3D et coupe)', async () => {
            await blur(); const keep = await p.evaluate(() => JSON.stringify(window.__ed.house.roof));
            await p.evaluate(() => { const H2 = window.__ed.house; H2.roof = {on: true, shape: 'flat', items: []}; window.__ed.commit('plat'); window.__ed.setTab('floor'); }); await p.waitForTimeout(200);
            await p.evaluate(() => { const d = document.querySelector('.h-hs-dlg [data-ui-section="hs-fl-roof"]'); if (d) d.open = true; });
            for (const k of ['velux', 'shed', 'dormer']) { await p.click(`.h-hs-dlg [data-hs-cmd="roofit:${k}"]`); await p.waitForTimeout(150); }
            const txt = await p.$eval('.h-hs-dlg [data-hs-pane]', el => el.textContent); assert.match(txt, /Verrière/); assert.match(txt, /Lanterneau/); assert.match(txt, /Édicule/);
            await p.evaluate(() => { const b = [...document.querySelectorAll('.h-hs-dlg [data-hs-floor]')].find(x => /Combles/.test(x.textContent)); b.click(); }); await p.evaluate(() => window.__ed.toggle3d(true)); await p.waitForTimeout(1500); await p.evaluate(() => { const r = document.querySelector('.h-hs-dlg [data-h3="roof"]'); if (r && !r.checked) r.click(); }); await p.waitForTimeout(1200); await shot(p, 'maison-toit-plat.png', '.h-hs-dlg [data-hs-stage]'); await p.evaluate(() => window.__ed.toggle3d(false));
            const sec = await p.evaluate(() => { const H2 = window.__ed.house, it = window.LCNDA_EXT.housePlus.roofItemsPlan(H2); const c = it[2].poly.reduce((a, q) => [a[0] + q[0] / 4, a[1] + q[1] / 4], [0, 0]); return window.LCNDA_EXT.housePlus.sectionSvg(H2, {a: [c[0], -200], b: [c[0], 1200]}); });
            assert.match(sec, /#e9e1cf/, 'l’édicule dans la coupe');
            await p.evaluate(k => { window.__ed.house.roof = JSON.parse(k); window.__ed.commit('toit'); }, keep);
        });
        let shareFile = '';
        await t('navigateur : 📤 partager — un fichier qui s’ouvre sans l’app, sans personnes ni souvenirs, avec une CSP stricte', async () => {
            const html = await p.evaluate(async () => window.LCNDA_EXT.housePlus.shareHtml(window.__ed.house, {name: 'Maison de famille', plans: [{name: 'Rez', svg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>'}]}));
            assert.match(html, /Content-Security-Policy" content="default-src 'none'/); assert.doesNotMatch(html, /Marie Durand|Souvenir très privé 42|La salle en 1910/);
            shareFile = path.join(tmp, 'visite.html'); fs.writeFileSync(shareFile, html);
            const q = await ctx.newPage(), e2 = []; q.on('pageerror', e => e2.push(e.message)); const net2 = []; q.on('request', r => { if (!/^(file|data|blob):/.test(r.url())) net2.push(r.url()); });
            await q.goto('file://' + shareFile); await q.waitForFunction(() => !!window.__v3, null, {timeout: 20000});
            assert.ok(await q.$('#v3d canvas')); assert.deepEqual(e2, []); assert.deepEqual(net2, [], 'rien n’est demandé à un serveur');
            assert.equal(await q.$$eval('[data-wk="stop+"], [data-wk="photo+"]', l => l.length), 0, 'lecture seule');
            await shot(q, 'maison-partage.png'); await q.close();
        });
        await t('navigateur : 🏠 La maison du mode simple — 3D, gros boutons, rien envoyé au serveur', async () => {
            await p.evaluate(() => window.__ed.save()); await p.waitForTimeout(600); await p.evaluate(() => { window.__ed.cmd('close'); }); await p.waitForTimeout(300);
            const hid = await p.evaluate(async () => (await window.LCNDA_APP.api('houses')).items.find(h => h.name === 'Maison de famille')?.id);
            await p.evaluate(hid => { const M = window.LCNDA_EXT.modeSimple, s = M.settings(); M.write({...s, ready: true, viewer: 0, tiles: [...s.tiles.filter(x => x[0] !== 'c1'), ['c1', true]], tx: {...s.tx, c1: {kind: 'house', hid}}}); M.open(); }, hid);
            await p.waitForSelector('#ms-root'); await p.waitForTimeout(500);
            await p.evaluate(() => { const b = document.querySelector('#ms-root [data-act="setviewer"][data-id="0"]') || document.querySelector('#ms-root [data-act="setviewer"]'); if (b) b.click(); }); await p.waitForTimeout(500);
            posts.length = 0;
            await p.click('#ms-root [data-act="tile"][data-to="c1"]'); await p.waitForSelector('#ms-root .ms-house-view canvas', {timeout: 15000}); await p.waitForTimeout(800);
            const btns = await p.$$eval('#ms-root [data-ms-hbtns] button', l => l.map(b => [b.textContent.trim(), b.getBoundingClientRect().height]));
            assert.ok(btns.length >= 5, btns.map(b => b[0]).join(' | ')); assert.ok(btns.every(b => b[1] >= 64), 'cibles de 64 px');
            await p.click('#ms-root [data-act="hfloor"]'); await p.click('#ms-root [data-act="hleft"]'); await p.waitForTimeout(300);
            await p.click('#ms-root [data-act="hwalk"]'); await p.waitForTimeout(400);
            const pad = await p.$$eval('#ms-root [data-ms-hbtns] button', l => l.map(b => [b.dataset.act, b.getBoundingClientRect().height]));
            assert.ok(['wfwd', 'wback', 'wleft', 'wright', 'wstop'].every(a => pad.some(x => x[0] === a)), pad.map(x => x[0]).join(' ')); assert.ok(pad.every(x => x[1] >= 64), 'cibles de 64 px');
            await p.click('#ms-root [data-act="wright"]'); await p.waitForTimeout(400); await p.click('#ms-root [data-act="wfwd"]'); await p.waitForTimeout(500);
            await shot(p, 'maison-mode-simple-promenade.png');
            await p.click('#ms-root [data-act="wstop"]'); await p.waitForTimeout(300); assert.ok(await p.$('#ms-root [data-act="hwalk"]'), 'retour à la vue de la maison');
            await shot(p, 'maison-mode-simple.png');
            await p.click('#ms-root [data-act="back"]'); await p.waitForTimeout(400);
            assert.equal(await p.$$eval('#ms-root canvas', l => l.length), 0, 'la 3D est retirée en sortant'); assert.deepEqual(posts, [], 'aucun envoi au serveur');
            await p.evaluate(() => window.LCNDA_EXT.modeSimple.close());
        });
        await t('navigateur : aucune erreur JavaScript', () => assert.deepEqual(errs, []));
        await ctx.close();
        const m = await open(390, true);
        await t('navigateur : 390 px et sombre, l’onglet 🏠 Maison et ses outils sans débordement', async () => {
            await m.p.evaluate(async () => { window.__ed = await window.LCNDA_EXT.openHouse({}); window.__ed.setTab('house'); }); await m.p.waitForTimeout(600);
            assert.ok(await m.p.$('.h-hs-dlg [data-hs-cmd="plus:check"]'));
            const over = await m.p.evaluate(() => document.documentElement.scrollWidth - innerWidth); assert.ok(over <= 2, `débordement ${over}`);
            await shot(m.p, 'maison-outils-390-sombre.png'); assert.deepEqual(m.errs, []);
        });
        await m.ctx.close();
    } finally { await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true}); }
    done();
})().catch(e => { console.error(e); process.exit(1); });
function done() { console.log(`\n${ok} réussis, ${failed} en échec`); process.exit(failed ? 1 : 0); }
