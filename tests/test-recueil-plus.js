#!/usr/bin/env node
/* ➕ Recueils, les idées en plus : 👥 pages confiées (« Confier à… », « Pages de : … », sur la page), 📈 avancement (un point par jour,
 * courbe, estimation, objectif), 📤 export EAD (bien formé, services › fonds › recueils › chapitres), 🌍 page à partager (HTML seul).
 *   node tests/test-recueil-plus.js */
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
const day = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

(async () => {
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-plus-'));
    fs.mkdirSync(path.join(tmp, 'media'));
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4'};
    const php = code => spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], {cwd: root, encoding: 'utf8', env});
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start) VALUES(1,'Pierre','MAZAUD','male','deceased',1)");
$svc = save_archive_service($pdo, ['name' => 'Archives départementales du Cher', 'short_name' => 'AD Cher', 'kind' => 'departmental'])['id'];
foreach (range(1, 6) as $id) { $im = imagecreatetruecolor(80, 100); imagefill($im, 0, 0, imagecolorallocate($im, 230, 215, 180)); imagepng($im, MEDIA_DIR . "/m$id.png"); }
$m = $pdo->prepare("INSERT INTO media(id,title,filename,thumbnail,media_type) VALUES(?,?,?,?,'image')"); foreach (range(1, 6) as $id) { $m->execute([$id, "Vue $id", "m$id.png", "m$id.png"]); }
$r = save_recueil($pdo, ['title' => 'Registre de Sancoins & environs', 'reference' => '3 E 1234', 'date_text' => '1789-1792', 'archive_service_id' => $svc, 'fonds' => 'Paroisse de Sancoins', 'url' => 'https://archives.exemple.fr/ark:/1', 'language' => 'Français', 'reuse' => 'etalab']);
recueil_add_images($pdo, ['recueil_id' => $r['id'], 'version_id' => (int) $pdo->query('SELECT MAX(id) FROM recueil_versions')->fetchColumn(), 'mode' => 'new_pages', 'media_ids' => range(1, 6)]);
$ids = array_map('intval', $pdo->query('SELECT id FROM recueil_pages ORDER BY position')->fetchAll(PDO::FETCH_COLUMN));
$c = save_recueil_toc($pdo, ['recueil_id' => $r['id'], 'title' => 'Année 1789', 'page_from' => $ids[0], 'page_to' => $ids[3], 'year_from' => 1789]);
save_recueil_toc($pdo, ['recueil_id' => $r['id'], 'parent_id' => $c['id'], 'title' => 'Baptêmes 1789', 'page_from' => $ids[0], 'page_to' => $ids[1], 'act_kind' => 'bapteme']);
save_recueil_toc($pdo, ['recueil_id' => $r['id'], 'kind' => 'element', 'title' => 'Mariage de Louis LACOMBE <et> Anne MAZAUD', 'page_from' => $ids[4], 'pos_from' => 'milieu', 'note' => 'Témoins : Jean DURAND']);
recueil_pages_set($pdo, ['recueil_id' => $r['id'], 'page_ids' => [$ids[0], $ids[1]], 'fields' => ['state' => 'done']]);
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
        const p = await (await browser.newContext({viewport: {width: 1440, height: 900}, acceptDownloads: true})).newPage();
        p.on('pageerror', e => errs.push(e.message));
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_EXT?.recueilPlus && window.LCNDA_APP?.state?.csrf, null, {timeout: 30000});
        const api = (x, q = {}) => p.evaluate(([y, z]) => window.LCNDA_APP.api(y, z).catch(e => ({error: e.message})), [x, q]);
        const post = (x, body) => p.evaluate(async ([y, z]) => { try { const r = await window.LCNDA_APP.api(y, {}, {method: 'POST', body: z}); return r.result || r; } catch (e) { return {error: e.message}; } }, [x, body]);

        await t('📈 un point par jour (quand l’état est calculé) ; l’estimation au rythme des 30 derniers jours ; l’objectif', async () => {
            await api('recueil', {id: rid});
            let pts = (await api('recueil_progress', {id: rid})).points;
            assert.equal(pts.length, 1); assert.deepEqual([pts[0].day, pts[0].live, pts[0].rel], [day(0), 6, 2]);
            php(`require 'lib/bootstrap.php'; recueil_plus_ensure(db()); db()->exec("INSERT INTO recueil_progress(recueil_id,day,live,tr,rel,photos,absent) VALUES(${rid},'${day(40)}',6,0,0,6,0),(${rid},'${day(30)}',6,1,0,6,0)");`);
            pts = (await api('recueil_progress', {id: rid})).points; assert.equal(pts.length, 3);
            const e = await p.evaluate(([x, g]) => window.LCNDA_EXT.recueilPlus.estimate(x, g), [pts, day(-10)]);
            assert.equal(e.left, 4); assert.ok(Math.abs(e.rate - 2 / 30) < 1e-9, String(e.rate));
            assert.equal(e.end, day(-60), 'encore 4 pages à 2 pages par mois : dans 60 jours'); assert.equal(e.vs, 'late');
        });
        await t('👥 côté serveur : confier des pages, ↶ Annuler', async () => {
            const r = await post('recueil_pages_set', {recueil_id: rid, page_ids: [ids[2], ids[3]], fields: {assignee: 'Marie'}});
            assert.deepEqual((await api('recueil', {id: rid})).pages.map(x => x.assignee), ['', '', 'Marie', 'Marie', '', '']);
            await post('recueil_pages_restore', {recueil_id: rid, before: r.before, gap_id: 0});
            assert.ok((await api('recueil', {id: rid})).pages.every(x => x.assignee === ''));
        });
        await t('📤 EAD : bien formé, service › fonds › recueil (cote, dates, communicabilité, licence) › chapitres et passages', async () => {
            const r = await api('recueils_ead'); assert.equal(r.recueils, 1);
            fs.writeFileSync(path.join(tmp, 'ead.xml'), r.xml);
            const chk = php(`$d = new DOMDocument(); if (!$d->load('${path.join(tmp, 'ead.xml')}')) { echo 'BAD'; exit; } $x = new DOMXPath($d); $x->registerNamespace('e', 'urn:isbn:1-931666-22-9');
                echo $x->query('//e:c[@level="otherlevel"][@otherlevel="service"]/e:did/e:unittitle')->item(0)->textContent, '|', $x->query('//e:c[@level="fonds"]/e:did/e:unittitle')->item(0)->textContent, '|',
                $x->query('//e:c[@level="file"]/e:did/e:unitid')->item(0)->textContent, '|', $x->query('//e:c[@level="file"]/e:did/e:unittitle')->item(0)->textContent, '|',
                $x->query('//e:c[@level="file"]/e:accessrestrict/e:p')->item(0)->textContent, '|', $x->query('//e:c[@level="file"]/e:userestrict/e:p')->item(0)->textContent, '|',
                $x->query('//e:c[@otherlevel="chapitre"]/e:c[@otherlevel="chapitre"]/e:did/e:unittitle')->item(0)->textContent, '|', $x->query('//e:c[@level="item"]/e:did/e:unittitle')->item(0)->textContent, '|',
                $x->query('//e:c[@level="file"]/e:did/e:dao')->item(0)->getAttribute('href');`);
            assert.equal(chk.stdout, 'Archives départementales du Cher|Paroisse de Sancoins|3 E 1234|Registre de Sancoins & environs|Communicable.|Licence ouverte (Etalab)|Baptêmes 1789|Mariage de Louis LACOMBE <et> Anne MAZAUD|https://archives.exemple.fr/ark:/1', chk.stderr);
        });
        await p.evaluate(id => { const A = window.LCNDA_APP; A.state.hRecueil = {id, tab: 'etat', page: 0, view: 'grid', q: ''}; A.state.listType = 'recueils'; A.setModule('listes'); }, rid);
        await p.waitForSelector('.re-tab .re-cell', {timeout: 20000});
        await t('l’onglet État : la courbe d’avancement et l’estimation ; 🎯 l’objectif (fenêtre « Numérotation ») et « en retard »', async () => {
            await p.waitForSelector('[data-re-progress]:not([hidden]) .rp-chart', {timeout: 15000});
            assert.match(await p.evaluate(() => document.querySelector('[data-re-progress]').textContent), /Au rythme actuel \(0\.5 pages relues par semaine\), fini vers le/);
            await p.click('[data-re-meta]'); await p.waitForSelector('dialog[open] [name=goal_date]');
            await p.fill('dialog[open] [name=goal_date]', day(-10)); await p.click('dialog[open] [type=submit]');
            await p.waitForFunction(() => /Objectif : fini pour le .* à ce rythme, en retard/.test(document.querySelector('[data-re-progress]')?.textContent || ''), null, {timeout: 15000});
            assert.equal((await api('recueil', {id: rid})).recueil.goal_date, day(-10));
        });
        await t('👥 « Confier à… » deux pages (Marie), « Pages de : Marie », sur la page ; ↶ Annuler', async () => {
            await p.click('[data-re-pick]');
            await p.click(`.re-map [data-re-page="${ids[2]}"]`); await p.click(`.re-map [data-re-page="${ids[3]}"]`, {modifiers: ['Shift']});
            await p.click('[data-re-act="assign"]'); await p.waitForSelector('dialog[open] [name=assignee]');
            await p.fill('dialog[open] [name=assignee]', 'Marie'); await p.click('dialog[open] [type=submit]');
            await p.waitForSelector('[data-re-who]', {timeout: 10000});
            await p.selectOption('[data-re-who]', 'Marie'); await sleep(200);
            assert.deepEqual(await p.evaluate(() => [...document.querySelectorAll('.re-map .re-cell')].map(c => c.classList.contains('is-dim'))), [true, true, false, false, true, true]);
            await p.selectOption('[data-re-who]', '-'); await sleep(200);
            assert.equal(await p.evaluate(() => document.querySelectorAll('.re-map .re-cell.is-dim').length), 2);
            if (await p.evaluate(() => !!document.querySelector('.re-pickbar'))) await p.click('[data-re-pick]'); // le choix se referme quand l'écran est redessiné
            await p.click(`.re-map [data-re-page="${ids[2]}"]`); await p.waitForSelector('[data-rc-etat] .re-page');
            assert.match(await p.evaluate(() => document.querySelector('[data-rc-etat]').textContent.replace(/\s+/g, ' ')), /👥 Confiée à\s*Marie/);
            assert.ok(await p.evaluate(() => { const t = [...document.querySelectorAll('.ui-toast')].reverse().find(x => /confiées à Marie/.test(x.textContent)); t?.querySelector('button')?.click(); return !!t; }));
            await sleep(800); assert.ok((await api('recueil', {id: rid})).pages.every(x => x.assignee === ''));
        });
        await t('🌍 « Page à partager » : un fichier HTML seul (fiche, état, sommaire en <details>, passages échappés)', async () => {
            await p.evaluate(() => document.querySelector('[data-rc-tab="etat"]').click()); await p.waitForSelector('[data-re-share]');
            const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-re-share]')]);
            const html = fs.readFileSync(await dl.path(), 'utf8');
            assert.match(dl.suggestedFilename(), /\.html$/);
            assert.match(html, /<h1>📚 Registre de Sancoins &amp; environs<\/h1>/); assert.match(html, /AD|Archives départementales du Cher/);
            assert.match(html, /<details open><summary><span class="g">p\. 1–4<\/span> <b>Année 1789<\/b><\/summary>/); assert.match(html, /Mariage de Louis LACOMBE &lt;et&gt; Anne MAZAUD/);
            assert.ok(!/<script/i.test(html), 'aucun programme dans la page');
            assert.equal((html.match(/<span class="f"/g) || []).length, 2, 'les 2 pages finies');
        });
        await t('📤 « ⤓ EAD » dans la vue des fonds', async () => {
            await p.evaluate(() => { localStorage.setItem('genealogie-recueils-vue', 'fonds'); const A = window.LCNDA_APP; A.state.hRecueil = {id: 0}; A.state.listType = 'recueils'; A.setModule('listes'); });
            await p.waitForSelector('[data-rf-ead]', {timeout: 20000});
            const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-rf-ead]')]);
            assert.match(fs.readFileSync(await dl.path(), 'utf8'), /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<ead xmlns="urn:isbn:1-931666-22-9"/);
        });
        await t('migration 109 rejouable', async () => {
            const r = php(`require 'lib/bootstrap.php'; $p = db(); schema_v109($p); schema_v109($p); echo $p->query('PRAGMA user_version')->fetchColumn(), ' ', SCHEMA_VERSION, ' ', $p->query("SELECT count(*) FROM pragma_table_info('recueil_pages') WHERE name='assignee'")->fetchColumn();`);
            const m = r.stdout.match(/^(\d+) (\d+) 1$/); assert.ok(m && m[1] === m[2] && Number(m[1]) >= 109, r.stdout + r.stderr);
        });
        await t('aucune erreur JavaScript', async () => { assert.deepStrictEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true});
    }
    console.log(fails ? `${fails} essai(s) en échec` : 'Les idées en plus des recueils marchent.');
    process.exit(fails ? 1 : 0);
})();
