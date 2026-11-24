#!/usr/bin/env node
/* 🕰 Heures du monde (assets/js/heritage-horloges.js) :
 *  1. sans navigateur : l'heure d'un fuseau, le décalage (heure d'été comprise, demi-heures), jour ou nuit, le cadran SVG ;
 *  2. dans l'app : Listes → « 🕰 Heures du monde » : les villes de départ, ajouter une ville (menu de choix), retirer (↶ Annuler),
 *     « 🔁 Comparer », « 🗺 Carte des fuseaux », le style (préréglages, aiguilles / chiffres), le widget du tableau de bord.
 *   node tests/test-horloges.js */
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
const H = require('../assets/js/heritage-horloges.js');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
    await t('l’heure et le décalage : Tokyo, New York (hiver, été), l’Inde (+5 h 30), le Népal (+5 h 45)', () => {
        const w = Date.UTC(2026, 0, 15, 12), s = Date.UTC(2026, 6, 15, 12);
        assert.deepStrictEqual([H.partsAt('Asia/Tokyo', w).h, H.partsAt('Asia/Tokyo', w).d], [21, 15]);
        assert.deepStrictEqual([H.offsetOf('America/New_York', w), H.offsetOf('America/New_York', s)], [-300, -240]);
        assert.deepStrictEqual([H.offsetOf('Asia/Kolkata', w), H.offsetOf('Asia/Kathmandu', w), H.offsetOf('Europe/Paris', s)], [330, 345, 120]);
        assert.ok(H.CITIES.length >= 200 && H.CITIES.every(c => H.SET(c[1])), 'toutes les villes ont un fuseau connu');
    });
    await t('jour ou nuit ; le cadran (forme, chiffres romains, sans trotteuse)', () => {
        const noon = Date.UTC(2026, 0, 15, 12); assert.strictEqual(H.sunUp(48.86, 2.35, noon), true); assert.strictEqual(H.sunUp(35.68, 139.69, noon), false); assert.strictEqual(H.sunUp(NaN, 0), null);
        const svg = H.clockSvg({h: 3, mi: 0, s: 0}, {shape: 'hexagon', numbers: 'roman', seconds: false});
        assert.match(svg, /<polygon/); assert.match(svg, />XII</); assert.match(svg, /aria-label="03:00"/); assert.strictEqual((svg.match(/<line [^>]*transform/g) || []).length, 2, 'heures et minutes, pas de trotteuse');
    });

    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-hz-'));
    fs.mkdirSync(path.join(tmp, 'media'));
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4'};
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
        const p = await (await browser.newContext({viewport: {width: 1440, height: 900}, timezoneId: 'Europe/Paris'})).newPage();
        p.on('pageerror', e => errs.push(e.message));
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_EXT?.horloges && window.LCNDA_APP?.state?.csrf, null, {timeout: 30000});
        const open = () => p.evaluate(() => { const A = window.LCNDA_APP; A.state.listType = 'world_clocks'; A.setModule('listes'); });
        await t('Listes → « 🕰 Heures du monde » : 4 villes au départ, l’heure qui avance, le décalage', async () => {
            assert.ok(await p.evaluate(() => window.LCNDA_APP.defaultListTypes.some(x => x[0] === 'world_clocks')));
            await open(); await p.waitForSelector('.hz-page .hz-clock', {timeout: 15000});
            const names = await p.$$eval('.hz-page .hz-name', l => l.map(x => x.textContent.replace(/[☀️🌙]/gu, '').trim()));
            assert.deepStrictEqual(names, ['Paris', 'Montréal', 'New York', 'Tokyo']);
            assert.match(await p.textContent('.hz-page .hz-clock[data-hz-tz="Europe/Paris"] .hz-sub'), /même heure/);
            const d0 = await p.textContent('.hz-page [data-hz-digi]'); await sleep(1300);
            assert.ok(await p.evaluate(() => !!document.querySelector('.hz-page .hz-dial svg')), 'les aiguilles');
            void d0;
        });
        await t('＋ Ajouter une ville (Nouméa) ; retirer Tokyo, ↶ Annuler', async () => {
            await p.click('.hz-page [data-hz-add]'); await p.fill('.hz-add [data-hz-q]', 'noum'); await p.click('.hz-add [data-hz-pick]'); await p.click('.hz-add [data-hz-x]');
            await p.waitForSelector('.hz-page .hz-clock[data-hz-tz="Pacific/Noumea"]');
            await p.click('.hz-page .hz-item:has([data-hz-tz="Asia/Tokyo"]) [data-hz-del]'); await sleep(300);
            assert.strictEqual(await p.$('.hz-page [data-hz-tz="Asia/Tokyo"]'), null);
            await p.evaluate(() => [...document.querySelectorAll('.ui-toast')].reverse().find(x => /retirée/.test(x.textContent)).querySelector('button').click()); await sleep(400);
            assert.ok(await p.$('.hz-page [data-hz-tz="Asia/Tokyo"]'));
            assert.strictEqual(JSON.parse(await p.evaluate(() => localStorage.getItem('genealogie-horloges'))).length, 5);
        });
        await t('🔁 Comparer : à 9 h à Paris, il est 3 h à Montréal ; 🗺 la carte des fuseaux', async () => {
            await p.click('.hz-page [data-hz-view="compare"]'); await p.waitForSelector('.hz-cmp');
            await p.evaluate(() => [...document.querySelectorAll('.hz-cmp thead th')].find(th => th.textContent === '9').click()); await p.waitForSelector('.hz-cmp thead th.is-on');
            const row = await p.evaluate(() => { const r = [...document.querySelectorAll('.hz-cmp tbody tr')].find(tr => /Montréal/.test(tr.textContent)); return r.querySelector('td.is-on').textContent; });
            assert.strictEqual(row, '3');
            await p.click('.hz-page [data-hz-view="map"]'); await p.waitForSelector('.hz-map', {timeout: 15000});
            assert.ok(await p.evaluate(() => document.querySelectorAll('.hz-map .hz-dot').length >= 5 && document.querySelectorAll('.hz-map .hz-land path').length > 50 && (document.querySelector('.hz-map .hz-night')?.getAttribute('d') || '').split('Z').length > 10));
            // par pays et régions : la France à +1 ou +2, le Québec et New York pareils, la Californie 3 h plus tôt, l'Inde à +5 h 30
            const off = await p.evaluate(() => { const H = window.LCNDA_EXT.horloges, t = Date.UTC(2026, 0, 15, 12); return {fr: H.offsetOf(H.tzOf('FR', 2, 47), t), gf: H.tzOf('FR', -53, 4), re: H.tzOf('FR', 55.5, -21), ny: H.tzOf('US', -74, 41), la: H.tzOf('US', -118, 34), ak: H.tzOf('US', -150, 61), qc: H.tzOf('CA', -71, 47), ru: H.tzOf('RU', 37, 55), vl: H.tzOf('RU', 132, 43), in: H.offsetOf(H.tzOf('IN', 78, 22), t)}; });
            assert.deepStrictEqual(off, {fr: 60, gf: 'America/Cayenne', re: 'Indian/Reunion', ny: 'America/New_York', la: 'America/Los_Angeles', ak: 'America/Anchorage', qc: 'America/Toronto', ru: 'Europe/Moscow', vl: 'Asia/Vladivostok', in: 330});
            assert.ok(await p.evaluate(() => document.querySelectorAll('.hz-map.is-real [data-hz-off]').length > 150 && document.querySelectorAll('.hz-legend [data-hz-leg]').length > 15), 'les pays coloriés, la légende');
            assert.ok(await p.evaluate(() => new Set([...document.querySelectorAll('.hz-map [clip-path]')].map(x => x.getAttribute('data-hz-off'))).size >= 4), 'les États-Unis, le Canada, la Russie en plusieurs fuseaux');
            // 🎨 les couleurs : un jeu tout prêt, un fuseau à la main (clic sur la légende), ↺, ↶ Annuler
            const fillOf = o => p.evaluate(o => document.querySelector(`.hz-map [data-hz-off="${o}"]`)?.style.fill, o);
            const f0 = await fillOf(60);
            await p.click('.hz-page [data-hz-colors]'); await p.waitForSelector('.hz-colors [data-hzc-pal="pastel"]');
            assert.strictEqual(await p.$$eval('.hz-colors [data-hzc-pal]', l => l.length), 9, '9 jeux tout prêts');
            await p.click('.hz-colors [data-hzc-pal="atlas"]'); await p.waitForSelector('.hz-colors [data-hzc-atlas]');
            await p.evaluate(() => { const i = document.querySelector('.hz-colors [data-hzc-off="60"]'); i.value = '#123456'; i.dispatchEvent(new Event('input', {bubbles: true})); i.dispatchEvent(new Event('change', {bubbles: true})); });
            await p.waitForSelector('.hz-colors [data-hzc-reset="60"]');
            await p.click('.hz-colors [data-hzc-ok]'); await p.waitForSelector('.hz-map.is-real');
            assert.strictEqual(await fillOf(60), 'rgb(18, 52, 86)', 'Paris (+1) à sa couleur');
            const P1 = JSON.parse(await p.evaluate(() => localStorage.getItem('genealogie-horloges-couleurs'))); assert.strictEqual(P1.palette, 'atlas'); assert.strictEqual(P1.custom['60'], '#123456');
            assert.notStrictEqual(await fillOf(120), await fillOf(180), 'deux tons qui alternent');
            await p.click('.hz-page [data-hz-leg="60"]'); await p.waitForSelector('.hz-colors [data-hzc-reset="60"]'); await p.click('.hz-colors [data-hzc-reset="60"]'); await p.click('.hz-colors [data-hzc-ok]'); await p.waitForSelector('.hz-map.is-real');
            assert.notStrictEqual(await fillOf(60), 'rgb(18, 52, 86)', '↺ : la couleur du jeu');
            await p.evaluate(() => [...document.querySelectorAll('.ui-toast')].reverse().find(x => /Couleurs des fuseaux/.test(x.textContent)).querySelector('button').click()); await sleep(500);
            assert.strictEqual(await fillOf(60), 'rgb(18, 52, 86)', '↶ Annuler');
            await p.evaluate(() => localStorage.removeItem('genealogie-horloges-couleurs')); void f0;
            // 📋 quels pays et régions pour chaque fuseau : se montre, se cherche, retenu
            await p.click('.hz-page [data-hz-who] > summary'); await sleep(200);
            assert.strictEqual(await p.evaluate(() => localStorage.getItem('genealogie-horloges-pays')), 'true');
            const who = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-hz-who-off]')].map(sec => [sec.dataset.hzWhoOff, [...sec.querySelectorAll('[data-hz-who-n]')].map(x => x.textContent)])));
            assert.ok(who['60'].includes('Algérie') && who['60'].some(n => /^France/.test(n)), 'UTC+1 : la France, l’Algérie');
            assert.ok(who['-300'].some(n => /États-Unis \(New York\)/.test(n)) && who['-360'].some(n => /États-Unis \(Chicago\)/.test(n)), 'les régions des États-Unis');
            assert.ok(who['330'].includes('Inde'));
            await p.fill('.hz-page [data-hz-who-q]', 'japon'); await sleep(100);
            assert.deepStrictEqual(await p.evaluate(() => [...document.querySelectorAll('[data-hz-who-off]')].filter(x => !x.hidden).map(x => x.dataset.hzWhoOff)), ['540']);
            await p.click('.hz-page [data-hz-mapmode="bands"]'); await p.waitForSelector('.hz-map.is-bands .hz-bl');
            assert.strictEqual(await p.evaluate(() => localStorage.getItem('genealogie-horloges-carte')), '"bands"');
            await p.click('.hz-page [data-hz-mapmode="real"]'); await p.waitForSelector('.hz-map.is-real');
            await p.click('.hz-page [data-hz-view="clocks"]');
        });
        await t('🎨 Style : préréglage « Numérique » (chiffres seuls), enregistré, ↶ Annuler', async () => {
            await p.click('.hz-page [data-hz-style-open]'); await p.waitForSelector('.hz-style [data-hz-preset]');
            await p.evaluate(() => [...document.querySelectorAll('.hz-style [data-hz-preset]')].find(b => /Numérique/.test(b.textContent)).click());
            assert.strictEqual(await p.evaluate(() => document.querySelectorAll('.hz-style .hz-prev .hz-dial').length), 0, 'aperçu : plus d’aiguilles');
            await p.click('.hz-style [data-hz-ok]'); await p.waitForFunction(() => !document.querySelector('.hz-page .hz-dial'));
            assert.strictEqual(JSON.parse(await p.evaluate(() => localStorage.getItem('genealogie-horloges-style'))).kind, 'digital');
            await p.evaluate(() => [...document.querySelectorAll('.ui-toast')].reverse().find(x => /Style des horloges/.test(x.textContent)).querySelector('button').click());
            await p.waitForSelector('.hz-page .hz-dial', {timeout: 5000});
        });
        await t('🧱 le widget « 🕰 Horloges du monde » du tableau de bord, avec son propre style', async () => {
            assert.ok(await p.evaluate(() => window.LCNDA_APP.defaultDashboardBlocks.some(x => x[0] === 'clocks_widget')));
            const html = await p.evaluate(() => { const box = document.createElement('div'); box.innerHTML = window.LCNDA_EXT.dashboard.clocks_widget.render(0, {type: 'clocks_widget', config: {cities: null, style: {kind: 'analog', shape: 'square', numbers: 'roman'}}}); document.body.appendChild(box); const h = box.innerHTML; box.remove(); return h; });
            assert.match(html, /Horloges du monde/); assert.match(html, /<rect x="3" y="3" width="94" height="94"/); assert.match(html, />XII</); assert.ok(!/data-hz-digi/.test(html), 'aiguilles seules');
            const cfg = await p.evaluate(() => { const ed = document.createElement('div'); ed.innerHTML = window.LCNDA_EXT.dashboardConfig.clocks_widget.html({config: {}}); document.body.appendChild(ed); ed.querySelectorAll('[data-hzw-city]')[0].checked = false; const r = window.LCNDA_EXT.dashboardConfig.clocks_widget.read(ed); ed.remove(); return r; });
            assert.strictEqual(cfg.cities.length, 4); assert.strictEqual(cfg.style, null);
        });
        await t('aucune erreur JavaScript', async () => { assert.deepStrictEqual(errs, []); });
    } finally { await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true}); }
    console.log(fails ? `${fails} essai(s) en échec` : 'Les heures du monde marchent.');
    process.exit(fails ? 1 : 0);
})();
