'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🎨 Réglages → Apparence et affichage en trois groupes (Look, Navigation, Écrans), et retour à la présentation d'avant.
 *   node tests/test-reglages-trois-groupes.js
 *  1. par défaut : les trois groupes, chaque page montre ses cadres et seulement eux (rien de la page Apparence ne se perd) ;
 *  2. les onglets de « Menus, onglets et listes » et de « Fiches personnes et animaux » ;
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
            const name = el => (el.querySelector(':scope > header h3, :scope > header h2, :scope > h3, h3, summary, legend')?.textContent || '').trim();
            const walk = el => { if (!v(el)) return; if (el.matches('.design-primary-grid > label')) { out.push('f:' + (el.querySelector('[name]')?.name || '')); return; } if (el.matches('section, .local-lock-inline, .ui-presets, .design-actions')) { out.push(name(el) || el.className); return; } [...el.children].forEach(walk); };
            [...pg.children].forEach(walk); return out; });
        const has = (list, re) => list.some(x => re.test(x));

        await t('par défaut : trois groupes Look, Navigation, Écrans, sans la page « Apparence » d’avant', async () => {
            const g = await page.evaluate(() => [...document.querySelectorAll('.mt-group .mt-glabel')].map(x => x.textContent));
            assert.deepEqual(g.slice(0, 3), ['Look', 'Navigation', 'Écrans']);
            assert.equal(await page.locator('[data-side-value="design"]').count(), 0);
            assert.ok(await page.locator('[data-side-value="look_theme"]').count());
        });
        await t('Thème et couleurs : les champs du look, Mes thèmes, et pas les menus ni les fiches', async () => {
            await go('look_theme'); const s = await seen();
            for (const f of ['f:preset', 'f:blue', 'f:fontFamily', 'f:fontScale', 'f:cardBackground']) assert.ok(s.includes(f), f);
            assert.ok(has(s, /Mes thèmes/));
            for (const f of ['f:navPosition', 'f:avatarShape', 'f:eventDisplayMode', 'f:interfaceLanguage']) assert.ok(!s.includes(f), f);
            assert.ok(!has(s, /Ordre et noms du menu principal|Formes des avatars|Messages après une action/));
        });
        await t('Portraits et avatars : la forme, les formes personnalisées, les portraits', async () => {
            await go('look_portraits'); const s = await seen();
            assert.ok(s.includes('f:avatarShape')); assert.ok(has(s, /Formes des avatars/)); assert.ok(has(s, /Portraits et colonne de gauche/));
            assert.ok(!has(s, /Mes thèmes/)); assert.ok(!s.includes('f:preset'));
        });
        await t('une forme à soi choisie reste choisie en revenant sur la page', async () => {
            await page.evaluate(() => localStorage.setItem('genealogie-avatar-shapes', JSON.stringify({custom: {shp_nuage: {name: 'Nuage', kind: 'poly', pts: [[0, 0], [1, 0], [1, 1], [0, 1], [.5, .5]]}}, order: [], hidden: []})));
            await go('look_theme'); await go('look_portraits');
            await page.locator('#design-form select[name="avatarShape"]').selectOption('shp_nuage'); await page.waitForTimeout(600);
            await go('look_theme'); await go('look_portraits');
            assert.equal(await page.locator('#design-form select[name="avatarShape"]').inputValue(), 'shp_nuage');
            assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('genealogie-design') || '{}').avatarShape), 'shp_nuage');
        });
        await t('Langue, dates et lecteur : un réglage changé ici est enregistré', async () => {
            await go('look_lang'); const s = await seen();
            assert.deepEqual(s.filter(x => x.startsWith('f:')).sort(), ['f:avSkipSeconds', 'f:defaultCalendar', 'f:interfaceLanguage']);
            const v = await page.evaluate(() => { const sel = document.querySelector('select[name="defaultCalendar"]'); return [...sel.options].map(o => o.value).find(x => x !== sel.value); });
            await page.selectOption('select[name="defaultCalendar"]', v); await page.waitForTimeout(900);
            assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('genealogie-design') || '{}').defaultCalendar), v);
        });
        await t('Menus, onglets et listes : un onglet par menu, chacun ses cadres', async () => {
            await go('nav_menus');
            const tabs = await page.locator('[data-reg-a-tab]').allTextContents();
            assert.deepEqual(tabs, ['Menu principal', 'Listes', 'Pages des Réglages', 'Boutons en haut à droite', 'Types de recherche', 'Graphiques']);
            let s = await seen(); assert.ok(has(s, /Ordre et noms du menu principal/)); assert.ok(s.includes('f:navPosition')); assert.ok(!has(s, /Ordre des listes/));
            await page.click('[data-reg-a-tab="1"]'); s = await seen(); assert.ok(has(s, /Ordre des listes/)); assert.ok(!has(s, /menu principal/));
            await page.click('[data-reg-a-tab="5"]'); s = await seen(); assert.ok(has(s, /Graphiques — Diagrammes/)); assert.ok(has(s, /Graphiques — Statistiques/));
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
            for (const k of ['look_theme', 'look_portraits', 'look_msgs', 'look_lang', 'look_layouts', 'nav_menus', 'design_sheets', 'design_maps', 'design_board']) {
                await go(k); const n = await page.locator('[data-reg-a-tab]').count();
                for (let i = 0; i < Math.max(1, n); i++) { if (n) { await page.click(`[data-reg-a-tab="${i}"]`); await page.waitForTimeout(150); } (await seen()).forEach(x => all.add(x)); }
            }
            await page.click('#reglages-presentation'); await page.waitForTimeout(1300);
            await go('design'); const old = await seen();
            const lost = old.filter(x => !all.has(x));
            assert.deepEqual(lost, []);
        });
        await t('présentation d’avant : la page « Apparence » entière, puis retour aux trois groupes', async () => {
            assert.equal(await page.evaluate(() => localStorage.getItem('genealogie-reglages-presentation')), 'old');
            assert.ok(await page.locator('[data-side-value="design"]').count());
            assert.equal(await page.locator('[data-side-value="look_theme"]').count(), 0);
            const s = await seen(); assert.ok(s.includes('f:preset') && s.includes('f:navPosition') && s.includes('f:eventDisplayMode'));
            await page.click('#reglages-presentation'); await page.waitForTimeout(1300);
            assert.equal(await page.evaluate(() => window.LCNDA_APP.state.maintenanceTab), 'look_theme');
            assert.ok(await page.locator('[data-side-value="look_theme"]').count());
        });
        await t('aucune erreur JavaScript', async () => assert.deepEqual(errs, []));
    } finally { await browser.close(); proc.kill(); }
    finish();
})();
