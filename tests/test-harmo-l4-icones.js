'use strict';
/* Harmonisation L4 — une grille d'icônes commune (assets/js/app-icones.js).
 *     node tests/test-harmo-l4-icones.js        (HARMO_L4_SHOTS=dossier pour garder des captures)
 * 1. Le code : les menus d'icônes de plus de 12 choix passent par la grille (types d'événements, fonds de carte, émojis,
 *    gros boutons du mode simple, types d'œuvres, sortes de fiches) ; index.php charge le composant après app-ui.js.
 * 2. Navigateur (Playwright, si présent) : types d'événements (recherche « eglise », flèches, Entrée, enregistré en base,
 *    récentes), fond de la carte (vignettes 104 px), case d'émoji dans une fenêtre (« bateau » → 🚢, valeur envoyée),
 *    gros bouton du mode simple (icône enregistrée), Échap, mode sombre à 390 px, aucune erreur JavaScript.
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
    /* ── 1. le code ── */
    await t('L4 le composant est chargé après app-ui.js, ses styles sont dans app.css avant le mode sombre', () => {
        const idx = fs.readFileSync(path.join(root, 'index.php'), 'utf8');
        assert.ok(idx.indexOf('assets/js/app-icones.js?v=') > idx.indexOf('assets/js/app-ui.js?v='));
        const css = fs.readFileSync(path.join(root, 'assets/css/app.css'), 'utf8');
        assert.ok(css.indexOf('.ui-ig-tile') > 0 && css.indexOf('.ui-ig-tile') < css.indexOf('Mode sombre automatique'));
        const src = js('app-icones.js'); new Function(src);
        for (const k of ['UI.iconPicker', 'UI.iconField', 'UI.registerIconSet', 'UI.pickEmojiGrid', "'genealogie-recent-icons'"]) assert.ok(src.includes(k), k);
    });
    await t('L4 les longs menus d’icônes passent par la grille', () => {
        const m = js('app-maintenance.js');
        assert.equal((m.match(/eventIconOptionsHtml\(/g) || []).length, (m.match(/data-ui-icons="event"[^>]*>\$\{eventIconOptionsHtml|data-ui-icons="event"[^`]*?eventIconOptionsHtml/g) || []).length, 'chaque menu des types d’événements a data-ui-icons="event"');
        assert.match(js('heritage-more.js'), /ext\.EMOJI_GROUPS = EMOJIS/);
        assert.match(js('heritage-more.js'), /pickEmojiGrid\(input, onPick, opts\)/);
        assert.match(js('app-mode-simple.js'), /iconFieldHtml\(\{set: 'ms-tiles'/);
        assert.match(js('heritage-oeuvres-wizard.js'), /registerIconSet\?\.\('oe-types'/);
        assert.match(js('heritage-artist-panel.js'), /iconFieldHtml\(\{name: 'icon', set: 'ar-types'/);
    });

    /* ── 2. navigateur ── */
    let chromium = null;
    try { ({chromium} = require('playwright')); } catch (_) { try { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); } catch (__) { chromium = null; } }
    const phpPath = findPhp([devBundledPhp()]);
    if (!chromium || !phpPath) { console.log('— navigateur : Playwright ou PHP absent, partie sautée'); console.log(`${failed ? '✗' : '✓'} harmonisation L4 : ${count} vérifications`); process.exit(failed ? 1 : 0); }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-harmo-l4-'));
    const shots = process.env.HARMO_L4_SHOTS || '';
    const envFor = d => ({...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1'});
    fs.mkdirSync(path.join(tmp, 'media'), {recursive: true});
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p->exec("INSERT INTO persons(first_name,last_name,gender,living_status) VALUES('Joseph','Martin','male','deceased'),('Marie','Durand','female','living')"); $p = null;
require 'lib/bootstrap.php'; db(); echo 'ok';`], {cwd: root, encoding: 'utf8', env: envFor(tmp)});
    if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exit(1); }
    const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const port = Number(process.env.HARMO_L4_PORT) || await freePort();
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
    const go = (page, id) => page.evaluate(async id => { const A = window.LCNDA_APP; document.querySelectorAll('dialog[open]').forEach(d => d.close()); A.state.maintenanceTab = id; await A.setModule('maintenance'); }, id);
    const shot = (page, n) => shots ? page.screenshot({path: path.join(shots, n)}) : null;
    try {
        const page = await open(1440);
        await t('L4 types d’événements : pastille, grille (« Tout (n) », rubriques), recherche « eglise », Entrée → enregistré en base', async () => {
            await go(page, 'event_types'); await page.waitForTimeout(1500);
            const st = await page.evaluate(() => ({hosts: document.querySelectorAll('#event-types-body .ui-icf-host').length, rows: document.querySelectorAll('#event-types-body tr').length, sel: getComputedStyle(document.querySelector('#event-types-body select')).display}));
            assert.ok(st.rows > 10); assert.equal(st.hosts, st.rows); assert.equal(st.sel, 'none', 'le menu reste dessous, caché');
            await page.click('#event-types-body tr:first-child [data-icf=change]'); await page.waitForTimeout(400);
            const g = await page.evaluate(() => { const p = document.querySelector('.ui-ig'); return {chips: [...p.querySelectorAll('[data-ig-chip]')].map(b => b.textContent), tiles: p.querySelectorAll('.ui-ig-tile').length, focus: document.activeElement?.classList.contains('ui-ig-q'), w: p.querySelector('.ui-ig-tile').getBoundingClientRect().width}; });
            assert.match(g.chips[0], /^Tout \(\d{2,}\)$/); assert.ok(g.chips.some(c => /Religion/.test(c)), g.chips.join(' · ')); assert.ok(g.tiles > 12); assert.equal(g.focus, true, 'le curseur va dans la case C1'); assert.ok(g.w >= 74, 'vignettes de 74 px au moins');
            await shot(page, 'l4-evenements.png');
            await page.keyboard.type('eglise'); await page.waitForTimeout(300);
            const q = await page.evaluate(() => ({lb: document.querySelector('.ui-ig-lb')?.textContent, first: document.querySelector('.ui-ig-tile.is-cur')?.textContent, mark: document.querySelector('.ui-ig-tile mark')?.textContent}));
            assert.match(q.lb, /pour « eglise »/); assert.match(q.first, /Église/); assert.equal(q.mark, 'Église');
            await page.keyboard.press('Enter'); await page.waitForTimeout(1200);
            const after = await page.evaluate(async () => { const id = document.querySelector('#event-types-body tr:first-child select').dataset.iconEventType; const d = await window.LCNDA_APP.api('event_types_admin'); return {open: !!document.querySelector('.ui-ig'), id, icon: (d.event_types || d).find?.(x => String(x.id) === String(id))?.icon, chip: document.querySelector('#event-types-body tr:first-child .ui-icf-chip b')?.textContent}; });
            assert.equal(after.open, false); assert.equal(after.icon, 'churchBuilding', 'enregistré en base par l’écouteur d’avant'); assert.equal(after.chip, 'Église');
        });
        await t('L4 récentes d’abord, flèches ← → ↑ ↓, Échap ferme sans rien changer', async () => {
            await page.click('#event-types-body tr:nth-child(2) [data-icf=change]'); await page.waitForTimeout(400);
            const st = await page.evaluate(() => ({lb: document.querySelector('.ui-ig-lb')?.textContent, rec: document.querySelector('.ui-ig-tiles .ui-ig-tile')?.textContent, chip: [...document.querySelectorAll('[data-ig-chip]')].some(b => /Récentes/.test(b.textContent))}));
            assert.match(st.lb, /Récentes/); assert.match(st.rec, /Église/); assert.ok(st.chip);
            const before = await page.evaluate(() => document.querySelector('#event-types-body tr:nth-child(2) select').value);
            await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowDown');
            const cur = await page.evaluate(() => Number(document.querySelector('.ui-ig-tile.is-cur')?.dataset.igI));
            assert.ok(cur > 1, 'les flèches se déplacent dans la grille : ' + cur);
            await page.keyboard.press('Escape'); await page.waitForTimeout(200);
            const st2 = await page.evaluate(() => ({open: !!document.querySelector('.ui-ig'), v: document.querySelector('#event-types-body tr:nth-child(2) select').value}));
            assert.equal(st2.open, false); assert.equal(st2.v, before);
        });
        await t('L4 fond de la carte : vignettes de 104 px avec l’image du fond, choix retenu', async () => {
            await page.evaluate(async () => { await window.LCNDA_APP.setModule('carte'); }); await page.waitForTimeout(1800);
            const has = await page.evaluate(() => !!document.querySelector('#map-background + .ui-icf-host'));
            assert.ok(has, 'le menu « Fond » de la carte a la pastille');
            await page.click('#map-background + .ui-icf-host [data-icf=change]'); await page.waitForTimeout(500);
            const g = await page.evaluate(() => { const p = document.querySelector('.ui-ig.is-bg'); return {ok: !!p, w: p?.querySelector('.ui-ig-tile')?.getBoundingClientRect().width, imgs: p?.querySelectorAll('.ui-ig-img').length, chips: [...(p?.querySelectorAll('[data-ig-chip]') || [])].map(b => b.textContent)}; });
            assert.ok(g.ok); assert.ok(g.w >= 104, 'vignettes de 104 px : ' + g.w); assert.ok(g.imgs > 12); assert.ok(g.chips.some(c => /historiques/i.test(c)), g.chips.join(' · '));
            await page.keyboard.type('cassini'); await page.waitForTimeout(300);
            await shot(page, 'l4-fonds.png');
            await page.keyboard.press('Enter'); await page.waitForTimeout(800);
            const v = await page.evaluate(() => ({sel: document.querySelector('#map-background')?.value, ls: JSON.parse(localStorage.getItem('genealogie-design') || '{}').mapBackground}));
            assert.match(v.sel, /^cassini/); assert.equal(v.ls, v.sel);
        });
        await t('L4 case d’émoji dans une fenêtre : pastille, « bateau » → 🚢, valeur envoyée ; ext.pickEmoji ouvre la même grille', async () => {
            await page.evaluate(() => { window.__sub = null; window.LCNDA_EXT.openDialog({eyebrow: 'TEST', title: 'Essai L4', body: '<div class="form-grid"><label>Icône<input name="icon" class="h-be-icon" value="📚" maxlength="16"></label><button type="button" data-t-pick>Choisir</button><input data-t-emoji></div>', onSubmit: f => { window.__sub = Object.fromEntries(new FormData(f.closest ? (f.closest('form') || f) : f)); return true; }}); });
            await page.waitForTimeout(500);
            assert.equal(await page.evaluate(() => document.querySelector('dialog[open] .ui-icf-chip .pk-ic')?.textContent), '📚');
            await page.click('dialog[open] [data-icf=change]'); await page.waitForTimeout(400);
            const chips = await page.evaluate(() => [...document.querySelectorAll('dialog[open] .ui-ig [data-ig-chip]')].map(b => b.textContent));
            assert.match(chips[0], /^Tout \(\d{3,}\)$/); assert.ok(chips.some(c => /Famille/.test(c)));
            await page.keyboard.type('bateau'); await page.waitForTimeout(300);
            assert.ok(await page.evaluate(() => [...document.querySelectorAll('.ui-ig-tile')].some(t => t.textContent.includes('🚢'))), 'recherche en français');
            await shot(page, 'l4-emojis.png');
            await page.evaluate(() => [...document.querySelectorAll('.ui-ig-tile')].find(t => t.textContent.includes('🚢')).click()); await page.waitForTimeout(200);
            await page.evaluate(() => window.LCNDA_EXT.pickEmoji(document.querySelector('dialog[open] [data-t-emoji]')));
            await page.waitForTimeout(300);
            assert.ok(await page.evaluate(() => !!document.querySelector('dialog[open] .ui-ig')), 'ext.pickEmoji → la grille commune');
            await page.keyboard.type('chien'); await page.waitForTimeout(300); await page.keyboard.press('Enter'); await page.waitForTimeout(200);
            assert.match(await page.evaluate(() => document.querySelector('dialog[open] [data-t-emoji]').value), /🐶|🐕/);
            await page.click('dialog[open] .modal-actions button[type=submit]'); await page.waitForTimeout(400);
            assert.equal(await page.evaluate(() => window.__sub?.icon), '🚢');
        });
        await t('L4 gros bouton du mode simple : grille des icônes proposées, icône enregistrée', async () => {
            await go(page, 'accessibilite'); await page.waitForTimeout(1200);
            await page.evaluate(() => document.querySelector('[data-ms-tab="simple"]')?.click()); await page.waitForTimeout(1200);
            await page.evaluate(() => { const h = document.querySelector('[data-ms-sec="show"]'); if (h && h.getAttribute('aria-expanded') !== 'true') h.click(); }); await page.waitForTimeout(800);
            await page.evaluate(() => document.querySelector('[data-ms-tedit]')?.click()); await page.waitForTimeout(800);
            const k = await page.evaluate(() => document.querySelector('[data-ms-ticon-in]')?.dataset.msTiconIn);
            assert.ok(k, 'la case de l’icône du cadre');
            await page.click(`[data-ms-ticon-in="${k}"] + .ui-icf-host [data-icf=change]`); await page.waitForTimeout(400);
            const n = await page.evaluate(() => document.querySelector('.ui-ig [data-ig-chip]')?.textContent);
            assert.match(n, /^Tout \(\d+\)$/); assert.ok(Number(n.match(/\d+/)[0]) > 12);
            await page.keyboard.type('chien'); await page.waitForTimeout(300); await page.keyboard.press('Enter'); await page.waitForTimeout(900);
            const saved = await page.evaluate(k => JSON.parse(localStorage.getItem('genealogie-mode-simple') || '{}').tx?.[k]?.icon, k);
            assert.equal(saved, '🐶');
        });
        await page.close();
        const dk = await open(390, true);
        await t('L4 mode sombre à 390 px : la grille tient dans l’écran, sans défilement de côté', async () => {
            await go(dk, 'event_types'); await dk.waitForSelector('#event-types-body tr:first-child [data-icf=change]', {timeout: 8000});
            await dk.evaluate(() => document.querySelector('#event-types-body tr:first-child [data-icf=change]').scrollIntoView({block: 'center'}));
            await dk.click('#event-types-body tr:first-child [data-icf=change]'); await dk.waitForTimeout(500);
            const st = await dk.evaluate(() => { const r = document.querySelector('.ui-ig').getBoundingClientRect(); return {l: r.left, r: r.right, top: r.top, bottom: r.bottom, vw: innerWidth, vh: innerHeight, bg: getComputedStyle(document.querySelector('.ui-ig')).backgroundColor, theme: document.documentElement.dataset.theme}; });
            assert.ok(st.l >= 0 && st.r <= st.vw, JSON.stringify(st)); assert.ok(st.top >= 0 && st.bottom <= st.vh, JSON.stringify(st));
            assert.equal(st.theme, 'dark'); assert.notEqual(st.bg, 'rgb(255, 255, 255)');
            await shot(dk, 'l4-sombre-390.png');
            await dk.keyboard.press('Escape');
        });
        await t('L4 aucune erreur JavaScript', () => assert.deepEqual(errs, []));
    } finally {
        await browser.close(); proc.kill();
        fs.rmSync(tmp, {recursive: true, force: true});
    }
    console.log(`${failed ? '✗' : '✓'} harmonisation L4 : ${count} vérifications`);
    process.exit(failed ? 1 : 0);
})();
