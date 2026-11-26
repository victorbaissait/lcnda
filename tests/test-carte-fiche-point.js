#!/usr/bin/env node
/* 🗺 La fiche d'un point de carte, sans quitter la carte (assets/js/app-carte-fiche.js, branchée par le moteur des listes de données
 *   app-listes-donnees.js : onglet 📊 Données, Listes, listes réunies ; et la vue carte d'un bloc Données d'une Fiche).
 *  Une liste d'essai FABRIQUÉE (séismes inventés ; personnes inventées MAZAUD, LACOMBE, DURAND) :
 *  - au survol : le titre ET la date (plus seulement la date) ;
 *  - un clic sur un point : une fiche accrochée au point (titre, lignes, ↗ source), rien demandé à Internet ; la carte reste ;
 *  - 📎 Insérer (le menu « à l'endroit du curseur ») et 🧺 Au panier (une ligne de plus, ↶ Annuler) ;
 *  - ☰ Voir la ligne : le tableau, la ligne en couleur ; « 🗺 Revenir à la carte » : même cadrage, la fiche rouverte ;
 *  - une pastille : la liste de l'endroit (10, puis « + N autres »), chaque ligne s'ouvre en fiche, ← revient à la liste ;
 *    des points posés les uns sur les autres (zoom fort, sans pastilles) : la même liste ;
 *  - 📌 Garder ouvert : un panneau à droite dans la carte, qui suit les points cliqués ; retenu (« genealogie-carte-fiche ») ;
 *  - clavier : Entrée sur un point ouvre, Échap ferme (le focus revient au point) ;
 *  - 👪 Dans la famille : une personne vivante apparaît hors consultation, JAMAIS une fiche confidentielle ; en consultation (vrai mode,
 *    côté serveur) : pas les vivants non plus, et 📎 🧺 éteints avec la raison ;
 *  - 390 px en sombre : une feuille en bas, dans le cadre de la carte, sans toucher les bords ; aucune erreur.
 * Base : tests/prendre-depuis-seed.js.   node tests/test-carte-fiche-point.js */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {spawnSync} = require('child_process');
const {start, sleep} = require('./prendre-depuis-seed.js');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 8).join('\n  ')); } };

/* la liste d'essai : un séisme seul à Nice, une secousse à Treignac (en 2000), 14 répliques au même endroit (Tulle), 24 autres autour */
const LIST = () => {
    const rows = [{name: 'Séisme de Nice', date: '1887-02-23', place: 'Nice', mag: 6.5, url: 'https://example.org/seisme/nice', lat: 43.70, lon: 7.26},
        {name: 'Secousse de Treignac', date: '2000-05-01', place: 'Treignac', mag: 3.1, url: '', lat: 45.5367, lon: 1.7958}];
    for (let k = 1; k <= 14; k++) rows.push({name: `Réplique de Tulle n° ${k}`, date: `1900-01-${String(k).padStart(2, '0')}`, place: 'Tulle', mag: 2 + k / 10, url: '', lat: 45.2675, lon: 1.7711});
    for (let k = 1; k <= 24; k++) rows.push({name: `Secousse du plateau n° ${k}`, date: `19${10 + k}-06-01`, place: 'Plateau', mag: 2.5, url: '', lat: 44.6 + (k % 6) * 0.12, lon: 0.6 + (k % 4) * 0.25});
    window.LCNDA_EXT.dataLists.push({id: 'test_cf', icon: '🧪', label: 'Essai carte fiche', group: 'Le monde', theme: 'seismes', source: 'Jeu d’essai', sourceUrl: 'https://example.org/essai',
        load: async () => rows, fields: [{key: 'name', label: 'Nom', type: 'text'}, {key: 'date', label: 'Date', type: 'date'}, {key: 'place', label: 'Lieu', type: 'place'}, {key: 'mag', label: 'Magnitude', type: 'number'}, {key: 'url', label: 'Fiche', type: 'url'}],
        period: r => [Number(r.date.slice(0, 4)), Number(r.date.slice(0, 4))], geo: r => [r.lat, r.lon], familyColumn: true, familyKm: 20});
};

(async () => {
    const B = await start();
    const p = B.page;
    const db = path.join(B.tmp, 'genealogy.sqlite');
    // 👪 une personne vivante et une fiche confidentielle, nées à Treignac (lieu 1)
    const py = spawnSync('python3', ['-c', `
import sqlite3, sys
c = sqlite3.connect(sys.argv[1]); b = c.execute("SELECT id FROM event_types WHERE gedcom_tag='BIRT' LIMIT 1").fetchone()[0]
c.execute("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_private) VALUES(901,'Lucie','DURAND','female','living',0)")
c.execute("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_private) VALUES(902,'Paul','LACOMBE','male','living',1)")
for pid, y in ((901, 1990), (902, 1985)):
    c.execute("INSERT INTO events(scope,person_id,event_type_id,date_text,year,sort_date,place_id) VALUES('person',?,?,?,?,?,1)", (pid, b, str(y), y, '%d-03-01' % y))
c.commit()`, db], {encoding: 'utf8'});
    assert.strictEqual(py.status, 0, py.stderr);
    const extReq = [];
    p.on('request', r => { if (!/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(r.url()) && !/^(data|blob):/.test(r.url())) extReq.push(r.url()); });
    const card = '.ld-results .cf-card';
    const idxOf = name => p.evaluate(n => { const g = [...document.querySelectorAll('.ld-results .h-map-point[data-cf-i]')].find(x => x.querySelector('title')?.textContent.startsWith(n)); return g ? Number(g.dataset.cfI) : -1; }, name);
    const pt = i => `.ld-results .h-map-point[data-cf-i="${i}"]`;
    /** la fiche touche presque son point (à moins de 30 px) sans le couvrir */
    const near = (c, g) => { const x = g.x + g.width / 2, y = g.y + g.height / 2, inside = x > c.x && x < c.x + c.width && y > c.y && y < c.y + c.height;
        const dx = Math.max(c.x - x, 0, x - (c.x + c.width)), dy = Math.max(c.y - y, 0, y - (c.y + c.height)); return !inside && Math.hypot(dx, dy) < 30; };
    const ctlView = () => p.evaluate(() => window.LCNDA_EXT.miniMapOf(document.querySelector('.ld-results')).getView());
    const setView = (lat, lon, z) => p.evaluate(([a, b, c]) => window.LCNDA_EXT.miniMapOf(document.querySelector('.ld-results')).setView(a, b, c, true), [lat, lon, z]);
    const openMap = async () => {
        await p.evaluate(() => { const A = window.LCNDA_APP; A.state.listType = 'data_test_cf'; A.setModule('listes'); });
        await p.waitForSelector('[data-ld-page="test_cf"] [data-ld-view="map"]', {timeout: 30000});
        if (!(await p.$('.ld-results [data-mm-ready], .ld-results .h-map-point[data-cf-i]'))) await p.click('[data-ld-view="map"]');
        await p.waitForSelector('.ld-results .h-map-point[data-cf-i]', {timeout: 30000}); await sleep(400);
    };
    try {
        await p.evaluate(() => { try { localStorage.removeItem('genealogie-carte-fiche'); } catch (_) {} });
        await p.evaluate(LIST); await sleep(300);
        await openMap();
        const nice = await idxOf('Séisme de Nice');
        await t('au survol : le titre et la date (plus seulement la date) ; les points se prennent au clavier', async () => {
            assert.ok(nice >= 0, 'le point de Nice');
            await p.hover(pt(nice)); await sleep(200);
            assert.strictEqual((await p.textContent('.ld-results .mm-tip')).trim(), 'Séisme de Nice · 1887-02-23');
            assert.deepStrictEqual(await p.$eval(pt(nice), g => [g.getAttribute('tabindex'), g.getAttribute('role'), g.getAttribute('aria-label')]), ['0', 'button', 'Voir la fiche : Séisme de Nice · 1887-02-23']);
        });
        await t('un clic sur un point : la fiche accrochée au point (titre, lignes, ↗ source) ; la carte reste ; rien demandé à Internet', async () => {
            extReq.length = 0;
            await p.click(pt(nice)); await p.waitForSelector(card);
            await p.waitForFunction(() => !document.querySelector('.ld-results .cf-card [data-cf-fam]'), null, {timeout: 20000}); // 👪 personne près de Nice : la ligne s'en va
            assert.ok(await p.$('.ld-results .h-map-point'), 'toujours la carte');
            assert.strictEqual((await p.textContent(`${card} .cf-title`)).trim(), 'Séisme de Nice');
            const lines = await p.$$eval(`${card} .cf-lines > div`, a => a.map(x => [x.querySelector('dt').textContent, x.querySelector('dd').textContent]));
            assert.deepStrictEqual(lines, [['Date', '1887-02-23'], ['Lieu', 'Nice'], ['Magnitude', '6,5']]);
            assert.strictEqual(await p.getAttribute(`${card} .cf-src a`, 'href'), 'https://example.org/seisme/nice');
            assert.match(await p.textContent(`${card} .cf-src`), /Source : Jeu d’essai ↗/);
            assert.deepStrictEqual(await p.$$eval(`${card} .cf-acts button`, a => a.map(b => b.textContent.trim())), ['📎 Insérer', '🧺 Au panier', '☰ Voir la ligne', '🔍 Zoomer ici']);
            assert.ok(await p.$(`${card} [data-cf-x]`) && await p.$(`${card} [data-cf-pin]`));
            const [c, s, g] = await Promise.all([p.locator(card).boundingBox(), p.locator('.ld-results [data-mm]').boundingBox(), p.locator(pt(nice)).boundingBox()]);
            assert.ok(c.x >= s.x + 6 && c.x + c.width <= s.x + s.width - 6 && c.y >= s.y + 6 && c.y + c.height <= s.y + s.height - 6, 'dans le cadre de la carte, sans toucher les bords');
            assert.ok(near(c, g), 'à côté de son point, sans le cacher ' + JSON.stringify([c, g]));
            assert.ok(!(await p.$eval(card, x => x.classList.contains('cf-panel') || x.classList.contains('cf-sheet'))), 'une bulle');
            await sleep(300); assert.deepStrictEqual(extReq, [], 'rien demandé à Internet pour la fiche');
        });
        await t('la fiche suit son point quand la carte bouge ; 🔍 Zoomer ici', async () => {
            const z0 = (await ctlView()).zoom;
            await p.click(`${card} [data-cf-zoom]`); await sleep(300);
            assert.ok((await ctlView()).zoom >= z0 + 2, 'zoomé'); assert.ok(await p.$(card), 'la fiche reste ouverte');
            const [c, g] = await Promise.all([p.locator(card).boundingBox(), p.locator(pt(nice)).boundingBox()]);
            assert.ok(near(c, g), 'toujours accrochée au point ' + JSON.stringify([c, g]));
            await p.evaluate(() => window.LCNDA_EXT.miniMapOf(document.querySelector('.ld-results')).fit()); await sleep(200);
        });
        await t('🧺 Au panier : une ligne de plus (↶ Annuler) ; 📎 Insérer : à l’endroit du curseur, avec sa source', async () => {
            const n = async () => ((await B.api('cx_basket', {})).items || []).length, before = await n();
            await p.click(`${card} [data-cf-act="bk"]`); if (await p.waitForSelector('.ui-actmenu-i', {timeout: 1500}).catch(() => null)) await p.click('.ui-actmenu-i >> nth=0');
            await p.waitForFunction(() => document.querySelector('.toast')?.textContent.includes('🧺'), null, {timeout: 10000});
            assert.strictEqual(await n(), before + 1);
            assert.match(JSON.stringify((await B.api('cx_basket', {})).items.slice(-1)[0]), /Séisme de Nice/);
            const u = p.locator('.toast button', {hasText: '↶'}).last(); await u.click(); await sleep(700); assert.strictEqual(await n(), before);
            await p.evaluate(() => { const a = document.createElement('textarea'); a.id = 'essai-note'; a.style.cssText = 'position:fixed;left:20px;bottom:20px;width:300px;height:80px;z-index:5'; a.value = 'Note : '; document.body.appendChild(a); a.focus(); a.setSelectionRange(7, 7); });
            if (!(await p.$(card))) await p.click(pt(nice));
            await p.click(`${card} [data-cf-act="ins"]`); await p.click('.ui-actmenu-i:has-text("endroit du curseur")'); await sleep(400);
            assert.match(await p.inputValue('#essai-note'), /^Note : Séisme de Nice — .*\[↗ Essai carte fiche — Jeu d’essai\]/);
            await p.evaluate(() => document.getElementById('essai-note').remove());
            assert.ok(await p.$(card), 'la fiche reste ouverte');
        });
        await t('☰ Voir la ligne : le tableau, la ligne en couleur ; « 🗺 Revenir à la carte » : même cadrage, la fiche rouverte', async () => {
            if (!(await p.$(card))) await p.click(pt(nice));
            await setView(44.5, 4.2, 6.4); await sleep(250); const v0 = await ctlView();
            await p.click(`${card} [data-cf-act="line"]`);
            await p.waitForSelector('.ld-table tr.ld-row-hl', {timeout: 15000});
            assert.match(await p.textContent('.ld-table tr.ld-row-hl'), /Séisme de Nice/);
            assert.strictEqual(await p.evaluate(() => document.activeElement?.closest('tr')?.classList.contains('ld-row-hl')), true, 'le focus sur la ligne');
            await p.click('[data-ld-back-map-go]'); await p.waitForSelector(card, {timeout: 15000});
            assert.strictEqual((await p.textContent(`${card} .cf-title`)).trim(), 'Séisme de Nice');
            const v1 = await ctlView();
            assert.ok(Math.abs(v1.zoom - v0.zoom) < 0.01 && Math.abs(v1.lat - v0.lat) < 0.01 && Math.abs(v1.lon - v0.lon) < 0.01, 'même cadrage : ' + JSON.stringify([v0, v1]));
            assert.ok(!(await p.$('[data-ld-back-map]')));
        });
        await t('Échap ferme la fiche (le focus revient au point) ; Entrée sur un point l’ouvre', async () => {
            await p.keyboard.press('Escape'); await sleep(100);
            assert.ok(!(await p.$(card)));
            assert.strictEqual(await p.evaluate(() => document.activeElement?.dataset?.cfI), String(nice), 'le focus sur le point');
            await p.keyboard.press('Enter'); await p.waitForSelector(card);
            assert.strictEqual((await p.textContent(`${card} .cf-title`)).trim(), 'Séisme de Nice');
            await p.click(`${card} [data-cf-x]`); assert.ok(!(await p.$(card)));
        });
        await t('une pastille : la liste de l’endroit (10 puis « + N autres »), chaque ligne en fiche, ← revient ; 🔍 sépare les points', async () => {
            await p.evaluate(() => window.LCNDA_EXT.miniMapOf(document.querySelector('.ld-results')).fit()); await sleep(250);
            const sel = await p.evaluate(() => { const cs = [...document.querySelectorAll('.ld-results .h-map-cluster')].filter(c => c.style.display !== 'none'); cs.sort((a, b) => Number(b.dataset.count) - Number(a.dataset.count)); return cs[0] ? {n: Number(cs[0].dataset.count), i: [...document.querySelectorAll('.ld-results .h-map-cluster')].indexOf(cs[0])} : null; });
            assert.ok(sel && sel.n > 10, 'une grosse pastille ' + JSON.stringify(sel));
            const z0 = (await ctlView()).zoom;
            await p.click(`.ld-results .h-map-cluster >> nth=${sel.i}`); await p.waitForSelector(`${card} .cf-list`);
            assert.strictEqual((await ctlView()).zoom, z0, 'la pastille ne zoome plus d’elle-même');
            assert.strictEqual(await p.$$eval(`${card} .cf-list button`, a => a.length), 10);
            assert.match(await p.textContent(`${card} .cf-title`), new RegExp(`^${sel.n} lignes à cet endroit`));
            assert.match(await p.textContent(`${card} .cf-more`), new RegExp(`\\+ ${sel.n - 10} autres?`));
            const first = (await p.textContent(`${card} .cf-list button >> nth=0`)).trim();
            await p.click(`${card} .cf-list button >> nth=0`); await p.waitForSelector(`${card} .cf-lines`);
            assert.ok(first.startsWith((await p.textContent(`${card} .cf-title`)).trim()), 'la ligne choisie : ' + first);
            await p.click(`${card} [data-cf-back]`); await p.waitForSelector(`${card} .cf-list`);
            await p.click(`${card} [data-cf-zoom]`); await sleep(300);
            assert.ok((await ctlView()).zoom > z0, '🔍 zoome sur la pastille'); assert.ok(!(await p.$(`${card} .cf-list`)));
        });
        await t('des points posés les uns sur les autres (sans pastille, zoom fort) : la même liste', async () => {
            await setView(45.2675, 1.7711, 16); await sleep(300);
            const i = await idxOf('Réplique de Tulle n° 3');
            await p.click(pt(i), {force: true}); await p.waitForSelector(`${card} .cf-list`);
            assert.match(await p.textContent(`${card} .cf-title`), /^14 lignes à cet endroit/);
            assert.match(await p.textContent(`${card} .cf-more`), /\+ 4 autres/);
            await p.keyboard.press('Escape');
        });
        await t('👪 Dans la famille : la personne vivante (hors consultation), jamais la fiche confidentielle', async () => {
            await setView(45.5367, 1.7958, 16); await sleep(300);
            const i = await idxOf('Secousse de Treignac');
            await p.click(pt(i), {force: true}); await p.waitForSelector(`${card} [data-cf-fam]`);
            await p.waitForFunction(() => !/…/.test(document.querySelector('.ld-results .cf-card [data-cf-fam-t]')?.textContent || '…'));
            const fam = await p.textContent(`${card} [data-cf-fam]`);
            assert.match(fam, /Lucie DURAND, 10 ans/); assert.doesNotMatch(fam, /LACOMBE Paul|Paul LACOMBE/);
            assert.match(fam, /à moins de 20 km/);
            await p.keyboard.press('Escape');
        });
        await t('📌 Garder ouvert : un panneau à droite dans la carte, qui suit les points ; retenu ; ↙ de nouveau une bulle', async () => {
            await p.evaluate(() => window.LCNDA_EXT.miniMapOf(document.querySelector('.ld-results')).fit()); await sleep(250);
            await p.click(pt(nice)); await p.waitForSelector(card);
            await p.click(`${card} [data-cf-pin]`);
            assert.ok(await p.$eval(card, x => x.classList.contains('cf-panel')));
            assert.strictEqual(await p.evaluate(() => localStorage.getItem('genealogie-carte-fiche')), 'panel');
            assert.strictEqual(await p.getAttribute(`${card} [data-cf-pin]`, 'aria-pressed'), 'true');
            const [c, s] = await Promise.all([p.locator(card).boundingBox(), p.locator('.ld-results [data-mm]').boundingBox()]);
            assert.ok(Math.abs(s.x + s.width - (c.x + c.width) - 8) < 4 && c.y - s.y < 14 && c.x > s.x + s.width / 2, 'à droite, dans le cadre ' + JSON.stringify([c, s]));
            const ctlBox = await p.locator('.ld-results .mm-ctl').boundingBox();
            assert.ok(ctlBox.x + ctlBox.width < c.x, 'les boutons de la carte ne sont pas sous le panneau');
            await setView(45.5367, 1.7958, 16); await sleep(300);
            await p.click(pt(await idxOf('Secousse de Treignac')), {force: true}); await sleep(200);
            assert.strictEqual((await p.textContent(`${card} .cf-title`)).trim(), 'Secousse de Treignac', 'le panneau suit le point cliqué');
            assert.ok(await p.$eval(card, x => x.classList.contains('cf-panel')));
            await p.reload(); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.dataListsEngine && window.LCNDA_EXT?.carteFiche, null, {timeout: 60000}); // retenu, même après un rechargement
            await p.evaluate(LIST); await sleep(300); await openMap();
            await p.click(pt(await idxOf('Séisme de Nice'))); await p.waitForSelector(card);
            assert.ok(await p.$eval(card, x => x.classList.contains('cf-panel')), 'retenu : directement en panneau');
            await p.click(`${card} [data-cf-pin]`);
            assert.ok(!(await p.$eval(card, x => x.classList.contains('cf-panel'))));
            assert.strictEqual(await p.evaluate(() => localStorage.getItem('genealogie-carte-fiche')), 'popup');
            await p.keyboard.press('Escape');
        });
        await t('aucune erreur dans la page', async () => { assert.deepStrictEqual(B.errs, []); });

        await t('390 px, en sombre : une feuille en bas, dans le cadre de la carte, sans toucher les bords', async () => {
            const ctx = await B.browser.newContext({viewport: {width: 390, height: 844}, hasTouch: true, isMobile: true});
            const q = await ctx.newPage(); const errs = []; q.on('pageerror', e => errs.push(e.message));
            await q.goto(B.base); await q.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.dataListsEngine && window.LCNDA_EXT?.carteFiche, null, {timeout: 60000});
            await q.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
            await q.evaluate(LIST); await sleep(300);
            await q.evaluate(() => { const A = window.LCNDA_APP; A.state.listType = 'data_test_cf'; A.setModule('listes'); });
            await q.waitForSelector('[data-ld-view="map"]', {timeout: 30000});
            if (!(await q.$('.ld-results .h-map-point[data-cf-i]'))) await q.click('[data-ld-view="map"]');
            await q.waitForSelector('.ld-results .h-map-point[data-cf-i]', {timeout: 30000}); await sleep(400);
            const i = await q.evaluate(() => Number([...document.querySelectorAll('.ld-results .h-map-point[data-cf-i]')].find(x => x.querySelector('title')?.textContent.startsWith('Séisme de Nice')).dataset.cfI));
            await q.evaluate(() => window.LCNDA_EXT.miniMapOf(document.querySelector('.ld-results')).setView(44.2, 7.26, 6, true)); await sleep(300); // le point loin du bas (la mention des sources)
            await q.locator(`.ld-results .h-map-point[data-cf-i="${i}"]`).scrollIntoViewIfNeeded();
            await q.tap(`.ld-results .h-map-point[data-cf-i="${i}"]`); await q.waitForSelector(card);
            assert.ok(await q.$eval(card, x => x.classList.contains('cf-sheet')), 'une feuille en bas');
            const [c, s] = await Promise.all([q.locator(card).boundingBox(), q.locator('.ld-results [data-mm]').boundingBox()]);
            assert.ok(c.x >= s.x + 6 && c.x + c.width <= s.x + s.width - 6 && c.y + c.height <= s.y + s.height - 6 && c.y >= s.y + 6, 'dans le cadre ' + JSON.stringify([c, s]));
            assert.ok(c.x >= 4 && c.x + c.width <= 386);
            assert.ok(Math.abs(s.y + s.height - (c.y + c.height) - 8) < 4, 'collée en bas du cadre (à 8 px)');
            const bg = await q.$eval(card, x => getComputedStyle(x).backgroundColor), fg = await q.$eval(card, x => getComputedStyle(x).color);
            assert.strictEqual(bg, 'rgb(29, 29, 29)'); assert.strictEqual(fg, 'rgb(238, 238, 238)');
            assert.ok(await q.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'pas de défilement de côté');
            await q.tap(`${card} [data-cf-x]`); assert.ok(!(await q.$(card)));
            assert.deepStrictEqual(errs, []); await ctx.close();
        });

        await t('mode consultation (vrai, côté serveur) : 👪 sans les vivants ; 📎 et 🧺 éteints avec la raison', async () => {
            fs.writeFileSync(path.join(B.tmp, 'consultation.json'), JSON.stringify({hash: '$2y$10$abcdefghijklmnopqrstuuJ5mZbI4c3W1h7yWQz9z1dQK0xRkZ5e', since: '2026-11-26T10:00:00'}));
            try {
                const ctx = await B.browser.newContext({viewport: {width: 1280, height: 900}});
                const q = await ctx.newPage(); const errs = []; q.on('pageerror', e => errs.push(e.message));
                await q.goto(B.base); await q.waitForFunction(() => window.LCNDA_APP?.state && window.LCNDA_EXT?.dataListsEngine && window.LCNDA_EXT?.carteFiche, null, {timeout: 60000});
                await q.waitForFunction(() => document.body.classList.contains('is-kiosk'), null, {timeout: 20000});
                await q.evaluate(LIST); await sleep(300);
                await q.evaluate(() => { const A = window.LCNDA_APP; A.state.listType = 'data_test_cf'; A.setModule('listes'); });
                await q.waitForSelector('[data-ld-view="map"]', {timeout: 30000});
                if (!(await q.$('.ld-results .h-map-point[data-cf-i]'))) await q.click('[data-ld-view="map"]');
                await q.waitForSelector('.ld-results .h-map-point[data-cf-i]', {timeout: 30000}); await sleep(400);
                await q.evaluate(() => window.LCNDA_EXT.miniMapOf(document.querySelector('.ld-results')).setView(45.5367, 1.7958, 16, true)); await sleep(300);
                const i = await q.evaluate(() => Number([...document.querySelectorAll('.ld-results .h-map-point[data-cf-i]')].find(x => x.querySelector('title')?.textContent.startsWith('Secousse de Treignac')).dataset.cfI));
                await q.click(`.ld-results .h-map-point[data-cf-i="${i}"]`, {force: true}); await q.waitForSelector(card);
                await q.waitForFunction(() => !document.querySelector('.ld-results .cf-card [data-cf-fam]') || !/^…$/.test(document.querySelector('.ld-results .cf-card [data-cf-fam-t]')?.textContent || ''), null, {timeout: 10000}); await sleep(300);
                const txt = await q.textContent(card);
                assert.doesNotMatch(txt, /Lucie DURAND/, 'pas les vivants en consultation'); assert.doesNotMatch(txt, /Paul LACOMBE/);
                for (const k of ['ins', 'bk']) assert.ok(await q.$eval(`${card} [data-cf-act="${k}"]`, b => b.disabled && /consultation/.test(b.title)), k + ' éteint');
                assert.ok(!(await q.$eval(`${card} [data-cf-act="line"]`, b => b.disabled)), '☰ Voir la ligne reste');
                assert.deepStrictEqual(errs, []); await ctx.close();
            } finally { fs.rmSync(path.join(B.tmp, 'consultation.json'), {force: true}); }
        });
        await t('aucune erreur dans la page (fin)', async () => { assert.deepStrictEqual(B.errs, []); });
    } finally {
        await B.stop();
    }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
