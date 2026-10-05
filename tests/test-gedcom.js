'use strict';
// Les communes livrées avec l'app (lib/reference.php) ne sont pas chargées ici : tests plus rapides.
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * Test de l'import / export GEDCOM :   npm run test:gedcom
 * Passe par la vraie application (PHP + envoi du fichier comme l'interface), sur des dossiers temporaires.
 *  1. import de tests/fixtures/complet.ged (pièges d'Hérédis : notes RTF, lieux en 6 morceaux, MAP, _FIL…) ;
 *  2. export GEDCOM 5.5.1 puis réimport dans une base neuve : rien ne doit se perdre ;
 *  3. idem en GEDCOM 7.
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

/** Requête SQL en lecture sur une base de test (résultat en JSON). */
function query(dbFile, sql) {
  const code = `$d=new PDO('sqlite:'.$argv[1]);$d->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE,PDO::FETCH_ASSOC);echo json_encode($d->query($argv[2])->fetchAll(),JSON_UNESCAPED_UNICODE);`;
  const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code, dbFile, sql], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error((r.stderr || r.stdout).trim());
  return JSON.parse(r.stdout);
}
const one = (db, sql) => query(db, sql)[0] || {};

async function withServer(dataDir, mediaDir, fn) {
  const s = new PhpServer({ phpPath, appRoot, pool: 1, dataDir, mediaDir, sessionDir: path.join(dataDir, 'sessions'), logFile: path.join(dataDir, 'php.log') });
  s.on('error', () => {});
  await s.start();
  try { return await fn(s); } finally { await s.stop(); }
}

/** Ouvre une session comme la fenêtre, puis envoie le fichier à l'import (comme l'écran d'installation). */
async function importFile(s, file, name) {
  const base = `http://127.0.0.1:${s.port}`;
  const home = await fetch(base + '/', { headers: { 'x-carnet-secret': s.secret } });
  const cookie = (home.headers.get('set-cookie') || '').split(';')[0];
  const csrf = JSON.parse(((await home.text()).match(/window\.INSTALL_CSRF = ("[^"]*")/) || [])[1] || '""');
  const fd = new FormData();
  fd.append('file', new Blob([fs.readFileSync(file)]), name);
  fd.append('csrf', csrf);
  const r = await fetch(base + '/api.php?action=import_package', { method: 'POST', headers: { 'x-carnet-secret': s.secret, 'X-CSRF-Token': csrf, cookie }, body: fd });
  const data = await r.json();
  if (!r.ok || data.error) throw new Error('import refusé : ' + (data.error || r.status));
  return { stats: data.stats, cookie };
}

async function exportFile(s, version) {
  const r = await fetch(`http://127.0.0.1:${s.port}/api.php?action=export_gedcom&gedcom_version=${version}`, { headers: { 'x-carnet-secret': s.secret } });
  assert.equal(r.status, 200);
  return r.text();
}

/** Ce que l'on attend de la base après l'import du fichier complet (ou de son aller-retour). */
function checkContent(db, mediaDir, label) {
  const jean = one(db, "SELECT * FROM persons WHERE last_name='DUPONT' AND first_name LIKE 'Jean%'");
  assert.equal(jean.first_name, 'Jean Pierre', `${label} : prénom composé gardé entier`);
  assert.equal(jean.gender, 'male');
  const variants = query(db, `SELECT type,first_name,last_name FROM name_variants WHERE person_id=${jean.id} ORDER BY type`);
  assert.deepEqual(variants.map((v) => v.type + ':' + (v.type === 'nickname' ? v.first_name : v.last_name)), ['historical:DURAND', 'nickname:JeanJean'], `${label} : variantes de nom`);
  const ev = (tagOrLabel) => one(db, `SELECT e.*,t.label,t.gedcom_tag,pl.name place,pl.county,pl.state,pl.country,pl.latitude,pl.longitude FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id WHERE (t.gedcom_tag='${tagOrLabel}' OR t.label='${tagOrLabel}') AND (e.person_id=${jean.id} OR e.family_id IS NOT NULL) ORDER BY e.id LIMIT 1`);
  assert.equal(ev('OCCU').title, 'Professeur', `${label} : profession`);
  const birth = ev('BIRT');
  assert.equal(birth.date_text, '28 juin 1814', `${label} : date de naissance en français`);
  assert.equal(birth.year, 1814);
  assert.deepEqual([birth.place, birth.county, birth.state, birth.country], ['Arnac-la-Poste', 'Haute-Vienne', 'Nouvelle-Aquitaine', 'FRANCE'], `${label} : lieu découpé`);
  assert.ok(Math.abs(birth.latitude - 46.26597) < 1e-5 && Math.abs(birth.longitude - 1.37375) < 1e-5, `${label} : coordonnées GPS`);
  assert.equal(birth.cause, 'accouchement à domicile', `${label} : cause`);
  assert.equal(birth.description, 'note de naissance', `${label} : note d'événement (RTF converti)`);
  assert.equal(ev('Reconnaissance').date_text, 'vers 1820', `${label} : type personnalisé + date approximative`);
  assert.equal(ev('DEAT').date_text, 'entre 1880 et 1885', `${label} : intervalle de dates`);
  const notes = query(db, `SELECT n.body,p.first_name FROM notes n JOIN persons p ON p.id=n.entity_id WHERE n.entity_type='person' ORDER BY p.first_name`);
  const longNote = Array.from({ length: 30 }, (_, i) => `Mot${i + 1} suivi d’un espace,`).join(' ');
  assert.deepEqual(notes.map((n) => n.first_name + ' : ' + n.body), ['Jean Pierre : ceci est une note avec un accent : été', 'Louis : ' + longNote, 'Marie : Ligne 1 de la note\nLigne 2 de la note'], `${label} : notes de personnes (dont une longue, découpée à l'export)`);
  const child = one(db, `SELECT relation_to_partner1 r1, relation_to_partner2 r2 FROM family_children WHERE child_id=${jean.id}`);
  assert.deepEqual([child.r1, child.r2], ['adopted', 'adopted'], `${label} : adoption`);
  const marr = one(db, "SELECT e.date_text,pl.name FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id WHERE t.gedcom_tag='MARR'");
  assert.deepEqual([marr.date_text, marr.name], ['12 février 1810', 'Limoges'], `${label} : mariage`);
  assert.equal(ev('Mariage religieux').date_text, '13 février 1810', `${label} : événement familial personnalisé`);
  const cites = query(db, `SELECT s.title,s.author,s.agency,l.entity_type,l.page,l.quality FROM source_links l JOIN sources s ON s.id=l.source_record_id ORDER BY l.entity_type,l.page`);
  assert.deepEqual(cites.map((c) => [c.entity_type, c.page, c.quality].join('|')), ['event|folio 12|3', 'person|acte n° 4|'], `${label} : citations (page, qualité)`);
  assert.deepEqual([cites[0].title, cites[0].author, cites[0].agency], ['Registres paroissiaux d’Arnac', 'Curé d’Arnac', 'AD de la Haute-Vienne'], `${label} : source et dépôt d'archives`);
  const media = query(db, "SELECT m.title,m.filename,l.entity_type FROM media m JOIN media_links l ON l.media_id=m.id");
  assert.equal(media.length, 1, `${label} : photo importée`);
  assert.equal(media[0].title, 'Portrait de Jean');
  assert.ok(fs.existsSync(path.join(mediaDir, media[0].filename)), `${label} : fichier de la photo copié`);
  const marie = one(db, "SELECT p.first_name,p.middle_name,pl.name,pl.county,pl.state,pl.country FROM persons p JOIN events e ON e.person_id=p.id JOIN places pl ON pl.id=e.place_id WHERE p.last_name='LEROY'");
  assert.deepEqual([marie.first_name, marie.middle_name], ['Marie', 'Louise'], `${label} : deuxième prénom gardé à part`);
  assert.deepEqual([marie.name, marie.county, marie.state, marie.country], ['Ulm', 'Regierungsbezirk Tübingen', 'Baden-Württemberg', 'Allemagne'], `${label} : lieu étranger`);
  assert.equal(one(db, 'SELECT count(*) n FROM persons').n, 3);
}

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-gedcom-'));
  console.log('Test import / export GEDCOM (' + phpPath + ')');
  const check = checkPhp(phpPath);
  if (!check.ok) throw new Error(check.error || 'extensions manquantes : ' + check.missing.join(', '));

  // Fichier d'essai : la photo pointe vers un vrai fichier (comme le chemin complet qu'écrit Hérédis).
  const photo = path.join(tmp, 'Capture d’écran 2026 à 00.56.png');
  fs.writeFileSync(photo, Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex'));
  const fixture = path.join(tmp, 'complet.ged');
  fs.writeFileSync(fixture, fs.readFileSync(path.join(__dirname, 'fixtures', 'complet.ged'), 'utf8').replace('__PHOTO__', photo));
  const media = path.join(tmp, 'media'); // même dossier de médias pour toutes les bases : comme dans une vraie installation
  const dirA = path.join(tmp, 'A'); const dbA = path.join(dirA, 'genealogy.sqlite');
  let exported = {};

  await step('import d’un GEDCOM « à la Hérédis » : tous les champs sont repris', async () => {
    await withServer(dirA, media, async (s) => {
      const { stats } = await importFile(s, fixture, 'complet.ged');
      assert.deepEqual([stats.persons, stats.families, stats.sources, stats.citations, stats.media, stats.media_missing], [3, 1, 1, 2, 1, 0]);
      exported['5.5.1'] = await exportFile(s, '5.5.1');
      exported['7'] = await exportFile(s, '7');
    });
    checkContent(dbA, media, 'import');
  });

  await step('l’export 5.5.1 est lisible par les autres logiciels (dates, lieux, notes, sources)', async () => {
    const g = exported['5.5.1'];
    for (const expected of ['2 DATE 28 JUN 1814', '2 DATE ABT 1820', '2 DATE BET 1880 AND 1885', '2 DATE 12 FEB 1810',
      '2 PLAC Arnac-la-Poste, , Haute-Vienne, Nouvelle-Aquitaine, FRANCE,', '4 LATI N46.26597', '2 TYPE Reconnaissance',
      '1 NOTE ceci est une note avec un accent : été', '1 NOTE Ligne 1 de la note', '2 CONT Ligne 2 de la note', '3 PAGE folio 12',
      '3 QUAY 3', '1 NAME AD de la Haute-Vienne', '2 NICK JeanJean', '2 TYPE married', '2 PEDI adopted', '2 CAUS accouchement à domicile']) {
      assert.ok(g.includes(expected + '\n'), 'absent de l’export : « ' + expected + ' »');
    }
    assert.ok(!g.includes('\\rtf'), 'du RTF est resté dans l’export');
    assert.ok(!/juin|février/.test(g.split('\n').filter((l) => / DATE /.test(l)).join('\n')), 'date restée en français');
  });

  for (const version of ['5.5.1', '7']) {
    await step(`aller-retour GEDCOM ${version} : rien ne se perd`, async () => {
      const dir = path.join(tmp, 'B' + version);
      const file = path.join(tmp, `export-${version}.ged`);
      fs.writeFileSync(file, exported[version]);
      await withServer(dir, media, async (s) => { await importFile(s, file, `export-${version}.ged`); });
      checkContent(path.join(dir, 'genealogy.sqlite'), media, 'aller-retour ' + version);
    });
  }

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n${passed} vérifications réussies.`);
})().catch((e) => { if (e && !e.reported) console.log('  ✗ ' + (e && e.message ? e.message : e)); process.exitCode = 1; });
