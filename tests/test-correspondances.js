#!/usr/bin/env node
/* ✉️ Correspondances et 🏷 sortes dans Documents (app-correspondances-core.js, heritage-onglets-documents.js, lib/onglets.php ; maquette docs/design/correspondances.html).
 *  1. calcul : les dates écrites, les correspondances (une par groupe de personnes), les pièces dans l'ordre, les trous, le délai des réponses ; la sorte de chaque document ;
 *  2. serveur : chaque document dit ses correspondants et la pièce à laquelle il répond ;
 *  3. écran : 6 façons de ranger en 3 × 2 (A, conseillé) ou 4 avec « 📚 Ensembles » (B, ⋯ → Réglages de Documents) ; « ✉️ Lettres » : le fil dans la colonne
 *     (trous signalés), les correspondances en vignettes, le fil à droite (délai, transcrites, ↩ répond à) ; « 🏷 Sortes » : les sortes, puis leurs documents.
 *   node tests/test-correspondances.js */
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
const C = require('../assets/js/app-correspondances-core.js');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
    await t('calcul : dates, correspondances, ordre, trous, délais ; sortes', async () => {
        assert.deepStrictEqual([C.dayOf('3 août 1914').precision, C.dayOf('1914-08-19').day - C.dayOf('3 août 1914').day, C.dayOf('août 1914').precision, C.dayOf('1914').precision, C.dayOf('')], ['day', 16, 'month', 'year', null]);
        const P = {id: 1, name: 'Pierre MAZAUD'}, M = {id: 0, name: 'Marie LACOMBE'};
        const docs = [{id: 3, title: 'Lettre de Pierre', corr: 'lettre', date_text: '14 décembre 1914', people: [P], corrs: [M]},
            {id: 1, title: 'Lettre de Pierre', corr: 'lettre', date_text: '3 août 1914', people: [P], corrs: [M], has_tr: 1},
            {id: 2, title: 'Carte de Marie', corr: 'carte postale', date_text: '19 août 1914', people: [P], corrs: [M], reply_to: 1},
            {id: 4, title: 'Lettre de Jean', corr: 'lettre', date_text: '1870', people: [{id: 2, name: 'Jean DURAND'}], corrs: []},
            {id: 5, title: 'Photo de mariage', media_type: 'image'}];
        const xs = C.exchanges(docs);
        assert.deepStrictEqual(xs.map(x => [x.title, x.pieces.map(p => p.id)]), [['Marie LACOMBE ⇄ Pierre MAZAUD', [1, 2, 3]], ['Jean DURAND', [4]]]);
        assert.deepStrictEqual([xs[0].gaps.length, xs[0].gaps[0].months, xs[0].avgDelay, xs[0].transcribed, xs[0].from, xs[0].to], [1, 4, 16, 1, 1914, 1914]);
        assert.deepStrictEqual(docs.map(C.sortOf), ['letter', 'letter', 'postcard', 'letter', 'photo']);
        assert.deepStrictEqual(['Faire-part de décès de Jean', 'Registre matricule de Pierre', 'Contrat de mariage', 'Coupure du journal', 'Plan cadastral'].map(t => C.sortOf({title: t, media_type: 'pdf'})), ['announce', 'military', 'notarial', 'press', 'map']);
    });
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-corr-'));
    fs.mkdirSync(path.join(tmp, 'media'));
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4'};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start) VALUES(1,'Pierre','MAZAUD','male','deceased',1)");
$m = $pdo->prepare("INSERT INTO media(id,title,filename,media_type,date_text,correspondence_type,correspondent_json,correspondence_reply_to_media_id,transcription) VALUES(?,?,?,?,?,?,?,?,?)");
$mm = json_encode([['id' => 0, 'name' => 'Marie LACOMBE']]);
$m->execute([1, 'Lettre de Pierre (août)', 'a.jpg', 'image', '3 août 1914', 'lettre', $mm, 0, 'Ma chère Marie']);
$m->execute([2, 'Carte de Marie', 'b.jpg', 'image', '19 août 1914', 'carte postale', $mm, 1, '']);
$m->execute([3, 'Lettre de Pierre (décembre)', 'c.jpg', 'image', '14 décembre 1914', 'lettre', $mm, 0, '']);
$m->execute([4, 'Photo de mariage', 'd.jpg', 'image', '1920', '', '', 0, '']);
$m->execute([5, 'Faire-part de décès de Pierre', 'e.pdf', 'pdf', '1950', '', '', 0, '']);
$m->execute([6, 'CPA Malvialle, l’église', 'f.jpg', 'image', '', '', '', 0, '']);
require_once 'lib/postcards.php'; postcards_ensure($pdo);
$pdo->exec("INSERT INTO postcards(media_id, publisher, card_number, sent_date) VALUES(2, 'ND Phot.', '142', '19 août 1914'), (6, 'ND Phot.', '144', '')");
foreach ([1, 2, 3, 4, 5, 6] as $i) { $pdo->exec("INSERT INTO media_links(media_id,entity_type,entity_id) VALUES($i,'person',1)"); }
echo json_encode(['ok' => 1]);`], {cwd: root, encoding: 'utf8', env});
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
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_CORRESP, null, {timeout: 30000});
        await t('serveur : correspondants et « répond à »', async () => {
            const r = await p.evaluate(() => window.LCNDA_APP.api('onglets', {op: 'documents'}));
            const d = id => r.documents.find(x => x.id === id);
            assert.deepStrictEqual(d(2).corrs, [{id: 0, name: 'Marie LACOMBE'}]); assert.strictEqual(d(2).reply_to, 1); assert.deepStrictEqual(d(4).corrs, []);
        });
        await p.evaluate(() => { localStorage.setItem('genealogie-menu-documents', '1'); localStorage.setItem('genealogie-menu-hidden', '[]'); location.hash = '#documents'; });
        await p.waitForSelector('#sidebar-content .ong-mode [data-ong-mode]', {timeout: 20000});
        const modes = () => p.evaluate(() => [...document.querySelectorAll('#sidebar-content .ong-modes [data-ong-mode]')].map(b => ({t: b.textContent.trim(), cut: b.scrollWidth > b.clientWidth + 1, top: Math.round(b.getBoundingClientRect().top)})));
        await t('A : 8 façons de ranger en 3 colonnes (📍 Lieux et 🕰 Années : audit des onglets §4), sans libellé coupé ; B (⋯ → Réglages) : 4 cases et « 📚 Ensembles », puis le petit choix', async () => {
            const r = await modes();
            assert.deepStrictEqual(r.map(x => x.t), ['A → Z', '👤 Personnes', '📚 Recueils', '📁 Dossiers', '✉️ Lettres', '🏷 Sortes', '📍 Lieux', '🕰 Années']);
            assert.ok(r.every(x => !x.cut), JSON.stringify(r)); assert.strictEqual(new Set(r.map(x => x.top)).size, 3);
            await p.evaluate(() => { const v = JSON.parse(localStorage.getItem('genealogie-documents-tab') || '{}'); localStorage.setItem('genealogie-documents-tab', JSON.stringify({...v, layout: 'B'})); window.LCNDA_APP.renderSidebar(); });
            await sleep(300);
            assert.deepStrictEqual((await modes()).map(x => x.t), ['A → Z', '👤 Par personne', '📚 Ensembles', '📁 Dossiers']);
            await p.click('#sidebar-content [data-ong-sets="1"]'); await sleep(300);
            assert.deepStrictEqual((await modes()).map(x => x.t).slice(4), ['📚 Recueils', '✉️ Lettres', '🏷 Sortes', '📍 Lieux', '🕰 Années'], 'le petit choix sous « Ensembles »');
            await p.evaluate(() => { const v = JSON.parse(localStorage.getItem('genealogie-documents-tab') || '{}'); localStorage.setItem('genealogie-documents-tab', JSON.stringify({...v, layout: 'A', mode: 'az'})); window.LCNDA_APP.renderSidebar(); });
            await sleep(300);
        });
        await t('✉️ Lettres : le fil dans la colonne (trou signalé) ; les correspondances en vignettes ; le fil à droite', async () => {
            await p.click('#sidebar-content [data-ong-mode="letters"]'); await p.waitForSelector('#sidebar-content [data-ong-ex]', {timeout: 10000});
            const col = await p.evaluate(() => document.querySelector('#sidebar-content .ong-list').textContent.replace(/\s+/g, ' '));
            assert.match(col, /✉️ Marie LACOMBE ⇄ Pierre MAZAUD\s*1914 · 3/); assert.match(col, /rien entre 19 août 1914 et 14 décembre 1914 \(4 mois\)/);
            const order = await p.evaluate(() => [...document.querySelectorAll('#sidebar-content .ong-list [data-ong-doc]')].map(b => Number(b.dataset.ongDoc)));
            assert.deepStrictEqual(order, [1, 2, 3]);
            await p.waitForSelector('#workspace [data-ong-excard]', {timeout: 10000});
            await p.click('#sidebar-content [data-ong-ex]'); await p.waitForSelector('#workspace .ong-fil', {timeout: 10000});
            const fil = await p.evaluate(() => document.querySelector('#workspace [data-ong-cards]').textContent.replace(/\s+/g, ' '));
            assert.match(fil, /Délai moyen de réponse\s*16 jours/); assert.match(fil, /1 \/ 3 \(33 %\)/); assert.match(fil, /↩ répond à « Lettre de Pierre \(août\) » · délai : 16 jours/); assert.match(fil, /4 mois sans pièce/);
            await p.click('#workspace [data-ong-exview="time"]'); await p.waitForSelector('#workspace .ong-time', {timeout: 5000});
            await p.click('#workspace [data-ong-wsex=""]'); await p.waitForSelector('#workspace [data-ong-excard]', {timeout: 5000});
        });
        await t('🏷 Sortes : les sortes dans la colonne et en vignettes ; une sorte → ses documents', async () => {
            await p.click('#sidebar-content [data-ong-mode="sorts"]'); await p.waitForSelector('#sidebar-content [data-ong-sorth]', {timeout: 10000});
            const h = await p.evaluate(() => [...document.querySelectorAll('#sidebar-content [data-ong-sorth]')].map(b => b.dataset.ongSorth));
            assert.deepStrictEqual(h, ['postcard', 'letter', 'photo', 'announce']);
            await p.waitForSelector('#workspace [data-ong-sortcard="announce"]', {timeout: 5000});
            await p.click('#sidebar-content [data-ong-sorth="announce"]'); await sleep(400);
            const r = await p.evaluate(() => ({ids: [...document.querySelectorAll('#workspace [data-ong-card]')].map(c => Number(c.dataset.ongCard)), head: document.querySelector('#workspace .ong-recbar')?.textContent || ''}));
            assert.deepStrictEqual(r.ids, [5]); assert.match(r.head, /Faire-part/);
        });
        await t('🏞 Cartes postales : la collection, par éditeur (« il manque le n° 143 »), écrites / vierges', async () => {
            await p.click('#sidebar-content [data-ong-sorth="postcard"]'); await p.waitForSelector('#workspace .ong-pc', {timeout: 10000});
            assert.deepStrictEqual(await p.$$eval('#workspace .ong-pc', b => b.map(x => Number(x.dataset.ongDoc)).sort()), [2, 6]);
            await p.click('#workspace [data-ong-pcview="publisher"]'); await p.waitForSelector('#workspace .ong-pcmiss', {timeout: 5000});
            assert.match(await p.textContent('#workspace .ong-pcmiss'), /Il manque le n° 143/);
            await p.click('#workspace [data-ong-pcview="blank"]'); await sleep(200);
            const h = await p.$$eval('#workspace .ong-pcgroup h3', x => x.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
            assert.deepStrictEqual(h, ['Écrites ou envoyées 1 carte', 'Vierges (jamais envoyées) 1 carte']);
            assert.strictEqual(JSON.parse(await p.evaluate(() => localStorage.getItem('genealogie-documents-tab'))).pcView, 'blank', 'le choix est gardé');
        });
        assert.deepStrictEqual(errs, [], 'erreurs JS : ' + errs.join(' | '));
    } finally { await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true}); }
    console.log(fails ? `${fails} échec(s)` : 'tout est bon'); process.exit(fails ? 1 : 0);
})();
