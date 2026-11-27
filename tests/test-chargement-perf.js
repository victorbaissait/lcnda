'use strict';
/**
 * ⏱ Chargement de l'app : ce qui a été allégé reste léger, et rien n'a disparu.   node tests/test-chargement-perf.js
 * (mesures et explications : docs/perf-chargement.md ; mesure complète : node scripts/mesure-chargement.js)
 *
 *  1. fichiers : app-observateurs.js chargé en tout premier (avant tout autre script) ; router.php sert .js / .css avec ETag ;
 *  2. app-i18n : les nombres des textes ({n}) écrits comme avant (un seul Intl.NumberFormat) ;
 *  3. serveur (php -S + router.php) : .js / .css → 200 + ETag + Last-Modified + no-cache ; 304 quand rien n'a changé ; HEAD ;
 *     type exact ; un fichier absent → 404 ; les dossiers protégés (lib, data…) → toujours 404 ;
 *  4. navigateur (Playwright ; sinon sauté), base d'exemple, Internet coupé, 1440 px :
 *     - observateurs regroupés : plusieurs changements de la même image → un appel avec TOUS les changements ; disconnect / takeRecords ;
 *       un observateur d'un élément précis, ou { lcndaImmediate: true } (la traduction), n'est pas retardé ;
 *     - budgets (larges, tiennent sur un ordinateur chargé) : utilisable < 45 s ; appels des observateurs de la page < 45 000 (avant : ≈ 80 000) ;
 *     - 2e ouverture : les scripts et feuilles de style ne sont plus retéléchargés (304 ou cache) ;
 *     - ce qui attend d'être vu apparaît quand on le regarde : le widget 🔎 « Ce qui le concerne » posé loin en bas ne calcule rien,
 *       puis se remplit quand on le fait venir à l'écran ; « @[Nom|id] » ajouté à la page devient un lien ; les poignées ⠿ sont prêtes ;
 *     - une fiche personne, Listes → Données, la Carte, Réglages s'ouvrent ; aucune erreur JavaScript.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const http = require('node:http');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(appRoot, f), 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ✓ ' + name); } catch (e) { fail++; console.log('  ✗ ' + name + '\n    ' + String(e.stack || e).split('\n').slice(0, 8).join('\n    ')); } };
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const get = (url, headers = {}, method = 'GET') => new Promise((res, rej) => { const r = http.request(url, { method, headers }, x => { const c = []; x.on('data', d => c.push(d)); x.on('end', () => res({ status: x.statusCode, headers: x.headers, body: Buffer.concat(c) })); }); r.on('error', rej); r.end(); });

(async () => {
    console.log('Fichiers');
    await t('index.php : app-observateurs.js est le tout premier script (sans defer)', () => {
        const html = read('index.php'), first = html.indexOf('<script');
        assert.ok(first > 0);
        assert.match(html.slice(first, first + 80), /^<script src="assets\/js\/app-observateurs\.js\?v=\d+"><\/script>/);
    });
    await t('router.php : .js / .css servis avec ETag, Last-Modified, no-cache, 304', () => {
        const r = read('router.php');
        assert.match(r, /function router_serve_static\(/);
        assert.match(r, /Cache-Control: no-cache/);
        assert.match(r, /http_response_code\(304\)/);
    });
    await t('app-i18n : {n} écrit comme toLocaleString("fr-FR") (un seul Intl.NumberFormat)', () => {
        const I = require('../assets/js/app-i18n.js');
        for (const n of [0, 7, 1234, 1234567.891, -42.5, 0.125]) assert.equal(I.t('{n} fiches', { n }), `${n.toLocaleString('fr-FR')} fiches`);
        assert.equal(I.t('{n} et {m}', { n: 'a', m: 2000 }), `a et ${(2000).toLocaleString('fr-FR')}`);
    });

    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-chargement-'));
    const dataDir = path.join(tmp, 'base');
    const mk = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), path.join(appRoot, 'scripts', 'exemple-base.php'), dataDir], { cwd: appRoot, encoding: 'utf8', timeout: 180000 });
    if (mk.status !== 0) { console.error(mk.stderr || mk.stdout); process.exit(1); }
    const env = { ...process.env, GENEALOGY_DATA_DIR: dataDir, GENEALOGY_MEDIA_DIR: path.join(dataDir, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4',
        http_proxy: 'http://127.0.0.1:9', https_proxy: 'http://127.0.0.1:9', HTTP_PROXY: 'http://127.0.0.1:9', HTTPS_PROXY: 'http://127.0.0.1:9', no_proxy: '', NO_PROXY: '' };
    const port = await freePort();
    // detached : le groupe entier (PHP et ses 4 processus) est arrêté à la fin
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env, stdio: 'ignore', detached: true });
    const stopServer = () => { try { process.kill(-proc.pid, 'SIGTERM'); } catch (_) { try { proc.kill(); } catch (_) { /* déjà arrêté */ } } };
    process.on('exit', stopServer);
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 200; i++) { try { await get(base + 'robots.txt'); break; } catch (_) { await sleep(100); } }

    console.log('Serveur');
    await t('.js : 200, ETag, Last-Modified, no-cache, le bon type, le fichier entier ; puis 304 (If-None-Match, If-Modified-Since)', async () => {
        const a = await get(base + 'assets/js/app-observateurs.js?v=1');
        assert.equal(a.status, 200);
        assert.match(String(a.headers['content-type']), /^text\/javascript/);
        assert.equal(a.headers['cache-control'], 'no-cache');
        assert.equal(a.headers['x-content-type-options'], 'nosniff');
        assert.ok(a.headers.etag && a.headers['last-modified']);
        assert.equal(a.headers['x-powered-by'], undefined);
        assert.equal(a.body.toString(), read('assets/js/app-observateurs.js'));
        const b = await get(base + 'assets/js/app-observateurs.js?v=1', { 'If-None-Match': a.headers.etag });
        assert.equal(b.status, 304); assert.equal(b.body.length, 0);
        const c = await get(base + 'assets/js/app-observateurs.js?v=1', { 'If-Modified-Since': a.headers['last-modified'] });
        assert.equal(c.status, 304);
        const d = await get(base + 'assets/js/app-observateurs.js?v=1', { 'If-None-Match': '"autre"' });
        assert.equal(d.status, 200);
        const h = await get(base + 'assets/js/app-observateurs.js?v=1', {}, 'HEAD');
        assert.equal(h.status, 200); assert.equal(Number(h.headers['content-length']), fs.statSync(path.join(appRoot, 'assets/js/app-observateurs.js')).size);
    });
    await t('.css : text/css ; un fichier absent → 404 ; lib/, data/, tests/ → 404', async () => {
        const a = await get(base + 'assets/css/app.css');
        assert.equal(a.status, 200); assert.match(String(a.headers['content-type']), /^text\/css/); assert.ok(a.headers.etag);
        assert.equal((await get(base + 'assets/js/nexiste-pas.js')).status, 404);
        for (const p of ['lib/bootstrap.php', 'tests/test-chargement-perf.js', 'data/schema.sql', 'scripts/mesure-chargement.js', '.git/config']) assert.equal((await get(base + p)).status, 404, p);
    });

    let chromium = null;
    try { ({ chromium } = require('playwright')); } catch (_) { try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); } catch (_) { /* sans navigateur */ } }
    if (!chromium) console.log('  (Playwright absent : partie navigateur sautée)');
    else {
        // Internet coupé par un proxy inexistant (page.route désactiverait le cache du navigateur, qu'on vérifie ici)
        const browser = await chromium.launch({ proxy: { server: 'http://127.0.0.1:9', bypass: '127.0.0.1' } });
        try {
            const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
            await ctx.addInitScript(() => {
                // compte les appels des observateurs (posé sous app-observateurs.js : chaque appel réel est compté)
                window.__moCalls = 0; let cur = window.MutationObserver;
                const wrap = Inner => { const W = function (cb) { return Reflect.construct(Inner, [function (r, o) { window.__moCalls++; return cb.call(this, r, o); }], new.target || W); }; W.prototype = Inner.prototype; W.__c = 1; return W; };
                Object.defineProperty(window, 'MutationObserver', { configurable: true, get: () => cur, set: v => { cur = v && v.__c ? v : wrap(v); } });
                window.__ready = 0;
                const tick = () => { if (window.LCNDA_APP?.state?.csrf && document.querySelector('#workspace')?.children.length) { window.__ready = performance.now(); return; } requestAnimationFrame(tick); };
                requestAnimationFrame(tick);
            });
            const page = await ctx.newPage();
            const errs = []; page.on('pageerror', e => errs.push(e.message));
            const t0 = Date.now();
            await page.goto(base);
            await page.waitForFunction(() => window.__ready > 0, null, { timeout: 90000 });
            const ready = Date.now() - t0;
            // laisser le tableau de bord se remplir (au plus 25 s)
            await page.waitForFunction(() => !document.querySelector('#workspace .loading-screen'), null, { timeout: 60000 }).catch(() => {});
            await sleep(6000);
            const moCalls = await page.evaluate(() => window.__moCalls);
            console.log(`  (utilisable en ${ready} ms ; ${moCalls} appels d’observateurs)`);

            console.log('Navigateur');
            await t('observateurs de la page regroupés par image : un appel, tous les changements ; disconnect / takeRecords', async () => {
                const r = await page.evaluate(async () => {
                    const out = {};
                    // seulement les changements de l'essai (le reste de la page peut bouger en même temps)
                    const box = document.createElement('div'); box.id = 'perf-essai';
                    const mine = recs => recs.filter(r => r.target === box || r.target === document.body && [...r.addedNodes].includes(box) || box.contains(r.target)).length;
                    const calls = []; const o = new MutationObserver(recs => { const n = mine(recs); if (n) calls.push(n); }); o.observe(document.body, { childList: true, subtree: true }); document.body.append(box); // 1er appel : tout de suite (microtâche)
                    await Promise.resolve(); out.first = calls.slice();
                    let frames = 0, counting = true; const tick = () => { if (!counting) return; frames++; requestAnimationFrame(tick); }; requestAnimationFrame(tick);
                    for (let i = 0; i < 5; i++) { box.append(document.createElement('span')); await new Promise(r => setTimeout(r, 0)); } // 5 tâches, d'ordinaire dans la même image
                    out.frames = frames; counting = false;
                    await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
                    out.after = calls.slice();
                    // un élément précis : rien ne change (microtâche, à chaque fois)
                    const el = []; const o2 = new MutationObserver(recs => el.push(recs.length)); o2.observe(box, { childList: true });
                    box.append('a'); await Promise.resolve(); box.append('b'); await Promise.resolve(); out.el = el.slice();
                    // toute la page mais { lcndaImmediate: true } (la traduction) : immédiat aussi
                    const im = []; const o3 = new MutationObserver(recs => im.push(recs.length)); o3.observe(document.body, { childList: true, subtree: true, lcndaImmediate: true });
                    box.append('c'); await Promise.resolve(); box.append('d'); await Promise.resolve(); out.im = im.slice(); o3.disconnect();
                    // takeRecords rend ce qui attend ; disconnect l'oublie
                    box.append(document.createElement('i')); await Promise.resolve(); box.append(document.createElement('b')); out.taken = mine(o.takeRecords());
                    box.append(document.createElement('u')); await new Promise(r => setTimeout(r, 0)); box.append(document.createElement('s')); await new Promise(r => setTimeout(r, 0));
                    const n0 = calls.length; o.disconnect(); await new Promise(r => requestAnimationFrame(() => setTimeout(r, 120))); out.afterDisconnect = calls.length - n0;
                    o2.disconnect(); box.remove();
                    out.proto = o instanceof MutationObserver && typeof o.observe === 'function';
                    return out;
                });
                assert.deepEqual(r.first, [1], 'le premier changement est donné tout de suite');
                const total = r.after.reduce((a, b) => a + b, 0);
                assert.equal(total, 6, 'aucun changement perdu : ' + JSON.stringify(r.after));
                assert.ok(r.after.length <= Math.min(5, r.frames + 2), `regroupés : ${JSON.stringify(r.after)} en ${r.frames} image(s)`); // un appel tout de suite, puis au plus un par image
                assert.deepEqual(r.el, [1, 1], 'un élément précis : à chaque microtâche, comme avant');
                assert.deepEqual(r.im, [1, 1], '{ lcndaImmediate: true } : à chaque microtâche');
                assert.ok(r.taken >= 1, 'takeRecords');
                assert.ok(r.afterDisconnect <= 1, 'disconnect oublie ce qui attendait');
                assert.ok(r.proto);
            });
            await t(`budgets : utilisable < 45 s (${ready} ms) ; appels des observateurs < 45 000 (${moCalls})`, () => {
                assert.ok(ready < 45000, `${ready} ms`);
                assert.ok(moCalls < 45000, `${moCalls} appels`);
            });
            await t('2e ouverture : scripts et styles pas retéléchargés (304 ou cache du navigateur)', async () => {
                const p2 = await ctx.newPage(); const cdp = await ctx.newCDPSession(p2); await cdp.send('Network.enable');
                let assets = 0, full = 0; const ids = new Map();
                cdp.on('Network.responseReceived', e => { if (/\/assets\/.*\.(js|css)(\?|$)/.test(e.response.url)) ids.set(e.requestId, e.response); });
                cdp.on('Network.loadingFinished', e => { const r = ids.get(e.requestId); if (!r) return; assets++; if (r.status === 200 && !r.fromDiskCache && !r.fromMemoryCache && e.encodedDataLength > 4000) full++; });
                await p2.goto(base); await p2.waitForFunction(() => window.__ready > 0, null, { timeout: 90000 }); await sleep(1500);
                await p2.close();
                assert.ok(assets > 300, `${assets} fichiers`);
                assert.ok(full < assets * 0.1, `${full} sur ${assets} retéléchargés`);
            });
            await t('🔎 widget « Ce qui le concerne » loin en bas : rien de calculé ; rempli quand il vient à l’écran', async () => {
                await page.evaluate(() => { const W = window.LCNDA_EXT.dashboard.tout_sur; const d = document.createElement('div'); d.id = 'perf-ts';
                    d.innerHTML = `<div style="height:4000px"></div>${W.render(1, { config: {} }, 'span-6')}`; document.getElementById('workspace').append(d); });
                await sleep(2500);
                assert.equal(await page.$('#perf-ts .ts-widget .ts-head'), null, 'calculé alors qu’on ne le voit pas');
                await page.evaluate(() => document.querySelector('#perf-ts .ts-widget').scrollIntoView());
                await page.waitForSelector('#perf-ts .ts-widget .ts-head', { timeout: 30000 });
                await page.evaluate(() => document.getElementById('perf-ts').remove());
            });
            await t('« @[Nom|id] » ajouté à la page devient un lien vers la fiche', async () => {
                await page.evaluate(() => { const d = document.createElement('div'); d.id = 'perf-men'; d.innerHTML = '<p>Vu chez @[Jean Essai|1] hier</p>'; document.getElementById('workspace').append(d); });
                await page.waitForSelector('#perf-men button.h-mention[data-h-person="1"]', { timeout: 10000 });
                await page.evaluate(() => { const p = document.querySelector('#perf-men p'); p.firstChild.nodeValue = 'Puis @[Marie Essai|2] '; });
                await page.waitForSelector('#perf-men button.h-mention[data-h-person="2"]', { timeout: 10000 });
                await page.evaluate(() => document.getElementById('perf-men').remove());
            });
            await t('les poignées ⠿ ajoutées à la page sont prêtes (clavier)', async () => {
                await page.evaluate(() => { const d = document.createElement('div'); d.id = 'perf-grip'; d.innerHTML = '<ul><li><span class="dnd-grip">☰</span> a</li></ul>'; document.getElementById('workspace').append(d); });
                await page.waitForFunction(() => document.querySelector('#perf-grip .dnd-grip')?.dataset.gripDone === '1', null, { timeout: 10000 });
                assert.equal(await page.evaluate(() => document.querySelector('#perf-grip .dnd-grip').textContent), '⠿');
                await page.evaluate(() => document.getElementById('perf-grip').remove());
            });
            await t('🌘 éclipses vues d’un lieu : le 2e calcul vient du cache (mêmes lignes), gardé dans sessionStorage', async () => {
                const r = await page.evaluate(async () => {
                    const E = window.LCNDA_EXT.eclipsesListe; if (!E) return null;
                    const q = { near: { lat: 45.27, lon: 1.77, km: 1, title: 'Tulle', country: 'FR' }, years: { from: 1700, to: 1800, mode: 'overlap' } };
                    const t0 = performance.now(); const a = await E.run(q); const t1 = performance.now();
                    const b = await E.run({ ...q, sort: 'date' }); const t2 = performance.now(); // une autre demande (pas « la dernière ») : le cache du lieu
                    const pick = rows => rows.map(x => [x.id, x.seen, x.local, x.pct, x._seenType, x._km]).sort((x, y) => String(x[0]).localeCompare(String(y[0])));
                    return { same: JSON.stringify(pick(a)) === JSON.stringify(pick(b)), n: a.length, first: t1 - t0, second: t2 - t1, kept: !!sessionStorage.getItem('lcnda-eclipses-vues') };
                });
                if (!r) return console.log('    (liste des éclipses absente : sauté)');
                assert.ok(r.n > 0, 'des éclipses vues de Tulle au XVIIIᵉ siècle'); assert.ok(r.same, 'mêmes lignes'); assert.ok(r.kept, 'sessionStorage');
                assert.ok(r.second < Math.max(200, r.first / 2), `2e calcul ${Math.round(r.second)} ms (1er ${Math.round(r.first)} ms)`);
            });
            await t('menuHiddenKeys : gardé, mais relu dès qu’on écrit dans localStorage', async () => {
                const r = await page.evaluate(() => {
                    const A = window.LCNDA_APP, before = localStorage.getItem('genealogie-menu-hidden'), a = A.menuHiddenKeys();
                    localStorage.setItem('genealogie-menu-hidden', JSON.stringify([...a, 'perf_essai'])); const b = A.menuHiddenKeys();
                    b.push('modifie'); const c = A.menuHiddenKeys(); // une copie : la modifier ne change pas la suivante
                    if (before === null) localStorage.removeItem('genealogie-menu-hidden'); else localStorage.setItem('genealogie-menu-hidden', before);
                    return { a: a.includes('perf_essai'), b: b.includes('perf_essai'), c: c.includes('modifie'), d: A.menuHiddenKeys().includes('perf_essai') };
                });
                assert.deepEqual(r, { a: false, b: true, c: false, d: false });
            });
            await t('fiche personne, fiche village, Listes → Données, Carte, Réglages : chacune s’ouvre', async () => {
                await page.evaluate(() => { window.LCNDA_EXT.toutSur?.forget?.(); location.hash = '#personnes/1'; });
                await page.waitForSelector('#workspace .person-hero', { timeout: 30000 });
                // 🔎 le bloc « Ce qui le concerne » : loin de l'écran, il attend (app-fiche-lazy.js) ; ses éclipses (calcul lourd) aussi
                await page.waitForSelector('#workspace [data-pblock="tout_sur"]', { timeout: 30000, state: 'attached' });
                const ecl = () => page.evaluate(() => [...(window.LCNDA_EXT.toutSur?.cache?.keys() || [])].filter(k => /^eclipses-(vues|lieu)\|/.test(k)).length);
                const off = await page.evaluate(() => { const r = document.querySelector('#workspace [data-pblock="tout_sur"]').getBoundingClientRect(); return r.top > innerHeight + 220 || r.bottom < -220; });
                if (off) { await sleep(3000); assert.equal(await ecl(), 0, 'éclipses calculées alors que le bloc n’est pas à l’écran'); }
                await page.evaluate(() => document.querySelector('#workspace [data-pblock="tout_sur"]').scrollIntoView());
                await page.waitForSelector('#workspace [data-ts-block] .ts-head', { timeout: 30000 });
                await page.waitForFunction(() => [...(window.LCNDA_EXT.toutSur?.cache?.keys() || [])].some(k => /^eclipses-(vues|lieu)\|/.test(k)), null, { timeout: 30000 }).catch(() => {});
                const planned = await page.evaluate(async () => { const T = window.LCNDA_EXT.toutSur, d = await window.LCNDA_APP.api('person', { id: 1 }); return T.plan({ person: d }).filter(x => /^eclipses-(vues|lieu)$/.test(x.d.id)).length; });
                console.log(`    (bloc 🔎 ${off ? 'hors de l’écran au départ' : 'déjà à l’écran'} ; éclipses prévues : ${planned}, demandées : ${await ecl()})`);
                if (planned) assert.ok(await ecl() > 0, 'à l’écran : les éclipses sont calculées');
                const key = await page.evaluate(async () => (await window.LCNDA_APP.api('villages')).villages?.[0]?.key || '');
                if (key) {
                    await page.evaluate(k => { const s = window.LCNDA_APP.state; s.listType = 'villages'; s.hVillage = k; window.LCNDA_APP.setModule('listes'); }, key);
                    await page.waitForSelector('#workspace .h-village', { timeout: 30000 });
                }
                await page.evaluate(() => { const A = window.LCNDA_APP; A.state.listType = 'donnees'; A.setModule('listes'); });
                await page.waitForSelector('#workspace [data-dr]', { timeout: 30000 });
                await page.evaluate(() => window.LCNDA_APP.setModule('carte'));
                await page.waitForFunction(() => window.LCNDA_APP.state.module === 'carte' && !document.querySelector('#workspace .loading-screen'), null, { timeout: 30000 });
                await page.evaluate(() => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'design'; A.setModule('maintenance'); });
                await page.waitForFunction(() => window.LCNDA_APP.state.module === 'maintenance' && document.querySelector('#workspace .page-header'), null, { timeout: 30000 });
            });
            await t('aucune erreur JavaScript', () => assert.deepEqual(errs, []));
        } finally {
            try { await browser.close(); } catch (_) { /* fermé */ }
        }
    }
    stopServer();
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) { /* gardé */ }
    console.log(`\n${pass} réussi(s), ${fail} échec(s)`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
