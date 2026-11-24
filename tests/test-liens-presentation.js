'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🎞️ Présentation et diaporama — les liens avec les autres outils (docs/design/outils-liens.html) :
 *   node tests/test-liens-presentation.js
 *  1. ext.keynoteWithObject reçoit une image des médias (centrée, sans déformation) et un texte ;
 *  2. ext.keynoteFromText : le premier titre = la diapositive de titre, chaque h1 / h2 = une diapositive, listes en puces,
 *     images des médias sur leur diapositive, un texte trop long continue sur « (suite) » ;
 *  3. Exporter → PowerPoint : un vrai .pptx (zip OOXML) — XML bien formé, textes, image intégrée, forme, tableau, fond ;
 *     relu par l'import PowerPoint de l'app (et par python-pptx s'il est là) ; le format est dans la fenêtre d'export ;
 *  4. « 📤 Envoyer vers… » (présentation et diaporama) : la vidéo WebM est rangée dans les médias puis passée à ext.sendTo('video') ;
 *  5. ext.openSlideshow({preset: {name, show: {slides: [{media_id, filename, title}]}}}) : des photos légendées, gardées à l'enregistrement ;
 *     et les mêmes chemins par ext.sendTo (images → diaporama, image / texte → présentation).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

let chromium = null;
try { ({ chromium } = require('playwright')); } catch (_) { try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); } catch (__) { chromium = null; } }
if (!chromium) { console.log('  — Playwright absent : test sauté'); process.exit(0); }

const appRoot = path.resolve(__dirname, '..');
const phpPath = findPhp([devBundledPhp()]);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-liens-presentation-'));
const dir = path.join(tmp, 'data');
fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
const env = { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media'), GENEALOGY_SKIP_REFERENCE: '1' };
const php = code => { const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], { cwd: appRoot, encoding: 'utf8', env }); if (r.status !== 0) throw new Error(r.stderr || r.stdout); return r.stdout; };

const crc32 = buf => { let c, crc = 0xFFFFFFFF; for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xFF; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xFFFFFFFF) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, 'latin1'), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, c]); };
function png(w, h, v = 200) {
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8;
    const raw = Buffer.alloc((w + 1) * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw[y * (w + 1) + 1 + x] = (x + y) % 37 < 3 ? 40 : v;
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
fs.writeFileSync(path.join(dir, 'media', 'mazaud.png'), png(600, 400));
fs.writeFileSync(path.join(dir, 'media', 'lacombe.png'), png(300, 600, 150));
php(String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p->exec("INSERT INTO persons(first_name,last_name,gender,is_start) VALUES('Jean','DURAND','male',1)");
$p->exec("INSERT INTO media(title,media_type,filename) VALUES('Mariage MAZAUD','image','mazaud.png'),('Maison LACOMBE','image','lacombe.png')");
$p = null; require 'lib/bootstrap.php'; db();`);

const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
let failed = 0, count = 0;
const t = async (name, fn) => { try { await fn(); count++; console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };

(async () => {
    const port = await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env, stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    const errs = [];
    const browser = await chromium.launch();
    try {
        for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
        const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
        const p = await ctx.newPage();
        p.on('pageerror', e => errs.push(e.message));
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_EXT?.openSlideshow && window.LCNDA_EXT?.keynoteFromText && window.LCNDA_EXT?.sendTo && window.LCNDA_APP?.state?.bootstrap, null, { timeout: 30000 });
        await p.waitForTimeout(400);
        const closeAll = () => p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => { try { d.close(); } catch (_) {} if (!d.id) d.remove(); }));
        const K = () => p.evaluate(() => JSON.parse(JSON.stringify(window.LCNDA_EXT.keynoteCurrent.show)));
        const plain = h => String(h || '').replace(/<[^>]*>/g, '').trim();
        const M1 = { id: 1, filename: 'mazaud.png', title: 'Mariage MAZAUD' }, M2 = { id: 2, filename: 'lacombe.png', title: 'Maison LACOMBE' };

        /* ─── 1. keynoteWithObject : image et texte ─── */
        await t('keynoteWithObject {t: image} : l’image des médias, centrée, sans déformation', async () => {
            await p.evaluate(m => window.LCNDA_EXT.keynoteWithObject({ t: 'image', media: m }, 'Album MAZAUD'), M1);
            await p.waitForSelector('.kn-dlg[open]');
            const sh = await K(), objs = sh.slides[0].objs, im = objs.find(o => o.t === 'image');
            assert.equal(sh.slides.length, 1); assert.ok(im, 'une image');
            assert.equal(im.filename, 'mazaud.png'); assert.equal(im.media_id, 1);
            assert.ok(Math.abs(im.w / im.h - 1.5) < 0.01, `rapport 3:2 gardé (${im.w} × ${im.h})`);
            assert.ok(Math.abs(im.x + im.w / 2 - sh.w / 2) <= 1 && Math.abs(im.y + im.h / 2 - sh.h / 2) <= 1, 'centrée');
            assert.equal(await p.$eval('.kn-dlg[open] [data-kn-name]', e => e.value), 'Album MAZAUD');
            await closeAll();
        });
        await t('keynoteWithObject {t: text} : une zone de texte avec le HTML nettoyé', async () => {
            await p.evaluate(() => window.LCNDA_EXT.keynoteWithObject({ t: 'text', html: '<p>Famille <b>LACOMBE</b><script>x()</script></p><ul><li>Tulle</li></ul>' }, 'Texte'));
            await p.waitForSelector('.kn-dlg[open]');
            const tx = (await K()).slides[0].objs.find(o => o.t === 'text');
            assert.ok(tx); assert.match(tx.html, /<b>LACOMBE<\/b>/); assert.match(tx.html, /<li>Tulle<\/li>/); assert.doesNotMatch(tx.html, /script/);
            await closeAll();
        });

        /* ─── 2. keynoteFromText ─── */
        await t('keynoteFromText : titre, une diapositive par h1 / h2, puces, images, « (suite) »', async () => {
            const long = Array.from({ length: 14 }, (_, i) => `<p>Paragraphe ${i + 1} sur la vie de la famille DURAND à Tulle, avec quelques détails en plus pour allonger.</p>`).join('');
            const html = `<h1>Famille MAZAUD</h1><p>Une histoire de Corrèze</p>
                <h2>Les origines</h2><ul><li>Naves</li><li>Tulle<ul><li>Le quartier</li></ul></li></ul><p><img src="media/lacombe.png" alt="Maison LACOMBE" data-media-id="2"></p>
                <h2>Une longue vie</h2>${long}
                <h1>Les photos</h1><p><img src="media/mazaud.png" alt="Mariage"></p><img src="https://exemple.org/x.png"><h3>Sous-titre</h3><p>Fin.</p>`;
            await p.evaluate(h => window.LCNDA_EXT.keynoteFromText(h, ''), html);
            await p.waitForSelector('.kn-dlg[open]');
            const sh = await K(), sl = sh.slides, title = s => plain((s.objs.find(o => o.role === 'title') || {}).html);
            assert.equal(await p.$eval('.kn-dlg[open] [data-kn-name]', e => e.value), 'Famille MAZAUD', 'le nom vient du titre');
            assert.equal(sl[0].layout, 'title'); assert.equal(title(sl[0]), 'Famille MAZAUD'); assert.equal(plain(sl[0].objs.find(o => o.role === 'sub').html), 'Une histoire de Corrèze');
            assert.equal(title(sl[1]), 'Les origines');
            const body1 = sl[1].objs.find(o => o.role === 'body').html; assert.match(body1, /<ul><li>Naves<\/li><li>Tulle<\/li><ul><li>Le quartier<\/li><\/ul><\/ul>/, 'puces imbriquées');
            const im1 = sl[1].objs.find(o => o.t === 'image'); assert.equal(im1?.filename, 'lacombe.png', 'l’image sur sa diapositive'); assert.equal(im1.media_id, 2);
            const longs = sl.filter(s => /^Une longue vie/.test(title(s)));
            assert.ok(longs.length >= 2, `le texte long continue (${longs.length} diapositives)`); assert.match(title(longs[1]), /\(suite\)$/);
            assert.equal(longs.reduce((a, s) => a + (s.objs.find(o => o.role === 'body').html.match(/Paragraphe/g) || []).length, 0), 14, 'aucun paragraphe perdu');
            const ph = sl.find(s => title(s) === 'Les photos'); assert.ok(ph, 'un h1 plus loin ouvre une diapositive');
            assert.equal(ph.objs.find(o => o.t === 'image')?.filename, 'mazaud.png'); assert.match(ph.objs.find(o => o.role === 'body').html, /<b>Sous-titre<\/b>/, 'un h3 reste dans le texte');
            assert.ok(!JSON.stringify(sh).includes('exemple.org'), 'une image hors des médias est laissée');
            await closeAll();
        });
        await t('keynoteFromText : un texte vide ne crée rien', async () => {
            const r = await p.evaluate(() => window.LCNDA_EXT.keynoteFromText('<p>  </p>', 'Vide'));
            assert.equal(r, null); assert.equal(await p.$('.kn-dlg[open]'), null);
        });

        /* ─── 3. PowerPoint ─── */
        let pptxBytes = null;
        await t('PowerPoint : un .pptx valide (XML, textes, image, forme, tableau, fond), relu par l’import de l’app', async () => {
            const r = await p.evaluate(async () => {
                const KI = window.LCNDA_EXT.keynoteInternals;
                const show = KI.normalize({ w: 1920, h: 1080, theme: 'parchemin', master: { objs: [{ id: 'm', t: 'text', html: '<div>{n} / {total}</div>', x: 1700, y: 1000, w: 200, h: 60, size: 24 }] }, slides: [
                    { id: 's1', bg: { type: 'gradient', c1: '#112233', c2: '#445566', angle: 180 }, trans: { type: 'push', dur: .8, dir: 'l' }, objs: [
                        { id: 't', t: 'text', role: 'title', x: 100, y: 80, w: 1700, h: 200, size: 80, align: 'center', html: '<div>Famille <b>MAZAUD</b> &amp; <i>LACOMBE</i></div>' },
                        { id: 'b', t: 'text', x: 100, y: 320, w: 900, h: 600, size: 40, html: '<ul><li>Naves</li><li>Tulle<ul><li>Le quartier</li></ul></li></ul><ol><li>Un</li></ol><div><span style="color: #ff0000">Rouge</span></div>' },
                        { id: 'i', t: 'image', filename: 'mazaud.png', x: 1100, y: 320, w: 700, h: 300, fit: 'cover', rot: 5 },
                        { id: 'f', t: 'shape', kind: 'ellipse', x: 1100, y: 700, w: 300, h: 200, fill: '#00aa00', text: 'Rond' },
                        { id: 'l', t: 'shape', kind: 'arrowline', x: 1450, y: 700, w: 300, h: 40 },
                        { id: 'c', t: 'shape', kind: 'combo', mop: 'union', parts: [{ kind: 'rect', x: 0, y: 0, w: 100, h: 100 }, { kind: 'ellipse', x: 50, y: 50, w: 100, h: 100 }], x: 1500, y: 800, w: 150, h: 150 }] },
                    { id: 's2', skip: true, bg: { type: 'color', c1: '#fafafa' }, objs: [{ id: 'tb', t: 'table', head: true, x: 200, y: 200, w: 1200, h: 400, rows: [['Nom', 'Lieu'], ['DURAND', 'Tulle'], ['LACOMBE', 'Naves\nCorrèze']] }] },
                    { id: 's3', bg: { type: 'image', filename: 'lacombe.png', dim: 30 }, objs: [] }] });
                const blob = await KI.buildPptx(show, 'Essai MAZAUD');
                const buf = await blob.arrayBuffer(), zip = await KI.unzip(buf), bad = [];
                for (const n of zip.names.filter(n => /\.(xml|rels)$/.test(n))) { const d = new DOMParser().parseFromString(await zip.text(n), 'application/xml'); if (d.getElementsByTagName('parsererror').length) bad.push(n); }
                const s1 = await zip.text('ppt/slides/slide1.xml'), s2 = await zip.text('ppt/slides/slide2.xml'), s3 = await zip.text('ppt/slides/slide3.xml');
                const target = KI.newShowFrom(); target.slides = [];
                const imp = await KI.importPptx(buf, 'essai.pptx', target);
                const u8 = new Uint8Array(buf); let bin = ''; for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000));
                return { names: zip.names, bad, s1, s2, s3, type: blob.type, imp: JSON.parse(JSON.stringify(imp)), b64: btoa(bin) };
            });
            assert.deepEqual(r.bad, [], 'tous les XML sont bien formés');
            assert.equal(r.type, 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
            for (const n of ['[Content_Types].xml', '_rels/.rels', 'ppt/presentation.xml', 'ppt/_rels/presentation.xml.rels', 'ppt/slideMasters/slideMaster1.xml', 'ppt/slideLayouts/slideLayout1.xml', 'ppt/theme/theme1.xml', 'ppt/slides/slide3.xml', 'ppt/slides/_rels/slide1.xml.rels', 'docProps/core.xml']) assert.ok(r.names.includes(n), n);
            assert.ok(r.names.filter(n => /^ppt\/media\/image\d+\.png$/.test(n)).length >= 3, 'images intégrées (photo, fond, forme fusionnée)');
            assert.match(r.s1, /<a:t>MAZAUD<\/a:t>/); assert.match(r.s1, /b="1"[^>]*>.*?<a:t>MAZAUD/); assert.match(r.s1, /<a:t> &amp; <\/a:t>/);
            assert.match(r.s1, /<a:buChar char="•"\/>.*<a:t>Naves<\/a:t>/); assert.match(r.s1, /lvl="1"[^>]*>.*<a:t>Le quartier/); assert.match(r.s1, /<a:buAutoNum type="arabicPeriod"\/>/);
            assert.match(r.s1, /<a:srgbClr val="FF0000"\/><\/a:solidFill>.*?<a:t>Rouge/, 'la couleur du texte');
            assert.match(r.s1, /<a:gradFill[^>]*><a:gsLst><a:gs pos="0"><a:srgbClr val="112233"\/>/, 'le fond en dégradé'); assert.match(r.s1, /<a:lin ang="5400000"/, '180° CSS = de haut en bas');
            assert.match(r.s1, /<p:pic>.*rot="300000".*<\/p:pic>/, 'l’image tournée'); assert.match(r.s1, /<a:srcRect l="\d+" t="\d+"/, 'recadrée comme à l’écran (cover)');
            assert.match(r.s1, /prst="ellipse".*<a:t>Rond<\/a:t>/); assert.match(r.s1, /<p:cxnSp>.*<a:tailEnd type="triangle"\/>/, 'la ligne fléchée');
            assert.match(r.s1, /<a:t>1 \/ 3<\/a:t>/, 'le masque, numéro compris'); assert.match(r.s1, /<p:push dir="l"\/>/, 'la transition');
            assert.match(r.s2, /show="0"/, 'diapositive masquée'); assert.match(r.s2, /<a:tbl>.*<a:t>DURAND<\/a:t>.*<a:t>Corrèze<\/a:t>/); assert.equal((r.s2.match(/<a:tr /g) || []).length, 3);
            assert.match(r.s3, /<p:bgPr><a:blipFill/, 'le fond image'); assert.match(r.s3, /<a:alpha val="30000"\/>/, 'le voile du fond');
            // relu par l'import de l'app
            const txt = JSON.stringify(r.imp);
            assert.ok(/MAZAUD/.test(txt) && /Naves/.test(txt) && /DURAND/.test(txt), 'l’import PowerPoint de l’app relit les textes et le tableau');
            pptxBytes = Buffer.from(r.b64, 'base64');
        });
        await t('PowerPoint : python-pptx l’ouvre (si présent)', async () => {
            if (!pptxBytes) throw new Error('pas de fichier');
            const f = path.join(tmp, 'essai.pptx'); fs.writeFileSync(f, pptxBytes); if (process.env.PPTX_OUT) fs.copyFileSync(f, process.env.PPTX_OUT); // pour l'ouvrir à la main (LibreOffice, PowerPoint)
            const py = spawnSync('python3', ['-I', '-c', 'import sys\ntry:\n import pptx\nexcept ImportError:\n print("ABSENT"); sys.exit(0)\np=pptx.Presentation(sys.argv[1])\nprint(len(p.slides), "|".join(sh.text_frame.text for s in p.slides for sh in s.shapes if sh.has_text_frame and sh.text_frame.text))', f], { encoding: 'utf8' });
            if (py.error || /ABSENT/.test(py.stdout)) { console.log('  — python-pptx absent : vérification sautée'); return; }
            assert.equal(py.status, 0, py.stderr); assert.match(py.stdout, /^3 /); assert.match(py.stdout, /Famille MAZAUD & LACOMBE/); assert.match(py.stdout, /Rond/);
        });
        await t('PowerPoint : le format est dans « ⤓ Exporter » et télécharge un .pptx', async () => {
            await p.evaluate(m => window.LCNDA_EXT.keynoteWithObject({ t: 'image', media: m }, 'Export LACOMBE'), M2);
            await p.waitForSelector('.kn-dlg[open]');
            await p.click('.kn-dlg[open] [data-kn-cmd="export"]'); await p.waitForSelector('dialog.ui-export[open] .ui-export-fmt[data-fmt="pptx"]');
            await p.click('dialog.ui-export[open] .ui-export-fmt[data-fmt="pptx"]');
            assert.equal(await p.$eval('dialog.ui-export[open] [data-ui-ext]', e => e.textContent), '.pptx');
            const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 20000 }), p.click('dialog.ui-export[open] [data-ui-go]')]);
            assert.match(dl.suggestedFilename(), /\.pptx$/);
            const f = await dl.path(), head = fs.readFileSync(f).subarray(0, 2).toString('latin1'); assert.equal(head, 'PK', 'un zip');
            await closeAll();
        });

        /* ─── 4. 📤 Envoyer vers… (la vidéo) ─── */
        await p.evaluate(() => { window.__sent = []; window.LCNDA_EXT.sendTo = async (kind, payload, opts) => { window.__sent.push({ kind, payload, exclude: opts?.exclude || [] }); }; window.LCNDA_APP.confirmBox = async () => true; });
        await t('Présentation → 📤 Envoyer vers… : vidéo WebM rangée dans les médias, puis sendTo("video")', async () => {
            await p.evaluate(() => window.LCNDA_EXT.keynoteWithObject({ t: 'text', html: '<p>DURAND</p>' }, 'Vidéo DURAND'));
            await p.waitForSelector('.kn-dlg[open]');
            await p.evaluate(() => { window.LCNDA_EXT.keynoteCurrent.show.slides[0].dur = 1; });
            await p.click('.kn-dlg[open] [data-kn-cmd="sendto"]');
            await p.waitForFunction(() => window.__sent.length >= 1, null, { timeout: 30000 });
            const s = (await p.evaluate(() => window.__sent))[0];
            assert.equal(s.kind, 'video'); assert.ok(s.payload.media.id > 0); assert.match(s.payload.media.filename, /\.webm$/); assert.equal(s.payload.media.title, 'Vidéo DURAND');
            assert.ok(s.exclude.includes('keynote'));
            const r = await fetch(base + 'media/' + encodeURIComponent(s.payload.media.filename)); assert.equal(r.status, 200, 'la vidéo est dans les médias'); assert.ok((await r.arrayBuffer()).byteLength > 100);
            await closeAll();
        });

        /* ─── 5. le diaporama : le preset {media_id, filename, title}, puis 📤 ─── */
        await t('openSlideshow({preset: {slides: [{media_id, filename, title}]}}) : des photos légendées, gardées à l’enregistrement', async () => {
            await p.evaluate(([a, b]) => window.LCNDA_EXT.openSlideshow({ preset: { name: 'Album LACOMBE', show: { slides: [{ media_id: a.id, filename: a.filename, title: a.title }, { media_id: b.id, filename: b.filename, title: b.title }] } } }).then(h => { window.__ss = h; }), [M1, M2]);
            await p.waitForFunction(() => window.__ss);
            const sh = await p.evaluate(() => JSON.parse(JSON.stringify(window.__ss.show)));
            assert.deepEqual(sh.slides.map(s => [s.type, s.filename, s.media_id, s.text]), [['photo', 'mazaud.png', 1, 'Mariage MAZAUD'], ['photo', 'lacombe.png', 2, 'Maison LACOMBE']]);
            assert.ok(sh.slides.every(s => s.id && s.dur >= 1));
            assert.equal(await p.$eval('.h-ss-dlg [data-ss-name]', e => e.value), 'Album LACOMBE');
            await p.evaluate(() => window.__ss.save());
            const list = await p.evaluate(() => window.LCNDA_APP.api('slideshows')); const id = (list.slideshows || list.items || list.result || []).map(x => x.id).pop() || 1;
            const back = await p.evaluate(id => window.LCNDA_APP.api('slideshow', { id }), id);
            assert.equal((back.show.slides || []).filter(s => s.type === 'photo').length, 2, 'le serveur garde les photos');
        });
        await t('Diaporama → 📤 Envoyer vers… : la vidéo rangée dans les médias, puis sendTo("video")', async () => {
            await p.evaluate(() => { window.__ss.show.slides.forEach(s => { s.dur = 1; }); window.__sent = []; });
            await p.click('.h-ss-dlg [data-ss-rail] [data-ss-cmd="sendto"]');
            await p.waitForFunction(() => window.__sent.length >= 1, null, { timeout: 30000 });
            const s = (await p.evaluate(() => window.__sent))[0];
            assert.equal(s.kind, 'video'); assert.ok(s.payload.media.id > 0); assert.equal(s.payload.media.title, 'Album LACOMBE'); assert.ok(s.exclude.includes('slideshow'));
            const r = await fetch(base + 'media/' + encodeURIComponent(s.payload.media.filename)); assert.equal(r.status, 200);
            assert.equal(await p.$$eval('.h-ss-dlg [data-ss-cmd="sendto"]', l => l.length), 2, 'le bouton dans la colonne et dans « Tout le diaporama »');
            await closeAll();
        });

        /* ─── 6. les mêmes chemins par le menu commun (heritage-envoyer.js) ─── */
        await p.reload(); await p.waitForFunction(() => window.LCNDA_EXT?.openSlideshow && window.LCNDA_EXT?.keynoteFromText && window.LCNDA_EXT?.sendTo && window.LCNDA_APP?.state?.bootstrap, null, { timeout: 30000 });
        await t('ext.sendTo : images → diaporama, image → présentation, texte → présentation', async () => {
            await p.evaluate(([a, b]) => window.LCNDA_EXT.sendTo('images', { medias: [a, b] }, { to: 'slideshow', title: 'Lot MAZAUD' }), [M1, M2]);
            await p.waitForSelector('.h-ss-dlg[open]'); await p.waitForTimeout(300);
            assert.equal(await p.$$eval('.h-ss-dlg [data-ss-slides] > li', l => l.length), 2);
            await closeAll();
            await p.evaluate(m => window.LCNDA_EXT.sendTo('image', { media: m }, { to: 'keynote', title: 'Photo' }), M2);
            await p.waitForSelector('.kn-dlg[open]');
            assert.equal((await K()).slides[0].objs.find(o => o.t === 'image')?.filename, 'lacombe.png');
            await closeAll();
            await p.evaluate(() => window.LCNDA_EXT.sendTo('text', { html: '<h1>Les DURAND</h1><h2>Tulle</h2><p>Né en 1890.</p>', name: 'Notes DURAND' }, { to: 'keynote' }));
            await p.waitForSelector('.kn-dlg[open]');
            const sh = await K(); assert.equal(sh.slides.length, 2); assert.equal(await p.$eval('.kn-dlg[open] [data-kn-name]', e => e.value), 'Notes DURAND');
            await closeAll();
        });
        await t('aucune erreur dans la page', () => { assert.deepEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill();
    }
    console.log(`\n${count} réussi(s), ${failed} échoué(s)`);
    fs.rmSync(tmp, { recursive: true, force: true });
    process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); fs.rmSync(tmp, { recursive: true, force: true }); process.exit(1); });
