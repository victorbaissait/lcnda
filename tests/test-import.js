'use strict';
// Les communes livrées avec l'app (lib/reference.php) ne sont pas chargées ici : tests plus rapides.
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * Test de l'ouverture d'une base et de la sauvegarde complète :   npm run test:import
 * Passe par la vraie application (PHP + envoi du fichier comme l'interface), sur des dossiers temporaires.
 *  1. une généalogie d'essai (GEDCOM fictif + 1 photo) → « Sauvegarde complète (.zip) » → ouverte dans une
 *     installation vide : personnes et photo retrouvées ;
 *  2. la base .db seule s'ouvre aussi (la photo est alors signalée manquante) ;
 *  3. une base déjà remplie n'est jamais remplacée ; un fichier qui n'est pas une base est refusé ;
 *  4. import d'un fichier lu sur le disque (application de bureau) : refusé sans le secret du processus principal ;
 *  5. fichier Hérédis natif (dossier .hmw fabriqué ici, fictif) : personnes, union, événements, lieu, témoin,
 *     source, photo, étiquette, tâche ; l'original n'est pas modifié ;
 *  6. une base neuve reçoit les communes françaises livrées avec l'app (contours, voisinages, GeoNames) ;
 *  7. n'importe quelle ville du monde : suggérée (avec coordonnées) ou tapée librement, même inconnue ;
 *  8. battues au-delà des frontières : pays voisins ajoutés, battue d'Halluin qui passe en Belgique, retrait refusé
 *     tant qu'une battue utilise le pays, retrait complet sinon ; Strasbourg ↔ Kehl ; outre-mer ajouté puis retiré.
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

function php(code, ...args) {
  const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code, ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error((r.stderr || r.stdout).trim());
  return r.stdout;
}
const rows = (dbFile, sql) => JSON.parse(php(`$d=new PDO('sqlite:'.$argv[1]);$d->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE,PDO::FETCH_ASSOC);echo json_encode($d->query($argv[2])->fetchAll(),JSON_UNESCAPED_UNICODE);`, dbFile, sql));

/** Petit fichier Hérédis fictif : mêmes tables et colonnes qu'un vrai (Hérédis 2019+), réduites au nécessaire. */
const HEREDIS_SQL = `
CREATE TABLE Notes (CodeID integer PRIMARY KEY, Note text DEFAULT '', NoteRTF text DEFAULT '');
CREATE TABLE Individus (CodeID integer PRIMARY KEY, XrefUnionParents integer, Noms text DEFAULT '', Prenoms text DEFAULT '', Prefixe text DEFAULT '', Suffixe text DEFAULT '', Profession text DEFAULT '', Sexe integer DEFAULT 0, Numero text DEFAULT '', Confidentiel boolean DEFAULT 0, Surnom text DEFAULT '', Titre text DEFAULT '', XrefNote integer, XrefNoteRecherche integer);
CREATE TABLE Unions (CodeID integer PRIMARY KEY, XrefEpoux integer, XrefEpouse integer, XrefNote integer);
CREATE TABLE LiensIndividuParents (CodeID integer PRIMARY KEY, XrefIndividu integer, XrefUnionParents integer, TypePere integer DEFAULT 0, TypeMere integer DEFAULT 0);
CREATE TABLE Lieux (CodeID integer PRIMARY KEY, CodeLieu text DEFAULT '', Ville text DEFAULT '', Departement text DEFAULT '', Region text DEFAULT '', Pays text DEFAULT '', Latitude double DEFAULT 2000000.0, Longitude double DEFAULT 2000000.0, XrefNote integer);
CREATE TABLE Subdivisions (CodeID integer PRIMARY KEY, Titre text DEFAULT '', Latitude double DEFAULT 2000000.0, Longitude double DEFAULT 2000000.0, XrefLieu integer);
CREATE TABLE Evenements (CodeID integer PRIMARY KEY, EventType integer DEFAULT 0, XrefLieu integer, XrefSubdivision integer, DateGed text DEFAULT '', Titre text DEFAULT '', Cause text DEFAULT '', XrefNote integer, XrefIndividuProprio integer, XrefUnionProprio integer);
CREATE TABLE LienIndividuEvenement (CodeID integer PRIMARY KEY, XrefEvenement integer, XrefIndividuOrig integer, TypeLienIndividu integer DEFAULT 0, Commentaire text DEFAULT '', Age text DEFAULT '', Titre text DEFAULT '');
CREATE TABLE Repositories (CodeID integer PRIMARY KEY, Titre text DEFAULT '');
CREATE TABLE Sources (CodeID integer PRIMARY KEY, Titre text DEFAULT '', Document text DEFAULT '', Cote text DEFAULT '', Archivage text DEFAULT '', Numero text DEFAULT '', Auteur text DEFAULT '', Url text DEFAULT '', DateGED text DEFAULT '', XrefRepository integer, XrefNote integer, XrefNoteTranscription integer);
CREATE TABLE LiensSourceEvenement (CodeID integer PRIMARY KEY, XrefSource integer, XrefEvenement integer, Citation text DEFAULT '', XrefNote integer, XrefNoteTranscription integer);
CREATE TABLE Medias (CodeID integer PRIMARY KEY, FilePath text DEFAULT '', FileName text DEFAULT '', DateGed text DEFAULT '', XrefNote integer);
CREATE TABLE LiensMediaIndividu (CodeID integer PRIMARY KEY, XrefMedia integer, Ordre integer DEFAULT 0, MediaPrincipal boolean DEFAULT 0, XrefIndividu integer);
CREATE TABLE Etiquettes (CodeID integer PRIMARY KEY, Titre text DEFAULT '', Description text DEFAULT '', Couleur integer DEFAULT 0);
CREATE TABLE LiensEtiquetteIndividu (CodeID integer PRIMARY KEY, XrefEtiquette integer, XrefIndividu integer);
CREATE TABLE Taches (CodeID integer PRIMARY KEY, DateEcheance timestamp DEFAULT 0, Titre text DEFAULT '', Description text DEFAULT '', Priorite integer DEFAULT 0, TacheRealisee boolean DEFAULT 0);
CREATE TABLE LiensTachesIndis (XrefTache integer, XrefIndividu integer);
CREATE TABLE NumerosSosa (XrefIndividu integer PRIMARY KEY, XrefDeCujus integer);
INSERT INTO Notes VALUES (1,'Note de Jean',''),(2,'Né à la maison','');
INSERT INTO Individus VALUES (1,2,'DUPONT','Jean','','','Professeur',109,'12',0,'JeanJean','',1,NULL),(2,NULL,'DUPONT','Louis','','','',109,'',0,'','',NULL,NULL),(3,NULL,'LEROY','Marie','','','',102,'',0,'','',NULL,NULL),(4,NULL,'MARTIN','Paul','','','',109,'',0,'','',NULL,NULL);
INSERT INTO Unions VALUES (2,2,3,NULL);
INSERT INTO LiensIndividuParents VALUES (1,1,2,0,0);
INSERT INTO Lieux VALUES (1,'87160','Arnac-la-Poste','Haute-Vienne','Nouvelle-Aquitaine','France',46.26597,1.37375,NULL);
INSERT INTO Subdivisions VALUES (1,'Le Bourg',2000000.0,2000000.0,1);
INSERT INTO Evenements VALUES (1,4,1,1,'28 JUN 1814','','',2,1,NULL),(2,61,1,NULL,'ABT 1810','','',NULL,NULL,2),(3,12,NULL,NULL,'BET 1880 AND 1885','','vieillesse',NULL,1,NULL),(4,15,NULL,NULL,'1820','Reconnaissance','',NULL,1,NULL),(5,23,NULL,NULL,'1840','Instituteur','',NULL,1,NULL);
INSERT INTO LienIndividuEvenement VALUES (1,1,4,0,'voisin','40 ans','Témoin');
INSERT INTO Repositories VALUES (1,'AD de la Haute-Vienne');
INSERT INTO Sources VALUES (1,'Registre paroissial d’Arnac','Acte de naissance','3 E 12','','','Curé','','',1,NULL,NULL);
INSERT INTO LiensSourceEvenement VALUES (1,1,1,'folio 12',NULL,NULL);
INSERT INTO Medias VALUES (1,'/chemin/qui/n-existe/plus/portrait.png','portrait.png','',NULL);
INSERT INTO LiensMediaIndividu VALUES (1,1,0,1,1);
INSERT INTO Etiquettes VALUES (1,'Mort pour la France','',-65281);
INSERT INTO LiensEtiquetteIndividu VALUES (1,1,1);
INSERT INTO Taches VALUES (1,'2027-03-01 00:00:00','Chercher le mariage','Archives de Limoges',3,0);
INSERT INTO LiensTachesIndis VALUES (1,1);
INSERT INTO NumerosSosa VALUES (1,1);`;

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

  await step('fichier Hérédis natif (.hmw) : tout est repris, l’original est intact', async () => {
    const hmw = path.join(tmp, 'Essai.hmw');
    fs.mkdirSync(path.join(hmw, 'Media', '#1'), { recursive: true });
    fs.copyFileSync(photo, path.join(hmw, 'Media', '#1', 'portrait.png'));
    const file = path.join(hmw, 'Essai.heredis');
    php('$d=new PDO("sqlite:".$argv[1]);$d->exec($argv[2]);', file, HEREDIS_SQL);
    const before = fs.readFileSync(file);
    const dir = path.join(tmp, 'E');
    await withServer(dir, async (s) => {
      const r = await s.importLocalFile(hmw);
      assert.equal(r.status, 200, JSON.stringify(r.data));
      const st = r.data.stats;
      assert.deepEqual([st.format, st.persons, st.families, st.sources, st.citations, st.media, st.media_missing, st.tasks, st.witnesses], ['heredis', 4, 1, 1, 1, 1, 0, 1, 1]);
    });
    const db = path.join(dir, 'data', 'genealogy.sqlite');
    const ev = rows(db, "SELECT t.label,t.gedcom_tag,e.date_text,e.title,e.description,e.cause,pl.name,pl.subdivision,pl.latitude FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id ORDER BY e.id");
    assert.deepEqual(ev.map((e) => [e.gedcom_tag || e.label, e.date_text, e.title || e.description || e.cause]), [
      ['BIRT', '28 juin 1814', 'Né à la maison'], ['MARR', 'vers 1810', ''], ['DEAT', 'entre 1880 et 1885', 'vieillesse'],
      ['Reconnaissance', '1820', ''], ['OCCU', '1840', 'Instituteur'], ['OCCU', '', 'Professeur']]);
    assert.deepEqual([ev[0].name, ev[0].subdivision, ev[0].latitude], ['Arnac-la-Poste', 'Le Bourg', 46.26597], 'lieu, subdivision et coordonnées');
    const jean = rows(db, "SELECT * FROM persons WHERE first_name='Jean'")[0];
    assert.deepEqual([jean.gender, jean.is_start, jean.reference_number, jean.living_status], ['male', 1, '12', 'deceased']);
    assert.ok(jean.portrait_media_id, 'photo principale');
    assert.equal(rows(db, "SELECT count(*) n FROM family_children fc JOIN families f ON f.id=fc.family_id WHERE fc.child_id=" + jean.id)[0].n, 1, 'filiation');
    assert.equal(rows(db, 'SELECT note FROM event_witnesses')[0].note, 'Témoin — âge : 40 ans — voisin');
    assert.equal(rows(db, 'SELECT agency FROM sources')[0].agency, 'AD de la Haute-Vienne');
    assert.equal(rows(db, "SELECT l.name FROM label_links k JOIN labels l ON l.id=k.label_id WHERE k.entity_type='person'")[0].name, 'Mort pour la France');
    assert.deepEqual(Object.values(rows(db, 'SELECT title,reminder_due_at FROM standalone_reminders')[0]), ['Chercher le mariage', '2027-03-01']);
    assert.ok(before.equals(fs.readFileSync(file)) && fs.readdirSync(hmw).sort().join(',') === 'Essai.heredis,Media', 'original non modifié');
  });

  await step('base neuve : communes françaises livrées avec l’application', async () => {
    process.env.GENEALOGY_SKIP_REFERENCE = '0';
    const dir = path.join(tmp, 'F');
    try {
      await withServer(dir, async (s, base) => {
        const r = await upload(s, base, fs.readFileSync(ged), 'complet.ged');
        assert.equal(r.status, 200, JSON.stringify(r.data));
        const dash = await (await fetch(base + '/api.php?action=dashboard', { headers: { 'x-carnet-secret': s.secret, cookie: r.cookie } })).json();
        assert.ok(dash.stats.places < 10, 'le tableau de bord ne compte que les lieux de la généalogie, pas le répertoire');
      });
    } finally { process.env.GENEALOGY_SKIP_REFERENCE = '1'; }
    const db = path.join(dir, 'data', 'genealogy.sqlite');
    assert.ok(count(db, 'commune_contours') > 34000, 'contours des communes');
    assert.ok(count(db, 'commune_neighbors') > 200000, 'communes voisines');
    const arnac = rows(db, "SELECT count(*) n FROM places WHERE geoname_id IS NOT NULL AND name='Arnac-la-Poste'")[0].n;
    assert.ok(arnac >= 1, 'communes GeoNames');
    assert.equal(count(db, 'persons'), 3, 'la généalogie importée est intacte');
  });

  await step('villes du monde : suggestion, saisie à la main, village inconnu', async () => {
    const dir = path.join(tmp, 'G');
    await withServer(dir, async (s, base) => {
      await upload(s, base, fs.readFileSync(ged), 'complet.ged');
      const h = { 'x-carnet-secret': s.secret };
      const boot = await fetch(base + '/api.php?action=bootstrap', { headers: h });
      const cookie = (boot.headers.get('set-cookie') || '').split(';')[0];
      const b = await boot.json();
      const sug = async (q) => (await (await fetch(`${base}/api.php?action=place_suggestions&world=1&country=&q=${encodeURIComponent(q)}`, { headers: { ...h, cookie } })).json()).places;
      const montreal = (await sug('Montréal'))[0];
      assert.deepEqual([montreal.name, montreal.country, String(montreal.id).startsWith('w')], ['Montréal', 'Canada', true], 'Montréal (Canada) en tête');
      const birth = b.eventTypes.find((t) => t.gedcom_tag === 'BIRT').id;
      const add = async (body) => {
        const r = await fetch(base + '/api.php?action=add_event', { method: 'POST', headers: { ...h, cookie, 'content-type': 'application/json', 'X-CSRF-Token': b.csrf }, body: JSON.stringify({ ...body, person_id: b.startPersonId, event_type_id: birth, csrf: b.csrf }) });
        assert.equal(r.status, 200, await r.text());
      };
      await add({ date_text: '1900', place_id: montreal.id, place_name: montreal.label, country: 'Canada' });
      await add({ date_text: '1901', place_id: '', place_name: 'Wabag', country: 'Papouasie-Nouvelle-Guinée' });
      await add({ date_text: '1902', place_id: '', place_name: 'Yibab', country: 'Papouasie-Nouvelle-Guinée' });
    });
    const got = rows(path.join(dir, 'data', 'genealogy.sqlite'), "SELECT e.date_text d, p.name, p.country, p.latitude IS NOT NULL gps FROM events e JOIN places p ON p.id=e.place_id WHERE e.date_text IN ('1900','1901','1902') ORDER BY e.date_text");
    assert.deepEqual(got.map((r) => [r.d, r.name, r.country, r.gps]), [
      ['1900', 'Montréal', 'Canada', 1], ['1901', 'Wabag', 'Papouasie-Nouvelle-Guinée', 1], ['1902', 'Yibab', 'Papouasie-Nouvelle-Guinée', 0]]);
  });

  await step('battues : pays voisins, voisinages de part et d’autre de la frontière', async () => {
    process.env.GENEALOGY_SKIP_REFERENCE = '0';
    const dir = path.join(tmp, 'H');
    try {
      await withServer(dir, async (s, base) => {
        await upload(s, base, fs.readFileSync(ged), 'complet.ged');
        const h = { 'x-carnet-secret': s.secret };
        const boot = await fetch(base + '/api.php?action=bootstrap', { headers: h });
        const cookie = (boot.headers.get('set-cookie') || '').split(';')[0];
        const { csrf } = await boot.json();
        const get = async (a) => (await fetch(`${base}/api.php?action=${a}`, { headers: { ...h, cookie } })).json();
        const post = async (a, body) => (await fetch(`${base}/api.php?action=${a}`, { method: 'POST', headers: { ...h, cookie, 'content-type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ ...body, csrf }) })).json();
        const available = (await get('reference_countries')).available;
        assert.deepEqual(Object.keys(available).sort(), ['AT', 'BE', 'CH', 'DE', 'ES', 'IT', 'LI', 'LU', 'OM']);
        const be = await post('set_reference_country', { country: 'BE', enabled: true });
        assert.ok(be.communes > 500 && be.border_links > 100, 'Belgique ajoutée avec ses voisinages frontaliers');
        assert.ok((await post('set_reference_country', { country: 'LU', enabled: true })).communes === 100);
        const tournai = (await get('commune_suggestions&q=Tournai')).communes[0];
        assert.deepEqual([tournai.insee_code, tournai.label.endsWith('Belgique')], ['BE-57081', true]);
        const battue = await post('save_battue', { title: 'Frontière', target_type: 'naissance', start_insee_code: '59279', max_level: 1 });
        const detail = await get('battue_detail&id=' + battue.result.id);
        const names = Object.values(detail.communes).map((c) => c.name);
        assert.ok(names.includes('Menen') && names.includes('Wervik'), 'Halluin → Menin et Wervik (Belgique) : ' + names.join(', '));
        await post('save_battue', { title: 'Départ belge', target_type: 'naissance', start_insee_code: 'BE-34027', max_level: 1 });
        assert.match((await post('set_reference_country', { country: 'BE', enabled: false })).error || '', /battues utilisent/, 'retrait refusé : une battue part de Menin');
        const lu = await post('set_reference_country', { country: 'LU', enabled: false });
        assert.deepEqual([lu.ok, lu.active], [true, ['BE']]);
        // Allemagne : Strasbourg ↔ Kehl, de l'autre côté du Rhin
        assert.ok((await post('set_reference_country', { country: 'DE', enabled: true })).communes > 10000);
        const rhin = await post('save_battue', { title: 'Rhin', target_type: 'naissance', start_insee_code: '67482', max_level: 1 });
        const rhinNames = Object.values((await get('battue_detail&id=' + rhin.result.id)).communes).map((c) => c.name);
        assert.ok(rhinNames.includes('Kehl'), 'Strasbourg → Kehl : ' + rhinNames.join(', '));
        // Outre-mer : codes INSEE sans préfixe, pays France ; retrait limité aux codes 97…
        const om = await post('set_reference_country', { country: 'OM', enabled: true });
        assert.equal(om.communes, 129);
        const abymes = (await get('commune_suggestions&q=Abymes')).communes[0];
        assert.equal(abymes.insee_code, '97101');
        const omOff = await post('set_reference_country', { country: 'OM', enabled: false });
        assert.equal(omOff.communes, 129);
      });
    } finally { process.env.GENEALOGY_SKIP_REFERENCE = '1'; }
    const db = path.join(dir, 'data', 'genealogy.sqlite');
    assert.equal(rows(db, "SELECT count(*) n FROM places WHERE country='Luxembourg'")[0].n, 0, 'lieux du Luxembourg retirés');
    assert.equal(rows(db, "SELECT count(*) n FROM commune_contours WHERE insee_code LIKE 'BE-%'")[0].n, 565, 'Belgique toujours présente');
    assert.ok(rows(db, "SELECT count(*) n FROM commune_contours WHERE insee_code NOT LIKE '%-%'")[0].n > 34000, 'France métropolitaine intacte après le retrait de l’outre-mer');
  });

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n${passed}/8 vérifications réussies.`);
})().catch((e) => {
  if (!e || !e.reported) console.error(e);
  process.exitCode = 1;
});
