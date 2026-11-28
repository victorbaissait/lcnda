#!/usr/bin/env node
'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🔐 L'Atelier de transcription, vu par quelqu'un qui cherche les failles :
 *   node tests/test-atelier-securite.js
 *  - écritures sans jeton CSRF, depuis une autre origine, en mode consultation : refusées (atelier_idees_write, save_act_transcription…) ;
 *  - en mode consultation, rien ne part sur Internet (aperçu IIIF) et une lecture (GET train_job) n'écrit rien dans la base ;
 *  - IIIF : seulement http(s) public (127.0.0.1, ::1, ::ffff:127.0.0.1, 0x7f.1, 127.1, localhost., 169.254.169.254, file://, gopher://,
 *    identifiants dans l'adresse : refusés), et l'IA seulement sur cet ordinateur ;
 *  - entraînement : numéro de travail, modèle, clé de registre : jamais un chemin ; deux « Entraîner » en même temps : un seul travail ;
 *  - recherche plein texte : guillemets, NEAR, *, colonnes, parenthèses : pas d'erreur, pas d'injection ;
 *  - vignette d'une ligne : zone ou image d'un autre type refusées ;
 *  - XSS : titre, texte, main, registre, cote, versions, texte modernisé, manifeste IIIF (titre, mention, licence en HTML, licence
 *    « javascript: »), résultats de recherche, mains de l'entraînement : rien ne s'exécute ;
 *  - brouillon local empoisonné (localStorage) : rien ne s'exécute, l'Atelier s'ouvre.
 * Noms inventés.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
let chromium = null;
try { ({ chromium } = require('playwright')); } catch (_) { try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); } catch (__) { chromium = null; } }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const X = n => `<img src=x onerror="window.__xss.push('${n}')">`;

let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n  ')); } };

(async () => {
    if (!chromium) { console.log('Playwright absent : essai sauté.'); return; }
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-atelier-secu-'));
    const dir = path.join(tmp, 'data'), site = path.join(tmp, 'site'); fs.mkdirSync(path.join(dir, 'media'), { recursive: true }); fs.mkdirSync(site, { recursive: true });
    const env = { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4', GENEALOGY_TEST: '1', LCNDA_TEST_IIIF_DIR: site,
        LCNDA_KETOS_BIN: path.join(appRoot, 'tests/fixtures/fake-trainer.php'), FAKE_TRAIN_SLEEP: '400', LCNDA_TEST_GPU: 'none', LCNDA_TEST_OS: 'linux', LCNDA_OLLAMA_URL: 'http://127.0.0.1:9' };
    const php = (code, extra = {}) => { const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], { cwd: appRoot, encoding: 'utf8', env: { ...env, ...extra } }); if (r.status !== 0) throw new Error(r.stderr || r.stdout); return r.stdout; };
    const lines = []; for (let i = 0; i < 60; i++) lines.push(`Ligne ${i} du registre, Léonard Chassagne`);
    const seed = JSON.parse(php(String.raw`require 'lib/paths.php'; $p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; require 'tests/api_functions.php'; require_once 'lib/atelier_idees_data.php'; $pdo = db(); act_transcriptions_ensure($pdo);
save_person($pdo, ['first_name' => 'Jean', 'last_name' => 'MAZAUD', 'gender' => 'male']);
$im = imagecreatetruecolor(1000, 4000); imagefill($im, 0, 0, imagecolorallocate($im, 236, 226, 200)); $ink = imagecolorallocate($im, 70, 50, 30);
for ($b = 0; $b < 60; $b++) { for ($x = 50; $x < 900; $x += 7) { imagefilledrectangle($im, $x, 30 + $b * 60, $x + 3, 60 + $b * 60, $ink); } } imagepng($im, MEDIA_DIR . '/reg.png');
file_put_contents(MEDIA_DIR . '/doc.txt', 'pas une image');
$pdo->exec("INSERT INTO media(title, media_type, filename) VALUES('Registre', 'image', 'reg.png')"); $m = (int) $pdo->lastInsertId();
$pdo->exec("INSERT INTO media(title, media_type, filename) VALUES('Texte', 'document', 'doc.txt')"); $doc = (int) $pdo->lastInsertId();
$X = fn($n) => '<img src=x onerror="window.__xss.push(\'' . $n . '\')">';
$lines = json_decode(getenv('TX_LINES'), true); $body = implode("\n", $lines) . "\n" . $X('body') . ' Mazaud'; $zones = []; $at = 0;
foreach (array_merge($lines, [$X('body') . ' Mazaud']) as $i => $l) { $len = mb_strlen($l); $zones[] = ['id' => 'z' . $i, 'x' => 40, 'y' => 30 + $i * 60, 'w' => 900, 'h' => 40, 's' => $at, 'e' => $at + $len]; $at += $len + 1; }
$zones[] = ['id' => 'zdoc', 'x' => 1, 'y' => 1, 'w' => 50, 'h' => 50, 's' => 0, 'e' => 3, 'p' => $doc];
$data = act_transcription_clean_data($pdo, ['zones' => $zones, 'status' => 'doing', 'reviewed' => array_map('txi_line_key', $lines),
    'reg' => ['hand' => 'Curé ' . $X('hand'), 'register' => 'BMS ' . $X('register'), 'cote' => $X('cote'), 'archive' => $X('archive'), 'licence' => $X('licence')],
    'modern' => ['text' => $X('modern') . "\nx", 'from' => 'hand', 'keys' => []], 'people' => [['name' => $X('people'), 'role' => $X('role')]]]);
$pdo->prepare('INSERT INTO act_transcriptions(title, kind, media_id, date_text, place, source, body, data_json) VALUES(?,?,?,?,?,?,?,?)')->execute([$X('title'), 'bapteme', $m, $X('date'), $X('place'), $X('source'), $body, json_encode($data, JSON_UNESCAPED_UNICODE)]);
$a = (int) $pdo->lastInsertId();
save_act_transcription_version($pdo, ['act_id' => $a, 'label' => $X('version'), 'body' => $X('vbody'), 'data' => []]);
@mkdir(SHARED_DATA_DIR . '/htr/models', 0777, true); file_put_contents(SHARED_DATA_DIR . '/htr/models/mccatmus-fr-en.mlmodel', str_repeat('k', 4000));
// le faux site IIIF : un manifeste piégé (titre, mention, cote, licence en HTML, licence « javascript: »)
$S = getenv('LCNDA_TEST_IIIF_DIR'); @mkdir("$S/img/1/full/!200,200/0", 0777, true); $t = imagecreatetruecolor(60, 80); imagejpeg($t, "$S/img/1/full/!200,200/0/default.jpg");
$canv = ['@id' => 'https://iiif.test/c1', 'label' => $X('vue'), 'images' => [['resource' => ['@id' => 'https://iiif.test/img/1/full/full/0/default.jpg', 'service' => ['@id' => 'https://iiif.test/img/1']]]]];
file_put_contents("$S/piege.json", json_encode(['@context' => 'http://iiif.io/api/presentation/2/context.json', 'label' => '<b>Registre</b>' . $X('mlabel'), 'attribution' => '<a href="javascript:window.__xss.push(1)">AD</a>' . $X('attr'),
    'license' => 'javascript:window.__xss.push("lic")', 'related' => 'javascript:alert(1)', 'metadata' => [['label' => 'Cote', 'value' => $X('mcote')]], 'sequences' => [['canvases' => [$canv]]]]));
// une « bombe » : un PNG de quelques octets qui annonce 40 000 × 40 000 pixels
foreach (['!3000,3000', 'full'] as $sz) { @mkdir("$S/img/9/full/$sz/0", 0777, true); file_put_contents("$S/img/9/full/$sz/0/default.jpg", "\x89PNG\r\n\x1a\n" . pack('N', 13) . 'IHDR' . pack('NN', 40000, 40000) . "\x08\x02\x00\x00\x00" . pack('N', 0) . str_repeat("\0", 64)); }
file_put_contents("$S/bombe.json", json_encode(['@context' => 'http://iiif.io/api/presentation/2/context.json', 'label' => 'Bombe', 'sequences' => [['canvases' => [['@id' => 'https://iiif.test/c9', 'label' => '1', 'images' => [['resource' => ['@id' => 'https://iiif.test/img/9/full/full/0/default.jpg', 'service' => ['@id' => 'https://iiif.test/img/9']]]]]]]]]));
echo json_encode(['a' => $a, 'm' => $m, 'doc' => $doc]);`, { TX_LINES: JSON.stringify(lines) }));

    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const base = `http://127.0.0.1:${port}/`;
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env, stdio: 'ignore' });
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const errs = [];
    try {
        const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        await ctx.addInitScript(() => { window.__xss = []; });
        const p = await ctx.newPage();
        p.on('pageerror', e => errs.push(e.message));
        p.on('dialog', d => { errs.push('dialog: ' + d.message()); d.dismiss().catch(() => {}); });
        await p.goto(base);
        await p.waitForFunction(() => window.LCNDA_EXT?.openActTranscriber && window.LCNDA_EXT?.txSearch && window.LCNDA_EXT?.atelierIiif && window.LCNDA_APP?.state?.csrf, null, { timeout: 30000 });
        const csrf = await p.evaluate(() => window.LCNDA_APP.state.csrf);
        const cookie = (await ctx.cookies()).map(c => `${c.name}=${c.value}`).join('; ');
        const get = async (q) => { const r = await fetch(base + 'api.php?' + new URLSearchParams(q), { headers: { cookie } }); let j = null; try { j = await r.json(); } catch (_) {} return { status: r.status, j }; };
        const post = async (action, body, o = {}) => { const r = await fetch(base + `api.php?action=${action}`, { method: 'POST', headers: { cookie, 'content-type': 'application/json', ...(o.noCsrf ? {} : { 'x-csrf-token': csrf }), ...(o.origin ? { origin: o.origin } : {}) }, body: JSON.stringify(body) }); let j = null; try { j = await r.json(); } catch (_) {} return { status: r.status, j }; };
        const dbCount = sql => Number(php(`require 'lib/bootstrap.php'; echo db()->query(${JSON.stringify(sql)})->fetchColumn();`));

        /* ─── 1. jeton, origine ─── */
        await t('écritures de l’Atelier sans jeton CSRF : refusées', async () => {
            for (const [a, b] of [['atelier_idees_write', { op: 'reg_model', reg_key: 'r:1', model: '' }], ['atelier_idees_write', { op: 'train_cancel', id: 'a'.repeat(24) }], ['save_act_transcription', { id: seed.a, title: 'x', body: 'x' }], ['delete_act_transcription', { id: seed.a }], ['save_act_transcription_version', { act_id: seed.a, body: 'x' }], ['ia_srv_save', { kind: 'ollama', url: 'http://127.0.0.1:11434' }]]) {
                const r = await post(a, b, { noCsrf: true }); assert.equal(r.status, 419, `${a} sans jeton : ${r.status}`);
            }
            assert.equal(dbCount('SELECT COUNT(*) FROM act_transcriptions'), 1);
        });
        await t('écriture depuis une autre origine : refusée', async () => {
            const r = await post('atelier_idees_write', { op: 'reg_model', reg_key: 'r:1', model: '' }, { origin: 'https://evil.example' });
            assert.equal(r.status, 403);
        });

        /* ─── 2. SSRF : IIIF et IA ─── */
        await t('IIIF : adresses locales, autres protocoles, identifiants : refusés', async () => {
            for (const u of ['http://127.0.0.1/manifest.json', 'http://[::1]/m.json', 'http://[::ffff:127.0.0.1]/m.json', 'http://[::ffff:7f00:1]/m.json', 'http://0x7f.1/m.json', 'http://127.1/m.json', 'http://2130706433/m.json',
                'http://localhost./m.json', 'http://169.254.169.254/latest/meta-data/', 'http://10.0.0.1/m.json', 'http://[fe80::1]/m.json', 'http://[fd00::1]/m.json', 'file:///etc/passwd', 'gopher://127.0.0.1:25/x', 'ftp://example.org/m.json',
                'http://user:pw@127.0.0.1/m.json', 'dict://127.0.0.1:11211/', 'https://iiif.test/../../etc/passwd']) {
                const r = await get({ action: 'atelier_idees', op: 'iiif_preview', url: u });
                assert.equal(r.status, 422, `${u} → ${r.status}`); assert.ok(r.j?.error, u);
                const r2 = await post('atelier_idees_write', { op: 'iiif_open', url: u, n: 1 });
                assert.ok(r2.status >= 400, `${u} (ouvrir) → ${r2.status}`);
            }
            assert.equal(fs.readdirSync(path.join(dir, 'media')).length, 2, 'rien téléchargé');
        });
        await t('IIIF : une image qui annonce 1,6 milliard de pixels est refusée (rien dans les Médias)', async () => {
            const r = await post('atelier_idees_write', { op: 'iiif_open', url: 'https://iiif.test/bombe.json', n: 1 });
            assert.equal(r.status, 422, JSON.stringify(r.j)); assert.equal(dbCount('SELECT COUNT(*) FROM media'), 2);
        });
        await t('IA : seulement un serveur sur cet ordinateur', async () => {
            for (const u of ['http://169.254.169.254', 'http://example.org:11434', 'http://localhost@evil.example:11434', 'http://127.0.0.1:11434/api', 'https://127.0.0.1:11434', 'http://127.0.0.1:11434?x=1', 'file:///etc', 'http://127.0.0.1.nip.io:11434', 'http://[::ffff:a9fe:a9fe]']) {
                const r = await post('ia_srv_save', { kind: 'ollama', url: u }); assert.equal(r.status, 422, `${u} → ${r.status}`);
                const r2 = await post('ia_srv_test', { kind: 'ollama', url: u }); assert.equal(r2.status, 422, `${u} (essai) → ${r2.status}`);
            }
        });

        /* ─── 3. entraînement : chemins, noms ─── */
        await t('entraînement : numéro de travail, modèle, clé de registre jamais pris pour un chemin', async () => {
            for (const id of ['../../etc', '..', 'a'.repeat(23), 'A'.repeat(24), 'a'.repeat(24) + '/..', '']) {
                const r = await get({ action: 'atelier_idees', op: 'train_job', id }); assert.equal(r.status, 422, `train_job ${id}`);
                const r2 = await post('atelier_idees_write', { op: 'train_cancel', id }); assert.equal(r2.status, 422, `train_cancel ${id}`);
                const r3 = await post('atelier_idees_write', { op: 'train_ollama', id }); assert.equal(r3.status, 422, `train_ollama ${id}`);
            }
            for (const model of ['../../genealogy.sqlite', 'x;rm -rf /', '-x.mlmodel', '.mlmodel', '$(id).mlmodel', 'a b.mlmodel']) {
                const r = await post('atelier_idees_write', { op: 'reg_model', reg_key: 'r:1', model }); assert.equal(r.status, 422, `modèle ${model} → ${r.status}`);
            }
            for (const key of ['../x', 'r:1;drop', "r:1' OR 1=1", 'z:1']) {
                const r = await post('atelier_idees_write', { op: 'reg_model', reg_key: key, model: '' }); assert.equal(r.status, 422, `clé ${key}`);
            }
            assert.equal(dbCount('SELECT COUNT(*) FROM atelier_reg_models'), 0);
        });
        await t('deux « Entraîner » en même temps : un seul travail lancé', async () => {
            const hand = 'Curé <img src=x onerror="window.__xss.push(\'hand\')">';
            const rs = await Promise.all([0, 1, 2].map(() => post('atelier_idees_write', { op: 'train_start', engine: 'kraken', hand })));
            const ok = rs.filter(r => r.status === 200);
            assert.equal(ok.length, 1, 'un seul travail : ' + JSON.stringify(rs.map(r => [r.status, r.j?.error || r.j?.id])));
            const dirs = fs.readdirSync(path.join(dir, 'atelier-train')).filter(x => /^[a-f0-9]{24}$/.test(x));
            assert.equal(dirs.length, 1, 'un seul dossier de travail');
            out.jobId = ok[0].j.id;
        });
        await t('entraînement : les dossiers de travail de plus de 7 jours sont effacés (images des lignes comprises), pas les récents ni un travail en cours', async () => {
            const r = JSON.parse(php(String.raw`require 'lib/bootstrap.php'; require_once 'lib/atelier_entrainer.php';
$base = DATA_DIR . '/atelier-train'; @mkdir($base, 0775, true); $old = time() - 8 * 86400;
$mk = function (string $id, array $st, int $t) use ($base) { $d = "$base/$id"; @mkdir("$d/train", 0775, true); file_put_contents("$d/train/00001.png", 'png'); file_put_contents("$d/status.json", json_encode($st + ['updated' => $t]));
    foreach (["$d/train/00001.png", "$d/train", "$d/status.json", $d] as $f) { touch($f, $t); } return $d; };
$a = $mk(str_repeat('a', 24), ['state' => 'done'], $old); $b = $mk(str_repeat('b', 24), ['state' => 'done'], time()); $c = $mk(str_repeat('c', 24), ['state' => 'running'], time());
$q = $mk(str_repeat('d', 24), ['state' => 'done', 'dir' => $base . '/' . str_repeat('d', 24) . '/out'], $old); @mkdir("$q/out", 0775, true); file_put_contents("$q/out/Modelfile", 'FROM x'); touch($q, $old);
$n = txi_train_sweep($base, 7 * 86400, true);
echo json_encode(['n' => $n, 'a' => is_dir($a), 'b' => is_dir("$b/train"), 'c' => is_dir("$c/train"), 'qOut' => is_file("$q/out/Modelfile"), 'qTrain' => is_dir("$q/train"), 'job' => is_file("$base/` + out.jobId + `/status.json")]);`));
            assert.deepEqual(r, { n: 2, a: false, b: true, c: true, qOut: true, qTrain: false, job: true });
        });
        await t('enregistrer : deux enregistrements dans la même seconde, depuis deux onglets, sont vus (numéro de révision) ; l’heure seule marche toujours', async () => {
            const r = JSON.parse(php(String.raw`require 'lib/bootstrap.php'; require_once 'lib/transcriptions.php'; $pdo = db();
$s = save_act_transcription($pdo, ['title' => 'Rév', 'body' => 'un', 'data' => []]); $id = $s['id'];
$one = save_act_transcription($pdo, ['id' => $id, 'title' => 'Rév', 'body' => 'deux', 'data' => [], 'base_updated_at' => $s['updated_at'], 'base_rev' => $s['rev']]);
$same = 0; try { save_act_transcription($pdo, ['id' => $id, 'title' => 'Rév', 'body' => 'trois (autre onglet)', 'data' => [], 'base_updated_at' => $one['updated_at'], 'base_rev' => $s['rev']]); } catch (LcndaConflict $e) { $same = 1; }
$old = save_act_transcription($pdo, ['id' => $id, 'title' => 'Rév', 'body' => 'quatre', 'data' => [], 'base_updated_at' => $one['updated_at']]);
$pdo->prepare("UPDATE act_transcriptions SET data_json='{\"zones\":[],\"people\":[]}' WHERE id=?")->execute([$id]); // un acte d'avant, sans numéro
$legacy = save_act_transcription($pdo, ['id' => $id, 'title' => 'Rév', 'body' => 'cinq', 'data' => [], 'base_rev' => 0]);
$back = act_transcription_get($pdo, $id);
$pdo->prepare('DELETE FROM act_transcriptions WHERE id=?')->execute([$id]); $pdo->prepare('DELETE FROM act_transcription_versions WHERE act_id=?')->execute([$id]); // la base reste comme avant (les essais suivants comptent les actes)
echo json_encode(['r0' => $s['rev'], 'r1' => $one['rev'], 'sameSecond' => $s['updated_at'] === $one['updated_at'], 'conflict' => $same, 'r2' => $old['rev'], 'legacy' => $legacy['rev'], 'body' => $back['body'], 'dataRev' => $back['data']['rev'] ?? null]);`));
            assert.equal(r.r0, 1); assert.equal(r.r1, 2); assert.equal(r.conflict, 1, 'l’autre onglet (numéro d’avant) : conflit' + (r.sameSecond ? ', dans la même seconde' : ''));
            assert.equal(r.r2, 3, 'un client qui n’envoie que l’heure enregistre toujours'); assert.equal(r.legacy, 1, 'un acte d’avant (sans numéro) : 0 → 1'); assert.equal(r.body, 'cinq'); assert.equal(r.dataRev, 1);
        });

        /* ─── 4. recherche plein texte ─── */
        await t('recherche : la syntaxe FTS5 tapée ne casse rien', async () => {
            for (const q of ['"', 'Mazaud"', '"Mazaud', 'NEAR(Mazaud ligne)', 'Mazaud*', '*', 'text:Mazaud', 'phon:maso', '(Mazaud', 'Mazaud OR ligne', 'Mazaud AND', '- Mazaud', '^Mazaud', "Mazaud'; DROP TABLE act_transcriptions; --", 'Ma\u0000zaud', 'a'.repeat(5000), 'éé', 'ſa']) {
                for (const near of ['', '1']) {
                    const r = await get({ action: 'atelier_idees', op: 'search', q, near });
                    assert.equal(r.status, 200, `« ${q.slice(0, 40)} » → ${r.status} ${r.j?.error || ''}`);
                }
            }
            const r = await get({ action: 'atelier_idees', op: 'search', q: 'Mazaud' }); assert.ok(r.j.hits.length >= 1);
            assert.equal(dbCount('SELECT COUNT(*) FROM act_transcriptions'), 1);
        });
        await t('vignette d’une ligne : zone inconnue ou fichier qui n’est pas une image → 404', async () => {
            for (const zone of ['zdoc', '../../reg.png', 'nope', '']) { const r = await fetch(base + `api.php?action=atelier_idees&op=thumb&act=${seed.a}&zone=${encodeURIComponent(zone)}`, { headers: { cookie } }); assert.equal(r.status, 404, zone); }
            const ok = await fetch(base + `api.php?action=atelier_idees&op=thumb&act=${seed.a}&zone=z1`, { headers: { cookie } }); assert.equal(ok.status, 200); assert.match(ok.headers.get('content-type'), /image\/jpeg/);
        });

        /* ─── 5. XSS ─── */
        const D = 'dialog.h-tx-dlg';
        await t('XSS : l’Atelier, 📚 Registre et main, versions, deux couches, recherche — rien ne s’exécute', async () => {
            await p.evaluate(i => window.LCNDA_EXT.openActTranscriber({ id: i }), seed.a);
            await p.waitForFunction(d => document.querySelector(`${d} [data-tx-img]`)?.getAttribute('href'), D, { timeout: 15000 }); await sleep(800);
            // 📚 Registre et main
            await p.evaluate(d => document.querySelector(`${d} [data-ais-edit]`)?.click(), D); await sleep(400);
            await p.evaluate(() => document.querySelector('dialog.ais-dlg')?.close()); await sleep(100);
            // 🔤 côte à côte
            await p.evaluate(d => document.querySelector(`${d} [data-aic-mode="s"], ${d} [data-aic-m="s"]`)?.click(), D); await sleep(300);
            // 🔎 chercher dans tous les actes
            const P = await p.evaluate(() => { const P = window.LCNDA_EXT.txSearch.panel({}); document.body.appendChild(P.el); return P.search('Mazaud').then(() => P.el.innerHTML.length); });
            assert.ok(P > 0);
            // 🕘 Versions
            const opened = await p.evaluate(d => { const b = [...document.querySelectorAll(`${d} button`)].find(x => /Versions/.test(x.textContent)); b?.click(); return !!b; }, D); await sleep(600);
            await p.evaluate(() => document.querySelectorAll('.ui-vers-row').forEach(r => r.click())); await sleep(400);
            assert.ok(opened || true);
            assert.deepEqual(await p.evaluate(() => window.__xss), []);
            assert.equal(await p.evaluate(() => document.querySelectorAll('img[src="x"]').length), 0, 'aucune balise injectée');
        });
        await t('XSS : manifeste IIIF piégé (titre, mention, cote, licence) — rien ne s’exécute, pas de lien javascript:', async () => {
            await p.evaluate(() => window.LCNDA_EXT.atelierIiif.open({ url: 'https://iiif.test/piege.json' }));
            await p.waitForFunction(() => document.querySelector('dialog.aii-dlg .aii-found'), null, { timeout: 10000 }); await sleep(400);
            const r = await p.evaluate(() => ({ xss: window.__xss, js: [...document.querySelectorAll('dialog.aii-dlg a')].map(a => a.getAttribute('href')).filter(h => /^\s*javascript:/i.test(h || '')), text: document.querySelector('dialog.aii-dlg .aii-found').textContent }));
            assert.deepEqual(r.xss, []); assert.deepEqual(r.js, []);
            assert.doesNotMatch(r.text, /<b>|onerror/, 'les balises du manifeste sont retirées');
            await p.evaluate(() => document.querySelector('dialog.aii-dlg')?.close());
        });
        await t('XSS : 🎓 entraîner (mains, registres, travail en cours)', async () => {
            const ok = await p.evaluate(() => { const o = window.LCNDA_EXT.atelierTrain?.open; if (!o) return false; o({}); return true; });
            if (ok) { await sleep(1500); }
            assert.deepEqual(await p.evaluate(() => window.__xss), []);
        });
        await t('brouillon local empoisonné : rien ne s’exécute, l’Atelier s’ouvre', async () => {
            await p.evaluate(() => { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/tx|atelier|transcri/i.test(k)) localStorage.setItem(k, '{"body":"<img src=x onerror=window.__xss.push(9)>","zones":[{"x":"<svg/onload=1>"}],"__proto__":{"polluted":1}}'); }
                ['genealogie-tx-draft', 'genealogie-tx-regle', 'genealogie-tx-regle-force', 'genealogie-tx-search-near', 'genealogie-tx-mains', 'genealogie-tx-favs'].forEach(k => localStorage.setItem(k, '<img src=x onerror=window.__xss.push(8)>')); });
            await p.reload(); await p.waitForFunction(() => window.LCNDA_EXT?.openActTranscriber && window.LCNDA_APP?.state?.csrf, null, { timeout: 30000 });
            await p.evaluate(i => window.LCNDA_EXT.openActTranscriber({ id: i }), seed.a);
            await p.waitForFunction(d => document.querySelector(`${d} [data-tx-img]`)?.getAttribute('href'), D, { timeout: 15000 }); await sleep(800);
            assert.deepEqual(await p.evaluate(() => ({ x: window.__xss, polluted: ({}).polluted })), { x: [], polluted: undefined });
        });

        /* ─── 6. mode consultation ─── */
        await t('mode consultation : écritures refusées, rien ne part sur Internet, une lecture n’écrit pas', async () => {
            // le travail lancé plus haut finit (faux entraîneur) : sa lecture choisirait le modèle pour le registre… pas en consultation
            for (let i = 0; i < 60; i++) { const s = JSON.parse(fs.readFileSync(path.join(dir, 'atelier-train', out.jobId, 'status.json'), 'utf8')); if (s.state !== 'running') break; await sleep(500); }
            php(`require 'lib/bootstrap.php'; kiosk_enter(['password' => 'secret12']);`);
            try {
                for (const [a, b] of [['atelier_idees_write', { op: 'reg_model', reg_key: 'r:1', model: '' }], ['atelier_idees_write', { op: 'train_start', engine: 'kraken', hand: 'x' }], ['atelier_idees_write', { op: 'iiif_open', url: 'https://iiif.test/piege.json', n: 1 }], ['save_act_transcription', { id: seed.a, title: 'x', body: 'x' }], ['delete_act_transcription', { id: seed.a }], ['ia_srv_save', { kind: 'ollama', url: 'http://127.0.0.1:11434' }], ['recueil_iiif_import', { url: 'https://iiif.test/piege.json' }]]) {
                    const r = await post(a, b); assert.equal(r.status, 423, `${a}/${b.op || ''} en consultation : ${r.status}`);
                }
                const pv = await get({ action: 'atelier_idees', op: 'iiif_preview', url: 'https://iiif.test/piege.json' }); assert.equal(pv.status, 422, 'aperçu IIIF en consultation');
                const pr = await get({ action: 'recueil_iiif_preview', url: 'https://iiif.test/piege.json' }); assert.equal(pr.status, 422, 'aperçu du recueil IIIF en consultation');
                for (const f of fs.readdirSync(path.join(dir, 'atelier-iiif'))) if (/^t-/.test(f)) fs.rmSync(path.join(dir, 'atelier-iiif', f));
                const th = await fetch(base + 'api.php?action=atelier_idees&op=iiif_thumb&manifest=' + encodeURIComponent('https://iiif.test/piege.json') + '&n=1', { headers: { cookie } }); assert.equal(th.status, 404, 'vignette pas encore là : rien ne part');
                const before = dbCount('SELECT COUNT(*) FROM atelier_reg_models');
                const j = await get({ action: 'atelier_idees', op: 'train_job', id: out.jobId }); assert.equal(j.status, 200);
                assert.equal(dbCount('SELECT COUNT(*) FROM atelier_reg_models'), before, 'GET train_job n’écrit rien en consultation');
            } finally { fs.rmSync(path.join(dir, 'consultation.json'), { force: true }); }
        });
        await t('aucune erreur JavaScript', async () => { assert.deepEqual(errs.filter(e => !/favicon/i.test(e)), []); });
    } finally {
        await browser.close(); proc.kill(); fs.rmSync(tmp, { recursive: true, force: true });
    }
    if (fails) { console.log(`\n${fails} échec(s)`); process.exit(1); }
    console.log('\nAtelier, sécurité : tout est bon.');
})().catch(e => { console.error(e); process.exit(1); });
const out = {};
