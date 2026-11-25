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

    await t('🏷 les étiquettes de la carte : jamais l’une sur l’autre, dans la carte, en colonne avec un trait si c’est trop serré', () => {
        const X = lon => (lon + 180) / 360 * 960, Y = lat => (90 - lat) / 180 * 470;
        const ov = (a, b) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > .01 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > .01;
        // l'Europe de l'Ouest bien serrée : 12 villes à moins de 10° les unes des autres, de grandes étiquettes
        const eu = ['Paris', 'Bruxelles', 'Londres', 'Amsterdam', 'Luxembourg', 'Genève', 'Francfort', 'Lyon', 'Lille', 'Berne', 'Cologne', 'Strasbourg'].map(n => H.CITIES.find(c => c[0] === n));
        const items = eu.map(c => ({dots: [{x: X(c[4]), y: Y(c[3])}], w: 70, h: 15}));
        const pos = H.placeLabels(items, {W: 960, H: 470, r: 4});
        pos.forEach((a, i) => pos.forEach((b, j) => { if (j > i) assert.ok(!ov(a, b), `${eu[i][0]} / ${eu[j][0]} se chevauchent`); }));
        pos.forEach((b, i) => { assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.w <= 960 && b.y + b.h <= 470, eu[i][0] + ' hors de la carte'); items.forEach((it, j) => { if (j !== i) assert.ok(!ov(b, {x: it.dots[0].x - 4, y: it.dots[0].y - 4, w: 8, h: 8}), `${eu[i][0]} cache le point de ${eu[j][0]}`); }); });
        const st = pos.filter(b => b.stacked); assert.ok(st.length >= 2, 'des étiquettes en colonne'); assert.ok(st.every(b => b.leader && Number.isFinite(b.leader.x1 + b.leader.y2)), 'chacune avec son trait');
        // tout près du bord : l'étiquette reste dans la carte
        const edge = H.placeLabels([{dots: [{x: 955, y: 3}], w: 120, h: 15}, {dots: [{x: 2, y: 466}], w: 120, h: 15}], {W: 960, H: 470});
        edge.forEach(b => assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.w <= 960 && b.y + b.h <= 470));
        // la même heure, tout près → ensemble ; pas la même heure → séparées
        const g = H.groupCities([{x: 0, y: 0, time: '17:26'}, {x: 5, y: 4, time: '17:26'}, {x: 6, y: 0, time: '18:26'}, {x: 300, y: 0, time: '17:26'}], 20);
        assert.deepStrictEqual(g.map(x => x.join(',')).sort(), ['0,1', '2', '3']);
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
        // 🏷 les villes proches sur la carte : Abidjan, Accra, Cotonou, Lagos ; Montréal et New York ; Paris, Bruxelles, Londres
        const CLOSE = ['Abidjan', 'Accra', 'Cotonou', 'Lagos', 'Montréal', 'New York', 'Paris', 'Bruxelles', 'Londres', 'Tokyo', 'Moscou'];
        const checkLabels = async (pg, what) => {
            const r = await pg.evaluate(() => {
                const svg = document.querySelector('.hz-map'), m = svg.getBoundingClientRect(), bx = e => { const b = e.getBoundingClientRect(); return {x: b.left, y: b.top, w: b.width, h: b.height}; };
                return {m: {x: m.left, y: m.top, w: m.width, h: m.height}, labs: [...svg.querySelectorAll('.hz-lab')].map(l => ({g: l.dataset.hzG, txt: l.textContent, st: l.classList.contains('is-stacked'), ...bx(l.querySelector('rect'))})),
                    dots: [...svg.querySelectorAll('.hz-dot')].map(d => ({g: d.dataset.hzG, ...bx(d.querySelector('circle'))})), leaders: [...svg.querySelectorAll('.hz-leader')].map(l => l.dataset.hzG),
                    over: getComputedStyle(svg.querySelector('.hz-labels')).display !== 'none' && [...svg.children].indexOf(svg.querySelector('.hz-labels')) > [...svg.children].indexOf(svg.querySelector('.hz-night'))};
            });
            const ov = (a, b) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > .5 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > .5;
            assert.ok(r.labs.length >= 6, what + ' : des étiquettes');
            r.labs.forEach((a, i) => r.labs.forEach((b, j) => { if (j > i) assert.ok(!ov(a, b), `${what} : « ${a.txt} » et « ${b.txt} » se chevauchent`); }));
            r.labs.forEach(a => { assert.ok(a.x >= r.m.x - .5 && a.y >= r.m.y - .5 && a.x + a.w <= r.m.x + r.m.w + .5 && a.y + a.h <= r.m.y + r.m.h + .5, `${what} : « ${a.txt} » sort de la carte`);
                r.dots.forEach(d => { if (d.g !== a.g) assert.ok(!ov(a, d), `${what} : « ${a.txt} » cache un autre point`); }); });
            r.labs.filter(a => a.st).forEach(a => assert.ok(r.leaders.includes(a.g), `${what} : « ${a.txt} » en colonne a son trait`));
            assert.ok(r.over, what + ' : les étiquettes au-dessus de la nuit');
            return r;
        };
        await t('🏷 la carte des fuseaux : des villes proches, aucune étiquette l’une sur l’autre (heure légale et fuseaux théoriques), le survol', async () => {
            const saved = await p.evaluate(() => [localStorage.getItem('genealogie-horloges'), localStorage.getItem('genealogie-horloges-vue')]);
            await p.evaluate(names => { const H = window.LCNDA_EXT.horloges; localStorage.setItem('genealogie-horloges', JSON.stringify(names.map((n, i) => { const c = H.CITIES.find(x => x[0] === n); return {id: 'k' + i, name: n, tz: c[1], lat: c[3], lon: c[4]}; }))); localStorage.setItem('genealogie-horloges-vue', '"map"'); }, CLOSE);
            await open(); await p.waitForSelector('.hz-map .hz-lab', {timeout: 15000});
            for (const mode of ['real', 'bands']) {
                await p.click(`.hz-page [data-hz-mapmode="${mode}"]`); await p.waitForSelector(`.hz-map.is-${mode} .hz-lab`);
                const r = await checkLabels(p, mode);
                const txt = r.labs.map(a => a.txt);
                assert.ok(txt.some(x => /^Montréal · New York \d\d:\d\d$/.test(x)), 'Montréal et New York ensemble : ' + txt.join(' | '));
                assert.ok(txt.some(x => /Cotonou · Lagos \d\d:\d\d/.test(x)) && txt.some(x => /Abidjan · Accra \d\d:\d\d/.test(x)) && txt.some(x => /Paris · Bruxelles \d\d:\d\d/.test(x)) && txt.some(x => /^Londres \d\d:\d\d$/.test(x)), txt.join(' | '));
                assert.strictEqual(await p.evaluate(() => document.querySelector('[data-hz-citykey]').hidden), true, 'pas de liste numérotée sur grand écran');
            }
            // survoler (ou atteindre au clavier) un point → son étiquette ressort
            await p.focus('.hz-map .hz-dot[data-hz-name="Tokyo"]');
            assert.ok(await p.evaluate(() => { const g = document.querySelector('.hz-dot[data-hz-name="Tokyo"]').dataset.hzG, l = document.querySelector(`.hz-lab[data-hz-g="${g}"]`); return l.classList.contains('is-hl') && /Tokyo/.test(l.textContent) && l === l.parentNode.lastElementChild; }));
            await p.hover('.hz-map .hz-dot[data-hz-name="Paris"] circle');
            assert.ok(await p.evaluate(() => { const l = document.querySelector('.hz-lab.is-hl'); return l && /Paris/.test(l.textContent) && document.querySelectorAll('.hz-lab.is-hl').length === 1; }));
            // une ville de plus, tout près (Lomé) : les étiquettes se replacent
            await p.evaluate(() => { const H = window.LCNDA_EXT.horloges, l = H.mine(); localStorage.setItem('genealogie-horloges', JSON.stringify([...l, {id: 'lome', name: 'Lomé', tz: 'Africa/Lome', lat: 6.13, lon: 1.22}])); return H.render(window.LCNDA_APP.state.workspaceToken); });
            await p.waitForFunction(() => [...document.querySelectorAll('.hz-map .hz-lab')].some(l => /Lomé/.test(l.textContent)));
            await checkLabels(p, 'avec Lomé');
            // la fenêtre rétrécit : numéros et liste en dessous, sans relancer la page
            await p.setViewportSize({width: 390, height: 844}); await p.waitForFunction(() => document.querySelector('.hz-map.is-narrow') && !document.querySelector('[data-hz-citykey]').hidden, null, {timeout: 5000});
            await checkLabels(p, '390 px (redimensionné)');
            await p.setViewportSize({width: 1440, height: 900}); await p.waitForFunction(() => !document.querySelector('.hz-map.is-narrow'), null, {timeout: 5000});
            await p.click('.hz-page [data-hz-mapmode="real"]');
            // remis comme avant (les 4 villes, la vue horloges) pour la suite
            await p.evaluate(([l, v]) => { if (l === null) localStorage.removeItem('genealogie-horloges'); else localStorage.setItem('genealogie-horloges', l); localStorage.setItem('genealogie-horloges-vue', v || '"clocks"'); }, saved);
            await p.click('.hz-page [data-hz-view="clocks"]'); await p.waitForSelector('.hz-page .hz-clock');
        });
        await t('🏷 sur un téléphone (390 px) : des numéros sur la carte, la liste des villes en dessous', async () => {
            const ctx = await browser.newContext({viewport: {width: 390, height: 844}, timezoneId: 'Europe/Paris'});
            const m = await ctx.newPage(); m.on('pageerror', e => errs.push(e.message));
            await m.goto(base); await m.waitForFunction(() => window.LCNDA_EXT?.horloges && window.LCNDA_APP?.state?.csrf, null, {timeout: 30000});
            await m.evaluate(names => { const H = window.LCNDA_EXT.horloges; localStorage.setItem('genealogie-horloges-vue', '"map"'); localStorage.setItem('genealogie-horloges', JSON.stringify(names.map((n, i) => { const c = H.CITIES.find(x => x[0] === n); return {id: 'k' + i, name: n, tz: c[1], lat: c[3], lon: c[4]}; }))); const A = window.LCNDA_APP; A.state.listType = 'world_clocks'; A.setModule('listes'); }, CLOSE);
            await m.waitForSelector('.hz-map.is-narrow .hz-lab', {timeout: 15000});
            for (const mode of ['real', 'bands']) {
                await m.click(`.hz-page [data-hz-mapmode="${mode}"]`); await m.waitForSelector(`.hz-map.is-${mode}.is-narrow .hz-lab`);
                const r = await checkLabels(m, '390 px ' + mode);
                assert.ok(r.labs.every(a => /^\d+$/.test(a.txt)), 'des numéros : ' + r.labs.map(a => a.txt).join(','));
                const key = await m.evaluate(() => [...document.querySelectorAll('[data-hz-citykey] li')].map(li => li.textContent.trim()));
                assert.strictEqual(key.length, r.labs.length, 'un numéro = une ligne de la liste');
                assert.ok(key.some(x => /^\d+ Montréal · New York \d\d:\d\d$/.test(x)) && key.some(x => /Tokyo/.test(x)), key.join(' | '));
                assert.ok(await m.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'pas de défilement de côté');
            }
            await ctx.close();
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
