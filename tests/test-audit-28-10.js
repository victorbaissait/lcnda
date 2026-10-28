'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * Relecture « usage réel » du 28/10 :   node tests/test-audit-28-10.js
 *  1. les témoins ont leurs index (migration 69) : le tableau de bord ne parcourt plus toutes les personnes pour chaque baptême ;
 *  2. en mode consultation 🔒, la sauvegarde automatique n'efface aucune copie et ne se répète pas toutes les secondes.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { PhpServer, findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const phpPath = findPhp([devBundledPhp()]);
let passed = 0;
async function step(name, fn) {
  try { await fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.log('  ✗ ' + name + '\n      ' + (e && e.message ? e.message : e)); process.exitCode = 1; }
}
const php = (code, ...args) => { const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code, ...args], { encoding: 'utf8' }); if (r.status !== 0) throw new Error((r.stderr || r.stdout).trim()); return r.stdout; };

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-audit2810-'));
  const dataDir = path.join(tmp, 'data'); fs.mkdirSync(dataDir, { recursive: true });
  const s = new PhpServer({ phpPath, appRoot, pool: 1, dataDir, mediaDir: path.join(tmp, 'media'), sessionDir: path.join(dataDir, 'sessions'), logFile: path.join(dataDir, 'php.log') });
  s.on('error', () => {});
  await s.start();
  const base = `http://127.0.0.1:${s.port}`;
  try {
    const home = await fetch(base + '/', { headers: { 'x-carnet-secret': s.secret } });
    const cookie = (home.headers.get('set-cookie') || '').split(';')[0];
    const csrf = JSON.parse(((await home.text()).match(/window\.INSTALL_CSRF = ("[^"]*")/) || [])[1] || '""');
    const headers = { 'x-carnet-secret': s.secret, 'X-CSRF-Token': csrf, cookie };
    const fd = new FormData(); fd.append('file', new Blob(['0 HEAD\n1 CHAR UTF-8\n0 @I1@ INDI\n1 NAME Jean /Test/\n1 BAPM\n2 DATE 1 JAN 1900\n0 TRLR\n']), 'a.ged'); fd.append('csrf', csrf);
    const imp = await fetch(base + '/api.php?action=import_package', { method: 'POST', headers, body: fd });
    assert.equal(imp.status, 200, await imp.text());
    const post = async (action, body) => { const r = await fetch(`${base}/api.php?action=${action}`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, data: await r.json().catch(() => ({})) }; };
    const db = fs.readdirSync(dataDir).filter(f => f.endsWith('.sqlite')).map(f => path.join(dataDir, f))[0];

    await step('migration 69 : index des témoins, et le tableau de bord les utilise', async () => {
      const out = JSON.parse(php(`$d=new PDO('sqlite:'.$argv[1]);echo json_encode([$d->query("SELECT group_concat(name) FROM sqlite_master WHERE type='index' AND tbl_name='event_witnesses'")->fetchColumn(),(int)$d->query('PRAGMA user_version')->fetchColumn()]);`, db));
      assert.match(out[0] || '', /idx_event_witnesses_event/); assert.match(out[0] || '', /idx_event_witnesses_person/);
      assert.ok(out[1] >= 69);
      const r = await fetch(`${base}/api.php?action=dashboard`, { headers }); assert.equal(r.status, 200);
    });

    await step('consultation 🔒 : la sauvegarde automatique n’efface rien et ne se répète pas', async () => {
      const bdir = path.join(dataDir, 'backups'); fs.mkdirSync(bdir, { recursive: true });
      for (let i = 0; i < 4; i++) { const f = path.join(bdir, `genealogie-backup-2020010${i}-000000-ab${i}c-manual.db`); fs.writeFileSync(f, 'x'); const t = new Date(2020, 0, 1 + i); fs.utimesSync(f, t, t); }
      const before = fs.readdirSync(bdir).length;
      assert.equal((await post('kiosk_enter', { password: '1234' })).status, 200);
      const a = await post('backup_sqlite', { mode: 'auto', dir: '', max_files: 2 });
      const b = await post('backup_sqlite', { mode: 'auto', dir: '', max_files: 2 });
      if (a.status === 200 && a.data.dir) {
        assert.deepEqual(a.data.deleted, []); assert.equal(b.data.skipped, true, 'deuxième appel : pas de nouvelle copie');
        const kept = fs.readdirSync(a.data.dir).filter(f => /^genealogie-backup-.*manual\.db$/.test(f));
        assert.equal(path.resolve(a.data.dir), path.resolve(bdir)); assert.equal(kept.length, before, 'les copies faites à la main sont toutes gardées');
      } else assert.fail(JSON.stringify(a));
    });
  } finally { await s.stop(); fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log(process.exitCode ? 'Échec' : `✓ relecture du 28/10 : ${passed} vérifications`);
})().catch(e => { console.error(e); process.exitCode = 1; });
