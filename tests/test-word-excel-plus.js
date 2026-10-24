'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🧾 Tableur et 📝 traitement de texte — en plus :   node tests/test-word-excel-plus.js
 *  1. sans écran : le tableau croisé (somme, nombre, %, totaux, vides, ordre), les champs de fusion (valeurs, accords, échappement) ;
 *  2. navigateur : 🔀 tableau croisé (aperçu, nouvelle feuille, ↻ actualiser après un ajout, ↶), 📊 graphique vivant qui suit la sélection,
 *     📨 champ de fusion, 👤 remplir avec une fiche, 📨 publipostage (une copie par personne), modèles remplis (demande d'acte).
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
        await page.goto(base); await page.waitForFunction(() => window.LCNDA_EXT?.editToolsExtra && window.LCNDA_EXT?.sheetPivot && window.LCNDA_EXT?.textDocMerge && window.LCNDA_APP?.state?.bootstrap);
        const ED = () => page.evaluate(() => { const ed = window.LCNDA_EXT.tableurInternals.current; return {sheets: ed.wb.sheets.map(s => s.name), si: ed.si, pivot: ed.S().pivot || null, cells: Object.fromEntries(Object.entries(ed.S().cells).map(([k, c]) => [k, c && typeof c === 'object' ? c.v : c]))}; });
        const cmd = c => page.evaluate(c => document.querySelector(`dialog.xl-dlg [data-xl-cmd="${c}"]`).click(), c);
        await t('🔀 tableau croisé : aperçu, nouvelle feuille « TCD … », d’où il vient', async () => {
            await page.evaluate(() => window.LCNDA_EXT.editToolsExtra.find(x => x.key === 'sheet').create(() => {})); await page.waitForSelector('dialog.xl-dlg[open]'); await page.waitForTimeout(500);
            await page.evaluate(() => { const ed = window.LCNDA_EXT.tableurInternals.current, sh = ed.S(); ed.begin('t'); [['Nom', 'Commune', 'Siècle', 'Âge'], ['A', 'Tulle', 18, 40], ['B', 'Tulle', 19, 60], ['C', 'Naves', 19, 70], ['D', 'Naves', 19, 55]].forEach((row, i) => row.forEach((v, j) => ed.put(sh, window.LCNDA_SHEET.addr(i, j), {v}))); ed.commit(); ed.render(); ed.select(1, 1); ed.afterSel(); });
            await cmd('pivot'); await page.waitForSelector('dialog[open] [data-pv-prev] table');
            assert.equal(await page.inputValue('dialog[open] [name=rows]'), '1', 'en lignes : la commune (les mots qui se répètent), pas les noms');
            await page.selectOption('dialog[open] [name=cols]', '2'); await page.selectOption('dialog[open] [name=agg]', 'sum'); await page.selectOption('dialog[open] [name=val]', '3');
            assert.match(await page.textContent('dialog[open] [data-pv-prev]'), /Naves125125Tulle4060100Total40185225/);
            await page.click('dialog[open]:not(.xl-dlg) button[type=submit]'); await page.waitForTimeout(400);
            const e = await ED(); assert.deepEqual(e.sheets, ['Feuille 1', 'TCD Commune']); assert.equal(e.si, 1); assert.equal(e.pivot.agg, 'sum');
            assert.equal(e.cells.A3, 'Commune'); assert.equal(e.cells.D5, 100); assert.equal(e.cells.D6, 225);
        });
        await t('↻ actualiser après une ligne ajoutée en bas des données ; ↶ revient', async () => {
            await page.evaluate(() => { const ed = window.LCNDA_EXT.tableurInternals.current; ed.showSheet(0); ed.begin('x'); [['E', 'Tulle', 19, 5]].forEach(row => row.forEach((v, j) => ed.put(ed.S(), window.LCNDA_SHEET.addr(5, j), {v}))); ed.commit(); ed.showSheet(1); });
            await cmd('pivotrefresh'); await page.waitForTimeout(300); assert.equal((await ED()).cells.D6, 230); assert.equal((await ED()).pivot.range, 'A1:D6');
            await page.evaluate(() => document.querySelector('dialog.xl-dlg [data-ui-cmd="undo"]').click()); await page.waitForTimeout(300); assert.equal((await ED()).cells.D6, 225);
        });
        await t('📊 graphique vivant : se dessine, suit la sélection, se ferme', async () => {
            await page.evaluate(() => { const ed = window.LCNDA_EXT.tableurInternals.current; ed.showSheet(0); ed.select(0, 1); ed.select(4, 3, true); ed.afterSel(); }); await cmd('livechart'); await page.waitForTimeout(500);
            assert.ok(await page.locator('.xl-live svg').count()); assert.match(await page.textContent('[data-live-range]'), /B1:D5/);
            await page.evaluate(() => { const ed = window.LCNDA_EXT.tableurInternals.current; ed.select(0, 2); ed.select(4, 3, true); ed.afterSel(); }); await page.waitForTimeout(400); assert.match(await page.textContent('[data-live-range]'), /C1:D5/);
            await page.click('[data-live-x]'); assert.equal(await page.locator('.xl-live').count(), 0);
            await page.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close())); await page.waitForTimeout(300);
        });
        const wpCmd = c => page.evaluate(c => document.querySelector(`dialog.wp-dlg[open] [data-wp-cmd="${c}"]`).click(), c);
        const docText = () => page.evaluate(() => [...document.querySelectorAll('dialog.wp-dlg[open]')].pop().querySelector('[data-wp-doc]').innerText.replace(/\s+/g, ' '));
        await t('📨 champ de fusion puis 👤 remplir avec une fiche (↶ revient)', async () => {
            await page.evaluate(() => { window.LCNDA_PICKER.openPicker = async o => (o.multiple ? [{id: 1}, {id: 2}] : {id: 1}); window.LCNDA_EXT.openTextDoc({data: window.LCNDA_EXT.textDocTools.dataOf('<p data-st="normal">Bonjour, née le </p>'), name: 'Essai'}); });
            await page.waitForSelector('dialog.wp-dlg[open] [data-wp-doc] p'); await page.waitForTimeout(600);
            for (const f of ['Prénom', 'Date de naissance']) { await page.evaluate(() => { const p = document.querySelector('dialog.wp-dlg [data-wp-doc] p'), r = document.createRange(); r.selectNodeContents(p); r.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(r); }); await wpCmd('mmfield'); await page.locator('.ui-actmenu-i', {hasText: f}).first().click(); await page.waitForTimeout(300); }
            assert.match(await docText(), /«Prénom».*«Date de naissance»/);
            await wpCmd('mmfill'); await page.waitForTimeout(800); assert.match(await docText(), /Louise.*3 mai 1890/); assert.doesNotMatch(await docText(), /«/);
            await page.keyboard.press('Meta+z'); await page.waitForTimeout(300); if (!/«Prénom»/.test(await docText())) { await page.keyboard.press('Control+z'); await page.waitForTimeout(300); } assert.match(await docText(), /«Prénom»/);
        });
        await t('📨 publipostage : deux personnes → un nouveau document, une copie chacune', async () => {
            await wpCmd('mailmerge'); await page.waitForSelector('dialog[open] [data-mm-add]'); await page.click('dialog[open] [data-mm-add]'); await page.waitForTimeout(600);
            assert.match(await page.textContent('dialog[open] [data-mm-list-box]'), /2 personnes/); assert.match(await page.textContent('dialog[open] [data-mm-prev]'), /Louise.*3 mai 1890/);
            await page.click('dialog[open]:not(.wp-dlg) button[type=submit]'); await page.waitForFunction(() => document.querySelectorAll('dialog.wp-dlg[open]').length === 2);
            await page.waitForTimeout(800); const tx = await docText(); assert.match(tx, /Bonjour, née le Louise 3 mai 1890 .*Bonjour, née le Jean …/); // Jean : pas de naissance → « … »
            await page.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close())); await page.waitForTimeout(300);
        });
        await t('modèle rempli : demande d’acte (la personne, ses parents, la mairie)', async () => {
            const html = await page.evaluate(async () => { const T = window.LCNDA_EXT.textDocTools.TEMPLATES.find(x => x.key === 'f_acte'); return T.person ? T.html(2) : ''; });
            assert.match(html, /Jean FAURE/); assert.match(html, /Pierre BORIE et de Louise BORIE/); assert.ok(['f_id', 'f_avis'].every(k => true));
            assert.equal(await page.evaluate(() => ['f_acte', 'f_id', 'f_avis'].every(k => window.LCNDA_EXT.textDocTools.TEMPLATES.some(x => x.key === k && x.person))), true);
        });
        await t('aucune erreur JavaScript', () => assert.deepEqual(errs, []));
    } finally { await browser.close(); proc.kill(); try { fs.rmSync(dir, {recursive: true, force: true}); } catch (_) {} }
    finish();
})();
function finish() { console.log(`${failed ? '✗' : '✓'} tableur et traitement de texte en plus : ${count} vérifications${failed ? `, ${failed} en échec` : ''}`); process.exit(failed ? 1 : 0); }
