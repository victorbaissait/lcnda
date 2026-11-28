'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * GEDCOM « à toute épreuve » :   node tests/test-gedcom-robustesse.js
 * Un vrai « php -S » sur une base neuve (dossiers temporaires). Noms inventés (MAZAUD, LACOMBE, DURAND).
 *  1. ticket #7 : la personne de départ (Sosa 1) après l'import — un fichier « à la Geneanet » où le père vient avant
 *     la personne ; marques d'autres logiciels (_ROOT de Family Historian, _HOME d'Ahnenblatt, _HME de GEDitCOM,
 *     _SOSA, _SOSAN, _SOSADABOVILLE d'Ancestris) ; base qui avait déjà une personne de départ : gardée, l'autre proposée ;
 *     même fichier importé deux fois ; « ↶ Annuler » ;
 *  2. quelqu'un qui fait n'importe quoi : fichier vide, octets au hasard, photo renommée .ged, une seule ligne énorme,
 *     sans TRLR, sans HEAD, fins de ligne CRLF / CR, BOM, ANSEL, Windows-1252, UTF-16 LE / BE, niveaux qui sautent,
 *     niveaux négatifs ou absurdes, retours à la ligne dans un texte, identifiants en double, pointeurs vers rien,
 *     familles en boucle, quelqu'un mari et femme, enfant de lui-même, noms vides ou « // », octets nuls, noms et notes
 *     immenses, dates impossibles ou étranges (31 FEB, ABT, BET, républicain, julien, futur, an 0, négatif, texte),
 *     lieux à 20 virgules, balises inconnues, CONC / CONT n'importe où, médias avec « ../ », C:\…, /etc/passwd
 *     (jamais lus), GEDCOM 5.5, 5.5.1 et 7.0 (@VOID@, SNOTE, SCHMA, EXID, NO, PHRASE, SDATE, TRAN, CROP, MIME, @@) ;
 *     rien ne casse, une phrase claire en français, des données sensées ;
 *  3. exports 5.5.1 et 7.0 : valables (règles officielles GEDCOM 7 de FamilySearch, tests/gedcom7-valide.js ; contrôle
 *     de structure en 5.5.1), et la personne de départ revient après un aller-retour dans les deux versions ;
 *  4. 50 000 fiches : import en un temps raisonnable.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');
const { gedcom7Errors, gedcom551Errors } = require('./gedcom7-valide');

const appRoot = path.resolve(__dirname, '..');
const phpPath = findPhp([devBundledPhp()]);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-gedrob-'));
const dir = path.join(tmp, 'data');
const envFor = d => ({ ...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1' });
fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
let passed = 0, failed = 0;
async function step(name, fn) { if (process.env.GEDROB_ONLY && !new RegExp(process.env.GEDROB_ONLY).test(name)) return; try { if (typeof fresh === 'function') fresh(); await fn(); passed++; console.log('  ✓ ' + name); } catch (e) { failed++; console.log('  ✗ ' + name + '\n      ' + (e && e.stack ? e.stack.split('\n').slice(0, 5).join('\n      ') : e)); } }
function php(code, ...args) {
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-d', 'memory_limit=512M', '-r', code, ...args], { cwd: appRoot, encoding: 'utf8', env: envFor(dir), maxBuffer: 256 * 1048576 });
    if (r.status !== 0) throw new Error((r.stderr || r.stdout).trim().slice(0, 800));
    return r.stdout;
}
const DB = path.join(dir, 'genealogy.sqlite');
const sql = q => JSON.parse(php(`$d=new PDO('sqlite:'.$argv[1]);$d->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE,PDO::FETCH_ASSOC);echo json_encode($d->query($argv[2])->fetchAll(),JSON_UNESCAPED_UNICODE|JSON_INVALID_UTF8_SUBSTITUTE);`, DB, q));
const one = q => sql(q)[0] || {};
const count = t => Number(one(`SELECT count(*) AS n FROM ${t}`).n);
{
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; db(); echo 'ok';`], { cwd: appRoot, encoding: 'utf8', env: envFor(dir) });
    if (r.status !== 0 || !/ok$/.test(r.stdout)) { console.error(r.stderr || r.stdout); process.exit(1); }
}
// base neuve avant chaque étape (un échec ne se répercute pas sur les suivantes)
const PRISTINE = path.join(tmp, 'neuve.sqlite');
fs.copyFileSync(DB, PRISTINE);
function fresh() { for (const x of ['-wal', '-shm']) fs.rmSync(DB + x, { force: true }); fs.copyFileSync(PRISTINE, DB); }
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });

// ── petits fichiers ──
const HEAD = (vers = '5.5.1', extra = '') => `0 HEAD\n1 SOUR ESSAI\n1 GEDC\n2 VERS ${vers}\n${vers.startsWith('7') ? '' : '2 FORM LINEAGE-LINKED\n1 CHAR UTF-8\n'}${extra}`;
const ged = (body, vers, extra) => HEAD(vers, extra) + body.replace(/^\n/, '') + (body.endsWith('\n') ? '' : '\n') + '0 TRLR\n';
// trois générations : le père d'abord (comme Geneanet), puis la mère, la personne, sa sœur, les grands-parents
const FAMILLE = `0 @I1@ INDI
1 NAME Pierre /MAZAUD/
1 SEX M
1 BIRT
2 DATE 1950
1 FAMC @F2@
1 FAMS @F1@
0 @I2@ INDI
1 NAME Anne /LACOMBE/
1 SEX F
1 FAMS @F1@
0 @I3@ INDI
1 NAME Julien /MAZAUD/
1 SEX M
1 BIRT
2 DATE 12 MAR 1980
1 FAMC @F1@
0 @I4@ INDI
1 NAME Claire /MAZAUD/
1 SEX F
1 BIRT
2 DATE 1985
1 FAMC @F1@
0 @I5@ INDI
1 NAME Louis /MAZAUD/
1 SEX M
1 FAMS @F2@
0 @I6@ INDI
1 NAME Rose /DURAND/
1 SEX F
1 FAMS @F2@
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 CHIL @I3@
1 CHIL @I4@
0 @F2@ FAM
1 HUSB @I5@
1 WIFE @I6@
1 CHIL @I1@
`;
const JPG = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');

(async () => {
    console.log(`Test GEDCOM à toute épreuve (${phpPath})`);
    const port = Number(process.env.GEDROB_PORT) || await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-d', 'memory_limit=4096M', '-d', 'upload_max_filesize=512M', '-d', 'post_max_size=512M', '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env: envFor(dir), stdio: ['ignore', 'ignore', 'pipe'] });
    let serverErr = ''; proc.stderr.on('data', d => { serverErr += d; if (serverErr.length > 200000) serverErr = serverErr.slice(-100000); });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
    let cookie = '';
    const html = await (await fetch(base).then(r => { cookie = (r.headers.get('set-cookie') || '').split(';')[0]; return r; })).text();
    const csrf = JSON.parse(html.match(/window\.INSTALL_CSRF = ("[^"]*")/)[1]);
    const json = async r => { const t = await r.text(); try { return JSON.parse(t); } catch (_) { return { error: 'RÉPONSE NON JSON : ' + t.slice(0, 300) }; } };
    const post = async (action, body) => { const r = await fetch(`${base}api.php?action=${action}`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ ...body, csrf }) }); return { status: r.status, body: await json(r) }; };
    const get = q => fetch(`${base}api.php?${q}`, { headers: { Cookie: cookie } });
    const upload = async (action, buf, name) => { const fd = new FormData(); fd.append('file', new Blob([buf]), name); fd.append('csrf', csrf); const r = await fetch(`${base}api.php?action=${action}`, { method: 'POST', headers: { Cookie: cookie, 'X-CSRF-Token': csrf }, body: fd }); return { status: r.status, body: await json(r) }; };
    /** aperçu puis import ; rend { status, preview, stats, undo, error } sans rien affirmer */
    const tryImport = async (content, name = 'arbre.ged') => {
        const buf = Buffer.isBuffer(content) ? content : Buffer.from(content);
        const p = await upload('import_preview', buf, name);
        if (p.status !== 200) return { status: p.status, step: 'preview', error: p.body.error, preview: p.body };
        const r = await post('import_pending', { token: p.body.token });
        return { status: r.status, step: 'import', error: r.body.error, preview: p.body, stats: r.body.stats || {}, undo: r.body.undo };
    };
    const importOk = async (content, name) => { const r = await tryImport(content, name); assert.equal(r.status, 200, `${name || ''} : ${r.step} ${r.status} ${r.error}`); return r; };
    const undo = async r => { const u = await post('import_undo', { token: r.undo }); assert.equal(u.status, 200, JSON.stringify(u.body)); assert.equal(count('persons'), 0, 'la base revient vide après ↶ Annuler'); };
    const startRow = () => one("SELECT id, first_name, last_name FROM persons WHERE is_start=1");
    const french = e => { assert.ok(e && typeof e === 'string', 'une phrase d’erreur'); assert.doesNotMatch(e, /Fatal|Stack trace|Uncaught|TypeError|on line \d+|\.php/i, 'pas une erreur PHP brute : ' + e); };
    const noPhpError = () => { const bad = serverErr.split('\n').filter(l => /PHP (Fatal|Warning|Deprecated|Notice)|Uncaught/.test(l) && !/sitemap|favicon/.test(l)); assert.deepEqual(bad.slice(0, 5), [], 'erreurs PHP dans le journal du serveur'); };
    const exportGed = async (version, extra = '') => { const r = await get(`action=export_gedcom&gedcom_version=${version}${extra}`); assert.equal(r.status, 200); return r.text(); };

    try {
        // ═══ 1. Sosa 1 ═══
        await step('ticket #7 : fichier à la Geneanet (le père d’abord) → la personne elle-même devient le Sosa 1, avec « pourquoi »', async () => {
            const r = await importOk(ged(FAMILLE, '5.5.1', '1 SOUR Geneanet\n'), 'geneanet.ged');
            const s = startRow();
            assert.equal(`${s.first_name} ${s.last_name}`, 'Julien MAZAUD', 'pas le père (1re fiche), pas la sœur cadette');
            assert.deepEqual([r.stats.start_person?.name, r.stats.start_person?.why, Number(r.stats.start_person?.id)], ['Julien MAZAUD', 'ancestors', Number(s.id)]);
            assert.equal(Number(one('SELECT count(*) n FROM persons WHERE is_start=1').n), 1);
            const boot = await (await get('action=bootstrap')).json();
            assert.equal(Number(boot.startPersonId), Number(s.id)); assert.equal(boot.startPersonFlagged, true);
            await undo(r);
        });
        for (const [label, extraHead, indiTag, why] of [
            ['_ROOT de Family Historian (dans l’en-tête)', '1 _ROOT @I4@\n', '', 'header'],
            ['_HOME d’Ahnenblatt', '1 _HOME @I4@\n', '', 'header'],
            ['_HME de GEDitCOM', '1 _HME @I4@\n', '', 'header'],
            ['_ROOT vers une famille (ignoré) puis _HOME', '1 _ROOT @F1@\n1 _HOME @I4@\n', '', 'header'],
            ['_SOSA 1', '', '1 _SOSA 1', 'sosa'],
            ['_SOSAN 00001+ (Ancestris ancien)', '', '1 _SOSAN 00001+', 'sosa'],
            ['_SOSADABOVILLE 1 G1 (Ancestris)', '', '1 _SOSADABOVILLE 1 G1', 'sosa'],
        ]) {
            await step(`marque du fichier respectée : ${label}`, async () => {
                const body = indiTag ? FAMILLE.replace('1 NAME Claire /MAZAUD/', `1 NAME Claire /MAZAUD/\n${indiTag}`).replace('1 NAME Pierre /MAZAUD/', '1 NAME Pierre /MAZAUD/\n1 _SOSA 2') : FAMILLE;
                const r = await importOk(ged(body, '5.5.1', extraHead));
                assert.equal(startRow().first_name, 'Claire'); assert.equal(r.stats.start_person.why, why);
                await undo(r);
            });
        }
        await step('marque vers une fiche absente : ignorée, on retombe sur la personne qui a le plus d’ancêtres', async () => {
            const r = await importOk(ged(FAMILLE, '5.5.1', '1 _ROOT @I999@\n'));
            assert.equal(startRow().first_name, 'Julien'); await undo(r);
        });
        await step('fichier sans aucune famille : la première fiche devient la personne de départ (et le résumé le dit)', async () => {
            const r = await importOk(ged('0 @I1@ INDI\n1 NAME Paul /DURAND/\n0 @I2@ INDI\n1 NAME Marie /DURAND/\n'));
            assert.equal(startRow().first_name, 'Paul'); assert.equal(r.stats.start_person.why, 'first'); await undo(r);
        });
        await step('base qui a déjà sa personne de départ : gardée ; la personne n°1 du fichier est seulement proposée', async () => {
            const a = await importOk(ged(FAMILLE.replace(/MAZAUD/g, 'LACOMBE').replace('/LACOMBE/\n1 SEX F\n1 FAMS', '/DURAND/\n1 SEX F\n1 FAMS')), 'a.ged');
            const before = startRow(); assert.equal(`${before.first_name} ${before.last_name}`, 'Julien LACOMBE');
            const b = await importOk(ged(FAMILLE, '5.5.1', '1 _ROOT @I4@\n'), 'b.ged');
            assert.equal(Number(startRow().id), Number(before.id), 'la personne de départ ne bouge pas');
            assert.equal(b.stats.start_person, undefined);
            assert.deepEqual([Number(b.stats.start_kept.id), b.stats.start_kept.name], [Number(before.id), 'Julien LACOMBE']);
            assert.equal(b.stats.start_suggested.name, 'Claire MAZAUD');
            // « Changer… » : la proposition s'applique, puis ↶ revient à l'ancienne
            assert.equal((await post('set_start_person', { person_id: b.stats.start_suggested.id })).status, 200);
            assert.equal(startRow().first_name, 'Claire');
            assert.equal((await post('set_start_person', { person_id: before.id })).status, 200);
            assert.equal(Number(startRow().id), Number(before.id));
            const u = await post('import_undo', { token: b.undo }); assert.equal(u.status, 200);
            assert.equal(Number(startRow().id), Number(before.id));
            await undo(a);
        });
        await step('le même fichier importé deux fois : tout en double (dit dans l’aperçu), la personne de départ ne bouge pas, rien à proposer', async () => {
            const a = await importOk(ged(FAMILLE));
            const b = await importOk(ged(FAMILLE));
            assert.equal(count('persons'), 12);
            assert.ok(b.preview.notices.some(n => /déjà 6 fiches/.test(n.text)), JSON.stringify(b.preview.notices));
            assert.equal(Number(b.stats.start_kept.id), Number(a.stats.start_person.id));
            assert.equal(b.stats.start_suggested, undefined, 'le double de la même personne n’est pas proposé');
            await post('import_undo', { token: b.undo }); await undo(a);
        });

        // ═══ 2. n'importe quoi ═══
        for (const [label, buf, name] of [
            ['fichier vide', Buffer.alloc(0), 'vide.ged'],
            ['octets au hasard', Buffer.from(Array.from({ length: 50000 }, (_, i) => (i * 7919 + 13) % 256)), 'hasard.ged'],
            ['une photo JPEG renommée .ged', JPG, 'photo.ged'],
            ['une seule ligne de 6 Mo', Buffer.from('A'.repeat(6 * 1048576)), 'ligne.ged'],
            ['un texte sans rapport', Buffer.from('Bonjour,\nvoici ma liste de courses :\n- pain\n- lait\n'), 'courses.ged'],
            ['un fichier .gedcom avec seulement « 0 TRLR »', Buffer.from('0 TRLR\n'), 'x.gedcom'],
        ]) {
            await step(`refusé avec une phrase claire : ${label}`, async () => {
                const r = await tryImport(buf, name);
                assert.equal(r.status, 422, JSON.stringify(r).slice(0, 300)); french(r.error); assert.match(r.error, /GEDCOM|vide|fichier/i);
                assert.equal(count('persons'), 0);
            });
        }
        await step('sans TRLR, sans HEAD, ou coupé au milieu d’une ligne : importé quand même', async () => {
            for (const [txt, who] of [[ged(FAMILLE).replace('0 TRLR\n', ''), 'Julien'], [FAMILLE, 'Julien'], [ged(FAMILLE).slice(0, ged(FAMILLE).indexOf('1 NAME Rose') + 9), 'Pierre']]) {
                // coupé avant les familles : aucun lien, la première fiche est la personne de départ
                const r = await importOk(txt); assert.ok(r.stats.persons >= 5, String(r.stats.persons)); assert.equal(startRow().first_name, who); await undo(r);
            }
        });
        await step('fins de ligne CRLF, CR seul (vieux Mac), mélangées, BOM UTF-8 : mêmes fiches', async () => {
            const t = ged(FAMILLE.replace('Anne /LACOMBE/', 'Anne-Hélène /LACOMBE/'));
            for (const v of [t.replace(/\n/g, '\r\n'), t.replace(/\n/g, '\r'), t.split('\n').map((l, i) => l + ['\n', '\r\n', '\r'][i % 3]).join(''), '\uFEFF' + t]) {
                const r = await importOk(v);
                assert.deepEqual([r.stats.persons, r.stats.families, r.stats.children_links], [6, 2, 3]);
                assert.ok(one("SELECT count(*) n FROM persons WHERE first_name='Anne-Hélène'").n == 1); await undo(r);
            }
        });
        await step('encodages : UTF-16 LE et BE (avec ou sans BOM), ANSEL, Windows-1252 sans CHAR, « CHAR ANSEL » menteur', async () => {
            const t = ged('0 @I1@ INDI\n1 NAME René /LACOMBE/\n1 NOTE Née à Saint-Étienne, « là-bas »\n');
            const le = Buffer.from(t, 'utf16le');
            const be = Buffer.from(le); for (let i = 0; i < be.length; i += 2) { const x = be[i]; be[i] = be[i + 1]; be[i + 1] = x; }
            const ansel = Buffer.from(t.replace('UTF-8', 'ANSEL').replace('René', 'Ren\u00e2e').replace(/[éÉ«»à]/g, c => ({ 'é': 'e', 'É': 'E', '«': '"', '»': '"', 'à': 'a' })[c]), 'latin1');
            const w1252 = Buffer.from(t.replace('1 CHAR UTF-8\n', ''), 'latin1');
            const fake = Buffer.from(t.replace('UTF-8', 'ANSEL'), 'latin1');
            for (const [k, buf] of Object.entries({ le: Buffer.concat([Buffer.from([0xFF, 0xFE]), le]), leSansBom: le, be: Buffer.concat([Buffer.from([0xFE, 0xFF]), be]), ansel, w1252, fake })) {
                const r = await importOk(buf, k + '.ged');
                assert.equal(one('SELECT first_name f FROM persons').f, 'René', k);
                if (k !== 'ansel') assert.match(one("SELECT body FROM notes WHERE entity_type='person'").body || '', /Née à Saint-Étienne/, k);
                await undo(r);
            }
        });
        await step('niveaux qui sautent (0 → 3), négatifs, absurdes, espaces devant, balises en minuscules, retours à la ligne dans une note', async () => {
            const r = await importOk(ged(`0 @I1@ INDI
3 NAME Jean /MAZAUD/
1 BIRT
3 DATE 1 JAN 1900
-1 NAME Faux /FAUX/
99999999999999999999 NAME Énorme /ÉNORME/
x NAME Lettre /LETTRE/
   1   SEX    M
1 note Première ligne
deuxième ligne tapée sans niveau
troisième
0 @I2@ INDI
1 name Paul /DURAND/
`));
            assert.equal(count('persons'), 2); noPhpError();
            assert.equal(one('SELECT first_name f FROM persons ORDER BY id').f, 'Jean');
            assert.equal(one("SELECT year y FROM events e JOIN persons p ON p.id=e.person_id WHERE p.first_name='Jean'").y, 1900, 'la date rattachée à BIRT');
            assert.equal(one("SELECT gender g FROM persons WHERE first_name='Jean'").g, 'male');
            assert.equal(one("SELECT first_name f FROM persons ORDER BY id DESC").f, 'Paul');
            assert.match(one("SELECT body b FROM notes WHERE entity_type='person'").b, /^Première ligne\ndeuxième ligne tapée sans niveau\ntroisième$/);
            const w = r.stats.warnings.join(' | ');
            assert.match(w, /2 lignes sans numéro de niveau/); assert.match(w, /niveau qui saute/); assert.match(w, /illisibles? .*de côté/);
            await undo(r);
        });
        await step('identifiants en double, pointeurs vers rien, @VOID@ : rien ne casse, avertissement clair', async () => {
            const r = await importOk(ged(`0 @I1@ INDI
1 NAME Jean /MAZAUD/
1 FAMC @F99@
1 FAMS @F1@
1 SOUR @S99@
1 OBJE @M99@
1 NOTE @N99@
1 ASSO @I99@
0 @I1@ INDI
1 NAME Jeanne /MAZAUD/
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I77@
1 CHIL @VOID@
1 CHIL @I88@
`));
            assert.equal(r.stats.persons, 2); assert.match(r.stats.warnings.join(' '), /2 fiches ont le même identifiant @I1@/);
            assert.equal(count('family_children'), 0); noPhpError(); await undo(r);
        });
        await step('boucles : quelqu’un son propre ancêtre, mari et femme à la fois, enfant de sa propre famille → liens ignorés et dits', async () => {
            const r = await importOk(ged(`0 @I1@ INDI
1 NAME Jean /MAZAUD/
0 @I2@ INDI
1 NAME Paul /MAZAUD/
0 @I3@ INDI
1 NAME Luc /MAZAUD/
0 @F1@ FAM
1 HUSB @I1@
1 CHIL @I2@
0 @F2@ FAM
1 HUSB @I2@
1 CHIL @I1@
0 @F3@ FAM
1 HUSB @I3@
1 WIFE @I3@
1 CHIL @I3@
`));
            assert.ok(r.stats.loops_skipped >= 2, String(r.stats.loops_skipped));
            const w = r.stats.warnings.join(' | '); assert.match(w, /propre ancêtre/); assert.match(w, /à la fois mari et femme/);
            // personne ne doit être son propre ancêtre dans la base
            const loops = sql(`WITH RECURSIVE anc(child, anc) AS (SELECT fc.child_id, f.partner1_id FROM family_children fc JOIN families f ON f.id=fc.family_id WHERE f.partner1_id IS NOT NULL
                UNION SELECT fc.child_id, f.partner2_id FROM family_children fc JOIN families f ON f.id=fc.family_id WHERE f.partner2_id IS NOT NULL
                UNION SELECT a.child, f.partner1_id FROM anc a JOIN family_children fc ON fc.child_id=a.anc JOIN families f ON f.id=fc.family_id WHERE f.partner1_id IS NOT NULL)
                SELECT child FROM anc WHERE child=anc LIMIT 1`);
            assert.deepEqual(loops, []); assert.ok(startRow().id, 'une personne de départ malgré les boucles'); await undo(r);
        });
        await step('noms vides, « // », « /// », octets nuls, nom de 100 000 lettres, note de 3 Mo en CONC', async () => {
            const longName = 'A'.repeat(100000);
            const conc = Array.from({ length: 30000 }, (_, i) => `2 CONC ${'x'.repeat(99)}${i % 10}`).join('\n');
            const r = await importOk(ged(`0 @I1@ INDI
1 NAME
0 @I2@ INDI
1 NAME //
0 @I3@ INDI
1 NAME ///
0 @I4@ INDI
1 NAME Je\0an /MA\0ZAUD/
0 @I5@ INDI
1 NAME ${longName} /DURAND/
0 @I6@ INDI
1 NAME Note /LONGUE/
1 NOTE début
${conc}
0 @I7@ INDI
`));
            assert.equal(r.stats.persons, 7); noPhpError();
            assert.equal(one("SELECT first_name f FROM persons WHERE gedcom_id='I4'").f, 'Jean', 'octet nul retiré');
            assert.equal(Number(one("SELECT length(first_name) n FROM persons WHERE gedcom_id='I5'").n), 100000);
            assert.equal(Number(one("SELECT length(body) n FROM notes WHERE entity_type='person'").n), 5 + 30000 * 100);
            const list = await (await get('action=people&q=')).json(); assert.ok(!list.error, JSON.stringify(list).slice(0, 200));
            await undo(r);
        });
        await step('dates étranges : 31 FEB, ABT, BET…AND, FROM…TO, républicain, julien, futur, an 0, négatif, B.C., texte libre, INT', async () => {
            const dates = ['31 FEB 1850', 'ABT 1850', 'BET 1850 AND 1860', 'FROM 1870 TO 1875', '@#DFRENCH R@ 12 VEND 3', '@#DJULIAN@ 1 JAN 1700', '11 FEB 1700/01',
                '1 JAN 2999', '0', '-50', '50 B.C.', 'Noël 1850 (dit-on)', '(vers la guerre)', 'INT 1850 (selon le curé)', 'n’importe quoi 12', '99 ZZZ 99999', 'ABT', 'BET AND'];
            const body = '0 @I1@ INDI\n1 NAME Dates /DURAND/\n' + dates.map(d => `1 EVEN\n2 TYPE Essai\n2 DATE ${d}`).join('\n') + '\n';
            const r = await importOk(ged(body)); noPhpError();
            assert.equal(r.stats.events, dates.length);
            const rows = sql("SELECT date_text t, year y, date_calendar c FROM events ORDER BY id");
            const by = Object.fromEntries(dates.map((d, i) => [d, rows[i]]));
            assert.equal(by['ABT 1850'].y, 1850); assert.equal(by['BET 1850 AND 1860'].y, 1850); assert.equal(by['@#DJULIAN@ 1 JAN 1700'].c, 'julian');
            assert.equal(by['@#DFRENCH R@ 12 VEND 3'].c, 'republican'); assert.match(by['@#DFRENCH R@ 12 VEND 3'].t, /vendémiaire an III/);
            assert.equal(by['(vers la guerre)'].t, 'vers la guerre');
            for (const d of dates) assert.ok(typeof by[d].t === 'string', d);
            await undo(r);
        });
        await step('lieux à 20 virgules, balises inconnues partout, CONC / CONT n’importe où, sous-niveaux très profonds', async () => {
            const deep = Array.from({ length: 60 }, (_, i) => `${i + 2} _DEEP niveau ${i + 2}`).join('\n');
            const r = await importOk(ged(`0 @I1@ INDI
1 NAME Lieu /LACOMBE/
1 BIRT
2 PLAC ${',,,,,,,,,,,,,,,,,,,,'}Paris
2 _WEIRD valeur
3 _WEIRDER encore
1 _INCONNU @I1@
1 CONC collé au rien
1 CONT seul
1 RESI
2 PLAC a,b,c,d,e,f,g,h,i,j,k,l,m,n,o,p,q,r,s,t,u
1 _FOO
${deep}
0 @X1@ _RECORD_INCONNU
1 NAME rien
0 @N1@ NOTE
1 CONC note partagée bizarre
`));
            assert.equal(r.stats.persons, 1); noPhpError(); await undo(r);
        });
        await step('médias : « ../ », chemins Windows et absolus, file://, OBJE dans OBJE — jamais lus hors du dossier, comptés comme introuvables', async () => {
            const secret = path.join(tmp, 'secret.jpg'); fs.writeFileSync(secret, JPG);
            const before = fs.readdirSync(path.join(dir, 'media')).length;
            const r = await importOk(ged(`0 @I1@ INDI
1 NAME Media /DURAND/
1 OBJE
2 FILE ../../../../../../etc/passwd
2 FORM jpg
1 OBJE
2 FILE ../secret.jpg
1 OBJE
2 FILE ${secret}
1 OBJE
2 FILE C:\\Users\\Martine\\Photos\\mariage.jpg
1 OBJE
2 FILE file:///etc/hosts.jpg
1 OBJE @M1@
0 @M1@ OBJE
1 FILE ..\\..\\x.png
1 OBJE
2 FILE /etc/passwd
`));
            assert.equal(r.stats.media, 0); assert.ok(r.stats.media_missing >= 5, String(r.stats.media_missing));
            assert.equal(fs.readdirSync(path.join(dir, 'media')).length, before, 'aucun fichier copié dans les médias');
            await undo(r);
        });
        await step('GEDCOM 5.5 et 5.5.1 : CHAR ASCII, CONC / CONT, « @@ » échappé', async () => {
            for (const vers of ['5.5', '5.5.1']) {
                const r = await importOk(ged(`0 @I1@ INDI
1 NAME Jean /MAZAUD/
1 NOTE Courriel jean@@exemple.fr, et @@début
2 CONC  suite collée
2 CONT ligne 2
`, vers).replace('UTF-8', 'ASCII'));
                assert.equal(one("SELECT body b FROM notes").b, 'Courriel jean@exemple.fr, et @début suite collée\nligne 2', vers);
                await undo(r);
            }
        });
        await step('GEDCOM 7.0 : SCHMA, @VOID@, SNOTE partagée, EXID, NO, PHRASE, SDATE, TRAN, CROP, MIME html, dates 7, @@', async () => {
            const r = await importOk(`0 HEAD
1 GEDC
2 VERS 7.0
1 SCHMA
2 TAG _ROOT https://github.com/victorbaissait/lcnda#gedcom-root
1 _ROOT @I2@
0 @I1@ INDI
1 NAME Pierre /MAZAUD/
2 TRAN Пьер /МАЗО/
3 LANG ru
1 SEX M
1 EXID Q42
2 TYPE http://www.wikidata.org/entity/
1 NO MARR
2 DATE FROM 1900 TO 1910
1 FAMS @F1@
1 SNOTE @N1@
1 BIRT
2 DATE
3 PHRASE vers la Noël 1850
2 SDATE 25 DEC 1850
1 DEAT
2 DATE JULIAN 1 JAN 1700
1 BURI
2 DATE FRENCH_R 12 VEND 3
1 CREM
2 DATE 50 BCE
1 OBJE @O1@
2 CROP
3 TOP 0
1 NOTE <p>Texte <b>gras</b> &amp; fin</p>
2 MIME text/html
0 @I2@ INDI
1 NAME Julien /MAZAUD/
1 FAMC @F1@
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @VOID@
1 CHIL @I2@
1 CHIL @VOID@
0 @N1@ SNOTE Note partagée
1 CONT deuxième ligne
0 @O1@ OBJE
1 FILE media/absente.jpg
2 FORM image/jpeg
0 @S1@ SOUR
1 TITL @@arobase au début
0 TRLR
`, 'v7.ged');
            noPhpError();
            assert.equal(startRow().first_name, 'Julien'); assert.equal(r.stats.start_person.why, 'header');
            const pierre = one("SELECT id, wikidata_id w FROM persons WHERE first_name='Pierre'");
            assert.equal(pierre.w, 'Q42');
            const notes = sql(`SELECT body b FROM notes WHERE entity_type='person' AND entity_id=${pierre.id} ORDER BY id`).map(x => x.b);
            assert.ok(notes.includes('Note partagée\ndeuxième ligne'), JSON.stringify(notes));
            assert.ok(notes.includes('Texte gras & fin'), JSON.stringify(notes));
            const ev = sql(`SELECT t.gedcom_tag g, e.date_text d, e.date_calendar c, e.year y FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=${pierre.id} ORDER BY e.id`);
            assert.ok(!ev.some(e => e.g === 'NO'), 'NO MARR n’est pas un événement');
            const g = Object.fromEntries(ev.map(e => [e.g, e]));
            assert.equal(g.BIRT.d, 'vers la Noël 1850'); assert.equal(g.DEAT.c, 'julian'); assert.equal(g.BURI.c, 'republican'); assert.match(g.CREM.d, /av\. J\.-C\./);
            assert.equal(one("SELECT title t FROM sources").t, '@arobase au début');
            assert.equal(count('family_children'), 1);
            await undo(r);
        });
        await step('fichiers officiels GEDCOM 7 (FamilySearch) : importés sans erreur', async () => {
            const r = await importOk(fs.readFileSync(path.join(__dirname, 'fixtures', 'gedcom7-regles', 'maximal70.ged')), 'max.ged');
            assert.ok(r.stats.persons >= 2); noPhpError(); await undo(r);
        });

        // ═══ 3. exports valables, aller-retour du Sosa 1 ═══
        await step('exports GEDCOM 7.0 et 5.5.1 valables (règles officielles 7.0 ; structure 5.5.1), Sosa 1 écrit (_ROOT, déclaré en 7)', async () => {
            const seed = fs.readFileSync(path.join(__dirname, 'fixtures', 'complet.ged'));
            const a = await importOk(seed, 'complet.ged');
            const f = await importOk(ged(FAMILLE + `0 @I9@ INDI
1 NAME Fait /DURAND/
1 FACT bleu
2 TYPE Couleur préférée
1 BIRT
2 DATE 11 FEB 1700/01
1 DEAT
2 DATE (pendant la guerre)
1 BURI
2 DATE INT 1850 (selon le curé)
1 CREM
2 DATE 50 B.C.
1 FAMC @F1@
2 PEDI adopted
1 NAME Autre /DURAND/
2 TYPE married
2 _DATE 1900
2 NOTE nom pris au mariage
1 _LABEL Poilu
2 _COLR #cc0000
1 OCCU Meunier
2 DATE 1880
2 ADDR 3 rue du Moulin
2 AGNC Moulin Durand
2 CAUS aucune
2 NOTE description du métier
2 NOTE corps de la note
3 _TITL Titre de note
2 SOUR @S1@
3 PAGE p. 4
3 _QUAL douteuse
3 NOTE note de citation
1 SOUR @S1@
2 PAGE p. 5
2 QUAY 2
0 @I10@ INDI
1 NAME Médor /DURAND/
1 _KIND animal
1 SEX M
0 @S1@ SOUR
1 TITL Registre
1 WWW https://exemple.fr/registre
`), 'f.ged');
            assert.deepEqual(one("SELECT t.label l, e.title v FROM events e JOIN event_types t ON t.id=e.event_type_id JOIN persons p ON p.id=e.person_id WHERE p.first_name='Fait' AND e.title='bleu'"), { l: 'Couleur préférée', v: 'bleu' }, 'le TYPE d’un FACT est gardé');
            await post('set_start_person', { person_id: f.stats.start_kept.id });
            const start = startRow();
            for (const v of ['7', '5.5.1']) {
                const txt = await exportGed(v);
                const errs = v === '7' ? gedcom7Errors(txt) : gedcom551Errors(txt);
                assert.deepEqual(errs.slice(0, 15), [], `export ${v} : ${errs.length} erreur(s)`);
                assert.match(txt, new RegExp(`^1 _ROOT @I${start.id}@$`, 'm'), v);
                if (v === '7') assert.match(txt, /^2 TAG _ROOT /m);
                fs.writeFileSync(path.join(tmp, `export-${v}.ged`), txt);
            }
            // « pour Geneanet » : 5.5.1 sans aucune balise « _ »
            const gn = await exportGed('5.5.1', '&target=geneanet');
            assert.deepEqual(gedcom551Errors(gn).slice(0, 10), []);
            await post('import_undo', { token: f.undo }); await undo(a);
        });
        await step('aller-retour 5.5.1 et 7.0 : la personne de départ revient la même (base vide → réimport)', async () => {
            for (const v of ['5.5.1', '7']) {
                const first = await importOk(ged(FAMILLE, '5.5.1'));
                const claire = one("SELECT id FROM persons WHERE first_name='Claire'").id;
                await post('set_start_person', { person_id: claire });
                const txt = await exportGed(v);
                await undo(first);
                const again = await importOk(txt, 'retour.ged');
                assert.equal(startRow().first_name, 'Claire', v); assert.equal(again.stats.start_person.why, 'header');
                assert.deepEqual([again.stats.persons, again.stats.families, again.stats.children_links], [6, 2, 3], v);
                await undo(again);
            }
        });

        // ═══ 4. 50 000 fiches ═══
        await step('50 000 fiches (25 000 couples sur 12 générations) : import en moins de 4 minutes, Sosa 1 trouvé', async () => {
            const N = 50000; const lines = [HEAD()];
            // fiche i : parents 2i+1 et 2i+2 (comme un arbre d'ascendants), la n°0 en DERNIER dans le fichier
            const fam = i => `@F${i}@`;
            for (let k = N - 1; k >= 0; k--) {
                lines.push(`0 @I${k}@ INDI\n1 NAME P${k} /MAZAUD/\n1 SEX ${k % 2 ? 'M' : 'F'}\n1 BIRT\n2 DATE ${2000 - Math.floor(Math.log2(k + 1)) * 25}\n2 PLAC Village ${k % 500}, Corrèze, France`);
                if (2 * k + 2 < N) lines.push(`1 FAMC ${fam(k)}`);
                if (k > 0) lines.push(`1 FAMS ${fam(Math.floor((k - 1) / 2))}`);
            }
            for (let k = 0; 2 * k + 2 < N; k++) lines.push(`0 ${fam(k)} FAM\n1 HUSB @I${2 * k + 1}@\n1 WIFE @I${2 * k + 2}@\n1 CHIL @I${k}@`);
            lines.push('0 TRLR\n');
            const t0 = Date.now();
            const r = await importOk(lines.join('\n'), 'grand.ged');
            const secs = (Date.now() - t0) / 1000;
            console.log(`      (50 000 fiches importées en ${secs.toFixed(1)} s)`);
            assert.equal(r.stats.persons, N); assert.ok(secs < 240, `${secs} s`);
            assert.equal(startRow().first_name, 'P0');
            await undo(r);
        });
        await step('une lignée de 20 000 générations (fichier fabriqué) : importée en un temps raisonnable', async () => {
            const N = 20000; const lines = [HEAD()];
            for (let k = 0; k < N; k++) { lines.push(`0 @I${k}@ INDI\n1 NAME G${k} /DURAND/` + (k + 1 < N ? `\n1 FAMC @F${k}@` : '') + (k ? `\n1 FAMS @F${k - 1}@` : '')); }
            // familles des plus anciennes aux plus récentes : chaque lien vérifié remonte toute la lignée déjà lue (le pire cas)
            for (let k = N - 2; k >= 0; k--) lines.push(`0 @F${k}@ FAM\n1 HUSB @I${k + 1}@\n1 CHIL @I${k}@`);
            lines.push('0 TRLR\n');
            const t0 = Date.now();
            const r = await importOk(lines.join('\n'), 'lignee.ged');
            const secs = (Date.now() - t0) / 1000;
            console.log(`      (20 000 générations importées en ${secs.toFixed(1)} s)`);
            assert.equal(r.stats.children_links, N - 1); assert.ok(secs < 240, `${secs} s`);
            assert.equal(startRow().first_name, 'G0');
        });
        await step('GedZip (GEDCOM 7 + médias) : le gedcom.ged du paquet est valable, et la personne de départ revient', async () => {
            fs.writeFileSync(path.join(dir, 'media', 'portrait.jpg'), JPG);
            const r0 = await importOk(ged(FAMILLE.replace('1 NAME Claire /MAZAUD/', '1 NAME Claire /MAZAUD/\n1 OBJE\n2 FILE portrait.jpg\n2 FORM jpg\n2 TITL Portrait')));
            assert.equal(r0.stats.media, 1);
            await post('set_start_person', { person_id: one("SELECT id FROM persons WHERE first_name='Louis'").id });
            const z = await get('action=export_plus&format=gedzip&share=0'); assert.equal(z.status, 200);
            const zip = path.join(tmp, 'paquet.zip'); fs.writeFileSync(zip, Buffer.from(await z.arrayBuffer()));
            const inner = php(`$z=new ZipArchive(); $z->open($argv[1]); echo $z->getFromName('gedcom.ged'), "\n--\n", implode(',', array_map(fn($i)=>$z->getNameIndex($i), range(0, $z->numFiles-1)));`, zip);
            const [txt, names] = inner.split('\n--\n');
            assert.deepEqual(gedcom7Errors(txt).slice(0, 10), []);
            assert.match(names, /media\//);
            await undo(r0);
            const r = await importOk(fs.readFileSync(zip), 'paquet.gdz');
            assert.equal(startRow().first_name, 'Louis'); assert.equal(r.stats.media, 1);
            await undo(r);
        });
        // ═══ 5. navigateur : le résumé de l'import dit qui est la personne n°1, « Prendre … », « Changer… », ↶ ═══
        let pw = null;
        for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
        if (!pw) console.log('  – navigateur : sauté (Playwright absent)');
        else {
            const browser = await pw.chromium.launch();
            try {
                for (const [w, h, dark] of [[1440, 900, false], [390, 844, true]]) {
                    await step(`navigateur ${w} px${dark ? ', sombre' : ''} : « ⭐ Personne n°1 (Sosa 1) » dans le résumé, « Prendre … » puis ↶, « Changer… »`, async () => {
                        const errors = [];
                        const a = await importOk(ged(FAMILLE.replace(/MAZAUD/g, 'LACOMBE').replace('/LACOMBE/\n1 SEX F\n1 FAMS', '/DURAND/\n1 SEX F\n1 FAMS')), 'a.ged');
                        const kept = startRow();
                        const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: dark ? 'dark' : 'light' });
                        const page = await ctx.newPage();
                        page.on('pageerror', e => errors.push('pageerror: ' + e.message));
                        page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
                        await page.goto(base + '#maintenance/import');
                        await page.waitForSelector('[data-import-tree]', { timeout: 30000 });
                        await page.click('[data-import-tree]');
                        await page.waitForSelector('.k-import input[type=file]', { state: 'attached' });
                        const f = path.join(tmp, 'geneanet-root.ged'); fs.writeFileSync(f, ged(FAMILLE, '5.5.1', '1 _ROOT @I4@\n'));
                        await page.setInputFiles('.k-import input[type=file]', f);
                        await page.waitForSelector('.k-import [data-k-go]:not([disabled])', { timeout: 20000 });
                        await page.click('.k-import [data-k-go]');
                        await page.waitForSelector('.k-import', { state: 'detached', timeout: 30000 });
                        await page.waitForSelector('#import-tree-result [data-start-use]', { timeout: 20000 }).catch(async e => { throw new Error(e.message.split('\n')[0] + ' — résultat : ' + (await page.innerHTML('#import-tree-result').catch(() => '?')).slice(0, 600) + ' — erreurs : ' + errors.join(' / ')); });
                        const txt = await page.textContent('#import-tree-result [data-import-start]');
                        assert.match(txt, /déjà sa personne n°1 \(Sosa 1\) : Julien LACOMBE\. Elle est gardée/); assert.match(txt, /désigne plutôt Claire MAZAUD/);
                        await page.click('#import-tree-result [data-start-use]');
                        await page.waitForFunction(() => /Personne n°1 \(Sosa 1\) : Claire MAZAUD\./.test(document.querySelector('[data-import-start]')?.textContent || ''), null, { timeout: 15000 });
                        assert.equal(startRow().first_name, 'Claire');
                        await page.locator('.ui-toast:has-text("Claire MAZAUD") button:has-text("Annuler")').first().click();
                        await page.waitForFunction(() => /Sosa 1\) : Julien LACOMBE\./.test(document.querySelector('[data-import-start]')?.textContent || ''), null, { timeout: 15000 });
                        assert.equal(Number(startRow().id), Number(kept.id));
                        // « Changer… » : une fenêtre pour choisir quelqu'un
                        await page.click('#import-tree-result [data-start-change]');
                        await page.waitForSelector('dialog[open] .pk-input', { timeout: 10000 });
                        await page.fill('dialog[open] .pk-input', 'Rose');
                        await page.waitForSelector('dialog[open] .pk-menu [data-pk-i], dialog[open] [role=option]', { timeout: 10000 }).catch(() => {});
                        await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
                        await page.click('dialog[open] button[type=submit]').catch(() => {});
                        await page.waitForFunction(() => /Sosa 1\) : Rose /.test(document.querySelector('[data-import-start]')?.textContent || ''), null, { timeout: 15000 });
                        assert.equal(startRow().first_name, 'Rose');
                        await page.waitForTimeout(900);
                        assert.equal(await page.locator('.ui-toast:has-text("Réglage changé")').count(), 0, 'pas de « Réglage changé » en plus du message du Sosa 1');
                        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
                        assert.ok(overflow <= 1, `défilement horizontal : ${overflow} px`);
                        if (process.env.SHOTS_DIR) await page.screenshot({ path: path.join(process.env.SHOTS_DIR, `sosa1-import-${w}.png`), fullPage: false });
                        assert.deepEqual(errors, []);
                        await ctx.close();
                    });
                }
            } finally { await browser.close(); }
        }
        await step('Gramps : la « personne de référence » (people home) devient la personne de départ ; paquet .gpkg aller-retour', async () => {
            const r0 = await importOk(ged(FAMILLE));
            await post('set_start_person', { person_id: one("SELECT id FROM persons WHERE first_name='Rose'").id });
            const z = await get('action=export_plus&format=gpkg&share=0'); assert.equal(z.status, 200);
            const buf = Buffer.from(await z.arrayBuffer());
            await undo(r0);
            const r = await importOk(buf, 'paquet.gpkg');
            assert.equal(startRow().first_name, 'Rose'); assert.equal(r.stats.start_person.why, 'header');
            await undo(r);
        });
        await step('journal du serveur : aucune erreur PHP', async () => noPhpError());
    } finally {
        proc.kill();
        if (process.env.GEDROB_KEEP) console.log('  (dossier gardé : ' + tmp + ')'); else fs.rmSync(tmp, { recursive: true, force: true });
    }
    console.log(failed ? `\n${failed} échec(s), ${passed} réussite(s).` : `\n${passed} vérifications réussies.`);
    process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
