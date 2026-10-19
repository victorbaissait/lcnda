'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 📊 Diagrammes « Chiffres » et « Chiffres clés » (assets/js/heritage-diagram-chiffres.js, lib/diagram_chiffres.php) :
 *     node tests/test-diagram-chiffres.js            (DGM_SHOTS=dossier pour enregistrer des captures)
 * 1. Sans navigateur : chaque sorte se dessine (exemple, vide, lignes abîmées), textes et couleurs piégés échappés,
 *    beaucoup de données sans figer (< 200 ms), essaim sans points qui se touchent, quartiles, tranches d'histogramme,
 *    rangs du classement.
 * 2. Navigateur (Playwright, sinon partie sautée), sur un vrai « php -S » avec une petite base : les sortes dans
 *    « Nouveau diagramme » (familles Chiffres et Chiffres clés, vignettes), l'éditeur de chaque sorte (exemple, réglages,
 *    « 🌳 Des données de mon arbre »), CSV dans l'histogramme, enregistrer, poser (case d'une Fiche), exporter (SVG, PNG,
 *    CSV), mode sombre, 390 px, aucune erreur JavaScript.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const vm = require('node:vm');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
let failed = 0;
const steps = [];
const step = (name, fn) => steps.push([name, fn]);

/* ── 1. Bac à sable ── */
const sandbox = { window: {}, console, setTimeout, clearTimeout };
vm.createContext(sandbox);
for (const f of ['heritage-diagrams-render.js', 'heritage-diagram-chiffres.js']) vm.runInContext(fs.readFileSync(path.join(appRoot, 'assets/js', f), 'utf8'), sandbox, { filename: f });
const ext = sandbox.window.LCNDA_EXT, R = ext.diagramRender, DC = ext.diagramChiffres;
const MINE = ['bump', 'stream', 'histogram', 'boxplot', 'dumbbell', 'slope', 'waterfall', 'lollipop', 'lollipop_v', 'beeswarm', 'smallmult', 'kpi', 'bullet'];
const TRAP = '<img src=x onerror="window.__xss=1">\'"&';

step('les 13 sortes sont au catalogue, dans les bonnes familles, avec exemple et réglages', () => {
    assert.deepEqual([...DC.KINDS], MINE);
    MINE.forEach(k => { const K = R.KINDS[k]; assert.ok(K.icon && K.label && K.grids.length && Array.isArray(K.options) && typeof K.sample === 'function', k);
        assert.equal(K.group, ['kpi', 'bullet'].includes(k) ? 'Chiffres clés' : 'Chiffres', k); });
    assert.ok(MINE.filter(k => R.KINDS[k].app).length >= 11, 'des données de l’arbre pour presque toutes');
});
step('chaque exemple se dessine (900 et 390 px), avec un nom pour les lecteurs d’écran', () => {
    MINE.forEach(k => [900, 390].forEach(W => { const s = R.svg({ kind: k, ...R.KINDS[k].sample() }, W);
        assert.match(s, /^<svg [^>]*role="img" aria-label="[^"]+"/, k); assert.doesNotMatch(s, /Dessin impossible|NaN|undefined|Infinity/, `${k} ${W}`); }));
});
step('vide, lignes abîmées, réglages absurdes : un message, jamais d’erreur', () => {
    MINE.forEach(k => {
        for (const spec of [{ kind: k }, { kind: k, rows: [], series: [] }, { kind: k, rows: [null, 'x', 42, {}, { label: null, value: 'abc', s0: {}, s1: [] }], series: null, o: null },
            { kind: k, rows: [{ label: 'a', value: 1e308, s0: -1e308, s1: 'NaN', target: 'x', zones: ';;;', spark: 'a b c' }], o: { bin: -5, top: -1, height: 'x', dot: 0, cols: -3 } }]) {
            const s = R.svg(spec, 400); assert.doesNotMatch(s, /Dessin impossible|NaN|Infinity/, `${k} ${JSON.stringify(spec).slice(0, 80)}`);
        }
    });
});
step('textes et couleurs piégés : échappés, couleurs refusées', () => {
    MINE.forEach(k => {
        const rows = Array.from({ length: 12 }, (_, i) => ({ label: TRAP + i, value: i * 3, group: TRAP, s0: i, s1: 12 - i, type: i === 11 ? 'total' : '', unit: TRAP, spark: '1 2 3', target: 5, zones: '3;6', color: 'red" onload="x', prevLabel: TRAP, note: TRAP }));
        const s = R.svg({ kind: k, o: { title: TRAP, subtitle: TRAP, unit: TRAP, xLabel: TRAP, highlight: TRAP, barColor: 'url(javascript:x)', upColor: 'x;y' }, series: [{ name: TRAP, color: 'javascript:alert(1)' }, { name: TRAP }], rows }, 700);
        assert.doesNotMatch(s, /<img|onerror="|onload="|javascript:|url\(/, k);
    });
});
step('beaucoup de données : rien ne fige (moins de 200 ms par dessin)', () => {
    const series = Array.from({ length: 60 }, (_, j) => ({ name: 'S' + j }));
    const rows = Array.from({ length: 20000 }, (_, i) => { const r = { label: 'L' + i, value: (i * 7919) % 100, group: 'G' + (i % 5), type: i % 10 === 9 ? 'subtotal' : '', spark: Array(500).fill(3).join(' '), target: 50, zones: '10;20' }; for (let j = 0; j < 60; j++) r['s' + j] = (i * j) % 97; return r; });
    const best = fn => Math.min(...[0, 1, 2].map(() => { const t = Date.now(); fn(); return Date.now() - t; })); // le meilleur de 3 : la machine peut être occupée ailleurs
    MINE.forEach(k => { const dt = best(() => R.svg({ kind: k, o: { bin: 0.0001, top: 9999, dot: 1e6, cols: 999 }, series, rows }, 900)); assert.ok(dt < 200, `${k} : ${dt} ms`); });
    assert.ok(best(() => R.svg({ kind: 'beeswarm', rows: Array.from({ length: 5000 }, () => ({ value: 50 })) }, 900)) < 200, 'essaim : 5 000 points à la même valeur');
});
step('essaim : aucun point ne touche un autre', () => {
    const xs = Array.from({ length: 600 }, (_, i) => Math.abs(Math.sin(i * 99.1)) * 500 * (i % 3 ? 1 : .3)), d = 8, ys = DC.swarm(xs, d);
    for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) assert.ok(Math.hypot(xs[i] - xs[j], ys[i] - ys[j]) >= d - 1e-3, `${i} et ${j}`);
});
step('boîte à moustaches : médiane, quartiles, valeurs à part', () => {
    const s = DC.boxStats([1, 2, 3, 4, 5, 6, 7, 8, 9, 100]);
    assert.equal(s.md, 5.5); assert.equal(s.q1, 3.25); assert.equal(s.q3, 7.75); assert.equal(s.hi, 9); assert.deepEqual([...s.out], [100]);
    assert.equal(DC.boxStats([1, 5, 100], 'minmax').hi, 100);
});
step('histogramme : les valeurs brutes rangées dans des tranches de la largeur choisie', () => {
    const s = R.svg({ kind: 'histogram', o: { bin: 10, unit: 'ans' }, rows: [3, 7, 12, 15, 18, 45, '', 'x'].map(value => ({ value })).concat([{ value: 12, count: 4 }]) }, 600);
    assert.match(s, /0 à 9 ans : 2 /); assert.match(s, /10 à 19 ans : 7 /); assert.match(s, /40 à 49 ans : 1 /); assert.doesNotMatch(s, /20 à 29 ans/);
});
step('classement : rangs calculés à partir des nombres, ou donnés tels quels', () => {
    const spec = { kind: 'bump', o: { top: 3 }, series: [{ name: 'A' }, { name: 'B' }], rows: [{ label: 'Jean', s0: 10, s1: 1 }, { label: 'Marie', s0: 5, s1: 8 }, { label: 'Paul', s0: 1, s1: 9 }, { label: 'Luc', s0: '', s1: 7 }] };
    const s = R.svg(spec, 600);
    assert.match(s, /Jean — A : 1er/); assert.match(s, /Marie — B : 2e/); assert.match(s, /Paul — B : 1er/); assert.match(s, /Luc — B : 3e/); assert.doesNotMatch(s, /Jean — B|Luc — A/);
    assert.match(R.svg({ ...spec, o: { mode: 'rank', top: 9 } }, 600), /Paul — B : 9e/);
});
step('cartes de chiffres : flèche, écart et couleur selon le seuil (plus bas = mieux aussi)', () => {
    const s = R.svg({ kind: 'kpi', o: {}, rows: [{ label: 'A', value: 110, previous: 100, good: 100, bad: 50 }, { label: 'B', value: 80, previous: 100, better: 'low', good: 50, bad: 120 }] }, 700);
    assert.match(s, /▲ \+10 \(\+10 %\)/); assert.match(s, /▼ −20 \(−20 %\)/); assert.match(s, /#2e8b57/); assert.match(s, /#e8a33d/);
});

/* ── 2. Navigateur ── */
let chromium = null;
try { ({ chromium } = require('playwright')); } catch (_) { try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); } catch (__) { chromium = null; } }
const phpPath = findPhp([devBundledPhp()]);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-dgchf-'));
const shots = process.env.DGM_SHOTS || '';
const envFor = d => ({ ...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1' });
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const SEED = String.raw`<?php
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; $pdo = db();
$tag = fn($t, $s) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$t' AND scope='$s' LIMIT 1")->fetchColumn();
$T = ['BIRT' => $tag('BIRT','person'), 'DEAT' => $tag('DEAT','person'), 'OCCU' => $tag('OCCU','person'), 'MARR' => $tag('MARR','family')];
$pdo->exec("INSERT INTO places(name,country) VALUES('Rennes','France'),('Vitré','France'),('<b>Piège</b>','France')");
$ins = $pdo->prepare('INSERT INTO persons(first_name,last_name,gender,occupation,is_start) VALUES(?,?,?,?,?)');
$ev = $pdo->prepare('INSERT INTO events(scope,person_id,family_id,event_type_id,date_text,year,sort_date,place_id,title) VALUES(?,?,?,?,?,?,?,?,?)');
mt_srand(7); $ids = [];
for ($i = 0; $i < 120; $i++) { $g = $i % 2 ? 'female' : 'male'; $by = 1720 + $i * 2;
    $ins->execute([['Jean','Marie','Pierre','Anne','<img src=x onerror=alert(1)>','Rose'][$i % 6], ['Martin','Durand','Petit'][$i % 3], $g, $g === 'male' ? ['Laboureur','Tisserand','Ouvrier'][intdiv($i, 40)] : '', $i === 38 ? 1 : 0]);
    $id = (int) $pdo->lastInsertId(); $ids[] = [$id, $g, $by];
    $ev->execute(['person', $id, null, $T['BIRT'], "$by", $by, sprintf('%04d-%02d-10', $by, 1 + $i % 12), 1 + $i % 3, '']);
    $ev->execute(['person', $id, null, $T['DEAT'], '', $by + 20 + mt_rand(0, 70), sprintf('%04d-05-01', $by + 20 + mt_rand(0, 70)), null, '']); }
for ($k = 0; $k < 40; $k += 2) { $a = $ids[$k]; $b = $ids[$k + 1]; $pdo->prepare('INSERT INTO families(partner1_id,partner2_id) VALUES(?,?)')->execute([$a[0], $b[0]]); $f = (int) $pdo->lastInsertId();
    $ev->execute(['family', null, $f, $T['MARR'], '', $b[2] + 25, sprintf('%04d-06-01', $b[2] + 25), 1, '']);
    if ($k + 3 < 40) $pdo->prepare('INSERT INTO family_children(family_id,child_id) VALUES(?,?)')->execute([$f, $ids[$k + 2][0]]); }
echo 'ok';`;

(async () => {
    for (const [name, fn] of steps) { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } }
    if (!chromium || !phpPath) { console.log('— navigateur : Playwright ou PHP absent, partie sautée'); process.exit(failed ? 1 : 0); }
    fs.mkdirSync(path.join(tmp, 'media'), { recursive: true });
    const seedFile = path.join(tmp, 'seed.php'); fs.writeFileSync(seedFile, SEED);
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), seedFile], { cwd: appRoot, encoding: 'utf8', env: envFor(tmp) });
    if (r.status !== 0 || !/ok/.test(r.stdout)) { console.error(r.stderr || r.stdout); process.exit(1); }
    const port = Number(process.env.DGM_PORT) || await freePort();
    if (await fetch(`http://127.0.0.1:${port}/`).then(() => true, () => false)) { console.error(`✗ le port ${port} est déjà pris`); process.exit(1); }
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env: envFor(tmp), stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
    const browser = await chromium.launch();
    const errors = [];
    const t = async (name, fn) => { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
    const shot = async (p, name, el) => { if (!shots) return; fs.mkdirSync(shots, { recursive: true }); await (el ? (await p.$(el)).screenshot({ path: path.join(shots, name + '.png') }) : p.screenshot({ path: path.join(shots, name + '.png') })); };
    try {
        await t('serveur : chaque donnée de l’arbre répond ; une donnée inconnue est refusée', async () => {
            const get = async (w, q = '') => (await fetch(`${base}api.php?action=diagram_numbers&what=${w}${q}`)).json();
            const ad = await get('ages_death'); assert.ok(ad.items.length >= 100); assert.ok(ad.items.every(x => x.value >= 0 && x.value <= 125 && /s\.$/.test(x.century)));
            assert.ok((await get('ages_marriage')).items.length >= 20); assert.ok((await get('couples')).items.every(x => x.a >= 10 && x.b >= 10));
            const fn = await get('firstnames', '&gender=female'); assert.ok(fn.rows.length && fn.rows.every(x => !['Jean', 'Pierre'].includes(x[1])));
            const oc = await get('occupations'); assert.ok(oc.series.includes('Laboureur')); assert.ok(oc.rows.length > 1);
            assert.ok((await get('births_places', '&step=100')).series.includes('<b>Piège</b>'));
            const lv = await get('living'); assert.equal(lv.rows[lv.rows.length - 1].type, 'total');
            const ct = await get('counters'); assert.equal(ct.items.find(x => x.label === 'Personnes').value, 120);
            const so = await get('sosa'); assert.equal(so.rows[0]?.found, 2, JSON.stringify(so).slice(0, 300)); assert.equal(so.rows[0].expected, 2); assert.equal(so.rows[1].found, 2);
            const bad = await fetch(`${base}api.php?action=diagram_numbers&what=../../etc`); assert.equal(bad.status, 422);
        });
        for (const [label, opts] of [['clair, 1280 px', { viewport: { width: 1280, height: 900 } }], ['sombre, 390 px', { viewport: { width: 390, height: 844 }, colorScheme: 'dark' }]]) {
            const ctx = await browser.newContext({ ...opts, acceptDownloads: true });
            const p = await ctx.newPage(), narrow = opts.viewport.width < 500;
            p.on('pageerror', e => errors.push(e.message));
            p.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(m.text()); });
            p.on('dialog', d => { errors.push('dialogue : ' + d.message()); d.dismiss(); });
            await p.goto(base);
            await p.waitForFunction(() => window.LCNDA_APP?.state && window.LCNDA_EXT?.diagramsInternals && window.LCNDA_EXT?.diagramChiffres, null, { timeout: 20000 });
            await p.waitForTimeout(500);
            const tag = narrow ? '390-sombre' : '1280';
            await t(`« Nouveau diagramme » : familles Chiffres et Chiffres clés, une vignette par sorte (${label})`, async () => {
                await p.evaluate(() => { window.__chose = window.LCNDA_EXT.diagramsInternals.chooseType(); });
                await p.waitForSelector('dialog.h-dg-gallery[open] .h-dg-tile');
                const tiles = await p.$$eval('dialog.h-dg-gallery .h-dg-tile', els => els.map(e => ({ text: e.textContent, svg: !!e.querySelector('svg'), group: e.closest('.h-dg-tiles')?.previousElementSibling?.textContent })));
                for (const k of ['Classement qui évolue', 'Courants empilés', 'Histogramme', 'Boîte à moustaches', 'Haltères', 'Pente avant', 'Cascade', 'Sucettes couchées', 'Sucettes debout', 'Essaim de points', 'Petites courbes', 'Cartes de chiffres', 'Barre d’objectif']) {
                    const tl = tiles.find(x => x.text.includes(k)); assert.ok(tl, k); assert.ok(tl.svg, k + ' : vignette');
                    assert.equal(tl.group, /Cartes de chiffres|Barre d’objectif/.test(k) ? 'Chiffres clés' : 'Chiffres', k);
                }
                const nogrow = await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1); assert.ok(nogrow, 'pas de défilement de côté');
                if (shots) { await p.evaluate(() => { const g = document.querySelector('dialog.h-dg-gallery'); const h = [...g.querySelectorAll('h4')].find(x => x.textContent === 'Chiffres'); h?.scrollIntoView(); }); await shot(p, `planche-vignettes-${tag}`); }
                await p.click('dialog.h-dg-gallery [data-close]');
            });
            const closeAll = () => p.evaluate(() => document.querySelectorAll('dialog').forEach(d => { if (d.open) d.close(); d.remove(); }));
            for (const k of MINE) {
                await t(`${k} : éditeur, exemple, réglages, données de l’arbre, enregistrer, poser, exporter (${label})`, async () => {
                    await closeAll();
                    await p.evaluate(kind => { window.__ed = window.LCNDA_EXT.openDiagramEditor(null, { kind }); }, k);
                    await p.waitForSelector('dialog.h-dg-dlg[open] [data-dg-preview] svg');
                    assert.ok(await p.$eval('[data-dg-preview] svg', s => s.getAttribute('role') === 'img' && s.getBoundingClientRect().width > 50));
                    await shot(p, `${k}-${tag}`);
                    // réglages : chaque case et chaque menu se règlent sans erreur
                    await p.click('[data-dg-tab="opts"]');
                    const nOpts = await p.$$eval('.h-dg-opts [data-opt]', e => e.length); assert.ok(nOpts >= 3);
                    const chk = await p.$('.h-dg-opts input[type=checkbox][data-opt]'); if (chk) await chk.click();
                    const sel = await p.$('.h-dg-opts select[data-opt]'); if (sel) { const vals = await sel.$$eval('option', o => o.map(x => x.value)); await sel.selectOption(vals[vals.length - 1]); }
                    await p.waitForTimeout(150);
                    // données de mon arbre
                    await p.click('[data-dg-tab="app"]');
                    const kApp = await p.$('[data-dg-kappgo]');
                    if (kApp) { const before = await p.$eval('[data-dg-preview]', e => e.innerHTML.length); await kApp.click(); await p.waitForFunction(() => document.querySelector('[data-dg-tab="data"]').classList.contains('is-active'), null, { timeout: 8000 });
                        await p.waitForTimeout(250); const svg = await p.$eval('[data-dg-preview]', e => e.innerHTML); assert.ok(svg.length !== before, 'le dessin change'); assert.doesNotMatch(svg, /<img|<b>/);
                        await shot(p, `${k}-arbre-${tag}`); }
                    else assert.ok(await p.$('[data-dg-src]'), 'sucettes : les graphiques de l’app');
                    // enregistrer, poser dans une case (comme un bloc de Fiche), exporter
                    await p.click('[data-dg-save]');
                    await p.waitForFunction(() => !document.querySelector('dialog.h-dg-dlg[open]'), null, { timeout: 8000 });
                    const id = await p.evaluate(async () => (await window.__ed)?.id || 0); assert.ok(id > 0);
                    await p.evaluate(i => { document.getElementById('dg-pose')?.remove(); const box = document.createElement('div'); box.id = 'dg-pose'; box.innerHTML = window.LCNDA_EXT.diagramEmbedHtml(i); document.body.appendChild(box); }, id);
                    await p.waitForSelector('#dg-pose svg');
                    if (!narrow) {
                        for (const [fmt, ext2] of [['svg', 'svg'], ['png', 'png'], ['csv', 'csv']]) {
                            await p.evaluate(i => window.LCNDA_EXT.openDiagram(i), id); await p.waitForSelector('[data-dg-pexpdlg]');
                            await p.click('[data-dg-pexpdlg]'); await p.click(`.ui-export-fmt[data-fmt="${fmt}"]`);
                            const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 8000 }), p.click('[data-ui-go]')]);
                            assert.ok(dl.suggestedFilename().endsWith('.' + ext2), dl.suggestedFilename());
                            const body = fs.readFileSync(await dl.path()); assert.ok(body.length > 100, fmt);
                            if (fmt === 'svg') assert.match(body.toString(), /^<svg[^>]+aria-label/);
                            await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close()));
                        }
                    }
                });
            }
            await t(`histogramme : un CSV de valeurs brutes rangées en tranches (${label})`, async () => {
                await closeAll();
                await p.evaluate(() => { window.__ed = window.LCNDA_EXT.openDiagramEditor(null, { kind: 'histogram' }); });
                await p.waitForSelector('dialog.h-dg-dlg[open] [data-dg-csv]', { state: 'attached' });
                const csv = 'Nom;Valeur\n' + Array.from({ length: 300 }, (_, i) => `Personne ${i};${(i * 37) % 97}`).join('\n') + '\n<script>x</script>;12';
                await p.setInputFiles('dialog.h-dg-dlg[open] [data-dg-csv]', { name: 'ages.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
                await p.waitForFunction(() => document.querySelectorAll('dialog.h-dg-dlg[open] .h-dg-grid tbody tr').length === 301, null, { timeout: 5000 });
                await p.waitForFunction(() => /Personne \d+/.test(document.querySelector('[data-dg-preview]').innerHTML), null, { timeout: 5000 });
                assert.doesNotMatch(await p.$eval('[data-dg-preview]', e => e.innerHTML), /<script>/);
                await p.click('[data-dg-tab="opts"]'); await p.$eval('.h-dg-opts input[data-opt="bin"]', el => { el.value = '10'; el.dispatchEvent(new Event('input', { bubbles: true })); });
                await p.waitForFunction(() => /90 à 99/.test(document.querySelector('[data-dg-preview]').innerHTML), null, { timeout: 5000 });
                await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => { d.close(); d.remove(); }));
            });
            await t(`à ${opts.viewport.width} px : pas de défilement de côté dans l’éditeur (${label})`, async () => {
                await closeAll();
                await p.evaluate(() => { window.LCNDA_EXT.openDiagramEditor(null, { kind: 'kpi' }); });
                await p.waitForSelector('dialog.h-dg-dlg[open] [data-dg-preview] svg');
                // le dessin suit la largeur de sa case (la grille de l'éditeur elle-même : feuille de style commune)
                const [sw, cw] = await p.$eval('[data-dg-preview] svg', s => [s.getBoundingClientRect().width, s.closest('.h-dg-preview').clientWidth]);
                assert.ok(sw <= cw, `dessin ${sw}px dans une case de ${cw}px`);
                await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => { d.close(); d.remove(); }));
            });
            await ctx.close();
        }
        await t('aucune erreur JavaScript', async () => assert.deepEqual(errors, []));
    } finally { await browser.close(); proc.kill(); }
    process.exit(failed ? 1 : 0);
})();
