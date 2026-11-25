#!/usr/bin/env node
/* 🌘 Listes → Données → « Éclipses de soleil et de lune » (assets/js/heritage-eclipses-liste.js, calcul app-lune-core.js).
 *  1. le calcul (Node) : le catalogue de −999 à 2100 ; éclipses connues — 11 août 1999 (totale, vue totale à Reims, ~99 % à Paris),
 *     15 février 1961 (totale, vue totale à Nice), 20 mars 2015 (totale ailleurs, partielle à Paris : 78 % du Soleil caché,
 *     chiffre de l'Observatoire de Paris), 27 juillet 2018 (totale de Lune, 1 h 43, vue de Paris), 28 mai 585 av. J.-C. (Thalès) ;
 *     la période, « vue de ce lieu », la recherche, le tri, les liens NASA ;
 *  2. l'écran (Playwright, base temporaire de tests/test-rien-de-colle.js : Jean MAZAUD, né à Tulle en 1950, à Paris en 1975) :
 *     la liste dans Listes, 📅 Période, 📍 Autour de… (préréglé), ⤓ Exporter (CSV), 🧰 « Les éclipses qu'il a pu voir »,
 *     « Les éclipses d'une année », largeur de téléphone (390 px, rien ne déborde de la page).
 *   node tests/test-liste-eclipses.js */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 8).join('\n  ')); } };
const near = (v, want, tol, what) => assert.ok(Math.abs(v - want) <= tol, `${what} : ${v} (attendu ${want} ± ${tol})`);
const PARIS = {lat: 48.8566, lon: 2.3522, km: 20, title: 'Paris', country: 'France'}, REIMS = {lat: 49.258, lon: 4.031, km: 20, title: 'Reims', country: 'France'}, NICE = {lat: 43.703, lon: 7.266, km: 20, title: 'Nice', country: 'France'};

(async () => {
    /* ═════════ 1. le calcul, dans Node ═════════ */
    const win = {LCNDA_EXT: {}, LCNDA_LUNE: require(path.join(root, 'assets/js/app-lune-core.js'))};
    global.window = win; global.document = {addEventListener() {}};
    require(path.join(root, 'assets/js/heritage-eclipses-liste.js'));
    const E = win.LCNDA_EXT.eclipsesListe, reg = win.LCNDA_EXT.dataLists.find(d => d.id === 'eclipses');
    const one = async (id, q = {}) => { const y = Number(id.match(/^[sl](-?\d+)/)[1]); return (await E.query({...q, years: {from: y, to: y, mode: 'in'}, limit: 50})).rows.find(r => r.id === id); };

    await t('calcul : la liste est enregistrée (champs, période, autour de, carte, lien NASA) et couvre de −999 (1000 av. J.-C.) à 2100', async () => {
        assert.ok(reg && reg.query && reg.period && reg.geo && reg.fields.some(f => f.key === 'nasa' && f.type === 'url'));
        const c = E.catalogue();
        assert.ok(c.length > 14000, `${c.length} éclipses`);
        assert.strictEqual(c[0].year, -999); assert.strictEqual(c[c.length - 1].year, 2100);
        assert.ok(c.every((r, i) => !i || c[i - 1]._jd <= r._jd), 'dans l’ordre');
        const s = c.filter(r => r.body === 'Soleil').length, l = c.length - s;
        near(s / 3100, 2.38, 0.1, 'éclipses de Soleil par an'); near(l / 3100, 2.4, 0.15, 'éclipses de Lune par an');
    });
    await t('calcul : 11 août 1999 — totale, 2 min environ au plus fort (Europe), vue totale à Reims vers 12 h 2x, 99 % à Paris', async () => {
        const r = await one('s1999-08-11');
        assert.strictEqual(r.date, '11 août 1999'); assert.strictEqual(r.body, 'Soleil'); assert.strictEqual(r.type, 'totale');
        assert.match(r.totality, /^2 min \d\d s$/); assert.match(r.region, /Europe/); near(r._lat, 45.1, 1.5, 'latitude du plus fort'); near(r._lon, 24.3, 2, 'longitude du plus fort');
        assert.ok(r.mag > 1 && r.mag < 1.04, `grandeur ${r.mag}`);
        assert.strictEqual(r.nasa, 'https://eclipse.gsfc.nasa.gov/SEsearch/SEsearchmap.php?Ecl=19990811');
        const reims = await one('s1999-08-11', {near: REIMS});
        assert.strictEqual(reims.pct, 100); assert.match(reims.local, /^12 h 2\d$/);
        const paris = await one('s1999-08-11', {near: PARIS});
        near(paris.pct, 99, 1, '% caché à Paris'); assert.ok(paris._seenType === 'partial');
    });
    await t('calcul : 15 février 1961 — totale, vue totale à Nice (le matin), partielle à Paris', async () => {
        const r = await one('s1961-02-15'); assert.strictEqual(r.type, 'totale');
        const nice = await one('s1961-02-15', {near: NICE}); assert.strictEqual(nice._seenType, 'total'); assert.match(nice.local, /^8 h \d\d$/);
        const paris = await one('s1961-02-15', {near: PARIS}); assert.strictEqual(paris._seenType, 'partial'); assert.ok(paris.pct > 85 && paris.pct < 100, paris.pct);
    });
    await t('calcul : 20 mars 2015 — totale (îles Féroé, Svalbard), partielle à Paris : ~78 % caché vers 10 h 29', async () => {
        const r = await one('s2015-03-20'); assert.strictEqual(r.type, 'totale'); near(r._lat, 64.4, 2, 'latitude du plus fort'); near(r._lon, -6.6, 3, 'longitude du plus fort');
        const p = await one('s2015-03-20', {near: PARIS});
        assert.strictEqual(p._seenType, 'partial'); near(p.pct, 78, 3, '% caché à Paris (Observatoire de Paris : 78 %)'); assert.match(p.local, /^10 h (2[6-9]|3[0-2])$/);
    });
    await t('calcul : 27 juillet 2018 — éclipse totale de Lune, 1 h 43 de totalité, vue de Paris au lever de la Lune', async () => {
        const r = await one('l2018-07-27');
        assert.strictEqual(r.body, 'Lune'); assert.strictEqual(r.type, 'totale'); assert.match(r.totality, /^1 h 4[23] min$/); near(r.mag, 1.609, 0.01, 'grandeur');
        assert.match(r.nasa, /^https:\/\/eclipse\.gsfc\.nasa\.gov\/LEcat5\/LE2001-2100\.html$/);
        const p = await one('l2018-07-27', {near: PARIS}); assert.strictEqual(p._seenType, 'total'); assert.strictEqual(p.pct, 100); assert.match(p.local, /^2[12] h \d\d$/);
    });
    await t('calcul : 28 mai 585 av. J.-C. (l’éclipse de Thalès) — totale, lien NASA en année astronomique', async () => {
        const r = E.catalogue().find(x => x.year === -584 && x.body === 'Soleil' && /mai/.test(x.date));
        assert.ok(r, 'trouvée'); assert.strictEqual(r.date, '28 mai 585 av. J.-C.'); assert.strictEqual(r.type, 'totale');
        assert.strictEqual(r.nasa, 'https://eclipse.gsfc.nasa.gov/SEsearch/SEsearchmap.php?Ecl=-05840528');
    });
    await t('calcul : période, recherche, filtres, tri, pages (offset / limit)', async () => {
        const y99 = await E.query({years: {from: 1999, to: 1999, mode: 'in'}});
        assert.deepStrictEqual(y99.rows.map(r => r.date), ['31 janvier 1999', '16 février 1999', '28 juillet 1999', '11 août 1999']);
        const xx = await E.query({years: {from: 1901, to: 2000, mode: 'within'}, filters: [{key: 'body', op: 'in', value: ['Soleil']}, {key: 'type', op: 'in', value: ['totale']}], limit: 1000});
        assert.ok(xx.total > 60 && xx.total < 80, `${xx.total} totales de Soleil au XXe siècle`); assert.ok(xx.rows.every(r => r.year >= 1901 && r.year <= 2000 && r.type === 'totale'));
        const q = await E.query({q: 'août 1999'}); assert.ok(q.rows.some(r => r.id === 's1999-08-11'));
        const longest = await E.query({years: {from: 1901, to: 2000, mode: 'within'}, filters: [{key: 'body', op: 'in', value: ['Lune']}], sort: 'totality', dir: 'desc', limit: 1});
        assert.ok(longest.rows[0]._tot > 100 * 60, longest.rows[0].totality);
        const p1 = await E.query({years: {from: 1800, to: 1900, mode: 'overlap'}, offset: 0, limit: 10}), p2 = await E.query({years: {from: 1800, to: 1900, mode: 'overlap'}, offset: 10, limit: 10});
        assert.strictEqual(p1.total, p2.total); assert.ok(p1.rows[9]._jd < p2.rows[0]._jd);
    });
    await t('calcul : « vue de ce lieu » (Autour de…) garde seulement les éclipses visibles de là, avec l’heure et la part cachée', async () => {
        const all = await E.query({years: {from: 2000, to: 2030, mode: 'overlap'}, limit: 500}), here = await E.query({near: PARIS, years: {from: 2000, to: 2030, mode: 'overlap'}, limit: 500});
        assert.ok(here.total > 10 && here.total < all.total, `${here.total} / ${all.total}`);
        assert.ok(here.rows.every(r => r.seen && r.local && r.pct != null && r._km >= 0));
        assert.ok(all.rows.some(r => r.id === 's2023-04-20') && !here.rows.some(r => r.id === 's2023-04-20'), 'l’éclipse hybride australienne de 2023 ne se voyait pas de Paris');
        const us = here.rows.find(r => r.id === 's2017-08-21'); assert.ok(us && us.pct < 10 && us.pct > 0, 'la grande éclipse américaine de 2017 : à peine, au coucher du soleil');
        assert.strictEqual(all.rows.find(r => r.id === 's2023-04-20').type, 'hybride');
        const big = await E.query({near: PARIS, years: {from: 2000, to: 2030, mode: 'overlap'}, filters: [{key: 'pct', op: 'gte', value: 90}], limit: 500});
        assert.ok(big.total > 0 && big.rows.every(r => r.pct >= 90));
    });

    /* ═════════ 2. l'écran ═════════ */
    delete global.window; delete global.document;
    const G = require('./test-rien-de-colle.js');
    const {ID, base, browser, stop} = await G.start();
    try {
        for (const w of [1440, 390]) {
            const p = await G.newPage(browser, base, {width: w});
            await p.waitForFunction(() => window.LCNDA_EXT?.dataListsEngine && window.LCNDA_APP.defaultListTypes.some(x => x[0] === 'data_eclipses'), null, {timeout: 20000});
            const count = () => p.textContent('[data-ld-count]');
            const waitCount = async re => { await p.waitForFunction(s => new RegExp(s).test(document.querySelector('[data-ld-count]')?.textContent || ''), re.source, {timeout: 60000}); return count(); };
            await t(`écran ${w} px : Listes → 🌘 Éclipses de soleil et de lune — période 1999 : 4 lignes, avec le lien NASA`, async () => {
                await p.evaluate(() => window.LCNDA_EXT.dataListsEngine.open('eclipses', {period: {mode: 'in', from: 1999, to: 1999}}));
                await waitCount(/^4 lignes$/);
                const rows = await p.$$eval('.ld-table tbody tr', trs => trs.map(tr => tr.textContent));
                assert.ok(rows.some(r => /11 août 1999.*Soleil.*totale/.test(r)), rows.join('\n'));
                assert.ok(await p.$('.ld-table a[href*="SEsearchmap.php?Ecl=19990811"]'));
                assert.match(await p.textContent('.ld-source'), /NASA/);
                assert.ok(await p.$('[data-ld-near]') && await p.$('[data-ld-period]') && await p.$('[data-ld-view="map"]'));
            });
            await t(`écran ${w} px : 📍 autour de Paris, 2015 — l’éclipse du 20 mars « vue du lieu choisi », 78 %`, async () => {
                await p.evaluate(() => window.LCNDA_EXT.dataListsEngine.open('eclipses', {period: {mode: 'in', from: 2015, to: 2015}, near: {lat: 48.8566, lon: 2.3522, km: 20, title: 'Paris'}}));
                await waitCount(/^\d+ lignes?$/);
                const rows = await p.$$eval('.ld-table tbody tr', trs => trs.map(tr => tr.textContent));
                const r = rows.find(x => /20 mars 2015/.test(x)); assert.ok(r, rows.join('\n'));
                assert.match(r, /Éclipse de soleil : 7[5-9] % du soleil caché à 10 h \d\d/);
                assert.match(await p.textContent('[data-ld-chips]'), /Paris/);
            });
            await t(`écran ${w} px : ⤓ Exporter (CSV) — les lignes trouvées, avec la date, le type et le lien`, async () => {
                await p.evaluate(() => window.LCNDA_EXT.dataListsEngine.open('eclipses', {period: {mode: 'in', from: 1999, to: 1999}}));
                await waitCount(/^4 lignes$/);
                let csv = '';
                await p.exposeFunction('__eclCsv' + w, async txt => { csv = txt; }).catch(() => {});
                await p.evaluate(fn => { const orig = URL.createObjectURL; URL.createObjectURL = b => { b.text().then(window[fn]); return orig.call(URL, b); }; }, '__eclCsv' + w);
                await p.click('[data-ld-export]');
                await p.waitForFunction(() => true); for (let i = 0; i < 50 && !csv; i++) await new Promise(r => setTimeout(r, 100));
                assert.match(csv, /11 août 1999;Soleil;totale/); assert.match(csv, /SEsearchmap\.php\?Ecl=19990811/); assert.strictEqual(csv.trim().split(/\r\n/).length, 5);
            });
            if (w === 390) await t('écran 390 px : la page ne déborde pas de côté (le tableau défile dans son cadre)', async () => {
                const o = await p.evaluate(() => ({doc: document.documentElement.scrollWidth, ws: document.querySelector('#workspace').scrollWidth - document.querySelector('#workspace').clientWidth, wrap: getComputedStyle(document.querySelector('.ld-table-wrap')).overflowX}));
                assert.ok(o.doc <= 391, JSON.stringify(o)); assert.match(o.wrap, /auto|scroll/);
            });
            if (w === 1440) await t('🧰 Données : « Les éclipses qu’il a pu voir » (Jean MAZAUD, Tulle puis Paris) et « Les éclipses d’une année »', async () => {
                const html = await p.evaluate(async id => { const d = window.LCNDA_EXT.dataSources.find(x => x.id === 'eclipses-vues'), host = document.createElement('div'); await d.run({person: {id}}, host); return host.innerHTML; }, ID.jean);
                assert.match(html, /11 août 1999/); assert.match(html, /Paris/); assert.match(html, /data-ecl-open/);
                const y = await p.evaluate(async () => { const d = window.LCNDA_EXT.dataSources.find(x => x.id === 'eclipses-annee'), host = document.createElement('div'); await d.run({year: 2018}, host); return host.textContent; });
                assert.match(y, /27 juillet 2018/); assert.match(y, /Lune, totale \(1 h 4\d min\)/);
            });
            assert.deepStrictEqual(p.errs, []);
            await p.context().close();
        }
    } finally { await stop(); }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
