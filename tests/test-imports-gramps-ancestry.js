'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * Imports venus d'autres logiciels :   node tests/test-imports-gramps-ancestry.js
 * Un vrai « php -S » sur une base neuve (dossiers temporaires), puis un navigateur (Playwright ; sinon sauté).
 *  1. sûreté (PHP) : XML de Gramps avec ENTITY ou DOCTYPE inattendu refusé, chemins « ../ » refusés, bombe gzip et
 *     bombe tar refusées, paquet .gpkg avec une entrée « ../ » refusé en entier ;
 *  2. Gramps (.gramps et .gpkg) : personnes, noms multiples, familles (adoption), événements avec témoins, parrain,
 *     marraine, lieux (hiérarchie, coordonnées, autres noms, note), sources, citations, dépôts, notes, médias du paquet
 *     (portrait), étiquettes avec couleur, attributs ; aperçu (K13 étape 2) puis import, puis « ↶ Annuler » ;
 *  3. GEDCOM d'Ancestry, de MyHeritage et de Gramps (tests/fixtures/imports) : logiciel reconnu, _APID, _MTTAG, _MARNM,
 *     _PHOTO / _PRIM, _UID, RESN, liens, médias en ligne gardés comme liens (jamais téléchargés), dates « Abt. »… ;
 *     « Fusionner un arbre » accepte un .gramps ;
 *  4. ADN : un fichier brut de SNP est refusé (serveur), import de correspondances et de segments avec « ↶ Annuler » ;
 *  5. navigateur : Réglages → Import → « ⤒ Importer un arbre… » (étapes 2 et 3, ↶ Annuler) ; ADN : les 8 exports
 *     des sociétés reconnus (Ancestry, MyHeritage, 23andMe, FamilyTreeDNA, GEDmatch), fichiers bruts refusés ;
 *     aucune erreur de page ni de console.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const FIX = path.join(__dirname, 'fixtures', 'imports');
const phpPath = findPhp([devBundledPhp()]);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-imports-'));
const dir = path.join(tmp, 'data');
const envFor = d => ({ ...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1' });
fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
let passed = 0, failed = 0;
async function step(name, fn) { try { await fn(); passed++; console.log('  ✓ ' + name); } catch (e) { failed++; console.log('  ✗ ' + name + '\n      ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n      ') : e)); } }
function php(code, ...args) {
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-d', 'memory_limit=256M', '-r', code, ...args], { cwd: appRoot, encoding: 'utf8', env: envFor(dir), maxBuffer: 64 * 1048576 });
    if (r.status !== 0) throw new Error((r.stderr || r.stdout).trim().slice(0, 800));
    return r.stdout;
}
const sql = q => JSON.parse(php(`$d=new PDO('sqlite:'.$argv[1]);$d->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE,PDO::FETCH_ASSOC);echo json_encode($d->query($argv[2])->fetchAll(),JSON_UNESCAPED_UNICODE);`, path.join(dir, 'genealogy.sqlite'), q));
const one = q => sql(q)[0] || {};

/* ── petits fabricants : tar (ustar), .gpkg, image ── */
function tarEntry(name, data, type = '0') {
    const h = Buffer.alloc(512);
    h.write(name.slice(0, 100), 0, 'utf8');
    h.write('0000644\0', 100); h.write('0000000\0', 108); h.write('0000000\0', 116);
    h.write(data.length.toString(8).padStart(11, '0') + '\0', 124); h.write('00000000000\0', 136);
    h.write('        ', 148); h.write(type, 156); h.write('ustar\0', 257); h.write('00', 263);
    let sum = 0; for (const b of h) sum += b; h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148);
    return Buffer.concat([h, data, Buffer.alloc((512 - (data.length % 512)) % 512)]);
}
const tarGz = entries => zlib.gzipSync(Buffer.concat([...entries.map(([n, d, t]) => tarEntry(n, d, t)), Buffer.alloc(1024)]));
// une vraie petite image JPEG (1 × 1)
const JPEG = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');
const grampsXml = fs.readFileSync(path.join(FIX, 'gramps-famille.gramps.xml'));
const grampsGz = zlib.gzipSync(grampsXml);

{
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p->exec("INSERT INTO persons(first_name,last_name,gender) VALUES('Joseph','Martin','male')"); $p = null;
require 'lib/bootstrap.php'; db(); echo 'ok';`], { cwd: appRoot, encoding: 'utf8', env: envFor(dir) });
    if (r.status !== 0 || !/ok$/.test(r.stdout)) { console.error(r.stderr || r.stdout); process.exit(1); }
}
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });

(async () => {
    console.log('Imports Gramps, Ancestry, MyHeritage, ADN');
    // ── 1. sûreté, sans serveur ──
    const lib = `require 'lib/paths.php'; require 'lib/bootstrap.php'; require 'lib/gedcom.php'; require 'lib/imports.php';`;
    await step('XML : ENTITY et DOCTYPE inattendu refusés, DOCTYPE standard de Gramps accepté', () => {
        const out = php(`${lib} foreach ([$argv[1], $argv[2], $argv[3]] as $x) { try { gramps_dom($x); echo "ok\\n"; } catch (Throwable $e) { echo 'non: ', $e->getMessage(), "\\n"; } }`,
            '<?xml version="1.0"?><!DOCTYPE database [<!ENTITY x SYSTEM "file:///etc/passwd">]><database>&x;</database>',
            '<?xml version="1.0"?><!DOCTYPE database SYSTEM "http://evil.example/x.dtd"><database/>',
            grampsXml.toString('utf8'));
        const l = out.trim().split('\n');
        assert.match(l[0], /^non: .*ENTITY/); assert.match(l[1], /^non: .*DOCTYPE/); assert.equal(l[2], 'ok');
    });
    await step('chemins : « ../ », absolus et lecteurs Windows refusés', () => {
        const out = php(`${lib} foreach (['photos/a.jpg', '../a.jpg', 'a/../../b', '/etc/passwd', 'C:/x.jpg', "a\\0b"] as $p) { echo json_encode(gramps_safe_relpath($p)), "\\n"; }`);
        assert.deepEqual(out.trim().split('\n'), ['"photos\\/a.jpg"', 'null', 'null', 'null', 'null', 'null']);
    });
    await step('bombe gzip refusée sans tout ouvrir ; bombe tar et entrée « ../ » refusées', () => {
        const bomb = path.join(tmp, 'bombe.gramps'); fs.writeFileSync(bomb, zlib.gzipSync(Buffer.alloc(80 * 1048576, 32), { level: 9 }));
        const out1 = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-d', 'memory_limit=128M', '-r', `${lib} try { gramps_read_file($argv[1]); echo 'lu'; } catch (Throwable $e) { echo 'non: ', $e->getMessage(); }`, bomb], { cwd: appRoot, encoding: 'utf8', env: envFor(dir) });
        assert.match(out1.stdout, /^non: .*anormalement gros/, out1.stderr);
        const tarBomb = path.join(tmp, 'bombe.gpkg'); fs.writeFileSync(tarBomb, tarGz([['data.gramps', grampsGz], ['photos/zero.jpg', Buffer.alloc(260 * 1048576)]]));
        const evil = path.join(tmp, 'evil.gpkg'); fs.writeFileSync(evil, tarGz([['data.gramps', grampsGz], ['../../evil.jpg', JPEG]]));
        const out2 = php(`${lib} foreach ([$argv[1], $argv[2]] as $f) { $d = sys_get_temp_dir().'/t'.bin2hex(random_bytes(4)); mkdir($d); try { gramps_unpack_gpkg($f, $d); echo "ouvert\\n"; } catch (Throwable $e) { echo 'non: ', $e->getMessage(), "\\n"; } imports_rmdir($d); }`, tarBomb, evil);
        const l = out2.trim().split('\n');
        assert.match(l[0], /^non: .*anormal/); assert.match(l[1], /^non: .*chemin interdit/);
        assert.ok(!fs.existsSync(path.join(os.tmpdir(), 'evil.jpg')), 'rien n’est écrit hors du dossier');
    });
    await step('fichier ADN brut reconnu (23andMe, Ancestry), un export de correspondances non', () => {
        const out = php(`${lib} foreach (array_slice($argv, 1) as $f) { echo dna_is_raw_text(file_get_contents($f)) ? 'brut' : 'liste', "\\n"; }`,
            path.join(FIX, 'adn-brut-23andme.txt'), path.join(FIX, 'adn-brut-ancestry.txt'), path.join(FIX, 'adn-myheritage-correspondances.csv'), path.join(FIX, 'adn-23andme-relatives.csv'));
        assert.deepEqual(out.trim().split('\n'), ['brut', 'brut', 'liste', 'liste']);
    });

    // ── 2-4. par le serveur ──
    const port = Number(process.env.IMPORTS_PORT) || await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env: envFor(dir), stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
    let cookie = '';
    const html = await (await fetch(base).then(r => { cookie = (r.headers.get('set-cookie') || '').split(';')[0]; return r; })).text();
    const csrf = JSON.parse(html.match(/window\.INSTALL_CSRF = ("[^"]*")/)[1]);
    const post = async (action, body) => { const r = await fetch(`${base}api.php?action=${action}`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ ...body, csrf }) }); return { status: r.status, body: await r.json() }; };
    const upload = async (action, buf, name) => { const fd = new FormData(); fd.append('file', new Blob([buf]), name); fd.append('csrf', csrf); const r = await fetch(`${base}api.php?action=${action}`, { method: 'POST', headers: { Cookie: cookie, 'X-CSRF-Token': csrf }, body: fd }); return { status: r.status, body: await r.json() }; };
    const importTree = async (buf, name) => { const p = await upload('import_preview', buf, name); assert.equal(p.status, 200, JSON.stringify(p.body)); const r = await post('import_pending', { token: p.body.token }); assert.equal(r.status, 200, JSON.stringify(r.body)); return { preview: p.body, ...r.body }; };
    const count = t => Number(one(`SELECT count(*) AS n FROM ${t}`).n);
    let browserOk = true;
    try {
        await step('Gramps (.gramps) : aperçu puis import complet', async () => {
            const res = await importTree(grampsGz, 'famille.gramps');
            const p = res.preview;
            assert.equal(p.producer, 'gramps'); assert.equal(p.persons, 4); assert.equal(p.families, 1); assert.equal(p.places, 6); assert.equal(p.witnesses, 3);
            assert.ok(p.notices.some(n => /\.gpkg/.test(n.text)), 'conseil du paquet .gpkg pour les photos');
            assert.ok(!p.notices.some(n => /\(s\)/.test(n.text)), 'jamais « (s) »');
            assert.equal(res.stats.persons, 4); assert.ok(res.undo, 'jeton pour ↶ Annuler');
            const yves = one("SELECT * FROM persons WHERE first_name='Yves Marie' AND last_name='Morvan'");
            assert.equal(yves.gender, 'male'); assert.equal(yves.physical_description, 'Grand, yeux bleus');
            assert.equal(one("SELECT is_private FROM persons WHERE first_name='Hervé'").is_private, 1, 'priv="1" → confidentielle');
            const variants = sql(`SELECT type, first_name, last_name FROM name_variants WHERE person_id IN (SELECT id FROM persons WHERE last_name IN ('Morvan','Le Goff'))`);
            assert.ok(variants.some(v => v.type === 'nickname' && v.first_name === 'Le Grand'), 'surnom');
            assert.ok(variants.some(v => v.type === 'variant' && v.first_name === 'Yvon'), 'autre nom');
            assert.ok(variants.some(v => v.type === 'historical' && v.first_name === 'Anne' && v.last_name === 'Morvan'), 'nom d’épouse');
            const ev = sql(`SELECT t.label, e.date_text, e.date_calendar, e.title, e.cause, pl.name, pl.county, pl.state, pl.country, pl.subdivision, pl.latitude, pl.longitude, pl.alternate_names, pl.description FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id WHERE e.person_id=${yves.id} OR e.family_id IN (SELECT id FROM families WHERE partner1_id=${yves.id})`);
            const by = l => ev.find(e => e.label === l) || {};
            assert.equal(by('Naissance').date_text, '14 mars 1852'); assert.equal(by('Naissance').subdivision, 'Kerguélen'); assert.equal(by('Naissance').name, 'Plouvien');
            assert.ok(Math.abs(by('Naissance').latitude - 48.5333) < 0.01 && by('Naissance').longitude < -4.4, 'coordonnées en degrés-minutes-secondes');
            assert.equal(by('Baptême').county, 'Finistère'); assert.equal(by('Baptême').state, 'Bretagne'); assert.equal(by('Baptême').country, 'France');
            assert.equal(by('Baptême').alternate_names, 'Ploe-Wien'); assert.equal(by('Baptême').description, 'Commune du pays des Abers.');
            assert.equal(by('Décès').date_text, 'vers 1921'); assert.equal(by('Décès').cause, 'Fluxion de poitrine');
            assert.equal(by('Profession').title, 'Goémonier'); assert.equal(by('Profession').date_text, 'de 1880 à 1910');
            assert.equal(by('Service militaire').date_text, 'pendant la guerre de 1870');
            assert.equal(by('Mariage').date_calendar, 'julian');
            assert.ok(ev.some(e => e.label === 'Couleur des cheveux' && e.title === 'Roux'), 'attribut libre gardé');
            const w = sql(`SELECT w.note, p.first_name FROM event_witnesses w JOIN persons p ON p.id=w.person_id ORDER BY w.id`);
            assert.ok(w.some(x => x.note === 'Marraine' && x.first_name === 'Anne'), 'marraine du baptême');
            assert.ok(w.some(x => x.note === 'Témoin' && x.first_name === 'Hervé'), 'témoin du mariage');
            assert.ok(w.some(x => x.note === 'Parrain' && x.first_name === 'Yves Marie'), 'parrain');
            const kid = one(`SELECT relation_to_partner1 AS r1 FROM family_children fc JOIN persons p ON p.id=fc.child_id WHERE p.first_name='Hervé'`);
            assert.equal(kid.r1, 'adopted');
            const labels = sql(`SELECT l.name, l.color FROM labels l`);
            assert.ok(labels.some(l => l.name === 'Branche Morvan' && l.color === '#0080ff'), 'étiquette et sa couleur');
            const src = one(`SELECT * FROM sources WHERE title LIKE 'Registres paroissiaux de Plouvien%'`);
            assert.equal(src.agency, 'Archives départementales imaginaires'); assert.match(src.text, /3 E 999\/12/);
            assert.ok(sql(`SELECT page, quality FROM source_links WHERE source_record_id=${src.id}`).some(c => c.page === 'Vue 45' && c.quality === '3'), 'citation');
            assert.ok(sql(`SELECT body FROM notes WHERE entity_type='person' AND entity_id=${yves.id}`).some(n => /deux barques/.test(n.body) && /cousin@exemple/.test(n.body)), 'note (avec « @ »)');
            assert.equal(count('media'), 0, 'un .gramps seul ne contient pas les photos');
            assert.ok(res.stats.warnings.some(x => /chemin interdit/.test(x)), 'média au chemin « .. » signalé');
            const u = await post('import_undo', { token: res.undo });
            assert.equal(u.status, 200, JSON.stringify(u.body));
            assert.equal(count('persons'), 1); assert.equal(count('event_witnesses'), 0); assert.equal(count('labels'), 0);
            const again = await post('import_undo', { token: res.undo }); assert.equal(again.status, 422, 'une seule fois');
        });
        await step('Gramps (.gpkg) : photo du paquet copiée et portrait, chemin absolu rangé dans le paquet', async () => {
            const xml = grampsXml.toString('utf8').replace('src="photos/yves-morvan.jpg"', 'src="/home/testeur/photos-de-famille/yves-morvan.jpg"');
            const pkg = tarGz([['data.gramps', zlib.gzipSync(Buffer.from(xml))], ['home/testeur/photos-de-famille/yves-morvan.jpg', JPEG], ['autre/yves-morvan.jpg', Buffer.from('pas la bonne')]]);
            const res = await importTree(pkg, 'famille.gpkg');
            assert.equal(res.preview.media_local, 2);
            assert.equal(res.stats.media, 1); assert.equal(res.stats.portraits, 1);
            const m = one(`SELECT m.filename, m.title FROM persons p JOIN media m ON m.id=p.portrait_media_id WHERE p.first_name='Yves Marie'`);
            assert.equal(m.title, 'Yves Morvan vers 1900');
            assert.deepEqual(fs.readFileSync(path.join(dir, 'media', m.filename)), JPEG, 'le bon fichier (par son chemin, pas par son nom)');
            const u = await post('import_undo', { token: res.undo }); assert.equal(u.status, 200);
            assert.ok(!fs.existsSync(path.join(dir, 'media', m.filename)), 'le fichier copié est retiré avec l’import');
            assert.equal(count('persons'), 1);
        });
        await step('paquet .gpkg avec une entrée « ../ » : refusé en entier', async () => {
            const p = await upload('import_preview', tarGz([['data.gramps', grampsGz], ['../evil.jpg', JPEG]]), 'evil.gpkg');
            assert.equal(p.status, 422); assert.match(p.body.error, /chemin interdit/);
            const p2 = await upload('import_preview', Buffer.from('x'), 'base.db'); assert.equal(p2.status, 422);
        });
        await step('GEDCOM d’Ancestry : logiciel, _APID, _MTTAG, _MARNM, _UID, photos en ligne gardées comme liens', async () => {
            const res = await importTree(fs.readFileSync(path.join(FIX, 'ancestry-famille.ged')), 'ancestry-famille.ged');
            assert.equal(res.preview.producer, 'ancestry'); assert.equal(res.preview.media_remote, 2);
            assert.equal(res.stats.producer_label, 'Ancestry'); assert.equal(res.stats.media, 0); assert.equal(res.stats.media_links, 2); assert.equal(res.stats.media_missing, 0);
            const b = one(`SELECT * FROM persons WHERE first_name='Baptiste'`);
            assert.equal(b.unique_id, '4F2A9C1E7B3D4E5F8A6B9C0D1E2F3A4B');
            const ev = sql(`SELECT t.label, e.date_text, e.title, e.description FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=${b.id}`);
            const by = l => ev.find(e => e.label === l) || {};
            assert.equal(by('Naissance').date_text, 'vers 1840'); assert.equal(by('Décès').date_text, '12 mars 1911');
            assert.equal(by('Profession').date_text, 'entre 1870 et 1890'); assert.equal(by('Cause du décès').title, 'Pneumonie');
            assert.equal(by('Service militaire').description, '3e régiment de zouaves');
            assert.equal(one(`SELECT e.date_text FROM events e JOIN persons p ON p.id=e.person_id JOIN event_types t ON t.id=e.event_type_id WHERE p.first_name='Rosalie' AND t.label='Naissance'`).date_text, '4 mars 1845');
            assert.ok(sql(`SELECT note FROM source_links`).some(c => /ancestry\.com\/discoveryui-content\/view\/123456789:61092/.test(c.note)), 'lien _APID');
            assert.deepEqual(sql(`SELECT l.name FROM label_links ll JOIN labels l ON l.id=ll.label_id WHERE ll.entity_type='person' AND ll.entity_id=${b.id} ORDER BY l.name`).map(x => x.name), ['Ancêtre direct', 'Militaire']);
            assert.ok(sql(`SELECT * FROM name_variants WHERE type='historical' AND first_name='Rosalie' AND last_name='Delmas'`).length, '_MARNM');
            const n = one(`SELECT title, body FROM notes WHERE entity_type='person' AND entity_id=${b.id} AND title LIKE '🔗%'`);
            assert.match(n.title, /Ancestry/); assert.match(n.body, /^Baptiste Delmas en uniforme : https:\/\/mediasvc\.ancestry\.com/);
            assert.equal(fs.readdirSync(path.join(dir, 'media')).length, 0, 'rien de téléchargé');
            assert.ok(sql(`SELECT w.note FROM event_witnesses w JOIN persons p ON p.id=w.person_id WHERE p.first_name='Jean'`).some(x => x.note === 'Parrain'), 'ASSO sous le baptême');
            assert.equal(one(`SELECT relation_to_partner1 AS r1, relation_to_partner2 AS r2 FROM family_children fc JOIN persons p ON p.id=fc.child_id WHERE p.first_name='Louise'`).r1, 'adopted');
            assert.ok(sql(`SELECT body FROM notes WHERE title='Coordonnées'`).some(x => /ancien\.cousin@exemple\.invalid/.test(x.body)));
            await post('import_undo', { token: res.undo });
        });
        await step('GEDCOM de MyHeritage : RESN, _MARNM, lien de la citation, lieux, photo en ligne', async () => {
            const res = await importTree(fs.readFileSync(path.join(FIX, 'myheritage-famille.ged')), 'myheritage-famille.ged');
            assert.equal(res.preview.producer, 'myheritage'); assert.equal(res.stats.media_links, 1);
            assert.equal(one(`SELECT is_private FROM persons WHERE first_name='Henri'`).is_private, 1);
            assert.ok(sql(`SELECT * FROM name_variants WHERE first_name='Albertine' AND last_name='Fabre'`).length);
            const c = one(`SELECT note, page FROM source_links WHERE page='Naissance n° 412'`);
            assert.match(c.note, /fils de Gaston/); assert.match(c.note, /myheritage\.fr\/research/); assert.match(c.note, /3 mai 1920/);
            assert.deepEqual(one(`SELECT pl.name, pl.county, pl.country FROM events e JOIN places pl ON pl.id=e.place_id JOIN persons p ON p.id=e.person_id WHERE p.first_name='Henri' LIMIT 1`), { name: 'Toulouse', county: 'Haute-Garonne', country: 'France' });
            assert.equal(one(`SELECT e.title FROM events e JOIN event_types t ON t.id=e.event_type_id JOIN persons p ON p.id=e.person_id WHERE p.first_name='Gaston' AND t.label='Service militaire'`).title, 'Combattant de la Grande Guerre');
            await post('import_undo', { token: res.undo });
        });
        await step('GEDCOM écrit par Gramps : sans perte notable (lieux en 5 morceaux, types en anglais, noms, julien)', async () => {
            const res = await importTree(fs.readFileSync(path.join(FIX, 'gramps-export.ged')), 'gramps-export.ged');
            assert.equal(res.preview.producer, 'gramps'); assert.equal(res.preview.media_local, 0, 'le « 1 FILE » de l’en-tête n’est pas un média');
            const pl = one(`SELECT pl.* FROM events e JOIN places pl ON pl.id=e.place_id JOIN persons p ON p.id=e.person_id JOIN event_types t ON t.id=e.event_type_id WHERE p.first_name='Yves Marie' AND t.label='Naissance'`);
            assert.deepEqual([pl.name, pl.county, pl.state, pl.country, pl.subdivision], ['Plouvien', 'Finistère', 'Bretagne', 'France', 'Kerguélen']);
            assert.ok(sql(`SELECT t.label FROM events e JOIN event_types t ON t.id=e.event_type_id JOIN persons p ON p.id=e.person_id WHERE p.first_name='Yves Marie'`).some(x => x.label === 'Service militaire'));
            assert.equal(one(`SELECT e.date_calendar FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE t.gedcom_tag='MARR' ORDER BY e.id DESC LIMIT 1`).date_calendar, 'julian');
            assert.equal(one(`SELECT count(*) AS n FROM name_variants v JOIN persons p ON p.id=v.person_id WHERE p.first_name IN ('Yves Marie','Anne')`).n, 3);
            await post('import_undo', { token: res.undo });
        });
        await step('« Fusionner un arbre » accepte un fichier Gramps', async () => {
            const r = await upload('merge_gedcom_analyse', grampsGz, 'cousin.gramps');
            assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.rows.length, 4);
        });
        await step('ADN : fichier brut refusé, correspondances et segments importés puis annulés', async () => {
            const kit = (await post('save_dna_kit', { label: 'Mon test', company: 'MyHeritage', test_type: 'autosomal' })).body.result.id;
            const raw = await post('import_dna_matches', { kit_id: kit, rows: Array.from({ length: 10 }, (_, i) => ({ name: 'rs' + (1000 + i), shared_cm: 0 })) });
            assert.equal(raw.status, 422); assert.match(raw.body.error, /brut/);
            const a = await post('import_dna_matches', { kit_id: kit, rows: [{ name: 'Camille Imaginaire', shared_cm: 212.4, segments: 9, data: { mrca: 'Baptiste Delmas', profile_url: 'https://exemple.invalid/1', company: 'MyHeritage' } }, { name: 'Lucas Fictif', shared_cm: 48.7 }] });
            assert.equal(a.status, 200); assert.equal(a.body.result.added, 2);
            const b = await post('import_dna_matches', { kit_id: kit, rows: [{ name: 'Camille Imaginaire', shared_cm: 215, segments: 10 }, { name: 'Inès Inventée', shared_cm: 1021.5 }] });
            assert.equal(b.body.result.added, 1); assert.equal(b.body.result.updated, 1);
            assert.equal(one(`SELECT shared_cm FROM dna_matches WHERE name='Camille Imaginaire'`).shared_cm, 215);
            assert.match(one(`SELECT data_json FROM dna_matches WHERE name='Camille Imaginaire'`).data_json, /profile_url/);
            const ub = await post('undo_dna_import', { token: b.body.result.undo }); assert.equal(ub.status, 200);
            assert.equal(one(`SELECT shared_cm FROM dna_matches WHERE name='Camille Imaginaire'`).shared_cm, 212.4, 'remise comme avant');
            assert.equal(count('dna_matches'), 2);
            const s1 = await post('save_dna_segments', { kit_id: kit, receipt: 1, rows: [{ label: 'Camille Imaginaire', chromosome: '3', start: 45120333, end: 98543221, cm: 58.1 }] });
            const s2 = await post('save_dna_segments', { kit_id: kit, receipt: 1, replace: 1, rows: [{ label: 'Lucas Fictif', chromosome: '7', start: 120000000, end: 141000000, cm: 22 }] });
            assert.equal(count('dna_segments'), 1);
            await post('undo_dna_import', { token: s2.body.result.undo });
            assert.equal(one(`SELECT label FROM dna_segments`).label, 'Camille Imaginaire', 'le remplacement est défait');
            await post('undo_dna_import', { token: s1.body.result.undo }); assert.equal(count('dna_segments'), 0);
            await post('undo_dna_import', { token: a.body.result.undo }); assert.equal(count('dna_matches'), 0);
        });

        // ── 5. navigateur ──
        let pw = null;
        for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
        if (!pw) { console.log('  – navigateur : sauté (Playwright absent)'); }
        else {
            const browser = await pw.chromium.launch();
            const errors = [];
            try {
                const ctx = await browser.newContext({ viewport: { width: 1300, height: 900 } });
                const page = await ctx.newPage();
                page.on('pageerror', e => errors.push('pageerror: ' + e.message));
                page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
                await step('Réglages → Import → « ⤒ Importer un arbre… » : ce qui va entrer, import, ↶ Annuler', async () => {
                    await page.goto(base + '#maintenance/import');
                    await page.waitForSelector('[data-import-tree]', { timeout: 30000 });
                    await page.click('[data-import-tree]');
                    await page.waitForSelector('.k-import input[type=file]', { state: 'attached' });
                    const gpkg = path.join(tmp, 'famille.gpkg'); fs.writeFileSync(gpkg, tarGz([['data.gramps', grampsGz], ['photos/yves-morvan.jpg', JPEG]]));
                    await page.setInputFiles('.k-import input[type=file]', gpkg);
                    await page.waitForSelector('.k-import [data-k-go]:not([disabled])', { timeout: 20000 });
                    const txt = await page.textContent('.k-import [data-k-body]');
                    assert.match(txt, /Voilà ce qui va entrer : 4 personnes/); assert.match(txt, /Gramps/); assert.match(txt, /6 lieux/);
                    assert.match(await page.textContent('.k-import [data-k-go]'), /Importer 4 personnes/);
                    await page.click('.k-import [data-k-go]');
                    await page.waitForSelector('.k-import', { state: 'detached', timeout: 30000 });
                    await page.waitForFunction(() => /4 personnes importées/.test(document.body.textContent));
                    assert.equal(count('persons'), 5);
                    assert.match(await page.textContent('#import-tree-result'), /4 personnes/);
                    await page.click('button:has-text("↶ Annuler")');
                    await page.waitForFunction(() => /annulé/.test(document.querySelector('#import-tree-result')?.textContent || ''), null, { timeout: 15000 });
                    assert.equal(count('persons'), 1);
                });
                await step('ADN : les exports des 5 sociétés reconnus, fichiers bruts refusés, 23andMe importé', async () => {
                    await page.evaluate(() => { window.LCNDA_APP.state.adnTab = 'matches'; window.LCNDA_APP.setModule('adn'); });
                    await page.waitForSelector('[data-dna-import]', { timeout: 20000 });
                    const want = { 'adn-myheritage-correspondances.csv': [/3 correspondances/, /MyHeritage/], 'adn-myheritage-segments.csv': [/3 segments/, /MyHeritage/], 'adn-23andme-relatives.csv': [/2 correspondances et 3 segments/, /23andMe/],
                        'adn-ftdna-correspondances.csv': [/2 correspondances/, /FamilyTreeDNA/], 'adn-ftdna-segments.csv': [/3 segments/, /FamilyTreeDNA/], 'adn-gedmatch-correspondances.csv': [/2 correspondances/, /GEDmatch/],
                        'adn-gedmatch-segments.csv': [/2 segments/, /GEDmatch/], 'adn-ancestry-correspondances.csv': [/2 correspondances/, /Ancestry/], 'adn-brut-23andme.txt': [/fichier ADN brut/], 'adn-brut-ancestry.txt': [/fichier ADN brut/]};
                    for (const [file, rx] of Object.entries(want)) {
                        await page.click('[data-dna-import]');
                        await page.waitForSelector('.k-import input[type=file]', { state: 'attached' });
                        await page.setInputFiles('.k-import input[type=file]', path.join(FIX, file));
                        await page.waitForFunction(() => { const b = document.querySelector('.k-import [data-k-body]'); return b && !b.querySelector('.ui-spin') && /Voilà|ne peut pas/.test(b.textContent); }, null, { timeout: 15000 });
                        const t = await page.textContent('.k-import [data-k-body]');
                        for (const r of rx) assert.match(t, r, `${file} : ${t.slice(0, 200)}`);
                        if (file === 'adn-23andme-relatives.csv') {
                            await page.click('.k-import [data-k-go]');
                            await page.waitForSelector('.k-import', { state: 'detached', timeout: 20000 });
                            assert.equal(count('dna_segments'), 3);
                            const m = one(`SELECT * FROM dna_matches WHERE name='Émile Exemple'`);
                            assert.ok(Math.abs(m.shared_cm - 80.4) < 0.01, 'cM additionnés des segments'); assert.equal(m.segments, 2); assert.equal(m.side, 'paternal');
                            assert.match(m.data_json, /you\.23andme\.com/); assert.match(m.data_json, /R1b-U106/);
                        } else await page.click('.k-import [data-k-x]');
                        await page.waitForSelector('.k-import', { state: 'detached' });
                    }
                    assert.equal(count('dna_matches'), 2, 'rien d’autre n’est entré');
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
