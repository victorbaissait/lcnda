#!/usr/bin/env node
/* 🌳 Ce que dit l'arbre (lot O, lots O1 et O2 ; maquette docs/design/lot-o.html) : assets/js/app-lot-o-arbre.js, app-lot-o-core.js,
 * assets/css/lot-o-arbre.css, lib/lot_o.php. Données fictives (MAZAUD, LACOMBE, DURAND : tests/fixtures/lot-o-seed.php).
 *  0. les calculs purs : temps clos (comme le lot 10), jours chômés, dispense, mots du lien, rayons, centre ;
 *  1. le serveur : chaque carte, deux personnes, une fiche ; une fiche vivante n'est jamais comptée ni nommée ; mauvaise demande → 422 ;
 *  2. l'écran : la page de Listes (11 cartes, ⚙️ une partie ouverte à la fois, « ↶ Comme avant » + ↶ Annuler, tact), les phrases de la
 *     fiche (👪, ⚖️, 🌍), ⌘K et 🧭 Je veux…, le thème sombre, l'écran de téléphone, aucune erreur.
 *   node tests/test-lot-o-arbre.js   (LOT_O_SHOT=dossier : des captures) */
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
const C = require('../assets/js/app-lot-o-core.js');
const L10 = require('../assets/js/heritage-lot10-regles-actes.js');
const SHOT = process.env.LOT_O_SHOT || '';

(async () => {
    /* ═════════ 0. les calculs ═════════ */
    await t('calculs : temps clos identiques au lot 10 (1583-2030, julien avant), Pâques', () => {
        let n = 0;
        for (let y = 1583; y <= 2030; y++) for (const [m, d] of [[3, 12], [12, 10], [1, 6], [1, 7], [2, 20], [4, 8], [11, 30], [12, 2], [3, 1]]) { n++; assert.strictEqual(C.tempsClos(y, m, d), L10.tempsClos(y, m, d)?.kind || null, `${y}-${m}-${d}`); }
        assert.ok(n > 4000);
        assert.strictEqual(C.tempsClos(1876, 3, 2), 'careme'); assert.strictEqual(C.tempsClos(1789, 12, 14), 'avent'); assert.strictEqual(C.tempsClos(1858, 1, 15), null);
    });
    await t('calculs : jours chômés (fête d’obligation avant 1802, décadi, Concordat, jours fériés de la loi)', () => {
        assert.deepStrictEqual([C.chome(1780, 6, 24).off, C.chome(1780, 6, 24).rule], [true, 'ancien']); // Saint-Jean-Baptiste
        assert.strictEqual(C.chome(1830, 6, 24).off, false, '1830 : la Saint-Jean n’est plus chômée');
        assert.strictEqual(C.chome(1830, 8, 15).name, 'l’Assomption');
        assert.strictEqual(C.chome(1795, 10, 1).off, false); assert.strictEqual(C.chome(1795, 10, 2).kind, 'decadi', '10 vendémiaire an IV');
        assert.deepStrictEqual(C.republican(1795, 10, 2), {an: 4, mois: 1, jour: 10});
        assert.strictEqual(C.chome(1879, 7, 14).off, false); assert.strictEqual(C.chome(1880, 7, 14).kind, 'ferie');
        assert.strictEqual(C.chome(1890, 4, 7).name, 'le lundi de Pâques'); assert.strictEqual(C.chome(1885, 4, 6).off, false);
        assert.strictEqual(C.chome(1970, 5, 8).off, false); assert.strictEqual(C.chome(2024, 5, 8).off, true);
        assert.strictEqual(C.chome(1876, 3, 5).kind, 'dimanche');
    });
    await t('calculs : la dispense (Latran IV, Code de 1917, Code de 1983), les mots du lien', () => {
        assert.deepStrictEqual(C.dispense('consang', 3, 5, 1876), {needed: true, limit: 4, rule: 'latran'});
        assert.strictEqual(C.dispense('consang', 4, 8, 1876).needed, true); assert.strictEqual(C.dispense('consang', 5, 10, 1876).needed, false);
        assert.strictEqual(C.dispense('consang', 4, 8, 1930).needed, false); assert.strictEqual(C.dispense('consang', 3, 6, 1930).needed, true);
        assert.strictEqual(C.dispense('affin', 2, 3, 1930).needed, true); assert.strictEqual(C.dispense('affin', 3, 5, 1930).needed, false);
        assert.strictEqual(C.dispense('consang', 2, 4, 1990).needed, true); assert.strictEqual(C.dispense('consang', 3, 5, 1990).needed, false); assert.strictEqual(C.dispense('affin', 1, 2, 1990).needed, false);
        assert.strictEqual(C.kinWords(2, 2), 'cousins germains'); assert.strictEqual(C.kinWords(3, 3), 'cousins issus de germains'); assert.strictEqual(C.kinWords(1, 2), 'oncle (ou tante) et neveu (ou nièce)');
    });
    await t('calculs : rayon par siècle, médiane, centre de la famille', () => {
        const by = C.radiusBy([{km: 0, year: 1788}, {km: 13, year: 1789}, {km: 4, year: 1850}, {km: 40, year: 1880}, {km: 60, year: 1890}], 12);
        assert.deepStrictEqual(by.map(x => [x.label, x.n, x.median, x.near]), [['XVIIIᵉ', 2, 6.5, 50], ['XIXᵉ', 3, 40, 33]]);
        assert.strictEqual(C.median([3, 1, 2]), 2); assert.strictEqual(C.oneIn(1, 8), 8);
        const g = C.gravityPath([{g: 1, lat: 48.86, lon: 2.35, near: 'Paris'}, {g: 3, lat: 45.27, lon: 1.77, near: 'Tulle'}, {g: 2, lat: 46.5, lon: 2, near: 'Bourges'}]);
        assert.strictEqual(g.from.near, 'Tulle'); assert.strictEqual(g.to.near, 'Paris'); assert.ok(g.km > 390 && g.km < 410, String(g.km));
    });

    /* ═════════ 1. le serveur ═════════ */
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-loto-'));
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

    await t('serveur : 💒 les mariages datés, sans le couple vivant ; 3 en temps clos', async () => {
        const {body} = await get('lot_o_arbre', {card: 'tempsclos'});
        assert.strictEqual(body.n, 6); assert.strictEqual(body.dated.length, 6);
        assert.strictEqual(C.monthsOf(body.dated, body.months).list.length, 3);
        assert.ok(!LIVING.test(JSON.stringify(body)));
        const anc = (await get('lot_o_arbre', {card: 'tempsclos', dg_pop: 'pat'})).body; assert.ok(anc.n < 6 && anc.n >= 1, String(anc.n));
        const per = (await get('lot_o_arbre', {card: 'tempsclos', dg_from: '1850', dg_to: '1900'})).body; assert.strictEqual(per.n, 4);
    });
    await t('serveur : 🔗 les couples apparentés ; Jean × Marie : 3ᵉ degré (Église), 5ᵉ (loi), F = 1/32, l’ancêtre commun et le chemin', async () => {
        const all = (await get('lot_o_arbre', {card: 'dispense'})).body;
        assert.deepStrictEqual(all.rows.map(r => [r.a, r.b, r.canon, r.civil]), [['Jean MAZAUD', 'Marie DURAND', 3, 5]]); assert.strictEqual(all.couples, 6);
        const d = (await get('lot_o_dispense', {a: 2, b: 3})).body;
        assert.strictEqual(d.year, 1876); assert.strictEqual(d.kin.canon, 3); assert.strictEqual(d.kin.civil, 5); assert.strictEqual(d.kin.f, 0.03125);
        assert.deepStrictEqual(d.kin.anc.map(x => x.name), ['Léonard MAZAUD', 'Jeanne LACOMBE']);
        assert.deepStrictEqual(d.kin.pb.map(x => x.name), ['Léonard MAZAUD', 'Catherine MAZAUD', 'Jacques DURAND', 'Marie DURAND']);
        assert.deepStrictEqual((await get('lot_o_dispense', {a: 1, b: 31})).body, {hidden: true}, 'jamais pour une famille vivante');
        assert.strictEqual((await get('lot_o_dispense', {a: 2, b: 2})).status, 422);
    });
    await t('serveur : 🤰 avec tact (des parts par époque ; les couples seulement sur demande) ; 🕯 orphelins et posthumes ; 💔 ; 🎯 ; 💍', async () => {
        const p0 = (await get('lot_o_arbre', {card: 'prenup'})).body; assert.strictEqual(p0.couples, null); assert.ok(!/MAZAUD|DURAND/.test(JSON.stringify(p0)));
        assert.deepStrictEqual(p0.eras.map(e => [e.label, e.n, e.k]), [['1750-1799', 1, 0], ['1850-1899', 3, 1]]);
        const p1 = (await get('lot_o_arbre', {card: 'prenup', names: 1})).body; assert.deepStrictEqual(p1.couples.map(c => [c.a, c.b]), [['Jean MAZAUD', 'Marie DURAND']]);
        const o = (await get('lot_o_arbre', {card: 'orphans'})).body;
        assert.strictEqual(o.nposthumous, 1); assert.strictEqual(o.posthumous[0].name, 'Paul MAZAUD'); assert.strictEqual(o.remarried, 2);
        const w = (await get('lot_o_arbre', {card: 'widow'})).body; assert.deepStrictEqual([w.h.length, w.f.length], [0, 1]);
        const g = (await get('lot_o_arbre', {card: 'gravity'})).body; assert.strictEqual(g.gens[0].near, 'Tulle');
        const r = (await get('lot_o_arbre', {card: 'radius'})).body; assert.strictEqual(r.rows.length, 6); assert.strictEqual(Math.round(Math.max(...r.rows.map(x => x.km))), 477);
        for (const c of ['tempsclos', 'dispense', 'prenup', 'gravity', 'radius', 'widow', 'godname', 'orphans', 'land', 'signatures']) assert.ok(!LIVING.test(JSON.stringify((await get('lot_o_arbre', {card: c, names: 1})).body)), `${c} : aucune fiche vivante`);
    });
    await t('serveur : 🌾 la lignée a quitté la terre avec Louis, cheminot ; ✍️ la chaîne (ne savait pas signer → a signé en 1876)', async () => {
        const l = (await get('lot_o_arbre', {card: 'land'})).body;
        assert.strictEqual(l.lines[0].surname, 'MAZAUD'); assert.strictEqual(l.lines[0].left.name, 'Louis MAZAUD'); assert.strictEqual(l.lines[0].left.job, 'Cheminot');
        assert.ok(l.gens.length >= 3 && l.gens.every(x => x.roman));
        const s = (await get('lot_o_arbre', {card: 'signatures'})).body;
        assert.deepStrictEqual(s.chain.map(x => [x.name, x.year, x.signed]), [['Léonard MAZAUD', 1788, 0], ['Pierre MAZAUD', 1850, 0], ['Jean MAZAUD', 1876, 1], ['Louis MAZAUD', 1905, null]]);
    });
    await t('serveur : la fiche — orphelin à 4 ans, canton, dispense ; posthume ; quitter la terre ; rien pour une fiche vivante ; erreurs', async () => {
        const j = (await get('lot_o_person', {id: 2})).body;
        assert.deepStrictEqual(j.parents, [{who: 'father', age: 4, year: 1856}]); assert.strictEqual(j.canton.place, 'Seilhac'); assert.ok(j.canton.canton);
        assert.deepStrictEqual(j.marriages.map(m => [m.spouse.name, m.canon, m.year]), [['Marie DURAND', 3, 1876]]);
        assert.strictEqual((await get('lot_o_person', {id: 13})).body.parents[0].posthumous, true);
        const l = (await get('lot_o_person', {id: 1})).body; assert.strictEqual(l.land.father_job, 'Laboureur'); assert.ok(!LIVING.test(JSON.stringify(l)));
        assert.deepStrictEqual((await get('lot_o_person', {id: 30})).body, {ok: false});
        assert.strictEqual((await get('lot_o_arbre', {card: 'nope'})).status, 422); assert.strictEqual((await get('lot_o_arbre', {card: 'tempsclos', dg_pop: 'zz'})).status, 422);
        assert.strictEqual((await get('lot_o_arbre', {card: 'prenup', limit: 'x'})).status, 422);
        const r = await fetch(base + 'api.php?action=lot_o_zzz'); assert.match((await r.json()).error, /Action inconnue/);
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
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.lotO && window.LCNDA_EXT?.lotOCore, null, {timeout: 60000});
        const openPage = async () => { await p.evaluate(() => window.LCNDA_EXT.lotO.open()); await p.waitForSelector('[data-lo-page] [data-lo-card="tempsclos"] .lo-lead', {timeout: 20000}); await p.waitForFunction(() => !document.querySelector('[data-lo-page] .ui-spinner, [data-lo-page] .loading-block'), null, {timeout: 20000}).catch(() => {}); await sleep(300); };
        const text = sel => p.$eval(sel, el => el.textContent.replace(/\s+/g, ' ').trim());

        await t('écran : Listes → 🌳 Ce que dit l’arbre (dans 👥 Personnes et familles) : 11 cartes, une phrase d’abord, pas de nom vivant', async () => {
            const inGroup = await p.evaluate(() => (window.LCNDA_EXT.listGroupDefaults || []).find(g => g[0] === 'g_people')[3].includes('arbre_dit') && window.LCNDA_APP.defaultListTypes.some(r => r[0] === 'arbre_dit'));
            assert.ok(inGroup);
            await openPage();
            assert.strictEqual(await p.$$eval('[data-lo-card]', a => a.length), 11);
            assert.match(await text('[data-lo-card="tempsclos"] .lo-lead'), /6 mariages datés au jour : 3 tombent pendant l’Avent ou le Carême/);
            assert.match(await text('[data-lo-card="dispense"] .lo-lead'), /cousins « issus de germain ».*3ᵉ degré pour l’Église, 5ᵉ pour la loi civile en 1876.*Il fallait une dispense/);
            assert.ok(await p.$('[data-lo-card="dispense"] .lo-verdict'));
            assert.match(await text('[data-lo-card="land"] .lo-lead'), /Ta lignée MAZAUD a quitté la terre à la génération I.*Louis MAZAUD, devenu cheminot/);
            assert.match(await text('[data-lo-card="orphans"] .lo-lead'), /1 enfant est né après la mort de son père, et 3 ont perdu un parent avant 10 ans/);
            assert.match(await text('[data-lo-card="signatures"] .lo-lead'), /la première signature arrive en 1876/);
            const all = await text('[data-lo-page]'); assert.ok(!LIVING.test(all), 'aucune fiche vivante nommée');
            assert.ok(await p.$('[data-lo-card="tempsclos"] a[href^="https://fr.wikisource.org/"][target="_blank"]'), 'source ↗');
            assert.ok(await p.$('[data-lo-card="widow"] [data-lo-diag="vieveuvage"]'), 'le diagramme existant');
            if (SHOT) { fs.mkdirSync(SHOT, {recursive: true}); await p.screenshot({path: path.join(SHOT, 'page.png'), fullPage: true}); for (const el of await p.$$('[data-lo-card]')) { await el.scrollIntoViewIfNeeded(); await el.screenshot({path: path.join(SHOT, `carte-${await el.getAttribute('data-lo-card')}.png`)}); } }
        });
        await t('écran : 🤰 avec tact — aucun nom au départ ; « Montrer les couples » dans ⚙️ les montre ; ↶ Comme avant + ↶ Annuler', async () => {
            const card = '[data-lo-card="prenup"]';
            assert.ok(!/MAZAUD|DURAND/.test(await text(card)), 'pas de nom au départ');
            assert.match(await text(card), /🤍/);
            await p.click(`${card} .lo-perso > summary`); await p.click(`${card} .lo-pgrp[data-lo-part="0"] > summary`);
            await p.check(`${card} [data-lo-set="names"]`, {force: true});
            await p.waitForSelector(`${card} .lo-more`); await p.click(`${card} .lo-more > summary`);
            assert.match(await text(card), /Jean MAZAUD × Marie DURAND/);
            assert.ok(await p.$(`${card} .lo-perso[open] .lo-pgrp[data-lo-part="0"][open]`), 'la partie reste ouverte après le calcul');
            assert.deepStrictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-arbre-dit'))), {prenup: {names: true}});
            await p.click(`${card} [data-lo-reset="names"]`); await sleep(400);
            assert.strictEqual(await p.evaluate(() => localStorage.getItem('genealogie-arbre-dit')), null);
            await p.waitForSelector('.toast, [role="status"]', {timeout: 3000}).catch(() => {});
            assert.ok(!/Jean MAZAUD × Marie DURAND/.test(await text(card)));
        });
        await t('écran : ⚙️ Personnaliser — une seule partie ouverte à la fois, au plus 3 parties par carte', async () => {
            const card = '[data-lo-card="tempsclos"]';
            assert.ok(await p.$$eval('[data-lo-card] .lo-perso', a => a.every(d => d.querySelectorAll(':scope > details.lo-pgrp').length <= 3)));
            await p.click(`${card} .lo-perso > summary`);
            await p.click(`${card} .lo-pgrp[data-lo-part="0"] > summary`); await p.click(`${card} .lo-pgrp[data-lo-part="2"] > summary`); await sleep(100);
            assert.deepStrictEqual(await p.$$eval(`${card} .lo-pgrp`, a => a.map(d => d.open)), [false, false, true]);
            await p.click(`${card} [data-lo-seg="draw"][data-v="rose"]`);
            await p.waitForFunction(() => document.querySelector('[data-lo-card="tempsclos"] svg.lo-viz path.lo-bar'));
            assert.ok(await p.$(`${card} [data-lo-reset="draw"]`), '↶ Comme avant à côté du réglage changé');
            await p.click(`${card} [data-lo-reset="draw"]`);
            await p.waitForFunction(() => document.querySelector('[data-lo-card="tempsclos"] svg.lo-viz rect.lo-bar'));
        });
        await t('écran : 🔗 deux personnes au choix (liste de tous les couples apparentés) ; ⛪ jour chômé ; filtre « Déjà là »', async () => {
            await p.click('[data-lo-card="dispense"] .lo-perso > summary'); await p.click('[data-lo-card="dispense"] .lo-pgrp[data-lo-part="1"] > summary');
            await p.click('[data-lo-card="dispense"] [data-lo-all]'); await p.waitForSelector('[data-lo-card="dispense"] [data-lo-pair="2,3"]');
            await p.fill('[data-lo-card="chome"] [data-lo-date]', '1830-08-15'); await p.dispatchEvent('[data-lo-card="chome"] [data-lo-date]', 'change');
            assert.match(await text('[data-lo-card="chome"] [data-lo-answer]'), /dimanche 15 août 1830 était l’Assomption, jour chômé/);
            await p.click('[data-lo-filter="done"]');
            const shown = await p.$$eval('[data-lo-grid] [data-lo-card]', a => a.filter(x => !x.hidden).map(x => x.dataset.loCard));
            assert.deepStrictEqual(shown, ['prenup', 'gravity', 'widow', 'godname']);
            await p.click('[data-lo-filter="all"]');
        });
        await t('écran : thème sombre (les barres changent de couleur) et écran de téléphone (390 px, rien ne déborde)', async () => {
            const fill = () => p.$eval('[data-lo-card="tempsclos"]', el => [getComputedStyle(el.querySelector('rect.lo-zone')).fill, getComputedStyle(el.querySelector('svg.lo-viz text')).fill].join(' '));
            const light = (await fill()).split(' rgb');
            const theme = async preset => { await p.evaluate(x => { if (x) localStorage.setItem('genealogie-design', JSON.stringify({preset: x})); else localStorage.removeItem('genealogie-design'); }, preset); await p.reload(); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.lotO, null, {timeout: 60000}); await openPage(); };
            await theme('dark'); assert.strictEqual(await p.evaluate(() => document.documentElement.dataset.theme), 'dark');
            const dark = (await fill()).split(' rgb');
            light.forEach((v, i) => assert.notStrictEqual(v, dark[i], `couleur ${i} : ${v}`));
            if (SHOT) await p.screenshot({path: path.join(SHOT, 'page-sombre.png'), fullPage: true});
            await theme('');
            await p.setViewportSize({width: 390, height: 844}); await sleep(400);
            const over = await p.evaluate(() => [...document.querySelectorAll('[data-lo-page] .lo-card')].filter(c => !c.hidden && c.getBoundingClientRect().right > window.innerWidth + 1).map(c => c.dataset.loCard));
            assert.deepStrictEqual(over, []);
            if (SHOT) await p.screenshot({path: path.join(SHOT, 'page-telephone.png'), fullPage: false});
            await p.setViewportSize({width: 1440, height: 900});
        });
        await t('fiche : une phrase dans les blocs qui existent — 👪 orphelin à 4 ans, ⚖️ dispense + conseil de famille, pas de nouveau bloc', async () => {
            const blocks0 = await p.evaluate(async () => { const A = window.LCNDA_APP; A.state.currentPersonId = 2; await A.setModule('personnes'); return document.querySelectorAll('#workspace .person-page section.card').length; });
            await p.waitForSelector('.pa-family-bar [data-lo-line="fam"]', {timeout: 20000});
            assert.match(await text('.pa-family-bar [data-lo-line="fam"]'), /Il avait 4 ans quand son père est mort/);
            const hasRules = await p.$('[data-l10r-person="2"]');
            if (hasRules) {
                await p.waitForSelector('[data-l10r-person="2"] [data-lo-line="dispense"]', {timeout: 20000});
                assert.match(await text('[data-l10r-person="2"] [data-lo-line="dispense"]'), /Marie DURAND et lui étaient parents au 3ᵉ degré pour l’Église : dispense nécessaire en 1876/);
                assert.match(await text('[data-l10r-person="2"] [data-lo-line="paix"]'), /conseil de famille, chez le juge de paix du canton/);
            }
            await sleep(500);
            assert.strictEqual(await p.$$eval('#workspace .person-page section.card', a => a.length), blocks0, 'aucun bloc en plus');
            assert.strictEqual(await p.$$eval('[data-lo-line="fam"]', a => a.length), 1, 'une seule phrase');
            if (SHOT) { for (const [nm, sel] of [['famille', '.pa-family-bar'], ['regles', 'section.card:has([data-l10r-person])']]) { const el = await p.$(sel); if (el) { await el.scrollIntoViewIfNeeded(); await el.screenshot({path: path.join(SHOT, `fiche-${nm}.png`)}); } } }
            await p.evaluate(async () => { const A = window.LCNDA_APP; A.state.currentPersonId = 13; await A.setModule('personnes'); });
            await p.waitForSelector('.pa-family-bar [data-lo-line="fam"]', {timeout: 20000});
            assert.match(await text('.pa-family-bar [data-lo-line="fam"]'), /Il est né 7 mois après la mort de son père/);
            await p.evaluate(async () => { const A = window.LCNDA_APP; A.state.currentPersonId = 30; await A.setModule('personnes'); }); await sleep(1200);
            assert.strictEqual(await p.$('[data-lo-line]'), null, 'rien sur la fiche d’une personne vivante');
        });
        await t('⌘K et 🧭 Je veux… : « mariages careme » mène à la carte ; les intentions sont enregistrées', async () => {
            const qs = await p.evaluate(() => window.LCNDA_EXT.quickSearchProviders.flatMap(f => { try { return f('mariages careme') || []; } catch (_) { return []; } }).map(x => x.label));
            assert.ok(qs.some(l => /temps clos/.test(l)), qs.join(' | '));
            await p.evaluate(() => window.LCNDA_EXT.jeVeux?.load?.());
            const ids = await p.evaluate(() => (window.LCNDA_EXT.intents || []).map(i => i.id));
            for (const id of ['arbre_dit', 'mariages_careme', 'dispense_mariage', 'jour_chome']) assert.ok(ids.includes(id), id);
        });
        await t('rien ne sort de l’ordinateur ; aucune erreur JavaScript', () => {
            assert.deepStrictEqual(outside.filter(u => /lot_o|arbre/.test(u)), []);
            assert.deepStrictEqual(errs, []);
        });
    } finally { await browser.close().catch(() => {}); kill(); fs.rmSync(tmp, {recursive: true, force: true}); }
    console.log(fails ? `\n✗ ${fails} en échec` : '\n✓ tout passe');
    process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
