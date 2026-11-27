#!/usr/bin/env node
/* 👤 Une vie et 🐴 la poste aux chevaux (lot O, suite : O1 horloge, règle des âges, durée du jour ; O3 relais et routes de poste
 * 1632-1833 ; O4 bulletin du jour de sa naissance) : assets/js/app-lot-o-vie.js, app-lot-o-poste.js, app-lot-o-core.js,
 * lib/lot_o.php (lot_o_life), assets/data/lo-poste.json.gz (scripts/lot-o/build-poste.py, Zenodo 11196161, ODbL).
 * Données fictives (MAZAUD, LACOMBE, DURAND : tests/fixtures/lot-o-seed.php).   node tests/test-lot-o-vie.js  (LOT_O_SHOT=dossier) */
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const zlib = require('zlib');
const {spawn, spawnSync} = require('child_process');
let chromium; try { ({chromium} = require('playwright')); } catch (_) { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); }
const root = path.join(__dirname, '..');
const {findPhp, phpRuntimeArgs, devBundledPhp} = require('../electron/php-server.js');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 8).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const C = require('../assets/js/app-lot-o-core.js');
const SHOT = process.env.LOT_O_SHOT || '';
const P = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root, 'assets/data/lo-poste.json.gz'))));

(async () => {
    /* ═════════ 0. les données et les calculs ═════════ */
    await t('pack de la poste : 7 dates, ODbL relue, source Zenodo ; < 200 Ko ; Paris (409) dans chaque réseau', () => {
        assert.deepStrictEqual(P.years, [1632, 1708, 1733, 1758, 1783, 1810, 1833]);
        assert.strictEqual(P.licence, 'ODbL 1.0'); assert.match(P.url, /zenodo\.org\/records\/11196161/); assert.match(P.licence_read, /^\d{4}-\d\d-\d\d$/);
        assert.ok(fs.statSync(path.join(root, 'assets/data/lo-poste.json.gz')).size < 200000);
        assert.ok(Object.keys(P.relays).length > 2000);
        for (const y of P.years) { const f = P.roads[y]; assert.ok(f.length % 3 === 0 && f.length > 1500, String(y)); assert.ok(f.some((x, i) => i % 3 < 2 && x === 409), `Paris ${y}`); }
    });
    await t('calculs : le plus court chemin sur le vrai réseau (Seilhac → Paris plus court en 1833 qu’en 1632), l’année du réseau', () => {
        const at = y => { const tm = C.posteTimes(P.roads[y], 409); return C.nearestRelay(P.relays, tm, 45.367, 1.713); };
        const a = at(1632), b = at(1810), c = at(1833);
        assert.ok(a.minutes > c.minutes, `${a.minutes} > ${c.minutes}`); assert.ok(b.km < 2, 'Seilhac a un relais en 1810');
        assert.ok(b.minutes > 40 * 60 && b.minutes < 70 * 60, String(b.minutes));
        assert.strictEqual(C.posteYear(P.years, 1820), 1810); assert.strictEqual(C.posteYear(P.years, 1845), 1833); assert.strictEqual(C.posteYear(P.years, 1860), null); assert.strictEqual(C.posteYear(P.years, 1600), null);
        const tiny = C.posteTimes([1, 2, 10, 2, 3, 5, 1, 3, 30], 1); assert.strictEqual(tiny.get(3), 15);
    });
    await t('calculs : l’horloge (mariage à 8 h 21, 1 heure ≈ 2 ans 11 mois), date républicaine', () => {
        const c = C.clockOf('1852-02-10', '1921-04-03', [{kind: 'marriage', d: '1876-03-02'}, {kind: 'move', d: '1887-03-01'}, {kind: 'x', d: '1950-01-01'}]);
        assert.strictEqual(c.years, 69); assert.deepStrictEqual(c.perHour, {y: 2, m: 11}); assert.deepStrictEqual(c.marks.map(m => m.text), ['8 h 21', '12 h 10']);
        assert.strictEqual(C.clockOf('1852', null, []), null);
        assert.strictEqual(C.republicanText(1802, 12, 21), '30 frimaire an XI'); assert.strictEqual(C.republicanText(1810, 1, 1), '');
    });

    /* ═════════ 1. le serveur ═════════ */
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-lotov-'));
    fs.mkdirSync(path.join(tmp, 'media'), {recursive: true});
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4', GENEALOGY_TEST: '1'};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), path.join(__dirname, 'fixtures/lot-o-seed.php')], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0 || !/"ok":1/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const kill = () => { try { proc.kill(); } catch (_) {} };
    process.on('exit', kill);
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 150; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const get = async (action, q = {}) => { const r = await fetch(base + 'api.php?' + new URLSearchParams({action, ...q})); return {status: r.status, body: await r.json()}; };
    const LIVING = /Camille|VIVANT|Hugo/;

    await t('serveur : lot_o_life — mariage, enfants (jamais un vivant), départ pour Tulle, âge des parents ; rien pour une fiche vivante', async () => {
        const j = (await get('lot_o_life', {id: 2})).body;
        assert.deepStrictEqual(j.events.map(e => [e.kind, e.d]), [['marriage', '1876-03-02'], ['child', '1876-08-10'], ['child', '1880-03-02'], ['move', '1887-03-01']]);
        assert.strictEqual(j.events[3].place, 'Tulle'); assert.deepStrictEqual(j.family.map(f => [f.role, f.age]), [['father', 31], ['mother', 30]]);
        const l = (await get('lot_o_life', {id: 1})).body; assert.ok(!LIVING.test(JSON.stringify(l))); assert.strictEqual(l.events[0].who, '', 'le conjoint vivant n’est pas nommé');
        assert.deepStrictEqual((await get('lot_o_life', {id: 30})).body, {ok: false});
    });

    /* ═════════ 2. l'écran ═════════ */
    const browser = await chromium.launch();
    const errs = [];
    try {
        const ctx = await browser.newContext({viewport: {width: 1440, height: 900}});
        await ctx.addInitScript(() => { try { localStorage.setItem('genealogie-premier-vu', '1'); localStorage.setItem('genealogie-visite-guidee', JSON.stringify({seen: true})); } catch (_) {} });
        const outside = [];
        await ctx.route(u => !u.toString().startsWith(base), r => { outside.push(r.request().url()); r.abort(); });
        const p = await ctx.newPage();
        p.on('pageerror', e => errs.push(e.message));
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.lotOVie && window.LCNDA_EXT?.lotOPoste && window.LCNDA_LUNE, null, {timeout: 60000});
        const text = sel => p.$eval(sel, el => el.textContent.replace(/\s+/g, ' ').trim());
        // la personne de départ : Jean MAZAUD (2) pour les cartes de la page
        await p.evaluate(() => { window.LCNDA_APP.state.bootstrap.startPersonId = 2; });

        await t('écran : Listes → 🌳 Ce que dit l’arbre → « 👤 Une vie » : 🕰 horloge, 🎂 âges, 📰 bulletin', async () => {
            await p.evaluate(() => window.LCNDA_EXT.lotO.open('vie:clock'));
            await p.waitForSelector('[data-lov-card="clock"] .lo-lead', {timeout: 20000});
            assert.match(await text('[data-lov-card="clock"] .lo-lead'), /Jean MAZAUD \(1852–1921, 69 ans\) : mariage à 8 h 21, 1ᵉʳ enfant à 8 h 30, 2ᵉ enfant à 9 h 44\. 1 heure = 2 ans 11 mois de sa vie\./);
            assert.strictEqual(await p.$$eval('[data-lov-card="clock"] svg.lo-clock .lo-mark', a => a.length) >= 4, true);
            await p.waitForSelector('[data-lov-card="ages"] .lo-ages li', {timeout: 20000});
            const ages = await p.$$eval('[data-lov-card="ages"] .lo-ages li', a => a.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
            assert.ok(ages.some(x => /^24 ans ?Son mariage avec Marie DURAND/.test(x)), ages.join(' | '));
            assert.ok(ages.some(x => /^35 ans ?Il part pour Tulle/.test(x)), ages.join(' | '));
            assert.ok(await p.$('[data-lov-card="ages"] li.is-world a[href^="https://fr.wikipedia.org/"][target="_blank"]'), 'un événement du monde avec sa source ↗');
            await p.waitForSelector('[data-lov-card="bulletin"] [data-lov-bulletin]', {timeout: 20000});
            assert.match(await text('[data-lov-card="bulletin"] .lo-bul-head'), /Le Petit Bulletin de Seilhac ?Mardi 10 février 1852 · naissance de Jean MAZAUD/);
            const lines = await p.$$eval('[data-lov-card="bulletin"] [data-lov-line]', a => a.map(x => x.dataset.lovLine));
            for (const k of ['jour', 'lune', 'saint', 'chome', 'famille']) assert.ok(lines.includes(k), `${k} : ${lines.join(',')}`);
            assert.ok(!lines.includes('temps'), 'pas de météo inventée (pas installée)');
            assert.match(await text('[data-lov-line="jour"]'), /\d+ h \d\d de jour\. Lever \d+ h \d\d, coucher \d+ h \d\d/);
            assert.match(await text('[data-lov-line="famille"]'), /son père, Pierre MAZAUD, avait 31 ans/);
            assert.ok(await p.$('[data-lov-line="saint"] a[href^="https://fr.wikipedia.org/wiki/10_f"]'), 'le saint : sa source ↗');
            if (SHOT) { fs.mkdirSync(SHOT, {recursive: true}); for (const el of await p.$$('[data-lov-card]')) { await el.scrollIntoViewIfNeeded(); await el.screenshot({path: path.join(SHOT, `vie-${await el.getAttribute('data-lov-card')}.png`)}); } }
        });
        await t('écran : ⚙️ — cadran « Une année », style « Sobre », date républicaine (1795), « ↶ Comme avant » ; une partie ouverte à la fois', async () => {
            const card = '[data-lov-card="clock"]';
            await p.click(`${card} .lo-perso > summary`); await p.click(`${card} .lo-pgrp[data-lo-part="0"] > summary`); await p.click(`${card} .lo-pgrp[data-lo-part="1"] > summary`); await sleep(100);
            assert.deepStrictEqual(await p.$$eval(`${card} .lo-pgrp`, a => a.map(d => d.open)), [false, true, false]);
            await p.click(`${card} .lo-pgrp[data-lo-part="0"] > summary`);
            await p.click(`${card} [data-lov-seg="clock:dial"][data-v="year"]`); await p.waitForFunction(() => /mariage le \d+(er)? \S+/.test(document.querySelector('[data-lov-card="clock"] .lo-lead')?.textContent || ''));
            await p.click(`${card} [data-lov-reset="clock:dial"]`); await p.waitForFunction(() => /à 8 h 21/.test(document.querySelector('[data-lov-card="clock"] .lo-lead')?.textContent || ''));
            const bc = '[data-lov-card="bulletin"]';
            await p.click(`${bc} [data-lov-seg="bulletin:when"][data-v="other"]`); await p.waitForSelector(`${bc} [data-lov-date]`);
            await p.fill(`${bc} [data-lov-date]`, '1795-10-02'); await p.dispatchEvent(`${bc} [data-lov-date]`, 'change');
            await p.waitForFunction(() => /10 vendémiaire an IV/.test(document.querySelector('[data-lov-card="bulletin"] .lo-bul-head')?.textContent || ''));
            assert.match(await text(`${bc} [data-lov-line="chome"]`), /décadi/);
            assert.ok(!(await p.$(`${bc} [data-lov-line="famille"]`)), 'pas d’âges de la famille pour une autre date');
            await p.evaluate(() => localStorage.removeItem('genealogie-arbre-dit'));
        });
        await t('fiche : une phrase dans 🌍 (horloge + 🐴 Paris en poste) et une dans 🌒 (durée du jour) ; 🕰 s’ouvre en fenêtre ; rien pour un vivant', async () => {
            const n0 = await p.evaluate(async () => { const A = window.LCNDA_APP; A.state.currentPersonId = 2; await A.setModule('personnes'); return document.querySelectorAll('#workspace .person-page section.card').length; });
            await p.waitForSelector('[data-world-host] [data-lov-line="vie"]', {timeout: 30000});
            assert.match(await text('[data-world-host] [data-lov-line="vie"]'), /Si sa vie tenait en un jour, il se serait marié à 8 h 21/);
            const lune = await p.$('[data-lune-host]');
            if (lune) { await p.waitForSelector('[data-lune-host] [data-lov-line="jour"]', {timeout: 30000}); assert.match(await text('[data-lune-host] [data-lov-line="jour"]'), /le soleil a brillé \d+ h \d\d/); }
            assert.strictEqual(await p.$$eval('#workspace .person-page section.card', a => a.length), n0, 'aucun bloc en plus');
            if (SHOT) { const el = await p.$('section.card:has([data-world-host])'); if (el) { await el.scrollIntoViewIfNeeded(); await el.screenshot({path: path.join(SHOT, 'fiche-monde.png')}); } }
            await p.click('[data-world-host] [data-lov-open="clock"]');
            await p.waitForSelector('dialog [data-lov-card="clock"] svg.lo-clock', {timeout: 20000});
            await p.keyboard.press('Escape'); await sleep(300);
            assert.strictEqual(await p.$('[data-lop-line]'), null, 'né en 1852 : plus de poste aux chevaux (le train)');
            await p.evaluate(async () => { const A = window.LCNDA_APP; A.state.currentPersonId = 4; await A.setModule('personnes'); });
            await p.waitForSelector('[data-world-host] [data-lop-line="poste"]', {timeout: 30000});
            assert.match(await text('[data-world-host] [data-lop-line="poste"]'), /En 1833, le relais de poste le plus proche de Seilhac était Tulle \(12 km\) ; de là, Paris était à [\d,]+ h de cheval de poste/);
            await p.evaluate(async () => { const A = window.LCNDA_APP; A.state.currentPersonId = 30; await A.setModule('personnes'); }); await sleep(1500);
            assert.strictEqual(await p.$('[data-lov-line], [data-lop-line]'), null, 'rien sur la fiche d’une personne vivante');
        });
        await t('🐴 village et cartes : le panneau « La poste aux chevaux », les calques, la liste des relais', async () => {
            await p.evaluate(() => { const ws = document.getElementById('workspace'); ws.insertAdjacentHTML('beforeend', '<div class="h-village" id="lop-essai"><div data-pli-host data-pli-lat="45.367" data-pli-lon="1.713" data-pli-name="Seilhac"></div><div class="h-village-grid"></div></div>'); });
            await p.waitForSelector('#lop-essai [data-lop-panel]', {timeout: 20000});
            assert.match(await text('#lop-essai [data-lop-panel] .cplus-lead'), /En 1833, le relais de poste le plus proche de Seilhac était Tulle/);
            assert.strictEqual(await p.$$eval('#lop-essai [data-lop-panel] tbody tr', a => a.length), 7);
            assert.ok(await p.$('#lop-essai a[href="https://zenodo.org/records/11196161"][target="_blank"]'));
            await p.evaluate(() => document.getElementById('lop-essai').remove());
            const L = await p.evaluate(async () => { const S = window.LCNDA_EXT.mapLayerSources; const r = await S.find(x => x.id === 'lo_poste_routes').run({year: 1810, bbox: [1, 45, 2.5, 46]}); const q = await S.find(x => x.id === 'lo_poste_relais').run({year: 1700}); return [r.features.length, r.features[0]?.type, q.features.length, /1632/.test(q.source)]; });
            assert.ok(L[0] > 5 && L[1] === 'line' && L[2] > 300 && L[3], JSON.stringify(L));
            const rows = await p.evaluate(async () => (await window.LCNDA_EXT.dataLists.find(d => d.id === 'lo_relais').load()).length);
            assert.ok(rows > 2000, String(rows));
        });
        await t('⌘K et 🧭 Je veux… ; rien ne sort de l’ordinateur ; aucune erreur JavaScript', async () => {
            const qs = await p.evaluate(() => window.LCNDA_EXT.quickSearchProviders.flatMap(f => { try { return f('horloge vie') || []; } catch (_) { return []; } }).map(x => x.label));
            assert.ok(qs.some(l => /horloge/.test(l)), qs.join(' | '));
            await p.evaluate(() => window.LCNDA_EXT.jeVeux?.load?.());
            const ids = await p.evaluate(() => (window.LCNDA_EXT.intents || []).map(i => i.id));
            for (const id of ['horloge_vie', 'regle_ages', 'bulletin_naissance']) assert.ok(ids.includes(id), id);
            assert.deepStrictEqual(outside.filter(u => /zenodo|fr\.wikipedia\.org|lo-poste/.test(u)), []);
            assert.deepStrictEqual(errs, []);
        });
    } finally { await browser.close().catch(() => {}); kill(); fs.rmSync(tmp, {recursive: true, force: true}); }
    console.log(fails ? `\n✗ ${fails} en échec` : '\n✓ tout passe');
    process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
