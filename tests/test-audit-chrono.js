#!/usr/bin/env node
/* Audit des onglets — 🕰 Chronologie (§10) et ⚖️ Comparaison (§15) : assets/js/app-chronologie.js, assets/js/app-comparaison.js,
 * assets/css/audit-chrono.css.
 *  Chronologie : personne de départ choisie dans la colonne (appliqué tout de suite, plus de « Actualiser »), filtre par sorte
 *  d'événement, 🔍 chercher dans la frise, 🎂 âge, 🚨 anomalie du Contrôle en rouge, 📏 barres de vie + zoom, 🏘 chronologie d'un lieu,
 *  ⤓ Exporter (CSV téléchargé), 🖨 Imprimer, 💾 vue enregistrée, ⋯ et clic droit, mode consultation, 390 px.
 *  Comparaison : en-tête commun, 🧮 ressemblance, ↔ alignement par sorte, ⇄ inverser, 👥 fiche C, 🔀 fusion (valeurs choisies,
 *  doublons retirés + ↶), 📜 acte, 🖼 rideau et différence, ⤓ CSV, 💾 vue, mode consultation, 390 px.
 *   node tests/test-audit-chrono.js */
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
const PNG = c => Buffer.from(c, 'base64');

(async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-chrono-'));
    fs.mkdirSync(path.join(tmp, 'media'));
    // deux petites images (rouge, bleue) pour la superposition
    fs.writeFileSync(path.join(tmp, 'media', 'sig-a.png'), PNG('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEklEQVR4nGP4z8DAwMDAwMDAAAAhBQEBVJ7dGAAAAABJRU5ErkJggg=='));
    fs.writeFileSync(path.join(tmp, 'media', 'sig-b.png'), PNG('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEklEQVR4nGNgYPjPwMDAwMDAAAAUBQEB7I4hNQAAAABJRU5ErkJggg=='));
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4'};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
require_once 'lib/transcriptions.php';
$tag = function ($t) use ($pdo) { $s = $pdo->prepare('SELECT id FROM event_types WHERE gedcom_tag=? ORDER BY id LIMIT 1'); $s->execute([$t]); return (int) $s->fetchColumn(); };
$pl = function ($name) use ($pdo) { $pdo->prepare("INSERT INTO places(name, county, country) VALUES(?, 'Corrèze', 'France')")->execute([$name]); return (int) $pdo->lastInsertId(); };
$tulle = $pl('Tulle'); $brive = $pl('Brive');
$per = function ($f, $l, $g, $evs) use ($pdo, $tag) { $pdo->prepare("INSERT INTO persons(first_name,last_name,gender,living_status) VALUES(?,?,?,'deceased')")->execute([$f, $l, $g]); $id = (int) $pdo->lastInsertId();
    foreach ($evs as [$t, $y, $d, $p]) { $pdo->prepare('INSERT INTO events(scope, person_id, event_type_id, year, date_text, place_id) VALUES(\'person\',?,?,?,?,?)')->execute([$id, $tag($t), $y, $d, $p]); } return $id; };
$ids = [
  'jean' => $per('Jean', 'MAZAUD', 'male', [['BIRT', 1850, '12/03/1850', $tulle], ['OCCU', 1880, '1880', $tulle], ['DEAT', 1910, '1910', $tulle]]),
  'marie' => $per('Marie', 'LACOMBE', 'female', [['BIRT', 1855, '1855', $brive], ['DEAT', 1920, '1920', $brive]]),
  'paul' => $per('Paul', 'MAZAUD', 'male', [['BIRT', 1876, '1876', $tulle], ['CENS', 1906, '1906', $tulle]]),
  'louis' => $per('Louis', 'DURAND', 'male', [['BIRT', 1900, '1900', $brive], ['DEAT', 1890, '1890', $brive]]),
  // le doublon : décès d'abord dans la liste (l'alignement par sorte remet naissance en face de naissance)
  'jean2' => $per('Jean', 'MAZAUD', 'male', [['DEAT', 1910, '1910', $tulle], ['BIRT', 1851, '1851', $tulle]]),
];
$pdo->prepare('INSERT INTO families(partner1_id, partner2_id) VALUES(?,?)')->execute([$ids['jean'], $ids['marie']]); $fam = (int) $pdo->lastInsertId();
$pdo->prepare('INSERT INTO family_children(family_id, child_id) VALUES(?,?)')->execute([$fam, $ids['paul']]);
$pdo->prepare("INSERT INTO events(scope, family_id, event_type_id, year, date_text, place_id) VALUES('family',?,?,1875,'1875',?)")->execute([$fam, $tag('MARR'), $tulle]);
act_transcriptions_ensure($pdo);
$pdo->prepare("INSERT INTO act_transcriptions(title, kind, date_text, place, body) VALUES(?,?,?,?,?)")->execute(['Naissance à Tulle', 'naissance', '12 mars 1850', 'Tulle', "L'an 1850, le douze mars, à Tulle, est né Jean, fils de Pierre MAZAUD, cultivateur."]);
$ids['act'] = (int) $pdo->lastInsertId();
$pdo->prepare("INSERT INTO media(title, media_type, filename) VALUES('Signature A','image','sig-a.png')")->execute(); $ids['ma'] = (int) $pdo->lastInsertId();
$pdo->prepare("INSERT INTO media(title, media_type, filename) VALUES('Signature B','image','sig-b.png')")->execute(); $ids['mb'] = (int) $pdo->lastInsertId();
$ids['tulle'] = $tulle;
echo json_encode($ids);`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0 || !/jean/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const ID = JSON.parse(seed.stdout.trim().split('\n').pop());
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const errs = [];
    try {
        const ctx = await browser.newContext({viewport: {width: 1440, height: 900}, acceptDownloads: true});
        const p = await ctx.newPage();
        p.on('pageerror', e => errs.push(e.message));
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_PARTS?.renderTimeline && window.LCNDA_PARTS?.renderComparison, null, {timeout: 30000});
        await p.addStyleTag({path: path.join(root, 'assets/css/audit-chrono.css')}); // la feuille n'est pas encore dans index.php
        const api = (x, q = {}) => p.evaluate(([y, z]) => window.LCNDA_APP.api(y, z).catch(e => ({error: e.message})), [x, q]);
        const post = (a, b) => p.evaluate(async ([x, y]) => { try { const r = await window.LCNDA_APP.api(x, {}, {method: 'POST', body: y}); return r.result || r; } catch (e) { return {error: e.message}; } }, [a, b]);
        const menuLabels = () => p.$$eval('.ui-actmenu button', bs => bs.map(b => b.textContent.trim()));
        const closeMenu = async () => { await p.keyboard.press('Escape'); await sleep(100); };
        const pick = (sel, item) => p.evaluate(([s, it]) => document.querySelector(s).dispatchEvent(new CustomEvent('picker-change', {bubbles: true, detail: {item: it, items: [it]}})), [sel, item]);
        const goChrono = async (setup = '') => { await p.evaluate(s => { const A = window.LCNDA_APP; Object.assign(A.state.timeline, JSON.parse(s || '{}')); A.setModule('chronologie'); }, setup); await p.waitForSelector('.chrono-page .ui-ph', {timeout: 15000}); await sleep(300); };

        /* ═════════════ 🕰 Chronologie ═════════════ */
        await p.evaluate(id => { const A = window.LCNDA_APP; A.state.currentPersonId = id; }, ID.jean);
        await goChrono(JSON.stringify({source: 'person', up: 0, down: 1, partners: true, history: false, view: 'vertical', ages: true, anomalies: true, parallelMode: 'single', compare: false}));
        await t('Chronologie : en-tête commun, ⤓ Exporter et 🖨 Imprimer, plus de bouton « Actualiser »', async () => {
            assert.equal(await p.$('#timeline-refresh'), null);
            assert.ok(await p.$('.chrono-page .ui-ph [data-chrono-export]')); assert.ok(await p.$('.chrono-page .ui-ph [data-chrono-print]'));
            assert.match(await p.textContent('.chrono-page .ui-ph h2'), /Chronologie/);
        });
        await t('Chronologie : la personne de départ se choisit dans la colonne (et s’applique tout de suite)', async () => {
            assert.ok(await p.$('#timeline-root-pk [data-picker], #timeline-root-pk .pk-field, #timeline-root-pk input, #timeline-root-pk button'));
            await pick('#timeline-root-pk', {id: ID.louis, title: 'Louis DURAND', kind: 'person'});
            await p.waitForFunction(id => window.LCNDA_APP.state.currentPersonId === id && document.querySelector('.chrono-page .ui-ph')?.textContent.includes('Louis'), ID.louis, {timeout: 8000});
        });
        await t('Chronologie : 🚨 l’anomalie du Contrôle (décès avant la naissance) est en rouge', async () => {
            await p.waitForSelector('.chrono-page .is-anomaly .chrono-anomaly', {timeout: 10000});
            assert.match(await p.textContent('.chrono-page .is-anomaly .chrono-anomaly'), /Décès avant la naissance/);
        });
        await pick('#timeline-root-pk', {id: ID.jean, title: 'Jean MAZAUD', kind: 'person'});
        await p.waitForFunction(() => document.querySelector('.chrono-page .ui-ph')?.textContent.includes('Jean'), null, {timeout: 8000}); await sleep(300);
        await t('Chronologie : 🎂 l’âge à chaque événement (Jean, né le 12/03/1850 : 60 ans à son décès)', async () => {
            const ages = await p.$$eval('.chrono-page [data-kind="death"] .chrono-age', xs => xs.map(x => x.textContent));
            assert.ok(ages.some(a => /60 ans/.test(a)), JSON.stringify(ages));
            await p.click('#timeline-ages'); await sleep(200);
            assert.equal(await p.$$eval('.chrono-page .chrono-age', xs => xs.length), 0, 'âges cachés');
            await p.click('#timeline-ages'); await sleep(200);
        });
        await t('Chronologie : un réglage s’applique dès qu’on le change (descendants : Paul apparaît / disparaît)', async () => {
            assert.ok((await p.textContent('#chrono-body')).includes('Paul'));
            await p.selectOption('#timeline-down', '0'); await p.waitForFunction(() => !document.querySelector('#chrono-body')?.textContent.includes('Paul'), null, {timeout: 8000});
            await p.selectOption('#timeline-down', '1'); await p.waitForFunction(() => document.querySelector('#chrono-body')?.textContent.includes('Paul'), null, {timeout: 8000});
        });
        await t('Chronologie : 🧩 filtrer par sorte d’événement (Filtrer ▾ → Décès) et 🔍 chercher dans la frise', async () => {
            await p.click('#timeline-listbar .ui-listbar-fbtn');
            await p.check('.ui-listbar-menu input[data-lb-f="kinds"][value="death"]'); await sleep(300);
            await p.keyboard.press('Escape');
            const kinds = await p.$$eval('#chrono-body [data-event-id][data-kind]', xs => [...new Set(xs.map(x => x.dataset.kind))]);
            assert.deepEqual(kinds, ['death']);
            assert.deepEqual(await p.evaluate(() => window.LCNDA_APP.state.timeline.kinds), ['death'], 'retenu avec les réglages de la frise (clé genealogie-…)');
            assert.match(await p.textContent('.chrono-page .ui-ph-count'), /sur/);
            await p.evaluate(() => document.querySelector('#timeline-listbar .ui-listbar').setFilter('kinds', []));
            await p.fill('#timeline-listbar input', 'Paul'); await sleep(600);
            const names = await p.$$eval('#chrono-body [data-event-id] .table-link', xs => [...new Set(xs.map(x => x.textContent.trim()))]);
            assert.deepEqual(names, ['Paul MAZAUD']);
            await p.fill('#timeline-listbar input', ''); await sleep(600);
        });
        await t('Chronologie : ⋯ et clic droit sur un événement (Ouvrir · … · 🗑 Supprimer avec ↶)', async () => {
            await p.hover('#chrono-body [data-kind="census"] .timeline-card'); await p.click('#chrono-body [data-kind="census"] [data-chrono-more]');
            const a = await menuLabels(); assert.ok(a.some(x => /Ouvrir la fiche/.test(x)), a.join('|')); assert.ok(a.some(x => /Supprimer l’événement/.test(x)));
            await closeMenu();
            await p.click('#chrono-body [data-kind="census"] .timeline-card', {button: 'right'});
            const b = await menuLabels(); assert.deepEqual(b.filter(x => /Ouvrir|Supprimer/.test(x)).length, 2, b.join('|'));
            await p.click('.ui-actmenu button:has-text("Supprimer l’événement")');
            await p.waitForFunction(() => !document.querySelector('#chrono-body [data-kind="census"]'), null, {timeout: 8000});
            await p.click('.toast button:has-text("Annuler"), [class*="toast"] button:has-text("Annuler")');
            await p.waitForSelector('#chrono-body [data-kind="census"]', {timeout: 8000});
        });
        await t('Chronologie : 📏 barres de vie horizontales, zoom ⌘/Ctrl + molette', async () => {
            await p.click('[data-chrono-view="bars"]'); await p.waitForSelector('.chrono-bar-row', {timeout: 5000});
            assert.ok(await p.$$eval('.chrono-bar-row', xs => xs.length) >= 3);
            const z0 = await p.evaluate(() => Number(window.LCNDA_APP.state.timeline.zoom) || 8);
            await p.hover('.chrono-bars-scroll'); await p.keyboard.down('Control'); await p.mouse.wheel(0, -200); await p.keyboard.up('Control'); await sleep(200);
            const z1 = await p.evaluate(() => Number(window.LCNDA_APP.state.timeline.zoom));
            assert.ok(z1 > z0, `${z0} → ${z1}`);
            await p.click('[data-chrono-zoom="-1"]'); await sleep(100);
            await p.click('[data-chrono-view="vertical"]'); await p.waitForSelector('#chrono-body .timeline-row', {timeout: 5000});
        });
        await t('Chronologie : ⤓ Exporter → CSV téléchargé (année, événement, sorte, âge)', async () => {
            await p.click('[data-chrono-export]'); await p.waitForSelector('dialog.ui-export [data-fmt="csv"]', {timeout: 5000});
            await p.click('dialog.ui-export [data-fmt="csv"]');
            const [dl] = await Promise.all([p.waitForEvent('download', {timeout: 8000}), p.click('dialog.ui-export [data-ui-go], dialog.ui-export button.button:not(.secondary):not([data-fmt])')]);
            const file = path.join(tmp, 'chrono.csv'); await dl.saveAs(file);
            const csv = fs.readFileSync(file, 'utf8');
            assert.match(csv, /Année;Date;Événement;Sorte/); assert.match(csv, /60 ans/); assert.match(csv, /Paul MAZAUD/);
            assert.match(dl.suggestedFilename(), /\.csv$/);
        });
        await t('Chronologie : 🖨 Imprimer ouvre la fenêtre d’impression commune', async () => {
            await p.click('[data-chrono-print]'); await p.waitForSelector('dialog.k-print[open]', {timeout: 8000});
            await p.keyboard.press('Escape'); await p.waitForFunction(() => !document.querySelector('dialog.k-print[open]'), null, {timeout: 5000}).catch(async () => { await p.evaluate(() => document.querySelector('dialog.k-print')?.close()); });
        });
        await t('Chronologie : 🏘 chronologie d’un lieu (Tulle : naissances, mariage, décès de plusieurs familles)', async () => {
            await p.click('[data-chrono-source="place"]'); await p.waitForSelector('#timeline-place-pk', {timeout: 5000});
            await pick('#timeline-place-pk', {id: ID.tulle, title: 'Tulle', name: 'Tulle', kind: 'place'});
            await p.waitForFunction(() => document.querySelector('#chrono-body')?.textContent.includes('Paul') && document.querySelector('.chrono-page .ui-ph h2'), null, {timeout: 10000});
            const txt = await p.textContent('#chrono-body');
            assert.ok(/Jean MAZAUD/.test(txt) && /Paul MAZAUD/.test(txt) && /&/.test(txt), txt.slice(0, 300));
            const names = await p.$$eval('#chrono-body .table-link', xs => xs.map(x => x.textContent.trim()));
            assert.ok(!names.includes('Marie LACOMBE'), 'Marie est née et morte à Brive : seulement le mariage à Tulle');
            assert.match(await p.textContent('.chrono-page .ui-ph'), /Tulle/);
            await p.click('[data-chrono-source="person"]'); await p.waitForSelector('#timeline-root-pk', {timeout: 5000}); await sleep(400);
        });
        await t('Chronologie : 💾 vue enregistrée (⋯ → Enregistrer la vue, puis l’afficher dans la colonne)', async () => {
            await p.click('.chrono-page .ui-ph-more > summary'); await p.waitForSelector('.ui-actmenu button:has-text("Enregistrer la vue")');
            await p.click('.ui-actmenu button:has-text("Enregistrer la vue")'); await p.waitForSelector('#view-dialog[open]', {timeout: 5000});
            await p.fill('#view-form [name="name"]', 'Jean en barres');
            await p.evaluate(() => { const f = document.querySelector('#view-form'); const c = JSON.parse(f.elements.config.value); c.view = 'bars'; f.elements.config.value = JSON.stringify(c); });
            await p.click('#view-form button[type="submit"], #view-form .button:not(.secondary)');
            await p.waitForSelector('[data-chrono-open-view]', {timeout: 8000});
            await p.click('[data-chrono-open-view]'); await p.waitForSelector('.chrono-bar-row', {timeout: 8000});
            assert.equal(await p.evaluate(() => window.LCNDA_APP.state.timeline.view), 'bars');
            await p.click('[data-chrono-view-more]'); assert.ok((await menuLabels()).some(x => /Supprimer/.test(x)));
            await p.click('.ui-actmenu button:has-text("Supprimer")'); await p.waitForFunction(() => !document.querySelector('[data-chrono-open-view]'), null, {timeout: 8000});
            await p.click('[class*="toast"] button:has-text("Annuler")'); await p.waitForSelector('[data-chrono-open-view]', {timeout: 8000});
            await p.click('[data-chrono-view="vertical"]'); await sleep(300);
        });
        await t('Chronologie : mode consultation : rien à modifier (frise historique, 🗑, 💾)', async () => {
            await p.evaluate(() => { document.body.classList.add('is-kiosk'); window.LCNDA_APP.renderSidebar(); window.LCNDA_PARTS.renderTimeline(); });
            await sleep(800);
            assert.equal(await p.$('#edit-historical-timeline'), null); assert.equal(await p.$('[data-chrono-save-view]'), null);
            await p.click('#chrono-body [data-kind="death"] .timeline-card', {button: 'right'});
            assert.ok(!(await menuLabels()).some(x => /Supprimer/.test(x))); await closeMenu();
            await p.evaluate(() => { document.body.classList.remove('is-kiosk'); window.LCNDA_APP.renderSidebar(); });
        });
        await t('Chronologie : à 390 px, la frise ne dépasse pas de la page', async () => {
            await p.setViewportSize({width: 390, height: 800}); await p.evaluate(() => window.LCNDA_PARTS.renderTimeline()); await sleep(800);
            const o = await p.evaluate(() => { const pg = document.querySelector('.chrono-page'); return [pg.scrollWidth, pg.clientWidth]; });
            assert.ok(o[0] <= o[1] + 2, JSON.stringify(o));
            await p.setViewportSize({width: 1440, height: 900});
        });

        /* ═════════════ ⚖️ Comparaison ═════════════ */
        const goCmp = async () => { await p.evaluate(([a, b]) => { const A = window.LCNDA_APP; A.state.comparisonMode = 'personnes'; A.state.comparison = {left: a, right: b, leftName: 'Jean MAZAUD', rightName: 'Jean MAZAUD', query: '', extra: []}; A.setModule('comparaison'); }, [ID.jean, ID.jean2]); await p.waitForSelector('.cmp-page .comparison-table', {timeout: 15000}); };
        await goCmp();
        await t('Comparaison : en-tête commun (plus de « MODE COMPARAISON »), ⤓ Exporter, 🖨 Imprimer, 🔀 Fusionner', async () => {
            assert.ok(await p.$('.cmp-page .ui-ph [data-cmp-export]')); assert.ok(await p.$('.cmp-page .ui-ph [data-cmp-print]')); assert.ok(await p.$('.cmp-page .ui-ph [data-cmp-merge-open]'));
            assert.ok(!/MODE COMPARAISON/.test(await p.textContent('.cmp-page .ui-ph')));
        });
        await t('Comparaison : 🧮 note de ressemblance (deux Jean MAZAUD de Tulle, nés à un an d’écart)', async () => {
            const n = Number(await p.getAttribute('.cmp-score', 'data-cmp-score'));
            assert.ok(n >= 75 && n < 100, String(n)); assert.match(await p.textContent('.cmp-score'), /Ressemblance \d+ %/);
            const s = await p.evaluate(([a, b]) => Promise.all([window.LCNDA_APP.api('comparison', {a, b})]).then(([d]) => window.LCNDA_EXT.comparaison.similarity(d.left, d.right)), [ID.jean, ID.marie]);
            assert.ok(s.pct < 45 && s.genderClash, JSON.stringify(s));
        });
        await t('Comparaison : ↔ naissance en face de naissance, décès en face de décès (pas l’ordre de la liste)', async () => {
            const birth = await p.$$eval('.comparison-table tr[data-cmp-key="BIRT"] td', tds => tds.map(td => td.textContent));
            assert.equal(birth.length, 2); assert.ok(/1850/.test(birth[0]) && /1851/.test(birth[1]), birth.join('|'));
            const death = await p.$$eval('.comparison-table tr[data-cmp-key="DEAT"] td', tds => tds.map(td => td.textContent));
            assert.ok(/1910/.test(death[0]) && /1910/.test(death[1]));
            assert.ok(await p.$('.comparison-table tr[data-cmp-key="BIRT"].is-diff')); assert.ok(await p.$('.comparison-table tr[data-cmp-key="DEAT"].is-same'));
        });
        await t('Comparaison : ⇄ inverser A et B', async () => {
            await p.click('[data-cmp-swap-head]'); await p.waitForFunction(id => window.LCNDA_APP.state.comparison.left === id, ID.jean2, {timeout: 5000});
            await p.waitForSelector('.cmp-page .comparison-table'); await p.click('[data-cmp-swap-head]');
            await p.waitForFunction(id => window.LCNDA_APP.state.comparison.left === id, ID.jean, {timeout: 5000}); await p.waitForSelector('.cmp-page .comparison-table');
        });
        await t('Comparaison : 👥 une fiche C en plus (colonnes A, B, C)', async () => {
            await p.click('[data-cmp-add]'); await p.waitForSelector('[data-compare-pk="x0"]');
            await pick('[data-compare-pk="x0"]', {id: ID.paul, title: 'Paul MAZAUD', kind: 'person'});
            await p.waitForFunction(() => document.querySelectorAll('.comparison-table thead th').length === 4, null, {timeout: 8000});
            assert.match(await p.textContent('.comparison-grid'), /Ressemblance avec A/);
            await p.click('[data-cmp-rm-extra="0"]'); await p.waitForFunction(() => document.querySelectorAll('.comparison-table thead th').length === 3, null, {timeout: 8000});
        });
        await t('Comparaison : ⤓ CSV (lignes alignées et ressemblance)', async () => {
            const csv = await p.evaluate(() => window.LCNDA_EXT.comparaison.csvText());
            assert.match(csv, /Ressemblance A–B;\d+ %/); assert.match(csv, /Naissance;12\/03\/1850/);
        });
        await t('Comparaison : 💾 vue enregistrée, affichée depuis la colonne', async () => {
            await post('save_view', {module: 'comparison', name: 'Les deux Jean', config: {mode: 'personnes', left: ID.jean, right: ID.jean2, leftName: 'Jean MAZAUD', rightName: 'Jean MAZAUD', extra: []}});
            await p.evaluate(async () => { await window.LCNDA_APP.reloadBootstrap(); window.LCNDA_APP.state.comparison.right = 0; window.LCNDA_APP.renderSidebar(); });
            await p.click('[data-cmp-open-view]'); await p.waitForFunction(id => window.LCNDA_APP.state.comparison.right === id, ID.jean2, {timeout: 5000});
            await p.waitForSelector('.cmp-page .comparison-table');
        });
        await t('Comparaison : mode consultation : pas de 🔀 Fusionner ni de 💾', async () => {
            await p.evaluate(() => { document.body.classList.add('is-kiosk'); window.LCNDA_PARTS.renderComparison(); }); await sleep(600);
            assert.equal(await p.$('[data-cmp-merge-open]'), null); assert.equal(await p.$('[data-cmp-save-view]'), null);
            await p.evaluate(() => { document.body.classList.remove('is-kiosk'); window.LCNDA_PARTS.renderComparison(); }); await p.waitForSelector('[data-cmp-merge-open]', {timeout: 5000});
        });
        await t('Comparaison : à 390 px, rien ne dépasse', async () => {
            await p.setViewportSize({width: 390, height: 800}); await sleep(400);
            const o = await p.evaluate(() => { const pg = document.querySelector('.cmp-page'); return [pg.scrollWidth, pg.clientWidth]; });
            assert.ok(o[0] <= o[1] + 2, JSON.stringify(o));
            await p.setViewportSize({width: 1440, height: 900}); await sleep(200);
        });
        await t('Comparaison : 🔀 fusionner depuis la comparaison (naissance de B, décès en double retiré, ↶ le remet)', async () => {
            await p.click('[data-cmp-merge-open]'); await p.waitForSelector('#cmp-merge');
            const birthRow = await p.$('#cmp-merge tr[data-merge-event]:has(th:text-is("Naissance"))');
            await (await birthRow.$('input[value="b"]')).check();
            const deathRow = await p.$('#cmp-merge tr[data-merge-event]:has(th:text-is("Décès"))');
            assert.equal(await (await deathRow.$('input[value="a"]')).isChecked(), true, 'deux décès pareils : on garde celui de A');
            await p.click('[data-cmp-merge-run]'); await p.waitForSelector('dialog.confirm-box-dialog[open]');
            assert.match(await p.textContent('dialog.confirm-box-dialog'), /ne peut pas être annulée/);
            await p.click('dialog.confirm-box-dialog [data-cb-ok]');
            await p.waitForFunction(() => window.LCNDA_APP.state.comparison.right === 0, null, {timeout: 10000});
            const d = await api('comparison', {a: ID.jean, b: ID.jean2});
            assert.equal(d.right, null, 'la fiche B a disparu');
            const tags = d.left.events.map(e => `${e.gedcom_tag}:${e.date_text}`).sort();
            assert.deepEqual(tags, ['BIRT:1851', 'DEAT:1910', 'MARR:1875', 'OCCU:1880'], tags.join(','));
            await p.click('[class*="toast"] button:has-text("Annuler")'); await sleep(800);
            const d2 = await api('comparison', {a: ID.jean, b: 0});
            assert.equal(d2.left.events.filter(e => e.gedcom_tag === 'DEAT').length + d2.left.events.filter(e => e.gedcom_tag === 'BIRT').length, 4, '↶ remet les événements retirés');
        });
        await t('Comparaison : 📜 comparer avec un acte transcrit (noms surlignés, concordance)', async () => {
            await p.evaluate(([id, act]) => { const A = window.LCNDA_APP; A.state.comparison = {left: id, right: 0, leftName: 'Jean MAZAUD', rightName: '', query: '', extra: []}; A.state.actCompare = {id: act}; A.state.comparisonMode = 'acte'; A.renderSidebar(); A.setModule('comparaison'); }, [ID.jean, ID.act]);
            await p.waitForSelector('[data-cmp-act-score]', {timeout: 10000});
            assert.ok(Number(await p.getAttribute('[data-cmp-act-score]', 'data-cmp-act-score')) >= 60);
            const marks = await p.$$eval('.cmp-act-text mark', xs => xs.map(x => x.textContent));
            assert.ok(marks.includes('MAZAUD') && marks.includes('Jean') && marks.includes('Tulle'), marks.join(','));
            await p.waitForFunction(() => document.querySelectorAll('#cmp-act-select option').length >= 2, null, {timeout: 5000});
        });
        await t('Comparaison : 🖼 deux images : rideau et différence', async () => {
            await p.evaluate(([a, b]) => { const A = window.LCNDA_APP; A.state.comparisonMode = 'images'; A.state.imageCompare = {left: {id: a, title: 'Signature A', filename: 'sig-a.png', media_type: 'image', people_links: []}, right: {id: b, title: 'Signature B', filename: 'sig-b.png', media_type: 'image', people_links: []}}; A.renderSidebar(); A.setModule('comparaison'); }, [ID.ma, ID.mb]);
            await p.waitForSelector('.cmp-overlay', {timeout: 10000});
            await p.click('[data-overlay-set="diff"]'); await p.waitForSelector('.cmp-overlay.is-diff');
            assert.equal(await p.$eval('.cmp-overlay .signature-overlay-top', i => getComputedStyle(i).mixBlendMode), 'difference');
            await p.click('[data-overlay-set="curtain"]'); await p.waitForSelector('.cmp-overlay.is-curtain');
            await p.fill('#signature-overlay-opacity', '30').catch(() => {});
            await p.$eval('#signature-overlay-opacity', i => { i.value = '30'; i.dispatchEvent(new Event('input')); });
            assert.match(await p.$eval('.cmp-overlay .signature-overlay-top', i => i.style.clipPath), /30%/);
            assert.ok(await p.$('.cmp-page .ui-ph [data-cmp-swap-head]'));
        });
        await t('aucune erreur de page', () => assert.deepEqual(errs, []));
    } finally {
        await browser.close(); proc.kill();
        try { fs.rmSync(tmp, {recursive: true, force: true}); } catch (_) {}
    }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})();
