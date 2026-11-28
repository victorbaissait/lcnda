#!/usr/bin/env node
/* 🗺 Tout autour d'un lieu (assets/js/app-autour-lieu.js, lib/autour_lieu.php ; ouvert depuis 📊 Données et 🔍 Recherche).
 *  1. 🔍 Recherche : « 🗺 Tout autour d'un lieu » juste après « Proximité géographique et temporelle », qui reste le même (même bouton, même formulaire) ;
 *  2. Quoi : « Les deux » au départ dans la Recherche ; « Les données » / « Ma famille » / « Les deux » changent les pastilles ;
 *  3. « Ce lieu seulement » (rien à Treignac quand on regarde Chamberet) ; un rayon ; la période (de, à) ;
 *  4. ▤ Tableau : tri par colonne, ⤓ Exporter (la fenêtre commune), « Voir plus » ; une ligne ouvre la fiche ; la carte : « 500 premiers sur N » ;
 *  5. les choix retenus (genealogie-autour-lieu, aussi dans le défaut du site) ; 📊 Données : « Les données » au départ, le bouton près de la question ;
 *  6. mode consultation : lecture seule, jamais un vivant ni une fiche confidentielle (le serveur les retire) ; aucune erreur JavaScript ;
 *  7. 🗺 un point de la carte s'ouvre (souris ou clavier) : sa petite fiche (ext.carteFiche), ↗ Ouvrir, ☰ Voir la ligne ;
 *  8. 🕊 ✍️ parrains, marraines et témoins dans « Ma famille » (event_witnesses), leur pastille ; un vivant marqué lv, jamais en consultation ;
 *  9. ⚖️ Comparer deux lieux (mêmes filtres, l'écart, ⇄) ; le ⚖️ Comparer des Données y renvoie ; ⏳ Dans le temps (décennies repliées) ;
 * 10. 🖨 fiche imprimable « Autour de Chamberet, 1780-1799 » (UI.openPrintDialog, ⤓ HTML), sans les vivants ni les fiches confidentielles.
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
            $p->exec("CREATE TABLE IF NOT EXISTS event_witnesses (id INTEGER PRIMARY KEY AUTOINCREMENT, event_id INTEGER NOT NULL, person_id INTEGER NOT NULL, note TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
            $ev = (int) $p->query("SELECT e.id FROM events e JOIN event_types t ON t.id=e.event_type_id JOIN persons x ON x.id=e.person_id WHERE e.place_id=2 AND t.gedcom_tag IN ('BIRT','CHR','BAPM') AND COALESCE(x.is_private,0)=0 AND COALESCE(x.living_status,'')<>'living' AND COALESCE(e.is_private,0)=0 ORDER BY e.id LIMIT 1")->fetchColumn();
            $p->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status) VALUES(902,'Antoine','LACOMBE','male','deceased'),(903,'Marie','DURAND','female','deceased')");
            $p->exec("INSERT INTO event_witnesses(event_id,person_id,note,position) VALUES($ev,902,'parrain',0),($ev,903,'témoin du baptême',1),($ev,900,'marraine',2)");
            echo "ok $ev";`);
        const okLine = ok.split('\n').pop(); assert.match(okLine, /^ok [1-9]\d*$/, 'un baptême à Chamberet pour les témoins : ' + okLine);
        const witEv = Number(okLine.split(' ')[1]);

        // des listes de données FABRIQUÉES autour de Chamberet : 5 combats (thème guerres) et 600 bornes (thème ciel : pour la limite de la carte)
        const addLists = () => p.evaluate(() => {
            const E = window.LCNDA_EXT; if (E.dataLists.some(d => d.id === 'test_combats')) return;
            const rows = [{name: 'Combat du Pont-Vieux', y: 1760, lat: 45.585, lon: 1.72, lieu: 'Chamberet'}, {name: 'Siège de la Tour', y: 1765, lat: 45.57, lon: 1.70, lieu: 'Chamberet'},
                {name: 'Bataille du plateau', y: 1775, lat: 45.6, lon: 1.75, lieu: 'Treignac'}, {name: 'Combat de la Vézère', y: 1790, lat: 45.55, lon: 1.79, lieu: 'Treignac'}, {name: 'Combat de Paris', y: 1790, lat: 48.85, lon: 2.35, lieu: 'Paris'}];
            const fields = [{key: 'name', label: 'Combat', type: 'text'}, {key: 'lieu', label: 'Lieu', type: 'place'}];
            E.dataLists.push({id: 'test_combats', icon: '⚔️', label: 'Combats d’essai', group: 'Le monde', theme: 'guerres', source: 'Jeu d’essai (CC0)', load: async () => rows, fields,
                period: r => [r.y, r.y], geo: r => [r.lat, r.lon], rowKey: r => r.name, familyColumn: true});
            const many = Array.from({length: 600}, (_, i) => ({name: `Borne n° ${i + 1}`, y: 1700 + (i % 200), lat: 45.58 + (i % 30) / 1000, lon: 1.71 + Math.floor(i / 30) / 1000, lieu: 'Chamberet'}));
            E.dataLists.push({id: 'test_bornes', icon: '🪨', label: 'Bornes d’essai', group: 'Le monde', theme: 'ciel', source: 'Jeu d’essai (CC0)', load: async () => many, fields,
                period: r => [r.y, r.y], geo: r => [r.lat, r.lon], rowKey: r => r.name, familyColumn: true});
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
            assert.ok(await p.isVisible(`${W} [data-al-note]`)); assert.match(await p.textContent(`${W} [data-al-note]`), /500 premiers sur [\d\s\u00a0\u202f]+ — voir le tableau/);
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
            const yd = (await col(W, 1)).filter(x => /^\d/.test(x)); assert.ok(yd.length > 10, 'des données'); assert.ok(yd.every(x => Number(x.slice(0, 4)) <= 1790 && Number(x.slice(-4)) >= 1780), 'données dans la période : ' + yd.slice(0, 8));
            assert.ok(yd.includes('1785') && !yd.includes('1700'), 'les bornes de la période seulement');
            await p.fill(`${W} [data-al-y0]`, ''); await p.fill(`${W} [data-al-y1]`, ''); await p.press(`${W} [data-al-y1]`, 'Tab'); await sleep(300);
        });
        await t('une ligne s’ouvre : la fiche de la personne ; ☑ cocher → 🧺 Au panier (les vrais éléments : événement)', async () => {
            await seg(W, 'data-al-quoi', 'famille'); await sleep(800);
            await p.click(`${W} [data-al-table] tbody tr[data-al-row]:first-child input[data-sel-check]`);
            assert.ok(await p.$('.sel-bar [data-sel-act]'), 'la barre de sélection');
            const labels = await p.$$eval('.sel-bar [data-sel-act]', a => a.map(x => x.textContent)); assert.ok(labels.some(x => /Au panier/.test(x)), 'Au panier : ' + labels);
            const [req] = await Promise.all([p.waitForRequest(r => r.url().includes('cx_write') && r.method() === 'POST' && (r.postDataJSON() || {}).op === 'basket_add', {timeout: 15000}), p.click('.sel-bar [data-sel-act]:has-text("Au panier")')]);
            const took = req.postDataJSON().items; assert.ok(took && took.length === 1 && ['event', 'media', 'investigation'].includes(took[0].kind) && took[0].ref_id > 0, JSON.stringify(took));
            await sleep(500); await p.evaluate(() => document.querySelectorAll('.ui-actmenu, .cx-pop').forEach(x => x.remove()));
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
        /* ═════════ 8. 🕊 ✍️ parrains, marraines, témoins ═════════ */
        await t('« Ma famille » : 🕊 parrains et marraines, ✍️ témoins (event_witnesses), chacun sa pastille ; la marraine vivante est marquée lv', async () => {
            const it = await p.evaluate(async () => (await window.LCNDA_APP.api('autour_lieu', {lat: 45.5847, lon: 1.7183, exact: 1, place_id: 2})).items);
            const god = it.filter(x => x.k === 'godparents'), wit = it.filter(x => x.k === 'witnesses');
            assert.ok(god.some(x => x.p === 902 && x.e === witEv && /Antoine LACOMBE/.test(x.t) && /Parrain/.test(x.s)), 'le parrain : ' + JSON.stringify(god));
            assert.ok(wit.some(x => x.p === 903 && x.e === witEv && /témoin du baptême/.test(x.s)), 'le témoin (le rôle écrit dans la note) : ' + JSON.stringify(wit));
            const claire = god.find(x => x.p === 900); assert.ok(claire && claire.lv === 1, 'la marraine vivante : là pour le propriétaire, marquée lv');
            assert.ok(!god.find(x => x.p === 902).lv, 'le parrain mort n’est pas marqué');
            await recherche('autour_lieu'); await p.waitForSelector(`${W} [data-dp-ap] input`);
            await seg(W, 'data-al-quoi', 'famille'); await pick(W, 'Chamberet');
            const c = await waitChips(W, x => x.includes('fam:godparents') && x.includes('fam:witnesses'), 'parrains et témoins');
            assert.ok(c.indexOf('fam:godparents') > c.indexOf('fam:events') || !c.includes('fam:events'), 'après les autres événements');
            assert.match(await p.textContent(`${W} [data-ly="fam:godparents"]`), /Parrains et marraines · \d/); assert.match(await p.textContent(`${W} [data-ly="fam:witnesses"]`), /Témoins · \d/);
            await p.click(`${W} [data-al-view] [data-k="table"]`); await p.waitForSelector(`${W} [data-al-table] tbody tr[data-al-row]`);
            await p.fill(`${W} .ui-listbar input`, 'Antoine LACOMBE'); await sleep(700);
            assert.strictEqual(await p.getAttribute(`${W} [data-al-table] tbody tr[data-al-row] [data-open-person]`, 'data-open-person'), '902', 'la ligne ouvre la fiche du parrain');
            assert.match((await col(W, 2))[0], /Parrains et marraines/);
            await p.fill(`${W} .ui-listbar input`, ''); await sleep(500);
        });

        /* ═════════ 7. 🗺 un point de la carte s'ouvre ═════════ */
        await t('carte : un point s’ouvre au clavier (Tab, Entrée) — sa petite fiche, ↗ Ouvrir, ☰ Voir la ligne ; le lieu choisi (◆) ne s’ouvre pas', async () => {
            for (const k of await chips(W)) if (k !== 'fam:births') await p.click(`${W} [data-ly="${k}"]`);
            await p.click(`${W} [data-al-view] [data-k="map"]`); await p.waitForSelector(`${W} [data-dp-map] .h-map-point[data-cf-i]`, {timeout: 15000, state: 'attached'});
            const info = await p.evaluate(w => { const ms = [...document.querySelectorAll(`${w} [data-dp-map] .h-map-point`)]; return {n: ms.length, cf: ms.filter(m => m.dataset.cfI != null).length, last: ms[ms.length - 1].dataset.cfI ?? null,
                tab: ms.filter(m => m.dataset.cfI != null).every(m => m.getAttribute('tabindex') === '0' && m.getAttribute('role') === 'button' && /Voir la fiche/.test(m.getAttribute('aria-label')))}; }, W);
            assert.strictEqual(info.cf, info.n - 1, 'tous les points sauf le lieu choisi'); assert.strictEqual(info.last, null, '◆ ne s’ouvre pas'); assert.ok(info.tab, 'Tab, rôle bouton, nom');
            const openOne = async () => {
                const vis = await p.evaluate(w => { const g = [...document.querySelectorAll(`${w} [data-dp-map] .h-map-point[data-cf-i]`)].find(m => m.style.display !== 'none'); if (g) { g.focus(); return 'pt'; } const c = [...document.querySelectorAll(`${w} [data-dp-map] .h-map-cluster`)].find(m => m.style.display !== 'none'); c?.focus(); return c ? 'cl' : ''; }, W);
                assert.ok(vis, 'un point ou une pastille à l’écran');
                await p.keyboard.press('Enter');
                if (vis === 'cl') { await p.waitForSelector(`${W} .cf-card [data-cf-pick]`, {timeout: 5000}); await p.click(`${W} .cf-card [data-cf-pick]`); }
                await p.waitForSelector(`${W} .cf-card [data-cf-act="open"]`, {timeout: 5000});
            };
            await openOne();
            assert.ok((await p.textContent(`${W} .cf-card .cf-title`)).trim().length > 1, 'un titre');
            assert.match(await p.textContent(`${W} .cf-card`), /Naissance|Baptême/, 'ce qu’il montre');
            const title = (await p.textContent(`${W} .cf-card .cf-title`)).trim();
            await p.click(`${W} .cf-card [data-cf-act="line"]`);
            assert.strictEqual(await pressed(W, 'data-al-view'), 'table', '☰ Voir la ligne : le tableau');
            assert.ok((await p.textContent(`${W} [data-al-table] tr.is-al-hi`)).includes(title), 'la ligne éclairée');
            await p.click(`${W} [data-al-view] [data-k="map"]`); await p.waitForSelector(`${W} [data-dp-map] .h-map-point[data-cf-i]`, {state: 'attached'});
            await openOne();
            await p.click(`${W} .cf-card [data-cf-act="open"]`);
            await p.waitForFunction(() => window.LCNDA_APP.state.module === 'personnes', null, {timeout: 15000});
        });

        /* ═════════ 9. ⏳ dans le temps, ⚖️ comparer ═════════ */
        await t('⏳ Dans le temps : décennies repliées, année par année, données et famille mêlées, avec la période et les pastilles', async () => {
            await recherche('autour_lieu'); await p.waitForSelector(`${W} [data-dp-ap] input`);
            await seg(W, 'data-al-quoi', 'both'); await pick(W, 'Chamberet'); await waitChips(W, x => x.includes('guerres') && x.includes('fam:births'), 'les deux');
            await p.click(`${W} [data-al-view] [data-k="time"]`); await p.waitForSelector(`${W} [data-al-time] details[data-al-dec]`, {timeout: 10000});
            const d0 = await p.$$eval(`${W} [data-al-time] details[data-al-dec]`, a => a.map(d => [Number(d.dataset.alDec), d.open, Number(d.querySelector('.al-dec-n').textContent.replace(/\D/g, ''))]));
            assert.ok(d0.length > 5 && d0.every(x => !x[1]), 'repliées au départ'); assert.deepStrictEqual(d0.map(x => x[0]), [...d0.map(x => x[0])].sort((a, b) => a - b));
            const sum = Number((await p.textContent(`${W} .al-time-sum`)).match(/^[\d\s\u00a0\u202f]+/)[0].replace(/\D/g, ''));
            assert.strictEqual(d0.reduce((a, x) => a + x[2], 0), sum, 'le compte des décennies = les lignes datées');
            await p.click(`${W} [data-al-dec="1780"] > summary`); await p.waitForSelector(`${W} [data-al-dec="1780"] .al-years > li`);
            const ys = await p.$$eval(`${W} [data-al-dec="1780"] .al-y`, a => a.map(x => Number(x.textContent)));
            assert.ok(ys.length && ys.every(y => y >= 1780 && y <= 1789), 'les années de la décennie'); assert.deepStrictEqual(ys, [...ys].sort((a, b) => a - b));
            const kinds = await p.$$eval(`${W} [data-al-time] details[open] .al-years li li`, a => a.map(x => (x.querySelector('[data-open-person]') ? 'fam' : 'x')));
            assert.ok(kinds.length > 1);
            await p.fill(`${W} [data-al-y0]`, '1780'); await p.fill(`${W} [data-al-y1]`, '1799'); await p.press(`${W} [data-al-y1]`, 'Tab'); await sleep(400);
            const d1 = await p.$$eval(`${W} [data-al-time] details[data-al-dec]`, a => a.map(d => Number(d.dataset.alDec)));
            assert.deepStrictEqual(d1, [1780, 1790], 'la période');
            assert.ok(await p.$eval(`${W} [data-al-dec="1780"]`, d => d.open), 'une décennie ouverte le reste');
            await p.click(`${W} [data-ly="ciel"]`); await sleep(200);
            const n1 = await p.$eval(`${W} [data-al-dec="1780"] .al-dec-n`, x => Number(x.textContent.replace(/\D/g, '')));
            await p.click(`${W} [data-ly="ciel"]`); await sleep(200);
            assert.ok(await p.$eval(`${W} [data-al-dec="1780"] .al-dec-n`, x => Number(x.textContent.replace(/\D/g, ''))) > n1, 'les pastilles comptent');
            await p.click(`${W} [data-al-tall="1"]`); assert.ok(await p.$$eval(`${W} [data-al-time] details[data-al-dec]`, a => a.every(d => d.open)), 'Tout déplier');
            await p.click(`${W} [data-al-tall="0"]`); assert.ok(await p.$$eval(`${W} [data-al-time] details[data-al-dec]`, a => a.every(d => !d.open)), 'Tout replier');
            await p.click(`${W} [data-al-custom]`); await p.click('.ui-actmenu button:has-text("décennies dépliées")'); await sleep(300);
            assert.ok(await p.$$eval(`${W} [data-al-time] details[data-al-dec]`, a => a.length && a.every(d => d.open)), '⚙️ dépliées au départ');
            assert.strictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-autour-lieu')).decOpen), true);
            await p.click(`${W} [data-al-custom]`); await p.click('.ui-actmenu button:has-text("décennies dépliées")'); await sleep(200);
        });
        await t('⚖️ Comparer deux lieux : deux colonnes, mêmes filtres (rayon, période, pastilles), l’écart, ce qui n’est que d’un côté ; ⇄', async () => {
            await seg(W, 'data-al-zone', 'exact'); await sleep(300);
            await p.click(`${W} [data-al-view] [data-k="cmp"]`); await p.waitForSelector(`${W} [data-al-cmp-pick] input`);
            assert.match(await p.textContent(`${W} [data-al-cmp-out]`), /Choisis un second lieu/);
            await p.fill(`${W} [data-al-cmp-pick] input`, 'Treignac'); await p.waitForSelector(`${W} [data-al-cmp-pick] [data-i]`, {timeout: 15000}); await p.click(`${W} [data-al-cmp-pick] [data-i]`);
            await p.waitForSelector(`${W} .al-cmp`, {timeout: 20000});
            const heads = await p.$$eval(`${W} .al-cmp .dp-h`, a => a.map(x => x.textContent));
            assert.match(heads[1], /Chamberet/); assert.match(heads[2], /Treignac/); assert.match(heads[1], /ce lieu seulement · 1780–1799/);
            const grid = () => p.$$eval(`${W} .al-cmp [data-al-cmp-row]`, a => a.map(t => { const c1 = t.nextElementSibling, c2 = c1.nextElementSibling, d = c2.nextElementSibling; const n = c => Number((c.querySelector('b')?.textContent || '0').replace(/\D/g, ''));
                return {k: t.dataset.alCmpRow, a: n(c1), b: n(c2), d: d.textContent.trim(), onlyA: c1.classList.contains('is-only'), onlyB: c2.classList.contains('is-only')}; }));
            const g = await grid(); assert.ok(g.length > 1, JSON.stringify(g));
            g.forEach(x => { assert.strictEqual(x.d, x.a === x.b ? '=' : x.a > x.b ? `+${x.a - x.b}` : `−${x.b - x.a}`, 'l’écart ' + x.k); assert.strictEqual(x.onlyA, x.a > 0 && x.b === 0); assert.strictEqual(x.onlyB, x.b > 0 && x.a === 0); });
            assert.ok(g.some(x => x.k === 'guerres' && x.a > 0 && x.b > 0) || g.some(x => x.onlyA || x.onlyB), 'des différences');
            const totA = Number((await p.textContent(`${W} .al-cmp .al-c.al-tot`)).replace(/\D/g, ''));
            await p.click(`${W} [data-al-view] [data-k="table"]`); await sleep(300);
            assert.strictEqual(Number((await p.textContent(`${W} .ui-listbar-count`)).replace(/\D/g, '')), totA, 'la colonne de gauche = le tableau, mêmes filtres');
            await p.click(`${W} [data-al-view] [data-k="cmp"]`); await p.waitForSelector(`${W} .al-cmp`);
            const births = (await grid()).find(x => x.k === 'fam:births');
            await p.click(`${W} [data-ly="fam:births"]`); await sleep(200);
            assert.ok(!(await grid()).some(x => x.k === 'fam:births') || !births, 'une pastille éteinte : des deux côtés');
            await p.click(`${W} [data-ly="fam:births"]`); await sleep(200);
            await p.click(`${W} [data-al-custom]`); await p.click('.ui-actmenu button:has-text("seulement les différences")'); await sleep(200);
            assert.ok((await grid()).every(x => x.a !== x.b), '⚙️ seulement les différences');
            await p.click(`${W} [data-al-custom]`); await p.click('.ui-actmenu button:has-text("seulement les différences")'); await sleep(200);
            const before = await grid();
            await p.click(`${W} [data-al-cmp-swap]`); await p.waitForFunction(w => /Treignac/.test(document.querySelectorAll(`${w} .al-cmp .dp-h`)[1]?.textContent || ''), W, {timeout: 15000});
            assert.strictEqual(await p.inputValue(`${W} [data-dp-ap] input`), 'Treignac'); assert.strictEqual(await p.inputValue(`${W} [data-al-cmp-pick] input`), 'Chamberet');
            await sleep(500); const after = await grid();
            before.forEach(x => { const y = after.find(z => z.k === x.k); if (y) { assert.strictEqual(y.a, x.b); assert.strictEqual(y.b, x.a); } });
            await p.click(`${W} [data-al-cmp-swap]`); await sleep(800);
            await seg(W, 'data-al-zone', 'around'); await p.fill(`${W} [data-al-y0]`, ''); await p.fill(`${W} [data-al-y1]`, ''); await p.press(`${W} [data-al-y1]`, 'Tab'); await sleep(300);
        });

        /* ═════════ 10. 🖨 la fiche imprimable ═════════ */
        await t('🖨 fiche imprimable « Autour de Chamberet, 1780-1799 » : carte, résumé, faits marquants, décennies ; sans les vivants ; ⤓ HTML', async () => {
            await p.click(`${W} [data-al-view] [data-k="map"]`); await sleep(800);
            await p.evaluate(() => { const U = window.LCNDA_UI; U.__pd = U.openPrintDialog; window.__pd = null; U.openPrintDialog = o => { window.__pd = o; return Promise.resolve(null); }; });
            await p.click(`${W} [data-al-print]`); await p.click('.ui-actmenu button:has-text("Imprimer la fiche")');
            const o1 = await p.evaluate(async () => { const o = window.__pd; const on = await o.html({map: true, sum: true, hi: true, dec: true, rows: true, priv: true}), off = await o.html({map: true, sum: true, hi: true, dec: true, rows: true, priv: false});
                return {title: o.title, key: o.key, opts: o.options.map(x => [x.key, x.checked]), on, off}; });
            assert.strictEqual(o1.title, 'Autour de Chamberet'); assert.strictEqual(o1.key, 'autour-lieu');
            assert.deepStrictEqual(o1.opts, [['map', true], ['sum', true], ['hi', true], ['dec', true], ['rows', false], ['priv', true]]);
            for (const s of ['<svg', 'Le résumé par thème', 'Les faits marquants', 'Les décennies', 'Toutes les lignes', 'Antoine LACOMBE', 'Sans les vivants ni les fiches confidentielles.']) assert.ok(o1.on.includes(s), s);
            assert.ok(!/Claire|Paul LACOMBE/.test(o1.on), 'sans la vivante ni la fiche confidentielle');
            assert.ok(/Claire DURAND/.test(o1.off) && /Paul LACOMBE/.test(o1.off), 'le propriétaire peut les garder');
            await p.fill(`${W} [data-al-y0]`, '1780'); await p.fill(`${W} [data-al-y1]`, '1799'); await p.press(`${W} [data-al-y1]`, 'Tab'); await sleep(300);
            await p.click(`${W} [data-al-print]`); await p.click('.ui-actmenu button:has-text("Imprimer la fiche")');
            const o2 = await p.evaluate(async () => { const o = window.__pd; return {title: o.title, html: await o.html({map: true, sum: true, hi: true, dec: true, rows: false, priv: true})}; });
            assert.strictEqual(o2.title, 'Autour de Chamberet, 1780-1799'); assert.match(o2.html, /<title>Autour de Chamberet, 1780-1799<\/title>/);
            assert.ok(!o2.html.includes('<table class="rows">'), 'sans les lignes'); assert.match(o2.html, /1780–1789/); assert.ok(!/1800–1809|1770–1779/.test(o2.html), 'la période');
            assert.match(o2.html, /Le plus ancien : .+\(\d{4}(–\d{4})?\)/); assert.match(o2.html, /<td>1780–1789<\/td>/);
            await p.evaluate(() => { const U = window.LCNDA_UI; U.openPrintDialog = U.__pd; });
            await p.click(`${W} [data-al-print]`); await p.click('.ui-actmenu button:has-text("Imprimer la fiche")');
            await p.waitForSelector('dialog.k-print[open]', {timeout: 10000}); assert.match(await p.textContent('dialog.k-print[open] h2'), /Autour de Chamberet, 1780-1799/);
            await p.click('dialog.k-print[open] [data-k-x]');
            const [dl] = await Promise.all([p.waitForEvent('download', {timeout: 10000}), (async () => { await p.click(`${W} [data-al-print]`); await p.click('.ui-actmenu button:has-text("Télécharger la fiche")'); })()]);
            assert.strictEqual(dl.suggestedFilename(), 'autour-de-chamberet-1780-1799.html');
            const html = fs.readFileSync(await dl.path(), 'utf8'); assert.match(html, /^<!doctype html>/); assert.ok(html.includes('<svg') && !/Claire|Paul LACOMBE/.test(html));
            await p.fill(`${W} [data-al-y0]`, ''); await p.fill(`${W} [data-al-y1]`, ''); await p.press(`${W} [data-al-y1]`, 'Tab'); await sleep(200);
        });
        await t('📊 ⚖️ Comparer (Données) → « Deux lieux » : le bouton ouvre « Tout autour d’un lieu » en ⚖️ Comparer, avec les deux lieux', async () => {
            await closeDlg(); await p.evaluate(() => window.LCNDA_EXT.donneesPlusOutils.compare('p'));
            await p.waitForSelector('dialog[open] [data-dp-ck]'); await p.click('dialog[open] [data-dp-ck] [data-k="l"]');
            for (const [i, n] of [[0, 'Chamberet'], [1, 'Treignac']]) { await p.fill(`dialog[open] [data-dp-c="${i}"] input`, n); await p.waitForSelector(`dialog[open] [data-dp-c="${i}"] [data-i]`, {timeout: 15000}); await p.click(`dialog[open] [data-dp-c="${i}"] [data-i]`); }
            await p.waitForSelector('dialog[open] [data-dp-cmp-al]', {timeout: 20000});
            await p.click('dialog[open] [data-dp-cmp-al]'); await p.waitForSelector('dialog[open] .al-tool [data-al-cmpview]:not([hidden])', {timeout: 10000});
            assert.strictEqual(await pressed('dialog[open]', 'data-al-view'), 'cmp');
            assert.strictEqual(await p.inputValue('dialog[open] [data-dp-ap] input'), 'Chamberet'); assert.strictEqual(await p.inputValue('dialog[open] [data-al-cmp-pick] input'), 'Treignac');
            await p.waitForSelector('dialog[open] .al-cmp', {timeout: 20000});
            await closeDlg();
            await p.evaluate(() => { const v = JSON.parse(localStorage.getItem('genealogie-autour-lieu')); v.view = 'map'; localStorage.setItem('genealogie-autour-lieu', JSON.stringify(v)); });
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
                const ch = await p.evaluate(async () => (await window.LCNDA_APP.api('autour_lieu', {lat: 45.5847, lon: 1.7183, exact: 1, place_id: 2})).items);
                assert.ok(ch.some(x => x.k === 'godparents' && x.p === 902), 'le parrain reste'); assert.ok(!ch.some(x => x.p === 900), 'jamais la marraine vivante'); assert.ok(!ch.some(x => x.lv), 'rien de marqué lv en consultation');
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
            for (const v of ['time', 'cmp', 'table']) { await p.click(`${W} [data-al-view] [data-k="${v}"]`); await sleep(600); assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), v); }
            await p.setViewportSize({width: 1440, height: 900});
        });
        await t('aucune erreur JavaScript', async () => { assert.deepStrictEqual(B.errs, []); });
    } finally {
        await B.stop();
    }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})();
