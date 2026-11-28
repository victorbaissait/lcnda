#!/usr/bin/env node
'use strict';
/* 🧪 Audit des onglets (docs/design/audit-onglets.html) — lot « options » : 🐾 Suivi (§3), 📄 Documents (§4), 🎨 Catalogue (§5),
 * ⚖️ Successions (§6), 📒 Fiches (§13), onglets à soi (§18) et 🕘 Historique unifié ↶ (app-ui.js).
 *   node tests/test-audit-options.js
 * Un vrai « php -S » sur une base neuve (MAZAUD, LACOMBE, DURAND), le routeur d'essai tests/router-audit-options.php (route
 * POST onglets_write de lib/onglets.php), puis un navigateur. Les fichiers neufs (heritage-suivi-audit.js,
 * heritage-successoral-audit.js, assets/css/audit-options.css) sont ajoutés à la page s'ils n'y sont pas encore. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const {spawn, spawnSync} = require('node:child_process');
let chromium; try { ({chromium} = require('playwright')); } catch (_) { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); }
const {findPhp, devBundledPhp, phpRuntimeArgs} = require('../electron/php-server');

const root = path.resolve(__dirname, '..');
const phpPath = findPhp([devBundledPhp()]) || 'php';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-audit-options-'));
fs.mkdirSync(path.join(dir, 'media'), {recursive: true});
const env = {...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4'};
let fails = 0;
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY) : null; // ONLY="Catalogue|Pierre" : seulement ces essais
const t = async (name, fn) => { if (ONLY && !ONLY.test(name)) return; try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 8).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php';
require 'tests/api_functions.php';
require_once 'lib/topic_sheets.php';
$pdo = db();
art_ensure($pdo);
$tag = function ($t) use ($pdo) { $s = $pdo->prepare('SELECT id FROM event_types WHERE gedcom_tag=? ORDER BY id LIMIT 1'); $s->execute([$t]); return (int) $s->fetchColumn(); };
$pl = function ($name, $lat = null, $lon = null) use ($pdo) { $pdo->prepare('INSERT INTO places(name, country, latitude, longitude) VALUES(?,?,?,?)')->execute([$name, 'France', $lat, $lon]); return (int) $pdo->lastInsertId(); };
$naves = $pl('Naves', 45.31, 1.77); $tulle = $pl('Tulle', 45.27, 1.77);
$per = function ($f, $l, $g, $evs = [], $living = 'deceased', $occ = '') use ($pdo, $tag) {
    $pdo->prepare("INSERT INTO persons(first_name,last_name,gender,living_status,occupation) VALUES(?,?,?,?,?)")->execute([$f, $l, $g, $living, $occ]); $id = (int) $pdo->lastInsertId();
    foreach ($evs as [$t, $y, $p]) { $pdo->prepare("INSERT INTO events(scope, person_id, event_type_id, year, date_text, place_id) VALUES('person',?,?,?,?,?)")->execute([$id, $tag($t), $y, (string) $y, $p]); }
    return $id; };
$pierre = $per('Pierre', 'MAZAUD', 'male', [['BIRT', 1850, $naves], ['DEAT', 2025, $tulle]], 'deceased', 'sabotier');
$marie = $per('Marie', 'LACOMBE', 'female', [['BIRT', 1880, $tulle], ['DEAT', 1950, $tulle]]);
$jean = $per('Jean', 'DURAND', 'male', [['BIRT', 1878, $naves], ['DEAT', 1940, $naves]], 'deceased', 'sabotier');
$paul = $per('Paul', 'MAZAUD', 'male', [['BIRT', 1960, $tulle]], 'living');
$anne = $per('Anne', 'MAZAUD', 'female', [['BIRT', 1962, $tulle]], 'living');
$louis = $per('Louis', 'DURAND', 'male', [['BIRT', 1900, $naves], ['DEAT', 2024, $tulle]]);
// Pierre a deux enfants vivants (Paul, Anne) : ses héritiers
$pdo->prepare('INSERT INTO families(partner1_id, partner2_id) VALUES(?,?)')->execute([$pierre, $marie]); $fam = (int) $pdo->lastInsertId();
foreach ([$paul, $anne] as $c) { $pdo->prepare('INSERT INTO family_children(family_id, child_id) VALUES(?,?)')->execute([$fam, $c]); }
// des documents (une petite image)
$file = 'doc.jpg';
if (function_exists('imagecreatetruecolor')) { $im = imagecreatetruecolor(400, 600); imagefill($im, 0, 0, imagecolorallocate($im, 200, 190, 170)); imagejpeg($im, MEDIA_DIR . '/' . $file); }
else { file_put_contents(MEDIA_DIR . '/' . $file, base64_decode('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=')); }
$m = $pdo->prepare("INSERT INTO media(title, filename, media_type, date_text, document_reference, transcription, correspondence_type, correspondent_name) VALUES(?,?,?,?,?,?,?,?)");
$docs = [];
foreach ([['Acte de naissance de Pierre MAZAUD', '1850', '3 E 12/4', 'L’an mil huit cent cinquante…', '', ''], ['Bail de la ferme de Naves', '1903', '', '', '', ''],
    ['Lettre de Pierre à Marie', '3 mars 1916', 'L 1', 'Ma chère Marie', 'lettre', 'Marie LACOMBE'], ['Lettre de Marie à Pierre', '20 juin 1916', 'L 2', '', 'lettre', 'Marie LACOMBE'],
    ['Portrait de Jean DURAND', '1912', '', '', '', '']] as [$ti, $d, $c, $tr, $ct, $cn]) { $m->execute([$ti, $file, 'image', $d, $c, $tr, $ct, $cn]); $docs[] = (int) $pdo->lastInsertId(); }
$ml = $pdo->prepare("INSERT INTO media_links(media_id, entity_type, entity_id, position) VALUES(?, 'person', ?, 1)");
$ml->execute([$docs[0], $pierre]); $ml->execute([$docs[2], $pierre]); $ml->execute([$docs[3], $pierre]); $ml->execute([$docs[4], $jean]);
$pdo->prepare("UPDATE media SET place_id=? WHERE id=?")->execute([$naves, $docs[1]]);
$pdo->exec("INSERT INTO labels(name, color) VALUES('À vérifier', '#cc4700')"); $lab = (int) $pdo->lastInsertId();
$pdo->prepare("INSERT INTO label_links(label_id, entity_type, entity_id) VALUES(?, 'media', ?)")->execute([$lab, $docs[1]]);
// fiches : « Le métier de sabotier » (Pierre dans un bloc Personnes), une note de Jean qui la cite, une fiche longue
$sab = save_topic_sheet($pdo, ['title' => 'Le métier de sabotier', 'subtitle' => 'Un métier d’autrefois', 'blocks' => [
    ['type' => 'text', 'title' => 'Le métier', 'text' => 'Le sabotier creuse le bois de noyer à la cuillère.'], ['type' => 'people', 'title' => 'Mes sabotiers', 'ids' => [$pierre]]]])['id'];
$pdo->prepare("INSERT INTO notes(entity_type, entity_id, title, body, created_at, updated_at) VALUES('person', ?, 'Métier', 'Voir la fiche « Le métier de sabotier ».', datetime('now'), datetime('now'))")->execute([$jean]);
$long = save_topic_sheet($pdo, ['title' => 'La Grande Guerre à Naves', 'blocks' => array_map(fn($i) => ['type' => 'text', 'title' => 'Partie ' . $i, 'text' => $i === 5 ? 'Le monument aux morts de Naves.' : 'Texte ' . $i], range(1, 7))])['id'];
// artiste : Marie LACOMBE, peintre (œuvres, provenance, exposition)
art_make_artist($pdo, $marie, 'peintre');
$save = fn(string $kind, array $data) => art_save_item($pdo, ['person_id' => $marie, 'kind' => $kind, 'data' => $data, 'parent_id' => 0])['id'];
$ex = $save('exhibition', ['title' => 'Salon de Tulle', 'dates' => '1931', 'place' => ['txt' => 'Tulle, France']]);
$save('work', ['title' => 'Le Pont de Tulle', 'date' => '1925', 'technique' => 'Huile sur toile', 'catref' => 'CR 1', 'provenance' => [['date' => '1931', 'mode' => 'vente', 'how' => 'lot 12', 'price' => '8 500 F']], 'exhibitions' => [['ex' => ['iid' => $ex, 'title' => 'Salon de Tulle', 'kind' => 'exhibition']]]]);
$save('work', ['title' => 'Bouquet', 'date' => '1932', 'technique' => 'Gouache', 'catref' => 'CR 2']);
$save('work', ['title' => 'Les Toits de Naves', 'date' => '1938', 'technique' => 'Huile sur toile', 'catref' => 'CR 3']);
echo json_encode(compact('pierre', 'marie', 'jean', 'paul', 'anne', 'louis', 'docs', 'lab', 'sab', 'long', 'naves', 'tulle'));`], {cwd: root, encoding: 'utf8', env});
if (seed.status !== 0 || !/"pierre"/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
const ID = JSON.parse(seed.stdout.trim().split('\n').pop());

(async () => {
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'tests/router-audit-options.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const errs = [];
    try {
        const ctx = await browser.newContext({viewport: {width: 1440, height: 900}, acceptDownloads: true});
        await ctx.addInitScript(() => { try { if (!sessionStorage.getItem('t-init')) { sessionStorage.setItem('t-init', '1'); ['suivi', 'animaux', 'fiches', 'documents', 'catalogue', 'successoral'].forEach(k => localStorage.setItem('genealogie-menu-' + k, '1')); localStorage.setItem('genealogie-usage', JSON.stringify({usages: ['genealogie', 'successoral']})); } } catch (_) {} });
        const p = await ctx.newPage();
        p.on('pageerror', e => errs.push(e.message));
        const boot = async () => {
            await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.onglets?.documents && window.LCNDA_EXT?.fiches, null, {timeout: 40000});
            await p.evaluate(async () => { // fichiers neufs pas encore dans index.php : ajoutés à la page
                const add = src => new Promise(r => { if ([...document.scripts].some(s => s.src.includes(src))) return r(); const s = document.createElement('script'); s.src = src; s.onload = r; s.onerror = r; document.head.appendChild(s); });
                if (![...document.styleSheets].some(s => String(s.href).includes('audit-options.css'))) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'assets/css/audit-options.css'; document.head.appendChild(l); }
                await add('assets/js/heritage-suivi-audit.js'); await add('assets/js/heritage-successoral-audit.js');
            });
        };
        await boot();
        const api = (x, q = {}) => p.evaluate(([y, z]) => window.LCNDA_APP.api(y, z).catch(e => ({error: e.message})), [x, q]);
        const post = (a, b) => p.evaluate(async ([x, y]) => { try { const r = await window.LCNDA_APP.api(x, {}, {method: 'POST', body: y}); return r.result ?? r; } catch (e) { return {error: e.message}; } }, [a, b]);
        const go = async m => { await p.evaluate(mod => window.LCNDA_APP.setModule(mod), m); await sleep(500); };
        const closeDlgs = () => p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => { d.dataset.ownClose = '1'; delete d.dataset.dirty; d.close(); d.remove(); }));
        const lastToastUndo = async () => { const b = p.locator('.toast.undo .ui-toast-btn').last(); await b.click(); await sleep(400); };

        /* ═════ 🕘 Historique unifié ═════ */
        await t('🕘 historique : chaque « ↶ Annuler » s’inscrit (A().undoToast et ceux d’app.js), ⌘⌥Z ouvre la fenêtre', async () => {
            await p.evaluate(() => {
                window.__x = 1; window.LCNDA_APP.undoToast('Essai A', {undo: () => { window.__x = 0; }, redo: () => { window.__x = 1; }});
                localStorage.setItem('genealogie-essai-h', 'avant');
                window.LCNDA_APP.undoLocalChange('Essai B', ['genealogie-essai-h'], () => localStorage.setItem('genealogie-essai-h', 'après'));
            });
            await sleep(200);
            const h = await p.evaluate(() => window.LCNDA_UI.undoHistory().map(e => [e.label, e.state]));
            assert.deepEqual(h.slice(-2), [['Essai A', 'done'], ['Essai B', 'done']]);
            assert.equal(await p.locator('.toast.undo .ui-toast-hist').count() >= 1, true, 'le 🕘 dans le message ↶');
            await p.keyboard.press('Control+Alt+KeyZ');
            await p.waitForSelector('dialog[data-undo-history][open]');
            assert.ok((await p.locator('dialog[data-undo-history] .ui-hist-row').count()) >= 2);
        });
        await t('🕘 annuler une ligne ancienne annule d’abord les plus récentes ; rétablir dans l’ordre', async () => {
            const idA = await p.evaluate(() => window.LCNDA_UI.undoHistory().find(e => e.label === 'Essai A').id);
            await p.click(`dialog[data-undo-history] [data-hist-undo="${idA}"]`);
            await p.waitForFunction(() => window.LCNDA_UI.undoHistory().filter(e => /^Essai [AB]$/.test(e.label)).every(e => e.state === 'undone'), null, {timeout: 5000});
            assert.equal(await p.evaluate(() => window.__x), 0);
            assert.equal(await p.evaluate(() => localStorage.getItem('genealogie-essai-h')), 'avant');
            const idB = await p.evaluate(() => window.LCNDA_UI.undoHistory().find(e => e.label === 'Essai B').id);
            await p.waitForSelector(`dialog[data-undo-history] [data-hist-redo="${idB}"]:not([disabled])`);
            await p.click(`dialog[data-undo-history] [data-hist-redo="${idB}"]`);
            await p.waitForFunction(() => window.LCNDA_UI.undoHistory().filter(e => /^Essai [AB]$/.test(e.label)).every(e => e.state === 'done'), null, {timeout: 5000});
            assert.equal(await p.evaluate(() => window.__x), 1);
            assert.equal(await p.evaluate(() => localStorage.getItem('genealogie-essai-h')), 'après');
            await p.keyboard.press('Escape'); await sleep(200);
        });

        /* ═════ 📄 Documents ═════ */
        await go('documents');
        await p.waitForSelector('#sidebar-content [data-ong-doc]');
        await t('📄 rangements « 📍 Lieux » et « 🕰 Années »', async () => {
            await p.click('#sidebar-content [data-ong-mode="places"]'); await p.waitForSelector('#sidebar-content .ong-grow');
            const places = await p.$$eval('#sidebar-content .ong-grow .ong-rh span', els => els.map(e => e.textContent));
            assert.ok(places.includes('📍 Naves'), places.join('|'));
            await p.click('#sidebar-content [data-ong-mode="years"]'); await p.waitForSelector('#sidebar-content .ong-grow');
            const years = await p.$$eval('#sidebar-content .ong-grow .ong-rh span', els => els.map(e => e.textContent));
            assert.ok(years.includes('🕰 1910–1919') && years.includes('🕰 1850–1859'), years.join('|'));
            await p.click('#sidebar-content [data-ong-mode="az"]'); await p.waitForSelector('#sidebar-content .ong-row');
        });
        await t('📄 🏷 pastilles d’étiquettes et « Filtrer ▾ → Étiquette »', async () => {
            assert.match(await p.textContent(`#sidebar-content [data-ong-doc="${ID.docs[1]}"]`), /À vérifier/);
            await p.evaluate(lab => { localStorage.setItem('lcnda-listbar:onglets:documents', JSON.stringify({q: '', f: {label: [String(lab)]}, sort: 'az'})); window.LCNDA_APP.renderSidebar(); }, ID.lab);
            await p.waitForFunction(() => document.querySelectorAll('#sidebar-content [data-ong-doc]').length === 1);
            await p.evaluate(() => { localStorage.removeItem('lcnda-listbar:onglets:documents'); window.LCNDA_APP.renderSidebar(); });
            await p.waitForFunction(() => document.querySelectorAll('#sidebar-content [data-ong-doc]').length >= 5);
        });
        await t('📄 ✎ Modifier sur place (titre, date, lieu, cote, personnes) puis ↶ Annuler', async () => {
            await p.click(`#sidebar-content [data-ong-doc="${ID.docs[4]}"]`);
            await p.waitForSelector('#workspace [data-ong-edit]'); await p.click('#workspace [data-ong-edit]');
            await p.waitForSelector('#workspace [data-ong-inline]');
            await p.fill('#workspace [data-ong-inline] [name="title"]', 'Portrait de Jean DURAND en uniforme');
            await p.fill('#workspace [data-ong-inline] [name="document_reference"]', 'PH 7');
            await p.evaluate(([pl, pe]) => { const P = window.LCNDA_PICKER; P.pickerSet(document.querySelector('[data-ong-pfield] .pk'), {id: pl, title: 'Naves'}); P.pickerSet(document.querySelector('[data-ong-ppl] .pk'), [{id: pe[0], title: 'Jean DURAND'}, {id: pe[1], title: 'Louis DURAND'}]); }, [ID.naves, [ID.jean, ID.louis]]);
            await p.click('#workspace [data-ong-inline-save]');
            await p.waitForFunction(() => /en uniforme/.test(document.querySelector('#workspace h2')?.textContent || ''), null, {timeout: 8000});
            const d = await api('onglets', {op: 'document', id: ID.docs[4]});
            assert.equal(d.document.cote, 'PH 7'); assert.equal(d.document.place_id, ID.naves);
            assert.deepEqual(d.document.people.map(x => x.id).sort((a, b) => a - b), [ID.jean, ID.louis].sort((a, b) => a - b));
            await lastToastUndo();
            await p.waitForFunction(async id => (await window.LCNDA_APP.api('onglets', {op: 'document', id})).document.cote === '', ID.docs[4], {timeout: 8000});
            const back = await api('onglets', {op: 'document', id: ID.docs[4]});
            assert.equal(back.document.title, 'Portrait de Jean DURAND'); assert.equal(back.document.people.length, 1);
        });
        await t('📄 🔍 image zoomable et transcription côte à côte', async () => {
            await p.click(`#sidebar-content [data-ong-doc="${ID.docs[0]}"]`);
            await p.waitForSelector('#workspace [data-ong-sbs-open]'); await p.click('#workspace [data-ong-sbs-open]');
            await p.waitForSelector('#workspace [data-ong-sbs]:not([hidden]) [data-ong-zoombox]');
            assert.match(await p.textContent('#workspace [data-ong-sbstext]'), /mil huit cent/);
            await p.click('#workspace [data-ong-zoom="1"]'); await p.click('#workspace [data-ong-zoom="1"]');
            assert.ok(Number(await p.getAttribute('#workspace [data-ong-sbs]', 'data-zoom')) > 1.4);
            await p.hover('#workspace [data-ong-zoombox]'); await p.mouse.wheel(0, 300); await sleep(100);
        });
        await t('📄 📋 citation toute prête (style retenu) et 🗑 Supprimer + ↶ Annuler', async () => {
            const c = await api('onglets', {op: 'citation', id: ID.docs[0]});
            assert.match(c.styles.fr.note, /3 E 12\/4/);
            await p.evaluate(() => { const d = document.querySelector('#workspace details.ui-ph-more'); if (d) d.open = true; });
            await p.click('#workspace [data-ong-cite]'); await p.waitForSelector('dialog[open] [data-ong-citetext]');
            await p.check('dialog[open] input[name="style"][value="ee"]');
            assert.match(await p.inputValue('dialog[open] [data-ong-citetext]'), /3 E 12\/4/);
            await closeDlgs(); await sleep(200);
            assert.equal(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-documents-tab')).citeStyle), 'ee');
            await p.evaluate(() => { const d = document.querySelector('#workspace details.ui-ph-more'); if (d) d.open = true; });
            await p.click('#workspace [data-ong-del]');
            await p.waitForFunction(id => !document.querySelector(`#sidebar-content [data-ong-doc="${id}"]`), ID.docs[0], {timeout: 8000});
            await lastToastUndo();
            await p.waitForFunction(id => !!document.querySelector(`#sidebar-content [data-ong-doc="${id}"]`), ID.docs[0], {timeout: 8000});
        });
        await t('📄 ☑ Cocher : barre commune → 👤 Relier à une personne, ⤓ ZIP, 🏷 (↶ Annuler)', async () => {
            await p.evaluate(() => document.querySelectorAll('.toast').forEach(x => x.close?.())); await sleep(250); await p.click('#sidebar-footer [data-ong-selmode]');
            await p.waitForSelector('#sidebar-content .ong-selbar');
            await p.check(`#sidebar-content [data-ong-sel="${ID.docs[1]}"] [data-sel-check]`);
            await p.check(`#sidebar-content [data-ong-sel="${ID.docs[4]}"] [data-sel-check]`);
            const acts = await p.$$eval('#sidebar-content .ong-selbar [data-sel-act]', bs => bs.map(b => b.textContent.trim()));
            assert.ok(acts.some(a => /Ranger/.test(a)) && acts.some(a => /Étiqueter/.test(a)) && acts.some(a => /Relier/.test(a)) && acts.some(a => /ZIP/.test(a)) && acts.some(a => /Supprimer/.test(a)), acts.join('|'));
            await p.evaluate(id => { window.LCNDA_PICKER.openPicker = async () => ({id, title: 'Anne MAZAUD'}); }, ID.anne);
            await p.click('#sidebar-content .ong-selbar [data-sel-act]:has-text("Relier")');
            await p.waitForFunction(async id => (await window.LCNDA_APP.api('onglets', {op: 'document', id})).document.people.some(x => x.name === 'Anne MAZAUD'), ID.docs[1], {timeout: 8000});
            const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#sidebar-content .ong-selbar [data-sel-act]:has-text("ZIP")')]);
            const zip = fs.readFileSync(await dl.path());
            assert.equal(zip.readUInt32LE(0), 0x04034b50); assert.ok(zip.includes(Buffer.from('documents.csv')));
            await lastToastUndo(); // ↶ la liaison (le dernier message ↶)
            await p.waitForFunction(async id => !(await window.LCNDA_APP.api('onglets', {op: 'document', id})).document.people.some(x => x.name === 'Anne MAZAUD'), ID.docs[1], {timeout: 8000});
            await p.evaluate(() => document.querySelectorAll('.toast').forEach(x => x.close?.())); await sleep(250); await p.click('#sidebar-footer [data-ong-selmode]'); await sleep(300);
        });
        await t('📄 👯 « peut-être un doublon de… » (empreintes d’images)', async () => {
            const n = await p.evaluate(async ids => {
                window.LCNDA_EXT.imagePrints = {load: async () => ({items: ids.map(id => ({id, title: 'x'}))})};
                window.LCNDA_IMGPRINT = {...(window.LCNDA_IMGPRINT || {}), search: async (q, items, o) => items.filter(it => it.id !== o.exclude).map(it => ({item: it, kind: 'identique', score: 100}))};
                const host = document.createElement('div'); document.body.appendChild(host);
                await window.LCNDA_EXT.ongletsDocs.findDuplicates({id: ids[0]}, host);
                return host.hidden ? -1 : host.querySelectorAll('[data-ong-doc]').length;
            }, [ID.docs[1], ID.docs[4]]);
            // findDuplicates ne montre rien si le document n'est plus celui ouvert : on ouvre d'abord
            assert.ok(n >= -1);
            await p.click(`#sidebar-content [data-ong-doc="${ID.docs[1]}"]`);
            await p.waitForSelector('#workspace [data-ong-dup]:not([hidden]) .ong-dup-link', {timeout: 8000});
        });
        await t('📄 ✉️ « Noter une pièce manquante » dans le fil des Lettres (gardée dans la base, ↶ Annuler)', async () => {
            await p.click('#sidebar-content [data-ong-mode="letters"]'); await sleep(500);
            await p.evaluate(() => { document.querySelector('#workspace [data-ong-back]')?.click(); }); await sleep(400);
            await p.waitForSelector('#workspace [data-ong-wsex]'); await p.click('#workspace [data-ong-excard] [data-ong-wsex], #workspace [data-ong-wsex]:not([data-ong-wsex=""])');
            await p.waitForSelector('#workspace [data-ong-missadd]'); await p.click('#workspace [data-ong-missadd]');
            await p.waitForSelector('dialog[open] [name="date_text"]');
            await p.fill('dialog[open] [name="date_text"]', 'mai 1916'); await p.fill('dialog[open] [name="title"]', 'Lettre de Marie (perdue)');
            await p.click('dialog[open] button[type="submit"], dialog[open] .modal-actions .button:not(.secondary)');
            await p.waitForSelector('#workspace .ong-missing', {timeout: 8000});
            assert.match(await p.textContent('#workspace .ong-missing'), /Lettre de Marie \(perdue\)/);
            const m = await api('onglets', {op: 'missing'}); assert.equal(m.missing.length, 1);
            await p.click('#workspace [data-ong-missdel]');
            await p.waitForFunction(() => !document.querySelector('#workspace .ong-missing'), null, {timeout: 8000});
            await lastToastUndo();
            await p.waitForSelector('#workspace .ong-missing', {timeout: 8000});
            await p.click('#sidebar-content [data-ong-mode="az"]'); await sleep(300);
        });

        /* ═════ 📒 Fiches ═════ */
        await t('📒 la colonne cherche dans le contenu des fiches (extrait trouvé)', async () => {
            await go('fiches'); await p.waitForSelector('#sidebar-content .ui-listbar input[type=search]');
            await p.fill('#sidebar-content .ui-listbar input[type=search]', 'noyer'); await sleep(500);
            const rows = await p.$$eval('#sidebar-content [data-fi-open]:not([data-fi-open="0"])', bs => bs.map(b => b.textContent));
            assert.equal(rows.length, 1); assert.match(rows[0], /sabotier/); assert.match(rows[0], /noyer/);
            await p.fill('#sidebar-content .ui-listbar input[type=search]', ''); await sleep(300);
        });
        await t('📒 ↩ « Cité dans », 🤖 bloc automatique, ⤓ Markdown, 🕘 versions', async () => {
            await p.evaluate(id => { window.LCNDA_APP.state.ficheId = id; window.LCNDA_APP.setModule('fiches'); }, ID.sab);
            await p.waitForSelector('#workspace [data-fi-cited]');
            assert.match(await p.textContent('#workspace [data-fi-cited]'), /Jean DURAND/);
            // 🤖 les personnes de la base qui… (métier sabotier) : Pierre et Jean
            const d = await post('save_topic_sheet', {id: ID.sab, title: 'Le métier de sabotier', blocks: [{type: 'text', title: 'Le métier', text: 'Le sabotier creuse le bois de noyer.'}, {type: 'auto', title: 'Les sabotiers', occupation: 'sabotier'}]});
            assert.ok(!d.error, d.error);
            const det = await api('topic_sheet', {id: ID.sab});
            assert.deepEqual(det.blocks[1].ids.sort((a, b) => a - b), [ID.pierre, ID.jean].sort((a, b) => a - b));
            assert.ok(det.versions >= 1, 'une version gardée');
            await p.evaluate(id => { window.LCNDA_APP.state.ficheId = id; window.LCNDA_APP.setModule('fiches'); }, ID.sab); await p.waitForSelector('#workspace .h-fi-autocrit');
            const md = await p.evaluate(() => window.LCNDA_EXT.fiches.exportMarkdown());
            assert.match(md, /^# .*Le métier de sabotier/); assert.match(md, /Jean DURAND/);
            // ↺ revenir à la version d'avant (le bloc Personnes) puis ↶
            const vs = (await post('save_topic_sheet', {id: ID.sab, versions_of: ID.sab})).versions;
            const r = await post('save_topic_sheet', {id: ID.sab, restore_version: vs[vs.length - 1].id});
            assert.ok(r.snapshot > 0);
            assert.equal((await api('topic_sheet', {id: ID.sab})).blocks[1].type, 'people');
            await post('save_topic_sheet', {id: ID.sab, restore_version: r.snapshot});
            assert.equal((await api('topic_sheet', {id: ID.sab})).blocks[1].type, 'auto');
        });
        await t('📒 supprimer une fiche : tout de suite + ↶ Annuler (même numéro) ; « Chercher dans cette page » ; consultation : pas de ✏️', async () => {
            await p.evaluate(id => { window.LCNDA_APP.state.ficheId = id; window.LCNDA_APP.setModule('fiches'); }, ID.long);
            await p.waitForSelector('#workspace .h-fi-find input');
            await p.fill('#workspace .h-fi-find input', 'monument'); await sleep(400);
            assert.equal(await p.locator('#workspace [data-fi-block]:not(.h-fi-find-off)').count(), 1);
            await p.evaluate(() => { const d = document.querySelector('#workspace details.ui-ph-more'); if (d) d.open = true; });
            await p.click('#workspace [data-fi-delete]');
            await sleep(600);
            assert.ok((await api('topic_sheet', {id: ID.long})).error, 'supprimée');
            await lastToastUndo();
            await p.waitForFunction(async id => !(await window.LCNDA_APP.api('topic_sheet', {id}).catch(() => ({error: 1}))).error, ID.long, {timeout: 8000});
            await p.evaluate(() => document.body.classList.add('is-kiosk'));
            await p.evaluate(id => { window.LCNDA_APP.state.ficheId = id; window.LCNDA_APP.setModule('fiches'); }, ID.long);
            await p.waitForSelector('#workspace .h-fi');
            assert.equal(await p.locator('#workspace [data-fi-mode], #workspace [data-fi-add], #workspace [data-fi-delete], #workspace .h-fi-quickedit').count(), 0);
            await p.evaluate(() => document.body.classList.remove('is-kiosk'));
        });
        await t('📒 la fiche de Pierre MAZAUD dit « Dans les Fiches : Le métier de sabotier »', async () => {
            await post('save_topic_sheet', {id: ID.sab, title: 'Le métier de sabotier', blocks: [{type: 'text', title: 'Le métier', text: 'Le sabotier creuse le bois de noyer.'}, {type: 'people', title: 'Mes sabotiers', ids: [ID.pierre]}]});
            await p.evaluate(id => window.LCNDA_APP.openPersonById(id), ID.pierre);
            await sleep(1500); if (process.env.DBG) console.log('DBG person', await p.evaluate(() => [window.LCNDA_APP.state.module, window.LCNDA_APP.state.currentPersonId, document.querySelectorAll('#workspace section[data-pblock]').length, !!document.querySelector('#workspace [data-pblock="mentions"]'), (window.LCNDA_EXT.afterPerson || []).length]));
            await p.waitForSelector('#workspace [data-fi-pcited]', {timeout: 10000});
            assert.match(await p.textContent('#workspace [data-fi-pcited]'), /Le métier de sabotier/);
        });

        /* ═════ 🎨 Catalogue ═════ */
        await t('🎨 mur d’images, 📊 chiffres, 🕰 frise, ⤓ exporter le classement, 🖨 planche', async () => {
            await p.evaluate(id => localStorage.setItem('genealogie-catalogue-tab', JSON.stringify({pid: id})), ID.marie);
            await go('catalogue'); await p.waitForSelector('#workspace [data-ong-homeview]', {timeout: 15000});
            await p.click('#workspace [data-ong-homeview="wall"]'); await p.waitForSelector('#workspace [data-ong-wall] .ong-tile');
            assert.equal(await p.locator('#workspace .ong-tile').count(), 3);
            await p.check('#workspace [data-ong-wallpick]');
            await p.click('#workspace [data-ong-homeview="stats"]'); await p.waitForSelector('#workspace [data-ong-stats]');
            const st = await p.textContent('#workspace [data-ong-stats]');
            assert.match(st, /Huile sur toile/); assert.match(st, /France/); assert.match(st, /8 500 F/);
            await p.click('#workspace [data-ong-homeview="time"]'); await p.waitForSelector('#workspace [data-ong-frise] .ong-flist li');
            assert.ok((await p.locator('#workspace .ong-flist li').count()) >= 5, 'œuvres, exposition, vente');
            const cl = await p.evaluate(() => window.LCNDA_EXT.onglets.catalogue.classement());
            assert.ok(cl.rows.length >= 3 && cl.head.length === 7);
            await p.click('#workspace [data-ong-exportlist]'); await sleep(300);
            if (process.env.DBG) console.log('DBG menus', await p.evaluate(() => [...document.querySelectorAll('[role="menu"]')].map(m => [m.className, m.isConnected, getComputedStyle(m).display, m.getBoundingClientRect().width, m.textContent.slice(0, 80)])));
            await p.waitForSelector('dialog.ui-export[open]'); // ⤓ la fenêtre d'export commune (CSV choisi d'office ; PDF en plus)
            assert.ok(await p.$('dialog.ui-export .ui-export-fmt[data-fmt="pdf"]'), 'PDF (par 🖨 Imprimer) reste proposé');
            const [dl] = await Promise.all([p.waitForEvent('download'), p.click('dialog.ui-export [data-ui-go]')]);
            assert.match(fs.readFileSync(await dl.path(), 'utf8'), /Le Pont de Tulle/);
            await p.click('#workspace [data-ong-planche]'); await p.waitForSelector('dialog.k-print[open]', {timeout: 8000});
            await p.keyboard.press('Escape'); await sleep(300);
            await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close()));
        });

        /* ═════ 🐾 Suivi ═════ */
        await t('🐾 retours (recapture), 🔔 pas revu depuis (seuil par espèce), domaine vital, saisie d’une séance, fiche de terrain', async () => {
            const w = async (op, b) => post('suivi_write', {op, ...b});
            const gaston = (await w('create_animal', {name: 'Gaston', species: 'oiseau', taxon: 'Corneille noire', profile: 'oiseau'})).id;
            const prune = (await w('create_animal', {name: 'Prune', species: 'oiseau', taxon: 'Corneille noire'})).id;
            const site = (await w('save_site', {name: 'Dortoir de Naves', place_id: ID.naves})).id;
            const y = new Date().getFullYear();
            for (const [pet, d, lat, lon] of [[gaston, `12 mai ${y - 2}`, 45.30, 1.76], [gaston, `3 juin ${y - 1}`, 45.32, 1.78], [gaston, `4 juin ${y - 1}`, 45.31, 1.80], [prune, `12 mai ${y - 2}`, 45.29, 1.77]]) {
                const r = await w('save_obs', {id: 0, pet_id: pet, date: d, time: '', place_id: 0, site_id: site, lat, lon, behaviors: [], count: '', with: [], observer: '', media_ids: [], note: '', source: 'manuel', reading: '', reading_detail: {}, reliability: '', sea: {}});
                assert.ok(r.id, JSON.stringify(r));
            }
            const D = await p.evaluate(async () => window.LCNDA_EXT.suivi.overview(true));
            const ret = await p.evaluate(D => window.LCNDA_EXT.suivi.returnsOf(D, {config: {}}), D);
            const c = ret.find(r => r.y === y - 2); assert.equal(c.n, 2); assert.equal(c.back, 1, 'Gaston revu, Prune non');
            await p.evaluate(() => localStorage.setItem('genealogie-suivi-seuils', JSON.stringify({oiseau: 100})));
            const html = await p.evaluate(D => window.LCNDA_EXT.dashboard.sv_unseen.render(1, {id: 'x', config: {}}, 'span-6', D), D);
            assert.match(html, /is-red/); assert.match(html, /Prune/);
            const exp = await p.evaluate(([D, s]) => window.LCNDA_EXT.suivi.expectedOn(D, s).map(x => x.a.title), [D, site]);
            assert.deepEqual(exp.sort(), ['Gaston', 'Prune']);
            // domaine vital dans la carte en grand
            await go('suivi'); await sleep(800);
            await p.evaluate(() => window.LCNDA_EXT.suivi.openBigMap());
            await p.waitForSelector('dialog.sv-bigmap [data-range]');
            await p.evaluate(() => { const c = document.querySelector('dialog.sv-bigmap [data-range]'); c.checked = true; c.dispatchEvent(new Event('change', {bubbles: true})); });
            await p.waitForSelector('dialog.sv-bigmap [data-sv-ranges]');
            const ranges = JSON.parse(await p.getAttribute('dialog.sv-bigmap', 'data-ranges'));
            assert.ok(ranges.some(r => r.name === 'Gaston' && r.ha > 0), JSON.stringify(ranges));
            await p.evaluate(() => document.querySelector('dialog.sv-bigmap').close());
            // ⚡ saisie d'une séance : deux lignes d'un coup, ↶ Annuler retire toute la séance
            const before = (await p.evaluate(async () => (await window.LCNDA_EXT.suivi.overview(true)).observations.length));
            await p.evaluate(() => window.LCNDA_EXT.suivi.openSession()); await p.waitForSelector('dialog[open] [data-sv-sess-rows]');
            await p.evaluate(([g, pr, s]) => { const P = window.LCNDA_PICKER, d = document.querySelector('dialog[open]'); P.pickerSet(d.querySelector('[data-sv-sess-row="0"] .pk'), {id: g, title: 'Gaston'}); P.pickerSet(d.querySelector('[data-sv-sess-row="1"] .pk'), {id: pr, title: 'Prune'}); P.pickerSet(d.querySelector('.pk[data-picker="tsite"]'), {id: s, title: 'Dortoir de Naves'}); }, [gaston, prune, site]);
            await p.click('dialog[open] .modal-actions button[type="submit"], dialog[open] .modal-actions .button:not(.secondary)');
            await p.waitForFunction(async n => (await window.LCNDA_EXT.suivi.overview(true)).observations.length === n + 2, before, {timeout: 8000});
            await lastToastUndo();
            await p.waitForFunction(async n => (await window.LCNDA_EXT.suivi.overview(true)).observations.length === n, before, {timeout: 8000});
            // 🖨 fiche de terrain
            await p.evaluate(() => window.LCNDA_EXT.suivi.fieldSheet()); await p.waitForSelector('dialog[open] select[name="site"]');
            await p.selectOption('dialog[open] select[name="site"]', String(site));
            await p.click('dialog[open] .modal-actions button[type="submit"], dialog[open] .modal-actions .button:not(.secondary)');
            await p.waitForSelector('dialog.k-print[open]', {timeout: 8000});
            await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close()));
        });

        /* ═════ ⚖️ Successions ═════ */
        await t('⚖️ chargé du dossier (+ ↶), 🛡 conflit d’intérêts, 📜 tableau de dévolution, 🔎 lecture d’une pièce, R8', async () => {
            const c1 = await post('successoral_write', {op: 'save', deceased_id: ID.pierre, opened_at: '2026-04-02'}); assert.ok(c1.id, JSON.stringify(c1));
            const c2 = await post('successoral_write', {op: 'save', deceased_id: ID.louis, opened_at: '2026-04-03'}); assert.ok(c2.id, JSON.stringify(c2));
            // Paul est rattaché aux deux dossiers : conflit possible
            for (const cid of [c1.id, c2.id]) { const r = await post('successoral_write', {op: 'attach', case_id: cid, id: cid, person_id: ID.paul}); assert.ok(!r.error, r.error); }
            const conf = await api('successoral', {op: 'au_conflicts', id: c1.id});
            assert.ok((conf.items || []).some(x => x.person_id === ID.paul && x.case_id === c2.id), JSON.stringify(conf));
            // chargé du dossier
            const a = await post('successoral_write', {op: 'au_assign', case_id: c1.id, task: '', who: 'Claire LACOMBE'}); assert.equal(a.before, '');
            assert.deepEqual((await api('successoral', {op: 'au_assign'})).names, ['Claire LACOMBE']);
            await p.evaluate(() => localStorage.setItem('genealogie-succ-me', JSON.stringify('Claire LACOMBE')));
            await go('successoral'); await p.waitForSelector('#workspace .succ-who', {timeout: 15000});
            assert.match(await p.textContent('#workspace .succ-who'), /Claire LACOMBE/);
            // le dossier : 👥 chargé, puis ↶
            await p.evaluate(id => window.LCNDA_EXT.successoral.openCase(id, 'dossier'), c1.id);
            await p.waitForSelector('#workspace [data-succ-au-box]', {timeout: 15000});
            assert.match(await p.textContent('#workspace [data-succ-au-box]'), /Claire LACOMBE/);
            await p.click('#workspace [data-succ-au-assign]'); await p.waitForSelector('dialog[open] [name="who"]');
            await p.fill('dialog[open] [name="who"]', 'Jean DURAND'); await p.click('dialog[open] .modal-actions button[type="submit"], dialog[open] .modal-actions .button:not(.secondary)');
            await p.waitForFunction(() => /Jean DURAND/.test(document.querySelector('#workspace [data-succ-au-box]')?.textContent || ''), null, {timeout: 8000});
            await lastToastUndo();
            await p.waitForFunction(async id => (await window.LCNDA_APP.api('successoral', {op: 'au_assign'})).items.find(x => x.case_id === id)?.who === 'Claire LACOMBE', c1.id, {timeout: 8000});
            // 📜 tableau de dévolution : héritiers, parts, renvois P1…
            const D = await api('successoral', {op: 'get', id: c1.id});
            const html = await p.evaluate(D => { const R = window.LCNDA_EXT.successoral.compute(D); const S = window.LCNDA_SUCC_CORE; const states = {}; const P_ = S.pieces(R, D.graph, {acts: D.acts || {}, states, asked: D.asked || {}}); return window.LCNDA_EXT.succDevolutionHtml(D, R, P_); }, D);
            assert.match(html, /Tableau généalogique de dévolution/); assert.match(html, /Paul MAZAUD/); assert.match(html, /1\/2/); assert.match(html, /P1/);
            // 🔎 lecture automatique : noms, dates, lieux proposés
            const pr = await p.evaluate(() => window.LCNDA_EXT.succAuditPropose('Le 12 mars 1903, est né à Tulle Paul MAZAUD, fils de Pierre MAZAUD.'));
            assert.ok(pr.dates.includes('12 mars 1903') && pr.places.includes('Tulle') && pr.names.includes('Paul MAZAUD'), JSON.stringify(pr));
            // R8 : l'ancienne clé est reprise une fois en genealogie-succ-*
            await p.evaluate(() => { localStorage.removeItem('genealogie-succ-npages'); localStorage.setItem('lcnda-succ-npages', JSON.stringify({tree: false})); });
            await boot();
            assert.equal(await p.evaluate(() => localStorage.getItem('lcnda-succ-npages')), null);
            assert.deepEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-succ-npages'))), {tree: false});
        });

        /* ═════ 🗂 Onglets à soi ═════ */
        await t('🗂 onglet « 🌐 Page web » (cadre + notes gardées) et « 📒 Fiche » comme page d’onglet', async () => {
            await p.evaluate(([sab]) => {
                const tabs = window.LCNDA_APP.customTabs();
                tabs.push(window.LCNDA_EXT.cleanCustomTab({id: 'ct_webtest', name: 'Archives', icon: '🌐', kind: 'page', widgets: [{type: 'tab_web', width: '12', config: {url: 'https://example.org/', height: 560}}]}));
                tabs.push(window.LCNDA_EXT.cleanCustomTab({id: 'ct_fichetest', name: 'Sabotiers', icon: '📒', kind: 'page', widgets: [{type: 'tab_fiche', width: '12', config: {sheet: sab}}]}));
                window.LCNDA_APP.saveCustomTabs(tabs);
            }, [ID.sab]);
            const kinds = await p.evaluate(() => window.LCNDA_APP.customTabs().filter(t => /test$/.test(t.id)).map(t => t.widgets[0]?.type));
            assert.deepEqual(kinds, ['tab_web', 'tab_fiche']);
            await p.evaluate(() => { window.LCNDA_APP.state.dashboardBoard = 'ct_webtest'; window.LCNDA_APP.setModule('dashboard'); });
            await p.waitForSelector('#workspace [data-ct-web] iframe', {timeout: 15000});
            assert.equal(await p.getAttribute('#workspace [data-ct-web] iframe', 'src'), 'https://example.org/');
            await p.fill('#workspace [data-ct-webnote]', 'Registre BMS 1850, vue 12');
            await sleep(700);
            assert.match(await p.evaluate(() => localStorage.getItem('genealogie-tab-web-notes')), /vue 12/);
            await p.evaluate(() => { window.LCNDA_APP.state.dashboardBoard = 'ct_fichetest'; window.LCNDA_APP.setModule('dashboard'); });
            await p.waitForSelector('#workspace [data-fi-embed]', {timeout: 15000});
            assert.match(await p.textContent('#workspace [data-fi-embed]'), /sabotier/);
        });

        /* ═════ R12 : 390 px sans défilement de côté ═════ */
        await t('R12 : à 390 px, Documents, Fiches, Catalogue, Suivi, Successions ne débordent pas', async () => {
            await p.setViewportSize({width: 390, height: 800});
            for (const [mod, prep] of [['documents', null], ['fiches', ID.sab], ['catalogue', null], ['suivi', null], ['successoral', null]]) {
                if (prep) await p.evaluate(id => { window.LCNDA_APP.state.ficheId = id; }, prep);
                await go(mod); await sleep(800);
                const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
                assert.ok(over <= 2, `${mod} : ${over} px de trop`);
            }
            await p.setViewportSize({width: 1440, height: 900});
        });
        await t('aucune erreur JS', async () => { assert.deepEqual(errs.filter(e => !/ResizeObserver|Failed to fetch|NetworkError|example\.org/.test(e)), []); });
    } finally {
        await browser.close(); proc.kill();
        try { fs.rmSync(dir, {recursive: true, force: true}); } catch (_) {}
    }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est vert.');
    process.exit(fails ? 1 : 0);
})();
