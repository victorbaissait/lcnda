#!/usr/bin/env node
/* 📊 Données téléchargées (assets/js/heritage-atelier-donnees.js + le choix commun LCNDA_EXT.dataListPicker d'app-listes-themes.js) :
 *  1. le widget d'un projet de l'Atelier : « ＋ Widget » → « 📊 Données téléchargées » ; réglé DANS le widget (aucune fenêtre) ;
 *     🔍 la recherche, les pastilles des thèmes, ↑ ↓ Entrée ; les filtres (période, près des lieux de la famille) ; ↗ source sur chaque
 *     ligne ; « Ouvrir la liste » ; gardé après un rechargement ; ✕ Retirer et ↶ Annuler ; rien n'est lu avant d'être visible ;
 *  2. sans données téléchargées : une phrase calme qui mène à Données ;
 *  3. le widget du tableau de bord (registre) ; « Widget du tableau de bord » le propose ;
 *  4. l'élément « 📊 Une donnée téléchargée » : ＋ Ajouter ▾ (juste après « 🔗 Venant du logiciel ») et « Quoi ? » ; une ligne cochée ;
 *     toute la liste filtrée ; gardés dans la base (texte et source, pas le pack) ; l'aperçu vivant avec ↗ source ; l'export .md ;
 *  5. 📥 Prendre depuis… → Données : le même choix (🔍, pastilles, clavier) → l'étape 2 ;
 *  6. 390 px, sombre : rien ne déborde, rien de collé ; aucune erreur.
 * Base : tests/prendre-depuis-seed.js (Chamberet, Treignac, Tulle…).   node tests/test-widget-donnees.js */
'use strict';
const assert = require('assert');
const {start, sleep} = require('./prendre-depuis-seed.js');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 8).join('\n  ')); } };

/* une liste FABRIQUÉE, enregistrée avant le chargement de l'app (elle revient donc après un rechargement) */
const FAKE = () => {
    const E = window.LCNDA_EXT = window.LCNDA_EXT || {};
    window.__loads = 0;
    const rows = [{name: 'Grand prix de Chamberet', d: '1777-06-01', y: 1777, lat: 45.585, lon: 1.72, lieu: 'Chamberet', u: 'https://example.org/gp'},
        {name: 'Course de Paris', d: '1777-07-01', y: 1777, lat: 48.85, lon: 2.35, lieu: 'Paris', u: ''},
        {name: 'Course trop tard', d: '1790-05-01', y: 1790, lat: 45.55, lon: 1.79, lieu: 'Treignac', u: ''}];
    (E.dataLists = E.dataLists || []).push({id: 'test_caisses', icon: '🛷', label: 'Courses de caisses à savon', group: 'Le monde', theme: 'sport', source: 'Jeu d’essai (CC0)', sourceUrl: 'https://example.org/licence',
        load: async () => { window.__loads++; return rows; },
        fields: [{key: 'name', label: 'Course', type: 'text'}, {key: 'd', label: 'Date', type: 'date'}, {key: 'lieu', label: 'Lieu', type: 'place'}, {key: 'u', label: 'Article', type: 'url'}],
        period: r => [r.y, r.y], geo: r => [r.lat, r.lon]});
};

(async () => {
    const B = await start();
    const p = B.page;
    const post = (x, body) => p.evaluate(([y, b]) => window.LCNDA_APP.api(y, {}, {method: 'POST', body: b}).then(r => r?.result ?? r), [x, body]);
    const items = async pid => (await B.api('atelier_project', {id: pid})).items;
    try {
        await B.ctx.addInitScript(FAKE);
        await p.reload(); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.dataListsEngine && window.LCNDA_EXT?.atelierData && window.LCNDA_EXT?.dataListPicker, null, {timeout: 60000});
        const pid = Number((await post('save_atelier_project', {title: 'Les courses du village', kind: 'livre'})).id);
        const overview = async () => { await B.go('enquetes', {enquetesTab: 'atelier', currentInvestigationId: 0, atelier: {project: pid, node: 'overview', sel: []}}); await p.waitForSelector('.h-atw-box [data-atw-add]', {timeout: 20000}); await p.waitForSelector('.h-atw-box .atd', {timeout: 4000}).catch(() => {}); await p.evaluate(() => document.querySelector('.h-atw-box .atd')?.scrollIntoView({block: 'center'})); }; // lu quand c'est visible : on y va
        const W = '.h-atw-box [data-atw] .atd';
        /** ↓ jusqu'à la carte voulue (la carte « au clavier » est marquée .is-kb) */
        const kbTo = async (S, id) => { const ids = await p.$$eval(`${S} [data-ld-pick]`, a => a.map(x => x.dataset.ldPick)); const i = ids.indexOf(id); assert.ok(i >= 0, ids.join(','));
            for (let k = 0; k <= i; k++) await p.press(`${S} [data-ld-ov-q]`, 'ArrowDown');
            assert.strictEqual(await p.$eval(`${S} .ldt-pick-card.is-kb`, x => x.dataset.ldPick), id); };

        await t('« ＋ Widget » propose « 📊 Données téléchargées » ; il se règle DANS le widget (pas de fenêtre)', async () => {
            await overview();
            assert.strictEqual(await p.evaluate(() => window.__loads), 0, 'rien n’est lu au démarrage');
            await p.click('.h-atw-box [data-atw-add]');
            const b = p.locator('dialog[open] [data-atw-new="donnees"]'); await b.waitFor();
            assert.match(await b.textContent(), /📊 Données téléchargées/); assert.match(await b.textContent(), /séismes, guerres, Tour de France/);
            assert.ok(await p.$('dialog[open] [data-atw-new="dash"]'), 'le widget du tableau de bord est toujours là');
            await b.click(); await p.waitForSelector(`${W}-cfg [data-ld-ov-q]`);
            assert.strictEqual(await p.$$eval('dialog[open]', a => a.length), 0, 'aucune fenêtre');
            const saved = await p.evaluate(x => JSON.parse(localStorage.getItem('genealogie-atelier-widgets'))[x], String(pid));
            assert.ok(saved.some(w => w.type === 'donnees'));
        });
        await t('🔍 recherche sans accents, pastilles des thèmes, ↑ ↓ Entrée → la liste choisie', async () => {
            const S = `${W}-cfg`;
            await p.fill(`${S} [data-ld-ov-q]`, 'CAISSES a savon'); await sleep(200);
            await p.waitForSelector(`${S} [data-ld-pick="test_caisses"]`);
            assert.match(await p.textContent(`${S} [data-ldt-found]`), /1 listes trouvées|listes trouvées/);
            // les pastilles : Tous + les thèmes (avec leur nombre) ; « 🏆 Sport » ne montre que le sport
            const chips = await p.$$eval(`${S} [data-ldt-pth]`, a => a.map(x => x.dataset.ldtPth)); assert.strictEqual(chips[0], 'all'); assert.ok(chips.includes('sport'), chips.join(','));
            await p.fill(`${S} [data-ld-ov-q]`, ''); await sleep(150);
            await p.click(`${S} [data-ldt-pth="sport"]`); await sleep(150);
            assert.deepStrictEqual(await p.$$eval(`${S} [data-ldt-group]`, a => [...new Set(a.map(x => x.dataset.ldtGroup))]), ['sport']);
            assert.strictEqual(await p.evaluate(() => localStorage.getItem('genealogie-donnees-choix-theme')), 'sport', 'le dernier thème est retenu');
            await p.click(`${S} [data-ldt-pth="all"]`);
            await p.fill(`${S} [data-ld-ov-q]`, 'savon'); await sleep(200);
            await kbTo(S, 'test_caisses');
            await p.press(`${S} [data-ld-ov-q]`, 'Enter');
            await p.waitForSelector(`${S} .atd-chosen`); assert.match(await p.textContent(`${S} .atd-chosen`), /Courses de caisses à savon/);
            assert.match(await p.textContent(`${S} .atd-lic`), /Jeu d’essai/);
        });
        await t('les filtres (1770 → 1780, près des lieux de la famille) → les lignes, ↗ source, « Ouvrir la liste »', async () => {
            const S = `${W}-cfg`;
            await p.fill(`${S} [data-atd-f="from"]`, '1770'); await p.fill(`${S} [data-atd-f="to"]`, '1780');
            await p.click(`${S} [data-atd-ok]`);
            await p.waitForSelector(`${W} .atd-rows li`, {timeout: 20000});
            let rows = await p.$$eval(`${W} .atd-rows li > button`, a => a.map(x => x.textContent.trim()));
            assert.deepStrictEqual(rows.sort(), ['Course de Paris', 'Grand prix de Chamberet']);
            assert.ok(await p.$(`${W} .atd-rows a.atd-src[href="https://example.org/gp"]`), '↗ source sur la ligne');
            assert.match(await p.textContent(`${W} .atd-lic`), /Jeu d’essai \(CC0\)/);
            // ⚙ : le réglage revient dans le widget ; près des lieux de la famille (30 km)
            await p.click('.h-atw-box [data-atw]:has(.atd) [data-atw-cfg]'); await p.waitForSelector(`${S} [data-atd-f="where"]`);
            assert.strictEqual(await p.$$eval('dialog[open]', a => a.length), 0);
            await p.selectOption(`${S} [data-atd-f="where"]`, 'family'); await p.fill(`${S} [data-atd-f="km"]`, '30');
            await p.click(`${S} [data-atd-ok]`); await p.waitForSelector(`${W} .atd-rows li`, {timeout: 30000});
            rows = await p.$$eval(`${W} .atd-rows li > button`, a => a.map(x => x.textContent.trim()));
            assert.deepStrictEqual(rows, ['Grand prix de Chamberet']);
            await p.click(`${W} [data-atd-go]`);
            await p.waitForFunction(() => window.LCNDA_APP.state.listType === 'data_test_caisses', null, {timeout: 15000});
        });
        await t('gardé après un rechargement (réglage, filtres) ; lu seulement quand le widget est visible', async () => {
            await p.reload(); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.atelierData, null, {timeout: 60000});
            await overview();
            await p.waitForSelector(`${W} .atd-rows li`, {timeout: 30000});
            assert.deepStrictEqual(await p.$$eval(`${W} .atd-rows li > button`, a => a.map(x => x.textContent.trim())), ['Grand prix de Chamberet']);
            const w = await p.evaluate(x => JSON.parse(localStorage.getItem('genealogie-atelier-widgets'))[x].find(y => y.type === 'donnees'), String(pid));
            assert.deepStrictEqual([w.cfg.src, w.cfg.from, w.cfg.to, w.cfg.where, w.cfg.km], ['test_caisses', '1770', '1780', 'family', 30]);
        });
        await t('affichage « nombre et petit graphique »', async () => {
            await p.evaluate(x => { const all = JSON.parse(localStorage.getItem('genealogie-atelier-widgets')); all[x].find(y => y.type === 'donnees').cfg = {src: 'test_caisses', view: 'count'}; localStorage.setItem('genealogie-atelier-widgets', JSON.stringify(all)); }, String(pid));
            await overview(); await p.waitForSelector(`${W} .atd-big`, {timeout: 20000});
            assert.match(await p.textContent(`${W} .atd-big`), /^3/); assert.ok(await p.$(`${W} .atd-bars span`));
        });
        const setCfg = cfg => p.evaluate(([x, c]) => { const all = JSON.parse(localStorage.getItem('genealogie-atelier-widgets')); all[x].find(y => y.type === 'donnees').cfg = c; localStorage.setItem('genealogie-atelier-widgets', JSON.stringify(all)); }, [String(pid), cfg]);
        await t('⚙️ les formes : tableau (colonnes choisies), cartes, frise dans l’ordre des années, courbe, ce jour-là, défilant', async () => {
            await setCfg({src: 'test_caisses', view: 'table', cols: ['name', 'lieu'], n: 5}); await overview(); await p.waitForSelector(`${W} .atd-table`, {timeout: 20000});
            assert.deepStrictEqual(await p.$$eval(`${W} .atd-table th`, a => a.map(x => x.textContent.trim())), ['Course', 'Lieu', 'Source']);
            assert.ok(await p.$(`${W} .atd-table a.atd-src`), '↗ source dans le tableau');
            await setCfg({src: 'test_caisses', view: 'cards'}); await overview(); await p.waitForSelector(`${W} .atd-card`, {timeout: 20000});
            assert.strictEqual(await p.$$eval(`${W} .atd-card`, a => a.length), 3);
            await setCfg({src: 'test_caisses', view: 'timeline'}); await overview(); await p.waitForSelector(`${W} .atd-time li`, {timeout: 20000});
            assert.deepStrictEqual(await p.$$eval(`${W} .atd-time li > span`, a => a.map(x => x.textContent)), ['1777', '1777', '1790']);
            await setCfg({src: 'test_caisses', view: 'chart', chart: 'line'}); await overview(); await p.waitForSelector(`${W} svg.atd-line`, {timeout: 20000});
            await setCfg({src: 'test_caisses', view: 'day'}); await overview(); await p.waitForSelector(`${W} .atd-daylab`, {timeout: 20000});
            assert.match(await p.textContent(`${W} .atd-daylab`), /Ce jour-là|La ligne du jour/);
            await setCfg({src: 'test_caisses', view: 'ticker'}); await overview(); await p.waitForSelector(`${W} [data-atd-ticker]`, {timeout: 20000});
            const vis = () => p.$$eval(`${W} [data-atd-ticker] li`, a => a.map(x => !x.hidden));
            assert.deepStrictEqual(await vis(), [true, false, false]); await p.click(`${W} [data-atd-tick="1"]`); assert.deepStrictEqual(await vis(), [false, true, false]);
        });
        await t('⚙️ Personnaliser (replié, une section à la fois) : tri décroissant, regroupé par décennie, « + N autres », titre ; gardé après rechargement', async () => {
            await setCfg({src: 'test_caisses', view: 'list', n: 2}); await overview(); await p.waitForSelector(`${W} .atd-rows li`, {timeout: 20000});
            assert.match(await p.textContent(`${W} .atd-more`), /[+＋] 1 autres/);
            await p.click('.h-atw-box [data-atw]:has(.atd) [data-atw-cfg]'); const S = `${W}-cfg`; await p.waitForSelector(`${S} [data-atd-perso]`);
            assert.strictEqual(await p.$eval(`${S} [data-atd-perso]`, x => x.open), false, 'replié au départ');
            await p.click(`${S} [data-atd-perso] > summary`);
            await p.click(`${S} [data-atd-sec="look"] > summary`); await p.click(`${S} [data-atd-sec="show"] > summary`); await sleep(100);
            assert.deepStrictEqual(await p.$$eval(`${S} [data-atd-sec]`, a => a.filter(x => x.open).map(x => x.dataset.atdSec)), ['show'], 'une section ouverte à la fois');
            await p.selectOption(`${S} [data-atd-p="sort"]`, 'd'); await p.selectOption(`${S} [data-atd-p="dir"]`, 'desc'); await p.selectOption(`${S} [data-atd-p="group"]`, 'decade');
            await p.click(`${S} [data-atd-sec="look"] > summary`); await p.fill(`${S} [data-atd-p="title"]`, 'Mes caisses'); await p.selectOption(`${S} [data-atd-p="accent"]`, 'green');
            await p.click(`${S} [data-atd-ok]`); await p.waitForSelector(`${W} .atd-gh`, {timeout: 20000});
            assert.deepStrictEqual(await p.$$eval(`${W} .atd-gh`, a => a.map(x => x.textContent.replace(/\s*\d+$/, '').trim())), ['1790–1799', '1770–1779']);
            assert.match(await p.textContent(`${W} .atd-head b`), /Mes caisses/);
            await p.reload(); await p.waitForFunction(() => window.LCNDA_EXT?.atelierData, null, {timeout: 60000}); await overview(); await p.waitForSelector(`${W} .atd-gh`, {timeout: 20000});
            const w = await p.evaluate(x => JSON.parse(localStorage.getItem('genealogie-atelier-widgets'))[x].find(y => y.type === 'donnees'), String(pid));
            assert.deepStrictEqual([w.cfg.sort, w.cfg.dir, w.cfg.group, w.cfg.title, w.cfg.accent], ['d', 'desc', 'decade', 'Mes caisses', 'green']);
        });
        await t('⭐ Enregistrer comme modèle : la forme seulement (sans la liste ni les filtres) ; ↺ Remettre comme au départ ; ↶', async () => {
            await p.click('.h-atw-box [data-atw]:has(.atd) [data-atw-cfg]'); const S = `${W}-cfg`; await p.waitForSelector(`${S} [data-atd-perso]`);
            await p.click(`${S} [data-atd-perso] > summary`); await p.click(`${S} [data-atd-sec="tpl"] > summary`);
            await p.fill(`${S} [data-atd-tplname]`, 'Groupé vert'); await p.click(`${S} [data-atd-tplsave]`); await sleep(300);
            const tpl = await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-donnees-widget-modeles')));
            assert.strictEqual(tpl[0].name, 'Groupé vert'); assert.strictEqual(tpl[0].fmt.group, 'decade');
            assert.ok(!('src' in tpl[0].fmt) && !('from' in tpl[0].fmt) && !('place' in tpl[0].fmt) && !('cols' in tpl[0].fmt), 'pas de données : ' + Object.keys(tpl[0].fmt).join(','));
            await p.click(`${S} [data-atd-perso] > summary`).catch(() => {}); if (!(await p.$eval(`${S} [data-atd-perso]`, x => x.open))) await p.click(`${S} [data-atd-perso] > summary`);
            if (!(await p.$eval(`${S} [data-atd-sec="tpl"]`, x => x.open))) await p.click(`${S} [data-atd-sec="tpl"] > summary`);
            await p.click(`${S} [data-atd-reset]`); await sleep(200);
            assert.strictEqual(await p.$eval(`${S} [data-atd-p="group"]`, x => x.value), '', 'remis à zéro');
            assert.strictEqual(await p.$eval(`${S} .atd-chosen`, x => /Courses de caisses/.test(x.textContent)), true, 'la liste reste');
            await p.click(`${S} [data-atd-ok]`); await p.waitForSelector(`${W} .atd-rows li`, {timeout: 20000});
            assert.ok(!(await p.$(`${W} .atd-gh`)), 'plus regroupé');
            const u = p.locator('.toast button', {hasText: '↶'}).last(); await u.waitFor({timeout: 8000}); await u.click(); await p.waitForSelector(`${W} .atd-gh`, {timeout: 20000});
            await setCfg({src: 'test_caisses', from: '1770', to: '1780', where: 'family', km: 30}); // comme avant, pour la suite
        });
        await t('✕ Retirer → ↶ Annuler le remet', async () => {
            const n0 = await p.$$eval('.h-atw-box [data-atw]', a => a.length);
            await p.click('.h-atw-box [data-atw]:has(.atd) [data-atw-del]'); await sleep(300);
            assert.strictEqual(await p.$$eval('.h-atw-box [data-atw]', a => a.length), n0 - 1);
            const u = p.locator('.toast button', {hasText: '↶'}).last(); await u.waitFor({timeout: 8000}); await u.click(); await sleep(500);
            assert.strictEqual(await p.$$eval('.h-atw-box [data-atw]', a => a.length), n0);
            assert.ok(await p.$(`${W}`));
        });
        await t('le widget du tableau de bord : enregistré, et proposé par « Widget du tableau de bord »', async () => {
            const r = await p.evaluate(() => ({reg: !!window.LCNDA_EXT.dashboard?.donnees_widget, cfg: !!window.LCNDA_EXT.dashboardConfig?.donnees_widget, block: (window.LCNDA_APP.defaultDashboardBlocks || []).some(x => x[0] === 'donnees_widget')}));
            assert.deepStrictEqual(r, {reg: true, cfg: true, block: true});
            const html = await p.evaluate(() => window.LCNDA_EXT.dashboard.donnees_widget.render('1', {id: 'x', type: 'donnees_widget', config: {}}, '6'));
            assert.match(html, /Données téléchargées/);
        });

        /* ═════════ l'élément de l'Atelier ═════════ */
        const projAll = async () => { await B.go('enquetes', {enquetesTab: 'atelier', currentInvestigationId: 0, atelier: {project: pid, node: 'all', sel: []}}); await p.waitForSelector('[data-at-addmenu]', {timeout: 20000}); };
        await t('＋ Ajouter ▾ : « 📊 Données téléchargées » juste après « 🔗 Venant du logiciel » → « Quoi ? » déjà sur « 📊 Une donnée téléchargée »', async () => {
            await projAll(); await p.click('[data-at-addmenu]');
            const order = await p.$$eval('.h-at-menu [data-at-add]', a => a.map(x => x.dataset.atAdd));
            assert.strictEqual(order[order.indexOf('app') + 1], 'app_data', order.join(','));
            await p.click('.h-at-menu [data-at-add="app_data"]');
            await p.waitForSelector('dialog[open] select[name=kind]');
            assert.strictEqual(await p.$eval('dialog[open] select[name=kind]', s => s.value), 'data');
            assert.ok(await p.$('dialog[open] [name=title]') && await p.$('dialog[open] [name=notes]'), 'Titre et Pourquoi ici ? restent');
        });
        await t('une seule ligne cochée → l’élément (texte et source dans la base), aperçu vivant avec ↗ source', async () => {
            const D = 'dialog[open]';
            await p.fill(`${D} [data-ld-ov-q]`, 'caisses'); await p.click(`${D} [data-ld-pick="test_caisses"]`);
            await p.waitForSelector(`${D} [data-atd-pick]`, {timeout: 20000});
            const lab = await p.$$eval(`${D} .atd-pickrows label`, a => a.map(x => x.textContent));
            const i = lab.findIndex(x => /Grand prix/.test(x)); assert.ok(i >= 0, lab.join('|'));
            await p.check(`${D} [data-atd-pick="${i}"]`);
            assert.ok(await p.$eval(`${D} [name=atd_mode][value=rows]`, x => x.checked), 'cocher passe en « Seulement les lignes cochées »');
            await p.click(`${D} button[type=submit], ${D} [data-dialog-submit]`).catch(async () => { await p.locator(`${D} button`, {hasText: 'Ajouter'}).last().click(); });
            await p.waitForFunction(() => !document.querySelector('dialog[open] [data-atd-cfg]'), null, {timeout: 15000});
            const it = (await items(pid)).find(x => x.type === 'app' && x.data?.kind === 'data' && x.data.ds?.mode === 'rows');
            assert.ok(it, 'enregistré');
            assert.deepStrictEqual([it.data.ds.list, it.data.ds.rows.length, it.data.ds.rows[0].t, it.data.ds.source], ['test_caisses', 1, 'Grand prix de Chamberet', 'Jeu d’essai (CC0)']);
            assert.ok(!JSON.stringify(it.data).includes('Course trop tard'), 'pas le pack');
            await p.waitForSelector('[data-at-apppreview] .atd-rows li', {timeout: 20000});
            assert.match(await p.textContent('[data-at-apppreview]'), /Grand prix de Chamberet/);
            assert.ok(await p.$('[data-at-apppreview] a.atd-src[href="https://example.org/gp"]'));
            assert.match(await p.textContent('[data-at-apppreview] .atd-lic'), /Jeu d’essai/);
        });
        await t('« Quoi ? → 📊 Une donnée téléchargée » dans « Venant du logiciel » : toute la liste filtrée ; l’export écrit le texte et la source', async () => {
            await projAll(); await p.click('[data-at-addmenu]'); await p.click('.h-at-menu [data-at-add="app"]');
            await p.waitForSelector('dialog[open] select[name=kind]');
            assert.ok(await p.$('dialog[open] select[name=kind] option[value="data"]'));
            await p.selectOption('dialog[open] select[name=kind]', 'data');
            const D = 'dialog[open]';
            await p.fill(`${D} [data-ld-ov-q]`, 'savon'); await sleep(200); await kbTo(D, 'test_caisses'); await p.press(`${D} [data-ld-ov-q]`, 'Enter');
            await p.waitForSelector(`${D} .atd-chosen`);
            await p.fill(`${D} [data-atd-f="to"]`, '1780'); await p.dispatchEvent(`${D} [data-atd-f="to"]`, 'change');
            await p.waitForSelector(`${D} [data-atd-pick]`, {timeout: 20000});
            await p.fill(`${D} [name=notes]`, 'Le décor de l’enfance');
            await p.locator(`${D} button`, {hasText: 'Ajouter'}).last().click();
            await p.waitForFunction(() => !document.querySelector('dialog[open] [data-atd-cfg]'), null, {timeout: 15000});
            const it = (await items(pid)).find(x => x.data?.kind === 'data' && x.data.ds?.mode === 'all');
            assert.ok(it); assert.strictEqual(it.data.ds.total, 2); assert.strictEqual(it.data.ds.cfg.to, '1780'); assert.match(it.data.extra, /Toute la liste filtrée/);
            const md = await p.evaluate(ds => window.LCNDA_EXT.atelierData.exportText(ds), it.data.ds);
            assert.match(md, /Grand prix de Chamberet/); assert.match(md, /Source : Jeu d’essai \(CC0\) <https:\/\/example.org\/licence>/);
            // compté avec les autres éléments « Venant du logiciel »
            assert.ok((await items(pid)).filter(x => x.type === 'app').length >= 2);
        });

        /* ═════════ 📥 Prendre depuis… → Données ═════════ */
        await t('📥 Prendre depuis… → Données : 🔍, pastilles, ↑ ↓ Entrée → l’étape 2', async () => { try {
            await p.evaluate(() => window.LCNDA_EXT.connexions.openTake()); await p.waitForSelector('.cx-take');
            await p.click('.cx-take [data-cx-tab="data"]'); await p.waitForSelector('.cx-take [data-cx-dpick] [data-ld-ov-q]');
            const P = '.cx-take [data-cx-dpick]';
            const n0 = await p.$$eval(`${P} [data-ld-pick]`, a => a.length); assert.ok(n0 >= 3, String(n0));
            assert.ok(await p.$$eval(`${P} [data-ldt-pth]`, a => a.length) >= 3, 'les thèmes en pastilles');
            await p.fill(`${P} [data-ld-ov-q]`, 'meteo');
            await p.waitForFunction(([sel, n]) => document.querySelectorAll(sel).length < n, [`${P} [data-ld-pick]`, n0], {timeout: 15000});
            const ids = await p.$$eval(`${P} [data-ld-pick]`, a => a.map(x => x.dataset.ldPick)); assert.ok(ids.includes('meteo_jour'), ids.join(','));
            assert.ok(ids.length < n0);
            await p.press(`${P} [data-ld-ov-q]`, 'Escape'); assert.strictEqual(await p.inputValue(`${P} [data-ld-ov-q]`), '', 'Échap vide la recherche');
            assert.ok(await p.$('.cx-take'), 'la fenêtre reste ouverte');
            await p.fill(`${P} [data-ld-ov-q]`, 'météo'); await p.waitForFunction(([sel, n]) => document.querySelectorAll(sel).length < n, [`${P} [data-ld-pick]`, n0], {timeout: 15000});
            await p.press(`${P} [data-ld-ov-q]`, 'ArrowDown');
            const first = await p.$eval(`${P} .ldt-pick-card.is-kb`, x => x.dataset.ldPick);
            await p.press(`${P} [data-ld-ov-q]`, 'Enter');
            await p.waitForSelector('.cx-take .cx-dchosen', {timeout: 15000});
            await p.waitForSelector('.cx-take [data-cx-dform] .cx-step, .cx-take [data-cx-dform] .cx-notinst', {timeout: 15000});
            assert.ok(first);
        } finally { await p.evaluate(() => document.querySelector('dialog.cx-take')?.close()); } });

        /* ═════════ vide, 390 px, sombre ═════════ */
        await t('sans données téléchargées : une phrase calme qui mène à Données', async () => {
            await overview();
            await p.evaluate(() => { const E = window.LCNDA_EXT.dataListsEngine; E.list = () => []; }); // aucune liste ici (rechargé ensuite)
            await p.click('.h-atw-box [data-atw-add]'); await p.click('dialog[open] [data-atw-new="donnees"]');
            await p.waitForFunction(() => [...document.querySelectorAll('.h-atw-box .atd-cfg')].some(x => /Aucune donnée téléchargée/.test(x.textContent)), null, {timeout: 20000});
            const last = p.locator('.h-atw-box .atd-cfg').last();
            assert.ok(await last.locator('[data-atd-gods]').count());
            await last.locator('[data-atd-gods]').click();
            await p.waitForFunction(() => window.LCNDA_APP.state.module === 'listes' && window.LCNDA_APP.state.listType === 'donnees', null, {timeout: 15000});
            await p.reload(); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.atelierData, null, {timeout: 60000});
        });
        await t('390 px en sombre : rien ne déborde, rien n’est collé aux bords', async () => {
            await p.setViewportSize({width: 390, height: 844});
            await p.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
            await overview(); await p.waitForSelector(`${W} .atd-big, ${W} .atd-rows li`, {timeout: 20000}).catch(() => {});
            // un widget neuf, réglé à 390 px
            await p.click('.h-atw-box [data-atw-add]'); await p.click('dialog[open] [data-atw-new="donnees"]'); await p.waitForSelector(`${W}-cfg [data-ldt-pth]`);
            const r = await p.evaluate(() => {
                const vw = document.documentElement.clientWidth, bad = [];
                document.querySelectorAll('.h-atw-box .atd, .h-atw-box .atd *').forEach(el => { const b = el.getBoundingClientRect(); if (!b.width) return; if (b.right > vw + 0.5 && !el.closest('.ldt-pick-themes')) bad.push(el.className || el.tagName); });
                const chips = document.querySelector('.h-atw-box .ldt-pick-themes'), cb = chips.getBoundingClientRect();
                const box = document.querySelector('.h-atw-box .atd-cfg').getBoundingClientRect();
                return {page: document.documentElement.scrollWidth - vw, bad: bad.slice(0, 5), chipsScroll: chips.scrollWidth > chips.clientWidth, chipsIn: cb.right <= vw + .5, left: box.left, right: vw - box.right,
                    bg: getComputedStyle(document.querySelector('.h-atw-box .ldt-pick-card')).backgroundColor};
            });
            assert.ok(r.page <= 0, 'la page ne défile pas de côté : ' + r.page);
            assert.deepStrictEqual(r.bad, []);
            assert.ok(r.chipsIn, 'les pastilles défilent dans leur rangée');
            assert.ok(r.left >= 8 && r.right >= 8, `marges ${r.left} / ${r.right}`);
            assert.ok(!/rgb\(255, 255, 255\)/.test(r.bg), 'sombre : pas de carte blanche ' + r.bg);
            await p.setViewportSize({width: 1440, height: 900});
        });
        await t('aucune erreur JavaScript', async () => { assert.deepStrictEqual(B.errs, []); });
    } finally { await B.stop(); }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})();
