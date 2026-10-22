'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * Cinq demandes revérifiées comme l'utilisateur le ferait :   node tests/test-verif-demandes.js
 *   (VD_SHOTS=dossier pour garder des captures)
 * 1. 🔎 Types de recherche : rangés et cachés dans Maintenance → Apparence (trouvés par « Chercher un réglage… » :
 *    « types de recherche », « préférences »), l'ordre suivi par le menu de Recherche après rechargement, clés dans
 *    les 💾 Réglages enregistrés et le défaut du site.
 * 2. 🗺️ Fonds de cartes : l'ordre changé à la souris (catégorie et fond) suit dans « Fonds de carte en boutons »,
 *    « Fonds de carte du plan des adresses », le menu de la Carte et sortTileKeys (boutons, plan des adresses).
 * 3. ⭐ Mes raccourcis : onglet « ＋ Créer… » dans « Ajouter des raccourcis » ; chaque outil de modification a son
 *    « Nouveau … » et l'ouvre sur une nouvelle chose.
 * 4. 📐 Formats : format libre de la nouvelle carte ; dessin → Format du document avec fond perdu (gardé) ;
 *    mise en page → Informations avec la description ; retouche → Taille de l'image, zone de travail, Informations.
 * 5. 📊 Diagrammes : CHAQUE type a « Graphique » avec au moins deux choix dans « Depuis l'app » ; un point de départ
 *    règle le panneau ; les nouvelles données (nuage, flux, organigramme, frises, chiffres, objectif) se remplissent.
 * Navigateur à 1440 px et à 390 px en mode sombre ; aucune erreur JavaScript.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const vm = require('node:vm');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const appRoot = path.resolve(__dirname, '..');
const src = f => fs.readFileSync(path.join(appRoot, f), 'utf8');
let failed = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
const RK = ['genealogie-research-kind-order', 'genealogie-research-kind-hidden'];
const STATS_KINDS = ['columns', 'bars', 'stacked', 'stacked100', 'line', 'area', 'pie', 'donut', 'halfdonut', 'waffle', 'treemap', 'funnel', 'radar', 'pyramid', 'heatmap', 'parliament', 'wordcloud', 'pictogram', 'gauge', 'bump', 'stream', 'smallmult', 'marimekko', 'dumbbell', 'slope']; // heritage-diagrams.js : TABLE_KINDS et STAT_KINDS

(async () => {
    /* ── Sans serveur ── */
    await t('1. clés des types de recherche : défaut du site (page, serveur) et 💾 Réglages enregistrés', () => {
        const page = src('assets/js/app.js').match(/const SITE_DEFAULT_KEYS = \[([\s\S]*?)\];/)[1];
        const server = src('api.php').match(/function site_defaults_allowed_keys\(\): array\s*\{[^\[]*return \[([\s\S]*?)\];/)[1];
        const layout = src('assets/js/heritage-studio.js').match(/const LAYOUT_KEYS = \[([\s\S]*?)\];/)[1];
        for (const k of RK) { assert.ok(page.includes(`'${k}'`), k); assert.ok(server.includes(`'${k}'`), k); assert.ok(layout.includes(`'${k}'`), k); }
        assert.match(src('assets/js/app-maintenance.js'), /keywords: MAINT_KEYWORDS/);
        assert.match(src('assets/js/app-sidegroups.js'), /cfg\.keywords\?\.\[b\.dataset\.sideValue\]/);
    });
    await t('4. formats : fond perdu du dessin, description de la mise en page, menus de la retouche', () => {
        const v = src('assets/js/heritage-vector.js'), l = src('assets/js/heritage-layout.js'), s = src('assets/js/heritage-studio.js');
        assert.match(v, /name="vx_bleed"/); assert.match(v, /out\.bleed = /); assert.doesNotMatch(v, /const BLEED = 3 \* MM/);
        assert.match(l, /keys: \['title', 'author', 'subject', 'desc', 'keywords', 'lang', 'isbn'\]/); assert.match(l, /INF\.desc \|\| INF\.subject/);
        for (const k of ["'imgsize', '📏 Taille de l’image…'", "'canvassize', '⬚ Taille de la zone de travail…'", "'info', 'ℹ️ Informations…'"]) assert.ok(s.includes(k), k);
        assert.match(src('assets/js/heritage-vector-map.js'), /F\.boxHtml\(\{value: start, units: \['mm', 'cm', 'px', 'in'\], dpi: true/);
    });
    await t('5. diagrammes (bac à sable) : chaque type a « Graphique » avec au moins deux choix', () => {
        const sandbox = { window: {}, console, setTimeout, clearTimeout, performance, Intl, MutationObserver: class { observe() {} }, CSS: { escape: s => s }, document: { documentElement: {}, querySelectorAll: () => [], addEventListener() {}, createElement: () => ({}) } };
        sandbox.window.LCNDA_APP = { state: { bootstrap: { startPersonId: 1 } } };
        vm.createContext(sandbox);
        for (const f of ['heritage-diagrams-render.js', 'heritage-diagram-genea.js', 'heritage-diagram-chiffres.js', 'heritage-diagram-cartes.js', 'heritage-diagram-more.js', 'heritage-diagram-famille.js', 'heritage-diagram-vie.js', 'heritage-diagram-adn-chiffres.js', 'heritage-diagram-cartes2.js', 'heritage-diagram-options.js', 'heritage-diagram-graphique.js'])
            vm.runInContext(src('assets/js/' + f), sandbox, { filename: f });
        const ext = sandbox.window.LCNDA_EXT, R = ext.diagramRender, G = ext.diagramGraphique;
        assert.ok(Object.keys(R.KINDS).length >= 90);
        for (const [k, kind] of Object.entries(R.KINDS)) {
            const n = (STATS_KINDS.includes(k) || kind.pairs ? 2 : 0) + (kind.app?.sources?.length || 0) + (G.PANELS[k]?.length || 0);
            assert.ok(n >= 2, `${k} : ${n} choix`);
            if (kind.fromApp) assert.ok(G.PANELS[k]?.length >= 2, `${k} : panneau sans « Graphique »`);
        }
        for (const k of ['scatter', 'sankey', 'orgchart', 'timeline', 'chrono']) assert.ok(R.KINDS[k].app?.sources?.length >= 3, k);
        for (const k of ['kpi', 'bullet']) assert.ok(R.KINDS[k].app.sources.length >= 3, k + ' : ses sources et les nouvelles');
        assert.match(src('index.php'), /heritage-diagram-graphique\.js\?v=\d+/);
    });

    /* ── Serveur et navigateur ── */
    let chromium = null;
    for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { ({ chromium } = require(p)); break; } catch (_) { chromium = null; } }
    const php = spawnSync('php', ['-v'], { encoding: 'utf8' }).status === 0 ? 'php' : null;
    if (!chromium || !php) { console.log('— serveur et navigateur : Playwright ou PHP absent, partie sautée'); process.exit(failed ? 1 : 0); }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-vd-')), dir = path.join(tmp, 'a'), SHOTS = process.env.VD_SHOTS || '';
    const envFor = d => ({ ...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1' });
    fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
    const r0 = spawnSync(php, ['-r', 'require "lib/paths.php"; (new PDO("sqlite:".DATA_DIR."/genealogy.sqlite"))->exec(file_get_contents(APP_ROOT."/data/schema.sql")); require "lib/bootstrap.php"; db();'], { cwd: appRoot, encoding: 'utf8', env: envFor(dir) });
    if (r0.status !== 0) { console.error(r0.stderr || r0.stdout); process.exit(1); }
    const r1 = spawnSync(php, [path.join(appRoot, 'tests/fixtures/diagram-vie-seed.php')], { cwd: appRoot, encoding: 'utf8', env: envFor(dir) });
    if (r1.status !== 0 || !/^ok vie/m.test(r1.stdout || '')) { console.error(r1.stderr || r1.stdout); process.exit(1); }
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const q = s.address().port; s.close(() => res(q)); }); });
    const proc = spawn(php, ['-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env: envFor(dir), stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
    const browser = await chromium.launch();
    try {
        for (const [width, height, dark] of [[1440, 900, false], [390, 844, true]]) {
            const tag = `${width}${dark ? '-sombre' : ''}`, errors = [];
            const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: dark ? 'dark' : 'light' });
            if (dark) await ctx.addInitScript(() => { try { if (!localStorage.getItem('genealogie-design')) localStorage.setItem('genealogie-design', JSON.stringify({ preset: 'dark' })); } catch (_) {} });
            const p = await ctx.newPage();
            p.on('pageerror', e => errors.push(e.message));
            p.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource|tile|tuile/i.test(m.text())) errors.push(m.text()); });
            const shot = async name => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: path.join(SHOTS, `${name}-${tag}.png`) }); };
            const closeAll = () => p.evaluate(() => document.querySelectorAll('dialog').forEach(d => { try { d.close(); d.remove(); } catch (_) {} })).catch(() => {});
            const ready = async () => { await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.researchKinds && window.LCNDA_EXT?.shortcuts && window.LCNDA_EXT?.diagramGraphique && window.LCNDA_EXT?.openDiagramEditor, null, { timeout: 30000 }); await p.waitForTimeout(500); };
            await p.goto(base); await ready();
            const maint = async tab => { await p.evaluate(async tab => { window.LCNDA_APP.state.maintenanceTab = tab; await window.LCNDA_APP.setModule('maintenance'); }, tab); };

            /* 1 */
            await t(`[${tag}] 1. « Chercher un réglage… » mène à Apparence → « 🔎 Types de recherche »`, async () => {
                await maint('design'); await p.waitForSelector('#research-kinds-config [data-rk-list] li', { timeout: 20000 });
                for (const q of ['types de recherche', 'préférences']) {
                    await p.evaluate(q => { const i = document.querySelector('[data-mt-search]'); i.value = q; i.dispatchEvent(new Event('input', { bubbles: true })); }, q);
                    const shown = await p.$$eval('[data-side-value]', b => b.filter(x => !x.hidden && !x.closest('[hidden]')).map(x => x.dataset.sideValue));
                    assert.ok(shown.includes('design'), `${q} → ${shown}`);
                }
                await p.evaluate(() => { const i = document.querySelector('[data-mt-search]'); i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); });
            });
            await t(`[${tag}] 1. l’ordre et les types cachés réglés dans Apparence suivent dans Recherche après rechargement`, async () => {
                const up = async i => { const row = `#research-kinds-config [data-index="${i}"]`; await p.waitForSelector(`${row} .order-grip[data-grip-done]`, { timeout: 3000 }).catch(() => {}); await p.focus(`${row} .order-grip`); await p.keyboard.press('Alt+ArrowUp'); await p.waitForTimeout(200); };
                await up(2); await up(1);
                await p.click('#research-kinds-config [data-rk="web"] [data-eye]');
                await p.reload(); await ready();
                await p.evaluate(async () => { window.LCNDA_APP.state.researchKind = 'question'; await window.LCNDA_APP.setModule('recherche'); });
                await p.waitForSelector('#research-form');
                const menu = await p.$$eval('#research-form [name=search_kind] option', o => o.map(x => x.value));
                assert.deepEqual(menu.slice(0, 3), ['text', 'question', 'gaps']); assert.ok(!menu.includes('web'));
                await shot('1-recherche');
                await p.evaluate(k => k.forEach(x => localStorage.removeItem(x)), RK);
            });

            /* 2 */
            await t(`[${tag}] 2. ordre des « Fonds de cartes » changé à la souris : boutons, plan des adresses, Carte`, async () => {
                await maint('design_maps'); await p.waitForSelector('#tile-cat-order .tile-cat-block'); await p.waitForTimeout(800);
                const drag = async (from, to) => { await p.locator(from).first().scrollIntoViewIfNeeded(); const g = await p.locator(from).first().boundingBox(); await p.locator(to).first().scrollIntoViewIfNeeded(); const g2 = await p.locator(from).first().boundingBox(), t2 = await p.locator(to).first().boundingBox();
                    await p.mouse.move(g2.x + g2.width / 2, g2.y + g2.height / 2); await p.mouse.down(); await p.mouse.move(g2.x + 4, g2.y - 10, { steps: 4 }); await p.mouse.move(t2.x + 20, t2.y + 3, { steps: 15 }); await p.mouse.up(); await p.waitForTimeout(400); void g; };
                await drag('[data-tile-cat="usgs"] .tile-cat-grip', '[data-tile-cat="nls_gb"] .tile-cat-header');
                await drag('[data-order-key="etatmajor"] .order-grip', '[data-order-key="ohm"]');
                await p.waitForFunction(() => /"usgs","nls_gb"/.test(localStorage.getItem('genealogie-tile-cat-order') || '') && (JSON.parse(localStorage.getItem('genealogie-tile-items-historical') || '[]')[0] === 'etatmajor'), null, { timeout: 8000 });
                const cats = await p.$$eval('#tile-cat-order .tile-cat-block', b => b.map(x => x.dataset.tileCat));
                assert.ok(cats.indexOf('usgs') < cats.indexOf('nls_gb'), cats.join());
                for (const box of ['#h-village-maps-config', '#h-addrmap-config']) {
                    const sums = await p.$$eval(`${box} details summary`, s => s.map(x => x.textContent.trim()));
                    assert.ok(sums.findIndex(x => /États-Unis/.test(x)) < sums.findIndex(x => /Grande-Bretagne/.test(x)), `${box} : ${sums}`);
                    const hist = await p.$eval(`${box} details:nth-of-type(2), ${box} details`, () => null).catch(() => null); void hist;
                    const first = await p.evaluate(b => [...document.querySelectorAll(`${b} details`)].find(d => /historiques/i.test(d.querySelector('summary').textContent))?.querySelector('input')?.[b === '#h-village-maps-config' ? 'dataset' : 'value'], box);
                    assert.equal(typeof first === 'string' ? first : first?.hVmap, 'etatmajor', box);
                }
                assert.deepEqual(await p.evaluate(() => window.LCNDA_APP.sortTileKeys(['cassini', 'osmfr', 'etatmajor', 'usgs_topo', 'nls_1inch'])).then(a => a.indexOf('etatmajor') < a.indexOf('cassini') && a.indexOf('usgs_topo') < a.indexOf('nls_1inch')), true);
                await p.$eval('#h-village-maps-config', e => e.scrollIntoView()); await shot('2-fonds-boutons');
                await p.evaluate(async () => { await window.LCNDA_APP.setModule('carte'); });
                await p.waitForSelector('#map-background');
                const groups = await p.$$eval('#map-background optgroup', g => g.map(x => x.label));
                assert.ok(groups.findIndex(x => /États-Unis/.test(x)) < groups.findIndex(x => /Grande-Bretagne/.test(x)), groups.join());
            });

            /* 3 */
            await t(`[${tag}] 3. « Ajouter des raccourcis » → onglet « ＋ Créer… » : un « Nouveau … » par outil, chacun s’ouvre`, async () => {
                await p.evaluate(async () => { await window.LCNDA_APP.setModule('dashboard'); });
                const tools = await p.evaluate(() => window.LCNDA_EXT.editToolsList().filter(x => typeof x.create === 'function').map(x => x.key));
                assert.ok(tools.length >= 14 && ['house', 'montage', 'layout', 'vector', 'slideshow', 'sheet', 'textdoc', 'retouch', 'maps'].every(k => tools.includes(k)), tools.join());
                const pick = p.evaluate(() => window.LCNDA_EXT.shortcuts.chooseTargets());
                await p.waitForSelector('dialog[open].h-sc-dlg [data-sc-tab="create"]');
                assert.match(await p.$eval('dialog[open].h-sc-dlg [data-sc-pane="base"]', e => e.textContent), /onglet « ＋ Créer… »/);
                await p.click('.h-sc-dlg [data-sc-tab="create"]');
                const rows = await p.$$eval('.h-sc-dlg [data-sc-cat] .h-sc-catrow', r => r.map(x => x.querySelector('.h-sc-catname').textContent));
                assert.equal(rows.length, tools.length, rows.join(' | '));
                await shot('3-raccourcis-creer');
                await p.click('.h-sc-dlg [data-sc-cat] .h-sc-catrow'); await p.click('.h-sc-dlg .modal-actions [type=submit]');
                const got = await pick; assert.ok(got?.[0]?.target?.startsWith('create:'), JSON.stringify(got));
                for (const k of tools) {
                    await closeAll(); const before = errors.length;
                    await p.evaluate(k => { window.LCNDA_EXT.shortcuts.openTarget('create:' + k); }, k);
                    await p.waitForFunction(() => document.querySelector('dialog[open]'), null, { timeout: 10000 });
                    assert.equal(errors.length, before, `${k} : ${errors.slice(before)}`);
                }
                await closeAll();
            });

            /* 4 */
            await t(`[${tag}] 4. carte : format libre ; dessin : Format du document avec fond perdu gardé`, async () => {
                await closeAll();
                await p.evaluate(() => window.LCNDA_EXT.newMapDoc(() => {}));
                await p.waitForSelector('dialog[open] [data-fmt-box]');
                assert.ok(await p.$eval('dialog[open] [data-fmt-box]', b => !!b.querySelector('option[value="free"]') && !!b.querySelector('[data-fmt-w]')), 'format libre');
                await closeAll();
                await p.evaluate(() => window.LCNDA_EXT.openVectorEditor({}));
                await p.waitForSelector('[data-vx-cmd="docformat"], [data-cmd="docformat"], [data-vx-m="docformat"]', { state: 'attached', timeout: 15000 }).catch(() => {});
                const open = () => p.evaluate(() => { const b = document.querySelector('[data-vx-cmd="docformat"], [data-cmd="docformat"], [data-vx-m="docformat"], [data-k="docformat"]'); b?.click(); return !!b; });
                assert.ok(await open(), 'Fichier → Format du document');
                await p.waitForSelector('dialog[open] [name=vx_bleed]');
                assert.equal(await p.$eval('dialog[open] [name=vx_bleed]', e => e.value), '3');
                await p.fill('dialog[open] [name=vx_bleed]', '5'); await shot('4-dessin-format');
                await p.click('dialog[open] .modal-actions [type=submit]'); await p.waitForTimeout(300);
                await open(); await p.waitForSelector('dialog[open] [name=vx_bleed]');
                assert.equal(await p.$eval('dialog[open] [name=vx_bleed]', e => e.value), '5', 'gardé avec le dessin');
                await closeAll();
            });

            /* 5 */
            await t(`[${tag}] 5. chaque type de diagramme : « Graphique » avec au moins deux choix dans « Depuis l’app »`, async () => {
                const kinds = await p.evaluate(() => Object.keys(window.LCNDA_EXT.diagramRender.KINDS));
                for (const k of kinds) {
                    await closeAll(); await p.evaluate(k => { window.LCNDA_EXT.openDiagramEditor(null, { kind: k }); }, k);
                    await p.waitForSelector('dialog[open].h-dg-dlg [data-dg-tab="app"]'); await p.click('dialog[open].h-dg-dlg [data-dg-tab="app"]');
                    await p.waitForFunction(() => [...document.querySelectorAll('dialog[open] .h-dg-side label')].some(l => /^Graphique/.test(l.textContent.trim()) && [...(l.querySelector('select')?.options || [])].filter(o => o.value && !o.disabled).length >= 2), null, { timeout: 8000 }).catch(() => {}); // « Graphique » des chiffres de l'app : rempli un peu après
                    const n = await p.evaluate(() => { const pane = document.querySelector('dialog[open] .h-dg-side'); const lab = [...pane.querySelectorAll('label')].find(l => /^Graphique/.test(l.textContent.trim())); const s = lab?.querySelector('select'); return s ? [...s.options].filter(o => o.value && !o.disabled).length : 0; });
                    assert.ok(n >= 2, `${k} : ${n} choix dans « Graphique »`);
                }
            });
            await t(`[${tag}] 5. un point de départ règle le panneau (éventail, pyramide « qui vivait », calendrier, mortalité des enfants)`, async () => {
                const pick = async (k, label) => { await closeAll(); await p.evaluate(k => { window.LCNDA_EXT.openDiagramEditor(null, { kind: k }); }, k); await p.waitForSelector('dialog[open] [data-dg-tab="app"]'); await p.click('dialog[open] [data-dg-tab="app"]'); await p.waitForSelector('dialog[open] [data-dgg]');
                    const v = await p.$eval('dialog[open] [data-dgg]', (s, l) => [...s.options].find(o => o.textContent === l)?.value, label); assert.ok(v, `${k} : ${label}`); await p.selectOption('dialog[open] [data-dgg]', v); await p.waitForSelector('dialog[open] [data-dgg-hint]:not([hidden])'); };
                await pick('fan', 'Régions de naissance (6 générations)');
                assert.deepEqual(await p.evaluate(() => [document.querySelector('dialog[open] [data-gn="gens"]').value, document.querySelector('dialog[open] [data-gn="by"]').value]), ['6', 'state']);
                await shot('5-graphique-eventail');
                await p.click('dialog[open] [data-gn-go]'); await p.waitForFunction(() => document.querySelector('dialog[open] [data-dg-tab="data"]')?.classList.contains('is-active'), null, { timeout: 15000 });
                await pick('alivepyr', 'Qui vivait en 1850'); assert.equal(await p.$eval('dialog[open] [data-dm="year"]', e => e.value), '1850');
                await pick('calendar', 'Mariages'); assert.deepEqual(await p.$$eval('dialog[open] [data-gn-type]:checked', c => c.map(x => x.value)), ['marriage']);
                await pick('calendar', 'Décès et sépultures'); assert.deepEqual(await p.$$eval('dialog[open] [data-gn-type]:checked', c => c.map(x => x.value)), ['death', 'burial'], 'le choix d’avant est défait');
                await pick('vieenfants', 'Mes ancêtres, par siècle');
                assert.deepEqual(await p.evaluate(() => [document.querySelector('dialog[open] [data-dvi="step"]').value, document.querySelector('dialog[open] [data-dgo="pop"]').value]), ['100', 'anc']);
                await p.click('dialog[open] [data-dfa-go]'); await p.waitForFunction(() => document.querySelector('dialog[open] [data-dg-tab="data"]')?.classList.contains('is-active') || /⚠️/.test(document.querySelector('dialog[open] [data-dfa-msg]')?.textContent || ''), null, { timeout: 15000 });
                await closeAll();
            });
            await t(`[${tag}] 5. les nouvelles données : nuage, flux, organigramme, frises, cartes de chiffres, barre d’objectif`, async () => {
                const want = { scatter: ['birth_death', 'couples'], sankey: ['geo:birth_death:county'], orgchart: ['anc:3', 'desc:2'], timeline: ['anc:3', 'kids'], chrono: ['story', 'anc:3'], kpi: ['ancestors', 'quality'], bullet: ['sourced', 'score'] };
                for (const [k, keys] of Object.entries(want)) for (const key of keys) {
                    await closeAll(); const before = errors.length;
                    await p.evaluate(k => { window.LCNDA_EXT.openDiagramEditor(null, { kind: k }); }, k); await p.waitForSelector('dialog[open] [data-dg-tab="app"]'); await p.click('dialog[open] [data-dg-tab="app"]');
                    await p.waitForSelector('dialog[open] [data-dg-kapp]'); await p.selectOption('dialog[open] [data-dg-kapp]', key); await p.click('dialog[open] [data-dg-kappgo]');
                    await p.waitForFunction(() => document.querySelector('dialog[open] [data-dg-tab="data"]')?.classList.contains('is-active'), null, { timeout: 15000 }).catch(() => {});
                    const st = await p.evaluate(() => ({ tab: document.querySelector('dialog[open] .h-dg-tabs .is-active')?.dataset.dgTab, rows: document.querySelectorAll('dialog[open] [data-grid="0"] tbody tr').length, toast: [...document.querySelectorAll('.toast')].map(x => x.textContent).join(' / '), svg: document.querySelector('dialog[open] [data-dg-preview]')?.innerHTML || '' }));
                    assert.equal(st.tab, 'data', `${k}:${key} : ${st.toast}`); assert.ok(st.rows > 0, `${k}:${key} : aucune ligne`); assert.doesNotMatch(st.svg, /NaN|undefined|Dessin impossible/, `${k}:${key}`);
                    assert.equal(errors.length, before, `${k}:${key} : ${errors.slice(before)}`);
                    if (key === keys[0]) await shot(`5-${k}`);
                }
                await closeAll();
            });
            await t(`[${tag}] aucune erreur JavaScript`, () => { assert.deepEqual(errors, []); });
            await ctx.close();
        }
    } finally {
        await browser.close(); proc.kill(); fs.rmSync(tmp, { recursive: true, force: true });
    }
    process.exit(failed ? 1 : 0);
})();
