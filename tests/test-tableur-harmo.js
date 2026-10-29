'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🧾 Tableur et règles communes des éditeurs (K18, K19, E1, E5, K2) :   node tests/test-tableur-harmo.js
 *  1. le code : heritage-tableur.js pose UI.editorStatus, UI.editorRail, UI.saveMenu, UI.openFontPicker, UI.autoSaveDialog ;
 *     plus de barre d’état à lui (.xl-status) ni de bouton « Enregistrer » dans ses réglages ;
 *  2. le navigateur (Playwright ; sinon sauté) :
 *     K18 — barre du bas commune : à gauche la feuille et la cellule (+ somme, moyenne…, clic = choisir), au milieu l’aide,
 *           à droite [− 100 % ▾ +] ; ⌘+ / ⌘0 / ⌘1 / ⌘ + molette ; un clic tombe sur la bonne case à 200 % ; zoom retenu ;
 *     K19 — colonne d’outils de 36 px (groupes séparés), outil actif en bleu (⚲ Filtrer, ◫ Panneau) ; « 💾 Enregistrer ▾ » ;
 *     E5  — « Police » ouvre la liste unique des polices, la police et la taille vont dans la cellule (et dans l’export XLSX) ;
 *     K2  — réglages gardés tout de suite, « Fermer » seul, « ✓ Enregistré », « ↶ Annuler », « ↺ Remettre comme au départ » ;
 *     l’aide pendant la frappe posée sur la grille sans la faire bouger ; 390 px et sombre ; aucune erreur.
 *  Captures (si TABLEUR_SHOTS=dossier).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');
const S = require('../assets/js/app-tableur-engine.js');

const appRoot = path.resolve(__dirname, '..');
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; }; const eq = (a, b, m) => { assert.deepStrictEqual(a, b, m); n++; };

/* 1. le code */
{
    const src = fs.readFileSync(path.join(appRoot, 'assets/js/heritage-tableur.js'), 'utf8');
    ['editorStatus', 'editorRail', 'saveMenu', 'openFontPicker', 'autoSaveDialog'].forEach(f => ok(new RegExp(`\\b${f}\\?*\\.?\\(`).test(src), `heritage-tableur.js utilise UI.${f}`));
    ok(!/class="xl-status"/.test(src), 'plus de barre d’état à part (.xl-status)');
    const set = src.slice(src.indexOf('settingsDialog() {'), src.indexOf('applyPrefs() {'));
    ok(set.length > 100 && !/submitLabel: 'Enregistrer'/.test(set) && /submitLabel: 'Fermer'/.test(set) && /data-ui-reset/.test(set), 'réglages : « Fermer » seul et ↺, sans « Enregistrer »');
    const css = fs.readFileSync(path.join(appRoot, 'assets/css/tableur.css'), 'utf8');
    ok(!/^\.xl-status\b/m.test(css) && /\.xl-rail \{ grid-column: 1/.test(css), 'tableur.css : colonne d’outils, plus de .xl-status');
    const idx = fs.readFileSync(path.join(appRoot, 'index.php'), 'utf8');
    ok(/heritage-tableur\.js\?v=\d+/.test(idx) && /tableur\.css\?v=\d+/.test(idx), 'chargés par index.php');
}

const phpPath = findPhp([devBundledPhp()]);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-tableur-harmo-'));
const env = { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media'), GENEALOGY_SKIP_REFERENCE: '1' };
fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
{
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p->exec("INSERT INTO persons(first_name,last_name,gender) VALUES('Jean','Martin','male')"); $p = null;
require 'lib/bootstrap.php'; db(); echo 'ok';`], { cwd: appRoot, encoding: 'utf8', env });
    if (r.status !== 0 || !/ok$/.test(r.stdout)) { console.error(r.stderr || r.stdout); process.exit(1); }
}
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const SHOTS = process.env.TABLEUR_SHOTS || '';

(async () => {
    let pw = null; for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
    if (!pw) { console.log(`✓ ${n} vérifications (code) — navigateur sauté (Playwright absent)`); return; }
    const port = Number(process.env.TABLEUR_PORT) || await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env, stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
    let browser = null;
    try {
        browser = await pw.chromium.launch();
        const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
        const page = await ctx.newPage(); const errors = [];
        page.on('pageerror', e => errors.push('pageerror ' + e.message)); page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push('console ' + m.text()); });
        await page.goto(base); await page.waitForFunction(() => window.LCNDA_EXT?.openWorkbook && window.LCNDA_SHEET && window.LCNDA_APP?.state?.csrf);
        await page.evaluate(() => { try { localStorage.removeItem('genealogie-tableur'); } catch (_) {} });
        const open = () => page.evaluate(() => { const X = window.LCNDA_SHEET; window.LCNDA_EXT.openWorkbook({ name: 'Harmonie', data: X.normalize({ sheets: [{ name: 'Relevé', cells: { A1: 'Nom', B1: 'Âge', A2: 'MARTIN', B2: 62, A3: 'BORIE', B3: 40, B4: '=SOMME(B2:B3)' } }, { name: 'Feuille 2', cells: {} }] }) }); });
        await open(); await page.waitForSelector('dialog.xl-dlg[open] .xl-p-body .xl-c');
        const E = fn => page.evaluate(fn);
        const cur = () => 'window.LCNDA_EXT.tableurInternals.current';

        /* K18 — la barre du bas */
        const bar = await E(() => { const d = document.querySelector('dialog.xl-dlg'), b = d.querySelector('.xl > .ed-status'), r = b?.getBoundingClientRect(), dr = d.getBoundingClientRect(); return { ok: !!b, last: b === d.querySelector('.xl').lastElementChild, bottom: r && Math.round(dr.bottom - r.bottom), where: b?.querySelector('[data-ed-where]').textContent, help: b?.querySelector('[data-ed-help]').textContent, zoom: b?.querySelector('[data-ed-zoom-val]')?.textContent, old: !!d.querySelector('.xl-status') }; });
        ok(bar.ok && bar.last && bar.bottom <= 4, `K18 : la barre commune tout en bas (${JSON.stringify(bar)})`); ok(!bar.old, 'plus de .xl-status');
        ok(/Relevé ! A1/.test(bar.where), `à gauche : la feuille et la cellule (${bar.where})`); ok(/Tape pour écrire/.test(bar.help), 'au milieu : l’aide'); eq(bar.zoom, '100 %', 'à droite : le zoom');
        await page.evaluate(c => { const ed = eval(c); ed.select(1, 1); ed.select(2, 1, true); }, cur());
        const w2 = await E(() => document.querySelector('.ed-status [data-ed-where]').textContent);
        ok(/Relevé ! B2:B3/.test(w2) && /Somme 102/.test(w2) && /Moyenne 51/.test(w2), `la sélection et sa somme (${w2})`);
        await page.click('.ed-status [data-xl-status]'); await page.waitForSelector('.ui-actmenu');
        ok(await page.getByRole('menuitem', { name: /Maximum/ }).count() > 0, 'clic : choisir ce qu’on y voit'); await page.keyboard.press('Escape');
        // le zoom
        await page.click('.ed-status [data-ed-zoom="in"]');
        eq(await E(() => document.querySelector('[data-ed-zoom-val]').textContent), '125 %', '[+] : 125 %');
        ok(await E(() => document.querySelector('[data-xl-wrap]').style.zoom === '1.25'), 'la grille grossit');
        await page.evaluate(c => eval(c).focusGrid(), cur()); await page.keyboard.press('Control+Digit1');
        eq(await E(() => document.querySelector('[data-ed-zoom-val]').textContent), '100 %', '⌘1 : 100 %');
        await page.keyboard.press('Control+Equal'); eq(await E(() => document.querySelector('[data-ed-zoom-val]').textContent), '125 %', '⌘+');
        await page.keyboard.press('Control+Minus'); eq(await E(() => document.querySelector('[data-ed-zoom-val]').textContent), '100 %', '⌘−');
        const vp = await E(() => { const r = document.querySelector('[data-xl-vp]').getBoundingClientRect(); return { x: r.left, y: r.top }; });
        await page.mouse.move(vp.x + 300, vp.y + 200); await page.keyboard.down('Control'); await page.mouse.wheel(0, -200); await page.keyboard.up('Control');
        ok(await E(() => parseInt(document.querySelector('[data-ed-zoom-val]').textContent, 10) > 100), '⌘ + molette : plus grand');
        await page.evaluate(c => eval(c).setZoom(2), cur()); await page.waitForTimeout(100);
        // à 200 %, la case C3 (colonne 92 px, ligne 24 px, en-têtes 46 × 24) est à (46 + 184 + 20, 24 + 48 + 10) × 2
        await page.mouse.click(vp.x + (46 + 184 + 20) * 2, vp.y + (24 + 48 + 10) * 2);
        eq(await page.evaluate(c => eval(c).act, cur()), [2, 2], 'à 200 % : le clic tombe sur C3');
        ok(/Relevé ! C3/.test(await E(() => document.querySelector('[data-ed-where]').textContent)), 'la barre suit');
        await page.mouse.dblclick(vp.x + (46 + 20) * 2, vp.y + (24 + 72 + 10) * 2); await page.waitForSelector('[data-xl-ed]:not([hidden])');
        const edPos = await E(() => { const a = document.querySelector('[data-xl-ed]').getBoundingClientRect(), v = document.querySelector('[data-xl-vp]').getBoundingClientRect(); return [Math.round(a.left - v.left), Math.round(a.top - v.top)]; });
        ok(Math.abs(edPos[0] - 92) <= 4 && Math.abs(edPos[1] - 192) <= 4, `à 200 % : la case d’écriture sur A5 (${edPos})`);
        await page.keyboard.press('Escape');
        eq(await E(() => JSON.parse(localStorage.getItem('genealogie-tableur')).zoom), 2, 'zoom retenu');
        if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'k18-zoom-200.png') });
        await page.evaluate(c => eval(c).setZoom(0.5), cur()); await page.keyboard.press('Control+Digit0');
        eq(await E(() => document.querySelector('[data-ed-zoom-val]').textContent), '200 %', '⌘0 : ajuster à la fenêtre (2 colonnes remplies → 200 %, le plus grand)');
        await page.evaluate(c => eval(c).setZoom(1), cur());

        /* K19 — colonne d’outils, « 💾 Enregistrer ▾ » */
        const rail = await E(() => { const r = document.querySelector('.xl-rail.ed-rail'); return { w: Math.round(r.getBoundingClientRect().width), seps: r.querySelectorAll('.ed-rail-sep').length, n: r.querySelectorAll('.ed-tool').length }; });
        ok(rail.w === 36 && rail.seps === 2 && rail.n >= 10, `K19 : colonne de 36 px, 3 groupes (${JSON.stringify(rail)})`);
        await page.evaluate(c => eval(c).select(0, 0), cur());
        await page.click('.xl-rail [data-xl-cmd="filter"]'); await page.waitForSelector('[data-xl-filter]:not([hidden])');
        ok(await E(() => document.querySelector('.xl-rail [data-xl-cmd="filter"]').classList.contains('is-active')), '⚲ Filtrer : outil actif en bleu');
        await page.click('.xl-rail [data-xl-cmd="filter"]');
        ok(await E(() => document.querySelector('.xl-rail [data-xl-cmd="panel"]').classList.contains('is-active')), '◫ Panneau ouvert');
        await page.click('.xl-rail [data-xl-cmd="panel"]'); ok(await E(() => document.querySelector('.xl-body').classList.contains('no-panel')), '◫ : panneau fermé');
        await page.click('.xl-rail [data-xl-cmd="panel"]');
        const top = await E(() => { const b = document.querySelector('.xl .ui-topbar'); return { h: Math.round(b.getBoundingClientRect().height), more: !!b.querySelector('.ed-save > [data-xl-cmd="save"] + .ed-save-more') }; });
        ok(top.more, 'K19 : « 💾 Enregistrer ▾ »'); ok(top.h < 70, `E1 : la barre du haut sur une ligne (${top.h} px)`);
        await page.click('.xl .ed-save-more'); await page.waitForTimeout(150);
        for (const l of [/Enregistrer une copie/, /Enregistrer comme modèle/, /Exporter/]) ok(await page.getByRole('menuitem', { name: l }).count() > 0, `menu Enregistrer : ${l}`);
        await page.keyboard.press('Escape');

        /* E5 — la police (liste unique) et la taille */
        await page.evaluate(c => eval(c).select(1, 0), cur());
        await page.click('.xl-tools [data-xl-cmd="font"]'); await page.waitForSelector('dialog.ui-fontpick[open] .ui-font');
        const font = await E(() => document.querySelector('dialog.ui-fontpick .ui-font').dataset.f);
        await page.click('dialog.ui-fontpick .ui-font'); await page.click('dialog.ui-fontpick [data-ui-ok]'); await page.waitForSelector('dialog.ui-fontpick', { state: 'detached' });
        eq(await page.evaluate(c => eval(c).curStyle().font, cur()), font, `police mise dans A2 (${font})`);
        ok(await E(() => document.querySelector('.xl-tools [data-xl-cmd="font"]').textContent) === font, 'le bouton montre la police');
        await page.fill('[data-xl-fs]', '18'); await page.press('[data-xl-fs]', 'Enter');
        eq(await page.evaluate(c => eval(c).curStyle().fs, cur()), 18, 'taille 18 px');
        ok(await E(() => /font-size:\s*18px/.test(document.querySelector('.xl-p-body').innerHTML)), 'la case est dessinée en 18 px');
        const xl = await page.evaluate(async c => { const ed = eval(c), X = window.LCNDA_SHEET; return Array.from(new Uint8Array(await (await X.toXlsx(ed.wb, ed.calc)).arrayBuffer())); }, cur());
        const back = await S.fromXlsx(Uint8Array.from(xl).buffer); const st = back.styles[back.sheets[0].cells.A2.s] || {};
        eq([st.fs, st.font], [18, font], 'XLSX : la police et la taille suivent');
        await page.keyboard.press('Control+z'); await page.keyboard.press('Control+z');
        await page.evaluate(c => eval(c).focusGrid(), cur()); await page.keyboard.press('Control+z'); await page.keyboard.press('Control+z');
        ok(!(await page.evaluate(c => eval(c).curStyle().font, cur())), '↶ défait la police');

        /* l’aide pendant la frappe : posée sur la grille, la grille ne bouge pas */
        ok(await E(() => document.querySelector('[data-xl-help]').hidden), 'aide cachée quand il n’y a rien à dire');
        const y0 = await E(() => document.querySelector('[data-xl-vp]').getBoundingClientRect().top);
        await page.evaluate(c => eval(c).select(5, 1), cur()); await page.keyboard.type('=SOMME(');
        await page.waitForFunction(() => !document.querySelector('[data-xl-help]').hidden && /SOMME/.test(document.querySelector('[data-xl-help]').textContent));
        eq(await E(() => document.querySelector('[data-xl-vp]').getBoundingClientRect().top), y0, 'la grille ne bouge pas');
        ok(/Entrée valide/.test(await E(() => document.querySelector('[data-ed-help]').textContent)), 'K18 : l’aide de la frappe dans la barre du bas');
        if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'aide-frappe.png') });
        await page.keyboard.press('Escape'); await page.waitForTimeout(80);
        ok(await E(() => document.querySelector('[data-xl-help]').hidden), 'Échap : l’aide se range');

        /* K2 — les réglages gardés tout de suite */
        await page.evaluate(c => eval(c).run('settings'), cur()); await page.waitForSelector('dialog[open] [name="grid"]');
        const dlg = 'dialog[open]:has([name="grid"])';
        const foot = await E(() => [...document.querySelector('dialog[open]:has([name="grid"]) .modal-actions').querySelectorAll('button')].filter(b => b.offsetParent).map(b => b.textContent.trim()));
        eq(foot, ['Fermer'], `« Fermer » seul en bas (${foot})`);
        ok(await page.locator(`${dlg} .ui-toggle input[name="grid"]`).count() === 1, 'K16 : interrupteurs');
        await page.locator(`${dlg} .ui-toggle:has(input[name="grid"])`).click(); await page.waitForTimeout(300);
        eq(await E(() => JSON.parse(localStorage.getItem('genealogie-tableur')).grid), false, 'gardé tout de suite');
        ok(await E(() => document.querySelector('[data-xl-inner]').classList.contains('xl-nogrid')), 'la grille suit tout de suite');
        ok(/Enregistré/.test(await page.locator(`${dlg} [data-ed-saved]`).textContent()), '« ✓ Enregistré » en haut');
        await page.locator(`${dlg} [name="st_max"]`).check(); await page.waitForTimeout(300);
        eq(await E(() => JSON.parse(localStorage.getItem('genealogie-tableur')).status), ['sum', 'avg', 'count', 'max'], 'barre du bas : Maximum ajouté');
        const undo = page.getByRole('button', { name: /Annuler/ }).last(); await undo.click(); await page.waitForTimeout(300);
        eq(await E(() => JSON.parse(localStorage.getItem('genealogie-tableur')).status), ['sum', 'avg', 'count'], 'H7 « ↶ Annuler » défait le dernier réglage');
        if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'k2-reglages.png') });
        await page.locator('dialog[open]:has([name="grid"]) [data-ui-reset]').click(); await page.waitForTimeout(300);
        ok(await E(() => { const p = JSON.parse(localStorage.getItem('genealogie-tableur') || '{}'); return p.grid === undefined; }), '↺ Remettre comme au départ');
        ok(await E(() => !document.querySelector('[data-xl-inner]').classList.contains('xl-nogrid')), 'quadrillage revenu');
        await page.locator('dialog[open]:has([name="grid"]) .modal-actions button:visible').click();

        /* 390 px, sombre */
        await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(300);
        const phone = await E(() => { const d = document.querySelector('dialog.xl-dlg'); return { over: d.scrollWidth - d.clientWidth, page: document.documentElement.scrollWidth, rail: Math.round(d.querySelector('.xl-rail').getBoundingClientRect().width), bar: d.querySelector('.ed-status').getBoundingClientRect().bottom <= innerHeight + 1, where: d.querySelector('[data-ed-where]').getBoundingClientRect().width > 40 }; });
        ok(phone.over <= 1 && phone.page <= 391 && phone.rail === 36 && phone.bar && phone.where, `390 px : ${JSON.stringify(phone)}`);
        if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'harmo-390.png') });
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark')); await page.waitForTimeout(150);
        const dark = await E(() => getComputedStyle(document.querySelector('.xl > .ed-status')).backgroundColor);
        ok(!/255, 255, 255/.test(dark), `sombre : barre du bas ${dark}`);
        if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'harmo-sombre.png') });
        await page.evaluate(c => { eval(c).dirty = false; }, cur()); await page.click('dialog.xl-dlg .ui-topbar > [data-xl-cmd="close"]');
        await page.waitForSelector('dialog.xl-dlg', { state: 'detached' });
        // rouvert : le zoom retenu revient
        await page.evaluate(() => { const p = JSON.parse(localStorage.getItem('genealogie-tableur') || '{}'); localStorage.setItem('genealogie-tableur', JSON.stringify({ ...p, zoom: 1.5 })); });
        await open(); await page.waitForSelector('dialog.xl-dlg[open] .xl-c');
        eq(await E(() => document.querySelector('[data-ed-zoom-val]').textContent), '150 %', 'rouvert : zoom retenu');
        await page.evaluate(c => { eval(c).dirty = false; }, cur()); await page.click('dialog.xl-dlg .ui-topbar > [data-xl-cmd="close"]');
        eq(errors, [], 'aucune erreur dans la console');
    } finally {
        if (browser) await browser.close();
        proc.kill();
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
    }
    console.log(`✓ ${n} vérifications : Tableur et règles communes (K18, K19, E1, E5, K2)`);
})().catch(e => { console.error(e); process.exit(1); });
