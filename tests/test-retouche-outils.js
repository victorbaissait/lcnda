'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * Test des outils de la Retouche (assets/js/heritage-studio.js, heritage-retouch-simple.js) :   node tests/test-retouche-outils.js
 * Les défauts trouvés en essayant chaque outil comme un vrai utilisateur, corrigés et vérifiés ici :
 *   ➤ après un correcteur de taches (calque « ✨ Retouches » sur toute l'image), le clic prend le texte en dessous ;
 *   ▦ la couleur d'un arrêt du dégradé s'ouvre (fenêtre C2) et se change ;
 *   🔤 une taille de texte énorme est ramenée à la borne de la case (4 000) ;
 *   🖌 après un correcteur, le pinceau va sur un calque « Annotations » (plus sur ✨ Retouches) et un 2e correcteur ne l'efface plus ;
 *   💾 « sans les annotations » : la photo enregistrée garde les taches enlevées ;
 *   ⌫ avec une sélection sur un calque de dessin : effacé de ce calque, pas de la photo ;
 *   ✨ « ＋ Ajouter un filtre » puis « Annuler » : le filtre ne reste pas ;
 *   🧩 « Pixelliser » sans question, avec « ↶ Annuler » (H7) ;
 *   ⚡ retouche rapide : « Retoucher celle-ci » demande avant de perdre le travail ;
 *   ⬜ canevas vide enregistré : « Image enregistrée dans les Médias ».
 * Navigateur nécessaire (Playwright) ; sans lui, le test le dit et s'arrête.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const phpPath = findPhp([devBundledPhp()]);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-retouche-outils-'));
const media = path.join(tmp, 'media');
fs.mkdirSync(media, { recursive: true });
const envFor = d => ({ ...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1' });
const done = code => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {} process.exit(code); };

// une photo grise avec une poussière blanche connue (en 150 × 100), un portrait, un paysage
const py = spawnSync('python3', ['-c', String.raw`
import sys
from PIL import Image, ImageDraw
out = sys.argv[1]
im = Image.new('RGB', (600, 400), (120, 120, 120)); d = ImageDraw.Draw(im); d.ellipse((146, 96, 154, 104), fill=(255, 255, 255)); im.save(out + '/poussiere.png')
im = Image.new('RGB', (600, 800), (90, 130, 180)); d = ImageDraw.Draw(im); d.ellipse((200, 150, 400, 400), fill=(230, 190, 160)); d.rectangle((150, 420, 450, 800), fill=(150, 30, 40)); im.save(out + '/portrait.jpg', quality=92)
im = Image.new('RGB', (800, 500), (60, 120, 200)); d = ImageDraw.Draw(im); d.polygon([(0, 300), (400, 200), (800, 320), (800, 500), (0, 500)], fill=(50, 110, 40)); im.save(out + '/paysage.png')
print('ok')
`, media], { encoding: 'utf8' });
if (py.status !== 0 || !/ok/.test(py.stdout)) { console.error('Images de test impossibles (python3 + PIL) :', py.stderr || py.stdout); done(1); }
{
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(first_name,last_name,gender) VALUES('Louise','Martin','female')");
$ins = $pdo->prepare("INSERT INTO media(title,media_type,filename,thumbnail) VALUES(?, 'image', ?, ?)");
foreach ([['Poussière', 'poussiere.png'], ['Portrait', 'portrait.jpg'], ['Paysage', 'paysage.png']] as [$t, $f]) $ins->execute([$t, $f, $f]);
$pdo->exec("INSERT INTO media_links(media_id,entity_type,entity_id,position) VALUES(1,'person',1,1),(2,'person',1,2)");
echo 'ok';`], { cwd: appRoot, encoding: 'utf8', env: envFor(tmp) });
    if (r.status !== 0 || !/ok$/.test(r.stdout)) { console.error(r.stderr || r.stdout); done(1); }
}

const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
function loadPlaywright() {
    for (const p of ['playwright', '/opt/node-tools/node_modules/playwright', '/opt/node22/lib/node_modules/playwright']) { try { return require(p); } catch (_) {} }
    return null;
}
async function launch(pw) {
    const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(f => fs.existsSync(f));
    try { return await pw.chromium.launch(exe ? { executablePath: exe } : {}); } catch (_) { return pw.chromium.launch(); }
}

(async () => {
    const pw = loadPlaywright();
    if (!pw) { console.log('  – navigateur : sauté (Playwright absent)'); console.log('0 vérification (Playwright absent)'); done(0); }
    const port = await freePort();
    const srv = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env: envFor(tmp), stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
    const browser = await launch(pw);
    const out = {}, errors = [];
    const D = 'dialog.h-retouch';
    try {
        const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
        await ctx.addInitScript(() => { try { localStorage.setItem('genealogie-retouch-mode', 'advanced'); } catch (_) {} });
        const page = await ctx.newPage();
        page.setDefaultTimeout(15000);
        page.on('pageerror', e => errors.push(String(e.message)));
        page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(m.text()); });
        page.on('dialog', d => { errors.push('dialogue natif : ' + d.message()); d.dismiss(); });
        await page.goto(base);
        await page.waitForFunction(() => window.LCNDA_EXT?.openRetouch && window.LCNDA_EXT?.openRetouchSimple && window.LCNDA_APP?.api && window.LCNDA_PICKER?.openMediaPicker, null, { timeout: 30000 });

        const openRt = async (id, filename, title, simple = false) => {
            await page.evaluate(() => document.querySelectorAll('dialog.h-retouch, dialog.h-retouch-simple').forEach(d => d.close()));
            await page.evaluate(([id, filename, title, simple]) => { const S = window.LCNDA_APP.state; S.lightboxMedia = [{id, filename, title, media_type: 'image'}]; S.lightboxIndex = 0; if (simple) window.LCNDA_EXT.openRetouchSimple(); else window.LCNDA_EXT.openRetouch('', null, {advanced: true}); }, [id, filename, title, simple]);
            await page.waitForSelector(simple ? 'dialog.h-retouch-simple [data-rs-canvas]' : `${D} [data-rt-canvas]`);
            await page.waitForTimeout(500);
        };
        const at = async (fx, fy) => { const r = await page.$eval(`${D} [data-rt-canvas]`, c => { const b = c.getBoundingClientRect(); return [b.x, b.y, b.width, b.height]; }); return [r[0] + fx * r[2], r[1] + fy * r[3]]; };
        const click = async (fx, fy) => { const [x, y] = await at(fx, fy); await page.mouse.click(x, y); await page.waitForTimeout(150); };
        const drag = async (a, b) => { const [x0, y0] = await at(...a), [x1, y1] = await at(...b); await page.mouse.move(x0, y0); await page.mouse.down(); await page.mouse.move(x1, y1, { steps: 10 }); await page.mouse.up(); await page.waitForTimeout(200); };
        const mode = k => page.click(`${D} .h-rt-vtools [data-rt-mode="${k}"]`);
        const px = (x, y) => page.evaluate(([x, y]) => { const c = document.querySelector('dialog.h-retouch [data-rt-canvas]'); return Array.from(c.getContext('2d').getImageData(Math.round(x * (c.width - 1)), Math.round(y * (c.height - 1)), 1, 1).data); }, [x, y]);
        const hist = () => page.$$eval(`${D} .h-rt-history li span`, l => l.map(s => s.textContent));
        const last = async () => (await hist()).slice(-1)[0];
        const layerNames = () => page.$$eval(`${D} [data-rt-pane="layers"] .h-rt-node [data-rt-lname]`, l => l.map(i => i.value));
        const undoToast = () => page.locator('button', { hasText: 'Annuler' }).filter({ hasText: '↶' }).last();

        // ── 1. ➤ après un correcteur de taches, le clic prend le texte (le calque ✨ Retouches est transparent ailleurs) ──
        await openRt(1, 'poussiere.png', 'Poussière');
        await mode('heal'); await click(0.25, 0.25); await page.waitForTimeout(300);
        await mode('text'); await click(0.6, 0.5); await page.keyboard.type('Légende'); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
        await mode('move'); await drag([0.62, 0.49], [0.62, 0.8]);
        out.moveLabel = await last();
        // ── 2. 🖌 après un correcteur : le pinceau va sur « Annotations », un 2e correcteur ne l'efface plus ──
        await mode('brush'); await drag([0.1, 0.85], [0.4, 0.85]);
        out.strokeBefore = await px(0.25, 0.85);
        await mode('heal'); await click(0.8, 0.2); await page.waitForTimeout(300);
        out.strokeAfter = await px(0.25, 0.85);
        out.layers2 = await layerNames();
        // ── 3. ⌫ avec une sélection sur le calque de dessin : effacé de ce calque, la photo reste ──
        await page.click(`${D} [data-rt-tab="layers"]`);
        await page.evaluate(() => { const li = [...document.querySelectorAll('dialog.h-retouch [data-rt-pane="layers"] .h-rt-node')].find(l => l.querySelector('[data-rt-lname]').value === 'Annotations'); li.querySelector('.h-rt-lico').click(); });
        await mode('marquee'); await drag([0.2, 0.78], [0.3, 0.92]);
        out.activeBefore = await page.$$eval(`${D} [data-rt-pane="layers"] .h-rt-node.is-active [data-rt-lname]`, l => l.map(i => i.value));
        await page.keyboard.press('Backspace'); await page.waitForTimeout(300);
        out.clearLabel = await last(); out.clearPx = await px(0.25, 0.85); out.clearKept = await px(0.38, 0.85);
        await page.keyboard.press('Control+d');
        // ── 4. 💾 « sans les annotations » : la poussière enlevée reste enlevée ──
        await mode('heal'); await click(150 / 600, 100 / 400); await page.waitForTimeout(300);
        await page.uncheck(`${D} [data-rt-merge]`);
        await page.click(`${D} .modal-actions [data-rt-save="keep"]`);
        await page.waitForFunction(() => !document.querySelector('dialog.h-retouch'), null, { timeout: 30000 });
        out.noAnnot = await page.evaluate(async () => {
            const v = (await window.LCNDA_APP.api('media_versions', {id: 1})).versions.find(x => !x.is_original); if (!v) return null;
            const im = new Image(); im.src = 'media/' + encodeURIComponent(v.filename); await im.decode();
            const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; const g = c.getContext('2d'); g.drawImage(im, 0, 0);
            return {dust: Array.from(g.getImageData(150, 100, 1, 1).data)};
        });

        // ── 5. ▦ la couleur d'un arrêt du dégradé (fenêtre C2) ──
        await openRt(3, 'paysage.png', 'Paysage');
        await mode('gradient'); await drag([0.1, 0.5], [0.9, 0.5]);
        await page.click(`${D} [data-rt-gprev]`); await page.waitForSelector(`${D} .h-rt-gedit`);
        await page.click(`${D} [data-g-col]`); await page.waitForSelector('.ui-colorbox [data-ui-hex]');
        await page.fill('.ui-colorbox [data-ui-hex]', '#ff00ff'); await page.press('.ui-colorbox [data-ui-hex]', 'Enter'); await page.waitForTimeout(200);
        out.stopColor = (await page.$eval(`${D} [data-g-col]`, b => b.textContent)).trim();
        await page.click(`${D} .h-rt-gedit [data-g-ok]`); await page.waitForTimeout(300);
        out.gradLabel = await last(); out.gradStart = await px(0.1, 0.5);
        // ── 6. 🔤 taille de texte hors bornes ──
        await mode('text'); await click(0.2, 0.2); await page.keyboard.type('Taille'); await page.keyboard.press('Enter'); await page.waitForTimeout(200);
        await mode('move'); await click(0.21, 0.2);
        await page.click(`${D} [data-rt-tab="char"]`);
        await page.fill(`${D} [data-rt-ch="size"]`, '99999'); await page.press(`${D} [data-rt-ch="size"]`, 'Tab'); await page.waitForTimeout(600);
        out.bigSize = await page.$eval(`${D} [data-rt-ch="size"]`, i => i.value);
        // ── 7. ✨ ＋ Ajouter un filtre, puis Annuler ──
        await page.click(`${D} [data-rt-tab="layers"]`); await page.click(`${D} [data-rt-aadd]`);
        await page.click(`${D} [data-rt-tab="filters"]`);
        out.fxBefore = await px(0.5, 0.15);
        await page.selectOption(`${D} [data-rt-fxadd]`, 'threshold'); await page.waitForTimeout(400);
        out.fxDuring = await px(0.5, 0.15);
        await page.click(`${D} .h-rt-fxpanel [data-fxcancel]`); await page.waitForTimeout(400);
        out.fxAfter = await px(0.5, 0.15); out.fxChain = await page.$$eval(`${D} [data-rt-fxedit]`, l => l.length);
        // ── 8. 🧩 Pixelliser : sans question, « ↶ Annuler » ──
        await page.evaluate(() => document.querySelector('dialog.h-retouch [data-rt-cmd="img:place"]').click());
        await page.waitForSelector('dialog.mpk-dialog[open]'); await page.click('dialog.mpk-dialog[open] :text-is("Portrait")'); await page.click('dialog.mpk-dialog[open] [data-mp="ok"]'); await page.waitForTimeout(800);
        await page.click(`${D} [data-rt-smart="raster"]`); await page.waitForTimeout(300);
        out.rasterAsk = await page.$$eval('dialog[open].confirm-box-dialog', l => l.length);
        out.rasterLabel = await last();
        await undoToast().click(); await page.waitForTimeout(300);
        out.smartBack = await page.$$eval(`${D} [data-rt-smart="raster"]`, l => l.length);

        // ── 9. ⚡ retouche rapide : « Retoucher celle-ci » demande avant de perdre le travail ──
        await openRt(1, 'poussiere.png', 'Poussière', true);
        await page.$eval('dialog.h-retouch-simple [data-rs="contrast"]', i => { i.value = 40; i.dispatchEvent(new Event('input', {bubbles: true})); i.dispatchEvent(new Event('change', {bubbles: true})); });
        await page.click('dialog.h-retouch-simple [data-rs-vfrom]'); await page.waitForTimeout(300);
        out.simpleAsk = await page.$$eval('dialog[open].confirm-box-dialog', l => l.length);
        await page.click('dialog[open].confirm-box-dialog .button.secondary'); await page.waitForTimeout(200);
        out.simpleStill = await page.$$eval('dialog.h-retouch-simple[open]', l => l.length);
        await page.evaluate(() => document.querySelector('dialog.h-retouch-simple').close());

        // ── 10. ⬜ canevas vide enregistré dans les médias ──
        await page.evaluate(() => window.LCNDA_EXT.newBlankCanvas());
        await page.waitForSelector('dialog[open] [name=bg]');
        await page.fill('dialog[open] [name=w]', '400'); await page.fill('dialog[open] [name=h]', '300'); await page.fill('dialog[open] [name=title]', 'Mon canevas');
        await page.click('dialog[open] .modal-actions .button:not(.secondary)');
        await page.waitForSelector(`${D} [data-rt-canvas]`); await page.waitForTimeout(400);
        await mode('shape'); await drag([0.2, 0.2], [0.6, 0.6]);
        await page.click(`${D} .modal-actions [data-rt-save="show"]`);
        await page.waitForFunction(() => !document.querySelector('dialog.h-retouch'), null, { timeout: 30000 });
        out.freshToast = await page.$$eval('.toast, [class*=toast]', l => l.map(x => x.textContent).join(' | '));
    } catch (e) { errors.push('test : ' + (e.stack || e.message)); }
    finally { await browser.close(); srv.kill(); }

    const near = (a, b, tol) => Math.abs(a - b) <= tol;
    const checks = [
        ['➤ après un correcteur, le clic prend le texte (pas le calque ✨ Retouches)', () => assert.match(out.moveLabel || '', /T Légende/)],
        ['🖌 après un correcteur, le trait va sur « Annotations » et un 2e correcteur le garde', () => { assert.deepEqual(out.strokeBefore.slice(0, 3), [0, 0, 0]); assert.deepEqual(out.strokeAfter.slice(0, 3), [0, 0, 0]); assert.ok(out.layers2.includes('Annotations'), out.layers2.join(' | ')); }],
        ['⌫ dans une sélection : effacé du calque de dessin, la photo reste', () => { assert.match(out.clearLabel, /effacée sur « Annotations »/, String(out.activeBefore)); assert.ok(near(out.clearPx[0], 120, 8) && out.clearPx[3] === 255, String(out.clearPx)); assert.deepEqual(out.clearKept.slice(0, 3), [0, 0, 0]); }],
        ['💾 « sans les annotations » : la poussière enlevée le reste', () => { assert.ok(out.noAnnot, 'pas de version'); assert.ok(out.noAnnot.dust[0] < 200, String(out.noAnnot.dust)); }],
        ['▦ couleur d’un arrêt du dégradé changée par la fenêtre C2', () => { assert.match(out.stopColor, /#FF00FF/); assert.match(out.gradLabel, /Dégradé modifié/); assert.ok(out.gradStart[0] > 200 && out.gradStart[2] > 200 && out.gradStart[1] < 60, String(out.gradStart)); }],
        ['🔤 taille de texte ramenée à 4 000 au plus', () => assert.equal(out.bigSize, '4000')],
        ['✨ « ＋ Ajouter un filtre » puis « Annuler » : rien ne reste', () => { assert.notDeepEqual(out.fxDuring, out.fxBefore); assert.deepEqual(out.fxAfter, out.fxBefore); assert.equal(out.fxChain, 0); }],
        ['🧩 Pixelliser sans question, défait par « ↶ Annuler »', () => { assert.equal(out.rasterAsk, 0); assert.match(out.rasterLabel, /pixellisé/); assert.equal(out.smartBack, 1); }],
        ['⚡ retouche rapide : « Retoucher celle-ci » demande avant de perdre le travail', () => { assert.equal(out.simpleAsk, 1); assert.equal(out.simpleStill, 1); }],
        ['⬜ canevas vide : « Image enregistrée dans les Médias »', () => assert.match(out.freshToast || '', /Image enregistrée dans les Médias/)],
        ['aucune erreur JavaScript, aucun dialogue natif', () => assert.deepEqual(errors, [])],
    ];
    let failed = 0;
    for (const [name, fn] of checks) { try { fn(); console.log('  ✓', name); } catch (e) { failed++; console.log('  ✗', name, '\n   ', String(e.message).slice(0, 600)); } }
    console.log(failed ? `${failed} échec(s)` : `${checks.length} vérifications réussies`);
    done(failed ? 1 : 0);
})().catch(e => { console.error(e); done(1); });
