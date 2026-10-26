'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🎨 Réglages → Apparence et affichage en trois groupes (Look, Navigation, Écrans), et retour à la présentation d'avant.
 *   node tests/test-reglages-trois-groupes.js
 *  1. par défaut : les trois groupes, chaque page montre ses cadres et seulement eux (rien de la page Apparence ne se perd) ;
 *  2. les onglets de « Menus, colonne et listes » (noms courts, une ligne) et de « Fiches personnes et animaux » ;
 *  3. un réglage changé sur une page découpée est bien enregistré ;
 *  4. le bouton du bas : la présentation d'avant (la page « Apparence » entière), puis retour.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
let failed = 0, count = 0;
const t = async (name, fn) => { try { await fn(); count++; console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
const finish = () => { console.log(`${failed ? '✗' : '✓'} réglages en trois groupes : ${count} vérifications${failed ? `, ${failed} en échec` : ''}`); process.exit(failed ? 1 : 0); };

(async () => {
    let chromium = null;
    try { ({chromium} = require('playwright')); } catch (_) { try { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); } catch (__) { chromium = null; } }
    let phpPath = null;
    try { const {findPhp, devBundledPhp} = require('../electron/php-server'); phpPath = findPhp([devBundledPhp()]); } catch (_) { phpPath = null; }
    if (!chromium || !phpPath) { console.log('— navigateur : Playwright ou PHP absent, partie sautée'); finish(); return; }
    const {phpRuntimeArgs} = require('../electron/php-server');
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-3groupes-')); fs.mkdirSync(path.join(dir, 'media'));
    const env = {...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media'), GENEALOGY_SKIP_REFERENCE: '1'};
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p->exec("INSERT INTO persons(first_name,last_name,gender,living_status) VALUES('Louise','BORIE','female','deceased')");
$p = null; require 'lib/bootstrap.php'; db(); echo 'ok';`], {cwd: root, encoding: 'utf8', env});
    if (r.status !== 0) throw new Error(r.stderr || r.stdout);
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
    const browser = await chromium.launch();
    const page = await browser.newPage({viewport: {width: 1440, height: 950}});
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    try {
        await page.goto(base); await page.waitForFunction(() => window.LCNDA_APP?.state?.bootstrap);
        await page.evaluate(() => { location.hash = '#maintenance'; }); await page.waitForTimeout(1200);
        const go = async k => { await page.locator(`[data-side-value="${k}"]`).first().click(); await page.waitForTimeout(1200); };
        // ce qui se voit sur la page : cadres (par leur titre) et champs du formulaire (par leur nom)
        const seen = () => page.evaluate(() => { const pg = document.querySelector('#workspace > .page'), v = el => !!(el.offsetWidth || el.offsetHeight), out = [];
            const name = el => (el.querySelector(':scope > header h3, :scope > header h2, :scope > h3, h3, summary, legend')?.textContent || '').trim().replace(/\s*\?$/, ''); // le « ? » d'aide arrive parfois un peu après
            const walk = el => { if (!v(el)) return; if (el.matches('.design-primary-grid > label')) { out.push('f:' + (el.querySelector('[name]')?.name || '')); return; } if (el.matches('section, .local-lock-inline, .ui-presets, .design-actions')) { out.push(name(el) || el.className); return; } [...el.children].forEach(walk); };
            [...pg.children].forEach(walk); return out; });
        const has = (list, re) => list.some(x => re.test(x));

        await t('par défaut : trois groupes Look, Navigation, Écrans, sans la page « Apparence » d’avant', async () => {
            const g = await page.evaluate(() => [...document.querySelectorAll('.mt-group .mt-glabel')].map(x => x.textContent));
            assert.deepEqual(g.slice(0, 3), ['Look', 'Navigation', 'Écrans']);
            assert.equal(await page.locator('[data-side-value="design"]').count(), 0);
            assert.ok(await page.locator('[data-side-value="look_theme"]').count());
        });
        await t('Thème et couleurs : les champs du look (dont prénom et nom du logo), Mes thèmes, et pas les menus ni les fiches', async () => {
            await go('look_theme'); const s = await seen();
            for (const f of ['f:preset', 'f:blue', 'f:fontFamily', 'f:fontScale', 'f:cardBackground', 'f:ownerFirst', 'f:ownerLast', 'f:interfaceLanguage', 'f:defaultCalendar', 'f:avSkipSeconds']) assert.ok(s.includes(f), f);
            assert.ok(has(s, /Mes thèmes/));
            for (const f of ['f:navPosition', 'f:avatarShape', 'f:eventDisplayMode']) assert.ok(!s.includes(f), f);
            assert.ok(!has(s, /Ordre et noms du menu principal|Formes des avatars|Messages après une action/));
        });
        await t('Portraits et avatars : une seule forme (avec « Gérer les formes »), puis le portrait ; plus la colonne de gauche', async () => {
            await go('look_portraits'); const s = await seen();
            assert.ok(has(s, /^Portraits et avatars/)); assert.ok(!has(s, /Colonne de gauche/));
            assert.ok(!has(s, /Mes thèmes/)); assert.ok(!s.includes('f:preset'));
            const r = await page.evaluate(() => ({tiles: [...document.querySelectorAll('#lc-portraits [data-lck-shape]')].map(b => b.dataset.lckShape), manage: !!document.querySelector('#lc-portraits [data-lck-shape-slot] #lc-avatar-shapes'), sel: !!document.querySelector('#lc-portraits select[form="design-form"][name="avatarShape"]')}));
            for (const k of ['tilted', 'square', 'rounded', 'circle', 'diamond']) assert.ok(r.tiles.includes(k), k);
            assert.ok(r.manage, '« ⚙️ Gérer les formes » rangé dans « 1 · La forme »'); assert.ok(r.sel, 'le menu d’avant reste dans le formulaire (caché)');
        });
        await t('une seule forme : un clic l’enregistre pour les carrés numérotés et pour les portraits', async () => {
            await page.click('#lc-portraits [data-lck-shape="circle"]'); await page.waitForTimeout(300);
            const r = await page.evaluate(() => ({av: JSON.parse(localStorage.getItem('genealogie-design') || '{}').avatarShape, root: document.documentElement.dataset.avatarShape, p: window.LCNDA_PORTRAITS.read().shape, on: !!document.querySelector('#lc-portraits [data-lck-shape="circle"].is-active')}));
            assert.deepEqual(r, {av: 'circle', root: 'circle', p: 'rond', on: true});
            await page.click('#lc-portraits [data-lck-pmode="carre"]'); await page.waitForTimeout(300);
            assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('genealogie-design') || '{}').avatarShape), 'square', 'le carré de la fiche choisit aussi la forme');
            await page.click('#lc-portraits [data-lck-pmode="avant"]'); await page.click('#lc-portraits [data-lck-shape="tilted"]'); await page.waitForTimeout(300);
        });
        await t('une forme à soi choisie reste choisie en revenant sur la page', async () => {
            await page.evaluate(() => localStorage.setItem('genealogie-avatar-shapes', JSON.stringify({custom: {shp_nuage: {name: 'Nuage', kind: 'poly', pts: [[0, 0], [1, 0], [1, 1], [0, 1], [.5, .5]]}}, order: [], hidden: []})));
            await go('look_theme'); await go('look_portraits');
            await page.click('#lc-portraits [data-lck-shape="shp_nuage"]'); await page.waitForTimeout(600);
            await go('look_theme'); await go('look_portraits');
            assert.equal(await page.locator('select[form="design-form"][name="avatarShape"]').inputValue(), 'shp_nuage');
            assert.ok(await page.locator('#lc-portraits [data-lck-shape="shp_nuage"].is-active').count(), 'la tuile de sa forme est choisie');
            assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('genealogie-design') || '{}').avatarShape), 'shp_nuage');
        });
        await t('Notifications et boutons : les messages, puis la forme des boutons (A6, venue de Designs au choix)', async () => {
            assert.match(await page.locator('[data-side-value="look_msgs"]').first().innerText(), /Notifications et boutons/);
            await go('look_msgs'); await page.waitForSelector('#lc-a6-host #lcd-a6-emb [data-lcd-v]', {timeout: 15000});
            const s = await seen(); assert.ok(has(s, /Messages après une action/)); assert.ok(has(s, /Forme des boutons/)); assert.ok(!has(s, /Mes thèmes/));
        });
        await t('Langue, dates et lecteur : un réglage changé ici est enregistré', async () => {
            await go('look_theme'); const s = await seen(); // la langue, le calendrier et le lecteur : dans Thème et couleurs, après « Nom affiché »
            const fs = s.filter(x => x.startsWith('f:')); assert.deepEqual(fs.slice(fs.indexOf('f:ownerLast'), fs.indexOf('f:ownerLast') + 4), ['f:ownerLast', 'f:interfaceLanguage', 'f:defaultCalendar', 'f:avSkipSeconds']);
            const v = await page.evaluate(() => { const sel = document.querySelector('select[name="defaultCalendar"]'); return [...sel.options].map(o => o.value).find(x => x !== sel.value); });
            await page.selectOption('select[name="defaultCalendar"]', v); await page.waitForTimeout(900);
            assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('genealogie-design') || '{}').defaultCalendar), v);
        });
        await t('Menus, colonne et listes : noms courts sur une ligne, un onglet par sujet, chacun ses cadres', async () => {
            assert.match(await page.locator('[data-side-value="nav_menus"]').first().innerText(), /Menus, colonne et listes/);
            await go('nav_menus');
            const tabs = await page.locator('[data-reg-a-tab]').allTextContents();
            assert.deepEqual(tabs, ['Menu', 'Colonne', 'Listes', 'Boutons du haut']); // Listes = la forme des listes (A8) ; l'ordre des listes : dans Listes → Réordonner ; l'ordre des pages : Réglages → Réordonner ; // les types de recherche : dans Recherche → Réordonner ; les graphiques : dans Graphiques → ⠿ Réordonner
            assert.equal(await page.locator('[data-reg-a-tab="1"]').getAttribute('title'), 'La colonne de gauche : où, son dessin, les lignes cachées');
            assert.equal(await page.evaluate(() => new Set([...document.querySelectorAll('[data-reg-a-tab]')].map(b => Math.round(b.getBoundingClientRect().top))).size), 1, 'une seule ligne');
            let s = await seen(); assert.ok(has(s, /Ordre et noms du menu principal/)); assert.ok(s.includes('f:navPosition')); assert.ok(!s.includes('f:sidebarPosition')); assert.ok(!s.includes('f:ownerFirst')); assert.ok(!has(s, /Ordre des listes/));
            await page.click('[data-reg-a-tab="1"]'); s = await seen(); assert.ok(has(s, /^Colonne de gauche/)); assert.ok(has(s, /Lignes cachées/)); assert.ok(!has(s, /menu principal/));
            await page.click('[data-reg-a-tab="2"]'); await page.waitForSelector('#lc-a8-host .lcd-embed'); s = await seen(); assert.ok(has(s, /Forme des listes/)); assert.ok(!has(s, /^Colonne de gauche|menu principal/));
            for (let i = 0; i < 4; i++) { await page.click(`[data-reg-a-tab="${i}"]`); s = await seen(); assert.ok(!has(s, /Types de recherche|Graphiques — |Ordre des listes|Ordre des pages/), `onglet ${i}`); assert.equal(has(s, /Forme des listes/), i === 2, `forme des listes, onglet ${i}`); }
        });
        await t('Colonne : « Où ? », « Partir de », 9 styles d’entrées posés sur la vraie colonne, aperçu', async () => {
            await go('nav_menus'); await page.click('[data-reg-a-tab="1"]');
            const n = await page.locator('#lc-colonne [data-lck-c="style"]').count(); assert.equal(n, 9);
            assert.ok(await page.locator('#lc-colonne [data-lck-c="style"][data-v="boutons"].is-active').count(), 'boutons encadrés par défaut');
            await page.click('#lc-colonne [data-lck-cmode="nouveau"]'); await page.waitForTimeout(250);
            let r = await page.evaluate(() => ({S: window.LCNDA_COLUMN.read(), style: document.documentElement.getAttribute('data-lc-col-style'), look: document.documentElement.getAttribute('data-lc-col-look')}));
            assert.equal(r.S.style, 'boutons'); assert.equal(r.S.numstyle, 'suite'); assert.equal(r.style, null); assert.equal(r.look, null);
            for (const [v, attr] of [['plat', 'look'], ['classeur', 'look'], ['doux', 'look'], ['continue', 'style']]) {
                await page.click(`#lc-colonne [data-lck-c="style"][data-v="${v}"]`); await page.waitForTimeout(150);
                r = await page.evaluate(() => ({style: document.documentElement.getAttribute('data-lc-col-style'), look: document.documentElement.getAttribute('data-lc-col-look'), prev: document.querySelector('#lck-c-prev .lck-c-side')?.className || '', mod: !!document.querySelector('#lc-colonne [data-lck-cmode="nouveau"].is-mod')}));
                assert.equal(r[attr], v, v); assert.equal(r[attr === 'look' ? 'style' : 'look'], null, v); assert.match(r.prev, new RegExp('st-' + v)); assert.ok(r.mod, '« retouché »');
            }
            await page.click('#lc-colonne [data-lck-c="nums"][data-v="aucun"]'); await page.waitForTimeout(150);
            assert.equal(await page.evaluate(() => window.LCNDA_COLUMN.read().nums), false);
            await page.click('#lc-colonne [data-lck-side="right"]'); await page.waitForTimeout(250);
            r = await page.evaluate(() => ({pos: JSON.parse(localStorage.getItem('genealogie-design') || '{}').sidebarPosition, cls: document.documentElement.classList.contains('side-right'), sel: document.querySelector('select[form="design-form"][name="sidebarPosition"]')?.value, prev: !!document.querySelector('#lck-c-prev .lck-colprev.is-right')}));
            assert.deepEqual(r, {pos: 'right', cls: true, sel: 'right', prev: true});
            await page.click('#lc-colonne [data-lck-side="left"]'); await page.click('#lck-c-reset'); await page.waitForTimeout(250);
            assert.equal(await page.evaluate(() => window.LCNDA_COLUMN.read().mode), 'avant');
        });
        await t('Listes › « Réordonner » ouvre une fenêtre, sans quitter Listes', async () => {
            await page.evaluate(() => { window.LCNDA_APP.state.listType = 'persons'; window.LCNDA_APP.setModule('listes'); }); await page.waitForSelector('#list-reorder');
            await page.click('#list-reorder'); await page.waitForSelector('dialog[open].mt-reorder');
            assert.equal(await page.evaluate(() => window.LCNDA_APP.state.module), 'listes');
            await page.click('dialog[open].mt-reorder [data-close]'); await page.waitForTimeout(200);
            await page.evaluate(() => window.LCNDA_APP.setModule('maintenance')); await page.waitForTimeout(800);
        });
        await t('Fiches personnes et animaux : cinq onglets ; recensements, badges et Sosa y sont', async () => {
            await go('design_sheets');
            assert.equal(await page.locator('[data-reg-a-tab]').count(), 5);
            await page.click('[data-reg-a-tab="2"]'); let s = await seen();
            for (const f of ['f:eventDisplayMode', 'f:censusDetailsDefault', 'f:censusSpecialOrder', 'f:defaultMortPourLaFrance']) assert.ok(s.includes(f), f);
            assert.ok(has(s, /Couleurs des badges/));
            await page.click('[data-reg-a-tab="3"]'); s = await seen(); assert.ok(s.some(x => /local-lock-inline/.test(x)));
        });
        await t('aucun cadre de l’ancienne page « Apparence » ne se perd', async () => {
            const all = new Set();
            for (const k of ['look_theme', 'look_portraits', 'look_msgs', 'look_layouts', 'nav_menus', 'design_sheets', 'design_maps']) {
                await go(k); const n = await page.locator('[data-reg-a-tab]').count();
                for (let i = 0; i < Math.max(1, n); i++) { if (n) { await page.click(`[data-reg-a-tab="${i}"]`); await page.waitForTimeout(150); } (await seen()).forEach(x => all.add(x)); }
            }
            await page.evaluate(async () => { window.LCNDA_APP.setReglagesA(false); window.LCNDA_APP.renderSidebar(); await window.LCNDA_APP.renderMaintenance(); }); await page.waitForTimeout(1300); // plus de bouton : l'ancienne présentation par le code
            await go('design'); const old = await seen();
            const lost = old.filter(x => !all.has(x) && !/Ordre des listes|Ordre des pages|Types de recherche|Graphiques — |Bibliothèque des widgets|Widgets posés|TABLEAU DE BORD|dashboard/i.test(x)); // rangés dans Recherche → Réordonner, Graphiques → ⠿ Réordonner, Tableau de bord → 🧩 Bibliothèque et Réordonner les widgets
            assert.deepEqual(lost, []);
        });
        await t('présentation d’avant : la page « Apparence » entière, puis retour aux trois groupes', async () => {
            assert.equal(await page.evaluate(() => localStorage.getItem('genealogie-reglages-presentation')), 'old');
            assert.ok(await page.locator('[data-side-value="design"]').count());
            assert.equal(await page.locator('[data-side-value="look_theme"]').count(), 0);
            const s = await seen(); assert.ok(s.includes('f:preset') && s.includes('f:navPosition') && s.includes('f:eventDisplayMode'));
            assert.equal(await page.locator('#reglages-presentation').count(), 0, 'plus de bouton « présentation d’avant »');
            await page.evaluate(async () => { window.LCNDA_APP.setReglagesA(true); window.LCNDA_APP.renderSidebar(); await window.LCNDA_APP.renderMaintenance(); }); await page.waitForTimeout(1300);
            assert.equal(await page.evaluate(() => window.LCNDA_APP.state.maintenanceTab), 'look_theme');
            assert.ok(await page.locator('[data-side-value="look_theme"]').count());
        });
        await t('aucune erreur JavaScript', async () => assert.deepEqual(errs, []));
    } finally { await browser.close(); proc.kill(); }
    finish();
})();
