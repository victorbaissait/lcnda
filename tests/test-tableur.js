'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🧮 Tableur (Listes → Outils de modification), API et navigateur :   node tests/test-tableur.js
 *  1. API : enregistrer, relire, renommer, dupliquer, supprimer un classeur ; données forgées refusées ou nettoyées ; CSRF ;
 *  2. navigateur (Playwright ; sinon sauté), base neuve :
 *     liste vide → « ＋ Nouveau classeur » ; saisie au clavier (Tab, Entrée) ; formule avec la liste des fonctions ;
 *     erreur expliquée ; feuilles (ajouter, renommer, la formule suit, supprimer puis ↶) ; ↶ ↷ ; gras ; tri ; filtre (barre H10) ;
 *     enregistrer et rouvrir ; import CSV (fenêtre K13) ; export XLSX (fichier relu par le moteur) ;
 *     10 000 lignes × 30 colonnes : ouverture, défilement sans gel, peu de cases dans la page ;
 *     390 px et mode sombre ; aucune erreur dans la console.
 *  Captures (si TABLEUR_SHOTS=dossier) : liste, éditeur, 390 px, sombre.
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
const phpPath = findPhp([devBundledPhp()]);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-tableur-'));
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
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; }; const eq = (a, b, m) => { assert.deepStrictEqual(a, b, m); n++; };

(async () => {
    const port = Number(process.env.TABLEUR_PORT) || await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-d', 'post_max_size=256M', '-d', 'memory_limit=1024M', '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env, stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
    let pw = null; for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
    let browser = null;
    try {
        /* 1. API (avec le jeton de la page) */
        /* (les appels passent par la page : le jeton CSRF est lié à sa session) */
        if (!pw) { console.log('  – navigateur : sauté (Playwright absent)'); return; }
        browser = await pw.chromium.launch();
        const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
        await ctx.addInitScript(() => { try { localStorage.setItem('genealogie-edittools-tab', 'sheet'); } catch (_) {} });
        const page = await ctx.newPage(); const errors = [];
        page.on('pageerror', e => errors.push('pageerror ' + e.message)); page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push('console ' + m.text()); });
        await page.goto(base); await page.waitForFunction(() => window.LCNDA_APP?.setModule && window.LCNDA_EXT?.openWorkbook && window.LCNDA_SHEET && window.LCNDA_APP.state.csrf);
        const api = (action, body) => page.evaluate(async ({ action, body, get }) => { try { const r = get ? await window.LCNDA_APP.api(action, body || {}) : await window.LCNDA_APP.api(action, {}, { method: 'POST', body }); return { ok: true, r }; } catch (e) { return { ok: false, e: e.message }; } }, { action, body, get: ['workbook', 'workbooks'].includes(action) });
        const wb = S.normalize({ sheets: [{ name: 'Relevé', cells: { A1: 'Nom', B1: 'Âge', A2: 'MARTIN', B2: 62, B3: { v: '=B2*2', s: 1 } } }], styles: [{}, { b: 1, fill: '#fff1a8' }] });
        const saved = await api('save_workbook', { name: 'Essai API', data: S.compact(wb) }); ok(saved.ok, 'enregistrer'); const id = saved.r.result.id;
        const back = await api('workbook', { id }); eq([back.r.name, back.r.data.sheets[0].cells.B3.v, back.r.data.styles[1].fill], ['Essai API', '=B2*2', '#fff1a8'], 'relire');
        const list = await api('workbooks'); eq(list.r.items[0].info.sheets, 1); eq(list.r.items[0].info.preview[0], ['Nom', 'Âge', ''], 'résumé pour la vignette');
        ok((await api('rename_workbook', { id, name: 'Renommé' })).ok, 'renommer'); eq((await api('workbook', { id })).r.name, 'Renommé');
        const dup = await api('duplicate_workbook', { id }); ok(dup.ok && dup.r.result.id !== id, 'dupliquer');
        const del = await api('delete_workbook', { id: dup.r.result.id }); ok(del.ok && del.r.result.workbook.name, 'supprimer rend le classeur (pour ↶)');
        ok(!(await api('save_workbook', { name: 'x', data: { sheets: 'rien' } })).ok, 'données forgées refusées');
        ok(!(await api('save_workbook', { name: 'x', data: { sheets: [] } })).ok, 'au moins une feuille');
        const forged = await api('save_workbook', { name: '<img src=x onerror=alert(1)>', data: { sheets: [{ name: 'a/b*c', cells: { A1: { v: { evil: 1 } }, 'A1)': 1, B2: 'ok' } }] } }); ok(forged.ok, 'cellules forgées nettoyées');
        const fb = (await api('workbook', { id: forged.r.result.id })).r; eq([fb.data.sheets[0].name, Object.keys(fb.data.sheets[0].cells)], ['a b c', ['A1', 'B2']]); eq(fb.data.sheets[0].cells.A1.v, null);
        await api('delete_workbook', { id: forged.r.result.id });
        const noCsrf = await page.evaluate(async () => (await fetch('api.php?action=save_workbook', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'x', data: { sheets: [{ name: 'a', cells: {} }] } }) })).status);
        ok(noCsrf >= 400, 'sans jeton CSRF : refusé');

        /* 2. la liste et un nouveau classeur */
        await page.evaluate(() => { window.LCNDA_APP.state.listType = 'edit_tools'; window.LCNDA_APP.setModule('listes'); });
        await page.waitForSelector('[data-et-tab="sheet"].is-active');
        await page.waitForSelector('.h-et-page [data-et-open]');
        ok(await page.locator('.h-et-page').getByText('Renommé').count() > 0, 'le classeur est dans la liste');
        if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'j-liste.png') });
        await page.click('.h-et-bar [data-et-new]');
        await page.waitForSelector('dialog.xl-dlg[open] .xl-p-body .xl-c');
        const typeRow = async cells => { for (let i = 0; i < cells.length; i++) { await page.keyboard.type(String(cells[i])); await page.keyboard.press(i < cells.length - 1 ? 'Tab' : 'Enter'); } };
        await typeRow(['Nom', 'Âge', 'Métier']); await typeRow(['MARTIN', 62, 'laboureur']); await typeRow(['DURAND', 45, 'tisserand']); await typeRow(['BERNARD', 71, 'laboureur']);
        const cellText = ref => page.evaluate(ref => { const E = window.LCNDA_EXT.tableurInternals.current; const p = window.LCNDA_SHEET.parseAddr(ref); return window.LCNDA_SHEET.formatValue(E.calc.val(E.si, p[0], p[1])); }, ref);
        eq([await cellText('A1'), await cellText('B2'), await cellText('C4'), await cellText('A5')], ['Nom', '62', 'laboureur', ''], 'saisie au clavier : Tab puis Entrée revient à la 1re colonne');
        // formule avec la liste des fonctions
        await page.keyboard.press('ArrowDown'); await page.keyboard.type('=MOY');
        await page.waitForSelector('[data-xl-ac]:not([hidden]) [data-fn="MOYENNE"]'); ok(true, 'la liste des fonctions s’ouvre');
        ok(/MOYENNE|MOYENNE.SI/.test(await page.textContent('[data-xl-ac]')), 'MOYENNE proposée');
        await page.keyboard.press('Tab'); await page.keyboard.type('B2:B4)'); await page.keyboard.press('Enter');
        eq(await cellText('A6'), '59,333333', 'formule calculée');
        await page.keyboard.type('=B2/C9'); await page.keyboard.press('Enter'); await page.keyboard.press('ArrowUp');
        ok(/C9 est vide ou vaut 0/.test(await page.textContent('[data-xl-help]')), 'erreur expliquée sous la barre de formule');
        ok(/Somme|A7/.test(await page.textContent('[data-xl-status]')), 'barre d’état');
        if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'a-editeur.png') });
        // ↶ ↷
        await page.keyboard.press('Delete'); eq(await cellText('A7'), '', 'effacé');
        await page.keyboard.press('Control+z'); eq(await cellText('A7'), '#DIV/0!', '↶'); await page.keyboard.press('Control+Shift+z'); eq(await cellText('A7'), '', '↷');
        // gras, tri
        await page.click('.xl-p-rowh .xl-hc >> text="1"'); await page.keyboard.press('Control+b');
        ok(await page.evaluate(() => { const E = window.LCNDA_EXT.tableurInternals.current; return !!E.wb.styles[E.wb.sheets[0].cells.A1.s]?.b; }), 'gras sur la ligne 1');
        await page.evaluate(() => { const E = window.LCNDA_EXT.tableurInternals.current; E.select(1, 1); E.run('sortza'); });
        eq([await cellText('A2'), await cellText('A4')], ['BERNARD', 'DURAND'], 'tri Z → A sur l’âge (titres gardés)');
        // filtre : la barre H10
        await page.evaluate(() => window.LCNDA_EXT.tableurInternals.current.run('filter'));
        await page.waitForSelector('[data-xl-filter]:not([hidden]) .ui-listbar');
        await page.fill('[data-xl-filter] input[type=search]', 'labour'); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
        { const ft = await page.textContent('[data-xl-filter]'); ok(/2 lignes sur 3/.test(ft), 'filtre : « 2 lignes sur 3 » : ' + ft); }
        await page.evaluate(() => window.LCNDA_EXT.tableurInternals.current.run('filter'));
        // feuilles : ajouter, renommer (la formule suit), supprimer puis ↶
        await page.click('[data-xl-sheet="add"]'); await page.keyboard.type("='Feuille 1'!B2+1"); await page.keyboard.press('Enter');
        eq(await cellText('A1'), '72', 'formule vers une autre feuille');
        await page.dblclick('[data-xl-sheet="0"]'); await page.waitForSelector('dialog[open] input'); await page.fill('dialog[open] input', 'Relevé 1836'); await page.keyboard.press('Enter');
        await page.waitForFunction(() => window.LCNDA_EXT.tableurInternals.current.wb.sheets[0].name === 'Relevé 1836');
        eq(await page.evaluate(() => window.LCNDA_EXT.tableurInternals.current.wb.sheets[1].cells.A1.v), "='Relevé 1836'!B2+1", 'renommer : la formule suit');
        await page.click('[data-xl-sheet="1"]', { button: 'right' }); await page.click('.ui-actmenu >> text=Supprimer la feuille');
        eq(await page.locator('[data-xl-sheet]').count(), 2, 'feuille supprimée'); await page.click('.toast >> text=Annuler'); await page.waitForTimeout(200);
        eq(await page.locator('[data-xl-sheet]').count(), 3, '↶ Annuler la remet');
        // enregistrer et rouvrir
        await page.fill('[data-xl-name]', 'Relevé de Saint-Martin'); await page.dispatchEvent('[data-xl-name]', 'change');
        await page.keyboard.press('Control+s'); await page.waitForSelector('dialog.xl-dlg [data-ui-status] .is-saved');
        const wid = await page.evaluate(() => window.LCNDA_EXT.tableurInternals.current.id); ok(wid > 0, 'enregistré en base');
        await page.click('dialog.xl-dlg .ui-topbar > [data-xl-cmd="close"]'); await page.waitForSelector('dialog.xl-dlg', { state: 'detached' });
        await page.waitForSelector(`.h-et-page >> text=Relevé de Saint-Martin`);
        await page.locator(`.h-et-page [data-et-open="${wid}"]:visible`).first().click(); await page.waitForSelector('dialog.xl-dlg[open] .xl-c');
        eq([await page.evaluate(() => window.LCNDA_EXT.tableurInternals.current.wb.sheets.map(s => s.name)), await cellText('A6')], [['Relevé 1836', 'Feuille 2'], '59,333333'], 'rouvert tel quel');
        // import CSV (fenêtre K13)
        const csvPath = path.join(dir, 'releve.csv'); fs.writeFileSync(csvPath, Buffer.from([...Buffer.from('Nom;Prénom;Âge\r\nMARTIN;Jean;62\r\n', 'latin1').map(b => b)]));
        fs.writeFileSync(csvPath, Buffer.concat([Buffer.from('Nom;Pr'), Buffer.from([0xe9]), Buffer.from('nom;'), Buffer.from([0xc2]), Buffer.from('ge\r\nMARTIN;Jean;62\r\nDURAND;Marie;"1 234,5"\r\n')]));
        await page.evaluate(() => window.LCNDA_EXT.tableurInternals.current.run('import'));
        await page.setInputFiles('dialog.k-import input[type=file]', csvPath);
        await page.waitForSelector('dialog.k-import [data-k-go]:not([disabled])');
        ok(/Windows/.test(await page.textContent('dialog.k-import')) && /Prénom/.test(await page.textContent('dialog.k-import')), 'import : encodage Windows deviné, accents corrects');
        await page.click('dialog.k-import [data-k-go]'); await page.waitForSelector('dialog.k-import', { state: 'detached' });
        eq([await page.evaluate(() => window.LCNDA_EXT.tableurInternals.current.S().name), await cellText('B1'), await cellText('C3')], ['releve', 'Prénom', '1234,5'], 'CSV importé dans une nouvelle feuille');
        // export XLSX : le fichier est relu par le moteur
        await page.evaluate(() => window.LCNDA_EXT.tableurInternals.current.run('export'));
        await page.waitForSelector('dialog.ui-export [data-fmt="xlsx"]'); await page.click('dialog.ui-export [data-fmt="xlsx"]');
        const [dl] = await Promise.all([page.waitForEvent('download'), page.click('dialog.ui-export [data-ui-go]')]);
        const buf = fs.readFileSync(await dl.path()), x = await S.fromXlsx(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
        eq(x.sheets.map(s => s.name), ['Relevé 1836', 'Feuille 2', 'releve'], 'XLSX exporté : les 3 feuilles');
        eq(x.sheets[0].cells.A6.v, '=MOYENNE(B2:B4)', 'XLSX : formule gardée');
        // 390 px puis sombre
        await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(300);
        const over = await page.evaluate(() => document.querySelector('dialog.xl-dlg').scrollWidth - document.querySelector('dialog.xl-dlg').clientWidth);
        ok(over <= 1, `390 px : pas de défilement de côté (${over})`);
        if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'a-390.png') });
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark')); await page.waitForTimeout(150);
        const bg = await page.evaluate(() => getComputedStyle(document.querySelector('.xl-p-body .xl-c')).backgroundColor);
        ok(!/255, 255, 255/.test(bg), `sombre : fond des cases ${bg}`);
        if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'a-sombre.png') });
        await page.evaluate(() => document.documentElement.removeAttribute('data-theme'));
        await page.evaluate(() => window.LCNDA_EXT.tableurInternals.current.dirty = false); await page.click('dialog.xl-dlg .ui-topbar > [data-xl-cmd="close"]');

        /* 3. 10 000 lignes × 30 colonnes */
        await page.evaluate(() => { const S2 = window.LCNDA_SHEET, w = S2.newWorkbook(), c = w.sheets[0].cells; for (let r = 0; r < 10000; r++) for (let k = 0; k < 30; k++) c[S2.addr(r, k)] = {v: k === 29 && r ? `=A${r + 1}+1` : r * 30 + k}; window.__big = w; });
        const open = await page.evaluate(async () => { const t = performance.now(); await window.LCNDA_EXT.openWorkbook({data: window.__big, name: 'Grand'}); return Math.round(performance.now() - t); });
        await page.waitForSelector('dialog.xl-dlg[open] .xl-c');
        const cells = await page.locator('dialog.xl-dlg .xl-c').count(); ok(cells < 4000, `peu de cases dans la page (${cells})`);
        const scroll = await page.evaluate(async () => { const vp = document.querySelector('[data-xl-vp]'), times = []; for (let i = 1; i <= 40; i++) { const t = performance.now(); vp.scrollTop = i * 5000; vp.dispatchEvent(new Event('scroll')); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); times.push(performance.now() - t); } vp.scrollTop = vp.scrollHeight; vp.dispatchEvent(new Event('scroll')); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); times.sort((a, b) => a - b); return {max: times[times.length - 1], med: times[times.length >> 1], last: window.LCNDA_EXT.tableurInternals.current.win.rB >= 9999}; });
        ok(open < 15000 && scroll.med < 250 && scroll.max < 2500, `10 000 lignes : ouvert en ${open} ms, défilement ${Math.round(scroll.med)} ms (médiane), ${Math.round(scroll.max)} ms au pire`); ok(scroll.last, 'on arrive jusqu’à la ligne 10000');
        await page.evaluate(() => { const E = window.LCNDA_EXT.tableurInternals.current; E.select(0, 0); E.ed; }); await page.keyboard.type('5'); const t1 = Date.now(); await page.keyboard.press('Enter'); const recalc = Date.now() - t1;
        eq(await page.evaluate(() => window.LCNDA_SHEET.formatValue(window.LCNDA_EXT.tableurInternals.current.calc.val(0, 1, 29))), '31', 'recalcul après saisie'); ok(recalc < 3000, `recalcul ${recalc} ms`);
        await page.evaluate(() => { window.LCNDA_EXT.tableurInternals.current.dirty = false; }); await page.click('dialog.xl-dlg .ui-topbar > [data-xl-cmd="close"]');
        eq(errors, [], 'aucune erreur dans la console');
    } finally {
        if (browser) await browser.close();
        proc.kill();
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
    }
    console.log(`✓ ${n} vérifications du tableur (API et navigateur)`);
})().catch(e => { console.error(e); process.exit(1); });
