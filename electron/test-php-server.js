'use strict';
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
const { PhpServer, findPhp, checkPhp, devBundledPhp } = require('./php-server');

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
  await suite(phpPath, 1);
  await suite(phpPath, 3);
  console.log(`\n${passed} vérifications réussies.`);
})().catch(() => { process.exitCode = 1; });
