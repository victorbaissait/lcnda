#!/usr/bin/env node
/* 📐📝🧾 Les liens de la Mise en page, du Traitement de texte et du Tableur avec les autres outils (docs/design/outils-liens.html) :
 *  1. ext.layoutWithMedia : une image des Médias dans un nouveau livre ; un dessin (SVG) rangé dans les Médias puis mis à la fin d'un livre ;
 *     l'image tient dans les marges de sa page ; le choix « nouveau / à la fin » est retenu ;
 *  2. Mise en page → Objet → « ✒️ Placer un dessin vectoriel » : la liste de mes dessins, le dessin posé et lié (vectorId),
 *     « ↻ Mettre à jour » le redessine quand le dessin change ;
 *  3. Traitement de texte : export ePub (le fabricant de la Mise en page), « 🎚️ Retoucher cette image », « 📤 Envoyer vers… » (le texte) ;
 *  4. Tableur : « 🎯 Préparer pour… → 📝 Un document », « 📤 Envoyer vers… » (les lignes), « ⤓ Image du graphique » (PNG).
 *   node tests/test-liens-livres.js */
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
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-liens-livres-'));
    fs.mkdirSync(path.join(tmp, 'media'));
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4'};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start) VALUES(1,'Pierre','MAZAUD','male','deceased',1)");
$img = imagecreatetruecolor(200, 100); imagefill($img, 0, 0, imagecolorallocate($img, 150, 110, 90)); imagepng($img, MEDIA_DIR . '/mazaud.png');
$pdo->exec("INSERT INTO media(id,title,media_type,filename,thumbnail) VALUES(1,'Portrait MAZAUD','image','mazaud.png','mazaud.png')");
vector_ensure($pdo);
$doc = '{"w":400,"h":200,"bg":"#ffffff","kind":"tree","objs":[{"id":"r1","type":"rect","x":10,"y":10,"w":100,"h":50,"r":0,"fill":"#aa0000","stroke":"none","sw":0}]}';
$pdo->prepare("INSERT INTO vector_docs(id,name,doc_json,thumb) VALUES(1,'Arbre LACOMBE',?, '')")->execute([$doc]);
echo json_encode(['ok' => 1]);`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0 || !/"ok"/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const errs = [];
    try {
        const ctx = await browser.newContext({viewport: {width: 1440, height: 900}, acceptDownloads: true});
        const p = await ctx.newPage();
        p.on('pageerror', e => errs.push(e.message));
        p.on('dialog', d => { errs.push('dialogue natif : ' + d.message()); d.dismiss(); });
        await p.goto(base);
        await p.waitForFunction(() => window.LCNDA_EXT?.layoutWithMedia && window.LCNDA_EXT.openTextDoc && window.LCNDA_EXT.openRowsInSheet && window.LCNDA_EXT.sendTo && window.LCNDA_EXT.vectorInternals && window.LCNDA_APP?.state?.csrf, null, {timeout: 30000});
        const OTHER = 'dialog[open]:not(.ly-editor):not(.wp-dlg):not(.xl-dlg)';
        const closeLayout = () => p.evaluate(() => document.querySelectorAll('dialog.ly-editor').forEach(d => { d.close(); d.remove(); }));
        const saveLayout = async () => {
            await p.evaluate(() => document.querySelector('dialog.ly-editor [data-ly-cmd="save"]').click());
            await p.waitForFunction(() => /Enregistré/.test(document.querySelector('dialog.ly-editor [data-ly-state]')?.textContent || ''), null, {timeout: 10000});
        };
        const docs = () => p.evaluate(async () => (await window.LCNDA_APP.api('layout_docs')).docs || []);
        const docOf = id => p.evaluate(async id => window.LCNDA_APP.api('layout_doc', {id}), id);

        let bookId = 0;
        await t('📐 layoutWithMedia : une image des Médias → un nouveau livre, l’image dans les marges de sa page', async () => {
            await p.evaluate(() => { localStorage.removeItem('genealogie-layout-send-to'); window.LCNDA_EXT.sendTo('image', {media: {id: 1, filename: 'mazaud.png', title: 'Portrait MAZAUD'}}, {to: 'layout'}); });
            await p.waitForSelector(`${OTHER} [name=to][value=new]`, {timeout: 5000});
            assert.ok(await p.$eval(`${OTHER} [name=to][value=new]`, i => i.checked), 'nouveau livre coché par défaut');
            await p.click(`${OTHER} button[type=submit]`);
            await p.waitForSelector('dialog.ly-editor[open]', {timeout: 10000});
            await sleep(400); await saveLayout();
            const list = await docs(); assert.strictEqual(list.length, 1); bookId = Number(list[0].id);
            const r = await docOf(bookId), K = await p.evaluate(() => 1);
            void K;
            const fr = r.doc.pages.flatMap(pg => pg.items).find(it => it.type === 'frame');
            assert.ok(fr, 'un cadre d’image'); assert.strictEqual(fr.src, 'media/mazaud.png'); assert.strictEqual(Number(fr.mediaId), 1); assert.strictEqual(fr.fit, 'fit');
            const box = await p.evaluate(d => window.LCNDA_EXT.layoutKit.box(window.LCNDA_EXT.layoutKit.cleanDoc(d), 0), r.doc);
            assert.ok(Math.abs(fr.w - box.w) < 0.2, `largeur = marges (${fr.w} / ${box.w})`); assert.ok(fr.h <= box.h + 0.1 && fr.x >= box.x - 0.1 && fr.y >= box.y - 0.1, 'dans les marges');
            assert.ok(Math.abs(fr.h / fr.w - 0.5) < 0.02, 'le rapport de l’image est gardé');
            await closeLayout();
        });
        await t('📐 layoutWithMedia : un dessin (SVG) → rangé dans les Médias, puis sur une nouvelle page à la fin d’un livre existant (choix retenu)', async () => {
            const nMedia0 = await p.evaluate(async () => ((await window.LCNDA_APP.api('media_av_list', {kind: 'image'})).items || []).length);
            await p.evaluate(() => window.LCNDA_EXT.layoutWithMedia({svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300" width="300" height="300"><circle cx="150" cy="150" r="120" fill="#335"/></svg>', name: 'Blason DURAND'}));
            await p.waitForSelector(`${OTHER} [name=to][value=end]`, {timeout: 5000});
            await p.evaluate(OTHER => { const d = document.querySelector(OTHER), r = d.querySelector('[name=to][value=end]'); r.checked = true; r.dispatchEvent(new Event('change', {bubbles: true})); }, OTHER);
            assert.strictEqual(await p.$eval(`${OTHER} [data-ly-pick]`, x => x.hidden), false, 'le choix du livre apparaît');
            assert.strictEqual(await p.evaluate(() => localStorage.getItem('genealogie-layout-send-to')), 'end', 'le choix est retenu');
            // le livre : le champ du choix (valeur posée comme le ferait le menu)
            const ok = await p.evaluate(({OTHER, id}) => { const f = document.querySelector(`${OTHER} form`), el = f.elements.ly; if (!el) return false; if (el.length && !el.tagName) [...el].forEach(x => { x.value = String(id); }); else el.value = String(id); return true; }, {OTHER, id: bookId});
            assert.ok(ok, 'champ « ly » présent');
            await p.click(`${OTHER} button[type=submit]`);
            await p.waitForSelector('dialog.ly-editor[open]', {timeout: 15000});
            await sleep(400); await saveLayout();
            const r = await docOf(bookId); assert.strictEqual(r.doc.pages.length, 2, 'une page de plus');
            const fr = r.doc.pages[1].items.find(it => it.type === 'frame');
            assert.ok(fr && /^media\//.test(fr.src) && fr.src !== 'media/mazaud.png' && Number(fr.mediaId) > 1, 'le dessin rangé dans les Médias : ' + JSON.stringify(fr));
            assert.ok(Math.abs(fr.h - fr.w) < 0.5, 'carré gardé');
            const nMedia1 = await p.evaluate(async () => ((await window.LCNDA_APP.api('media_av_list', {kind: 'image'})).items || []).length);
            assert.strictEqual(nMedia1, nMedia0 + 1);
            await closeLayout();
            await p.evaluate(() => window.LCNDA_EXT.layoutWithMedia({media: {id: 1, filename: 'mazaud.png'}}));
            await p.waitForSelector(`${OTHER} [name=to][value=end]`, {timeout: 5000});
            assert.ok(await p.$eval(`${OTHER} [name=to][value=end]`, i => i.checked), 'la fois suivante : « à la fin » déjà choisi');
            await p.evaluate(OTHER => document.querySelector(OTHER).close(), OTHER);
        });
        await t('✒️ Objet → Placer un dessin vectoriel : la liste, le dessin lié, « ↻ Mettre à jour » le redessine', async () => {
            await p.evaluate(id => window.LCNDA_EXT.openLayoutDoc(id), bookId);
            await p.waitForSelector('dialog.ly-editor[open]', {timeout: 10000}); await sleep(600);
            assert.ok(await p.evaluate(() => !!document.querySelector('dialog.ly-editor [data-ly-cmd="placevec"]')), 'la ligne du menu Objet');
            await p.evaluate(() => document.querySelector('dialog.ly-editor [data-ly-cmd="placevec"]').click());
            await p.waitForSelector(`${OTHER} .ly-vecpick`, {timeout: 5000});
            assert.match(await p.textContent(`${OTHER} .ly-vecpick`), /Arbre LACOMBE/);
            await p.evaluate(OTHER => { document.querySelector(`${OTHER} .ly-vecpick input`).checked = true; }, OTHER);
            await p.click(`${OTHER} button[type=submit]`);
            await p.waitForSelector('dialog.ly-editor [data-ly-editvec]', {timeout: 5000});
            await saveLayout();
            let r = await docOf(bookId); let fr = r.doc.pages.flatMap(pg => pg.items).find(it => it.vectorId);
            assert.ok(fr, 'un cadre lié au dessin'); assert.strictEqual(Number(fr.vectorId), 1); assert.strictEqual(fr.srcName, 'Arbre LACOMBE');
            const dec = s => Buffer.from(s.replace(/^data:image\/svg\+xml;base64,/, ''), 'base64').toString('utf8');
            assert.match(dec(fr.src), /#aa0000/i); assert.ok(Math.abs(fr.h / fr.w - 0.5) < 0.02, 'le rapport du dessin');
            // le dessin change : « ↻ Mettre à jour »
            await p.evaluate(async () => { const r = await window.LCNDA_APP.api('vector_doc', {id: 1}); r.doc.objs[0].fill = '#00aa00'; await window.LCNDA_APP.api('save_vector_doc', {}, {method: 'POST', body: {id: 1, name: r.name, doc: r.doc}}); });
            await p.evaluate(() => document.querySelector('dialog.ly-editor [data-ly-cmd="relink"]').click());
            await p.waitForFunction(() => /mis à jour/.test(document.querySelector('dialog.ly-editor [data-ly-msg]')?.textContent || ''), null, {timeout: 8000});
            await saveLayout();
            r = await docOf(bookId); fr = r.doc.pages.flatMap(pg => pg.items).find(it => it.vectorId);
            assert.match(dec(fr.src), /#00aa00/i, 'redessiné');
            await closeLayout();
        });

        let ed = false;
        await t('📝 Traitement de texte : export ePub (chapitres, image, notes) et la ligne dans la fenêtre d’export', async () => {
            ed = await p.evaluate(async () => {
                const E = window.LCNDA_EXT, html = '<h1 data-st="h1">Chapitre MAZAUD</h1><p data-st="normal">Pierre MAZAUD épouse Marie DURAND.</p><figure class="wp-fig" data-wrap="topbottom" data-align="center" contenteditable="false" style="width:200px"><img src="media/mazaud.png" alt="Portrait MAZAUD" data-media="1"></figure><h1 data-st="h1">Chapitre LACOMBE</h1><p data-st="normal">La famille LACOMBE.</p>';
                window.__wp = await E.openTextDoc({data: E.textDocTools.dataOf(html), name: 'Récit MAZAUD'}); return !!window.__wp;
            });
            assert.ok(ed);
            await sleep(800);
            const res = await p.evaluate(async () => { const b = await window.LCNDA_EXT.textDocTools.epubOf(window.__wp); const u8 = new Uint8Array(await b.arrayBuffer()); return {size: b.size, type: b.type, head: new TextDecoder('latin1').decode(u8.slice(0, 80)), all: new TextDecoder('latin1').decode(u8)}; });
            assert.ok(res.size > 500, 'ePub non vide'); assert.match(res.head, /^PK/); assert.match(res.head, /mimetypeapplication\/epub\+zip/);
            assert.match(res.all, /chap001\.xhtml/); assert.match(res.all, /chap002\.xhtml/); assert.match(res.all, /images\/img\d+\.png/, 'l’image est dans le livre');
            await p.evaluate(() => window.__wp.exportDialog());
            await p.waitForFunction(() => /\.epub|ePub|epub/i.test([...document.querySelectorAll('dialog[open]')].map(d => d.textContent).join(' ')), null, {timeout: 5000});
            await p.evaluate(() => [...document.querySelectorAll('dialog[open]')].filter(d => !d.classList.contains('wp-dlg') && !d.querySelector('.wp-body')).forEach(d => d.close()));
        });
        await t('📝 Traitement de texte : « 🎚️ Retoucher cette image » (clic droit sur l’image)', async () => {
            await p.evaluate(() => { window.__rt = null; window.__rtOld = window.LCNDA_EXT.retouchMedia; window.LCNDA_EXT.retouchMedia = async m => { window.__rt = m; }; });
            const pos = await p.evaluate(() => { const r = window.__wp.dlg.querySelector('figure.wp-fig img').getBoundingClientRect(); return {x: r.left + r.width / 2, y: r.top + r.height / 2}; });
            await p.mouse.click(pos.x, pos.y, {button: 'right'}); await sleep(300);
            const item = await p.evaluateHandle(() => [...document.querySelectorAll('button, [role=menuitem]')].find(b => /Retoucher cette image/.test(b.textContent) && b.offsetParent));
            assert.ok(await item.evaluate(b => !!b), 'la ligne du menu');
            await item.evaluate(b => b.click()); await sleep(200);
            assert.deepStrictEqual(await p.evaluate(() => window.__rt && {id: window.__rt.id, filename: window.__rt.filename}), {id: 1, filename: 'mazaud.png'});
            await p.evaluate(() => { window.LCNDA_EXT.retouchMedia = window.__rtOld; });
        });
        await t('📝 Traitement de texte : Fichier → « 📤 Envoyer vers… » (le texte, sans le traitement de texte)', async () => {
            await p.evaluate(() => { window.__send = null; window.__sendOld = window.LCNDA_EXT.sendTo; window.LCNDA_EXT.sendTo = (k, d, o) => { window.__send = {k, d, o: {exclude: o.exclude, title: o.title, anchor: !!o.anchor}}; }; });
            await p.evaluate(() => window.__wp.dlg.querySelector('[data-wp-cmd="sendto"]').click()); await sleep(200);
            const s = await p.evaluate(() => window.__send);
            assert.strictEqual(s.k, 'text'); assert.match(s.d.html, /Chapitre MAZAUD/); assert.strictEqual(s.d.name, 'Récit MAZAUD'); assert.deepStrictEqual(s.o.exclude, ['textdoc']); assert.ok(s.o.anchor);
            await p.evaluate(() => { window.LCNDA_EXT.sendTo = window.__sendOld; });
            const keys = await p.evaluate(() => window.LCNDA_EXT.sendTargetsFor('text', ['textdoc']).map(x => x.key));
            assert.ok(!keys.includes('textdoc'));
            await p.evaluate(() => { window.__wp.dirty = false; window.__wp.dlg.close(); });
        });

        await t('🧾 Tableur : « 🎯 Préparer pour… → 📝 Un document (Traitement de texte) »', async () => {
            await p.evaluate(async () => { window.__xl = await window.LCNDA_EXT.openRowsInSheet({name: 'Recensement LACOMBE', rows: [['Année', 'Hommes', 'Femmes'], ['1850', 12, 14], ['1860', 15, 13], ['1870', 11, 17]]}); });
            await sleep(600);
            await p.evaluate(() => { window.__xl.select(0, 0); window.__xl.select(3, 2, true); window.LCNDA_EXT.sheetCommands.prepare(window.__xl, ''); });
            await p.waitForSelector('[data-prep-to="textdoc"]', {timeout: 5000});
            assert.match(await p.textContent('[data-prep-to="textdoc"]'), /Un document \(Traitement de texte\)/);
            await p.click('[data-prep-to="textdoc"]'); await sleep(200);
            const dlgSel = 'dialog[open]:has([data-xl-prep])';
            assert.match(await p.textContent(`${dlgSel} .modal-actions [type=submit]`), /Créer le document/);
            await p.click(`${dlgSel} .modal-actions [type=submit]`);
            await p.waitForFunction(() => [...document.querySelectorAll('dialog[open] .wp-body table')].some(t => /1860/.test(t.textContent)), null, {timeout: 10000});
            const txt = await p.evaluate(() => [...document.querySelectorAll('dialog[open] .wp-body')].map(b => b.textContent).join(' '));
            assert.match(txt, /Recensement LACOMBE/); assert.match(txt, /Hommes/); assert.match(txt, /1870/);
            await p.evaluate(() => [...document.querySelectorAll('dialog[open]')].filter(d => d.querySelector('.wp-body')).forEach(d => d.close()));
        });
        await t('🧾 Tableur : Fichier → « 📤 Envoyer vers… » (les lignes, sans le tableur)', async () => {
            await p.evaluate(() => { window.__send = null; window.__sendOld = window.LCNDA_EXT.sendTo; window.LCNDA_EXT.sendTo = (k, d, o) => { window.__send = {k, d, o: {exclude: o.exclude}}; }; });
            await p.evaluate(() => { window.__xl.select(1, 1); window.__xl.dlg.querySelector('[data-xl-cmd="sendto"]').click(); }); await sleep(200);
            const s = await p.evaluate(() => window.__send);
            assert.strictEqual(s.k, 'rows'); assert.deepStrictEqual(s.o.exclude, ['sheet']); assert.deepStrictEqual(s.d.rows[0], ['Année', 'Hommes', 'Femmes']); assert.strictEqual(s.d.rows.length, 4); assert.match(s.d.name, /Recensement LACOMBE/);
            await p.evaluate(() => { window.LCNDA_EXT.sendTo = window.__sendOld; });
        });
        await t('🧾 Tableur : « ⤓ Image du graphique » (PNG) — dans 📊 Graphique ▾ et dans le graphique vivant', async () => {
            await p.evaluate(() => { window.__xl.select(0, 0); window.__xl.select(3, 2, true); });
            const dl = p.waitForEvent('download', {timeout: 10000});
            const info = await p.evaluate(async () => { const b = await window.LCNDA_EXT.sheetChartPng(window.__xl); const u8 = new Uint8Array(await b.arrayBuffer()); return {type: b.type, size: b.size, sig: [...u8.slice(1, 4)].map(c => String.fromCharCode(c)).join('')}; });
            assert.strictEqual(info.type, 'image/png'); assert.strictEqual(info.sig, 'PNG'); assert.ok(info.size > 2000, 'une vraie image');
            assert.match((await dl).suggestedFilename(), /\.png$/);
            // la ligne dans le menu 📊 Graphique ▾
            await p.evaluate(() => window.LCNDA_EXT.sheetChartMenu(window.__xl, null)); await sleep(300);
            assert.ok(await p.evaluate(() => [...document.querySelectorAll('button, [role=menuitem]')].some(b => /Image du graphique \(PNG\)/.test(b.textContent) && b.offsetParent)), 'la ligne du menu');
            await p.keyboard.press('Escape'); await sleep(200);
            // le graphique vivant : le bouton ⤓
            await p.evaluate(() => window.LCNDA_EXT.sheetCommands.livechart(window.__xl)); await sleep(500);
            assert.ok(await p.evaluate(() => !!window.__xl.dlg.querySelector('.xl-live [data-live-png]')), 'le bouton ⤓ du graphique vivant');
            const dl2 = p.waitForEvent('download', {timeout: 10000});
            await p.evaluate(() => window.__xl.dlg.querySelector('.xl-live [data-live-png]').click());
            assert.match((await dl2).suggestedFilename(), /\.png$/);
        });
        assert.deepStrictEqual(errs, [], 'erreurs JS : ' + errs.join(' | '));
    } catch (e) { fails++; console.log('✗ ' + String(e && e.stack || e)); } finally { await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true}); }
    console.log(fails ? `${fails} échec(s)` : 'tout est bon'); process.exit(fails ? 1 : 0);
})();
