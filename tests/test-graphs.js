'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 📈 Mes graphiques et diagrammes :
 *     node tests/test-graphs.js
 * 1. Sans navigateur (heritage-widgets.js dans un bac à sable) : « ✍️ Mes propres chiffres » d'un graphique — tableau
 *    nettoyé (JSON forgé, trop de lignes ou de séries, valeurs piégées), collage depuis un tableur (titres devinés, années
 *    en titres), chiffres dans l'ordre du tableau ; une liste ou un compteur ne gardent pas cette source.
 * 2. Navigateur (si Playwright est installé ; sinon cette partie est sautée), sur un vrai « php -S » :
 *    « ＋ Diagramme » → « 📈 Un de mes graphiques » pose le graphique (un seul diagramme qui le suit, réutilisé),
 *    la case se redessine quand le graphique change (dessin, chiffres, nom), « ✎ Modifier » rouvre l'Éditeur de
 *    statistiques, la mise en page reçoit le dessin (SVG), Listes → « Graphiques et diagrammes » (barre H10, filtres,
 *    textes piégés affichés tels quels), le bloc « Diagramme » d'une Fiche propose « 📈 Un de mes graphiques »,
 *    supprimer le graphique retire son diagramme ; aucune erreur JavaScript.
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
const store = {};
const storage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
const sandbox = { window: {}, localStorage: storage, document: { addEventListener() {}, createElement: () => ({}) }, console, setTimeout, clearTimeout };
sandbox.window.LCNDA_APP = {
    escapeHtml: v => String(v), state: {}, appModules: { dashboard: ['01', 'Tableau de bord'] }, defaultListTypes: [], defaultMaintenanceTabs: [],
    orderedDashboardWidgetTypes: () => [['stats', '01', 'Chiffres clés']], dashboardWidgetLabel: k => k, syncCustomDashboardWidgets() {}, dashboardBlockSettings: () => ({ widgets: [] }),
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(appRoot, 'assets/js/heritage-widgets.js'), 'utf8'), sandbox, { filename: 'heritage-widgets.js' });
const ext = sandbox.window.LCNDA_EXT, F = ext.graphsFreeInternals;

step('mes chiffres : un graphique garde son tableau, nettoyé', () => {
    const d = ext.cleanWidgetDef({ id: 'cw_abcd1234', name: 'Habitants', kind: 'chart', src: { source: 'manual', definition: { rules: [{ field: 'x' }] } },
        free: { series: [{ name: '1900', color: '#ff0000' }, { name: '<img src=x onerror=alert(1)>', color: 'red;background:url(x)' }], rows: [{ label: 'Rennes', v: ['42', '51'] }, null, 'zz', { label: 'Nantes', v: [{ a: 1 }, '1 200,5'] }] } });
    assert.deepEqual(JSON.parse(JSON.stringify(d.src)), { source: 'manual' });
    assert.equal(d.free.series.length, 2); assert.equal(d.free.series[0].color, '#ff0000'); assert.equal(d.free.series[1].color, '');
    assert.deepEqual(JSON.parse(JSON.stringify(d.free.rows)), [{ label: 'Rennes', v: ['42', '51'] }, { label: 'Nantes', v: ['', '1 200,5'] }]);
});
step('mes chiffres : au plus 300 lignes, 12 séries, textes coupés', () => {
    const f = F.cleanFree({ series: Array.from({ length: 40 }, (_, i) => ({ name: 'S' + i })), rows: Array.from({ length: 5000 }, () => ({ label: 'x'.repeat(900), v: Array.from({ length: 40 }, () => '9'.repeat(99)) })) });
    assert.equal(f.series.length, 12); assert.equal(f.rows.length, 300); assert.equal(f.rows[0].label.length, 120); assert.equal(f.rows[0].v.length, 12); assert.equal(f.rows[0].v[0].length, 30);
    assert.deepEqual(JSON.parse(JSON.stringify(F.cleanFree(null))), { series: [{ name: 'Nombre', color: '' }], rows: [] });
});
step('mes chiffres : une liste ou un compteur ne prennent pas cette source', () => {
    assert.equal(ext.cleanWidgetDef({ kind: 'list', src: { source: 'manual' } }).src.source, 'persons');
    assert.equal(ext.cleanWidgetDef({ kind: 'numbers', counters: [{ label: 'a', src: { source: 'manual' } }] }).counters[0].src.source, 'persons');
});
step('mes chiffres : dans l’ordre du tableau, première série, virgule française', () => {
    const e = F.groupRows({ free: { series: [{ name: 'A' }, { name: 'B' }], rows: [{ label: 'Z', v: ['1,5', '9'] }, { label: '', v: ['', ''] }, { label: 'A', v: ['1 000', ''] }, { label: '', v: ['3'] }] } }, {});
    assert.deepEqual(e.map(x => [...x]), [['Z', 1.5], ['A', 1000], ['(sans nom)', 3]]);
    assert.equal(e.counted, 1004.5); assert.equal(e.free.series.length, 2);
});
step('coller : titres devinés (mots ou années au-dessus des chiffres)', () => {
    const P = t => F.parseCells(t);
    assert.equal(F.guessHead(P('Ville\tNombre\nRennes\t42\nNantes\t25')), true);
    assert.equal(F.guessHead(P('Ville;1900;1950\nRennes;1 200,5;51\nNantes;25;30')), true);
    assert.equal(F.guessHead(P('Rennes\t42\nNantes\t25')), false);
    const d = { free: F.FREE_SAMPLE() };
    F.pasteFree(d, P('Ville;1900;1950;2000\nRennes;"1 200,5";51;60\nNantes;25;30;45'));
    assert.deepEqual([...d.free.series.map(s => s.name)], ['1900', '1950', '2000']);
    assert.deepEqual([...d.free.rows.map(r => r.label)], ['Rennes', 'Nantes']); assert.equal(d.free.rows[0].v[0], '1 200,5');
    F.pasteFree(d, P('Brest\t5\t6\t7\t8'), 1, 0); // à partir d'une case : une série de plus si besoin
    assert.equal(d.free.rows[1].label, 'Brest'); assert.equal(d.free.series.length, 4); assert.equal(d.free.rows[1].v[3], '8');
    F.pasteFree(d, P('Ville;1900\nA;1'), null, 0, false); // « est une ligne de chiffres comme les autres »
    assert.deepEqual([...d.free.rows.map(r => r.label)], ['Ville', 'A']);
});

/* ── 2. Navigateur ── */
let chromium = null;
try { ({ chromium } = require('playwright')); } catch (_) { try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); } catch (__) { chromium = null; } }
const phpPath = findPhp([devBundledPhp()]);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-graphs-'));
const envFor = d => ({ ...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1' });
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });

(async () => {
    for (const [name, fn] of steps) { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } }
    if (!chromium || !phpPath) { console.log('— navigateur : Playwright ou PHP absent, partie sautée'); process.exit(failed ? 1 : 0); }
    fs.mkdirSync(path.join(tmp, 'media'), { recursive: true });
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p->exec("INSERT INTO persons(first_name,last_name,gender) VALUES('Joseph','Martin','male'),('Marie','Durand','female')"); $p = null;
require 'lib/bootstrap.php'; db(); echo 'ok';`], { cwd: appRoot, encoding: 'utf8', env: envFor(tmp) });
    if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exit(1); }
    const port = await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env: envFor(tmp), stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
    const browser = await chromium.launch();
    const errors = [];
    const t = async (name, fn) => { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
    try {
        const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
        const GRAPH = { id: 'cw_test1234', name: 'Habitants <img src=x onerror="window.__xss=1">', icon: '📈', kind: 'chart', inStats: true, width: '12', style: 'columns', palette: 'vive', src: { source: 'manual' },
            free: { series: [{ name: '1900' }, { name: '1950' }], rows: [{ label: 'Rennes', v: ['42', '51'] }, { label: 'Nantes', v: ['25', '30'] }] } };
        await ctx.addInitScript(g => { try { if (!localStorage.getItem('genealogie-custom-widgets')) localStorage.setItem('genealogie-custom-widgets', JSON.stringify([g])); } catch (_) {} }, GRAPH);
        const p = await ctx.newPage();
        p.on('pageerror', e => errors.push(e.message));
        p.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(m.text()); });
        p.on('dialog', d => { errors.push('dialogue : ' + d.message()); d.dismiss(); });
        await p.goto(base);
        await p.waitForFunction(() => window.LCNDA_APP?.state && window.LCNDA_EXT?.myGraphs && window.LCNDA_EXT?.pickMyGraph, null, { timeout: 20000 });
        await p.waitForTimeout(600);
        await t('reprise : le graphique du navigateur passe dans la base, l’ancien réglage part', async () => {
            await p.waitForFunction(() => localStorage.getItem('genealogie-custom-widgets') === null, null, { timeout: 15000 });
            const r = await (await fetch(base + 'api.php?action=graphs')).json();
            assert.deepEqual(r.graphs.map(g => g.id), ['cw_test1234']);
            assert.deepEqual(await p.evaluate(() => window.LCNDA_EXT.myGraphs().map(g => g.id)), ['cw_test1234']);
        });
        const pickIn = async () => { await p.waitForSelector('.pk-dialog .pk-row[data-row="0"]'); await p.click('.pk-dialog .pk-row[data-row="0"]'); };
        let did = 0;
        await t('« ＋ Diagramme » → « 📈 Un de mes graphiques » : un diagramme qui suit le graphique, réutilisé ensuite', async () => {
            const pick = () => p.evaluate(() => window.LCNDA_EXT.pickDiagram({ title: 'Ajouter un diagramme' }));
            let pr = pick(); await p.click('[data-mygraph]'); await pickIn(); did = await pr;
            assert.ok(did > 0);
            pr = pick(); await p.click('[data-mygraph]'); await pickIn(); assert.equal(await pr, did);
            const all = await p.evaluate(async () => (await window.LCNDA_EXT.diagramList(true)).map(d => ({ id: d.id, follow: window.LCNDA_EXT.diagramFollowId(d) })));
            assert.deepEqual(all, [{ id: did, follow: 'cw_test1234' }]);
        });
        await t('la case se dessine (deux séries) puis suit le graphique modifié (dessin, chiffres, nom)', async () => {
            await p.evaluate(id => { const box = document.createElement('div'); box.id = 'gr-test'; box.innerHTML = window.LCNDA_EXT.diagramEmbedHtml(id); document.body.appendChild(box); }, did);
            await p.waitForFunction(() => document.querySelector('#gr-test svg'));
            const txt = await p.$eval('#gr-test svg', s => s.textContent);
            assert.match(txt, /1900/); assert.match(txt, /1950/); assert.match(txt, /Rennes/);
            assert.equal(await p.evaluate(async () => { const l = window.LCNDA_EXT.customWidgetList(); l[0] = JSON.parse(JSON.stringify(l[0])); l[0].free.rows[0].v[0] = '99'; l[0].style = 'pie'; l[0].name = 'Habitants (bis)'; return window.LCNDA_EXT.saveCustomWidgetList(l); }), true);
            await p.waitForFunction(() => /99/.test(document.querySelector('#gr-test svg')?.textContent || ''), null, { timeout: 8000 });
            await p.waitForFunction(async () => (await window.LCNDA_EXT.diagramList(true)).some(d => d.name === 'Habitants (bis)' && d.kind === 'pie'), null, { timeout: 8000 });
        });
        await t('la mise en page reçoit le dessin (SVG)', async () => {
            const svg = await p.evaluate(id => window.LCNDA_EXT.diagramSvg(id), did);
            assert.match(svg, /^<svg[^>]+viewBox="0 0 \d+/); assert.match(svg, /Habitants \(bis\)/);
        });
        await t('Listes → « Graphiques et diagrammes » : barre commune, vignettes, filtre, textes piégés affichés tels quels', async () => {
            await p.evaluate(() => { document.getElementById('gr-test')?.remove(); const A = window.LCNDA_APP; A.state.listType = 'graphs_list'; A.setModule('listes'); });
            await p.waitForSelector('[data-gr-item="graph:cw_test1234"]');
            assert.ok(await p.$('.gr-page .ui-listbar .ui-viewtoggle'));
            assert.equal(await p.$$eval('[data-gr-item^="diagram:"]', e => e.length), 0, 'le diagramme qui suit le graphique n’est pas en double');
            await p.waitForFunction(() => document.querySelector('[data-gr-thumb="cw_test1234"] svg'), null, { timeout: 8000 });
            await p.click('.ui-listbar-fbtn'); await p.click('input[data-lb-f="sorte"][value="diagram"]'); await p.click('[data-lb-done]');
            assert.equal(await p.$$eval('[data-gr-item]', e => e.length), 0);
            await p.click('.ui-listbar-chip');
            assert.equal(await p.$$eval('[data-gr-item]', e => e.length), 1);
            assert.equal(await p.evaluate(() => window.__xss), undefined);
        });
        await t('« ✎ Modifier » sur un graphique posé rouvre l’Éditeur de graphiques', async () => {
            await p.evaluate(id => window.LCNDA_EXT.openDiagramEditor(id), did);
            await p.waitForFunction(() => window.LCNDA_APP.state.module === 'maintenance' && document.querySelector('[data-cw-free]'), null, { timeout: 8000 });
            assert.equal(await p.$$eval('[data-fr-ser]', e => e.map(x => x.value).join(',')), '1900,1950');
            assert.ok(await p.$('[data-cw-pose]'));
        });
        await t('le bloc « Diagramme » d’une Fiche propose « 📈 Un de mes graphiques »', async () => {
            await p.evaluate(() => { const d = document.createElement('dialog'); d.id = 'fi-test'; d.innerHTML = '<select name="diagram"><option value="">— choisir —</option></select><p><button type="button" data-fi-dgnew>+ Nouveau diagramme</button></p>'; document.body.appendChild(d); d.show(); });
            await p.click('#fi-test [data-gr-fimine]');
            await pickIn();
            await p.waitForFunction(id => document.querySelector('#fi-test select').value === String(id), did);
            await p.evaluate(() => document.getElementById('fi-test').remove());
        });
        await t('supprimer le graphique retire son diagramme', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'stats_editor'; A.setModule('maintenance'); });
            await p.waitForSelector('[data-cw-del="cw_test1234"]');
            await p.click('[data-cw-del="cw_test1234"]');
            await p.click('dialog[open] .button.danger, dialog[open] [data-ok], dialog[open] button[value="ok"]').catch(async () => { await p.keyboard.press('Enter'); });
            await p.waitForFunction(async () => !(await window.LCNDA_EXT.diagramList(true)).length, null, { timeout: 8000 });
        });
        await t('aucune erreur JavaScript', async () => assert.deepEqual(errors, []));
    } finally { await browser.close(); proc.kill(); }
    process.exit(failed ? 1 : 0);
})();
