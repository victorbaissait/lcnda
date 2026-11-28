'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🔁 La lecture approfondie bornée (lib/transcription_actes.php tx_deep_loop / tx_deep_budget / tx_deep_time_limit, heritage-transcribe-acte.js) :
 *   node tests/test-lecture-approfondie-boucle.js
 * Un modèle « vision » tombe parfois dans une boucle : quelques bonnes lignes, puis « [illisible] » sans fin, ou la même ligne sans fin ;
 * la page restait « Lecture approfondie… 441 s » indéfiniment. Ici, avec un FAUX Ollama et un FAUX serveur compatible OpenAI (Unsloth),
 * dans ce programme (rien ne part sur Internet) :
 *  1. les fonctions seules (php -r) : boucle « [illisible] », même ligne, bloc de deux lignes, répétition dans une ligne, trop de lignes ;
 *     rien de coupé dans un texte normal (deux « [illisible] » de suite, une ligne de tirets) ; le budget de jetons ; le temps maximum par modèle ;
 *  2. dans la fenêtre « 🔬 Lecture approfondie » : la rangée « Image » à part de la rangée « Modèle » (libellé aligné en haut, les choix
 *     d'image dans la leur) ; « Avancé : autre modèle (Ollama) » puis le nom du serveur choisi ;
 *  3. « [illisible] » sans fin, puis la même ligne sans fin : la lecture s'arrête vite (le flux est coupé), les bonnes lignes gardées,
 *     la boucle retirée, l'avis « ⚠ L'IA s'est mise à répéter : lecture arrêtée à la ligne N… », la barre de progression disparaît ;
 *     num_predict (borné), repeat_penalty, repeat_last_n et temperature 0 envoyés ;
 *  4. ⏱ le temps maximum (LCNDA_TX_DEEP_LIMIT) : le texte déjà lu gardé, l'avis ; un modèle muet : une erreur claire, pas une barre sans fin ;
 *  5. ■ Arrêter pendant la lecture : le texte déjà lu est gardé ;
 *  6. le même chemin par un serveur compatible OpenAI : max_tokens, frequency_penalty, temperature 0 ; la boucle coupée de même.
 * Personnes fictives. Non vérifié ici : un vrai modèle (ses boucles sont imitées).
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

const GOOD = ['L’an mil huit cent vingt, le cinq mars,', 'est comparu Louis Fabre, tisserand,', 'qui nous a présenté une fille nommée Jeanne.'];
const LIMIT = 12; // ⏱ secondes (LCNDA_TX_DEEP_LIMIT) : le chemin du temps maximum sans attendre six minutes
/* ─── l'image : 1200 × 1600, des bandes d'« écriture » ─── */
const W = 1200, H = 1600;
const px = new Uint8Array(W * H);
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
for (let i = 0; i < px.length; i++) px[i] = 150 + Math.floor(rnd() * 40);
for (let l = 0; l < 30; l++) { const y0 = 30 + l * 52; for (let y = y0; y < y0 + 22; y++) for (let x = 20; x < W - 20; x++) if (rnd() < .35) px[y * W + x] = 105; }
const crc32 = buf => { let c, crc = 0xFFFFFFFF; for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xFF; for (let q = 0; q < 8; q++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xFFFFFFFF) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, 'latin1'), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, c]); };
function png(w, h, p) { const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; const raw = Buffer.alloc((w * 3 + 1) * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const j = y * (w * 3 + 1) + 1 + x * 3; raw[j] = raw[j + 1] = p[y * w + x]; raw[j + 2] = Math.max(0, p[y * w + x] - 12); }
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });

/** ce que le faux modèle écrit après les bonnes lignes : i = le numéro du morceau (0, 1, 2…) ; null : rien (modèle muet) */
const TAILS = {
    illisible: () => '[illisible]\n',
    repeat: () => 'et de Marie Durand sa femme\n',
    slow: i => `ligne lue numéro ${i + 1} sans boucle\n`,
    silent: () => null,
};
const DELAY = { illisible: 25, repeat: 25, slow: 600, silent: 600 };

/** un faux serveur qui écrit les bonnes lignes puis la fin choisie, SANS FIN, jusqu'à ce que le client coupe ; il note tout */
function fakeServer(kind, log) {
    return http.createServer((req, res) => {
        let body = ''; req.on('data', c => { body += c; }); req.on('end', () => {
            const send = obj => res.write(kind === 'ollama' ? JSON.stringify(obj) + '\n' : 'data: ' + JSON.stringify(obj) + '\n\n');
            if (kind === 'ollama') {
                if (req.url === '/api/version') return void res.end(JSON.stringify({ version: '0.12.0' }));
                if (req.url === '/api/tags') return void res.end(JSON.stringify({ models: [{ name: 'qwen3-vl:8b-instruct', size: 1 }] }));
                if (req.url === '/api/show') return void res.end(JSON.stringify({ capabilities: ['completion', 'vision'] }));
            } else if (req.method === 'GET' && req.url === '/v1/models') return void res.end(JSON.stringify({ object: 'list', data: [{ id: 'unsloth/Qwen3-VL-8B-Instruct-GGUF', object: 'model' }] }));
            const isChat = kind === 'ollama' ? req.url === '/api/chat' : req.url === '/v1/chat/completions';
            if (!isChat) { res.statusCode = 404; return void res.end('{}'); }
            const j = JSON.parse(body || '{}'); const mode = log.mode; const rec = { body: j, mode, start: Date.now(), aborted: false, end: 0, sent: 0 }; log.chats.push(rec);
            res.setHeader('Content-Type', kind === 'ollama' ? 'application/x-ndjson' : 'text/event-stream');
            const piece = s => (kind === 'ollama' ? { message: { role: 'assistant', content: s }, done: false } : { choices: [{ index: 0, delta: { content: s } }] });
            let i = 0, timer = 0;
            res.on('close', () => { clearTimeout(timer); if (!res.writableEnded) { rec.aborted = true; rec.end = Date.now(); } });
            const step = () => {
                if (res.destroyed) return;
                if (i < GOOD.length) { send(piece(GOOD[i] + '\n')); i++; rec.sent++; }
                else { const t = TAILS[mode](i - GOOD.length); if (t !== null) { send(piece(t)); rec.sent++; } i++; }
                if (i > 20000) { res.end(); return; } // (jamais atteint : le client coupe avant)
                timer = setTimeout(step, i <= GOOD.length ? 20 : DELAY[mode]);
            };
            if (mode === 'silent') { timer = setTimeout(() => {}, 120000); return; } // muet : rien du tout
            step();
        });
    });
}

function unitPart(php) {
    const out = JSON.parse(php(String.raw`class LcndaBadInput extends Exception {} require 'lib/transcription_actes.php';
$g = "L’an mil huit cent vingt,\nest comparu Louis Fabre,\nqui nous a présenté une fille.\n";
$c = ['ill' => $g . str_repeat("[illisible]\n", 6), 'ill2' => $g . "[illisible] [illisible]\n[illisible]\n[illisible] [?]\n[illisible]\n",
  'same' => $g . str_repeat("et de Marie Durand sa femme\n", 5), 'cycle' => $g . str_repeat("ligne A du texte\nligne B du texte\n", 3),
  'inline' => $g . 'et ont signé ' . str_repeat('[illisible] ', 14), 'inline2' => $g . 'le parrain ' . str_repeat('Jean Fabre, ', 10),
  'ok' => $g . "[illisible]\n[illisible]\nfin de l’acte\n", 'dashes' => $g . str_repeat('-', 120) . "\nsuite\n",
  'over' => implode("\n", array_map(fn($i) => "ligne numéro $i différente", range(1, 30))) . "\n", 'okfinal' => $g . 'dernière ligne'];
$r = []; foreach ($c as $k => $t) { $r[$k] = tx_deep_loop($t, $k === 'over' ? 12 : 0, $k === 'okfinal'); }
$r['budget'] = [tx_deep_budget(2200), tx_deep_budget(300), tx_deep_budget(2000, 20)];
$r['limit'] = [tx_deep_time_limit('qwen3-vl:32b-instruct'), tx_deep_time_limit('qwen3-vl:4b-instruct'), tx_deep_time_limit('qwen3-vl:8b-instruct'), tx_deep_time_limit('qwen2.5vl:72b'), tx_deep_time_limit('x', 90), tx_deep_time_limit('x', 99999)];
$r['partial'] = tx_deep_keep_partial("a\nb\n[illisible]\n[illisible] [illisible]\n");
echo json_encode($r, JSON_UNESCAPED_UNICODE);`));
    return out;
}

(async () => {
    const checks = [];
    const phpPath = findPhp([devBundledPhp()]);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-txb-'));
    const dir = path.join(tmp, 'data'); fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'media', 'acte-fabre.png'), png(W, H, px));
    const env = { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4', LCNDA_RAM_GB: '16' };
    const php = code => { const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], { cwd: appRoot, encoding: 'utf8', env }); if (r.status !== 0) throw new Error(r.stderr || r.stdout); return r.stdout; };
    const U = unitPart(php);
    const G3 = 'L’an mil huit cent vingt,\nest comparu Louis Fabre,\nqui nous a présenté une fille.';
    checks.push(
        ['tx_deep_loop : « [illisible] » répété (même un peu différent) → coupé avant, bonnes lignes gardées, arrêt à la ligne 4', () => {
            for (const k of ['ill', 'ill2']) { assert.equal(U[k]?.why, 'loop', k); assert.equal(U[k].text, G3, k); assert.equal(U[k].line, 4, k); } }],
        ['tx_deep_loop : la même ligne, ou un bloc de deux lignes, répétés → gardés une fois', () => {
            assert.equal(U.same.text, G3 + '\net de Marie Durand sa femme'); assert.equal(U.same.line, 5);
            assert.equal(U.cycle.text, G3 + '\nligne A du texte\nligne B du texte'); assert.equal(U.cycle.line, 6); }],
        ['tx_deep_loop : une répétition dans une seule ligne (sans retour à la ligne) → coupée', () => {
            assert.equal(U.inline.text, G3 + '\net ont signé'); assert.equal(U.inline2.why, 'loop'); assert.match(U.inline2.text, /le parrain Jean Fabre,$/); }],
        ['tx_deep_loop : bien plus de lignes que la page n’en a → « overflow »', () => { assert.equal(U.over.why, 'overflow'); }],
        ['tx_deep_loop : un texte normal n’est pas coupé (deux « [illisible] » de suite, une ligne de tirets, la fin)', () => { assert.equal(U.ok, null); assert.equal(U.dashes, null); assert.equal(U.okfinal, null); }],
        ['tx_deep_budget : les jetons bornés d’après les lignes (page entière ≤ 4096, petite zone ≈ 1000)', () => {
            const [page, small, known] = U.budget; assert.ok(page.num_predict <= 4096 && page.num_predict >= 3000, JSON.stringify(page)); assert.ok(small.num_predict < 1200, JSON.stringify(small));
            assert.equal(known.lines, 20); assert.equal(known.num_predict, 20 * 40 * 1.5 + 256); }],
        ['tx_deep_time_limit : 6 min pour un gros modèle, moins pour un petit, 10 min pour un très gros ; le choix borné (10 s – 1 h)', () => {
            assert.deepEqual(U.limit, [360, 180, 300, 600, 90, 3600]); }],
        ['tx_deep_keep_partial : la fin « [illisible] » retirée', () => { assert.deepEqual(U.partial, { text: 'a\nb', line: 3 }); }],
    );
    if (!chromium) { console.log('  — navigateur : Playwright absent, partie navigateur sautée'); }
    else {
        php(String.raw`require 'lib/paths.php'; $p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; require 'tests/api_functions.php'; $pdo = db();
$id = (int) save_person($pdo, ['first_name' => 'Louis', 'last_name' => 'Fabre', 'gender' => 'male'])['id']; $pdo->exec("UPDATE persons SET is_start=1 WHERE id=$id");
$pdo->exec("INSERT INTO media(title, media_type, filename) VALUES('Naissance Fabre', 'image', 'acte-fabre.png')"); echo 'ok';`);
        const oll = { mode: 'illisible', chats: [] }, uns = { mode: 'illisible', chats: [] };
        const fakeO = fakeServer('ollama', oll), fakeU = fakeServer('openai', uns);
        const oport = await freePort(); await new Promise(r => fakeO.listen(oport, '127.0.0.1', r));
        const uport = await freePort(); await new Promise(r => fakeU.listen(uport, '127.0.0.1', r));
        const port = await freePort(), base = `http://127.0.0.1:${port}/`;
        const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env: { ...env, LCNDA_OLLAMA_URL: `http://127.0.0.1:${oport}`, LCNDA_TX_DEEP_LIMIT: String(LIMIT) }, stdio: 'ignore' });
        const browser = await chromium.launch();
        const out = {};
        try {
            for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
            const p = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })).newPage(); const errs = [];
            p.on('pageerror', e => errs.push(e.message));
            await p.goto(base); await p.waitForFunction(() => window.LCNDA_EXT?.openActTranscriber && window.LCNDA_EXT?.txActe?.warnText, null, { timeout: 30000 });
            await p.evaluate(() => { try { localStorage.removeItem('genealogie-htr-image-mode'); localStorage.removeItem('genealogie-tx-deep-limit'); localStorage.setItem('genealogie-tx-deep-model', 'qwen3-vl:8b-instruct'); } catch (_) {} });
            await p.evaluate(() => window.LCNDA_EXT.openActTranscriber({ mediaId: 1, filename: 'acte-fabre.png', title: 'Naissance de Jeanne Fabre' }));
            await p.waitForFunction(() => document.querySelector('dialog.h-tx-dlg [data-tx-img]')?.getAttribute('href'), null, { timeout: 15000 }); await sleep(300);
            const openDeep = async () => {
                await p.evaluate(() => document.querySelector('dialog[open] [data-txa-deep]')?.closest('dialog')?.close()); await sleep(150);
                await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-cmd="deep"]').click());
                await p.waitForFunction(() => document.querySelector('[data-txa-read]'), null, { timeout: 15000 });
                await p.evaluate(() => { const d = document.querySelector('details.h-txa-settings'); if (d) d.open = true; });
            };
            await openDeep();
            // 2. la mise en page : « Image » dans sa propre rangée
            out.layout = await p.evaluate(() => {
                const models = document.querySelector('[data-txa-models]'), img = document.querySelector('[data-txa-imgmode]'), k = document.querySelector('[data-txa-imgk]');
                const radios = [...document.querySelectorAll('input[name="txa_img"]')];
                const rk = k.getBoundingClientRect(), ri = img.getBoundingClientRect(), rm = models.getBoundingClientRect(), first = img.querySelector('label').getBoundingClientRect();
                return { n: radios.length, inImg: radios.every(r => img.contains(r)), inModels: radios.some(r => models.contains(r)), modelRadiosOut: [...document.querySelectorAll('input[name="txa_model"]')].every(r => models.contains(r)),
                    kBefore: k.nextElementSibling === img, kText: k.textContent.trim(), kTop: Math.round(rk.top), iTop: Math.round(ri.top), firstTop: Math.round(first.top), kBottomVsFirst: Math.round(rk.bottom - first.top),
                    belowModels: ri.top >= rm.bottom - 1, sameRow: Math.abs(rk.top - ri.top) <= 4, colK: Math.round(rk.left), colI: Math.round(ri.left), colM: Math.round(rm.left),
                    summary: [...document.querySelectorAll('.h-txa-more > summary')].map(s => s.textContent.trim()), limitSel: !!document.querySelector('[data-txa-limit]') };
            });
            // 3. « [illisible] » sans fin
            const readOnce = async (mode, { stopAfterLines = 0 } = {}) => {
                oll.mode = mode; const n0 = oll.chats.length;
                await p.evaluate(() => { document.querySelector('[data-txa-out]').innerHTML = ''; document.querySelector('[data-txa-read]').click(); });
                const t0 = Date.now();
                if (stopAfterLines) {
                    await p.waitForFunction(n => (document.querySelector('.h-txa-live')?.textContent || '').split('\n').filter(Boolean).length >= n, stopAfterLines, { timeout: 20000 });
                    await p.waitForFunction(() => { const b = document.querySelector('[data-txa-stop]'); return b && !b.hidden && b.offsetParent; }, null, { timeout: 5000 });
                    await p.evaluate(() => document.querySelector('[data-txa-stop]').click());
                }
                await p.waitForFunction(() => (document.querySelector('[data-txa-t="deep"]') || document.querySelector('[data-txa-out] .ui-notice-error')) && !document.querySelector('[data-txa-read]').disabled, null, { timeout: 60000 });
                const r = await p.evaluate(() => ({ text: document.querySelector('[data-txa-t="deep"]')?.value ?? null, warn: document.querySelector('[data-txa-warn]')?.textContent.trim() || '',
                    err: document.querySelector('[data-txa-out] .ui-notice-error')?.textContent.trim() || '', progHidden: document.querySelector('[data-txa-prog]').hidden, stopHidden: document.querySelector('[data-txa-stop]').hidden }));
                r.ms = Date.now() - t0; r.chat = oll.chats[n0]; await sleep(300); r.aborted = !!r.chat?.aborted; return r;
            };
            out.ill = await readOnce('illisible');
            out.rep = await readOnce('repeat');
            out.slow = await readOnce('slow');
            out.silent = await readOnce('silent');
            out.stop = await readOnce('slow', { stopAfterLines: 5 });
            // 6. le serveur compatible OpenAI (Unsloth) : réglage, puis la même boucle
            fs.writeFileSync(path.join(dir, 'genealogie-ia-serveur.json'), JSON.stringify({ kind: 'unsloth', url: `http://127.0.0.1:${uport}` }));
            uns.mode = 'illisible';
            await openDeep();
            out.uSummary = await p.evaluate(() => [...document.querySelectorAll('.h-txa-more > summary')].map(s => s.textContent.trim()));
            await p.evaluate(() => { document.querySelector('[data-txa-out]').innerHTML = ''; document.querySelector('[data-txa-read]').click(); }); const t1 = Date.now();
            await p.waitForFunction(() => (document.querySelector('[data-txa-t="deep"]') || document.querySelector('[data-txa-out] .ui-notice-error')) && !document.querySelector('[data-txa-read]').disabled, null, { timeout: 60000 });
            out.u = await p.evaluate(() => ({ text: document.querySelector('[data-txa-t="deep"]')?.value ?? null, warn: document.querySelector('[data-txa-warn]')?.textContent.trim() || '', err: document.querySelector('[data-txa-out] .ui-notice-error')?.textContent.trim() || '' }));
            out.u.ms = Date.now() - t1; await sleep(300); out.u.chat = uns.chats[uns.chats.length - 1];
            uns.mode = 'repeat';
            out.u2 = await p.evaluate(async () => { const A = window.LCNDA_APP; const png = document.querySelector('dialog.h-tx-dlg [data-tx-img]').getAttribute('href');
                const b64 = await new Promise(ok => { const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); c.width = 600; c.height = 800; c.getContext('2d').drawImage(im, 0, 0, 600, 800); ok(c.toDataURL('image/png').split(',')[1]); }; im.src = png; });
                const s = await A.api('tx_deep_read', {}, { method: 'POST', body: { model: 'qwen3-vl:8b-instruct', language: 'fra', image_b64: b64, lines: 20, time_limit: 30 } });
                const id = (s.result || s).id; let j = null; for (let i = 0; i < 100; i++) { j = await A.api('tx_deep_job', { id }); if (j.state !== 'running') break; await new Promise(x => setTimeout(x, 150)); } return j; });
            await sleep(300); out.u2.chat = uns.chats[uns.chats.length - 1];
            out.errs = errs;
        } finally { await browser.close(); proc.kill(); fakeO.close(); fakeU.close(); fakeO.closeAllConnections?.(); fakeU.closeAllConnections?.(); fs.rmSync(tmp, { recursive: true, force: true }); }

        const L = out.layout;
        const G = GOOD.join('\n');
        checks.push(
            ['mise en page : les choix d’image dans la rangée « Image », à part de la liste des modèles', () => {
                assert.equal(L.n, 3); assert.equal(L.inImg, true); assert.equal(L.inModels, false); assert.equal(L.modelRadiosOut, true);
                assert.equal(L.kBefore, true); assert.match(L.kText, /Image/); }],
            ['mise en page : « Image » aligné en haut de sa rangée, sous la rangée « Modèle », mêmes colonnes', () => {
                assert.equal(L.sameRow, true, JSON.stringify(L)); assert.equal(L.belowModels, true, JSON.stringify(L)); assert.equal(L.colI, L.colM, JSON.stringify(L)); assert.ok(L.colK < L.colI);
                assert.ok(Math.abs(L.kBottomVsFirst) < 30 && L.kTop <= L.firstTop + 4, JSON.stringify(L)); }],
            ['« ⚙️ Avancé : autre modèle (…) » nomme le serveur choisi (Ollama, puis Unsloth) ; ⏱ le temps maximum se choisit', () => {
                assert.ok(L.summary.some(s => /Avancé : autre modèle \(Ollama\)/.test(s)), JSON.stringify(L.summary));
                assert.ok(out.uSummary.some(s => /Avancé : autre modèle \(Unsloth\)/.test(s)) && !out.uSummary.some(s => /Ollama/.test(s)), JSON.stringify(out.uSummary)); assert.equal(L.limitSel, true); }],
            ['Ollama : num_predict borné, repeat_penalty, repeat_last_n et temperature 0 envoyés', () => {
                const o = out.ill.chat.body.options; assert.equal(o.temperature, 0); assert.ok(o.num_predict > 0 && o.num_predict <= 4096, JSON.stringify(o));
                assert.ok(o.repeat_penalty >= 1.1 && o.repeat_penalty <= 1.15, JSON.stringify(o)); assert.ok(o.repeat_last_n >= 64, JSON.stringify(o)); }],
            ['« [illisible] » sans fin : arrêt rapide, flux coupé, bonnes lignes gardées, boucle retirée, l’avis « ligne 4 », plus de barre', () => {
                const r = out.ill; assert.equal(r.text, G); assert.ok(!/illisible/.test(r.text)); assert.ok(r.ms < 10000, r.ms + ' ms'); assert.equal(r.aborted, true);
                assert.match(r.warn, /L’IA s’est mise à répéter : lecture arrêtée à la ligne 4, le reste est à lire à la main/); assert.equal(r.progHidden, true); assert.equal(r.stopHidden, true); }],
            ['la même ligne sans fin : gardée une fois, arrêt à la ligne 5', () => {
                const r = out.rep; assert.equal(r.text, G + '\net de Marie Durand sa femme'); assert.ok(r.ms < 10000, r.ms + ' ms'); assert.equal(r.aborted, true);
                assert.match(r.warn, /répéter : lecture arrêtée à la ligne 5/); }],
            ['⏱ temps maximum : la lecture s’arrête, le texte déjà lu est gardé, l’avis le dit', () => {
                const r = out.slow; assert.ok(r.text && r.text.startsWith(G + '\nligne lue numéro 1'), JSON.stringify(r.text)); assert.ok(r.ms < (LIMIT + 8) * 1000, r.ms + ' ms'); assert.equal(r.aborted, true);
                assert.match(r.warn, /⏱ Temps maximum atteint \(0,2 min\) : lecture arrêtée à la ligne \d+, le reste est à lire à la main/); assert.equal(r.progHidden, true); }],
            ['⏱ un modèle muet : une erreur claire au temps maximum, la lecture finit (pas une barre sans fin)', () => {
                const r = out.silent; assert.equal(r.text, null); assert.match(r.err, /Temps maximum atteint \(0,2 min\) sans rien lire/); assert.ok(r.ms < (LIMIT + 15) * 1000, r.ms + ' ms'); assert.equal(r.progHidden, true); }],
            ['■ Arrêter pendant la lecture : le texte déjà lu est gardé, l’avis le dit', () => {
                const r = out.stop; assert.ok(r.text && r.text.startsWith(G + '\nligne lue numéro 1'), JSON.stringify(r.text)); assert.ok(r.text.split('\n').length >= 4);
                assert.match(r.warn, /■ Lecture arrêtée : le texte déjà lu est gardé/); assert.ok(r.ms < LIMIT * 1000, r.ms + ' ms : arrêté avant le temps maximum'); assert.equal(r.aborted, true); }],
            ['compatible OpenAI : max_tokens, frequency_penalty et temperature 0 envoyés ; la boucle « [illisible] » coupée de même', () => {
                const b = out.u.chat.body; assert.ok(b.max_tokens > 0 && b.max_tokens <= 4096, JSON.stringify(b)); assert.ok(b.frequency_penalty > 0 && b.frequency_penalty <= 1, JSON.stringify(b)); assert.equal(b.temperature, 0);
                assert.equal(b.repeat_penalty, undefined, 'pas de champ propre à Ollama');
                assert.equal(out.u.text, G); assert.match(out.u.warn, /répéter : lecture arrêtée à la ligne 4/); assert.ok(out.u.ms < 10000, out.u.ms + ' ms'); assert.equal(out.u.chat.aborted, true); }],
            ['compatible OpenAI, la même ligne sans fin (lignes connues : 20) : max_tokens d’après les lignes, job fini, warn « loop »', () => {
                const j = out.u2; assert.equal(j.state, 'done', JSON.stringify(j)); assert.equal(j.warn, 'loop'); assert.equal(j.line, 5); assert.equal(j.text, G + '\net de Marie Durand sa femme');
                assert.equal(j.limit, 30); assert.equal(j.chat.body.max_tokens, 20 * 40 * 1.5 + 256); }],
            ['aucune erreur JS', () => assert.deepEqual(out.errs, [])],
        );
    }
    let failed = 0;
    for (const [name, fn] of checks) { try { fn(); console.log('  ✓', name); } catch (e) { failed++; console.log('  ✗', name, '\n   ', e.message); } }
    console.log('  (non vérifié ici : un vrai modèle d’IA — ses boucles sont imitées)');
    console.log(failed ? `${failed} échec(s)` : `${checks.length} vérifications réussies`);
    process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
