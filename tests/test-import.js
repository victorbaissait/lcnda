'use strict';
/**
 * Test de l'ouverture d'une base et de la sauvegarde complète :   npm run test:import
 * Passe par la vraie application (PHP + envoi du fichier comme l'interface), sur des dossiers temporaires.
 *  1. une généalogie d'essai (GEDCOM fictif + 1 photo) → « Sauvegarde complète (.zip) » → ouverte dans une
 *     installation vide : personnes et photo retrouvées ;
 *  2. la base .db seule s'ouvre aussi (la photo est alors signalée manquante) ;
 *  3. une base déjà remplie n'est jamais remplacée ; un fichier qui n'est pas une base est refusé ;
 *  4. import d'un fichier lu sur le disque (application de bureau) : refusé sans le secret du processus principal.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { PhpServer, findPhp, checkPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const phpPath = findPhp([devBundledPhp()]);
let passed = 0;
async function step(name, fn) {
  try { await fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.log('  ✗ ' + name + '\n      ' + (e && e.message ? e.message : e)); process.exitCode = 1; if (e && typeof e === 'object') e.reported = true; throw e; }
}

function count(dbFile, table) {
  const code = `$d=new PDO('sqlite:'.$argv[1]);echo $d->query('SELECT count(*) FROM '.$argv[2])->fetchColumn();`;
  const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code, dbFile, table], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error((r.stderr || r.stdout).trim());
  return Number(r.stdout);
}

async function withServer(dir, fn) {
  const dataDir = path.join(dir, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const s = new PhpServer({ phpPath, appRoot, pool: 1, dataDir, mediaDir: path.join(dir, 'media'), sessionDir: path.join(dataDir, 'sessions'), logFile: path.join(dataDir, 'php.log') });
  s.on('error', () => {});
  await s.start();
  try { return await fn(s, `http://127.0.0.1:${s.port}`); } finally { await s.stop(); }
}

/** Ouvre une session comme la fenêtre, puis envoie le fichier à l'import (comme l'écran d'installation). */
async function upload(s, base, content, name) {
  const home = await fetch(base + '/', { headers: { 'x-carnet-secret': s.secret } });
  const cookie = (home.headers.get('set-cookie') || '').split(';')[0];
  const csrf = JSON.parse(((await home.text()).match(/window\.INSTALL_CSRF = ("[^"]*")/) || [])[1] || '""');
  const fd = new FormData();
  fd.append('file', new Blob([content]), name);
  fd.append('csrf', csrf);
  const r = await fetch(base + '/api.php?action=import_package', { method: 'POST', headers: { 'x-carnet-secret': s.secret, 'X-CSRF-Token': csrf, cookie }, body: fd });
  return { status: r.status, data: await r.json(), csrf, cookie };
}

async function download(s, base, action) {
  const r = await fetch(`${base}/api.php?action=${action}`, { headers: { 'x-carnet-secret': s.secret } });
  assert.equal(r.status, 200, action);
  return Buffer.from(await r.arrayBuffer());
}

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-import-'));
  console.log('Test ouverture de base et sauvegarde complète (' + phpPath + ')');
  const check = checkPhp(phpPath);
  if (!check.ok) throw new Error(check.error || 'extensions manquantes : ' + check.missing.join(', '));

  const photo = path.join(tmp, 'portrait.png');
  fs.writeFileSync(photo, Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex'));
  const ged = path.join(tmp, 'complet.ged');
  fs.writeFileSync(ged, fs.readFileSync(path.join(__dirname, 'fixtures', 'complet.ged'), 'utf8').replace('__PHOTO__', photo));
  let zip, db;

  await step('sauvegarde complète (.zip) : base + photo', async () => {
    await withServer(path.join(tmp, 'A'), async (s, base) => {
      const r = await upload(s, base, fs.readFileSync(ged), 'complet.ged');
      assert.equal(r.status, 200, JSON.stringify(r.data));
      zip = await download(s, base, 'export_full_backup');
      db = await download(s, base, 'export_sqlite');
      assert.equal(zip.subarray(0, 2).toString(), 'PK', 'archive zip');
      assert.ok(zip.includes(Buffer.from('genealogie.db')) && zip.includes(Buffer.from('lcnda-sauvegarde.json')) && zip.includes(Buffer.from('media/')), 'contenu de l’archive');
      const refused = await upload(s, base, db, 'autre.db');
      assert.equal(refused.status, 409, 'une base remplie ne doit jamais être remplacée');
      assert.equal(count(path.join(tmp, 'A', 'data', 'genealogy.sqlite'), 'persons'), 3);
    });
  });

  await step('ouverture de la sauvegarde complète dans une installation vide', async () => {
    const dir = path.join(tmp, 'B');
    await withServer(dir, async (s, base) => {
      const r = await upload(s, base, zip, 'LCNDA-sauvegarde.zip');
      assert.equal(r.status, 200, JSON.stringify(r.data));
      assert.deepEqual([r.data.stats.persons, r.data.stats.media, r.data.stats.media_missing], [3, 1, 0]);
      const home = await (await fetch(base + '/', { headers: { 'x-carnet-secret': s.secret } })).text();
      assert.match(home, /GENEALOGY_READY = true/, 'l’application s’ouvre sur la généalogie');
    });
    assert.equal(fs.readdirSync(path.join(dir, 'media')).filter((f) => f.endsWith('.png')).length, 1, 'photo restaurée');
    assert.equal(count(path.join(dir, 'data', 'genealogy.sqlite'), 'sources'), 1);
  });

  await step('ouverture d’une base .db seule ; fichier invalide refusé', async () => {
    await withServer(path.join(tmp, 'C'), async (s, base) => {
      const bad = await upload(s, base, Buffer.from('ceci n’est pas une base'), 'faux.db');
      assert.equal(bad.status, 422);
      const r = await upload(s, base, db, 'genealogie.db');
      assert.equal(r.status, 200, JSON.stringify(r.data));
      assert.deepEqual([r.data.stats.persons, r.data.stats.media_missing], [3, 1], 'la photo n’est pas dans un .db : signalée manquante');
    });
  });

  await step('import par chemin réservé au processus principal de l’application', async () => {
    await withServer(path.join(tmp, 'D'), async (s, base) => {
      const home = await fetch(base + '/', { headers: { 'x-carnet-secret': s.secret } });
      const cookie = (home.headers.get('set-cookie') || '').split(';')[0];
      const csrf = JSON.parse(((await home.text()).match(/window\.INSTALL_CSRF = ("[^"]*")/) || [])[1] || '""');
      const r = await fetch(base + '/api.php?action=import_local_path', {
        method: 'POST', body: JSON.stringify({ path: ged, csrf }),
        headers: { 'x-carnet-secret': s.secret, 'X-CSRF-Token': csrf, 'content-type': 'application/json', cookie },
      });
      assert.equal(r.status, 403, 'sans le second secret : refusé');
      const ok = await s.importLocalFile(ged);
      assert.equal(ok.status, 200, JSON.stringify(ok.data));
      assert.deepEqual([ok.data.stats.persons, ok.data.stats.media_missing], [3, 0]);
    });
    assert.ok(fs.existsSync(ged), 'le fichier d’origine est toujours là');
  });

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n${passed}/4 vérifications réussies.`);
})().catch((e) => {
  if (!e || !e.reported) console.error(e);
  process.exitCode = 1;
});
