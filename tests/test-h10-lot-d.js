'use strict';
/* H10 — la barre commune des listes (UI.listBar), lot D. Maquette validée : docs/design/h10-listes.html.
 *     node tests/test-h10-lot-d.js          (H10D_SHOTS=dossier pour garder des captures)
 *  - ✨ Trésors (famille 6) : ✉️ Lettres aux descendants (jamais de recherche dans le texte d'une lettre scellée), 🕯️ Bougies (« Allumées » au
 *    départ, en pastille), 🔗 Partages temporaires (« En cours » au départ), 📍 Passeport des lieux, 🏛️ Actes manquants (l'assistant dans l'en-tête), 📰 Gazettes ;
 *  - les deux calendriers (choix B : 🔍 et Filtrer ▾ seulement, dans leur barre) ;
 *  - 📋 Mes listes (choix A : Liste | Fiches + « Plus ▾ », ⤓ Exporter ▾, 🖨 Imprimer L1, ✎ ⧉ 🗑 dans ⋯, filtres par colonne rangés dans la liste) ;
 *  - les 10 listes « Déjà là » alignées (en-tête K5, mots des tris C6, Recueils → Lieu, Fiches thématiques → Étiquette, Recensement › Groupes → Espèce) ;
 *  - le composant : le nombre à droite d'un choix, openFilter(id), setSort(valeur, libellé) ;
 *  - liste tout à fait vide : la grande boîte K10 seule, sans barre.
 * 1. Le code. 2. Navigateur (Playwright, si présent) : chercher, filtres (pastilles bleues, ×, Tout effacer), tris (et clic sur un titre de colonne),
 *    Liste | Fiches, rechargement (réglages retenus), base vide ; 1440 et 390 px, clair et sombre ; aucune erreur, pas de défilement horizontal.
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
const TRESORS = ['tr_letters', 'tr_candles', 'tr_shares', 'tr_stamps', 'tr_gaps', 'gazettes'];

(async () => {
    /* ── 1. le code ── */
    const src = {tl: js('heritage-tresors-listes.js'), tw: js('heritage-tresors-widgets.js'), cal: js('heritage-calendars.js'), more: js('heritage-more.js'), ui: js('app-ui.js'),
        av: js('heritage-av.js'), rc: js('heritage-recueils.js'), fi: js('heritage-fiches.js'), sv: js('heritage-suivi.js'), bd: js('heritage-boards.js'), pc: js('heritage-postcards.js')};
    await t('le composant : nombre d’un choix, openFilter(id), setSort(valeur, libellé)', () => {
        assert.match(src.ui, /n: o\[3\]/, 'options [valeur, libellé, pastille, nombre]');
        assert.match(src.ui, /ui-listbar-on/);
        assert.match(src.ui, /w\.openFilter = /);
        assert.match(src.ui, /w\.setSort = /);
    });
    await t('Trésors : une seule barre commune (barList → UI.listBar), plus de pastilles faites main', () => {
        assert.match(src.tl, /function barList\(o\)[\s\S]*?UI\.listBar\(\{key: KEY/);
        TRESORS.slice(0, 5).forEach(k => assert.match(src.tl, new RegExp(`key: '${k}'`), k));
        assert.match(src.tw, /key: 'gazettes'/);
        assert.ok(!/h-trl-filter|data-trl-f=|const filterBar/.test(src.tl), 'plus de pastilles C5 faites pour chaque Trésor');
        assert.match(src.tl, /value: \['allumees'\]/, 'Bougies : « Allumées » au départ');
        assert.match(src.tl, /value: \['encours'\]/, 'Partages : « En cours » au départ');
        assert.match(src.tl, /primary: '<button type="button" class="button" data-trl-gaps>/, 'l’assistant des actes manquants dans l’en-tête');
    });
    await t('une lettre scellée : la case 🔍 ne lit jamais son texte', () => {
        const m = src.tl.match(/ext\.lists\.tr_letters = [\s\S]*?ext\.lists\.tr_candles/)[0];
        const search = m.match(/search: \{[^\n]*/)[0];
        assert.ok(!/\.body/.test(search), 'pas de x.body dans le texte cherché');
    });
    await t('calendriers : 🔍 et Filtrer seulement (pas de Trier ni de Liste | Fiches)', () => {
        assert.match(src.cal, /listbar: \{key: 'genea_calendar'/);
        assert.match(src.cal, /listbar: \{key: 'my_calendar'/);
        assert.match(src.cal, /UI\.listBar\(\{key: LBK, search: \{placeholder: listbar\.placeholder\}, filters: [^}]*\}\)\.map|UI\.listBar\(\{key: LBK, search:/);
        const call = src.cal.match(/UI\.listBar\(\{key: LBK[^\n]*/)[0];
        assert.ok(!/sort:|view:/.test(call), 'ni sort ni view');
        assert.ok(!/placeSelect|data-cal-place|cal_person/.test(src.cal), 'l’ancien champ de lieu et le choix de personne sont dans Filtrer');
    });
    await t('Mes listes : barre H10, ⤓ Exporter ▾, 🖨 Imprimer L1, ⋯ ; plus de boutons faits main', () => {
        assert.match(src.more, /LBK = `listes:mylist:\$\{id\}`/);
        assert.match(src.more, /remember: 'given'/);
        assert.match(src.more, /data-lv-export aria-haspopup="true">⤓ Exporter ▾/);
        assert.match(src.more, /UI\.openPrintDialog\(\{title: L\.name \|\| 'Liste', key: 'mylist'/);
        assert.match(src.more, /data-lv-dup>⧉ Dupliquer/);
        assert.match(src.more, /Plus ▾/);
        assert.ok(!/data-lv-csv|data-lv-mode=|data-lv-unfilter|h-lv-help|FILTRER LA COLONNE/.test(src.more), 'anciens boutons et fenêtre de filtre retirés');
    });
    await t('« Déjà là » : en-tête K5, mots C6, rubriques en plus', () => {
        assert.match(src.av, /pageHeader\(\{icon: K\.icon, title: K\.title/);
        assert.ok(!/Ajout : récent → ancien/.test(src.av), 'Audios / Vidéos : les mots de C6');
        assert.match(src.av, /\['added_desc', f \? 'Les plus récentes' : 'Les plus récents'\]/);
        assert.match(src.bd, /UI\.pageHeader\(\{icon: HEAD\[0\], title/);
        assert.ok(!/data-bd-count/.test(src.bd), 'le nombre quitte la phrase d’aide');
        assert.match(src.rc, /filters: \[\{id: 'place', label: 'Lieu', type: 'place'/);
        assert.match(src.fi, /filters: \[\{id: 'label', label: 'Étiquette', kind: 'label'/);
        assert.match(src.sv, /tab === 'groups' \? \(grpSp\.length \? \[\{id: 'sp', label: 'Espèce'/);
        assert.match(src.sv, /\['recent', 'Les plus récentes'\]/);
        assert.match(src.pc, /\['za', 'Z → A'\], \['sent', 'Par date d’envoi'\]/, 'les 4 tris de base d’abord');
    });
    await t('FAQ : une entrée commune « barre des listes »', () => {
        const faq = src.more.match(/\['À quoi sert la barre au-dessus des listes \?', '[^']*(?:’[^']*)*'\]/);
        assert.ok(faq, 'l’entrée existe');
        assert.match(src.more, /Une liste encore vide ne montre pas de barre/);
        assert.match(src.more, /une lettre scellée n’est jamais cherchée dans son texte/);
    });

    /* ── 2. navigateur ── */
    let chromium = null;
    try { ({chromium} = require('playwright')); } catch (_) { try { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); } catch (__) { chromium = null; } }
    const phpPath = findPhp([devBundledPhp()]);
    if (!chromium || !phpPath) { console.log('— navigateur : Playwright ou PHP absent, partie sautée'); console.log(`${failed ? '✗' : '✓'} H10 lot D : ${count} vérifications`); process.exit(failed ? 1 : 0); }
    const shots = process.env.H10D_SHOTS || '';
    const envFor = d => ({...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1'});
    const makeBase = seed => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-h10d-'));
        fs.mkdirSync(path.join(tmp, 'media'), {recursive: true});
        const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; $pdo = db(); require_once 'lib/tresors.php';
` + (seed ? String.raw`
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status) VALUES(1,'Antoine','Borie','male','deceased'),(2,'Louise','Besse','female','deceased'),(3,'Jean','Peyre','male','deceased'),(4,'Léa','Borie','female','deceased')");
$pdo->exec("INSERT INTO places(id,name,county,country) VALUES(1,'Naves','Corrèze','France'),(2,'Tulle','Corrèze','France'),(3,'Aurillac','Cantal','France')");
$tag = fn($t) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$t' LIMIT 1")->fetchColumn();
$b = $tag('BIRT'); $d = $tag('DEAT'); $m = $tag('MARR');
$pdo->exec("INSERT INTO families(id,partner1_id,partner2_id) VALUES(1,1,2)");
$pdo->exec("INSERT INTO family_children(family_id,child_id) VALUES(1,4)");
$pdo->exec("INSERT INTO events(scope,person_id,event_type_id,date_text,year,place_id) VALUES('person',1,$b,'7 mai 1820',1820,1),('person',2,$b,'3 mars 1825',1825,2),('person',3,$b,'12 juin 1790',1790,3),('person',4,$b,'9 août 1850',1850,1),('person',1,$d,'2 février 1890',1890,2)");
$pdo->exec("INSERT INTO events(scope,family_id,event_type_id,date_text,year,place_id) VALUES('family',1,$m,'14 juin 1848',1848,1)");
$pdo->exec("INSERT INTO labels(id,name,color) VALUES(1,'Pologne','#0066cc')");
tresor_save($pdo, ['kind' => 'letter', 'person_id' => 1, 'title' => 'Pour les 18 ans de Léa', 'body' => 'MOT-SECRET-SCELLE', 'open_at' => '2045-05-01', 'data' => ['from' => '1', 'to' => 'Léa', 'for_person' => 4]]);
tresor_save($pdo, ['kind' => 'letter', 'person_id' => 2, 'title' => 'En 2050', 'body' => 'autre', 'open_at' => '2050-01-01', 'data' => ['from' => 'Tante Rose', 'to' => 'les arrière-petits-enfants']]);
tresor_save($pdo, ['kind' => 'candle', 'person_id' => 1, 'title' => 'Pour Antoine', 'body' => 'Pensées du dimanche', 'data' => ['from' => 'Marie']]);
tresor_save($pdo, ['kind' => 'candle', 'person_id' => 3, 'title' => 'Pour Jean', 'body' => 'Toujours là', 'data' => ['from' => 'Paul']]);
$pdo->exec("UPDATE tresor_items SET created_at='2020-01-01 10:00:00' WHERE kind='candle' AND person_id=3"); // éteinte depuis longtemps
tresor_save($pdo, ['kind' => 'share', 'person_id' => 1, 'title' => 'Branche Borie', 'open_at' => '2099-01-01', 'data' => ['people' => 12, 'locked' => true]]);
tresor_save($pdo, ['kind' => 'share', 'person_id' => 3, 'title' => 'Branche Peyre', 'open_at' => '2001-01-01', 'data' => ['people' => 5, 'locked' => false]]);
tresor_save($pdo, ['kind' => 'stamp', 'place_id' => 1, 'title' => 'Naves', 'data' => ['date' => '2025-06-01', 'note' => 'la tombe au fond']]);
$l = save_my_list($pdo, ['name' => 'Cousins de test', 'icon' => '📋', 'description' => 'Toutes les personnes.', 'source' => 'persons', 'definition' => ['rules' => [], 'in_lists' => true]]);
file_put_contents(DATA_DIR . '/mylist.id', (string) $l['id']);
$s = save_topic_sheet($pdo, ['title' => 'La Pologne', 'subtitle' => 'avant 1800', 'blocks' => []]); save_topic_sheet($pdo, ['title' => 'Le moulin', 'blocks' => []]);
$pdo->exec("INSERT INTO label_links(label_id,entity_type,entity_id) VALUES(1,'topic_sheet'," . (int) $s['id'] . ")");
save_recueil($pdo, ['title' => 'Registre des prisonniers', 'place_text' => 'Tulle, archives', 'first_version' => 'Photos']); save_recueil($pdo, ['title' => 'Cahier de Naves', 'place_text' => 'Naves, mairie', 'first_version' => 'Photos']);
` : String.raw`
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status) VALUES(1,'Seul','Personne','male','deceased')"); // une fiche : l'app s'ouvre (sinon l'écran d'installation)
`) + "echo 'ok';"], {cwd: root, encoding: 'utf8', env: envFor(tmp)});
        if (r.status !== 0 || !String(r.stdout).includes('ok')) throw new Error(r.stderr || r.stdout);
        return tmp;
    };
    const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const startServer = async dir => {
        const port = await freePort();
        const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env: envFor(dir), stdio: 'ignore'});
        const base = `http://127.0.0.1:${port}/`;
        for (let i = 0; i < 150; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
        return {proc, base};
    };
    let full, empty;
    try { full = makeBase(true); empty = makeBase(false); } catch (e) { failed++; console.error('✗ base de test', e.message); process.exit(1); }
    const mylistId = Number(fs.readFileSync(path.join(full, 'mylist.id'), 'utf8')) || 1;
    const srv = await startServer(full), srvEmpty = await startServer(empty);
    const browser = await chromium.launch();
    const errs = [];
    const page = async (base, {width = 1440, dark = false} = {}) => {
        const ctx = await browser.newContext({viewport: {width, height: 900}, colorScheme: dark ? 'dark' : 'light'});
        const p = await ctx.newPage();
        p.on('pageerror', e => errs.push(`${width}${dark ? ' sombre' : ''} : ${e.message}`));
        p.on('console', m => { if (m.type() === 'error' && !/favicon|ERR_ABORTED|tile|Failed to load resource: net::/.test(m.text())) errs.push(`${width} console : ${m.text()}`); });
        p.on('response', r => { if (r.status() >= 400 && !/favicon|tile/.test(r.url())) errs.push(`${r.status()} ${r.url()}`); });
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.bootstrap && window.LCNDA_UI?.listBar, null, {timeout: 30000});
        if (dark) await p.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
        p.ctx = ctx; return p;
    };
    const open = async (p, type) => {
        await p.evaluate(t => { const A = window.LCNDA_APP; A.state.listType = t; return A.setModule('listes'); }, type);
        await p.waitForFunction(() => document.querySelector('#workspace .ui-listbar, #workspace .empty-box, #workspace .h-cal'), null, {timeout: 15000});
        await p.waitForTimeout(300);
    };
    const info = p => p.evaluate(() => { const ws = document.querySelector('#workspace'), bar = ws.querySelector('.ui-listbar'), sel = bar?.querySelector('.ui-listbar-sort select');
        return {bar: !!bar, count: bar?.querySelector('.ui-listbar-count')?.textContent || '', chips: [...ws.querySelectorAll('.ui-listbar-chip')].map(c => c.textContent.replace('×', '').trim()),
            rows: ws.querySelectorAll('tbody tr').length, sort: sel?.value ?? null, sortLabel: sel?.selectedOptions[0]?.textContent || '', opts: sel ? [...sel.options].map(o => o.textContent) : [],
            text: ws.innerText, empty: !!ws.querySelector('.empty-box'), overflow: document.documentElement.scrollWidth > innerWidth + 1}; });
    const search = async (p, q) => { await p.fill('#workspace .ui-listbar-q input', q); await p.waitForTimeout(450); };
    const shot = async (p, name) => { if (shots) { fs.mkdirSync(shots, {recursive: true}); await p.screenshot({path: path.join(shots, `${name}.png`), fullPage: false}); } };

    const p = await page(srv.base);
    await t('✉️ Lettres : chercher (jamais le texte scellé), État, tri par colonne, retenu au rechargement', async () => {
        await open(p, 'tr_letters'); let i = await info(p);
        assert.ok(i.bar, 'la barre'); assert.equal(i.count, '2 lettres');
        assert.deepEqual(i.opts, ['Date d’ouverture', 'Les plus récentes', 'Les plus anciennes', 'A → Z', 'Z → A']);
        await search(p, 'MOT-SECRET'); i = await info(p); assert.match(i.count, /^0 lettre sur 2/, 'le texte d’une lettre scellée n’est pas cherché');
        await search(p, 'rose'); i = await info(p); assert.equal(i.count, '1 lettre sur 2', '« De » est cherché');
        await search(p, '');
        await p.click('#workspace .ui-listbar-fbtn'); await p.waitForSelector('.ui-listbar-menu');
        const menu = await p.$eval('.ui-listbar-menu', m => m.innerText); assert.match(menu, /🔒 Scellées\s*2/, 'le nombre à droite du choix');
        await p.check('.ui-listbar-menu input[value="scellees"]'); await p.keyboard.press('Escape'); await p.waitForTimeout(200);
        i = await info(p); assert.deepEqual(i.chips, ['🔒 Scellées']);
        await p.click('#workspace [data-trl-col="title"]'); await p.waitForTimeout(150); i = await info(p); assert.equal(i.sort, 'az', 'un clic sur « Lettre » → A → Z');
        await p.click('#workspace [data-trl-col="title"]'); await p.waitForTimeout(150); i = await info(p); assert.equal(i.sort, 'za');
        await p.click('#workspace [data-trl-col="from"]'); await p.waitForTimeout(150); i = await info(p); assert.equal(i.sortLabel, 'De : A → Z', 'un tri de colonne s’ajoute au menu');
        await shot(p, 'lettres-1440');
        await p.reload(); await p.waitForFunction(() => window.LCNDA_APP?.state?.bootstrap); await open(p, 'tr_letters'); i = await info(p);
        assert.deepEqual(i.chips, ['🔒 Scellées'], 'filtre retenu'); assert.equal(i.sort, 'col:from:asc', 'tri retenu');
        await p.click('#workspace .ui-listbar-chip'); await p.waitForTimeout(150); i = await info(p); assert.deepEqual(i.chips, []);
    });
    await t('🕯️ Bougies : « Allumées » au départ en pastille, × montre tout le registre, Pour 👤 (menu de choix)', async () => {
        await open(p, 'tr_candles'); let i = await info(p);
        assert.deepEqual(i.chips, ['🕯️ Allumées']); assert.equal(i.count, '1 bougie sur 2'); assert.equal(i.rows, 1);
        await p.click('#workspace .ui-listbar-chip'); await p.waitForTimeout(150); i = await info(p); assert.equal(i.count, '2 bougies'); assert.equal(i.rows, 2);
        await p.click('#workspace .ui-listbar-fbtn'); await p.waitForSelector('.ui-listbar-menu .pk');
        await p.click('.ui-listbar-menu [data-lb-pk="for"] input:not([type=hidden])'); await p.keyboard.type('Peyre');
        await p.waitForSelector('.pk-item', {timeout: 8000}); await p.click('.pk-item >> nth=0'); await p.waitForTimeout(300);
        await p.keyboard.press('Escape'); await p.waitForTimeout(150);
        i = await info(p); assert.ok(i.chips.some(c => /Pour : Jean PEYRE|Pour : Jean Peyre/i.test(c)), `pastille de la personne : ${i.chips}`); assert.equal(i.rows, 1);
        await search(p, 'dimanche'); i = await info(p); assert.ok(i.text.includes('Tout effacer'));
        await p.click('#workspace .ui-listbar-clearall'); await p.waitForTimeout(200); i = await info(p); assert.deepEqual(i.chips, []); assert.equal(i.rows, 2);
        await shot(p, 'bougies-1440');
    });
    await t('🔗 Partages, 📍 Passeport des lieux, 📰 Gazettes : rubriques et tris de la maquette', async () => {
        await open(p, 'tr_shares'); let i = await info(p);
        assert.deepEqual(i.chips, ['✅ En cours']); assert.equal(i.count, '1 partage sur 2'); assert.ok(i.opts.includes('Jusqu’au'));
        await open(p, 'tr_stamps'); i = await info(p);
        assert.deepEqual(i.opts, ['Le plus de personnes de l’arbre', 'A → Z', 'Z → A', 'Date de visite']);
        await p.click('#workspace .ui-listbar-fbtn'); await p.waitForSelector('.ui-listbar-menu');
        const menu = await p.$eval('.ui-listbar-menu', m => m.innerText); assert.match(menu, /Département/i); assert.match(menu, /Corrèze\s*2/);
        await p.check('.ui-listbar-menu input[value="visites"]'); await p.keyboard.press('Escape'); await p.waitForTimeout(150);
        i = await info(p); assert.equal(i.rows, 1); assert.match(i.text, /Naves/);
        await open(p, 'gazettes'); i = await info(p);
        assert.deepEqual(i.opts, ['Les plus récentes', 'Les plus anciennes', 'Le plus de nouvelles'], 'pas de A → Z');
        await search(p, 'Louise'); i = await info(p); assert.ok(i.rows >= 1 && /sur/.test(i.count), 'un nom cité');
        await search(p, '');
    });
    await t('🏛️ Actes manquants : l’assistant dans l’en-tête (K5)', async () => {
        await open(p, 'tr_gaps');
        assert.ok(await p.$('#workspace .page-header [data-trl-gaps]'), 'bouton dans l’en-tête');
    });
    await t('📜 Calendrier de la famille : 🔍 et Filtrer (Sorte, Personne, Lieu) sans Trier ni Liste | Fiches', async () => {
        await open(p, 'genea_calendar'); await p.waitForSelector('#workspace .h-cal .ui-listbar');
        let i = await info(p);
        assert.equal(i.sort, null, 'pas de Trier'); assert.ok(!(await p.$('#workspace .ui-listbar .ui-viewtoggle')), 'pas de Liste | Fiches');
        await p.click('#workspace .h-cal [data-cal-view="list"]'); await p.waitForTimeout(200);
        await p.evaluate(() => { const A = window.LCNDA_APP, s = A.state.hCal.genea; s.cursor = [1848, 6, 14]; }); await p.click('#workspace [data-cal-today]').catch(() => {});
        await p.evaluate(() => { const s = window.LCNDA_APP.state.hCal.genea; s.view = 'year'; s.cursor = [1848, 1, 1]; return window.LCNDA_APP.renderList(); }); await p.waitForTimeout(400);
        await search(p, 'mariage'); i = await info(p); assert.match(i.count, /^1 événement sur 6/, `la recherche garde les événements qui correspondent (${i.count})`);
        await search(p, '');
        await p.click('#workspace .ui-listbar-fbtn'); await p.waitForSelector('.ui-listbar-menu');
        const menu = await p.$eval('.ui-listbar-menu', m => m.innerText); assert.match(menu, /SORTE/i); assert.match(menu, /PERSONNE/i); assert.match(menu, /LIEU/i);
        await p.check('.ui-listbar-menu input[value="death"]'); await p.keyboard.press('Escape'); await p.waitForTimeout(250);
        i = await info(p); assert.match(i.count, /^1 événement sur 6/); assert.equal(i.chips.length, 1);
        await p.click('#workspace .h-cal-leg[data-cal-leg="birth"]'); await p.waitForTimeout(250); i = await info(p); assert.match(i.count, /^5 événements sur 6/, 'la légende est un raccourci de Filtrer › Sorte');
        await p.evaluate(() => document.querySelector('#workspace .ui-listbar').setFilter('place', 'txt:Cantal')); await p.waitForTimeout(250);
        i = await info(p); assert.match(i.count, /^1 événement sur 6/, 'un lieu tapé : commune, département, région ou pays');
        await shot(p, 'calendrier-famille-1440');
        await p.evaluate(() => document.querySelector('#workspace .ui-listbar').clear(true)); await p.waitForTimeout(250);
    });
    await t('🗓️ Mon agenda : rien de prévu → pas de barre', async () => {
        await open(p, 'my_calendar'); assert.ok(!(await p.$('#workspace .ui-listbar')));
    });
    await t('📋 Mes listes : barre, Plus ▾, filtres rangés dans la liste, ⤓ Exporter ▾, 🖨 L1, ⋯', async () => {
        await open(p, `mylist:${mylistId}`); await p.waitForSelector('#workspace .h-mylist .ui-listbar');
        let i = await info(p); assert.equal(i.count, '4 personnes'); assert.equal(i.opts[0], 'Dans l’ordre de la liste');
        assert.ok(await p.$('#workspace .page-header [data-lv-export]')); assert.ok(await p.$('#workspace .page-header [data-lv-print]'));
        assert.ok(await p.$('#workspace .page-header details.ui-ph-more [data-lv-dup]'), '⧉ Dupliquer dans ⋯');
        assert.ok(!(await p.$('#workspace .h-cols-bar')), 'pas de seconde barre « ⚙️ Colonnes / ⤓ Exporter »');
        await search(p, 'borie'); i = await info(p); assert.equal(i.count, '2 personnes sur 4');
        await search(p, '');
        // le ▾ d'une colonne ouvre Filtrer sur sa rubrique ; cocher une valeur → rangé dans la liste (serveur)
        await p.click('#workspace .h-lv-filter'); await p.waitForSelector('.ui-listbar-menu');
        await p.check('.ui-listbar-menu .ui-listbar-opt input[type=checkbox] >> nth=0'); await p.waitForTimeout(900);
        const saved = await p.evaluate(async id => (await window.LCNDA_APP.api('my_list_rows', {id})).list.definition.filters, mylistId);
        assert.ok(Object.values(saved).some(f => f.values?.length === 1), 'filtre rangé dans la liste');
        await p.keyboard.press('Escape'); await p.waitForTimeout(200);
        i = await info(p); assert.equal(i.chips.length, 1); assert.match(i.count, /sur 4/);
        // « Plus ▾ » : une autre présentation, écrite dans le bouton
        await p.click('#workspace .h-lv-plus'); await p.waitForSelector('.ui-actmenu'); await p.click('.ui-actmenu >> text=Frise'); await p.waitForTimeout(900);
        assert.match(await p.$eval('#workspace .h-lv-plus', b => b.textContent), /Frise ▾/);
        await p.click('#workspace .ui-viewtoggle [data-view="list"]'); await p.waitForTimeout(900);
        assert.ok(await p.$('#workspace .h-lv-table'), 'retour au tableau');
        // un clic sur un titre de colonne trie et met « Trier » à jour
        await p.click('#workspace [data-lv-sort] >> nth=0'); await p.waitForTimeout(200); i = await info(p); assert.match(i.sortLabel, /A → Z/);
        // ⤓ Exporter ▾ : CSV, tableur, Excel
        await p.click('#workspace [data-lv-export]'); await p.waitForTimeout(200);
        const exp = await p.evaluate(() => document.body.innerText); assert.match(exp, /CSV \(tableur, Excel\)/); assert.match(exp, /Fichier Excel \(\.xlsx\)/);
        await p.keyboard.press('Escape');
        // 🖨 Imprimer : la fenêtre unique L1, « La vue affichée » / « Toute la liste »
        await p.click('#workspace [data-lv-print]'); await p.waitForSelector('dialog[open]'); const dl = await p.$eval('dialog[open]', d => d.innerText);
        assert.match(dl, /La vue affichée/); assert.match(dl, /Toute la liste/); await p.keyboard.press('Escape'); await p.waitForTimeout(200);
        await shot(p, 'mes-listes-1440');
        await p.reload(); await p.waitForFunction(() => window.LCNDA_APP?.state?.bootstrap); await open(p, `mylist:${mylistId}`); await p.waitForSelector('#workspace .h-mylist .ui-listbar');
        i = await info(p); assert.equal(i.chips.length, 1, 'le filtre reste (rangé dans la liste)'); assert.match(i.sortLabel, /A → Z/, 'tri retenu');
        await p.evaluate(() => document.querySelector('#workspace .ui-listbar').clear(true)); await p.waitForTimeout(900);
    });
    await t('« Déjà là » : Fiches thématiques → Étiquette, Recueils → Lieu, Audios (vide → K10 seule), Tableaux (K5, nombre dans la barre)', async () => {
        await open(p, 'topic_sheets_list'); await p.waitForSelector('#workspace .ui-listbar');
        await p.evaluate(() => document.querySelector('#workspace .ui-listbar').setFilter('label', {id: 1, title: 'Pologne'})); await p.waitForTimeout(250);
        let i = await info(p); assert.match(i.count, /^1 fiche sur 2/); assert.deepEqual(i.chips, ['Étiquette : Pologne']);
        await p.evaluate(() => document.querySelector('#workspace .ui-listbar').clear(true)); await p.waitForTimeout(250);
        await open(p, 'recueils'); await p.waitForSelector('#workspace .ui-listbar');
        await p.evaluate(() => document.querySelector('#workspace .ui-listbar').setFilter('place', 'txt:Naves')); await p.waitForTimeout(800);
        i = await info(p); assert.match(i.count, /^1 recueil sur 2/); assert.deepEqual(i.chips, ['Lieu : Naves']);
        await p.evaluate(() => document.querySelector('#workspace .ui-listbar').clear(true)); await p.waitForTimeout(800);
        await open(p, 'audios'); i = await info(p); assert.ok(!i.bar && i.empty, 'aucun son : la grande boîte K10 seule');
        assert.ok(await p.$('#workspace .page-header.ui-ph'), 'en-tête K5');
        await open(p, 'boards_list'); assert.ok(await p.$('#workspace .page-header.ui-ph'));
    });
    await t('Sans barre : Langues de la famille', async () => {
        await open(p, 'languages'); await p.waitForTimeout(400);
        assert.ok(!(await p.$('#workspace .ui-listbar')), 'un résumé, sans barre');
    });
    await t('téléphone (390 px) et sombre : pas de défilement horizontal', async () => {
        for (const [width, dark] of [[390, false], [390, true], [1440, true]]) {
            const q = await page(srv.base, {width, dark});
            for (const type of [...TRESORS, 'genea_calendar', `mylist:${mylistId}`, 'topic_sheets_list']) {
                await open(q, type); const i = await info(q); assert.ok(!i.overflow, `${type} à ${width} px${dark ? ' (sombre)' : ''}`);
                if (['tr_candles', 'genea_calendar', `mylist:${mylistId}`].includes(type)) await shot(q, `${type.replace(':', '-')}-${width}${dark ? '-sombre' : ''}`);
            }
            await q.ctx.close();
        }
    });
    await t('base vide : la grande boîte K10 seule, sans barre', async () => {
        const q = await page(srvEmpty.base);
        for (const type of [...TRESORS.filter(x => x !== 'tr_gaps'), 'my_calendar', 'genea_calendar', 'topic_sheets_list', 'recueils', 'audios', 'videos', 'boards_list']) {
            await open(q, type); const i = await info(q);
            assert.ok(!i.bar, `${type} : pas de barre`);
            if (!/calendar/.test(type)) assert.ok(i.empty, `${type} : la grande boîte K10`);
        }
        await shot(q, 'vide-lettres'); await q.ctx.close();
    });
    await t('aucune erreur JavaScript ni réponse 4xx / 5xx', () => { assert.deepEqual(errs, []); });

    await browser.close();
    srv.proc.kill(); srvEmpty.proc.kill();
    for (const d of [full, empty]) fs.rmSync(d, {recursive: true, force: true});
    console.log(`${failed ? '✗' : '✓'} H10 lot D : ${count} vérifications`);
    process.exit(failed ? 1 : 0);
})();
