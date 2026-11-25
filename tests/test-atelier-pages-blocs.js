#!/usr/bin/env node
/* 📑 L'Atelier de transcription : les pages d'un document l'une sous l'autre, chacune dans son bloc (heritage-transcribe-blocs.js) :
 *  - une barre par page « 📄 Page 2 · 3 lignes · 1 zone » (la page 1 en haut, les autres posées sur leur repère « — page 2 — ») ;
 *  - une page vide : « Page 2 vide — ✨ Lire cette page ou écris ici » ;
 *  - « ✨ Lire cette page » sur la page 2 vide : le texte lu va dans la page 2 seulement ; sur une page déjà écrite : ajouté à la fin
 *    de la page, avec « ⇄ Remplacer la page / ⚖️ Garder pour comparer / ↶ Annuler » ; ↶ Annuler remet le texte d'avant ;
 *  - une lecture lancée sur la page 2, puis la page 1 affichée : le texte va quand même dans la page 2 ;
 *  - le curseur dans un bloc montre l'image de sa page ; Ctrl/⌘ + ↓ va à la page suivante ; les repères ne se cassent pas ;
 *  - ▸ replier une page (le texte reste, les numéros des autres pages aussi), retenu pour l'acte, déplié par le curseur ; Alt + clic ;
 *  - téléphone (390 px) et thème sombre.
 *   node tests/test-atelier-pages-blocs.js   (captures : SHOTS=/chemin node tests/test-atelier-pages-blocs.js)
 * Personnes et lieux fictifs. */
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
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 30).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-pages-blocs-'));
    fs.mkdirSync(path.join(tmp, 'media'));
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4'};
    const php = code => spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], {cwd: root, encoding: 'utf8', env});
    const seed = php(String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start) VALUES(1,'Jeanne','FAURIAC','female','deceased',1)");
$cols = [[230,215,180],[214,214,232]];
foreach ([1,2] as $i) { $im = imagecreatetruecolor(600, 500); [$r,$g,$b] = $cols[$i-1]; imagefill($im, 0, 0, imagecolorallocate($im, $r, $g, $b)); $ink = imagecolorallocate($im, 60, 45, 30);
  for ($l = 0; $l < 5; $l++) for ($x = 50; $x < 550; $x += 9) imagefilledrectangle($im, $x, 50 + $l * 64, $x + 5, 70 + $l * 64, $ink);
  imagepng($im, MEDIA_DIR . "/feuillet$i.png"); }
$m = $pdo->prepare("INSERT INTO media(id,title,filename,thumbnail,media_type) VALUES(?,?,?,?,'image')");
$m->execute([1, 'Testament de Jeanne FAURIAC, feuillet 1', 'feuillet1.png', 'feuillet1.png']);
$m->execute([2, 'Testament de Jeanne FAURIAC, feuillet 2', 'feuillet2.png', 'feuillet2.png']);
act_transcriptions_ensure($pdo);
echo json_encode(['ok' => 1]);`);
    if (seed.status !== 0 || !/"ok"/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const pt = s.address().port; s.close(() => res(pt)); }); });
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
        const shot = async name => { if (SHOTS) { fs.mkdirSync(SHOTS, {recursive: true}); await p.screenshot({path: path.join(SHOTS, name)}); } };
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_EXT?.mediaPages && window.LCNDA_EXT?.onglets?.documents && window.LCNDA_EXT?.openActTranscriber && window.LCNDA_EXT?.txBlocks, null, {timeout: 30000});
        const post = (action, body) => p.evaluate(([a, b]) => window.LCNDA_APP.api(a, {}, {method: 'POST', body: b}), [action, body]);
        await post('media_pages_save', {media_id: 1, pages: [{media_id: 1, label: 'page'}, {media_id: 2, label: 'page'}]});
        const D = 'dialog.h-tx-dlg';
        // une « lecture d'imprimé » pour l'essai : deux lignes par page, la page dans le texte ; ralentie (on change de page pendant ce temps)
        await p.evaluate(() => { window.__ocrDelay = 0; window.LCNDA_APP.loadOcrEngine = async () => ({recognize: async () => { const f = document.querySelector('dialog.h-tx-dlg [data-tx-img]').getAttribute('href'); const n = (f.match(/feuillet(\d)/) || [0, '?'])[1];
            await new Promise(r => setTimeout(r, window.__ocrDelay)); window.__ocrRead = (window.__ocrRead || 0) + 1;
            return {data: {lines: [{text: `lu sur le feuillet ${n}, ligne un`, bbox: {x0: 50, y0: 50, x1: 550, y1: 70}}, {text: `lu sur le feuillet ${n}, ligne deux`, bbox: {x0: 50, y0: 114, x1: 550, y1: 134}}]}}; }}); });
        await p.evaluate(() => { localStorage.setItem('genealogie-tx-lire-choix', 'ocr'); localStorage.removeItem('genealogie-transcribe-pages-mode'); Object.keys(localStorage).filter(k => k.startsWith('genealogie-tx-pages-pliees-')).forEach(k => localStorage.removeItem(k)); });
        const closeAtelier = async () => { await p.evaluate(() => { const d = document.querySelector('dialog.h-tx-dlg'); if (d) d.querySelector('[data-tx-cmd="close"]')?.click(); }); await sleep(250);
            await p.evaluate(() => { const c = [...document.querySelectorAll('dialog[open]')].find(d => /Fermer sans enregistrer/.test(d.textContent) && !d.classList.contains('h-tx-dlg')); c?.querySelector('button.danger, [value="default"], button[type="submit"]')?.click(); }); await sleep(250);
            await p.evaluate(() => document.querySelectorAll('dialog.h-tx-dlg').forEach(d => { try { d.close(); } catch (_) {} d.remove(); })); };
        const openTx = async c => { await closeAtelier(); await p.evaluate(x => window.LCNDA_EXT.openActTranscriber(x), c);
            await p.waitForFunction(() => document.querySelector('dialog.h-tx-dlg [data-tx-img]')?.getAttribute('href'), null, {timeout: 15000}); await sleep(600); };
        const st = () => p.evaluate(() => { const d = document.querySelector('dialog.h-tx-dlg'), a = d.querySelector('[data-tx-body]');
            return {body: a.value, href: d.querySelector('[data-tx-img]').getAttribute('href'), on: d.querySelector('[data-tx-page].is-on')?.dataset.txPage,
                heads: [...d.querySelectorAll('[data-tx-pghd]')].map(h => ({seg: h.dataset.seg, text: h.querySelector('.h-tx-pgt').textContent, on: h.classList.contains('is-on'), fold: h.classList.contains('is-fold'), top: Math.round(h.getBoundingClientRect().top - d.querySelector('[data-tx-editor]').getBoundingClientRect().top)})),
                empty: [...d.querySelectorAll('[data-tx-pgempty]')].map(h => ({seg: h.dataset.seg, text: h.textContent})), covers: [...d.querySelectorAll('[data-tx-pgcover]')].map(h => h.dataset.seg),
                place: d.querySelector('[data-tx-placebar]')?.textContent || '', zones: d.txApi.get().data.zones.map(z => ({p: z.p, t: a.value.slice(z.s, z.e), src: z.src || ''}))}; });
        const setBody = v => p.evaluate(x => { const a = document.querySelector('dialog.h-tx-dlg [data-tx-body]'); a.value = x; a.dispatchEvent(new Event('input')); }, v);
        const caretAt = pos => p.evaluate(x => { const a = document.querySelector('dialog.h-tx-dlg [data-tx-body]'); a.focus(); a.setSelectionRange(x, x); a.dispatchEvent(new MouseEvent('click', {bubbles: true})); }, pos);
        const segs = b => b.split(/\n— page \d —\n?/);
        const clickRead = async seg => { await p.evaluate(i => { const d = document.querySelector('dialog.h-tx-dlg'); const h = d.querySelector(`[data-tx-pgempty][data-seg="${i}"] [data-tx-pgread]`) || d.querySelector(`[data-tx-pghd][data-seg="${i}"] [data-tx-pgread]`); h.click(); }, seg); };
        const waitRead = async n => p.waitForFunction(k => (window.__ocrRead || 0) >= k, n, {timeout: 10000}).then(() => sleep(500));

        await t('deux pages : une barre par page (« 📄 Page 1 · … »), la page 2 vide invite à lire ou écrire', async () => {
            await openTx({mediaId: 1, filename: 'feuillet1.png', title: 'Testament de Jeanne FAURIAC'});
            await setBody('Au nom de Dieu, moi Jeanne FAURIAC,\nveuve de Antoine LESCURE, demeurant à Uzerche,\nsaine d’esprit, fais mon testament.\n— page 2 —\n');
            await sleep(300); const s = await st();
            assert.equal(s.heads.length, 2, JSON.stringify(s.heads));
            assert.match(s.heads[0].text, /^📄 Page 1 · 3 lignes · 0 zone$/, s.heads[0].text); assert.match(s.heads[1].text, /^📄 Page 2 · 0 ligne · 0 zone$/, s.heads[1].text);
            assert.ok(s.heads[0].on && !s.heads[1].on, 'la page affichée est en avant');
            assert.ok(s.heads[1].top > s.heads[0].top + 40, 'la page 2 est sous la page 1 : ' + JSON.stringify(s.heads));
            assert.deepEqual(s.empty.map(e => e.seg), ['1']); assert.match(s.empty[0].text, /Page 2 vide — ✨ Lire cette page ou écris ici/);
            // la barre de la page 2 est posée sur la ligne de son repère (le repère ne se voit pas dessous)
            const cover = await p.evaluate(() => { const d = document.querySelector('dialog.h-tx-dlg'), h = d.querySelector('[data-tx-pghd][data-seg="1"]').getBoundingClientRect(), m = d.querySelector('[data-mk="0"]').getClientRects()[0];
                return {dh: Math.abs(h.top - m.top), bg: getComputedStyle(d.querySelector('[data-tx-pghd]')).backgroundColor}; });
            assert.ok(cover.dh <= 2, 'barre sur le repère : ' + JSON.stringify(cover)); assert.notEqual(cover.bg, 'rgba(0, 0, 0, 0)');
            await shot('blocs-deux-pages.png');
        });
        await t('le curseur dans le bloc de la page 2 montre l’image de la page 2 ; dans la page 1, la page 1', async () => {
            const b = (await st()).body; await caretAt(b.length);
            await p.waitForFunction(() => document.querySelector('dialog.h-tx-dlg [data-tx-page].is-on')?.dataset.txPage === '1', null, {timeout: 5000});
            let s = await st(); assert.match(s.href, /feuillet2\.png/); assert.ok(s.heads[1].on);
            await caretAt(5); await p.waitForFunction(() => document.querySelector('dialog.h-tx-dlg [data-tx-page].is-on')?.dataset.txPage === '0', null, {timeout: 5000});
            s = await st(); assert.match(s.href, /feuillet1\.png/);
        });
        await t('écrire sur la ligne vide de la page 2 (la dernière) : le repère reste entier', async () => {
            const b = (await st()).body; await caretAt(b.length); await sleep(300);
            await p.keyboard.type('x'); await sleep(200);
            const s = await st(); assert.match(s.body, /\n— page 2 —\nx$/, JSON.stringify(s.body.slice(-20)));
            await p.keyboard.press('Backspace'); await sleep(200);
            const s2 = await st(); assert.match(s2.body, /\n— page 2 —\n?$/);
            await setBody(b);
        });
        await t('les repères ne se cassent pas : Retour arrière au début de la page 2 ne colle pas les pages', async () => {
            const b0 = (await st()).body, at = b0.indexOf('— page 2 —');
            await caretAt(at + 3); await p.keyboard.type('zz'); await sleep(150);
            await caretAt(at); await p.keyboard.press('Backspace'); await sleep(150);
            assert.equal((await st()).body, b0, 'texte inchangé');
        });
        await t('✨ Lire cette page sur la page 2 vide : le texte lu va dans la page 2 seulement, ses zones sur la page 2', async () => {
            const b0 = (await st()).body; await clickRead(1); await waitRead(1);
            const s = await st(), sg = segs(s.body);
            assert.equal(sg[0], segs(b0)[0], 'la page 1 ne bouge pas');
            assert.equal(sg[1].trim(), 'lu sur le feuillet 2, ligne un\nlu sur le feuillet 2, ligne deux');
            assert.deepEqual(s.zones.filter(z => z.src === 'ocr').map(z => [z.p, z.t]), [[2, 'lu sur le feuillet 2, ligne un'], [2, 'lu sur le feuillet 2, ligne deux']]);
            assert.equal(s.place, '', 'page vide : remplie sans question');
            assert.match(s.heads[1].text, /Page 2 · 2 lignes · 2 zones/); assert.equal(s.empty.length, 0);
            assert.match(s.href, /feuillet2\.png/);
        });
        await t('page 2 déjà écrite : la lecture est ajoutée à la fin de la page, le choix proposé ; ↶ Annuler remet le texte d’avant', async () => {
            const b0 = (await st()).body, z0 = (await st()).zones; await clickRead(1); await waitRead(2);
            let s = await st();
            assert.match(s.place, /Page 2 avait déjà du texte/); ['Remplacer la page', 'Ajouter à la fin de la page', 'Garder pour comparer', 'Annuler'].forEach(x => assert.ok(s.place.includes(x), x));
            assert.equal(segs(s.body)[1].trim().split('\n').filter(l => l.trim()).length, 4, 'ajoutée à la fin de la page 2'); assert.equal(segs(s.body)[0], segs(b0)[0]);
            await p.click(`${D} [data-tx-placebar] [data-tx-place="undo"]`); await sleep(300);
            s = await st(); assert.equal(s.body, b0, '↶ Annuler : le texte d’avant'); assert.deepEqual(s.zones, z0); assert.equal(s.place, '');
            // et ⌘Z (un seul historique) refait / défait comme le reste
            const hasUndo = await p.evaluate(() => [...document.querySelectorAll('.ui-toast')].some(x => /Lecture retirée de Page 2/.test(x.textContent)));
            assert.ok(hasUndo, 'un message « ↶ Annuler » dit ce qui a été fait');
        });
        await t('⇄ Remplacer la page : la page 2 = la lecture, la page 1 intacte, ses zones reliées ligne à ligne ; ↶ Annuler', async () => {
            // une zone dessinée à la main sur la 1re ligne de la page 2 : elle suit la 1re ligne de la nouvelle lecture
            await p.evaluate(() => { const d = document.querySelector('dialog.h-tx-dlg'), g = d.txApi.get(), a = d.querySelector('[data-tx-body]').value, s = a.indexOf('lu sur le feuillet 2, ligne un');
                g.data.zones = g.data.zones.filter(z => !z.src); g.data.zones.push({id: 'zmain', x: 40, y: 40, w: 520, h: 40, s, e: s + 'lu sur le feuillet 2, ligne un'.length, p: 2, note: '', c: ''}); d.txApi.touch(); });
            await p.evaluate(() => { window.__ocrRead = 1; });
            await p.evaluate(() => { const r0 = window.LCNDA_APP.loadOcrEngine; window.LCNDA_APP.loadOcrEngine = async () => { const T = await r0(); return {recognize: async (...a) => { const r = await T.recognize(...a); r.data.lines.forEach(l => { l.text = l.text.replace('lu sur', 'relu sur'); }); return r; }}; }; });
            const b0 = (await st()).body; await clickRead(1); await waitRead(2);
            await p.click(`${D} [data-tx-placebar] [data-tx-place="replace"]`); await sleep(400);
            const s = await st(), sg = segs(s.body);
            assert.equal(sg[0], segs(b0)[0]); assert.equal(sg[1].trim(), 'relu sur le feuillet 2, ligne un\nrelu sur le feuillet 2, ligne deux');
            const zm = s.zones.find(z => !z.src); if (process.env.DBG) console.log(JSON.stringify(s.zones), JSON.stringify(s.body)); assert.equal(zm.t, 'relu sur le feuillet 2, ligne un', 'la zone à la main suit sa ligne');
            assert.equal(s.zones.filter(z => z.src === 'ocr').length, 2, 'les zones de la nouvelle lecture, pas celles d’avant en double');
            await p.evaluate(() => { const tt = [...document.querySelectorAll('.ui-toast')].filter(x => /à la place du texte de Page 2/.test(x.textContent)).at(-1); [...tt.querySelectorAll('button')].find(x => /Annuler/.test(x.textContent)).click(); }); await sleep(400);
            assert.equal(segs((await st()).body)[1].trim().split('\n').filter(l => l.trim()).length, 4, '↶ Annuler : revenu au texte ajouté (avant le choix)');
        });
        await t('une lecture lancée sur la page 2, puis la page 1 affichée : le texte va quand même dans la page 2', async () => {
            await setBody('Au nom de Dieu, moi Jeanne FAURIAC,\nveuve de Antoine LESCURE.\n— page 2 —\n'); await sleep(200);
            await p.evaluate(() => { window.__ocrDelay = 900; window.__ocrRead = 0; });
            await clickRead(1); await sleep(300);
            await p.click(`${D} [data-tx-page="0"]`); await waitRead(1); await sleep(300);
            const s = await st(), sg = segs(s.body);
            assert.equal(sg[0].trim(), 'Au nom de Dieu, moi Jeanne FAURIAC,\nveuve de Antoine LESCURE.'); assert.match(sg[1], /feuillet 2, ligne un/);
            assert.ok(s.zones.filter(z => z.src === 'ocr').every(z => z.p === 2), 'ses zones sur la page 2 : ' + JSON.stringify(s.zones));
            await p.evaluate(() => { window.__ocrDelay = 0; });
        });
        await t('Ctrl/⌘ + ↓ : le début de la page suivante (l’image suit) ; Ctrl/⌘ + ↑ : la page d’avant', async () => {
            await caretAt(3); await sleep(300);
            await p.keyboard.press('Control+ArrowDown'); await sleep(500);
            let s = await st(); const b = s.body, at = await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-body]').selectionStart);
            assert.equal(at, b.indexOf('— page 2 —') + '— page 2 —\n'.length); assert.equal(s.on, '1'); assert.match(s.href, /feuillet2\.png/);
            await p.keyboard.press('Control+ArrowUp'); await sleep(500);
            s = await st(); assert.equal(await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-body]').selectionStart), 0); assert.equal(s.on, '0');
        });
        await t('▸ replier la page 1 : son texte reste (gardé, cherché), les numéros de la page 2 ne changent pas ; retenu ; le curseur la déplie', async () => {
            const nums = () => p.evaluate(() => [...document.querySelectorAll('dialog.h-tx-dlg .h-tx-mirror .h-tx-ln')].map(x => x.dataset.n).join(','));
            const n0 = await nums(), b0 = (await st()).body;
            await p.click(`${D} [data-tx-pghd][data-seg="0"] [data-tx-pgfold]`); await sleep(300);
            let s = await st(); assert.ok(s.heads.find(h => h.seg === '0').fold); assert.deepEqual(s.covers, ['0']); assert.equal(s.body, b0, 'le texte n’est pas touché'); assert.equal(await nums(), n0);
            const key = await p.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('genealogie-tx-pages-pliees-')).map(k => [k, localStorage.getItem(k)]));
            assert.equal(key.length, 1); assert.equal(key[0][1], '[1]');
            assert.equal(await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-pghd][data-seg="0"] [data-tx-pgfold]').getAttribute('aria-expanded')), 'false');
            // le curseur dans la page repliée (un clic, une recherche…) : elle se déplie
            await caretAt(4); await sleep(300); s = await st(); assert.ok(!s.heads.find(h => h.seg === '0').fold); assert.deepEqual(s.covers, []);
            // Entrée sur le triangle : replier ; Alt + clic : toutes les pages
            await p.focus(`${D} [data-tx-pghd][data-seg="0"] [data-tx-pgfold]`); await p.keyboard.press('Enter'); await sleep(200);
            assert.ok((await st()).heads.find(h => h.seg === '0').fold, 'Entrée replie');
            await p.click(`${D} [data-tx-pghd][data-seg="1"] .h-tx-pgt`, {modifiers: ['Alt']}); await sleep(300);
            s = await st(); assert.ok(s.heads.every(h => h.fold), 'Alt + clic : toutes repliées ' + JSON.stringify(s.heads));
            // une lecture posée dans une page repliée la déplie
            await clickRead(1); await waitRead(1); await sleep(300);
            s = await st(); assert.ok(!s.heads.find(h => h.seg === '1').fold, 'la page lue se déplie');
            await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-placebar] [data-tx-place="undo"]')?.click()); await sleep(200);
            // ↶ ⌘Z reste un seul historique, page repliée ou non
            const before = (await st()).body; await setBody(before + 'ajout'); await sleep(1200);
            await p.evaluate(() => { const a = document.querySelector('dialog.h-tx-dlg [data-tx-body]'); a.focus(); }); await p.keyboard.press('Control+z'); await sleep(400);
            assert.equal((await st()).body, before, '⌘Z défait la frappe');
            await p.click(`${D} [data-tx-pghd][data-seg="1"] .h-tx-pgt`, {modifiers: ['Alt']}); await sleep(200);
            assert.ok((await st()).heads.every(h => h.fold), 'Alt + clic, une page ouverte : toutes repliées');
            await p.click(`${D} [data-tx-pghd][data-seg="1"] .h-tx-pgt`, {modifiers: ['Alt']}); await sleep(200);
            assert.ok((await st()).heads.every(h => !h.fold), 'Alt + clic, toutes repliées : toutes dépliées');
        });
        await t('↦ Voir l’image : la page de ce bloc s’affiche', async () => {
            await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-pghd][data-seg="1"] [data-tx-pgshow]').click()); await sleep(600);
            const s = await st(); assert.equal(s.on, '1'); assert.match(s.href, /feuillet2\.png/);
        });
        await t('le texte long : la barre de la page reste en haut pendant qu’on fait défiler sa page', async () => {
            const long = Array.from({length: 60}, (_, i) => `ligne ${i + 1} de la page un`).join('\n');
            await setBody(long + '\n— page 2 —\n' + Array.from({length: 40}, (_, i) => `ligne ${i + 1} de la page deux`).join('\n') + '\n'); await sleep(300);
            await p.evaluate(() => { const a = document.querySelector('dialog.h-tx-dlg [data-tx-body]'); a.scrollTop = 400; a.dispatchEvent(new Event('scroll')); }); await sleep(300);
            const s = await st(); const h0 = s.heads.find(h => h.seg === '0'); assert.ok(h0 && h0.top === 0, 'page 1 collée en haut : ' + JSON.stringify(s.heads));
        });
        await t('thème sombre : les barres et la page vide suivent', async () => {
            await setBody('Au nom de Dieu.\n— page 2 —\n'); await sleep(200);
            await p.evaluate(() => { document.documentElement.dataset.theme = 'dark'; }); await sleep(200);
            const c = await p.evaluate(() => { const d = document.querySelector('dialog.h-tx-dlg'); return {hd: getComputedStyle(d.querySelector('[data-tx-pghd]')).backgroundColor, btn: getComputedStyle(d.querySelector('[data-tx-pgempty] button')).backgroundColor}; });
            const lum = s => { const m = s.match(/\d+/g).map(Number); return (m[0] + m[1] + m[2]) / 3; };
            assert.ok(lum(c.hd) < 80 && lum(c.btn) < 80, JSON.stringify(c));
            await shot('blocs-sombre.png');
            await p.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
        });
        await t('téléphone 390 px : barres compactes, sans débordement, « ✨ » en symbole', async () => {
            await p.setViewportSize({width: 390, height: 800}); await sleep(600);
            await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-ptab="text"]')?.click()); await sleep(500);
            const r = await p.evaluate(() => { const d = document.querySelector('dialog.h-tx-dlg'), h = d.querySelector('[data-tx-pghd]'), e = d.querySelector('[data-tx-editor]').getBoundingClientRect(), hr = h.getBoundingClientRect();
                return {w: hr.width, ew: e.width, right: hr.right, eright: e.right, lab: getComputedStyle(h.querySelector('.h-tx-pgl')).display, scroll: document.documentElement.scrollWidth, h: hr.height}; });
            assert.ok(r.w > 200 && r.right <= r.eright + 1, JSON.stringify(r)); assert.equal(r.lab, 'none'); assert.ok(r.scroll <= 391, 'pas de défilement de côté : ' + r.scroll); assert.ok(r.h <= 30);
            await shot('blocs-390.png');
            await p.setViewportSize({width: 1440, height: 900}); await sleep(400);
        });
        await t('un acte d’une seule page : pas de barre de page', async () => {
            await post('media_pages_save', {media_id: 1, pages: []});
            await openTx({mediaId: 2, filename: 'feuillet2.png', title: 'Feuillet seul'});
            assert.equal((await st()).heads.length, 0);
            assert.equal(await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-editor]').classList.contains('has-pgblocks')), false);
            await closeAtelier();
        });
        await t('aucune erreur JavaScript', async () => { assert.deepEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill();
        fs.rmSync(tmp, {recursive: true, force: true});
    }
    console.log(fails ? `${fails} essai(s) en échec` : 'Les pages en blocs marchent.');
    process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
