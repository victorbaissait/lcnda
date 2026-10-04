'use strict';
/**
 * Test des migrations de la base (lib/migrations.php) :   npm run test:migrations
 * Bases temporaires créées pour l'occasion : ne touche à aucune de tes données.
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

/** Exécute du PHP en ligne de commande avec le même environnement que l'application. */
function php(code, dataDir) {
  const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], {
    cwd: appRoot, encoding: 'utf8', env: { ...process.env, GENEALOGY_DATA_DIR: dataDir, GENEALOGY_MEDIA_DIR: path.join(dataDir, 'media') },
  });
  if (r.status !== 0) throw new Error((r.stderr || r.stdout || '').trim());
  return r.stdout.trim();
}
const sql = (dataDir, query) => php(`$db=new SQLite3(${JSON.stringify(path.join(dataDir, 'genealogy.sqlite'))});echo json_encode($db->querySingle(${JSON.stringify(query)}));`, dataDir);

/** Base neuve créée comme le fait l'écran d'installation (data/schema.sql), donc en structure n°0. */
function freshDatabase(dir, withPerson) {
  fs.mkdirSync(dir, { recursive: true });
  php("require 'lib/paths.php'; $p=new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));", dir);
  if (withPerson) sql(dir, "INSERT INTO persons(first_name,last_name) VALUES('Jeanne','Essai')");
}

async function withServer(dataDir, pool, fn) {
  const s = new PhpServer({ phpPath, appRoot, pool, dataDir, mediaDir: path.join(dataDir, 'media'), sessionDir: path.join(dataDir, 'sessions'), logFile: path.join(dataDir, 'php.log') });
  s.on('error', () => {});
  await s.start();
  try { return await fn(s); } finally { await s.stop(); }
}
const status = async (s) => { const r = await s.request('/api.php?action=schema_status', { timeout: 0 }); return { code: r.status, body: JSON.parse(r.body.toString()) }; };
const backups = (dir) => (fs.existsSync(path.join(dir, 'backups')) ? fs.readdirSync(path.join(dir, 'backups')) : []);

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-migr-'));
  console.log('Test des migrations de la base (' + phpPath + ')');
  const check = phpPath ? checkPhp(phpPath) : { ok: false, error: 'PHP introuvable' };
  if (!check.ok) throw new Error(check.error || 'extensions manquantes : ' + check.missing.join(', '));
  const expected = Number(php("require 'lib/bootstrap.php'; echo SCHEMA_VERSION;", path.join(tmp, 'x')));

  await step(`base ancienne : mise à jour jusqu’à la structure n°${expected}, avec copie de sécurité`, async () => {
    const dir = path.join(tmp, 'ancienne');
    freshDatabase(dir, true);
    await withServer(dir, 1, async (s) => {
      const r = await status(s);
      assert.equal(r.code, 200, JSON.stringify(r.body));
      assert.equal(r.body.version, expected);
    });
    const b = backups(dir);
    assert.equal(b.length, 1, 'une copie de sécurité attendue, trouvé : ' + b.join(', '));
    assert.match(b[0], /^genealogie-backup-.*-migration-v0-v\d+\.db$/);
    assert.equal(JSON.parse(sql(dir, "SELECT count(*) FROM persons")), 1, 'la personne a disparu');
  });

  await step('la copie de sécurité est une base complète, dans l’état d’avant la mise à jour', async () => {
    const dir = path.join(tmp, 'ancienne');
    const copy = path.join(dir, 'backups', backups(dir)[0]);
    const out = php(`$db=new SQLite3(${JSON.stringify(copy)});echo $db->querySingle('PRAGMA integrity_check'),'|',$db->querySingle('PRAGMA user_version'),'|',$db->querySingle('SELECT count(*) FROM persons');`, dir);
    assert.equal(out, 'ok|0|1');
  });

  await step('relancer ne refait rien (aucune nouvelle copie, structure identique)', async () => {
    const dir = path.join(tmp, 'ancienne');
    const before = sql(dir, "SELECT group_concat(name||sql) FROM (SELECT name,sql FROM sqlite_master ORDER BY name)");
    await withServer(dir, 1, async (s) => assert.equal((await status(s)).body.version, expected));
    assert.equal(backups(dir).length, 1);
    assert.equal(sql(dir, "SELECT group_concat(name||sql) FROM (SELECT name,sql FROM sqlite_master ORDER BY name)"), before);
  });

  await step('base neuve et vide : mise à jour sans copie de sécurité inutile', async () => {
    const dir = path.join(tmp, 'neuve');
    freshDatabase(dir, false);
    await withServer(dir, 1, async (s) => assert.equal((await status(s)).body.version, expected));
    assert.equal(backups(dir).length, 0);
  });

  await step('3 PHP qui ouvrent en même temps une base ancienne : une seule mise à jour, aucune erreur', async () => {
    const dir = path.join(tmp, 'concurrence');
    freshDatabase(dir, true);
    await withServer(dir, 3, async (s) => {
      const all = await Promise.all(Array.from({ length: 9 }, () => status(s)));
      for (const r of all) assert.equal(r.code, 200, JSON.stringify(r.body));
    });
    assert.equal(backups(dir).length, 1, 'copies : ' + backups(dir).join(', '));
    const log = fs.readFileSync(path.join(dir, 'php.log'), 'utf8');
    assert.equal((log.match(/\[migration\]/g) || []).length, 1, 'la migration a tourné plusieurs fois');
  });

  await step('base venant d’une version plus récente : refusée, et laissée intacte', async () => {
    const dir = path.join(tmp, 'future');
    freshDatabase(dir, true);
    sql(dir, `PRAGMA user_version = ${expected + 5}`);
    const before = fs.readFileSync(path.join(dir, 'genealogy.sqlite'));
    await withServer(dir, 1, async (s) => {
      const r = await status(s);
      assert.equal(r.code, 500);
      assert.match(r.body.error, /version plus récente/);
      const prep = await s.prepareDatabase();
      assert.equal(prep.ok, false);
    });
    assert.ok(before.equals(fs.readFileSync(path.join(dir, 'genealogy.sqlite'))), 'la base a été modifiée');
    assert.equal(backups(dir).length, 0);
  });

  await step('base restaurée sans mode WAL (copie VACUUM INTO) : le mode WAL est remis à l’ouverture', async () => {
    const dir = path.join(tmp, 'restauree');
    freshDatabase(dir, true);
    sql(dir, 'PRAGMA journal_mode = DELETE');
    assert.equal(JSON.parse(sql(dir, 'PRAGMA journal_mode')), 'delete');
    await withServer(dir, 1, async (s) => assert.equal((await status(s)).code, 200));
    assert.equal(JSON.parse(sql(dir, 'PRAGMA journal_mode')), 'wal');
  });

  await step('pas encore de base (premier lancement) : l’application peut démarrer', async () => {
    const dir = path.join(tmp, 'vide');
    fs.mkdirSync(dir, { recursive: true });
    await withServer(dir, 1, async (s) => {
      const prep = await s.prepareDatabase();
      assert.deepEqual(prep, { ok: true, noDatabase: true });
    });
  });

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n${passed} vérifications réussies.`);
})().catch((e) => { if (e && !e.reported) console.log('  ✗ ' + (e && e.message ? e.message : e)); process.exitCode = 1; });
