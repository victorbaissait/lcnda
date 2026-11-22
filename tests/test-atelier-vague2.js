#!/usr/bin/env node
/* 📜 Atelier de transcription, vague 2 « Guider » (docs/design/atelier-transcription-idees.html, décisions du 22/11/2026) :
 *  - la frise « Lire → Corriger → Repérer → Ajouter » : l'étape en cours, ce qui reste à faire, « ✓ Ajouter à la généalogie… » toujours en bas ;
 *  - téléphone (390 px) : trois onglets Image / Texte / Personnes, rien ne dépasse ;
 *  - 👁 relecture ligne à ligne en plein écran (réglage, conseillé : oui) : le morceau d'image au-dessus de la ligne, Entrée / ⇧ Entrée,
 *    corriger sur place, ↶ Annuler ;
 *  - 🕘 Versions (la fenêtre commune), Chercher / Remplacer (⌘F, ⌥⌘F), la liste des touches (⌘/) ;
 *  - avancement (état de l'acte, lignes relues, mots douteux) et abréviations connues au survol ; clair et sombre ; aucune erreur JavaScript.
 *   node tests/test-atelier-vague2.js   (captures : SHOTS=/chemin node tests/test-atelier-vague2.js)
 * Personnes fictives. */
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
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const LINES = ['L’an mil sept cent quatre vingt dix, le vingt trois', 'mars, a été baptisé Jean, né d’hier, fils légitime', 'de Pierre MAZAUD, labr, et de Marie LACOMBE,', 'son épouse, de cette paroisse de Saint Martin.', 'Le parrain a été Jean DURAND, la marraine', 'Anne MAZAUD, qui ont déclaré ne savoir signer.', 'Delpeiroux curé [?]'];
const BODY = LINES.join('\n');

(async () => {
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-atelier-v2-'));
    fs.mkdirSync(path.join(tmp, 'media'));
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4'};
    let at = 0; const zones = LINES.map((l, i) => { const z = {id: 'z' + (i + 1), x: 40, y: 40 + i * 64, w: 520, h: 46, s: at, e: at + l.length}; at += l.length + 1; return z; });
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start) VALUES(1,'Jean','MAZAUD','male','deceased',1)");
$im = imagecreatetruecolor(600, 500); imagefill($im, 0, 0, imagecolorallocate($im, 230, 215, 180)); $ink = imagecolorallocate($im, 60, 45, 30);
for ($l = 0; $l < 7; $l++) for ($x = 50; $x < 550; $x += 9) imagefilledrectangle($im, $x, 50 + $l * 64, $x + 5, 70 + $l * 64, $ink);
imagepng($im, MEDIA_DIR . '/acte.png');
$pdo->exec("INSERT INTO media(id,title,filename,thumbnail,media_type) VALUES(1,'Baptême','acte.png','acte.png','image')");
act_transcriptions_ensure($pdo);
$a = $pdo->prepare("INSERT INTO act_transcriptions(id,title,kind,media_id,body,data_json,updated_at) VALUES(?,?,?,?,?,?,?)");
$a->execute([1, 'Baptême de Jean MAZAUD, 1790', 'bapteme', 1, getenv('TX_BODY'), getenv('TX_DATA'), '2026-01-01']);
echo json_encode(['ok' => 1]);`], {cwd: root, encoding: 'utf8', env: {...env, TX_BODY: BODY, TX_DATA: JSON.stringify({zones, people: [], status: 'doing'})}});
    if (seed.status !== 0 || !/"ok"/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
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
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_EXT?.openActTranscriber && window.LCNDA_EXT?.txView, null, {timeout: 30000});
        const theme = th => p.evaluate(x => { if (x) document.documentElement.setAttribute('data-theme', x); else document.documentElement.removeAttribute('data-theme'); }, th);
        const D = 'dialog.h-tx-dlg';
        const openAct = async () => {
            await p.evaluate(() => { const d = document.querySelector('dialog.h-tx-dlg'); if (d) d.querySelector('[data-tx-cmd="close"]')?.click(); }); await sleep(200);
            await p.evaluate(() => document.querySelectorAll('.confirm-dialog, dialog.h-tx-dlg').forEach(d => { try { d.close(); } catch (_) {} d.remove(); }));
            await p.evaluate(() => window.LCNDA_EXT.openActTranscriber({id: 1}));
            await p.waitForFunction(() => document.querySelector('dialog.h-tx-dlg [data-tx-img]')?.getAttribute('href'), null, {timeout: 15000}); await sleep(700);
        };
        const body = () => p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-body]').value);
        const setBody = v => p.evaluate(x => { const a = document.querySelector('dialog.h-tx-dlg [data-tx-body]'); a.value = x; a.dispatchEvent(new Event('input')); }, v);
        const lastToastUndo = re => p.evaluate(src => { const rx = new RegExp(src); const tt = [...document.querySelectorAll('.ui-toast')].filter(x => rx.test(x.textContent)).at(-1); const b = tt && [...tt.querySelectorAll('button')].find(x => /Annuler/.test(x.textContent)); if (b) b.click(); return !!b; }, re.source);
        await openAct();

        /* ─── 1. la frise ─── */
        const flow = () => p.evaluate(() => { const d = document.querySelector('dialog.h-tx-dlg'), vis = el => !!el && el.getBoundingClientRect().width > 0 && !el.closest('[hidden]');
            return {cur: d.dataset.txFlow, view: d.dataset.txFlowView, steps: [...d.querySelectorAll('[data-tx-step]')].map(b => ({k: b.dataset.txStep, name: b.querySelector('b').textContent, rest: b.querySelector('[data-tx-steprest]').textContent, done: b.classList.contains('is-done'), cur: b.classList.contains('is-cur'), sel: b.getAttribute('aria-selected'), mark: b.querySelector('i').textContent})),
                panes: [...d.querySelectorAll('[data-tx-pane]')].filter(vis).map(x => x.dataset.txPane), add: d.querySelector('[data-tx-addinfo]').textContent,
                addBtn: (() => { const b = d.querySelector('[data-tx-addbar] [data-tx-cmd="found"]'), r = b.getBoundingClientRect(); return {vis: vis(b), text: b.textContent.trim(), bottom: Math.round(r.bottom), h: innerHeight}; })()}; });
        const expectFixes = () => p.evaluate(async () => { const d = document.querySelector('dialog.h-tx-dlg'), text = d.querySelector('[data-tx-body]').value;
            const lex = await window.LCNDA_EXT.htrFix.lexicon(d.querySelector('[data-tx-lang]').value, d.querySelector('[data-tx="place"]').value);
            return window.LCNDA_HTRFIX.propose(text, lex, {level: window.LCNDA_EXT.htrFix.fixLevel()}).length + (text.match(/\[\?\]|\[illisible\]/g) || []).length; });
        await t('frise : quatre étapes Lire → Corriger → Repérer → Ajouter, Lire faite (✓), l’étape en cours est Corriger', async () => {
            await p.waitForFunction(() => document.querySelector('dialog.h-tx-dlg')?.dataset.txFlow === 'fix', null, {timeout: 8000});
            const f = await flow();
            assert.deepEqual(f.steps.map(s => s.name), ['Lire', 'Corriger', 'Repérer', 'Ajouter']);
            assert.ok(f.steps[0].done && f.steps[0].mark === '✓', JSON.stringify(f.steps[0])); assert.match(f.steps[0].rest, /^7 lignes$/);
            assert.ok(f.steps[1].cur && !f.steps[1].done && f.steps[1].sel === 'true', JSON.stringify(f.steps[1]));
            assert.deepEqual(f.panes, ['fix'], 'seuls les boutons de l’étape montrée');
        });
        await t('frise : ce qui reste à chaque étape (« N mots à revoir » = corrections proposées + [?]), Repérer à faire', async () => {
            const n = await expectFixes(), f = await flow();
            assert.ok(n >= 1, String(n)); assert.equal(f.steps[1].rest, `${n} mot${n > 1 ? 's' : ''} à revoir`);
            assert.equal(f.steps[2].rest, 'À faire'); assert.equal(f.steps[3].rest, '');
            const info = await p.textContent(`${D} [data-tx-fixinfo]`); assert.match(info, /1 × \[\?\] ou \[illisible\]/);
        });
        await t('« ✓ Ajouter à la généalogie… » toujours visible en bas du panneau, avec ce qui reste à relier', async () => {
            const f = await flow(); assert.ok(f.addBtn.vis && f.addBtn.bottom <= f.addBtn.h, JSON.stringify(f.addBtn)); assert.match(f.addBtn.text, /^✓ Ajouter à la généalogie…$/);
            assert.match(f.add, /Personne dans l’acte pour l’instant/);
            await shot('v2-frise-1440.png');
        });
        await t('cliquer une étape montre ses boutons ; « Étape suivante › » ; flèches du clavier entre les étapes', async () => {
            await p.click(`${D} [data-tx-step="find"]`); let f = await flow(); assert.equal(f.view, 'find'); assert.deepEqual(f.panes, ['find']);
            assert.ok(await p.isVisible(`${D} [data-tx-pane="find"] [data-tx-cmd="detect"]`));
            await p.keyboard.press('ArrowRight'); f = await flow(); assert.equal(f.view, 'add'); assert.ok(await p.isVisible(`${D} [data-tx-pane="add"] [data-tx-cmd="found"]`));
            assert.equal(await p.isVisible(`${D} [data-tx-stepnext]`), false, 'pas d’étape après Ajouter');
            await p.click(`${D} [data-tx-step="read"]`); await p.click(`${D} [data-tx-stepnext]`); f = await flow(); assert.equal(f.view, 'fix');
        });
        await t('corriger fait baisser le compteur ; Repérer puis garder les noms : l’étape se coche toute seule, Ajouter compte les personnes à relier', async () => {
            const before = await expectFixes();
            await setBody((await body()).replace(' [?]', ''));
            await p.waitForFunction(n => { const r = document.querySelector('dialog.h-tx-dlg [data-tx-step="fix"] [data-tx-steprest]').textContent; return r && !r.startsWith(String(n) + ' '); }, before, {timeout: 6000});
            assert.equal((await flow()).steps[1].rest.split(' ')[0], String(before - 1) === '0' ? 'rien' : String(before - 1));
            await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-cmd="detect"]').click());
            await p.waitForFunction(() => document.querySelector('dialog.h-tx-dlg [data-tf-all="people"], dialog.h-tx-dlg [data-tx-keepall]'), null, {timeout: 8000});
            await p.evaluate(() => { const d = document.querySelector('dialog.h-tx-dlg'); (d.querySelector('[data-tf-all="people"]') || d.querySelector('[data-tx-keepall]')).click(); }); await sleep(400);
            const n = await p.evaluate(() => document.querySelector('dialog.h-tx-dlg').txApi.get().data.people.length);
            const f = await flow(); assert.ok(n >= 3, String(n));
            assert.ok(f.steps[2].done, JSON.stringify(f.steps[2])); assert.equal(f.steps[2].rest, `${n} personnes`);
            assert.equal(f.steps[3].rest, `${n} à relier`); assert.equal(f.add, `👥 ${n} personnes dans l’acte · ${n} à relier`);
            await shot('v2-frise-personnes.png');
        });
        await t('frise en sombre : lisible (étape en cours en bleu, faite en vert), rien ne dépasse', async () => {
            await theme('dark'); await sleep(200);
            const c = await p.evaluate(() => { const d = document.querySelector('dialog.h-tx-dlg'), bg = s => getComputedStyle(d.querySelector(s)).backgroundColor;
                return {done: bg('[data-tx-step="read"] i'), flow: bg('[data-tx-flow]'), add: bg('[data-tx-addbar]'), sw: document.documentElement.scrollWidth}; });
            const rgb = s => s.match(/\d+/g).map(Number), lum = s => { const [r, g, b] = rgb(s); return (r + g + b) / 3; };
            assert.ok(lum(c.flow) < 80 && lum(c.add) < 80, JSON.stringify(c)); const [r, g, b] = rgb(c.done); assert.ok(g > r + 40 && g > b, 'vert : ' + c.done); assert.ok(c.sw <= 1441);
            await shot('v2-frise-sombre.png'); await theme(''); await sleep(100);
        });

        await t('aucune erreur JavaScript', async () => { assert.deepStrictEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true});
    }
    console.log(fails ? `${fails} essai(s) en échec` : 'L’Atelier, vague 2 : tout va bien.');
    process.exit(fails ? 1 : 0);
})();
