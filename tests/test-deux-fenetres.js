#!/usr/bin/env node
'use strict';
/**
 * 🔁 Deux fenêtres de l'app (ou trois, ou quatre) ouvertes ensemble ne se renvoient jamais la balle (app.js : « Plusieurs fenêtres », applyCrossWindowChange).
 *   node tests/test-deux-fenetres.js            (GROSSE_BASE=3861 par défaut : comme la vraie base qui se figeait)
 *
 * Les fenêtres partagent le stockage local : un réglage changé dans l'une redessine l'autre (événement « storage »). Si ce redessin
 * écrit à son tour quelque chose (une clé remise en ordre, une mémoire d'écran), la première se redessine, écrit, la seconde… sans fin :
 * la page se figeait en défilant jusqu'à « Ordre et visibilité des blocs » (Réglages → Fiches personnes et animaux → Sections et blocs),
 * pendant qu'une 2ᵉ fenêtre montrait une fiche, puis la fenêtre se rechargeait (mémoire). On vérifie, sur une grosse base :
 *  1. fenêtre 1 sur #maintenance/design_sheets (Sections et blocs), fenêtre 2 sur une fiche : on décoche deux blocs, on défile jusqu'à
 *     « Ordre et visibilité des blocs » et en bas → la fiche de la fenêtre 2 se redessine (le réglage est repris), puis tout se calme :
 *     plus aucun événement « storage » ni écriture pendant 8 s, jamais figée (pas de tâches de plus de 500 ms à la suite), pas de plantage, mémoire stable ;
 *  2. le pire cas : chaque redessin, dans chaque fenêtre, écrit une valeur nouvelle (ce que fait une clé « remise en ordre » qui ne
 *     tombe jamais pareil) → au plus quelques redessins de chaque côté en 25 s (avant : un toutes les secondes, sans fin) ;
 *  3. un vrai changement fait juste après est quand même repris partout ;
 *  le tout avec 2, 3 et 4 fenêtres (Réglages + deux fiches différentes + une liste) : plusieurs fenêtres annoncent leur écho en même temps.
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
        const people = (await (await fetch(base + 'api.php?action=people')).json()).people.filter(p => p.kind !== 'animal');
        // N fenêtres : Réglages (Sections et blocs) + des fiches différentes + une liste
        const OTHERS = [`#personnes/${people[0].id}`, `#personnes/${people[Math.floor(people.length / 2)].id}`, '#listes'];
        for (const N of [2, 3, 4]) await windows(N, OTHERS.slice(0, N - 1));

        async function windows(N, hashes) {
            const tag = `${N} fenêtres`;
            const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } }); // un seul contexte : le même stockage local, comme les fenêtres de l'app
            await ctx.route(u => !u.href.startsWith(base), r => r.abort());
            await ctx.addInitScript(() => {
                const C = window.__2f = { w: 0, s: 0, keys: {}, ws: 0, long: 0 };
                const set = Storage.prototype.setItem, rem = Storage.prototype.removeItem;
                Storage.prototype.setItem = function (k, v) { if (this === window.localStorage && this.getItem(k) !== String(v)) { C.w++; C.keys[k] = (C.keys[k] || 0) + 1; } return set.call(this, k, v); };
                Storage.prototype.removeItem = function (k) { if (this === window.localStorage && this.getItem(k) !== null) { C.w++; C.keys[k] = (C.keys[k] || 0) + 1; } return rem.call(this, k); };
                addEventListener('storage', () => { C.s++; });
                // un redessin de l'écran = le contenu de #workspace remplacé (compté une fois par dessin)
                let last = 0;
                new MutationObserver(ms => { if (ms.some(m => m.target.id === 'workspace' && m.addedNodes.length) && performance.now() - last > 250) { last = performance.now(); C.ws++; window.dispatchEvent(new Event('lc-essai-redessin')); } }).observe(document, { childList: true, subtree: true });
                C.longs = []; try { new PerformanceObserver(l => l.getEntries().forEach(e => { if (e.duration > 500) { C.long++; C.longs.push([Math.round(e.duration), Math.round(e.startTime)]); } })).observe({ type: 'longtask' }); } catch (_) {}
            });
            const errs = [];
            const open = async hash => { const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('crash', () => errs.push('une fenêtre a planté')); await p.goto(base + hash); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf); return p; };
            const others = [];
            for (const h of hashes) { const p = await open(h); await p.waitForSelector(h.startsWith('#personnes') ? '#workspace .person-page' : '#workspace > *', { timeout: 30000 }); await p.waitForTimeout(2000); others.push(p); }
            const reg = await open('#maintenance/design_sheets');
            await reg.waitForFunction(() => [...document.querySelectorAll('[role=tab]')].some(x => /Sections et blocs/.test(x.textContent)), null, { timeout: 30000 });
            await reg.evaluate(() => [...document.querySelectorAll('[role=tab]')].find(x => /Sections et blocs/.test(x.textContent)).click());
            await reg.waitForSelector('#fsec-blocks [data-fsed-bshow]', { timeout: 30000 }); await reg.waitForTimeout(3000);
            const all = [reg, ...others], name = i => i ? hashes[i - 1] : 'réglages';
            const C = p => p.evaluate(() => ({ ...window.__2f, heap: performance.memory ? performance.memory.usedJSHeapSize : 0 }));
            const Cs = () => Promise.all(all.map(C));
            const gc = async p => { const c = await p.context().newCDPSession(p); await c.send('HeapProfiler.collectGarbage'); await c.detach(); return (await C(p)).heap; };
            const heap0 = []; for (const p of all) heap0.push(await gc(p));
            for (const p of all) await p.evaluate(() => { window.__2f.long = 0; window.__2f.longs = []; window.__2f.t0 = performance.now(); }); // le démarrage ne compte pas
            const click = i => reg.evaluate(i => document.querySelectorAll('#fsec-blocks [data-fsed-bshow]')[i].click(), i);
            const repris = async (s0, ms = 15000) => { for (let i = 1; i < all.length; i++) await all[i].waitForFunction(n => window.__2f.ws > n, s0[i].ws, { timeout: ms }); };

            await t(`${tag} : un réglage changé dans Réglages est repris par toutes les autres, puis tout se calme (défilement de « Ordre et visibilité des blocs »)`, async () => {
                const s0 = await Cs();
                for (const i of [3, 5]) { await click(i); await reg.waitForTimeout(600); }
                await reg.evaluate(() => document.getElementById('fsec-blocks').scrollIntoView());
                for (let i = 0; i < 30; i++) { await reg.evaluate(() => { document.getElementById('workspace').scrollTop += 300; }); await reg.waitForTimeout(100); }
                await repris(s0);
                await reg.waitForTimeout(6000); // ce qui suit le dessin (aperçus, blocs) a fini
                const a = await Cs(); await reg.waitForTimeout(8000); const b = await Cs();
                const d = all.map((_, i) => ({ w: b[i].w - a[i].w, s: b[i].s - a[i].s, ws: b[i].ws - a[i].ws, keys: Object.fromEntries(Object.entries(b[i].keys).filter(([k, v]) => v !== a[i].keys[k]).map(([k, v]) => [k, v - (a[i].keys[k] || 0)])) }));
                console.log(`   8 s de calme : ${d.map((x, i) => `${name(i)} ${JSON.stringify(x)}`).join(' · ')}`);
                assert.deepEqual(d.map(x => [x.s, x.ws, x.w]), all.map(() => [0, 0, 0]), 'plus rien ne passe d’une fenêtre à l’autre, plus aucune écriture');
            });

            await t(`${tag} : le pire cas (chaque redessin, dans chaque fenêtre, écrit une valeur nouvelle) → au plus quelques redessins de chaque côté`, async () => {
                for (const [i, p] of all.entries()) await p.evaluate(i => { let n = 0; addEventListener('lc-essai-redessin', () => localStorage.setItem('genealogie-essai-ordre-' + i, String(++n))); }, i);
                const a = await Cs();
                await click(3);
                await reg.waitForTimeout(25000);
                const b = await Cs();
                const n = all.map((_, i) => b[i].ws - a[i].ws);
                console.log(`   en 25 s : redessins ${n.map((x, i) => `${name(i)} ${x}`).join(', ')} ; événements « storage » ${all.map((_, i) => b[i].s - a[i].s).join(' / ')}`);
                assert.ok(n.slice(1).every(x => x >= 1), 'toutes les autres fenêtres ont repris le réglage');
                assert.ok(n.every(x => x <= 3), `ping-pong : ${n}`);
                await reg.waitForTimeout(4000); const late = await Cs(); await reg.waitForTimeout(10000); const end = await Cs();
                assert.ok(end.every((x, i) => x.ws - late[i].ws === 0), 'plus aucun redessin ensuite');
            });

            await t(`${tag} : un vrai changement juste après est repris par toutes les autres`, async () => {
                await reg.waitForTimeout(4000);
                const s0 = await Cs();
                await click(6);
                await repris(s0, 30000);
                const v = await Promise.all(all.map(p => p.evaluate(() => localStorage.getItem('genealogie-person-blocks'))));
                assert.ok(v.every(x => x === v[0]));
            });

            await t(`${tag} : jamais figée (pas de tâches de plus de 500 ms à la suite), pas de plantage ni d’erreur, mémoire stable`, async () => {
                const h1 = []; for (const p of all) h1.push(await gc(p));
                console.log(`   mémoire (Mo) : ${all.map((_, i) => `${name(i)} ${heap0[i] >> 20} → ${h1[i] >> 20}`).join(' · ')}`);
                const cs = await Cs(), txt = cs.map((x, i) => `${name(i)} [${x.longs.map(([d, at]) => `${d} ms à ${(at / 1000).toFixed(1)} s`).join(', ')}]`).join(' · ');
                if (cs.some(x => x.long)) console.log(`   tâches de plus de 500 ms : ${txt}`);
                // figé = des tâches de plus de 500 ms à la suite (moins de 2 s entre elles), ou une seule de plus de 1,5 s ; une seule un peu longue (un redessin, 4 navigateurs sur la même machine) n'en est pas un
                const frozen = cs.map(x => x.longs.some(([d], j) => d > 1500 || (j && x.longs[j][1] - (x.longs[j - 1][1] + x.longs[j - 1][0]) < 2000)));
                assert.deepEqual(frozen, all.map(() => false), `une fenêtre s’est figée : ${txt}`);
                assert.deepEqual(errs, []);
                assert.ok(h1.every((h, i) => h < heap0[i] * 1.5 + (30 << 20)), 'la mémoire monte');
            });
            await ctx.close();
        }
    } finally { await browser.close(); proc.kill(); fs.rmSync(tmp, { recursive: true, force: true }); }
    console.log(failed ? `\n${failed} échec(s)` : '\nTout est bon.');
    process.exit(failed ? 1 : 0);
})();
