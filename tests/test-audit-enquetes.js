#!/usr/bin/env node
/* 🕵️ Enquêtes et 🧬 ADN — l'audit des onglets (docs/design/audit-onglets.html §12, §14), fait.
 *  Serveur (lib/enquetes_plus.php, lib/dna.php) : recherches négatives et « déjà parcouru », état d'une piste, conclusion (+ ↶),
 *    chronomètre, dupliquer, dossier remis ; ADN : ↶ d'un test / d'une correspondance / d'un groupe, relances, phasage.
 *  Écran Enquêtes : barre commune (sans « ⌕ ») et ses filtres, « ⋯ » et clic droit dans le même ordre, suppression tout de suite + ↶,
 *    modèle « Retrouver un soldat », pistes en colonnes (glisser), conclusion + note sur la fiche (↶), recherche sans résultat avec
 *    l'avertissement, ⏱, rapport (🖨 / ⤓), dossier supprimé + ↶, consultation, chercher dans la page, 390 px sans débord.
 *  Battue : avancement (registres, communes), carte colorée par avancement (réglage gardé), mots d'état, suppression + ↶.
 *  ADN : colonne rangée en groupes, ↶ Annuler, consultation, relances, endogamie, correspondances partagées, phasage, chercher dans la page.
 *   node tests/test-audit-enquetes.js */
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const {spawn, spawnSync} = require('child_process');
let chromium; try { ({chromium} = require('playwright')); } catch (_) { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); }
const root = path.join(__dirname, '..');
const {findPhp, phpRuntimeArgs, devBundledPhp} = require('../electron/php-server.js');
let fails = 0;
const t = async (name, fn) => { if (process.env.ENQ_ONLY && !new RegExp(process.env.ENQ_ONLY).test(name)) return; try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 8).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-enq-'));
    fs.mkdirSync(path.join(tmp, 'media'));
    // une petite image pour les pièces
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    fs.writeFileSync(path.join(tmp, 'media', 'acte.png'), png);
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4'};
    const php = code => { const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', `require 'lib/paths.php'; require 'lib/bootstrap.php'; $pdo = db(); ${code}`], {cwd: root, encoding: 'utf8', env}); if (r.status !== 0) throw new Error(r.stderr || r.stdout); return r.stdout.trim(); };
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$per = function ($f, $l, $g) use ($pdo) { $pdo->prepare("INSERT INTO persons(first_name,last_name,gender,living_status) VALUES(?,?,?,'deceased')")->execute([$f, $l, $g]); return (int) $pdo->lastInsertId(); };
$ids = ['pierre' => $per('Pierre', 'MAZAUD', 'male'), 'marie' => $per('Marie', 'LACOMBE', 'female'), 'jean' => $per('Jean', 'DURAND', 'male')];
$sq = function ($x, $y) { return json_encode(['type' => 'Polygon', 'coordinates' => [[[$x, $y], [$x + .1, $y], [$x + .1, $y + .1], [$x, $y + .1], [$x, $y]]]]); };
foreach ([['19272', 'Tulle', 1.7, 45.2], ['19146', 'Naves', 1.8, 45.2], ['19101', 'Laguenne', 1.7, 45.3]] as [$c, $n, $x, $y]) {
    $pdo->prepare('INSERT INTO commune_contours(insee_code,name,geometry_json,min_lon,min_lat,max_lon,max_lat) VALUES(?,?,?,?,?,?,?)')->execute([$c, $n, $sq($x, $y), $x, $y, $x + .1, $y + .1]); }
foreach ([['19272', '19146'], ['19146', '19272'], ['19272', '19101'], ['19101', '19272']] as [$a, $b]) { $pdo->prepare('INSERT INTO commune_neighbors(insee_code,neighbor_insee_code) VALUES(?,?)')->execute([$a, $b]); }
$pdo->prepare("INSERT INTO investigations(person_id,title,question,status) VALUES(?,?,?,'open')")->execute([$ids['pierre'], 'Le mariage de Pierre MAZAUD', 'Où Pierre s’est-il marié ?']); $inv = (int) $pdo->lastInsertId();
$pdo->prepare("INSERT INTO investigations(person_id,title,status) VALUES(?,?,'paused')")->execute([$ids['marie'], 'La naissance de Marie LACOMBE']); $inv2 = (int) $pdo->lastInsertId();
for ($i = 1; $i <= 9; $i++) { $pdo->prepare("INSERT INTO investigation_items(investigation_id,kind,title,status) VALUES(?,?,?,?)")->execute([$inv, $i % 2 ? 'source' : 'lead', "Registre de Tulle n° $i", $i <= 3 ? 'to_explore' : ($i <= 6 ? 'explored' : 'promising')]); }
$pdo->prepare("INSERT INTO media(title,filename,media_type) VALUES('Acte de mariage','acte.png','image')")->execute(); $mid = (int) $pdo->lastInsertId();
$pdo->prepare("INSERT INTO investigation_media_folders(investigation_id,name) VALUES(?, 'Mariages')")->execute([$inv]); $fid = (int) $pdo->lastInsertId();
$pdo->prepare("INSERT INTO investigation_media(investigation_id,media_id,verdict,reason,folder_id) VALUES(?,?,'interesting','',?)")->execute([$inv, $mid, $fid]); $lid = (int) $pdo->lastInsertId();
$pdo->exec("INSERT INTO battues(title,target_type,start_insee_code,max_level,status) VALUES('Naissance de Jean DURAND','naissance','19272',1,'open')"); $bat = (int) $pdo->lastInsertId();
$pdo->prepare("INSERT INTO battue_search_items(battue_id,insee_code,record_type,period,status) VALUES(?,?,?,?,?)")->execute([$bat, '19272', 'naissance', '1850-1860', 'not_found']);
$pdo->prepare("INSERT INTO battue_search_items(battue_id,insee_code,record_type,period,status) VALUES(?,?,?,?,?)")->execute([$bat, '19146', 'naissance', '1850-1860', 'todo']);
$pdo->prepare("INSERT INTO battue_commune_statuses(battue_id,insee_code,status) VALUES(?,?,?)")->execute([$bat, '19272', 'done']);
echo json_encode($ids + ['inv' => $inv, 'inv2' => $inv2, 'bat' => $bat, 'media' => $mid, 'folder' => $fid, 'link' => $lid]);`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0 || !/pierre/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const ID = JSON.parse(seed.stdout.trim().split('\n').pop());
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const errs = [];
    try {
        const ctx = await browser.newContext({viewport: {width: 1440, height: 900}});
        await ctx.addInitScript(() => { try { localStorage.setItem('genealogie-menu-adn', '1'); localStorage.setItem('genealogie-menu-hidden', '[]'); } catch (_) {} });
        const p = await ctx.newPage();
        p.on('pageerror', e => errs.push(e.message));
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_PARTS?.renderInvestigations, null, {timeout: 30000});
        await p.addStyleTag({path: path.join(root, 'assets/css/audit-enquetes.css')}); // (le <link> est posé dans index.php)
        const api = (x, q = {}) => p.evaluate(([y, z]) => window.LCNDA_APP.api(y, z).catch(e => ({error: e.message})), [x, q]);
        const post = (a, b) => p.evaluate(async ([x, y]) => { try { const r = await window.LCNDA_APP.api(x, {}, {method: 'POST', body: y}); return r.result ?? r; } catch (e) { return {error: e.message}; } }, [a, b]);
        const toastUndo = async re => { await p.waitForFunction(r => [...document.querySelectorAll('.ui-toast')].some(x => new RegExp(r).test(x.textContent) && x.querySelector('button')), re, {timeout: 10000});
            await p.evaluate(r => [...document.querySelectorAll('.ui-toast')].reverse().find(x => new RegExp(r).test(x.textContent) && x.querySelector('button')).querySelector('button').click(), re); await sleep(900); };
        const openInv = async id => { await p.evaluate(i => { const A = window.LCNDA_APP; A.state.enquetesTab = 'enquetes'; A.state.currentInvestigationId = i; A.state.investigationFolderId = 0; A.setModule('enquetes'); }, id); await p.waitForSelector('.investigation-detail', {timeout: 20000}); await sleep(300); };
        const menuLabels = () => p.evaluate(() => [...document.querySelectorAll('.ui-actmenu .ui-actmenu-i')].map(b => b.textContent.trim()));
        const closeMenus = () => p.keyboard.press('Escape').then(() => sleep(200));

        /* ═════════ Serveur ═════════ */
        await t('serveur : recherche négative, « déjà parcouru » (même cote, années qui se recouvrent), ↶', async () => {
            const a = await post('enquetes_plus', {op: 'save_negative', investigation_id: ID.inv, repository: 'AD de la Corrèze', cote: '3 E 145/2', year_from: 1850, year_to: 1860, searched_on: '2026-03-12'});
            assert.ok(a.id, JSON.stringify(a));
            let c = await api('enquetes_plus', {op: 'check_negative', cote: '3e 145 / 2', year_from: 1855, year_to: 1870});
            assert.strictEqual(c.matches.length, 1); assert.strictEqual(c.matches[0].investigation_title, 'Le mariage de Pierre MAZAUD');
            c = await api('enquetes_plus', {op: 'check_negative', cote: '3 E 145/2', year_from: 1870, year_to: 1880}); assert.strictEqual(c.matches.length, 0, 'autres années');
            const d = await post('enquetes_plus', {op: 'delete_negative', id: a.id}); assert.strictEqual(d.row.cote, '3 E 145/2');
            assert.strictEqual((await api('enquetes_plus', {op: 'detail', id: ID.inv})).negatives.length, 0);
            await post('enquetes_plus', {op: 'restore_negative', row: d.row});
            assert.strictEqual((await api('enquetes_plus', {op: 'detail', id: ID.inv})).negatives[0].id, a.id, 'remise avec son numéro');
        });
        await t('serveur : état d’une piste seul, conclusion (clôture + ↶), chronomètre, dupliquer', async () => {
            const it0 = (await api('investigation', {id: ID.inv})).items.find(i => i.status === 'to_explore');
            const r = await post('enquetes_plus', {op: 'item_status', item_id: it0.id, status: 'closed'}); assert.strictEqual(r.old, 'to_explore');
            assert.strictEqual(php(`echo $pdo->query('SELECT status FROM investigation_items WHERE id=${it0.id}')->fetchColumn();`), 'closed');
            assert.ok((await post('enquetes_plus', {op: 'item_status', item_id: it0.id, status: 'nimporte'})).error, 'état inconnu refusé');
            await post('enquetes_plus', {op: 'item_status', item_id: it0.id, status: 'to_explore'});
            const c = await post('enquetes_plus', {op: 'save_conclusion', investigation_id: ID.inv2, conclusion: 'Née à Naves', proof: 'Acte vu', kept_item_ids: [], close: 1});
            assert.strictEqual(c.extras.conclusion, 'Née à Naves'); assert.strictEqual(c.before.status, 'paused');
            assert.strictEqual(php(`echo $pdo->query('SELECT status FROM investigations WHERE id=${ID.inv2}')->fetchColumn();`), 'closed');
            await post('enquetes_plus', {op: 'restore_conclusion', investigation_id: ID.inv2, before: c.before});
            assert.strictEqual(php(`echo $pdo->query('SELECT status FROM investigations WHERE id=${ID.inv2}')->fetchColumn();`), 'paused', '↶ remet l’état');
            assert.strictEqual((await api('enquetes_plus', {op: 'detail', id: ID.inv2})).extras.conclusion, '');
            await post('enquetes_plus', {op: 'chrono', investigation_id: ID.inv2, what: 'set', seconds: 3720});
            assert.strictEqual((await api('enquetes_plus', {op: 'times'})).times[ID.inv2].elapsed, 3720);
            await post('enquetes_plus', {op: 'chrono', investigation_id: ID.inv2, what: 'start'});
            assert.strictEqual((await api('enquetes_plus', {op: 'detail', id: ID.inv2})).extras.running, true);
            await post('enquetes_plus', {op: 'chrono', investigation_id: ID.inv2, what: 'stop'});
            assert.ok((await api('enquetes_plus', {op: 'detail', id: ID.inv2})).extras.elapsed >= 3720);
            const dup = await post('enquetes_plus', {op: 'duplicate', investigation_id: ID.inv});
            assert.strictEqual((await api('investigation', {id: dup.id})).items.length, 9, 'les pistes suivent');
            await post('delete_investigation', {id: dup.id});
        });

        /* ═════════ Écran Enquêtes ═════════ */
        await t('colonne : la barre commune (🔍 Filtrer ▾ Liste | Fiches Trier), plus de « ⌕ » ; filtres État et Personne', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.enquetesTab = 'enquetes'; A.state.currentInvestigationId = 0; A.setModule('enquetes'); });
            await p.waitForSelector('#sidebar-content .enq-bar .ui-listbar', {timeout: 20000});
            await p.click('#sidebar-content .ui-viewtoggle [data-view="list"]').catch(() => {}); // « Liste » (et non « Fiches »)
            assert.strictEqual(await p.$('#investigation-search-button'), null, 'plus de ⌕');
            assert.ok(await p.$('#sidebar-content .ui-listbar-fbtn') && await p.$('#sidebar-content .ui-viewtoggle') && await p.$('#sidebar-content .ui-sortbar-sort select'));
            // « Liste » redessine la page après une requête : attendre le tableau (et non les vignettes d'avant)
            await p.waitForSelector('#workspace tr[data-enq-row]');
            assert.strictEqual(await p.$$eval('#workspace tr[data-enq-row]', r => r.length), 2);
            await p.evaluate(() => document.querySelector('#sidebar-content .ui-listbar').setFilter('status', 'paused'));
            await p.waitForFunction(() => document.querySelectorAll('#workspace tr[data-enq-row]').length === 1);
            assert.match(await p.textContent('#workspace tbody'), /Marie LACOMBE/);
            await p.evaluate(() => document.querySelector('#sidebar-content .ui-listbar').setFilter('status', 'all'));
            await p.waitForFunction(() => document.querySelectorAll('#workspace tr[data-enq-row]').length === 2);
            await p.evaluate(id => document.querySelector('#sidebar-content .ui-listbar').setFilter('person', {id, title: 'Pierre MAZAUD'}), ID.pierre);
            await p.waitForFunction(() => document.querySelectorAll('#workspace tr[data-enq-row]').length === 1);
            assert.match(await p.textContent('#workspace tbody'), /Pierre MAZAUD/);
            await p.evaluate(() => document.querySelector('#sidebar-content .ui-listbar').setFilter('person', ''));
            await p.waitForFunction(() => document.querySelectorAll('#workspace tr[data-enq-row]').length === 2);
            assert.ok(await p.$('#workspace [data-enq-export]') && await p.$('#workspace [data-enq-print]'), '⤓ Exporter ▾ et 🖨 Imprimer');
        });
        await t('« ⋯ » et clic droit : les mêmes entrées, dans le même ordre ; supprimer tout de suite + ↶ Annuler', async () => {
            const want = ['↗ Ouvrir', '✎ Modifier', '⧉ Dupliquer', '⤓ Exporter le rapport…', '🖨 Imprimer le rapport', '🗑 Supprimer'];
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.enquetesTab = 'enquetes'; A.state.currentInvestigationId = 0; A.setModule('enquetes'); });
            await p.waitForSelector('#sidebar-content .ui-viewtoggle'); await p.click('#sidebar-content .ui-viewtoggle [data-view="list"]');
            await p.waitForSelector(`#workspace tr[data-enq-row="inv:${ID.inv2}"]`, {timeout: 20000});
            await p.click(`#workspace tr[data-enq-row="inv:${ID.inv2}"] [data-enq-menu]`); await p.waitForSelector('.ui-actmenu');
            const a = await menuLabels(); await closeMenus();
            await p.click(`#workspace tr[data-enq-row="inv:${ID.inv2}"] td:nth-child(2)`, {button: 'right'}); await p.waitForSelector('.ui-actmenu');
            const b = await menuLabels();
            assert.deepStrictEqual(a.map(x => x.replace(/\s+/g, '')), want.map(x => x.replace(/\s+/g, ''))); assert.deepStrictEqual(b, a, 'clic droit = ⋯');
            await p.evaluate(() => [...document.querySelectorAll('.ui-actmenu .ui-actmenu-i')].find(x => /Supprimer/.test(x.textContent)).click());
            await p.waitForFunction(i => !document.querySelector(`#workspace tr[data-enq-row="inv:${i}"]`), ID.inv2, {timeout: 10000});
            assert.strictEqual(await p.$('dialog[open]'), null, 'pas de question avant');
            await toastUndo('supprimée');
            await p.waitForSelector(`#workspace tr[data-enq-row="inv:${ID.inv2}"]`, {timeout: 10000});
        });
        await t('🗂 modèle « Retrouver un soldat » : question et pistes préparées', async () => {
            await p.click('#new-investigation-template'); await p.waitForSelector('.enq-tpl-dialog[open]');
            await p.check('.enq-tpl-dialog input[value="soldat"]');
            await p.evaluate(id => { const h = document.querySelector('.enq-tpl-dialog [name="enq_tpl_person"]'); h.value = String(id); }, ID.jean);
            await p.fill('.enq-tpl-dialog [data-enq-tpl-title]', 'Le parcours militaire de Jean DURAND');
            await p.click('.enq-tpl-dialog [data-enq-tpl-go]');
            await p.waitForSelector('.investigation-detail', {timeout: 20000});
            assert.match(await p.textContent('.investigation-detail .page-header h2'), /Jean DURAND/);
            assert.strictEqual(await p.$$eval('.investigation-detail .investigation-item', a => a.length), 6);
            assert.match(await p.textContent('.investigation-detail .investigation-items'), /Fiche matricule/);
            const list = await api('investigations', {status: 'all'}); const mine = list.investigations.find(i => /Jean DURAND/.test(i.title));
            assert.match(mine.question, /a-t-il servi/); await post('delete_investigation', {id: mine.id});
        });
        await t('🧩 pistes en colonnes : glisser une piste dans « Impasse » (+ ↶), réglage gardé', async () => {
            await openInv(ID.inv);
            await p.click('[data-enq-pview="columns"]'); await p.waitForSelector('[data-enq-kanban]');
            assert.strictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-enquetes-prefs')).pistesView), 'columns');
            assert.deepStrictEqual(await p.$$eval('[data-enq-kcol] h4', h => h.map(x => x.textContent.replace(/\s*\d+$/, '').trim())), ['À explorer', 'En cours', 'Explorée', 'Impasse']);
            const iid = Number(await p.getAttribute('[data-enq-kcol="todo"] [data-enq-kcard]', 'data-enq-kcard'));
            await p.locator(`[data-enq-kcard="${iid}"]`).dragTo(p.locator('[data-enq-kdrop="dead"]'));
            await p.waitForFunction(i => document.querySelector(`[data-enq-kcol="dead"] [data-enq-kcard="${i}"]`), iid, {timeout: 10000});
            assert.strictEqual(php(`echo $pdo->query('SELECT status FROM investigation_items WHERE id=${iid}')->fetchColumn();`), 'closed');
            await toastUndo('Impasse');
            await p.waitForFunction(i => document.querySelector(`[data-enq-kcol="todo"] [data-enq-kcard="${i}"]`), iid, {timeout: 10000});
            // le « ⋯ » d'une carte : Mettre dans « En cours »
            await p.click(`[data-enq-kmenu="${iid}"]`); await p.waitForSelector('.ui-actmenu');
            await p.evaluate(() => [...document.querySelectorAll('.ui-actmenu .ui-actmenu-i')].find(x => /En cours/.test(x.textContent)).click());
            await p.waitForFunction(i => document.querySelector(`[data-enq-kcol="doing"] [data-enq-kcard="${i}"]`), iid, {timeout: 10000});
            await p.click('[data-enq-pview="list"]'); await p.waitForSelector('.investigation-items:not([hidden]) .investigation-item');
        });
        await t('✅ conclure : conclusion, argument, sources retenues, enquête terminée ; note sur la fiche (+ ↶)', async () => {
            await openInv(ID.inv);
            await p.click('[data-enq-conclude]'); await p.waitForSelector('.enq-conclude-dialog[open]');
            await p.fill('.enq-conclude-dialog [name=conclusion]', 'Pierre MAZAUD a épousé Marie LACOMBE à Tulle en 1872.');
            await p.fill('.enq-conclude-dialog [name=proof]', 'L’acte de mariage et le contrat s’accordent.');
            await p.click('.enq-conclude-dialog [data-enq-conclude-go]');
            await p.waitForSelector('.enq-conclusion.has-conclusion', {timeout: 10000});
            assert.match(await p.textContent('.enq-conclusion'), /épousé Marie LACOMBE/);
            assert.strictEqual(php(`echo $pdo->query('SELECT status FROM investigations WHERE id=${ID.inv}')->fetchColumn();`), 'closed');
            await p.waitForSelector('[data-enq-propose]:not([hidden]) [data-enq-onfiche]', {timeout: 10000});
            await p.click('[data-enq-onfiche]');
            await p.waitForFunction(() => [...document.querySelectorAll('.ui-toast')].some(x => /sur la fiche/.test(x.textContent)), null, {timeout: 10000});
            assert.strictEqual(php(`echo $pdo->query("SELECT count(*) FROM notes WHERE entity_type='person' AND entity_id=${ID.pierre} AND body LIKE '%épousé%'")->fetchColumn();`), '1');
            await toastUndo('sur la fiche');
            assert.strictEqual(php(`echo $pdo->query("SELECT count(*) FROM notes WHERE entity_type='person' AND entity_id=${ID.pierre} AND body LIKE '%épousé%'")->fetchColumn();`), '0', '↶ retire la note');
            await post('save_investigation', {id: ID.inv, person_id: ID.pierre, title: 'Le mariage de Pierre MAZAUD', question: 'Où Pierre s’est-il marié ?', status: 'open'});
        });
        await t('🚫 recherche sans résultat : avertissement « Déjà parcouru » avant de refaire la même', async () => {
            await openInv(ID.inv);
            await p.click('[data-enq-neg-add]'); await p.waitForSelector('.enq-neg-dialog[open]');
            await p.fill('.enq-neg-dialog [name=cote]', '3E145/2'); await p.fill('.enq-neg-dialog [name=year_from]', '1858'); await p.fill('.enq-neg-dialog [name=year_to]', '1862');
            await p.waitForSelector('.enq-neg-dialog [data-enq-neg-warn]:not([hidden])', {timeout: 10000});
            assert.match(await p.textContent('[data-enq-neg-warn]'), /Déjà parcouru/);
            await p.fill('.enq-neg-dialog [name=year_from]', '1900'); await p.fill('.enq-neg-dialog [name=year_to]', '1910');
            await p.waitForSelector('.enq-neg-dialog [data-enq-neg-warn][hidden]', {state: 'attached', timeout: 10000});
            await p.click('.enq-neg-dialog [data-enq-neg-go]');
            await p.waitForFunction(() => document.querySelectorAll('.enq-neg-table tbody tr').length === 2, null, {timeout: 10000});
            // supprimer (⋯) tout de suite + ↶
            await p.click('.enq-neg-table tbody tr:first-child [data-enq-neg-menu]'); await p.waitForSelector('.ui-actmenu');
            await p.evaluate(() => [...document.querySelectorAll('.ui-actmenu .ui-actmenu-i')].find(x => /Supprimer/.test(x.textContent)).click());
            await p.waitForFunction(() => document.querySelectorAll('.enq-neg-table tbody tr').length === 1, null, {timeout: 10000});
            await toastUndo('sans résultat supprimée');
            await p.waitForFunction(() => document.querySelectorAll('.enq-neg-table tbody tr').length === 2, null, {timeout: 10000});
        });
        await t('⏱ temps passé : lancer, arrêter ; affiché sur la liste', async () => {
            await openInv(ID.inv);
            await p.click('[data-enq-chrono]'); await p.waitForSelector('[data-enq-chrono].is-running', {timeout: 10000});
            await sleep(1200); await p.click('[data-enq-chrono]'); await p.waitForSelector('[data-enq-chrono]:not(.is-running)', {timeout: 10000});
            assert.ok((await api('enquetes_plus', {op: 'detail', id: ID.inv})).extras.elapsed >= 1);
            await post('enquetes_plus', {op: 'chrono', investigation_id: ID.inv, what: 'set', seconds: 5400});
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.currentInvestigationId = 0; A.state.investigationDisplay = 'list'; window.LCNDA_PARTS.renderInvestigations(); });
            await p.waitForFunction(i => /1 h 30/.test(document.querySelector(`#workspace tr[data-enq-row="inv:${i}"]`)?.textContent || ''), ID.inv, {timeout: 10000});
        });
        await t('🖨 rapport : question, chronologie des pistes, pièces, recherches sans résultat ; ⤓ en PDF ou page web', async () => {
            await openInv(ID.inv);
            await p.click('[data-enq-print]'); await p.waitForSelector('dialog.k-print[open]', {timeout: 10000});
            const html = await p.evaluate(async i => (await window.LCNDA_PARTS.enqReportHtml(i)).html, ID.inv);
            assert.match(html, /Où Pierre s’est-il marié/); assert.match(html, /Chronologie des pistes/); assert.match(html, /Registre de Tulle n° 9/);
            assert.match(html, /Recherches sans résultat/); assert.match(html, /acte\.png/); assert.match(html, /Pièces/);
            await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close())); await sleep(300);
            await p.click('[data-enq-export]'); await p.waitForSelector('dialog.ui-export[open]', {timeout: 10000});
            const fm = await p.$$eval('dialog.ui-export[open] .ui-export-fmt', b => b.map(x => x.dataset.fmt)); assert.deepStrictEqual(fm, ['pdf', 'print', 'file']);
            await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close())); await sleep(300);
        });
        await t('dossier de pièces supprimé tout de suite, « ↶ Annuler » le remet avec son média ; média retiré + ↶', async () => {
            await openInv(ID.inv);
            await p.click(`[data-delete-folder="${ID.folder}"]`);
            await p.waitForFunction(f => !document.querySelector(`[data-delete-folder="${f}"]`), ID.folder, {timeout: 10000});
            assert.strictEqual(php(`echo (int)$pdo->query('SELECT folder_id FROM investigation_media WHERE id=${ID.link}')->fetchColumn();`), '0');
            await toastUndo('Dossier');
            await p.waitForSelector(`[data-delete-folder="${ID.folder}"]`, {timeout: 10000});
            assert.strictEqual(php(`echo $pdo->query('SELECT folder_id FROM investigation_media WHERE id=${ID.link}')->fetchColumn();`), String(ID.folder));
        });
        await t('🔍 chercher dans cette page (longue page) ; « ⋯ » d’une piste = clic droit', async () => {
            await openInv(ID.inv);
            await p.waitForSelector('.investigation-detail .enq-find input');
            await p.fill('.investigation-detail .enq-find input', 'n° 7'); await sleep(400);
            assert.strictEqual(await p.$$eval('.investigation-item:not(.enq-find-off)', a => a.length), 1);
            await p.fill('.investigation-detail .enq-find input', ''); await sleep(400);
            const iid = await p.$eval('.investigation-item', a => a.dataset.enqPiste);
            await p.click(`[data-enq-pmenu="${iid}"]`); await p.waitForSelector('.ui-actmenu'); const a = await menuLabels(); await closeMenus();
            await p.click(`[data-enq-piste="${iid}"] h4`, {button: 'right'}); await p.waitForSelector('.ui-actmenu'); const b = await menuLabels(); await closeMenus();
            assert.deepStrictEqual(b, a); assert.ok(a[0].includes('Modifier') && a.at(-1).includes('Supprimer'));
        });
        await t('mode consultation : rien à modifier (✎, 🗑, ＋, ✅, 🚫, ⏱)', async () => {
            await p.evaluate(() => { document.body.classList.add('is-kiosk'); });
            await openInv(ID.inv);
            for (const sel of ['#edit-investigation', '#delete-investigation', '#add-investigation-item', '[data-delete-investigation-item]', '[data-enq-conclude]', '[data-enq-neg-add]', '[data-delete-folder]', '#upload-investigation-media'])
                assert.strictEqual(await p.$(`.investigation-detail ${sel}`), null, sel);
            assert.ok(await p.$eval('[data-enq-chrono]', b => b.disabled));
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.currentInvestigationId = 0; A.renderSidebar(); window.LCNDA_PARTS.renderInvestigations(); });
            await p.waitForSelector('#workspace [data-open-investigation]');
            assert.strictEqual(await p.$('#new-investigation-global'), null); assert.strictEqual(await p.$('#workspace [data-enq-new]'), null);
            await p.click(`#workspace tr[data-enq-row="inv:${ID.inv}"] [data-enq-menu]`); await p.waitForSelector('.ui-actmenu');
            assert.ok(!(await menuLabels()).some(x => /Supprimer|Modifier/.test(x))); await closeMenus();
            await p.evaluate(() => { document.body.classList.remove('is-kiosk'); window.LCNDA_APP.renderSidebar(); });
        });

        /* ═════════ Battue ═════════ */
        await t('🧭 battue : avancement (registres, communes), carte colorée par avancement (gardé), mots d’état', async () => {
            await p.evaluate(id => { const A = window.LCNDA_APP; A.state.enquetesTab = 'battue'; A.state.currentInvestigationId = 0; A.state.currentBattueId = id; A.renderSidebar(); A.setModule('enquetes'); }, ID.bat);
            await p.waitForSelector('.battue-detail [data-battue-progress]', {timeout: 20000});
            assert.match(await p.textContent('[data-bp-reg]'), /1\/2 \(50 %\)/);
            assert.match(await p.textContent('[data-bp-com]'), /1\/3/);
            assert.ok(await p.$('.battue-detail .page-header.ui-ph') && await p.$('.battue-detail [data-enq-export]'), 'en-tête commun, ⤓');
            await p.click('[data-battue-color="progress"]');
            assert.ok(await p.$('.battue-map.is-progress'));
            assert.strictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-enquetes-prefs')).battueMapColor), 'progress');
            const fill = await p.$eval('.battue-map-shape[data-map-commune="19272"]', e => getComputedStyle(e).fill); assert.strictEqual(fill, 'rgb(63, 163, 95)', 'terminée en vert');
            const opts = await p.$$eval('[data-battue-commune-status="19146"] option', o => o.map(x => x.textContent)); assert.deepStrictEqual(opts.slice(0, 3), ['À faire', 'En cours', 'Terminé']);
            await p.selectOption('[data-battue-commune-status="19146"]', 'done');
            await p.waitForFunction(() => /2\/3/.test(document.querySelector('[data-bp-com]').textContent), null, {timeout: 10000});
        });
        await t('battue : supprimée tout de suite, « ↶ Annuler » la remet', async () => {
            await p.evaluate(() => document.querySelector('#delete-battue').click()); // (dans « ⋯ » de l'en-tête)
            await p.waitForSelector('.battue-page:not(.battue-detail)', {timeout: 10000});
            assert.strictEqual(php(`echo $pdo->query('SELECT count(*) FROM battues')->fetchColumn();`), '0');
            await toastUndo('Battue');
            assert.strictEqual(php(`echo $pdo->query('SELECT count(*) FROM battues')->fetchColumn();`), '1');
            await p.waitForSelector(`[data-enq-row="battue:${ID.bat}"]`, {timeout: 10000});
        });
        await t('390 px : rien ne déborde (enquête, battue)', async () => {
            await p.setViewportSize({width: 390, height: 800});
            await p.evaluate(id => { const A = window.LCNDA_APP; A.state.enquetesTab = 'enquetes'; A.state.currentInvestigationId = id; A.setModule('enquetes'); }, ID.inv);
            await p.waitForSelector('.investigation-detail'); await sleep(500);
            const over = await p.evaluate(() => { const ws = document.querySelector('#workspace .page'); return [...ws.querySelectorAll('*')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.right > window.innerWidth + 2 && !e.closest('.data-table-wrap,svg,.ui-actmenu'); }).slice(0, 5).map(e => e.className || e.tagName); });
            if (over.length) console.log('   (debug)', await p.evaluate(() => [...document.querySelectorAll('#workspace .page *')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.right > window.innerWidth + 2 && !e.closest('.data-table-wrap,svg,.ui-actmenu'); }).slice(0, 8).map(e => `${e.tagName}.${e.className} w=${Math.round(e.getBoundingClientRect().width)} r=${Math.round(e.getBoundingClientRect().right)} parent=${e.parentElement.className}`).join('\n')));
            assert.deepStrictEqual(over, []);
            await p.setViewportSize({width: 1440, height: 900});
        });
        await ctx.close();
        if (process.env.ENQ_DNA !== '0') /* ═════════ 🧬 ADN ═════════ */
        {
            const ctx2 = await browser.newContext({viewport: {width: 1440, height: 900}});
            await ctx2.addInitScript(() => { try { localStorage.setItem('genealogie-menu-adn', '1'); localStorage.setItem('genealogie-menu-hidden', '[]'); localStorage.setItem('genealogie-adn-prefs', JSON.stringify({ack: true})); } catch (_) {} });
            const p = await ctx2.newPage();
            p.on('pageerror', e => errs.push(e.message));
            await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.adn, null, {timeout: 30000});
            await p.addStyleTag({path: path.join(root, 'assets/css/audit-enquetes.css')});
            const api = (x, q = {}) => p.evaluate(([y, z]) => window.LCNDA_APP.api(y, z).catch(e => ({error: e.message})), [x, q]);
            const post = (a, b) => p.evaluate(async ([x, y]) => { try { const r = await window.LCNDA_APP.api(x, {}, {method: 'POST', body: y}); return r.result ?? r; } catch (e) { return {error: e.message}; } }, [a, b]);
            const toastUndo = async re => { await p.waitForFunction(r => [...document.querySelectorAll('.ui-toast')].some(x => new RegExp(r).test(x.textContent) && x.querySelector('button')), re, {timeout: 10000});
                await p.evaluate(r => [...document.querySelectorAll('.ui-toast')].reverse().find(x => new RegExp(r).test(x.textContent) && x.querySelector('button')).querySelector('button').click(), re); await sleep(1000); };
            const go = async sec => { await p.evaluate(s => { window.LCNDA_APP.state.adnTab = s; window.LCNDA_APP.setModule('adn'); }, sec); await p.waitForSelector(`.h-dna-page[data-dna-sec="${sec}"]`, {timeout: 20000}); await sleep(300); };
            const menuLabels = () => p.evaluate(() => [...document.querySelectorAll('.ui-actmenu .ui-actmenu-i')].map(b => b.textContent.trim()));
            const pickMenu = re => p.evaluate(r => [...document.querySelectorAll('.ui-actmenu .ui-actmenu-i')].find(x => new RegExp(r).test(x.textContent)).click(), re);
            const count = sql => php(`echo $pdo->query("${sql}")->fetchColumn();`);
            // trois frères et sœurs testés, des correspondances, un groupe
            const kA = (await post('save_dna_kit', {person_id: ID.pierre, company: 'MyHeritage DNA', test_type: 'autosomal'})).id;
            const kB = (await post('save_dna_kit', {person_id: ID.marie, company: 'MyHeritage DNA', test_type: 'autosomal'})).id;
            const kC = (await post('save_dna_kit', {person_id: ID.jean, company: 'MyHeritage DNA', test_type: 'autosomal'})).id;
            const g1 = (await post('save_dna_group', {name: 'Branche LACOMBE (Naves)', color: '#e15759'})).id;
            const mk = async (name, cm, extra = {}) => (await post('save_dna_match', {kit_id: kA, name, shared_cm: cm, segments: 8, longest_cm: 40, status: 'todo', groups: [], data: {}, ...extra})).id;
            const mPaul = await mk('Paul DURAND', 230, {groups: [g1]}), mLucie = await mk('Lucie LACOMBE', 120, {groups: [g1]}), mAnne = await mk('Anne MAZAUD', 80), mSis = await mk('Marie LACOMBE', 2600);
            await post('save_dna_segments', {kit_id: kA, rows: [{match_id: mSis, chromosome: '1', start: 10, end: 60, cm: 70}, {match_id: mPaul, chromosome: '2', start: 30, end: 50, cm: 25}]});

            await t('ADN : la colonne rangée en groupes (comme Listes et Réglages), case « Chercher », « Réordonner »', async () => {
                await go('home');
                await p.waitForSelector('#sidebar-content .mt-groups [data-mt-search]');
                assert.strictEqual(await p.$$eval('#sidebar-content details.mt-group', d => d.length), 5);
                assert.ok(await p.$('#sidebar-footer [data-dna-reorder]') || await p.$('[data-dna-reorder]'));
                await p.click('#sidebar-content [data-side-value="phasing"]'); await p.waitForSelector('.h-dna-page[data-dna-sec="phasing"]', {timeout: 20000});
                assert.ok(await p.$('.h-dna-page .page-header [data-dna-print]'), '🖨 Imprimer sur chaque rubrique');
            });
            await t('ADN : « ⋯ » d’une correspondance = clic droit ; 🔔 relancer dans 30 jours, « À relancer », ✓ a répondu (↶)', async () => {
                await go('matches');
                await p.click(`[data-dna-rmenu="${mAnne}"]`); await p.waitForSelector('.ui-actmenu'); const a = await menuLabels(); await p.keyboard.press('Escape'); await sleep(200);
                await p.click(`tr[data-dna-row="${mAnne}"] td.c-cm`, {button: 'right'}); await p.waitForSelector('.ui-actmenu'); const b = await menuLabels();
                assert.deepStrictEqual(b, a); assert.ok(a[0].includes('Ouvrir') && a[1].includes('Modifier') && a.at(-1).includes('Supprimer'), a.join(' | '));
                await pickMenu('Relancer dans 30'); await sleep(800);
                const m = (await api('dna')).matches.find(x => x.id === mAnne);
                assert.match(m.data.follow_up, /^\d{4}-\d{2}-\d{2}$/); assert.strictEqual(m.status, 'contacted', 'relancer : contactée');
                assert.strictEqual((await api('dna_plus', {op: 'follow_ups'})).items[0].name, 'Anne MAZAUD');
                await go('home'); await p.waitForSelector(`[data-dna-followups] [data-dna-fdone="${mAnne}"]`);
                await p.click(`[data-dna-fdone="${mAnne}"]`); await sleep(800);
                let m2 = (await api('dna')).matches.find(x => x.id === mAnne); assert.strictEqual(m2.status, 'replied'); assert.ok(!m2.data.follow_up);
                await toastUndo('a répondu');
                m2 = (await api('dna')).matches.find(x => x.id === mAnne); assert.strictEqual(m2.status, 'contacted', '↶'); assert.ok(m2.data.follow_up);
                assert.match(php('echo json_encode(dna_semaine_items($pdo));'), /^\[\]$|Anne/, 'pour 🗓 Ma semaine');
            });
            await t('ADN : correspondance supprimée tout de suite (pas de question), « ↶ Annuler » la remet avec ses segments', async () => {
                await go('matches');
                await p.click(`[data-dna-rmenu="${mPaul}"]`); await p.waitForSelector('.ui-actmenu'); await pickMenu('Supprimer'); await sleep(800);
                assert.strictEqual(await p.$('dialog[open]'), null);
                assert.strictEqual(count(`SELECT count(*) FROM dna_matches WHERE id=${mPaul}`), '0');
                await toastUndo('supprimée');
                assert.strictEqual(count(`SELECT count(*) FROM dna_matches WHERE id=${mPaul}`), '1');
                assert.strictEqual(count(`SELECT count(*) FROM dna_segments WHERE match_id=${mPaul}`), '1', 'ses segments');
                assert.strictEqual(count(`SELECT group_ids FROM dna_matches WHERE id=${mPaul}`), String(g1), 'son groupe');
            });
            await t('ADN : groupe et test supprimés + ↶ (groupe : ses correspondances y reviennent ; test : tout revient)', async () => {
                await go('groups'); await p.click(`[data-dna-gmenu="${g1}"]`); await p.waitForSelector('.ui-actmenu'); await pickMenu('Supprimer'); await sleep(800);
                assert.strictEqual(count(`SELECT count(*) FROM dna_groups`), '0'); assert.strictEqual(count(`SELECT group_ids FROM dna_matches WHERE id=${mLucie}`), '');
                await toastUndo('Groupe');
                assert.strictEqual(count(`SELECT group_ids FROM dna_matches WHERE id=${mLucie}`), String(g1));
                await go('kits'); await p.click(`[data-dna-kmenu="${kA}"]`); await p.waitForSelector('.ui-actmenu'); await pickMenu('Supprimer'); await sleep(800);
                assert.strictEqual(count(`SELECT count(*) FROM dna_matches`), '0');
                await toastUndo('Test');
                assert.strictEqual(count(`SELECT count(*) FROM dna_matches`), '4'); assert.strictEqual(count(`SELECT count(*) FROM dna_segments`), '2');
                // plusieurs cochées
                const r = await post('bulk_dna_matches', {ids: [mAnne, mLucie], delete: 1}); assert.strictEqual(r.undo.matches.length, 2);
                await post('dna_plus', {op: 'restore', undo: r.undo}); assert.strictEqual(count(`SELECT count(*) FROM dna_matches`), '4');
            });
            await t('ADN : mots d’état (À faire · En cours · En pause · Terminé)', async () => {
                const st = await p.evaluate(() => window.LCNDA_EXT.dnaInternals.STATUSES.map(x => x[1]));
                assert.ok(st.some(x => /^À faire/.test(x)) && st.some(x => /^En cours/.test(x)) && st.some(x => /^En pause/.test(x)) && st.some(x => /^Terminé/.test(x)), st.join(' | '));
            });
            await t('📈 endogamie : branche cochée → cM corrigés, relation réajustée ; calculateur', async () => {
                await go('settings');
                await p.selectOption('[data-dna-endo-f]', '0.55'); await p.check(`[data-dna-endo-g="${g1}"]`); await sleep(900);
                const pr = await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-adn-prefs')).endo); assert.deepStrictEqual([pr.factor, pr.groups], [0.55, [g1]]);
                await go('matches');
                assert.match(await p.textContent(`tr[data-dna-row="${mPaul}"] td.c-guess`), /≈/);
                const v = await p.evaluate(() => { const I = window.LCNDA_EXT.dnaInternals; return [Math.round(I.cmFor({shared_cm: 200, groups: [Number(JSON.parse(localStorage.getItem('genealogie-adn-prefs')).endo.groups[0])], kit_id: 0})), I.cmFor({shared_cm: 200, groups: [], kit_id: 0})]; });
                assert.deepStrictEqual(v, [110, 200]);
                await p.evaluate(() => { window.LCNDA_APP.state.adnFilter.calc = '400'; }); await go('calc');
                await p.check('[data-dna-calc-endo]'); await p.waitForSelector('[data-dna-calc-corr]', {timeout: 10000});
                assert.match(await p.textContent('[data-dna-calc-corr]'), /400 cM comptés comme 220 cM/);
            });
            await t('🧪 correspondances partagées : matrice A × B, un clic les relie (↶), coller une liste', async () => {
                await go('shared'); await p.waitForSelector('[data-sm-matrix]');
                const cell = `[data-sm-cell="${mPaul}:${mLucie}"]`;
                assert.ok(await p.$eval(cell, c => c.classList.contains('is-off')));
                await p.click(cell); await p.waitForFunction(s => document.querySelector(s)?.classList.contains('is-on'), cell, {timeout: 10000});
                assert.ok((await api('dna')).matches.find(x => x.id === mLucie).data.shared_matches.includes('Paul DURAND'), 'noté chez les deux');
                await toastUndo('se correspondent');
                await p.waitForFunction(s => document.querySelector(s)?.classList.contains('is-off'), cell, {timeout: 10000});
                const r = await post('dna_plus', {op: 'import_shared', kit_id: kA, pairs: [['Anne MAZAUD', 'paul durand'], ['Anne MAZAUD', 'Inconnu X']]});
                assert.strictEqual(r.n, 1); assert.deepStrictEqual(r.unknown, ['Inconnu X']);
                const sp = await p.evaluate(() => [...window.LCNDA_EXT.dnaInternals.sharedPairs([{name: 'A', data: {shared_matches: ['b']}}, {name: 'B', data: {}}, {name: 'C', data: {}}])]);
                assert.deepStrictEqual(sp, ['0|1']);
            });
            await t('🧬 phasage visuel : trois frères et sœurs, un morceau donné à un grand-parent, ce qui est reconstitué (↶)', async () => {
                const pr = await post('dna_plus', {op: 'save_phasing', name: 'Fratrie MAZAUD', data: {siblings: [{kit_id: kA, name: 'Pierre'}, {kit_id: kB, name: 'Marie'}, {kit_id: kC, name: 'Jean'}], segments: [], crossovers: []}});
                await p.evaluate(id => { window.LCNDA_APP.state.adnFilter.phase = id; }, pr.id);
                await go('phasing'); await p.waitForSelector('[data-ph-svg]', {timeout: 20000});
                assert.strictEqual(await p.$$eval('[data-ph-sib]', r => r.length), 3);
                await p.selectOption('[data-ph-who]', '1'); await p.selectOption('[data-ph-gp]', 'PGF'); await p.fill('[data-ph-a]', '0'); await p.fill('[data-ph-b]', '100');
                await p.click('[data-ph-add]'); await p.waitForSelector('[data-ph-seg]', {timeout: 10000});
                assert.match(await p.textContent('[data-ph-union="PGF"]'), /^3[,.]5 %$/, '100 Mb sur 2 881 Mb');
                const ph = (await api('dna_plus', {op: 'phasing'})).projects[0]; assert.deepStrictEqual(ph.data.segments[0], {chr: '1', sib: 1, side: 'p', start: 0, end: 100, gp: 'PGF'});
                // un clic sur le morceau : le donner à la grand-mère paternelle
                const box = await (await p.$('[data-ph-seg]')).boundingBox(); await p.mouse.click(box.x + 5, box.y + 5); await p.waitForSelector('.ui-actmenu');
                await pickMenu('Grand-mère paternelle'); await sleep(900);
                assert.strictEqual((await api('dna_plus', {op: 'phasing'})).projects[0].data.segments[0].gp, 'PGM');
                await toastUndo('Morceau changé');
                assert.strictEqual((await api('dna_plus', {op: 'phasing'})).projects[0].data.segments[0].gp, 'PGF');
                // les segments partagés entre Pierre et Marie s'affichent
                assert.ok(await p.$eval('[data-ph-svg]', s => /Pierre × Marie/.test(s.textContent)), 'comparaison Pierre × Marie');
                await p.click('[data-ph-del]'); await sleep(800); assert.strictEqual((await api('dna_plus', {op: 'phasing'})).projects.length, 0);
                await toastUndo('Phasage'); assert.strictEqual((await api('dna_plus', {op: 'phasing'})).projects.length, 1);
            });
            await t('ADN : ⤓ Exporter ▾ (tableur, PDF, imprimer, fichier) ; chercher dans cette page', async () => {
                await go('matches'); await p.click('[data-dna-export]'); await p.waitForSelector('dialog.ui-export[open]');
                assert.deepStrictEqual(await p.$$eval('dialog.ui-export[open] .ui-export-fmt', b => b.map(x => x.dataset.fmt)), ['csv', 'pdf', 'print', 'file']);
                await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close())); await sleep(300);
                await go('learn'); await p.waitForSelector('.h-dna-find input');
                await p.fill('.h-dna-find input', 'Leeds'); await sleep(400);
                assert.strictEqual(await p.$$eval('.h-dna-learn:not(.enq-find-off)', d => d.length), 1);
            });
            await t('ADN en consultation : ni ＋, ni import, ni suppression ; la fiche d’une correspondance en lecture seule', async () => {
                await p.evaluate(() => document.body.classList.add('is-kiosk'));
                await go('matches');
                for (const sel of ['[data-dna-newmatch]', '[data-dna-import]', '[data-dna-chk]', '.h-dna-bulk']) assert.strictEqual(await p.$(`.h-dna-page ${sel}`), null, sel);
                await p.click(`[data-dna-rmenu="${mAnne}"]`); await p.waitForSelector('.ui-actmenu'); assert.ok(!(await menuLabels()).some(x => /Supprimer|Modifier|Relancer/.test(x))); await p.keyboard.press('Escape'); await sleep(200);
                await p.click(`[data-dna-match="${mAnne}"]`); await p.waitForSelector('dialog[open] [name=shared_cm]');
                assert.ok(await p.$eval('dialog[open] [name=shared_cm]', i => i.disabled)); assert.strictEqual(await p.$('dialog[open] [data-h-delete]'), null);
                await p.evaluate(() => { document.querySelectorAll('dialog[open]').forEach(d => d.close()); document.body.classList.remove('is-kiosk'); });
                await go('kits'); assert.ok(await p.$('[data-dna-newkit]'));
            });
            await t('ADN 390 px : rien ne déborde (correspondances, phasage)', async () => {
                await p.setViewportSize({width: 390, height: 800});
                for (const sec of ['matches', 'phasing', 'settings']) {
                    await go(sec); await sleep(500);
                    const over = await p.evaluate(() => [...document.querySelectorAll('#workspace .page *')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.right > window.innerWidth + 2 && !e.closest('.data-table-wrap,svg,.ui-actmenu,.h-dna-shared-matrix'); }).slice(0, 5).map(e => `${e.tagName}.${e.className} r=${Math.round(e.getBoundingClientRect().right)}`));
                    assert.deepStrictEqual(over, [], sec);
                }
                await p.setViewportSize({width: 1440, height: 900});
            });
            await ctx2.close();
        }
        assert.deepStrictEqual(errs, [], 'erreurs JS : ' + errs.join(' | '));
    } catch (e) { fails++; console.log('✗ ' + (e.stack || e)); }
    finally { await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true}); }
    console.log(fails ? `${fails} échec(s)` : 'tout est bon'); process.exit(fails ? 1 : 0);
})();
