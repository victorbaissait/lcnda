'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 📜 Atelier de transcription, idées 35 à 40 (maquette approuvée docs/design/atelier-idees.html) :
 *   node tests/test-atelier-idees.js
 *  39 📏 la règle de lecture : le voile suit la ligne du curseur, ligne sans zone (sous celle d'avant), ↑ ↓ sur l'image, force, retenue ;
 *  37 ⏭ la bande du registre (seulement pour un recueil ou une vue IIIF), « 📚 Registre et main », ➕ Acte suivant (champs repris,
 *     repère « sous la dernière zone »), ◀, Vue suivante →, Alt + ⇧ + →, la dernière vue ;
 *  40 🌐 une vue IIIF : adresse pas IIIF / adresse locale refusées, titre, cote, licence (et l'avertissement « droits réservés »),
 *     vignettes, une seule vue téléchargée, la source et ↗ source gardées ; « Vue suivante » télécharge la suivante, une seule ;
 *  36 🔎 la recherche : lignes avec leur vignette, mot surligné, orthographes voisines (éteintes au départ, retenues), texte modernisé,
 *     un clic ouvre l'acte sur le mot, acte supprimé retiré de l'index, 1 lettre : rien ;
 *  38 🔤 deux couches : 📖 développer, côte à côte, « à revoir », 🤖 proposée par un (faux) Ollama, Ollama absent → message,
 *     « Ajouter à la généalogie » lit le modernisé et la citation garde le fidèle ;
 *  35 🎓 entraîner : l'ordinateur vérifié, les mains (« Main » à remplir, encore n), trop peu de lignes / Qwen sans carte graphique /
 *     Mac refusés avec une phrase claire, ketos (faux) : commandes, 1 ligne sur 10 mise de côté, avant → après, ■ Arrêter (meilleur
 *     état gardé), modèle choisi pour le registre (+ ↶ Annuler), « ✨ Lire » le prend (ext.txModelFor) ; Qwen (faux Unsloth) jusqu'au bout.
 * Noms inventés (MAZAUD, LACOMBE, DURAND). Non vérifié ici : le vrai Kraken / Unsloth (un faux entraîneur imite leur sortie).
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

const LINES = ['L’an mil sept cent quatre vingt sept et le douze', 'du mois de 9bre a été bap. Jean fils lég.', 'de Pierre Mazaud labr et de Marie Lacombe', 'ſa femme, parrain Jean Durand, marraine', 'Anne Mazaud qui n’ont ſceu ſigner.', 'Lacombe curé'];
const BODY = LINES.join('\n');
const ZONES = []; { let at = 0; LINES.forEach((l, i) => { ZONES.push({ id: 'z' + i, x: 40, y: 40 + i * 60, w: 900, h: 44, s: at, e: at + l.length, note: '', c: '' }); at += l.length + 1; }); }

async function main(out) {
    const phpPath = findPhp([devBundledPhp()]);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-idees-'));
    const dir = path.join(tmp, 'data'), site = path.join(tmp, 'site'); fs.mkdirSync(path.join(dir, 'media'), { recursive: true }); fs.mkdirSync(site, { recursive: true });
    const argsLog = path.join(tmp, 'trainer-args.log');
    const env = { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4', GENEALOGY_TEST: '1', LCNDA_TEST_IIIF_DIR: site,
        LCNDA_KETOS_BIN: path.join(appRoot, 'tests/fixtures/fake-trainer.php'), LCNDA_QWEN_TRAIN_BIN: path.join(appRoot, 'tests/fixtures/fake-trainer.php'), FAKE_TRAIN_ARGS_LOG: argsLog, FAKE_TRAIN_SNAP: path.join(tmp, 'trainer-snap'), FAKE_TRAIN_SLEEP: '220',
        LCNDA_TEST_GPU: 'NVIDIA GeForce RTX 3060,12288', LCNDA_TEST_OS: 'linux' };
    if (process.env.DROP) process.env.DROP.split(',').forEach(k => delete env[k]);
    const php = (code, extra = {}) => { const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], { cwd: appRoot, encoding: 'utf8', env: { ...env, ...extra } }); if (r.status !== 0) throw new Error(r.stderr || r.stdout); return r.stdout; };
    /* ─── la base : un recueil de 3 vues, une photo isolée, des actes, des lignes relues de deux mains ; le faux site IIIF ─── */
    const seed = JSON.parse(php(String.raw`require 'lib/paths.php'; $p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; require 'tests/api_functions.php'; require_once 'lib/recueils.php'; require_once 'lib/atelier_idees_data.php'; $pdo = db(); act_transcriptions_ensure($pdo);
save_person($pdo, ['first_name' => 'Jean', 'last_name' => 'MAZAUD', 'gender' => 'male']); // une base commencée (sinon : l'écran du premier lancement)
$img = function (string $name, int $w, int $h, int $bands, int $y0 = 40, int $step = 60) { $im = imagecreatetruecolor($w, $h); imagefill($im, 0, 0, imagecolorallocate($im, 236, 226, 200)); $ink = imagecolorallocate($im, 70, 50, 30);
    for ($b = 0; $b < $bands; $b++) { $y = $y0 + $b * $step; for ($x = 50; $x < $w - 60; $x += 7) { imagefilledrectangle($im, $x, $y + 10 + ($x % 5), $x + 3, $y + 30, $ink); } } imagepng($im, MEDIA_DIR . '/' . $name); };
foreach (['reg1.png', 'reg2.png', 'reg3.png'] as $f) { $img($f, 1000, 520, 6); } $img('photo.png', 800, 300, 3); $img('train.png', 1000, 2000, 32, 20, 60);
$m = []; foreach (['reg1.png' => 'Registre BMS vue 1', 'reg2.png' => 'Registre BMS vue 2', 'reg3.png' => 'Registre BMS vue 3', 'photo.png' => 'Photo isolée', 'train.png' => 'Registre Treignac'] as $f => $t) { $pdo->prepare("INSERT INTO media(title, media_type, filename) VALUES(?, 'image', ?)")->execute([$t, $f]); $m[$f] = (int) $pdo->lastInsertId(); }
$r = save_recueil($pdo, ['title' => 'BMS Treignac 1780-1792']); $rid = (int) $r['id'];
$vid = (int) $pdo->query("SELECT id FROM recueil_versions WHERE recueil_id=$rid ORDER BY id LIMIT 1")->fetchColumn();
if (!$vid) { $vid = (int) save_recueil_version($pdo, ['recueil_id' => $rid, 'name' => 'Original'])['id']; }
recueil_add_images($pdo, ['recueil_id' => $rid, 'version_id' => $vid, 'mode' => 'new_pages', 'media_ids' => [$m['reg1.png'], $m['reg2.png'], $m['reg3.png']]]);
$ins = function (array $a) use ($pdo) { $pdo->prepare('INSERT INTO act_transcriptions(title, kind, media_id, date_text, place, source, body, data_json) VALUES(?,?,?,?,?,?,?,?)')->execute([$a['title'], $a['kind'], $a['media'], $a['date'] ?? '', $a['place'] ?? '', $a['source'] ?? '', $a['body'], json_encode($a['data'], JSON_UNESCAPED_UNICODE)]); return (int) $pdo->lastInsertId(); };
$a1 = $ins(['title' => 'Baptême de Jean MAZAUD', 'kind' => 'bapteme', 'media' => $m['reg1.png'], 'date' => '12 nov. 1787', 'place' => 'Treignac', 'body' => getenv('TX_BODY'), 'data' => ['zones' => json_decode(getenv('TX_ZONES'), true), 'people' => [], 'status' => 'doing']]);
$a2 = $ins(['title' => 'Sépulture d’Anne MAZEAUD', 'kind' => 'sepulture', 'media' => $m['photo.png'], 'date' => '4 mars 1789', 'place' => 'Treignac', 'body' => "L’an mil sept cent quatre vingt neuf\na été inhumée Anne Mazeaud âgée de", 'data' => ['zones' => [['id' => 'q0', 'x' => 40, 'y' => 40, 'w' => 700, 'h' => 44, 's' => 0, 'e' => 35], ['id' => 'q1', 'x' => 40, 'y' => 100, 'w' => 700, 'h' => 44, 's' => 36, 'e' => 70]], 'status' => 'doing']]);
$a3 = $ins(['title' => 'Baptême de Marie LACOMBE', 'kind' => 'bapteme', 'media' => $m['photo.png'], 'date' => '21 juil. 1790', 'place' => 'Treignac', 'body' => "marraine Jeanne Mazaut sa tante\nfille de Léonard Lacombe labr", 'data' => ['zones' => [], 'status' => 'doing', 'modern' => ['text' => "marraine Jeanne MAZAUT sa tante\nfille de Léonard LACOMBE laboureur", 'from' => 'auto', 'keys' => []]]]);
// 🎓 deux actes de la même main (30 lignes relues chacun, sur une grande image), un acte d'une main inconnue (9 lignes)
$train = function (int $from, int $n, string $hand, string $title) use ($ins, $m) { $lines = []; for ($i = 0; $i < $n; $i++) { $lines[] = 'Ligne ' . ($from + $i) . ' du registre, Léonard Chassagne, tisserand'; }
    $body = implode("\n", $lines); $zones = []; $at = 0; foreach ($lines as $i => $l) { $len = mb_strlen($l); $zones[] = ['id' => 't' . ($from + $i), 'x' => 40, 'y' => 20 + (($from + $i) % 32) * 60, 'w' => 900, 'h' => 44, 's' => $at, 'e' => $at + $len]; $at += $len + 1; }
    return $ins(['title' => $title, 'kind' => 'bapteme', 'media' => $m['train.png'], 'place' => 'Treignac', 'body' => $body, 'data' => ['zones' => $zones, 'reviewed' => array_map('txi_line_key', $lines), 'reg' => array_filter(['hand' => $hand, 'register' => 'BMS Treignac', 'cote' => '3 E 271/4']), 'status' => 'checked']]); };
$t1 = $train(0, 30, 'Curé J. LACOMBE', 'Lignes LACOMBE 1'); $t2 = $train(30, 30, 'Curé J. LACOMBE', 'Lignes LACOMBE 2'); $t3 = $train(60, 9, '', 'Main inconnue');
@mkdir(SHARED_DATA_DIR . '/htr/models', 0777, true); file_put_contents(SHARED_DATA_DIR . '/htr/models/mccatmus-fr-en.mlmodel', str_repeat('k', 4000));
// 🌐 le faux site IIIF : un manifeste (Licence Ouverte, cote, page officielle), un autre « droits réservés », un fichier qui n'est pas IIIF
$S = getenv('LCNDA_TEST_IIIF_DIR'); foreach ([1, 2, 3] as $i) { foreach (['!3000,3000', '!200,200'] as $sz) { $d = "$S/img/$i/full/$sz/0"; @mkdir($d, 0777, true); $im = imagecreatetruecolor($sz === '!200,200' ? 80 : 900, $sz === '!200,200' ? 100 : 600); imagefill($im, 0, 0, imagecolorallocate($im, 220 - $i * 20, 200, 170)); imagejpeg($im, "$d/default.jpg"); } }
$canv = fn($i) => ['@id' => "https://iiif.test/c$i", 'label' => (string) (138 + $i), 'images' => [['resource' => ['@id' => "https://iiif.test/img/$i/full/full/0/default.jpg", 'service' => ['@id' => "https://iiif.test/img/$i"]]]]];
file_put_contents("$S/manifest.json", json_encode(['@context' => 'http://iiif.io/api/presentation/2/context.json', 'label' => 'BMS Treignac 1780-1792', 'attribution' => 'Archives départementales (exemple)', 'license' => 'https://www.etalab.gouv.fr/licence-ouverte-open-licence', 'related' => 'https://archives.exemple.fr/ark:/123/vue', 'metadata' => [['label' => 'Cote', 'value' => '3 E 271/4']], 'sequences' => [['canvases' => [$canv(1), $canv(2), $canv(3)]]]]));
file_put_contents("$S/reserve.json", json_encode(['@context' => 'http://iiif.io/api/presentation/2/context.json', 'label' => 'Registre réservé', 'license' => 'http://rightsstatements.org/vocab/InC/1.0/', 'sequences' => [['canvases' => [$canv(1)]]]]));
file_put_contents("$S/page.html", '<html>pas IIIF</html>');
echo json_encode(['m' => $m, 'a1' => $a1, 'a2' => $a2, 'a3' => $a3, 't1' => $t1, 't3' => $t3, 'rid' => $rid]);`, { TX_BODY: BODY, TX_ZONES: JSON.stringify(ZONES) }));
    out.seed = seed;
    /* ─── un faux Ollama (🔤 Proposer) ─── */
    const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    let ollamaUp = true; const prompts = [];
    const fake = http.createServer((req, res) => {
        let body = ''; req.on('data', c => { body += c; }); req.on('end', () => {
            if (!ollamaUp) { res.statusCode = 503; res.end('{}'); return; }
            if (req.url === '/api/version') { res.end(JSON.stringify({ version: '0.12.0' })); return; }
            if (req.url === '/api/tags') { res.end(JSON.stringify({ models: [{ name: 'qwen3-vl:8b-instruct', size: 1 }] })); return; }
            if (req.url === '/api/chat') { try { prompts.push(JSON.parse(body).messages[0].content); } catch (_) {} res.setHeader('Content-Type', 'application/x-ndjson');
                const lines = ['L’an mille sept cent quatre-vingt-sept et le douze', 'du mois de novembre a été baptisé Jean, fils légitime', 'de Pierre MAZAUD, laboureur, et de Marie LACOMBE', 'sa femme, parrain Jean DURAND, marraine', 'Anne MAZAUD, qui n’ont su signer.', 'LACOMBE, curé'];
                res.end(JSON.stringify({ message: { role: 'assistant', content: lines.join('\n') }, done: false }) + '\n' + JSON.stringify({ message: { content: '' }, done: true }) + '\n'); return; }
            res.statusCode = 404; res.end('{}');
        });
    });
    const oport = await freePort(); await new Promise(r => fake.listen(oport, '127.0.0.1', r));
    const port = await freePort(), base = `http://127.0.0.1:${port}/`;
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env: { ...env, LCNDA_OLLAMA_URL: `http://127.0.0.1:${oport}` }, stdio: 'ignore' });
    const browser = await chromium.launch();
    try {
        for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
        const ctxB = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        const p = await ctxB.newPage(); const errs = [];
        p.on('pageerror', e => errs.push(e.message));
        p.on('response', r => { if (r.status() >= 400 && process.env.DEBUG) console.log('HTTP', r.status(), r.url().slice(0, 140)); });
        p.on('console', m => { if (m.type() === 'error' && process.env.DEBUG) console.log('console:', m.text()); });
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_EXT?.openActTranscriber && window.LCNDA_EXT?.txPlugins?.length >= 5 && window.LCNDA_EXT?.txSearch && window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.txActe, null, { timeout: 30000 }).catch(async e => { console.log(errs, await p.evaluate(() => ({ o: !!window.LCNDA_EXT?.openActTranscriber, n: window.LCNDA_EXT?.txPlugins?.length, a: !!window.LCNDA_EXT?.txActe }))); throw e; });
        await p.evaluate(() => { try { ['genealogie-tx-regle', 'genealogie-tx-regle-force', 'genealogie-tx-search-near', 'genealogie-tx-mains'].forEach(k => localStorage.removeItem(k)); } catch (_) {} });
        const api = (a, q = {}) => p.evaluate(([x, y]) => window.LCNDA_APP.api(x, y), [a, q]);
        const apiPost = (a, b) => p.evaluate(([x, y]) => window.LCNDA_APP.api(x, {}, { method: 'POST', body: y }).then(r => ({ ok: true, r }), e => ({ ok: false, error: e.message })), [a, b]);
        const D = 'dialog.h-tx-dlg';
        const openAct = async id => { await p.evaluate(i => window.LCNDA_EXT.openActTranscriber({ id: i }), id); await p.waitForFunction(d => document.querySelector(`${d} [data-tx-img]`)?.getAttribute('href') && document.querySelector(`${d}`)?.dataset.aisRegister !== undefined, D, { timeout: 15000 }); await sleep(500); };
        const closeAct = async () => { await p.evaluate(d => document.querySelector(`${d} [data-tx-cmd="close"]`)?.click(), D); await sleep(300);
            await p.evaluate(() => { const b = [...document.querySelectorAll('dialog[open] button')].find(x => /Fermer sans/.test(x.textContent)); b?.click(); }); await sleep(300); };
        const menu = async (m, label) => { await p.click(`${D} [data-ui-menu="${m}"]`); await sleep(150); const ok = await p.evaluate(l => { const b = [...document.querySelectorAll('.ui-actmenu [role="menuitem"]')].find(x => x.textContent.includes(l)); if (b) b.click(); else document.body.click(); return !!b; }, label); await sleep(250); return ok; };
        const menuLabels = async m => { await p.click(`${D} [data-ui-menu="${m}"]`); await sleep(150); const l = await p.evaluate(() => [...document.querySelectorAll('.ui-actmenu [role="menuitem"]')].map(b => b.textContent.replace(/\s+/g, ' ').trim())); await p.keyboard.press('Escape'); await sleep(150); return l; };
        const caret = (needle, off = 0) => p.evaluate(([d, n, o]) => { const a = document.querySelector(`${d} [data-tx-body]`); const s = a.value.indexOf(n) + o; a.focus(); a.setSelectionRange(s, s); a.dispatchEvent(new Event('select')); }, [D, needle, off]);
        const band = () => p.evaluate(d => { const v = document.querySelector(d).dataset.txRegleBand; return v ? JSON.parse(v) : null; }, D);
        const shot = async n => { if (process.env.SHOTS) { fs.mkdirSync(process.env.SHOTS, { recursive: true }); await p.screenshot({ path: path.join(process.env.SHOTS, n) }); } };

        /* ═════ 39. 📏 la règle de lecture ═════ */
        await openAct(seed.a1);
        out.regleBtn = await p.evaluate(d => !!document.querySelector(`${d} [data-tx-rail] [data-aip-regle]`), D);
        out.regleOffBand = await p.evaluate(d => getComputedStyle(document.querySelector(`${d} [data-aip-regle]:is(g)`)).display, D);
        await p.click(`${D} [data-tx-rail] [data-aip-regle]`); await sleep(150);
        await caret('de Pierre Mazaud', 3); await sleep(150);
        out.band3 = await band(); out.regleOn = await p.evaluate(d => ({ on: document.querySelector(d).dataset.txRegle, ls: localStorage.getItem('genealogie-tx-regle'), pill: !document.querySelector(`${d} .aip-pill`).hidden, d: document.querySelector(`${d} .aip-veil`).getAttribute('d') }), D);
        await shot('regle.png');
        // Entrée en fin de dernière ligne : la règle descend sous la dernière zone (ligne sans zone : estimée)
        await p.evaluate(d => { const a = document.querySelector(`${d} [data-tx-body]`); a.focus(); a.setSelectionRange(a.value.length, a.value.length); }, D);
        await p.keyboard.press('Enter'); await sleep(200);
        out.bandEst = await band();
        await p.keyboard.press('Backspace'); await sleep(100);
        // ↑ ↓ sur l'image : le curseur du texte change de ligne
        await caret('Anne Mazaud'); await p.evaluate(d => document.querySelector(`${d} [data-tx-stage]`).focus(), D);
        await p.keyboard.press('ArrowUp'); await sleep(150);
        out.stepUp = await p.evaluate(d => { const a = document.querySelector(`${d} [data-tx-body]`); return a.value.slice(a.selectionStart).split('\n')[0]; }, D); out.bandUp = await band();
        await p.evaluate(d => { const r = document.querySelector(`${d} [data-aip-force]`); r.value = '80'; r.dispatchEvent(new Event('input', { bubbles: true })); }, D); await sleep(100);
        out.force = await p.evaluate(d => ({ op: document.querySelector(`${d} .aip-veil`).style.fillOpacity, ls: localStorage.getItem('genealogie-tx-regle-force') }), D);
        out.affichage = await menuLabels('Affichage');
        /* ═════ 37. ⏭ le registre (recueil) ═════ */
        out.strip1 = await p.evaluate(d => { const s = document.querySelector(`${d} [data-ais-strip]`); return { hidden: s.hidden, text: s.textContent.replace(/\s+/g, ' ').trim(), view: !!s.querySelector('[data-ais-go="view"]:not([disabled])'), prev: !!s.querySelector('[data-ais-go="prev"]:not([disabled])') }; }, D);
        out.edition = await menuLabels('Édition');
        await menu('Édition', 'Registre et main');
        await p.waitForSelector('dialog.ais-dlg [data-ais-f="hand"]');
        out.regGreen = await p.evaluate(() => [...document.querySelectorAll('dialog.ais-dlg .ais-f.is-reg [data-ais-f]')].map(i => i.dataset.aisF));
        await p.fill('dialog.ais-dlg [data-ais-f="hand"]', 'Curé J. LACOMBE'); await p.fill('dialog.ais-dlg [data-ais-f="cote"]', '3 E 271/4');
        await p.click('dialog.ais-dlg [type=submit]'); await sleep(300);
        out.afterReg = await p.evaluate(d => ({ source: document.querySelector(`${d} [data-tx="source"]`).value, strip: document.querySelector(`${d} [data-ais-strip]`).textContent.replace(/\s+/g, ' ') }), D);
        await p.evaluate(d => document.querySelector(`${d} [data-tx-cmd="save"]`).click(), D); await sleep(700);
        out.saved1 = (await api('act_transcription', { id: seed.a1 })).data.reg;
        // ➕ Acte suivant : un nouvel acte sur la même vue, prêt à tracer sa zone sous la dernière zone
        await p.click(`${D} [data-ais-go="next"]`);
        await p.waitForFunction(d => { const dl = document.querySelector(d); return dl && !dl.querySelector('[data-tx="title"]').value && dl.querySelector('[data-ais-guide]'); }, D, { timeout: 15000 }); await sleep(300);
        out.next = await p.evaluate(d => { const dl = document.querySelector(d), g = dl.querySelector('[data-ais-guide] rect'); return { kind: dl.querySelector('[data-tx="kind"]').value, date: dl.querySelector('[data-tx="date_text"]').value, place: dl.querySelector('[data-tx="place"]').value, source: dl.querySelector('[data-tx="source"]').value, guideY: g ? +g.getAttribute('y') : null, tool: dl.querySelector('[data-tx-stage]').dataset.tool, strip: dl.querySelector('[data-ais-strip]').textContent.replace(/\s+/g, ' ') }; }, D);
        await shot('acte-suivant.png');
        await p.evaluate(d => { const a = document.querySelector(`${d} [data-tx-body]`); a.value = 'Le quinze dud. mois a été inhumé Léonard Durand'; a.dispatchEvent(new Event('input')); document.querySelector(`${d} [data-tx-cmd="save"]`).click(); }, D); await sleep(900);
        const nextId = await p.evaluate(() => window.LCNDA_APP.api('act_transcriptions_media', { media_id: 1 }).then(r => r.items.map(i => i.id)));
        out.nextIds = nextId; const a1b = nextId.find(i => i !== seed.a1);
        out.nextSaved = (await api('act_transcription', { id: a1b })).data.reg;
        out.regInfoNext = await api('atelier_idees', { op: 'reg', act_id: a1b });
        out.regOnly = await api('atelier_idees', { op: 'search', q: 'Léonard', reg_of: seed.a1 }); out.regAll = await api('atelier_idees', { op: 'search', q: 'Léonard' }); out.regIds = [seed.a1, a1b];
        // ◀ : l'acte d'avant
        await p.click(`${D} [data-ais-go="prev"]`); await p.waitForFunction(([d, t]) => document.querySelector(`${d} [data-tx="title"]`)?.value === t, [D, 'Baptême de Jean MAZAUD'], { timeout: 15000 }); await sleep(300);
        out.backTitle = await p.evaluate(d => document.querySelector(`${d} [data-tx="title"]`).value, D);
        // Vue suivante → : la vue 2 du recueil
        await p.click(`${D} [data-ais-go="view"]`); await p.waitForFunction(d => /vue 2 \/ 3/.test(document.querySelector(`${d} [data-ais-strip]`)?.textContent || ''), D, { timeout: 15000 }); await sleep(300);
        out.view2 = await p.evaluate(d => ({ src: document.querySelector(`${d} [data-tx="source"]`).value, strip: document.querySelector(`${d} [data-ais-strip]`).textContent.replace(/\s+/g, ' '), img: document.querySelector(`${d} [data-tx-img]`).getAttribute('href') }), D);
        await p.evaluate(d => document.querySelector(`${d} [data-tx-cmd="save"]`).click(), D); await sleep(800);
        // Alt + ⇧ + → (hors du texte) : la vue 3, la dernière (« Vue suivante » éteinte)
        await p.evaluate(d => document.querySelector(`${d} [data-tx-stage]`).focus(), D); await p.keyboard.press('Alt+Shift+ArrowRight');
        await p.waitForFunction(d => /vue 3 \/ 3/.test(document.querySelector(`${d} [data-ais-strip]`)?.textContent || ''), D, { timeout: 15000 }); await sleep(300);
        out.view3 = await p.evaluate(d => ({ viewOff: !!document.querySelector(`${d} [data-ais-go="view"][disabled]`), hand: document.querySelector(`${d} [data-ais-strip]`).textContent.includes('LACOMBE') }), D);
        await closeAct();
        // une photo isolée : pas de bande, rien de plus à l'écran
        await openAct(seed.a2);
        out.isolated = await p.evaluate(d => ({ hidden: document.querySelector(`${d} [data-ais-strip]`).hidden, fichier: null }), D);
        out.isolatedFichier = await menuLabels('Fichier');
        await closeAct();

        /* ═════ 40. 🌐 une vue IIIF ═════ */
        await p.evaluate(() => window.LCNDA_EXT.openActTranscriber({}));
        await p.waitForSelector(`${D} [data-aii-open]`, { timeout: 10000 }); await sleep(400);
        await p.evaluate(() => { [...document.querySelectorAll('dialog[open]')].filter(d => !d.classList.contains('h-tx-dlg')).forEach(d => d.close()); }); await sleep(200); // la fenêtre des images, ouverte toute seule
        await p.evaluate(d => document.querySelector(`${d} [data-aii-open]`).click(), D); await p.waitForSelector('dialog.aii-dlg [data-aii-url]');
        const look = async u => { await p.fill('dialog.aii-dlg [data-aii-url]', u); await p.click('dialog.aii-dlg [data-aii-look]'); await p.waitForFunction(() => !/Lecture du manifeste/.test(document.querySelector('dialog.aii-dlg [data-aii-info]').textContent), null, { timeout: 10000 }); await sleep(100); return p.evaluate(() => ({ text: document.querySelector('dialog.aii-dlg [data-aii-info]').textContent.replace(/\s+/g, ' ').trim(), go: !document.querySelector('dialog.aii-dlg [data-aii-go]').disabled, warn: !!document.querySelector('dialog.aii-dlg .aii-warn') })); };
        out.iiifNot = await look('https://iiif.test/page.html');
        out.iiifLocal = await look('http://127.0.0.1:1/manifest.json');
        out.iiifReserve = await look('https://iiif.test/reserve.json');
        const mediaBefore = Number(php(String.raw`require 'lib/bootstrap.php'; echo db()->query('SELECT COUNT(*) FROM media')->fetchColumn();`));
        out.iiifOk = await look('https://iiif.test/manifest.json');
        await p.waitForFunction(() => [...document.querySelectorAll('dialog.aii-dlg .aii-th img')].some(i => i.complete && i.naturalWidth > 0), null, { timeout: 10000 }).catch(() => {});
        out.thumbs = await p.evaluate(() => [...document.querySelectorAll('dialog.aii-dlg .aii-th img')].map(i => i.naturalWidth > 0));
        await p.click('dialog.aii-dlg [data-aii-step="1"]'); await sleep(100);
        out.pickN = await p.evaluate(() => document.querySelector('dialog.aii-dlg [data-aii-n]').value);
        await shot('iiif.png');
        await p.click('dialog.aii-dlg [data-aii-go]');
        await p.waitForFunction(d => /vue 2 \/ 3/.test(document.querySelector(`${d} [data-ais-strip]`)?.textContent || ''), D, { timeout: 20000 }); await sleep(400);
        out.iiifAct = await p.evaluate(d => { const dl = document.querySelector(d), s = dl.querySelector('[data-ais-strip]'); return { source: dl.querySelector('[data-tx="source"]').value, strip: s.textContent.replace(/\s+/g, ' '), href: s.querySelector('.ais-src')?.getAttribute('href') || '', img: dl.querySelector('[data-tx-img]').getAttribute('href') }; }, D);
        out.mediaAfter1 = Number(php(String.raw`require 'lib/bootstrap.php'; echo db()->query('SELECT COUNT(*) FROM media')->fetchColumn();`));
        out.mediaRow = JSON.parse(php(String.raw`require 'lib/bootstrap.php'; echo json_encode(db()->query('SELECT title, description, document_reference, document_url FROM media ORDER BY id DESC LIMIT 1')->fetch(PDO::FETCH_ASSOC), JSON_UNESCAPED_UNICODE);`));
        await p.evaluate(d => { const a = document.querySelector(`${d} [data-tx-body]`); a.value = 'Le douze du mois de 9bre a été bap. Jean'; a.dispatchEvent(new Event('input')); document.querySelector(`${d} [data-tx-cmd="save"]`).click(); }, D); await sleep(900);
        const iiifActId = await p.evaluate(() => window.LCNDA_APP.api('act_transcriptions_page', { limit: 1, sort: 'recent' }).then(r => r.items[0].id));
        out.iiifSaved = (await api('act_transcription', { id: iiifActId })).data.reg;
        await p.click(`${D} [data-ais-go="view"]`);
        await p.waitForFunction(d => /vue 3 \/ 3/.test(document.querySelector(`${d} [data-ais-strip]`)?.textContent || ''), D, { timeout: 20000 }); await sleep(300);
        out.mediaAfter2 = Number(php(String.raw`require 'lib/bootstrap.php'; echo db()->query('SELECT COUNT(*) FROM media')->fetchColumn();`));
        out.iiifViews = JSON.parse(php(String.raw`require 'lib/bootstrap.php'; echo json_encode(db()->query('SELECT n FROM atelier_iiif_views ORDER BY n')->fetchAll(PDO::FETCH_COLUMN));`));
        out.iiifView3 = await p.evaluate(d => document.querySelector(`${d} [data-tx="source"]`).value, D);
        out.mediaBefore = mediaBefore;
        await closeAct();

        /* ═════ 38. 🔤 deux couches ═════ */
        await p.evaluate(() => { const X = window.LCNDA_EXT.txActe; window.__found = []; X.openFound = o => { window.__found.push(o); }; }); // « Ajouter à la généalogie » : ce qu'il reçoit
        await openAct(seed.a1);
        out.switchHidden = await p.evaluate(d => document.querySelector(`${d} [data-aic]`).hidden, D);
        out.outils = await menuLabels('Outils');
        await menu('Outils', 'Texte modernisé');
        out.modeM = await p.evaluate(d => ({ mode: document.querySelector(d).dataset.aicMode, editorHidden: getComputedStyle(document.querySelector(`${d} [data-tx-editor]`)).display === 'none' }), D);
        await p.click(`${D} [data-aic-do="expand"]`); await sleep(200);
        out.expanded = await p.evaluate(d => document.querySelector(`${d} [data-aic-ta]`)?.value || '', D);
        out.expandUndo = await p.evaluate(() => [...document.querySelectorAll('.ui-toast')].some(t => /Abréviations développées/.test(t.textContent)));
        await p.click(`${D} [data-aic-mode="s"]`); await sleep(150);
        out.sideRows = await p.evaluate(d => document.querySelectorAll(`${d} .aic-row`).length, D);
        // une ligne fidèle changée : la ligne modernisée « à revoir »
        await p.click(`${D} [data-aic-mode="f"]`);
        await p.evaluate(d => { const a = document.querySelector(`${d} [data-tx-body]`); a.value = a.value.replace('Jean fils lég.', 'Jean fils légitime'); a.dispatchEvent(new Event('input')); }, D);
        await p.click(`${D} [data-aic-mode="s"]`); await sleep(200);
        out.review = await p.evaluate(d => [...document.querySelectorAll(`${d} .aic-row`)].map(r => r.classList.contains('is-rev')), D);
        await shot('couches.png');
        await p.evaluate(d => document.querySelector(`${d} [data-tx-cmd="save"]`).click(), D); await sleep(800);
        out.modernSaved = (await api('act_transcription', { id: seed.a1 })).data.modern;
        // 🤖 Proposer : le faux Ollama ; puis Ollama absent
        await p.click(`${D} [data-aic-mode="m"]`); await sleep(100);
        await p.click(`${D} [data-aic-do="ai"]`); await p.waitForFunction(d => /novembre a été baptisé/.test(document.querySelector(`${d} [data-aic-ta]`)?.value || ''), D, { timeout: 15000 });
        out.ai = await p.evaluate(d => ({ text: document.querySelector(`${d} [data-aic-ta]`).value, from: document.querySelector(`${d} .aic-from`).textContent }), D);
        out.aiPrompt = prompts.at(-1) || '';
        ollamaUp = false;
        await p.click(`${D} [data-aic-do="ai"]`); await sleep(1500);
        out.aiDown = await p.evaluate(() => [...document.querySelectorAll('.ui-toast')].map(t => t.textContent).join(' | '));
        ollamaUp = true;
        // « Ajouter à la généalogie » : le modernisé ; la citation garde le fidèle ; une personne reliée retrouvée dans le texte fidèle
        await p.evaluate(d => document.querySelector(`${d} [data-tx-cmd="found"]`).click(), D); await sleep(300);
        out.found = await p.evaluate(d => { const o = window.__found.at(-1); if (!o) return null; const a = document.querySelector(`${d} [data-tx-body]`).value;
            const s = o.text.indexOf('Pierre MAZAUD'); o.onApplied({ result: {}, people: [{ name: 'Pierre MAZAUD', role: 'parent', person_id: 0, s, e: s + 13 }], source: {} });
            return { modern: o.text.includes('MAZAUD, laboureur'), cite: o.citeText === a, used: !!o.modernUsed }; }, D);
        await sleep(300);
        out.foundSpan = await p.evaluate(d => { const a = document.querySelector(`${d} [data-tx-body]`).value; const r = window.LCNDA_EXT.txCouches.mapBack(a, window.__found.at(-1).text, window.__found.at(-1).text.indexOf('Pierre MAZAUD'), 0, 'Pierre MAZAUD'); return a.slice(r.s, r.e); }, D);
        out.citeHook = fs.readFileSync(path.join(appRoot, 'assets/js/heritage-transcribe-acte.js'), 'utf8').includes('text: ctx.citeText ?? ctx.text');
        await closeAct();

        /* ═════ 36. 🔎 chercher dans toutes les transcriptions ═════ */
        await p.evaluate(async () => { const S = window.LCNDA_APP.state; S.workspaceToken = 'idees'; await window.LCNDA_EXT.lists.act_transcriptions_list('idees'); });
        await p.waitForSelector('#workspace .h-atl .ui-listbar input', { timeout: 10000 });
        const searchList = async q => { await p.fill('#workspace .h-atl .ui-listbar input', q); await sleep(900); return p.evaluate(() => { const P = document.querySelector('#workspace [data-air-panel]'); return P ? { hidden: P.hidden, head: P.querySelector('.air-head')?.textContent.replace(/\s+/g, ' ').trim() || '', hits: [...P.querySelectorAll('.air-hit')].map(h => ({ v: h.classList.contains('is-var'), q: h.querySelector('q').innerHTML, var: h.querySelector('.air-var')?.textContent.trim() || '', img: !!h.querySelector('img') })), near: P.querySelector('[data-air-near]')?.checked, soon: !!P.querySelector('.air-soon') } : null; }); };
        out.s1 = await searchList('M');
        out.s2 = await searchList('MAZAUD');
        await p.waitForFunction(() => [...document.querySelectorAll('#workspace .air-th img')].some(i => i.complete && i.naturalWidth > 0), null, { timeout: 10000 }).catch(() => {});
        out.s2img = await p.evaluate(() => [...document.querySelectorAll('#workspace .air-th img')].map(i => i.naturalWidth));
        await shot('recherche.png');
        await p.click('#workspace [data-air-near]'); await sleep(900);
        out.s3 = await p.evaluate(() => ({ hits: [...document.querySelectorAll('#workspace .air-hit')].map(h => ({ v: h.classList.contains('is-var'), var: h.querySelector('.air-var')?.textContent.trim() || '' })), ls: localStorage.getItem('genealogie-tx-search-near') }));
        out.s4 = await searchList('laboureur');
        out.count = await p.evaluate(() => document.querySelector('#workspace .air-count')?.textContent || '');
        // un clic ouvre l'acte, le curseur sur le mot
        await searchList('Mazeaud');
        await p.click('#workspace .air-hit'); await p.waitForFunction(d => document.querySelector(`${d} [data-tx-img]`)?.getAttribute('href'), D, { timeout: 15000 }); await sleep(700);
        out.opened = await p.evaluate(d => { const a = document.querySelector(`${d} [data-tx-body]`); return { title: document.querySelector(`${d} [data-tx="title"]`).value, sel: a.value.slice(a.selectionStart, a.selectionEnd) }; }, D);
        out.ateliers = await menuLabels('Édition');
        await closeAct();
        // acte supprimé : plus dans les résultats
        await apiPost('delete_act_transcription', { id: seed.a2 });
        out.afterDelete = (await api('atelier_idees', { op: 'search', q: 'Mazeaud' })).hits.length;
        // les orthographes voisines restent allumées (retenu)
        await p.reload(); await p.waitForFunction(() => window.LCNDA_EXT?.lists?.act_transcriptions_list?._air, null, { timeout: 30000 });
        await p.evaluate(async () => { const S = window.LCNDA_APP.state; S.workspaceToken = 'idees2'; await window.LCNDA_EXT.lists.act_transcriptions_list('idees2'); });
        await p.waitForSelector('#workspace .h-atl .ui-listbar input');
        out.s5 = await searchList('Mazaud');

        /* ═════ 35. 🎓 entraîner ═════ */
        // l'ordinateur : sans carte graphique, sur Mac (vérifié par le serveur, sans navigateur)
        const st = (extra) => JSON.parse(php(String.raw`require 'lib/bootstrap.php'; require 'tests/api_functions.php'; require_once 'lib/atelier_entrainer.php'; $pdo = db(); txi_ensure($pdo); echo json_encode(txi_train_get($pdo, 'train_status', []), JSON_UNESCAPED_UNICODE);`, extra));
        out.stNoGpu = st({ LCNDA_TEST_GPU: 'none' }); out.stMac = st({ LCNDA_TEST_OS: 'mac', LCNDA_TEST_GPU: 'Apple M2,16384' });
        out.tooFew = await apiPost('atelier_idees_write', { op: 'train_start', engine: 'kraken', hand: 'Inconnu' });
        out.noHand = await apiPost('atelier_idees_write', { op: 'train_start', engine: 'kraken', hand: '' });
        out.qwenNoDl = await apiPost('atelier_idees_write', { op: 'train_start', engine: 'qwen', hand: 'Curé J. LACOMBE' });
        await openAct(seed.t1);
        await menu('Outils', 'Entraîner la lecture');
        await p.waitForSelector('dialog.ait-dlg .ait-hands', { timeout: 15000 });
        out.dlg = await p.evaluate(() => { const d = document.querySelector('dialog.ait-dlg'); return { machine: d.querySelector('.ait-machine').textContent.replace(/\s+/g, ' '), rows: [...d.querySelectorAll('[data-ait-hand]')].map(r => r.textContent.replace(/\s+/g, ' ').trim()), sel: d.querySelector('tr.is-sel')?.dataset.aitHand, go: !d.querySelector('[data-ait-go]').disabled, how: d.querySelector('.ait-how')?.textContent || '', engines: [...d.querySelectorAll('[name="ait-eng"]')].map(i => `${i.value}:${i.checked}`) }; });
        await shot('entrainer.png');
        fs.writeFileSync(argsLog, '');
        await p.click('dialog.ait-dlg [data-ait-go]');
        await p.waitForSelector('dialog.ait-dlg .ait-run progress', { timeout: 10000 }); await sleep(1200);
        out.running = await p.evaluate(() => document.querySelector('dialog.ait-dlg .ait-run')?.textContent.replace(/\s+/g, ' ') || '');
        out.busy = await apiPost('atelier_idees_write', { op: 'train_start', engine: 'kraken', hand: 'Curé J. LACOMBE' });
        await p.waitForSelector('dialog.ait-dlg .ait-done', { timeout: 40000 }); await sleep(800);
        out.done = await p.evaluate(() => ({ text: document.querySelector('dialog.ait-dlg .ait-done').textContent.replace(/\s+/g, ' '), toast: [...document.querySelectorAll('.ui-toast')].map(t => t.textContent).join(' | ') }));
        out.args = fs.readFileSync(argsLog, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
        const jobDir = fs.readdirSync(path.join(dir, 'atelier-train')).filter(x => /^[a-f0-9]{24}$/.test(x)).map(x => path.join(dir, 'atelier-train', x))[0];
        // ce que l'entraîneur a reçu (copie faite par le faux entraîneur : le dossier du travail est vidé une fois fini)
        const snapDir = path.join(tmp, 'trainer-snap');
        out.split = { train: fs.readFileSync(path.join(snapDir, 'train.txt'), 'utf8').trim().split('\n'), val: fs.readFileSync(path.join(snapDir, 'val.txt'), 'utf8').trim().split('\n'), held: fs.readFileSync(path.join(snapDir, 'heldout.txt'), 'utf8').trim().split('\n') };
        out.gt = fs.readFileSync(path.join(snapDir, 'heldout-1.gt.txt'), 'utf8');
        // 🧹 (audit sécurité) fini : les images des lignes découpées et les fichiers de travail sont effacés ; restent l'état et un petit journal
        for (let i = 0; i < 20 && fs.existsSync(path.join(jobDir, 'train')); i++) await sleep(150);
        out.jobLeft = fs.readdirSync(jobDir).sort();
        out.models = JSON.parse(fs.readFileSync(path.join(dir, 'htr/models/trained.json'), 'utf8')).models;
        out.assigned = JSON.parse(php(String.raw`require 'lib/bootstrap.php'; echo json_encode(db()->query('SELECT reg_key, model FROM atelier_reg_models')->fetchAll(PDO::FETCH_KEY_PAIR));`));
        await p.evaluate(() => document.querySelector('dialog.ait-dlg [data-ait-x]').click()); await sleep(200);
        await closeAct(); await openAct(seed.t1);
        out.modelFor = await p.evaluate(d => window.LCNDA_EXT.txModelFor(document.querySelector(d).txApi.get()), D);
        out.runHtrHook = fs.readFileSync(path.join(appRoot, 'assets/js/heritage-transcribe.js'), 'utf8').includes('ext.txModelFor?.(t)');
        // ↶ Annuler le choix du registre (depuis l'API, comme le bouton du message)
        out.undoAssign = await apiPost('atelier_idees_write', { op: 'train_assign', reg_keys: Object.fromEntries(Object.keys(out.assigned).map(k => [k, ''])) });
        out.assignedAfterUndo = JSON.parse(php(String.raw`require 'lib/bootstrap.php'; echo json_encode(db()->query('SELECT COUNT(*) FROM atelier_reg_models')->fetchColumn());`));
        // ■ Arrêter : le meilleur état atteint est gardé
        await menu('Outils', 'Entraîner la lecture'); await p.waitForSelector('dialog.ait-dlg [data-ait-go]', { timeout: 15000 });
        await p.click('dialog.ait-dlg [data-ait-go]'); await p.waitForSelector('dialog.ait-dlg .ait-run', { timeout: 10000 });
        await p.waitForFunction(() => /passe [1-9]/.test(document.querySelector('dialog.ait-dlg .ait-run')?.textContent || ''), null, { timeout: 20000 });
        await p.click('dialog.ait-dlg [data-ait-stop]');
        await p.waitForSelector('dialog.ait-dlg .ait-done, dialog.ait-dlg .ui-hint', { timeout: 20000 }); await sleep(400);
        out.cancelled = await p.evaluate(() => document.querySelector('dialog.ait-dlg [data-ait-job]').textContent.replace(/\s+/g, ' '));
        // 🧠 Qwen (faux Unsloth) : la case « Télécharger une fois » puis jusqu'au bout ; « Ajouter à Ollama » sans Ollama : une phrase claire
        await p.check('dialog.ait-dlg [name="ait-eng"][value="qwen"]'); await sleep(200);
        out.qwenUi = await p.evaluate(() => ({ dl: !!document.querySelector('dialog.ait-dlg [data-ait-dl]'), why: document.querySelector('dialog.ait-dlg .ait-eng.is-on .ait-why')?.textContent || '' }));
        await p.check('dialog.ait-dlg [data-ait-dl]'); await p.click('dialog.ait-dlg [data-ait-go]');
        await p.waitForFunction(() => /Ollama/.test(document.querySelector('dialog.ait-dlg .ait-done')?.textContent || ''), null, { timeout: 40000 }); await sleep(300);
        out.qwenDone = await p.evaluate(() => document.querySelector('dialog.ait-dlg .ait-done').textContent.replace(/\s+/g, ' '));
        out.qwenArgs = fs.readFileSync(argsLog, 'utf8').trim().split('\n').map(l => JSON.parse(l)).filter(a => a.includes('--engine'));
        const ol = await p.$('dialog.ait-dlg .ait-done [data-ait-ollama]'); if (ol) { await ol.click(); await sleep(800); }
        out.ollamaMsg = await p.evaluate(() => [...document.querySelectorAll('.ui-toast')].map(t => t.textContent).join(' | '));
        await p.evaluate(() => document.querySelector('dialog.ait-dlg [data-ait-x]').click());
        // à 390 px : rien ne déborde (la bande du registre, la règle, la recherche)
        await closeAct();
        await p.setViewportSize({ width: 390, height: 800 }); await openAct(seed.a1); await sleep(400);
        out.overflow = await p.evaluate(d => [...document.querySelectorAll(`${d} [data-ais-strip], ${d} .aip-pill, ${d} [data-aic]`)].filter(e => !e.hidden && e.scrollWidth > e.clientWidth + 2).map(e => e.className), D);
        out.errs = errs;
    } finally { await browser.close(); proc.kill(); fake.close(); }
}

(async () => {
    if (!chromium) { console.log('Playwright absent : essai sauté.'); process.exit(0); }
    const out = {};
    try { await main(out); } catch (e) { if (process.env.DEBUG) fs.writeFileSync(process.env.DEBUG_OUT || '/dev/stdout', JSON.stringify(out, null, 1)); throw e; }
    const S = out.seed;
    const checks = [
        ['📏 39 : le bouton 📏 dans la barre de l’image, éteint au départ', () => { assert.equal(out.regleBtn, true); assert.equal(out.regleOffBand, 'none'); }],
        ['📏 39 : allumée, la bande suit la ligne du curseur (sa zone, agrandie pour les jambages), le reste assombri ; retenu', () => {
            const z = ZONES[2]; assert.equal(out.regleOn.on, '1'); assert.equal(out.regleOn.ls, '1'); assert.equal(out.regleOn.pill, true); assert.match(out.regleOn.d, /^M0 0H1000V520H0Z M/);
            assert.equal(out.band3.est, false); assert.ok(Math.abs(out.band3.y - (z.y - z.h * .25)) <= 1, JSON.stringify(out.band3)); assert.ok(out.band3.h >= z.h * 1.4, JSON.stringify(out.band3)); }],
        ['📏 39 : Entrée en fin de ligne → ligne sans zone : la règle prend la hauteur de la ligne d’avant, juste dessous', () => { const z = ZONES[5]; assert.equal(out.bandEst.est, true); assert.ok(Math.abs(out.bandEst.y - (z.y + z.h - z.h * .25)) <= 1, JSON.stringify(out.bandEst)); }],
        ['📏 39 : ↑ sur l’image : la ligne d’avant, le curseur du texte suit', () => { assert.equal(out.stepUp, LINES[3]); assert.ok(Math.abs(out.bandUp.y - (ZONES[3].y - ZONES[3].h * .25)) <= 1); }],
        ['📏 39 : la force de l’assombrissement, retenue ; Affichage → 📏 Règle de lecture', () => { assert.equal(out.force.op, '0.8'); assert.equal(out.force.ls, '0.8'); assert.ok(out.affichage.some(l => /règle de lecture/i.test(l)), out.affichage.join(',')); }],
        ['⏭ 37 : un acte de recueil : la bande « 📚 BMS Treignac · vue 1 / 3 », ➕ Acte suivant, Vue suivante →, ◀ éteint', () => { assert.equal(out.strip1.hidden, false); assert.match(out.strip1.text, /BMS Treignac 1780-1792 · vue 1 \/ 3/); assert.match(out.strip1.text, /Acte suivant/); assert.equal(out.strip1.view, true); assert.equal(out.strip1.prev, false); }],
        ['⏭ 37 : Édition → 📚 Registre et main… : champs en vert ; Main et cote gardées avec l’acte, la source écrite toute seule', () => {
            assert.ok(out.edition.some(l => /Registre et main/.test(l))); assert.deepEqual(out.regGreen.sort(), ['archive', 'cote', 'hand', 'register', 'total', 'view'].sort());
            assert.match(out.afterReg.source, /BMS Treignac 1780-1792, cote 3 E 271\/4, vue 1 \/ 3/); assert.match(out.afterReg.strip, /✍ Curé J\. LACOMBE/);
            assert.equal(out.saved1.hand, 'Curé J. LACOMBE'); assert.equal(out.saved1.cote, '3 E 271/4'); }],
        ['⏭ 37 : ➕ Acte suivant : même vue, type et année proposés (jour vide), commune, registre, cote, main repris ; zone à tracer sous la dernière', () => {
            assert.equal(out.next.kind, 'bapteme'); assert.equal(out.next.date, '1787'); assert.equal(out.next.place, 'Treignac'); assert.match(out.next.source, /cote 3 E 271\/4, vue 1 \/ 3/);
            assert.equal(out.next.guideY, ZONES[5].y + ZONES[5].h + 4); assert.equal(out.next.tool, 'zone'); assert.match(out.next.strip, /LACOMBE/);
            assert.equal(out.nextIds.length, 2); assert.equal(out.nextSaved.hand, 'Curé J. LACOMBE'); assert.equal(out.nextSaved.cote, '3 E 271/4'); assert.equal(out.regInfoNext.index, 2); assert.equal(out.regInfoNext.prev_act, S.a1);
            // 🔍 « seulement ce registre » : seulement les actes du même recueil
            assert.ok(out.regOnly.register_only && out.regOnly.hits.length > 0, 'des lignes du registre'); assert.ok(out.regOnly.hits.every(h => out.regIds.includes(h.act_id)), 'rien hors du registre'); assert.ok(out.regAll.hits.some(h => !out.regIds.includes(h.act_id)), 'sans le choix : tous les actes'); }],
        ['⏭ 37 : ◀ revient à l’acte d’avant ; Vue suivante → : la vue 2 (son image, « vue 2 / 3 » dans la source)', () => { assert.equal(out.backTitle, 'Baptême de Jean MAZAUD'); assert.match(out.view2.strip, /vue 2 \/ 3/); assert.match(out.view2.src, /vue 2 \/ 3/); assert.match(out.view2.img, /reg2\.png/); }],
        ['⏭ 37 : Alt + ⇧ + → : la vue 3 ; la dernière vue : « Vue suivante » éteinte ; la main suit', () => { assert.equal(out.view3.viewOff, true); assert.equal(out.view3.hand, true); }],
        ['⏭ 37 : une photo isolée : pas de bande, pas d’« Acte suivant » dans Fichier', () => { assert.equal(out.isolated.hidden, true); assert.ok(!out.isolatedFichier.some(l => /Acte suivant/.test(l))); assert.ok(out.isolatedFichier.some(l => /Depuis une adresse IIIF/.test(l))); }],
        ['🌐 40 : une adresse pas IIIF, une adresse locale : refusées avec une phrase claire', () => { assert.match(out.iiifNot.text, /pas une adresse IIIF.*Télécharge la vue/); assert.equal(out.iiifNot.go, false); assert.match(out.iiifLocal.text, /refusée|publique/); assert.equal(out.iiifLocal.go, false); }],
        ['🌐 40 : licence « droits réservés » : on le dit avant d’ouvrir', () => { assert.equal(out.iiifReserve.warn, true); assert.match(out.iiifReserve.text, /Droits réservés/); }],
        ['🌐 40 : titre, nombre de vues, archives, cote, licence ; petites vignettes ; ▶ choisit la vue', () => {
            assert.match(out.iiifOk.text, /BMS Treignac 1780-1792 · 3 vues/); assert.match(out.iiifOk.text, /Archives départementales \(exemple\)/); assert.match(out.iiifOk.text, /cote 3 E 271\/4/); assert.match(out.iiifOk.text, /Licence Ouverte/); assert.equal(out.iiifOk.warn, false);
            assert.ok(out.thumbs.length >= 3 && out.thumbs.every(Boolean), JSON.stringify(out.thumbs)); assert.equal(out.pickN, '2'); }],
        ['🌐 40 : seule la vue choisie est téléchargée ; l’acte reçoit source, cote, vue n / N et ↗ source ; la mention de licence est gardée avec l’image', () => {
            assert.equal(out.mediaAfter1, out.mediaBefore + 1); assert.match(out.iiifAct.source, /BMS Treignac 1780-1792, cote 3 E 271\/4, vue 2 \/ 3/); assert.equal(out.iiifAct.href, 'https://archives.exemple.fr/ark:/123/vue');
            assert.match(out.mediaRow.description, /Licence : Licence Ouverte/); assert.match(out.mediaRow.description, /Archives départementales \(exemple\)/); assert.equal(out.mediaRow.document_reference, '3 E 271/4');
            assert.equal(out.iiifSaved.n, 2); assert.equal(out.iiifSaved.total, 3); assert.equal(out.iiifSaved.manifest, 'https://iiif.test/manifest.json'); }],
        ['🌐 40 : « Vue suivante → » sur un registre IIIF : la vue 3 téléchargée au clic, une seule', () => { assert.equal(out.mediaAfter2, out.mediaAfter1 + 1); assert.deepEqual(out.iiifViews.map(Number), [2, 3]); assert.match(out.iiifView3, /vue 3 \/ 3/); }],
        ['🔤 38 : le sélecteur n’apparaît qu’avec une version modernisée (Outils → 🔤 Texte modernisé…)', () => { assert.equal(out.switchHidden, true); assert.ok(out.outils.some(l => /Texte modernisé/.test(l))); assert.equal(out.modeM.mode, 'm'); assert.equal(out.modeM.editorHidden, true); }],
        ['🔤 38 : 📖 Développer les abréviations (sans IA) : 9bre → novembre, ſ → s ; ↶ Annuler proposé ; le texte fidèle ne change pas', () => { assert.match(out.expanded, /novembre/); assert.doesNotMatch(out.expanded, /ſ/); assert.equal(out.expanded.split('\n').length, LINES.length); assert.equal(out.expandUndo, true); }],
        ['🔤 38 : ◫ Côte à côte ligne pour ligne ; une ligne fidèle changée : « à revoir »', () => { assert.equal(out.sideRows, LINES.length); assert.deepEqual(out.review, [false, true, false, false, false, false]); }],
        ['🔤 38 : gardée avec l’acte (fidèle inchangé, d’où elle vient)', () => { assert.equal(out.modernSaved.from, 'auto'); assert.match(out.modernSaved.text, /novembre/); assert.equal(out.modernSaved.keys.length, LINES.length); }],
        ['🔤 38 : 🤖 Proposer : l’IA locale, ligne pour ligne, sans rien inventer ; Ollama absent → une phrase claire', () => { assert.match(out.ai.text, /MAZAUD, laboureur/); assert.equal(out.ai.text.split('\n').length, LINES.length); assert.match(out.ai.from, /proposée/); assert.match(out.aiPrompt, /exactement 6 lignes/); assert.match(out.aiPrompt, /Ne rien ajouter, ne rien inventer/); assert.match(out.aiDown, /Ollama.*n’est pas lancée/); }],
        ['🔤 38 : « Ajouter à la généalogie » lit le modernisé ; la citation garde le fidèle ; la personne retrouvée dans le texte fidèle', () => { assert.deepEqual(out.found, { modern: true, cite: true, used: true }); assert.equal(out.foundSpan, 'Pierre Mazaud'); assert.equal(out.citeHook, true); }],
        ['🔎 36 : 1 lettre : rien', () => { assert.equal(out.s1?.hidden ?? true, true); }],
        ['🔎 36 : « MAZAUD » : les lignes exactes, mot surligné, vignette de la ligne ; orthographes voisines éteintes au départ ; « bientôt » discret', () => {
            assert.match(out.s2.head, /2 lignes dans 1 acte/); assert.ok(out.s2.hits.every(h => !h.v)); assert.ok(out.s2.hits.every(h => /<mark>Mazaud<\/mark>/.test(h.q)), JSON.stringify(out.s2.hits)); assert.equal(out.s2.near, false); assert.equal(out.s2.soon, true);
            assert.ok(out.s2img.length >= 1 && out.s2img.every(w => w > 0), JSON.stringify(out.s2img)); }],
        ['🔎 36 : ≈ orthographes voisines : Mazeaud, Mazaut en plus, en pointillé ; retenu', () => { const v = out.s3.hits.filter(h => h.v).map(h => h.var.replace(/^≈\s*/, '')); assert.ok(v.includes('Mazeaud') && v.includes('Mazaut'), JSON.stringify(out.s3)); assert.equal(out.s3.ls, '1'); assert.equal(out.s5.near, true); assert.ok(out.s5.hits.some(h => h.v)); }],
        ['🔎 36 : la recherche regarde aussi le texte modernisé ; « N actes · N lignes » en haut', () => { assert.ok(out.s4.hits.length >= 1, JSON.stringify(out.s4)); assert.match(out.s4.hits[0].q, /<mark>laboureur<\/mark>/); assert.match(out.count, /actes? · \d+ lignes?/); }],
        ['🔎 36 : un clic ouvre l’acte, le curseur sur le mot ; Édition → 🔎 Chercher dans tous les actes', () => { assert.equal(out.opened.title, 'Sépulture d’Anne MAZEAUD'); assert.equal(out.opened.sel, 'Mazeaud'); assert.ok(out.ateliers.some(l => /Chercher dans tous les actes/.test(l))); }],
        ['🔎 36 : un acte supprimé sort de l’index', () => assert.equal(out.afterDelete, 0)],
        ['🎓 35 : l’ordinateur : sans carte graphique, Qwen déconseillé (Kraken suffit) ; sur Mac « pas garanti »', () => { assert.equal(out.stNoGpu.qwen.why, 'gpu'); assert.equal(out.stNoGpu.qwen.gpu_ok, false); assert.equal(out.stNoGpu.kraken.ready, true); assert.equal(out.stMac.qwen.why, 'mac'); assert.equal(out.stMac.machine.gpu.kind, 'apple'); }],
        ['🎓 35 : refus clairs : trop peu de lignes, pas de main, Qwen sans la case « Télécharger une fois »', () => { assert.match(out.tooFew.error, /Pas assez de lignes relues/); assert.match(out.noHand.error, /Choisis la main/); assert.match(out.qwenNoDl.error, /Télécharger une fois le modèle de départ/); }],
        ['🎓 35 : la fenêtre : la machine, les mains (« Main » à remplir, encore 90), la main de l’acte choisie, ⚡ Kraken conseillé et coché', () => {
            assert.match(out.dlg.machine, /Linux.*RTX 3060.*12 Go.*Kraken prêt/); assert.ok(out.dlg.rows.some(r => /Curé J\. LACOMBE.*60 \/ 150 conseillées.*encore 90/.test(r)), out.dlg.rows.join(' | ')); assert.ok(out.dlg.rows.some(r => /Main inconnue.*« Main » à remplir/.test(r)));
            assert.equal(out.dlg.sel, 'Curé J. LACOMBE'); assert.equal(out.dlg.go, true); assert.match(out.dlg.how, /1 ligne sur 10/); assert.deepEqual(out.dlg.engines, ['kraken:true', 'qwen:false']); }],
        ['🎓 35 : en tâche de fond : passe n / N, temps restant ; un seul entraînement à la fois', () => { assert.match(out.running, /passe \d+ \/ 30/); assert.match(out.running, /Arrêter/); assert.match(out.busy.error, /déjà en cours/); }],
        ['🎓 35 : ketos : test (départ) → train (depuis le modèle installé, --resize union, cpu… non : cuda) → test (nouveau)', () => {
            const [a, b, c] = out.args; assert.equal(a[0], 'test'); assert.ok(a.includes('-m') && a[a.indexOf('-m') + 1].endsWith('mccatmus-fr-en.mlmodel'));
            assert.equal(b[0], 'train'); assert.deepEqual([b[b.indexOf('-i') + 1].endsWith('mccatmus-fr-en.mlmodel'), b[b.indexOf('--resize') + 1], b[b.indexOf('-N') + 1], b[b.indexOf('-d') + 1], b[b.indexOf('-f') + 1]], [true, 'union', '30', 'cuda:0', 'path']);
            assert.equal(c[0], 'test'); assert.match(c[c.indexOf('-m') + 1], /out\/model_best\.mlmodel$/); }],
        ['🎓 35 : 1 ligne sur 10 mise de côté, jamais dans l’entraînement ni la validation ; chaque image a son texte juste', () => {
            assert.equal(out.split.held.length, 6); assert.ok(out.split.held.every(f => !out.split.train.includes(f) && !out.split.val.includes(f))); assert.equal(out.split.train.length + out.split.val.length, 54); assert.match(out.gt, /^Ligne \d+ du registre, Léonard Chassagne, tisserand$/); }],
        ['🎓 35 : fini : les images des lignes découpées et les fichiers de travail sont effacés ; restent l’état et un petit journal', () => {
            assert.ok(out.jobLeft.includes('status.json') && out.jobLeft.includes('train.log'), 'l’état et le journal restent : ' + out.jobLeft);
            assert.deepEqual(out.jobLeft.filter(f => ['train', 'heldout', 'out', 'train.txt', 'val.txt', 'heldout.txt'].includes(f)), [], 'images des lignes et fichiers de travail effacés : ' + out.jobLeft); }],
        ['🎓 35 : fini : avant → après sur les lignes mises de côté ; « Main de Curé J. LACOMBE » rangé avec les modèles et choisi pour son registre (↶ Annuler)', () => {
            assert.match(out.done.text, /Avant : 81,2 % → après : 93,4 %/); assert.match(out.done.text, /sur 6 lignes jamais vues/); assert.match(out.done.toast, /Main de Curé J\. LACOMBE.*lu désormais pour 1 registre/);
            const m = out.models.find(x => x.engine === 'kraken'); assert.ok(m && /^lcnda-cure-j-lacombe-[0-9a-f]{6}\.mlmodel$/.test(m.file), JSON.stringify(out.models)); assert.equal(m.before, 81.2); assert.equal(m.after, 93.4);
            assert.deepEqual(Object.values(out.assigned), [m.file]); }],
        ['🎓 35 : « ✨ Lire l’acte » prend le modèle du registre (ext.txModelFor) ; ↶ Annuler remet le modèle de départ', () => { assert.equal(out.modelFor, out.models.find(x => x.engine === 'kraken').file); assert.equal(out.runHtrHook, true); assert.equal(out.undoAssign.ok, true); assert.equal(Number(out.assignedAfterUndo), 0); }],
        ['🎓 35 : ■ Arrêter : le meilleur état atteint est gardé', () => assert.match(out.cancelled, /Arrêté : le meilleur état atteint est gardé/)],
        ['🎓 35 : 🧠 Qwen (faux Unsloth) : case « Télécharger une fois », LoRA sur les lignes, avant → après, export Ollama ; sans Ollama : une phrase claire', () => {
            assert.equal(out.qwenUi.dl, true); assert.match(out.qwenDone, /Avant : 71,5 % → après : 88 %/); assert.match(out.qwenDone, /Ajouter à Ollama/);
            const q = out.qwenArgs.at(-1); assert.equal(q[q.indexOf('--base') + 1], 'unsloth/Qwen2.5-VL-3B-Instruct-bnb-4bit'); assert.ok(q[q.indexOf('--heldout') + 1].endsWith('heldout.txt'));
            assert.match(out.ollamaMsg, /Ollama n’est pas installé|Ajouté à Ollama/); }],
        ['à 390 px : la bande du registre, la règle et le sélecteur ne débordent pas', () => assert.deepEqual(out.overflow, [])],
        ['aucune erreur JS', () => assert.deepEqual(out.errs, [])],
    ];
    let failed = 0;
    for (const [name, fn] of checks) { try { fn(); console.log('  ✓', name); } catch (e) { failed++; console.log('  ✗', name, '\n   ', e.message); } }
    console.log('  (non vérifié ici : le vrai Kraken / Unsloth et le vrai site des Archives — imités)');
    console.log(failed ? `${failed} échec(s)` : `${checks.length} vérifications réussies`);
    process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
