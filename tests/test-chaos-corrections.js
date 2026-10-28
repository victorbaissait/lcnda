'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * Corrections après le test « utilisateur qui fait n'importe quoi » :   node tests/test-chaos-corrections.js
 *   1. deux ⌘S rapides sur un document neuf : un seul document (Tableur, Traitement de texte, Dessin, Transcription, Maison,
 *      Présentation, Diaporama, Mise en page, Site web) ;
 *   2. fenêtre « Imprimer » L1 : Pages et Exemplaires aussi pour un document sans [data-k-page] (pages mesurées), « 1-3, 7 »
 *      sur 2 pages dit que la page 7 n'existe pas (K1), 999 exemplaires → 50 et c'est dit ; 7 familles tient sur l'A4 ;
 *   3. Trésors Recettes / Chansons vides : « 🖨 Imprimer » grisé ;
 *   4. Tableur : taille de police hors limites → erreur K1 sous la case, valeur d'avant gardée, aucun message en bas ;
 *   5. #catalogue/99999 → 422 « Artiste introuvable » (K10) ; #documents/99999 → ligne « Document introuvable » ;
 *   7. consultation 🔒 : pas de rappel « Pense à une copie » ;
 *   8. UI.readDuration borné (10 000 h), UI.readDate refuse un nombre trop long.
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
const php = f => fs.readFileSync(path.join(appRoot, f), 'utf8');
let failed = 0, count = 0;
const t = async (name, fn) => { try { await fn(); count++; console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
const finish = () => { console.log(`\n${count} réussi(s), ${failed} échec(s)`); process.exit(failed ? 1 : 0); };

(async () => {
    await t('statique : un seul enregistrement en cours par éditeur (le second ⌘S attend le premier)', () => {
        for (const f of ['heritage-tableur.js', 'heritage-traitement-texte-fichiers.js', 'heritage-site-web.js']) {
            const s = js(f); assert.match(s, /if \(this\._saving\) return this\._saving;/, f); assert.match(s, /async _saveNow\(/, f);
            assert.doesNotMatch(s, /return this\.save\(\{[^}]*force: true\}\)/, `${f} : « Enregistrer quand même » ne repasse pas par la file`);
        }
        for (const f of ['heritage-vector.js', 'heritage-transcribe.js', 'heritage-house.js', 'heritage-keynote.js', 'heritage-slideshow.js', 'heritage-layout.js'])
            assert.match(js(f), /if \((saving|savingP)\) return (saving|savingP);|if \(saving\) \{ const p = saving;/, f);
    });
    await t('statique : Imprimer (pages mesurées, page qui n’existe pas, 50 exemplaires), 7 familles, livre grisé', () => {
        const a = js('app-actions.js');
        for (const k of ['nPages = () =>', 'function sliceFlow(', 'const measureFlow = ', 'const pickProblem = ', 'MAXCOPIES = 50', 'n’existe pas'] ) assert.ok(a.includes(k), k);
        const j = js('heritage-tresors-jeux.js');
        assert.doesNotMatch(j, /\.sheet\{[^}]*width:210mm/, 'planche plus large que la feuille'); assert.match(j, /\{margin: 5\}/); assert.match(j, /class="sheet" data-k-page/);
        assert.match(js('heritage-tresors-memoire.js'), /bk\.disabled = !all\.length/);
    });
    await t('statique : Tableur K1, introuvables en 422, consultation sans rappel de copie', () => {
        assert.match(js('heritage-tableur.js'), /UI\(\)\.fieldError\(fsIn, `Une taille entre 6 et 72 px/);
        assert.match(php('lib/art_engine.php'), /throw new LcndaBadInput\('Artiste introuvable/);
        assert.match(php('lib/onglets.php'), /throw new LcndaBadInput\('Document introuvable/);
        assert.match(js('heritage-onglets-catalogue.js'), /text: 'Artiste introuvable'/);
        assert.match(js('heritage-onglets-documents.js'), /Document introuvable/);
        assert.match(js('heritage.js'), /is-kiosk[^\n]*pas de rappel de copie/);
        assert.match(js('app-saisies.js'), /MAX_DURATION_S = 10000 \* 3600/);
        assert.match(js('app-ui.js'), /\\d\{9,\}/);
    });

    let pw = null; for (const m of ['playwright', '/opt/node22/lib/node_modules/playwright', '/opt/node-tools/node_modules/playwright']) { try { pw = require(m); break; } catch (_) {} }
    const phpPath = findPhp([devBundledPhp()]);
    if (!pw || !phpPath) { console.log('— navigateur : Playwright ou PHP absent, partie sautée'); return finish(); }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-chaos-')); fs.mkdirSync(path.join(tmp, 'media'));
    const env = { ...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1' };
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`require 'lib/paths.php'; $p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null; require 'lib/bootstrap.php'; $pdo = db(); $pdo->exec("INSERT INTO persons(first_name,last_name,gender) VALUES('Jean','Martin','male')"); echo 'ok';`], { cwd: appRoot, encoding: 'utf8', env });
    if (r.status !== 0) throw new Error(r.stderr || r.stdout);
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const pp = s.address().port; s.close(() => res(pp)); }); });
    const srv = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env, stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
    const browser = await pw.chromium.launch(), errors = [];
    try {
        const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } }), page = await ctx.newPage();
        page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(m.text()); });
        await page.addInitScript(() => { try { localStorage.setItem('genealogie-menu-tresors', '1'); } catch (_) {} });
        const posts = {}; page.on('request', q => { const m = q.url().match(/action=(save_[a-z_]+)/); if (m && q.method() === 'POST') posts[m[1]] = (posts[m[1]] || 0) + 1; });
        await page.goto(base); await page.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_UI?.openPrintDialog && window.LCNDA_EXT?.openWorkbook && window.LCNDA_EXT?.openTextDoc);
        await page.waitForTimeout(500);
        const closeAll = () => page.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => { d.close(); d.remove(); }));

        await t('1. deux ⌘S rapides sur un document neuf : un seul envoi, un seul document', async () => {
            const tools = [['save_workbook', 'workbooks', () => window.LCNDA_EXT.openWorkbook({})], ['save_textdoc', 'textdocs', () => window.LCNDA_EXT.openTextDoc({})],
                ['save_vector_doc', 'vector_docs', () => window.LCNDA_EXT.openVectorEditor({})], ['save_house', 'houses', () => window.LCNDA_EXT.openHouse({})],
                ['save_act_transcription', 'act_transcriptions', () => window.LCNDA_EXT.openActTranscriber({title: 'Acte'})]];
            for (const [act, list, open] of tools) {
                await page.evaluate(open); await page.waitForTimeout(2200);
                await page.evaluate(() => document.querySelectorAll('dialog.mpk-dialog[open]').forEach(d => d.close())); // la transcription sans image ouvre d'abord la fenêtre des images
                delete posts[act];
                await page.route(new RegExp(`action=${act}\\b`), async q => { await new Promise(res => setTimeout(res, 700)); q.continue(); }); // le serveur lent : le second ⌘S arrive pendant le premier
                await page.keyboard.press('Control+s'); await page.keyboard.press('Control+s');
                await page.waitForTimeout(2200);
                await page.unroute(new RegExp(`action=${act}\\b`));
                assert.equal(posts[act], 1, `${act} : ${posts[act]} envois`);
                const n = await page.evaluate(async l => { const j = await window.LCNDA_APP.api(l); return (j.items || j.docs || []).length; }, list);
                assert.equal(n, 1, `${list} : ${n} documents`);
                await closeAll(); await page.waitForTimeout(200);
            }
        });

        await t('2. Imprimer un texte sans pages marquées : Pages, Exemplaires, page qui n’existe pas, 50 au plus', async () => {
            const D = 'dialog.k-print[open]';
            await page.evaluate(() => { const p = Array.from({length: 120}, (_, i) => `<p>Paragraphe ${i + 1} — un peu de texte pour remplir la page.</p>`).join(''); window.LCNDA_UI.openPrintDialog({title: 'Long texte', html: `<!doctype html><html><head><title>x</title></head><body>${p}</body></html>`}); });
            await page.waitForSelector(D); await page.waitForFunction(sel => !document.querySelector(`${sel} [data-k-pages]`).hidden, D, {timeout: 8000});
            const all = await page.textContent(`${D} [data-k-pg="all"]`), n = Number(all.match(/\((\d+)\)/)?.[1]);
            assert.ok(n >= 2, all); assert.equal(await page.isHidden(`${D} [data-k-copiesrow]`), false);
            assert.match(await page.textContent(`${D} [data-k-pgtxt]`), new RegExp(`sur ${n}`));
            await page.click(`${D} [data-k-pg="pick"]`); await page.fill(`${D} [data-k-pick]`, `1, ${n + 5}`);
            await page.waitForFunction(sel => /n’existe pas/.test(document.querySelector(`${sel}`).textContent), D);
            await page.click(`${D} [data-k-go]`); assert.ok(await page.$(D), 'la fenêtre reste ouverte');
            await page.fill(`${D} [data-k-pick]`, '2'); await page.waitForFunction(sel => (document.querySelector(`${sel} .k-print-prev iframe`)?.srcdoc.match(/class="k-slice"/g) || []).length === 1, D);
            assert.equal(await page.$(`${D} .ui-field-error`), null, 'l’erreur s’efface');
            await page.click(`${D} [data-k-pg="all"]`);
            await page.fill(`${D} [data-k-copies]`, '999'); await page.locator(`${D} [data-k-copies]`).blur(); await page.waitForTimeout(300);
            assert.equal(await page.inputValue(`${D} [data-k-copies]`), '50'); assert.match(await page.textContent(D), /50 exemplaires au plus/);
            await closeAll();
        });

        await t('4. Tableur : taille −5 / 0 / 99999 → erreur sous la case, taille d’avant gardée, aucun message en bas', async () => {
            await page.evaluate(() => window.LCNDA_EXT.openWorkbook({})); await page.waitForSelector('[data-xl-fs]'); await page.waitForTimeout(800);
            const fsSel = '[data-xl-fs]';
            await page.fill(fsSel, '20'); await page.press(fsSel, 'Enter'); await page.waitForTimeout(200);
            const toasts0 = await page.evaluate(() => document.querySelectorAll('.toast.error, .toast.is-error, [class*="toast"][class*="error"]').length);
            for (const v of ['-5', '0', '99999']) {
                await page.fill(fsSel, v); await page.press(fsSel, 'Enter'); await page.waitForTimeout(250);
                assert.equal(await page.inputValue(fsSel), '20', `${v} : valeur d’avant`);
                assert.match(await page.evaluate(() => document.querySelector('.ui-field-error')?.textContent || ''), /entre 6 et 72/);
            }
            assert.equal(await page.evaluate(() => document.querySelectorAll('.toast.error, .toast.is-error, [class*="toast"][class*="error"]').length), toasts0, 'pas de message rouge en bas');
            await page.fill(fsSel, '14'); await page.press(fsSel, 'Enter'); await page.waitForTimeout(200);
            assert.equal(await page.$('.ui-field-error'), null);
            await closeAll();
        });

        await t('5. introuvables : art boot 99999 et document 99999 → 422 avec une phrase ; écrans K10', async () => {
            const res = await page.evaluate(async () => Promise.all(['api.php?action=art&op=boot&person_id=99999', 'api.php?action=onglets&op=document&id=99999'].map(async u => { const r = await fetch(u); return [r.status, (await r.json()).error]; })));
            assert.equal(res[0][0], 422); assert.match(res[0][1], /Artiste introuvable/);
            assert.equal(res[1][0], 422); assert.match(res[1][1], /Document introuvable/);
            await page.goto(base + '#catalogue/99999'); await page.waitForFunction(() => /Artiste introuvable/.test(document.getElementById('workspace')?.textContent || ''), null, {timeout: 10000});
            await page.goto(base + '#documents/99999'); await page.waitForFunction(() => /Document introuvable/.test(document.getElementById('workspace')?.textContent || ''), null, {timeout: 10000});
        });

        await t('3. Trésors Recettes et Chansons vides : « 🖨 Imprimer » grisé', async () => {
            await page.goto(base + '#tresors'); await page.waitForFunction(() => window.LCNDA_EXT?.tresors?.open); await page.waitForTimeout(600);
            for (const k of ['recettes', 'chansons']) {
                await page.evaluate(key => window.LCNDA_EXT.tresors.open(key), k);
                await page.waitForFunction(() => document.querySelector('.page-header [data-c-book]')?.disabled === true, null, {timeout: 8000});
                await page.waitForTimeout(400); // la transition de .button
                const st = await page.evaluate(() => { const b = document.querySelector('.page-header [data-c-book]'); return {op: getComputedStyle(b).opacity, cur: getComputedStyle(b).cursor}; });
                assert.equal(st.op, '0.45'); assert.equal(st.cur, 'not-allowed');
            }
        });

        await t('8. UI.readDuration borné, UI.readDate refuse un nombre trop long', async () => {
            const r = await page.evaluate(() => { const UI = window.LCNDA_UI; return [UI.readDuration('10000000000000000000000 s'), UI.readDuration('10001 h'), UI.readDuration('2 h 15'), UI.readDate('12345678901234567890'), UI.readDate('7 mai 1925')]; });
            assert.equal(r[0].ok, false); assert.match(r[0].text, /trop longue/); assert.equal(r[1].ok, false); assert.equal(r[2].ok, true);
            assert.equal(r[3].ok, false); assert.match(r[3].text, /trop long/); assert.equal(r[4].ok, true);
        });
        await t('aucune erreur de page', () => { assert.deepEqual(errors, []); });
    } finally { await browser.close(); srv.kill(); fs.rmSync(tmp, { recursive: true, force: true }); }
    finish();
})().catch(e => { console.error(e); process.exit(1); });
