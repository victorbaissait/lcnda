#!/usr/bin/env node
/* 🕵️ Enquêtes : 🎨 la couleur et l'icône d'un dossier de pièces (assets/js/app-enquetes.js askFolder, api.php
 *  save_investigation_media_folder + investigation_folder_style, migration 112, lib/enquetes_plus.php restore_folder).
 *  Serveur : couleur et icône gardées à la création, un simple renommage n'y touche pas, couleur invalide → aucune, « 📁 » → par défaut,
 *    supprimer puis ↶ remet la couleur et l'icône.
 *  Écran : « ＋ Nouveau dossier » (nom, « 🎨 Couleur et icône » replié, 📁 sans couleur par défaut), ⋯ → « Couleur… » (pastille de l'app)
 *    et « Icône… » (la grille d'icônes) avec ↶, la couleur et l'icône sur la carte, dans l'arborescence et dans « Déplacer vers ».
 *   node tests/test-enquetes-dossiers-style.js */
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
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-enq-fstyle-'));
    fs.mkdirSync(path.join(tmp, 'media'));
    fs.writeFileSync(path.join(tmp, 'media', 'acte.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4'};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->prepare("INSERT INTO persons(first_name,last_name,gender,living_status) VALUES('Pierre','MAZAUD','male','deceased')")->execute(); $pid = (int) $pdo->lastInsertId();
$pdo->prepare("INSERT INTO persons(first_name,last_name,gender,living_status) VALUES('Marie','LACOMBE','female','deceased')")->execute();
$pdo->prepare("INSERT INTO investigations(person_id,title,question,status) VALUES(?,?,?,'open')")->execute([$pid, 'Le mariage MAZAUD — LACOMBE', 'Où se sont-ils mariés ?']); $inv = (int) $pdo->lastInsertId();
$pdo->prepare("INSERT INTO media(title,filename,media_type) VALUES('Acte DURAND','acte.png','image')")->execute(); $mid = (int) $pdo->lastInsertId();
$pdo->prepare("INSERT INTO investigation_media(investigation_id,media_id,verdict,reason) VALUES(?,?,'interesting','la date')")->execute([$inv, $mid]);
$cols = array_column($pdo->query('PRAGMA table_info(investigation_media_folders)')->fetchAll(PDO::FETCH_ASSOC), 'name');
echo json_encode(['inv' => $inv, 'media' => $mid, 'cols' => $cols, 'version' => (int) $pdo->query('PRAGMA user_version')->fetchColumn()]);`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0 || !/"inv"/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const ID = JSON.parse(seed.stdout.trim().split('\n').pop());
    await t('migration 112 : investigation_media_folders.color et .icon ; structure à jour', async () => {
        assert.ok(ID.cols.includes('color') && ID.cols.includes('icon'), ID.cols.join(','));
        assert.strictEqual(ID.version, Number(fs.readFileSync(path.join(root, 'lib/migrations.php'), 'utf8').match(/const SCHEMA_VERSION = (\d+);/)[1]));
    });
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
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_PARTS?.renderInvestigations && window.LCNDA_UI?.iconPicker && window.LCNDA_EXT?.openDialog, null, {timeout: 30000});
        const api = (x, q = {}) => p.evaluate(([y, z]) => window.LCNDA_APP.api(y, z).catch(e => ({error: e.message})), [x, q]);
        const post = (a, b) => p.evaluate(async ([x, y]) => { try { const r = await window.LCNDA_APP.api(x, {}, {method: 'POST', body: y}); return r.result ?? r; } catch (e) { return {error: e.message}; } }, [a, b]);
        const folders = async () => (await api('investigation', {id: ID.inv})).folders;
        const folder = async id => (await folders()).find(f => Number(f.id) === Number(id));
        const toastUndo = async re => { await p.waitForFunction(r => [...document.querySelectorAll('.ui-toast')].some(x => new RegExp(r).test(x.textContent) && x.querySelector('button')), re, {timeout: 10000});
            await p.evaluate(r => [...document.querySelectorAll('.ui-toast')].reverse().find(x => new RegExp(r).test(x.textContent) && x.querySelector('button')).querySelector('button').click(), re); await sleep(700); };
        const openInv = async () => { await p.evaluate(i => { const A = window.LCNDA_APP; A.state.enquetesTab = 'enquetes'; A.state.currentInvestigationId = i; A.state.investigationFolderId = 0; A.setModule('enquetes'); }, ID.inv); await p.waitForSelector('.investigation-detail', {timeout: 20000}); await sleep(300); };

        /* ═════════ Serveur ═════════ */
        await t('serveur : couleur et icône à la création, renommer seul n’y touche pas, couleur invalide → aucune, 📁 → par défaut, ↶ d’une suppression les remet', async () => {
            const a = await post('save_investigation_media_folder', {investigation_id: ID.inv, name: 'Actes MAZAUD', color: '#7A2A2A', icon: '⛪'});
            assert.ok(a.id, JSON.stringify(a));
            let f = await folder(a.id); assert.strictEqual(f.color, '#7a2a2a'); assert.strictEqual(f.icon, '⛪');
            await post('save_investigation_media_folder', {id: a.id, name: 'Actes MAZAUD (Naves)'});
            f = await folder(a.id); assert.strictEqual(f.name, 'Actes MAZAUD (Naves)'); assert.strictEqual(f.color, '#7a2a2a', 'renommer garde la couleur'); assert.strictEqual(f.icon, '⛪', 'et l’icône');
            await post('save_investigation_media_folder', {id: a.id, name: f.name, color: 'red;}body{x', icon: '📁'});
            f = await folder(a.id); assert.strictEqual(f.color, '', 'couleur invalide → aucune'); assert.strictEqual(f.icon, '', '📁 = l’icône par défaut');
            await post('save_investigation_media_folder', {id: a.id, name: f.name, color: '#2f6b3a', icon: '🕯️'});
            await post('delete_investigation_media_folder', {id: a.id});
            assert.ok(!(await folder(a.id)), 'supprimé');
            await post('enquetes_plus', {op: 'restore_folder', folder: {id: a.id, investigation_id: ID.inv, parent_id: 0, name: 'Actes MAZAUD (Naves)', color: '#2f6b3a', icon: '🕯️'}, media_links: [], children: []});
            f = await folder(a.id); assert.ok(f, 'remis'); assert.strictEqual(f.color, '#2f6b3a', '↶ remet la couleur'); assert.strictEqual(f.icon, '🕯️', '↶ remet l’icône');
            await post('delete_investigation_media_folder', {id: a.id});
        });

        /* ═════════ Écran ═════════ */
        let fid = 0;
        await t('« ＋ Nouveau dossier » : le nom, « 🎨 Couleur et icône » replié, 📁 sans couleur par défaut', async () => {
            await openInv();
            await p.click('#new-investigation-folder');
            const dlg = p.locator('dialog[open]').filter({hasText: 'Nouveau dossier'}).last();
            await dlg.waitFor({timeout: 5000});
            assert.ok(await dlg.locator('.inv-fstyle').count(), 'la ligne « Couleur et icône »');
            assert.strictEqual(await dlg.locator('.inv-fstyle').evaluate(d => d.open), false, 'repliée');
            assert.match(await dlg.locator('button[type=submit]').innerText(), /Créer le dossier/);
            assert.strictEqual(await dlg.locator('input[name=icon]').inputValue(), '📁');
            await dlg.locator('input[name=name]').fill('Lettres LACOMBE');
            await dlg.locator('button[type=submit]').click();
            await p.waitForSelector('.investigation-folder', {timeout: 8000});
            const f = (await folders()).find(x => x.name === 'Lettres LACOMBE'); assert.ok(f); fid = Number(f.id);
            assert.strictEqual(f.color, ''); assert.strictEqual(f.icon, '');
            assert.ok(await p.locator('.investigation-folder .investigation-folder-open svg').count(), 'le dessin 📁 d’origine');
            assert.strictEqual(await p.locator('.investigation-folder.has-color').count(), 0);
        });
        await t('⋯ → « Couleur… » : la couleur de l’app sur la carte et l’arborescence, ↶ l’enlève', async () => {
            await p.click(`[data-folder-more="${fid}"]`);
            await p.locator('[role=menuitem]', {hasText: 'Couleur…'}).click();
            await p.waitForSelector('.ui-colorbox .ui-sw-btn[data-c="#7a2a2a"]', {timeout: 5000});
            await p.click('.ui-colorbox .ui-sw-btn[data-c="#7a2a2a"]');
            await p.waitForSelector('.investigation-folder.has-color', {timeout: 8000});
            assert.strictEqual((await folder(fid)).color, '#7a2a2a');
            assert.match(await p.locator('.investigation-folder.has-color').getAttribute('style'), /--inv-fc:#7a2a2a/);
            assert.ok(await p.locator('.investigation-folder-tree-row.has-color').count(), 'dans l’arborescence aussi');
            await toastUndo('Couleur du dossier');
            assert.strictEqual((await folder(fid)).color, '', '↶');
            assert.strictEqual(await p.locator('.investigation-folder.has-color').count(), 0);
        });
        await t('⋯ → « Icône… » : la grille d’icônes, l’emoji remplace 📁 (carte, arborescence, « Déplacer vers »), ↶', async () => {
            await p.click(`[data-folder-more="${fid}"]`);
            await p.locator('[role=menuitem]', {hasText: 'Icône…'}).click();
            await p.waitForSelector('.ui-ig [data-ig-i]', {timeout: 5000});
            const v = await p.evaluate(() => { const tile = [...document.querySelectorAll('.ui-ig [data-ig-i]')].find(x => x.textContent.trim() && !x.textContent.includes('📁')); tile.click(); return tile.textContent.trim(); });
            await p.waitForSelector('.investigation-folder-emoji', {timeout: 8000});
            const icon = (await folder(fid)).icon; assert.ok(icon && icon !== '📁', icon); assert.ok(v.includes(icon), `${v} / ${icon}`);
            assert.strictEqual(await p.locator('.investigation-folder-emoji').innerText(), icon);
            assert.strictEqual((await p.locator(`.investigation-folder-tree-row[data-open-folder="${fid}"] .investigation-folder-tree-icon`).textContent()).trim(), icon);
            assert.ok((await p.locator(`[data-move-media] option[value="${fid}"]`).textContent()).startsWith(icon), 'dans « Déplacer vers »');
            await toastUndo('Icône du dossier');
            assert.strictEqual((await folder(fid)).icon, '');
            assert.strictEqual(await p.locator('.investigation-folder-emoji').count(), 0);
        });
        await t('✎ « Modifier le dossier » : nom, couleur et icône ensemble, la ligne dépliée quand le dossier a déjà un style', async () => {
            await post('save_investigation_media_folder', {id: fid, name: 'Lettres LACOMBE', color: '#055dff', icon: '✉️'});
            await openInv();
            await p.click(`[data-rename-folder="${fid}"]`);
            const dlg = p.locator('dialog[open]').filter({hasText: 'Modifier le dossier'}).last();
            await dlg.waitFor({timeout: 5000});
            assert.strictEqual(await dlg.locator('.inv-fstyle').evaluate(d => d.open), true, 'dépliée');
            assert.strictEqual(await dlg.locator('input[name=color]').inputValue(), '#055dff');
            await dlg.locator('input[name=name]').fill('Lettres LACOMBE — DURAND');
            await dlg.locator('button[type=submit]').click();
            await p.waitForFunction(() => /DURAND/.test(document.querySelector('.investigation-folder-open span')?.textContent || ''), null, {timeout: 8000});
            const f = await folder(fid); assert.strictEqual(f.color, '#055dff'); assert.strictEqual(f.icon, '✉️');
            await toastUndo('modifié');
            assert.strictEqual((await folder(fid)).name, 'Lettres LACOMBE');
        });
        await t('aucune erreur de page', async () => { assert.deepStrictEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill();
        fs.rmSync(tmp, {recursive: true, force: true});
    }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})();
