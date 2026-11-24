#!/usr/bin/env node
/* 🔗 Atelier de transcription → les autres outils (docs/design/outils-liens.html) :
 *  1. Fichier → « 📤 Envoyer vers… » : l'image de l'acte, le texte (paragraphes, retours à la ligne), les personnes repérées (tableau) ;
 *     l'Atelier ne se propose pas à lui-même ;
 *  2. Fichier → « 📝 Dans le traitement de texte » (comme la page « Documents ») ;
 *  3. « 🎚️ Éclaircir / restaurer l'image » seulement si la Retouche sait la recevoir (ext.retouchMedia) ;
 *  4. une zone « ✍️ Signatures » : « Détourer la signature » ouvre Signatures et sceaux avec l'image découpée à la zone ;
 *  5. Exporter → Word (.docx), par le moteur du traitement de texte (LCNDA_TEXT.toDocx).
 *   node tests/test-liens-atelier.js
 * Personnes et lieux fictifs (MAZAUD, LACOMBE, DURAND). */
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
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 20).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const BODY = 'L’an mil huit cent douze, le trois mai, est né Pierre MAZAUD, fils de Jean MAZAUD, laboureur,\ndemeurant à Tulle, et de Marie LACOMBE.\n\nLe parrain a été Louis DURAND. Signé.';

(async () => {
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-liens-atelier-'));
    fs.mkdirSync(path.join(tmp, 'media'));
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4'};
    const php = code => spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], {cwd: root, encoding: 'utf8', env: {...env, TX_BODY: BODY}});
    const seed = php(String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start) VALUES(1,'Pierre','MAZAUD','male','deceased',1)");
$im = imagecreatetruecolor(800, 600); imagefill($im, 0, 0, imagecolorallocate($im, 232, 220, 190)); $ink = imagecolorallocate($im, 40, 30, 20);
for ($l = 0; $l < 5; $l++) for ($x = 40; $x < 760; $x += 9) imagefilledrectangle($im, $x, 40 + $l * 60, $x + 5, 60 + $l * 60, $ink);
imagesetthickness($im, 4); imageline($im, 520, 470, 640, 510, $ink); imageline($im, 640, 510, 680, 480, $ink); // une « signature »
imagepng($im, MEDIA_DIR . '/acte.png');
$pdo->prepare("INSERT INTO media(id,title,filename,thumbnail,media_type) VALUES(1,'Naissance de Pierre MAZAUD','acte.png','acte.png','image')")->execute();
act_transcriptions_ensure($pdo);
$data = json_encode(['zones' => [['id' => 'zs', 'x' => 500, 'y' => 450, 'w' => 200, 'h' => 80, 's' => 0, 'e' => 0, 'kind' => 'sign'], ['id' => 'zt', 'x' => 40, 'y' => 40, 'w' => 700, 'h' => 30, 's' => 0, 'e' => 20]], 'people' => [], 'status' => 'doing']);
$pdo->prepare("INSERT INTO act_transcriptions(id,title,kind,media_id,body,data_json,date_text,place,updated_at) VALUES(1,'Naissance de Pierre MAZAUD','naissance',1,?,?,'3 mai 1812','Tulle','2026-01-01 10:00:00')")->execute([getenv('TX_BODY'), $data]);
$pdo->prepare("UPDATE media SET transcription=? WHERE id=1")->execute([getenv('TX_BODY')]);
echo json_encode(['ok' => 1]);`);
    if (seed.status !== 0 || !/"ok"/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }

    const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const port = await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const errs = [];
    try {
        const ctx = await browser.newContext({viewport: {width: 1440, height: 900}, deviceScaleFactor: 1});
        const p = await ctx.newPage();
        p.on('pageerror', e => errs.push(e.message));
        if (process.env.DBG) p.on('console', m => console.log('[page]', m.text().slice(0, 300)));
        console.log('…'); await p.goto(base); await p.waitForFunction(() => window.LCNDA_EXT?.openActTranscriber && window.LCNDA_EXT?.sendTo && window.LCNDA_UI?.editorMenus, null, {timeout: 30000});
        // l'Atelier, et un espion sur ext.sendTo (qui continue vers le vrai menu)
        await p.evaluate(async () => { const ext = window.LCNDA_EXT; window.__sends = []; const real = ext.sendTo; ext.sendTo = (k, d, o) => { window.__sends.push({k, d, o: {exclude: o?.exclude, title: o?.title}}); return real(k, d, o); };
            window.__tx = await ext.openActTranscriber({id: 1}); });
        await p.waitForSelector('dialog.h-tx-dlg[open] [data-ui-menu="Fichier"]', {timeout: 15000}); await sleep(800);
        const menu = async () => { await p.keyboard.press('Escape').catch(() => {}); await p.evaluate(() => document.querySelectorAll('.ui-actmenu').forEach(m => m.remove()));
            await p.click('dialog.h-tx-dlg[open] [data-ui-menu="Fichier"]'); await p.waitForSelector('.ui-actmenu'); return p.$$eval('.ui-actmenu button b', b => b.map(x => x.textContent)); };
        const pick = async label => { await p.locator('.ui-actmenu button', {hasText: label}).first().click(); await sleep(300); };
        const items = async () => p.$$eval('.ui-actmenu button b', b => b.map(x => x.textContent));
        const menuTitle = () => p.$eval('.ui-actmenu .ui-actmenu-t', x => x.textContent).catch(() => '');

        await t('Fichier : « Envoyer vers… » et « Dans le traitement de texte »', async () => {
            const l = await menu(); assert.ok(l.includes('Envoyer vers…'), l.join(' | ')); assert.ok(l.includes('Dans le traitement de texte'), l.join(' | '));
        });
        await t('📤 l’image de l’acte : le média de l’acte, sans proposer l’Atelier lui-même', async () => {
            await menu(); await pick('Envoyer vers…');
            assert.deepEqual(await items(), ['L’image de l’acte', 'Le texte de la transcription', 'Les personnes repérées (tableau)']);
            await pick('L’image de l’acte');
            const s = await p.evaluate(() => window.__sends.at(-1));
            assert.equal(s.k, 'image'); assert.equal(s.d.media.id, 1); assert.equal(s.d.media.filename, 'acte.png'); assert.deepEqual(s.o.exclude, ['atelier']);
            assert.match(await menuTitle(), /image/);
            const dest = await items(); assert.ok(!dest.some(x => /Atelier/.test(x)), dest.join(' | '));
        });
        await t('📤 le texte : des paragraphes avec retours à la ligne, au nom de l’acte', async () => {
            await menu(); await pick('Envoyer vers…'); await pick('Le texte de la transcription');
            const s = await p.evaluate(() => window.__sends.at(-1));
            assert.equal(s.k, 'text'); assert.equal(s.d.name, 'Naissance de Pierre MAZAUD');
            assert.equal((s.d.html.match(/<p>/g) || []).length, 2, s.d.html); assert.match(s.d.html, /laboureur,<br>demeurant/);
        });
        await t('📤 les personnes repérées : nom, rôle, métier, dates, lieux → Tableur', async () => {
            await p.evaluate(() => { window.__sheet = null; window.LCNDA_EXT.openRowsInSheet = o => { window.__sheet = o; }; });
            await menu(); await pick('Envoyer vers…'); await pick('Les personnes repérées (tableau)');
            const s = await p.evaluate(() => window.__sends.at(-1));
            assert.equal(s.k, 'rows'); const rows = s.d.rows;
            assert.deepEqual(rows[0], ['Nom', 'Rôle', 'Métier', 'Dates', 'Lieux', 'Reliée à une fiche']);
            const pierre = rows.find(r => r[0] === 'Pierre MAZAUD'), louis = rows.find(r => r[0] === 'Louis DURAND');
            assert.ok(pierre, JSON.stringify(rows)); assert.ok(louis, JSON.stringify(rows));
            assert.equal(louis[1], 'parrain'); assert.match(pierre[3], /1812/, JSON.stringify(pierre));
            const jean = rows.find(r => r[0] === 'Jean MAZAUD'); assert.ok(jean && /laboureur/.test(jean[2]), JSON.stringify(jean));
            await pick('Dans le Tableur');
            const sh = await p.evaluate(() => window.__sheet); assert.ok(sh, 'le Tableur reçoit les lignes'); assert.equal(sh.rows.length, rows.length);
        });
        await t('📝 Dans le traitement de texte : un document avec le titre, la sorte, la date, le lieu et le texte', async () => {
            await p.evaluate(() => { window.__doc = null; window.LCNDA_EXT.openTextDoc = o => { window.__doc = o; }; });
            await menu(); await pick('Dans le traitement de texte');
            const d = await p.evaluate(() => window.__doc);
            assert.ok(d, 'openTextDoc appelé'); assert.equal(d.name, 'Transcription — Naissance de Pierre MAZAUD');
            const html = d.data?.sections?.[0]?.html || ''; assert.match(html, /<h1>Naissance de Pierre MAZAUD<\/h1>/); assert.match(html, /Naissance · 3 mai 1812 · Tulle/); assert.match(html, /<br>demeurant/);
        });
        await t('🎚️ Éclaircir / restaurer : seulement si la Retouche sait recevoir, et avec le média de l’acte', async () => {
            await p.evaluate(() => { window.__real = window.LCNDA_EXT.retouchMedia; delete window.LCNDA_EXT.retouchMedia; });
            assert.ok(!(await menu()).includes('Éclaircir / restaurer l’image'));
            await p.evaluate(() => { window.__rt = null; window.LCNDA_EXT.retouchMedia = m => { window.__rt = m; }; });
            assert.ok((await menu()).includes('Éclaircir / restaurer l’image'));
            await pick('Éclaircir / restaurer l’image');
            const m = await p.evaluate(() => window.__rt); assert.equal(m.id, 1); assert.equal(m.filename, 'acte.png');
            await p.evaluate(() => { if (window.__real) window.LCNDA_EXT.retouchMedia = window.__real; else delete window.LCNDA_EXT.retouchMedia; });
            await p.keyboard.press('Escape').catch(() => {}); await p.evaluate(() => document.querySelectorAll('.ui-actmenu').forEach(m => m.remove()));
        });
        await t('✍️ une zone « Signatures » : « Détourer la signature » ; une zone de texte : non ; changer la sorte le fait paraître', async () => {
            await p.evaluate(() => window.__tx.links.selectZone('zt'));
            assert.equal(await p.$('dialog.h-tx-dlg[open] [data-tx-zsign]'), null);
            await p.selectOption('dialog.h-tx-dlg[open] [data-tx-zkind]', 'sign'); await sleep(200);
            assert.ok(await p.$('dialog.h-tx-dlg[open] [data-tx-zsign]'), 'le bouton paraît quand la zone devient « Signatures »');
            await p.selectOption('dialog.h-tx-dlg[open] [data-tx-zkind]', ''); await sleep(200);
            await p.evaluate(() => window.__tx.links.selectZone('zs'));
            assert.ok(await p.$('dialog.h-tx-dlg[open] [data-tx-zsign]'));
        });
        await t('✍️ Signatures et sceaux reçoit l’image découpée à la zone (avec une petite marge)', async () => {
            await p.evaluate(() => { const ext = window.LCNDA_EXT; window.__seal = null; window.__realSeals = ext.openSeals; ext.openSeals = (cb, o) => { window.__seal = o; }; });
            await p.click('dialog.h-tx-dlg[open] [data-tx-zsign]'); await p.waitForFunction(() => window.__seal, null, {timeout: 5000});
            const o = await p.evaluate(async () => { const s = window.__seal, i = new Image(); await new Promise(r => { i.onload = r; i.src = s.src; }); return {src: s.src.slice(0, 22), title: s.title, w: i.naturalWidth, h: i.naturalHeight}; });
            assert.equal(o.src, 'data:image/png;base64,'); assert.equal(o.title, 'Signature — Naissance de Pierre MAZAUD');
            assert.ok(o.w >= 200 && o.w <= 220 && o.h >= 80 && o.h <= 100, JSON.stringify(o));
        });
        await t('✍️ le vrai outil Signatures et sceaux s’ouvre sur la signature', async () => {
            await p.evaluate(() => { window.LCNDA_EXT.openSeals = window.__realSeals; });
            assert.ok(await p.evaluate(() => !!window.LCNDA_EXT.openSeals), 'Signatures et sceaux est chargé');
            await p.click('dialog.h-tx-dlg[open] [data-tx-zsign]');
            await p.waitForSelector('dialog[open] [data-sl-stage] canvas', {timeout: 10000});
            const n = await p.$eval('dialog[open] [data-sl-name]', x => x.textContent); assert.equal(n, 'Signature — Naissance de Pierre MAZAUD');
            await p.evaluate(() => { const d = [...document.querySelectorAll('dialog[open]')].find(x => x.querySelector('[data-sl-stage]')); d?.close(); d?.remove(); });
        });
        await t('📝 Exporter → Word (.docx) : le texte, le titre et les personnes, relus par le traitement de texte', async () => {
            await p.click('dialog.h-tx-dlg[open] [data-tx-cmd="export"]'); await sleep(500);
            assert.ok(await p.evaluate(() => [...document.querySelectorAll('dialog[open]')].some(d => /📝 Word/.test(d.textContent))), 'le format Word est proposé');
            await p.keyboard.press('Escape'); await sleep(300);
            const r = await p.evaluate(async () => { const tx = window.__tx; tx.t.data.people = [{name: 'Pierre MAZAUD', role: 'sujet', person_id: 1, s: 47, e: 60}];
                const b = await tx.links.docxBlob(); const back = await window.LCNDA_TEXT.fromDocx(await b.arrayBuffer());
                const txt = back.doc.sections.flatMap(s => s.blocks).map(x => window.LCNDA_TEXT.blockText(x)).join('\n'); return {size: b.size, type: b.type, txt, sts: back.doc.sections[0].blocks.map(x => x.st)}; });
            assert.ok(r.size > 1000, JSON.stringify(r)); assert.match(r.txt, /Naissance de Pierre MAZAUD/); assert.match(r.txt, /laboureur,\ndemeurant à Tulle/); assert.match(r.txt, /Pierre MAZAUD — sujet/);
            assert.equal(r.sts[0], 'title');
        });
        await t('aucune erreur JavaScript', async () => { assert.deepEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill();
        fs.rmSync(tmp, {recursive: true, force: true});
    }
    console.log(fails ? `${fails} essai(s) en échec` : 'Les liens de l’Atelier de transcription marchent.');
    process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
