#!/usr/bin/env node
/* 🧰 Le choix d'une liste de données, partout le même : le choix commun (LCNDA_EXT.dataListPicker, app-listes-themes.js :
 * 🔍 recherche, pastilles des thèmes, cartes par thème, installé / à télécharger, clavier), replié en une ligne
 * « 📋 nom · thème — Changer ». Les grands menus déroulants de listes sont remplacés par LCNDA_EXT.dataListSelect
 * (le <select> reste, caché : même valeur, même « change », rien ne change dans ce qui est enregistré).
 *   · 🗺 Carte / diagramme → « ＋ Données sur la carte » → « Quelles données ? » (heritage-carto-donnees.js) ;
 *   · 📊 Listes → 🧰 Données → une question → la pastille « Quoi » (app-donnees-accueil.js) : la liste ET son thème ;
 *   · un petit menu (8 choix ou moins) reste un menu ;
 *   · à 390 px en sombre : rien ne déborde, rien de collé ; aucune erreur.
 * Le bloc 📊 Données d'une fiche (heritage-fiches.js) a son propre essai : tests/test-fiche-bloc-donnees.js.
 * Base : tests/prendre-depuis-seed.js (noms inventés MAZAUD, LACOMBE, DURAND) ; une liste FABRIQUÉE « Batailles inventées ».
 *   node tests/test-choix-liste-partout.js
 */
'use strict';
const assert = require('assert');
const {start, sleep} = require('./prendre-depuis-seed.js');
const {detect} = require('./test-rien-de-colle.js');

let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 8).join('\n  ')); } };

(async () => {
    const B = await start();
    const p = B.page;
    try {
        await p.evaluate(() => {
            const rows = [{nom: 'Bataille du Pont de Tulle', annee: 1814, lat: 45.27, lon: 1.77}, {nom: 'Combat de Naves', annee: 1832, lat: 45.31, lon: 1.77}, {nom: 'Siège de Chamberet', annee: 1870, lat: 45.58, lon: 1.72}];
            window.LCNDA_EXT.dataLists.push({id: 'test_batailles', icon: '⚔️', label: 'Batailles inventées', group: 'Le monde', theme: 'guerres', source: 'Jeu d’essai (CC0)',
                fields: [{key: 'nom', label: 'Bataille'}, {key: 'annee', label: 'Année', type: 'year'}], load: async () => rows, period: r => [r.annee, r.annee], geo: r => [r.lat, r.lon]});
        });
        await sleep(300);

        await t('🗺 « Quelles données ? » : plus de grand menu ; une ligne « 📋 … — Changer » ; chercher + choisir pose la même valeur (et son « change ») ; « ✕ Garder »', async () => {
            await p.evaluate(() => { window.__cd = window.LCNDA_EXT.cartoDonnees.layerDialog(null); });
            await p.waitForSelector('.cd-dialog .ldt-sel', {timeout: 20000});
            const r0 = await p.evaluate(() => { const s = document.querySelector('.cd-dialog [data-cd-src]'); return {hidden: s.hidden || !s.offsetParent, n: s.options.length, v: s.value, line: document.querySelector('.cd-dialog .ldt-selline')?.textContent.replace(/\s+/g, ' ').trim()}; });
            assert.ok(r0.hidden, 'le menu est caché'); assert.ok(r0.n > 8, `${r0.n} choix`);
            assert.match(r0.line, /^📋 .+ — Changer$/, r0.line);
            await p.click('.cd-dialog [data-ldt-selchange]');
            await p.waitForSelector('.cd-dialog [data-ldt-selpick] [data-ld-pick]');
            const r1 = await p.evaluate(() => ({chips: document.querySelectorAll('.cd-dialog [data-ldt-pth]').length, keep: document.querySelector('.cd-dialog [data-ldt-selkeep]')?.textContent, focus: !!document.activeElement?.matches('.cd-dialog [data-ld-ov-q]')}));
            assert.ok(r1.chips >= 3, 'Tous + des thèmes en pastilles : ' + r1.chips); assert.match(r1.keep, /Garder « /); assert.ok(r1.focus, 'le curseur dans la recherche');
            await p.click('.cd-dialog [data-ldt-selkeep]');
            assert.strictEqual(await p.$eval('.cd-dialog [data-cd-src]', s => s.value), r0.v, '✕ Garder : rien ne change');
            await p.click('.cd-dialog [data-ldt-selchange]');
            await p.fill('.cd-dialog [data-ldt-selpick] [data-ld-ov-q]', 'batailles inventées');
            await p.waitForFunction(() => [...document.querySelectorAll('.cd-dialog [data-ld-pick]')].some(c => c.dataset.ldPick === 'dl:test_batailles'), null, {timeout: 5000});
            await p.press('.cd-dialog [data-ldt-selpick] [data-ld-ov-q]', 'ArrowDown'); await p.press('.cd-dialog [data-ldt-selpick] [data-ld-ov-q]', 'Enter'); // ↓ Entrée : au clavier
            await p.waitForSelector('.cd-dialog .ldt-selline');
            const r2 = await p.evaluate(() => ({v: document.querySelector('.cd-dialog [data-cd-src]').value, line: document.querySelector('.cd-dialog .ldt-selline').textContent.replace(/\s+/g, ' ').trim(), src: document.querySelector('.cd-dialog [data-cd-srcline]').textContent, label: document.querySelector('.cd-dialog [data-cd-label]').value, years: !document.querySelector('.cd-dialog [data-cd-w="years"]').hidden}));
            assert.strictEqual(r2.v, 'dl:test_batailles', 'la même valeur qu’avant (dl:…)');
            assert.match(r2.line, /📋 ⚔️ Batailles inventées · ⚔️ Guerres et soldats — Changer/);
            assert.match(r2.src, /Jeu d’essai/, 'le « change » du menu a suivi (ligne de la source)'); assert.strictEqual(r2.label, 'Batailles inventées'); assert.ok(r2.years, 'les années de la liste');
            await p.click('.cd-dialog [data-cd-x]'); await sleep(200);
        });

        await t('📊 la pastille « Quoi » d’une question : le choix commun, qui pose la liste ET son thème', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP, H = window.LCNDA_EXT.dataHome; if (H._st) { H._st.view = 'recap'; H._st.q = ''; } A.state.listType = 'donnees'; A.setModule('listes'); });
            await p.waitForSelector('[data-dr-q]', {timeout: 30000});
            await p.fill('[data-dr-q]', 'les séismes entre 1800 et 1900'); await p.press('[data-dr-q]', 'Enter');
            await p.waitForSelector('[data-dr-pill="what"]', {timeout: 30000}); await sleep(300);
            await p.click('[data-dr-pill="what"]');
            await p.waitForSelector('#dr-pop .ldt-sel', {timeout: 10000});
            const r0 = await p.evaluate(() => ({th: document.querySelector('#dr-pop [data-dr-th]').closest('label').hidden, ls: document.querySelector('#dr-pop [data-dr-list]').hidden, line: !!document.querySelector('#dr-pop .ldt-selline'), pick: !!document.querySelector('#dr-pop [data-ld-pick]')}));
            assert.ok(r0.th && r0.ls, 'les deux menus sont cachés'); assert.ok(r0.line || r0.pick, 'une ligne repliée, ou le choix');
            if (r0.line) await p.click('#dr-pop [data-ldt-selchange]');
            await p.fill('#dr-pop [data-ld-ov-q]', 'inventées');
            await p.click('#dr-pop [data-ld-pick="test_batailles"]');
            await p.waitForSelector('#dr-pop .ldt-selline');
            assert.deepStrictEqual(await p.evaluate(() => [document.querySelector('#dr-pop [data-dr-th]').value, document.querySelector('#dr-pop [data-dr-list]').value]), ['guerres', 'test_batailles'], 'le thème suit la liste');
            assert.match(await p.textContent('#dr-pop .ldt-selline'), /Batailles inventées · ⚔️ Guerres et soldats/);
            await p.click('#dr-pop button[type="submit"]');
            await p.waitForFunction(() => /Batailles inventées/.test(document.querySelector('[data-dr-pill="what"]')?.textContent || ''), null, {timeout: 15000});
        });

        await t('un petit menu (8 choix ou moins) reste un menu', async () => {
            const r = await p.evaluate(() => { const s = document.createElement('select'); s.innerHTML = '<option value="a">A</option><option value="b">B</option><option value="c">C</option>'; document.body.appendChild(s); const out = window.LCNDA_EXT.dataListSelect(s); const v = [out, s.hidden, !!s.nextElementSibling?.matches?.('.ldt-sel')]; s.remove(); return v; });
            assert.deepStrictEqual(r, [null, false, false]);
        });

        await t('390 px en sombre : le choix dans « Quelles données ? » ne déborde pas, rien de collé, pas de carte blanche ; aucune erreur', async () => {
            await p.setViewportSize({width: 390, height: 844});
            await p.evaluate(() => { const cur = JSON.parse(localStorage.getItem('genealogie-design') || '{}'); localStorage.setItem('genealogie-design', JSON.stringify({...cur, preset: 'dark'})); window.LCNDA_APP.applyDesign?.(); });
            await p.evaluate(() => { window.__cd = window.LCNDA_EXT.cartoDonnees.layerDialog(null); });
            await p.waitForSelector('.cd-dialog .ldt-sel', {timeout: 20000});
            let bad = await p.evaluate(detect, {root: '.cd-dialog .ldt-sel', min: 4});
            assert.deepStrictEqual(bad.map(b => b.key), [], 'replié');
            await p.click('.cd-dialog [data-ldt-selchange]'); await p.waitForSelector('.cd-dialog [data-ld-pick]'); await sleep(300);
            const r = await p.evaluate(() => { const box = document.querySelector('.cd-dialog .ldt-sel'), d = document.querySelector('.cd-dialog'); return {over: box.scrollWidth - box.clientWidth, right: box.getBoundingClientRect().right - d.getBoundingClientRect().right, bg: getComputedStyle(box.querySelector('.ld-card')).backgroundColor, dark: document.documentElement.dataset.theme}; });
            assert.ok(r.over <= 1 && r.right <= 1, JSON.stringify(r)); assert.strictEqual(r.dark, 'dark'); assert.ok(!/rgb\(255, 255, 255\)/.test(r.bg), r.bg);
            bad = await p.evaluate(detect, {root: '.cd-dialog .ldt-sel', min: 4});
            assert.deepStrictEqual(bad.map(b => b.key), [], 'ouvert');
            await p.click('.cd-dialog [data-cd-x]');
            await p.evaluate(() => { const cur = JSON.parse(localStorage.getItem('genealogie-design') || '{}'); delete cur.preset; localStorage.setItem('genealogie-design', JSON.stringify(cur)); window.LCNDA_APP.applyDesign?.(); });
            await p.setViewportSize({width: 1440, height: 900});
            assert.deepStrictEqual(B.errs, []);
        });
    } finally { await B.stop(); }
    console.log(fails ? `\n✗ ${fails} essai(s) en échec` : '\n✓ tout est bon');
    process.exit(fails ? 1 : 0);
})();
