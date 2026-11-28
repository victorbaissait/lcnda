#!/usr/bin/env node
/* 🔤 La langue page par page (filtre « Langue : Latin », « Le texte semble en latin », « dont latin : p. … ») et 📇 les tables et index
 * (une page « Table ou index », son tableau → un index : chaque entrée mène à sa page ; page absente ou introuvable signalée).
 *   node tests/test-recueil-index.js */
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
const LATIN = 'Anno domini 1702 die vero 3 mensis martii baptizatus est Joannes filius legitimus Petri MAZAUD, patrinus fuit Ludovicus LACOMBE';

(async () => {
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-index-'));
    fs.mkdirSync(path.join(tmp, 'media'));
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4'};
    // 6 pages : f° 1 r° … f° 3 v° ; f° 2 v° absente ; la dernière (f° 3 v°) est la table : MAZAUD → f° 1 v°, DURAND → f° 2 v° (absente), LACOMBE → f° 9 (introuvable)
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start) VALUES(1,'Pierre','MAZAUD','male','deceased',1)");
foreach (range(1, 6) as $id) { $im = imagecreatetruecolor(80, 100); imagefill($im, 0, 0, imagecolorallocate($im, 230, 215, 180)); imagepng($im, MEDIA_DIR . "/m$id.png"); }
$m = $pdo->prepare("INSERT INTO media(id,title,filename,thumbnail,media_type) VALUES(?,?,?,?,'image')"); foreach (range(1, 6) as $id) { $m->execute([$id, "Vue $id", "m$id.png", "m$id.png"]); }
$r = save_recueil($pdo, ['title' => 'Registre de Sancoins', 'language' => 'Français', 'numbering' => 'folio']);
recueil_add_images($pdo, ['recueil_id' => $r['id'], 'version_id' => (int) $pdo->query('SELECT MAX(id) FROM recueil_versions')->fetchColumn(), 'mode' => 'new_pages', 'media_ids' => range(1, 6)]);
$ids = array_map('intval', $pdo->query('SELECT id FROM recueil_pages ORDER BY position')->fetchAll(PDO::FETCH_COLUMN));
foreach (['f° 1 r°', 'f° 1 v°', 'f° 2 r°', 'f° 2 v°', 'f° 3 r°', 'f° 3 v°'] as $i => $l) { save_recueil_page($pdo, ['id' => $ids[$i], 'label' => $l]); }
save_recueil_page($pdo, ['id' => $ids[2], 'transcription' => getenv('LATIN')]);
recueil_pages_set($pdo, ['recueil_id' => $r['id'], 'page_ids' => [$ids[3]], 'fields' => ['absent' => 'perdue']]);
save_recueil_page($pdo, ['id' => $ids[5], 'table' => ['cols' => [['id' => 'c1', 'name' => 'Nom'], ['id' => 'c2', 'name' => 'Année'], ['id' => 'c3', 'name' => 'Folio']],
    'rows' => [['id' => 'r1', 'c' => ['c1' => 'MAZAUD Jean', 'c2' => '1702', 'c3' => 'f° 1 v°']], ['id' => 'r2', 'c' => ['c1' => 'DURAND Anne', 'c2' => '1703', 'c3' => 'f° 2 v°']], ['id' => 'r3', 'c' => ['c1' => 'LACOMBE Louis', 'c2' => '1704', 'c3' => 'f° 9']]]]]);
echo json_encode(['ok' => 1, 'rid' => $r['id'], 'ids' => $ids]);`], {cwd: root, encoding: 'utf8', env: {...env, LATIN}});
    if (seed.status !== 0 || !/"ok"/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const {rid, ids} = JSON.parse(seed.stdout);
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const errs = [];
    try {
        const p = await (await browser.newContext({viewport: {width: 1440, height: 900}})).newPage();
        p.on('pageerror', e => errs.push(e.message));
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_EXT?.recueilIndex && window.LCNDA_APP?.state?.csrf, null, {timeout: 30000});
        const api = (x, q = {}) => p.evaluate(([y, z]) => window.LCNDA_APP.api(y, z).catch(e => ({error: e.message})), [x, q]);
        const post = (x, body) => p.evaluate(async ([y, z]) => { try { const r = await window.LCNDA_APP.api(y, {}, {method: 'POST', body: z}); return r.result || r; } catch (e) { return {error: e.message}; } }, [x, body]);
        const open = (tab, page = 0) => p.evaluate(([id, tb, pg]) => { const A = window.LCNDA_APP; A.state.hRecueil = {id, tab: tb, page: pg, view: 'grid', q: ''}; A.state.listType = 'recueils'; A.setModule('listes'); }, [rid, tab, page]);

        await t('côté serveur : la langue et la sorte d’une page, ↶ Annuler', async () => {
            const r = await post('recueil_pages_set', {recueil_id: rid, page_ids: [ids[5]], fields: {page_kind: 'table', language: 'Latin'}});
            const d = await api('recueil', {id: rid}); assert.deepEqual([d.pages[5].page_kind, d.pages[5].language, d.pages[0].language], ['table', 'Latin', '']);
            await post('recueil_pages_restore', {recueil_id: rid, before: r.before, gap_id: 0});
            assert.deepEqual([(await api('recueil', {id: rid})).pages[5].page_kind], ['']);
            assert.equal((await post('recueil_pages_set', {recueil_id: rid, page_ids: [ids[5]], fields: {page_kind: 'nimporte'}})).changed, 1);
            assert.equal((await api('recueil', {id: rid})).pages[5].page_kind, '', 'une sorte inconnue = ordinaire');
        });
        await t('🔤 sur la page : « Le texte semble en latin » → « Noter « Latin » » ; la langue du recueil par défaut', async () => {
            await open('pages', ids[2]); await p.waitForSelector('[data-rc-etat] [data-re-platin]', {timeout: 20000});
            assert.match(await p.evaluate(() => document.querySelector('[data-rc-etat]').textContent.replace(/\s+/g, ' ')), /🔤 Langue\s*comme le recueil : Français/);
            await p.click('[data-rc-etat] [data-re-platin]');
            await p.waitForFunction(() => /🔤 Langue\s*Latin/.test(document.querySelector('[data-rc-etat]')?.textContent.replace(/\s+/g, ' ') || ''), null, {timeout: 10000});
            assert.equal((await api('recueil', {id: rid})).pages[2].language, 'Latin');
            assert.ok(!(await p.evaluate(() => document.querySelector('[data-re-platin]'))), 'plus proposé une fois noté');
        });
        await t('🔤 onglet État : « Langue : Latin » estompe les autres pages ; « À relire : p. 3 · dont Latin : p. 3 » ; colonne Langue ; tableur', async () => {
            await open('etat'); await p.waitForSelector('[data-re-lang]', {timeout: 20000});
            await p.selectOption('[data-re-lang]', 'Latin'); await sleep(200);
            assert.deepEqual(await p.evaluate(() => [...document.querySelectorAll('.re-map .re-cell')].map(c => c.classList.contains('is-dim'))), [true, true, false, true, true, true]);
            assert.match(await p.evaluate(() => document.querySelector('.re-todo').textContent), /À relire : p\. 3 · 🔤 dont Latin : p\. 3/);
            await p.click('[data-re-view="list"]'); await sleep(200);
            assert.ok(await p.evaluate(() => [...document.querySelectorAll('.re-table th')].some(th => th.textContent === 'Langue')));
            await p.click('[data-re-view="cases"]');
        });
        await t('📇 marquer la page « Table ou index » (choisir des pages → ⋯ Plus) : 📇 sur sa case', async () => {
            await p.click('[data-re-pick]'); await p.click(`.re-map [data-re-page="${ids[5]}"]`);
            await p.click('[data-re-act="more"]'); await p.locator('.ui-actmenu [role=menuitem]').filter({hasText: 'Table ou index'}).click();
            await p.waitForFunction(i => document.querySelector(`.re-map [data-re-page="${i}"] .re-k-tab`), ids[5], {timeout: 10000});
            assert.equal((await api('recueil', {id: rid})).pages[5].page_kind, 'table');
        });
        await t('📇 onglet Sommaire : l’index des tables — renvoi trouvé (lien), page absente, introuvable ; chercher ; un clic ouvre la page', async () => {
            await open('sommaire'); await p.waitForSelector('[data-ri-host] .ri-list li', {timeout: 20000});
            const s = await p.evaluate(() => ({sum: document.querySelector('.ri-sum').textContent, li: [...document.querySelectorAll('.ri-list li')].map(li => li.className + ' ' + li.textContent.replace(/\s+/g, ' ').trim())}));
            assert.match(s.sum, /1 renvois trouvés · 1 vers des pages absentes · 1 introuvables/);
            assert.match(s.li[0], /^is-ok MAZAUD Jean · 1702\s*→ f° 1 v°/); assert.match(s.li[1], /^is-absent DURAND Anne · 1703\s*⛔ f° 2 v° : page absente/); assert.match(s.li[2], /^is-missing LACOMBE Louis · 1704\s*❔ pas de page « f° 9 »/);
            await p.fill('[data-ri-q]', 'durand'); await sleep(500); assert.equal(await p.evaluate(() => document.querySelectorAll('.ri-list li').length), 1);
            await p.fill('[data-ri-q]', ''); await sleep(500);
            await p.selectOption('[data-ri-only]', 'missing'); await sleep(200); assert.equal(await p.evaluate(() => document.querySelectorAll('.ri-list li').length), 1);
            await p.selectOption('[data-ri-only]', ''); await sleep(200);
            await p.locator('[data-ri-go]').first().click();
            await p.waitForFunction(i => window.LCNDA_APP.state.hRecueil.page === i, ids[1], {timeout: 10000});
        });
        await t('📇 une table sans tableau : le dire et proposer d’ouvrir la page ; un renvoi « 12 » sans noms de pages = la 12ᵉ page', async () => {
            const D = {pages: [{id: 1, num: 1, label: ''}, {id: 2, num: 2, label: ''}, {id: 3, num: 3, label: ''}]};
            assert.equal(await p.evaluate(d => window.LCNDA_EXT.recueilIndex.findPage(d, '3')?.id, D), 3);
            assert.equal(await p.evaluate(d => window.LCNDA_EXT.recueilIndex.findPage(d, 'p. 2')?.id, D), 2);
            await post('recueil_pages_set', {recueil_id: rid, page_ids: [ids[4]], fields: {page_kind: 'table'}});
            await open('sommaire'); await p.waitForSelector('[data-ri-host] .re-msg', {timeout: 20000});
            assert.match(await p.evaluate(() => document.querySelector('[data-ri-host] .re-msg').textContent), /« f° 3 r° » est une table, mais son tableau est vide/);
        });
        await t('aucune erreur JavaScript', async () => { assert.deepStrictEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true});
    }
    console.log(fails ? `${fails} essai(s) en échec` : 'La langue des pages et les tables des recueils marchent.');
    process.exit(fails ? 1 : 0);
})();
