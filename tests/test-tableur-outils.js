'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🧾 Tableur — outils de données : LET / LAMBDA, ✨ remplissage instantané, Σ sous-totaux et ⊟ plan, 🎯 valeur cible, 📈 mini-graphiques.
 *   node tests/test-tableur-outils.js
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
let failed = 0, count = 0;
const t = async (name, fn) => { try { await fn(); count++; console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
const PV = require('../assets/js/heritage-tableur-plus.js'), MM = require('../assets/js/heritage-traitement-texte-fusion.js');
(async () => {
    const H = ['Nom', 'Commune', 'Siècle', 'Âge'], ROWS = [['A', 'Tulle', 18, 40], ['B', 'Tulle', 19, 60], ['C', 'Naves', 19, 70], ['D', 'Naves', 19, ''], ['E', '', 18, 30], null, ['', '', '', '']];
    await t('tableau croisé : somme par commune × siècle, totaux, vides en dernier', () => {
        assert.deepEqual(PV.compute(H, ROWS, {rows: 1, cols: 2, val: 3, agg: 'sum'}).matrix, [['Commune', '18', '19', 'Total'], ['Naves', null, 70, 70], ['Tulle', 40, 60, 100], ['(vide)', 30, null, 30], ['Total', 70, 130, 200]]);
    });
    await t('tableau croisé : nombre de lignes, moyenne (sans total), plus grand, valeurs différentes', () => {
        assert.deepEqual(PV.compute(H, ROWS, {rows: 1, cols: -1, val: -1, agg: 'count'}).matrix, [['Commune', 'Nombre de lignes'], ['Naves', 2], ['Tulle', 2], ['(vide)', 1], ['Total', 5]]);
        const avg = PV.compute(H, ROWS, {rows: 2, cols: -1, val: 3, agg: 'avg'}); assert.deepEqual(avg.matrix, [['Siècle', 'Moyenne de « Âge »'], [18, 35], [19, 65]]); assert.equal(avg.totalRow, false);
        assert.deepEqual(PV.compute(H, ROWS, {rows: 2, cols: -1, val: 1, agg: 'distinct'}).matrix.slice(1), [[18, 1], [19, 2]]);
        assert.deepEqual(PV.compute(H, ROWS, {rows: 2, cols: -1, val: 3, agg: 'max'}).matrix.slice(1), [[18, 40], [19, 70]]);
    });
    await t('tableau croisé : en % de la ligne, de la colonne, du tout', () => {
        const r = PV.compute(H, ROWS, {rows: 1, cols: 2, val: -1, agg: 'count', pct: 'row'}).matrix; assert.deepEqual(r[2], ['Tulle', 0.5, 0.5, 1]); assert.deepEqual(r[4], ['Total', 0.4, 0.6, 1]);
        const c = PV.compute(H, ROWS, {rows: 1, cols: 2, val: -1, agg: 'count', pct: 'col'}).matrix; assert.deepEqual(c[4], ['Total', 1, 1, 1]);
        const a = PV.compute(H, ROWS, {rows: 1, cols: 2, val: -1, agg: 'count', pct: 'all'}).matrix; assert.equal(a[4][3], 1);
    });
    await t('champs de fusion : valeurs, accords (né / née, il / elle), âge, années, champ vide visible, texte échappé', () => {
        const p = {name: 'Anne MOISANT', first: 'Anne', last: 'Moisant', gender: 'female', birth: '24/08/1770', birth_place: 'Pernay', by: 1770, dy: 1840, age: 70, father: '<b>Jean</b>', occupation: ''};
        const html = ['first', 'ne', 'il', 'birth', 'age', 'years', 'father', 'occupation'].map(MM.fieldHtml).join('|');
        assert.equal(MM.fill(html, p), 'Anne|née|elle|24/08/1770|70 ans|1770 – 1840|&lt;b&gt;Jean&lt;/b&gt;|…');
        assert.equal(MM.fill(MM.fieldHtml('ne'), {gender: 'male'}), 'né'); assert.equal(MM.fill(MM.fieldHtml('occupation'), p, {missing: ''}), '');
        assert.deepEqual(MM.fieldsIn(html), ['first', 'ne', 'il', 'birth', 'age', 'years', 'father', 'occupation']);
        assert.equal(MM.fill('<span class="wp-field" data-field="page">1</span>', p), '<span class="wp-field" data-field="page">1</span>', 'les autres champs ne bougent pas');
    });
    /* ── 2. navigateur ── */
    let chromium = null; try { ({chromium} = require('playwright')); } catch (_) {}
    let phpPath = null; try { const {findPhp, devBundledPhp} = require('../electron/php-server'); phpPath = findPhp([devBundledPhp()]); } catch (_) {}
    if (!chromium || !phpPath) { console.log('— navigateur : Playwright ou PHP absent, partie sautée'); return finish(); }
    const {phpRuntimeArgs} = require('../electron/php-server');
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const pp = s.address().port; s.close(() => res(pp)); }); });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-wordexcel-')); fs.mkdirSync(path.join(dir, 'media'));
    const env = {...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media'), GENEALOGY_SKIP_REFERENCE: '1'};
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p->exec("INSERT INTO persons(first_name,last_name,gender,living_status) VALUES('Louise','BORIE','female','deceased'),('Jean','FAURE','male','deceased'),('Pierre','BORIE','male','deceased')");
$p->exec("INSERT INTO families(partner1_id,partner2_id) VALUES(3,1)"); $p->exec("INSERT INTO family_children(family_id,child_id) VALUES(1,2)");
$p = null; require 'lib/bootstrap.php'; $db = db();
$bt = (int) $db->query("SELECT id FROM event_types WHERE gedcom_tag='BIRT'")->fetchColumn(); $db->prepare("INSERT INTO places(name) VALUES('Tulle')")->execute();
$db->prepare('INSERT INTO events(person_id,event_type_id,date_text,year,place_id,scope) VALUES(1,?,?,1890,1,?)')->execute([$bt, '3 mai 1890', 'person']); echo 'ok';`], {cwd: root, encoding: 'utf8', env});
    if (r.status !== 0) throw new Error(r.stderr || r.stdout);
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
    const browser = await chromium.launch(); const page = await browser.newPage({viewport: {width: 1400, height: 900}});
    const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => d.accept());
    try {
        await page.goto(base); await page.waitForFunction(() => window.LCNDA_EXT?.editToolsExtra && window.LCNDA_EXT?.sheetTools && window.LCNDA_APP?.state?.bootstrap);
        const ED = () => page.evaluate(() => { const ed = window.LCNDA_EXT.tableurInternals.current; return {sheets: ed.wb.sheets.map(s => s.name), si: ed.si, sub: ed.S().subtotal || null, rows: ed.S().rows || {}, cells: Object.fromEntries(Object.entries(ed.S().cells).map(([k, c]) => [k, c && typeof c === 'object' ? c.v : c]))}; });
        const val = a => page.evaluate(a => { const ed = window.LCNDA_EXT.tableurInternals.current, S = window.LCNDA_SHEET, p = S.parseAddr(a), v = ed.calc.val(ed.si, p[0], p[1]); return v && v.code ? v.code : v instanceof S.SSpark ? 'spark:' + v.kind : v; }, a);
        const cmd = c => page.evaluate(c => document.querySelector(`dialog.xl-dlg [data-xl-cmd="${c}"]`).click(), c);
        const fill = rows => page.evaluate(rows => { const ed = window.LCNDA_EXT.tableurInternals.current, sh = ed.S(), S = window.LCNDA_SHEET; ed.begin('t'); Object.keys(sh.cells).forEach(k => ed.put(sh, k, null)); rows.forEach((row, i) => row.forEach((v, j) => { if (v != null) ed.put(sh, S.addr(i, j), {v}); })); ed.commit(); ed.render(); }, rows);
        const sel = (r0, c0, r1 = r0, c1 = c0) => page.evaluate(([r0, c0, r1, c1]) => { const ed = window.LCNDA_EXT.tableurInternals.current; ed.sel = {r0, c0, r1, c1, ar: r0, ac: c0}; ed.render(); }, [r0, c0, r1, c1]);
        const submit = () => page.click('dialog[open]:not(.xl-dlg) button[type="submit"]');
        await t('LET, LAMBDA, MAP, REDUCE : des noms et des fonctions à soi dans une formule', async () => {
            await page.evaluate(() => window.LCNDA_EXT.editToolsExtra.find(x => x.key === 'sheet').create(() => {})); await page.waitForSelector('dialog.xl-dlg[open]'); await page.waitForTimeout(500);
            await fill([[1, 10], [2, 20], [3, 30], ['=LET(x;A1*2;y;5;x+y)', '=LET(double;LAMBDA(n;n*2);double(B2))'], ['=SOMME(MAP(A1:A3;LAMBDA(x;x*x)))', '=REDUCE(0;B1:B3;LAMBDA(t;x;t+x))']]);
            assert.deepEqual([await val('A4'), await val('B4'), await val('A5'), await val('B5')], [7, 40, 14, 60]);
        });
        await t('✨ remplissage instantané : un exemple suffit, la règle remplit la colonne', async () => {
            await fill([['Prénom', 'Nom', 'Court'], ['Jean', 'DUPONT', 'Jean D.'], ['Marie', 'Martin', null], ['Louise', 'BORIE', null]]);
            await sel(1, 2); await cmd('flashfill'); await page.waitForTimeout(300);
            const e = await ED(); assert.equal(e.cells.C3, 'Marie M.'); assert.equal(e.cells.C4, 'Louise B.');
        });
        await t('Σ sous-totaux : une feuille par groupe, un total sous chaque groupe (formules) et le total général ; ⊟ plan replie', async () => {
            await fill([['Nom', 'Commune', 'Âge'], ['A', 'Tulle', 40], ['B', 'Naves', 60], ['C', 'Tulle', 70], ['D', 'Naves', 55]]);
            await sel(1, 1); await cmd('subtotals'); await page.waitForSelector('dialog[open] [name="by"]'); await page.selectOption('dialog[open] [name="by"]', '1'); await submit(); await page.waitForTimeout(400);
            let e = await ED(); assert.equal(e.sheets[e.si], 'Sous-totaux Commune');
            assert.equal(e.cells.B4, 'Total Naves'); assert.equal(await val('C4'), 115); assert.equal(e.cells.B7, 'Total Tulle'); assert.equal(await val('C7'), 110);
            assert.equal(e.cells.B8, 'Total général'); assert.equal(await val('C8'), 225); assert.deepEqual(e.sub.detail, [2, 3, 5, 6]);
            await cmd('outline'); await page.waitForTimeout(200); e = await ED(); assert.equal(e.rows['2']?.hidden, true); assert.ok(!e.rows['4']?.hidden, 'les totaux restent');
            await cmd('outline'); await page.waitForTimeout(200); assert.ok(!(await ED()).rows['2']?.hidden);
        });
        await t('🎯 valeur cible : la valeur de la case qui donne le résultat voulu', async () => {
            await page.evaluate(() => { const ed = window.LCNDA_EXT.tableurInternals.current; ed.showSheet(0); });
            await fill([[1850, 1820, '=A1-B1']]); await sel(0, 2); await cmd('goalseek'); await page.waitForSelector('dialog[open] [name="t"]');
            await page.fill('dialog[open] [name="t"]', '25'); await page.fill('dialog[open] [name="x"]', 'B1'); await submit(); await page.waitForTimeout(500);
            assert.equal((await ED()).cells.B1, 1825); assert.equal(await val('C1'), 25);
        });
        await t('📈 mini-graphique : une formule par ligne, dessinée dans la case', async () => {
            await fill([[3, 5, 2, 8, null], [1, -2, 4, -1, null]]); await sel(0, 4, 1, 4); await cmd('sparkline'); await page.waitForSelector('dialog[open] [name="rg"]');
            assert.equal(await page.inputValue('dialog[open] [name="rg"]'), 'A1:D1'); await page.selectOption('dialog[open] [name="k"]', 'barres'); await submit(); await page.waitForTimeout(400);
            const e = await ED(); assert.match(e.cells.E2, /^=MINIGRAPHIQUE\(A2:D2;"barres";/); assert.equal(await val('E1'), 'spark:bar');
            assert.ok(await page.$$eval('dialog.xl-dlg .xl-c .xl-spark', l => l.length) >= 2, 'dessiné dans les cases');
        });
        await t('🧮 solveur : trois parts d’un héritage de 5 000 €, au moins 1 000 chacune, le moins d’écart possible (entiers)', async () => {
            await page.evaluate(() => { const ed = window.LCNDA_EXT.tableurInternals.current; ed.showSheet(0); });
            await fill([[0, 0, 0, '=ABS(A1-B1)+ABS(B1-C1)', '=A1+B1+C1']]); await sel(0, 3); await cmd('solver'); await page.waitForSelector('dialog[open] [name="x"]');
            await page.selectOption('dialog[open] [name="goal"]', 'min'); await page.fill('dialog[open] [name="x"]', 'A1:C1');
            await page.fill('dialog[open] [name="c"]', 'A1 >= 1000\nB1 >= 1000\nC1 >= 1000\nE1 = 5000'); await page.check('dialog[open] [name="int"]'); await submit(); await page.waitForTimeout(800);
            const e = await ED(); assert.equal(await val('E1'), 5000); assert.ok(await val('D1') <= 1, `écart ${await val('D1')}`); assert.ok([e.cells.A1, e.cells.B1, e.cells.C1].every(v => v >= 1000));
        });
        await t('📋 tableau de scénarios : l’âge au mariage selon l’année de naissance', async () => {
            await fill([[1850, 1875, '=B1-A1']]); await sel(2, 0); await cmd('scenarios'); await page.waitForSelector('dialog[open] [name="x"]');
            await page.fill('dialog[open] [name="x"]', 'A1'); await page.fill('dialog[open] [name="v"]', '1840;1850;1855'); await page.fill('dialog[open] [name="f"]', 'C1'); await submit(); await page.waitForTimeout(300);
            const e = await ED(); assert.equal(e.cells.B3, 'C1'); assert.deepEqual([e.cells.A4, e.cells.B4, e.cells.A6, e.cells.B6], [1840, 35, 1855, 20]); assert.equal(e.cells.A1, 1850, 'la case de départ ne change pas');
        });
        await t('⏺ action enregistrée : gras + centré gardés sous un nom, refaits sur une autre case', async () => {
            await fill([['un', 'deux']]); await sel(0, 0); await cmd('actrec'); await cmd('bold'); await cmd('al:center'); await cmd('actrec');
            await page.waitForSelector('.ask-text-dialog input'); await page.fill('.ask-text-dialog input', 'Titre'); await page.click('.ask-text-dialog button[type="submit"]'); await page.waitForTimeout(200);
            await sel(0, 1); await page.evaluate(() => { window.LCNDA_EXT.tableurInternals.current.act = [0, 1]; }); await cmd('actlist'); await page.waitForSelector('dialog[open] [data-act-run="0"]'); await page.click('dialog[open] [data-act-run="0"]'); await page.waitForTimeout(400);
            const st = await page.evaluate(() => { const ed = window.LCNDA_EXT.tableurInternals.current, c = ed.S().cells.B1 || {}; return JSON.stringify(ed.wb.styles[c.s] || {}); });
            assert.match(st, /"b":1/, `gras : ${st}`); assert.match(st, /center/, `centré : ${st}`);
        });
        await t('aucune erreur JavaScript', () => assert.deepEqual(errs, []));
    } finally { await browser.close(); proc.kill(); try { fs.rmSync(dir, {recursive: true, force: true}); } catch (_) {} }
    finish();
})();
function finish() { console.log(`${failed ? '✗' : '✓'} tableur, outils de données : ${count} vérifications${failed ? `, ${failed} en échec` : ''}`); process.exit(failed ? 1 : 0); }
