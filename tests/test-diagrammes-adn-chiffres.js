'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 📊 Diagrammes D9 à D15 (assets/js/heritage-diagram-adn-chiffres.js, lib/diagram_adn_chiffres.php) :
 *     node tests/test-diagrammes-adn-chiffres.js        (DGM_SHOTS=dossier : une capture par type ; DGM_PORT=20222 par défaut)
 *  🧬 peinture des chromosomes, 📏 règle des cM, 🏔️ vagues, 🧱 mosaïque à largeur variable, ⚫ échelle de points,
 *  🌹 rose de Nightingale, 🔁 tableau de mobilité.
 * 1. Sans navigateur : catalogue (groupes, exemple, réglages), chaque exemple se dessine (900 et 390 px), vide et lignes
 *    abîmées, textes et couleurs piégés échappés, beaucoup de données sans figer, calculs (parentés possibles, part du
 *    génome peinte, densité, mobilité).
 * 2. Navigateur (Playwright + php -S, base de démo avec métiers, mois, ADN) : la galerie (groupes, vignettes), l'éditeur
 *    de chaque type (exemple, réglages, « Depuis l'app »), enregistrer, poser (case d'une Fiche), exporter (SVG, PNG),
 *    clic (fiche ou liste des personnes), mode sombre et 390 px sans défilement de côté, aucune erreur JavaScript.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawn, spawnSync } = require('node:child_process');

const appRoot = path.resolve(__dirname, '..');
let failed = 0;
const steps = [];
const step = (name, fn) => steps.push([name, fn]);

/* ── 1. Bac à sable ── */
const sandbox = { window: {}, console, setTimeout, clearTimeout };
vm.createContext(sandbox);
for (const f of ['heritage-diagrams-render.js', 'heritage-diagram-adn-chiffres.js']) vm.runInContext(fs.readFileSync(path.join(appRoot, 'assets/js', f), 'utf8'), sandbox, { filename: f });
const ext = sandbox.window.LCNDA_EXT, R = ext.diagramRender, D = ext.diagramAdnChiffres;
const MINE = ['chromo', 'cmruler', 'ridgeline', 'marimekko', 'dotplot', 'nightingale', 'mobility'];
const GROUP = { chromo: 'ADN', cmruler: 'ADN', ridgeline: 'Chiffres', marimekko: 'Parts', dotplot: 'Chiffres', nightingale: 'Parts', mobility: 'Chiffres' };
const TRAP = '<img src=x onerror="window.__xss=1">\'"&';

step('les 7 types sont au catalogue, dans leur groupe, avec icône, exemple, réglages et données de l’arbre', () => {
    assert.deepEqual([...D.KINDS], MINE);
    MINE.forEach(k => { const K = R.KINDS[k]; assert.ok(K.icon && K.label && K.grids.length && Array.isArray(K.options) && K.options.length >= 5 && typeof K.sample === 'function', k);
        assert.equal(K.group, GROUP[k], k); assert.ok(K.app?.sources?.length || K.fromApp?.html, k + ' : depuis l’app');
        assert.ok(K.options.some(o => o.type === 'color') && K.options.some(o => o.type === 'range') && K.options.some(o => o.type === 'check'), k + ' : couleurs, curseurs, interrupteurs'); });
});
step('chaque exemple se dessine (900 et 390 px), avec un nom pour les lecteurs d’écran', () => {
    MINE.forEach(k => [900, 390].forEach(W => { const s = R.svg({ kind: k, ...R.KINDS[k].sample() }, W);
        assert.match(s, /^<svg [^>]*role="img" aria-label="[^"]+"/, k); assert.doesNotMatch(s, /Dessin impossible|NaN|undefined|Infinity/, `${k} ${W}`);
        assert.ok(s.length > 2000, `${k} ${W} : un vrai dessin`); }));
});
step('vide, lignes abîmées, réglages absurdes : un message, jamais d’erreur', () => {
    MINE.forEach(k => {
        for (const spec of [{ kind: k }, { kind: k, rows: [], series: [] }, { kind: k, rows: [null, 'x', 42, {}, { chr: {}, start: 'abc', end: [], cm: 'x', value: 'abc', s0: {}, from: null }], series: null, o: null, branches: 'x', groups: 5 },
            { kind: k, rows: [{ chr: '1', start: 1e308, end: -1e308, cm: 1e308, name: 'a', value: 1e308, group: 'a', label: 'a', s0: -1e308, s1: 'NaN', from: 'a', to: 'b', count: 1e308 }], o: { minCm: -5, barHeight: 'x', cols: 99, overlap: -1, bw: -3, rowHeight: 1e9, hole: 500, start: 'x', top: -1, height: 'x', maxCm: 0, dot: 1e6, labels: 1e9 } }]) {
            const s = R.svg(spec, 400); assert.doesNotMatch(s, /Dessin impossible|NaN|Infinity/, `${k} ${JSON.stringify(spec).slice(0, 80)}`);
        }
    });
});
step('textes et couleurs piégés : échappés, couleurs refusées', () => {
    MINE.forEach(k => {
        const rows = Array.from({ length: 12 }, (_, i) => ({ chr: String(i + 1), start: i * 5, end: i * 5 + 20, cm: 30, match: TRAP + i, side: TRAP, branch: TRAP, name: TRAP + i, known: TRAP, label: TRAP + i, value: i * 3, group: TRAP + (i % 3), s0: i, s1: 12 - i, from: TRAP + (i % 3), to: TRAP + (i % 4), count: i + 1, color: 'red" onload="x', pid: TRAP, pids: [TRAP, 3] }));
        const s = R.svg({ kind: k, o: { title: TRAP, subtitle: TRAP, unit: TRAP, xLabel: TRAP, highlight: TRAP, childWord: TRAP, patColor: 'url(javascript:x)', lowColor: 'x;y', diagColor: '"><script>' }, series: [{ name: TRAP, color: 'javascript:alert(1)' }, { name: TRAP }], branches: [{ name: TRAP, color: '"/><script>' }], groups: [{ job: TRAP, group: TRAP }], rows }, 700);
        assert.doesNotMatch(s, /<img|<script|onerror="|onload="|javascript:|url\(/, k);
    });
});
step('beaucoup de données : rien ne fige (moins de 250 ms par dessin)', () => {
    const series = Array.from({ length: 40 }, (_, j) => ({ name: 'S' + j }));
    const rows = Array.from({ length: 20000 }, (_, i) => { const r = { chr: String(1 + i % 22), start: (i * 7) % 200, end: (i * 7) % 200 + 9, cm: 12, match: 'M' + (i % 300), side: i % 2 ? 'Paternel' : 'Maternel', branch: 'B' + (i % 9), name: 'N' + i, cm2: 1, label: 'L' + i, value: (i * 7919) % 100, group: 'G' + (i % 30), from: 'Métier ' + (i % 80), to: 'Métier ' + ((i * 7) % 80), count: 1 + i % 5 }; for (let j = 0; j < 40; j++) r['s' + j] = (i * j) % 97; return r; });
    const best = fn => Math.min(...[0, 1, 2].map(() => { const t = Date.now(); fn(); return Date.now() - t; }));
    MINE.forEach(k => { const dt = best(() => R.svg({ kind: k, o: { top: 9999, labels: 40 }, series, rows }, 900)); assert.ok(dt < 250, `${k} : ${dt} ms`); });
});
step('ADN : parentés possibles, côtés, chromosomes, part du génome peinte', () => {
    assert.equal(D.guess(3500)[0].code, 'P'); assert.ok(D.guess(870).slice(0, 4).some(g => g.code === '1C')); assert.equal(D.guess(60)[0].code.endsWith('C') || D.guess(60)[0].code.endsWith('R'), true); assert.ok(D.guess(870).length > 2); assert.deepEqual([...D.guess(0)], []);
    assert.equal(D.sideOf('Paternel'), 'P'); assert.equal(D.sideOf('maternal'), 'M'); assert.equal(D.sideOf('côté mère'), 'M'); assert.equal(D.sideOf(''), ''); assert.equal(D.sideOf('both'), 'B');
    assert.equal(D.chrOf('chr7'), '7'); assert.equal(D.chrOf('23'), 'X'); assert.equal(D.chrOf('Y'), ''); assert.equal(D.mb(12345678), 12.345678); assert.equal(D.mb('45,5'), 45.5);
    assert.equal(D.covered([[0, 10], [5, 20], [30, 40]]), 30);
    const s = R.svg({ kind: 'chromo', o: {}, rows: [{ chr: '1', start: 0, end: 249.25, cm: 280, match: 'A', side: 'Paternel' }] }, 900);
    assert.match(s, /Peint : 8,[12] % côté père · 0 % côté mère/); // le chromosome 1 entier : 249 Mb sur 3 036 Mb
    assert.match(R.svg({ kind: 'chromo', o: { minCm: 10 }, rows: [{ chr: '2', start: 1, end: 5, cm: 4, match: 'Petit' }] }, 600), /Aucun segment à montrer/);
    const r = R.svg({ kind: 'cmruler', o: { highlight: 'cous' }, rows: [{ name: 'Mon cousin', cm: 870, pid: 7 }, { name: 'Autre', cm: 30 }] }, 900);
    assert.match(r, /data-dac-pid="7"/); assert.match(r, /Cousin germain \(1C\) : en moyenne 866 cM/); assert.match(r, /pour Mon cousin : \d+ %/);
});
step('vagues, mobilité, mosaïque, échelle, rose : les bons chiffres', () => {
    const d = D.density([10, 10, 10, 50], 0, 100, 101, 2); const peak = d.indexOf(Math.max(...d)); assert.equal(peak, 10);
    const area = d.reduce((a, b) => a + b, 0); assert.ok(Math.abs(area - 1) < .05, 'la densité fait 1 au total : ' + area);
    const w = R.svg({ kind: 'ridgeline', rows: [{ value: 3, group: 'A', pid: 4 }, { value: 5, group: 'A', pid: 5 }, { value: 9, group: 'B' }] }, 700);
    assert.match(w, /data-dac-pids="4,5" data-dac-title="A — 2 personnes"/); assert.match(w, /A : 2 valeurs, médiane 4/);
    const m = R.svg({ kind: 'mobility', o: { mode: 'row' }, rows: [{ from: 'Laboureur', to: 'laboureur', count: 3, pids: [11, 12] }, { from: 'Laboureur', to: 'Tisserand', count: 1 }, { from: 'Tisserand', to: 'Tisserand', count: 2 }],
        groups: [] }, 700);
    assert.match(m, /Même métier que le père : 5 sur 6 \(83,3 %\)/); assert.match(m, /Père Laboureur → l’enfant Laboureur : 3 — 75 % des enfants de laboureur/); assert.match(m, /data-dac-pids="11,12"/);
    const g = R.svg({ kind: 'mobility', rows: [{ from: 'Laboureur', to: 'Journalier agricole', count: 2 }], groups: [{ job: 'journalier', group: 'Laboureur' }] }, 700);
    assert.match(g, /Même métier que le père : 2 sur 2/);
    const mk = R.svg({ kind: 'marimekko', series: [{ name: 'H' }, { name: 'F' }], rows: [{ label: 'A', s0: 30, s1: 10 }, { label: 'B', s0: 20, s1: 40 }] }, 700);
    assert.match(mk, /A · H : 30 \(75 % de A, 30 % du tout\)/); assert.match(mk, /B · F : 40 \(66,7 % de B, 40 % du tout\)/);
    const dp = R.svg({ kind: 'dotplot', o: { sort: 'desc', unit: 'ans' }, series: [{ name: 'Femmes' }, { name: 'Hommes' }], rows: [{ label: 'Petit', s0: 50, s1: 40 }, { label: 'Grand', s0: 70, s1: 60 }] }, 700);
    assert.ok(dp.indexOf('Grand · Femmes') < dp.indexOf('Petit · Femmes'), 'trié du plus grand au plus petit'); assert.match(dp, /70 ans \(écart 10\)/);
    const ro = R.svg({ kind: 'nightingale', o: { hole: 0, rings: false }, series: [{ name: 'N' }], rows: [{ label: 'Janv.', s0: 100 }, { label: 'Févr.', s0: 25 }] }, 600);
    const wedges = [...ro.matchAll(/<path d="M[\d.]+ [\d.]+L([\d.]+) ([\d.]+)A([\d.]+) /g)].map(x => Number(x[3]));
    assert.equal(wedges.length, 2); assert.ok(Math.abs(wedges[0] / wedges[1] - 2) < .05, 'aire : 4 fois plus → rayon 2 fois plus grand');
});

/* ── 2. Navigateur ── */
let chromium = null;
for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright', '/opt/node-tools/node_modules/playwright']) { try { ({ chromium } = require(p)); break; } catch (_) { chromium = null; } }
const php = spawnSync('php', ['-v'], { encoding: 'utf8' }).status === 0 ? 'php' : null;
const tmp = fs.mkdtempSync(path.join(process.env.DGM_TMP || os.tmpdir(), 'lcnda-dac-'));
const shots = process.env.DGM_SHOTS || '';
const envFor = d => ({ ...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1' });
const SEED = String.raw`<?php
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; $pdo = db(); dna_ensure($pdo);
$tag = fn($t, $s) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$t' AND scope='$s' LIMIT 1")->fetchColumn();
$T = ['BIRT' => $tag('BIRT','person'), 'DEAT' => $tag('DEAT','person'), 'OCCU' => $tag('OCCU','person'), 'MARR' => $tag('MARR','family')];
$pdo->exec("INSERT INTO places(name,country) VALUES('Rennes','France'),('Vitré','France'),('<b>Piège</b>','France')");
$ins = $pdo->prepare('INSERT INTO persons(first_name,last_name,gender,occupation,is_start) VALUES(?,?,?,?,?)');
$ev = $pdo->prepare('INSERT INTO events(scope,person_id,family_id,event_type_id,date_text,year,sort_date,place_id,title) VALUES(?,?,?,?,?,?,?,?,?)');
$jobs = ['Laboureur', 'LABOUREUR', 'Tisserand', 'Journalier', '<i>Meunier</i>', 'Ouvrier'];
mt_srand(11); $ids = [];
for ($i = 0; $i < 160; $i++) { $g = $i % 2 ? 'female' : 'male'; $by = 1700 + intdiv($i, 2) * 3;
    $ins->execute([['Jean','Marie','Pierre','Anne','<img src=x onerror=alert(1)>','Rose'][$i % 6], ['Martin','Durand','Petit','Roux'][$i % 4], $g, $g === 'male' && $i % 7 ? $jobs[($i * 5 + intdiv($i, 10)) % 6] : '', $i === 0 ? 1 : 0]);
    $id = (int) $pdo->lastInsertId(); $ids[] = [$id, $g, $by];
    $ev->execute(['person', $id, null, $T['BIRT'], "$by", $by, sprintf('%04d-%02d-%02d', $by, 1 + ($i * 7) % 12, 1 + $i % 27), 1 + $i % 3, '']);
    $d = $by + 1 + mt_rand(0, 85); $ev->execute(['person', $id, null, $T['DEAT'], "$d", $d, sprintf('%04d-%02d-10', $d, 1 + ($i * 5) % 12), null, '']);
    if ($g === 'female' && $i % 3 === 0) { $ev->execute(['person', $id, null, $T['OCCU'], '', null, '', null, 'Couturière']); } }
for ($k = 0; $k + 1 < 160; $k += 2) { $a = $ids[$k]; $b = $ids[$k + 1]; $pdo->prepare('INSERT INTO families(partner1_id,partner2_id) VALUES(?,?)')->execute([$a[0], $b[0]]); $f = (int) $pdo->lastInsertId();
    $ev->execute(['family', null, $f, $T['MARR'], '', $b[2] + 24, sprintf('%04d-%02d-12', $b[2] + 24, [1, 2, 5, 6, 7, 9, 10, 11][$k % 8]), 1, '']);
    foreach ([$k + 2, $k + 3, $k + 6] as $c) { if ($c < 160) { $pdo->prepare('INSERT INTO family_children(family_id,child_id) VALUES(?,?)')->execute([$f, $ids[$c][0]]); } } }
// 🧬 un test ADN : correspondances (dont deux dans l'arbre), segments, groupes
$pdo->exec("INSERT INTO dna_groups(name,color) VALUES('Branche MARTIN','#4e79a7'),('Branche <b>DURAND</b>','#e15759')");
$pdo->prepare("INSERT INTO dna_kits(person_id,label,company,test_type) VALUES(?,?,?,?)")->execute([$ids[0][0], 'Mon test', 'MyHeritage', 'autosomal']); $kit = (int) $pdo->lastInsertId();
$mi = $pdo->prepare('INSERT INTO dna_matches(kit_id,name,person_id,shared_cm,segments,longest_cm,side,group_ids) VALUES(?,?,?,?,?,?,?,?)');
$cms = [3480, 1790, 880, 412, 233, 140, 96, 71, 52, 38, 27, 19, 12];
foreach ($cms as $j => $cm) { $mi->execute([$kit, $j === 4 ? '<script>x</script>Cousin' : "Cousin $j", $j < 2 ? $ids[10 + $j][0] : null, $cm, 5, 30, $j % 2 ? 'paternal' : 'maternal', $j % 2 ? '1' : '2']); }
$mids = array_map('intval', $pdo->query('SELECT id FROM dna_matches ORDER BY id')->fetchAll(PDO::FETCH_COLUMN));
$si = $pdo->prepare('INSERT INTO dna_segments(kit_id,match_id,label,chromosome,start_pos,end_pos,cm,snps,side,ancestor,color) VALUES(?,?,?,?,?,?,?,?,?,?,?)');
for ($s = 0; $s < 60; $s++) { $c = (string) (1 + ($s * 7) % 22); $a = ($s * 13 % 90) * 1000000; $si->execute([$kit, $mids[$s % count($mids)], '', $s % 11 === 0 ? 'X' : $c, $a, $a + (8 + $s % 30) * 1000000, 8 + $s % 30, 1500, $s % 2 ? 'paternal' : 'maternal', '', '']); }
echo 'ok';`;

(async () => {
    for (const [name, fn] of steps) { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } }
    if (!chromium || !php) { console.log('— navigateur : Playwright ou PHP absent, partie sautée'); process.exit(failed ? 1 : 0); }
    fs.mkdirSync(path.join(tmp, 'media'), { recursive: true });
    const seedFile = path.join(tmp, 'seed.php'); fs.writeFileSync(seedFile, SEED);
    const r = spawnSync(php, [seedFile], { cwd: appRoot, encoding: 'utf8', env: envFor(tmp) });
    if (r.status !== 0 || !/ok/.test(r.stdout)) { console.error(r.stderr || r.stdout); process.exit(1); }
    const port = Number(process.env.DGM_PORT) || 20222;
    if (await fetch(`http://127.0.0.1:${port}/`).then(() => true, () => false)) { console.error(`✗ le port ${port} est déjà pris`); process.exit(1); }
    const proc = spawn(php, ['-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env: envFor(tmp), stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
    const browser = await chromium.launch();
    const errors = [];
    const t = async (name, fn) => { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
    const shot = async (p, name, sel) => { if (!shots) return; fs.mkdirSync(shots, { recursive: true }); const el = sel ? await p.$(sel) : null; await (el ? el.screenshot({ path: path.join(shots, name + '.png') }) : p.screenshot({ path: path.join(shots, name + '.png') })); };
    try {
        await t('serveur : mobilité, mois, âges moyens ; une demande inconnue ou abîmée est refusée proprement', async () => {
            const get = async q => (await fetch(`${base}api.php?action=diagram_adn_numbers&${q}`)).json();
            const mo = await get('what=mobility'); assert.ok(mo.rows.length >= 3 && mo.pairs > 10, JSON.stringify(mo).slice(0, 300));
            assert.ok(mo.rows.some(x => x.from === 'Laboureur' && x.to === 'Laboureur'), 'LABOUREUR et Laboureur : le même métier');
            assert.ok(mo.rows.every(x => x.pids.length <= 60 && x.count >= x.pids.length));
            const da = await get('what=mobility&who=daughters'); assert.ok(da.rows.every(x => x.to === 'Couturière'), 'les filles : leur métier vient des événements Métier');
            const mt = await get('what=months'); assert.deepEqual(mt.series, ['Naissances', 'Mariages', 'Décès']); assert.equal(mt.rows.length, 12); assert.ok(mt.total >= 300);
            const mc = await get('what=months&by=century&type=conceptions'); assert.ok(mc.series.every(s => /e s\.$/.test(s))); assert.ok(mc.rows[0].s0 >= 0);
            for (const by of ['death_century', 'marriage_century', 'death_place', 'death_surname']) { const m = await get(`what=means&by=${by}`); assert.ok(m.rows.length >= 1, by); assert.ok(m.rows.every(x => x.s0 === '' || (x.s0 >= 0 && x.s0 <= 125)), by); }
            assert.equal((await fetch(`${base}api.php?action=diagram_adn_numbers&what=../../etc`)).status, 422);
            assert.equal((await fetch(`${base}api.php?action=diagram_adn_numbers&what[]=x`)).status, 422);
            assert.equal((await fetch(`${base}api.php?action=diagram_adn_numbers&what=mobility&who[]=x`)).status, 200);
        });
        for (const [label, opts] of [['clair, 1280 px', { viewport: { width: 1280, height: 900 } }], ['sombre, 390 px', { viewport: { width: 390, height: 844 }, colorScheme: 'dark' }]]) {
            const ctx = await browser.newContext({ ...opts, acceptDownloads: true });
            const p = await ctx.newPage(), narrow = opts.viewport.width < 500, tag = narrow ? '390-sombre' : '1280';
            p.on('pageerror', e => errors.push(e.message));
            p.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(m.text()); });
            p.on('dialog', d => { errors.push('dialogue : ' + d.message()); d.dismiss(); });
            await p.goto(base);
            await p.waitForFunction(() => window.LCNDA_APP?.state?.bootstrap && window.LCNDA_EXT?.diagramsInternals && window.LCNDA_EXT?.diagramAdnChiffres, null, { timeout: 20000 });
            await p.waitForTimeout(400);
            if (narrow) await p.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
            const closeAll = () => p.evaluate(() => document.querySelectorAll('dialog').forEach(d => { if (d.open) d.close(); d.remove(); }));
            await t(`« Nouveau diagramme » : groupes ADN, Chiffres et Parts, une vignette par type (${label})`, async () => {
                await p.evaluate(() => { window.__chose = window.LCNDA_EXT.diagramsInternals.chooseType(); });
                await p.waitForSelector('dialog.h-dg-gallery[open] .h-dg-tile');
                const tiles = await p.$$eval('dialog.h-dg-gallery .h-dg-tile', els => els.map(e => ({ text: e.textContent, svg: !!e.querySelector('svg'), group: e.closest('.h-dg-tiles')?.previousElementSibling?.textContent })));
                for (const k of MINE) { const lab = sandbox.window.LCNDA_EXT.diagramRender.KINDS[k].label, tl = tiles.find(x => x.text.includes(lab)); assert.ok(tl, k); assert.ok(tl.svg, k + ' : vignette'); assert.equal(tl.group, GROUP[k], k); }
                assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'pas de défilement de côté');
                if (shots) { await p.evaluate(() => [...document.querySelectorAll('dialog.h-dg-gallery h4')].find(x => x.textContent === 'ADN')?.scrollIntoView()); await shot(p, `galerie-adn-${tag}`); }
                await p.click('dialog.h-dg-gallery [data-close]');
            });
            for (const k of MINE) {
                await t(`${k} : éditeur, exemple, réglages, depuis l’app, enregistrer, poser, exporter (${label})`, async () => {
                    await closeAll();
                    await p.evaluate(kind => { window.__ed = window.LCNDA_EXT.openDiagramEditor(null, { kind }); }, k);
                    await p.waitForSelector('dialog.h-dg-dlg[open] [data-dg-preview] svg');
                    assert.ok(await p.$eval('[data-dg-preview] svg', s => s.getAttribute('role') === 'img' && s.getBoundingClientRect().width > 50));
                    const [sw, cw] = await p.$eval('[data-dg-preview] svg', s => [s.getBoundingClientRect().width, s.closest('.h-dg-preview').clientWidth]); assert.ok(sw <= cw + 1, `dessin ${sw}px dans ${cw}px`);
                    // depuis l'app
                    await p.click('[data-dg-tab="app"]');
                    const before = await p.$eval('[data-dg-preview]', e => e.innerHTML);
                    if (await p.$('[data-dg-kappgo]')) await p.click('[data-dg-kappgo]');
                    else { await p.waitForFunction(() => document.querySelector('[data-dac="kit"] option')?.value, null, { timeout: 8000 }); await p.click('[data-dac-go]'); }
                    await p.waitForFunction(() => document.querySelector('[data-dg-tab="data"]').classList.contains('is-active'), null, { timeout: 8000 });
                    await p.waitForTimeout(300);
                    const svg = await p.$eval('[data-dg-preview]', e => e.innerHTML); assert.ok(svg !== before, 'le dessin change'); assert.doesNotMatch(svg, /<img|<b>|<script>|NaN/);
                    if (k === 'chromo') assert.match(svg, /Branche MARTIN/); if (k === 'cmruler') assert.match(svg, /data-dac-pid="\d+"/); if (k === 'mobility') assert.match(svg, /Laboureur/);
                    await p.evaluate(() => document.querySelectorAll('.toast, [class*="toast-wrap"], #toasts, .toast-stack').forEach(x => { x.style.display = 'none'; })); await p.$eval('[data-dg-preview]', e => e.scrollIntoView()); await shot(p, `${k}-${tag}`, '[data-dg-preview]');
                    await p.click('[data-dg-tab="opts"]');
                    assert.ok(await p.$$eval('.h-dg-opts [data-opt]', e => e.length) >= 5);
                    for (const n of [0, 1]) { const chk = (await p.$$('.h-dg-opts input[type=checkbox][data-opt]'))[n]; if (chk) { await chk.click(); await p.waitForTimeout(60); } }
                    const sel = await p.$('.h-dg-opts select[data-opt]'); if (sel) { const vals = await sel.$$eval('option', o => o.map(x => x.value)); await sel.selectOption(vals[vals.length - 1]); }
                    await p.$$eval('.h-dg-opts input[type=range][data-opt]', els => els.slice(-2).forEach(el => { el.value = el.max; el.dispatchEvent(new Event('input', { bubbles: true })); }));
                    await p.waitForTimeout(200); assert.doesNotMatch(await p.$eval('[data-dg-preview]', e => e.innerHTML), /NaN|Dessin impossible/);
                    await p.click('[data-dg-save]');
                    await p.waitForFunction(() => !document.querySelector('dialog.h-dg-dlg[open]'), null, { timeout: 8000 });
                    const id = await p.evaluate(async () => (await window.__ed)?.id || 0); assert.ok(id > 0);
                    await p.evaluate(i => { document.getElementById('dg-pose')?.remove(); const box = document.createElement('div'); box.id = 'dg-pose'; box.style.maxWidth = '100%'; box.innerHTML = window.LCNDA_EXT.diagramEmbedHtml(i); document.body.prepend(box); }, id);
                    await p.waitForSelector('#dg-pose svg');
                    // clic : la fiche d'une personne, ou la liste
                    if (['chromo', 'cmruler'].includes(k) && !narrow) {
                        await p.evaluate(() => { window.__opened = 0; window.LCNDA_APP.__open0 = window.LCNDA_APP.__open0 || window.LCNDA_APP.openPersonById; window.LCNDA_APP.openPersonById = id => { window.__opened = id; }; });
                        await p.$eval('#dg-pose [data-dac-pid]', el => el.dispatchEvent(new MouseEvent('click', { bubbles: true })));
                        assert.ok(await p.evaluate(() => window.__opened > 0), 'la fiche du cousin');
                        await p.evaluate(() => { window.LCNDA_APP.openPersonById = window.LCNDA_APP.__open0; });
                    }
                    if (['ridgeline', 'mobility'].includes(k)) {
                        await p.$eval('#dg-pose [data-dac-pids]', el => el.dispatchEvent(new MouseEvent('click', { bubbles: true })));
                        await p.waitForSelector('dialog.dac-people[open] .dac-person');
                        assert.doesNotMatch(await p.$eval('dialog.dac-people', d => d.innerHTML), /<img src=x/);
                        if (k === 'mobility') await shot(p, `mobilite-liste-${tag}`, 'dialog.dac-people');
                        await p.click('dialog.dac-people [data-x]');
                    }
                    if (!narrow) {
                        for (const [fmt, ext2] of [['svg', 'svg'], ['png', 'png']]) {
                            await p.evaluate(i => window.LCNDA_EXT.openDiagram(i), id); await p.waitForSelector('[data-dg-pexpdlg]');
                            await p.click('[data-dg-pexpdlg]'); await p.click(`.ui-export-fmt[data-fmt="${fmt}"]`);
                            const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 8000 }), p.click('[data-ui-go]')]);
                            assert.ok(dl.suggestedFilename().endsWith('.' + ext2), dl.suggestedFilename());
                            const body = fs.readFileSync(await dl.path()); assert.ok(body.length > 1000, fmt);
                            if (fmt === 'svg') assert.match(body.toString(), /^<svg[^>]+aria-label/);
                            await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close()));
                        }
                    }
                    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'pas de défilement de côté');
                    await p.evaluate(() => document.getElementById('dg-pose')?.remove());
                });
            }
            await t(`clic dans l’éditeur : un petit message plutôt que de quitter (${label})`, async () => {
                await closeAll();
                await p.evaluate(() => { window.LCNDA_EXT.openDiagramEditor(null, { kind: 'mobility' }); });
                await p.waitForSelector('dialog.h-dg-dlg[open] [data-dg-preview] svg');
                await p.evaluate(() => { const s = window.LCNDA_EXT.diagramRender.svg({ kind: 'mobility', rows: [{ from: 'A', to: 'A', count: 1, pids: [1] }] }, 500); document.querySelector('[data-dg-preview]').innerHTML = s; });
                await p.$eval('[data-dg-preview] [data-dac-pids]', el => el.dispatchEvent(new MouseEvent('click', { bubbles: true })));
                await p.waitForTimeout(200); assert.equal(await p.$('dialog.dac-people'), null);
                await closeAll();
            });
            await ctx.close();
        }
        await t('aucune erreur JavaScript', async () => assert.deepEqual(errors, []));
    } finally { await browser.close(); proc.kill(); try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {} }
    process.exit(failed ? 1 : 0);
})();
