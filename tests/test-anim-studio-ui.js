#!/usr/bin/env node
/* 🎞 Studio d'animation dans l'app (maquette docs/design/studio-animation.html) : le serveur (projets, ↶ Annuler, données des modèles,
 * mode consultation), l'écran (scènes, aperçu qui dessine, ligne de temps, réglages, ↶ ↷, enregistrement tout seul, rouvrir),
 * « 🎞 Animer » sous un diagramme daté, le lien depuis le 🎬 Film de la famille, et les fichiers fabriqués dans le navigateur
 * (GIF ; WebM et MP4 quand le navigateur sait les faire). Famille fictive MAZAUD, LACOMBE, DURAND.
 *   node tests/test-anim-studio-ui.js */
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
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-anim-'));
    fs.mkdirSync(path.join(tmp, 'media'));
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4'};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$ty = fn($s) => (int) $pdo->query("SELECT id FROM event_types WHERE slug='$s' LIMIT 1")->fetchColumn();
$pdo->exec("INSERT INTO places(id,name,latitude,longitude) VALUES(1,'Aurillac',44.93,2.44),(2,'Mauriac',45.22,2.33),(3,'Paris',48.86,2.35),(4,'Lyon',45.76,4.84)");
$P = [[1,'Pierre','MAZAUD','male',1750,1810,1,1],[2,'Marie','LACOMBE','female',1755,1820,2,1],[3,'Jean','MAZAUD','male',1780,1850,1,3],[4,'Anne','DURAND','female',1785,1860,3,3],
      [5,'Jean','MAZAUD','male',1810,1880,3,3],[6,'Louise','MAZAUD','female',1812,1890,3,4],[7,'Paul','DURAND','male',1840,1900,4,4],[8,'Rose','LACOMBE','female',1845,1910,2,3],[9,'Secret','DURAND','male',1850,1920,4,4]];
$ins = $pdo->prepare("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start,is_private) VALUES(?,?,?,?,'deceased',?,?)");
$ev = $pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,year,date_text,place_id) VALUES('person',?,?,?,?,?)");
foreach ($P as [$id,$f,$l,$g,$b,$d,$bp,$dp]) { $ins->execute([$id,$f,$l,$g,$id === 5 ? 1 : 0, $id === 9 ? 1 : 0]); $ev->execute([$id,$ty('birth'),$b,(string)$b,$bp]); $ev->execute([$id,$ty('death'),$d,(string)$d,$dp]); }
$ev->execute([3,$ty('residence'),1805,'1805',3]);
$pdo->exec("INSERT INTO families(id,partner1_id,partner2_id) VALUES(1,1,2),(2,3,4)");
$pdo->exec("INSERT INTO family_children(family_id,child_id) VALUES(1,3),(2,5),(2,6)");
$pdo->prepare("INSERT INTO events(scope,family_id,event_type_id,year,date_text,place_id) VALUES('family',?,?,?,?,?)")->execute([2,$ty('marriage'),1808,'1808',3]);
diagrams_ensure($pdo);
$pdo->prepare("INSERT INTO diagrams(id,name,kind,spec_json) VALUES(1,'Naissances par décennie','columns',?)")->execute([json_encode(['kind' => 'columns', 'title' => 'Naissances par décennie', 'rows' => [['label' => '1750', 's0' => 2], ['label' => '1780', 's0' => 2], ['label' => '1810', 's0' => 2], ['label' => '1840', 's0' => 2]]])]);
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
        p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR|tile|arcgis|openstreetmap/i.test(m.text())) errs.push('console : ' + m.text()); });
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_EXT?.openAnimStudio && window.LCNDA_EXT?.animExport && window.LCNDA_APP?.state?.csrf, null, {timeout: 30000});
        const api = (a, q = {}) => p.evaluate(async ([x, y]) => { try { return await window.LCNDA_APP.api(x, y); } catch (e) { return {error: e.message}; } }, [a, q]);
        const post = (a, b) => p.evaluate(async ([x, y]) => { try { const r = await window.LCNDA_APP.api(x, {}, {method: 'POST', body: y}); return r.result || r; } catch (e) { return {error: e.message}; } }, [a, b]);

        await t('serveur : les données des modèles (naissances, décès, lieux, parents, événements placés)', async () => {
            const d = await api('anim_people');
            const jean = d.people.find(x => x.id === 3); assert.deepEqual([jean.by, jean.dy, jean.bp, jean.fa, jean.mo, jean.g], [1780, 1850, 1, 1, 2, 'm']);
            assert.equal(d.root, 5); assert.deepEqual(d.places['3'], ['Paris', 48.86, 2.35]);
            assert.ok(d.events.some(e => e[0] === 3 && e[1] === 1808 && /marr/.test(e[2])), 'le mariage (événement du couple) compte pour les deux');
            assert.ok(d.people.some(x => x.id === 9), 'hors consultation, les fiches confidentielles sont là');
        });
        await t('serveur : un projet s’enregistre, se renomme, se relit ; supprimer puis ↶ remettre', async () => {
            const r = await post('save_anim_project', {title: 'Essai', data: {format: '1:1', scenes: [{id: 'a', type: 'title', dur: 3}]}}); assert.ok(r.id, JSON.stringify(r));
            assert.ok((await post('rename_anim_project', {id: r.id, title: 'Essai renommé'})).ok);
            const g = await api('anim_project', {id: r.id}); assert.equal(g.project.title, 'Essai renommé'); assert.equal(g.project.data.format, '1:1');
            const list = await api('anim_projects'); assert.ok(list.projects.some(x => x.id === r.id && x.scenes === 1 && x.seconds === 3));
            const del = await post('delete_anim_project', {id: r.id}); assert.ok(del.row);
            assert.ok((await api('anim_project', {id: r.id})).error, 'supprimé');
            await post('restore_anim_project', {row: del.row}); assert.equal((await api('anim_project', {id: r.id})).project.title, 'Essai renommé');
            assert.ok((await post('save_anim_project', {title: 'x', data: 'pas un objet'})).error, 'réglages illisibles refusés');
            await post('delete_anim_project', {id: r.id});
        });
        await t('le Studio s’ouvre sur « le grand film de la famille » : 6 scènes, l’aperçu dessine, enregistré tout seul', async () => {
            await p.evaluate(() => window.LCNDA_EXT.openAnimStudio({template: 'grandfilm'}));
            await p.waitForSelector('.an-dlg [data-an-sc="5"]', {timeout: 20000});
            await p.waitForFunction(() => window.LCNDA_EXT.__anim?.P?.id > 0, null, {timeout: 20000});
            const n = await p.evaluate(() => document.querySelectorAll('.an-dlg [data-an-sc]').length); assert.equal(n, 6);
            await sleep(800);
            const lit = await p.evaluate(() => { const c = document.querySelector('.an-dlg [data-an-cv]'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let s = 0; for (let i = 0; i < d.length; i += 400) s += d[i] + d[i + 1] + d[i + 2]; return s; });
            assert.ok(lit > 1000, 'le titre est dessiné');
        });
        await t('la scène des migrations : l’année, les légendes faites seules (départ de Jean), la caméra qui suit', async () => {
            await p.click('.an-dlg [data-an-sc="1"]'); await sleep(300);
            await p.evaluate(() => { const A = window.LCNDA_EXT.__anim; A.t = 4 + 40 * .5; return A.draw(); });
            await p.waitForFunction(() => /· 1[78]\d\d/.test(document.querySelector('.an-dlg [data-an-time]').textContent) && document.querySelector('.an-dlg [data-an-acap]'), null, {timeout: 40000}); // le fond de carte : sans Internet, on attend qu'il renonce
            const s = await p.evaluate(() => ({time: document.querySelector('.an-dlg [data-an-time]').textContent, caps: [...document.querySelectorAll('.an-dlg [data-an-acap]')].map(x => x.dataset.anAcap)}));
            assert.match(s.time, /0:24 \/ .* · 1[78]\d\d/);
            assert.ok(s.caps.some(c => /Jean MAZAUD part de Aurillac pour Paris/.test(c)), JSON.stringify(s.caps));
            const sel = await p.$eval('.an-dlg [data-an-f="cam.mode"]', e => e.value); assert.equal(sel, 'follow');
            if (process.env.SHOT) { await sleep(500); await p.screenshot({path: process.env.SHOT + '-mig.png'}); await p.click('.an-dlg [data-an-sc="2"]'); await p.evaluate(() => { const A = window.LCNDA_EXT.__anim; A.t = 44 + 12; return A.draw(); }); await sleep(1500); await p.screenshot({path: process.env.SHOT + '-race.png'}); await p.click('.an-dlg [data-an-sc="1"]'); await sleep(300); }
        });
        await t('les réglages changent la scène ; ↶ Annuler, ↷ Rétablir ; une légende à soi', async () => {
            await p.selectOption('.an-dlg [data-an-f="colorBy"]', 'gender'); await sleep(300);
            assert.equal(await p.evaluate(() => window.LCNDA_EXT.__anim.P.data.scenes[1].colorBy), 'gender');
            await p.click('.an-dlg [data-an="undo"]'); await sleep(200);
            assert.equal(await p.evaluate(() => window.LCNDA_EXT.__anim.P.data.scenes[1].colorBy), 'surname');
            await p.click('.an-dlg [data-an="redo"]'); await sleep(200);
            assert.equal(await p.evaluate(() => window.LCNDA_EXT.__anim.P.data.scenes[1].colorBy), 'gender');
            await p.click('.an-dlg [data-an="capadd"]'); await p.waitForSelector('.ask-text-dialog[open] input');
            await p.keyboard.type('La famille arrive à Paris'); await p.keyboard.press('Enter'); await sleep(500);
            const cap = await p.evaluate(() => window.LCNDA_EXT.__anim.P.data.scenes[1].captions[0]); assert.equal(cap.text, 'La famille arrive à Paris'); assert.ok(Number.isFinite(cap.year), 'posée sur une année');
            assert.ok(await p.$('.an-dlg [data-an-cap="0"]'), 'sur la ligne de temps');
        });
        await t('une légende faite seule se cache d’un clic ; la caméra à la main (◆) s’ajoute', async () => {
            const k = await p.$eval('.an-dlg [data-an-acap]', e => e.dataset.anAcap); await p.click(`.an-dlg [data-an-acap="${k}"]`); await sleep(300);
            assert.ok((await p.evaluate(() => window.LCNDA_EXT.__anim.P.data.scenes[1].hiddenAuto)).includes(k));
            await p.selectOption('.an-dlg [data-an-f="cam.mode"]', 'keys'); await sleep(300);
            const box = await p.$eval('.an-dlg [data-an-cv]', c => { const r = c.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
            await p.mouse.move(box[0], box[1]); await p.mouse.wheel(0, -300); await sleep(200);
            await p.click('.an-dlg [data-an-cambar] [data-an="camkey"]'); await sleep(300);
            const keys = await p.evaluate(() => window.LCNDA_EXT.__anim.P.data.scenes[1].cam.keys); assert.ok(keys.some(k2 => k2.z > 1.1), JSON.stringify(keys));
        });
        await t('les scènes : monter, dupliquer, supprimer puis ↶ remettre', async () => {
            await p.evaluate(() => document.querySelector('.an-dlg [data-an-mv="2|-1"]').click()); await sleep(200); // ↑ (le glisser ⠿ de l'app appuie sur les mêmes boutons)
            assert.equal(await p.evaluate(() => window.LCNDA_EXT.__anim.P.data.scenes[1].type), 'race');
            await p.evaluate(() => document.querySelector('.an-dlg [data-an-scm="1"]').click()); await p.locator('.ui-actmenu [role=menuitem]').filter({hasText: 'Supprimer la scène'}).click(); await sleep(300);
            assert.equal(await p.evaluate(() => window.LCNDA_EXT.__anim.P.data.scenes.length), 5);
            await p.locator('.ui-toast button', {hasText: /Annuler/}).first().click(); await sleep(300);
            assert.equal(await p.evaluate(() => window.LCNDA_EXT.__anim.P.data.scenes[1].type), 'race');
        });
        await t('enregistré tout seul, puis rouvert à l’identique', async () => {
            await p.evaluate(() => window.LCNDA_EXT.__anim.save()); await sleep(300);
            const id = await p.evaluate(() => window.LCNDA_EXT.__anim.P.id);
            const g = await api('anim_project', {id}); assert.equal(g.project.data.scenes.length, 6); assert.equal(g.project.data.scenes[2].colorBy, 'gender');
            await p.click('.an-dlg [data-an="close"]'); await sleep(400);
            await p.evaluate(i => window.LCNDA_EXT.openAnimStudio({id: i}), id); await p.waitForSelector('.an-dlg [data-an-sc="5"]');
            assert.equal(await p.evaluate(() => window.LCNDA_EXT.__anim.P.data.scenes[2].captions[0].text), 'La famille arrive à Paris');
            await p.click('.an-dlg [data-an="close"]'); await sleep(300);
        });
        await t('les fichiers : un GIF (relu GIF89a), et une vidéo WebM ou MP4 quand le navigateur sait', async () => {
            const r = await p.evaluate(async () => {
                const X = window.LCNDA_EXT.animExport, R = window.LCNDA_EXT.animRender;
                const proj = {format: '16:9', fps: 10, scenes: [{id: 'a', type: 'title', title: 'Essai', dur: 1}, {id: 'b', type: 'line', what: 'births', per: 'decade', dur: 1}]};
                const g = await X.makeGif(proj, {W: 160, H: 90, fps: 5});
                const head = new TextDecoder().decode(new Uint8Array(await g.blob.slice(0, 6).arrayBuffer()));
                const cap = await X.capabilities(320, 180), out = {gif: head, gifSize: g.blob.size, cap};
                if (cap.webcodecs && (cap.vp9 || cap.vp8)) { const v = await X.makeVideo(proj, {format: 'webm', W: 320, H: 180, fps: 10}); const b = new Uint8Array(await v.blob.slice(0, 4).arrayBuffer()); out.webm = [...b]; out.webmRealtime = v.realtime; }
                if (cap.webcodecs && cap.avc) { const v = await X.makeVideo(proj, {format: 'mp4', W: 320, H: 180, fps: 10}); out.mp4 = new TextDecoder().decode(new Uint8Array(await v.blob.slice(4, 8).arrayBuffer())); }
                const cues = await X.cues({scenes: [{id: 'c', type: 'title', dur: 2, captions: [{t: .5, text: 'Bonjour', dur: 1}]}]}, 320, 180); out.cues = cues;
                return out;
            });
            assert.equal(r.gif, 'GIF89a'); assert.ok(r.gifSize > 200);
            if (r.webm) { assert.deepEqual(r.webm, [0x1A, 0x45, 0xDF, 0xA3]); assert.equal(r.webmRealtime, false, 'image par image'); } else console.log('  (WebCodecs VP8/VP9 absent : WebM sauté)', JSON.stringify(r.cap));
            if (r.mp4) assert.equal(r.mp4, 'ftyp'); else console.log('  (H.264 absent dans ce navigateur : MP4 sauté)');
            assert.deepEqual(r.cues, [{start: 1, end: 2, text: 'Bonjour'}]);
        });
        await t('« 🎞 Animer » sous un diagramme daté ouvre le Studio avec ce diagramme ; le Film de la famille y mène aussi', async () => {
            await p.evaluate(() => { const spec = {kind: 'columns', title: 'Naissances', rows: [{label: '1750', s0: 2}, {label: '1780', s0: 2}, {label: '1810', s0: 3}]}, box = document.createElement('div'); box.id = 'dgp-test'; box.innerHTML = window.LCNDA_EXT.diagramRender.svg(spec); document.body.appendChild(box); window.LCNDA_EXT.diagramPerso.player(box, spec); });
            await p.evaluate(() => document.querySelector('#dgp-test + .h-dgp-play [data-dgp-anim]').click()); await p.waitForSelector('.an-dlg [data-an-sc="0"]');
            const s = await p.evaluate(() => window.LCNDA_EXT.__anim.P.data.scenes[0]); assert.equal(s.type, 'diagram'); assert.equal(s.spec.rows.length, 3);
            await sleep(600);
            const time = await p.$eval('.an-dlg [data-an-time]', e => e.textContent); assert.match(time, /1750|1780|1810/);
            await p.click('.an-dlg [data-an="close"]'); await sleep(300);
        });
        await t('🎬 avec le Montage vidéo, sans doublon : pas de scène « Photo » ici ; « Ajouter au montage » range le film dans les médias et le rend au montage', async () => {
            const cap = await p.evaluate(() => window.LCNDA_EXT.animExport.capabilities(320, 180));
            await p.evaluate(() => { window.__toMontage = null; window.LCNDA_EXT.openAnimStudio({template: 'line', toMontage: m => { window.__toMontage = m; }}); });
            await p.waitForSelector('.an-dlg [data-an-sc="0"]');
            await p.click('.an-dlg [data-an="add"]');
            const items = await p.$$eval('.ui-actmenu [role=menuitem]', l => l.map(x => x.textContent.trim()));
            assert.ok(!items.some(x => /^🖼\s*Photo$/.test(x)), 'pas de scène Photo : ' + items.join(' | ')); assert.ok(items.some(x => /Montage vidéo/.test(x)));
            await p.keyboard.press('Escape');
            await p.evaluate(() => { const s = window.LCNDA_EXT.__anim.P.data.scenes[0]; s.dur = 1; window.LCNDA_EXT.__anim.P.data.quality = 240; });
            await p.click('.an-dlg [data-an="export"]'); await p.waitForSelector('.an-exp [data-montage]');
            if (!(cap.webcodecs && (cap.vp9 || cap.vp8 || cap.avc)) && !cap.recorder) { console.log('  (vidéo impossible dans ce navigateur : sauté)'); return; }
            await p.click('.an-exp [data-fmt] [data-v="webm"]'); await p.selectOption('.an-exp [data-q]', '720');
            await p.click('.an-exp [data-montage]');
            await p.waitForFunction(() => window.__toMontage, null, {timeout: 60000});
            const m = await p.evaluate(() => window.__toMontage); assert.ok(m.id > 0 && /\.(webm|mp4)$/.test(m.filename), JSON.stringify(m)); assert.equal(m.media_type, 'video');
            assert.ok(!(await p.$('.an-dlg')), 'le Studio s’est refermé');
            const src = require('fs').readFileSync(require('path').join(__dirname, '../assets/js/heritage-studio-av.js'), 'utf8');
            assert.match(src, /\['anim', '🎞 Une carte ou un graphique animé \(Studio d’animation\)…'\]/); assert.match(src, /k === 'anim'\) return ext\.openAnimStudio\(\{toMontage/);
        });
        await t('Outils de modification : le Studio y est, avec ses projets et les modèles', async () => {
            const tool = await p.evaluate(() => window.LCNDA_EXT.editToolsExtra.find(x => x.key === 'anim'));
            assert.ok(tool);
            const rows = await p.evaluate(async () => window.LCNDA_EXT.editToolsExtra.find(x => x.key === 'anim').load());
            assert.ok(rows.length >= 2 && rows.every(r => r.name), JSON.stringify(rows));
            assert.match(await p.evaluate(() => window.LCNDA_EXT.editToolsExtra.find(x => x.key === 'anim').extra), /data-an-tpl="grandfilm"/);
        });
        await t('mode consultation : les données sans les fiches confidentielles, rien ne s’enregistre', async () => {
            fs.writeFileSync(path.join(tmp, 'consultation.json'), JSON.stringify({hash: 'x'}));
            const d = await api('anim_people'); assert.ok(!d.people.some(x => x.id === 9), 'la fiche confidentielle reste cachée');
            assert.ok((await post('save_anim_project', {title: 'Non', data: {}})).error, 'écriture refusée');
            fs.unlinkSync(path.join(tmp, 'consultation.json'));
        });
        await t('🏛 « Frontières qui changent » : 1810, Bruxelles et Strasbourg sont français ; 1880, ni l’un ni l’autre ; 1925, Strasbourg l’est', async () => {
            const r = await p.evaluate(async () => {
                const F = window.LCNDA_EXT.frontieres, geo = await F.ready(), W = 800, H = 600, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
                const [w0, s0, e0, n0] = F.VIEWS.napoleon, my = lat => Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) * 180 / Math.PI, k = Math.min(W / (e0 - w0), H / (my(n0) - my(s0))), ox = (W - (e0 - w0) * k) / 2, oy = (H - (my(n0) - my(s0)) * k) / 2;
                const at = (lon, lat) => { const d = g.getImageData(Math.round(ox + (lon - w0) * k), Math.round(oy + (my(n0) - my(lat)) * k), 1, 1).data; return d[2] > 120 && d[0] < 120; }; // bleu = la France
                const out = {};
                for (const y of [1810, 1880, 1925]) { F.draw(g, y, W, H, {geo, view: 'napoleon', color: '#2a5fa8', labels: false}); out[y] = {bxl: at(4.35, 50.85), sxb: at(7.75, 48.58), paris: at(2.35, 48.85), rome: at(12.5, 41.9)}; }
                return out;
            });
            assert.deepEqual(r[1810], {bxl: true, sxb: true, paris: true, rome: true});
            assert.deepEqual(r[1880], {bxl: false, sxb: false, paris: true, rome: false});
            assert.deepEqual(r[1925], {bxl: false, sxb: true, paris: true, rome: false});
            await p.evaluate(() => window.LCNDA_EXT.openAnimStudio({template: 'borders'})); await p.waitForSelector('.an-dlg [data-an-sc="0"]');
            assert.equal(await p.evaluate(() => window.LCNDA_EXT.__anim.P.data.scenes[0].type), 'borders');
            await sleep(1500); await p.keyboard.press('Escape'); await sleep(300);
            if (await p.$('.an-dlg')) await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => { d.close(); d.parentNode?.removeChild(d); }));
        });
        await t('aucune erreur JavaScript', async () => { assert.deepEqual(errs, []); });
    } finally { await browser.close(); proc.kill(); }
    console.log(fails ? `${fails} essai(s) en échec` : 'Le Studio d’animation marche.');
    process.exit(fails ? 1 : 0);
})();
