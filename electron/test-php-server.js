'use strict';
// Les communes livrées avec l'app (lib/reference.php) ne sont pas chargées ici : tests plus rapides.
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * Test automatique du pilotage de PHP, sans ouvrir de fenêtre :   npm run test:php
 * Utilise des dossiers temporaires : ne touche à aucune de tes données.
 * Deux passes : un seul PHP (Mac/Linux aujourd'hui), puis plusieurs PHP derrière le relais (Windows).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { PhpServer, findPhp, checkPhp, checkPhpAsync, devBundledPhp, phpRuntimeArgs, explainPhpFailure, ensureWritableDir, killStalePhp, isVersionedAsset, validPort } = require('./php-server');
const { spawn } = require('node:child_process');
const net = require('node:net');

const appRoot = path.resolve(__dirname, '..');
let passed = 0;
async function step(name, fn) {
  try { await fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.log('  ✗ ' + name + '\n      ' + (e && e.message ? e.message : e)); process.exitCode = 1; throw e; }
}

/**
 * Occupe un PHP pendant `ms` millisecondes, comme un long export : on demande un gros média et on ne lit pas
 * la réponse ; PHP reste bloqué à l'écrire tant que le client ne lit pas.
 */
function busyDownload(server, ms) {
  return new Promise((resolve) => {
    const req = http.get({
      host: '127.0.0.1', port: server.port, path: '/media/gros.bin', agent: false,
      headers: { 'x-carnet-secret': server.secret },
    }, (res) => {
      res.pause();
      setTimeout(() => { req.destroy(); resolve(); }, ms);
    });
    req.on('error', resolve);
  });
}

async function timed(fn) { const t0 = Date.now(); await fn(); return Date.now() - t0; }

async function suite(phpPath, pool) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-test-'));
  console.log(pool > 1 ? `\n— ${pool} processus PHP derrière le relais (mode Windows)` : '\n— un seul processus PHP');
  const server = new PhpServer({
    phpPath, appRoot, pool,
    dataDir: path.join(tmp, 'data'), mediaDir: path.join(tmp, 'media'),
    sessionDir: path.join(tmp, 'sessions'), logFile: path.join(tmp, 'logs', 'php.log'),
  });
  server.on('error', () => {});
  let crashes = 0; server.on('crash', () => { crashes++; });

  try {
    await step('PHP démarre et répond', async () => { await server.start(); assert.ok(server.port > 0); });
    await step('la page d’accueil est servie avec le secret', async () => {
      const r = await server.request('/');
      assert.equal(r.status, 200);
      assert.match(r.body.toString(), /INSTALL_CSRF|GENEALOGY_READY/);
    });
    await step('sans le secret : tout est refusé (403) — page, API, média', async () => {
      for (const p of ['/', '/api.php?action=bootstrap', '/media/x.jpg', '/__health']) {
        const r = await server.request(p, { withSecret: false });
        assert.equal(r.status, 403, p + ' devrait être refusé');
      }
    });
    await step('les dossiers sensibles restent introuvables, même avec le secret', async () => {
      for (const p of ['/data/genealogy.sqlite', '/lib/bootstrap.php', '/electron/main.js', '/package.json', '/.git/config']) {
        const r = await server.request(p);
        assert.ok([400, 404].includes(r.status), p + ' → ' + r.status);
      }
    });
    await step('les données vont dans le dossier utilisateur, pas dans le dossier de l’application', async () => {
      await server.request('/api.php?action=bootstrap');
      // bootstrap.php crée data/backups dans le dossier de données qu'on lui indique (variable GENEALOGY_DATA_DIR)
      assert.ok(fs.existsSync(path.join(tmp, 'data', 'backups')), 'PHP n’utilise pas le dossier de données demandé');
      assert.ok(fs.existsSync(path.join(tmp, 'media')));
      assert.ok(fs.existsSync(path.join(tmp, 'sessions')));
    });
    await step('un média est servi avec le secret (type, lecture partielle) et refusé sans', async () => {
      fs.writeFileSync(path.join(tmp, 'media', 'essai.mp3'), Buffer.alloc(5000, 7));
      const ok = await server.request('/media/essai.mp3');
      assert.equal(ok.status, 200);
      assert.equal(ok.headers['content-type'], 'audio/mpeg');
      assert.equal(ok.body.length, 5000);
      const no = await server.request('/media/essai.mp3', { withSecret: false });
      assert.equal(no.status, 403);
    });
    fs.writeFileSync(path.join(tmp, 'media', 'gros.bin'), Buffer.alloc(128 * 1024 * 1024));
    if (pool > 1) {
      await step('pendant une longue requête, une autre est servie tout de suite', async () => {
        const busy = busyDownload(server, 3000);
        await new Promise((r) => setTimeout(r, 500));
        const ms = await timed(async () => assert.equal((await server.request('/__health')).status, 200));
        await busy;
        assert.ok(ms < 1500, `réponse en ${ms} ms : le relais n'envoie pas la requête à un PHP libre`);
      });
    } else {
      // Pour information : avec un seul PHP, une requête attend la fin de la précédente.
      const busy = busyDownload(server, 2000);
      await new Promise((r) => setTimeout(r, 500));
      const ms = await timed(() => server.request('/__health').catch(() => null));
      await busy;
      console.log(`  (info) pendant une longue requête, une autre a attendu ${ms} ms`);
    }
    await step('PHP planté de force (kill -9) : il redémarre tout seul sur le même port', async () => {
      const oldPort = server.port;
      const restarted = new Promise((res) => server.once('restarted', res));
      server.child.kill('SIGKILL');
      await Promise.race([restarted, new Promise((_, rej) => setTimeout(() => rej(new Error('pas de redémarrage en 15 s')), 15000))]);
      assert.equal(crashes, 1);
      assert.equal(server.port, oldPort);
      const r = await server.request('/__health');
      assert.equal(r.status, 200);
    });
    await step('le journal de PHP est écrit', async () => {
      const log = fs.readFileSync(path.join(tmp, 'logs', 'php.log'), 'utf8');
      assert.match(log, /démarrage de PHP/);
      assert.match(log, /PHP( n°\d+)? s'est arrêté/);
    });
  } finally {
    await server.stop();
  }
  await step('à l’arrêt, plus rien n’écoute (ni le port public, ni les PHP)', async () => {
    await assert.rejects(() => server.request('/__health'));
    for (const b of server.backends) assert.ok(b.child.exitCode !== null || b.child.signalCode, `PHP n°${b.id} tourne encore`);
  });
  fs.rmSync(tmp, { recursive: true, force: true });
}

(async () => {
  const phpPath = findPhp([devBundledPhp()]); // le PHP embarqué s'il est installé, comme l'application
  console.log('Test du pilotage de PHP (' + (phpPath || 'PHP introuvable') + ')');
  await step('PHP est installé', async () => assert.ok(phpPath, 'PHP introuvable : installe-le ou définis GENEALOGY_PHP'));
  await step('PHP a toutes les extensions nécessaires (SQLite, FTS5, zip, gd…)', async () => {
    const c = checkPhp(phpPath);
    assert.ok(c.ok, 'extensions manquantes : ' + (c.missing || []).join(', ') + (c.error ? ' ' + c.error : ''));
  });
  await step('vérification sans bloquer (checkPhpAsync) : même réponse que checkPhp', async () => {
    const c = await checkPhpAsync(phpPath);
    assert.ok(c.ok, c.error || ''); assert.equal(c.version, checkPhp(phpPath).version);
  });
  if (process.platform !== 'win32') await step('PHP trop lent au premier lancement (antivirus, macOS) : « Démarrage trop lent », pas « ne convient pas », et sans attendre la fin du processus', async () => {
    const slow = path.join(os.tmpdir(), 'lcnda-slow-php-' + process.pid + '.sh');
    fs.writeFileSync(slow, '#!/bin/sh\nsleep 6\n', { mode: 0o755 });
    try {
      const t0 = Date.now();
      const c = await checkPhpAsync(slow, { timeouts: [300, 500] });
      assert.ok(Date.now() - t0 < 3000, 'a attendu la fin du processus : ' + (Date.now() - t0) + ' ms');
      assert.equal(c.ok, false); assert.equal(c.slow, true);
      assert.match(c.error, /trop de temps/); assert.doesNotMatch(c.error, /ne convient pas/);
    } finally { fs.rmSync(slow, { force: true }); }
  });
  await step('messages de PHP qui ne démarre pas : antivirus (fichier disparu), droits, macOS (signature), Windows (Visual C++)', async () => {
    assert.match(explainPhpFailure({ error: Object.assign(new Error('spawn php ENOENT'), { code: 'ENOENT' }), phpPath: '/x/php' }), /introuvable \(\/x\/php\).*quarantaine/);
    assert.match(explainPhpFailure({ error: Object.assign(new Error('spawn EACCES'), { code: 'EACCES' }) }), /refuse de lancer/);
    assert.match(explainPhpFailure({ status: null, signal: 'SIGKILL', platform: 'darwin' }), /macOS a bloqué.*Ouvrir quand même/);
    assert.doesNotMatch(explainPhpFailure({ status: null, signal: 'SIGKILL', platform: 'linux' }), /macOS/);
    assert.match(explainPhpFailure({ status: 3221225781, signal: null, platform: 'win32' }), /Visual C\+\+/);
    assert.match(explainPhpFailure({ error: Object.assign(new Error('ETIMEDOUT'), { code: 'ETIMEDOUT' }), signal: 'SIGTERM', timeoutMs: 60000 }), /plus de 60 s.*antivirus/);
  });
  await step('port gardé dans config.json : seulement un entier entre 1024 et 65535 (« abc », 99999, 80, null : non)', async () => {
    for (const ok of [1024, 8080, 65535]) assert.equal(validPort(ok), true, String(ok));
    for (const no of ['abc', '8080', 99999, 80, 0, -1, null, undefined, 1.5, {}, []]) assert.equal(validPort(no), false, JSON.stringify(no));
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-port-'));
    const cwd = process.cwd();
    process.chdir(tmp); // un port « abc » était pris pour un nom de fichier (socket) dans le dossier courant
    const server = new PhpServer({ phpPath, appRoot, pool: 1, preferredPort: 'abc', dataDir: path.join(tmp, 'd'), mediaDir: path.join(tmp, 'm'), sessionDir: path.join(tmp, 's'), logFile: path.join(tmp, 'l', 'php.log') });
    try { await server.start(); assert.ok(validPort(server.port)); assert.ok(!fs.existsSync(path.join(tmp, 'abc'))); } finally { await server.stop(); process.chdir(cwd); fs.rmSync(tmp, { recursive: true, force: true }); }
  });
  await step('port habituel pris par un autre programme : un autre port, noté dans le journal', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-port-'));
    const held = net.createServer(); await new Promise((r) => held.listen(0, '127.0.0.1', r));
    const busy = held.address().port;
    const server = new PhpServer({ phpPath, appRoot, pool: 2, preferredPort: busy, dataDir: path.join(tmp, 'd'), mediaDir: path.join(tmp, 'm'), sessionDir: path.join(tmp, 's'), logFile: path.join(tmp, 'l', 'php.log') });
    try {
      await server.start();
      assert.notEqual(server.port, busy);
      assert.equal((await server.request('/__health')).status, 200);
      assert.match(fs.readFileSync(path.join(tmp, 'l', 'php.log'), 'utf8'), new RegExp(`port habituel ${busy} est pris`));
    } finally { await server.stop(); held.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
  });
  await step('dossier de données inutilisable : message en français qui dit lequel et pourquoi (code LCNDA_DIR)', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-dossier-'));
    const file = path.join(tmp, 'un-fichier'); fs.writeFileSync(file, 'x');
    assert.throws(() => ensureWritableDir(path.join(file, 'data'), 'des données'), (e) => e.code === 'LCNDA_DIR' && /Le dossier des données ne peut pas être utilisé/.test(e.message) && e.message.includes(path.join(file, 'data')) && /Un fichier porte le nom/.test(e.message));
    if (process.platform !== 'win32' && process.getuid && process.getuid() !== 0) {
      const ro = path.join(tmp, 'ro'); fs.mkdirSync(ro); fs.chmodSync(ro, 0o500);
      assert.throws(() => ensureWritableDir(ro, 'des données'), (e) => e.code === 'LCNDA_DIR' && /pas le droit d’y écrire/.test(e.message));
      fs.chmodSync(ro, 0o700);
    }
    ensureWritableDir(path.join(tmp, 'neuf', 'data'), 'des données'); // créé, et rien de laissé dedans
    assert.deepEqual(fs.readdirSync(path.join(tmp, 'neuf', 'data')), []);
    const server = new PhpServer({ phpPath, appRoot, pool: 2, dataDir: path.join(file, 'data'), mediaDir: path.join(tmp, 'm'), sessionDir: path.join(tmp, 's'), logFile: path.join(tmp, 'l', 'php.log') });
    await assert.rejects(() => server.start(), (e) => e.code === 'LCNDA_DIR');
    assert.equal(server.backends.length, 0, 'aucun PHP lancé');
    await server.stop();
    fs.rmSync(tmp, { recursive: true, force: true });
  });
  await step('PHP restés d’un lancement interrompu (plantage de l’app) : arrêtés au lancement suivant, jamais un autre programme', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-orphelin-'));
    const pidFile = path.join(tmp, 'php-en-cours.json');
    const dirs = { dataDir: path.join(tmp, 'd'), mediaDir: path.join(tmp, 'm'), sessionDir: path.join(tmp, 's'), logFile: path.join(tmp, 'l', 'php.log') };
    const first = new PhpServer({ phpPath, appRoot, pool: 2, pidFile, ...dirs });
    await first.start();
    const pids = JSON.parse(fs.readFileSync(pidFile, 'utf8')).php;
    assert.equal(pids.length, 2);
    // l'app « plante » : ses PHP restent (on ne les arrête pas) ; un autre programme sans rapport, lui, ne doit pas être touché
    const other = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { stdio: 'ignore' });
    const list = JSON.parse(fs.readFileSync(pidFile, 'utf8'));
    list.php.push({ pid: other.pid, port: 45678 });
    fs.writeFileSync(pidFile, JSON.stringify(list));
    first._stopping = true; first.backends.forEach((b) => b.child.removeAllListeners('exit')); // comme si l'app avait disparu
    const second = new PhpServer({ phpPath, appRoot, pool: 2, pidFile, ...dirs });
    try {
      await second.start();
      await new Promise((r) => setTimeout(r, 300));
      for (const e of pids) assert.throws(() => process.kill(e.pid, 0), `PHP n° ${e.pid} toujours là`);
      process.kill(other.pid, 0); // toujours vivant
      assert.match(fs.readFileSync(dirs.logFile, 'utf8'), /resté d'un lancement interrompu arrêté/);
      assert.equal(JSON.parse(fs.readFileSync(pidFile, 'utf8')).php.length, 2, 'la liste ne contient que les nouveaux PHP');
    } finally {
      await second.stop(); other.kill();
      for (const b of first.backends) { try { b.child.kill('SIGKILL'); } catch { /* déjà fini */ } }
      await first.stop(); // son relais écoutait encore
    }
    assert.ok(!fs.existsSync(pidFile), 'liste effacée à l’arrêt normal');
    assert.equal(killStalePhp(path.join(tmp, 'absent.json')), 0);
    fs.writeFileSync(pidFile, '{abîmé'); assert.equal(killStalePhp(pidFile), 0);
    fs.rmSync(tmp, { recursive: true, force: true });
  });
  await step('fichiers versionnés (/assets/…?v=) gardés par la fenêtre ; page, API, médias, fichiers sans numéro : jamais', async () => {
    for (const u of ['/assets/js/app.js?v=566', '/assets/css/app.css?v=1', '/assets/i18n/en.json?v=49', '/assets/js/x.js?a=1&v=2']) assert.ok(isVersionedAsset({ method: 'GET', url: u }), u);
    for (const u of ['/assets/js/app.js', '/api.php?action=bootstrap&v=1', '/?v=1', '/media/a.jpg?v=1', '/index.php?v=2', '/assets/js/app.js?vv=1']) assert.ok(!isVersionedAsset({ method: 'GET', url: u }), u);
    assert.ok(!isVersionedAsset({ method: 'POST', url: '/assets/js/app.js?v=1' }));
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-cache-'));
    const server = new PhpServer({ phpPath, appRoot, pool: 2, cacheAssets: true, dataDir: path.join(tmp, 'd'), mediaDir: path.join(tmp, 'm'), sessionDir: path.join(tmp, 's'), logFile: path.join(tmp, 'l', 'php.log') });
    try {
      await server.start();
      const js = await server.request('/assets/js/app-i18n.js?v=49');
      assert.equal(js.status, 200); assert.match(js.headers['cache-control'] || '', /immutable/);
      for (const u of ['/', '/api.php?action=kiosk_state', '/assets/js/app-i18n.js', '/assets/js/absent.js?v=1']) {
        const r = await server.request(u);
        assert.doesNotMatch(r.headers['cache-control'] || '', /immutable|max-age=31536000/, u);
      }
      assert.equal((await server.request('/assets/js/app-i18n.js?v=49', { withSecret: false })).status, 403, 'toujours le secret');
      // la page ne recopie plus le dictionnaire de la langue (3 à 5 Mo) : app-i18n.js le lit à part
      const en = await server.request('/', { headers: { cookie: 'lcnda_lang=en' } });
      assert.doesNotMatch(en.body.toString(), /LCNDA_I18N_DATA=/);
    } finally { await server.stop(); fs.rmSync(tmp, { recursive: true, force: true }); }
  });
  await step('villes du monde en préparation (PHP à part, au lancement) : la recherche répond tout de suite sans elles, sans tout refaire', async () => {
    const { spawnSync } = require('node:child_process');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-monde-'));
    fs.mkdirSync(path.join(tmp, 'cache'), { recursive: true });
    const env = { ...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'm'), GENEALOGY_SKIP_REFERENCE: '' };
    // la préparation tient le verrou (comme prepare_world_reference pendant ~20 s)
    const holder = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-r', "$f=fopen(getenv('GENEALOGY_DATA_DIR').'/cache/world-prepare.lock','c');flock($f,LOCK_EX);echo 'tenu';sleep(30);"], { env, stdio: ['ignore', 'pipe', 'ignore'] });
    await new Promise((r) => holder.stdout.once('data', r));
    try {
      const t0 = Date.now();
      const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', "require 'lib/bootstrap.php'; echo json_encode(['busy' => world_prepare_busy(), 'world' => world_reference() !== null]); prepare_world_reference(); echo ' fini';"], { cwd: appRoot, env, encoding: 'utf8', timeout: 20000 });
      assert.equal(r.stdout.trim(), '{"busy":true,"world":false} fini', r.stderr);
      assert.ok(Date.now() - t0 < 10000, 'la recherche a attendu la préparation : ' + (Date.now() - t0) + ' ms');
      assert.deepEqual(fs.readdirSync(path.join(tmp, 'cache')).filter((f) => /world|\.part$/.test(f) && f !== 'world-prepare.lock'), [], 'rien décompressé une seconde fois');
    } finally { holder.kill('SIGKILL'); fs.rmSync(tmp, { recursive: true, force: true }); }
  });
  await suite(phpPath, 1);
  await suite(phpPath, 3);
  console.log(`\n${passed} vérifications réussies.`);
})().catch(() => { process.exitCode = 1; });
