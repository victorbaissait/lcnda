'use strict';
/* H10 sur les listes « Histoire » et « Recherche et organisation » (lot C, maquette docs/design/h10-listes.html, familles 4 et 5) :
 *   🌍 Le monde autour · ☠️ Épidémies, guerres, hivers (barre sur les crises seulement) · 🎖️ Poilus · ✊ Résistants (la carte suit)
 *   🚢 Départs (la carte suit, « Fiches » au départ) · 👶 Enfants placés (la carte suit) · 🤝 Demandes d’entraide · 🎪 Salons (« Fiches » au départ)
 *     node tests/test-h10-lot-c.js        (H10C_SHOTS=dossier pour garder des captures)
 * 1. Le code : chaque liste passe par UI.listBar (sa clé, ses rubriques, ses tris) ; plus de barre faite à la main.
 * 2. Navigateur (Playwright, si présent) : liste vide → grande boîte K10 seule ; avec des lignes : la barre, chercher, filtrer
 *    (pastille bleue, ×), chaque tri, « Liste | Fiches », réglages retenus après rechargement, 390 px sombre sans défilement de côté,
 *    aucune erreur JavaScript.
 */
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const root = path.resolve(__dirname, '..');
const js = f => fs.readFileSync(path.join(root, 'assets/js', f), 'utf8');
let failed = 0, count = 0;
const t = async (name, fn) => { try { await fn(); count++; console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
const between = (src, a, b) => { const i = src.indexOf(a); assert.ok(i >= 0, `trouvé : ${a}`); const j = src.indexOf(b, i + a.length); return src.slice(i, j < 0 ? undefined : j); };

const LISTS = {
    world_events: {file: 'heritage-monde.js', from: 'ext.lists.world_events = async', to: 'const relist', groups: ['Sorte', 'Portée', 'Ajoutés par moi', 'Période'], sorts: ['old', 'recent', 'az', 'za'], view: false},
    historical_context: {file: 'heritage-more.js', from: 'ext.lists.historical_context = async', to: 'RÉSISTANTS', groups: ['Sorte', 'La famille', 'Période'], sorts: ['time', 'deaths', 'excess'], view: false},
    poilus_list: {file: 'heritage.js', from: 'ext.lists.poilus_list = async', to: '/* ── Inventaires', groups: ['Mort pour la France', 'Régiment, unité', 'Devenir'], sorts: ['recent', 'old', 'az', 'za', 'unit'], view: 'list'},
    resistance_list: {file: 'heritage-more.js', from: 'ext.lists.resistance_list = async', to: 'BLOCS PERSONNALISÉS', groups: ['Réseau, mouvement', 'Devenir', 'Étiquette'], sorts: ['recent', 'old', 'az', 'za', 'joined'], view: false},
    voyages_list: {file: 'heritage.js', from: 'ext.lists.voyages_list = async', to: '/* ── Enfants placés', groups: ['Destination', 'Personne', 'Période'], sorts: ['old', 'recent', 'az', 'za'], view: 'cards'},
    placements_list: {file: 'heritage.js', from: 'ext.lists.placements_list = async', to: '/* ── Armoiries', groups: ['Situation', 'Lieu', 'Période'], sorts: ['recent', 'old', 'az', 'za', 'start', 'duration'], view: false},
    help_requests: {file: 'heritage-links.js', from: 'ext.lists.help_requests = async', to: 'function helpFormHtml', groups: ['État', 'Ce qu’on cherche', 'Personne', 'Publiée sur'], sorts: ['recent', 'old', 'az', 'za'], view: false},
    fairs: {file: 'app.js', from: 'async function renderFairsList(', to: 'function fairFormHtml', groups: ['Quand', 'Sorte', 'Lieu'], sorts: ['near', 'recent', 'old', 'az', 'za'], view: 'cards'},
};

(async () => {
    /* ── 1. le code ── */
    for (const [id, L] of Object.entries(LISTS)) {
        await t(`${id} : la barre commune UI.listBar (clé « listes:${id} »), sans barre faite à la main`, () => {
            const src = between(js(L.file), L.from, L.to);
            assert.ok(src.includes('listBar({key:') && src.includes(`'listes:${id}'`), 'UI.listBar avec sa clé');
            assert.ok(!/collection-toolbar|segmented-filter|data-fairs-filter|data-h-help-filter|h-world-listbar|personPickerAdd|type="search"/.test(src), 'plus de barre, de boutons de filtre ni de case faits main');
            for (const g of L.groups) assert.ok(src.includes(`'${g}'`) || (g === 'Période' && src.includes('h10PeriodFilters(')), `rubrique « ${g} »`);
            for (const s of L.sorts) assert.ok(src.includes(`['${s}', `) || src.includes(`['${s}',`), `tri ${s}`);
            if (L.view) assert.ok(new RegExp(`view: ?\\{dflt: ?'${L.view}'`).test(src), `« Liste | Fiches », ${L.view} au départ`); else assert.ok(!/view: ?\{/.test(src), 'pas de « Liste | Fiches »');
        });
    }
    await t('« ＋ Voyage » / « ＋ Placement » dans l’en-tête : « Pour qui ? » se demande dans la fenêtre', () => {
        const h = js('heritage.js');
        assert.equal((h.match(/personPick\('h_for_person'/g) || []).length, 2);
        assert.ok(between(h, 'ext.lists.voyages_list', '/* ── Enfants').includes('openVoyageDialog(0, 0)'));
        assert.ok(between(h, 'ext.lists.placements_list', '/* ── Armoiries').includes('openPlacementDialog(0, 0)'));
    });

    /* ── 2. navigateur ── */
    let chromium = null;
    try { ({chromium} = require('playwright')); } catch (_) { try { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); } catch (__) { chromium = null; } }
    const phpPath = findPhp([devBundledPhp()]);
    if (!chromium || !phpPath) { console.log('— navigateur : Playwright ou PHP absent, partie sautée'); console.log(`${failed ? '✗' : '✓'} H10 lot C : ${count} vérifications`); process.exit(failed ? 1 : 0); }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-h10c-'));
    const shots = process.env.H10C_SHOTS || '';
    const envFor = d => ({...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1'});
    fs.mkdirSync(path.join(tmp, 'media'), {recursive: true});
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p->exec("INSERT INTO persons(first_name,last_name,gender,living_status) VALUES('Joseph','Martin','male','deceased'),('Marie','Borie','female','deceased'),('Pierre','Peyre','male','deceased'),('<img src=x onerror=window.__xss=1>','Piège','unknown','deceased')"); $p = null;
require 'lib/bootstrap.php'; $pdo = db();
$deat = (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='DEAT'")->fetchColumn();
foreach ([[1, 1832], [2, 1879], [3, 1918], [4, 1709]] as [$pid, $y]) { $pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,date_text,year,sort_date) VALUES('person',?,?,?,?,?)")->execute([$pid, $deat, (string) $y, $y, $y . '-01-01']); }
echo 'ok';`], {cwd: root, encoding: 'utf8', env: envFor(tmp)});
    if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exit(1); }
    const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const port = Number(process.env.H10C_PORT) || await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env: envFor(tmp), stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
    const browser = await chromium.launch();
    const errs = [];
    const open = async (w, dark = false) => {
        const page = await browser.newPage({viewport: {width: w, height: 900}, colorScheme: dark ? 'dark' : 'light'});
        page.on('pageerror', e => errs.push(e.message));
        page.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|ERR_PROXY|ERR_NAME|ERR_INTERNET|ERR_CONNECTION/.test(m.text())) errs.push(m.text()); });
        page.on('response', x => { if (x.status() >= 400 && x.url().startsWith(base)) errs.push(`${x.status()} ${x.url()}`); });
        await page.goto(base); await page.waitForFunction(() => window.LCNDA_APP?.state?.csrf);
        if (dark) await page.evaluate(() => { const A = window.LCNDA_APP; localStorage.setItem('genealogie-design', JSON.stringify({...A.readDesignSettings(), preset: 'dark'})); A.applyDesign(); });
        return page;
    };
    const go = async (page, id) => { await page.evaluate(id => { const A = window.LCNDA_APP; A.state.listType = id; A.setModule('listes'); }, id); await page.waitForTimeout(900); };
    const info = page => page.evaluate(() => ({bar: !!document.querySelector('#workspace .ui-listbar'), k10: !!document.querySelector('#workspace .empty-box'), count: document.querySelector('#workspace .ui-listbar-count')?.textContent || '',
        chips: [...document.querySelectorAll('#workspace .ui-listbar-chip')].map(c => c.textContent.replace(/\s*×$/, '')), sort: document.querySelector('#workspace .ui-listbar select')?.value || '',
        view: document.querySelector('#workspace .ui-listbar .ui-viewtoggle .is-active')?.dataset.view || '', q: document.querySelector('#workspace .ui-listbar-q input')?.value ?? null}));
    try {
        const page = await open(1440);
        await t('liste tout à fait vide : barre cachée, grande boîte K10 seule (avec le bouton pour commencer)', async () => {
            for (const id of ['poilus_list', 'resistance_list', 'voyages_list', 'placements_list', 'help_requests', 'fairs']) {
                await go(page, id); const m = await info(page);
                assert.ok(!m.bar && m.k10, `${id} : ${JSON.stringify(m)}`);
            }
            await go(page, 'voyages_list'); await page.click('#workspace .ui-ph-actions [data-h-voyage-add-list]'); await page.waitForTimeout(500);
            assert.ok(await page.$('dialog[open] [name=h_for_person]'), '« Pour qui ? » dans la fenêtre du voyage');
            await page.keyboard.press('Escape'); await page.waitForTimeout(300);
        });
        // des lignes pour chaque liste
        await page.evaluate(async () => {
            const api = (a, body) => window.LCNDA_APP.api(a, {}, {method: 'POST', body});
            await api('save_voyage', {id: 0, person_id: 1, departure_date: '1885-05-12', departure_port: 'Le Havre', destination: 'Québec', ship_name: 'La Bretagne'});
            await api('save_voyage', {id: 0, person_id: 3, departure_date: '1902-09-20', departure_port: 'Bordeaux', destination: 'Buenos Aires'});
            await api('save_placement', {id: 0, person_id: 2, kind: 'nourrice', start_date: '1878-03-12', end_date: '1881-06-02', place_text: 'Château-Chinon'});
            await api('save_placement', {id: 0, person_id: 4, kind: 'hospice', start_date: '1890', place_text: 'Tulle'});
            await api('save_poilu', {person_id: 1, units: [{unit_name: '152e régiment d’infanterie', date_from: '1914-08-02'}], events: [{event_date: '1916-02-21', kind: 'blesse', place_text: 'Verdun'}]});
            await api('save_poilu', {person_id: 3, units: [{unit_name: '126e régiment d’infanterie'}], events: []});
            await api('save_resistance', {person_id: 1, profile: {nom_de_guerre: 'Max', network: 'Alliance', arrested: 1}, steps: []});
            await api('save_resistance', {person_id: 4, profile: {nom_de_guerre: 'Rex', network: 'Comète', killed: 1}, steps: []});
            await api('save_help_request', {id: 0, person_id: 1, target: 'parents', status: 'posted', posted_where: 'Entraide Geneanet', question: 'Les parents de Joseph'});
            await api('save_help_request', {id: 0, person_id: 2, target: 'death', status: 'solved', question: 'Décès de Marie'});
            await api('save_genealogy_fair', {id: 0, title: 'Salon de Tulle', kind: 'Salon', date_start: '2099-05-01', place_text: 'Tulle'});
            await api('save_genealogy_fair', {id: 0, title: 'Forum ancien', kind: 'Forum', date_start: '2001-05-01', place_text: 'Brive'});
        });
        const Q = {world_events: ['choléra', 'Sorte'], historical_context: ['hiver', 'Sorte'], poilus_list: ['152', 'Devenir'], resistance_list: ['max', 'Réseau, mouvement'], voyages_list: ['buenos', 'Destination'],
            placements_list: ['tulle', 'Situation'], help_requests: ['joseph', 'Ce qu’on cherche'], fairs: ['tulle', 'Sorte']};
        for (const [id, L] of Object.entries(LISTS)) {
            await t(`${id} : chercher, filtrer, trier, ${L.view ? 'Liste | Fiches, ' : ''}réglages retenus`, async () => {
                await go(page, id);
                let m = await info(page);
                assert.ok(m.bar && m.count, `barre et nombre : ${JSON.stringify(m)}`);
                if (L.view) assert.equal(m.view, L.view, '« Fiches » / « Liste » au départ');
                if (id === 'help_requests') assert.deepEqual(m.chips, ['Brouillon', 'Publiée', 'Réponse reçue'], '« En cours » au départ, visible en pastilles');
                if (id === 'fairs') assert.deepEqual(m.chips, ['À venir'], '« À venir » au départ, visible en pastille');
                await page.fill('#workspace .ui-listbar-q input', Q[id][0]); await page.waitForTimeout(450);
                const n0 = (await info(page)).count; assert.match(n0, / sur /, `la recherche réduit la liste : ${n0}`);
                await page.click('#workspace .ui-listbar-fbtn'); await page.waitForTimeout(200);
                const groups = await page.$$eval('.ui-listbar-menu .ui-listbar-group > b', g => g.map(x => x.textContent));
                assert.deepEqual(groups, L.groups, 'rubriques de Filtrer');
                const box = await page.$(`.ui-listbar-menu .ui-listbar-group:has(> b:text-is("${Q[id][1]}")) input[type=checkbox]:not(:checked)`);
                await box.check(); await page.waitForTimeout(250); await page.keyboard.press('Escape'); await page.waitForTimeout(150);
                m = await info(page); assert.ok(m.chips.length >= 1 && await page.$('#workspace .ui-listbar-fbtn .ui-listbar-n'), `pastille bleue : ${JSON.stringify(m)}`);
                if (shots) await page.locator('#workspace').screenshot({path: path.join(shots, `${id}.png`)});
                const sorts = await page.$$eval('#workspace .ui-listbar select option', o => o.map(x => x.value));
                assert.deepEqual(sorts, L.sorts, 'tris');
                for (const s of sorts) { await page.selectOption('#workspace .ui-listbar select', s); await page.waitForTimeout(80); }
                if (L.view) { await page.click('#workspace .ui-listbar .ui-viewtoggle button:not(.is-active)'); await page.waitForTimeout(250); }
                const before = await info(page);
                await page.reload(); await page.waitForFunction(() => window.LCNDA_APP?.state?.csrf); await go(page, id);
                const after = await info(page);
                assert.deepEqual(after, before, 'recherche, filtres, tri et affichage retenus');
                await page.click('#workspace .ui-listbar-clearall'); await page.waitForTimeout(350);
                m = await info(page); assert.ok(!m.chips.length && m.q === '' && !/ sur /.test(m.count), `Tout effacer : ${JSON.stringify(m)}`);
            });
        }
        await t('la carte des départs, des placements et des résistants suit les filtres', async () => {
            await go(page, 'voyages_list');
            const all = await page.$$eval('#workspace [data-h10-map] circle, #workspace [data-h10-map] .h-map-dot, #workspace [data-h10-map] [class*=point]', x => x.length);
            await page.fill('#workspace .ui-listbar-q input', 'buenos'); await page.waitForTimeout(450);
            const one = await page.$$eval('#workspace [data-h10-map] circle, #workspace [data-h10-map] .h-map-dot, #workspace [data-h10-map] [class*=point]', x => x.length);
            assert.ok(one < all || all === 0, `moins de points sur la carte : ${all} → ${one}`);
            await page.fill('#workspace .ui-listbar-q input', ''); await page.waitForTimeout(300);
            for (const [id, sel] of [['voyages_list', '[data-h10-map]'], ['placements_list', '[data-h10-map]'], ['resistance_list', '[data-res-map]']]) { await go(page, id); assert.ok(await page.$(`#workspace ${sel}`), `${id} : la carte est redessinée avec la liste`); }
            assert.equal(await page.evaluate(() => window.__xss), undefined, 'aucun texte piégé exécuté');
        });
        await page.close();
        const small = await open(390, true);
        await t('390 px en mode sombre : pas de défilement de côté', async () => {
            for (const id of Object.keys(LISTS)) {
                await go(small, id);
                const over = await small.evaluate(() => document.documentElement.scrollWidth - innerWidth);
                assert.ok(over <= 1, `${id} : ${over} px de trop`);
            }
        });
        await small.close();
        await t('aucune erreur JavaScript ni réponse en erreur', () => { assert.deepEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true});
    }
    console.log(`${failed ? '✗' : '✓'} H10 lot C : ${count} vérifications`);
    process.exit(failed ? 1 : 0);
})();
