'use strict';
/**
 * 🚀 Le LANCEMENT de la vraie application de bureau (Electron), comme chez un utilisateur :   node tests/test-lancement-electron.js
 *
 * Lance electron/main.js (Linux : sous xvfb-run ; Mac / Windows : directement) avec un dossier utilisateur à part
 * (CARNET_USER_DATA_DIR), SANS le mode auto-test (CARNET_SELFTEST) qui saute la porte du wifi (setupLan) : c'est ce mode
 * qui avait caché le bug « Démarrage en cours… » pour toujours (gate.on écrasé). La page est lue de l'extérieur par le
 * protocole de débogage de Chromium (--remote-debugging-port), sans rien changer à l'app.
 *
 *  0. sans lancer : tout ce que le processus principal charge est bien dans l'app construite (package.json → build.files) ;
 *  1. base vide (tout premier lancement) : l'écran d'installation s'affiche (pas seulement « Démarrage en cours… »), traduit
 *     dans la langue de l'ordinateur ; fermeture propre (plus aucun PHP) ;
 *  2. grosse base (scripts/grosse-base.php, LANCEMENT_BASE personnes, 20 000 par défaut) : le tableau de bord s'affiche ;
 *     relancée une 2e fois (fichiers gardés par la fenêtre) ;
 *  3. config.json abîmé (coupé, « null », zéros, port « abc », port 99999) : l'app démarre quand même et le répare ;
 *  4. port préféré déjà pris par un autre programme : un autre port, l'app démarre ;
 *  5. deuxième instance ouverte pendant la première : elle se ferme sans boîte d'erreur ; la première reste là ;
 *  6. plantage (processus principal tué) : ses PHP orphelins sont arrêtés au lancement suivant ;
 *  7. PHP lent au premier lancement (antivirus simulé), PHP qui ne répond jamais, PHP cassé, PHP muet comme serveur :
 *     l'app attend, ou un message clair (fatal) au lieu de « Démarrage en cours… » pour toujours ;
 *  8. base abîmée, base tenue par un autre programme : un message qui dit quoi faire ;
 *  9. dossier de données inutilisable (lecture seule, ou un fichier à sa place quand l'essai tourne en root) : message clair.
 * LANCEMENT_SEUL=mesure : mesures avant / après (lancements répétés, médianes), LANCEMENT_DETAIL=1 : où passe le temps.
 * À chaque lancement : aucune promesse rejetée non attrapée, aucune erreur JavaScript, aucune erreur de lancement dans les
 * journaux, et l'interface prête en moins de LANCEMENT_MAX_MS (60 s par défaut : la machine des essais est chargée ; la
 * mesure est affichée).
 *
 * Les messages « fatal » (boîte d'erreur) sont écrits dans un fichier au lieu d'une boîte qu'il faudrait fermer à la main :
 * LCNDA_TEST_FATAL_FILE (jamais dans l'app installée).
 * Sans Electron (node_modules/electron absent) ou sans xvfb-run sous Linux : essai sauté.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');

/* ═════ 0. sans lancer : l'app INSTALLÉE contient-elle tout ce que son lancement demande ? (package.json → build) ═════
 * electron/lan-gate.js manquait dans build.files : l'app construite se serait arrêtée dès son ouverture (« Cannot find
 * module './lan-gate' »), et aucun essai en développement ne pouvait le voir. */
{
    const pkg = JSON.parse(fs.readFileSync(path.join(appRoot, 'package.json'), 'utf8'));
    const files = pkg.build.files;
    const missing = [];
    const seen = new Set();
    const visit = (rel) => {
        if (seen.has(rel)) return; seen.add(rel);
        if (!files.includes(rel)) missing.push(rel);
        const src = fs.readFileSync(path.join(appRoot, rel), 'utf8');
        for (const m of src.matchAll(/require\(\s*'(\.\/[^']+)'\s*\)/g)) visit(path.posix.join(path.posix.dirname(rel), m[1].endsWith('.js') ? m[1] : m[1] + '.js'));
        for (const m of src.matchAll(/path\.join\(__dirname, '([^']+\.(?:html|js))'\)/g)) { if (!/fetch-geo|test-/.test(m[1])) visit(path.posix.join(path.posix.dirname(rel), m[1])); }
    };
    visit(pkg.main);
    assert.deepEqual(missing, [], 'fichiers du processus principal absents de build.files (l’app installée ne démarrerait pas) : ' + missing.join(', '));
    // scripts PHP lancés par l'app (APP_ROOT . '/scripts/…') : dans les fichiers copiés (extraResources)
    const filter = pkg.build.extraResources.find((e) => e.to === 'php-app').filter;
    const scripts = new Set();
    for (const f of fs.readdirSync(path.join(appRoot, 'lib')).filter((x) => x.endsWith('.php'))) {
        for (const m of fs.readFileSync(path.join(appRoot, 'lib', f), 'utf8').matchAll(/APP_ROOT \. '\/(scripts\/[A-Za-z0-9_.-]+)'/g)) scripts.add(m[1]);
    }
    const absent = [...scripts].filter((s) => !filter.includes(s));
    assert.deepEqual(absent, [], 'scripts lancés par l’app mais pas livrés (package.json → extraResources) : ' + absent.join(', '));
    console.log(`✓ paquet : les ${seen.size} fichiers du processus principal et les ${scripts.size} scripts PHP lancés par l’app sont livrés`);
}

let electronBin = '';
try { electronBin = require(path.join(appRoot, 'node_modules', 'electron')); } catch (_) { electronBin = ''; }
if (!electronBin || !fs.existsSync(electronBin)) { console.log('— Electron absent (node_modules/electron) : essai sauté'); process.exit(0); }
const isLinux = process.platform === 'linux';
if (isLinux && spawnSync('sh', ['-c', 'command -v xvfb-run']).status !== 0 && !process.env.DISPLAY) { console.log('— xvfb-run absent : essai sauté'); process.exit(0); }
const phpPath = findPhp([devBundledPhp()]);
if (!phpPath) { console.log('— PHP absent : essai sauté'); process.exit(0); }

const MAX_MS = Number(process.env.LANCEMENT_MAX_MS) || 60000;
const N = Math.max(1000, Number(process.env.LANCEMENT_BASE) || 20000);
const ONLY = process.env.LANCEMENT_SEUL || ''; // « vide », « grosse », … : un seul groupe d'essais
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-lancement-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0, failed = 0;
const measures = [];
const t = async (name, fn) => {
    if (ONLY ? !name.startsWith(ONLY) : name.startsWith('mesure')) return; // « mesure » : seulement si demandé (LANCEMENT_SEUL=mesure)
    try { await fn(); passed++; console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', (e && e.stack) || e); }
};

/** Le lancement : renvoie les mesures, les journaux, la page (CDP) et de quoi fermer. */
async function launch({ name, userData, env = {}, expectFatal = false, timeout = MAX_MS + 30000 }) {
    fs.mkdirSync(userData, { recursive: true });
    const fatalFile = path.join(userData, 'fatal-essai.json');
    fs.rmSync(fatalFile, { force: true });
    fs.rmSync(path.join(userData, 'DevToolsActivePort'), { force: true });
    const args = ['--no-sandbox', '--remote-debugging-port=0', appRoot];
    const cmd = isLinux && !process.env.DISPLAY ? 'xvfb-run' : electronBin;
    const cmdArgs = cmd === 'xvfb-run' ? ['-a', electronBin, ...args] : args;
    const t0 = Date.now();
    const child = spawn(cmd, cmdArgs, {
        cwd: appRoot, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, CARNET_USER_DATA_DIR: userData, ELECTRON_ENABLE_LOGGING: '1', LCNDA_NO_WORLD_FETCH: '1', LCNDA_TEST_FATAL_FILE: fatalFile, CARNET_CACHE_ASSETS: '1', ...env }, // CARNET_CACHE_ASSETS : comme l'app installée
    });
    let logs = '';
    child.stdout.on('data', (c) => { logs += c; });
    child.stderr.on('data', (c) => { logs += c; });
    let exited = null;
    child.on('exit', (code, signal) => { exited = { code, signal, at: Date.now() - t0 }; });
    const r = { name, userData, child, t0, ms: {}, events: [], get logs() { return logs; }, get exited() { return exited; }, fatal: null, ws: null, kind: null };
    r.kill = () => { try { process.kill(-child.pid, 'SIGKILL'); } catch (_) { /* déjà fini */ } };
    launched.add(r);
    const deadline = t0 + timeout;
    // 1) la boîte d'erreur (fatal) ou le port de débogage
    let port = 0;
    while (Date.now() < deadline) {
        if (fs.existsSync(fatalFile)) { try { r.fatal = JSON.parse(fs.readFileSync(fatalFile, 'utf8')); } catch (_) { r.fatal = { title: '?', message: fs.readFileSync(fatalFile, 'utf8') }; } r.ms.fatal = Date.now() - t0; break; }
        if (exited) break;
        if (!port) { try { port = Number(fs.readFileSync(path.join(userData, 'DevToolsActivePort'), 'utf8').split('\n')[0]) || 0; if (port) r.ms.window = Date.now() - t0; } catch (_) { /* pas encore */ } }
        if (port) {
            try {
                const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
                // la grande fenêtre : d'abord « Démarrage en cours… » (loading.html), puis l'app dans la même page
                const page = list.find((p) => p.type === 'page' && (/loading\.html$/.test(p.url) || /^http:\/\/127\.0\.0\.1:\d+\/(#.*)?$/.test(p.url)));
                if (page && !r.ws) {
                    r.ws = await cdp(page.webSocketDebuggerUrl, r.events);
                    await r.ws.send('Runtime.enable').catch(() => {}); // erreurs JavaScript et console.error de la page, dès le début
                    if (process.env.LANCEMENT_DETAIL) await r.ws.send('Network.enable').catch(() => {});
                }
                if (page && /^http:/.test(page.url)) {
                    if (!r.ms.appUrl) r.ms.appUrl = Date.now() - t0;
                    const kind = await r.ws.eval(READY).catch((e) => { if (/CDP/.test(e.message)) { r.ws.close(); r.ws = null; } return null; }); // connexion perdue : on se reconnecte
                    if (kind) { r.kind = kind; r.ms.ui = Date.now() - t0; break; }
                }
            } catch (_) { /* la page se charge */ }
        }
        await sleep(150);
    }
    if (expectFatal && !r.fatal) { // la boîte peut arriver juste après la fin de l'attente
        for (let i = 0; i < 20 && !r.fatal && !exited; i++) { await sleep(250); if (fs.existsSync(fatalFile)) { r.fatal = JSON.parse(fs.readFileSync(fatalFile, 'utf8')); r.ms.fatal = Date.now() - t0; } }
    }
    if (r.ws && r.kind) { try { r.ms.dcl = await r.ws.eval("Math.round(performance.getEntriesByType('navigation')[0].domContentLoadedEventEnd)"); } catch (_) { /* rien */ } }
    if (process.env.LANCEMENT_DETAIL && r.ws && r.kind) { // LANCEMENT_DETAIL=1 : où passe le temps dans la page
        try {
            r.detail = await r.ws.eval(`(() => { const n = performance.getEntriesByType('navigation')[0] || {}; const res = performance.getEntriesByType('resource');
                const by = (k) => res.filter((e) => e.initiatorType === k).length;
                const api = res.filter((e) => /api\\.php/.test(e.name));
                return { ttfb: Math.round(n.responseStart), html: Math.round(n.responseEnd), dcl: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd),
                    resources: res.length, scripts: by('script'), css: by('link'), api: api.length, apiMs: api.map((e) => Math.round(e.responseEnd - e.startTime) + ' ' + e.name.replace(/^.*action=/, '')).slice(0, 40),
                    cached: res.filter((e) => e.transferSize === 0 && e.decodedBodySize > 0).length, bytes: res.reduce((s, e) => s + (e.decodedBodySize || 0), 0),
                    slowest: res.slice().sort((a, b) => b.duration - a.duration).slice(0, 8).map((e) => Math.round(e.duration) + ' ' + e.name.replace(/^.*\\//, '')), now: Math.round(performance.now()) }; })()`);
            console.log('     détail : ' + JSON.stringify(r.detail));
            // requêtes à l'API pendant le lancement (Network) : la plus lente d'abord
            const reqs = new Map();
            for (const e of r.events) {
                if (e.method === 'Network.requestWillBeSent') reqs.set(e.params.requestId, { url: e.params.request.url, t: e.params.timestamp });
                if (e.method === 'Network.loadingFinished' && reqs.has(e.params.requestId)) reqs.get(e.params.requestId).end = e.params.timestamp;
            }
            const all = [...reqs.values()].filter((x) => x.end);
            const t0n = Math.min(...all.map((x) => x.t));
            const api = all.filter((x) => /api\.php/.test(x.url)).map((x) => `${Math.round((x.t - t0n) * 1000)}+${Math.round((x.end - x.t) * 1000)} ${x.url.replace(/^.*action=/, '')}`);
            console.log(`     requêtes : ${all.length} (dont ${api.length} à l'API), dernière finie à ${Math.round((Math.max(...all.map((x) => x.end)) - t0n) * 1000)} ms ; API (début+durée) : ${api.join(' | ')}`);
        } catch (e) { console.log('     détail impossible : ' + e.message); }
    }
    measures.push({ name, ...r.ms, kind: r.kind, fatal: r.fatal && r.fatal.title });
    console.log(`   ${name.padEnd(40)} fenêtre ${fmt(r.ms.window)}  page ${fmt(r.ms.appUrl)}  interface ${fmt(r.ms.ui)}${r.kind ? ' (' + r.kind + ')' : ''}${r.fatal ? '  fatal « ' + r.fatal.title + ' » en ' + fmt(r.ms.fatal) : ''}`);
    return r;
}
const fmt = (ms) => (ms ? String(ms).padStart(6) + ' ms' : '     — ');

/** L'interface principale est-elle là ? « app » (tableau de bord ou écran de la base), « install » (base vide), sinon null. */
const READY = `(() => {
    if (location.protocol !== 'http:' || document.readyState !== 'complete') return null;
    const w = document.querySelector('#workspace'); if (!w) return null;
    if (window.GENEALOGY_READY) {
        if (w.querySelector('.empty-state .eyebrow') && /ERREUR/.test(w.querySelector('.empty-state .eyebrow').textContent)) return 'erreur : ' + w.textContent.trim().slice(0, 200);
        return w.querySelector('.page-header') && w.children.length ? 'app' : null;
    }
    const s = document.querySelector('#install-screen'); return s && s.getClientRects().length ? 'install' : null;
})()`;

/** Un petit client du protocole de débogage (WebSocket de Node 22). */
function cdp(url, events = []) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(url);
        let id = 0; const pending = new Map();
        ws.onmessage = (m) => {
            const d = JSON.parse(m.data);
            if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.reject(new Error(d.error.message)) : p.resolve(d.result); }
            else if (d.method) events.push(d);
        };
        let open = false;
        ws.onerror = () => { if (!open) reject(new Error('CDP injoignable')); };
        // page fermée ou rechargée : les questions en cours échouent au lieu d'attendre pour toujours (Node quitterait sans rien dire)
        ws.onclose = () => { if (!open) reject(new Error('CDP fermé')); for (const p of pending.values()) p.reject(new Error('CDP fermé')); pending.clear(); };
        ws.onopen = () => {
            open = true;
            const send = (method, params = {}) => new Promise((res, rej) => {
                if (ws.readyState !== 1) { rej(new Error('CDP fermé')); return; }
                const i = ++id; pending.set(i, { resolve: res, reject: rej }); ws.send(JSON.stringify({ id: i, method, params }));
                setTimeout(() => { if (pending.has(i)) { pending.delete(i); rej(new Error('CDP : pas de réponse à ' + method)); } }, 20000);
            });
            resolve({
                send, events,
                eval: async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.text); return r.result.value; },
                close: () => { try { ws.close(); } catch (_) { /* rien */ } },
            });
        };
    });
}

/** Ferme l'app comme un utilisateur (toutes les fenêtres → quitter) et attend la fin de tous ses processus. */
async function quit(r, ms = 20000) {
    if (r.ws) {
        try { await r.ws.eval('window.close(), true'); } catch (_) { /* la page se ferme */ }
        r.ws.close();
    }
    const t1 = Date.now();
    while (!r.exited && Date.now() - t1 < ms) await sleep(100);
    const clean = !!r.exited;
    r.kill();
    return clean;
}

/** Ce qui ne doit jamais apparaître dans les journaux d'un lancement. */
function badLines(logs) {
    return logs.split('\n').filter((l) => /Unhandled|unhandledRejection|promesse rejetée|Uncaught|UnhandledPromiseRejection|\[lancement\] ERREUR|TypeError|ReferenceError|SyntaxError|Error occurred in handler|A JavaScript error occurred/i.test(l)
        // bruit connu de Chromium sous xvfb (dbus, GPU) : pas des erreurs de l'app
        && !/dbus|gpu|viz|gbm|Floss|bluez|power_observer|shared_image/i.test(l));
}
function assertCleanLogs(r) {
    const bad = badLines(r.logs);
    assert.deepEqual(bad, [], 'journaux du lancement « ' + r.name + ' » :\n' + bad.join('\n'));
    // erreurs JavaScript de la page et console.error, vues par le protocole de débogage
    const js = r.events.filter((e) => e.method === 'Runtime.exceptionThrown' || (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error'))
        .map((e) => e.method === 'Runtime.exceptionThrown' ? 'exception : ' + ((e.params.exceptionDetails.exception && e.params.exceptionDetails.exception.description) || e.params.exceptionDetails.text) : 'console.error : ' + e.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
    assert.deepEqual(js, [], 'erreurs JavaScript dans la page « ' + r.name + ' » :\n' + js.join('\n'));
    // et rien de grave dans le journal technique (php.log) : ni erreur de lancement ni erreur PHP fatale
    const logFile = path.join(r.userData, 'logs', 'php.log');
    const plog = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8').split('\n').filter((l) => /ERREUR au lancement|promesse rejetée|erreur non attrapée|PHP Fatal error|PHP Parse error/.test(l)) : [];
    assert.deepEqual(plog, [], 'journal technique de « ' + r.name + ' » :\n' + plog.join('\n'));
}

/** Un faux « php » : script shell qui attend `delay` secondes puis lance le vrai PHP (antivirus qui examine le fichier).
 *  when : 'check' (seulement le contrôle, php -r …) ou 'server' (seulement les serveurs, php -S …). */
function slowPhp(dir, delay, when = 'check') {
    fs.mkdirSync(dir, { recursive: true });
    const f = path.join(dir, 'php');
    const flag = when === 'check' ? '-r' : '-S';
    fs.writeFileSync(f, `#!/bin/sh\nfor a in "$@"; do if [ "$a" = "${flag}" ]; then sleep ${delay}; fi; done\nexec ${JSON.stringify(phpPath)} "$@"\n`, { mode: 0o755 });
    return f;
}

function freePortHeld() {
    return new Promise((resolve) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => resolve(s)); });
}

function makeBigBase(dir) {
    const t0 = Date.now();
    fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-d', 'memory_limit=2048M', path.join(appRoot, 'scripts/grosse-base.php'), String(N), '1789'], {
        cwd: appRoot, encoding: 'utf8', maxBuffer: 1 << 24,
        env: { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media'), GENEALOGY_SKIP_REFERENCE: '1' },
    });
    if (r.status !== 0 || !/^ok/m.test(r.stdout)) throw new Error('grosse base : ' + (r.stderr || r.stdout).slice(-500));
    console.log(`   grosse base : ${N} personnes, fabriquée en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}
function copyDir(from, to) { fs.cpSync(from, to, { recursive: true }); }

let finished = false;
// l'essai arrêté en route (Ctrl+C, délai dépassé) : aucune app lancée ne doit rester derrière lui
const launched = new Set();
process.on('exit', () => { for (const r of launched) r.kill(); if (!finished) console.error('✗ l’essai s’est arrêté avant la fin (une attente sans réponse ?)'); });
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => process.exit(130));
(async () => {
    const all = [];
    const finish = (r) => { all.push(r); return r; };

    await t('vide : tout premier lancement (base vide, porte du wifi comprise) → écran d’installation, journaux propres, fermeture propre', async () => {
        const u = path.join(tmpRoot, 'vide');
        const r = finish(await launch({ name: 'base vide (1er lancement)', userData: u }));
        assert.equal(r.fatal, null, 'fatal : ' + JSON.stringify(r.fatal));
        assert.equal(r.kind, 'install', 'interface : ' + r.kind + '\n' + r.logs.slice(-3000));
        assert.ok(r.ms.ui < MAX_MS, 'trop lent : ' + r.ms.ui + ' ms');
        // la porte du wifi a bien été préparée (setupLan) et reste coupée : rien d'écrit qui l'ouvrirait
        const cfg = JSON.parse(fs.readFileSync(path.join(u, 'config.json'), 'utf8'));
        assert.ok(cfg.port > 1024, 'port gardé dans config.json');
        const log = fs.readFileSync(path.join(u, 'logs', 'php.log'), 'utf8');
        assert.match(log, /\[app\] lancement : /, 'chronomètre du lancement dans le journal');
        // la langue de l'ordinateur (premier lancement) : le dictionnaire est bien chargé, même sans être recopié dans la page
        const lang = await r.ws.eval(`({ lang: document.documentElement.lang, i18n: window.LCNDA_I18N && window.LCNDA_I18N.lang, title: document.title, inline: !!window.LCNDA_I18N_DATA })`);
        console.log('   langue de la page : ' + lang.lang + ' (' + lang.title + ')');
        if (lang.lang !== 'fr') {
            assert.equal(lang.i18n, lang.lang, JSON.stringify(lang));
            assert.notEqual(lang.title, 'Carnet numérique des ancêtres', 'titre traduit : ' + JSON.stringify(lang));
            assert.equal(lang.inline, false, 'dictionnaire lu à part (gardé par la fenêtre), pas recopié dans la page');
        }
        await sleep(1500); // laisser passer les premières requêtes de la page
        assertCleanLogs(r);
        assert.ok(await quit(r), 'l’app ne s’est pas fermée');
        assert.match(fs.readFileSync(path.join(u, 'logs', 'php.log'), 'utf8'), /\[app\] fermeture/, 'fermeture notée');
        // plus aucun PHP de ce lancement
        await sleep(500);
        const ps = spawnSync('sh', ['-c', `ps -eo args | grep -F ${JSON.stringify(u)} | grep -v grep || true`], { encoding: 'utf8' }).stdout.trim();
        assert.equal(ps, '', 'processus restés : ' + ps);
    });

    let bigBase = '';
    await t('grosse : grosse base (tableau de bord), puis 2e lancement', async () => {
        bigBase = path.join(tmpRoot, 'grosse-modele');
        makeBigBase(bigBase);
        const u = path.join(tmpRoot, 'grosse');
        copyDir(bigBase, path.join(u, 'data'));
        for (const name of ['grosse base (1er lancement)', 'grosse base (2e lancement)']) {
            const r = finish(await launch({ name, userData: u }));
            assert.equal(r.fatal, null, 'fatal : ' + JSON.stringify(r.fatal));
            assert.equal(r.kind, 'app', 'interface : ' + r.kind + '\n' + r.logs.slice(-3000));
            assert.ok(r.ms.ui < MAX_MS, 'trop lent : ' + r.ms.ui + ' ms');
            await sleep(1500);
            assertCleanLogs(r);
            assert.ok(await quit(r), 'l’app ne s’est pas fermée');
        }
    });

    // LANCEMENT_SEUL=mesure : avant / après, plusieurs lancements de suite (médianes), fichiers gardés par la fenêtre ou non
    await t('mesure : lancements répétés (LANCEMENT_REPETE fois), sans puis avec le cache des fichiers versionnés', async () => {
        const n = Number(process.env.LANCEMENT_REPETE) || 4;
        const med = (a) => { const b = a.filter((x) => x).sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : 0; };
        if (!bigBase) { bigBase = path.join(tmpRoot, 'grosse-modele'); makeBigBase(bigBase); }
        for (const base of (process.env.LANCEMENT_MESURE_BASES || 'vide,grosse').split(',')) {
            for (const cache of (process.env.LANCEMENT_MESURE_CACHE || '0,1').split(',')) {
                const u = path.join(tmpRoot, `mesure-${base}-${cache}`);
                if (base === 'grosse') copyDir(bigBase, path.join(u, 'data'));
                const rows = [];
                for (let i = 0; i < n + 1; i++) {
                    const r = finish(await launch({ name: `mesure ${base} cache=${cache} n°${i}`, userData: u, env: { CARNET_CACHE_ASSETS: cache } }));
                    assert.ok(r.kind, 'interface absente');
                    await sleep(base === 'grosse' ? 4000 : 1000);
                    assert.ok(await quit(r));
                    if (i > 0) rows.push(r.ms); // le 1er lancement prépare la base : à part
                }
                console.log(`   ⏱ ${base} cache=${cache} : page ${med(rows.map((x) => x.appUrl))} ms, DOMContentLoaded ${med(rows.map((x) => x.dcl))} ms après la page, interface ${med(rows.map((x) => x.ui))} ms (médianes de ${rows.length})`);
            }
        }
    });

    await t('config : config.json abîmé (illisible, null, tableau, port farfelu) → l’app démarre quand même', async () => {
        for (const [label, content] of [['illisible', '{"port": 4'], ['null', 'null'], ['zéros', '\u0000\u0000\u0000\u0000'], ['port texte', '{"port":"abc","reminderNotifications":"x"}'], ['port hors limites', '{"port":99999}']]) {
            const u = path.join(tmpRoot, 'config-' + label.replace(/\W+/g, '-'));
            fs.mkdirSync(u, { recursive: true });
            fs.writeFileSync(path.join(u, 'config.json'), content);
            const r = finish(await launch({ name: 'config.json ' + label, userData: u }));
            assert.equal(r.fatal, null, label + ' → fatal : ' + JSON.stringify(r.fatal));
            assert.equal(r.kind, 'install', label + ' → interface : ' + r.kind + '\n' + r.logs.slice(-2000));
            assertCleanLogs(r);
            assert.ok(await quit(r));
            const cfg = JSON.parse(fs.readFileSync(path.join(u, 'config.json'), 'utf8'));
            assert.ok(Number.isInteger(cfg.port) && cfg.port > 1024 && cfg.port < 65536, label + ' : config.json réparé (' + JSON.stringify(cfg) + ')');
            assert.ok(!fs.existsSync(path.join(u, 'abc')), 'aucun fichier « abc » créé (port pris pour un nom de fichier)');
        }
    });

    await t('port : le port préféré est pris par un autre programme → un autre port', async () => {
        const held = await freePortHeld();
        const busy = held.address().port;
        const u = path.join(tmpRoot, 'port');
        fs.mkdirSync(u, { recursive: true });
        fs.writeFileSync(path.join(u, 'config.json'), JSON.stringify({ port: busy }));
        const r = finish(await launch({ name: 'port préféré pris', userData: u }));
        held.close();
        assert.equal(r.fatal, null, JSON.stringify(r.fatal));
        assert.equal(r.kind, 'install');
        assertCleanLogs(r);
        assert.ok(await quit(r));
        assert.notEqual(JSON.parse(fs.readFileSync(path.join(u, 'config.json'), 'utf8')).port, busy);
    });

    await t('instance : une 2e instance pendant la 1re → elle se ferme seule, la 1re reste utilisable', async () => {
        const u = path.join(tmpRoot, 'instance');
        const r1 = finish(await launch({ name: '1re instance', userData: u }));
        assert.equal(r1.kind, 'install');
        // la seconde : même dossier utilisateur (même verrou) ; elle doit quitter vite, sans boîte d'erreur
        const second = spawn(isLinux && !process.env.DISPLAY ? 'xvfb-run' : electronBin, [...(isLinux && !process.env.DISPLAY ? ['-a', electronBin] : []), '--no-sandbox', appRoot], {
            cwd: appRoot, detached: true, stdio: 'ignore', env: { ...process.env, CARNET_USER_DATA_DIR: u, LCNDA_NO_WORLD_FETCH: '1', LCNDA_TEST_FATAL_FILE: path.join(u, 'fatal-2e.json') },
        });
        const code = await new Promise((res) => { const k = setTimeout(() => { try { process.kill(-second.pid, 'SIGKILL'); } catch (_) { /* rien */ } res('bloquée'); }, 30000); second.on('exit', (c) => { clearTimeout(k); res(c); }); });
        assert.equal(code, 0, '2e instance : ' + code);
        assert.ok(!fs.existsSync(path.join(u, 'fatal-2e.json')), 'pas de boîte d’erreur pour la 2e instance');
        assert.equal(await r1.ws.eval(READY), 'install', 'la 1re instance est toujours là');
        assertCleanLogs(r1);
        assert.ok(await quit(r1));
    });

    await t('plantage : l’app arrêtée net (plantage, coupure) laisse ses PHP → arrêtés au lancement suivant, qui démarre normalement', async () => {
        const u = path.join(tmpRoot, 'plantage');
        const r1 = finish(await launch({ name: 'avant le plantage', userData: u }));
        assert.equal(r1.kind, 'install');
        const list = JSON.parse(fs.readFileSync(path.join(u, 'php-en-cours.json'), 'utf8'));
        assert.equal(list.php.length, 4, 'les 4 PHP sont notés');
        r1.ws.close();
        process.kill(list.app, 'SIGKILL'); // le processus principal d'Electron seulement : ses PHP restent orphelins
        await sleep(1500);
        const alive = list.php.filter((e) => { try { process.kill(e.pid, 0); return true; } catch (_) { return false; } });
        assert.equal(alive.length, 4, 'les PHP sont bien restés (sinon l’essai ne prouve rien)');
        // (pas de r1.kill() ici : il tuerait tout le groupe de processus, PHP orphelins compris, et l'essai ne prouverait rien)
        const r2 = finish(await launch({ name: 'après le plantage', userData: u }));
        assert.equal(r2.kind, 'install');
        await sleep(300);
        for (const e of list.php) assert.throws(() => process.kill(e.pid, 0), `PHP n° ${e.pid} du lancement planté toujours là`);
        assert.match(fs.readFileSync(path.join(u, 'logs', 'php.log'), 'utf8'), /resté d'un lancement interrompu arrêté/);
        assertCleanLogs(r2);
        assert.ok(await quit(r2));
        assert.ok(!fs.existsSync(path.join(u, 'php-en-cours.json')), 'liste effacée à la fermeture normale');
        r1.kill();
    });

    await t('php : PHP lent au premier lancement (contrôle 4 s) → l’app attend et démarre', async () => {
        const u = path.join(tmpRoot, 'php-lent');
        const r = finish(await launch({ name: 'PHP lent (contrôle 4 s)', userData: u, env: { GENEALOGY_PHP: slowPhp(path.join(tmpRoot, 'php-lent-bin'), 4) } }));
        assert.equal(r.fatal, null, JSON.stringify(r.fatal));
        assert.equal(r.kind, 'install');
        assertCleanLogs(r);
        assert.ok(await quit(r));
    });

    await t('php : PHP qui ne répond pas du tout (délais d’essai raccourcis) → « Démarrage trop lent », pas d’écran figé', async () => {
        const u = path.join(tmpRoot, 'php-bloque');
        const r = finish(await launch({ name: 'PHP qui ne répond pas', userData: u, expectFatal: true, env: { GENEALOGY_PHP: slowPhp(path.join(tmpRoot, 'php-bloque-bin'), 60), LCNDA_TEST_PHP_TIMEOUTS: '1500,1500' } }));
        assert.ok(r.fatal, 'aucun message : ' + r.logs.slice(-2000));
        assert.equal(r.fatal.title, 'Démarrage trop lent');
        assert.match(r.fatal.message, /antivirus/);
        assert.match(r.fatal.message, /Journal/, 'le message dit où est le journal');
        r.kill();
    });

    await t('php : un « PHP » cassé (programme qui échoue) → « PHP incomplet » avec la raison', async () => {
        const d = path.join(tmpRoot, 'php-casse-bin'); fs.mkdirSync(d, { recursive: true });
        const f = path.join(d, 'php'); fs.writeFileSync(f, '#!/bin/sh\necho "erreur de chargement : libfoo.so introuvable" >&2\nexit 127\n', { mode: 0o755 });
        const r = finish(await launch({ name: 'PHP cassé', userData: path.join(tmpRoot, 'php-casse'), expectFatal: true, env: { GENEALOGY_PHP: f } }));
        assert.ok(r.fatal, 'aucun message');
        assert.equal(r.fatal.title, 'PHP incomplet');
        assert.match(r.fatal.message, /libfoo/);
        r.kill();
    });

    await t('php : PHP qui démarre puis ne répond jamais au serveur (délai raccourci) → message clair', async () => {
        const r = finish(await launch({ name: 'PHP muet (serveur)', userData: path.join(tmpRoot, 'php-muet'), expectFatal: true,
            env: { GENEALOGY_PHP: slowPhp(path.join(tmpRoot, 'php-muet-bin'), 60, 'server'), LCNDA_TEST_READY_MS: '2500' } }));
        assert.ok(r.fatal, 'aucun message');
        assert.equal(r.fatal.title, 'Démarrage trop lent');
        assert.match(r.fatal.message, /antivirus/);
        // rien ne reste derrière : les PHP lancés sont arrêtés avant de quitter
        for (let i = 0; i < 40 && !r.exited; i++) await sleep(250);
        assert.ok(r.exited, 'l’app ne s’est pas fermée après le message');
        r.kill();
    });

    await t('base : fichier de la base abîmé → message clair (copies de sauvegarde, que faire), pas d’écran figé', async () => {
        const u = path.join(tmpRoot, 'base-abimee');
        fs.mkdirSync(path.join(u, 'data'), { recursive: true });
        fs.writeFileSync(path.join(u, 'data', 'genealogy.sqlite'), Buffer.alloc(8192, 0x41)); // pas une base SQLite
        const r = finish(await launch({ name: 'base abîmée', userData: u, expectFatal: true }));
        assert.ok(r.fatal, 'aucun message : ' + r.logs.slice(-1500));
        assert.equal(r.fatal.title, 'La base de données n’a pas pu être ouverte');
        assert.match(r.fatal.message, /abîmé.*backups/s);
        assert.equal(r.fatal.action, 'Ouvrir le dossier des données');
        r.kill();
    });

    await t('base : base tenue par un autre programme (verrou exclusif) → « occupée par un autre programme »', async () => {
        const u = path.join(tmpRoot, 'base-tenue');
        copyDir(bigBase || (makeBigBase(path.join(tmpRoot, 'grosse-modele')), path.join(tmpRoot, 'grosse-modele')), path.join(u, 'data'));
        const db = path.join(u, 'data', 'genealogy.sqlite');
        const holder = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-r', "$p=new PDO('sqlite:'.getenv('DB'));$p->exec('PRAGMA locking_mode=EXCLUSIVE');$p->exec('BEGIN EXCLUSIVE');$p->exec('CREATE TABLE IF NOT EXISTS essai_verrou(x)');echo 'tenue';sleep(120);"], { env: { ...process.env, DB: db }, stdio: ['ignore', 'pipe', 'ignore'] });
        await new Promise((res) => holder.stdout.once('data', res));
        try {
            // chaque lecture attend la base jusqu'à 30 s (busy_timeout, lib/bootstrap.php) : le message arrive après 1 à 2 minutes
            const r = finish(await launch({ name: 'base tenue (verrou)', userData: u, expectFatal: true, timeout: 200000 }));
            const status = await (async () => { try { return await r.ws?.eval("document.querySelector('p')?.textContent"); } catch (_) { return ''; } })();
            if (status) console.log('   écran de démarrage : ' + status);
            assert.ok(r.fatal, 'aucun message : ' + r.logs.slice(-1500));
            assert.equal(r.fatal.title, 'La base de données n’a pas pu être ouverte');
            assert.match(r.fatal.message, /occupée par un autre programme/);
            r.kill();
        } finally { holder.kill('SIGKILL'); }
    });

    if (process.getuid && process.getuid() !== 0) {
        await t('lecture : dossier de données en lecture seule → message clair en français', async () => {
            const u = path.join(tmpRoot, 'lecture-seule'); fs.mkdirSync(u, { recursive: true });
            const ro = path.join(tmpRoot, 'ro'); fs.mkdirSync(ro); fs.chmodSync(ro, 0o500);
            const r = finish(await launch({ name: 'données en lecture seule', userData: u, expectFatal: true, env: { GENEALOGY_DATA_DIR: path.join(ro, 'data'), GENEALOGY_MEDIA_DIR: path.join(ro, 'media') } }));
            fs.chmodSync(ro, 0o700);
            assert.ok(r.fatal, 'aucun message : ' + r.logs.slice(-1500));
            assert.match(r.fatal.message, /écrire|lecture seule|droits/);
            r.kill();
        });
    } else {
        await t('lecture : dossier de données impossible à créer (un fichier à sa place) → message clair en français', async () => {
            const u = path.join(tmpRoot, 'lecture-seule'); fs.mkdirSync(u, { recursive: true });
            const blocker = path.join(tmpRoot, 'un-fichier'); fs.writeFileSync(blocker, 'pas un dossier');
            const r = finish(await launch({ name: 'données impossibles à créer', userData: u, expectFatal: true, env: { GENEALOGY_DATA_DIR: path.join(blocker, 'data'), GENEALOGY_MEDIA_DIR: path.join(blocker, 'media') } }));
            assert.ok(r.fatal, 'aucun message : ' + r.logs.slice(-1500));
            assert.match(r.fatal.message, /écrire|lecture seule|droits|dossier/);
            assert.match(r.fatal.message, new RegExp(blocker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'le message dit quel dossier');
            r.kill();
        });
    }

    for (const r of all) r.kill();
    console.log('\nMesures (ms) : ' + JSON.stringify(measures));
    if (process.env.LANCEMENT_RAPPORT) fs.writeFileSync(process.env.LANCEMENT_RAPPORT, JSON.stringify(measures, null, 2));
    try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (_) { /* rien */ }
    console.log(`\n${passed} réussi(s), ${failed} échoué(s)`);
    finished = true;
    process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
