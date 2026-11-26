#!/usr/bin/env node
/* 📊 L'onglet Données du haut : ce qu'on y ouvre Y RESTE (assets/js/app-donnees-onglet.js ; le moteur app-listes-donnees.js, les thèmes
 *   app-listes-themes.js, l'écran app-donnees-accueil.js ; app.js : la colonne et l'adresse).
 *  1. un thème cliqué (récap, cartes, colonne) reste dans 📊 Données : module « donnees », l'onglet du haut allumé, « 📊 Données · ⚔️ Guerres et soldats » ;
 *     liste réunie 🔀, « Les N listes », une liste, « ← Tous les thèmes », le bouton ← du navigateur, un lien direct (#donnees/data_theme_guerres) ;
 *  2. la colonne : 📊 Récap, 🧰 Tous les thèmes, les thèmes en groupes repliables (le dessin des groupes de Listes, sans cartes numérotées),
 *     🔀 d'abord puis les listes ; le groupe ouvert retenu ; celui de la page ouverte s'ouvre tout seul ;
 *  3. ranger : Alt + ↓, glisser, « ⋯ » masquer, « Afficher les thèmes masqués », « Réordonner » (↑ ↓, cases), ↶ Annuler, gardé après rechargement,
 *     les cartes de « Toutes les données » dans le même ordre, « ↺ Rétablir l'ordre de départ » ;
 *  4. Listes ne change pas (sa colonne, ses liens, son fil d'Ariane) ; 390 px en sombre ; aucune erreur.
 * Base : tests/prendre-depuis-seed.js.   node tests/test-donnees-onglet.js */
'use strict';
const assert = require('assert');
const {start, sleep} = require('./prendre-depuis-seed.js');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 8).join('\n  ')); } };

(async () => {
    const B = await start();
    const p = B.page;
    try {
        const st = () => p.evaluate(() => ({module: window.LCNDA_APP.state.module, hash: location.hash, crumb: document.querySelector('#workspace .page-header .eyebrow')?.textContent.trim() || '',
            tab: document.querySelector('.main-nav .nav-item.is-active')?.dataset.module || '', active: document.querySelector('#sidebar-content .side-menu-item.is-active')?.dataset.sideValue || ''}));
        const idle = async () => { await sleep(400); await p.waitForFunction(() => !document.querySelector('#workspace .loading-screen, #workspace .ld-page .ui-spinner'), null, {timeout: 30000}).catch(() => {}); await sleep(300); };
        const sideThemes = () => p.$$eval('#sidebar-content [data-dno-theme]:not([hidden])', a => a.map(x => x.dataset.dnoTheme));
        const cardThemes = () => p.$$eval('#workspace [data-ldt-themes] [data-ldt-theme]:not([hidden])', a => a.map(x => x.dataset.ldtTheme));
        const clickUndo = async () => { const u = p.locator('.toast button', {hasText: '↶'}).last(); await u.waitFor({timeout: 8000}); await u.click(); await sleep(400); };
        const home = async (view = 'recap') => { await p.evaluate(v => { window.LCNDA_EXT.dataHome.setPlace('deux', {undo: false}); window.LCNDA_EXT.donneesOnglet.open(v === 'themes' ? 'dno_themes' : 'dno_recap'); window.LCNDA_APP.setModule('donnees'); }, view); await p.waitForSelector(view === 'themes' ? '#workspace .ldt-overview [data-ldt-theme]' : '[data-dr] [data-dr-theme]', {timeout: 30000}); await idle(); };
        const DEF = await p.evaluate(() => window.LCNDA_EXT.listesThemes.themeList().map(x => x.id));

        /* ═════════ 1. on reste dans 📊 Données ═════════ */
        await t('un thème du récap s’ouvre DANS Données : module, onglet du haut, fil d’Ariane « 📊 Données · ⚔️ Guerres et soldats », adresse', async () => {
            await home();
            await p.click('[data-dr-theme="guerres"]'); await idle();
            const s = await st();
            assert.strictEqual(s.module, 'donnees'); assert.strictEqual(s.tab, 'donnees', 'l’onglet du haut reste allumé'); assert.strictEqual(s.hash, '#donnees/data_theme_guerres');
            assert.match(s.crumb, /^📊 Données · ⚔️ Guerres et soldats$/, s.crumb); assert.ok(!/Listes/.test(s.crumb));
            assert.ok(await p.$('.ldt-tabs [data-ldt-back]'), 'les onglets du thème'); assert.strictEqual(s.active, 'data_theme_guerres');
        });
        await t('🔀 une autre liste réunie, « Les N listes », une liste, ← Tous les thèmes : tout reste dans Données ; ← du navigateur aussi', async () => {
            const mg = await p.$$eval('.ldt-tabs [data-ldt-tab]', a => a.map(b => b.dataset.ldtTab).filter(x => x !== 'lists'));
            if (mg.length > 1) { await p.click(`.ldt-tabs [data-ldt-tab="${mg[1]}"]`); await idle(); assert.strictEqual((await st()).module, 'donnees'); assert.match((await st()).crumb, /^📊 Données/); }
            await p.click('.ldt-tabs [data-ldt-tab="lists"]'); await idle();
            assert.ok(await p.$$eval('[data-ldt-cards] .ld-card', a => a.length) > 3); assert.strictEqual((await st()).module, 'donnees');
            const merged = await p.$('[data-ldt-cards] .ld-card.is-merged');
            if (merged) { await merged.click(); await idle(); const s = await st(); assert.strictEqual(s.module, 'donnees'); assert.match(s.hash, /^#donnees\/data_\w+$/); assert.match(s.crumb, /^📊 Données · ⚔️/);
                await p.goBack(); await idle(); assert.strictEqual((await st()).hash, '#donnees/data_theme_guerres'); await p.click('.ldt-tabs [data-ldt-tab="lists"]'); await idle(); }
            const key = await p.$eval('[data-ldt-cards] .ld-card:not(.is-merged)', b => b.dataset.ldGo);
            await p.click(`[data-ldt-cards] .ld-card[data-ld-go="${key}"]`); await idle();
            let s = await st(); assert.deepStrictEqual([s.module, s.hash, s.tab, s.active], ['donnees', `#donnees/${key}`, 'donnees', key]); assert.match(s.crumb, /^📊 Données · ⚔️ Guerres et soldats$/);
            assert.ok(await p.$(`#sidebar-content details[data-dno-theme="guerres"][open] [data-side-value="${key}"].is-active`), 'la liste allumée sous son thème ouvert');
            await p.goBack(); await idle(); s = await st(); assert.deepStrictEqual([s.module, s.hash], ['donnees', '#donnees/data_theme_guerres']);
            await p.goForward(); await idle(); assert.strictEqual((await st()).hash, `#donnees/${key}`);
            await p.goBack(); await idle();
            await p.click('.ldt-tabs [data-ldt-back]'); await idle();
            s = await st(); assert.deepStrictEqual([s.module, s.hash, s.active], ['donnees', '#donnees/themes', 'dno_themes']);
            assert.ok(await p.$('#workspace .ldt-overview [data-ldt-theme="guerres"]'), 'les cartes des thèmes, dans Données');
            await p.click('#workspace [data-ldt-theme="eaux"]'); await idle(); s = await st(); assert.deepStrictEqual([s.module, s.hash], ['donnees', '#donnees/data_theme_eaux']);
            await p.goBack(); await idle(); assert.strictEqual((await st()).hash, '#donnees/themes'); assert.ok(await p.$('#workspace .ldt-overview'));
        });
        await t('un lien direct #donnees/data_theme_guerres (après rechargement) ouvre le thème dans Données', async () => {
            await p.evaluate(() => { localStorage.removeItem('lcnda-donnees-ouvert'); window.LCNDA_EXT.donneesOnglet.open('dno_recap'); }); await idle(); // pas de page retenue : seule l'adresse compte
            await p.goto(B.base + '#donnees/data_theme_guerres'); await p.waitForFunction(() => window.LCNDA_APP?.state?.module === 'donnees', null, {timeout: 60000});
            await p.waitForSelector('.ldt-tabs [data-ldt-back]', {timeout: 30000}); await idle();
            const s = await st(); assert.deepStrictEqual([s.module, s.hash, s.active], ['donnees', '#donnees/data_theme_guerres', 'data_theme_guerres']);
        });

        await t('une question posée (⌘K) depuis une page de liste de Données : la réponse, pas la liste d’avant', async () => {
            await p.evaluate(() => window.LCNDA_EXT.dataHome.ask('les crues près de Tulle')); await p.waitForSelector('[data-dr] [data-dr-body] .dr-ans', {timeout: 30000}); await idle();
            const s = await st(); assert.deepStrictEqual([s.module, s.hash, s.active], ['donnees', '#donnees', 'dno_recap']);
        });

        /* ═════════ 2. la colonne ═════════ */
        await t('la colonne : 📊 Récap, 🧰 Tous les thèmes, puis les thèmes en groupes repliables (pas de cartes numérotées) ; 🔀 d’abord ; le groupe ouvert retenu', async () => {
            await home();
            const top = await p.$$eval('#sidebar-content .dno-top [data-side-value]', a => a.map(b => [b.dataset.sideValue, b.textContent.trim()]));
            assert.deepStrictEqual(top.map(x => x[0]), ['dno_recap', 'dno_themes']); assert.match(top[0][1], /Récap/); assert.match(top[1][1], /Tous les thèmes/);
            assert.strictEqual((await st()).active, 'dno_recap');
            assert.deepStrictEqual(await sideThemes(), DEF, 'les 20 thèmes, dans l’ordre de départ');
            assert.strictEqual(await p.$$eval('#sidebar-content details.mt-group > summary .mt-glabel', a => a.length), DEF.length, 'le titre des groupes de Listes');
            assert.strictEqual(await p.$$eval('#sidebar-content [data-side-value^="data_theme_"]', a => a.filter(b => !b.closest('details.mt-group')).length), 0, 'pas de grosses cartes de thème');
            const g = await p.$eval('#sidebar-content summary[data-dno-sum="guerres"]', s => [s.querySelector('.mt-gicon').textContent, s.querySelector('.mt-glabel').textContent, s.querySelector('small').textContent]);
            assert.deepStrictEqual(g.slice(0, 2), ['⚔️', 'Guerres et soldats']); assert.match(g[2], /^\d+$/);
            const items = await p.$$eval('#sidebar-content details[data-dno-theme="guerres"] .mt-gitems [data-side-value]', a => a.map(b => b.dataset.sideValue));
            const merged = await p.evaluate(() => { const E = window.LCNDA_EXT; return E.listesThemes.index().by.get('guerres').filter(d => d.merged && !d.link).map(d => E.dataListsEngine.keyOf(d)); });
            assert.strictEqual(items[0], 'data_theme_guerres'); assert.deepStrictEqual(items.slice(1, 1 + merged.length), merged, '🔀 d’abord');
            assert.strictEqual(await p.$eval('details[data-dno-theme="eaux"]', d => d.open), false, 'replié au départ');
            await p.click('summary[data-dno-sum="eaux"]'); await sleep(200);
            assert.strictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-donnees-themes-ouverts')).eaux), true);
            await p.evaluate(() => window.LCNDA_APP.renderSidebar()); await sleep(200);
            assert.strictEqual(await p.$eval('details[data-dno-theme="eaux"]', d => d.open), true, 'retenu');
            await p.click('summary[data-dno-sum="eaux"]'); await sleep(200); await p.evaluate(() => window.LCNDA_APP.renderSidebar()); await sleep(200);
            assert.strictEqual(await p.$eval('details[data-dno-theme="eaux"]', d => d.open), false);
            // un clic sur une liste de la colonne : elle s'ouvre dans Données
            await p.click('summary[data-dno-sum="ciel"]'); await sleep(200);
            const k = await p.$eval('details[data-dno-theme="ciel"] .mt-gitems [data-side-value]:last-child', b => b.dataset.sideValue);
            await p.click(`#sidebar-content [data-side-value="${k}"]`); await idle();
            const s = await st(); assert.deepStrictEqual([s.module, s.hash, s.active], ['donnees', `#donnees/${k}`, k]); assert.match(s.crumb, /^📊 Données · ⛅ Climat, ciel et saisons$/);
            assert.ok(await p.$('details[data-dno-theme="ciel"].is-current[open]'));
            await p.click('#sidebar-content [data-side-value="dno_themes"]'); await idle(); assert.strictEqual((await st()).hash, '#donnees/themes');
            const gap = await p.$$eval('details[data-dno-theme="ciel"] .mt-gitems > .side-menu-item', a => a[1].getBoundingClientRect().top - a[0].getBoundingClientRect().bottom);
            assert.ok(Math.abs(gap - 9) < 1.5, `9 px entre les cartes (${gap})`);
            await p.click('summary[data-dno-sum="ciel"]'); await sleep(150);
        });

        /* ═════════ 3. ranger, masquer, afficher ═════════ */
        await t('ranger : Alt + ↓, glisser, ↶ Annuler ; les cartes de « Toutes les données » dans le même ordre', async () => {
            await home('themes');
            await p.focus('summary[data-dno-sum="seismes"]'); await p.keyboard.press('Alt+ArrowDown'); await sleep(400);
            let side = await sideThemes(); assert.deepStrictEqual(side.slice(0, 2), [DEF[1], 'seismes']);
            assert.strictEqual(await p.evaluate(() => document.activeElement?.dataset.dnoSum), 'seismes', 'le titre garde le clavier');
            assert.deepStrictEqual((await cardThemes()).slice(0, 2), [DEF[1], 'seismes'], 'les cartes suivent');
            assert.deepStrictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-donnees-themes')).order.slice(0, 2)), [DEF[1], 'seismes']);
            await clickUndo(); assert.deepStrictEqual(await sideThemes(), DEF, '↶'); assert.strictEqual(await p.evaluate(() => localStorage.getItem('genealogie-donnees-themes')), null);
            await p.dragAndDrop('summary[data-dno-sum="guerres"]', 'summary[data-dno-sum="seismes"]'); await sleep(400);
            side = await sideThemes(); assert.strictEqual(side[0], 'guerres', side.join(',')); assert.strictEqual((await cardThemes())[0], 'guerres');
            await clickUndo(); assert.deepStrictEqual(await sideThemes(), DEF);
        });
        await t('masquer (⋯), « Afficher les thèmes masqués », « Réordonner » (↑ ↓, cases), gardé après rechargement, ↺ Rétablir l’ordre de départ', async () => {
            await p.evaluate(() => window.LCNDA_EXT.donneesOnglet.reset()); await sleep(300);
            await p.click('[data-dno-more="ciel"]'); await p.locator('.ui-actmenu button, [role="menu"] button', {hasText: 'Masquer ce thème'}).first().click(); await sleep(400);
            assert.ok(!(await sideThemes()).includes('ciel')); assert.ok(!(await cardThemes()).includes('ciel'), 'la carte aussi');
            await clickUndo(); assert.ok((await sideThemes()).includes('ciel'), '↶ remet le thème');
            await p.click('[data-dno-more="ciel"]'); await p.locator('.ui-actmenu button, [role="menu"] button', {hasText: 'Masquer ce thème'}).first().click(); await sleep(400);
            await p.check('[data-dno-showhid]'); await sleep(300);
            assert.ok((await sideThemes()).includes('ciel')); assert.ok(await p.$('details[data-dno-theme="ciel"].dno-is-hidden')); assert.ok((await cardThemes()).includes('ciel'));
            await p.uncheck('[data-dno-showhid]'); await sleep(300); assert.ok(!(await sideThemes()).includes('ciel'));
            await p.evaluate(() => window.LCNDA_EXT.donneesOnglet.setHidden('ciel', false)); await sleep(300); assert.ok((await sideThemes()).includes('ciel'));
            // la fenêtre Réordonner
            await p.evaluate(() => document.querySelectorAll('.toast').forEach(x => x.remove())); await p.click('[data-dno-reorder]'); await p.waitForSelector('.dno-reorder[open]');
            for (let i = 0; i < 2; i++) { await p.waitForSelector('.dno-reorder [data-dno-row="seismes"][data-ord-row] .dnd-grip[data-grip-done]'); await sleep(200); await p.focus('.dno-reorder [data-dno-row="seismes"] .dnd-grip'); await p.keyboard.press('Alt+ArrowDown');
                await p.waitForFunction(n => [...document.querySelectorAll('.dno-reorder [data-dno-row]')].findIndex(r => r.dataset.dnoRow === 'seismes') === n, i + 1, {timeout: 8000}); } // ⠿ au clavier (heritage-dnd.js : les flèches ↑ ↓ cachées à la souris)
            assert.deepStrictEqual(await p.$$eval('.dno-reorder [data-dno-row]', a => a.slice(0, 3).map(r => r.dataset.dnoRow)), [DEF[1], DEF[2], 'seismes']);
            await p.uncheck('.dno-reorder [data-dno-vis="images"]');
            await p.click('.dno-reorder [data-save]'); await sleep(400);
            const want = DEF.filter(x => x !== 'seismes' && x !== 'images'); want.splice(2, 0, 'seismes');
            assert.deepStrictEqual(await sideThemes(), want); assert.deepStrictEqual(await cardThemes(), want);
            const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-donnees-themes'))); assert.deepStrictEqual(saved.hidden, ['images']);
            await p.reload(); await p.waitForFunction(() => window.LCNDA_APP?.state?.module === 'donnees', null, {timeout: 60000}); await p.waitForSelector('#workspace .ldt-overview [data-ldt-theme]', {timeout: 30000}); await idle();
            assert.deepStrictEqual(await sideThemes(), want, 'gardé après rechargement'); assert.deepStrictEqual(await cardThemes(), want);
            await p.evaluate(() => document.querySelectorAll('.toast').forEach(x => x.remove())); await p.click('[data-dno-reset]'); await sleep(400);
            assert.deepStrictEqual(await sideThemes(), DEF); assert.deepStrictEqual(await cardThemes(), DEF); assert.strictEqual(await p.evaluate(() => localStorage.getItem('genealogie-donnees-themes')), null);
            await clickUndo(); assert.deepStrictEqual(await sideThemes(), want, '↶ après ↺');
            await p.evaluate(() => window.LCNDA_EXT.donneesOnglet.reset()); await sleep(300); assert.deepStrictEqual(await sideThemes(), DEF);
        });

        /* ═════════ 4. Listes ne change pas ═════════ */
        await t('Listes : sa colonne, ses liens et son fil d’Ariane comme avant (le thème s’ouvre dans Listes)', async () => {
            await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => { d.close(); d.remove(); }));
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.listType = 'data_theme_guerres'; A.setModule('listes'); }); await p.waitForSelector('.ldt-tabs [data-ldt-back]', {timeout: 30000}); await idle();
            let s = await st(); assert.deepStrictEqual([s.module, s.hash], ['listes', '#listes']); assert.match(s.crumb, /^Listes · 🧰 Données · ⚔️ Guerres et soldats$/);
            assert.ok(!(await p.$('#sidebar-content [data-dno-side]')), 'la colonne de Listes'); assert.ok(await p.$('#sidebar-content [data-side-value="data_theme_guerres"].is-active'));
            await p.click('.ldt-tabs [data-ldt-tab="lists"]'); await idle();
            const key = await p.$eval('[data-ldt-cards] .ld-card:not(.is-merged)', b => b.dataset.ldGo); await p.click(`[data-ldt-cards] .ld-card[data-ld-go="${key}"]`); await idle();
            s = await st(); assert.strictEqual(s.module, 'listes'); assert.strictEqual(await p.evaluate(() => window.LCNDA_APP.state.listType), key); assert.match(s.crumb, /^Listes · 🧰 Données/);
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.listType = 'data_theme_guerres'; A.renderSidebar(); window.LCNDA_EXT.lists.data_theme_guerres(++A.state.workspaceToken); }); await idle();
            await p.click('.ldt-tabs [data-ldt-back]'); await idle();
            assert.deepStrictEqual([await p.evaluate(() => window.LCNDA_APP.state.module), await p.evaluate(() => window.LCNDA_APP.state.listType)], ['listes', 'donnees']);
            // la page de Données n'a pas bougé pendant ce temps
            await p.evaluate(() => window.LCNDA_APP.setModule('donnees')); await idle(); assert.strictEqual((await st()).hash, '#donnees/themes');
        });

        /* ═════════ 5. 390 px, en sombre ═════════ */
        await t('390 px, en sombre : rien ne déborde, la colonne comme les autres onglets, rien de collé', async () => {
            await p.setViewportSize({width: 390, height: 844});
            await p.evaluate(() => { localStorage.setItem('genealogie-design', JSON.stringify({...JSON.parse(localStorage.getItem('genealogie-design') || '{}'), preset: 'dark'})); window.LCNDA_APP.applyDesign(); });
            await p.evaluate(() => window.LCNDA_EXT.donneesOnglet.open('data_theme_guerres')); await idle();
            assert.strictEqual(await p.evaluate(() => document.documentElement.scrollWidth), 390);
            const r = await p.evaluate(() => { const c = document.getElementById('sidebar-content'), box = c.getBoundingClientRect(), right = box.left + c.clientWidth;
                return [...c.querySelectorAll('.side-menu-item:not([hidden]), details.mt-group > summary')].filter(x => x.offsetParent).map(x => right - x.getBoundingClientRect().right); });
            assert.ok(r.length && Math.min(...r) >= 12, `12 px du bord de la colonne (${Math.min(...r)})`);
            const bg = await p.$eval('#sidebar-content summary[data-dno-sum="guerres"] .mt-glabel', e => getComputedStyle(e).color); assert.ok(!/rgb\(0, 0, 0\)/.test(bg), bg);
            assert.ok(await p.evaluate(() => !document.getElementById('app').classList.contains('no-side')), 'une colonne, comme Listes');
            await p.setViewportSize({width: 1440, height: 900});
        });

        await t('aucune erreur dans la page', async () => { assert.deepStrictEqual(B.errs, []); });
    } finally {
        await B.stop();
    }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})();
