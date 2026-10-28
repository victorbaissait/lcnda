'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * L1 — une seule fenêtre « Imprimer » (UI.openPrintDialog, app-actions.js) :   node tests/test-harmo-l1-imprimer.js
 *   statique : plus de nouvel onglet ni de window.print() dans les outils migrés ; l'API (zone, pages, printSheets, ⌘P) existe ;
 *   navigateur : la fenêtre s'ouvre depuis la présentation (⌘P), la mise en page (E3 → 🖨, pages choisies), le livret, la
 *   transcription ; zone bleue, Pages (Toutes / Celle affichée / Choisir), exemplaires, ‹ ›, choix retenus, sombre, 390 px.
 *   SHOTS=dossier : captures.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');
const appRoot = path.resolve(__dirname, '..');
const js = f => fs.readFileSync(path.join(appRoot, 'assets/js', f), 'utf8');
const shots = process.env.SHOTS || '';
let failed = 0, count = 0;
let cleanup = null; // après un échec : les fenêtres restées ouvertes sont fermées (le test suivant part de zéro)
const t = async (name, fn) => { try { await fn(); count++; console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); try { await cleanup?.(); } catch (_) {} } };

const MIGRATED = ['heritage-keynote.js', 'heritage-artist-catalogue.js', 'heritage-artist-list.js', 'heritage-diagrams.js', 'heritage-fiches.js', 'heritage-layout-livret.js',
    'heritage-slideshow.js', 'heritage-transcribe.js', 'heritage-vector.js', 'heritage-layout.js', 'heritage-book.js', 'heritage-photomaps.js'];
(async () => {
    await t('statique : plus de nouvel onglet ni de window.print() dans les outils traités', () => {
        for (const f of MIGRATED) {
            const src = js(f);
            const opens = [...src.matchAll(/window\.open\(([^)]*)\)/g)].map(m => m[1]).filter(a => /^\s*(''|""|'about:blank'|exportUrl)/.test(a) && !/lcnda-kn-presenter/.test(a)); // une page blanche ou un export à imprimer (la vue du présentateur et l'ouverture d'un média restent)
            assert.deepEqual(opens, [], `${f} : window.open`);
            assert.doesNotMatch(src, /\bw\.print\(\)|window\.print\(\)|onload=\(\)=>setTimeout\(\(\)=>print\(\)/, `${f} : impression à part`);
            assert.match(src, /openPrintDialog|printSheets|layoutBooklet\.sheets/, `${f} : la fenêtre commune`);
        }
        const a = js('app-actions.js');
        for (const k of ['UI.openPrintDialog = ', 'UI.printSheets = ', 'UI.parsePages = ', 'UI.printPaper = ', 'UI.onPrintKey = ', 'UI.printFromKey = ', 'UI.printDocument = ', 'data-k-pg="pick"', 'data-k-copies', 'data-k-step', 'k-print-zone'])
            assert.ok(a.includes(k), k);
        assert.match(a, /addEventListener\('keydown'[^\n]*printFromKey\(\)/, '⌘P passe d’abord par l’éditeur ouvert');
        for (const f of ['heritage-keynote.js', 'heritage-layout.js', 'heritage-slideshow.js', 'heritage-transcribe.js', 'heritage-vector.js']) assert.match(js(f), /onPrintKey/, `${f} : ⌘P`);
        assert.match(fs.readFileSync(path.join(appRoot, 'assets/css/app.css'), 'utf8'), /\.k-print-zone\{[^}]*#055dff/);
    });
    await t('statique : « 1-3, 7, 10-12 » est compris', () => {
        const ctx = { window: { LCNDA_UI: {} }, document: { addEventListener() {} }, location: { href: 'http://x/' } };
        const src = js('app-actions.js'), m = src.match(/UI\.parsePages = \(txt, n = 9999\) => \{[\s\S]*?\n    \};/);
        assert.ok(m); const UI = {}; new Function('UI', m[0])(UI); void ctx; // eslint-disable-line no-new-func
        assert.deepEqual(UI.parsePages('1-3, 7, 10-12', 20), [1, 2, 3, 7, 10, 11, 12]);
        assert.deepEqual(UI.parsePages('5', 3), null); assert.deepEqual(UI.parsePages('3-1', 9), [1, 2, 3]); assert.equal(UI.parsePages('a, 2', 9), null);
    });

    let pw = null; for (const m of ['playwright', '/opt/node22/lib/node_modules/playwright', '/opt/node-tools/node_modules/playwright']) { try { pw = require(m); break; } catch (_) {} }
    const phpPath = findPhp([devBundledPhp()]);
    if (!pw || !phpPath) { console.log('— navigateur : Playwright ou PHP absent, partie sautée'); return finish(); }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-l1-')); fs.mkdirSync(path.join(tmp, 'media'));
    const env = { ...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1' };
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`require 'lib/paths.php'; $p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null; require 'lib/bootstrap.php'; $pdo = db(); $pdo->exec("INSERT INTO persons(first_name,last_name,gender) VALUES('Jean','Martin','male')"); echo 'ok';`], { cwd: appRoot, encoding: 'utf8', env });
    if (r.status !== 0) throw new Error(r.stderr || r.stdout);
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const pp = s.address().port; s.close(() => res(pp)); }); });
    const srv = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env, stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
    const browser = await pw.chromium.launch(), errors = [];
    const D = 'dialog.k-print[open]';
    const prevDoc = p => p.evaluate(sel => document.querySelector(`${sel} .k-print-prev iframe`)?.srcdoc || '', D);
    const waitPrev = async (p, rx) => { for (let i = 0; i < 60; i++) { const d = await prevDoc(p); if (!rx || rx.test(d)) return d; await p.waitForTimeout(150); } return prevDoc(p); };
    try {
        const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } }), page = await ctx.newPage();
        page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(m.text()); });
        page.on('popup', () => errors.push('un onglet s’est ouvert'));
        await page.goto(base); await page.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_UI?.openPrintDialog && window.LCNDA_EXT?.openKeynote && window.LCNDA_EXT?.openLayoutDoc && window.LCNDA_EXT?.layoutBooklet);
        await page.waitForTimeout(400);
        cleanup = () => page.evaluate(() => document.querySelectorAll('dialog.k-print[open]').forEach(d => d.close()));

        await t('présentation : ⌘P ouvre la fenêtre, zone bleue, 1/2/4/6 par page, Pages, ‹ ›, Celle affichée', async () => {
            await page.evaluate(() => window.LCNDA_EXT.openKeynote({ preload: { id: 0, name: 'Les Peyre de Tulle', show: { slides: [1, 2, 3, 4, 5].map(n => ({ notes: 'Note ' + n, objs: [{ id: 'o' + n, t: 'text', x: 100, y: 100, w: 900, h: 200, html: `<p>DIAPO${n}</p>` }] })) } } }));
            await page.waitForSelector('dialog.kn-dlg[open]'); await page.waitForTimeout(500);
            await page.keyboard.press('Control+p'); await page.waitForSelector(D, { timeout: 8000 });
            assert.match(await page.textContent(`${D} .k-print-zone`), /Ce qu’on imprime · Présentation[\s\S]*Diapositives par page/);
            await waitPrev(page, /DIAPO5/);
            assert.match(await page.textContent(`${D} [data-k-pg="all"]`), /Toutes \(5\)/);
            await page.click(`${D} .k-print-tile:has(input[value="2"])`); await waitPrev(page);
            await page.waitForFunction(sel => /Toutes \(3\)/.test(document.querySelector(`${sel} [data-k-pg="all"]`).textContent), D);
            await page.waitForFunction(sel => /Page 1 sur 3/.test(document.querySelector(`${sel} [data-k-pgtxt]`).textContent), D);
            await page.click(`${D} [data-k-step="1"]`); assert.match(await page.textContent(`${D} [data-k-pgtxt]`), /Page 2 sur 3/);
            await page.click(`${D} input[data-k-opt="what"][value="notes-slides"]`); await waitPrev(page, /Note 1/);
            if (shots) await page.locator(D).screenshot({ path: path.join(shots, 'l1-presentation-1440.png') });
            await page.click(`${D} [data-k-pg="current"]`); const one = await waitPrev(page, /^(?![\s\S]*DIAPO3)/);
            assert.match(one, /DIAPO1/); assert.doesNotMatch(one, /DIAPO3/, 'seulement la page de la diapositive affichée');
            await page.$eval(`${D} .modal-actions [data-k-x]`, b => b.click()); await page.waitForSelector(D, { state: 'detached' });
            const prefs = await page.evaluate(() => JSON.parse(localStorage.getItem('genealogie-print-prefs') || '{}').presentation);
            assert.equal(prefs?.opts?.per, '2', 'choix retenus pour l’outil'); assert.equal(prefs?.opts?.what, 'notes-slides');
            await page.keyboard.press('Control+p'); await page.waitForSelector(D);
            assert.equal(await page.isChecked(`${D} input[data-k-opt="per"][value="2"]`), true, 'repris la fois suivante');
            await page.$eval(`${D} .modal-actions [data-k-x]`, b => b.click()); await page.waitForSelector(D, { state: 'detached' });
            await page.evaluate(() => document.querySelector('dialog.kn-dlg[open]')?.close());
        });

        const lid = await page.evaluate(async () => { const K = window.LCNDA_EXT.layoutKit, d = K.cleanDoc({ page: { w: 148, h: 210, bleed: 3 }, pages: [1, 2, 3, 4, 5, 6].map(n => ({ id: 'p' + n, master: '', items: [K.textItem({ id: 't' + n, html: `<p data-ps="ps-body">PAGE${n}</p>`, x: 20, y: 20, w: 100, h: 20 })] })) });
            return (await window.LCNDA_APP.api('save_layout_doc', {}, { method: 'POST', body: { name: 'Mon livre', is_design: 0, doc: d } })).result.id; });
        await t('mise en page : ⤓ Exporter → 🖨 Imprimer ouvre la même fenêtre, réglée ; pages simples / planches / livret, fond perdu, Choisir « 2-3 », exemplaires', async () => {
            await page.evaluate(id => window.LCNDA_EXT.openLayoutDoc(id, () => {}), lid); await page.waitForSelector('dialog.ly-editor'); await page.waitForTimeout(600);
            await page.evaluate(() => document.querySelector('dialog.ly-editor [data-ly-cmd="export"]').click()); await page.waitForSelector('dialog.ui-export[open] [data-fmt="print"]');
            await page.click('dialog.ui-export[open] [data-fmt="print"]'); await page.click('dialog.ui-export[open] [data-ui-go]');
            await page.waitForSelector(D); await page.waitForSelector('dialog.ui-export:not(.k-print)', { state: 'detached' });
            assert.equal(await page.isChecked(`${D} input[data-k-opt="mode"][value="pages"]`), true);
            assert.equal(await page.isDisabled(`${D} [data-k-paper="A4"]`), true, 'le format vient du document');
            let doc = await waitPrev(page, /PAGE6/); assert.equal((doc.match(/data-k-page/g) || []).length, 6);
            await page.click(`${D} [data-k-q="bleedOn"] input`); await page.waitForSelector(`${D} [data-k-q="bleedMm"]:not([hidden])`);
            await page.check(`${D} [data-k-q="marks"] input`); doc = await waitPrev(page, /ly-marks/); assert.match(doc, /ly-bleedclip/);
            await page.click(`${D} [data-k-pg="pick"]`); await page.fill(`${D} [data-k-pick]`, '2-3'); await page.fill(`${D} [data-k-copies]`, '2');
            doc = await waitPrev(page, /^(?![\s\S]*PAGE1<)[\s\S]*PAGE2/); assert.equal((doc.match(/PAGE2</g) || []).length, 2, 'deux exemplaires'); assert.doesNotMatch(doc, /PAGE4</);
            await page.waitForFunction(sel => /Page 1 sur 4/.test(document.querySelector(`${sel} [data-k-pgtxt]`).textContent), D);
            await page.fill(`${D} [data-k-pick]`, 'zz'); await page.click(`${D} [data-k-go]`);
            assert.ok(await page.$(`${D} .is-invalid, ${D} [aria-invalid="true"], ${D} .ui-field-error, ${D} .field-error`), 'erreur sous la case (K1)');
            await page.click(`${D} input[data-k-opt="mode"][value="spreads"]`); doc = await waitPrev(page, /ly-sp/); assert.match(doc, /@page k-sz0\{size:296mm 210mm/);
            if (shots) await page.locator(D).screenshot({ path: path.join(shots, 'l1-mise-en-page-1440.png') });
            await page.click(`${D} input[data-k-opt="mode"][value="booklet"]`); doc = await waitPrev(page, /lb-side/);
            await page.$eval(`${D} .modal-actions [data-k-x]`, b => b.click()); await page.waitForSelector(D, { state: 'detached' });
            await page.keyboard.press('Control+p'); await page.waitForSelector(D); assert.ok(await page.$(`${D} input[data-k-opt="mode"]`), '⌘P dans la mise en page');
            await page.$eval(`${D} .modal-actions [data-k-x]`, b => b.click()); await page.waitForSelector(D, { state: 'detached' });
        });

        await t('sombre et 390 px : la fenêtre tient dans l’écran, zone lisible', async () => {
            await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
            await page.setViewportSize({ width: 390, height: 844 });
            await page.keyboard.press('Control+p'); await page.waitForSelector(D); await waitPrev(page, /PAGE1/); await page.waitForTimeout(300);
            const m = await page.evaluate(sel => { const d = document.querySelector(sel), z = d.querySelector('.k-print-zone'); return { w: d.getBoundingClientRect().width, sw: document.documentElement.scrollWidth, bg: getComputedStyle(z).backgroundColor }; }, D);
            assert.ok(m.w <= 390 && m.sw <= 391, `largeur ${m.w} / ${m.sw}`); assert.notEqual(m.bg, 'rgb(245, 248, 255)', 'fond sombre');
            if (shots) await page.screenshot({ path: path.join(shots, 'l1-mise-en-page-390-sombre.png'), fullPage: false });
            await page.$eval(`${D} .modal-actions [data-k-x]`, b => b.click()); await page.waitForSelector(D, { state: 'detached' });
            await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; document.querySelector('dialog.ly-editor[open]')?.close(); });
            await page.setViewportSize({ width: 1440, height: 950 });
        });

        await t('transcription : image et texte, personnes et rôles (⌘P)', async () => {
            await page.evaluate(() => window.LCNDA_EXT.openActTranscriber({ title: 'Acte de naissance', text: 'L’an mil huit cent soixante-douze' }));
            await page.waitForSelector('dialog.h-tx-dlg[open]'); await page.waitForTimeout(900);
            await page.evaluate(() => document.querySelectorAll('dialog.mpk-dialog[open]').forEach(d => d.close())); await page.waitForTimeout(200); // sans image : la fenêtre des images s'ouvre d'abord
            await page.fill('dialog.h-tx-dlg [data-tx-body]', 'L’an mil huit cent soixante-douze');
            await page.keyboard.press('Control+p'); await page.waitForSelector(D);
            assert.match(await page.textContent(`${D} .k-print-zone`), /Image \+ texte côte à côte[\s\S]*Texte seul[\s\S]*Personnes et rôles/);
            await page.click(`${D} input[data-k-opt="lay"][value="text"]`); const doc = await waitPrev(page, /class="g text"/); assert.match(doc, /soixante-douze/);
            await page.$eval(`${D} .modal-actions [data-k-x]`, b => b.click()); await page.waitForSelector(D, { state: 'detached' });
            await page.evaluate(() => document.querySelector('dialog.h-tx-dlg[open]')?.close());
        });

        await t('appel d’avant (sans options) : même fenêtre, Photos d’office, pas de Pages', async () => {
            await page.evaluate(() => { window.LCNDA_UI.openPrintDialog({ title: 'Bordereau', html: '<p>Bonjour</p>' }); });
            await page.waitForSelector(D); await waitPrev(page, /Bonjour/);
            assert.equal(await page.isHidden(`${D} [data-k-pages]`), true); assert.ok(await page.$(`${D} [data-k-photos]`));
            assert.match(await prevDoc(page), /@page\{size:A4 portrait\}/);
            await page.$eval(`${D} .modal-actions [data-k-x]`, b => b.click());
        });
        await t('aucune erreur dans la page, aucun onglet ouvert', () => assert.deepEqual(errors, []));
    } finally { await browser.close(); srv.kill(); try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {} }
    finish();
})();
function finish() { console.log(`${failed ? '✗' : '✓'} L1 imprimer : ${count} vérifications${failed ? `, ${failed} en échec` : ''}`); process.exit(failed ? 1 : 0); }
