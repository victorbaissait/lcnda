#!/usr/bin/env node
/* 📊 Récap des données et la question en français (maquette validée docs/design/donnees-question-recap.html, décisions du 2026-11-26).
 *   assets/js/app-donnees-accueil.js (+ app-paniers-core.js : parseData ; app-listes-donnees.js : la première vue ; app.js / app-onglets-plus.js : l'onglet
 *   📊 Données ; app-listes-choix.js : 📎 🧺 sur une page qui n'est pas celle du moteur).
 *  1. la lecture de la phrase (node, sans écran) : les 5 phrases de la maquette → les bonnes pastilles ; « à 20 km de Tulle » ; une question sur la famille ;
 *  2. Listes → 🧰 Données s'ouvre sur 📊 Récap : la boîte et ses exemples, « Pour ta famille » (calculé ici, une liste FABRIQUÉE), « À faire »,
 *     les 20 thèmes (un clic ouvre le thème), 🧰 Thèmes (les cartes) ;
 *  3. une question : J'ai compris (Quoi · Qui · Quand · Où + rayon), pastille en pointillé = déduite, − / + et le nombre tapé, les pastilles
 *     changées (pleines), les lignes du moteur, 👪, 📎 🧺 (un et plusieurs), « Ouvrir la liste complète » ; « Je n'ai pas compris » ;
 *     une question sur la famille → 🔍 Recherche ; le rayon par thème (Réglages, ↶ Annuler) ;
 *  4. ⌘K : une ligne « 📊 Demander aux données », rien de calculé avant le choix ; la place (Listes / l'onglet / les deux, jamais aucun) ;
 *     le MÊME écran aux deux portes (même HTML, au fil d'Ariane près) ; mode consultation ; 390 px en sombre ; aucune erreur.
 * Base : tests/prendre-depuis-seed.js (noms inventés MAZAUD, LACOMBE, DURAND ; Treignac, Chamberet, Tulle…).   node tests/test-donnees-recap.js */
'use strict';
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const {start, sleep} = require('./prendre-depuis-seed.js');
const C = require('../assets/js/app-paniers-core.js');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 8).join('\n  ')); } };

(async () => {
    /* ═════════ 1. la lecture de la phrase (sans écran) ═════════ */
    const src = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'app-listes-themes.js'), 'utf8');
    const THEMES = [...src.matchAll(/\['(\w+)', '[^']*', '[^']*', '[^']*', '([^']*)'\]/g)].map(m => ({id: m[1], words: m[2].split(/\s*,\s*/)}));
    THEMES.find(x => x.id === 'ciel').words.push('quel temps'); THEMES.find(x => x.id === 'images').words.push('musee');
    const P = q => C.parseData(q, {themes: THEMES});
    await t('les phrases de la maquette → ce que j’ai compris (thème, qui, âge, années, lieu, rayon tapé, famille, vie, mariage)', async () => {
        let u = P('les séismes à moins de 50 km de Tulle entre 1800 et 1900');
        assert.deepStrictEqual([u.themes[0].id, u.km, u.kmTyped, u.around.name, u.years], ['seismes', 50, true, 'Tulle', [1800, 1900]]);
        u = P('le Tour de France quand Jean MAZAUD avait 12 ans');
        assert.deepStrictEqual([u.themes[0].id, u.who.name, u.age, u.kmTyped], ['sport', 'Jean MAZAUD', [12, 12], false]);
        u = P('les musées autour de Brive'); assert.deepStrictEqual([u.themes[0].id, u.around.name, u.km], ['images', 'Brive', null]);
        u = P('les batailles près des lieux de la famille pendant la vie de Marie LACOMBE');
        assert.deepStrictEqual([u.themes[0].id, u.family, u.life, u.who.name, u.around], ['guerres', true, true, 'Marie LACOMBE', null]);
        u = P('quel temps faisait-il le jour du mariage de Pierre DURAND'); assert.deepStrictEqual([u.themes[0].id, u.wedding, u.who.name, u.nope], ['ciel', true, 'Pierre DURAND', []]);
        u = P('les gens célèbres qui ont dormi à Treignac'); assert.strictEqual(u.themes[0].id, 'personnes'); assert.deepStrictEqual(u.nope, [{k: 'left', words: ['dormi']}], 'dit honnêtement');
        u = P('les crues à 20 km de Tulle'); assert.deepStrictEqual([u.themes[0].id, u.km, u.kmTyped, u.around.name], ['eaux', 20, true, 'Tulle']);
        u = P('les enfants de Marie LACOMBE'); assert.deepStrictEqual([u.familyOnly, u.themes.length], [true, 0]);
        u = P('bonjour toto'); assert.ok(u.nope.some(n => n.k === 'what'), 'pas compris quoi chercher');
        u = P('les monuments près de Treignac'); assert.deepStrictEqual([u.themes[0].id, u.around.name], ['monuments', 'Treignac']);
    });

    const B = await start();
    const p = B.page;
    try {
        const openKey = async k => { await p.evaluate(x => { const A = window.LCNDA_APP; A.state.listType = x; A.setModule('listes'); }, k); };
        const recap = async () => { await p.evaluate(() => { window.LCNDA_EXT.dataHome._st.view = 'recap'; window.LCNDA_EXT.dataHome._st.q = ''; }); await openKey('donnees'); await p.waitForSelector('[data-dr] [data-dr-body] .dr-trs', {timeout: 30000}); };
        const ask = async q => { await p.fill('[data-dr-q]', q); await p.press('[data-dr-q]', 'Enter'); await p.waitForSelector('[data-dr-body] .dr-ans', {timeout: 30000}); await p.waitForFunction(() => !document.querySelector('[data-dr-body] .ui-spinner, [data-dr-body] [aria-busy="true"]'), null, {timeout: 30000}).catch(() => {}); await sleep(200); };
        const rowsTxt = () => p.$$eval('.dr-row .dr-rtitle', a => a.map(x => x.textContent.trim()));
        const clickUndo = async () => { const u = p.locator('.toast button', {hasText: '↶'}).last(); await u.waitFor({timeout: 8000}); await u.click(); await sleep(400); };

        // un thème d'essai et une liste FABRIQUÉE : des courses de caisses à savon, près de Chamberet (Pierre LACOMBE, la fiche de départ, y est né en 1747)
        await p.evaluate(() => {
            const E = window.LCNDA_EXT;
            E.dataListThemes.push({id: 'essai', icon: '🧪', label: 'Thème d’essai', hint: 'des courses inventées', words: ['course de caisses', 'caisses a savon']});
            const rows = [{name: 'Grand prix de Chamberet', d: '1777-06-01', y: 1777, lat: 45.585, lon: 1.72, lieu: 'Chamberet', u: 'https://example.org/gp'},
                {name: 'Course de Paris', d: '1777-07-01', y: 1777, lat: 48.85, lon: 2.35, lieu: 'Paris', u: ''},
                {name: 'Course trop tard', d: '1790-05-01', y: 1790, lat: 45.55, lon: 1.79, lieu: 'Treignac', u: ''}];
            E.dataLists.push({id: 'test_caisses', icon: '🛷', label: 'Courses de caisses à savon', group: 'Le monde', theme: 'essai', source: 'Jeu d’essai', load: async () => rows,
                fields: [{key: 'name', label: 'Course', type: 'text'}, {key: 'd', label: 'Date', type: 'date'}, {key: 'lieu', label: 'Lieu', type: 'place'}, {key: 'u', label: 'Article', type: 'url'}],
                period: r => [r.y, r.y], geo: r => [r.lat, r.lon], open: () => { window.__opened = (window.__opened || 0) + 1; }});
            E.dataHome.HL.unshift({theme: 'essai', lists: ['test_caisses'], km: 30, one: '1 course près des lieux de la famille', many: '{n} courses près des lieux de la famille', q: 'les courses de caisses à savon près des lieux de la famille'});
            E.dataHome.resetHighlights();
        });
        await sleep(400);

        /* ═════════ 2. le récap ═════════ */
        await t('Listes → 🧰 Données s’ouvre sur 📊 Récap : la question, ses exemples, Pour ta famille, À faire, les thèmes ; 🧰 Thèmes à côté', async () => {
            await openKey('donnees'); await p.waitForSelector('[data-dr] .dr-trs', {timeout: 30000});
            assert.strictEqual(await p.getAttribute('[data-dr-q]', 'placeholder'), 'Pose une question sur les données…');
            assert.ok(await p.$$eval('[data-dr-ex] [data-dr-exq]', a => a.length) >= 3);
            assert.strictEqual(await p.getAttribute('[data-dr-view="recap"]', 'aria-pressed'), 'true');
            const n = await p.$$eval('[data-dr-theme]', a => a.map(x => x.dataset.drTheme)); assert.ok(n.length >= 21 && n.includes('sport') && n.includes('essai'), n.join(','));
            await p.waitForFunction(() => /\d+ \/ \d+ listes/.test(document.querySelector('[data-dr-tn="seismes"]')?.textContent || ''), null, {timeout: 30000});
            await p.waitForSelector('[data-dr-todo] li'); assert.match(await p.textContent('.dr-todo'), /À faire/);
            await p.waitForFunction(() => /course/.test(document.querySelector('[data-dr-hl]')?.textContent || ''), null, {timeout: 60000});
            const hl = await p.textContent('[data-dr-hl]'); assert.match(hl, /2 courses près des lieux de la famille/); assert.match(hl, /Grand prix de Chamberet 1777 \(\S+ [A-Z]+ avait \d+ ans\)/);
            assert.ok(await p.$$eval('[data-dr-hl] li', a => a.length) <= 4, 'au plus 4');
            assert.ok(await p.$$eval('[data-dr-ex] [data-dr-exq]', a => a.some(x => /caisses/.test(x.dataset.drExq))), 'les exemples tirés de « Pour ta famille »');
            await p.click('[data-dr-view="themes"]'); await p.waitForSelector('.ldt-overview .ldt-theme'); assert.ok(await p.$('.ldt-overview [data-dr-view="recap"]'), 'on revient au récap d’un clic');
            await p.click('.ldt-overview [data-dr-view="recap"]'); await p.waitForSelector('[data-dr] .dr-trs');
        });
        await t('un thème du récap s’ouvre (sa liste réunie, ou ses listes) ; « voir → » pose la question', async () => {
            await p.click('[data-dr-theme="essai"]'); await p.waitForFunction(() => window.LCNDA_APP.state.listType === 'data_theme_essai', null, {timeout: 10000});
            await recap(); await p.waitForSelector('[data-dr-hl] .dr-go');
            await p.click('[data-dr-hl] .dr-go'); await p.waitForSelector('.dr-ans .dr-pills');
            assert.match(await p.inputValue('[data-dr-q]'), /courses de caisses à savon près des lieux de la famille/);
            assert.match(await p.textContent('[data-dr-pill="where"]'), /les lieux de la famille/);
            assert.deepStrictEqual((await rowsTxt()).sort(), ['Course trop tard', 'Grand prix de Chamberet']);
        });

        /* ═════════ 3. une question ═════════ */
        await t('« … quand Pierre LACOMBE avait 30 ans » : Quoi · Qui · Quand (âge → années) · Où (déduit, en pointillé) + rayon du thème ; les lignes', async () => {
            await recap(); await ask('les courses de caisses à savon quand Pierre LACOMBE avait 30 ans');
            const pills = await p.$$eval('[data-dr-pill]', a => a.map(x => [x.dataset.drPill, x.textContent.replace(/\s+/g, ' ').trim(), x.classList.contains('is-auto')]));
            assert.deepStrictEqual(pills.map(x => x[0]), ['what', 'who', 'when', 'where']);
            assert.match(pills[0][1], /Thème d’essai › Courses de caisses à savon/); assert.match(pills[1][1], /Pierre LACOMBE, né en 1747/);
            assert.match(pills[2][1], /à 30 ans → 1777 → 1778/); assert.match(pills[3][1], /Chamberet \(là où il vivait\)/); assert.ok(pills[3][2], 'Où : déduit (pointillé)');
            assert.strictEqual(await p.inputValue('[data-dr-kmin]'), '30'); assert.match(await p.textContent('.dr-und'), /« près de » sans distance : 30 km/);
            assert.deepStrictEqual(await rowsTxt(), ['Grand prix de Chamberet']); assert.match(await p.textContent('.dr-row'), /Pierre LACOMBE, 30 ans/);
            assert.match(await p.textContent('.dr-why'), /« à 30 ans » : de sa naissance/);
        });
        await t('le rayon : + (pastille pleine), le nombre tapé ; la pastille Quand changée ; « Rien trouvé » propose plus loin', async () => {
            await p.click('[data-dr-km="1"]'); await p.waitForSelector('[data-dr-pill="where"].is-chg'); assert.strictEqual(await p.inputValue('[data-dr-kmin]'), '50');
            await p.fill('[data-dr-kmin]', '500'); await p.press('[data-dr-kmin]', 'Tab'); await p.waitForFunction(() => document.querySelectorAll('.dr-row').length === 2, null, {timeout: 10000});
            assert.deepStrictEqual((await rowsTxt()).sort(), ['Course de Paris', 'Grand prix de Chamberet']);
            await p.click('[data-dr-pill="when"]'); await p.waitForSelector('#dr-pop[data-dr-popf="when"]');
            await p.fill('[data-dr-a1]', ''); await p.fill('[data-dr-y1]', '1789'); await p.fill('[data-dr-y2]', '1791'); await p.click('#dr-pop button[type="submit"]');
            await p.waitForSelector('[data-dr-pill="when"].is-chg'); await p.waitForFunction(() => [...document.querySelectorAll('.dr-rtitle')].map(x => x.textContent).join() === 'Course trop tard', null, {timeout: 10000});
            assert.strictEqual(await p.inputValue('[data-dr-q]'), 'les courses de caisses à savon quand Pierre LACOMBE avait 30 ans', 'la phrase ne bouge pas');
            await p.fill('[data-dr-kmin]', '1'); await p.press('[data-dr-kmin]', 'Tab'); await p.waitForSelector('.dr-none [data-dr-widen]');
            assert.match(await p.textContent('.dr-none'), /Rien trouvé/);
        });
        await t('« à 20 km de Tulle » dans la phrase : le rayon tapé ; la pastille Où change le lieu ; Quoi change de liste', async () => {
            await ask('les courses de caisses à savon à 20 km de Tulle');
            assert.strictEqual(await p.inputValue('[data-dr-kmin]'), '20'); assert.match(await p.textContent('[data-dr-pill="where"]'), /Tulle/);
            assert.ok(!/sans distance/.test(await p.textContent('.dr-und')));
            await p.click('[data-dr-pill="where"]'); await p.fill('[data-dr-place]', 'Treignac'); await p.fill('[data-dr-popkm]', '15'); await p.click('#dr-pop button[type="submit"]');
            await p.waitForFunction(() => /Treignac/.test(document.querySelector('[data-dr-pill="where"]')?.textContent || ''), null, {timeout: 10000});
            assert.deepStrictEqual((await rowsTxt()).sort(), ['Course trop tard', 'Grand prix de Chamberet']);
        });
        await t('📎 🧺 sur une ligne et sur plusieurs (la page de la réponse, pas celle du moteur) ; ↗ ; ouvrir une ligne', async () => {
            await p.evaluate(() => { const CH = window.LCNDA_EXT.listesChoix; window.__acts = []; CH.__act = CH.act; CH.act = (k, rows, a, api) => { window.__acts.push([k, rows.map(r => r.name), api?.d?.id, api?.table2d(rows)[0]]); }; });
            await p.click('.dr-row [data-dr-bk]'); await p.click('.dr-row [data-dr-ins]');
            await p.check('[data-dr-ck="0"]'); await p.check('[data-dr-ck="1"]'); await p.waitForSelector('.dr-selbar'); assert.match(await p.textContent('.dr-selbar'), /2 choisies/);
            await p.click('[data-dr-selbk]'); await p.click('[data-dr-selx]'); assert.strictEqual(await p.$('.dr-selbar'), null);
            const acts = await p.evaluate(() => { const CH = window.LCNDA_EXT.listesChoix; CH.act = CH.__act; return window.__acts; });
            assert.deepStrictEqual(acts.map(a => [a[0], a[1].length, a[2]]), [['basket', 1, 'test_caisses'], ['insert', 1, 'test_caisses'], ['basket', 2, 'test_caisses']]);
            assert.deepStrictEqual(acts[0][3], ['Course', 'Date', 'Lieu'], 'le tableau pour le panier : les colonnes de la liste');
            assert.ok(await p.$('.dr-row a.dr-ib[href="https://example.org/gp"][target="_blank"]'), '↗ la source');
            await p.click('.dr-row [data-dr-openrow]'); assert.ok(await p.evaluate(() => window.__opened >= 1));
        });
        await t('« Ouvrir la liste complète » : la liste, avec les mêmes critères (📍 Treignac · 15 km)', async () => {
            await p.click('[data-dr-open-list]'); await p.waitForSelector('[data-ld-page="test_caisses"] [data-ld-chips] .ui-listbar-chip', {timeout: 20000});
            assert.match(await p.textContent('[data-ld-chips]'), /15 km autour de Treignac/);
        });
        await t('« Je n’ai pas compris : … » honnête, avec des suggestions ; une question sur la famille → 🔍 Recherche', async () => {
            await recap(); await ask('les gens célèbres qui ont dormi à Treignac');
            assert.match(await p.textContent('.dr-nope'), /« dormi » : je ne sais pas le chercher dans les listes/); assert.ok(await p.$$eval('.dr-nope [data-dr-exq]', a => a.length) >= 2);
            await ask('les enfants de Pierre LACOMBE');
            assert.match(await p.textContent('.dr-nope'), /Recherche → « Poser une question en français »/); assert.strictEqual(await p.$('.dr-und'), null);
            await p.click('[data-dr-askfam]'); await p.waitForFunction(() => window.LCNDA_APP.state.module === 'recherche', null, {timeout: 10000});
            assert.strictEqual(await p.evaluate(() => window.LCNDA_APP.state.hQuestion), 'les enfants de Pierre LACOMBE');
        });
        await t('le rayon par thème : une seule table (séismes 150, musées 30, crues 10) ; changé dans Réglages (↶ Annuler) ; utilisé par la question', async () => {
            assert.deepStrictEqual(await p.evaluate(() => { const H = window.LCNDA_EXT.dataHome; return [H.radiusOf('seismes'), H.radiusOf('images'), H.radiusOf('eaux'), H.radiusOf('guerres')]; }), [150, 30, 10, 50]);
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'listes_donnees_reglages'; A.setModule('maintenance'); });
            await p.waitForSelector('[data-dr-rad="eaux"]'); await p.fill('[data-dr-rad="eaux"]', '25'); await p.press('[data-dr-rad="eaux"]', 'Tab'); await sleep(200);
            assert.strictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-donnees-rayons')).eaux), 25);
            await recap(); await ask('les crues près de Tulle'); assert.strictEqual(await p.inputValue('[data-dr-kmin]'), '25');
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'listes_donnees_reglages'; A.setModule('maintenance'); });
            await p.waitForSelector('[data-dr-rad="eaux"]'); await p.fill('[data-dr-rad="eaux"]', '40'); await p.press('[data-dr-rad="eaux"]', 'Tab'); await clickUndo();
            assert.strictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-donnees-rayons')).eaux), 25, '↶ Annuler');
            await p.evaluate(() => localStorage.removeItem('genealogie-donnees-rayons'));
        });

        /* ═════════ 4. ⌘K, la place, deux portes, consultation, téléphone ═════════ */
        await t('⌘K : « 📊 Demander aux données : « … » » quand la phrase nomme un thème ; la réponse n’est calculée qu’au choix', async () => {
            const r = await p.evaluate(() => { const H = window.LCNDA_EXT.dataHome; let n = 0; const f = window.LCNDA_EXT.dataAsk; window.LCNDA_EXT.dataAsk = q => { n++; return f(q); };
                const a = H.provider('les séismes près de Tulle'), b = H.provider('Pierre LACOMBE'), c = H.provider('les enfants de Pierre LACOMBE'); window.LCNDA_EXT.dataAsk = f;
                return {a: a.map(x => [x.label, typeof x.go, 'live' in x]), b: b.length, c: c.length, n, inList: window.LCNDA_EXT.quickSearchProviders.includes(H.provider)}; });
            assert.deepStrictEqual(r.a, [['📊 Demander aux données : « les séismes près de Tulle »', 'function', false]]); assert.strictEqual(r.b, 0); assert.strictEqual(r.c, 0); assert.strictEqual(r.n, 0); assert.ok(r.inList);
            await p.evaluate(() => window.LCNDA_EXT.dataHome.provider('les courses de caisses à savon près de Treignac')[0].go());
            await p.waitForSelector('[data-dr] .dr-ans .dr-pills', {timeout: 20000}); assert.strictEqual(await p.inputValue('[data-dr-q]'), 'les courses de caisses à savon près de Treignac');
            assert.strictEqual(await p.evaluate(() => window.LCNDA_APP.state.module), 'listes');
        });
        await t('l’onglet 📊 Données : dans le catalogue (caché au départ, comme 🧺 Paniers) ; Réglages : Listes / l’onglet / les deux (↶), jamais aucun', async () => {
            const cat = await p.evaluate(() => window.LCNDA_EXT.tabsPlus.catalog().find(x => x.k === 'donnees')); assert.ok(cat && cat.g === 1 && cat.module === 'donnees' && cat.icon === '📊', JSON.stringify(cat));
            assert.ok(await p.evaluate(() => window.LCNDA_APP.menuHiddenKeys().includes('donnees')), 'caché au départ'); assert.strictEqual(await p.evaluate(() => window.LCNDA_EXT.dataHome.place()), 'listes');
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'listes_donnees_reglages'; A.setModule('maintenance'); });
            await p.waitForSelector('input[name="dr-place"][value="onglet"]'); await p.check('input[name="dr-place"][value="onglet"]'); await sleep(300);
            assert.strictEqual(await p.evaluate(() => window.LCNDA_EXT.dataHome.place()), 'onglet');
            await p.waitForFunction(() => { const b = document.querySelector('.main-nav [data-module="donnees"]'); return b && !b.hidden && getComputedStyle(b).display !== 'none'; }, null, {timeout: 8000});
            await openKey('data_hist_gares'); await sleep(600);
            const side = await p.$$eval('[data-side-value]', a => a.map(b => b.dataset.sideValue)); assert.ok(!side.includes('donnees') && !side.some(k => k.startsWith('data_theme_')), 'Listes ne montre plus 🧰 Données');
            await p.click('.main-nav [data-module="donnees"]'); await p.waitForSelector('[data-dr][data-dr-door="onglet"]', {timeout: 20000}); // la même vue que par Listes (ici : la dernière question)
            assert.match(await p.textContent('[data-dr] .page-header .eyebrow'), /📊 Données/);
            // jamais aucun : l'onglet caché ailleurs (Réglages → Menus) → les données reviennent dans Listes
            await p.evaluate(() => { const h = JSON.parse(localStorage.getItem('genealogie-menu-hidden') || '[]'); h.push('donnees'); localStorage.setItem('genealogie-menu-hidden', JSON.stringify(h)); window.LCNDA_APP.applyMenuOrder(); });
            assert.strictEqual(await p.evaluate(() => window.LCNDA_EXT.dataHome.place()), 'listes'); await recap();
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'listes_donnees_reglages'; A.setModule('maintenance'); });
            await p.waitForSelector('input[name="dr-place"][value="deux"]'); await p.check('input[name="dr-place"][value="deux"]'); await sleep(300);
            assert.strictEqual(await p.evaluate(() => window.LCNDA_EXT.dataHome.place()), 'deux');
            await p.check('input[name="dr-place"][value="listes"]'); await sleep(200); assert.strictEqual(await p.evaluate(() => window.LCNDA_EXT.dataHome.place()), 'listes');
            await clickUndo(); assert.strictEqual(await p.evaluate(() => window.LCNDA_EXT.dataHome.place()), 'deux', '↶ Annuler');
        });
        await t('le MÊME écran aux deux portes : même HTML (au fil d’Ariane près)', async () => {
            const norm = () => p.evaluate(() => { const c = document.querySelector('[data-dr]').cloneNode(true); c.removeAttribute('data-dr-door'); c.querySelectorAll('.page-header .eyebrow, [data-ph-where]').forEach(x => { x.textContent = ''; x.removeAttribute('data-ph-where'); }); return c.innerHTML.replace(/ data-ia-done="1"/g, ''); });
            await recap(); await sleep(1500); const a = await norm();
            await p.evaluate(() => window.LCNDA_APP.setModule('donnees')); await p.waitForSelector('[data-dr][data-dr-door="onglet"] .dr-trs'); await sleep(1500); const b = await norm();
            assert.ok(a.length > 2000); assert.strictEqual(a, b);
            await p.evaluate(() => window.LCNDA_EXT.dataHome.setPlace('listes', {undo: false}));
        });
        await t('mode consultation : pas d’« À faire », 📎 🧺 éteints avec la raison, les réglages ne changent pas', async () => {
            await p.evaluate(() => document.body.classList.add('is-kiosk'));
            await recap(); assert.strictEqual(await p.$('.dr-todo'), null);
            await ask('les courses de caisses à savon près de Treignac'); await p.waitForSelector('.dr-row');
            assert.ok(await p.$eval('.dr-row [data-dr-bk]', b => b.disabled && /consultation/.test(b.title)));
            assert.strictEqual(await p.$('.dr-row a.dr-ib'), null, 'pas de lien ↗ en consultation');
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'listes_donnees_reglages'; A.setModule('maintenance'); });
            await p.waitForSelector('input[name="dr-place"]'); assert.ok(await p.$eval('input[name="dr-place"]', i => i.disabled)); assert.ok(await p.$eval('[data-dr-rad="seismes"]', i => i.disabled));
            await p.evaluate(() => document.body.classList.remove('is-kiosk'));
        });
        await t('390 px, en sombre : rien ne déborde de côté ; 3 thèmes puis « ⌄ 17 autres » ; les pastilles passent à la ligne', async () => {
            await p.setViewportSize({width: 390, height: 844}); await p.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
            await recap(); await sleep(500);
            assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'pas de défilement de côté (récap)');
            assert.strictEqual(await p.$$eval('.dr-tr', a => a.filter(x => getComputedStyle(x).display !== 'none').length), 3);
            await p.click('[data-dr-trs-more]'); assert.ok(await p.$$eval('.dr-tr', a => a.filter(x => getComputedStyle(x).display !== 'none').length) >= 20);
            await ask('les courses de caisses à savon quand Pierre LACOMBE avait 30 ans');
            assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'pas de défilement de côté (réponse)');
            const r = await p.evaluate(() => { const b = document.querySelector('.dr-ask').getBoundingClientRect(); return [b.left, innerWidth - b.right]; }); assert.ok(r[0] >= 8 && r[1] >= 8, 'rien de collé aux bords : ' + r);
            assert.ok(await p.$eval('.dr-row [data-dr-bk]', b => b.getBoundingClientRect().width >= 36), '🧺 assez grand pour le doigt');
            await p.setViewportSize({width: 1440, height: 900}); await p.evaluate(() => document.documentElement.removeAttribute('data-theme'));
        });
        await t('aucune erreur dans la page', async () => { assert.deepStrictEqual(B.errs, []); });
    } finally {
        await B.stop();
    }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
