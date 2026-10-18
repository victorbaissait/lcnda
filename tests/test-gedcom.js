'use strict';
// Les communes livrées avec l'app (lib/reference.php) ne sont pas chargées ici : tests plus rapides.
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * Test de l'import / export GEDCOM :   npm run test:gedcom
 * Passe par la vraie application (PHP + envoi du fichier comme l'interface), sur des dossiers temporaires.
 *  1. import de tests/fixtures/complet.ged (pièges d'Hérédis : notes RTF, lieux en 6 morceaux, MAP, _FIL…) ;
 *  2. export GEDCOM 5.5.1 puis réimport dans une base neuve : rien ne doit se perdre ;
 *  3. idem en GEDCOM 7 ; 4. export « pour partager » ; 5. fusion de l'arbre d'un cousin ;
 *  6. favori et annulation de la dernière modification (raccourcis ⌘D et ⌘Z).
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

async function exportFile(s, version, extra = '') {
  const r = await fetch(`http://127.0.0.1:${s.port}/api.php?action=export_gedcom&gedcom_version=${version}${extra}`, { headers: { 'x-carnet-secret': s.secret } });
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
      // Ouvert depuis le disque, comme l'app de bureau : la photo au chemin complet est reprise.
      // (Un .ged envoyé par une page web ne va jamais chercher de fichier ailleurs sur le disque.)
      const local = await s.importLocalFile(fixture);
      if (local.status !== 200 || local.data.error) throw new Error('import refusé : ' + (local.data.error || local.status));
      const { stats } = local.data;
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

  await step('export « pour partager » : vivants et fiches confidentielles masqués', async () => {
    // Personnes fictives : Paul (né en 1950, sans décès) = vivant ; Lucie (née en 1985) = vivante ; Émile (mort en 1900)
    // = visible ; Rose (née en 1880 mais marquée confidentielle après l'import) = masquée.
    const ged = ['0 HEAD', '1 GEDC', '2 VERS 5.5.1', '1 CHAR UTF-8',
      '0 @I1@ INDI', '1 NAME Paul/MARTIN/', '1 SEX M', '1 BIRT', '2 DATE 3 MAR 1950', '2 PLAC Tulle', '1 NOTE secret de Paul', '1 FAMS @F1@',
      '0 @I2@ INDI', '1 NAME Lucie/MARTIN/', '1 SEX F', '1 BIRT', '2 DATE 1985', '1 FAMC @F1@',
      '0 @I3@ INDI', '1 NAME Émile/MARTIN/', '1 SEX M', '1 BIRT', '2 DATE 1830', '1 DEAT', '2 DATE 1900', '1 FAMS @F2@',
      '0 @I4@ INDI', '1 NAME Rose/BERNARD/', '1 SEX F', '1 BIRT', '2 DATE 1880', '1 DEAT', '2 DATE 1950', '1 FAMS @F2@',
      '0 @F1@ FAM', '1 HUSB @I1@', '1 CHIL @I2@', '1 MARR', '2 DATE 1975', '2 PLAC Brive',
      '0 @F2@ FAM', '1 HUSB @I3@', '1 WIFE @I4@', '1 MARR', '2 DATE 1899', '2 PLAC Uzerche', '0 TRLR', ''].join('\n');
    const dir = path.join(tmp, 'P'); const file = path.join(tmp, 'partage.ged');
    fs.writeFileSync(file, ged);
    await withServer(dir, path.join(tmp, 'media-p'), async (s) => { await importFile(s, file, 'partage.ged'); });
    const code = `$d=new PDO('sqlite:'.$argv[1]);$d->exec("UPDATE persons SET is_private=1 WHERE first_name='Rose'");`;
    spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code, path.join(dir, 'genealogy.sqlite')]);
    const [full, shared] = await withServer(dir, path.join(tmp, 'media-p'), async (s) => [await exportFile(s, '7'), await exportFile(s, '7', '&share=1')]);
    assert.ok(full.includes('Paul') && full.includes('Rose'), 'export normal : tout le monde est là');
    for (const hiddenText of ['Paul', 'Lucie', 'Rose', 'secret de Paul', '1950', '1985', 'Tulle', 'Brive', 'Uzerche', '1975']) {
      assert.ok(!shared.includes(hiddenText), 'sorti dans l’export à partager : « ' + hiddenText + ' »');
    }
    assert.ok(shared.includes('1 NAME Émile /MARTIN/') && shared.includes('2 DATE 1830'), 'Émile (mort en 1900) reste visible');
    assert.equal((shared.match(/NAME Personne \/vivante\//g) || []).length, 2, 'deux personnes vivantes anonymes');
    assert.equal((shared.match(/NAME Fiche \/confidentielle\//g) || []).length, 1, 'une fiche confidentielle anonyme');
    assert.equal((shared.match(/^0 @F\d+@ FAM$/gm) || []).length, 2, 'les familles restent (liens familiaux)');
  });

  await step('fusion de l’arbre d’un cousin : mêmes personnes complétées, nouvelles ajoutées, homonyme séparé, rien en double', async () => {
    const head = ['0 HEAD', '1 GEDC', '2 VERS 5.5.1', '1 CHAR UTF-8'];
    const mine = [...head,
      '0 @I1@ INDI', '1 NAME Émile/MARTIN/', '1 SEX M', '1 BIRT', '2 DATE 1830', '2 PLAC Tulle', '1 DEAT', '2 DATE 1900', '1 FAMS @F1@',
      '0 @I2@ INDI', '1 NAME Rose/BERNARD/', '1 SEX F', '1 BIRT', '2 DATE 1835', '1 FAMS @F1@',
      '0 @I3@ INDI', '1 NAME Paul/MARTIN/', '1 SEX M', '1 BIRT', '2 DATE 1860', '1 FAMC @F1@',
      '0 @F1@ FAM', '1 HUSB @I1@', '1 WIFE @I2@', '1 CHIL @I3@', '1 MARR', '2 DATE 1859', '0 TRLR', ''].join('\n');
    // Arbre du cousin : mêmes Émile et Rose (Émile a en plus une profession et une note), Paul né « en 1861 »,
    // une sœur Jeanne inconnue chez moi, et un autre Émile MARTIN né en 1950 (homonyme : ne doit pas être fusionné).
    const cousin = [...head,
      '0 @P1@ INDI', '1 NAME Emile/MARTIN/', '1 SEX M', '1 BIRT', '2 DATE 1830', '2 PLAC Tulle', '1 DEAT', '2 DATE 1900', '1 OCCU Sabotier', '1 NOTE Note du cousin sur Émile', '1 FAMS @G1@',
      '0 @P2@ INDI', '1 NAME Rose/BERNARD/', '1 SEX F', '1 FAMS @G1@',
      '0 @P3@ INDI', '1 NAME Paul/MARTIN/', '1 SEX M', '1 BIRT', '2 DATE 1861', '1 FAMC @G1@',
      '0 @P4@ INDI', '1 NAME Jeanne/MARTIN/', '1 SEX F', '1 BIRT', '2 DATE 1863', '1 FAMC @G1@',
      '0 @P5@ INDI', '1 NAME Émile/MARTIN/', '1 SEX M', '1 BIRT', '2 DATE 1950',
      '0 @G1@ FAM', '1 HUSB @P1@', '1 WIFE @P2@', '1 CHIL @P3@', '1 CHIL @P4@', '1 MARR', '2 DATE 1859', '0 TRLR', ''].join('\n');
    const dir = path.join(tmp, 'M'); const db = path.join(dir, 'genealogy.sqlite');
    fs.writeFileSync(path.join(tmp, 'mien.ged'), mine); fs.writeFileSync(path.join(tmp, 'cousin.ged'), cousin);
    await withServer(dir, path.join(tmp, 'media-m'), async (s) => {
      await importFile(s, path.join(tmp, 'mien.ged'), 'mien.ged');
      const base = `http://127.0.0.1:${s.port}`;
      const boot = await fetch(base + '/api.php?action=bootstrap', { headers: { 'x-carnet-secret': s.secret } });
      const cookie = (boot.headers.get('set-cookie') || '').split(';')[0];
      const csrf = (await boot.json()).csrf;
      const headers = { 'x-carnet-secret': s.secret, 'X-CSRF-Token': csrf, cookie };
      const analyse = async () => {
        const fd = new FormData(); fd.append('file', new Blob([cousin]), 'cousin.ged'); fd.append('csrf', csrf);
        const r = await fetch(base + '/api.php?action=merge_gedcom_analyse', { method: 'POST', headers, body: fd });
        const d = await r.json(); if (!r.ok || d.error) throw new Error('analyse : ' + (d.error || r.status)); return d;
      };
      const apply = async (d) => {
        const decisions = {};
        for (const row of d.rows) decisions[row.id] = row.proposal === 'new' ? { action: 'new' } : { action: 'same', target: row.candidates[0].id };
        const r = await fetch(base + '/api.php?action=merge_gedcom_apply', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ csrf, token: d.token, origin: 'Arbre de Paul', decisions }) });
        const res = await r.json(); if (!r.ok || res.error) throw new Error('fusion : ' + (res.error || r.status)); return res;
      };
      const d = await analyse();
      const by = (fn, yr) => d.rows.find((r) => r.person.first_name === fn && r.person.birth === yr);
      assert.equal(by('Emile', 1830).proposal, 'same', 'Émile reconnu malgré l’accent');
      assert.equal(by('Paul', 1861).proposal, 'same', 'Paul reconnu à un an près');
      assert.equal(by('Jeanne', 1863).proposal, 'new', 'Jeanne est nouvelle');
      assert.equal(by('Émile', 1950).proposal, 'new', 'l’homonyme de 1950 n’est pas fusionné');
      assert.ok(by('Emile', 1830).missing.some((m) => m.includes('Sabotier') || m.includes('Profession')), 'la profession manquante est annoncée');
      const res = await apply(d);
      assert.equal(res.stats.added, 2); assert.ok(res.backup.endsWith('-avant-fusion.db') && fs.existsSync(path.join(dir, 'backups', res.backup)), 'copie de sécurité');
      // Refaire la même fusion n'ajoute rien
      const again = await apply(await analyse());
      assert.deepEqual([again.stats.added, again.stats.events, again.stats.notes, again.stats.families, again.stats.children_links], [0, 0, 0, 0, 0], 'deuxième fusion identique : rien en double');
    });
    assert.equal(one(db, 'SELECT count(*) n FROM persons').n, 5, '3 personnes + Jeanne + l’homonyme');
    assert.equal(one(db, "SELECT count(*) n FROM events e JOIN persons p ON p.id=e.person_id JOIN event_types t ON t.id=e.event_type_id WHERE p.first_name='Émile' AND p.last_name='MARTIN' AND t.gedcom_tag='BIRT'").n, 2, 'une naissance par Émile, pas de doublon');
    assert.equal(one(db, "SELECT e.title FROM events e JOIN persons p ON p.id=e.person_id JOIN event_types t ON t.id=e.event_type_id WHERE p.first_name='Émile' AND t.gedcom_tag='OCCU'").title, 'Sabotier', 'profession ajoutée à mon Émile');
    assert.equal(one(db, "SELECT count(*) n FROM family_children fc JOIN persons c ON c.id=fc.child_id JOIN families f ON f.id=fc.family_id JOIN persons pa ON pa.id=f.partner1_id WHERE c.first_name='Jeanne' AND pa.first_name='Émile'").n, 1, 'Jeanne rattachée à Émile et Rose');
    assert.equal(one(db, 'SELECT count(*) n FROM families').n, 1, 'pas de famille en double');
    assert.equal(one(db, "SELECT count(*) n FROM notes WHERE body LIKE 'Note du cousin%'").n, 1, 'note ajoutée une seule fois');
    assert.equal(one(db, "SELECT count(*) n FROM label_links l JOIN labels b ON b.id=l.label_id WHERE b.name='Fusion : Arbre de Paul'").n, 3, 'étiquette sur Émile (complété), Jeanne et l’homonyme');
  });

  // Pas du GEDCOM, mais la même base sert : ce dont les raccourcis clavier ont besoin côté serveur
  await step('raccourcis : favori (⌘D) et annulation de la dernière modification (⌘Z)', async () => {
    const dir = path.join(tmp, 'M'); const db = path.join(dir, 'genealogy.sqlite');
    const emile = one(db, "SELECT * FROM persons WHERE first_name='Émile' AND last_name='MARTIN' ORDER BY id LIMIT 1");
    await withServer(dir, path.join(tmp, 'media-m'), async (s) => {
      const base = `http://127.0.0.1:${s.port}`;
      const boot = await fetch(base + '/api.php?action=bootstrap', { headers: { 'x-carnet-secret': s.secret } });
      const cookie = (boot.headers.get('set-cookie') || '').split(';')[0];
      const csrf = (await boot.json()).csrf;
      const call = async (action, body) => {
        const r = await fetch(base + '/api.php?action=' + action, body ? { method: 'POST', headers: { 'x-carnet-secret': s.secret, 'X-CSRF-Token': csrf, cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ csrf, ...body }) } : { headers: { 'x-carnet-secret': s.secret, cookie } });
        const d = await r.json(); if (!r.ok || d.error) throw new Error(action + ' : ' + (d.error || r.status)); return d;
      };
      await call('set_person_bookmark', { person_id: emile.id, bookmarked: 1 });
      assert.equal(one(db, `SELECT is_bookmarked b FROM persons WHERE id=${emile.id}`).b, 1, 'favori');
      await call('save_person', { ...emile, occupation: 'Tonnelier' });
      assert.equal(one(db, `SELECT occupation o FROM persons WHERE id=${emile.id}`).o, 'Tonnelier');
      const c = await call('undo_candidate');
      assert.ok(c.available && c.mode === 'revert' && c.summary.includes('Émile'), 'la modification est proposée à l’annulation : ' + JSON.stringify(c));
      await call('undo_change', { id: c.id });
      assert.equal(one(db, `SELECT occupation o FROM persons WHERE id=${emile.id}`).o || '', emile.occupation || '', 'métier d’avant remis');
      // Modifiée « par ailleurs » depuis : refus, rien n'est touché
      await call('save_person', { ...emile, occupation: 'Charron' });
      const code = `$d=new PDO('sqlite:'.$argv[1]);$d->exec("UPDATE persons SET occupation='Autre chose' WHERE id=${emile.id}");`;
      spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code, db]);
      const c2 = await call('undo_candidate');
      assert.equal(c2.available, false, 'fiche retouchée depuis : pas d’annulation automatique');
      await assert.rejects(call('undo_change', { id: c2.id }));
      assert.equal(one(db, `SELECT occupation o FROM persons WHERE id=${emile.id}`).o, 'Autre chose');
    });
  });

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n${passed} vérifications réussies.`);
})().catch((e) => { if (e && !e.reported) console.log('  ✗ ' + (e && e.message ? e.message : e)); process.exitCode = 1; });
