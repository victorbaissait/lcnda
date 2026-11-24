#!/usr/bin/env node
/* 🧰 Listes → Données (assets/js/app-listes-donnees.js, lib/listes_donnees.php, groupe « Données » de app-listes.js).
 *  1. le serveur : ld_query / ld_facet / ld_status sur le pack « Histoire du lieu » (gares autour de Tulle, CatNat d'une commune,
 *     vendanges d'une année, population, inondations) ;
 *  2. l'écran : une liste inventée enregistrée APRÈS le chargement (châteaux fictifs) — critères combinés (liste avec nombres,
 *     nombres, texte), 📅 Période, 📍 Autour de… (choix d'un lieu), tri, carte, ★ recherche enregistrée (↶), ⤓ CSV, 📤, 🖨 ;
 *     une liste serveur (gares), l'offre « ⤓ Installer » (pack absent), le sommaire et ses liens, largeur de téléphone (390 px).
 * Personnes inventées : MAZAUD, LACOMBE, DURAND. Le pack : /tmp/histoire-pack/histoire-locale.sqlite (ou LCNDA_HIST_DB=…) —
 *   fabriqué par python3 scripts/histoire/build-histoire.py --dossier /tmp/histoire-pack ; sans lui, la partie serveur est sautée.
 *   node tests/test-listes-donnees.js */
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
const HIST = process.env.LCNDA_HIST_DB || '/tmp/histoire-pack/histoire-locale.sqlite';

(async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-ld-'));
    fs.mkdirSync(path.join(tmp, 'media'), {recursive: true});
    const hasPack = fs.existsSync(HIST);
    if (hasPack) { fs.mkdirSync(path.join(tmp, 'histoire')); fs.copyFileSync(HIST, path.join(tmp, 'histoire', 'histoire-locale.sqlite')); }
    else console.log('… pas de pack Histoire du lieu : la partie serveur est sautée');
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4', GENEALOGY_TEST: '1'};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start) VALUES(1,'Pierre','MAZAUD','male','deceased',1),(2,'Jeanne','LACOMBE','female','deceased',0),(3,'Louis','DURAND','male','deceased',0)");
$pdo->exec("INSERT INTO places(id,name,county,country,latitude,longitude,admin4_code) VALUES(1,'Tulle','Corrèze','France',45.2675,1.7711,'19272'),(2,'Brive-la-Gaillarde','Corrèze','France',45.1589,1.5321,'19031'),(3,'Naves','Corrèze','France',45.3133,1.7672,'19146'),(4,'Nice','Alpes-Maritimes','France',43.7031,7.2661,'06088')");
$t = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn();
$ins = $pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,date_text,year,sort_date,place_id) VALUES('person',?,?,?,?,?,?)");
$ins->execute([1,$t('BIRT'),'12 mars 1870',1870,'1870-03-12',1]); $ins->execute([2,$t('BIRT'),'1872',1872,'1872',3]); $ins->execute([3,$t('BIRT'),'1880',1880,'1880',2]);
echo json_encode(['ok' => 1]);`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0 || !/"ok"/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
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
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_APP?.defaultListTypes, null, {timeout: 30000});
        // index.php ne charge pas encore app-listes-donnees.js : on l'ajoute (comme le fera la balise <script>)
        if (!(await p.evaluate(() => !!window.LCNDA_EXT?.dataListsEngine))) await p.addScriptTag({url: base + 'assets/js/app-listes-donnees.js'});
        await p.waitForFunction(() => window.LCNDA_EXT?.dataListsEngine && window.LCNDA_APP.defaultListTypes.some(x => x[0] === 'data_hist_gares'), null, {timeout: 10000});
        const api = (x, q = {}) => p.evaluate(([y, z]) => window.LCNDA_APP.api(y, z).catch(e => ({error: e.message})), [x, q]);
        const ldq = (src, query) => api('ld_query', {src, query: JSON.stringify(query)});
        const count = () => p.textContent('[data-ld-count]');
        const waitCount = async re => { await p.waitForFunction(s => new RegExp(s).test(document.querySelector('[data-ld-count]')?.textContent || ''), re.source, {timeout: 15000}); return count(); };
        const clearAll = async () => { while (await p.$('[data-ld-chip]')) { const n = await p.$$eval('[data-ld-chip]', a => a.length); await p.click('[data-ld-chip]'); await p.waitForFunction(k => document.querySelectorAll('[data-ld-chip]').length < k, n); } };
        const rowsText = () => p.$$eval('.ld-table tbody tr', trs => trs.map(tr => tr.textContent));

        /* ═════════ 1. le serveur ═════════ */
        if (hasPack) {
            await t('serveur : ld_status dit ce qui est installé (Histoire du lieu oui, prénoms et bases non)', async () => {
                const s = await api('ld_status'); assert.strictEqual(s.installed.hist_gares, true); assert.strictEqual(s.installed.pp_prenoms, false); assert.strictEqual(s.installed.bo_mpf, false);
            });
            await t('serveur : gares à 15 km de Tulle, rangées par distance, avec la distance', async () => {
                const r = await ldq('hist_gares', {near: {lat: 45.2675, lon: 1.7711, km: 15}, limit: 500});
                assert.ok(r.total > 0 && r.rows.length === r.total, JSON.stringify(r).slice(0, 200));
                assert.ok(r.rows.every(x => x._km <= 15)); assert.ok(r.rows.every((x, i, a) => !i || a[i - 1]._km <= x._km));
                assert.ok(r.rows.some(x => /Tulle/.test(x.name)));
            });
            await t('serveur : filtres combinés (CatNat de Tulle, inondations seulement, à partir de 2000) + choix avec leur nombre', async () => {
                const all = await ldq('hist_catnat', {filters: [{key: 'commune', op: 'eq', value: 'Tulle'}], limit: 200});
                const some = await ldq('hist_catnat', {filters: [{key: 'commune', op: 'eq', value: 'Tulle'}, {key: 'risk', op: 'in', value: ['Inondations et coulées de boue']}, {key: 'year', op: 'gte', value: 2000}], limit: 200});
                assert.ok(all.total >= 5 && some.total > 0 && some.total < all.total, `${all.total} / ${some.total}`);
                assert.ok(some.rows.every(x => x.year >= 2000 && x.code === '19272' && x.lat === 45.2675), 'position venue du lieu de la base');
                const f = await api('ld_facet', {src: 'hist_catnat', key: 'risk', query: JSON.stringify({filters: [{key: 'commune', op: 'eq', value: 'Tulle'}]})});
                assert.ok(f.values.length >= 1 && f.values[0][1] > 0 && f.values.reduce((a, v) => a + v[1], 0) === all.total);
            });
            await t('serveur : vendanges en 1811 (période), population (PHP), inondations autour de Tulle, tri, page', async () => {
                const v = await ldq('hist_vendanges', {years: {from: 1811, to: 1811, mode: 'in'}, sort: 'diff', dir: 'asc', limit: 50});
                assert.ok(v.total >= 10 && v.rows.every(x => x.year === 1811) && v.rows[0].diff <= v.rows[v.rows.length - 1].diff && /^1811-\d\d-\d\d$/.test(v.rows[0].date));
                const c = await ldq('hist_communes', {q: 'tulle', filters: [{key: 'dep', op: 'in', value: ['19']}]});
                assert.strictEqual(c.total, 1); assert.strictEqual(c.rows[0].p1876, 15342); assert.strictEqual(c.rows[0].evolution, -13);
                const b = await ldq('hist_crues', {near: {lat: 45.2675, lon: 1.7711, km: 30}, years: {from: 1900, to: 2000, mode: 'within'}});
                assert.ok(b.total > 0 && b.rows.every(x => x.year >= 1900 && x.year <= 2000 && x._km <= 30));
                const pg = await ldq('hist_seismes', {sort: 'year', limit: 5, offset: 5}); assert.strictEqual(pg.rows.length, 5); assert.ok(pg.total > 1000);
                assert.match((await api('ld_query', {src: 'nope'})).error || '', /inconnue/);
            });
        }

        /* ═════════ 2. l'écran ═════════ */
        // une liste inventée, enregistrée après le chargement (comme le feront les autres fichiers de données)
        await p.evaluate(() => {
            window.__opened = [];
            const rows = [
                {name: 'Château de Mazaud', from: 1450, to: 1793, state: 'ruine', country: 'France', commune: 'Naves', open: true, lat: 45.32, lon: 1.77},
                {name: 'Tour Lacombe', from: 1200, to: null, state: 'debout', country: 'France', commune: 'Tulle', open: false, lat: 45.27, lon: 1.78},
                {name: 'Manoir Durand', from: 1600, to: 1944, state: 'disparu', country: 'France', commune: 'Brive-la-Gaillarde', open: true, lat: 45.16, lon: 1.53},
                {name: 'Castel Durand', from: 1300, to: 1500, state: 'ruine', country: 'Italie', commune: 'Nice', open: false, lat: 43.70, lon: 7.27},
                {name: 'Fort Mazaud', from: 1750, to: 1800, state: 'debout', country: 'France', commune: 'Tulle', open: true, lat: 45.26, lon: 1.77},
            ];
            (window.LCNDA_EXT.dataLists = window.LCNDA_EXT.dataLists || []).push({id: 'test_chateaux', icon: '🏰', label: 'Châteaux inventés', group: 'Le lieu', source: 'Jeu d’essai',
                load: async () => rows, fields: [{key: 'name', label: 'Nom', type: 'text'}, {key: 'from', label: 'Construit', type: 'year'}, {key: 'to', label: 'Détruit', type: 'year'},
                    {key: 'state', label: 'État', type: 'enum', values: ['ruine', 'debout', 'disparu']}, {key: 'country', label: 'Pays', type: 'enum'}, {key: 'commune', label: 'Commune', type: 'place'}, {key: 'open', label: 'Ouvert au public', type: 'bool'}],
                period: r => [r.from, r.to ?? 2026], geo: r => [r.lat, r.lon], open: r => window.__opened.push(r.name)});
        });
        const openList = async key => { await p.evaluate(k => { const A = window.LCNDA_APP; A.state.listType = k; A.setModule('listes'); }, key); await p.waitForSelector(`[data-side-value="${key}"].is-active`, {timeout: 15000}); };

        await t('Listes : le groupe « 🧰 Données » avec le sommaire, la liste inventée (venue après) et celles des données de l’app', async () => {
            await openList('data_test_chateaux');
            await p.waitForSelector('[data-ld-page="test_chateaux"] [data-ld-count]', {state: 'attached'});
            const grp = await p.$eval('[data-mt-group="g_data"]', d => [...d.querySelectorAll('[data-side-value]')].map(b => b.dataset.sideValue));
            assert.ok(grp.includes('donnees') && grp.includes('data_test_chateaux') && grp.includes('data_hist_gares') && grp.includes('data_prix_europe'), grp.join(','));
            assert.ok(!grp.includes('data_elections'), 'élections éteintes : pas montrées');
            assert.match(await waitCount(/5 lignes/), /5 lignes/);
        });
        await t('critère « liste » avec les nombres (État : ruine) puis nombres (Construit ≥ 1400) : combinés', async () => {
            await p.click('[data-ld-add]'); await p.click('.ui-actmenu-i:has-text("État")');
            await p.waitForSelector('[data-ld-ed-list] input[value="ruine"]');
            assert.match(await p.textContent('[data-ld-ed-list]'), /ruine\s*2/);
            await p.check('[data-ld-ed-list] input[value="ruine"]'); await p.click('.ld-ed-form button[type="submit"]');
            assert.match(await waitCount(/^2 lignes/), /2 lignes/);
            await p.click('[data-ld-add]'); await p.click('.ui-actmenu-i:has-text("Construit")');
            await p.fill('.ld-ed-form input[name="from"]', '1400'); await p.click('.ld-ed-form button[type="submit"]');
            await waitCount(/^1 ligne/);
            assert.match((await rowsText())[0], /Château de Mazaud/);
            assert.match(await p.textContent('[data-ld-chips]'), /État : ruine.*Construit ≥ 1400/s);
        });
        await t('pastille × : le critère s’en va ; texte « commence par » ; « oui / non »', async () => {
            await p.click('[data-ld-chip="crit:1"]'); await waitCount(/^2 lignes/);
            await clearAll(); await waitCount(/^5 lignes/);
            await p.click('[data-ld-add]'); await p.click('.ui-actmenu-i:has-text("Nom")');
            await p.selectOption('.ld-ed-form select[name="op"]', 'starts'); await p.fill('.ld-ed-form input[name="v"]', 'chateau'); await p.click('.ld-ed-form button[type="submit"]');
            await waitCount(/^1 ligne/);
            await clearAll(); await waitCount(/^5 lignes/);
            await p.click('[data-ld-add]'); await p.click('.ui-actmenu-i:has-text("Ouvert au public")'); await p.click('.ld-ed-form button[type="submit"]');
            await waitCount(/^3 lignes/);
            await p.click('[data-ld-chip="crit:0"]'); await waitCount(/^5 lignes/);
        });
        await t('🧩 filtre en plus (LCNDA_EXT.dataListFilters) : offert aux listes avec une position, vérifié sur la position', async () => {
            await p.evaluate(() => { window.__xfPrep = 0; (window.LCNDA_EXT.dataListFilters = window.LCNDA_EXT.dataListFilters || []).push({id: 'test_zone', icon: '🧩', label: 'Dans la zone d’essai', needs: 'geo',
                options: async () => [{value: 'nord', label: 'Au nord de 45°'}, {value: 'sud', label: 'Au sud de 45°'}], prepare: async () => { window.__xfPrep++; },
                test: ([lat], v) => (v === 'nord' ? lat > 45 : lat <= 45)}); });
            await p.click('[data-ld-add]');
            const items = await p.$$eval('.ui-actmenu-i', a => a.map(x => x.textContent));
            assert.ok(items.some(x => /Dans la zone d’essai/.test(x)), items.join('|'));
            if (await p.evaluate(() => (window.LCNDA_EXT.dataListFilters || []).some(f => f.id === 'territoire'))) assert.ok(items.some(x => /Dans le territoire/.test(x)), 'le filtre « territoire » de heritage-territoires.js');
            await p.click('.ui-actmenu-i:has-text("Dans la zone d’essai")');
            await p.waitForSelector('.ld-ed-form select[name="v"] option[value="sud"]', {state: 'attached'}); await p.selectOption('.ld-ed-form select[name="v"]', 'sud'); await p.click('.ld-ed-form button[type="submit"]');
            await waitCount(/^1 ligne/); assert.match((await rowsText())[0], /Castel Durand/);
            assert.match(await p.textContent('[data-ld-chips]'), /Dans la zone d’essai : Au sud de 45°/);
            assert.ok(await p.evaluate(() => window.__xfPrep) > 0, 'prepare() appelé');
            await p.click('[data-ld-chip="crit:0"]'); await waitCount(/^5 lignes/);
        });
        await t('📅 Période : en l’an 1780 / entièrement entre 1250 et 1800 / qui touche 1500–1550', async () => {
            await p.click('[data-ld-period]'); await p.check('.ld-ed-form input[value="in"]'); await p.fill('.ld-ed-form input[name="from"]', '1780'); await p.click('.ld-ed-form button[type="submit"]');
            await waitCount(/^4 lignes/); // tout sauf Castel Durand (1300–1500)
            await p.click('[data-ld-period]'); await p.check('.ld-ed-form input[value="within"]'); await p.fill('.ld-ed-form input[name="from"]', '1250'); await p.fill('.ld-ed-form input[name="to"]', '1800'); await p.click('.ld-ed-form button[type="submit"]');
            await waitCount(/^3 lignes/); // Mazaud 1450–1793, Castel 1300–1500, Fort 1750–1800
            await p.click('[data-ld-period]'); await p.check('.ld-ed-form input[value="overlap"]'); await p.fill('.ld-ed-form input[name="from"]', '1500'); await p.fill('.ld-ed-form input[name="to"]', '1550'); await p.click('.ld-ed-form button[type="submit"]');
            await waitCount(/^3 lignes/); // Mazaud, Lacombe, Castel
            await p.click('[data-ld-chip="period"]'); await waitCount(/^5 lignes/);
        });
        await t('📍 Autour de Tulle à 10 km (choix du lieu dans le menu des lieux) : colonne Distance, rangée par distance', async () => {
            await p.click('[data-ld-near]');
            await p.fill('.ld-ed-form .pk-input', 'Tulle');
            await p.waitForSelector('.pk-item.pk-row', {timeout: 10000}); await p.click('.pk-item.pk-row:has-text("Tulle")');
            await p.fill('.ld-ed-form input[name="km"]', '10'); await p.click('.ld-ed-form button[type="submit"]');
            await waitCount(/^3 lignes/);
            const heads = await p.$$eval('.ld-table thead th', a => a.map(x => x.textContent)); assert.ok(heads.some(h => /Distance/.test(h)), heads.join('|'));
            const km = await p.$$eval('.ld-table tbody tr', trs => trs.map(tr => Number(tr.querySelector('td.ld-num:last-of-type')?.dataset.sortValue)));
            assert.ok(km.every((x, i) => !i || km[i - 1] <= x), km.join(','));
            assert.match(await p.textContent('[data-ld-chips]'), /10 km autour de Tulle/);
        });
        await t('tri : clic sur « Nom » (A → Z puis Z → A), clic sur la ligne → ouvre', async () => {
            await p.click('[data-ld-sort="name"]'); await p.waitForSelector('[data-ld-sort="name"] .sort-mark');
            let r = await rowsText(); assert.match(r[0], /Château de Mazaud/);
            await p.click('[data-ld-sort="name"]'); await p.waitForFunction(() => /↓/.test(document.querySelector('[data-ld-sort="name"]').textContent));
            r = await rowsText(); assert.match(r[0], /Tour Lacombe/);
            await p.click('[data-ld-open="0"]'); assert.deepStrictEqual(await p.evaluate(() => window.__opened), ['Tour Lacombe']);
        });
        await t('🗺 Carte : un point par ligne + le lieu choisi ; un clic sur un point ouvre', async () => {
            await p.click('[data-ld-view="map"]'); await p.waitForSelector('.ld-results .h-map-point');
            assert.strictEqual(await p.$$eval('.ld-results .h-map-point', a => a.length), 4);
            await p.evaluate(() => document.querySelector('[data-ld-map-row="0"]').dispatchEvent(new MouseEvent('click', {bubbles: true})));
            assert.strictEqual((await p.evaluate(() => window.__opened)).length, 2);
            await p.click('[data-ld-view="table"]'); await p.waitForSelector('.ld-table');
        });
        await t('★ Enregistrer cette recherche → au-dessus de la liste ; on la rappelle ; × l’oublie (↶ Annuler la remet)', async () => {
            await p.click('[data-ld-save]'); await p.fill('.ask-text-dialog input', 'Autour de Tulle'); await p.click('.ask-text-dialog [data-ask-ok]');
            await p.waitForSelector('[data-ld-saved-go="0"]');
            const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-listes-donnees')));
            assert.strictEqual(saved.saved.test_chateaux[0].name, 'Autour de Tulle'); assert.strictEqual(saved.saved.test_chateaux[0].st.near.km, 10);
            await clearAll(); await waitCount(/^5 lignes/);
            await p.click('[data-ld-saved-go="0"]'); await waitCount(/^3 lignes/);
            await p.click('[data-ld-saved-x="0"]'); await p.waitForFunction(() => !document.querySelector('[data-ld-saved-go]'));
            await p.click('.ui-toast button:has-text("Annuler")'); await p.waitForFunction(() => JSON.parse(localStorage.getItem('genealogie-listes-donnees') || '{}').saved?.test_chateaux?.length === 1);
        });
        await t('⤓ Exporter (CSV), 📤 Envoyer vers… (lignes pour le Tableur), 🖨 Imprimer : les lignes trouvées', async () => {
            const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-ld-export]')]);
            const csv = fs.readFileSync(await dl.path(), 'utf8');
            assert.match(csv, /^﻿Nom;Construit;Détruit;État;Pays;Commune;Ouvert au public;Distance \(km\)/); assert.strictEqual(csv.trim().split(/\r\n/).length, 4);
            await p.evaluate(() => { window.LCNDA_EXT.sendTo = (kind, data) => { window.__sent = {kind, data}; }; window.LCNDA_UI.openPrintDialog = o => { window.__printed = o.html; return Promise.resolve(null); }; });
            // le bouton 📤 n'est posé que si « Envoyer vers… » est chargé : on redessine la page
            await p.evaluate(() => window.LCNDA_EXT.lists.data_test_chateaux(++window.LCNDA_APP.state.workspaceToken)); await waitCount(/^3 lignes/);
            await p.click('[data-ld-send]'); await p.waitForFunction(() => window.__sent);
            const sent = await p.evaluate(() => window.__sent); assert.strictEqual(sent.kind, 'rows'); assert.strictEqual(sent.data.rows.length, 4); assert.strictEqual(sent.data.rows[0][0], 'Nom'); assert.match(sent.data.name, /Châteaux inventés — 📍 À 10 km autour de Tulle/);
            await p.$eval('[data-ld-print]', b => b.click()); // 3e bouton de l'en-tête : rangé dans ⋯ await p.waitForFunction(() => window.__printed);
            assert.match(await p.evaluate(() => window.__printed), /3 lignes[\s\S]*<td>Château de Mazaud<\/td>[\s\S]*<td>oui<\/td>/);
        });
        if (hasPack) await t('liste serveur (🚂 Gares) : autour de Tulle, « Voir les suivantes », choix « Source » avec leur nombre', async () => {
            await p.evaluate(() => localStorage.setItem('lcnda-ld:hist_gares', JSON.stringify({near: {lat: 45.2675, lon: 1.7711, km: 60, title: 'Tulle'}, sort: '_km'})));
            await openList('data_hist_gares'); const c = await waitCount(/\d+ lignes/);
            const n = Number(c.replace(/\D/g, '')); assert.ok(n > 100, c);
            assert.strictEqual((await rowsText()).length, 100);
            await p.click('[data-ld-more]'); await p.waitForFunction(() => document.querySelectorAll('.ld-table tbody tr').length > 100);
            await p.click('[data-ld-add]'); await p.click('.ui-actmenu-i:has-text("Source")');
            await p.waitForSelector('[data-ld-ed-list] input'); assert.match(await p.textContent('[data-ld-ed-list]'), /Wikidata \(date d’ouverture\)\s*\d+/);
            await p.check('[data-ld-ed-list] input[value="Wikidata (date d’ouverture)"]'); await p.click('.ld-ed-form button[type="submit"]');
            const c2 = await waitCount(/\d+ ligne/); assert.ok(Number(c2.replace(/\D/g, '')) < n);
            await p.click('[data-ld-period]'); await p.fill('.ld-ed-form input[name="from"]', '1860'); await p.click('.ld-ed-form button[type="submit"]');
            const c3 = await waitCount(/\d+ ligne/); assert.ok(Number(c3.replace(/\D/g, '')) < Number(c2.replace(/\D/g, '')), `${c2} → ${c3}`);
        });
        await t('pack absent (📊 Prénoms) : seulement l’offre « ⤓ Installer » ; sommaire par groupe, avec les liens vers les listes déjà là', async () => {
            await openList('data_pp_prenoms'); await p.waitForSelector('[data-ld-install-host]');
            assert.ok(await p.$('[data-ld-install]')); assert.ok(!(await p.$('[data-ld-results]')));
            await openList('donnees'); await p.waitForSelector('.ld-overview .ld-card');
            const groups = await p.$$eval('.ld-group h3', a => a.map(x => x.textContent)); assert.ok(groups.length >= 4, groups.join('|'));
            assert.ok(await p.$('[data-ld-go="link:link_pays_chiffres"]') && await p.$('[data-ld-go="link:link_lune_eclipses"]') && await p.$('[data-ld-go="link:link_insee"]'));
            await p.click('[data-ld-go="link:link_lune_eclipses"]'); await p.waitForSelector('[data-side-value="lune_eclipses"].is-active');
            await openList('donnees'); await p.waitForSelector('.ld-overview .ld-card');
            await p.fill('[data-ld-ov-q]', 'inventés'); assert.strictEqual(await p.$$eval('.ld-card:not([hidden])', a => a.length), 1);
            await p.click('.ld-card:not([hidden])'); await p.waitForSelector('[data-ld-page="test_chateaux"]');
        });
        await t('téléphone (390 px) : la barre passe à la ligne, pas de défilement de côté de la page', async () => {
            await p.setViewportSize({width: 390, height: 844});
            await openList('data_test_chateaux'); await waitCount(/lignes?/);
            const w = await p.evaluate(() => [document.documentElement.scrollWidth, document.querySelector('.ld-page').getBoundingClientRect().right]);
            assert.ok(w[0] <= 392, JSON.stringify(w));
            await p.setViewportSize({width: 1440, height: 900});
        });
        await t('aucune erreur dans la page', async () => { assert.deepStrictEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true});
    }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})();
