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
$cols = [[230,215,180],[220,226,200],[214,214,232],[236,206,206],[210,230,230],[226,226,226]];
foreach ([1,2,3,4,5,6] as $i) { $im = imagecreatetruecolor(600, 500); [$r,$g,$b] = $cols[$i-1]; imagefill($im, 0, 0, imagecolorallocate($im, $r, $g, $b)); $ink = imagecolorallocate($im, 60, 45, 30);
  for ($l = 0; $l < 6; $l++) for ($x = 50; $x < 550; $x += 9) imagefilledrectangle($im, $x, 50 + $l * 64, $x + 5, 70 + $l * 64, $ink);
  imagepng($im, MEDIA_DIR . "/page$i.png"); }
$m = $pdo->prepare("INSERT INTO media(id,title,filename,thumbnail,media_type) VALUES(?,?,?,?,'image')");
$m->execute([1, 'Contrat Vernial-Tavergne, feuillet 1', 'page1.png', 'page1.png']);
$m->execute([2, 'Contrat Vernial-Tavergne, feuillet 2', 'page2.png', 'page2.png']);
$m->execute([3, 'Contrat Vernial-Tavergne, feuillet 3', 'page3.png', 'page3.png']);
$m->execute([4, 'Contrat Vernial-Tavergne, plan joint', 'page4.png', 'page4.png']);
$m->execute([5, 'Naissance de Paul VERNIAL', 'page5.png', 'page5.png']);
$m->execute([6, 'Carte de Lucien BARDOUX', 'page6.png', 'page6.png']);
act_transcriptions_ensure($pdo);
// un acte d'une seule page, fait avant : il doit rester exactement comme il est
$a = $pdo->prepare("INSERT INTO act_transcriptions(id,title,kind,media_id,body,data_json,updated_at) VALUES(?,?,?,?,?,?,?)");
$a->execute([1, 'Naissance de Paul VERNIAL', 'naissance', 5, getenv('TX_SOLO'), getenv('TX_SOLO_DATA'), '2026-01-01 10:00:00']);
$pdo->prepare("UPDATE media SET transcription=? WHERE id=5")->execute([getenv('TX_SOLO')]);
echo json_encode(['ok' => 1]);`, {TX_SOLO: SOLO, TX_SOLO_DATA: JSON.stringify({zones: [{id: 'za', x: 40, y: 40, w: 500, h: 40, s: 0, e: 38}], people: [{name: 'Paul VERNIAL', role: 'enfant', person_id: 1, s: 47, e: 59}], status: 'doing'})});
    if (seed.status !== 0 || !/"ok"/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const soloBefore = php(String.raw`require 'lib/bootstrap.php'; $pdo = db(); echo json_encode($pdo->query('SELECT title,kind,media_id,body,data_json FROM act_transcriptions WHERE id=1')->fetch(PDO::FETCH_ASSOC));`).stdout;

    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
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
            await p.waitForSelector('#lightbox-pages [data-mp-add]', {timeout: 10000});
            await p.click('#lightbox-pages [data-mp-add]'); await p.waitForSelector('dialog.mpk-dialog[open] .mpk-tile'); await sleep(300);
            await p.locator('dialog.mpk-dialog[open] .mpk-tile', {hasText: 'Naissance de Paul'}).first().click(); await p.click('dialog.mpk-dialog[open] [data-mp="ok"]');
            await p.waitForFunction(() => document.querySelectorAll('#lightbox-pages [data-mp-id]').length === 2, null, {timeout: 10000});
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

        /*@@ETAPE2@@*/

        await t('un acte d’une seule page est resté exactement comme avant', async () => {
            const now = php(String.raw`require 'lib/bootstrap.php'; $pdo = db(); echo json_encode($pdo->query('SELECT title,kind,media_id,body,data_json FROM act_transcriptions WHERE id=1')->fetch(PDO::FETCH_ASSOC));`).stdout;
            assert.equal(now, soloBefore);
        });
        await t('la migration 104 est rejouable (rien ne change, rien n’est perdu)', async () => {
            const r = php(String.raw`require 'lib/bootstrap.php'; $pdo = db(); $before = $pdo->query('SELECT media_id,set_id,position,label FROM media_pages ORDER BY media_id')->fetchAll(PDO::FETCH_ASSOC);
                schema_v104($pdo); schema_v104($pdo); $after = $pdo->query('SELECT media_id,set_id,position,label FROM media_pages ORDER BY media_id')->fetchAll(PDO::FETCH_ASSOC);
                echo json_encode(['same' => $before === $after, 'n' => count($after), 'v' => (int) $pdo->query('PRAGMA user_version')->fetchColumn(), 'want' => SCHEMA_VERSION]);`);
            const j = JSON.parse(r.stdout || '{}'); assert.equal(j.same, true, r.stderr); assert.equal(j.n, 4); assert.equal(j.want, 104); assert.equal(j.v, 104);
        });
        await t('aucune erreur JavaScript', async () => { assert.deepEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill();
        fs.rmSync(tmp, {recursive: true, force: true});
    }
    console.log(fails ? `${fails} essai(s) en échec` : 'Les documents en plusieurs pages marchent.');
    process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
