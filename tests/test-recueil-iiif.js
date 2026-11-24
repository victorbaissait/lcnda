#!/usr/bin/env node
/* 🌐 Un recueil depuis un registre en ligne (IIIF) — lib/recueil_iiif.php, assets/js/heritage-recueil-iiif.js :
 *  1. serveur : manifeste IIIF 2 (service d'images) et 3 (image directe) lus ; une adresse locale ou pas http(s) refusée ;
 *     pas un manifeste → message clair ; téléchargement par paquets, une vue par page, le nom de la vue sur la page ;
 *  2. dans l'app : Listes → Recueils → « 🌐 Depuis un registre en ligne… » : regarder, choisir de… à…, télécharger, le recueil
 *     s'ouvre ; ↶ Annuler le supprime avec ses photos.
 * Le « site » https://iiif.test/… est un dossier lu sur le disque (seulement quand GENEALOGY_TEST=1).
 *   node tests/test-recueil-iiif.js */
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

(async () => {
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-iiif-'));
    fs.mkdirSync(path.join(tmp, 'media')); const site = path.join(tmp, 'site'); fs.mkdirSync(site);
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4', GENEALOGY_TEST: '1', LCNDA_TEST_IIIF_DIR: site};
    const php = code => spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], {cwd: root, encoding: 'utf8', env});
    // le faux site : 6 vues (PNG) derrière un service d'images (IIIF 2), et un manifeste IIIF 3 de 2 vues directes
    const mk = php(String.raw`foreach (range(1, 6) as $i) { $d = getenv('LCNDA_TEST_IIIF_DIR') . "/img/$i/full/!2000,2000/0"; @mkdir($d, 0777, true); $im = imagecreatetruecolor(120, 160); imagefill($im, 0, 0, imagecolorallocate($im, 200 + $i * 5, 190, 160)); imagepng($im, "$d/default.jpg"); }
        @mkdir(getenv('LCNDA_TEST_IIIF_DIR') . '/v3', 0777, true); foreach ([1, 2] as $i) { $im = imagecreatetruecolor(100, 100); imagepng($im, getenv('LCNDA_TEST_IIIF_DIR') . "/v3/p$i.png"); } echo 'ok';`);
    assert.strictEqual(mk.stdout, 'ok', mk.stderr);
    const labels = ['Couverture', 'f° 1 r°', 'f° 1 v°', '4', 'f° 2 v°', 'f° 3 r°'];
    fs.writeFileSync(path.join(site, 'manifest.json'), JSON.stringify({'@context': 'http://iiif.io/api/presentation/2/context.json', '@id': 'https://iiif.test/manifest.json', label: 'Registre paroissial de Sancoins (1789-1792)', attribution: 'Archives départementales (exemple)',
        sequences: [{canvases: labels.map((l, i) => ({label: l, images: [{resource: {'@id': 'https://iiif.test/nope.jpg', service: {'@id': `https://iiif.test/img/${i + 1}`}}}]}))}]}));
    fs.writeFileSync(path.join(site, 'v3.json'), JSON.stringify({type: 'Manifest', label: {fr: ['Lettre de Pierre MAZAUD']}, items: [1, 2].map(i => ({label: {none: [`p. ${i}`]}, items: [{items: [{body: {id: `https://iiif.test/v3/p${i}.png`, type: 'Image'}}]}]}))}));
    fs.writeFileSync(path.join(site, 'pas.json'), JSON.stringify({hello: 'monde'}));
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start) VALUES(1,'Pierre','MAZAUD','male','deceased',1)");
echo json_encode(['ok' => 1]);`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0 || !/"ok"/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const errs = [];
    try {
        const p = await (await browser.newContext({viewport: {width: 1440, height: 900}})).newPage();
        p.on('pageerror', e => errs.push(e.message));
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_EXT?.recueilIiif && window.LCNDA_APP?.state?.csrf, null, {timeout: 30000});
        const api = (x, q = {}) => p.evaluate(([y, z]) => window.LCNDA_APP.api(y, z).catch(e => ({error: e.message})), [x, q]);
        const post = (a, b) => p.evaluate(async ([x, y]) => { try { const r = await window.LCNDA_APP.api(x, {}, {method: 'POST', body: y}); return r.result || r; } catch (e) { return {error: e.message}; } }, [a, b]);
        await t('serveur : IIIF 2 et 3 lus (titre, attribution, vues) ; pas un manifeste, une adresse locale, un autre protocole : refusés', async () => {
            const a = await api('recueil_iiif_preview', {url: 'https://iiif.test/manifest.json'});
            assert.deepStrictEqual([a.title, a.count, a.attribution, a.labels[1]], ['Registre paroissial de Sancoins (1789-1792)', 6, 'Archives départementales (exemple)', 'f° 1 r°']);
            const b = await api('recueil_iiif_preview', {url: 'https://iiif.test/v3.json'}); assert.deepStrictEqual([b.title, b.count, b.labels], ['Lettre de Pierre MAZAUD', 2, ['p. 1', 'p. 2']]);
            assert.match((await api('recueil_iiif_preview', {url: 'https://iiif.test/pas.json'})).error, /pas un manifeste IIIF/);
            assert.match((await api('recueil_iiif_preview', {url: `http://127.0.0.1:${port}/manifest.json`})).error, /adresse publique/);
            assert.match((await api('recueil_iiif_preview', {url: 'file:///etc/passwd'})).error, /adresse publique/);
        });
        await t('serveur : téléchargement par paquets de 4, une vue par page, le nom de la vue sur la page (« 4 » : rien)', async () => {
            const r1 = await post('recueil_iiif_import', {url: 'https://iiif.test/manifest.json', recueil_id: 0, from: 1, to: 6, done: 0});
            assert.deepStrictEqual([r1.created, r1.done, r1.total, r1.media_ids.length], [true, 4, 6, 4]);
            const r2 = await post('recueil_iiif_import', {url: 'https://iiif.test/manifest.json', recueil_id: r1.recueil_id, from: 1, to: 6, done: 4});
            assert.deepStrictEqual([r2.created, r2.done, r2.media_ids.length], [false, 6, 2]);
            const D = await api('recueil', {id: r1.recueil_id});
            assert.deepStrictEqual(D.pages.map(x => x.label), ['Couverture', 'f° 1 r°', 'f° 1 v°', '', 'f° 2 v°', 'f° 3 r°']);
            assert.strictEqual(D.images.length, 6); assert.match(D.recueil.description, /iiif\.test\/manifest\.json/);
            assert.ok(fs.readdirSync(path.join(tmp, 'media')).filter(f => /\.png$/.test(f)).length >= 6, 'les vues sont dans les médias');
            await post('delete_recueil', {id: r1.recueil_id});
        });
        await t('dans l’app : « 🌐 Depuis un registre en ligne… », regarder, vues 2 à 3, télécharger : le recueil s’ouvre ; ↶ Annuler le supprime', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.hRecueil = {id: 0}; A.state.listType = 'recueils'; A.setModule('listes'); });
            await p.waitForSelector('[data-rc-iiif]', {timeout: 20000, state: 'attached'}); // rangé dans « ⋯ » de l'en-tête
            await p.evaluate(() => { const m = document.querySelector('[data-rc-iiif]').closest('.ui-ph-more'); const s = m?.querySelector('summary, button:not([data-rc-iiif])'); if (m?.tagName === 'DETAILS') m.open = true; else s?.click(); });
            await p.click('[data-rc-iiif]');
            await p.fill('.rq-dlg [data-rq-url]', 'https://iiif.test/manifest.json'); await p.click('.rq-dlg [data-rq-look]');
            await p.waitForSelector('.rq-dlg [data-rq-from]'); assert.match(await p.textContent('.rq-dlg .rq-found'), /Registre paroissial de Sancoins.*6 vues/s);
            await p.click('.rq-dlg [data-rq-from]'); await p.fill('.rq-dlg [data-rq-from]', '2'); await p.fill('.rq-dlg [data-rq-to]', '3');
            await p.click('.rq-dlg [data-rq-go]');
            await p.waitForFunction(() => !document.querySelector('.rq-dlg'), null, {timeout: 20000});
            await p.waitForFunction(() => /Registre paroissial de Sancoins/.test(document.querySelector('#workspace')?.textContent || ''), null, {timeout: 15000});
            const list = (await api('recueils')).items || (await api('recueils')).recueils || []; const one = list.find(r => /Sancoins/.test(r.title));
            assert.ok(one, JSON.stringify(list).slice(0, 200)); const D = await api('recueil', {id: one.id}); assert.deepStrictEqual(D.pages.map(x => x.label), ['f° 1 r°', 'f° 1 v°']);
            await p.evaluate(() => [...document.querySelectorAll('.ui-toast')].reverse().find(x => /2 vues/.test(x.textContent)).querySelector('button').click()); await sleep(1200);
            const after = (await api('recueils')).items || (await api('recueils')).recueils || []; assert.ok(!after.some(r => /Sancoins/.test(r.title)), '↶ Annuler');
        });
        await t('aucune erreur JavaScript', async () => { assert.deepStrictEqual(errs, []); });
    } finally { await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true}); }
    console.log(fails ? `${fails} essai(s) en échec` : 'Les recueils depuis un registre en ligne marchent.');
    process.exit(fails ? 1 : 0);
})();
