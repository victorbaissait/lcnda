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

        /* ─── 2. téléphone : trois onglets ─── */
        const phoneState = () => p.evaluate(() => { const d = document.querySelector('dialog.h-tx-dlg'), vis = el => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
            const out = [...d.querySelectorAll('*')].filter(el => !el.closest('svg, .h-tx-stage, [data-tx-readpanel], [data-tx-panel]') && vis(el)).filter(el => { const r = el.getBoundingClientRect(); return r.right > innerWidth + 1 || r.left < -1; }).map(el => (el.className && el.className.baseVal === undefined ? el.className : el.tagName) + ':' + Math.round(el.getBoundingClientRect().right));
            return {tabs: [...d.querySelectorAll('[data-tx-ptab]')].filter(vis).map(b => b.dataset.txPtab + (b.classList.contains('is-active') ? '*' : '')), stage: vis(d.querySelector('[data-tx-stage]')) ? Math.round(d.querySelector('[data-tx-stage]').getBoundingClientRect().width) : 0,
                editor: vis(d.querySelector('[data-tx-editor]')), found: vis(d.querySelector('[data-tx-found]')), add: vis(d.querySelector('[data-tx-addbar] [data-tx-cmd="found"]')), kind: vis(d.querySelector('[data-tx="kind"]')), flow: vis(d.querySelector('[data-tx-flow]')),
                editorTop: Math.round(d.querySelector('[data-tx-editor]').getBoundingClientRect().top), sw: document.documentElement.scrollWidth, out}; });
        await t('1440 px : pas d’onglets, l’image et le texte côte à côte', async () => { const s = await phoneState(); assert.deepEqual(s.tabs, []); assert.ok(s.stage > 500 && s.editor && s.found); });
        await t('390 px : trois onglets Image / Texte / Personnes ; Texte au départ, en grand, avec la frise et « ✓ Ajouter » en bas', async () => {
            await p.setViewportSize({width: 390, height: 844}); await sleep(500);
            const s = await phoneState();
            assert.deepEqual(s.tabs, ['image', 'text*', 'people']); assert.equal(s.stage, 0, 'image cachée'); assert.ok(s.editor && s.flow && s.add && !s.found, JSON.stringify(s));
            await shot("v2-390-texte.png"); assert.ok(s.editorTop < 330, "le texte commence haut : " + s.editorTop); assert.ok(s.sw <= 391, 'largeur ' + s.sw); assert.deepEqual(s.out, []);
            const lab = await p.textContent(`${D} [data-tx-ptab="people"]`); assert.match(lab, /Personnes\s*\d+/);
            await shot('v2-390-texte.png');
        });
        await t('390 px : l’onglet Image montre l’image en grand (ses zones), l’onglet Personnes les personnes et la fiche de l’acte ; rien ne dépasse, clair et sombre', async () => {
            for (const th of ['', 'dark']) {
                await theme(th);
                await p.click(`${D} [data-tx-ptab="image"]`); await sleep(400);
                let s = await phoneState(); assert.ok(s.stage > 300 && !s.editor && !s.found, JSON.stringify(s)); assert.deepEqual(s.out, []); assert.ok(s.sw <= 391);
                assert.equal(await p.evaluate(() => document.querySelectorAll('dialog.h-tx-dlg [data-tx-zones] rect').length), 7);
                await shot(`v2-390-image${th ? '-sombre' : ''}.png`);
                await p.keyboard.press('ArrowRight'); await p.keyboard.press('ArrowRight'); await sleep(200);
                s = await phoneState(); assert.deepEqual(s.tabs, ['image', 'text', 'people*']); assert.ok(s.found && s.kind && s.add && !s.editor, JSON.stringify(s)); assert.deepEqual(s.out, []);
                await shot(`v2-390-personnes${th ? '-sombre' : ''}.png`);
                await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-found] [data-tx-goto]')?.click()); await sleep(200);
                s = await phoneState(); assert.deepEqual(s.tabs, ['image', 'text*', 'people'], '« voir dans le texte » passe à l’onglet Texte'); assert.deepEqual(s.out, []);
            }
            await theme(''); await p.setViewportSize({width: 1440, height: 900}); await sleep(400);
            assert.ok((await phoneState()).stage > 500, 'retour au grand écran : tout revient');
        });

        /* ─── 3. 👁 relecture ligne à ligne en plein écran ─── */
        const rv = () => p.evaluate(() => { const d = document.querySelector('dialog.h-txr-dlg[open]'); if (!d) return null; const cv = d.querySelector('[data-txr-img]'), r = cv.getBoundingClientRect();
            let ink = 0; try { const g = cv.getContext('2d'), px = g.getImageData(0, 0, cv.width, cv.height).data; let lo = 255, hi = 0; for (let i = 0; i < px.length; i += 16) { lo = Math.min(lo, px[i]); hi = Math.max(hi, px[i]); } ink = hi - lo; } catch (_) {}
            const band = d.querySelector('[data-txr-band]').getBoundingClientRect(), line = d.querySelector('[data-txr-line]').getBoundingClientRect();
            return {pos: d.querySelector('[data-txr-pos]').textContent, done: d.querySelector('[data-txr-done]').textContent, line: d.querySelector('[data-txr-line]').value, focus: document.activeElement === d.querySelector('[data-txr-line]'),
                img: {w: Math.round(r.width), h: Math.round(r.height), ink, above: band.bottom <= line.top + 1}, zone: d.dataset.txrZone, undo: !d.querySelector('[data-txr="undo"]').disabled, ok: !d.querySelector('[data-txr-ok]').hidden,
                sw: document.documentElement.scrollWidth, out: [...d.querySelectorAll('*')].filter(el => { const q = el.getBoundingClientRect(); return q.width && (q.right > innerWidth + 1 || q.left < -1) && !el.closest('[data-txr-band]'); }).map(el => el.className)}; });
        const reviewed = () => p.evaluate(() => (document.querySelector('dialog.h-tx-dlg').txApi.get().data.reviewed || []).length);
        await t('👁 relecture : R ouvre le plein écran sur la ligne 1, le morceau d’image de la ligne juste au-dessus de la ligne de texte', async () => {
            await p.evaluate(() => { const a = document.querySelector('dialog.h-tx-dlg [data-tx-body]'); a.setSelectionRange(0, 0); });
            await p.click(`${D} [data-tx-step="fix"]`); await p.keyboard.press('r');
            await p.waitForSelector('dialog.h-txr-dlg[open]'); await sleep(500);
            const r = await rv(); assert.equal(r.pos, 'Ligne 1 sur 7'); assert.equal(r.line, LINES[0]); assert.ok(r.focus, 'on écrit tout de suite dans la ligne');
            assert.equal(r.zone, 'z1'); assert.ok(r.img.w > 300 && r.img.h > 20 && r.img.ink > 60 && r.img.above, JSON.stringify(r.img)); assert.equal(r.done, '0 ligne relue');
            await shot('v2-relecture.png');
        });
        await t('👁 relecture : Entrée = ligne relue et suivante, ⇧ Entrée = ligne d’avant, ↑ ↓ sans marquer', async () => {
            await p.keyboard.press('Enter'); await sleep(200);
            let r = await rv(); assert.equal(r.pos, 'Ligne 2 sur 7'); assert.equal(r.line, LINES[1]); assert.equal(r.done, '1 ligne relue'); assert.equal(r.zone, 'z2'); assert.equal(await reviewed(), 1);
            await p.keyboard.press('Shift+Enter'); await sleep(150); r = await rv(); assert.equal(r.pos, 'Ligne 1 sur 7'); assert.ok(r.ok, '✓ sur la ligne relue');
            await p.keyboard.press('ArrowDown'); await p.keyboard.press('ArrowDown'); await sleep(150); r = await rv(); assert.equal(r.pos, 'Ligne 3 sur 7'); assert.equal(r.done, '1 ligne relue');
            await p.keyboard.press('ArrowUp'); await sleep(150); assert.equal((await rv()).pos, 'Ligne 2 sur 7');
        });
        await t('👁 relecture : corriger sur place (le texte de l’acte et sa zone suivent), puis « ↶ Annuler »', async () => {
            await p.keyboard.press('ControlOrMeta+a'); await p.keyboard.type('mars, a été baptisé Jean, né d’hier, fils légitime et naturel');
            const now = (await body()).split('\n'); assert.equal(now[1], 'mars, a été baptisé Jean, né d’hier, fils légitime et naturel');
            const z2 = await p.evaluate(() => { const d = document.querySelector('dialog.h-tx-dlg'), x = d.txApi.get(), z = x.data.zones.find(q => q.id === 'z2'); return x.body.slice(z.s, z.e); });
            assert.equal(z2, now[1], 'la zone de la ligne suit la correction'); assert.ok((await rv()).undo);
            await p.click('dialog.h-txr-dlg [data-txr="undo"]'); await sleep(200);
            assert.equal((await body()).split('\n')[1], LINES[1]); assert.equal((await rv()).line, LINES[1]);
        });
        await t('👁 relecture : en sombre et à 390 px, rien ne dépasse ; Échap ferme et la ligne relue reste choisie dans le texte, sa zone allumée', async () => {
            await theme('dark'); await sleep(150); await shot('v2-relecture-sombre.png');
            await p.setViewportSize({width: 390, height: 844}); await sleep(400);
            const r = await rv(); assert.ok(r.sw <= 391, 'largeur ' + r.sw); assert.deepEqual(r.out, []); assert.ok(r.img.w > 200, JSON.stringify(r.img));
            await shot('v2-relecture-390.png'); await p.setViewportSize({width: 1440, height: 900}); await theme(''); await sleep(300);
            await p.keyboard.press('Escape'); await sleep(300);
            assert.equal(await p.evaluate(() => !!document.querySelector('dialog.h-txr-dlg')), false);
            const sel = await p.evaluate(() => { const a = document.querySelector('dialog.h-tx-dlg [data-tx-body]'); return [a.value.slice(a.selectionStart, a.selectionEnd), document.querySelector('dialog.h-tx-dlg [data-tx-zones] rect.is-sel')?.dataset.txZone]; });
            assert.deepEqual(sel, [LINES[1], 'z2']);
        });
        await t('👁 relecture : les lignes relues sont gardées avec l’acte (💾 puis réouverture)', async () => {
            await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-cmd="save"]').click());
            await p.waitForFunction(() => /Enregistré/.test(document.querySelector('dialog.h-tx-dlg [data-tx-status]').textContent), null, {timeout: 8000});
            await openAct(); assert.equal(await reviewed(), 1);
        });
        await t('👁 relecture : un réglage (Réglages, « (conseillé) », allumé au départ) ; éteint, ni bouton, ni menu, ni touche R', async () => {
            const html = await p.evaluate(() => window.LCNDA_EXT.transcribePrefs.html()); assert.match(html, /data-txb-rv checked><i><\/i>Relecture ligne à ligne en plein écran \(conseillé\)/);
            assert.ok(await p.evaluate(() => !document.querySelector('dialog.h-tx-dlg [data-tx-cmd="review"]').hidden));
            await p.evaluate(() => window.LCNDA_EXT.txView.setReviewMode(false)); await sleep(200);
            assert.ok(await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-cmd="review"]').hidden));
            await p.click(`${D} [data-tx-step="fix"]`); await p.keyboard.press('r'); await sleep(300);
            assert.equal(await p.evaluate(() => !!document.querySelector('dialog.h-txr-dlg')), false);
            await p.evaluate(() => [...document.querySelectorAll('dialog.h-tx-dlg [data-tx-menus] button')].find(b => b.textContent.trim() === 'Affichage').click()); await p.waitForSelector('.ui-actmenu');
            const items = await p.evaluate(() => [...document.querySelectorAll('.ui-actmenu .ui-actmenu-i')].map(b => b.textContent)); await p.keyboard.press('Escape');
            assert.ok(!items.some(x => /Relire/.test(x)), items.join(' | '));
            await p.evaluate(() => window.LCNDA_EXT.txView.setReviewMode(true)); await sleep(200);
            await p.evaluate(() => [...document.querySelectorAll('dialog.h-tx-dlg [data-tx-menus] button')].find(b => b.textContent.trim() === 'Affichage').click()); await p.waitForSelector('.ui-actmenu');
            await p.evaluate(() => [...document.querySelectorAll('.ui-actmenu .ui-actmenu-i')].find(b => /Relire ligne à ligne/.test(b.textContent)).click());
            await p.waitForSelector('dialog.h-txr-dlg[open]'); await p.keyboard.press('Escape'); await sleep(200);
        });

        /* ─── 4. 🕘 Versions, 🔍 Chercher / Remplacer, ⌨️ touches ─── */
        const versionsOf = () => p.evaluate(async () => (await window.LCNDA_APP.api('act_transcription_versions', {act_id: 1})).items);
        const saveAct = async () => { await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-cmd="save"]').click()); await p.waitForFunction(() => /Enregistré/.test(document.querySelector('dialog.h-tx-dlg [data-tx-status]').textContent), null, {timeout: 8000}); };
        await t('🕘 versions : une version à chaque enregistrement où le texte a changé (pas de doublon)', async () => {
            const v0 = await versionsOf(); assert.ok(v0.length >= 1 && v0[0].label === 'Enregistré', JSON.stringify(v0));
            await saveAct(); assert.equal((await versionsOf()).length, v0.length, 'même texte : pas de nouvelle version');
            await setBody((await body()).replace('Delpeiroux curé', 'Delpeyroux curé')); await saveAct();
            const v1 = await versionsOf(); assert.equal(v1.length, v0.length + 1); assert.equal(v1[0].lines, 7);
        });
        await t('🕘 versions : Fichier → Versions… ouvre la fenêtre commune ; ↺ Revenir remet le texte d’avant (l’actuel gardé), ↶ Annuler', async () => {
            await p.evaluate(() => [...document.querySelectorAll('dialog.h-tx-dlg [data-tx-menus] button')].find(b => b.textContent.trim() === 'Fichier').click()); await p.waitForSelector('.ui-actmenu');
            await p.evaluate(() => [...document.querySelectorAll('.ui-actmenu .ui-actmenu-i')].find(b => /Versions…/.test(b.textContent)).click());
            await p.waitForSelector('dialog.ui-vers[open] [data-vers-row]'); await sleep(400);
            const rows = await p.evaluate(() => [...document.querySelectorAll('dialog.ui-vers [data-vers-row]')].map(r => r.dataset.versRow + ':' + r.querySelector('.ui-vers-nm').textContent + ':' + r.querySelector('small').textContent));
            assert.ok(rows[0].startsWith('now:') && rows.length >= 3, rows.join(' | ')); assert.match(rows[1], /Enregistré:.*7 lignes/);
            await shot('v2-versions.png');
            const old = rows[2].split(':')[0];
            await p.click(`dialog.ui-vers [data-vers-row="${old}"]`); await p.waitForSelector('dialog.ui-vers [data-vers-act="restore"]');
            await p.click('dialog.ui-vers [data-vers-act="restore"]'); await sleep(800);
            assert.match((await body()).split('\n')[6], /Delpeiroux/, 'le texte de la version d’avant');
            const v = await versionsOf(); assert.ok(v.some(x => /^Avant le retour/.test(x.label)), 'l’état d’avant gardé comme version');
            assert.ok(await lastToastUndo(/Revenu à/)); await sleep(500);
            assert.match((await body()).split('\n')[6], /Delpeyroux/, '↶ Annuler : le texte d’après revient');
            await p.evaluate(() => document.querySelector('dialog.ui-vers [data-vers-close]').click()); await sleep(200);
        });
        const findState = () => p.evaluate(() => { const d = document.querySelector('dialog.h-tx-dlg'), f = d.querySelector('[data-tx-find]');
            return {open: !f.hidden, rep: !d.querySelector('[data-tx-frep]').hidden, count: d.querySelector('[data-tx-fcount]').textContent, hits: d.querySelectorAll('[data-tx-mirror] .h-tx-hit').length, cur: d.querySelectorAll('[data-tx-mirror] .h-tx-hit.is-cur').length,
                focus: document.activeElement?.matches('[data-tx-fq]') ? 'q' : document.activeElement?.matches('[data-tx-fr]') ? 'r' : '', sel: (a => a.value.slice(a.selectionStart, a.selectionEnd))(d.querySelector('[data-tx-body]'))}; });
        await t('🔍 ⌘F dans le texte : la case de recherche, les résultats surlignés, Entrée / ⇧ Entrée', async () => {
            await p.evaluate(() => { const a = document.querySelector('dialog.h-tx-dlg [data-tx-body]'); a.focus(); a.setSelectionRange(0, 0); });
            await p.keyboard.press('ControlOrMeta+f'); await sleep(150);
            let f = await findState(); assert.ok(f.open && !f.rep && f.focus === 'q', JSON.stringify(f));
            await p.keyboard.type('MAZAUD'); await sleep(150); f = await findState();
            assert.equal(f.count, '1 sur 2'); assert.equal(f.hits, 2); assert.equal(f.cur, 1);
            await p.keyboard.press('Enter'); f = await findState(); assert.equal(f.count, '2 sur 2'); assert.equal(f.sel, 'MAZAUD');
            await p.keyboard.press('Shift+Enter'); assert.equal((await findState()).count, '1 sur 2');
            await p.click(`${D} [data-tx-f="case"]`); await p.fill(`${D} [data-tx-fq]`, 'mazaud'); await sleep(100); assert.equal((await findState()).count, 'Aucun résultat');
            await p.click(`${D} [data-tx-f="case"]`); await sleep(100); assert.equal((await findState()).hits, 2, 'sans Aa : majuscules et minuscules pareilles');
            await shot('v2-chercher.png');
        });
        await t('🔍 ⌥⌘F : remplacer ; « Tout remplacer » (les zones suivent), puis « ↶ Annuler » ; Échap ferme', async () => {
            await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-body]').focus());
            await p.keyboard.press('ControlOrMeta+Alt+f'); await sleep(150); let f = await findState(); assert.ok(f.open && f.rep, JSON.stringify(f));
            await p.fill(`${D} [data-tx-fq]`, 'MAZAUD'); await p.fill(`${D} [data-tx-fr]`, 'MAZAULT'); await sleep(100);
            await p.click(`${D} [data-tx-f="all"]`); await sleep(300);
            const b = (await body()).split('\n'); assert.match(b[2], /Pierre MAZAULT,/); assert.match(b[5], /^Anne MAZAULT,/); assert.equal((await findState()).count, 'Aucun résultat');
            const z = await p.evaluate(() => { const x = document.querySelector('dialog.h-tx-dlg').txApi.get(); return ['z3', 'z6'].map(id => { const q = x.data.zones.find(y => y.id === id); return x.body.slice(q.s, q.e); }); });
            assert.deepEqual(z, [b[2], b[5]], 'chaque zone garde sa ligne entière');
            assert.ok(await lastToastUndo(/MAZAULT/)); await sleep(300);
            assert.equal((await body()).split('\n')[2], LINES[2]);
            await p.fill(`${D} [data-tx-fq]`, 'labr'); await p.fill(`${D} [data-tx-fr]`, 'laboureur'); await p.click(`${D} [data-tx-f="one"]`); await sleep(200);
            assert.equal((await body()).split('\n')[2], LINES[2].replace('labr', 'laboureur')); await p.evaluate(() => document.querySelector('dialog.h-tx-dlg').txApi.get());
            await setBody((await body()).replace('laboureur', 'labr'));
            await p.focus(`${D} [data-tx-fq]`); await p.keyboard.press('Escape'); await sleep(100);
            f = await findState(); assert.ok(!f.open && !f.hits, JSON.stringify(f));
        });
        await t('⌨️ ⌘/ (et ?) : la liste des touches de l’Atelier ; ⌥↓ choisit la ligne suivante et l’image va à sa zone', async () => {
            await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-body]').focus()); await p.keyboard.press('ControlOrMeta+/');
            await p.waitForSelector('[data-tx-keys]'); const rows = await p.evaluate(() => [...document.querySelectorAll('[data-tx-keys] tr')].map(r => r.textContent));
            for (const w of ['Chercher dans le texte', 'Chercher et remplacer', 'Relire ligne à ligne', 'Enregistrer', 'Dessiner une zone']) assert.ok(rows.some(r => r.includes(w)), w + ' : ' + rows.join(' | '));
            await shot('v2-touches.png'); await p.keyboard.press('Escape'); await sleep(200);
            await p.click(`${D} [data-tx-step="fix"]`); await p.keyboard.press('?'); await p.waitForSelector('[data-tx-keys]'); await p.keyboard.press('Escape'); await sleep(200);
            await p.evaluate(() => { const a = document.querySelector('dialog.h-tx-dlg [data-tx-body]'); a.focus(); a.setSelectionRange(3, 3); }); await p.keyboard.press('Alt+ArrowDown'); await sleep(150);
            const s = await findState(); assert.equal(s.sel, LINES[1]); assert.equal(await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-zones] rect.is-sel')?.dataset.txZone), 'z2');
            await p.keyboard.press('Alt+ArrowUp'); await sleep(100); assert.equal((await findState()).sel, LINES[0]);
        });

        await t('aucune erreur JavaScript', async () => { assert.deepStrictEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true});
    }
    console.log(fails ? `${fails} essai(s) en échec` : 'L’Atelier, vague 2 : tout va bien.');
    process.exit(fails ? 1 : 0);
})();
