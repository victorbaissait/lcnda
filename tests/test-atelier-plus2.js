'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 📜 Atelier de transcription, outils en plus (2) : node tests/test-atelier-plus2.js   (SHOTS=dossier pour garder des captures)
 *  1. Sans navigateur : heritage-atelier-plus2-data.js (mots d'autrefois sourcés, mon glossaire d'abord, latin des registres et ses
 *     formules, lignes à lire, fiche de seconde lecture, objectif du jour, résumé, habitudes d'une main), la règle (bande libre,
 *     hauteur), la mesure qui change d'une région à l'autre (app-montants-core.js) ; côté serveur : data.summary et data.letters
 *     nettoyés, le relevé (nom / prénom, parents, parrain, témoins, cote, vue), la vie privée (vivants, confidentiels, moins de 75 ans).
 *  2. Navigateur (Playwright, sinon sauté) :
 *     12 📏 la règle : le curseur « hauteur » agrandit la bande ; un acte sans zone : la bande libre qui descend ligne à ligne (↓) ;
 *     13 🔍 la loupe : taille et grossissement de ⚙️ Personnaliser, « Mieux voir seulement dans la loupe » (l'image reste telle quelle) ;
 *     14 ✍️ ce scribe : ✂️ découper une lettre, la nommer, ↶ Annuler, gardée ; vue dans un autre acte de la même main (vignette JPEG) ;
 *        montrée sous le texte quand on hésite (« Ma?aud ») ;
 *     15 🔊 lire à voix haute (voix imitée) : ligne à ligne, la ligne choisie dans le texte, vitesse, ■ ; sans voix française : dit ;
 *     16 📖 les mots d'autrefois soulignés, la bulle et sa source ; mon glossaire passe avant (abréviation et mot d'autrefois) ;
 *     17 💰 la bulle d'une mesure dit qu'elle variait selon la région ; 🧰 « Montants et mesures de cet acte » ;
 *     18 🏛 un acte en latin : mots soulignés, bulle + source, 🧰 la liste à chercher et les formules repérées ;
 *     19 🧾 le résumé : à la main, 🤖 proposé par un (faux) Ollama, relu, gardé, dans l'export texte ; Ollama absent : une phrase claire ;
 *     20 👥 seconde lecture : nom, texte, gardée comme lecture « 👥 Lecture de … », ⚖️ comparaison ouverte ; fiche vierge téléchargée ;
 *     21 🎯 objectif du jour : éteint au départ, une ligne écrite → atteint, la pile et « Acte suivant de la pile », un seul rappel ;
 *     22 📋 relevé : la fenêtre (Cet acte / Ce registre / Tous), les laissés de côté, puis la fenêtre d'export commune (CSV) ;
 *     23 📚 registre entier : « Acte suivant » reprend les réglages « Mieux voir » ; les abréviations fréquentes de la main ;
 *     menus (Fichier, Édition, Outils), ⚙️ Personnaliser, 390 px sans débordement, sombre, aucune erreur JS.
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
let failed = 0, count = 0;
const checks = [];
const check = (name, fn) => checks.push([name, fn]);

/* ═════ 1. sans navigateur ═════ */
const X = require('../assets/js/heritage-atelier-plus2-data.js');
const AL = require('../assets/js/app-aide-lecture.js');
global.window = global.window || { LCNDA_EXT: {} };
require('../assets/js/heritage-calendar-more.js');
const CM = window.LCNDA_EXT.calendarMore;
window.LCNDA_AUTREFOIS = require('../assets/js/app-autrefois-engine.js');
const MT = require('../assets/js/app-montants-core.js');
const LA = AL.allEntries().filter(e => e.lang === 'la');

check('📖 16 : chaque mot d’autrefois a un sens et une source (CNRTL ou Wikipédia, en https)', () => {
    assert.ok(X.MOTS.length >= 20);
    X.MOTS.forEach(m => { assert.ok(m.d && m.d.length > 8, m.forms[0]); assert.match(m.url, /^https:\/\/(www\.cnrtl\.fr\/definition\/|fr\.wikipedia\.org\/wiki\/)/); assert.ok(['CNRTL', 'Wikipédia'].includes(m.src)); });
    for (const w of ['laboureur', 'journalier', 'feue', 'susdit', 'défunt', 'veuf', 'manouvrier', 'ménager']) assert.ok(X.MOTS.some(m => m.forms.includes(w)), w);
});
check('📖 16 : scanMots trouve les mots (et « fils naturel »), « feu » seulement devant un nom, mon glossaire passe avant', () => {
    const t = 'fils de feu Pierre MAZAUD laboureur et de la veuve Marie LACOMBE ; le feu a pris ; fils naturel ; la susdite Anne';
    const w = X.scanMots(t).map(h => h.word);
    assert.deepEqual(w, ['feu', 'laboureur', 'veuve', 'fils naturel', 'susdite']);
    assert.ok(!X.scanMots(t, [{ w: 'veuve', m: 'ma définition' }]).some(h => h.word === 'veuve'));
    const g = X.scanGlo('le pnt. Jean, pnt', [{ w: 'pnt', m: 'présent' }]); assert.equal(g.length, 2); assert.equal(g[0].glo.m, 'présent');
});
check('🏛 18 : le latin des registres (la.js) : mots et expressions, formules entières ; un texte français n’est pas souligné', () => {
    const idx = X.latinIndex(LA), t = 'Anno Domini millesimo die decima mensis Januarii baptizatus est Joannes filius legitimus Petri MAZAUD et Annae LACOMBE conjugum. Patrinus fuit Joannes DURAND. obiit et sepultus est';
    const hits = X.scanLatin(t, idx).map(h => h.word);
    for (const w of ['baptizatus est', 'filius', 'legitimus', 'Patrinus', 'obiit', 'sepultus est']) assert.ok(hits.includes(w), w + ' : ' + hits);
    assert.deepEqual(X.scanLatin('Le douze mars a été baptisé Jean fils de Pierre MAZAUD', idx), []);
    assert.ok(X.latinFormulas(t, LA).some(e => /die … mensis/.test(e.t)), 'la formule « Anno Domini … die … mensis … »');
});
check('🔊 15 : les lignes à lire (sans lignes vides ni repères de page), [?] dit « mot illisible »', () => {
    const L = X.readLines('Le douze\n\n— page 2 —\n  du mois [?] de mars  ');
    assert.deepEqual(L.map(l => l.text), ['Le douze', 'du mois [?] de mars']); assert.equal(L[1].s, 'Le douze\n\n— page 2 —\n  '.length);
    assert.equal(X.speakable('du mois [?] de ſept'), 'du mois mot illisible de sept');
});
check('👥 20 : la fiche vierge numérotée et sa relecture (le lecteur, les lignes) ; le nom de la lecture gardée', () => {
    const pk = X.packageText({ title: 'Baptême de Jean MAZAUD', lines: 3, reader: 'Anne DURAND' });
    assert.match(pk, /^LCNDA — Seconde lecture/); assert.match(pk, /\n001 \| \n002 \| \n003 \| \n$/);
    const r = X.parsePackage(pk.replace('001 | ', '001 | Le douze').replace('003 | ', '003 | fin'));
    assert.deepEqual(r, { reader: 'Anne DURAND', body: 'Le douze\n\nfin' });
    assert.equal(X.parsePackage('juste un texte\ncollé').body, 'juste un texte\ncollé');
    assert.equal(X.readerSource('Anne <b>DURAND</b>'), 'reader:Anne bDURANDb');
});
check('🎯 21 : l’objectif du jour (éteint au départ, lignes ou actes)', () => {
    assert.equal(X.cleanGoal(X.GOAL_DEFAULT).on, false);
    const d = X.dayKey(new Date(2026, 10, 28)); assert.equal(d, '2026-11-28');
    assert.deepEqual(X.goalStatus({ on: true, unit: 'line', n: 3 }, { [d]: { l: { 4: 1, 5: 1 } } }, d), { unit: 'line', target: 3, done: 2, reached: false });
    assert.equal(X.goalStatus({ on: true, unit: 'act', n: 1 }, { [d]: { a: [4, 4] } }, d).reached, true);
});
check('🧾 19 : le résumé en 3 lignes ; ✍️ 23 : les abréviations fréquentes d’une main', () => {
    assert.deepEqual(X.summaryLines({ who: 'Jean MAZAUD', what: 'baptême', when: '12 nov. 1787', where: 'Treignac' }), ['Qui : Jean MAZAUD', 'Quoi : baptême', 'Quand, où : 12 nov. 1787 · Treignac']);
    const h = X.habitsOf(['Pierre MAZAUD labr', 'Jean DURAND labr et led. Jean', 'led. Pierre'], t => AL.abbrevs(t, ''));
    assert.deepEqual(h.map(x => [x.word, x.n]), [['labr', 2], ['led.', 2]]);
});
check('17 💰 : une mesure qui variait selon la région le dit (avec la région prise)', () => {
    const h = MT.scan('un arpent et demi de pré')[0], x = MT.explain(h, { region: 'paris', calendarMore: CM });
    assert.ok(x.lines.some(l => /changeait d’une région à l’autre/.test(l)), JSON.stringify(x.lines));
});
check('📏 12 : la règle — bande libre (sans zone) et hauteur réglable', () => {
    global.window.LCNDA_EXT = global.window.LCNDA_EXT || {};
    const src = fs.readFileSync(path.join(appRoot, 'assets/js/heritage-atelier-regle.js'), 'utf8');
    const R = new Function('window', `${src}; return window.LCNDA_EXT.txRegle;`)({ LCNDA_EXT: {} });
    assert.deepEqual(R.freeBand(1000, 560, 0), { x: 0, y: 560 * .06, w: 1000, h: 20, est: true, free: true });
    assert.equal(R.freeBand(1000, 560, 3).y, 560 * .06 + 60);
    assert.equal(Math.round(R.padOf(40, 1)), 10); assert.equal(Math.round(R.padOf(40, 2)), 40); assert.equal(Math.round(R.padOf(40, .7)), 1);
});

async function browserPart(out) {
    const phpPath = findPhp([devBundledPhp()]);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-plus2-'));
    const dir = path.join(tmp, 'data'); fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
    const env = { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4', GENEALOGY_TEST: '1' };
    const php = (code, extra = {}) => { const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], { cwd: appRoot, encoding: 'utf8', env: { ...env, ...extra } }); if (r.status !== 0) throw new Error(r.stderr || r.stdout); return r.stdout; };
    const BODY = ['L’an mil sept cent quatre vingt sept et le douze', 'du mois de 9bre a été baptisé Jean fils légitime', 'de Pierre Ma?aud laboureur et de Marie Lacombe', 'sa femme, parrain Jean Durand labr, marraine', 'Anne Mazaud, un arpent de pré ; feu Léonard Mazaud', 'Lacombe curé'].join('\n');
    const LAT = ['Anno Domini millesimo septingentesimo die decima mensis Januarii', 'baptizatus est Joannes filius legitimus Petri Mazaud', 'et Annae Lacombe conjugum. Patrinus fuit Joannes Durand'].join('\n');
    const zones = body => { const Z = []; let at = 0; body.split('\n').forEach((l, i) => { Z.push({ id: 'z' + i, x: 40, y: 40 + i * 60, w: 900, h: 44, s: at, e: at + l.length }); at += l.length + 1; }); return Z; };
    /* ─── la base : un recueil de 2 vues (même main), un acte en latin, un acte sans zone, des actes pour le relevé et la vie privée ─── */
    const seed = JSON.parse(php(String.raw`require 'lib/paths.php'; $p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; require 'tests/api_functions.php'; require_once 'lib/recueils.php'; $pdo = db(); act_transcriptions_ensure($pdo);
save_person($pdo, ['first_name' => 'Jean', 'last_name' => 'MAZAUD', 'gender' => 'male']);
$liv = (int) save_person($pdo, ['first_name' => 'Paul', 'last_name' => 'DURAND', 'gender' => 'male'])['id']; $pdo->exec("UPDATE persons SET living_status='living' WHERE id=$liv");
$img = function (string $name, int $w, int $h, int $bands) { $im = imagecreatetruecolor($w, $h); imagefill($im, 0, 0, imagecolorallocate($im, 236, 226, 200)); $ink = imagecolorallocate($im, 70, 50, 30);
    for ($b = 0; $b < $bands; $b++) { $y = 40 + $b * 60; for ($x = 50; $x < $w - 60; $x += 7) { imagefilledrectangle($im, $x, $y + 10 + ($x % 5), $x + 3, $y + 30, $ink); } } imagepng($im, MEDIA_DIR . '/' . $name); };
foreach (['reg1.png', 'reg2.png', 'lat.png', 'nozone.png'] as $f) { $img($f, 1000, 560, 6); }
$m = []; foreach (['reg1.png', 'reg2.png', 'lat.png', 'nozone.png'] as $f) { $pdo->prepare("INSERT INTO media(title, media_type, filename) VALUES(?, 'image', ?)")->execute([$f, $f]); $m[$f] = (int) $pdo->lastInsertId(); }
$r = save_recueil($pdo, ['title' => 'BMS Treignac 1780-1792']); $rid = (int) $r['id'];
$vid = (int) $pdo->query("SELECT id FROM recueil_versions WHERE recueil_id=$rid ORDER BY id LIMIT 1")->fetchColumn();
if (!$vid) { $vid = (int) save_recueil_version($pdo, ['recueil_id' => $rid, 'name' => 'Original'])['id']; }
recueil_add_images($pdo, ['recueil_id' => $rid, 'version_id' => $vid, 'mode' => 'new_pages', 'media_ids' => [$m['reg1.png'], $m['reg2.png']]]);
$ins = function (array $a) use ($pdo) { $pdo->prepare('INSERT INTO act_transcriptions(title, kind, media_id, date_text, place, source, body, data_json) VALUES(?,?,?,?,?,?,?,?)')->execute([$a['title'], $a['kind'], $a['media'] ?? null, $a['date'] ?? '', $a['place'] ?? '', '', $a['body'], json_encode($a['data'] ?? ['zones' => []], JSON_UNESCAPED_UNICODE)]); return (int) $pdo->lastInsertId(); };
$reg = ['register' => 'BMS Treignac 1780-1792', 'cote' => '3 E 271/4', 'hand' => 'Curé J. LACOMBE', 'view' => 1, 'total' => 2];
$a1 = $ins(['title' => 'Baptême de Jean MAZAUD', 'kind' => 'bapteme', 'media' => $m['reg1.png'], 'date' => '12 nov. 1787', 'place' => 'Treignac (19)', 'body' => getenv('TX_BODY'), 'data' => ['zones' => json_decode(getenv('TX_ZONES'), true), 'people' => [], 'status' => 'doing', 'reg' => $reg,
    'gabarit' => ['kind' => 'bapteme', 'fields' => ['enfant' => ['v' => 'Jean MAZAUD', 's' => -1, 'e' => -1], 'pere' => ['v' => 'Pierre MAZAUD, laboureur', 's' => -1, 'e' => -1], 'mere' => ['v' => 'Marie LACOMBE', 's' => -1, 'e' => -1], 'parrain' => ['v' => 'Jean DURAND, labr', 's' => -1, 'e' => -1], 'marraine' => ['v' => 'Anne MAZAUD', 's' => -1, 'e' => -1]]]]]);
$a2 = $ins(['title' => 'Sépulture de Léonard MAZAUD', 'kind' => 'sepulture', 'media' => $m['reg2.png'], 'date' => '3 mars 1788', 'place' => 'Treignac', 'body' => "Le trois mars a été inhumé Léonard Mazaud labr\nen présence de Jean Durand labr et led. Pierre", 'data' => ['zones' => [], 'status' => 'todo', 'reg' => ['hand' => 'Curé J. LACOMBE', 'register' => 'BMS Treignac 1780-1792', 'cote' => '3 E 271/4', 'view' => 2, 'total' => 2],
    'people' => [['name' => 'Léonard MAZAUD', 'role' => 'defunt', 's' => 0, 'e' => 0, 'person_id' => 0], ['name' => 'Jean DURAND', 'role' => 'temoin', 's' => 0, 'e' => 0, 'person_id' => 0], ['name' => 'Pierre MAZAUD', 'role' => 'temoin', 's' => 0, 'e' => 0, 'person_id' => 0]],
    'letters' => [['id' => 'Lold1', 'x' => 60, 'y' => 50, 'w' => 30, 'h' => 30, 'label' => 'd']]]]);
$a3 = $ins(['title' => 'Baptisma Joannis', 'kind' => 'bapteme', 'media' => $m['lat.png'], 'date' => '10 janv. 1700', 'place' => 'Treignac', 'body' => getenv('TX_LAT'), 'data' => ['zones' => [], 'status' => 'done']]);
$a4 = $ins(['title' => 'Acte sans zone', 'kind' => 'bapteme', 'media' => $m['nozone.png'], 'date' => '1790', 'place' => 'Treignac', 'body' => "première ligne\ndeuxième ligne\ntroisième ligne", 'data' => ['zones' => [], 'status' => 'todo']]);
$a5 = $ins(['title' => 'Naissance de Paul DURAND', 'kind' => 'naissance', 'date' => '4 mai 1990', 'place' => 'Tulle', 'body' => 'Paul DURAND né le 4 mai 1990', 'data' => ['zones' => [], 'status' => 'todo', 'people' => [['name' => 'Paul DURAND', 'role' => 'sujet', 's' => 0, 'e' => 11, 'person_id' => $liv]]]]);
$a6 = $ins(['title' => 'Naissance récente', 'kind' => 'naissance', 'date' => '1 juin 1985', 'place' => 'Tulle', 'body' => 'Marie MAZAUD née', 'data' => ['zones' => [], 'status' => 'todo']]);
// le nettoyage côté serveur (data.summary, data.letters)
require_once 'lib/atelier_plus2_data.php';
$clean = txp2_clean_extra(['summary' => ['who' => "  Jean\u{0000} MAZAUD ", 'what' => str_repeat('x', 400), 'from' => 'ai', 'ok' => 1, 'evil' => '<b>'], 'letters' => [['id' => 'L<1>', 'x' => 'a', 'y' => 2, 'w' => 10, 'h' => 12, 'label' => 's'], ['id' => 'L2', 'w' => 1, 'h' => 1, 'label' => 'x'], ['id' => 'L3', 'w' => 10, 'h' => 10, 'label' => '']]]);
require_once 'lib/atelier_plus2.php';
echo json_encode(['m' => $m, 'a1' => $a1, 'a2' => $a2, 'a3' => $a3, 'a4' => $a4, 'a5' => $a5, 'a6' => $a6, 'clean' => $clean, 'split' => [txp2_split_name('feu Pierre MAZAUD, laboureur'), txp2_split_name('Jean de LA COMBE'), txp2_split_name('Marie Lacombe')]], JSON_UNESCAPED_UNICODE);`, { TX_BODY: BODY, TX_ZONES: JSON.stringify(zones(BODY)), TX_LAT: LAT }));
    out.seed = seed;
    /* ─── un faux Ollama (🧾 Proposer) ─── */
    const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    let ollamaUp = true; const prompts = [];
    const fake = http.createServer((req, res) => {
        let body = ''; req.on('data', c => { body += c; }); req.on('end', () => {
            if (!ollamaUp) { res.statusCode = 503; res.end('{}'); return; }
            if (req.url === '/api/version') { res.end(JSON.stringify({ version: '0.12.0' })); return; }
            if (req.url === '/api/tags') { res.end(JSON.stringify({ models: [{ name: 'qwen3-vl:8b-instruct', size: 1 }] })); return; }
            if (req.url === '/api/chat') { try { prompts.push(JSON.parse(body)); } catch (_) {} res.setHeader('Content-Type', 'application/x-ndjson');
                res.end(JSON.stringify({ message: { content: JSON.stringify({ who: 'Jean MAZAUD, fils de Pierre MAZAUD et de Marie LACOMBE', what: 'baptême', when: '12 novembre 1787', where: 'Treignac' }) }, done: false }) + '\n' + JSON.stringify({ message: { content: '' }, done: true }) + '\n'); return; }
            res.statusCode = 404; res.end('{}');
        });
    });
    const oport = await freePort(); await new Promise(r => fake.listen(oport, '127.0.0.1', r));
    const port = await freePort(), base = `http://127.0.0.1:${port}/`;
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env: { ...env, LCNDA_OLLAMA_URL: `http://127.0.0.1:${oport}` }, stdio: 'ignore' });
    const browser = await chromium.launch();
    try {
        for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
        const ctxB = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
        const p = await ctxB.newPage(); const errs = [];
        p.on('pageerror', e => errs.push(e.message));
        p.on('console', m => { if (m.type() === 'error' && process.env.DEBUG) console.log('console:', m.text()); });
        // 🔊 une voix imitée (speechSynthesis) : on note ce qui est dit ; sans voix française d'abord
        await p.addInitScript(() => {
            window.LCNDA_SHEET_LAZY_OFF = true;
            window.__said = []; window.__voices = [{ name: 'English', lang: 'en-US' }];
            window.SpeechSynthesisUtterance = function (t) { this.text = t; };
            Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { getVoices: () => window.__voices, addEventListener() {}, cancel() { window.__cancels = (window.__cancels || 0) + 1; }, speak(u) { window.__said.push({ text: u.text, lang: u.lang, rate: u.rate, voice: u.voice?.name || '' }); window.__last = u; } } });
        });
        await p.goto(base);
        await p.waitForFunction(() => window.LCNDA_EXT?.openActTranscriber && window.LCNDA_EXT?.txPlus2Data && window.LCNDA_EXT?.txHoverMore?.length && window.LCNDA_APP?.state?.csrf && window.LCNDA_AIDE_LECTURE, null, { timeout: 30000 });
        await p.evaluate(() => { try { Object.keys(localStorage).filter(k => /^genealogie-tx-/.test(k)).forEach(k => localStorage.removeItem(k)); localStorage.setItem('genealogie-tx-aides', '0'); } catch (_) {} });
        const api = (a, q = {}) => p.evaluate(([x, y]) => window.LCNDA_APP.api(x, y).then(r => r, e => ({ error: e.message })), [a, q]);
        const D = 'dialog.h-tx-dlg';
        const openAct = async id => { await p.evaluate(i => window.LCNDA_EXT.openActTranscriber({ id: i }), id); await p.waitForFunction(d => document.querySelector(`${d} [data-tx-img]`)?.getAttribute('href') && document.querySelector(`${d} [data-ap2-row]`), D, { timeout: 15000 }); await sleep(600); };
        const closeAct = async () => { await p.evaluate(d => document.querySelector(`${d} [data-tx-cmd="close"]`)?.click(), D); await sleep(300);
            await p.evaluate(() => { const b = [...document.querySelectorAll('dialog[open] button')].find(x => /Fermer sans/.test(x.textContent)); b?.click(); }); await sleep(400); };
        const menuLabels = async m => { await p.click(`${D} [data-ui-menu="${m}"]`); await sleep(150); const l = await p.evaluate(() => [...document.querySelectorAll('.ui-actmenu [role="menuitem"]')].map(b => b.textContent.replace(/\s+/g, ' ').trim())); await p.keyboard.press('Escape'); await sleep(150); return l; };
        const menu = async (m, label) => { await p.click(`${D} [data-ui-menu="${m}"]`); await sleep(150); const ok = await p.evaluate(l => { const b = [...document.querySelectorAll('.ui-actmenu [role="menuitem"]')].find(x => x.textContent.includes(l)); if (b) b.click(); else document.body.click(); return !!b; }, label); await sleep(300); return ok; };
        const caret = (needle, off = 0) => p.evaluate(([d, n, o]) => { const a = document.querySelector(`${d} [data-tx-body]`); const s = a.value.indexOf(n) + o; a.focus(); a.setSelectionRange(s, s); a.dispatchEvent(new Event('select')); a.dispatchEvent(new Event('keyup')); }, [D, needle, off]);
        const setBody = v => p.evaluate(([d, x]) => { const a = document.querySelector(`${d} [data-tx-body]`); a.value = x; a.dispatchEvent(new Event('input', { bubbles: true })); }, [D, v]);
        const save = async () => { await p.evaluate(d => document.querySelector(`${d} [data-tx-cmd="save"]`).click(), D); await sleep(900); };
        const top = () => p.evaluate(() => [...document.querySelectorAll('dialog[open]')].at(-1)?.className || '');
        const shot = async n => { if (process.env.SHOTS) { fs.mkdirSync(process.env.SHOTS, { recursive: true }); await p.screenshot({ path: path.join(process.env.SHOTS, n) }); } };
        const hoverTip = needle => p.evaluate(([d, n]) => { const sp = [...document.querySelectorAll(`${d} .h-tx-mirror :is(.h-tx-ab, .h-tx-ab2)`)].find(s => s.textContent === n); if (!sp) return null; const r = sp.getClientRects()[0]; const a = document.querySelector(`${d} [data-tx-body]`);
            a.dispatchEvent(new MouseEvent('mousemove', { clientX: r.left + 2, clientY: r.top + r.height / 2, bubbles: true })); return { cls: sp.className }; }, [D, needle]);
        const tipNow = async () => { await sleep(150); return p.evaluate(d => { const t = document.querySelector(`${d} [data-tx-abtip]`); return t && !t.hidden ? { html: t.innerHTML, text: t.textContent.replace(/\s+/g, ' ') } : null; }, D); };

        /* ═════ 16 📖 17 💰 au survol ; menus ; Personnaliser ═════ */
        await openAct(seed.a1);
        out.spans = await p.evaluate(d => [...document.querySelectorAll(`${d} .h-tx-mirror :is(.h-tx-ab, .h-tx-ab2)`)].map(s => [s.textContent, s.className.replace(/h-tx-ab2?/, '').trim()]), D);
        out.hovLab = await hoverTip('laboureur'); out.tipLab = await tipNow();
        out.hovFeu = await hoverTip('feu'); out.tipFeu = await tipNow();
        out.hovArp = await hoverTip('un arpent'); out.tipArp = await tipNow();
        // 📖 mon glossaire passe avant : « labr » (une abréviation connue) et « laboureur » (un mot d'autrefois)
        await p.evaluate(() => { localStorage.setItem('genealogie-tx-glossaire', JSON.stringify([{ w: 'labr', m: 'laboureur (mon mot)' }, { w: 'laboureur', m: 'paysan à charrue (ma note)' }])); window.dispatchEvent(new CustomEvent('lcnda-txbar-change')); }); await sleep(300);
        out.spansGlo = await p.evaluate(d => [...document.querySelectorAll(`${d} .h-tx-mirror :is(.h-tx-ab, .h-tx-ab2)`)].filter(s => /labr|laboureur/.test(s.textContent)).map(s => [s.textContent, s.className.replace(/h-tx-ab2?/, '').trim()]), D);
        await hoverTip('labr'); out.tipGlo = await tipNow();
        await p.evaluate(() => { localStorage.removeItem('genealogie-tx-glossaire'); window.dispatchEvent(new CustomEvent('lcnda-txbar-change')); }); await sleep(200);
        out.fichier = await menuLabels('Fichier'); out.edition = await menuLabels('Édition'); out.outils = await menuLabels('Outils');
        // ⚙️ Personnaliser : les réglages en plus ; éteindre les mots d'autrefois
        await p.evaluate(d => document.querySelector(`${d} [data-tx-cmd="barcfg"]`)?.click(), D); await sleep(300);
        out.prefs = await p.evaluate(() => [...document.querySelectorAll('dialog.h-txb-dlg [data-ap2-pref]')].map(i => `${i.dataset.ap2Pref}:${i.type === 'checkbox' ? i.checked : i.value}`));
        await p.evaluate(() => { const i = document.querySelector('dialog.h-txb-dlg [data-ap2-pref="mots"]'); i.checked = false; i.dispatchEvent(new Event('change', { bubbles: true })); }); await sleep(300);
        out.motsOff = await p.evaluate(d => ({ ls: localStorage.getItem('genealogie-tx-mots'), old: document.querySelectorAll(`${d} .h-tx-mirror .h-tx-ab2.is-old`).length }), D);
        await p.evaluate(() => { const i = document.querySelector('dialog.h-txb-dlg [data-ap2-pref="mots"]'); i.checked = true; i.dispatchEvent(new Event('change', { bubbles: true })); document.querySelector('dialog.h-txb-dlg [data-x]')?.click(); }); await sleep(300);
        /* ═════ 17 💰 🧰 Montants et mesures ; 16 📖 la liste ═════ */
        await p.evaluate(d => document.querySelector(`${d} [data-txh-toggle]`).click(), D); await sleep(200);
        out.secs = await p.evaluate(d => [...document.querySelectorAll(`${d} [data-txh-sec]`)].map(s => s.dataset.txhSec), D);
        await p.evaluate(d => { const s = document.querySelector(`${d} [data-txh-sec="units"]`); s.open = true; }, D); await sleep(300);
        out.units = await p.evaluate(d => document.querySelector(`${d} [data-txh-body="units"]`).textContent.replace(/\s+/g, ' '), D);
        await p.evaluate(d => { document.querySelector(`${d} [data-txh-sec="mots"]`).open = true; }, D); await sleep(200);
        await p.fill(`${D} [data-ap2-motsq]`, 'feue'); await sleep(100);
        out.motsList = await p.evaluate(d => [...document.querySelectorAll(`${d} [data-ap2-motslist] li`)].map(l => ({ t: l.textContent.replace(/\s+/g, ' '), a: l.querySelector('a')?.href || '' })), D);
        /* ═════ 14 ✍️ ce scribe : découper une lettre ═════ */
        await p.evaluate(d => { document.querySelector(`${d} [data-txh-sec="scribe"]`).open = true; }, D); await sleep(700);
        out.scribe0 = await p.evaluate(d => { const b = document.querySelector(`${d} [data-txh-body="scribe"]`); return { text: b.textContent.replace(/\s+/g, ' '), imgs: [...b.querySelectorAll('.ap2-letter img')].map(i => i.getAttribute('src')) }; }, D);
        await p.evaluate(d => document.querySelector(`${d} [data-ap2-crop]`).click(), D); await sleep(200);
        const box = await p.evaluate(d => { const r = document.querySelector(`${d} [data-ap2-crop]:is(div)`).getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }, D);
        await p.mouse.move(box.x + box.w * .3, box.y + box.h * .3); await p.mouse.down(); await p.mouse.move(box.x + box.w * .34, box.y + box.h * .36, { steps: 4 }); await p.mouse.up(); await sleep(400);
        out.cropDlg = await top();
        await p.evaluate(() => { [...document.querySelectorAll('dialog[open] [data-ap2-sugg]')].find(b => b.dataset.ap2Sugg === 's').click(); }); await sleep(100);
        await p.evaluate(() => [...document.querySelectorAll('dialog[open]')].at(-1).querySelector('[type=submit]').click()); await sleep(500);
        out.letter = await p.evaluate(d => { const dl = document.querySelector(d); const t = window.LCNDA_EXT; return { n: dl.querySelectorAll('[data-txh-body="scribe"] .ap2-letter.is-here canvas').length, cw: dl.querySelector('[data-txh-body="scribe"] .ap2-letter.is-here canvas')?.width || 0 }; }, D);
        // quand on hésite (« Ma?aud ») : les lettres sous le texte
        await caret('Ma?aud', 3); await sleep(800);
        out.hes = await p.evaluate(d => { const h = document.querySelector(`${d} [data-ap2-hes]`); return { hidden: h.hidden, n: h.querySelectorAll('.ap2-letter').length, text: h.textContent }; }, D);
        await caret('Lacombe curé', 2); await sleep(500);
        out.hesOff = await p.evaluate(d => document.querySelector(`${d} [data-ap2-hes]`).hidden, D);
        /* ═════ 19 🧾 le résumé ═════ */
        await menu('Édition', 'Résumé'); await p.waitForSelector('dialog.ap2-sumdlg');
        await p.click('dialog.ap2-sumdlg [data-ap2-sumai]'); await p.waitForFunction(() => document.querySelector('dialog.ap2-sumdlg [data-ap2-sum="who"]')?.value, null, { timeout: 15000 });
        out.sumAi = await p.evaluate(() => ({ who: document.querySelector('dialog.ap2-sumdlg [data-ap2-sum="who"]').value, ai: document.querySelector('dialog.ap2-sumdlg [data-ap2-sum="who"]').classList.contains('is-ai'), msg: document.querySelector('dialog.ap2-sumdlg [data-ap2-summsg]').textContent }));
        out.prompt = prompts.at(-1);
        await p.fill('dialog.ap2-sumdlg [data-ap2-sum="where"]', 'Treignac (Corrèze)');
        await p.click('dialog.ap2-sumdlg [type=submit]'); await sleep(300);
        out.sumChip = await p.evaluate(d => document.querySelector(`${d} [data-ap2-sumbox]`).textContent.replace(/\s+/g, ' ').trim(), D);
        await save();
        out.savedA1 = (await api('act_transcription', { id: seed.a1 })).data;
        out.textExport = await p.evaluate(() => window.LCNDA_EXT.txSummaryText({ data: { summary: { who: 'A', what: 'B', when: 'C', where: 'D' } } }));
        ollamaUp = false;
        out.sumOff = await p.evaluate(() => window.LCNDA_APP.api('atelier_plus2_write', {}, { method: 'POST', body: { op: 'summary_ai', text: 'Le douze' } }).then(() => 'ok', e => e.message));
        ollamaUp = true;
        /* ═════ 14 la lettre gardée, vue par un autre acte de la même main ═════ */
        out.lettersSrv = await api('atelier_plus2', { op: 'letters', act_id: seed.a2 });
        const th = out.lettersSrv.items?.find(x => x.act_id === seed.a1);
        out.thumb = th ? await p.evaluate(u => fetch(u).then(r => ({ s: r.status, t: r.headers.get('content-type') })), `api.php?action=atelier_plus2&op=letter_thumb&act=${seed.a1}&id=${encodeURIComponent(th.id)}`) : null;
        out.hand = await api('atelier_plus2', { op: 'hand', act_id: seed.a1 });
        /* ═════ 15 🔊 lire à voix haute ═════ */
        await caret('du mois de 9bre', 0);
        await menu('Outils', 'Lire à voix haute'); await sleep(1600);
        out.say1 = await p.evaluate(d => ({ said: window.__said.slice(), bar: document.querySelector(`${d} [data-ap2-saybar]`).textContent.replace(/\s+/g, ' '), sel: (() => { const a = document.querySelector(`${d} [data-tx-body]`); return a.value.slice(a.selectionStart, a.selectionEnd); })(), at: document.querySelector(d).dataset.ap2Say }), D);
        await p.evaluate(() => window.__last.onend()); await sleep(200);
        out.say2 = await p.evaluate(d => ({ n: window.__said.length, last: window.__said.at(-1), at: document.querySelector(d).dataset.ap2Say, sel: (() => { const a = document.querySelector(`${d} [data-tx-body]`); return a.value.slice(a.selectionStart, a.selectionEnd); })() }), D);
        await p.evaluate(d => { const r = document.querySelector(`${d} [data-ap2-rate]`); r.value = '1.3'; r.dispatchEvent(new Event('input', { bubbles: true })); r.dispatchEvent(new Event('change', { bubbles: true })); }, D); await sleep(200);
        out.sayRate = await p.evaluate(() => window.__said.at(-1).rate);
        await p.evaluate(d => document.querySelector(`${d} [data-ap2-say="stop"]`).click(), D); await sleep(200);
        out.sayStop = await p.evaluate(d => ({ hidden: document.querySelector(`${d} [data-ap2-saybar]`).hidden, at: document.querySelector(d).dataset.ap2Say || '' }), D);
        await p.evaluate(() => { window.__voices = [{ name: 'Amélie', lang: 'fr-FR' }]; window.__said = []; });
        await menu('Outils', 'Lire à voix haute'); await sleep(400);
        out.sayFr = await p.evaluate(d => ({ voice: window.__said[0]?.voice, warn: !!document.querySelector(`${d} .ap2-say-warn`) }), D);
        await p.evaluate(d => document.querySelector(`${d} [data-ap2-say="stop"]`).click(), D); await sleep(100);
        /* ═════ 22 📋 le relevé ═════ */
        out.releveSrvReg = await api('atelier_plus2', { op: 'releve', scope: 'register', act_id: seed.a1 });
        out.releveSrvAll = await api('atelier_plus2', { op: 'releve', scope: 'all', act_id: seed.a1 });
        out.releveSrvPriv = await api('atelier_plus2', { op: 'releve', scope: 'all', act_id: seed.a1, private: 1 });
        await menu('Fichier', 'Relevé'); await p.waitForFunction(() => /ligne/.test(document.querySelector('dialog[open] [data-ap2-count]')?.textContent || ''), null, { timeout: 10000 });
        out.releveDlg = await p.evaluate(() => ({ seg: [...document.querySelectorAll('dialog[open] [data-ap2-scope]')].map(b => `${b.dataset.ap2Scope}:${b.classList.contains('is-active')}`), count: document.querySelector('dialog[open] [data-ap2-count]').textContent }));
        await p.evaluate(() => document.querySelector('dialog[open] [data-ap2-scope="all"]').click()); await sleep(600);
        out.releveAll = await p.evaluate(() => document.querySelector('dialog[open] [data-ap2-count]').textContent);
        await p.evaluate(() => [...document.querySelectorAll('dialog[open]')].at(-1).querySelector('[type=submit]').click()); await sleep(700);
        out.exportDlg = await p.evaluate(() => { const d = [...document.querySelectorAll('dialog[open]')].at(-1); return { cls: d?.className || '', fmts: [...(d?.querySelectorAll('.ui-export-fmt') || [])].map(b => b.textContent.replace(/\s+/g, ' ').trim()) }; });
        const dl = p.waitForEvent('download', { timeout: 10000 }).catch(() => null);
        await p.evaluate(() => { const d = [...document.querySelectorAll('dialog[open]')].at(-1); [...d.querySelectorAll('.ui-export-fmt')].find(b => /CSV/.test(b.textContent))?.click(); setTimeout(() => d.querySelector('[data-ui-go], .modal-actions .button:not(.secondary)')?.click(), 100); });
        const dlf = await dl; out.csv = dlf ? fs.readFileSync(await dlf.path(), 'utf8') : '';
        await p.evaluate(() => { const d = [...document.querySelectorAll('dialog[open]')].at(-1); if (d && !d.classList.contains('h-tx-dlg')) d.close(); }); await sleep(200);
        /* ═════ 20 👥 seconde lecture ═════ */
        await menu('Fichier', 'Seconde lecture'); await sleep(400);
        out.secondHide = await p.evaluate(d => document.querySelector(d).classList.contains('ap2-hide-text'), D);
        const pk = p.waitForEvent('download', { timeout: 10000 }).catch(() => null);
        await p.fill('dialog[open] [data-ap2-reader]', 'Anne DURAND');
        await p.evaluate(() => document.querySelector('dialog[open] [data-ap2-pack]').click());
        const pkf = await pk; out.pack = pkf ? fs.readFileSync(await pkf.path(), 'utf8') : '';
        await p.fill('dialog[open] [data-ap2-second]', BODY.replace('Ma?aud', 'Mazaud').replace('9bre', 'novembre'));
        await p.evaluate(() => [...document.querySelectorAll('dialog[open]')].at(-1).querySelector('[type=submit]').click());
        await p.waitForSelector('dialog.h-txc', { timeout: 15000 }); await sleep(800);
        out.compare = await p.evaluate(() => { const d = document.querySelector('dialog.h-txc'); return { list: [...d.querySelectorAll('.h-txc-r')].map(r => `${r.textContent.replace(/\s+/g, ' ').trim().slice(0, 60)}:${r.classList.contains('is-on')}`), diff: d.querySelector('[data-txc-count]').textContent, word: d.querySelector('[data-txc-mode="word"]').classList.contains('is-active') }; });
        out.hideAfter = await p.evaluate(d => document.querySelector(d).classList.contains('ap2-hide-text'), D);
        await p.evaluate(() => document.querySelector('dialog.h-txc [data-txc-x]').click()); await sleep(300);
        out.versions = (await api('act_transcription_versions', { act_id: seed.a1 })).items?.filter(v => /^reader:/.test(v.source)).map(v => `${v.source}|${v.label}`);
        /* ═════ 23 📚 registre entier : « Acte suivant » reprend « Mieux voir » ═════ */
        await p.evaluate(d => { const i = document.querySelector(`${d} [data-tx-view="contrast"]`) || null; const dl = document.querySelector(d); return !!i; }, D);
        await p.evaluate(d => { const dlg = document.querySelector(d); const inp = dlg.querySelector('[data-tx-view="contrast"]'); if (inp) { inp.value = '160'; inp.dispatchEvent(new Event('input', { bubbles: true })); } }, D); await sleep(300);
        out.viewBefore = await p.evaluate(d => document.querySelector(`${d} [data-tx-view="contrast"]`)?.value, D);
        await save();
        await p.click(`${D} [data-ais-go="next"]`);
        await p.waitForFunction(d => { const dl = document.querySelector(d); return dl && !dl.querySelector('[data-tx="title"]').value && dl.querySelector('[data-ap2-row]'); }, D, { timeout: 15000 }); await sleep(600);
        out.viewNext = await p.evaluate(d => ({ contrast: document.querySelector(`${d} [data-tx-view="contrast"]`)?.value, filter: document.querySelector(`${d} [data-tx-img]`).style.filter, hand: document.querySelector(`${d} [data-ais-strip]`)?.textContent.includes('LACOMBE') }), D);
        // ses abréviations fréquentes, dans 🧰 ✍️ Ce scribe
        await p.evaluate(d => { const b = document.querySelector(`${d} [data-txh-toggle]`); if (document.querySelector(`${d} .txh-panel`).hidden) b.click(); }, D); await sleep(200);
        await p.evaluate(d => { const s = document.querySelector(`${d} [data-txh-sec="scribe"]`); s.open = false; s.open = true; }, D); await sleep(900);
        out.habits = await p.evaluate(d => [...document.querySelectorAll(`${d} [data-txh-body="scribe"] .ap2-habits li`)].map(l => l.textContent.replace(/\s+/g, ' ').trim()), D);
        out.scribeNext = await p.evaluate(d => document.querySelectorAll(`${d} [data-txh-body="scribe"] .ap2-letter`).length, D);
        await closeAct();
        /* ═════ 18 🏛 un acte en latin ═════ */
        await openAct(seed.a3);
        out.latSpans = await p.evaluate(d => [...document.querySelectorAll(`${d} .h-tx-mirror .h-tx-ab2.is-lat`)].map(s => s.textContent), D);
        await hoverTip('baptizatus est'); out.tipLat = await tipNow();
        await p.evaluate(d => { if (document.querySelector(`${d} .txh-panel`).hidden) document.querySelector(`${d} [data-txh-toggle]`).click(); }, D); await sleep(200);
        await p.evaluate(d => { document.querySelector(`${d} [data-txh-sec="latin"]`).open = true; }, D); await sleep(300);
        out.latPanel = await p.evaluate(d => ({ formulas: [...document.querySelectorAll(`${d} [data-txh-body="latin"] .is-formulas li`)].map(l => l.textContent.slice(0, 40)), here: document.querySelectorAll(`${d} [data-ap2-latlist] li.is-here`).length, src: document.querySelector(`${d} [data-txh-body="latin"] .ui-hint a`)?.href || '' }), D);
        await p.fill(`${D} [data-ap2-latq]`, 'obiit'); await sleep(100);
        out.latSearch = await p.evaluate(d => [...document.querySelectorAll(`${d} [data-ap2-latlist] li`)].map(l => l.textContent), D);
        await shot('latin.png');
        await closeAct();
        /* ═════ 12 📏 13 🔍 un acte sans zone ═════ */
        await openAct(seed.a4);
        await p.click(`${D} [data-tx-rail] [data-aip-regle]`); await sleep(150);
        await caret('première', 0); await sleep(150);
        out.free0 = await p.evaluate(d => JSON.parse(document.querySelector(d).dataset.txRegleBand || 'null'), D);
        await p.evaluate(d => document.querySelector(`${d} [data-tx-stage]`).focus(), D); await p.keyboard.press('ArrowDown'); await sleep(150);
        out.free1 = await p.evaluate(d => JSON.parse(document.querySelector(d).dataset.txRegleBand || 'null'), D);
        await p.evaluate(d => { const r = document.querySelector(`${d} [data-aip-haut]`); r.value = '200'; r.dispatchEvent(new Event('input', { bubbles: true })); }, D); await sleep(150);
        out.freeTall = await p.evaluate(d => ({ b: JSON.parse(document.querySelector(d).dataset.txRegleBand || 'null'), ls: localStorage.getItem('genealogie-tx-regle-haut') }), D);
        await p.evaluate(d => document.querySelector(`${d} [data-aip-off]`).click(), D);
        // 🔍 la loupe : taille et grossissement retenus ; « Mieux voir » seulement dans la loupe
        await closeAct();
        await p.evaluate(() => { localStorage.setItem('genealogie-tx-loupe-taille', '160'); localStorage.setItem('genealogie-tx-loupe-zoom', '4'); localStorage.setItem('genealogie-tx-loupe-seule', '1'); });
        await openAct(seed.a4);
        await p.evaluate(d => { const inp = document.querySelector(`${d} [data-tx-view="contrast"]`); if (inp) { inp.value = '170'; inp.dispatchEvent(new Event('input', { bubbles: true })); } }, D); await sleep(300);
        await p.evaluate(d => document.querySelector(`${d} [data-tx-cmd="loupe"]`).click(), D); await sleep(100);
        const st = await p.evaluate(d => { const r = document.querySelector(`${d} [data-tx-stage]`).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, D);
        await p.mouse.move(st.x, st.y); await p.mouse.move(st.x + 5, st.y + 5); await sleep(200);
        out.loupe = await p.evaluate(d => { const c = document.querySelector(`${d} [data-tx-loupe]`), img = document.querySelector(`${d} [data-tx-img]`); return { hidden: c.hidden, w: c.style.width, filter: img.style.filter, contrast: document.querySelector(`${d} [data-tx-view="contrast"]`)?.value }; }, D);
        await p.evaluate(() => localStorage.setItem('genealogie-tx-loupe-seule', '0'));
        await p.evaluate(d => { const inp = document.querySelector(`${d} [data-tx-view="contrast"]`); if (inp) { inp.value = '171'; inp.dispatchEvent(new Event('input', { bubbles: true })); } }, D); await sleep(300);
        out.loupeAll = await p.evaluate(d => document.querySelector(`${d} [data-tx-img]`).style.filter, D);
        await p.evaluate(d => document.querySelector(`${d} [data-tx-cmd="loupe"]`).click(), D);
        /* ═════ 21 🎯 l'objectif du jour ═════ */
        out.goal0 = await p.evaluate(d => document.querySelector(`${d} [data-ap2-goal]`).hidden, D);
        await menu('Outils', 'Petit objectif du jour'); await sleep(300);
        await p.evaluate(() => { const d = [...document.querySelectorAll('dialog[open]')].at(-1); d.querySelector('[data-ap2-gon]').checked = true; d.querySelector('[data-ap2-gn]').value = '1'; d.querySelector('[data-ap2-unit="line"]').click(); d.querySelector('[type=submit]').click(); }); await sleep(900);
        out.goal1 = await p.evaluate(d => ({ hidden: document.querySelector(`${d} [data-ap2-goal]`).hidden, text: document.querySelector(`${d} [data-ap2-goal]`).textContent.replace(/\s+/g, ' ').trim(), toasts: [...document.querySelectorAll('.toast')].map(t => t.textContent).join(' | ') }), D);
        await setBody('première ligne\ndeuxième ligne\ntroisième ligne\nquatrième ligne ajoutée'); await sleep(1800);
        out.goal2 = await p.evaluate(d => ({ done: document.querySelector(d).dataset.ap2GoalDone, text: document.querySelector(`${d} [data-ap2-goal]`).textContent.replace(/\s+/g, ' ').trim(), log: localStorage.getItem('genealogie-tx-objectif-jours') }), D);
        out.pile = await api('atelier_plus2', { op: 'pile', pile: 'todo', act_id: seed.a4 });
        out.reminders = await p.evaluate(() => localStorage.getItem('genealogie-tx-objectif-rappel'));
        await shot('objectif.png');
        await p.click(`${D} [data-ap2-pilenext]`); await sleep(200);
        await p.evaluate(() => { const b = [...document.querySelectorAll('dialog[open] button')].find(x => /Enregistrer et ouvrir|Fermer sans/.test(x.textContent)); b?.click(); });
        await p.waitForFunction(([d, t]) => document.querySelector(`${d} [data-tx="title"]`)?.value && document.querySelector(`${d} [data-tx="title"]`).value !== t, [D, 'Acte sans zone'], { timeout: 15000 }).catch(() => {}); await sleep(600);
        out.pileNext = await p.evaluate(d => document.querySelector(`${d} [data-tx="title"]`)?.value, D);
        /* ═════ 390 px, sombre ═════ */
        await p.setViewportSize({ width: 390, height: 800 }); await sleep(400);
        await p.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark')); await sleep(200);
        out.overflow = await p.evaluate(d => [...document.querySelectorAll(`${d} [data-ap2-row], ${d} [data-ap2-row] > *, ${d} [data-ap2-hes]`)].filter(e => !e.hidden && e.scrollWidth > e.clientWidth + 2).map(e => e.className), D);
        out.darkChip = await p.evaluate(d => { const c = document.querySelector(`${d} .ap2-goalchip`); return c ? getComputedStyle(c).backgroundColor : ''; }, D);
        await shot('telephone.png');
        await closeAct();
        out.errs = errs;
    } finally { await browser.close(); proc.kill(); fake.close(); }
}

(async () => {
    const out = {};
    let browserOk = !!chromium;
    if (browserOk) { try { await browserPart(out); } catch (e) { console.error(e); failed++; browserOk = false; out.crashed = true; } }
    if (out.seed) {
        check('🛡 serveur : data.summary et data.letters nettoyés (bornés, sans caractère nul ; lettres sans nom, minuscules ou mal nommées écartées)', () => {
            const c = out.seed.clean; assert.equal(c.summary.who, 'Jean MAZAUD'); assert.equal(c.summary.what.length, 240); assert.equal(c.summary.from, 'ai'); assert.equal(c.summary.ok, true); assert.ok(!('evil' in c.summary));
            assert.deepEqual(c.letters, [{ id: 'L1', x: 0, y: 2, w: 10, h: 12, label: 's' }]);
        });
        check('📋 22 : nom et prénom du relevé (le nom en capitales ; « feu » retiré)', () => assert.deepEqual(out.seed.split, [['MAZAUD', 'Pierre'], ['LA COMBE', 'Jean de'], ['Lacombe', 'Marie']]));
    }
    if (browserOk) {
        check('📖 16 : les mots d’autrefois soulignés (laboureur, feu devant un nom) ; la bulle donne le sens et la source', () => {
            assert.ok(out.spans.some(([t, c]) => t === 'laboureur' && c === 'is-old'), JSON.stringify(out.spans)); assert.ok(out.spans.some(([t, c]) => t === 'feu' && c === 'is-old'));
            assert.match(out.tipLab.text, /attelage/); assert.match(out.tipLab.html, /href="https:\/\/fr\.wikipedia\.org\/wiki\/Laboureur"/); assert.match(out.tipFeu.html, /cnrtl\.fr\/definition\/feu/);
        });
        check('📖 16 : mon glossaire passe avant l’abréviation (labr) et le mot d’autrefois (laboureur)', () => {
            assert.deepEqual(out.spansGlo.map(x => x[1]), out.spansGlo.map(() => 'is-glo'), JSON.stringify(out.spansGlo)); assert.ok(out.spansGlo.length >= 2); assert.match(out.tipGlo.text, /laboureur \(mon mot\)/); assert.match(out.tipGlo.text, /Mon glossaire/);
        });
        check('17 💰 : la bulle d’une mesure et la variation selon la région ; 🧰 « Montants et mesures de cet acte »', () => {
            assert.ok(out.tipArp, 'bulle de « un arpent »'); assert.match(out.tipArp.text, /changeait d’une région à l’autre/); assert.match(out.units, /arpent/); assert.match(out.units, /Convertisseur/);
        });
        check('⚙️ Personnaliser : mots, latin, glossaire, reprise de « Mieux voir », loupe (taille, grossissement, seulement dans la loupe), vitesse ; un réglage éteint suit tout de suite', () => {
            ['mots:true', 'latin:true', 'glo:true', 'vue:true', 'taille:0', 'zoom:3', 'seule:false', 'vitesse:0.9'].forEach(k => assert.ok(out.prefs.includes(k), k + ' : ' + out.prefs));
            assert.deepEqual(out.motsOff, { ls: '0', old: 0 });
        });
        check('menus : Fichier (👥 Seconde lecture, 📋 Relevé), Édition (🧾 Résumé), Outils (🔊, ✍️, 🎯) ; 🧰 quatre sections de plus', () => {
            assert.ok(out.fichier.some(l => /Seconde lecture/.test(l)) && out.fichier.some(l => /Relevé pour l’entraide/.test(l)), out.fichier.join(' | '));
            assert.ok(out.edition.some(l => /Résumé : qui, quoi, quand, où/.test(l))); assert.ok(out.outils.some(l => /Lire à voix haute/.test(l)) && out.outils.some(l => /Lettres de ce scribe/.test(l)) && out.outils.some(l => /Petit objectif du jour/.test(l)));
            ['scribe', 'mots', 'latin', 'units', 'model', 'glo', 'sign', 'prog'].forEach(s => assert.ok(out.secs.includes(s), s));
        });
        check('📖 16 : la liste à chercher (feue → feu, feue avec sa source)', () => { assert.equal(out.motsList.length, 1); assert.match(out.motsList[0].t, /défunt/); assert.match(out.motsList[0].a, /cnrtl\.fr\/definition\/feu/); });
        check('✍️ 14 : la lettre d’un autre acte de la même main (vignette) ; ✂️ une lettre découpée, nommée « s », dessinée tout de suite', () => {
            assert.match(out.scribe0.text, /Curé J\. LACOMBE/); assert.ok(out.scribe0.imgs.some(s => /op=letter_thumb.*id=Lold1/.test(s)), JSON.stringify(out.scribe0));
            assert.match(out.cropDlg, /h-modal/); assert.equal(out.letter.n, 1); assert.ok(out.letter.cw > 4);
        });
        check('✍️ 14 : gardée avec l’acte (data.letters, en pixels de l’image) et vue par l’autre acte de la main ; vignette JPEG', () => {
            const l = out.savedA1.letters; assert.equal(l.length, 1); assert.equal(l[0].label, 's'); assert.ok(l[0].x > 100 && l[0].w > 10 && l[0].h > 10, JSON.stringify(l));
            assert.ok(out.lettersSrv.items.some(x => x.act_id === out.seed.a1 && x.label === 's')); assert.equal(out.lettersSrv.by, 'hand'); assert.deepEqual(out.thumb, { s: 200, t: 'image/jpeg' });
        });
        check('✍️ 14 : quand on hésite (« Ma?aud ») : les lettres du scribe sous le texte ; ailleurs : cachées', () => { assert.equal(out.hes.hidden, false); assert.ok(out.hes.n >= 2, JSON.stringify(out.hes)); assert.equal(out.hesOff, true); });
        check('🧾 19 : 🤖 proposé par le (faux) Ollama, à relire (format JSON demandé, rien en ligne) ; corrigé, gardé ; dans l’export texte', () => {
            assert.match(out.sumAi.who, /Jean MAZAUD/); assert.equal(out.sumAi.ai, true); assert.match(out.sumAi.msg, /relis/); assert.equal(out.prompt.format, 'json'); assert.match(out.prompt.messages[0].content, /N'invente rien/);
            assert.deepEqual({ ...out.savedA1.summary }, { who: 'Jean MAZAUD, fils de Pierre MAZAUD et de Marie LACOMBE', what: 'baptême', when: '12 novembre 1787', where: 'Treignac (Corrèze)', from: 'ai', ok: true, model: 'qwen3-vl:8b-instruct' });
            assert.match(out.sumChip, /Jean MAZAUD.*baptême/); assert.equal(out.textExport, 'Qui : A\nQuoi : B\nQuand, où : C · D');
        });
        check('🧾 19 : Ollama absent → une phrase claire (écrire à la main)', () => assert.match(out.sumOff, /n’est pas lancée : écris le résumé à la main/));
        check('🔊 15 : ligne à ligne depuis le curseur, la ligne choisie dans le texte, abréviations développées ; vitesse ; ■ ; sans voix française : dit', () => {
            assert.equal(out.say1.said.length, 1); assert.match(out.say1.said[0].text, /du mois de novembre/); assert.equal(out.say1.sel, 'du mois de 9bre a été baptisé Jean fils légitime'); assert.equal(out.say1.at, '2');
            assert.match(out.say1.bar, /Ligne 2 \/ 6/); assert.match(out.say1.bar, /Pas de voix française/); assert.equal(out.say1.said[0].rate, .9);
            assert.equal(out.say2.at, '3'); assert.match(out.say2.sel, /^de Pierre Ma\?aud/); assert.equal(out.sayRate, 1.3); assert.deepEqual(out.sayStop, { hidden: true, at: '' });
            assert.deepEqual(out.sayFr, { voice: 'Amélie', warn: false });
        });
        check('📋 22 : le relevé du registre (gabarit + personnes) : colonnes, nom / prénom, père, mère, parrain, témoins, cote, vue, résumé en notes', () => {
            const r = out.releveSrvReg; assert.deepEqual(r.columns.map(c => c[0]), ['date', 'type', 'nom', 'prenom', 'pere', 'mere', 'conjoint', 'parrain', 'marraine', 'temoins', 'lieu', 'cote', 'vue', 'notes']);
            const a = r.rows.find(x => x.act_id === out.seed.a1), b = r.rows.find(x => x.act_id === out.seed.a2);
            assert.deepEqual([a.nom, a.prenom, a.pere, a.mere, a.parrain, a.marraine, a.cote, a.vue, a.type], ['MAZAUD', 'Jean', 'Pierre MAZAUD, laboureur', 'Marie LACOMBE', 'Jean DURAND, labr', 'Anne MAZAUD', '3 E 271/4', '1 / 2', 'Baptême']); assert.match(a.notes, /baptême/);
            assert.deepEqual([b.nom, b.prenom, b.temoins, b.type], ['MAZAUD', 'Léonard', 'Jean DURAND ; Pierre MAZAUD', 'Sépulture']);
        });
        check('📋 22 : vie privée : une personne vivante reliée et une naissance de moins de 75 ans laissées de côté, sauf si on le choisit', () => {
            assert.deepEqual(out.releveSrvAll.hidden, { private: 1, recent: 1 }); assert.ok(!out.releveSrvAll.rows.some(x => [out.seed.a5, out.seed.a6].includes(x.act_id)));
            assert.ok(out.releveSrvPriv.rows.some(x => x.act_id === out.seed.a5) && out.releveSrvPriv.rows.some(x => x.act_id === out.seed.a6));
        });
        check('📋 22 : la fenêtre (Ce registre choisi), les laissés de côté dits, puis la fenêtre d’export commune (CSV, tableur…) et le CSV', () => {
            assert.ok(out.releveDlg.seg.includes('register:true'), JSON.stringify(out.releveDlg)); assert.match(out.releveDlg.count, /2 lignes/); assert.match(out.releveAll, /vivantes ou confidentielles/); assert.match(out.releveAll, /moins de 75 ans/);
            assert.ok(out.exportDlg.fmts.some(f => /CSV/.test(f)), JSON.stringify(out.exportDlg)); assert.match(out.csv, /Date;Type d’acte;Nom;Prénom;Père;Mère/); assert.match(out.csv, /MAZAUD;Jean;Pierre MAZAUD, laboureur/);
        });
        check('👥 20 : la fiche vierge (6 lignes numérotées, le lecteur) ; gardée « 👥 Lecture de Anne DURAND » (reader:…) ; ⚖️ comparée mot à mot ; mon texte caché pendant la saisie', () => {
            assert.match(out.pack, /Lecteur : Anne DURAND/); assert.match(out.pack, /006 \| \n$/); assert.equal(out.secondHide, true); assert.equal(out.hideAfter, false);
            assert.deepEqual(out.versions, ['reader:Anne DURAND|👥 Lecture de Anne DURAND']); assert.ok(out.compare.list.some(l => /Lecture de Anne DURAND.*:true/.test(l)), JSON.stringify(out.compare)); assert.equal(out.compare.word, true); assert.match(out.compare.diff, /diffèrent|passage/);
        });
        check('📚 23 : « Acte suivant » reprend les réglages « Mieux voir » et la main ; les abréviations fréquentes du scribe ; ses lettres', () => {
            assert.equal(out.viewBefore, '160'); assert.equal(out.viewNext.contrast, '160'); assert.match(out.viewNext.filter, /contrast\((1\.6|160%)/); assert.equal(out.viewNext.hand, true);
            assert.ok(out.habits.some(h => /^labr × \d/.test(h)), JSON.stringify(out.habits)); assert.ok(out.scribeNext >= 2); assert.equal(out.hand.by, 'hand'); assert.equal(out.hand.acts, 2);
        });
        check('🏛 18 : un acte en latin : mots soulignés, bulle + source ; 🧰 formules repérées, liste à chercher', () => {
            ['baptizatus est', 'filius', 'legitimus', 'Patrinus'].forEach(w => assert.ok(out.latSpans.includes(w), w + ' : ' + out.latSpans));
            assert.match(out.tipLat.text, /baptisé/); assert.match(out.tipLat.html, /familysearch\.org/); assert.ok(out.latPanel.formulas.length >= 1, JSON.stringify(out.latPanel)); assert.ok(out.latPanel.here >= 3); assert.match(out.latPanel.src, /familysearch/);
            assert.ok(out.latSearch.some(l => /obiit/.test(l) && /mort/.test(l)));
        });
        check('📏 12 : sans zone, la bande libre suit la ligne (↓ : une ligne plus bas) ; le curseur « hauteur » l’agrandit (retenu)', () => {
            assert.equal(out.free0.free, true); assert.ok(out.free1.y > out.free0.y, JSON.stringify([out.free0, out.free1])); assert.ok(out.freeTall.b.h > out.free1.h * 1.5, JSON.stringify(out.freeTall)); assert.equal(out.freeTall.ls, '2');
        });
        check('🔍 13 : la loupe à la taille choisie (160 px) ; « Mieux voir seulement dans la loupe » : l’image sans filtre ; sinon l’image filtrée', () => {
            assert.equal(out.loupe.hidden, false); assert.equal(out.loupe.w, '160px'); assert.equal(out.loupe.filter, ''); assert.match(out.loupeAll, /contrast\((1\.71|171%)/);
        });
        check('🎯 21 : éteint au départ ; allumé : « 0 / 1 ligne », un seul rappel doux dans l’app ; une ligne écrite → atteint ; la pile ; « Acte suivant de la pile »', () => {
            assert.equal(out.goal0, true); assert.equal(out.goal1.hidden, false); assert.match(out.goal1.text, /Aujourd’hui : 0 \/ 1 ligne/); assert.match(out.goal1.toasts, /Petit objectif du jour : 1/);
            assert.equal(out.goal2.done, '1'); assert.match(out.goal2.text, /1 \/ 1.*bravo/); assert.ok(out.pile.left >= 3 && out.pile.next_id > 0, JSON.stringify(out.pile)); assert.ok(out.reminders);
            assert.ok(out.pileNext && out.pileNext !== 'Acte sans zone', out.pileNext);
        });
        check('à 390 px et en sombre : la rangée (objectif, résumé, voix) et les lettres ne débordent pas', () => { assert.deepEqual(out.overflow, []); assert.ok(out.darkChip); });
        check('aucune erreur JS', () => assert.deepEqual(out.errs, []));
    }
    for (const [name, fn] of checks) { try { await fn(); count++; console.log('  ✓', name); } catch (e) { failed++; console.log('  ✗', name, '\n   ', e.message); } }
    if (!chromium) console.log('  (Playwright absent : la partie navigateur est sautée)');
    console.log('  (non vérifié ici : une vraie voix du système et le vrai Ollama — imités)');
    console.log(failed ? `${failed} échec(s)` : `${count} vérifications réussies`);
    process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
