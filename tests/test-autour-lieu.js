#!/usr/bin/env node
/* 🗺 Tout autour d'un lieu (assets/js/app-autour-lieu.js, lib/autour_lieu.php ; ouvert depuis 📊 Données et 🔍 Recherche).
 *  1. 🔍 Recherche : « 🗺 Tout autour d'un lieu » juste après « Proximité géographique et temporelle », qui reste le même (même bouton, même formulaire) ;
 *  2. Quoi : « Les deux » au départ dans la Recherche ; « Les données » / « Ma famille » / « Les deux » changent les pastilles ;
 *  3. « Ce lieu seulement » (rien à Treignac quand on regarde Chamberet) ; un rayon ; la période (de, à) ;
 *  4. ▤ Tableau : tri par colonne, ⤓ Exporter (la fenêtre commune), « Voir plus » ; une ligne ouvre la fiche ; la carte : « 500 premiers sur N » ;
 *  5. les choix retenus (genealogie-autour-lieu, aussi dans le défaut du site) ; 📊 Données : « Les données » au départ, le bouton près de la question ;
 *  6. mode consultation : lecture seule, jamais un vivant ni une fiche confidentielle (le serveur les retire) ; aucune erreur JavaScript.
 * Base : tests/prendre-depuis-seed.js (noms inventés MAZAUD, LACOMBE, DURAND).   node tests/test-autour-lieu.js */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {spawnSync} = require('child_process');
const {start, sleep} = require('./prendre-depuis-seed.js');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 8).join('\n  ')); } };
const root = path.join(__dirname, '..');

(async () => {
    const B = await start();
    const p = B.page;
    const {findPhp, phpRuntimeArgs, devBundledPhp} = require('../electron/php-server.js');
    const php = findPhp([devBundledPhp()]) || 'php';
    const runPhp = code => { const r = spawnSync(php, [...phpRuntimeArgs(php), '-r', code], {cwd: root, encoding: 'utf8', env: {...process.env, GENEALOGY_DATA_DIR: B.tmp, GENEALOGY_MEDIA_DIR: path.join(B.tmp, 'media'), DBF: path.join(B.tmp, 'genealogy.sqlite')}}); if (r.status !== 0) throw new Error(r.stderr || r.stdout); return r.stdout.trim(); };
    try {
        // la base : une vivante (Claire DURAND) et une fiche confidentielle (Paul LACOMBE) nées à Treignac, une carte postale de Treignac,
        // une photo rangée sur Chamberet
        const ok = runPhp(`require 'lib/paths.php'; require 'lib/bootstrap.php'; $p = db(); $b = (int) $p->query("SELECT id FROM event_types WHERE gedcom_tag='BIRT'")->fetchColumn();
            $p->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status) VALUES(900,'Claire','DURAND','female','living')");
            $p->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_private) VALUES(901,'Paul','LACOMBE','male','deceased',1)");
            $p->exec("INSERT INTO events(scope,person_id,event_type_id,date_text,year,place_id) VALUES('person',900,$b,'1990',1990,1),('person',901,$b,'1850',1850,1)");
            $p->exec("INSERT INTO postcards(media_id,title,publisher,sent_date,place_id) VALUES(6,'Treignac, le pont','Éd. MAZAUD','1912',1)");
            if ($p->query("SELECT 1 FROM pragma_table_info('media') WHERE name='place_id'")->fetchColumn()) { $p->exec('UPDATE media SET place_id=2 WHERE id=4'); }
            echo 'ok';`);
        assert.strictEqual(ok.split('\n').pop(), 'ok');

        // des listes de données FABRIQUÉES autour de Chamberet (thème guerres) : 7 combats et 600 bornes (pour la limite de la carte)
        const addLists = () => p.evaluate(() => {
            const E = window.LCNDA_EXT; if (E.dataLists.some(d => d.id === 'test_combats')) return;
            const rows = [{name: 'Combat du Pont-Vieux', y: 1760, lat: 45.585, lon: 1.72, lieu: 'Chamberet'}, {name: 'Siège de la Tour', y: 1765, lat: 45.57, lon: 1.70, lieu: 'Chamberet'},
                {name: 'Bataille du plateau', y: 1775, lat: 45.6, lon: 1.75, lieu: 'Treignac'}, {name: 'Combat de la Vézère', y: 1790, lat: 45.55, lon: 1.79, lieu: 'Treignac'}, {name: 'Combat de Paris', y: 1790, lat: 48.85, lon: 2.35, lieu: 'Paris'}];
            const fields = [{key: 'name', label: 'Combat', type: 'text'}, {key: 'lieu', label: 'Lieu', type: 'place'}];
            E.dataLists.push({id: 'test_combats', icon: '⚔️', label: 'Combats d’essai', group: 'Le monde', theme: 'guerres', source: 'Jeu d’essai (CC0)', load: async () => rows, fields,
                period: r => [r.y, r.y], geo: r => [r.lat, r.lon], rowKey: r => r.name, familyColumn: true});
            const many = Array.from({length: 600}, (_, i) => ({name: `Borne n° ${i + 1}`, y: 1700 + (i % 200), lat: 45.58 + (i % 30) / 1000, lon: 1.71 + Math.floor(i / 30) / 1000, lieu: 'Chamberet'}));
            E.dataLists.push({id: 'test_bornes', icon: '🪨', label: 'Bornes d’essai', group: 'Le monde', theme: 'guerres', source: 'Jeu d’essai (CC0)', load: async () => many, fields,
                period: r => [r.y, r.y], geo: r => [r.lat, r.lon], rowKey: r => r.name});
            E.donneesPlus.resetCache();
        });
        await addLists(); await sleep(300);
        const closeDlg = () => p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close()));
        const recherche = async kind => { await closeDlg(); await p.evaluate(k => { const A = window.LCNDA_APP; A.state.researchKind = k; A.setModule('recherche'); }, kind); await p.waitForSelector('[data-rk-menu] [data-rk-pick]', {timeout: 20000}); await sleep(300); };
        const pick = async (scope, name) => { await p.fill(`${scope} [data-dp-ap] input`, name); await p.waitForSelector(`${scope} [data-dp-ap] [data-i]`, {timeout: 15000}); await p.click(`${scope} [data-dp-ap] [data-i]`); };
        const chips = scope => p.$$eval(`${scope} [data-dp-lyr] [data-ly]`, a => a.map(x => x.dataset.ly));
        const waitChips = async (scope, fn, what) => { for (let i = 0; i < 60; i++) { const c = await chips(scope); if (fn(c)) return c; await sleep(250); } throw new Error(`pastilles attendues (${what}) : ${(await chips(scope)).join(', ')}`); };
        const seg = (scope, attr, k) => p.click(`${scope} [${attr}] [data-k="${k}"]`);
        const pressed = (scope, attr) => p.$eval(`${scope} [${attr}] [aria-pressed="true"]`, x => x.dataset.k);
        const col = (scope, i) => p.$$eval(`${scope} [data-al-table] tbody tr[data-al-row]`, (rs, j) => rs.map(r => r.children[j]?.textContent.trim()), i);
        const W = '#workspace .al-page';

        /* ═════════ 1. 🔍 Recherche : la nouvelle entrée, à côté de la proximité (qui ne change pas) ═════════ */
        await t('Recherche : « 🗺 Tout autour d’un lieu » juste après « Proximité géographique et temporelle », qui garde son bouton et son formulaire', async () => {
            await recherche('proximity');
            const menu = await p.$$eval('[data-rk-menu] [data-rk-pick]', a => a.map(x => [x.dataset.rkPick, x.textContent.replace(/^\d+/, '').trim()]));
            const i = menu.findIndex(x => x[0] === 'proximity'); assert.ok(i >= 0, 'proximité présente');
            assert.strictEqual(menu[i][1], 'Proximité géographique et temporelle');
            assert.deepStrictEqual(menu[i + 1], ['autour_lieu', '🗺 Tout autour d’un lieu']);
            assert.ok(await p.isVisible('#research-proximity-fields'), 'le formulaire de proximité'); assert.ok(await p.isVisible('#research-form button[type="submit"]'), 'son bouton « Afficher les correspondances »');
            assert.ok(await p.$('#research-proximity-fields #proximity-place-input'), 'son choix de commune'); assert.ok(await p.$('#proximity-radius'), 'son rayon');
            await p.click('[data-rk-menu] [data-rk-pick="autour_lieu"]'); await p.waitForSelector(`${W} [data-dp-ap] input`, {timeout: 15000});
            assert.ok(!(await p.isVisible('#research-proximity-fields')), 'pas le formulaire de la proximité'); assert.ok(!(await p.isVisible('#research-form button[type="submit"]')), 'pas de bouton « Afficher »');
            assert.match(await p.textContent(`${W} .page-header`), /Tout autour d’un lieu/);
            assert.strictEqual(await pressed(W, 'data-al-quoi'), 'both', 'Recherche : « Les deux » au départ');
            await p.click('[data-rk-menu] [data-rk-pick="proximity"]'); await sleep(400);
            assert.ok(await p.isVisible('#research-proximity-fields'), 'on revient à la proximité, inchangée');
        });

        /* ═════════ 2. Quoi : les données, ma famille, les deux ═════════ */
        await t('Quoi : « Les deux » (thèmes et sortes de la famille), « Les données », « Ma famille »', async () => {
            await recherche('autour_lieu'); await p.waitForSelector(`${W} [data-dp-ap] input`);
            await pick(W, 'Chamberet');
            const c = await waitChips(W, x => x.includes('guerres') && x.includes('fam:births'), 'les deux');
            assert.ok(c.includes('fam:investigations'), 'l’enquête « testenquête » (Jean MAZAUD, né à Chamberet)'); assert.ok(c.includes('fam:postcards'), 'la carte postale de Treignac');
            assert.match(await p.textContent(`${W} [data-dp-leg]`), /Autour de Chamberet · 30 km/);
            await seg(W, 'data-al-quoi', 'donnees'); const d = await waitChips(W, x => x.length && !x.some(y => y.startsWith('fam:')), 'données'); assert.ok(d.includes('guerres'));
            await seg(W, 'data-al-quoi', 'famille'); const f = await waitChips(W, x => x.length && !x.includes('guerres'), 'famille'); assert.ok(f.includes('fam:births') && f.includes('fam:deaths'));
            await p.click(`${W} [data-ly="fam:births"]`); assert.strictEqual(await p.getAttribute(`${W} [data-ly="fam:births"]`, 'aria-pressed'), 'false', 'pastille éteinte');
            await p.click(`${W} [data-ly="fam:births"]`); assert.strictEqual(await p.getAttribute(`${W} [data-ly="fam:births"]`, 'aria-pressed'), 'true');
            await seg(W, 'data-al-quoi', 'both'); await waitChips(W, x => x.includes('guerres') && x.includes('fam:births'), 'les deux encore');
        });

        /* ═════════ 3. la carte : 500 premiers sur N ═════════ */
        await t('carte : le cercle, et « 500 premiers sur N — voir le tableau » au-delà de la limite choisie (⚙️ Personnaliser)', async () => {
            assert.ok(await p.$(`${W} [data-dp-map] svg, ${W} [data-dp-map] .mini-map, ${W} [data-dp-map] *`), 'une carte');
            assert.ok(await p.isHidden(`${W} [data-al-note]`), '1 500 : pas de limite atteinte (moins de 1 500 lignes)');
            await p.click(`${W} [data-al-custom]`); await p.click('.ui-actmenu button:has-text("500 points")'); await sleep(300);
            assert.ok(await p.isVisible(`${W} [data-al-note]`)); assert.match(await p.textContent(`${W} [data-al-note]`), /500 premiers sur [\d  ]+ — voir le tableau/);
            await p.click(`${W} [data-al-note] [data-al-totable]`); await p.waitForSelector(`${W} [data-al-table] tbody tr[data-al-row]`, {timeout: 10000});
            assert.strictEqual(await pressed(W, 'data-al-view'), 'table');
            await p.click(`${W} [data-al-custom]`); await p.click('.ui-actmenu button:has-text("1 500 points")'); await sleep(200);
        });

        /* ═════════ 4. le tableau : tout, trié, « Voir plus », exporté ═════════ */
        await t('tableau : toutes les lignes (200 puis « Voir plus »), tri par colonne (distance, année), ⤓ Exporter (ce qu’on voit / tout)', async () => {
            const n0 = (await col(W, 0)).length; assert.strictEqual(n0, 200, '200 d’abord');
            const count = Number((await p.textContent(`${W} .ui-listbar-count`)).replace(/\D/g, '')); assert.ok(count > 600, 'le compte : toutes les lignes ' + count);
            await p.click(`${W} [data-al-more]`); assert.strictEqual((await col(W, 0)).length, 400);
            const km = (await col(W, 0)).map(x => Number(x.replace(/\s|km/g, '').replace(',', '.'))); assert.deepStrictEqual(km, [...km].sort((a, b) => a - b), 'distance croissante au départ');
            await p.click(`${W} [data-al-table] th [data-sort-key="y"]`); await sleep(300);
            const ys = (await col(W, 1)).filter(x => /^\d/.test(x)).map(x => Number(x.slice(0, 4))); assert.ok(ys.length > 10); assert.deepStrictEqual(ys, [...ys].sort((a, b) => a - b), 'année croissante');
            await p.click(`${W} [data-al-table] th [data-sort-key="y"]`); await sleep(300);
            const yd = (await col(W, 1)).filter(x => /^\d/.test(x)).map(x => Number(x.slice(0, 4))); assert.deepStrictEqual(yd, [...yd].sort((a, b) => b - a), 'année décroissante');
            assert.strictEqual(await p.$eval(`${W} .ui-listbar select`, s => s.value), 'y-desc');
            await p.evaluate(() => { const U = window.LCNDA_UI; U.__ex = U.exportRows; window.__ex = null; U.exportRows = o => { window.__ex = o; return Promise.resolve(); }; });
            await p.click(`${W} [data-al-export]`);
            const ex = await p.evaluate(async () => { const o = window.__ex; const v = await o.rows(), a = await o.all(); return {title: o.title, head: v[0], view: v.length - 1, all: a.length - 1}; });
            assert.match(ex.title, /Tout autour d’un lieu — Chamberet/); assert.deepStrictEqual(ex.head.slice(0, 4), ['Distance (km)', 'Année', 'Type', 'Titre']);
            assert.strictEqual(ex.view, count, 'ce qu’on voit = le compte'); assert.ok(ex.all >= ex.view);
            await p.evaluate(() => { const U = window.LCNDA_UI; U.exportRows = U.__ex; });
            await p.click(`${W} [data-al-export]`); await p.waitForSelector('dialog[open] .ui-export-fmt', {timeout: 10000}); await closeDlg(); // la vraie fenêtre d'export
            await p.fill(`${W} .ui-listbar input[type="search"], ${W} .ui-listbar input`, 'MAZAUD'); await sleep(700);
            const titles = await col(W, 3); assert.ok(titles.length && titles.every(x => /MAZAUD/.test(x)), 'chercher : ' + titles.slice(0, 3));
            await p.fill(`${W} .ui-listbar input[type="search"], ${W} .ui-listbar input`, ''); await sleep(600);
        });

        /* ═════════ 5. ce lieu seulement, la période ═════════ */
        await t('« Ce lieu seulement » : rien de Treignac quand on regarde Chamberet ; un rayon : Treignac revient', async () => {
            await seg(W, 'data-al-quoi', 'famille'); await sleep(800);
            const around = await p.evaluate(async () => (await window.LCNDA_APP.api('autour_lieu', {lat: 45.5847, lon: 1.7183, km: 30})).items);
            assert.ok(around.some(x => x.pl.startsWith('Treignac')), 'Treignac à 30 km');
            await seg(W, 'data-al-zone', 'exact'); await sleep(200); assert.ok(await p.isHidden(`${W} [data-al-kmbox]`), 'pas de rayon');
            for (let i = 0; i < 40 && (await col(W, 4)).some(x => x.startsWith('Treignac')); i++) await sleep(250);
            const places = await col(W, 4); assert.ok(places.length > 3, 'des lignes de Chamberet'); assert.ok(places.every(x => x.startsWith('Chamberet')), 'seulement Chamberet : ' + [...new Set(places)].join(' | '));
            const exact = await p.evaluate(async () => (await window.LCNDA_APP.api('autour_lieu', {lat: 45.5847, lon: 1.7183, exact: 1, place_id: 2})).items);
            assert.ok(exact.length && exact.every(x => x.km <= 1), 'serveur : à moins d’1 km');
            await seg(W, 'data-al-quoi', 'donnees'); await sleep(1500);
            await p.click(`${W} [data-al-view] [data-k="map"]`); await sleep(300);
            assert.match(await p.textContent(`${W} [data-dp-leg]`), /Chamberet · ce lieu seulement/);
            await seg(W, 'data-al-zone', 'around'); await seg(W, 'data-al-quoi', 'famille'); await p.click(`${W} [data-al-view] [data-k="table"]`);
            for (let i = 0; i < 40 && !(await col(W, 4)).some(x => x.startsWith('Treignac')); i++) await sleep(250);
            assert.ok((await col(W, 4)).some(x => x.startsWith('Treignac')), 'Treignac revient');
        });
        await t('période (de, à) : pour la famille et pour les données ; sans date gardé (⚙️), ou retiré', async () => {
            await p.fill(`${W} [data-al-y0]`, '1780'); await p.fill(`${W} [data-al-y1]`, '1790'); await p.press(`${W} [data-al-y1]`, 'Tab'); await sleep(400);
            const ys = await col(W, 1); assert.ok(ys.length > 3);
            assert.ok(ys.every(x => x === '—' || (Number(x.slice(0, 4)) <= 1790 && Number(x.slice(-4)) >= 1780)), 'dans la période : ' + ys.slice(0, 8));
            const undated = ys.filter(x => x === '—').length;
            await p.click(`${W} [data-al-custom]`); await p.click('.ui-actmenu button:has-text("sans date")'); await sleep(300);
            assert.ok((await col(W, 1)).every(x => x !== '—'), 'sans date retirés');
            await p.click(`${W} [data-al-custom]`); await p.click('.ui-actmenu button:has-text("sans date")'); await sleep(300);
            assert.strictEqual((await col(W, 1)).filter(x => x === '—').length, undated);
            await seg(W, 'data-al-quoi', 'donnees'); await sleep(1500);
            const yd = (await col(W, 1)).filter(x => /^\d/.test(x)).map(Number); assert.ok(yd.length > 10 && yd.every(y => y >= 1780 && y <= 1790), 'données dans la période');
            await p.fill(`${W} [data-al-y0]`, ''); await p.fill(`${W} [data-al-y1]`, ''); await p.press(`${W} [data-al-y1]`, 'Tab'); await sleep(300);
        });
        await t('une ligne s’ouvre : la fiche de la personne ; ☑ cocher → 🧺 Au panier (les vrais éléments : événement)', async () => {
            await seg(W, 'data-al-quoi', 'famille'); await sleep(800);
            await p.click(`${W} [data-al-table] tbody tr[data-al-row]:first-child input[data-sel-check]`);
            assert.ok(await p.$('.sel-bar [data-sel-act]'), 'la barre de sélection');
            const labels = await p.$$eval('.sel-bar [data-sel-act]', a => a.map(x => x.textContent)); assert.ok(labels.some(x => /Au panier/.test(x)), 'Au panier : ' + labels);
            await p.evaluate(() => { const C = window.LCNDA_EXT.connexions; C.__t = C.take; window.__took = null; C.take = items => { window.__took = items; return Promise.resolve(); }; });
            await p.click('.sel-bar [data-sel-act]:has-text("Au panier")'); await sleep(300);
            const took = await p.evaluate(() => window.__took); assert.ok(took && took.length === 1 && ['event', 'media', 'investigation'].includes(took[0].kind) && took[0].ref_id > 0, JSON.stringify(took));
            await p.evaluate(() => { const C = window.LCNDA_EXT.connexions; C.take = C.__t; });
            await p.click('.sel-bar [data-sel-clear]').catch(() => {});
            const pid = await p.$eval(`${W} [data-al-table] tbody [data-open-person]`, b => Number(b.dataset.openPerson));
            await p.click(`${W} [data-al-table] tbody [data-open-person]`); await p.waitForFunction(x => window.LCNDA_APP.state.module === 'personnes' && Number(window.LCNDA_APP.state.currentPersonId) === x, pid, {timeout: 15000});
        });

        /* ═════════ 6. retenu ; 📊 Données ═════════ */
        await t('les choix sont retenus (rayon, quoi, vue) ; la clé est dans le défaut du site', async () => {
            const v = await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-autour-lieu')));
            assert.strictEqual(v.quoi.recherche, 'famille'); assert.strictEqual(v.view, 'table'); assert.strictEqual(v.exact, false);
            await recherche('autour_lieu'); await p.waitForSelector(`${W} [data-al-quoi]`);
            assert.strictEqual(await pressed(W, 'data-al-quoi'), 'famille'); assert.strictEqual(await pressed(W, 'data-al-view'), 'table');
            await p.fill(`${W} [data-dp-akm]`, '12'); await p.press(`${W} [data-dp-akm]`, 'Tab'); await sleep(200);
            assert.strictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-autour-lieu')).km), 12);
            const app = fs.readFileSync(path.join(root, 'assets/js/app.js'), 'utf8'), api = fs.readFileSync(path.join(root, 'api.php'), 'utf8');
            assert.ok(app.match(/const SITE_DEFAULT_KEYS = \[([\s\S]*?)\];/)[1].includes("'genealogie-autour-lieu'")); assert.ok(api.includes("'genealogie-autour-lieu'"));
            await p.evaluate(() => { const v = JSON.parse(localStorage.getItem('genealogie-autour-lieu')); v.km = 30; v.view = 'map'; localStorage.setItem('genealogie-autour-lieu', JSON.stringify(v)); });
        });
        await t('📊 Données : « 🗺 Tout autour d’un lieu » allumé au départ, un vrai bouton près de la question ; « Les données » au départ', async () => {
            await closeDlg(); await p.evaluate(() => { const H = window.LCNDA_EXT.dataHome._st; H.view = 'recap'; H.q = ''; H.res = null; const A = window.LCNDA_APP; A.state.listType = 'donnees'; A.setModule('listes'); });
            await p.waitForSelector('[data-dr] [data-dp-around-cta]', {timeout: 30000});
            assert.ok(await p.evaluate(() => { const b = document.querySelector('[data-dp-around-cta]'), f = document.querySelector('[data-dr-form]'); return !!b && f.nextElementSibling?.contains(b); }), 'juste sous la question');
            assert.strictEqual(await p.evaluate(() => window.LCNDA_EXT.donneesPlus.on(8)), true);
            await p.click('[data-dp-around-cta]'); await p.waitForSelector('dialog[open] [data-dp-ap] input');
            assert.strictEqual(await pressed('dialog[open]', 'data-al-quoi'), 'donnees', 'Données : « Les données » au départ');
            await pick('dialog[open]', 'Chamberet'); await waitChips('dialog[open]', x => x.includes('guerres'), 'données');
            assert.ok(!(await chips('dialog[open]')).some(x => x.startsWith('fam:')));
            await closeDlg();
            await p.evaluate(() => window.LCNDA_EXT.donneesPlus.setFeat(8, false)); await sleep(300);
            assert.strictEqual(await p.evaluate(() => window.LCNDA_EXT.donneesPlus.on(8)), false, 'un choix « éteint » reste'); await p.evaluate(() => window.LCNDA_EXT.donneesPlus.setFeat(8, true));
        });

        /* ═════════ 7. consultation ═════════ */
        await t('serveur : la vivante et la fiche confidentielle sont là pour le propriétaire', async () => {
            const it = await p.evaluate(async () => (await window.LCNDA_APP.api('autour_lieu', {lat: 45.5367, lon: 1.7958, km: 2})).items);
            assert.ok(it.some(x => x.p === 900) && it.some(x => x.p === 901));
        });
        await t('mode consultation : lecture seule (pas de 🧺), jamais un vivant ni une fiche confidentielle ; l’outil marche', async () => {
            runPhp(`require 'lib/paths.php'; require 'lib/bootstrap.php'; kiosk_enter(['password' => 'secret12']);`);
            try {
                await p.reload(); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.autourLieu && document.body.classList.contains('is-kiosk'), null, {timeout: 60000});
                await addLists();
                const it = await p.evaluate(async () => (await window.LCNDA_APP.api('autour_lieu', {lat: 45.5367, lon: 1.7958, km: 2})).items);
                assert.ok(it.length > 3, 'des lignes'); assert.ok(!it.some(x => x.p === 900 || x.p === 901), 'ni Claire DURAND (vivante) ni Paul LACOMBE (confidentiel)');
                assert.ok(!JSON.stringify(it).includes('Claire'));
                await recherche('autour_lieu'); await p.waitForSelector(`${W} [data-dp-ap] input`);
                await seg(W, 'data-al-quoi', 'famille'); await p.click(`${W} [data-al-view] [data-k="table"]`);
                await pick(W, 'Treignac'); await p.waitForSelector(`${W} [data-al-table] tbody tr[data-al-row]`, {timeout: 20000});
                assert.ok(!(await col(W, 3)).some(x => /Claire|Paul LACOMBE/.test(x)));
                await p.click(`${W} [data-al-table] tbody tr[data-al-row]:first-child input[data-sel-check]`);
                const labels = await p.$$eval('.sel-bar [data-sel-act]', a => a.map(x => x.textContent)); assert.ok(!labels.some(x => /Au panier|Mettre dans/.test(x)), 'pas de 🧺 : ' + labels);
                assert.ok(labels.some(x => /Exporter/.test(x)), 'exporter reste');
            } finally { fs.rmSync(path.join(B.tmp, 'consultation.json'), {force: true}); }
            await p.reload(); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && !document.body.classList.contains('is-kiosk'), null, {timeout: 60000});
        });
        await t('390 px : rien ne déborde', async () => {
            await p.setViewportSize({width: 390, height: 844}); await addLists();
            await recherche('autour_lieu'); await p.waitForSelector(`${W} [data-dp-ap] input`); await pick(W, 'Chamberet'); await sleep(1500);
            assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'page');
            await p.setViewportSize({width: 1440, height: 900});
        });
        await t('aucune erreur JavaScript', async () => { assert.deepStrictEqual(B.errs, []); });
    } finally {
        await B.stop();
    }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})();
