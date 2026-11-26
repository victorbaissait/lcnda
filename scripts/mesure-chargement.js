#!/usr/bin/env node
'use strict';
/**
 * ⏱ Mesure du chargement (docs/perf-chargement.md) :   node scripts/mesure-chargement.js [--runs 2] [--json out.json] [--electron-cache]
 *
 * Base d'exemple (scripts/exemple-base.php), serveur « php -S » à 4 PHP (comme serve.sh), Internet coupé, fenêtre 1440 px, Chromium (Playwright).
 * Pour l'ouverture : première peinture, « utilisable » (jeton CSRF + écran dessiné), « calme » (plus de longue tâche > 200 ms ni de requête),
 * temps JavaScript (CDP Performance : ScriptDuration, compile/parse via le traçage V8), nombre et poids des requêtes, longues tâches, mémoire.
 *  - à froid : contexte neuf (aucun cache) ;
 *  - à chaud : 2e et 3e ouverture dans le même contexte (cache HTTP + code JavaScript déjà compilé gardé par Chromium).
 * Puis, dans l'app ouverte : une fiche personne, une fiche village, Listes → 🧰 Données (Récap), l'onglet Carte, Réglages.
 * Internet coupé par un proxy qui n'existe pas (et non page.route, qui désactiverait le cache du navigateur).
 */
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const RUNS = Number(arg('--runs', 2)) || 2;
const OUT = arg('--json', '');
const ROOT = path.resolve(arg('--root', path.resolve(__dirname, '..'))); // une autre copie de l'app (ex. la version d'avant, git archive) à comparer
const INIT = arg('--init', ''); // script ajouté à chaque page (instrumentation) ; ce qu'il range dans window.__report est affiché
const NO_NAV = process.argv.includes('--no-nav'); // l'ouverture seulement
const PROFILE_NAV = arg('--profile-nav', ''); // dossier : un profil processeur par étape de navigation
const PROFILE = arg('--profile', ''); // profil processeur de la 1re ouverture à froid (.cpuprofile) + résumé par fichier

async function main() {
    let chromium; try { ({ chromium } = require('playwright')); } catch (_) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-mesure-'));
    const dataDir = path.join(tmp, 'base');
    const mk = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), path.join(ROOT, 'scripts', 'exemple-base.php'), dataDir], { cwd: ROOT, encoding: 'utf8', timeout: 120000 });
    if (mk.status !== 0) throw new Error(mk.stderr || mk.stdout);
    const env = { ...process.env, GENEALOGY_DATA_DIR: dataDir, GENEALOGY_MEDIA_DIR: path.join(dataDir, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4',
        http_proxy: 'http://127.0.0.1:9', https_proxy: 'http://127.0.0.1:9', HTTP_PROXY: 'http://127.0.0.1:9', HTTPS_PROXY: 'http://127.0.0.1:9', no_proxy: '', NO_PROXY: '' };
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-d', 'memory_limit=1024M', '-S', `127.0.0.1:${port}`, '-t', ROOT, path.join(ROOT, 'router.php')], { cwd: ROOT, env, stdio: 'ignore', detached: true });
    const stop = () => { try { process.kill(-proc.pid, 'SIGTERM'); } catch (_) { try { proc.kill(); } catch (_) { /* arrêté */ } } };
    process.on('exit', stop);
    for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { stop(); process.exit(130); });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 150; i++) { try { await fetch(base + 'robots.txt'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch({ proxy: { server: 'http://127.0.0.1:9', bypass: '127.0.0.1' } });
    const results = { open: [], nav: {} };
    try {
        for (let run = 0; run < RUNS; run++) {
            const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
            if (INIT) await ctx.addInitScript({ path: INIT });
            await ctx.addInitScript(() => {
                window.__lt = []; window.__ready = 0;
                try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__lt.push([e.startTime, e.duration]); }).observe({ type: 'longtask', buffered: true }); } catch (_) { /* ancien */ }
                try { performance.setResourceTimingBufferSize(20000); } catch (_) { /* ancien */ }
                const tick = () => { if (window.LCNDA_APP?.state?.csrf && document.querySelector('#workspace')?.children.length) { window.__ready = performance.now(); return; } requestAnimationFrame(tick); };
                requestAnimationFrame(tick);
            });
            for (let k = 0; k < 3; k++) {
                const kind = k === 0 ? 'froid' : `chaud ${k}`;
                const page = await ctx.newPage();
                const errs = []; page.on('pageerror', e => errs.push(e.message));
                const cdp = await ctx.newCDPSession(page);
                await cdp.send('Performance.enable');
                let inflight = 0, last = Date.now(), reqs = 0, bytes = 0, fromCache = 0;
                await cdp.send('Network.enable');
                cdp.on('Network.requestWillBeSent', () => { inflight++; reqs++; last = Date.now(); });
                cdp.on('Network.loadingFinished', e => { inflight--; bytes += e.encodedDataLength || 0; last = Date.now(); });
                cdp.on('Network.loadingFailed', () => { inflight--; last = Date.now(); });
                cdp.on('Network.requestServedFromCache', () => { fromCache++; });
                cdp.on('Network.responseReceived', e => { if (e.response.status === 304) fromCache++; });
                if (PROFILE && run === 0 && k === 0) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 500 }); await cdp.send('Profiler.start'); }
                const t0 = Date.now();
                await page.goto(base, { waitUntil: 'commit' });
                await page.waitForFunction(() => window.__ready > 0, null, { timeout: 120000, polling: 50 });
                // calme : aucune requête en route depuis 1 s et aucune longue tâche > 200 ms depuis 1,5 s (au plus 60 s)
                for (;;) {
                    await sleep(200);
                    const lastLong = await page.evaluate(() => { let m = 0; for (const [s, d] of window.__lt) if (d > 200) m = Math.max(m, s + d); return performance.now() - m; });
                    if ((inflight <= 0 && Date.now() - last > 1000 && lastLong > 1500) || Date.now() - t0 > 60000) break;
                }
                const m = await page.evaluate(() => {
                    const paint = Object.fromEntries(performance.getEntriesByType('paint').map(e => [e.name, e.startTime]));
                    const nav = performance.getEntriesByType('navigation')[0];
                    let calm = window.__ready; for (const [s, d] of window.__lt) if (d > 200 && s + d > calm) calm = s + d;
                    const lt = window.__lt;
                    return { fp: paint['first-paint'] || 0, fcp: paint['first-contentful-paint'] || 0, dcl: nav?.domContentLoadedEventEnd || 0, load: nav?.loadEventEnd || 0,
                        ready: window.__ready, calm, lt: lt.length, ltTotal: lt.reduce((a, x) => a + x[1], 0), ltMax: lt.reduce((a, x) => Math.max(a, x[1]), 0),
                        scripts: document.scripts.length, css: document.querySelectorAll('link[rel=stylesheet]').length };
                });
                if (INIT) console.log('report', k, JSON.stringify(await page.evaluate(() => window.__report && window.__report()), null, 1));
                if (PROFILE && run === 0 && k === 0) { const { profile } = await cdp.send('Profiler.stop'); fs.writeFileSync(PROFILE, JSON.stringify(profile)); summarizeProfile(profile); }
                const pm = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(x => [x.name, x.value]));
                const row = { run, kind, ...Object.fromEntries(Object.entries(m).map(([a, b]) => [a, Math.round(b)])),
                    scriptMs: Math.round(pm.ScriptDuration * 1000), taskMs: Math.round(pm.TaskDuration * 1000), layoutMs: Math.round((pm.LayoutDuration + pm.RecalcStyleDuration) * 1000),
                    heapMB: +(pm.JSHeapUsedSize / 1048576).toFixed(1), reqs, MB: +(bytes / 1048576).toFixed(2), fromCache, errs: errs.length };
                results.open.push(row);
                console.log(JSON.stringify(row));
                if (!NO_NAV && k === 2 && run === RUNS - 1) await measureNav(page, cdp, results);
                await page.close();
            }
            await ctx.close();
        }
    } finally { await browser.close(); stop(); }
    const med = (rows, k) => { const v = rows.map(r => r[k]).sort((a, b) => a - b); return v[v.length >> 1]; };
    const sum = {};
    for (const kind of ['froid', 'chaud 1', 'chaud 2']) {
        const rows = results.open.filter(r => r.kind === kind);
        sum[kind] = Object.fromEntries(['fp', 'fcp', 'dcl', 'ready', 'calm', 'scriptMs', 'taskMs', 'lt', 'ltTotal', 'ltMax', 'heapMB', 'reqs', 'MB', 'fromCache', 'scripts', 'css'].map(k => [k, med(rows, k)]));
    }
    results.summary = sum;
    console.log('\nOuverture (médianes) :'); console.table(sum);
    console.log('Navigation :'); console.table(results.nav);
    if (OUT) fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) { /* gardé */ }
}

function summarizeProfile(profile) {
    const byId = new Map(profile.nodes.map(n => [n.id, n])); const self = new Map();
    const dt = profile.timeDeltas; profile.samples.forEach((id, i) => self.set(id, (self.get(id) || 0) + (dt[i] || 0)));
    const byUrl = new Map(), byFn = new Map();
    for (const [id, us] of self) { const cf = byId.get(id).callFrame; const u = (cf.url || '(' + cf.functionName + ')').replace(/^.*\/assets\//, '').replace(/\?.*/, '');
        byUrl.set(u, (byUrl.get(u) || 0) + us); const f = `${cf.functionName || '(anonyme)'} ${u}:${cf.lineNumber + 1}`; byFn.set(f, (byFn.get(f) || 0) + us); }
    const top = (m, n) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${String(Math.round(v / 1000)).padStart(6)} ms  ${k}`).join('\n');
    console.log('Temps propre par fichier :\n' + top(byUrl, 25) + '\nFonctions :\n' + top(byFn, 40));
}

async function measureNav(page, cdp, results) {
    let inflight = 0, last = Date.now(), reqs = 0;
    cdp.on('Network.requestWillBeSent', () => { inflight++; reqs++; last = Date.now(); });
    cdp.on('Network.loadingFinished', () => { inflight--; last = Date.now(); });
    cdp.on('Network.loadingFailed', () => { inflight--; last = Date.now(); });
    const villageKey = await page.evaluate(async () => (await window.LCNDA_APP.api('villages')).villages?.[0]?.key || '');
    const personId = await page.evaluate(async () => { const r = await window.LCNDA_APP.api('people'); const l = r.people || r.persons || r.items || r; return (Array.isArray(l) && l[0]?.id) || 1; });
    const steps = [
        ['fiche personne', `location.hash = '#personnes/${personId}'`, '#workspace .person-sheet, #workspace [data-person-sheet], #workspace .sheet, #workspace h1, #workspace h2'],
        ['fiche village', `(() => { const s = window.LCNDA_APP.state; s.listType = 'villages'; s.hVillage = ${JSON.stringify(villageKey)}; window.LCNDA_APP.setModule('listes'); })()`, '#workspace [data-h-village-edit], #workspace .h-village, #workspace h1, #workspace h2'],
        ['Listes → Données (Récap)', `(() => { const A = window.LCNDA_APP; try { window.LCNDA_EXT.dataHome._st.view = 'recap'; } catch (_) {} A.state.listType = 'donnees'; A.setModule('listes'); })()`, '#workspace [data-dr]'],
        ['Carte', `window.LCNDA_APP.setModule('carte')`, '#workspace .leaflet-container, #workspace canvas, #workspace svg, #workspace .map'],
        ['Réglages', `(() => { const A = window.LCNDA_APP; A.state.maintenanceTab = ''; A.setModule('maintenance'); })()`, '#workspace h1, #workspace h2, #workspace section'],
        ['Tableau de bord (retour)', `window.LCNDA_APP.setModule('dashboard')`, '#workspace .dashboard-grid, #workspace [data-block], #workspace section'],
    ];
    for (const [name, code, sel] of steps) {
        await page.evaluate(() => { window.__lt = []; window.__navMark = performance.now(); document.querySelector('#workspace')?.setAttribute('data-mesure-old', '1'); });
        reqs = 0;
        if (PROFILE_NAV) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 500 }); await cdp.send('Profiler.start'); }
        const t0 = Date.now();
        await page.evaluate(code);
        let shown = 0;
        try {
            await page.waitForFunction(s => { const ws = document.querySelector('#workspace'); return ws && !ws.querySelector('.loading, .is-loading') && ws.querySelector(s.split(',').map(x => x.trim().replace(/^#workspace /, '')).join(',')); }, sel, { timeout: 30000, polling: 30 });
            shown = Date.now() - t0;
        } catch (_) { shown = -1; }
        for (;;) {
            await sleep(150);
            const lastLong = await page.evaluate(() => { let m = window.__navMark; for (const [s, d] of window.__lt) if (d > 50) m = Math.max(m, s + d); return performance.now() - m; });
            if ((inflight <= 0 && Date.now() - last > 800 && lastLong > 800) || Date.now() - t0 > 30000) break;
        }
        if (PROFILE_NAV) { const { profile } = await cdp.send('Profiler.stop'); fs.mkdirSync(PROFILE_NAV, { recursive: true }); fs.writeFileSync(path.join(PROFILE_NAV, name.replace(/[^a-z]+/gi, '-') + '.cpuprofile'), JSON.stringify(profile)); }
        const lt = await page.evaluate(() => { let n = 0, tot = 0, max = 0, end = 0; for (const [s, d] of window.__lt) { if (s < window.__navMark) continue; n++; tot += d; max = Math.max(max, d); end = Math.max(end, s + d - window.__navMark); } return { n, tot: Math.round(tot), max: Math.round(max), end: Math.round(end) }; });
        const pm = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(x => [x.name, x.value]));
        results.nav[name] = { shownMs: shown, calmMs: Math.max(lt.end, shown), longTasks: lt.n, ltTotal: lt.tot, ltMax: lt.max, reqs, heapMB: +(pm.JSHeapUsedSize / 1048576).toFixed(1) };
        console.log(name, JSON.stringify(results.nav[name]));
    }
}

main().catch(e => { console.error(e); process.exit(1); });
