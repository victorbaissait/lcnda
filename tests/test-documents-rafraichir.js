'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🔄 L'onglet 📄 Documents suit les médias ajoutés ou changés, sans recharger la page (heritage-onglets-documents.js ;
 * l'événement commun « lcnda:media-changed » d'assets/js/app-media-limits.js) :
 *     node tests/test-documents-rafraichir.js
 * Un vrai « php -S » sur une base neuve (une personne, trois documents), puis un navigateur (1440 px) :
 *  1. une image ajoutée à une fiche (upload.php, comme le bloc Médias) apparaît dans la liste, la page n'est pas rechargée ;
 *  2. une image importée par le menu de choix des médias (api.php?action=retouch_media) apparaît aussi ;
 *  3. un média renommé (save_media) : la liste et la fiche ouverte à droite prennent le nouveau titre ;
 *  4. ajouté pendant qu'on est ailleurs (Personnes) : la liste est relue en revenant sur Documents ;
 *  5. un envoi refusé (CSRF manquant) n'émet rien ; aucune erreur JavaScript.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const phpPath = findPhp([devBundledPhp()]);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-docs-rafraichir-'));
fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
const env = { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media'), GENEALOGY_SKIP_REFERENCE: '1' };
const seed = String.raw`require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php';
$pdo = db();
$pdo->exec("INSERT INTO persons(first_name,last_name,gender,is_start,living_status) VALUES('Augustin','Ferrandou','male',1,'deceased')");
$pid = (int) $pdo->lastInsertId();
$im = imagecreatetruecolor(320, 240); imagefill($im, 0, 0, imagecolorallocate($im, 120, 150, 170)); imagejpeg($im, MEDIA_DIR . '/seed.jpg');
$m = $pdo->prepare("INSERT INTO media(title, filename, thumbnail, media_type) VALUES(?, 'seed.jpg', 'seed.jpg', 'image')");
$l = $pdo->prepare("INSERT INTO media_links(media_id, entity_type, entity_id) VALUES(?, 'person', ?)");
foreach (['Acte de naissance Ferrandou', 'Carte postale de Brive', 'Portrait de groupe'] as $t) { $m->execute([$t]); $l->execute([(int) $pdo->lastInsertId(), $pid]); }
echo json_encode(['pid' => $pid]);`;
const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', seed], { cwd: appRoot, encoding: 'utf8', env });
if (r.status !== 0 || !/\{"pid"/.test(r.stdout)) { console.error(r.stderr || r.stdout); process.exit(1); }
const ids = JSON.parse(r.stdout.slice(r.stdout.indexOf('{"pid"')));
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
let failed = 0;
const t = async (name, fn) => { try { await fn(); console.log(`✓ ${name}`); } catch (e) { failed++; console.log(`✗ ${name}\n  ${String(e.stack || e).split('\n').slice(0, 5).join('\n  ')}`); } };

(async () => {
    const port = await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env: { ...env, PHP_CLI_SERVER_WORKERS: '3' }, stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(x => setTimeout(x, 100)); } }
    let browser = null;
    try {
        let pw = null;
        for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
        await t('Playwright présent pour l’essai dans le navigateur', () => assert.ok(pw, 'Playwright absent'));
        if (!pw) return;
        browser = await pw.chromium.launch();
        const errors = [];
        const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        await ctx.route(/cdn\.jsdelivr\.net|unpkg\.com|tile|openstreetmap/, x => x.abort());
        await ctx.addInitScript(() => { try { localStorage.setItem('genealogie-menu-documents', '1'); localStorage.setItem('genealogie-menu-hidden', '[]'); } catch (_) {} });
        const page = await ctx.newPage();
        page.on('pageerror', e => errors.push(String(e.message)));
        page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errors.push(m.text()); });
        await page.goto(base);
        await page.waitForFunction(() => window.LCNDA_APP?.api && window.LCNDA_EXT?.onglets?.documents && window.LCNDA_APP.mediaLimits && window.LCNDA_MEDIA_PICKER?.importMediaFile);
        await page.evaluate(() => { window.__sansRecharger = 'oui'; window.__events = []; document.addEventListener('lcnda:media-changed', e => window.__events.push(e.detail)); });
        await page.click('.main-nav [data-module="documents"]');
        await page.waitForSelector('#sidebar-content [data-ong-doc]');
        const titles = () => page.evaluate(() => [...document.querySelectorAll('#sidebar-content [data-ong-doc] strong')].map(x => x.textContent));
        assert.deepEqual((await titles()).length, 3);
        // une image fabriquée dans la page (canvas → JPEG)
        const jpeg = `(async () => { const c = document.createElement('canvas'); c.width = 200; c.height = 150; const g = c.getContext('2d'); g.fillStyle = '#7a5'; g.fillRect(0, 0, 200, 150); return await new Promise(r => c.toBlob(r, 'image/jpeg', .9)); })()`;

        await t('une image ajoutée à une fiche (upload.php) apparaît dans la liste, sans recharger la page', async () => {
            const res = await page.evaluate(async ({ pid, jpeg }) => {
                const blob = await eval(jpeg), fd = new FormData();
                fd.append('person_id', String(pid)); fd.append('csrf', window.LCNDA_APP.state.csrf); fd.append('title', 'Mariage Ferrandou – Lacoste'); fd.append('files[]', blob, 'img003.jpg');
                const r = await fetch('upload.php', { method: 'POST', body: fd }); return r.json();
            }, { pid: ids.pid, jpeg });
            assert.ok(res.ok, JSON.stringify(res));
            await page.waitForFunction(() => [...document.querySelectorAll('#sidebar-content [data-ong-doc] strong')].some(x => x.textContent === 'Mariage Ferrandou – Lacoste'), null, { timeout: 8000 });
            assert.equal(await page.evaluate(() => window.__sansRecharger), 'oui', 'la page n’a pas été rechargée');
            const ev = await page.evaluate(() => window.__events.at(-1));
            assert.equal(ev.source, 'upload'); assert.deepEqual(ev.ids, res.media.map(Number));
            assert.equal((await titles()).length, 4);
            // la vignette de droite (rien de choisi) suit aussi
            assert.ok(await page.evaluate(() => (document.querySelector('#workspace [data-ong-cards]')?.textContent || '').includes('Mariage Ferrandou – Lacoste')), 'les vignettes à droite');
        });
        await t('une image importée par le menu de choix des médias apparaît aussi', async () => {
            await page.evaluate(async jpeg => { const blob = await eval(jpeg); await window.LCNDA_MEDIA_PICKER.importMediaFile(new File([blob], 'Lavoir de Collonges.jpg', { type: 'image/jpeg' }), ['image']); }, jpeg);
            await page.waitForFunction(() => [...document.querySelectorAll('#sidebar-content [data-ong-doc] strong')].some(x => x.textContent === 'Lavoir de Collonges'), null, { timeout: 8000 });
            assert.equal((await page.evaluate(() => window.__events.at(-1))).action, 'retouch_media');
            assert.equal(await page.evaluate(() => window.__sansRecharger), 'oui');
        });
        await t('un média renommé : la liste et la fiche ouverte prennent le nouveau titre', async () => {
            await page.click('#sidebar-content [data-ong-doc]:has-text("Portrait de groupe")');
            await page.waitForSelector('#workspace [data-ong-page="document"]');
            const id = await page.evaluate(() => Number(document.querySelector('#workspace [data-ong-page="document"]').dataset.ongId));
            await page.evaluate(async id => { await window.LCNDA_APP.api('save_media', {}, { method: 'POST', body: { media_id: id, title: 'Portrait de la noce Ferrandou' } }); }, id);
            await page.waitForFunction(() => [...document.querySelectorAll('#sidebar-content [data-ong-doc] strong')].some(x => x.textContent === 'Portrait de la noce Ferrandou'), null, { timeout: 8000 });
            await page.waitForFunction(() => /Portrait de la noce Ferrandou/.test(document.querySelector('#workspace [data-ong-page="document"] h1, #workspace [data-ong-page="document"] h2')?.textContent || ''), null, { timeout: 8000 });
            assert.ok(!(await titles()).includes('Portrait de groupe'), 'l’ancien titre a disparu');
            await page.evaluate(() => document.querySelector('#workspace [data-ong-back]').click()); // « ← Liste » (montré sur un petit écran)
        });
        await t('ajouté pendant qu’on est ailleurs : la liste est relue en revenant sur Documents', async () => {
            await page.click('.main-nav [data-module="personnes"]');
            await page.waitForFunction(() => window.LCNDA_APP.state.module === 'personnes');
            await page.evaluate(async ({ pid, jpeg }) => {
                const blob = await eval(jpeg), fd = new FormData();
                fd.append('person_id', String(pid)); fd.append('csrf', window.LCNDA_APP.state.csrf); fd.append('title', 'Livret de famille Ferrandou'); fd.append('files[]', blob, 'livret.jpg');
                await (await fetch('upload.php', { method: 'POST', body: fd })).json();
            }, { pid: ids.pid, jpeg });
            await page.click('.main-nav [data-module="documents"]');
            await page.waitForFunction(() => [...document.querySelectorAll('#sidebar-content [data-ong-doc] strong')].some(x => x.textContent === 'Livret de famille Ferrandou'), null, { timeout: 8000 });
            assert.equal((await titles()).length, 6);
            assert.equal(await page.evaluate(() => window.__sansRecharger), 'oui');
        });
        await t('un envoi refusé (sans jeton CSRF) n’émet rien et ne change pas la liste', async () => {
            const n = await page.evaluate(() => window.__events.length);
            const res = await page.evaluate(async ({ pid, jpeg }) => { const blob = await eval(jpeg), fd = new FormData(); fd.append('person_id', String(pid)); fd.append('files[]', blob, 'refus.jpg'); const r = await fetch('upload.php', { method: 'POST', body: fd }); return { status: r.status, j: await r.json() }; }, { pid: ids.pid, jpeg });
            assert.ok(res.status >= 400 && res.j.error, JSON.stringify(res));
            await page.waitForTimeout(600);
            assert.equal(await page.evaluate(() => window.__events.length), n);
            assert.equal((await titles()).length, 6);
        });
        await t('aucune erreur JavaScript', () => assert.deepEqual(errors, []));
    } catch (e) { failed++; console.error(e); }
    finally { if (browser) await browser.close(); proc.kill(); fs.rmSync(dir, { recursive: true, force: true }); }
    console.log(failed ? `✗ ${failed} échec(s)` : '✓ tout est bon');
    process.exit(failed ? 1 : 0);
})();
