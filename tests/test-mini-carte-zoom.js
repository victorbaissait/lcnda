#!/usr/bin/env node
/* 🗺 La petite carte qui bouge (assets/js/heritage-mini-carte.js, réveille ext.miniMap de heritage.js) et la carte des
 * Listes → Données (assets/js/app-listes-donnees.js) :
 *  1. points bien posés : Brest, Sydney, Rio tombent au bon pixel des tuiles (Web Mercator), même dans une boîte au cadre épais
 *     (la cause des points « à côté » des côtes), et pas de bande grise en haut ;
 *  2. zoom (+ −, molette, double-clic, clavier, deux doigts), déplacement (glisser, flèches), « ⤢ Tout voir », limites du zoom ;
 *  3. points regroupés en pastilles « 42 » qui se séparent en zoomant ; clic sur un point = ouvre la ligne (souris et Entrée) ;
 *  4. liste de 2 000 lignes : « 1 500 points sur la carte … sur 2 000 lignes », « Charger les points de cette zone », ↺ ;
 *     « 📍 Autour de… » : ★ et le cercle ;
 *  5. 📍 GPS (⚙ Colonnes) : « 45,3200 N · 1,7700 E », ⧉ Copier, 🗺 Voir sur la carte, ↗ OpenStreetMap, export latitude/longitude ;
 *  6. ◐ Noir et blanc : contours (Natural Earth, départements, communes et leurs noms), retenu, thème sombre, impression ;
 *  7. téléphone (390 px) : pas de défilement de côté.
 * Lieux et châteaux inventés. node tests/test-mini-carte-zoom.js */
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
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-mm-'));
    fs.mkdirSync(path.join(tmp, 'media'), {recursive: true});
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4', GENEALOGY_TEST: '1'};
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
        const ctx = await browser.newContext({viewport: {width: 1440, height: 900}, acceptDownloads: true});
        await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], {origin: base.replace(/\/$/, '')});
        // aucune tuile d'Internet pendant l'essai : une tuile grise servie ici (la position compte, pas l'image)
        await ctx.route(/^https:\/\//, r => r.fulfill({status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#ddd"/></svg>'}));
        const p = await ctx.newPage();
        p.on('pageerror', e => errs.push(e.message));
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.miniMap && window.LCNDA_EXT?.miniMapEngine, null, {timeout: 30000});
        await p.evaluate(() => { try { localStorage.removeItem('genealogie-minicarte-nb'); localStorage.setItem('genealogie-design', JSON.stringify({mapBackground: 'osmfr'})); } catch (_) {} });

        /** pose une carte dans une boîte d'essai (largeur, cadre) et attend qu'elle soit réveillée */
        const mount = (pts, o = {}) => p.evaluate(([pts, o]) => {
            document.getElementById('mm-test')?.remove();
            const d = document.createElement('div'); d.id = 'mm-test';
            d.style.cssText = `position:fixed;left:20px;top:20px;z-index:99999;background:#fff;width:${o.width || 1000}px`;
            if (o.css) { const s = document.createElement('style'); s.textContent = o.css; d.appendChild(s); }
            const box = document.createElement('div'); box.innerHTML = window.LCNDA_EXT.miniMap(pts, o.paths || [], {height: o.height || 520, circles: o.circles || [], cluster: o.cluster, interactive: o.interactive});
            d.appendChild(box); document.body.appendChild(d);
        }, [pts, o]).then(() => p.waitForSelector('#mm-test [data-mm-ready]'));
        const view = () => p.evaluate(() => { const v = window.LCNDA_EXT.miniMapOf(document.querySelector('#mm-test .h-map')).view; return {...v}; });
        /** le centre (écran) de chaque point visible */
        const centers = () => p.$$eval('#mm-test .h-map-point', gs => gs.map(g => { if (g.style.display === 'none') return null; const r = g.querySelector('circle').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }));
        const stageBox = () => p.$eval('#mm-test .h-map', el => { const r = el.getBoundingClientRect(); return {x: r.x + el.clientLeft, y: r.y + el.clientTop, w: el.clientWidth, h: el.clientHeight}; });
        /** où une position devrait être, d'après les tuiles posées (Web Mercator) — sans passer par le calcul des points */
        const expected = (lat, lon) => p.evaluate(([lat, lon]) => {
            const st = document.querySelector('#mm-test .h-map'), z = window.LCNDA_EXT.miniMapOf(st).view.z;
            const imgs = [...st.querySelectorAll('.mm-tiles img[data-z]')].filter(i => i.style.zIndex === '1');
            const img = imgs[0], tz = Number(img.dataset.z), n = 2 ** tz, ts = 256 * 2 ** (z - tz), r = img.getBoundingClientRect();
            const s = Math.sin(lat * Math.PI / 180), X = (lon + 180) / 360 * n, Y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n;
            let x = r.left + (X - Number(img.dataset.tx)) * ts; const y = r.top + (Y - Number(img.dataset.ty)) * ts;
            const b = st.getBoundingClientRect(), world = n * ts;
            while (x < b.left) x += world; while (x > b.right) x -= world;
            return [x, y];
        }, [lat, lon]);
        const CITIES = [{lat: 48.39, lon: -4.49, label: 'Brest'}, {lat: -33.87, lon: 151.21, label: 'Sydney'}, {lat: -22.91, lon: -43.17, label: 'Rio de Janeiro'}];

        /* ═════════ 1. au bon endroit ═════════ */
        await t('points bien posés : Brest, Sydney, Rio au pixel près sur les tuiles (Web Mercator), même avec un cadre épais', async () => {
            for (const css of ['', '#mm-test .person-map-stage{border-width:9px!important}']) {
                await mount(CITIES, {css, width: 1000});
                await p.waitForTimeout(150);
                const c = await centers();
                for (let i = 0; i < CITIES.length; i++) {
                    const e = await expected(CITIES[i].lat, CITIES[i].lon);
                    assert.ok(Math.abs(c[i][0] - e[0]) < 1.5 && Math.abs(c[i][1] - e[1]) < 1.5, `${CITIES[i].label} ${css ? '(cadre 9 px)' : ''} : point ${c[i].map(Math.round)} / attendu ${e.map(Math.round)}`);
                }
                // le dessin des points suit la taille réelle de la boîte (plus de viewBox « meet » qui décale)
                const vb = await p.$eval('#mm-test .h-map > svg:not(.mm-vec)', s => [s.viewBox.baseVal.width, s.viewBox.baseVal.height, s.clientWidth, s.clientHeight]);
                assert.ok(Math.abs(vb[0] - vb[2]) < 1 && Math.abs(vb[1] - vb[3]) < 1, vb.join(','));
                // pas de bande grise : le monde couvre toute la hauteur
                const band = await p.$eval('#mm-test .h-map', st => { const tiles = [...st.querySelectorAll('.mm-tiles img')].filter(i => i.style.zIndex === '1').map(i => i.getBoundingClientRect()); const b = st.getBoundingClientRect(); return [Math.min(...tiles.map(r => r.top)) - b.top - st.clientTop, b.bottom - st.clientTop - Math.max(...tiles.map(r => r.bottom))]; });
                assert.ok(band[0] <= 0.5 && band[1] <= 0.5, 'bande vide : ' + band.join(','));
            }
            // dans un outil qui a ses propres gestes (Tableaux) : pas de boutons ni de gestes, mais les points restent bien posés,
            // même dans une boîte forcée à une autre hauteur que celle demandée
            await mount(CITIES, {interactive: false, css: '#mm-test .person-map-stage{height:300px!important;aspect-ratio:auto!important}'});
            assert.ok(!(await p.$('#mm-test .mm-ctl')), 'pas de boutons');
            const cs = await centers();
            for (let i = 0; i < CITIES.length; i++) { const e = await expected(CITIES[i].lat, CITIES[i].lon); assert.ok(Math.abs(cs[i][0] - e[0]) < 1.5 && Math.abs(cs[i][1] - e[1]) < 1.5, `${CITIES[i].label} (boîte forcée) : ${cs[i]} / ${e}`); }
            await mount(CITIES);
            // un point connu au pixel attendu, calculé à la main : Brest au centre d'une carte centrée sur Brest
            await p.evaluate(() => window.LCNDA_EXT.miniMapOf(document.querySelector('#mm-test .h-map')).setView(48.39, -4.49, 7, true));
            const b = await stageBox(), c = await centers();
            assert.ok(Math.abs(c[0][0] - (b.x + b.w / 2)) < 1 && Math.abs(c[0][1] - (b.y + b.h / 2)) < 1, `Brest ${c[0]} / centre ${b.x + b.w / 2},${b.y + b.h / 2}`);
        });

        /* ═════════ 2. zoom et déplacement ═════════ */
        const dist = c => Math.hypot(c[0][0] - c[2][0], c[0][1] - c[2][1]);
        await t('zoom : + et − (×2 / ÷2), molette (autour du pointeur), double-clic, limites 0…18', async () => {
            await mount(CITIES);
            const z0 = (await view()).z, d0 = dist(await centers());
            await p.click('#mm-test [data-mm-zoom="1"]'); let v = await view(); assert.ok(Math.abs(v.z - z0 - 1) < 1e-6, `${z0} → ${v.z}`);
            const d1 = dist(await centers()); assert.ok(Math.abs(d1 / d0 - 2) < 0.02, `écart ×${d1 / d0}`);
            await p.click('#mm-test [data-mm-zoom="-1"]'); v = await view(); assert.ok(Math.abs(v.z - z0) < 1e-6);
            // molette vers le haut sur Brest : on zoome, et Brest reste sous la souris
            const [bx, by] = (await centers())[0];
            await p.mouse.move(bx, by); await p.mouse.wheel(0, -300); await p.waitForTimeout(80);
            v = await view(); assert.ok(v.z > z0 + 0.4, `molette : ${z0} → ${v.z}`);
            const [bx2, by2] = (await centers())[0]; assert.ok(Math.hypot(bx2 - bx, by2 - by) < 1.5, `Brest a bougé de ${Math.hypot(bx2 - bx, by2 - by)} px`);
            await p.mouse.wheel(0, 300); await p.waitForTimeout(80); v = await view(); assert.ok(v.z < z0 + 0.4);
            // double-clic sur le fond
            const b = await stageBox(); const za = (await view()).z; await p.mouse.dblclick(b.x + 30, b.y + b.h - 40); assert.ok(Math.abs((await view()).z - za - 1) < 1e-6);
            // limites
            for (let i = 0; i < 25; i++) await p.click('#mm-test [data-mm-zoom="1"]');
            assert.strictEqual((await view()).z, 18);
            for (let i = 0; i < 25; i++) await p.click('#mm-test [data-mm-zoom="-1"]');
            const zMin = (await view()).z; assert.ok(zMin >= 0 && zMin <= 1.5, 'zoom minimal ' + zMin);
        });
        await t('déplacement : glisser à la souris, flèches du clavier, + − au clavier ; un glissé n’ouvre pas le point', async () => {
            await mount(CITIES);
            await p.evaluate(() => { window.__clicked = 0; document.querySelectorAll('#mm-test .h-map-point').forEach(g => g.addEventListener('click', () => window.__clicked++)); });
            const c0 = await centers();
            await p.mouse.move(c0[0][0], c0[0][1]); await p.mouse.down(); await p.mouse.move(c0[0][0] + 50, c0[0][1] + 20, {steps: 4}); await p.mouse.move(c0[0][0] + 100, c0[0][1] + 40, {steps: 4}); await p.mouse.up();
            const c1 = await centers();
            assert.ok(Math.abs(c1[0][0] - c0[0][0] - 100) < 2 && Math.abs(c1[0][1] - c0[0][1] - 40) < 2, `glissé : ${c0[0]} → ${c1[0]}`);
            assert.strictEqual(await p.evaluate(() => window.__clicked), 0, 'le glissé a ouvert le point');
            await p.focus('#mm-test .h-map'); await p.keyboard.press('ArrowLeft');
            const c2 = await centers(); assert.ok(Math.abs(c2[0][0] - c1[0][0] - 80) < 2, `flèche : ${c1[0][0]} → ${c2[0][0]}`);
            const z = (await view()).z; await p.keyboard.press('+'); assert.ok(Math.abs((await view()).z - z - 1) < 1e-6); await p.keyboard.press('-'); assert.ok(Math.abs((await view()).z - z) < 1e-6);
            // deux doigts (téléphone) : on écarte → on zoome
            const b = await stageBox();
            const zz = (await view()).z;
            await p.evaluate(([b]) => {
                const st = document.querySelector('#mm-test .h-map'), ev = (type, id, x, y) => st.dispatchEvent(new PointerEvent(type, {bubbles: true, pointerId: id, pointerType: 'touch', isPrimary: id === 11, clientX: x, clientY: y, button: 0}));
                const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
                ev('pointerdown', 11, cx - 30, cy); ev('pointerdown', 12, cx + 30, cy);
                for (let k = 1; k <= 5; k++) { ev('pointermove', 11, cx - 30 - k * 18, cy); ev('pointermove', 12, cx + 30 + k * 18, cy); }
                ev('pointerup', 11, cx - 120, cy); ev('pointerup', 12, cx + 120, cy);
            }, [b]);
            const z2 = (await view()).z; assert.ok(Math.abs(z2 - zz - 2) < 0.05, `pincement : ${zz} → ${z2}`); // 60 px → 240 px = ×4 = +2
        });
        await t('« ⤢ Tout voir » : après zoom et déplacement, tous les points reviennent dans la carte', async () => {
            await mount(CITIES);
            for (let i = 0; i < 4; i++) await p.click('#mm-test [data-mm-zoom="1"]');
            await p.focus('#mm-test .h-map'); for (let i = 0; i < 5; i++) await p.keyboard.press('ArrowRight');
            const b = await stageBox(), inside = c => c && c[0] >= b.x && c[0] <= b.x + b.w && c[1] >= b.y && c[1] <= b.y + b.h;
            assert.ok(!(await centers()).every(inside), 'zoomé : des points sont hors de la carte');
            await p.click('#mm-test [data-mm-fit]');
            assert.ok((await centers()).every(inside), 'Tout voir');
            assert.match(await p.getAttribute('#mm-test [data-mm-fit]', 'aria-label'), /Tout voir/);
            // le bouton dit ce qu'il fait ; l'attribution OpenStreetMap est sur la carte
            assert.match(await p.textContent('#mm-test [data-mm-credit]'), /OpenStreetMap/);
        });

        /* ═════════ 3. regroupement ═════════ */
        await t('beaucoup de points : pastilles « 42 » (le total compte tout), qui se séparent en zoomant (clic sur la pastille)', async () => {
            const pts = [];
            let s = 7; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
            for (let i = 0; i < 200; i++) pts.push({lat: 48.85 + (rnd() - 0.5) * 0.6, lon: 2.35 + (rnd() - 0.5) * 0.9, label: 'Paris ' + i});
            for (let i = 0; i < 60; i++) pts.push({lat: 35.68 + (rnd() - 0.5) * 0.4, lon: 139.7 + (rnd() - 0.5) * 0.4, label: 'Tokyo ' + i});
            pts.push({lat: -33.87, lon: 151.21, label: 'Sydney seul'});
            await mount(pts);
            const count = () => p.evaluate(() => { const st = document.querySelector('#mm-test .h-map'); const cl = [...st.querySelectorAll('.h-map-cluster')].filter(g => g.style.display !== 'none'); const vis = [...st.querySelectorAll('.h-map-point')].filter(g => g.style.display !== 'none').length; return {clusters: cl.map(g => Number(g.dataset.count)), vis, labels: cl.map(g => g.textContent)}; });
            const a = await count();
            assert.ok(a.clusters.length >= 2 && a.clusters.length < 30, JSON.stringify(a));
            assert.strictEqual(a.clusters.reduce((x, y) => x + y, 0) + a.vis, 261, 'chaque point est soit visible, soit compté dans une pastille');
            assert.ok(a.labels.some(l => /^\d+$/.test(l) && Number(l) >= 40), a.labels.join(','));
            assert.match(await p.getAttribute('#mm-test .h-map-cluster', 'aria-label'), /points ici/);
            const z0 = (await view()).z;
            const big = await p.evaluate(() => { const g = [...document.querySelectorAll('#mm-test .h-map-cluster')].filter(x => x.style.display !== 'none').sort((x, y) => y.dataset.count - x.dataset.count)[0]; const r = g.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
            await p.mouse.click(big[0], big[1]);
            const b = await count(), z1 = (await view()).z;
            assert.ok(z1 > z0 + 1, `zoom ${z0} → ${z1}`);
            assert.ok(b.vis > a.vis || b.clusters.length > a.clusters.length, `séparés : ${JSON.stringify(a)} → ${JSON.stringify(b)}`);
            // à fond : plus aucune pastille
            await p.evaluate(() => window.LCNDA_EXT.miniMapOf(document.querySelector('#mm-test .h-map')).setView(48.85, 2.35, 16, true));
            assert.strictEqual((await count()).clusters.length, 0);
            // au survol, le nom du point
            await p.evaluate(() => window.LCNDA_EXT.miniMapOf(document.querySelector('#mm-test .h-map')).setView(-33.87, 151.21, 8, true));
            const sy = (await centers())[260]; await p.mouse.move(sy[0], sy[1]); await p.waitForSelector('#mm-test .mm-tip:not([hidden])');
            assert.strictEqual(await p.textContent('#mm-test .mm-tip'), 'Sydney seul');
            await p.evaluate(() => document.getElementById('mm-test')?.remove());
        });

        /* ═════════ 4. Listes → Données ═════════ */
        await p.evaluate(() => {
            window.__opened = [];
            const rows = [
                {name: 'Château de Mazaud', from: 1450, lat: 45.32, lon: 1.77}, {name: 'Tour Lacombe', from: 1200, lat: 45.27, lon: 1.78},
                {name: 'Manoir Durand', from: 1600, lat: 45.16, lon: 1.53}, {name: 'Castel Durand', from: 1300, lat: 43.70, lon: 7.27}, {name: 'Sans lieu', from: 1500, lat: null, lon: null}];
            const many = []; let s = 11; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
            for (let i = 0; i < 2000; i++) many.push({name: 'Repère ' + i, n: i, lat: -50 + rnd() * 110, lon: -170 + rnd() * 340});
            (window.LCNDA_EXT.dataLists = window.LCNDA_EXT.dataLists || []).push(
                {id: 'test_mmc', icon: '🏰', label: 'Châteaux inventés (carte)', group: 'Le lieu', load: async () => rows,
                    fields: [{key: 'name', label: 'Nom', type: 'text'}, {key: 'from', label: 'Construit', type: 'year'}], geo: r => [r.lat, r.lon], open: r => window.__opened.push(r.name)},
                {id: 'test_mmm', icon: '📍', label: 'Repères inventés', group: 'Le monde', load: async () => many,
                    fields: [{key: 'name', label: 'Nom', type: 'text'}, {key: 'n', label: 'Numéro', type: 'number'}], geo: r => [r.lat, r.lon], open: r => window.__opened.push(r.name)},
                {id: 'test_mmn', icon: '📜', label: 'Sans position', group: 'Le monde', load: async () => [{name: 'a'}], fields: [{key: 'name', label: 'Nom', type: 'text'}]});
        });
        await p.waitForFunction(() => window.LCNDA_APP.defaultListTypes.some(x => x[0] === 'data_test_mmm'), null, {timeout: 10000});
        const openList = async (key, st) => {
            await p.evaluate(([k, st]) => { if (st) localStorage.setItem('lcnda-ld:' + k.slice(5), JSON.stringify(st)); else localStorage.removeItem('lcnda-ld:' + k.slice(5)); const A = window.LCNDA_APP; A.state.listType = k; A.setModule('listes'); }, [key, st || null]);
            await p.waitForSelector(`[data-ld-page="${key.slice(5)}"] [data-ld-results]`, {timeout: 15000});
        };
        await t('carte d’une liste : clic (et Entrée) sur un point ouvre la ligne ; « N points sur la carte », lignes sans position', async () => {
            await openList('data_test_mmc', {view: 'map'});
            await p.waitForSelector('.ld-results [data-mm-ready]');
            assert.strictEqual(await p.$$eval('.ld-results .h-map-point', a => a.length), 4);
            const note = await p.textContent('[data-ld-map-note]'); assert.match(note, /4 points sur la carte/); assert.match(note, /1 ligne sans position/);
            await p.click('.ld-results [data-ld-map-row="2"]'); assert.deepStrictEqual(await p.evaluate(() => window.__opened), ['Manoir Durand']);
            await p.focus('.ld-results [data-ld-map-row="0"]'); await p.keyboard.press('Enter');
            assert.deepStrictEqual(await p.evaluate(() => window.__opened), ['Manoir Durand', 'Château de Mazaud']);
            assert.match(await p.getAttribute('.ld-results [data-ld-map-row="0"]', 'aria-label'), /Château de Mazaud/);
        });
        await t('« 📍 Autour de… » : le ★ et le cercle de la distance sur la carte', async () => {
            await openList('data_test_mmc', {view: 'map', near: {lat: 45.2675, lon: 1.7711, km: 25, title: 'Tulle'}});
            await p.waitForSelector('.ld-results [data-mm-ready]');
            const c = await p.$eval('.ld-results .mm-circle', el => { const r = el.getBoundingClientRect(); return [r.width, r.height, el.getAttribute('points').split(' ').length]; });
            assert.ok(c[2] > 60 && c[0] > 20 && c[1] > 20, 'cercle ' + c);
            assert.ok(await p.$$eval('.ld-results .h-map-point', gs => gs.some(g => /★/.test(g.textContent))), '★');
            // le cercle de 25 km a la bonne taille : 50 km de diamètre ≈ 0,45° de latitude
            const ok = await p.evaluate(() => { const ctl = window.LCNDA_EXT.miniMapOf(document.querySelector('.ld-results .h-map')); const el = document.querySelector('.ld-results .mm-circle'); const ys = el.getAttribute('points').split(' ').map(s => Number(s.split(',')[1])); const S = 256 * 2 ** ctl.view.z, rad = Math.PI / 180, merc = l => Math.log(Math.tan(Math.PI / 4 + l * rad / 2)) / (2 * Math.PI); return [(Math.max(...ys) - Math.min(...ys)) / S, merc(45.2675 + 25 / 111.2) - merc(45.2675 - 25 / 111.2)]; });
            assert.ok(Math.abs(ok[0] / ok[1] - 1) < 0.03, ok.join(' / '));
        });
        await t('2 000 lignes : 1 500 points, on le dit ; zoomé → « Charger les points de cette zone » (filtre du cadre) ; ↺ Toute la recherche', async () => {
            await openList('data_test_mmm', {view: 'map'});
            await p.waitForSelector('.ld-results [data-mm-ready]');
            assert.strictEqual(await p.$$eval('.ld-results .h-map-point', a => a.length), 1500);
            let note = await p.textContent('[data-ld-map-note]');
            assert.match(note, /1\s500 points sur la carte/); assert.match(note, /sur 2\s000 lignes/); assert.match(note, /Zoome sur une région/);
            assert.ok(await p.$$eval('.ld-results .h-map-cluster', a => a.some(g => g.style.display !== 'none')), 'pastilles');
            await p.evaluate(() => window.LCNDA_EXT.miniMapOf(document.querySelector('.ld-results .h-map')).setView(10, 0, 4, true));
            await p.waitForSelector('[data-ld-zone]', {timeout: 5000});
            const bounds = await p.evaluate(() => window.LCNDA_EXT.miniMapOf(document.querySelector('.ld-results .h-map')).bounds());
            await p.click('[data-ld-zone]');
            await p.waitForSelector('[data-ld-zone-reset]');
            note = await p.textContent('[data-ld-map-note]'); assert.match(note, /tous ceux de cette zone/);
            const want = await p.evaluate(([b]) => window.LCNDA_EXT.dataLists.find(d => d.id === 'test_mmm').load().then(rows => rows.filter(r => r.lat >= b.south && r.lat <= b.north && r.lon >= b.west && r.lon <= b.east).length), [bounds]);
            const n = await p.$$eval('.ld-results .h-map-point', a => a.length);
            assert.strictEqual(n, want); assert.match(note, new RegExp(`${want} points? sur la carte`));
            assert.ok(Math.abs((await p.evaluate(() => window.LCNDA_EXT.miniMapOf(document.querySelector('.ld-results .h-map')).view.z)) - 4) < 1e-6, 'la carte reste où elle était');
            await p.click('[data-ld-zone-reset]'); await p.waitForFunction(() => /2\s000 lignes/.test(document.querySelector('[data-ld-map-note]')?.textContent || ''));
            assert.strictEqual(await p.$$eval('.ld-results .h-map-point', a => a.length), 1500);
        });

        /* ═════════ 5. 📍 GPS ═════════ */
        await t('📍 GPS (⚙ Colonnes) : « 45,3200 N · 1,7700 E », ⧉ Copier, ↗ OpenStreetMap, 🗺 Voir sur la carte, export latitude / longitude', async () => {
            await openList('data_test_mmc', {view: 'table'});
            await p.waitForSelector('.ld-table');
            assert.ok(!(await p.$('.ld-gps')), 'pas de GPS au départ');
            await p.click('[data-ld-cols]'); await p.check('.ld-ed-form [data-ld-col-gps]'); await p.uncheck('.ld-ed-form input[name="c"][value="from"]'); await p.click('.ld-ed-form button[type="submit"]');
            await p.waitForSelector('.ld-gps');
            const heads = await p.$$eval('.ld-table thead th', a => a.map(x => x.textContent.trim())); assert.deepStrictEqual(heads, ['Nom', '📍 GPS']);
            assert.strictEqual(await p.textContent('[data-ld-gps-show="0"]'), '45,3200 N · 1,7700 E');
            assert.strictEqual(await p.textContent('[data-ld-gps-show="3"]'), '43,7000 N · 7,2700 E');
            assert.match(await p.textContent('[data-ld-row="4"]'), /—/);
            const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('lcnda-ld:test_mmc'))); assert.strictEqual(saved.gps, true); assert.deepStrictEqual(saved.hide, ['from']);
            assert.ok(!(await p.isVisible('[data-ld-gps-copy="0"]')), 'actions cachées');
            await p.focus('[data-ld-gps-show="0"]'); assert.ok(await p.isVisible('[data-ld-gps-copy="0"]'), 'actions au clavier');
            assert.strictEqual(await p.getAttribute('[data-ld-row="0"] .ld-gps-act a', 'href'), 'https://www.openstreetmap.org/?mlat=45.32&mlon=1.77#map=15/45.32/1.77');
            await p.hover('[data-ld-gps-show="1"]'); await p.click('[data-ld-gps-copy="1"]');
            await p.waitForFunction(() => /45\.27, 1\.78/.test(document.body.textContent));
            assert.strictEqual(await p.evaluate(() => navigator.clipboard.readText()), '45.27, 1.78');
            // export : deux colonnes latitude / longitude
            const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-ld-export]')]);
            const csv = fs.readFileSync(await dl.path(), 'utf8').replace(/^﻿/, '').split(/\r\n/);
            assert.strictEqual(csv[0], 'Nom;latitude;longitude'); assert.strictEqual(csv[1], 'Château de Mazaud;45.32;1.77'); assert.strictEqual(csv[5], 'Sans lieu;;');
            // 🗺 Voir sur la carte : la carte, zoomée sur ce point
            await p.hover('[data-ld-gps-show="2"]'); await p.click('[data-ld-gps-map="2"]');
            await p.waitForSelector('.ld-results [data-mm-ready]');
            const v = await p.evaluate(() => window.LCNDA_EXT.miniMapOf(document.querySelector('.ld-results .h-map')).getView());
            assert.ok(Math.abs(v.lat - 45.16) < 1e-6 && Math.abs(v.lon - 1.53) < 1e-6 && v.zoom === 13, JSON.stringify(v));
            assert.strictEqual(await p.evaluate(() => document.activeElement?.dataset?.ldMapRow), '2');
            // une liste sans position : pas de GPS
            await openList('data_test_mmn', {view: 'table'}); await p.click('[data-ld-cols]');
            assert.ok(!(await p.$('.ld-ed-form [data-ld-col-gps]'))); await p.click('[data-ld-ed-cancel]');
        });

        /* ═════════ 6. ◐ Noir et blanc ═════════ */
        await t('◐ Noir et blanc : contours sans tuiles, retenu, départements puis communes et leurs noms en zoomant, sources ↗, sombre, impression', async () => {
            await mount(CITIES);
            await p.click('#mm-test [data-mm-nb]');
            assert.strictEqual(await p.evaluate(() => localStorage.getItem('genealogie-minicarte-nb')), '1');
            assert.strictEqual(await p.getAttribute('#mm-test [data-mm-nb]', 'aria-pressed'), 'true');
            await p.waitForFunction(() => document.querySelectorAll('#mm-test .mm-vec path.mm-nb-world').length > 0, null, {timeout: 15000});
            assert.ok(!(await p.isVisible('#mm-test .mm-tiles')), 'pas de tuiles');
            assert.match(await p.textContent('#mm-test [data-mm-credit]'), /Natural Earth.*↗/);
            assert.strictEqual(await p.$eval('#mm-test .mm-vec', el => getComputedStyle(el).backgroundColor), 'rgb(255, 255, 255)');
            // une nouvelle carte se souvient du choix
            await mount([{lat: 45.27, lon: 1.77, label: 'Tulle'}, {lat: 45.16, lon: 1.53, label: 'Brive'}]);
            assert.strictEqual(await p.getAttribute('#mm-test [data-mm-nb]', 'aria-pressed'), 'true');
            const ctl = 'window.LCNDA_EXT.miniMapOf(document.querySelector("#mm-test .h-map"))';
            await p.evaluate(`${ctl}.setView(46.5, 2.5, 6.5, true)`);
            await p.waitForFunction(() => document.querySelector('#mm-test .mm-vec path.mm-nb-dep'), null, {timeout: 15000});
            assert.match(await p.textContent('#mm-test [data-mm-credit]'), /IGN Admin Express/);
            await p.evaluate(`${ctl}.setView(45.27, 1.77, 10.5, true)`);
            await p.waitForFunction(() => [...document.querySelectorAll('#mm-test .mm-nb-town text')].some(x => x.textContent === 'Tulle'), null, {timeout: 30000});
            assert.ok(await p.$('#mm-test .mm-vec path.mm-nb-com'), 'limites des communes');
            // sombre : traits clairs sur fond foncé
            await p.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
            const dark = await p.$eval('#mm-test .mm-vec', el => [getComputedStyle(el).color, getComputedStyle(el).backgroundColor]);
            assert.deepStrictEqual(dark, ['rgb(238, 238, 238)', 'rgb(18, 18, 18)']);
            // impression : le dessin reste (noir sur blanc), les boutons s'en vont
            await p.emulateMedia({media: 'print'});
            assert.ok(await p.isVisible('#mm-test .mm-vec')); assert.ok(!(await p.isVisible('#mm-test .mm-ctl')));
            assert.strictEqual(await p.$eval('#mm-test .mm-vec', el => getComputedStyle(el).backgroundColor), 'rgb(255, 255, 255)');
            await p.emulateMedia({media: 'screen'}); await p.evaluate(() => document.documentElement.removeAttribute('data-theme'));
            await p.click('#mm-test [data-mm-nb]');
            assert.strictEqual(await p.evaluate(() => localStorage.getItem('genealogie-minicarte-nb')), '0');
            assert.ok(await p.isVisible('#mm-test .mm-tiles') && !(await p.isVisible('#mm-test .mm-vec')));
            await p.evaluate(() => document.getElementById('mm-test')?.remove());
        });

        /* ═════════ 7. téléphone ═════════ */
        await t('téléphone (390 px) : la carte et ses boutons tiennent, pas de défilement de côté', async () => {
            await p.setViewportSize({width: 390, height: 844});
            await openList('data_test_mmm', {view: 'map'});
            await p.waitForSelector('.ld-results [data-mm-ready]'); await p.waitForTimeout(250);
            const sw = await p.evaluate(() => [document.scrollingElement.scrollWidth, document.scrollingElement.clientWidth]);
            assert.ok(sw[0] <= sw[1] + 1, sw.join(' > '));
            const r = await p.evaluate(() => { const st = document.querySelector('.ld-results .h-map').getBoundingClientRect(), c = document.querySelector('.ld-results .mm-ctl').getBoundingClientRect(); return [st.left, st.right, c.left, c.right, c.bottom, st.bottom]; });
            assert.ok(r[0] >= 0 && r[1] <= 390 && r[2] >= r[0] && r[3] <= r[1] && r[4] <= r[5], r.join(','));
            assert.ok(!(await p.isVisible('.ld-results .mm-ctl .mm-lab')), 'boutons sans texte sur petit écran');
            await p.click('.ld-results [data-mm-zoom="1"]');
            const sw2 = await p.evaluate(() => [document.scrollingElement.scrollWidth, document.scrollingElement.clientWidth]); assert.ok(sw2[0] <= sw2[1] + 1);
            await p.setViewportSize({width: 1440, height: 900});
        });
        await t('aucune erreur dans la page', async () => { assert.deepStrictEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true});
    }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})();
