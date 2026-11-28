'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🔎 Enquête photo (maquette validée docs/design/enquete-photo.html) :
 *   node tests/test-enquete-photo.js            (SHOTS=dossier pour garder des captures, DEBUG=1 pour les réponses HTTP en erreur)
 *  1. Sans navigateur (app-enquete-photo-core.js) : ☀️ calcul d'ombre (lat 45,16, soleil à 44° : possible à midi à l'équinoxe,
 *     impossible en décembre et janvier ; le 14 juillet vers 8 h 45, soleil à l'est-sud-est, la photo regarde vers le sud),
 *     comparé au calcul de Meeus de l'app (app-lune-core.js) ; EXIF d'un petit JPEG fait ici ; la frise ; « Supposé » au plus pour l'IA.
 *  2. Navigateur : le bouton « 🔎 Enquêter » sur la page d'un document (à côté de l'Atelier), puis « Enquête · N indices » ;
 *     une enquête avec 2 images (A, B, côte à côte) ; ◯ entourer → un indice numéroté sur son calque (gardé) ; un indice avec sa
 *     certitude ; « 📍 Mettre ce lieu sur la photo » puis ↶ Annuler ; 🔤 essayer une police (posée sur la photo, note, « Supposé »
 *     au plus, « Probable » seulement confirmé par un autre indice) ; 🤖 IA (faux Ollama) : une réponse sans cadre ou qui nomme
 *     quelqu'un est jetée ; 🌐 comparer en ligne bloqué pour une personne vivante ; ✂ Séparer + ↶ Annuler ; supprimer + ↶ Annuler ;
 *     mode consultation : lecture seule ; 390 px : rien ne déborde ; aucune erreur JS.
 * Noms inventés (MAZAUD, LACOMBE, DURAND).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const http = require('node:http');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
let chromium = null;
try { ({ chromium } = require('playwright')); } catch (_) { try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); } catch (__) { chromium = null; } }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const C = require('../assets/js/app-enquete-photo-core.js');
const L = require('../assets/js/app-lune-core.js');

/** un tout petit JPEG avec un bloc EXIF (marque, modèle, date de prise de vue, GPS) */
function jpegWithExif() {
    const ascii = s => Buffer.from(s + '\0', 'latin1');
    const entries = [], data = [];
    const tiff = []; // construit en petit-boutiste
    const u16 = v => { const b = Buffer.alloc(2); b.writeUInt16LE(v); return b; }, u32 = v => { const b = Buffer.alloc(4); b.writeUInt32LE(v); return b; };
    const make = ascii('FICTIF'), model = ascii('Boîtier 1'.normalize('NFD').replace(/[̀-ͯ]/g, '')), date = ascii('1987:07:14 10:12:00');
    // IFD0 à 8 : 4 entrées (Make, Model, ExifIFD, GPSIFD) ; puis l'IFD Exif ; puis l'IFD GPS ; puis les valeurs
    const ifd0 = 8, n0 = 4, ifdExif = ifd0 + 2 + n0 * 12 + 4, nE = 1, ifdGps = ifdExif + 2 + nE * 12 + 4, nG = 4, vals = ifdGps + 2 + nG * 12 + 4;
    let vo = vals; const put = buf => { const at = vo; data.push(buf); vo += buf.length; return at; };
    const ent = (tag, type, count, valueOrOffset) => Buffer.concat([u16(tag), u16(type), u32(count), u32(valueOrOffset)]);
    const makeAt = put(make), modelAt = put(model), dateAt = put(date);
    const rat = (...pairs) => Buffer.concat(pairs.map(([a, b]) => Buffer.concat([u32(a), u32(b)])));
    const latAt = put(rat([45, 1], [9, 1], [3600, 100])), lonAt = put(rat([1, 1], [31, 1], [4800, 100]));
    tiff.push(Buffer.from('II*\0', 'latin1'), u32(ifd0));
    tiff.push(u16(n0), ent(0x010F, 2, make.length, makeAt), ent(0x0110, 2, model.length, modelAt), ent(0x8769, 4, 1, ifdExif), ent(0x8825, 4, 1, ifdGps), u32(0));
    tiff.push(u16(nE), ent(0x9003, 2, date.length, dateAt), u32(0));
    const lat = Buffer.concat([u16(1), u16(2), u32(2), Buffer.from('N\0\0\0', 'latin1')]), lon = Buffer.concat([u16(3), u16(2), u32(2), Buffer.from('E\0\0\0', 'latin1')]);
    tiff.push(u16(nG), lat, ent(2, 5, 3, latAt), lon, ent(4, 5, 3, lonAt), u32(0));
    const t = Buffer.concat([...tiff, ...data]);
    const app1 = Buffer.concat([Buffer.from([0xFF, 0xE1]), (() => { const b = Buffer.alloc(2); b.writeUInt16BE(t.length + 8); return b; })(), Buffer.from('Exif\0\0', 'latin1'), t]);
    return Buffer.concat([Buffer.from([0xFF, 0xD8]), app1, Buffer.from([0xFF, 0xD9])]);
}

async function browserPart(out) {
    const phpPath = findPhp([devBundledPhp()]);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-ep-'));
    const dir = path.join(tmp, 'data'); fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
    const env = { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4', GENEALOGY_TEST: '1' };
    const php = code => { const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], { cwd: appRoot, encoding: 'utf8', env }); if (r.status !== 0) throw new Error(r.stderr || r.stdout); return r.stdout; };
    const seed = JSON.parse(php(String.raw`require 'lib/paths.php'; $p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start) VALUES(1,'Jean','MAZAUD','male','deceased',1),(2,'Marie','LACOMBE','female','living',0),(3,'Paul','DURAND','male','deceased',0)");
$pdo->exec("INSERT INTO places(id,name,country,latitude,longitude) VALUES(1,'Brive-la-Gaillarde','France',45.16,1.53),(2,'Tulle','France',45.27,1.77)");
$pic = function (string $f, array $rgb) { $im = imagecreatetruecolor(800, 520); imagefill($im, 0, 0, imagecolorallocate($im, ...$rgb)); $ink = imagecolorallocate($im, 70, 50, 30);
    imagefilledrectangle($im, 600, 120, 680, 420, $ink); imagefilledrectangle($im, 80, 200, 460, 420, $ink); imagestring($im, 5, 120, 210, 'HOTEL DE LA POSTE', imagecolorallocate($im, 240, 230, 200)); imagepng($im, MEDIA_DIR . '/' . $f); };
$pic('img004.png', [225, 210, 180]); $pic('img011.png', [210, 200, 175]); $pic('img020.png', [200, 210, 220]);
file_put_contents(MEDIA_DIR . '/exif.jpg', base64_decode(getenv('EXIF_JPG')));
$ins = $pdo->prepare("INSERT INTO media(title, media_type, filename, thumbnail) VALUES(?, 'image', ?, ?)");
$m = []; foreach (['img004.png' => 'Carte postale, vers 1910', 'img011.png' => 'Même clocher, autre angle', 'img020.png' => 'Marie à la plage', 'exif.jpg' => 'Photo numérique'] as $f => $t) { $ins->execute([$t, $f, $f]); $m[$f] = (int) $pdo->lastInsertId(); }
$pdo->prepare("INSERT INTO media_tags(media_id, person_id, x, y, w, h) VALUES(?, 2, 40, 20, 15, 20)")->execute([$m['img020.png']]);
// 👤 deux tirages identiques (même empreinte pour le faux moteur de visages) ; sur le premier, Paul DURAND identifié à la main
$pic('face-a.png', [120, 140, 160]); copy(MEDIA_DIR . '/face-a.png', MEDIA_DIR . '/face-b.png');
foreach (['face-a.png' => 'Paul, photo identifiée', 'face-b.png' => 'Un inconnu au chapeau'] as $f => $t) { $ins->execute([$t, $f, $f]); $m[$f] = (int) $pdo->lastInsertId(); }
$pdo->prepare("INSERT INTO media_tags(media_id, person_id, x, y, w, h) VALUES(?, 3, 10, 20, 18, 24)")->execute([$m['face-a.png']]);
// 👪 « qui pourrait-ce être ? » : Pierre MAZAUD né à Brive en 1904 ; Louise DURAND morte en 1900 ; Paul DURAND (1902-1970)
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status) VALUES(4,'Pierre','MAZAUD','male','deceased'),(5,'Louise','DURAND','female','deceased')");
$tag = function ($t) use ($pdo) { $s = $pdo->prepare('SELECT id FROM event_types WHERE gedcom_tag=? ORDER BY id LIMIT 1'); $s->execute([$t]); return (int) $s->fetchColumn(); };
$ev = $pdo->prepare("INSERT INTO events(scope, person_id, event_type_id, year, date_text, place_id) VALUES('person',?,?,?,?,?)");
foreach ([[4, 'BIRT', 1904, 1], [4, 'DEAT', 1980, 2], [5, 'BIRT', 1850, 2], [5, 'DEAT', 1900, 2], [3, 'BIRT', 1902, 2], [3, 'DEAT', 1970, 2]] as [$pid, $t, $y, $pl]) { $ev->execute([$pid, $tag($t), $y, (string) $y, $pl]); }
// la suite : 📅 Lucie DURAND baptisée le 14 juillet 1911 à Brive (ce jour-là, occasions) ; 👔 Paul DURAND, forgeron (tenues de métier)
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status) VALUES(6,'Lucie','DURAND','female','deceased')");
$ev->execute([6, $tag('CHR'), 1911, '14 JUL 1911', 1]); $ev->execute([3, $tag('OCCU'), 1925, '1925', 2]); $pdo->exec("UPDATE events SET description='Forgeron' WHERE id=" . (int) $pdo->lastInsertId());
// 🏗 🧭 une fiche d'édifice datée, un peu à l'est de Brive (≈ 0,8 km)
require_once 'lib/edifices.php'; ed_tables($pdo);
$pdo->exec("INSERT INTO sites(kind, name, place_id, lat, lon, built_from) VALUES('eglise', 'Gare de Brive', 1, 45.16, 1.54, 1860)");
echo json_encode(['m' => $m]);`.replace('getenv(\'EXIF_JPG\')', `'${jpegWithExif().toString('base64')}'`)));
    out.seed = seed;
    /* un faux Ollama : une observation avec cadre, une sans cadre, une qui nomme quelqu'un */
    const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const prompts = [];
    const fake = http.createServer((req, res) => { let body = ''; req.on('data', c => { body += c; }); req.on('end', () => {
        if (req.url === '/api/version') { res.end(JSON.stringify({ version: '0.12.0' })); return; }
        if (req.url === '/api/tags') { res.end(JSON.stringify({ models: [{ name: 'qwen3-vl:8b-instruct', size: 1 }] })); return; }
        if (req.url === '/api/chat') { try { const j = JSON.parse(body); prompts.push({ text: j.messages[0].content, images: (j.messages[0].images || []).length, format: j.format }); } catch (_) {}
            const content = JSON.stringify({ observations: [{ text: 'Un clocher avec un toit arrondi (bulbe), en haut à droite', box: [740, 220, 110, 600], clarity: 'nette' }, { text: 'Un grand bâtiment à trois fenêtres', clarity: 'nette' }, { text: 'C’est Monsieur MAZAUD devant l’hôtel', box: [100, 300, 100, 200] }], unknown: 'Je ne peux pas dire dans quelle ville c’est : aucun nom de lieu n’est lisible.' });
            res.end(JSON.stringify({ message: { role: 'assistant', content }, done: true })); return; }
        res.statusCode = 404; res.end('{}'); }); });
    const oport = await freePort(); await new Promise(r => fake.listen(oport, '127.0.0.1', r));
    const port = await freePort(), base = `http://127.0.0.1:${port}/`;
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env: { ...env, LCNDA_OLLAMA_URL: `http://127.0.0.1:${oport}` }, stdio: 'ignore' });
    const browser = await chromium.launch();
    try {
        for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
        const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        const p = await ctx.newPage(); const errs = [];
        p.on('pageerror', e => errs.push(e.message));
        p.on('response', r => { if (r.status() >= 400 && process.env.DEBUG) console.log('HTTP', r.status(), r.url().slice(0, 160)); });
        p.on('console', m => { if (m.type() === 'error' && process.env.DEBUG) console.log('console:', m.text()); });
        await p.addInitScript(() => { window.LCNDA_SHEET_LAZY_OFF = true; window.LCNDA_FACES_TEST = { engine: 'mock', ms: 30 }; });
        await p.goto(base);
        await p.waitForFunction(() => window.LCNDA_EXT?.enquetePhoto && window.LCNDA_EXT?.enquetePhotoAides && window.LCNDA_EXT?.enquetePhotoPlus && window.LCNDA_EP_CORE && window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.onglets?.documents, null, { timeout: 30000 });
        const api = (op, q = {}) => p.evaluate(([o, x]) => window.LCNDA_APP.api('ep', { op: o, ...x }), [op, q]);
        const post = (op, b = {}) => p.evaluate(([o, x]) => window.LCNDA_APP.api('ep_write', {}, { method: 'POST', body: { op: o, ...x } }).then(r => ({ ok: true, r }), e => ({ ok: false, error: e.message })), [op, b]);
        const shot = async n => { if (process.env.SHOTS) { fs.mkdirSync(process.env.SHOTS, { recursive: true }); await p.screenshot({ path: path.join(process.env.SHOTS, n) }); } };
        const D = 'dialog.ep-dlg';
        const undoClick = async () => { await sleep(150); const ok = await p.evaluate(() => { const b = [...document.querySelectorAll('.toast button, [class*="toast"] button')].reverse().find(x => /Annuler/.test(x.textContent)); b?.click(); return !!b; }); await sleep(500); return ok; };
        const m = seed.m;

        /* ═════ § 1 le bouton sur la page d'un document ═════ */
        await p.evaluate(id => { localStorage.setItem('genealogie-menu-documents', '1'); localStorage.setItem('genealogie-menu-hidden', '[]'); location.hash = '#documents/' + id; }, m['img004.png']);
        await p.waitForSelector('#workspace [data-ep-media]', { timeout: 20000 });
        out.button = await p.evaluate(() => { const b = document.querySelector('#workspace [data-ep-media]'), acts = [...document.querySelectorAll('#workspace .ui-ph-actions > button')].map(x => x.textContent.trim()), more = [...document.querySelectorAll('#workspace .ui-ph-actions .ui-ph-menu > *')].map(x => x.textContent.trim()); return { text: b.textContent.trim(), acts, more }; });
        out.ctxItem = await p.evaluate(() => { const img = document.querySelector('#workspace img[src*="media/"]'); const f = (window.LCNDA_UI.ctxExtras || []).find(x => x._ep); return f && img ? f({ target: img, clientX: 10, clientY: 10 }).map(i => i.label) : []; });
        out.sendTarget = await p.evaluate(() => (window.LCNDA_EXT.sendTargets || []).some(t => t.key === 'enquete-photo'));
        out.toolEntry = await p.evaluate(() => (window.LCNDA_EXT.editToolsExtra || []).some(t => t.key === 'enquete_photo'));

        /* ═════ § 2 bis une enquête avec 2 images ═════ */
        await p.click('#workspace [data-ep-media]');
        await p.waitForSelector(`${D} .ep-chip`, { timeout: 15000 }); await sleep(400);
        let inqId = await p.evaluate(() => window.LCNDA_EXT.enquetePhoto.current.inq.id);
        await p.evaluate(id => window.LCNDA_EXT.enquetePhoto.current.addImages([id]), m['img011.png']); await sleep(900);
        out.twoImages = await p.evaluate(d => ({ chips: [...document.querySelectorAll(`${d} .ep-chip:not(.ep-add) b`)].map(b => b.textContent), views: !!document.querySelector(`${d} .ep-views`) }), D);
        await p.click(`${D} [data-ep-view="side"]`); await sleep(500);
        out.side = await p.evaluate(d => document.querySelectorAll(`${d} .ep-stage .ep-view`).length, D);
        await p.click(`${D} [data-ep-view="one"]`); await sleep(400);

        /* ═════ § 2 calques : ◯ entourer → indice numéroté sur son calque ═════ */
        await p.click(`${D} [data-ep-tool="circle"]`);
        const box = await p.$eval(`${D} .ep-view.is-cur img.ep-photo`, e => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
        await p.mouse.move(box.x + box.w * 0.74, box.y + box.h * 0.2); await p.mouse.down(); await p.mouse.move(box.x + box.w * 0.86, box.y + box.h * 0.45, { steps: 6 }); await p.mouse.up();
        await p.waitForSelector('dialog.h-modal [name="text"]', { timeout: 5000 });
        await p.fill('dialog.h-modal [name="text"]', 'Clocher à bulbe');
        await p.click('dialog.h-modal [data-ep-cert="supposed"]');
        await p.click('dialog.h-modal button[type="submit"]'); await sleep(1300);
        const g1 = await api('get', { id: inqId });
        const im0 = g1.inquiry.images.find(i => i.media_id === m['img004.png']);
        out.layer = { layers: im0.layers.map(l => ({ name: l.name, n: l.shapes.length, t: l.shapes[0]?.t, clue: l.shapes[0]?.clue })), clues: g1.inquiry.clues.map(c => [c.num, c.text, c.certainty, c.shape_id ? 1 : 0]) };
        out.svgShape = await p.evaluate(d => document.querySelectorAll(`${d} svg.ep-svg .ep-shape.is-circle`).length, D);

        /* ═════ § 3 un indice avec sa certitude (texte lu, Prouvé), un autre « pas avant 1904 » ═════ */
        const c2 = await post('clue_save', { inquiry_id: inqId, kind: 'texte', text: 'Enseigne « HÔTEL DE LA POSTE »', certainty: 'proven', why: 'Texte lu sur l’image', images: { [im0.id]: 'yes' } });
        const c3 = await post('clue_save', { inquiry_id: inqId, kind: 'dos', text: 'Dos divisé', certainty: 'probable', date_from: 1904, images: { [im0.id]: 'yes' } });
        const c4 = await post('clue_save', { inquiry_id: inqId, kind: 'gens', text: 'Soldats en képi et capote', certainty: 'probable', date_to: 1915 });
        const ia = await post('clue_save', { inquiry_id: inqId, kind: 'lieu', text: 'Clocher à bulbe (vu par l’IA)', certainty: 'proven', source: 'ia' });
        out.cert = { proven: c2.r.clue.certainty, ia: ia.r.clue.certainty, from: c3.r.clue.date_from };
        await p.evaluate(() => window.LCNDA_EXT.enquetePhoto.current.reload()); await sleep(500);
        await p.click(`${D} [data-ep-panel="clues"]`); await sleep(300);
        out.clueList = await p.evaluate(d => [...document.querySelectorAll(`${d} .ep-clues .ep-clue`)].map(li => ({ t: li.querySelector('b').textContent, badge: li.querySelector('.ui-badge')?.textContent })), D);
        out.matrix = await p.evaluate(d => !!document.querySelector(`${d} .ep-mx`), D);

        /* ═════ § 3 conclusion : « 📍 Mettre ce lieu sur la photo » puis ↶ Annuler ═════ */
        await post('conclusion', { id: inqId, conclusion: { place: { place_id: 1, certainty: 'probable', why: 'Hôtel de la Poste' }, date: { text: 'entre 1905 et 1915', from: 1905, to: 1915, certainty: 'probable' } } });
        await p.evaluate(() => window.LCNDA_EXT.enquetePhoto.current.reload()); await sleep(400);
        await p.click(`${D} [data-ep-panel="questions"]`); await sleep(200);
        await p.evaluate(d => { const t = window.LCNDA_EXT.enquetePhoto.current; t.st.openQ = 'conclusion'; t.renderSide(); }, D); await sleep(500);
        await p.click(`${D} [data-ep-apply]`); await sleep(1500);
        const mediaRow = async id => p.evaluate(i => window.LCNDA_APP.api('onglets', { op: 'document', id: i }).then(r => ({ date: r.document.date_text, place: (r.document.places || [])[0]?.name || '' })), id);
        out.applied = await mediaRow(m['img004.png']);
        out.toastsApply = await p.evaluate(() => [...document.querySelectorAll('.toast, [class*="toast"]')].map(t => t.className + ':' + t.textContent.slice(0, 80)));
        out.undoApply = await undoClick();
        out.afterUndo = await mediaRow(m['img004.png']);
        await shot('ep-conclusion.png');

        /* ═════ 🔤 essayer une police ═════ */
        await p.evaluate(() => { const t = window.LCNDA_EXT.enquetePhoto.current; t.st.cur = 0; t.renderStrip(); t.renderStage(); t.renderLayers(); window.LCNDA_EXT.enquetePhotoAides.fontGuess(t.api(), { frame: { x: 0.1, y: 0.38, w: 0.48, h: 0.1 } }); });
        await p.waitForSelector(`${D} [data-epf-text]`, { timeout: 5000 });
        await p.fill(`${D} [data-epf-text]`, 'HOTEL DE LA P?STE'); await sleep(300);
        out.overlay = await p.evaluate(d => { const o = document.querySelector(`${d} .ep-fontov.is-draft`); return o ? { text: o.textContent, transform: o.style.transform.slice(0, 9), handles: document.querySelectorAll(`${d} .ep-fh`).length } : null; }, D);
        await shot('ep-font.png');
        await p.click(`${D} [data-epf-rate="good"]`);
        await p.click(`${D} [data-epf-l="0"]`); await p.click(`${D} [data-epf-l="1"]`); await p.click(`${D} [data-epf-l="1"]`);
        await p.click(`${D} [data-epf-keep]`); await sleep(1000);
        const g2 = await api('get', { id: inqId });
        const fg = g2.inquiry.clues.find(c => c.source === 'police');
        out.font = fg ? { cert: fg.certainty, text: fg.text, font: fg.data.font.style, rating: fg.data.font.rating, frame: fg.data.font.frame } : null;
        const proven = await post('clue_save', { id: fg.id, certainty: 'proven' });
        const confirmed = await post('clue_save', { id: fg.id, certainty: 'probable', data: { ...fg.data, confirmed_by: c2.r.clue.id } });
        const fakeConf = await post('clue_save', { id: fg.id, certainty: 'proven', data: { ...fg.data, confirmed_by: fg.id } });
        out.fontCap = { proven: proven.r.clue.certainty, confirmed: confirmed.r.clue.certainty, self: fakeConf.r.clue.certainty };
        out.keptList = await p.evaluate(d => document.querySelectorAll(`${d} .ep-fguesses li`).length, D);
        await p.click(`${D} [data-epf-back]`); await sleep(300);

        /* ═════ 🤖 l'IA (faux Ollama) ═════ */
        const aiR = await post('ai_ask', { image_id: im0.id, question: 'Vois-tu un bâtiment ou un paysage remarquable ?' });
        out.ai = aiR.ok ? { n: aiR.r.observations.length, dropped: aiR.r.dropped, text: aiR.r.observations[0]?.text, box: aiR.r.observations[0]?.box, unknown: aiR.r.unknown, cert: aiR.r.observations[0]?.certainty } : aiR;
        out.aiPrompt = prompts[0] ? { images: prompts[0].images, format: prompts[0].format, rules: /JAMAIS une personne/.test(prompts[0].text) && /je ne sais pas/.test(prompts[0].text) } : null;
        await p.evaluate(() => window.LCNDA_EXT.enquetePhoto.setPrefs({ ai: true }));
        await p.evaluate(() => window.LCNDA_EXT.enquetePhotoAides.ai(window.LCNDA_EXT.enquetePhoto.current.api(), 'lieu'));
        await p.waitForSelector('dialog.h-modal .ep-ai [data-ai-yes]', { timeout: 10000 });
        await p.click('dialog.h-modal .ep-ai [data-ai-yes]'); await sleep(900);
        const g3 = await api('get', { id: inqId });
        out.aiClue = g3.inquiry.clues.filter(c => c.source === 'ia').map(c => c.certainty);
        await p.evaluate(() => document.querySelector('dialog.h-modal[open]')?.close()); await sleep(200);

        /* ═════ ☀️ le calcul d'ombre dans l'écran ═════ */
        await p.evaluate(() => window.LCNDA_EXT.enquetePhotoAides.shadow(window.LCNDA_EXT.enquetePhoto.current.api()));
        await p.waitForSelector('dialog.h-modal [name="elev"]');
        await p.fill('dialog.h-modal [name="elev"]', '44'); await p.fill('dialog.h-modal [name="lat"]', '45.16'); await p.fill('dialog.h-modal [name="date"]', '14 juillet 1911'); await sleep(300);
        out.shadowUi = await p.$eval('dialog.h-modal [data-sh-out]', e => e.textContent.replace(/\s+/g, ' '));
        await p.evaluate(() => document.querySelector('dialog.h-modal[open]')?.close()); await sleep(200);

        /* ═════ § 7 bis les aides : chacune s'ouvre sans erreur ; onglets Recherches et Aides ; 🧰 Chercher dans les données ═════ */
        await p.click(`${D} [data-ep-panel="search"]`); await sleep(300);
        out.searches = await p.evaluate(d => [...document.querySelectorAll(`${d} .ep-sugg li`)].map(li => li.querySelector('.ep-because')?.textContent || ''), D);
        await p.click(`${D} [data-ep-panel="aides"]`); await sleep(300);
        await shot('ep-aides.png');
        out.aidesCount = await p.evaluate(d => document.querySelectorAll(`${d} [data-ep-aidek]`).length, D);
        const KEYS = ['exif', 'g:tirages', 'g:insignes', 'g:vehicules', 'g:civils', 'g:panneaux', 'g:drapeaux', 'g:plaques', 'g:retouches', 'g:cartepostale', 'g:uniformes', 'photographe', 'hypmap', 'affiches', 'manque', 'journal', 'wall', 'recadrage', 'lune', 'monument', 'arbres', 'cadastre', 'deuil', 'fete', 'missing', 'sisters', 'story', 'safe', 'timbre', 'frise', 'reperes', 'mode', 'perspective', 'ombres', 'nearby', 'cousin'];
        out.aides = {};
        for (const k of KEYS) {
            const before = await p.evaluate(() => document.querySelectorAll('dialog[open]').length);
            await p.evaluate(k2 => { try { window.LCNDA_EXT.enquetePhotoAides.open(k2, window.LCNDA_EXT.enquetePhoto.current.api()); } catch (e) { window.__epErr = (window.__epErr || []).concat(k2 + ': ' + e.message); } }, k); await sleep(700);
            out.aides[k] = (await p.evaluate(() => document.querySelectorAll('dialog[open]').length)) - before;
            await p.evaluate(() => { [...document.querySelectorAll('dialog[open]')].filter(x => !x.classList.contains('ep-dlg')).forEach(x => x.close()); }); await sleep(150);
        }
        out.aideErr = await p.evaluate(() => window.__epErr || []);
        await p.evaluate(() => { const t = window.LCNDA_EXT.enquetePhoto.current; window.LCNDA_EXT.enquetePhotoAides.searchData(t.api(), t.clues.find(c => c.kind === 'texte')); });
        await p.waitForSelector('dialog.h-modal .ep-stable', { timeout: 15000 }).catch(() => null); await sleep(500);
        out.dataSearch = await p.evaluate(() => ({ q: document.querySelector('dialog.h-modal[open] [name="q"]')?.value, place: document.querySelector('dialog.h-modal[open] [name="place"]')?.value, rows: document.querySelectorAll('dialog.h-modal[open] .ep-stable tbody tr').length }));
        await p.evaluate(() => { [...document.querySelectorAll('dialog[open]')].filter(x => !x.classList.contains('ep-dlg')).forEach(x => x.close()); }); await sleep(200);

        /* ═════ 🎚️ Mieux voir : le panneau de l'atelier (recettes, canal), sur l'image affichée seulement ═════ */
        const curImg = () => p.evaluate(d => { const i = document.querySelector(`${d} .ep-view.is-cur img.ep-photo`); return i ? { src: i.getAttribute('src'), filter: i.style.filter, orig: i.dataset.epOrig || '' } : null; }, D);
        const fileLen = f => p.evaluate(u => fetch(u, { cache: 'no-store' }).then(r => r.arrayBuffer()).then(b => b.byteLength), 'media/' + f);
        const len0 = await fileLen('img004.png');
        await p.evaluate(() => { const t = window.LCNDA_EXT.enquetePhoto.current; t.st.cur = t.images.findIndex(i => i.media.filename === 'img004.png'); t.renderStrip(); t.renderStage(); t.renderLayers(); t.renderSide(); t.syncBetter(); }); await sleep(500);
        await p.click(`${D} [data-ep-better] [data-tx-cmd="better"]`); await sleep(200);
        out.better = await p.evaluate(d => ({ open: !document.querySelector(`${d} [data-ep-better] [data-tx-panel]`).hidden, recipes: [...document.querySelectorAll(`${d} [data-ep-better] [data-tx-recipe]`)].map(b => b.dataset.txRecipe), chans: [...document.querySelectorAll(`${d} [data-ep-better] [data-tx-chan]`)].map(b => b.dataset.txChan), rake: !!document.querySelector(`${d} [data-ep-better] [data-ep-view="rake"]`), keep: document.querySelector(`${d} [data-ep-better] [data-tx-cmd="keepview"]`)?.textContent.trim(), reset: !!document.querySelector(`${d} [data-ep-better] [data-tx-cmd="resetview"]`) }), D);
        out.betterBefore = await curImg();
        await p.click(`${D} [data-ep-better] [data-tx-recipe="pale"]`);
        for (let i = 0; i < 40; i++) { await sleep(200); const c = await curImg(); if (c && c.src !== out.betterBefore.src) break; }
        out.betterPale = await curImg();
        await p.click(`${D} [data-ep-better] [data-tx-cmd="keepview"]`); await sleep(700);
        const imPale = (await api('get', { id: inqId })).inquiry;
        out.betterKept = Object.values(imPale.settings.views || {})[0] || null;
        out.betterFile = { before: len0, after: await fileLen('img004.png'), filename: imPale.images.find(i => i.media.filename === 'img004.png')?.media.filename };
        await p.click(`${D} [data-ep-better] [data-tx-chan="b"]`); await sleep(300);
        await p.click(`${D} [data-ep-better] [data-tx-cmd="resetview"]`); await sleep(600);
        out.betterReset = await curImg();
        await p.evaluate(() => window.LCNDA_EXT.enquetePhoto.current.togglePanel(false));

        /* ═════ les 26 aides de plus : ☑ liste, 🌡 niveau, 😈 avocat du diable, 👪 qui pourrait-ce être, 🏗 construction, 🧭 boussole, 🗺 calque ═════ */
        const PL = (k, ...a) => p.evaluate(([k2, a2]) => { try { return window.LCNDA_EXT.enquetePhotoPlus.open(k2, window.LCNDA_EXT.enquetePhoto.current.api(), ...a2); } catch (e) { window.__epErr = (window.__epErr || []).concat(k2 + ': ' + e.message); } }, [k, a]);
        const closeSub = () => p.evaluate(() => { [...document.querySelectorAll('dialog[open]')].filter(x => !x.classList.contains('ep-dlg')).forEach(x => x.close()); });
        await PL('checklist'); await p.waitForSelector('dialog.h-modal[open] [data-xk="coins"]');
        await p.click('dialog.h-modal[open] [data-xk="coins"]'); await p.click('dialog.h-modal[open] [data-xk="reflets"]'); await sleep(700);
        out.checklistUi = await p.$eval('dialog.h-modal[open] [data-xp]', e => e.textContent.trim());
        await closeSub(); await sleep(150);
        await PL('niveau'); await p.waitForSelector('dialog.h-modal[open] [data-xl="avancee"]');
        await p.click('dialog.h-modal[open] [data-xl="avancee"]'); await sleep(700); await closeSub();
        out.levelBadge = await p.evaluate(d => document.querySelector(`${d} [data-ep-cmd="level"]`)?.textContent || '', D);
        await PL('diable'); await p.waitForSelector('dialog.h-modal[open] .ep-devil li');
        out.devilTargets = await p.evaluate(() => [...document.querySelectorAll('dialog.h-modal[open] .ep-devil li b')].map(b => b.textContent));
        await p.fill('dialog.h-modal[open] [data-xq="0"]', 'Une carte de Tulle avec la même enseigne'); await p.click('dialog.h-modal[open] [data-xadd="0"]'); await sleep(800); await closeSub();
        await PL('qui'); await p.waitForSelector('dialog.h-modal[open] [name="age"]');
        await p.fill('dialog.h-modal[open] [name="age"]', '6'); await p.fill('dialog.h-modal[open] [name="from"]', '1909'); await p.fill('dialog.h-modal[open] [name="to"]', '1912');
        await p.click('dialog.h-modal[open] [data-xgo]'); await p.waitForSelector('dialog.h-modal[open] .ep-who li', { timeout: 8000 }).catch(() => null); await sleep(300);
        out.who = await p.evaluate(() => [...document.querySelectorAll('dialog.h-modal[open] .ep-who li')].map(li => ({ t: li.querySelector('b').textContent.trim(), fit: li.classList.contains('is-fit'), yes: li.querySelector('.ep-yes')?.textContent || '', no: li.querySelector('.ep-no')?.textContent || '' })));
        const fitBtn = await p.evaluateHandle(() => [...document.querySelectorAll('dialog.h-modal[open] .ep-who li.is-fit')].find(li => /Pierre MAZAUD/.test(li.textContent))?.querySelector('[data-xyes]') || null); if (fitBtn.asElement()) { await fitBtn.asElement().click(); await sleep(900); }
        await closeSub();
        out.whoApi = await api('candidates', { id: inqId, age: 6, spread: 2, from: 1909, to: 1912, place_id: 1 });
        await post('clue_save', { inquiry_id: inqId, kind: 'lieu', text: 'Une gare avec une horloge', certainty: 'supposed' });
        await p.evaluate(() => window.LCNDA_EXT.enquetePhoto.current.reload()); await sleep(500);
        await PL('construction'); await p.waitForSelector('dialog.h-modal[open] [data-xb] h4', { timeout: 8000 });
        out.buildSug = await p.evaluate(() => [...document.querySelectorAll('dialog.h-modal[open] [data-xs]')].map(b => b.closest('li').textContent.replace(/\s+/g, ' ')));
        if (out.buildSug.length) { await p.click('dialog.h-modal[open] [data-xs="0"]'); await sleep(900); }
        await closeSub();
        await PL('boussole'); await p.waitForSelector('dialog.h-modal[open] [name="az"]');
        await p.fill('dialog.h-modal[open] [name="az"]', '90'); await sleep(900);
        out.compassEast = await p.evaluate(() => ({ n: document.querySelectorAll('dialog.h-modal[open] .ep-blds li').length, cone: !!document.querySelector('dialog.h-modal[open] [data-xmap] polyline') }));
        await p.fill('dialog.h-modal[open] [name="az"]', '270'); await sleep(900);
        out.compassWest = await p.evaluate(() => document.querySelectorAll('dialog.h-modal[open] .ep-blds li').length);
        await closeSub(); await sleep(150);
        out.mapLayer = await p.evaluate(async () => {
            const X = window.LCNDA_EXT.enquetePhotoPlus, off = X.mapOn(), st = document.createElement('div'); st.id = 'map-stage'; st.style.cssText = 'position:relative;width:800px;height:500px'; document.body.appendChild(st);
            (window.LCNDA_EXT.mapDraw || []).forEach(f => { try { f({stage: st, left: window.LCNDA_APP.lngToX(1.53, 9) - 400, top: window.LCNDA_APP.latToY(45.16, 9) - 250, z: 9, width: 800, height: 500}); } catch (_) {} });
            await new Promise(r => setTimeout(r, 300)); const before = st.querySelectorAll('#ep-map-layer .ep-mapq').length;
            const n = await X.setMapLayer(true); const on = st.querySelectorAll('#ep-map-layer .ep-mapq').length; await X.setMapLayer(false); const after = !!st.querySelector('#ep-map-layer'); st.remove();
            return { off, before, n, on, after };
        });
        // chaque aide de plus s'ouvre sans erreur
        for (const k of ['deuxtirages', 'g:grain', 'g:interieur', 'g:toits', 'decor', 'animaux', 'distances', 'histoire', 'habit', 'provenance', 'mains', 'atelier', 'croissance', 'rapport', 'carte', 'tableau', 'mesurer', 'profil', 'canaux', 'relief']) { await PL(k); await sleep(450); await closeSub(); await sleep(100); }
        await p.evaluate(() => { window.LCNDA_EXT.enquetePhoto.current.togglePanel(false); window.LCNDA_EXT.enquetePhoto.current.setTool('hand'); });

        /* ═════ la suite (heritage-enquete-photo-suite.js) : les 11 aides ═════ */
        out.suite = {};
        const curImgId = () => p.evaluate(() => window.LCNDA_EXT.enquetePhoto.current.img.id);
        const canvasSig = sel => p.evaluate(s2 => { const c = document.querySelector(s2); if (!c) return ''; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let h = 0, n = 0; for (let i = 0; i < d.length; i += 97) { h = (h * 31 + d[i]) % 1000000007; if (d[i]) n++; } return `${h}:${n}`; }, sel);
        // 1. 🔍 double loupe : la même zone sur A et B ; promener la loupe sur A déplace aussi celle de B (positions liées) ; un indice « compare »
        await PL('loupe2'); await p.waitForSelector('dialog.h-modal[open] [data-l2lens="b"]'); await sleep(900);
        out.suite.loupe = { canvases: await p.evaluate(() => document.querySelectorAll('dialog.h-modal[open] .ep2-loupes canvas').length), b0: await canvasSig('dialog.h-modal[open] [data-l2lens="b"]') };
        { const r = await p.$eval('dialog.h-modal[open] [data-l2over="a"]', e => { const q = e.getBoundingClientRect(); return { x: q.left, y: q.top, w: q.width, h: q.height }; }); await p.mouse.click(r.x + r.w * 0.82, r.y + r.h * 0.3); await sleep(300); }
        out.suite.loupe.b1 = await canvasSig('dialog.h-modal[open] [data-l2lens="b"]');
        await p.click('dialog.h-modal[open] [data-l2r]'); await sleep(900); await closeSub();
        // 2. ▦ grille de lecture : 3 × 3, deux cases cochées, gardées avec l'image ; 4 × 4 → 16 cases
        await PL('grille'); await sleep(500);
        out.suite.grid = { cells: await p.evaluate(d => document.querySelectorAll(`${d} .ep-view.is-cur .ep2-cell`).length, D) };
        await p.click(`${D} .ep-view.is-cur [data-ep2-cell="0"]`); await sleep(150); await p.click(`${D} .ep-view.is-cur [data-ep2-cell="4"]`); await sleep(900);
        out.suite.grid.bar = await p.evaluate(d => document.querySelector(`${d} .ep2-bar .ep2-gp`)?.textContent || '', D);
        { const g = (await api('get', { id: inqId })).inquiry, id = await curImgId(); out.suite.grid.saved = g.settings.grids?.[id]; }
        await p.click(`${D} .ep2-bar [data-ep2-n="4"]`); await sleep(300);
        out.suite.grid.cells4 = await p.evaluate(d => document.querySelectorAll(`${d} .ep-view.is-cur .ep2-cell`).length, D);
        await p.evaluate(d => document.querySelector(`${d} [data-ep2-gclose]`)?.click(), D); await sleep(300);
        out.suite.grid.off = await p.evaluate(d => !document.querySelector(`${d} .ep2-cell`), D);
        // 3. 🔢 numéroter : deux clics sur la photo → 1 et 2, la légende dessous ; le 2 relié à Marie LACOMBE (vivante) ; PNG avec légende
        await PL('numeros'); await sleep(300);
        { const r = await p.$eval(`${D} .ep-view.is-cur img.ep-photo`, e => { const q = e.getBoundingClientRect(); return { x: q.left, y: q.top, w: q.width, h: q.height }; });
            await p.mouse.click(r.x + r.w * 0.3, r.y + r.h * 0.5); await sleep(500); await p.mouse.click(r.x + r.w * 0.6, r.y + r.h * 0.5); await sleep(500); }
        out.suite.people = { pins: await p.evaluate(d => [...document.querySelectorAll(`${d} .ep-view.is-cur .ep2-pin`)].map(b => b.textContent), D), rows: await p.evaluate(d => document.querySelectorAll(`${d} [data-ep2-legend] [data-ep2-row]`).length, D) };
        await p.fill(`${D} [data-ep2-legend] li:nth-child(1) [data-ep2-lab]`, 'inconnu'); await p.press(`${D} [data-ep2-legend] li:nth-child(1) [data-ep2-lab]`, 'Tab');
        await p.fill(`${D} [data-ep2-legend] li:nth-child(2) [data-ep2-lab]`, 'Jean MAZAUD'); await p.press(`${D} [data-ep2-legend] li:nth-child(2) [data-ep2-lab]`, 'Tab'); await sleep(900);
        out.suite.people.legendText = await p.evaluate(async () => { const S = window.LCNDA_EXT.enquetePhotoSuite, api = window.LCNDA_EXT.enquetePhoto.current.api(); return window.LCNDA_EP_CORE.legendLines((api.inq.settings.people[api.img.id] || []), {}).map(l => `${l.n} : ${l.text}`); });
        // le 3 : Marie LACOMBE (vivante), reliée à sa fiche — jamais nommée en partage sans risque
        await p.evaluate(async () => { const t = window.LCNDA_EXT.enquetePhoto.current, api = t.api(), id = api.img.id, L = (api.inq.settings.people[id] || []).slice(); L.push({ id: 'pm3', n: 3, x: 0.8, y: 0.4, label: '', person_id: 2, certainty: 'probable' }); api.inq.settings.people = { ...api.inq.settings.people, [id]: L }; await api.post('update', { id: api.inq.id, settings: api.inq.settings }); });
        out.suite.people.png = await p.evaluate(async () => { const S = window.LCNDA_EXT.enquetePhotoSuite, api = window.LCNDA_EXT.enquetePhoto.current.api(), im = api.img; const cv = await S.legendCanvas(api, im, true); const a = await api.composite(im, { layers: false }); return { taller: cv.height > a.height, w: cv.width === a.width }; });
        out.suite.people.safe = await p.evaluate(async () => { const api = window.LCNDA_EXT.enquetePhoto.current.api(), inq = (await api.get('get')).inquiry; const r = await api.get('face_people', { ids: '2' });
            return window.LCNDA_EP_CORE.legendLines(inq.settings.people[api.img.id], { people: r.people, safe: true, privNames: inq.private_names }).map(l => l.text); });
        out.suite.people.privNames = (await api('get', { id: inqId })).inquiry.private_names;
        await p.evaluate(() => window.LCNDA_EXT.enquetePhotoSuite.togglePeople(window.LCNDA_EXT.enquetePhoto.current.api(), false)); await sleep(200);
        // 4. 👻 silhouette : un contour à main levée sur A (gardé sur le calque « 👻 Silhouettes »), posé sur B, à sa taille
        await PL('silhouette'); await p.waitForSelector('dialog.h-modal[open] [data-g2a]'); await sleep(900);
        { const r = await p.$eval('dialog.h-modal[open] [data-g2a]', e => { const q = e.getBoundingClientRect(); return { x: q.left, y: q.top, w: q.width, h: q.height }; });
            await p.mouse.move(r.x + r.w * 0.4, r.y + r.h * 0.3); await p.mouse.down(); for (const [fx, fy] of [[0.5, 0.3], [0.55, 0.6], [0.45, 0.75], [0.38, 0.5]]) await p.mouse.move(r.x + r.w * fx, r.y + r.h * fy, { steps: 4 }); await p.mouse.up(); await sleep(900); }
        out.suite.ghost = { h: await p.$eval('dialog.h-modal[open] [data-g2h]', e => e.textContent), b: await canvasSig('dialog.h-modal[open] [data-g2b]') };
        await p.click('dialog.h-modal[open] [data-g2r]'); await sleep(900); await closeSub(); await sleep(700);
        out.suite.ghost.layer = await p.evaluate(() => { const t = window.LCNDA_EXT.enquetePhoto.current; const l = t.images.map(im => t.layersOf(im).find(x => x.id === 'ghost')).find(Boolean); return l ? l.shapes.map(s => (s.pts || []).length) : []; });
        // 5. 📅 ce jour-là : 14 juillet 1911 → la lune, la météo (pas installée ici), Lucie DURAND baptisée ce jour-là
        await PL('cejour'); await p.waitForSelector('dialog.h-modal[open] [name="day"]');
        await p.fill('dialog.h-modal[open] [name="day"]', '1911-07-14'); await p.$eval('dialog.h-modal[open] [name="day"]', e => e.dispatchEvent(new Event('change', { bubbles: true }))); await sleep(1500);
        out.suite.day = await p.evaluate(() => { const c = document.querySelector('dialog.h-modal[open] .ep2-card'); return { text: (c?.textContent || '').replace(/\s+/g, ' '), moon: !!c?.querySelector('[data-d2m] p'), family: !!c?.querySelector('[data-d2f] [data-d2p]') }; });
        out.suite.dayApi = await api('that_day', { date: '1911-07-14' });
        await closeSub();
        // 6. 🗺 tournée : « Phot. J. LACOMBE » (Brive), noté comme photographe d'une enquête placée à Brive → sur la mini-carte, par année
        const ph = await post('photographer_save', { name: 'Phot. J. LACOMBE', city: 'Brive', year_from: 1900, year_to: 1925 });
        await post('clue_save', { inquiry_id: inqId, kind: 'support', text: 'Photographe : Phot. J. LACOMBE', certainty: 'probable', data: { photographer: 'Phot. J. LACOMBE' } });
        out.suite.route = await api('photographer_route', { pid: ph.r.id });
        await p.evaluate(id => window.LCNDA_EXT.enquetePhotoSuite.route(null, id), ph.r.id); await p.waitForSelector('dialog.h-modal[open] .ep2-route li', { timeout: 8000 }).catch(() => null);
        out.suite.routeUi = await p.evaluate(() => ({ groups: document.querySelectorAll('dialog.h-modal[open] .ep2-route li').length, text: document.querySelector('dialog.h-modal[open] .ep2-route')?.textContent.replace(/\s+/g, ' ') || '', map: !!document.querySelector('dialog.h-modal[open] [data-r2] svg, dialog.h-modal[open] [data-r2] .mini-map, dialog.h-modal[open] [data-r2] canvas') }));
        await closeSub();
        // 7. 👔 tenues de métier : chaque fait a sa source ↗ ; Paul DURAND, forgeron, proposé depuis l'arbre
        await p.evaluate(() => window.LCNDA_EXT.enquetePhotoAides.guide('metiers', window.LCNDA_EXT.enquetePhoto.current.api())); await p.waitForSelector('dialog.h-modal[open] .ep2-tree h4', { timeout: 8000 }).catch(() => null);
        out.suite.jobs = await p.evaluate(() => { const d = document.querySelector('dialog.h-modal[open]'), items = [...d.querySelectorAll('.ep-guide')[0].querySelectorAll(':scope > li')]; return { n: items.length, sourced: items.every(li => /wikipedia\.org/.test(li.querySelector('a')?.href || '')), tree: d.querySelector('.ep2-tree')?.textContent.replace(/\s+/g, ' ') || '' }; });
        await closeSub();
        // 8. 🎞 occasions : sourcées ; le baptême de Lucie DURAND (1911) proposé dans la fenêtre ; ＋ Indice → « Supposé »
        await p.evaluate(() => window.LCNDA_EXT.enquetePhotoAides.guide('occasions', window.LCNDA_EXT.enquetePhoto.current.api())); await p.waitForSelector('dialog.h-modal[open] .ep2-tree h4', { timeout: 8000 }).catch(() => null);
        out.suite.occ = await p.evaluate(() => { const d = document.querySelector('dialog.h-modal[open]'), items = [...d.querySelectorAll('.ep-guide')[0].querySelectorAll(':scope > li')]; return { n: items.length, sourced: items.every(li => /wikipedia\.org/.test(li.querySelector('a')?.href || '')), tree: d.querySelector('.ep2-tree')?.textContent.replace(/\s+/g, ' ') || '' }; });
        await p.evaluate(() => document.querySelector('dialog.h-modal[open] [data-o2^="bapteme"]')?.click()); await sleep(900); await closeSub();
        // 9. ✍ en une phrase : « sans doute » pour une conclusion Probable ; ＋ Ajouter comme note à la fiche de Jean MAZAUD
        await post('link_save', { inquiry_id: inqId, kind: 'person', ref_id: 1 }); await p.evaluate(() => window.LCNDA_EXT.enquetePhoto.current.reload()); await sleep(600);
        await PL('phrase'); await p.waitForSelector('dialog.h-modal[open] [name="s"]');
        out.suite.phrase = { text: await p.$eval('dialog.h-modal[open] [name="s"]', e => e.value) };
        await p.click('dialog.h-modal[open] [data-p2note]'); await sleep(300);
        out.suite.phrase.menu = await p.evaluate(() => [...document.querySelectorAll('.ui-menu [role="menuitem"], .ui-menu button, [class*="menu"] [role="menuitem"]')].map(b => b.textContent.trim()).filter(Boolean));
        await p.evaluate(() => { const b = [...document.querySelectorAll('[role="menuitem"], .ui-menu button')].find(x => /MAZAUD/.test(x.textContent)); b?.click(); }); await sleep(1200);
        out.suite.phrase.notes = await p.evaluate(() => window.LCNDA_APP.api('person', { id: 1 }).then(r => JSON.stringify(r.notes || r.person?.notes || r.result?.notes || r).includes('Cette photo a'), () => null));
        out.suite.phrase.toast = await p.evaluate(() => [...document.querySelectorAll('.toast, [class*="toast"]')].map(t => t.textContent).join(' | '));
        await closeSub();
        // 10. 📜 ce qui a changé ma conclusion : Probable → Prouvé à cause d'un indice ; une certitude d'indice changée ; tout au journal
        { const g = (await api('get', { id: inqId })).inquiry, c0 = g.clues.find(c => /HÔTEL DE LA POSTE/.test(c.text));
            await post('conclusion', { id: inqId, conclusion: { ...g.conclusion, place: { ...g.conclusion.place, certainty: 'proven' } }, because: c0.id });
            const c4b = g.clues.find(c => /képi/.test(c.text)); await post('clue_save', { id: c4b.id, certainty: 'supposed' });
            const g2b = (await api('get', { id: inqId })).inquiry; out.suite.hist = C.conclusionHistory(g2b.journal).map(j => `${j.what} | ${j.result}`); out.suite.phrase2 = C.sentence(g2b.conclusion);
            await post('conclusion', { id: inqId, conclusion: g.conclusion }); await post('clue_save', { id: c4b.id, certainty: c4b.certainty }); } // remis comme avant pour la suite de l’essai
        await p.evaluate(() => window.LCNDA_EXT.enquetePhoto.current.reload()); await sleep(500);
        await PL('historique'); await p.waitForSelector('dialog.h-modal[open] .ep2-hist li', { timeout: 5000 }).catch(() => null);
        out.suite.histUi = await p.evaluate(() => document.querySelectorAll('dialog.h-modal[open] .ep2-hist li').length); await closeSub();
        out.suite.because = await p.evaluate(d => { const t = window.LCNDA_EXT.enquetePhoto.current; t.st.openQ = 'conclusion'; t.st.panel = 'questions'; t.renderSide(); return !!document.querySelector(`${d} [name="c_because"]`); }, D);
        // ⚙️ Personnaliser : la taille de la grille et le grossissement de la loupe
        await p.evaluate(() => window.LCNDA_EXT.enquetePhoto.current.openPrefs()); await sleep(300);
        out.suite.prefs = await p.evaluate(() => ({ grid: !!document.querySelector('dialog.h-modal[open] [data-pf="gridSize"]'), loupe: !!document.querySelector('dialog.h-modal[open] [data-pf="loupeZoom"]') }));
        await closeSub();
        // la grille des aides : les 11 de la suite s'ouvrent depuis l'onglet « Aides »
        out.suite.aides = await p.evaluate(d => { const t = window.LCNDA_EXT.enquetePhoto.current; t.st.panel = 'aides'; t.renderSide(); return ['loupe2', 'grille', 'numeros', 'silhouette', 'cejour', 'tournee', 'g:metiers', 'g:occasions', 'phrase', 'historique', 'nouveau'].filter(k => document.querySelector(`${d} [data-ep-aidek="${k}"]`)); }, D);
        await PL('nouveau'); await sleep(300); await closeSub();
        await p.evaluate(() => { const t = window.LCNDA_EXT.enquetePhoto.current; t.st.panel = 'questions'; t.renderSide(); });
        out.plusErr = await p.evaluate(() => window.__epErr || []);
        out.report = await p.evaluate(() => window.LCNDA_EXT.enquetePhotoPlus.reportHtml(window.LCNDA_EXT.enquetePhoto.current.api()).then(h => ({ q: /Nos questions précises/.test(h), todo: /À chercher/.test(h), img: /<img src="data:image/.test(h) })));
        const g5 = (await api('get', { id: inqId })).inquiry;
        out.suite.loupeClue = g5.clues.find(c => c.data?.loupe && c.source === 'compare' && c.certainty === 'supposed') || null;
        out.suite.ghostClue = g5.clues.find(c => c.data?.ghost && c.certainty === 'supposed') || null;
        out.suite.occClue = g5.clues.find(c => c.data?.occasion) || null;
        out.suite.noteJournal = g5.journal.some(j => /Conclusion ajoutée comme note/.test(j.what));
        out.plusSaved = { checklist: Object.keys(g5.settings.checklist || {}).sort(), level: g5.settings.level, todo: g5.clues.filter(c => c.data?.todo).map(c => [c.text, c.certainty, c.data.against]), who: g5.clues.filter(c => c.data?.who).map(c => [c.text, c.certainty, c.source]), built: g5.clues.filter(c => c.data?.building).map(c => [c.date_from, c.certainty]) };
        await p.evaluate(() => document.querySelectorAll('.toast, [class*="toast"]').forEach(t => { if (t.querySelector('button')) t.remove(); }));

        /* ═════ 👤 Qui est-ce ? : l'outil local Visages (faux moteur), sur une enquête à part ═════ */
        const fq = await post('create', { media_ids: [m['face-b.png']], title: 'Un inconnu au chapeau' });
        await p.evaluate(() => document.querySelector('dialog.ep-dlg')?.close()); await sleep(300);
        await p.evaluate(id => window.LCNDA_EXT.enquetePhoto.open(id), fq.r.id); await p.waitForSelector(`${D} .ep-chip`); await sleep(400);
        out.facesStep = await p.evaluate(d => { const t = window.LCNDA_EXT.enquetePhoto.current; t.st.openQ = 'gens'; t.renderSide(); return !!document.querySelector(`${d} [data-ep-aide="visages"]`); }, D);
        await p.click(`${D} [data-ep-aide="visages"]`); await p.waitForSelector('dialog.h-modal[open] [data-xscan]', { timeout: 10000 });
        await p.click('dialog.h-modal[open] [data-xscan]');
        await p.waitForSelector('dialog.h-modal[open] .ep-faces li', { timeout: 30000 }).catch(() => null);
        out.faces = await p.evaluate(() => [...document.querySelectorAll('dialog.h-modal[open] .ep-faces li b')].map(b => b.textContent));
        if (out.faces.length) { await p.click('dialog.h-modal[open] [data-xkeep="0"]'); await sleep(900); }
        await closeSub();
        const gf = (await api('get', { id: fq.r.id })).inquiry, fc = gf.clues.find(c => c.source === 'visage');
        out.faceClue = fc ? { cert: fc.certainty, text: fc.text, person: fc.data.person_id } : null;
        if (fc) {
            const other = await post('clue_save', { inquiry_id: fq.r.id, kind: 'date', text: 'Né en 1902 : l’âge colle', certainty: 'probable' });
            const otherFace = await post('clue_save', { inquiry_id: fq.r.id, kind: 'gens', source: 'visage', text: 'Autre visage', certainty: 'supposed' });
            out.faceCap = {
                proven: (await post('clue_save', { id: fc.id, certainty: 'proven' })).r.clue.certainty,
                confirmed: (await post('clue_save', { id: fc.id, certainty: 'proven', data: { ...fc.data, confirmed_by: other.r.clue.id } })).r.clue.certainty,
                byFace: (await post('clue_save', { id: fc.id, certainty: 'probable', data: { ...fc.data, confirmed_by: otherFace.r.clue.id } })).r.clue.certainty,
                self: (await post('clue_save', { id: fc.id, certainty: 'probable', data: { ...fc.data, confirmed_by: fc.id } })).r.clue.certainty };
            await p.evaluate(() => window.LCNDA_EXT.enquetePhoto.current.reload()); await sleep(400);
            out.faceSafe = await p.evaluate(() => Promise.all([window.LCNDA_EXT.enquetePhotoPlus.reportHtml(window.LCNDA_EXT.enquetePhoto.current.api()), window.LCNDA_EXT.enquetePhotoAides._storyHtml(window.LCNDA_EXT.enquetePhoto.current.api(), { safe: true })]).then(([a, b]) => /DURAND/.test(a) || /DURAND/.test(b)));
        }
        /* ═════ × sur l'image (sortie de l'enquête, ↶ Annuler, le média reste) ; 🗑 Supprimer l'enquête visible au pied du panneau (↶ Annuler) ═════ */
        await p.evaluate(() => document.querySelectorAll('.toast, [class*="toast"]').forEach(t => { if (t.querySelector('button')) t.remove(); }));
        out.chipX = { title: await p.$eval(`${D} [data-ep-imgx]`, b => b.title).catch(() => '') };
        await p.click(`${D} [data-ep-imgx]`); await sleep(900);
        out.chipX.after = (await api('get', { id: fq.r.id })).inquiry.images.length;
        out.chipX.media = await p.evaluate(id => window.LCNDA_APP.api('onglets', { op: 'document', id }).then(r => !!r.document, () => false), m['face-b.png']);
        out.chipX.undo = await undoClick(); await sleep(500);
        out.chipX.back = (await api('get', { id: fq.r.id })).inquiry.images.length;
        await p.evaluate(() => { const t = window.LCNDA_EXT.enquetePhoto.current; if (t) { t.st.panel = 'questions'; t.st.openQ = ''; t.renderSide(); } }); await sleep(300);
        out.delBtn = await p.evaluate(d => { const b = document.querySelector(`${d} .ep-qfoot [data-ep-delinq]`), q = document.querySelector(`${d} .ep-qfoot [data-ep-pause]`); return b ? { text: b.textContent.trim(), before: !!(q && (b.compareDocumentPosition(q) & Node.DOCUMENT_POSITION_FOLLOWING)) } : null; }, D);
        await p.evaluate(() => document.querySelectorAll('.toast, [class*="toast"]').forEach(t => { if (t.querySelector('button')) t.remove(); }));
        await p.click(`${D} .ep-qfoot [data-ep-delinq]`); await sleep(900);
        out.delBtn.gone = !(await api('list')).inquiries.some(q => q.id === fq.r.id);
        out.delBtn.undo = await undoClick(); await sleep(800);
        out.delBtn.restored = (await api('list')).inquiries.some(q => q.id === fq.r.id);
        await p.evaluate(() => document.querySelector('dialog.ep-dlg')?.close()); await sleep(300);
        await p.evaluate(id => window.LCNDA_EXT.enquetePhoto.open(id), inqId); await p.waitForSelector(`${D} .ep-chip`); await sleep(400);

        /* ═════ ✂ Séparer + ↶ Annuler ═════ */
        const im1 = g3.inquiry.images.find(i => i.media_id === m['img011.png']);
        await post('clue_save', { inquiry_id: inqId, kind: 'lieu', text: 'Le même clocher, de côté', certainty: 'supposed', images: { [im1.id]: 'yes' } });
        await p.evaluate(() => window.LCNDA_EXT.enquetePhoto.current.reload()); await sleep(300);
        await p.evaluate(iid => { const t = window.LCNDA_EXT.enquetePhoto.current; return t.separate(t.imgById(iid)); }, im1.id); await sleep(800);
        out.separated = (await api('get', { id: inqId })).inquiry.images.length;
        out.undoSep = await undoClick(); await sleep(400);
        const g4 = await api('get', { id: inqId });
        out.afterSep = { images: g4.inquiry.images.length, clue: g4.inquiry.clues.some(c => c.text === 'Le même clocher, de côté') };
        await sleep(300);
        // le bouton de la page devient « 🔎 Enquête · N indices »
        await p.evaluate(() => document.querySelector('dialog.ep-dlg')?.close()); await sleep(400);
        await p.evaluate(id => { location.hash = '#documents'; setTimeout(() => { location.hash = '#documents/' + id; }, 150); }, m['img004.png']); await sleep(1800);
        out.buttonAfter = await p.evaluate(() => document.querySelector('#workspace [data-ep-media]')?.textContent.trim());

        /* ═════ 🌐 comparer en ligne : bloqué pour une personne vivante ═════ */
        const live = await post('create', { media_ids: [m['img020.png']], title: 'Marie à la plage' });
        out.privacy = await api('privacy', { id: live.r.id });
        await p.evaluate(id => window.LCNDA_EXT.enquetePhoto.open(id), live.r.id); await p.waitForSelector(`${D} .ep-chip`); await sleep(400);
        await p.evaluate(() => window.LCNDA_EXT.enquetePhotoAides.compareOnline(window.LCNDA_EXT.enquetePhoto.current.api()));
        await p.waitForSelector('dialog.h-modal [data-ep-blocked]', { timeout: 5000 });
        out.blocked = await p.$eval('dialog.h-modal [data-ep-blocked]', e => e.textContent);
        out.blockedLinks = await p.evaluate(() => document.querySelectorAll('dialog.h-modal[open] a[href*="lens.google"], dialog.h-modal[open] a[href*="tineye"]').length);
        await p.evaluate(() => document.querySelector('dialog.h-modal[open]')?.close()); await sleep(200);
        const free = await post('create', { media_ids: [m['exif.jpg']], title: 'Photo numérique' });
        out.privacyFree = await api('privacy', { id: free.r.id });
        await p.evaluate(() => document.querySelector('dialog.ep-dlg')?.close()); await sleep(300);

        /* ═════ 390 px, sombre : rien ne déborde ═════ */
        await p.setViewportSize({ width: 390, height: 844 }); await p.emulateMedia({ colorScheme: 'dark' });
        await p.evaluate(id => window.LCNDA_EXT.enquetePhoto.open(id), inqId); await p.waitForSelector(`${D} .ep-chip`); await sleep(600);
        out.overflow = await p.evaluate(d => { const dl = document.querySelector(d); return { dlg: dl.scrollWidth - dl.clientWidth, side: (document.querySelector(`${d} .ep-side`)?.scrollWidth || 0) - (document.querySelector(`${d} .ep-side`)?.clientWidth || 0) }; }, D);
        await p.evaluate(() => window.LCNDA_EXT.enquetePhotoPlus.open('qui', window.LCNDA_EXT.enquetePhoto.current.api())); await p.waitForSelector('dialog.h-modal[open] .ep-xrow'); await sleep(800);
        out.overflowPlus = await p.evaluate(() => { const dl = document.querySelector('dialog.h-modal[open]'); return dl.scrollWidth - dl.clientWidth; });
        await p.evaluate(() => { [...document.querySelectorAll('dialog[open]')].filter(x => !x.classList.contains('ep-dlg')).forEach(x => x.close()); }); await sleep(150);
        await p.evaluate(() => window.LCNDA_EXT.enquetePhoto.current.betterSee()); await sleep(300);
        await p.evaluate(() => window.LCNDA_EXT.enquetePhoto.current.togglePanel(false));
        await p.evaluate(() => window.LCNDA_EXT.enquetePhotoPlus.open('loupe2', window.LCNDA_EXT.enquetePhoto.current.api())); await p.waitForSelector('dialog.h-modal[open] .ep2-loupes'); await sleep(600);
        out.overflowSuite = { loupe: await p.evaluate(() => { const dl = document.querySelector('dialog.h-modal[open]'); return dl.scrollWidth - dl.clientWidth; }) };
        await p.evaluate(() => { [...document.querySelectorAll('dialog[open]')].filter(x => !x.classList.contains('ep-dlg')).forEach(x => x.close()); window.LCNDA_EXT.enquetePhotoSuite.toggleGrid(window.LCNDA_EXT.enquetePhoto.current.api(), true); }); await sleep(400);
        out.overflowSuite.bar = await p.evaluate(d => { const b = document.querySelector(`${d} .ep2-bar`), r = b?.getBoundingClientRect(); return r ? { left: Math.round(r.left), right: Math.round(r.right), vw: innerWidth } : null; }, D);
        out.overflowSuite.legend = await p.evaluate(d => { const l = document.querySelector(`${d} [data-ep2-legend]`); return l ? l.scrollWidth - l.clientWidth : -1; }, D);
        await p.evaluate(() => window.LCNDA_EXT.enquetePhotoSuite.toggleGrid(window.LCNDA_EXT.enquetePhoto.current.api(), false));
        out.overflowBetter = await p.evaluate(d => { const pn = document.querySelector(`${d} [data-ep-better] [data-tx-panel]`), r = pn?.getBoundingClientRect(); return r ? { left: Math.round(r.left), right: Math.round(r.right), vw: innerWidth } : null; }, D);
        await shot('ep-390.png');
        await p.evaluate(() => document.querySelector('dialog.ep-dlg')?.close()); await sleep(300);
        await p.setViewportSize({ width: 1440, height: 900 }); await p.emulateMedia({ colorScheme: 'light' });

        /* ═════ supprimer + ↶ Annuler ═════ */
        await p.evaluate(id => window.LCNDA_EXT.enquetePhoto.open(id), free.r.id); await p.waitForSelector(`${D} .ep-chip`); await sleep(300);
        await p.evaluate(() => window.LCNDA_EXT.enquetePhoto.current.remove()); await sleep(800);
        out.deleted = (await api('list')).inquiries.some(q => q.id === free.r.id);
        out.undoDel = await undoClick(); await sleep(800);
        out.restored = (await api('list')).inquiries.some(q => q.id === free.r.id);
        await p.evaluate(() => document.querySelector('dialog.ep-dlg')?.close()); await sleep(300);

        /* ═════ 11. 🔔 du nouveau pour une enquête terminée (calculé à la demande) : terminée « avant » le baptême de Lucie DURAND et la
         *        nouvelle photo du même photographe ; une enquête terminée sans rien de neuf : pas de pastille ═════ */
        await post('update', { id: inqId, status: 'done' });
        php(`require 'lib/bootstrap.php'; db()->exec("UPDATE photo_inquiries SET updated_at='2000-01-01 00:00:00' WHERE id=${inqId}");`);
        out.suite.reopen = (await api('list')).inquiries.find(q => q.id === inqId)?.reopen || [];
        await post('update', { id: free.r.id, status: 'done' });
        out.suite.reopenNone = (await api('list')).inquiries.find(q => q.id === free.r.id)?.reopen || null;
        await post('update', { id: free.r.id, status: 'open' });
        php(`require 'lib/bootstrap.php'; db()->exec("UPDATE photo_inquiries SET updated_at='2000-01-01 00:00:00' WHERE id=${inqId}");`);
        await p.evaluate(id => window.LCNDA_EXT.enquetePhoto.open(id), inqId); await p.waitForSelector(`${D} .ep-chip`); await sleep(500);
        out.suite.reopenNotice = await p.evaluate(d => document.querySelector(`${d} .ep2-reopen`)?.textContent.replace(/\s+/g, ' ') || '', D);
        await p.evaluate(() => { window.LCNDA_EXT.enquetePhoto.current.t0 = Date.now(); document.querySelector('dialog.ep-dlg')?.close(); }); await sleep(400);
        php(`require 'lib/bootstrap.php'; db()->exec("UPDATE photo_inquiries SET updated_at='2000-01-01 00:00:00' WHERE id=${inqId}");`);

        /* ═════ 📄 Documents → « Façon de ranger » → 🔎 Enquêtes photo : les cartes, ouvrir, 🗑 supprimer (↶ Annuler), vide ═════ */
        await p.evaluate(() => { try { localStorage.setItem('genealogie-menu-documents', '1'); localStorage.setItem('genealogie-menu-hidden', '[]'); } catch (_) {} location.hash = '#documents'; });
        await p.waitForSelector('#sidebar-content [data-ong-mode="inquiries"]', { timeout: 15000 }).catch(() => null);
        out.docs = await p.evaluate(() => { const bs = [...document.querySelectorAll('#sidebar-content .ong-mode [data-ong-mode]')]; return { n: bs.length, has: !!document.querySelector('#sidebar-content [data-ong-mode="inquiries"]'), ml: bs[1] ? getComputedStyle(bs[1]).marginLeft : '', mt: bs[3] ? getComputedStyle(bs[3]).marginTop : '' }; });
        if (out.docs.has) {
            await p.click('#sidebar-content [data-ong-mode="inquiries"]');
            await p.waitForSelector('#workspace [data-ong-cards] [data-ong-ep]', { timeout: 10000 }).catch(() => null); await sleep(300);
            const listNow = (await api('list')).inquiries;
            out.docs.cards = await p.evaluate(() => [...document.querySelectorAll('#workspace [data-ong-cards] [data-ong-ep]')].map(c => ({ id: Number(c.dataset.ongEp), name: c.querySelector('.ui-card-name')?.textContent.trim(), line: c.querySelector('.ui-card-body small')?.textContent.trim() || '' })));
            out.docs.count = listNow.length;
            out.docs.reopenBadge = await p.evaluate(id => document.querySelector(`#workspace [data-ong-ep="${id}"]`)?.textContent.includes('🔔') || false, inqId);
            out.docs.otherBadge = await p.evaluate(id => [...document.querySelectorAll('#workspace [data-ong-ep]')].filter(c => Number(c.dataset.ongEp) !== id && c.textContent.includes('🔔')).length, inqId);
            out.docs.lineOk = out.docs.cards.every(c => /\d+ images? · \d+ indices?/.test(c.line));
            out.docs.title = out.docs.cards.some(c => c.name === 'Photo numérique');
            await p.click(`#workspace [data-ong-epopen="${free.r.id}"]`); await p.waitForSelector(`${D} .ep-chip`, { timeout: 8000 }).catch(() => null);
            out.docs.opened = await p.evaluate(() => window.LCNDA_EXT.enquetePhoto.current?.inq?.id || 0); out.docs.freeId = free.r.id;
            await p.evaluate(() => document.querySelector('dialog.ep-dlg')?.close()); await sleep(600);
            await p.evaluate(() => document.querySelectorAll('.toast, [class*="toast"]').forEach(t => { if (t.querySelector('button')) t.remove(); }));
            await p.evaluate(id => document.querySelector(`#workspace [data-ong-epdel="${id}"]`)?.click(), free.r.id); await sleep(900);
            out.docs.deleted = !(await api('list')).inquiries.some(q => q.id === free.r.id);
            out.docs.cardGone = await p.evaluate(id => !document.querySelector(`#workspace [data-ong-ep="${id}"]`), free.r.id);
            out.docs.undo = await undoClick(); await sleep(900);
            out.docs.restored = (await api('list')).inquiries.some(q => q.id === free.r.id);
            out.docs.cardBack = await p.evaluate(id => !!document.querySelector(`#workspace [data-ong-ep="${id}"]`), free.r.id);
            out.docs.empty = await p.evaluate(async () => { const EP = window.LCNDA_EXT.enquetePhoto, g = EP._get; EP._get = (op, q) => (op === 'list' ? Promise.resolve({ inquiries: [] }) : g(op, q));
                try { document.querySelector('#sidebar-content [data-ong-mode="az"]')?.click(); await new Promise(r => setTimeout(r, 500)); document.querySelector('#sidebar-content [data-ong-mode="inquiries"]')?.click(); await new Promise(r => setTimeout(r, 900));
                    return (document.querySelector('#workspace [data-ong-cards]')?.textContent || '').replace(/\s+/g, ' '); } finally { EP._get = g; } });
            await p.evaluate(() => document.querySelector('#sidebar-content [data-ong-mode="az"]')?.click()); await sleep(400);
        }

        /* ═════ la suite, 2ᵉ partie : 📒 classement, 🏘 même lieu, 📝 m'apprend, 🎓 groupe, 🔄 dos, 🕳 années (heritage-enquete-photo-classement.js) ═════ */
        const q3 = out.c3 = {};
        { const g = (await api('get', { id: inqId })).inquiry, A = g.images.find(i => i.media_id === m['img004.png']), Bi = g.images.find(i => i.media_id === m['img011.png']);
            q3.ids = [A.id, Bi.id];
            php(`require 'lib/bootstrap.php'; $p = db(); $p->exec("UPDATE media SET place_id=1, date_text='1890' WHERE id=${m['img020.png']}");
                $p->exec("INSERT INTO families(id, partner1_id, partner2_id) VALUES(61, 1, 2), (62, 4, 6)"); $p->exec("INSERT INTO family_children(family_id, child_id) VALUES(61, 4)");
                $p->exec("INSERT INTO media_tags(media_id, person_id, x, y, w, h) VALUES(${m['img004.png']}, 4, 60, 20, 10, 15)");`);
            await post('update', { id: inqId, settings: { ...g.settings, growth: [{ who: 'le petit', ages: { [A.id]: 8, [Bi.id]: 3 } }], albumOrder: [A.id, Bi.id] } });
            const job = await post('clue_save', { inquiry_id: inqId, kind: 'gens', text: 'Tablier de cuir du forgeron', certainty: 'supposed' }); q3.jobClue = job.r?.clue?.id;
        }
        await p.evaluate(id => window.LCNDA_EXT.enquetePhoto.open(id), inqId); await p.waitForSelector(`${D} .ep-chip`); await sleep(500);
        q3.aides = await p.evaluate(d => { const t = window.LCNDA_EXT.enquetePhoto.current; t.st.panel = 'aides'; t.renderSide(); return ['classement', 'memelieu', 'apprend', 'groupe', 'dos2', 'trous'].filter(k => document.querySelector(`${d} [data-ep-aidek="${k}"]`)); }, D);
        // 📒 classement : B après A alors que « le petit » y paraît plus jeune → signalé ; ↓ → plus rien ; l'ordre gardé
        await PL('classement'); await p.waitForSelector('dialog.h-modal[open] [data-c3-list]', { timeout: 5000 });
        q3.cls = await p.evaluate(() => ({ rows: document.querySelectorAll('dialog.h-modal[open] [data-c3-id]').length, issues: [...document.querySelectorAll('dialog.h-modal[open] .ep3-issues li')].map(l => l.textContent), bad: document.querySelectorAll('dialog.h-modal[open] .ep3-oi.is-bad').length }));
        q3.dlgs = await p.evaluate(() => [...document.querySelectorAll('dialog[open]')].map(d => d.className));
        await p.evaluate(id => document.querySelector(`dialog.h-modal[open] [data-c3-down="${id}"]`)?.click(), q3.ids[0]); await sleep(300);
        q3.cls2 = await p.evaluate(() => ({ ok: document.querySelector('dialog.h-modal[open] .ep3-ok')?.textContent || '', first: document.querySelector('dialog.h-modal[open] [data-c3-id]')?.dataset.c3Id }));
        await p.evaluate(() => document.querySelector('dialog.h-modal[open] [data-c3-keep]')?.click()); await sleep(900);
        await closeSub(); await sleep(700);
        { const g = (await api('get', { id: inqId })).inquiry; q3.saved = g.settings.albumOrder; q3.keep = g.clues.find(c => c.data?.albumOrder) || null; }
        // 🏘 le même lieu à travers le temps (Brive) : la photo posée à Brive (1890) d'abord, puis celles de l'enquête (1905)
        q3.tl = await api('place_timeline', { place_id: 1 });
        await PL('memelieu'); await p.waitForSelector('dialog.h-modal[open] .ep3-ty', { timeout: 8000 }).catch(() => null);
        q3.tlUi = await p.evaluate(() => [...document.querySelectorAll('dialog.h-modal[open] .ep3-yr')].map(y => y.textContent));
        await closeSub();
        // 📝 cette photo m'apprend : Jean MAZAUD (relié) habite Brive ; forgeron ; « ＋ Ajouter à la fiche » : un événement et sa source, puis ↶ Annuler
        await p.evaluate(() => window.LCNDA_EXT.enquetePhoto.current.reload()); await sleep(400);
        await PL('apprend'); await p.waitForSelector('dialog.h-modal[open] .ep3-fact', { timeout: 8000 }).catch(() => null);
        q3.facts = await p.evaluate(() => [...document.querySelectorAll('dialog.h-modal[open] .ep3-fact')].map(f => f.textContent.replace(/\s+/g, ' ').trim()));
        const evCount = () => JSON.parse(php(`require 'lib/bootstrap.php'; $p = db(); echo json_encode(['ev' => (int) $p->query("SELECT count(*) FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=1 AND t.gedcom_tag='RESI' AND e.place_id=1")->fetchColumn(), 'src' => (int) $p->query("SELECT count(*) FROM sources WHERE title LIKE 'Enquête photo%'")->fetchColumn(), 'link' => (int) $p->query("SELECT count(*) FROM source_links sl JOIN events e ON sl.entity_type='event' AND e.id=sl.entity_id WHERE e.person_id=1")->fetchColumn()]);`));
        q3.before = evCount();
        await p.evaluate(() => document.querySelectorAll('.toast, [class*="toast"]').forEach(t => { if (t.querySelector('button')) t.remove(); }));
        await p.evaluate(() => [...document.querySelectorAll('dialog.h-modal[open] .ep3-fact')].find(f => /Jean MAZAUD/.test(f.textContent) && /résidence/.test(f.textContent))?.querySelector('[data-c3-fact]')?.click()); await sleep(1500);
        q3.added = evCount(); q3.btn = await p.evaluate(() => [...document.querySelectorAll('dialog.h-modal[open] [data-c3-fact]')].map(b => b.textContent.trim()));
        q3.undo = await undoClick(); await sleep(800); q3.undone = evCount();
        await closeSub();
        // 🎓 photo de groupe : classe de 1912 à Brive (Pierre MAZAUD, 8 ans) ; conscrits de 1924 ; noce de Pierre (1930) : Lucie, Jean, Marie
        q3.school = (await api('group_expected', { id: inqId, kind: 'school', year: 1912, place_id: 1 })).people.map(x => [x.name, x.age, x.role]);
        q3.conscrits = (await api('group_expected', { id: inqId, kind: 'conscrits', year: 1924, place_id: 1 })).people.map(x => x.name);
        q3.wedding = (await api('group_expected', { id: inqId, kind: 'wedding', year: 1930, person_ids: '4' })).people.map(x => [x.name, x.role]);
        await PL('groupe'); await p.waitForSelector('dialog.h-modal[open] [data-c3-kind]', { timeout: 5000 });
        await p.evaluate(() => { const d = document.querySelector('dialog.h-modal[open]'); d.querySelector('[data-c3-kind="school"]').click(); const y = d.querySelector('[data-c3-year]'); y.value = '1912'; y.dispatchEvent(new Event('change', { bubbles: true })); }); await p.waitForSelector('dialog.h-modal[open] [data-c3-p]', { timeout: 6000 }).catch(() => null);
        q3.groupUi = await p.evaluate(() => [...document.querySelectorAll('dialog.h-modal[open] .ep3-group li')].map(l => l.textContent.replace(/\s+/g, ' ').trim()));
        const pinsBefore = (await api('get', { id: inqId })).inquiry.settings.people || {};
        await p.evaluate(() => document.querySelector('dialog.h-modal[open] [data-c3-p="0"]')?.click()); await sleep(150);
        await p.evaluate(() => document.querySelector('dialog.h-modal[open] [data-c3-place]')?.click()); await sleep(1200);
        { const pp = (await api('get', { id: inqId })).inquiry.settings.people || {}; q3.placed = Object.values(pp).flat().filter(x => x && x.person_id === 4 && x.certainty === 'supposed').length; q3.pinsUi = await p.evaluate(d => document.querySelectorAll(`${d} .ep2-pin`).length, D); }
        q3.placeUndo = await undoClick(); await sleep(800);
        q3.unplaced = Object.values((await api('get', { id: inqId })).inquiry.settings.people || {}).flat().filter(x => x && x.person_id === 4).length; q3.pinsBack = JSON.stringify(pinsBefore) === JSON.stringify((await api('get', { id: inqId })).inquiry.settings.people || {});
        await p.evaluate(() => { window.LCNDA_EXT.enquetePhotoSuite?.togglePeople?.(window.LCNDA_EXT.enquetePhoto.current.api(), false); });
        // 🔄 les dos : l'image B marquée « verso » ; ses dos ; aussi ceux des autres enquêtes ; « même lot » gardé comme indice
        await post('image_save', { image_id: q3.ids[1], side: 'verso' });
        q3.versos = (await api('versos', { id: inqId })).versos.map(v => [v.image_id, v.inquiry_id]);
        q3.versosAll = (await api('versos', { id: inqId, all: 1 })).versos.length;
        await p.evaluate(() => window.LCNDA_EXT.enquetePhoto.current.reload()); await sleep(400);
        await PL('dos2'); await p.waitForSelector('dialog.h-modal[open] .ep3-back', { timeout: 6000 }).catch(() => null);
        q3.backsUi = await p.evaluate(() => document.querySelectorAll('dialog.h-modal[open] .ep3-back').length);
        await closeSub(); await post('image_save', { image_id: q3.ids[1], side: '' });
        // 🕳 les années sans photo de Pierre MAZAUD (1904–1980) : une photo vers 1910 (date de l'enquête) ; les trous
        q3.years = await api('person_years', { person_id: 4 });
        await p.evaluate(() => window.LCNDA_EXT.enquetePhotoClassement.gaps(window.LCNDA_EXT.enquetePhoto.current.api(), 4)); await p.waitForSelector('dialog.h-modal[open] .ep3-strip', { timeout: 6000 }).catch(() => null);
        q3.gapsUi = await p.evaluate(() => ({ cells: document.querySelectorAll('dialog.h-modal[open] .ep3-cell').length, on: document.querySelectorAll('dialog.h-modal[open] .ep3-cell.is-on').length, gaps: [...document.querySelectorAll('dialog.h-modal[open] .ep3-gaps li')].map(l => l.textContent.replace(/\s+/g, ' ').trim()) }));
        await closeSub();
        // ⚙️ Personnaliser : les réglages de la 2ᵉ partie ; 390 px : la fenêtre du classement ne déborde pas
        await p.evaluate(() => window.LCNDA_EXT.enquetePhoto.current.openPrefs()); await sleep(300);
        q3.prefs = await p.evaluate(() => ['ageTol', 'schoolFrom', 'schoolTo', 'gapMin'].filter(k => document.querySelector(`dialog.h-modal[open] [data-pf="${k}"]`)));
        await closeSub();
        await p.setViewportSize({ width: 390, height: 844 }); await sleep(300);
        await PL('classement'); await p.waitForSelector('dialog.h-modal[open] [data-c3-list]', { timeout: 5000 });
        q3.narrow = await p.evaluate(() => { const d = document.querySelector('dialog.h-modal[open]'), r = d.getBoundingClientRect(); return { left: r.left, right: r.right, vw: innerWidth, rows: [...d.querySelectorAll('.ep3-oi')].every(x => x.getBoundingClientRect().right <= innerWidth + 1) }; });
        await closeSub(); await p.setViewportSize({ width: 1440, height: 900 });
        if (q3.jobClue) await post('clue_delete', { id: q3.jobClue });
        php(`require 'lib/bootstrap.php'; db()->exec("DELETE FROM media_tags WHERE person_id=4");`);
        await p.evaluate(() => document.querySelector('dialog.ep-dlg')?.close()); await sleep(500);

        /* ═════ mode consultation : lecture seule ═════ */
        const kin = await p.evaluate(() => window.LCNDA_APP.api('kiosk_enter', {}, { method: 'POST', body: { password: 'secret-1234' } }).then(() => true, e => e.message));
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_EXT?.enquetePhoto && document.body.classList.contains('is-kiosk'), null, { timeout: 30000 });
        await p.evaluate(id => window.LCNDA_EXT.enquetePhoto.open(id), inqId); await p.waitForSelector(`${D} .ep-chip`); await sleep(500);
        out.kiosk = { entered: kin, circleDisabled: await p.$eval(`${D} [data-ep-tool="circle"]`, b => b.disabled), status: await p.$eval(`${D} [data-ui-status]`, e => e.textContent), add: await p.evaluate(d => !!document.querySelector(`${d} [data-ep-add]`), D), x: await p.evaluate(d => !!document.querySelector(`${d} [data-ep-imgx], ${d} [data-ep-delinq]`), D) };
        out.kioskWrite = await post('clue_save', { inquiry_id: inqId, text: 'test', certainty: 'supposed' });
        // 🔢 en consultation : la personne vivante reliée au n° 3 n'est jamais nommée (ni la fiche, ni le serveur) ; la légende le dit
        { const g = (await api('get', { id: inqId })).inquiry, e = Object.entries(g.settings.people || {}).find(([, L]) => L.some(x => x.id === 'pm3'));
            out.suite.kiosk = { m3: e ? e[1].find(x => x.id === 'pm3') : null, privNames: g.private_names };
            if (e) { out.suite.kiosk.legend = await p.evaluate(([d, iid]) => { const t = window.LCNDA_EXT.enquetePhoto.current; t.st.cur = t.images.findIndex(x => x.id === Number(iid)); t.renderStage(); return new Promise(r => setTimeout(() => r(document.querySelector(`${d} [data-ep2-legend]`)?.textContent.replace(/\s+/g, ' ') || ''), 900)); }, [D, e[0]]); } }
        // la 2ᵉ partie en consultation : la photo de Marie (vivante) n'est pas dans « le même lieu » ; ses années sans photo non plus
        out.c3.kTl = (await api('place_timeline', { place_id: 1 })).photos.map(x => x.media_id);
        out.c3.kYears = await p.evaluate(() => window.LCNDA_APP.api('ep', { op: 'person_years', person_id: 2 }).then(() => 'ok', e => e.message));
        await p.evaluate(() => document.querySelector('dialog.ep-dlg')?.close());
        await p.evaluate(() => window.LCNDA_APP.api('kiosk_exit', {}, { method: 'POST', body: { password: 'secret-1234' } }).catch(() => null));
        out.errs = errs;
    } finally { await browser.close(); proc.kill(); fake.close(); }
}

(async () => {
    const out = {};
    /* ─── 1. sans navigateur ─── */
    const r = C.shadowMonths(45.16, 44, 6);
    const d = C.shadowOnDate(45.16, 44, 7, 14);
    const ut = d.morning - 1.53 / 15 + 5.8 / 60, meeus = L.topo('sun', L.jd(1911, 7, 14, ut), 45.16, 1.53);
    const ex = C.readExif(jpegWithExif());
    const checks = [
        ['☀️ hauteur du soleil d’après l’objet et son ombre : ombre aussi longue que l’objet → 45°', () => assert.equal(Math.round(C.elevationFrom(100, 100)), 45)],
        ['☀️ lat 45,16, soleil à 44° (± 6°) : possible à midi à l’équinoxe (mars), impossible de novembre à février (donc décembre, janvier)', () => {
            assert.ok(r.noon.includes(3), JSON.stringify(r.noon)); assert.ok(r.impossible.includes(12) && r.impossible.includes(1), JSON.stringify(r.impossible));
            assert.deepEqual(r.impossible, [1, 2, 11, 12]); assert.ok(C.sunAlt(45.16, C.declination(C.doy(3, 20)), 12) > 38 && C.sunAlt(45.16, C.declination(C.doy(3, 20)), 12) < 50); }],
        ['☀️ de mai à août : le matin et l’après-midi, pas à midi (le soleil est plus haut)', () => { const s = r.other.find(o => o.months.includes(6)); assert.ok(s && s.ranges.length === 2 && s.ranges[0][1] < 12 && s.ranges[1][0] > 12, JSON.stringify(r.other)); }],
        ['☀️ 14 juillet : vers 8 h 45 (heure du soleil), soleil à l’est-sud-est ; l’ombre vers la droite → la photo regarde vers le sud', () => {
            assert.equal(C.hhmm(d.morning), '8 h 45'); assert.equal(C.compass(d.azMorning), 'est-sud-est'); assert.match(C.compass(C.facing(d.azMorning, 'right')), /^sud/); }],
        ['☀️ mêmes chiffres que le calcul de Meeus de l’app (app-lune-core.js) : à moins de 0,5°', () => { assert.ok(Math.abs(meeus.alt - 44) < 0.5, meeus.alt); assert.ok(Math.abs(meeus.az - d.azMorning) < 1.5, `${meeus.az} / ${d.azMorning}`); }],
        ['☀️ deux objets qui ne donnent pas le même soleil : signalé', () => { assert.equal(C.agree([44, 46]).ok, true); assert.equal(C.agree([30, 50]).ok, false); }],
        ['🏷 EXIF lu sur l’ordinateur : date, appareil, GPS', () => { assert.ok(ex, 'EXIF'); assert.equal(ex.date, '1987-07-14 10:12'); assert.equal(ex.make, 'FICTIF'); assert.ok(Math.abs(ex.lat - 45.16) < 0.001 && Math.abs(ex.lon - 1.53) < 0.001, `${ex.lat},${ex.lon}`); }],
        ['📏 frise : « pas avant 1904 » et « pas après 1915 » → 1904-1915 ; un indice réfuté ne compte pas', () => { const w = C.dateWindow([{ id: 1, date_from: 1904, certainty: 'probable' }, { id: 2, date_to: 1915, certainty: 'probable' }, { id: 3, date_from: 1950, certainty: 'refuted' }]); assert.deepEqual([w.from, w.to, w.conflict], [1904, 1915, false]); }],
        ['🤖 l’IA : « Supposé » au plus ; ↑ un cran ne mène jamais seul à « Prouvé »', () => { assert.equal(C.capAi('proven'), 'supposed'); assert.equal(C.bump('probable'), 'probable'); assert.equal(C.bump('supposed'), 'probable'); }],
        ['🎨 canal de couleur : le bleu seul, le négatif (pixels calculés sur l’ordinateur)', () => { const px = new Uint8ClampedArray([200, 100, 50, 255, 10, 20, 30, 128]); C.channel(px, 'b'); assert.deepEqual([...px], [50, 50, 50, 255, 30, 30, 30, 128]); const n = new Uint8ClampedArray([200, 100, 50, 255]); C.channel(n, 'neg'); assert.deepEqual([...n], [55, 155, 205, 255]); const e = C.emboss(new Uint8ClampedArray(16).fill(90), 2, 2); assert.equal(e[0], 128); }],
        ['📏 mesurer : porte de 2 m (± 10 %) → un segment 0,85 fois plus long fait 1,70 m, avec sa marge', () => { const r = C.measure([{ len: 200 }, { len: 170 }], 0, 2, 0.1); assert.equal(Math.round(r[1].value * 100), 170); assert.ok(r[1].lo < 1.6 && r[1].hi > 1.8 && r[1].rel > 0.1, JSON.stringify(r[1])); assert.deepEqual(C.measure([{ len: 0 }], 0, 2), []); }],
        ['👪 qui pourrait-ce être : Pierre MAZAUD (né en 1904, à 5 km) colle pour « 6 ans vers 1910 » ; Louise DURAND (morte en 1900) non, avec pourquoi', () => {
            const a = C.whoFits({ birth: 1904, death: 1980, km: 5, gender: 'male' }, { age: 6, spread: 2, from: 1909, to: 1912, hasPlace: true }), b = C.whoFits({ birth: 1850, death: 1900 }, { age: 6, from: 1909, to: 1912 });
            assert.equal(a.fit, true); assert.deepEqual(a.yes.map(x => x.k), ['age', 'place']); assert.equal(b.fit, false); assert.ok(b.no.some(x => x.k === 'dead' && x.y === 1900) && b.no.some(x => x.k === 'age'), JSON.stringify(b));
            assert.equal(C.whoFits({ birth: 1904, gender: 'female' }, { age: 6, from: 1910, gender: 'male' }).fit, false); }],
        ['🧭 boussole : un point à 0,5 km à l’est est dans un cône vers l’est (60°), pas dans un cône vers l’ouest ; le cône se dessine', () => { const c = { lat: 45.16, lon: 1.53, az: 90, fov: 60, km: 1 }, q = C.destPoint(45.16, 1.53, 95, 0.5);
            assert.equal(C.inCone(c, q).inside, true); assert.equal(C.inCone({ ...c, az: 270 }, q).inside, false); assert.equal(C.inCone({ ...c, km: 0.3 }, q).inside, false); assert.ok(Math.abs(C.bearing(c, q) - 95) < 0.5); assert.equal(C.cone(c, 6).length, 9); }],
        ['☑ « Ai-je tout regardé ? » et 🌡 niveau proposé (débutée → avancée → résolue), temps passé', () => { assert.deepEqual(C.checklistProgress({ checklist: { coins: 1, dos: 1 } }), { done: 2, total: 10, all: false });
            assert.equal(C.levelOf({ clues: [] }).level, 'debutee'); assert.equal(C.levelOf({ clues: [{}, {}, {}] }).level, 'avancee'); assert.equal(C.levelOf({ conclusion: { place: { certainty: 'probable' }, date: { certainty: 'proven' } } }).level, 'resolue');
            assert.deepEqual(C.levelOf({ settings: { level: 'impossible' } }), { level: 'impossible', chosen: true }); assert.equal(C.fmtDur(3900), '1 h 05'); assert.equal(C.fmtDur(30), ''); }],
        ['👤 une proposition de visage : « Supposé » seule, « Probable » confirmée, jamais « Prouvé »', () => { assert.equal(C.capFace('proven', false), 'supposed'); assert.equal(C.capFace('proven', true), 'probable'); assert.equal(C.capFace('probable', false), 'supposed'); assert.equal(C.capFace('refuted', true), 'refuted'); }],
        ['😈 avocat du diable : le lieu, la date et les indices sûrs à mettre à l’épreuve ; une fois « à chercher », marqué fait', () => { const t = C.devilTargets({ conclusion: { place: { name: 'Brive', certainty: 'probable' }, date: { text: 'vers 1910', certainty: 'probable' } }, clues: [{ id: 7, num: 2, text: 'HÔTEL', certainty: 'proven' }, { id: 8, text: 'À chercher : x', certainty: 'supposed', data: { todo: 1, against: 'place' } }] });
            assert.deepEqual(t.map(x => x.k), ['place', 'date', 'c7']); assert.equal(t[0].done, true); assert.equal(t[1].done, false); }],
        ['🏗 construction : « Gare de Brive » (1860) reconnue dans l’indice « une gare » → pas avant 1860 ; démolie en 1950 → pas après', () => { const r = C.matchBuildings([{ id: 1, text: 'Une gare avec une horloge', certainty: 'supposed' }, { id: 2, text: 'Clocher', certainty: 'refuted' }], [{ name: 'Gare de Brive', built: 1860, km: 0.8 }, { name: 'Église Saint-Martin', dates: '12e siècle ; 1880' }]);
            assert.equal(r.length, 1); assert.equal(r[0].from, 1860); assert.deepEqual(C.buildingDates({ built: 1890, gone: 1950 }), { from: 1890, to: 1950 }); assert.equal(C.buildingDates({ dates: 'vers 1880' }).from, 1880); }],
        ['👶 croissance : deux enfants, trois images → l’ordre B, A, C et les écarts en années', () => { const g = C.growthOrder([{ ages: { 1: 8, 2: 3, 3: 12 } }, { ages: { 1: 5, 2: 0, 3: 9 } }], [1, 2, 3]); assert.deepEqual(g.order, ['2', '1', '3']); assert.deepEqual(g.t, { 1: 5, 2: 0, 3: 9 }); assert.equal(g.spread, 0); }],
        ['🏙 profil des toits : la même ligne à une autre échelle → écart 0', () => { assert.equal(C.lineGap(C.normLine([[0, 0.5], [0.5, 0.2], [1, 0.6]]), C.normLine([[0, 0.25], [1, 0.1], [2, 0.3]])), 0); assert.ok(C.lineGap(C.normLine([[0, 0], [1, 1]]), C.normLine([[0, 1], [1, 0]])) > 0.4); }],
        // la suite (heritage-enquete-photo-suite.js), sans navigateur
        ['✍ en une phrase : la prudence suit la certitude (Prouvé → rien, Probable → « sans doute », Supposé → « peut-être »)', () => {
            assert.equal(C.sentence({ place: { name: 'Brive', certainty: 'proven' }, date: { text: '1910', certainty: 'proven' } }), 'Cette photo a été prise à Brive en 1910.');
            assert.equal(C.sentence({ place: { name: 'Brive', certainty: 'probable' }, date: { text: 'vers 1910', certainty: 'probable' } }), 'Cette photo a sans doute été prise à Brive vers 1910.');
            assert.equal(C.sentence({ place: { name: 'Tulle', certainty: 'proven' }, date: { text: 'vers 1910', certainty: 'supposed' } }), 'Cette photo a été prise à Tulle, peut-être vers 1910.');
            assert.equal(C.sentence({ date: { text: '14 juillet 1911', certainty: 'supposed' } }), 'Cette photo a peut-être été prise le 14 juillet 1911.'); assert.equal(C.sentence({}), ''); }],
        ['🔢 légende : « 1 : inconnu, 2 : Jean MAZAUD ? » ; un vivant relié ou écrit à la main n’est pas nommé en partage sans risque', () => {
            assert.deepEqual(C.legendLines([{ n: 2, label: 'Jean MAZAUD', certainty: 'supposed' }, { n: 1 }]).map(l => `${l.n} : ${l.text}`), ['1 : inconnu', '2 : Jean MAZAUD ?']);
            const safe = C.legendLines([{ n: 1, person_id: 2, certainty: 'probable' }, { n: 2, label: 'Marie LACOMBE ?' }, { n: 3, label: 'Paul DURAND', certainty: 'proven' }], { people: { 2: { name: 'Marie LACOMBE', private: true } }, safe: true, privNames: ['Marie LACOMBE'] });
            assert.deepEqual(safe.map(l => l.text), ['Personne confidentielle', 'Personne confidentielle', 'Paul DURAND']); assert.equal(safe[0].person_id, 0); assert.equal(C.nextNumber([{ n: 1 }, { n: 3 }]), 2); }],
        ['▦ grille : 3 × 3, 4 × 4, 6 × 6 ; les cases cochées comptées une fois ; la case d’un point', () => {
            assert.deepEqual(C.GRID_SIZES, [3, 4, 6]); assert.deepEqual(C.gridProgress({ n: 3, done: [0, 4, 4, 12] }), { n: 3, done: 2, total: 9, all: false }); assert.equal(C.gridProgress({ n: 4, done: [...Array(16).keys()] }).all, true);
            assert.equal(C.gridProgress({ n: 5 }).n, 3); assert.equal(C.gridCell(0.99, 0.99, 6), 35); assert.equal(C.gridCell(0.5, 0.1, 3), 1); }],
        ['🔍 double loupe : la zone vue reste dans l’image ; la position liée suit le décalage choisi', () => {
            const r = C.lensRect(0.99, 0.5, 4, 1000, 800, 320, 320); assert.ok(r.x + r.w <= 1 + 1e-9 && Math.abs(r.w - 0.08) < 1e-9, JSON.stringify(r)); assert.deepEqual(C.linkedPoint({ x: 0.5, y: 0.5 }, { dx: 0.1, dy: -0.6 }), { x: 0.6, y: 0 }); }],
        ['👻 silhouette : le contour posé sur une autre image, agrandi, aux proportions de l’autre image', () => {
            const g = C.ghostOn([[0.4, 0.2], [0.6, 0.2], [0.5, 0.6]], { k: 1.5, ratio: 0.5, dx: 0.1 }); assert.ok(Math.abs(g.h - 0.3) < 1e-9, String(g.h)); assert.ok(Math.abs(g.box.x - 0.45) < 1e-9); assert.equal(C.ghostOn([[0, 0], [1, 1]]), null); }],
        ['🗺 tournée : les photos par année, les années inconnues à la fin', () => assert.deepEqual(C.byYear([{ year: 1912 }, { year: null }, { year: 1905 }, { year: 1912 }]).map(g => [g.year, g.photos.length]), [[1905, 1], [1912, 2], [null, 1]])],
        ['📜 ce qui a changé : seulement les lignes « ⚖ » du journal, dans l’ordre', () => assert.deepEqual(C.conclusionHistory([{ id: 3, what: '⚖ Conclusion : le lieu', created_at: '2026-02-01' }, { id: 2, what: 'Indice 1 ajouté', created_at: '2026-01-01' }, { id: 1, what: '⚖ Certitude de l’indice 1', created_at: '2026-01-15' }]).map(j => j.id), [1, 3])],
        // la suite, 2ᵉ partie (heritage-enquete-photo-classement.js), sans navigateur
        ['📒 classement d’un album : B placée avant A alors que l’enfant y paraît plus jeune → contradiction ; « pas avant 1910 » avant « pas après 1905 » → contradiction ; le bon ordre : rien', () => {
            const ages = [{ who: 'le petit', ages: { 1: 8, 2: 3 } }];
            const bad = C.albumCheck(['1', '2'], { ages }), good = C.albumCheck(['2', '1'], { ages });
            assert.equal(bad.issues.length, 1); assert.deepEqual([bad.issues[0].kind, bad.issues[0].a, bad.issues[0].b, bad.issues[0].ageA, bad.issues[0].ageB], ['age', '1', '2', 8, 3]); assert.deepEqual(good.issues, []); assert.ok(good.checked >= 1);
            assert.equal(C.albumCheck(['1', '2'], { ages: [{ ages: { 1: 4, 2: 3.5 } }], tol: 1 }).issues.length, 0, 'un écart d’âge toléré');
            const d = C.albumCheck(['a', 'b'], { windows: { a: { from: 1910 }, b: { to: 1905 } } }); assert.deepEqual(d.issues.map(x => [x.kind, x.from, x.to]), [['date', 1910, 1905]]); assert.ok(d.bad.has('a') && d.bad.has('b'));
            const w = C.imageWindows([{ id: 1, date_from: 1904, certainty: 'probable', images: { 7: 'yes' } }, { id: 2, date_to: 1915, certainty: 'probable', images: {} }, { id: 3, date_to: 1900, certainty: 'refuted' }], [7, 8]);
            assert.deepEqual(w, { 7: { from: 1904, to: 1915 }, 8: { from: null, to: 1915 } }); }],
        ['🕳 années sans photo : 1900–1930, photos en 1905, 1906, 1920 → les trous de 3 ans et plus, le plus long d’abord ; 10 % des années', () => {
            const g = C.yearGaps([1905, 1906, 1920, 1850], 1900, 1930, 3); assert.deepEqual(g.have, [1905, 1906, 1920]); assert.deepEqual(g.gaps, [[1907, 1919], [1921, 1930], [1900, 1904]]); assert.equal(g.cover, 10);
            assert.deepEqual(C.yearGaps([1901], 1900, 1902, 3).gaps, []); }],
        ['📝 cette photo m’apprend : lieu Probable + date exacte → résidence (« vers 1911 ») et présence datée ; un métier ; rien sans personne, rien de réfuté', () => {
            const f = C.learnFacts({ conclusion: { place: { place_id: 1, name: 'Brive', certainty: 'probable' }, date: { text: '14 juillet 1911', from: 1911, to: 1911, certainty: 'proven' } }, people: [{ id: 3, name: 'Paul DURAND' }], jobs: [{ word: 'forgeron', certainty: 'supposed' }] });
            assert.deepEqual(f.map(x => [x.kind, x.date_text, x.certainty]), [['residence', 'vers 1911', 'probable'], ['presence', '14 juillet 1911', 'probable'], ['occupation', 'vers 1911', 'supposed']]);
            assert.deepEqual(C.learnFacts({ conclusion: { place: { place_id: 1, certainty: 'proven' } }, people: [] }), []);
            assert.deepEqual(C.learnFacts({ conclusion: { place: { place_id: 1, certainty: 'refuted' }, date: { text: 'entre 1905 et 1915', from: 1905, certainty: 'probable' } }, people: [{ id: 1, name: 'x' }] }), []);
            assert.deepEqual(C.learnFacts({ conclusion: { place: { place_id: 1, name: 'Brive', certainty: 'probable' }, date: { text: 'entre 1905 et 1915', from: 1905, certainty: 'probable' } }, people: [{ id: 1, name: 'x' }] }).map(x => [x.kind, x.date_text]), [['residence', 'entre 1905 et 1915']]); }],
    ];
    if (chromium) {
        try { await browserPart(out); } catch (e) { console.error(e); out.fatal = e.message; }
        checks.push(
            ['navigateur : la page s’est ouverte sans erreur fatale', () => assert.ok(!out.fatal, out.fatal)],
            ['§ 1 : « 🔎 Enquêter » sur la page du document, à côté de l’Atelier ; « 📁 Ranger » juste après (ou dans « ⋯ », K5 : 2 boutons au plus)', () => { assert.equal(out.button.text, '🔎 Enquêter'); const a = out.button.acts; const i = a.findIndex(x => /Enquêter/.test(x)); assert.ok(i >= 0 && /Atelier/.test(a[i - 1] || ''), JSON.stringify(a)); assert.ok(/Ranger/.test(a[i + 1] || '') || out.button.more.some(x => /Ranger/.test(x)), JSON.stringify(out.button)); }],
            ['§ 1 : clic droit sur une image, « 📤 Envoyer vers… », Listes → Outils de modification', () => { assert.ok(out.ctxItem.some(l => /Enquêter sur cette photo|Enquête photo/.test(l)), JSON.stringify(out.ctxItem)); assert.ok(out.sendTarget); assert.ok(out.toolEntry); }],
            ['§ 2 bis : une enquête avec 2 images (A, B), côte à côte', () => { assert.deepEqual(out.twoImages.chips, ['A', 'B']); assert.ok(out.twoImages.views); assert.equal(out.side, 2); }],
            ['§ 2 : ◯ entourer → un indice numéroté, sur son propre calque, gardé', () => { const l = out.layer.layers.find(x => /^1 · Clocher/.test(x.name)); assert.ok(l && l.t === 'circle' && l.clue, JSON.stringify(out.layer)); assert.deepEqual(out.layer.clues[0], [1, 'Clocher à bulbe', 'supposed', 1]); assert.ok(out.svgShape >= 1); }],
            ['§ 3 : la certitude ; une réponse de l’IA reste « Supposé » même demandée « Prouvé »', () => { assert.equal(out.cert.proven, 'proven'); assert.equal(out.cert.ia, 'supposed'); assert.equal(out.cert.from, 1904); assert.ok(out.clueList.some(c => /HÔTEL DE LA POSTE/.test(c.t) && /Prouvé/i.test(c.badge || '')), JSON.stringify(out.clueList)); assert.ok(out.matrix); }],
            ['§ 3 : « 📍 Mettre ce lieu sur la photo » remplit le lieu et la date ; ↶ Annuler les retire', () => { assert.deepEqual(out.applied, { date: 'entre 1905 et 1915', place: 'Brive-la-Gaillarde' }); assert.ok(out.undoApply, JSON.stringify(out.toastsApply)); assert.deepEqual(out.afterUndo, { date: '', place: '' }); }],
            ['🔤 essayer une police : le texte posé sur la photo (4 coins), la note gardée', () => { assert.ok(out.overlay && /HOTEL DE LA P\?STE/.test(out.overlay.text) && out.overlay.transform === 'matrix3d(' && out.overlay.handles === 4, JSON.stringify(out.overlay)); assert.equal(out.font.rating.overall, 'good'); assert.deepEqual(out.font.rating.letters.slice(0, 2), ['good', 'half']); assert.equal(out.font.font, 'serif'); assert.ok(out.keptList >= 1); }],
            ['🔤 « Supposé » au plus tout seul ; « Probable » seulement confirmé par un autre indice ; jamais « Prouvé »', () => { assert.equal(out.font.cert, 'supposed'); assert.equal(out.fontCap.proven, 'supposed'); assert.equal(out.fontCap.confirmed, 'probable'); assert.equal(out.fontCap.self, 'supposed'); }],
            ['🤖 IA : une observation sans cadre ou qui nomme quelqu’un est jetée ; « je ne sais pas » gardé ; l’image envoyée à Ollama seulement', () => { assert.equal(out.ai.n, 1, JSON.stringify(out.ai)); assert.equal(out.ai.dropped, 2); assert.equal(out.ai.cert, 'supposed'); assert.ok(/aucun nom de lieu/.test(out.ai.unknown)); assert.deepEqual(out.ai.box, [0.74, 0.22, 0.11, 0.6]); assert.ok(out.aiPrompt.images === 1 && out.aiPrompt.format === 'json' && out.aiPrompt.rules, JSON.stringify(out.aiPrompt)); }],
            ['🤖 IA : « Oui, c’est ça » → un indice « Supposé »', () => assert.ok(out.aiClue.length >= 2 && out.aiClue.every(c => c === 'supposed'), JSON.stringify(out.aiClue))],
            ['☀️ dans l’écran : 44°, Brive, 14 juillet 1911 → pas en décembre, 8 h 45, vers le sud', () => { assert.match(out.shadowUi, /environ 44°/); assert.match(out.shadowUi, /pas de novembre à février/); assert.match(out.shadowUi, /8 h 45/); assert.match(out.shadowUi, /vers le sud/); }],
            ['§ 2 bis : ✂ Séparer sort l’image avec ses indices ; ↶ Annuler remet tout', () => { assert.equal(out.separated, 1); assert.ok(out.undoSep); assert.deepEqual(out.afterSep, { images: 2, clue: true }); }],
            ['§ 1 : le bouton devient « 🔎 Enquête · N indices · lieu probable »', () => assert.match(out.buttonAfter || '', /Enquête · \d+ indices · lieu probable/)],
            ['§ 6 : comparer en ligne bloqué pour une personne vivante (aucun lien vers les sites) ; une photo sans personne : permis', () => { assert.equal(out.privacy.blocked, true); assert.ok(out.privacy.reasons.includes('living')); assert.match(out.blocked, /vivante/); assert.equal(out.blockedLinks, 0); assert.equal(out.privacyFree.blocked, false); }],
            ['supprimer une enquête : ↶ Annuler la remet', () => { assert.equal(out.deleted, false); assert.ok(out.undoDel); assert.equal(out.restored, true); }],
            ['mode consultation : lecture seule (outils grisés, rien ne s’écrit)', () => { assert.equal(out.kiosk.entered, true); assert.equal(out.kiosk.circleDisabled, true); assert.match(out.kiosk.status, /lecture seule/); assert.equal(out.kiosk.add, false); assert.equal(out.kiosk.x, false); assert.equal(out.kioskWrite.ok, false); }],
            ['390 px en sombre : rien ne déborde de côté', () => { assert.ok(out.overflow.dlg <= 1 && out.overflow.side <= 1, JSON.stringify(out.overflow)); }],
            ['§ 5 : recherches proposées, chacune avec son « parce que… »', () => { assert.ok(out.searches.length >= 2 && out.searches.every(t => /^parce /.test(t)), JSON.stringify(out.searches)); }],
            ['§ 7 bis : la grille des aides (46 de la maquette + 🔤 police, ☀️ ombre, 🌐, 🤖) ; chacune s’ouvre sans erreur', () => { assert.ok(out.aidesCount >= 47, String(out.aidesCount)); assert.deepEqual(out.aideErr, []); const shut = Object.entries(out.aides).filter(([k, n]) => n < 1 && !['nearby', 'perspective', 'ombres'].includes(k)).map(([k]) => k); assert.deepEqual(shut, [], JSON.stringify(out.aides)); }],
            ['§ 7 ter : 🧰 Chercher dans les données, déjà rempli (le texte lu, le lieu supposé)', () => { assert.match(out.dataSearch.q || '', /HÔTEL DE LA POSTE/); assert.equal(out.dataSearch.place, 'Brive-la-Gaillarde'); assert.ok(out.dataSearch.rows >= 1); }],
            ['🎚️ Mieux voir : le panneau de l’atelier (3 recettes, canal Tout / Rouge / Vert / Bleu, 🔦 lumière rasante, Retenir, Remettre)', () => { assert.ok(out.better.open, JSON.stringify(out.better)); assert.deepEqual(out.better.recipes, ['pale', 'paper', 'verso']); assert.deepEqual(out.better.chans, ['', 'r', 'g', 'b']); assert.ok(out.better.rake && out.better.reset); assert.match(out.better.keep || '', /Retenir pour cette photo/); }],
            ['🎚️ « Encre pâle » change l’image affichée ; l’original ne change pas ; « Retenir » la garde avec l’enquête ; « Remettre comme au départ » remet tout', () => { assert.notEqual(out.betterPale.src, out.betterBefore.src, JSON.stringify([out.betterBefore, out.betterPale])); assert.equal(out.betterBefore.src, out.betterPale.orig);
                assert.equal(out.betterFile.before, out.betterFile.after); assert.equal(out.betterFile.filename, 'img004.png'); assert.ok(out.betterKept && Number(out.betterKept.clahe) === 60 && Number(out.betterKept.sharp) === 150, JSON.stringify(out.betterKept));
                assert.equal(out.betterReset.src, out.betterBefore.src); assert.equal(out.betterReset.filter, 'contrast(100%) brightness(100%)'); }],
            ['☑ ai-je tout regardé, 🌡 niveau : cochés, choisis, gardés avec l’enquête et montrés en haut', () => { assert.deepEqual(out.plusSaved.checklist, ['coins', 'reflets']); assert.match(out.checklistUi, /2/); assert.equal(out.plusSaved.level, 'avancee'); assert.match(out.levelBadge, /Avancée/); assert.match(out.levelBadge, /☑ 2\/10/); }],
            ['😈 avocat du diable : la conclusion (lieu, date) à l’épreuve → un indice « à chercher » (Supposé)', () => { assert.ok(out.devilTargets.some(t => /Brive/.test(t)) && out.devilTargets.some(t => /1905/.test(t)), JSON.stringify(out.devilTargets)); assert.ok(out.plusSaved.todo.some(([t, c, a]) => /^À chercher : Une carte de Tulle/.test(t) && c === 'supposed' && a === 'place'), JSON.stringify(out.plusSaved.todo)); }],
            ['👪 qui pourrait-ce être : Pierre MAZAUD colle (âge, lieu), Louise DURAND non ; ✓ Peut-être → un indice Supposé', () => { const pm = out.who.find(w => /MAZAUD/.test(w.t) && /Pierre/.test(w.t)); assert.ok(pm && pm.fit && /6 ans|ans à cette date/.test(pm.yes) && /km/.test(pm.yes), JSON.stringify(out.who)); assert.ok(!out.who.some(w => /Louise/.test(w.t) && w.fit));
                assert.ok(out.whoApi.people.some(x => x.name === 'Pierre MAZAUD' && x.km === 0)); assert.ok(out.plusSaved.who.some(([t, c, s]) => /Pierre MAZAUD/.test(t) && c === 'supposed' && s === 'famille'), JSON.stringify(out.plusSaved.who)); }],
            ['🏗 construction : l’indice « une gare » reconnu comme « Gare de Brive » (fiche d’édifice, 1860) → « pas avant 1860 » proposé', () => { assert.ok(out.buildSug.some(t => /Gare de Brive/.test(t) && /1860/.test(t)), JSON.stringify(out.buildSug)); assert.ok(out.plusSaved.built.some(([y, c]) => y === 1860 && c === 'supposed'), JSON.stringify(out.plusSaved.built)); }],
            ['🧭 boussole : le cône vers l’est montre la gare (0,8 km), vers l’ouest non ; le cône est sur la mini-carte', () => { assert.ok(out.compassEast.n >= 1 && out.compassEast.cone, JSON.stringify(out.compassEast)); assert.equal(out.compassWest, 0); }],
            ['🗺 carte des enquêtes : calque éteint au départ ; allumé, l’enquête placée à Brive apparaît ; éteint, il disparaît', () => { assert.equal(out.mapLayer.off, false); assert.equal(out.mapLayer.before, 0); assert.ok(out.mapLayer.on >= 1, JSON.stringify(out.mapLayer)); assert.equal(out.mapLayer.after, false); }],
            ['les 26 aides de plus s’ouvrent sans erreur ; 📋 le rapport d’expert a ses questions précises et la photo', () => { assert.deepEqual(out.plusErr, []); assert.ok(out.report.q && out.report.todo && out.report.img, JSON.stringify(out.report)); }],
            ['👤 Qui est-ce ? (étape « Les gens ») : l’outil local Visages propose Paul DURAND, d’après le visage identifié à la main ; l’indice reste « Supposé »', () => { assert.ok(out.facesStep); assert.ok(out.faces.some(t => /Paul DURAND/.test(t)), JSON.stringify(out.faces)); assert.ok(out.faceClue && out.faceClue.cert === 'supposed' && out.faceClue.person === 3 && /DURAND/.test(out.faceClue.text), JSON.stringify(out.faceClue)); }],
            ['👤 un indice de visage : jamais « Prouvé » ; « Probable » seulement confirmé par un indice qui n’est pas un visage ; absent du partage et du rapport', () => { assert.deepEqual(out.faceCap, { proven: 'supposed', confirmed: 'probable', byFace: 'supposed', self: 'supposed' }); assert.equal(out.faceSafe, false); }],
            ['📄 Documents → « Façon de ranger » : 9ᵉ choix « 🔎 Enquêtes photo », cases jointives (−2 px, pas de double bordure de 4 px)', () => { assert.ok(out.docs.has, JSON.stringify(out.docs)); assert.equal(out.docs.n, 9); assert.equal(out.docs.ml, '-2px'); assert.equal(out.docs.mt, '-2px'); }],
            ['📄 Documents → 🔎 Enquêtes photo : une carte par enquête (titre, « N images · N indices »), « Ouvrir l’enquête » ouvre l’éditeur', () => { assert.equal(out.docs.cards.length, out.docs.count, JSON.stringify(out.docs.cards)); assert.ok(out.docs.lineOk && out.docs.title, JSON.stringify(out.docs.cards)); assert.equal(out.docs.opened, out.docs.freeId); }],
            ['📄 Documents → 🔎 Enquêtes photo : ⋯ « 🗑 Supprimer l’enquête » la retire, ↶ Annuler la remet ; vide : un message', () => { assert.ok(out.docs.deleted && out.docs.cardGone, JSON.stringify(out.docs)); assert.ok(out.docs.undo); assert.ok(out.docs.restored && out.docs.cardBack, JSON.stringify(out.docs)); assert.match(out.docs.empty, /Aucune enquête photo/); }],
            ['× sur chaque image : sort l’image de l’enquête (le média reste) ; ↶ Annuler la remet', () => { assert.match(out.chipX.title, /Retirer cette image de l’enquête/); assert.equal(out.chipX.after, 0); assert.equal(out.chipX.media, true); assert.ok(out.chipX.undo); assert.equal(out.chipX.back, 1); }],
            ['🗑 Supprimer l’enquête : visible au pied du panneau, à gauche de « Terminer pour l’instant » ; tout de suite, ↶ Annuler la remet', () => { assert.ok(out.delBtn && /Supprimer l’enquête/.test(out.delBtn.text) && out.delBtn.before, JSON.stringify(out.delBtn)); assert.equal(out.delBtn.gone, true); assert.ok(out.delBtn.undo); assert.equal(out.delBtn.restored, true); }],
            ['390 px : une fenêtre d’aide et le panneau « Mieux voir » ne débordent pas', () => { assert.ok(out.overflowPlus <= 1, String(out.overflowPlus)); assert.ok(out.overflowBetter && out.overflowBetter.left >= -1 && out.overflowBetter.right <= out.overflowBetter.vw + 1, JSON.stringify(out.overflowBetter)); }],
            ['1. 🔍 double loupe : deux vignettes et deux loupes ; promener la loupe sur A déplace celle de B (liées) ; un indice « comparaison »', () => { const L = out.suite.loupe; assert.equal(L.canvases, 4); assert.ok(L.b0 && L.b1 && L.b0 !== L.b1, JSON.stringify(L)); assert.ok(out.suite.loupeClue, JSON.stringify(out.suite.loupeClue)); }],
            ['2. ▦ grille de lecture : 3 × 3, deux cases cochées gardées avec l’image (« 2 sur 9 ») ; 4 × 4 → 16 cases ; × la cache', () => { const G = out.suite.grid; assert.equal(G.cells, 9); assert.match(G.bar, /2 sur 9/); assert.deepEqual(G.saved, { n: 3, done: [0, 4] }); assert.equal(G.cells4, 16); assert.ok(G.off); }],
            ['3. 🔢 numéroter : deux clics → 1 et 2, la légende dessous (« 1 : inconnu », « 2 : Jean MAZAUD ? ») ; PNG avec la légende sous la photo', () => { const P = out.suite.people; assert.deepEqual(P.pins, ['1', '2']); assert.equal(P.rows, 2); assert.deepEqual(P.legendText, ['1 : inconnu', '2 : Jean MAZAUD ?']); assert.ok(P.png.taller && P.png.w, JSON.stringify(P.png)); }],
            ['3. 🔢 vie privée : Marie LACOMBE (vivante) jamais nommée en partage sans risque ; en consultation, le serveur ne la nomme pas non plus', () => { const P = out.suite.people; assert.ok(P.privNames.includes('Marie LACOMBE'), JSON.stringify(P.privNames)); assert.ok(P.safe.includes('Personne confidentielle') && !P.safe.some(t => /LACOMBE/.test(t)), JSON.stringify(P.safe));
                const K = out.suite.kiosk; assert.ok(K && K.m3 && K.m3.person_id === 0 && K.m3.priv === 1 && K.m3.label === '', JSON.stringify(K)); assert.deepEqual(K.privNames, []); assert.ok(/Personne confidentielle/.test(K.legend || '') && !/LACOMBE/.test(K.legend || ''), K.legend); }],
            ['4. 👻 silhouette : un contour à main levée gardé sur son calque « 👻 Silhouettes », posé sur B (taille en %), un indice « Supposé »', () => { const G = out.suite.ghost; assert.ok(G.layer.length >= 1 && G.layer[0] >= 4, JSON.stringify(G)); assert.match(G.h, /\d+ % de la hauteur/); assert.ok(out.suite.ghostClue, JSON.stringify(out.suite.ghostClue)); }],
            ['5. 📅 ce jour-là (14 juillet 1911) : la lune, la météo d’autrefois (absente ici, dit), Lucie DURAND baptisée ce jour-là', () => { const Dy = out.suite.day; assert.ok(Dy.moon && Dy.family, JSON.stringify(Dy)); assert.match(Dy.text, /Lucie DURAND/); assert.match(Dy.text, /éclairée/); assert.match(Dy.text, /météo/i);
                assert.ok(out.suite.dayApi.day.some(e => e.who.some(w => /Lucie/.test(w.name))), JSON.stringify(out.suite.dayApi)); }],
            ['6. 🗺 tournée : « Phot. J. LACOMBE » → ses photos placées (Brive) sur la mini-carte, regroupées par année', () => { const R = out.suite.route; assert.ok(R.photos.length >= 1 && R.photos.every(x => x.place === 'Brive-la-Gaillarde'), JSON.stringify(R)); assert.ok(R.photos.some(x => x.year === 1905), JSON.stringify(R.photos)); assert.ok(out.suite.routeUi.groups >= 1 && /1905/.test(out.suite.routeUi.text) && out.suite.routeUi.map, JSON.stringify(out.suite.routeUi)); }],
            ['7. 👔 tenues de métier : chaque fait avec sa source Wikipédia ; Paul DURAND, forgeron, trouvé dans l’arbre', () => { const J = out.suite.jobs; assert.ok(J.n >= 6 && J.sourced, JSON.stringify(J)); assert.match(J.tree, /Paul DURAND/); assert.match(J.tree, /Forgeron/); }],
            ['8. 🎞 occasions : sourcées ; le baptême de Lucie DURAND (1911) proposé dans la fenêtre ; ＋ Indice → « Supposé »', () => { const O = out.suite.occ; assert.ok(O.n >= 6 && O.sourced, JSON.stringify(O)); assert.match(O.tree, /Lucie DURAND/); assert.ok(out.suite.occClue && out.suite.occClue.certainty === 'supposed' && out.suite.occClue.data.occasion === 'bapteme', JSON.stringify(out.suite.occClue)); }],
            ['9. ✍ en une phrase : « sans doute » pour un lieu Probable ; ⧉ ; ＋ Ajouter comme note à la fiche reliée (Jean MAZAUD) ; Prouvé → sans prudence', () => { const P = out.suite.phrase; assert.match(P.text, /^Cette photo a sans doute été prise à Brive-la-Gaillarde/); assert.ok(P.menu.some(t => /MAZAUD/.test(t)), JSON.stringify(P.menu)); assert.match(P.toast, /Note ajoutée à la fiche/);
                assert.ok(out.suite.noteJournal, 'journal'); assert.match(out.suite.phrase2, /^Cette photo a été prise à Brive-la-Gaillarde, sans doute entre 1905 et 1915\./); }],
            ['10. 📜 ce qui a changé ma conclusion : « Probable → Prouvé » à cause de l’indice « HÔTEL DE LA POSTE », la certitude d’un indice changée ; dans le journal, sans table de plus', () => { const H = out.suite.hist; assert.ok(H.some(h => /^⚖ Conclusion : le lieu/.test(h) && /Probable\) → .*Prouvé\)/.test(h) && /à cause de l’indice \d+ « Enseigne « HÔTEL DE LA POSTE/.test(h)), JSON.stringify(H));
                assert.ok(H.some(h => /^⚖ Certitude de l’indice \d+ \| Probable → Supposé/.test(h)), JSON.stringify(H)); assert.ok(out.suite.histUi >= 2); assert.ok(out.suite.because); }],
            ['11. 🔔 du nouveau pour une enquête terminée : un événement de l’arbre dans la fenêtre ; dans l’enquête (↺ Reprendre) et sur sa carte de Documents ; rien pour une enquête sans nouveau', () => { assert.ok(out.suite.reopen.some(r => r.k === 'event' && /Baptême|BAPM/i.test(r.label)), JSON.stringify(out.suite.reopen)); assert.deepEqual(out.suite.reopenNone, []);
                assert.match(out.suite.reopenNotice, /Du nouveau qui pourrait aider/); assert.ok(out.docs.reopenBadge, JSON.stringify(out.docs)); assert.equal(out.docs.otherBadge, 0); }],
            ['la suite : les 11 aides dans la grille des aides ; ⚙️ Personnaliser (grille, loupe) ; 390 px sombre : la loupe et la barre de la grille ne débordent pas', () => { assert.equal(out.suite.aides.length, 11, JSON.stringify(out.suite.aides)); assert.ok(out.suite.prefs.grid && out.suite.prefs.loupe);
                assert.ok(out.overflowSuite.loupe <= 1, JSON.stringify(out.overflowSuite)); assert.ok(out.overflowSuite.bar && out.overflowSuite.bar.left >= -1 && out.overflowSuite.bar.right <= out.overflowSuite.bar.vw + 1, JSON.stringify(out.overflowSuite)); }],
            ['2ᵉ partie : les 6 aides dans la grille (📒 🏘 📝 🎓 🔄 🕳) ; ⚙️ Personnaliser (écart d’âge, classe d’école, trou)', () => { assert.deepEqual(out.c3.aides, ['classement', 'memelieu', 'apprend', 'groupe', 'dos2', 'trous']); assert.deepEqual(out.c3.prefs, ['ageTol', 'schoolFrom', 'schoolTo', 'gapMin']); }],
            ['📒 classement d’un album : A avant B alors que « le petit » paraît plus âgé sur A → signalé ; ↓ → « rien ne se contredit » ; l’ordre gardé (settings) et comme indice « Supposé »', () => { const c = out.c3; assert.ok(c.cls.rows >= 2); assert.ok(c.cls.issues.some(t => /« le petit » y paraît plus âgé \(8 ans contre 3\)/.test(t)), JSON.stringify(c.cls)); assert.equal(c.cls.bad, 2);
                assert.match(c.cls2.ok, /Rien ne se contredit/); assert.equal(Number(c.cls2.first), c.ids[1]); assert.deepEqual(c.saved.slice(0, 2), [c.ids[1], c.ids[0]]); assert.ok(c.keep && c.keep.certainty === 'supposed' && c.keep.kind === 'date' && /^Ordre supposé de l’album/.test(c.keep.text), JSON.stringify(c.keep)); }],
            ['🏘 le même lieu à travers le temps : Brive, la photo posée à Brive (1890) puis celles de l’enquête (1905) ; en consultation, la photo d’une vivante n’y est pas', () => { const T0 = out.c3.tl; assert.equal(T0.place.name, 'Brive-la-Gaillarde'); assert.equal(T0.photos[0].media_id, out.seed.m['img020.png']); assert.equal(T0.photos[0].year, 1890);
                assert.ok(T0.photos.some(x => x.media_id === out.seed.m['img004.png'] && x.year === 1905 && x.inquiry), JSON.stringify(T0.photos)); assert.equal(out.c3.tlUi[0], '1890'); assert.ok(out.c3.tlUi.includes('1905'));
                assert.ok(!out.c3.kTl.includes(out.seed.m['img020.png']) && out.c3.kTl.includes(out.seed.m['img004.png']), JSON.stringify(out.c3.kTl)); }],
            ['📝 cette photo m’apprend : Jean MAZAUD, résidence à Brive et métier « forgeron » ; « ＋ Ajouter à la fiche » : l’événement et l’enquête comme source ; ↶ Annuler les retire', () => { const c = out.c3; assert.ok(c.facts.some(f => /Jean MAZAUD : lieu de résidence — Brive-la-Gaillarde, entre 1905 et 1915/.test(f)), JSON.stringify(c.facts)); assert.ok(c.facts.some(f => /Jean MAZAUD : profession « forgeron »/.test(f)), JSON.stringify(c.facts));
                assert.deepEqual([c.added.ev - c.before.ev, c.added.src - c.before.src, c.added.link - c.before.link], [1, 1, 1]); assert.ok(c.btn.some(t => /✓ Ajouté/.test(t))); assert.ok(c.undo); assert.deepEqual(c.undone, c.before); }],
            ['🎓 photo de groupe : classe de 1912 à Brive → Pierre MAZAUD (8 ans), pas Paul (Tulle) ; conscrits de 1924 → Pierre ; noce de Pierre en 1930 → Lucie, ses parents Jean et Marie ; posé sur la photo (🔢 « Supposé »), ↶ Annuler', () => { const c = out.c3;
                assert.deepEqual(c.school, [['Pierre MAZAUD', 8, 'pupil']]); assert.deepEqual(c.conscrits, ['Pierre MAZAUD']); assert.ok(['Pierre MAZAUD', 'Lucie DURAND'].every(n => c.wedding.some(([x, r]) => x === n && r === 'married')) && c.wedding.some(([x, r]) => x === 'Jean MAZAUD' && r === 'parent') && c.wedding.some(([x, r]) => x === 'Marie LACOMBE' && r === 'parent'), JSON.stringify(c.wedding));
                assert.ok(c.groupUi.some(t => /Pierre MAZAUD/.test(t) && /8 ans/.test(t)), JSON.stringify(c.groupUi)); assert.equal(c.placed, 1); assert.ok(c.pinsUi >= 1); assert.ok(c.placeUndo); assert.equal(c.unplaced, 0); assert.ok(c.pinsBack); }],
            ['🔄 les dos côte à côte : l’image marquée « verso » ; aussi ceux des autres enquêtes ; montrés côte à côte', () => { const c = out.c3; assert.deepEqual(c.versos, [[c.ids[1], out.c3.versos[0]?.[1]]]); assert.ok(c.versosAll >= c.versos.length); assert.ok(c.backsUi >= 1, String(c.backsUi)); }],
            ['🕳 les années sans photo : Pierre MAZAUD (1904–1980), une photo vers 1910 (date de l’enquête) ; le trou 1911–1980 en tête ; en consultation, une vivante n’est pas montrée', () => { const Y = out.c3.years; assert.equal(Y.person.name, 'Pierre MAZAUD'); assert.deepEqual(Y.photos.map(x => [x.media_id, x.year, x.from_inquiry]), [[out.seed.m['img004.png'], 1910, true]]);
                const U = out.c3.gapsUi; assert.equal(U.cells, 77); assert.equal(U.on, 1); assert.match(U.gaps[0], /^1911–1980 · 70 ans sans photo/); assert.ok(U.gaps.some(g => /^1904–1909/.test(g)), JSON.stringify(U.gaps)); assert.match(out.c3.kYears, /Personne confidentielle/); }],
            ['2ᵉ partie, 390 px : la fenêtre du classement ne déborde pas', () => { const n = out.c3.narrow; assert.ok(n.left >= -1 && n.right <= n.vw + 1 && n.rows, JSON.stringify(n)); }],
            ['aucune erreur JS', () => assert.deepEqual(out.errs, [], JSON.stringify(out.errs))],
        );
    } else console.log('  (Playwright absent : la partie navigateur n’est pas vérifiée)');
    let failed = 0;
    for (const [name, fn] of checks) { try { fn(); console.log('  ✓', name); } catch (e) { failed++; console.log('  ✗', name, '\n   ', e.message); } }
    console.log('  (non vérifié ici : le vrai Ollama, les sites de comparaison en ligne — rien n’y est envoyé)');
    console.log(failed ? `${failed} échec(s) sur ${checks.length}` : `${checks.length} vérifications réussies`);
    process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
