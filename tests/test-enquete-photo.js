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
        out.plusErr = await p.evaluate(() => window.__epErr || []);
        out.report = await p.evaluate(() => window.LCNDA_EXT.enquetePhotoPlus.reportHtml(window.LCNDA_EXT.enquetePhoto.current.api()).then(h => ({ q: /Nos questions précises/.test(h), todo: /À chercher/.test(h), img: /<img src="data:image/.test(h) })));
        const g5 = (await api('get', { id: inqId })).inquiry;
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

        /* ═════ mode consultation : lecture seule ═════ */
        const kin = await p.evaluate(() => window.LCNDA_APP.api('kiosk_enter', {}, { method: 'POST', body: { password: 'secret-1234' } }).then(() => true, e => e.message));
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_EXT?.enquetePhoto && document.body.classList.contains('is-kiosk'), null, { timeout: 30000 });
        await p.evaluate(id => window.LCNDA_EXT.enquetePhoto.open(id), inqId); await p.waitForSelector(`${D} .ep-chip`); await sleep(500);
        out.kiosk = { entered: kin, circleDisabled: await p.$eval(`${D} [data-ep-tool="circle"]`, b => b.disabled), status: await p.$eval(`${D} [data-ui-status]`, e => e.textContent), add: await p.evaluate(d => !!document.querySelector(`${d} [data-ep-add]`), D), x: await p.evaluate(d => !!document.querySelector(`${d} [data-ep-imgx], ${d} [data-ep-delinq]`), D) };
        out.kioskWrite = await post('clue_save', { inquiry_id: inqId, text: 'test', certainty: 'supposed' });
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
            ['× sur chaque image : sort l’image de l’enquête (le média reste) ; ↶ Annuler la remet', () => { assert.match(out.chipX.title, /Retirer cette image de l’enquête/); assert.equal(out.chipX.after, 0); assert.equal(out.chipX.media, true); assert.ok(out.chipX.undo); assert.equal(out.chipX.back, 1); }],
            ['🗑 Supprimer l’enquête : visible au pied du panneau, à gauche de « Terminer pour l’instant » ; tout de suite, ↶ Annuler la remet', () => { assert.ok(out.delBtn && /Supprimer l’enquête/.test(out.delBtn.text) && out.delBtn.before, JSON.stringify(out.delBtn)); assert.equal(out.delBtn.gone, true); assert.ok(out.delBtn.undo); assert.equal(out.delBtn.restored, true); }],
            ['390 px : une fenêtre d’aide et le panneau « Mieux voir » ne débordent pas', () => { assert.ok(out.overflowPlus <= 1, String(out.overflowPlus)); assert.ok(out.overflowBetter && out.overflowBetter.left >= -1 && out.overflowBetter.right <= out.overflowBetter.vw + 1, JSON.stringify(out.overflowBetter)); }],
            ['aucune erreur JS', () => assert.deepEqual(out.errs, [], JSON.stringify(out.errs))],
        );
    } else console.log('  (Playwright absent : la partie navigateur n’est pas vérifiée)');
    let failed = 0;
    for (const [name, fn] of checks) { try { fn(); console.log('  ✓', name); } catch (e) { failed++; console.log('  ✗', name, '\n   ', e.message); } }
    console.log('  (non vérifié ici : le vrai Ollama, les sites de comparaison en ligne — rien n’y est envoyé)');
    console.log(failed ? `${failed} échec(s) sur ${checks.length}` : `${checks.length} vérifications réussies`);
    process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
