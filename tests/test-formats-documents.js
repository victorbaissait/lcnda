'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 📐 Formats de document et informations :   node tests/test-formats-documents.js
 * Un vrai « php -S » sur une base neuve (deux personnes, une photo), puis un navigateur (Playwright ; sinon sauté) :
 *  0. la liste commune (app-formats.js) : A0 à A6, Lettre US, carte postale, carré, 16:9, photos 10×15, 13×18… ;
 *     un format libre utilisé entre dans « Mes formats » et l'outil le retient ;
 *  1. 🗺️ Une nouvelle carte : format libre 50 × 35 cm → la carte a cette taille ; la fenêtre suivante le propose (Mes formats) ;
 *  2. ✒️ Dessin vectoriel : Fichier → Format du document (A5, objets remis à l'échelle), ↶ ↷, Informations du document ;
 *     enregistrer, rouvrir (taille et infos gardées) ; le SVG exporté a <title>, <desc>, <metadata> ; le PDF a /Title, /Author ;
 *  3. 📐 Mise en page : Fichier → Format du document (A5 sur les pages 2-3 seulement), ↶ ↷, Informations (ISBN vérifié) ;
 *     enregistrer, rouvrir ; le HTML exporté (base du PDF) a le titre, l'auteur et la taille des pages ; l'ePub a dc:creator, l'ISBN ;
 *  4. 🎚️ Retouche : Image → Taille de l'image, Taille de la zone de travail (ancrage, fond), Fichier → Informations ; ↶ ↷ ;
 *     le projet enregistré et rouvert les garde ; le PNG exporté a la bonne taille, la résolution (pHYs) et l'XMP (titre, droits) ;
 *  5. 🖨 Imprimer : « ✎ Autre… » (format libre) donne la taille de la page imprimée.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const phpPath = findPhp([devBundledPhp()]);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-formats-'));
const dir = path.join(tmp, 'a');
const envFor = d => ({ ...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1' });
fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
const done = code => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {} process.exit(code); };
{
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(first_name,last_name,gender) VALUES('Jean','Martin','male'),('Marie','Borie','female')");
$im = imagecreatetruecolor(400, 300); imagefill($im, 0, 0, imagecolorallocate($im, 230, 220, 200)); imagefilledellipse($im, 200, 150, 160, 120, imagecolorallocate($im, 40, 40, 60)); imagejpeg($im, MEDIA_DIR . '/photo.jpg', 90);
$pdo->exec("INSERT INTO media(title, filename, media_type) VALUES('Photo','photo.jpg','image')");
echo 'ok';`], { cwd: appRoot, encoding: 'utf8', env: envFor(dir) });
    if (r.status !== 0 || !/ok$/.test(r.stdout)) { console.error(r.stderr || r.stdout); done(1); }
}
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
function loadPlaywright() { for (const p of ['playwright', '/opt/node-tools/node_modules/playwright', '/opt/node22/lib/node_modules/playwright']) { try { return require(p); } catch (_) {} } return null; }
async function launch(pw) { const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(f => fs.existsSync(f)); try { return await pw.chromium.launch(exe ? { executablePath: exe } : {}); } catch (_) { return pw.chromium.launch(); } }
/** les fichiers d'un zip (ePub) : nom → texte */
function unzip(buf) {
    const out = {}; let i = 0;
    while (i + 30 <= buf.length && buf.readUInt32LE(i) === 0x04034b50) {
        const method = buf.readUInt16LE(i + 8), size = buf.readUInt32LE(i + 18), nlen = buf.readUInt16LE(i + 26), xlen = buf.readUInt16LE(i + 28);
        const name = buf.slice(i + 30, i + 30 + nlen).toString('utf8'), data = buf.slice(i + 30 + nlen + xlen, i + 30 + nlen + xlen + size);
        out[name] = method === 8 ? zlib.inflateRawSync(data).toString('utf8') : data.toString('utf8');
        i += 30 + nlen + xlen + size;
    }
    return out;
}
let checks = 0; const ok = (c, m) => { assert.ok(c, m); checks++; }; const eq = (a, b, m) => { assert.deepStrictEqual(a, b, m); checks++; };

(async () => {
    const pw = loadPlaywright();
    if (!pw) { console.log('  – navigateur : sauté (Playwright absent)'); console.log('0 vérification (Playwright absent)'); done(0); }
    const port = await freePort();
    const srv = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env: envFor(dir), stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
    const browser = await launch(pw);
    const errors = [];
    try {
        const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
        await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
        await ctx.addInitScript(() => { try { localStorage.setItem('genealogie-retouch-mode', 'advanced'); } catch (_) {} });
        const page = await ctx.newPage();
        page.setDefaultTimeout(20000);
        page.on('pageerror', e => errors.push(String(e.message)));
        page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource|net::ERR/.test(m.text())) errors.push(m.text()); });
        page.on('dialog', d => { errors.push('dialogue natif : ' + d.message()); d.dismiss(); });
        await page.goto(base);
        await page.waitForFunction(() => window.LCNDA_FORMATS && window.LCNDA_EXT?.openVectorEditor && window.LCNDA_EXT?.newMapDoc && window.LCNDA_EXT?.newLayoutDoc && window.LCNDA_EXT?.openRetouch && window.LCNDA_APP?.api && window.LCNDA_UI?.openPrintDialog, null, { timeout: 30000 });
        const download = async trigger => { const [d] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), trigger()]); return fs.readFileSync(await d.path()); };
        const submit = () => page.click('dialog[open] .modal-actions button[type=submit]');
        const setFree = async (w, h) => { await page.selectOption('dialog[open] [data-fmt-preset]', 'free'); await page.fill('dialog[open] [data-fmt-w]', String(w)); await page.press('dialog[open] [data-fmt-w]', 'Tab'); await page.fill('dialog[open] [data-fmt-h]', String(h)); await page.press('dialog[open] [data-fmt-h]', 'Tab'); };

        /* 0. la liste commune */
        const F0 = await page.evaluate(() => { const F = window.LCNDA_FORMATS; return { ids: F.PRESETS.map(p => p.id), a4: F.inMm(F.preset('A4')), land: F.inMm(F.preset('A4', { orient: 'landscape' })), px: F.inPx(F.preset('p10x15'), 300), isbn: [F.isbnOk('978-2-07-036024-6'), F.isbnOk('978-2-07-036024-4'), F.isbnOk('2-07-036024-8')] }; });
        ['A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'letter', 'postcard', 'square', 's169', 'p10x15', 'p13x18'].forEach(id => ok(F0.ids.includes(id), `format ${id} dans la liste commune`));
        eq(F0.a4.map(Math.round), [210, 297], 'A4 en mm'); eq(F0.land.map(Math.round), [297, 210], 'A4 paysage'); eq(F0.px, [1181, 1772], '10 × 15 à 300 ppp');
        eq(F0.isbn, [true, false, false], 'ISBN : la clé est vérifiée');

        /* 1. 🗺️ une nouvelle carte, format libre */
        await page.evaluate(() => window.LCNDA_EXT.newMapDoc(() => {}));
        await page.waitForSelector('dialog[open] [data-fmt-box]');
        await setFree(50, 35);
        ok(/50 × 35 cm/.test(await page.textContent('dialog[open] [data-fmt-info]')), 'carte : la taille est lue (50 × 35 cm)');
        await page.click('dialog[open] [name=geo]'); await submit();
        await page.waitForSelector('.vx-dlg [data-vx-stage]'); await page.waitForTimeout(500);
        const mapBoard = await page.evaluate(() => [Number(document.querySelector('.vx-dlg [data-vx-board]').getAttribute('width')), Number(document.querySelector('.vx-dlg [data-vx-board]').getAttribute('height'))]);
        ok(Math.abs(mapBoard[0] - 1889.76) < 1 && Math.abs(mapBoard[1] - 1322.83) < 1, `carte de 50 × 35 cm (${mapBoard})`);
        const mem = await page.evaluate(() => JSON.parse(localStorage.getItem('genealogie-formats')));
        ok(mem.mine.length === 1 && mem.mine[0].w === 50 && mem.mine[0].unit === 'cm' && mem.last.carte.id === mem.mine[0].id, 'format libre gardé dans « Mes formats » et retenu pour la carte');
        await page.evaluate(() => { const d = document.querySelector('.vx-dlg'); d.dataset.ownClose = ''; d.close(); d.remove(); });
        await page.evaluate(() => window.LCNDA_EXT.newMapDoc(() => {}));
        await page.waitForSelector('dialog[open] [data-fmt-box]');
        const again = await page.evaluate(() => { const s = document.querySelector('dialog[open] [data-fmt-preset]'); return [s.value, s.selectedOptions[0].parentElement.label, document.querySelector('dialog[open] [data-fmt-w]').value]; });
        ok(again[0].startsWith('mf') && /Mes formats/.test(again[1]) && again[2] === '50', `la carte suivante propose le format retenu (${again})`);
        await page.click('dialog[open] .modal-actions [data-h-close]');

        /* 2. ✒️ dessin vectoriel */
        await page.evaluate(() => localStorage.removeItem('genealogie-toolbars'));
        await page.evaluate(() => window.LCNDA_EXT.openVectorEditor({})); await page.waitForSelector('.vx-dlg [data-vx-stage]'); await page.waitForTimeout(500);
        const sb = await page.locator('.vx-dlg [data-vx-stage]').boundingBox(), cx = sb.x + sb.width / 2, cy = sb.y + sb.height / 2;
        await page.click('.vx-dlg [data-vx-tool="rect"]'); await page.mouse.move(cx - 80, cy - 50); await page.mouse.down(); await page.mouse.move(cx + 80, cy + 50, { steps: 5 }); await page.mouse.up(); await page.waitForTimeout(200);
        const board = () => page.evaluate(() => { const b = document.querySelector('.vx-dlg [data-vx-board]'); return [Math.round(Number(b.getAttribute('width'))), Math.round(Number(b.getAttribute('height')))]; });
        const before = await board();
        const vxMenu = async cmd => { await page.click('.vx-dlg .vx-menu[data-tb="menu-Fichier"] summary'); await page.click(`.vx-dlg [data-vx-cmd="${cmd}"]`); };
        await vxMenu('docformat'); await page.waitForSelector('dialog[open] [data-fmt-box]');
        await page.selectOption('dialog[open] [data-fmt-preset]', 'A5'); await page.click('dialog[open] [name=vx_objs][value=scale]');
        await page.check('dialog[open] [name=vx_transp]');
        await submit(); await page.waitForTimeout(300);
        eq(await board(), [794, 559], 'dessin : A5 paysage (le sens du dessin est gardé)');
        await page.keyboard.press('Control+z'); await page.waitForTimeout(200);
        eq(await board(), before, 'dessin : ↶ revient au format d’avant');
        await page.keyboard.press('Control+Shift+z'); await page.waitForTimeout(200);
        eq(await board(), [794, 559], 'dessin : ↷ remet le format');
        await vxMenu('docinfo'); await page.waitForSelector('dialog[open] [name=info_author]');
        await page.fill('dialog[open] [name=info_title]', 'Armes des Martin'); await page.fill('dialog[open] [name=info_author]', 'Élise Roux');
        await page.fill('dialog[open] [name=info_desc]', 'Le blason de la famille'); await page.fill('dialog[open] [name=info_keywords]', 'blason, Brive');
        await submit(); await page.waitForTimeout(200);
        await page.fill('.vx-dlg [data-vx-name]', 'Blason format');
        await page.keyboard.press('Control+s'); await page.waitForFunction(() => /Enregistré/.test(document.querySelector('.vx-dlg [data-vx-status]')?.textContent || ''), null, { timeout: 15000 });
        const vlist = await page.evaluate(async () => (await window.LCNDA_APP.api('vector_docs')).docs);
        const vid = vlist.find(d => d.name === 'Blason format').id;
        const vdoc = (await page.evaluate(id => window.LCNDA_APP.api('vector_doc', { id }), vid)).doc;
        ok(Math.round(vdoc.w) === 794 && vdoc.fmt === 'A5' && vdoc.bg === 'transparent' && vdoc.info.author === 'Élise Roux' && vdoc.info.title === 'Armes des Martin', 'dessin enregistré : format et informations');
        const svg = (await download(async () => { await page.locator('.vx-dlg .vx-export summary').click(); await page.click('.vx-dlg [data-vx-cmd="xd_svg"]'); await page.waitForSelector('dialog.ui-export[open]'); await page.locator('dialog.ui-export[open] .modal-actions button').last().click(); })).toString('utf8');
        ok(/<title>Armes des Martin<\/title>/.test(svg) && /<desc>Le blason de la famille<\/desc>/.test(svg) && /<dc:creator>Élise Roux<\/dc:creator>/.test(svg) && /<rdf:li>Brive<\/rdf:li>/.test(svg), 'SVG exporté : title, desc et metadata');
        const pdf = (await download(async () => { await page.locator('.vx-dlg .vx-export summary').click(); await page.click('.vx-dlg [data-vx-cmd="xd_pdf"]'); await page.waitForSelector('dialog.ui-export[open]'); await page.locator('dialog.ui-export[open] .modal-actions button').last().click(); })).toString('latin1');
        const u16 = t => 'FEFF' + [...t].map(c => c.charCodeAt(0).toString(16).padStart(4, '0')).join('').toUpperCase();
        ok(pdf.includes(`/Title <${u16('Armes des Martin')}>`) && pdf.includes(`/Author <${u16('Élise Roux')}>`) && pdf.includes(`/Keywords <${u16('blason, Brive')}>`), 'PDF exporté : titre, auteur, mots-clés (accents gardés)');
        await page.evaluate(() => document.querySelector('.vx-dlg [data-vx-close]').click()); await page.waitForTimeout(300);
        await page.evaluate(id => window.LCNDA_EXT.openVectorEditor({ id }), vid); await page.waitForSelector('.vx-dlg [data-vx-stage]'); await page.waitForTimeout(500);
        eq(await board(), [794, 559], 'dessin rouvert : même format');
        await vxMenu('docinfo'); await page.waitForSelector('dialog[open] [name=info_author]');
        eq(await page.inputValue('dialog[open] [name=info_author]'), 'Élise Roux', 'dessin rouvert : informations gardées');
        await page.click('dialog[open] .modal-actions [data-h-close]');
        await page.evaluate(() => document.querySelector('.vx-dlg [data-vx-close]').click()); await page.waitForTimeout(300);

        /* 3. 📐 mise en page */
        const E = '.ly-editor ';
        await page.evaluate(() => window.LCNDA_EXT.newLayoutDoc('blank', () => {}));
        await page.waitForSelector('dialog[open] [name=pages]');
        await page.fill('dialog[open] [name=name]', 'Livre format'); await page.fill('dialog[open] [name=pages]', '3'); await submit();
        await page.waitForSelector(E); await page.waitForTimeout(600);
        const sizes = () => page.evaluate(() => [...document.querySelectorAll('.ly-editor .ly-board .ly-page[data-page]')].map(p => `${Math.round(parseFloat(p.style.width))}x${Math.round(parseFloat(p.style.height))}`));
        const s0 = await sizes();
        const lyMenu = async cmd => { await page.locator(E + 'details.ly-menu').first().locator('summary').click(); await page.click(E + `[data-ly-cmd="${cmd}"]`); };
        await lyMenu('docformat'); await page.waitForSelector('dialog[open] [data-fmt-box]');
        await page.selectOption('dialog[open] [data-fmt-preset]', 'A5');
        await page.check('dialog[open] [name=ly_to][value=some]'); await page.fill('dialog[open] [name=ly_pages]', '2-3');
        await page.fill('dialog[open] [name=ly_bleed]', '5');
        await submit(); await page.waitForTimeout(400);
        eq(await sizes(), ['794x1123', '559x794', '559x794'], 'mise en page : A5 sur les pages 2 et 3 seulement');
        await page.keyboard.press('Control+z'); await page.waitForTimeout(300);
        eq(await sizes(), s0, 'mise en page : ↶ revient au format d’avant');
        await page.keyboard.press('Control+Shift+z'); await page.waitForTimeout(300);
        eq(await sizes(), ['794x1123', '559x794', '559x794'], 'mise en page : ↷ remet le format');
        await lyMenu('docinfo'); await page.waitForSelector('dialog[open] [name=info_isbn]');
        await page.fill('dialog[open] [name=info_title]', 'La famille Martin'); await page.fill('dialog[open] [name=info_author]', 'Élise Roux');
        await page.fill('dialog[open] [name=info_keywords]', 'Martin, Brive'); await page.selectOption('dialog[open] [name=info_lang]', 'oc');
        await page.fill('dialog[open] [name=info_isbn]', '978-2-07-036024-4'); await submit(); await page.waitForTimeout(300);
        ok(await page.locator('dialog[open] [name=info_isbn].is-invalid, dialog[open] .is-invalid [name=info_isbn]').count() > 0 || await page.locator('dialog[open] .is-invalid').count() > 0, 'ISBN faux : la fenêtre le dit sous le champ (K1)');
        await page.fill('dialog[open] [name=info_isbn]', '978-2-07-036024-6'); await submit(); await page.waitForTimeout(300);
        await page.keyboard.press('Control+s'); await page.waitForFunction(() => /Enregistré/.test(document.querySelector('.ly-editor [data-ly-state]')?.textContent || ''), null, { timeout: 15000 });
        const lid = (await page.evaluate(async () => (await window.LCNDA_APP.api('layout_docs')).docs)).find(d => d.name === 'Livre format').id;
        const ldoc = (await page.evaluate(id => window.LCNDA_APP.api('layout_doc', { id }), lid)).doc;
        ok(!ldoc.pages[0].size && ldoc.pages[1].size?.w === 148 && ldoc.page.bleed === 5 && ldoc.info.isbn === '978-2-07-036024-6' && ldoc.title === 'La famille Martin', 'mise en page enregistrée : tailles des pages, fond perdu, informations');
        const html = (await download(async () => { await page.click(E + '[data-ly-cmd="export"].button'); await page.waitForSelector('dialog.ui-export[open]'); await page.click('dialog.ui-export[open] [data-fmt="html"]'); await page.locator('dialog.ui-export[open] .modal-actions button').last().click(); })).toString('utf8');
        ok(/<title>La famille Martin<\/title>/.test(html) && /<meta name="author" content="Élise Roux">/.test(html) && /<meta name="keywords" content="Martin, Brive">/.test(html) && /<html lang="oc">/.test(html), 'HTML (et PDF) : titre, auteur, mots-clés, langue');
        ok(/@page lysz0\{size:148mm 210mm/.test(html) && (html.match(/class="ly-page lysz0/g) || []).length === 2, 'HTML (et PDF) : les pages 2 et 3 s’impriment en A5');
        const epub = unzip(await download(async () => { await page.click(E + '[data-ly-cmd="export"].button'); await page.waitForSelector('dialog.ui-export[open]'); await page.click('dialog.ui-export[open] [data-fmt="epub"]'); await page.locator('dialog.ui-export[open] .modal-actions button').last().click(); }));
        const opf = epub['OEBPS/content.opf'] || '';
        ok(/<dc:title>La famille Martin<\/dc:title>/.test(opf) && /<dc:creator>Élise Roux<\/dc:creator>/.test(opf) && /urn:isbn:9782070360246/.test(opf) && /<dc:language>oc<\/dc:language>/.test(opf) && /<dc:subject>Brive<\/dc:subject>/.test(opf), 'ePub : titre, auteur, ISBN, langue, sujets');
        await page.evaluate(() => { document.querySelector('.ly-editor [data-ly-cmd="close"]').click(); }); await page.waitForTimeout(300);
        await page.evaluate(id => window.LCNDA_EXT.openLayoutDoc(id, () => {}), lid); await page.waitForSelector(E); await page.waitForTimeout(500);
        eq(await sizes(), ['794x1123', '559x794', '559x794'], 'mise en page rouverte : mêmes tailles de page');
        await page.evaluate(() => { document.querySelector('.ly-editor [data-ly-cmd="close"]').click(); }); await page.waitForTimeout(300);

        /* 4. 🎚️ retouche */
        const D = 'dialog.h-retouch ';
        await page.evaluate(() => { const S = window.LCNDA_APP.state; S.lightboxMedia = [{ id: 1, filename: 'photo.jpg', title: 'Photo', media_type: 'image' }]; S.lightboxIndex = 0; window.LCNDA_EXT.openRetouch('', null, { advanced: true }); });
        await page.waitForSelector(D + '[data-rt-canvas]'); await page.waitForTimeout(600);
        const rtMenu = async (label, cmd) => { await page.locator(D + 'details.h-rt-menu', { has: page.locator(`summary:text-is("${label}")`) }).locator('summary').click(); await page.click(D + `[data-rt-cmd="${cmd}"]`); };
        await rtMenu('Image', 'imgsize'); await page.waitForSelector('dialog[open] [data-rs-w]');
        eq(await page.inputValue('dialog[open] [data-rs-w]'), '400', 'retouche : taille de départ');
        await page.fill('dialog[open] [data-rs-w]', '200'); await page.press('dialog[open] [data-rs-w]', 'Tab');
        eq(await page.inputValue('dialog[open] [data-rs-h]'), '150', 'retouche : proportions gardées');
        await page.fill('dialog[open] [data-rs-dpi]', '150'); await page.press('dialog[open] [data-rs-dpi]', 'Tab');
        await submit(); await page.waitForTimeout(300);
        await rtMenu('Image', 'canvassize'); await page.waitForSelector('dialog[open] [data-cs-w]');
        await page.check('dialog[open] [data-cs-rel]'); await page.fill('dialog[open] [data-cs-w]', '40'); await page.press('dialog[open] [data-cs-w]', 'Tab');
        await page.click('dialog[open] [data-cs-anchor="3"]');
        await submit(); await page.waitForTimeout(300);
        const chip = () => page.evaluate(() => document.querySelector('dialog.h-retouch .h-rt-sizechip')?.textContent || '');
        eq(await chip(), '240 × 150 px · 150 ppp', 'retouche : taille finale (zone de travail + 40 px)');
        await page.keyboard.press('Control+z'); await page.waitForTimeout(200);
        eq(await chip(), '200 × 150 px · 150 ppp', 'retouche : ↶ enlève la zone de travail');
        await page.keyboard.press('Control+Shift+z'); await page.waitForTimeout(200);
        eq(await chip(), '240 × 150 px · 150 ppp', 'retouche : ↷ la remet');
        await rtMenu('Fichier', 'info'); await page.waitForSelector('dialog[open] [name=info_rights]');
        await page.fill('dialog[open] [name=info_title]', 'Mariage 1925'); await page.fill('dialog[open] [name=info_rights]', '© Famille Martin');
        await page.fill('dialog[open] [name=info_date]', '7 mai 1925');
        await submit(); await page.waitForTimeout(300);
        await page.keyboard.press('Control+s'); await page.waitForFunction(() => /Enregistré/.test(document.querySelector('dialog.h-retouch [data-rt-status]')?.textContent || ''), null, { timeout: 15000 });
        const proj = (await page.evaluate(async () => (await window.LCNDA_APP.api('retouch_projects')).projects))[0];
        const pr = await page.evaluate(id => window.LCNDA_APP.api('retouch_project', { id }), proj.id);
        ok(pr.project.st.size?.w === 240 && pr.project.st.size.dpi === 150 && Math.abs(pr.project.st.board.w - 1.2) < 1e-6 && pr.project.st.board.ax === 0 && pr.project.st.info.title === 'Mariage 1925', 'retouche : le projet garde taille, zone de travail et informations');
        const png = await download(async () => { await rtMenu('Fichier', 'export:image'); await page.waitForSelector('dialog.ui-export[open]'); await page.click('dialog.ui-export[open] [data-fmt="png"]'); await page.locator('dialog.ui-export[open] .modal-actions button').last().click(); });
        eq([png.readUInt32BE(16), png.readUInt32BE(20)], [240, 150], 'PNG exporté : 240 × 150 px');
        const phys = png.indexOf('pHYs'); ok(phys > 0 && png.readUInt32BE(phys + 4) === Math.round(150 / 0.0254) && png[phys + 12] === 1, 'PNG exporté : résolution 150 ppp');
        const xmp = png.toString('utf8'); ok(/XML:com\.adobe\.xmp/.test(xmp) && /Mariage 1925/.test(xmp) && /© Famille Martin/.test(xmp) && /1925-05-07/.test(xmp), 'PNG exporté : XMP (titre, droits, date)');
        await page.evaluate(() => { document.querySelector('dialog.h-retouch')?.close(); });
        await page.evaluate(id => window.LCNDA_EXT.openRetouchProject(id), proj.id); await page.waitForSelector(D + '[data-rt-canvas]'); await page.waitForTimeout(800);
        eq(await chip(), '240 × 150 px · 150 ppp', 'retouche : le projet rouvert garde la taille finale');
        await page.evaluate(() => { document.querySelector('dialog.h-retouch')?.close(); });

        /* 5. 🖨 imprimer en format libre */
        await page.evaluate(() => { window.__printOpen = window.LCNDA_UI.openPrintDialog({ title: 'Carte', html: '<p>Carte</p>' }); });
        await page.waitForSelector('dialog.k-print[open] [data-k-paper="custom"]');
        await page.click('dialog.k-print[open] [data-k-paper="custom"]');
        await setFree(50, 70); await page.waitForTimeout(500);
        const srcdoc = await page.evaluate(() => document.querySelector('dialog.k-print[open] [data-k-prev] iframe')?.srcdoc || '');
        ok(/@page\{size:500mm 700mm\}/.test(srcdoc), 'imprimer : la page a le format libre (50 × 70 cm)');
        await page.click('dialog.k-print[open] [data-k-x]');

        eq(errors, [], 'aucune erreur dans la page');
        console.log(`✓ ${checks} vérifications (formats et informations des documents)`);
    } catch (e) {
        console.error(e); if (errors.length) console.error(errors.join('\n')); srv.kill(); await browser.close(); done(1);
    }
    srv.kill(); await browser.close(); done(0);
})();
