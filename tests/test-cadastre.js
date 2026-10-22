'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🗺 Cadastre (Listes → Lieux et maisons → « 🗺 Cadastre ») :   node tests/test-cadastre.js
 *  1. serveur (PHP, base neuve) : migration 60 (tables, index unique sur l'identifiant) ; section, numéro, identifiant ;
 *     contour nettoyé (points impossibles, trop de points) ; recherches EN LIGNE remplacées par des réponses enregistrées
 *     (tests/fixtures/cadastre : API Carto par référence et par point, sections, WFS de la Géoplateforme en secours quand
 *     l'API Carto tombe, adresse, ventes DVF) ; enregistrer (liens vérifiés : sorte forgée refusée, fiche absente retirée),
 *     doublon refusé, supprimer puis « ↶ Annuler » (même numéro), relier une seule chose, parcelles d'une personne, d'une
 *     maison, d'un lieu (et d'un lieu tapé à la main sans code INSEE), menu de choix (sorte « parcel »), calage d'une carte
 *     ancienne avec 2 points ;
 *  2. navigateur (Playwright ; sinon sauté), toutes les adresses https:// remplacées par une image : liste vide (grande
 *     boîte) → « ＋ Ajouter une parcelle » : commune (menu de choix), section, numéro, « 🔍 Chercher » → contour et surface,
 *     sections de la commune, adresse d'aujourd'hui, propriétaire avec dates → fiche (carte, ventes DVF) → liste (H10) ;
 *     Carte : « ▦ Parcelles » (tuiles IGN + mes parcelles), « 📍 Parcelle ici » → « ＋ Ajouter cette parcelle » ; fiche de la
 *     personne « 🗺 Propriétaire de… » ; maison (onglet Maison) ; fiche du village ; supprimer + « ↶ Annuler » ; sans jeton
 *     CSRF et en mode consultation : écriture refusée ; 390 px sans défilement de côté ; mode sombre ; aucune erreur.
 *  Captures si CADASTRE_SHOTS=dossier.
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
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-cadastre-'));
const FIX = path.join(__dirname, 'fixtures', 'cadastre');
const env = { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media'), GENEALOGY_SKIP_REFERENCE: '1', LCNDA_CADASTRE_FIXTURES: FIX };
fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
const SHOTS = process.env.CADASTRE_SHOTS || '';
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; }; const eq = (a, b, m) => { assert.deepStrictEqual(a, b, m); n++; };
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

/* ═════ 1. Serveur ═════ */
const code = String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p0->exec("INSERT INTO persons(first_name,last_name,gender) VALUES('Jean','Martin','male'),('Marie','Borie','female')");
$p0 = null;
require 'lib/bootstrap.php';
require 'tests/api_functions.php';
require_once 'lib/picker.php';
$pdo = db();
$o = [];
$try = static function (callable $f) { try { return ['ok' => $f()]; } catch (Throwable $e) { return ['err' => $e->getMessage()]; } };
$o['version'] = [(int) $pdo->query('PRAGMA user_version')->fetchColumn(), SCHEMA_VERSION];
$o['tables'] = $pdo->query("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'cadastre%' ORDER BY name")->fetchAll(PDO::FETCH_COLUMN);
$o['norm'] = [cadastre_section('a'), cadastre_section(' ab '), cadastre_section('abc'), cadastre_numero('12'), cadastre_numero('0'), cadastre_numero('12345'), cadastre_insee('2a004'), cadastre_insee('1234'), cadastre_idu('19272', '000', 'AB', '0100'), cadastre_title(['section' => '0B', 'numero' => '0012'])];
[$g, $la, $lo] = cadastre_clean_geometry(['type' => 'Polygon', 'coordinates' => [[[1.77, 45.26], [1.771, 45.26], ['x', 1], [500, 45], [1.771, 45.261], [1.77, 45.261], [1.77, 45.26]]]]);
$o['geom'] = [count($g['coordinates'][0][0]), round($la, 4), round($lo, 4)];
$big = []; for ($i = 0; $i < 30000; $i++) { $big[] = [1 + $i / 1e6, 45]; }
$o['geom_big'] = cadastre_clean_geometry(['type' => 'Polygon', 'coordinates' => [$big]])[0] === null ? 'refusé' : count(cadastre_clean_geometry(['type' => 'Polygon', 'coordinates' => [$big]])[0]['coordinates'][0][0]);
$o['geom_bad'] = cadastre_clean_geometry('{"type":"Point","coordinates":[1,2]}')[0];
$pdo->exec("INSERT INTO places(name, county, country, admin4_code, latitude, longitude) VALUES('Tulle', 'Corrèze', 'France', '19272', 45.2658, 1.7723)"); $pl = (int) $pdo->lastInsertId();
$pdo->exec("INSERT INTO places(name, county, country) VALUES('Tulle', 'Corrèze', 'FRANCE')"); $plHand = (int) $pdo->lastInsertId();
houses_ensure($pdo); $pdo->exec("INSERT INTO houses(name, data_json) VALUES('Maison des Martin', '{}')"); $house = (int) $pdo->lastInsertId();
$pdo->exec("INSERT INTO old_maps(title) VALUES('Plan de 1834')"); $om = (int) $pdo->lastInsertId();
$o['ref'] = cadastre_lookup($pdo, ['mode' => 'ref', 'insee' => '19272', 'section' => 'ab', 'numero' => '100']);
$o['section'] = array_map(static fn($p) => [$p['numero'], $p['geometry']], cadastre_lookup($pdo, ['mode' => 'ref', 'insee' => '19272', 'section' => 'AB'])['parcels']);
$o['point'] = cadastre_lookup($pdo, ['mode' => 'point', 'lat' => 45.2681, 'lon' => 1.7722, 'address' => 1]);
$o['secs'] = cadastre_lookup($pdo, ['mode' => 'sections', 'insee' => '19272'])['sections'];
$w = cadastre_lookup($pdo, ['mode' => 'ref', 'insee' => '19272', 'section' => 'ZZ', 'numero' => '7']); $o['wfs'] = [$w['source'], $w['parcels'][0]['idu'] ?? ''];
$o['look_bad'] = [$try(fn() => cadastre_lookup($pdo, ['mode' => 'ref', 'insee' => 'x', 'section' => 'AB'])), $try(fn() => cadastre_lookup($pdo, ['mode' => 'point', 'lat' => 'abc', 'lon' => 1])), $try(fn() => cadastre_lookup($pdo, ['mode' => 'ref', 'insee' => '75056', 'section' => 'AB', 'numero' => '1']))];
$o['dvf'] = cadastre_dvf($pdo, ['idu' => '19272000AB0100']);
$o['dvf_bad'] = $try(fn() => cadastre_dvf($pdo, ['idu' => '../../etc']));
$o['place_hand'] = cadastre_place_info($pdo, $plHand)['insee'];
$p = $o['ref']['parcels'][0];
$links = [['kind' => 'person', 'id' => 1, 'role' => 'propriétaire', 'primary' => true, 'from' => '1834', 'to' => '1872'], ['kind' => 'person', 'id' => 0, 'txt' => 'le curé Lafon', 'role' => 'voisin'],
    ['kind' => 'person', 'id' => 999, 'role' => 'fantôme'], ['kind' => 'house', 'id' => $house], ['kind' => 'oldmap', 'id' => $om], ['kind' => 'place', 'id' => $pl]];
$s1 = save_cadastre_parcel($pdo, ['insee' => '19272', 'commune_place_id' => $pl, 'commune_name' => 'Tulle', 'section' => 'ab', 'numero' => '100', 'surface_m2' => $p['surface_m2'], 'geometry' => $p['geometry'], 'lieu_dit' => 'Le Pré', 'nature' => 'pré', 'source' => 'api', 'links' => $links]);
$o['saved'] = $s1;
$o['forged_kind'] = $try(fn() => save_cadastre_parcel($pdo, ['section' => 'C', 'numero' => '1', 'links' => [['kind' => 'persons; DROP TABLE x', 'id' => 1]]]));
$o['dup'] = $try(fn() => save_cadastre_parcel($pdo, ['insee' => '19272', 'section' => 'AB', 'numero' => '0100']));
$o['empty'] = $try(fn() => save_cadastre_parcel($pdo, ['notes' => 'rien']));
$o['bad_sec'] = $try(fn() => save_cadastre_parcel($pdo, ['section' => '<b>', 'numero' => '1']));
$d = cadastre_get($pdo, $s1['id']);
$o['get'] = [$d['parcel']['idu'], $d['parcel']['surface_m2'], count($d['links']), array_map(static fn($l) => $l['kind'] . ':' . $l['title'] . ':' . $l['role'] . ':' . $l['from'], $d['links']), $d['archives']['dept']];
$o['for_person'] = array_map(static fn($x) => [$x['title'], $x['mine']['role'] ?? ''], cadastre_for($pdo, 'person', 1));
$o['for_house'] = count(cadastre_for($pdo, 'house', $house));
$o['for_place_hand'] = count(cadastre_for($pdo, 'place', $plHand));
$o['heritage'] = count(heritage_person_data($pdo, 1)['parcels']);
$o['link'] = [cadastre_link($pdo, ['parcel_id' => $s1['id'], 'kind' => 'person', 'id' => 2, 'role' => 'fermier', 'on' => true]), cadastre_link($pdo, ['parcel_id' => $s1['id'], 'kind' => 'person', 'id' => 2, 'on' => true]), $try(fn() => cadastre_link($pdo, ['parcel_id' => $s1['id'], 'kind' => 'house', 'id' => 777, 'on' => true]))];
$o['picker'] = array_map(static fn($i) => $i['title'], picker_search_kind_test($pdo));
$snap = delete_cadastre_parcel($pdo, ['id' => $s1['id']]);
$o['gone'] = (int) $pdo->query('SELECT count(*) FROM cadastre_parcels')->fetchColumn();
$back = restore_cadastre_parcel($pdo, json_decode(json_encode($snap), true));
$o['restored'] = [$back['id'] === $s1['id'], count(cadastre_get($pdo, $back['id'])['links'])];
$o['list'] = array_map(static fn($i) => [$i['title'], $i['commune'], count($i['people']), $i['counts']['house']], cadastre_list($pdo, [])['items']);
$o['transform2'] = old_map_transform([['u' => 0, 'v' => 0, 'lat' => 45, 'lon' => 1], ['u' => 100, 'v' => 50, 'lat' => 44.999, 'lon' => 1.001]]) !== null;
echo json_encode($o, JSON_UNESCAPED_UNICODE);
function picker_search_kind_test(PDO $pdo): array { return picker_parcels($pdo, 'ab 100', 0, 10)['items']; }
`;
const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], { cwd: appRoot, encoding: 'utf8', env });
if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exit(1); }
const o = JSON.parse(r.stdout.slice(r.stdout.indexOf('{')));
eq(o.version[0], o.version[1], 'base à jour (migrations)'); ok(o.version[1] >= 60, 'migration 60 au moins');
eq(o.tables, ['cadastre_parcel_links', 'cadastre_parcels'], 'tables du cadastre');
eq(o.norm, ['0A', 'AB', '', '0012', '', '', '2A004', '', '19272000AB0100', 'Section B n° 12'], 'section, numéro, INSEE, identifiant, titre');
eq(o.geom, [5, 45.2605, 1.7705], 'contour : points impossibles retirés, centre calculé');
eq(o.geom_big, 'refusé', 'contour de plus de 20 000 points : refusé (pas de forme tronquée)'); eq(o.geom_bad, null, 'un point n’est pas un contour');
eq([o.ref.source, o.ref.parcels.length, o.ref.parcels[0].idu, o.ref.parcels[0].surface_m2, o.ref.parcels[0].geometry.type, o.ref.parcels[0].existing_id], ['apicarto', 1, '19272000AB0100', 1234, 'MultiPolygon', null], 'API Carto : parcelle par commune, section, numéro');
eq(o.section, [['0100', null], ['0101', null], ['0102', null]], 'une section entière : les numéros (sans contours)');
eq([o.point.parcels.length, o.point.parcels[0].idu, o.point.address], [1, '192720000B0233', '12 Rue du Moulin 19000 Tulle'], 'par un point : la parcelle et l’adresse d’aujourd’hui');
eq(o.secs, ['0B', 'AB', 'AC'], 'les sections de la commune');
eq(o.wfs, ['wfs', '19272000ZZ0007'], 'API Carto en panne → WFS de la Géoplateforme');
ok(/commune/.test(o.look_bad[0].err) && /Point/.test(o.look_bad[1].err) && /ne répond pas/.test(o.look_bad[2].err), 'recherches mal formées ou sans réseau : message clair ' + JSON.stringify(o.look_bad));
eq([o.dvf.sales.length, o.dvf.sales[0].valeur, o.dvf.sales[0].nature_culture, o.dvf.years], [1, 185000, 'sols', [2023]], 'DVF : la vente de la parcelle (les autres années absentes)');
ok(o.dvf_bad.err, 'DVF : identifiant forgé refusé');
eq(o.place_hand, '19272', 'un lieu tapé à la main (« Tulle », Corrèze) : la commune de même nom donne le code INSEE');
ok(o.saved.id > 0 && o.saved.title === 'Section AB n° 100', 'enregistrée');
ok(/sorte inconnue/.test(o.forged_kind.err || ''), 'lien de sorte forgée refusé');
ok(/déjà dans ta liste/.test(o.dup.err || ''), 'doublon (même identifiant) refusé');
ok(/au moins la section/.test(o.empty.err || ''), 'parcelle vide refusée'); ok(/section/.test(o.bad_sec.err || ''), 'section forgée refusée');
eq(o.get[0], '19272000AB0100'); eq(o.get[1], 1234);
eq(o.get[3], ['person:Jean MARTIN:propriétaire:1834', 'person:le curé Lafon:voisin:', 'house:Maison des Martin::', 'oldmap:Plan de 1834::', 'place:Tulle::'], 'liens relus (la fiche n° 999 absente est retirée)');
eq(o.get[4], '19', 'archives du département');
eq(o.for_person, [['Section AB n° 100', 'propriétaire']], 'parcelles d’une personne (« Propriétaire de… »)');
eq([o.for_house, o.for_place_hand, o.heritage], [1, 1, 1], 'parcelles d’une maison, d’un lieu sans code, fiche de la personne');
ok(o.link[0].ok === true && o.link[1].already === true && /n’existe pas/.test(o.link[2].err), 'relier une seule chose (une fois ; fiche absente refusée)');
eq(o.picker, ['Section AB n° 100 · Tulle'], 'menu de choix : « ab 100 » trouve la parcelle');
eq(o.gone, 0, 'supprimée'); eq(o.restored, [true, 6], '« ↶ Annuler » : même numéro, mêmes liens');
eq(o.list, [['Section AB n° 100', 'Tulle', 3, 1]], 'liste');
ok(o.transform2, 'carte ancienne calée avec 2 points');
console.log(`  ✓ serveur : ${n} vérifications`);

/* ═════ 2. Navigateur ═════ */
(async () => {
    let pw = null; for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
    if (!pw) { console.log('  – navigateur : sauté (Playwright absent)'); fs.rmSync(dir, { recursive: true, force: true }); return; }
    // une base neuve pour le navigateur (la parcelle AB 100 reste à créer à l'écran)
    spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', `require 'lib/paths.php'; require 'lib/bootstrap.php'; $pdo = db(); $pdo->exec('DELETE FROM cadastre_parcel_links'); $pdo->exec('DELETE FROM cadastre_parcels');`], { cwd: appRoot, encoding: 'utf8', env });
    const port = await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env, stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r2 => setTimeout(r2, 100)); } }
    const browser = await pw.chromium.launch();
    const shot = async (page, name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name + '.png') }); } };
    try {
        const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        await ctx.route(/^https:\/\//, rt => rt.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
        const page = await ctx.newPage(); const errors = [];
        page.on('pageerror', e => errors.push('pageerror ' + e.message)); page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push('console ' + m.text()); });
        await page.goto(base); await page.waitForFunction(() => window.LCNDA_APP?.setModule && window.LCNDA_EXT?.cadastre && window.LCNDA_APP.state.csrf, null, { timeout: 60000 });
        const api = (action, body, get = false) => page.evaluate(async ({ action, body, get }) => { try { const r = get ? await window.LCNDA_APP.api(action, body || {}) : await window.LCNDA_APP.api(action, {}, { method: 'POST', body }); return { ok: true, r }; } catch (e) { return { ok: false, e: e.message }; } }, { action, body, get });

        // la liste vide, puis « ＋ Ajouter une parcelle »
        await page.evaluate(() => { const s = window.LCNDA_APP.state; s.listType = 'cadastre'; s.cadastreId = 0; window.LCNDA_APP.setModule('listes'); });
        await page.waitForSelector('.cad-page .empty-state, .cad-page [data-empty]', { timeout: 15000 }).catch(() => {});
        ok(/Aucune parcelle pour l’instant/.test(await page.textContent('.cad-page')), 'liste vide : la grande boîte');
        ok(/Lieux et maisons/.test(await page.textContent('.cad-page .page-header, .cad-page header')), 'K5 : sur-titre « Listes · Lieux et maisons »');
        await shot(page, 'liste-vide');
        await page.click('.cad-page [data-cad-new] >> nth=0'); await page.waitForSelector('dialog[open] .cad-edit');
        const dlg = page.locator('dialog[open]');
        await dlg.locator('[data-cad-f="commune_place_id"] .pk-input').fill('Tulle'); await page.waitForTimeout(900);
        await dlg.locator('[data-cad-f="commune_place_id"] .pk-row').first().click(); await page.waitForTimeout(900);
        await dlg.locator('input[name=section]').fill('ab'); await dlg.locator('input[name=numero]').fill('100');
        await dlg.locator('[data-cad-find]').click(); await page.waitForSelector('dialog[open] .cad-hit.is-on', { timeout: 8000 });
        eq([await dlg.locator('input[name=insee]').inputValue(), await dlg.locator('input[name=surface_m2]').inputValue()], ['19272', '1234'], '« 🔍 Chercher » : code de la commune, surface');
        ok(/AB/.test(await dlg.locator('[data-cad-secs]').innerText()), 'sections de la commune proposées');
        ok(await dlg.locator('[data-cad-editmap] path.cad-poly').count() === 1, 'le contour est dessiné');
        await dlg.locator('[data-cad-addr]').click(); await page.waitForTimeout(600);
        eq(await dlg.locator('input[name=address]').inputValue(), '12 Rue du Moulin 19000 Tulle', 'adresse d’aujourd’hui');
        await dlg.locator('[data-cad-f="people_json"] .pk-zone.prim .pk-input').fill('Martin'); await page.waitForTimeout(900);
        await dlg.locator('[data-cad-f="people_json"] .pk-zone.prim .pk-row').first().click(); await page.waitForTimeout(400);
        ok(/Jean MARTIN/.test(await dlg.locator('[data-cad-dates]').innerText()), 'dates : le nom de la personne');
        await dlg.locator('[data-cad-from]').first().fill('1834'); await dlg.locator('[data-cad-to]').first().fill('1872');
        await dlg.locator('[data-cad-f="cad_houses"] .pk-input').fill('Martin'); await page.waitForTimeout(900);
        await dlg.locator('[data-cad-f="cad_houses"] .pk-row').first().click(); await page.waitForTimeout(300);
        await dlg.locator('input[name=lieu_dit]').fill('Le Pré du Moulin');
        await shot(page, 'ajout');
        await dlg.locator('.modal-actions [type=submit]').click(); await page.waitForTimeout(1200);
        eq(await page.locator('dialog[open]').count(), 0, 'la fenêtre se ferme');
        await page.waitForSelector('.cad-sheet'); await page.waitForTimeout(500);
        const sheet = await page.textContent('.cad-page');
        ok(/Section AB n° 100 · Tulle/.test(sheet) && /1\s234\sm² \(12 a 34 ca\)/.test(sheet) && /Jean MARTIN/.test(sheet) && /de 1834 à 1872/.test(sheet) && /Maison des Martin/.test(sheet), 'fiche : titre, surface en ares, propriétaire avec dates, maison');
        ok(/Archives départementales/.test(sheet) && /FranceArchives/.test(sheet), 'fiche : archives du département et FranceArchives');
        await page.click('[data-cad-dvfgo]'); await page.waitForTimeout(800);
        ok(/185\s000\s€/.test(await page.textContent('[data-cad-dvf]')), 'ventes DVF');
        await shot(page, 'fiche');
        await page.click('[data-cad-back]'); await page.waitForSelector('[data-cad-row]');
        ok(/1 parcelle/.test(await page.textContent('.cad-page')) && /Propriétaire : Jean MARTIN \(1834–1872\)/.test(await page.textContent('[data-cad-row]')), 'liste H10 : nombre, propriétaire');
        await shot(page, 'liste');

        // Carte : calque et « 📍 Parcelle ici »
        const p1 = (await api('cadastre_parcels', { with_geom: 1 }, true)).r.items[0];
        await page.evaluate(p => window.LCNDA_EXT.cadastre.showOnMap(p), p1); await page.waitForSelector('#cad-layer'); await page.waitForTimeout(1200);
        ok(await page.locator('#cad-layer path.is-mine').count() === 1 && await page.locator('#cad-layer img.cad-tile').count() > 0, 'Carte : mes parcelles et les tuiles IGN');
        ok(await page.locator('#map-background option[value="ign_parcels"]').count() === 1, 'fond « Parcelles du cadastre » dans la liste des fonds');
        await page.click('[data-cad-pick]'); const st = await page.locator('#map-stage').boundingBox();
        await page.mouse.click(st.x + st.width / 2 + 150, st.y + st.height / 2 + 60); await page.waitForSelector('.cad-pop [data-cad-popadd]', { timeout: 8000 });
        ok(/Section B n° 233/.test(await page.textContent('.cad-pop')), '« 📍 Parcelle ici » : la parcelle cliquée');
        await shot(page, 'carte');
        await page.click('.cad-pop [data-cad-popadd]'); await page.waitForSelector('dialog[open] .cad-edit'); await page.waitForTimeout(600);
        eq([await page.inputValue('dialog[open] input[name=section]'), await page.inputValue('dialog[open] input[name=numero]')], ['B', '233'], 'fenêtre préremplie');
        await page.click('dialog[open] .modal-actions [type=submit]'); await page.waitForSelector('dialog[open] .cad-sheet.is-dialog', { timeout: 8000 });
        ok(true, 'la fiche s’ouvre par-dessus la carte'); await page.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close()));

        // fiche de la personne, maison, village
        await page.evaluate(() => window.LCNDA_APP.openPersonById(1)); await page.waitForTimeout(2500);
        ok(await page.locator('section.card h3:text("Propriétaire de…")').count() === 1, 'fiche de la personne : « 🗺 Propriétaire de… »');
        await page.evaluate(() => window.LCNDA_EXT.openHouse({ id: 1 })); await page.waitForTimeout(2500);
        if (await page.locator('[data-hs-tab="house"]').count()) { await page.locator('[data-hs-tab="house"]').first().click(); await page.waitForTimeout(600); }
        const sum = page.locator('summary:has-text("Parcelles du cadastre")'); if (await sum.count()) { await sum.first().click(); await page.waitForTimeout(800); }
        ok(await page.locator('[data-cad-host="house"] .ui-row').count() === 1, 'maison : « 🗺 Parcelles du cadastre »');
        await page.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close())); await page.waitForTimeout(300);
        const vkey = await page.evaluate(async () => (await window.LCNDA_APP.api('villages')).villages?.find(v => v.name === 'Tulle')?.key || '');
        if (vkey) {
            await page.evaluate(async k => { const s = window.LCNDA_APP.state; s.listType = 'villages'; s.hVillage = k; await window.LCNDA_APP.setModule('listes'); }, vkey); await page.waitForTimeout(2500);
            ok(await page.locator('[data-vsec="parcels"] .ui-row').count() === 2, 'fiche du village : les 2 parcelles de la commune');
        }
        const pk = await api('picker_search', { kind: 'parcel', q: 'B 233' }, true); ok(pk.ok && JSON.stringify(pk.r).includes('Section B n° 233'), 'menu de choix : les parcelles');

        // supprimer + « ↶ Annuler »
        const idAB = (await api('cadastre_parcels', {}, true)).r.items.find(x => x.numero === '0100').id;
        await page.evaluate(id => { const s = window.LCNDA_APP.state; s.listType = 'cadastre'; s.cadastreId = id; window.LCNDA_APP.setModule('listes'); }, idAB); await page.waitForSelector('.cad-sheet');
        await page.evaluate(() => document.querySelector('[data-cad-delme]').click()); await page.waitForTimeout(800);
        eq((await api('cadastre_parcels', {}, true)).r.items.length, 1, 'supprimée tout de suite (pas de question)');
        await page.getByRole('button', { name: '↶ Annuler' }).last().click(); await page.waitForTimeout(800);
        eq((await api('cadastre_parcels', {}, true)).r.items.length, 2, '« ↶ Annuler » la remet');

        // sécurité : CSRF, mode consultation
        const noCsrf = await page.evaluate(async () => (await fetch('api.php?action=save_cadastre_parcel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ section: 'C', numero: '1' }) })).status);
        ok(noCsrf >= 400, 'sans jeton CSRF : refusé');
        ok((await api('kiosk_enter', { password: 'secret1' })).ok, 'mode consultation');
        const k = await api('save_cadastre_parcel', { section: 'C', numero: '2' }); ok(!k.ok && /consultation/i.test(k.e), 'consultation : rien ne s’écrit');
        ok((await api('cadastre_parcels', {}, true)).ok, 'consultation : la liste se lit');
        await api('kiosk_exit', { password: 'secret1' });
        ok(!errors.length, 'aucune erreur (1440 px) : ' + errors.join(' | '));

        // 390 px et mode sombre
        for (const [w, dark] of [[390, false], [1440, true], [390, true]]) {
            const c2 = await browser.newContext({ viewport: { width: w, height: 840 } });
            await c2.route(/^https:\/\//, rt => rt.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
            if (dark) await c2.addInitScript(() => { try { const d = JSON.parse(localStorage.getItem('genealogie-design') || '{}'); d.preset = 'dark'; localStorage.setItem('genealogie-design', JSON.stringify(d)); } catch (_) {} }); // le vrai thème sombre de l'Apparence
            const p2 = await c2.newPage(); const errs2 = [];
            p2.on('pageerror', e => errs2.push('pageerror ' + e.message)); p2.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errs2.push('console ' + m.text()); });
            await p2.goto(base); await p2.waitForFunction(() => window.LCNDA_APP?.setModule && window.LCNDA_EXT?.cadastre && window.LCNDA_APP.state.csrf, null, { timeout: 60000 });
            if (dark) ok(await p2.evaluate(() => document.documentElement.dataset.theme === 'dark'), 'thème sombre posé');
            await p2.evaluate(async () => { const s = window.LCNDA_APP.state; s.listType = 'cadastre'; s.cadastreId = (await window.LCNDA_APP.api('cadastre_parcels')).items.find(x => x.numero === '0100').id; window.LCNDA_APP.setModule('listes'); }); await p2.waitForSelector('.cad-sheet'); await p2.waitForTimeout(700);
            const over = await p2.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth, Math.max(...[...document.querySelectorAll('.cad-sheet, .cad-sheet *')].filter(e => !e.closest('.cad-map') || e.matches('.cad-map')).map(e => e.getBoundingClientRect().right))]);
            ok(over[2] <= over[1] + 2, `${w} px${dark ? ' sombre' : ''} : la fiche tient dans la largeur (${over})`);
            await shot(p2, `fiche-${w}${dark ? '-sombre' : ''}`);
            await p2.click('.cad-page [data-cad-editme]'); await p2.waitForSelector('dialog[open] .cad-edit'); await p2.waitForTimeout(500);
            const dOver = await p2.evaluate(() => { const d = document.querySelector('dialog[open]'); return [d.scrollWidth, d.clientWidth]; });
            ok(dOver[0] <= dOver[1] + 2, `${w} px${dark ? ' sombre' : ''} : la fenêtre n’a pas de défilement de côté (${dOver})`);
            await shot(p2, `modifier-${w}${dark ? '-sombre' : ''}`);
            if (dark) ok(await p2.evaluate(() => getComputedStyle(document.querySelector('dialog[open] .cad-find')).backgroundColor !== 'rgb(255, 255, 255)'), 'sombre : le cadre de recherche n’est pas blanc');
            ok(!errs2.length, `aucune erreur (${w} px${dark ? ', sombre' : ''}) : ${errs2.join(' | ')}`);
            await c2.close();
        }
        console.log(`  ✓ navigateur : ${n} vérifications en tout`);
    } finally {
        await browser.close(); proc.kill();
        fs.rmSync(dir, { recursive: true, force: true });
    }
})().catch(e => { console.error(e); process.exit(1); });
