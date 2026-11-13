'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * Imports / exports (vague 3a) :   node tests/test-imports-exports-3a.js
 * Un vrai « php -S » sur une base neuve (dossiers temporaires), puis un navigateur (Playwright ; sinon sauté).
 *  1. lecture (PHP, sans serveur) : dates GeneWeb, fichier .gw complet (fam, pevt, fevt, notes, rel, notes-db), bloc
 *     abîmé sauté et signalé, base binaire refusée ; GEDCOM-X XML (comptes) et JSON abîmé ou XML à ENTITY refusés ;
 *     logiciel reconnu par HEAD.SOUR pour les 11 fixtures d'autres logiciels ;
 *  2. exports AVEC LES PHOTOS : GedZip (GEDCOM 7 + media/) et paquet Gramps (.gpkg) — taille annoncée avant, vivants et
 *     fiches confidentielles cachés, média où figure une personne cachée exclu, puis ALLER-RETOUR (réimport compté :
 *     personnes, familles, événements, médias) et « ↶ Annuler » ;
 *  3. GEDCOM-X : l'export JSON de l'app se réimporte (personnes, familles, filiations, événements, sources, citations,
 *     autres noms, lieux avec coordonnées, Wikidata) ; GeneWeb importé (témoins, calendriers, adoption) ;
 *  4. autres logiciels : Family Historian, Ancestral Quest, Reunion (Mac), Legacy, GenoPro, WikiTree, Geni, Ancestris,
 *     webtrees, Brother's Keeper, PAF — logiciel reconnu et particularités gardées ; GenoPro .gno et GeneWeb .gwb refusés ;
 *     zip avec « ../ » refusé dès l'aperçu ;
 *  5. Wikidata : identifiant (refus d'un mauvais), « Compléter » (n'écrase rien) + « ↶ Annuler », export GEDCOM 5.5.1 / 7 ;
 *  6. navigateur : fenêtres GedZip (taille), import d'un .gw (K13), « 🌐 Compléter depuis Wikidata » (Wikidata simulé),
 *     1440 px, 390 px, sombre ; aucune erreur de page ni de console.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const FIX = path.join(__dirname, 'fixtures', 'autres-logiciels');
const SHOTS = process.env.SHOTS_DIR || '';
const phpPath = findPhp([devBundledPhp()]);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-imp3a-'));
const dir = path.join(tmp, 'data');
const envFor = d => ({ ...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1' });
fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
let passed = 0, failed = 0;
async function step(name, fn) { try { await fn(); passed++; console.log('  ✓ ' + name); } catch (e) { failed++; console.log('  ✗ ' + name + '\n      ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n      ') : e)); } }
function php(code, ...args) {
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-d', 'memory_limit=256M', '-r', code, ...args], { cwd: appRoot, encoding: 'utf8', env: envFor(dir), maxBuffer: 64 * 1048576 });
    if (r.status !== 0) throw new Error((r.stderr || r.stdout).trim().slice(0, 800));
    return r.stdout;
}
const sql = q => JSON.parse(php(`$d=new PDO('sqlite:'.$argv[1]);$d->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE,PDO::FETCH_ASSOC);echo json_encode($d->query($argv[2])->fetchAll(),JSON_UNESCAPED_UNICODE);`, path.join(dir, 'genealogy.sqlite'), q));
const one = q => sql(q)[0] || {};
const exec = q => php(`$d=new PDO('sqlite:'.$argv[1]);$d->exec($argv[2]);`, path.join(dir, 'genealogy.sqlite'), q);
// deux petites images différentes (PNG 1×1)
const PNG_A = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const PNG_B = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

{
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; db(); echo 'ok';`], { cwd: appRoot, encoding: 'utf8', env: envFor(dir) });
    if (r.status !== 0 || !/ok$/.test(r.stdout)) { console.error(r.stderr || r.stdout); process.exit(1); }
}
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const thisYear = new Date().getFullYear();
const SEED = `0 HEAD
1 SOUR ESSAI
1 GEDC
2 VERS 5.5.1
1 CHAR UTF-8
0 @S1@ SOUR
1 TITL Registres de Plouvien
0 @I1@ INDI
1 NAME Jean /DUPRÉ/
1 SEX M
1 NAME Jeannot /DUPRÉ/
2 TYPE aka
1 BIRT
2 DATE 3 MAR 1850
2 PLAC Plouvien, Finistère, Bretagne, France
3 MAP
4 LATI N48.5333
4 LONG W4.4500
2 SOUR @S1@
3 PAGE Vue 12
1 DEAT
2 DATE 1920
1 NOTE Marin pêcheur.
1 FAMS @F1@
0 @I2@ INDI
1 NAME Marie /LE GOFF/
1 SEX F
1 BIRT
2 DATE ABT 1855
1 DEAT
2 DATE 1930
1 FAMS @F1@
0 @I3@ INDI
1 NAME Paul /DUPRÉ/
1 SEX M
1 BIRT
2 DATE 1880
2 ASSO @I1@
3 RELA Godfather
1 DEAT
2 DATE 1950
1 FAMC @F1@
1 FAMS @F2@
0 @I4@ INDI
1 NAME Lucie /DUPRÉ/
1 SEX F
1 BIRT
2 DATE ${thisYear - 30}
1 FAMC @F2@
0 @I5@ INDI
1 NAME Secret /DUPRÉ/
1 SEX F
1 RESN privacy
1 BIRT
2 DATE 1885
1 DEAT
2 DATE 1960
1 FAMC @F1@
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 CHIL @I3@
1 CHIL @I5@
1 MARR
2 DATE 12 MAY 1878
2 PLAC Plouvien, Finistère, Bretagne, France
0 @F2@ FAM
1 HUSB @I3@
1 CHIL @I4@
2 _FREL Adopted
0 TRLR
`;

(async () => {
    console.log('Imports / exports 3a : GeneWeb, GEDCOM-X, GedZip, paquet Gramps, autres logiciels, Wikidata');
    const lib = `require 'lib/paths.php'; require 'lib/bootstrap.php'; require 'lib/gedcom.php'; require 'lib/imports.php'; require 'lib/import_geneweb.php'; require 'lib/import_gedcomx.php';`;
    // ── 1. lecture ──
    await step('dates GeneWeb → GEDCOM (~, ?, <, >, .., |, J, F, texte)', () => {
        const cases = { '12/5/1835': '12 MAY 1835', '5/1835': 'MAY 1835', '~1780': 'ABT 1780', '?1780': 'EST 1780', '<1890': 'BEF 1890', '>1700': 'AFT 1700', '1880..1885': 'BET 1880 AND 1885',
            '2/1/1812J': '@#DJULIAN@ 2 JAN 1812', '1/1/14F': '@#DFRENCH R@ 1 VEND 14', '0(au printemps)': '(au printemps)', '0': '' };
        const out = JSON.parse(php(`${lib} $o=[]; foreach (array_slice($argv,1) as $d) { $o[$d]=gw_date($d); } echo json_encode($o, JSON_UNESCAPED_UNICODE);`, ...Object.keys(cases)));
        assert.deepEqual(out, cases);
    });
    await step('GeneWeb : fichier complet lu (personnes, familles, événements, témoins, notes de la base)', () => {
        const r = JSON.parse(php(`${lib} [$g,$c]=geneweb_to_gedcom(file_get_contents($argv[1])); echo json_encode(['c'=>$c,'g'=>$g], JSON_UNESCAPED_UNICODE);`, path.join(FIX, 'geneweb-famille.gw')));
        assert.equal(r.c.persons, 15); assert.equal(r.c.families, 5); assert.equal(r.c.skipped_blocks, 0); assert.equal(r.c.db_notes, 1);
        assert.match(r.g, /1 _MILT\n2 DATE 1803\n2 PLAC Boulogne-sur-Mer/); assert.match(r.g, /2 TYPE Légion d'honneur/);
        assert.match(r.g, /2 CAUS Tué/); assert.match(r.g, /3 RELA Officier d’état civil/); assert.match(r.g, /2 PEDI adopted/);
        assert.match(r.g, /1 NAME Marianne \/MARTIN\/\n2 TYPE aka/);
    });
    await step('GeneWeb : bloc abîmé sauté et signalé ; base binaire (.gwb) et fichier sans bloc refusés', () => {
        const bad = 'fam DUPONT Jean + MARTIN Marie\nbeg\n- h Pierre\nend\n\nfam DURAND Paul +1900 LEROY Anne 1880 mots de trop\n\nfam ROUX Louis +1910 BLANC Rose\n';
        const r = JSON.parse(php(`${lib} [$g,$c]=geneweb_to_gedcom($argv[1]); echo json_encode($c, JSON_UNESCAPED_UNICODE);`, bad));
        assert.equal(r.families, 2); assert.equal(r.skipped_blocks, 1); assert.match(r.warnings[0], /Ligne 6 .*laissé de côté/);
        const binf = path.join(tmp, 'base.gwb'); fs.writeFileSync(binf, Buffer.from('GnWb0024\0\0\0binaire', 'binary'));
        const out = php(`${lib} foreach ([file_get_contents($argv[1]), $argv[2]] as $x) { try { geneweb_to_gedcom($x); echo "lu\\n"; } catch (Throwable $e) { echo 'non: ', $e->getMessage(), "\\n"; } }`, binf, 'bonjour\nceci n’est pas un arbre\n');
        const l = out.trim().split('\n'); assert.match(l[0], /^non: .*binaires/); assert.match(l[1], /^non: .*pas un fichier GeneWeb/);
    });
    await step('GEDCOM-X : XML lu (comptes), JSON abîmé et XML avec ENTITY refusés, dates formelles', () => {
        const r = JSON.parse(php(`${lib} [$g,$c]=gedcomx_to_gedcom(file_get_contents($argv[1])); echo json_encode(['c'=>$c,'g'=>$g], JSON_UNESCAPED_UNICODE);`, path.join(FIX, 'gedcomx-famille.xml')));
        assert.deepEqual([r.c.persons, r.c.families, r.c.events, r.c.sources, r.c.children_links], [4, 1, 7, 1, 2]);
        assert.match(r.g, /4 LATI N49\.4431/); assert.match(r.g, /3 PAGE vue 42/); assert.match(r.g, /_FREL adopted/); assert.match(r.g, /1 _FSFTID KWCB-QR7/);
        const out = php(`${lib} foreach ([$argv[1], $argv[2]] as $x) { try { gedcomx_to_gedcom($x); echo "lu\\n"; } catch (Throwable $e) { echo 'non: ', $e->getMessage(), "\\n"; } }`,
            '{"persons":[{"id":"x"', '<?xml version="1.0"?><!DOCTYPE g [<!ENTITY x SYSTEM "file:///etc/passwd">]><gedcomx xmlns="http://gedcomx.org/v1/"><person id="a">&x;</person></gedcomx>');
        const l = out.trim().split('\n'); assert.match(l[0], /^non: .*abîmé/); assert.match(l[1], /^non: .*ENTITY/);
        const f = JSON.parse(php(`${lib} echo json_encode(array_map('gedcomx_formal_to_gedcom', array_slice($argv,1)));`, '+1814-06-28', 'A+1750', '+1880/+1885', 'A+1880/+1885', '/+1800', '+1800/', 'n’importe'));
        assert.deepEqual(f, ['28 JUN 1814', 'ABT 1750', 'FROM 1880 TO 1885', 'BET 1880 AND 1885', 'BEF 1800', 'AFT 1800', '']);
    });
    const VENDORS = { 'family-historian': 'family_historian', 'ancestral-quest': 'ancestral_quest', 'reunion-mac': 'reunion', legacy: 'legacy', genopro: 'genopro', wikitree: 'wikitree',
        geni: 'geni', ancestris: 'ancestris', webtrees: 'webtrees', 'brothers-keeper': 'brothers_keeper', paf: 'paf' };
    await step('logiciel reconnu par HEAD.SOUR (11 fixtures ; « CORP MyHeritage » de Legacy ne trompe pas)', () => {
        const files = Object.keys(VENDORS).map(f => path.join(FIX, f + '.ged'));
        const out = JSON.parse(php(`${lib} $o=[]; foreach (array_slice($argv,1) as $f) { $o[basename($f, '.ged')] = gedcom_producer(gedcom_text_to_utf8(file_get_contents($f)))['producer']; } echo json_encode($o);`, ...files));
        assert.deepEqual(out, VENDORS);
    });

    // ── 2-5. par le serveur ──
    const port = Number(process.env.IMP3A_PORT) || await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env: envFor(dir), stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
    let cookie = '';
    const html = await (await fetch(base).then(r => { cookie = (r.headers.get('set-cookie') || '').split(';')[0]; return r; })).text();
    const csrf = JSON.parse(html.match(/window\.INSTALL_CSRF = ("[^"]*")/)[1]);
    const post = async (action, body) => { const r = await fetch(`${base}api.php?action=${action}`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ ...body, csrf }) }); return { status: r.status, body: await r.json() }; };
    const get = async (q) => { const r = await fetch(`${base}api.php?${q}`, { headers: { Cookie: cookie } }); return r; };
    const upload = async (action, buf, name) => { const fd = new FormData(); fd.append('file', new Blob([buf]), name); fd.append('csrf', csrf); const r = await fetch(`${base}api.php?action=${action}`, { method: 'POST', headers: { Cookie: cookie, 'X-CSRF-Token': csrf }, body: fd }); return { status: r.status, body: await r.json() }; };
    const importTree = async (buf, name) => { const p = await upload('import_preview', buf, name); assert.equal(p.status, 200, JSON.stringify(p.body)); const r = await post('import_pending', { token: p.body.token }); assert.equal(r.status, 200, JSON.stringify(r.body)); return { preview: p.body, ...r.body }; };
    const count = t => Number(one(`SELECT count(*) AS n FROM ${t}`).n);
    const undo = async t => { const u = await post('import_undo', { token: t }); assert.equal(u.status, 200, JSON.stringify(u.body)); };
    let browserOk = true;
    try {
        // la base de départ : 5 fiches (une vivante, une confidentielle), 2 familles, une adoption, 3 photos
        await step('base de départ importée, 3 médias reliés (un au vivant, un repéré avec la fiche confidentielle)', async () => {
            const res = await importTree(Buffer.from(SEED), 'depart.ged');
            assert.equal(res.stats.persons, 5);
            fs.writeFileSync(path.join(dir, 'media', 'jean.png'), PNG_A);
            fs.writeFileSync(path.join(dir, 'media', 'lucie.png'), PNG_B);
            fs.writeFileSync(path.join(dir, 'media', 'groupe.png'), Buffer.concat([PNG_A, Buffer.from('groupe')]));
            const id = n => Number(one(`SELECT id FROM persons WHERE first_name='${n}'`).id);
            exec(`INSERT INTO media(id,title,media_type,filename) VALUES(901,'Jean au port','image','jean.png'),(902,'Lucie','image','lucie.png'),(903,'Photo de groupe','image','groupe.png');
                INSERT INTO media_links(media_id,entity_type,entity_id,position) VALUES(901,'person',${id('Jean')},0),(902,'person',${id('Lucie')},0),(903,'person',${id('Paul')},1);
                INSERT INTO media_tags(media_id,person_id) VALUES(903,${id('Secret')});`);
        });
        const PERSONS = 5;
        let gdz = null, gpkg = null;
        await step('GedZip : taille annoncée avant ; pour partager, les photos d’un vivant ou d’une fiche confidentielle restent dehors', async () => {
            const e = await (await get('action=export_plus&format=gedzip&estimate=1')).json();
            assert.equal(e.ok, true); assert.equal(e.persons, PERSONS); assert.equal(e.media, 1, 'seule la photo de Jean');
            assert.ok(e.private >= 1, 'la photo de groupe (fiche confidentielle repérée) est comptée à part'); assert.ok(e.bytes > PNG_A.length);
            const r = await get('action=export_plus&format=gedzip');
            assert.equal(r.status, 200); assert.match(r.headers.get('content-disposition'), /\.gdz"/);
            const buf = Buffer.from(await r.arrayBuffer());
            const z = JSON.parse(php(`$z=new ZipArchive; $f=tempnam(sys_get_temp_dir(),'z'); file_put_contents($f, base64_decode($argv[1])); $z->open($f); $o=[]; for($i=0;$i<$z->numFiles;$i++){$o[]=$z->getNameIndex($i);} echo json_encode(['n'=>$o,'g'=>$z->getFromName('gedcom.ged')], JSON_UNESCAPED_UNICODE);`, buf.toString('base64')));
            assert.deepEqual(z.n.sort(), ['gedcom.ged', 'media/jean.png']);
            assert.match(z.g, /2 VERS 7\.0/); assert.match(z.g, /1 FILE media\/jean\.png\n2 FORM image\/png/);
            assert.ok(!/Lucie|Secret|groupe/.test(z.g), 'ni la vivante, ni la confidentielle, ni leur photo');
        });
        await step('GedZip complet (sans partage) : aller-retour compté (personnes, familles, événements, médias) puis ↶ Annuler', async () => {
            const e = await (await get('action=export_plus&format=gedzip&estimate=1&share=0')).json();
            assert.equal(e.media, 3); assert.equal(e.private, 0);
            const r = await get('action=export_plus&format=gedzip&share=0');
            gdz = Buffer.from(await r.arrayBuffer());
            assert.equal(r.headers.get('x-lcnda-media'), '3');
            const before = [count('persons'), count('families'), count('events')];
            const res = await importTree(gdz, 'aller-retour.gdz');
            assert.equal(res.preview.format, 'gedzip'); assert.equal(res.preview.media_local, 3);
            assert.equal(res.stats.persons, before[0]); assert.equal(res.stats.families, before[1]); assert.equal(res.stats.events, before[2]);
            assert.equal(res.stats.media, 3); assert.equal(res.stats.media_missing, 0);
            await undo(res.undo);
            assert.equal(count('persons'), before[0]); assert.equal(count('media'), 3);
            assert.ok(fs.existsSync(path.join(dir, 'media', 'jean.png')), 'les fichiers d’origine restent');
        });
        await step('paquet Gramps (.gpkg) : tar.gz avec data.gramps + media/, aller-retour compté, vie privée', async () => {
            const e = await (await get('action=export_plus&format=gpkg&estimate=1')).json();
            assert.equal(e.media, 1); assert.ok(e.private >= 1);
            const r = await get('action=export_plus&format=gpkg&share=0');
            gpkg = Buffer.from(await r.arrayBuffer());
            const names = JSON.parse(php(`$g=gzopen($argv[1],'rb'); $o=[]; while(!gzeof($g)){ $h=gzread($g,512); if(strlen($h)<512||trim($h,"\\0")==='') break; $n=rtrim(substr($h,0,100),"\\0"); $s=octdec(trim(substr($h,124,12),"\\0 ")); $o[]=$n; if($s) gzread($g,(int)ceil($s/512)*512); } echo json_encode($o);`, (() => { const f = path.join(tmp, 'p.gpkg'); fs.writeFileSync(f, gpkg); return f; })()));
            assert.deepEqual(names.sort(), ['data.gramps', 'media/groupe.png', 'media/jean.png', 'media/lucie.png']);
            const before = [count('persons'), count('families'), count('events')];
            const res = await importTree(gpkg, 'aller-retour.gpkg');
            assert.equal(res.preview.producer, 'gramps');
            assert.deepEqual([res.stats.persons, res.stats.families, res.stats.events, res.stats.media], [...before, 3]);
            await undo(res.undo);
            assert.equal(count('persons'), before[0]);
        });
        await step('GEDCOM-X : l’export JSON de l’app se réimporte sans perte notable (compté)', async () => {
            exec(`UPDATE persons SET wikidata_id='Q7186' WHERE first_name='Jean'`);
            const r = await get('action=export_plus&format=gedcomx&share=0');
            const gx = Buffer.from(await r.arrayBuffer()); const doc = JSON.parse(gx.toString('utf8'));
            const facts = doc.persons.reduce((n, p) => n + (p.facts || []).length, 0) + (doc.relationships || []).filter(x => /Couple/.test(x.type)).reduce((n, x) => n + (x.facts || []).length, 0);
            const before = { persons: count('persons'), families: count('families'), kids: count('family_children'), events: count('events'), variants: count('name_variants'), cites: count('source_links') };
            const res = await importTree(gx, 'export.json');
            assert.equal(res.preview.producer, 'gedcomx');
            assert.equal(res.stats.persons, doc.persons.length); assert.equal(res.stats.persons, before.persons);
            assert.equal(res.stats.families, before.families); assert.equal(res.stats.events, facts); assert.equal(res.stats.events, before.events);
            assert.equal(res.stats.children_links, before.kids); assert.equal(res.stats.name_variants, before.variants); assert.equal(res.stats.citations, before.cites);
            const jean = sql(`SELECT id, wikidata_id FROM persons WHERE first_name='Jean' ORDER BY id`);
            assert.equal(jean.length, 2); assert.equal(jean[1].wikidata_id, 'Q7186', 'identifiant Wikidata relu');
            const pl = one(`SELECT pl.latitude, pl.longitude FROM events e JOIN places pl ON pl.id=e.place_id WHERE e.person_id=${jean[1].id} AND pl.latitude IS NOT NULL`);
            assert.ok(Math.abs(pl.latitude - 48.5333) < 0.001 && Math.abs(pl.longitude + 4.45) < 0.001, 'coordonnées du lieu');
            const adop = one(`SELECT relation_to_partner1 AS r FROM family_children WHERE id=(SELECT max(id) FROM family_children WHERE child_id IN (SELECT id FROM persons WHERE first_name='Lucie'))`);
            assert.equal(adop.r, 'adopted', 'adoption gardée');
            await undo(res.undo);
            assert.equal(count('persons'), before.persons);
        });
        await step('GeneWeb (.gw) : aperçu (logiciel, comptes), import (témoins, parrain, calendriers, adoption), ↶ Annuler', async () => {
            const n0 = count('persons');
            const res = await importTree(fs.readFileSync(path.join(FIX, 'geneweb-famille.gw')), 'famille.gw');
            assert.equal(res.preview.producer, 'geneweb'); assert.equal(res.preview.persons, 15); assert.equal(res.preview.families, 5);
            assert.ok(res.preview.notices.some(n => /GeneWeb/.test(n.text)));
            assert.equal(res.stats.persons, 15); assert.ok(res.stats.witnesses >= 2);
            const louis = one(`SELECT e.date_calendar FROM events e JOIN persons p ON p.id=e.person_id JOIN event_types t ON t.id=e.event_type_id WHERE p.first_name='Louis Auguste' AND t.gedcom_tag='BIRT'`);
            assert.equal(louis.date_calendar, 'republican');
            const w = sql(`SELECT w.note FROM event_witnesses w JOIN persons p ON p.id=w.person_id WHERE p.last_name='BERNARD'`);
            assert.ok(w.some(x => /Officier/.test(x.note)), 'officier du mariage');
            assert.ok(sql(`SELECT body FROM notes WHERE body LIKE '%Grande Armée%'`).length === 1, 'notes de la personne');
            await undo(res.undo); assert.equal(count('persons'), n0);
        });
        await step('autres logiciels : 11 GEDCOM importés, particularités gardées', async () => {
            const n0 = count('persons');
            const tokens = [];
            for (const [f, key] of Object.entries(VENDORS)) {
                const res = await importTree(fs.readFileSync(path.join(FIX, f + '.ged')), f + '.ged');
                assert.equal(res.preview.producer, key, f); assert.equal(res.stats.persons, 3, f); assert.equal(res.stats.families, 1, f);
                tokens.push(res.undo);
            }
            const p = n => one(`SELECT * FROM persons WHERE first_name='${n}' ORDER BY id DESC LIMIT 1`);
            assert.equal(p('Henri').is_private, 1, 'Family Historian __PRIVATE'); assert.equal(p('Louise').living_status, 'living', 'Family Historian __LIVING');
            assert.equal(p('Henri').familysearch_id, 'LZ3K-9QW');
            assert.equal(p('Marcel').is_private, 1, 'Ancestral Quest _PRIV'); assert.equal(p('Émile').is_private, 1, 'Legacy _PRIV');
            assert.equal(p('François').is_private, 1, 'Brother’s Keeper _PRIV (et accents DOS)'); assert.ok(p('André').id, 'accents Mac de Reunion');
            assert.equal(p('Marie').wikidata_id, 'Q7186', 'WikiTree _WIKIDATA');
            const labels = sql(`SELECT l.name FROM labels l`).map(x => x.name);
            for (const l of ['Family Historian : Ancestral Interest', 'Legacy : marque 1', 'Legacy : marque 3', 'Legacy : marque 2']) assert.ok(labels.includes(l), l);
            assert.equal(one(`SELECT relation_to_partner1 AS r FROM family_children fc JOIN persons p ON p.id=fc.child_id WHERE p.first_name='Gaston'`).r, 'adopted');
            assert.ok(sql(`SELECT 1 FROM notes WHERE title='À faire' AND body LIKE '%acte de décès%'`).length, 'webtrees _TODO');
            assert.ok(sql(`SELECT 1 FROM notes WHERE title LIKE 'Données propres à Reunion' AND body LIKE '%_FLAG : Rouge%'`).length, 'Reunion : données propres gardées');
            assert.ok(sql(`SELECT 1 FROM notes WHERE title LIKE 'Données propres à WikiTree' AND body LIKE '%Sklodowska-2%'`).length, 'WikiTree : identifiant gardé');
            assert.ok(sql(`SELECT 1 FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.title='Pêcheur à la ligne'`).length, 'Family Historian _ATTR');
            for (const t of tokens.reverse()) await undo(t);
            assert.equal(count('persons'), n0); assert.equal(count('labels'), 0);
        });
        await step('refus propres : GenoPro .gno, base GeneWeb .gwb, .gw binaire, GEDCOM-X à ENTITY, zip avec « ../ »', async () => {
            const a = await upload('import_preview', Buffer.from('PK\x03\x04'), 'arbre.gno'); assert.equal(a.status, 422); assert.match(a.body.error, /GenoPro.*GEDCOM/s);
            const b = await upload('import_preview', Buffer.from('x'), 'base.gwb'); assert.equal(b.status, 422); assert.match(b.body.error, /gwu/);
            const c = await upload('import_preview', Buffer.from('GnWb\0\0\0'), 'base.gw'); assert.equal(c.status, 422); assert.match(c.body.error, /binaires/);
            const d = await upload('import_preview', Buffer.from('<?xml version="1.0"?><!DOCTYPE g [<!ENTITY x "y">]><gedcomx><person id="a"/></gedcomx>'), 'x.xml'); assert.equal(d.status, 422); assert.match(d.body.error, /ENTITY/);
            const evil = path.join(tmp, 'evil.zip');
            php(`$z=new ZipArchive; $z->open($argv[1], ZipArchive::CREATE); $z->addFromString('gedcom.ged', "0 HEAD\\n0 @I1@ INDI\\n1 NAME A /B/\\n0 TRLR\\n"); $z->addFromString('../../evil.png', 'x'); $z->close();`, evil);
            const e = await upload('import_preview', fs.readFileSync(evil), 'evil.gdz'); assert.equal(e.status, 422); assert.match(e.body.error, /chemin interdit/);
            const f = await upload('import_preview', Buffer.from('{"a":1}'), 'donnees.json'); assert.equal(f.status, 422, 'un JSON ordinaire n’est pas un arbre'); assert.doesNotMatch(f.body.error, /GEDCOM-X/);
        });
        await step('Wikidata : identifiant (mauvais refusé), « Compléter » n’écrase rien, ↶ Annuler, exports GEDCOM 5.5.1 et 7', async () => {
            const paul = Number(one(`SELECT id FROM persons WHERE first_name='Paul' ORDER BY id LIMIT 1`).id);
            const bad = await post('person_wikidata_set', { id: paul, qid: 'Z12' }); assert.equal(bad.status, 422);
            const ok = await post('person_wikidata_set', { id: paul, qid: 'https://www.wikidata.org/wiki/Q42' }); assert.equal(ok.body.result.wikidata_id, 'Q42');
            const ev0 = count('events');
            const ap = await post('wikidata_apply', { id: paul, qid: 'Q42', items: [{ kind: 'birth', date: '11 mars 1952', place: 'Cambridge' }, { kind: 'death', date: '11 mai 2001', place: 'Santa Barbara', lat: 34.42, lon: -119.7, country: 'États-Unis' }, { kind: 'occupation', value: 'écrivain' }, { kind: 'gender', value: 'female' }, { kind: 'note', value: 'Douglas Adams : écrivain <b>' }] });
            assert.equal(ap.status, 200, JSON.stringify(ap.body));
            assert.deepEqual(ap.body.result.added, ['métier', 'note'], 'naissance, décès et sexe déjà sur la fiche : rien n’est changé');
            assert.equal(count('events'), ev0);
            const ap2 = await post('wikidata_apply', { id: Number(one(`SELECT id FROM persons WHERE first_name='Jean' ORDER BY id LIMIT 1`).id), qid: 'Q7186', items: [{ kind: 'birth', date: '1 janvier 1850', place: 'Ailleurs' }] });
            assert.deepEqual(ap2.body.result.added, [], 'une naissance déjà datée n’est pas remplacée');
            const lucie = Number(one(`SELECT id FROM persons WHERE first_name='Lucie' ORDER BY id LIMIT 1`).id);
            const ap3 = await post('wikidata_apply', { id: lucie, qid: 'Q1', items: [{ kind: 'death', date: '2 février 2020', place: 'Lieu Wikidata Essai', lat: 10, lon: 20 }] });
            assert.deepEqual(ap3.body.result.added, ['décès']);
            assert.equal(one(`SELECT count(*) AS n FROM places WHERE name='Lieu Wikidata Essai' AND latitude=10`).n, 1);
            await post('wikidata_undo', { token: ap3.body.result.undo });
            assert.equal(one(`SELECT count(*) AS n FROM places WHERE name='Lieu Wikidata Essai'`).n, 0, 'le lieu créé pour l’occasion est retiré');
            assert.equal(one(`SELECT wikidata_id FROM persons WHERE id=${lucie}`).wikidata_id, '');
            await post('wikidata_undo', { token: ap.body.result.undo });
            assert.equal(one(`SELECT occupation FROM persons WHERE id=${paul}`).occupation, '');
            const again = await post('wikidata_undo', { token: ap.body.result.undo }); assert.equal(again.status, 422);
            const g5 = await (await get('action=export_gedcom&share=0')).text(); assert.match(g5, /1 _WIKIDATA Q42/);
            const g7 = await (await get('action=export_gedcom&share=0&gedcom_version=7')).text(); assert.match(g7, /1 EXID Q42\n2 TYPE http:\/\/www\.wikidata\.org\/entity\//);
        });

        // ── 6. navigateur ──
        let pw = null;
        for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
        if (!pw) { console.log('  – navigateur : sauté (Playwright absent)'); }
        else {
            const browser = await pw.chromium.launch();
            const errors = [];
            const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png') }); };
            try {
                const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
                const page = await ctx.newPage();
                page.on('pageerror', e => errors.push('pageerror: ' + e.message));
                page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
                // Wikidata simulé (aucune vraie requête vers internet pendant le test)
                const wdCalls = [];
                await page.route('https://www.wikidata.org/**', route => {
                    const u = new URL(route.request().url()); wdCalls.push(u.searchParams.get('ids'));
                    const ids = (u.searchParams.get('ids') || '').split('|');
                    const ent = {
                        Q42: { id: 'Q42', labels: { fr: { value: 'Douglas Adams' } }, descriptions: { fr: { value: 'écrivain britannique' } }, sitelinks: { frwiki: { title: 'Douglas Adams' } },
                            claims: { P569: [{ mainsnak: { datavalue: { value: { time: '+1952-03-11T00:00:00Z', precision: 11 } } } }], P19: [{ mainsnak: { datavalue: { value: { id: 'Q350' } } } }],
                                P570: [{ mainsnak: { datavalue: { value: { time: '+2001-05-11T00:00:00Z', precision: 11 } } } }], P21: [{ mainsnak: { datavalue: { value: { id: 'Q6581097' } } } }], P106: [{ mainsnak: { datavalue: { value: { id: 'Q36180' } } } }] } },
                        Q350: { id: 'Q350', labels: { fr: { value: 'Cambridge' } }, claims: { P625: [{ mainsnak: { datavalue: { value: { latitude: 52.2, longitude: 0.12 } } } }], P17: [{ mainsnak: { datavalue: { value: { id: 'Q145' } } } }] } },
                        Q36180: { id: 'Q36180', labels: { fr: { value: 'écrivain' } } }, Q145: { id: 'Q145', labels: { fr: { value: 'Royaume-Uni' } } } };
                    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ entities: Object.fromEntries(ids.map(i => [i, ent[i] || { id: i, missing: '' }])) }) });
                });
                await step('Réglages → Export : « 📦 GedZip avec les photos » dit la taille avant', async () => {
                    await page.goto(base + '#maintenance/export');
                    await page.waitForSelector('[data-export-plus="gedzip"]', { timeout: 30000 });
                    await page.click('[data-export-plus="gedzip"]');
                    await page.waitForFunction(() => /≈ .*(Ko|Mo)/.test(document.querySelector('[data-paquet-size]')?.textContent || ''), null, { timeout: 15000 });
                    const t = await page.textContent('[data-paquet-size]');
                    assert.match(t, /1 fichier de média/); assert.match(t, /laissé.* de côté/);
                    await shot(page, '3a-gedzip-1440');
                    await page.click('dialog[open] [name=share]');
                    await page.waitForFunction(() => /3 fichiers de médias/.test(document.querySelector('[data-paquet-size]')?.textContent || ''), null, { timeout: 15000 });
                    const dl = page.waitForEvent('download', { timeout: 20000 });
                    await page.click('dialog[open] button[type=submit]');
                    const d = await dl; assert.match(d.suggestedFilename(), /\.gdz$/);
                });
                await step('Réglages → Import : un fichier GeneWeb (.gw) par « ⤒ Importer un arbre… », puis ↶ Annuler', async () => {
                    await page.goto(base + '#maintenance/import');
                    await page.waitForSelector('[data-import-tree]', { timeout: 30000 });
                    await page.click('[data-import-tree]');
                    await page.waitForSelector('.k-import input[type=file]', { state: 'attached' });
                    await page.setInputFiles('.k-import input[type=file]', path.join(FIX, 'geneweb-famille.gw'));
                    await page.waitForSelector('.k-import [data-k-go]:not([disabled])', { timeout: 20000 });
                    const txt = await page.textContent('.k-import [data-k-body]');
                    assert.match(txt, /15 personnes/); assert.match(txt, /GeneWeb/);
                    await shot(page, '3a-import-gw-1440');
                    const n0 = count('persons');
                    await page.click('.k-import [data-k-go]');
                    await page.waitForSelector('.k-import', { state: 'detached', timeout: 30000 });
                    await page.waitForFunction(() => /15 personnes importées/.test(document.body.textContent));
                    assert.equal(count('persons'), n0 + 15);
                    await page.locator('.ui-toast:has-text("15 personnes importées") button:has-text("Annuler")').first().click();
                    await page.waitForFunction(() => /annulé/.test(document.querySelector('#import-tree-result')?.textContent || ''), null, { timeout: 20000 });
                    assert.equal(count('persons'), n0);
                });
                const paul = Number(one(`SELECT id FROM persons WHERE first_name='Paul' ORDER BY id LIMIT 1`).id);
                await step('fiche : ligne Wikidata ↗ et « 🌐 Compléter depuis Wikidata » (ce qui manque seulement), ↶ Annuler', async () => {
                    exec(`UPDATE persons SET occupation='' WHERE id=${paul}`);
                    await page.goto(base + '#personnes/' + paul);
                    await page.waitForSelector('[data-wd-fill]', { timeout: 30000 });
                    assert.equal(await page.getAttribute('.h-wd-row a', 'href'), 'https://www.wikidata.org/wiki/Q42');
                    assert.equal(wdCalls.length, 0, 'rien n’est demandé à Wikidata sans le bouton');
                    await page.click('[data-wd-fill]');
                    await page.waitForSelector('.h-wd-items', { timeout: 15000 });
                    const t = await page.textContent('.h-wd-items');
                    assert.match(t, /Naissance : 11 mars 1952, Cambridge — déjà sur ta fiche/); assert.match(t, /Décès : 11 mai 2001 — déjà sur ta fiche/);
                    assert.match(t, /Métier : écrivain/); assert.match(t, /Sexe : Homme — déjà sur ta fiche/);
                    assert.equal(await page.locator('.h-wd-items input[type=checkbox]').count(), 2, 'métier, note : seulement ce qui manque');
                    await shot(page, '3a-wikidata-1440');
                    const ev0 = count('events');
                    await page.click('dialog[open] button[type=submit]');
                    await page.waitForFunction(() => /Ajouté depuis Wikidata/.test(document.body.textContent), null, { timeout: 15000 });
                    assert.equal(count('events'), ev0, 'rien n’est remplacé'); assert.equal(one(`SELECT occupation FROM persons WHERE id=${paul}`).occupation, 'écrivain');
                    assert.equal(one(`SELECT count(*) AS n FROM notes WHERE entity_type='person' AND entity_id=${paul} AND title='Wikidata Q42' AND body LIKE '%fr.wikipedia.org%'`).n, 1);
                    await page.click('.ui-toast button:has-text("Annuler")');
                    await page.waitForFunction(() => /retirés|Annulé/.test(document.body.textContent), null, { timeout: 15000 });
                    assert.equal(one(`SELECT occupation FROM persons WHERE id=${paul}`).occupation, '');
                    assert.equal(one(`SELECT count(*) AS n FROM notes WHERE entity_type='person' AND entity_id=${paul} AND title='Wikidata Q42'`).n, 0);
                });
                await step('390 px et mode sombre : la fiche et la fenêtre du paquet Gramps', async () => {
                    const c2 = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
                    const p2 = await c2.newPage();
                    p2.on('pageerror', e => errors.push('pageerror 390: ' + e.message));
                    p2.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console 390: ' + m.text()); });
                    await p2.goto(base + '#personnes/' + paul);
                    await p2.waitForSelector('.h-wd-row', { state: 'attached', timeout: 30000 });
                    // sur un téléphone, la section qui contient « Références externes » est repliée : on l'ouvre
                    await p2.waitForTimeout(800);
                    if (await p2.locator('.fsec.is-folded:has(.h-wd-row)').count()) await p2.locator('.fsec:has(.h-wd-row) [data-fsec-fold]').first().click();
                    await p2.waitForSelector('.h-wd-row', { timeout: 10000 });
                    await p2.locator('.h-wd-row').scrollIntoViewIfNeeded();
                    await shot(p2, '3a-fiche-390-sombre');
                    const ow = await p2.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); assert.ok(ow <= 1, 'pas de défilement de côté');
                    await p2.goto(base + '#maintenance/export');
                    await p2.waitForSelector('[data-export-plus="gpkg"]', { timeout: 30000 });
                    await p2.click('[data-export-plus="gpkg"]');
                    await p2.waitForFunction(() => /≈/.test(document.querySelector('[data-paquet-size]')?.textContent || ''), null, { timeout: 15000 });
                    await shot(p2, '3a-gpkg-390-sombre');
                    await c2.close();
                });
                await step('aucune erreur de page ni de console', () => { assert.deepEqual(errors, []); });
                await ctx.close();
            } finally { await browser.close(); }
        }
    } catch (e) { browserOk = false; console.error(e); }
    finally { proc.kill(); fs.rmSync(tmp, { recursive: true, force: true }); }
    console.log(`\n${passed} réussis, ${failed} échoués`);
    if (failed || !browserOk) process.exit(1);
})();
