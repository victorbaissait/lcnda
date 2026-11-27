#!/usr/bin/env node
/* 🕵️ Enquêtes : 📎 pièces jointes d'une « 🚫 Recherche sans résultat » (assets/js/app-enquetes.js, lib/enquetes_plus.php).
 *  Serveur : images reliées (table investigation_negative_media) et dossier (folder_path) gardés, une ancienne fenêtre ne les efface pas,
 *    supprimer la recherche garde les médias dans l'app, ↶ remet aussi les liens et le dossier.
 *  Écran : « ＋ Images… » (fichiers de l'ordinateur → médias de l'app), vignettes, × + ↶, gardé après rechargement, « 📎 N » dans la liste
 *    (ouvre la visionneuse), modifier une recherche existante, « 📁 Un dossier… » caché dans le navigateur et visible avec le pont de
 *    l'app de bureau (simulé), consultation : on voit, on n'ajoute pas.
 *   node tests/test-enquetes-negatives-pieces.js */
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

(async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-enq-pj-'));
    fs.mkdirSync(path.join(tmp, 'media'));
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    fs.writeFileSync(path.join(tmp, 'media', 'registre.png'), png);
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4'};
    const php = code => { const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', `require 'lib/paths.php'; require 'lib/bootstrap.php'; $pdo = db(); ${code}`], {cwd: root, encoding: 'utf8', env}); if (r.status !== 0) throw new Error(r.stderr || r.stdout); return r.stdout.trim(); };
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$per = function ($f, $l, $g) use ($pdo) { $pdo->prepare("INSERT INTO persons(first_name,last_name,gender,living_status) VALUES(?,?,?,'deceased')")->execute([$f, $l, $g]); return (int) $pdo->lastInsertId(); };
$ids = ['pierre' => $per('Pierre', 'MAZAUD', 'male'), 'marie' => $per('Marie', 'LACOMBE', 'female'), 'jean' => $per('Jean', 'DURAND', 'male')];
$pdo->prepare("INSERT INTO investigations(person_id,title,question,status) VALUES(?,?,?,'open')")->execute([$ids['pierre'], 'La naissance de Pierre MAZAUD', 'Où Pierre est-il né ?']); $inv = (int) $pdo->lastInsertId();
$pdo->prepare("INSERT INTO media(title,filename,media_type) VALUES('Registre de Naves','registre.png','image')")->execute(); $mid = (int) $pdo->lastInsertId();
echo json_encode($ids + ['inv' => $inv, 'media' => $mid]);`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0 || !/pierre/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const ID = JSON.parse(seed.stdout.trim().split('\n').pop());
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
        const boot = async () => { await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_PARTS?.renderInvestigations && window.LCNDA_APP?.importMediaFile, null, {timeout: 30000}); };
        await boot();
        const api = (x, q = {}) => p.evaluate(([y, z]) => window.LCNDA_APP.api(y, z).catch(e => ({error: e.message})), [x, q]);
        const post = (a, b) => p.evaluate(async ([x, y]) => { try { const r = await window.LCNDA_APP.api(x, {}, {method: 'POST', body: y}); return r.result ?? r; } catch (e) { return {error: e.message}; } }, [a, b]);
        const toastUndo = async re => { await p.waitForFunction(r => [...document.querySelectorAll('.ui-toast')].some(x => new RegExp(r).test(x.textContent) && x.querySelector('button')), re, {timeout: 10000});
            await p.evaluate(r => [...document.querySelectorAll('.ui-toast')].reverse().find(x => new RegExp(r).test(x.textContent) && x.querySelector('button')).querySelector('button').click(), re); await sleep(600); };
        const openInv = async id => { await p.evaluate(i => { const A = window.LCNDA_APP; A.state.enquetesTab = 'enquetes'; A.state.currentInvestigationId = i; A.state.investigationFolderId = 0; A.setModule('enquetes'); }, id); await p.waitForSelector('.investigation-detail', {timeout: 20000}); await sleep(300); };
        const detail = () => api('enquetes_plus', {op: 'detail', id: ID.inv});
        const thumbs = () => p.$$eval('.enq-neg-dialog [data-enq-neg-thumb]', l => l.length);
        const closeLightbox = () => p.evaluate(() => { const lb = document.getElementById('lightbox'); if (lb?.open) lb.close(); });

        /* ═════════ Serveur ═════════ */
        await t('serveur : images et dossier reliés, gardés sans media_ids, suppression (médias gardés) + ↶ remet les liens', async () => {
            const a = await post('enquetes_plus', {op: 'save_negative', investigation_id: ID.inv, repository: 'AD de la Corrèze', cote: '4 E 272/12', year_from: 1830, year_to: 1840, media_ids: [ID.media, 999999], folder_path: '/home/x/Archives MAZAUD'});
            assert.ok(a.id, JSON.stringify(a));
            let n = (await detail()).negatives.find(x => x.id === a.id);
            assert.deepStrictEqual(n.media.map(m => m.id), [ID.media], 'seul un média existant est relié');
            assert.strictEqual(n.media[0].filename, 'registre.png'); assert.strictEqual(n.folder_path, '/home/x/Archives MAZAUD');
            await post('enquetes_plus', {op: 'save_negative', investigation_id: ID.inv, id: a.id, repository: 'AD de la Corrèze', cote: '4 E 272/12 bis'});
            n = (await detail()).negatives.find(x => x.id === a.id);
            assert.strictEqual(n.media.length, 1, 'une fenêtre qui n’envoie pas les pièces ne les efface pas'); assert.strictEqual(n.folder_path, '/home/x/Archives MAZAUD');
            const d = await post('enquetes_plus', {op: 'delete_negative', id: a.id});
            assert.deepStrictEqual(d.row.media_ids, [ID.media]);
            assert.strictEqual(php(`echo $pdo->query("SELECT count(*) FROM investigation_negative_media WHERE negative_id=${a.id}")->fetchColumn();`), '0', 'le lien part');
            assert.strictEqual(php(`echo $pdo->query("SELECT count(*) FROM media WHERE id=${ID.media}")->fetchColumn();`), '1', 'le média reste dans l’app');
            await post('enquetes_plus', {op: 'restore_negative', row: d.row});
            n = (await detail()).negatives.find(x => x.id === a.id);
            assert.ok(n, 'remise'); assert.deepStrictEqual(n.media.map(m => m.id), [ID.media], '↶ remet les images'); assert.strictEqual(n.folder_path, '/home/x/Archives MAZAUD', '↶ remet le dossier');
            await post('enquetes_plus', {op: 'delete_negative', id: a.id});
        });

        /* ═════════ Écran ═════════ */
        // deux petites images différentes, faites par le navigateur
        const pngs = await p.evaluate(() => ['#a04020', '#2050a0'].map(c => { const cv = document.createElement('canvas'); cv.width = 24; cv.height = 18; const g = cv.getContext('2d'); g.fillStyle = c; g.fillRect(0, 0, 24, 18); return cv.toDataURL('image/png').split(',')[1]; }));
        const files = [{name: 'Naves 1832.png', mimeType: 'image/png', buffer: Buffer.from(pngs[0], 'base64')}, {name: 'Naves 1833.png', mimeType: 'image/png', buffer: Buffer.from(pngs[1], 'base64')}];

        await t('📎 « ＋ Images… » : importées dans les médias, vignettes, × + ↶, « 📁 » caché dans le navigateur', async () => {
            await openInv(ID.inv);
            await p.click('[data-enq-neg-add]'); await p.waitForSelector('.enq-neg-dialog[open]');
            assert.match(await p.textContent('.enq-neg-dialog [data-enq-neg-att]'), /Pièces jointes/);
            assert.ok(await p.isVisible('.enq-neg-dialog [data-enq-neg-img]'), '« ＋ Images… »');
            assert.ok(await p.$('.enq-neg-dialog [data-enq-neg-pick]'), 'images déjà dans l’app');
            assert.strictEqual(await p.$('.enq-neg-dialog [data-enq-neg-dir]'), null, '📁 caché dans le navigateur');
            await p.fill('.enq-neg-dialog [name=repository]', 'AD de la Corrèze, Naves');
            await p.fill('.enq-neg-dialog [name=cote]', '3 E 145/9');
            const before = Number(php('echo $pdo->query("SELECT count(*) FROM media")->fetchColumn();'));
            await p.setInputFiles('.enq-neg-dialog [data-enq-neg-file]', files);
            await p.waitForFunction(() => document.querySelectorAll('.enq-neg-dialog [data-enq-neg-thumb]').length === 2, null, {timeout: 15000});
            assert.strictEqual(Number(php('echo $pdo->query("SELECT count(*) FROM media")->fetchColumn();')), before + 2, 'deux médias de plus dans l’app');
            assert.ok(await p.$$eval('.enq-neg-dialog .enq-neg-thumb img', l => l.every(i => /^media\//.test(i.getAttribute('src')))));
            await p.click('.enq-neg-dialog [data-enq-neg-tx="0"]');
            assert.strictEqual(await thumbs(), 1, '× retire la vignette');
            await toastUndo('Image retirée');
            assert.strictEqual(await thumbs(), 2, '↶ la remet');
            await p.click('.enq-neg-dialog [data-enq-neg-go]');
            await p.waitForSelector('.enq-neg-table [data-enq-neg-view]', {timeout: 10000});
            assert.match(await p.textContent('.enq-neg-table [data-enq-neg-view]'), /📎 2/);
            assert.ok(await p.$('.enq-neg-table [data-enq-neg-view] img'), 'petite vignette dans la liste');
        });
        await t('📎 gardé après rechargement ; « 📎 2 » ouvre la visionneuse ; modifier la recherche garde ses images', async () => {
            await boot(); await openInv(ID.inv);
            await p.waitForSelector('.enq-neg-table [data-enq-neg-view]');
            assert.match(await p.textContent('.enq-neg-table [data-enq-neg-view]'), /📎 2/);
            await p.click('.enq-neg-table [data-enq-neg-view]');
            await p.waitForFunction(() => document.getElementById('lightbox')?.open, null, {timeout: 10000});
            assert.strictEqual(await p.evaluate(() => window.LCNDA_APP.state.lightboxMedia.length), 2, 'les deux images dans la visionneuse');
            await closeLightbox(); await sleep(200);
            const row = await p.$('.enq-neg-table tbody tr:has([data-enq-neg-view])');
            await (await row.$('[data-enq-neg-menu]')).click(); await p.waitForSelector('.ui-actmenu');
            await p.evaluate(() => [...document.querySelectorAll('.ui-actmenu .ui-actmenu-i')].find(x => /Modifier/.test(x.textContent)).click());
            await p.waitForSelector('.enq-neg-dialog[open]');
            assert.strictEqual(await thumbs(), 2, 'les vignettes en modifiant');
            await p.click('.enq-neg-dialog [data-enq-neg-tx="1"]'); assert.strictEqual(await thumbs(), 1);
            await p.click('.enq-neg-dialog [data-enq-neg-go]');
            await p.waitForFunction(() => /📎 1/.test(document.querySelector('.enq-neg-table [data-enq-neg-view]')?.textContent || ''), null, {timeout: 10000});
            const n = (await detail()).negatives.find(x => x.cote === '3 E 145/9');
            assert.strictEqual(n.media.length, 1, 'gardé sur le serveur');
            assert.strictEqual(Number(php('echo $pdo->query("SELECT count(*) FROM media WHERE title LIKE \'Naves 183%\'")->fetchColumn();')), 2, 'l’image retirée reste dans les médias de l’app');
        });
        await t('📁 avec l’app de bureau (pont simulé) : « Un dossier… », le chemin seulement, un clic l’ouvre', async () => {
            await p.evaluate(() => { window.__opened = []; window.lcnda = {chooseFolder: async () => ({dir: '/home/x/Archives LACOMBE', name: 'Archives LACOMBE'}), openFolder: async d => { window.__opened.push(d); return {ok: true}; }}; });
            await openInv(ID.inv);
            await p.click('[data-enq-neg-add]'); await p.waitForSelector('.enq-neg-dialog[open]');
            assert.ok(await p.isVisible('.enq-neg-dialog [data-enq-neg-dir]'), '📁 visible dans l’app de bureau');
            await p.fill('.enq-neg-dialog [name=cote]', '5 MI 12');
            await p.click('.enq-neg-dialog [data-enq-neg-dir]');
            await p.waitForSelector('.enq-neg-dialog [data-enq-neg-dopen]');
            assert.match(await p.textContent('.enq-neg-dialog [data-enq-neg-dirline]'), /Archives LACOMBE/);
            await p.click('.enq-neg-dialog [data-enq-neg-go]');
            await p.waitForSelector('.enq-neg-table [data-enq-neg-dir-open]', {timeout: 10000});
            await p.click('.enq-neg-table [data-enq-neg-dir-open]'); await sleep(200);
            assert.deepStrictEqual(await p.evaluate(() => window.__opened), ['/home/x/Archives LACOMBE']);
            assert.strictEqual((await detail()).negatives.find(x => x.cote === '5 MI 12').folder_path, '/home/x/Archives LACOMBE');
            await p.evaluate(() => { delete window.lcnda; }); await openInv(ID.inv);
            assert.strictEqual(await p.$('.enq-neg-table [data-enq-neg-dir-open]'), null, 'dans le navigateur : pas de bouton qui ouvre');
            assert.match(await p.textContent('.enq-neg-table'), /📁 Archives LACOMBE/, 'mais le dossier est noté');
        });
        await t('🔒 consultation : on voit « 📎 » et la visionneuse, on n’ajoute rien', async () => {
            await p.evaluate(() => { document.body.classList.add('is-kiosk'); window.lcnda = {chooseFolder: async () => ({canceled: true}), openFolder: async () => ({ok: true})}; });
            await openInv(ID.inv);
            assert.strictEqual(await p.$('[data-enq-neg-add]'), null); assert.strictEqual(await p.$('[data-enq-neg-menu]'), null);
            assert.strictEqual(await p.$('.enq-neg-table [data-enq-neg-dir-open]'), null, 'pas d’ouverture de dossier en consultation');
            await p.click('.enq-neg-table [data-enq-neg-view]');
            await p.waitForFunction(() => document.getElementById('lightbox')?.open, null, {timeout: 10000});
            assert.strictEqual(await p.evaluate(() => document.getElementById('lightbox').dataset.readonly), '1', 'visionneuse en lecture seule');
            await closeLightbox();
            await p.evaluate(() => { document.body.classList.remove('is-kiosk'); delete window.lcnda; });
        });
        await t('🚫 supprimer la recherche : ses images restent dans l’app, ↶ remet « 📎 »', async () => {
            await openInv(ID.inv);
            const row = await p.$('.enq-neg-table tbody tr:has([data-enq-neg-view])');
            await (await row.$('[data-enq-neg-menu]')).click(); await p.waitForSelector('.ui-actmenu');
            await p.evaluate(() => [...document.querySelectorAll('.ui-actmenu .ui-actmenu-i')].find(x => /Supprimer/.test(x.textContent)).click());
            await p.waitForFunction(() => !document.querySelector('.enq-neg-table [data-enq-neg-view]'), null, {timeout: 10000});
            assert.strictEqual(Number(php('echo $pdo->query("SELECT count(*) FROM media WHERE title LIKE \'Naves 183%\'")->fetchColumn();')), 2);
            await toastUndo('sans résultat supprimée');
            await p.waitForFunction(() => /📎 1/.test(document.querySelector('.enq-neg-table [data-enq-neg-view]')?.textContent || ''), null, {timeout: 10000});
        });
        assert.deepStrictEqual(errs, [], 'erreurs JS : ' + errs.join(' | '));
    } catch (e) { fails++; console.log('✗ ' + (e.stack || e)); }
    finally { await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true}); }
    console.log(fails ? `${fails} échec(s)` : 'tout est bon'); process.exit(fails ? 1 : 0);
})();
