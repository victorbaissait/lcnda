'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * Présentation et diaporama (heritage-slideshow.js, heritage-keynote.js), transcription d'actes (heritage-transcribe.js)
 * et maison en plan et 3D (heritage-house*.js) : les défauts trouvés en les essayant comme un vrai utilisateur.
 *   node tests/test-presentation-maison.js
 *  1. diaporama : la durée tapée hors des bornes (0, 99999) est montrée telle qu'elle est gardée (1 à 120 s) ; un diaporama vide
 *     affiche « 0:00 / 0:00 » ; fermé pendant l'enregistrement de la vidéo : rien n'est téléchargé plus tard ;
 *  2. présentation : un .odp dont une diapositive porte un tableau (son cadre a aussi une image d'aperçu .svm) garde le tableau ;
 *     le compte rendu d'import se ferme par « Fermer » seul (K3) ;
 *  3. les barres du haut (diaporama, présentation, maison) ne changent pas de hauteur quand « • modifié », « Enregistrement… »
 *     ou un message apparaissent (le plan de la maison ne saute plus sous la souris : une porte se pose là où l'on clique) ;
 *  4. maison : le toit se voit aussi quand l'étage du dessus est encore vide ; date des réglages enregistrés au format commun K4 (« aujourd’hui », « 17 oct. 2026 ») ;
 *  5. transcription : le message du lecteur d'écriture (HTR) absent ne répète pas deux fois où l'installer.
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
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-presentation-'));
const dir = path.join(tmp, 'data');
fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
const env = { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media'), GENEALOGY_SKIP_REFERENCE: '1' };
const php = code => { const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], { cwd: appRoot, encoding: 'utf8', env }); if (r.status !== 0) throw new Error(r.stderr || r.stdout); return r.stdout; };

/* une image fabriquée ici (PNG gris avec des traits) */
const crc32 = buf => { let c, crc = 0xFFFFFFFF; for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xFF; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xFFFFFFFF) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, 'latin1'), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, c]); };
function png(w, h) {
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8;
    const raw = Buffer.alloc((w + 1) * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw[y * (w + 1) + 1 + x] = (x + y) % 37 < 3 ? 40 : 200;
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
fs.writeFileSync(path.join(dir, 'media', 'acte.png'), png(600, 400));
php(String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p->exec("INSERT INTO persons(first_name,last_name,gender,is_start) VALUES('Jean','Durand','male',1)");
$p->exec("INSERT INTO media(title,media_type,filename) VALUES('Acte','image','acte.png')");
$p = null; require 'lib/bootstrap.php'; db();`);

const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });

(async () => {
    const port = await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env, stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    const out = {}, errs = [];
    const browser = await chromium.launch();
    try {
        for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
        const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
        const p = await ctx.newPage();
        p.on('pageerror', e => errs.push(e.message + (process.env.DEBUG ? ' ' + e.stack : '')));
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_EXT?.openSlideshow && window.LCNDA_EXT?.openKeynote && window.LCNDA_EXT?.openHouse && window.LCNDA_EXT?.house3d && window.LCNDA_UI?.savedStatus, null, { timeout: 30000 });
        await p.waitForTimeout(500);
        const closeAll = () => p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => { try { d.close(); } catch (_) {} if (!d.id) d.remove(); })); // les fenêtres des outils (pas celles de la page, comme la visionneuse)

        /* ─── 1. le diaporama ─── */
        await p.evaluate(() => window.LCNDA_EXT.openSlideshow({}).then(h => { window.__ss = h; }));
        await p.waitForSelector('.h-ss-dlg [data-ss-time]'); await p.waitForTimeout(400);
        out.emptyTime = await p.$eval('.h-ss-dlg [data-ss-time]', e => e.textContent);
        await p.click('.h-ss-dlg [data-ss-cmd=addtitle]'); await p.waitForTimeout(300);
        const dur = '.h-ss-dlg [data-ss-p=dur]';
        await p.fill(dur, '0'); await p.press(dur, 'Tab'); out.dur0 = [await p.$eval(dur, e => e.value), await p.evaluate(() => window.__ss.show.slides[0].dur)];
        await p.fill(dur, '99999'); await p.press(dur, 'Tab'); out.durBig = [await p.$eval(dur, e => e.value), await p.evaluate(() => window.__ss.show.slides[0].dur)];
        // les barres du haut gardent leur hauteur
        const height = sel => p.evaluate(s => Math.round(document.querySelector(s).getBoundingClientRect().height), sel);
        out.ssBar = [await height('.h-ss-dlg .ui-topbar')];
        for (const st of ['dirty', 'saving', 'error']) { await p.evaluate(s => { window.LCNDA_UI.savedStatus(document.querySelector('.h-ss-dlg'), s); document.querySelector('.h-ss-dlg [data-ss-progress]').textContent = '⏺ 45 % (0:12 / 0:31)'; }, st); out.ssBar.push(await height('.h-ss-dlg .ui-topbar')); }
        // fermé pendant la vidéo : plus rien n'arrive ensuite
        await p.fill(dur, '8'); await p.press(dur, 'Tab');
        let downloads = 0; p.on('download', () => { downloads++; });
        await p.evaluate(() => { window.__ss.save = () => {}; }); // rien à enregistrer pour fermer
        await p.click('.h-ss-dlg [data-ss-cmd=export]'); await p.waitForSelector('dialog.ui-export[open] [data-fmt=video]');
        await p.click('dialog.ui-export[open] [data-fmt=video]'); await p.click('dialog.ui-export[open] [data-ui-go]'); await p.waitForTimeout(1500);
        out.recording = await p.$eval('.h-ss-dlg [data-ss-progress]', e => e.textContent);
        await p.evaluate(() => { const d = document.querySelector('.h-ss-dlg'); d.close(); d.remove(); }); // fermé pour de bon (comme « Fermer sans enregistrer »)
        await p.waitForTimeout(9000);
        out.downloadsAfterClose = downloads;
        await closeAll();

        /* ─── 2. la présentation : un .odp avec un tableau ─── */
        await p.evaluate(async () => {
            const KI = window.LCNDA_EXT.keynoteInternals, enc = s => new TextEncoder().encode(s);
            const ns = 'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:presentation="urn:oasis:names:tc:opendocument:xmlns:presentation:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"';
            const content = `<?xml version="1.0" encoding="UTF-8"?><office:document-content ${ns}><office:body><office:presentation><draw:page draw:name="p1" draw:master-page-name="M"><draw:frame svg:x="2cm" svg:y="2cm" svg:width="15cm" svg:height="3cm"><table:table><table:table-row><table:table-cell><text:p>Nom</text:p></table:table-cell><table:table-cell><text:p>Année</text:p></table:table-cell></table:table-row><table:table-row><table:table-cell><text:p>Jean</text:p></table:table-cell><table:table-cell><text:p>1850</text:p></table:table-cell></table:table-row></table:table><draw:image xlink:href="Pictures/TablePreview1.svm"/></draw:frame><draw:frame svg:x="2cm" svg:y="8cm" svg:width="5cm" svg:height="4cm"><draw:image xlink:href="Pictures/Abime.svm"/></draw:frame></draw:page></office:presentation></office:body></office:document-content>`;
            const styles = `<?xml version="1.0" encoding="UTF-8"?><office:document-styles ${ns}><office:automatic-styles><style:page-layout style:name="PM1"><style:page-layout-properties fo:page-width="28cm" fo:page-height="15.75cm"/></style:page-layout></office:automatic-styles><office:master-styles><style:master-page style:name="M" style:page-layout-name="PM1"/></office:master-styles></office:document-styles>`;
            const blob = KI.zipStore([{name: 'mimetype', data: enc('application/vnd.oasis.opendocument.presentation')}, {name: 'content.xml', data: enc(content)}, {name: 'styles.xml', data: enc(styles)}, {name: 'Pictures/TablePreview1.svm', data: enc('VCLMTF pas une image')}, {name: 'Pictures/Abime.svm', data: enc('VCLMTF pas une image')}]);
            const file = new File([blob], 'tableau.odp', {type: 'application/vnd.oasis.opendocument.presentation'});
            window.LCNDA_EXT.openKeynote({importFiles: [file]});
        });
        await p.waitForSelector('.kn-dlg'); await p.waitForTimeout(2500);
        out.odpTable = await p.evaluate(() => [...document.querySelectorAll('.kn-dlg [data-kn-slides] .kn-ni')].map(li => li.innerText.replace(/\s+/g, ' ')).join(' | '));
        out.odpReport = await p.evaluate(() => { const d = [...document.querySelectorAll('dialog[open]')].filter(x => !x.classList.contains('kn-dlg')).at(-1); return d ? [...d.querySelectorAll('.modal-actions button')].map(b => b.textContent.trim()) : null; });
        await p.evaluate(() => [...document.querySelectorAll('dialog[open]')].filter(x => !x.classList.contains('kn-dlg')).forEach(d => d.close()));
        out.knBar = [await height('.kn-dlg .kn-top')];
        for (const st of ['dirty', 'saving', 'error']) { await p.evaluate(s => window.LCNDA_UI.savedStatus(document.querySelector('.kn-dlg [data-kn-state]'), s), st); out.knBar.push(await height('.kn-dlg .kn-top')); }
        await closeAll();

        /* ─── 3. la maison : barre du haut stable, une porte posée où l'on clique ─── */
        await p.evaluate(() => window.LCNDA_EXT.openHouse({})); await p.waitForSelector('.h-hs-dlg [data-hs-stage]'); await p.waitForTimeout(1200);
        const D = '.h-hs-dlg';
        out.hsBar = [await height(`${D} .h-hs-top`)];
        const st0 = await (await p.$(`${D} [data-hs-stage]`)).boundingBox();
        await p.click(`${D} [data-hs-tool=room]`);
        await p.mouse.move(st0.x + 200, st0.y + 150); await p.mouse.down(); await p.mouse.move(st0.x + 500, st0.y + 350, { steps: 8 }); await p.mouse.up(); await p.waitForTimeout(400);
        out.hsBar.push(await height(`${D} .h-hs-top`));
        for (const st of ['saving', 'error']) { await p.evaluate(s => window.LCNDA_UI.savedStatus(document.querySelector('.h-hs-dlg [data-ui-status]'), s), st); out.hsBar.push(await height(`${D} .h-hs-top`)); }
        await p.click(`${D} [data-hs-tool=door]`); await p.mouse.click(st0.x + 350, st0.y + 350); await p.waitForTimeout(300);
        await p.fill(`${D} [data-hs-name]`, 'Maison du test'); await p.click(`${D} [data-hs-cmd=save]`);
        for (let i = 0; i < 40; i++) { await p.waitForTimeout(150); if ((await p.$eval(`${D} [data-ui-status]`, e => e.innerText)).includes('✓')) break; }
        out.door = await p.evaluate(async () => { const l = (await window.LCNDA_APP.api('houses')).items; const h = await window.LCNDA_APP.api('house', {id: l.find(x => x.name === 'Maison du test').id}); return h.house.floors[0].openings.map(o => o.type); });
        // 🧲 réglages enregistrés : la date au format commun (K4)
        await p.click(`${D} summary:has-text("Aimants")`); await p.waitForTimeout(200);
        if (!await p.$(`${D} [data-hs-snapbox] [data-ps-new]`)) await p.click(`${D} [data-hs-snapbox] [data-ps-toggle]`);
        await p.click(`${D} [data-hs-snapbox] [data-ps-new]`); await p.fill(`${D} [data-hs-snapbox] [data-ps-name]`, 'Précis'); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
        out.presetDate = await p.$eval(`${D} [data-hs-snapbox] .ui-presets-name small`, e => e.textContent);
        await closeAll();
        // le toit sur l'étage du haut qui a des murs (l'étage au-dessus est encore vide)
        out.roof = await p.evaluate(async () => {
            const wall = (id, a, b) => ({id, a, b, t: 20, mat: 'platre'});
            const fl0 = {id: 'f0', name: 'Rez-de-chaussée', level: 0, height: 270, wallT: 20, walls: [wall('w1', [0, 0], [800, 0]), wall('w2', [800, 0], [800, 500]), wall('w3', [800, 500], [0, 500]), wall('w4', [0, 500], [0, 0])], openings: [], rooms: [], items: [], dims: [], labels: []};
            const fl1 = {id: 'f1', name: '1er étage', level: 1, height: 260, wallT: 20, walls: [], openings: [], rooms: [], items: [], dims: [], labels: []};
            const red = async on => {
                const box = document.createElement('div'); box.style.cssText = 'position:fixed;left:0;top:0;width:600px;height:450px'; document.body.appendChild(box);
                const H = {unit: 'cm', grid: 10, floors: [JSON.parse(JSON.stringify(fl0)), JSON.parse(JSON.stringify(fl1))], roof: {on, kind: 'tuiles'}, meta: {people: []}};
                const v = await window.LCNDA_EXT.house3d.mount(box, H, 0, {}); await new Promise(r => setTimeout(r, 600));
                const blob = await v.shot(); v.destroy(); box.remove();
                const bm = await createImageBitmap(blob), c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height; const g = c.getContext('2d'); g.drawImage(bm, 0, 0);
                const d = g.getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 70 && d[i] - d[i + 1] > 35 && d[i] - d[i + 2] > 35) n++;
                return n / (c.width * c.height);
            };
            return {with: await red(true), without: await red(false)};
        });

        /* ─── 4. la transcription : le message du lecteur d'écriture absent ─── */
        await p.evaluate(() => window.LCNDA_EXT.openActTranscriber({mediaId: 1, filename: 'acte.png', title: 'Acte'}));
        await p.waitForSelector('.h-tx-dlg [data-tx-cmd=htr]'); await p.waitForTimeout(1200);
        await p.click('.h-tx-dlg [data-tx-cmd=htr]');
        await p.waitForFunction(() => [...document.querySelectorAll('.toast')].some(t => /modèle|Reconnaissance|impossible/i.test(t.innerText)), null, { timeout: 15000 }).catch(() => {});
        out.htrToast = await p.evaluate(() => [...document.querySelectorAll('.toast')].map(t => t.innerText).find(t => /modèle|Reconnaissance|impossible/i.test(t)) || '');
        await closeAll();
    } finally { await browser.close(); proc.kill(); }

    const checks = [
        ['diaporama vide : « 0:00 / 0:00 »', () => assert.equal(out.emptyTime, '0:00 / 0:00')],
        ['durée 0 : la case montre la valeur gardée', () => { assert.equal(String(out.dur0[0]), String(out.dur0[1])); assert.ok(out.dur0[1] >= 1 && out.dur0[1] <= 120); }],
        ['durée 99999 : ramenée à 120 s, et la case le montre', () => assert.deepEqual(out.durBig.map(String), ['120', '120'])],
        ['diaporama fermé pendant la vidéo : aucun téléchargement ensuite', () => { assert.match(out.recording, /⏺/); assert.equal(out.downloadsAfterClose, 0); }],
        ['présentation : le tableau d’un .odp est importé malgré son image d’aperçu .svm', () => assert.match(out.odpTable, /Nom.*Année.*Jean.*1850/)],
        ['présentation : le compte rendu d’import a « Fermer » seul (K3)', () => assert.ok(Array.isArray(out.odpReport) && out.odpReport.join('|') === 'Fermer', JSON.stringify(out.odpReport))],
        ['barres du haut : même hauteur quel que soit l’état (diaporama, présentation, maison)', () => {
            assert.equal(new Set(out.ssBar).size, 1, `diaporama ${out.ssBar}`); assert.equal(new Set(out.knBar).size, 1, `présentation ${out.knBar}`); assert.equal(new Set(out.hsBar).size, 1, `maison ${out.hsBar}`);
        }],
        ['maison : la porte se pose sur le mur cliqué juste après avoir dessiné la pièce', () => assert.deepEqual(out.door, ['door'])],
        ['maison : date des réglages enregistrés au format commun (K4)', () => assert.match(out.presetDate, /aujourd’hui|hier|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|\d{1,2} \S+ \d{4}/)],
        ['maison : le toit se voit même si l’étage du dessus est encore vide', () => { assert.ok(out.roof.with > .02, JSON.stringify(out.roof)); assert.ok(out.roof.with > out.roof.without * 5 + .01, JSON.stringify(out.roof)); }],
        ['transcription : « Maintenance → … » une seule fois dans le message du lecteur d’écriture', () => { assert.ok(out.htrToast, 'pas de message'); assert.equal((out.htrToast.match(/Maintenance/g) || []).length, 1, out.htrToast); }],
        ['aucune erreur JS', () => assert.deepEqual(errs, [])],
    ];
    let failed = 0;
    for (const [name, fn] of checks) { try { fn(); console.log('  ✓', name); } catch (e) { failed++; console.log('  ✗', name, '\n   ', e.message); } }
    fs.rmSync(tmp, { recursive: true, force: true });
    console.log(failed ? `${failed} échec(s)` : `${checks.length} vérifications réussies`);
    process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); fs.rmSync(tmp, { recursive: true, force: true }); process.exit(1); });
