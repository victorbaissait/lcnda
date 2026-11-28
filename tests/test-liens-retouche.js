#!/usr/bin/env node
/* 🔗 Liens entre les outils — 🎚️ Retouche des photos et 🔍 Comparer deux photos (docs/design/outils-liens.html).
 *  1. ext.retouchMedia(media) ouvre la Retouche sur une photo des médias (la visionneuse retrouve ce qu'elle montrait) ;
 *  2. Retouche → Fichier → « 📤 Envoyer vers… » : le menu commun, sans la Retouche elle-même ;
 *  3. export de la Retouche : WebP et TIFF (TIFF de base sans compression, relu octet par octet) ;
 *  4. ext.retouchActions : list() et apply(blob, id) (pour les Traitements par lot) ;
 *  5. Comparer deux photos : ⤓ Exporter l'image (côte à côte, fondu, rideau), 🖨 Imprimer, 📤 Envoyer vers… (image et compte rendu), 🎚️ Retoucher.
 *   node tests/test-liens-retouche.js */
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
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-lr-'));
    fs.mkdirSync(path.join(tmp, 'media'));
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4'};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(first_name,last_name,gender,living_status) VALUES('Pierre','MAZAUD','male','deceased')");
$pdo->exec("INSERT INTO media(title, filename, thumbnail, media_type) VALUES('Pierre MAZAUD en 1910','rouge.png','rouge.png','image'),('Pierre MAZAUD vers 1940','bleu.png','bleu.png','image')");
echo json_encode(['ok' => 1]);`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0 || !/ok/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
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
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_EXT?.retouchMedia && window.LCNDA_EXT?.openPhotoCompare && window.LCNDA_EXT?.sendTo && window.LCNDA_APP?.state?.csrf, null, {timeout: 30000});
        // deux photos : une rouge, une bleue (les fichiers des médias)
        for (const [name, color] of [['rouge.png', '#c8102e'], ['bleu.png', '#1f4fd8']]) {
            const b64 = await p.evaluate(col => { const c = document.createElement('canvas'); c.width = 240; c.height = 180; const g = c.getContext('2d'); g.fillStyle = col; g.fillRect(0, 0, 240, 180); g.fillStyle = '#fff'; g.fillRect(100, 60, 40, 40); return c.toDataURL('image/png').split(',')[1]; }, color);
            fs.writeFileSync(path.join(tmp, 'media', name), Buffer.from(b64, 'base64'));
        }
        const closeAll = () => p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close()));
        const menuTexts = () => p.evaluate(() => [...document.querySelectorAll('.ui-actmenu')].pop()?.textContent || '');

        await t('1. ext.retouchMedia ouvre la Retouche sur la photo ; la visionneuse retrouve ce qu’elle montrait', async () => {
            await p.evaluate(() => { try { localStorage.setItem('genealogie-retouch-mode', 'advanced'); } catch (_) {} const s = window.LCNDA_APP.state; s.lightboxMedia = [{id: 99, filename: 'autre.png'}]; s.lightboxIndex = 0; });
            await p.evaluate(() => window.LCNDA_EXT.retouchMedia({id: 1, filename: 'rouge.png', title: 'Pierre MAZAUD en 1910'}));
            await p.waitForSelector('dialog[open] [data-rt-name]', {timeout: 15000});
            assert.strictEqual(await p.inputValue('dialog[open] [data-rt-name]'), 'Pierre MAZAUD en 1910');
            assert.deepStrictEqual(await p.evaluate(() => [window.LCNDA_APP.state.lightboxMedia[0].id, window.LCNDA_APP.state.lightboxIndex]), [99, 0]);
            // sans photo : un message, pas d'erreur
            await p.evaluate(() => window.LCNDA_EXT.retouchMedia({}));
        });

        await t('2. Retouche → Fichier → « 📤 Envoyer vers… » : le menu commun, sans la Retouche', async () => {
            const lab = await p.evaluate(() => document.querySelector('dialog[open] [data-rt-cmd="send"]')?.textContent.trim());
            assert.strictEqual(lab, '📤 Envoyer vers…');
            await p.evaluate(() => document.querySelector('dialog[open] [data-rt-cmd="send"]').click());
            await p.waitForFunction(() => /Envoyer l’image vers/.test([...document.querySelectorAll('.ui-actmenu')].pop()?.textContent || ''), null, {timeout: 10000});
            const txt = await menuTexts();
            assert.ok(!/Dans la Retouche des photos/.test(txt), txt);
            assert.ok(/Comparer avec une autre photo/.test(txt), txt);
            await p.keyboard.press('Escape');
        });

        await t('3. export de la Retouche : WebP et TIFF (TIFF relu octet par octet)', async () => {
            await p.evaluate(() => document.querySelector('dialog[open] [data-rt-cmd="export:image"]').click());
            await p.waitForSelector('dialog.ui-export [data-fmt="tiff"]', {timeout: 10000});
            assert.ok(await p.$('dialog.ui-export [data-fmt="webp"]'));
            await p.click('dialog.ui-export [data-fmt="tiff"]');
            const [dl] = await Promise.all([p.waitForEvent('download'), p.click('dialog.ui-export [data-ui-go]')]);
            assert.match(dl.suggestedFilename(), /\.tif$/);
            const b = fs.readFileSync(await dl.path());
            assert.strictEqual(b.toString('latin1', 0, 2), 'II'); assert.strictEqual(b.readUInt16LE(2), 42);
            const ifd = b.readUInt32LE(4), n = b.readUInt16LE(ifd), tag = {};
            for (let i = 0; i < n; i++) { const o = ifd + 2 + i * 12, ty = b.readUInt16LE(o + 2); tag[b.readUInt16LE(o)] = ty === 3 && b.readUInt32LE(o + 4) === 1 ? b.readUInt16LE(o + 8) : b.readUInt32LE(o + 8); }
            assert.strictEqual(tag[256], 240); assert.strictEqual(tag[257], 180); assert.strictEqual(tag[259], 1); assert.strictEqual(tag[262], 2); assert.strictEqual(tag[277], 3);
            assert.strictEqual(tag[279], 240 * 180 * 3); assert.strictEqual(b.length, tag[273] + tag[279]);
            const px = tag[273]; assert.deepStrictEqual([b[px], b[px + 1], b[px + 2]], [0xc8, 0x10, 0x2e]); // le rouge, en haut à gauche
            const mid = tag[273] + (80 * 240 + 120) * 3; assert.deepStrictEqual([b[mid], b[mid + 1], b[mid + 2]], [255, 255, 255]);
            // une image transparente : RVBA (ExtraSamples)
            const rgba = await p.evaluate(() => { const c = document.createElement('canvas'); c.width = 4; c.height = 2; const g = c.getContext('2d'); g.fillStyle = 'rgba(0,128,0,0.5)'; g.fillRect(0, 0, 2, 2); return [...new Uint8Array(window.LCNDA_EXT.rtTiff(c))]; });
            const rb = Buffer.from(rgba), rifd = rb.readUInt32LE(4), rn = rb.readUInt16LE(rifd), rtags = {};
            for (let i = 0; i < rn; i++) { const o = rifd + 2 + i * 12; rtags[rb.readUInt16LE(o)] = rb.readUInt16LE(o + 8); }
            assert.strictEqual(rtags[277], 4); assert.strictEqual(rtags[338], 2);
            // WebP
            await p.evaluate(() => document.querySelector('dialog[open] [data-rt-cmd="export:image"]').click());
            await p.waitForSelector('dialog.ui-export [data-fmt="webp"]');
            await p.click('dialog.ui-export [data-fmt="webp"]');
            const [dw] = await Promise.all([p.waitForEvent('download'), p.click('dialog.ui-export [data-ui-go]')]);
            assert.match(dw.suggestedFilename(), /\.webp$/);
            const w = fs.readFileSync(await dw.path()); assert.strictEqual(w.toString('latin1', 0, 4), 'RIFF'); assert.strictEqual(w.toString('latin1', 8, 12), 'WEBP');
            await closeAll();
        });

        await t('4. ext.retouchActions : list() et apply(blob, id) rejouent une action enregistrée', async () => {
            const r = await p.evaluate(async () => {
                localStorage.setItem('genealogie-retouch-actions', JSON.stringify([{name: 'Album LACOMBE 1930', at: 1700000000000, st: {brightness: 60}, adj: []}, {name: 'Noir et blanc DURAND', at: 1700000000001, st: {saturation: -100}, adj: []}]));
                const A = window.LCNDA_EXT.retouchActions, list = A.list();
                const c = document.createElement('canvas'); c.width = 20; c.height = 10; const g = c.getContext('2d'); g.fillStyle = 'rgb(100,100,100)'; g.fillRect(0, 0, 20, 10);
                const blob = await new Promise(res => c.toBlob(res, 'image/png'));
                const read = async b => { const im = await createImageBitmap(b), k = document.createElement('canvas'); k.width = im.width; k.height = im.height; const x = k.getContext('2d'); x.drawImage(im, 0, 0); return [...x.getImageData(5, 5, 1, 1).data]; };
                const out = await A.apply(blob, list[0].id);
                let err = ''; try { await A.apply(blob, 'nope'); } catch (e) { err = e.message; }
                const col = document.createElement('canvas'); col.width = 4; col.height = 4; const cg = col.getContext('2d'); cg.fillStyle = 'rgb(200,40,40)'; cg.fillRect(0, 0, 4, 4);
                const out2 = await A.apply(await new Promise(res => col.toBlob(res, 'image/jpeg', 0.95)), list[1].id);
                const im2 = await createImageBitmap(out2), k2 = document.createElement('canvas'); k2.width = 4; k2.height = 4; k2.getContext('2d').drawImage(im2, 0, 0); const p2 = [...k2.getContext('2d').getImageData(2, 2, 1, 1).data];
                return {list, type: out.type, before: await read(blob), after: await read(out), err, type2: out2.type, p2};
            });
            assert.deepStrictEqual(r.list.map(x => x.name), ['Album LACOMBE 1930', 'Noir et blanc DURAND']);
            assert.ok(r.list.every(x => typeof x.id === 'string' && x.id));
            assert.strictEqual(r.type, 'image/png');
            assert.ok(r.after[0] > r.before[0] + 10, JSON.stringify(r));
            assert.match(r.err, /n’existe plus/);
            assert.strictEqual(r.type2, 'image/jpeg');
            assert.ok(Math.abs(r.p2[0] - r.p2[1]) < 12 && Math.abs(r.p2[1] - r.p2[2]) < 12, JSON.stringify(r.p2)); // noir et blanc
        });

        await t('5a. Comparer : l’image composée (côte à côte, fondu, rideau) et « ⤓ Exporter l’image »', async () => {
            await p.evaluate(async () => { window.__pc = await window.LCNDA_EXT.openPhotoCompare({a: 1, b: 2}); });
            await p.waitForFunction(() => window.__pc?.state?.a?.img && window.__pc?.state?.b?.img, null, {timeout: 15000});
            await p.waitForTimeout(300);
            const r = await p.evaluate(async () => {
                const T = window.__pc, st = T.state, px = (c, fx, fy) => [...c.getContext('2d').getImageData(Math.round(c.width * fx), Math.round(c.height * fy), 1, 1).data].slice(0, 3);
                st.mode = 'side'; const s = T.composeCanvas(); const side = [px(s, 0.15, 0.25), px(s, 0.65, 0.25), s.width];
                st.mode = 'fade'; st.mix = 50; const f = T.composeCanvas(); const fade = px(f, 0.3, 0.25);
                st.mode = 'curtain'; st.mix = 50; const c = T.composeCanvas(); const cur = [px(c, 0.3, 0.25), px(c, 0.7, 0.25)];
                st.mode = 'side'; T.draw();
                return {side, fade, cur};
            });
            const isRed = c => c[0] > 150 && c[2] < 90, isBlue = c => c[2] > 150 && c[0] < 90;
            assert.ok(isRed(r.side[0]) && isBlue(r.side[1]) && r.side[2] >= 1400, JSON.stringify(r.side));
            assert.ok(r.fade[0] > 80 && r.fade[2] > 80, JSON.stringify(r.fade)); // un mélange des deux
            assert.ok(isRed(r.cur[0]) && isBlue(r.cur[1]), JSON.stringify(r.cur));
            await p.click('.h-pc-dlg [data-pc-cmd="export"]');
            await p.waitForFunction(() => /Exporter l’image/.test([...document.querySelectorAll('.ui-actmenu')].pop()?.textContent || ''));
            await p.evaluate(() => [...[...document.querySelectorAll('.ui-actmenu')].pop().querySelectorAll('button')].find(b => /Exporter l’image/.test(b.textContent)).click());
            await p.waitForSelector('dialog.ui-export [data-fmt="png"]');
            await p.click('dialog.ui-export [data-fmt="png"]');
            const [dl] = await Promise.all([p.waitForEvent('download'), p.click('dialog.ui-export [data-ui-go]')]);
            const b = fs.readFileSync(await dl.path()); assert.strictEqual(b.readUInt32BE(0), 0x89504e47); assert.ok(b.readUInt32BE(16) >= 1400);
        });

        await t('5b. Comparer : « 🖨 Imprimer » les deux photos, la ressemblance et les notes', async () => {
            const html = await p.evaluate(async () => {
                const T = window.__pc; T.state.notes = 'Même oreille.\nMême nez que DURAND.'; T.state.verdict = window.LCNDA_EXT.photoCompareVerdict(0.42);
                const UI = window.LCNDA_UI, keep = UI.openPrintDialog; let got = null; UI.openPrintDialog = o => { got = o; return Promise.resolve(null); };
                try {
                    document.querySelector('.h-pc-dlg [data-pc-cmd="export"]').click(); await new Promise(r => setTimeout(r, 100));
                    [...[...document.querySelectorAll('.ui-actmenu')].pop().querySelectorAll('button')].find(b => /Imprimer/.test(b.textContent)).click();
                } finally { UI.openPrintDialog = keep; }
                return got?.html || '';
            });
            assert.match(html, /Pierre MAZAUD en 1910/); assert.match(html, /Pierre MAZAUD vers 1940/);
            assert.match(html, /Ressemblance forte — ce n’est pas une preuve/); assert.match(html, /Même oreille\.<br>Même nez que DURAND\./);
            assert.strictEqual((html.match(/src="data:image\/jpeg/g) || []).length, 2);
        });

        await t('5c. Comparer : « 📤 Envoyer vers… » l’image affichée et le compte rendu', async () => {
            const r = await p.evaluate(async () => {
                const E = window.LCNDA_EXT, keep = E.sendTo, calls = []; E.sendTo = (k, d, o) => { calls.push({k, d, o}); return null; };
                const pick = async re => { document.querySelector('.h-pc-dlg [data-pc-cmd="send"]').click(); await new Promise(r => setTimeout(r, 100)); [...[...document.querySelectorAll('.ui-actmenu')].pop().querySelectorAll('button')].find(b => re.test(b.textContent)).click(); await new Promise(r => setTimeout(r, 400)); };
                try { await pick(/image affichée/); await pick(/compte rendu/); } finally { E.sendTo = keep; }
                return calls.map(c => ({k: c.k, blob: c.d.blob ? c.d.blob.type : '', html: c.d.html || '', name: c.d.name || '', exclude: c.o.exclude, title: c.o.title}));
            });
            assert.strictEqual(r.length, 2);
            assert.strictEqual(r[0].k, 'image'); assert.strictEqual(r[0].blob, 'image/png'); assert.deepStrictEqual(r[0].exclude, ['compare']); assert.ok(r[0].title);
            assert.strictEqual(r[1].k, 'text'); assert.match(r[1].html, /Pierre MAZAUD en 1910/); assert.match(r[1].html, /Pierre MAZAUD vers 1940/); assert.match(r[1].html, /Ressemblance forte/); assert.match(r[1].html, /Même oreille/);
            // le vrai menu commun : l'image affichée est rangée dans les médias puis proposée aux outils (sans « Comparer »)
            await p.click('.h-pc-dlg [data-pc-cmd="send"]'); await p.waitForTimeout(100);
            await p.evaluate(() => [...[...document.querySelectorAll('.ui-actmenu')].pop().querySelectorAll('button')].find(b => /image affichée/.test(b.textContent)).click());
            await p.waitForFunction(() => /Envoyer l’image vers/.test([...document.querySelectorAll('.ui-actmenu')].pop()?.textContent || ''), null, {timeout: 10000});
            const txt = await menuTexts(); assert.ok(/Dans la Retouche des photos/.test(txt), txt); assert.ok(!/Comparer avec une autre photo/.test(txt), txt);
            await p.keyboard.press('Escape');
        });

        await t('5d. Comparer : « 🎚️ Retoucher » la photo A ou la photo B', async () => {
            const got = await p.evaluate(async () => {
                const E = window.LCNDA_EXT, keep = E.retouchMedia, calls = []; E.retouchMedia = m => { calls.push(m); };
                try {
                    document.querySelector('.h-pc-dlg [data-pc-cmd="retouch"]').click(); await new Promise(r => setTimeout(r, 100));
                    const items = [...[...document.querySelectorAll('.ui-actmenu')].pop().querySelectorAll('button')].map(b => b.textContent);
                    [...[...document.querySelectorAll('.ui-actmenu')].pop().querySelectorAll('button')].find(b => /Photo B/.test(b.textContent)).click();
                    return {items, calls};
                } finally { E.retouchMedia = keep; }
            });
            assert.strictEqual(got.items.length, 2, JSON.stringify(got.items));
            assert.deepStrictEqual(got.calls, [{id: 2, filename: 'bleu.png', title: 'Pierre MAZAUD vers 1940'}]);
            // pour de vrai : la Retouche s'ouvre par-dessus la comparaison
            await p.click('.h-pc-dlg [data-pc-cmd="retouch"]'); await p.waitForTimeout(100);
            await p.evaluate(() => [...[...document.querySelectorAll('.ui-actmenu')].pop().querySelectorAll('button')].find(b => /Photo A/.test(b.textContent)).click());
            await p.waitForFunction(() => [...document.querySelectorAll('dialog[open] [data-rt-name]')].some(i => i.value === 'Pierre MAZAUD en 1910'), null, {timeout: 15000});
            await closeAll();
        });
        await t('aucune erreur JavaScript', async () => { assert.deepStrictEqual(errs, []); });
    } finally { await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true}); }
    console.log(fails ? `\n${fails} échec(s).` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})();
