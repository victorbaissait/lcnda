'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 📜 Atelier de transcription, outils en plus (3) : node tests/test-atelier-plus3.js   (SHOTS=dossier pour garder des captures)
 *  1. Sans navigateur : heritage-atelier-plus3-data.js — 🗂 le plan proposé et retrouvé après une modification, 👥 les personnes en
 *     tableau, 🕸 le croquis (rangées, liens, SVG), ✏️ rayé / ajout / marge (repérage, texte lu, TEI), ❓ les mots douteux,
 *     🎤 la dictée (locale, en ligne, refusée), 🆚 le relevé collé (séparateur, en-tête, cases, différences), 🔗 les liens gardés.
 *     Côté serveur (PHP) : data.outline et data.twins nettoyés, les mots douteux comme dans le navigateur, les dates des jumeaux.
 *  2. Navigateur (Playwright, sinon sauté) :
 *      7 🗂 un contrat de mariage : 🧰 « Plan de l'acte », ✨ proposer, un titre changé, un retiré (↶ Annuler), gardé, un clic y va ;
 *      8 👥 le tableau (rôle, âge, métier, domicile), 🔗 relier (le choix de fiche), ＋ créer (l'acte en source), ↶ Annuler ; 🔒 vivante ;
 *      9 🕸 le croquis : parents → enfant, parrain et marraine, un clic montre la personne ;
 *     10 ✏️ un mot rayé, un ajout, une note en marge : soulignés, cachés / montrés (Affichage), dans le TEI exporté (<del>, <add>, <note>) ;
 *     11 ❓ les mots douteux de tous les actes, l'image du mot (JPEG), corrigés (🕘 version gardée), ↶ Annuler ; dans l'acte ouvert aussi ;
 *     12 🎤 éteinte au départ ; en ligne : dit avant ; refusée pour un acte lié à une personne vivante ; locale : sans avertissement ;
 *     13 🆚 une ligne de relevé collée : cases reconnues, différences ;
 *     14 🔗 baptême ↔ naissance, mariage ↔ bans : côte à côte, lié dans les deux actes, ↶ Annuler ;
 *     consultation : écritures refusées, rien de nommé ; menus ; ⚙️ Personnaliser ; 390 px ; sombre ; aucune erreur JS.
 * Noms inventés (MAZAUD, LACOMBE, DURAND).
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
let failed = 0, count = 0;
const checks = [];
const check = (name, fn) => checks.push([name, fn]);

/* ═════ 1. sans navigateur ═════ */
const X = require('../assets/js/heritage-atelier-plus3-data.js');
const CONTRAT = ['Par-devant les notaires royaux soussignés', 'furent présents Pierre MAZAUD, laboureur, demeurant à Treignac', 'et Marie DURAND, fille de Jean DURAND', 'lesquels ont dit que dans la vue du mariage', 'le futur époux apporte en dot une vache et deux brebis',
    'la future se constitue en dot la somme de cent livres', 'il y aura communauté de biens entre les futurs', 'douaire de trente livres au survivant', 'fait et passé à Treignac en la maison', 'lecture faite les parties ont déclaré ne savoir signer'].join('\n');

check('🗂 7 : le plan proposé d’après les mots connus (préambule, comparution, objet, apports, clauses, clôture, signatures), au début de la ligne', () => {
    const o = X.suggestOutline(CONTRAT);
    assert.deepEqual(o.map(x => x.key), ['preambule', 'comparution', 'objet', 'apports', 'clauses', 'clotures', 'signatures']);
    o.forEach(x => { assert.ok(x.s === 0 || CONTRAT[x.s - 1] === '\n'); assert.equal(CONTRAT.slice(x.s).startsWith(x.at), true); });
    assert.equal(o.find(x => x.key === 'apports').s, CONTRAT.indexOf('le futur époux apporte'));
});
check('🗂 7 : les pièces d’un inventaire (chacune), et le plan retrouvé quand le texte bouge (début de ligne), perdu sinon', () => {
    const inv = 'Inventaire des meubles\ndans la cuisine une table\nitem deux chaises\ndans la chambre haute un lit\nargent comptant dix livres\nont signé';
    assert.deepEqual(X.suggestOutline(inv).map(x => x.h), ['Dans la cuisine', 'Dans la chambre haute', 'Argent comptant', 'Signatures']);
    const kept = X.cleanOutline([{ s: 0, h: 'Comparution', at: '' }, ...X.suggestOutline(CONTRAT).slice(3, 4)], CONTRAT);
    const moved = 'Une ligne ajoutée au début\n' + CONTRAT, r = X.resolveOutline(kept, moved);
    assert.equal(r[1].s, moved.indexOf('le futur époux apporte')); assert.equal(r[1].lost, false);
    assert.equal(X.resolveOutline([{ s: 5, h: 'x', at: 'introuvable ici' }], CONTRAT)[0].lost, true);
    assert.equal(X.mergeOutline(kept, X.suggestOutline(CONTRAT)).length, 7, 'pas deux titres sur la même ligne');
    assert.equal(X.isLong(CONTRAT), false); assert.equal(X.isLong(Array(30).fill('ligne').join('\n')), true);
});
// ce que « Ce que l'app a trouvé » donne pour un baptême (extractAct), écrit à la main ici
const EX = { kind: 'bapteme', people: [
    { key: 'p1', name: 'Jean', given: 'Jean', surname: '', sex: 'm', role: 'sujet', relations: [], s: 10, e: 14 },
    { key: 'p2', name: 'Pierre MAZAUD', given: 'Pierre', surname: 'MAZAUD', sex: 'm', role: 'parent', job: 'laboureur', age: 40, residence: 'Treignac', relations: [{ type: 'parent_of', of: 'p1' }], s: 20, e: 33 },
    { key: 'p3', name: 'Marie LACOMBE', given: 'Marie', surname: 'LACOMBE', sex: 'f', role: 'parent', relations: [{ type: 'parent_of', of: 'p1' }], s: 40, e: 53 },
    { key: 'p4', name: 'Jean DURAND', given: 'Jean', surname: 'DURAND', sex: 'm', role: 'parrain', relations: [], s: 60, e: 71 },
    { key: 'p5', name: 'Anne MAZAUD', given: 'Anne', surname: 'MAZAUD', sex: 'f', role: 'marraine', relations: [], s: 80, e: 91 },
    { key: 'p6', name: 'Léonard DURAND', given: 'Léonard', surname: 'DURAND', sex: 'm', role: 'temoin', deceased: true, relations: [], s: 95, e: 109 }] };
check('👥 8 : le tableau : rôle (le « parent » devient Père / Mère), âge, métier, domicile ; la fiche reliée retrouvée par le nom ; un nom gardé en plus', () => {
    const rows = X.peopleRows(EX, [{ name: 'Pierre MAZAUD', role: 'pere', person_id: 7, s: 20, e: 33 }, { name: 'Curé LACOMBE', role: 'autre', person_id: 0 }]);
    assert.deepEqual(rows.map(r => r.label), ['Enfant', 'Père', 'Mère', 'Parrain', 'Marraine', 'Témoin', 'Autre personne']);
    const p = rows[1]; assert.deepEqual([p.age, p.job, p.residence, p.person_id, p.idx], [40, 'laboureur', 'Treignac', 7, 0]);
    assert.equal(rows[6].name, 'Curé LACOMBE'); assert.equal(rows[6].idx, 1);
    assert.deepEqual(X.splitName('Jean de LA COMBE'), { given: 'Jean', surname: 'de LA COMBE' }); assert.deepEqual(X.splitName('Marie Lacombe'), { given: 'Marie', surname: 'Lacombe' });
});
check('🕸 9 : le croquis : parents en haut, l’enfant entre parrain et marraine, témoin en bas ; parent → enfant, conjoints, parrain (pointillé) ; SVG échappé', () => {
    const L = X.sketchLayout(EX), y = k => L.nodes.find(n => n.key === k).y, x = k => L.nodes.find(n => n.key === k).x;
    assert.ok(y('p2') < y('p1') && y('p3') === y('p2') && y('p4') === y('p1') && y('p6') > y('p1'));
    assert.ok(x('p4') < x('p1') && x('p1') < x('p5'), 'parrain, enfant, marraine');
    const ty = L.edges.map(e => `${e.a}-${e.b}:${e.type}`);
    ['p2-p1:parent', 'p3-p1:parent', 'p2-p3:spouse', 'p4-p1:sponsor', 'p5-p1:sponsor', 'p6-p1:witness'].forEach(t => assert.ok(ty.includes(t), t + ' : ' + ty));
    const svg = X.sketchSvg(X.sketchLayout({ people: [{ key: 'a', name: '<b>MAZAUD</b>', role: 'sujet', relations: [] }] }));
    assert.match(svg, /^<svg class="ap3-sk"/); assert.ok(!svg.includes('<b>')); assert.match(svg, /&lt;b&gt;MAZAUD/);
    assert.equal(X.sketchSvg(X.sketchLayout({ people: [] })), '');
    const m = X.sketchLayout({ kind: 'mariage', people: [{ key: 'e', name: 'Pierre MAZAUD', role: 'epoux', sex: 'm', relations: [] }, { key: 'f', name: 'Marie LACOMBE', role: 'epouse', sex: 'f', relations: [] }, { key: 'pe', name: 'Jean MAZAUD', role: 'pere_epoux', sex: 'm', relations: [] }, { key: 't', name: 'Jean DURAND', role: 'temoin', sex: 'm', relations: [] }] });
    assert.ok(m.edges.some(e => e.a === 'e' && e.b === 'f' && e.type === 'spouse') && m.edges.some(e => e.a === 'pe' && e.b === 'e' && e.type === 'parent'), JSON.stringify(m.edges));
});
check('✏️ 10 : 〚rayé〛, \\ajouté/, [en marge : …] repérés ; entourer un passage ; le texte lu ; en TEI <del>, <add place="above">, <note place="margin"> (échappé)', () => {
    const t = 'le 〚douze〛 \\treize/ mars [en marge : nota bene] & <x>';
    assert.deepEqual(X.scanMarks(t).map(m => [m.type, m.inner, t.slice(m.s, m.e)]), [['del', 'douze', '〚douze〛'], ['add', 'treize', '\\treize/'], ['margin', 'nota bene', '[en marge : nota bene]']]);
    assert.deepEqual(X.wrapMark('del', ' douze '), { text: ' 〚douze〛 ', caret: 8 }); assert.deepEqual(X.wrapMark('add', ''), { text: '\\/', caret: 1 }); assert.equal(X.wrapMark('margin', 'nota').text, '[en marge : nota]');
    assert.equal(X.readingText(t), 'le treize mars & <x>\n\nEn marge :\n- nota bene');
    assert.equal(X.teiInline(t), 'le <del rend="strikethrough">douze</del> <add place="above">treize</add> mars <note place="margin">nota bene</note> &amp; &lt;x&gt;');
    assert.deepEqual(X.scanMarks('le 12/03 et/ou [?] [illisible] [mot]'), [], 'les barres, [?] et [mot] ne sont pas des marques');
});
check('❓ 11 : les mots douteux (Ma?aud, Ma…d, mot[?], [?], [illisible], Jean?), avec leur ligne ; « 12/03 », « etc. » et un point final ne le sont pas', () => {
    const d = X.scanDoubts('de Pierre Ma?aud labr\nMa…d [?] mot[?] [illisible] etc. le 12/03 Jean?\nfin.');
    assert.deepEqual(d.map(x => [x.word, x.line, x.kind]), [['Ma?aud', 1, 'word'], ['Ma…d', 2, 'word'], ['[?]', 2, 'mark'], ['mot[?]', 2, 'mark'], ['[illisible]', 2, 'illisible'], ['Jean?', 2, 'word']]);
    assert.equal(d[1].s, 'de Pierre Ma?aud labr\n'.length);
});
check('🎤 12 : la dictée : éteinte au départ ; locale partout (même confidentiel) ; en ligne refusée (vivant, confidentiel, invité), jamais en consultation ; app de bureau sans service : dit', () => {
    const P = o => X.dictationPlan({ pref: true, hasSR: true, ...o });
    assert.deepEqual(X.dictationPlan({ hasSR: true }), { ok: false, mode: '', why: 'off' });
    assert.deepEqual(P({}), { ok: true, mode: 'online', why: '' });
    assert.deepEqual(P({ local: 'available', living: true, confidential: true }), { ok: true, mode: 'local', why: '' });
    assert.equal(P({ living: true }).why, 'living'); assert.equal(P({ confidential: true }).why, 'confidential'); assert.equal(P({ guest: true }).why, 'guest');
    assert.equal(P({ kiosk: true, local: 'available' }).why, 'kiosk'); assert.equal(P({ hasSR: false }).why, 'none'); assert.equal(P({ desktop: true }).why, 'desktop'); assert.equal(P({ desktop: true, local: 'available' }).ok, true);
});
check('🆚 13 : le relevé collé : séparateur, en-tête reconnu (accents, synonymes) ; sans en-tête : la date et le type devinés, l’ordre du relevé ; les différences', () => {
    const r = X.parseReleve('Date;Type;Nom;Prénom;Père;Mère;Commune\n12/11/1787;Baptême;MAZAUD;Jean;Pierre MAZAUD;Marie DURAND;Treignac');
    assert.equal(r.sep, ';'); assert.deepEqual(X.guessMapping(r.header, r.cells), ['date', 'type', 'nom', 'prenom', 'pere', 'mere', 'lieu']);
    const t = X.parseReleve('"MAZAUD, dit Jeannot"\t12 nov. 1787\tB\tJean');
    assert.equal(t.sep, '\t'); assert.equal(t.header, null); assert.deepEqual(X.guessMapping(null, t.cells), ['nom', 'date', 'type', 'prenom']);
    const c = X.compareReleve(X.guessMapping(r.header, r.cells), r.cells, { date: '12 nov. 1787', type: 'Baptême', nom: 'MAZAUD', prenom: 'Jean', pere: 'Pierre MAZAUD, laboureur', mere: 'Marie LACOMBE', parrain: 'Jean DURAND', lieu: 'Treignac (19)' }, 'fils de Pierre Mazaud et de Marie Lacombe');
    const st = Object.fromEntries(c.map(x => [x.field, x.state]));
    assert.deepEqual(st, { date: 'same', type: 'same', nom: 'same', prenom: 'same', pere: 'same', mere: 'diff', parrain: 'mine', lieu: 'same' });
    assert.equal(c.find(x => x.field === 'mere').inText, false); assert.equal(c.find(x => x.field === 'pere').inText, true);
    assert.deepEqual(X.rowFromEx(EX, { pere: 'Pierre MAZAUD, laboureur' }), { pere: 'Pierre MAZAUD, laboureur', prenom: 'Jean', mere: 'Marie LACOMBE', parrain: 'Jean DURAND', marraine: 'Anne MAZAUD', temoins: 'Léonard DURAND' });
    assert.equal(X.dateNorm('12 9bre 1787'), '1787-11-12'); assert.equal(X.dateNorm('12/11/1787'), '1787-11-12');
});
check('🔗 14 : les liens gardés : un par acte, la sorte connue sinon « autre », 12 au plus', () => {
    assert.deepEqual(X.cleanTwins([{ id: 3, rel: 'bans' }, { id: 3, rel: 'x' }, { id: 0 }, { id: '4', rel: 'nimporte' }]), [{ id: 3, rel: 'bans' }, { id: 4, rel: 'autre' }]);
    assert.equal(X.twinLabel('inhumation'), 'Décès et inhumation');
});

async function browserPart(out) {
    const phpPath = findPhp([devBundledPhp()]);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-plus3-'));
    const dir = path.join(tmp, 'data'); fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
    const env = { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4', GENEALOGY_TEST: '1' };
    const php = (code, extra = {}) => { const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], { cwd: appRoot, encoding: 'utf8', env: { ...env, ...extra } }); if (r.status !== 0) throw new Error(r.stderr || r.stdout); return r.stdout; };
    const BODY = ['L’an mil sept cent quatre vingt sept et le douze', 'du mois de novembre a été baptisé Jean fils légitime', 'de Pierre MAZAUD laboureur et de Marie LACOMBE', 'sa femme, parrain Jean DURAND, marraine Anne MAZAUD,', 'le père a dit ne savoir signer Ma?aud', 'Lacombe curé'].join('\n');
    const NAIS = ['Le dix novembre mil sept cent quatre vingt sept', 'est né Jean, fils de Pierre MAZAUD et de Marie LACOM?E'].join('\n');
    const zones = body => { const Z = []; let at = 0; body.split('\n').forEach((l, i) => { Z.push({ id: 'z' + i, x: 40, y: 40 + i * 60, w: 900, h: 44, s: at, e: at + l.length }); at += l.length + 1; }); return Z; };
    const LONG = [CONTRAT, ...Array.from({ length: 22 }, (_, i) => `item ${i + 1} : une pièce de terre`)].join('\n');
    const seed = JSON.parse(php(String.raw`require 'lib/paths.php'; $p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; require 'tests/api_functions.php'; $pdo = db(); act_transcriptions_ensure($pdo);
$pierre = (int) save_person($pdo, ['first_name' => 'Pierre', 'last_name' => 'MAZAUD', 'gender' => 'male'])['id'];
$liv = (int) save_person($pdo, ['first_name' => 'Paul', 'last_name' => 'DURAND', 'gender' => 'male'])['id']; $pdo->exec("UPDATE persons SET living_status='living' WHERE id=$liv");
$img = function (string $name) { $im = imagecreatetruecolor(1000, 560); imagefill($im, 0, 0, imagecolorallocate($im, 236, 226, 200)); $ink = imagecolorallocate($im, 70, 50, 30);
    for ($b = 0; $b < 6; $b++) { $y = 40 + $b * 60; for ($x = 50; $x < 940; $x += 7) { imagefilledrectangle($im, $x, $y + 10 + ($x % 5), $x + 3, $y + 30, $ink); } } imagepng($im, MEDIA_DIR . '/' . $name); };
$m = []; foreach (['bap.png', 'nais.png'] as $f) { $img($f); $pdo->prepare("INSERT INTO media(title, media_type, filename) VALUES(?, 'image', ?)")->execute([$f, $f]); $m[$f] = (int) $pdo->lastInsertId(); }
$ins = function (array $a) use ($pdo) { $pdo->prepare('INSERT INTO act_transcriptions(title, kind, media_id, date_text, place, source, body, data_json) VALUES(?,?,?,?,?,?,?,?)')->execute([$a['title'], $a['kind'], $a['media'] ?? null, $a['date'] ?? '', $a['place'] ?? '', '', $a['body'], json_encode($a['data'] ?? ['zones' => []], JSON_UNESCAPED_UNICODE)]); return (int) $pdo->lastInsertId(); };
$a1 = $ins(['title' => 'Baptême de Jean MAZAUD', 'kind' => 'bapteme', 'media' => $m['bap.png'], 'date' => '12 nov. 1787', 'place' => 'Treignac (19)', 'body' => getenv('TX_BODY'), 'data' => ['zones' => json_decode(getenv('TX_ZONES'), true), 'people' => [], 'status' => 'doing']]);
$a2 = $ins(['title' => 'Naissance de Jean MAZAUD', 'kind' => 'naissance', 'media' => $m['nais.png'], 'date' => '10 novembre 1787', 'place' => 'Treignac', 'body' => getenv('TX_NAIS'), 'data' => ['zones' => json_decode(getenv('TX_NZONES'), true), 'people' => [['name' => 'Jean MAZAUD', 'role' => 'sujet', 's' => 0, 'e' => 0, 'person_id' => 0], ['name' => 'Pierre MAZAUD', 'role' => 'pere', 's' => 0, 'e' => 0, 'person_id' => 0]]]]);
$a3 = $ins(['title' => 'Mariage de Pierre MAZAUD et Marie LACOMBE', 'kind' => 'mariage', 'date' => '20 janv. 1788', 'place' => 'Treignac', 'body' => "Le vingt janvier 1788 après la publication de trois bans ont été mariés Pierre MAZAUD et Marie LACOMBE", 'data' => ['zones' => [], 'people' => [['name' => 'Pierre MAZAUD', 'role' => 'epoux', 's' => 0, 'e' => 0, 'person_id' => 0], ['name' => 'Marie LACOMBE', 'role' => 'epouse', 's' => 0, 'e' => 0, 'person_id' => 0]]]]);
$a4 = $ins(['title' => 'Publication des bans de Pierre MAZAUD et Marie LACOMBE', 'kind' => 'autre', 'date' => '6 janv. 1788', 'place' => 'Treignac', 'body' => "Premier ban de mariage entre Pierre MAZAUD et Marie LACOMBE", 'data' => ['zones' => []]]);
$a5 = $ins(['title' => 'Contrat de mariage MAZAUD-DURAND', 'kind' => 'notarial', 'date' => '2 mars 1788', 'place' => 'Treignac', 'body' => getenv('TX_LONG'), 'data' => ['zones' => []]]);
$a6 = $ins(['title' => 'Naissance de Paul DURAND', 'kind' => 'naissance', 'date' => '4 mai 1990', 'place' => 'Tulle', 'body' => 'Paul DURAND né le 4 mai 1990 fils de Jea?n DURAND', 'data' => ['zones' => [], 'people' => [['name' => 'Paul DURAND', 'role' => 'sujet', 's' => 0, 'e' => 11, 'person_id' => $liv]]]]);
$a7 = $ins(['title' => 'Mariage d’autres gens', 'kind' => 'mariage', 'date' => '20 janv. 1788', 'place' => 'Tulle', 'body' => 'Jacques DURAND et Louise LACOMBE', 'data' => ['zones' => []]]);
require_once 'lib/atelier_plus3.php';
$clean = txp3_clean_extra(['outline' => [['s' => 'x', 'h' => "  Comparution\n ", 'at' => "furent\u{0000} présents", 'auto' => 1], ['s' => 40, 'h' => ''], ['s' => 5, 'h' => str_repeat('a', 300)]], 'twins' => [['id' => 3, 'rel' => 'bans'], ['id' => 3], ['id' => -1], ['id' => 9, 'rel' => '<x>']], 'evil' => 1]);
echo json_encode(['m' => $m, 'pierre' => $pierre, 'liv' => $liv, 'a1' => $a1, 'a2' => $a2, 'a3' => $a3, 'a4' => $a4, 'a5' => $a5, 'a6' => $a6, 'a7' => $a7, 'clean' => $clean,
    'scan' => txp3_scan_doubts("de Pierre Ma?aud labr\nMa…d [?] mot[?] [illisible] etc. le 12/03 Jean?\nfin. ſœur Lacom?e"),
    'days' => [txp3_days('12 nov. 1787'), txp3_days('12 9bre 1787'), txp3_days('1787-11-10'), txp3_days('nov. 1787'), txp3_days('1787'), txp3_days('sans date')],
    'kinds' => [txp3_twin_kind(['kind' => 'autre', 'title' => 'Publication des bans', 'body' => '']), txp3_twin_kind(['kind' => 'mariage', 'title' => 'Mariage', 'body' => 'après la publication de trois bans']), txp3_twin_kind(['kind' => 'notarial', 'title' => 'Contrat de mariage', 'body' => ''])],
    'u16' => txp3_u16_slice('a😀bc', 1, 3)], JSON_UNESCAPED_UNICODE);`, { TX_BODY: BODY, TX_ZONES: JSON.stringify(zones(BODY)), TX_NAIS: NAIS, TX_NZONES: JSON.stringify(zones(NAIS)), TX_LONG: LONG }));
    out.seed = seed;
    const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const port = await freePort(), base = `http://127.0.0.1:${port}/`;
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env, stdio: 'ignore' });
    const browser = await chromium.launch();
    try {
        for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
        const ctxB = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
        const p = await ctxB.newPage(); const errs = [];
        p.on('pageerror', e => errs.push(e.message));
        p.on('console', m => { if (m.type() === 'error' && process.env.DEBUG) console.log('console:', m.text()); });
        // 🎤 une reconnaissance vocale imitée : en ligne au départ (available → « unavailable »), locale si __srLocal
        await p.addInitScript(() => {
            window.LCNDA_SHEET_LAZY_OFF = true;
            window.__recs = [];
            window.SpeechRecognition = class { constructor() { this.lang = ''; window.__recs.push(this); } start() { this.started = true; } stop() { this.stopped = true; } static available() { return Promise.resolve(window.__srLocal || 'unavailable'); } };
        });
        await p.goto(base);
        await p.waitForFunction(() => window.LCNDA_EXT?.openActTranscriber && window.LCNDA_EXT?.txPlus3Data && window.LCNDA_APP?.state?.csrf, null, { timeout: 30000 });
        await p.evaluate(() => { try { Object.keys(localStorage).filter(k => /^genealogie-tx-/.test(k)).forEach(k => localStorage.removeItem(k)); localStorage.setItem('genealogie-tx-aides', '0'); } catch (_) {} });
        const api = (a, q = {}) => p.evaluate(([x, y]) => window.LCNDA_APP.api(x, y).then(r => r, e => ({ error: e.message })), [a, q]);
        const apiPost = (a, b) => p.evaluate(([x, y]) => window.LCNDA_APP.api(x, {}, { method: 'POST', body: y }).then(r => r?.result || r, e => ({ error: e.message })), [a, b]);
        const D = 'dialog.h-tx-dlg';
        const openAct = async id => { await p.evaluate(i => window.LCNDA_EXT.openActTranscriber({ id: i }), id); await p.waitForFunction(d => document.querySelector(`${d} [data-ap3-row]`) && document.querySelector(`${d} [data-tx-body]`)?.value, D, { timeout: 15000 }); await sleep(700); };
        const closeAct = async () => { await p.evaluate(d => document.querySelector(`${d} [data-tx-cmd="close"]`)?.click(), D); await sleep(300);
            await p.evaluate(() => { const b = [...document.querySelectorAll('dialog[open] button')].find(x => /Fermer sans|Enregistrer et fermer/.test(x.textContent)); b?.click(); }); await sleep(500); };
        const menuLabels = async m => { await p.click(`${D} [data-ui-menu="${m}"]`); await sleep(150); const l = await p.evaluate(() => [...document.querySelectorAll('.ui-actmenu [role="menuitem"]')].map(b => b.textContent.replace(/\s+/g, ' ').trim() + (b.disabled || b.getAttribute('aria-disabled') === 'true' ? ' [off]' : ''))); await p.keyboard.press('Escape'); await sleep(150); return l; };
        const menu = async (m, label) => { await p.click(`${D} [data-ui-menu="${m}"]`); await sleep(150); const ok = await p.evaluate(l => { const b = [...document.querySelectorAll('.ui-actmenu [role="menuitem"]')].find(x => x.textContent.includes(l)); if (b) b.click(); else document.body.click(); return !!b; }, label); await sleep(400); return ok; };
        const save = async () => { await p.evaluate(d => document.querySelector(`${d} [data-tx-cmd="save"]`).click(), D); await sleep(900); };
        const topDlg = () => p.evaluate(() => [...document.querySelectorAll('dialog[open]')].at(-1)?.className || '');
        const closeTop = () => p.evaluate(() => { const d = [...document.querySelectorAll('dialog[open]')].at(-1); (d.querySelector('[type=submit]') || d.querySelector('[data-h-close]'))?.click(); });
        const toasts = () => p.evaluate(() => [...document.querySelectorAll('.toast')].map(t => t.textContent.replace(/\s+/g, ' ')).join(' | '));
        const undoLast = () => p.evaluate(() => { const b = [...document.querySelectorAll('.toast button, [data-undo]')].filter(x => /Annuler/.test(x.textContent)).at(-1); b?.click(); return !!b; });
        const shot = async n => { if (process.env.SHOTS) { fs.mkdirSync(process.env.SHOTS, { recursive: true }); await p.screenshot({ path: path.join(process.env.SHOTS, n) }); } };
        const select = (needle, len) => p.evaluate(([d, n, l]) => { const a = document.querySelector(`${d} [data-tx-body]`); const s = a.value.indexOf(n); a.focus(); a.setSelectionRange(s, s + (l ?? n.length)); }, [D, needle, len]);

        /* ═════ menus, ⚙️ Personnaliser ═════ */
        await openAct(seed.a1);
        out.noDict = await p.evaluate(d => document.querySelector(`${d} [data-tx-body]`).hasAttribute('data-no-dictation'), D);
        out.fichier = await menuLabels('Fichier'); out.edition = await menuLabels('Édition'); out.outils = await menuLabels('Outils'); out.affichage = await menuLabels('Affichage');
        await p.evaluate(d => document.querySelector(`${d} [data-tx-cmd="barcfg"]`)?.click(), D); await sleep(300);
        out.prefs = await p.evaluate(() => [...document.querySelectorAll('dialog.h-txb-dlg [data-ap3-pref]')].map(i => `${i.dataset.ap3Pref}:${i.checked}`));
        await p.evaluate(() => document.querySelector('dialog.h-txb-dlg [data-x]')?.click()); await sleep(200);

        /* ═════ 10 ✏️ rayé, ajout, marge ═════ */
        await select('douze'); await menu('Édition', 'Rayé, ajout'); out.marksMenu = await p.evaluate(() => [...document.querySelectorAll('.ui-actmenu [role="menuitem"]')].map(b => b.textContent.replace(/\s+/g, ' ').trim()));
        await p.evaluate(() => [...document.querySelectorAll('.ui-actmenu [role="menuitem"]')].find(b => /Mot rayé/.test(b.textContent)).click()); await sleep(300);
        await p.evaluate(d => { const a = document.querySelector(`${d} [data-tx-body]`); const s = a.value.indexOf('fils légitime'); a.focus(); a.setSelectionRange(s, s + 4); }, D);
        await menu('Édition', 'Rayé, ajout'); await p.evaluate(() => [...document.querySelectorAll('.ui-actmenu [role="menuitem"]')].find(b => /Ajouté entre les lignes/.test(b.textContent)).click()); await sleep(300);
        await p.evaluate(d => { const a = document.querySelector(`${d} [data-tx-body]`); a.focus(); a.setSelectionRange(a.value.length, a.value.length); }, D);
        await menu('Édition', 'Rayé, ajout'); await p.evaluate(() => [...document.querySelectorAll('.ui-actmenu [role="menuitem"]')].find(b => /Note en marge/.test(b.textContent)).click()); await sleep(200);
        await p.keyboard.type('nota bene'); await sleep(500);
        out.marked = await p.evaluate(d => ({ v: document.querySelector(`${d} [data-tx-body]`).value, spans: [...document.querySelectorAll(`${d} .h-tx-mirror .h-tx-ab2`)].filter(s => /is-(del|add|margin)/.test(s.className)).map(s => [s.textContent, s.className.replace('h-tx-ab2', '').trim()]) }), D);
        await menu('Affichage', 'Cacher les mots rayés'); await sleep(300);
        out.hidden = await p.evaluate(d => ({ n: document.querySelectorAll(`${d} .h-tx-mirror .h-tx-ab2.is-del`).length, ls: localStorage.getItem('genealogie-tx-ratures') }), D);
        out.afterHide = await menuLabels('Affichage');
        await menu('Affichage', 'Montrer les mots rayés'); await sleep(300);
        out.shown = await p.evaluate(d => document.querySelectorAll(`${d} .h-tx-mirror .h-tx-ab2.is-del`).length, D);
        // le TEI exporté (Fichier → Exporter → 🗂 TEI)
        await menu('Fichier', 'Exporter'); await sleep(400);
        await p.evaluate(() => [...document.querySelectorAll('dialog[open] .ui-export-fmt')].find(b => b.dataset.fmt === 'tei')?.click()); await sleep(150);
        const dl = p.waitForEvent('download', { timeout: 10000 }).catch(() => null);
        await p.evaluate(() => [...document.querySelectorAll('dialog[open]')].at(-1).querySelector('[data-ui-go]')?.click());
        const dlf = await dl; out.tei = dlf ? fs.readFileSync(await dlf.path(), 'utf8') : '';
        await sleep(300);
        // le texte remis comme au départ (les autres essais lisent BODY)
        await p.evaluate(([d, b]) => { const a = document.querySelector(`${d} [data-tx-body]`); a.value = b; a.dispatchEvent(new Event('input', { bubbles: true })); }, [D, BODY]); await save();

        /* ═════ 8 👥 le tableau des personnes ═════ */
        await menu('Outils', 'Personnes et liens'); await p.waitForSelector('dialog.ap3-pdlg');
        out.ptab = await p.evaluate(() => [...document.querySelectorAll('dialog.ap3-pdlg tbody tr')].map(tr => [...tr.children].map(td => td.textContent.replace(/\s+/g, ' ').trim()).slice(0, 5).join(' | ')));
        // 🔗 relier : le choix de fiche commun (imité ici : il rend la fiche de Pierre MAZAUD)
        await p.evaluate(pid => { const P = window.LCNDA_PICKER || window.LCNDA_APP; window.__openPicker = P.openPicker; P.openPicker = async o => { window.__pickerAsked = o; return { id: pid, title: 'Pierre MAZAUD' }; }; }, seed.pierre);
        out.linkClicked = await p.evaluate(() => { const tr = [...document.querySelectorAll('dialog.ap3-pdlg tbody tr')].find(t => /Pierre MAZAUD/.test(t.textContent)); const b = tr?.querySelector('[data-ap3-link]'); b?.click(); return !!b; }); await sleep(700);
        out.linked = await p.evaluate(d => ({ asked: window.__pickerAsked?.q, row: [...document.querySelectorAll('dialog.ap3-pdlg tbody tr')].find(t => /Pierre MAZAUD/.test(t.textContent))?.textContent.replace(/\s+/g, ' ') }), D);
        await p.evaluate(() => { const P = window.LCNDA_PICKER || window.LCNDA_APP; P.openPicker = window.__openPicker; });
        await save();
        out.savedLink = (await api('act_transcription', { id: seed.a1 })).data.people;
        await undoLast(); await sleep(700); await save();
        out.savedUnlink = (await api('act_transcription', { id: seed.a1 })).data.people;
        // ＋ créer une fiche (l'acte en source), puis ↶ Annuler
        out.createClicked = await p.evaluate(() => { const tr = [...document.querySelectorAll('dialog.ap3-pdlg tbody tr')].find(t => /Anne/.test(t.textContent)); const b = tr?.querySelector('[data-ap3-create]'); b?.click(); return !!b; });
        await p.waitForFunction(() => [...document.querySelectorAll('dialog.ap3-pdlg tbody tr')].some(t => /Anne/.test(t.textContent) && /👤/.test(t.textContent)), null, { timeout: 15000 }).catch(() => {});
        out.created = await p.evaluate(() => [...document.querySelectorAll('dialog.ap3-pdlg tbody tr')].find(t => /Anne/.test(t.textContent))?.textContent.replace(/\s+/g, ' '));
        out.createToast = await toasts();
        out.createdPerson = JSON.parse(php(String.raw`require 'lib/bootstrap.php'; $pdo = db(); $r = $pdo->query("SELECT p.id, p.first_name, p.last_name, (SELECT COUNT(*) FROM source_links s WHERE s.entity_type='person' AND s.entity_id=p.id) AS src FROM persons p WHERE p.first_name='Anne'")->fetchAll(PDO::FETCH_ASSOC); echo json_encode($r, JSON_UNESCAPED_UNICODE);`));
        await undoLast(); await sleep(1200);
        out.afterUndoPerson = JSON.parse(php(String.raw`require 'lib/bootstrap.php'; echo json_encode(db()->query("SELECT COUNT(*) FROM persons WHERE first_name='Anne'")->fetchColumn());`));
        /* ═════ 9 🕸 le croquis ═════ */
        await p.evaluate(() => document.querySelector('dialog.ap3-pdlg [data-ap3-ptab="sketch"]').click()); await sleep(300);
        out.sketch = await p.evaluate(() => { const s = document.querySelector('dialog.ap3-pdlg svg.ap3-sk'); return s ? { nodes: [...s.querySelectorAll('[data-ap3-sk]')].map(g => g.getAttribute('aria-label')), parent: s.querySelectorAll('.is-parent').length, sponsor: s.querySelectorAll('.is-sponsor').length, found: !!document.querySelector('dialog.ap3-pdlg [data-ap3-found]') } : null; });
        await p.evaluate(() => { const g = [...document.querySelectorAll('dialog.ap3-pdlg [data-ap3-sk]')].find(x => /Pierre MAZAUD/.test(x.getAttribute('aria-label'))); g?.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await sleep(300);
        out.skSel = await p.evaluate(d => { const a = document.querySelector(`${d} [data-tx-body]`); return a.value.slice(a.selectionStart, a.selectionEnd); }, D);
        await shot('croquis.png');
        await closeTop(); await sleep(300);

        /* ═════ 11 ❓ les mots douteux de tous les actes ═════ */
        await menu('Outils', 'Mots douteux'); await p.waitForSelector('dialog.ap3-ddlg');
        out.doubts = await p.evaluate(() => ({ sum: document.querySelector('dialog.ap3-ddlg [data-ap3-d]') ? document.querySelector('dialog.ap3-ddlg .ap3-d-sum').textContent : '', words: [...document.querySelectorAll('dialog.ap3-ddlg .ap3-d-row mark')].map(m => m.textContent), imgs: [...document.querySelectorAll('dialog.ap3-ddlg .ap3-d-img')].map(i => i.getAttribute('src')) }));
        const im = out.doubts.imgs.find(s => s.includes(`act=${seed.a2}`));
        out.thumb = im ? await p.evaluate(u => fetch(u).then(r => ({ s: r.status, t: r.headers.get('content-type') })), im) : null;
        out.thumbNat = await p.evaluate(() => { const i = [...document.querySelectorAll('dialog.ap3-ddlg .ap3-d-img')][0]; return i ? new Promise(r => { if (i.complete) r(i.naturalWidth); else i.onload = () => r(i.naturalWidth); setTimeout(() => r(i.naturalWidth), 3000); }) : 0; });
        // un mot d'un autre acte corrigé (LACOM?E → LACOMBE) : la version d'avant gardée ; ↶ Annuler
        await p.evaluate(() => { const r = [...document.querySelectorAll('dialog.ap3-ddlg .ap3-d-row')].find(x => /LACOM\?E/.test(x.textContent)); r.querySelector('[data-ap3-din]').value = 'LACOMBE'; r.querySelector('[data-ap3-dfix]').click(); }); await sleep(900);
        out.fixed = await p.evaluate(() => [...document.querySelectorAll('dialog.ap3-ddlg .ap3-d-row.is-ok')].map(r => r.textContent.replace(/\s+/g, ' ')));
        out.a2after = await api('act_transcription', { id: seed.a2 });
        out.a2versions = (await api('act_transcription_versions', { act_id: seed.a2 })).items.map(v => v.label);
        await undoLast(); await sleep(900);
        out.a2undo = (await api('act_transcription', { id: seed.a2 })).body;
        // dans l'acte ouvert : « Ma?aud » → « Mazaud » directement dans l'Atelier
        await p.evaluate(() => { const r = [...document.querySelectorAll('dialog.ap3-ddlg .ap3-d-row')].find(x => /Ma\?aud/.test(x.textContent)); r.querySelector('[data-ap3-din]').value = 'Mazaud'; r.querySelector('[data-ap3-dfix]').click(); }); await sleep(900);
        out.localFix = await p.evaluate(d => document.querySelector(`${d} [data-tx-body]`).value.includes('signer Mazaud'), D);
        await shot('douteux.png');
        await closeTop(); await sleep(300); await save();

        /* ═════ 13 🆚 un relevé collé ═════ */
        await menu('Fichier', 'Comparer avec un relevé'); await p.waitForSelector('dialog.ap3-rdlg');
        await p.fill('dialog.ap3-rdlg [data-ap3-rin]', 'Date;Type;Nom;Prénom;Père;Mère\n12/11/1787;Baptême;MAZAUD;Jean;Pierre MAZAUD;Marie DURAND'); await sleep(300);
        out.releve = await p.evaluate(() => ({ map: [...document.querySelectorAll('dialog.ap3-rdlg [data-ap3-rmap]')].map(s => s.value), rows: [...document.querySelectorAll('dialog.ap3-rdlg .ap3-rtab tbody tr')].map(r => `${r.className}:${r.children[1].textContent}`), sum: document.querySelector('dialog.ap3-rdlg .ap3-r-sum')?.textContent }));
        await p.evaluate(() => { const s = document.querySelector('dialog.ap3-rdlg [data-ap3-rmap="5"]'); s.value = ''; s.dispatchEvent(new Event('change', { bubbles: true })); }); await sleep(200);
        out.releveIgnore = await p.evaluate(() => [...document.querySelectorAll('dialog.ap3-rdlg .ap3-rtab tbody tr')].map(r => `${r.className}:${r.children[1].textContent}`));
        await closeTop(); await sleep(300);

        /* ═════ 14 🔗 les actes jumeaux ═════ */
        await menu('Outils', 'Actes jumeaux'); await p.waitForSelector('dialog.ap3-twdlg');
        out.twins = await p.evaluate(() => [...document.querySelectorAll('dialog.ap3-twdlg .ap3-tw')].map(c => c.textContent.replace(/\s+/g, ' ').trim()));
        await p.evaluate(() => document.querySelector('dialog.ap3-twdlg [data-ap3-twside="0"]').click()); await sleep(700);
        out.side = await p.evaluate(() => ({ cols: document.querySelectorAll('dialog.ap3-twdlg .ap3-side-g section').length, marks: document.querySelectorAll('dialog.ap3-twdlg .ap3-side-g mark').length, imgs: document.querySelectorAll('dialog.ap3-twdlg .ap3-side-g img').length }));
        await p.evaluate(() => document.querySelector('dialog.ap3-twdlg [data-ap3-twon="0"]').click()); await sleep(800);
        out.twinChip = await p.evaluate(d => ({ hidden: document.querySelector(`${d} [data-ap3-twins]`).hidden, text: document.querySelector(`${d} [data-ap3-twins]`).textContent.replace(/\s+/g, ' ') }), D);
        out.other = (await api('act_transcription', { id: seed.a2 })).data.twins;
        await closeTop(); await sleep(200); await save();
        out.mine = (await api('act_transcription', { id: seed.a1 })).data.twins;
        await undoLast(); await sleep(900); await save();
        out.mineUndo = (await api('act_transcription', { id: seed.a1 })).data.twins ?? null; out.otherUndo = (await api('act_transcription', { id: seed.a2 })).data.twins ?? null;
        out.twinsMar = await api('atelier_plus3', { op: 'twins', act_id: seed.a3 });

        /* ═════ 12 🎤 la dictée ═════ */
        out.dict0 = (await menuLabels('Outils')).filter(l => /Dicter/.test(l));
        await p.evaluate(() => { localStorage.setItem('genealogie-tx-dictee', '1'); }); await closeAct(); await openAct(seed.a1); await sleep(400);
        out.dict1 = (await menuLabels('Outils')).filter(l => /Dicter/.test(l));
        await p.evaluate(d => { const a = document.querySelector(`${d} [data-tx-body]`); a.focus(); a.setSelectionRange(a.value.length, a.value.length); }, D);
        await menu('Outils', 'Dicter'); await sleep(500);
        out.dictWarn = await p.evaluate(() => { const d = [...document.querySelectorAll('dialog[open]')].at(-1); return { title: d.querySelector('h2')?.textContent, text: d.textContent.replace(/\s+/g, ' '), recs: window.__recs.length }; });
        await p.evaluate(() => [...document.querySelectorAll('dialog[open]')].at(-1).querySelector('[type=submit]').click()); await sleep(400);
        out.dictOn = await p.evaluate(d => ({ recs: window.__recs.length, started: !!window.__recs.at(-1)?.started, lang: window.__recs.at(-1)?.lang, local: window.__recs.at(-1)?.processLocally, bar: document.querySelector(`${d} [data-ap3-dictbar]`).textContent.replace(/\s+/g, ' '), mode: document.querySelector(d).dataset.ap3Dict }), D);
        await p.evaluate(() => { const r = window.__recs.at(-1); r.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: 'Jean curé' }], { isFinal: true })] }); }); await sleep(300);
        out.dictText = await p.evaluate(d => document.querySelector(`${d} [data-tx-body]`).value.slice(-30), D);
        await p.evaluate(d => document.querySelector(`${d} [data-ap3-dstop]`).click(), D); await sleep(200);
        out.dictOff = await p.evaluate(d => ({ hidden: document.querySelector(`${d} [data-ap3-dictbar]`).hidden, stopped: !!window.__recs.at(-1)?.stopped }), D);
        await p.evaluate(([d, b]) => { const a = document.querySelector(`${d} [data-tx-body]`); a.value = b; a.dispatchEvent(new Event('input', { bubbles: true })); }, [D, BODY]); await save();
        // un acte lié à une personne vivante : pas en ligne ; la reconnaissance locale : sans avertissement
        await closeAct(); await openAct(seed.a6); await sleep(500);
        out.dictLiving = (await menuLabels('Outils')).filter(l => /Dicter/.test(l));
        out.privacy = await api('atelier_plus3', { op: 'privacy', act_id: seed.a6 });
        await p.evaluate(() => { window.__srLocal = 'available'; }); await closeAct(); await openAct(seed.a6); await sleep(500);
        out.dictLocalMenu = (await menuLabels('Outils')).filter(l => /Dicter/.test(l));
        const nRec = await p.evaluate(() => window.__recs.length);
        await menu('Outils', 'Dicter'); await sleep(500);
        out.dictLocal = await p.evaluate(([d, n]) => ({ dlg: [...document.querySelectorAll('dialog[open]')].filter(x => !x.matches('.h-tx-dlg')).length, recs: window.__recs.length - n, local: window.__recs.at(-1)?.processLocally, mode: document.querySelector(d).dataset.ap3Dict }), [D, nRec]);
        await p.evaluate(d => document.querySelector(`${d} [data-ap3-dstop]`)?.click(), D);
        await p.evaluate(() => { window.__srLocal = ''; localStorage.removeItem('genealogie-tx-dictee'); });

        /* ═════ 8 👥 🔒 une fiche vivante dans le tableau ; 7 🗂 le plan d'un long acte ═════ */
        await menu('Outils', 'Personnes et liens'); await p.waitForSelector('dialog.ap3-pdlg');
        out.ptabLiving = await p.evaluate(() => ({ text: document.querySelector('dialog.ap3-pdlg tbody')?.textContent.replace(/\s+/g, ' '), create: [...document.querySelectorAll('dialog.ap3-pdlg [data-ap3-create]')].map(b => b.disabled) }));
        await closeTop(); await sleep(200);
        await closeAct(); await openAct(seed.a5);
        await p.evaluate(d => document.querySelector(`${d} [data-txh-toggle]`).click(), D); await sleep(200);
        out.secs = await p.evaluate(d => [...document.querySelectorAll(`${d} [data-txh-sec]`)].map(s => s.dataset.txhSec), D);
        await menu('Édition', 'Plan de l’acte'); await sleep(400);
        out.plan0 = await p.evaluate(d => document.querySelector(`${d} [data-txh-body="plan"]`)?.textContent.replace(/\s+/g, ' '), D);
        await p.evaluate(d => document.querySelector(`${d} [data-ap3-sugg]`).click(), D); await sleep(300);
        out.plan1 = await p.evaluate(d => [...document.querySelectorAll(`${d} [data-ap3-h]`)].map(i => i.value), D);
        await p.evaluate(d => { const i = document.querySelector(`${d} [data-ap3-h="1"]`); i.value = 'Les comparants'; i.dispatchEvent(new Event('change', { bubbles: true })); }, D); await sleep(200);
        await p.evaluate(d => document.querySelector(`${d} [data-ap3-del="0"]`).click(), D); await sleep(200);
        out.plan2 = await p.evaluate(d => [...document.querySelectorAll(`${d} [data-ap3-h]`)].map(i => i.value), D);
        await undoLast(); await sleep(300);
        out.plan3 = await p.evaluate(d => [...document.querySelectorAll(`${d} [data-ap3-h]`)].map(i => i.value), D);
        await p.evaluate(d => { const b = [...document.querySelectorAll(`${d} [data-ap3-go]`)].find(x => x.closest('li').querySelector('input')?.value === 'Apports et dot'); b.click(); }, D); await sleep(300);
        out.planGo = await p.evaluate(d => { const a = document.querySelector(`${d} [data-tx-body]`); return a.value.slice(a.selectionStart, a.selectionEnd); }, D);
        await save();
        out.savedPlan = (await api('act_transcription', { id: seed.a5 })).data.outline;
        await shot('plan.png');

        /* ═════ consultation (lecture seule) : les menus sans écriture ; rien n'est écrit ; rien de nommé ═════ */
        await p.evaluate(() => document.body.classList.add('is-kiosk'));
        out.kioskEdit = await menuLabels('Édition');
        await p.evaluate(() => document.body.classList.remove('is-kiosk'));
        /* ═════ 390 px, sombre ═════ */
        await p.setViewportSize({ width: 390, height: 800 }); await sleep(400);
        await p.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark')); await sleep(200);
        await menu('Outils', 'Personnes et liens'); await p.waitForSelector('dialog.ap3-pdlg');
        out.overflow = await p.evaluate(d => [...document.querySelectorAll(`${d} [data-ap3-row], dialog.ap3-pdlg .h-dialog-body, dialog.ap3-pdlg .ap3-ptab-w`)].filter(e => !e.hidden && e.scrollWidth > e.clientWidth + 2).map(e => e.className), D);
        out.pageOverflow = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
        await shot('telephone.png');
        await closeTop(); await sleep(200);
        await closeAct();
        php(`require 'lib/bootstrap.php'; kiosk_enter(['password' => 'secret12']);`);
        try {
            out.kioskWrite = await p.evaluate(a => window.LCNDA_APP.api('atelier_plus3_write', {}, { method: 'POST', body: { op: 'twin_link', act_id: a[0], other_id: a[1], on: 1 } }).then(() => 'ok', e => e.message), [seed.a1, seed.a2]);
            out.kioskDoubts = (await api('atelier_plus3', { op: 'doubts' })).items?.map(x => x.act_id) || [];
            out.kioskPeople = (await api('atelier_plus3', { op: 'people_info', ids: String(seed.liv) })).people;
        } finally { fs.rmSync(path.join(dir, 'consultation.json'), { force: true }); }
        out.errs = errs;
    } finally { await browser.close(); proc.kill(); }
}

(async () => {
    const out = {};
    let browserOk = !!chromium;
    if (browserOk) { try { await browserPart(out); } catch (e) { console.error(e); failed++; browserOk = false; out.crashed = true; } }
    if (out.seed) {
        const s = out.seed;
        check('🛡 serveur : data.outline et data.twins nettoyés (bornés, triés, sans caractère nul ; sortes inconnues → autre ; un seul lien par acte)', () => {
            assert.deepEqual(s.clean.outline, [{ s: 0, h: 'Comparution', at: 'furent présents', auto: true }, { s: 5, h: 'a'.repeat(120), at: '' }]);
            assert.deepEqual(s.clean.twins, [{ id: 3, rel: 'bans' }, { id: 9, rel: 'autre' }]); assert.ok(!('evil' in s.clean));
        });
        check('❓ 11 : le serveur repère les mêmes mots douteux que le navigateur (positions UTF-16, ſ et œ compris)', () => {
            const t = 'de Pierre Ma?aud labr\nMa…d [?] mot[?] [illisible] etc. le 12/03 Jean?\nfin. ſœur Lacom?e';
            assert.deepEqual(s.scan, X.scanDoubts(t)); assert.equal(s.u16, '😀');
        });
        check('🔗 14 : les dates des jumeaux (« 12 nov. 1787 », « 9bre », ISO, mois, année) et les sortes (bans, mariage, contrat)', () => {
            const [a, b, c, m, y, none] = s.days; assert.equal(a[1], 'd'); assert.deepEqual(a, b); assert.equal(a[0] - c[0], 2); assert.equal(m[1], 'm'); assert.equal(y[1], 'y'); assert.deepEqual(none, [null, '']);
            assert.deepEqual(s.kinds, ['bans', 'mariage', 'contrat']);
        });
    }
    if (browserOk) {
        check('menus : Fichier (🆚 relevé), Édition (✏️ rayé / ajout / marge, 🗂 plan), Outils (👥, ❓, 🔗), Affichage (✏️ cacher) ; 🧰 « Plan de l’acte » ; ⚙️ Personnaliser (ratures : oui, dictée : non)', () => {
            assert.ok(out.fichier.some(l => /Comparer avec un relevé/.test(l)), out.fichier.join(' | '));
            assert.ok(out.edition.some(l => /Rayé, ajout entre les lignes, note en marge/.test(l)) && out.edition.some(l => /Plan de l’acte/.test(l)), out.edition.join(' | '));
            ['Personnes et liens de l’acte', 'Mots douteux de tous les actes', 'Actes jumeaux'].forEach(x => assert.ok(out.outils.some(l => l.includes(x)), x));
            assert.ok(out.affichage.some(l => /Cacher les mots rayés/.test(l))); assert.ok(out.secs.includes('plan'));
            assert.deepEqual(out.prefs, ['ratures:true', 'dictee:false']);
        });
        check('✏️ 10 : rayé 〚douze〛, ajout \\fils/, note en marge écrite au curseur ; soulignés à leur façon ; cachés puis montrés (Affichage, retenu)', () => {
            assert.deepEqual(out.marksMenu.map(l => l.replace(/^\S+\s+\S*\s*/, '').trim()).length, 3);
            assert.match(out.marked.v, /et le 〚douze〛\n/); assert.match(out.marked.v, /baptisé Jean \\fils\/ légitime/); assert.match(out.marked.v, /\[en marge : nota bene\]$/);
            assert.deepEqual(out.marked.spans.map(x => x[1]), ['is-del', 'is-add', 'is-margin'], JSON.stringify(out.marked.spans));
            assert.deepEqual(out.hidden, { n: 0, ls: '0' }); assert.ok(out.afterHide.some(l => /Montrer les mots rayés/.test(l))); assert.equal(out.shown, 1);
        });
        check('✏️ 10 : gardés dans l’export TEI : <del rend="strikethrough">, <add place="above">, <note place="margin">', () => {
            assert.match(out.tei, /<lb n="1" facs="#z_z0"\/>L’an mil sept cent quatre vingt sept et le <del rend="strikethrough">douze<\/del>/);
            assert.match(out.tei, /baptisé Jean <add place="above">fils<\/add> légitime/); assert.match(out.tei, /<note place="margin">nota bene<\/note>/);
        });
        check('👥 8 : le tableau : chaque personne avec son rôle, son métier ; le « parent » de l’enfant devient Père / Mère', () => {
            const t = out.ptab.join('\n'); assert.match(t, /Père \| Pierre MAZAUD \| — \| laboureur/); assert.match(t, /Mère \| Marie LACOMBE/); assert.match(t, /Parrain \| Jean DURAND/); assert.match(t, /Marraine \| Anne/);
        });
        check('👥 8 : 🔗 relier par le choix de fiche commun (cherché sur le nom), gardé avec l’acte ; ↶ Annuler le défait', () => {
            assert.equal(out.linkClicked, true); assert.equal(out.linked.asked, 'Pierre MAZAUD'); assert.match(out.linked.row, /👤 Pierre MAZAUD/);
            assert.ok(out.savedLink.some(p => p.name === 'Pierre MAZAUD' && p.person_id === out.seed.pierre), JSON.stringify(out.savedLink));
            assert.ok(!(out.savedUnlink || []).some(p => p.person_id === out.seed.pierre), JSON.stringify(out.savedUnlink));
        });
        check('👥 8 : ＋ créer une fiche : la personne créée avec l’acte en source, reliée ; ↶ Annuler retire la fiche', () => {
            assert.equal(out.createClicked, true); assert.match(out.created || '', /👤/); assert.match(out.createToast, /Fiche créée : Anne/);
            assert.equal(out.createdPerson.length, 1); assert.equal(out.createdPerson[0].last_name, 'MAZAUD'); assert.ok(Number(out.createdPerson[0].src) >= 1, 'source reliée');
            assert.equal(Number(out.afterUndoPerson), 0);
        });
        check('👥 8 : 🔒 la fiche vivante reliée est marquée ; pas de « Créer » pour un acte de moins de 100 ans', () => {
            assert.match(out.ptabLiving.text, /🔒/); assert.ok(out.ptabLiving.create.length >= 1 && out.ptabLiving.create.every(Boolean), JSON.stringify(out.ptabLiving));
        });
        check('🕸 9 : le croquis : les personnes, parents → enfant, parrain et marraine ; un clic montre la personne dans le texte ; puis « Ajouter à la généalogie »', () => {
            assert.ok(out.sketch.nodes.length >= 5, JSON.stringify(out.sketch)); assert.ok(out.sketch.nodes.some(n => /^Père : Pierre MAZAUD/.test(n)));
            assert.ok(out.sketch.parent >= 2 && out.sketch.sponsor >= 2, JSON.stringify(out.sketch)); assert.equal(out.sketch.found, true); assert.equal(out.skSel, 'Pierre MAZAUD');
        });
        check('❓ 11 : les mots douteux de tous les actes (« Ma?aud », « LACOM?E », « Jea?n »), avec l’image du mot (JPEG)', () => {
            ['Ma?aud', 'LACOM?E', 'Jea?n'].forEach(w => assert.ok(out.doubts.words.includes(w), w + ' : ' + out.doubts.words)); assert.match(out.doubts.sum, /3 mots douteux dans 3 actes/);
            assert.deepEqual(out.thumb, { s: 200, t: 'image/jpeg' }); assert.ok(out.thumbNat > 20, String(out.thumbNat));
        });
        check('❓ 11 : corrigé dans l’autre acte (zones suivies), le texte d’avant dans 🕘 Versions ; ↶ Annuler le remet ; dans l’acte ouvert : dans l’Atelier', () => {
            assert.ok(out.fixed.some(t => /LACOMBE/.test(t))); assert.match(out.a2after.body, /Marie LACOMBE$/); assert.equal(out.a2after.data.zones[1].e, out.a2after.body.length);
            assert.ok(out.a2versions.some(l => /Avant : « LACOM\?E » → « LACOMBE »/.test(l)), out.a2versions.join(' | ')); assert.match(out.a2undo, /LACOM\?E$/); assert.equal(out.localFix, true);
        });
        check('🆚 13 : la ligne collée : cases reconnues d’après l’en-tête, la mère différente ; une case ignorée ne compte plus', () => {
            assert.deepEqual(out.releve.map, ['date', 'type', 'nom', 'prenom', 'pere', 'mere']);
            assert.ok(out.releve.rows.includes('is-same:Nom') && out.releve.rows.includes('is-same:Prénom') && out.releve.rows.includes('is-diff:Mère') && out.releve.rows.includes('is-same:Date'), JSON.stringify(out.releve)); assert.match(out.releve.sum, /différence/);
            assert.ok(out.releveIgnore.includes('is-mine:Mère'), JSON.stringify(out.releveIgnore));
        });
        check('🔗 14 : baptême ↔ naissance (mêmes personnes, 2 jours) ; côte à côte avec les noms marqués ; lié dans les deux actes ; ↶ Annuler défait les deux', () => {
            assert.match(out.twins[0], /Naissance et baptême/); assert.match(out.twins[0], /Naissance de Jean MAZAUD/); assert.match(out.twins[0], /2 jours d’écart/);
            assert.deepEqual(out.side.cols, 2); assert.ok(out.side.marks >= 2 && out.side.imgs === 2, JSON.stringify(out.side));
            assert.equal(out.twinChip.hidden, false); assert.match(out.twinChip.text, /Naissance et baptême · Naissance de Jean MAZAUD/);
            assert.deepEqual(out.other, [{ id: out.seed.a1, rel: 'bapteme' }]); assert.deepEqual(out.mine, [{ id: out.seed.a2, rel: 'bapteme' }]);
            assert.equal(out.mineUndo, null); assert.deepEqual(out.otherUndo ?? [], []);
        });
        check('🔗 14 : mariage ↔ publication des bans (14 jours) ; un autre mariage le même jour, sans les mêmes personnes, n’est pas proposé', () => {
            const it = out.twinsMar.items; assert.equal(it[0].id, out.seed.a4); assert.equal(it[0].rel, 'bans'); assert.equal(it[0].days, 14); assert.ok(!it.some(x => x.id === out.seed.a7));
        });
        check('🎤 12 : éteinte au départ ; allumée : en ligne, l’app le dit avant (rien n’écoute avant « Dicter quand même ») ; le texte dicté arrive au curseur ; ■', () => {
            assert.deepEqual(out.dict0, []); assert.ok(out.dict1.some(l => /Dicter \(service en ligne\)/.test(l)), out.dict1.join(' | '));
            assert.match(out.dictWarn.title, /Ta voix part sur Internet/); assert.match(out.dictWarn.text, /service en ligne/); assert.equal(out.dictWarn.recs, 0);
            assert.equal(out.dictOn.started, true); assert.equal(out.dictOn.lang, 'fr-FR'); assert.notEqual(out.dictOn.local, true); assert.equal(out.dictOn.mode, 'online'); assert.match(out.dictOn.bar, /J’écoute.*service en ligne/);
            assert.match(out.dictText, /Lacombe curé Jean curé$/); assert.deepEqual(out.dictOff, { hidden: true, stopped: true });
            assert.equal(out.noDict, true, 'le 🎤 général n’est pas proposé dans le texte de l’acte');
        });
        check('🎤 12 : un acte lié à une personne vivante : pas en ligne (dit pourquoi) ; la reconnaissance sur cet ordinateur : sans avertissement (processLocally)', () => {
            assert.ok(out.dictLiving.length === 1 && /Dicter : pas pour cet acte/.test(out.dictLiving[0]) && /personne vivante/.test(out.dictLiving[0]) && /\[off\]$/.test(out.dictLiving[0]), out.dictLiving.join(' | ')); assert.equal(out.privacy.living, true); assert.equal(out.privacy.confidential, true);
            assert.ok(out.dictLocalMenu.some(l => /sur cet ordinateur/.test(l)), out.dictLocalMenu.join(' | ')); assert.deepEqual(out.dictLocal, { dlg: 0, recs: 1, local: true, mode: 'local' });
        });
        check('🗂 7 : le plan d’un contrat proposé (comparution, apports, clauses, signatures…), un titre changé, un retiré puis ↶ remis, gardé avec l’acte ; un clic va à la partie', () => {
            assert.match(out.plan0, /Proposer le plan \(7\)/); assert.deepEqual(out.plan1, ['Préambule', 'Comparution', 'Objet de l’acte', 'Apports et dot', 'Clauses', 'Clôture', 'Signatures']);
            assert.deepEqual(out.plan2, ['Les comparants', 'Objet de l’acte', 'Apports et dot', 'Clauses', 'Clôture', 'Signatures']); assert.equal(out.plan3[0], 'Préambule'); assert.equal(out.plan3[1], 'Les comparants');
            assert.equal(out.planGo, 'le futur époux apporte en dot une vache et deux brebis');
            assert.equal(out.savedPlan.length, 7); assert.equal(out.savedPlan[1].h, 'Les comparants'); assert.equal(out.savedPlan[1].at, 'furent présents Pierre MAZAUD, l'); assert.ok(!out.savedPlan[1].auto);
        });
        check('consultation : menus sans écriture (pas de ✏️) ; écriture refusée ; l’acte lié à une personne vivante n’est pas listé ; la fiche vivante n’est pas nommée', () => {
            assert.ok(!out.kioskEdit.some(l => /Rayé, ajout/.test(l)) && out.kioskEdit.some(l => /Plan de l’acte/.test(l)), out.kioskEdit.join(' | '));
            assert.notEqual(out.kioskWrite, 'ok'); assert.ok(!out.kioskDoubts.includes(out.seed.a6) && out.kioskDoubts.includes(out.seed.a2), JSON.stringify(out.kioskDoubts));
            assert.deepEqual(out.kioskPeople, [{ id: out.seed.liv, name: 'Fiche confidentielle', private: true }]);
        });
        check('à 390 px et en sombre : la rangée et le tableau des personnes ne débordent pas de la page', () => { assert.deepEqual(out.overflow.filter(c => !/ap3-ptab-w/.test(c)), []); assert.equal(out.pageOverflow, false); });
        check('aucune erreur JS', () => assert.deepEqual(out.errs, []));
    }
    for (const [name, fn] of checks) { try { await fn(); count++; console.log('  ✓', name); } catch (e) { failed++; console.log('  ✗', name, '\n   ', e.message); } }
    if (!chromium) console.log('  (Playwright absent : la partie navigateur est sautée)');
    console.log('  (non vérifié ici : une vraie reconnaissance vocale — imitée)');
    console.log(failed ? `${failed} échec(s)` : `${count} vérifications réussies`);
    process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
