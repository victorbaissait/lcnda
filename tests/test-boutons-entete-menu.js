'use strict';
/* Boutons de l'en-tête de la fiche ← actions du menu « ⋯ » (Réglages → Fiches → « Ordre et visibilité des boutons », app-apparence.js ;
 * le menu : ext.personMenuItems dans app-sections.js, avec les actions des modules : ext.personMoreItems).
 *     node tests/test-boutons-entete-menu.js        (BOUTONS_MENU_SHOTS=dossier pour garder des captures)
 * - Toutes les actions du menu ⋯ sont dans la liste, décochées au départ ; 🔎 ⤓ 🖨 (déjà dans l'en-tête) aussi, cochés.
 * - Par défaut, rien ne change sur la fiche ; une action montrée en bouton n'est pas répétée dans le menu (🖨, 🔎).
 * - Cocher « Carte de sa vie » → un bouton carré 🗺 (bulle « Carte de sa vie »), absent du menu ⋯, le clic ouvre la carte.
 * - « ↶ Annuler » (K2) ; ordre changé (Alt + ↑) gardé après rechargement ; un module ajouté plus tard vient tout seul (décoché).
 * - Décocher 🖨 : « Imprimer » revient dans le menu ⋯. ⋯ ne peut pas être décoché (toujours là tant qu'il reste une action).
 * - 390 px : tout coché, l'en-tête ne déborde pas. Aucune erreur dans la console.
 */
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const root = path.resolve(__dirname, '..');
let failed = 0, count = 0;
const t = async (name, fn) => { try { await fn(); count++; console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
const KEY = 'genealogie-person-header';

(async () => {
    const phpPath = findPhp([devBundledPhp()]);
    let chromium = null;
    try { ({chromium} = require('playwright')); } catch (_) { try { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); } catch (__) { chromium = null; } }
    if (!chromium || !phpPath) { console.log('— navigateur : Playwright ou PHP absent, essai sauté'); process.exit(0); }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-boutons-menu-'));
    const shots = process.env.BOUTONS_MENU_SHOTS || '';
    const envFor = d => ({...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1'});
    fs.mkdirSync(path.join(tmp, 'media'), {recursive: true});
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p->exec("INSERT INTO persons(first_name,last_name,gender,living_status) VALUES('Jean','MAZAUD','male','deceased'),('Marie','LACOMBE','female','deceased'),('Paul','DURAND','male','living')"); $p = null;
require 'lib/bootstrap.php'; db();
echo 'ok';`], {cwd: root, encoding: 'utf8', env: envFor(tmp)});
    if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exit(1); }
    const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const port = Number(process.env.BOUTONS_MENU_PORT) || await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env: envFor(tmp), stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
    const browser = await chromium.launch();
    const errs = [];
    const open = async w => {
        const page = await browser.newPage({viewport: {width: w, height: 900}});
        page.on('pageerror', e => errs.push(`${w}px : ${e.message}`)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(`${w}px console : ${m.text()}`); });
        page.on('dialog', d => d.dismiss());
        await page.goto(base, {waitUntil: 'load', timeout: 90000}); await page.waitForTimeout(2000);
        return page;
    };
    const toPerson = async (page, id) => {
        await page.evaluate(async i => { const A = window.LCNDA_APP; A.state.currentPersonId = i; await A.setModule('personnes'); await A.selectPerson(i, false); }, id);
        await page.waitForSelector('#workspace .person-hero-actions [data-fsec-hero-more]', {timeout: 15000}); await page.waitForTimeout(400);
    };
    const toSettings = async page => {
        await page.evaluate(() => window.LCNDA_SECTIONS.openSheetsPage('lc-person-header'));
        await page.waitForSelector('#lc-hh-order .order-row', {timeout: 15000}); await page.waitForTimeout(600);
    };
    const heroBtns = page => page.$$eval('#workspace .person-hero-actions > *', els => els.filter(e => !e.classList.contains('lc-hide') && getComputedStyle(e).display !== 'none').map(e => e.dataset.lcMb ? 'm_' + e.dataset.lcMb : e.matches('[data-fsec-hero-more]') ? 'more' : e.matches('[data-print-person]') ? 'print' : e.matches('[data-ts-hero]') ? 'search' : e.matches('[data-pa-export-menu]') ? 'export' : (e.getAttribute('aria-label') || e.textContent).trim()));
    const menuLabels = async page => {
        await page.click('#workspace .person-hero-actions [data-fsec-hero-more]'); await page.waitForSelector('.ui-actmenu');
        const l = await page.$$eval('.ui-actmenu button', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
        await page.keyboard.press('Escape'); await page.waitForTimeout(200);
        return l;
    };
    const rows = page => page.$$eval('#lc-hh-order .order-row', els => els.map(e => ({k: e.dataset.orderKey, on: !!e.querySelector('[data-hh-show]')?.checked, off: !!e.querySelector('[data-hh-show]')?.disabled, name: e.querySelector('b')?.textContent.trim()})));
    const cfg = page => page.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), KEY);
    const shot = async (page, name) => { if (shots) { fs.mkdirSync(shots, {recursive: true}); await page.screenshot({path: path.join(shots, name), fullPage: false}); } };
    try {
        const page = await open(1440);
        let before = [];
        await t('par défaut : la fiche comme avant, pas de doublon entre les boutons et le menu ⋯ (🖨, 🔎)', async () => {
            await toPerson(page, 1);
            before = await heroBtns(page);
            assert.equal(await page.$$eval('[data-lc-mb]', e => e.length), 0, 'aucune action du menu en bouton');
            for (const k of ['search', 'print', 'export', 'more']) assert.ok(before.includes(k), k + ' dans l’en-tête');
            const m = await menuLabels(page);
            assert.ok(m.some(x => /Carte de sa vie/.test(x)), 'Carte de sa vie dans le menu');
            assert.ok(!m.some(x => /^🖨|Imprimer/.test(x)), '🖨 déjà en bouton : pas répété dans le menu');
            assert.ok(!m.some(x => /Tout ce qui le concerne/.test(x)), '🔎 déjà en bouton : pas répété dans le menu');
            assert.equal(await cfg(page), null, 'rien d’enregistré');
        });
        await t('la liste : toutes les actions du menu ⋯ (décochées), 🔎 ⤓ 🖨 (cochés), ⋯ qu’on ne peut pas décocher', async () => {
            await toSettings(page);
            const R = await rows(page);
            const all = await page.evaluate(() => { const E = window.LCNDA_EXT; return E.personMenuItems({person: {id: -1, kind: 'human', living_status: 'deceased'}, events: [], heritage: {}}).filter(x => x && x !== '-' && !['print', 'toutsur'].includes(x.key)).map(x => 'm_' + x.key); });
            assert.ok(all.length >= 10, 'des actions dans le menu : ' + all.join(', '));
            for (const k of all) { const row = R.find(x => x.k === k); assert.ok(row, k + ' dans la liste'); assert.equal(row.on, false, k + ' décochée au départ'); }
            for (const k of ['search', 'print', 'export']) assert.equal(R.find(x => x.k === k)?.on, true, k + ' coché');
            const more = R.find(x => x.k === 'more'); assert.ok(more.on && more.off, '⋯ coché et grisé');
            assert.ok(R.find(x => x.k === 'm_carte-de-sa-vie')?.name.includes('Carte de sa vie'));
            assert.equal(R.filter(x => /Imprimer/.test(x.name)).length, 1, 'une seule ligne 🖨');
            assert.equal(await page.$eval('#lc-hh-order [data-order-key="m_carte-de-sa-vie"] .lc-hh-ico', e => e.textContent), '🗺');
        });
        await t('cocher « Carte de sa vie » : enregistré tout seul, « ↶ Annuler » le retire', async () => {
            await page.click('#lc-hh-order [data-order-key="m_carte-de-sa-vie"] [data-hh-show]'); await page.waitForTimeout(900);
            assert.deepEqual((await cfg(page)).on, ['m_carte-de-sa-vie']);
            assert.ok(await page.$('[data-hh-preview] .lc-hh-btn'), 'aperçu');
            assert.ok((await page.$$eval('[data-hh-preview] .lc-hh-btn', e => e.map(x => x.textContent))).includes('🗺'), 'aperçu : 🗺');
            const toast = page.locator('.toast', {hasText: 'Réglage changé'}).last();
            await toast.locator('button', {hasText: 'Annuler'}).click(); await page.waitForTimeout(1200);
            assert.deepEqual((await cfg(page))?.on || [], [], '↶ Annuler : plus coché');
            assert.equal(await page.$eval('#lc-hh-order [data-order-key="m_carte-de-sa-vie"] [data-hh-show]', e => e.checked), false);
            await page.click('#lc-hh-order [data-order-key="m_carte-de-sa-vie"] [data-hh-show]'); await page.waitForTimeout(900);
            assert.deepEqual((await cfg(page)).on, ['m_carte-de-sa-vie']);
        });
        await t('monter « Carte de sa vie » en premier (Alt + ↑, ou les boutons ↑ de la ligne)', async () => {
            const n = (await rows(page)).findIndex(x => x.k === 'm_carte-de-sa-vie');
            for (let i = 0; i < n; i++) { await page.focus('#lc-hh-order [data-order-key="m_carte-de-sa-vie"] .order-grip').catch(() => {}); await page.keyboard.press('Alt+ArrowUp'); await page.waitForTimeout(150); }
            await page.waitForTimeout(500);
            if ((await rows(page))[0].k !== 'm_carte-de-sa-vie') { // sans Alt + ↑ ici : les boutons ↑ de la ligne (même enregistrement)
                for (let i = 0; i < n + 2; i++) { await page.click('#lc-hh-order [data-order-key="m_carte-de-sa-vie"] [data-hh-move="-1"]'); await page.waitForTimeout(150); }
            }
            await page.waitForTimeout(600);
            assert.equal((await rows(page))[0].k, 'm_carte-de-sa-vie');
            assert.equal(await page.$eval('#lc-hh-order .order-row .order-number', e => e.textContent), '01');
            assert.equal((await cfg(page)).order[0], 'm_carte-de-sa-vie');
            await page.locator('#lc-person-header').scrollIntoViewIfNeeded(); await shot(page, 'reglage-1440.png');
        });
        await t('après rechargement : 🗺 en premier dans l’en-tête, bulle, absent du menu ⋯, le clic ouvre la carte', async () => {
            await page.reload(); await page.waitForTimeout(2000);
            await toPerson(page, 1);
            const b = await heroBtns(page);
            assert.equal(b[0], 'm_carte-de-sa-vie', 'en premier : ' + b.join(' '));
            assert.deepEqual(b.slice(1), before, 'les autres boutons comme avant');
            assert.deepEqual(await page.$eval('[data-lc-mb="carte-de-sa-vie"]', e => [e.textContent, e.title, e.getAttribute('aria-label')]), ['🗺', 'Carte de sa vie', 'Carte de sa vie']);
            const m = await menuLabels(page);
            assert.ok(!m.some(x => /Carte de sa vie/.test(x)), 'plus dans le menu');
            assert.ok(m.some(x => /Arbre des métiers/.test(x)), 'les autres actions restent');
            await shot(page, 'fiche-1440.png');
            await page.click('[data-lc-mb="carte-de-sa-vie"]');
            await page.waitForSelector('dialog.lv-dlg[open]', {timeout: 15000});
            await page.keyboard.press('Escape'); await page.waitForTimeout(300);
        });
        await t('décocher 🖨 : « Imprimer » revient dans le menu ⋯ ; le recocher', async () => {
            await toSettings(page);
            await page.click('#lc-hh-order [data-order-key="print"] [data-hh-show]'); await page.waitForTimeout(800);
            assert.ok((await cfg(page)).hidden.includes('print'));
            await toPerson(page, 1);
            assert.ok(!(await heroBtns(page)).includes('print'));
            assert.ok((await menuLabels(page)).some(x => /Imprimer/.test(x)), 'Imprimer dans le menu');
            await toSettings(page);
            await page.click('#lc-hh-order [data-order-key="print"] [data-hh-show]'); await page.waitForTimeout(800);
            assert.ok(!(await cfg(page)).hidden.includes('print'));
        });
        await t('un module ajouté plus tard au menu ⋯ : dans la liste tout seul (décoché), puis en bouton', async () => {
            await page.evaluate(() => window.LCNDA_EXT.personMoreItems.push(d => (d?.person?.id ? {icon: '🧪', label: 'Action d’essai', run: () => { window.__essai = (window.__essai || 0) + 1; }} : null)));
            await toSettings(page);
            const row = (await rows(page)).find(x => x.k === 'm_action-d-essai');
            assert.ok(row && !row.on, 'nouvelle ligne, décochée');
            await page.click('#lc-hh-order [data-order-key="m_action-d-essai"] [data-hh-show]'); await page.waitForTimeout(800);
            await toPerson(page, 1);
            await page.click('[data-lc-mb="action-d-essai"]'); await page.waitForTimeout(200);
            assert.equal(await page.evaluate(() => window.__essai), 1, 'même action que dans le menu');
        });
        await t('tout cocher : ⋯ s’efface quand le menu est vide', async () => {
            await toSettings(page);
            for (const k of (await rows(page)).filter(x => x.k.startsWith('m_') && !x.on).map(x => x.k)) { await page.click(`#lc-hh-order [data-order-key="${k}"] [data-hh-show]`); await page.waitForTimeout(250); }
            await page.waitForTimeout(600);
            await toPerson(page, 1).catch(() => {}); await page.waitForTimeout(400);
            const left = await page.evaluate(() => window.LCNDA_EXT.personMenuLeft(window.LCNDA_APP.state.currentPerson).filter(x => x !== '-').map(x => x.label));
            const b = await heroBtns(page);
            assert.equal(b.includes('more'), left.length > 0, `⋯ ${b.includes('more') ? 'montré' : 'caché'}, menu : ${left.join(', ')}`);
            assert.ok(b.length >= 15, `${b.length} boutons`);
        });
        await t('390 px : tous les boutons passent à la ligne, rien ne déborde', async () => {
            const ph = await browser.newPage({viewport: {width: 390, height: 844}});
            ph.on('pageerror', e => errs.push(`390px : ${e.message}`)); ph.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(`390px console : ${m.text()}`); });
            await ph.goto(base, {waitUntil: 'load', timeout: 90000}); await ph.waitForTimeout(2000);
            await ph.evaluate(async () => { const A = window.LCNDA_APP; A.state.currentPersonId = 1; await A.setModule('personnes'); await A.selectPerson(1, false); });
            await ph.waitForSelector('#workspace .person-hero-actions [data-lc-mb]', {timeout: 15000}); await ph.waitForTimeout(500);
            const m = await ph.evaluate(() => { const a = document.querySelector('#workspace .person-hero-actions'), h = document.querySelector('#workspace .person-hero'), hr = h.getBoundingClientRect(), W = document.documentElement.clientWidth;
                const bs = [...a.children].filter(e => getComputedStyle(e).display !== 'none').map(e => e.getBoundingClientRect());
                return {over: document.documentElement.scrollWidth - W, right: Math.max(...bs.map(r => r.right)), left: Math.min(...bs.map(r => r.left)), hero: hr.right, W, lines: new Set(bs.map(r => Math.round(r.top))).size, n: bs.length}; });
            assert.ok(m.over <= 0, `la page déborde de ${m.over} px`);
            assert.ok(m.right <= Math.min(m.hero, m.W) + 1 && m.left >= 0, `boutons hors du cadre : ${JSON.stringify(m)}`);
            assert.ok(m.lines >= 2, 'sur plusieurs lignes');
            if (shots) { await ph.locator('#workspace .person-hero').scrollIntoViewIfNeeded(); await ph.screenshot({path: path.join(shots, 'fiche-390.png')}); }
            await ph.close();
        });
        await t('aucune erreur dans la console', () => { assert.deepEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill();
        try { fs.rmSync(tmp, {recursive: true, force: true}); } catch (_) {}
    }
    console.log(`${failed ? '✗' : '✓'} boutons de l’en-tête ← menu ⋯ : ${count} vérifications${failed ? `, ${failed} en échec` : ''}`);
    process.exit(failed ? 1 : 0);
})();
