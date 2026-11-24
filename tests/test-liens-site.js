#!/usr/bin/env node
/* 🌐 Mon site web : les liens avec les autres outils (maquette docs/design/outils-liens.html).
 *  1. nettoyage : un SVG collé perd scripts, évènements, liens vers l'extérieur (ses ids sont préfixés, ses liens internes suivent) ;
 *     un texte du Traitement de texte est mis au propre (ni script, ni image du web, ni javascript:, h1 → h2) ;
 *  2. blocs (＋ Blocs) : 🎬 Vidéo, 🎧 Son (+ transcription), ✒️ Dessin (un de mes dessins), 📝 Document, 🎞️ Diaporama, posés dans une page ;
 *     le code : rien à signaler, les balises connues ; « Ceci est » sur une vidéo : « Changer la vidéo… » ;
 *  3. ext.siteReceive (via ext.sendTo, « 📤 Envoyer vers… ») : quel site, quelle page, le bloc à la fin, enregistré, ↶ Annuler ;
 *     une nouvelle page pour un dessin ; un texte ; un nouveau site (↶ Annuler le retire) ;
 *  4. export .zip : la vidéo et le son copiés tels quels dans medias/, les images du diaporama, js/diaporama-lcnda.js ; page seule : tout dedans ;
 *     🧭 compatibilité : vidéo WebM et son Ogg signalés ; ▶ Tester : les boutons ‹ › du diaporama (pas en mode modifier).
 *   node tests/test-liens-site.js */
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
const hasPy = spawnSync('python3', ['-c', 'import zipfile'], {encoding: 'utf8'}).status === 0;

(async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-site-liens-'));
    fs.mkdirSync(path.join(tmp, 'media'));
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4'};
    // des médias : deux photos (vraies images), une vidéo MP4, un son MP3 (octets factices : ils sont copiés tels quels)
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
foreach (['maison-mazaud.png' => [200, 40, 40], 'moulin-lacombe.png' => [40, 120, 200]] as $f => $c) { $im = imagecreatetruecolor(64, 40); imagefill($im, 0, 0, imagecolorallocate($im, ...$c)); imagepng($im, MEDIA_DIR.'/'.$f); }
file_put_contents(MEDIA_DIR.'/cousinade-durand.mp4', str_repeat('VIDEO-MP4-', 500));
file_put_contents(MEDIA_DIR.'/temoignage-lacombe.mp3', str_repeat('AUDIO-MP3-', 300));
$pdo->exec("INSERT INTO persons(first_name,last_name,gender,living_status) VALUES('Pierre','MAZAUD','male','deceased')");
$ids = [];
foreach ([['La maison MAZAUD', 'image', 'maison-mazaud.png'], ['Le moulin LACOMBE', 'image', 'moulin-lacombe.png'], ['La cousinade DURAND', 'video', 'cousinade-durand.mp4'], ['Mémé LACOMBE raconte', 'audio', 'temoignage-lacombe.mp3']] as [$t, $k, $f]) {
  $pdo->prepare("INSERT INTO media(title, media_type, filename, thumbnail) VALUES(?,?,?,?)")->execute([$t, $k, $f, $k === 'image' ? $f : '']); $ids[$f] = (int) $pdo->lastInsertId(); }
echo json_encode($ids);`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0 || !/mazaud/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const MID = JSON.parse(seed.stdout.trim().split('\n').pop());
    const M = {img1: {id: MID['maison-mazaud.png'], filename: 'maison-mazaud.png', title: 'La maison MAZAUD'}, img2: {id: MID['moulin-lacombe.png'], filename: 'moulin-lacombe.png', title: 'Le moulin LACOMBE'},
        video: {id: MID['cousinade-durand.mp4'], filename: 'cousinade-durand.mp4', title: 'La cousinade DURAND'}, audio: {id: MID['temoignage-lacombe.mp3'], filename: 'temoignage-lacombe.mp3', title: 'Mémé LACOMBE raconte'}};
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const errs = [];
    try {
        const p = await (await browser.newContext({viewport: {width: 1440, height: 900}})).newPage();
        p.on('pageerror', e => errs.push(e.message));
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_EXT?.siteReceive && window.LCNDA_EXT?.siteKit && window.LCNDA_EXT?.sendTo && window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.openDialog, null, {timeout: 60000}).catch(async e => { console.log(await p.evaluate(() => JSON.stringify({r: !!window.LCNDA_EXT?.siteReceive, k: !!window.LCNDA_EXT?.siteKit, s: !!window.LCNDA_EXT?.sendTo, c: !!window.LCNDA_APP?.state?.csrf, d: !!window.LCNDA_EXT?.openDialog})), errs); throw e; });
        const api = (x, q = {}) => p.evaluate(([y, z]) => window.LCNDA_APP.api(y, z).catch(e => ({error: e.message})), [x, q]);
        const post = (a, b) => p.evaluate(async ([x, y]) => { try { const r = await window.LCNDA_APP.api(x, {}, {method: 'POST', body: y}); return r.result || r; } catch (e) { return {error: e.message}; } }, [a, b]);
        /** clique l'élément d'un petit menu de l'app (UI.menuAt) dont le texte contient « text » */
        const menu = async text => { await p.waitForFunction(x => [...document.querySelectorAll('.ui-actmenu-i')].some(b => b.textContent.includes(x)), text, {timeout: 10000}); await p.evaluate(x => [...document.querySelectorAll('.ui-actmenu-i')].find(b => b.textContent.includes(x)).click(), text); await sleep(150); };
        /** la fenêtre ouverte la plus haute : valider (après avoir rempli sa case de texte, si on en donne une) */
        const submitTop = async (fill = null) => { await p.waitForFunction(() => [...document.querySelectorAll('dialog[open] form')].length, null, {timeout: 10000}); await p.evaluate(v => { const d = [...document.querySelectorAll('dialog[open]')].pop(); const ta = d.querySelector('textarea, input[type=text]'); if (v !== null && ta) ta.value = v; d.querySelector('[type=submit]').click(); }, fill); await sleep(250); };
        const undoLast = async re => { await p.waitForFunction(r => [...document.querySelectorAll('.ui-toast')].some(x => new RegExp(r).test(x.textContent) && x.querySelector('button')), re, {timeout: 10000}); await p.evaluate(r => [...document.querySelectorAll('.ui-toast')].reverse().find(x => new RegExp(r).test(x.textContent)).querySelector('button').click(), re); await sleep(900); };
        const ed = () => p.evaluate(() => { const e = window.LCNDA_EXT.siteWeb.current; return e ? {id: e.id, name: e.name, page: e.pageIdx, pages: e.site.pages.map(x => ({name: x.name, html: x.html}))} : null; });

        // un dessin enregistré et un document du traitement de texte
        const vecId = (await post('save_vector_doc', {name: 'Blason DURAND', doc: {w: 200, h: 120, bg: '#ffffff', objs: [{id: 'r1', type: 'rect', name: 'Champ', x: 10, y: 10, w: 100, h: 60, fill: '#aa0000', stroke: 'none', sw: 0}]}})).id;
        const docId = (await post('save_textdoc', {name: 'Lettre de Pierre MAZAUD', data: {sections: [{html: '<h1 data-st="title">Lettre de Pierre</h1><p data-st="normal" style="text-align: center; color: red">Ma chère <b>Marie LACOMBE</b>, je t’écris de Paris.</p><p><del>rayé</del><ins>ajouté</ins></p>'}]}})).id;
        assert.ok(vecId && docId, 'dessin et document enregistrés');

        await t('nettoyage : un SVG collé, sans danger', async () => {
            const out = await p.evaluate(() => window.LCNDA_EXT.siteKit.cleanSvg(`<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="100" height="50" onload="alert(1)"><script>alert(2)</script><defs><linearGradient id="g"><stop offset="0" stop-color="red"/></linearGradient></defs>
                <rect width="10" height="10" fill="url(#g)" onclick="alert(3)"/><rect width="5" height="5" fill="url(http://evil.test/x.svg#a)"/><use xlink:href="#g"/><use href="http://evil.test/s.svg#x"/>
                <a href="javascript:alert(4)"><circle r="3"/></a><image href="http://evil.test/i.png"/><foreignObject><div>x</div></foreignObject><style>@import url(http://evil.test/c.css);</style><animate attributeName="href" to="javascript:alert(5)"/></svg>`, {name: 'Blason', prefix: 'tst'}));
            assert.ok(out.startsWith('<svg'), out);
            assert.ok(!/script|onload|onclick|evil|foreignObject|<style|<animate|javascript|<a\b|<image/i.test(out), out);
            assert.match(out, /<circle r="3"/); assert.match(out, /id="tst-g"/); assert.match(out, /fill="url\(#tst-g\)"/); assert.match(out, /<use href="#tst-g"/);
            assert.match(out, /viewBox="0 0 100 50"/); assert.ok(!/\swidth="100"/.test(out), 'la taille suit la page'); assert.match(out, /aria-label="Blason"/);
            assert.strictEqual(await p.evaluate(() => window.LCNDA_EXT.siteKit.cleanSvg('<div>pas un dessin</div>')), '');
        });
        await t('nettoyage : un texte du traitement de texte', async () => {
            const out = await p.evaluate(() => window.LCNDA_EXT.siteKit.cleanDocHtml('<h1 class="x" data-st="title">Titre</h1><p style="text-align:center;color:red" onclick="x()">Bonjour <del>non</del><ins>oui</ins></p><script>bad()</script><p><img src="http://evil.test/x.png"><img src="media/maison-mazaud.png"></p><a href="javascript:alert(1)">l</a><a href="https://exemple.fr">ok</a>'));
            assert.ok(!/script|onclick|evil|javascript|data-st|class=|color|non/.test(out), out);
            assert.match(out, /<h2>Titre<\/h2>/); assert.match(out, /<p style="text-align: center">Bonjour oui<\/p>/); assert.match(out, /<img src="media\/maison-mazaud.png" loading="lazy" alt="">/); assert.match(out, /<a href="https:\/\/exemple.fr" rel="noopener">ok<\/a>/);
        });

        let siteId = 0;
        await t('＋ Blocs : vidéo, son (avec ce qu’on entend), dessin, document, diaporama', async () => {
            await p.evaluate(() => window.LCNDA_EXT.siteWeb.open({data: window.LCNDA_EXT.siteWeb.blankSite(), name: 'La famille MAZAUD'}));
            await p.waitForSelector('.sw-dlg [data-sw-frame]');
            siteId = await p.evaluate(() => window.LCNDA_EXT.siteWeb.current.save({quiet: true})); assert.ok(siteId > 0);
            // le choix d'un média : on répond à la place de la fenêtre
            await p.evaluate(M => { const pk = window.LCNDA_PICKER || window.LCNDA_APP; pk.openMediaPicker = async o => (o.types[0] === 'video' ? M.video : o.types[0] === 'audio' ? M.audio : o.multiple ? [M.img1, M.img2] : M.img1); }, M);
            const groups = await p.$$eval('.sw-left h4', l => l.map(h => h.textContent)); assert.ok(groups.includes('Vidéo, son, dessin et texte'), groups.join('|'));
            for (const k of ['video', 'audio', 'drawing', 'document', 'slides']) assert.ok(await p.$(`.sw-left [data-sw-block="${k}"]`), k);
            await p.click('.sw-left [data-sw-block="video"]'); await sleep(400);
            await p.click('.sw-left [data-sw-block="audio"]'); await submitTop('Bonjour les enfants.\nC’était à Tulle, en 1950.');
            await p.click('.sw-left [data-sw-block="drawing"]'); await p.waitForSelector('dialog[open] [data-lc-way="mine"]'); await p.click('dialog[open] [data-lc-way="mine"]'); await submitTop();
            await p.click('.sw-left [data-sw-block="document"]'); await submitTop();
            await p.click('.sw-left [data-sw-block="slides"]'); await sleep(600);
            const h = (await ed()).pages[0].html;
            assert.match(h, /<figure class="lc-video" data-lc-name="Vidéo">\s*<video controls="" preload="metadata" playsinline="" src="media\/cousinade-durand.mp4"/);
            assert.match(h, /<audio controls="" preload="metadata" src="media\/temoignage-lacombe.mp3"/);
            assert.match(h, /<details class="lc-transcription"[^>]*>\s*<summary>Ce qu’on entend<\/summary>\s*<p>Bonjour les enfants.<\/p>\n<p>C’était à Tulle, en 1950.<\/p>/);
            assert.match(h, /<figure class="lc-dessin" data-lc-name="Dessin">\s*<svg[^>]*viewBox="0 0 200 120"[\s\S]*fill="#aa0000"[\s\S]*<figcaption>Blason DURAND<\/figcaption>/);
            assert.match(h, /<article class="lc-document" data-lc-name="Document">\s*<h2>Lettre de Pierre MAZAUD<\/h2>\s*<h2>Lettre de Pierre<\/h2><p style="text-align: center">Ma chère <b>Marie LACOMBE<\/b>/);
            assert.ok(!/rayé/.test(h), 'le texte rayé (suivi des modifications) n’est pas repris');
            assert.match(h, /<div class="lc-diaporama"[^>]*>\s*<div class="lc-diapo-piste">\s*<figure class="lc-diapo">\s*<img src="media\/maison-mazaud.png"[\s\S]*moulin-lacombe.png/);
            assert.ok(h.indexOf('lc-video') < h.indexOf('lc-diaporama') && h.indexOf('lc-diaporama') < h.indexOf('site-pied'), 'dans l’ordre, avant le pied de page');
            // le code : bien formé, les balises connues
            const code = await p.evaluate(html => ({lint: window.LCNDA_EXT.siteCode.lintCode(html, 'html'), tags: ['video', 'audio', 'svg', 'source', 'track', 'details', 'figure'].every(x => window.LCNDA_EXT.siteCode.TAGS.includes(x)), attrs: ['controls', 'preload', 'poster', 'viewBox'].every(x => window.LCNDA_EXT.siteCode.ATTRS.includes(x)), fmt: window.LCNDA_EXT.siteCode.formatCode(html, 'html').length > 0}), h);
            assert.deepStrictEqual(code.lint, [], JSON.stringify(code.lint)); assert.ok(code.tags && code.attrs && code.fmt);
            // « Ceci est » sur la vidéo : la changer
            const path0 = await p.evaluate(() => { const k = window.LCNDA_EXT.siteKit, e = window.LCNDA_EXT.siteWeb.current, d = k.parse(e.page().html); return k.pathOf(d.querySelector('video')); });
            await p.evaluate(pa => { const e = window.LCNDA_EXT.siteWeb.current; e.selected({path: pa, tag: 'video', name: '', attrs: []}); }, path0);
            await p.waitForSelector('[data-sw-act="av-change"]');
            await p.evaluate(M => { const pk = window.LCNDA_PICKER || window.LCNDA_APP; pk.openMediaPicker = async () => ({...M.video, filename: 'cousinade-durand.mp4', title: 'La cousinade DURAND 1998'}); }, M);
            await p.click('[data-sw-act="av-change"]'); await sleep(500);
            assert.match((await ed()).pages[0].html, /<figcaption>La cousinade DURAND 1998<\/figcaption>/);
            await p.evaluate(() => window.LCNDA_EXT.siteWeb.current.save({quiet: true}));
        });

        await t('▶ Tester : les boutons ‹ › du diaporama (et pas en mode modifier)', async () => {
            const frame = () => p.frames().find(f => f !== p.mainFrame() && f.parentFrame() === p.mainFrame() && /lcb-ov|lc-diaporama/.test(f.url() + '') || false);
            const count = async () => { for (const f of p.frames()) { const n = await f.evaluate(() => document.querySelector('.lc-diaporama') ? document.querySelectorAll('.lc-diapo-nav').length : -1).catch(() => -1); if (n >= 0) return n; } return -1; };
            await sleep(800); assert.strictEqual(await count(), 0, 'en mode modifier : pas de bouton (il serait enregistré dans la page)');
            await p.evaluate(() => window.LCNDA_EXT.siteWeb.current.setMode('play')); await sleep(1500);
            let n = -1; for (let i = 0; i < 20 && n !== 2; i++) { n = await count(); await sleep(200); }
            assert.strictEqual(n, 2, 'en ▶ Tester : ‹ et ›'); void frame;
            await p.evaluate(() => window.LCNDA_EXT.siteWeb.current.setMode('select')); await sleep(600);
            assert.ok(!/lc-diapo-nav/.test((await ed()).pages[0].html), 'rien d’ajouté au code');
        });

        await t('📤 Envoyer vers… → 🌐 Sur une page de mon site : une vidéo à la fin de l’accueil, ↶ Annuler', async () => {
            await p.evaluate(M => window.LCNDA_EXT.sendTo('video', {media: M.video}, {to: 'site', title: 'La cousinade DURAND'}), M);
            await menu('La famille MAZAUD'); await menu('Accueil'); await sleep(900);
            const s = await api('website', {id: siteId}); const h = s.data.pages[0].html;
            assert.strictEqual((h.match(/<video\b/g) || []).length, 2, 'une deuxième vidéo');
            assert.ok(h.lastIndexOf('<video') > h.indexOf('lc-diaporama') && h.lastIndexOf('<video') < h.indexOf('site-pied'), 'à la fin, avant le pied de page');
            assert.strictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-site-web')).receiveSite), siteId, 'le site choisi est retenu');
            assert.strictEqual((await ed()).id, siteId, 'le site est ouvert');
            await undoLast('La vidéo est sur la page');
            const h2 = (await api('website', {id: siteId})).data.pages[0].html; assert.strictEqual((h2.match(/<video\b/g) || []).length, 1, '↶ Annuler : retirée et enregistré');
        });
        await t('un dessin sur une nouvelle page ; ↶ Annuler retire la page', async () => {
            await p.evaluate(() => window.LCNDA_EXT.siteReceive({type: 'svg', svg: '<svg viewBox="0 0 10 10"><script>x()</script><circle cx="5" cy="5" r="4" fill="#3d5a2a" onclick="x()"/></svg>', name: 'Arbre LACOMBE'}, {}));
            await menu('La famille MAZAUD'); await menu('Une nouvelle page'); await submitTop('Nos dessins'); await sleep(900);
            const s = await api('website', {id: siteId}); const pg = s.data.pages.find(x => x.name === 'Nos dessins');
            assert.ok(pg, 'la page est créée'); assert.match(pg.html, /<figure class="lc-dessin"[\s\S]*<circle cx="5" cy="5" r="4" fill="#3d5a2a"\/>[\s\S]*Arbre LACOMBE/); assert.ok(!/script|onclick|Un titre/.test(pg.html), pg.html);
            assert.match(pg.html, /site-entete[\s\S]*lc-dessin[\s\S]*site-pied/, 'en-tête et pied de page repris');
            assert.strictEqual((await ed()).pages[(await ed()).page].name, 'Nos dessins', 'ouvert sur cette page');
            await undoLast('Le dessin est sur la page');
            assert.ok(!(await api('website', {id: siteId})).data.pages.some(x => x.name === 'Nos dessins'), '↶ Annuler : la page est retirée');
        });
        await t('un son avec sa transcription, un texte ; un nouveau site (↶ Annuler le retire)', async () => {
            await p.evaluate(M => window.LCNDA_EXT.siteReceive({type: 'audio', media: M.audio, html: '<p>Je suis née à Tulle.</p><script>x()</script>'}, {}), M);
            await menu('La famille MAZAUD'); await menu('Accueil'); await sleep(900);
            let h = (await api('website', {id: siteId})).data.pages[0].html;
            assert.match(h, /temoignage-lacombe.mp3[\s\S]*<summary>Ce qu’on entend<\/summary>\s*<p>Je suis née à Tulle.<\/p>/); assert.ok(!/<script/.test(h));
            await p.evaluate(() => window.LCNDA_EXT.siteReceive({type: 'text', html: '<h1>Souvenirs</h1><p>Les étés chez les DURAND.</p>', name: 'Souvenirs DURAND'}, {}));
            await menu('La famille MAZAUD'); await menu('Accueil'); await sleep(900);
            h = (await api('website', {id: siteId})).data.pages[0].html;
            assert.match(h, /<article class="lc-document"[^>]*>\s*<h2>Souvenirs DURAND<\/h2>\s*<h2>Souvenirs<\/h2><p>Les étés chez les DURAND.<\/p>/);
            const before = (await api('websites')).items.length;
            await p.evaluate(M => window.LCNDA_EXT.siteReceive({type: 'image', media: M.img2, name: 'Le moulin'}, {}), M);
            await menu('Un nouveau site'); await sleep(1200); await menu('Accueil'); await sleep(1200);
            const list = (await api('websites')).items; assert.strictEqual(list.length, before + 1, 'un site de plus');
            const neu = list.find(x => x.id !== siteId); const nh = (await api('website', {id: neu.id})).data.pages[0].html;
            assert.match(nh, /<figure class="image"[^>]*>\s*<img src="media\/moulin-lacombe.png"/);
            await undoLast('L’image est sur la page');
            assert.strictEqual((await api('websites')).items.length, before, '↶ Annuler : le nouveau site est retiré');
        });

        await t('export : vidéo et son copiés dans medias/, diaporama, page seule ; 🧭 compatibilité', async () => {
            const chk = (await api('website_export_check', {id: siteId})).summary;
            assert.strictEqual(chk.av, 2, JSON.stringify(chk)); assert.strictEqual(chk.av_big, 0); assert.ok(chk.images >= 2);
            const zres = await fetch(`${base}api.php?action=website_export&id=${siteId}&format=zip`); assert.match(zres.headers.get('content-type') || '', /zip/);
            const zf = path.join(tmp, 'site.zip'); fs.writeFileSync(zf, Buffer.from(await zres.arrayBuffer()));
            if (hasPy) {
                const z = JSON.parse(spawnSync('python3', ['-I', '-c', 'import zipfile,sys,json\nz=zipfile.ZipFile(sys.argv[1])\nprint(json.dumps({n:z.read(n).decode("utf-8","replace") if n.endswith((".html",".css",".js",".txt")) else z.read(n)[:12].decode("latin-1") for n in z.namelist()}))', zf], {encoding: 'utf8'}).stdout);
                const av = Object.keys(z).filter(n => n.startsWith('medias/')).sort();
                assert.deepStrictEqual(av.map(n => n.replace(/m\d+/, 'm')), ['medias/m.mp3', 'medias/m.mp4'], av.join());
                assert.strictEqual(z[av.find(n => n.endsWith('.mp4'))], 'VIDEO-MP4-VI', 'la vidéo telle quelle'); assert.strictEqual(z[av.find(n => n.endsWith('.mp3'))], 'AUDIO-MP3-AU');
                assert.ok(z['js/diaporama-lcnda.js'] && /LCNDA_DIAPORAMA/.test(z['js/diaporama-lcnda.js']), 'le script du diaporama');
                const idx = z['index.html'];
                assert.match(idx, /<video controls="" preload="metadata" playsinline="" src="medias\/m\d+\.mp4"/); assert.match(idx, /<a href="medias\/m\d+\.mp4">/); assert.match(idx, /<audio controls="" preload="metadata" src="medias\/m\d+\.mp3"/);
                assert.match(idx, /<script src="js\/diaporama-lcnda.js" defer><\/script>/); assert.match(idx, /class="lc-diapo"[\s\S]*src="images\/m\d+\.png"/);
                assert.ok(!/media\//.test(idx.replace(/medias\//g, '')), 'aucune adresse vers les médias de l’app');
                assert.match(z['css/style.css'], /\.lc-diapo-piste\{[^}]*scroll-snap-type:x mandatory/);
            }
            const one = await (await fetch(`${base}api.php?action=website_export&id=${siteId}&format=html&page=index`)).text();
            assert.match(one, /src="data:video\/mp4;base64,/); assert.match(one, /src="data:audio\/mpeg;base64,/); assert.match(one, /media-src data:/); assert.match(one, /window\.LCNDA_DIAPORAMA/);
            // 🧭 un WebM et un son Ogg sont signalés
            const ids = await p.evaluate(() => window.LCNDA_EXT.siteCompat.scan({html: [{name: 'index.html', text: '<video controls src="media/a.webm"></video><audio controls src="media/b.ogg"></audio>'}]}).map(r => r.id || r.feature?.id));
            assert.ok(ids.includes('html-video-webm') && ids.includes('html-audio-ogg'), ids.join());
            const mine = await p.evaluate(() => window.LCNDA_EXT.siteWeb.current.compatScan().map(r => r.id || r.feature?.id));
            assert.ok(!mine.includes('html-video-webm'), 'le MP4 ne pose pas de problème');
        });
        assert.deepStrictEqual(errs, [], 'erreurs JS : ' + errs.join(' | '));
    } catch (e) { fails++; console.log('✗ ' + (e.stack || e)); } finally { await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true}); }
    console.log(fails ? `${fails} échec(s)` : 'tout est bon'); process.exit(fails ? 1 : 0);
})();
