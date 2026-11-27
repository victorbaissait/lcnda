'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🧭 « Ce que l'app a trouvé dans l'acte », plus riche (assets/js/heritage-transcribe-acte-core.js richFind / mergeAi / mergeRich,
 * assets/js/heritage-transcribe-trouve.js, lib/transcription_actes.php : tx_find_*, act_trouve_match, act_item_add) :
 *   node tests/test-trouve-plus.js            (TROUVE_SHOTS=dossier : captures d'écran)
 *  1. sans serveur : la lecture approfondie d'une déclaration de prisonniers de guerre (texte mal lu, vers 1808) → au moins
 *     5 personnes avec leur âge et leur métier, les faux noms écartés (« Cafins de », « BTIS Afoaut »), « Jemielet » et « Jemichet »
 *     regroupés, l'Allemagne et la Bohême en lieux, les événements et la sorte d'acte proposée ; l'autre page du dossier
 *     (dates en toutes lettres et au calendrier républicain, Pologne, bataille d'Ulm) ; les propositions de l'IA fusionnées ;
 *  2. le JSON de l'IA vérifié par le serveur (schéma strict) : un JSON invalide est refusé ;
 *  3. un vrai « php -S » et un faux Ollama local : « 🔍 Repérer avec l'IA » (le texte seul, sans image, think: false, JSON),
 *     une réponse qui n'est pas du JSON refusée, les fiches et lieux qui ressemblent (« Gaspard Baisser » ↔ « Gaspard BAISSAIT »),
 *     ＋ Ajouter à une fiche (événement relié au « Monde autour », profession, note) avec source et citation, puis « ↶ Annuler » ;
 *  4. dans le navigateur : le bloc, les cartes, ⋯ et clic droit, ＋ Ajouter « Bataille d'Ulm » à Gaspard, l'IA, les réglages.
 * Fiches fictives.
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
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-trouve-'));
const dir = path.join(tmp, 'data');
fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
const SHOTS = process.env.TROUVE_SHOTS || '';
let chromium = null;
try { ({ chromium } = require('playwright')); } catch (_) { try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); } catch (__) { chromium = null; } }

/* ─── la lecture approfondie d'une page (texte mal lu, tel quel), et une ligne de la même page lue autrement ─── */
const PAGE1 = `C'est garçon, Charpentier, âgé de vingt un ans, frère
Corby, ainsi charpentier, âgé de 22 ans, d'infant
Poëtrey, âgé de 20 ans, tisserant tous les quatre signeurs
de Confris de l'Allemagne près la Bohême, ayant
Comme des baïffes, fermes dans les armes d'authentique fait,
Comme lui, préparant à la même bataille d'ubu, et
Cendents, en cette qualité, en dépit dans cette ville, qui
souvin dans ce qu'ils ont fixé leur domicile ayant
vifé de retourner dans leur pays après la délivrance
des prisonniers d'armes; Antoine Jemichet, signeur
de la Bohême, étant âgé de 14 ans, ayant comme les
prénoms; Le prénommement est fait par armes,
et s'étant fixé en cette ville, où il exerce la profession de
Boucher, et enfin les prénoms Michel et d'iciens de moyens
entrepreneurs de bâtiments, paroissiens, les garçons
de la ville, Havril, cinq clants âgés, Sainct Michel et 16, et
étant
de 30 ans, lesquels, Camperans, prénommés, après
Communication aux dromies d'espérance, puis par
les garçons Baïff, ont déclaré savoir les prodiges, fest
Cafins de la ville ont vu Antoine Jemielet et BTIS Afoaut.`;
const PAGE2 = `Aujourd'hui vingt trois octobre mil huit cent six, par-devant nous maire de la commune de Saint-Amand, est comparu Gaspard Baisser âgé de vingt-cinq ans, né à Pologne, prisonnier de guerre fait a la bataille d'Ulm, lequel a déclaré vouloir épouser Catherine Lacroix, fileuse, née le 22 nivôse an 13 selon son extrait.`;
const MARIAGE = 'L’an mil huit cent huit, le douze février, par-devant nous, maire de la commune de Vallon, sont comparus Pierre Mazaud, tailleur, âgé de vingt-sept ans, demeurant en cette commune, et Marie Lacombe, fileuse, âgée de vingt et un ans, lesquels ont été mariés.';

/* ─── le moteur de « 🧭 Repérer » (heritage-transcribe.js), chargé tel quel ─── */
const win = { LCNDA_EXT: {} };
const sandbox = { window: win, document: { addEventListener() {}, readyState: 'loading', getElementById: () => null }, setTimeout() {}, localStorage: { getItem: () => null }, console };
sandbox.globalThis = sandbox; vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(appRoot, 'assets/js/heritage-transcribe.js'), 'utf8'), sandbox);
const E = win.LCNDA_EXT, helpers = { detect: E.actDetect, findDates: E.actFindDates, wordsToNumber: E.actWordsToNumber };
const core = require('../assets/js/heritage-transcribe-acte-core.js');
const r1 = core.richFind(PAGE1, { helpers, date: '1808', place: 'Saint-Amand' });
const r1nodate = core.richFind(PAGE1, { helpers });
const r2 = core.richFind(PAGE2, { helpers });
const rm = core.richFind(MARIAGE, { helpers });
const byName = (r, n) => r.people.filter(p => p.name === n);
const fv = (p, k) => p?.fields?.[k]?.value;
// l'IA : ses propositions ajoutées, marquées
const AI = { personnes: [{ nom: 'Corby', prenom: '', age: '22', metier: 'charpentier', lieu: 'Allemagne', lien: 'frère', role: '' }, { nom: 'Rivoire', prenom: 'Jules', age: '40', metier: 'meunier', lieu: '', lien: '', role: 'témoin' }], lieux: ['Bohême', 'Moravie'], dates: ['1808'], sorte: 'déclaration' };
const rAi = core.mergeAi(JSON.parse(JSON.stringify(r1)), AI);
// « ✓ Ajouter à la généalogie » : les fiches du repérage riche complètent celles de l'acte
const exm = core.mergeRich(core.extractAct(PAGE2, { helpers }), r2, () => true);
const ex1raw = core.extractAct(PAGE1, { helpers, date: '1808' }), ex1names = ex1raw.people.map(p => p.name), ex1 = core.mergeRich(core.extractAct(PAGE1, { helpers, date: '1808' }), r1, (k, f) => !(k === byName(r1, 'Poëtrey')[0].key && f === 'job'));

/* ─── une image pour l'Atelier ─── */
const crc32 = buf => { let c, crc = 0xFFFFFFFF; for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xFF; for (let q = 0; q < 8; q++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xFFFFFFFF) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, 'latin1'), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, c]); };
function png(w, h) { const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; const raw = Buffer.alloc((w * 3 + 1) * h, 225); for (let y = 0; y < h; y++) raw[y * (w * 3 + 1)] = 0;
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]); }
fs.writeFileSync(path.join(dir, 'media', 'page-prisonniers.png'), png(400, 300));

const env = { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4' };
const php = (code, extra = {}) => { const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], { cwd: appRoot, encoding: 'utf8', env: { ...env, ...extra } }); if (r.status !== 0) throw new Error(r.stderr || r.stdout); return r.stdout; };

/* ─── 2. le JSON de l'IA, vérifié ─── */
const valid = JSON.parse(php(String.raw`if (!class_exists('LcndaBadInput')) { class LcndaBadInput extends RuntimeException {} } require 'lib/transcription_actes.php';
$cases = ['ok' => json_encode(['personnes' => [['nom' => 'Baisser', 'prenom' => 'Gaspard', 'age' => 25, 'metier' => '', 'lieu' => 'Pologne', 'lien' => '', 'role' => 'comparant']], 'lieux' => ['Ulm', 'Ulm', 'Pologne'], 'dates' => ['23 octobre 1806'], 'sorte' => 'mariage']),
  'fence' => "` + '```json' + String.raw`\n{\"personnes\":[],\"lieux\":[\"Ulm\"],\"dates\":[],\"sorte\":\"\"}\n` + '```' + String.raw`",
  'age' => json_encode(['personnes' => [['nom' => 'X', 'age' => 'vingt'], ['nom' => 'Y', 'age' => '999']]]),
  'notjson' => 'Voici les personnes : Gaspard Baisser, 25 ans.', 'list' => '[1,2,3]', 'extra' => json_encode(['personnes' => [], 'commande' => 'rm -rf /']),
  'pextra' => json_encode(['personnes' => [['nom' => 'X', 'adresse' => 'y']]]), 'nested' => json_encode(['personnes' => [['nom' => ['a' => 1]]]]), 'plist' => json_encode(['lieux' => ['a' => 'b']]),
  'deep' => str_repeat('[', 50) . str_repeat(']', 50), 'huge' => json_encode(['lieux' => array_fill(0, 300, 'Ulm')]), 'big' => str_repeat(' ', 70000) . '{}', 'empty' => ''];
$o = []; foreach ($cases as $k => $v) { try { $o[$k] = tx_find_validate($v); } catch (Throwable $e) { $o[$k] = 'refusé : ' . $e->getMessage(); } }
$o['prompt'] = tx_find_prompt('TEXTE-ICI'); echo json_encode($o, JSON_UNESCAPED_UNICODE);`));

/* ─── la base : des fiches fictives ─── */
php(String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; require 'tests/api_functions.php'; require_once 'lib/imports.php'; require_once 'lib/imports_plus.php'; $pdo = db();
$id = fn($f, $l, $g) => (int) save_person($pdo, ['first_name' => $f, 'last_name' => $l, 'gender' => $g])['id'];
$g = $id('Gaspard', 'BAISSAIT', 'male'); $c = $id('Catherine', 'Lacroix', 'female'); $z = $id('Zélie', 'Verrouillée', 'female');
$pdo->exec("UPDATE persons SET is_start=1 WHERE id=$g"); $pdo->exec("UPDATE persons SET is_locked=1 WHERE id=$z");
add_event($pdo, ['person_id' => $g, 'event_type_id' => ip_event_type($pdo, 'BIRT'), 'date_text' => 'vers 1781', 'place_name' => 'Ulm, Bade-Wurtemberg, Allemagne']);
$pdo->exec("INSERT INTO media(title, media_type, filename) VALUES('Prisonniers', 'image', 'page-prisonniers.png')");
echo 'ok';`);
const counts = () => JSON.parse(php(String.raw`require 'lib/bootstrap.php'; $pdo = db(); $o = [];
foreach (['persons', 'events', 'notes', 'sources', 'source_links', 'media_links', 'event_types'] as $t) { $o[$t] = (int) $pdo->query("SELECT count(*) FROM $t")->fetchColumn(); }
$o['occ'] = (string) $pdo->query('SELECT occupation FROM persons WHERE id=1')->fetchColumn(); echo json_encode($o);`));

/* ─── un faux Ollama sur cet ordinateur ─── */
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const ollama = { chats: [], mode: 'json' };
const AI_ANSWER = { personnes: [{ nom: 'Baisser', prenom: 'Gaspard', age: '25', metier: 'soldat', lieu: 'Pologne', lien: '', role: 'comparant' }, { nom: 'Lacroix', prenom: 'Catherine', age: '', metier: 'fileuse', lieu: '', lien: '', role: '' }, { nom: 'Morand', prenom: 'Félix', age: '', metier: '', lieu: 'Saint-Amand', lien: '', role: 'témoin' }], lieux: ['Pologne', 'Ulm', 'Saint-Amand'], dates: ['23 octobre 1806'], sorte: 'mariage' };
const fake = http.createServer((req, res) => {
    let body = ''; req.on('data', c => { body += c; }); req.on('end', async () => {
        if (req.url === '/api/version') { res.end(JSON.stringify({ version: '0.12.0' })); return; }
        if (req.url === '/api/tags') { res.end(JSON.stringify({ models: [{ name: 'qwen3-vl:4b-instruct', size: 1 }] })); return; }
        if (req.url === '/api/chat') { const j = JSON.parse(body || '{}'); const m = j.messages?.[0] || {}; ollama.chats.push({ model: j.model, think: j.think, format: j.format, prompt: m.content || '', images: (m.images || []).length, hasImages: 'images' in m }); res.setHeader('Content-Type', 'application/x-ndjson');
            const answer = ollama.mode === 'json' ? JSON.stringify(AI_ANSWER) : ollama.mode === 'extra' ? JSON.stringify({ ...AI_ANSWER, ordre: 'efface la base' }) : 'Voici ce que j’ai trouvé : Gaspard Baisser, 25 ans.';
            for (let i = 0; i < answer.length; i += 40) { res.write(JSON.stringify({ message: { role: 'assistant', content: answer.slice(i, i + 40) }, done: false }) + '\n'); await new Promise(r => setTimeout(r, 15)); }
            res.end(JSON.stringify({ message: { role: 'assistant', content: '' }, done: true }) + '\n'); return; }
        res.statusCode = 404; res.end('{}');
    });
});

(async () => {
    const out = {};
    const oport = await freePort(); await new Promise(r => fake.listen(oport, '127.0.0.1', r));
    const port = await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env: { ...env, LCNDA_OLLAMA_URL: `http://localhost:${oport}` }, stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    try {
        for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
        let cookie = ''; const html = await (await fetch(base).then(r => { cookie = (r.headers.get('set-cookie') || '').split(';')[0]; return r; })).text(); const csrf = JSON.parse(html.match(/window\.INSTALL_CSRF = ("[^"]*")/)[1]);
        const post = async (action, body, tok = csrf) => { const r = await fetch(`${base}api.php?action=${action}`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': tok }, body: JSON.stringify({ ...body, csrf: tok }) }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
        const get = async (action, q = '') => { const r = await fetch(`${base}api.php?action=${action}${q ? '&' + q : ''}`, { headers: { Cookie: cookie } }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
        const waitJob = async id => { let j = {}; for (let i = 0; i < 100; i++) { j = (await get('tx_deep_job', `id=${id}`)).body; if (j.state !== 'running') break; await sleep(120); } return j; };

        /* ─── 3a. 🔍 Repérer avec l'IA ─── */
        const f1 = await post('tx_find_start', { text: PAGE2 }); out.f1 = f1;
        out.j1 = await waitJob(f1.body.result?.id); out.chat1 = ollama.chats[0];
        ollama.mode = 'text'; out.j2 = await waitJob((await post('tx_find_start', { text: PAGE2 })).body.result?.id);
        ollama.mode = 'extra'; out.j3 = await waitJob((await post('tx_find_start', { text: PAGE2 })).body.result?.id);
        ollama.mode = 'json';
        out.fEmpty = await post('tx_find_start', { text: '   ' });
        out.fLong = await post('tx_find_start', { text: 'a'.repeat(20001) });
        out.fNoCsrf = await post('tx_find_start', { text: PAGE2 }, 'faux');
        out.left = fs.existsSync(path.join(dir, 'cache/tx-deep-jobs')) ? fs.readdirSync(path.join(dir, 'cache/tx-deep-jobs')).filter(d => fs.existsSync(path.join(dir, 'cache/tx-deep-jobs', d, 'image.b64'))) : [];

        /* ─── 3b. les ressemblances avec la base ─── */
        const evUlm = r2.events.find(e => /Ulm/.test(e.label));
        const askMatch = () => post('act_trouve_match', { people: r2.people.filter(p => p.name).map(p => ({ key: p.key, first: p.given, last: p.surname })), places: r2.places.map(p => p.name), events: r2.events.map(e => ({ key: e.key, label: e.label, kind: e.kind })) });
        out.m1 = (await askMatch()).body.result;
        out.world = await post('save_history_event', { title: 'Bataille d’Ulm', from_year: 1805, to_year: 1805, category: 'guerre', reach: 'monde', date_text: 'octobre 1805' });
        out.m2 = (await askMatch()).body.result;

        /* ─── 3c. ＋ Ajouter à une fiche ─── */
        const src = core.sourceGuess({ source: 'AD Cher, 3 E 1234', filename: 'page-prisonniers.png', place: 'Saint-Amand', kind: 'militaire', date: '23 octobre 1806', year: 1806 });
        out.c0 = counts();
        const wid = out.m2?.events?.[evUlm.key]?.[0]?.id || '';
        out.addEv = await post('act_item_add', { person_id: 1, as: 'event', title: evUlm.label, date: '', place: evUlm.place, quote: evUlm.quote, line: evUlm.line, world_id: wid, media_id: 1, source: src });
        out.addJob = await post('act_item_add', { person_id: 1, as: 'job', title: 'soldat', quote: 'prisonnier de guerre', source: src });
        out.addNote = await post('act_item_add', { person_id: 2, as: 'note', title: 'Nommée dans l’acte', quote: 'lequel a déclaré vouloir épouser Catherine Lacroix', source: src });
        out.c1 = counts();
        out.rows = JSON.parse(php(String.raw`require 'lib/bootstrap.php'; $pdo = db(); $o = [];
$o['ev'] = $pdo->query("SELECT t.gedcom_tag, e.date_text, pl.name, e.description FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id WHERE e.person_id=1 AND t.gedcom_tag IN ('EVEN','OCCU') ORDER BY e.id")->fetchAll(PDO::FETCH_NUM);
$o['cite'] = $pdo->query("SELECT entity_type, note FROM source_links ORDER BY id")->fetchAll(PDO::FETCH_NUM);
$o['src'] = $pdo->query("SELECT title FROM sources")->fetchAll(PDO::FETCH_COLUMN);
$o['note'] = $pdo->query("SELECT entity_id, body FROM notes")->fetch(PDO::FETCH_NUM);
$o['media'] = (int) $pdo->query("SELECT count(*) FROM media_links WHERE media_id=1 AND entity_type='event'")->fetchColumn();
echo json_encode($o, JSON_UNESCAPED_UNICODE);`));
        out.badAs = await post('act_item_add', { person_id: 1, as: 'supprimer', title: 'x', source: src });
        out.badPerson = await post('act_item_add', { person_id: 999, as: 'note', title: 'x', source: src });
        out.locked = await post('act_item_add', { person_id: 3, as: 'note', title: 'x', source: src });
        out.empty = await post('act_item_add', { person_id: 1, as: 'info', title: '', quote: '', source: src });
        out.noCsrf = await post('act_item_add', { person_id: 1, as: 'note', title: 'x', source: src }, 'faux');
        out.c2 = counts();
        for (const r of [out.addNote, out.addJob, out.addEv]) out[`undo${r === out.addEv ? 'Ev' : r === out.addJob ? 'Job' : 'Note'}`] = await post('act_import_undo', { token: r.body.result?.undo });
        out.c3 = counts();

        /* ─── 4. le navigateur ─── */
        if (chromium) {
            const browser = await chromium.launch();
            try {
                const ctxB = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
                const p = await ctxB.newPage(); const errs = []; const sentFind = [];
                p.on('pageerror', e => errs.push(e.message));
                p.on('request', r => { if (/action=tx_find_start/.test(r.url())) { try { sentFind.push(JSON.parse(r.postData() || '{}')); } catch (_) {} } });
                const shot = async name => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: path.join(SHOTS, name) }); } };
                await p.goto(base); await p.waitForFunction(() => window.LCNDA_EXT?.openActTranscriber && window.LCNDA_EXT?.txTrouve, null, { timeout: 30000 });
                const openWith = async (text, date, again = false) => {
                    if (!again) { await p.evaluate(() => window.LCNDA_EXT.openActTranscriber({ mediaId: 1, filename: 'page-prisonniers.png', title: 'Prisonniers' }));
                        await p.waitForFunction(() => document.querySelector('dialog.h-tx-dlg [data-tx-body]'), null, { timeout: 15000 }); await sleep(400); }
                    await p.evaluate(([t, d]) => { const a = document.querySelector('dialog.h-tx-dlg [data-tx-body]'); a.value = t; a.dispatchEvent(new Event('input')); const f = document.querySelector('dialog.h-tx-dlg [data-tx="date_text"]'); f.value = d; f.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('dialog.h-tx-dlg [data-tx="source"]').value = 'AD Cher, 3 E 1234'; }, [text, date]);
                    // « 🧭 Repérer » est dans l'étape 3 (l'atelier ne montre que l'étape choisie, audit 14) : on y va, comme on le ferait à la souris
                    await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-step="find"]')?.click());
                    await p.waitForSelector('dialog.h-tx-dlg [data-tx-cmd="detect"]', { state: 'visible', timeout: 10000 });
                    await p.click('dialog.h-tx-dlg [data-tx-cmd="detect"]');
                    await p.waitForFunction(() => [...document.querySelectorAll('[data-tf-card]')].some(c => c.offsetWidth), null, { timeout: 10000 }); await sleep(800);
                };
                await openWith(PAGE1, '1808');
                out.b1 = await p.evaluate(() => ({ cards: [...document.querySelectorAll('[data-tf-card]')].map(c => ({ name: c.querySelector('.h-tf-name b')?.textContent || '', fields: [...c.querySelectorAll('.h-tf-fields li')].map(li => li.querySelector('.k').textContent + '=' + li.querySelector('.v').textContent) })),
                    secs: [...document.querySelectorAll('[data-tf-sec]')].map(s => s.dataset.tfSec), rej: document.querySelector('[data-tf-rej]')?.textContent || '', places: [...document.querySelectorAll('[data-tf-sec="places"] .h-tf-main')].map(b => b.textContent),
                    all: document.querySelectorAll('[data-tf-all]').length, aiBtn: !!document.querySelector('[data-tf-aigo]'), oldChips: document.querySelectorAll('[data-tx-found] .h-tx-chip.is-person').length }));
                await shot('trouve-1-page1.png');
                // ⋯ et clic droit : le même menu
                await p.evaluate(() => document.querySelector('[data-tf-card] [data-tf-more]').click()); await sleep(200);
                out.menu = await p.evaluate(() => [...document.querySelectorAll('.ui-actmenu [role=menuitem]')].map(b => b.textContent.trim()).filter(Boolean));
                await p.keyboard.press('Escape'); await sleep(150);
                const box = await p.evaluate(() => { const it = document.querySelector('[data-tf-item]'); it.scrollIntoView({block: 'center'}); const r = it.getBoundingClientRect(); return { x: r.x + 6, y: r.y + r.height / 2 }; });
                await p.mouse.click(box.x, box.y, { button: 'right' }); await sleep(200);
                out.ctxMenu = await p.evaluate(() => [...document.querySelectorAll('.ui-actmenu [role=menuitem]')].map(b => b.textContent.trim()).filter(Boolean));
                await p.keyboard.press('Escape'); await sleep(150);
                // écarter, puis ↶ Annuler
                await p.evaluate(() => document.querySelector('[data-tf-card] [data-tf-more]').click()); await sleep(200);
                await p.evaluate(() => [...document.querySelectorAll('.ui-actmenu [role=menuitem]')].find(b => /Écarter/.test(b.textContent))?.click()); await sleep(200);
                out.offed = await p.evaluate(() => document.querySelectorAll('[data-tf-card].is-off').length);
                await p.evaluate(() => [...document.querySelectorAll('.toast button, [class*=toast] button')].find(b => /Annuler/.test(b.textContent))?.click()); await sleep(250);
                out.unoffed = await p.evaluate(() => document.querySelectorAll('[data-tf-card].is-off').length);
                // la sorte d'acte : proposée, choisie seulement d'un clic
                out.kindBefore = await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx="kind"]').value);
                await p.evaluate(() => document.querySelector('[data-tf-setkind]')?.click()); await sleep(150);
                out.kindAfter = await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx="kind"]').value);
                // ⚙️ réglages : sans les nombres, IA « jamais »
                await p.evaluate(() => document.querySelector('[data-tf-prefs]').click()); await p.waitForSelector('[name="tfp_numbers"]'); await sleep(150);
                await p.evaluate(() => { document.querySelector('[name="tfp_numbers"]').checked = false; document.querySelector('[name="tfp_ai"][value="never"]').checked = true; [...document.querySelectorAll('dialog[open] button[type=submit]')].at(-1).click(); }); await sleep(300);
                out.prefs1 = await p.evaluate(() => ({ secs: [...document.querySelectorAll('[data-tf-sec]')].map(s => s.dataset.tfSec), ai: !!document.querySelector('[data-tf-aigo]'), saved: localStorage.getItem('genealogie-trouve-prefs') }));
                await p.evaluate(() => localStorage.removeItem('genealogie-trouve-prefs'));

                // l'autre page : Gaspard, la bataille d'Ulm → ＋ Ajouter à sa fiche, comme événement
                await openWith(PAGE2, '', true);
                await p.waitForFunction(() => /BAISSAIT/.test(document.querySelector('[data-tf-sec="people"]')?.textContent || ''), null, { timeout: 10000 }).catch(() => {});
                out.b2 = await p.evaluate(() => ({ people: document.querySelector('[data-tf-sec="people"]')?.textContent || '', places: [...document.querySelectorAll('[data-tf-sec="places"] [data-tf-item]')].map(b => b.textContent), events: [...document.querySelectorAll('[data-tf-sec="events"] [data-tf-item]')].map(b => b.textContent), dates: [...document.querySelectorAll('[data-tf-sec="dates"] [data-tf-item]')].map(b => b.textContent) }));
                await shot('trouve-2-page2.png');
                const c0 = counts();
                await p.evaluate(() => [...document.querySelectorAll('[data-tf-sec="events"] [data-tf-item]')].find(i => /Ulm/.test(i.textContent)).querySelector('[data-tf-add]').click());
                await p.waitForSelector('[name="tf_as"]'); await sleep(300);
                out.addDlg = await p.evaluate(() => ({ as: document.querySelector('[name="tf_as"]:checked')?.value, title: document.querySelector('[name="tf_title"]').value, date: document.querySelector('[name="tf_date"]').value, place: document.querySelector('[name="tf_place"]').value, world: !!document.querySelector('[name="tf_world"]'), sugg: [...document.querySelectorAll('[data-tf-pick]')].map(b => b.textContent), prev: document.querySelector('[data-tf-prev]').textContent }));
                await p.evaluate(() => [...document.querySelectorAll('[data-tf-pick]')].find(b => /BAISSAIT/.test(b.textContent))?.click()); await sleep(500);
                await shot('trouve-3-ajouter.png');
                await p.evaluate(() => [...document.querySelectorAll('dialog[open] button[type=submit]')].at(-1).click());
                await p.waitForFunction(() => [...document.querySelectorAll('.toast, [class*=toast]')].some(t => /Ajouté à la fiche/.test(t.textContent)), null, { timeout: 15000 }).catch(() => {}); await sleep(300);
                out.cAdd = counts(); out.cBefore = c0;
                out.evRow = JSON.parse(php(String.raw`require 'lib/bootstrap.php'; $pdo = db(); echo json_encode($pdo->query("SELECT e.person_id, e.date_text, pl.name, e.description FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id WHERE t.gedcom_tag='EVEN' ORDER BY e.id DESC LIMIT 1")->fetch(PDO::FETCH_NUM), JSON_UNESCAPED_UNICODE);`));
                await p.evaluate(() => [...document.querySelectorAll('.toast button, [class*=toast] button')].find(b => /Annuler/.test(b.textContent))?.click());
                for (let i = 0; i < 40; i++) { await sleep(150); if (counts().events === c0.events) break; }
                out.cUndo = counts();
                // 🔍 Repérer avec l'IA (faux Ollama) : le texte seul, les propositions marquées
                await p.evaluate(() => document.querySelector('[data-tf-aigo]')?.click());
                await p.waitForFunction(() => /Propositions de l’IA/.test(document.querySelector('[data-tf-ai]')?.textContent || ''), null, { timeout: 20000 }).catch(() => {});
                out.ai = await p.evaluate(() => ({ line: document.querySelector('[data-tf-ai]')?.textContent || '', badges: document.querySelectorAll('[data-tf] .h-txa-badge.is-ai').length, morand: /Morand/.test(document.querySelector('[data-tf-sec="people"]').textContent) }));
                out.sentFind = sentFind.map(b => Object.keys(b).sort());
                await shot('trouve-4-ia.png');
                // une réponse qui n'est pas du JSON : le message reste dans le bloc
                await p.evaluate(() => fetch('/__noop').catch(() => {}));
                ollama.mode = 'text';
                await p.evaluate(() => { const b = document.querySelector('dialog.h-tx-dlg [data-tx-cmd="detect"]'); const a = document.querySelector('dialog.h-tx-dlg [data-tx-body]'); a.value += ' '; a.dispatchEvent(new Event('input')); b.click(); });
                await sleep(800);
                await p.evaluate(() => document.querySelector('[data-tf-aigo]')?.click());
                await p.waitForFunction(() => document.querySelector('[data-tf-ai] .ui-notice-error'), null, { timeout: 20000 }).catch(() => {});
                out.aiErr = await p.evaluate(() => document.querySelector('[data-tf-ai]')?.textContent || '');
                ollama.mode = 'json';
                // 390 px
                await p.setViewportSize({ width: 390, height: 844 }); await sleep(300);
                out.narrow = await p.evaluate(() => document.documentElement.scrollWidth <= 392 && [...document.querySelectorAll('[data-tf-card]')].every(c => c.getBoundingClientRect().right <= 392));
                await shot('trouve-5-390.png');
                out.errs = errs;
            } finally { await browser.close(); }
        }
    } finally { proc.kill(); fake.close(); }

    const err = r => String(r.body?.error || '');
    const people = r => r.people.filter(p => p.fields.age);
    const checks = [
        ['page 1 : au moins 5 personnes avec leur âge (et leur métier quand le texte le donne)', () => {
            assert.ok(people(r1).length >= 5, String(people(r1).length));
            const corby = byName(r1, 'Corby')[0], poe = byName(r1, 'Poëtrey')[0], ant = byName(r1, 'Antoine Jemichet')[0], first = r1.people.find(p => p.unnamed && fv(p, 'age') === 21);
            assert.deepEqual([fv(corby, 'age'), fv(corby, 'job'), fv(corby, 'birth'), fv(corby, 'link')], [22, 'charpentier', 1786, 'frère']);
            assert.deepEqual([fv(poe, 'age'), fv(poe, 'job'), fv(poe, 'birth')], [20, 'tisserand', 1788]);
            assert.deepEqual([fv(ant, 'age'), fv(ant, 'job'), fv(ant, 'origin'), fv(ant, 'residence')], [14, 'boucher', 'Bohême', 'Saint-Amand']);
            assert.ok(first, 'la personne au nom illisible, 21 ans'); assert.deepEqual([fv(first, 'job'), fv(first, 'birth'), fv(first, 'status')], ['charpentier', 1787, 'garçon']);
            assert.ok(r1.people.some(p => fv(p, 'age') === 30));
            assert.equal(fv(byName(r1nodate, 'Corby')[0], 'birth'), undefined, 'sans date de l’acte : pas de naissance estimée');
        }],
        ['page 1 : « tous les quatre … de l’Allemagne » : l’origine vaut pour les personnes d’avant', () => {
            assert.equal(fv(byName(r1, 'Corby')[0], 'origin'), 'Allemagne'); assert.equal(byName(r1, 'Corby')[0].fields.origin.shared, 'tous les quatre');
        }],
        ['page 1 : les faux noms écartés (« Cafins de », « BTIS Afoaut », mots courants, métiers, lieux)', () => {
            const names = r1.people.map(p => p.name);
            for (const bad of ['Cafins de', 'Cafins', 'BTIS Afoaut', 'Charpentier', 'Boucher', 'Comme', 'Sainct Michel', 'Communication']) assert.ok(!names.includes(bad), bad);
            assert.ok(r1.rejected.some(r => r.label === 'BTIS Afoaut' && r.why === 'letters'));
            assert.ok(r1.rejected.some(r => /^Cafins de/.test(r.label) && r.why === 'particle') || !helpers.detect(PAGE1).some(f => /^Cafins/.test(f.label)));
            assert.equal(core.badLetters('BTIS'), true); assert.equal(core.badLetters('Schwartz'), false); assert.equal(core.badLetters('Strauss'), false); assert.equal(core.badLetters('Brzeski'), false);
        }],
        ['page 1 : « Jemielet » et « Jemichet » : une seule personne, la forme la plus fréquente d’abord', () => {
            const j = r1.people.filter(p => /Jemi/.test(p.name)); assert.equal(j.length, 1); assert.ok(j[0].variants.includes('Antoine Jemielet') || j[0].name === 'Antoine Jemielet'); assert.equal(j[0].mentions.length, 2);
            assert.equal(core.nameClose('Jemielet', 'Jemichet'), true); assert.equal(core.nameClose('Martin', 'Morin'), false);
        }],
        ['page 1 : lieux (Allemagne, Bohême), événements, sorte d’acte proposée, nombres', () => {
            const pl = r1.places.map(p => p.name); assert.ok(pl.includes('Allemagne') && pl.includes('Bohême'), pl.join());
            assert.equal(r1.places.find(p => p.name === 'Allemagne').kind, 'pays');
            assert.ok(r1.events.some(e => /délivrance des prisonniers/i.test(e.label))); assert.ok(r1.events.some(e => /bataille/i.test(e.label)));
            assert.equal(r1.kind.value, 'militaire'); assert.match(r1.kind.why, /prisonniers/);
            assert.ok(r1.numbers.some(n => n.n === 16)); assert.ok(r1.ages.every(a => a.owner));
            assert.equal(r1.actDate.label, '1808'); assert.equal(r1.actDate.fromField, true);
        }],
        ['page 2 : la date de l’acte en toutes lettres, le calendrier républicain, Pologne et Ulm, la bataille d’Ulm', () => {
            assert.equal(r2.actDate.iso, '1806-10-23'); assert.ok(r2.dates.some(d => d.repub && /nivôse/.test(d.label)));
            const pl = r2.places.map(p => p.name); assert.ok(pl.includes('Pologne') && pl.includes('Ulm'), pl.join());
            const ev = r2.events.find(e => /bataille d'Ulm/i.test(e.label)); assert.ok(ev); assert.equal(ev.place, 'Ulm'); assert.equal(ev.year, null, 'pas de date inventée');
            assert.ok(r2.events.some(e => e.kind === 'prisonniers'));
            const g = byName(r2, 'Gaspard Baisser')[0]; assert.deepEqual([fv(g, 'age'), fv(g, 'birth'), fv(g, 'birthplace'), fv(g, 'status')], [25, 1781, 'Pologne', 'prisonnier de guerre']);
            assert.notEqual(fv(g, 'origin'), 'Ulm', 'la bataille n’est pas une origine');
            assert.equal(fv(byName(r2, 'Catherine Lacroix')[0], 'job'), 'fileuse');
        }],
        ['acte de mariage : les mêmes âges et métiers qu’avant', () => {
            const pm = byName(rm, 'Pierre Mazaud')[0], ml = byName(rm, 'Marie Lacombe')[0];
            assert.deepEqual([fv(pm, 'age'), fv(pm, 'job'), fv(pm, 'birth'), fv(pm, 'residence')], [27, 'tailleur', 1781, 'Vallon']); assert.deepEqual([fv(ml, 'age'), fv(ml, 'job')], [21, 'fileuse']);
            assert.equal(rm.kind.value, 'mariage');
        }],
        ['IA : ses propositions ajoutées sans rien remplacer, marquées', () => {
            const c = byName(rAi, 'Corby')[0]; assert.equal(fv(c, 'age'), 22); assert.equal(c.fields.age.ai, undefined, 'le texte d’abord');
            const j = rAi.people.find(p => p.name === 'Jules Rivoire'); assert.ok(j?.ai); assert.deepEqual([fv(j, 'age'), fv(j, 'job'), fv(j, 'role'), fv(j, 'birth')], [40, 'meunier', 'temoin', 1768]);
            assert.ok(rAi.places.find(p => p.name === 'Moravie')?.ai); assert.equal(rAi.places.filter(p => p.name === 'Bohême').length, 1); assert.equal(rAi.kind.value, 'militaire'); assert.equal(rAi.kind.aiLabel, 'déclaration');
        }],
        ['« ✓ Ajouter à la généalogie » : les âges et lieux du repérage riche complètent l’acte', () => {
            const g = exm.people.find(p => p.name === 'Gaspard Baisser'); assert.deepEqual([g.age, g.birthYear], [25, 1781]);
            assert.ok(ex1names.includes('BTIS Afoaut') && ex1names.includes('Antoine Jemielet'), 'avant : ' + ex1names.join());
            const n1 = ex1.people.map(p => p.name); assert.ok(!n1.includes('BTIS Afoaut') && !n1.includes('Antoine Jemielet') && !n1.includes('Sainct Michel'), n1.join());
            const c = ex1.people.find(p => p.name === 'Corby'); assert.deepEqual([c.age, c.job, c.birthYear], [22, 'charpentier', 1786]);
            assert.equal(ex1.people.find(p => p.name === 'Poëtrey').job, '', 'une case décochée n’entre pas');
        }],
        ['JSON de l’IA : un objet valide gardé et borné', () => {
            assert.deepEqual(valid.ok, { personnes: [{ nom: 'Baisser', prenom: 'Gaspard', age: '25', metier: '', lieu: 'Pologne', lien: '', role: 'comparant' }], lieux: ['Ulm', 'Pologne'], dates: ['23 octobre 1806'], sorte: 'mariage' });
            assert.deepEqual(valid.fence.lieux, ['Ulm']); assert.deepEqual(valid.age.personnes.map(p => p.age), ['', '']);
            assert.match(valid.prompt, /uniquement par un objet JSON/); assert.match(valid.prompt, /N'invente rien/); assert.match(valid.prompt, /TEXTE-ICI/);
        }],
        ['JSON de l’IA : invalide refusé (pas du JSON, liste, clé en plus, champ en plus, objet imbriqué, trop profond, trop long, vide)', () => {
            for (const k of ['notjson', 'list', 'extra', 'pextra', 'nested', 'plist', 'deep', 'huge', 'big', 'empty']) assert.match(String(valid[k]), /^refusé/, k);
        }],
        ['serveur : « 🔍 Repérer avec l’IA » envoie le texte seul (pas d’image), think: false, réponse JSON', () => {
            assert.equal(out.f1.status, 200, JSON.stringify(out.f1.body)); assert.equal(out.j1.state, 'done', JSON.stringify(out.j1)); assert.equal(out.j1.kind, 'find');
            assert.deepEqual(out.j1.found.lieux, ['Pologne', 'Ulm', 'Saint-Amand']); assert.equal(out.j1.found.personnes[0].nom, 'Baisser');
            assert.equal(out.chat1.hasImages, false); assert.equal(out.chat1.think, false); assert.equal(out.chat1.format, 'json'); assert.equal(out.chat1.model, 'qwen3-vl:4b-instruct');
            assert.ok(out.chat1.prompt.includes('Gaspard Baisser âgé de vingt-cinq ans')); assert.deepEqual(out.left, []);
        }],
        ['serveur : une réponse qui n’est pas le JSON demandé est refusée, avec un message', () => {
            assert.equal(out.j2.state, 'error'); assert.match(out.j2.error, /JSON demandé/); assert.equal(out.j2.found, undefined);
            assert.equal(out.j3.state, 'error'); assert.match(out.j3.detail, /clé inattendue/);
            assert.equal(out.fEmpty.status, 422); assert.equal(out.fLong.status, 422); assert.notEqual(out.fNoCsrf.status, 200);
        }],
        ['serveur : fiches, lieux et « Monde autour » qui ressemblent (Baisser ↔ BAISSAIT)', () => {
            const g = r2.people.find(p => p.name === 'Gaspard Baisser'); const c = out.m1.people[g.key];
            assert.equal(c[0].title, 'Gaspard BAISSAIT'); assert.equal(c[0].same, false); assert.equal(c[0].years, '1781–');
            assert.equal(out.m1.people[r2.people.find(p => p.name === 'Catherine Lacroix').key][0].same, true);
            assert.match(out.m1.places.Ulm[0].name, /^Ulm/);
            const ev = r2.events.find(e => /Ulm/.test(e.label)); assert.deepEqual(out.m1.events[ev.key], []);
            assert.equal(out.m2.events[ev.key][0].title, 'Bataille d’Ulm'); assert.equal(out.m2.events[ev.key][0].from, 1805);
        }],
        ['serveur : ＋ Ajouter à une fiche (événement relié au monde autour, profession, note), toujours avec source et citation', () => {
            assert.equal(out.addEv.status, 200, JSON.stringify(out.addEv.body)); assert.equal(out.addJob.status, 200, JSON.stringify(out.addJob.body)); assert.equal(out.addNote.status, 200, JSON.stringify(out.addNote.body));
            assert.deepEqual(out.rows.ev[0].slice(0, 2), ['EVEN', 'octobre 1805']); assert.match(out.rows.ev[0][2] || '', /^Ulm/); assert.match(out.rows.ev[0][3], /Bataille d'Ulm/);
            assert.deepEqual(out.rows.ev[1].slice(0, 1), ['OCCU']); assert.equal(out.c1.occ, 'soldat');
            assert.deepEqual(out.rows.cite.map(c => c[0]), ['event', 'event', 'note']); assert.ok(out.rows.cite.every(c => /«/.test(c[1]))); assert.match(out.rows.cite[0][1], /^Ligne 1 : « .*bataille d'Ulm/);
            assert.equal(out.rows.src.length, 1); assert.match(out.rows.src[0], /Archives départementales du Cher/);
            assert.equal(out.rows.note[0], 2); assert.match(out.rows.note[1], /épouser Catherine Lacroix/); assert.equal(out.rows.media, 1);
        }],
        ['serveur : refusé sans fiche, avec une fiche verrouillée, un « comme quoi » inconnu, un élément vide, sans jeton CSRF', () => {
            for (const k of ['badAs', 'badPerson', 'locked', 'empty']) assert.equal(out[k].status, 422, k);
            assert.match(err(out.locked), /verrouillée/); assert.notEqual(out.noCsrf.status, 200); assert.deepEqual(out.c2, out.c1);
        }],
        ['serveur : « ↶ Annuler » défait chaque ajout (le métier remis comme avant)', () => {
            for (const k of ['undoEv', 'undoJob', 'undoNote']) assert.equal(out[k].status, 200, k + JSON.stringify(out[k].body));
            assert.deepEqual({ ...out.c3, event_types: 0 }, { ...out.c0, event_types: 0 }); assert.equal(out.c3.occ, '');
        }],
    ];
    if (chromium) checks.push(
        ['navigateur : une carte par personne, avec âge, naissance estimée et métier', () => {
            assert.ok(out.b1.cards.length >= 5, JSON.stringify(out.b1.cards.map(c => c.name)));
            const corby = out.b1.cards.find(c => c.name === 'Corby'); assert.ok(corby.fields.includes('Âge=22 ans') && corby.fields.includes('Naissance estimée=vers 1786') && corby.fields.includes('Métier=charpentier'), corby.fields.join());
            assert.ok(out.b1.cards.some(c => c.name === 'Nom non lu')); assert.equal(out.b1.oldChips, 0);
            assert.deepEqual(out.b1.secs, ['people', 'places', 'dates', 'ages', 'events', 'kind', 'numbers']); assert.ok(out.b1.all >= 5);
            assert.match(out.b1.rej, /BTIS Afoaut/); assert.ok(out.b1.places.includes('Allemagne') && out.b1.places.includes('Bohême'));
            assert.equal(out.b1.aiBtn, true);
        }],
        ['navigateur : « ⋯ » et clic droit ouvrent le menu d’actions (＋ Ajouter à une fiche…, Écarter)', () => {
            assert.ok(out.menu.some(t => /Ajouter à une fiche/.test(t)) && out.menu.some(t => /Écarter/.test(t)), JSON.stringify(out.menu));
            assert.ok(out.ctxMenu.some(t => /Ajouter à une fiche/.test(t)), JSON.stringify(out.ctxMenu));
            assert.equal(out.offed, 1, 'écarté'); assert.equal(out.unoffed, 0, 'annulé');
            assert.equal(out.offed, 1); assert.equal(out.unoffed, 0);
        }],
        ['navigateur : la sorte d’acte est proposée, choisie seulement d’un clic', () => { assert.notEqual(out.kindBefore, 'militaire'); assert.equal(out.kindAfter, 'militaire'); }],
        ['navigateur : réglages (rubriques montrées, IA jamais)', () => { assert.ok(!out.prefs1.secs.includes('numbers')); assert.equal(out.prefs1.ai, false); assert.match(out.prefs1.saved, /"ai":"never"/); }],
        ['navigateur : la page 2, Gaspard et sa fiche proche, la bataille d’Ulm', () => {
            assert.match(out.b2.people, /Gaspard Baisser/); assert.match(out.b2.people, /BAISSAIT/); assert.match(out.b2.people, /à vérifier/);
            assert.ok(out.b2.events.some(e => /Bataille d'Ulm/.test(e) && /🌍 Bataille d’Ulm \(1805\)/.test(e)), out.b2.events.join('|'));
            assert.ok(out.b2.places.some(p => /Ulm/.test(p) && /↔/.test(p)), out.b2.places.join('|')); assert.ok(out.b2.dates.some(d => /date de l’acte/.test(d)));
        }],
        ['navigateur : ＋ Ajouter « Bataille d’Ulm » à Gaspard comme événement (date du monde autour, lieu, source), puis ↶ Annuler', () => {
            assert.deepEqual([out.addDlg.as, out.addDlg.place, out.addDlg.date, out.addDlg.world], ['event', 'Ulm', '', true]); assert.match(out.addDlg.title, /Bataille d'Ulm/);
            assert.ok(out.addDlg.sugg.some(s => /BAISSAIT/.test(s))); assert.match(out.addDlg.prev, /octobre 1805/); assert.match(out.addDlg.prev, /Archives départementales du Cher/);
            assert.equal(out.cAdd.events, out.cBefore.events + 1, JSON.stringify([out.cBefore, out.cAdd])); assert.deepEqual(out.evRow.slice(0, 2), [1, 'octobre 1805']); assert.match(out.evRow[2] || '', /^Ulm/);
            assert.equal(out.cUndo.events, out.cBefore.events);
        }],
        ['navigateur : 🔍 Repérer avec l’IA (texte seul), propositions marquées ; une mauvaise réponse dite dans le bloc', () => {
            assert.match(out.ai.line, /Propositions de l’IA/); assert.ok(out.ai.badges > 0); assert.equal(out.ai.morand, true);
            assert.deepEqual(out.sentFind[0], ['csrf', 'model', 'text']); assert.match(out.aiErr, /JSON demandé/);
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
