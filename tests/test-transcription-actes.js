'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 📜 Transcription d'actes, la suite (assets/js/heritage-transcribe-acte*.js, lib/transcription_actes.php, scripts/tx_deep_job.php) :
 *   node tests/test-transcription-actes.js            (TXA_SHOTS=dossier : captures d'écran)
 *  1. sans serveur : « Ce que l'app a trouvé » sur l'acte de mariage fictif de la maquette (rôles, âges → naissance estimée,
 *     métiers, domiciles, liens), un baptême, un décès, une naissance ; le recadrage d'une capture d'écran fabriquée (fond gris,
 *     barre violette, vignette, page claire avec des lignes d'écriture) retombe sur la page ; la source (AD, registre, années,
 *     cote, vue n / N) ; la part de mots douteux ; seule l'adresse d'Ollama sur cet ordinateur est acceptée ;
 *  2. un vrai « php -S » et un faux Ollama local : état, téléchargement du modèle avec progression, lecture, hôte refusé ;
 *     relier / créer / fusionner / témoin seul, liens familiaux, source et citations, puis « ↶ Annuler » qui défait tout ;
 *  3. dans le navigateur : capture d'écran → « ✂ Recadrer sur le texte » → seule la page part à la lecture ; lecture peu sûre →
 *     message et boutons ; « Ce que l'app a trouvé » → ✓ Ajouter → ↶ Annuler ; lecture approfondie côte à côte.
 * Personnes fictives.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const http = require('node:http');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const phpPath = findPhp([devBundledPhp()]);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-txa-'));
const dir = path.join(tmp, 'data');
fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
const SHOTS = process.env.TXA_SHOTS || '';
let chromium = null;
try { ({ chromium } = require('playwright')); } catch (_) { try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); } catch (__) { chromium = null; } }

/* ─── l'acte fictif de la maquette (docs/design/transcription-actes.html) ─── */
const ACTE = `L’an mil huit cent huit, le douze février, à dix heures du matin, par-devant nous, maire et officier de l’état civil de la commune de Saint-Amand-Montrond, sont comparus Pierre Mazaud, tailleur, âgé de vingt-sept ans, demeurant en cette commune, fils majeur de Jean Mazaud, cultivateur, et d’Anne Roux, ses père et mère, ici présents et consentants, d’une part ;
et Marie Lacombe, fileuse, âgée de vingt et un ans, demeurant en cette commune, fille mineure de feu Léonard Lacombe et de Jeanne Dupuy, sa mère, ici présente et consentante, d’autre part ;
lesquels nous ont requis de procéder à la célébration du mariage projeté entre eux, conformément à la loi. Aucune opposition audit mariage ne nous ayant été signifiée, faisant droit à leur réquisition, après avoir fait lecture de toutes les pièces, avons déclaré au nom de la loi que Pierre Mazaud et Marie Lacombe sont unis par le mariage ; de quoi nous avons dressé acte en présence de Joseph Brunet, cordonnier, âgé de vingt-trois ans, de François Vergne, charpentier, âgé de vingt et un ans, demeurant en cette commune ; de Léonard Lacombe, maçon, âgé de trente-trois ans, frère de l’épouse, lesquels ont signé avec nous après lecture faite ; l’épouse a déclaré ne savoir signer.`;
const BAPTEME = 'L’an mil sept cent quatre-vingt-dix, le vingt-trois mars, a été baptisé par moi curé soussigné Jean Martin, né d’hier, fils légitime de Pierre Martin, laboureur, et de Jeanne Rivière, son épouse, de cette paroisse. Le parrain a été Antoine Rivière, oncle de l’enfant, la marraine Catherine Faure, qui ont déclaré ne savoir signer.';
const DECES = 'L’an mil huit cent vingt, le cinq mai, sont comparus Louis Bernard, journalier, âgé de quarante ans, et Michel Roche, tisserand, âgé de cinquante ans, voisins, lesquels nous ont déclaré que Marguerite Dumas, fileuse, âgée de soixante-dix ans, veuve de Jacques Faure, est décédée hier en son domicile.';
const NAISSANCE = 'L’an mil huit cent trente, le deux juin, à neuf heures du matin, par-devant nous, maire de la commune de Vallon, est comparu Étienne Garnier, menuisier, âgé de trente ans, demeurant en cette commune, lequel nous a présenté un enfant du sexe masculin, né hier, de lui déclarant et de Rose Bertin, son épouse, auquel il a donné le prénom de Gabriel. En présence de Paul Morel, sabotier, âgé de quarante ans, et de Simon Petit, cordonnier.';

/* ─── le moteur de « 🧭 Repérer » (heritage-transcribe.js), chargé tel quel ─── */
const win = { LCNDA_EXT: {} };
const sandbox = { window: win, document: { addEventListener() {}, readyState: 'loading', getElementById: () => null }, setTimeout() {}, localStorage: { getItem: () => null }, console };
sandbox.globalThis = sandbox; vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(appRoot, 'assets/js/heritage-transcribe.js'), 'utf8'), sandbox);
const E = win.LCNDA_EXT, helpers = { detect: E.actDetect, findDates: E.actFindDates, wordsToNumber: E.actWordsToNumber };
const core = require('../assets/js/heritage-transcribe-acte-core.js');
const ex = core.extractAct(ACTE, { kind: 'bapteme', helpers });
const exB = core.extractAct(BAPTEME, { kind: 'bapteme', helpers }), exD = core.extractAct(DECES, { kind: 'autre', helpers }), exN = core.extractAct(NAISSANCE, { kind: 'autre', helpers });
const who = (r, name) => r.people.filter(p => p.name === name);

/* ─── une capture d'écran fabriquée : fond gris, barre violette, vignette claire, la page avec des lignes d'écriture ─── */
const W = 1000, H = 700, rgba = new Uint8ClampedArray(W * H * 4);
const setPx = (x, y, r, g, b) => { const i = (y * W + x) * 4; rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b; rgba[i + 3] = 255; };
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { if (y < 60) setPx(x, y, 106, 61, 154); else if (x > 860 && x < 980 && y > 520 && y < 610) setPx(x, y, 228, 222, 206); else setPx(x, y, 120, 120, 124); }
const PAGE = { x0: 200, y0: 100, x1: 800, y1: 650 };
for (let y = PAGE.y0; y < PAGE.y1; y++) for (let x = PAGE.x0; x < PAGE.x1; x++) { const n = rnd() * 14; setPx(x, y, 234 - n, 226 - n, 204 - n); }
for (let l = 0; l < 14; l++) { const y0 = PAGE.y0 + 30 + l * 36; for (let x = PAGE.x0 + 20; x < PAGE.x1 - 20; x++) { if (((x / 7) | 0) % 3 === 0) continue; for (let k = 0; k < 10; k++) if (rnd() < .35) setPx(x, y0 + k, 52, 40, 30); } }
const k = .4, sw = Math.round(W * k), sh = Math.round(H * k), small = new Uint8ClampedArray(sw * sh * 4);
for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) { const i = (Math.floor(y / k) * W + Math.floor(x / k)) * 4, j = (y * sw + x) * 4; for (let c = 0; c < 4; c++) small[j + c] = rgba[i + c]; }
const crop = core.cropBox(small, sw, sh);
const cropFull = (() => { const a = new Uint8ClampedArray(200 * 150 * 4); for (let i = 0; i < a.length; i += 4) { a[i] = 232; a[i + 1] = 225; a[i + 2] = 205; a[i + 3] = 255; if ((i / 4) % 200 > 20 && (i / 4) % 200 < 180 && ((i / 4 / 200) | 0) % 12 < 2) { a[i] = a[i + 1] = a[i + 2] = 40; } } return core.cropBox(a, 200, 150); })();
// un PNG couleur de la capture, pour le navigateur
const crc32 = buf => { let c, crc = 0xFFFFFFFF; for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xFF; for (let q = 0; q < 8; q++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xFFFFFFFF) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, 'latin1'), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, c]); };
function pngRGB(w, h, px) { const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; const raw = Buffer.alloc((w * 3 + 1) * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4, j = y * (w * 3 + 1) + 1 + x * 3; raw[j] = px[i]; raw[j + 1] = px[i + 1]; raw[j + 2] = px[i + 2]; }
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]); }
fs.writeFileSync(path.join(dir, 'media', 'capture-ad.png'), pngRGB(W, H, rgba));

const env = { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media'), GENEALOGY_SKIP_REFERENCE: '1', GENEALOGY_HTR_SIMULATE: '1', PHP_CLI_SERVER_WORKERS: '4' };
const php = (code, extra = {}) => { const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], { cwd: appRoot, encoding: 'utf8', env: { ...env, ...extra } }); if (r.status !== 0) throw new Error(r.stderr || r.stdout); return r.stdout; };
const urls = JSON.parse(php(String.raw`if (!class_exists('LcndaBadInput')) { class LcndaBadInput extends RuntimeException {} } require 'lib/transcription_actes.php';
$u = ['http://127.0.0.1:11434', 'http://localhost:11434', 'http://[::1]:11434', 'http://127.0.0.1:11434/', 'http://example.com:11434', 'http://192.168.1.5:11434', 'http://127.0.0.1.evil.com:11434', 'https://127.0.0.1:11434', 'http://user:pw@127.0.0.1:11434', 'http://127.0.0.1:11434/api/../x', 'http://10.0.0.1', 'http://127.0.0.2:11434', "http://127.0.0.1:11434\n", 'file:///etc/passwd', 'http://evil.com#@127.0.0.1:11434', 'http://127.0.0.1@evil.com'];
$o = ['ok' => array_map('tx_deep_url_ok', $u)]; try { tx_deep_base('http://example.com:11434'); $o['base'] = 'accepté'; } catch (Throwable $e) { $o['base'] = $e->getMessage(); }
$o['local'] = tx_deep_base('http://localhost:11434'); echo json_encode($o, JSON_UNESCAPED_UNICODE);`));

/* ─── la base : des fiches fictives déjà là ─── */
php(String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; require 'tests/api_functions.php'; require_once 'lib/imports.php'; require_once 'lib/imports_plus.php'; $pdo = db();
$id = fn($f, $l, $g) => (int) save_person($pdo, ['first_name' => $f, 'last_name' => $l, 'gender' => $g])['id'];
$pierre = $id('Pierre', 'Mazaud', 'male'); $marie = $id('Marie', 'Lacombe', 'female'); $leo = $id('Léonard', 'Lacombe', 'male'); $jeanne = $id('Jeanne', 'Dupuy', 'female');
$pdo->exec("UPDATE persons SET is_start=1 WHERE id=$pierre");
$t = fn($tag) => ip_event_type($pdo, $tag);
add_event($pdo, ['person_id' => $pierre, 'event_type_id' => $t('BIRT'), 'date_text' => 'vers 1780', 'place_name' => 'Orval']);
add_event($pdo, ['person_id' => $marie, 'event_type_id' => $t('BIRT'), 'date_text' => '3 mars 1786', 'place_name' => 'Orval']);
$pdo->exec("INSERT INTO families(partner1_id, partner2_id) VALUES($leo, $jeanne)"); ensure_child_link($pdo, (int) $pdo->lastInsertId(), $marie);
$pdo->exec("INSERT INTO media(title, media_type, filename) VALUES('Capture AD', 'image', 'capture-ad.png')");
echo 'ok';`);
const counts = () => JSON.parse(php(String.raw`require 'lib/bootstrap.php'; $pdo = db(); $o = [];
foreach (['persons', 'families', 'family_children', 'events', 'event_witnesses', 'sources', 'source_links', 'media_links', 'places'] as $t) { $o[$t] = (int) $pdo->query("SELECT count(*) FROM $t")->fetchColumn(); }
$o['occ1'] = (string) $pdo->query('SELECT occupation FROM persons WHERE id=1')->fetchColumn(); echo json_encode($o);`));

/* ─── un faux Ollama sur cet ordinateur ─── */
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const ollama = { pulled: new Set(), chats: [], pulls: 0 };
const fake = http.createServer((req, res) => {
    let body = ''; req.on('data', c => { body += c; }); req.on('end', async () => {
        if (req.url === '/api/version') { res.end(JSON.stringify({ version: '0.12.0' })); return; }
        if (req.url === '/api/tags') { res.end(JSON.stringify({ models: [...ollama.pulled].map(name => ({ name, size: 1 })) })); return; }
        if (req.url === '/api/pull') { const j = JSON.parse(body || '{}'); ollama.pulls++; res.setHeader('Content-Type', 'application/x-ndjson');
            for (let i = 0; i <= 5; i++) { res.write(JSON.stringify({ status: 'pulling 0123', digest: 'sha256:0123', total: 6e9, completed: i * 1.2e9 }) + '\n'); await new Promise(r => setTimeout(r, 250)); }
            ollama.pulled.add(j.model); res.end(JSON.stringify({ status: 'success' }) + '\n'); return; }
        if (req.url === '/api/chat') { const j = JSON.parse(body || '{}'); ollama.chats.push({ model: j.model, think: j.think, prompt: j.messages?.[0]?.content || '', images: (j.messages?.[0]?.images || []).map(s => s.length) }); res.setHeader('Content-Type', 'application/x-ndjson');
            // comme Qwen3-VL : sans « think: false », il ne fait que réfléchir (message.thinking) et la réponse reste vide
            if (j.think !== false) { for (let i = 0; i < 3; i++) { res.write(JSON.stringify({ message: { role: 'assistant', content: '', thinking: 'Je regarde l’image… ' }, done: false }) + '\n'); await new Promise(r => setTimeout(r, 50)); } res.end(JSON.stringify({ message: { role: 'assistant', content: '' }, done: true, done_reason: 'length' }) + '\n'); return; }
            for (const w of ['conformément à la loi. Aucune opposition\n', 'audit mariage ne nous ayant été signifiée,\n', 'avons déclaré au nom de la loi que Pierre Mazaud\n']) { res.write(JSON.stringify({ message: { role: 'assistant', content: w }, done: false }) + '\n'); await new Promise(r => setTimeout(r, 150)); }
            res.end(JSON.stringify({ message: { role: 'assistant', content: '' }, done: true }) + '\n'); return; }
        res.statusCode = 404; res.end('{}');
    });
});

(async () => {
    const out = {};
    const oport = await freePort(); await new Promise(r => fake.listen(oport, '127.0.0.1', r));
    const port = await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env: { ...env, LCNDA_OLLAMA_URL: `http://localhost:${oport}` }, stdio: 'ignore' });
    const bport = await freePort(); // un serveur dont l'adresse d'Ollama n'est pas sur l'ordinateur
    const procBad = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${bport}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env: { ...env, LCNDA_OLLAMA_URL: 'http://example.com:11434' }, stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    try {
        for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); await fetch(`http://127.0.0.1:${bport}/api.php?action=kiosk_state`); break; } catch (_) { await sleep(100); } }
        const session = async b => { let cookie = ''; const html = await (await fetch(b).then(r => { cookie = (r.headers.get('set-cookie') || '').split(';')[0]; return r; })).text(); return { cookie, csrf: JSON.parse(html.match(/window\.INSTALL_CSRF = ("[^"]*")/)[1]) }; };
        const S = await session(base), SB = await session(`http://127.0.0.1:${bport}/`);
        const post = async (action, body, s = S, b = base) => { const r = await fetch(`${b}api.php?action=${action}`, { method: 'POST', headers: { Cookie: s.cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': s.csrf }, body: JSON.stringify({ ...body, csrf: s.csrf }) }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
        const get = async (action, q = '', s = S, b = base) => { const r = await fetch(`${b}api.php?action=${action}${q ? '&' + q : ''}`, { headers: { Cookie: s.cookie } }); return { status: r.status, body: await r.json().catch(() => ({})) }; };

        /* ─── 2a. lecture approfondie ─── */
        out.st0 = (await get('tx_deep_status')).body;
        out.readBefore = await post('tx_deep_read', { model: 'qwen3-vl:8b-instruct', image_b64: pngRGB(40, 30, new Uint8ClampedArray(40 * 30 * 4).fill(220)).toString('base64') });
        out.pullBad = await post('tx_deep_pull', { model: 'llama3:70b; rm -rf /' });
        const pull = await post('tx_deep_pull', { model: 'qwen3-vl:8b-instruct' }); out.pull = pull;
        const seen = []; let j = {};
        for (let i = 0; i < 80; i++) { j = (await get('tx_deep_job', `id=${pull.body.result?.id}`)).body; if (j.state === 'running' && j.total) seen.push(Math.round(j.completed / j.total * 100)); if (j.state !== 'running') break; await sleep(150); }
        out.pullEnd = j; out.pullSeen = seen;
        out.st1 = (await get('tx_deep_status')).body;
        out.readGarbage = await post('tx_deep_read', { model: 'qwen3-vl:8b-instruct', image_b64: Buffer.from('<?php echo 1; ?>').toString('base64') });
        const rd = await post('tx_deep_read', { model: 'qwen3-vl:8b-instruct', language: 'fra', image_b64: pngRGB(60, 40, new Uint8ClampedArray(60 * 40 * 4).fill(225)).toString('base64') });
        for (let i = 0; i < 80; i++) { j = (await get('tx_deep_job', `id=${rd.body.result?.id}`)).body; if (j.state !== 'running') break; await sleep(150); }
        out.readEnd = j; out.chat = ollama.chats[0];
        out.jobForged = await get('tx_deep_job', 'id=../../etc');
        out.stBad = (await get('tx_deep_status', '', SB, `http://127.0.0.1:${bport}/`)).body;
        out.pullHostBad = await post('tx_deep_pull', { model: 'qwen3-vl:8b-instruct' }, SB, `http://127.0.0.1:${bport}/`);
        out.left = fs.existsSync(path.join(dir, 'cache/tx-deep-jobs')) ? fs.readdirSync(path.join(dir, 'cache/tx-deep-jobs')).filter(d => fs.existsSync(path.join(dir, 'cache/tx-deep-jobs', d, 'image.b64'))) : [];

        /* ─── 2b. de l'acte à la généalogie ─── */
        const plan = action => ex.people.map(p => ({ key: p.key, first: p.given, last: p.surname, name: p.name, sex: p.sex, role: p.role, job: p.job, age: p.age, birth_year: p.birthYear, residence: p.residence, deceased: p.deceased,
            action: action(p), person_id: { 'Pierre Mazaud': 1, 'Marie Lacombe': 2 }[p.name] || (p.role === 'pere_epouse' ? 3 : p.role === 'mere_epouse' ? 4 : 0), add: { job: true, birth: true, death: true, residence: false } }));
        out.check = (await post('act_import_check', { people: ex.people.map(p => ({ key: p.key, first: p.given, last: p.surname, sex: p.sex, birth_year: p.birthYear, role: p.role })), year: 1808, source_title: 'Archives départementales du Cher — État civil de Saint-Amand-Montrond' })).body.result;
        out.details = (await get('act_people_details', 'ids=2')).body.people?.[0];
        out.c0 = counts();
        const act = p => ['Pierre Mazaud', 'Marie Lacombe'].includes(p.name) || ['pere_epouse', 'mere_epouse'].includes(p.role) ? 'link' : p.role === 'temoin' && p.name !== 'Léonard Lacombe' ? 'witness' : 'create';
        const src = core.sourceGuess({ source: 'AD Cher, 3 E 1234', filename: 'capture-ad.png', frameText: 'Saint-Amand-Montrond, 1807-1809, N, M, D 139 / 268', place: ex.place, kind: 'mariage', date: ex.date.label, year: 1808, names: ['Mazaud', 'Lacombe'] });
        const applyBody = { transcription_id: 0, media_id: 1, text: ACTE, event: { kind: ex.kind, date: ex.date.label, place: ex.place }, people: plan(act), relations: ex.relations, source: src };
        out.apply = await post('act_import_apply', applyBody);
        out.c1 = counts();
        out.after = JSON.parse(php(String.raw`require 'lib/bootstrap.php'; $pdo = db(); $o = [];
$o['created'] = $pdo->query("SELECT first_name || ' ' || last_name FROM persons WHERE id > 4 ORDER BY id")->fetchAll(PDO::FETCH_COLUMN);
$o['marr'] = $pdo->query("SELECT e.date_text, pl.name FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id WHERE t.gedcom_tag='MARR'")->fetch(PDO::FETCH_NUM);
$o['couple'] = (int) $pdo->query("SELECT count(*) FROM families WHERE (partner1_id=1 AND partner2_id=2) OR (partner1_id=2 AND partner2_id=1)")->fetchColumn();
$o['pierreParents'] = $pdo->query("SELECT p.first_name FROM family_children fc JOIN families f ON f.id=fc.family_id JOIN persons p ON p.id IN (f.partner1_id, f.partner2_id) WHERE fc.child_id=1 ORDER BY p.first_name")->fetchAll(PDO::FETCH_COLUMN);
$o['brotherFamily'] = (int) $pdo->query("SELECT count(*) FROM family_children fc JOIN families f ON f.id=fc.family_id WHERE f.partner1_id=3 AND f.partner2_id=4")->fetchColumn();
$o['marieParents'] = (int) $pdo->query("SELECT count(*) FROM family_children WHERE child_id=2")->fetchColumn();
$o['birthBrother'] = $pdo->query("SELECT e.date_text, e.fact_confidence FROM events e JOIN event_types t ON t.id=e.event_type_id JOIN persons p ON p.id=e.person_id WHERE t.gedcom_tag='BIRT' AND p.id > 4")->fetchAll(PDO::FETCH_NUM);
$o['deathLeo'] = $pdo->query("SELECT e.date_text FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE t.gedcom_tag='DEAT' AND e.person_id=3")->fetchColumn();
$o['occu'] = $pdo->query("SELECT e.description FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE t.gedcom_tag='OCCU' ORDER BY e.id")->fetchAll(PDO::FETCH_COLUMN);
$o['witness'] = $pdo->query("SELECT p.first_name, w.note FROM event_witnesses w JOIN persons p ON p.id=w.person_id")->fetchAll(PDO::FETCH_NUM);
$o['source'] = $pdo->query("SELECT title, agency FROM sources")->fetch(PDO::FETCH_NUM);
$o['cites'] = $pdo->query("SELECT page FROM source_links ORDER BY id")->fetchAll(PDO::FETCH_COLUMN);
$o['mediaLink'] = (int) $pdo->query("SELECT count(*) FROM media_links WHERE media_id=1 AND entity_type='event'")->fetchColumn();
$o['marieBirth'] = $pdo->query("SELECT e.date_text FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE t.gedcom_tag='BIRT' AND e.person_id=2")->fetchAll(PDO::FETCH_COLUMN);
echo json_encode($o, JSON_UNESCAPED_UNICODE);`));
        // la même source une deuxième fois : reprise, pas doublée
        out.apply2 = await post('act_import_apply', { ...applyBody, people: plan(() => 'ignore').map(p => ({ ...p, action: ['Pierre Mazaud', 'Marie Lacombe'].includes(p.name) ? 'link' : 'ignore' })) });
        out.c2 = counts();
        out.undo2 = await post('act_import_undo', { token: out.apply2.body.result?.undo });
        out.undo = await post('act_import_undo', { token: out.apply.body.result?.undo });
        out.c3 = counts();
        out.undoAgain = await post('act_import_undo', { token: out.apply.body.result?.undo });
        out.badLink = await post('act_import_apply', { ...applyBody, people: plan(act).map(p => p.action === 'link' ? { ...p, person_id: 9999 } : p) });
        out.c4 = counts();

        /* ─── 3. le navigateur ─── */
        if (chromium) {
            const browser = await chromium.launch();
            try {
                const ctxB = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
                const p = await ctxB.newPage(); const errs = []; const sent = [];
                p.on('pageerror', e => errs.push(e.message));
                p.on('request', r => { if (/action=htr_read_start/.test(r.url())) { try { sent.push(JSON.parse(r.postData() || '{}')); } catch (_) {} } });
                const shot = async name => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: path.join(SHOTS, name) }); } };
                await p.goto(base); await p.waitForFunction(() => window.LCNDA_EXT?.openActTranscriber && window.LCNDA_EXT?.txActe, null, { timeout: 30000 });
                // l'installation simulée de la lecture à la main
                await p.evaluate(async () => { await window.LCNDA_APP.api('htr_install', {}, { method: 'POST', body: { python: 'embedded' } }); });
                for (let i = 0; i < 100; i++) { const s = await p.evaluate(() => window.LCNDA_APP.api('htr_setup_status')); if (s.ready && (s.models || []).some(m => m.present)) break; await sleep(200); }
                await p.evaluate(() => window.LCNDA_EXT.openActTranscriber({ mediaId: 1, filename: 'capture-ad.png', title: 'Mariage Mazaud' }));
                await p.waitForFunction(() => document.querySelector('dialog.h-tx-dlg [data-tx-img]')?.getAttribute('href'), null, { timeout: 15000 }); await sleep(600);
                await shot('txa-0-atelier.png');
                await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-cmd="htr"]').click());
                await p.waitForFunction(() => document.querySelector('canvas[data-txa-prev]'), null, { timeout: 15000 }); await sleep(300);
                out.askText = await p.evaluate(() => document.querySelector('dialog[open] .h-txa-msg')?.textContent || '');
                await shot('txa-A-recadrer.png');
                await p.evaluate(() => [...document.querySelectorAll('dialog[open] button[type=submit]')].at(-1).click());
                await p.waitForFunction(() => document.querySelector('.h-htr-rev'), null, { timeout: 20000 });
                out.sent = sent.map(b => ({ has: !!b.image_b64, len: (b.image_b64 || '').length }));
                out.sentSize = await p.evaluate(async b64 => { const i = new Image(); await new Promise(r => { i.onload = r; i.src = 'data:image/png;base64,' + b64; }); return [i.naturalWidth, i.naturalHeight]; }, sent[0]?.image_b64 || '');
                await p.evaluate(() => [...document.querySelectorAll('dialog[open] [data-h-close]')].at(-1).click()); await sleep(200);
                // B : une lecture peu sûre (réponse du serveur remplacée)
                await p.route(/action=htr_read_job/, route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ id: 'x', state: 'done', elapsed: 2, model_file: 'mccatmus-fr-en.mlmodel', lines: [
                    { text: 'conf ormement a la lo Aucnne oppos', bbox: [10, 10, 500, 40], conf: .41, words: 'conf ormement a la lo Aucnne oppos'.split(' ').map((t, i) => ({ t, c: i % 3 ? .35 : .8 })) },
                    { text: 'ayant ete signifiee faisant droit', bbox: [10, 50, 500, 80], conf: .52, words: 'ayant ete signifiee faisant droit'.split(' ').map((t, i) => ({ t, c: i % 2 ? .4 : .7 })) }] }) }));
                await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-cmd="htr"]').click());
                await p.waitForFunction(() => document.querySelector('[data-txa-recrop]'), null, { timeout: 20000 }); await sleep(200);
                out.lowText = await p.evaluate(() => document.querySelector('dialog[open] .h-txa-msg')?.textContent || '');
                await shot('txa-B-peu-sur.png');
                // G : la lecture approfondie, depuis ce message, puis côte à côte
                await p.evaluate(() => document.querySelector('[data-txa-deep]').click());
                await p.waitForFunction(() => document.querySelector('[data-txa-read]'), null, { timeout: 15000 }); await sleep(200);
                await shot('txa-G-approfondie.png');
                await p.evaluate(() => document.querySelector('[data-txa-read]').click());
                await p.waitForFunction(() => document.querySelector('[data-txa-keep="deep"]'), null, { timeout: 30000 }); await sleep(200);
                out.cmp = await p.evaluate(() => [...document.querySelectorAll('[data-txa-t]')].map(t => t.value.split('\n')[0]));
                await shot('txa-G-cote-a-cote.png');
                await p.evaluate(() => document.querySelector('[data-txa-keep="deep"]').click()); await sleep(300);
                await p.unroute(/action=htr_read_job/);
                // C–F : l'acte entier dans le texte, puis « Ce que l'app a trouvé »
                await p.evaluate(t => { const a = document.querySelector('dialog.h-tx-dlg [data-tx-body]'); a.value = t; a.dispatchEvent(new Event('input')); document.querySelector('dialog.h-tx-dlg [data-tx="source"]').value = 'AD Cher, 3 E 1234, vue 139/268'; }, ACTE);
                await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-cmd="detect"]').click());
                await p.waitForFunction(() => document.querySelector('.h-txa-cta'), null, { timeout: 10000 }); await sleep(300);
                await shot('txa-C0-carte.png');
                await p.evaluate(() => document.querySelector('.h-txa-cta [data-tx-cmd="found"]').click());
                await p.waitForFunction(() => document.querySelector('.h-txa-pers'), null, { timeout: 30000 }); await sleep(500);
                out.found = await p.evaluate(() => [...document.querySelectorAll('.h-txa-pers')].map(r => [r.querySelector('.h-txa-role').textContent, r.querySelector('b').textContent, r.querySelector('.h-txa-seg .is-on')?.textContent || '']));
                out.srcInputs = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-txa-src]')].map(i => [i.dataset.txaSrc, i.value])));
                await shot('txa-C-trouve.png');
                await p.evaluate(() => document.querySelector('.h-txa-sec:nth-of-type(4)')?.scrollIntoView()); await shot('txa-E-source.png');
                // D : comparer Marie
                const mk = await p.evaluate(() => [...document.querySelectorAll('.h-txa-pers')].find(r => /Marie/.test(r.querySelector('b').textContent))?.dataset.txaP);
                await p.evaluate(k2 => document.querySelector(`[data-txa-act="${k2}:compare"]`).click(), mk);
                await p.waitForFunction(() => document.querySelector('.h-txa-cmp'), null, { timeout: 10000 }); await sleep(300);
                out.cmpRows = await p.evaluate(() => [...document.querySelectorAll('.h-txa-cmp tbody tr')].map(r => r.firstElementChild.textContent));
                out.cmpMsg = await p.evaluate(() => [...document.querySelectorAll('dialog[open]')].at(-1).querySelector('.h-txa-msg')?.textContent || '');
                await shot('txa-D-comparer.png');
                await p.evaluate(() => [...document.querySelectorAll('dialog[open] button[type=submit]')].at(-1).click()); await sleep(300);
                await p.evaluate(() => document.querySelector('[data-txa-recap]').scrollIntoView()); await shot('txa-F-recap.png');
                out.cb = counts();
                await p.evaluate(() => document.querySelector('dialog.h-txa-dlg button[type=submit]').click());
                await p.waitForFunction(() => [...document.querySelectorAll('.toast, [class*=toast]')].some(t => /Acte ajouté/.test(t.textContent)), null, { timeout: 15000 }); await sleep(400);
                out.toast = await p.evaluate(() => [...document.querySelectorAll('.toast, [class*=toast]')].map(t => t.textContent).find(t => /Acte ajouté/.test(t)) || '');
                await shot('txa-H7-annuler.png');
                out.ca = counts();
                out.txPeople = await p.evaluate(() => document.querySelectorAll('dialog.h-tx-dlg .h-tx-people li').length);
                await p.evaluate(() => [...document.querySelectorAll('.toast button, [class*=toast] button')].find(b => /Annuler/.test(b.textContent))?.click());
                for (let i = 0; i < 40; i++) { await sleep(150); if (counts().persons === out.cb.persons) break; }
                out.cu = counts();
                // 390 px : la fenêtre reste dans l'écran
                await p.setViewportSize({ width: 390, height: 844 });
                await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-cmd="found"]')?.click());
                await p.waitForFunction(() => document.querySelector('.h-txa-pers'), null, { timeout: 30000 }); await sleep(400);
                out.narrow = await p.evaluate(() => document.documentElement.scrollWidth <= 392 && [...document.querySelectorAll('.h-txa-seg')].every(s => s.getBoundingClientRect().right <= 392));
                await shot('txa-390.png');
                out.errs = errs;
            } finally { await browser.close(); }
        }
    } finally { proc.kill(); procBad.kill(); fake.close(); }

    const err = r => String(r.body?.error || '');
    const P = n => who(ex, n);
    const checks = [
        ['acte de mariage : la sorte, la date (en toutes lettres), le lieu', () => { assert.equal(ex.kind, 'mariage'); assert.equal(ex.date.iso, '1808-02-12'); assert.equal(ex.place, 'Saint-Amand-Montrond'); }],
        ['acte de mariage : époux, épouse, leurs pères et mères, trois témoins', () => {
            assert.deepEqual(ex.people.map(p => [p.role, p.name]), [['epoux', 'Pierre Mazaud'], ['pere_epoux', 'Jean Mazaud'], ['mere_epoux', 'Anne Roux'], ['epouse', 'Marie Lacombe'], ['pere_epouse', 'Léonard Lacombe'], ['mere_epouse', 'Jeanne Dupuy'], ['temoin', 'Joseph Brunet'], ['temoin', 'François Vergne'], ['temoin', 'Léonard Lacombe']]);
        }],
        ['acte de mariage : âges → naissance estimée, métiers, domicile, sexe, « feu »', () => {
            const [pm] = P('Pierre Mazaud'), [ml] = P('Marie Lacombe'), [lp, lt] = P('Léonard Lacombe');
            assert.deepEqual([pm.job, pm.age, pm.birthYear, pm.sex, pm.residence], ['tailleur', 27, 1781, 'm', 'Saint-Amand-Montrond']);
            assert.deepEqual([ml.job, ml.age, ml.birthYear, ml.sex], ['fileuse', 21, 1787, 'f']);
            assert.equal(lp.deceased, true); assert.deepEqual([lt.job, lt.age, lt.birthYear, lt.sex, lt.deceased], ['maçon', 33, 1775, 'm', false]);
            assert.deepEqual(P('Joseph Brunet').map(p => [p.job, p.age]), [['cordonnier', 23]]); assert.equal(P('Jean Mazaud')[0].job, 'cultivateur');
        }],
        ['acte de mariage : liens — couple, parents ↔ enfant, frère de l’épouse ; signatures', () => {
            const key = n => P(n)[0].key;
            assert.deepEqual(ex.relations, [{ type: 'couple', a: key('Pierre Mazaud'), b: key('Marie Lacombe'), marriage: true }, { type: 'parents', father: key('Jean Mazaud'), mother: key('Anne Roux'), child: key('Pierre Mazaud') },
                { type: 'parents', father: P('Léonard Lacombe')[0].key, mother: key('Jeanne Dupuy'), child: key('Marie Lacombe') }, { type: 'sibling', a: key('Marie Lacombe'), b: P('Léonard Lacombe')[1].key }]);
            assert.ok(ex.signatures.some(s => /ne savoir signer/.test(s)));
        }],
        ['baptême, décès, naissance : enfant et parents, parrain / marraine, déclarants, veuve de, prénom seul', () => {
            assert.deepEqual(exB.people.map(p => [p.role, p.name]), [['sujet', 'Jean Martin'], ['pere', 'Pierre Martin'], ['mere', 'Jeanne Rivière'], ['parrain', 'Antoine Rivière'], ['marraine', 'Catherine Faure']]);
            assert.equal(exB.date.iso, '1790-03-23');
            assert.deepEqual(exD.people.map(p => [p.role, p.name]), [['declarant', 'Louis Bernard'], ['declarant', 'Michel Roche'], ['defunt', 'Marguerite Dumas'], ['conjoint', 'Jacques Faure']]);
            assert.equal(exD.kind, 'deces'); assert.equal(who(exD, 'Jacques Faure')[0].deceased, true); assert.equal(who(exD, 'Marguerite Dumas')[0].birthYear, 1750);
            assert.deepEqual(exN.people.map(p => [p.role, p.name]), [['pere', 'Étienne Garnier'], ['mere', 'Rose Bertin'], ['temoin', 'Paul Morel'], ['temoin', 'Simon Petit'], ['sujet', 'Gabriel Garnier']]);
        }],
        ['recadrage : la capture fabriquée retombe sur la page (à 2 % près) et est vue comme une capture ; une page seule n’est pas recadrée', () => {
            const b = [crop.x / k, crop.y / k, (crop.x + crop.w) / k, (crop.y + crop.h) / k], want = [PAGE.x0, PAGE.y0, PAGE.x1, PAGE.y1];
            b.forEach((v, i) => assert.ok(Math.abs(v - want[i]) <= W * .02, `${b} ≠ ${want}`)); assert.equal(crop.screenshot, true); assert.ok(crop.ink > .01);
            assert.equal(cropFull.screenshot, false); assert.ok(cropFull.ratio > .9, String(cropFull.ratio));
        }],
        ['la source : AD du Cher, registre N, M, D, années, cote, vue n / N, acte ; d’après un nom de fichier FRAD', () => {
            const s = core.sourceGuess({ source: 'AD Cher, 3 E 1234', frameText: 'Saint-Amand-Montrond, 1807-1809, N, M, D   139 / 268', kind: 'mariage', date: '12 février 1808', year: 1808, names: ['Mazaud', 'Lacombe'] });
            assert.deepEqual(s, { archive: 'Archives départementales du Cher', commune: 'Saint-Amand-Montrond', register: 'Naissances, mariages, décès', years: '1807-1809', cote: '3 E 1234', view: '139', view_total: '268', act: 'Mariage Mazaud – Lacombe, 12 février 1808', title: 'Archives départementales du Cher — État civil de Saint-Amand-Montrond' });
            const f = core.sourceGuess({ filename: 'FRAD018_3E1234_0139.jpg' }); assert.deepEqual([f.archive, f.cote, f.view], ['Archives départementales du Cher', '3 E 1234', '139']);
        }],
        ['lecture peu sûre : la part de mots douteux', () => {
            const low = core.unsureStats([{ words: [{ t: 'a', c: .3 }, { t: 'b', c: .4 }, { t: 'c', c: .9 }, { t: 'd', c: .5 }, { t: 'e', c: .95 }] }]);
            assert.equal(low.low, true); assert.equal(low.ratio, .6);
            assert.equal(core.unsureStats([{ words: 'un deux trois quatre cinq six'.split(' ').map(t => ({ t, c: .97 })) }]).low, false);
        }],
        ['Ollama : seule une adresse de cet ordinateur est acceptée ; « localhost » devient 127.0.0.1', () => {
            assert.deepEqual(urls.ok, [true, true, true, true, false, false, false, false, false, false, false, false, false, false, false, false]);
            assert.match(urls.base, /cet ordinateur/); assert.match(urls.local, /^http:\/\/127\.0\.0\.1:11434$/);
        }],
        ['lecture approfondie : Ollama trouvé, modèles ouverts (Apache 2.0) proposés, lecture refusée avant le téléchargement', () => {
            assert.equal(out.st0.running, true); const ms = out.st0.models.map(m => [m.tag, m.license, m.present]); // la liste a grandi (9 modèles, commit 122d9fb) : les deux conseillés d'abord, aucun présent avant le téléchargement
            assert.deepEqual(ms.slice(0, 2), [['qwen3-vl:8b-instruct', 'Apache 2.0', false], ['qwen3-vl:4b-instruct', 'Apache 2.0', false]]); assert.equal(ms.length, 9); assert.ok(ms.every(m => m[1] && m[2] === false), JSON.stringify(ms));
            assert.equal(out.readBefore.status, 422); assert.match(err(out.readBefore), /pas encore téléchargé/); assert.equal(out.pullBad.status, 422);
        }],
        ['lecture approfondie : téléchargement en arrière-plan avec sa progression, puis modèle présent', () => {
            assert.equal(out.pull.status, 200); assert.equal(out.pullEnd.state, 'done'); assert.ok(out.pullSeen.length >= 2 && out.pullSeen.some(x => x > 0 && x < 100), String(out.pullSeen));
            assert.equal(out.st1.models[0].present, true);
        }],
        ['lecture approfondie : image vérifiée, texte lu en flux, consigne diplomatique, image effacée ; identifiant forgé refusé', () => {
            assert.equal(out.readGarbage.status, 422); assert.equal(out.readEnd.state, 'done'); assert.match(out.readEnd.text, /^conformément à la loi\. Aucune opposition\naudit mariage/);
            assert.equal(out.chat.model, 'qwen3-vl:8b-instruct'); assert.equal(out.chat.think, false, 'think: false demandé (sinon Qwen3-VL ne fait que réfléchir et la réponse est vide)'); assert.match(out.chat.prompt, /ligne par ligne/); assert.match(out.chat.prompt, /\[illisible\]/); assert.match(out.chat.prompt, /N'invente rien/); assert.ok(out.chat.images[0] > 100);
            assert.deepEqual(out.left, []); assert.equal(out.jobForged.status, 422);
        }],
        ['lecture approfondie : une adresse d’Ollama hors de l’ordinateur est refusée (rien n’est appelé)', () => {
            assert.equal(out.stBad.local_only, false); assert.equal(out.stBad.running, false); assert.equal(out.pullHostBad.status, 422);
        }],
        ['fiches ressemblantes : Pierre et Marie retrouvés, avec leur détail (parents) ; la source pas encore là', () => {
            const kp = P('Pierre Mazaud')[0].key, km = P('Marie Lacombe')[0].key;
            assert.equal(out.check.candidates[kp][0].id, 1); assert.equal(out.check.candidates[km][0].id, 2); assert.equal(out.check.source, null);
            assert.equal(out.details.father.name, 'Léonard LACOMBE'); assert.equal(out.details.mother.name, 'Jeanne DUPUY'); assert.equal(out.details.birth.date, '3 mars 1786');
        }],
        ['✓ Ajouter : fiches créées et reliées, couple, parents ↔ enfant, frère dans la famille de l’épouse', () => {
            assert.equal(out.apply.status, 200, err(out.apply)); const r = out.apply.body.result;
            assert.equal(r.created, 3); assert.equal(r.linked, 4);
            assert.deepEqual(out.after.created, ['Jean Mazaud', 'Anne Roux', 'Léonard Lacombe']);
            assert.equal(out.after.couple, 1); assert.deepEqual(out.after.pierreParents, ['Anne', 'Jean']); assert.equal(out.after.brotherFamily, 2); assert.equal(out.after.marieParents, 1);
        }],
        ['✓ Ajouter : mariage daté et placé, métiers, naissance estimée, décès d’avant l’acte, témoin, image reliée ; rien d’écrasé', () => {
            assert.deepEqual(out.after.marr, ['12 février 1808', 'Saint-Amand-Montrond']);
            assert.deepEqual(out.after.occu, ['tailleur', 'cultivateur', 'fileuse', 'maçon']); assert.equal(out.c1.occ1, 'tailleur');
            assert.deepEqual(out.after.birthBrother, [['vers 1775', 'estimated']]); assert.equal(out.after.deathLeo, 'avant le 12 février 1808');
            assert.deepEqual(out.after.witness, [['Léonard', 'témoin']]); assert.equal(out.after.mediaLink, 1); assert.deepEqual(out.after.marieBirth, ['3 mars 1786']);
        }],
        ['✓ Ajouter : la source et ses citations (vue précise) ; la même source une deuxième fois est reprise', () => {
            assert.deepEqual(out.after.source, ['Archives départementales du Cher — État civil de Saint-Amand-Montrond', 'Archives départementales du Cher']);
            assert.ok(out.after.cites.length >= 8); assert.ok(out.after.cites.every(c => /vue 139\/268/.test(c)), out.after.cites[0]);
            assert.equal(out.apply2.status, 200); assert.equal(out.c2.sources, out.c1.sources); assert.equal(out.apply2.body.result.source_created, 0);
        }],
        ['↶ Annuler : tout revient comme avant (fiches, familles, événements, source, citations, métier) ; une seconde fois refusée', () => {
            assert.equal(out.undo2.status, 200); assert.equal(out.undo.status, 200);
            const { occ1, ...a } = out.c3, { occ1: o0, ...b } = out.c0; assert.deepEqual(a, b); assert.equal(occ1, o0);
            assert.equal(out.undoAgain.status, 422);
        }],
        ['une fiche à relier qui n’existe plus : rien n’est écrit', () => { assert.equal(out.badLink.status, 422); const { occ1, ...a } = out.c4, { occ1: o0, ...b } = out.c0; assert.deepEqual(a, b); void occ1; void o0; }],
    ];
    if (chromium) checks.push(
        ['navigateur A : la capture d’écran est repérée, et seule la page recadrée part à la lecture', () => {
            assert.match(out.askText, /capture d’écran/); assert.equal(out.sent.length >= 1 && out.sent[0].has, true);
            const [w, h] = out.sentSize; assert.ok(Math.abs(w - 600) < 40 && Math.abs(h - 550) < 40, String(out.sentSize));
        }],
        ['navigateur B : lecture peu sûre → « ✂ Recadrer et relire » et « 🔍 Essayer la lecture approfondie »', () => assert.match(out.lowText, /peu sûr/)],
        ['navigateur G : les deux lectures côte à côte', () => { assert.equal(out.cmp.length, 2); assert.match(out.cmp[1], /conformément/); }],
        ['navigateur C : les personnes et la proposition (relier les fiches trouvées, témoin seul, créer)', () => {
            const f = Object.fromEntries(out.found.map(([r, n, a]) => [`${r}|${n}`, a]));
            assert.match(f['Époux|Pierre MAZAUD'], /Relier/); assert.match(f['Épouse|Marie LACOMBE'], /Relier/); assert.match(f['Témoin|Joseph BRUNET'], /Témoin seul/); assert.match(f['Père de l’époux|Jean MAZAUD'], /Créer/);
        }],
        ['navigateur E : la source préremplie (cote, vue n / N)', () => { assert.equal(out.srcInputs.cote, '3 E 1234'); assert.equal(out.srcInputs.view, '139'); assert.equal(out.srcInputs.view_total, '268'); assert.match(out.srcInputs.title, /Cher/); }],
        ['navigateur D : comparer champ par champ, les parents reconnus', () => { assert.ok(out.cmpRows.includes('Naissance') && out.cmpRows.includes('Père') && out.cmpRows.includes('Mère'), String(out.cmpRows)); assert.match(out.cmpMsg, /parents sont les mêmes/); }],
        ['navigateur F → H7 : ajouté d’un coup, puis « ↶ Annuler » défait tout', () => {
            assert.match(out.toast, /Acte ajouté/); assert.ok(out.ca.persons > out.cb.persons && out.ca.events > out.cb.events);
            assert.equal(out.cu.persons, out.cb.persons); assert.equal(out.cu.events, out.cb.events); assert.equal(out.cu.families, out.cb.families); assert.equal(out.cu.source_links, out.cb.source_links);
            assert.ok(out.txPeople >= 5);
        }],
        ['navigateur : à 390 px, rien ne déborde', () => assert.equal(out.narrow, true)],
        ['navigateur : aucune erreur JS', () => assert.deepEqual(out.errs, [])],
    );
    let failed = 0;
    for (const [name, fn] of checks) { try { fn(); console.log('  ✓', name); } catch (e) { failed++; console.log('  ✗', name, '\n   ', e.message); } }
    if (!chromium) console.log('  — navigateur : Playwright absent, partie sautée');
    fs.rmSync(tmp, { recursive: true, force: true });
    console.log(failed ? `${failed} échec(s)` : `${checks.length} vérifications réussies`);
    process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); fs.rmSync(tmp, { recursive: true, force: true }); process.exit(1); });
