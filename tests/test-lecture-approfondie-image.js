'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🖼 La lecture approfondie : l'image envoyée au modèle (heritage-transcribe-acte.js autoEnhance / imageMode, heritage-transcribe.js areaB64) :
 *   node tests/test-lecture-approfondie-image.js
 *  1. un vrai « php -S », un faux Ollama sur cet ordinateur, une image d'acte fabriquée (1200 × 1600, peu contrastée) ;
 *  2. dans la fenêtre « 🔬 Lecture approfondie » : le choix de l'image sous le modèle (« Améliorer l'image automatiquement » par défaut,
 *     « Utiliser mon réglage Mieux voir », « Image d'origine »), retenu dans localStorage ; la case « Essayer les deux et comparer » ;
 *  3. l'image envoyée : améliorée (agrandie, autres pixels) en automatique, identique pixel pour pixel à l'origine en « Image d'origine » ;
 *     les deux lectures côte à côte ; la mention de l'image utilisée sous chaque texte ; le fichier de l'acte jamais modifié.
 * Personnes fictives. Non vérifié ici : le vrai modèle (son texte est imité).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const http = require('node:http');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
let chromium = null;
try { ({ chromium } = require('playwright')); } catch (_) { try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); } catch (__) { chromium = null; } }

const AI_LINES = ['L’an mil huit cent vingt, le cinq mars,', 'est comparu Louis Fabre, tisserand,', 'qui nous a présenté une fille nommée Jeanne.'];
/* ─── l'image : papier grisâtre peu contrasté (150–190), « écriture » gris moyen (105), sur toute la page (rien à recadrer) ─── */
const W = 1200, H = 1600;
const px = new Uint8Array(W * H);
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
for (let i = 0; i < px.length; i++) px[i] = 150 + Math.floor(rnd() * 40);
for (let l = 0; l < 30; l++) { const y0 = 30 + l * 52; for (let y = y0; y < y0 + 22; y++) for (let x = 20; x < W - 20; x++) if (rnd() < .35) px[y * W + x] = 105; }
const crc32 = buf => { let c, crc = 0xFFFFFFFF; for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xFF; for (let q = 0; q < 8; q++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xFFFFFFFF) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, 'latin1'), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, c]); };
function png(w, h, p) { const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; const raw = Buffer.alloc((w * 3 + 1) * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const j = y * (w * 3 + 1) + 1 + x * 3; raw[j] = raw[j + 1] = p[y * w + x]; raw[j + 2] = Math.max(0, p[y * w + x] - 12); }
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]); }
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

async function browserPart(out) {
    const phpPath = findPhp([devBundledPhp()]);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-txi-'));
    const dir = path.join(tmp, 'data'); fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
    const file = path.join(dir, 'media', 'acte-fabre.png'); fs.writeFileSync(file, png(W, H, px)); const sha0 = sha(file);
    const env = { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4' };
    const php = code => { const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], { cwd: appRoot, encoding: 'utf8', env }); if (r.status !== 0) throw new Error(r.stderr || r.stdout); return r.stdout; };
    php(String.raw`require 'lib/paths.php'; $p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; require 'tests/api_functions.php'; $pdo = db();
$id = (int) save_person($pdo, ['first_name' => 'Louis', 'last_name' => 'Fabre', 'gender' => 'male'])['id']; $pdo->exec("UPDATE persons SET is_start=1 WHERE id=$id");
$pdo->exec("INSERT INTO media(title, media_type, filename) VALUES('Naissance Fabre', 'image', 'acte-fabre.png')"); echo 'ok';`);
    const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const pulled = new Set();
    const fake = http.createServer((req, res) => {
        let body = ''; req.on('data', c => { body += c; }); req.on('end', async () => {
            if (req.url === '/api/version') { res.end(JSON.stringify({ version: '0.12.0' })); return; }
            if (req.url === '/api/tags') { res.end(JSON.stringify({ models: [...pulled].map(name => ({ name, size: 1 })) })); return; }
            if (req.url === '/api/pull') { const j = JSON.parse(body || '{}'); res.setHeader('Content-Type', 'application/x-ndjson'); pulled.add(j.model); res.end(JSON.stringify({ status: 'success' }) + '\n'); return; }
            if (req.url === '/api/chat') { res.setHeader('Content-Type', 'application/x-ndjson');
                for (const l of AI_LINES) { res.write(JSON.stringify({ message: { role: 'assistant', content: l + '\n' }, done: false }) + '\n'); await new Promise(r => setTimeout(r, 20)); }
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
        const p = await ctxB.newPage(); const errs = [], sent = [];
        p.on('pageerror', e => errs.push(e.message));
        p.on('request', r => { if (/action=tx_deep_read/.test(r.url())) { try { sent.push(JSON.parse(r.postData() || '{}').image_b64 || ''); } catch (_) { sent.push(''); } } });
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_EXT?.openActTranscriber && window.LCNDA_EXT?.txActe?.autoEnhance, null, { timeout: 30000 });
        await p.evaluate(() => { try { localStorage.removeItem('genealogie-htr-image-mode'); } catch (_) {} });
        await p.evaluate(async () => { const A = window.LCNDA_APP; const r = await A.api('tx_deep_pull', {}, { method: 'POST', body: { model: 'qwen3-vl:8b-instruct' } }); for (let i = 0; i < 60; i++) { const j = await A.api('tx_deep_job', { id: r.result.id }); if (j.state !== 'running') break; await new Promise(x => setTimeout(x, 150)); } });
        await p.evaluate(() => window.LCNDA_EXT.openActTranscriber({ mediaId: 1, filename: 'acte-fabre.png', title: 'Naissance de Jeanne Fabre' }));
        await p.waitForFunction(() => document.querySelector('dialog.h-tx-dlg [data-tx-img]')?.getAttribute('href'), null, { timeout: 15000 }); await sleep(400);
        const hrefBefore = await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-img]').getAttribute('href'));
        await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-cmd="deep"]').click());
        await p.waitForFunction(() => document.querySelector('[data-txa-read]'), null, { timeout: 15000 });
        out.choice = await p.evaluate(() => { const r = [...document.querySelectorAll('[data-txa-imgmode] input[name="txa_img"]')];
            const models = document.querySelector('.h-txa-models:not(.h-txa-imgmode)');
            return { values: r.map(x => x.value), checked: r.find(x => x.checked)?.value || '', labels: r.map(x => x.closest('label').textContent.replace(/\s+/g, ' ').trim()), both: !!document.querySelector('[data-txa-both]'),
                after: !!(models && models.compareDocumentPosition(document.querySelector('[data-txa-imgmode]')) & Node.DOCUMENT_POSITION_FOLLOWING) }; });
        const waitSent = async n => { for (let i = 0; i < 200 && sent.length < n; i++) await sleep(100); };
        const used = () => p.evaluate(() => [...document.querySelectorAll('[data-txa-imgused]')].map(x => ({ m: x.dataset.txaImgused, t: x.textContent.trim() })));
        // 1. automatique (par défaut)
        await p.evaluate(() => document.querySelector('[data-txa-read]').click()); await waitSent(1);
        await p.waitForFunction(() => document.querySelector('[data-txa-imgused]') && !document.querySelector('[data-txa-read]').disabled, null, { timeout: 30000 });
        out.autoUsed = await used(); out.autoText = await p.evaluate(() => document.querySelector('[data-txa-t="deep"]').value);
        // 2. « Image d'origine » : retenu, puis lu
        await p.evaluate(() => { const r = document.querySelector('input[name="txa_img"][value="orig"]'); r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); });
        out.stored = await p.evaluate(() => localStorage.getItem('genealogie-htr-image-mode'));
        await p.evaluate(() => { document.querySelector('[data-txa-out]').innerHTML = ''; document.querySelector('[data-txa-read]').click(); }); await waitSent(2);
        await p.waitForFunction(() => document.querySelector('[data-txa-imgused]') && !document.querySelector('[data-txa-read]').disabled, null, { timeout: 30000 });
        out.origUsed = await used();
        // 3. « Essayer les deux et comparer » (le choix « Image d'origine » → l'origine et l'améliorée automatiquement)
        await p.evaluate(() => { const c = document.querySelector('[data-txa-both]'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); document.querySelector('[data-txa-out]').innerHTML = ''; document.querySelector('[data-txa-read]').click(); });
        await waitSent(4);
        await p.waitForFunction(() => document.querySelector('[data-txa-t="deep0"]') && !document.querySelector('[data-txa-read]').disabled, null, { timeout: 30000 });
        out.bothUsed = await used(); out.bothTitle = await p.evaluate(() => document.querySelector('[data-txa-out] h4').textContent);
        out.bothTexts = await p.evaluate(() => [document.querySelector('[data-txa-t="deep0"]').value, document.querySelector('[data-txa-t="deep"]').value]);
        // les images envoyées, comparées pixel pour pixel à l'image de l'acte
        out.imgs = await p.evaluate(async ([list, href]) => {
            const load = src => new Promise((ok, ko) => { const im = new Image(); im.onload = () => ok(im); im.onerror = ko; im.src = src; });
            const pix = im => { const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; const g = c.getContext('2d'); g.drawImage(im, 0, 0); return g.getImageData(0, 0, c.width, c.height).data; };
            const o = await load(href), od = pix(o);
            return Promise.all(list.map(async b => { const im = await load('data:image/png;base64,' + b), d = pix(im); let same = d.length === od.length; if (same) for (let i = 0; i < d.length; i++) if (d[i] !== od[i]) { same = false; break; }
                return { w: im.naturalWidth, h: im.naturalHeight, same }; })).then(r => ({ orig: { w: o.naturalWidth, h: o.naturalHeight }, sent: r }));
        }, [sent, hrefBefore]);
        out.hrefAfter = await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-img]').getAttribute('href'));
        out.hrefBefore = hrefBefore;
        // la fenêtre rouverte : le choix retenu
        await p.evaluate(() => document.querySelector('dialog[open] [data-txa-deep]').closest('dialog').close()); await sleep(200);
        await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-cmd="deep"]').click());
        await p.waitForFunction(() => document.querySelector('[data-txa-read]'), null, { timeout: 15000 });
        out.reopen = await p.evaluate(() => document.querySelector('input[name="txa_img"]:checked')?.value);
        out.sha = [sha0, sha(file)]; out.files = fs.readdirSync(path.join(dir, 'media'));
        out.errs = errs;
    } finally { await browser.close(); proc.kill(); fake.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
}

(async () => {
    const checks = [];
    if (!chromium) { console.log('  — navigateur : Playwright absent, test sauté'); process.exit(0); }
    const out = {};
    await browserPart(out);
    const S = out.imgs.sent;
    checks.push(
        ['le choix de l’image est sous le modèle : automatique, « Mieux voir », origine ; la case « Essayer les deux et comparer »', () => {
            assert.deepEqual(out.choice.values, ['auto', 'mine', 'orig']); assert.match(out.choice.labels[0], /Améliorer l’image automatiquement/); assert.match(out.choice.labels[1], /Mieux voir/); assert.match(out.choice.labels[2], /Image d’origine/);
            assert.equal(out.choice.both, true); assert.equal(out.choice.after, true); }],
        ['par défaut : « Améliorer l’image automatiquement »', () => assert.equal(out.choice.checked, 'auto')],
        ['automatique : l’image envoyée diffère de l’origine (petite image agrandie, grand côté 2000)', () => {
            assert.equal(S[0].same, false); assert.equal(Math.max(S[0].w, S[0].h), 2000, JSON.stringify(S[0])); assert.equal(S[0].w, 1500); }],
        ['automatique : la mention sous le texte lu', () => { assert.deepEqual(out.autoUsed.map(u => u.m), ['auto']); assert.match(out.autoUsed[0].t, /améliorée automatiquement/); assert.match(out.autoText, /Louis Fabre/); }],
        ['« Image d’origine » : retenu dans localStorage, l’image envoyée identique pixel pour pixel, et la mention', () => {
            assert.equal(out.stored, 'orig'); assert.equal(S[1].same, true, JSON.stringify([S[1], out.imgs.orig])); assert.deepEqual(out.origUsed.map(u => u.m), ['orig']); assert.match(out.origUsed[0].t, /image d’origine/); }],
        ['« Essayer les deux et comparer » : deux lectures (l’origine puis l’améliorée), les deux textes côte à côte, chacun avec sa mention', () => {
            assert.equal(S.length, 4); assert.equal(S[2].same, true); assert.equal(S[3].same, false);
            assert.match(out.bothTitle, /Les deux images côte à côte/); assert.deepEqual(out.bothUsed.map(u => u.m), ['orig', 'auto']); assert.ok(out.bothTexts.every(t => /Jeanne/.test(t))); }],
        ['le choix est retrouvé en rouvrant la fenêtre', () => assert.equal(out.reopen, 'orig')],
        ['l’image de l’acte n’est jamais modifiée (fichier identique, aucun fichier ajouté, même image affichée)', () => {
            assert.equal(out.sha[0], out.sha[1]); assert.deepEqual(out.files, ['acte-fabre.png']); assert.equal(out.hrefAfter, out.hrefBefore); }],
        ['aucune erreur JS', () => assert.deepEqual(out.errs, [])],
    );
    let failed = 0;
    for (const [name, fn] of checks) { try { fn(); console.log('  ✓', name); } catch (e) { failed++; console.log('  ✗', name, '\n   ', e.message); } }
    console.log('  (non vérifié ici : le vrai modèle d’IA — son texte est imité)');
    console.log(failed ? `${failed} échec(s)` : `${checks.length} vérifications réussies`);
    process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
