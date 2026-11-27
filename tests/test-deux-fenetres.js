#!/usr/bin/env node
'use strict';
/**
 * 🔁 Deux fenêtres de l'app ouvertes ensemble ne se renvoient jamais la balle (app.js : « Plusieurs fenêtres », applyCrossWindowChange).
 *   node tests/test-deux-fenetres.js            (GROSSE_BASE=3861 par défaut : comme la vraie base qui se figeait)
 *
 * Les fenêtres partagent le stockage local : un réglage changé dans l'une redessine l'autre (événement « storage »). Si ce redessin
 * écrit à son tour quelque chose (une clé remise en ordre, une mémoire d'écran), la première se redessine, écrit, la seconde… sans fin :
 * la page se figeait en défilant jusqu'à « Ordre et visibilité des blocs » (Réglages → Fiches personnes et animaux → Sections et blocs),
 * pendant qu'une 2ᵉ fenêtre montrait une fiche, puis la fenêtre se rechargeait (mémoire). On vérifie, sur une grosse base :
 *  1. fenêtre 1 sur #maintenance/design_sheets (Sections et blocs), fenêtre 2 sur une fiche : on décoche deux blocs, on défile jusqu'à
 *     « Ordre et visibilité des blocs » et en bas → la fiche de la fenêtre 2 se redessine (le réglage est repris), puis tout se calme :
 *     plus aucun événement « storage » ni écriture pendant 8 s, aucune tâche de plus de 500 ms, pas de plantage, mémoire stable ;
 *  2. le pire cas : chaque redessin, dans chaque fenêtre, écrit une valeur nouvelle (ce que fait une clé « remise en ordre » qui ne
 *     tombe jamais pareil) → au plus quelques redessins de chaque côté en 25 s (avant : un toutes les secondes, sans fin) ;
 *  3. un vrai changement fait juste après (pendant l'« écho ») est quand même repris, une fois le calme revenu.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const phpPath = findPhp([devBundledPhp()]);
if (!phpPath) { console.log('— PHP absent : test sauté'); process.exit(0); }
let chromium = null;
try { ({ chromium } = require('playwright')); } catch (_) { try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); } catch (__) { chromium = null; } }
if (!chromium) { console.log('— Playwright absent : test sauté'); process.exit(0); }
const N = Math.max(500, Number(process.env.GROSSE_BASE) || 3861);
let failed = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };

(async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-2fen-'));
    const env = { ...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4' };
    fs.mkdirSync(path.join(tmp, 'media'));
    const mk = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-d', 'memory_limit=2048M', path.join(appRoot, 'scripts/grosse-base.php'), String(N), '1789'], { cwd: appRoot, env, encoding: 'utf8', maxBuffer: 1 << 24 });
    if (mk.status !== 0 || !/^ok/m.test(mk.stdout)) { console.error(mk.stderr || mk.stdout); process.exit(1); }
    const pets = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', "require 'lib/bootstrap.php'; require_once 'lib/pets.php'; foreach (['Médor', 'Rex', 'Mina', 'Tom'] as $n) save_pet(db(), ['name' => $n, 'species' => 'chien']); echo 'ok';"], { cwd: appRoot, env, encoding: 'utf8' });
    if (!/ok/.test(pets.stdout)) { console.error(pets.stderr || pets.stdout); process.exit(1); }
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-d', 'memory_limit=1024M', '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env, stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 200; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
    const browser = await chromium.launch();
    try {
        const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } }); // un seul contexte : le même stockage local, comme deux fenêtres de l'app
        await ctx.route(u => !u.href.startsWith(base), r => r.abort());
        await ctx.addInitScript(() => {
            const C = window.__2f = { w: 0, s: 0, keys: {}, sheets: 0, settings: 0, long: 0 };
            const set = Storage.prototype.setItem, rem = Storage.prototype.removeItem;
            Storage.prototype.setItem = function (k, v) { if (this === window.localStorage && this.getItem(k) !== String(v)) { C.w++; C.keys[k] = (C.keys[k] || 0) + 1; } return set.call(this, k, v); };
            Storage.prototype.removeItem = function (k) { if (this === window.localStorage && this.getItem(k) !== null) { C.w++; C.keys[k] = (C.keys[k] || 0) + 1; } return rem.call(this, k); };
            addEventListener('storage', () => { C.s++; });
            const seen = new WeakSet(), one = (n, sel, k) => { const el = n.matches(sel) ? n : n.querySelector(sel); if (el && !seen.has(el)) { seen.add(el); C[k]++; } }; // chaque nouvelle fiche, chaque nouvelle page des réglages : une fois
            new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType !== 1) return; one(n, '.person-page', 'sheets'); one(n, '#fsec-blocks', 'settings'); }))).observe(document, { childList: true, subtree: true });
            try { new PerformanceObserver(l => l.getEntries().forEach(e => { if (e.duration > 500) C.long++; })).observe({ type: 'longtask' }); } catch (_) {}
        });
        const errs = [];
        const open = async hash => { const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('crash', () => errs.push('la fenêtre a planté')); await p.goto(base + hash); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf); return p; };
        const pid = (await (await fetch(base + 'api.php?action=people')).json()).people.find(p => p.kind !== 'animal').id;
        const sheet = await open(`#personnes/${pid}`);
        await sheet.waitForSelector('#workspace .person-page', { timeout: 30000 }); await sheet.waitForTimeout(3000);
        const reg = await open('#maintenance/design_sheets');
        await reg.waitForFunction(() => [...document.querySelectorAll('[role=tab]')].some(x => /Sections et blocs/.test(x.textContent)), null, { timeout: 30000 });
        await reg.evaluate(() => [...document.querySelectorAll('[role=tab]')].find(x => /Sections et blocs/.test(x.textContent)).click());
        await reg.waitForSelector('#fsec-blocks [data-fsed-bshow]', { timeout: 30000 }); await reg.waitForTimeout(3000);
        const C = p => p.evaluate(() => ({ ...window.__2f, heap: performance.memory ? performance.memory.usedJSHeapSize : 0 }));
        const gc = async p => { const c = await p.context().newCDPSession(p); await c.send('HeapProfiler.collectGarbage'); await c.detach(); return (await C(p)).heap; };
        const heap0 = [await gc(reg), await gc(sheet)];
        for (const p of [reg, sheet]) await p.evaluate(() => { window.__2f.long = 0; }); // le démarrage ne compte pas

        await t('un réglage changé dans une fenêtre est repris par l’autre, puis tout se calme (défilement de « Ordre et visibilité des blocs »)', async () => {
            const s0 = await C(sheet);
            for (const i of [3, 5]) { await reg.evaluate(i => document.querySelectorAll('#fsec-blocks [data-fsed-bshow]')[i].click(), i); await reg.waitForTimeout(600); }
            await reg.evaluate(() => document.getElementById('fsec-blocks').scrollIntoView());
            for (let i = 0; i < 30; i++) { await reg.evaluate(() => { document.getElementById('workspace').scrollTop += 300; }); await reg.waitForTimeout(100); }
            await sheet.waitForFunction(n => window.__2f.sheets > n, s0.sheets, { timeout: 15000 }); // la fiche de l'autre fenêtre a repris le réglage
            await reg.waitForTimeout(6000); // ce qui suit le dessin (aperçus, blocs) a fini
            const a = [await C(reg), await C(sheet)];
            await reg.waitForTimeout(8000);
            const b = [await C(reg), await C(sheet)];
            const d = [0, 1].map(i => ({ w: b[i].w - a[i].w, s: b[i].s - a[i].s, sheets: b[i].sheets - a[i].sheets, settings: b[i].settings - a[i].settings, keys: Object.fromEntries(Object.entries(b[i].keys).filter(([k, v]) => v !== a[i].keys[k]).map(([k, v]) => [k, v - (a[i].keys[k] || 0)])) }));
            console.log(`   8 s de calme : réglages ${JSON.stringify(d[0])} · fiche ${JSON.stringify(d[1])}`);
            assert.deepEqual(d.map(x => [x.s, x.sheets, x.settings]), [[0, 0, 0], [0, 0, 0]], 'plus rien ne passe d’une fenêtre à l’autre');
            assert.deepEqual(d.map(x => x.w), [0, 0], 'plus aucune écriture dans le stockage local');
        });

        await t('le pire cas : chaque redessin écrit une valeur nouvelle → au plus quelques redessins de chaque côté (pas de ping-pong)', async () => {
            // chaque redessin de la fiche (fenêtre 2) et de la page des réglages (fenêtre 1) écrit une valeur qui ne tombe jamais pareil
            await sheet.evaluate(() => { let n = 0; new MutationObserver(ms => { if (ms.some(m => [...m.addedNodes].some(x => x.nodeType === 1 && (x.matches('.person-page') || x.querySelector('.person-page'))))) localStorage.setItem('genealogie-essai-ordre-fiche', 'f' + (++n)); }).observe(document.getElementById('workspace'), { childList: true, subtree: true }); });
            await reg.evaluate(() => { let n = 0; new MutationObserver(ms => { if (ms.some(m => [...m.addedNodes].some(x => x.nodeType === 1 && (x.matches('#fsec-blocks') || x.querySelector('#fsec-blocks'))))) localStorage.setItem('genealogie-essai-ordre-reglages', 'r' + (++n)); }).observe(document.getElementById('workspace'), { childList: true, subtree: true }); });
            const a = [await C(reg), await C(sheet)];
            await reg.evaluate(() => document.querySelectorAll('#fsec-blocks [data-fsed-bshow]')[3].click());
            await reg.waitForTimeout(25000);
            const b = [await C(reg), await C(sheet)];
            const n = [b[0].settings - a[0].settings, b[1].sheets - a[1].sheets];
            console.log(`   en 25 s : page des réglages redessinée ${n[0]} fois, fiche ${n[1]} fois ; événements « storage » ${b[0].s - a[0].s} / ${b[1].s - a[1].s}`);
            assert.ok(n[1] >= 1, 'la fiche a repris le réglage');
            assert.ok(n[0] <= 3 && n[1] <= 3, `ping-pong : ${n}`);
            const late = [await C(reg), await C(sheet)]; await reg.waitForTimeout(10000); const end = [await C(reg), await C(sheet)];
            assert.ok(end[0].settings - late[0].settings <= 1 && end[1].sheets - late[1].sheets <= 1, 'ça ralentit encore : au plus un redessin en 10 s');
        });

        await t('un vrai changement juste après (pendant l’écho) est repris une fois le calme revenu', async () => {
            await sheet.waitForTimeout(12000);
            const before = await sheet.evaluate(() => localStorage.getItem('genealogie-person-blocks'));
            const s0 = (await C(sheet)).sheets;
            await reg.evaluate(() => document.querySelectorAll('#fsec-blocks [data-fsed-bshow]')[6].click());
            await sheet.waitForFunction(n => window.__2f.sheets > n, s0, { timeout: 30000 });
            assert.notEqual(await sheet.evaluate(() => localStorage.getItem('genealogie-person-blocks')), before);
        });

        await t('aucune tâche de plus de 500 ms, pas de plantage ni d’erreur, mémoire stable', async () => {
            const h1 = [await gc(reg), await gc(sheet)];
            console.log(`   mémoire : réglages ${heap0[0] >> 20} → ${h1[0] >> 20} Mo · fiche ${heap0[1] >> 20} → ${h1[1] >> 20} Mo`);
            assert.deepEqual([(await C(reg)).long, (await C(sheet)).long], [0, 0], 'tâches de plus de 500 ms');
            assert.deepEqual(errs, []);
            assert.ok(h1[0] < heap0[0] * 1.5 + (30 << 20) && h1[1] < heap0[1] * 1.5 + (30 << 20), 'la mémoire monte');
        });
    } finally { await browser.close(); proc.kill(); fs.rmSync(tmp, { recursive: true, force: true }); }
    console.log(failed ? `\n${failed} échec(s)` : '\nTout est bon.');
    process.exit(failed ? 1 : 0);
})();
