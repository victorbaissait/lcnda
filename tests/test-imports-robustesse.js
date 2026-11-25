'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * Imports « n'importe quoi » (tout sauf le GEDCOM lui-même) :   node tests/test-imports-robustesse.js
 * Un vrai « php -S » sur une base neuve (dossiers temporaires), noms fictifs (MAZAUD, LACOMBE, DURAND).
 * Pour chaque porte d'entrée d'un fichier : Gramps (.gramps, .gpkg), GedZip / archives (.zip, .gdz), Hérédis (.heredis),
 * MacFamilyTree (.mftpkg), RootsMagic (.rmtree, .rmgc), Family Tree Maker (.ftm), GeneWeb (.gw), GEDCOM-X (.json, .xml),
 * ouverture d'une base ou d'une sauvegarde (.db, .zip), relevés / tableau de personnes / RIS / KML / GeoJSON (lignes déjà
 * lues par le navigateur), correspondances ADN, liste et bloc LCNDA, décès INSEE, prénoms INSEE, analyse d'un fichier :
 *  1. fichiers vides, octets au hasard, mauvaise extension (JPG renommé .gramps, ZIP renommé .heredis…), archive coupée,
 *     texte en UTF-16 ou Windows-1252 : refusés avec une phrase claire (jamais une erreur interne), rien n'entre dans la base ;
 *  2. pièges : bombe zip (refusée par les bornes de taille), chemins « ../ » (rien n'est écrit ni lu hors du dossier), liens
 *     symboliques dans un zip ou un .gpkg, XML à ENTITY (XXE, « billion laughs ») refusé, chemin de média qui sort du paquet
 *     (MacFamilyTree, Hérédis : jamais un fichier de l'ordinateur copié dans les médias) ;
 *  3. contenus absurdes : dates sans queue ni tête, famille circulaire, identifiants en double, références manquantes ;
 *     CSV : guillemets non fermés, 10 000 colonnes, formules « =cmd| » (vidées) ;
 *  4. fichiers valides (petits, fabriqués ici) : importés, puis « ↶ Annuler » remet la base exactement comme avant ;
 *     même fichier importé deux fois ; deux imports lancés en même temps (double clic) : la base reste cohérente ;
 *  5. mode consultation : tout import refusé (423), rien n'entre.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const phpPath = findPhp([devBundledPhp()]);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-robu-'));
const dir = path.join(tmp, 'data');
const work = path.join(tmp, 'fabrique'); // fichiers fabriqués par le test (jamais dans le dossier de l'app)
const sysTmp = path.join(tmp, 'systmp'); // dossier temporaire de PHP : on y vérifie qu'aucun piège n'écrit
const envFor = d => ({ ...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1', TMPDIR: sysTmp });
fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
fs.mkdirSync(work, { recursive: true });
fs.mkdirSync(sysTmp, { recursive: true });
// un « secret » hors des dossiers de l'app : aucun import ne doit le lire ni le copier
const SECRET_DIR = path.join(tmp, 'secret');
fs.mkdirSync(SECRET_DIR, { recursive: true });
const SECRET_TEXT = 'SECRET-NE-DOIT-JAMAIS-SORTIR-' + crypto.randomBytes(6).toString('hex');
for (const f of ['id_rsa.jpg', 'releve-banque.pdf', 'motdepasse.txt']) fs.writeFileSync(path.join(SECRET_DIR, f), SECRET_TEXT);

let passed = 0, failed = 0;
async function step(name, fn) { try { await fn(); passed++; console.log('  ✓ ' + name); } catch (e) { failed++; console.log('  ✗ ' + name + '\n      ' + (e && e.message ? e.message : e) + '\n      ' + (e && e.stack ? (e.stack.split('\n').find(l => l.includes('test-imports-robustesse')) || '').trim() : '')); } }
function php(code, ...args) {
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-d', 'memory_limit=1G', '-r', code, ...args], { cwd: appRoot, encoding: 'utf8', env: envFor(dir), maxBuffer: 64 * 1048576 });
    if (r.status !== 0) throw new Error((r.stderr || r.stdout).trim().slice(0, 800));
    return r.stdout;
}
const DB = path.join(dir, 'genealogy.sqlite');
const sql = q => JSON.parse(php(`$d=new PDO('sqlite:'.$argv[1]);$d->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE,PDO::FETCH_ASSOC);echo json_encode($d->query($argv[2])->fetchAll(),JSON_UNESCAPED_UNICODE);`, DB, q));
const one = q => sql(q)[0] || {};
const exec = q => php(`$d=new PDO('sqlite:'.$argv[1]);$d->exec($argv[2]);`, DB, q);
/** Une petite base SQLite fabriquée (Hérédis, RootsMagic, MacFamilyTree, base LCNDA…) */
const sqliteFile = (file, script) => { try { fs.unlinkSync(file); } catch (_) {} php('$d=new PDO("sqlite:".$argv[1]);$d->exec($argv[2]);', file, script); return fs.readFileSync(file); };
/**
 * Une archive zip fabriquée par PHP (ZipArchive) : entrées [nom, contenu (texte, ou {file}), options]. opts.link = lien
 * symbolique (attributs Unix), opts.store = sans compression.
 */
function makeZip(entries) {
    const spec = path.join(work, 'zip-' + crypto.randomBytes(4).toString('hex') + '.json');
    const out = spec.replace(/\.json$/, '.zip');
    fs.writeFileSync(spec, JSON.stringify(entries.map(([n, c, o]) => [n, Buffer.isBuffer(c) ? { b64: c.toString('base64') } : c, o || {}])));
    php(String.raw`$spec=json_decode(file_get_contents($argv[1]),true);$z=new ZipArchive();$z->open($argv[2],ZipArchive::CREATE|ZipArchive::OVERWRITE);
foreach($spec as [$n,$c,$o]){
  if(is_array($c)&&isset($c['zeros'])){$z->addFromString($n,str_repeat("\0",$c['zeros']));}
  elseif(is_array($c)&&isset($c['b64'])){$z->addFromString($n,base64_decode($c['b64']));}
  elseif(is_array($c)&&isset($c['file'])){$z->addFile($c['file'],$n);}
  else{$z->addFromString($n,(string)$c);}
  if(!empty($o['link'])){$z->setExternalAttributesName($n,ZipArchive::OPSYS_UNIX,(0120777)<<16);}
  if(!empty($o['store'])){$z->setCompressionName($n,ZipArchive::CM_STORE);}
}
$z->close();`, spec, out);
    return fs.readFileSync(out);
}
/** Un tar (ustar) fabriqué ici : [nom, contenu, type ('0' fichier, '2' lien symbolique, '5' dossier), cible du lien] */
function makeTar(entries) {
    const blocks = [];
    for (const [name, content = '', type = '0', link = ''] of entries) {
        const body = Buffer.isBuffer(content) ? content : Buffer.from(content);
        const h = Buffer.alloc(512, 0);
        h.write(name.slice(0, 100), 0, 'utf8');
        h.write('0000644\0', 100); h.write('0000000\0', 108); h.write('0000000\0', 116);
        h.write((type === '0' ? body.length : 0).toString(8).padStart(11, '0') + '\0', 124);
        h.write('00000000000\0', 136); h.write('        ', 148); h.write(type, 156); h.write(link.slice(0, 100), 157);
        h.write('ustar\0', 257); h.write('00', 263);
        let sum = 0; for (const b of h) sum += b; h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148);
        blocks.push(h);
        if (type === '0') { blocks.push(body); const pad = (512 - (body.length % 512)) % 512; if (pad) blocks.push(Buffer.alloc(pad)); }
    }
    blocks.push(Buffer.alloc(1024));
    return Buffer.concat(blocks);
}

const JPG = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDAsKCwwMDA4QEA4QDQwMEBQREBUUFBwXFBwiHBocIiEiISAgMS4xMjE5OztPNi9KUkpEWv/AAAsIAAEAAQEBEQD/xAAUAAEAAAAAAAAAAAAAAAAAAAAJ/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAAPwBH/9k=', 'base64');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const RANDOM = crypto.randomBytes(4096);
const utf16 = s => Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(s, 'utf16le')]);
const win1252 = s => Buffer.from(s.replace(/é/g, '\xe9').replace(/è/g, '\xe8').replace(/ç/g, '\xe7'), 'latin1');

// ── petits fichiers valides fabriqués ici ──
const GRAMPS_XML = (people = [['I1', 'Pierre', 'MAZAUD', 'M'], ['I2', 'Jeanne', 'LACOMBE', 'F'], ['I3', 'Louis', 'MAZAUD', 'M']], extra = '') => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE database PUBLIC "-//Gramps//DTD Gramps XML 1.7.1//EN" "http://gramps-project.org/xml/1.7.1/grampsxml.dtd">
<database xmlns="http://gramps-project.org/xml/1.7.1/">
  <header><created date="2026-01-01" version="5.2.0"/></header>
  <events>
    <event handle="_e1" id="E1"><type>Birth</type><dateval val="1850-03-12"/></event>
    <event handle="_e2" id="E2"><type>Death</type><dateval val="31 février 18xx"/></event>
  </events>
  <people>
${people.map(([id, f, l, g]) => `    <person handle="_${id}" id="${id}"><gender>${g}</gender><name type="Birth Name"><first>${f}</first><surname>${l}</surname></name>${id === 'I1' ? '<eventref hlink="_e1" role="Primary"/><eventref hlink="_e2" role="Primary"/><parentin hlink="_f1"/>' : id === 'I2' ? '<parentin hlink="_f1"/>' : '<childof hlink="_f1"/>'}</person>`).join('\n')}
  </people>
  <families>
    <family handle="_f1" id="F1"><rel type="Married"/><father hlink="_I1"/><mother hlink="_I2"/><childref hlink="_I3"/></family>
  </families>${extra}
</database>`;
const gz = s => zlib.gzipSync(Buffer.isBuffer(s) ? s : Buffer.from(s));

const HEREDIS_SCHEMA = `
CREATE TABLE Notes (CodeID integer PRIMARY KEY, Note text DEFAULT '', NoteRTF text DEFAULT '');
CREATE TABLE Individus (CodeID integer PRIMARY KEY, XrefUnionParents integer, Noms text DEFAULT '', Prenoms text DEFAULT '', Prefixe text DEFAULT '', Suffixe text DEFAULT '', Profession text DEFAULT '', Sexe integer DEFAULT 0, Numero text DEFAULT '', Confidentiel boolean DEFAULT 0, Surnom text DEFAULT '', Titre text DEFAULT '', XrefNote integer, XrefNoteRecherche integer);
CREATE TABLE Unions (CodeID integer PRIMARY KEY, XrefEpoux integer, XrefEpouse integer, XrefNote integer);
CREATE TABLE LiensIndividuParents (CodeID integer PRIMARY KEY, XrefIndividu integer, XrefUnionParents integer, TypePere integer DEFAULT 0, TypeMere integer DEFAULT 0);
CREATE TABLE Lieux (CodeID integer PRIMARY KEY, CodeLieu text DEFAULT '', Ville text DEFAULT '', Departement text DEFAULT '', Region text DEFAULT '', Pays text DEFAULT '', Latitude double DEFAULT 2000000.0, Longitude double DEFAULT 2000000.0, XrefNote integer);
CREATE TABLE Subdivisions (CodeID integer PRIMARY KEY, Titre text DEFAULT '', Latitude double DEFAULT 2000000.0, Longitude double DEFAULT 2000000.0, XrefLieu integer);
CREATE TABLE Evenements (CodeID integer PRIMARY KEY, EventType integer DEFAULT 0, XrefLieu integer, XrefSubdivision integer, DateGed text DEFAULT '', Titre text DEFAULT '', Cause text DEFAULT '', XrefNote integer, XrefIndividuProprio integer, XrefUnionProprio integer);
CREATE TABLE LienIndividuEvenement (CodeID integer PRIMARY KEY, XrefEvenement integer, XrefIndividuOrig integer, TypeLienIndividu integer DEFAULT 0, Commentaire text DEFAULT '', Age text DEFAULT '', Titre text DEFAULT '');
CREATE TABLE Medias (CodeID integer PRIMARY KEY, FilePath text DEFAULT '', FileName text DEFAULT '', DateGed text DEFAULT '', XrefNote integer);
CREATE TABLE LiensMediaIndividu (CodeID integer PRIMARY KEY, XrefMedia integer, Ordre integer DEFAULT 0, MediaPrincipal boolean DEFAULT 0, XrefIndividu integer);
CREATE TABLE Taches (CodeID integer PRIMARY KEY, DateEcheance timestamp DEFAULT 0, Titre text DEFAULT '', Description text DEFAULT '', Priorite integer DEFAULT 0, TacheRealisee boolean DEFAULT 0);
CREATE TABLE LiensTachesIndis (XrefTache integer, XrefIndividu integer);`;
const HEREDIS_OK = HEREDIS_SCHEMA + `
INSERT INTO Individus VALUES (1,NULL,'DURAND','Marcel','','','Meunier',109,'',0,'','',NULL,NULL),(2,NULL,'LACOMBE','Rose','','','',102,'',0,'','',NULL,NULL),(3,2,'DURAND','Émile','','','',109,'',0,'','',NULL,NULL);
INSERT INTO Unions VALUES (2,1,2,NULL);
INSERT INTO LiensIndividuParents VALUES (1,3,2,0,0);
INSERT INTO Lieux VALUES (1,'19270','Ussac','Corrèze','Nouvelle-Aquitaine','France',45.19,1.51,NULL);
INSERT INTO Evenements VALUES (1,4,1,NULL,'12 MAR 1851','','',NULL,1,NULL),(2,4,NULL,NULL,'45 ZZZ 99999','','',NULL,3,NULL);
INSERT INTO Taches VALUES (1,'2027-03-01 00:00:00','Chercher le mariage DURAND','',3,0);
INSERT INTO LiensTachesIndis VALUES (1,1);`;

/** Petit paquet MacFamilyTree (base Core Data réduite au nécessaire) */
const MFT_SQL = (mediaPath = '') => `
CREATE TABLE Z_PRIMARYKEY (Z_ENT INTEGER PRIMARY KEY, Z_NAME VARCHAR);
INSERT INTO Z_PRIMARYKEY VALUES (15,'Person'),(14,'Family'),(25,'PersonEvent'),(24,'FamilyEvent'),(28,'Place'),(19,'MediaPicture'),(6,'Note'),(53,'ConclusionPersonEventType'),(52,'ConclusionFamilyEventType');
CREATE TABLE ZBASEOBJECT (Z_PK INTEGER PRIMARY KEY, Z_ENT INTEGER, ZFIRSTNAME VARCHAR, ZLASTNAME VARCHAR, ZGENDER INTEGER, ZMAN INTEGER, ZWOMAN INTEGER,
  ZCONCLUSIONTYPE INTEGER, ZCONCLUSIONTYPE1 INTEGER, ZPERSON1 INTEGER, ZFAMILY INTEGER, ZDATE2 VARCHAR, ZASSIGNEDPLACE INTEGER, ZPLACE VARCHAR, ZCOUNTY VARCHAR, ZSTATE VARCHAR, ZCOUNTRY VARCHAR,
  ZTITLE VARCHAR, ZPICTUREFILEIDENTIFIER VARCHAR, ZTHUMBNAILFILEIDENTIFIER VARCHAR, Z7_OBJECT INTEGER, ZTEXT VARCHAR, ZUSERDESCRIPTION VARCHAR, ZDATE VARCHAR);
INSERT INTO ZBASEOBJECT (Z_PK,Z_ENT,ZFIRSTNAME,ZLASTNAME,ZGENDER) VALUES (1,15,'Antoine','MAZAUD',0),(2,15,'Marie','DURAND',1),(3,15,'Léon','MAZAUD',0);
INSERT INTO ZBASEOBJECT (Z_PK,Z_ENT,ZMAN,ZWOMAN) VALUES (10,14,1,2);
INSERT INTO ZBASEOBJECT (Z_PK,Z_ENT,ZCONCLUSIONTYPE1,ZPERSON1,ZDATE2) VALUES (20,25,40,1,'12.03.1850'),(21,25,40,3,'n''importe quoi');
INSERT INTO ZBASEOBJECT (Z_PK,Z_ENT,ZTITLE,ZPICTUREFILEIDENTIFIER) VALUES (30,19,'Portrait','${mediaPath.replace(/'/g, "''")}');
CREATE TABLE ZADDITIONALNAME (Z_PK INTEGER PRIMARY KEY, ZPERSON INTEGER, ZFIRSTNAME VARCHAR, ZLASTNAME VARCHAR);
CREATE TABLE ZCHILDRELATION (Z_PK INTEGER PRIMARY KEY, ZFAMILY INTEGER, ZCHILD INTEGER, ZRELATIONTYPETOMANINFAMILY INTEGER, ZRELATIONTYPETOWOMANINFAMILY INTEGER, ZCUSTOMORDER FLOAT);
INSERT INTO ZCHILDRELATION VALUES (1,10,3,0,0,0);
CREATE TABLE ZCONCLUSIONTYPE (Z_PK INTEGER PRIMARY KEY, Z_ENT INTEGER, ZIDENTIFIER VARCHAR, ZTYPENAME VARCHAR, ZGEDCOMTAG VARCHAR, ZISUSERCREATED INTEGER, ZISENABLED INTEGER);
INSERT INTO ZCONCLUSIONTYPE VALUES (40,53,'Birth','Naissance','BIRT',0,1);
CREATE TABLE ZCOORDINATE (Z_PK INTEGER PRIMARY KEY, ZLATITUDE FLOAT, ZLONGITUDE FLOAT);
CREATE TABLE ZMEDIARELATION (Z_PK INTEGER PRIMARY KEY, ZBASEMEDIA INTEGER, ZMEDIACONTAINER INTEGER, Z8_MEDIACONTAINER INTEGER);
INSERT INTO ZMEDIARELATION VALUES (1,30,1,15);`;

const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });

/** Ce qui compte dans la base : comparé avant / après un refus, un import puis « ↶ Annuler ». */
const TABLES = ['persons', 'families', 'family_children', 'events', 'event_witnesses', 'name_variants', 'places', 'sources', 'source_links', 'notes', 'media', 'media_links',
    'labels', 'label_links', 'event_types', 'surname_groups', 'standalone_reminders', 'saved_views', 'dna_matches', 'dna_groups', 'custom_lists', 'archive_digests', 'archive_digest_entries'];
function snapshot() {
    const have = new Set(sql("SELECT name FROM sqlite_master WHERE type='table'").map(r => r.name));
    const out = {};
    for (const t of TABLES) if (have.has(t)) { const n = one(`SELECT count(*) n FROM "${t}"`).n; if (n) out[t] = n; } // table vide ou pas encore créée : pareil
    out._persons = sql("SELECT first_name||' '||last_name n FROM persons ORDER BY id").map(r => r.n).join('|');
    out._media_files = fs.readdirSync(path.join(dir, 'media')).filter(f => !f.startsWith('.')).sort().join('|');
    return out;
}
/** Aucun fichier piège écrit hors de l'archive, aucun « secret » copié. */
function assertNothingEscaped(label) {
    const seen = [];
    const walk = (d, depth) => { let list = []; try { list = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; } for (const e of list) { const p = path.join(d, e.name); if (/evil-zipslip|piege-sorti/i.test(e.name)) seen.push(p); if (e.isDirectory() && !e.isSymbolicLink() && depth < 6 && p !== SECRET_DIR) walk(p, depth + 1); } };
    walk(tmp, 0);
    for (const d of [path.dirname(tmp), os.tmpdir(), '/tmp']) { try { for (const f of fs.readdirSync(d)) if (/evil-zipslip|piege-sorti/i.test(f)) seen.push(path.join(d, f)); } catch (_) {} } // un cran au-dessus : rien n'est sorti
    assert.deepEqual(seen, [], label + ' : un fichier est sorti de l’archive');
    for (const f of fs.readdirSync(path.join(dir, 'media'))) {
        const p = path.join(dir, 'media', f);
        if (fs.statSync(p).isFile()) assert.ok(!fs.readFileSync(p).includes(SECRET_TEXT), label + ' : un fichier de l’ordinateur a été copié dans les médias (' + f + ')');
    }
}
/** Un refus : une phrase claire en JSON, jamais une erreur interne de PHP ni de la base, rien d'écrit. */
const INTERNAL = /n’a pas pu se faire \(une donnée reçue|erreur de la base|SQLSTATE|Fatal error|Warning:|Uncaught|Stack trace|on line \d+|\.php:\d+|TypeError|ValueError|Undefined (array key|index|variable)/i;
function assertRefused(res, label, statuses = [400, 401, 409, 413, 415, 422]) {
    assert.ok(res.body && typeof res.body.error === 'string' && res.body.error.length > 5, label + ' : pas de phrase d’erreur (' + res.status + ' ' + JSON.stringify(res.body).slice(0, 300) + ')');
    assert.ok(!INTERNAL.test(res.body.error), label + ' : erreur interne montrée : ' + res.body.error.slice(0, 300));
    assert.ok(statuses.includes(res.status), label + ' : statut ' + res.status + ' (' + res.body.error.slice(0, 200) + ')');
}

(async () => {
    {
        const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; db(); echo 'ok';`], { cwd: appRoot, encoding: 'utf8', env: envFor(dir) });
        if (r.status !== 0 || !/ok$/.test(r.stdout)) { console.error(r.stderr || r.stdout); process.exit(1); }
    }
    const port = await freePort();
    const base = `http://127.0.0.1:${port}/`;
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-d', 'upload_max_filesize=512M', '-d', 'post_max_size=512M', '-d', 'memory_limit=1G', '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env: { ...envFor(dir), PHP_CLI_SERVER_WORKERS: '4' }, stdio: ['ignore', 'ignore', 'pipe'] });
    let phpLog = ''; proc.stderr.on('data', d => { phpLog += d; });
    try {
        for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
        let cookie = '';
        const html = await (await fetch(base).then(r => { cookie = (r.headers.get('set-cookie') || '').split(';')[0]; return r; })).text();
        const csrf = JSON.parse(html.match(/window\.INSTALL_CSRF = ("[^"]*")/)[1]);
        const parse = async r => { const t = await r.text(); try { return JSON.parse(t); } catch (_) { return { _raw: t.slice(0, 500) }; } };
        const post = async (action, body, extraHeaders = {}) => { const r = await fetch(`${base}api.php?action=${action}`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf, ...extraHeaders }, body: JSON.stringify({ ...body, csrf }) }); return { status: r.status, body: await parse(r) }; };
        const upload = async (action, buf, name, fields = {}) => { const fd = new FormData(); fd.append('file', new Blob([buf]), name); fd.append('csrf', csrf); for (const [k, v] of Object.entries(fields)) fd.append(k, v); const r = await fetch(`${base}api.php?action=${action}`, { method: 'POST', headers: { Cookie: cookie, 'X-CSRF-Token': csrf }, body: fd }); return { status: r.status, body: await parse(r) }; };
        const undo = async t => { const u = await post('import_undo', { token: t }); assert.equal(u.status, 200, JSON.stringify(u.body)); return u.body; };

        // ── 0. une base de départ (fichier Gramps valide) ──
        let start;
        await step('départ : un petit fichier Gramps valide (gzippé) s’importe, aperçu puis import', async () => {
            const p = await upload('import_preview', gz(GRAMPS_XML()), 'famille-mazaud.gramps');
            assert.equal(p.status, 200, JSON.stringify(p.body));
            assert.equal(p.body.persons, 3);
            const r = await post('import_pending', { token: p.body.token });
            assert.equal(r.status, 200, JSON.stringify(r.body));
            assert.equal(r.body.stats.persons, 3);
            assert.equal(one("SELECT count(*) n FROM persons WHERE last_name='MAZAUD'").n, 2);
            start = snapshot();
        });

        // ── 1. fichiers absurdes, toutes portes d'arbre ──
        const zipJunk = makeZip([['readme.txt', 'rien à voir']]);
        const truncatedZip = makeZip([['arbre.ged', '0 HEAD\n1 CHAR UTF-8\n0 @I1@ INDI\n1 NAME Jean /MAZAUD/\n0 TRLR\n'.repeat(50)], ['photo.jpg', JPG]]).subarray(0, 300);
        const junk = {
            vide: Buffer.alloc(0),
            hasard: RANDOM,
            jpg: JPG,
            zip: zipJunk,
            zipcoupe: truncatedZip,
            utf16: utf16('0 HEAD\n1 CHAR UNICODE\n0 @I1@ INDI\n1 NAME Jean /MAZAUD/\n0 TRLR\n'),
            sqlite_vide: sqliteFile(path.join(work, 'vide.sqlite'), 'CREATE TABLE t(x);'),
            nul: Buffer.alloc(2048, 0),
        };
        const exts = ['gramps', 'gpkg', 'zip', 'gdz', 'heredis', 'mftpkg', 'rmtree', 'rmgc', 'gw', 'gedx', 'ftm'];
        await step('fichiers absurdes (vide, hasard, JPG ou ZIP renommés, archive coupée, UTF-16, zéros) : refusés clairement, rien n’entre', async () => {
            const bad = [];
            for (const ext of exts) {
                for (const [kind, buf] of Object.entries(junk)) {
                    for (const action of ['import_preview', 'import_package']) {
                        const r = await upload(action, buf, `essai-${kind}.${ext}`);
                        try { assertRefused(r, `${action} ${kind}.${ext}`, action === 'import_package' ? [400, 409, 413, 415, 422, 500] : undefined); } catch (e) { bad.push(e.message); }
                    }
                }
            }
            assert.ok(!bad.length, bad.length + ' cas :\n        ' + bad.join('\n        '));
            assert.deepEqual(snapshot(), start, 'la base n’a pas bougé');
        });
        await step('.json et .xml qui ne sont pas du GEDCOM-X, GEDCOM-X abîmé : refusés clairement', async () => {
            const bad = [];
            const cases = [['n.json', '{"persons": [ {"id": '], ['n.json', '{"bonjour": 1}'], ['n.json', utf16('{"persons":[],"relationships":[]}')], ['n.json', '[' .repeat(100000)],
                ['n.xml', '<gedcomx xmlns="http://gedcomx.org/v1/"><person id="P1"><name>'], ['n.xml', '<html><body>pas un arbre</body></html>'],
                ['n.json', JSON.stringify({ persons: 'pas une liste', relationships: 12, description: 'gedcomx.org' })],
                ['n.json', JSON.stringify({ persons: [{ id: 'P1', names: 'MAZAUD', facts: [{ type: 7, date: { original: [] } }] }, null, 42, 'x'], relationships: [{ type: 'http://gedcomx.org/Couple', person1: { resource: '#P1' }, person2: { resource: '#P9' } }, 'y'] })]];
            for (const [name, body] of cases) for (const action of ['import_preview', 'import_package']) {
                const r = await upload(action, Buffer.isBuffer(body) ? body : Buffer.from(body), name);
                if (r.status === 200) { if (r.body.undo) await undo(r.body.undo); continue; } // un GEDCOM-X étrange mais lisible : accepté
                try { assertRefused(r, `${action} ${name} ${String(body).slice(0, 30)}`, action === 'import_package' ? [400, 409, 413, 415, 422, 500] : undefined); } catch (e) { bad.push(e.message); }
            }
            assert.ok(!bad.length, bad.length + ' cas :\n        ' + bad.join('\n        '));
            assert.deepEqual(snapshot(), start);
        });


        // ── 2. pièges ──
        const bigZeros = 60 * 1048576; // > 50 Mo, rapport > 100 : « bombe »
        await step('bombe zip (60 Mo de zéros dans quelques Ko) : refusée dès l’aperçu et à l’import, en .zip, .gdz, .mftpkg et .heredis zippé', async () => {
            const bomb = makeZip([['arbre.ged', { zeros: bigZeros }], ['Famille.mftpkg/database', { zeros: 1024 }]]);
            assert.ok(bomb.length < 1048576, 'la bombe est petite (' + bomb.length + ')');
            const bad = [];
            for (const name of ['bombe.zip', 'bombe.gdz', 'bombe.mftpkg']) for (const action of ['import_preview', 'import_package']) {
                const r = await upload(action, bomb, name);
                try { assertRefused(r, action + ' ' + name, [409, 413, 422, 500]); assert.match(r.body.error, /anormal|trop gros|place libre/i, name + ' : ' + r.body.error); } catch (e) { bad.push(e.message); }
            }
            const hbomb = makeZip([['Essai.hmw/Essai.heredis', { zeros: bigZeros }]]);
            const r = await upload('import_package', hbomb, 'hbombe.zip');
            try { assertRefused(r, 'heredis zippé', [409, 413, 422, 500]); } catch (e) { bad.push(e.message); }
            assert.ok(!bad.length, bad.join('\n        '));
            assert.deepEqual(snapshot(), start);
            assert.deepEqual(fs.readdirSync(sysTmp).filter(f => /^(gedzip|mftpkg|heredis|gramps)_/.test(f)), [], 'aucun dossier temporaire laissé');
        });
        await step('bombe gzip dans un .gramps (420 Mo d’espaces) et dans un .gpkg : refusée sans tout ouvrir', async () => {
            const xmlBomb = gz(Buffer.alloc(420 * 1048576, 0x20)); // plus que les 400 Mo permis
            assert.ok(xmlBomb.length < 2 * 1048576);
            for (const action of ['import_preview', 'import_package']) {
                const r = await upload(action, xmlBomb, 'bombe.gramps');
                assertRefused(r, action + ' .gramps', [413, 422, 500]);
                assert.match(r.body.error, /anormalement gros|trop gros/i);
            }
            const tarBomb = gz(makeTar([['data.gramps', Buffer.alloc(120 * 1048576, 0x20)]]));
            const r = await upload('import_preview', tarBomb, 'bombe.gpkg');
            assertRefused(r, '.gpkg', [413, 422]);
            assert.deepEqual(snapshot(), start);
        });
        await step('chemins « ../ », absolus ou « C:\\ » dans une archive : refusés, rien n’est écrit hors de l’archive', async () => {
            const ged = '0 HEAD\n1 CHAR UTF-8\n0 @I1@ INDI\n1 NAME Paul /DURAND/\n1 OBJE\n2 FILE ../../../evil-zipslip.jpg\n0 TRLR\n';
            const bad = [];
            for (const evil of ['../../../../evil-zipslip.txt', '/tmp/evil-zipslip-abs.txt', 'C:/evil-zipslip-win.txt', 'media/../../evil-zipslip2.txt', '..\\..\\evil-zipslip3.txt']) {
                const z = makeZip([['arbre.ged', ged], [evil, 'piège']]);
                for (const [name, action] of [['slip.zip', 'import_preview'], ['slip.zip', 'import_package'], ['slip.gdz', 'import_package'], ['slip.mftpkg', 'import_package']]) {
                    const r = await upload(action, z, name);
                    if (r.status === 200) { bad.push(action + ' ' + name + ' ' + evil + ' : accepté'); if (r.body.undo) await undo(r.body.undo); continue; }
                    try { assertRefused(r, action + ' ' + evil, [409, 422, 500]); } catch (e) { bad.push(e.message); }
                }
            }
            assert.ok(!bad.length, bad.join('\n        '));
            assertNothingEscaped('zip');
            assert.ok(!fs.existsSync('/tmp/evil-zipslip-abs.txt'), 'chemin absolu écrit');
            assert.deepEqual(snapshot(), start);
        });
        await step('.gpkg : « ../ », chemin absolu et lien symbolique dans le tar : jamais suivis ni écrits dehors', async () => {
            const xml = GRAMPS_XML([['I1', 'Henri', 'LACOMBE', 'M'], ['I2', 'Berthe', 'MAZAUD', 'F'], ['I3', 'Jules', 'LACOMBE', 'M']],
                `\n  <objects><object handle="_o1" id="O1"><file src="photos/lien.jpg" mime="image/jpeg" description="lien"/></object><object handle="_o2" id="O2"><file src="../../../evil-zipslip.jpg" mime="image/jpeg" description="sortie"/></object><object handle="_o3" id="O3"><file src="${path.join(SECRET_DIR, 'id_rsa.jpg')}" mime="image/jpeg" description="absolu"/></object></objects>`);
            const tar = gz(makeTar([['data.gramps', gz(xml)], ['../../evil-zipslip.jpg', JPG], ['/tmp/evil-zipslip-gpkg.jpg', JPG], ['photos/lien.jpg', '', '2', path.join(SECRET_DIR, 'id_rsa.jpg')]]));
            const p = await upload('import_preview', tar, 'paquet.gpkg');
            if (p.status === 200) {
                const r = await post('import_pending', { token: p.body.token });
                assert.equal(r.status, 200, JSON.stringify(r.body));
                assertNothingEscaped('gpkg');
                await undo(r.body.undo);
            } else assertRefused(p, 'gpkg piégé');
            assertNothingEscaped('gpkg');
            assert.ok(!fs.existsSync('/tmp/evil-zipslip-gpkg.jpg'));
            assert.deepEqual(snapshot(), start);
        });
        await step('lien symbolique dans un GedZip (photo → fichier secret de l’ordinateur) : le secret n’est jamais copié', async () => {
            const ged = '0 HEAD\n1 CHAR UTF-8\n0 @I1@ INDI\n1 NAME Paul /DURAND/\n1 OBJE\n2 FILE media/lien.jpg\n2 FORM jpg\n0 TRLR\n';
            const z = makeZip([['arbre.ged', ged], ['media/lien.jpg', path.join(SECRET_DIR, 'id_rsa.jpg'), { link: true }]]);
            const r = await upload('import_package', z, 'liens.zip');
            if (r.status === 200) { assertNothingEscaped('gedzip lien'); await undo(r.body.undo); } else assertRefused(r, 'gedzip lien', [422, 500]);
            assertNothingEscaped('gedzip lien');
            assert.deepEqual(snapshot(), start);
        });
        await step('XML à ENTITY (XXE vers un fichier secret, « billion laughs ») : refusé en Gramps et GEDCOM-X', async () => {
            const xxe = `<?xml version="1.0"?>\n<!DOCTYPE database [<!ENTITY x SYSTEM "file://${path.join(SECRET_DIR, 'motdepasse.txt')}">]>\n<database xmlns="http://gramps-project.org/xml/1.7.1/"><people><person handle="_a" id="I1"><gender>M</gender><name><first>&x;</first><surname>MAZAUD</surname></name></person></people></database>`;
            const lol = `<?xml version="1.0"?>\n<!DOCTYPE lolz [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;"><!ENTITY lol3 "&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;"><!ENTITY lol4 "&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;"><!ENTITY lol5 "&lol4;&lol4;&lol4;&lol4;&lol4;&lol4;&lol4;&lol4;&lol4;&lol4;"><!ENTITY lol6 "&lol5;&lol5;&lol5;&lol5;&lol5;&lol5;&lol5;&lol5;&lol5;&lol5;"><!ENTITY lol7 "&lol6;&lol6;&lol6;&lol6;&lol6;&lol6;&lol6;&lol6;&lol6;&lol6;"><!ENTITY lol8 "&lol7;&lol7;&lol7;&lol7;&lol7;&lol7;&lol7;&lol7;&lol7;&lol7;"><!ENTITY lol9 "&lol8;&lol8;&lol8;&lol8;&lol8;&lol8;&lol8;&lol8;&lol8;&lol8;">]>\n`;
            const cases = [['xxe.gramps', xxe], ['xxe-gz.gramps', gz(xxe)], ['lol.gramps', lol + '<database xmlns="http://gramps-project.org/xml/1.7.1/"><people><person handle="_a" id="I1"><name><first>&lol9;</first></name></person></people></database>'],
                ['xxe.xml', xxe.replace(/database/g, 'gedcomx').replace('http://gramps-project.org/xml/1.7.1/', 'http://gedcomx.org/v1/')], ['lol.xml', lol + '<gedcomx xmlns="http://gedcomx.org/v1/"><person id="P1"><name><nameForm><fullText>&lol9;</fullText></nameForm></name></person></gedcomx>'],
                // entité cachée en UTF-16 (le motif « <!ENTITY » n'apparaît pas tel quel)
                ['xxe16.gramps', utf16(xxe.replace('<?xml version="1.0"?>', '<?xml version="1.0" encoding="UTF-16"?>'))], ['xxe16.xml', utf16(xxe.replace(/database/g, 'gedcomx').replace('<?xml version="1.0"?>', '<?xml version="1.0" encoding="UTF-16"?>'))]];
            const bad = [];
            for (const [name, body] of cases) for (const action of ['import_preview', 'import_package']) {
                const r = await upload(action, Buffer.isBuffer(body) ? body : Buffer.from(body), name);
                if (r.status === 200) { bad.push(action + ' ' + name + ' accepté'); if (r.body.undo) await undo(r.body.undo); continue; }
                try { assertRefused(r, action + ' ' + name, [422, 500]); } catch (e) { bad.push(e.message); }
                if (JSON.stringify(r.body).includes(SECRET_TEXT)) bad.push(name + ' : le secret est sorti dans la réponse');
            }
            assert.ok(!bad.length, bad.join('\n        '));
            assert.ok(!JSON.stringify(sql('SELECT first_name, last_name FROM persons')).includes(SECRET_TEXT));
            assert.deepEqual(snapshot(), start);
        });
        await step('MacFamilyTree : un média « ../../ » ou absolu ne copie jamais un fichier de l’ordinateur', async () => {
            const db = sqliteFile(path.join(work, 'database'), MFT_SQL('../../../../../../../../../../../..' + path.join(SECRET_DIR, 'id_rsa.jpg')));
            const z = makeZip([['Famille.mftpkg/database', db], ['Famille.mftpkg/resources/autre.jpg', JPG]]);
            const r = await upload('import_package', z, 'famille.mftpkg');
            assert.equal(r.status, 200, JSON.stringify(r.body));
            assert.equal(r.body.stats.persons, 3);
            assertNothingEscaped('mftpkg');
            await undo(r.body.undo);
            const db2 = sqliteFile(path.join(work, 'database'), MFT_SQL(path.join(SECRET_DIR, 'releve-banque.pdf')));
            const r2 = await upload('import_package', makeZip([['Famille.mftpkg/database', db2]]), 'famille.mftpkg');
            assert.equal(r2.status, 200, JSON.stringify(r2.body));
            assertNothingEscaped('mftpkg absolu');
            await undo(r2.body.undo);
        });
        await step('Hérédis envoyé : le chemin d’origine d’un média (FilePath) ne copie jamais un fichier de l’ordinateur', async () => {
            const h = sqliteFile(path.join(work, 'piege.heredis'), HEREDIS_OK + `\nINSERT INTO Medias VALUES (1,'${path.join(SECRET_DIR, 'id_rsa.jpg')}','portrait.jpg','',NULL),(2,'${path.join(SECRET_DIR, 'releve-banque.pdf')}','banque.pdf','',NULL);\nINSERT INTO LiensMediaIndividu VALUES (1,1,0,1,1);`);
            const r = await upload('import_package', h, 'piege.heredis');
            assert.equal(r.status, 200, JSON.stringify(r.body));
            assert.equal(r.body.stats.media_missing, 2, 'les deux médias sont « manquants »');
            assertNothingEscaped('heredis');
            await undo(r.body.undo);
            const z = makeZip([['Essai.hmw/Essai.heredis', h], ['Essai.hmw/Media/#1/portrait.jpg', JPG]]);
            const r2 = await upload('import_package', z, 'essai-hmw.zip');
            assert.equal(r2.status, 200, JSON.stringify(r2.body));
            assert.deepEqual([r2.body.stats.media, r2.body.stats.media_missing], [2, 1], 'la photo rangée dans le paquet est reprise, pas celle de l’ordinateur');
            assertNothingEscaped('heredis zippé');
            await undo(r2.body.undo);
            assert.deepEqual(snapshot(), start);
        });


        // ── 3. contenus absurdes mais lisibles, fichiers valides, ↶ Annuler exact ──
        const GW = `encoding: utf-8
gwplus

fam MAZAUD Pierre 31/2/1850 #bp Ussac,_19 + #nm LACOMBE Jeanne 0/13/99999
beg
- h Louis 12/3/1880
- f Rose ~1882
end

fam MAZAUD Louis + DURAND Marie
beg
- h Pierre
end

fam DURAND Marie + MAZAUD Louis
beg
- f Jeanne 1/1/2500
end

notes MAZAUD Pierre
beg
Meunier à Ussac.
end notes
`;
        const GX = {
            persons: [
                { id: 'P1', gender: { type: 'http://gedcomx.org/Male' }, names: [{ nameForms: [{ fullText: 'Jean MAZAUD', parts: [{ type: 'http://gedcomx.org/Given', value: 'Jean' }, { type: 'http://gedcomx.org/Surname', value: 'MAZAUD' }] }] }], facts: [{ type: 'http://gedcomx.org/Birth', date: { original: '30 février 1850', formal: '+1850-02-30' } }, { type: 'http://gedcomx.org/Death', date: { formal: 'nonsense' } }] },
                { id: 'P1', names: [{ nameForms: [{ fullText: 'Doublon DURAND' }] }] }, // identifiant en double
                { id: 'P2', gender: { type: 'http://gedcomx.org/Female' }, names: [{ nameForms: [{ fullText: 'Anne LACOMBE' }] }] },
            ],
            relationships: [
                { type: 'http://gedcomx.org/Couple', person1: { resource: '#P1' }, person2: { resource: '#P2' } },
                { type: 'http://gedcomx.org/ParentChild', person1: { resource: '#P1' }, person2: { resource: '#P2' } },
                { type: 'http://gedcomx.org/ParentChild', person1: { resource: '#P2' }, person2: { resource: '#P1' } }, // circulaire
                { type: 'http://gedcomx.org/ParentChild', person1: { resource: '#P404' }, person2: { resource: '#P1' } }, // personne absente
                { type: 'http://gedcomx.org/ParentChild', person1: { resource: '#P1' }, person2: { resource: '#P1' } }, // son propre parent
            ],
            description: 'http://gedcomx.org/',
        };
        const valid = () => [
            ['gramps-plat.gramps', Buffer.from(GRAMPS_XML([['I1', 'Pierre', 'DURAND', 'M'], ['I2', 'Rose', 'LACOMBE', 'F'], ['I3', 'Paul', 'DURAND', 'M']]))],
            ['gramps-doublons.gramps', gz(GRAMPS_XML([['I1', 'Pierre', 'DURAND', 'M'], ['I1', 'Pierre', 'DURAND', 'M'], ['I3', 'Paul', 'DURAND', 'X']]).replace('<childref hlink="_I3"/>', '<childref hlink="_I3"/><childref hlink="_absent"/><childref hlink="_I1"/>'))],
            ['paquet.gpkg', gz(makeTar([['data.gramps', gz(GRAMPS_XML([['I1', 'Henri', 'LACOMBE', 'M'], ['I2', 'Berthe', 'MAZAUD', 'F'], ['I3', 'Jules', 'LACOMBE', 'M']], '\n  <objects><object handle="_o1" id="O1"><file src="photos/portrait.png" mime="image/png" description="Portrait"/></object></objects>'))], ['photos/portrait.png', PNG]]))],
            ['famille.gw', Buffer.from(GW)],
            ['famille-1252.gw', win1252(GW.replace('encoding: utf-8\n', '').replace('Meunier à Ussac.', 'Meunier à Ussac, marié à l’église.'.replace('’', "'")))],
            ['famille.json', Buffer.from(JSON.stringify(GX))],
            ['famille-bom.json', Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(JSON.stringify(GX))])],
            ['famille.heredis', sqliteFile(path.join(work, 'ok.heredis'), HEREDIS_OK)],
            ['famille.mftpkg', makeZip([['Famille.mftpkg/database', sqliteFile(path.join(work, 'database'), MFT_SQL('photos/portrait.png'))], ['Famille.mftpkg/resources/photos/portrait.png', PNG]])],
            ['famille.rmtree', fs.readFileSync(path.join(__dirname, 'fixtures', 'autres-logiciels', 'famille-rootsmagic.rmtree'))],
        ];
        await step('fichiers valides mais absurdes (dates impossibles, famille circulaire, identifiants en double, références manquantes) : importés sans erreur, puis « ↶ Annuler » remet la base exactement', async () => {
            const bad = [];
            for (const [name, buf] of valid()) {
                const before = snapshot();
                const p = await upload('import_preview', buf, name);
                if (p.status !== 200) { bad.push(name + ' aperçu : ' + p.status + ' ' + JSON.stringify(p.body).slice(0, 250)); continue; }
                const r = await post('import_pending', { token: p.body.token });
                if (r.status !== 200) { bad.push(name + ' import : ' + r.status + ' ' + JSON.stringify(r.body).slice(0, 250)); continue; }
                const st = r.body.stats || {};
                if (!((st.persons ?? st.personnes ?? 0) >= 2)) bad.push(name + ' : personnes ' + JSON.stringify(st).slice(0, 200));
                const self = one('SELECT count(*) n FROM family_children fc JOIN families f ON f.id=fc.family_id WHERE fc.child_id IN (f.partner1_id, f.partner2_id)').n;
                if (self) bad.push(name + ' : une personne est devenue son propre enfant');
                await undo(r.body.undo);
                try { assert.deepEqual(snapshot(), before); } catch (e) { bad.push(name + ' : ↶ Annuler ne remet pas la base comme avant\n' + e.message.split('\n').filter(l => /^[+-]/.test(l.trim())).join(' ')); }
                const again = await post('import_undo', { token: r.body.undo });
                if (again.status !== 422) bad.push(name + ' : second « ↶ Annuler » ' + again.status);
            }
            assert.ok(!bad.length, bad.join('\n        '));
            assert.deepEqual(snapshot(), start);
        });
        await step('même fichier importé deux fois : deux imports distincts, chacun s’annule à part', async () => {
            const buf = gz(GRAMPS_XML([['I1', 'Gaston', 'DURAND', 'M'], ['I2', 'Lucie', 'MAZAUD', 'F'], ['I3', 'Marcel', 'DURAND', 'M']]));
            const a = await upload('import_package', buf, 'deux-fois.gramps');
            const b = await upload('import_package', buf, 'deux-fois.gramps');
            assert.equal(a.status, 200, JSON.stringify(a.body)); assert.equal(b.status, 200, JSON.stringify(b.body));
            assert.equal(one("SELECT count(*) n FROM persons WHERE first_name='Gaston'").n, 2);
            const mid = snapshot();
            await undo(b.body.undo);
            assert.equal(one("SELECT count(*) n FROM persons WHERE first_name='Gaston'").n, 1);
            await undo(a.body.undo);
            assert.deepEqual(snapshot(), start);
            assert.ok(mid.persons === start.persons + 6);
        });
        await step('deux imports lancés en même temps (double clic) : les deux passent, et chaque « ↶ Annuler » ne retire que les siens', async () => {
            const mk = (n) => gz(GRAMPS_XML(Array.from({ length: 300 }, (_, i) => [`I${i + 1}`, `Prénom${i}`, n, i % 2 ? 'F' : 'M'])));
            const [a, b, c] = await Promise.all([upload('import_package', mk('MAZAUD'), 'double-a.gramps'), upload('import_package', mk('LACOMBE'), 'double-b.gramps'), upload('import_package', mk('DURAND'), 'double-c.gramps')]);
            for (const r of [a, b, c]) assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 300));
            assert.equal(one("SELECT count(*) n FROM persons").n, start.persons + 900);
            await undo(b.body.undo);
            assert.equal(one("SELECT count(*) n FROM persons WHERE last_name='MAZAUD' AND first_name LIKE 'Prénom%'").n, 300, 'le premier import est intact');
            assert.equal(one("SELECT count(*) n FROM persons WHERE last_name='DURAND' AND first_name LIKE 'Prénom%'").n, 300, 'le troisième import est intact');
            assert.equal(one("SELECT count(*) n FROM persons WHERE last_name='LACOMBE' AND first_name LIKE 'Prénom%'").n, 0);
            await undo(a.body.undo); await undo(c.body.undo);
            // annulés dans le désordre : un groupe de noms créé par l'un et repris par l'autre peut rester (vide, sans effet)
            const { surname_groups: _g1, ...now } = snapshot(); const { surname_groups: _g2, ...was } = start;
            assert.deepEqual(now, was);
        });
        await step('deux aperçus puis deux « Importer » du même jeton : le second est refusé proprement', async () => {
            const p = await upload('import_preview', gz(GRAMPS_XML()), 'jeton.gramps');
            const [r1, r2] = await Promise.all([post('import_pending', { token: p.body.token }), post('import_pending', { token: p.body.token })]);
            const okOnes = [r1, r2].filter(r => r.status === 200);
            assert.equal(okOnes.length, 1, 'un seul import : ' + JSON.stringify([r1.status, r1.body, r2.status, r2.body]).slice(0, 400));
            for (const r of [r1, r2]) if (r.status !== 200) assertRefused(r, 'second jeton', [409, 422]);
            await undo(okOnes[0].body.undo);
            assert.deepEqual(snapshot(), start);
            for (const t of ['../../etc/passwd', 'zz', 'a'.repeat(24), '0'.repeat(24)]) assertRefused(await post('import_pending', { token: t }), 'jeton ' + t, [422]);
        });


        await step('bases SQLite piégées (Hérédis, RootsMagic, MacFamilyTree) : tables présentes mais colonnes absentes, déclencheur, vue : phrase claire, rien n’entre', async () => {
            const bad = [];
            const heredisNoCols = sqliteFile(path.join(work, 'h1.heredis'), 'CREATE TABLE Individus(x); CREATE TABLE Unions(x); CREATE TABLE Evenements(x); CREATE TABLE Lieux(x); CREATE TABLE Notes(x); INSERT INTO Individus VALUES (1); INSERT INTO Notes VALUES (1);');
            const heredisTrig = sqliteFile(path.join(work, 'h2.heredis'), HEREDIS_OK.replace(/CREATE TABLE Medias[^\n]*\n/, '') + "\nCREATE TABLE journal(x); CREATE TRIGGER t AFTER INSERT ON Individus BEGIN INSERT INTO journal VALUES (1); END; CREATE VIEW Medias AS SELECT 1 AS CodeID, '/etc/passwd' AS FilePath, 'p.jpg' AS FileName, '' AS DateGed, NULL AS XrefNote;");
            const rmNoCols = sqliteFile(path.join(work, 'r1.rmtree'), 'CREATE TABLE PersonTable(x); CREATE TABLE NameTable(x); CREATE TABLE FamilyTable(x); CREATE TABLE EventTable(x); INSERT INTO PersonTable VALUES (1); INSERT INTO NameTable VALUES (1);');
            const mftNoCols = makeZip([['F.mftpkg/database', sqliteFile(path.join(work, 'database'), 'CREATE TABLE Z_PRIMARYKEY(x); CREATE TABLE ZBASEOBJECT(x); INSERT INTO ZBASEOBJECT VALUES (1);')]]);
            const mftJunk = makeZip([['F.mftpkg/database', RANDOM]]);
            for (const [name, buf, okAllowed] of [['h1.heredis', heredisNoCols], ['h2.heredis', heredisTrig, true], ['r1.rmtree', rmNoCols], ['r1.rmgc', rmNoCols], ['m1.mftpkg', mftNoCols], ['m2.mftpkg', mftJunk], ['m1.zip', mftNoCols], ['m2.zip', mftJunk]]) {
                for (const action of ['import_preview', 'import_package']) {
                    const r = await upload(action, buf, name);
                    if (r.status === 200 && okAllowed) { if (r.body.undo) await undo(r.body.undo); else if (r.body.token) await post('import_pending', { token: r.body.token }).then(x => x.body.undo && undo(x.body.undo)); continue; }
                    if (r.status === 200 && action === 'import_preview' && /mftpkg|zip/.test(name)) continue; // l'aperçu d'un paquet MacFamilyTree ne lit pas sa base
                    try { assertRefused(r, action + ' ' + name, [409, 422, 500]); } catch (e) { bad.push(e.message); }
                }
            }
            assert.ok(!bad.length, bad.join('\n        '));
            assertNothingEscaped('sqlite piégée');
            assert.deepEqual(snapshot(), start);
        });

        // ── 4. autres fichiers lus par l'app ──
        await step('décès INSEE : vide, hasard, UTF-16, guillemets non fermés, 10 000 colonnes, formules, bombe zip ; le même fichier deux fois', async () => {
            const n0 = one('SELECT count(*) n FROM insee_deces').n;
            for (const [name, buf] of [['vide.csv', Buffer.alloc(0)], ['hasard.csv', RANDOM], ['photo.csv', JPG],
                ['colonnes.csv', Buffer.from(Array.from({ length: 10000 }, (_, i) => 'c' + i).join(';') + '\n' + Array.from({ length: 10000 }, () => 'x').join(';') + '\n')], ['pas-csv.zip', zipJunk], ['coupe.zip', truncatedZip]]) {
                const r = await upload('insee_import', buf, name);
                assertRefused(r, 'INSEE ' + name, [409, 422]);
            }
            const bomb = makeZip([['deces-2020.txt', { zeros: bigZeros }]]);
            const rb = await upload('insee_import', bomb, 'deces-2020.zip');
            assertRefused(rb, 'INSEE bombe', [422]);
            assert.match(rb.body.error, /anormal/);
            const csv = 'nom;prenom;sexe;datenaiss;lieunaiss;commnaiss;paysnaiss;datedeces;lieudeces;commdeces;actedeces\n'
                + 'MAZAUD;"=cmd|\' /C calc\'!A0;1;19200101;19270;Ussac;;19900101;19270;Ussac;12\n'
                + 'LACOMBE;Rose;2;19251301;19270;Ussac;;19990231;19270;Ussac;13\n'
                + 'DURAND;"Jeanne;2;19300101;19270;Ussac;;20000101;19270;Ussac;14\n'
                + 'DURAND;Émile;1;19300101;19270;Ussac;;20000101;19270;Ussac;15\n';
            const r1 = await upload('insee_import', Buffer.from(csv), 'deces-essai.csv');
            assert.equal(r1.status, 200, JSON.stringify(r1.body));
            const r2 = await upload('insee_import', Buffer.from(csv), 'deces-renomme.csv');
            assert.equal(r2.status, 409, 'le même fichier, renommé : signalé'); assert.equal(r2.body.duplicate, true);
            const r3 = await upload('insee_import', win1252('nom;prenom;sexe;datenaiss;lieunaiss;commnaiss;paysnaiss;datedeces;lieudeces;commdeces;actedeces\nLACOMBE;Hélène;2;19200101;19270;Ussac;;19900101;19270;Ussac;16\n'), 'deces-1252.csv');
            assert.equal(r3.status, 200, JSON.stringify(r3.body));
            const r4 = await upload('insee_import', utf16('nom;prenom;sexe;datenaiss;lieunaiss;commnaiss;paysnaiss;datedeces;lieudeces;commdeces;actedeces\nLACOMBE;Noémie;2;19200101;19270;Ussac;;19900101;19270;Ussac;17\n'), 'deces-utf16.csv');
            assert.equal(r4.status, 200, JSON.stringify(r4.body));
            assert.equal(one("SELECT count(*) n FROM insee_deces WHERE prenom='Noémie' AND nom='LACOMBE'").n, 1, 'fichier « Texte Unicode » (UTF-16) relu');
            const s = await fetch(`${base}api.php?action=insee_search&nom=LACOMBE`, { headers: { Cookie: cookie } });
            assert.equal(s.status, 200, 'la recherche marche encore après un fichier en Windows-1252');
            const js = await s.json();
            assert.ok(JSON.stringify(js).includes('Hélène'), 'accents d’un fichier Windows-1252 relus : ' + JSON.stringify(js).slice(0, 300));
            assert.ok(one('SELECT count(*) n FROM insee_deces').n > n0);
        });
        await step('prénoms INSEE : vide, hasard, mauvaises colonnes, bombe zip refusés ; un vrai petit fichier lu', async () => {
            for (const [name, buf] of [['vide.csv', Buffer.alloc(0)], ['hasard.csv', RANDOM], ['colonnes.csv', Buffer.from('a;b;c\n1;2;3\n')], ['pas-csv.zip', zipJunk], ['bombe.zip', makeZip([['nat2022.csv', { zeros: bigZeros }]])]]) {
                assertRefused(await upload('insee_prenoms_import', buf, name), 'prénoms ' + name, [422]);
            }
            const ok = await upload('insee_prenoms_import', makeZip([['nat2022.csv', 'sexe;preusuel;annais;nombre\n1;PIERRE;1900;120\n2;"ROSE;1901;40\n2;=HYPERLINK("x");1902;3\n1;_PRENOMS_RARES;1903;9\n']]), 'nat2022.zip');
            assert.equal(ok.status, 200, JSON.stringify(ok.body));
            assert.ok(ok.body.rows >= 1);
        });
        await step('photos et documents envoyés (glisser-déposer) : vide, page web ou PHP renommés .jpg, hasard refusés ; une vraie photo acceptée', async () => {
            const pid = Number(one("SELECT id FROM persons WHERE first_name='Pierre'").id);
            const send = async (buf, name) => { const fd = new FormData(); fd.append('files[]', new Blob([buf]), name); fd.append('person_id', String(pid)); fd.append('csrf', csrf); const r = await fetch(base + 'upload.php', { method: 'POST', headers: { Cookie: cookie, 'X-CSRF-Token': csrf }, body: fd }); return { status: r.status, body: await parse(r) }; };
            for (const [name, buf] of [['vide.jpg', Buffer.alloc(0)], ['page.jpg', Buffer.from('<html><script>alert(1)</script></html>')], ['code.jpg', Buffer.from('<?php system($_GET["c"]); ?>')], ['hasard.png', RANDOM], ['image.svg', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')]]) {
                assertRefused(await send(buf, name), 'média ' + name, [422]);
            }
            const before = fs.readdirSync(path.join(dir, 'media')).length;
            const ok = await send(PNG, '../../evil-zipslip.png');
            assert.equal(ok.status, 200, JSON.stringify(ok.body));
            assert.equal(fs.readdirSync(path.join(dir, 'media')).length, before + 1);
            assertNothingEscaped('upload');
            const m = one('SELECT filename FROM media ORDER BY id DESC LIMIT 1');
            assert.match(m.filename, /^[0-9a-f]{32}\.png$/, 'nom choisi par l’app, jamais celui envoyé');
            exec(`DELETE FROM media_links WHERE media_id IN (SELECT id FROM media WHERE filename='${m.filename}'); DELETE FROM media WHERE filename='${m.filename}'`);
            fs.unlinkSync(path.join(dir, 'media', m.filename));
            assert.deepEqual(snapshot(), start);
        });
        await step('correspondances ADN : lignes absurdes, formules, fichier brut de SNP refusé ; import puis « ↶ Annuler » exact', async () => {
            const kit = await post('save_dna_kit', { label: 'Kit MAZAUD', company: 'Ancestry' });
            assert.equal(kit.status, 200, JSON.stringify(kit.body));
            const kitId = kit.body.result.id;
            const before = snapshot();
            assertRefused(await post('import_dna_matches', { kit_id: kitId, rows: Array.from({ length: 20 }, (_, i) => ({ name: 'rs' + (1000 + i), shared_cm: 1 })) }), 'ADN brut', [422]);
            assertRefused(await post('import_dna_matches', { kit_id: 999999, rows: [{ name: 'Paul DURAND' }] }), 'kit absent', [422, 500]);
            const weird = [{ name: 'Paul DURAND', shared_cm: '12,5 cM', segments: -4, longest_cm: 'beaucoup' }, { name: '=cmd|\' /C calc\'!A0', shared_cm: 1e308 }, { name: '' }, null, 'texte', 42,
                { name: 'Rose LACOMBE', shared_cm: 'NaN', data: { a: 'x'.repeat(5000) }, cluster: 'Grappe 1' }, { name: 'Paul DURAND', shared_cm: 30 }];
            assertRefused(await post('import_dna_matches', { kit_id: kitId, rows: [{ name: 'Paul DURAND' }, { name: { nested: true } }] }), 'ADN nom qui n’est pas un texte', [422]);
            assert.deepEqual(snapshot(), before, 'refusé en entier : rien n’entre');
            const r = await post('import_dna_matches', { kit_id: kitId, rows: weird });
            assert.equal(r.status, 200, JSON.stringify(r.body));
            const names = sql('SELECT name, shared_cm FROM dna_matches ORDER BY id');
            assert.ok(names.every(m => Number.isFinite(Number(m.shared_cm))), 'cM lisibles : ' + JSON.stringify(names));
            const u = await post('undo_dna_import', { token: r.body.result.undo });
            assert.equal(u.status, 200, JSON.stringify(u.body));
            assert.deepEqual(snapshot(), before);
            const r2 = await post('import_dna_matches', { kit_id: kitId, rows: 'pas une liste' });
            assert.equal(r2.status, 200); assert.equal(r2.body.result.added, 0);
            if (r2.body.result.undo) await post('undo_dna_import', { token: r2.body.result.undo });
            await post('delete_dna_kit', { id: kitId });
        });
        await step('liste LCNDA et bloc LCNDA importés : JSON abîmé, autre fichier, champs absurdes refusés ou nettoyés', async () => {
            for (const json of ['', '{', '[]', '{"type":"lcnda-liste"}', '{"type":"autre","definition":{}}', JSON.stringify({ type: 'lcnda-liste', definition: { rules: [{ field: 'event_type', values: [{ label: 'Inexistant' }] }] }, name: 'x' })]) {
                assertRefused(await post('import_my_list', { json }), 'liste ' + json.slice(0, 30), [422, 500]);
            }
            const okList = await post('import_my_list', { json: JSON.stringify({ type: 'lcnda-liste', name: '=cmd|liste'.repeat(30), icon: '📋', source: 'free', definition: { custom: [{ key: 'a', label: 'Nom', type: 'text' }], rules: 'x', columns: 7 }, rows: [{ a: 'MAZAUD' }, { a: ['x'] }, 'y', { a: 'z'.repeat(5000) }] }) });
            assert.ok([200, 422].includes(okList.status), JSON.stringify(okList.body));
            if (okList.status === 200) { assert.ok(!INTERNAL.test(JSON.stringify(okList.body))); exec('DELETE FROM custom_list_rows; DELETE FROM custom_lists'); }
            else assertRefused(okList, 'liste libre');
            for (const json of ['', '{', '{"format":"autre"}', JSON.stringify({ format: 'lcnda-block', name: '', fields: 'x' })]) {
                assertRefused(await post('import_custom_block_def', { json }), 'bloc ' + json.slice(0, 30), [422, 500]);
            }
            const blk = await post('import_custom_block_def', { json: JSON.stringify({ format: 'lcnda-block', uid: '../../x', name: 'Bloc MAZAUD', fields: [{ key: 'a', label: 'A', type: 'text' }, 'x', null, { key: '', type: 'bizarre' }], repeatable: 'oui', display: 'nimporte' }) });
            assert.ok([200, 422].includes(blk.status), JSON.stringify(blk.body));
            if (blk.status !== 200) assertRefused(blk, 'bloc');
            exec('DELETE FROM custom_block_defs');
            assert.deepEqual(snapshot(), start);
        });
        await step('relevés, tableau de personnes, RIS / BibTeX, KML / GeoJSON (lignes lues par le navigateur) : absurdes refusés, formules vidées, « ↶ Annuler » exact', async () => {
            const bad = [];
            const expectRefused = async (action, body, label) => { const r = await post(action, body); try { assertRefused(r, label, [422]); } catch (e) { bad.push(e.message); } };
            for (const acts of [null, 'x', [], [null, 1, 'a'], [{ type: 'Z', people: 'x' }], Array.from({ length: 20001 }, () => ({ date: '1850' }))]) await expectRefused('releves_check', { acts }, 'relevés ' + JSON.stringify(acts).slice(0, 30));
            for (const persons of [null, 'x', [], [{ k: 'zz', first: 'a' }], [{ k: 'r1' }], Array.from({ length: 10001 }, (_, i) => ({ k: 'r' + i, first: 'A' }))]) await expectRefused('people_table_check', { persons }, 'tableau ' + JSON.stringify(persons).slice(0, 30));
            for (const text of ['', 'n’importe quoi', '{', '<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><kml><Placemark><name>&e;</name><Point><coordinates>1,45</coordinates></Point></Placemark></kml>', '{"type":"FeatureCollection","features":[{"geometry":{"type":"Point","coordinates":[999,999]},"properties":{"name":"X"}}]}', '['.repeat(70) + ']'.repeat(70), utf16('{"type":"FeatureCollection","features":[]}').toString('latin1')]) await expectRefused('places_geo_analyse', { text }, 'géo ' + text.slice(0, 30));
            for (const text of ['', 'rien', '@article{', 'TY  - \nER  -']) await expectRefused('sources_refs_import', { text, mode: 'check' }, 'références ' + text.slice(0, 20));
            assert.ok(!bad.length, bad.join('\n        '));
            // tableau : formules vidées, famille circulaire, enfant qui est aussi parent, référence absente
            const persons = [{ k: 'r1', first: 'Albert', last: 'DURAND', sex: 'male', occupation: '=cmd|\' /C calc\'!A0', events: { BIRT: { date: '31/02/1850', place: '+SUM(A1)' } } },
                { k: 'r2', first: '@SUM(1)', last: 'LACOMBE', sex: 'female', note: '-2+3' }, { k: 'r3', first: 'Céleste', last: 'DURAND', sex: 'xx', events: { DEAT: { date: 'jamais' } } }];
            const families = [{ a: 'r1', b: 'r2', children: ['r3', 'r1', 'r404'] }, { a: 'r3', b: 'r3', children: ['r1'] }, { a: 'r3', b: null, children: ['r1'] }];
            const before = snapshot();
            const imp = await post('people_table_import', { persons, families, label: 'piège' });
            assert.equal(imp.status, 200, JSON.stringify(imp.body));
            const got = sql("SELECT first_name, last_name, occupation FROM persons WHERE last_name IN ('DURAND','LACOMBE') AND id > " + start.persons + ' ORDER BY id');
            assert.ok(!JSON.stringify(got).match(/=cmd|@SUM|\+SUM/), 'formules vidées : ' + JSON.stringify(got));
            const loops = one('SELECT count(*) n FROM family_children fc JOIN families f ON f.id=fc.family_id WHERE fc.child_id IN (f.partner1_id, f.partner2_id)').n;
            assert.equal(loops, 0, 'personne ne devient son propre enfant');
            await post('import_undo', { token: imp.body.result.undo });
            assert.deepEqual(snapshot(), before);
            // relevés : import puis annulation
            const acts = [{ type: 'N', date: '1/1/1850', commune: 'Ussac', people: [{ role: 'sujet', first: 'Jean', last: 'MAZAUD', sex: 'male' }, { role: 'pere', first: '=cmd|x', last: 'MAZAUD' }] }];
            const rel = await post('releves_import', { acts, links: { '0:0': { mode: 'create' }, '0:1': { mode: 'create' } }, label: 'cercle' });
            assert.equal(rel.status, 200, JSON.stringify(rel.body));
            const ru = await post('releves_undo', { token: rel.body.result.undo });
            assert.equal(ru.status, 200, JSON.stringify(ru.body));
            assert.deepEqual(snapshot(), before);
            // RIS et GeoJSON valides : import et annulation
            const ris = 'TY  - BOOK\nTI  - Registres d’Ussac\nAU  - =cmd|x\nPY  - 1850\nER  - \nTY  - BOOK\nTI  - Registres d’Ussac\nAU  - =cmd|x\nER  - \n';
            const ri = await post('sources_refs_import', { text: ris, mode: 'run' });
            assert.equal(ri.status, 200, JSON.stringify(ri.body));
            assert.equal(ri.body.result.count, 1, 'doublon dans le même fichier : une seule source');
            assert.ok(!JSON.stringify(sql('SELECT author FROM sources')).includes('=cmd'));
            await post('import_undo', { token: ri.body.result.undo });
            const geo = await post('places_geo_apply', { items: [{ action: 'create', name: 'Ussac', lat: 45.19, lon: 1.51 }, { action: 'create', name: '=cmd|x', lat: 1, lon: 1 }, { action: 'update', place_id: 999999, lat: 1, lon: 1 }, { action: 'create', name: 'Loin', lat: 'NaN', lon: 1e400 }] });
            assert.equal(geo.status, 200, JSON.stringify(geo.body));
            await post('places_geo_undo', { token: geo.body.result.undo });
            assert.deepEqual(snapshot(), before);
        });
        await step('import d’un fichier par son chemin (application de bureau) : refusé sans le secret, même pour « ../../ »', async () => {
            for (const p of [path.join(SECRET_DIR, 'motdepasse.txt'), '../../etc/passwd', DB]) {
                const r = await post('import_local_path', { path: p }, { 'X-Carnet-Local': 'devine' });
                assert.equal(r.status, 403, JSON.stringify(r.body));
            }
            assert.deepEqual(snapshot(), start);
        });

        await step('Hérédis importé à côté : la personne de départ de la base n’est jamais changée', async () => {
            const pierre = Number(one("SELECT id FROM persons WHERE first_name='Pierre' AND last_name='MAZAUD'").id);
            exec(`UPDATE persons SET is_start = (id = ${pierre})`);
            const h = sqliteFile(path.join(work, 'sosa.heredis'), HEREDIS_OK + '\nCREATE TABLE NumerosSosa (XrefIndividu integer PRIMARY KEY, XrefDeCujus integer);\nINSERT INTO NumerosSosa VALUES (3,3);');
            const r = await upload('import_package', h, 'sosa.heredis');
            assert.equal(r.status, 200, JSON.stringify(r.body));
            assert.deepEqual(sql('SELECT id FROM persons WHERE is_start=1').map(x => Number(x.id)), [pierre]);
            await undo(r.body.undo);
            assert.deepEqual(sql('SELECT id FROM persons WHERE is_start=1').map(x => Number(x.id)), [pierre]);
            exec('UPDATE persons SET is_start=0');
        });
        await step('dossier « Scans » : fichiers vides, octets au hasard, page web renommée .jpg : rien ne plante, la vraie photo arrive', async () => {
            const scans = path.join(work, 'scans'); fs.mkdirSync(scans, { recursive: true });
            fs.writeFileSync(path.join(scans, 'vide.jpg'), ''); fs.writeFileSync(path.join(scans, 'hasard.jpg'), RANDOM); fs.writeFileSync(path.join(scans, 'page.pdf'), '<html></html>'); fs.writeFileSync(path.join(scans, 'vraie.png'), PNG); fs.writeFileSync(path.join(scans, 'notes.txt'), 'rien');
            const old = Date.now() / 1000 - 60; for (const f of fs.readdirSync(scans)) fs.utimesSync(path.join(scans, f), old, old);
            const set = await post('save_scan_inbox_settings', { dir: scans, enabled: true, move_imported: false });
            assert.equal(set.status, 200, JSON.stringify(set.body));
            const before = snapshot();
            const r = await post('scan_inbox_run', {});
            assert.equal(r.status, 200, JSON.stringify(r.body));
            assert.ok(!INTERNAL.test(JSON.stringify(r.body)), JSON.stringify(r.body));
            assert.ok(r.body.imported.some(f => f.name === 'vraie.png'), JSON.stringify(r.body));
            assert.ok(!r.body.imported.some(f => f.name === 'notes.txt'));
            const ids = r.body.imported.map(f => Number(f.media_id));
            for (const id of ids) { const fn = one('SELECT filename FROM media WHERE id=' + id).filename; exec('DELETE FROM media WHERE id=' + id); try { fs.unlinkSync(path.join(dir, 'media', fn)); } catch (_) {} }
            exec('DELETE FROM scan_inbox_files');
            await post('save_scan_inbox_settings', { dir: '', enabled: false });
            const { media: _m, _media_files: _f, ...now } = snapshot(); const { media: _m2, _media_files: _f2, ...was } = before;
            assert.deepEqual(now, was);
            assert.deepEqual(snapshot(), start);
        });
        await step('ouvrir une base (.db) ou une sauvegarde (.zip) : refusé si une généalogie est déjà ouverte', async () => {
            const copy = path.join(work, 'copie.db'); try { fs.unlinkSync(copy); } catch (_) {}
            php(`$d=new PDO('sqlite:'.$argv[1]);$d->exec("VACUUM INTO '".$argv[2]."'");`, DB, copy);
            for (const name of ['copie.db', 'copie.sqlite']) { const r = await upload('import_package', fs.readFileSync(copy), name); assert.equal(r.status, 409, JSON.stringify(r.body)); }
            const zr = await upload('import_package', makeZip([['lcnda-sauvegarde.json', '{}'], ['genealogy.sqlite', { file: copy }]]), 'sauvegarde.zip');
            assert.equal(zr.status, 409, JSON.stringify(zr.body));
            const pv = await upload('import_preview', makeZip([['lcnda-sauvegarde.json', '{}'], ['genealogy.sqlite', { file: copy }]]), 'sauvegarde.zip');
            assertRefused(pv, 'aperçu d’une sauvegarde', [409, 422]);
            assert.deepEqual(snapshot(), start);
        });
        await step('installation vide : base ou sauvegarde abîmée, piégée (« ../ », lien, bombe, déclencheur) refusée ou nettoyée, puis la bonne s’ouvre', async () => {
            const dir2 = path.join(tmp, 'neuve');
            fs.mkdirSync(path.join(dir2, 'media'), { recursive: true });
            const port2 = await freePort(); const base2 = `http://127.0.0.1:${port2}/`;
            const proc2 = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-d', 'upload_max_filesize=512M', '-d', 'post_max_size=512M', '-S', `127.0.0.1:${port2}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env: envFor(dir2), stdio: 'ignore' });
            try {
                for (let i = 0; i < 100; i++) { try { await fetch(base2 + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
                let ck = ''; const h2 = await (await fetch(base2).then(r => { ck = (r.headers.get('set-cookie') || '').split(';')[0]; return r; })).text();
                const tok = JSON.parse(h2.match(/window\.INSTALL_CSRF = ("[^"]*")/)[1]);
                const up2 = async (buf, name) => { const fd = new FormData(); fd.append('file', new Blob([buf]), name); fd.append('csrf', tok); const r = await fetch(`${base2}api.php?action=import_package`, { method: 'POST', headers: { Cookie: ck, 'X-CSRF-Token': tok }, body: fd }); return { status: r.status, body: await parse(r) }; };
                const appDb = (file, extra = '') => { try { fs.unlinkSync(file); } catch (_) {} php(`$d=new PDO('sqlite:'.$argv[1]);$d->exec(file_get_contents('data/schema.sql'));$d->exec($argv[2]);`, file, extra); return fs.readFileSync(file); };
                const empty = appDb(path.join(work, 'vide-app.db'));
                const good = appDb(path.join(work, 'bonne.db'), "INSERT INTO persons(first_name,last_name,gender) VALUES('Antoine','MAZAUD','male'),('Rose','LACOMBE','female'); CREATE TABLE piege(x); CREATE TRIGGER t AFTER UPDATE ON persons BEGIN UPDATE persons SET last_name='PIRATE'; END; CREATE VIEW v AS SELECT 1; INSERT INTO media(title,media_type,filename) VALUES('x','image','../../evil-zipslip.jpg');");
                const bad = [];
                const cases = [['hasard.db', RANDOM], ['vide.db', Buffer.alloc(0)], ['photo.sqlite', JPG], ['autre.db', sqliteFile(path.join(work, 'autre.db'), 'CREATE TABLE t(x);')], ['sans-personne.db', empty],
                    ['sans-base.zip', makeZip([['lcnda-sauvegarde.json', '{}'], ['media/a.jpg', JPG]])], ['coupee.zip', makeZip([['lcnda-sauvegarde.json', '{}'], ['genealogy.sqlite', good]]).subarray(0, 400)],
                    ['bombe.zip', makeZip([['lcnda-sauvegarde.json', '{}'], ['genealogy.sqlite', good], ['media/gros.jpg', { zeros: bigZeros }]])], ['hasard-base.zip', makeZip([['lcnda-sauvegarde.json', '{}'], ['genealogy.sqlite', RANDOM]])]];
                for (const [name, buf] of cases) { const r = await up2(buf, name); try { assertRefused(r, 'ouverture ' + name, [409, 422]); } catch (e) { bad.push(e.message); } }
                assert.ok(!bad.length, bad.join('\n        '));
                assert.deepEqual(fs.readdirSync(dir2).filter(f => f.startsWith('.ouverture')), [], 'aucune base à moitié reçue laissée');
                assert.deepEqual(fs.readdirSync(path.join(dir2, 'media')), [], 'aucun média laissé par un refus');
                const zip = makeZip([['lcnda-sauvegarde.json', '{}'], ['genealogy.sqlite', good], ['media/ok.png', PNG], ['media/../../evil-zipslip.png', PNG], ['../evil-zipslip2.png', PNG], ['/tmp/evil-zipslip-abs.png', PNG], ['media/.htaccess', 'x'], ['media/lien.png', path.join(SECRET_DIR, 'id_rsa.jpg'), { link: true }]]);
                const r = await up2(zip, 'sauvegarde.zip');
                assert.equal(r.status, 200, JSON.stringify(r.body));
                assert.equal(r.body.stats.persons, 2);
                assertNothingEscaped('sauvegarde');
                assert.ok(!fs.existsSync('/tmp/evil-zipslip-abs.png'));
                const files = fs.readdirSync(path.join(dir2, 'media')).sort();
                assert.ok(files.includes('ok.png') && !files.includes('.htaccess'), files.join(','));
                for (const f of files) assert.ok(!fs.readFileSync(path.join(dir2, 'media', f)).includes(SECRET_TEXT), 'secret copié : ' + f);
                const db2 = path.join(dir2, 'genealogy.sqlite');
                const objs = JSON.parse(php(`$d=new PDO('sqlite:'.$argv[1]);echo json_encode($d->query("SELECT type,name FROM sqlite_master WHERE type IN ('trigger','view')")->fetchAll(PDO::FETCH_ASSOC));`, db2));
                assert.deepEqual(objs, [], 'déclencheurs et vues retirés');
                const again = await up2(good, 'bonne.db');
                assert.equal(again.status, 409, 'une base ouverte n’est jamais remplacée');
            } finally { proc2.kill(); }
        });

        // ── 5. mode consultation ──
        await step('mode consultation : tout import est refusé (423), rien n’entre', async () => {
            const k = await post('kiosk_enter', { password: 'consult' });
            assert.equal(k.status, 200, JSON.stringify(k.body));
            try {
                const bad = [];
                const files = [['import_preview', gz(GRAMPS_XML()), 'a.gramps'], ['import_package', gz(GRAMPS_XML()), 'a.gramps'], ['import_package', makeZip([['a.ged', '0 HEAD\n0 TRLR\n']]), 'a.zip'], ['import_package', sqliteFile(path.join(work, 'k.heredis'), HEREDIS_OK), 'k.heredis'],
                    ['import_package', Buffer.from(GW), 'k.gw'], ['import_package', Buffer.from(JSON.stringify(GX)), 'k.json'], ['import_package', JPG, 'k.ftm'], ['insee_import', Buffer.from('nom;prenom\nA;B\n'), 'd.csv'], ['insee_prenoms_import', Buffer.from('sexe;preusuel;annais;nombre\n1;A;1900;1\n'), 'p.csv'],
                    ['import_analyse', gz(GRAMPS_XML()), 'a.gramps'], ['merge_gedcom_analyse', Buffer.from('0 HEAD\n0 TRLR\n'), 'a.ged'], ['sync_preview', Buffer.from('{}'), 's.json'], ['import_package', sqliteFile(path.join(work, 'k.db'), 'CREATE TABLE persons(id);'), 'k.db']];
                for (const [action, buf, name] of files) { const r = await upload(action, buf, name); if (r.status !== 423) bad.push(action + ' ' + name + ' : ' + r.status + ' ' + JSON.stringify(r.body).slice(0, 150)); }
                for (const [action, body] of [['import_pending', { token: 'a'.repeat(24) }], ['import_dna_matches', { kit_id: 1, rows: [] }], ['import_my_list', { json: '{}' }], ['import_custom_block_def', { json: '{}' }], ['releves_import', { acts: [] }], ['people_table_import', { persons: [] }], ['sources_refs_import', { text: '', mode: 'run' }], ['places_geo_apply', { items: [] }], ['import_undo', { token: 'a'.repeat(24) }], ['scan_inbox_run', {}]]) {
                    const r = await post(action, body); if (r.status !== 423) bad.push(action + ' : ' + r.status + ' ' + JSON.stringify(r.body).slice(0, 150));
                }
                const fd = new FormData(); fd.append('files[]', new Blob([PNG]), 'p.png'); fd.append('person_id', '1'); fd.append('csrf', csrf);
                const up = await fetch(base + 'upload.php', { method: 'POST', headers: { Cookie: cookie, 'X-CSRF-Token': csrf }, body: fd });
                if (up.status !== 423) bad.push('upload.php : ' + up.status);
                assert.ok(!bad.length, bad.join('\n        '));
                assert.deepEqual(snapshot(), start);
            } finally {
                const x = await post('kiosk_exit', { password: 'consult' });
                assert.equal(x.status, 200, JSON.stringify(x.body));
            }
        });

        console.log(`\n${passed} ok, ${failed} en échec`);
    } finally {
        proc.kill();
        if (process.env.KEEP_TMP) console.log('dossier gardé : ' + tmp); else fs.rmSync(tmp, { recursive: true, force: true });
        if (/Fatal error|Uncaught/.test(phpLog)) console.log('journal PHP :\n' + phpLog.split('\n').filter(l => /Fatal|Uncaught|Warning/.test(l)).slice(0, 20).join('\n'));
    }
    process.exit(failed ? 1 : 0);
})();
