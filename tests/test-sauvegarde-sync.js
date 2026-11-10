'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🗓 Sauvegarde automatique et 🔄 deux ordinateurs :   node tests/test-sauvegarde-sync.js
 * De vrais « php -S » (un par « ordinateur », GENEALOGY_MACHINE_NAME), sur des bases temporaires :
 *  1. sauvegarde planifiée simulée (jour passé = nouvelle copie ; rien changé = pas de copie), rotation à N, intégrité
 *     contrôlée, médias recopiés une fois, clé absente (message sans blocage, rien créé), à la fermeture, revenir à une copie ;
 *  2. deux bases qui divergent puis se fusionnent par un dossier partagé (personnes, notes, sources, médias avec le fichier) ;
 *     conflit montré des deux côtés puis réglé (garder la mienne / garder les deux pour une note) ; ↶ Annuler une fusion
 *     (paquet mis de côté) puis ↷ Rétablir ;
 *  3. verrou : un autre ordinateur qui ouvre le même fichier reçoit un message clair (423), « Ouvrir quand même » ;
 *  4. navigateur (Playwright, sinon sauté) : page Réglages → 🗓 Sauvegarde automatique (K2, « Dernière sauvegarde »), widget,
 *     section 🔄 Deux ordinateurs, conflit côte à côte, fenêtre du verrou ; 1440 px, 390 px, sombre ; sans erreur.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { PhpServer, findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const phpPath = findPhp([devBundledPhp()]);
const SHOTS = process.env.LCNDA_SHOTS || '';
let passed = 0;
async function step(name, fn) {
  try { await fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.log('  ✗ ' + name + '\n      ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n      ') : e)); process.exitCode = 1; }
}
const php = (code, ...args) => { const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code, ...args], { encoding: 'utf8' }); if (r.status !== 0) throw new Error((r.stderr || r.stdout).trim()); return r.stdout; };
const q = (db, sql) => JSON.parse(php(`$d=new PDO('sqlite:'.$argv[1]);$d->exec('PRAGMA busy_timeout=5000');echo json_encode($d->query($argv[2])->fetchAll(PDO::FETCH_ASSOC));`, db, sql));
const x = (db, sql) => php(`$d=new PDO('sqlite:'.$argv[1]);$d->exec('PRAGMA busy_timeout=5000');$d->exec($argv[2]);echo 'ok';`, db, sql);

async function startServer(dataDir, machine) {
  fs.mkdirSync(path.join(dataDir, 'media'), { recursive: true });
  process.env.GENEALOGY_MACHINE_NAME = machine;
  const s = new PhpServer({ phpPath, appRoot, pool: 1, dataDir, mediaDir: path.join(dataDir, 'media'), sessionDir: path.join(dataDir, 'sessions'), logFile: path.join(dataDir, 'php.log') });
  s.on('error', () => {});
  await s.start();
  const base = `http://127.0.0.1:${s.port}`;
  const home = await fetch(base + '/', { headers: { 'x-carnet-secret': s.secret } });
  const cookie = (home.headers.get('set-cookie') || '').split(';')[0];
  const html = await home.text();
  const csrf = JSON.parse((html.match(/window\.INSTALL_CSRF = ("[^"]*")/) || [])[1] || '""');
  const headers = { 'x-carnet-secret': s.secret, 'X-CSRF-Token': csrf, cookie };
  const post = async (action, body = {}) => { const r = await fetch(`${base}/api.php?action=${action}`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, data: await r.json().catch(() => ({})) }; };
  const get = async (action, params = {}) => { const u = new URL(`${base}/api.php`); u.searchParams.set('action', action); for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v); const r = await fetch(u, { headers }); return { status: r.status, data: await r.json().catch(() => ({})) }; };
  return { s, base, post, get, headers, csrf, cookie, db: path.join(dataDir, 'genealogy.sqlite') };
}

function makeBase(dataDir) {
  fs.mkdirSync(path.join(dataDir, 'media'), { recursive: true });
  const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p->exec("INSERT INTO persons(first_name,last_name,gender) VALUES('Pierre','Durand','male'),('Anne','Roux','female'),('Jeanne','Durand','female')"); $p = null;
require 'lib/bootstrap.php'; $pdo = db();
file_put_contents(MEDIA_DIR.'/photo-a.jpg', str_repeat('A', 2048));
$pdo->exec("INSERT INTO media(title,filename,media_type) VALUES('Photo de mariage','photo-a.jpg','image')");
$pdo->exec("INSERT INTO notes(entity_type,entity_id,title,body) VALUES('person',1,'Souvenir','Il aimait la pêche.')");
echo 'ok';`], { cwd: appRoot, encoding: 'utf8', env: { ...process.env, GENEALOGY_DATA_DIR: dataDir, GENEALOGY_MEDIA_DIR: path.join(dataDir, 'media') } });
  if (r.status !== 0) throw new Error((r.stderr || r.stdout).trim());
}

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-sauvegarde-'));
  const A = path.join(tmp, 'ordi-a'), B = path.join(tmp, 'ordi-b'), CLE = path.join(tmp, 'cle', 'LCNDA'), PARTAGE = path.join(tmp, 'partage');
  fs.mkdirSync(path.join(tmp, 'cle'), { recursive: true }); fs.mkdirSync(PARTAGE, { recursive: true });
  makeBase(A);
  let a = await startServer(A, 'Ordi-A'), b = null, c = null;
  const state = () => JSON.parse(fs.readFileSync(path.join(A, 'sauvegarde-auto-etat.json'), 'utf8'));
  const setState = st => fs.writeFileSync(path.join(A, 'sauvegarde-auto-etat.json'), JSON.stringify(st));
  const dayAgo = () => { const st = state(); st.last_ok_time -= 86400 + 60; setState(st); };
  const copies = () => fs.existsSync(CLE) ? fs.readdirSync(CLE).filter(f => /^genealogie-backup-.*\.db$/.test(f)).sort() : [];
  try {
    /* ═══ 1. Sauvegarde automatique ═══ */
    await step('réglages K2 enregistrés et remis d’aplomb (valeurs forgées bornées)', async () => {
      const r = await a.post('autobackup_settings', { freq: 'day', dir: CLE, keep: 3, media: true, on_close: true, every_hours: 9999, evil: 'x' });
      assert.equal(r.status, 200, JSON.stringify(r.data));
      assert.equal(r.data.settings.freq, 'day'); assert.equal(r.data.settings.keep, 3); assert.equal(r.data.settings.every_hours, 168); assert.equal(r.data.settings.evil, undefined);
      const bad = await a.post('autobackup_settings', { freq: 'toutes-les-secondes', keep: 1 });
      assert.equal(bad.data.settings.freq, 'off'); assert.equal(bad.data.settings.keep, 2);
      await a.post('autobackup_settings', { freq: 'day', keep: 3 });
    });
    await step('sauvegarde planifiée : première copie, vérifiée (integrity_check), médias recopiés', async () => {
      const t = await a.get('autobackup_tick');
      assert.equal(t.status, 200); assert.equal(t.data.ran, true, JSON.stringify(t.data)); assert.equal(t.data.ok, true, JSON.stringify(t.data));
      assert.equal(copies().length, 1);
      assert.match(copies()[0], /-auto\.db$/);
      const idx = JSON.parse(fs.readFileSync(path.join(CLE, 'lcnda-sauvegardes.json'), 'utf8'));
      assert.equal(idx[copies()[0]].integrity, 'ok'); assert.equal(idx[copies()[0]].persons, 3);
      assert.ok(fs.existsSync(path.join(CLE, 'media', 'photo-a.jpg')), 'média recopié');
      assert.deepEqual(fs.readdirSync(CLE).filter(f => f.endsWith('.part')), [], 'aucune copie à moitié écrite');
      const again = await a.get('autobackup_tick');
      assert.equal(again.data.ran, false, 'pas deux fois le même jour');
    });
    await step('jour suivant sans changement : pas de nouvelle copie ; avec changement : une copie', async () => {
      dayAgo();
      const t = await a.get('autobackup_tick');
      assert.equal(t.data.ran, true); assert.deepEqual(t.data.files, []); assert.equal(t.data.skipped.length, 1);
      assert.equal(copies().length, 1);
      x(a.db, "UPDATE persons SET occupation='laboureur' WHERE id=1");
      dayAgo();
      const t2 = await a.get('autobackup_tick');
      assert.equal(t2.data.files.length, 1, JSON.stringify(t2.data)); assert.equal(copies().length, 2);
    });
    await step('rotation : les 3 dernières seulement', async () => {
      for (let i = 0; i < 3; i++) { x(a.db, `INSERT INTO persons(first_name,last_name) VALUES('Rot${i}','Test')`); dayAgo(); await new Promise(r => setTimeout(r, 1100)); const t = await a.get('autobackup_tick'); assert.equal(t.data.ok, true); }
      assert.equal(copies().length, 3, copies().join(','));
      const idx = JSON.parse(fs.readFileSync(path.join(CLE, 'lcnda-sauvegardes.json'), 'utf8'));
      assert.equal(Object.keys(idx).length, 3, 'l’index suit la rotation');
    });
    await step('clé débranchée : message clair, sans blocage, rien créé sur le disque interne', async () => {
      const absent = path.join(tmp, 'cle-absente', 'LCNDA');
      await a.post('autobackup_settings', { dir: absent });
      dayAgo();
      const t = await a.get('autobackup_tick');
      assert.equal(t.status, 200); assert.equal(t.data.ok, false); assert.equal(t.data.missing, true); assert.match(t.data.error, /introuvable/);
      assert.equal(fs.existsSync(path.join(tmp, 'cle-absente')), false);
      const st = await a.get('autobackup_status');
      assert.equal(st.data.missing, true);
      const p = await a.get('bootstrap'); assert.notEqual(p.status, 423, 'l’app continue de marcher');
      await a.post('autobackup_settings', { dir: CLE });
    });
    await step('« Sauvegarder maintenant » et à la fermeture (seulement si la base a changé)', async () => {
      const n = await a.post('autobackup_now');
      assert.equal(n.status, 200); assert.equal(n.data.ok, true); assert.match(n.data.files[0].file, /-manual\.db$/);
      const st = state(); st.last_ok_time -= 600; setState(st);
      x(a.db, "UPDATE persons SET occupation='meunier' WHERE id=2");
      const cl = await a.post('autobackup_close');
      assert.equal(cl.data.ran, true, JSON.stringify(cl.data)); assert.match(cl.data.files[0].file, /-fermeture\.db$/);
      // l'app de bureau en quittant : sans jeton, avec le secret du processus principal seulement
      const local = await a.s.request('/api.php?action=autobackup_close', { headers: { 'x-carnet-local': 'mauvais' } });
      assert.equal(local.status, 403);
      const ok = await a.s.closeBackup(); assert.ok(ok && ok.recent, JSON.stringify(ok));
    });
    await step('revenir à une copie : copie abîmée refusée ; bonne copie remise, l’ancienne base gardée', async () => {
      const bad = path.join(CLE, 'genealogie-backup-20200101-000000-dead-auto.db'); fs.writeFileSync(bad, 'pas une base');
      const r1 = await a.post('autobackup_restore', { name: path.basename(bad) });
      assert.equal(r1.status, 422); assert.match(r1.data.error, /abîmée|lisible/);
      fs.unlinkSync(bad);
      const evil = await a.post('autobackup_restore', { name: '../genealogy.sqlite' }); assert.equal(evil.status, 422);
      const st = await a.get('autobackup_status');
      const oldest = st.data.copies.filter(c => c.kind === 'auto').pop();
      x(a.db, "INSERT INTO persons(first_name,last_name) VALUES('Après','Copie')");
      const before = q(a.db, 'SELECT count(*) n FROM persons')[0].n;
      const r = await a.post('autobackup_restore', { name: oldest.name });
      assert.equal(r.status, 200, JSON.stringify(r.data)); assert.match(r.data.safety, /-avant-restauration\.db$/);
      const after = q(a.db, 'SELECT count(*) n FROM persons')[0].n;
      assert.ok(after < before, `${after} < ${before}`);
      assert.ok(fs.existsSync(path.join(A, 'backups', r.data.safety)));
      const p = await a.get('bootstrap'); assert.equal(p.status, 200);
      await a.post('autobackup_settings', { freq: 'off', on_close: false, media: false, dir: '' });
    });

    /* ═══ 2. Deux ordinateurs ═══ */
    let root = '';
    await step('A choisit le dossier partagé : départ commun et copie pour l’autre ordinateur', async () => {
      const r = await a.post('sd_setup', { folder: PARTAGE, author: 'Victor' });
      assert.equal(r.status, 200, JSON.stringify(r.data)); assert.equal(r.data.reachable, true); assert.equal(r.data.starter, true); assert.equal(r.data.machine, 'Ordi-A');
      root = fs.readdirSync(path.join(PARTAGE, 'LCNDA-deux-ordinateurs')).map(d => path.join(PARTAGE, 'LCNDA-deux-ordinateurs', d))[0];
      assert.ok(fs.existsSync(path.join(root, 'depart.db')));
      const absent = await a.post('sd_setup', { folder: path.join(tmp, 'nulle-part', 'x') }); assert.equal(absent.status, 500); assert.match(absent.data.error, /introuvable/);
    });
    await step('B ouvre la copie de départ et choisit le même dossier', async () => {
      fs.mkdirSync(path.join(B, 'media'), { recursive: true });
      fs.copyFileSync(path.join(root, 'depart.db'), path.join(B, 'genealogy.sqlite'));
      b = await startServer(B, 'Ordi-B');
      const r = await b.post('sd_setup', { folder: PARTAGE, author: 'Paul' });
      assert.equal(r.status, 200, JSON.stringify(r.data)); assert.equal(r.data.machine, 'Ordi-B'); assert.equal(r.data.pending, 0, 'rien à envoyer au départ');
      assert.equal(r.data.others.length, 1); assert.equal(r.data.others[0].label, 'Ordi-A');
    });
    await step('les deux bases divergent puis se fusionnent (fiches, note, source, média et son fichier)', async () => {
      x(a.db, "UPDATE persons SET occupation='charpentier' WHERE first_name='Pierre'");
      x(a.db, "INSERT INTO persons(first_name,last_name,gender) VALUES('Louis','Durand','male')");
      fs.writeFileSync(path.join(A, 'media', 'acte-b.jpg'), 'B'.repeat(1000));
      x(a.db, "INSERT INTO media(title,filename,media_type) VALUES('Acte de baptême','acte-b.jpg','image')");
      x(b.db, "UPDATE persons SET occupation='tisserand' WHERE first_name='Anne'");
      x(b.db, "UPDATE persons SET occupation='meunier' WHERE first_name='Pierre'"); // même champ : conflit
      x(b.db, "INSERT INTO sources(title,author) VALUES('Registre de Lille','AD59')");
      x(b.db, "INSERT INTO notes(entity_type,entity_id,title,body) VALUES('person',(SELECT id FROM persons WHERE first_name='Anne'),'Recherche','Voir les registres.')");
      const sa = await a.post('sd_sync'); assert.equal(sa.data.ok, true, JSON.stringify(sa.data)); assert.ok(sa.data.sent >= 3, JSON.stringify(sa.data));
      assert.ok(fs.existsSync(path.join(root, 'medias', 'acte-b.jpg')), 'le fichier du média part dans le dossier');
      const sb = await b.post('sd_sync'); assert.equal(sb.data.ok, true, JSON.stringify(sb.data));
      assert.ok(sb.data.applied >= 2, JSON.stringify(sb.data)); assert.equal(sb.data.conflicts, 1, 'Pierre : modifié des deux côtés');
      assert.ok(sb.data.merge_id);
      assert.equal(q(b.db, "SELECT count(*) n FROM persons WHERE first_name='Louis'")[0].n, 1);
      assert.equal(q(b.db, "SELECT occupation o FROM persons WHERE first_name='Pierre'")[0].o, 'meunier', 'le conflit ne change rien tout seul');
      assert.ok(fs.existsSync(path.join(B, 'media', 'acte-b.jpg')), 'le fichier du média arrive');
      const sa2 = await a.post('sd_sync'); assert.equal(sa2.data.ok, true);
      assert.equal(sa2.data.conflicts, 0, 'B n’a pas renvoyé la fiche en conflit');
      assert.equal(q(a.db, "SELECT occupation o FROM persons WHERE first_name='Anne'")[0].o, 'tisserand');
      assert.equal(q(a.db, "SELECT count(*) n FROM sources WHERE title='Registre de Lille'")[0].n, 1);
      assert.equal(q(a.db, "SELECT count(*) n FROM notes WHERE title='Recherche'")[0].n, 1);
    });
    await step('conflit côte à côte puis réglé (« garder la mienne ») : les deux bases finissent pareilles', async () => {
      const st = await b.get('sd_status');
      assert.equal(st.data.conflicts.length, 1);
      const c = st.data.conflicts[0];
      const f = c.fields.find(f => f.field === 'occupation'); assert.equal(f.mine, 'meunier'); assert.equal(f.theirs, 'charpentier'); assert.equal(c.machine_label, 'Ordi-A');
      const r = await b.post('sd_resolve', { id: c.id, choice: 'mine' }); assert.equal(r.status, 200, JSON.stringify(r.data)); assert.equal(r.data.open_conflicts, 0);
      // ↶ Annuler le choix puis le refaire
      const re = await b.post('sd_reopen', { id: c.id }); assert.equal(re.data.open_conflicts, 1);
      assert.equal((await b.post('sd_resolve', { id: c.id, choice: 'mine' })).status, 200);
      await b.post('sd_sync');
      const sa = await a.post('sd_sync'); assert.equal(sa.data.conflicts, 0, JSON.stringify(sa.data));
      const rowsA = q(a.db, "SELECT first_name, last_name, occupation FROM persons ORDER BY first_name");
      const rowsB = q(b.db, "SELECT first_name, last_name, occupation FROM persons ORDER BY first_name");
      assert.deepEqual(rowsA, rowsB);
      assert.equal(rowsA.find(r => r.first_name === 'Pierre').occupation, 'meunier');
    });
    await step('note modifiée des deux côtés : « garder les deux »', async () => {
      x(a.db, "UPDATE notes SET body='Il aimait la pêche à la ligne.' WHERE title='Souvenir'");
      x(b.db, "UPDATE notes SET body='Il aimait la pêche et la chasse.' WHERE title='Souvenir'");
      await a.post('sd_sync');
      const sb = await b.post('sd_sync'); assert.equal(sb.data.conflicts, 1);
      const c = (await b.get('sd_status')).data.conflicts[0];
      assert.equal(c.can_both, true);
      assert.equal((await b.post('sd_resolve', { id: c.id, choice: 'both' })).status, 200);
      await b.post('sd_sync'); await a.post('sd_sync');
      for (const db of [a.db, b.db]) {
        const n = q(db, "SELECT body FROM notes WHERE title LIKE 'Souvenir%' ORDER BY id").map(r => r.body);
        assert.deepEqual(n.sort(), ['Il aimait la pêche et la chasse.', 'Il aimait la pêche à la ligne.'].sort(), db);
      }
    });
    await step('↶ Annuler une fusion : tout revient, le paquet est mis de côté ; ↷ Rétablir', async () => {
      x(a.db, "UPDATE persons SET occupation='forgeron' WHERE first_name='Louis'");
      await a.post('sd_sync');
      const sb = await b.post('sd_sync'); assert.equal(sb.data.applied, 1); const mid = sb.data.merge_id;
      assert.equal(q(b.db, "SELECT occupation o FROM persons WHERE first_name='Louis'")[0].o, 'forgeron');
      const u = await b.post('sd_undo', { merge_id: mid }); assert.equal(u.status, 200, JSON.stringify(u.data) + JSON.stringify(sb.data)); assert.equal(u.data.held, 1);
      assert.equal(q(b.db, "SELECT occupation o FROM persons WHERE first_name='Louis'")[0].o || '', '');
      const st = await b.get('sd_status'); assert.equal(st.data.held.length, 1); assert.equal(st.data.pending, 0, 'l’annulation ne part pas chez l’autre');
      const again = await b.post('sd_sync'); assert.equal(again.data.applied, 0, 'un paquet mis de côté n’est pas repris tout seul');
      const rv = await b.post('sd_review', { package_uid: st.data.held[0].package_uid }); assert.equal(rv.status, 200, JSON.stringify(rv.data)); assert.equal(rv.data.held, true); assert.ok(rv.data.items.length >= 1);
      const redo = await b.post('sd_redo', { merge_id: mid }); assert.equal(redo.status, 200, JSON.stringify(redo.data)); assert.equal(redo.data.applied, 1);
      assert.equal(q(b.db, "SELECT occupation o FROM persons WHERE first_name='Louis'")[0].o, 'forgeron');
      assert.equal((await b.get('sd_status')).data.held.length, 0);
    });
    await step('dossier partagé débranché : message, rien de perdu', async () => {
      fs.renameSync(PARTAGE, PARTAGE + '-ailleurs');
      x(b.db, "UPDATE persons SET occupation='charron' WHERE first_name='Jeanne'");
      const r = await b.post('sd_sync'); assert.equal(r.status, 200); assert.equal(r.data.ok, false); assert.equal(r.data.missing, true);
      fs.renameSync(PARTAGE + '-ailleurs', PARTAGE);
      const r2 = await b.post('sd_sync'); assert.equal(r2.data.ok, true); assert.equal(r2.data.sent, 1);
      await a.post('sd_sync');
      assert.equal(q(a.db, "SELECT occupation o FROM persons WHERE first_name='Jeanne'")[0].o, 'charron');
    });

    /* ═══ 3. Verrou ═══ */
    await step('verrou : un autre ordinateur sur le même fichier reçoit un message clair, puis « Ouvrir quand même »', async () => {
      await a.get('open_lock_status');
      c = await startServer(A, 'Ordi-C');
      const r = await c.get('bootstrap'); assert.equal(r.status, 423); assert.equal(r.data.open_lock.label, 'Ordi-A'); assert.match(r.data.error, /déjà ouverte sur l’ordinateur « Ordi-A »/);
      const w = await c.post('save_person', { first_name: 'Intrus' }); assert.equal(w.status, 423);
      assert.equal(q(a.db, "SELECT count(*) n FROM persons WHERE first_name='Intrus'")[0].n, 0);
      const take = await c.post('open_lock_take'); assert.equal(take.status, 200, JSON.stringify(take.data));
      assert.equal((await c.get('bootstrap')).status, 200);
      assert.equal((await a.get('bootstrap')).status, 423, 'A est prévenu à son tour');
      // un verrou trop ancien (ordinateur éteint sans fermer l'app) ne bloque plus
      const lockFile = a.db + '.ouvert.json'; const l = JSON.parse(fs.readFileSync(lockFile, 'utf8')); l.beat -= 3600; fs.writeFileSync(lockFile, JSON.stringify(l));
      assert.equal((await a.get('bootstrap')).status, 200);
      await c.s.stop(); c = null;
    });
    await step('migration 80 : uid sur sources, médias, liens ; tables des conflits et des fusions', async () => {
      const cols = q(a.db, "SELECT name FROM pragma_table_info('media_links') WHERE name='uid'"); assert.equal(cols.length, 1);
      assert.equal(q(a.db, "SELECT count(*) n FROM sqlite_master WHERE name IN ('sync_conflicts','sync_merges')")[0].n, 2);
      assert.ok(q(a.db, 'PRAGMA user_version')[0].user_version >= 80);
    });

    /* ═══ 4. Navigateur ═══ */
    let pw = null; if (!process.env.LCNDA_NOBROWSER) try { pw = require('/opt/node22/lib/node_modules/playwright'); } catch (_) { try { pw = require('playwright'); } catch (_) {} }
    if (!pw) console.log('  (navigateur sauté : Playwright absent)');
    else await browserChecks(pw, a, b, tmp);
  } finally {
    for (const s of [a, b, c]) { if (s) await s.s.stop().catch(() => {}); }
    if (process.env.LCNDA_KEEP) console.log('  (dossier gardé : ' + tmp + ')'); else fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log(process.exitCode ? 'Échec' : `✓ sauvegarde automatique et deux ordinateurs : ${passed} vérifications`);
})().catch(e => { console.error(e); process.exitCode = 1; });

async function browserChecks(pw, a, b, tmp) {
  const browser = await pw.chromium.launch();
  const errors = [];
  const open = async (srv, opts = {}) => {
    const ctx = await browser.newContext({ viewport: { width: opts.width || 1440, height: 950 }, colorScheme: opts.dark ? 'dark' : 'light', extraHTTPHeaders: { 'x-carnet-secret': srv.s.secret } });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|favicon/.test(m.text())) errors.push('console: ' + m.text()); });
    return { ctx, page };
  };
  const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: false }); };
  try {
    await a.post('autobackup_settings', { freq: 'week', dir: path.join(tmp, 'cle', 'LCNDA'), keep: 10 });
    await step('navigateur : page « 🗓 Sauvegarde automatique » (dernière sauvegarde K4, K2, copies, restaurer)', async () => {
      const { ctx, page } = await open(a);
      await page.goto(a.base + '/#maintenance/sauvegarde');
      await page.waitForSelector('[data-sa-page]', { timeout: 20000 });
      const txt = await page.textContent('[data-sa-page]');
      assert.match(txt, /Dernière sauvegarde/);
      assert.ok(await page.locator('[data-sa-copy]').count() >= 1, 'liste des copies');
      await page.selectOption('[data-sa-field="freq"]', 'day');
      await page.waitForFunction(() => /Enregistré/.test(document.querySelector('.ui-ph-saved, [data-ui-saved], .ui-page-saved')?.textContent || document.body.textContent));
      const st = await a.get('autobackup_status'); assert.equal(st.data.settings.freq, 'day');
      await shot(page, 'sauvegarde-1440');
      await page.click('[data-sa-now]');
      await page.waitForFunction(() => document.querySelectorAll('[data-sa-copy]').length >= 2, null, { timeout: 20000 });
      await page.locator('[data-sa-restore]').first().click();
      await page.waitForSelector('dialog[open]', { timeout: 5000 });
      await shot(page, 'sauvegarde-restaurer');
      await page.keyboard.press('Escape');
      await ctx.close();
    });
    await step('navigateur : widget « 🗓 Sauvegarde automatique » et téléphone 390 px, sombre', async () => {
      const { ctx, page } = await open(a, { width: 390, dark: true });
      await page.goto(a.base + '/#maintenance/sauvegarde');
      await page.waitForSelector('[data-sa-page]', { timeout: 20000 });
      const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert.ok(over <= 2, 'pas de défilement de côté : ' + over);
      await shot(page, 'sauvegarde-390-sombre');
      const html = await page.evaluate(async () => { const w = window.LCNDA_EXT.dashboard.autobackup_widget; const d = await w.load(); return w.render(0, {}, '6', d); });
      assert.match(html, /Dernière sauvegarde/);
      await ctx.close();
    });
    await step('navigateur : 🔄 Deux ordinateurs dans « Travail à deux » et conflit côte à côte', async () => {
      x(a.db, "UPDATE persons SET occupation='berger' WHERE first_name='Jeanne'");
      x(b.db, "UPDATE persons SET occupation='vigneron' WHERE first_name='Jeanne'");
      await a.post('sd_sync'); await b.post('sd_sync');
      const { ctx, page } = await open(b);
      await page.goto(b.base + '/#maintenance/sync');
      await page.waitForSelector('[data-sd-panel] [data-sd-sync]', { timeout: 20000 });
      await page.waitForSelector('[data-sd-conflict]');
      const t = await page.textContent('[data-sd-conflict]');
      assert.match(t, /vigneron/); assert.match(t, /berger/); assert.match(t, /Ordi-A/);
      await shot(page, 'deux-ordinateurs-conflit');
      await page.click('[data-sd-conflict] [data-sd-choice="theirs"]');
      await page.waitForFunction(() => !document.querySelector('[data-sd-conflict]'), null, { timeout: 10000 });
      assert.equal(q(b.db, "SELECT occupation o FROM persons WHERE first_name='Jeanne'")[0].o, 'berger');
      await page.click('[data-sd-sync]');
      await page.waitForSelector('.toast, .h7-toast, [role="status"]', { timeout: 10000 });
      await ctx.close();
      const p2 = await open(b, { width: 390, dark: true });
      await p2.page.goto(b.base + '/#maintenance/sync');
      await p2.page.waitForSelector('[data-sd-panel] [data-sd-sync]', { timeout: 20000 });
      const over = await p2.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert.ok(over <= 2, 'pas de défilement de côté : ' + over);
      await shot(p2.page, 'deux-ordinateurs-390-sombre');
      await p2.ctx.close();
    });
    await step('navigateur : fenêtre du verrou quand la base est ouverte ailleurs', async () => {
      const lockFile = a.db + '.ouvert.json';
      fs.writeFileSync(lockFile, JSON.stringify({ key: 'autre', label: 'Mac de Paul', since: Math.floor(Date.now() / 1000) - 600, beat: Math.floor(Date.now() / 1000) }));
      const { ctx, page } = await open(a);
      await page.goto(a.base + '/');
      await page.waitForSelector('[data-open-lock]', { timeout: 20000 });
      assert.match(await page.textContent('[data-open-lock]'), /Mac de Paul/);
      await shot(page, 'verrou');
      fs.unlinkSync(lockFile);
      const errs = errors.filter(e => !/423|Locked|déjà ouverte/.test(e)); errors.length = 0; errors.push(...errs);
      await ctx.close();
    });
    await step('navigateur : aucune erreur de page ni de console', async () => { assert.deepEqual(errors, []); });
  } finally { await browser.close(); }
}
