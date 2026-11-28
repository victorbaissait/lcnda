#!/usr/bin/env node
/* 📑 Atelier de transcription, vague 3, sous-étape 3a : un document en plusieurs pages (docs/design/atelier-transcription-idees.html, F2 ;
 * décision 5 de docs/design/atelier-transcription-decisions.md) :
 *  1. relier des pages (page du document et visionneuse) : 4 pages, leur nom (Recto, Verso, Page N, Annexe, nom libre), l'ordre en glissant,
 *     « Retirer de l'ensemble », ↶ Annuler ; une page n'appartient qu'à un ensemble ; la migration 104 est rejouable ;
 *  2. l'Atelier ouvre toutes les pages : onglets au-dessus de l'image, zones par page, un seul texte coupé par « — page 2 — » (conseillé)
 *     ou un texte par page ; ✨ Lire sur la page affichée ;
 *  3. « Ce que l'app a trouvé » sur toutes les pages : une carte par personne, « (page 3, ligne 7) », clic = la bonne page ;
 *     « ＋ Ajouter à une fiche… » met la page dans la source ;
 *  et un acte d'une seule page reste exactement comme avant.
 *   node tests/test-atelier-pages.js   (captures : SHOTS=/chemin node tests/test-atelier-pages.js)
 * Personnes et lieux fictifs. */
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const {spawn, spawnSync} = require('child_process');
const http = require('http');
let chromium; try { ({chromium} = require('playwright')); } catch (_) { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); }
const root = path.join(__dirname, '..');
const {findPhp, phpRuntimeArgs, devBundledPhp} = require('../electron/php-server.js');
const SHOTS = process.env.SHOTS || '';

let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 30).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const SOLO = 'L’an mil huit cent douze, le trois mai,\nest né Paul VERNIAL, fils de Louis VERNIAL\net de Rose TAVERGNE.';

(async () => {
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-atelier-pages-'));
    fs.mkdirSync(path.join(tmp, 'media'));
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4'};
    const php = (code, extra = {}) => spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], {cwd: root, encoding: 'utf8', env: {...env, ...extra}});
    const seed = php(String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start) VALUES(1,'Paul','VERNIAL','male','deceased',1)");
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status) VALUES(2,'Louis','VERNIAL','male','deceased')");
// des pages fictives : un fond, des lignes d'écriture ; la couleur change d'une page à l'autre
$cols = [[230,215,180],[220,226,200],[214,214,232],[236,206,206],[210,230,230],[226,226,226],[232,222,200],[208,222,236]];
foreach ([1,2,3,4,5,6,7,8] as $i) { $im = imagecreatetruecolor(600, 500); [$r,$g,$b] = $cols[$i-1]; imagefill($im, 0, 0, imagecolorallocate($im, $r, $g, $b)); $ink = imagecolorallocate($im, 60, 45, 30);
  for ($l = 0; $l < 6; $l++) for ($x = 50; $x < 550; $x += 9) imagefilledrectangle($im, $x, 50 + $l * 64, $x + 5, 70 + $l * 64, $ink);
  imagepng($im, MEDIA_DIR . "/page$i.png"); }
$m = $pdo->prepare("INSERT INTO media(id,title,filename,thumbnail,media_type) VALUES(?,?,?,?,'image')");
$m->execute([1, 'Contrat Vernial-Tavergne, feuillet 1', 'page1.png', 'page1.png']);
$m->execute([2, 'Contrat Vernial-Tavergne, feuillet 2', 'page2.png', 'page2.png']);
$m->execute([3, 'Contrat Vernial-Tavergne, feuillet 3', 'page3.png', 'page3.png']);
$m->execute([4, 'Contrat Vernial-Tavergne, plan joint', 'page4.png', 'page4.png']);
$m->execute([5, 'Naissance de Paul VERNIAL', 'page5.png', 'page5.png']);
$m->execute([6, 'Carte de Lucien BARDOUX', 'page6.png', 'page6.png']);
$m->execute([7, 'Lettre de Lucien BARDOUX, recto', 'page7.png', 'page7.png']);
$m->execute([8, 'Lettre de Lucien BARDOUX, verso', 'page8.png', 'page8.png']);
act_transcriptions_ensure($pdo);
// un acte d'une seule page, fait avant : il doit rester exactement comme il est
$a = $pdo->prepare("INSERT INTO act_transcriptions(id,title,kind,media_id,body,data_json,updated_at) VALUES(?,?,?,?,?,?,?)");
$a->execute([1, 'Naissance de Paul VERNIAL', 'naissance', 5, getenv('TX_SOLO'), getenv('TX_SOLO_DATA'), '2026-01-01 10:00:00']);
$pdo->prepare("UPDATE media SET transcription=? WHERE id=5")->execute([getenv('TX_SOLO')]);
echo json_encode(['ok' => 1]);`, {TX_SOLO: SOLO, TX_SOLO_DATA: JSON.stringify({zones: [{id: 'za', x: 40, y: 40, w: 500, h: 40, s: 0, e: 38}], people: [{name: 'Paul VERNIAL', role: 'enfant', person_id: 1, s: 47, e: 59}], status: 'doing'})});
    if (seed.status !== 0 || !/"ok"/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const soloBefore = php(String.raw`require 'lib/bootstrap.php'; $pdo = db(); echo json_encode($pdo->query('SELECT title,kind,media_id,body,data_json FROM act_transcriptions WHERE id=1')->fetch(PDO::FETCH_ASSOC));`).stdout;

    const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    // un faux Ollama sur cet ordinateur (la lecture approfondie de toutes les pages) : la k-ième demande rend « Lecture approfondie numéro k »
    const ollama = {pulled: new Set(), chats: 0, delay: 20};
    const fake = http.createServer((req, res) => { let body = ''; req.on('data', c => { body += c; }); req.on('end', async () => {
        if (req.url === '/api/version') return void res.end(JSON.stringify({version: '0.12.0'}));
        if (req.url === '/api/tags') return void res.end(JSON.stringify({models: [...ollama.pulled].map(name => ({name, size: 1}))}));
        if (req.url === '/api/pull') { const j = JSON.parse(body || '{}'); ollama.pulled.add(j.model); res.setHeader('Content-Type', 'application/x-ndjson'); return void res.end(JSON.stringify({status: 'success'}) + '\n'); }
        if (req.url === '/api/chat') { const k = ++ollama.chats; res.setHeader('Content-Type', 'application/x-ndjson');
            for (const l of [`Lecture approfondie numéro ${k},`, `deuxième ligne de la lecture ${k}.`]) { res.write(JSON.stringify({message: {role: 'assistant', content: l + '\n'}, done: false}) + '\n'); await sleep(ollama.delay); }
            return void res.end(JSON.stringify({message: {role: 'assistant', content: ''}, done: true}) + '\n'); }
        res.statusCode = 404; res.end('{}'); }); });
    const oport = await freePort(); await new Promise(r => fake.listen(oport, '127.0.0.1', r));
    const port = await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env: {...env, LCNDA_OLLAMA_URL: `http://127.0.0.1:${oport}`}, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const errs = [];
    try {
        const ctx = await browser.newContext({viewport: {width: 1440, height: 900}, deviceScaleFactor: 1});
        const p = await ctx.newPage();
        p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (/DBG/.test(m.text())) console.log(m.text()); });
        const shot = async name => { if (SHOTS) { fs.mkdirSync(SHOTS, {recursive: true}); await p.screenshot({path: path.join(SHOTS, name)}); } };
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_EXT?.mediaPages && window.LCNDA_EXT?.onglets?.documents && window.LCNDA_EXT?.openActTranscriber, null, {timeout: 30000});
        const api = (action, params = {}) => p.evaluate(([a, q]) => window.LCNDA_APP.api(a, q), [action, params]);
        const post = (action, body) => p.evaluate(([a, b]) => window.LCNDA_APP.api(a, {}, {method: 'POST', body: b}), [action, body]);
        const pagesOf = async id => (await api('media_pages', {media_id: id})).pages.map(x => [x.media_id, x.label]);
        const undoLast = async re => { const ok = await p.evaluate(src => { const rx = new RegExp(src); const tt = [...document.querySelectorAll('.ui-toast')].filter(x => rx.test(x.textContent)).at(-1); const b = tt && [...tt.querySelectorAll('button')].find(x => /Annuler/.test(x.textContent)); if (b) b.click(); return !!b; }, re); assert.ok(ok, 'pas de ↶ Annuler pour ' + re); await sleep(600); };

        /* ─── 1. relier des pages : la page du document ─── */
        await p.evaluate(() => { localStorage.setItem('genealogie-menu-documents', '1'); localStorage.setItem('genealogie-menu-hidden', '[]'); location.hash = '#documents/1'; });
        await p.waitForSelector('#workspace [data-ong-page="document"][data-ong-id="1"] [data-ong-pages]', {state: 'attached', timeout: 20000});
        await t('un document seul : « ＋ Relier une autre page… », aucune page listée', async () => {
            await p.waitForSelector('#workspace [data-ong-pages] [data-mp-add]', {timeout: 10000});
            const s = await p.evaluate(() => { const b = document.querySelector('#workspace [data-ong-pages]'); return {hidden: b.hidden, rows: b.querySelectorAll('[data-mp-id]').length, add: b.querySelector('[data-mp-add]').textContent}; });
            assert.equal(s.hidden, false); assert.equal(s.rows, 0); assert.match(s.add, /Relier une autre page/);
        });
        await t('relier 3 pages par le menu de choix des médias : 4 pages, dans l’ordre choisi', async () => {
            await p.click('#workspace [data-ong-pages] [data-mp-add]');
            await p.waitForSelector('dialog.mpk-dialog[open] .mpk-tile', {timeout: 10000}); await sleep(400);
            for (const name of ['feuillet 2', 'feuillet 3', 'plan joint']) await p.locator('dialog.mpk-dialog[open] .mpk-tile', {hasText: name}).first().click();
            await p.click('dialog.mpk-dialog[open] [data-mp="ok"]');
            await p.waitForFunction(() => document.querySelectorAll('#workspace [data-ong-pages] [data-mp-id]').length === 4, null, {timeout: 10000});
            assert.deepEqual(await pagesOf(1), [[1, 'page'], [2, 'page'], [3, 'page'], [4, 'page']]);
            const names = await p.$$eval('#workspace [data-ong-pages] .dpg-name', b => b.map(x => x.textContent.replace('▾', '').trim()));
            assert.deepEqual(names, ['Page 1', 'Page 2', 'Page 3', 'Page 4']);
            await shot('pages-doc.png');
        });
        await t('le nom d’une page : Recto, Verso, Annexe et un nom libre (menu de choix unique)', async () => {
            const pick = async (id, label) => { await p.click(`#workspace [data-ong-pages] [data-mp-label="${id}"]`); await p.locator('.ui-actmenu button', {hasText: label}).first().click(); await sleep(500); };
            await pick(1, 'Recto'); await pick(2, 'Verso'); await pick(4, 'Annexe');
            assert.deepEqual(await pagesOf(1), [[1, 'recto'], [2, 'verso'], [3, 'page'], [4, 'annexe']]);
            await p.click('#workspace [data-ong-pages] [data-mp-label="3"]'); await p.locator('.ui-actmenu button', {hasText: 'Autre nom'}).first().click();
            await p.waitForSelector('dialog.ask-text-dialog[open] input'); await p.fill('dialog.ask-text-dialog[open] input', 'Suite du contrat'); await p.click('dialog.ask-text-dialog[open] button[type="submit"], dialog.ask-text-dialog[open] [value="default"]'); await sleep(600);
            assert.deepEqual((await pagesOf(1))[2], [3, 'Suite du contrat']);
            await undoLast('renommée'); assert.deepEqual((await pagesOf(1))[2], [3, 'page'], '↶ Annuler remet « Page 3 »');
        });
        await t('l’ordre en glissant ⠿, puis ↶ Annuler', async () => {
            const grip = id => p.locator(`#workspace [data-ong-pages] [data-mp-id="${id}"] .dpg-grip`);
            await grip(4).dragTo(p.locator('#workspace [data-ong-pages] [data-mp-id="2"]'), {targetPosition: {x: 20, y: 4}}); await sleep(700);
            assert.deepEqual((await pagesOf(1)).map(x => x[0]), [1, 4, 2, 3]);
            await undoLast('Ordre'); assert.deepEqual((await pagesOf(1)).map(x => x[0]), [1, 2, 3, 4]);
            // et au menu ⋯ (clic droit sur la ligne) : Descendre
            await p.click('#workspace [data-ong-pages] [data-mp-id="3"] .dpg-txt', {button: 'right'}); await p.locator('.ui-actmenu button', {hasText: 'Descendre'}).first().click(); await sleep(600);
            assert.deepEqual((await pagesOf(1)).map(x => x[0]), [1, 2, 4, 3]);
            await undoLast('Ordre'); assert.deepEqual((await pagesOf(1)).map(x => x[0]), [1, 2, 3, 4]);
        });
        await t('« Retirer de l’ensemble », puis ↶ Annuler (rien n’est supprimé)', async () => {
            await p.click('#workspace [data-ong-pages] [data-mp-more="3"]'); await p.locator('.ui-actmenu button', {hasText: 'Retirer de l’ensemble'}).first().click(); await sleep(700);
            assert.deepEqual((await pagesOf(1)).map(x => x[0]), [1, 2, 4]); assert.deepEqual(await pagesOf(3), [], 'la page retirée est seule');
            assert.ok((await api('onglets', {op: 'document', id: 3})).document, 'le média est toujours là');
            await undoLast('retirée'); assert.deepEqual(await pagesOf(1), [[1, 'recto'], [2, 'verso'], [3, 'page'], [4, 'annexe']]);
        });
        await t('une page n’appartient qu’à un seul ensemble (refus avec une phrase, rien ne change)', async () => {
            await post('media_pages_save', {media_id: 6, pages: [{media_id: 6, label: 'recto'}, {media_id: 5, label: 'verso'}]});
            const err = await p.evaluate(() => window.LCNDA_APP.api('media_pages_save', {}, {method: 'POST', body: {media_id: 6, pages: [{media_id: 6}, {media_id: 5}, {media_id: 2}]}}).then(() => '', e => e.message));
            assert.match(err, /déjà dans un autre document/);
            assert.deepEqual((await pagesOf(6)).map(x => x[0]), [6, 5]); assert.deepEqual((await pagesOf(1)).map(x => x[0]), [1, 2, 3, 4]);
            await post('media_pages_save', {media_id: 6, pages: []}); assert.deepEqual(await pagesOf(6), []); assert.deepEqual(await pagesOf(5), []);
        });
        await t('les pages s’affichent ensemble : clic sur une page = sa page du document ; la visionneuse les montre toutes', async () => {
            await p.click('#workspace [data-ong-pages] [data-mp-open="2"]');
            await p.waitForSelector('#workspace [data-ong-page="document"][data-ong-id="2"] [data-ong-pages] [data-mp-id="2"].is-current', {timeout: 10000});
            await p.click('#workspace [data-ong-id="2"] .ong-big[data-ong-view]');
            await p.waitForFunction(() => document.getElementById('lightbox')?.open && document.querySelectorAll('#lightbox-pages [data-mp-id]').length === 4, null, {timeout: 10000});
            const s = await p.evaluate(() => ({n: window.LCNDA_APP.state.lightboxMedia.length, cur: window.LCNDA_APP.state.lightboxMedia[window.LCNDA_APP.state.lightboxIndex].id, here: document.querySelector('#lightbox-pages .is-current')?.dataset.mpId}));
            assert.deepEqual(s, {n: 4, cur: 2, here: '2'});
            await p.click('#lightbox-pages [data-mp-open="4"]'); await sleep(500);
            assert.equal(await p.evaluate(() => window.LCNDA_APP.state.lightboxMedia[window.LCNDA_APP.state.lightboxIndex].id), 4);
            await shot('pages-visionneuse.png');
            await p.evaluate(() => document.getElementById('lightbox').close()); await sleep(300);
        });
        await t('visionneuse ouverte sur une seule page : les autres pages s’y ajoutent ; on relie aussi depuis la visionneuse', async () => {
            await p.evaluate(() => window.LCNDA_APP.openLightbox([{id: 3, title: 'Contrat Vernial-Tavergne, feuillet 3', filename: 'page3.png', media_type: 'image'}], 0, false));
            await p.waitForFunction(() => document.querySelectorAll('#lightbox-pages [data-mp-id]').length === 4, null, {timeout: 10000});
            await p.click('#lightbox-pages [data-mp-open="1"]'); await sleep(500);
            const s = await p.evaluate(() => ({ids: window.LCNDA_APP.state.lightboxMedia.map(m => m.id), cur: window.LCNDA_APP.state.lightboxMedia[window.LCNDA_APP.state.lightboxIndex].id}));
            assert.equal(s.cur, 1); assert.deepEqual([...s.ids].sort(), [1, 2, 3, 4]);
            await p.evaluate(() => document.getElementById('lightbox').close()); await sleep(300);
            await p.evaluate(() => window.LCNDA_APP.openLightbox([{id: 6, title: 'Carte de Lucien BARDOUX', filename: 'page6.png', media_type: 'image'}], 0, false));
            // attendre que le bloc soit celui de la nouvelle image (sans page) : le bouton « ＋ » de l'image d'avant (4 pages) existe encore un instant
            await p.waitForFunction(() => document.querySelector('#lightbox-pages [data-mp-add]') && !document.querySelector('#lightbox-pages [data-mp-id]'), null, {timeout: 10000});
            await p.click('#lightbox-pages [data-mp-add]'); await p.waitForSelector('dialog.mpk-dialog[open] .mpk-tile'); await sleep(300);
            await p.locator('dialog.mpk-dialog[open] .mpk-tile', {hasText: 'Naissance de Paul'}).first().click(); await p.click('dialog.mpk-dialog[open] [data-mp="ok"]');
            try { await p.waitForFunction(() => document.querySelectorAll('#lightbox-pages [data-mp-id]').length === 2, null, {timeout: 10000, polling: 200}); }
            catch (e) { const why = await p.evaluate(() => ({ids: [...document.querySelectorAll('#lightbox-pages [data-mp-id]')].map(x => x.dataset.mpId), cur: window.LCNDA_APP.state.lightboxMedia?.[window.LCNDA_APP.state.lightboxIndex]?.id, toasts: [...document.querySelectorAll('.toast, .ui-toast, [role=status]')].map(x => x.textContent).join(' | '), picker: !!document.querySelector('dialog.mpk-dialog[open]')}));
                throw new Error('le bloc des pages ne montre pas les 2 pages : ' + JSON.stringify(why) + ' · en base : ' + JSON.stringify(await pagesOf(6)) + ' / ' + JSON.stringify(await pagesOf(5))); }
            assert.deepEqual((await pagesOf(6)).map(x => x[0]), [6, 5]);
            await undoLast('Page reliée'); assert.deepEqual(await pagesOf(6), []);
            await p.evaluate(() => document.getElementById('lightbox').close()); await sleep(300);
        });
        await t('mode consultation : les pages se voient, rien ne se change', async () => {
            await p.evaluate(() => document.body.classList.add('is-kiosk'));
            const box = await p.evaluate(() => { const h = document.createElement('div'); document.body.appendChild(h); window.LCNDA_EXT.mediaPages.mount(h, 1, {ro: true}); h.id = 'mp-ro'; return 1; }); void box; await sleep(600);
            const s = await p.evaluate(() => { const h = document.getElementById('mp-ro'); return {rows: h.querySelectorAll('[data-mp-id]').length, add: !!h.querySelector('[data-mp-add]'), grip: !!h.querySelector('.dpg-grip'), more: !!h.querySelector('[data-mp-more]')}; });
            assert.deepEqual(s, {rows: 4, add: false, grip: false, more: false});
            await p.evaluate(() => { document.getElementById('mp-ro').remove(); document.body.classList.remove('is-kiosk'); });
        });

        /* ─── 2. l'Atelier ouvre toutes les pages ─── */
        const D = 'dialog.h-tx-dlg';
        const closeAtelier = async () => { await p.evaluate(() => { const d = document.querySelector('dialog.h-tx-dlg'); if (d) d.querySelector('[data-tx-cmd="close"]')?.click(); }); await sleep(250);
            await p.evaluate(() => { const c = [...document.querySelectorAll('dialog[open]')].find(d => /Fermer sans enregistrer/.test(d.textContent) && !d.classList.contains('h-tx-dlg')); c?.querySelector('button.danger, [value="default"], button[type="submit"]')?.click(); }); await sleep(250);
            await p.evaluate(() => document.querySelectorAll('dialog.h-tx-dlg').forEach(d => { try { d.close(); } catch (_) {} d.remove(); })); };
        const openTx = async ctxArg => { await closeAtelier(); await p.evaluate(c => window.LCNDA_EXT.openActTranscriber(c), ctxArg);
            await p.waitForFunction(() => document.querySelector('dialog.h-tx-dlg [data-tx-img]')?.getAttribute('href'), null, {timeout: 15000}); await sleep(500); };
        const tx = () => p.evaluate(() => { const d = document.querySelector('dialog.h-tx-dlg'); return {body: d.querySelector('[data-tx-body]').value, href: d.querySelector('[data-tx-img]').getAttribute('href'),
            tabs: [...d.querySelectorAll('[data-tx-page]')].map(b => b.textContent.trim()), on: d.querySelector('[data-tx-page].is-on')?.dataset.txPage, info: d.querySelector('.h-tx-pagesinfo')?.textContent || '',
            rects: d.querySelectorAll('[data-tx-zones] rect').length, bar: !d.querySelector('[data-tx-pages]').hidden, form: d.dataset.txPages || ''}; });
        const setBody = v => p.evaluate(x => { const a = document.querySelector('dialog.h-tx-dlg [data-tx-body]'); a.value = x; a.dispatchEvent(new Event('input')); }, v);
        const caretAt = pos => p.evaluate(x => { const a = document.querySelector('dialog.h-tx-dlg [data-tx-body]'); a.focus(); a.setSelectionRange(x, x); a.dispatchEvent(new MouseEvent('click', {bubbles: true})); }, pos);
        const saveTx = async () => { await p.click(`${D} [data-tx-cmd="save"]`); await p.waitForFunction(() => /Enregistré/.test(document.querySelector('dialog.h-tx-dlg [data-tx-status]')?.textContent || document.querySelector('dialog.h-tx-dlg [data-tx-status]')?.title || ''), null, {timeout: 10000}); await sleep(300); };
        const actRow = id => JSON.parse(php(`require 'lib/bootstrap.php'; $pdo = db(); $r = $pdo->query('SELECT id,media_id,body,data_json FROM act_transcriptions WHERE id=${Number(id)}')->fetch(PDO::FETCH_ASSOC); echo json_encode($r);`).stdout || 'null');
        const mediaText = id => php(`require 'lib/bootstrap.php'; echo db()->query('SELECT COALESCE(transcription,\\'\\') FROM media WHERE id=${Number(id)}')->fetchColumn();`).stdout;
        // une « lecture d'imprimé » pour l'essai : une ligne lue par page, posée en haut de l'image
        await p.evaluate(() => { window.LCNDA_APP.loadOcrEngine = async () => ({recognize: async () => { const f = document.querySelector('dialog.h-tx-dlg [data-tx-img]').getAttribute('href'); const n = (f.match(/page(\d)/) || [0, '?'])[1];
            return {data: {lines: [{text: `ligne lue sur la feuille ${n}`, bbox: {x0: 50, y0: 50, x1: 550, y1: 70}}]}}; }}); });
        let act3a = 0;
        await t('un seul texte (conseillé) : onglets des 4 pages au-dessus de l’image, le texte coupé par « — page 2 — »', async () => {
            await p.evaluate(() => localStorage.removeItem('genealogie-transcribe-pages-mode'));
            await openTx({mediaId: 1, filename: 'page1.png', title: 'Contrat Vernial-Tavergne'});
            const s = await tx();
            assert.equal(s.bar, true); assert.deepEqual(s.tabs, ['1 Recto', '2 Verso', '3 Page 3', '4 Annexe']); assert.equal(s.on, '0'); assert.equal(s.form, 'one');
            assert.match(s.info, /Un seul texte/); assert.equal(s.body, '\n— page 2 —\n\n— page 3 —\n\n— page 4 —\n');
            await shot('atelier-pages.png');
        });
        await t('écrire la page 1 et la page 3 ; cliquer une ligne de la page 3 montre la page 3', async () => {
            await setBody('Par-devant Maître Jacques ROUDIL, notaire à Tulle,\nfurent présents Louis VERNIAL, laboureur,\n— page 2 —\n\n— page 3 —\net Rose TAVERGNE, sa future épouse,\nfille de Pierre TAVERGNE.\n— page 4 —\n');
            const b = (await tx()).body; await caretAt(b.indexOf('fille de'));
            await p.waitForFunction(() => document.querySelector('dialog.h-tx-dlg [data-tx-page].is-on')?.dataset.txPage === '2', null, {timeout: 5000});
            assert.match((await tx()).href, /page3\.png/);
        });
        await t('les zones sont par page : dessinée sur la page 3, elle n’est pas sur la page 1 ; cliquer son texte ramène la page 3', async () => {
            await p.click(`${D} [data-tx-tool="zone"]`);
            const box = await p.locator(`${D} [data-tx-stage]`).boundingBox();
            await p.mouse.move(box.x + box.width * .3, box.y + box.height * .3); await p.mouse.down(); await p.mouse.move(box.x + box.width * .6, box.y + box.height * .45, {steps: 6}); await p.mouse.up(); await sleep(300);
            const z = await p.evaluate(() => { const d = document.querySelector('dialog.h-tx-dlg'); return d.txApi.get().data.zones.map(q => ({p: q.p, s: q.s})); });
            assert.equal(z.length, 1); assert.equal(z[0].p, 3);
            assert.equal((await tx()).rects, 1);
            // relier la zone au passage « et Rose TAVERGNE »
            const b = (await tx()).body, at = b.indexOf('et Rose'); await p.evaluate(([s0, e0]) => { const a = document.querySelector('dialog.h-tx-dlg [data-tx-body]'); a.setSelectionRange(s0, e0); }, [at, at + 'et Rose TAVERGNE, sa future épouse,'.length]);
            await p.click(`${D} [data-tx-zlink]`); await sleep(200);
            await p.click(`${D} [data-tx-page="0"]`); await sleep(500);
            const s = await tx(); assert.match(s.href, /page1\.png/); assert.equal(s.rects, 0, 'la zone de la page 3 n’est pas sur la page 1');
            await caretAt(b.indexOf('Rose') + 1); await sleep(700);
            const s2 = await tx(); assert.equal(s2.on, '2'); assert.match(s2.href, /page3\.png/); assert.equal(s2.rects, 1);
        });
        await t('plusieurs pages : « Image de l’acte… » ne remplace pas la page 1 et ne retire aucune zone (phrase qui renvoie à « 📑 Pages du document »)', async () => {
            await p.click(`${D} [data-tx-page="1"]`); await sleep(500);
            const before = await p.evaluate(() => { const g = document.querySelector('dialog.h-tx-dlg').txApi.get(); return {m: g.media_id, z: g.data.zones.length}; });
            await p.evaluate(() => [...document.querySelectorAll('dialog.h-tx-dlg [data-tx-menus] button')].find(b => b.textContent.trim() === 'Fichier').click()); await p.waitForSelector('.ui-actmenu');
            await p.evaluate(() => [...document.querySelectorAll('.ui-actmenu .ui-actmenu-i')].find(b => /Image de l’acte/.test(b.textContent)).click()); await sleep(500);
            const toastTxt = await p.evaluate(() => [...document.querySelectorAll('.toast, [role=status], .ui-toast')].map(e => e.textContent).join(' | '));
            assert.match(toastTxt, /plusieurs pages.*Pages du document/s, 'phrase claire : ' + toastTxt);
            assert.equal(await p.evaluate(() => !!document.querySelector('dialog[open] [data-pick-media], dialog.media-picker[open]')), false, 'pas de fenêtre de choix d’image');
            const after = await p.evaluate(() => { const g = document.querySelector('dialog.h-tx-dlg').txApi.get(); return {m: g.media_id, z: g.data.zones.length}; });
            assert.deepStrictEqual(after, before);
            // la barre du bas compte les zones de la page affichée, puis le total du document
            const where = await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-ed-where]')?.textContent || '');
            assert.match(where, /0 zone sur cette page \(1 en tout\)/, where);
            await p.click(`${D} [data-tx-page="0"]`); await sleep(400);
        });
        await t('✨ Lire sur la page affichée : le texte lu va dans la page 2, sa zone est sur la page 2', async () => {
            await p.click(`${D} [data-tx-page="1"]`); await sleep(500);
            await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-step="read"]')?.click()); await p.click(`${D} [data-tx-cmd="readmenu"]`); await p.click(`${D} [data-tx-readpanel] [data-tx-cmd="ocr"]`); await sleep(900);
            const b = (await tx()).body, seg = b.split(/\n— page \d —\n/);
            assert.equal(seg[1].trim(), 'ligne lue sur la feuille 2'); assert.doesNotMatch(seg[0] + seg[2] + seg[3], /ligne lue/);
            const z = await p.evaluate(() => document.querySelector('dialog.h-tx-dlg').txApi.get().data.zones.filter(q => q.src === 'ocr').map(q => ({p: q.p, t: document.querySelector('dialog.h-tx-dlg [data-tx-body]').value.slice(q.s, q.e)})));
            assert.deepEqual(z, [{p: 2, t: 'ligne lue sur la feuille 2'}]);
            const zr = await p.evaluate(() => document.querySelector('dialog.h-tx-dlg').txApi.get().data.zones.find(q => q.p === 3)); const bb = (await tx()).body;
            assert.equal(bb.slice(zr.s, zr.e), 'et Rose TAVERGNE, sa future épouse,', 'la zone de la page 3 suit son texte');
        });
        await t('✨ Lire sur toutes les pages : une lecture par page, chacune dans son morceau', async () => {
            await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-step="read"]')?.click()); await p.click(`${D} [data-tx-cmd="readmenu"]`); await p.check(`${D} [data-tx-readscope] input[value="all"]`);
            assert.equal(await p.isVisible(`${D} [data-tx-readscope]`), true);
            await p.click(`${D} [data-tx-readpanel] [data-tx-cmd="ocr"]`); await sleep(3500);
            const seg = (await tx()).body.split(/\n— page \d —\n/);
            [1, 2, 3, 4].forEach(n => assert.match(seg[n - 1], new RegExp(`ligne lue sur la feuille ${n}`), `page ${n}`));
            const z = await p.evaluate(() => document.querySelector('dialog.h-tx-dlg').txApi.get().data.zones.filter(q => q.src === 'ocr').map(q => q.p).sort());
            assert.deepEqual(z, [1, 2, 2, 3, 4]);
            await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-step="read"]')?.click()); await p.click(`${D} [data-tx-cmd="readmenu"]`); await p.check(`${D} [data-tx-readscope] input[value="page"]`); await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-step="read"]')?.click()); await p.click(`${D} [data-tx-cmd="readmenu"]`);
        });
        await t('enregistrer : un seul acte, ses pages, chaque zone avec sa page ; chaque page garde son morceau du texte', async () => {
            await saveTx();
            act3a = await p.evaluate(() => document.querySelector('dialog.h-tx-dlg').txApi.get().id); assert.ok(act3a > 1);
            const r = actRow(act3a), d = JSON.parse(r.data_json);
            assert.equal(r.media_id, 1); assert.deepEqual(d.pages, [1, 2, 3, 4]); assert.ok(d.zones.every(z => [1, 2, 3, 4].includes(z.p)));
            assert.match(mediaText(3), /et Rose TAVERGNE/); assert.doesNotMatch(mediaText(3), /— page/); assert.match(mediaText(2), /feuille 2/); assert.match(mediaText(1), /— page 2 —/);
            // une seule transcription pour les 4 pages : ouvrir la page 3 ouvre cet acte, sur la page 3
            await openTx({mediaId: 3, filename: 'page3.png'});
            const s = await tx(); assert.equal(await p.evaluate(() => document.querySelector('dialog.h-tx-dlg').txApi.get().id), act3a); assert.equal(s.on, '2'); assert.match(s.href, /page3\.png/);
        });
        await t('l’ordre change (page 3 avant la page 2) : les onglets suivent, les repères aussi, le texte reste relié à ses pages', async () => {
            await closeAtelier();
            await post('media_pages_save', {media_id: 1, pages: [{media_id: 1, label: 'recto'}, {media_id: 3, label: 'page'}, {media_id: 2, label: 'verso'}, {media_id: 4, label: 'annexe'}]});
            await p.evaluate(() => window.LCNDA_EXT.mediaPages.clear());
            await openTx({id: act3a});
            const s = await tx(); assert.deepEqual(s.tabs, ['1 Recto', '2 Page 2', '3 Verso', '4 Annexe']);
            const mk = s.body.match(/— page \d —/g); assert.deepEqual(mk, ['— page 3 —', '— page 2 —', '— page 4 —'], 'le morceau de la page 3 (Verso) dit « page 3 »');
            await p.click(`${D} [data-tx-page="1"]`); await sleep(500); assert.match((await tx()).href, /page3\.png/);
            await saveTx(); await closeAtelier();
            await post('media_pages_save', {media_id: 1, pages: [{media_id: 1, label: 'recto'}, {media_id: 2, label: 'verso'}, {media_id: 3, label: 'page'}, {media_id: 4, label: 'annexe'}]});
            await p.evaluate(() => window.LCNDA_EXT.mediaPages.clear());
        });
        await t('la visionneuse d’une page de l’acte : le texte se modifie dans l’Atelier (case en lecture)', async () => {
            await p.evaluate(() => window.LCNDA_APP.openLightbox([{id: 3, title: 'Contrat Vernial-Tavergne, feuillet 3', filename: 'page3.png', media_type: 'image'}], 0, false));
            await p.waitForFunction(() => document.getElementById('lightbox-transcription')?.readOnly === true, null, {timeout: 10000});
            await p.evaluate(() => document.getElementById('lightbox').close()); await sleep(300);
        });
        await t('un texte par page (réglage) : un acte par page, changer d’onglet enregistre et ouvre le texte de l’autre page', async () => {
            await post('media_pages_save', {media_id: 7, pages: [{media_id: 7, label: 'recto'}, {media_id: 8, label: 'verso'}]});
            await p.evaluate(() => { localStorage.setItem('genealogie-transcribe-pages-mode', 'per'); window.LCNDA_EXT.mediaPages.clear(); });
            await openTx({mediaId: 7, filename: 'page7.png', title: 'Lettre de Lucien BARDOUX'});
            let s = await tx(); assert.deepEqual(s.tabs, ['1 Recto', '2 Verso']); assert.equal(s.form, 'per'); assert.match(s.info, /Un texte par page/); assert.equal(s.body, '');
            await setBody('Mon cher cousin,\nje t’écris de Tulle.');
            await p.click(`${D} [data-tx-page="1"]`);
            await p.waitForFunction(() => /page8\.png/.test(document.querySelector('dialog.h-tx-dlg [data-tx-img]')?.getAttribute('href') || ''), null, {timeout: 15000}); await sleep(500);
            s = await tx(); assert.equal(s.body, ''); assert.equal(s.on, '1');
            await setBody('Ton cousin, Lucien BARDOUX.'); await saveTx();
            const rows = JSON.parse(php(`require 'lib/bootstrap.php'; echo json_encode(db()->query('SELECT media_id, body, data_json FROM act_transcriptions WHERE media_id IN (7,8) ORDER BY media_id')->fetchAll(PDO::FETCH_ASSOC));`).stdout);
            assert.deepEqual(rows.map(r => [r.media_id, r.body]), [[7, 'Mon cher cousin,\nje t’écris de Tulle.'], [8, 'Ton cousin, Lucien BARDOUX.']]);
            assert.ok(rows.every(r => !JSON.parse(r.data_json).pages), 'pas de repères ni de pages dans un texte par page');
            await p.click(`${D} [data-tx-page="0"]`);
            await p.waitForFunction(() => /cher cousin/.test(document.querySelector('dialog.h-tx-dlg [data-tx-body]')?.value || ''), null, {timeout: 15000});
            await closeAtelier(); await p.evaluate(() => localStorage.removeItem('genealogie-transcribe-pages-mode'));
        });
        await t('un acte d’une seule page s’ouvre comme avant : pas d’onglets, rien de changé', async () => {
            await openTx({id: 1});
            const s = await tx(); assert.equal(s.bar, false); assert.equal(s.body, SOLO); assert.equal(s.rects, 1); assert.equal(s.form, '');
            assert.equal(await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-status]').textContent.trim() + document.querySelector('dialog.h-tx-dlg [data-tx-say]').textContent.trim()), ''); // ni état d'enregistrement ni message
            await closeAtelier();
        });

        /* ─── 3. « Ce que l'app a trouvé » sur toutes les pages ─── */
        const CONTRAT = 'Par-devant Maître Jacques ROUDIL, notaire à Tulle,\nfurent présents Louis VERNIAL, laboureur,\ndemeurant à Naves.\n— page 2 —\nlesquels ont fait le contrat suivant.\n— page 3 —\net Rose TAVERGNE, sa future épouse,\nfille de Pierre TAVERGNE ; ledit Louis VERNIAL\nâgé de trente ans.\n— page 4 —\nFait à Tulle le trois mai mil huit cent douze.\n';
        const trouve = () => p.evaluate(() => { const d = document.querySelector('dialog.h-tx-dlg [data-tx-trouve]'); if (!d) return null;
            return {cards: [...d.querySelectorAll('[data-tf-card]')].map(c => ({name: c.querySelector('.h-tf-name b')?.textContent.trim(), where: [...c.querySelector('.h-tf-name').querySelectorAll('.h-tf-where')].map(b => b.textContent.trim()),
                fields: [...c.querySelectorAll('.h-tf-fields li')].map(li => ({k: li.querySelector('.k')?.textContent.trim(), where: li.querySelector('.h-tf-where')?.textContent.trim() || ''}))})),
                items: [...d.querySelectorAll('[data-tf-item]')].map(i => ({main: i.querySelector('.h-tf-main')?.textContent.trim(), where: i.querySelector('.h-tf-where')?.textContent.trim() || ''})), all: d.textContent}; });
        await t('une personne citée sur deux pages : une seule carte ; chaque information dit sa page et sa ligne', async () => {
            await openTx({id: act3a});
            await setBody(CONTRAT); await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-step="find"]')?.click()); await p.click(`${D} [data-tx-cmd="detect"]`);
            await p.waitForFunction(() => document.querySelector('dialog.h-tx-dlg [data-tx-trouve] [data-tf-card]'), null, {timeout: 10000}); await sleep(600);
            const r = await trouve(), louis = r.cards.filter(c => /Louis VERNIAL/i.test(c.name || ''));
            assert.equal(louis.length, 1, 'une seule carte pour Louis VERNIAL : ' + JSON.stringify(r.cards.map(c => c.name)));
            assert.deepEqual(louis[0].where, ['(page 1, ligne 2)', '(page 3, ligne 2)']);
            const age = louis[0].fields.find(f => /Âge/.test(f.k)); assert.ok(age, 'l’âge de Louis : ' + JSON.stringify(louis[0].fields)); assert.equal(age.where, '(page 3, ligne 3)');
            const rose = r.cards.find(c => /Rose TAVERGNE/.test(c.name || '')); assert.deepEqual(rose.where, ['(page 3, ligne 1)']);
            const naves = r.items.find(i => /Naves/.test(i.main)); assert.equal(naves?.where, '(page 1, ligne 3)');
            assert.ok(r.items.some(i => /1812|douze/.test(i.main) && i.where === '(page 4, ligne 1)'), 'la date, page 4 : ' + JSON.stringify(r.items));
            assert.doesNotMatch(r.all, /page 2 —|— page/, 'les repères « — page 2 — » ne sont pas repérés');
            assert.ok(!r.items.some(i => /^[234]$/.test(i.main)), 'pas de nombre tiré des repères');
            await shot('atelier-trouve.png');
        });
        await t('un clic sur « (page 3, ligne 2) » : la page 3 et le passage', async () => {
            await p.click(`${D} [data-tx-page="0"]`); await sleep(400);
            await p.locator(`${D} [data-tx-trouve] .h-tf-where`, {hasText: '(page 3, ligne 2)'}).first().click(); await sleep(700);
            const s = await tx(); assert.equal(s.on, '2'); assert.match(s.href, /page3\.png/);
            const sel = await p.evaluate(() => { const a = document.querySelector('dialog.h-tx-dlg [data-tx-body]'); return a.value.slice(a.selectionStart, a.selectionEnd); });
            assert.match(sel, /Louis VERNIAL/);
        });
        await t('« ＋ Ajouter à une fiche… » met la page dans la source (page 3, ligne 3)', async () => {
            const card = p.locator(`${D} [data-tx-trouve] [data-tf-card]`, {hasText: 'Louis VERNIAL'}).first();
            await card.locator('.h-tf-fields li', {hasText: 'Âge'}).locator('[data-tf-add]').click();
            await p.waitForSelector('dialog[open] [data-tf-prev]'); await sleep(300);
            assert.match(await p.textContent('dialog[open] [data-tf-prev]'), /page 3, ligne 3/);
            await p.evaluate(() => { const d = [...document.querySelectorAll('dialog[open]')].at(-1); const fld = d.querySelector('.pk[data-picker]'); (window.LCNDA_PICKER?.pickerSet || window.LCNDA_APP.pickerSet)(fld, 2); });
            await sleep(200);
            await p.evaluate(() => { const d = [...document.querySelectorAll('dialog[open]')].at(-1); [...d.querySelectorAll('button')].find(b => /Ajouter$/.test(b.textContent.trim()) && b.type === 'submit' || /＋ Ajouter$/.test(b.textContent.trim()))?.click(); });
            await p.waitForFunction(() => [...document.querySelectorAll('.ui-toast')].some(x => /Ajouté à la fiche/.test(x.textContent)), null, {timeout: 10000});
            const sl = JSON.parse(php(`require 'lib/bootstrap.php'; echo json_encode(db()->query("SELECT page, note FROM source_links ORDER BY id DESC LIMIT 1")->fetch(PDO::FETCH_ASSOC));`).stdout || 'null');
            assert.match(sl.page, /(^|, )page 3$/, 'la page dans la source'); assert.match(sl.note, /^Page 3, ligne 3 : « .*trente ans/);
            await closeAtelier();
        });
        /* ─── 3 bis. un texte par page : « Ce que l'app a trouvé » lit aussi les actes des autres pages ─── */
        const P7 = 'Par-devant Maître Jacques ROUDIL, notaire à Tulle,\nfurent présents Louis VERNIAL, laboureur,\ndemeurant à Naves.';
        const P8 = 'et Rose TAVERGNE, sa future épouse,\nfille de Pierre TAVERGNE ; ledit Louis VERNIAL\nâgé de trente ans.';
        await t('un texte par page : une seule carte par personne sur les deux pages, « (page 2, ligne 2) » sur chaque information', async () => {
            await p.evaluate(() => { localStorage.setItem('genealogie-transcribe-pages-mode', 'per'); window.LCNDA_EXT.mediaPages.clear(); });
            const a7 = Number(php(`require 'lib/bootstrap.php'; echo db()->query('SELECT id FROM act_transcriptions WHERE media_id=7')->fetchColumn();`).stdout); assert.ok(a7 > 0);
            await openTx({id: a7}); assert.equal((await tx()).form, 'per');
            await setBody(P7); await saveTx();
            await p.click(`${D} [data-tx-page="1"]`);
            await p.waitForFunction(() => /page8\.png/.test(document.querySelector('dialog.h-tx-dlg [data-tx-img]')?.getAttribute('href') || ''), null, {timeout: 15000}); await sleep(500);
            await setBody(P8); await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-step="find"]')?.click()); await p.click(`${D} [data-tx-cmd="detect"]`);
            await p.waitForFunction(() => document.querySelector('dialog.h-tx-dlg [data-tx-trouve] [data-tf-card]'), null, {timeout: 10000}); await sleep(600);
            const r = await trouve(), louis = r.cards.filter(c => /Louis VERNIAL/i.test(c.name || ''));
            assert.equal(louis.length, 1, 'une seule carte pour Louis VERNIAL : ' + JSON.stringify(r.cards.map(c => c.name)));
            assert.deepEqual(louis[0].where, ['(page 1, ligne 2)', '(page 2, ligne 2)']);
            assert.equal(louis[0].fields.find(f => /Âge/.test(f.k))?.where, '(page 2, ligne 3)');
            assert.equal(r.items.find(i => /Naves/.test(i.main))?.where, '(page 1, ligne 3)', 'le lieu de la page 1, lu dans l’acte de la page 1');
            assert.doesNotMatch(r.all, /— page/);
            assert.equal((await tx()).body, P8, 'le texte de la page affichée ne change pas');
            await shot('atelier-trouve-par-page.png');
        });
        await t('un texte par page : un clic sur « (page 1, ligne 2) » ouvre l’acte de la page 1, au passage', async () => {
            await p.locator(`${D} [data-tx-trouve] .h-tf-where`, {hasText: '(page 1, ligne 2)'}).first().click();
            await p.waitForFunction(() => /page7\.png/.test(document.querySelector('dialog.h-tx-dlg [data-tx-img]')?.getAttribute('href') || ''), null, {timeout: 15000}); await sleep(900);
            const s = await tx(); assert.equal(s.on, '0'); assert.equal(s.body, P7);
            const sel = await p.evaluate(() => { const a = document.querySelector('dialog.h-tx-dlg [data-tx-body]'); return a.value.slice(a.selectionStart, a.selectionEnd); });
            assert.match(sel, /Louis VERNIAL/);
            const rows = JSON.parse(php(`require 'lib/bootstrap.php'; echo json_encode(db()->query('SELECT media_id, body FROM act_transcriptions WHERE media_id IN (7,8) ORDER BY media_id')->fetchAll(PDO::FETCH_ASSOC));`).stdout);
            assert.deepEqual(rows.map(x => [x.media_id, x.body]), [[7, P7], [8, P8]], 'la page 2 a été enregistrée en changeant de page');
            await p.waitForFunction(() => document.querySelector('dialog.h-tx-dlg [data-tx-trouve] [data-tf-card]'), null, {timeout: 10000});
        });
        await t('un texte par page : « ＋ Ajouter à une fiche… » sur une information de la page 2 met la page 2 (et son image) dans la source', async () => {
            await p.evaluate(() => document.querySelectorAll('.ui-toast').forEach(x => { x.dataset.seen = '1'; }));
            const card = p.locator(`${D} [data-tx-trouve] [data-tf-card]`, {hasText: 'Louis VERNIAL'}).first();
            await card.locator('.h-tf-fields li', {hasText: 'Âge'}).locator('[data-tf-add]').click();
            await p.waitForSelector('dialog[open] [data-tf-prev]'); await sleep(300);
            assert.match(await p.textContent('dialog[open] [data-tf-prev]'), /page 2, ligne 3/);
            await p.evaluate(() => { const d = [...document.querySelectorAll('dialog[open]')].at(-1); const fld = d.querySelector('.pk[data-picker]'); (window.LCNDA_PICKER?.pickerSet || window.LCNDA_APP.pickerSet)(fld, 2); });
            await sleep(200);
            await p.evaluate(() => { const d = [...document.querySelectorAll('dialog[open]')].at(-1); [...d.querySelectorAll('button')].find(b => /Ajouter$/.test(b.textContent.trim()) && b.type === 'submit' || /＋ Ajouter$/.test(b.textContent.trim()))?.click(); });
            // la bulle de CET ajout (celle de l'essai d'avant a pu disparaître quand l'ordinateur est lent) : les bulles déjà là sont marquées avant
            await p.waitForFunction(() => [...document.querySelectorAll('.ui-toast')].some(x => !x.dataset.seen && /Ajouté à la fiche/.test(x.textContent)), null, {timeout: 10000});
            const sl = JSON.parse(php(`require 'lib/bootstrap.php'; echo json_encode(db()->query("SELECT * FROM source_links ORDER BY id DESC LIMIT 1")->fetch(PDO::FETCH_ASSOC));`).stdout || 'null');
            assert.match(sl.page, /(^|, )page 2 \(verso\)$/, 'la page dans la source : ' + JSON.stringify(sl)); assert.match(sl.note, /^Page 2, ligne 3 : « .*trente ans/);
            await closeAtelier(); await p.evaluate(() => localStorage.removeItem('genealogie-transcribe-pages-mode'));
        });
        await t('🪄 corrections, un texte par page : le nombre sur chaque page ; un clic ouvre l’acte de l’autre page, corrections affichées', async () => {
            await p.evaluate(() => { localStorage.setItem('genealogie-transcribe-pages-mode', 'per'); window.LCNDA_EXT.mediaPages.clear(); });
            const a7 = Number(php(`require 'lib/bootstrap.php'; echo db()->query('SELECT id FROM act_transcriptions WHERE media_id=7')->fetchColumn();`).stdout);
            await openTx({id: a7}); assert.equal((await tx()).body, P7);
            const setBody = v => p.evaluate(x => { const a = document.querySelector('dialog.h-tx-dlg [data-tx-body]'); a.value = x; a.dispatchEvent(new Event('input')); }, v);
            await setBody(P7 + '\nle quinze novembe'); await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-cmd="save"]').click()); await sleep(900);
            await p.click(`${D} [data-tx-page="1"]`); await p.waitForFunction(() => /page8\.png/.test(document.querySelector('dialog.h-tx-dlg [data-tx-img]')?.getAttribute('href') || ''), null, {timeout: 15000}); await sleep(700);
            await p.click(`${D} [data-tx-step="fix"]`); await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-step="fix"]')?.click()); await p.click(`${D} [data-tx-cmd="fix"]`);
            await p.waitForSelector(`${D} [data-txfix-page="0"]`, {timeout: 15000});
            assert.match(await p.textContent(`${D} [data-txfix-page="0"]`), / : [1-9]/);
            await p.click(`${D} [data-txfix-page="0"]`);
            await p.waitForFunction(() => /page7\.png/.test(document.querySelector('dialog.h-tx-dlg [data-tx-img]')?.getAttribute('href') || ''), null, {timeout: 15000});
            await p.waitForFunction(() => { const b = document.querySelector('dialog.h-tx-dlg [data-tx-fixbar]'); return b && !b.hidden && /correction/.test(b.textContent); }, null, {timeout: 10000});
            await setBody(P7); await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-cmd="save"]').click()); await sleep(900);
            assert.equal(php(`require 'lib/bootstrap.php'; echo db()->query('SELECT body FROM act_transcriptions WHERE media_id=7')->fetchColumn();`).stdout, P7);
            await closeAtelier(); await p.evaluate(() => localStorage.removeItem('genealogie-transcribe-pages-mode'));
        });
        /* ─── 4. « 🔬 Lecture approfondie (IA) » sur toutes les pages (faux Ollama) ─── */
        await p.evaluate(async () => { const A = window.LCNDA_APP, st = await A.api('tx_deep_status'), m = (st.models.find(x => x.recommended) || st.models[0]).tag;
            const r = await A.api('tx_deep_pull', {}, {method: 'POST', body: {model: m}}); for (let i = 0; i < 60; i++) { const j = await A.api('tx_deep_job', {id: r.result.id}); if (j.state !== 'running') break; await new Promise(x => setTimeout(x, 150)); } });
        const deepAll = async () => {
            await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-step="read"]')?.click()); await p.click(`${D} [data-tx-cmd="readmenu"]`); assert.equal(await p.isVisible(`${D} [data-tx-readscope]`), true, 'le choix « Sur toutes les pages » se voit');
            await p.check(`${D} [data-tx-readscope] input[value="all"]`); await p.click(`${D} [data-tx-readpanel] [data-tx-cmd="deep"]`);
            await p.waitForSelector('[data-txa-readall]', {timeout: 15000});
            const o = await p.evaluate(() => ({btn: document.querySelector('[data-txa-readall]').textContent, link: document.querySelector('[data-txl-link]')?.checked, one: !!document.querySelector('[data-txa-read]')}));
            await p.click('[data-txa-readall]'); return o; };
        const statusTx = () => p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-say]')?.textContent || ''); // atelier-etapes (point 11) : les messages sont dans la barre du bas
        await t('🔬 toutes les pages, un texte par page : une demande par page, chaque texte dans l’acte de sa page (enregistré)', async () => {
            await p.evaluate(() => { localStorage.setItem('genealogie-transcribe-pages-mode', 'per'); window.LCNDA_EXT.mediaPages.clear(); });
            const a7 = Number(php(`require 'lib/bootstrap.php'; echo db()->query('SELECT id FROM act_transcriptions WHERE media_id=7')->fetchColumn();`).stdout);
            await openTx({id: a7}); const c0 = ollama.chats;
            const o = await deepAll(); assert.match(o.btn, /Lire toutes les pages avec ce modèle \(2\)/); assert.equal(o.link, true, 'la case ▤ se choisit avant'); assert.equal(o.one, false);
            const bars = new Set();
            for (let i = 0; i < 120; i++) { const b = await p.evaluate(() => { const x = document.querySelector('dialog.h-tx-dlg [data-tx-deepall]'); return x && !x.hidden ? x.textContent : ''; }); if (b) bars.add(b.replace(/\s+/g, ' ').trim()); if (/Toutes les pages sont lues/.test(await statusTx())) break; await sleep(250); }
            assert.match(await statusTx(), /Toutes les pages sont lues/);
            assert.ok([...bars].some(b => /page 1 sur 2/.test(b)) && [...bars].some(b => /page 2 sur 2/.test(b)), 'la barre « page 2 sur 2 » : ' + JSON.stringify([...bars]));
            assert.ok([...bars].every(b => /Arrêter/.test(b)));
            assert.equal(ollama.chats - c0, 2, 'une demande par page');
            await sleep(800);
            const rows = JSON.parse(php(`require 'lib/bootstrap.php'; echo json_encode(db()->query('SELECT media_id, body, data_json FROM act_transcriptions WHERE media_id IN (7,8) ORDER BY media_id')->fetchAll(PDO::FETCH_ASSOC));`).stdout);
            assert.equal(rows[0].body, P7 + '\n\nLecture approfondie numéro ' + (c0 + 1) + ',\ndeuxième ligne de la lecture ' + (c0 + 1) + '.\n');
            assert.equal(rows[1].body, P8 + '\n\nLecture approfondie numéro ' + (c0 + 2) + ',\ndeuxième ligne de la lecture ' + (c0 + 2) + '.\n');
            rows.forEach(r => assert.ok(JSON.parse(r.data_json).zones.some(z => z.src === 'deep'), '▤ des zones reliées sur chaque page : ' + r.data_json));
            assert.match((await tx()).href, /page8\.png/);
            await closeAtelier(); await p.evaluate(() => localStorage.removeItem('genealogie-transcribe-pages-mode'));
        });
        await t('🔬 toutes les pages, un seul texte : chaque page lue dans son morceau, ses lignes reliées sur sa page', async () => {
            await openTx({id: act3a}); const b0 = (await tx()).body, z0 = await p.evaluate(() => document.querySelector('dialog.h-tx-dlg').txApi.get().data.zones.length), c0 = ollama.chats;
            await deepAll();
            await p.waitForFunction(() => /Toutes les pages sont lues/.test(document.querySelector('dialog.h-tx-dlg [data-tx-say]')?.textContent || ''), null, {timeout: 60000});
            const s = await tx(), seg = s.body.split(/\n— page \d —\n/), seg0 = b0.split(/\n— page \d —\n/);
            assert.equal(seg.length, 4);
            [1, 2, 3, 4].forEach(n => { assert.ok(seg[n - 1].startsWith(seg0[n - 1].replace(/\n+$/, '')), `page ${n} : le texte d’avant reste`); assert.match(seg[n - 1], new RegExp(`Lecture approfondie numéro ${c0 + n},\\ndeuxième ligne de la lecture ${c0 + n}\\.`), `page ${n}`); });
            const zp = await p.evaluate(() => [...new Set(document.querySelector('dialog.h-tx-dlg').txApi.get().data.zones.filter(q => q.src === 'deep').map(q => q.p))].sort());
            assert.deepEqual(zp, [1, 2, 3, 4], 'des zones ▤ sur chaque page');
            const zt = await p.evaluate(() => { const d = document.querySelector('dialog.h-tx-dlg'), a = d.querySelector('[data-tx-body]').value; return d.txApi.get().data.zones.filter(q => q.src === 'deep').map(q => [q.p, a.slice(q.s, q.e)]); });
            zt.forEach(([pg, tt]) => { const m = tt.match(/(?:numéro|lecture) (\d+)/); if (m) assert.equal(Number(m[1]) - c0, pg, 'la zone de ' + tt + ' est sur sa page'); });
            assert.ok(zt.length >= 4 && (await p.evaluate(() => document.querySelector('dialog.h-tx-dlg').txApi.get().data.zones.length)) > z0);
        });
        await t('🪄 corrections, un seul texte : le nombre par page, un clic montre la page', async () => {
            const b0 = (await tx()).body, sg = b0.split(/\n— page \d —\n/), at = b0.indexOf(sg[1]) + sg[1].length;
            await p.evaluate(([v]) => { const a = document.querySelector('dialog.h-tx-dlg [data-tx-body]'); a.value = v; a.dispatchEvent(new Event('input')); }, [b0.slice(0, at) + '\nle quinze novembe' + b0.slice(at)]);
            await p.click(`${D} [data-tx-step="fix"]`); await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-step="fix"]')?.click()); await p.click(`${D} [data-tx-cmd="fix"]`);
            await p.waitForSelector(`${D} [data-txfix-page]`, {timeout: 15000});
            const btns = await p.$$eval(`${D} [data-txfix-page]`, b => b.map(x => [x.dataset.txfixPage, x.textContent]));
            const two = btns.find(x => x[0] === '1'); assert.ok(two && / : [1-9]/.test(two[1]), 'la page 2 a sa correction : ' + JSON.stringify(btns));
            await p.click(`${D} [data-tx-page="3"]`); await sleep(400);
            await p.click(`${D} [data-txfix-page="1"]`); await sleep(500); assert.equal((await tx()).on, '1', 'le clic montre la page 2');
            await p.click(`${D} [data-txfix="close"]`);
            await p.evaluate(([v]) => { const a = document.querySelector('dialog.h-tx-dlg [data-tx-body]'); a.value = v; a.dispatchEvent(new Event('input')); }, [b0]);
            await p.click(`${D} [data-tx-step="read"]`); await sleep(300);
        });
        await t('« Seulement les pages pas encore lues » : toutes ont du texte → une phrase, aucune lecture lancée', async () => {
            const c0 = ollama.chats;
            await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-step="read"]')?.click()); await p.click(`${D} [data-tx-cmd="readmenu"]`); await p.check(`${D} [data-tx-readscope] input[value="empty"]`); await p.click(`${D} [data-tx-readpanel] [data-tx-cmd="deep"]`); await sleep(600);
            const toastTxt = await p.evaluate(() => [...document.querySelectorAll('.toast, [role=status], .ui-toast')].map(e => e.textContent).join(' | '));
            assert.match(toastTxt, /Toutes les pages ont déjà du texte/, toastTxt);
            assert.equal(await p.evaluate(() => !!document.querySelector('[data-txa-deep]')), false, 'pas de fenêtre de lecture');
            assert.equal(ollama.chats, c0);
        });
        await t('🔬 sur la page affichée (page 2) : la fenêtre dit la page, et compare avec le texte de cette page seulement', async () => {
            await p.click(`${D} [data-tx-page="1"]`); await sleep(500);
            const seg2 = (await tx()).body.split(/\n— page \d —\n/)[1].trim();
            await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-step="read"]')?.click()); await p.click(`${D} [data-tx-cmd="readmenu"]`);
            const pr = await p.$eval(`${D} [data-tx-pread]`, e => e.textContent);
            const counts = (await tx()).body.split(/\n— page \d —\n/).map(x => x.split('\n').filter(l => l.trim()).length);
            assert.match(pr, /^Lignes déjà écrites — /, pr); assert.deepEqual([...pr.matchAll(/ : (\d+)/g)].map(m => Number(m[1])), counts, 'l’état de chaque page : ' + pr);
            await p.check(`${D} [data-tx-readscope] input[value="page"]`); await p.click(`${D} [data-tx-readpanel] [data-tx-cmd="deep"]`);
            await p.waitForSelector('[data-txa-read]', {timeout: 15000}); await p.click('[data-txa-read]');
            await p.waitForSelector('[data-txa-t="htr"]', {timeout: 30000});
            const o = await p.evaluate(() => ({left: document.querySelector('[data-txa-t="htr"]').value, h: document.querySelector('[data-txa-out] h4').textContent}));
            assert.equal(o.left.trim(), seg2, 'à gauche : le texte de la page 2, pas tout le document');
            assert.match(o.h, /\(2 sur 4\)/, o.h);
            const b0 = (await tx()).body; await p.click('[data-txa-keep="htr"]'); await sleep(400);
            assert.equal((await tx()).body, b0, 'garder le texte déjà là ne l’ajoute pas une deuxième fois');
            await p.evaluate(() => document.querySelectorAll('dialog[open]:not(.h-tx-dlg)').forEach(d => d.close()));
        });
        await t('🔬 page 2 déjà écrite : « ⇄ Remplacer le texte » remplace la page 2 seulement, l’ancien texte dans 🕘 Versions', async () => {
            await p.click(`${D} [data-tx-page="1"]`); await sleep(400);
            const b0 = (await tx()).body, sg0 = b0.split(/\n— page \d —\n/);
            const id = await p.evaluate(() => document.querySelector('dialog.h-tx-dlg').txApi.get().id);
            const v0 = (await p.evaluate(i => window.LCNDA_APP.api('act_transcription_versions', {act_id: i}), id)).items.length;
            await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-step="read"]')?.click()); await p.click(`${D} [data-tx-cmd="readmenu"]`); await p.check(`${D} [data-tx-readscope] input[value="page"]`); await p.click(`${D} [data-tx-readpanel] [data-tx-cmd="deep"]`);
            await p.waitForSelector('[data-txa-read]', {timeout: 15000}); await p.click('[data-txa-read]');
            await p.waitForSelector('[data-txa-keep="deep"][data-txa-mode="replace"]', {timeout: 30000});
            assert.equal(await p.isVisible('[data-txa-keep="deep"][data-txa-mode="append"]'), true, '« ＋ Ajouter à la suite » aussi');
            const deep = (await p.$eval('[data-txa-t="deep"]', e => e.value)).trim();
            await p.click('[data-txa-keep="deep"][data-txa-mode="replace"]'); await sleep(800);
            const sg = (await tx()).body.split(/\n— page \d —\n/);
            assert.equal(sg.length, sg0.length); assert.equal(sg[1].trim(), deep, 'la page 2 = la lecture');
            [0, 2, 3].forEach(i => assert.equal(sg[i], sg0[i], `page ${i + 1} inchangée`));
            let v1 = v0; for (let k = 0; k < 20 && v1 === v0; k++) { await sleep(200); v1 = (await p.evaluate(i => window.LCNDA_APP.api('act_transcription_versions', {act_id: i}), id)).items.length; }
            assert.ok(v1 > v0, 'une version « Avant… » gardée');
        });
        await t('👁 relire ligne à ligne, un seul texte : une ligne de la page 3 dit sa page et montre le morceau de l’image de la page 3', async () => {
            await p.click(`${D} [data-tx-page="0"]`); await sleep(400);
            const pick = await p.evaluate(() => { const d = document.querySelector('dialog.h-tx-dlg'), g = d.txApi.get(), a = d.querySelector('[data-tx-body]').value;
                const z = g.data.zones.find(q => Number(q.p) === 3 && q.src && q.e > q.s); return z ? {s: z.s, id: z.id, text: a.slice(z.s, z.e)} : null; });
            assert.ok(pick, 'une zone reliée sur la page 3');
            await p.evaluate(s0 => { const a = document.querySelector('dialog.h-tx-dlg [data-tx-body]'); a.focus(); a.setSelectionRange(s0, s0); }, pick.s);
            await p.click(`${D} [data-tx-step="fix"]`); await p.keyboard.press('r');
            await p.waitForSelector('dialog.h-txr-dlg[open]'); await sleep(900);
            const r = await p.evaluate(() => { const d = document.querySelector('dialog.h-txr-dlg[open]'), cv = d.querySelector('[data-txr-img]'); let ink = 0;
                try { const px = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let lo = 255, hi = 0; for (let i = 0; i < px.length; i += 16) { lo = Math.min(lo, px[i]); hi = Math.max(hi, px[i]); } ink = hi - lo; } catch (_) {}
                return {pos: d.querySelector('[data-txr-pos]').textContent, zone: d.dataset.txrZone, shown: !cv.hidden, ink}; });
            assert.match(r.pos, /\(3 sur 4\) · Ligne \d+ sur \d+/, r.pos);
            assert.equal(r.zone, pick.id); assert.ok(r.shown && r.ink > 20, 'le morceau de l’image de la page 3 : ' + JSON.stringify(r));
            // le choix des lignes : cette page, ou seulement celles pas encore relues ; l'avancement de la page
            const st = () => p.evaluate(() => { const d = document.querySelector('dialog.h-txr-dlg[open]'); return {pos: d.querySelector('[data-txr-pos]').textContent, done: d.querySelector('[data-txr-done]').textContent, line: d.querySelector('[data-txr-line]').value}; });
            const total = x => Number((x.pos.match(/sur (\d+)$/) || [])[1]);
            const s0 = await st(); assert.match(s0.done, /\(3 sur 4\) : \d+\/\d+$/, s0.done);
            const pg3 = (await tx()).body.split(/\n— page \d —\n/)[2].split('\n').filter(l => l.trim()).length;
            await p.check('dialog.h-txr-dlg [name="txr_scope"][value="page"]'); await sleep(200);
            const s1 = await st(); assert.equal(total(s1), pg3, 'cette page seulement : ' + s1.pos); assert.equal(s1.line, s0.line, 'on reste sur la même ligne');
            await p.check('dialog.h-txr-dlg [name="txr_scope"][value="todo"]'); await sleep(200);
            const s2 = await st(); await p.keyboard.press('Enter'); await sleep(300); const s3 = await st();
            assert.equal(total(s3), total(s2) - 1, 'la ligne relue sort de la liste : ' + s2.pos + ' → ' + s3.pos); assert.notEqual(s3.line, s2.line);
            assert.match(s3.done, /\(\d sur 4\) : \d+\/\d+$/);
            await p.keyboard.press('Escape'); await sleep(300); await p.click(`${D} [data-tx-step="read"]`);
        });
        await t('🎚 chaque page garde ses réglages d’image : tourner la page 1 ne tourne pas la page 2 ; gardé après enregistrement', async () => {
            const rot = () => p.evaluate(() => document.querySelector('dialog.h-tx-dlg').txApi.get().data.view.rot || 0);
            await p.click(`${D} [data-tx-page="0"]`); await sleep(400); const r0 = await rot();
            await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-cmd="rot"]').click()); await sleep(400);
            assert.equal(await rot(), (r0 + 90) % 360, 'la page 1 tournée');
            await p.click(`${D} [data-tx-page="1"]`); await sleep(500); assert.equal(await rot(), 0, 'la page 2 n’est pas tournée');
            await p.click(`${D} [data-tx-page="0"]`); await sleep(500); assert.equal(await rot(), (r0 + 90) % 360, 'la page 1 l’est toujours');
            await p.click(`${D} [data-tx-page="1"]`); await sleep(400);
            await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-cmd="save"]').click()); await sleep(1200);
            await openTx({id: act3a, page: 1}); assert.equal(await rot(), (r0 + 90) % 360, 'rouvert sur la page 1 : toujours tournée');
            await p.click(`${D} [data-tx-page="1"]`); await sleep(500); assert.equal(await rot(), 0);
            await p.click(`${D} [data-tx-page="0"]`); await sleep(500);
            for (let k = 0; k < 3; k++) { await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-cmd="rot"]').click()); await sleep(250); } // remise à l'endroit
            assert.equal(await rot(), r0);
        });
        await t('⤓ export et 🖨 impression, un seul texte : le nom de chaque page, son image, « Sur la page affichée » ou toutes', async () => {
            await p.click(`${D} [data-tx-page="1"]`); await sleep(400);
            const r = await p.evaluate(async () => { const UI = window.LCNDA_UI, keep = {pr: UI.openPrintDialog, ex: UI.openExportDialog}; let pr = null, ex = null;
                UI.openPrintDialog = o => { pr = o; }; UI.openExportDialog = o => { ex = o; };
                try { const d = document.querySelector('dialog.h-tx-dlg'); [...d.querySelectorAll('[data-tx-menus] button')].find(b => b.textContent.trim() === 'Fichier').click(); await new Promise(x => setTimeout(x, 200));
                    [...document.querySelectorAll('.ui-actmenu .ui-actmenu-i')].find(b => /Exporter/.test(b.textContent)).click(); await new Promise(x => setTimeout(x, 200));
                    let blob = ''; const oc = URL.createObjectURL; URL.createObjectURL = b => { blob = b; return oc.call(URL, b); };
                    await ex.formats.find(f => f.id === 'file').run({filename: 'x.txt'}); URL.createObjectURL = oc; const txt = await blob.text();
                    await ex.formats.find(f => f.id === 'print').run({});
                    const all = await pr.html({lay: 'side', pages: 'all', people: false}), here = await pr.html({lay: 'side', pages: 'here', people: false});
                    const imgs = h => [...h.matchAll(/<img src="([^"]+)"/g)].map(m => m[1].split('/').pop()), hs = h => [...h.matchAll(/<h2>([^<]+)<\/h2>/g)].map(m => m[1]);
                    return {txt, opt: pr.options.some(o => o.key === 'pages'), allH: hs(all), allImg: imgs(all), hereH: hs(here), hereImg: imgs(here)};
                } finally { UI.openPrintDialog = keep.pr; UI.openExportDialog = keep.ex; } });
            assert.equal(r.opt, true, 'le choix des pages dans « Imprimer »');
            assert.equal(r.allH.length, 4, JSON.stringify(r.allH));
            assert.equal(r.allImg.length, 4); assert.equal(new Set(r.allImg).size, 4, 'une image différente par page : ' + JSON.stringify(r.allImg));
            assert.deepEqual(r.hereH, [r.allH[1]], 'la page affichée seulement'); assert.equal(r.hereImg.length, 1);
            r.allH.forEach(h => assert.ok(r.txt.includes(`— ${h} —`), 'le texte exporté nomme la page ' + h + ' : ' + r.txt.slice(0, 200)));
            assert.ok(!/— page \d —/.test(r.txt), 'plus de repère « — page 2 — » sans nom');
        });
        await t('🧩 Modèle (réglage « Texte à trous »), un seul texte : ajouté à la fin de la page affichée (pas de la dernière page) ; ↶ Annuler', async () => {
            await p.evaluate(() => localStorage.setItem('genealogie-transcribe-modele', 'texte')); // le gabarit à cases est conseillé : ici, le texte à trous
            await p.click(`${D} [data-tx-page="1"]`); await sleep(400);
            const b0 = (await tx()).body, sg0 = b0.split(/\n— page \d —\n/), k0 = await p.$eval(`${D} [data-tx="kind"]`, e => e.value);
            await p.selectOption(`${D} [data-tx="kind"]`, 'bapteme').catch(async () => { await p.evaluate(() => { const k = document.querySelector('dialog.h-tx-dlg [data-tx="kind"]'); k.value = 'bapteme'; k.dispatchEvent(new Event('change', {bubbles: true})); }); });
            await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-cmd="template"]').click()); await sleep(300);
            await p.evaluate(() => { const c = [...document.querySelectorAll('dialog[open]')].find(d => /Ajouter le modèle/.test(d.textContent) && !d.classList.contains('h-tx-dlg')); [...(c?.querySelectorAll('button') || [])].find(b => /Ajouter le modèle/.test(b.textContent))?.click(); }); await sleep(400);
            const sg = (await tx()).body.split(/\n— page \d —\n/);
            assert.match(sg[1], /L’an \[année\], le \[jour\] du mois/, 'le modèle dans la page 2'); assert.ok(sg[1].startsWith(sg0[1].replace(/\n+$/, '')), 'le texte de la page 2 reste devant');
            [0, 2, 3].forEach(i => assert.equal(sg[i], sg0[i], `page ${i + 1} inchangée`));
            await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-hist="undo"]').click()); await sleep(400);
            assert.equal((await tx()).body, b0, '↶ Annuler retire le modèle');
            await p.evaluate(k => { const e = document.querySelector('dialog.h-tx-dlg [data-tx="kind"]'); e.value = k; e.dispatchEvent(new Event('change', {bubbles: true})); }, k0);
            await p.evaluate(() => localStorage.removeItem('genealogie-transcribe-modele'));
        });
        await t('🗂 export TEI : XML bien formé, une surface par page (image, zones), un <pb/> par page, chaque ligne reliée à sa zone', async () => {
            const r = await p.evaluate(async () => { const UI = window.LCNDA_UI, keep = UI.openExportDialog; let ex = null; UI.openExportDialog = o => { ex = o; };
                try { const d = document.querySelector('dialog.h-tx-dlg'); [...d.querySelectorAll('[data-tx-menus] button')].find(b => b.textContent.trim() === 'Fichier').click(); await new Promise(x => setTimeout(x, 200));
                    [...document.querySelectorAll('.ui-actmenu .ui-actmenu-i')].find(b => /Exporter/.test(b.textContent)).click(); await new Promise(x => setTimeout(x, 200));
                    let blob = null; const oc = URL.createObjectURL; URL.createObjectURL = b => { blob = b; return oc.call(URL, b); };
                    const f = ex.formats.find(q => q.id === 'tei'); await f.run({filename: 'x.xml'}); URL.createObjectURL = oc;
                    const xml = await blob.text(), doc = new DOMParser().parseFromString(xml, 'application/xml'), NS = 'http://www.tei-c.org/ns/1.0', q = n => [...doc.getElementsByTagNameNS(NS, n)];
                    const zoneIds = new Set(q('zone').map(z => z.getAttribute('xml:id'))), g = document.querySelector('dialog.h-tx-dlg').txApi.get();
                    return {ext: f.ext, err: !!doc.getElementsByTagName('parsererror').length, root: doc.documentElement.namespaceURI, title: q('title')[0]?.textContent,
                        surfaces: q('surface').map(x => x.querySelector('graphic')?.getAttribute('url')), zones: zoneIds.size, dataZones: g.data.zones.filter(z => z.w > 0 && z.h > 0).length,
                        pbs: q('pb').length, lbs: q('lb').length, facs: q('lb').map(l => l.getAttribute('facs')).filter(Boolean), facsOk: q('lb').map(l => l.getAttribute('facs')).filter(Boolean).every(f => zoneIds.has(f.slice(1))),
                        lines: g.body.split(/\n— page \d —\n/).map(x => x.replace(/^\n+|\n+$/g, '').split('\n').length).reduce((a, b) => a + b, 0)}; // les lignes vides autour d'un repère de page ne sont pas des lignes de l'acte
                } finally { UI.openExportDialog = keep; } });
            assert.equal(r.ext, 'xml'); assert.equal(r.err, false, 'XML bien formé'); assert.equal(r.root, 'http://www.tei-c.org/ns/1.0'); assert.ok(r.title);
            assert.deepEqual(r.surfaces, ['media/page1.png', 'media/page2.png', 'media/page3.png', 'media/page4.png']);
            assert.equal(r.zones, r.dataZones, 'toutes les zones'); assert.equal(r.pbs, 4);
            assert.equal(r.lbs, r.lines, 'une ligne <lb/> par ligne du texte (sans les repères de page)');
            assert.ok(r.facs.length >= 4 && r.facsOk, 'des lignes reliées à leur zone, toutes vers une zone qui existe : ' + r.facs.length);
        });
        await t('🔬 toutes les pages : « ■ Arrêter » pendant la page 1 arrête tout : seule la page 1 garde ce qui était déjà lu, rien pour les suivantes', async () => {
            ollama.delay = 700; const b0 = (await tx()).body, c0 = ollama.chats;
            await deepAll();
            await p.waitForFunction(() => { const x = document.querySelector('dialog.h-tx-dlg [data-tx-deepall]'); return x && !x.hidden && /page 1 sur 4/.test(x.textContent); }, null, {timeout: 15000});
            for (let i = 0; i < 40 && ollama.chats === c0; i++) await sleep(100);
            await p.click(`${D} [data-tx-deepstop]`);
            await p.waitForFunction(() => document.querySelector('dialog.h-tx-dlg [data-tx-deepall]')?.hidden, null, {timeout: 10000});
            await sleep(2500);
            assert.match(await statusTx(), /arrêtée/); assert.equal(ollama.chats - c0, 1, 'pas de demande pour les pages suivantes');
            // « ■ Arrêter » garde ce qui était déjà lu de la page en cours (voulu) ; les pages suivantes ne changent pas
            const b1 = (await tx()).body, after = s => s.slice(s.indexOf('— page 2 —'));
            assert.ok(b1.indexOf('— page 2 —') >= 0); assert.equal(after(b1), after(b0), 'les pages 2 à 4 sont intactes');
            ollama.delay = 20; await closeAtelier();
        });
        await t('un acte d’une seule page : « Ce que l’app a trouvé » sans page (comme avant)', async () => {
            await openTx({id: 1}); await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-step="find"]')?.click()); await p.click(`${D} [data-tx-cmd="detect"]`);
            await p.waitForFunction(() => document.querySelector('dialog.h-tx-dlg [data-tx-trouve] [data-tf-card]'), null, {timeout: 10000}); await sleep(400);
            const r = await trouve(); assert.ok(r.cards.length >= 2); assert.equal((r.all.match(/\(page \d/g) || []).length, 0);
            await closeAtelier();
        });

        await t('un acte d’une seule page est resté exactement comme avant', async () => {
            const now = php(String.raw`require 'lib/bootstrap.php'; $pdo = db(); echo json_encode($pdo->query('SELECT title,kind,media_id,body,data_json FROM act_transcriptions WHERE id=1')->fetch(PDO::FETCH_ASSOC));`).stdout;
            assert.equal(now, soloBefore);
        });
        await t('la migration 104 est rejouable (rien ne change, rien n’est perdu)', async () => {
            const r = php(String.raw`require 'lib/bootstrap.php'; $pdo = db(); $before = $pdo->query('SELECT media_id,set_id,position,label FROM media_pages ORDER BY media_id')->fetchAll(PDO::FETCH_ASSOC);
                schema_v104($pdo); schema_v104($pdo); $after = $pdo->query('SELECT media_id,set_id,position,label FROM media_pages ORDER BY media_id')->fetchAll(PDO::FETCH_ASSOC);
                echo json_encode(['same' => $before === $after, 'n' => count($after), 'v' => (int) $pdo->query('PRAGMA user_version')->fetchColumn(), 'want' => SCHEMA_VERSION]);`);
            const j = JSON.parse(r.stdout || '{}'); assert.equal(j.same, true, r.stderr); assert.equal(j.n, 6); assert.ok(j.want >= 104, 'au moins la 104'); assert.equal(j.v, j.want, 'la base à jour');
        });
        await t('aucune erreur JavaScript', async () => { assert.deepEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill(); fake.close();
        fs.rmSync(tmp, {recursive: true, force: true});
    }
    console.log(fails ? `${fails} essai(s) en échec` : 'Les documents en plusieurs pages marchent.');
    process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
