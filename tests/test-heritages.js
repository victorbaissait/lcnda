'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🏠 Héritages et successions (Listes → Médias et documents → « 🏠 Héritages et successions ») :   node tests/test-heritages.js
 *  1. serveur (PHP, base neuve) : migration (3 tables) ; un acte de partage avec le défunt, des héritiers (rôles), une personne
 *     sans fiche, des biens (maison, somme, objet de famille, parcelle) et à qui ils vont ; liens forgés refusés ou retirés
 *     (sorte d'acte ou de bien, fiche absente, héritier coché qui n'est pas dans l'acte) ; acte vide refusé ; la CHAÎNE DES
 *     PROPRIÉTAIRES d'une maison sur 3 générations (partage 1850 → testament 1890 → donation 1925), dans l'ordre ; la chaîne d'un
 *     objet mêle les actes et la transmission notée sur l'objet ; « Ce qu'il a reçu / transmis » d'une personne ; fiche de la
 *     personne (heritage_person_data) ; menu de choix (objets de famille, inventaires après décès) ; supprimer puis « ↶ Annuler »,
 *     modifier puis « ↶ Annuler » (l'acte d'avant revient tel quel) ;
 *  2. navigateur (Playwright ; sinon sauté) : liste vide (grande boîte) → « ＋ Nouvel acte » : défunt et héritiers par le menu de
 *     choix à rôles, un bien maison (menu de choix) coché pour un héritier → fiche (biens, schéma de partage Sankey) → liste (H10) ;
 *     frise dans l'outil Maison ; bloc de la fiche personne ; supprimer + « ↶ Annuler » ; sans jeton CSRF et en mode consultation :
 *     écriture refusée ; 1440 px, 390 px et sombre sans défilement de côté ni erreur.
 *  Captures si HERITAGES_SHOTS=dossier.
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
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-heritages-'));
const env = { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media'), GENEALOGY_SKIP_REFERENCE: '1' };
fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
const SHOTS = process.env.HERITAGES_SHOTS || '';
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; }; const eq = (a, b, m) => { assert.deepStrictEqual(a, b, m); n++; };
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });

/* ═════ 1. Serveur ═════ */
const code = String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p0->exec("INSERT INTO persons(first_name,last_name,gender) VALUES('Jean','Martin','male'),('Pierre','Martin','male'),('Marie','Martin','female'),('Louis','Martin','male'),('Paul','Martin','male')");
$p0 = null;
require 'lib/bootstrap.php';
require_once 'lib/picker.php';
$pdo = db();
$o = [];
$try = static function (callable $f) { try { return ['ok' => $f()]; } catch (Throwable $e) { return ['err' => $e->getMessage()]; } };
$o['version'] = [(int) $pdo->query('PRAGMA user_version')->fetchColumn(), SCHEMA_VERSION];
$o['tables'] = $pdo->query("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'succession%' ORDER BY name")->fetchAll(PDO::FETCH_COLUMN);
houses_ensure($pdo); $pdo->exec("INSERT INTO houses(name, data_json) VALUES('Maison du Bourg', '{}')"); $house = (int) $pdo->lastInsertId();
$pdo->exec("INSERT INTO family_objects(title, kind) VALUES('Horloge comtoise', 'meuble')"); $obj = (int) $pdo->lastInsertId();
$pdo->exec("INSERT INTO family_object_transfers(object_id, from_person_id, to_person_id, date_text, year) VALUES($obj, 3, 4, '1880', 1880)");
$pdo->exec("INSERT INTO places(name, county, country) VALUES('Tulle', 'Corrèze', 'France')"); $pl = (int) $pdo->lastInsertId();
$pdo->exec("INSERT INTO probate_inventories(person_id, date_text, year, notary) VALUES(1, '2 mars 1850', 1850, 'Lafon')"); $inv = (int) $pdo->lastInsertId();
// 1850 : partage des biens de Jean (défunt) entre Pierre et Marie
$a1 = save_succession($pdo, ['kind' => 'partage', 'date_text' => '12 mars 1850', 'notary_text' => 'Me Lafon', 'office_text' => 'Étude Lafon, Tulle', 'place_id' => $pl, 'cote' => '3 E 12/345', 'probate_id' => $inv,
    'people' => ['main' => ['id' => 1], 'people' => [['id' => 2, 'role' => 'héritier', 'primary' => true], ['id' => 3, 'role' => 'héritière', 'primary' => true], ['txt' => 'le curé Faure', 'role' => 'témoin', 'primary' => false], ['id' => 999, 'role' => 'fantôme', 'primary' => true]]],
    'goods' => [['kind' => 'house', 'ref_id' => $house, 'label' => 'la maison et le jardin', 'value_amount' => 1200, 'value_unit' => 'livre', 'share_text' => 'en entier', 'to' => ['2', '999', 'txt:inconnu']],
        ['kind' => 'money', 'label' => 'argent comptant', 'value_amount' => 300, 'value_unit' => 'franc'],
        ['kind' => 'object', 'ref_id' => $obj, 'to' => ['3']], ['kind' => 'parcel', 'ref_id' => 777, 'label' => 'le pré'], ['kind' => 'land', 'label' => '']]]);
$o['a1'] = [$a1['id'] > 0, $a1['title'], $a1['before']];
$g = succession_get($pdo, $a1['id']);
$o['a1_people'] = array_map(static fn($p) => $p['zone'] . ':' . $p['title'] . ':' . $p['role'], $g['people']);
$o['a1_goods'] = array_map(static fn($x) => [$x['kind'], $x['ref_id'] ? $x['ref_title'] : $x['label'], $x['to']], $g['goods']);
$o['a1_misc'] = [$g['year'], $g['place'], $g['notary'], $g['probate_title'], $g['cote']];
$o['recipients'] = array_map(static fn($x) => array_map(static fn($p) => $p['title'], succ_recipients($g, $x)), $g['goods']);
// 1890 : testament de Pierre pour Louis ; 1925 : donation de Louis à Paul
$a2 = save_succession($pdo, ['kind' => 'testament', 'date_text' => 'vers 1890', 'people' => ['main' => 2, 'people' => [['id' => 4, 'role' => 'légataire universel', 'primary' => true]]], 'goods' => [['kind' => 'house', 'ref_id' => $house]]]);
$a3 = save_succession($pdo, ['kind' => 'donation', 'date_text' => '5 juin 1925', 'people' => ['main' => ['id' => 4], 'people' => [['id' => 5, 'role' => 'donataire', 'primary' => true]]], 'goods' => [['kind' => 'house', 'ref_id' => $house, 'share_text' => 'en nue-propriété']]]);
$ch = succession_chain($pdo, 'house', $house);
$o['chain'] = [$ch['title'], array_map(static fn($s) => [$s['year'], implode('+', array_column($s['from'], 'title')), implode('+', array_column($s['to'], 'title'))], $ch['steps'])];
$oc = succession_chain($pdo, 'object', $obj);
$o['chain_obj'] = array_map(static fn($s) => [$s['source'], $s['year'], implode('+', array_column($s['from'], 'title')), implode('+', array_column($s['to'], 'title'))], $oc['steps']);
$o['chain_bad'] = $try(fn() => succession_chain($pdo, 'persons', 1));
$fp = successions_for_person($pdo, 2);
$o['person'] = array_map(static fn($x) => [$x['side'], $x['kind'], array_map(static fn($gg) => $gg['ref_title'] ?: $gg['label'], $x['received'])], $fp);
$o['heritage'] = count(heritage_person_data($pdo, 4)['successions']);
$o['forged_kind'] = $try(fn() => save_succession($pdo, ['kind' => 'x; DROP', 'title' => 'T', 'goods' => [['kind' => '<script>', 'label' => 'a']]]));
$o['bad_value'] = $try(fn() => save_succession($pdo, ['title' => 'T', 'goods' => [['kind' => 'money', 'value_amount' => 'mille']]]));
$o['empty'] = $try(fn() => save_succession($pdo, ['notes' => 'rien']));
$o['forged_people'] = $try(fn() => save_succession($pdo, ['title' => 'T', 'people' => 'pas du json']));
$pdo->prepare('DELETE FROM succession_acts WHERE title=?')->execute(['T']);
$o['picker'] = [array_map(static fn($i) => $i['title'], picker_family_objects($pdo, 'horl', 0, 10)['items']), array_map(static fn($i) => $i['title'], picker_probates($pdo, 'lafon', 0, 10)['items'])];
$o['picker_kind'] = array_map(static fn($i) => $i['title'], picker_search($pdo, ['kind' => 'fobject', 'q' => 'comtoise'])['groups'][0]['items']);
// supprimer puis « ↶ Annuler »
delete_succession($pdo, ['id' => $a2['id']]);
$o['after_delete'] = [count(successions_list($pdo)), count(succession_chain($pdo, 'house', $house)['steps'])];
restore_succession($pdo, ['id' => $a2['id']]);
$o['after_restore'] = [count(successions_list($pdo)), count(succession_chain($pdo, 'house', $house)['steps'])];
$o['restore_twice'] = $try(fn() => restore_succession($pdo, ['id' => $a2['id']]));
// modifier puis « ↶ Annuler » : l'acte d'avant revient tel quel
$before = succession_get($pdo, $a1['id']);
$m = save_succession($pdo, ['id' => $a1['id'], 'kind' => 'partage', 'title' => 'Changé', 'people' => ['main' => 1, 'people' => []], 'goods' => []]);
$o['modified'] = [succession_get($pdo, $a1['id'])['title'], count(succession_get($pdo, $a1['id'])['goods']), is_array($m['before'])];
save_succession($pdo, json_decode(json_encode($m['before']), true));
$after = succession_get($pdo, $a1['id']);
$strip = static fn($a) => [$a['kind'], $a['title'], $a['date_text'], $a['notary'], $a['place_id'], $a['probate_id'], $a['people'], $a['goods']];
$o['undo_edit'] = $strip($after) === $strip($before);
echo json_encode($o, JSON_UNESCAPED_UNICODE);
`;
const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], { cwd: appRoot, encoding: 'utf8', env });
if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exit(1); }
const o = JSON.parse(r.stdout.slice(r.stdout.indexOf('{')));
eq(o.version[0], o.version[1], 'base à jour (migrations)');
eq(o.tables, ['succession_acts', 'succession_goods', 'succession_people'], 'tables des héritages');
eq(o.a1, [true, 'Partage de Jean MARTIN (1850)', null], 'acte créé, titre tout seul');
eq(o.a1_people, ['main:Jean MARTIN:', 'primary:Pierre MARTIN:héritier', 'primary:Marie MARTIN:héritière', 'secondary:le curé Faure:témoin'], 'personnes et rôles (la fiche n° 999 absente est retirée)');
eq(o.a1_goods, [['house', 'Maison du Bourg', ['2']], ['money', 'argent comptant', []], ['object', 'Horloge comtoise', ['3']], ['parcel', 'le pré', []]], 'biens : maison, somme, objet ; parcelle absente → texte ; ligne vide retirée ; héritier coché hors de l’acte retiré');
eq(o.a1_misc, [1850, 'Tulle', 'Me Lafon', 'Inventaire 2 mars 1850 · Lafon', '3 E 12/345'], 'date, lieu, notaire, inventaire après décès relié, cote');
eq(o.recipients, [['Pierre MARTIN'], ['Pierre MARTIN', 'Marie MARTIN'], ['Marie MARTIN'], ['Pierre MARTIN', 'Marie MARTIN']], 'à qui : les cochés, sinon tous les héritiers');
eq(o.chain, ['Maison du Bourg', [[1850, 'Jean MARTIN', 'Pierre MARTIN'], [1890, 'Pierre MARTIN', 'Louis MARTIN'], [1925, 'Louis MARTIN', 'Paul MARTIN']]], 'chaîne des propriétaires de la maison sur 3 générations, dans l’ordre');
eq(o.chain_obj, [['act', 1850, 'Jean MARTIN', 'Marie MARTIN'], ['transfer', 1880, 'Marie MARTIN', 'Louis MARTIN']], 'chaîne d’un objet : acte + transmission notée sur l’objet');
ok(/inconnu/.test(o.chain_bad.err || ''), 'chaîne d’une sorte forgée refusée');
eq(o.person, [['got', 'partage', ['Maison du Bourg', 'argent comptant', 'le pré']], ['gave', 'testament', []]], 'Pierre : ce qu’il a reçu (1850) et transmis (1890)');
eq(o.heritage, 2, 'fiche de Louis : 2 actes (reçu, transmis)');
ok(/inconnue/.test(o.forged_kind.err || ''), 'sorte de bien forgée refusée');
ok(/nombre/.test(o.bad_value.err || ''), 'valeur qui n’est pas un nombre refusée');
ok(/au moins/.test(o.empty.err || ''), 'acte vide refusé');
ok(o.forged_people.ok, 'personnes illisibles : ignorées, sans plantage');
eq(o.picker, [['Horloge comtoise'], ['Inventaire de Jean MARTIN (2 mars 1850)']], 'menu de choix : objets de famille, inventaires après décès');
eq(o.picker_kind, ['Horloge comtoise'], 'picker_search : sorte « fobject »');
eq(o.after_delete, [2, 2], 'supprimé : hors de la liste et de la chaîne');
eq(o.after_restore, [3, 3], '« ↶ Annuler » : revenu');
ok(o.restore_twice.err, 'remettre deux fois : refusé');
eq(o.modified, ['Changé', 0, true], 'modifié (l’acte d’avant est rendu pour « ↶ Annuler »)');
ok(o.undo_edit, '« ↶ Annuler » une modification : l’acte d’avant revient tel quel');
console.log(`  ✓ serveur : ${n} vérifications`);

/* ═════ 2. Navigateur ═════ */
(async () => {
    let pw = null; for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
    if (!pw) { console.log('  – navigateur : sauté (Playwright absent)'); fs.rmSync(dir, { recursive: true, force: true }); return; }
    // une base neuve pour le navigateur : les actes sont à créer à l'écran
    spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', `require 'lib/paths.php'; require 'lib/bootstrap.php'; $pdo = db(); foreach (['succession_goods', 'succession_people', 'succession_acts'] as $t) { $pdo->exec("DELETE FROM $t"); }`], { cwd: appRoot, encoding: 'utf8', env });
    const port = await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env, stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r2 => setTimeout(r2, 100)); } }
    const browser = await pw.chromium.launch();
    const shot = async (page, name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: false }); } };
    const watch = page => { const errs = []; page.on('pageerror', e => errs.push('pageerror ' + e.message)); page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errs.push('console ' + m.text()); }); return errs; };
    const ready = page => page.waitForFunction(() => window.LCNDA_APP?.setModule && window.LCNDA_EXT?.successions && window.LCNDA_APP.state.csrf, null, { timeout: 60000 });
    const openList0 = (page, id = 0) => page.evaluate(i => { const s = window.LCNDA_APP.state; s.listType = 'successions'; s.succId = i; window.LCNDA_APP.setModule('listes'); }, id);
    // l'écran de départ peut finir de se dessiner juste après : on redemande la page si elle n'est pas venue
    const openList = async (page, id = 0) => { for (let t = 0; t < 3; t++) { await openList0(page, id); try { await page.waitForSelector(id ? '.sc-sheet' : '.sc-page [data-sc-list]', { timeout: 6000 }); return; } catch (_) {} } };
    try {
        const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        await ctx.route(/^https:\/\//, rt => rt.abort());
        const page = await ctx.newPage(); const errors = watch(page);
        await page.goto(base); await ready(page);
        const api = (action, body, get = false) => page.evaluate(async ({ action, body, get }) => { try { const r = get ? await window.LCNDA_APP.api(action, body || {}) : await window.LCNDA_APP.api(action, {}, { method: 'POST', body }); return { ok: true, r }; } catch (e) { return { ok: false, e: e.message }; } }, { action, body, get });
        const houseId = (await api('houses', {}, true)).r.items.find(h => h.name === 'Maison du Bourg').id;

        // la liste vide, puis « ＋ Nouvel acte »
        await openList(page);
        await page.waitForSelector('.sc-page [data-sc-list] .empty-state, .sc-page [data-sc-list] [class*="empty"]', { timeout: 15000 });
        ok(/Aucun acte pour l’instant/.test(await page.textContent('.sc-page')), 'liste vide : la grande boîte');
        ok(/Médias et documents/.test(await page.textContent('.sc-page .page-header, .sc-page header')), 'K5 : sur-titre « Listes · Médias et documents »');
        ok(await page.evaluate(() => [...document.querySelectorAll('.side-menu-item, [data-side-value]')].some(e => e.dataset.sideValue === 'successions')), 'la liste est dans la colonne de gauche');
        await shot(page, 'liste-vide');
        await page.click('.sc-page [data-sc-new] >> nth=0'); await page.waitForSelector('dialog[open] .sc-edit');
        const dlg = page.locator('dialog[open]');
        await dlg.locator('select[name="kind"]').selectOption('partage');
        await dlg.locator('input[name="date_text"]').fill('12 mars 1850');
        // défunt (⭐) puis héritiers (★) par le menu de choix à rôles
        const pk = dlg.locator('[data-sc-f="people"]');
        const pick = async (q, zone) => { const s = pk.locator(`.pk-search[data-target="${zone}"]`); const inp = s.locator('.pk-input'); await inp.click(); await inp.fill(q); await page.waitForTimeout(900); await s.locator('.pk-row').first().click(); await page.waitForTimeout(400); };
        ok(await pk.locator('.pk-zone[data-zone="primary"]').count() === 1 && /Héritiers et bénéficiaires/.test(await pk.textContent()), 'menu de choix à rôles : zones « Héritiers et bénéficiaires » et « Autres personnes »');
        await pick('Jean', 'main'); await pick('Pierre', 'primary'); await pick('Marie', 'primary');
        const pv = await page.evaluate(() => window.LCNDA_PICKER.pickerValue(document.querySelector('dialog[open] [data-sc-f="people"] .pk')));
        ok(pv.main === 1 || pv.main === Number(pv.main), 'le défunt choisi : ' + JSON.stringify(pv));
        ok((pv.people || []).filter(p => p.primary).length === 2, 'deux héritiers choisis : ' + JSON.stringify(pv));
        // un bien : la maison (menu de choix), cochée pour Pierre
        await dlg.locator('.sc-good [data-g="kind"]').first().selectOption('house'); await page.waitForTimeout(300);
        const ref = dlg.locator('.sc-good [data-g="ref"] .pk-input').first(); await ref.click(); await ref.fill('Bourg'); await page.waitForTimeout(900);
        await dlg.locator('.sc-good [data-g="ref"] .pk-row').first().click(); await page.waitForTimeout(300);
        await dlg.locator('.sc-good [data-g="value_amount"]').first().fill('1200'); await dlg.locator('.sc-good [data-g="value_unit"]').first().selectOption('livre');
        await page.waitForTimeout(200);
        ok(/€ d’aujourd’hui/.test(await dlg.locator('.sc-good [data-g="worth"]').first().textContent()), 'valeur : l’ordre de grandeur en euros (convertisseur)');
        const pierre = dlg.locator('.sc-good [data-g="to"]').first(); await pierre.check();
        await dlg.locator('[data-sc-addgood]').click(); await dlg.locator('.sc-good [data-g="kind"]').nth(1).selectOption('money');
        await dlg.locator('.sc-good [data-g="label"]').nth(1).fill('la dot de Marie'); await dlg.locator('.sc-good [data-g="value_amount"]').nth(1).fill('300'); await dlg.locator('.sc-good [data-g="value_unit"]').nth(1).selectOption('livre');
        await dlg.locator('.sc-good').nth(1).locator('[data-g="to"]').nth(1).check();
        await shot(page, 'nouvel-acte');
        await dlg.locator('.modal-actions [type=submit]').click(); await page.waitForTimeout(1200);
        let list = (await api('successions', {}, true)).r.items;
        eq(list.length, 1, 'acte créé à l’écran');
        eq(list[0].goods.map(g => [g.kind, g.ref_title || g.label, g.to.length]), [['house', 'Maison du Bourg', 1], ['money', 'la dot de Marie', 1]], 'biens enregistrés, à qui');
        ok(await page.locator('.toast, .h7-toast, [class*="toast"]').filter({ hasText: '↶ Annuler' }).count() > 0, 'H7 : « ↶ Annuler » après la création');
        await page.waitForSelector('.sc-sheet');
        ok(await page.locator('.sc-sheet .sc-share svg').count() === 1, 'schéma de partage (moteur de diagrammes : Sankey)');
        ok(/Pierre MARTIN/.test(await page.textContent('.sc-goods-table')), 'fiche : les biens et à qui');
        await shot(page, 'fiche-acte');

        // deux autres actes (par l'API) : chaîne sur 3 générations dans l'outil Maison
        await api('save_succession', { kind: 'testament', date_text: '1890', people: { main: 2, people: [{ id: 4, role: 'légataire', primary: true }] }, goods: [{ kind: 'house', ref_id: houseId }] });
        await api('save_succession', { kind: 'donation', date_text: '1925', people: { main: 4, people: [{ id: 5, role: 'donataire', primary: true }] }, goods: [{ kind: 'house', ref_id: houseId }] });
        await page.evaluate(id => window.LCNDA_EXT.openHouse({ id }), houseId); await page.waitForTimeout(2500);
        if (await page.locator('[data-hs-tab="house"]').count()) { await page.locator('[data-hs-tab="house"]').first().click(); await page.waitForTimeout(600); }
        const sum = page.locator('summary:has-text("Chaîne des propriétaires")'); if (await sum.count() && !(await sum.first().evaluate(s => s.parentElement.open))) { await sum.first().click(); await page.waitForTimeout(400); }
        await page.waitForSelector('[data-succ-host="house"] .sc-frise', { timeout: 20000 }).catch(() => {});
        const steps = await page.$$eval('[data-succ-host="house"] .sc-step-year', els => els.map(e => e.textContent.trim()));
        eq(steps, ['1850', '1890', '1925'], 'outil Maison : frise des propriétaires sur 3 générations');
        await page.locator('[data-succ-host="house"]').scrollIntoViewIfNeeded().catch(() => {});
        await shot(page, 'maison-frise');
        await page.keyboard.press('Escape'); await page.waitForTimeout(300);
        await page.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close()));

        // fiche de la personne : « Ce qu'il a reçu / transmis »
        await page.evaluate(() => window.LCNDA_APP.openPersonById(2)); await page.waitForTimeout(2500);
        await page.waitForSelector('.sc-pblock', { timeout: 15000 }).catch(() => {});
        const pb = await page.textContent('.sc-pblock').catch(() => '');
        ok(/Ce qu’il a reçu/.test(pb) && /Ce qu’il a transmis/.test(pb) && /Maison du Bourg/.test(pb), 'fiche de Pierre : reçu et transmis');
        await page.locator('.sc-pblock').scrollIntoViewIfNeeded().catch(() => {});
        await shot(page, 'fiche-personne');

        // la liste (H10), supprimer puis « ↶ Annuler »
        await openList(page); await page.waitForSelector('.sc-page [data-sc-row]');
        eq(await page.locator('.sc-page [data-sc-row]').count(), 3, 'liste : 3 actes');
        ok(await page.locator('.sc-page .list-bar, .sc-page [class*="listbar"], .sc-page .ui-listbar').count() > 0, 'H10 : la barre commune');
        await shot(page, 'liste');
        const first = list[0].id;
        await openList(page, first); await page.waitForSelector('.sc-sheet');
        await page.evaluate(() => document.querySelector('[data-sc-delme]').click()); await page.waitForTimeout(900);
        eq((await api('successions', {}, true)).r.items.length, 2, 'supprimé tout de suite (pas de question)');
        await page.getByRole('button', { name: '↶ Annuler' }).last().click(); await page.waitForTimeout(900);
        eq((await api('successions', {}, true)).r.items.length, 3, '« ↶ Annuler » le remet');

        // sécurité : CSRF, mode consultation
        const noCsrf = await page.evaluate(async () => (await fetch('api.php?action=save_succession', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'X' }) })).status);
        ok(noCsrf >= 400, 'sans jeton CSRF : refusé');
        ok((await api('kiosk_enter', { password: 'secret1' })).ok, 'mode consultation');
        const k = await api('save_succession', { title: 'Y' }); ok(!k.ok && /consultation/i.test(k.e), 'consultation : rien ne s’écrit');
        ok((await api('successions', {}, true)).ok, 'consultation : la liste se lit');
        await api('kiosk_exit', { password: 'secret1' });
        ok(!errors.length, 'aucune erreur (1440 px) : ' + errors.join(' | '));

        // 390 px et mode sombre
        for (const [w, dark] of [[390, false], [1440, true], [390, true]]) {
            const c2 = await browser.newContext({ viewport: { width: w, height: 840 } });
            await c2.route(/^https:\/\//, rt => rt.abort());
            if (dark) await c2.addInitScript(() => { try { const d = JSON.parse(localStorage.getItem('genealogie-design') || '{}'); d.preset = 'dark'; localStorage.setItem('genealogie-design', JSON.stringify(d)); } catch (_) {} });
            const p2 = await c2.newPage(); const errs2 = watch(p2);
            await p2.goto(base); await ready(p2);
            if (dark) ok(await p2.evaluate(() => document.documentElement.dataset.theme === 'dark'), 'thème sombre posé');
            const tag = `${w}${dark ? '-sombre' : ''}`;
            await openList(p2, first); await p2.waitForSelector('.sc-sheet'); await p2.waitForTimeout(700);
            const over = await p2.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth, Math.max(...[...document.querySelectorAll('.sc-sheet, .sc-sheet *')].filter(e => !e.closest('.sc-share')).map(e => e.getBoundingClientRect().right))]);
            ok(over[2] <= over[1] + 2 && over[0] <= over[1] + 2, `${tag} : la fiche tient dans la largeur (${over})`);
            await shot(p2, `fiche-${tag}`);
            await p2.click('.sc-page [data-sc-editme]'); await p2.waitForSelector('dialog[open] .sc-edit'); await p2.waitForTimeout(600);
            const dOver = await p2.evaluate(() => { const d = document.querySelector('dialog[open]'); return [d.scrollWidth, d.clientWidth]; });
            ok(dOver[0] <= dOver[1] + 2, `${tag} : la fenêtre n’a pas de défilement de côté (${dOver})`);
            if (dark) ok(await p2.evaluate(() => getComputedStyle(document.querySelector('dialog[open] .sc-good')).backgroundColor !== 'rgb(255, 255, 255)'), 'sombre : un bien n’est pas sur fond blanc');
            await shot(p2, `modifier-${tag}`);
            await p2.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close()));
            await openList(p2); await p2.waitForSelector('.sc-page [data-sc-row]'); await p2.waitForTimeout(400);
            const lOver = await p2.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
            ok(lOver[0] <= lOver[1] + 2, `${tag} : la liste sans défilement de côté (${lOver})`);
            await shot(p2, `liste-${tag}`);
            ok(!errs2.length, `aucune erreur (${tag}) : ${errs2.join(' | ')}`);
            await c2.close();
        }
        console.log(`  ✓ navigateur : ${n} vérifications en tout`);
    } finally {
        await browser.close(); proc.kill();
        fs.rmSync(dir, { recursive: true, force: true });
    }
})().catch(e => { console.error(e); process.exit(1); });
