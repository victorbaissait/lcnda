'use strict';
/* Harmonisation L6 — chercher dans une page des Réglages (assets/js/app-reglages-recherche.js).
 *     node tests/test-harmo-l6-recherche.js        (HARMO_L6_SHOTS=dossier pour garder des captures)
 * 1. Le code : un seul composant, chargé après app-ui.js ; aucune page des Réglages n'a à l'appeler.
 * 2. Navigateur (Playwright, si présent) : Raccourcis clavier (case sous l'en-tête K5, collée en haut, « / », rubriques
 *    « 2 sur 22 », lettres surlignées, touches « ctrl p », Échap, « Tout montrer »), Glossaire (cadres repliés en une
 *    ligne grise), Types d'événements, rien trouvé (K10 + « 🔍 Chercher dans tous les Réglages » → case de la colonne),
 *    vidée en quittant la page, pas de case sur une page courte, mode sombre à 390 px, aucune erreur JavaScript.
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
const js = f => fs.readFileSync(path.join(root, 'assets/js', f), 'utf8');
let failed = 0, count = 0;
const t = async (name, fn) => { try { await fn(); count++; console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };

(async () => {
    await t('L6 un seul composant, chargé après app-ui.js, styles avant le mode sombre', () => {
        const idx = fs.readFileSync(path.join(root, 'index.php'), 'utf8');
        assert.ok(idx.indexOf('assets/js/app-reglages-recherche.js?v=') > idx.indexOf('assets/js/app-ui.js?v='));
        const css = fs.readFileSync(path.join(root, 'assets/css/app.css'), 'utf8');
        assert.ok(css.indexOf('.ui-l6 {') > 0 && css.indexOf('.ui-l6 {') < css.indexOf('Mode sombre automatique'));
        const src = js('app-reglages-recherche.js'); new Function(src);
        assert.match(src, /UI\.searchField/); assert.match(src, /Chercher dans tous les Réglages/);
    });

    let chromium = null;
    try { ({chromium} = require('playwright')); } catch (_) { try { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); } catch (__) { chromium = null; } }
    const phpPath = findPhp([devBundledPhp()]);
    if (!chromium || !phpPath) { console.log('— navigateur : Playwright ou PHP absent, partie sautée'); console.log(`${failed ? '✗' : '✓'} harmonisation L6 : ${count} vérifications`); process.exit(failed ? 1 : 0); }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-harmo-l6-'));
    const shots = process.env.HARMO_L6_SHOTS || '';
    const envFor = d => ({...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1'});
    fs.mkdirSync(path.join(tmp, 'media'), {recursive: true});
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p->exec("INSERT INTO persons(first_name,last_name,gender,living_status) VALUES('Joseph','Martin','male','deceased'),('Marie','Durand','female','living')"); $p = null;
require 'lib/bootstrap.php'; db(); echo 'ok';`], {cwd: root, encoding: 'utf8', env: envFor(tmp)});
    if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exit(1); }
    const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const port = Number(process.env.HARMO_L6_PORT) || await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env: envFor(tmp), stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
    const browser = await chromium.launch();
    const errs = [];
    const open = async (w, dark = false) => {
        const page = await browser.newPage({viewport: {width: w, height: 900}, colorScheme: dark ? 'dark' : 'light'});
        page.on('pageerror', e => errs.push(`${w}px : ${e.message}`)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(`${w}px console : ${m.text()}`); });
        page.on('dialog', d => d.dismiss());
        await page.goto(base, {waitUntil: 'load'}); await page.waitForTimeout(1800);
        if (dark) await page.evaluate(() => { const A = window.LCNDA_APP; localStorage.setItem('genealogie-design', JSON.stringify({...A.readDesignSettings(), preset: 'dark'})); A.applyDesign(); });
        return page;
    };
    const go = async (page, id) => { await page.evaluate(async id => { const A = window.LCNDA_APP; document.querySelectorAll('dialog[open]').forEach(d => d.close()); A.state.maintenanceTab = id; await A.setModule('maintenance'); }, id); await page.waitForTimeout(1300); };
    const shot = (page, n) => shots ? page.screenshot({path: path.join(shots, n)}) : null;
    const typeIn = async (page, txt) => { await page.fill('.ui-l6 .ui-l6-q', txt); await page.waitForTimeout(350); };
    try {
        const page = await open(1440);
        await t('L6 Raccourcis clavier : la case sous l’en-tête K5, collée en haut, « / » y va', async () => {
            await go(page, 'raccourcis');
            const st = await page.evaluate(() => { const b = document.querySelector('#workspace .ui-l6'); return {ok: !!b, prev: b?.previousElementSibling?.className || '', pos: b && getComputedStyle(b).position}; });
            assert.ok(st.ok, 'la case est là'); assert.match(st.prev, /page-header/); assert.equal(st.pos, 'sticky');
            await page.mouse.move(900, 600); await page.keyboard.press('/');
            assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('ui-l6-q')), true, '« / » met le curseur dans la case de la page');
        });
        await t('L6 « impr » : lignes filtrées, rubriques « N sur M », lettres surlignées, « N lignes · N cachées · Tout montrer »', async () => {
            await page.keyboard.type('impr'); await page.waitForTimeout(400);
            const st = await page.evaluate(() => ({info: document.querySelector('.ui-l6-info').textContent, counts: [...document.querySelectorAll('.ui-l6-count')].map(e => e.textContent), marks: [...document.querySelectorAll('mark.ui-l6-mark')].map(m => m.textContent.toLowerCase()),
                visible: [...document.querySelectorAll('[data-shortcut-row]')].filter(r => r.getClientRects().length).map(r => r.textContent)}));
            assert.match(st.info, /^\d+ lignes? · \d+ cachées · Tout montrer$/); assert.ok(st.counts.length >= 1 && st.counts.every(c => /^\d+ sur \d+$/.test(c)), st.counts.join(' / '));
            assert.ok(st.marks.length && st.marks.every(m => m === 'impr')); assert.ok(st.visible.length >= 1 && st.visible.every(v => /impr/i.test(v)), st.visible.join(' / '));
            await page.mouse.wheel(0, 1500); await page.waitForTimeout(200);
            await shot(page, 'l6-raccourcis.png');
        });
        await t('L6 une touche (« ctrl p ») trouve les raccourcis qui l’utilisent', async () => {
            await typeIn(page, 'ctrl p');
            const v = await page.evaluate(() => [...document.querySelectorAll('[data-shortcut-row]')].filter(r => r.getClientRects().length).map(r => r.querySelector('kbd[data-k]')?.dataset.k));
            assert.ok(v.length >= 1, 'au moins un raccourci'); assert.ok(v.every(k => /^(Ctrl|⌘|Cmd)\+P$/i.test(k)), v.join(' / '));
        });
        await t('L6 Échap vide la case : tout revient', async () => {
            await page.focus('.ui-l6 .ui-l6-q'); await page.keyboard.press('Escape'); await page.waitForTimeout(350);
            const st = await page.evaluate(() => ({v: document.querySelector('.ui-l6-q').value, hidden: document.querySelectorAll('.ui-l6-hide').length, marks: document.querySelectorAll('mark.ui-l6-mark').length, counts: document.querySelectorAll('.ui-l6-count').length}));
            assert.deepEqual(st, {v: '', hidden: 0, marks: 0, counts: 0});
        });
        await t('L6 rien trouvé : la petite ligne K10 et « 🔍 Chercher dans tous les Réglages » met le mot dans la case de la colonne', async () => {
            await typeIn(page, 'xylophone');
            const st = await page.evaluate(() => ({line: document.querySelector('.ui-l6-none.empty-line .empty-line-text')?.textContent, btn: !!document.querySelector('[data-l6-global]')}));
            assert.match(st.line, /Rien pour « xylophone » dans cette page/); assert.ok(st.btn);
            await shot(page, 'l6-rien.png');
            await page.click('[data-l6-global]'); await page.waitForTimeout(300);
            assert.equal(await page.evaluate(() => document.querySelector('.mt-search, [data-mt-search]')?.value), 'xylophone');
            await page.evaluate(() => { const s = document.querySelector('.mt-search, [data-mt-search]'); s.value = ''; s.dispatchEvent(new Event('input', {bubbles: true})); });
        });
        await t('L6 Glossaire : cadres avec un résultat gardés, les autres repliés en une ligne grise ; « Tout montrer »', async () => {
            await go(page, 'help');
            await typeIn(page, 'bapt');
            const st = await page.evaluate(() => ({rest: document.querySelector('.ui-l6-rest')?.textContent || '', terms: [...document.querySelectorAll('.help-term')].filter(e => e.getClientRects().length).map(e => e.querySelector('dt')?.textContent), letters: [...document.querySelectorAll('.help-letter')].filter(e => e.getClientRects().length).length}));
            assert.match(st.rest, /autres cadres/); assert.ok(st.terms.includes('Baptême'), st.terms.join(', ')); assert.ok(st.letters >= 1 && st.letters < 10);
            await shot(page, 'l6-glossaire.png');
            await page.click('.ui-l6-info [data-l6-all]'); await page.waitForTimeout(300);
            assert.equal(await page.evaluate(() => document.querySelectorAll('.ui-l6-hide').length), 0);
        });
        await t('L6 vidée en quittant la page', async () => {
            await go(page, 'raccourcis'); await typeIn(page, 'impr');
            await go(page, 'help'); await go(page, 'raccourcis');
            assert.equal(await page.evaluate(() => document.querySelector('.ui-l6-q')?.value), '');
        });
        await t('L6 Types d’événements : la case filtre le tableau ; une page courte n’a pas de case', async () => {
            await go(page, 'event_types');
            await typeIn(page, 'naiss');
            const rows = await page.evaluate(() => [...document.querySelectorAll('#event-types-body tr')].filter(r => r.getClientRects().length).map(r => r.querySelector('.event-type-label')?.textContent));
            assert.ok(rows.length >= 1 && rows.length < 20, rows.join(', ')); assert.ok(rows.every(x => /naiss/i.test(x)), rows.join(', '));
            await go(page, 'fusion');
            assert.equal(await page.evaluate(() => !!document.querySelector('#workspace .ui-l6')), false);
        });
        await page.close();
        const dk = await open(390, true);
        await t('L6 mode sombre à 390 px : la case tient dans l’écran, rien ne déborde', async () => {
            await go(dk, 'raccourcis');
            await typeIn(dk, 'imprimer');
            const st = await dk.evaluate(() => { const b = document.querySelector('.ui-l6').getBoundingClientRect(); return {l: b.left, r: b.right, vw: innerWidth, sw: document.documentElement.scrollWidth, bg: getComputedStyle(document.querySelector('.ui-l6')).backgroundColor, theme: document.documentElement.dataset.theme}; });
            assert.ok(st.l >= 0 && st.r <= st.vw + 1, JSON.stringify(st)); assert.ok(st.sw <= st.vw + 1, 'pas de défilement de côté : ' + JSON.stringify(st));
            assert.equal(st.theme, 'dark'); assert.notEqual(st.bg, 'rgb(255, 255, 255)');
            await shot(dk, 'l6-sombre-390.png');
        });
        await t('L6 aucune erreur JavaScript', () => assert.deepEqual(errs, []));
    } finally {
        await browser.close(); proc.kill();
        fs.rmSync(tmp, {recursive: true, force: true});
    }
    console.log(`${failed ? '✗' : '✓'} harmonisation L6 : ${count} vérifications`);
    process.exit(failed ? 1 : 0);
})();
