#!/usr/bin/env node
/* 🔗 Documents liés (maquette docs/design/documents-lies-recueils.html, partie 1) : deux documents différents reliés pour une raison,
 * le lien dans les deux sens, « En commun » et « Ce que ce document t'apprend » depuis les transcriptions, ↶ Annuler, la visionneuse,
 * le mode consultation, et côté serveur (lien à soi-même, document inconnu, migration 105 rejouable, document supprimé).
 *   node tests/test-documents-lies.js */
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
const TA = 'Par-devant nous, juge de paix du canton de Sancoins, ont comparu Louis LACOMBE et Jean DURAND,\nqui attestent que Pierre MAZAUD, soldat au 152e régiment de ligne,\na été fait prisonnier à la bataille d’Ulm en 1805.';
const TB = 'Par-devant nous, juge de paix, a comparu Louis LACOMBE, qui atteste que Jean DURAND,\nsoldat au 152e régiment de ligne, blessé à la bataille d’Ulm en 1805,\na été conduit en Bohême puis libéré à Prague en 1814.';

(async () => {
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-liens-'));
    fs.mkdirSync(path.join(tmp, 'media'));
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4'};
    const php = code => spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], {cwd: root, encoding: 'utf8', env});
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start) VALUES(1,'Pierre','MAZAUD','male','deceased',1)");
foreach ([1 => 'a.png', 2 => 'b.png', 3 => 'c.png', 4 => 'd.png'] as $id => $f) { $im = imagecreatetruecolor(300, 200); imagefill($im, 0, 0, imagecolorallocate($im, 230, 215, 180)); imagepng($im, MEDIA_DIR . '/' . $f); }
$m = $pdo->prepare("INSERT INTO media(id,title,filename,thumbnail,media_type,transcription) VALUES(?,?,?,?,'image',?)");
$m->execute([1, 'Notoriété de Pierre MAZAUD', 'a.png', 'a.png', getenv('TA')]); $m->execute([2, 'Notoriété de Jean DURAND', 'b.png', 'b.png', getenv('TB')]);
$m->execute([3, 'Lettre du capitaine', 'c.png', 'c.png', '']); $m->execute([4, 'Photo à supprimer', 'd.png', 'd.png', '']);
echo json_encode(['ok' => 1]);`], {cwd: root, encoding: 'utf8', env: {...env, TA, TB}});
    if (seed.status !== 0 || !/"ok"/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const errs = [];
    try {
        const p = await (await browser.newContext({viewport: {width: 1440, height: 900}})).newPage();
        p.on('pageerror', e => errs.push(e.message));
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_EXT?.docLinks && window.LCNDA_EXT?.onglets?.documents && window.LCNDA_APP?.state?.csrf, null, {timeout: 30000});
        const api = (a, q = {}) => p.evaluate(([x, y]) => window.LCNDA_APP.api(x, y), [a, q]);
        const post = (a, b) => p.evaluate(async ([x, y]) => { try { const r = await window.LCNDA_APP.api(x, {}, {method: 'POST', body: y}); return r.result || r; } catch (e) { return {error: e.message}; } }, [a, b]);

        await t('lier deux documents : le lien se voit des deux côtés, avec sa raison', async () => {
            const r = await post('doc_link_save', {media_id: 1, other_id: 2, reason: 'regiment'});
            assert.deepEqual(r.items.map(x => [x.media_id, x.reason]), [[2, 'regiment']]);
            const b = await api('doc_links', {media_id: 2});
            assert.deepEqual(b.items.map(x => [x.media_id, x.reason, x.title]), [[1, 'regiment', 'Notoriété de Pierre MAZAUD']]); assert.match(b.text, /Bohême/);
            const again = await post('doc_link_save', {media_id: 2, other_id: 1, reason: 'affaire'});
            assert.equal(again.items.length, 1, 'une seule ligne par paire'); assert.equal(again.items[0].reason, 'affaire');
            await post('doc_link_save', {media_id: 1, other_id: 2, reason: 'regiment'});
        });
        await t('« En commun » et « Ce que ce document t’apprend » : depuis les deux transcriptions', async () => {
            const c = await p.evaluate(([a, b]) => window.LCNDA_EXT.docLinks.compare(a, b), [TA, TB]);
            const common = c.common.map(x => x.label.toLowerCase());
            assert.ok(common.some(x => /152e régiment de ligne/.test(x)), 'le régiment : ' + common);
            assert.ok(common.some(x => /bataille d’ulm/.test(x)), 'la bataille'); assert.ok(common.includes('1805')); assert.ok(common.some(x => /lacombe/.test(x)), 'le témoin');
            const learn = c.learn.map(x => x.label);
            assert.ok(learn.some(x => /Bohême/.test(x)) && learn.some(x => /Prague/.test(x)) && learn.includes('1814'), 'ce que l’autre apprend : ' + learn);
            assert.ok(c.learn.every(x => x.line >= 1 && x.quote), 'chaque information dit sa ligne et le passage');
        });
        await t('la page du document : « 🔗 Documents liés », la raison, « En commun », « 💡 Ce que ce document t’apprend »', async () => {
            await p.evaluate(() => { localStorage.setItem('genealogie-menu-documents', '1'); localStorage.setItem('genealogie-menu-hidden', '[]'); location.hash = '#documents/1'; });
            await p.waitForSelector('#workspace [data-ong-links] .dl-item', {timeout: 20000});
            const s = await p.evaluate(() => { const b = document.querySelector('#workspace [data-ong-links]'); return {h: b.querySelector('h3').textContent, item: b.querySelector('.dl-item').textContent.replace(/\s+/g, ' '), learn: b.querySelector('.dl-learn summary')?.textContent}; });
            assert.match(s.h, /Documents liés\s*1/); assert.match(s.item, /Notoriété de Jean DURAND/); assert.match(s.item, /même régiment/); assert.match(s.item, /En commun :.*152e régiment de ligne/);
            assert.match(s.learn, /Ce que ce document t’apprend \(\d+\)/);
        });
        await t('« ＋ Lier un document… » : choisir le document, puis la raison ; ↶ Annuler défait le lien', async () => {
            await p.click('#workspace [data-ong-links] [data-dl-add]');
            await p.waitForSelector('dialog.mpk-dialog[open] .mpk-tile'); await sleep(300);
            await p.locator('dialog.mpk-dialog[open] .mpk-tile', {hasText: 'Lettre du capitaine'}).first().click(); await p.click('dialog.mpk-dialog[open] [data-mp="ok"]');
            await p.waitForSelector('.ui-actmenu .ui-actmenu-i'); await p.locator('.ui-actmenu .ui-actmenu-i', {hasText: 'même famille'}).click();
            await p.waitForFunction(() => document.querySelectorAll('#workspace [data-ong-links] .dl-item').length === 2, null, {timeout: 10000});
            assert.deepEqual((await api('doc_links', {media_id: 3})).items.map(x => [x.media_id, x.reason]), [[1, 'famille']]);
            await p.evaluate(() => { const tt = [...document.querySelectorAll('.ui-toast')].filter(x => /Documents liés/.test(x.textContent)).at(-1); [...tt.querySelectorAll('button')].find(b => /Annuler/.test(b.textContent)).click(); });
            await p.waitForFunction(() => document.querySelectorAll('#workspace [data-ong-links] .dl-item').length === 1, null, {timeout: 10000});
            assert.deepEqual((await api('doc_links', {media_id: 3})).items, []);
        });
        await t('⋯ → « Retirer le lien », puis ↶ Annuler le remet (même raison)', async () => {
            await p.click('#workspace [data-ong-links] [data-dl-more]'); await p.waitForSelector('.ui-actmenu .ui-actmenu-i');
            await p.locator('.ui-actmenu .ui-actmenu-i', {hasText: 'Retirer le lien'}).click();
            await p.waitForFunction(() => !document.querySelector('#workspace [data-ong-links] .dl-item'), null, {timeout: 10000});
            await p.evaluate(() => { const tt = [...document.querySelectorAll('.ui-toast')].filter(x => /Lien retiré/.test(x.textContent)).at(-1); [...tt.querySelectorAll('button')].find(b => /Annuler/.test(b.textContent)).click(); });
            await p.waitForFunction(() => document.querySelectorAll('#workspace [data-ong-links] .dl-item').length === 1, null, {timeout: 10000});
            assert.deepEqual((await api('doc_links', {media_id: 1})).items.map(x => [x.media_id, x.reason]), [[2, 'regiment']]);
        });
        await t('un clic sur le document lié l’ouvre ; la visionneuse montre aussi ses documents liés', async () => {
            await p.click('#workspace [data-ong-links] [data-dl-open="2"]');
            await p.waitForSelector('#workspace [data-ong-page="document"][data-ong-id="2"] [data-ong-links] .dl-item', {timeout: 15000});
            assert.match(await p.textContent('#workspace [data-ong-id="2"] [data-ong-links] .dl-item'), /Notoriété de Pierre MAZAUD/);
            await p.evaluate(() => window.LCNDA_APP.openLightbox([{id: 1, title: 'Notoriété de Pierre MAZAUD', filename: 'a.png', media_type: 'image'}], 0, false));
            await p.waitForSelector('#lightbox #lightbox-links .dl-item', {timeout: 15000});
            assert.match(await p.textContent('#lightbox #lightbox-links'), /Notoriété de Jean DURAND/);
            await p.evaluate(() => document.getElementById('lightbox').close()); await sleep(200);
        });
        await t('mode consultation : les liens se voient, rien ne se change', async () => {
            await p.evaluate(() => document.body.classList.add('is-kiosk'));
            await p.evaluate(() => { location.hash = '#documents/3'; }); await sleep(400); await p.evaluate(() => { location.hash = '#documents/1'; });
            await p.waitForSelector('#workspace [data-ong-id="1"] [data-ong-links] .dl-item', {timeout: 15000});
            assert.equal(await p.$('#workspace [data-ong-id="1"] [data-ong-links] [data-dl-add]'), null); assert.equal(await p.$('#workspace [data-ong-id="1"] [data-ong-links] [data-dl-more]'), null);
            await p.evaluate(() => document.body.classList.remove('is-kiosk'));
        });
        await t('côté serveur : pas de lien à soi-même, document inconnu refusé, raison inconnue → « autre »', async () => {
            assert.match((await post('doc_link_save', {media_id: 1, other_id: 1})).error || '', /lui-même/);
            assert.match((await post('doc_link_save', {media_id: 1, other_id: 999})).error || '', /introuvable/);
            const r = await post('doc_link_save', {media_id: 1, other_id: 4, reason: '<script>', note: 'x'.repeat(500)});
            const l = r.items.find(x => x.media_id === 4); assert.equal(l.reason, 'autre'); assert.equal(l.note.length, 200);
        });
        await t('un document supprimé : ses liens partent avec lui ; la migration 105 est rejouable', async () => {
            const del = await post('delete_media', {media_id: 4});
            assert.ok(!del.error, JSON.stringify(del));
            assert.equal(php(`require 'lib/bootstrap.php'; echo db()->query('SELECT count(*) FROM doc_links WHERE a=4 OR b=4')->fetchColumn();`).stdout, '0');
            const r = php(`require 'lib/bootstrap.php'; $p = db(); schema_v105($p); schema_v105($p); echo $p->query('SELECT count(*) FROM doc_links')->fetchColumn(), ' ', $p->query('PRAGMA user_version')->fetchColumn();`);
            assert.match(r.stdout, /^1 105$/, r.stdout + r.stderr);
        });
        await t('aucune erreur JavaScript', async () => { assert.deepStrictEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true});
    }
    console.log(fails ? `${fails} essai(s) en échec` : 'Les documents liés marchent.');
    process.exit(fails ? 1 : 0);
})();
