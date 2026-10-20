'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * Test des ajouts à la mise en page (assets/js/heritage-layout.js, heritage-qr.js, lib/layout_docs.php) :   node tests/test-layout-more.js
 *   ▦ QR codes : l'encodeur est relu par un décodeur indépendant écrit ici (format, masque, Reed-Solomon, contenu) pour des
 *      textes de 1 à 213 octets, accents compris ; dans l'atelier, un QR code vers une adresse et vers une fiche en ligne,
 *      redessiné après modification, gardé dans le HTML et l'ePub exportés ;
 *   📚 les cinq livres prêts à l'emploi, remplis avec une famille de test (objets dynamiques, arbre sur deux pages, photos) ;
 *   📨 publipostage : la page modèle, le nombre de pages annoncé, une page par ancêtre (champs et portrait remplis),
 *      une étiquette, une liste, et ↶ qui défait tout.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const phpPath = findPhp([devBundledPhp()]);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-layout-plus-'));
fs.mkdirSync(path.join(tmp, 'media'), { recursive: true });
const envFor = d => ({ ...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1' });
const done = code => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {} process.exit(code); };

/* ── Un décodeur de QR code (versions 1 à 10, niveau M), écrit d'après la norme, sans rien partager avec l'encodeur ── */
const TOTAL = [0, 26, 44, 70, 100, 134, 172, 196, 242, 292, 346];
const ECC = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
const BLOCKS = [null, [[1, 16]], [[1, 28]], [[1, 44]], [[2, 32]], [[2, 43]], [[4, 27]], [[4, 31]], [[2, 38], [2, 39]], [[3, 36], [2, 37]], [[4, 43], [1, 44]]];
const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];
const MASKS = [(i, j) => (i + j) % 2 === 0, i => i % 2 === 0, (i, j) => j % 3 === 0, (i, j) => (i + j) % 3 === 0, (i, j) => (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0, (i, j) => (i * j) % 2 + (i * j) % 3 === 0, (i, j) => ((i * j) % 2 + (i * j) % 3) % 2 === 0, (i, j) => ((i + j) % 2 + (i * j) % 3) % 2 === 0];
const EXP = new Array(512), LOG = new Array(256); { let x = 1; for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; } for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]; }
const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);
function qrDecode(M) {
    const n = M.length, ver = (n - 17) / 4;
    if (!Number.isInteger(ver) || ver < 1 || ver > 10) throw new Error('taille ' + n);
    // les trois repères (7 × 7, centre plein 3 × 3)
    for (const [x0, y0] of [[0, 0], [n - 7, 0], [0, n - 7]]) for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) { const d = Math.max(Math.abs(x - 3), Math.abs(y - 3)); if (M[y0 + y][x0 + x] !== (d !== 2 ? 1 : 0)) throw new Error('repère abîmé'); }
    // le format : niveau de correction et masque (BCH : on prend le code valide le plus proche ; il doit être exact)
    let fb = 0; for (let i = 0; i <= 5; i++) fb |= M[i][8] << i; fb |= M[7][8] << 6; fb |= M[8][8] << 7; fb |= M[8][7] << 8; for (let i = 9; i < 15; i++) fb |= M[8][14 - i] << i;
    let best = null; for (let d = 0; d < 32; d++) { let r = d; for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >> 9) * 0x537); const code = ((d << 10) | r) ^ 0x5412; let x = code ^ fb, h = 0; while (x) { h += x & 1; x >>= 1; } if (!best || h < best.h) best = { d, h }; }
    if (best.h) throw new Error('format abîmé');
    const ecl = best.d >> 3, mask = best.d & 7; if (ecl !== 0) throw new Error('pas le niveau M');
    // les modules réservés
    const F = Array.from({ length: n }, () => new Array(n).fill(false)), area = (x0, y0, w, h) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) F[y][x] = true; };
    area(0, 0, 9, 9); area(n - 8, 0, 8, 9); area(0, n - 8, 9, 8); for (let i = 0; i < n; i++) { F[6][i] = true; F[i][6] = true; }
    const al = ALIGN[ver]; for (const ay of al) for (const ax of al) { if ((ax === 6 && ay === 6) || (ax === 6 && ay === al[al.length - 1]) || (ay === 6 && ax === al[al.length - 1])) continue; area(ax - 2, ay - 2, 5, 5); }
    if (ver >= 7) { area(n - 11, 0, 3, 6); area(0, n - 11, 6, 3); }
    // les octets, en zigzag, démasqués
    const bits = [];
    for (let right = n - 1; right >= 1; right -= 2) { if (right === 6) right = 5; const up = ((n - 1 - right) >> 1) % 2 === 0;
        for (let k = 0; k < n; k++) { const y = up ? n - 1 - k : k; for (const x of [right, right - 1]) { if (F[y][x]) continue; bits.push(M[y][x] ^ (MASKS[mask](y, x) ? 1 : 0)); } } }
    const words = []; for (let i = 0; i < TOTAL[ver]; i++) { let b = 0; for (let k = 0; k < 8; k++) b = (b << 1) | bits[i * 8 + k]; words.push(b); }
    // blocs désentrelacés, Reed-Solomon vérifié (syndromes nuls)
    const blocks = []; BLOCKS[ver].forEach(([cnt, len]) => { for (let i = 0; i < cnt; i++) blocks.push({ len, data: [], ecc: [] }); });
    let p = 0; const maxLen = Math.max(...blocks.map(b => b.len));
    for (let i = 0; i < maxLen; i++) for (const b of blocks) if (i < b.len) b.data.push(words[p++]);
    for (let i = 0; i < ECC[ver]; i++) for (const b of blocks) b.ecc.push(words[p++]);
    for (const b of blocks) { const cw = [...b.data, ...b.ecc]; for (let j = 0; j < ECC[ver]; j++) { let s = 0; for (const c of cw) s = mul(s, EXP[j]) ^ c; if (s) throw new Error('Reed-Solomon faux'); } }
    const data = blocks.flatMap(b => b.data), db = []; data.forEach(b => { for (let k = 7; k >= 0; k--) db.push((b >> k) & 1); });
    const read = (from, len) => { let v = 0; for (let i = 0; i < len; i++) v = (v << 1) | db[from + i]; return v; };
    if (read(0, 4) !== 4) throw new Error('pas le mode octets');
    const cl = ver < 10 ? 8 : 16, count = read(4, cl), bytes = []; for (let i = 0; i < count; i++) bytes.push(read(4 + cl + i * 8, 8));
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bytes)), version: ver, mask };
}
/** Les modules d'un QR code d'après son dessin SVG (un tracé de rectangles « Mx,yhWv1h-Wz ») */
function svgModules(svg) {
    const vb = /viewBox="0 0 (\d+) (\d+)"/.exec(svg); if (!vb) throw new Error('pas de viewBox');
    const N = Number(vb[1]), d = /<path d="([^"]*)"/.exec(svg)[1], M = Array.from({ length: N }, () => new Array(N).fill(0));
    for (const m of d.matchAll(/M(\d+),(\d+)h(\d+)v1h-?\d+z/g)) { const x = +m[1], y = +m[2], w = +m[3]; for (let k = 0; k < w; k++) M[y][x + k] = 1; }
    let z = 0; while (z < N && M.every(r => !r[z]) && M[z].every(v => !v)) z++; // la marge blanche
    return { quiet: z, M: M.slice(z, N - z).map(r => r.slice(z, N - z)) };
}

(async () => {
    const out = {}, errors = [];
    // ── 1. l'encodeur seul (dans Node) ──
    const sandbox = { window: {}, TextEncoder }; vm.createContext(sandbox); vm.runInContext(fs.readFileSync(path.join(appRoot, 'assets/js/heritage-qr.js'), 'utf8'), sandbox);
    const qr = sandbox.window.LCNDA_EXT.qr;
    const samples = ['A', 'Bonjour', 'https://www.geneanet.org/fonds/individus/?nom=MARTIN&prenom=Jean', 'Jean MARTIN — ° 1802 Tours, † 1871 Amboise — réf. 12', 'é'.repeat(60), 'x'.repeat(100), 'y'.repeat(150), 'z'.repeat(213)];
    out.enc = samples.map(t => { try { const s = qr.svg(t, { quiet: 4 }), m = svgModules(s.svg), r = qrDecode(m.M); return { ok: r.text === t, v: r.version, quiet: m.quiet }; } catch (e) { return { ok: false, err: e.message }; } });
    out.masks = [0, 1, 2, 3, 4, 5, 6, 7].map(k => { const q = qr.encode('Masque ' + k, { mask: k }); return qrDecode(q.modules.map(r => r.map(v => (v ? 1 : 0)))).mask === k; });
    try { qr.encode('w'.repeat(214)); out.tooLong = 'accepté'; } catch (e) { out.tooLong = e.message; }

    // ── 2. la base de test : une famille sur trois générations ──
    {
        const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; $pdo = db();
$people = [[1,'Jean','Martin','male',1,'charpentier'],[2,'Pierre','Martin','male',0,'laboureur'],[3,'Marie','Durand','female',0,''],[4,'Louis','Martin','male',0,'tisserand'],[5,'Anne','Petit','female',0,''],[6,'Jacques','Durand','male',0,'meunier'],[7,'Rose','Leroy','female',0,''],[8,'Paul','Martin','male',0,'']];
foreach ($people as [$id,$f,$l,$g,$s,$o]) $pdo->prepare('INSERT INTO persons(id,first_name,last_name,gender,is_start,occupation,living_status) VALUES(?,?,?,?,?,?,?)')->execute([$id,$f,$l,$g,$s,$o,'deceased']);
$fam = function ($a, $b, $kids) use ($pdo) { $pdo->prepare('INSERT INTO families(partner1_id,partner2_id) VALUES(?,?)')->execute([$a,$b]); $f = (int) $pdo->lastInsertId(); foreach ($kids as $k => $c) $pdo->prepare('INSERT INTO family_children(family_id,child_id,position) VALUES(?,?,?)')->execute([$f,$c,$k]); };
$fam(2,3,[1,8]); $fam(4,5,[2]); $fam(6,7,[3]);
$pdo->exec("INSERT INTO places(id,name,country) VALUES(1,'Tours','France'),(2,'Amboise','France')");
$birt = (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='BIRT'")->fetchColumn(); $deat = (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='DEAT'")->fetchColumn();
foreach ([[1,1890,1,1960,2],[2,1860,1,1931,1],[3,1862,2,1940,2],[4,1830,1,1899,1],[5,1835,1,1901,1],[6,1828,2,1890,2],[7,1833,2,1902,2],[8,1893,1,1970,1]] as [$id,$by,$bp,$dy,$dp]) {
    $pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,date_text,year,place_id) VALUES('person',?,?,?,?,?)")->execute([$id,$birt,"12 mars $by",$by,$bp]);
    $pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,date_text,year,place_id) VALUES('person',?,?,?,?,?)")->execute([$id,$deat,(string) $dy,$dy,$dp]); }
$img = imagecreatetruecolor(60, 80); imagefill($img, 0, 0, imagecolorallocate($img, 150, 110, 90)); imagejpeg($img, MEDIA_DIR . '/jean.jpg'); imagejpeg($img, MEDIA_DIR . '/pierre.jpg'); imagejpeg($img, MEDIA_DIR . '/noce.jpg');
$pdo->exec("INSERT INTO media(id,title,media_type,filename,thumbnail) VALUES(1,'Jean en 1920','image','jean.jpg','jean.jpg'),(2,'Pierre','image','pierre.jpg','pierre.jpg'),(3,'La noce','image','noce.jpg','noce.jpg')");
$pdo->exec("INSERT INTO media_links(media_id,entity_type,entity_id,position) VALUES(1,'person',1,1),(3,'person',1,2),(2,'person',2,1),(3,'person',2,2)");
$pdo->exec("UPDATE persons SET portrait_media_id=1 WHERE id=1"); $pdo->exec("UPDATE persons SET portrait_media_id=2 WHERE id=2");
$pdo->exec("INSERT INTO labels(id,name) VALUES(1,'Cousinade 2026')"); $pdo->exec("INSERT INTO label_links(label_id,entity_type,entity_id) VALUES(1,'person',1),(1,'person',8),(1,'person',6)");
$pdo->exec("INSERT INTO person_online_sheets(person_id,label,site,url) VALUES(2,'Arbre de Pierre','Geneanet','https://gw.geneanet.org/exemple?n=martin&p=pierre')");
echo 'ok';`], { cwd: appRoot, encoding: 'utf8', env: envFor(tmp) });
        if (r.status !== 0 || !/ok$/.test(r.stdout)) { console.error(r.stderr || r.stdout); done(1); }
    }

    // ── 3. le navigateur ──
    let pw = null; for (const p of ['playwright', '/opt/node-tools/node_modules/playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
    let srv = null, browser = null;
    if (!pw) out.browser = 'sauté (Playwright absent)';
    else try {
        const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
        srv = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env: envFor(tmp), stdio: 'ignore' });
        const base = `http://127.0.0.1:${port}/`;
        for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
        const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
        browser = await pw.chromium.launch(fs.existsSync(exe) ? { executablePath: exe } : {}).catch(() => pw.chromium.launch());
        const page = await (await browser.newContext({ viewport: { width: 1400, height: 950 } })).newPage();
        page.on('pageerror', e => errors.push(String(e.message)));
        page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(m.text()); });
        page.on('dialog', d => { errors.push('dialogue natif : ' + d.message()); d.dismiss(); });
        await page.goto(base);
        await page.waitForFunction(() => window.LCNDA_EXT?.layoutTemplates && window.LCNDA_EXT?.qr && window.LCNDA_EXT?.openDialog && window.LCNDA_APP?.state?.bootstrap, null, { timeout: 30000 });
        // les données du publipostage : les nouveaux champs, une étiquette, une liste
        out.data = await page.evaluate(async () => {
            const api = (a, q) => window.LCNDA_APP.api(a, q), base = { photo_count: '1', event_count: '0', sections: 'people', parts: 'bio,family,photos' };
            const anc = await api('layout_family_data', { ...base, scope: 'ancestors', root_id: '1', generations: '3' });
            const lab = await api('layout_family_data', { ...base, scope: 'all', label_id: '1' });
            const list = await api('layout_family_data', { ...base, scope: 'all', ids: '4,7' });
            const j = anc.persons.find(p => p.id === 1), pi = anc.persons.find(p => p.id === 2);
            return { n: anc.persons.length, jean: { birth_place: j.birth_place, death_place: j.death_place, occupation: j.occupation, sosa: j.sosa, portrait_full: j.portrait_full, portrait_id: j.portrait_id }, pierreSosa: pi.sosa, label: lab.persons.map(p => p.id).sort(), list: list.persons.map(p => p.id).sort() };
        });
        // 📚 les cinq livres prêts à l'emploi
        out.tpl = await page.evaluate(async () => {
            const T = window.LCNDA_EXT.layoutTemplates, K = window.LCNDA_EXT.layoutKit, th = K.THEMES[0], R = {};
            for (const [k] of T.list) {
                try { const doc = await T.build(k, { root: k === 'cousinade' ? 4 : k === 'chronicle' ? 2 : 1, th, gens: 3, photosOf: 'family' });
                    const items = doc.pages.flatMap(p => p.items);
                    R[k] = { pages: doc.pages.length, title: doc.title, dyn: [...new Set(items.filter(i => i.dyn).map(i => i.dyn.id))].sort(), trees: items.filter(i => i.tree).map(i => ({ w: i.w, x: i.x })), photos: items.filter(i => i.type === 'frame' && i.mediaId).length, pageW: doc.page.w, facing: doc.page.facing,
                        clean: JSON.stringify(K.cleanDoc(doc)).length > 100, text: items.filter(i => i.type === 'text').map(i => i.html.replace(/<[^>]+>/g, ' ')).join(' ').slice(0, 4000) };
                } catch (e) { R[k] = { error: e.message }; }
            }
            return R;
        });
        // 📚 depuis l'atelier : la carte « Biographie d'un ancêtre », la fenêtre, le livre ouvert
        await page.evaluate(() => window.LCNDA_EXT.openLayoutStudio());
        await page.waitForSelector('dialog.ly-lib [data-tpl="bio"]');
        out.libCards = await page.$$eval('dialog.ly-lib [data-tpl]', l => l.map(b => b.dataset.tpl));
        await page.click('dialog.ly-lib [data-tpl="bio"]');
        await page.waitForSelector('dialog .ly-tplpick');
        await page.click('dialog:has(.ly-tplpick) button[type=submit]');
        await page.waitForSelector('dialog.ly-editor', { timeout: 30000 });
        await page.waitForTimeout(600);
        out.bioEditor = await page.evaluate(() => ({ total: document.querySelector('dialog.ly-editor [data-ly-total]')?.textContent, name: document.querySelector('dialog.ly-editor [data-ly-name]')?.value }));
        // ▦ un QR code vers une adresse web
        const cmd = k => page.evaluate(k => document.querySelector(`dialog.ly-editor [data-ly-cmd="${k}"]`).click(), k);
        await cmd('next'); await page.waitForTimeout(200); // pas sur la couverture : une page du livre
        await cmd('qr');
        await page.waitForSelector('dialog .ly-qrdlg');
        await page.check('dialog:has(.ly-qrdlg) input[name=qkind][value=url]');
        await page.fill('dialog:has(.ly-qrdlg) [name=qurl]', 'https://exemple.org/famille/martin?p=jean');
        await page.fill('dialog:has(.ly-qrdlg) [name=qdark]', '#1a3c6e').catch(() => page.evaluate(() => { const i = document.querySelector('dialog:has(.ly-qrdlg) [name=qdark]'); i.value = '#1a3c6e'; i.dispatchEvent(new Event('input', { bubbles: true })); }));
        out.qrInfo = await page.textContent('dialog:has(.ly-qrdlg) [data-qinfo]');
        await page.click('dialog:has(.ly-qrdlg) button[type=submit]');
        await page.waitForTimeout(400);
        const qrItems = () => page.evaluate(() => [...document.querySelectorAll('dialog.ly-editor .ly-board .ly-item.ly-frame image')].map(i => i.getAttribute('href')).filter(h => h.startsWith('data:image/svg+xml')).map(h => decodeURIComponent(escape(atob(h.split(',')[1])))).filter(s => s.includes('crispEdges')));
        out.qrUrl = await qrItems();
        // ▦ un QR code vers la fiche en ligne de Pierre (fiches en ligne de sa fiche)
        await cmd('qr');
        await page.waitForSelector('dialog .ly-qrdlg');
        await page.check('dialog:has(.ly-qrdlg) input[name=qkind][value=person]');
        await page.evaluate(() => { const dg = document.querySelector('dialog:has(.ly-qrdlg)'), h = dg.querySelector('input[type=hidden][name=ly_qrp]'); if (h) h.value = '2'; dg.querySelector('[data-q=person]').dispatchEvent(new CustomEvent('cp-pick', { bubbles: true, detail: { id: 2, field: 'ly_qrp', name: 'Pierre Martin' } })); });
        await page.waitForFunction(() => [...document.querySelectorAll('dialog:has(.ly-qrdlg) [name=qchoice] option')].length >= 2);
        if (process.env.LY_SHOTS) await page.screenshot({ path: path.join(process.env.LY_SHOTS, 'layout-qr.png') });
        out.qrChoices = await page.$$eval('dialog:has(.ly-qrdlg) [name=qchoice] option', l => l.map(o => o.value));
        await page.click('dialog:has(.ly-qrdlg) button[type=submit]');
        await page.waitForTimeout(400);
        out.qrPerson = await qrItems();
        out.qrDoc = await page.evaluate(() => { const l = [...document.querySelectorAll('dialog.ly-editor .ly-board .ly-item.ly-frame')]; return l.length; });
        // ⤓ le HTML et l'ePub exportés gardent les QR codes (images SVG nettes)
        out.exports = await page.evaluate(async () => {
            const K = window.LCNDA_EXT.layoutKit; // le document tel qu'enregistré : on le relit par « Enregistrer » puis l'API
            document.querySelector('dialog.ly-editor [data-ly-cmd="save"]').click();
            for (let i = 0; i < 60 && !/Enregistr/.test(document.querySelector('dialog.ly-editor [data-ly-state]')?.textContent || ''); i++) await new Promise(r => setTimeout(r, 100));
            await new Promise(r => setTimeout(r, 400));
            const docs = (await window.LCNDA_APP.api('layout_docs')).docs, r = await window.LCNDA_APP.api('layout_doc', { id: docs[0].id });
            const qrs = r.doc.pages.flatMap(p => p.items).filter(i => i.qr);
            const html = K.printHtml(r.doc, r.name, false), epub = await K.buildEpub(r.doc, r.name);
            const bytes = new Uint8Array(await epub.arrayBuffer()); let names = ''; for (let i = 0; i + 30 < bytes.length; i++) if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 3 && bytes[i + 3] === 4) { const n = bytes[i + 26] | (bytes[i + 27] << 8); names += new TextDecoder().decode(bytes.slice(i + 30, i + 30 + n)) + '|'; }
            return { saved: qrs.length, kinds: qrs.map(q => q.qr.kind), html: (html.match(/href="data:image\/svg\+xml;base64,/g) || []).length, epubSvg: (names.match(/\.svg\|/g) || []).length, names };
        });
        // 📨 publipostage : la page modèle, le compte annoncé, les pages, ↶
        out.pagesBefore = Number(await page.textContent('dialog.ly-editor [data-ly-total]'));
        await cmd('mergesample');
        await page.waitForTimeout(300);
        out.pagesSample = Number(await page.textContent('dialog.ly-editor [data-ly-total]'));
        await cmd('merge');
        await page.waitForSelector('dialog [data-mcount]');
        await page.fill('dialog:has([data-mcount]) [name=mgens]', '3');
        await page.waitForFunction(() => /seront créées/.test(document.querySelector('[data-mcount]')?.textContent || ''), null, { timeout: 10000 });
        out.mergeFound = await page.textContent('dialog:has([data-mcount]) [data-mfound]');
        out.mergeCount = await page.textContent('dialog:has([data-mcount]) [data-mcount]');
        await page.click('dialog:has([data-mcount]) button[type=submit]');
        await page.waitForTimeout(800);
        out.pagesMerged = Number(await page.textContent('dialog.ly-editor [data-ly-total]'));
        if (process.env.LY_SHOTS) await page.screenshot({ path: path.join(process.env.LY_SHOTS, 'layout-merge.png') });
        out.mergedPage = await page.evaluate(() => { const pg = document.querySelector('dialog.ly-editor .ly-page[data-page]:not(.is-master)'); const cur = document.querySelector('dialog.ly-editor [data-ly-goto]').value; const el = document.querySelector(`dialog.ly-editor .ly-page[data-page="${Number(cur) - 1}"]`) || pg; return { text: el.textContent.replace(/\s+/g, ' '), img: [...el.querySelectorAll('image')].map(i => i.getAttribute('href')) }; });
        // une étiquette (3 fiches)
        await cmd('merge');
        await page.waitForSelector('dialog [data-mcount]');
        await page.selectOption('dialog:has([data-mcount]) [name=mscope]', 'label');
        await page.waitForFunction(() => document.querySelector('dialog:has([data-mcount]) [name=mlabel] option[value="1"]'));
        await page.selectOption('dialog:has([data-mcount]) [name=mlabel]', '1');
        await page.waitForFunction(() => /3 pages seront créées/.test(document.querySelector('[data-mcount]')?.textContent || ''), null, { timeout: 10000 });
        out.labelCount = await page.textContent('dialog:has([data-mcount]) [data-mcount]');
        await page.click('dialog:has([data-mcount]) [data-h-close]');
        // ↶ défait le publipostage d'un coup
        await page.click('dialog.ly-editor .ly-hbtn[data-ly-cmd="undo"]');
        await page.waitForTimeout(300);
        out.pagesUndo = Number(await page.textContent('dialog.ly-editor [data-ly-total]'));
        await page.click('dialog.ly-editor .ly-hbtn[data-ly-cmd="redo"]');
        await page.waitForTimeout(300);
        out.pagesRedo = Number(await page.textContent('dialog.ly-editor [data-ly-total]'));
    } catch (e) { errors.push('test : ' + (e.stack || e.message)); }
    finally { await browser?.close(); srv?.kill(); }

    const near = (a, b, t) => Math.abs(a - b) <= t;
    const T = out.tpl || {};
    const checks = [
        ['▦ encodeur : 8 textes (1 à 213 octets, accents) relus à l’identique, Reed-Solomon juste, marge de 4 modules', () => { out.enc.forEach((r, i) => assert.ok(r.ok && r.quiet === 4, `${i} ${JSON.stringify(r)}`)); assert.deepEqual(out.enc.map(r => r.v), [1, 1, 5, 4, 7, 6, 8, 10]); }],
        ['▦ les 8 masques se relisent', () => assert.ok(out.masks.every(Boolean), String(out.masks))],
        ['▦ trop long : refusé avec un message clair', () => assert.match(out.tooLong, /213 caractères/)],
    ];
    if (out.browser) console.log('  – navigateur :', out.browser);
    else checks.push(
        ['📨 données : lieux, métier, Sosa, portrait en grand ; filtres étiquette et liste', () => { const d = out.data; assert.equal(d.n, 7); assert.deepEqual(d.jean, { birth_place: 'Tours', death_place: 'Amboise', occupation: 'charpentier', sosa: '1', portrait_full: 'jean.jpg', portrait_id: 1 }); assert.equal(d.pierreSosa, '2'); assert.deepEqual(d.label, [1, 6, 8]); assert.deepEqual(d.list, [4, 7]); }],
        ['📚 biographie : couverture, portrait, frise, sa vie, sources ; textes liés à la fiche', () => { const b = T.bio; assert.ok(!b.error, b.error); assert.ok(b.pages >= 5, String(b.pages)); assert.deepEqual(b.dyn, [1]); assert.match(b.title, /Vie de Jean Martin/); assert.match(b.text, /Repères/); assert.match(b.text, /Naissance/); assert.match(b.text, /Sources/); assert.ok(b.photos >= 1); }],
        ['📚 arbre en double page : vis-à-vis, l’arbre passe d’une page à l’autre', () => { const t = T.tree2; assert.ok(!t.error, t.error); assert.equal(t.facing, true); assert.equal(t.trees.length, 2); assert.ok(t.trees[0].w > t.pageW, JSON.stringify(t.trees)); assert.ok(t.trees[1].x < 0 && near(t.trees[0].x - t.trees[1].x, t.pageW, 0.2), JSON.stringify(t.trees)); }],
        ['📚 galerie : les photos de la famille, chacune une fois, liées aux médias', () => { const g = T.gallery; assert.ok(!g.error, g.error); assert.equal(g.photos, 3); }],
        ['📚 livret de famille : les époux et les enfants (textes liés), la chronique', () => { const c = T.chronicle; assert.ok(!c.error, c.error); assert.deepEqual(c.dyn, [1, 2, 3, 8]); assert.match(c.text, /Chronique de la famille/); assert.match(c.text, /Naissance/); }],
        ['📚 cousinade : l’ancêtre, son arbre, les branches, qui est qui, souvenirs', () => { const c = T.cousinade; assert.ok(!c.error, c.error); assert.ok(c.trees.length === 1); assert.match(c.text, /Notre ancêtre commun/); assert.match(c.text, /Branche 1\.1/); assert.match(c.text, /Qui est qui/); assert.match(c.text, /Autographes/); assert.match(c.text, /Jean MARTIN|MARTIN Jean|Jean Martin/i); }],
        ['📚 atelier : les cinq cartes, « Biographie » ouvre un livre rempli', () => { assert.deepEqual(out.libCards, ['bio', 'tree2', 'gallery', 'chronicle', 'cousinade']); assert.ok(Number(out.bioEditor.total) >= 5, JSON.stringify(out.bioEditor)); assert.match(out.bioEditor.name, /Vie de Jean Martin/); }],
        ['▦ atelier : QR code vers une adresse — aperçu, couleur, relu à l’identique', () => { assert.match(out.qrInfo, /version \d/); assert.equal(out.qrUrl.length, 1); assert.match(out.qrUrl[0], /fill="#1a3c6e"/); assert.equal(qrDecode(svgModules(out.qrUrl[0]).M).text, 'https://exemple.org/famille/martin?p=jean'); }],
        ['▦ atelier : QR code vers la fiche en ligne de Pierre (ou son identité en texte)', () => { assert.equal(out.qrChoices[0], 'https://gw.geneanet.org/exemple?n=martin&p=pierre'); assert.match(out.qrChoices[out.qrChoices.length - 1], /^Pierre Martin — ° 12 mars 1860 Tours/); const texts = out.qrPerson.map(s => qrDecode(svgModules(s).M).text); assert.ok(texts.includes('https://gw.geneanet.org/exemple?n=martin&p=pierre'), texts.join(' | ')); }],
        ['▦ export : QR codes enregistrés, dans le HTML (SVG intégré) et dans l’ePub (images SVG)', () => { const x = out.exports; assert.equal(x.saved, 2); assert.deepEqual(x.kinds.sort(), ['person', 'url']); assert.ok(x.html >= 2, JSON.stringify(x)); assert.ok(x.epubSvg >= 2, x.names); }],
        ['📨 page modèle posée, ses champs trouvés, 7 ancêtres annoncés', () => { assert.equal(out.pagesSample, out.pagesBefore + 1); assert.match(out.mergeFound, /\{prénom\}/); assert.match(out.mergeFound, /cadre \{portrait\}/); assert.match(out.mergeCount, /7 pages seront créées/); }],
        ['📨 une page par ancêtre : champs remplis, portrait posé', () => { assert.equal(out.pagesMerged, out.pagesSample + 7); assert.match(out.mergedPage.text, /Jean Martin/); assert.match(out.mergedPage.text, /Tours/); assert.match(out.mergedPage.text, /charpentier/); assert.ok(!/\{prénom\}|\{lieu de naissance\}/.test(out.mergedPage.text), out.mergedPage.text.slice(0, 300)); assert.ok(out.mergedPage.img.includes('media/jean.jpg'), out.mergedPage.img.join()); }],
        ['📨 une étiquette : 3 pages annoncées', () => assert.match(out.labelCount, /3 pages seront créées/)],
        ['📨 ↶ défait tout le publipostage d’un coup, ↷ le refait', () => { assert.equal(out.pagesUndo, out.pagesSample); assert.equal(out.pagesRedo, out.pagesMerged); }],
        ['aucune erreur JavaScript, aucun dialogue natif', () => assert.deepEqual(errors, [])],
    );
    let failed = 0;
    for (const [name, fn] of checks) { try { fn(); console.log('  ✓', name); } catch (e) { failed++; console.log('  ✗', name, '\n   ', String(e.message).slice(0, 700)); } }
    if (errors.length && out.browser) console.log(errors);
    console.log(failed ? `${failed} échec(s)` : `${checks.length} vérifications réussies`);
    done(failed ? 1 : 0);
})().catch(e => { console.error(e); done(1); });
void zlib;
