#!/usr/bin/env node
/* ＋ Créer ma liste (assets/js/app-listes-perso.js, app-listes-perso-core.js, lib/listes_perso.php).
 * Base inventée : Jean MAZAUD (1781–1850, Tulle), lieux Tulle (19272), Naves (19146), Ailleville (10003).
 *  calcul : CSV avec dates françaises, TSV collé, HTML collé, en-tête deviné, formules vidées, nombres « 1 234,5 » ;
 *  écran : un CSV (dates françaises, communes) → Importer → Vérifier (types devinés, un type changé) → Créer → la liste dans
 *  « Mes listes » : 📅 Période, 📍 Autour de… / 🗺 Carte, 👤 nom reconnu dans la base, 🧺 Prendre… ; collage d'un tableur (TSV) ;
 *  XLSX ; ✎ Modifier (type d'une colonne) ↶ ; ＋ Ajouter une ligne ↶ ; ⤒ Remplacer par un fichier ↶ ; ⊕ fusion ; 🗑 Supprimer ↶ ;
 *  ⇪ Partager (fichier relu) ; sécurité (HTML dans une case, =cmd, export protégé, fichier trop gros, 500 000 lignes, 5 000 par envoi,
 *  CSRF, mode consultation) ; 390 px ; mode sombre ; aucune erreur.
 *   node tests/test-listes-perso.js */
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
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 8).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const CSV = [
    'Nom;Date du décès;Commune;Âge;Lien;Note',
    'Jean MAZAUD;12 mars 1813;Tulle;32;https://example.org/a;<img src=x onerror="window.__pwned=1">',
    'Pierre Lacombe;1er avril 1815;Naves (19);40;https://example.org/b;=cmd|\' /C calc\'!A0',
    'Louis Bordas;3 février 1790;19272;25;https://example.org/c;<b>gras</b>',
    'Marie Rivière;mars 1850;Ailleville;61;https://example.org/d;rien',
    'Henri Faure;15/06/1871;Tulle;19;https://example.org/e;',
].join('\r\n');

(async () => {
    /* ═════════ le calcul, sans navigateur ═════════ */
    global.LCNDA_SHEET = require('../assets/js/app-tableur-engine.js');
    const core = require('../assets/js/app-listes-perso-core.js');
    await t('calcul : CSV « ; » avec dates françaises, communes, nombres, liens ; formules vidées ; en-tête deviné', async () => {
        const r = core.fromText(CSV); assert.strictEqual(r.sep, ';');
        const sh = core.shape(r.rows); assert.strictEqual(sh.header, true); assert.strictEqual(sh.body.length, 5); assert.strictEqual(sh.stats.formulas, 1);
        assert.strictEqual(sh.body[1][5], '', 'la formule =cmd est vidée');
        const cols = core.guessColumns(sh.head, sh.body, {placeHits: {2: 1}});
        assert.deepStrictEqual(cols.map(c => c.type), ['person', 'date', 'place', 'number', 'url', 'text']);
        assert.strictEqual(core.isoDate('12 mars 1813'), '1813-03-12'); assert.strictEqual(core.isoDate('1er avril 1815'), '1815-04-01');
        assert.strictEqual(core.isoDate('mars 1850'), '1850-03'); assert.strictEqual(core.isoDate('15/06/1871'), '1871-06-15');
        assert.strictEqual(core.parseNumber('1 234,5'), 1234.5); assert.strictEqual(core.parseNumber('48.85'), 48.85);
        const row = core.buildRow({c0: 'Jean MAZAUD', c1: '12 mars 1813', c2: 'Tulle'}, cols, {Tulle: ['19272', 'Tulle', 45.2675, 1.7711, 'Corrèze']});
        assert.deepStrictEqual([row.c1, row._y1, row._lat, row._insee], ['1813-03-12', 1813, 45.2675, '19272']);
    });
    await t('calcul : tableau collé d’un tableur (TSV) et d’une page web (HTML), sans titres', async () => {
        const r = core.fromText('Tulle\t1813\t45,2675\t1,7711\nNaves\t1820\t45,31\t1,77\n'); assert.strictEqual(r.sep, '\t');
        const sh = core.shape(r.rows); assert.strictEqual(sh.header, false); assert.strictEqual(sh.body.length, 2);
        const {JSDOM} = (() => { try { return require('jsdom'); } catch (_) { return {}; } })();
        if (JSDOM) { const h = core.fromHtml('<table><tr><th>Nom</th><th>An</th></tr><tr><td>A<script>x</script></td><td>1800</td></tr></table>', new JSDOM('').window.DOMParser); assert.strictEqual(h.rows.length, 2); }
        const cols = core.guessColumns(['Lieu', 'An', 'Latitude', 'Longitude'], sh.body.concat(sh.body));
        assert.deepStrictEqual(cols.map(c => c.type), ['place', 'year', 'lat', 'lon']);
    });

    /* ═════════ l'app ═════════ */
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-lpx-'));
    fs.mkdirSync(path.join(tmp, 'media'), {recursive: true});
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4', GENEALOGY_TEST: '1'};
    const php = code => { const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], {cwd: root, encoding: 'utf8', env}); if (r.status !== 0) throw new Error(r.stderr || r.stdout); return r.stdout; };
    php(String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start,is_private) VALUES(1,'Jean','MAZAUD','male','deceased',1,0)");
$pdo->exec("INSERT INTO places(id,name,county,country,latitude,longitude,admin2_code,admin4_code,population) VALUES(1,'Tulle','Corrèze','France',45.2675,1.7711,'19','19272',15000),(2,'Naves','Corrèze','France',45.3133,1.7672,'19','19146',2400),(3,'Ailleville','Aube','France',48.25,4.68,'10','10003',300)");
$t = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' AND scope='person' LIMIT 1")->fetchColumn();
$ins = $pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,date_text,year,sort_date,place_id) VALUES('person',?,?,?,?,?,?)");
$ins->execute([1,$t('BIRT'),'1781',1781,'1781',1]); $ins->execute([1,$t('DEAT'),'1813',1813,'1813',1]);
echo 'ok';`);
    const sql = q => JSON.parse(php(`require 'lib/paths.php'; $pdo = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); echo json_encode($pdo->query(${JSON.stringify(q)})->fetchAll(PDO::FETCH_ASSOC));`));
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const csvPath = path.join(tmp, 'deces-tulle.csv'); fs.writeFileSync(csvPath, CSV, 'latin1'); // un vieil Excel (Windows-1252)
    const browser = await chromium.launch();
    const errs = [];
    try {
        const ctx = await browser.newContext({viewport: {width: 1280, height: 900}, acceptDownloads: true});
        const p = await ctx.newPage();
        p.on('pageerror', e => errs.push(e.message));
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.listesPerso && window.LCNDA_EXT?.dataListsEngine, null, {timeout: 30000});
        const UNDO = '.ui-toast button:has-text("Annuler"), .toast button:has-text("Annuler")';
        const undo = async () => { await p.waitForSelector(UNDO, {timeout: 8000}); await p.locator(UNDO).last().click(); };
        const listId = () => p.evaluate(() => window.LCNDA_EXT.listesPerso.lists()[0]?.id);
        const rowsOnPage = () => p.$$eval('.ld-table tbody tr[data-ld-row]', trs => trs.length);
        const waitRows = n => p.waitForFunction(k => document.querySelectorAll('.ld-table tbody tr[data-ld-row]').length === k, n, {timeout: 10000});
        let id = 0;

        await t('« ＋ Créer ma liste » est dans Listes → Données ; Importer un CSV (vieil Excel) → Vérifier : colonnes comprises', async () => {
            await p.evaluate(() => window.LCNDA_EXT.listesPerso.create());
            await p.waitForSelector('[data-lpx-page] [data-lpx-drop]');
            assert.ok(await p.evaluate(() => window.LCNDA_APP.defaultListTypes.some(x => x[0] === 'perso_new')));
            await p.setInputFiles('[data-lpx-file]', csvPath);
            await p.waitForSelector('[data-lpx-cols]', {timeout: 10000});
            const types = await p.$$eval('[data-lpx-type]', s => s.map(x => x.value));
            assert.deepStrictEqual(types, ['person', 'date', 'place', 'number', 'url', 'text']);
            const sum = await p.textContent('.lpx-sum'); assert.ok(/5 lignes/.test(sum) && /WINDOWS|Windows/.test(sum) && /« ; »/.test(sum), sum);
            assert.ok(/1 case|formules/.test(await p.textContent('.lpx-check')), 'la case =cmd est signalée');
            assert.ok(/Rivière/.test(await p.textContent('.lpx-table')), 'accents relus (Windows-1252)');
            assert.ok(/1813-03-12/.test(await p.textContent('.lpx-table')));
        });
        await t('Vérifier : changer le type d’une colonne et son titre, puis Créer (nom, source, licence, lien)', async () => {
            await p.selectOption('[data-lpx-type="3"]', 'text');
            assert.strictEqual(await p.$eval('[data-lpx-type="3"]', s => s.value), 'text');
            await p.fill('[data-lpx-lab="3"]', 'Âge au décès');
            await p.click('[data-lpx-next]');
            await p.waitForSelector('[data-lpx-form]');
            assert.strictEqual(await p.inputValue('[data-lpx-name]'), 'deces tulle');
            await p.fill('[data-lpx-name]', 'Décès à Tulle');
            await p.fill('[name="source"]', 'Relevé de l’association');
            await p.fill('[name="licence"]', 'CC BY 4.0');
            await p.fill('[name="source_url"]', 'https://example.org/releve');
            await p.click('[data-lpx-create]');
            await p.waitForSelector('.ld-page[data-ld-page^="perso_"] .ld-table', {timeout: 15000});
            id = await listId(); assert.ok(id > 0);
            assert.strictEqual(await rowsOnPage(), 5);
            const d = await p.evaluate(i => { const x = window.LCNDA_EXT.dataLists.find(y => y.id === 'perso_' + i); return {group: x.group, fields: x.fields.map(f => f.type), src: x.source, url: x.sourceUrl}; }, id);
            assert.deepStrictEqual(d.fields, ['text', 'date', 'place', 'text', 'url', 'text']);
            assert.strictEqual(d.group, 'Mes listes'); assert.ok(/Relevé/.test(d.src) && /CC BY/.test(d.src)); assert.strictEqual(d.url, 'https://example.org/releve');
            assert.ok(await p.$('[data-lpx-bar]'), 'la barre « Ma liste »');
            assert.ok(/Relevé de l’association/.test(await p.textContent('.ld-source')));
            const db = sql('SELECT row_count, name FROM ulist_lists'); assert.deepStrictEqual(db, [{row_count: 5, name: 'Décès à Tulle'}]); // dans la base (et donc dans ses sauvegardes)
        });
        await t('HTML dans une case : montré comme du texte, jamais exécuté', async () => {
            assert.ok(await p.evaluate(() => window.__pwned === undefined));
            assert.ok(/<img src=x/.test(await p.textContent('.ld-table')));
            assert.strictEqual(await p.$$eval('.ld-table img', x => x.length), 0);
        });
        await t('📅 Période et 📍 Autour de… / 🗺 Carte marchent (dates françaises, communes et code Insee)', async () => {
            assert.ok(await p.$('[data-ld-period]') && await p.$('[data-ld-near]') && await p.$('[data-ld-view="map"]'));
            await p.evaluate(i => window.LCNDA_EXT.dataListsEngine.open('perso_' + i, {period: {mode: 'within', from: 1810, to: 1820}}), id);
            await waitRows(2);
            await p.evaluate(i => window.LCNDA_EXT.dataListsEngine.open('perso_' + i, {near: {lat: 45.2675, lon: 1.7711, km: 2, title: 'Tulle'}}), id);
            await waitRows(3); // Tulle ×2 + 19272 (code Insee) ; Naves est à 5 km
            await p.evaluate(i => window.LCNDA_EXT.dataListsEngine.open('perso_' + i, {view: 'map'}), id);
            await p.waitForSelector('.ld-results .leaflet-container, .ld-results canvas, .ld-results svg, .ld-results [class*="map"]', {timeout: 10000});
            const pts = await p.evaluate(async i => { const d = window.LCNDA_EXT.dataLists.find(y => y.id === 'perso_' + i); return (await d.load()).filter(r => d.geo(r)).length; }, id);
            assert.strictEqual(pts, 5);
            await p.evaluate(i => window.LCNDA_EXT.dataListsEngine.open('perso_' + i, {}), id); await waitRows(5);
        });
        await t('👤 la colonne « personne » : Jean MAZAUD reconnu dans la base ; 🧺 Prendre… et 📎 recherche branchés', async () => {
            await p.waitForFunction(() => /dans ta base|Jean MAZAUD/.test(document.querySelector('.ld-table tbody tr[data-ld-row="0"] .lp-chip')?.textContent || ''), null, {timeout: 10000});
            if (await p.evaluate(() => !!window.LCNDA_EXT.connexions?.listBar && window.LCNDA_EXT.connexions.enabled?.() !== false)) assert.ok(await p.$('[data-ld-take]'), '🧺 Prendre…');
            const hit = await p.evaluate(async i => { const E = window.LCNDA_EXT.dataListsEngine, d = E.list().find(x => x.id === 'perso_' + i); const r = await E.fetchPage(d, {...E.stateOf(d.id), q: 'bordas', crit: [], period: null, near: null}, 0, 10); return r.rows.map(x => x.c0); }, id);
            assert.deepStrictEqual(hit, ['Louis Bordas']);
        });
        await t('⤓ Exporter : une case « =… » ajoutée à la main sort protégée (pas de formule dans le tableur)', async () => {
            await p.click('[data-lpx-act="add"]');
            await p.waitForSelector('dialog[open] .lpx-addrow');
            await p.fill('dialog[open] [name="v_0"]', '=HYPERLINK("http://evil","x")'); await p.fill('dialog[open] [name="v_1"]', '2 janvier 1900');
            await p.click('dialog[open] button[type="submit"]');
            await waitRows(6);
            const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-ld-export]')]);
            const txt = fs.readFileSync(await dl.path(), 'utf8');
            assert.ok(/'=HYPERLINK/.test(txt), txt.slice(0, 400)); assert.ok(!/[;\n]=HYPERLINK/.test(txt));
            await undo(); await waitRows(5); // ↶ la ligne ajoutée
        });
        await t('✎ Modifier : le type d’une colonne (Note → catégorie) et le nom ; ↶ Annuler', async () => {
            await p.click('[data-lpx-act="edit"]'); await p.waitForSelector('dialog[open] .lpx-cols-edit');
            await p.selectOption('dialog[open] [name="type_3"]', 'number'); await p.fill('dialog[open] [name="name"]', 'Décès (Tulle)');
            await p.click('dialog[open] button[type="submit"]');
            await p.waitForFunction(i => window.LCNDA_EXT.dataLists.find(y => y.id === 'perso_' + i)?.fields[3].type === 'number', id, {timeout: 8000});
            assert.strictEqual(await p.evaluate(i => window.LCNDA_EXT.dataLists.find(y => y.id === 'perso_' + i).label, id), 'Décès (Tulle)');
            await undo();
            await p.waitForFunction(i => window.LCNDA_EXT.dataLists.find(y => y.id === 'perso_' + i)?.fields[3].type === 'text', id, {timeout: 8000});
            assert.strictEqual(sql('SELECT name FROM ulist_lists')[0].name, 'Décès à Tulle');
        });
        await t('⤒ Remplacer par un fichier puis ↶ Annuler ; ⊕ Ajouter un fichier (colonne nouvelle ajoutée)', async () => {
            const repl = path.join(tmp, 'remplace.csv'); fs.writeFileSync(repl, 'Nom;Commune;Date du décès\nAnne Vialle;Naves;1900\n');
            await p.click('[data-lpx-act="replace"]'); await p.waitForSelector('dialog[open] [data-lpx-file]', {state: 'attached'});
            await p.setInputFiles('dialog[open] [data-lpx-file]', repl);
            await waitRows(1);
            assert.strictEqual(sql('SELECT row_count FROM ulist_lists')[0].row_count, 1);
            await undo(); await waitRows(5);
            assert.strictEqual(sql('SELECT row_count FROM ulist_lists')[0].row_count, 5);
            const more = path.join(tmp, 'plus.csv'); fs.writeFileSync(more, 'Nom;Commune;Métier\nPaul Roux;Tulle;sabotier\n');
            await p.click('[data-lpx-act="merge"]'); await p.waitForSelector('dialog[open] [data-lpx-file]', {state: 'attached'});
            await p.setInputFiles('dialog[open] [data-lpx-file]', more);
            await waitRows(6);
            const cols = await p.evaluate(i => window.LCNDA_EXT.dataLists.find(y => y.id === 'perso_' + i).fields.map(f => f.label), id);
            assert.ok(cols.includes('Métier'), cols.join());
            await undo(); await waitRows(5);
        });
        await t('📋 Coller un tableau d’un tableur (TSV) → Vérifier → Créer', async () => {
            await p.evaluate(() => window.LCNDA_EXT.listesPerso.create({text: 'Lieu\tAn\tLatitude\tLongitude\nTulle\t1813\t45,2675\t1,7711\nNaves\t1820\t45,3133\t1,7672\n'}));
            await p.waitForSelector('[data-lpx-cols]', {timeout: 10000});
            assert.deepStrictEqual(await p.$$eval('[data-lpx-type]', s => s.map(x => x.value)), ['place', 'year', 'lat', 'lon']);
            assert.ok(/tabulation/.test(await p.textContent('.lpx-sum')) || /tableur/.test(await p.textContent('.lpx-sum')));
            await p.click('[data-lpx-next]'); await p.fill('[data-lpx-name]', 'Collé'); await p.click('[data-lpx-create]');
            await p.waitForSelector('.ld-page[data-ld-page^="perso_"] .ld-table', {timeout: 15000}); await waitRows(2);
        });
        await t('XLSX (moteur des tableaux de l’app) : lu et compris', async () => {
            const r = await p.evaluate(async () => {
                const SH = window.LCNDA_SHEET, wb = SH.newWorkbook(); wb.sheets[0].cells = SH.rowsToCells([['Commune', 'Année', 'Nom'], ['Tulle', 1813, 'Jean MAZAUD'], ['Naves', 1820, 'Paul Roux']]);
                const blob = await SH.toXlsx(SH.normalize(wb)); const buf = await blob.arrayBuffer();
                const got = await window.LCNDA_EXT.listesPerso.readInput({buffer: buf, name: 'essai.xlsx'}); const v = await window.LCNDA_EXT.listesPerso.understand(got);
                return {kind: got.info.kind, types: v.cols.map(c => c.type), n: v.body.length};
            });
            assert.ok(/xlsx/i.test(r.kind)); assert.strictEqual(r.n, 2); assert.deepStrictEqual(r.types, ['place', 'year', 'person']);
        });
        await t('⇪ Partager : seulement après confirmation ; le fichier se relit avec « ＋ Créer ma liste »', async () => {
            await p.evaluate(i => window.LCNDA_EXT.listesPerso.open(i), id); await waitRows(5);
            await p.click('[data-lpx-act="share"]');
            await p.waitForSelector('dialog.modal[open], .ui-confirm, dialog[open]');
            const [dl] = await Promise.all([p.waitForEvent('download'), p.locator('dialog[open] button', {hasText: /partager/i}).last().click()]);
            const j = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
            assert.strictEqual(j.lcnda_list, 1); assert.strictEqual(j.rows.length, 5); assert.strictEqual(j.columns[1].type, 'date');
            const v = await p.evaluate(async txt => { const L = window.LCNDA_EXT.listesPerso; const v = await L.understand(await L.readInput({text: txt})); return v.cols.map(c => c.type); }, JSON.stringify(j));
            assert.deepStrictEqual(v, ['person', 'date', 'place', 'text', 'url', 'text']);
        });
        await t('Sécurité : fichier trop gros refusé avec un message clair ; 5 000 lignes par envoi ; 500 000 au plus ; CSRF', async () => {
            const big = await p.evaluate(async () => { try { await window.LCNDA_EXT.listesPerso.readInput({file: new File([new Uint8Array(51 * 1048576)], 'gros.csv')}); return 'lu'; } catch (e) { return e.message; } });
            assert.ok(/trop gros/.test(big) && /50 Mo/.test(big), big);
            const many = await p.evaluate(async () => { const rows = [['a'], ...Array.from({length: 500002}, (_, i) => [String(i)])]; try { await window.LCNDA_EXT.listesPerso.understand({rows, header: true}); return 'ok'; } catch (e) { return e.message; } });
            assert.ok(/500\s000/.test(many), many);
            const chunk = await p.evaluate(async i => { try { await window.LCNDA_APP.api('ulist_write', {}, {method: 'POST', body: {op: 'begin', id: i, mode: 'merge'}}).then(b => window.LCNDA_APP.api('ulist_write', {}, {method: 'POST', body: {op: 'append', id: i, stage: b.stage, rows: Array.from({length: 5001}, () => ({c0: 'x'}))}})); return 'ok'; } catch (e) { return e.message; } }, id);
            assert.ok(/Trop de lignes/.test(chunk), chunk);
            const csrf = await p.evaluate(async () => (await fetch('api.php?action=ulist_write', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({op: 'delete', id: 1})})).status);
            assert.ok(csrf >= 400, String(csrf));
            assert.strictEqual(sql('SELECT count(*) n FROM ulist_lists WHERE deleted_at IS NULL')[0].n, 2);
        });
        await t('Mode consultation : les écritures sont refusées', async () => {
            const r = await p.evaluate(async i => { const api = (a, b) => window.LCNDA_APP.api(a, {}, {method: 'POST', body: b}).then(() => 'ok', e => e.message);
                const enter = await api('kiosk_enter', {password: 'secret12'}); const w = await api('ulist_write', {op: 'delete', id: i}); const out = await api('kiosk_exit', {password: 'secret12'}); return {enter, w, out}; }, id);
            assert.strictEqual(r.enter, 'ok'); assert.ok(/consultation/i.test(r.w), r.w); assert.strictEqual(r.out, 'ok');
            assert.strictEqual(sql(`SELECT deleted_at FROM ulist_lists WHERE id=${id}`)[0].deleted_at, null);
        });
        await t('téléphone (390 px) : l’assistant et la liste sans défilement de côté ; mode sombre lisible', async () => {
            await p.setViewportSize({width: 390, height: 844});
            await p.evaluate(i => window.LCNDA_EXT.listesPerso.open(i), id); await waitRows(5);
            let r = await p.evaluate(() => ({sw: document.documentElement.scrollWidth, w: window.innerWidth}));
            assert.ok(r.sw <= r.w + 1, JSON.stringify(r));
            await p.evaluate(() => window.LCNDA_EXT.listesPerso.create({text: 'Nom;Commune;Date\nJean MAZAUD;Tulle;12 mars 1813\nPaul Roux;Naves;1820\n'}));
            await p.waitForSelector('[data-lpx-cols]');
            r = await p.evaluate(() => { const b = document.querySelector('.lpx-col').getBoundingClientRect(); return {sw: document.documentElement.scrollWidth, w: window.innerWidth, left: b.left, right: b.right}; });
            assert.ok(r.sw <= r.w + 1, JSON.stringify(r)); assert.ok(r.left >= 8 && r.right <= r.w - 8, 'rien collé aux bords : ' + JSON.stringify(r));
            const light = await p.evaluate(() => getComputedStyle(document.querySelector('.lpx-col')).backgroundColor);
            await p.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
            const dark = await p.evaluate(() => { const s = getComputedStyle(document.querySelector('.lpx-col')), l = getComputedStyle(document.querySelector('.lpx-col-lab')); return {bg: s.backgroundColor, fg: getComputedStyle(document.querySelector('.lpx-steps li.is-on')).color, lab: l.color}; });
            assert.notStrictEqual(light, dark.bg); assert.notStrictEqual(dark.bg, dark.fg);
            await p.evaluate(() => document.documentElement.removeAttribute('data-theme'));
            await p.setViewportSize({width: 1280, height: 900});
        });
        await t('🗑 Supprimer puis ↶ Annuler', async () => {
            await p.evaluate(i => window.LCNDA_EXT.listesPerso.open(i), id); await waitRows(5);
            await p.click('[data-lpx-act="delete"]');
            await p.locator('dialog[open] button', {hasText: /Supprimer/}).last().click();
            await p.waitForFunction(i => !window.LCNDA_EXT.dataLists.some(y => y.id === 'perso_' + i), id, {timeout: 8000});
            assert.ok(sql(`SELECT deleted_at FROM ulist_lists WHERE id=${id}`)[0].deleted_at);
            await undo();
            await p.waitForFunction(i => window.LCNDA_EXT.dataLists.some(y => y.id === 'perso_' + i), id, {timeout: 8000});
            assert.strictEqual(sql(`SELECT deleted_at FROM ulist_lists WHERE id=${id}`)[0].deleted_at, null);
        });
        await t('aucune erreur dans la page', async () => { assert.deepStrictEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill();
        fs.rmSync(tmp, {recursive: true, force: true});
    }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
