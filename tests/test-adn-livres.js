#!/usr/bin/env node
/* 🦴 ADN ancien (assets/data/adn-ancien.json.gz, AADR) et 📚 auteurs de la BnF (lib/adn_livres.php, assets/js/heritage-adn-livres.js).
 *  1. données : taille < 15 Mo, source et licence CC0, champs, individus d'avant 1850 avec coordonnées ;
 *  2. calcul : haplogroupes (H1 ⊃ H1c3 mais pas H10), « R-M269 » → R1b1a1b, le plus précis d'abord, le plus proche, l'époque ;
 *  3. serveur (GENEALOGY_TEST=1 + LCNDA_TEST_BNF_DIR) : lignée Y de Pierre MAZAUD → Malvialle ; Jean DURAND (mort, né 1860) →
 *     un auteur (pas « Jean-Baptiste », pas né en 1870) ; réponse gardée ; jamais un vivant ni une fiche confidentielle ;
 *     ✓ C'est lui (source, fiche en ligne, livres) et ↶ ; ✗ Pas lui et ↶ ; les ancêtres à chercher ;
 *  4. écran : bloc 🧬 ADN de la fiche, « 🌳 Lignées », fiche de Jean DURAND (✓, ↶ du message), Où chercher → file lente, Réglages,
 *     LCNDA_EXT.dataSources.
 *   node tests/test-adn-livres.js */
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const zlib = require('zlib');
const {spawn, spawnSync} = require('child_process');
let chromium; try { ({chromium} = require('playwright')); } catch (_) { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); }
const root = path.join(__dirname, '..');
const {findPhp, phpRuntimeArgs, devBundledPhp} = require('../electron/php-server.js');
const C = require('../assets/js/heritage-adn-livres.js');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
    const file = path.join(root, 'assets/data/adn-ancien.json.gz');
    let RAW;
    await t('données : < 15 Mo, source AADR en CC0, individus d’avant 1850 avec coordonnées et haplogroupe', async () => {
        const size = fs.statSync(file).size; assert.ok(size < 15e6, size);
        RAW = JSON.parse(zlib.gunzipSync(fs.readFileSync(file)));
        assert.deepStrictEqual(RAW.fields, ['id', 'y', 'yi', 'mt', 'bp', 'sd', 'date', 'grp', 'loc', 'cty', 'lat', 'lon', 'pub', 'sex']);
        assert.strictEqual(RAW.source.licence, 'CC0 1.0'); assert.match(RAW.source.url, /10\.7910\/DVN\/FFIDCW/); assert.match(RAW.source.credit, /Mallick/);
        assert.ok(RAW.rows.length > 10000, RAW.rows.length);
        const ids = new Set();
        for (const r of RAW.rows) {
            assert.ok(!ids.has(r[0]), 'un individu une fois : ' + r[0]); ids.add(r[0]);
            assert.ok(r[4] >= 100, r[0]); assert.ok(Math.abs(r[10]) <= 90 && Math.abs(r[11]) <= 180, r[0]);
            assert.ok(r[1] || r[2] || r[3], r[0]); assert.ok(RAW.pubs[r[12]], r[0]);
        }
        assert.strictEqual(RAW.ymap.M269, 'R1b1a1b');
    });
    await t('calcul : haplogroupes, le plus précis d’abord, le plus proche, l’époque et la date', async () => {
        assert.ok(C.under('H1c3', 'H1')); assert.ok(!C.under('H10', 'H1')); assert.ok(!C.under('HV0', 'H')); assert.ok(C.under('R1b1a1b1a1a2c1', 'R1b1a1b'));
        assert.strictEqual(C.common('R1b1a1b1a1a2', 'R1b1a1b1a1a1'), 'R1b1a1b1a1a');
        assert.strictEqual(C.cleanHap('I2a1b1b~'), 'I2a1b1b');
        const y = C.parseHap('y', 'R-M269', {M269: 'R1b1a1b'}); assert.deepStrictEqual([y.isogg, y.term, y.exact], ['R1b1a1b', 'R-M269', true]);
        const u = C.parseHap('y', 'R1b-U152', {}); assert.deepStrictEqual([u.isogg, u.exact], ['R1b', false]);
        const D = C.prepare({fields: RAW.fields, pubs: [['OlaldeReichNature2018', 'https://doi.org/10.1038/nature25738']], ymap: {M269: 'R1b1a1b'}, rows: [
            ['A', 'R-L51', 'R1b1a1b1a', 'H1c', 4000, 30, '2100-1900 BCE', 'France_EBA', 'Loin', 'France', 48.8, 2.3, 0, 'M'],
            ['B', 'R-P312', 'R1b1a1b1a1a', 'H10', 3750, 30, '', 'France_Roman', 'Près', 'France', 45.2, 1.8, 0, 'M'],
            ['C', 'I-M253', 'I1', 'U5b', 9000, 30, '', 'France_Mesolithic', 'Tout près', 'France', 45.27, 1.77, 0, 'F'],
            ['D', 'R-V88', 'R1b1b', '', 6000, 30, '', 'Italy_N', 'Italie', 'Italy', 45.4, 9.2, 0, 'M']]});
        const o = {lat: 45.27, lon: 1.77, name: 'Tulle'};
        let r = C.match(D, 'y', 'R-M269', o); assert.deepStrictEqual([r.level, r.list.map(x => x.id)], ['same', ['B', 'A']], 'descendants de M269, le plus proche d’abord');
        r = C.match(D, 'y', 'R1b1a1b1a1a2', o); assert.deepStrictEqual([r.level, r.common, r.list.map(x => x.id)], ['branch', 'R1b1a1b1a1a', ['B']], 'sinon la branche plus ancienne la plus précise');
        r = C.match(D, 'y', 'R1b-U152', o); assert.deepStrictEqual([r.level, r.common], ['branch', 'R1b'], 'mutation inconnue : le grand groupe, dit comme tel');
        r = C.match(D, 'mt', 'H1', o); assert.deepStrictEqual(r.list.map(x => x.id), ['A'], 'H1 n’est pas H10');
        assert.strictEqual(C.match(D, 'y', 'I-M999', o), null, '« I » seul : trop vague');
        assert.strictEqual(C.match(D, 'y', 'R-M269', {lat: NaN, lon: 1}), null, 'pas de lieu : rien');
        assert.strictEqual(C.periodOf('Russia_BA_Okunevo'), 'de l’âge du bronze'); assert.strictEqual(C.periodOf('France_GrandEst_BellBeaker'), '');
        assert.strictEqual(C.dateTxt(3750, 80), 'vers 1800 av. J.-C.'); assert.strictEqual(C.dateTxt(1000, 10), 'vers 950 apr. J.-C.');
        assert.strictEqual(C.pubLabel('OlaldeReichNature2018'), 'Olalde Reich Nature 2018');
    });

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-adnl-'));
    fs.mkdirSync(path.join(tmp, 'media'));
    const bnf = path.join(tmp, 'bnf'); fs.mkdirSync(bnf);
    const lit = v => ({type: 'literal', value: String(v)});
    fs.writeFileSync(path.join(bnf, 'authors.json'), JSON.stringify({results: {bindings: [
        {p: {type: 'uri', value: 'http://data.bnf.fr/ark:/12148/cb11111111a#about'}, fn: lit('Durand'), gn: lit('Jean'), fy: lit(1860), ly: lit(1925)},
        {p: {type: 'uri', value: 'http://data.bnf.fr/ark:/12148/cb22222222b#about'}, fn: lit('Durand'), gn: lit('Jean-Baptiste'), fy: lit(1860)},
        {p: {type: 'uri', value: 'http://data.bnf.fr/ark:/12148/cb33333333c#about'}, fn: lit('Durand'), gn: lit('Jean'), fy: lit(1870)}]}}));
    fs.writeFileSync(path.join(bnf, 'works-cb11111111a.json'), JSON.stringify({results: {bindings: [
        {m: {type: 'uri', value: 'http://data.bnf.fr/ark:/12148/cb44444444d#about'}, t: lit('Le lin en Limousin / par Jean Durand'), d: lit('1890')},
        {m: {type: 'uri', value: 'http://data.bnf.fr/ark:/12148/cb55555555e#about'}, t: lit('Mémoire sur la culture du lin'), d: lit('1884')},
        {m: {type: 'uri', value: 'http://data.bnf.fr/ark:/12148/cb66666666f#about'}, t: lit('Mémoire sur la culture du lin, 2e édition'), d: lit('1886')}]}}));
    const calls = () => (fs.existsSync(path.join(bnf, 'calls.log')) ? fs.readFileSync(path.join(bnf, 'calls.log'), 'utf8').trim().split('\n').filter(Boolean) : []);
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4', GENEALOGY_TEST: '1', LCNDA_TEST_BNF_DIR: bnf};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db(); dna_ensure($pdo);
$tag = function ($t) use ($pdo) { $s = $pdo->prepare('SELECT id FROM event_types WHERE gedcom_tag=? ORDER BY id LIMIT 1'); $s->execute([$t]); return (int) $s->fetchColumn(); };
$pl = function ($name, $county, $lat, $lon) use ($pdo) { $pdo->prepare("INSERT INTO places(name, county, country, latitude, longitude) VALUES(?,?,'France',?,?)")->execute([$name, $county, $lat, $lon]); return (int) $pdo->lastInsertId(); };
$tulle = $pl('Tulle', 'Corrèze', 45.267, 1.771); $malv = $pl('Malvialle', 'Cantal', 45.1, 2.6); $brive = $pl('Brive', 'Corrèze', 45.159, 1.533);
$per = function ($f, $l, $g, $st, $evs, $extra = '') use ($pdo, $tag) { $pdo->prepare("INSERT INTO persons(first_name,last_name,gender,living_status) VALUES(?,?,?,?)")->execute([$f, $l, $g, $st]); $id = (int) $pdo->lastInsertId();
    if ($extra) { $pdo->exec("UPDATE persons SET $extra WHERE id=$id"); }
    foreach ($evs as [$t, $y, $p]) { $pdo->prepare('INSERT INTO events(scope, person_id, event_type_id, year, date_text, place_id) VALUES(\'person\',?,?,?,?,?)')->execute([$id, $tag($t), $y, (string) $y, $p]); } return $id; };
$fam = function ($a, $b, $child) use ($pdo) { $pdo->prepare('INSERT INTO families(partner1_id, partner2_id) VALUES(?,?)')->execute([$a, $b]); $f = (int) $pdo->lastInsertId(); $pdo->prepare('INSERT INTO family_children(family_id, child_id) VALUES(?,?)')->execute([$f, $child]); };
$ids = [
  'pierre' => $per('Pierre', 'MAZAUD', 'male', 'living', [['BIRT', 1950, $tulle]], 'is_start=1'),
  'pere' => $per('Jean', 'MAZAUD', 'male', 'deceased', [['BIRT', 1920, $tulle], ['DEAT', 1990, $tulle]]),
  'grandpere' => $per('Antoine', 'MAZAUD', 'male', 'deceased', [['BIRT', 1890, $malv], ['DEAT', 1960, $tulle]]),
  'mere' => $per('Marie', 'LACOMBE', 'female', 'deceased', [['BIRT', 1925, $brive], ['DEAT', 2000, $brive]]),
  'grandmere' => $per('Jeanne', 'DURAND', 'female', 'deceased', [['BIRT', 1898, $brive], ['DEAT', 1980, $brive]]),
  'auteur' => $per('Jean', 'DURAND', 'male', 'deceased', [['BIRT', 1860, $brive], ['DEAT', 1925, $brive]]),
  'vivant' => $per('Paul', 'DURAND', 'male', 'unknown', [['BIRT', 1960, $brive]]),
  'secret' => $per('Jean', 'DURAND', 'male', 'deceased', [['BIRT', 1860, $brive], ['DEAT', 1930, $brive]], 'is_private=1'),
];
$fam($ids['pere'], $ids['mere'], $ids['pierre']); $fam($ids['grandpere'], null, $ids['pere']); $fam(null, $ids['grandmere'], $ids['mere']); $fam($ids['auteur'], null, $ids['grandmere']);
$pdo->prepare("INSERT INTO dna_kits(person_id, label, company, test_type, haplo_y, haplo_mt) VALUES(?, 'Pierre', 'Labo', 'ydna', 'R-M269', 'H1')")->execute([$ids['pierre']]);
echo json_encode($ids);`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0 || !/pierre/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const ID = JSON.parse(seed.stdout.trim().split('\n').pop());
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const pp = s.address().port; s.close(() => res(pp)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const errs = [];
    try {
        const p = await (await browser.newContext({viewport: {width: 1440, height: 900}})).newPage();
        p.on('pageerror', e => errs.push(e.message));
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.dataSources !== undefined || window.LCNDA_APP?.state?.csrf, null, {timeout: 30000});
        if (!(await p.evaluate(() => !!window.LCNDA_EXT?.adnLivres))) { // pas encore branché dans index.php : on l'ajoute ici
            await p.addStyleTag({url: 'assets/css/adn-livres.css'}); await p.addScriptTag({url: 'assets/js/heritage-adn-livres.js'});
        }
        await p.waitForFunction(() => window.LCNDA_EXT?.adnLivres, null, {timeout: 10000});
        const api = (x, q = {}) => p.evaluate(([y, z]) => window.LCNDA_APP.api(y, z).catch(e => ({error: e.message})), [x, q]);
        const post = b => p.evaluate(async y => { try { const r = await window.LCNDA_APP.api('adn_livres_write', {}, {method: 'POST', body: y}); return r.result || r; } catch (e) { return {error: e.message}; } }, b);
        await t('serveur 🦴 : haplogroupes du test, lignée Y jusqu’à Malvialle, lignée mt jusqu’à Brive', async () => {
            const r = await api('adn_ancien', {person_id: ID.pierre});
            assert.deepStrictEqual([r.y.hap, r.y.origin.name, r.y.origin.who.name, r.mt.hap, r.mt.origin.name, r.person.is_start], ['R-M269', 'Malvialle', 'Antoine MAZAUD', 'H1', 'Brive', true]);
            const n = await api('adn_ancien', {person_id: ID.pere}); assert.deepStrictEqual([n.y, n.mt], [null, null], 'pas de test : rien');
        });
        await t('serveur 📚 : un auteur (même prénom, même année ± 1), réponse gardée, jamais un vivant ni une fiche confidentielle', async () => {
            let r = await api('adn_livres', {person_id: ID.auteur});
            assert.strictEqual(r.eligible, true); assert.deepStrictEqual(r.candidates.map(c => c.ark), ['cb11111111a']);
            const c = r.candidates[0];
            assert.deepStrictEqual(c.works.map(w => [w.t, w.y]), [['Mémoire sur la culture du lin', 1884], ['Le lin en Limousin / par Jean Durand', 1890]], 'les éditions d’un même livre une fois, dans l’ordre');
            assert.strictEqual(c.url, 'https://data.bnf.fr/ark:/12148/cb11111111a'); assert.match(r.credit, /Licence Ouverte/); assert.ok(r.fetched_at);
            assert.strictEqual(calls().length, 2); assert.match(calls()[0], /VALUES \?fn \{ "DURAND" "Durand" \}/); assert.match(calls()[0], /\?fy >= 1859 && \?fy <= 1861/);
            r = await api('adn_livres', {person_id: ID.auteur}); assert.ok(r.cached); assert.strictEqual(calls().length, 2, 'gardée : aucune requête');
            r = await api('adn_livres', {person_id: ID.grandmere}); assert.deepStrictEqual(r.candidates, [], 'Jeanne n’est pas Jean');
            const before = calls().length;
            for (const [who, why] of [['vivant', 'living'], ['secret', 'private'], ['pierre', 'living']]) { r = await api('adn_livres', {person_id: ID[who]}); assert.deepStrictEqual([r.eligible, r.reason], [false, why], who); }
            assert.strictEqual(calls().length, before, 'rien n’est demandé pour eux');
            const a = await api('adn_livres', {op: 'ancestors', person_id: ID.pierre});
            assert.deepStrictEqual(a.people.map(x => x.name).sort(), ['Antoine MAZAUD', 'Jean DURAND', 'Jean MAZAUD', 'Jeanne DURAND', 'Marie LACOMBE']);
            assert.ok(a.people.find(x => x.name === 'Jean DURAND').searched);
        });
        await t('serveur 📚 : ✓ C’est lui (source, fiche en ligne, livres) et ↶ ; ✗ Pas lui et ↶', async () => {
            const r = await post({op: 'confirm', person_id: ID.auteur, ark: 'cb11111111a'});
            assert.ok(/^so6-/.test(r.batch), JSON.stringify(r)); assert.strictEqual(r.books, 2);
            const ctx = await api('so6_context', {person_id: ID.auteur});
            assert.ok(ctx.is_author, 'les livres en font un auteur (bouton IdRef · data.bnf)'); assert.deepStrictEqual(ctx.sheets.map(s => s.url), ['https://data.bnf.fr/ark:/12148/cb11111111a']);
            const d = await api('person', {id: ID.auteur});
            const src = JSON.stringify(d.sources || d.citations || d);
            assert.match(src, /Notice d’auteur BnF — Jean Durand \(1860–1925\)/);
            let l = await api('adn_livres', {person_id: ID.auteur}); assert.strictEqual(l.candidates[0].verdict, 'yes');
            assert.ok((await post({op: 'confirm', person_id: ID.auteur, ark: 'cb99999999z'})).error, 'une notice absente de la réponse gardée : refusée');
            await post({op: 'undo', batch: r.batch});
            const ctx2 = await api('so6_context', {person_id: ID.auteur}); assert.deepStrictEqual([ctx2.is_author, ctx2.sheets.length], [false, 0]);
            l = await api('adn_livres', {person_id: ID.auteur}); assert.strictEqual(l.candidates[0].verdict, '');
            await post({op: 'mark', person_id: ID.auteur, ark: 'cb11111111a', verdict: 'no'});
            l = await api('adn_livres', {person_id: ID.auteur}); assert.strictEqual(l.candidates[0].verdict, 'no');
            await post({op: 'mark', person_id: ID.auteur, ark: 'cb11111111a', verdict: ''});
            assert.ok((await post({op: 'mark', person_id: ID.auteur, ark: '../x', verdict: 'no'})).error);
        });
        await t('écran 🦴 : la fiche (bloc 🧬 ADN) et l’onglet ADN → Lignées', async () => {
            await p.evaluate(id => { const A = window.LCNDA_APP; A.state.currentPersonId = id; A.setModule('personnes'); }, ID.pierre);
            await p.waitForSelector('[data-dna-host] ~ .adnl-anc', {timeout: 20000});
            const txt = await p.textContent('.adnl-anc');
            assert.match(txt, /Ton haplogroupe paternel R-M269 se retrouve chez un homme/); assert.match(txt, /km de Malvialle|à Malvialle même/);
            assert.match(txt, /Ton haplogroupe maternel H1 se retrouve chez/); assert.match(txt, /Allen Ancient DNA Resource/);
            await p.click('.adnl-anc [data-adnl-kind="y"] .adnl-fold > summary');
            assert.ok(await p.$('.adnl-anc [data-adnl-kind="y"] .adnl-list li'));
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.adnTab = 'lines'; A.setModule('adn'); });
            await p.waitForSelector('[data-dna-lines] .adnl-card', {timeout: 20000});
            assert.match(await p.textContent('[data-dna-lines] .adnl-card'), /Les ancêtres très anciens de ta lignée.*R-M269/s);
        });
        await t('écran 📚 : la fiche de Jean DURAND, « ✓ C’est lui » puis ↶ Annuler du message', async () => {
            await p.evaluate(id => { const A = window.LCNDA_APP; A.state.currentPersonId = id; A.setModule('personnes'); }, ID.auteur);
            await p.waitForFunction(() => /Peut-être l’auteur de « Mémoire sur la culture du lin » \(1884\)/.test(document.querySelector('.adnl-book')?.textContent || ''), null, {timeout: 20000});
            assert.match(await p.textContent('.adnl-book'), /notice BnF/);
            await p.click('.adnl-book [data-adnl-yes]');
            await p.waitForFunction(() => document.querySelector('.adnl-book.is-yes'), null, {timeout: 10000});
            assert.strictEqual((await api('so6_context', {person_id: ID.auteur})).sheets.length, 1);
            await p.evaluate(() => [...document.querySelectorAll('.ui-toast')].reverse().find(x => /Notice BnF/.test(x.textContent)).querySelector('button').click()); await sleep(1200);
            assert.strictEqual((await api('so6_context', {person_id: ID.auteur})).sheets.length, 0, '↶ Annuler');
            await p.waitForFunction(() => document.querySelector('.adnl-book [data-adnl-yes]'), null, {timeout: 10000});
            await p.click('.adnl-book [data-adnl-no]'); await p.waitForFunction(() => !document.querySelector('.adnl-book'), null, {timeout: 10000});
            assert.strictEqual((await api('adn_livres', {person_id: ID.auteur})).candidates[0].verdict, 'no', '✗ Pas lui gardé');
            await post({op: 'mark', person_id: ID.auteur, ark: 'cb11111111a', verdict: ''});
            await p.evaluate(id => { const A = window.LCNDA_APP; A.state.currentPersonId = id; A.setModule('personnes'); }, ID.vivant); await sleep(1500);
            assert.ok(!(await p.$('.adnl-book')), 'un vivant : rien');
        });
        await t('écran 📚 : Où chercher ? → « Chercher mes ancêtres auteurs » (file lente)', async () => {
            await p.evaluate(id => window.LCNDA_EXT.ouChercher.openPerson(id), ID.pierre);
            await p.waitForSelector('[data-adnl-batch]', {timeout: 20000});
            await p.evaluate(() => { window.LCNDA_EXT.adnLivres.queue.gap = 150; document.querySelector('[data-adnl-batch]').open = true; });
            const n0 = calls().length;
            await p.click('[data-adnl-go]');
            await p.waitForFunction(() => /Jean DURAND/.test(document.querySelector('[data-adnl-batch-list]')?.textContent || '') && /5 sur 5/.test(document.querySelector('[data-adnl-prog]')?.textContent || ''), null, {timeout: 30000});
            assert.match(await p.textContent('[data-adnl-batch-list]'), /Peut-être l’auteur de « Mémoire sur la culture du lin »/);
            const n1 = calls().length; assert.ok(n1 - n0 <= 3 * 2, 'déjà cherchés : pas redemandés (' + (n1 - n0) + ')');
        });
        await t('Réglages : l’interrupteur et À propos des données ; registre LCNDA_EXT.dataSources', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'adn_livres'; A.setModule('maintenance'); });
            await p.waitForSelector('.adnl-set [data-adnl-tg="ancien"]', {timeout: 20000});
            assert.match(await p.textContent('.adnl-set'), /CC0 1\.0/); assert.match(await p.textContent('.adnl-set'), /Licence Ouverte/);
            await p.evaluate(() => { const i = document.querySelector('[data-adnl-tg="ancien"]'); i.checked = false; i.dispatchEvent(new Event('change', {bubbles: true})); });
            assert.strictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-adn-livres')).ancien), false);
            await p.evaluate(() => localStorage.removeItem('genealogie-adn-livres'));
            const ids = await p.evaluate(() => window.LCNDA_EXT.dataSources.filter(d => ['adn_ancien', 'adn_ancien_lieu', 'bnf_auteur'].includes(d.id)).map(d => `${d.id}:${d.group}:${d.needs.join('+')}`));
            assert.deepStrictEqual(ids, ['adn_ancien:La personne:person', 'adn_ancien_lieu:Le lieu:place', 'bnf_auteur:Chercher:person']);
            const out = await p.evaluate(async id => { const h = document.createElement('div'); const ds = window.LCNDA_EXT.dataSources;
                await ds.find(d => d.id === 'adn_ancien').run({person: id}, h); const a = h.textContent;
                await ds.find(d => d.id === 'adn_ancien_lieu').run({place: {name: 'Tulle', latitude: 45.267, longitude: 1.771}}, h); const b = h.querySelectorAll('.adnl-list li').length;
                return [a, b]; }, ID.pierre);
            assert.match(out[0], /R-M269/); assert.strictEqual(out[1], 12);
        });
        assert.deepStrictEqual(errs, [], 'erreurs JS : ' + errs.join(' | '));
    } finally { await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true}); }
    console.log(fails ? `${fails} échec(s)` : 'tout est bon'); process.exit(fails ? 1 : 0);
})();
