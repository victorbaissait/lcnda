#!/usr/bin/env node
/* 📋 Audit des onglets — Listes (section 9) et deux manques transversaux :
 *  - 📚 Sources comme objet (lib/sources_gestion.php, assets/js/app-sources-liste.js) : liste, « où est-elle citée », doublons,
 *    fusion (+ ↶ Annuler), dépôt, modèle de citation à la manière d'Evidence Explained ;
 *  - ☑ barre de sélection commune (assets/js/app-selection.js) : Personnes, Événements, Sources, Notes ;
 *  - listes en plus : 💍 Familles, 🔤 Noms de famille, 📝 Notes ; 💾 Filtres enregistrés ; ✎ corriger dans la cellule ;
 *  - R6 mode consultation, R7 ↶ au lieu de « Supprimer ? » (visites d'archives), R9 mots d'état, R11 « ⋯ » + clic droit, R12 390 px.
 *   node tests/test-audit-listes.js */
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
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-al-'));
    fs.mkdirSync(path.join(tmp, 'media'));
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4'};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$tag = function ($t) use ($pdo) { $s = $pdo->prepare('SELECT id FROM event_types WHERE gedcom_tag=? ORDER BY id LIMIT 1'); $s->execute([$t]); return (int) $s->fetchColumn(); };
$pdo->prepare("INSERT INTO places(name, county, country) VALUES('Tulle','Corrèze','France')")->execute(); $tulle = (int) $pdo->lastInsertId();
$per = function ($f, $l, $g, $evs) use ($pdo, $tag) { $pdo->prepare("INSERT INTO persons(first_name,last_name,gender,living_status) VALUES(?,?,?,'deceased')")->execute([$f, $l, $g]); $id = (int) $pdo->lastInsertId();
    foreach ($evs as [$t, $y, $p]) { $pdo->prepare("INSERT INTO events(scope, person_id, event_type_id, year, date_text, place_id) VALUES('person',?,?,?,?,?)")->execute([$id, $tag($t), $y, (string) $y, $p]); } return $id; };
$ids = ['pierre' => $per('Pierre', 'MAZAUD', 'male', [['BIRT', 1870, $tulle]]), 'marie' => $per('Marie', 'LACOMBE', 'female', [['BIRT', 1872, $tulle]]),
  'jean' => $per('Jean', 'DURAND', 'male', [['BIRT', 1860, null]]), 'paul' => $per('Paul', 'DURAND', 'male', [['BIRT', 1900, null]]), 'louis' => $per('Louis', 'MAZAUD', 'male', [['BIRT', 1896, $tulle]])];
$pdo->prepare('INSERT INTO families(partner1_id, partner2_id) VALUES(?,?)')->execute([$ids['pierre'], $ids['marie']]); $fam = (int) $pdo->lastInsertId();
$pdo->prepare("INSERT INTO events(scope, family_id, event_type_id, year, date_text, place_id) VALUES('family',?,?,1895,'12 mai 1895',?)")->execute([$fam, $tag('MARR'), $tulle]); $marr = (int) $pdo->lastInsertId();
$pdo->prepare("INSERT INTO family_children(family_id, child_id) VALUES(?,?)")->execute([$fam, $ids['louis']]);
$src = function ($title, $author = '', $url = '') use ($pdo) { $pdo->prepare('INSERT INTO sources(title, author, url) VALUES(?,?,?)')->execute([$title, $author, $url]); return (int) $pdo->lastInsertId(); };
$s1 = $src('État civil de Tulle', 'Mairie de Tulle'); $s2 = $src('Etat civil de TULLE !'); $s3 = $src('Recensement de 1906');
$pdo->prepare("INSERT INTO source_links(entity_type, entity_id, source_record_id, page) VALUES('person',?,?,'acte 45')")->execute([$ids['pierre'], $s1]);
$pdo->prepare("INSERT INTO source_links(entity_type, entity_id, source_record_id, page) VALUES('event',?,?,'acte 12')")->execute([$marr, $s2]);
$pdo->prepare("INSERT INTO notes(entity_type, entity_id, title, body) VALUES('person',?,'Métier','Il travaillait au moulin de la Barrière, à Tulle.')")->execute([$ids['pierre']]);
$pdo->prepare("INSERT INTO notes(entity_type, entity_id, title, body) VALUES('person',?,'','Née rue de la Barussie.')")->execute([$ids['marie']]);
$pdo->prepare("INSERT INTO custom_lists(name, icon, description, source, definition_json, position) VALUES('À chercher','📋','','persons','{}',1)")->execute(); $list = (int) $pdo->lastInsertId();
$pdo->prepare("INSERT INTO archive_visit_plans(title, archive_center) VALUES('Visite à Tulle','Archives de la Corrèze')")->execute(); $visit = (int) $pdo->lastInsertId();
$pdo->prepare("INSERT INTO archive_visit_items(visit_id, archive_reference) VALUES(?, '3 E 12/4')")->execute([$visit]); $vitem = (int) $pdo->lastInsertId();
$ids += ['fam' => $fam, 'marr' => $marr, 's1' => $s1, 's2' => $s2, 's3' => $s3, 'list' => $list, 'visit' => $visit, 'vitem' => $vitem];
echo json_encode($ids);`], {cwd: root, encoding: 'utf8', env});
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
        await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], {origin: base});
        const p = await ctx.newPage();
        p.on('pageerror', e => errs.push(e.message));
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_UI?.listBar, null, {timeout: 30000});
        // les nouveaux fichiers (les balises <script>/<link> sont posées dans index.php par ailleurs) : chargés ici s'ils manquent
        await p.evaluate(async () => {
            const add = (tag, attrs) => new Promise(res => { const el = Object.assign(document.createElement(tag), attrs); el.onload = res; el.onerror = res; document.head.appendChild(el); });
            if (!document.querySelector('link[href*="audit-listes.css"]')) await add('link', {rel: 'stylesheet', href: 'assets/css/audit-listes.css'});
            if (!window.LCNDA_EXT?.selectionBar) await add('script', {src: 'assets/js/app-selection.js'});
            if (!window.LCNDA_EXT?.listesPlus) await add('script', {src: 'assets/js/app-sources-liste.js'});
        });
        await p.waitForFunction(() => window.LCNDA_EXT?.selectionBar && window.LCNDA_EXT?.listesPlus && window.LCNDA_EXT?.openDialog);
        const api = (x, q = {}) => p.evaluate(([y, z]) => window.LCNDA_APP.api(y, z).catch(e => ({error: e.message})), [x, q]);
        const post = (a, b) => p.evaluate(async ([x, y]) => { try { const r = await window.LCNDA_APP.api(x, {}, {method: 'POST', body: y}); return r.result || r; } catch (e) { return {error: e.message}; } }, [a, b]);
        const w = b => post('listes_plus_write', b);
        const list = type => p.evaluate(ty => { const A = window.LCNDA_APP; A.state.listType = ty; if (A.state.module === 'listes') { A.renderSidebar(); return A.renderList(); } A.setModule('listes'); }, type);
        const undoLast = re => p.evaluate(src => { const rx = new RegExp(src); const tt = [...document.querySelectorAll('.ui-toast')].reverse().find(x => rx.test(x.textContent)); const b = tt && [...tt.querySelectorAll('button')].find(b => /Annuler/.test(b.textContent)); if (!b) return false; b.click(); return true; }, re.source);

        await t('serveur 📚 : sources, citations, fiches, doublons ; « où est-elle citée » ; modèle EE', async () => {
            const d = await api('listes_plus', {what: 'sources'});
            assert.strictEqual(d.rows.length, 3);
            const s1 = d.rows.find(r => r.id === ID.s1), s2 = d.rows.find(r => r.id === ID.s2), s3 = d.rows.find(r => r.id === ID.s3);
            assert.deepStrictEqual([s1.citations, s1.people, s2.citations, s2.people, s3.citations], [1, 1, 1, 1, 0]);
            assert.ok(s1.dupe && s1.dupe === s2.dupe && !s3.dupe, 'même titre sans accents ni ponctuation : doublon');
            const one = await api('listes_plus', {what: 'source', id: ID.s2});
            assert.match(one.links[0].label, /Mariage.*12 mai 1895.*Pierre MAZAUD et Marie LACOMBE/);
            assert.strictEqual(one.links[0].person_id, ID.pierre);
            assert.deepStrictEqual(one.dupes.map(x => x.id), [ID.s1]);
            assert.ok(one.models.some(m => m.key === 'ec') && one.models.length >= 7);
            const r = await w({op: 'source_save', id: ID.s3, title: 'Recensement de 1906', model: 'recensement', fields: {commune: 'Tulle', departement: 'Corrèze', annee: '1906', page: '12', qui: 'Pierre MAZAUD', depot: 'Archives de la Corrèze', cote: '6 M 245', vue: '8'}});
            assert.ok(r.id, JSON.stringify(r));
            const ee = (await api('listes_plus', {what: 'source', id: ID.s3})).ee;
            assert.strictEqual(ee.entry, 'Corrèze. Tulle. Recensement de 1906. Archives de la Corrèze.');
            assert.match(ee.first, /^Tulle \(Corrèze\), recensement de 1906, p\. 12, foyer de Pierre MAZAUD ; Archives de la Corrèze, cote 6 M 245, vue 8\.$/);
            assert.match(ee.next, /^Tulle, recensement 1906, p\. 12, Pierre MAZAUD\.$/);
            assert.ok((await w({op: 'source_save', id: ID.s3, url: 'javascript:alert(1)'})).error, 'lien refusé');
        });
        await t('serveur 📚 : ⇄ fusion puis ↶ Annuler (citations, cases vides complétées)', async () => {
            const m = await w({op: 'source_merge', target: ID.s1, others: [ID.s2]});
            assert.strictEqual(m.merged, 1);
            let d = await api('listes_plus', {what: 'sources'});
            assert.strictEqual(d.rows.length, 2); assert.strictEqual(d.rows.find(r => r.id === ID.s1).citations, 2); assert.ok(!d.rows.find(r => r.id === ID.s1).dupe);
            const u = await w({op: 'source_unmerge', change_id: m.change_id}); assert.strictEqual(u.restored, 1);
            d = await api('listes_plus', {what: 'sources'});
            assert.deepStrictEqual(d.rows.map(r => [r.id, r.citations]).sort((a, b) => a[0] - b[0]), [[ID.s1, 1], [ID.s2, 1], [ID.s3, 0]]);
            assert.ok((await w({op: 'source_unmerge', change_id: m.change_id})).already, 'deux fois : déjà remis');
        });
        await t('serveur 💍 🔤 📝 : familles, noms de famille, notes en plein texte', async () => {
            const f = (await api('listes_plus', {what: 'families'})).rows;
            assert.strictEqual(f.length, 1);
            assert.deepStrictEqual([f[0].partner1, f[0].partner2, f[0].marriage_date, f[0].marriage_place, f[0].children, f[0].sources], ['Pierre MAZAUD', 'Marie LACOMBE', '12 mai 1895', 'Tulle', 1, 1]);
            const s = (await api('listes_plus', {what: 'surnames'})).rows;
            const maz = s.find(x => x.key === 'mazaud'); assert.deepStrictEqual([maz.count, maz.from, maz.to, maz.places[0]], [2, 1870, 1896, 'Tulle']);
            assert.strictEqual(s.find(x => x.key === 'durand').count, 2);
            assert.deepStrictEqual((await api('listes_plus', {what: 'surname', name: 'Durand'})).rows.map(r => r.first_name).sort(), ['Jean', 'Paul']);
            const n = await api('listes_plus', {what: 'notes', q: 'moulin Tulle'});
            assert.deepStrictEqual([n.total, n.rows[0].label, n.rows[0].person_id], [1, 'Pierre MAZAUD', ID.pierre]);
            assert.strictEqual((await api('listes_plus', {what: 'notes', q: 'introuvable'})).total, 0);
            assert.strictEqual((await api('listes_plus', {what: 'notes'})).total, 2);
        });
        await t('serveur ☑ : étiqueter, verrouiller, Mes listes, supprimer — chacun avec son ↶', async () => {
            let r = await w({op: 'label_add', entity_type: 'person', ids: [ID.jean, ID.paul], label_name: 'Corrèze'});
            assert.deepStrictEqual(r.added.sort(), [ID.jean, ID.paul].sort()); assert.ok(r.created);
            await w({op: 'label_remove', entity_type: 'person', ids: r.added, label_id: r.label_id, drop_label: 1});
            assert.ok(!((await api('labels')).labels || []).some(l => l.name === 'Corrèze'), '↶ : l’étiquette créée repart');
            r = await w({op: 'lock', ids: [ID.jean], locked: 1}); assert.deepStrictEqual(r.before, {[ID.jean]: 0});
            const blocked = await w({op: 'label_add', entity_type: 'person', ids: [ID.jean], label_name: 'X'}); assert.strictEqual(blocked.skipped, 1, 'fiche verrouillée laissée de côté');
            await w({op: 'lock_restore', before: r.before});
            r = await w({op: 'mylist_add', list_id: ID.list, ids: [ID.jean]}); assert.deepStrictEqual(r.before, {['p:' + ID.jean]: null});
            assert.deepStrictEqual((await w({op: 'mylist_add', list_id: ID.list, ids: [ID.jean]})).before, {['p:' + ID.jean]: 1}, 'ajoutée à la main dans Mes listes');
            await w({op: 'mylist_restore', list_id: ID.list, before: r.before});
            assert.deepStrictEqual((await w({op: 'mylist_add', list_id: ID.list, ids: [ID.jean]})).before, {['p:' + ID.jean]: null}, '↶ : retirée');
            await w({op: 'mylist_restore', list_id: ID.list, before: r.before});
            r = await w({op: 'delete_persons', ids: [ID.paul]}); assert.strictEqual(r.deleted.length, 1);
            assert.ok((await api('person', {id: ID.paul})).error, 'supprimée');
            await w({op: 'restore_persons', change_ids: r.deleted.map(x => x.change_id)});
            assert.ok(!(await api('person', {id: ID.paul})).error, '↶ : revenue');
            r = await w({op: 'cell_edit', entity: 'event', id: ID.marr, field: 'date_text', value: '13 mai 1895'}); assert.strictEqual(r.old, '12 mai 1895');
            await w({op: 'cell_edit', entity: 'event', id: ID.marr, field: 'date_text', value: r.old});
            r = await w({op: 'visit_item_delete', id: ID.vitem}); await w({op: 'visit_item_restore', change_id: r.change_id});
            r = await w({op: 'visit_delete', id: ID.visit}); assert.ok(r.change_id);
            await w({op: 'visit_restore', change_id: r.change_id});
            const plan = (await api('archive_visit_plans')).plans.find(x => x.id === ID.visit); assert.ok(plan && plan.items.length === 1, 'visite et sa cote revenues');
        });

        await t('écran : les nouvelles listes rangées dans leurs groupes (colonne de gauche)', async () => {
            await list('persons');
            await p.waitForSelector('#table-target table');
            const keys = await p.evaluate(() => [...document.querySelectorAll('[data-side-value]')].map(b => b.dataset.sideValue));
            ['sources_list', 'families_list', 'surnames_list', 'notes_list'].forEach(k => assert.ok(keys.includes(k), k));
        });
        await t('écran 📚 : liste, ⋯, ouvrir une source, où est-elle citée, modèle EE, ☑ fusionner (↶)', async () => {
            await list('sources_list');
            await p.waitForSelector('[data-lp="sources"] table tbody tr');
            assert.strictEqual(await p.locator('[data-lp="sources"] tbody tr').count(), 3);
            assert.ok(await p.$('.ui-listbar [data-saved-filters]'), '💾 Filtres dans la barre');
            await p.click(`[data-lp-src-more="${ID.s1}"]`);
            const items = await p.$$eval('.ui-actmenu .ui-actmenu-i b', bs => bs.map(b => b.textContent));
            assert.deepStrictEqual(items.slice(0, 3), ['Ouvrir', 'Modifier', 'Fusionner avec ses doublons']); assert.strictEqual(items.at(-1), 'Supprimer');
            await p.keyboard.press('Escape');
            // clic droit : le même menu
            await p.click(`[data-lp-src-row="${ID.s3}"] td:nth-child(2)`, {button: 'right'});
            await p.waitForSelector('.ui-actmenu');
            assert.strictEqual(await p.$eval('.ui-actmenu .ui-actmenu-i b', b => b.textContent), 'Ouvrir');
            await p.keyboard.press('Escape'); await sleep(200);
            await p.click(`[data-lp-src-open="${ID.s3}"]`);
            await p.waitForSelector('[data-lp="source"] [data-lp-where]');
            assert.match(await p.textContent('.lp-ee'), /Tulle \(Corrèze\), recensement de 1906/);
            await p.selectOption('[data-lp-model]', 'ec');
            await p.fill('[name=f_commune]', 'Tulle'); await p.fill('[name=f_registre]', 'Naissances'); await p.fill('[name=f_annee]', '1870'); await p.fill('[name=f_acte]', '45');
            await p.click('[data-lp-src-form] button[type=submit]');
            await p.waitForFunction(() => /Tulle, Naissances 1870, acte n° 45/.test(document.querySelector('.lp-ee')?.textContent || ''));
            await p.click('[data-lp-back]');
            await p.waitForSelector('[data-lp="sources"] tbody tr');
            await p.click(`tr[data-sel-id="${ID.s1}"] [data-sel-check]`); await p.click(`tr[data-sel-id="${ID.s2}"] [data-sel-check]`);
            assert.match(await p.textContent('.sel-bar'), /2 sources cochées/);
            await p.click('.sel-bar [data-sel-act="0"]'); // ⇄ Fusionner
            await p.waitForSelector('dialog[open] input[name=keep]');
            await p.click('dialog[open] .modal-actions button[type=submit]');
            await p.waitForFunction(() => document.querySelectorAll('[data-lp="sources"] tbody tr').length === 2);
            assert.ok(await undoLast(/fusionnées/), '↶ Annuler');
            await p.waitForFunction(() => document.querySelectorAll('[data-lp="sources"] tbody tr').length === 3, null, {timeout: 10000});
        });
        await t('écran 👥 Personnes : ☑ cases, barre, 🏷 Étiqueter (↶), ⋯ = clic droit', async () => {
            await list('persons');
            await p.waitForSelector(`#table-target tr[data-sel-id="${ID.jean}"] [data-sel-check]`);
            await p.click(`tr[data-sel-id="${ID.jean}"] [data-sel-check]`); await p.click(`tr[data-sel-id="${ID.paul}"] [data-sel-check]`);
            assert.match(await p.textContent('.sel-bar'), /2 fiches cochées/);
            const acts = await p.$$eval('.sel-bar [data-sel-act]', bs => bs.map(b => b.textContent.trim()));
            assert.deepStrictEqual(acts, ['🏷 Étiqueter', '★ Ajouter à Mes listes', '🔒 Verrouiller', '🔓 Déverrouiller', '⤓ Exporter', '🗑 Supprimer']);
            await p.click('.sel-bar [data-sel-act="0"]');
            await p.waitForSelector('dialog[open] input[name=label_name]');
            await p.fill('dialog[open] input[name=label_name]', 'Branche DURAND');
            await p.click('dialog[open] .modal-actions button[type=submit]');
            await p.waitForFunction(() => /Étiquette posée sur 2/.test([...document.querySelectorAll('.ui-toast')].map(x => x.textContent).join('|')), null, {timeout: 10000});
            const lab = ((await api('labels')).labels || []).find(l => l.name === 'Branche DURAND'); assert.ok(lab);
            assert.ok(await undoLast(/Étiquette posée/)); await sleep(800);
            assert.ok(!((await api('labels')).labels || []).some(l => l.name === 'Branche DURAND'), '↶ Annuler');
            await p.click(`tr[data-sel-id="${ID.pierre}"] td:nth-child(2)`, {button: 'right'});
            await p.waitForSelector('.ui-actmenu');
            const m = await p.$$eval('.ui-actmenu .ui-actmenu-i b', bs => bs.map(b => b.textContent));
            assert.deepStrictEqual(m, ['Ouvrir', 'Modifier', 'Étiqueter', 'Ajouter à Mes listes', 'Verrouiller', 'Déverrouiller', 'Exporter', 'Supprimer']);
            await p.keyboard.press('Escape');
        });
        await t('écran 📅 Événements : ✎ double-clic sur la date, Entrée, ↶ Annuler', async () => {
            await list('events');
            const sel = `tr[data-sel-id="${ID.marr}"] td[data-cell-edit="date_text"]`;
            await p.waitForSelector(sel);
            await p.dblclick(sel); await p.fill(`${sel} input[data-cell-input]`, '14 mai 1895'); await p.keyboard.press('Enter');
            await p.waitForFunction(s => document.querySelector(s)?.textContent === "14 mai 1895" && document.querySelector(s + " [data-sel-check]"), sel);
            assert.strictEqual((await api('listes_plus', {what: 'families'})).rows[0].marriage_date, '14 mai 1895');
            assert.ok(await undoLast(/Corrigé/)); await sleep(800);
            assert.strictEqual((await api('listes_plus', {what: 'families'})).rows[0].marriage_date, '12 mai 1895');
        });
        await t('écran 💾 : « Enregistrer ces filtres », puis les rappeler d’un clic', async () => {
            await list('persons');
            await p.waitForSelector('.ui-listbar input');
            await p.fill('.ui-listbar input', 'Durand'); await sleep(700);
            await p.click('[data-saved-filters]');
            await p.click('.ui-actmenu .ui-actmenu-i:has-text("Enregistrer ces filtres")');
            await p.waitForSelector('dialog[open] input');
            await p.fill('dialog[open] input', 'Les Durand'); await p.keyboard.press('Enter');
            await p.waitForFunction(() => /Les Durand/.test(localStorage.getItem('genealogie-list-saved-filters') || ''));
            await p.fill('.ui-listbar input', ''); await sleep(700);
            await p.click('[data-saved-filters]'); await p.click('.ui-actmenu .ui-actmenu-i:has-text("Les Durand")');
            await p.waitForFunction(() => document.querySelector('.ui-listbar input')?.value === 'Durand' && document.querySelectorAll('#table-target tbody tr').length === 2, null, {timeout: 10000});
        });
        await t('écran 💍 🔤 📝 : familles, un nom ouvert (☑), notes cherchées', async () => {
            await list('families_list');
            await p.waitForSelector('[data-lp="families"] tbody tr');
            assert.match(await p.textContent('[data-lp="families"] tbody'), /Pierre MAZAUD.*Marie LACOMBE.*12 mai 1895.*Tulle/s);
            await list('surnames_list');
            await p.waitForSelector('[data-lp-sn-open="DURAND"]');
            await p.click('[data-lp-sn-open="DURAND"]');
            await p.waitForSelector('[data-lp="surname"] tr[data-sel-id] [data-sel-check]');
            assert.strictEqual(await p.locator('[data-lp="surname"] tbody tr').count(), 2);
            assert.ok(await p.$('.sel-bar'), 'la barre de sélection commune');
            await p.click('[data-lp-back]');
            await list('notes_list');
            await p.waitForSelector('[data-lp="notes"] tbody tr');
            await p.fill('.ui-listbar input', 'moulin');
            await p.waitForFunction(() => document.querySelectorAll('[data-lp="notes"] tbody tr').length === 1 && document.querySelector('[data-lp="notes"] mark'), null, {timeout: 10000});
        });
        await t('R9 : rappels « À faire / Terminé » ; visites « À faire » ; R7 : visite supprimée tout de suite (↶)', async () => {
            await list('archive_visits');
            await p.waitForSelector('.ui-listbar .ui-listbar-chip');
            assert.match(await p.textContent('.ui-listbar .ui-listbar-chip'), /À faire/);
            await p.evaluate(() => document.querySelector('#workspace .ui-listbar').clear());
            const v = await p.waitForSelector(`[data-delete-archive-visit="${ID.visit}"]`, {state: 'attached'});
            await p.evaluate(b => b.click(), v);
            await p.waitForFunction(() => /Feuille de mission supprimée/.test([...document.querySelectorAll('.ui-toast')].map(x => x.textContent).join('|')));
            assert.ok(!(await p.$('dialog[open]')), 'pas de « Supprimer ? »');
            assert.ok(await undoLast(/Feuille de mission supprimée/)); await sleep(800);
            assert.ok((await api('archive_visit_plans')).plans.some(x => x.id === ID.visit));
        });
        await t('R6 mode consultation : pas de ＋, ni de ⇄ / 🗑, ni de ✎ dans la cellule', async () => {
            await p.evaluate(() => document.body.classList.add('is-kiosk'));
            await list('sources_list'); await p.waitForSelector('[data-lp="sources"] tbody tr');
            assert.ok(!(await p.$('[data-lp-src-new]')), 'pas de ＋ Nouvelle source');
            await p.click(`tr[data-sel-id="${ID.s1}"] [data-sel-check]`);
            const acts = await p.$$eval('.sel-bar [data-sel-act]', bs => bs.map(b => b.textContent.trim()));
            assert.deepStrictEqual(acts, ['⤓ Exporter']);
            await list('events'); await p.waitForSelector('#table-target tbody tr');
            assert.strictEqual(await p.locator('td[data-cell-edit]').count(), 0);
            await list('reminders'); await p.waitForSelector('#table-target');
            assert.ok(!(await p.isVisible('#add-standalone-reminder')), 'pas de ＋ Rappel');
            await p.evaluate(() => document.body.classList.remove('is-kiosk'));
        });
        await t('R12 : à 390 px, rien ne dépasse (Sources, Personnes)', async () => {
            await p.setViewportSize({width: 390, height: 800});
            for (const ty of ['sources_list', 'persons']) {
                await list(ty); await p.waitForSelector('#workspace table tbody tr'); await sleep(300);
                const r = await p.evaluate(() => ({sw: document.documentElement.scrollWidth, iw: window.innerWidth}));
                assert.ok(r.sw <= r.iw + 1, `${ty} : ${r.sw} > ${r.iw}`);
            }
            await p.setViewportSize({width: 1440, height: 900});
        });
        assert.deepStrictEqual(errs, [], 'erreurs JS : ' + errs.join(' | '));
    } finally { await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true}); }
    console.log(fails ? `${fails} échec(s)` : 'tout est bon'); process.exit(fails ? 1 : 0);
})();
