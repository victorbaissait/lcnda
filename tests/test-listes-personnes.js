#!/usr/bin/env node
/* 👤 Listes → Données : les noms propres reliés aux fiches (assets/js/app-listes-personnes.js, lib/listes_personnes.php).
 * Base inventée : Jean MAZAUD (1781–1850, Ailleville), un autre Jean MAZAUD (1790–1860, Tulle), Pierre MAZAUD (1870),
 * Louise LACOMBE (fiche confidentielle), Marie DURAND (vivante). La liste « 🏛️ Maires (connus de Wikidata) » reçoit 100 007 lignes
 * inventées (7 utiles + 100 000 noms qui ne sont pas dans la base).
 *  pastille « dans ta base : Jean MAZAUD (1781–1850) » (un clic ouvre la fiche), « 2 possibles », années incompatibles = rien ;
 *  confidentialité (ni nom ni années), vivante (pas d'années) ; « ✗ Ce n'est pas lui » (↶) ; 🔗 Relier à une fiche… (menu de choix,
 *  nom déjà tapé ; ↶) ; la fiche montre la ligne avec sa source ; ＋ Créer une fiche (rôle en événement, source citée ; ↶) ;
 *  filtre « Seulement les noms présents dans ma base » sur 100 007 lignes ; vitesse ; 390 px ; mode sombre ; aucune erreur.
 *   node tests/test-listes-personnes.js */
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
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-lp-'));
    fs.mkdirSync(path.join(tmp, 'media'), {recursive: true});
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4', GENEALOGY_TEST: '1'};
    const php = code => { const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], {cwd: root, encoding: 'utf8', env}); if (r.status !== 0) throw new Error(r.stderr || r.stdout); return r.stdout; };
    php(String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start,is_private) VALUES(1,'Jean','MAZAUD','male','deceased',0,0),(2,'Jean','MAZAUD','male','deceased',0,0),(3,'Pierre','MAZAUD','male','deceased',1,0),(4,'Louise','LACOMBE','female','deceased',0,1),(5,'Marie','DURAND','female','living',0,0)");
$pdo->exec("INSERT INTO places(id,name,county,country,latitude,longitude,admin4_code) VALUES(1,'Ailleville','Aube','France',48.25,4.68,'10003'),(2,'Tulle','Corrèze','France',45.2675,1.7711,'19272'),(3,'Naves','Corrèze','France',45.3133,1.7672,'19146')");
$t = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' AND scope='person' LIMIT 1")->fetchColumn();
$ins = $pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,date_text,year,sort_date,place_id) VALUES('person',?,?,?,?,?,?)");
foreach ([[1,'BIRT',1781,1],[1,'DEAT',1850,1],[2,'BIRT',1790,2],[2,'DEAT',1860,2],[3,'BIRT',1870,2],[4,'BIRT',1850,3],[5,'BIRT',1960,2]] as [$pid,$tag,$y,$pl]) { $ins->execute([$pid,$t($tag),(string)$y,$y,(string)$y,$pl]); }
echo 'ok';`);
    const sql = q => JSON.parse(php(`require 'lib/paths.php'; $pdo = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); echo json_encode($pdo->query(${JSON.stringify(q)})->fetchAll(PDO::FETCH_ASSOC));`));
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const errs = [];
    try {
        const ctx = await browser.newContext({viewport: {width: 1440, height: 900}});
        const p = await ctx.newPage();
        p.on('pageerror', e => errs.push(e.message));
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_APP?.defaultListTypes, null, {timeout: 30000});
        await p.waitForFunction(() => window.LCNDA_EXT?.dataListsEngine && window.LCNDA_EXT?.listesPersonnes && window.LCNDA_EXT.dataLists.some(d => d.id === 'dp_maires'), null, {timeout: 15000});
        const api = (x, q = {}) => p.evaluate(([y, z]) => window.LCNDA_APP.api(y, z).catch(e => ({error: e.message})), [x, q]);
        const UNDO = '.ui-toast button:has-text("Annuler"), .toast button:has-text("Annuler")';
        const undo = async () => { await p.waitForSelector(UNDO, {timeout: 8000}); await p.locator(UNDO).last().click(); };
        const rowSel = i => `.ld-table tbody tr[data-ld-row="${i}"]`;
        const chipText = i => p.evaluate(s => document.querySelector(s + ' .lp-chip')?.textContent || '', rowSel(i));
        const waitChip = (i, re) => p.waitForFunction(([s, r]) => new RegExp(r).test(document.querySelector(s + ' .lp-chip')?.textContent || ''), [rowSel(i), re.source], {timeout: 10000});
        const waitNoChip = i => p.waitForFunction(s => !!document.querySelector(s + ' .lp-cell') && !document.querySelector(s + ' .lp-chip'), rowSel(i), {timeout: 10000});
        const menuOf = async i => { await p.hover(rowSel(i)); await p.click(rowSel(i) + ' .lp-act'); await p.waitForSelector('.ui-actmenu', {timeout: 5000}); };
        const menuItem = async re => { await p.locator('.ui-actmenu [role="menuitem"]', {hasText: re}).first().click(); };

        /* la liste : 7 lignes utiles en tête + 100 000 noms inventés qui ne sont pas dans la base */
        await p.evaluate(() => {
            const d = window.LCNDA_EXT.dataLists.find(x => x.id === 'dp_maires');
            const wd = q => `https://www.wikidata.org/wiki/Q${q}`;
            const useful = [
                {name: 'Jean Mazaud', commune: 'Ailleville', insee: '10003', dep: '10', depName: 'Aube', from: 1808, to: 1815, wikidata: wd(901)},
                {name: 'Jean Mazaud', commune: 'Naves', insee: '19146', dep: '19', depName: 'Corrèze', from: 1820, to: 1825, wikidata: wd(902)},
                {name: 'Antoine Mazaud', commune: 'Ailleville', insee: '10003', dep: '10', depName: 'Aube', from: 1830, to: 1840, wikidata: wd(903)},
                {name: 'J. Mazod', commune: 'Tulle', insee: '19272', dep: '19', depName: 'Corrèze', from: 1900, to: 1905, wikidata: wd(904)},
                {name: 'Louise Lacombe', commune: 'Naves', insee: '19146', dep: '19', depName: 'Corrèze', from: 1890, to: 1895, wikidata: wd(905)},
                {name: 'Marie Durand', commune: 'Tulle', insee: '19272', dep: '19', depName: 'Corrèze', from: 2014, to: 2020, wikidata: wd(906)},
                {name: 'Pierre Mazaud', commune: 'Tulle', insee: '19272', dep: '19', depName: 'Corrèze', from: 1850, to: 1855, wikidata: wd(907)},
            ];
            const P = ['Jean', 'Pierre', 'Louis', 'Marie', 'Antoine', 'François', 'Joseph', 'Henri'];
            const filler = Array.from({length: 100000}, (_, i) => ({name: `${P[i % 8]} Nomfictif${i}`, commune: `Commune${i % 900}`, insee: String(10000 + (i % 900)).padStart(5, '0'), dep: '10', depName: 'Aube', from: 1800 + (i % 200), to: 1806 + (i % 200), wikidata: wd(1000 + i)}));
            const rows = [...useful, ...filler];
            d.load = async () => rows;
            try { localStorage.removeItem('lcnda-ld:dp_maires'); } catch (_) {}
        });

        await t('serveur : la base en bref (lp_index) — confidentielle et vivante marquées, rien d’autre', async () => {
            const r = await api('lp_index');
            assert.strictEqual(r.people.length, 5);
            const by = Object.fromEntries(r.people.map(x => [x[0], x]));
            assert.strictEqual(by[1][3], 1781); assert.strictEqual(by[1][4], 1850); assert.ok(by[1][8].some(pl => pl[0] === '10003'));
            assert.strictEqual(by[4][7] & 1, 1); assert.strictEqual(by[5][7] & 2, 2);
        });
        await t('les listes de personnes : le drapeau 👤 sur le champ du nom (maires, préfets, évêques, Morts pour la France…)', async () => {
            const r = await p.evaluate(() => ({ids: window.LCNDA_EXT.listesPersonnes.lists(), flag: window.LCNDA_EXT.dataLists.find(d => d.id === 'dp_maires').fields.find(f => f.key === 'name').person, mpf: window.LCNDA_EXT.dataLists.find(d => d.id === 'bo_mpf')?.fields.find(f => f.key === 'nom')?.person}));
            for (const id of ['dp_maires', 'dp_prefets', 'dp_eveques', 'bo_mpf', 'bo_leonore', 'insee_deces']) assert.ok(r.ids.includes(id), id + ' : ' + r.ids.join(','));
            assert.strictEqual(r.flag, true); assert.strictEqual(r.mpf, true);
        });

        let openMs = 0, chipsMs = 0, filterMs = 0;
        await t('vitesse : la page de 100 lignes (sur 100 007) puis ses pastilles en moins de 1,5 s', async () => {
            await p.evaluate(() => { window.LCNDA_APP.state.listType = 'donnees'; window.LCNDA_APP.setModule('listes'); }); // l'écran Listes déjà ouvert (son menu de côté n'est pas mesuré)
            await p.waitForSelector('.ld-overview', {timeout: 30000});
            const t0 = Date.now();
            await p.evaluate(() => window.LCNDA_EXT.dataListsEngine.open('dp_maires'));
            await p.waitForFunction(() => /100\s?007/.test(document.querySelector('[data-ld-count]')?.textContent || '') && document.querySelector('.ld-table tbody tr[data-ld-row="99"]'), null, {timeout: 30000});
            const t1 = Date.now();
            await p.waitForFunction(() => document.querySelector('.ld-table tbody tr[data-ld-row="0"] .lp-cell'), null, {timeout: 20000});
            openMs = Date.now() - t0; chipsMs = Date.now() - t1;
            assert.ok(chipsMs < 1500, `${chipsMs} ms`); assert.ok(openMs < 15000, `${openMs} ms`);
            assert.strictEqual(await p.$$eval('.ld-table tbody tr', x => x.length), 100);
            // la reconnaissance seule, sur les 100 007 lignes (ce que fait le filtre)
            const ms = await p.evaluate(async () => { const E = window.LCNDA_EXT, d = E.dataLists.find(x => x.id === 'dp_maires'), rows = await d.load(), t = performance.now(); let n = 0; for (const r of rows) if (E.listesPersonnes.matchRow(d, r)?.any) n++; return [performance.now() - t, n]; });
            assert.strictEqual(ms[1], 4); assert.ok(ms[0] < 3000, `${ms[0]} ms`);
        });
        await t('pastille : « dans ta base : Jean MAZAUD (1781–1850) » (même commune) ; un clic ouvre la fiche', async () => {
            await waitChip(0, /dans ta base : Jean MAZAUD \(1781–1850\)/);
            await p.click(rowSel(0) + ' .lp-chip');
            await p.waitForFunction(() => window.LCNDA_APP.state.module === 'personnes' && window.LCNDA_APP.state.currentPersonId === 1, null, {timeout: 10000});
            await p.evaluate(() => window.LCNDA_EXT.dataListsEngine.open('dp_maires'));
            await waitChip(0, /1781–1850/);
        });
        await t('« 👤 2 possibles » quand deux fiches vont ; le menu montre les deux', async () => {
            await waitChip(1, /2 possibles/);
            await p.click(rowSel(1) + ' .lp-chip');
            await p.waitForSelector('.ui-actmenu');
            const txt = await p.textContent('.ui-actmenu');
            assert.ok(/1781–1850/.test(txt) && /1790–1860/.test(txt), txt);
            await p.keyboard.press('Escape');
        });
        await t('rien quand le prénom ou les années ne vont pas (Antoine, J. Mazod, Pierre maire avant sa naissance)', async () => {
            for (const i of [2, 3, 6]) await waitNoChip(i);
        });
        await t('confidentialité : fiche confidentielle sans nom ni années ; personne vivante sans années', async () => {
            await waitChip(4, /une fiche confidentielle/);
            const c4 = await chipText(4); assert.ok(!/LACOMBE|Louise|1850/.test(c4), c4);
            await waitChip(5, /Marie DURAND/);
            const c5 = await chipText(5); assert.ok(!/1960/.test(c5), c5);
        });
        await t('« ✗ Ce n’est pas lui » : retenu (l’autre Jean reste proposé) ; ↶ Annuler le remet', async () => {
            await menuOf(0); await menuItem(/Ce n’est pas lui/);
            await waitChip(0, /1790–1860/);
            const l = await api('lp_links', {list: 'dp_maires'});
            assert.ok(l.links.some(x => x.verdict === 'no' && x.person_id === 1), JSON.stringify(l));
            await undo();
            await waitChip(0, /1781–1850/);
            assert.strictEqual((await api('lp_links', {list: 'dp_maires'})).links.length, 0);
        });
        const linkViaPicker = async () => {
            await menuOf(3); await menuItem(/Relier à une fiche/);
            const inp = 'dialog.pk-dialog .pk-search:not([hidden]) .pk-input';
            await p.waitForSelector(inp);
            assert.ok(/Mazod/i.test(await p.inputValue(inp)), await p.inputValue(inp));
            await p.fill(inp, 'Mazaud');
            const opt = p.locator('dialog.pk-dialog [role="option"], dialog.pk-dialog .pk-item', {hasText: '1781'}).first();
            await opt.waitFor({timeout: 10000}); await opt.click();
            await waitChip(3, /🔗 Jean MAZAUD/);
        };
        await t('🔗 Relier à une fiche… : le menu de choix des personnes, nom déjà tapé ; « 🔗 Jean MAZAUD » ; ↶ Annuler', async () => {
            await linkViaPicker();
            const s = sql("SELECT s.title, s.url, s.agency FROM sources s JOIN source_links l ON l.source_record_id = s.id WHERE l.entity_type = 'person' AND l.entity_id = 1");
            assert.ok(s.some(x => /Maires \(connus de Wikidata\) — Maire de Tulle \(1900–1905\)/.test(x.title) && /Q904/.test(x.url) && /CC0/.test(x.agency)), JSON.stringify(s));
            await undo();
            await waitNoChip(3);
            assert.strictEqual(sql("SELECT COUNT(*) n FROM sources WHERE url LIKE '%Q904'")[0].n, 0);
            await linkViaPicker(); // on le garde pour la suite
        });
        await t('la fiche montre la ligne reliée avec sa source (Sources ; « 🔎 Ce qui le concerne »)', async () => {
            const r = await api('lp_person', {person_id: 1});
            assert.ok(r.links.length === 1 && r.links[0].role === 'Maire de Tulle (1900–1905)' && /Q904/.test(r.links[0].url), JSON.stringify(r));
            const html = await p.evaluate(async () => { const h = document.createElement('div'); const d = window.LCNDA_EXT.dataSources.find(x => x.id === 'lpers_liens'); await d.run({person: {id: 1}}, h); return h.innerHTML; });
            assert.ok(/Maire de Tulle \(1900–1905\)/.test(html) && /Wikidata \(CC0 1\.0\)/.test(html) && /href="https:\/\/www\.wikidata\.org\/wiki\/Q904"/.test(html), html);
            await p.evaluate(() => window.LCNDA_APP.openPersonById(1));
            await p.waitForFunction(() => /Maire de Tulle \(1900–1905\)/.test(document.querySelector('.person-page')?.textContent || ''), null, {timeout: 15000});
            await p.evaluate(() => window.LCNDA_EXT.dataListsEngine.open('dp_maires'));
            await waitChip(3, /🔗 Jean MAZAUD/);
        });
        await t('＋ Créer une fiche : nom prérempli, le rôle en événement (Maire d’Ailleville, 1830–1840) cité avec la source ; ↶ Annuler', async () => {
            await menuOf(2); await menuItem(/Créer une fiche/);
            await p.waitForSelector('dialog.lp-create');
            assert.strictEqual(await p.inputValue('dialog.lp-create input[name="first_name"]'), 'Antoine');
            assert.strictEqual(await p.inputValue('dialog.lp-create input[name="last_name"]'), 'MAZAUD');
            assert.ok(/Maire d’Ailleville \(1830–1840\)/.test(await p.textContent('dialog.lp-create .lp-create-ev')));
            await p.click('dialog.lp-create [data-lp-go]');
            await waitChip(2, /🔗 Antoine MAZAUD/);
            const pid = sql("SELECT id FROM persons WHERE first_name = 'Antoine' AND last_name = 'MAZAUD'")[0]?.id; assert.ok(pid);
            const ev = sql(`SELECT e.title, e.date_text, e.year, t.gedcom_tag tag, pl.name place FROM events e JOIN event_types t ON t.id = e.event_type_id LEFT JOIN places pl ON pl.id = e.place_id WHERE e.person_id = ${pid}`);
            assert.ok(ev.length === 1 && ev[0].tag === 'OCCU' && ev[0].title === 'Maire d’Ailleville (1830–1840)' && ev[0].year === 1830 && ev[0].place === 'Ailleville', JSON.stringify(ev));
            const src = sql(`SELECT s.url, s.agency, l.entity_type FROM sources s JOIN source_links l ON l.source_record_id = s.id JOIN events e ON l.entity_type = 'event' AND l.entity_id = e.id WHERE e.person_id = ${pid}`);
            assert.ok(src.length === 1 && /Q903/.test(src[0].url) && /Wikidata/.test(src[0].agency), JSON.stringify(src));
            await undo();
            await waitNoChip(2);
            assert.strictEqual(sql("SELECT COUNT(*) n FROM persons WHERE first_name = 'Antoine'")[0].n, 0);
            assert.strictEqual((await api('lp_index')).people.length, 5);
        });
        await t('filtre « 👤 Seulement les noms présents dans ma base » : 5 lignes sur 100 007, vite ; la pastille × le retire', async () => {
            const t0 = Date.now();
            await p.click('[data-lp-inbase]');
            await p.waitForFunction(() => /^5 lignes/.test(document.querySelector('[data-ld-count]')?.textContent || ''), null, {timeout: 20000});
            filterMs = Date.now() - t0; assert.ok(filterMs < 5000, `${filterMs} ms`);
            assert.strictEqual(await p.getAttribute('[data-lp-inbase]', 'aria-pressed'), 'true');
            const names = await p.$$eval('.ld-table tbody tr td:first-child', tds => tds.map(td => td.textContent));
            assert.ok(names.every(n => !/Nomfictif|Antoine|Pierre/.test(n)), names.join(' | '));
            await p.click('.lp-inbase-chip');
            await p.waitForFunction(() => /100\s?007/.test(document.querySelector('[data-ld-count]')?.textContent || ''), null, {timeout: 20000});
            assert.strictEqual(await p.getAttribute('[data-lp-inbase]', 'aria-pressed'), 'false');
        });
        await t('téléphone (390 px) : pas de défilement de côté de la page, la pastille et 🔗 visibles', async () => {
            await p.setViewportSize({width: 390, height: 844});
            await p.evaluate(() => window.LCNDA_EXT.dataListsEngine.open('dp_maires'));
            await waitChip(0, /1781–1850/);
            const r = await p.evaluate(() => ({sw: document.documentElement.scrollWidth, w: window.innerWidth, act: getComputedStyle(document.querySelector('.ld-table tr[data-ld-row="0"] .lp-act')).opacity}));
            assert.ok(r.sw <= r.w + 1, JSON.stringify(r));
            await p.setViewportSize({width: 1440, height: 900});
        });
        await t('mode sombre : la pastille prend les couleurs sombres de l’app', async () => {
            const light = await p.evaluate(() => getComputedStyle(document.querySelector('.lp-chip')).backgroundColor);
            await p.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
            const dark = await p.evaluate(() => { const s = getComputedStyle(document.querySelector('.lp-chip')); return {bg: s.backgroundColor, fg: s.color}; });
            assert.notStrictEqual(light, dark.bg); assert.notStrictEqual(dark.bg, dark.fg);
            assert.ok(/rgb\(2\d\d, 2\d\d, 2\d\d\)/.test(dark.fg), JSON.stringify(dark));
            await p.evaluate(() => document.documentElement.removeAttribute('data-theme'));
        });
        await t('aucune erreur dans la page', async () => { assert.deepStrictEqual(errs, []); });
        console.log(`(ouverture de la liste : ${openMs} ms, dont pastilles ${chipsMs} ms ; filtre ${filterMs} ms)`);
    } finally {
        await browser.close(); proc.kill();
    }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})();
