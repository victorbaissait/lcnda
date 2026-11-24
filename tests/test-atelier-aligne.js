#!/usr/bin/env node
/* 📜 Atelier 3c : le même texte, montré pareil (K7). La page du document et la visionneuse montrent le texte de l'Atelier avec les mêmes
 * numéros de ligne (le réglage « Numéros de ligne » de l'Atelier), et un nom pas encore relié s'ouvre dans l'Atelier (🔗).
 *   node tests/test-atelier-aligne.js */
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
const BODY = ['L’an mil sept cent quatre vingt dix, le vingt trois mars,', 'a été baptisé Jean, né d’hier, fils légitime', '', 'de Pierre MAZAUD et de Marie LACOMBE.'].join('\n');

(async () => {
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-aligne-'));
    fs.mkdirSync(path.join(tmp, 'media'));
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4'};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start) VALUES(1,'Jean','MAZAUD','male','deceased',1)");
$im = imagecreatetruecolor(600, 400); imagefill($im, 0, 0, imagecolorallocate($im, 230, 215, 180)); imagepng($im, MEDIA_DIR . '/acte.png');
$pdo->prepare("INSERT INTO media(id,title,filename,thumbnail,media_type,transcription) VALUES(1,'Baptême','acte.png','acte.png','image',?)")->execute([getenv('TX_BODY')]);
act_transcriptions_ensure($pdo);
$a = $pdo->prepare("INSERT INTO act_transcriptions(id,title,kind,media_id,body,data_json,updated_at) VALUES(?,?,?,?,?,?,?)");
$a->execute([1, 'Baptême de Jean MAZAUD, 1790', 'bapteme', 1, getenv('TX_BODY'), json_encode(['zones' => [], 'people' => [['name' => 'Jean MAZAUD', 'role' => 'sujet', 'person_id' => 1, 's' => 0, 'e' => 0], ['name' => 'Pierre MAZAUD', 'role' => 'parent', 'person_id' => 0, 's' => 0, 'e' => 0]], 'status' => 'doing']), '2026-01-01']);
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
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_EXT?.txAligne && window.LCNDA_EXT?.onglets?.documents && window.LCNDA_EXT?.openActTranscriber, null, {timeout: 30000});
        const nums = sel => p.$$eval(sel, els => els.map(e => [e.dataset.n, e.textContent.replace(/​/g, '')]));

        await t('page du document : le texte de l’Atelier avec ses numéros de ligne (toutes les lignes comptent, comme « l. 3 »)', async () => {
            await p.evaluate(() => { localStorage.setItem('genealogie-menu-documents', '1'); localStorage.setItem('genealogie-menu-hidden', '[]'); location.hash = '#documents/1'; });
            await p.waitForSelector('#workspace [data-ong-act="1"] .tx-num', {timeout: 20000});
            if (process.env.SHOTS) await p.locator('#workspace [data-ong-act="1"]').screenshot({path: path.join(process.env.SHOTS, 'aligne-page.png')});
            const n = await nums('#workspace [data-ong-act="1"] .tx-num .tx-ln');
            assert.deepEqual(n.map(x => x[0]), ['1', '2', '3', '4']); assert.equal(n[3][1], 'de Pierre MAZAUD et de Marie LACOMBE.'); assert.equal(n[2][1], '');
            const before = await p.$eval('#workspace [data-ong-act="1"] .tx-num .tx-ln', e => getComputedStyle(e, '::before').content);
            assert.equal(before, '"1"', 'le numéro se voit dans la marge : ' + before);
        });
        await t('page du document : un nom pas encore relié (🔗) ouvre l’Atelier sur l’acte', async () => {
            const chip = p.locator('#workspace .ong-unlinked button.is-unlinked', {hasText: 'Pierre MAZAUD'});
            assert.equal(await chip.count(), 1); assert.match(await chip.textContent(), /^🔗 Pierre MAZAUD/);
            await chip.click(); await p.waitForFunction(() => document.querySelector('dialog.h-tx-dlg [data-tx-img]')?.getAttribute('href'), null, {timeout: 15000});
            assert.equal(await p.evaluate(() => document.querySelector('dialog.h-tx-dlg').txApi.get().id), 1);
            await p.evaluate(() => { const d = document.querySelector('dialog.h-tx-dlg'); d.querySelector('[data-tx-cmd="close"]')?.click(); }); await sleep(400);
            await p.evaluate(() => document.querySelectorAll('dialog.h-tx-dlg').forEach(d => { try { d.close(); } catch (_) {} d.remove(); }));
        });
        await t('visionneuse : les mêmes numéros dans la marge de la case, ils suivent l’écriture', async () => {
            await p.evaluate(b => window.LCNDA_APP.openLightbox([{id: 1, title: 'Baptême', filename: 'acte.png', media_type: 'image', transcription: b}], 0, false), BODY);
            await p.waitForSelector('#lightbox .tx-gut.is-on .tx-gut-mirror .tx-ln', {timeout: 15000}); await sleep(300);
            let n = await nums('#lightbox .tx-gut-mirror .tx-ln'); assert.deepEqual(n.map(x => x[0]), ['1', '2', '3', '4']);
            assert.equal(await p.$eval('#lightbox-transcription', a => getComputedStyle(a).paddingLeft), '44px', 'la marge des numéros');
            // les lignes du miroir sont à la même hauteur que celles de la case (même police, même largeur)
            const sameWidth = await p.evaluate(() => { const a = document.getElementById('lightbox-transcription'), m = a.parentElement.querySelector('.tx-gut-mirror'); return Math.abs(a.clientWidth - (m.clientWidth)) <= 1; });
            assert.ok(sameWidth, 'même largeur de texte');
            await p.evaluate(() => { const a = document.getElementById('lightbox-transcription'); a.value += '\nnouvelle ligne'; a.dispatchEvent(new Event('input')); });
            if (process.env.SHOTS) { await p.locator('#lightbox .tx-gut').screenshot({path: path.join(process.env.SHOTS, 'aligne-visionneuse.png')}); }
            n = await nums('#lightbox .tx-gut-mirror .tx-ln'); assert.equal(n.length, 5); assert.deepEqual(n[4], ['5', 'nouvelle ligne']);
        });
        await t('visionneuse : un nom pas encore relié est un bouton 🔗 (comme sur la page du document)', async () => {
            await p.waitForSelector('#lightbox .lb-acts-chip.is-unlinked', {timeout: 10000});
            const c = await p.$$eval('#lightbox .lb-acts-chip', b => b.map(x => [x.tagName, x.textContent.trim()]));
            assert.ok(c.some(([tag, tx]) => tag === 'BUTTON' && /^🔗 Pierre MAZAUD/.test(tx)), JSON.stringify(c));
            assert.ok(c.some(([tag, tx]) => tag === 'SPAN' && /Jean MAZAUD.*✓/.test(tx)), 'une personne reliée garde ✓');
            await p.evaluate(() => document.getElementById('lightbox').close()); await sleep(300);
        });
        await t('réglage « Numéros de ligne » éteint (Atelier) : ni la page, ni la visionneuse ne montrent de numéros', async () => {
            await p.evaluate(() => { localStorage.setItem('genealogie-tx-linenos', '0'); location.hash = '#documents'; }); await sleep(300);
            await p.evaluate(() => { location.hash = '#documents/1'; });
            await p.waitForSelector('#workspace [data-ong-act="1"] .tx-plain', {timeout: 20000});
            assert.equal(await p.$('#workspace [data-ong-act="1"] .tx-num'), null);
            await p.evaluate(() => window.LCNDA_APP.openLightbox([{id: 1, title: 'Baptême', filename: 'acte.png', media_type: 'image'}], 0, false)); await sleep(800);
            assert.equal(await p.$('#lightbox .tx-gut.is-on'), null); assert.notEqual(await p.$eval('#lightbox-transcription', a => getComputedStyle(a).paddingLeft), '44px');
            await p.evaluate(() => { document.getElementById('lightbox').close(); localStorage.removeItem('genealogie-tx-linenos'); });
        });
        await t('3d · export : le texte avec ses numéros de ligne et les personnes avec leur rôle (cochés au départ) ; l’impression numérote aussi', async () => {
            await p.evaluate(() => window.LCNDA_EXT.openActTranscriber({id: 1}));
            await p.waitForFunction(() => document.querySelector('dialog.h-tx-dlg [data-tx-img]')?.getAttribute('href'), null, {timeout: 15000}); await sleep(500);
            const r = await p.evaluate(async () => { const UI = window.LCNDA_UI, keep = {pr: UI.openPrintDialog, ex: UI.openExportDialog}; let pr = null, ex = null;
                UI.openPrintDialog = o => { pr = o; }; UI.openExportDialog = o => { ex = o; };
                try { const d = document.querySelector('dialog.h-tx-dlg'); [...d.querySelectorAll('[data-tx-menus] button')].find(b => b.textContent.trim() === 'Fichier').click(); await new Promise(x => setTimeout(x, 200));
                    [...document.querySelectorAll('.ui-actmenu .ui-actmenu-i')].find(b => /Exporter/.test(b.textContent)).click(); await new Promise(x => setTimeout(x, 200));
                    const grab = async checks => { let blob = ''; const oc = URL.createObjectURL; URL.createObjectURL = b => { blob = b; return oc.call(URL, b); }; await ex.formats.find(f => f.id === 'file').run({filename: 'x.txt', checks}); URL.createObjectURL = oc; return blob.text(); };
                    const on = await grab({ln: true, people: true}), off = await grab({ln: false, people: false});
                    await ex.formats.find(f => f.id === 'print').run({});
                    return {checks: ex.checks.map(c => [c.id, c.checked]), on, off, prOpt: pr.options.find(o => o.key === 'ln')?.checked, html: await pr.html({lay: 'text', ln: true, people: false})};
                } finally { UI.openPrintDialog = keep.pr; UI.openExportDialog = keep.ex; } });
            assert.deepEqual(r.checks, [['ln', true], ['people', true]]);
            assert.match(r.on, /^1  L’an mil sept cent/); assert.match(r.on, /\n4  de Pierre MAZAUD/); assert.match(r.on, /\nPersonnes\n- Jean MAZAUD — sujet\n- Pierre MAZAUD — parent/);
            assert.equal(r.off, BODY, 'sans les cases : le texte tel quel');
            assert.equal(r.prOpt, true); assert.match(r.html, /<ol class="ln"><li>L’an mil/); assert.equal((r.html.match(/<li>/g) || []).length, 4);
            await p.evaluate(() => { const d = document.querySelector('dialog.h-tx-dlg'); d?.querySelector('[data-tx-cmd="close"]')?.click(); }); await sleep(300);
        });
        await t('aucune erreur JavaScript', async () => { assert.deepStrictEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true});
    }
    console.log(fails ? `${fails} essai(s) en échec` : 'Le même texte, montré pareil.');
    process.exit(fails ? 1 : 0);
})();
