'use strict';
// Les communes livrées avec l'app (lib/reference.php) ne sont pas chargées ici : tests plus rapides.
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * Test des migrations de la base (lib/migrations.php) :   npm run test:migrations
 * Bases temporaires créées pour l'occasion : ne touche à aucune de tes données.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
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

  await step('structure n°93 : ⚖️ modèles de courriers à soi (succ_templates) et source des lignes de temps (succ_fees.source, ⏱ chronomètre)', async () => {
    const dir = path.join(tmp, 'ancienne');
    assert.equal(JSON.parse(sql(dir, "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='succ_templates'")), 1);
    assert.equal(JSON.parse(sql(dir, "SELECT count(*) FROM pragma_table_info('succ_fees') WHERE name='source'")), 1);
    assert.ok(expected >= 93);
  });

  await step('structure n°94 : 🔐 mot de passe d’une généalogie (app_lock, une ligne au plus) et 📜 « Qui a vu quoi » (access_log)', async () => {
    const dir = path.join(tmp, 'ancienne');
    assert.equal(JSON.parse(sql(dir, "SELECT count(*) FROM sqlite_master WHERE type='table' AND name IN ('app_lock','access_log')")), 2);
    assert.equal(JSON.parse(sql(dir, "SELECT count(*) FROM app_lock")), 0, 'aucun mot de passe posé par la mise à jour');
    assert.equal(JSON.parse(sql(dir, "SELECT count(*) FROM pragma_table_info('access_log') WHERE name IN ('at','kind','obj_type','obj_id','obj_label','what','machine')")), 7);
    assert.ok(expected >= 94);
  });

  await step('structure n°95 : 🏛 corrections des actes en ligne aux archives (archives_dispo_corr)', async () => {
    const dir = path.join(tmp, 'ancienne');
    assert.equal(JSON.parse(sql(dir, "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='archives_dispo_corr'")), 1);
    assert.equal(JSON.parse(sql(dir, "SELECT count(*) FROM pragma_table_info('archives_dispo_corr') WHERE name IN ('dept_code','act_key','commune','verdict','year','url','event_id','source_id')")), 8);
    assert.ok(expected >= 95);
  });

  await step('structure n°96 : 🔎 recherche « à la française » (rfr_names : clés des noms précalculées, remplie pour toute la base)', async () => {
    const dir = path.join(tmp, 'ancienne');
    assert.equal(JSON.parse(sql(dir, "SELECT count(*) FROM pragma_table_info('rfr_names') WHERE name IN ('person_id','src','vtype','sig','words','last_keys','last_phon','first_canons','first_phons')")), 9);
    assert.equal(JSON.parse(sql(dir, "SELECT count(*) FROM rfr_names WHERE src=0")), 1, 'la personne de la base ancienne a ses clés');
    assert.equal(JSON.parse(sql(dir, "SELECT words||'|'||last_keys||'|'||last_phon FROM rfr_names WHERE src=0")), 'jeanne essai| essai |es');
    assert.equal(JSON.parse(sql(dir, "SELECT count(*) FROM sqlite_master WHERE type='trigger' AND name NOT LIKE 'lcnda_gen_%'")), 0, 'aucun déclencheur (bootstrap.php les retire ; seuls ceux des calculs gardés, n°100, restent)');
    assert.ok(expected >= 96);
  });

  await step('structure n°97 : ⚖️ outils de plus du successoral (⚰️ INSEE, 📞 échanges, 💶 fonds, 📋 questionnaires, 🧾 factures, 📮 recommandés, 🗓 dates, 👥 fusion, 📅 délivrance)', async () => {
    const dir = path.join(tmp, 'ancienne');
    assert.equal(JSON.parse(sql(dir, "SELECT count(*) FROM sqlite_master WHERE type='table' AND name IN ('succ_insee_checks','succ_calls','succ_funds','succ_questionnaires','succ_template_versions','succ_invoices','succ_invoice_lines','succ_invoice_counters')")), 8);
    assert.equal(JSON.parse(sql(dir, "SELECT count(*) FROM pragma_table_info('courriers') WHERE name IN ('recommande','recommande_num','ar_date','ar_relance_jours','ar_etat','template_version','reponse_le','origin_case_id')")), 8);
    assert.equal(JSON.parse(sql(dir, "SELECT count(*) FROM pragma_table_info('succ_deadlines') WHERE name IN ('origin','reminders','important','reminders_seen','prev_due')")), 5);
    assert.equal(JSON.parse(sql(dir, "SELECT count(*) FROM pragma_table_info('succ_cases') WHERE name='merged_into'")), 1);
    assert.equal(JSON.parse(sql(dir, "SELECT count(*) FROM pragma_table_info('succ_pieces') WHERE name IN ('issued_on','valid_months')")), 2);
    assert.equal(JSON.parse(sql(dir, "SELECT count(*) FROM succ_invoices")), 0, 'aucune facture posée par la mise à jour');
    assert.ok(expected >= 97);
  });

  await step('structure n°98 : compléments aux outils existants (🏛 études de notaire, ⚠️ homonymes, 📱 visite aux archives)', async () => {
    const dir = path.join(tmp, 'ancienne');
    assert.equal(JSON.parse(sql(dir, "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='archive_service_people'")), 1);
    assert.equal(JSON.parse(sql(dir, "SELECT count(*) FROM pragma_table_info('succ_cases') WHERE name IN ('notary_service_id','notary_people_id')")), 2);
    assert.equal(JSON.parse(sql(dir, "SELECT count(*) FROM pragma_table_info('courriers') WHERE name IN ('archive_service_id','recu_le')")), 2);
    assert.equal(JSON.parse(sql(dir, "SELECT count(*) FROM pragma_table_info('archive_visit_plans') WHERE name IN ('succ_case_id','export_uid','export_sum','imported_at','photos_off','import_json')")), 6);
    assert.equal(JSON.parse(sql(dir, "SELECT count(*) FROM pragma_table_info('archive_visit_items') WHERE name IN ('person_id','act_kind')")), 2);
    assert.equal(JSON.parse(sql(dir, "SELECT count(*) FROM archive_service_people")), 0, 'aucun notaire posé par la mise à jour');
    assert.ok(expected >= 98);
  });

  await step('structure n°99 : 🖧 plusieurs ordinateurs (access_log.device : l’appareil réel au registre ; 98 : autre chantier, raccordé à la fusion)', async () => {
    const dir = path.join(tmp, 'ancienne');
    assert.equal(JSON.parse(sql(dir, "SELECT count(*) FROM pragma_table_info('access_log') WHERE name='device'")), 1);
    assert.equal(JSON.parse(sql(dir, "SELECT count(*) FROM sqlite_master WHERE name LIKE '%appareil%' OR name LIKE '%device_token%'")), 0, 'les appareils et leurs jetons ne sont pas dans la généalogie');
    assert.ok(expected >= 99);
  });

  await step('structure n°100 : 🐘 jetons des calculs gardés (data_gen) et leurs déclencheurs ; un déclencheur étranger reste supprimé', async () => {
    const dir = path.join(tmp, 'ancienne');
    const tok = (t) => JSON.parse(sql(dir, `SELECT tok FROM data_gen WHERE tbl='${t}'`));
    assert.ok(JSON.parse(sql(dir, "SELECT count(*) FROM data_gen")) >= 10, 'une ligne par table suivie');
    const nTrig = JSON.parse(sql(dir, "SELECT count(*) FROM sqlite_master WHERE type='trigger' AND name LIKE 'lcnda_gen_%'"));
    assert.equal(nTrig, JSON.parse(sql(dir, "SELECT count(*) FROM data_gen")) * 3, 'trois déclencheurs par table suivie');
    // une ligne ajoutée change le jeton de SA table, pas celui des autres
    const [p0, e0] = [tok('persons'), tok('events')];
    sql(dir, "INSERT INTO persons(first_name,last_name) VALUES('Paul','Essai')");
    assert.notEqual(tok('persons'), p0); assert.equal(tok('events'), e0);
    // 🛡 une base reçue avec un déclencheur caché (même sous un de nos noms) : supprimé à l'ouverture ; les nôtres restent
    sql(dir, "DROP TRIGGER lcnda_gen_events_delete");
    sql(dir, "CREATE TRIGGER lcnda_gen_events_delete AFTER DELETE ON events BEGIN DELETE FROM persons; END");
    sql(dir, "CREATE TRIGGER piege AFTER INSERT ON notes BEGIN DELETE FROM persons; END");
    await withServer(dir, 1, async (s) => {
      assert.equal((await status(s)).code, 200);
      await s.request('/api.php?action=ad_counts', { timeout: 0 }); // un calcul gardé : remet le déclencheur manquant
    });
    assert.equal(JSON.parse(sql(dir, "SELECT count(*) FROM sqlite_master WHERE name='piege'")), 0, 'déclencheur étranger supprimé');
    assert.equal(JSON.parse(sql(dir, "SELECT sql FROM sqlite_master WHERE name='lcnda_gen_events_delete'")), `CREATE TRIGGER lcnda_gen_events_delete AFTER DELETE ON "events" BEGIN UPDATE data_gen SET tok=random() WHERE tbl='events'; END`, 'le nôtre, remis mot pour mot');
    assert.equal(JSON.parse(sql(dir, "SELECT count(*) FROM sqlite_master WHERE type='trigger' AND name LIKE 'lcnda_gen_%'")), nTrig);
    assert.ok(JSON.parse(sql(dir, 'SELECT count(*) FROM persons')) >= 2, 'aucune fiche effacée');
    assert.ok(expected >= 100);
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

  // ── 🛡 Une marche = une transaction (lib/migrations.php) : plantage ou coupure au milieu → base à la structure d'avant ──
  /** PHP qui ouvre la base comme db() et lance les vraies marches jusqu'au n°50, puis la marche n°51 écrite ici (`body`). */
  const halfMigration = (body) => "require 'lib/bootstrap.php';"
    + "$p=new PDO('sqlite:'.DB_PATH,null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);$p->exec('PRAGMA foreign_keys = ON');$p->exec('PRAGMA busy_timeout = 30000');$p->query('PRAGMA journal_mode = WAL')->closeCursor();"
    + '$steps=array_filter(migration_steps(),fn($k)=>$k<=50,ARRAY_FILTER_USE_KEY);'
    + '$steps[51]=function(PDO $p){' + body + '};';
  const tables = (dir) => JSON.parse(sql(dir, "SELECT group_concat(name) FROM (SELECT name FROM sqlite_master WHERE type='table' ORDER BY name)")).split(',');
  const columns = (dir, t) => JSON.parse(sql(dir, `SELECT group_concat(name) FROM pragma_table_info('${t}')`)).split(',');

  await step('une marche qui plante au milieu : base restée à la structure d’avant, sans table à moitié faite, et l’app repart', async () => {
    const dir = path.join(tmp, 'plantage');
    freshDatabase(dir, true);
    const out = php(halfMigration(
      "$p->exec('CREATE TABLE essai_moitie (id INTEGER PRIMARY KEY, nom TEXT)');"
      + "$p->exec(\"INSERT INTO essai_moitie(nom) VALUES('Paul Essai'),('Rose Essai')\");"
      + "$p->exec('ALTER TABLE persons ADD COLUMN essai_col TEXT');"
      + "$p->exec(\"UPDATE persons SET first_name='Changé'\");"
      + "throw new RuntimeException('panne simulée au milieu');"
    ) + 'try{migrate_database($p,DB_PATH,$steps);echo "PAS D’ERREUR";}catch(Throwable $e){echo $e->getMessage();}', dir);
    assert.match(out, /structure n°51\) a échoué : panne simulée au milieu/);
    assert.match(out, /restée à la structure n°50/);
    assert.equal(JSON.parse(sql(dir, 'PRAGMA user_version')), 50, 'le numéro de structure doit rester celui d’avant');
    assert.ok(!tables(dir).includes('essai_moitie'), 'table à moitié faite restée dans la base');
    assert.ok(!columns(dir, 'persons').includes('essai_col'), 'colonne à moitié ajoutée restée dans la base');
    assert.equal(JSON.parse(sql(dir, 'SELECT first_name FROM persons')), 'Jeanne', 'une modification de la marche ratée est restée');
    assert.equal(JSON.parse(sql(dir, "SELECT count(*) FROM app_migrations WHERE name='schema_v51'")), 0);
    assert.equal(JSON.parse(sql(dir, "SELECT count(*) FROM app_migrations WHERE name='schema_v50'")), 1, 'les marches réussies avant doivent être gardées');
    assert.equal(JSON.parse(sql(dir, 'PRAGMA integrity_check')), 'ok');
    assert.equal(backups(dir).length, 1, 'la copie de sécurité d’avant la mise à jour doit être faite');
    // l'app repart : les vraies marches 51 → dernière passent au lancement suivant
    await withServer(dir, 1, async (s) => { const r = await status(s); assert.equal(r.code, 200, JSON.stringify(r.body)); assert.equal(r.body.version, expected); });
    assert.equal(JSON.parse(sql(dir, 'SELECT first_name FROM persons')), 'Jeanne');
  });

  await step('ordinateur éteint en pleine marche (PHP tué net) : base restée à la structure d’avant, et l’app repart', async () => {
    const dir = path.join(tmp, 'coupure');
    freshDatabase(dir, true);
    const marker = path.join(dir, 'au-milieu');
    const child = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-r', halfMigration(
      "$p->exec('CREATE TABLE essai_coupure (id INTEGER PRIMARY KEY, nom TEXT)');"
      + "$ins=$p->prepare('INSERT INTO essai_coupure(nom) VALUES(?)');for($i=0;$i<20000;$i++){$ins->execute(['Fiche fictive '.$i]);}"
      + "$p->exec('ALTER TABLE persons ADD COLUMN essai_coupure_col TEXT');"
      + `file_put_contents(${JSON.stringify(marker)},'1');sleep(60);`
    ) + 'migrate_database($p,DB_PATH,$steps);'], {
      cwd: appRoot, stdio: 'ignore', env: { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media') },
    });
    const exited = new Promise((res) => child.once('exit', res));
    for (let i = 0; i < 1200 && !fs.existsSync(marker); i++) await new Promise((r) => setTimeout(r, 100));
    assert.ok(fs.existsSync(marker), 'la marche n’a pas atteint son milieu');
    child.kill('SIGKILL');
    await exited;
    assert.equal(JSON.parse(sql(dir, 'PRAGMA user_version')), 50);
    assert.ok(!tables(dir).includes('essai_coupure'), 'table à moitié faite restée dans la base');
    assert.ok(!columns(dir, 'persons').includes('essai_coupure_col'));
    assert.equal(JSON.parse(sql(dir, 'PRAGMA integrity_check')), 'ok');
    await withServer(dir, 1, async (s) => { const r = await status(s); assert.equal(r.code, 200, JSON.stringify(r.body)); assert.equal(r.body.version, expected); });
    assert.equal(JSON.parse(sql(dir, 'SELECT count(*) FROM persons')), 1, 'la personne a disparu');
  });

  await step('dans une marche, un morceau annulé seul (point de reprise) ne casse ni la marche ni sa transaction', async () => {
    const dir = path.join(tmp, 'morceau');
    freshDatabase(dir, true);
    const out = php(halfMigration(
      "$tx=migration_tx_begin($p);try{$p->exec('CREATE TABLE essai_annule (x)');throw new RuntimeException('morceau raté');}catch(Throwable $_){migration_tx_rollback($p,$tx);}"
      + 'migration_tx_rollback($p,$tx);' // déjà annulé : sans effet
      + "$tx=migration_tx_begin($p);$p->exec('CREATE TABLE essai_garde (x)');migration_tx_commit($p,$tx);"
      + "if(!$p->inTransaction()){throw new RuntimeException('la marche n’est plus dans sa transaction');}"
      + "try{$p->beginTransaction();}catch(PDOException $e){echo 'imbriquée refusée|';}"
    ) + 'migrate_database($p,DB_PATH,$steps);echo $p->inTransaction()?"encore ouverte":"fermée";', dir);
    assert.equal(out, 'imbriquée refusée|fermée');
    assert.equal(JSON.parse(sql(dir, 'PRAGMA user_version')), 51);
    assert.ok(!tables(dir).includes('essai_annule'), 'le morceau annulé est resté');
    assert.ok(tables(dir).includes('essai_garde'), 'le morceau validé a disparu');
  });

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n${passed} vérifications réussies.`);
})().catch((e) => { if (e && !e.reported) console.log('  ✗ ' + (e && e.message ? e.message : e)); process.exitCode = 1; });
