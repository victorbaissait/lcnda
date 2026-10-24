'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 📝 Traitement de texte — 🔁 synonymes, 🔎 relecture (typographie, répétitions), ♿ accessibilité.
 *   node tests/test-traitement-texte-relecture.js
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
const P = require('../assets/js/heritage-traitement-texte-relecture.js');
(async () => {
    await t('relecture : espaces, guillemets « », points de suspension, mot répété, espaces fines, majuscule', () => {
        assert.equal(P.fixAll('Il  dit "bonjour"...le le chat! il part: oui ,non,l\'ami.'), 'Il dit «\u00a0bonjour\u00a0»…le chat\u202f! Il part\u00a0: oui, non, l’ami.');
        assert.deepEqual(P.issues('Il  dit').map(x => x.msg), ['Espaces en trop']);
    });
    await t('relecture : les nombres, heures et adresses ne bougent pas', () => {
        assert.equal(P.fixAll('Le 3.5 kg, www.site.fr et 12:30.'), 'Le 3.5 kg, www.site.fr et 12:30.');
        assert.deepEqual(P.issues('Tout va bien.'), []);
    });
    await t('synonymes : sans internet, sans le mot lui-même', () => {
        const s = P.synonyms('mourir'); assert.ok(s.includes('décéder') && !s.includes('mourir')); assert.deepEqual(P.synonyms('xyzw'), []);
    });
    let chromium = null; try { ({chromium} = require('playwright')); } catch (_) {}
    let phpPath = null; try { const {findPhp, devBundledPhp} = require('../electron/php-server'); phpPath = findPhp([devBundledPhp()]); } catch (_) {}
    if (!chromium || !phpPath) { console.log('— navigateur : Playwright ou PHP absent, partie sautée'); return finish(); }
    const {phpRuntimeArgs} = require('../electron/php-server');
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const pp = s.address().port; s.close(() => res(pp)); }); });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-relecture-')); fs.mkdirSync(path.join(dir, 'media'));
    const env = {...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media'), GENEALOGY_SKIP_REFERENCE: '1'};
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`require 'lib/paths.php'; $p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p->exec("INSERT INTO persons(first_name,last_name,gender,living_status) VALUES('Louise','BORIE','female','deceased')"); $p = null; require 'lib/bootstrap.php'; db(); echo 'ok';`], {cwd: root, encoding: 'utf8', env});
    if (r.status !== 0) throw new Error(r.stderr || r.stdout);
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
    const browser = await chromium.launch(); const page = await browser.newPage({viewport: {width: 1400, height: 900}});
    const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => d.accept());
    const cmd = c => page.evaluate(c => document.querySelector(`dialog.wp-dlg [data-wp-cmd="${c}"]`).click(), c);
    const body = () => page.evaluate(() => document.querySelector('dialog.wp-dlg .wp-body').innerHTML);
    const other = 'dialog[open]:not(.wp-dlg)';
    try {
        await page.goto(base); await page.waitForFunction(() => window.LCNDA_EXT?.editToolsExtra?.find(x => x.key === 'textdoc') && window.LCNDA_APP?.state?.bootstrap);
        await page.evaluate(() => window.LCNDA_EXT.editToolsExtra.find(x => x.key === 'textdoc').create(() => {})); await page.waitForSelector('dialog.wp-dlg[open] .wp-body'); await page.waitForTimeout(500);
        await t('les trois lignes sont dans le menu Outils', async () => {
            const labels = await page.$$eval('dialog.wp-dlg [data-wp-menu="Outils"] [data-wp-cmd]', l => l.map(b => b.dataset.wpCmd)); ['synonyms', 'proof', 'a11y'].forEach(c => assert.ok(labels.includes(c), c));
        });
        await t('🔁 synonymes : le mot sous le curseur est remplacé, la majuscule gardée', async () => {
            await page.click('dialog.wp-dlg .wp-body'); await page.keyboard.type('Mourir jeune.'); await page.keyboard.press('Home'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
            await cmd('synonyms'); await page.waitForSelector(`${other} [data-syn="décéder"]`); await page.click(`${other} [data-syn="décéder"]`); await page.waitForTimeout(300);
            assert.match(await body(), /Décéder jeune\./);
        });
        await t('🔎 relecture : liste des points, « Corriger » un seul puis « Tout corriger »', async () => {
            await page.evaluate(() => { const b = document.querySelector('dialog.wp-dlg .wp-body'); b.innerHTML = '<p>Il  dit "oui"...le le chat!</p>'; });
            await cmd('proof'); await page.waitForSelector(`${other} .wp-proof li`);
            assert.equal(await page.$$eval(`${other} .wp-proof li`, l => l.length), 5);
            await page.click(`${other} [data-pf-fix="0"]`); await page.waitForTimeout(200); assert.match(await body(), /Il dit "oui"/);
            await page.click(`${other} button[type="submit"]`); await page.waitForTimeout(300);
            assert.match(await body(), /Il dit «&nbsp;oui&nbsp;»…le chat\u202f!/);
        });
        await t('♿ accessibilité : image sans description (＋ Description… l’ajoute), niveau de titre sauté, tableau, lien « ici »', async () => {
            await page.evaluate(() => { const b = document.querySelector('dialog.wp-dlg .wp-body'); b.innerHTML = '<h1>Récit</h1><h3>Enfance</h3><p><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw="> <a href="https://x.fr">ici</a></p><table><tr><td>a</td></tr></table>'; });
            await cmd('a11y'); await page.waitForSelector(`${other} .wp-proof li`);
            assert.equal(await page.$$eval(`${other} .wp-proof li`, l => l.length), 4);
            await page.click(`${other} [data-ax-alt]`); await page.waitForSelector('.ask-text-dialog input, .ask-text-dialog textarea');
            await page.fill('.ask-text-dialog input, .ask-text-dialog textarea', 'Mariage devant l’église'); await page.click('.ask-text-dialog button[type="submit"]'); await page.waitForTimeout(300);
            assert.match(await body(), /alt="Mariage devant l’église"/);
        });
        await t('aucune erreur JavaScript', () => assert.deepEqual(errs, []));
    } finally { await browser.close(); proc.kill(); try { fs.rmSync(dir, {recursive: true, force: true}); } catch (_) {} }
    finish();
})();
function finish() { console.log(`${failed ? '✗' : '✓'} traitement de texte, relecture : ${count} vérifications${failed ? `, ${failed} en échec` : ''}`); process.exit(failed ? 1 : 0); }
