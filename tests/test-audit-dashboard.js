#!/usr/bin/env node
/* Audit des onglets — 🏠 Tableau de bord (§1), ✨ Trésors (§16) et ⏱ Temps de recherche (manque transversal) :
 *  assets/js/app-tableau-de-bord.js, assets/js/app-chrono-recherche.js (nouveau), assets/js/heritage-widgets.js,
 *  assets/js/heritage-tresors*.js, lib/tableau_de_bord_plus.php (nouveau), lib/tresors.php, assets/css/audit-dashboard.css (nouveau).
 *  Tableau de bord : en-tête commun (🖨 Imprimer, ⤓ Exporter ▾), 📈 croissance, 🎯 objectifs, 🔎 filtre de page, ⏱ temps de recherche,
 *  🧭 prochaine action remplie sur place, 🔄 « depuis 30 jours », 📌 bloc de fiche épinglé, page supprimée avec ↶ Annuler, ⋯ et clic droit,
 *  raccourcis (] [, ⌘⇧N, ⌘P), mode consultation, 390 px.
 *  Trésors : 🔍 chercher, ⭐ favoris, 🕘 récents, ⋯ et clic droit, 📅 Ce jour-là, 🎞 Une vie, 📮 Questionnaire aux anciens,
 *  suppressions avec ↶ Annuler (lettre, souvenir), consultation.
 *   node tests/test-audit-dashboard.js */
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
// les fichiers nouveaux : posés dans la page s'ils n'y sont pas encore (index.php les recevra)
const NEW_JS = ['assets/js/app-chrono-recherche.js'], NEW_CSS = ['assets/css/audit-dashboard.css'];

(async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-dash-'));
    fs.mkdirSync(path.join(tmp, 'media'));
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4'};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$tag = function ($t) use ($pdo) { $s = $pdo->prepare('SELECT id FROM event_types WHERE gedcom_tag=? ORDER BY id LIMIT 1'); $s->execute([$t]); return (int) $s->fetchColumn(); };
$pdo->prepare('INSERT INTO places(name, county, country, latitude, longitude) VALUES(?,?,?,?,?)')->execute(['Tulle', 'Corrèze', 'France', 45.27, 1.77]); $tulle = (int) $pdo->lastInsertId();
$pdo->prepare('INSERT INTO places(name, county, country, latitude, longitude) VALUES(?,?,?,?,?)')->execute(['Brive', 'Corrèze', 'France', 45.16, 1.53]); $brive = (int) $pdo->lastInsertId();
$md = date('m-d');
$per = function ($f, $l, $g, $evs, $start = 0) use ($pdo, $tag) { $pdo->prepare("INSERT INTO persons(first_name,last_name,gender,living_status,is_start) VALUES(?,?,?,'deceased',?)")->execute([$f, $l, $g, $start]); $id = (int) $pdo->lastInsertId();
    foreach ($evs as [$t, $d, $p]) { $pdo->prepare("INSERT INTO events(scope, person_id, event_type_id, year, date_text, sort_date, place_id) VALUES('person',?,?,?,?,?,?)")->execute([$id, $tag($t), (int) substr($d, 0, 4), $d, $d, $p]); } return $id; };
$ids = [
  'pierre' => $per('Pierre', 'MAZAUD', 'male', [['BIRT', '1950-' . $md, $tulle], ['RESI', '1975-03-02', $brive]], 1),
  'jean' => $per('Jean', 'MAZAUD', 'male', [['BIRT', '1920-02-11', $tulle], ['DEAT', '1990-07-04', $brive]]),
  'marie' => $per('Marie', 'LACOMBE', 'female', [['BIRT', '1922-' . $md, $brive]]),
  'paul' => $per('Paul', 'DURAND', 'male', []),
];
$pdo->prepare('INSERT INTO families(partner1_id, partner2_id) VALUES(?,?)')->execute([$ids['jean'], $ids['marie']]); $fam = (int) $pdo->lastInsertId();
$pdo->prepare('INSERT INTO family_children(family_id, child_id) VALUES(?,?)')->execute([$fam, $ids['pierre']]);
$pdo->prepare("INSERT INTO labels(name) VALUES('Corrèze')")->execute(); $lab = (int) $pdo->lastInsertId();
$pdo->prepare("INSERT INTO label_links(label_id, entity_type, entity_id) VALUES(?, 'person', ?)")->execute([$lab, $ids['paul']]);
// le journal : 3 fiches il y a deux mois, 2 ce mois-ci, une source il y a 10 jours
foreach ([['-2 months', 'person', 3], ['now', 'person', 2], ['-10 days', 'source', 1]] as [$when, $kind, $n]) { for ($i = 0; $i < $n; $i++) {
    $pdo->prepare("INSERT INTO change_log(entity_type, entity_id, action, summary, created_at) VALUES(?, ?, 'create', 'test', ?)")->execute([$kind, 900 + $i + ($kind === 'source' ? 50 : 0) + ($when === 'now' ? 10 : 0), date('Y-m-d H:i:s', strtotime($when))]); } }
echo json_encode($ids + ['fam' => $fam, 'label' => $lab, 'md' => $md]);`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0 || !/pierre/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const ID = JSON.parse(seed.stdout.trim().split('\n').pop());
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const errs = [];
    try {
        const ctx = await browser.newContext({viewport: {width: 1440, height: 900}, acceptDownloads: true});
        await ctx.route(u => u.pathname === '/' || u.pathname === '/index.php', async route => {
            const r = await route.fetch(); let html = await r.text();
            const css = NEW_CSS.filter(f => !html.includes(f)).map(f => `<link rel="stylesheet" href="${f}">`).join('');
            const js = NEW_JS.filter(f => !html.includes(f)).map(f => `<script src="${f}" defer></script>`).join('');
            html = html.replace('</head>', css + '</head>').replace(/(<script src="assets\/js\/app-tableau-de-bord\.js[^"]*" defer><\/script>)/, `$1${js}`);
            await route.fulfill({response: r, body: html, headers: {...r.headers(), 'content-type': 'text/html; charset=utf-8'}});
        });
        const p = await ctx.newPage();
        p.on('pageerror', e => errs.push(e.message));
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_EXT?.researchClock && window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.tresors, null, {timeout: 30000});
        const api = (x, q = {}) => p.evaluate(([y, z]) => window.LCNDA_APP.api(y, z).catch(e => ({error: e.message})), [x, q]);
        const post = (a, b) => p.evaluate(async ([x, y]) => { try { const r = await window.LCNDA_APP.api(x, {}, {method: 'POST', body: y}); return r.result || r; } catch (e) { return {error: e.message}; } }, [a, b]);
        const undoLast = re => p.evaluate(src => { const t = [...document.querySelectorAll('.ui-toast')].reverse().find(x => new RegExp(src).test(x.textContent)); const b = t && [...t.querySelectorAll('button')].find(x => /Annuler/.test(x.textContent)); if (b) b.click(); return !!b; }, re.source);
        const setWidgets = types => p.evaluate(async ts => { const A = window.LCNDA_APP; A.state.dashboardPage = ''; const s = A.dashboardBlockSettings(); s.widgets = ts.map(x => A.dashboardNewWidget(x)); A.saveDashboardBlockSettings(s); await A.setModule('dashboard'); await A.renderDashboard(); }, types);

        await t('serveur : croissance, période, objectifs, filtre, prochaine action', async () => {
            const g = await api('tresors', {dash: 'growth', months: 6});
            assert.strictEqual(g.months.length, 6); assert.strictEqual(g.months[5].persons, 2, 'ce mois-ci'); assert.strictEqual(g.months[3].persons, 3, 'il y a deux mois');
            assert.strictEqual(g.totals.persons, 4);
            const pr = await api('tresors', {dash: 'period', days: 30}); assert.strictEqual(pr.persons, 2); assert.strictEqual(pr.sources, 1);
            const go = await api('tresors', {dash: 'goals'}); assert.strictEqual(go.values.persons, 4); assert.strictEqual(go.values.generations, 2, 'Pierre et ses deux parents');
            const f = await api('tresors', {dash: 'filter', kind: 'branch', value: 'MAZAUD'}); assert.deepStrictEqual(f.ids.sort((a, b) => a - b), [ID.pierre, ID.jean].sort((a, b) => a - b)); assert.strictEqual(f.stats.persons, 2);
            const fp = await api('tresors', {dash: 'filter', kind: 'person', value: String(ID.pierre)}); assert.strictEqual(fp.ids.length, 3, 'de cujus : lui et ses parents');
            const fl = await api('tresors', {dash: 'filter', kind: 'label', value: String(ID.label)}); assert.deepStrictEqual(fl.ids, [ID.paul]);
            const n = await api('tresors', {dash: 'next'}); assert.strictEqual(n.item.kind, 'marriage'); assert.strictEqual(n.item.family_id, ID.fam);
            const n2 = await api('tresors', {dash: 'next', skip: 'f' + ID.fam}); assert.strictEqual(n2.item.kind, 'birth'); assert.strictEqual(n2.item.person_id, ID.paul);
        });

        await t('en-tête commun : 🖨 Imprimer (fenêtre d’impression) et ⤓ Exporter ▾ (PDF, page web, CSV)', async () => {
            await setWidgets(['stats', 'research_progress']);
            await p.waitForSelector('.dashboard-page .page-header.ui-ph [data-dash-print]');
            assert.match(await p.textContent('.dashboard-page .page-header h2'), /Vue d’ensemble/);
            await p.click('[data-dash-print]'); await p.waitForSelector('dialog.k-print[open]', {timeout: 10000});
            await p.keyboard.press('Escape'); await sleep(300);
            await p.click('[data-dash-export]'); await p.waitForSelector('.ui-actmenu');
            const labels = await p.$$eval('.ui-actmenu .ui-actmenu-i b', l => l.map(x => x.textContent));
            assert.deepStrictEqual(labels, ['PDF (bilan imprimable)', 'Page web (.html)', 'Tableau des chiffres (.csv)']);
            const [dl] = await Promise.all([p.waitForEvent('download'), p.click('.ui-actmenu .ui-actmenu-i:has-text("csv")')]);
            assert.match(dl.suggestedFilename(), /\.csv$/);
            const csv = fs.readFileSync(await dl.path(), 'utf8'); assert.match(csv, /Chiffres clés.*Personnes.*4/);
        });

        await t('🔄 « Depuis 30 jours » sur Chiffres clés et Bilan ; la période choisie est retenue', async () => {
            const line = await p.textContent('[data-widget-type="stats"] [data-dash-period-line]');
            assert.match(line, /\+2 fiches/); assert.match(line, /\+1 source/);
            await p.selectOption('[data-widget-type="stats"] [data-dash-period]', '90');
            await p.waitForFunction(() => /\+5 fiches/.test(document.querySelector('[data-widget-type="stats"] [data-dash-period-line]')?.textContent || ''), null, {timeout: 8000});
            assert.strictEqual(await p.evaluate(() => localStorage.getItem('genealogie-dash-period')), '90');
            assert.ok(await p.$('[data-widget-type="research_progress"] [data-dash-period-line]'), 'aussi sur le Bilan');
        });

        await t('📈 Croissance, 🎯 Objectifs (barre, état « À faire / En cours / Terminé »), ⏱ Temps de recherche', async () => {
            await setWidgets(['db_growth', 'long_goals', 'research_time']);
            await p.waitForSelector('[data-widget-type="db_growth"] svg.dg-chart polyline');
            assert.strictEqual(await p.$$eval('[data-widget-type="db_growth"] polyline', l => l.length), 4);
            assert.match(await p.textContent('[data-widget-type="db_growth"] .dg-legend'), /Fiches 4/);
            // un objectif : 4 fiches → terminé ; 2 générations sur 8 → en cours
            await p.fill('[data-lg-add] [name=target]', '4'); await p.selectOption('[data-lg-add] [name=kind]', 'persons'); await p.click('[data-lg-add] [type=submit]');
            await p.waitForSelector('[data-lg-row="0"]');
            assert.match(await p.textContent('[data-lg-row="0"]'), /Terminé/); assert.strictEqual(await p.getAttribute('[data-lg-row="0"] .lg-bar', 'aria-valuenow'), '100');
            await p.fill('[data-lg-add] [name=target]', '8'); await p.selectOption('[data-lg-add] [name=kind]', 'generations'); await p.fill('[data-lg-add] [name=due]', '2026-12-31'); await p.click('[data-lg-add] [type=submit]');
            await p.waitForSelector('[data-lg-row="1"]'); assert.match(await p.textContent('[data-lg-row="1"]'), /2 sur 8 générations complètes/); assert.match(await p.textContent('[data-lg-row="1"]'), /En cours/);
            // ⋯ → pause, puis suppression avec ↶ Annuler
            await p.click('[data-lg-more="1"]'); await p.click('.ui-actmenu .ui-actmenu-i:has-text("Mettre en pause")'); await p.waitForFunction(() => /En pause/.test(document.querySelector('[data-lg-row="1"]')?.textContent || ''));
            await p.click('[data-lg-more="1"]'); await p.click('.ui-actmenu .ui-actmenu-i:has-text("Supprimer")'); await p.waitForFunction(() => !document.querySelector('[data-lg-row="1"]'));
            assert.ok(await undoLast(/Objectif supprimé/)); await p.waitForSelector('[data-lg-row="1"]', {timeout: 8000});
            // ⏱ démarrer, arrêter : le temps est rangé par jour et par sujet
            await p.fill('[data-rcl-scope]', 'Branche MAZAUD'); await p.click('[data-rcl-do="start"]');
            assert.strictEqual(await p.evaluate(() => window.LCNDA_EXT.researchClock.running().scope), 'Branche MAZAUD');
            await p.evaluate(() => { const v = JSON.parse(localStorage.getItem('genealogie-research-clock')); v.run.start -= 125000; localStorage.setItem('genealogie-research-clock', JSON.stringify(v)); });
            await p.click('[data-rcl-do="stop"]');
            const tot = await p.evaluate(() => [window.LCNDA_EXT.researchClock.total('Branche MAZAUD'), window.LCNDA_EXT.researchClock.today(), window.LCNDA_EXT.researchClock.running()]);
            assert.ok(tot[0] >= 125 && tot[0] < 140, String(tot[0])); assert.ok(tot[1] >= 125); assert.strictEqual(tot[2], null);
            assert.match(await p.textContent('[data-rcl-host] .rcl-list'), /Branche MAZAUD/);
            // les chronomètres des Successions et de l'Atelier sont lus (sans y toucher)
            const others = await p.evaluate(() => { const now = Date.now(); localStorage.setItem('lcnda-succ-chrono', JSON.stringify({title: 'Succession DURAND', number: 'S-1', start: 0, segs: [{from: now - 600000, to: now - 300000}]})); localStorage.setItem('genealogie-atelier-timers', JSON.stringify({w1: {kind: 'chrono', total: 120000, today: 60000, day: new Date(now).toISOString().slice(0, 10).replace(/^(.*)$/, () => { const d = new Date(now); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }), start: 0}})); return window.LCNDA_EXT.researchClock.others(); });
            assert.deepStrictEqual(others.map(o => [o.key, o.total]), [['succ', 300], ['atelier', 120]]);
        });

        await t('🧭 Prochaine action : la date de mariage remplie dans le widget (↶ Annuler), « Passer › »', async () => {
            await setWidgets(['next_action']);
            await p.waitForSelector('[data-na-form][data-kind="marriage"]');
            assert.match(await p.textContent('[data-widget-type="next_action"]'), /Jean MAZAUD et Marie LACOMBE/);
            await p.fill('[data-na-form] [name=date_text]', '12/05/1948'); await p.fill('[data-na-form] [name=place_name]', 'Tulle'); await p.click('[data-na-form] [type=submit]');
            await p.waitForSelector('[data-na-form][data-kind="birth"]', {timeout: 10000});
            const fam = async () => (await api('tresors', {dash: 'next'})).item;
            assert.strictEqual((await fam()).kind, 'birth', 'le mariage est noté');
            assert.ok(await undoLast(/Mariage ajouté/)); await p.waitForSelector('[data-na-form][data-kind="marriage"]', {timeout: 10000});
            assert.strictEqual((await fam()).kind, 'marriage', '↶ Annuler retire le mariage');
            await p.click('[data-na-skip]'); await p.waitForSelector('[data-na-form][data-kind="birth"]', {timeout: 10000});
            assert.match(await p.evaluate(() => localStorage.getItem('genealogie-dash-next-skip')), /"f\d+"/);
            await p.evaluate(() => localStorage.removeItem('genealogie-dash-next-skip'));
        });

        await t('🔎 Filtre de la page (branche) : chiffres clés et listes ne montrent que la branche ; ✕ Tout montrer', async () => {
            await setWidgets(['stats', 'favorites']);
            await p.click('.dashboard-page .ui-ph-more summary'); await p.click('.ui-actmenu .ui-actmenu-i:has-text("Filtrer cette page")');
            await p.waitForSelector('dialog.dash-filter-dialog[open] select[name=branch] option[value="MAZAUD"]', {state: 'attached'});
            await p.selectOption('dialog.dash-filter-dialog select[name=branch]', 'MAZAUD'); await p.click('dialog.dash-filter-dialog [data-dash-filter-ok]');
            await p.waitForSelector('[data-dash-filterbar]');
            assert.match(await p.textContent('[data-dash-filterbar]'), /Branche : MAZAUD/);
            assert.match(await p.textContent('[data-widget-type="stats"] .dashboard-metrics > div:first-child'), /^2/);
            const page = await p.evaluate(() => window.LCNDA_APP.currentDashboardPage().filter);
            assert.deepStrictEqual([page.kind, page.value], ['branch', 'MAZAUD']);
            await p.click('[data-dash-filter-clear]'); await p.waitForFunction(() => !document.querySelector('[data-dash-filterbar]'));
            assert.match(await p.textContent('[data-widget-type="stats"] .dashboard-metrics > div:first-child'), /^4/);
        });

        await t('⋯ et clic droit d’un widget : Régler · Dupliquer · Copier · Exporter · Supprimer (mêmes entrées)', async () => {
            await setWidgets(['stats']);
            await p.click('[data-widget-type="stats"] [data-dash-more]'); await p.waitForSelector('.ui-actmenu');
            const a = await p.$$eval('.ui-actmenu .ui-actmenu-i b', l => l.map(x => x.textContent));
            assert.deepStrictEqual(a, ['Régler', 'Dupliquer', 'Exporter ce widget (PDF)', 'Supprimer']);
            await p.click('.ui-actmenu .ui-actmenu-i:has-text("Dupliquer")');
            await p.waitForFunction(() => document.querySelectorAll('[data-widget-type="stats"]').length === 2);
            await p.keyboard.press('Escape');
            await p.click('[data-widget-type="stats"] .card-head h3', {button: 'right'}); await p.waitForSelector('.ui-actmenu');
            assert.deepStrictEqual(await p.$$eval('.ui-actmenu .ui-actmenu-i b', l => l.map(x => x.textContent)), a);
            await p.keyboard.press('Escape');
        });

        await t('pages : supprimer une page tout de suite, ↶ Annuler la remet ; « ] » page suivante', async () => {
            await p.evaluate(async () => { const A = window.LCNDA_APP; A.saveDashboardPages([{id: 'pg_aa', name: 'Ma page A', widgets: [A.dashboardNewWidget('stats')]}, {id: 'pg_bb', name: 'Ma page B', widgets: [A.dashboardNewWidget('favorites')]}], 'pg_aa'); A.state.dashboardPage = 'pg_aa'; await A.renderDashboard(); });
            await p.waitForSelector('.dash-pages [data-dash-page="pg_bb"]');
            await p.keyboard.press(']'); await p.waitForFunction(() => document.querySelector('.dash-pages [data-dash-page="pg_bb"]')?.classList.contains('is-active'));
            await p.keyboard.press('['); await p.waitForFunction(() => document.querySelector('.dash-pages [data-dash-page="pg_aa"]')?.classList.contains('is-active'));
            await p.click('.dashboard-page .ui-ph-more summary'); await p.click('.ui-actmenu .ui-actmenu-i:has-text("Réordonner les widgets")');
            await p.waitForSelector('dialog.dashboard-reorder-dialog [data-page-row="pg_bb"] [data-page-del]');
            await p.click('dialog.dashboard-reorder-dialog [data-page-row="pg_bb"] [data-page-del]');
            assert.ok(!(await p.$('dialog.dashboard-reorder-dialog [data-page-row="pg_bb"]')), 'partie tout de suite, sans question');
            assert.ok(!(await p.$('dialog.ui-confirm[open], dialog.confirm-dialog[open]')));
            assert.ok(await undoLast(/Ma page B/)); await p.waitForSelector('dialog.dashboard-reorder-dialog [data-page-row="pg_bb"]');
            await p.click('dialog.dashboard-reorder-dialog [data-page-row="pg_bb"] [data-page-del]'); await p.click('dialog.dashboard-reorder-dialog [data-save]');
            await p.waitForFunction(() => !document.querySelector('.dash-pages'));
            assert.ok(await undoLast(/Ma page B/)); await p.waitForSelector('.dash-pages [data-dash-page="pg_bb"]', {timeout: 8000});
            assert.deepStrictEqual(await p.evaluate(() => window.LCNDA_APP.dashboardPages().pages.map(x => x.name)), ['Ma page A', 'Ma page B'], 'remise après Enregistrer aussi');
            const sc = await p.evaluate(() => Object.keys(window.LCNDA_EXT.tabShortcuts.dashboard)); assert.deepStrictEqual(sc.sort(), ['export', 'new', 'print']);
            assert.ok(await p.$('[data-dash-print][data-shortcut="Mod+P"]'));
        });

        await t('📌 un bloc de fiche mis dans le tableau de bord depuis son ⋯ ; le widget le dessine', async () => {
            await p.evaluate(async id => { const A = window.LCNDA_APP; A.state.currentPersonId = id; await A.setModule('personnes'); }, ID.jean);
            await p.waitForSelector('#workspace [data-pblock="events"] [data-pin-block]', {timeout: 20000});
            await p.click('#workspace [data-pblock="events"] [data-pin-block]'); await p.waitForSelector('.ui-actmenu');
            await p.click('.ui-actmenu .ui-actmenu-i:has-text("Mettre dans le tableau de bord")');
            const w = await p.evaluate(() => { const A = window.LCNDA_APP; A.state.dashboardPage = 'pg_aa'; return A.dashboardSpaceDo('', () => A.dashboardBlockSettings().widgets.filter(x => x.type === 'person_block').map(x => x.config)); });
            assert.deepStrictEqual(w.map(c => [c.personBlockKey, c.personId, c.personMode]), [['events', ID.jean, 'specific']]);
            await p.evaluate(async () => { await window.LCNDA_APP.setModule('dashboard'); });
            await p.waitForSelector('[data-widget-type="person_block"]'); assert.match(await p.textContent('[data-widget-type="person_block"]'), /Jean MAZAUD/);
        });

        await t('mode consultation : ni ✎ ni × ni ⋯ ni « + », ni filtre', async () => {
            await p.evaluate(async () => { document.body.classList.add('is-kiosk'); await window.LCNDA_APP.renderDashboard(); window.LCNDA_APP.renderSidebar?.(); });
            await p.waitForSelector('.dashboard-widget'); await sleep(300);
            assert.strictEqual(await p.$$eval('.dashboard-widget-tools, [data-dash-more], [data-add-dashboard-widget], [data-dash-filter]', l => l.length), 0);
            assert.ok(await p.$('[data-dash-print]'), 'imprimer reste');
            await p.evaluate(async () => { document.body.classList.remove('is-kiosk'); await window.LCNDA_APP.renderDashboard(); });
        });

        await t('390 px : rien ne déborde (tableau de bord)', async () => {
            await setWidgets(['stats', 'db_growth', 'long_goals', 'next_action', 'research_time']);
            await p.setViewportSize({width: 390, height: 800}); await sleep(600);
            const over = await p.evaluate(() => { const ws = document.querySelector('#workspace'); return [ws.scrollWidth - ws.clientWidth, document.documentElement.scrollWidth - 390]; });
            assert.ok(over[0] <= 2 && over[1] <= 2, JSON.stringify(over));
            await p.setViewportSize({width: 1440, height: 900});
        });

        /* ═════════ ✨ Trésors ═════════ */
        await p.evaluate(() => { localStorage.setItem('genealogie-menu-tresors', '1'); window.LCNDA_APP.applyMenuOrder(); });
        await t('Trésors : 🔍 chercher un trésor, ⭐ favoris, 🕘 récents, ⋯ et clic droit', async () => {
            await p.evaluate(() => window.LCNDA_APP.setModule('tresors')); await p.waitForSelector('[data-tr-hub] [data-tr-search]');
            await p.fill('[data-tr-search]', 'ce jour-la'); await sleep(200);
            const shown = await p.$$eval('[data-tr-cell]:not([hidden])', l => l.map(x => x.dataset.trCell));
            assert.deepStrictEqual(shown, ['ce-jour-la']); assert.match(await p.textContent('[data-tr-count]'), /1 trésor/);
            await p.fill('[data-tr-search]', 'zzzz'); await sleep(200); assert.strictEqual(await p.$eval('[data-tr-none]', x => x.hidden), false, 'rien trouvé');
            await p.fill('[data-tr-search]', ''); await sleep(200);
            await p.click('[data-tr-fav="veillee"]'); await p.waitForSelector('.h-tr-quick.is-fav [data-tr-chip="veillee"]');
            assert.deepStrictEqual(JSON.parse(await p.evaluate(() => localStorage.getItem('genealogie-tresors-favs'))), ['veillee']);
            await p.click('[data-tr-cell="une-vie"]', {button: 'right'}); await p.waitForSelector('.ui-actmenu');
            assert.deepStrictEqual(await p.$$eval('.ui-actmenu .ui-actmenu-i b', l => l.map(x => x.textContent)), ['Ouvrir', 'Mettre en favori', 'Cacher ce trésor']);
            await p.keyboard.press('Escape');
            await p.click('[data-tr-open="ce-jour-la"].h-tr-card'); await p.waitForSelector('[data-tr-page="ce-jour-la"]');
            await p.click('[data-tr-home]'); await p.waitForSelector('.h-tr-quick.is-recent [data-tr-chip="ce-jour-la"]');
        });

        await t('📅 Ce jour-là : les naissances de ce jour du calendrier, carte en image', async () => {
            await p.evaluate(() => window.LCNDA_EXT.tresors.open('ce-jour-la')); await p.waitForSelector('[data-cj-card] li');
            const items = await p.$$eval('[data-cj-card] li', l => l.map(x => x.textContent));
            assert.strictEqual(items.length, 2); assert.match(items[0], /1922.*Marie LACOMBE est née à Brive/); assert.match(items[1], /1950.*Pierre MAZAUD est né à Tulle/);
            await p.click('[data-tr-page] [data-tr-export]'); await p.waitForSelector('.ui-actmenu');
            const [dl] = await Promise.all([p.waitForEvent('download'), p.click('.ui-actmenu .ui-actmenu-i:has-text("PNG")')]);
            assert.match(dl.suggestedFilename(), /^ce-jour-la-.*\.png$/);
            await p.click('[data-cj-shift="1"]'); await p.waitForFunction(() => !document.querySelector('[data-cj-card] li'));
        });

        await t('🎞 Une vie : étapes datées, carte, diaporama en plein écran', async () => {
            await p.evaluate(() => window.LCNDA_EXT.tresors.open('une-vie')); await p.waitForSelector('[data-uv-count]');
            assert.match(await p.textContent('[data-uv-count]'), /2 étapes, 0 photos, une carte/);
            await p.click('[data-uv-go]'); await p.waitForSelector('[data-uv-show] .h-tr-vl-slide');
            assert.match(await p.textContent('[data-uv-show] h2'), /Pierre MAZAUD/);
            await p.click('[data-uv-show] [data-uv="next"]'); await p.waitForFunction(() => /Naissance/.test(document.querySelector('[data-uv-show] h2')?.textContent || ''));
            await p.keyboard.press('Escape'); await p.waitForFunction(() => !document.querySelector('[data-uv-show]'));
        });

        await t('📮 Questionnaire aux anciens : préparé et téléchargé, noté envoyé, supprimé avec ↶ Annuler', async () => {
            await p.evaluate(() => window.LCNDA_EXT.tresors.open('questionnaire')); await p.waitForSelector('[data-qpn-form]');
            await p.fill('[data-qpn-form] [name=to]', 'Tante Lucie DURAND');
            const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-qpn-form] [type=submit]')]);
            assert.match(dl.suggestedFilename(), /\.html$/);
            await p.waitForSelector('[data-qpn-row]'); assert.match(await p.textContent('[data-qpn-row]'), /À faire.*Tante Lucie DURAND/s);
            await p.click('[data-qpn-sent]'); await p.waitForFunction(() => /En cours/.test(document.querySelector('[data-qpn-row]')?.textContent || ''));
            await p.click('[data-qpn-more]'); await p.click('.ui-actmenu .ui-actmenu-i:has-text("Supprimer")');
            await p.waitForFunction(() => !document.querySelector('[data-qpn-row]'));
            assert.ok(await undoLast(/supprimé/)); await p.waitForSelector('[data-qpn-row]', {timeout: 8000});
        });

        await t('suppressions des Trésors : tout de suite, ↶ Annuler remet l’élément (même une lettre scellée)', async () => {
            const s = await post('tresor_write', {op: 'save', item: {kind: 'letter', title: 'Pour mes petits-enfants', body: 'Secret', open_at: '2099-01-01'}});
            const d = await post('tresor_write', {op: 'delete', id: s.id}); assert.ok(d.undo, 'un jeton pour ↶ Annuler');
            assert.ok(!(await api('tresors', {kind: 'letter'})).items.some(x => x.id === s.id));
            await post('tresor_write', {op: 'restore', undo: d.undo});
            const back = (await api('tresors', {kind: 'letter'})).items.find(x => x.id === s.id); assert.ok(back && back.sealed, 'revenue, toujours scellée');
            assert.deepStrictEqual(await post('tresor_write', {op: 'restore', undo: d.undo}), {ok: true, already: true});
            // à l'écran : Lettres → 🗑 sans question
            await p.evaluate(() => window.LCNDA_EXT.tresors.open('lettres')); await p.waitForSelector(`[data-l-del="${s.id}"]`);
            await p.click(`[data-l-del="${s.id}"]`); await p.waitForFunction(id => !document.querySelector(`[data-l-del="${id}"]`), s.id, {timeout: 8000});
            assert.ok(await undoLast(/Lettre supprimée/)); await p.waitForSelector(`[data-l-del="${s.id}"]`, {timeout: 8000});
        });

        await t('Trésors en consultation : pas de ⚙️ Réglages ni « Cacher »', async () => {
            await p.evaluate(() => { document.body.classList.add('is-kiosk'); window.LCNDA_APP.setModule('tresors'); }); await p.waitForSelector('[data-tr-hub]');
            await p.click('[data-tr-home]').catch(() => {}); await sleep(300);
            assert.ok(!(await p.$('[data-tr-hub] [data-tr-settings]')));
            await p.click('[data-tr-cell="une-vie"]', {button: 'right'}); await p.waitForSelector('.ui-actmenu');
            assert.ok(!(await p.$('.ui-actmenu .ui-actmenu-i:has-text("Cacher")'))); await p.keyboard.press('Escape');
            await p.evaluate(() => document.body.classList.remove('is-kiosk'));
        });

        await t('aucune erreur dans la page', () => assert.deepStrictEqual(errs, []));
    } finally {
        await browser.close(); proc.kill();
        try { fs.rmSync(tmp, {recursive: true, force: true}); } catch (_) {}
    }
    console.log(fails ? `✗ ${fails} en échec` : '✓ tout est bon');
    process.exit(fails ? 1 : 0);
})();
