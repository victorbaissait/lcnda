#!/usr/bin/env node
/* 🔗 Liens entre les outils (docs/design/outils-liens.html) — 🎞 Studio d'animation, 🗺️ Carte, 🏠 Maison :
 *  1. calculs (Node) : années d'une carte (mapYears), époque montrée (houseAt), légende d'une époque ;
 *  2. navigateur :
 *     - 🎧 un son envoyé (openAnimStudio({audio})) devient la voix du film, « 🎵 En faire la musique » (↶ Annuler) ;
 *     - 🗺️ scène « Carte » : le curseur du temps joue (un objet apparaît à sa date, un autre disparaît), enregistrée et relue ;
 *       l'entrée « 🎞 Animer dans le Studio » de l'outil Carte (liste) et du panneau Plan de l'éditeur ;
 *     - 🏠 scène « Maison par époques » : un plan par époque (ext.houseEpochPlans, sans fenêtre visible), l'année en légende ;
 *       le bouton 🎞 près de ▶ dans la Maison ; « 📤 Envoyer vers… » (le plan en image, en dessin) ;
 *     - les exports GIF, WebM, MP4 avec ces scènes ; les sous-titres .srt des époques.
 *  Famille fictive MAZAUD, LACOMBE, DURAND.   node tests/test-liens-studio.js */
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const {spawn, spawnSync} = require('child_process');
const root = path.join(__dirname, '..');
const R = require(path.join(root, 'assets/js/heritage-anim-render.js'));

let fails = 0, oks = 0;
const t = async (name, fn) => { try { await fn(); oks++; console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// la carte : A sans date, B (rouge) à partir de 1850, C (bleu) de 1900 à 1950
const MAP = {w: 800, h: 600, bg: '#ffffff', kind: 'map', map: {on: true, style: 'modern'}, objs: [
    {id: 'a', type: 'rect', name: 'Église', x: 20, y: 20, w: 100, h: 100, fill: '#00aa00', stroke: 'none', sw: 0},
    {id: 'b', type: 'rect', name: 'Moulin MAZAUD', x: 100, y: 300, w: 200, h: 200, fill: '#ff0000', stroke: 'none', sw: 0, map: {yf: 1850}},
    {id: 'c', type: 'rect', name: 'Ferme LACOMBE', x: 500, y: 300, w: 200, h: 200, fill: '#0000ff', stroke: 'none', sw: 0, map: {yf: 1900, yt: 1950}}]};
// la maison : trois époques (1900, 1950, 2000), un mur de plus à chaque fois
const Wl = q => q.map((r, i) => ({id: 'w' + i + '_' + r.join('_'), a: [r[0], r[1]], b: [r[2], r[3]], t: 20}));
const rect = [[0, 0, 1000, 0], [1000, 0, 1000, 600], [1000, 600, 0, 600], [0, 600, 0, 0]];
const floorOf = (id, extra) => ({id, name: 'Rez-de-chaussée', level: 0, height: 250, wallT: 20, walls: Wl([...rect, ...extra]), rooms: [], openings: [], items: [], dims: [], labels: []});
const HOUSE = {slab: 20, floors: [floorOf('f2', [[400, 0, 400, 600]])], roof: {on: false}, ver: 'v2', meta: {people: [], note: ''},
    versions: [{id: 'v1', label: 'La ferme DURAND', date: '1900', floors: [floorOf('f1', [])], roof: {on: false}}, {id: 'v2', label: 'Agrandie', date: '1950'}, {id: 'v3', label: 'Aujourd’hui', date: '2000', floors: [floorOf('f3', [[400, 0, 400, 600], [700, 0, 700, 600]])], roof: {on: false}}]};

(async () => {
    await t('calculs : les années d’une carte (apparition, disparition + 1), l’époque montrée, sa légende', () => {
        assert.deepEqual(R.mapYears(MAP), [1850, 1900, 1951]);
        assert.deepEqual(R.mapYears({objs: [{type: 'group', children: [{yf: 1700}]}]}), [1700], 'dans les groupes aussi');
        const st = {plans: [{}, {}, {}]};
        assert.deepEqual(R.houseAt({fade: .3}, st, 0), {i: 0, k: 0});
        assert.equal(R.houseAt({fade: .3}, st, .5).i, 1); assert.equal(R.houseAt({fade: .3}, st, .5).k, 0);
        const f = R.houseAt({fade: .3}, st, .32); assert.equal(f.i, 0); assert.ok(f.k > .5 && f.k < 1, 'fondu vers l’époque suivante : ' + f.k);
        assert.equal(R.houseAt({fade: .3}, st, 1).i, 2); assert.equal(R.houseAt({fade: 0}, st, .32).k, 0, 'sans fondu');
        assert.equal(R.epochLabel({date: '1900', label: 'La ferme'}), '1900 · La ferme'); assert.equal(R.epochYear({date: 'vers 1850'}), 1850);
    });

    let chromium; try { ({chromium} = require('playwright')); } catch (_) { try { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); } catch (__) { chromium = null; } }
    if (!chromium) { console.log('— Playwright absent : partie navigateur sautée'); return end(); }
    const {findPhp, phpRuntimeArgs, devBundledPhp} = require('../electron/php-server.js');
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-liens-studio-'));
    fs.mkdirSync(path.join(tmp, 'media'));
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4'};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p0->exec("INSERT INTO persons(first_name,last_name,gender) VALUES('Pierre','MAZAUD','male'),('Marie','LACOMBE','female'),('Paul','DURAND','male')");
echo json_encode(['ok' => 1]);`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0 || !/"ok"/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const errs = [];
    try {
        const ctx = await browser.newContext({viewport: {width: 1440, height: 900}});
        await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
        const p = await ctx.newPage();
        p.on('pageerror', e => errs.push(e.message));
        p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR|tile|arcgis|openstreetmap/i.test(m.text())) errs.push('console : ' + m.text()); });
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_EXT?.openAnimStudio && window.LCNDA_EXT?.animExport && window.LCNDA_EXT?.houseEpochPlans && window.LCNDA_EXT?.vectorInternals && window.LCNDA_APP?.state?.csrf, null, {timeout: 30000});
        const api = (a, q = {}) => p.evaluate(async ([x, y]) => { try { return await window.LCNDA_APP.api(x, y); } catch (e) { return {error: e.message}; } }, [a, q]);
        const post = (a, b) => p.evaluate(async ([x, y]) => { try { const r = await window.LCNDA_APP.api(x, {}, {method: 'POST', body: y}); return r.result || r; } catch (e) { return {error: e.message}; } }, [a, b]);
        const closeStudio = async () => { await p.evaluate(() => document.querySelector('.an-dlg [data-an="close"]')?.click()); await p.waitForFunction(() => !document.querySelector('.an-dlg'), null, {timeout: 10000}); };
        const studioOpen = () => p.waitForFunction(() => document.querySelector('.an-dlg') && window.LCNDA_EXT.__anim?.P, null, {timeout: 15000});
        const mapId = (await post('save_vector_doc', {name: 'Le village MAZAUD', doc: MAP})).id;
        const houseId = (await post('save_house', {name: 'La maison DURAND', house: HOUSE})).id;
        assert.ok(mapId > 0 && houseId > 0, 'carte et maison enregistrées');

        await t('🎧 un son envoyé : la voix du film (durée lue), « 🎵 En faire la musique », ↶ Annuler, enregistré', async () => {
            const m = await p.evaluate(async () => { // un petit son WAV d'une seconde, rangé dans les médias
                const sr = 8000, n = sr, b = new ArrayBuffer(44 + n * 2), v = new DataView(b), w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
                w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
                for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.round(Math.sin(i / 8) * 8000), true);
                const it = await window.LCNDA_MEDIA_PICKER.importMediaFile(new File([b], 'voix-mazaud.wav', {type: 'audio/wav'}), ['audio']);
                return {id: Number(it.id), filename: it.filename, title: 'Voix de Pierre MAZAUD'};
            });
            assert.ok(m.id > 0 && m.filename, JSON.stringify(m));
            await p.evaluate(m => window.LCNDA_EXT.openAnimStudio({id: 0, audio: m}), m); await studioOpen();
            await p.waitForFunction(() => window.LCNDA_EXT.__anim.P.id > 0, null, {timeout: 10000});
            const r = await p.evaluate(() => ({v: window.LCNDA_EXT.__anim.P.data.voices, film: document.querySelector('.an-dlg [data-an-tab="film"]').classList.contains('is-active'), btn: !!document.querySelector('.an-dlg [data-an-vmus="0"]')}));
            assert.equal(r.v.length, 1); assert.equal(r.v[0].at, 0); assert.ok(Math.abs(r.v[0].len - 1) < .2, 'durée lue : ' + r.v[0].len); assert.ok(r.film, 'onglet Film ouvert'); assert.ok(r.btn, 'bouton 🎵');
            await p.click('.an-dlg [data-an-vmus="0"]');
            let d = await p.evaluate(() => window.LCNDA_EXT.__anim.P.data); assert.equal(d.voices.length, 0); assert.equal(d.music.media.id, m.id); assert.equal(d.music.loop, true);
            await p.click('#toast-region button:has-text("Annuler"), .toast button:has-text("Annuler")').catch(() => {});
            await sleep(300); d = await p.evaluate(() => window.LCNDA_EXT.__anim.P.data); assert.equal(d.voices.length, 1, '↶ Annuler remet la voix'); assert.ok(!d.music, 'et retire la musique');
            await p.click('.an-dlg [data-an-vmus="0"]'); await p.evaluate(() => window.LCNDA_EXT.__anim.save()); await sleep(300);
            const pid = await p.evaluate(() => window.LCNDA_EXT.__anim.P.id), got = await api('anim_project', {id: pid});
            assert.equal(got.project.data.music.media.id, m.id, 'la musique est enregistrée');
            // dans un film existant : la voix s'ajoute à ce film
            await closeStudio(); await p.evaluate(([id, m]) => window.LCNDA_EXT.openAnimStudio({id, audio: m}), [pid, m]); await studioOpen(); await sleep(1800);
            const again = await api('anim_project', {id: pid}); assert.equal(again.project.data.voices.length, 1, 'ajoutée au film existant et enregistrée'); assert.equal(again.project.data.music.media.id, m.id);
            await closeStudio();
        });

        // le dessin d'une scène carte (640×360) : là où tombent B (rouge) et C (bleu)
        const mapPixels = (proj, times) => p.evaluate(async ([proj, times]) => {
            const RN = window.LCNDA_EXT.animRender, cv = document.createElement('canvas'); cv.width = 640; cv.height = 360; const g = cv.getContext('2d'), out = [];
            const s = Math.min(618 / 800, (360 - 39.6 - 11) / 600), x0 = (640 - 800 * s) / 2, y0 = 39.6, at = (x, y) => [...g.getImageData(Math.round(x0 + x * s), Math.round(y0 + y * s), 1, 1).data];
            for (const tt of times) { const info = await RN.drawFrame(g, proj, tt, 640, 360); out.push({year: Math.floor(info.year), b: at(200, 420), c: at(600, 420), a: at(70, 70)}); }
            return out;
        }, [proj, times]);
        const red = px => px[0] > 200 && px[1] < 80 && px[2] < 80, blue = px => px[2] > 200 && px[0] < 80 && px[1] < 80, green = px => px[1] > 120 && px[0] < 80 && px[2] < 80;

        await t('🗺️ scène Carte : le curseur du temps joue de A à B, les objets apparaissent et disparaissent à leur date', async () => {
            await p.evaluate(([id]) => window.LCNDA_EXT.openAnimStudio({id: 0, vectormap: {docId: id, name: 'Le village MAZAUD'}}), [mapId]); await studioOpen();
            await p.waitForFunction(() => window.LCNDA_EXT.__anim.P.id > 0, null, {timeout: 10000});
            const sc = await p.evaluate(() => { const s = window.LCNDA_EXT.__anim.P.data.scenes; return s.map(x => ({type: x.type, docId: x.docId, name: x.name})); });
            assert.deepEqual(sc.map(x => x.type), ['vectormap']); assert.equal(sc[0].docId, mapId); assert.equal(sc[0].name, 'Le village MAZAUD');
            // les années trouvées dans la carte, et le panneau de la scène
            await sleep(600);
            const ui = await p.evaluate(() => ({from: window.LCNDA_EXT.__anim.P.data.scenes[0]._from, to: window.LCNDA_EXT.__anim.P.data.scenes[0]._to, pane: document.querySelector('.an-dlg [data-an-pane]').textContent, tl: document.querySelector('.an-dlg [data-an-tl]').textContent}));
            assert.equal(ui.from, 1850); assert.equal(ui.to, 1951); assert.ok(/Le village MAZAUD/.test(ui.pane) && /Apparition des objets/.test(ui.pane), ui.pane.slice(0, 200)); assert.ok(/1850 → 1951/.test(ui.tl), 'piste Temps');
            const proj = await p.evaluate(() => { const D = JSON.parse(JSON.stringify(window.LCNDA_EXT.__anim.P.data)); Object.assign(D.scenes[0], {from: 1800, to: 2000, dur: 20, smooth: false, title: ''}); return D; });
            const px = await mapPixels(proj, [2, 7, 12, 17]);
            assert.deepEqual(px.map(x => x.year), [1820, 1870, 1920, 1970]);
            assert.ok(green(px[0].a) && green(px[3].a), 'l’objet sans date est toujours là');
            assert.ok(!red(px[0].b) && !blue(px[0].c), '1820 : ni B ni C ' + JSON.stringify(px[0]));
            assert.ok(red(px[1].b) && !blue(px[1].c), '1870 : B seulement ' + JSON.stringify(px[1]));
            assert.ok(red(px[2].b) && blue(px[2].c), '1920 : B et C');
            assert.ok(red(px[3].b) && !blue(px[3].c), '1970 : C a disparu');
            // en douceur : juste avant 1850, B commence à se montrer (fondu)
            proj.scenes[0].smooth = true; const soft = await mapPixels(proj, [4.97]); // 1849,4 : à 0,03 s de 1850
            assert.ok(soft[0].b[1] < 250 && soft[0].b[0] > 200, 'fondu en cours : ' + JSON.stringify(soft[0].b));
            await closeStudio();
        });

        await t('🗺️ la scène Carte est enregistrée et relue (le film se rouvre avec elle)', async () => {
            const list = (await api('anim_projects')).projects, pr = list.find(x => x.title === 'Le village MAZAUD'); assert.ok(pr, 'le film est dans la liste');
            const got = await api('anim_project', {id: pr.id}); assert.equal(got.project.data.scenes[0].type, 'vectormap'); assert.equal(got.project.data.scenes[0].docId, mapId);
            await p.evaluate(id => window.LCNDA_EXT.openAnimStudio({id}), pr.id); await studioOpen(); await sleep(800);
            const r = await p.evaluate(() => ({type: window.LCNDA_EXT.__anim.P.data.scenes[0].type, list: document.querySelector('.an-dlg [data-an-list]').textContent}));
            assert.equal(r.type, 'vectormap'); assert.ok(/🗺️|Le village/.test(r.list));
            await closeStudio();
        });

        await t('🗺️ l’outil Carte : « 🎞 Animer dans le Studio » (liste des projets, et panneau Plan de l’éditeur, carte pas encore enregistrée)', async () => {
            const html = await p.evaluate(() => (window.LCNDA_EXT.editToolsExtra.find(x => x.key === 'maps') || {}).extra || '');
            assert.ok(/data-et-x="anim"/.test(html) && /Animer dans le Studio/.test(html), html);
            await p.evaluate(() => window.LCNDA_EXT.editToolsExtra.find(x => x.key === 'maps').onExtra('anim')); await studioOpen();
            assert.equal(await p.evaluate(() => window.LCNDA_EXT.__anim.P.data.scenes[0].docId), mapId, 'une seule carte : ouverte tout de suite');
            await closeStudio();
            // dans l'éditeur, onglet Plan : une copie de la carte telle qu'elle est (même pas enregistrée)
            await p.evaluate(MAP => window.LCNDA_EXT.openVectorEditor({doc: JSON.parse(JSON.stringify(MAP)), name: 'Brouillon LACOMBE', tab: 'map'}), MAP);
            await p.waitForSelector('[data-vm-cmd="anim"]', {timeout: 10000}); await p.click('[data-vm-cmd="anim"]'); await studioOpen();
            const s = await p.evaluate(() => { const x = window.LCNDA_EXT.__anim.P.data.scenes[0]; return {type: x.type, docId: x.docId, objs: x.doc?.objs?.length, rev: !!x.docRev, name: x.name}; });
            assert.deepEqual(s, {type: 'vectormap', docId: 0, objs: 3, rev: true, name: 'Brouillon LACOMBE'});
            const proj = await p.evaluate(() => { const D = JSON.parse(JSON.stringify(window.LCNDA_EXT.__anim.P.data)); Object.assign(D.scenes[0], {from: 1800, to: 2000, dur: 20, smooth: false, title: ''}); return D; });
            const px = await mapPixels(proj, [2, 12]); assert.ok(!red(px[0].b) && red(px[1].b), 'la copie s’anime aussi');
            await closeStudio();
            await p.evaluate(() => { const d = [...document.querySelectorAll('dialog')].pop(); d?.querySelector('[data-vx="close"], [data-vx-close], .vx-close, [aria-label="Fermer"]')?.click(); });
            await sleep(400); await p.evaluate(() => { document.querySelectorAll('dialog[open]').forEach(d => { d.close(); d.remove(); }); });
        });

        await t('🏠 les plans des époques (sans fenêtre visible) : un par époque, dans l’ordre, rien ne reste ouvert', async () => {
            const r = await p.evaluate(async id => { const l = await window.LCNDA_EXT.houseEpochPlans(id); return {n: l.length, dates: l.map(x => x.date), labels: l.map(x => x.label), svg: l.map(x => /<svg[^>]*viewBox/.test(x.svg)), walls: l.map(x => (x.svg.match(/<path|<polygon|<line/g) || []).length), left: document.querySelectorAll('.h-hs-dlg').length}; }, houseId);
            assert.equal(r.n, 3); assert.deepEqual(r.dates, ['1900', '1950', '2000']); assert.equal(r.labels[0], 'La ferme DURAND'); assert.ok(r.svg.every(Boolean));
            assert.ok(r.walls[2] > r.walls[0], 'le plan change avec les époques : ' + r.walls.join(' / ')); assert.equal(r.left, 0, 'la maison cachée est refermée');
        });

        await t('🏠 scène « Maison par époques » : chaque époque tour à tour, l’année en légende, enregistrée et relue', async () => {
            await p.evaluate(id => window.LCNDA_EXT.openAnimStudio({id: 0, house: {id, name: 'La maison DURAND'}}), houseId); await studioOpen();
            await p.waitForFunction(() => window.LCNDA_EXT.__anim.P.id > 0, null, {timeout: 10000});
            const s = await p.evaluate(() => window.LCNDA_EXT.__anim.P.data.scenes[0]);
            assert.equal(s.type, 'house'); assert.equal(s.houseId, houseId); assert.equal(s.dur, 9, '3 s par époque'); assert.deepEqual(s.floors, [[0, 'Rez-de-chaussée']]);
            const fr = await p.evaluate(async () => { const RN = window.LCNDA_EXT.animRender, P = window.LCNDA_EXT.__anim.P.data, cv = document.createElement('canvas'); cv.width = 640; cv.height = 360; const g = cv.getContext('2d'), out = [];
                for (const tt of [1, 4, 8]) { const i = await RN.drawFrame(g, P, tt, 640, 360); const d = g.getImageData(0, 0, 640, 360).data; let dark = 0; for (let k = 0; k < d.length; k += 16) if (d[k] < 90 && d[k + 1] < 90 && d[k + 2] < 90) dark++; out.push({year: i.year, dark}); }
                return out; });
            assert.deepEqual(fr.map(x => x.year), [1900, 1950, 2000]); assert.ok(fr.every(x => x.dark > 50), 'les murs sont dessinés : ' + fr.map(x => x.dark).join('/'));
            const pane = await p.evaluate(() => document.querySelector('.an-dlg [data-an-pane]').textContent); assert.ok(/La maison DURAND/.test(pane) && /Fondu d’une époque à l’autre/.test(pane), pane.slice(0, 200));
            const cues = await p.evaluate(async () => window.LCNDA_EXT.animExport.cues(window.LCNDA_EXT.__anim.P.data, 320, 180));
            assert.deepEqual(cues.map(c => c.text), ['1900 · La ferme DURAND', '1950 · Agrandie', '2000 · Aujourd’hui']); assert.equal(cues[1].start, 3);
            await p.evaluate(() => window.LCNDA_EXT.__anim.save()); const pid = await p.evaluate(() => window.LCNDA_EXT.__anim.P.id);
            await closeStudio(); const got = await api('anim_project', {id: pid}); assert.equal(got.project.data.scenes[0].type, 'house'); assert.equal(got.project.data.scenes[0].houseId, houseId);
        });

        await t('🏠 dans la Maison : 🎞 près de ▶ ouvre le Studio ; « 📤 Envoyer vers… » : le plan en image, en dessin, la vue 3D', async () => {
            await p.evaluate(id => window.LCNDA_EXT.openHouse({id}), houseId); await p.waitForSelector('.h-hs-dlg [data-hs-cmd="veranim"]', {timeout: 10000});
            await p.click('.h-hs-dlg [data-hs-cmd="veranim"]'); await studioOpen();
            assert.equal(await p.evaluate(() => window.LCNDA_EXT.__anim.P.data.scenes[0].type), 'house'); await closeStudio();
            // 📤 : on regarde ce qui part (ext.sendTo remplacé le temps de l'essai)
            await p.evaluate(() => { window.__sent = []; window.__sendTo0 = window.LCNDA_EXT.sendTo; window.LCNDA_EXT.sendTo = (k, d, o) => { window.__sent.push({k, blob: d.blob ? d.blob.type + ':' + d.blob.size : '', svg: (d.svg || '').slice(0, 60), name: d.name || '', title: o.title}); }; });
            const pick = async label => { await p.click('.h-hs-dlg [data-hs-cmd="sendto"]'); await p.waitForSelector('.ui-pop', {timeout: 5000}); const items = await p.$$eval('.ui-pop button, .ui-pop [role="menuitem"]', l => l.map(x => x.textContent.trim())); await p.click(`.ui-pop :is(button,[role="menuitem"]):has-text("${label}")`); return items; };
            const items = await pick('Le plan (image)');
            assert.ok(items.some(x => /Le plan en dessin/.test(x)) && items.some(x => /La vue 3D/.test(x)) && items.some(x => /Animer les époques/.test(x)), items.join(' | '));
            await p.waitForFunction(() => window.__sent.length === 1, null, {timeout: 10000});
            await pick('Le plan en dessin'); await p.waitForFunction(() => window.__sent.length === 2, null, {timeout: 10000});
            const sent = await p.evaluate(() => window.__sent);
            assert.equal(sent[0].k, 'image'); assert.ok(/^image\/png:\d+/.test(sent[0].blob) && Number(sent[0].blob.split(':')[1]) > 1000, sent[0].blob); assert.ok(/La maison DURAND/.test(sent[0].title));
            assert.equal(sent[1].k, 'svg'); assert.ok(/^<svg/.test(sent[1].svg)); assert.ok(/La maison DURAND/.test(sent[1].name));
            await p.evaluate(() => { window.LCNDA_EXT.sendTo = window.__sendTo0; });
            // le vrai menu « Envoyer le dessin vers… » propose le Dessin vectoriel (et la Mise en page quand elle sait recevoir)
            const t2 = await p.evaluate(() => window.LCNDA_EXT.sendTargetsFor('svg').map(x => x.key)); assert.ok(t2.includes('vector'), t2.join(','));
            await p.evaluate(() => { document.querySelectorAll('.h-hs-dlg').forEach(d => { d.close(); d.remove(); }); });
        });

        await t('exports : GIF, WebM et MP4 d’un film avec une carte et une maison', async () => {
            const r = await p.evaluate(async ([mapId, houseId]) => {
                const X = window.LCNDA_EXT.animExport, RN = window.LCNDA_EXT.animRender, out = {};
                const proj = {v: 1, format: '16:9', bg: '#111', overlays: {year: 'tr'}, voices: [], music: null, scenes: [
                    {id: 'm1', type: 'vectormap', docId: mapId, dur: 2, from: 1800, to: 2000, cam: {mode: 'fit'}, captions: [], pics: []},
                    {id: 'h1', type: 'house', houseId, level: 0, dur: 2, trans: 'fade', transDur: .4, captions: [], pics: []}]};
                const g = await X.makeGif(proj, {W: 160, H: 90, fps: 5}); out.gif = new TextDecoder().decode(new Uint8Array(await g.blob.slice(0, 6).arrayBuffer()));
                const cap = await X.capabilities(320, 180); out.cap = cap;
                if (cap.webcodecs && (cap.vp9 || cap.vp8)) { const v = await X.makeVideo(proj, {format: 'webm', W: 320, H: 180, fps: 10}); out.webm = [...new Uint8Array(await v.blob.slice(0, 4).arrayBuffer())]; }
                if (cap.webcodecs && cap.avc) { const v = await X.makeVideo(proj, {format: 'mp4', W: 320, H: 180, fps: 10}); out.mp4 = new TextDecoder().decode(new Uint8Array(await v.blob.slice(4, 8).arrayBuffer())); }
                return out;
            }, [mapId, houseId]);
            assert.ok(/^GIF8/.test(r.gif), r.gif);
            if (r.webm) assert.deepEqual(r.webm, [0x1A, 0x45, 0xDF, 0xA3]); else console.log('  (WebCodecs VP8/VP9 absent : WebM sauté)', JSON.stringify(r.cap));
            if (r.mp4) assert.equal(r.mp4, 'ftyp'); else console.log('  (H.264 absent dans ce navigateur : MP4 sauté)');
        });

        await t('aucune erreur dans la page', () => { assert.deepEqual(errs, []); });
    } finally { await browser.close(); proc.kill(); }
    end();
    function end() { console.log(`\n${oks} ✓, ${fails} ✗`); process.exit(fails ? 1 : 0); }
})();
