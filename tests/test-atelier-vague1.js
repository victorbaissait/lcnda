#!/usr/bin/env node
/* 📜 Atelier de transcription, vague 1 « Ranger » (docs/design/atelier-transcription-idees.html, décisions du 22/11/2026) :
 *  - mode sombre : les couleurs qui relient chaque ligne à sa zone restent visibles dans le texte ; un interrupteur allumé
 *    paraît allumé (« Lire et exporter l'image améliorée », et tous les interrupteurs de l'app) ;
 *  - barre courte + « 🎚️ Mieux voir » par défaut, trois recettes en un clic, l'ancienne barre complète par un réglage,
 *    les réglages retenus pour un acte gardés ;
 *  - un seul bouton « ✨ Lire ▾ » et ses trois entrées expliquées ;
 *  - numéros de ligne dans la marge du texte (réglage) ; rien qui dépasse à 390 px ; aucune erreur JavaScript.
 *   node tests/test-atelier-vague1.js   (captures : SHOTS=/chemin node tests/test-atelier-vague1.js)
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

const LINES = ['L’an mil sept cent quatre vingt dix, le vingt trois', 'mars, a été baptisé Jean, né d’hier, fils légitime', 'de Pierre MAZAUD, laboureur, et de Marie LACOMBE,', 'son épouse, de cette paroisse de Saint Martin.', 'Le parrain a été Jean DURAND, la marraine', 'Anne MAZAUD, qui ont déclaré ne savoir signer.'];
const BODY = LINES.join('\n');

(async () => {
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-atelier-v1-'));
    fs.mkdirSync(path.join(tmp, 'media'));
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4'};
    let at = 0; const zones = LINES.map((l, i) => { const z = {id: 'z' + (i + 1), x: 40, y: 40 + i * 70, w: 520, h: 50, s: at, e: at + l.length}; at += l.length + 1; return z; });
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start) VALUES(1,'Jean','MAZAUD','male','deceased',1)");
$im = imagecreatetruecolor(600, 500); imagefill($im, 0, 0, imagecolorallocate($im, 230, 215, 180)); $ink = imagecolorallocate($im, 60, 45, 30);
for ($l = 0; $l < 6; $l++) for ($x = 50; $x < 550; $x += 9) imagefilledrectangle($im, $x, 55 + $l * 70, $x + 5, 75 + $l * 70, $ink);
imagepng($im, MEDIA_DIR . '/acte.png');
$pdo->exec("INSERT INTO media(id,title,filename,thumbnail,media_type) VALUES(1,'Baptême','acte.png','acte.png','image')");
act_transcriptions_ensure($pdo);
$a = $pdo->prepare("INSERT INTO act_transcriptions(id,title,kind,media_id,body,data_json,updated_at) VALUES(?,?,?,?,?,?,?)");
$a->execute([1, 'Baptême de Jean MAZAUD, 1790', 'bapteme', 1, getenv('TX_BODY'), getenv('TX_DATA'), '2026-01-01']);
echo json_encode(['ok' => 1]);`], {cwd: root, encoding: 'utf8', env: {...env, TX_BODY: BODY, TX_DATA: JSON.stringify({zones, people: [], status: 'doing', view: {contrast: 130, clahe: 30}})}});
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
        p.on('pageerror', e => errs.push(e.message));
        const shot = async name => { if (SHOTS) { fs.mkdirSync(SHOTS, {recursive: true}); await p.screenshot({path: path.join(SHOTS, name)}); } };
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_EXT?.openActTranscriber && window.LCNDA_EXT?.txView, null, {timeout: 30000});
        const theme = th => p.evaluate(x => { if (x) document.documentElement.setAttribute('data-theme', x); else document.documentElement.removeAttribute('data-theme'); }, th);
        const openAct = async () => {
            await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-cmd="close"]')?.click()); await sleep(200);
            await p.evaluate(() => document.querySelectorAll('dialog.h-tx-dlg').forEach(d => d.remove()));
            await p.evaluate(() => window.LCNDA_EXT.openActTranscriber({id: 1}));
            await p.waitForFunction(() => document.querySelector('dialog.h-tx-dlg [data-tx-img]')?.getAttribute('href'), null, {timeout: 15000}); await sleep(500);
        };
        await openAct();

        /* ─── 1. mode sombre ─── */
        // la couleur de la première ligne, vue à l'écran (le texte par-dessus son fond, le fond du texte par-dessus le miroir)
        const lineColor = () => p.evaluate(() => {
            const d = document.querySelector('dialog.h-tx-dlg'), m = d.querySelector('[data-tx-mirror] mark'), ta = d.querySelector('[data-tx-body]');
            const rgba = s => { const v = (s.match(/[\d.]+/g) || []).map(Number); return {r: v[0] || 0, g: v[1] || 0, b: v[2] || 0, a: v.length > 3 ? v[3] : 1}; };
            const mk = rgba(getComputedStyle(m).backgroundColor), mb = rgba(getComputedStyle(d.querySelector('[data-tx-mirror]')).backgroundColor), tb = rgba(getComputedStyle(ta).backgroundColor);
            const over = (top, bot) => ({r: top.r * top.a + bot.r * (1 - top.a), g: top.g * top.a + bot.g * (1 - top.a), b: top.b * top.a + bot.b * (1 - top.a), a: 1});
            const seen = over(tb, over(mk, mb)), plain = over(tb, mb);
            return {diff: Math.abs(seen.r - plain.r) + Math.abs(seen.g - plain.g) + Math.abs(seen.b - plain.b), marks: d.querySelectorAll('[data-tx-mirror] mark').length, seen, plain};
        });
        await t('clair : chaque ligne reliée garde sa couleur dans le texte', async () => { const c = await lineColor(); assert.equal(c.marks, 6); assert.ok(c.diff > 40, JSON.stringify(c)); });
        await shot('v1-clair-1440.png');
        await theme('dark'); await sleep(200);
        await t('sombre : les couleurs des lignes restent visibles dans le texte (lien ligne ↔ zone)', async () => { const c = await lineColor(); assert.equal(c.marks, 6); assert.ok(c.diff > 40, JSON.stringify(c)); });
        const toggleBg = sel => p.evaluate(s => { const i = document.querySelector(s); return i ? getComputedStyle(i.closest('.ui-toggle').querySelector(':scope > i')).backgroundColor : null; }, sel);
        await t('sombre : un interrupteur allumé est bleu, éteint il est gris (à la source : tous les interrupteurs de l’app)', async () => {
            const res = await p.evaluate(() => {
                const host = document.createElement('div'); host.innerHTML = '<label class="ui-toggle"><input type="checkbox" checked><i></i>on</label><label class="ui-toggle"><input type="checkbox"><i></i>off</label><div class="a11y-page"><label class="ui-toggle"><input type="checkbox" checked><i></i>on</label></div>';
                document.body.appendChild(host); const bg = el => getComputedStyle(el).backgroundColor; const r = [...host.querySelectorAll('.ui-toggle > i')].map(bg); host.remove(); return r; });
            const blue = s => { const [r, g, b] = s.match(/\d+/g).map(Number); return b > 150 && b > r + 60; };
            assert.ok(blue(res[0]), 'allumé : ' + res[0]); assert.ok(!blue(res[1]), 'éteint : ' + res[1]); assert.ok(blue(res[2]), 'page Accessibilité : ' + res[2]);
        });
        await shot('v1-sombre-1440.png');
        await theme(''); await sleep(200);

        /* ─── 2. barre courte + « 🎚️ Mieux voir » par défaut, trois recettes ─── */
        const view = () => p.evaluate(() => ({...document.querySelector('dialog.h-tx-dlg').txApi.get().data.view}));
        const bar = () => p.evaluate(() => { const b = document.querySelector('dialog.h-tx-dlg [data-tx-bar]'); return {layout: b.dataset.layout, h: Math.round(b.getBoundingClientRect().height), w: Math.round(b.getBoundingClientRect().width), kids: [...b.children].map(c => (c.dataset.txItem || c.className) + ':' + Math.round(c.getBoundingClientRect().width)).join(' '), better: !!b.querySelector('[data-tx-cmd="better"]'), ranges: [...b.querySelectorAll('input[type=range]')].filter(i => !i.closest('[data-tx-panel]')).length}; });
        await t('barre courte par défaut : une ligne, « 🎚️ Mieux voir ▾ », les curseurs fins rangés dans le panneau', async () => {
            const b = await bar(); assert.equal(b.layout, 'B'); assert.ok(b.better); assert.ok(b.h <= 48, 'hauteur ' + JSON.stringify(b)); assert.ok(b.ranges <= 2, 'curseurs dans la barre : ' + b.ranges);
        });
        await t('les réglages retenus pour cet acte reviennent à l’ouverture (rien de perdu)', async () => { const v = await view(); assert.equal(v.contrast, 130); assert.equal(v.clahe, 30); });
        await t('« 🎚️ Mieux voir » : trois recettes en un clic, chacune avec ce qu’elle fait ; ↶ Annuler remet les réglages de l’acte', async () => {
            await p.click('dialog.h-tx-dlg [data-tx-cmd="better"]');
            const r = await p.evaluate(() => [...document.querySelectorAll('dialog.h-tx-dlg [data-tx-panel] [data-tx-recipe]')].map(b => ({id: b.dataset.txRecipe, text: b.textContent.trim(), vis: b.getBoundingClientRect().width > 0})));
            assert.deepEqual(r.map(x => x.id), ['pale', 'paper', 'verso']); assert.ok(r.every(x => x.vis && /\+/.test(x.text)), JSON.stringify(r));
            await shot('v1-mieux-voir.png');
            await p.click('dialog.h-tx-dlg [data-tx-recipe="paper"]'); await sleep(300);
            let v = await view(); assert.equal(v.bg, true); assert.equal(v.channel, 'b'); assert.equal(v.clahe, 0); assert.equal(v.contrast, 100);
            assert.equal(await p.getAttribute('dialog.h-tx-dlg [data-tx-recipe="paper"]', 'aria-pressed'), 'true');
            assert.equal(await p.getAttribute('dialog.h-tx-dlg [data-tx-recipe="pale"]', 'aria-pressed'), 'false');
            await p.evaluate(() => [...document.querySelectorAll('.ui-toast')].filter(x => /Recette/.test(x.textContent)).at(-1).querySelector('.ui-toast-acts button').click()); await sleep(300);
            v = await view(); assert.equal(v.contrast, 130); assert.equal(v.clahe, 30); assert.equal(v.bg, false);
            await p.click('dialog.h-tx-dlg [data-tx-recipe="pale"]'); await sleep(300);
            v = await view(); assert.ok(v.clahe > 0 && v.sharp > 0, JSON.stringify(v));
            await p.keyboard.press('Escape');
        });
        await t('l’ancienne barre complète reste un réglage ; une barre gardée d’avant passe à la barre courte', async () => {
            await p.evaluate(() => { const T = window.LCNDA_EXT.txView, c = T.barCfg(); c.layout = 'A'; T.saveBar(c); }); await sleep(200);
            let b = await bar(); assert.equal(b.layout, 'A'); assert.ok(b.ranges >= 6, 'barre complète : ' + b.ranges);
            await p.evaluate(() => { localStorage.setItem('genealogie-transcribe-bar', JSON.stringify({layout: 'A', order: [], hidden: []})); window.dispatchEvent(new CustomEvent('lcnda-txbar-change')); }); await sleep(200);
            b = await bar(); assert.equal(b.layout, 'B');
            const html = await p.evaluate(() => window.LCNDA_EXT.transcribePrefs.html());
            assert.ok(/data-txb-layout="B"[^>]*>[^<]*conseillé/.test(html), 'barre courte « (conseillé) » dans le réglage');
            await p.evaluate(() => localStorage.removeItem('genealogie-transcribe-bar'));
        });

        /* ─── 3. un seul bouton « ✨ Lire ▾ » ─── */
        const readPanel = () => p.evaluate(() => { const pn = document.querySelector('dialog.h-tx-dlg [data-tx-readpanel]'), r = pn.getBoundingClientRect();
            return {open: !pn.hidden && r.width > 0, left: Math.round(r.left), right: Math.round(r.right), items: [...pn.querySelectorAll('.h-tx-readopt[data-tx-cmd]')].map(b => ({cmd: b.dataset.txCmd, title: b.querySelector('b')?.textContent || b.textContent.trim(), what: b.querySelector('small')?.textContent || '', st: b.querySelector('[data-tx-readst]')?.dataset.state || '', stText: b.querySelector('[data-tx-readst]')?.textContent || ''}))}; });
        await t('« ✨ Lire ▾ » : un seul bouton à droite, plus trois boutons de lecture qui se ressemblent', async () => {
            await p.click('dialog.h-tx-dlg [data-tx-step="read"]'); // atelier-etapes : « ✨ Lire ▾ » est dans l’étape Lire (une étape à la fois)
            const o = await p.evaluate(() => { const d = document.querySelector('dialog.h-tx-dlg'), vis = el => el.getBoundingClientRect().width > 0;
                return {read: [...d.querySelectorAll('[data-tx-cmd="readmenu"]')].filter(vis).map(b => b.textContent.trim()), loose: [...d.querySelectorAll('[data-tx-cmd="ocr"], [data-tx-cmd="htr"], [data-tx-cmd="deep"], [data-tx-lang], [data-tx-useenh]')].filter(el => !el.closest('[data-tx-readpanel]')).length}; });
            assert.equal(o.read.length, 1); assert.match(o.read[0], /^✨ Lire ▾$/); assert.equal(o.loose, 0, 'les lectures, la langue et l’image améliorée sont dans le menu');
        });
        await t('le menu : trois lectures, chacune avec une phrase qui dit la différence et son état (installé / à installer)', async () => {
            await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-step="read"]')?.click()); await p.click('dialog.h-tx-dlg [data-tx-cmd="readmenu"]');
            await p.waitForFunction(() => [...document.querySelectorAll('dialog.h-tx-dlg [data-tx-readst]')].every(x => x.dataset.state), null, {timeout: 15000});
            const r = await readPanel(); assert.ok(r.open);
            assert.deepEqual(r.items.map(x => x.cmd), ['htr', 'ocr', 'deep', 'lines']);
            assert.deepEqual(r.items.slice(0, 3).map(x => x.title), ['Lire l’écriture à la main (rapide)', 'Lire un texte imprimé', 'Lecture approfondie (IA)']);
            const [htr, ocr, deep] = r.items;
            assert.match(htr.what, /secondes/); assert.match(htr.what, /reliée à sa zone/); assert.match(htr.what, /S’installe/);
            assert.match(ocr.what, /imprimé/); assert.match(ocr.what, /rien à installer/); assert.match(ocr.what, /écriture à la main/);
            assert.match(deep.what, /lente/); assert.match(deep.what, /Ollama/); assert.match(deep.what, /relient ensuite/);
            assert.equal(ocr.st, 'ok'); assert.match(ocr.stText, /Installé/i); assert.equal(htr.st, 'todo'); assert.match(htr.stText, /À installer/i); assert.equal(deep.st, 'todo');
            assert.ok(await p.evaluate(() => !!document.querySelector('dialog.h-tx-dlg [data-tx-readpanel] select[data-tx-lang]') && !!document.querySelector('dialog.h-tx-dlg [data-tx-readpanel] .ui-toggle [data-tx-useenh]')), 'la langue et « image améliorée » dans le menu');
            await shot('v1-lire-menu.png');
            await theme('dark'); await sleep(150); await shot('v1-lire-menu-sombre.png'); await theme('');
            await p.keyboard.press('Escape'); await sleep(100); assert.equal((await readPanel()).open, false, 'Échap ferme le menu');
        });
        await t('une entrée du menu lance sa lecture et ferme le menu (Lecture approfondie → sa fenêtre)', async () => {
            await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-step="read"]')?.click()); await p.click('dialog.h-tx-dlg [data-tx-cmd="readmenu"]'); await p.click('dialog.h-tx-dlg [data-tx-readpanel] [data-tx-cmd="deep"]');
            await p.waitForFunction(() => document.querySelector('[data-txa-deep]'), null, {timeout: 15000});
            assert.equal((await readPanel()).open, false);
            await p.evaluate(() => { const d = document.querySelector('[data-txa-deep]').closest('dialog'); d.querySelector('[data-x], .modal-head .icon-button')?.click(); }); await sleep(300);
            await p.evaluate(() => document.querySelector('[data-txa-deep]')?.closest('dialog')?.close());
        });

        /* ─── 4. menus rangés, symboles, numéros de ligne ─── */
        const menu = async name => { await p.evaluate(n => [...document.querySelectorAll('dialog.h-tx-dlg [data-tx-menus] button')].find(b => b.textContent.trim() === n).click(), name); await p.waitForSelector('.ui-actmenu');
            const items = await p.evaluate(() => [...document.querySelectorAll('.ui-actmenu .ui-actmenu-i')].map(b => b.textContent.replace(/\s+/g, ' ').trim()));
            await p.keyboard.press('Escape'); await sleep(100); return items; };
        await t('menus rangés (K1) : les lectures, Repérer et « Ajouter à la généalogie » dans Outils, plus dans Édition ; un symbole = une action (K2)', async () => {
            const ed = await menu('Édition'), ou = await menu('Outils'), af = await menu('Affichage');
            assert.ok(!ed.some(x => /Lire|Lecture|Repérer|trouvé/.test(x)), 'Édition : ' + ed.join(' | '));
            for (const w of ['✍️Lire l’écriture à la main (rapide)', '🖨Lire un texte imprimé', '🔬Lecture approfondie (IA)', '🧭Repérer', '✓Ajouter à la généalogie', '📖Aide à la lecture']) assert.ok(ou.some(x => x.replace(/\s/g, '').startsWith(w.replace(/\s/g, ''))), w + ' dans Outils : ' + ou.join(' | '));
            assert.ok(af.some(x => /Remettre l’image comme au départ/.test(x)) && af.some(x => /numéros de ligne/.test(x)), 'Affichage : ' + af.join(' | '));
            const syms = await p.evaluate(() => { const d = document.querySelector('dialog.h-tx-dlg'), txt = s => d.querySelector(s)?.textContent.trim() || ''; return {model: txt('.h-tx-tools [data-tx-cmd="template"]'), aide: txt('.h-tx-tools [data-tx-cmd="aide"]'), found: txt('.h-tx-tools [data-tx-cmd="found"]'), deep: txt('[data-tx-readpanel] [data-tx-cmd="deep"] .h-tx-readt')}; });
            assert.match(syms.model, /^🧩/); assert.match(syms.aide, /^📖/); assert.match(syms.found, /^✓ Ajouter à la généalogie/); assert.match(syms.deep, /^🔬/);
        });
        const lines = () => p.evaluate(() => { const d = document.querySelector('dialog.h-tx-dlg'), ta = d.querySelector('[data-tx-body]').getBoundingClientRect();
            return [...d.querySelectorAll('[data-tx-mirror] .h-tx-ln')].map(s => { const r = s.getBoundingClientRect(), b = getComputedStyle(s, '::before'); return {n: s.dataset.n, content: b.content, y: Math.round(r.top), inMargin: b.position === 'absolute' && parseFloat(b.left) + parseFloat(b.width) <= parseFloat(getComputedStyle(d.querySelector('[data-tx-mirror]')).paddingLeft) - 4 && r.left >= ta.left + 30}; }); });
        await t('numéros de ligne dans la marge du texte, montrés au départ, une ligne = un numéro, alignés', async () => {
            const l = await lines(); assert.deepEqual(l.map(x => x.n), ['1', '2', '3', '4', '5', '6']); assert.ok(l.every(x => x.content === 'attr(data-n)' || /\d/.test(x.content)), JSON.stringify(l));
            assert.ok(l.every((x, i) => !i || x.y > l[i - 1].y), 'de haut en bas'); assert.ok(l.every(x => x.inMargin), 'dans la marge');
            const pad = await p.evaluate(() => [getComputedStyle(document.querySelector('dialog.h-tx-dlg [data-tx-body]')).paddingLeft, getComputedStyle(document.querySelector('dialog.h-tx-dlg [data-tx-mirror]')).paddingLeft]);
            assert.equal(pad[0], pad[1], 'texte et couleurs restent alignés');
            await shot('v1-numeros.png');
        });
        await t('numéros de ligne : un réglage (Affichage, et Réglages en interrupteur « (conseillé) »)', async () => {
            await p.evaluate(() => [...document.querySelectorAll('dialog.h-tx-dlg [data-tx-menus] button')].find(b => b.textContent.trim() === 'Affichage').click()); await p.waitForSelector('.ui-actmenu');
            await p.evaluate(() => [...document.querySelectorAll('.ui-actmenu .ui-actmenu-i')].find(b => /numéros de ligne/.test(b.textContent)).click()); await sleep(200);
            assert.equal((await lines()).length, 0); assert.equal(await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-editor]').classList.contains('has-ln')), false);
            const html = await p.evaluate(() => window.LCNDA_EXT.transcribePrefs.html()); assert.match(html, /class="ui-toggle h-txb-ln"><input type="checkbox" data-txb-ln >/); assert.match(html, /conseillé/);
            await p.evaluate(() => window.LCNDA_EXT.txView.setLineNos(true)); await sleep(200); assert.equal((await lines()).length, 6);
        });
        await t('textes de l’Atelier traduits (les mots qui étaient écrits en dur, et les nouveaux) dans les 31 langues', async () => {
            const KEYS = ['Naissance', 'Mariage', 'Finie', 'Texte seul', 'Image puis texte', 'Paroisse, commune', 'Note (mot illisible, signature…)', 'Loupe', 'Zoom avant', 'Largeur', 'Encre pâle', 'Lire', 'Lecture approfondie (IA)', 'Lire l’écriture à la main (rapide)', 'Lire un texte imprimé', 'Position', 'Autres outils', 'Gris', 'Miroir', 'Recettes', 'Installé', 'À installer', 'Numéros de ligne dans la marge du texte (conseillé)', 'Barre courte + « 🎚️ Mieux voir » (conseillé)', 'Remettre l’image comme au départ'];
            const langs = await p.evaluate(() => window.LCNDA_I18N.CODES.filter(c => c !== 'fr'));
            assert.ok(langs.length >= 30, String(langs));
            const missing = [];
            for (const c of langs) { const d = JSON.parse(fs.readFileSync(path.join(root, 'assets/i18n', c + '.json'), 'utf8')); KEYS.forEach(k => { if (!d[k]) missing.push(`${c}: ${k}`); }); }
            assert.deepEqual(missing, []);
        });

        /* ─── 5. téléphone (390 px) ─── */
        await t('390 px, clair et sombre : rien ne dépasse, le menu « ✨ Lire ▾ » et « 🎚️ Mieux voir » restent dans l’écran', async () => {
            await p.setViewportSize({width: 390, height: 844}); await sleep(500);
            for (const th of ['', 'dark']) {
                await theme(th); await sleep(150);
                const over = await p.evaluate(() => { const d = document.querySelector('dialog.h-tx-dlg'); return {sw: document.documentElement.scrollWidth, out: [...d.querySelectorAll('.h-tx-top > *, .h-tx-tools > *, [data-tx-bar] > *, .h-tx-editor')].filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.right > 391 || r.left < -1); }).map(e => e.className || e.tagName)}; });
                assert.ok(over.sw <= 391, 'largeur ' + over.sw);
                await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-ptab="text"]')?.click()); await sleep(200); // vague 2 : « ✨ Lire ▾ » est dans l’onglet Texte
                await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-step="read"]')?.click()); await p.click('dialog.h-tx-dlg [data-tx-cmd="readmenu"]'); await sleep(300);
                const r = await readPanel(); assert.ok(r.open && r.left >= 0 && r.right <= 390, JSON.stringify(r));
                await shot(`v1-390-lire${th ? '-sombre' : ''}.png`); await p.keyboard.press('Escape');
                await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-ptab="image"]')?.click()); await sleep(300); // vague 2 : sur téléphone, « Mieux voir » est dans l’onglet Image
                await p.click('dialog.h-tx-dlg [data-tx-cmd="better"]'); await sleep(200);
                const b = await p.evaluate(() => { const r = document.querySelector('dialog.h-tx-dlg [data-tx-panel]').getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right)]; });
                assert.ok(b[0] >= 0 && b[1] <= 390, 'Mieux voir ' + b); await p.keyboard.press('Escape');
                void over.out;
            }
            await theme(''); await p.setViewportSize({width: 1440, height: 900}); await sleep(300);
        });

        await t('aucune erreur JavaScript', async () => { assert.deepStrictEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true});
    }
    console.log(fails ? `${fails} essai(s) en échec` : 'L’Atelier, vague 1 : tout va bien.');
    process.exit(fails ? 1 : 0);
})();
