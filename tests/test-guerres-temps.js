#!/usr/bin/env node
/* ▶ Dans le temps : les batailles sur la carte, année après année, autour de nos lieux (maquette validée docs/design/carte-guerres-temps.html).
 *   assets/js/heritage-guerres-temps.js (+ app-listes-donnees.js : le bouton et la carte ; app-listes-famille.js / lib/listes_famille.php : la famille,
 *   le drapeau « ancêtre direct » ; heritage-histoire-autour.js : timeMap sur ⚔️ Batailles et sièges, « ▶ Dans le temps » sur la fiche d'une guerre).
 *  1. la vraie liste ⚔️ Batailles et sièges (Wikidata, ~16 000 lignes) : le bouton, la barre (▶ ‹ › année Lent/Normal/Vite, guerre, 🏠, Traînée,
 *     ancêtres, placées par leur lieu, frontières), l'histogramme par 5 ans, le curseur, le fond de l'app (sans tuiles), vite (un dessin < 150 ms,
 *     même avec la Traînée sur 16 000 points), ▶ Lecture avance tout seul (requestAnimationFrame), ❚❚ s'arrête ;
 *  2. une liste FABRIQUÉE (timeMap) près de Treignac : une bataille apparaît à sa date, pâlit en 5 ans, « Traînée » la garde ; anneau orange
 *     à moins de 50 km d'un lieu de la famille, la fiche dit « À N km de Treignac : Prénom NOM avait N ans » ; « placées par leur lieu »
 *     cachées d'un clic ; seulement les ancêtres directs ; une guerre choisie : les autres pâlissent, la pastille « Guerre : … × » ;
 *  3. la fiche d'une guerre → « ▶ Dans le temps » ouvre la liste sur cette guerre ; prefers-reduced-motion : jamais de lecture toute seule,
 *     ▶ = une année ; mode consultation : pas de liens ↗ ; 390 px en sombre : rien ne déborde ; clavier ; aucune erreur.
 * Base : tests/prendre-depuis-seed.js (noms inventés MAZAUD, LACOMBE, DURAND ; Treignac, Tulle…).   node tests/test-guerres-temps.js */
'use strict';
const assert = require('assert');
const {start, sleep} = require('./prendre-depuis-seed.js');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 8).join('\n  ')); } };

(async () => {
    const B = await start();
    const p = B.page;
    try {
        const openKey = async k => { await p.evaluate(x => { const A = window.LCNDA_APP; A.state.listType = x; A.setModule('listes'); }, k); };
        const S = () => p.evaluate(() => { const s = window.LCNDA_EXT.guerresTemps.state(); return s && s.D ? {year: s.year, range: s.range, n: s.D.B.length, vis: s.vis.length, war: s.war, playing: s.playing, frame: s.frame, homes: s.homes.length, lives: s.lives.length, set: s.set} : null; });
        const ready = async () => { await p.waitForFunction(() => { const s = window.LCNDA_EXT.guerresTemps?.state(); return s && s.D && s.view && document.querySelector('[data-gt-stage] canvas'); }, null, {timeout: 60000}); };

        /* ═════════ 1. la vraie liste ═════════ */
        await t('⚔️ Batailles et sièges : « ▶ Dans le temps » dans la barre ; la carte en canvas, la barre complète, le fond de l’app sans tuiles', async () => {
            await p.evaluate(() => { localStorage.removeItem('genealogie-guerres-temps'); localStorage.removeItem('lcnda-ld:ha_batailles'); });
            await openKey('data_ha_batailles'); await p.waitForSelector('[data-ld-page="ha_batailles"] [data-gt-on]', {timeout: 30000});
            assert.strictEqual(await p.getAttribute('[data-gt-on]', 'aria-pressed'), 'false');
            const reqs = []; p.on('request', r => reqs.push(r.url()));
            await p.click('[data-gt-on]'); await ready();
            assert.strictEqual(await p.getAttribute('[data-gt-on]', 'aria-pressed'), 'true');
            for (const sel of ['[data-gt-play]', '[data-gt-step="-1"]', '[data-gt-step="1"]', '[data-gt-yearnum]', '[data-gt-speed="lent"]', '[data-gt-speed="normal"]', '[data-gt-speed="vite"]', '[data-gt-war-sel]',
                '[data-gt-set="homes"]', '[data-gt-set="trail"]', '[data-gt-set="anc"]', '[data-gt-set="approx"]', '[data-gt-set="borders"]', '[data-gt-hist] rect', '[data-gt-range]', '[data-gt-frame="fr"]', '[data-gt-frame="eu"]', '[data-gt-legend]']) assert.ok(await p.$(sel), sel);
            const s = await S(); assert.ok(s.n > 15000, `${s.n} batailles placées`); assert.ok(s.range[0] >= 1500 && s.range[1] <= new Date().getFullYear(), String(s.range));
            const bins = await p.$$eval('[data-gt-hist] rect', a => a.length); assert.strictEqual(bins, Math.ceil((s.range[1] - s.range[0] + 1) / 5), 'un bâton par 5 ans');
            await sleep(400);
            assert.ok(!reqs.some(u => /tile|openstreetmap|arcgis|carto/i.test(u)), 'aucune tuile demandée : ' + reqs.filter(u => /tile/i.test(u)).join(' '));
            assert.ok(reqs.some(u => /monde-50m\.json/.test(u)), 'le fond Natural Earth livré');
            assert.match(await p.textContent('.gt-attr'), /Natural Earth/);
            const px = await p.evaluate(() => { const c = document.querySelector('[data-gt-cv]'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4 * 97) if (d[i + 3]) n++; return n; });
            assert.ok(px > 100, 'la carte est dessinée');
        });
        await t('vite : un dessin < 150 ms même avec la Traînée sur toutes les batailles ; les points rangés par année', async () => {
            const ms = await p.evaluate(() => { const s = window.LCNDA_EXT.guerresTemps.state(); s.set.trail = true; s.year = s.range[1]; const t0 = performance.now(); document.querySelector('[data-gt-step="-1"]').click(); document.querySelector('[data-gt-step="1"]').click(); const dt = (performance.now() - t0) / 2; s.set.trail = false; return [dt, s.vis.length]; });
            assert.ok(ms[0] < 150, `${Math.round(ms[0])} ms`); assert.ok(ms[1] > 1000, `${ms[1]} points avec la traînée`);
            await p.click('[data-gt-step="-1"]');
        });
        await t('l’année : ‹ › ; tapée dans la case ; le curseur ; la boîte de l’année ; « Ces années-là »', async () => {
            await p.fill('[data-gt-yearnum]', '1870'); await p.press('[data-gt-yearnum]', 'Enter'); await sleep(100);
            assert.strictEqual((await S()).year, 1870); assert.strictEqual((await p.textContent('[data-gt-yr]')).trim(), '1870');
            assert.match(await p.textContent('[data-gt-sub]'), /batailles ou sièges|bataille ou siège|aucune bataille/);
            await p.click('[data-gt-step="1"]'); assert.strictEqual((await S()).year, 1871); await p.click('[data-gt-step="-1"]'); assert.strictEqual((await S()).year, 1870);
            assert.strictEqual(await p.inputValue('[data-gt-range]'), '1870');
            assert.match(await p.textContent('[data-gt-listh]'), /Ces années-là 1866–1870 · \d+/);
            assert.ok(await p.$$eval('[data-gt-list] [data-gt-b]', a => a.length) > 0, 'des batailles en 1866–1870');
            await p.click('[data-gt-list] [data-gt-b]'); await p.waitForSelector('[data-gt-detail]:not([hidden]) h4');
            assert.match(await p.textContent('[data-gt-detail]'), /Histoire autour.*Lieu/s); assert.ok(await p.$('[data-gt-detail] a[href*="wikidata.org"]'), '↗ source');
        });
        await t('▶ Lecture : les années avancent toutes seules (Vite), ❚❚ Pause s’arrête', async () => {
            await p.click('[data-gt-speed="vite"]'); assert.strictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-guerres-temps')).speed), 'vite');
            const y0 = (await S()).year; await p.click('[data-gt-play]'); await sleep(900);
            assert.match(await p.textContent('[data-gt-play]'), /Pause/); const y1 = (await S()).year; assert.ok(y1 >= y0 + 3, `${y0} → ${y1}`);
            await p.click('[data-gt-play]'); const y2 = (await S()).year; await sleep(400); assert.strictEqual((await S()).year, y2, 'arrêté'); assert.match(await p.textContent('[data-gt-play]'), /Lecture/);
            await p.click('[data-gt-speed="normal"]');
        });
        await t('clavier : sur la carte, Espace = lecture, → / ← = une année', async () => {
            await p.focus('[data-gt-stage]'); const y = (await S()).year;
            await p.keyboard.press('ArrowRight'); assert.strictEqual((await S()).year, y + 1); await p.keyboard.press('ArrowLeft'); assert.strictEqual((await S()).year, y);
            await p.keyboard.press(' '); await sleep(50); assert.strictEqual((await S()).playing, true); await p.keyboard.press(' '); assert.strictEqual((await S()).playing, false);
        });
        await t('une guerre choisie : la pastille « Guerre : … × », le cadrage, l’année de son début ; × la retire', async () => {
            const v = await p.evaluate(() => { const s = window.LCNDA_EXT.guerresTemps.state(), o = [...document.querySelectorAll('[data-gt-war-sel] option')].find(x => /franco-allemande|franco-prussienne/i.test(x.textContent)) || document.querySelectorAll('[data-gt-war-sel] option')[1]; return {v: o.value, y: s.D.wars[Number(o.value)].y}; });
            await p.selectOption('[data-gt-war-sel]', v.v); await sleep(150);
            const s = await S(); assert.strictEqual(s.war, Number(v.v)); assert.strictEqual(s.year, Math.max(s.range[0], v.y));
            assert.match(await p.textContent('[data-ld-chips] [data-gt-warchip]'), /Guerre :/); assert.match(await p.textContent('[data-gt-legend]'), /autre guerre/);
            await p.click('[data-gt-warchip]'); assert.strictEqual((await S()).war, -1); assert.strictEqual(await p.$('[data-gt-warchip]'), null);
        });

        /* ═════════ 2. une liste fabriquée, près de Treignac ═════════ */
        await p.evaluate(() => {
            const E = window.LCNDA_EXT;
            const rows = [{q: 'QT1', n: 'Combat du moulin de Treignac', y: 1795, d: '1795-05-12', lat: 45.55, lon: 1.82, approx: false, wq: ['QW1'], war: 'Guerre d’essai', bel: ['Bleus', 'Blancs'], loc: 'Treignac'},
                {q: 'QT2', n: 'Siège du bourg (placé par son lieu)', y: 1796, d: '1796', lat: 45.58, lon: 1.72, approx: true, wq: ['QW1'], war: 'Guerre d’essai', bel: [], loc: 'Chamberet'},
                {q: 'QT3', n: 'Bataille lointaine', y: 1795, d: '1795-07-01', lat: 36.8, lon: 10.2, approx: false, wq: [], war: '', bel: [], loc: 'Tunis'}];
            E.dataLists.push({id: 'test_gt', icon: '⚔️', label: 'Batailles inventées', group: 'Le monde', theme: 'guerres', source: 'Jeu d’essai', timeMap: true, load: async () => rows,
                fields: [{key: 'n', label: 'Bataille', type: 'text'}, {key: 'd', label: 'Date', type: 'date'}, {key: 'loc', label: 'Lieu', type: 'text'}], period: r => [r.y, r.y], geo: r => [r.lat, r.lon], open: () => {}});
        });
        await sleep(400);
        await t('une bataille apparaît à sa date, pâlit en 5 ans ; la Traînée la garde ; l’anneau orange et « À N km de Treignac : … avait N ans »', async () => {
            await p.evaluate(() => localStorage.setItem('lcnda-ld:test_gt', JSON.stringify({view: 'map', time: true})));
            await openKey('data_test_gt'); await ready(); await p.click('[data-gt-frame="monde"]'); // Tunis aussi
            const vis = async y => { await p.fill('[data-gt-yearnum]', String(y)); await p.press('[data-gt-yearnum]', 'Enter'); await sleep(60); return p.evaluate(() => window.LCNDA_EXT.guerresTemps.state().vis.map(v => v[0].q).sort()); };
            assert.deepStrictEqual(await vis(1794), []); assert.deepStrictEqual(await vis(1795), ['QT1', 'QT3']); assert.deepStrictEqual(await vis(1799), ['QT1', 'QT2', 'QT3']); assert.deepStrictEqual(await vis(1800), ['QT2'], '5 ans puis plus rien');
            await p.check('[data-gt-set="trail"]'); assert.deepStrictEqual(await vis(1805), ['QT1', 'QT2', 'QT3'], 'la Traînée garde le passé'); await p.uncheck('[data-gt-set="trail"]'); await p.click('[data-gt-frame="fr"]');
            const near = await p.evaluate(() => window.LCNDA_EXT.guerresTemps.state().D.B.find(b => b.q === 'QT1').near);
            assert.ok(near && near.km < 50 && /Treignac|Chamberet/.test(near.place) && near.age >= 0, JSON.stringify(near));
            assert.strictEqual(await p.evaluate(() => window.LCNDA_EXT.guerresTemps.state().D.B.find(b => b.q === 'QT3').near), null, 'Tunis : loin de nos lieux');
            await vis(1795); await p.click('[data-gt-b="0"]'); await p.waitForSelector('[data-gt-detail] .gt-near');
            const txt = (await p.textContent('[data-gt-detail] .gt-near')).replace(/\s+/g, ' ');
            assert.match(txt, /^À \d+(,\d)? km de (Treignac|Chamberet) : \S+ [A-ZÉ]+ avait \d+ ans\.$/, txt);
            assert.ok((await S()).homes > 0 && (await S()).lives > 0, 'nos lieux et les bandes de vie');
            assert.ok(await p.$$eval('.gt-life', a => a.length) > 0); assert.match(await p.textContent('.gt-life'), /[A-Z]{3,}.*\d{4}–/);
        });
        await t('« placées par leur lieu » : cachées d’un clic (retenu) ; frontières masquables ; seulement les ancêtres directs', async () => {
            await p.fill('[data-gt-yearnum]', '1797'); await p.press('[data-gt-yearnum]', 'Enter');
            assert.ok((await p.evaluate(() => window.LCNDA_EXT.guerresTemps.state().vis.map(v => v[0].q))).includes('QT2'));
            await p.uncheck('[data-gt-set="approx"]'); assert.ok(!(await p.evaluate(() => window.LCNDA_EXT.guerresTemps.state().vis.map(v => v[0].q))).includes('QT2'));
            assert.strictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-guerres-temps')).approx), false);
            await p.check('[data-gt-set="approx"]');
            await p.uncheck('[data-gt-set="borders"]'); assert.strictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-guerres-temps')).borders), false); await p.check('[data-gt-set="borders"]');
            const before = (await S()).homes; await p.check('[data-gt-set="anc"]'); await sleep(50);
            const after = await S(); assert.ok(after.homes < before, `${before} → ${after.homes} lieux (la racine Sosa seulement dans cette base)`);
            const anc = await p.evaluate(() => (window.LCNDA_EXT.listesFamille.data().people || []).filter(x => x.a).map(x => x.n)); assert.strictEqual(anc.length, 1, 'la racine (personne de départ), sans parents dans cette base : ' + anc.join(','));
            await p.uncheck('[data-gt-set="anc"]');
        });
        await t('une guerre : les autres batailles pâlissent (gris) ; le cadrage France ; Europe et Monde d’un clic', async () => {
            assert.strictEqual((await S()).frame, 'fr');
            await p.click('[data-gt-frame="monde"]'); assert.strictEqual(await p.getAttribute('[data-gt-frame="monde"]', 'aria-pressed'), 'true');
            await p.click('[data-gt-frame="fr"]');
        });

        /* ═════════ 3. la fiche d'une guerre, mouvements réduits, consultation, téléphone ═════════ */
        await t('la fiche d’une guerre : « ▶ Dans le temps » ouvre ⚔️ Batailles et sièges sur la carte, cette guerre choisie', async () => {
            const q = await p.evaluate(async () => { const H = window.LCNDA_EXT.histoireAutour; const G = await H.load('guerres'), Bt = await H.load('batailles'); const n = new Map(); Bt.rows.forEach(b => b.wq.forEach(x => n.set(x, (n.get(x) || 0) + 1))); const w = G.rows.find(x => (n.get(x.q) || 0) > 20 && x.y > 1700); await H.openCard('guerres', w); return w.q; });
            await p.waitForSelector('dialog.ha-dialog[open] [data-gt-war]'); await p.click('dialog.ha-dialog[open] [data-gt-war]');
            await p.waitForSelector('[data-ld-page="ha_batailles"]'); await ready(); await p.waitForFunction(q => { const s = window.LCNDA_EXT.guerresTemps.state(); return s.D && s.D.wars[s.war]?.q === q; }, q, {timeout: 20000});
            assert.match(await p.textContent('[data-gt-warchip]'), /Guerre :/); assert.strictEqual(await p.getAttribute('[data-gt-on]', 'aria-pressed'), 'true');
        });
        await t('prefers-reduced-motion : pas de lecture toute seule ; ▶ avance d’une année à chaque clic', async () => {
            await p.emulateMedia({reducedMotion: 'reduce'});
            await openKey('data_test_gt'); await ready();
            assert.match(await p.textContent('[data-gt-play]'), /Année suivante/);
            const y = (await S()).year; await p.click('[data-gt-play]'); await sleep(500);
            const s = await S(); assert.strictEqual(s.year, y + 1); assert.strictEqual(s.playing, false);
            await p.emulateMedia({reducedMotion: 'no-preference'});
        });
        await t('mode consultation : la fiche n’a pas de lien ↗ (ni le fond de carte)', async () => {
            await p.evaluate(() => document.body.classList.add('is-kiosk'));
            await openKey('data_test_gt'); await ready(); await p.fill('[data-gt-yearnum]', '1795'); await p.press('[data-gt-yearnum]', 'Enter');
            await p.click('[data-gt-b="0"]'); await p.waitForSelector('[data-gt-detail] h4');
            assert.strictEqual(await p.$('[data-gt-detail] a'), null);
            await p.evaluate(() => document.body.classList.remove('is-kiosk'));
        });
        await t('390 px, en sombre : rien ne déborde de côté ; la barre passe à la ligne ; couleurs sombres', async () => {
            await p.setViewportSize({width: 390, height: 844}); await p.evaluate(() => { localStorage.setItem('genealogie-design', JSON.stringify({...JSON.parse(localStorage.getItem('genealogie-design') || '{}'), preset: 'dark'})); window.LCNDA_APP.applyDesign(); }); // le vrai thème sombre de l’app
            await openKey('data_test_gt'); await ready(); await sleep(300);
            assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'pas de défilement de côté');
            const r = await p.evaluate(() => { const s = document.querySelector('[data-gt-stage]').getBoundingClientRect(), b = document.querySelector('[data-gt-play]').getBoundingClientRect(); return {w: s.width, l: s.left, r: innerWidth - s.right, bh: b.height}; });
            assert.ok(r.w <= 390 && r.l >= 8 && r.r >= 8, JSON.stringify(r)); assert.ok(r.bh >= 30, 'boutons assez grands');
            assert.strictEqual(await p.evaluate(() => getComputedStyle(document.querySelector('.gt')).getPropertyValue('--gt-sea').trim()), '#16191d');
            await p.setViewportSize({width: 1440, height: 900}); await p.evaluate(() => { localStorage.setItem('genealogie-design', JSON.stringify({...JSON.parse(localStorage.getItem('genealogie-design') || '{}'), preset: 'portfolio'})); window.LCNDA_APP.applyDesign(); });
        });
        await t('aucune erreur dans la page', async () => { assert.deepStrictEqual(B.errs, []); });
    } finally {
        await B.stop();
    }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
