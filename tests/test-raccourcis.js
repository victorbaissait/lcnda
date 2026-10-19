'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🔗 Widget « Raccourcis » :
 *     node tests/test-raccourcis.js
 *     (RACCOURCIS_PORT=20030 RACCOURCIS_DIR=… RACCOURCIS_SHOTS=… pour choisir le port, la base et garder des captures)
 * 1. Sans navigateur (heritage-widgets.js + heritage-shortcuts.js dans un bac à sable) : les anciens raccourcis restent,
 *    toutes les cibles sont reconnues, une adresse javascript:/data: ou un texte piégé ne passe jamais, bornes.
 * 2. Serveur (php -S) : shortcut_info (introuvable, titre, nombre d'une liste, cibles forgées ignorées) et les sortes
 *    ajoutées au menu de choix (fiches, Atelier, tableaux, mises en page, diagrammes, cartes, transcriptions).
 * 3. Navigateur (si Playwright est installé), en mode sombre à 390 px : tuiles (introuvable + Retirer + ↶ Annuler),
 *    un clic ouvre la cible, vue d'une liste reprise, éditeur (fenêtre de choix : base, écrans et outils, site web),
 *    « ⭐ Raccourci » d'une liste et d'une fiche, widget dans une Fiche, ancien widget en petits boutons ;
 *    aucun texte piégé exécuté, aucune erreur JavaScript.
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
const fakeDoc = { addEventListener() {}, createElement: () => ({}), readyState: 'complete', getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], body: { classList: { contains: () => false } } };
const sandbox = { window: {}, localStorage: storage, document: fakeDoc, console, setTimeout, clearTimeout, MutationObserver: class { observe() {} }, URL };
sandbox.window.LCNDA_APP = {
    escapeHtml: v => String(v), state: {}, appModules: { dashboard: ['01', 'Tableau de bord'], carte: ['04', 'Carte'] }, defaultListTypes: [['persons', '01', 'Personnes']], defaultMaintenanceTabs: [],
    orderedDashboardWidgetTypes: () => [['stats', '01', 'Chiffres clés']], dashboardWidgetLabel: k => k, syncCustomDashboardWidgets() {}, dashboardBlockSettings: () => ({ widgets: [] }),
    safeUrl: v => (/^(https?:|mailto:|tel:)/i.test(String(v).trim()) ? String(v).trim() : '#'), plural: (n, one, many) => `${n} ${n > 1 ? (many || one + 's') : one}`,
};
vm.createContext(sandbox);
for (const f of ['heritage-widgets.js', 'heritage-shortcuts.js']) vm.runInContext(fs.readFileSync(path.join(appRoot, 'assets/js', f), 'utf8'), sandbox, { filename: f });
const ext = sandbox.window.LCNDA_EXT, SC = ext.shortcuts;
const plain = v => JSON.parse(JSON.stringify(v));

step('anciens raccourcis : gardés tels quels, en petits boutons', () => {
    const d = ext.cleanWidgetDef({ id: 'cw_old12345', name: 'Mes raccourcis', kind: 'links', links: [{ label: 'Carte', target: 'module:carte' }, { label: 'Lieux', target: 'list:places' }, { label: 'Apparence', target: 'maint:design' }, { label: 'Geneanet', target: 'url:https://www.geneanet.org/' }, { label: 'Jean', target: 'person:12' }] });
    assert.deepEqual(d.links.map(l => [l.label, l.target]), [['Carte', 'module:carte'], ['Lieux', 'list:places'], ['Apparence', 'maint:design'], ['Geneanet', 'url:https://www.geneanet.org/'], ['Jean', 'person:12']]);
    assert.equal(d.lLayout, 'buttons'); assert.equal(d.lInfo, true);
    assert.ok(d.links.every(l => /^l_[a-z0-9]{4,24}$/.test(l.id)));
});
step('toutes les cibles reconnues ; les adresses et textes piégés refusés', () => {
    for (const t of ['person:1', 'place:2', 'sheet:3', 'investigation:4', 'battue:5', 'atelier:6', 'board:7', 'layout:8', 'media:9', 'diagram:10', 'artwork:11', 'house:12', 'oldmap:13', 'act:14', 'periodical:15', 'employer:16', 'source:17', 'label:18', 'census:19',
        'mygraph:cw_abcd1234', 'tab:ct_abcd1234', 'tool:retouche', 'action:new_person', 'proj:montage:3', 'head:', 'graph:ancestors', 'stat:surnames', 'mylist:4', 'url:http://exemple.fr/a?b=1'])
        assert.ok(SC.validTarget(t), t);
    for (const t of ['url:javascript:alert(1)', 'url:data:text/html,<script>', 'url:https://x.fr/"onmouseover="alert(1)', 'url:https://x.fr/<img src=x onerror=alert(1)>', 'javascript:alert(1)', 'person:abc', 'person:1;DROP', 'sheet:-1', 'proj:a b:1', 'tool:<b>', 'module:<img>', '', null, 42])
        assert.equal(SC.validTarget(t), false, String(t));
    const d = ext.cleanWidgetDef({ kind: 'links', lLayout: 'grid', lSize: 9999, lCols: 99, links: [{ target: 'url:javascript:alert(1)', label: 'x' }, { target: 'person:1', label: '<img src=x onerror=alert(1)>', icon: '<b>😀', color: 'red;background:url(x)', view: { q: 'a' } }, { target: 'list:persons', view: { q: 'Martin', f: { gender: 'female' }, sort: 'az', view: 'cards' } }, null, 'zz'] });
    assert.equal(d.links.length, 2); assert.equal(d.lSize, 240); assert.equal(d.lCols, 8); assert.equal(d.lLayout, 'grid');
    assert.equal(d.links[0].icon, 'b😀'); assert.equal(d.links[0].color, undefined); assert.equal(d.links[0].view, undefined); // une vue seulement pour une liste
    assert.deepEqual(plain(d.links[1].view), { q: 'Martin', f: { gender: 'female' }, sort: 'az', view: 'cards' });
    assert.equal(ext.cleanWidgetDef({ kind: 'links', links: Array.from({ length: 200 }, (_, i) => ({ target: 'person:' + (i + 1) })) }).links.length, 60);
});
step('affichage : textes échappés, adresse sûre, cible supprimée « introuvable »', () => {
    const d = { lLayout: 'grid', links: [{ id: 'l_aaaa1', target: 'person:1', label: '<img src=x onerror=alert(1)>' }, { id: 'l_aaaa2', target: 'url:https://geneanet.org/', label: 'G' }, { id: 'l_aaaa3', target: 'person:2' }, { id: 'l_aaaa4', target: 'url:javascript:alert(1)', label: 'piège' }, { id: 'l_aaaa5', target: 'head:', label: '<b>Titre</b>' }] };
    const h = SC.html(d, { sc: true, items: { 'person:1': { ok: true, title: 'Jean', short: '1850 – 1920', thumb: 'javascript:alert(1)' }, 'person:2': { ok: false } } });
    assert.ok(!/<img src=x/.test(h) && h.includes('&lt;img src=x onerror=alert(1)&gt;'));
    assert.ok(!/javascript:/i.test(h), 'aucune adresse javascript: dans la page');
    assert.ok(h.includes('href="https://geneanet.org/"') && h.includes('rel="noopener noreferrer"'));
    assert.ok(h.includes('1850 – 1920') && /is-missing[\s\S]*introuvable/.test(h) && h.includes('&lt;b&gt;Titre&lt;/b&gt;'));
    assert.equal(SC.safeThumb('media/photo%20a.jpg'), 'media/photo%20a.jpg'); assert.equal(SC.safeThumb("media/a.jpg' onerror='x"), ''); assert.equal(SC.safeThumb('https://x/y.png'), '');
});

/* ── 2 et 3 : serveur et navigateur ── */
let chromium = null;
try { ({ chromium } = require('playwright')); } catch (_) { try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); } catch (__) { chromium = null; } }
const phpPath = findPhp([devBundledPhp()]);
const tmp = process.env.RACCOURCIS_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-raccourcis-'));
const shots = process.env.RACCOURCIS_SHOTS || '';
const envFor = d => ({ ...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1' });
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });

(async () => {
    for (const [name, fn] of steps) { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } }
    if (!phpPath) { console.log('— serveur : PHP absent, partie sautée'); process.exit(failed ? 1 : 0); }
    fs.rmSync(path.join(tmp, 'genealogy.sqlite'), { force: true });
    fs.mkdirSync(path.join(tmp, 'media'), { recursive: true });
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p->exec("INSERT INTO persons(first_name,last_name,gender) VALUES('Joseph','Martin','male'),('Marie','Durand','female'),('<img src=x onerror=window.__xss=1>','Piège','unknown')"); $p = null;
require 'lib/bootstrap.php'; $pdo = db(); act_transcriptions_ensure($pdo); diagrams_ensure($pdo); $pdo->exec('PRAGMA foreign_keys=OFF');
foreach (["INSERT INTO places(name,county,country) VALUES('Rennes','Ille-et-Vilaine','France')",
    "INSERT INTO topic_sheets(title,subtitle,icon) VALUES('La Pologne <script>window.__xss=2</script>','Avant les guerres','📒')",
    "INSERT INTO topic_sheets(title,data_json) VALUES('Un modèle','{\"template\":true}')",
    "INSERT INTO investigations(title,status,person_id) VALUES('Qui était Jean ?','open',1)", "INSERT INTO battues(title,status,start_insee_code) VALUES('Les Martin du Gers','open','32013')",
    "INSERT INTO atelier_projects(title,kind) VALUES('Ma thèse','these')", "INSERT INTO boards(title) VALUES('Tableau de la famille')",
    "INSERT INTO layout_documents(name,data_json) VALUES('Livre des Martin','{\"pages\":[{},{}]}')", "INSERT INTO diagrams(name,kind) VALUES('Hémicycle des cousins','hemicycle')",
    "INSERT INTO old_maps(title,year_text) VALUES('Cassini Rennes','1760')", "INSERT INTO act_transcriptions(title,date_text,place) VALUES('Baptême de Joseph','1850','Rennes')",
    "INSERT INTO labels(name,color) VALUES('À vérifier','#cc4700')"] as $sql) { try { $pdo->exec($sql); } catch (Throwable $e) { fwrite(STDERR, $sql . ' : ' . $e->getMessage() . "\n"); } }
echo 'ok';`], { cwd: appRoot, encoding: 'utf8', env: envFor(tmp) });
    if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exit(1); }
    const port = Number(process.env.RACCOURCIS_PORT) || await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env: envFor(tmp), stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
    const t = async (name, fn) => { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
    const get = async q => (await fetch(base + 'api.php?' + q)).json();
    try {
        await t('serveur : état des tuiles (introuvable, titre, nombre d’une liste, cibles forgées ignorées)', async () => {
            const targets = ['list:persons', 'list:topic_sheets_list', 'list:zzz', 'person:1', 'person:999', 'sheet:1', 'sheet:2', 'place:1', 'atelier:1', 'board:1', 'layout:1', 'diagram:1', 'oldmap:1', 'act:1', 'investigation:1', 'battue:1', 'label:1', 'source:1',
                "person:1' OR 1=1--", 'list:../../etc', 'graph:1', 'zzz:1'];
            const j = await get('action=shortcut_info&targets=' + encodeURIComponent(targets.join(',')));
            const it = j.items;
            assert.equal(it['list:persons'].count, 3); assert.equal(it['list:topic_sheets_list'].count, 1); assert.equal(it['list:zzz'].count, undefined);
            assert.equal(it['person:1'].title, 'Joseph MARTIN'); assert.equal(it['person:999'].ok, false); assert.equal(it['source:1'].ok, false);
            assert.equal(it['sheet:1'].title, 'La Pologne <script>window.__xss=2</script>'); assert.equal(it['sheet:2'].ok, false, 'un modèle de fiche n’est pas une fiche');
            for (const k of ['place:1', 'atelier:1', 'board:1', 'layout:1', 'diagram:1', 'oldmap:1', 'act:1', 'investigation:1', 'battue:1', 'label:1']) assert.equal(it[k].ok, true, k);
            assert.equal(it['layout:1'].short, '2 pages'); assert.equal(it['place:1'].county, 'Ille-et-Vilaine');
            assert.deepEqual(Object.keys(it).filter(k => /'|\.\.|^graph|^zzz/.test(k)), []);
        });
        await t('serveur : nouvelles sortes dans le menu de choix (recherche mélangée)', async () => {
            const j = await get('action=picker_search&kind=sheet,atelier,board,layout,diagram,oldmap,act&q=' + encodeURIComponent('e'));
            const n = Object.fromEntries(j.groups.map(g => [g.kind, g.total]));
            assert.deepEqual(n, { sheet: 1, atelier: 1, board: 1, layout: 1, diagram: 1, oldmap: 1, act: 1 });
            const one = await get('action=picker_search&kind=act&q=bapteme');
            assert.equal(one.groups[0].items[0].title, 'Baptême de Joseph');
            const re = await get('action=picker_search&kind=layout&ids=1');
            assert.equal(re.groups[0].items[0].id, 1);
        });
        if (!chromium) { console.log('— navigateur : Playwright absent, partie sautée'); return; }
        const browser = await chromium.launch();
        const errors = [];
        try {
            const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
            await ctx.addInitScript(() => { try { localStorage.setItem('genealogie-design', JSON.stringify({ preset: 'dark' })); } catch (_) {} });
            const p = await ctx.newPage();
            p.on('pageerror', e => errors.push(e.message));
            p.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(m.text()); });
            p.on('dialog', d => { errors.push('dialogue : ' + d.message()); d.dismiss(); });
            await p.goto(base);
            await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.shortcuts && window.LCNDA_EXT?.saveCustomWidgetList && window.LCNDA_EXT?.editToolsList, null, { timeout: 30000 });
            const shot = async (name, el) => { if (!shots) return; fs.mkdirSync(shots, { recursive: true }); if (el) { await el.evaluate(e => { const top = e.getBoundingClientRect().top + scrollY - 190; scrollTo(0, Math.max(0, top)); }); await p.waitForTimeout(150); } await p.screenshot({ path: path.join(shots, name) }); };
            const WID = 'cw_rac0001';
            await t('tableau de bord : tuiles, infos en direct, introuvable, textes piégés', async () => {
                await p.evaluate(async id => {
                    const E = window.LCNDA_EXT, A = window.LCNDA_APP;
                    const d = E.cleanWidgetDef({ id, name: 'Mes raccourcis', icon: '🔗', kind: 'links', width: '12', lLayout: 'grid', lSize: 104, links: [
                        { target: 'head:', label: 'Ma famille' }, { target: 'person:1' }, { target: 'person:3' }, { target: 'list:persons' }, { target: 'sheet:1', color: '#cc4700' }, { target: 'person:999', label: 'Cousin effacé' },
                        { target: 'head:', label: 'Outils <img src=x onerror=window.__xss=3>' }, { target: 'tool:retouche' }, { target: 'action:new_person' }, { target: 'url:https://www.geneanet.org/', label: 'Geneanet' },
                        { target: 'module:carte' }, { target: 'layout:1' }, { target: 'atelier:1' }, { target: 'list:places', view: { q: 'Rennes' } }] });
                    // une définition forgée (sans passer par le nettoyage) : l'adresse javascript: ne doit pas devenir un lien
                    d.links.push({ id: 'l_piege01', target: 'url:javascript:window.__xss=4', label: 'Piège JS' });
                    await E.saveCustomWidgetList([...E.customWidgetList().filter(x => x.id !== id), d, { id: 'cw_old00001', name: 'Anciens', icon: '🔗', kind: 'links', width: '6', links: [{ label: 'Carte', target: 'module:carte' }, { label: 'Geneanet', target: 'url:https://www.geneanet.org/' }] }]);
                    A.syncCustomDashboardWidgets(); const s = A.dashboardBlockSettings();
                    [id, 'cw_old00001'].forEach(w => { if (!s.widgets.some(x => x.type === w)) s.widgets.unshift(A.dashboardNewWidget(w, { width: '12' })); });
                    A.saveDashboardBlockSettings(s); await A.setModule('dashboard');
                }, WID);
                await p.waitForSelector('.h-sc-grid .h-sc-tile', { timeout: 15000 });
                await p.waitForFunction(() => [...document.querySelectorAll('.h-sc-grid .h-sc-tile small')].some(s => /élément/.test(s.textContent)), null, { timeout: 10000 });
                const tiles = await p.$$eval('.h-sc-grid .h-sc-tile', e => e.map(x => `${x.querySelector('b')?.textContent}|${x.querySelector('small')?.textContent || ''}`));
                assert.ok(tiles.includes('Joseph MARTIN|') && tiles.includes('Personnes|3 éléments') && tiles.includes('Cousin effacé|introuvable') && tiles.includes('Livre des Martin|2 pages'), tiles.join(' ; '));
                assert.ok(tiles.includes('Lieux|vue enregistrée · « Rennes »'), tiles.join(' ; '));
                assert.ok(!tiles.some(x => x.startsWith('Piège JS')), 'une adresse javascript: forgée n’est pas montrée');
                assert.equal(await p.$$eval('a[href^="javascript"], [href*="javascript:"]', e => e.length), 0);
                assert.equal(await p.$eval('.h-sc-grid .h-sc-tile a, .h-sc-grid a.h-sc-tile', a => a.getAttribute('rel')), 'noopener noreferrer');
                assert.equal(await p.$$eval('.h-sc-buttons .h-sc-tile', e => e.length), 2, 'ancien widget : petits boutons');
                assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'pas de défilement de côté à 390 px');
                await shot('01-tuiles-sombre-390.png', await p.$('.h-sc-grid'));
            });
            await t('« Retirer » une tuile introuvable, puis ↶ Annuler', async () => {
                await p.click('.h-sc-tile.is-missing [data-sc-remove]');
                await p.waitForFunction(id => !window.LCNDA_EXT.customWidgetList().find(d => d.id === id).links.some(l => l.target === 'person:999'), WID);
                await p.click('text=↶ Annuler');
                await p.waitForFunction(id => window.LCNDA_EXT.customWidgetList().find(d => d.id === id).links.some(l => l.target === 'person:999'), WID);
            });
            await t('un clic ouvre la cible au bon endroit (personne, liste avec sa vue, Atelier)', async () => {
                await p.click('.h-sc-grid [data-sc-go="person:1"]');
                await p.waitForFunction(() => window.LCNDA_APP.state.module === 'personnes' && Number(window.LCNDA_APP.state.currentPersonId) === 1);
                await p.evaluate(() => window.LCNDA_APP.setModule('dashboard'));
                await p.waitForSelector('.h-sc-grid [data-sc-go="list:places"]');
                await p.click('.h-sc-grid [data-sc-go="list:places"]');
                await p.waitForFunction(() => window.LCNDA_APP.state.module === 'listes' && window.LCNDA_APP.state.listType === 'places');
                assert.equal(await p.evaluate(() => JSON.parse(localStorage.getItem('lcnda-listbar:listes:places')).q), 'Rennes');
                await p.evaluate(() => window.LCNDA_EXT.shortcuts.openTarget('atelier:1'));
                await p.waitForFunction(() => window.LCNDA_APP.state.module === 'enquetes' && window.LCNDA_APP.state.enquetesTab === 'atelier' && window.LCNDA_APP.state.atelier.project === 1);
                await p.evaluate(() => window.LCNDA_EXT.shortcuts.openTarget('sheet:1'));
                await p.waitForFunction(() => window.LCNDA_APP.state.module === 'fiches');
            });
            await t('éditeur : fenêtre de choix (base, écrans et outils, site web), ranger, retirer', async () => {
                await p.evaluate(async () => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'widget_editor'; await A.setModule('maintenance'); });
                await p.click(`[data-cw-edit="${WID}"]`);
                await p.waitForSelector('[data-sc-ed] [data-sc-row]');
                await p.waitForFunction(() => [...document.querySelectorAll('[data-sc-row] .h-sc-rowmain small')].some(s => /Joseph MARTIN/.test(s.textContent)));
                assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'éditeur sans défilement de côté');
                await shot('02-editeur-390.png', await p.$('[data-sc-ed]'));
                const before = await p.$$eval('[data-sc-row]', e => e.length);
                await p.click('[data-sc-add]');
                await p.fill('.h-sc-dlg [data-sc-pane="base"] .pk-input', 'ma');
                await p.waitForSelector('.h-sc-dlg .pk-filt button', { timeout: 8000 });
                const filters = await p.$$eval('.h-sc-dlg .pk-filt button', e => e.map(x => x.textContent));
                assert.ok(filters[0].startsWith('Tout (') && filters.some(f => /Personnes \(2\)/.test(f)) && filters.some(f => /Mises en page/.test(f)), filters.join(' ; '));
                await shot('03-choix-base-390.png');
                await p.click('.h-sc-dlg .pk-row');
                await p.click('.h-sc-dlg [data-sc-tab="screens"]');
                await p.fill('.h-sc-dlg [data-sc-qslot] input', 'sauvegarde');
                await p.waitForFunction(() => /sauvegarde/i.test(document.querySelector('.h-sc-dlg .h-sc-catrow')?.textContent || '')); // la recherche attend 120 ms après la frappe
                await shot('04-choix-ecrans-390.png');
                await p.click('.h-sc-dlg .h-sc-catrow');
                await p.click('.h-sc-dlg [data-sc-tab="web"]');
                await p.fill('.h-sc-dlg [data-sc-url]', 'javascript:window.__xss=5');
                await p.click('.h-sc-dlg [data-sc-urladd]');
                assert.match(await p.textContent('.h-sc-dlg [data-sc-urlmsg]'), /https:\/\//);
                await p.fill('.h-sc-dlg [data-sc-url]', 'archives.gers.fr');
                await p.fill('.h-sc-dlg [data-sc-urlname]', 'AD du Gers <b>');
                await p.click('.h-sc-dlg [data-sc-urladd]');
                await shot('05-choix-site-390.png');
                assert.match(await p.textContent('.h-sc-dlg [data-sc-count]'), /^3 raccourcis choisis/);
                await p.click('.h-sc-dlg [type=submit]');
                await p.waitForFunction(n => document.querySelectorAll('[data-sc-row]').length === n + 3, before);
                // ↑ : la dernière ligne monte ; ✕ : retirée, ↶ Annuler la remet
                const last = await p.$$eval('[data-sc-row] .h-sc-rowmain small', e => e[e.length - 1].textContent);
                assert.match(last, /archives\.gers\.fr/);
                await p.click('[data-sc-row]:last-child [data-sc-up]');
                assert.match(await p.$$eval('[data-sc-row] .h-sc-rowmain small', e => e[e.length - 2].textContent), /archives\.gers\.fr/);
                await p.click('[data-sc-row]:last-child [data-sc-del]');
                await p.waitForFunction(n => document.querySelectorAll('[data-sc-row]').length === n + 2, before);
                await p.click('text=↶ Annuler');
                await p.waitForFunction(n => document.querySelectorAll('[data-sc-row]').length === n + 3, before);
                await p.selectOption('[data-sc-opt="lLayout"]', 'list');
                await p.click('[data-cw-save]');
                await p.waitForFunction(id => { const d = window.LCNDA_EXT.customWidgetList().find(x => x.id === id); return d.lLayout === 'list' && d.links.some(l => l.target === 'url:https://archives.gers.fr' && l.label === 'AD du Gers <b>') && d.links.some(l => l.target === 'action:backup_now'); }, WID);
            });
            await t('« ⭐ Raccourci » : une liste avec ses filtres, puis une fiche dans un nouveau widget', async () => {
                await p.evaluate(() => { localStorage.setItem('lcnda-listbar:listes:persons', JSON.stringify({ q: 'Martin', f: {}, sort: '', view: 'list' })); const A = window.LCNDA_APP; A.state.listType = 'persons'; return A.setModule('listes'); });
                await p.waitForSelector('#workspace .page-header [data-sc-star]', { timeout: 10000 });
                await p.click('#workspace .page-header [data-sc-star]');
                await p.waitForSelector('.h-sc-dlg [name=sc_where]');
                await shot('06-etoile-liste-390.png');
                await p.click('.h-sc-dlg [type=submit]');
                await p.waitForFunction(id => window.LCNDA_EXT.customWidgetList().find(x => x.id === id).links.some(l => l.target === 'list:persons' && l.view?.q === 'Martin'), WID);
                await p.evaluate(() => window.LCNDA_APP.openPersonById(2));
                await p.waitForSelector('.person-hero-actions [data-sc-star]', { timeout: 10000 });
                await p.click('.person-hero-actions [data-sc-star]');
                await p.waitForSelector('.h-sc-dlg [name=sc_where][value=new]');
                await p.check('.h-sc-dlg [name=sc_where][value=new]');
                await p.fill('.h-sc-dlg [name=sc_newname]', 'Ma branche');
                await p.click('.h-sc-dlg [type=submit]');
                await p.waitForFunction(() => window.LCNDA_EXT.customWidgetList().some(d => d.name === 'Ma branche' && d.links[0]?.target === 'person:2'));
                await p.waitForFunction(() => { const d = window.LCNDA_EXT.customWidgetList().find(x => x.name === 'Ma branche'); return window.LCNDA_APP.dashboardBlockSettings().widgets.some(w => w.type === d.id); }, null, { timeout: 8000 }); // posé sur le tableau de bord
            });
            await t('dans une Fiche (bloc « widget ») et en disposition liste', async () => {
                await p.evaluate(async id => { const box = document.createElement('div'); box.id = 'sc-test'; document.querySelector('#workspace').prepend(box); await window.LCNDA_EXT.renderCustomWidgetInto(box, id); }, WID);
                await p.waitForSelector('#sc-test .h-sc-list .h-sc-tile');
                assert.ok(await p.$$eval('#sc-test .h-sc-tile', e => e.length) > 10);
                await shot('07-liste-dans-une-fiche-390.png', await p.$('#sc-test'));
            });
            await t('cibles forgées : « module:constructor », vue de liste énorme, mode consultation', async () => {
                // un nom d'écran qui est une propriété de tout objet JavaScript ne casse pas l'app
                await p.evaluate(async () => { await window.LCNDA_APP.setModule('dashboard'); await window.LCNDA_EXT.shortcuts.openTarget('module:constructor'); await window.LCNDA_EXT.shortcuts.openTarget('module:__proto__'); });
                assert.equal(await p.evaluate(() => window.LCNDA_APP.state.module), 'dashboard');
                await p.evaluate(() => window.LCNDA_APP.setModule('constructor'));
                assert.equal(await p.evaluate(() => window.LCNDA_APP.state.module), 'personnes', 'setModule refuse « constructor »');
                // une vue de liste forgée dans la base (sans nettoyage) : bornée avant d'aller dans la barre de la liste
                await p.evaluate(async id => { const E = window.LCNDA_EXT, list = JSON.parse(JSON.stringify(E.customWidgetList())), d = list.find(x => x.id === id);
                    d.links.push({id: 'l_vuefor1', target: 'list:events', view: {q: 'x'.repeat(5000), f: {big: 'y'.repeat(9000)}, sort: 'z'.repeat(300), view: '<b>'}}); await E.saveCustomWidgetList(list);
                    await E.shortcuts.openTarget('list:events', E.customWidgetList().find(x => x.id === id).links.find(l => l.id === 'l_vuefor1') || d.links[d.links.length - 1]); }, WID);
                const vw = await p.evaluate(() => JSON.parse(localStorage.getItem('lcnda-listbar:listes:events') || 'null'));
                assert.ok(vw && vw.q.length <= 200 && vw.sort.length <= 40 && vw.view === 'list' && !vw.f.big, JSON.stringify(vw).slice(0, 200));
                // 60 raccourcis au plus : « ＋ Intertitre » aussi
                await p.evaluate(async id => { const E = window.LCNDA_EXT, list = JSON.parse(JSON.stringify(E.customWidgetList())), d = list.find(x => x.id === id);
                    d.links = Array.from({length: 60}, (_, i) => ({id: 'l_max' + String(i).padStart(3, '0'), target: 'head:', label: 'T' + i})); await E.saveCustomWidgetList(list);
                    const A = window.LCNDA_APP; A.state.maintenanceTab = 'widget_editor'; await A.setModule('maintenance'); }, WID);
                await p.click(`[data-cw-edit="${WID}"]`);
                await p.waitForSelector('[data-sc-ed] [data-sc-addhead]');
                assert.equal(await p.$eval('[data-sc-ed] [data-sc-addhead]', b => b.disabled), true, '« ＋ Intertitre » désactivé à 60');
                assert.equal(await p.$eval('[data-sc-ed] [data-sc-add]', b => b.disabled), true);
                // mode consultation : pas de « ⭐ Raccourci » sur une fiche, et rien ne s'enregistre
                const n0 = await p.evaluate(() => window.LCNDA_EXT.customWidgetList().length);
                await p.evaluate(async () => { document.body.classList.add('is-kiosk'); await window.LCNDA_APP.openPersonById(1); });
                await p.waitForSelector('#workspace .person-hero-actions', { timeout: 10000 });
                await p.waitForTimeout(300);
                assert.equal(await p.$$eval('.person-hero-actions [data-sc-star]', e => e.length), 0, 'pas d’étoile en consultation');
                await p.evaluate(() => window.LCNDA_EXT.shortcuts.addToShortcuts({target: 'person:1', name: 'x'}));
                assert.equal(await p.$$eval('dialog[open].h-sc-dlg', e => e.length), 0, 'pas de fenêtre en consultation');
                assert.equal(await p.evaluate(() => window.LCNDA_EXT.customWidgetList().length), n0);
                await p.evaluate(() => document.body.classList.remove('is-kiosk'));
            });
            await t('aucun texte piégé exécuté, aucune erreur JavaScript', async () => {
                assert.equal(await p.evaluate(() => window.__xss), undefined);
                assert.deepEqual(errors, []);
            });
        } finally { await browser.close(); }
    } finally { proc.kill(); }
    process.exit(failed ? 1 : 0);
})();
