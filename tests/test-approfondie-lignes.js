'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * ▤ La lecture approfondie, ligne par ligne (assets/js/app-lignes-alignement.js, heritage-transcribe.js linkLines, heritage-transcribe-acte.js) :
 *   node tests/test-approfondie-lignes.js            (TXL_SHOTS=dossier : captures d'écran)
 *  1. sans serveur : une image fabriquée de 10 lignes d'« écriture » (bandes d'encre de longueurs différentes, des accents
 *     au-dessus des lignes, une mention verticale dans la marge à droite) ; le découpage simple retrouve les 10 bandes et laisse
 *     la marge à part ; le texte de l'IA (une ligne coupée en deux, deux lignes collées, une mention en marge) est aligné :
 *     avec les lignes de Kraken (texte un peu faux, une bande illisible → ❔), puis sans Kraken (longueurs) ; une ligne inventée
 *     reste sans zone ; des lignes trop différentes sont marquées douteuses ;
 *  2. un vrai « php -S », un faux Ollama sur cet ordinateur qui rend ces lignes, et dans le navigateur : la fenêtre des deux
 *     lectures (🪄 corrections proposées sur le texte de l'IA, ↶ Annuler, la case ▤) → « Mettre dans le texte » → zones posées
 *     ligne par ligne d'après la lecture rapide (faux résultat de Kraken par bande), clic ligne ↔ zone, ↶ Annuler ;
 *     puis sans Kraken : « ▤ Relier les lignes à l'image » sur le texte déjà mis (découpage simple), ↶ Annuler ; 390 px.
 * Personnes fictives. Ce qui n'est pas vérifié ici : le vrai Kraken et le vrai Qwen3-VL (voir la fin du rapport du test).
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
const LG = require('../assets/js/app-lignes-alignement.js');

const appRoot = path.resolve(__dirname, '..');
const SHOTS = process.env.TXL_SHOTS || '';
let chromium = null;
try { ({ chromium } = require('playwright')); } catch (_) { try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); } catch (__) { chromium = null; } }

/* ─── ce qui est « écrit » sur l'image (personnes fictives) ─── */
const IMG = [
    'L’an mil huit cent douze, le trois novembre, par-devant nous,',
    'maire de la commune de Vallon, est comparu Étienne Garnier,',
    'menuisier, âgé de trente ans,',
    'lequel nous a présenté un enfant du sexe masculin, né hier,',
    'de lui déclarant et de Rose Bertin, son épouse,',
    'auquel il a donné le prénom de Gabriel.',
    'En présence de Paul Morel, sabotier, âgé de quarante ans,',
    'et de Simon Petit, cordonnier, âgé de trente-deux ans,',
    'qui ont signé avec nous après lecture faite.',
    'Garnier Morel Petit maire',
];
const MARGIN = 'Marié à Vallon le 4 mai 1840';
// ce que rend l'IA : la 3e ligne coupée en deux (2 lignes pour 1 bande), les 5e et 6e collées (1 ligne pour 2 bandes), « novembe » mal lu, la mention à la fin
const AI_LINES = [IMG[0].replace('novembre', 'novembe'), IMG[1], 'menuisier,', 'âgé de trente ans,', IMG[3], `${IMG[4]} ${IMG[5]}`, IMG[6], IMG[7], IMG[8], IMG[9], 'Mention en marge :', MARGIN];
const AI_TEXT = AI_LINES.join('\n');

/* ─── l'image : 1200 × 1000, papier clair, une bande d'encre par ligne (16 points par lettre), la mention à 90° à droite ─── */
const W = 1200, H = 1000, X0 = 60, CW = 16, Y0 = 70, STEP = 84, LH = 34;
const gray = new Uint8Array(W * H).fill(236);
let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const BOX = IMG.map((t, l) => {
    const y0 = Y0 + l * STEP; let x = X0;
    for (const ch of t) { if (ch !== ' ') for (let y = y0; y < y0 + LH; y++) for (let xx = x; xx < x + CW - 4; xx++) if (rnd() < .5) gray[y * W + xx] = 38; x += CW; }
    for (let k = 0; k < 40; k++) { const xx = X0 + Math.floor(rnd() * (x - X0)), yy = y0 - 14 + Math.floor(rnd() * 10); gray[yy * W + xx] = 38; } // accents et points au-dessus
    return [X0, y0, x, y0 + LH];
});
const MBOX = [1140, 120, 1172, 700];
for (let y = MBOX[1]; y < MBOX[3]; y++) for (let x = MBOX[0]; x < MBOX[2]; x++) if (((y / 18) | 0) % 4 !== 3 && rnd() < .45) gray[y * W + x] = 38;
const crc32 = buf => { let c, crc = 0xFFFFFFFF; for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xFF; for (let q = 0; q < 8; q++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xFFFFFFFF) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, 'latin1'), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, c]); };
function pngGray(w, h, px) { const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; const raw = Buffer.alloc((w * 3 + 1) * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const j = y * (w * 3 + 1) + 1 + x * 3; raw[j] = raw[j + 1] = px[y * w + x]; raw[j + 2] = Math.max(0, px[y * w + x] - 14); }
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]); }

/* ─── le faux Kraken : une ligne par bande, le texte un peu faux (u/n, c/e), la 8e bande illisible ; la mention de la marge à part ─── */
const misread = s => s.replace(/n/g, 'u').replace(/e(?=[rs])/g, 'c').replace(/é/g, 'e');
const KRAKEN = IMG.map((t, i) => ({ text: i === 7 ? 'xq wvv kkp zrt mmq' : misread(t), bbox: BOX[i], conf: i === 7 ? .3 : .8, words: [] }));
const KRAKEN_JOB = { id: 'x', state: 'done', elapsed: 3, model_file: 'mccatmus-fr-en.mlmodel', margin: 1, engine: 'kraken', mode: 'lines',
    lines: [...KRAKEN, { text: '———', bbox: null, conf: null, words: [], kind: 'sep' }, { text: 'Mention en marge :', bbox: null, conf: null, words: [], kind: 'margin-title' }, { text: 'Marie a Valon le 4 mai 1840', bbox: MBOX, conf: .82, words: [], kind: 'margin', rotated: 90 }] };

/* ─── 1. sans serveur ─── */
const seg = LG.segment(gray, W, H);
const lines = LG.textLines(AI_TEXT);
const withK = LG.link(lines, LG.bandsFromHtr(KRAKEN_JOB.lines));
const withoutK = LG.link(lines, { main: seg.bands });
const z = (r, i) => r.zones.filter(q => AI_TEXT.slice(q.s, q.e) && lines.main[i] && q.s >= lines.main[i].s && q.e <= lines.main[i].e);
const near = (a, b, tol) => Math.abs(a - b) <= tol;
// une ligne inventée par l'IA (rien sur l'image) et des bandes sans rapport
const extra = LG.textLines([IMG[0], IMG[1], 'texte qui n’est pas sur la page du tout, inventé', IMG[2], IMG[3]].join('\n'));
const withExtra = LG.link(extra, LG.bandsFromHtr(KRAKEN.slice(0, 4)));
const wrong = LG.link(LG.textLines('aaaa bbbb cccc dddd eeee ffff\nqqqqqqqqqqqqqqqqqqqq'), LG.bandsFromHtr([{ text: 'zut alors', bbox: [0, 0, 100, 20] }, { text: 'xyz', bbox: [0, 30, 900, 50] }]));
const tl = LG.textLines('ligne un\n\n  ligne deux  \n———\nMention en marge :\nla mention', { marginTitles: ['Mention en marge :'] });

const checks = [
    ['découpage simple : 10 bandes, à leur place (± 6 points), la mention verticale de la marge laissée à part', () => {
        assert.equal(seg.bands.length, 10, JSON.stringify(seg.bands.map(b => [b.x, b.y, b.w, b.h])));
        seg.bands.forEach((b, i) => { assert.ok(near(b.y, BOX[i][1], 6) && near(b.y + b.h, BOX[i][3], 6), `bande ${i} : ${b.y}–${b.y + b.h} ≠ ${BOX[i][1]}–${BOX[i][3]}`); assert.ok(near(b.x, BOX[i][0], 8) && near(b.x + b.w, BOX[i][2], 12), `bande ${i} : x ${b.x}–${b.x + b.w}`); });
        assert.ok(seg.bands.every(b => b.x + b.w < MBOX[0])); assert.ok(seg.side.some(s => s.x0 >= MBOX[0] - 4 && s.x1 <= MBOX[2] + 4), JSON.stringify(seg.side));
    }],
    ['lignes du texte : positions exactes, lignes vides et trait sautés, la mention après « Mention en marge : » à part', () => {
        assert.deepEqual(tl.main.map(l => l.text), ['ligne un', 'ligne deux']); assert.deepEqual(tl.margin.map(l => l.text), ['la mention']);
        const t = 'ligne un\n\n  ligne deux  \n———\nMention en marge :\nla mention'; tl.main.forEach(l => assert.equal(t.slice(l.s, l.e), l.text));
        assert.equal(lines.main.length, 10); assert.equal(lines.margin.length, 1);
    }],
    ['avec Kraken : une zone par ligne, dans l’ordre, chacune sur sa bande', () => {
        assert.equal(withK.mode, 'text');
        [[0, 0], [1, 1], [4, 3], [6, 6], [8, 8], [9, 9]].forEach(([i, b]) => { const q = z(withK, i); assert.equal(q.length, 1, `ligne ${i}`); assert.equal(q[0].y, BOX[b][1], `ligne ${i} → bande ${b}`); assert.equal(AI_TEXT.slice(q[0].s, q[0].e), lines.main[i].text); });
        const ys = withK.zones.filter(q => !q.margin).map(q => q.y); assert.deepEqual(ys, [...ys].sort((a, b) => a - b), 'les zones suivent l’ordre du texte');
    }],
    ['avec Kraken : 2 lignes de l’IA sur 1 bande (la bande partagée en largeur), 1 ligne de l’IA sur 2 bandes (coupée au bon mot)', () => {
        const a = z(withK, 2)[0], b = z(withK, 3)[0];
        assert.equal(a.y, BOX[2][1]); assert.equal(b.y, BOX[2][1]); assert.ok(a.x < b.x && near(a.x + a.w, b.x, 1) && near(b.x + b.w, BOX[2][2], 2), JSON.stringify([a, b]));
        const g = z(withK, 5); assert.equal(g.length, 2); assert.deepEqual(g.map(q => q.y), [BOX[4][1], BOX[5][1]]);
        assert.deepEqual(g.map(q => AI_TEXT.slice(q.s, q.e)), [IMG[4], IMG[5]]);
    }],
    ['avec Kraken : la bande illisible est reliée mais marquée douteuse (❔) ; les autres sont sûres', () => {
        const q = z(withK, 7); assert.equal(q.length, 1); assert.equal(q[0].doubt, true); assert.equal(q[0].y, BOX[7][1]);
        assert.equal(withK.zones.filter(x => x.doubt).length, 1, JSON.stringify(withK.zones.map(x => [x.y, x.sim])));
    }],
    ['avec Kraken : la mention en marge reliée à sa zone verticale, à part des lignes du texte', () => {
        const m = withK.zones.filter(q => q.margin); assert.equal(m.length, 1); assert.deepEqual([m[0].x, m[0].y], [MBOX[0], MBOX[1]]); assert.equal(AI_TEXT.slice(m[0].s, m[0].e), MARGIN);
        assert.deepEqual(withK.missing, []);
    }],
    ['sans Kraken (découpage simple, longueurs) : les mêmes zones, 1→2 et 2→1 compris, rien de douteux ; la mention sans zone', () => {
        assert.equal(withoutK.mode, 'length');
        const want = [[0, [0]], [1, [1]], [2, [2]], [3, [2]], [4, [3]], [5, [4, 5]], [6, [6]], [7, [7]], [8, [8]], [9, [9]]];
        want.forEach(([i, bs]) => { const q = z(withoutK, i); assert.deepEqual(q.map(x => x.y), bs.map(b => seg.bands[b].y), `ligne ${i}`); });
        assert.equal(withoutK.doubt, 0, JSON.stringify(withoutK.zones.map(x => [x.y, x.sim]))); assert.deepEqual(withoutK.missing.map(l => l.text), [MARGIN]);
    }],
    ['une ligne inventée par l’IA : pas de zone (comptée « sans zone »), les autres à leur place', () => {
        assert.deepEqual(withExtra.missing.map(l => l.text), ['texte qui n’est pas sur la page du tout, inventé']);
        assert.deepEqual(withExtra.zones.map(q => q.y), [BOX[0][1], BOX[1][1], BOX[2][1], BOX[3][1]]);
    }],
    ['des lignes sans rapport avec l’image : marquées douteuses, jamais présentées comme sûres', () => { assert.ok(wrong.zones.every(q => q.doubt) && wrong.zones.length + wrong.missing.length >= 2, JSON.stringify(wrong)); }],
    ['distance d’édition sans accents ni ponctuation', () => { assert.equal(LG.lev('chat', 'chats'), 1); assert.equal(LG.textSim('Étienne, Garnier', 'etienne garnier'), 1); assert.ok(LG.textSim('abc', 'xyz') === 0); }],
];

/* ─── 2. le serveur et le navigateur ─── */
async function browserPart(out) {
    const phpPath = findPhp([devBundledPhp()]);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-txl-'));
    const dir = path.join(tmp, 'data'); fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'media', 'acte-garnier.png'), pngGray(W, H, gray));
    const env = { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media'), GENEALOGY_SKIP_REFERENCE: '1', GENEALOGY_HTR_SIMULATE: '1', PHP_CLI_SERVER_WORKERS: '4' };
    const php = code => { const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], { cwd: appRoot, encoding: 'utf8', env }); if (r.status !== 0) throw new Error(r.stderr || r.stdout); return r.stdout; };
    php(String.raw`require 'lib/paths.php'; $p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; require 'tests/api_functions.php'; $pdo = db();
$id = (int) save_person($pdo, ['first_name' => 'Étienne', 'last_name' => 'Garnier', 'gender' => 'male'])['id']; $pdo->exec("UPDATE persons SET is_start=1 WHERE id=$id");
$pdo->exec("INSERT INTO media(title, media_type, filename) VALUES('Naissance Garnier', 'image', 'acte-garnier.png')"); echo 'ok';`);
    const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const ollama = { pulled: new Set(), chats: 0 };
    const fake = http.createServer((req, res) => {
        let body = ''; req.on('data', c => { body += c; }); req.on('end', async () => {
            if (req.url === '/api/version') { res.end(JSON.stringify({ version: '0.12.0' })); return; }
            if (req.url === '/api/tags') { res.end(JSON.stringify({ models: [...ollama.pulled].map(name => ({ name, size: 1 })) })); return; }
            if (req.url === '/api/pull') { const j = JSON.parse(body || '{}'); res.setHeader('Content-Type', 'application/x-ndjson'); res.write(JSON.stringify({ status: 'pulling', total: 10, completed: 5 }) + '\n'); ollama.pulled.add(j.model); res.end(JSON.stringify({ status: 'success' }) + '\n'); return; }
            if (req.url === '/api/chat') { ollama.chats++; res.setHeader('Content-Type', 'application/x-ndjson');
                for (const l of AI_LINES) { res.write(JSON.stringify({ message: { role: 'assistant', content: l + '\n' }, done: false }) + '\n'); await new Promise(r => setTimeout(r, 30)); }
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
        const p = await ctxB.newPage(); const errs = [], starts = [];
        p.on('pageerror', e => errs.push(e.message));
        p.on('request', r => { if (/action=htr_read_start/.test(r.url())) { try { starts.push(!!JSON.parse(r.postData() || '{}').image_b64); } catch (_) { starts.push(null); } } });
        const shot = async name => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: path.join(SHOTS, name) }); } };
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_EXT?.openActTranscriber && window.LCNDA_EXT?.txActe && window.LCNDA_LIGNES && window.LCNDA_HTRFIX, null, { timeout: 30000 });
        // la lecture approfondie installée (faux Ollama), la lecture rapide installée (simulée)
        await p.evaluate(async () => { const A = window.LCNDA_APP; const r = await A.api('tx_deep_pull', {}, { method: 'POST', body: { model: 'qwen3-vl:8b-instruct' } }); for (let i = 0; i < 60; i++) { const j = await A.api('tx_deep_job', { id: r.result.id }); if (j.state !== 'running') break; await new Promise(x => setTimeout(x, 150)); } await A.api('htr_install', {}, { method: 'POST', body: { python: 'embedded' } }); });
        for (let i = 0; i < 100; i++) { const s = await p.evaluate(() => window.LCNDA_APP.api('htr_setup_status')); if (s.ready && (s.models || []).some(m => m.present)) break; await sleep(200); }
        await p.route(/action=htr_read_job/, route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(KRAKEN_JOB) })); // le faux Kraken : une ligne par bande
        await p.evaluate(() => window.LCNDA_EXT.openActTranscriber({ mediaId: 1, filename: 'acte-garnier.png', title: 'Naissance de Gabriel Garnier' }));
        await p.waitForFunction(() => document.querySelector('dialog.h-tx-dlg [data-tx-img]')?.getAttribute('href'), null, { timeout: 15000 }); await sleep(500);
        out.btn = await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-cmd="lines"]')?.textContent || '');
        // la lecture approfondie, puis la fenêtre des deux lectures
        await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-cmd="deep"]').click());
        await p.waitForFunction(() => document.querySelector('[data-txa-read]'), null, { timeout: 15000 });
        await p.evaluate(() => document.querySelector('[data-txa-read]').click());
        await p.waitForFunction(() => document.querySelector('[data-txa-keep="deep"]') && document.querySelector('[data-txl-fix] [data-txl-fx]'), null, { timeout: 30000 }); await sleep(200);
        out.cmp = await p.evaluate(() => ({ deep: document.querySelector('[data-txa-t="deep"]').value, chips: [...document.querySelectorAll('[data-txl-fix] [data-txl-fx]')].map(b => b.textContent), link: document.querySelector('[data-txl-link]')?.checked, linkType: document.querySelector('[data-txl-link]')?.closest('label')?.className || '', settings: !!document.querySelector('[data-txl-fix] [data-fix-level]') }));
        await shot('txl-1-comparaison.png');
        // 🪄 « novembe » → « novembre », puis ↶ Annuler, puis encore
        const fixOnce = async () => { await p.evaluate(() => [...document.querySelectorAll('[data-txl-fix] [data-txl-fx]')].find(b => /novembe/.test(b.textContent)).click()); await p.waitForSelector('.ui-actmenu .ui-actmenu-i'); await p.evaluate(() => document.querySelector('.ui-actmenu .ui-actmenu-i').click()); await sleep(300); return p.evaluate(() => document.querySelector('[data-txa-t="deep"]').value.split('\n')[0]); };
        out.fixed = await fixOnce();
        await p.evaluate(() => document.querySelector('[data-txl-fix] [data-txl-undo]').click()); await sleep(300);
        out.unfixed = await p.evaluate(() => document.querySelector('[data-txa-t="deep"]').value.split('\n')[0]);
        out.fixed2 = await fixOnce();
        // ✓ Mettre dans le texte → zones posées ligne par ligne d'après la lecture rapide (le faux Kraken)
        await p.evaluate(() => document.querySelector('[data-txa-keep="deep"]').click());
        await p.waitForFunction(() => document.querySelector('dialog.h-tx-dlg')?.dataset.txLines, null, { timeout: 30000 }); await sleep(300);
        const zonesNow = () => p.evaluate(() => { const d = document.querySelector('dialog.h-tx-dlg'), a = d.querySelector('[data-tx-body]'); return { info: JSON.parse(d.dataset.txLines || '{}'), text: a.value, rects: [...d.querySelectorAll('[data-tx-zones] rect')].map(r => ({ id: r.dataset.txZone, x: +r.getAttribute('x'), y: +r.getAttribute('y'), w: +r.getAttribute('width'), fill: r.getAttribute('fill'), title: r.querySelector('title')?.textContent || '' })) }; });
        out.k = await zonesNow();
        out.kStarts = starts.length;
        out.fixbar = await p.evaluate(() => { const b = document.querySelector('dialog.h-tx-dlg [data-tx-fixbar]'); return b && !b.hidden ? b.textContent : ''; });
        out.toastK = await p.evaluate(() => [...document.querySelectorAll('.toast, [class*=toast]')].map(t => t.textContent).find(t => /Lignes reliées/.test(t)) || '');
        await shot('txl-2-zones-kraken.png');
        // clic ligne → zone : le curseur dans la 2e ligne allume sa zone ; clic zone → ligne : le texte de la zone est choisi
        out.lineToZone = await p.evaluate(t => { const d = document.querySelector('dialog.h-tx-dlg'), a = d.querySelector('[data-tx-body]'), at = a.value.indexOf(t) + 3; a.focus(); a.setSelectionRange(at, at); a.dispatchEvent(new MouseEvent('click', { bubbles: true })); const r = d.querySelector('[data-tx-zones] rect.is-sel'); return r ? +r.getAttribute('y') : -1; }, IMG[1].slice(0, 20));
        const r6 = await p.evaluate(y => { const r = [...document.querySelectorAll('dialog.h-tx-dlg [data-tx-zones] rect')].find(x => +x.getAttribute('y') === y); const b = r.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }, BOX[6][1]);
        await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-tool="pan"]')?.click());
        await p.mouse.click(r6.x, r6.y); await sleep(200);
        out.zoneToLine = await p.evaluate(() => { const a = document.querySelector('dialog.h-tx-dlg [data-tx-body]'); return a.value.slice(a.selectionStart, a.selectionEnd); });
        // ↶ Annuler (le message) : plus de zone
        await p.evaluate(() => [...document.querySelectorAll('.ui-toast')].filter(t => /Lignes reliées/.test(t.textContent)).at(-1)?.querySelector('.ui-toast-acts button')?.click()); await sleep(300);
        out.afterUndo = (await zonesNow()).rects.length;
        // « ▤ Relier les lignes à l'image » après coup, la lecture rapide déjà faite : pas de nouvelle lecture
        await p.evaluate(() => { delete document.querySelector('dialog.h-tx-dlg').dataset.txLines; document.querySelector('dialog.h-tx-dlg [data-tx-cmd="lines"]').click(); });
        await p.waitForFunction(() => document.querySelector('dialog.h-tx-dlg')?.dataset.txLines, null, { timeout: 30000 }); await sleep(200);
        out.again = await zonesNow(); out.againStarts = starts.length;
        // sans Kraken : la lecture rapide « pas installée », la lecture rapide oubliée (nouvelle ouverture) → découpage simple
        await p.unroute(/action=htr_read_job/);
        await p.route(/action=htr_setup_status/, route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ready: false, models: [] }) }));
        await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-cmd="save"]').click());
        await p.waitForFunction(() => /Enregistré/.test(document.querySelector('dialog.h-tx-dlg [data-tx-status]')?.title || ''), null, { timeout: 15000 });
        await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-cmd="close"]').click());
        await p.waitForFunction(() => !document.querySelector('dialog.h-tx-dlg'), null, { timeout: 10000 });
        await p.evaluate(() => window.LCNDA_EXT.openActTranscriber({ mediaId: 1, filename: 'acte-garnier.png', title: 'Naissance de Gabriel Garnier' }));
        await p.waitForFunction(() => document.querySelector('dialog.h-tx-dlg [data-tx-img]')?.getAttribute('href'), null, { timeout: 15000 }); await sleep(500);
        await p.evaluate(t => { const a = document.querySelector('dialog.h-tx-dlg [data-tx-body]'); if (!a.value.trim()) { a.value = t; a.dispatchEvent(new Event('input')); } }, AI_TEXT);
        const n0 = starts.length;
        await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-cmd="lines"]').click());
        await p.waitForFunction(() => document.querySelector('dialog.h-tx-dlg')?.dataset.txLines, null, { timeout: 30000 }); await sleep(300);
        out.simple = await zonesNow(); out.simpleStarts = starts.length - n0;
        await shot('txl-3-zones-simple.png');
        await p.evaluate(() => [...document.querySelectorAll('.ui-toast')].filter(t => /Lignes reliées/.test(t.textContent)).at(-1)?.querySelector('.ui-toast-acts button')?.click()); await sleep(300);
        out.simpleUndo = (await zonesNow()).rects.length;
        // 390 px
        await p.setViewportSize({ width: 390, height: 844 }); await sleep(400);
        out.narrow = await p.evaluate(() => { const b = document.querySelector('dialog.h-tx-dlg [data-tx-cmd="lines"]'); const r = b.getBoundingClientRect(); return document.documentElement.scrollWidth <= 392 && r.width > 0; });
        out.errs = errs;
    } finally { await browser.close(); proc.kill(); fake.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
}

(async () => {
    const out = {};
    if (chromium) {
        await browserPart(out);
        const ys = r => r.rects.map(x => x.y);
        checks.push(
            ['navigateur : « ▤ Relier les lignes à l’image » dans l’Atelier', () => assert.match(out.btn, /Relier les lignes/)],
            ['navigateur : fenêtre des deux lectures — 🪄 « novembe → novembre » proposé sur le texte de l’IA, réglages, case ▤ (case à cocher, cochée)', () => {
                assert.match(out.cmp.deep, /novembe,/); assert.ok(out.cmp.chips.some(c => /novembe → novembre/.test(c)), String(out.cmp.chips)); assert.equal(out.cmp.settings, true);
                assert.equal(out.cmp.link, true); assert.match(out.cmp.linkType, /checkbox-line/);
            }],
            ['navigateur : la correction appliquée en un clic, ↶ Annuler la défait', () => { assert.match(out.fixed, /novembre,/); assert.match(out.unfixed, /novembe,/); assert.match(out.fixed2, /novembre,/); }],
            ['navigateur : « Mettre dans le texte » → 12 zones (10 lignes, dont la ligne collée sur 2 bandes, et la mention), d’après la lecture rapide, une seule lecture lancée', () => {
                assert.equal(out.k.info.how, 'htr'); assert.equal(out.k.info.zones, 12, JSON.stringify(out.k.info)); assert.equal(out.kStarts, 1); assert.match(out.k.text, /novembre/);
            }],
            ['navigateur : zones dans l’ordre, sur leurs bandes, la bande illisible en gris avec ❔, la mention de la marge sur sa zone verticale', () => {
                const main = out.k.rects.filter(r => r.x < MBOX[0]);
                assert.deepEqual(main.map(r => r.y), [BOX[0], BOX[1], BOX[2], BOX[2], BOX[3], BOX[4], BOX[5], BOX[6], BOX[7], BOX[8], BOX[9]].map(b => b[1]));
                const grey = out.k.rects.filter(r => r.fill === '#8d8d96'); assert.equal(grey.length, 1); assert.equal(grey[0].y, BOX[7][1]); assert.equal(out.k.info.doubt, 1);
                assert.ok(out.k.rects.some(r => r.x === MBOX[0] && r.y === MBOX[1]));
                assert.match(out.toastK, /Lignes reliées à l’image/); assert.match(out.toastK, /à vérifier/);
            }],
            ['navigateur : corrections proposées aussi sur le texte gardé (barre 🪄 de l’Atelier)', () => assert.match(out.fixbar, /🪄/)],
            ['navigateur : clic ligne → sa zone s’allume ; clic zone → sa ligne est choisie', () => { assert.equal(out.lineToZone, BOX[1][1]); assert.equal(out.zoneToLine, IMG[6]); }],
            ['navigateur : ↶ Annuler retire les zones posées ; « ▤ Relier » après coup les remet sans relire la page', () => {
                assert.equal(out.afterUndo, 0); assert.equal(out.again.info.zones, 12); assert.equal(out.againStarts, out.kStarts); assert.deepEqual(ys(out.again), ys(out.k));
            }],
            ['navigateur : sans Kraken, découpage simple de l’image : 11 zones (la mention sans zone), dans l’ordre, aucune lecture lancée', () => {
                assert.equal(out.simple.info.how, 'image'); assert.equal(out.simpleStarts, 0);
                const main = out.simple.rects; assert.equal(main.length, 11, JSON.stringify(out.simple.info));
                const sorted = [...main].sort((a, b) => a.y - b.y || a.x - b.x); assert.deepEqual(main.map(r => r.y).sort((a, b) => a - b), sorted.map(r => r.y));
                assert.ok(main.every(r => r.x < MBOX[0])); assert.equal(out.simple.info.missing, 1);
            }],
            ['navigateur : sans Kraken, ↶ Annuler remet les zones d’avant', () => assert.equal(out.simpleUndo, 0)],
            ['navigateur : à 390 px, rien ne déborde', () => assert.equal(out.narrow, true)],
            ['navigateur : aucune erreur JS', () => assert.deepEqual(out.errs, [])],
        );
    }
    let failed = 0;
    for (const [name, fn] of checks) { try { fn(); console.log('  ✓', name); } catch (e) { failed++; console.log('  ✗', name, '\n   ', e.message); } }
    if (!chromium) console.log('  — navigateur : Playwright absent, partie sautée');
    console.log('  (non vérifié ici : le vrai Kraken et le vrai Qwen3-VL — leurs lignes sont imitées)');
    console.log(failed ? `${failed} échec(s)` : `${checks.length} vérifications réussies`);
    process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
