'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 📜 Atelier de transcription — 🧰 les aides (assets/js/heritage-atelier-aides.js, lib/transcription_aides.php) :
 *   node tests/test-transcription-aides.js
 *  1. sans serveur : le modèle d'acte choisi d'après la sorte et l'année ; les dates en toutes lettres (républicaines aussi) ;
 *     le mot sous le curseur, les motifs « Ma…d » / « Ma?aud » ; le glossaire (« pnt = présent ») ;
 *  2. PHP : les noms, prénoms et communes de la base qui vont avec un motif (sans les vivants en mode consultation) ;
 *     les zones « signature » des autres actes ; la progression mois par mois.
 * Personnes fictives (MAZAUD, LACOMBE, DURAND).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const F = require('../assets/js/app-autrefois-engine.js');
const T = require('../assets/js/heritage-atelier-aides.js');

// 1. 📜 le modèle de l'époque
assert.equal(T.modelFor('bapteme', 1702).era, '1700');
assert.equal(T.modelFor('mariage', 1785).group, 'm');
assert.equal(T.modelFor('deces', 1797).era, 'an2');
assert.equal(T.modelFor('naissance', 1823).era, '1820');
assert.match(T.modelFor('sepulture', 1823).text, /\[défunt\]/);
assert.equal(T.yearOf('', 'Aujourd’hui douze brumaire l’an deux de la République'), 1798);
for (const era of Object.keys(T.MODELS)) for (const g of ['b', 'm', 'd']) assert.ok(T.MODELS[era][g].includes('['), `${era}/${g}`);

// 📅 les dates en toutes lettres
const o = { republican: F.republican };
assert.deepEqual(T.parseDate('le vingt-trois brumaire an deux', o).iso, '1793-11-13');
assert.equal(T.parseDate('le vingt-trois brumaire an deux', o).rep, '23 brumaire an II');
assert.equal(T.parseDate('mil sept cent quatre-vingt-neuf, le douze mars', o).iso, '1789-03-12');
assert.equal(T.parseDate('L’an mil huit cent huit, le douze février', o).label, '12 février 1808');
assert.equal(T.parseDate('le premier may mil sept cent deux', o).iso, '1702-05-01');
assert.equal(T.parseDate('Pierre MAZAUD laboureur', o), null);
assert.ok(T.parseDate('trente-deux brumaire an II', o).error, 'une date impossible le dit');
assert.equal(T.wordsToNumber('mil sept cent quatre-vingt-dix-neuf'), 1799);

// 💡 le mot sous le curseur, les motifs
const txt = 'fils de Jean Ma…d et de Marie LA?OMBE';
assert.equal(T.wordAt(txt, 15).w, 'Ma…d');
assert.equal(T.wordAt('de Ma...d.', 5).w, 'Ma...d');
assert.ok(T.isPattern('Ma…d') && T.isPattern('Ma?aud') && T.isPattern('LA?OMBE'));
assert.ok(!T.isPattern('quoi?') && !T.isPattern('…') && !T.isPattern('M?'));

// 📖 le glossaire
assert.deepEqual(T.gloParse('pnt = présent'), { w: 'pnt', m: 'présent' });
assert.equal(T.gloParse('rien'), null);
const glo = [{ w: 'pnt', m: 'présent' }, { w: 'Vve', m: 'veuve' }];
assert.equal(T.gloFind(glo, 'PNT.').m, 'présent');
assert.deepEqual(T.gloInText(glo, 'Marie DURAND vve de Pierre').map(x => x.w), ['Vve']);

// 2. PHP
const phpPath = findPhp([devBundledPhp()]);
if (!phpPath) { console.log('test-transcription-aides : partie PHP sautée (pas de PHP)'); process.exit(0); }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-txh-'));
try {
    const dir = path.join(tmp, 'data'); fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
    const env = { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media'), GENEALOGY_SKIP_REFERENCE: '1' };
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`require 'lib/paths.php'; $p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null; require 'lib/bootstrap.php'; require 'lib/transcription_aides.php'; $pdo = db(); act_transcriptions_ensure($pdo);
$p = $pdo->prepare("INSERT INTO persons (first_name, last_name, living_status) VALUES (?, ?, ?)");
foreach ([['Pierre', 'MAZAUD', 'deceased'], ['Jean Pierre', 'MAZAUD', 'deceased'], ['Marie', 'LACOMBE', 'deceased'], ['Martial', 'DURAND', 'living'], ['Léonard', 'MAZEAUD', 'living']] as $x) { $p->execute($x); }
$pdo->exec("INSERT INTO places (name, county) VALUES ('Mazaud, Corrèze', 'Corrèze'), ('Lacombe', 'Lot')");
$a = $pdo->prepare("INSERT INTO act_transcriptions (title, kind, body, data_json, created_at) VALUES (?, 'bapteme', ?, ?, ?)");
$a->execute(['Baptême MAZAUD', 'Le douze mars a été baptisé Jean Ma…d [?] signé LACOMBE', json_encode(['zones' => [['id' => 'z1', 'kind' => 'sign', 's' => 48, 'e' => 55, 'x' => 0, 'y' => 0, 'w' => 10, 'h' => 5]]]), '2026-01-10 10:00:00']);
$a->execute(['Mariage DURAND', 'Mariage de Martial DURAND et Marie LACOMBE', json_encode(['zones' => [['id' => 'z9', 'kind' => 'sign', 's' => 0, 'e' => 7]]]), '2026-02-03 10:00:00']);
$o = ['m1' => txaid_match($pdo, 'Ma…d'), 'm2' => txaid_match($pdo, 'MA?AUD'), 'm3' => txaid_match($pdo, 'Mar?e'), 'm4' => txaid_match($pdo, 'x'), 'given' => txaid_match($pdo, 'Pi…e'),
  'signs' => txaid_signs($pdo, 2), 'prog' => txaid_progress($pdo)];
echo json_encode($o, JSON_UNESCAPED_UNICODE);`], { cwd: appRoot, encoding: 'utf8', env });
    if (r.status !== 0) throw new Error(r.stderr || r.stdout);
    const out = JSON.parse(r.stdout.slice(r.stdout.indexOf('{')));
    const vals = (m, type) => m.items.filter(x => x.type === type).map(x => x.value);
    assert.deepEqual(vals(out.m1, 'surname'), ['MAZAUD', 'MAZEAUD'], 'Ma…d → MAZAUD (2 fois, en tête), MAZEAUD');
    assert.equal(out.m1.items.find(x => x.value === 'MAZAUD').n, 2);
    assert.deepEqual(vals(out.m1, 'place'), ['Mazaud'], 'la commune, sans le département');
    assert.deepEqual(vals(out.m2, 'surname'), ['MAZAUD']);
    assert.deepEqual(vals(out.m3, 'given'), ['Marie']);
    assert.deepEqual(vals(out.given, 'given'), ['Pierre']);
    assert.equal(out.m4.pattern, false, 'pas de motif : rien n’est cherché');
    assert.deepEqual(out.signs.signs.map(s => [s.act_id, s.zone_id, s.text]), [[1, 'z1', 'LACOMBE']]);
    assert.equal(out.prog.total.acts, 2);
    assert.equal(out.prog.total.unsure, 2, '« Ma…d » et « [?] »');
    assert.deepEqual(out.prog.months.map(m => m.month), ['2026-01', '2026-02']);
    console.log('test-transcription-aides : ok');
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
