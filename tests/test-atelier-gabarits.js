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
        await t('étape 2 : « ✓ Ajouter à la généalogie » reprend les cases vérifiées ou écrites (l’aperçu le dit, rien n’est écrit avant d’accepter)', async () => {
            await p.fill(`${D} [data-gab-field="pere"]`, 'Paul MAZAUD, meunier, 40 ans'); await sleep(200);
            const persons0 = Number(php(`require 'lib/bootstrap.php'; echo db()->query('SELECT count(*) FROM persons')->fetchColumn();`).stdout);
            await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-cmd="found"]').click());
            await p.waitForSelector('[data-txa-gab] .h-txa-msg', {timeout: 15000});
            const note = await p.textContent('[data-txa-gab]'); assert.match(note, /Repris du gabarit/); assert.match(note, /Père, métier : Paul MAZAUD, meunier, 40 ans/); assert.match(note, /Enfant : Jean/);
            const ppl = await p.$$eval('[data-txa-found] [data-txa-p]', els => els.map(e => e.textContent.replace(/\s+/g, ' ')));
            assert.ok(ppl.some(x => /Paul MAZAUD/.test(x) && /meunier/.test(x)), 'le père de la case dans l’aperçu : ' + JSON.stringify(ppl));
            assert.ok(!ppl.some(x => /Pierre MAZAUD/.test(x)), 'plus l’ancien nom');
            await p.evaluate(() => { const d = [...document.querySelectorAll('dialog[open]')].find(x => x.querySelector('[data-txa-found]')); d?.close(); }); await sleep(300);
            assert.equal(Number(php(`require 'lib/bootstrap.php'; echo db()->query('SELECT count(*) FROM persons')->fetchColumn();`).stdout), persons0, 'rien d’écrit sans accepter');
        });
        await t('étape 2 : accepter l’aperçu crée la fiche d’après la case (Paul MAZAUD, meunier), pas d’après l’ancien nom', async () => {
            await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-cmd="found"]').click());
            await p.waitForSelector('[data-txa-gab] .h-txa-msg', {timeout: 15000});
            // 🔴 3 (audit, fiches en double) : « Jean MAZAUD » est déjà dans la base → « ⇆ à trancher », ✓ Ajouter grisé ; on le relie (c'est lui)
            const undecided = await p.evaluate(() => [...document.querySelectorAll('dialog.h-txa-dlg [data-txa-p]')].filter(r => r.querySelector('.h-txa-seg button.is-on')?.dataset.txaAct.endsWith(':compare')).map(r => r.dataset.txaP));
            for (const k of undecided) await p.evaluate(k2 => document.querySelector(`dialog.h-txa-dlg [data-txa-act="${k2}:link"]`).click(), k);
            await sleep(150);
            await p.evaluate(() => { const d = [...document.querySelectorAll('dialog[open]')].find(x => x.querySelector('[data-txa-found]')); [...d.querySelectorAll('.modal-actions button')].find(b => /Ajouter à la généalogie/.test(b.textContent)).click(); });
            let row = null; for (let i = 0; i < 40 && !row; i++) { await sleep(250); row = JSON.parse(php(`require 'lib/bootstrap.php'; echo json_encode(db()->query("SELECT first_name, last_name, occupation FROM persons WHERE first_name='Paul'")->fetch(PDO::FETCH_ASSOC));`).stdout || 'false'); }
            assert.ok(row, 'la fiche de Paul créée'); assert.equal(row.last_name, 'MAZAUD'); assert.match(String(row.occupation || ''), /meunier/i);
            assert.equal(php(`require 'lib/bootstrap.php'; echo db()->query("SELECT count(*) FROM persons WHERE first_name='Pierre'")->fetchColumn();`).stdout, '0', 'pas de fiche « Pierre »');
            await p.evaluate(() => document.querySelectorAll('dialog[open]:not(.h-tx-dlg)').forEach(d => d.close())); await sleep(300);
        });
        await t('étape 2 : une personne écrite dans une case mais pas trouvée dans le texte est ajoutée, avec son lien (mère de l’enfant)', async () => {
            const r = await p.evaluate(() => { const C = window.LCNDA_TXACTE, G = window.LCNDA_EXT.txGabarit;
                const ex = C.extractAct('L’an mil sept cent quatre vingt dix, le vingt trois mars, a été baptisé Jean, fils de Pierre MAZAUD.', {kind: 'bapteme'});
                const out = G.apply(ex, {kind: 'bapteme', fields: {mere: {v: 'Marie LACOMBE', own: true, s: -1, e: -1}, pere: {v: 'Pierre MAZAUD', s: 40, e: 53}}});
                const kid = out.ex.people.find(q => q.role === 'sujet'), m = out.ex.people.find(q => q.role === 'mere');
                return {changes: out.changes, m: m && {name: m.name, sex: m.sex, of: m.relations[0]?.of === kid?.key}, rel: out.ex.relations.find(x => x.type === 'parents' && x.child === kid?.key)?.mother === m?.key}; });
            assert.deepEqual(r.changes, ['Mère : Marie LACOMBE'], 'une case remplie par Repérer (pas ✓) ne change rien');
            assert.deepEqual(r.m, {name: 'Marie LACOMBE', sex: 'f', of: true}); assert.equal(r.rel, true);
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
            assert.equal(Object.keys(await p.evaluate(() => window.LCNDA_EXT.txGabarit.G)).length, 9, '9 gabarits prêts'); assert.equal(Object.keys(await p.evaluate(() => window.LCNDA_EXT.txGabarit.KIND_NAME)).length, 11, '+ Lettre et Autre, pour ses propres gabarits');
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
        await t('étape 3 : « ＋ Ajouter une case » dans l’acte (gardée avec l’acte, × la retire, ↶ Annuler la remet)', async () => {
            await p.click(`${D} [data-gab-add]`); await p.fill(`${D} [data-gab-newlabel]`, 'Profession du parrain'); await p.press(`${D} [data-gab-newlabel]`, 'Enter'); await sleep(200);
            const k = 'x_profession_du_parrain'; assert.ok(await p.$(`${D} [data-gab-field="${k}"]`), 'la nouvelle case');
            await p.fill(`${D} [data-gab-field="${k}"]`, 'tisserand'); await sleep(150);
            await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-cmd="save"]').click()); await sleep(1200);
            const row = JSON.parse(php(`require 'lib/bootstrap.php'; echo db()->query('SELECT data_json FROM act_transcriptions WHERE id=1')->fetchColumn();`).stdout);
            assert.deepEqual(row.gabarit.extra, [{key: k, label: 'Profession du parrain'}]); assert.equal(row.gabarit.fields[k].v, 'tisserand');
            await p.click(`${D} [data-gab-del="${k}"]`); await sleep(200); assert.equal(await p.$(`${D} [data-gab-field="${k}"]`), null);
            await p.evaluate(() => { const tt = [...document.querySelectorAll('.ui-toast')].filter(x => /Case retirée/.test(x.textContent)).at(-1); [...tt.querySelectorAll('button')].find(b => /Annuler/.test(b.textContent)).click(); }); await sleep(250);
            assert.equal(await p.$eval(`${D} [data-gab-field="${k}"]`, e => e.value), 'tisserand', '↶ Annuler la remet, avec sa valeur');
        });
        await t('étape 3 : « 🧩 Mes gabarits… » : masquer une case prête, ajouter la sienne pour toute la sorte ; gardé', async () => {
            await p.click(`${D} [data-gab-menu]`); await p.waitForSelector('.ui-actmenu .ui-actmenu-i'); await p.locator('.ui-actmenu .ui-actmenu-i', {hasText: 'Mes gabarits…'}).click();
            await p.waitForSelector('[data-gab-mine] [data-gab-mshow="cure"]');
            await p.uncheck('[data-gab-mine] [data-gab-mshow="cure"]'); await sleep(150);
            await p.fill('[data-gab-mine] [data-gab-mnew]', 'Lieu du baptême'); await p.press('[data-gab-mine] [data-gab-mnew]', 'Enter'); await sleep(200);
            const P = await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-gabarits-perso')));
            assert.deepEqual(P.bapteme.hide, ['cure']); assert.deepEqual(P.bapteme.add, [{key: 'x_lieu_du_bapteme', label: 'Lieu du baptême'}]);
            const keys = await p.$$eval(`${D} [data-gab-field]`, e => e.map(x => x.dataset.gabField));
            assert.ok(!keys.includes('cure') && keys.includes('x_lieu_du_bapteme'), 'le gabarit de l’acte suit : ' + keys);
            await p.check('[data-gab-mine] [data-gab-mshow="cure"]'); await sleep(150);
            assert.ok((await p.$$eval(`${D} [data-gab-field]`, e => e.map(x => x.dataset.gabField))).includes('cure'), 'remontrée');
            await p.evaluate(() => [...document.querySelectorAll('dialog[open]')].find(d => d.querySelector('[data-gab-mine]'))?.close()); await sleep(200);
        });
        await t('étape 3 : « ⤓ Tableur » : une ligne par acte de la sorte, une colonne par case (avec les cases ajoutées)', async () => {
            await p.fill(`${D} [data-gab-field="x_lieu_du_bapteme"]`, 'église Saint-Martin'); await sleep(150);
            await p.click(`${D} [data-gab-menu]`); await p.waitForSelector('.ui-actmenu .ui-actmenu-i');
            const [dl] = await Promise.all([p.waitForEvent('download', {timeout: 15000}), p.locator('.ui-actmenu .ui-actmenu-i', {hasText: 'Tableur de tous les actes « Baptême »'}).click()]);
            const csv = fs.readFileSync(await dl.path(), 'utf8').replace(/^\ufeff/, ''), lines = csv.split('\r\n');
            assert.equal(dl.suggestedFilename(), 'bapteme-gabarits.csv');
            assert.match(lines[0], /^"Titre";"Date";"Lieu";"Source";"Date du baptême";"Enfant"/); assert.match(lines[0], /"Lieu du baptême"/); assert.match(lines[0], /"Profession du parrain"/);
            assert.equal(lines.length, 2, 'un seul acte de cette sorte'); assert.match(lines[1], /"Jean[^"]*"/); assert.match(lines[1], /"église Saint-Martin"/); assert.match(lines[1], /"tisserand"/);
        });
        await t('étape 3 : 🖨 l’impression et le PDF montrent le gabarit en tableau (case à cocher « 🧩 Gabarit »)', async () => {
            const r = await p.evaluate(async () => { const UI = window.LCNDA_UI, keep = {pr: UI.openPrintDialog, ex: UI.openExportDialog}; let pr = null, ex = null;
                UI.openPrintDialog = o => { pr = o; }; UI.openExportDialog = o => { ex = o; };
                try { const d = document.querySelector('dialog.h-tx-dlg'); [...d.querySelectorAll('[data-tx-menus] button')].find(b => b.textContent.trim() === 'Fichier').click(); await new Promise(x => setTimeout(x, 200));
                    [...document.querySelectorAll('.ui-actmenu .ui-actmenu-i')].find(b => /Exporter/.test(b.textContent)).click(); await new Promise(x => setTimeout(x, 200));
                    await ex.formats.find(f => f.id === 'print').run({});
                    return pr ? {opt: pr.options.some(o => o.key === 'gab'), html: await pr.html({lay: 'text', gab: true, people: false}), off: await pr.html({lay: 'text', gab: false, people: false})} : null;
                } finally { UI.openPrintDialog = keep.pr; UI.openExportDialog = keep.ex; } });
            assert.ok(r, 'la fenêtre « Imprimer » s’ouvre'); assert.equal(r.opt, true);
            assert.match(r.html, /<table class="gab">/); assert.match(r.html, /<th>Enfant<\/th><td>Jean[^<]*✓<\/td>/); assert.match(r.html, /<th>Profession du parrain<\/th><td>tisserand<\/td>/);
            assert.doesNotMatch(r.off, /<table class="gab">/);
        });
        await t('étape 3 : côté serveur, les cases ajoutées : un nom en « x_… », 60 lettres au plus, pas de doublon', async () => {
            const r = php(String.raw`require 'lib/bootstrap.php'; require_once 'lib/transcriptions.php';
$d = act_transcription_clean_data(db(), ['gabarit' => ['kind' => 'bapteme', 'fields' => ['x_a' => ['v' => 'ok']], 'extra' => [['key' => 'x_a', 'label' => str_repeat('n', 90)], ['key' => 'x_a', 'label' => 'double'], ['key' => 'pere', 'label' => 'pas à moi'], ['key' => 'x_b', 'label' => '']]]]);
echo json_encode($d['gabarit']);`);
            const g = JSON.parse(r.stdout); assert.deepEqual(g.extra, [{key: 'x_a', label: 'n'.repeat(60)}]); assert.equal(g.fields.x_a.v, 'ok');
        });
        await t('aucune erreur JavaScript', async () => { assert.deepStrictEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true});
    }
    console.log(fails ? `${fails} essai(s) en échec` : 'Les gabarits d’actes marchent.');
    process.exit(fails ? 1 : 0);
})();
