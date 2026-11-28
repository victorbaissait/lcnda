#!/usr/bin/env node
/* 🔗 Les liens entre outils de la « famille » (docs/design/outils-liens.html) :
 *  1. 🎉 Cousinades : les invités → « 🧾 Ouvrir dans le Tableur » ; l'album du jour → « 📤 Envoyer vers… » (un diaporama) ; ext.cousinade.households ;
 *  2. 📰 Faire-part : « 📬 Un faire-part par personne / par foyer » → un seul PDF (une étiquette, les foyers d'une cousinade) ;
 *  3. 🌳 Arbre décoratif : la forme « Descendance » (le moteur du grand arbre des Cousinades) ; « 📰 En faire un faire-part » (l'arbre en fond) ;
 *  4. ⚙️ Traitements par lot : ext.openBatch({items}) ; l'étape « 🎚️ Une action de la Retouche » (ext.retouchActions) ; le résultat → « 📤 Envoyer vers… » ;
 *  5. 🧩 Tableaux : une image posée → « 🎚️ Retoucher », « 📤 Envoyer vers… » ; le tableau entier en image → « Envoyer vers… » ;
 *  6. 🔤 Signatures et sceaux : openSeals({src: data:…, title}) ; « 📤 Créer et envoyer vers… » (le dessin en SVG).
 * Données fictives : familles MAZAUD, LACOMBE, DURAND.
 *   node tests/test-liens-famille.js */
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
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-liens-famille-'));
    fs.mkdirSync(path.join(tmp, 'media'));
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4'};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$ins = $pdo->prepare('INSERT INTO persons(id,first_name,last_name,gender,living_status) VALUES(?,?,?,?,?)');
foreach ([[1,'Jean','MAZAUD','male','deceased'],[2,'Marie','LACOMBE','female','deceased'],[3,'Pierre','MAZAUD','male','living'],[4,'Louise','MAZAUD','female','living'],
          [5,'Paul','DURAND','male','living'],[6,'Luc','MAZAUD','male','living'],[7,'Emma','DURAND','female','living']] as $r) $ins->execute($r);
$pdo->exec("INSERT INTO families(id,partner1_id,partner2_id) VALUES(1,1,2),(2,3,NULL),(3,5,4)");
$pdo->exec("INSERT INTO family_children(family_id,child_id) VALUES(1,3),(1,4),(2,6),(3,7)");
$pdo->exec("INSERT INTO labels(id,name,color) VALUES(1,'Faire-part 2027','#cc0000')");
$pdo->exec("INSERT INTO label_links(label_id,entity_type,entity_id) VALUES(1,'person',3),(1,'person',4)");
$png = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==');
file_put_contents(MEDIA_DIR.'/p1.png', $png); file_put_contents(MEDIA_DIR.'/p2.png', $png);
$pdo->exec("INSERT INTO media(id,title,media_type,filename) VALUES(1,'Cousinade 1','image','p1.png'),(2,'Cousinade 2','image','p2.png')");
echo 'ok';`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0 || !/ok$/.test(seed.stdout.trim())) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-d', 'post_max_size=64M', '-d', 'upload_max_filesize=64M', '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const errs = [];
    try {
        const ctx = await browser.newContext({viewport: {width: 1440, height: 900}, acceptDownloads: true});
        const p = await ctx.newPage();
        p.on('pageerror', e => errs.push(e.message));
        await p.goto(base);
        await p.waitForFunction(() => window.LCNDA_EXT?.cousinade && window.LCNDA_EXT?.cardInternals && window.LCNDA_EXT?.decorTreeInternals && window.LCNDA_EXT?.openBatch && window.LCNDA_EXT?.openSeals && window.LCNDA_EXT?.sendTo && window.LCNDA_APP?.state?.csrf, null, {timeout: 60000});
        const post = (a, b) => p.evaluate(async ([x, y]) => { const r = await window.LCNDA_APP.api(x, {}, {method: 'POST', body: y}); return r.result || r; }, [a, b]);
        // les outils qui reçoivent : remplacés par des espions (on vérifie ce qu'ils reçoivent)
        await p.evaluate(() => { const E = window.LCNDA_EXT; window.__got = {};
            E.openRowsInSheet = o => { window.__got.sheet = o; };
            E.openSlideshow = o => { window.__got.slideshow = o; };
            E.retouchMedia = m => { window.__got.retouch = m; };
            E.layoutWithMedia = (d, o) => { window.__got.layout = d; };
            E.openVectorEditor = o => { window.__got.vector = o; }; });
        const got = k => p.evaluate(k => window.__got[k] || null, k);
        const closeAll = () => p.evaluate(() => { document.querySelectorAll('dialog[open]').forEach(d => d.close()); document.querySelectorAll('.ui-actmenu').forEach(m => m.remove()); });
        const clickMenu = async text => { await p.waitForSelector(`.ui-actmenu button:has-text("${text}")`, {timeout: 8000}); await p.click(`.ui-actmenu button:has-text("${text}")`); };

        /* ═════ 1. Cousinades ═════ */
        const cous = await post('cousinade_write', {op: 'save', ancestor_id: 1, ancestor2_id: 2, include_spouses: 1, title: 'Cousinade MAZAUD', date_text: '12 juin 2027'});
        const cid = Number(cous.id);
        await t('cousinade : les invités → 🧾 Ouvrir dans le Tableur (les lignes du tableau)', async () => {
            await p.evaluate(() => { try { localStorage.setItem('lcnda-cousinade-tab', JSON.stringify('guests')); } catch (_) {} });
            await p.evaluate(id => window.LCNDA_EXT.cousinade.open(id), cid);
            await p.waitForSelector('[data-cous-export]', {timeout: 15000});
            await p.click('[data-cous-export]'); await clickMenu('Ouvrir dans le Tableur');
            await p.waitForSelector('dialog[open] [type=submit]'); await p.click('dialog[open] [type=submit]');
            await p.waitForFunction(() => window.__got.sheet, null, {timeout: 5000});
            const s = await got('sheet');
            assert.strictEqual(s.rows[0][0], 'Prénom'); assert.ok(s.rows.length >= 5, JSON.stringify(s.rows.length));
            assert.ok(s.rows.some(r => r[0] === 'Luc' && r[1] === 'MAZAUD'), 'Luc MAZAUD est dans le tableau');
            assert.ok(!s.rows[0].includes('Courriel'), 'sans les coordonnées par défaut');
            assert.match(s.name, /Invités/);
        });
        await t('cousinade : l’album du jour → 📤 Envoyer vers… → un diaporama avec les 2 photos', async () => {
            await post('cousinade_write', {op: 'options', id: cid, patch: {album: [1, 2]}});
            await p.evaluate(id => { try { localStorage.setItem('lcnda-cousinade-tab', JSON.stringify('day')); } catch (_) {} window.LCNDA_EXT.cousinade.open(id); }, cid);
            await p.waitForSelector('[data-cous-tab="day"]'); await p.click('[data-cous-tab="day"]');
            await p.waitForSelector('[data-cous-sub="album"]'); await p.click('[data-cous-sub="album"]');
            await p.waitForSelector('[data-cous-asend]', {timeout: 8000}); await p.click('[data-cous-asend]');
            await clickMenu('Dans un nouveau diaporama');
            await p.waitForFunction(() => window.__got.slideshow, null, {timeout: 5000});
            const s = await got('slideshow');
            assert.deepStrictEqual(s.preset.show.slides.map(x => x.media_id), [1, 2]); assert.match(s.preset.name, /Album/);
        });
        let H = null;
        await t('cousinade : ext.cousinade.households → les foyers invités (nom, prénoms, valeurs de l’invitation)', async () => {
            H = await p.evaluate(id => window.LCNDA_EXT.cousinade.households(id), cid);
            assert.ok(H.items.length >= 2, JSON.stringify(H)); assert.strictEqual(H.title, 'Cousinade MAZAUD');
            assert.ok(H.items.every(f => f.name && f.values.titre === 'Cousinade MAZAUD'));
            assert.ok((await p.evaluate(() => window.LCNDA_EXT.cousinade.list())).some(c => c.title === 'Cousinade MAZAUD'));
        });
        await closeAll();

        /* ═════ 2. Faire-part : publipostage ═════ */
        await t('faire-part : les mots {prenom} {nom} se remplacent pour chacun ; le nom en haut', async () => {
            const f = await p.evaluate(() => window.LCNDA_EXT.cardInternals.mergeFields({fields: [{key: 'name', role: 'name', label: 'Nom', value: '{prenom} {nom}'}, {key: 'date', role: 'date', label: 'Date', value: 'le 12 juin'}]}, {name: 'Pierre MAZAUD', values: {prenom: 'Pierre', nom: 'MAZAUD'}, fill: {date: 'ignoré'}}, {top: true}));
            assert.deepStrictEqual(f.map(x => x.value), ['Pierre MAZAUD', 'Pierre MAZAUD', 'ignoré']);
        });
        const pdfPages = async dl => { const buf = fs.readFileSync(await dl.path()); assert.strictEqual(buf.subarray(0, 5).toString(), '%PDF-'); return (buf.toString('latin1').match(/\/Type \/Page /g) || []).length; };
        await t('faire-part : 📬 un faire-part par personne d’une étiquette → un seul PDF de 2 pages', async () => {
            await p.evaluate(() => window.LCNDA_EXT.openCardMaker(null, 'invitation'));
            await p.waitForSelector('dialog[open] [data-fp-merge]');
            await p.fill('dialog[open] [name="f_name"]', '{prenom} {nom}');
            await p.click('dialog[open] [data-fp-merge]');
            await p.waitForSelector('dialog[open] [name=fpm_src][value=label]', {timeout: 8000});
            await p.check('dialog[open] [name=fpm_src][value=label]');
            await p.selectOption('dialog[open] [name=fpm_label]', '1');
            const [dl] = await Promise.all([p.waitForEvent('download', {timeout: 30000}), p.click('dialog[open]:has([name=fpm_src]) [type=submit]')]);
            assert.strictEqual(await pdfPages(dl), 2);
            assert.match(dl.suggestedFilename(), /-2\.pdf$/);
            const pm = await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-faire-part') || '{}').merge);
            assert.strictEqual(pm.src, 'label', 'le choix est retenu');
        });
        await t('faire-part : 📬 les foyers d’une cousinade → une page par foyer', async () => {
            await p.waitForSelector('dialog[open] [data-fp-merge]');
            await p.click('dialog[open] [data-fp-merge]');
            await p.waitForSelector('dialog[open] [name=fpm_src][value=cousinade]', {timeout: 8000});
            await p.check('dialog[open] [name=fpm_src][value=cousinade]');
            await p.selectOption('dialog[open] [name=fpm_cous]', String(cid));
            const [dl] = await Promise.all([p.waitForEvent('download', {timeout: 30000}), p.click('dialog[open]:has([name=fpm_src]) [type=submit]')]);
            assert.strictEqual(await pdfPages(dl), H.items.length);
        });
        await closeAll();

        /* ═════ 3. Arbre décoratif ═════ */
        await t('arbre : la forme « Descendance » (moteur des Cousinades) : une case par descendant, une couleur par branche', async () => {
            const r = await p.evaluate(async () => { const d = await window.LCNDA_EXT.decorTreeInternals.build({person: 1, shape: 'desc', gens: 3, format: 'a3', theme: 'classique', title: 'Les MAZAUD', subtitle: 'Établi en 2027'});
                const txt = JSON.stringify(d); return {count: d.count, layers: d.objs.map(l => l.name), names: (d.objs.find(l => l.name === 'Descendants').children || []).map(g => g.name), sub: txt.includes('Établi en 2027'), legend: (d.objs.find(l => l.name === 'Branches')?.children || []).map(x => x.text)}; });
            assert.strictEqual(r.count, 5, JSON.stringify(r)); // Jean, Pierre, Louise, Luc, Emma
            assert.ok(r.names.includes('Luc MAZAUD') && r.names.includes('Emma DURAND'), JSON.stringify(r.names));
            assert.ok(r.sub, 'le sous-titre tapé est gardé');
            assert.deepStrictEqual(r.legend, ['■ Pierre MAZAUD', '■ Louise MAZAUD']);
            await p.evaluate(() => window.LCNDA_EXT.openDecorTree());
            await p.waitForSelector('dialog[open] [data-dt-shape="desc"]'); await p.waitForSelector('dialog[open] [data-dt-cmd="card"]');
            await closeAll();
        });
        await t('arbre : 📰 En faire un faire-part → l’arbre en fond d’un faire-part de cousinade', async () => {
            await p.evaluate(() => { window.__got.vector = null; window.LCNDA_EXT.decorTreeInternals.treeCard({person: 1, shape: 'desc', gens: 3, format: 'a3', theme: 'classique', title: 'Grande cousinade MAZAUD'}); });
            await p.waitForSelector('dialog[open] [name=dtc_kind]'); await p.click('dialog[open] [type=submit]');
            await p.waitForFunction(() => window.__got.vector, null, {timeout: 15000});
            const v = await p.evaluate(() => { const d = window.__got.vector.doc; return {kind: d.kind, w: d.w, layers: d.objs.map(l => l.name), op: d.objs.find(l => /arbre/i.test(l.name))?.op, n: d.objs.find(l => /arbre/i.test(l.name))?.children.length, txt: JSON.stringify(d.objs.find(l => l.name === 'Textes'))}; });
            assert.strictEqual(v.kind, 'card'); assert.ok(v.layers.includes('L’arbre (en fond)'), JSON.stringify(v.layers));
            assert.ok(v.layers.indexOf('L’arbre (en fond)') < v.layers.indexOf('Textes'), 'l’arbre est derrière les textes');
            assert.ok(v.op < 1 && v.n > 5); assert.match(v.txt, /Grande cousinade MAZAUD/);
        });
        await closeAll();

        /* ═════ 4. Traitements par lot ═════ */
        await t('lot : openBatch({items}) met ces médias dans le lot ; « 🎚️ Une action de la Retouche » ; le résultat → 📤 Envoyer vers…', async () => {
            await p.evaluate(() => { window.__rt = 0; window.LCNDA_EXT.retouchActions = {list: () => [{id: 'inv', name: 'Inverser'}], apply: async (blob, id) => { window.__rt++; const bm = await createImageBitmap(blob); const c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height; const x = c.getContext('2d'); x.filter = 'invert(1)'; x.drawImage(bm, 0, 0); return new Promise(r => c.toBlob(r, 'image/png')); }}; });
            await p.evaluate(() => { window.__lot = window.LCNDA_EXT.openBatch({items: [2, 1], recipe: {out: 'copy', cards: [{type: 'retouch', p: {action: 'inv', name: 'Inverser'}}]}}); });
            await p.waitForFunction(() => window.__lot._lot.files.length === 2 && window.__lot._lot.files.every(f => f.ready), null, {timeout: 15000});
            assert.deepStrictEqual(await p.evaluate(() => window.__lot._lot.files.map(f => f.id)), [2, 1], 'les médias choisis, dans l’ordre');
            await p.waitForSelector('dialog.h-lot [data-type="retouch"] select[data-k=action] option[value=inv]', {state: 'attached', timeout: 8000});
            await p.click('dialog.h-lot [data-lot-add]'); await p.waitForSelector('.ui-actmenu button:has-text("Une action de la Retouche")'); await p.keyboard.press('Escape'); await p.evaluate(() => document.querySelectorAll('.ui-actmenu').forEach(m => m.remove()));
            await p.waitForFunction(() => !document.querySelector('dialog.h-lot [data-lot-run]').disabled, null, {timeout: 8000});
            await p.click('dialog.h-lot [data-lot-run]');
            await p.waitForFunction(() => window.__lot.dataset.lotDone, null, {timeout: 30000});
            assert.strictEqual(await p.evaluate(() => [window.__lot.dataset.lotDone, window.__lot.dataset.lotBad, window.__rt].join()), '2,0,2', await p.evaluate(() => window.__lot.querySelector('[data-lot-done]')?.textContent));
            const out = await p.evaluate(() => window.__lot._lot.outMedia);
            assert.strictEqual(out.length, 2); assert.ok(out.every(m => m.id > 2 && m.filename), JSON.stringify(out));
            await p.waitForSelector('dialog.h-lot [data-lot-send]:not([hidden])'); await p.click('dialog.h-lot [data-lot-send]');
            await clickMenu('Dans un nouveau diaporama');
            await p.waitForFunction(() => window.__got.slideshow?.preset?.show?.slides?.some(s => s.media_id > 2), null, {timeout: 5000});
        });
        await closeAll();

        /* ═════ 5. Tableaux ═════ */
        await t('tableau : une image posée → 🎚️ Retoucher et 📤 Envoyer vers… ; le tableau entier en image → Envoyer vers…', async () => {
            await p.evaluate(async () => { const r = await window.LCNDA_APP.api('save_board', {}, {method: 'POST', body: {title: 'Tableau LACOMBE', data: {items: [{id: 'im1', type: 'media', media_id: 1, x: 0, y: 0, w: 200, h: 200}, {id: 'n1', type: 'note', text: 'Note', x: 260, y: 0, w: 160, h: 100, fill: '#fff3a3'}]}}}); window.LCNDA_EXT.openBoardById(r.result?.id || r.id); });
            await p.waitForSelector('.h-board .h-board-head', {timeout: 15000}); await sleep(800);
            await p.evaluate(() => window.LCNDA_EXT.boardsInternals.current.select(['im1'])); await sleep(300);
            await p.click('.h-board [data-bd-act="retouch"]');
            assert.strictEqual((await got('retouch'))?.id, 1);
            await p.click('.h-board [data-bd-act="sendimg"]'); await clickMenu('Dans un livre de la Mise en page');
            await p.waitForFunction(() => window.__got.layout, null, {timeout: 5000});
            assert.strictEqual((await got('layout')).media.id, 1);
            await p.evaluate(() => window.LCNDA_EXT.boardsInternals.current.select(['n1'])); await sleep(300);
            assert.strictEqual(await p.$('.h-board [data-bd-act="retouch"]'), null, 'pas pour une note');
            await p.evaluate(() => { window.__got.retouch = null; });
            await p.click('.h-board [data-bd-export]'); await p.click('.h-bd-pop [data-k="send"]');
            await clickMenu('Dans la Retouche des photos');
            await p.waitForFunction(() => window.__got.retouch, null, {timeout: 15000});
            const m = await got('retouch'); assert.ok(m.id > 2 && m.filename, 'le tableau est rangé dans les médias, puis envoyé');
        });
        await closeAll();

        /* ═════ 6. Signatures et sceaux ═════ */
        await t('sceaux : openSeals({src: data:…, title}) charge l’image recadrée ; 📤 Créer et envoyer vers… (SVG)', async () => {
            await p.evaluate(() => { const c = document.createElement('canvas'); c.width = 240; c.height = 90; const x = c.getContext('2d'); x.fillStyle = '#f4ecd8'; x.fillRect(0, 0, 240, 90); x.strokeStyle = '#1a1a40'; x.lineWidth = 5; x.beginPath(); x.moveTo(20, 60); x.bezierCurveTo(60, 10, 110, 90, 150, 30); x.lineTo(220, 55); x.stroke();
                window.LCNDA_EXT.openSeals(null, {src: c.toDataURL('image/png'), title: 'Signature de Paul DURAND'}); });
            await p.waitForFunction(() => document.querySelector('dialog[open] [data-sl-name]')?.textContent === 'Signature de Paul DURAND', null, {timeout: 8000});
            await p.waitForSelector('dialog[open] [data-sl-prev] canvas', {timeout: 8000});
            await p.click('dialog[open] [data-sl-send]'); await clickMenu('Dans un livre de la Mise en page');
            await p.waitForFunction(() => window.__got.layout?.svg, null, {timeout: 8000});
            const l = await got('layout'); assert.match(l.svg, /^<svg[\s\S]*<\/svg>$/); assert.strictEqual(l.name, 'Signature');
            assert.strictEqual(await p.$('dialog[open] [data-sl-send]'), null, 'la fenêtre se ferme une fois envoyé');
            // avec un Blob aussi
            await p.evaluate(async () => { const c = document.createElement('canvas'); c.width = 50; c.height = 20; const b = await new Promise(r => c.toBlob(r, 'image/png')); window.LCNDA_EXT.openSeals(null, {src: b, title: 'Zone de l’acte'}); });
            await p.waitForFunction(() => document.querySelector('dialog[open] [data-sl-name]')?.textContent === 'Zone de l’acte', null, {timeout: 8000});
        });
        await closeAll();
        await t('aucune erreur JavaScript', async () => { assert.deepStrictEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill();
        try { fs.rmSync(tmp, {recursive: true, force: true}); } catch (_) {}
    }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})();
