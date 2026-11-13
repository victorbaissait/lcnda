'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * ✍️ Lecture d'écriture manuscrite (HTR) : assistant d'installation, modèles, « ✨ Lire l'acte »
 * (lib/htr_net.php, lib/htr_setup.php, scripts/htr_install.php, scripts/htr_job.php, scripts/htr_recognize.py,
 *  heritage-more.js « Reconnaissance d'écriture (HTR) », heritage-transcribe.js) :
 *     node tests/test-htr.js
 * Aucun vrai modèle n'est téléchargé : le serveur tourne avec GENEALOGY_HTR_SIMULATE=1 (moteur simulé).
 *  1. sûreté (PHP seul) : téléchargements seulement en HTTPS depuis les sources prévues (aussi après redirection),
 *     empreintes, chemins bornés au dossier des données, effacement qui ne suit jamais un lien, bon Python tout prêt ;
 *  2. le pont Python : lignes ALTO de Kraken (confiance des mots), mots et confiances depuis les lettres, ALTO piégé refusé ;
 *  3. un vrai « php -S » : erreurs lisibles (Python absent), demandes forgées refusées, installation en arrière-plan
 *     avec avancement, tout rangé dans les données, empreinte notée, vérification, lecture en arrière-plan ligne par
 *     ligne, identifiant forgé, arrêter, retirer un modèle + ↶ Annuler, désinstaller (en gardant ou non les modèles) ;
 *  4. navigateur (Playwright) : l'assistant, les messages selon l'ordinateur, « ✨ Lire l'acte » → relecture → texte + zones + repérage.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const phpPath = findPhp([devBundledPhp()]);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-htr-'));
const dir = path.join(tmp, 'data');
fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
const env = { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media'), GENEALOGY_SKIP_REFERENCE: '1', GENEALOGY_HTR_SIMULATE: '1', PHP_CLI_SERVER_WORKERS: '3' };
const php = code => { const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], { cwd: appRoot, encoding: 'utf8', env }); if (r.status !== 0) throw new Error(r.stderr || r.stdout); return r.stdout; };
const SHOTS = process.env.HTR_SHOTS || '';
let chromium = null;
try { ({ chromium } = require('playwright')); } catch (_) { try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); } catch (__) { chromium = null; } }

const crc32 = buf => { let c, crc = 0xFFFFFFFF; for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xFF; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xFFFFFFFF) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, 'latin1'), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, c]); };
function png(w, h) {
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8;
    const raw = Buffer.alloc((w + 1) * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw[y * (w + 1) + 1 + x] = (y % 40 < 6 && x % 9 < 6) ? 40 : 225;
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
fs.writeFileSync(path.join(dir, 'media', 'acte.png'), png(600, 400));
const outside = path.join(tmp, 'ailleurs'); fs.mkdirSync(outside); fs.writeFileSync(path.join(outside, 'precieux.txt'), 'à garder');

/* ─── 1. sûreté, sans serveur ─── */
const net1 = JSON.parse(php(String.raw`
require 'lib/htr_net.php';
$o = [];
$o['urls'] = array_map('htr_url_allowed', [
  'https://zenodo.org/api/records/13788177', 'https://github.com/astral-sh/x', 'https://objects.githubusercontent.com/a', 'https://api.github.com/repos/a',
  'http://zenodo.org/api/records/1', 'https://zenodo.org.evil.com/x', 'https://evil.com/zenodo.org', 'https://user:pw@zenodo.org/x', 'https://zenodo.org:8443/x',
  'file:///etc/passwd', 'https://127.0.0.1/x', "https://zenodo.org/\nx", 'ftp://zenodo.org/x', 'https://ZENODO.org/x', 'https://pypi.org/simple']);
$o['redir'] = htr_resolve_location('https://github.com/a/b/c', '/x/y');
$o['redirRel'] = htr_resolve_location('https://zenodo.org/a/b', 'c');
try { htr_http_get('https://evil.example/model.mlmodel'); $o['evil'] = 'téléchargé'; } catch (Throwable $e) { $o['evil'] = $e->getMessage(); }
try { htr_http_get('http://zenodo.org/x'); $o['http'] = 'téléchargé'; } catch (Throwable $e) { $o['http'] = $e->getMessage(); }
$got = ['sha256' => hash('sha256', 'abc'), 'md5' => md5('abc')];
$o['hash'] = [htr_hash_matches($got, 'md5:' . md5('abc')), htr_hash_matches($got, 'sha256:' . hash('sha256', 'abc')), htr_hash_matches($got, hash('sha256', 'abc')),
  htr_hash_matches($got, 'md5:' . md5('abd')), htr_hash_matches($got, ''), htr_hash_matches($got, 'sha1:' . sha1('abc'))];
$base = getenv('T') . '/data/htrtest'; @mkdir($base . '/models', 0775, true); @mkdir(getenv('T') . '/data/htrtest2', 0775, true);
@symlink(getenv('T') . '/ailleurs', $base . '/models/lien');
$o['inside'] = [htr_inside($base, $base . '/models/a.mlmodel'), htr_inside($base, $base . '/models/../../x'), htr_inside($base, $base . '/models/lien/precieux.txt'),
  htr_inside($base, $base . '/models/lien'), htr_inside($base, getenv('T') . '/data/htrtest2/x'), htr_inside($base, $base), htr_inside($base, "$base/models/a\0b")];
@mkdir($base . '/venv/lib', 0775, true); file_put_contents($base . '/venv/lib/a.py', str_repeat('x', 100)); @symlink(getenv('T') . '/ailleurs', $base . '/venv/lib/vers-ailleurs');
$o['freed'] = htr_rmtree($base . '/venv', $base);
$o['venvGone'] = !is_dir($base . '/venv');
try { htr_rmtree(getenv('T') . '/ailleurs', $base); $o['out'] = 'effacé'; } catch (Throwable $e) { $o['out'] = $e->getMessage(); }
try { htr_rmtree($base, $base); $o['self'] = 'effacé'; } catch (Throwable $e) { $o['self'] = $e->getMessage(); }
$o['names'] = array_map('htr_model_name_ok', ['mccatmus-fr-en.mlmodel', '../x.mlmodel', 'x.mlmodel.php', '.hidden.mlmodel', 'a b.mlmodel', 'x/y.mlmodel', 'ok_1.2.mlmodel']);
$o['triples'] = [htr_python_triple('Darwin', 'arm64'), htr_python_triple('Darwin', 'x86_64'), htr_python_triple('Windows', 'AMD64'), htr_python_triple('Linux', 'x86_64'), htr_python_triple('Linux', 'aarch64'), htr_python_triple('Windows', 'ARM64'), htr_python_triple('FreeBSD', 'amd64')];
$assets = [['name' => 'cpython-3.12.7+20241016-x86_64-unknown-linux-gnu-install_only.tar.gz'], ['name' => 'cpython-3.11.10+20241016-x86_64-unknown-linux-gnu-debug-full.tar.zst'],
  ['name' => 'cpython-3.11.10+20241016-x86_64-unknown-linux-gnu-install_only.tar.gz', 'digest' => 'sha256:aa'], ['name' => 'cpython-3.11.10+20241016-x86_64-pc-windows-msvc-shared-install_only.tar.gz']];
$o['asset'] = [htr_python_asset($assets, 'x86_64-unknown-linux-gnu')['name'] ?? null, htr_python_asset($assets, 'x86_64-pc-windows-msvc')['name'] ?? null, htr_python_asset($assets, 'aarch64-apple-darwin')];
echo json_encode($o, JSON_UNESCAPED_UNICODE);`.replace(/getenv\('T'\)/g, JSON.stringify(tmp).replace(/"/g, "'"))));
const catalog = JSON.parse(fs.readFileSync(path.join(appRoot, 'config/htr-model-files.json'), 'utf8'));

/* ─── 2. le pont Python (sans Kraken) ─── */
let py = null;
const pyBin = ['python3', 'python'].find(b => spawnSync(b, ['--version']).status === 0);
if (pyBin) {
    const script = String.raw`
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location("bridge", sys.argv[1]); m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
alto = '<?xml version="1.0"?><alto xmlns="http://www.loc.gov/standards/alto/ns-v4#"><Layout><Page><PrintSpace><TextBlock>' \
  '<TextLine HPOS="10" VPOS="20" WIDTH="300" HEIGHT="40"><String CONTENT="Baptême" WC="0.97" HPOS="10" VPOS="20" WIDTH="90" HEIGHT="40"/><SP/><String CONTENT="Jean" WC="0.41" HPOS="110" VPOS="20" WIDTH="60" HEIGHT="40"/></TextLine>' \
  '<TextLine HPOS="10" VPOS="70" WIDTH="300" HEIGHT="40"><String CONTENT="MARTIN" HPOS="10" VPOS="70" WIDTH="90" HEIGHT="40"/></TextLine></TextBlock></PrintSpace></Page></Layout></alto>'
out = {"alto": m.parse_alto(alto)}
try:
    m.parse_alto('<?xml version="1.0"?><!DOCTYPE a [<!ENTITY x "y">]><alto>&x;</alto>'); out["evil"] = "lu"
except ValueError as e:
    out["evil"] = str(e)
out["words"] = m.words_from_chars("le vingt", [0.9, 0.8, 0.5, 0.99, 0.6, 0.95, 0.9, 0.9], [[[0,0],[5,10]], [[5,0],[9,10]], [[9,0],[12,10]], [[12,0],[18,10]], [[18,0],[22,10]], [[22,0],[27,10]], [[27,0],[30,10]], [[30,0],[36,10]]])
out["check"] = m.check(None)
print(json.dumps(out, ensure_ascii=False))`;
    const r = spawnSync(pyBin, ['-I', '-c', script, path.join(appRoot, 'scripts/htr_recognize.py')], { encoding: 'utf8' });
    py = r.status === 0 ? JSON.parse(r.stdout) : { error: r.stderr };
}

/* ─── 3. le serveur ─── */
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const walk = d => fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() && !e.isSymbolicLink() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]) : [];
const appSnapshot = () => ['models', '.venv-htr', 'scripts', 'config'].flatMap(s => walk(path.join(appRoot, s))).sort().join('\n');

(async () => {
    php(String.raw`require 'lib/paths.php'; $p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
        $p->exec("INSERT INTO persons(first_name,last_name,gender,is_start) VALUES('Pierre','Martin','male',1)");
        $p->exec("INSERT INTO media(title,media_type,filename) VALUES('Acte','image','acte.png'),('Son','audio','x.mp3')");`);
    const before = appSnapshot();
    const port = await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env, stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    const out = {};
    try {
        for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
        let cookie = '';
        const html = await (await fetch(base).then(r => { cookie = (r.headers.get('set-cookie') || '').split(';')[0]; return r; })).text();
        const csrf = JSON.parse(html.match(/window\.INSTALL_CSRF = ("[^"]*")/)[1]);
        const post = async (action, body, token = csrf) => { const r = await fetch(`${base}api.php?action=${action}`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': token }, body: JSON.stringify({ ...body, csrf: token }) }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
        const get = async (action, q = '') => { const r = await fetch(`${base}api.php?action=${action}${q ? '&' + q : ''}`, { headers: { Cookie: cookie } }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
        const status = async () => (await get('htr_setup_status')).body;
        const waitInstall = async () => { for (let i = 0; i < 150; i++) { const s = await status(); if (s.install?.state !== 'running') return s; await sleep(200); } return status(); };
        const htrDir = path.join(dir, 'htr');

        out.s0 = await status();
        out.readBefore = await post('htr_read_start', { media_id: 1 });
        out.noCsrf = await post('htr_install', {}, 'faux');
        out.badOnly = await post('htr_install', { only: 'rm -rf /' });
        out.badModel = await post('htr_install', { only: 'model:../../etc/passwd.mlmodel' });
        out.manualModel = await post('htr_install', { only: 'model:greek-historical.mlmodel' });
        // Python introuvable : message et code lisibles
        out.startFail = await post('htr_install', { simulate_fail: 'no_python' });
        out.fail = await waitInstall();
        // l'installation complète, avec son avancement
        out.start = await post('htr_install', { python: 'embedded' });
        out.twice = await post('htr_install', {});
        const seen = new Set(); let s;
        for (let i = 0; i < 150; i++) { s = await status(); if (s.install?.state === 'running') seen.add(`${s.install.phase}:${s.install.pct > 0}`); else break; await sleep(60); }
        out.seen = [...seen]; out.s1 = await waitInstall();
        out.files = walk(htrDir).map(f => path.relative(dir, f));
        out.appUnchanged = appSnapshot() === before;
        const man = JSON.parse(fs.readFileSync(path.join(htrDir, 'models/manifest.json'), 'utf8'));
        const crypto = require('node:crypto');
        out.shaOk = man['mccatmus-fr-en.mlmodel'].sha256 === crypto.createHash('sha256').update(fs.readFileSync(path.join(htrDir, 'models/mccatmus-fr-en.mlmodel'))).digest('hex');
        // un deuxième modèle, en un clic
        await post('htr_install', { only: 'model:catmus-medieval.mlmodel' }); out.s2 = await waitInstall();

        // ✨ lire l'acte en arrière-plan
        out.readAudio = await post('htr_read_start', { media_id: 2 });
        out.readNoMedia = await post('htr_read_start', { media_id: 999 });
        out.readBadModel = await post('htr_read_start', { media_id: 1, model_file: '../../etc/passwd' });
        out.readBadB64 = await post('htr_read_start', { media_id: 1, image_b64: Buffer.from('<?php system($_GET[1]); ?>').toString('base64') });
        const jobsAfterBad = walk(path.join(dir, 'htr-jobs')).length;
        out.read = await post('htr_read_start', { media_id: 1, model_file: 'catmus-medieval.mlmodel' });
        let j; for (let i = 0; i < 80; i++) { j = (await get('htr_read_job', 'id=' + out.read.body.result?.id)).body; if (j.state !== 'running') break; await sleep(100); }
        out.job = j;
        out.jobLeft = walk(path.join(dir, 'htr-jobs')).filter(f => /page\.(png|jpg)$/.test(f)).length;
        out.jobsAfterBad = jobsAfterBad;
        out.forged = [await get('htr_read_job', 'id=../../genealogy'), await get('htr_read_job', 'id=' + 'a'.repeat(24))];
        // une zone (image découpée) puis ■ Arrêter
        const zone = await post('htr_read_start', { media_id: 1, image_b64: png(200, 80).toString('base64') });
        out.cancel = await post('htr_read_cancel', { id: zone.body.result?.id });
        for (let i = 0; i < 40; i++) { const c = (await get('htr_read_job', 'id=' + zone.body.result?.id)).body; out.cancelled = c.state; if (c.state !== 'running') break; await sleep(100); }

        // retirer un modèle puis ↶ Annuler ; nom forgé
        out.rm = await post('htr_model_remove', { file: 'catmus-medieval.mlmodel' });
        out.rmPresent = (await status()).models.find(m => m.file === 'catmus-medieval.mlmodel').present;
        out.restore = await post('htr_model_restore', { file: 'catmus-medieval.mlmodel' });
        out.restored = (await status()).models.find(m => m.file === 'catmus-medieval.mlmodel').present;
        out.rmForged = await post('htr_model_remove', { file: '../../genealogy.sqlite' });
        out.dbStill = fs.existsSync(path.join(dir, 'genealogy.sqlite'));

        /* ─── 4. le navigateur ─── */
        if (chromium) {
            const browser = await chromium.launch();
            try {
                const shoot = async (p, name) => { if (SHOTS) await p.screenshot({ path: path.join(SHOTS, name), fullPage: false }); };
                for (const [w, dark] of [[1440, false], [390, false], [1440, true]]) {
                    const ctx = await browser.newContext({ viewport: { width: w, height: w < 500 ? 844 : 900 }, colorScheme: dark ? 'dark' : 'light' });
                    const p = await ctx.newPage(); const errs = [];
                    p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
                    await p.goto(base); await p.waitForFunction(() => window.LCNDA_EXT?.openActTranscriber && window.LCNDA_APP?.state?.csrf, null, { timeout: 30000 });
                    if (dark) await p.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
                    await p.evaluate(async () => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'htr'; await A.setModule('maintenance'); });
                    await p.waitForSelector('.h-htr-page'); await p.waitForTimeout(300);
                    const wiz = await p.evaluate(() => ({ steps: document.querySelectorAll('.h-htr-wiz li').length, done: document.querySelectorAll('.h-htr-wiz li.is-done').length, ready: document.querySelector('.h-htr-ready')?.innerText || '',
                        models: [...document.querySelectorAll('#htr-step-2 > .h-htr-models-list .h-htr-model')].map(li => li.innerText), scroll: document.documentElement.scrollWidth,
                        help: ['mac', 'windows', 'linux'].map(o => window.LCNDA_EXT.htrErrorHelp('no_python', o)) }));
                    await shoot(p, `test-wiz-${w}${dark ? '-dark' : ''}.png`);
                    await p.evaluate(() => window.LCNDA_EXT.openActTranscriber({ mediaId: 1, filename: 'acte.png', title: 'Acte' }));
                    await p.waitForSelector('.h-tx-dlg [data-tx-cmd=htr]'); await p.waitForTimeout(800);
                    await p.click('.h-tx-dlg [data-tx-cmd=htr]');
                    const busy = await p.waitForSelector('[data-tx-htrrun]:not([hidden])', { timeout: 3000 }).then(() => true).catch(() => false);
                    await p.waitForSelector('.h-htr-rev', { timeout: 20000 }); await p.waitForTimeout(200);
                    const rev = await p.evaluate(() => ({ lines: document.querySelectorAll('.h-htr-rev > li').length, unsure: document.querySelectorAll('.h-htr-rev mark.h-htr-unsure').length, crops: document.querySelectorAll('.h-htr-rev img.h-htr-crop').length }));
                    await shoot(p, `test-review-${w}${dark ? '-dark' : ''}.png`);
                    await p.click('.h-htr-rev mark.h-htr-unsure'); await p.keyboard.type('cent'); await p.keyboard.press('Enter');
                    const focusMoved = await p.evaluate(() => document.activeElement?.closest('.h-htr-rev > li')?.dataset.i);
                    await p.evaluate(() => { const li = document.querySelectorAll('.h-htr-rev > li')[3]; li.querySelector('[data-htr-keep]').click(); });
                    await p.click('dialog.h-modal .modal-actions [type=submit]');
                    await p.waitForFunction(() => document.querySelectorAll('[data-tx-zones] rect').length > 0, null, { timeout: 5000 }).catch(() => {});
                    await p.waitForTimeout(600);
                    const after = await p.evaluate(() => ({ text: document.querySelector('[data-tx-body]').value, zones: document.querySelectorAll('[data-tx-zones] rect').length, found: document.querySelector('[data-tx-found]').innerText }));
                    await shoot(p, `test-after-${w}${dark ? '-dark' : ''}.png`);
                    out[`b${w}${dark ? 'd' : ''}`] = { wiz, busy, rev, focusMoved, after, errs };
                    await ctx.close();
                }
            } finally { await browser.close(); }
        }

        // désinstaller : d'abord en gardant les modèles, puis tout
        out.un1 = await post('htr_uninstall', { keep_models: 1 });
        out.afterUn1 = { venv: fs.existsSync(path.join(htrDir, 'venv')), models: fs.existsSync(path.join(htrDir, 'models/mccatmus-fr-en.mlmodel')), st: (await status()).kraken };
        out.un2 = await post('htr_uninstall', {});
        out.afterUn2 = walk(path.join(htrDir, 'models')).filter(f => f.endsWith('.mlmodel')).length;
        out.outsideKept = fs.existsSync(path.join(outside, 'precieux.txt'));
    } finally { proc.kill(); }

    const err = r => String(r.body?.error || '');
    const checks = [
        ['téléchargements : seulement HTTPS et les sources prévues (Zenodo, GitHub), pas de faux domaine, de port, d’identifiants, de saut de ligne', () =>
            assert.deepEqual(net1.urls, [true, true, true, true, false, false, false, false, false, false, false, false, false, true, false])],
        ['redirections rendues absolues (puis vérifiées à leur tour) ; une source imprévue ou HTTP est refusée avant toute connexion', () => {
            assert.equal(net1.redir, 'https://github.com/x/y'); assert.equal(net1.redirRel, 'https://zenodo.org/a/c');
            assert.match(net1.evil, /refusée/); assert.match(net1.http, /refusée/);
        }],
        ['empreintes : MD5 de Zenodo ou SHA-256 ; une autre, vide ou SHA-1 → refusée', () => assert.deepEqual(net1.hash, [true, true, true, false, false, false])],
        ['chemins : dans le dossier prévu seulement (pas de « .. », de lien qui sort, de dossier voisin au nom proche, d’octet nul)', () => assert.deepEqual(net1.inside, [true, false, false, false, false, false, false])],
        ['effacer : un lien vers ailleurs n’est jamais suivi ; rien hors du dossier ; jamais le dossier lui-même', () => {
            assert.equal(net1.freed, 100); assert.equal(net1.venvGone, true); assert.ok(fs.existsSync(path.join(outside, 'precieux.txt')));
            assert.match(net1.out, /hors/); assert.match(net1.self, /hors/);
        }],
        ['noms de modèles : un simple nom .mlmodel', () => assert.deepEqual(net1.names, [true, false, false, false, false, false, true])],
        ['Python tout prêt : le bon fichier pour Mac (Apple et Intel), Windows, Linux ; rien pour un ordinateur non prévu', () => {
            assert.deepEqual(net1.triples, ['aarch64-apple-darwin', 'x86_64-apple-darwin', 'x86_64-pc-windows-msvc', 'x86_64-unknown-linux-gnu', 'aarch64-unknown-linux-gnu', null, null]);
            assert.deepEqual(net1.asset, ['cpython-3.11.10+20241016-x86_64-unknown-linux-gnu-install_only.tar.gz', 'cpython-3.11.10+20241016-x86_64-pc-windows-msvc-shared-install_only.tar.gz', null]);
        }],
        ['catalogue : les modèles téléchargeables viennent de Zenodo, avec licence libre, DOI et numéro de fiche', () => {
            const z = catalog.filter(f => f.source === 'zenodo'); assert.ok(z.length >= 2);
            z.forEach(f => { assert.match(f.record, /^\d+$/); assert.equal(f.doi, `10.5281/zenodo.${f.record}`); assert.match(f.license, /^cc-by/); assert.ok(f.period && f.languages && f.best_for); });
            assert.ok(z.some(f => f.recommended && f.uses.includes('fr-17-19'))); assert.ok(z.some(f => f.uses.includes('latin')));
            const src = fs.readFileSync(path.join(appRoot, 'scripts/htr_install.php'), 'utf8');
            assert.doesNotMatch(src, /kraken'?, 'get'/); assert.match(src, /htr_hash_matches/); assert.match(src, /HTR_FREE_LICENSES/);
        }],
        ['état de départ : rien d’installé, le modèle conseillé est McCATMuS, la place libre est connue', () => {
            assert.equal(out.s0.ready, false); assert.equal(out.s0.kraken, false); assert.equal(out.s0.models.find(m => m.recommended).file, 'mccatmus-fr-en.mlmodel'); assert.ok(out.s0.free_bytes > 0);
            assert.match(err(out.readBefore), /pas encore installée.*Réglages/);
        }],
        ['demandes forgées refusées : sans jeton, « quoi » inconnu, modèle hors catalogue ou sans source officielle', () => {
            assert.ok(out.noCsrf.status >= 400); assert.match(err(out.badOnly), /inconnue/); assert.match(err(out.badModel), /à la main/); assert.match(err(out.manualModel), /à la main/);
        }],
        ['Python introuvable : erreur avec un code, et l’aide par ordinateur (Mac, Windows, Linux)', () => {
            assert.equal(out.fail.install.state, 'error'); assert.equal(out.fail.install.code, 'no_python'); assert.match(out.fail.install.step, /Python/);
            if (out.b1440) { const [mac, win, lin] = out.b1440.wiz.help; assert.match(mac, /macos/); assert.match(win, /Add python\.exe to PATH/); assert.match(lin, /apt install python3\.11/); }
        }],
        ['installation : en arrière-plan, une seule à la fois, avec un pourcentage par étape (moteur, modèle, vérification)', () => {
            assert.equal(out.start.body.result.started, true); assert.equal(out.twice.body.result.already, true);
            assert.ok(out.seen.includes('engine:true') && out.seen.includes('model:true'), out.seen.join());
            assert.equal(out.s1.install.state, 'done'); assert.equal(out.s1.ready, true); assert.equal(out.s1.verified.ok, true); assert.equal(out.s1.python_source, 'embedded');
            assert.match(out.s1.install.step, /Prêt : lecture d’écriture manuscrite/);
        }],
        ['tout est rangé dans le dossier des données (htr/), rien dans l’application ; empreinte et licence notées', () => {
            assert.ok(out.files.every(f => f.startsWith('htr' + path.sep)), out.files.join()); assert.equal(out.appUnchanged, true); assert.equal(out.shaOk, true);
            const m = out.s1.models.find(x => x.file === 'mccatmus-fr-en.mlmodel'); assert.equal(m.present, true); assert.match(m.verified, /md5/); assert.equal(m.license, 'cc-by-4.0');
        }],
        ['un deuxième modèle en un clic', () => assert.equal(out.s2.models.find(m => m.file === 'catmus-medieval.mlmodel').present, true)],
        ['lecture : seulement une image, un média qui existe, un modèle connu, une image vraie ; rien ne reste après un refus', () => {
            assert.match(err(out.readAudio), /images/); assert.match(err(out.readNoMedia), /introuvable/i); assert.match(err(out.readBadModel), /inconnu/); assert.match(err(out.readBadB64), /illisible/); assert.equal(out.jobsAfterBad, 0);
        }],
        ['lecture en arrière-plan : lignes avec boîte, confiance des mots, modèle choisi ; l’image copiée est effacée', () => {
            assert.equal(out.job.state, 'done'); assert.equal(out.job.lines.length, 4); assert.equal(out.job.model_file, 'catmus-medieval.mlmodel');
            assert.ok(out.job.lines.every(l => l.bbox.length === 4 && l.words.length)); assert.ok(out.job.lines.flatMap(l => l.words).some(w => w.c < .75)); assert.equal(out.jobLeft, 0);
        }],
        ['identifiant de lecture forgé refusé ; ■ Arrêter arrête', () => { out.forged.forEach(r => { assert.equal(r.status, 422); assert.match(err(r), /inconnue/); }); assert.equal(out.cancel.body.result.cancelled, true); assert.equal(out.cancelled, 'cancelled'); }],
        ['retirer un modèle puis ↶ Annuler ; nom forgé refusé, la base est intacte', () => {
            assert.equal(out.rmPresent, false); assert.equal(out.restored, true); assert.match(err(out.rmForged), /refusé|pas installé/); assert.equal(out.dbStill, true);
        }],
        ['désinstaller : le moteur part, les modèles restent si on le demande ; puis tout ; rien d’autre n’est touché', () => {
            assert.equal(out.afterUn1.venv, false); assert.equal(out.afterUn1.models, true); assert.equal(out.afterUn1.st, false); assert.equal(out.un1.body.result.kept_models, true);
            assert.equal(out.afterUn2, 0); assert.equal(out.outsideKept, true);
        }],
    ];
    if (py) checks.push(
        ['pont Python : ALTO de Kraken → lignes, boîtes, confiance des mots ; ALTO avec DOCTYPE refusé', () => {
            assert.ok(!py.error, py.error); assert.equal(py.alto.length, 2); assert.equal(py.alto[0].text, 'Baptême Jean'); assert.deepEqual(py.alto[0].bbox, [10, 20, 310, 60]);
            assert.equal(py.alto[0].words[1].c, 0.41); assert.equal(py.alto[1].words[0].c, null); assert.match(py.evil, /DOCTYPE/);
        }],
        ['pont Python : mots tirés des lettres (confiance = la plus basse, boîte réunie) ; vérification sans Kraken → message clair', () => {
            assert.deepEqual(py.words.map(w => [w.t, w.c]), [['le', 0.8], ['vingt', 0.6]]); assert.deepEqual(py.words[1].bbox, [12, 0, 36, 10]);
            assert.equal(py.check.ok, false); assert.match(py.check.error, /Kraken/);
        }]);
    for (const k of ['b1440', 'b390', 'b1440d']) if (out[k]) checks.push(
        [`navigateur ${k} : assistant en 3 étapes faites, « ✓ Prêt », modèles avec licence et période`, () => {
            const b = out[k]; assert.equal(b.wiz.steps, 3); assert.equal(b.wiz.done, 3); assert.match(b.wiz.ready, /Prêt : lecture d’écriture manuscrite/);
            assert.ok(b.wiz.models.some(t => /CC BY 4\.0/.test(t) && /XVIᵉ – XXIᵉ/.test(t))); assert.ok(b.wiz.scroll <= (k === 'b390' ? 390 : 1440) + 1, `défile en largeur : ${b.wiz.scroll}`);
        }],
        [`navigateur ${k} : « ✨ Lire l’acte » en arrière-plan → relecture ligne par ligne (image, mots peu sûrs) → texte, zones, repérage`, () => {
            const b = out[k]; assert.equal(b.busy, true); assert.deepEqual(b.rev, { lines: 4, unsure: 4, crops: 4 }); assert.equal(b.focusMoved, '1');
            assert.match(b.after.text, /mil sept cent/); assert.doesNotMatch(b.after.text, /Marie Durand/); assert.equal(b.after.zones, 3); assert.match(b.after.found, /MARTIN/);
        }],
        [`navigateur ${k} : aucune erreur`, () => assert.deepEqual(out[k].errs, [])]);

    let failed = 0;
    for (const [name, fn] of checks) { try { fn(); console.log('  ✓', name); } catch (e) { failed++; console.log('  ✗', name, '\n   ', e.message); } }
    if (!chromium) console.log('  — navigateur : Playwright absent, partie sautée');
    if (!py) console.log('  — Python absent : pont Python non testé');
    fs.rmSync(tmp, { recursive: true, force: true });
    console.log(failed ? `${failed} échec(s)` : `${checks.length} vérifications réussies`);
    process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); fs.rmSync(tmp, { recursive: true, force: true }); process.exit(1); });
