#!/usr/bin/env node
/* 🔌 Connexions : 🧺 le panier, 📥 « Prendre depuis… », 📍 « Mettre dans… » (lib/connexions.php, assets/js/heritage-connexions.js,
 * assets/css/connexions.css ; maquette docs/design/connexions-besoins.html, étapes 1 et 2).
 * Base temporaire, noms fictifs (MAZAUD, LACOMBE, DURAND) ; la météo vient du jeu FABRIQUÉ de tests/test-meteo.js (Gers).
 *  1. serveur : panier (ajout, doublon, retrait, ↶), enquêtes où la personne est secondaire, 2e événement d'une piste qui s'ajoute,
 *     ranger dans une enquête (+ ↶), adresse d'un fichier de données (sans réseau ; une page web refusée) ;
 *  2. écran : clic droit sur une date de la fiche → panier → « Mettre dans » l'enquête ouverte (↶) ; 3 choses prises (⌥⌘O / Ctrl+Alt+O)
 *     → une note, puis le Livre de famille (↶) ; « 📤 Envoyer vers… » une enquête ; piste à plusieurs événements (× et ↶) ;
 *     « Dans quelle enquête ? » (Où chercher) ; courrier relié à sa piste, la réponse rangée ; Atelier ← météo d'un jour (info précise)
 *     et d'une semaine (tableau sourcé) ; détail météo → panier ; décès INSEE d'une commune sur une période et châteaux à 4 km d'une ville
 *     (moteur des Listes, demande en français) ; un CSV collé filtré par période → Atelier ; barre de sélection ; Réglages ; 390 px ; aucune erreur.
 *   node tests/test-connexions-panier.js */
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const zlib = require('zlib');
const {spawn, spawnSync} = require('child_process');
const root = path.join(__dirname, '..');
let fails = 0;
const ONLY = process.env.CX_ONLY ? new RegExp(process.env.CX_ONLY) : null;
const t = async (name, fn) => { if (ONLY && !ONLY.test(name)) return; try { await t.before?.(); await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 8).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const km = (a, b, c, d) => { const r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2; return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(x))); };

(async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-cx-')), fx = path.join(tmp, 'meteo'), netdir = path.join(tmp, 'net');
    fs.mkdirSync(path.join(tmp, 'media'), {recursive: true}); fs.mkdirSync(netdir);
    const mk = spawnSync('python3', [path.join(root, 'scripts', 'meteo', 'make-fixture.py'), fx], {encoding: 'utf8'});
    if (mk.status !== 0) { console.error(mk.stderr || mk.stdout); process.exit(1); }
    fs.writeFileSync(path.join(netdir, 'deces.csv'), 'nom;date;commune\nMAZAUD Jean;1859-06-03;Tulle\nDURAND Pierre;1859-07-10;Tulle\n');
    fs.writeFileSync(path.join(netdir, 'page.csv'), '<!doctype html><html><body>pas un fichier</body></html>');
    // les châteaux livrés : une commune avec au moins 2 châteaux ; la « ville » est posée à 1 km de son premier château
    const FR = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root, 'assets/data/chateaux/chateaux-FR.json.gz'))).toString('utf8')).items.filter(c => c.la != null && c.lo != null);
    const byC = new Map(); FR.forEach(c => { if (c.cn && c.la > 44 && c.la < 48 && c.lo > 0 && c.lo < 5) byC.set(c.cn, [...(byC.get(c.cn) || []), c]); });
    const [cname, cl] = [...byC.entries()].find(([n, l]) => l.length >= 2 && /^[A-Za-zÀ-ÿ' -]+$/.test(n) && n.length > 4 && !/saint/i.test(n));
    const city = {name: cname, lat: cl[0].la + 0.009, lon: cl[0].lo};
    const ALLC = fs.readdirSync(path.join(root, 'assets/data/chateaux')).filter(f => /^chateaux-[A-Z]+\.json\.gz$/.test(f)).flatMap(f => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root, 'assets/data/chateaux', f))).toString('utf8')).items || []);
    const near4 = ALLC.filter(c => c.la != null && c.lo != null && km(city.lat, city.lon, c.la, c.lo) <= 4).length;
    console.log(`   châteaux : « ${cname} » (${near4} à moins de 4 km)`);

    let chromium; try { ({chromium} = require('playwright')); } catch (_) { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); }
    const {findPhp, phpRuntimeArgs, devBundledPhp} = require('../electron/php-server.js');
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4', GENEALOGY_TEST: '1', LCNDA_METEO_DIR: fx, LCNDA_TEST_CX_DIR: netdir, CX_CITY: JSON.stringify(city)};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$city = json_decode(getenv('CX_CITY'), true);
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start) VALUES(1,'Jean','MAZAUD','male','deceased',1),(2,'Marie','LACOMBE','female','deceased',0),(3,'Pierre','DURAND','male','deceased',0)");
$pl = $pdo->prepare("INSERT INTO places(id,name,county,country,latitude,longitude) VALUES(?,?,?,'France',?,?)");
$pl->execute([1,'Auch','Gers',43.646,0.586]); $pl->execute([2,'Tulle','Corrèze',45.2675,1.7711]); $pl->execute([3,$city['name'],'',$city['lat'],$city['lon']]);
$t = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn();
$ev = $pdo->prepare("INSERT INTO events(id,scope,person_id,event_type_id,date_text,year,sort_date,place_id) VALUES(?,'person',?,?,?,?,?,?)");
$ev->execute([1,1,$t('BIRT'),'3 février 1978',1978,'1978-02-03',1]); $ev->execute([2,1,$t('CHR'),'5 février 1978',1978,'1978-02-05',1]); $ev->execute([3,3,$t('BIRT'),'12 mars 1950',1950,'1950-03-12',2]);
$pdo->exec("INSERT INTO investigations(id,person_id,title,status) VALUES(1,1,'Les parents de Jean MAZAUD','open'),(2,2,'Les témoins du mariage LACOMBE','open')");
$pdo->exec("INSERT INTO investigation_items(id,investigation_id,kind,title,status) VALUES(1,1,'lead','Acte de naissance','to_explore'),(2,2,'lead','Registre des témoins','to_explore')");
$pdo->exec("INSERT INTO investigation_persons(investigation_id,person_id,role) VALUES(2,1,'secondary')");
$pdo->exec("UPDATE investigations SET updated_at='2020-01-01' WHERE id=2");
$ins = $pdo->prepare("INSERT INTO insee_deces(nom,prenom,prenoms,sexe,date_naissance,annee_naissance,commune_naissance,date_deces,annee_deces,code_lieu_deces,commune_deces,numero_acte_deces) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)");
foreach ([['MAZAUD','JEAN','JEAN','M','19000101',1900,'TULLE','19800605',1980,'19272','TULLE','12'],['DURAND','PIERRE','PIERRE','M','19010202',1901,'TULLE','19800620',1980,'19272','TULLE','13'],
          ['LACOMBE','MARIE','MARIE','F','19020303',1902,'TULLE','19800702',1980,'19272','TULLE','14'],['MAZAUD','PAUL','PAUL','M','19030404',1903,'BRIVE','19800610',1980,'19031','BRIVE-LA-GAILLARDE','15']] as $r) { $ins->execute($r); }
echo json_encode(['ok' => 1]);`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0 || !/"ok"/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 150; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const errs = [];
    try {
        const ctx = await browser.newContext({viewport: {width: 1440, height: 900}});
        const p = await ctx.newPage();
        p.on('pageerror', e => errs.push(e.message));
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_APP?.defaultMaintenanceTabs && window.LCNDA_EXT?.sendTargets && window.LCNDA_EXT?.dataListsEngine, null, {timeout: 60000});
        // index.php ne charge pas encore ces fichiers : on les ajoute (comme le feront les balises)
        if (!(await p.evaluate(() => !!window.LCNDA_EXT?.connexions))) { await p.addStyleTag({url: base + 'assets/css/connexions.css'}); await p.addScriptTag({url: base + 'assets/js/heritage-connexions.js'}); }
        await p.waitForFunction(() => window.LCNDA_EXT?.connexions && window.LCNDA_EXT.sendTargets.some(x => x.key === 'cx_investigation'), null, {timeout: 15000});
        const api = (x, q = {}) => p.evaluate(([y, z]) => window.LCNDA_APP.api(y, {...z, _t: String(Date.now() + Math.random())}).catch(e => ({error: e.message})), [x, q]);
        const post = (x, body) => p.evaluate(([y, b]) => window.LCNDA_APP.api(y, {}, {method: 'POST', body: b}).then(r => r?.result ?? r).catch(e => ({error: e.message})), [x, body]);
        const cx = (op, body = {}) => post('cx_write', {op, ...body});
        const basketN = async () => (await api('cx_basket')).items.length;
        /** attendre qu'une fonction (async) de la page dise oui : relue toutes les 300 ms (waitForFunction n'attend pas une promesse) */
        const pollPage = async (fn, arg = null, o = {}) => { const end = Date.now() + (o.timeout || 15000); for (;;) { const v = await p.evaluate(fn, arg).catch(() => null); if (v) return v; if (Date.now() > end) throw new Error('délai dépassé : ' + String(fn).slice(0, 120)); await sleep(300); } };
        const go = (mod, set = {}) => p.evaluate(([m, s]) => { const A = window.LCNDA_APP; Object.assign(A.state, s); A.setModule(m); }, [mod, set]);
        const clickUndo = async () => { const b = p.locator('.toast button', {hasText: '↶'}).last(); await b.waitFor({timeout: 10000}); await b.click(); await sleep(400); };
        const menuClick = async text => { const it = p.locator('.ui-actmenu button, .ui-actmenu [role="menuitem"]', {hasText: text}).first(); await it.waitFor({timeout: 10000}); await it.click(); };
        t.before = () => p.evaluate(() => { document.querySelectorAll('dialog[open]').forEach(d => d.close()); document.querySelectorAll('.cx-panel, .ui-actmenu').forEach(x => x.remove()); }).catch(() => {});
        const openInv = async id => { await go('enquetes', {enquetesTab: 'enquetes', currentInvestigationId: id, investigationFolderId: 0}); await p.waitForSelector('.investigation-detail', {timeout: 20000}); };

        /* ═════════ 1. le serveur ═════════ */
        await t('panier : vide sans table ; ajout, doublon ignoré, retrait et « ↶ » (remis tel quel)', async () => {
            assert.deepStrictEqual(await api('cx_count'), {count: 0, total: 0, baskets: 0});
            const it = {kind: 'datum', title: 'Naissance — date', value: '3 février 1978', origin: {kind: 'event', id: 1, person_id: 1, label: 'Fiche de Jean MAZAUD'}};
            const a = await cx('basket_add', {items: [it, it]});
            assert.strictEqual(a.ids.length, 1); assert.strictEqual(a.skipped, 1); assert.strictEqual(a.count, 1);
            const r = await cx('basket_remove', {ids: a.ids}); assert.strictEqual(r.count, 0);
            await cx('basket_restore', {rows: r.removed});
            const b = await api('cx_basket'); assert.strictEqual(b.items[0].value, '3 février 1978'); assert.strictEqual(b.items[0].origin.person_id, 1);
            await cx('basket_clear', {});
            assert.ok((await cx('basket_add', {items: [{kind: 'datum'}]})).error, 'un élément vide est refusé');
        });
        await t('les enquêtes de MAZAUD : la sienne ET celle où il est secondaire (avec leurs pistes)', async () => {
            const r = await api('cx_person_investigations', {person_id: 1});
            assert.deepStrictEqual(r.investigations.map(i => [i.id, i.role]).sort(), [[1, 'main'], [2, 'secondary']]);
            assert.ok(r.investigations.find(i => i.id === 2).items.some(x => x.title === 'Registre des témoins'));
        });
        await t('une piste tient plusieurs événements : le 2e s’ajoute au lieu de remplacer', async () => {
            await post('link_event_to_investigation_item', {item_id: 1, event_id: 1, person_label: 'Jean MAZAUD'});
            const r = await post('link_event_to_investigation_item', {item_id: 1, event_id: 2, person_label: 'Jean MAZAUD'});
            assert.ok(r.added_link_id > 0, JSON.stringify(r)); assert.strictEqual(r.linked_event_id, 1);
            const d = await api('investigation', {id: 1}), it = d.items.find(x => x.id === 1);
            assert.strictEqual(Number(it.linked_event_id), 1); assert.ok(it.links.some(l => l.entity_type === 'event' && l.entity_id === 2 && /(Baptême|Bapt)/.test(l.label)), JSON.stringify(it.links));
            assert.strictEqual((await post('link_event_to_investigation_item', {item_id: 1, event_id: 2})).added_link_id, 0, 'pas deux fois');
        });
        await t('ranger dans une enquête : une piste nouvelle, la fiche en personne liée, ↶ défait tout', async () => {
            const r = await cx('inv_receive', {investigation_id: 1, mode: 'one', title: 'Pris pour le test', items: [{kind: 'person', ref_id: 3, title: 'Pierre DURAND'}, {kind: 'datum', title: 'Lieu', value: 'Auch'}]});
            assert.ok(r.item_ids, JSON.stringify(r)); assert.strictEqual(r.item_ids.length, 1); assert.strictEqual(r.person_link_ids.length, 1);
            let d = await api('investigation', {id: 1});
            assert.ok(d.linked_persons.some(x => Number(x.person_id) === 3));
            assert.deepStrictEqual(d.items.find(x => x.id === r.item_ids[0]).links.map(l => l.value || l.label).sort(), ['Auch', 'Pierre DURAND']);
            await cx('inv_receive_undo', r); d = await api('investigation', {id: 1});
            assert.ok(!d.items.some(x => x.id === r.item_ids[0])); assert.ok(!d.linked_persons.some(x => Number(x.person_id) === 3));
        });
        await t('📂 l’adresse d’un fichier de données : lu après le clic (sans réseau ici) ; une page web est refusée ; une adresse locale aussi', async () => {
            const r = await cx('fetch_url', {url: 'https://exemple.org/deces.csv'});
            assert.strictEqual(Buffer.from(r.base64, 'base64').toString('utf8').split('\n')[0], 'nom;date;commune');
            assert.match((await cx('fetch_url', {url: 'https://exemple.org/page.csv'})).error, /page web/);
            assert.match((await cx('fetch_url', {url: 'ftp://exemple.org/x.csv'})).error, /https/);
        });

        /* ═════════ 2. l'écran ═════════ */
        await t('raccourci : ⌥⌘O / Ctrl+Alt+O n’est pris par aucun autre raccourci (⇧⌘O l’est : écran divisé) ; il est dans Réglages → Raccourcis', async () => {
            const k = await p.evaluate(() => { const K = window.LCNDA_APP.shortcutKit; const cmds = K.commands(); return {take: K.comboOf('take_from'), split: K.comboOf('split_orientation'), same: cmds.filter(c => K.comboOf(c.id) === K.comboOf('take_from')).map(c => c.id), os: K.osConflict(K.comboOf('take_from'))}; });
            assert.strictEqual(k.take, 'Mod+Alt+O'); assert.strictEqual(k.split, 'Mod+Shift+O'); assert.deepStrictEqual(k.same, ['take_from']); assert.strictEqual(k.os, '');
            const eds = await p.evaluate(() => JSON.stringify(window.LCNDA_EXT.editorKeysDefaults || ''));
            assert.ok(!/Mod\+Alt\+O/.test(eds));
            await go('maintenance', {maintenanceTab: 'raccourcis'}); await p.waitForSelector('.shortcut-table');
            assert.match(await p.textContent('.shortcut-table'), /Prendre depuis/);
        });
        await t('la pastille 🧺 n’est pas là quand le panier est vide', async () => {
            assert.ok(await p.evaluate(() => !document.querySelector('#cx-pill') || document.querySelector('#cx-pill').hidden));
        });
        let datumId = 0;
        await t('fiche de MAZAUD : clic droit sur la date de naissance → « 🧺 Prendre « 3 février 1978 » » → la pastille dit 1', async () => {
            await go('personnes', {currentPersonId: 1}); await p.waitForSelector('#workspace .event-row[data-event-id="1"] .event-date', {timeout: 20000});
            const d = p.locator('#workspace .event-row[data-event-id="1"] .event-date').first();
            await d.scrollIntoViewIfNeeded(); const box = await d.boundingBox();
            const rightTake = async () => { for (let i = 0; i < 4; i++) { await d.scrollIntoViewIfNeeded(); await d.click({button: 'right', position: {x: 8, y: 6}}); try { await menuClick('Prendre « 3 février 1978'); return; } catch (e) { if (i === 3) throw e; await p.keyboard.press('Escape'); await sleep(800); } } };
            await rightTake();
            await p.waitForSelector('#cx-pill:not([hidden])', {timeout: 10000});
            assert.match(await p.textContent('#cx-pill'), /1/);
            const b = await api('cx_basket'); const it = b.items[0]; datumId = it.id;
            assert.strictEqual(it.kind, 'datum'); assert.match(it.value, /^3 février 1978/); assert.strictEqual(it.origin.person_id, 1); assert.strictEqual(it.origin.field, 'date'); assert.match(it.title, /Naissance/);
            await clickUndo(); assert.strictEqual(await basketN(), 0, '↶ le retire');
            await rightTake(); await sleep(500);
            assert.strictEqual(await basketN(), 1);
        });
        await t('… le panier ouvert sur l’enquête → « 📍 Mettre dans… » → « Ici : l’enquête » : une piste avec la date ; le panier se vide ; ↶ remet tout', async () => {
            await openInv(1);
            await p.click('#cx-pill'); await p.waitForSelector('.cx-panel [data-cx-put]');
            await p.click('.cx-panel [data-cx-put]'); await p.waitForSelector('.cx-put [data-cx-here="1"]');
            assert.match(await p.textContent('.cx-put [data-cx-here="1"]'), /Ici : l’enquête « Les parents de Jean MAZAUD »/);
            await p.click('.cx-put [data-cx-here="1"]');
            await p.waitForFunction(() => [...document.querySelectorAll('.cx-links')].some(x => /3 février 1978/.test(x.textContent)), null, {timeout: 15000});
            assert.strictEqual(await basketN(), 0);
            await clickUndo(); await sleep(600);
            assert.strictEqual(await basketN(), 1, 'remis au panier');
            const d = await api('investigation', {id: 1}); assert.ok(!d.items.some(x => (x.links || []).some(l => /3 février/.test(l.value))));
            await cx('basket_clear', {}); await p.evaluate(() => window.LCNDA_EXT.connexions.refresh());
        });
        await t('« ＋ Ajouter » de l’enquête : une ligne « 📥 Prendre depuis… » avec son raccourci (rien de plus à l’écran)', async () => {
            await openInv(1);
            await p.click('#add-investigation-item');
            const it = p.locator('.ui-actmenu button, .ui-actmenu [role="menuitem"]', {hasText: 'Prendre depuis'}).first(); await it.waitFor();
            assert.match(await p.textContent('.ui-actmenu'), /Une piste/); assert.match(await p.textContent('.ui-actmenu'), /Alt|⌥/);
            await p.keyboard.press('Escape');
        });
        await t('3 choses prises (Ctrl+Alt+O : une fiche, un lieu, un événement) → « Mettre dans » une note sur la fiche ouverte', async () => {
            await go('personnes', {currentPersonId: 1}); await p.waitForSelector('#workspace .event-row[data-event-id="1"]');
            await p.mouse.click(700, 300); await p.keyboard.press('Control+Alt+O');
            await p.waitForSelector('.cx-take');
            const pick = async (tab, q, text) => { await p.click(`.cx-take [data-cx-tab="${tab}"]`); await p.fill('.cx-take [data-cx-q]', q); await p.waitForFunction(x => [...document.querySelectorAll('.cx-take .cx-rlist li')].some(li => li.textContent.includes(x)), text, {timeout: 10000});
                const li = p.locator('.cx-take .cx-rlist li', {hasText: text}).first(); await li.locator('input[type=checkbox]').check(); };
            await pick('person', 'DURAND', 'DURAND'); await pick('place', 'Tulle', 'Tulle'); await pick('event', 'Naissance', 'Naissance');
            assert.match(await p.textContent('.cx-take [data-cx-n]'), /3 cochées/);
            await p.click('.cx-take [data-cx-toput]'); await p.waitForSelector('.cx-put [data-cx-here="1"]');
            const here = p.locator('.cx-put [data-cx-here="1"]', {hasText: 'note'}); await here.click();
            await pollPage(async () => { const d = await window.LCNDA_APP.api('person', {id: 1}); return (d.notes || []).some(n => /DURAND/.test(n.body) && /Tulle/.test(n.body)); }, null, {timeout: 15000});
        });
        await t('… les 3 au panier → « 📍 Mettre dans » le Livre de famille (à la fin, avec la source) ; ↶ remet le livre comme avant', async () => {
            const items = [{kind: 'person', ref_id: 3, title: 'Pierre DURAND'}, {kind: 'place', ref_id: 2, title: 'Tulle'}, {kind: 'datum', title: 'Naissance — date', value: '3 février 1978', origin: {label: 'Fiche de Jean MAZAUD'}}];
            await p.evaluate(x => window.LCNDA_EXT.connexions.take(x), items); await sleep(400);
            await p.click('#cx-pill'); await p.click('.cx-panel [data-cx-put]'); await p.waitForSelector('.cx-put [data-cx-dest="book"]');
            await p.click('.cx-put [data-cx-dest="book"]');
            await p.waitForFunction(() => /Pierre DURAND[\s\S]*Source : Fiche de Jean MAZAUD/.test((JSON.parse(localStorage.getItem('genealogie-family-book') || '{}').epilogue || '')), null, {timeout: 10000});
            assert.strictEqual(await basketN(), 0);
            await clickUndo();
            assert.ok(await p.evaluate(() => !(JSON.parse(localStorage.getItem('genealogie-family-book') || '{}').epilogue || '').includes('DURAND')));
            assert.strictEqual(await basketN(), 3); await cx('basket_clear', {}); await p.evaluate(() => window.LCNDA_EXT.connexions.refresh());
        });
        await t('📤 « Envoyer vers… » a les destinations enquête, tableau d’enquête, note, dossier de preuve, panier ; un texte va dans une piste choisie', async () => {
            const keys = await p.evaluate(() => window.LCNDA_EXT.sendTargetsFor('text').map(x => x.key));
            for (const k of ['cx_investigation', 'cx_board', 'cx_note', 'cx_proof', 'cx_basket']) assert.ok(keys.includes(k), k + ' : ' + keys.join(','));
            await go('dashboard');
            await p.evaluate(() => { window.LCNDA_EXT.sendTo('text', {html: '<p>Le curé note la naissance</p>', name: 'Extrait du registre'}, {to: 'cx_investigation'}); });
            await p.waitForSelector('.cx-inv select[name="inv"]');
            await p.selectOption('.cx-inv select[name="inv"]', '2');
            await p.selectOption('.cx-inv select[name="item"]', '2');
            await p.click('.cx-inv button[type="submit"]');
            await pollPage(async () => (await window.LCNDA_APP.api('investigation', {id: 2})).items.find(x => x.id === 2)?.links?.some(l => /curé note/.test(l.value)), null, {timeout: 10000});
        });
        await t('piste à plusieurs événements : les deux sont montrés ; × retire le 2e, ↶ le remet', async () => {
            await openInv(1);
            await p.waitForFunction(() => /(Baptême|Bapt)/.test(document.querySelector('[data-cx-links="1"]')?.textContent || ''), null, {timeout: 10000});
            assert.match(await p.textContent('.investigation-detail'), /Naissance — 3 février 1978/);
            await p.locator('[data-cx-links="1"] [data-cx-link-x]').first().click();
            await p.waitForFunction(() => !/(Baptême|Bapt)/.test(document.querySelector('[data-cx-links="1"]')?.textContent || ''), null, {timeout: 10000});
            await clickUndo();
            await p.waitForFunction(() => /(Baptême|Bapt)/.test(document.querySelector('[data-cx-links="1"]')?.textContent || ''), null, {timeout: 10000});
        });
        await t('« Où chercher ? » laisse choisir l’enquête : la piste va dans celle où MAZAUD est secondaire (pas la dernière ouverte)', async () => {
            await p.evaluate(() => { window.__lt = window.LCNDA_EXT.connexions.leadTarget(1, 'Où chercher ? — Jean MAZAUD'); });
            await p.waitForSelector('.cx-inv select[name="inv"]');
            assert.match(await p.textContent('.cx-inv select[name="inv"]'), /témoins du mariage LACOMBE \(secondaire\)/);
            assert.match(await p.textContent('.cx-inv select[name="inv"]'), /nouvelle enquête/);
            await p.selectOption('.cx-inv select[name="inv"]', '2'); await p.click('.cx-inv button[type="submit"]');
            const where = await p.evaluate(() => window.__lt);
            assert.deepStrictEqual([where.investigation_id, where.item_id], [2, 0]);
            const r = await post('ou_chercher_piste', {person_id: 1, title: 'Chercher sur Geneanet', url: 'https://www.geneanet.org/', notes: 'proposé', ...where});
            assert.strictEqual(r.investigation_id, 2);
            const n = await post('ou_chercher_piste', {person_id: 1, title: 'Chercher ailleurs', url: '', notes: '', new_investigation: 1, new_title: 'Où chercher ? — Jean MAZAUD'});
            assert.strictEqual(n.created, true);
        });
        await t('📮 « Demander l’acte » relié à la piste qui l’attend ; la réponse reçue se range dans la piste en un clic (↶)', async () => {
            await go('dashboard');
            await p.evaluate(() => window.LCNDA_EXT.openActLetter({person_id: 1, item_id: 1, item_title: 'Acte de naissance'}));
            await p.waitForSelector('.cl-dialog [data-cl-piste]:not([hidden]) select', {timeout: 20000});
            assert.strictEqual(await p.inputValue('.cl-dialog select[name="cx_piste"]'), '1');
            await p.waitForFunction(() => (document.querySelector('.cl-dialog [name="letter"]')?.value || '').length > 20, null, {timeout: 20000});
            await p.click('.cl-dialog button[type="submit"]');
            await pollPage(async () => ((await window.LCNDA_APP.api('cx_links', {b_type: 'investigation_item', b_id: 1})).links || []).some(l => l.a_type === 'courrier'), null, {timeout: 15000});
            const cid = (await api('cx_links', {b_type: 'investigation_item', b_id: 1})).links.find(l => l.a_type === 'courrier')?.a_id; assert.ok(cid, 'courrier relié');
            await p.evaluate(c => window.LCNDA_EXT.connexions.courrierReplied(c, {objet: 'Copie intégrale', destinataire: 'Mairie d’Auch', statut: 'reponse_recue'}), cid);
            const b = p.locator('.toast button', {hasText: 'La ranger dans la piste'}).last(); await b.waitFor({timeout: 10000}); await b.click();
            await pollPage(async () => (await window.LCNDA_APP.api('investigation', {id: 1})).items.find(x => x.id === 1).links.some(l => l.entity_type === 'courrier'), null, {timeout: 10000});
            await clickUndo();
            assert.ok(!(await api('investigation', {id: 1})).items.find(x => x.id === 1).links.some(l => l.entity_type === 'courrier'));
        });
        let proj = 0, itemId = 0;
        const atelierNotes = async id => { const d = await api('atelier_project', {id: proj}); const it = d.items.find(x => Number(x.id) === Number(id)); return it ? (typeof it.data === 'object' ? it.data : JSON.parse(it.data_json || '{}')) : null; };
        await t('📚 Atelier, un élément daté (3 février 1978 à Auch) : « ＋ Ajouter → 📥 Prendre depuis… → 🧰 Données → 🌦 Météo » : la date et le lieu sont repris, une info précise cochée va dans ses notes avec sa source', async () => {
            proj = Number((await post('save_atelier_project', {title: 'Le village d’Auch', kind: 'livre'})).id);
            itemId = Number((await post('save_atelier_item', {project_id: proj, type: 'event', title: 'Naissance de Jean MAZAUD', data: {date: '1978-02-03', place: {text: 'Auch'}}})).id);
            await go('enquetes', {enquetesTab: 'atelier', currentInvestigationId: 0, atelier: {project: proj, node: 'all', sel: [itemId]}});
            await p.waitForSelector('[data-at-addmenu]', {timeout: 20000});
            await p.click('[data-at-addmenu]'); await p.click('[data-at-take]');
            await p.waitForSelector('.cx-take'); assert.match(await p.textContent('.cx-take h2'), /Naissance de Jean MAZAUD/);
            await p.click('.cx-take [data-cx-tab="data"]'); await p.selectOption('.cx-take [data-cx-ds]', 'meteo_jour');
            await p.waitForSelector('.cx-take [name="cx_date"]'); assert.strictEqual(await p.inputValue('.cx-take [name="cx_date"]'), '1978-02-03');
            await p.click('.cx-take [data-cx-run]');
            await p.waitForSelector('.cx-take [data-cx-dres] li', {timeout: 20000});
            const li = p.locator('.cx-take [data-cx-dres] li', {hasText: 'Température la plus haute'}).first(); await li.locator('input').check();
            assert.match(await p.textContent('.cx-take [data-cx-prev]'), /Source/);
            await p.click('.cx-take [data-cx-takehere]');
            await pollPage(async ([pr, id]) => { const d = await window.LCNDA_APP.api('atelier_project', {id: pr}); const it = d.items.find(x => Number(x.id) === id); const n = (it?.data || {}).notes || ''; return /Température la plus haute/.test(n) && /Source :/.test(n); }, [proj, itemId], {timeout: 15000});
            const n = (await atelierNotes(itemId)).notes; assert.match(n, /°C/); assert.ok(!/Pluie/.test(n), 'seulement l’info cochée');
            await clickUndo(); assert.ok(!/Température/.test((await atelierNotes(itemId)).notes || ''));
        });
        await t('📚 … la météo d’une semaine (du 3 au 9 février 1978) mise dans l’Atelier comme UN tableau sourcé (avec sa demande)', async () => {
            await go('enquetes', {enquetesTab: 'atelier', currentInvestigationId: 0, atelier: {project: proj, node: 'all', sel: []}}); await p.waitForSelector('[data-at-addmenu]');
            await p.evaluate(() => window.LCNDA_EXT.connexions.openTake());
            await p.waitForSelector('.cx-take'); await p.click('.cx-take [data-cx-tab="data"]'); await p.selectOption('.cx-take [data-cx-ds]', 'meteo_jour');
            await p.waitForSelector('.cx-take .pk[data-picker="place"] input:not([type=hidden])');
            await p.fill('.cx-take .pk[data-picker="place"] input:not([type=hidden])', 'Auch');
            await p.locator('.cx-take .pk-list [role="option"], .cx-take .pk-item', {hasText: 'Auch'}).first().click();
            await p.fill('.cx-take [name="cx_date"]', '1978-02-03'); await p.fill('.cx-take [name="cx_to"]', '1978-02-09');
            await p.click('.cx-take [data-cx-run]');
            await p.waitForSelector('.cx-take [data-cx-dres] li', {timeout: 30000});
            await p.locator('.cx-take [data-cx-dres] li', {hasText: 'Tout'}).first().locator('input').check();
            await p.click('.cx-take [data-cx-takehere]');
            await pollPage(async pr => (await window.LCNDA_APP.api('atelier_project', {id: pr})).items.some(x => /Météo/.test(x.title) && /1978-02-09/.test(x.data?.text || '')), proj, {timeout: 15000});
            const it = (await api('atelier_project', {id: proj})).items.find(x => /Météo/.test(x.title));
            const rows = it.data.text.split('\n').filter(l => /^1978-02-0\d \|/.test(l)); assert.strictEqual(rows.length, 7); assert.match(it.data.text, /Source :/);
        });
        await t('🌦 le détail d’un jour (fiche) : « 🧺 Au panier » prend la météo du jour avec sa source', async () => {
            await go('personnes', {currentPersonId: 1}); await p.waitForSelector('#workspace .event-row[data-event-id="1"]');
            await p.evaluate(() => window.LCNDA_EXT.meteo.openDay(1)); await p.waitForSelector('.wx-dialog [data-wx-cxtake]', {timeout: 20000});
            await p.click('.wx-dialog [data-wx-cxtake]'); await sleep(600);
            const b = await api('cx_basket'); assert.ok(b.items.some(x => /Météo du 3 février 1978/.test(x.title) && /Température/.test(x.value) && x.origin?.label), JSON.stringify(b.items).slice(0, 300));
            await p.keyboard.press('Escape'); await cx('basket_clear', {}); await p.evaluate(() => window.LCNDA_EXT.connexions.refresh());
        });
        await t('⚰️ « les décès à Tulle du 1er au 30 juin 1980 » : la demande en français préremplit la liste INSEE (commune + du… au…) ; « Tout prendre » → l’Atelier', async () => {
            await go('enquetes', {enquetesTab: 'atelier', currentInvestigationId: 0, atelier: {project: proj, node: 'all', sel: []}}); await p.waitForSelector('[data-at-addmenu]');
            const parsed = await p.evaluate(() => window.LCNDA_EXT.connexions.parseAsk('les décès à Tulle du 1er au 30 juin 1980', window.LCNDA_EXT.dataListsEngine.list()));
            assert.strictEqual(parsed.id, 'insee_deces'); assert.deepStrictEqual(parsed.preset.crit.find(c => c.kind === 'daterange'), {key: 'deces', kind: 'daterange', from: '1980-06-01', to: '1980-06-30'});
            assert.ok(parsed.preset.crit.some(c => c.key === 'commune_deces' && /Tulle/i.test(c.value)));
            await p.evaluate(() => window.LCNDA_EXT.connexions.openTake()); await p.waitForSelector('.cx-take');
            await p.click('.cx-take [data-cx-tab="lists"]'); await p.fill('.cx-take [data-cx-ask]', 'les décès à Tulle du 1er au 30 juin 1980'); await p.click('.cx-take [data-cx-askgo]');
            await p.waitForSelector('.ld-page[data-ld-page="insee_deces"] [data-cx-ltake]', {timeout: 20000});
            await p.waitForFunction(() => /2/.test(document.querySelector('[data-ld-count]')?.textContent || ''), null, {timeout: 15000});
            assert.match(await p.textContent('.ld-chips'), /du 1 juin 1980 au 30 juin 1980|du 1er juin 1980/);
            await p.click('[data-cx-ltake]');
            await pollPage(async pr => (await window.LCNDA_APP.api('atelier_project', {id: pr})).items.some(x => /Décès INSEE/.test(x.title)), proj, {timeout: 15000});
            const it = (await api('atelier_project', {id: proj})).items.find(x => /Décès INSEE/.test(x.title));
            assert.match(it.data.text, /MAZAUD/); assert.match(it.data.text, /DURAND/); assert.ok(!/LACOMBE/.test(it.data.text), 'le 2 juillet est hors période'); assert.ok(!/BRIVE/.test(it.data.text.split('Source')[0]), 'une autre commune');
            assert.match(it.data.text, /Licence Ouverte/);
        });
        await t(`🏰 « les châteaux à 4 km de ${cname} » : le moteur des Listes (autour de…) ; « 🧺 Prendre… → Tout au panier » = un ensemble compté 1, avec ses lignes`, async () => {
            const parsed = await p.evaluate(n => window.LCNDA_EXT.connexions.parseAsk(`les châteaux à 4 km de ${n}`, window.LCNDA_EXT.dataListsEngine.list()), cname);
            assert.strictEqual(parsed.id, 'chateaux'); assert.strictEqual(parsed.preset.near.km, 4); assert.ok(Math.abs(parsed.preset.near.lat - city.lat) < 1e-6);
            await p.evaluate(x => window.LCNDA_EXT.dataListsEngine.open(x.id, x.preset), parsed);
            await p.waitForSelector('.ld-page[data-ld-page="chateaux"] [data-ld-take]', {timeout: 30000});
            await p.waitForFunction(n => new RegExp(`\\b${n}\\b`).test(document.querySelector('[data-ld-count]')?.textContent || ''), String(near4), {timeout: 30000});
            await p.click('[data-ld-take]'); await menuClick('Tout au panier');
            await pollPage(async () => (await window.LCNDA_APP.api('cx_basket')).items.some(x => x.kind === 'set'), null, {timeout: 15000});
            const s = (await api('cx_basket')).items.find(x => x.kind === 'set');
            assert.strictEqual(s.data.rows.length, near4); assert.match(s.data.criteria, /4 km/); assert.strictEqual(s.data.request.list, 'chateaux'); assert.match(s.data.source, /Wikidata/);
            assert.match(await p.textContent('#cx-pill'), /1/);
            await cx('basket_clear', {}); await p.evaluate(() => window.LCNDA_EXT.connexions.refresh());
        });
        await t('📂 De l’extérieur : un CSV collé (décès d’une commune) filtré du… au… → l’Atelier, avec sa provenance et sa licence', async () => {
            await go('enquetes', {enquetesTab: 'atelier', currentInvestigationId: 0, atelier: {project: proj, node: 'all', sel: []}}); await p.waitForSelector('[data-at-addmenu]');
            await p.evaluate(() => window.LCNDA_EXT.connexions.openTake()); await p.waitForSelector('.cx-take');
            await p.click('.cx-take [data-cx-tab="outside"]');
            await p.click('.cx-take summary:has-text("Coller un tableau")');
            await p.fill('.cx-take [data-cx-paste]', 'Nom;Date du décès;Commune\nMAZAUD Jean;03/06/1859;Tulle\nLACOMBE Marie;20/06/1859;Tulle\nDURAND Pierre;10/07/1859;Tulle\n=HYPERLINK("x");01/06/1859;Tulle');
            await p.click('.cx-take [data-cx-pastego]'); await p.waitForSelector('.cx-take [data-cx-from]');
            assert.strictEqual(await p.inputValue('.cx-take [data-cx-role="1"]'), 'date');
            await p.fill('.cx-take [data-cx-from]', '1859-06-01'); await p.fill('.cx-take [data-cx-to]', '1859-06-30'); await p.fill('.cx-take [data-cx-lic]', 'Relevé du cercle, CC BY');
            await p.waitForFunction(() => /3 lignes sur 4/.test(document.querySelector('.cx-take [data-cx-cnt]')?.textContent || ''));
            await p.click('.cx-take [data-cx-iall]'); await p.click('.cx-take [data-cx-takehere]');
            await pollPage(async pr => (await window.LCNDA_APP.api('atelier_project', {id: pr})).items.some(x => /Tableau collé/.test(x.title)), proj, {timeout: 15000});
            const it = (await api('atelier_project', {id: proj})).items.find(x => /Tableau collé/.test(x.title));
            assert.match(it.data.text, /MAZAUD/); assert.match(it.data.text, /LACOMBE/); assert.ok(!/DURAND/.test(it.data.text)); assert.ok(!/HYPERLINK/.test(it.data.text), 'une formule n’entre jamais');
            assert.match(it.data.text, /CC BY/); assert.match(it.data.text, /Importé le/);
        });
        await t('☑ la barre de sélection (Listes → Personnes) : « 🧺 Au panier » et « 📍 Mettre dans… »', async () => {
            await go('listes', {listType: 'persons'});
            await p.waitForSelector('[data-sel-check]', {timeout: 20000});
            await p.locator('[data-sel-check]').first().check();
            assert.match(await p.textContent('.sel-bar'), /Au panier/); assert.match(await p.textContent('.sel-bar'), /Mettre dans/);
            await p.click('.sel-bar button:has-text("Au panier")'); await sleep(500);
            const b = await api('cx_basket'); assert.strictEqual(b.items.length, 1); assert.strictEqual(b.items[0].kind, 'person'); assert.ok(b.items[0].ref_id > 0);
            await clickUndo(); assert.strictEqual(await basketN(), 0);
        });
        await t('⚙️ Réglages → « 🧺 Panier et connexions » : plusieurs paniers (↶), tout éteindre = plus de pastille ni de ligne « Prendre depuis… »', async () => {
            await go('maintenance', {maintenanceTab: 'connexions'}); await p.waitForSelector('.cx-settings');
            await p.check('[name="cx-multi"][value="1"]'); await sleep(300);
            assert.strictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-connexions')).multi), true);
            await clickUndo(); assert.ok(!(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-connexions') || '{}').multi)));
            await p.evaluate(() => localStorage.setItem('genealogie-connexions', JSON.stringify({on: false})));
            assert.deepStrictEqual(await p.evaluate(() => window.LCNDA_EXT.connexions.addMenuItems()), []);
            await p.evaluate(() => localStorage.removeItem('genealogie-connexions'));
        });
        await t('390 px : « Prendre depuis… » et le panier tiennent dans l’écran, sans défilement de côté', async () => {
            const m = await ctx.newPage(); m.on('pageerror', e => errs.push(e.message));
            await m.setViewportSize({width: 390, height: 800});
            await m.goto(base); await m.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.sendTargets, null, {timeout: 60000});
            if (!(await m.evaluate(() => !!window.LCNDA_EXT?.connexions))) { await m.addStyleTag({url: base + 'assets/css/connexions.css'}); await m.addScriptTag({url: base + 'assets/js/heritage-connexions.js'}); }
            await m.waitForFunction(() => window.LCNDA_EXT?.connexions);
            await m.evaluate(() => window.LCNDA_EXT.connexions.take([{kind: 'datum', title: 'Lieu', value: 'Auch'}]));
            await m.waitForSelector('#cx-pill:not([hidden])');
            await m.evaluate(() => window.LCNDA_EXT.connexions.openTake()); await m.waitForSelector('.cx-take');
            const w = await m.evaluate(() => { const r = document.querySelector('.cx-take').getBoundingClientRect(); return {l: r.left, r: r.right, sw: document.documentElement.scrollWidth}; });
            assert.ok(w.l >= 0 && w.r <= 390 && w.sw <= 390, JSON.stringify(w));
            await m.keyboard.press('Escape'); await m.click('#cx-pill'); await m.waitForSelector('.cx-panel');
            const pr = await m.evaluate(() => document.querySelector('.cx-panel').getBoundingClientRect().right); assert.ok(pr <= 390);
            await m.close(); await cx('basket_clear', {});
        });
        await t('aucune erreur dans la page', async () => { assert.deepStrictEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill();
        try { fs.rmSync(tmp, {recursive: true, force: true}); } catch (_) {}
    }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})();
