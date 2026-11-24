#!/usr/bin/env node
/* 📊 Graphiques et 🗺 Carte — audit des onglets (docs/design/audit-onglets.html, §7 et §8) :
 *  Carte : un seul « Filtrer ▾ » avec les filtres de lignée (Sosa, côté, ascendants de…, étiquette), regroupement des points,
 *          « Dans cette zone », centre de gravité, légende, ⤓ Exporter (CSV…) · 🖨 Imprimer · 💾 Enregistrer la vue · ⛶,
 *          aller à un lieu, compteur des lieux sans position, ⌘+, mode consultation, largeur téléphone ;
 *  Graphiques : barre d'outils unique, « ＋ ? » parent inconnu, clic droit d'une case (masquer une branche…), portraits,
 *          repères « sans source », mini-plan, 🧩 grand arbre en feuilles à assembler (plan, recouvrement), chiffres et
 *          comparaison des statistiques, ↑ ↓ générations, ⋯ des vues enregistrées, mode consultation, largeur téléphone.
 *   node tests/test-audit-cartes.js */
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
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-audit-cartes-'));
    fs.mkdirSync(path.join(tmp, 'media'));
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4'};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$tag = function ($t) use ($pdo) { $s = $pdo->prepare('SELECT id FROM event_types WHERE gedcom_tag=? ORDER BY id LIMIT 1'); $s->execute([$t]); return (int) $s->fetchColumn(); };
$pl = function ($name, $lat, $lon) use ($pdo) { $pdo->prepare('INSERT INTO places(name, county, country, latitude, longitude) VALUES(?,?,?,?,?)')->execute([$name, 'Corrèze', 'France', $lat, $lon]); return (int) $pdo->lastInsertId(); };
$tulle = $pl('Tulle', 45.27, 1.77); $malv = $pl('Malvialle', 45.1, 2.6); $paris = $pl('Paris', 48.85, 2.35); $aur = $pl('Aurillac', 44.93, 2.44); $lyon = $pl('Lyon', 45.76, 4.84); $nowhere = $pl('Saint-Inconnu', null, null);
$per = function ($f, $l, $g, $evs, $start = 0) use ($pdo, $tag) { $pdo->prepare("INSERT INTO persons(first_name,last_name,gender,living_status,is_start) VALUES(?,?,?,'deceased',?)")->execute([$f, $l, $g, $start]); $id = (int) $pdo->lastInsertId();
    foreach ($evs as [$t, $y, $p]) { $pdo->prepare('INSERT INTO events(scope, person_id, event_type_id, year, date_text, place_id) VALUES(\'person\',?,?,?,?,?)')->execute([$id, $tag($t), $y, (string) $y, $p]); } return $id; };
$fam = function ($a, $b, $kids) use ($pdo) { $pdo->prepare('INSERT INTO families(partner1_id, partner2_id) VALUES(?,?)')->execute([$a ?: null, $b ?: null]); $f = (int) $pdo->lastInsertId(); foreach ($kids as $i => $k) { $pdo->prepare('INSERT INTO family_children(family_id, child_id, position) VALUES(?,?,?)')->execute([$f, $k, $i]); } };
$ids = [
  'jean' => $per('Jean', 'MAZAUD', 'male', [['BIRT', 1900, $tulle], ['DEAT', 1970, $tulle]], 1),
  'pierre' => $per('Pierre', 'MAZAUD', 'male', [['BIRT', 1870, $malv], ['DEAT', 1930, $tulle]]),
  'marie' => $per('Marie', 'LACOMBE', 'female', [['BIRT', 1875, $paris], ['MARR', 1898, $tulle]]),
  'louis' => $per('Louis', 'MAZAUD', 'male', [['BIRT', 1840, $aur]]),
  'paul' => $per('Paul', 'DURAND', 'male', [['BIRT', 1880, $lyon], ['RESI', 1910, $nowhere]]),
];
$fam($ids['pierre'], $ids['marie'], [$ids['jean']]);
$fam($ids['louis'], 0, [$ids['pierre']]);
$pdo->exec("INSERT INTO labels(name,color) VALUES('Branche DURAND','#2b8a3e')"); $lab = (int) $pdo->lastInsertId();
$pdo->prepare("INSERT INTO label_links(label_id,entity_type,entity_id) VALUES(?, 'person', ?)")->execute([$lab, $ids['paul']]);
$pdo->exec("INSERT INTO sources(title) VALUES('Registre de Tulle')"); $src = (int) $pdo->lastInsertId();
$pdo->prepare("INSERT INTO source_links(entity_type,entity_id,source_record_id) VALUES('person', ?, ?)")->execute([$ids['jean'], $src]);
$ids['label'] = $lab; $ids['tulle'] = $tulle;
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
        const ctx = await browser.newContext({viewport: {width: 1440, height: 900}});
        await ctx.route(/tile\.openstreetmap|arcgisonline|wmts|tile\./, r => r.abort()); // pas de tuiles pendant l'essai
        const p = await ctx.newPage();
        p.on('pageerror', e => errs.push(e.message));
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_PARTS?.renderMap && window.LCNDA_PARTS?.renderGraph && window.LCNDA_APP?.state?.csrf, null, {timeout: 30000});
        await p.addStyleTag({url: base + 'assets/css/audit-cartes.css'}); // (le <link> est ajouté dans index.php par ailleurs)
        const api = (x, q = {}) => p.evaluate(([y, z]) => window.LCNDA_APP.api(y, z).catch(e => ({error: e.message})), [x, q]);
        const pointPeople = () => p.evaluate(() => [...new Set(window.LCNDA_APP.state.mapPoints.map(x => Number(x.person_id)))].sort((a, b) => a - b));
        const waitRender = async () => { await sleep(150); await p.waitForFunction(() => document.querySelector('#map-stage') && !document.querySelector('#map-stage.is-loading'), null, {timeout: 15000}); await sleep(250); };

        await t('serveur : filtres de lignée (moteur de Mes cartes), sans source, centre de gravité, lieux sans position, lieu', async () => {
            const sosa = await api('cartes_perso', {op: 'map_scope', f: JSON.stringify({sosa: true})});
            assert.deepStrictEqual(sosa.ids, [ID.jean, ID.pierre, ID.marie, ID.louis].sort((a, b) => a - b));
            const father = await api('cartes_perso', {op: 'map_scope', f: JSON.stringify({sosa: true, side: 'father'})});
            assert.deepStrictEqual(father.ids, [ID.pierre, ID.louis].sort((a, b) => a - b));
            const asc = await api('cartes_perso', {op: 'map_scope', f: JSON.stringify({persons: [ID.pierre], rel: 'asc', gens: 4})});
            assert.deepStrictEqual(asc.ids, [ID.pierre, ID.louis].sort((a, b) => a - b));
            const lab = await api('cartes_perso', {op: 'map_scope', f: JSON.stringify({labels: [ID.label]})});
            assert.deepStrictEqual(lab.ids, [ID.paul]);
            const none = await api('cartes_perso', {op: 'map_scope', f: '{}'}); assert.strictEqual(none.all, true);
            const ns = await api('cartes_perso', {op: 'map_scope', f: JSON.stringify({nosource: 1})});
            assert.ok(!ns.ids.includes(ID.jean) && ns.ids.includes(ID.paul), JSON.stringify(ns));
            const g = await api('cartes_perso', {op: 'map_gravity'});
            assert.deepStrictEqual(g.generations.map(x => x.gen), [1, 2, 3]);
            assert.ok(Math.abs(g.generations[1].lat - (45.1 + 48.85) / 2) < 1e-3, 'G2 = moyenne de Malvialle et Paris');
            const u = await api('cartes_perso', {op: 'map_unplaced'}); assert.deepStrictEqual([u.places, u.events], [1, 1]);
            const pl = await api('cartes_perso', {op: 'map_place', id: ID.tulle}); assert.strictEqual(pl.place.lat, 45.27);
        });

        await p.evaluate(() => { const A = window.LCNDA_APP; A.state.mapMode = 'standard'; A.state.mapTag = 'all'; A.state.mapDisplay = 'markers'; localStorage.removeItem('genealogie-map-lineage'); localStorage.removeItem('genealogie-map-options'); A.setModule('carte'); });
        await p.waitForSelector('#map-stage'); await waitRender();

        await t('Carte : barre unique (endroit · Filtrer ▾ · ⤓ Exporter · 🖨 Imprimer · 💾 Enregistrer la vue · ⛶), 💾 plus dans la colonne', async () => {
            assert.match(await p.textContent('.map-layout .tool-strip .map-where'), /^CARTE · /);
            for (const sel of ['#map-filter-btn', '#map-export', '#map-print', '#map-save-view', '#map-full', '#map-goto']) assert.ok(await p.$(sel), sel);
            assert.strictEqual(await p.$('#save-current-map'), null);
            assert.ok(await p.$('#map-filter-panel[hidden]'), 'panneau fermé au départ');
            await p.click('#map-filter-btn'); assert.ok(await p.isVisible('#map-filter-panel'));
            for (const sel of ['#map-gender', '#map-year-from', '#map-surname', '#map-age-from', '#map-location-mode', '#map-lin-sosa', '#map-lin-side', '#map-lin-label', '#map-lin-person', '#map-reset']) assert.ok(await p.$(sel), sel);
        });
        await t('Carte : filtres de lignée — Sosa, côté du père, ascendants de…, étiquette ; pastilles « × » et « Tout effacer »', async () => {
            assert.deepStrictEqual(await pointPeople(), [ID.jean, ID.pierre, ID.marie, ID.louis, ID.paul].sort((a, b) => a - b));
            await p.check('#map-lin-sosa'); await waitRender();
            assert.deepStrictEqual(await pointPeople(), [ID.jean, ID.pierre, ID.marie, ID.louis].sort((a, b) => a - b));
            assert.ok(await p.isVisible('#map-filter-panel'), 'le panneau reste ouvert');
            await p.selectOption('#map-lin-side', 'father'); await waitRender();
            assert.deepStrictEqual(await pointPeople(), [ID.pierre, ID.louis].sort((a, b) => a - b));
            assert.ok((await p.$$('.map-chip')).length >= 2, 'pastilles');
            await p.click('[data-map-chip-all]'); await waitRender();
            assert.strictEqual((await pointPeople()).length, 5);
            await p.evaluate(([id]) => document.querySelector('#map-lin-person').dispatchEvent(new CustomEvent('picker-change', {bubbles: true, detail: {item: {id, title: 'Pierre MAZAUD', kind: 'person'}}})), [ID.pierre]);
            await waitRender();
            assert.deepStrictEqual(await pointPeople(), [ID.pierre, ID.louis].sort((a, b) => a - b));
            assert.match(await p.textContent('.map-filter-strip'), /Ascendants de Pierre MAZAUD/);
            assert.ok(JSON.parse(await p.evaluate(() => localStorage.getItem('genealogie-map-lineage'))).person.id === ID.pierre, 'retenu en genealogie-*');
            await p.click('#map-reset'); await waitRender();
            if (!await p.isVisible('#map-filter-panel')) await p.click('#map-filter-btn');
            await p.selectOption('#map-lin-label', String(ID.label)); await waitRender();
            assert.deepStrictEqual(await pointPeople(), [ID.paul]);
            await p.click('#map-reset'); await waitRender();
            await p.click('#map-filter-close'); assert.ok(!(await p.isVisible('#map-filter-panel')));
        });
        await t('Carte : regroupement des points (pastille « n », clic = zoom), couleurs des sortes et légende', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.mapCenter = {lat: 46, lon: 2.5}; A.state.mapZoom = 5; window.LCNDA_PARTS.drawMap(); });
            const n = await p.$$eval('.map-cluster', x => x.length); assert.ok(n >= 1, 'pastille');
            const z0 = await p.evaluate(() => window.LCNDA_APP.state.mapZoom);
            await p.click('.map-cluster'); assert.ok(await p.evaluate(() => window.LCNDA_APP.state.mapZoom) > z0, 'zoom');
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.mapCenter = {lat: 46, lon: 2.5}; A.state.mapZoom = 7; window.LCNDA_PARTS.drawMap(); });
            assert.ok(await p.$$eval('.map-marker.is-kind', x => x.length) > 0, 'couleurs');
            if (process.env.SHOTS) { await p.click('#map-filter-btn'); await p.screenshot({path: path.join(process.env.SHOTS, 'map.png')}); await p.click('#map-filter-btn'); }
            const lg = await p.textContent('#map-legend'); assert.match(lg, /Naissances/); assert.match(lg, /Période : 1840 – 1970/);
            await p.click('[data-map-opt="cluster"]'); await sleep(200);
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.mapZoom = 5; window.LCNDA_PARTS.drawMap(); });
            assert.strictEqual(await p.$$eval('.map-cluster', x => x.length), 0, 'regroupement coupé');
            await p.click('[data-map-opt="cluster"]'); await sleep(200);
        });
        await t('Carte : « Dans cette zone » suit la carte ; clic = point surligné et sa bulle', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.mapCenter = {lat: 46, lon: 2.5}; A.state.mapZoom = 7; window.LCNDA_PARTS.drawMap(); });
            await p.click('[data-map-opt="zone"]'); await sleep(400);
            assert.ok(await p.isVisible('#map-zone-panel'));
            const rows = await p.$$eval('#map-zone-panel [data-zone-key]', x => x.length); assert.ok(rows >= 5, String(rows));
            await p.click('#map-zone-panel [data-zone-key]'); await sleep(150);
            assert.ok(await p.$('.map-marker.is-flash, .map-cluster.is-flash'), 'surligné');
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.mapCenter = {lat: 45.76, lon: 4.84}; A.state.mapZoom = 12; window.LCNDA_PARTS.drawMap(); });
            await sleep(400); assert.match(await p.textContent('#map-zone-panel'), /Paul DURAND/);
            assert.doesNotMatch(await p.textContent('#map-zone-panel'), /Pierre MAZAUD/);
            await p.click('[data-zone-close]'); assert.ok(!(await p.isVisible('#map-zone-panel')));
        });
        await t('Carte : centre de gravité par génération (calque G1, G2, G3 + flèche)', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.mapCenter = {lat: 46, lon: 2.5}; A.state.mapZoom = 6; });
            await p.click('[data-map-opt="gravity"]'); await sleep(600);
            assert.deepStrictEqual(await p.$$eval('#map-gravity-layer .map-grav-pt text', x => x.map(e => e.textContent)), ['G3', 'G2', 'G1']);
            assert.ok(await p.$('#map-gravity-layer path[marker-end]'));
            await p.click('[data-map-opt="gravity"]'); await sleep(200);
        });
        await t('Carte : aller à un lieu (centre + bulle), compteur « lieux pas sur la carte »', async () => {
            await p.evaluate(() => document.getElementById('map-tooltip')?.remove());
            await p.evaluate(([id]) => document.querySelector('#map-goto').dispatchEvent(new CustomEvent('picker-change', {bubbles: true, detail: {item: {id, title: 'Tulle', kind: 'place'}}})), [ID.tulle]);
            await p.waitForSelector('#map-tooltip', {timeout: 5000});
            const c = await p.evaluate(() => window.LCNDA_APP.state.mapCenter); assert.ok(Math.abs(c.lat - 45.27) < .01);
            assert.match(await p.textContent('#map-tooltip'), /Tulle/);
            await p.evaluate(() => document.getElementById('map-tooltip')?.remove());
            const lap = await p.textContent('.map-layout [data-lap-open]'); assert.match(lap, /1 lieu pas sur la carte/);
        });
        await t('Carte : ⤓ Exporter (PNG, JPG, PDF, CSV, Imprimer), 🖨 Imprimer, ⌘+ zoome, 💾 dans la barre', async () => {
            await p.click('#map-export'); await p.waitForSelector('.ui-export-fmt[data-fmt="csv"]');
            assert.deepStrictEqual(await p.$$eval('.ui-export-fmt', x => x.map(b => b.dataset.fmt)), ['png', 'jpg', 'pdf', 'csv', 'print']);
            await p.click('.ui-export-fmt[data-fmt="csv"]');
            const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-ui-go]')]);
            const csv = fs.readFileSync(await dl.path(), 'utf8'); assert.match(csv, /Lieu;Latitude;Longitude/);
            await p.keyboard.press('Escape'); await sleep(200);
            const z = await p.evaluate(() => window.LCNDA_APP.state.mapZoom);
            await p.locator('#map-stage').click({position: {x: 5, y: 5}}).catch(() => {});
            await p.evaluate(() => document.activeElement?.blur());
            await p.keyboard.press('Control+='); assert.strictEqual(await p.evaluate(() => window.LCNDA_APP.state.mapZoom), z + 1);
            await p.click('#map-print'); await p.waitForSelector('dialog.k-print[open]', {timeout: 8000});
            await p.keyboard.press('Escape'); await sleep(200);
            await p.click('#map-save-view'); await p.waitForSelector('#view-dialog[open], dialog[open]'); await p.keyboard.press('Escape');
        });

        // ── Graphiques ──
        await p.evaluate(([id]) => { const A = window.LCNDA_APP; A.state.currentPersonId = id; A.state.graphMode = 'ancestors'; A.state.graphDepth = 4; A.state.graphTab = 'types'; A.setModule('graphiques'); }, [ID.jean]);
        await p.waitForSelector('.graph-layout .tree-card'); await p.waitForSelector('[data-gp-tools]'); await sleep(300);
        await t('Graphiques : barre unique « GRAPHIQUES · Arbre… » · ⤓ Exporter · 🧩 · 🖨 · 💾 · ⛶ ; « Enregistrées »', async () => {
            assert.match(await p.textContent('.graph-layout .tool-strip .gp-where'), /^GRAPHIQUES · /);
            for (const sel of ['[data-graph-export]', '[data-gp-poster]', '[data-gp-print]', '[data-gp-save]', '[data-gp-full]']) assert.ok(await p.$(`.graph-layout .tool-strip ${sel}`), sel);
            assert.strictEqual(await p.$('#save-current-graph'), null);
            assert.match(await p.textContent('[data-graph-tab="saved"]'), /Enregistrées/);
        });
        if (process.env.SHOTS) await p.screenshot({path: path.join(process.env.SHOTS, 'graph.png')});
        await t('Graphiques : case « ＋ ? » pour un parent inconnu → la fenêtre « Ajouter un parent »', async () => {
            const n = await p.$$eval('[data-tree-add-parent]', x => x.map(b => Number(b.dataset.treeAddParent)));
            assert.ok(n.includes(ID.pierre), 'la mère de Pierre manque'); assert.ok(n.includes(ID.louis), 'les parents de Louis manquent');
            assert.ok(!n.includes(ID.jean), 'Jean a ses deux parents');
            await p.click(`[data-tree-add-parent="${ID.pierre}"]`); await p.waitForSelector('#relation-dialog[open]');
            assert.strictEqual(await p.$eval('#relation-form', f => [f.elements.person_id.value, f.elements.relation_type.value].join(':')), `${ID.pierre}:parent`);
            await p.evaluate(() => document.getElementById('relation-dialog').close()); await sleep(500);
        });
        await t('Graphiques : clic droit sur une case — Ouvrir, Recentrer, Ajouter, Masquer cette branche, Copier', async () => {
            await p.waitForSelector(`.tree-person-unit > [data-tree-person="${ID.pierre}"]`);
            await p.click(`.tree-person-unit > [data-tree-person="${ID.pierre}"]`, {button: 'right'});
            await p.waitForSelector('.ui-actmenu');
            const items = await p.$$eval('.ui-actmenu .ui-actmenu-i', x => x.map(b => b.textContent.trim()));
            for (const w of ['Ouvrir la fiche', 'Recentrer l’arbre ici', 'Ajouter un parent', 'Ajouter un enfant', 'Masquer cette branche', 'Copier la référence']) assert.ok(items.some(i => i.includes(w)), w + ' — ' + items.join(' | '));
            await p.click('.ui-actmenu .ui-actmenu-i:has-text("Masquer cette branche")');
            assert.ok(await p.$eval(`.tree-person-unit > [data-tree-person="${ID.pierre}"]`, c => c.closest('li').querySelector(':scope > ul').hidden));
            assert.match(await p.textContent('#gp-unhide'), /Montrer les branches masquées \(1\)/);
            await p.click('#gp-unhide');
            assert.ok(!(await p.$eval(`.tree-person-unit > [data-tree-person="${ID.pierre}"]`, c => c.closest('li').querySelector(':scope > ul').hidden)));
        });
        await t('Graphiques : 🧷 repères « sans source », 🖼 portraits retenus, ↑ ↓ générations, ⌘+ zoom', async () => {
            await p.waitForFunction(() => document.querySelector('#gp-marks')?.dataset.filled);
            await p.selectOption('#gp-marks', 'nosource');
            await p.waitForFunction(() => document.querySelectorAll('.gp-marked').length > 0);
            const marked = await p.$$eval('.gp-marked', x => x.map(c => Number(c.dataset.treePerson)));
            assert.ok(!marked.includes(ID.jean) && marked.includes(ID.pierre), JSON.stringify(marked));
            assert.strictEqual(await p.evaluate(() => localStorage.getItem('genealogie-graph-marks')), '"nosource"');
            await p.selectOption('#gp-marks', '');
            await p.check('#gp-portraits'); await p.waitForSelector('.graph-layout .tree-card'); await sleep(300);
            assert.strictEqual(await p.evaluate(() => localStorage.getItem('genealogie-tree-portraits')), 'true');
            assert.ok(await p.$('.tree-card.has-lc-av'), 'portrait (ou initiales) dans les cases');
            await p.uncheck('#gp-portraits'); await sleep(500);
            await p.evaluate(() => document.activeElement?.blur());
            await p.keyboard.press('ArrowUp'); await sleep(600);
            assert.strictEqual(await p.evaluate(() => window.LCNDA_APP.state.graphDepth), 5);
            await p.keyboard.press('ArrowDown'); await sleep(600);
            assert.strictEqual(await p.evaluate(() => window.LCNDA_APP.state.graphDepth), 4);
            const z = await p.evaluate(() => window.LCNDA_APP.state.graphZoom);
            await p.keyboard.press('Control+='); assert.ok(await p.evaluate(() => window.LCNDA_APP.state.graphZoom) > z);
        });
        await t('Graphiques : mini-plan d’un grand arbre (cadre qui suit, clic = déplacement)', async () => {
            await p.setViewportSize({width: 900, height: 600});
            await p.evaluate(() => { window.LCNDA_APP.state.graphZoom = 1.8; }); await p.evaluate(() => window.LCNDA_PARTS.renderGraph());
            await p.waitForSelector('.gp-minimap:not([hidden]) canvas', {timeout: 5000});
            await sleep(400); await p.$eval('.tree-stage', s => { s.scrollLeft = 0; s.scrollTop = 0; }); await sleep(150);
            const before = await p.$eval('.tree-stage', s => s.scrollLeft + s.scrollTop);
            const box = await (await p.$('.gp-minimap canvas')).boundingBox();
            await p.mouse.click(box.x + box.width - 3, box.y + box.height - 3);
            await sleep(100); assert.ok(await p.$eval('.tree-stage', s => s.scrollLeft + s.scrollTop) > before, 'déplacé');
            await p.setViewportSize({width: 1440, height: 900}); await p.evaluate(() => { window.LCNDA_APP.state.graphZoom = 1; });
        });
        await t('Graphiques : 🧩 grand arbre en feuilles à assembler — plan, recouvrement, repères, feuilles nommées', async () => {
            const plan = await p.evaluate(() => window.LCNDA_GRAPH_POSTER.plan(3000, 1000, [210, 297], {cols: 3, overlap: 10, margin: 8}));
            assert.strictEqual(plan.C, 3); assert.strictEqual(Math.round(plan.posterW), 3 * 194 - 2 * 10);
            assert.strictEqual(plan.R, Math.ceil((1000 * plan.mmPerPx - 10) / (281 - 10)));
            assert.deepStrictEqual(plan.sheets.slice(0, 3).map(s => [s.name, s.x0]), [['A1', 0], ['B1', 184], ['C1', 368]]);
            await p.evaluate(() => window.LCNDA_PARTS.renderGraph()); await p.waitForSelector('[data-gp-poster]');
            await p.click('[data-gp-poster]'); await p.waitForSelector('dialog.k-print[open]', {timeout: 8000});
            await p.waitForFunction(() => { const f = document.querySelector('dialog.k-print[open] iframe'); return f && f.contentDocument && f.contentDocument.querySelectorAll('[data-k-page]').length > 1; }, null, {timeout: 10000});
            const info = await p.evaluate(() => { const d = document.querySelector('dialog.k-print[open] iframe').contentDocument; return {pages: d.querySelectorAll('[data-k-page]').length, map: !!d.querySelector('.gpp-map'), labels: [...d.querySelectorAll('.gpp-label b')].map(b => b.textContent), cut: d.querySelectorAll('.gpp-cut-v').length, glue: d.querySelectorAll('.gpp-glue-v').length, crosses: d.querySelectorAll('.gpp-cross').length}; });
            if (process.env.SHOTS) { await p.screenshot({path: path.join(process.env.SHOTS, 'poster.png')}); }
            assert.ok(info.map, 'plan d’assemblage'); assert.deepStrictEqual(info.labels.slice(0, 3), ['A1', 'B1', 'C1']);
            assert.strictEqual(info.pages, 1 + info.labels.length); assert.ok(info.cut >= 2 && info.glue >= 2 && info.crosses >= 8, JSON.stringify(info));
            await p.keyboard.press('Escape'); await sleep(200);
        });
        await t('Graphiques : statistique — 🧮 voir les chiffres (tableau, CSV) et ↔ comparer deux périodes (même échelle)', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.graphMode = 'stats'; A.state.graphStatsType = 'surnames'; A.state.graphStatsYearFrom = ''; A.state.graphStatsYearTo = ''; A.state.graphStatsRules = []; A.state.graphStatsGender = ''; window.LCNDA_PARTS.renderGraph(); });
            await p.waitForSelector('[data-gp-numbers]', {timeout: 10000});
            assert.match(await p.textContent('.graph-layout .tool-strip .eyebrow'), /^GRAPHIQUES/);
            assert.ok(await p.$('.graph-layout .tool-strip [data-gp-print]'));
            await p.click('[data-gp-numbers]'); await p.waitForSelector('.gp-numbers table');
            const cells = await p.$$eval('.gp-numbers tbody tr', r => r.map(x => x.textContent));
            assert.ok(cells.some(c => /MAZAUD/.test(c) && /3/.test(c)), cells.join(' | '));
            const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-gp-csv]')]);
            assert.match(fs.readFileSync(await dl.path(), 'utf8'), /MAZAUD;3/);
            await p.click('[data-gp-compare]'); await p.waitForSelector('.gp-compare');
            await p.fill('[data-gp-cmp="a1"]', '1800'); await p.fill('[data-gp-cmp="a2"]', '1874'); await p.fill('[data-gp-cmp="b1"]', '1875'); await p.fill('[data-gp-cmp="b2"]', '1950');
            await p.click('[data-gp-cmp-go]'); await p.waitForSelector('.gp-compare-grid section');
            assert.strictEqual(await p.$$eval('.gp-compare-grid section', x => x.length), 2);
            assert.match(await p.textContent('.gp-compare'), /Même échelle/);
            assert.ok(JSON.parse(await p.evaluate(() => localStorage.getItem('genealogie-stats-compare'))).a1 === '1800');
        });
        await t('Vues enregistrées : ⋯ et clic droit (Ouvrir · Modifier · Supprimer) ; supprimer = tout de suite + ↶ Annuler', async () => {
            const r = await p.evaluate(async () => window.LCNDA_APP.api('save_view', {}, {method: 'POST', body: {module: 'graph', name: 'Arbre MAZAUD', config: {mode: 'ancestors', depth: 3}}}).catch(e => ({error: e.message})));
            assert.ok(!r.error, JSON.stringify(r));
            await p.evaluate(async () => { const A = window.LCNDA_APP; await A.reloadBootstrap(); A.state.graphTab = 'saved'; A.renderSidebar(); });
            await p.waitForSelector('#sidebar-content [data-view-more]');
            await p.click('#sidebar-content [data-view-id]', {button: 'right'}); await p.waitForSelector('.ui-actmenu');
            const items = await p.$$eval('.ui-actmenu .ui-actmenu-i', x => x.map(b => b.textContent.trim()));
            assert.ok(items[0].includes('Ouvrir') && items.some(i => i.includes('Modifier')) && items.at(-1).includes('Supprimer'), items.join('|'));
            await p.click('.ui-actmenu .ui-actmenu-i:has-text("Supprimer")');
            await p.waitForFunction(() => /Annuler/.test(document.body.innerText));
            await p.evaluate(() => { window.LCNDA_APP.state.graphTab = 'types'; window.LCNDA_APP.renderSidebar(); });
        });
        await t('Mode consultation : pas de « ＋ ? », pas de 💾, menus sans modification', async () => {
            await p.evaluate(([id]) => { document.body.classList.add('is-kiosk'); const A = window.LCNDA_APP; A.state.currentPersonId = id; A.state.graphMode = 'ancestors'; window.LCNDA_PARTS.renderGraph(); }, [ID.jean]);
            await p.waitForSelector('.graph-layout .tree-card'); await p.waitForSelector('[data-gp-tools]'); await sleep(200);
            assert.strictEqual(await p.$$eval('[data-tree-add-parent]', x => x.length), 0);
            assert.strictEqual(await p.$('[data-gp-save]'), null);
            await p.click(`.tree-person-unit > [data-tree-person="${ID.pierre}"]`, {button: 'right'}); await p.waitForSelector('.ui-actmenu');
            const items = await p.$$eval('.ui-actmenu .ui-actmenu-i', x => x.map(b => b.textContent.trim()).join('|'));
            assert.doesNotMatch(items, /Ajouter/); await p.keyboard.press('Escape');
            await p.evaluate(() => window.LCNDA_APP.setModule('carte')); await p.waitForSelector('#map-stage'); await waitRender();
            assert.strictEqual(await p.$('#map-save-view'), null);
            assert.ok(!(await p.isVisible('.map-layout [data-lap-open]')), 'placer des lieux = modifier');
            await p.evaluate(() => document.body.classList.remove('is-kiosk'));
        });
        await t('Largeur téléphone (390 px) : rien ne déborde, Carte et Graphiques', async () => {
            await p.setViewportSize({width: 390, height: 800});
            await p.evaluate(() => window.LCNDA_PARTS.renderMap()); await waitRender();
            await p.click('#map-filter-btn').catch(() => {});
            const over = await p.evaluate(() => { const panel = document.querySelector('#map-filter-panel'); const r = panel?.getBoundingClientRect(); return {doc: document.documentElement.scrollWidth, panelRight: r ? r.right : 0}; });
            assert.ok(over.doc <= 390 && over.panelRight <= 391, JSON.stringify(over));
            await p.evaluate(() => { window.LCNDA_APP.state.graphMode = 'ancestors'; window.LCNDA_APP.setModule('graphiques'); }); await p.waitForSelector('.graph-layout .tree-card'); await sleep(300);
            assert.ok(await p.evaluate(() => document.documentElement.scrollWidth) <= 390);
            assert.strictEqual(await p.$eval('.graph-layout .tool-strip', s => getComputedStyle(s).flexWrap), 'nowrap');
        });
        await t('aucune erreur JavaScript', async () => { assert.deepStrictEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true});
    }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})();
