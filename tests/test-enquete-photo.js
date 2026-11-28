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
        await p.addInitScript(() => { window.LCNDA_SHEET_LAZY_OFF = true; });
        await p.goto(base);
        await p.waitForFunction(() => window.LCNDA_EXT?.enquetePhoto && window.LCNDA_EXT?.enquetePhotoAides && window.LCNDA_EP_CORE && window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.onglets?.documents, null, { timeout: 30000 });
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
        out.kiosk = { entered: kin, circleDisabled: await p.$eval(`${D} [data-ep-tool="circle"]`, b => b.disabled), status: await p.$eval(`${D} [data-ui-status]`, e => e.textContent), add: await p.evaluate(d => !!document.querySelector(`${d} [data-ep-add]`), D) };
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
            ['mode consultation : lecture seule (outils grisés, rien ne s’écrit)', () => { assert.equal(out.kiosk.entered, true); assert.equal(out.kiosk.circleDisabled, true); assert.match(out.kiosk.status, /lecture seule/); assert.equal(out.kiosk.add, false); assert.equal(out.kioskWrite.ok, false); }],
            ['390 px en sombre : rien ne déborde de côté', () => { assert.ok(out.overflow.dlg <= 1 && out.overflow.side <= 1, JSON.stringify(out.overflow)); }],
            ['§ 5 : recherches proposées, chacune avec son « parce que… »', () => { assert.ok(out.searches.length >= 2 && out.searches.every(t => /^parce /.test(t)), JSON.stringify(out.searches)); }],
            ['§ 7 bis : la grille des aides (46 de la maquette + 🔤 police, ☀️ ombre, 🌐, 🤖) ; chacune s’ouvre sans erreur', () => { assert.ok(out.aidesCount >= 47, String(out.aidesCount)); assert.deepEqual(out.aideErr, []); const shut = Object.entries(out.aides).filter(([k, n]) => n < 1 && !['nearby', 'perspective', 'ombres'].includes(k)).map(([k]) => k); assert.deepEqual(shut, [], JSON.stringify(out.aides)); }],
            ['§ 7 ter : 🧰 Chercher dans les données, déjà rempli (le texte lu, le lieu supposé)', () => { assert.match(out.dataSearch.q || '', /HÔTEL DE LA POSTE/); assert.equal(out.dataSearch.place, 'Brive-la-Gaillarde'); assert.ok(out.dataSearch.rows >= 1); }],
            ['aucune erreur JS', () => assert.deepEqual(out.errs, [], JSON.stringify(out.errs))],
        );
    } else console.log('  (Playwright absent : la partie navigateur n’est pas vérifiée)');
    let failed = 0;
    for (const [name, fn] of checks) { try { fn(); console.log('  ✓', name); } catch (e) { failed++; console.log('  ✗', name, '\n   ', e.message); } }
    console.log('  (non vérifié ici : le vrai Ollama, les sites de comparaison en ligne — rien n’y est envoyé)');
    console.log(failed ? `${failed} échec(s) sur ${checks.length}` : `${checks.length} vérifications réussies`);
    process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
