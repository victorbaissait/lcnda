'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🧾 Tableur, vague 2 : « 🧾 Modifier les données » partout, « 🎯 Préparer pour… », « 📊 Graphique ▾ » lié à une plage.
 *   node tests/test-tableur-donnees.js        (captures si TABLEUR_SHOTS=dossier)
 *  1. lecteurs CSV communs (Node) : parseTable des diagrammes, parseCells de l'Éditeur de graphiques, tableValues des Tableaux
 *     (mêmes résultats qu'avant pour les formules déjà faites) ;
 *  2. navigateur, base neuve :
 *     - Diagrammes → Données → « 🧾 Modifier les données » : le tableur préparé (bandeau, colonnes), une formule, « ✓ Enregistrer et revenir » ;
 *     - grille de 500 lignes (carte en hexagones) : « Voir les 100 suivantes ↓ », la couleur de la ligne 451 changée reste après Enregistrer ;
 *     - « 📊 Graphique ▾ » : types conseillés, diagramme lié à la plage (bandeau 🔗), relu après un changement du classeur (la plage grandit) ;
 *     - « 🧾 Prendre un classeur du Tableur » (menu de choix, feuille, plage, « Garder le lien ») ;
 *     - « 🎯 Préparer pour… » : ✓ / ⚠️ « C3 contient « env. 9 » : compté comme 9 », aperçu, puis un graphique (Mes graphiques) et une présentation ;
 *     - Éditeur de graphiques (cible « Nom + séries »), Tableaux (objet ▦ Tableur), Recueils (lignes reliées gardées), Présentation (tableau) ;
 *     - Listes → « ⤓ Exporter ▾ → 🧾 Ouvrir dans le tableur » (mêmes colonnes) ; statistiques (« 🧾 Tableur » dans la fenêtre d'export) ;
 *     - 390 px et mode sombre ; aucune erreur dans la console.
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
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; }; const eq = (a, b, m) => { assert.deepStrictEqual(a, b, m); n++; };

/* ── 1. Node : les lecteurs passent par le moteur commun, mêmes résultats ── */
{
    const sb = { window: {}, console, setTimeout, clearTimeout, document: { addEventListener() {}, createElement: () => ({}) }, localStorage: { getItem: () => null, setItem() {} } };
    sb.window.LCNDA_APP = { escapeHtml: v => String(v), state: {}, appModules: {}, defaultListTypes: [], defaultMaintenanceTabs: [], orderedDashboardWidgetTypes: () => [], dashboardWidgetLabel: k => k, syncCustomDashboardWidgets() {}, dashboardBlockSettings: () => ({ widgets: [] }) };
    vm.createContext(sb);
    vm.runInContext(fs.readFileSync(path.join(appRoot, 'assets/js/app-tableur-engine.js'), 'utf8'), sb);
    vm.runInContext(fs.readFileSync(path.join(appRoot, 'assets/js/heritage-widgets.js'), 'utf8'), sb);
    const F = sb.window.LCNDA_EXT.graphsFreeInternals;
    eq(JSON.parse(JSON.stringify(F.parseCells('Ville;"1 200,5";x\n"a;b";2;"ligne\nsuite"\n\n'))), [['Ville', '1 200,5', 'x'], ['a;b', '2', 'ligne\nsuite']], 'parseCells : guillemets, retour dans une case, lignes vides');
    eq(JSON.parse(JSON.stringify(F.parseCells('A\t1\nB\t2'))), [['A', '1'], ['B', '2']], 'parseCells : tabulations');
}
(async () => {
    const phpPath = findPhp([devBundledPhp()]);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-tableur2-'));
    const env = { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media'), GENEALOGY_SKIP_REFERENCE: '1' };
    fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
    const r0 = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p->exec("INSERT INTO persons(first_name,last_name,gender) VALUES('Jean','Martin','male'),('Marie','Durand','female')"); $p = null;
require 'lib/bootstrap.php'; db(); echo 'ok';`], { cwd: appRoot, encoding: 'utf8', env });
    if (r0.status !== 0 || !/ok$/.test(r0.stdout)) { console.error(r0.stderr || r0.stdout); process.exit(1); }
    const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const port = Number(process.env.TABLEUR_PORT) || await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env, stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
    let pw = null; for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
    const SHOTS = process.env.TABLEUR_SHOTS || '';
    let browser = null;
    try {
        if (!pw) { console.log('  – navigateur : sauté (Playwright absent)'); return; }
        browser = await pw.chromium.launch();
        const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        const page = await ctx.newPage(); const errors = [];
        page.on('pageerror', e => errors.push('pageerror ' + e.message)); page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push('console ' + m.text()); });
        await page.goto(base); await page.waitForFunction(() => window.LCNDA_EXT?.sheetTargets && window.LCNDA_EXT.diagramRender && window.LCNDA_EXT.openDiagramEditor && window.LCNDA_APP?.state?.csrf);
        const closeAll = () => page.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => { if (d.id) return d.close(); const E = window.LCNDA_EXT.tableurInternals?.current; if (E && E.dlg === d) E.dirty = false; d.close(); d.remove(); }));
        const ed = fn => page.evaluate(fn);
        const setCells = cells => page.evaluate(cs => { const E = window.LCNDA_EXT.tableurInternals.current, sh = E.S(); E.begin('essai'); Object.entries(cs).forEach(([k, v]) => E.put(sh, k, v == null ? null : {...(sh.cells[k] || {}), v})); E.commit(); E.render(); }, cells);

        /* tableValues des Tableaux : le moteur commun, mêmes résultats */
        eq(await ed(() => JSON.stringify(window.LCNDA_EXT.boardsInternals.tableValues([['Nom', 'Né', 'Mort', 'Âge'], ['Jean', '1792', '1868', '=C2-B2'], ['Marie', '1798', '1871', '=C3-B3'], ['Moyenne', '', '', '=MOYENNE(D2:D3)'], ['', '', '', '=SOMME(D2:D3)*2'], ['', '', '', '=ARRONDI(D4/3;1)']]))),
            JSON.stringify([['Nom', 'Né', 'Mort', 'Âge'], ['Jean', 1792, 1868, 76], ['Marie', 1798, 1871, 73], ['Moyenne', '', '', 74.5], ['', '', '', 298], ['', '', '', 24.8]]), 'tableValues : mêmes résultats sur le moteur commun');
        eq(await ed(() => JSON.stringify(window.LCNDA_EXT.diagramsInternals.parseTable('Ville;Nombre\n"Saint-Malo; port";"1 200"\nRennes;42'))), JSON.stringify([['Ville', 'Nombre'], ['Saint-Malo; port', '1 200'], ['Rennes', '42']]), 'parseTable des diagrammes : le lecteur commun');
        eq(await ed(() => Object.keys(window.LCNDA_EXT.sheetTargets).sort().join(',')), 'board,diagram,graph,keynote,recueil', 'les endroits déclarés (ext.sheetTargets)');

        /* A. Diagrammes → Données → 🧾 Modifier les données → ✓ Enregistrer et revenir */
        await ed(() => window.LCNDA_EXT.openDiagramEditor(null, {spec: {kind: 'columns', o: {title: 'Essai'}, series: [{name: 'Hommes'}], rows: [{label: 'A', s0: 1, color: '#ff0000'}, {label: 'B', s0: 2}]}, name: 'Essai'}));
        await page.waitForSelector('.h-dg-dlg [data-dg-sheet]'); await page.click('.h-dg-dlg [data-dg-sheet]');
        await page.waitForSelector('dialog.xl-dlg[open] .xl-back');
        ok(/Catégorie, Série \(une ou plusieurs\)/.test(await page.textContent('dialog.xl-dlg .xl-back')), 'le bandeau dit ce que le diagramme attend');
        eq(await ed(() => { const E = window.LCNDA_EXT.tableurInternals.current; return [E.dirty, E.S().name, window.LCNDA_SHEET.matrix(E.wb, E.calc, 0).map(r => r.join('|')).join(' / ')]; }), [false, 'Les chiffres', 'Catégorie|Hommes|Couleur / A|1|#ff0000 / B|2|'], 'le tableur préparé (une feuille par tableau)');
        if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'a-modifier-les-donnees.png') });
        await setCells({B3: '=B2*10', A4: 'C', B4: 'env. 7', D1: 'Femmes', D2: 3});
        await page.click('dialog.xl-dlg .xl-back [data-xl-cmd="save"]'); await page.waitForSelector('dialog.xl-dlg', { state: 'detached' });
        eq(await ed(() => [...document.querySelectorAll('.h-dg-dlg [data-grid="0"] tbody tr')].map(tr => [...tr.querySelectorAll('input:not([type=color])')].map(i => i.value).join('|')).join(' / ')), 'A|1|3 / B|10| / C|7|', 'revenu dans le diagramme : formule calculée, « env. 7 » compté 7, une série de plus');
        eq(await ed(() => [...document.querySelectorAll('.h-dg-dlg [data-dg-sername]')].map(i => i.value).join(',')), 'Hommes,Femmes', 'les séries prennent les titres');
        eq(await ed(() => document.querySelector('.h-dg-dlg input[type=color][data-r="0"]').value), '#ff0000', 'la couleur de la ligne est gardée');
        await closeAll();

        /* B. 500 lignes : Voir les suivantes, couleur de la ligne 451 */
        await ed(() => { const K = window.LCNDA_EXT.diagramRender.KINDS.hexmap; window.LCNDA_EXT.openDiagramEditor(null, {spec: {kind: 'hexmap', ...K.sample()}, name: 'Hexagones'}); });
        await page.waitForSelector('.h-dg-dlg [data-dg-more="0"]');
        eq(await page.locator('.h-dg-dlg [data-dg-body="0"] tr').count(), 400, '400 lignes d’abord');
        ok(/400 lignes sur 500/.test(await page.textContent('.h-dg-dlg [data-dg-morebar="0"]')), 'C6 : « Voir les 100 suivantes ↓ »');
        await page.click('.h-dg-dlg [data-dg-more="0"]'); await page.waitForTimeout(200);
        eq([await page.locator('.h-dg-dlg [data-dg-body="0"] tr').count(), await page.locator('.h-dg-dlg [data-dg-morebar]').count()], [500, 0], 'toutes les lignes, plus de barre');
        await ed(() => { const i = document.querySelector('.h-dg-dlg input[type=color][data-r="450"]'); i.value = '#ff0000'; i.dispatchEvent(new Event('input', {bubbles: true})); });
        await page.click('.h-dg-dlg [data-dg-save]'); await page.waitForSelector('.h-dg-dlg', { state: 'detached' });
        eq(await ed(async () => { const d = (await window.LCNDA_EXT.diagramList(true)).find(x => x.name === 'Hexagones'); return [d.spec.rows.length, d.spec.rows[450].color]; }), [500, '#ff0000'], 'la couleur de la ligne 451 reste après Enregistrer');

        /* C. 📊 Graphique ▾ depuis une plage : lié, relu */
        await ed(() => { const S = window.LCNDA_SHEET; window.LCNDA_EXT.openWorkbook({data: {sheets: [{name: 'Relevé', cells: S.rowsToCells([['Décennie', 'Hommes', 'Femmes'], [1830, 7, 6], [1840, 10, 9], [1850, 8, 9]])}]}, name: 'Relevé 1836'}); });
        await page.waitForSelector('dialog.xl-dlg[open] .xl-c');
        await page.click('.xl-tools [data-xl-cmd="chart"]'); await page.waitForSelector('.ui-actmenu-i');
        const sugg = await ed(() => [...document.querySelectorAll('.ui-actmenu-i')].map(b => b.textContent.trim()));
        ok(/Courbe/.test(sugg[0]) && sugg.some(x => /Colonnes groupées/.test(x)) && sugg.some(x => /Tous les types/.test(x)), 'types conseillés (des décennies : la courbe d’abord) : ' + sugg.join(' | '));
        if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'c-graphique-menu.png') });
        await page.click('.ui-actmenu-i:has-text("Colonnes groupées")'); await page.waitForSelector('.h-dg-dlg .xl-linkbar', { timeout: 10000 });
        ok(/« Relevé 1836 » ! A1:C4 .*tenu à jour/.test(await page.textContent('.h-dg-dlg .xl-linkbar')), 'bandeau 🔗 Données : « Relevé 1836 » ! A1:C4 · tenu à jour');
        const wbId = await ed(() => window.LCNDA_EXT.tableurInternals.current.id); ok(wbId > 0, 'le classeur a été rangé dans le Tableur');
        if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'c-diagramme-lie.png') });
        await page.fill('.h-dg-dlg [data-dg-name]', 'Naissances liées'); await page.click('.h-dg-dlg [data-dg-save]'); await page.waitForSelector('.h-dg-dlg', { state: 'detached' });
        await setCells({B2: 70, A5: 1860, B5: 3, C5: 4}); await ed(() => window.LCNDA_EXT.tableurInternals.current.save()); await page.waitForTimeout(300);
        eq(await ed(async () => { const d = (await window.LCNDA_EXT.diagramList(true)).find(x => x.name === 'Naissances liées'); const s = await window.LCNDA_EXT.sheetLink.resolve({...d.spec, kind: d.kind}); return s.rows.map(r => [r.label, r.s0, r.s1]); }), [['1830', 70, 6], ['1840', 10, 9], ['1850', 8, 9], ['1860', 3, 4]], 'le diagramme relit la plage (qui grandit avec une ligne ajoutée)');

        /* D. 🎯 Préparer pour… */
        await setCells({C3: 'env. 9'});
        await ed(() => window.LCNDA_EXT.sheetCommands.prepare(window.LCNDA_EXT.tableurInternals.current));
        await page.waitForSelector('[data-prep-to="diagram"]'); await page.click('[data-prep-to="diagram"]'); await page.waitForSelector('.xl-prep-map');
        const prep = await page.textContent('[data-xl-prep]');
        ok(/A · Décennie/.test(prep) && /B · Hommes, C · Femmes/.test(prep) && /C3 contient « env\. 9 » : compté comme 9/.test(prep), 'colonnes reconnues et ⚠️ « C3 contient env. 9 : compté comme 9 »');
        ok(await page.locator('.xl-prep-prev svg').count() > 0, 'aperçu du diagramme');
        if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'd-preparer-pour.png') });
        await page.click('[data-prep-back]'); await page.click('[data-prep-to="graph"]'); await page.waitForSelector('.xl-prep-map');
        await page.click('dialog[open] .modal-actions [type=submit]'); await page.waitForTimeout(300);
        eq(await ed(() => { const g = window.LCNDA_EXT.myGraphs().find(x => /^Relevé 1836/.test(x.name)); return g ? [g.free.series.map(s => s.name).join(','), g.free.rows.length, g.free.rows[1].v.join('|')] : null; }), ['Hommes,Femmes', 4, '10|9'], '📈 un graphique « Mes propres chiffres » créé');
        await ed(() => window.LCNDA_EXT.sheetCommands.prepare(window.LCNDA_EXT.tableurInternals.current, 'keynote')); await page.waitForSelector('[data-prep-as="chart"]');
        await page.click('[data-prep-as="chart"]'); await page.click('dialog[open] .modal-actions [type=submit]');
        await page.waitForFunction(() => [...document.querySelectorAll('dialog[open]')].some(d => d.querySelector('[data-kn-rail]')), null, { timeout: 10000 });
        ok(true, '🎤 une présentation neuve avec le graphique');
        await closeAll();

        /* E. 🧾 Prendre un classeur du Tableur (Diagrammes → Données) */
        await ed(() => window.LCNDA_EXT.openDiagramEditor(null, {spec: {kind: 'columns', o: {title: 'Pris'}, series: [{name: 'S'}], rows: []}, name: 'Pris'}));
        await page.waitForSelector('.h-dg-dlg [data-dg-paste="0"]'); await page.click('.h-dg-dlg [data-dg-paste="0"]');
        await page.waitForSelector('dialog[open] [data-dg-pastebook]'); await page.click('dialog[open] [data-dg-pastebook]');
        await page.waitForSelector('dialog[open] .xl-take .pk-input'); await page.click('dialog[open] .xl-take .pk-input'); await page.keyboard.type('Relevé', { delay: 20 }); await page.waitForTimeout(900); await page.keyboard.press('Enter');
        await page.waitForSelector('dialog[open] [name=xl_range]');
        eq(await page.inputValue('dialog[open] [name=xl_range]'), 'A1:C5', 'par défaut toute la feuille utilisée');
        await page.check('dialog[open] [name=xl_mode][value=link]');
        if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'e-prendre-un-classeur.png') });
        await page.click('dialog[open] .modal-actions [type=submit]'); await page.waitForSelector('.h-dg-dlg .xl-linkbar');
        eq(await page.locator('.h-dg-dlg [data-grid="0"] tbody tr').count(), 4, 'la plage liée remplit la grille');
        await closeAll();

        /* F. Éditeur de graphiques (« Nom + séries »), Tableaux, Recueils, Présentation : aller et retour */
        await ed(() => { window.__free = null; window.LCNDA_EXT.openSheetEditor({target: 'graph', data: {series: [{name: 'Nombre'}], rows: [{label: 'Rennes', v: ['42']}]}, name: 'Habitants', onSave: f => { window.__free = f; }}); });
        await page.waitForSelector('dialog.xl-dlg[open] .xl-back'); await setCells({A3: 'Nantes', B3: '=B2/2', C1: '1950', C2: 51});
        await page.click('dialog.xl-dlg .xl-back [data-xl-cmd="save"]'); await page.waitForSelector('dialog.xl-dlg', { state: 'detached' });
        eq(await ed(() => window.__free), {series: [{name: 'Nombre', color: ''}, {name: '1950', color: ''}], rows: [{label: 'Rennes', v: ['42', '51']}, {label: 'Nantes', v: ['21', '']}]}, '📈 Éditeur de graphiques : Nom + séries');

        const bid = await ed(async () => { const s = await window.LCNDA_APP.api('save_board', {}, {method: 'POST', body: {title: 'Tableau essai', data: {items: [{id: 'tb1', type: 'table', x: 100, y: 100, w: 300, h: 120, cells: [['Nom', 'Né', 'Âge'], ['Jean', '1792', '=1868-B2']], merges: [{r: 0, c: 0, rs: 1, cs: 2}]}]}}}); return s.result?.id || s.id; });
        await ed(id => window.LCNDA_EXT.openBoardById(id), bid); await page.waitForTimeout(1200); if (!await page.locator('.h-bi-table').count()) await page.click('text=Tableau essai'); await page.waitForSelector('.h-bi-table', { timeout: 20000 }).catch(async e => { await page.screenshot({ path: '/tmp/claude-0/-home-user-lcnda/ad8201b5-1353-5614-bebe-2d8bd96b57cd/scratchpad/tableur2a/shots/fail-board.png' }); console.log(await page.evaluate(() => [window.LCNDA_APP.state.module, window.LCNDA_APP.state.enquetesTab, document.querySelectorAll('dialog[open]').length, [...document.querySelectorAll('dialog[open]')].map(d => d.className).join()])); throw e; }); await page.waitForTimeout(300);
        const tbl = page.locator('.h-bi-table').first(); await tbl.click(); await page.waitForTimeout(300);
        await page.waitForSelector('[data-bd-tbl="sheet"]'); await page.click('[data-bd-tbl="sheet"]');
        await page.waitForSelector('dialog.xl-dlg[open] .xl-back');
        eq(await ed(() => { const E = window.LCNDA_EXT.tableurInternals.current; return [E.S().cells.C2.v, E.S().merges.join(), window.LCNDA_SHEET.formatValue(E.calc.val(0, 1, 2))]; }), ['=1868-B2', 'A1:B1', '76'], '🧩 Tableaux : formule et fusion arrivent dans le tableur');
        await setCells({A3: 'Marie', B3: '1798', C3: '=SI(B3="";"";1871-B3)'});
        await page.click('dialog.xl-dlg .xl-back [data-xl-cmd="save"]'); await page.waitForSelector('dialog.xl-dlg', { state: 'detached' }); await page.waitForTimeout(300);
        eq(await ed(() => { const t = [...document.querySelectorAll('.h-bi-table td')].map(td => td.textContent); return t.join('|'); }), 'Nom|Âge|Jean|1792|76|Marie|1798|73', '🧩 revenu dans l’objet ▦ Tableur (une fonction de plus : SI)');
        await page.evaluate(() => { window.LCNDA_APP.state.module = 'dashboard'; window.LCNDA_APP.setModule('dashboard'); }); await page.waitForTimeout(500);

        await ed(() => { const box = document.createElement('div'); box.id = 'rt-essai'; document.body.appendChild(box); window.__rt = {v: 1, locked: true, cols: [{id: 'c1', name: 'Nom'}, {id: 'c2', name: 'Âge'}], rows: [{id: 'r1', c: {c1: 'MARTIN Jean', c2: '62'}, person: {id: 1, name: 'Jean Martin', link: 9}}, {id: 'r2', c: {c1: 'DURAND Pierre', c2: '45'}}], merges: []}; window.__unp = []; window.LCNDA_EXT.recueilTable(box, window.__rt, {onChange() {}, onPerson: (r, m) => { window.__unp.push([r.id, m]); return Promise.resolve(); }}); });
        await page.click('#rt-essai [data-rt-sheet]'); await page.waitForSelector('dialog.xl-dlg[open] .xl-back');
        eq(await ed(() => { const E = window.LCNDA_EXT.tableurInternals.current; return [window.LCNDA_SHEET.matrix(E.wb, E.calc, 0, {r0: 0, c0: 0, r1: 2, c1: 2}).map(r => r.join('|')).join(' / '), E.S().cells.C2.ref?.id, !!E.S().cols.D?.hidden]; }), ['Nom|Âge|👤 Fiche (se relie dans la page) / MARTIN Jean|62|Jean Martin / DURAND Pierre|45|', 1, true], '📚 Recueils : la fiche reliée et la clé cachée de chaque ligne');
        await ed(() => { const E = window.LCNDA_EXT.tableurInternals.current; E.select(0, 0); }); await page.evaluate(() => window.LCNDA_EXT.tableurInternals.current.run('sortza'));
        await setCells({A4: 'BERNARD Paul', B4: 30});
        await page.click('dialog.xl-dlg .xl-back [data-xl-cmd="save"]'); await page.waitForSelector('dialog.xl-dlg', { state: 'detached' });
        eq(await ed(() => window.__rt.rows.map(r => `${r.c.c1}:${r.person ? r.person.id : ''}:${/^r\d$/.test(r.id) ? r.id : 'neuve'}`).join(' / ')), 'MARTIN Jean:1:r1 / DURAND Pierre::r2 / BERNARD Paul::neuve', '📚 trié Z → A, une ligne ajoutée : la ligne reliée à la fiche le reste');
        await ed(() => document.getElementById('rt-essai').remove());

        /* Présentation : objet Tableau → 🧾 Modifier les données */
        await ed(() => window.LCNDA_EXT.keynoteWithObject({t: 'table', rows: [['Année', 'Lieu'], ['1850', 'Tulle']]}, 'Essai présentation'));
        await page.waitForSelector('[data-kn-rail]'); await page.waitForTimeout(600);
        const kb = await ed(() => { const t = [...document.querySelectorAll('dialog[open] table')].filter(x => x.textContent.includes('Tulle')).sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0].getBoundingClientRect(); return {x: t.x + t.width / 2, y: t.y + t.height / 2}; });
        await page.mouse.click(kb.x, kb.y); await page.waitForSelector('[data-kn-x="sheet"]'); await page.click('[data-kn-x="sheet"]');
        await page.waitForSelector('dialog.xl-dlg[open] .xl-back'); await setCells({A3: '=A2+25', B3: 'Brive'});
        await page.click('dialog.xl-dlg .xl-back [data-xl-cmd="save"]'); await page.waitForSelector('dialog.xl-dlg', { state: 'detached' });
        ok(/1875\s+Brive/.test(await ed(() => [...document.querySelectorAll('dialog[open] table')].filter(x => x.textContent.includes('Tulle')).pop().innerText)), '🎤 Présentation : le tableau revient du tableur (formule calculée)');
        await closeAll();

        /* G. Listes → ⤓ Exporter ▾ → 🧾 Ouvrir dans le tableur ; statistiques */
        await ed(() => { window.LCNDA_APP.state.listType = 'persons'; window.LCNDA_APP.setModule('listes'); }); await page.waitForSelector('[data-cols-export]', { timeout: 15000 });
        await page.click('[data-cols-export]'); await page.click('.ui-actmenu-i:has-text("Ouvrir dans le tableur")'); await page.waitForSelector('dialog.xl-dlg[open] .xl-c');
        const lst = await ed(() => { const E = window.LCNDA_EXT.tableurInternals.current; return window.LCNDA_SHEET.matrix(E.wb, E.calc, 0); });
        ok(lst.length === 3 && lst.flat().some(v => /Martin/i.test(String(v))) && lst[0].length >= 2, 'la liste (2 personnes) ouverte dans le tableur, mêmes colonnes : ' + JSON.stringify(lst[0]));
        await closeAll();
        eq(await ed(() => { window.LCNDA_EXT.openRowsInSheet({name: 'Stat', csv: '﻿Ma stat\r\nValeur;Nombre;Part (%)\r\nRennes;3;75\r\nNantes;1;25\r\n'}); const E = window.LCNDA_EXT.tableurInternals.current; return window.LCNDA_SHEET.matrix(E.wb, E.calc, 0); }), [['Valeur', 'Nombre', 'Part (%)'], ['Rennes', 3, 75], ['Nantes', 1, 25]], 'statistique : le CSV ouvert dans le tableur (ligne de titre écartée)');
        await closeAll();

        /* H. 390 px et mode sombre */
        await page.setViewportSize({ width: 390, height: 800 });
        await ed(() => document.documentElement.setAttribute('data-theme', 'dark'));
        await ed(() => window.LCNDA_EXT.openSheetEditor({target: 'diagram', data: {kind: 'columns', o: {title: 'Petit'}, series: [{name: 'S'}], rows: [{label: 'A', s0: 1}]}, name: 'Petit écran', onSave: () => true}));
        await page.waitForSelector('dialog.xl-dlg[open] .xl-back');
        const over = await ed(() => { const b = document.querySelector('.xl-back'), r = b.getBoundingClientRect(); return [Math.round(r.right), document.documentElement.scrollWidth, getComputedStyle(b).backgroundColor]; });
        ok(over[0] <= 392 && over[1] <= 392, `390 px : le bandeau tient dans l’écran (${over[0]}, ${over[1]})`); ok(over[2] !== 'rgb(234, 242, 255)', 'mode sombre : le bandeau change de couleur');
        if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'h-390-sombre.png') });
        await page.click('dialog.xl-dlg .xl-back [data-xl-cmd="save"]'); await page.waitForSelector('dialog.xl-dlg', { state: 'detached' });
        await ed(() => { const S = window.LCNDA_SHEET; window.LCNDA_EXT.openWorkbook({data: {sheets: [{name: 'R', cells: S.rowsToCells([['Âge', 'Hommes', 'Femmes'], ['0-9', 3, 4], ['10-19', 2, 2], ['20-29', 5, 3]])}]}, name: 'Pyramide'}); });
        await page.waitForSelector('dialog.xl-dlg[open] .xl-c');
        await ed(() => window.LCNDA_EXT.sheetCommands.prepare(window.LCNDA_EXT.tableurInternals.current, 'diagram')); await page.waitForSelector('.xl-prep-map');
        const w2 = await ed(() => [document.querySelector('dialog[open] .xl-prep').scrollWidth, document.querySelector('dialog[open] .xl-prep').clientWidth]);
        ok(w2[0] <= w2[1] + 2, `390 px : « Préparer pour… » sans défilement de côté (${w2})`);
        if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'h-390-preparer.png') });
        await closeAll();
        eq(await ed(() => { const S = window.LCNDA_SHEET, T = window.LCNDA_EXT.tableurCiblesInternals, wb = S.normalize({sheets: [{name: 'R', cells: S.rowsToCells([['Âge', 'Hommes', 'Femmes'], ['0-9', 3, 4], ['10-19', 2, 2], ['20-29', 5, 3]])}]}); const t = T.tableOf(wb, new S.Calc(wb), 0, S.usedRange(wb.sheets[0])); return T.suggest(T.shapeOf(t))[0].kind; }), 'pyramid', 'des tranches d’âge et deux séries : la pyramide d’abord');

        eq(errors, [], 'aucune erreur dans la console');
    } finally {
        if (browser) await browser.close();
        proc.kill();
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
    }
    console.log(`✓ ${n} vérifications : Tableur, vague 2 (Modifier les données, Préparer pour…, graphique lié)`);
})().catch(e => { console.error(e); process.exit(1); });
