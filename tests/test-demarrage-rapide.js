'use strict';
/**
 * ⏱ Démarrage rapide : les appels du lancement ne s'attendent pas les uns les autres.   node tests/test-demarrage-rapide.js
 *
 * Mesuré (audit) : au lancement, une rafale d'appels semblait « finir ensemble » après ≈ 4 s. Rien ne verrouillait côté PHP
 * (session refermée tout de suite, SQLite en WAL) ; ce qui les retenait :
 *  - « php -S » sans PHP_CLI_SERVER_WORKERS (serve.sh) traite une requête à la fois : la cinquantaine d'appels du tableau
 *    de bord passaient un par un, un calcul lent bloquait tout ;
 *  - trois widgets (controle_summary, semaine, doutes_summary) recalculaient EN MÊME TEMPS le même contrôle de la base
 *    (3 × ≈ 0,7 s de processeur, trois PHP occupés) : un seul le calcule maintenant (verrou, lib/controle.php controle_run) ;
 *  - plusieurs modules demandaient la même lecture en même temps : LCNDA_APP.api ne l'envoie plus qu'une fois.
 *  (Le reste du « finir ensemble » vu dans les outils : le fil principal de la page, occupé à lancer les scripts, ne lit les
 *  réponses qu'entre deux tâches ; le réseau, lui, les a reçues plus tôt : on mesure donc avec Resource Timing.)
 *
 * Vérifie :
 *  1. fichiers : serve.sh lance plusieurs PHP ; la session est refermée dès le jeton CSRF créé ; api() partage les lectures en route ;
 *  2. controle_run : trois PHP qui le demandent en même temps sur un cache vide → un seul calcul (même résultat, même durée notée) ;
 *  3. navigateur (Playwright ; sinon sauté) sur la base d'exemple, serveur à 4 PHP, Internet coupé :
 *     - l'app est utilisable (jeton + écran) en moins de 25 s, chaque appel du lancement répond en moins de 8 s (réseau) ;
 *     - les réponses ne sont pas retenues pour arriver ensemble : pas plus de la moitié dans la même fenêtre de 150 ms ;
 *     - les appels rapides (kiosk_state, genealogies, réglages…) répondent vite (médiane < 3 s) ;
 *     - aucune lecture identique envoyée deux fois en même temps par LCNDA_APP.api ;
 *     - le contrôle est gardé (aucun fichier temporaire laissé) ; aucune erreur JavaScript.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(appRoot, f), 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ✓ ' + name); } catch (e) { fail++; console.log('  ✗ ' + name + '\n    ' + String(e.stack || e).split('\n').slice(0, 8).join('\n    ')); } };

(async () => {
    console.log('Fichiers');
    await t('serve.sh : plusieurs PHP (PHP_CLI_SERVER_WORKERS, 4 par défaut, exporté)', () => {
        const sh = read('serve.sh');
        assert.match(sh, /PHP_CLI_SERVER_WORKERS="\$\{PHP_CLI_SERVER_WORKERS:-4\}"/);
        assert.match(sh, /export PHP_CLI_SERVER_WORKERS/);
    });
    await t('lib/bootstrap.php : session refermée juste après le jeton CSRF (aucune requête n’attend le fichier de session)', () => {
        assert.match(read('lib/bootstrap.php'), /session_start\(\);[\s\S]{0,600}csrf_token\(\);\s*session_write_close\(\);/);
    });
    await t('app.js : une lecture identique en route est partagée, jamais une écriture ni par-dessus une écriture', () => {
        const js = read('assets/js/app.js');
        assert.match(js, /const API_INFLIGHT = new Map\(\)/);
        assert.match(js, /const shared = !writing && !options\.signal && options\.body === undefined;/);
        assert.match(js, /const key = \(state\.writeCount \|\| 0\) \+ /);
        assert.match(read('index.php'), /assets\/js\/app\.js\?v=\d+/);
    });

    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-demarrage-'));
    const dataDir = path.join(tmp, 'base');
    const mk = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), path.join(appRoot, 'scripts', 'exemple-base.php'), dataDir], { cwd: appRoot, encoding: 'utf8', timeout: 120000 });
    if (mk.status !== 0) { console.error(mk.stderr || mk.stdout); process.exit(1); }
    // Internet coupé pour PHP : un proxy qui n'existe pas (échec immédiat, pas d'attente d'un vrai site)
    const env = { ...process.env, GENEALOGY_DATA_DIR: dataDir, GENEALOGY_MEDIA_DIR: path.join(dataDir, 'media'), GENEALOGY_SKIP_REFERENCE: '1',
        http_proxy: 'http://127.0.0.1:9', https_proxy: 'http://127.0.0.1:9', HTTP_PROXY: 'http://127.0.0.1:9', HTTPS_PROXY: 'http://127.0.0.1:9', no_proxy: '', NO_PROXY: '' };
    const cacheDir = path.join(dataDir, 'cache');
    const clearControle = () => { for (const f of fs.existsSync(cacheDir) ? fs.readdirSync(cacheDir) : []) if (/^controle/.test(f)) fs.rmSync(path.join(cacheDir, f), { force: true }); };

    console.log('Contrôle de la base : un seul calcul à la fois');
    await t('3 PHP demandent controle_run en même temps (cache vide) : un seul calcule, les autres lisent son résultat', async () => {
        clearControle();
        const code = "require 'lib/bootstrap.php'; require_once 'lib/controle.php'; $r = controle_run(db()); echo json_encode(['ms' => $r['ms'], 'at' => $r['checked_at'], 'sig' => $r['sig']]);";
        const run = () => new Promise((res, rej) => { const p = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], { cwd: appRoot, env }); let o = '', e = ''; p.stdout.on('data', d => o += d); p.stderr.on('data', d => e += d); p.on('close', c => c === 0 ? res(JSON.parse(o.trim().split('\n').pop())) : rej(new Error(e || o))); });
        const out = await Promise.all([run(), run(), run()]);
        assert.ok(out.every(x => x.sig === out[0].sig), JSON.stringify(out));
        assert.equal(new Set(out.map(x => `${x.ms}|${x.at}`)).size, 1, 'trois calculs au lieu d’un : ' + JSON.stringify(out));
        const after = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], { cwd: appRoot, env, encoding: 'utf8' });
        assert.equal(JSON.parse(after.stdout.trim()).ms, out[0].ms, 'gardé ensuite');
        // « Revérifier » (fresh) recalcule toujours, même avec le verrou
        const fresh = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', "require 'lib/bootstrap.php'; require_once 'lib/controle.php'; usleep(1100000); $r = controle_run(db(), true); echo $r['checked_at'];"], { cwd: appRoot, env, encoding: 'utf8' });
        assert.notEqual(fresh.stdout.trim(), out[0].at, 'Revérifier : nouveau calcul');
    });

    let chromium = null;
    try { ({ chromium } = require('playwright')); } catch (_) { try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); } catch (_) { /* sans navigateur */ } }
    if (!chromium) { console.log('  (Playwright absent : partie navigateur sautée)'); }
    else {
        clearControle();
        const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
        // detached : le groupe entier (PHP et ses 4 processus) est arrêté à la fin
        const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env: { ...env, PHP_CLI_SERVER_WORKERS: '4' }, stdio: 'ignore', detached: true });
        const stopServer = () => { try { process.kill(-proc.pid, 'SIGTERM'); } catch (_) { try { proc.kill(); } catch (_) { /* déjà arrêté */ } } };
        const base = `http://127.0.0.1:${port}/`;
        let browser;
        try {
            for (let i = 0; i < 150; i++) { try { await fetch(base + 'robots.txt'); break; } catch (_) { await sleep(100); } }
            browser = await chromium.launch();
            const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
            await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort()); // pas d'Internet (tuiles…)
            await ctx.addInitScript(() => {
                try { performance.setResourceTimingBufferSize(20000); } catch (_) { /* navigateur ancien */ }
                // les envois de LCNDA_APP.api : une même lecture partie deux fois en même temps ?
                window.__dupes = []; const inflight = new Map(); const orig = window.fetch;
                window.fetch = function (input, init) {
                    const u = String(input && input.href || input); const m = (init && init.method) || 'GET';
                    if (!/api\.php\?action=/.test(u) || m !== 'GET' || !(init && init.headers && init.headers.Accept === 'application/json')) return orig.apply(this, arguments);
                    const n = inflight.get(u) || 0; if (n) window.__dupes.push(u); inflight.set(u, n + 1);
                    const done = () => inflight.set(u, (inflight.get(u) || 1) - 1);
                    const p = orig.apply(this, arguments); p.then(done, done); return p;
                };
            });
            const page = await ctx.newPage();
            const errs = []; page.on('pageerror', e => errs.push(e.message));
            let inflight = 0, last = Date.now();
            page.on('request', r => { if (r.url().includes('api.php')) { inflight++; last = Date.now(); } });
            const off = r => { if (r.url().includes('api.php')) { inflight--; last = Date.now(); } };
            page.on('requestfinished', off); page.on('requestfailed', off);
            const t0 = Date.now();
            await page.goto(base);
            await page.waitForFunction(() => window.LCNDA_APP?.state?.csrf && document.querySelector('#workspace')?.children.length, null, { timeout: 60000 });
            const ready = Date.now() - t0;
            while (!(inflight <= 0 && Date.now() - last > 1500) && Date.now() - t0 < 45000) await sleep(100);
            const res = await page.evaluate(() => performance.getEntriesByType('resource').filter(e => e.name.includes('api.php?action=')).map(e => ({ a: e.name.split('action=')[1].slice(0, 60), s: e.startTime, e: e.responseEnd })));
            const nav = await page.evaluate(() => performance.timeOrigin);
            const startup = res.filter(x => x.s + nav - t0 < 12000); // les appels lancés pendant le démarrage
            const durs = startup.map(x => x.e - x.s).sort((a, b) => a - b);
            const slow = startup.reduce((m, x) => (x.e - x.s > m.e - m.s ? x : m), { e: 0, s: 0, a: '' });
            console.log(`  (utilisable en ${ready} ms ; ${startup.length} appels au démarrage ; le plus lent ${Math.round(slow.e - slow.s)} ms : ${slow.a} ; médiane ${Math.round(durs[durs.length >> 1] || 0)} ms)`);

            console.log('Navigateur');
            await t('l’app est utilisable (jeton + écran) en moins de 25 s', () => assert.ok(ready < 25000, `${ready} ms`));
            await t('chaque appel du lancement répond en moins de 8 s (aucun n’attend un autre longtemps)', () => {
                assert.ok(startup.length >= 10, `${startup.length} appels`);
                assert.ok(slow.e - slow.s < 8000, `${slow.a} : ${Math.round(slow.e - slow.s)} ms`);
            });
            await t('les réponses ne sont pas retenues pour arriver ensemble (≤ 50 % dans une même fenêtre de 150 ms)', () => {
                const ends = startup.map(x => x.e).sort((a, b) => a - b); let worst = 0;
                for (let i = 0, j = 0; i < ends.length; i++) { while (ends[i] - ends[j] > 150) j++; worst = Math.max(worst, i - j + 1); }
                assert.ok(worst <= Math.ceil(ends.length / 2), `${worst} réponses sur ${ends.length} dans la même fenêtre de 150 ms`);
            });
            await t('les appels rapides répondent vite (médiane < 3 s ; kiosk_state, genealogies < 5 s, même sur un ordinateur chargé)', () => {
                assert.ok(durs[durs.length >> 1] < 3000, `médiane ${Math.round(durs[durs.length >> 1])} ms`);
                for (const a of ['kiosk_state', 'genealogies']) for (const x of startup.filter(y => y.a === a)) assert.ok(x.e - x.s < 5000, `${a} : ${Math.round(x.e - x.s)} ms`);
            });
            await t('LCNDA_APP.api n’envoie jamais deux fois la même lecture en même temps', async () => {
                const d = await page.evaluate(() => window.__dupes);
                assert.deepEqual(d, [], d.join('\n'));
                // et chacun reçoit sa propre copie
                const [a, b] = await page.evaluate(async () => { const A = window.LCNDA_APP; const [x, y] = await Promise.all([A.api('kiosk_state'), A.api('kiosk_state')]); x.__mut = 1; return [x, y]; });
                assert.equal(a.__mut, 1); assert.equal(b.__mut, undefined);
            });
            await t('le contrôle de la base est gardé après le lancement (aucun fichier temporaire laissé)', () => {
                const files = fs.existsSync(cacheDir) ? fs.readdirSync(cacheDir).filter(f => /^controle/.test(f)) : [];
                assert.ok(files.includes('controle.json'), files.join(','));
                assert.ok(!files.some(f => f.endsWith('.tmp')), files.join(','));
            });
            await t('aucune erreur JavaScript', () => assert.deepEqual(errs, []));
        } finally {
            try { await browser?.close(); } catch (_) { /* fermé */ }
            stopServer();
        }
    }
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) { /* gardé */ }
    console.log(`\n${pass} réussi(s), ${fail} échec(s)`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
