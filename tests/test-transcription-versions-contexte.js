'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 📜 Atelier de transcription : versions, mots sur l'image, « Aider l'IA », pourquoi l'acte de notoriété
 * (maquette validée docs/design/transcription-versions-contexte.html ; assets/js/heritage-transcribe-contexte.js) :
 *   node tests/test-transcription-versions-contexte.js
 *  1. 🕘 la bande « Versions » au-dessus de « 📄 Ce texte est celui du document » : ma version, la lecture de l'IA (modèle, image envoyée,
 *     indices), l'aperçu en lecture seule, « ⚖️ Comparer avec ma version », « ⧉ Dupliquer », « ✓ Utiliser cette version » + ↶ Annuler, « ⋯ N autres » ;
 *  2. 🔦 des mots choisis dans le texte : un cadre dans la bande de leur ligne (≈ estimé, exact avec la place des mots), un par ligne ;
 *     la couleur choisie, retenue (genealogie-htr-word-color) ;
 *  3. 🧠 « Aider l'IA » : indices de la base (mariage connu, façons d'écrire, lieux cochés ; parents, métiers décochés), le texte envoyé
 *     montré tel quel, et ce même texte dans la consigne reçue par le (faux) Ollama, avec la règle « ne rien inventer » ;
 *  5. 🧠 un mot [?] d'une lecture faite avec des indices : « lu avec un indice » (aperçu de la version, bulle dans le texte) ;
 *     🖱 un clic sur un mot de l'image (ligne déjà choisie) met le curseur sur ce mot dans le texte ;
 *  4. ❓ acte de notoriété : « Pourquoi cet acte a été fait » pré-rempli par « 🧭 Repérer » (à vérifier), choisi à la main, gardé avec l'acte,
 *     montré dans le 🧩 Gabarit, sur la fiche de la personne reliée et sur la page du document.
 * Personnes fictives (MAZAUD, LACOMBE, DURAND). Non vérifié ici : le vrai modèle (son texte est imité).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const http = require('node:http');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
let chromium = null;
try { ({ chromium } = require('playwright')); } catch (_) { try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); } catch (__) { chromium = null; } }

const LINES = ['L’an mil huit cent treize, le douze octobre,', 'par devant nous juge de paix du canton de Treignac', 'a comparu Gaspard Mazaud, cultivateur,', 'demeurant au village du Puy, lequel nous',
    'a dit vouloir contracter mariage avec', 'Catherine Lacombe, fille de Pierre et de', 'feue Marie Durand, et ne pouvoir représenter son acte de naissance.'];
const BODY = LINES.join('\n') + '\n';
const VLINES = LINES.map(l => l.replace('Mazaud', 'Mazaut').replace('douze', 'XII')), VBODY = VLINES.join('\n') + '\n'; // ✎ une lecture de 7 lignes (autant que les zones)
const AI_TEXT = ['L’an mil huit cent treize, le douze octobre,', 'par devant nous juge de paix du canton de Treignac', 'a comparu Gaspard Mazand [?], cultivateur,'];
/* ─── l'image : 1000 × 400, sept bandes d'écriture ─── */
const W = 1000, H = 400, px = new Uint8Array(W * H).fill(225);
let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
for (let l = 0; l < 7; l++) { const y0 = 30 + l * 48; for (let y = y0 + 8; y < y0 + 30; y++) for (let x = 30; x < W - 40; x++) if (rnd() < .3) px[y * W + x] = 70; }
const crc32 = buf => { let c, crc = 0xFFFFFFFF; for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xFF; for (let q = 0; q < 8; q++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xFFFFFFFF) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, 'latin1'), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, c]); };
function png(w, h, p) { const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; const raw = Buffer.alloc((w * 3 + 1) * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const j = y * (w * 3 + 1) + 1 + x * 3; raw[j] = raw[j + 1] = raw[j + 2] = p[y * w + x]; }
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]); }
/* ─── les zones : une bande par ligne ; la ligne 4 sait la place de chaque mot (comme une lecture à la main) ─── */
const ZONES = []; { let at = 0; LINES.forEach((l, i) => { ZONES.push({ id: 'z' + i, x: 20, y: 30 + i * 48, w: 940, h: 40, s: at, e: at + l.length, note: '', c: '', src: 'htr' }); at += l.length + 1; }); }
{ const z = ZONES[3], words = LINES[3].split(' '); let o = 0, x = 40; z.wb = words.map(w => { const r = [o, o + w.length, x, x + w.length * 19]; o += w.length + 1; x += w.length * 19 + 14; return r; }); z.wl = LINES[3].length; }

async function browserPart(out) {
    const phpPath = findPhp([devBundledPhp()]);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-txvc-'));
    const dir = path.join(tmp, 'data'); fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'media', 'notoriete-mazaud.png'), png(W, H, px));
    const env = { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4' };
    const php = (code, extra = {}) => { const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], { cwd: appRoot, encoding: 'utf8', env: { ...env, ...extra } }); if (r.status !== 0) throw new Error(r.stderr || r.stdout); return r.stdout; };
    const people = JSON.parse(php(String.raw`require 'lib/paths.php'; $p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; require 'tests/api_functions.php'; require_once 'lib/imports_plus.php'; $pdo = db();
$P = fn($f, $l, $g) => (int) save_person($pdo, ['first_name' => $f, 'last_name' => $l, 'gender' => $g])['id'];
$g = $P('Gaspard', 'MAZAUD', 'male'); $c = $P('Catherine', 'LACOMBE', 'female'); $pi = $P('Pierre', 'LACOMBE', 'male'); $m = $P('Marie', 'DURAND', 'female');
$pdo->exec("UPDATE persons SET is_start=1 WHERE id=$g");
$pdo->prepare("INSERT INTO name_variants(person_id, last_name) VALUES(?, 'Mazaut')")->execute([$g]); $pdo->prepare("INSERT INTO name_variants(person_id, last_name) VALUES(?, 'La Combe')")->execute([$c]);
$pdo->exec("INSERT INTO places(name) VALUES('Treignac')"); $pl = (int) $pdo->lastInsertId();
$pdo->prepare('INSERT INTO families(partner1_id, partner2_id) VALUES(?,?)')->execute([$g, $c]); $f = (int) $pdo->lastInsertId();
$pdo->prepare('INSERT INTO families(partner1_id, partner2_id) VALUES(?,?)')->execute([$pi, $m]); $f2 = (int) $pdo->lastInsertId();
$pdo->prepare('INSERT INTO family_children(family_id, child_id) VALUES(?,?)')->execute([$f2, $c]);
$pdo->prepare("INSERT INTO events(scope, family_id, event_type_id, date_text, year, place_id) VALUES('family', ?, ?, '1813', 1813, ?)")->execute([$f, ip_event_type($pdo, 'MARR'), $pl]);
$pdo->prepare("INSERT INTO events(scope, person_id, event_type_id, description) VALUES('person', ?, ?, 'cultivateur')")->execute([$g, ip_event_type($pdo, 'OCCU')]);
$pdo->exec("INSERT INTO media(title, media_type, filename) VALUES('Notoriété Mazaud', 'image', 'notoriete-mazaud.png')");
act_transcriptions_ensure($pdo);
$body = getenv('TX_BODY'); $zones = json_decode(getenv('TX_ZONES'), true);
$s = mb_strpos($body, 'Gaspard Mazaud'); $s2 = mb_strpos($body, 'Catherine Lacombe');
$data = ['zones' => $zones, 'people' => [['name' => 'Gaspard Mazaud', 'role' => 'sujet', 'person_id' => $g, 's' => $s, 'e' => $s + 14], ['name' => 'Catherine Lacombe', 'role' => '', 'person_id' => $c, 's' => $s2, 'e' => $s2 + 17]], 'status' => 'doing'];
$pdo->prepare("INSERT INTO act_transcriptions(title, kind, media_id, date_text, place, body, data_json) VALUES('Acte de notoriété de Gaspard MAZAUD', 'notoriete', 1, '12 oct. 1813', 'Treignac', ?, ?)")->execute([$body, json_encode($data, JSON_UNESCAPED_UNICODE)]);
echo json_encode(['g' => $g, 'c' => $c]);`, { TX_BODY: BODY, TX_ZONES: JSON.stringify(ZONES) }));
    out.people = people;
    const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const pulled = new Set(), prompts = [];
    const fake = http.createServer((req, res) => {
        let body = ''; req.on('data', c => { body += c; }); req.on('end', async () => {
            if (req.url === '/api/version') { res.end(JSON.stringify({ version: '0.12.0' })); return; }
            if (req.url === '/api/tags') { res.end(JSON.stringify({ models: [...pulled].map(name => ({ name, size: 1 })) })); return; }
            if (req.url === '/api/pull') { const j = JSON.parse(body || '{}'); res.setHeader('Content-Type', 'application/x-ndjson'); pulled.add(j.model); res.end(JSON.stringify({ status: 'success' }) + '\n'); return; }
            if (req.url === '/api/chat') { try { prompts.push(JSON.parse(body).messages[0].content); } catch (_) { prompts.push(''); } res.setHeader('Content-Type', 'application/x-ndjson');
                for (const l of AI_TEXT) { res.write(JSON.stringify({ message: { role: 'assistant', content: l + '\n' }, done: false }) + '\n'); await new Promise(r => setTimeout(r, 15)); }
                res.end(JSON.stringify({ message: { role: 'assistant', content: '' }, done: true }) + '\n'); return; }
            res.statusCode = 404; res.end('{}');
        });
    });
    const oport = await freePort(); await new Promise(r => fake.listen(oport, '127.0.0.1', r));
    const port = await freePort(), base = `http://127.0.0.1:${port}/`;
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env: { ...env, LCNDA_OLLAMA_URL: `http://127.0.0.1:${oport}` }, stdio: 'ignore' });
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const browser = await chromium.launch();
    try {
        for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
        const ctxB = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
        const p = await ctxB.newPage(); const errs = [];
        p.on('pageerror', e => errs.push(e.message));
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_EXT?.openActTranscriber && window.LCNDA_EXT?.txCtx && window.LCNDA_EXT?.txActe, null, { timeout: 30000 });
        await p.evaluate(() => { try { localStorage.removeItem('genealogie-htr-word-color'); localStorage.removeItem('genealogie-htr-image-mode'); } catch (_) {} });
        const api = (a, q = {}) => p.evaluate(([x, y]) => window.LCNDA_APP.api(x, y), [a, q]);
        await p.evaluate(async () => { const A = window.LCNDA_APP; const r = await A.api('tx_deep_pull', {}, { method: 'POST', body: { model: 'qwen3-vl:8b-instruct' } }); for (let i = 0; i < 60; i++) { const j = await A.api('tx_deep_job', { id: r.result.id }); if (j.state !== 'running') break; await new Promise(x => setTimeout(x, 150)); } });
        const openAct = async () => { await p.evaluate(() => window.LCNDA_EXT.openActTranscriber({ id: 1 })); await p.waitForFunction(() => document.querySelector('dialog.h-tx-dlg [data-tx-img]')?.getAttribute('href'), null, { timeout: 15000 }); await sleep(500); };
        const closeAct = async () => { await p.evaluate(() => { const d = document.querySelector('dialog.h-tx-dlg'); d?.querySelector('[data-tx-cmd="close"]')?.click(); }); await sleep(400);
            await p.evaluate(() => { const b = [...document.querySelectorAll('dialog[open] button')].find(x => /Fermer sans|Ne pas enregistrer|Fermer quand même/.test(x.textContent)); b?.click(); }); await sleep(300); };
        await openAct();

        /* ─── 4. ❓ pourquoi l'acte (avant tout : Repérer le pré-remplit) ─── */
        out.whyBefore = await p.evaluate(() => { const r = document.querySelector('dialog.h-tx-dlg [data-tx-whyrow]'); return { shown: !r.hidden, value: r.querySelector('[data-tx-why-k]')?.value ?? null }; });
        await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-cmd="detect"]').click()); await sleep(900);
        out.whyAuto = await p.evaluate(() => { const r = document.querySelector('dialog.h-tx-dlg [data-tx-whyrow]'); return { value: r.querySelector('[data-tx-why-k]').value, auto: !!r.querySelector('.h-why-k.is-auto'), note: r.querySelector('.h-why-auto')?.textContent || '', options: [...r.querySelectorAll('[data-tx-why-k] option')].map(o => o.value) }; });
        await p.selectOption('dialog.h-tx-dlg [data-tx-whyrow] [data-tx-why-k]', 'naissance');
        await p.fill('dialog.h-tx-dlg [data-tx-whyrow] [data-tx-why-t]', 'Son acte de naissance n’a pu être trouvé ; mariage prévu avec Catherine LACOMBE.');
        out.whyManual = await p.evaluate(() => ({ auto: !!document.querySelector('dialog.h-tx-dlg [data-tx-whyrow] .h-why-k.is-auto') }));
        await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-cmd="save"]').click()); await sleep(900);
        out.whySaved = (await api('act_transcription', { id: 1 })).data.reason;
        await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-gab-tab="gab"]')?.click()); await sleep(400);
        out.whyGab = await p.evaluate(() => { const s = document.querySelector('dialog.h-tx-dlg [data-gab-box] [data-tx-why-k]'); return s ? s.value : null; });
        await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-gab-tab="found"]')?.click());
        // sur la fiche de Gaspard (bloc « 📜 Actes et transcriptions ») et sur la page du document
        const actsG = JSON.parse(php(String.raw`require 'lib/bootstrap.php'; echo json_encode(act_transcriptions_for_person(db(), (int) getenv('PID')), JSON_UNESCAPED_UNICODE);`, { PID: String(people.g) }));
        out.ficheHtml = await p.evaluate(([acts, pid]) => window.LCNDA_EXT.personBlocks.acts(0, { heritage: { acts }, person: { id: pid } }), [actsG, people.g]);
        const actsM = JSON.parse(php(String.raw`require 'lib/bootstrap.php'; echo json_encode(act_transcriptions_for_media(db(), 1), JSON_UNESCAPED_UNICODE);`));
        out.mediaReason = actsM[0]?.reason || null;

        /* ─── 2. 🔦 les mots choisis sur l'image, et la couleur ─── */
        const selectWords = (needle, len) => p.evaluate(([n, l]) => { const a = document.querySelector('dialog.h-tx-dlg [data-tx-body]'); const s = a.value.indexOf(n); a.focus(); a.setSelectionRange(s, s + (l || n.length)); a.dispatchEvent(new Event('select')); }, [needle, len || 0]);
        const boxes = () => p.evaluate(() => [...document.querySelectorAll('dialog.h-tx-dlg [data-tx-words] rect')].map(r => ({ kind: r.dataset.txWbox, x: +r.getAttribute('x'), y: +r.getAttribute('y'), w: +r.getAttribute('width'), h: +r.getAttribute('height'), stroke: r.getAttribute('stroke') })).concat([]));
        const label = () => p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-words] text')?.textContent || '');
        await selectWords('Gaspard Mazaud'); await sleep(150);
        out.box1 = await boxes(); out.label1 = await label(); if (process.env.SHOTS) { fs.mkdirSync(process.env.SHOTS, { recursive: true }); await p.screenshot({ path: path.join(process.env.SHOTS, 'mots.png') }); }
        await selectWords('village'); await sleep(150);
        out.boxExact = await boxes(); out.labelExact = await label();
        await selectWords('Gaspard Mazaud, cultivateur,\ndemeurant'); await sleep(150);
        out.boxMulti = await boxes();
        await selectWords('Gaspard Mazaud'); await sleep(100);
        out.colorDefault = await p.evaluate(() => ({ on: document.querySelector('dialog.h-tx-dlg [data-tx-wcol].is-on')?.dataset.txWcol, n: document.querySelectorAll('dialog.h-tx-dlg [data-tx-wcol]').length }));
        await p.click('dialog.h-tx-dlg [data-tx-wcol="#e03131"]'); await sleep(150);
        out.boxRed = await boxes(); out.colorStored = await p.evaluate(() => localStorage.getItem('genealogie-htr-word-color'));

        /* ─── 3. 🧠 Aider l'IA ─── */
        await p.evaluate(() => document.querySelector('dialog.h-tx-dlg header [data-tx-cmd="aideia"]').click());
        await p.waitForSelector('dialog[open] [data-ia] [data-ia-hint]', { timeout: 10000 });
        out.hints = await p.evaluate(() => [...document.querySelectorAll('dialog[open] [data-ia-hint]')].map(i => ({ key: i.dataset.iaHint, on: i.checked, text: i.closest('label').textContent.replace(/\s+/g, ' ').trim() })));
        const shot = async n => { if (process.env.SHOTS) { fs.mkdirSync(process.env.SHOTS, { recursive: true }); await p.screenshot({ path: path.join(process.env.SHOTS, n) }); } };
        await shot('aider-ia.png');
        out.iaPeople = await p.evaluate(() => document.querySelector('dialog[open] .h-ia-pers').textContent.replace(/\s+/g, ' '));
        await p.fill('dialog[open] [data-ia-about]', 'Acte de notoriété de Gaspard MAZAUD pour prouver qu’il est célibataire en vue de son mariage avec Catherine LACOMBE');
        await p.evaluate(() => { document.querySelector('dialog[open] [data-ia-sentbox]').open = true; });
        await p.waitForFunction(() => /Catherine LACOMBE/.test(document.querySelector('dialog[open] [data-ia-sent]')?.textContent || '') && /célibataire/.test(document.querySelector('dialog[open] [data-ia-sent]').textContent), null, { timeout: 10000 });
        out.sentShown = await p.evaluate(() => document.querySelector('dialog[open] [data-ia-sent]').textContent);
        out.iaCount = await p.evaluate(() => document.querySelector('dialog[open] [data-ia-count]').textContent);
        await p.evaluate(() => document.querySelector('dialog[open] [data-ia]').closest('dialog').querySelector('[type=submit]').click()); // ✨ Lire avec ces indices
        await p.waitForSelector('[data-txa-read]', { timeout: 15000 });
        out.ctxLine = await p.evaluate(() => document.querySelector('[data-txa-ctxline]')?.textContent.replace(/\s+/g, ' ').trim() || '');
        out.headCount = await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-iacount]').textContent);
        await p.evaluate(() => document.querySelector('[data-txa-read]').click());
        await p.waitForFunction(() => document.querySelector('[data-txa-t="deep"]') && !document.querySelector('[data-txa-read]').disabled, null, { timeout: 30000 });
        out.prompts = prompts.slice();
        await p.evaluate(() => document.querySelector('[data-txa-deep]').closest('dialog').close()); await sleep(1200);

        /* ─── 1. 🕘 la bande « Versions » ─── */
        const strip = () => p.evaluate(() => { const v = document.querySelector('dialog.h-tx-dlg [data-tx-vers]'), note = document.querySelector('dialog.h-tx-dlg [data-tx-docnote]');
            return { hidden: v.hidden, before: !!(v.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING), chips: [...v.querySelectorAll('[data-tx-v], [data-tx-vmore]')].map(b => ({ id: b.dataset.txV || 'more', text: b.textContent.replace(/\s+/g, ' ').trim(), title: b.title, on: b.classList.contains('is-on') })), dup: !!v.querySelector('[data-tx-vdup]') }; });
        await p.waitForFunction(() => document.querySelector('dialog.h-tx-dlg [data-tx-vers] [data-tx-v]:not([data-tx-v="me"])'), null, { timeout: 10000 });
        out.strip1 = await strip();
        out.list1 = (await api('act_transcription_versions', { act_id: 1 })).items;
        const aiId = out.list1.find(v => /^deep:/.test(v.source))?.id;
        await p.click(`dialog.h-tx-dlg [data-tx-v="${aiId}"]`);
        await p.waitForSelector('dialog.h-tx-dlg [data-tx-vprev] [data-tx-vuse]', { timeout: 10000 });
        out.prevHint = await p.evaluate(() => [...document.querySelectorAll('dialog.h-tx-dlg [data-tx-vprev] .h-tx-doubt')].map(x => x.title));
        out.prev = await p.evaluate(() => { const v = document.querySelector('dialog.h-tx-dlg [data-tx-vprev]'); return { hidden: v.hidden, ro: v.querySelector('[data-tx-vro]').textContent, doubt: v.querySelectorAll('.h-tx-doubt').length, btns: [...v.querySelectorAll('button')].map(b => b.textContent.trim()), meta: v.querySelector('.h-tx-vmeta').textContent, dim: document.querySelector('dialog.h-tx-dlg [data-tx-editor]').classList.contains('is-dim') }; });
        await shot('versions.png');
        // ⚖️ Comparer avec ma version : la fenêtre déjà là, ces deux lectures cochées
        await p.click('dialog.h-tx-dlg [data-tx-vcmp]');
        await p.waitForSelector('dialog.h-txc[open] [data-txc-pick]', { timeout: 10000 }); await sleep(300);
        out.cmp = await p.evaluate(() => [...document.querySelectorAll('dialog.h-txc[open] [data-txc-pick]:checked')].map(i => Number(i.dataset.txcPick)));
        await p.evaluate(() => document.querySelector('dialog.h-txc[open] [data-txc-x]').click()); await sleep(300);
        // ⧉ Dupliquer (la lecture affichée) puis ↶ Annuler, puis encore (gardée)
        await p.click('dialog.h-tx-dlg [data-tx-vdup]'); await sleep(900);
        out.dupList = (await api('act_transcription_versions', { act_id: 1 })).items.filter(v => v.source === 'copy');
        out.dupStrip = await strip();
        out.dupUndo = await p.evaluate(() => { const tt = [...document.querySelectorAll('.ui-toast')].filter(x => /Copie gardée/.test(x.textContent)).at(-1); const b = tt && [...tt.querySelectorAll('button')].find(x => /Annuler/.test(x.textContent)); b?.click(); return !!b; }); await sleep(900);
        out.dupAfterUndo = (await api('act_transcription_versions', { act_id: 1 })).items.filter(v => v.source === 'copy').length;
        await p.click('dialog.h-tx-dlg [data-tx-vdup]'); await sleep(900);
        // ✓ Utiliser cette version, puis ↶ Annuler
        const textNow = () => p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-body]').value);
        out.textBefore = await textNow();
        if (!(await p.evaluate(() => !document.querySelector('dialog.h-tx-dlg [data-tx-vprev]').hidden))) await p.click(`dialog.h-tx-dlg [data-tx-v="${aiId}"]`);
        await p.waitForSelector('dialog.h-tx-dlg [data-tx-vprev] [data-tx-vuse]', { timeout: 10000 });
        await p.click('dialog.h-tx-dlg [data-tx-vuse]'); await sleep(900);
        out.textUsed = await textNow();
        // 🧠 un mot [?] d'une lecture faite avec des indices : « lu avec un indice » au survol
        out.hintW = await p.evaluate(() => [...document.querySelectorAll('dialog.h-tx-dlg .h-tx-mirror .h-tx-hintw')].map(x => x.textContent));
        const hw = await p.evaluate(() => { const r = document.querySelector('dialog.h-tx-dlg .h-tx-mirror .h-tx-hintw')?.getClientRects()[0]; return r ? {x: r.left + r.width / 2, y: r.top + r.height / 2} : null; });
        if (hw) { await p.mouse.move(hw.x, hw.y); await sleep(120); await p.mouse.move(hw.x + 1, hw.y); await sleep(300); }
        out.hintTip = await p.evaluate(() => { const tip = document.querySelector('dialog.h-tx-dlg [data-tx-abtip]'); return tip && !tip.hidden ? tip.textContent : ''; });
        out.prevClosed = await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-vprev]').hidden && !document.querySelector('dialog.h-tx-dlg [data-tx-editor]').classList.contains('is-dim'));
        out.useUndo = await p.evaluate(() => { const tt = [...document.querySelectorAll('.ui-toast')].filter(x => /maintenant ta version/.test(x.textContent)).at(-1); const b = tt && [...tt.querySelectorAll('button')].find(x => /Annuler/.test(x.textContent)); b?.click(); return !!b; }); await sleep(500);
        out.textUndone = await textNow();
        out.hintAfterUndo = await p.evaluate(() => document.querySelectorAll('dialog.h-tx-dlg .h-tx-mirror .h-tx-hintw').length);
        // 🖱 un clic sur un mot de l'image (la ligne déjà choisie) : le curseur va sur ce mot dans le texte (exact avec la place des mots, ≈ sinon)
        await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-tool="pan"]')?.click()); await sleep(300);
        const zoneAt = (zi, frac) => p.evaluate(([y, f]) => { const r = [...document.querySelectorAll('dialog.h-tx-dlg [data-tx-zones] rect')].find(x => +x.getAttribute('y') === y); if (!r) return null; const b = r.getBoundingClientRect(); return {x: b.x + b.width * f, y: b.y + b.height / 2}; }, [ZONES[zi].y, frac]);
        const clickWord = async (zi, frac) => { let at = await zoneAt(zi, frac); if (!at) return null;
            await p.mouse.click(at.x, at.y); await sleep(900); // 1er clic : la ligne est choisie (comme avant) ; l'image glisse jusqu'à elle
            const first = await p.evaluate(() => { const a = document.querySelector('dialog.h-tx-dlg [data-tx-body]'); return a.value.slice(a.selectionStart, a.selectionEnd); });
            at = await zoneAt(zi, frac); await p.mouse.click(at.x, at.y); await sleep(250); // 2e clic : le curseur sur le mot
            return {first, caret: await p.evaluate(() => { const a = document.querySelector('dialog.h-tx-dlg [data-tx-body]'); return {s: a.selectionStart, e: a.selectionEnd, focus: document.activeElement === a}; })}; };
        { const z = ZONES[3], w = z.wb[2]; out.clickExact = await clickWord(3, ((w[2] + w[3]) / 2 - z.x) / z.w); out.clickExactWant = BODY.indexOf('village'); }
        { const z = ZONES[2], l = LINES[2], i = l.indexOf('cultivateur'); out.clickEst = await clickWord(2, (i + 5) / l.length); out.clickEstWant = BODY.indexOf('cultivateur'); }
        await sleep(600); out.strip2 = await strip();
        out.list2 = (await api('act_transcription_versions', { act_id: 1 })).items;

        /* ─── 🗑 supprimer une version (aperçu, fenêtre 🕘 Versions) et ✎ travailler sur une version dans l'éditeur ─── */
        const rowsDb = () => JSON.parse(php(String.raw`require 'lib/bootstrap.php'; echo json_encode(db()->query('SELECT id, act_id, label, body, created_at, source, auto, data_json FROM act_transcription_versions ORDER BY id')->fetchAll(PDO::FETCH_ASSOC), JSON_UNESCAPED_UNICODE);`)).map(r => ({ ...r, id: Number(r.id) }));
        const toastUndo = re => p.evaluate(r => { const tt = [...document.querySelectorAll('.ui-toast')].filter(x => new RegExp(r).test(x.textContent)).at(-1); const b = tt && [...tt.querySelectorAll('button')].find(x => /Annuler/.test(x.textContent)); b?.click(); return !!b; }, re);
        const postApi = (a, body) => p.evaluate(([x, b]) => window.LCNDA_APP.api(x, {}, { method: 'POST', body: b }).then(r => r.result || r), [a, body]);
        const essA = (await postApi('save_act_transcription_version', { act_id: 1, label: 'Essai A', body: 'essai A', data: { zones: [], people: [] }, auto: 1 })).id;
        const essB = (await postApi('save_act_transcription_version', { act_id: 1, label: 'Essai B', body: 'essai B', data: { zones: [], people: [] }, auto: 1 })).id;
        const wid = (await postApi('save_act_transcription_version', { act_id: 1, label: 'Lecture 7 lignes', body: VBODY, data: { zones: [], people: [], meta: { model: 'kraken-essai' } }, auto: 0, source: 'htr:kraken-essai' })).id;
        await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-cmd="save"]').click()); await sleep(1200);
        // 🗑 depuis l'aperçu : la pastille disparaît, la ligne part de la base ; ↶ Annuler la remet telle quelle (même id, même date, même texte)
        const copyV = out.list2.find(v => v.source === 'copy'); out.delRowBefore = rowsDb().find(r => r.id === copyV.id);
        await p.click(`dialog.h-tx-dlg [data-tx-v="${copyV.id}"]`); await p.waitForSelector('dialog.h-tx-dlg [data-tx-vprev] [data-tx-vdel]', { timeout: 10000 });
        out.delBtns = await p.evaluate(() => [...document.querySelectorAll('dialog.h-tx-dlg [data-tx-vprev] button')].map(b => b.textContent.trim()));
        await p.click('dialog.h-tx-dlg [data-tx-vdel]'); await sleep(900);
        out.delConfirm = await p.evaluate(() => !!document.querySelector('dialog[open].confirm-dialog, dialog[open] [data-confirm-ok]'));
        out.delStrip = await strip(); out.delInDb = rowsDb().some(r => r.id === copyV.id); out.delPrevHidden = await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-vprev]').hidden);
        out.delUndo = await toastUndo('Version supprimée'); await sleep(900);
        out.delRowAfter = rowsDb().find(r => r.id === copyV.id); out.delStripAfter = await strip();
        // « Ma version (actuelle) » : le texte du document, pas de 🗑 (la bulle le dit)
        await p.click('dialog.h-tx-dlg [data-tx-v="me"]'); await sleep(200);
        out.me = await p.evaluate(() => ({ del: !!document.querySelector('dialog.h-tx-dlg [data-tx-vdel]') })); out.me.title = out.delStripAfter.chips.find(x => x.id === 'me').title;
        // ⧉ Dupliquer : à la suite des pastilles, sans ombre décalée, de la hauteur d'une pastille
        out.dupLook = await p.evaluate(() => { const d = document.querySelector('dialog.h-tx-dlg [data-tx-vdup]'), m = document.querySelector('dialog.h-tx-dlg [data-tx-vmore]') || [...document.querySelectorAll('dialog.h-tx-dlg [data-tx-v]')].at(-1), cs = getComputedStyle(d), a = d.getBoundingClientRect(), b = m.getBoundingClientRect();
            return { shadow: cs.boxShadow, h: a.height, chipH: b.height, sameRow: Math.abs((a.top + a.bottom) / 2 - (b.top + b.bottom) / 2) < 3, gap: a.left - b.right, spacer: !!document.querySelector('dialog.h-tx-dlg [data-tx-vers] .spacer') }; });
        // 🕘 la fenêtre Versions : plusieurs cochées (et « Maintenant », qui ne part pas) → 🗑 d'un coup, une seule ↶ Annuler
        await p.click('dialog.h-tx-dlg [data-tx-vmore]'); await p.waitForSelector('dialog[open] [data-vers-check]', { timeout: 10000 }); await sleep(400);
        for (const id of ['now', essA, essB, copyV.id]) await p.click(`dialog[open] [data-vers-check="${id}"]`);
        await sleep(200);
        out.manyBtn = await p.evaluate(() => document.querySelector('dialog[open] [data-vers-delmany]')?.textContent.trim() || '');
        out.manyRowsBefore = rowsDb().filter(r => [essA, essB, copyV.id].includes(Number(r.id)));
        await p.click('dialog[open] [data-vers-delmany]'); await sleep(1200);
        out.manyLeft = rowsDb().filter(r => [essA, essB, copyV.id].includes(Number(r.id))).length;
        out.manyRows = await p.evaluate(() => [...document.querySelectorAll('dialog[open] [data-vers-row]')].map(r => r.dataset.versRow));
        out.manyStrip = await strip(); out.manyText = await textNow();
        out.manyUndo = await toastUndo('3 versions supprimées'); await sleep(1200);
        out.manyRowsAfter = rowsDb().filter(r => [essA, essB, copyV.id].includes(Number(r.id)));
        await p.evaluate(() => document.querySelector('dialog[open] [data-vers-close]').click()); await sleep(400);
        // ✎ travailler sur une version dans l'éditeur : même nombre de lignes → chaque zone reliée à sa ligne ; la bande dit sur quoi on travaille
        const zonesNow = async () => { await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-cmd="save"]').click()); await sleep(900); return (await api('act_transcription', { id: 1 })).data.zones; };
        const statusNow = () => p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-status]').title);
        out.workTextBefore = await textNow(); out.workZonesBefore = await zonesNow();
        await p.click(`dialog.h-tx-dlg [data-tx-v="${wid}"]`); await p.waitForSelector('dialog.h-tx-dlg [data-tx-vprev] [data-tx-vedit]', { timeout: 10000 });
        await p.click('dialog.h-tx-dlg [data-tx-vedit]'); await sleep(900);
        out.workStatus = await statusNow(); out.workText = await textNow();
        out.workBand = await p.evaluate(() => { const b = document.querySelector('dialog.h-tx-dlg [data-tx-vwork]'); return b ? b.textContent.replace(/\s+/g, ' ').trim() : ''; });
        out.workChips = await p.evaluate(id => ({ me: document.querySelector('dialog.h-tx-dlg [data-tx-v="me"]').classList.contains('is-on'), v: document.querySelector(`dialog.h-tx-dlg [data-tx-v="${id}"]`)?.className || '' }), wid);
        out.workBands = await p.evaluate(() => document.querySelectorAll('dialog.h-tx-dlg [data-tx-zones] rect').length);
        out.workZones = await zonesNow();
        await p.click('dialog.h-tx-dlg [data-tx-vback]'); await sleep(1200);
        out.backText = await textNow(); out.backBand = await p.evaluate(() => !!document.querySelector('dialog.h-tx-dlg [data-tx-vwork]'));
        out.backZones = await zonesNow();
        out.widZones = JSON.parse(rowsDb().find(r => r.id === wid).data_json).zones;
        // une lecture d'un autre nombre de lignes : les zones ne sont plus reliées (à relier à la main) ; ↶ Annuler remet tout
        await p.click(`dialog.h-tx-dlg [data-tx-v="${aiId}"]`); await p.waitForSelector('dialog.h-tx-dlg [data-tx-vprev] [data-tx-vedit]', { timeout: 10000 });
        await p.click('dialog.h-tx-dlg [data-tx-vedit]'); await sleep(900);
        out.aiStatus = await statusNow(); out.aiText = await textNow();
        out.aiUndo = await toastUndo('Tu travailles sur'); await sleep(600);
        out.aiUndoText = await textNow(); out.aiUndoBand = await p.evaluate(() => !!document.querySelector('dialog.h-tx-dlg [data-tx-vwork]'));
        out.aiUndoZones = await zonesNow();
        // revenir sur la version de 7 lignes : ses zones à elle (gardées), puis ↩
        await p.click(`dialog.h-tx-dlg [data-tx-v="${wid}"]`); await p.waitForSelector('dialog.h-tx-dlg [data-tx-vprev] [data-tx-vedit]', { timeout: 10000 });
        await p.click('dialog.h-tx-dlg [data-tx-vedit]'); await sleep(900);
        out.againStatus = await statusNow(); out.againZones = await zonesNow();
        await p.click('dialog.h-tx-dlg [data-tx-vback]'); await sleep(1200);
        out.againBackText = await textNow();

        // la couleur retenue après avoir fermé et rouvert l'Atelier
        await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-cmd="save"]').click()); await sleep(700);
        await closeAct(); await openAct();
        await selectWords('Gaspard Mazaud'); await sleep(150);
        out.colorReopen = await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-wcol].is-on')?.dataset.txWcol);
        out.boxReopen = await boxes();
        out.whyReopen = await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-whyrow] [data-tx-why-k]')?.value);
        // téléphone : rien ne déborde
        await p.setViewportSize({ width: 390, height: 844 }); await sleep(500);
        out.overflow = await p.evaluate(() => { const d = document.querySelector('dialog.h-tx-dlg'); return [...d.querySelectorAll('[data-tx-vers], [data-tx-whyrow], [data-tx-vers] *')].filter(e => e.offsetParent && e.getBoundingClientRect().right > innerWidth + 1).map(e => e.className || e.tagName).slice(0, 5); });
        out.errs = errs;
    } finally { await browser.close(); proc.kill(); fake.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
}

(async () => {
    const checks = [];
    if (!chromium) { console.log('  — navigateur : Playwright absent, test sauté'); process.exit(0); }
    const out = {};
    await browserPart(out);
    const z = i => ZONES[i];
    checks.push(
        ['❓ acte de notoriété : le choix « Pourquoi cet acte a été fait » au-dessus du texte, avec les cinq raisons', () => {
            assert.equal(out.whyBefore.shown, true); assert.equal(out.whyBefore.value, '');
            assert.deepEqual(out.whyAuto.options, ['', 'mariage', 'naissance', 'succession', 'pension', 'autre']); }],
        ['❓ « 🧭 Repérer » le pré-remplit (« contracter mariage » → mariage), en vert, à vérifier', () => {
            assert.equal(out.whyAuto.value, 'mariage'); assert.equal(out.whyAuto.auto, true); assert.match(out.whyAuto.note, /à vérifier/); }],
        ['❓ choisi à la main et la précision libre : gardés avec l’acte (plus « à vérifier »)', () => {
            assert.equal(out.whyManual.auto, false); assert.equal(out.whySaved.k, 'naissance'); assert.match(out.whySaved.t, /acte de naissance n’a pu être trouvé/); assert.equal(out.whySaved.auto, undefined); }],
        ['❓ dans le 🧩 Gabarit de la notoriété, sur la fiche de la personne reliée et sur la page du document', () => {
            assert.equal(out.whyGab, 'naissance');
            assert.match(out.ficheHtml, /pour remplacer un acte de naissance perdu/); assert.match(out.ficheHtml, /mariage prévu avec Catherine LACOMBE/);
            assert.equal(out.mediaReason?.k, 'naissance'); }],
        ['🔦 des mots choisis : un cadre ≈ dans la bande de leur ligne, plus serré qu’elle, au bon endroit', () => {
            assert.equal(out.box1.length, 1); const b = out.box1[0], Z = z(2);
            assert.equal(b.kind, 'est'); assert.ok(b.y > Z.y && b.y + b.h < Z.y + Z.h, JSON.stringify(b)); assert.ok(b.x >= Z.x && b.x + b.w <= Z.x + Z.w); assert.ok(b.w < Z.w / 2);
            const at = LINES[2].indexOf('Gaspard') / LINES[2].length; assert.ok(Math.abs((b.x - Z.x) / Z.w - at) < .02, `${(b.x - Z.x) / Z.w} ≠ ${at}`);
            assert.match(out.label1, /^≈ « Gaspard Mazaud »$/); }],
        ['🔦 exact quand la lecture a donné la place de chaque mot (sans ≈)', () => {
            const wb = z(3).wb[2]; assert.equal(out.boxExact.length, 1); assert.equal(out.boxExact[0].kind, 'exact'); assert.equal(out.boxExact[0].x, wb[2]); assert.equal(out.boxExact[0].w, wb[3] - wb[2]);
            assert.match(out.labelExact, /^« village »$/); }],
        ['🔦 sur plusieurs lignes : un cadre par ligne', () => { assert.equal(out.boxMulti.length, 2); assert.ok(out.boxMulti[1].y > out.boxMulti[0].y); }],
        ['🔦 la couleur du cadre se choisit (bleu au départ), retenue dans genealogie-htr-word-color et retrouvée en rouvrant l’Atelier', () => {
            assert.equal(out.colorDefault.on, '#055dff'); assert.ok(out.colorDefault.n >= 4); assert.equal(out.box1[0].stroke, '#055dff');
            assert.equal(out.boxRed[0].stroke, '#e03131'); assert.equal(out.colorStored, '#e03131');
            assert.equal(out.colorReopen, '#e03131'); assert.equal(out.boxReopen[0]?.stroke, '#e03131'); }],
        ['🧠 Aider l’IA : les indices de la base, cochés comme conseillé (événement, noms, lieux, pourquoi ; pas parents ni métiers)', () => {
            const H = Object.fromEntries(out.hints.map(h => [h.key, h]));
            assert.ok(H.marriage && H.names && H.places && H.parents && H.jobs && H.reason, JSON.stringify(out.hints.map(h => h.key)));
            assert.match(H.marriage.text, /Gaspard MAZAUD × Catherine LACOMBE, 1813, Treignac/); assert.match(H.names.text, /MAZAUD, Mazaud, Mazaut/); assert.match(H.names.text, /La Combe/); assert.match(H.places.text, /Treignac/);
            assert.match(H.parents.text, /Pierre LACOMBE et Marie DURAND/); assert.match(H.jobs.text, /cultivateur/);
            assert.deepEqual([H.reason.on, H.marriage.on, H.names.on, H.places.on, H.parents.on, H.jobs.on], [true, true, true, true, false, false]);
            assert.match(out.iaPeople, /Gaspard Mazaud/); assert.match(out.iaCount, /^4 indices cochés/); }],
        ['🧠 le texte envoyé se voit tel quel : document, de quoi il parle, indices cochés, règle « rien inventer », mot douteux [?]', () => {
            const s = out.sentShown; assert.match(s, /Document : Acte de notoriété de Gaspard MAZAUD — Acte de notoriété \(12 oct\. 1813, Treignac\)/); assert.match(s, /De quoi il parle : Acte de notoriété de Gaspard MAZAUD pour prouver qu’il est célibataire/);
            assert.match(s, /- mariage connu : Gaspard MAZAUD × Catherine LACOMBE, 1813, Treignac/); assert.match(s, /- façons d’écrire : MAZAUD, Mazaud, Mazaut/); assert.match(s, /- pourquoi cet acte : remplacer un acte de naissance perdu/);
            assert.match(s, /N'ajoute jamais un nom/); assert.match(s, /marque-le \[\?\] même s'il ressemble à un indice/); assert.doesNotMatch(s, /cultivateur|Pierre LACOMBE et Marie/); }],
        ['🧠 les indices partent dans la consigne de l’IA (le faux Ollama reçoit exactement le texte montré)', () => {
            assert.equal(out.prompts.length, 1); assert.equal(out.prompts[0], out.sentShown); assert.match(out.prompts[0], /Tu es paléographe/);
            assert.match(out.ctxLine, /4 indices cochés/); assert.match(out.headCount, /4/); }],
        ['🕘 la bande « Versions » juste au-dessus de « 📄 Ce texte est celui du document » : ma version, la lecture de l’IA (modèle, date, image), ⧉ Dupliquer', () => {
            const s = out.strip1; assert.equal(s.hidden, false); assert.equal(s.before, true); assert.equal(s.dup, true);
            assert.match(s.chips[0].text, /Ma version \(actuelle\)/); assert.equal(s.chips[0].on, true);
            const ai = s.chips.find(c => /🤖/.test(c.text)); assert.ok(ai, JSON.stringify(s.chips)); assert.match(ai.text, /qwen3-vl 8b/); assert.match(ai.text, /image améliorée/); assert.match(ai.text, /\d\d\/\d\d \d\d:\d\d/);
            assert.match(ai.title, /avec « Aider l’IA » \(4 indices\)/); assert.match(ai.title, /améliorée automatiquement/); }],
        ['🕘 la lecture garde le modèle, l’image envoyée, la partie lue et le nombre d’indices', () => {
            const v = out.list1.find(x => /^deep:/.test(x.source)); assert.deepEqual(v.meta, { model: 'qwen3-vl:8b-instruct', img: 'auto', part: 'page', hints: 4 }); }],
        ['🕘 un clic : l’aperçu en lecture seule (mots douteux soulignés), « Utiliser cette version », « Comparer avec ma version », « Fermer »', () => {
            const v = out.prev; assert.equal(v.hidden, false); assert.equal(v.dim, true); assert.match(v.ro, /Gaspard Mazand/); assert.equal(v.doubt, 1);
            assert.ok(v.btns.some(b => /Utiliser cette version/.test(b)) && v.btns.some(b => /Comparer avec ma version/.test(b)) && v.btns.some(b => /Fermer/.test(b)), v.btns.join(' | ')); assert.match(v.meta, /qwen3-vl 8b/); }],
        ['🕘 « ⚖️ Comparer avec ma version » ouvre « Comparer les lectures » avec ces deux lectures cochées', () => {
            const aiId = out.list1.find(x => /^deep:/.test(x.source)).id; assert.deepEqual(out.cmp.sort((a, b) => a - b), [0, aiId]); }],
        ['🕘 « ⧉ Dupliquer » garde une copie de l’IA (une pastille de plus), ↶ Annuler la retire', () => {
            assert.equal(out.dupList.length, 1); assert.equal(out.dupList[0].label, 'Copie de l’IA'); assert.match(out.dupList[0].meta?.from || '', /qwen3-vl 8b/);
            assert.ok(out.dupStrip.chips.some(c => /📋 Copie de l’IA/.test(c.text)), JSON.stringify(out.dupStrip.chips)); assert.equal(out.dupUndo, true); assert.equal(out.dupAfterUndo, 0); }],
        ['🕘 « ✓ Utiliser cette version » : elle devient ma version (l’ancienne gardée), ↶ Annuler remet l’ancienne', () => {
            assert.equal(out.textBefore, BODY); assert.match(out.textUsed, /Gaspard Mazand \[\?\]/); assert.equal(out.prevClosed, true); assert.equal(out.useUndo, true); assert.equal(out.textUndone, BODY);
            assert.ok(out.list2.some(v => v.auto && v.label === 'Avant « Utiliser cette version »' && v.body === undefined)); }],
        ['🧠 l’aperçu d’une lecture faite avec des indices : son mot douteux dit « lu avec un indice »', () => {
            assert.equal(out.prevHint.length, 1); assert.match(out.prevHint[0], /🧠 lu avec un indice/); }],
        ['🧠 dans le texte : le mot [?] de la lecture gardée est souligné, sa bulle dit « lu avec un indice » ; ↶ Annuler l’enlève', () => {
            assert.deepEqual(out.hintW, ['Mazand']); assert.match(out.hintTip, /🧠 lu avec un indice/); assert.match(out.hintTip, /Mazand/); assert.equal(out.hintAfterUndo, 0); }],
        ['🖱 un clic sur un mot de l’image (ligne déjà choisie) met le curseur sur ce mot dans le texte : exact avec la place des mots, ≈ sinon', () => {
            assert.ok(out.clickExact, 'la zone de la ligne 4'); assert.equal(out.clickExact.first, LINES[3], '1er clic : la ligne choisie, comme avant');
            assert.deepEqual([out.clickExact.caret.s, out.clickExact.caret.e, out.clickExact.caret.focus], [out.clickExactWant, out.clickExactWant, true]);
            assert.ok(out.clickEst); assert.deepEqual([out.clickEst.caret.s, out.clickEst.caret.e], [out.clickEstWant, out.clickEstWant]); }],
        ['🕘 la bande reste courte : les versions automatiques dans « ⋯ N autres »', () => {
            const more = out.strip2.chips.find(c => c.id === 'more'); assert.ok(more, JSON.stringify(out.strip2.chips)); assert.ok(out.strip2.chips.length <= 7);
            assert.ok(out.list2.filter(v => v.auto).length >= 1); assert.equal(out.strip2.chips.filter(c => c.id !== 'me' && c.id !== 'more').length, out.list2.filter(v => !v.auto).length); }],
        ['🗑 « Supprimer cette version » dans l’aperçu : sans question, la pastille et la ligne de la base partent ; ↶ Annuler la remet telle quelle', () => {
            assert.ok(out.delBtns.some(b => /🗑 Supprimer cette version/.test(b)), out.delBtns.join(' | ')); assert.equal(out.delConfirm, false);
            const id = String(out.delRowBefore.id); assert.ok(!out.delStrip.chips.some(c => c.id === id), JSON.stringify(out.delStrip.chips)); assert.equal(out.delInDb, false); assert.equal(out.delPrevHidden, true);
            assert.equal(out.delUndo, true); assert.deepEqual(out.delRowAfter, out.delRowBefore); assert.ok(out.delStripAfter.chips.some(c => c.id === id)); }],
        ['🗑 « Ma version (actuelle) » ne se supprime pas (c’est le texte du document) : pas de 🗑, la bulle le dit', () => {
            assert.equal(out.me.del, false); assert.match(out.me.title, /ne se supprime pas/); }],
        ['⧉ « Dupliquer » à la suite des pastilles, petit et sans ombre décalée', () => {
            const d = out.dupLook; assert.equal(d.spacer, false); assert.equal(d.shadow, 'none'); assert.ok(d.sameRow, JSON.stringify(d)); assert.ok(d.gap >= 0 && d.gap < 20, JSON.stringify(d)); assert.ok(d.h <= d.chipH + 4, JSON.stringify(d)); }],
        ['🗑 fenêtre 🕘 Versions : plusieurs cochées supprimées d’un coup (pas « Maintenant »), une seule ↶ Annuler les remet (mêmes id, dates, textes)', () => {
            assert.match(out.manyBtn, /Supprimer les 3 versions cochées/); assert.equal(out.manyRowsBefore.length, 3); assert.equal(out.manyLeft, 0);
            assert.ok(out.manyRows.includes('now')); assert.ok(!out.manyRows.includes(String(out.manyRowsBefore[0].id)));
            assert.ok(!out.manyStrip.chips.some(c => c.id === String(out.delRowBefore.id)), 'la bande suit'); assert.equal(out.manyText, out.textUndone);
            assert.equal(out.manyUndo, true); assert.deepEqual(out.manyRowsAfter, out.manyRowsBefore); }],
        ['✎ « Travailler sur cette version dans l’éditeur » : son texte, chaque zone reliée à sa ligne (même nombre de lignes), la bande dit « Tu travailles sur … — ↩ Revenir à ma version »', () => {
            const vl = VLINES; let at = 0; const want = vl.map(l => { const r = [at, at + l.length]; at += l.length + 1; return r; });
            assert.equal(out.workText, VBODY); assert.match(out.workStatus, /Zones reliées aux lignes de cette version/);
            assert.deepEqual(out.workZones.map(z => [z.s, z.e]), want); assert.deepEqual(out.workZones.map(z => z.id), out.workZonesBefore.map(z => z.id)); assert.equal(out.workBands, 7);
            assert.match(out.workBand, /Tu travailles sur : ✍️ Écriture à la main/); assert.match(out.workBand, /↩ Revenir à ma version/);
            assert.equal(out.workChips.me, false); assert.match(out.workChips.v, /is-work/); assert.match(out.workChips.v, /is-on/); }],
        ['✎ « ↩ Revenir à ma version » : mon texte et mes zones ; la version garde ses zones reliées (retrouvées en y revenant)', () => {
            assert.equal(out.backText, out.workTextBefore); assert.equal(out.backBand, false); assert.deepEqual(out.backZones, out.workZonesBefore);
            assert.deepEqual(out.widZones.map(z => [z.id, z.s, z.e]), out.workZones.map(z => [z.id, z.s, z.e]));
            assert.match(out.againStatus, /Zones reliées/); assert.deepEqual(out.againZones.map(z => [z.id, z.s, z.e]), out.workZones.map(z => [z.id, z.s, z.e])); assert.equal(out.againBackText, out.workTextBefore); }],
        ['✎ une lecture d’un autre nombre de lignes : les zones restent à relier à la main ; ↶ Annuler remet mon texte et mes zones', () => {
            assert.match(out.aiStatus, /^7 zones à relier/); assert.match(out.aiText, /Gaspard Mazand \[\?\]/);
            assert.equal(out.aiUndo, true); assert.equal(out.aiUndoText, out.workTextBefore); assert.equal(out.aiUndoBand, false); assert.deepEqual(out.aiUndoZones, out.workZonesBefore); }],
        ['❓ la raison retrouvée en rouvrant l’acte', () => assert.equal(out.whyReopen, 'naissance')],
        ['à 390 px, la bande et le choix de la raison ne débordent pas', () => assert.deepEqual(out.overflow, [])],
        ['aucune erreur JS', () => assert.deepEqual(out.errs, [])],
    );
    let failed = 0;
    for (const [name, fn] of checks) { try { fn(); console.log('  ✓', name); } catch (e) { failed++; console.log('  ✗', name, '\n   ', e.message); } }
    console.log('  (non vérifié ici : le vrai modèle d’IA — son texte est imité)');
    console.log(failed ? `${failed} échec(s)` : `${checks.length} vérifications réussies`);
    process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
