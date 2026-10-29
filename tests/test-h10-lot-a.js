'use strict';
/* H10 — la barre commune des listes (UI.listBar), lot A : 🛠️ Métiers anciens, 🔎 Le cercle autour des ancêtres (une barre par onglet),
 * 🌿 Branches fermées, 🏠 Lieux précis, 🏘️ Fiche d’un village, ⛪ Paroisses d’Ancien Régime, 🗺️ Cartes anciennes, 🚗 Circuits sur le terrain.
 * Maquette validée : docs/design/h10-listes.html (familles 0 et 1).
 *     node tests/test-h10-lot-a.js          (H10A_SHOTS=dossier pour garder des captures)
 * 1. Le code : chaque liste passe par UI.listBar avec sa clé ; plus de case, de menu, d’interrupteur ni de boutons « À faire / Faits / Tous » faits à la main.
 * 2. Navigateur (Playwright, si présent) : chercher, chaque filtre (pastille bleue, ×, « Tout effacer »), chaque tri, « Liste | Fiches »,
 *    rechargement (réglages retenus), liste vide (grande boîte K10 seule, sans barre) ; 1440 et 390 px, clair et sombre ; aucune erreur.
 */
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const root = path.resolve(__dirname, '..');
const js = f => fs.readFileSync(path.join(root, 'assets/js', f), 'utf8');
let failed = 0, count = 0;
const t = async (name, fn) => { try { await fn(); count++; console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
const LISTS = ['old_trades', 'cited_names', 'closed_branches', 'precise_places', 'villages', 'parishes', 'old_maps', 'field_trips'];

(async () => {
    /* ── 1. le code ── */
    const src = {trades: js('heritage-metiers-anciens.js'), tools: js('heritage-tools.js'), more: js('heritage-more.js'), her: js('heritage.js'), app: js('app.js')};
    await t('chaque liste passe par UI.listBar, avec sa clé', () => {
        assert.match(src.trades, /KEY = 'listes:old_trades'[\s\S]*?U\.listBar\(\{key: KEY/);
        assert.match(src.tools, /KEY = `listes:cited_names:\$\{tab\}`/, 'une barre par onglet du Cercle');
        assert.match(src.tools, /KEY = 'listes:parishes'[\s\S]*?UI\.listBar\(\{key: KEY/);
        assert.match(src.more, /KEY = 'listes:villages'[\s\S]*?UI\.listBar\(\{key: KEY/);
        assert.match(src.her, /KEY = 'listes:old_maps'[\s\S]*?UI\.listBar\(\{key: KEY/);
        assert.match(src.her, /KEY = 'listes:field_trips'[\s\S]*?UI\.listBar\(\{key: KEY/);
        assert.match(src.app, /UI\.listBar\(\{key:'listes:closed_branches'/);
        assert.match(src.app, /KEY='listes:precise_places'[\s\S]*?UI\.listBar\(\{key:KEY/);
    });
    await t('plus de recherche, de menu, d’interrupteur ni de boutons faits à la main', () => {
        assert.ok(!/data-tr-q|data-tr-dom|data-tr-mine|h-world-listbar/.test(src.trades), 'Métiers anciens');
        assert.ok(!/id="h-parish-q"|id="h-cite-q"|segmented-filter/.test(src.tools), 'Paroisses, Cercle');
        assert.ok(!/id="h-village-q"/.test(src.more), 'Villages');
        assert.ok(!/data-h-trip-filter|collection-toolbar"><button type="button" class="button" data-h-oldmap-new/.test(src.her), 'Circuits, Cartes anciennes');
        assert.ok(!/id="pp-q"|id="pp-radius"/.test(src.app), 'Lieux précis');
    });
    await t('K5 : le bouton principal monte dans l’en-tête (Paroisses, Cartes anciennes, Circuits)', () => {
        assert.match(src.tools, /primary: '<button type="button" class="button" data-h-parish-new>＋ Rattachement<\/button>'/);
        assert.match(src.her, /primary: '<button type="button" class="button" data-h-oldmap-new>＋ Carte ancienne<\/button>'/);
        assert.match(src.her, /primary: '<button type="button" class="button" data-h-trip-new>＋ Circuit<\/button>'/);
    });

    /* ── 2. navigateur ── */
    let chromium = null;
    try { ({chromium} = require('playwright')); } catch (_) { try { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); } catch (__) { chromium = null; } }
    const phpPath = findPhp([devBundledPhp()]);
    if (!chromium || !phpPath) { console.log('— navigateur : Playwright ou PHP absent, partie sautée'); console.log(`${failed ? '✗' : '✓'} H10 lot A : ${count} vérifications`); process.exit(failed ? 1 : 0); }
    const shots = process.env.H10A_SHOTS || '';
    const envFor = d => ({...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1'});
    const makeBase = (seed) => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-h10a-'));
        fs.mkdirSync(path.join(tmp, 'media'), {recursive: true});
        const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
        for (const f of ['a.jpg', 'b.jpg']) fs.writeFileSync(path.join(tmp, 'media', f), png);
        const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; $pdo = db();
` + (seed ? String.raw`
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status) VALUES(1,'Antoine','Borie','male','deceased'),(2,'Louise','Besse','female','deceased'),(3,'Jean','Peyre','male','deceased')");
$pdo->exec("INSERT INTO places(id,name,county,country,latitude,longitude) VALUES(1,'Naves','Corrèze','France',45.31,1.77),(2,'Tulle','Corrèze','France',45.27,1.77),(3,'Brive-la-Gaillarde','Corrèze','France',45.16,1.53),(4,'Aurillac','Cantal','France',44.93,2.44)");
$birt = $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='BIRT' LIMIT 1")->fetchColumn(); $deat = $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='DEAT' LIMIT 1")->fetchColumn();
$pdo->exec("INSERT INTO events(scope,person_id,event_type_id,date_text,year,place_id,address) VALUES('person',1,$birt,'1820',1820,1,'Le bourg'),('person',2,$birt,'1850',1850,2,'12 rue de la Barrière'),('person',3,$birt,'1790',1790,4,''),('person',1,$deat,'1890',1890,1,'Le bourg'),('person',2,$deat,'1910',1910,3,'')");
$pdo->exec("INSERT INTO labels(id,name,color) VALUES(1,'Branche Borie','#0066cc'),(2,'À voir','#d62828')");
$pdo->exec("INSERT INTO closed_branches(person_id,direction,certainty,reason,note,updated_at) VALUES(1,'descendance','certain','extinct','Mort sans enfant','2026-01-02'),(2,'descendance','maybe','','Partie en Argentine','2026-03-05'),(3,'descendance','likely','extinct','','2025-06-01')");
$pdo->exec("INSERT INTO place_parishes(place_id,place_text,parish_name,parish_place_id,until_year,note,updated_at) VALUES(1,'','Saint-Pierre de Tulle',2,1790,'annexe','2026-01-01'),(4,'','Saint-Géraud',4,1792,'','2026-02-01'),(NULL,'Le Moulin','Saint-Martin de Brive',3,1789,'hameau','2025-01-01')");
$pdo->exec("INSERT INTO label_links(label_id,entity_type,entity_id) VALUES(1,'parish',1)");
$pdo->exec("INSERT INTO field_trips(id,title,status,date_start,start_place,people_json,updated_at) VALUES(1,'Sur les traces des Borie','todo','2030-11-15','Tulle','[{\"id\":1,\"mode\":\"person\"}]','2026-10-01'),(2,'Corrèze 2025','done','2025-07-01','Brive','[]','2025-08-01'),(3,'Le Cantal','todo','','Aurillac','[{\"id\":2}]','2026-09-01')");
$pdo->exec("INSERT INTO field_trip_stops(trip_id,day,title,place_text,done) VALUES(1,1,'Église Saint-Pierre','Naves',1),(1,1,'Cimetière','Tulle',0)");
$pdo->exec("INSERT INTO label_links(label_id,entity_type,entity_id) VALUES(2,'field_trip',3)");
$pdo->exec("INSERT INTO media(id,title,filename,media_type,transcription,document_reference) VALUES(1,'Baptême de Pierre','a.jpg','image','Le 3 mars 1781 a été baptisé Pierre, parrain Pierre Martin tisserand','3 E 12'),(2,'Mariage Borie','b.jpg','image','Mariage de Antoine Borie et Louise Besse, témoin Jean Dupuy','3 E 13')");
$pdo->exec("INSERT INTO old_maps(title,year_text,control_points,transform,markers,updated_at) VALUES('Cadastre de Naves','1834','[{\"u\":1,\"v\":1,\"lat\":45.3,\"lon\":1.7},{\"u\":2,\"v\":2,\"lat\":45.31,\"lon\":1.71},{\"u\":3,\"v\":1,\"lat\":45.32,\"lon\":1.7}]','[1,0,0,1,0,0]','[{\"u\":1,\"v\":1}]','2026-05-01'),('Plan de Tulle','vers 1760','[]','','[]','2026-07-01')");
$pdo->exec("INSERT INTO label_links(label_id,entity_type,entity_id) VALUES(1,'old_map',1)");
$pdo->exec("INSERT INTO cited_names(name,name_key,role,occupation,place_text,year,media_id,person_id) VALUES('Pierre Martin','pierre martin','parrain','tisserand','Naves',1781,1,NULL),('Pierre Martin','pierre martin','témoin','tisserand','Tulle',1803,2,NULL),('Jean Dupuy','jean dupuy','témoin','','Tulle',1840,2,NULL),('Louise Besse','louise besse','marraine','','Brive',1850,1,2)");
` : '') + `echo 'ok';`], {cwd: root, encoding: 'utf8', env: envFor(tmp)});
        if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exit(1); }
        return tmp;
    };
    const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const serve = async dir => {
        const port = await freePort();
        const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env: envFor(dir), stdio: 'ignore'});
        const base = `http://127.0.0.1:${port}/`;
        for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
        return {proc, base};
    };
    const full = makeBase(true), empty = makeBase(false);
    const s1 = await serve(full), s2 = await serve(empty);
    const browser = await chromium.launch();
    const errs = [];
    const open = async (base, w = 1440, dark = false) => {
        const ctx = await browser.newContext({viewport: {width: w, height: 900}, colorScheme: dark ? 'dark' : 'light'});
        const page = await ctx.newPage();
        page.on('pageerror', e => errs.push(`${w}px : ${e.message}`)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(`${w}px console : ${m.text()}`); });
        page.on('response', r => { if (r.status() >= 400 && r.url().startsWith(base)) errs.push(`${w}px ${r.status()} ${r.url()}`); });
        page.on('dialog', d => d.dismiss());
        await page.goto(base, {waitUntil: 'load'}); await page.waitForTimeout(1500);
        await page.evaluate(d => { const A = window.LCNDA_APP; localStorage.setItem('genealogie-design', JSON.stringify({...A.readDesignSettings(), preset: d ? 'dark' : 'portfolio'})); A.applyDesign(); }, dark);
        return page;
    };
    const go = async (page, id, extra = {}) => { await page.evaluate(async ([id, extra]) => { const A = window.LCNDA_APP; document.querySelectorAll('dialog[open]').forEach(d => d.close());
        Object.assign(A.state, {hVillage: '', precisePlaceKey: '', hTripId: 0, hCiteMedia: 0, hCiteTab: 'index'}, extra); A.state.listType = id; await A.setModule('listes'); }, [id, extra]); await page.waitForTimeout(700); };
    const count_ = page => page.evaluate(() => document.querySelector('#workspace .ui-listbar-count')?.textContent.trim() || '');
    const chips = page => page.$$eval('#workspace .ui-listbar-chip', b => b.map(x => x.textContent.replace('×', '').trim()));
    const search = async (page, q) => { await page.fill('#workspace .ui-listbar-q input', q); await page.waitForTimeout(600); };
    const menu = async page => { await page.click('#workspace .ui-listbar-fbtn'); await page.waitForSelector('.ui-listbar-menu'); };
    const closeMenu = async page => { await page.click('.ui-listbar-menu [data-lb-done]'); await page.waitForTimeout(300); };
    const pick = async (page, sel) => { await menu(page); await page.click(`.ui-listbar-menu ${sel}`); await page.waitForTimeout(350); await closeMenu(page); };
    const sortBy = async (page, v) => { await page.selectOption('#workspace .ui-listbar-sort select', v); await page.waitForTimeout(350); };
    const sorts = page => page.$$eval('#workspace .ui-listbar-sort option', o => o.map(x => x.value));
    const texts = (page, sel) => page.$$eval(sel, n => n.map(x => x.textContent.trim()));
    const pickIn = async (page, id, txt) => { await menu(page); await page.fill(`.ui-listbar-menu [data-lb-pk="${id}"] input:not([type=hidden])`, txt); await page.waitForTimeout(900); if (process.env.H10A_DEBUG) console.log(await page.$$eval('.pk-pop *, .pk-list *', o => o.slice(0, 6).map(x => x.className + ':' + x.textContent.trim().slice(0, 40)))); await page.keyboard.press('Enter'); await page.waitForTimeout(500); await closeMenu(page).catch(() => {}); };
    const shot = async (page, name) => { if (shots) await page.screenshot({path: path.join(shots, name + '.png')}); };
    try {
        const page = await open(s1.base);
        await t('🛠️ Métiers anciens : chercher, Domaine, Ma famille, tris, retenu au rechargement', async () => {
            await go(page, 'old_trades');
            assert.ok(await page.$('#workspace .ui-listbar'), 'barre'); assert.match(await count_(page), /^\d+ métiers$/);
            assert.deepEqual(await sorts(page), ['mine', 'az', 'za', 'most']);
            await search(page, 'sabot'); const n = (await page.$$('.h-tr-row')).length; assert.ok(n >= 1 && n < 10, `${n} lignes`); assert.match(await count_(page), / sur \d+$/);
            await pick(page, 'input[data-lb-f="mine"]'); assert.deepEqual(await chips(page), ['Exercé par un ancêtre']);
            assert.ok(await page.$('#workspace .empty-box'), 'personne ne l’exerce : la grande boîte « rien ne correspond »');
            await page.click('#workspace .ui-listbar-clearall'); assert.deepEqual(await chips(page), []); assert.equal(await page.inputValue('#workspace .ui-listbar-q input'), '');
            await menu(page); await page.click('.ui-listbar-menu input[data-lb-f="domain"] >> nth=0'); await page.waitForTimeout(300); await closeMenu(page);
            assert.equal((await chips(page)).length, 1, 'pastille du domaine');
            await sortBy(page, 'za'); const names = await texts(page, '.h-tr-row strong'); assert.ok(names[0].localeCompare(names[names.length - 1], 'fr') > 0, 'Z → A');
            await page.reload(); await page.waitForTimeout(1500); await go(page, 'old_trades');
            assert.equal((await chips(page)).length, 1, 'filtre retenu'); assert.equal(await page.inputValue('#workspace .ui-listbar-sort select'), 'za', 'tri retenu');
            await page.click('#workspace .ui-listbar-chip'); assert.deepEqual(await chips(page), [], '× retire le filtre');
            await shot(page, 'old_trades');
        });
        await t('🔎 Le cercle : deux onglets, une barre par onglet (index : Rôle, Lieu, Période, Fiche ; transcriptions : noms marqués, Liste | Fiches)', async () => {
            await go(page, 'cited_names');
            assert.equal(await page.$eval('#workspace .h-cite-tabs .is-active', b => b.textContent.trim()), 'Index des noms');
            assert.equal(await count_(page), '3 noms'); assert.deepEqual(await sorts(page), ['most', 'recent', 'old', 'az', 'za']);
            assert.equal((await texts(page, '.h-cite-groups .h-record strong'))[0], 'Pierre Martin', 'le plus de mentions d’abord');
            await search(page, 'tisserand'); assert.equal(await count_(page), '1 nom sur 3');
            await search(page, '');
            await pick(page, 'input[data-lb-f="role"][value="témoin"]'); assert.deepEqual(await chips(page), ['témoin']); assert.equal(await count_(page), '2 noms sur 3');
            await pick(page, 'input[data-lb-f="person"][value="no"]'); assert.equal(await count_(page), '2 noms sur 3');
            await menu(page); await page.fill('.ui-listbar-menu input[data-lb-f="from"]', '1830'); await page.press('.ui-listbar-menu input[data-lb-f="from"]', 'Tab'); await page.waitForTimeout(300); await closeMenu(page);
            assert.equal(await count_(page), '1 nom sur 3'); assert.ok((await chips(page)).some(c => /^Depuis/.test(c)), 'pastille de la période');
            await page.click('#workspace .ui-listbar-clearall'); assert.equal(await count_(page), '3 noms');
            await sortBy(page, 'az'); assert.equal((await texts(page, '.h-cite-groups .h-record strong'))[0], 'Jean Dupuy');
            await page.click('[data-h-cite-tab="transcriptions"]'); await page.waitForTimeout(800);
            assert.equal(await page.$eval('#workspace .h-cite-tabs .is-active', b => b.textContent.trim()), 'Marquer dans les transcriptions');
            assert.equal(await count_(page), '2 transcriptions'); assert.ok(await page.$('#workspace .ui-listbar .ui-viewtoggle'), 'Liste | Fiches');
            await search(page, 'Dupuy'); await page.waitForTimeout(600); assert.equal(await count_(page), '1 transcription sur 2', 'cherche dans tout le texte (serveur)');
            await page.click('#workspace .ui-viewtoggle button[data-view="cards"]'); await page.waitForTimeout(300); assert.ok(await page.$('#workspace .ui-cards .ui-card'), 'Fiches');
            await page.click('[data-h-cite-tab="index"]'); await page.waitForTimeout(800);
            assert.equal(await page.inputValue('#workspace .ui-listbar-q input'), '', 'l’index garde sa propre barre'); assert.equal(await page.inputValue('#workspace .ui-listbar-sort select'), 'az');
            await page.click('[data-h-cite-tab="transcriptions"]'); await page.waitForTimeout(800);
            assert.equal(await page.inputValue('#workspace .ui-listbar-q input'), 'Dupuy', 'chaque onglet retient sa recherche'); assert.ok(await page.$('#workspace .ui-cards'), 'et son affichage');
            await search(page, ''); await page.waitForTimeout(500); await shot(page, 'cited_names');
        });
        await t('🌿 Branches fermées : chercher, Certitude, Raison, les 4 tris', async () => {
            await go(page, 'closed_branches');
            assert.equal(await count_(page), '3 branches fermées'); assert.deepEqual(await sorts(page), ['recent', 'old', 'az', 'za']);
            await search(page, 'argentine'); assert.equal(await count_(page), '1 branche fermée sur 3'); await search(page, '');
            await pick(page, 'input[data-lb-f="certainty"][value="certain"]'); assert.deepEqual(await chips(page), ['Sûr']); assert.equal(await count_(page), '1 branche fermée sur 3');
            await pick(page, 'input[data-lb-f="reason"][value="extinct"]'); assert.equal((await chips(page)).length, 2);
            await page.click('#workspace .ui-listbar-clearall'); assert.equal(await count_(page), '3 branches fermées');
            await sortBy(page, 'old'); assert.match((await texts(page, '#workspace tbody tr td:first-child'))[0], /Peyre/i);
            await shot(page, 'closed_branches');
        });
        await t('🏠 Lieux précis : chercher, Commune, Sorte, Regroupement des points GPS (pas de pastille pour 30 m), tris', async () => {
            await go(page, 'precise_places');
            assert.match(await count_(page), /^2 lieux précis$/);
            assert.deepEqual(await sorts(page), ['az', 'za', 'events', 'old', 'recent']);
            assert.deepEqual(await chips(page), [], '30 m : le départ, sans pastille');
            await search(page, 'barrière'); assert.equal(await count_(page), '1 lieu précis sur 2'); await search(page, '');
            await pick(page, 'input[data-lb-f="kind"][value="address"]'); assert.deepEqual(await chips(page), ['Avec une adresse']);
            await pick(page, 'input[data-lb-f="radius"][value="100"]'); await page.waitForTimeout(600);
            assert.ok((await chips(page)).includes('Points GPS à moins de 100 m'), 'le regroupement choisi se voit en pastille');
            await page.click('#workspace .ui-listbar-clearall'); await page.waitForTimeout(600); assert.deepEqual(await chips(page), []);
            await sortBy(page, 'za'); assert.equal((await texts(page, '#workspace tbody tr td:first-child'))[0], 'Tulle');
            await shot(page, 'precise_places');
        });
        await t('🏘️ Villages : chercher, Département, Période, le plus de personnes au départ, titres de colonnes, Liste | Fiches', async () => {
            await go(page, 'villages');
            assert.equal(await count_(page), '4 communes'); assert.equal(await page.inputValue('#workspace .ui-listbar-sort select'), 'persons');
            await search(page, 'tulle'); assert.equal(await count_(page), '1 commune sur 4'); await search(page, '');
            await pick(page, 'input[data-lb-f="county"][value="Cantal"]'); assert.deepEqual(await chips(page), ['Cantal']); assert.equal(await count_(page), '1 commune sur 4');
            await page.click('#workspace .ui-listbar-chip');
            await menu(page); await page.fill('.ui-listbar-menu input[data-lb-f="to"]', '1800'); await page.press('.ui-listbar-menu input[data-lb-f="to"]', 'Tab'); await page.waitForTimeout(300); await closeMenu(page);
            assert.equal(await count_(page), '1 commune sur 4', 'avant 1800 : Aurillac'); await page.click('#workspace .ui-listbar-chip');
            await page.click('#workspace [data-hv-sort="az"]'); await page.waitForTimeout(300);
            assert.equal(await page.inputValue('#workspace .ui-listbar-sort select'), 'az', 'un clic sur « Commune » met « Trier » à jour');
            assert.equal((await texts(page, '#workspace tbody tr td:first-child strong'))[0], 'Aurillac');
            await page.click('#workspace [data-hv-sort="az"]'); await page.waitForTimeout(300); assert.equal(await page.inputValue('#workspace .ui-listbar-sort select'), 'za', 'deuxième clic : Z → A');
            await page.click('#workspace .ui-viewtoggle button[data-view="cards"]'); await page.waitForTimeout(300); assert.equal((await page.$$('#workspace .ui-card')).length, 4);
            await page.click('#workspace .ui-viewtoggle button[data-view="list"]'); await shot(page, 'villages');
        });
        await t('⛪ Paroisses : « ＋ Rattachement » dans l’en-tête, Paroisse, Étiquette, « Avec des événements », tris', async () => {
            await go(page, 'parishes');
            assert.ok(await page.$('#workspace .page-header [data-h-parish-new]'), 'bouton dans l’en-tête');
            assert.equal(await count_(page), '3 rattachements'); assert.deepEqual(await sorts(page), ['recent', 'old', 'az', 'za', 'events', 'until']);
            await search(page, 'hameau'); assert.equal(await count_(page), '1 rattachement sur 3'); await search(page, '');
            await pick(page, 'input[data-lb-f="events"]'); assert.deepEqual(await chips(page), ['Avec des événements concernés']); assert.equal(await count_(page), '1 rattachement sur 3', 'Aurillac : un acte de 1790, avant 1792');
            await page.click('#workspace .ui-listbar-chip');
            await sortBy(page, 'until'); assert.equal((await texts(page, '#workspace tbody tr td:first-child strong'))[0], 'Le Moulin');
            await page.click('#workspace .page-header [data-h-parish-new]'); await page.waitForTimeout(700);
            assert.ok(await page.$('#h-parish-form') && await page.$('#workspace .ui-listbar'), 'le formulaire s’ouvre dans la page, la barre reste');
            await shot(page, 'parishes');
        });
        await t('🗺️ Cartes anciennes : Fiches au départ (K9), État, Maisons placées, Étiquette, « Année de la carte »', async () => {
            await go(page, 'old_maps');
            assert.ok(await page.$('#workspace .page-header [data-h-oldmap-new]'), 'bouton dans l’en-tête');
            assert.equal((await page.$$('#workspace .ui-cards .ui-card')).length, 2, 'Fiches au départ');
            assert.deepEqual(await sorts(page), ['recent', 'old', 'az', 'za', 'year']);
            await pick(page, 'input[data-lb-f="state"][value="todo"]'); assert.deepEqual(await chips(page), ['⚠ À caler']); assert.equal(await count_(page), '1 carte sur 2');
            await page.click('#workspace .ui-listbar-chip');
            await pick(page, 'input[data-lb-f="houses"][value="yes"]'); assert.equal(await count_(page), '1 carte sur 2'); await page.click('#workspace .ui-listbar-chip');
            await pickIn(page, 'label', 'Branche'); assert.deepEqual(await chips(page), ['Étiquette : Branche Borie'], 'menu de choix des étiquettes'); assert.equal(await count_(page), '1 carte sur 2'); await page.click('#workspace .ui-listbar-chip');
            await sortBy(page, 'year'); assert.equal((await texts(page, '#workspace .ui-card-name'))[0], 'Plan de Tulle', 'vers 1760 avant 1834');
            await page.click('#workspace .ui-viewtoggle button[data-view="list"]'); await page.waitForTimeout(300); assert.ok(await page.$('#workspace .ui-rows .ui-row'), 'Liste');
            await page.click('#workspace .ui-viewtoggle button[data-view="cards"]'); await shot(page, 'old_maps');
        });
        await t('🚗 Circuits : « À faire » au départ en pastille, Personne, Étiquette, départ le plus proche, Fiches avec « 1 / 2 étapes »', async () => {
            await go(page, 'field_trips');
            assert.deepEqual(await chips(page), ['À faire'], 'le choix de départ se voit en pastille');
            assert.equal(await count_(page), '2 circuits sur 3'); assert.equal((await page.$$('#workspace .ui-cards .ui-card')).length, 2, 'Fiches au départ');
            assert.ok((await texts(page, '#workspace .ui-card .ui-badge')).includes('1 / 2 étapes'));
            assert.deepEqual(await sorts(page), ['near', 'recent', 'old', 'az', 'za']);
            assert.equal((await texts(page, '#workspace .ui-card-name'))[0], 'Sur les traces des Borie', 'le départ le plus proche d’abord');
            await page.click('#workspace .ui-listbar-chip'); assert.equal(await count_(page), '3 circuits');
            await search(page, 'cimetière'); assert.equal(await count_(page), '1 circuit sur 3', 'cherche dans les étapes'); await search(page, 'besse'); assert.equal(await count_(page), '1 circuit sur 3', 'et les personnes'); await search(page, '');
            await pickIn(page, 'person', 'Louise'); assert.match((await chips(page)).join('|'), /^Avec Louise BESSE$/i, 'menu de choix des personnes'); assert.equal(await count_(page), '1 circuit sur 3'); await page.click('#workspace .ui-listbar-chip');
            await pick(page, 'input[data-lb-f="status"][value="done"]'); assert.equal(await count_(page), '1 circuit sur 3');
            await page.click('#workspace .ui-viewtoggle button[data-view="list"]'); await page.waitForTimeout(300); assert.ok(await page.$('#workspace .h-trip-list .h-record'), 'Liste');
            await page.reload(); await page.waitForTimeout(1500); await go(page, 'field_trips');
            assert.deepEqual(await chips(page), ['Faits'], 'filtre retenu'); assert.ok(await page.$('#workspace .h-record'), 'affichage retenu');
            await page.click('#workspace .page-header [data-h-trip-new]'); await page.waitForTimeout(800); assert.ok(await page.$('#workspace form'), 'le formulaire du circuit');
            await shot(page, 'field_trips');
        });
        await page.context().close();
        await t('Liste tout à fait vide : la grande boîte K10 seule, sans barre', async () => {
            const p = await open(s2.base);
            for (const id of LISTS.filter(x => x !== 'old_trades')) {
                await go(p, id);
                assert.ok(!(await p.$('#workspace .ui-listbar')), `${id} : pas de barre`);
                assert.ok(await p.$('#workspace .empty-box'), `${id} : la grande boîte`);
            }
            await go(p, 'cited_names', {hCiteTab: 'transcriptions'}); assert.ok(!(await p.$('#workspace .ui-listbar')) && await p.$('#workspace .empty-box'), 'transcriptions vides');
            await p.context().close();
        });
        for (const [w, dark] of [[1440, true], [390, false], [390, true]]) await t(`${w} px ${dark ? 'sombre' : 'clair'} : pas de défilement de côté`, async () => {
            const p = await open(s1.base, w, dark);
            for (const id of LISTS) {
                await go(p, id);
                const r = await p.evaluate(() => ({sw: document.documentElement.scrollWidth, iw: innerWidth, theme: document.documentElement.dataset.theme || '', bar: !!document.querySelector('#workspace .ui-listbar'),
                    over: [...document.querySelectorAll('#workspace .ui-listbar, #workspace .ui-listbar *, #workspace .ui-card, #workspace .h-tr-row')].filter(el => el.getBoundingClientRect().right > innerWidth + 1).length}));
                assert.ok(r.bar, `${id} : barre`); assert.ok(r.sw <= r.iw + 1, `${id} : ${r.sw} > ${r.iw}`); assert.equal(r.over, 0, `${id} : ${r.over} élément(s) dépassent`);
                if (dark) assert.equal(r.theme, 'dark');
                if (shots) await p.screenshot({path: path.join(shots, `${id}-${w}-${dark ? 'sombre' : 'clair'}.png`)});
            }
            await p.context().close();
        });
        await t('aucune erreur JavaScript ni requête en échec', () => { assert.deepEqual(errs, []); });
    } finally {
        await browser.close(); s1.proc.kill(); s2.proc.kill();
        for (const d of [full, empty]) fs.rmSync(d, {recursive: true, force: true});
    }
    console.log(`${failed ? '✗' : '✓'} H10 lot A : ${count} vérifications`);
    process.exit(failed ? 1 : 0);
})();
