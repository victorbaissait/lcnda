'use strict';
/* Boutons en haut à droite (Réglages → Apparence → « Boutons en haut à droite », assets/js/app-apparence.js) et nom « Réglages ».
 *     node tests/test-boutons-haut.js        (BOUTONS_HAUT_SHOTS=dossier pour garder des captures)
 * 1. Code : la clé « genealogie-topbar-buttons » suit les défauts du site (app.js, api.php) et les 💾 Réglages enregistrés de l’Apparence ;
 *    plus de « Maintenance » écrit à l’écran (onglet, sur-titres, aides) ; le module interne reste « maintenance ».
 * 2. Navigateur (Playwright, si présent) : par défaut tout comme avant (ordre de l’app, 🧓 caché) ; la liste (⠿, numéro, case, Alt + ↑ / ↓) ;
 *    décocher 🧮 → bouton absent (et l’interrupteur de la calculette suit) ; changer l’ordre → ordre dans la barre ; « ✓ Enregistré » et
 *    « ↶ Annuler » (K2) ; ↺ Remettre comme au départ ; 🧓 montré depuis la liste = « Montrer le bouton » du mode simple ;
 *    ancienne adresse #maintenance/design → la page, titre « Réglages » ; 1440 px, 390 px et sombre sans erreur.
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
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
let failed = 0, count = 0;
const t = async (name, fn) => { try { await fn(); count++; console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
const KEY = 'genealogie-topbar-buttons';

(async () => {
    /* ── 1. code ── */
    await t('la clé des boutons du haut suit les défauts du site et les 💾 Réglages enregistrés de l’Apparence', () => {
        assert.ok(read('assets/js/app.js').includes(`'${KEY}'`), 'SITE_DEFAULT_KEYS (app.js)');
        assert.ok(read('api.php').includes(`'${KEY}'`), 'site_defaults_allowed_keys (api.php)');
        assert.ok(read('assets/js/heritage-studio.js').includes(`'${KEY}'`), '💾 Réglages enregistrés : l’Apparence');
        const ap = read('assets/js/app-apparence.js');
        for (const id of ['#side-panel-open', '#new-window-open', '#kiosk-toggle', '#mode-simple-open', '#calculette-open', '#genealogy-switch']) assert.ok(ap.includes(`'${id}'`), id + ' dans la liste');
    });
    await t('« Réglages » à l’écran, module interne « maintenance » gardé', () => {
        const idx = read('index.php');
        assert.match(idx, /<button class="nav-item" data-module="maintenance"><span>10<\/span>Réglages<\/button>/);
        assert.match(read('assets/js/app.js'), /maintenance: \['10 — VÉRIFIER', 'Réglages'\]/);
        assert.match(read('assets/js/app-pages.js'), /maintenance: 'Réglages'\}/);
        const dir = path.join(root, 'assets/js'), left = [];
        for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.js'))) {
            fs.readFileSync(path.join(dir, f), 'utf8').split('\n').forEach((l, i) => { if (/\bMaintenance\b|\bMAINTENANCE\b/.test(l)) left.push(`${f}:${i + 1}`); });
        }
        assert.deepEqual(left, [], 'plus de « Maintenance » écrit dans assets/js (hors noms de fonctions)');
        assert.ok(!/\bMaintenance\b/.test(read('faq-data.js')), 'FAQ de la page de présentation refaite');
    });

    /* ── 2. navigateur ── */
    const phpPath = findPhp([devBundledPhp()]);
    let chromium = null;
    try { ({chromium} = require('playwright')); } catch (_) { try { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); } catch (__) { chromium = null; } }
    if (!chromium || !phpPath) { console.log('— navigateur : Playwright ou PHP absent, partie sautée'); console.log(`${failed ? '✗' : '✓'} boutons du haut : ${count} vérifications`); process.exit(failed ? 1 : 0); }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-boutons-haut-'));
    const shots = process.env.BOUTONS_HAUT_SHOTS || '';
    const envFor = d => ({...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1'});
    fs.mkdirSync(path.join(tmp, 'media'), {recursive: true});
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p->exec("INSERT INTO persons(first_name,last_name,gender,living_status) VALUES('Joseph','Martin','male','deceased'),('Marie','Durand','female','living')"); $p = null;
require 'lib/bootstrap.php'; db();
echo 'ok';`], {cwd: root, encoding: 'utf8', env: envFor(tmp)});
    if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exit(1); }
    const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const port = Number(process.env.BOUTONS_HAUT_PORT) || await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env: envFor(tmp), stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
    const browser = await chromium.launch();
    const errs = [];
    const open = async (w, hash = '', dark = false) => {
        const page = await browser.newPage({viewport: {width: w, height: 900}, colorScheme: dark ? 'dark' : 'light'});
        page.on('pageerror', e => errs.push(`${w}px : ${e.message}`)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(`${w}px console : ${m.text()}`); });
        page.on('dialog', d => d.dismiss());
        await page.addInitScript(() => { try { localStorage.setItem('genealogie-reglages-presentation', 'old'); } catch (_) {} }); // la page « Apparence » entière (les trois groupes : test-reglages-trois-groupes.js)
        if (dark) await page.addInitScript(() => { try { if (!sessionStorage.getItem('t-dark')) { sessionStorage.setItem('t-dark', '1'); localStorage.setItem('genealogie-design', JSON.stringify({preset: 'dark'})); } } catch (_) {} });
        await page.goto(base + hash, {waitUntil: 'load'}); await page.waitForTimeout(2200);
        return page;
    };
    const bar = page => page.$$eval('.topbar-meta > button', els => els.filter(e => !e.hidden && !e.hasAttribute('data-tb-off')).map(e => e.id));
    const allRows = page => page.$$eval('#lc-tb-order .order-row', els => els.map(e => e.dataset.orderKey));
    const rows = async page => (await allRows(page)).filter(k => !/^(et|enq)_/.test(k)); // sans les raccourcis vers les outils
    const shot = async (page, name) => { if (shots) { fs.mkdirSync(shots, {recursive: true}); await page.screenshot({path: path.join(shots, name)}); } };
    try {
        const page = await open(1440);
        await t('par défaut : tout comme avant (◫ ↗ 🔒 🧮 🌳, 🧓 caché)', async () => {
            assert.deepEqual(await bar(page), ['side-panel-open', 'new-window-open', 'kiosk-toggle', 'calculette-open', 'genealogy-switch']);
            assert.equal(await page.evaluate(k => localStorage.getItem(k), KEY), null, 'rien d’enregistré');
        });
        await t('l’ancienne adresse #maintenance/design ouvre l’Apparence ; menu, colonne et sur-titre disent « Réglages »', async () => {
            await page.goto(base + '#maintenance/design'); await page.waitForTimeout(2200);
            assert.equal(await page.evaluate(() => window.LCNDA_APP.state.module + '/' + window.LCNDA_APP.state.maintenanceTab), 'maintenance/design');
            assert.equal((await page.textContent('.main-nav .nav-item[data-module="maintenance"]')).replace(/^\d+/, '').trim(), 'Réglages');
            assert.equal((await page.textContent('#sidebar-title')).trim(), 'Réglages');
            assert.match((await page.textContent('#workspace .page-header .eyebrow')).trim(), /^Réglages( · |$)/);
            assert.ok(!/\bMaintenance\b/.test(await page.evaluate(() => document.body.innerText)), 'plus de « Maintenance » à l’écran');
            assert.ok(await page.$('#lc-topbar-buttons'), 'le cadre « Boutons en haut à droite »');
            assert.equal(await page.$eval('#lc-topbar-buttons', e => e.previousElementSibling?.classList.contains('design-order-grid-four')), true, 'juste après l’ordre du menu');
        });
        await t('la liste : même modèle que les boutons de la fiche (⠿, numéro, case), aperçu', async () => {
            assert.deepEqual(await rows(page), ['split', 'window', 'kiosk', 'simple', 'calc', 'genealogies']);
            const r0 = await page.$eval('#lc-tb-order .order-row', e => ({grip: e.querySelector('.order-grip')?.textContent, n: e.querySelector('.order-number')?.textContent, box: !!e.querySelector('.order-visible input[type=checkbox]')}));
            assert.deepEqual(r0, {grip: '⠿', n: '01', box: true});
            assert.equal(await page.$eval('#lc-tb-order [data-order-key="simple"] [data-tb-show]', e => e.checked), false, '🧓 décoché au départ');
            assert.equal(await page.$$eval('[data-tb-preview] .lc-tb-btn', e => e.length), 5, 'aperçu : 5 boutons');
            await page.locator('#lc-topbar-buttons').scrollIntoViewIfNeeded(); await shot(page, 'boutons-1440.png');
        });
        await t('décocher 🧮 : le bouton disparaît, la calculette suit, « ✓ Enregistré » et « ↶ Annuler » le remet', async () => {
            await page.click('#lc-tb-order [data-order-key="calc"] [data-tb-show]'); await page.waitForTimeout(800);
            assert.equal(await page.$('#calculette-open'), null, 'bouton 🧮 absent');
            assert.equal(JSON.parse(await page.evaluate(() => localStorage.getItem('genealogie-calculette'))).topButton, false, 'même réglage que l’interrupteur de la calculette');
            assert.equal((await page.textContent('.ui-ph-saved')).trim(), '✓ Enregistré');
            const toast = page.locator('.toast', {hasText: 'Réglage changé'}).last();
            await toast.locator('button', {hasText: 'Annuler'}).click(); await page.waitForTimeout(1200);
            assert.ok(await page.$('#calculette-open'), '↶ Annuler : 🧮 revient');
            assert.equal(await page.$eval('#lc-tb-order [data-order-key="calc"] [data-tb-show]', e => e.checked), true);
            await page.click('#lc-tb-order [data-order-key="calc"] [data-tb-show]'); await page.waitForTimeout(800);
            assert.equal(await page.$('#calculette-open'), null);
        });
        await t('changer l’ordre (Alt + ↑) : l’ordre suit dans la barre ; cacher 🔒', async () => {
            for (let i = 0; i < 5; i++) { await page.focus('#lc-tb-order [data-order-key="genealogies"] .order-grip'); await page.keyboard.press('Alt+ArrowUp'); await page.waitForTimeout(200); }
            await page.waitForTimeout(400);
            assert.deepEqual(await rows(page), ['genealogies', 'split', 'window', 'kiosk', 'simple', 'calc']);
            assert.equal(await page.$eval('#lc-tb-order .order-row', e => e.querySelector('.order-number').textContent), '01', 'numéros refaits');
            await page.click('#lc-tb-order [data-order-key="kiosk"] [data-tb-show]'); await page.waitForTimeout(600);
            assert.deepEqual(await bar(page), ['genealogy-switch', 'side-panel-open', 'new-window-open']);
            { const v = JSON.parse(await page.evaluate(k => localStorage.getItem(k), KEY)); assert.deepEqual(v.order.slice(0, 6), ['genealogies', 'split', 'window', 'kiosk', 'simple', 'calc']); assert.deepEqual(v.hidden, ['kiosk']); assert.deepEqual(v.on, []); }
        });
        await t('🧓 coché dans la liste = « Montrer le bouton » du mode simple', async () => {
            await page.click('#lc-tb-order [data-order-key="simple"] [data-tb-show]'); await page.waitForTimeout(600);
            assert.equal(await page.evaluate(() => window.LCNDA_EXT.modeSimple.settings().forAll), true);
            assert.deepEqual(await bar(page), ['genealogy-switch', 'side-panel-open', 'new-window-open', 'mode-simple-open']);
        });
        await t('après un rechargement : même ordre, mêmes boutons cachés', async () => {
            await page.reload(); await page.waitForTimeout(2500);
            assert.deepEqual(await bar(page), ['genealogy-switch', 'side-panel-open', 'new-window-open', 'mode-simple-open']);
            await shot(page, 'boutons-change-1440.png');
        });
        await t('↺ Remettre comme au départ : ordre de l’app, tout montré sauf 🧓', async () => {
            await page.click('[data-tb-reset]'); await page.waitForTimeout(900);
            assert.equal(await page.evaluate(k => localStorage.getItem(k), KEY), null);
            assert.deepEqual(await bar(page), ['side-panel-open', 'new-window-open', 'kiosk-toggle', 'calculette-open', 'genealogy-switch']);
            assert.deepEqual(await rows(page), ['split', 'window', 'kiosk', 'simple', 'calc', 'genealogies']);
        });
        await t('raccourcis vers les outils : cachés au départ, un par outil de modification (Tableaux compris) et par partie d’Enquêtes', async () => {
            const all = await allRows(page);
            for (const k of ['et_montage', 'et_audio', 'et_retouch', 'et_sheet', 'et_textdoc', 'et_website', 'et_house', 'et_boards', 'enq_enquetes', 'enq_battue', 'enq_atelier', 'enq_tableaux']) assert.ok(all.includes(k), k);
            assert.equal(await page.$$eval('#lc-tb-order .order-row [data-tb-show]', els => els.filter(e => /^(et|enq)_/.test(e.closest('.order-row').dataset.orderKey) && e.checked).length), 0, 'tous décochés');
            assert.equal(await page.$$eval('.topbar-meta > .lc-tb-go', els => els.filter(e => !e.hasAttribute('data-tb-off')).length), 0, 'aucun dans la barre');
        });
        await t('cocher 🧮 Tableur et 🧩 Tableaux : boutons en haut, qui ouvrent l’outil et l’onglet', async () => {
            await page.click('#lc-tb-order [data-order-key="et_sheet"] [data-tb-show]'); await page.waitForTimeout(500);
            await page.click('#lc-tb-order [data-order-key="enq_tableaux"] [data-tb-show]'); await page.waitForTimeout(500);
            assert.deepEqual(JSON.parse(await page.evaluate(k => localStorage.getItem(k), KEY)).on.sort(), ['enq_tableaux', 'et_sheet']);
            assert.deepEqual((await bar(page)).filter(x => /^tb-go-/.test(x)), ['tb-go-et_sheet', 'tb-go-enq_tableaux']);
            assert.equal(await page.$$eval('[data-tb-preview] .lc-tb-btn', e => e.length), 7, 'aperçu : 5 + 2');
            await page.click('#tb-go-et_sheet'); await page.waitForTimeout(1800);
            assert.equal(await page.evaluate(() => window.LCNDA_APP.state.module + '/' + window.LCNDA_APP.state.listType), 'listes/edit_tools');
            assert.ok(await page.$('.h-et-page'), 'page des outils');
            assert.match(await page.textContent('.h-et-page'), /Tableaux/, '🧩 Tableaux dans les outils de modification');
            assert.equal(await page.evaluate(() => localStorage.getItem('genealogie-edittools-tab')), 'sheet');
            await page.click('#tb-go-enq_tableaux'); await page.waitForTimeout(1800);
            assert.equal(await page.evaluate(() => window.LCNDA_APP.state.module + '/' + window.LCNDA_APP.state.enquetesTab), 'enquetes/tableaux');
            await page.reload(); await page.waitForTimeout(2500);
            assert.deepEqual((await bar(page)).filter(x => /^tb-go-/.test(x)), ['tb-go-et_sheet', 'tb-go-enq_tableaux'], 'après rechargement');
            await page.goto(base + '#maintenance/design'); await page.waitForTimeout(2200);
            await page.click('[data-tb-reset]'); await page.waitForTimeout(900);
            assert.equal(await page.$$eval('.topbar-meta > .lc-tb-go', els => els.filter(e => !e.hasAttribute('data-tb-off')).length), 0, '↺ : de nouveau cachés');
        });
        await t('chaque raccourci : le clic ouvre la liste des projets (au départ) ou un nouveau projet, au choix', async () => {
            const opts = await page.$$eval('#lc-tb-order [data-order-key="et_sheet"] [data-tb-mode] option', o => o.map(x => x.value + ':' + x.textContent));
            assert.deepEqual(opts, ['list:la liste des projets', 'new:nouveau classeur']);
            assert.equal(await page.$eval('#lc-tb-order [data-order-key="enq_tableaux"] [data-tb-mode]', e => e.value), 'list');
            await page.click('#lc-tb-order [data-order-key="et_sheet"] [data-tb-show]'); await page.waitForTimeout(400);
            await page.selectOption('#lc-tb-order [data-order-key="et_sheet"] [data-tb-mode]', 'new'); await page.waitForTimeout(400);
            assert.deepEqual(JSON.parse(await page.evaluate(k => localStorage.getItem(k), KEY)).mode, {et_sheet: 'new'});
            assert.match(await page.getAttribute('#tb-go-et_sheet', 'title'), /Tableur : nouveau classeur/i);
            await page.click('#tb-go-et_sheet'); await page.waitForTimeout(2500);
            assert.equal(await page.evaluate(() => window.LCNDA_APP.state.listType), 'edit_tools');
            assert.ok(await page.evaluate(() => [...document.querySelectorAll('dialog[open], .xl-editor, [class*="xl-"]')].some(e => e.offsetWidth)), 'le tableur s’ouvre sur un classeur neuf');
            await page.goto(base + '#maintenance/design'); await page.reload(); await page.waitForTimeout(2500); // referme le tableur (classeur vide, rien à garder)
            assert.equal(await page.$eval('#lc-tb-order [data-order-key="et_sheet"] [data-tb-mode]', e => e.value), 'new', 'gardé');
            await page.selectOption('#lc-tb-order [data-order-key="et_sheet"] [data-tb-mode]', 'list'); await page.waitForTimeout(300);
            assert.deepEqual(JSON.parse(await page.evaluate(k => localStorage.getItem(k), KEY)).mode, {});
            await page.click('[data-tb-reset]'); await page.waitForTimeout(900);
        });
        await t('l’interrupteur de la calculette change aussi la liste (une seule valeur)', async () => {
            await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('genealogie-calculette') || '{}'); localStorage.setItem('genealogie-calculette', JSON.stringify({...s, topButton: false})); window.LCNDA_EXT.calculator.refreshButton(); });
            await page.evaluate(() => window.LCNDA_APP.refreshScreen?.()); await page.waitForTimeout(1500);
            assert.equal(await page.$('#calculette-open'), null);
            assert.equal(await page.$eval('#lc-tb-order [data-order-key="calc"] [data-tb-show]', e => e.checked), false);
            await page.click('[data-tb-reset]'); await page.waitForTimeout(800);
        });
        await page.close();
        await t('390 px et mode sombre : la page s’affiche sans défilement de côté', async () => {
            const small = await open(390, '#maintenance/design', true);
            assert.equal(await small.evaluate(() => { const A = window.LCNDA_APP; localStorage.setItem('genealogie-design', JSON.stringify({...A.readDesignSettings(), preset: 'dark'})); A.applyDesign(); return document.documentElement.dataset.theme; }), 'dark', 'mode sombre');
            await small.locator('#lc-topbar-buttons').scrollIntoViewIfNeeded(); await small.waitForTimeout(300);
            const over = await small.evaluate(() => { const ws = document.getElementById('workspace'); const b = document.getElementById('lc-topbar-buttons').getBoundingClientRect(); return {scroll: document.documentElement.scrollWidth - window.innerWidth, right: Math.round(b.right - window.innerWidth), ws: ws.scrollWidth - ws.clientWidth}; });
            assert.ok(over.scroll <= 1 && over.right <= 1 && over.ws <= 1, JSON.stringify(over));
            await shot(small, 'boutons-390-sombre.png');
            await small.close();
        });
        await t('aucune erreur JavaScript', () => assert.deepEqual(errs, []));
    } finally {
        await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true});
    }
    console.log(`${failed ? '✗' : '✓'} boutons du haut et « Réglages » : ${count} vérifications`);
    process.exit(failed ? 1 : 0);
})();
