#!/usr/bin/env node
/* 👤 Onglet Personnes — audit des onglets (docs/design/audit-onglets.html §2, R2 R4 R5 R6 R7 R8 R10 R11 R12) :
 *  serveur : 🧭 ton lien (sang, alliance, « par … »), 🔍 filtres et tris de la colonne, 👪 fiche familiale, ⚡ saisie rapide
 *  d'une famille (et ↶), 🧮 garder un fait (l'autre devient une version, et ↶), 🕘 remettre un champ, 🔒 / 📝 (migration 111) ;
 *  écran : barre commune de la colonne (plus de ⌕), Filtrer ▾ / Trier, ⋯ et clic droit, 🧭 dans l'en-tête / la colonne / les arbres,
 *  🖨 / ⤓ de la fiche, case 🔒 et note 📝 dans la fenêtre d'un événement, consultation (rien de confidentiel, rien à modifier),
 *  🖼 âge sur la photo, 🕘 comparer avec maintenant, ⌘Z sans fenêtre, retirer un lien = ↶ Annuler, raccourcis R5, réglages R8,
 *  🐾 courbe de poids, 390 px sans débordement.
 *   node tests/test-audit-personnes.js */
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
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 7).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-pa-'));
    fs.mkdirSync(path.join(tmp, 'media'));
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4'};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$tag = function ($t) use ($pdo) { $s = $pdo->prepare('SELECT id FROM event_types WHERE gedcom_tag=? ORDER BY id LIMIT 1'); $s->execute([$t]); return (int) $s->fetchColumn(); };
$pl = function ($name) use ($pdo) { $pdo->prepare("INSERT INTO places(name, country) VALUES(?, 'France')")->execute([$name]); return (int) $pdo->lastInsertId(); };
$tulle = $pl('Tulle'); $paris = $pl('Paris');
$per = function ($f, $l, $g, $evs = [], $kind = 'human') use ($pdo, $tag) { $pdo->prepare("INSERT INTO persons(first_name,last_name,gender,living_status,kind) VALUES(?,?,?,'deceased',?)")->execute([$f, $l, $g, $kind]); $id = (int) $pdo->lastInsertId();
    foreach ($evs as $e) { [$t, $d, $p] = $e; $pdo->prepare("INSERT INTO events(scope, person_id, event_type_id, year, date_text, place_id) VALUES('person',?,?,?,?,?)")->execute([$id, $tag($t), (int) substr($d, -4), $d, $p]); } return $id; };
$fam = function ($a, $b, $kids) use ($pdo) { $pdo->prepare('INSERT INTO families(partner1_id, partner2_id) VALUES(?,?)')->execute([$a, $b]); $f = (int) $pdo->lastInsertId(); foreach ($kids as $i => $k) { $pdo->prepare('INSERT INTO family_children(family_id, child_id, position) VALUES(?,?,?)')->execute([$f, $k, $i]); } return $f; };
$I = [];
$I['louis'] = $per('Louis', 'MAZAUD', 'male', [['BIRT', '1890', $tulle]]);
$I['anne'] = $per('Anne', 'LACOMBE', 'female', [['BIRT', '1895', $tulle]]);
$I['henri'] = $per('Henri', 'DURAND', 'male', [['BIRT', '1888', $paris]]);
$I['rose'] = $per('Rose', 'DURAND', 'female', [['BIRT', '1892', $paris]]);
$I['pierre'] = $per('Pierre', 'MAZAUD', 'male', [['BIRT', '1920', $tulle]]);
$I['paul'] = $per('Paul', 'MAZAUD', 'male', [['BIRT', '1922', $tulle]]);
$I['marie'] = $per('Marie', 'DURAND', 'female', [['BIRT', '1925', $paris]]);
$I['claire'] = $per('Claire', 'DURAND', 'female', [['BIRT', '1928', $paris]]);
$I['jean'] = $per('Jean', 'MAZAUD', 'male', [['BIRT', '12/03/1950', $tulle], ['BIRT', '1951', $paris], ['RESI', '1975', $paris]]);
$I['luc'] = $per('Luc', 'MAZAUD', 'male', [['BIRT', '1952', $tulle]]);
$I['sophie'] = $per('Sophie', 'LACOMBE', 'female', [['BIRT', '1955', $paris]]);
$I['julie'] = $per('Julie', 'LACOMBE', 'female', [['BIRT', '1954', $paris]]);
$I['albert'] = $per('Albert', 'LACOMBE', 'male', [['BIRT', '1801', $paris]]);
$I['felix'] = $per('Félix', 'MAZAUD', 'male', [], 'animal');
// 🧭 une lignée profonde (pas encore reliée à Louis : les filtres ci-dessous comptent les ancêtres de Jean) ; le test « lien très long » la relie
$I['g3'] = $per('Adrien', 'BAISSAIT', 'male'); $I['g4'] = $per('Barthélemy', 'BAISSAIT', 'male'); $I['g5'] = $per('Gaspard-Hippolyte', 'BAISSAIT', 'male');
$fam($I['g5'], null, [$I['g4']]); $fam($I['g4'], null, [$I['g3']]);
$pdo->exec('UPDATE persons SET is_start=1 WHERE id=' . $I['jean']);
$fam($I['louis'], $I['anne'], [$I['pierre'], $I['paul']]);
$fam($I['henri'], $I['rose'], [$I['marie'], $I['claire']]);
$I['f_pm'] = $fam($I['pierre'], $I['marie'], [$I['jean']]);
$fam($I['paul'], null, [$I['luc']]);
$fam($I['claire'], null, [$I['sophie']]);
$fam($I['luc'], $I['julie'], []);
$pdo->prepare("INSERT INTO events(scope, family_id, event_type_id, year, date_text, place_id) VALUES('family',?,?,1948,'5 juin 1948',?)")->execute([$I['f_pm'], $tag('MARR'), $tulle]);
// une source sur Pierre (filtre « sans source »)
$pdo->exec("INSERT INTO sources(title) VALUES('Registre de Tulle')"); $src = (int) $pdo->lastInsertId();
$pdo->prepare("INSERT INTO source_links(entity_type, entity_id, source_record_id) VALUES('person',?,?)")->execute([$I['pierre'], $src]);
// une photo datée de Jean
$pdo->exec("INSERT INTO media(title, media_type, filename, date_text) VALUES('Jean au service militaire', 'image', 'jean.jpg', '12/03/1970')"); $m = (int) $pdo->lastInsertId();
$pdo->prepare("INSERT INTO media_links(media_id, entity_type, entity_id) VALUES(?, 'person', ?)")->execute([$m, $I['jean']]);
// une étiquette sur Luc
$pdo->exec("INSERT INTO labels(name) VALUES('À vérifier')"); $lab = (int) $pdo->lastInsertId();
$pdo->prepare("INSERT INTO label_links(label_id, entity_type, entity_id) VALUES(?, 'person', ?)")->execute([$lab, $I['luc']]); $I['label'] = $lab;
// l'animal et sa fiche
$pdo->prepare("INSERT INTO pets(data_json, person_id) VALUES('{}', ?)")->execute([$I['felix']]); $I['pet'] = (int) $pdo->lastInsertId();
$ev = $pdo->query("SELECT id FROM events WHERE person_id={$I['jean']} AND event_type_id=" . $tag('RESI'))->fetchColumn(); $I['resi'] = (int) $ev;
$I['version'] = (int) $pdo->query('PRAGMA user_version')->fetchColumn();
$I['cols'] = array_column($pdo->query('PRAGMA table_info(events)')->fetchAll(PDO::FETCH_ASSOC), 'name');
echo json_encode($I);`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0 || !/jean/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const ID = JSON.parse(seed.stdout.trim().split('\n').pop());

    await t('migration 111 : events.is_private et events.research_note ; structure à jour', async () => {
        assert.ok(ID.cols.includes('is_private') && ID.cols.includes('research_note'));
        assert.equal(ID.version, Number(fs.readFileSync(path.join(root, 'lib/migrations.php'), 'utf8').match(/const SCHEMA_VERSION = (\d+);/)[1]));
    });

    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const errs = [];
    // la feuille de style de ces ajouts (le <link> est posé dans index.php par la personne qui intègre)
    const css = fs.readFileSync(path.join(root, 'assets/css/audit-personnes.css'), 'utf8');
    const ctx = await browser.newContext({viewport: {width: 1440, height: 900}});
    await ctx.route(url => new URL(url).pathname === '/' || /index\.php$/.test(new URL(url).pathname), async route => {
        const r = await route.fetch(); let body = await r.text();
        if (!/audit-personnes\.css/.test(body)) body = body.replace('</head>', `<style id="pa-test-css">${css}</style></head>`);
        await route.fulfill({response: r, body, headers: {...r.headers(), 'content-length': String(Buffer.byteLength(body))}});
    });
    try {
        const p = await ctx.newPage();
        p.on('pageerror', e => errs.push(e.message));
        p.on('dialog', d => d.dismiss().catch(() => {}));
        let nboot = 0; const boot = async () => { await p.goto(`${base}?b=${++nboot}#personnes`); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_UI?.listBar, null, {timeout: 30000}); };
        await boot();
        const api = (x, q = {}) => p.evaluate(([y, z]) => window.LCNDA_APP.api(y, z).catch(e => ({error: e.message})), [x, q]);
        const post = (a, b) => p.evaluate(async ([x, y]) => { try { const r = await window.LCNDA_APP.api(x, {}, {method: 'POST', body: y}); return r.result || r; } catch (e) { return {error: e.message}; } }, [a, b]);
        const openPerson = async id => { await p.evaluate(i => window.LCNDA_APP.openPersonById(i), id); await p.waitForFunction(i => window.LCNDA_APP.state.currentPerson?.person?.id === i && document.querySelector('.person-page h2'), id, {timeout: 20000}); };
        const clickToast = async label => { await p.waitForFunction(l => [...document.querySelectorAll('.ui-toast button')].some(b => b.textContent.includes(l)), label, {timeout: 10000}); await p.evaluate(l => [...document.querySelectorAll('.ui-toast button')].reverse().find(b => b.textContent.includes(l)).click(), label); };

        await t('serveur : 🧭 ton lien (sang, « par … », alliance, aucun)', async () => {
            const luc = await api('person_link', {id: ID.luc, root: ID.jean});
            assert.equal(luc.link.label, 'cousin germain'); assert.equal(luc.link.via.name, 'Pierre MAZAUD');
            const so = await api('person_link', {id: ID.sophie, root: ID.jean});
            assert.equal(so.link.label, 'cousine germaine'); assert.equal(so.link.via.name, 'Marie DURAND');
            assert.equal((await api('person_link', {id: ID.louis, root: ID.jean})).link.label, 'grand-père');
            assert.equal((await api('person_link', {id: ID.paul, root: ID.jean})).link.label, 'oncle');
            assert.equal((await api('person_link', {id: ID.julie, root: ID.jean})).link.label, 'conjoint(e) de : cousin germain');
            assert.equal((await api('person_link', {id: ID.albert, root: ID.jean})).link, null);
            assert.equal((await api('person_link', {id: ID.jean, root: ID.jean})).link.kind, 'self');
            const many = await api('people_links', {ids: [ID.luc, ID.marie, ID.albert].join(','), root: ID.jean});
            assert.equal(many.links[ID.luc], 'cousin germain'); assert.equal(many.links[ID.marie], 'mère'); assert.ok(!(ID.albert in many.links));
        });

        await t('serveur : 🔍 filtres et tris de la colonne', async () => {
            const ids = async q => (await api('people', {limit: 180, kind: 'human', ...q})).people.map(x => Number(x.id));
            const fem = await ids({gender: 'female'}); assert.ok(fem.includes(ID.marie) && !fem.includes(ID.jean));
            const anc = await ids({sosa: 'in', root: ID.jean}); assert.deepStrictEqual([...anc].sort((a, b) => a - b), [ID.louis, ID.anne, ID.henri, ID.rose, ID.pierre, ID.marie, ID.jean].sort((a, b) => a - b));
            const out = await ids({sosa: 'out', root: ID.jean}); assert.ok(out.includes(ID.luc) && !out.includes(ID.pierre));
            const mom = await ids({branch: 'mother', root: ID.jean}); assert.deepStrictEqual([...mom].sort((a, b) => a - b), [ID.henri, ID.rose, ID.marie].sort((a, b) => a - b));
            assert.deepStrictEqual((await ids({century: '19'})).sort((a, b) => a - b), [ID.louis, ID.anne, ID.henri, ID.rose, ID.albert].sort((a, b) => a - b));
            const np = await ids({noparents: 1}); assert.ok(np.includes(ID.louis) && !np.includes(ID.jean));
            const ns = await ids({nosource: 1}); assert.ok(!ns.includes(ID.pierre) && ns.includes(ID.paul));
            assert.deepStrictEqual(await ids({label: ID.label}), [ID.luc]);
            const byBirth = await ids({sort: 'birth'}); assert.equal(byBirth[0], ID.albert); assert.equal(byBirth[1], ID.henri);
            const searched = await ids({q: 'MAZAUD', sort: 'birth_desc'}); assert.equal(searched[0], ID.luc);
            const qf = await ids({q: 'DURAND', gender: 'female'}); assert.ok(qf.includes(ID.marie) && !qf.includes(ID.henri));
        });

        await t('écran : colonne = barre commune (🔍 · Filtrer ▾ · Trier), plus de « ⌕ », attente commune', async () => {
            const src = fs.readFileSync(path.join(root, 'assets/js/app.js'), 'utf8');
            assert.ok(!/person-search-button/.test(src), '⌕ retiré'); assert.ok(!/loading-block">Chargement…/.test(src), 'C7');
            await p.waitForSelector('#sidebar-content .ui-listbar #person-search');
            assert.equal(await p.$('#person-search-button'), null);
            assert.ok(await p.$('#sidebar-content .ui-listbar-fbtn')); assert.ok(await p.$('#sidebar-content .ui-listbar-sort select'));
            await p.fill('#person-search', 'LACOMBE'); await p.press('#person-search', 'Enter');
            await p.waitForFunction(() => { const n = [...document.querySelectorAll('#person-list .person-list-item strong')].map(x => x.textContent); return n.length && n.every(x => /LACOMBE/.test(x)); }, null, {timeout: 15000});
            await p.fill('#person-search', ''); await p.press('#person-search', 'Enter');
            await p.waitForFunction(() => document.querySelectorAll('#person-list .person-list-item').length >= 13, null, {timeout: 15000});
        });

        await t('écran : Filtrer ▾ (genre) et Trier (naissance), retenus dans « genealogie-people-column »', async () => {
            await p.click('#sidebar-content .ui-listbar-fbtn');
            await p.waitForSelector('.ui-listbar-menu [data-lb-f="gender"]');
            await p.selectOption('.ui-listbar-menu [data-lb-f="gender"]', 'female');
            await p.waitForFunction(() => { const r = [...document.querySelectorAll('#person-list .person-list-item')]; return r.length && r.every(x => /DURAND|LACOMBE/.test(x.textContent)) && !r.some(x => /Henri|Albert/.test(x.textContent)); }, null, {timeout: 15000});
            await p.keyboard.press('Escape');
            await p.selectOption('#sidebar-content .ui-listbar-sort select', 'birth');
            await p.waitForFunction(() => /Rose/.test(document.querySelector('#person-list .person-list-item strong')?.textContent || ''), null, {timeout: 15000});
            const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-people-column')));
            assert.equal(saved.filters.gender, 'female'); assert.equal(saved.sort, 'birth');
            await p.evaluate(() => localStorage.setItem('genealogie-people-column', '{}')); await p.evaluate(() => window.LCNDA_APP.setModule('personnes'));
            await p.waitForFunction(() => document.querySelectorAll('#person-list .person-list-item').length >= 13, null, {timeout: 15000});
        });

        await t('écran : ⋯ et clic droit sur une ligne = le même menu (Ouvrir · Modifier · … · 🗑 Supprimer)', async () => {
            const row = `#person-list .person-list-item[data-person-id="${ID.luc}"]`;
            await p.hover(row); await p.click(`${row} [data-pa-row-more]`);
            await p.waitForSelector('.ui-actmenu');
            const a = await p.$$eval('.ui-actmenu button', b => b.map(x => x.textContent.trim()));
            assert.ok(/Ouvrir/.test(a[0]) && a.some(x => /Modifier/.test(x)) && /Supprimer/.test(a[a.length - 1]), a.join(' | '));
            assert.notEqual(await p.evaluate(() => window.LCNDA_APP.state.currentPersonId), ID.luc, '⋯ n’ouvre pas la fiche');
            await p.keyboard.press('Escape'); await p.waitForFunction(() => !document.querySelector('.ui-actmenu'));
            await p.click(row, {button: 'right'}); await p.waitForSelector('.ui-actmenu');
            const b = await p.$$eval('.ui-actmenu button', x => x.map(y => y.textContent.trim()));
            assert.deepStrictEqual(b, a); await p.keyboard.press('Escape');
        });

        await t('écran : 🧭 ton lien dans la colonne, l’en-tête (clic = le chemin) et les arbres', async () => {
            await p.waitForFunction(i => /cousin germain/.test(document.querySelector(`#person-list .person-list-item[data-person-id="${i}"] .pa-kin`)?.textContent || ''), ID.luc, {timeout: 15000});
            await openPerson(ID.luc);
            await p.waitForFunction(() => { const b = document.querySelector('[data-pa-kin-head]'); return b && !b.hidden && /cousin germain/.test(b.textContent); }, null, {timeout: 15000});
            assert.match(await p.textContent('[data-pa-kin-head]'), /par Pierre MAZAUD/);
            await p.click('[data-pa-kin-head]');
            await p.waitForSelector('[data-pa-kin-path] .pa-kin-chain .pa-kin-node');
            const chain = await p.$$eval('[data-pa-kin-path] .pa-kin-node strong', x => x.map(y => y.textContent));
            assert.equal(chain[0], 'Jean MAZAUD'); assert.equal(chain[chain.length - 1], 'Luc MAZAUD');
            await openPerson(ID.jean);
            await p.waitForFunction(() => [...document.querySelectorAll('.lineage-tree .pa-kin')].some(x => /grand-père/.test(x.textContent)), null, {timeout: 15000});
        });

        await t('écran : 🖨 Imprimer et ⤓ Exporter ▾ de la fiche (plus « impression du navigateur »)', async () => {
            assert.ok(await p.$('.person-hero [data-print-person]')); assert.ok(await p.$('.person-hero [data-pa-export-menu]'));
            assert.ok(!/impression du navigateur/.test(await p.textContent('#workspace')));
            await p.click('.person-hero [data-pa-export-menu]'); await p.waitForSelector('.ui-actmenu');
            const items = await p.$$eval('.ui-actmenu button', x => x.map(y => y.textContent));
            assert.ok(items.some(x => /PDF/.test(x)) && items.some(x => /JSON/.test(x)) && items.some(x => /Fiche familiale/.test(x)));
            await p.keyboard.press('Escape');
            await p.click('.person-hero [data-print-person]'); await p.waitForSelector('dialog.k-print[open]'); await p.click('dialog.k-print [data-k-x]');
        });

        await t('écran : 👪 fiche familiale (couple, mariage, enfants et leurs conjoints) imprimable', async () => {
            await openPerson(ID.paul); // Paul : une union sans conjoint connu, un enfant (Luc) marié à Julie
            await p.click('[data-pa-family-sheet]'); await p.waitForSelector('#pa-family-sheet-dialog .pa-fs-children tbody tr');
            const txt = await p.textContent('#pa-family-sheet-dialog');
            assert.match(txt, /Paul MAZAUD/); assert.match(txt, /Luc MAZAUD/); assert.match(txt, /Julie LACOMBE/);
            await p.click('#pa-family-sheet-dialog [data-pa-x]');
            await openPerson(ID.pierre);
            await p.click('[data-pa-family-sheet]'); await p.waitForSelector('#pa-family-sheet-dialog .pa-fs-union li');
            assert.match(await p.textContent('#pa-family-sheet-dialog .pa-fs-union'), /5 juin 1948/);
            await p.click('#pa-family-sheet-dialog [data-pa-fs-print]'); await p.waitForSelector('dialog.k-print[open]');
            await p.click('dialog.k-print [data-k-x]'); await p.click('#pa-family-sheet-dialog [data-pa-x]');
        });

        await t('écran : ⚡ ＋ Famille (père, mère, mariage, enfants) puis ↶ Annuler', async () => {
            const before = (await api('people', {limit: 250})).people.length;
            await p.click('#pa-quick-family'); await p.waitForSelector('#pa-quick-family-dialog[open]');
            await p.evaluate(() => { const f = document.querySelector('#pa-quick-family-dialog form'); const set = (n, v) => { f.elements[n].value = v; }; set('qf_father', 'txt:Marc DURAND'); set('qf_mother', 'txt:Lise LACOMBE'); set('qf_child_0', 'txt:Léo'); set('qf_child_1', 'txt:Zoé DURAND'); });
            await p.fill('#pa-quick-family-dialog [name="qf_marr_date"]', '3 mai 1980'); await p.fill('#pa-quick-family-dialog [name="qf_child_0_date"]', '1981');
            await p.selectOption('#pa-quick-family-dialog [name="qf_child_1_gender"]', 'female');
            await p.click('#pa-quick-family-dialog button[type="submit"]');
            await p.waitForFunction(() => !document.querySelector('#pa-quick-family-dialog'), null, {timeout: 15000});
            const all = (await api('people', {limit: 250})).people; assert.equal(all.length, before + 4);
            const leo = all.find(x => x.first_name === 'Léo'); assert.equal(leo.last_name, 'DURAND'); assert.equal(String(leo.birth_year), '1981');
            const d = await api('person', {id: Number(leo.id)}); assert.deepStrictEqual(d.parents.map(x => x.first_name).sort(), ['Lise', 'Marc']);
            const zoe = all.find(x => x.first_name === 'Zoé'); assert.equal(zoe.gender, 'female');
            const marc = await api('person', {id: Number(all.find(x => x.first_name === 'Marc').id)});
            assert.ok(marc.events.some(e => e.gedcom_tag === 'MARR' && Number(e.year) === 1980), JSON.stringify(marc.events));
            await clickToast('↶ Annuler');
            await p.waitForFunction(async n => (await window.LCNDA_APP.api('people', {limit: 250})).people.length === n, before, {timeout: 15000});
        });

        await t('écran : 🔒 événement confidentiel et 📝 note de recherche (fenêtre de l’événement)', async () => {
            await openPerson(ID.jean);
            await p.click(`.event-row[data-event-id="${ID.resi}"] [data-edit-event="${ID.resi}"]`);
            await p.waitForSelector('#event-dialog[open] [name="is_private"]');
            assert.equal(await p.isChecked('#event-dialog [name="is_private"]'), false);
            await p.check('#event-dialog [name="is_private"]'); await p.fill('#event-dialog [name="research_note"]', 'vérifier la cote 3 E 125');
            await p.click('#event-submit');
            await p.waitForFunction(i => document.querySelector(`.event-row[data-event-id="${i}"] .pa-private-badge`), ID.resi, {timeout: 15000});
            assert.ok(await p.$(`.event-row[data-event-id="${ID.resi}"] [data-pa-note]`));
            const ev = (await api('person', {id: ID.jean})).events.find(e => Number(e.id) === ID.resi);
            assert.equal(Number(ev.is_private), 1); assert.equal(ev.research_note, 'vérifier la cote 3 E 125');
            await p.click(`.event-row[data-event-id="${ID.resi}"] [data-edit-event="${ID.resi}"]`);
            await p.waitForSelector('#event-dialog[open]'); assert.equal(await p.isChecked('#event-dialog [name="is_private"]'), true);
            assert.equal(await p.inputValue('#event-dialog [name="research_note"]'), 'vérifier la cote 3 E 125');
            await p.click('#event-dialog button[value="cancel"].secondary');
            const withNote = (await api('people', {research: 1, limit: 50})).people.map(x => Number(x.id)); assert.deepStrictEqual(withNote, [ID.jean]);
        });

        await t('écran : 🖼 âge sur la photo datée', async () => {
            await p.waitForSelector('.pa-media-age'); assert.match(await p.textContent('.pa-media-age'), /Jean avait 20 ans/);
        });

        await t('écran : 🧮 deux naissances → « Garder celle-ci », l’autre devient une version ; ↶ Annuler', async () => {
            assert.equal(await p.$$eval('.event-row[data-event-tag="BIRT"] .pa-dup-badge', x => x.length), 2);
            const keep = await p.$eval('.event-row[data-event-tag="BIRT"]', r => Number(r.dataset.eventId));
            await p.click(`.event-row[data-event-id="${keep}"] [data-pa-keep-event]`);
            await p.waitForFunction(() => document.querySelectorAll('.event-row[data-event-tag="BIRT"]').length === 1 && !document.querySelector('.pa-dup-badge'), null, {timeout: 15000});
            const kept = (await api('person', {id: ID.jean})).events.find(e => e.gedcom_tag === 'BIRT');
            assert.match(kept.date_alternative, /Autre version : 1951 à Paris/);
            await clickToast('↶ Annuler');
            await p.waitForFunction(() => document.querySelectorAll('.event-row[data-event-tag="BIRT"]').length === 2, null, {timeout: 15000});
            assert.equal((await api('person', {id: ID.jean})).events.find(e => Number(e.id) === keep).date_alternative, '');
        });

        await t('écran : 🕘 comparer avec maintenant et ↩ remettre un seul champ', async () => {
            await post('restore_field', {entity_type: 'person', id: ID.jean, field: 'occupation', value: 'menuisier'});
            await openPerson(ID.jean);
            await p.click('[data-person-history]'); await p.waitForSelector('#person-history-dialog [data-pa-history-compare]');
            await p.click('#person-history-dialog [data-pa-history-compare]');
            await p.waitForSelector('#person-history-dialog .pa-diff [data-pa-restore-field="occupation"]');
            assert.match(await p.textContent('#person-history-dialog .pa-diff'), /menuisier/);
            await p.click('#person-history-dialog [data-pa-restore-field="occupation"]');
            await p.waitForFunction(async i => ((await window.LCNDA_APP.api('person', {id: i})).person.occupation || '') === '', ID.jean, {timeout: 15000});
            await p.click('#person-history-dialog [data-close-person-history].button');
        });

        await t('écran : ⌘Z défait tout de suite (sans fenêtre), avec « ↷ Rétablir »', async () => {
            await post('restore_field', {entity_type: 'person', id: ID.jean, field: 'occupation', value: 'charron'});
            await p.click('.person-hero h2'); await p.keyboard.press('Control+z');
            await p.waitForFunction(async i => ((await window.LCNDA_APP.api('person', {id: i})).person.occupation || '') === '', ID.jean, {timeout: 15000});
            assert.equal(await p.$('dialog.confirm-dialog[open], dialog[open] .confirm-box'), null);
            await p.waitForFunction(() => [...document.querySelectorAll('.ui-toast')].some(x => /Annulé/.test(x.textContent) && /Rétablir/.test(x.textContent)), null, {timeout: 10000});
            await clickToast('↷ Rétablir');
            await p.waitForFunction(async i => (await window.LCNDA_APP.api('person', {id: i})).person.occupation === 'charron', ID.jean, {timeout: 15000});
        });

        await t('écran : R7 retirer un lien de parenté = tout de suite + ↶ Annuler', async () => {
            await openPerson(ID.luc);
            await p.click(`[data-remove-relation="spouse"][data-related-id="${ID.julie}"]`);
            await p.waitForFunction(i => !window.LCNDA_APP.state.currentPerson.partners.some(x => x.id === i), ID.julie, {timeout: 15000});
            await clickToast('↶ Annuler');
            await p.waitForFunction(i => window.LCNDA_APP.state.currentPerson.partners.some(x => x.id === i), ID.julie, {timeout: 15000});
        });

        await t('🧭 lien très long (arrière-arrière-arrière-grand-père · par …) : le nom garde sa largeur (1440 et 1024 px) ; ⋯ le masque, retenu, ↶ Annuler', async () => {
            const r = await post('add_relation', {person_id: ID.louis, related_id: ID.g3, relation_type: 'parent'}); assert.ok(!r.error, r.error);
            const l = await api('person_link', {id: ID.g5, root: ID.jean}); assert.equal(l.link.label, 'arrière-arrière-arrière-grand-père');
            await p.evaluate(() => localStorage.removeItem('genealogie-kin-head'));
            const badge = '[data-pa-kin-head]', shown = () => p.waitForFunction(() => { const b = document.querySelector('[data-pa-kin-head]'); return b && !b.hidden && /arrière-arrière-arrière-grand-père/i.test(b.textContent); }, null, {timeout: 15000});
            for (const width of [1440, 1024]) {
                await p.setViewportSize({width, height: 900}); await openPerson(ID.g5); await shown(); await sleep(200); 
                const m = await p.evaluate(() => { const h = document.querySelector('.person-hero'), n = h.querySelector('h2'), b = h.querySelector('[data-pa-kin-head]'); const lh = parseFloat(getComputedStyle(n).lineHeight) || parseFloat(getComputedStyle(n).fontSize) * 1.25;
                    return {hero: h.getBoundingClientRect().width, name: n.getBoundingClientRect().width, lines: Math.round(n.getBoundingClientRect().height / lh), words: n.textContent.trim().split(/[\s-]+/).length, badge: b.getBoundingClientRect().width, over: document.documentElement.scrollWidth - document.documentElement.clientWidth}; });
                assert.ok(m.name >= 0.4 * m.hero, `${width} px : nom ${Math.round(m.name)} / en-tête ${Math.round(m.hero)}`);
                assert.ok(m.lines <= m.words, `${width} px : nom coupé au milieu des mots (${m.lines} lignes pour ${m.words} morceaux)`);
                assert.ok(m.badge <= m.hero, `${width} px : étiquette plus large que l’en-tête`); assert.ok(m.over <= 0, `${width} px : la page déborde de ${m.over} px`);
            }
            await p.setViewportSize({width: 1440, height: 900});
            const menuItem = async label => { await p.click('.person-hero [data-fsec-hero-more]'); await p.waitForSelector('.ui-actmenu');
                await p.evaluate(l => [...document.querySelectorAll('.ui-actmenu button')].find(b => b.textContent.includes(l)).click(), label); };
            await menuItem('Masquer le lien de parenté');
            await p.waitForFunction(() => document.querySelector('[data-pa-kin-head]').hidden, null, {timeout: 10000});
            assert.equal(await p.evaluate(() => localStorage.getItem('genealogie-kin-head')), '0');
            await openPerson(ID.luc); await openPerson(ID.g5); await sleep(400);
            assert.equal(await p.$eval(badge, b => b.hidden), true, 'choix retenu en rouvrant la fiche');
            await clickToast('↶ Annuler'); await shown();
            assert.notEqual(await p.evaluate(() => localStorage.getItem('genealogie-kin-head')), '0');
            await menuItem('Masquer le lien de parenté'); await p.waitForFunction(() => document.querySelector('[data-pa-kin-head]').hidden, null, {timeout: 10000});
            await p.click('.person-hero [data-fsec-hero-more]'); await p.waitForSelector('.ui-actmenu');
            assert.ok(await p.evaluate(() => [...document.querySelectorAll('.ui-actmenu button')].some(b => b.textContent.includes('Afficher le lien de parenté'))));
            await p.keyboard.press('Escape'); await menuItem('Afficher le lien de parenté'); await shown();
            assert.equal(await p.evaluate(() => localStorage.getItem('genealogie-kin-head')), '1');
        });

        await t('R5 : ⌘⇧N / ⌘P / ⌘E passent par LCNDA_EXT.tabShortcuts[onglet] ; « / » va dans la colonne ; ⌘1 = 1er onglet', async () => {
            await p.evaluate(() => { window.__r5 = []; window.LCNDA_EXT.tabShortcuts.listes = {new: () => window.__r5.push('new'), print: () => window.__r5.push('print'), export: () => window.__r5.push('export')}; window.LCNDA_APP.setModule('listes'); });
            await p.waitForFunction(() => window.LCNDA_APP.state.module === 'listes');
            await sleep(600); await p.click('#workspace', {position: {x: 5, y: 5}}).catch(() => {});
            await p.evaluate(() => document.activeElement?.blur?.());
            for (const k of ['Control+Shift+N', 'Control+p', 'Control+e']) await p.keyboard.press(k);
            assert.deepStrictEqual(await p.evaluate(() => window.__r5), ['new', 'print', 'export']);
            await p.evaluate(() => window.LCNDA_APP.setModule('personnes'));
            await p.waitForSelector('#sidebar-content #person-search');
            await p.evaluate(() => document.activeElement?.blur?.()); await p.keyboard.press('/');
            assert.equal(await p.evaluate(() => document.activeElement?.id), 'person-search');
            await p.evaluate(() => document.activeElement?.blur?.()); await p.keyboard.press('Control+1');
            const first = await p.evaluate(() => [...document.querySelectorAll('.nav-item[data-module]')].find(x => x.offsetParent)?.dataset.module);
            await p.waitForFunction(m => window.LCNDA_APP.state.module === m || (m === 'animaux' && window.LCNDA_APP.state.module === 'personnes'), first, {timeout: 10000});
            await p.evaluate(() => window.LCNDA_APP.setModule('personnes'));
        });

        await t('R8 : un réglage « lcnda-* » passe sous « genealogie-* » (repris une fois, l’ancien nom marche encore)', async () => {
            await p.evaluate(() => { localStorage.removeItem('lcnda-settings-renamed-v1'); localStorage.removeItem('genealogie-cite-style'); localStorage['lcnda-cite-style'] = 'apa'; });
            await boot();
            const r = await p.evaluate(() => ({n: localStorage.getItem('genealogie-cite-style'), o: localStorage.getItem('lcnda-cite-style'), keys: Array.from({length: localStorage.length}, (_, i) => localStorage.key(i)), list: window.LCNDA_SETTING_RENAMES['lcnda-cite-style']}));
            assert.equal(r.n, 'apa'); assert.equal(r.o, 'apa'); assert.ok(!r.keys.includes('lcnda-cite-style'), 'ancienne clé retirée'); assert.equal(r.list, 'genealogie-cite-style');
            await p.evaluate(() => localStorage.setItem('lcnda-cite-style', 'mla'));
            assert.equal(await p.evaluate(() => localStorage.getItem('genealogie-cite-style')), 'mla');
            await p.evaluate(() => localStorage.setItem('genealogie-cite-style', 'chicago'));
            assert.equal(await p.evaluate(() => localStorage.getItem('lcnda-cite-style')), 'chicago');
        });

        await t('🐾 courbe de poids tirée des pesées de la santé', async () => {
            for (const [d, g] of [['01/02/2026', 3200], ['01/06/2026', 4100]]) { const r = await post('suivi_write', {op: 'save_health', pet_id: ID.pet, date: d, weight_g: g}); assert.ok(!r.error, r.error); }
            await openPerson(ID.felix);
            await p.waitForSelector('[data-pa-growth] .pa-growth-svg circle', {timeout: 20000});
            assert.equal(await p.$$eval('[data-pa-growth] .pa-growth-svg circle', x => x.length), 2);
            assert.match(await p.textContent('[data-pa-growth]'), /2 pesée/);
        });

        await t('R6 consultation : rien de confidentiel, rien à modifier', async () => {
            assert.ok(!(await post('kiosk_enter', {password: '1234'})).error);
            await boot(); await p.waitForFunction(() => document.body.classList.contains('is-kiosk'), null, {timeout: 15000});
            await openPerson(ID.jean);
            assert.equal(await p.$(`.event-row[data-event-id="${ID.resi}"]`), null, 'événement confidentiel caché');
            assert.ok(!(await api('person', {id: ID.jean})).events.some(e => Number(e.id) === ID.resi), 'pas envoyé par le serveur');
            assert.equal(await p.$('[data-pa-quick-family]'), null); assert.equal(await p.$('.pa-keep-btn'), null);
            assert.equal(await p.isVisible('#pa-quick-family').catch(() => false), false);
            await p.click(`#person-list .person-list-item[data-person-id="${ID.luc}"]`, {button: 'right'}); await p.waitForSelector('.ui-actmenu');
            const items = await p.$$eval('.ui-actmenu button', x => x.map(y => y.textContent));
            assert.ok(!items.some(x => /Supprimer|Modifier/.test(x)), items.join('|')); await p.keyboard.press('Escape');
            const fs2 = await api('family_sheet', {id: ID.pierre}); assert.ok(fs2.families.length);
            await p.evaluate(async () => { await fetch('api.php?action=kiosk_exit', {method: 'POST', headers: {'Content-Type': 'application/json', 'X-CSRF-Token': window.LCNDA_APP.state.csrf}, body: JSON.stringify({password: '1234', csrf: window.LCNDA_APP.state.csrf})}); });
        });

        await t('R12 : 390 px, la fiche et la colonne ne débordent pas', async () => {
            const ph = await (await browser.newContext({viewport: {width: 390, height: 844}})).newPage();
            await ph.route(url => new URL(url).pathname === '/', async route => { const r = await route.fetch(); const body = (await r.text()).replace('</head>', `<style>${css}</style></head>`); await route.fulfill({response: r, body, headers: {...r.headers(), 'content-length': String(Buffer.byteLength(body))}}); });
            ph.on('pageerror', e => errs.push(e.message));
            await ph.goto(base + '#personnes'); await ph.waitForFunction(i => window.LCNDA_APP?.state?.csrf && (window.LCNDA_APP.openPersonById(i), true), ID.jean, {timeout: 30000});
            await ph.waitForFunction(i => window.LCNDA_APP.state.currentPerson?.person?.id === i && document.querySelector('.pa-family-bar'), ID.jean, {timeout: 20000});
            await sleep(500);
            const w = await ph.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth));
            assert.ok(w <= 392, `largeur ${w}`);
            await ph.close();
        });

        await t('aucune erreur JavaScript', async () => { assert.deepStrictEqual(errs.filter(e => !/ResizeObserver/.test(e)), []); });
    } finally {
        await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true});
    }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})();
