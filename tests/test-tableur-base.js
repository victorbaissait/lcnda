'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🧮 Tableur — lien avec la base (lib/sheet_link.php, assets/js/heritage-tableur-base.js) :   node tests/test-tableur-base.js
 *  1. API (un vrai « php -S » sur une base neuve) :
 *     sheet_sources ; sheet_fill (personnes et filtres, colonnes tirées des données, événements, recensements, relevé de
 *     dépouillement, statistique, une de mes listes) ; demandes de mauvaise forme refusées (422) ; vivants et fiches
 *     confidentielles laissés de côté (privacy=1, et toujours en mode consultation) ; sheet_refs (nom d'aujourd'hui, fiche supprimée) ;
 *     sheet_push : « Voilà ce qui va entrer » (Déjà dans la base, Nouvelle fiche, À vérifier, Problème), recensement → foyers,
 *     liens de famille, événements, relevé de dépouillement relié ; ↶ Annuler : la base revient EXACTEMENT comme avant
 *     (toutes les tables comparées ligne à ligne) ; jeton déjà servi refusé ; sans CSRF (419) ; mode consultation (423).
 *  2. navigateur (Playwright ; sinon sauté) : Données → « ⤒ Remplir depuis l'app » ; cellules « personne » reliées ;
 *     ↻ Relire (une fiche en plus, un nom changé : la note à soi reste sur la ligne de sa personne) ; modèle « Relevé de
 *     recensement » (colonnes de l'année) → « 📤 Envoyer vers la base » (3 étapes, badges K8, « choisis ▾ ») → ↶ Annuler du
 *     message H7 : base comme avant ; « 🧮 Dans le tableur » des Dépouillements ; Atelier (élément 🧮 Classeur) ;
 *     390 px et mode sombre ; aucune erreur dans la console.
 *  Captures (si TABLEUR_SHOTS=dossier).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const phpPath = findPhp([devBundledPhp()]);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-tableur-base-'));
const env = { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media'), GENEALOGY_SKIP_REFERENCE: '1' };
fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
{
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; $pdo = db();
$t = fn($tag, $scope = 'person') => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' AND scope='$scope' LIMIT 1")->fetchColumn();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_private,is_start) VALUES
 (1,'Jean','MARTIN','male','deceased',0,1),(2,'Pierre','DURAND','male','deceased',0,0),(3,'Pierre','DURAND','male','deceased',0,0),
 (4,'Lucas','VIVANT','male','living',0,0),(5,'Gaston','SECRET','male','deceased',1,0),(6,'Marie','ROUX','female','deceased',0,0)");
$pdo->exec("INSERT INTO places(id,name,county,country) VALUES(1,'Saint-Martin','Gers','France')");
$ev = $pdo->prepare('INSERT INTO events(scope,person_id,event_type_id,date_text,year,place_id) VALUES(?,?,?,?,?,?)');
$ev->execute(['person', 1, $t('BIRT'), 'vers 1774', 1774, 1]); $ev->execute(['person', 1, $t('DEAT'), '3 mars 1840', 1840, 1]);
$ev->execute(['person', 2, $t('BIRT'), '1791', 1791, null]); $ev->execute(['person', 3, $t('BIRT'), '1790', 1790, null]);
$ev->execute(['person', 4, $t('BIRT'), '2 mai 1990', 1990, null]); $ev->execute(['person', 5, $t('BIRT'), '1900', 1900, null]);
$pdo->exec("INSERT INTO families(id,partner1_id,partner2_id) VALUES(1,1,6)");
$pdo->exec("INSERT INTO census_records(id,year,place_id,address,status) VALUES(1,1836,1,'Le bourg','found')");
$pdo->exec("INSERT INTO census_members(census_id,person_id,first_name,display_name,age_text,occupation,household_position,is_primary) VALUES(1,1,'Jean','MARTIN','62','laboureur','chef',1)");
$pdo->exec("INSERT INTO archive_digest_entries(id,place_id,city_name,record_type,year_text) VALUES(1,1,'Saint-Martin','recensement','1836')");
$pdo->exec("INSERT INTO archive_digest_people(id,archive_digest_id,first_name,last_name,age_text,occupation,household_position,page_number,household_key,address) VALUES
 (1,1,'Jean','MARTIN','62','laboureur','chef','3','1','2 rue Haute'),(2,1,'Jeanne','MARTIN','20','','fille','3','1','2 rue Haute'),(3,1,'Paul','NOIR','30','','chef','4','2','')");
$pdo->exec("INSERT INTO custom_lists(id,name,icon,source,definition_json) VALUES(1,'Mes Martin','📋','persons','{\"columns\":[\"name\",\"birth\"],\"rules\":[{\"field\":\"last_name\",\"value\":\"MARTIN\"}]}')");
echo 'ok';`], { cwd: appRoot, encoding: 'utf8', env });
    if (r.status !== 0 || !/ok$/.test(r.stdout)) { console.error(r.stderr || r.stdout); process.exit(1); }
}
/** toute la base, table par table, ligne par ligne (sans le journal des envois ni les compteurs d'AUTOINCREMENT ; l'index FTS par son contenu) */
function snapshot() {
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
$p = new PDO('sqlite:'.$argv[1].'/genealogy.sqlite'); $p->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC); $o = [];
foreach ($p->query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT IN ('sqlite_sequence','sheet_pushes') AND name NOT LIKE 'person_search_%' AND name NOT LIKE '%_fts_%' ORDER BY name")->fetchAll(PDO::FETCH_COLUMN) as $t) {
    $rows = $p->query('SELECT * FROM "' . $t . '"')->fetchAll(); $lines = array_map('json_encode', $rows); sort($lines); $o[$t] = md5(implode("\n", $lines)) . ':' . count($rows);
}
echo json_encode($o);`, dir], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(r.stderr || r.stdout);
    return JSON.parse(r.stdout);
}
const diff = (a, b) => Object.keys({ ...a, ...b }).filter(k => a[k] !== b[k]);
/** pendant que la page est ouverte, elle range ses réglages d'écran (app_settings) : ils ne comptent pas */
const diffData = (a, b) => diff(a, b).filter(k => k !== 'app_settings');
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const SHOTS = process.env.TABLEUR_SHOTS || '';
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; }; const eq = (a, b, m) => { assert.deepStrictEqual(a, b, m); n++; };

(async () => {
    const port = Number(process.env.TABLEUR_PORT) || await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env, stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
    let browser = null;
    try {
        /* ═════ 1. API ═════ */
        let cookie = '';
        const html = await (await fetch(base).then(r => { cookie = (r.headers.get('set-cookie') || '').split(';')[0]; return r; })).text();
        const csrf = JSON.parse(html.match(/window\.INSTALL_CSRF = ("[^"]*")/)[1]);
        const get = async (action, q = {}) => { const r = await fetch(`${base}api.php?action=${action}&${new URLSearchParams(q)}`, { headers: { Cookie: cookie } }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
        const post = async (action, body, token = csrf) => { const r = await fetch(`${base}api.php?action=${action}`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': token }, body: JSON.stringify({ ...body, csrf: token }) }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
        const fill = spec => get('sheet_fill', { spec: JSON.stringify(spec) });
        const names = r => r.body.rows.map(x => x.cells.person?.v ?? x.cells.person);

        const src = await get('sheet_sources');
        eq(src.body.sources.map(s => s.key), ['persons', 'events', 'census', 'digest', 'stats', 'mylist'], 'sources : les six sortes');
        ok(src.body.census.some(c => c.name === 'Saint-Martin' && c.years.includes(1836)) && src.body.digests.length === 1 && src.body.my_lists.length === 1, 'sources : communes recensées, dépouillements, mes listes');
        ok(src.body.sources[0].columns.some(c => c.k === 'f:nationality'), 'sources : colonnes tirées des données (⚙️ Colonnes)');

        let r = await fill({ source: 'persons' });
        eq(r.status, 200, 'remplir : personnes');
        eq(r.body.rows.length, 6, 'toutes les fiches');
        ok(r.body.columns.map(c => c.k).join() === 'person,sosa,generation,birth,birthplace,death,age,occupation', 'colonnes montrées d’office');
        const jean = r.body.rows.find(x => x.key === 'p:1');
        eq([jean.cells.person, jean.cells.sosa, jean.cells.birthplace, jean.cells.age], [{ v: 'Jean MARTIN', ref: { kind: 'person', id: 1 } }, 1, { v: 'Saint-Martin', ref: { kind: 'place', id: 1 } }, 66], 'une personne et un lieu reliés à leur fiche');
        r = await fill({ source: 'persons', privacy: 1 });
        ok(!names(r).includes('Lucas VIVANT') && !names(r).includes('Gaston SECRET') && r.body.hidden === 2, 'privacy : sans les vivants ni les fiches confidentielles');
        r = await fill({ source: 'persons', filters: { gender: ['female'] } });
        eq(names(r), ['Marie ROUX'], 'filtre H10 : femmes');
        r = await fill({ source: 'persons', filters: { born_to: 1792, q: 'durand' }, cols: ['person', 'birth', 'spouse', 'f:nationality', 'pas une colonne;DROP', 'f:military_data'] });
        eq([r.body.rows.length, r.body.columns.map(c => c.k)], [2, ['person', 'birth', 'spouse', 'f:nationality']], 'filtres (année, recherche), colonnes inconnues laissées de côté');
        r = await fill({ source: 'persons', cols: ['person', 'spouse'] });
        eq(r.body.rows.find(x => x.key === 'p:1').cells.spouse, { v: 'Marie ROUX', ref: { kind: 'person', id: 6 } }, 'colonne « Conjoint »');
        r = await fill({ source: 'events', filters: { year_from: 1800 } });
        ok(r.body.rows.length >= 2 && r.body.rows.every(x => x.key.startsWith('e:')), 'événements');
        r = await fill({ source: 'census', filters: { place_id: 1, year: 1836 } });
        eq(r.body.rows.map(x => [x.cells.person, x.cells.position]), [[{ v: 'Jean MARTIN', ref: { kind: 'person', id: 1 } }, 'chef']], 'recensements d’une commune');
        r = await fill({ source: 'digest', filters: { digest_id: 1, page: '3' } });
        eq(r.body.rows.map(x => [x.key, x.cells.street, x.cells.house, x.cells.last_name, x.cells.first_name, x.cells.position]), [['d:1', 'rue Haute', '2', 'MARTIN', 'Jean', 'chef'], ['d:2', 'rue Haute', '2', 'MARTIN', 'Jeanne', 'fille']], 'relevé de dépouillement : rue, n°, foyer…');
        r = await fill({ source: 'stats', filters: { stat: 'first_name' } });
        ok(r.body.rows.some(x => x.cells.label === 'Pierre' && x.cells.value === 2), 'statistique : prénoms');
        r = await fill({ source: 'mylist', filters: { list_id: 1 } });
        eq(r.body.rows.map(x => x.key), ['p:1'], 'une de mes listes');
        for (const bad of [{ source: 'drop table' }, { source: 'digest' }, { source: 'mylist', filters: { list_id: 99 } }, { source: 'stats', filters: { stat: 'x' } }]) eq((await fill(bad)).status, 422, 'refusé : ' + JSON.stringify(bad));
        eq((await get('sheet_fill', { spec: '{pas du json' })).status, 422, 'demande illisible refusée');
        r = await get('sheet_refs', { person: '1,999,abc', place: '1' });
        eq([r.body.person['1'], r.body.gone.person, r.body.place['1']], ['Jean MARTIN', [999], 'Saint-Martin'], 'sheet_refs : nom d’aujourd’hui, fiche disparue');

        // 📤 Envoyer : un relevé de recensement
        const row = (n2, f, key = '') => ({ row: n2, key, f });
        const census = { target: 'census', name: 'Relevé 1836', context: { year: 1836, place_id: 1 }, rows: [
            row(4, { last_name: 'MARTIN', first_name: 'Jean', age: '62', occupation: 'laboureur', position: 'chef', household: '1', house: '2', street: 'rue Haute' }),
            row(5, { last_name: 'MARTIN', first_name: 'Marie', age: '58', occupation: 'fileuse', position: 'épouse', household: '1' }),
            row(6, { name: 'MARTIN Pierre', age: '12', position: 'fils', household: '1' }),
            row(7, { last_name: 'DURAND', first_name: 'Pierre', age: '45', position: 'chef', household: '2' }),
            row(8, { last_name: 'BERNARD', first_name: 'Louis', age: '214', household: '3' }),
            row(9, { last_name: '', first_name: '', occupation: 'x', household: '3' })] };
        const before = snapshot();
        r = await post('sheet_push', { ...census, dry: 1 });
        eq(r.status, 200, 'voilà ce qui va entrer');
        eq(r.body.result.rows.map(x => x.status), ['linked', 'new', 'new', 'check', 'problem', 'problem'], 'Déjà dans la base · Nouvelle fiche · À vérifier · Problème');
        ok(/épouse de Jean \(ligne 4\)/.test(r.body.result.rows[1].text) && /fils de Jean/.test(r.body.result.rows[2].text) && /recensement 1836/.test(r.body.result.rows[0].text), 'phrases : « épouse de Jean (ligne 4) », « + recensement 1836 »');
        eq(r.body.result.rows[3].candidates.map(c => c.id).sort(), [2, 3], 'homonymes : deux fiches possibles');
        ok(/Âge impossible \(214 ans\)/.test(r.body.result.rows[4].text) && /Il manque le nom/.test(r.body.result.rows[5].text), 'problèmes expliqués');
        eq(r.body.result.counts, { new: 2, linked: 1, check: 1, problem: 2, skip: 0 }, 'les nombres');
        eq(diff(before, snapshot()), [], 'l’aperçu n’écrit rien');
        eq((await post('sheet_push', { ...census }, 'mauvais-jeton')).status, 419, 'sans CSRF : refusé');
        eq((await post('sheet_push', { ...census, target: 'tout' })).status, 422, 'cible inconnue refusée');
        eq((await post('sheet_push', { ...census, context: { year: 12 } })).status, 422, 'année du recensement exigée');
        eq((await post('sheet_push', { ...census, rows: { a: 1 } })).status, 422, 'lignes de mauvaise forme refusées');
        eq((await post('sheet_push', { ...census, rows: [{ f: { last_name: ['x'] } }] })).status, 422, 'valeur de mauvaise forme refusée');
        r = await post('sheet_push', { ...census, decisions: { 3: { action: 'link', person_id: 2 } } });
        eq(r.status, 200, 'envoyé');
        const done = r.body.result.done, token = r.body.result.token;
        eq([done.persons, done.linked, done.households, done.members, done.families, done.skipped], [2, 2, 2, 4, 1, 2], '2 fiches créées, 2 reliées, 2 foyers, une famille');
        ok(/^[0-9a-f]{32}$/.test(token) && /2 fiches créées, 2 reliées et 2 foyers/.test(r.body.result.message), 'jeton d’annulation et message');
        r = await fill({ source: 'census', filters: { place_id: 1, year: 1836 } });
        ok(r.body.rows.length === 5 && r.body.rows.some(x => x.cells.person?.ref?.id === 2 && x.cells.position === 'chef'), 'les foyers sont dans les recensements');
        const after = snapshot();
        ok(diff(before, after).includes('persons') && diff(before, after).includes('census_members') && diff(before, after).includes('family_children'), 'la base a bien changé');
        r = await post('sheet_push_undo', { token });
        eq([r.status, r.body.result?.removed?.persons, r.body.result?.removed?.households], [200, 2, 2], '↶ Annuler');
        eq(diff(before, snapshot()), [], '↶ Annuler : la base est EXACTEMENT comme avant');
        eq((await post('sheet_push_undo', { token })).status, 422, 'un envoi ne s’annule qu’une fois');
        eq((await post('sheet_push_undo', { token: '../../x' })).status, 422, 'jeton de mauvaise forme');
        eq((await post('sheet_push_undo', { token }, 'x')).status, 419, 'annuler sans CSRF : refusé');

        // 📤 des événements (registre paroissial)
        const reg = { target: 'events', name: 'Registre', rows: [
            row(2, { last_name: 'MARTIN', first_name: 'Jean', event_type: 'Sépulture', event_date: '4 mars 1840', event_place: 'Saint-Martin' }),
            row(3, { name: 'Anne FAURE', event_type: 'Baptême', event_date: '3 frimaire an XII', event_place: 'Lieu-Nouveau' }),
            row(4, { name: 'Luc FAURE', event_type: 'Mariage', event_date: '1820' }), row(5, { name: 'Luc FAURE', event_type: 'Lecture du journal' }), row(6, { name: 'Luc FAURE', event_type: 'Décès', event_date: '1 mars 2999' })] };
        r = await post('sheet_push', { ...reg, dry: 1 });
        eq(r.body.result.rows.map(x => x.status), ['linked', 'new', 'problem', 'problem', 'problem'], 'événements : relier, créer ; mariage, sorte inconnue, date future refusés');
        ok(/se relie à un couple/.test(r.body.result.rows[2].text) && /inconnue/.test(r.body.result.rows[3].text) && /futur/.test(r.body.result.rows[4].text), 'événements : problèmes expliqués');
        r = await post('sheet_push', reg);
        eq([r.body.result.done.persons, r.body.result.done.events], [1, 2], 'une fiche (Anne) et deux événements');
        const p2 = await get('person', { id: r.body.result.person_ids.find(x => x.i === 1).id });
        ok((p2.body.events || []).some(e => /frimaire an XII/.test(e.date_text)), 'la date d’acte est gardée telle quelle');
        await post('sheet_push_undo', { token: r.body.result.token });
        eq(diff(before, snapshot()), [], 'événements : ↶ Annuler remet la base comme avant (lieu créé compris)');

        // 📤 un relevé de dépouillement : la personne relevée est reliée à sa fiche
        r = await post('sheet_push', { target: 'persons', name: 'Page 3', rows: [row(2, { last_name: 'MARTIN', first_name: 'Jeanne', age: '20' }, 'd:2'), row(3, { last_name: 'MARTIN', first_name: 'Jean' }, 'd:1')], context: { year: 1836, digest_id: 1 } });
        eq([r.body.result.done.persons, r.body.result.done.linked], [1, 1], 'fiches : une créée, une déjà là');
        const digestTok = r.body.result.token;
        r = await fill({ source: 'digest', filters: { digest_id: 1, page: '3' }, cols: ['first_name', 'person'] });
        ok(r.body.rows.every(x => x.cells.person?.ref), 'les personnes relevées sont reliées à leur fiche');
        eq((await post('sheet_push_undo', { token: digestTok })).status, 200, '↶ Annuler (relevé)');
        eq(diff(before, snapshot()), [], 'relevé : les liens posés sont défaits, la base est comme avant');

        // 🔒 mode consultation
        eq((await post('kiosk_enter', { password: '1234' })).status, 200, 'mode consultation');
        r = await fill({ source: 'persons' });
        ok(r.status === 200 && !names(r).includes('Lucas VIVANT') && !names(r).includes('Gaston SECRET'), 'consultation : vivants et confidentiels toujours laissés de côté');
        ok((await get('sheet_sources')).body.privacy_forced === true, 'consultation : la case 🔒 est imposée');
        eq((await post('sheet_push', census)).status, 423, 'consultation : envoi refusé');
        eq((await post('sheet_push_undo', { token })).status, 423, 'consultation : annulation refusée');
        eq((await post('kiosk_exit', { password: '1234' })).status, 200, 'sortie du mode consultation');

        /* ═════ 2. navigateur ═════ */
        let pw = null; for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
        if (!pw) { console.log('  – navigateur : sauté (Playwright absent)'); return; }
        browser = await pw.chromium.launch();
        const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        const page = await ctx.newPage(); const errors = [];
        page.on('pageerror', e => errors.push('pageerror ' + e.message)); page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push('console ' + m.text()); });
        const shot = async name => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name + '.png') }); } };
        await page.goto(base); await page.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.openWorkbook && window.LCNDA_EXT.sheetBase && window.LCNDA_SHEET);
        const ed = () => 'window.LCNDA_EXT.tableurInternals.current';
        await page.evaluate(() => window.LCNDA_EXT.openWorkbook({ name: 'Essai base' }));
        await page.waitForSelector('.xl-dlg[open]');
        await page.click('[data-xl-menu="Données"] summary');
        ok(await page.isVisible('[data-xl-cmd="appfill"]') && await page.isVisible('[data-xl-cmd="apppush"]') && await page.isVisible('[data-xl-cmd="appsync"]'), 'menu Données : remplir, relire, envoyer');
        await page.click('[data-xl-cmd="appfill"]');
        await page.waitForSelector('.xl-base-dlg [data-bgo]:not([disabled])');
        eq(await page.$eval('.xl-base-dlg [data-bgo]', b => b.textContent), '⤒ Remplir 6 lignes', 'bouton « ⤒ Remplir N lignes »');
        ok(await page.$$eval('.xl-base-col', els => els.length) === 8 && await page.isVisible('.xl-base-dlg .ui-listbar'), 'colonnes rangeables et barre H10');
        await page.click('.xl-base-col[data-bk="sosa"] [data-brm]');
        await page.waitForFunction(() => !document.querySelector('.xl-base-col[data-bk="sosa"]') && document.querySelector('.xl-base-dlg [data-bgo]:not([disabled])'));
        await page.click('.xl-base-dlg [data-badd]'); await page.click('.ui-menu-at button:has-text("Conjoint"), [role=menu] button:has-text("Conjoint")');
        await page.waitForFunction(() => document.querySelector('.xl-base-col[data-bk="spouse"]') && document.querySelector('.xl-base-dlg [data-bgo]:not([disabled])'));
        await shot('remplir');
        await page.click('.xl-base-dlg [data-bgo]');
        await page.waitForFunction(e => eval(e).S().link?.n === 6, ed());
        const info = await page.evaluate(e => { const x = eval(e), sh = x.S(); return { name: sh.name, head: [0, 1, 2, 3, 4, 5, 6, 7].map(c => sh.cells[window.LCNDA_SHEET.addr(0, c)]?.v), A2: sh.cells.A2, dv: sh.dv.map(d => d.kind) }; }, ed());
        eq(info.head, ['Personne', 'Génération', 'Naissance', 'Lieu de naissance', 'Décès', 'Âge au décès', 'Métier', 'Conjoint'], 'en-têtes dans l’ordre choisi');
        ok(info.A2.ref?.kind === 'person' && info.dv.includes('person') && info.dv.includes('place'), 'cellules « personne » reliées, menu de choix posé sur la colonne');
        ok(await page.isVisible('[data-xl-baselink]') && /Tenue à jour/.test(await page.textContent('[data-xl-baselink]')), 'bandeau 🔗');
        await shot('rempli');
        // une note à soi à droite, sur la ligne de Jean MARTIN ; puis la base change
        const jeanRow = await page.evaluate(e => { const x = eval(e), sh = x.S(); for (let r = 1; r <= 6; r++) if (sh.cells[window.LCNDA_SHEET.addr(r, 0)]?.ref?.id === 1) return r; return -1; }, ed());
        await page.evaluate(([e, r]) => { const x = eval(e), sh = x.S(); x.begin('note'); x.put(sh, window.LCNDA_SHEET.addr(r, 9), { v: 'note de Jean' }); x.commit(); x.render(); }, [ed(), jeanRow]);
        await page.evaluate(async () => { const A = window.LCNDA_APP; await A.api('save_person', {}, { method: 'POST', body: { first_name: 'Zoé', last_name: 'AARON', gender: 'female' } }); await A.api('save_person', {}, { method: 'POST', body: { id: 1, first_name: 'Jean-Baptiste', last_name: 'MARTIN', gender: 'male' } }); });
        await page.click('[data-xl-baselink] [data-bl="sync"]');
        await page.waitForFunction(e => eval(e).S().link?.n === 7, ed());
        const moved = await page.evaluate(e => { const x = eval(e), sh = x.S(), S = window.LCNDA_SHEET; for (let r = 1; r <= 7; r++) if (sh.cells[S.addr(r, 9)]?.v === 'note de Jean') return sh.cells[S.addr(r, 0)]; return null; }, ed());
        eq(moved, { v: 'Jean-Baptiste MARTIN', ref: { kind: 'person', id: 1 } }, '↻ Relire : la note suit la ligne de sa fiche, le nom a changé');
        await page.evaluate(e => eval(e).undo(), ed());
        eq(await page.evaluate(e => eval(e).S().link.n, ed()), 6, '↶ défait la relecture');
        await page.evaluate(async e => { const x = eval(e); x.wb.sheets[0].cells.B2 = { v: 'Jean MARTIN', ref: { kind: 'person', id: 1 } }; await window.LCNDA_EXT.sheetBase.relabel(x); }, ed());
        eq(await page.evaluate(e => eval(e).wb.sheets[0].cells.B2.v, ed()), 'Jean-Baptiste MARTIN', 'une cellule « personne » suit le nouveau nom');
        await page.evaluate(async () => { await window.LCNDA_APP.api('save_person', {}, { method: 'POST', body: { id: 1, first_name: 'Jean', last_name: 'MARTIN', gender: 'male' } }); });
        // modèle « Relevé de recensement » : colonnes de l'année
        await page.evaluate(e => { const x = eval(e); x.dirty = false; x.dlg.close(); }, ed());
        await page.evaluate(() => { const E = window.LCNDA_EXT, t = E.sheetTemplates.find(x => x.key === 'census'); E.openWorkbook({ data: t.make(), name: t.name }); });
        await page.waitForSelector('[data-xl-baselink] [data-bl-year]');
        await page.selectOption('[data-xl-baselink] [data-bl-year]', '1906');
        await page.waitForFunction(e => eval(e).S().link.year === 1906, ed());
        eq(await page.evaluate(e => { const x = eval(e), S = window.LCNDA_SHEET; return [S.addr(2, 5), x.S().cells[S.addr(2, 5)].v, x.S().cells.D1.v]; }, ed()), ['F3', 'Année de naissance', 1906], '1906 : année et lieu de naissance au lieu de l’âge');
        await page.selectOption('[data-xl-baselink] [data-bl-year]', '1836');
        await page.waitForFunction(e => eval(e).S().link.year === 1836, ed());
        await page.evaluate(e => { const x = eval(e), S = window.LCNDA_SHEET, sh = x.S();
            const rows = [[1, 1, 'MARTIN', 'Jean', 'laboureur', 62, null, 'marié'], [1, 1, 'MARTIN', 'Marie', 'fileuse', 58, null, 'mariée'], [2, 2, 'DURAND', 'Pierre', 'meunier', 45], [3, 3, 'BERNARD', 'Louis', '', 214]];
            x.begin('saisie'); rows.forEach((r, i) => r.forEach((v, j) => { if (v != null && v !== '') x.put(sh, S.addr(3 + i, j), { v }); })); x.put(sh, 'B1', { v: 'Saint-Martin', ref: { kind: 'place', id: 1 } }); x.commit(); x.render(); }, ed());
        const before2 = snapshot();
        await page.click('[data-xl-baselink] [data-bl="push"]');
        await page.waitForSelector('.xl-push-dlg[open] [data-pf]');
        eq(await page.$$eval('.xl-push-dlg [data-pf]', s => s.map(x => x.value)), ['house', 'household', 'last_name', 'first_name', 'occupation', 'age', 'birth', 'status', 'notes'], 'étape 1 : colonnes devinées');
        eq(await page.inputValue('.xl-push-dlg [name=year]'), '1836', 'étape 1 : l’année du relevé');
        await shot('envoyer-1');
        await page.click('.xl-push-dlg [data-pgo]');
        await page.waitForSelector('.xl-push-res');
        eq(await page.$$eval('.xl-push-res tr[data-ps]', t => t.map(x => x.dataset.ps)), ['linked', 'new', 'check', 'problem'], 'étape 2 : une ligne par personne');
        ok(await page.$$eval('.xl-push-res .ui-badge', b => b.map(x => x.textContent).join('|')) === 'Déjà dans la base|Nouvelle fiche|À vérifier|Problème', 'badges K8');
        await page.selectOption('.xl-push-res [data-pd]', 'link:3');
        eq(await page.$eval('.xl-push-dlg [data-pgo]', b => b.textContent), '📤 Créer 1 fiche et en relier 2', 'étape 3 : « 📤 Créer 1 fiche et en relier 2 »');
        await shot('envoyer-2');
        await page.click('.xl-push-dlg [data-pgo]');
        await page.waitForFunction(() => window.LCNDA_EXT.sheetBase.lastPush);
        ok(await page.waitForSelector('text=1 fiche créée, 2 reliées et 2 foyers', { timeout: 5000 }), 'message H7');
        ok(diffData(before2, snapshot()).length > 0, 'envoyé dans la base');
        await shot('envoye');
        await page.click('.ui-toast:has-text("foyers depuis") button:has-text("↶ Annuler")');
        await page.waitForSelector('.ui-toast:has-text("↶ Annulé")');
        eq(diffData(before2, snapshot()), [], '↶ Annuler (message H7) : la base est exactement comme avant');
        // 390 px, sombre
        await page.setViewportSize({ width: 390, height: 800 });
        await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
        await page.evaluate(e => window.LCNDA_EXT.sheetCommands.apppush(eval(e)), ed());
        await page.waitForSelector('.xl-push-dlg[open] [data-pf]');
        ok(await page.$eval('.xl-push-dlg', d => d.scrollWidth <= d.clientWidth + 1), '390 px : la fenêtre d’envoi ne déborde pas');
        await shot('envoyer-390-sombre');
        await page.click('.xl-push-dlg [data-px] >> nth=0');
        await page.evaluate(e => window.LCNDA_EXT.sheetCommands.appfill(eval(e)), ed());
        await page.waitForSelector('.xl-base-dlg [data-bgo]:not([disabled])');
        ok(await page.$eval('.xl-base-dlg', d => d.scrollWidth <= d.clientWidth + 1), '390 px : la fenêtre « Remplir » ne déborde pas');
        await shot('remplir-390-sombre');
        await page.click('.xl-base-dlg [data-bx] >> nth=0');
        await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.evaluate(e => { const x = eval(e); x.dirty = false; x.dlg.close(); }, ed());
        // 📜 Dépouillements : « 🧮 Dans le tableur » (personnes et foyers de la page)
        await page.evaluate(() => { const s = window.LCNDA_APP.state; s.hDigest = { id: 1, page: '3', tab: 'pages', q: '', type: '', status: '', image: 0 }; s.listType = 'depouillements'; window.LCNDA_APP.setModule('listes'); });
        await page.waitForSelector('[data-dp-sheet]', { timeout: 10000 });
        await page.click('[data-dp-sheet]');
        await page.waitForFunction(() => window.LCNDA_EXT.tableurInternals.current?.S()?.link?.src?.source === 'digest' && window.LCNDA_EXT.tableurInternals.current.dlg.open);
        eq(await page.evaluate(e => { const x = eval(e), S = window.LCNDA_SHEET, sh = x.S(); return [0, 1, 2, 3, 4, 5, 6, 7].map(c => sh.cells[S.addr(0, c)]?.v).concat([sh.cells.D2?.v, sh.link.n]); }, ed()), ['Rue', 'N°', 'Foyer', 'Nom', 'Prénom', 'Âge', 'Métier', 'Lien avec le chef', 'MARTIN', 2], 'Dépouillements : la page dans le tableur, tenue à jour');
        await shot('depouillement');
        await page.evaluate(e => { const x = eval(e); x.dirty = false; x.dlg.close(); }, ed());
        // 📚 Atelier : un élément « 🧮 Classeur » dans un dossier du projet
        const at = await page.evaluate(async () => { const A = window.LCNDA_APP, post = (a, b) => A.api(a, {}, { method: 'POST', body: b });
            const pr = await post('save_atelier_project', { title: 'Projet essai' }); const pid = pr.result.id;
            const wb = await post('save_workbook', { name: 'Budget', kind: 'book', data: window.LCNDA_SHEET.compact(window.LCNDA_SHEET.newWorkbook()) });
            await post('save_atelier_item', { project_id: pid, type: 'app', title: 'Budget', data: { kind: 'workbook', key: String(wb.result.id), label: 'Budget' } });
            const p = await A.api('atelier_project', { id: pid }); return (p.items || []).map(i => i.data?.kind); });
        eq(at, ['workbook'], 'Atelier : l’élément « 🧮 Classeur » est gardé');
        eq(errors, [], 'aucune erreur dans la console');
        await ctx.close();
        console.log(`✓ test-tableur-base : ${n} vérifications`);
    } catch (e) {
        console.error(e); process.exitCode = 1;
    } finally {
        if (browser) await browser.close().catch(() => {});
        proc.kill();
        fs.rmSync(dir, { recursive: true, force: true });
    }
})();
