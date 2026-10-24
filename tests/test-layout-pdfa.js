'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 📐 Mise en page — 🗄️ export PDF/A (heritage-layout-pdfa.js) :   node tests/test-layout-pdfa.js
 *   le fichier (Node) : en-tête 1.7, XMP « PDF/A-2B » identique aux informations, profil sRGB intégré (lu par LittleCMS si python3
 *   et Pillow sont là), identifiant, lu en mode strict par pypdf si présent ;
 *   navigateur : « ⤓ Exporter » → 🗄️ PDF/A télécharge un PDF dont la page montre la photo de la base et le texte.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');
const P = require('../assets/js/heritage-layout-pdfa.js');
const appRoot = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-layout-pdfa-')); fs.mkdirSync(path.join(tmp, 'media'));
const env = { ...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1' };
let failed = 0, count = 0;
const t = async (name, fn) => { try { await fn(); count++; console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
const py = (code, ...args) => spawnSync('python3', ['-I', '-c', code, ...args], { encoding: 'utf8' });
const hasPy = mod => py(`import ${mod}`).status === 0;
// un JPEG minuscule (1 × 1, gris)
const JPG = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');

(async () => {
    await t('fichier : en-tête, XMP PDF/A-2B, mêmes titre et dates que les informations, sRGB, identifiant, fin', () => {
        const pdf = Buffer.from(P.build([{ jpeg: new Uint8Array(JPG), w: 1, h: 1, wPt: 419.53, hPt: 595.28 }], { title: 'Livre de Léonie', author: 'Victor', keywords: 'famille', date: new Date('2026-10-24T10:00:00Z') }));
        const s = pdf.toString('latin1');
        assert.ok(s.startsWith('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n'));
        assert.match(s, /<pdfaid:part>2<\/pdfaid:part><pdfaid:conformance>B<\/pdfaid:conformance>/);
        assert.match(s, /\/CreationDate \(D:20261024100000Z\)/); assert.match(pdf.toString('utf8'), /<xmp:CreateDate>2026-10-24T10:00:00Z<\/xmp:CreateDate>/);
        assert.match(s, /\/Title <FEFF004C0069007600720065/); assert.match(pdf.toString('utf8'), /Livre de Léonie/);
        assert.match(s, /\/OutputIntents \[4 0 R\]/); assert.match(s, /\/ID \[<[0-9a-f]{32}> <[0-9a-f]{32}>\]/); assert.ok(s.endsWith('%%EOF\n'));
        assert.ok(!/\/Encrypt|\/JavaScript|\/LZWDecode/.test(s));
        fs.writeFileSync(path.join(tmp, 'n.pdf'), pdf);
        // le tableau des renvois tombe juste sur chaque objet
        const xref = Number(/startxref\n(\d+)/.exec(s)[1]); assert.ok(s.slice(xref).startsWith('xref'));
        const rows = s.slice(xref).split('\n').slice(3).filter(l => / 00000 n $/.test(l)).map(l => Number(l.slice(0, 10)));
        rows.forEach((o, k) => assert.ok(s.slice(o).startsWith(`${k + 1} 0 obj`), `objet ${k + 1}`));
    });
    await t('profil sRGB : en-tête ICC v2.1 « mntr RGB XYZ acsp », taille juste' + (hasPy('PIL.ImageCms') ? ', lu par LittleCMS' : ''), () => {
        const icc = Buffer.from(P.icc()); assert.equal(icc.readUInt32BE(0), icc.length); assert.equal(icc.toString('latin1', 12, 24), 'mntrRGB XYZ '); assert.equal(icc.toString('latin1', 36, 40), 'acsp');
        if (hasPy('PIL.ImageCms')) { fs.writeFileSync(path.join(tmp, 's.icc'), icc); const r = py('import sys;from PIL import ImageCms;print(ImageCms.getProfileDescription(ImageCms.ImageCmsProfile(sys.argv[1])).strip())', path.join(tmp, 's.icc')); assert.equal(r.stdout.trim(), 'sRGB IEC61966-2.1', r.stderr); }
    });
    if (hasPy('pypdf')) await t('pypdf (strict) relit le fichier : une page, les informations, l’OutputIntent', () => {
        const r = py('import sys,pypdf;r=pypdf.PdfReader(sys.argv[1],strict=True);print(len(r.pages),r.metadata["/Title"],r.trailer["/Root"]["/OutputIntents"][0]["/S"])', path.join(tmp, 'n.pdf'));
        assert.equal(r.stdout.trim(), '1 Livre de Léonie /GTS_PDFA1', r.stderr);
    });

    let pw = null; for (const m of ['playwright', '/opt/node-tools/node_modules/playwright']) { try { pw = require(m); break; } catch (_) {} }
    const phpPath = findPhp([devBundledPhp()]);
    if (!pw || !phpPath) { console.log('— navigateur : Playwright ou PHP absent, partie sautée'); return finish(); }
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`require 'lib/paths.php'; $p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null; require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,is_start,living_status) VALUES(1,'Jean','Martin','male',1,'deceased')");
$img = imagecreatetruecolor(60, 80); imagefill($img, 0, 0, imagecolorallocate($img, 40, 90, 200)); imagejpeg($img, MEDIA_DIR . '/jean.jpg', 95);
$pdo->exec("INSERT INTO media(id,title,media_type,filename,thumbnail) VALUES(1,'Jean','image','jean.jpg','jean.jpg')"); echo 'ok';`], { cwd: appRoot, encoding: 'utf8', env });
    if (r.status !== 0) throw new Error(r.stderr || r.stdout);
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const pp = s.address().port; s.close(() => res(pp)); }); });
    const srv = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env, stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
    const browser = await pw.chromium.launch(); const errors = [];
    try {
        const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 }, acceptDownloads: true }), page = await ctx.newPage();
        page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => { errors.push('dialogue : ' + d.message()); d.dismiss(); });
        await page.goto(base); await page.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.layoutKit && window.LCNDA_EXT?.layoutPdfA && window.LCNDA_EXT?.openLayoutDoc);
        const id = await page.evaluate(async () => { const K = window.LCNDA_EXT.layoutKit, d = K.cleanDoc({ page: { w: 100, h: 100 }, info: { title: 'Archives Martin', author: 'Victor', lang: 'fr' }, pages: [{ id: 'p1', master: '', items: [{ id: 'f2', type: 'frame', x: 0, y: 0, w: 50, h: 100, src: 'media/jean.jpg', fit: 'fill' }, K.textItem({ id: 't1', x: 55, y: 10, w: 40, h: 30, html: '<p data-ps="ps-body" style="font-size:40pt;color:#c00000">ÉTÉ</p>' })] }] });
            return (await window.LCNDA_APP.api('save_layout_doc', {}, { method: 'POST', body: { name: 'Archives', is_design: 0, doc: d } })).result.id; });
        await page.evaluate(id => window.LCNDA_EXT.openLayoutDoc(id, () => {}), id); await page.waitForSelector('dialog.ly-editor'); await page.waitForTimeout(600);
        await t('« ⤓ Exporter » propose 🗄️ PDF/A et télécharge un PDF/A', async () => {
            await page.evaluate(() => document.querySelector('dialog.ly-editor [data-ly-cmd="export"]').click()); await page.waitForSelector('dialog.ui-export[open] [data-fmt="pdfa"]');
            await page.click('dialog.ui-export[open] [data-fmt="pdfa"]');
            const dlP = page.waitForEvent('download', { timeout: 60000 }); await page.click('dialog.ui-export[open] [data-ui-go]'); const dl = await dlP;
            assert.match(dl.suggestedFilename(), /\.pdf$/); fs.copyFileSync(await dl.path(), path.join(tmp, 'b.pdf'));
            const s = fs.readFileSync(path.join(tmp, 'b.pdf')).toString('utf8'); assert.match(s, /<pdfaid:part>2/); assert.match(s, /Archives Martin/); assert.match(s, /<dc:creator><rdf:Seq><rdf:li>Victor/);
        });
        if (hasPy('pypdf') && hasPy('PIL')) await t('la page dessinée : la photo de la base (bleue) à gauche, le texte rouge à droite, le fond blanc', () => {
            const q = py(`import sys,io,pypdf
from PIL import Image
r=pypdf.PdfReader(sys.argv[1],strict=True);p=r.pages[0];im=Image.open(io.BytesIO(p.images[0].data)).convert('RGB');w,h=im.size
red=sum(1 for x in range(w//2,w) for y in range(0,h//2) if (lambda c:c[0]>150 and c[1]<80 and c[2]<80)(im.getpixel((x,y))))
print(w,h,im.getpixel((w//4,h//2)),im.getpixel((w-3,h-3)),red,[round(float(v)) for v in p.mediabox])`, path.join(tmp, 'b.pdf'));
            assert.equal(q.status, 0, q.stderr); const [w, h, ...rest] = q.stdout.trim().split(' '); assert.ok(Number(w) > 1000 && Number(h) > 1000, `300 points par pouce : ${w} × ${h}`);
            const m = /\((\d+), (\d+), (\d+)\) \((\d+), (\d+), (\d+)\) (\d+) \[0, 0, (\d+), (\d+)\]/.exec(rest.join(' ')); assert.ok(m, q.stdout);
            assert.ok(Number(m[3]) > 150 && Number(m[1]) < 90, `photo bleue : ${m.slice(1, 4)}`); assert.ok(Number(m[4]) > 240 && Number(m[6]) > 240, 'fond blanc');
            assert.ok(Number(m[7]) > 200, `texte rouge dessiné (${m[7]} points)`); assert.deepEqual([Number(m[8]), Number(m[9])], [283, 283], '100 mm = 283 points');
        });
        await t('aucune erreur dans la page', () => assert.deepEqual(errors, []));
    } finally { await browser.close(); srv.kill(); }
    finish();
})();
function finish() { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {} console.log(`${failed ? '✗' : '✓'} mise en page, PDF/A : ${count} vérifications${failed ? `, ${failed} en échec` : ''}`); process.exit(failed ? 1 : 0); }
