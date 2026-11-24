#!/usr/bin/env node
/* 🔍 Recueils › État : « Pages blanches et doublons » (assets/js/heritage-recueil-verif.js) :
 *  1. sans navigateur : une page uniforme et sans encre est blanche, une page écrite non ; l'empreinte de deux photos de la même
 *     page est proche, celle de deux pages différentes loin ;
 *  2. dans l'app : 5 photos (une page blanche, une page photographiée deux fois) ; la fenêtre les propose, rien ne change sans
 *     « Faire ce qui est coché » ; la page devient « Page blanche », la photo en double sort du recueil (reste dans Médias) ; ↶ Annuler.
 *   node tests/test-recueil-verif.js */
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
const V = require('../assets/js/heritage-recueil-verif.js');

let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
/** une page de 72 × 64 : fond, et des « lignes d'écriture » (y0, pas, décalage) */
const page = ({ink = true, y0 = 6, step = 7, shift = 0, noise = 0} = {}) => { const W = 72, H = 64, g = new Float32Array(W * H); let seed = 7;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { seed = (seed * 16807) % 2147483647; let v = 215 + (noise ? (seed % (2 * noise)) - noise : 0);
        if (ink && y >= y0 && (y - y0) % step < 2 && x > 6 + shift && x < 60 + shift - (y % 13)) v = 60; g[y * W + x] = v; } return {g, W, H}; };

(async () => {
    await t('une page uniforme est blanche (même un peu tachée) ; une page écrite non', () => {
        const b = page({ink: false, noise: 6}), w = page();
        assert.strictEqual(V.sigOf(b.g, b.W, b.H).blank, true); assert.strictEqual(V.sigOf(w.g, w.W, w.H).blank, false);
    });
    await t('deux photos de la même page : empreintes proches ; deux pages différentes : loin', () => {
        const a = page(), a2 = page({noise: 3}), c = page({y0: 3, step: 11, shift: 8});
        const [ha, ha2, hc] = [a, a2, c].map(x => V.sigOf(x.g, x.W, x.H).vec);
        assert.ok(V.sim(ha, ha2) > .95, String(V.sim(ha, ha2))); assert.ok(V.sim(ha, hc) < .6, String(V.sim(ha, hc)));
        const F = V.find([{id: 1, sig: {blank: false, vec: ha}}, {id: 2, sig: {blank: false, vec: ha2}}, {id: 3, sig: {blank: false, vec: hc}}, {id: 4, sig: {blank: true, vec: ha}}]);
        assert.deepStrictEqual(F.blank.map(x => x.id), [4]); assert.deepStrictEqual(F.dups.map(d => [d[0].id, d[1].id]), [[1, 2]]);
    });

    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-verif-'));
    fs.mkdirSync(path.join(tmp, 'media'));
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4'};
    // m1, m2 : deux pages écrites différemment ; m3 : blanche ; m4 : m2 photographiée une 2e fois (un peu décalée) ; m5 : une 3e page
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start) VALUES(1,'Pierre','MAZAUD','male','deceased',1)");
$mk = function ($name, $y0, $step, $shift, $dx = 0) { $im = imagecreatetruecolor(360, 460); imagefill($im, 0, 0, imagecolorallocate($im, 232, 218, 186)); $ink = imagecolorallocate($im, 50, 40, 30);
    if ($step) for ($y = $y0; $y < 440; $y += $step) { imagefilledrectangle($im, 30 + $shift + $dx, $y, 300 + $shift + $dx - ($y % 70), $y + 6, $ink); }
    imagepng($im, MEDIA_DIR . "/$name.png"); };
$mk('m1', 40, 36, 0); $mk('m2', 25, 60, 30); $mk('m3', 0, 0, 0); $mk('m4', 25, 60, 30, 2); $mk('m5', 60, 24, -10);
$m = $pdo->prepare("INSERT INTO media(id,title,filename,thumbnail,media_type) VALUES(?,?,?,?,'image')");
foreach (range(1, 5) as $id) { $m->execute([$id, "Vue $id", "m$id.png", "m$id.png"]); }
$r = save_recueil($pdo, ['title' => 'Registre de Sancoins', 'numbering' => 'page']);
recueil_add_images($pdo, ['recueil_id' => $r['id'], 'version_id' => (int) $pdo->query('SELECT id FROM recueil_versions')->fetchColumn(), 'mode' => 'new_pages', 'media_ids' => [1, 2, 3, 4, 5]]);
$ids = array_map('intval', $pdo->query('SELECT id FROM recueil_pages ORDER BY position')->fetchAll(PDO::FETCH_COLUMN));
echo json_encode(['ok' => 1, 'rid' => $r['id'], 'ids' => $ids]);`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0 || !/"ok"/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const {rid, ids} = JSON.parse(seed.stdout);
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const errs = [];
    try {
        const p = await (await browser.newContext({viewport: {width: 1440, height: 900}})).newPage();
        p.on('pageerror', e => errs.push(e.message));
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_EXT?.recueilVerif && window.LCNDA_EXT?.recueilEtat && window.LCNDA_APP?.state?.csrf, null, {timeout: 30000});
        const api = (x, q = {}) => p.evaluate(([y, z]) => window.LCNDA_APP.api(y, z), [x, q]);
        await p.evaluate(id => { const A = window.LCNDA_APP; A.state.hRecueil = {id, tab: 'etat', page: 0, view: 'grid', q: ''}; A.state.listType = 'recueils'; A.setModule('listes'); }, rid);
        await t('« 🔍 Pages blanches et doublons » : la page 3 blanche, les pages 2 et 4 en double ; rien ne change avant de valider', async () => {
            await p.waitForSelector('[data-re-verif]', {timeout: 20000}); await p.click('[data-re-verif]');
            await p.waitForSelector('.rv-dlg [data-rv-ok]:not([disabled])', {timeout: 20000});
            const st = await p.evaluate(() => ({blank: [...document.querySelectorAll('.rv-dlg [data-rv-blank]')].map(x => Number(x.dataset.rvBlank)), pairs: document.querySelectorAll('.rv-dlg .rv-pair').length,
                drop: [...document.querySelectorAll('.rv-dlg .rv-pair [data-rv-drop]')].map(x => Number(x.dataset.rvDrop))}));
            assert.deepStrictEqual(st.blank, [ids[2]]); assert.strictEqual(st.pairs, 1, JSON.stringify(st));
            const imgs = (await api('recueil', {id: rid})).images, mid = id => imgs.find(i => i.id === id).media_id;
            assert.deepStrictEqual(st.drop.map(mid).sort(), [2, 4]);
            assert.ok((await api('recueil', {id: rid})).pages.every(x => !x.absent), 'rien n’a changé');
        });
        await t('« Faire ce qui est coché » : page blanche, photo retirée (gardée dans Médias) ; ↶ Annuler remet tout', async () => {
            await p.evaluate(() => [...document.querySelectorAll('.rv-dlg .rv-pair [data-rv-drop]')].at(-1).click());
            await p.click('.rv-dlg [data-rv-ok]'); await p.waitForFunction(() => !document.querySelector('.rv-dlg'), null, {timeout: 15000}); await sleep(500);
            let D = await api('recueil', {id: rid});
            assert.strictEqual(D.pages.find(x => x.id === ids[2]).absent, 'blanche'); assert.strictEqual(D.images.length, 4);
            await p.evaluate(() => [...document.querySelectorAll('.ui-toast')].reverse().find(x => /page\(s\) blanche/.test(x.textContent)).querySelector('button').click()); await sleep(1200);
            D = await api('recueil', {id: rid}); assert.ok(!D.pages.find(x => x.id === ids[2]).absent, '↶ la page n’est plus blanche'); assert.strictEqual(D.images.length, 5, '↶ la photo revient');
        });
        await t('aucune erreur JavaScript', async () => { assert.deepStrictEqual(errs, []); });
    } finally { await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true}); }
    console.log(fails ? `${fails} essai(s) en échec` : 'Pages blanches et doublons marchent.');
    process.exit(fails ? 1 : 0);
})();
