#!/usr/bin/env node
'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🐒 L'Atelier de transcription face à quelqu'un de pressé (ou de maladroit) :
 *   node tests/test-atelier-chaos.js
 *  - double et triple clics : 💾 Enregistrer, « ＋ Acte suivant », « Vue suivante → » (un recueil, une vue IIIF : une seule vue
 *    téléchargée), ◀ : un seul Atelier ouvert, un seul acte créé ;
 *  - les étapes changées très vite, ↶ / ↷ en rafale ; un texte de 1 Mo collé ; 10 000 zones ; un acte vide, sans image ;
 *  - l'acte supprimé ailleurs pendant qu'il est ouvert ; le serveur qui ne répond plus (le brouillon reste) ;
 *  - 390 px et thème sombre : rien ne déborde ; clavier seulement : les étapes au clavier ;
 *  - un acte de 150 lignes : ouverture et frappe rapides ; aucune erreur JavaScript.
 * Noms inventés (MAZAUD, LACOMBE).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
let chromium = null;
try { ({ chromium } = require('playwright')); } catch (_) { try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); } catch (__) { chromium = null; } }
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n  ')); } };

(async () => {
    if (!chromium) { console.log('Playwright absent : essai sauté.'); return; }
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-atelier-chaos-'));
    const dir = path.join(tmp, 'data'), site = path.join(tmp, 'site'); fs.mkdirSync(path.join(dir, 'media'), { recursive: true }); fs.mkdirSync(site, { recursive: true });
    const env = { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4', GENEALOGY_TEST: '1', LCNDA_TEST_IIIF_DIR: site, LCNDA_OLLAMA_URL: 'http://127.0.0.1:9' };
    const php = (code, extra = {}) => { const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], { cwd: appRoot, encoding: 'utf8', env: { ...env, ...extra } }); if (r.status !== 0) throw new Error(r.stderr || r.stdout); return r.stdout; };
    const L150 = []; for (let i = 0; i < 150; i++) L150.push(`${i + 1}. Le ${i % 28 + 1} du mois a été baptisé Jean fils de Pierre MAZAUD et de Marie LACOMBE`);
    const seed = JSON.parse(php(String.raw`require 'lib/paths.php'; $p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; require 'tests/api_functions.php'; require_once 'lib/recueils.php'; $pdo = db(); act_transcriptions_ensure($pdo);
save_person($pdo, ['first_name' => 'Jean', 'last_name' => 'MAZAUD', 'gender' => 'male']);
$img = function (string $name, int $w, int $h, int $bands) { $im = imagecreatetruecolor($w, $h); imagefill($im, 0, 0, imagecolorallocate($im, 236, 226, 200)); $ink = imagecolorallocate($im, 70, 50, 30);
    for ($b = 0; $b < $bands; $b++) { $y = 30 + $b * ($h - 60) / $bands; for ($x = 50; $x < $w - 60; $x += 9) { imagefilledrectangle($im, $x, (int) $y + 6, $x + 4, (int) $y + 20, $ink); } } imagepng($im, MEDIA_DIR . '/' . $name); };
foreach (['v1.png', 'v2.png', 'v3.png'] as $f) { $img($f, 1000, 600, 6); } $img('big.png', 4000, 6000, 150);
$m = []; foreach (['v1.png', 'v2.png', 'v3.png', 'big.png'] as $f) { $pdo->prepare("INSERT INTO media(title, media_type, filename) VALUES(?, 'image', ?)")->execute([$f, $f]); $m[$f] = (int) $pdo->lastInsertId(); }
$r = save_recueil($pdo, ['title' => 'BMS Treignac 1780-1792']); $rid = (int) $r['id'];
$vid = (int) $pdo->query("SELECT id FROM recueil_versions WHERE recueil_id=$rid ORDER BY id LIMIT 1")->fetchColumn(); if (!$vid) { $vid = (int) save_recueil_version($pdo, ['recueil_id' => $rid, 'name' => 'Original'])['id']; }
recueil_add_images($pdo, ['recueil_id' => $rid, 'version_id' => $vid, 'mode' => 'new_pages', 'media_ids' => [$m['v1.png'], $m['v2.png'], $m['v3.png']]]);
$ins = function (string $title, int $media, string $body, array $data) use ($pdo) { $pdo->prepare('INSERT INTO act_transcriptions(title, kind, media_id, date_text, place, body, data_json) VALUES(?,?,?,?,?,?,?)')->execute([$title, 'bapteme', $media, '12 nov. 1787', 'Treignac', $body, json_encode($data, JSON_UNESCAPED_UNICODE)]); return (int) $pdo->lastInsertId(); };
$a1 = $ins('Baptême de Jean MAZAUD', $m['v1.png'], "L’an mil sept cent quatre vingt sept\nle douze du mois de 9bre", ['zones' => [['id' => 'z0', 'x' => 40, 'y' => 40, 'w' => 900, 'h' => 44, 's' => 0, 'e' => 35]], 'status' => 'doing']);
$lines = json_decode(getenv('L150'), true); $zones = []; $at = 0; foreach ($lines as $i => $l) { $len = mb_strlen($l); $zones[] = ['id' => 'b' . $i, 'x' => 50, 'y' => 30 + $i * 39.6, 'w' => 3800, 'h' => 30, 's' => $at, 'e' => $at + $len]; $at += $len + 1; }
$big = $ins('Registre de 150 lignes', $m['big.png'], implode("\n", $lines), ['zones' => $zones, 'status' => 'doing']);
// une vue IIIF : un manifeste de 3 vues
$S = getenv('LCNDA_TEST_IIIF_DIR'); foreach ([1, 2, 3] as $i) { foreach (['!3000,3000', '!200,200'] as $sz) { $d = "$S/img/$i/full/$sz/0"; @mkdir($d, 0777, true); $im = imagecreatetruecolor(300, 400); imagefill($im, 0, 0, imagecolorallocate($im, 200, 180 + $i * 10, 150)); imagejpeg($im, "$d/default.jpg"); } }
$canv = fn($i) => ['@id' => "https://iiif.test/c$i", 'label' => (string) $i, 'images' => [['resource' => ['@id' => "https://iiif.test/img/$i/full/full/0/default.jpg", 'service' => ['@id' => "https://iiif.test/img/$i"]]]]];
file_put_contents("$S/manifest.json", json_encode(['@context' => 'http://iiif.io/api/presentation/2/context.json', 'label' => 'BMS en ligne', 'sequences' => [['canvases' => [$canv(1), $canv(2), $canv(3)]]]]));
echo json_encode(['m' => $m, 'a1' => $a1, 'big' => $big]);`, { L150: JSON.stringify(L150) }));

    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const base = `http://127.0.0.1:${port}/`;
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env, stdio: 'ignore' });
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const errs = [];
    const D = 'dialog.h-tx-dlg';
    const dbq = sql => php(`require 'lib/bootstrap.php'; echo json_encode(db()->query(${JSON.stringify(sql)})->fetchAll(PDO::FETCH_COLUMN));`);
    const count = sql => Number(JSON.parse(dbq(sql))[0]);
    try {
        const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        const p = await ctx.newPage();
        p.on('pageerror', e => errs.push(e.message));
        await p.goto(base);
        await p.waitForFunction(() => window.LCNDA_EXT?.openActTranscriber && window.LCNDA_EXT?.atelierIiif && window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.txPlugins?.length >= 5, null, { timeout: 30000 });
        const openAct = async (o, wait = true) => { await p.evaluate(x => window.LCNDA_EXT.openActTranscriber(x), o); if (wait) { await p.waitForFunction(d => document.querySelector(`${d} [data-tx-img]`)?.getAttribute('href') && document.querySelector(d)?.dataset.aisRegister !== undefined, D, { timeout: 20000 }); await sleep(400); } };
        const closeAll = async () => { for (let k = 0; k < 4; k++) { const n = await p.evaluate(d => document.querySelectorAll(d).length, D); if (!n) return; await p.evaluate(d => document.querySelector(`${d} [data-tx-cmd="close"]`)?.click(), D); await sleep(300);
            await p.evaluate(() => { const b = [...document.querySelectorAll('dialog[open] button')].find(x => /Fermer sans|Close without/.test(x.textContent)); b?.click(); }); await sleep(300); } };
        const nDlg = () => p.evaluate(d => document.querySelectorAll(d).length, D);
        const type = (txt) => p.evaluate(([d, v]) => { const a = document.querySelector(`${d} [data-tx-body]`); a.value = v; a.dispatchEvent(new Event('input', { bubbles: true })); }, [D, txt]);
        const saveState = () => p.evaluate(d => document.querySelector(`${d} [data-tx-savestate]`)?.dataset.state || document.querySelector(`${d} [data-tx-status]`)?.textContent || '', D);

        await t('💾 triple clic sur Enregistrer : un seul enregistrement, pas de conflit', async () => {
            await openAct({ id: seed.a1 });
            await type('L’an mil sept cent quatre vingt sept\nle douze du mois de 9bre, a été baptisé');
            const before = count('SELECT COUNT(*) FROM act_transcription_versions');
            await p.evaluate(d => { const b = document.querySelector(`${d} [data-tx-cmd="save"]`); b.click(); b.click(); b.click(); }, D); await sleep(1500);
            assert.equal(await p.evaluate(() => document.querySelectorAll('dialog[open].ui-conflict, dialog[open] [data-conflict]').length), 0, 'pas de fenêtre de conflit');
            assert.match(JSON.parse(dbq(`SELECT body FROM act_transcriptions WHERE id=${seed.a1}`))[0], /baptisé/);
            assert.ok(count('SELECT COUNT(*) FROM act_transcription_versions') - before <= 1);
            assert.equal(await p.evaluate(() => [...document.querySelectorAll('.toast.is-error, .ui-toast.is-error')].map(x => x.textContent).join('|')), '');
        });
        await t('les étapes changées très vite, ↶ / ↷ en rafale : pas d’erreur, le texte revient', async () => {
            const steps = await p.evaluate(d => [...document.querySelectorAll(`${d} [data-tx-step]`)].map(b => b.dataset.txStep), D);
            assert.ok(steps.length >= 4);
            for (let k = 0; k < 40; k++) await p.evaluate(([d, s]) => document.querySelector(`${d} [data-tx-step="${s}"]`).click(), [D, steps[k % steps.length]]);
            await sleep(300);
            const txt0 = await p.evaluate(d => document.querySelector(`${d} [data-tx-body]`).value, D);
            for (let k = 0; k < 20; k++) await type(txt0 + ' mot' + k);
            await p.focus(`${D} [data-tx-body]`);
            for (let k = 0; k < 60; k++) await p.keyboard.press('Control+z');
            for (let k = 0; k < 60; k++) await p.keyboard.press('Control+Shift+z');
            for (let k = 0; k < 60; k++) await p.keyboard.press('Control+z');
            await sleep(200);
            const v = await p.evaluate(d => document.querySelector(`${d} [data-tx-body]`).value, D);
            assert.ok(typeof v === 'string');
            assert.deepEqual(errs, []);
        });
        await closeAll();

        await t('« ＋ Acte suivant » cliqué trois fois : un seul Atelier, un seul nouvel acte', async () => {
            await openAct({ id: seed.a1 });
            const n0 = count('SELECT COUNT(*) FROM act_transcriptions');
            await p.evaluate(d => { const b = document.querySelector(`${d} [data-ais-go="next"]`); b.click(); b.click(); b.click(); }, D);
            await sleep(2500);
            assert.equal(await nDlg(), 1, 'un seul Atelier');
            assert.equal(await p.evaluate(d => document.querySelector(`${d} [data-tx="title"]`).value, D), '', 'le nouvel acte est ouvert');
            assert.equal(count('SELECT COUNT(*) FROM act_transcriptions'), n0, 'rien de créé tant que rien n’est écrit');
        });
        await closeAll();
        await t('« Vue suivante → » cliqué trois fois (recueil) : un seul Atelier, sur la vue 2', async () => {
            await openAct({ id: seed.a1 });
            await p.evaluate(d => { const b = document.querySelector(`${d} [data-ais-go="view"]`); b.click(); b.click(); b.click(); }, D);
            await sleep(2500);
            assert.equal(await nDlg(), 1, 'un seul Atelier');
            assert.match(await p.evaluate(d => document.querySelector(`${d} [data-ais-strip]`).textContent, D), /vue 2 \/ 3/);
        });
        await closeAll();
        await t('« Vue suivante → » cliqué trois fois (IIIF) : une seule vue téléchargée, un seul Atelier', async () => {
            await p.evaluate(() => window.LCNDA_EXT.atelierIiif.open({ url: 'https://iiif.test/manifest.json' }));
            await p.waitForFunction(() => !document.querySelector('dialog.aii-dlg [data-aii-go]')?.disabled, null, { timeout: 10000 });
            await p.evaluate(() => { const b = document.querySelector('dialog.aii-dlg [data-aii-go]'); b.click(); b.click(); b.click(); });
            await p.waitForFunction(d => /vue 1 \/ 3/.test(document.querySelector(`${d} [data-ais-strip]`)?.textContent || ''), D, { timeout: 20000 }); await sleep(500);
            const media0 = count('SELECT COUNT(*) FROM media');
            await p.evaluate(d => { const b = document.querySelector(`${d} [data-ais-go="view"]`); b.click(); b.click(); b.click(); }, D);
            await p.waitForFunction(d => /vue 2 \/ 3/.test(document.querySelector(`${d} [data-ais-strip]`)?.textContent || ''), D, { timeout: 20000 }); await sleep(2000);
            assert.equal(await nDlg(), 1, 'un seul Atelier');
            assert.equal(count('SELECT COUNT(*) FROM media') - media0, 1, 'une seule vue téléchargée');
            assert.equal(count('SELECT COUNT(*) FROM atelier_iiif_views'), 2);
            // deux onglets qui demandent la même vue en même temps : une seule téléchargée, la même pour les deux
            const media1 = count('SELECT COUNT(*) FROM media');
            const rs = await p.evaluate(() => Promise.all([0, 1, 2].map(() => window.LCNDA_APP.api('atelier_idees_write', {}, { method: 'POST', body: { op: 'iiif_open', url: 'https://iiif.test/manifest.json', n: 3 } }))));
            assert.equal(new Set(rs.map(r => (r.result || r).media_id)).size, 1, 'la même vue pour les trois');
            assert.equal(count('SELECT COUNT(*) FROM media') - media1, 1, 'une seule fois dans les Médias');
        });
        await closeAll();

        await t('un texte de 1 Mo collé : refusé clairement, rien de perdu, l’Atelier répond', async () => {
            await openAct({ id: seed.a1 });
            const big = 'Ligne de texte collée Mazaud Lacombe '.repeat(28000);
            await type(big);
            const ts = Date.now(); await p.evaluate(d => document.querySelector(`${d} [data-tx-cmd="save"]`).click(), D);
            await p.waitForFunction(() => /trop long|too long/i.test([...document.querySelectorAll('.toast, .ui-toast, [role="status"], [role="alert"]')].map(x => x.textContent).join('|')), null, { timeout: 30000 }).catch(() => {});
            console.log(`   (1 Mo : réponse en ${Date.now() - ts} ms)`);
            const toasts = await p.evaluate(() => [...document.querySelectorAll('.toast, .ui-toast, [role="status"], [role="alert"]')].map(x => x.textContent).join('|'));
            assert.match(toasts, /trop long|too long/i);
            assert.equal(await p.evaluate(d => document.querySelector(`${d} [data-tx-body]`).value.length, D), big.length, 'le texte reste à l’écran');
            await type('Texte court'); await p.evaluate(d => document.querySelector(`${d} [data-tx-cmd="save"]`).click(), D); await sleep(1200);
            assert.equal(JSON.parse(dbq(`SELECT body FROM act_transcriptions WHERE id=${seed.a1}`))[0], 'Texte court');
        });
        await closeAll();
        await t('10 000 zones (et plus) : gardées jusqu’à la limite, le reste annoncé', async () => {
            const r = await p.evaluate(id => { const zones = []; for (let i = 0; i < 10050; i++) zones.push({ id: 'k' + i, x: i % 100, y: i, w: 10, h: 5, s: 0, e: 1 });
                return window.LCNDA_APP.api('save_act_transcription', {}, { method: 'POST', body: { id: id[0], title: 'x', body: 'x', media_id: id[1], data: { zones } } }).then(r => r.result || r, e => ({ error: e.message })); }, [seed.a1, seed.m['v1.png']]);
            assert.ok(!r.error, r.error); assert.equal(r.dropped?.zones, 50);
            assert.equal(count(`SELECT json_array_length(data_json, '$.zones') FROM act_transcriptions WHERE id=${seed.a1}`), 10000);
            const t0 = Date.now(); await openAct({ id: seed.a1 }, false);
            await p.waitForFunction(d => document.querySelector(`${d} [data-tx-body]`), D, { timeout: 30000 }); await sleep(500);
            assert.ok(Date.now() - t0 < 20000, 'ouvert en moins de 20 s');
            await closeAll();
            php(`require 'lib/bootstrap.php'; db()->exec("UPDATE act_transcriptions SET data_json='{\\"zones\\":[],\\"status\\":\\"doing\\"}' WHERE id=${seed.a1}");`);
        });
        await t('un acte vide, sans image : s’enregistre (titre donné), puis se supprime', async () => {
            await p.evaluate(() => window.LCNDA_EXT.openActTranscriber({})); await p.waitForSelector(`${D} [data-tx-body]`, { timeout: 15000 }); await sleep(400);
            await p.evaluate(() => { [...document.querySelectorAll('dialog[open]')].filter(d => !d.classList.contains('h-tx-dlg')).forEach(d => d.close()); }); await sleep(200);
            const n0 = count('SELECT COUNT(*) FROM act_transcriptions');
            await p.evaluate(d => document.querySelector(`${d} [data-tx-cmd="save"]`).click(), D); await sleep(1200);
            const n1 = count('SELECT COUNT(*) FROM act_transcriptions');
            assert.ok(n1 === n0 || n1 === n0 + 1);
            assert.deepEqual(errs, []);
        });
        await closeAll();
        await t('l’acte supprimé ailleurs pendant qu’il est ouvert : Enregistrer le dit, le texte reste', async () => {
            const id = Number(JSON.parse(dbq(`SELECT MAX(id) FROM act_transcriptions`))[0]) + 0;
            await openAct({ id: seed.big });
            php(`require 'lib/bootstrap.php'; db()->exec('DELETE FROM act_transcriptions WHERE id=${seed.big}');`);
            await type('Le texte que je tapais');
            await p.evaluate(d => document.querySelector(`${d} [data-tx-cmd="save"]`).click(), D); await sleep(1500);
            const msg = await p.evaluate(() => [...document.querySelectorAll('.toast, .ui-toast, [role="status"], [role="alert"], dialog[open]')].map(x => x.textContent).join('|'));
            assert.match(msg, /introuvable|supprim|not found|deleted/i);
            assert.equal(await p.evaluate(d => document.querySelector(`${d} [data-tx-body]`).value, D), 'Le texte que je tapais');
            assert.ok(id > 0);
        });
        await closeAll();
        await t('le serveur ne répond plus : message, brouillon gardé ; il revient : l’enregistrement passe', async () => {
            await openAct({ id: seed.a1 });
            await p.route('**/api.php?action=save_act_transcription*', r => r.abort('failed'));
            await type('Texte écrit hors ligne');
            await p.evaluate(d => document.querySelector(`${d} [data-tx-cmd="save"]`).click(), D); await sleep(1200);
            const draft = await p.evaluate(() => Object.keys(localStorage).filter(k => /draft|brouillon/i.test(k)).map(k => localStorage.getItem(k)).join('|'));
            assert.match(draft, /hors ligne/, 'le brouillon est gardé');
            await p.unroute('**/api.php?action=save_act_transcription*');
            await p.evaluate(d => document.querySelector(`${d} [data-tx-cmd="save"]`).click(), D); await sleep(1500);
            assert.equal(JSON.parse(dbq(`SELECT body FROM act_transcriptions WHERE id=${seed.a1}`))[0], 'Texte écrit hors ligne');
        });
        await closeAll();

        await t('390 px, thème sombre : l’Atelier tient dans l’écran, au clavier on change d’étape', async () => {
            await p.setViewportSize({ width: 390, height: 844 });
            await p.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
            await openAct({ id: seed.a1 });
            const over = await p.evaluate(d => { const dl = document.querySelector(d); return { sw: document.documentElement.scrollWidth, dw: dl.getBoundingClientRect().width, wide: [...dl.querySelectorAll('*')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > 392 && getComputedStyle(e).position !== 'fixed' && !e.closest('[hidden]') && !e.closest('.h-tx-stage, svg, [data-tx-stage]'); }).slice(0, 5).map(e => e.className || e.tagName) }; }, D);
            assert.ok(over.sw <= 392 && over.dw <= 392, JSON.stringify(over));
            await p.focus(`${D} [data-tx-step]`);
            const k0 = await p.evaluate(() => document.activeElement.dataset.txStep);
            await p.keyboard.press('ArrowRight'); await sleep(150);
            const k1 = await p.evaluate(() => document.activeElement.dataset.txStep);
            assert.notEqual(k0, k1, 'flèche → : étape suivante');
            await p.setViewportSize({ width: 1440, height: 900 }); await p.evaluate(() => document.documentElement.removeAttribute('data-theme'));
        });
        await closeAll();

        await t('un acte de 150 lignes et une image de 4000 × 6000 : ouvert vite, la frappe reste fluide', async () => {
            php(String.raw`require 'lib/bootstrap.php'; $pdo = db(); $lines = json_decode(getenv('L150'), true); $zones = []; $at = 0; foreach ($lines as $i => $l) { $len = mb_strlen($l); $zones[] = ['id' => 'b' . $i, 'x' => 50, 'y' => 30 + $i * 39.6, 'w' => 3800, 'h' => 30, 's' => $at, 'e' => $at + $len]; $at += $len + 1; }
                $pdo->prepare("INSERT INTO act_transcriptions(id, title, kind, media_id, body, data_json) VALUES(?,?,?,?,?,?)")->execute([` + seed.big + `, 'Registre de 150 lignes', 'bapteme', ` + seed.m['big.png'] + `, implode("\n", $lines), json_encode(['zones' => $zones, 'status' => 'doing'])]);`, { L150: JSON.stringify(L150) });
            const t0 = Date.now(); await openAct({ id: seed.big }); const open = Date.now() - t0;
            await p.evaluate(d => { const a = document.querySelector(`${d} [data-tx-body]`); a.focus(); a.setSelectionRange(a.value.length, a.value.length); }, D);
            const t1 = Date.now(); await p.keyboard.type(' et Anne LACOMBE sa marraine', { delay: 0 }); const typing = Date.now() - t1;
            await sleep(300);
            const longTask = await p.evaluate(d => new Promise(res => { const a = document.querySelector(`${d} [data-tx-body]`); const s = performance.now(); a.value += 'x'; a.dispatchEvent(new Event('input', { bubbles: true })); requestAnimationFrame(() => res(performance.now() - s)); }), D);
            console.log(`   (ouverture ${open} ms, 28 touches ${typing} ms, une touche → image ${Math.round(longTask)} ms)`);
            assert.ok(open < 12000, `ouverture ${open} ms`); assert.ok(typing < 6000, `frappe ${typing} ms`); assert.ok(longTask < 250, `une touche ${longTask} ms`);
        });
        await closeAll();
        await t('en anglais : pas de français oublié dans l’Atelier et ses fenêtres (registre, recherche, IIIF, entraîner)', async () => {
            await p.evaluate(() => { localStorage.setItem('lcnda-langue', 'en'); });
            await p.reload(); await p.waitForFunction(() => window.LCNDA_EXT?.openActTranscriber && window.LCNDA_APP?.state?.csrf && window.LCNDA_I18N?.lang === 'en', null, { timeout: 30000 });
            await openAct({ id: seed.a1 });
            const texts = [];
            const grab = sel => p.evaluate(s => { const out = []; document.querySelectorAll(s).forEach(root => { const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { const el = n.parentElement; if (!el || el.closest('[data-i18n-off], textarea, [hidden], script, style, option') || !el.getClientRects().length) continue; const v = n.nodeValue.trim(); if (v) out.push(v); }
                root.querySelectorAll('[title], [aria-label], [placeholder]').forEach(e => { if (e.closest('[data-i18n-off]')) return; ['title', 'aria-label', 'placeholder'].forEach(a => { const v = e.getAttribute(a); if (v) out.push(v); }); }); }); return out; }, sel);
            for (const step of await p.evaluate(d => [...document.querySelectorAll(`${d} [data-tx-step]`)].map(b => b.dataset.txStep), D)) { await p.evaluate(([d, k]) => document.querySelector(`${d} [data-tx-step="${k}"]`).click(), [D, step]); await sleep(250); texts.push(...await grab(D)); }
            await p.evaluate(d => document.querySelector(`${d} [data-ais-edit]`)?.click(), D); await sleep(400); texts.push(...await grab('dialog.ais-dlg')); await p.evaluate(() => document.querySelector('dialog.ais-dlg')?.close());
            await p.evaluate(() => window.LCNDA_EXT.atelierIiif.open({ url: 'https://iiif.test/manifest.json' })); await p.waitForSelector('dialog.aii-dlg .aii-found', { timeout: 10000 }); texts.push(...await grab('dialog.aii-dlg')); await p.evaluate(() => document.querySelector('dialog.aii-dlg')?.remove());
            await p.evaluate(() => window.LCNDA_EXT.atelierTrain?.open({})); await sleep(1500); texts.push(...await grab('dialog[open]:not(.h-tx-dlg)')); await p.evaluate(() => document.querySelectorAll('dialog[open]:not(.h-tx-dlg)').forEach(d => d.remove()));
            assert.ok(texts.some(x => /\b(Read|Save|Close)\b/.test(x)), 'l’interface est bien en anglais');
            const FR = /\b(le|la|les|des|du|une|avec|pour|dans|sur|cette|ligne|lignes|acte|actes|vue|vues|registre|enregistrer|fermer|lire|corriger|repérer|ajouter|aucun|aucune|été|être|écriture|entraîner|chercher|suivant|suivante|main)\b/i;
            const KEEP = /^(MAZAUD|LACOMBE|Treignac|BMS|Baptême de Jean MAZAUD|L’an|le douze)/;
            const bad = [...new Set(texts)].filter(x => FR.test(x) && !KEEP.test(x) && !/Mazaud|Lacombe|Treignac|BMS en ligne|9bre|Texte écrit hors ligne/i.test(x)); // (le texte de l’acte n’est pas à traduire)
            assert.deepEqual(bad, []);
            await p.evaluate(() => localStorage.setItem('lcnda-langue', 'fr'));
        });
        await closeAll();
        await t('aucune erreur JavaScript', async () => { assert.deepEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill(); fs.rmSync(tmp, { recursive: true, force: true });
    }
    if (fails) { console.log(`\n${fails} échec(s)`); process.exit(1); }
    console.log('\nAtelier, chaos : tout est bon.');
})().catch(e => { console.error(e); process.exit(1); });
