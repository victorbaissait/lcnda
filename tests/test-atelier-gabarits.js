#!/usr/bin/env node
/* 🧩 Atelier de transcription, 3b étape 1 : les gabarits d'actes (maquette docs/design/atelier-gabarits.html).
 * L'onglet « 🧩 Gabarit » à côté de « Ce que l'app a trouvé », les cases remplies par « 🧭 Repérer », jamais une case ✓ ou écrite
 * écrasée, le lien vers le passage, gardé avec l'acte (et vérifié côté serveur), le réglage « Modèle d'acte », la sorte devinée.
 *   node tests/test-atelier-gabarits.js */
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

const BODY = ['L’an mil sept cent quatre vingt dix, le vingt trois mars,', 'a été baptisé Jean, né d’hier, fils légitime', 'de Pierre MAZAUD, laboureur, et de Marie LACOMBE,', 'son épouse, de cette paroisse de Saint Martin.', 'Le parrain a été Jean DURAND, la marraine', 'Anne MAZAUD, qui ont déclaré ne savoir signer.', 'Delpeiroux curé'].join('\n');

(async () => {
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-gabarits-'));
    fs.mkdirSync(path.join(tmp, 'media'));
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4'};
    const php = code => spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], {cwd: root, encoding: 'utf8', env});
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start) VALUES(1,'Jean','MAZAUD','male','deceased',1)");
$im = imagecreatetruecolor(600, 500); imagefill($im, 0, 0, imagecolorallocate($im, 230, 215, 180)); imagepng($im, MEDIA_DIR . '/acte.png');
$pdo->exec("INSERT INTO media(id,title,filename,thumbnail,media_type) VALUES(1,'Baptême','acte.png','acte.png','image')");
act_transcriptions_ensure($pdo);
$a = $pdo->prepare("INSERT INTO act_transcriptions(id,title,kind,media_id,body,data_json,updated_at) VALUES(?,?,?,?,?,?,?)");
$a->execute([1, 'Baptême de Jean MAZAUD, 1790', 'bapteme', 1, getenv('TX_BODY'), json_encode(['zones' => [], 'people' => []]), '2026-01-01']);
echo json_encode(['ok' => 1]);`], {cwd: root, encoding: 'utf8', env: {...env, TX_BODY: BODY}});
    if (seed.status !== 0 || !/"ok"/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const errs = [];
    try {
        const p = await (await browser.newContext({viewport: {width: 1440, height: 900}, deviceScaleFactor: 1})).newPage();
        p.on('pageerror', e => errs.push(e.message));
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_EXT?.openActTranscriber && window.LCNDA_EXT?.txGabarit, null, {timeout: 30000});
        const D = 'dialog.h-tx-dlg';
        const openAct = async () => {
            await p.evaluate(() => { const d = document.querySelector('dialog.h-tx-dlg'); if (d) d.querySelector('[data-tx-cmd="close"]')?.click(); }); await sleep(250);
            await p.evaluate(() => document.querySelectorAll('.confirm-dialog, dialog.h-tx-dlg').forEach(d => { try { d.close(); } catch (_) {} d.remove(); }));
            await p.evaluate(() => window.LCNDA_EXT.openActTranscriber({id: 1}));
            await p.waitForFunction(() => document.querySelector('dialog.h-tx-dlg [data-tx-img]')?.getAttribute('href'), null, {timeout: 15000}); await sleep(600);
        };
        const gab = () => p.evaluate(() => document.querySelector('dialog.h-tx-dlg').txApi.get().data.gabarit || null);
        const fields = () => p.evaluate(() => Object.fromEntries([...document.querySelectorAll('dialog.h-tx-dlg [data-gab-field]')].map(i => [i.dataset.gabField, {v: i.value, cls: i.className}])));
        const detect = async () => { await p.click(`${D} [data-tx-step="find"]`); await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-cmd="detect"]').click()); await sleep(900); };
        const toGab = async () => { await p.click(`${D} [data-gab-tab="gab"]`); await p.waitForSelector(`${D} [data-gab-field]`, {timeout: 8000}); };
        await openAct();

        await t('« 🧭 Repérer » : l’onglet « 🧩 Gabarit » à côté de « Ce que l’app a trouvé » ; les cases du baptême remplies (vert)', async () => {
            await detect();
            const tabs = await p.$$eval(`${D} [data-gab-tab]`, b => b.map(x => x.textContent.trim()));
            assert.deepEqual(tabs, ['🧾 Ce que l’app a trouvé', '🧩 Gabarit']);
            await toGab(); const f = await fields();
            assert.deepEqual(Object.keys(f), ['date', 'enfant', 'ne', 'pere', 'mere', 'parrain', 'marraine', 'cure', 'sign']);
            assert.equal(f.date.v, '23 mars 1790'); assert.match(f.enfant.v, /^Jean\b/); assert.match(f.ne.v, /d’hier/);
            assert.match(f.pere.v, /^Pierre MAZAUD, laboureur$/); assert.match(f.mere.v, /^Marie LACOMBE/); assert.match(f.parrain.v, /^Jean DURAND/); assert.match(f.marraine.v, /^Anne MAZAUD/);
            assert.match(f.cure.v, /curé/i); assert.match(f.pere.cls, /is-auto/);
            assert.match(await p.textContent(`${D} [data-gab-count]`), /Cases remplies : \d\/9 · vérifiées : 0/);
            const g = await gab(); assert.equal(g.kind, 'bapteme'); assert.ok(g.fields.pere.s >= 0 && g.fields.pere.e > g.fields.pere.s);
        });
        await t('un clic sur « l. 3 » montre le passage dans le texte', async () => {
            const link = p.locator(`${D} [data-gab-field="pere"] ~ .h-gab-a [data-tx-goto]`).first();
            assert.match(await link.textContent(), /^l\. 3$/);
            await link.click(); await sleep(300);
            const sel = await p.evaluate(() => { const a = document.querySelector('dialog.h-tx-dlg [data-tx-body]'); return a.value.slice(a.selectionStart, a.selectionEnd); });
            assert.match(sel, /Pierre MAZAUD/);
        });
        await t('✓ vérifié (bouton, et Entrée dans une case écrite) ; Repérer à nouveau n’écrase ni une case ✓ ni une case écrite à la main', async () => {
            await p.click(`${D} [data-gab-ok="enfant"]`); await sleep(200);
            await p.fill(`${D} [data-gab-field="cure"]`, 'Jean DELPEIROUX, curé de Saint Martin'); await p.press(`${D} [data-gab-field="cure"]`, 'Enter'); await sleep(200);
            let g = await gab(); assert.equal(g.fields.enfant.ok, true); assert.equal(g.fields.cure.ok, true); assert.equal(g.fields.cure.own, true);
            // le texte change : le père s'appelle Paul ; l'enfant (✓) et le curé (écrit) restent, le père suit le texte
            await p.click(`${D} [data-gab-tab="found"]`);
            await p.evaluate(() => { const a = document.querySelector('dialog.h-tx-dlg [data-tx-body]'); a.value = a.value.replace('Pierre MAZAUD', 'Paul MAZAUD').replace('baptisé Jean', 'baptisé Jacques'); a.dispatchEvent(new Event('input')); });
            await detect(); await toGab(); const f = await fields(); g = await gab();
            assert.match(f.pere.v, /^Paul MAZAUD/, 'une case remplie par Repérer suit le texte'); assert.match(f.enfant.v, /^Jean\b/, 'la case ✓ reste'); assert.equal(f.cure.v, 'Jean DELPEIROUX, curé de Saint Martin');
            assert.match(f.enfant.cls, /is-ok/); assert.match(await p.textContent(`${D} [data-gab-count]`), /vérifiées : 2/);
        });
        await t('gardé avec l’acte : enregistrer, rouvrir, les cases et leur état reviennent', async () => {
            await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-cmd="save"]').click()); await sleep(1200);
            const row = JSON.parse(php(`require 'lib/bootstrap.php'; echo db()->query('SELECT data_json FROM act_transcriptions WHERE id=1')->fetchColumn();`).stdout);
            assert.equal(row.gabarit.kind, 'bapteme'); assert.equal(row.gabarit.fields.enfant.ok, true); assert.equal(row.gabarit.fields.cure.own, true);
            await openAct(); await p.click(`${D} [data-tx-step="find"]`); await detect(); await toGab(); const f = await fields();
            assert.match(f.enfant.cls, /is-ok/); assert.equal(f.cure.v, 'Jean DELPEIROUX, curé de Saint Martin');
        });
        await t('côté serveur : des cases au nom inconnu, trop longues ou d’une sorte inconnue ne sont pas gardées', async () => {
            const r = php(String.raw`require 'lib/bootstrap.php'; require_once 'lib/transcriptions.php';
$d = act_transcription_clean_data(db(), ['gabarit' => ['kind' => 'bapteme', 'fields' => ['pere' => ['v' => str_repeat('x', 900), 's' => 3, 'e' => 9, 'ok' => 1], 'Mauvais-Nom' => ['v' => 'x'], 'vide' => ['v' => ''], 'html' => ['v' => '<b>a</b>']]]]);
$e = act_transcription_clean_data(db(), ['gabarit' => ['kind' => 'pirate', 'fields' => ['a' => ['v' => 'x']]]]);
echo json_encode([$d['gabarit'] ?? null, $e['gabarit'] ?? null]);`);
            const [d, e] = JSON.parse(r.stdout || '[]');
            assert.deepEqual(Object.keys(d.fields).sort(), ['html', 'pere']); assert.equal(d.fields.pere.v.length, 300); assert.equal(d.fields.pere.ok, true);
            assert.equal(e, null);
        });
        await t('« À préciser » : l’onglet propose la sorte devinée ; un clic la choisit et remplit le gabarit', async () => {
            await p.evaluate(() => { const k = document.querySelector('dialog.h-tx-dlg [data-tx="kind"]'); k.value = 'apreciser'; k.dispatchEvent(new Event('change', {bubbles: true})); }); await sleep(300);
            await p.click(`${D} [data-gab-tab="gab"]`); await p.waitForSelector(`${D} [data-gab-kind]`, {timeout: 8000});
            assert.match(await p.textContent(`${D} [data-gab-kind]`), /On dirait : Baptême\. Utiliser ce gabarit \?/);
            await p.click(`${D} [data-gab-kind]`); await p.waitForSelector(`${D} [data-gab-field="pere"]`, {timeout: 8000});
            assert.equal(await p.$eval(`${D} [data-tx="kind"]`, e => e.value), 'bapteme');
        });
        await t('la sorte « Acte de notoriété » existe, avec son gabarit', async () => {
            const opts = await p.$$eval(`${D} [data-tx="kind"] option`, o => o.map(x => x.value));
            assert.ok(opts.includes('notoriete'));
            const keys = await p.evaluate(() => window.LCNDA_EXT.txGabarit.G.notoriete.map(x => x[0])); assert.deepEqual(keys, ['date', 'juge', 'personne', 'atteste', 'temoins']);
            assert.deepEqual(Object.keys(await p.evaluate(() => window.LCNDA_EXT.txGabarit.KIND_NAME)).length, 9);
        });
        await t('réglage « Modèle d’acte » (menu ⋯) : « Texte à trous » → plus d’onglet, « 🧩 Modèle » colle le texte à trous ; retour au gabarit', async () => {
            await p.click(`${D} [data-gab-menu]`); await p.waitForSelector('.ui-actmenu .ui-actmenu-i');
            await p.locator('.ui-actmenu .ui-actmenu-i', {hasText: 'Texte à trous (comme avant)'}).click(); await sleep(300);
            assert.equal(await p.$(`${D} [data-gab-tab]`), null, 'plus d’onglet');
            assert.equal(await p.evaluate(() => localStorage.getItem('genealogie-transcribe-modele')), 'texte');
            const b0 = await p.$eval(`${D} [data-tx-body]`, e => e.value);
            await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-cmd="template"]').click()); await sleep(300);
            await p.evaluate(() => { const c = [...document.querySelectorAll('dialog[open]')].find(d => /Ajouter le modèle/.test(d.textContent) && !d.classList.contains('h-tx-dlg')); [...(c?.querySelectorAll('button') || [])].find(b => /Ajouter le modèle/.test(b.textContent))?.click(); }); await sleep(300);
            assert.match(await p.$eval(`${D} [data-tx-body]`, e => e.value), /L’an \[année\]/); assert.ok((await p.$eval(`${D} [data-tx-body]`, e => e.value)).startsWith(b0.trim()));
            await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-hist="undo"]').click()); await sleep(300);
            await p.evaluate(() => localStorage.removeItem('genealogie-transcribe-modele'));
            await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-cmd="template"]').click()); await sleep(400);
            assert.ok(await p.$(`${D} [data-gab-field]`), '« 🧩 Modèle » ouvre le gabarit (conseillé)');
        });
        await t('aucune erreur JavaScript', async () => { assert.deepStrictEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true});
    }
    console.log(fails ? `${fails} essai(s) en échec` : 'Les gabarits d’actes marchent.');
    process.exit(fails ? 1 : 0);
})();
