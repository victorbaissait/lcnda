'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * Trois demandes :
 *   node tests/test-recherche-ordre-fonds-raccourcis.js
 *   (ROF_PORT=… ROF_DIR=… ROF_SHOTS=dossier pour choisir le port, la base et garder des captures)
 * 1. 🔎 Recherche → « Type de recherche » : ordre et types cachés (« Réordonner » en bas de la colonne, et Réglages →
 *    Apparence « 🔎 Types de recherche »), gardés tout de suite (K2 : « ↶ Annuler », « ↺ Remettre comme au départ ») ;
 *    un type caché qui est celui en cours reste dans le menu (« (caché) ») et l'écran marche ; clés du défaut du site
 *    (SITE_DEFAULT_KEYS ↔ site_defaults_allowed_keys, serveur) et des « 💾 Réglages enregistrés ».
 * 2. 🗺️ BUG : l'ordre de « Fonds de cartes » (Réglages → Cartes et fonds de carte) suivi partout : Carte, réglages
 *    « Fonds de carte en boutons » et « Fonds de carte du plan des adresses », boutons de la fiche d'un village, menus du plan
 *    des adresses ; un fond décoché n'y est plus ; sans ordre choisi, chaque outil garde son ordre de départ.
 * 3. 🔗 « Mes raccourcis » : rubrique « ＋ Créer… » (un raccourci par outil de modification, mêmes icônes et mots),
 *    qui ouvre l'outil directement sur une nouvelle chose.
 * Navigateur à 1440 px, à 390 px et en mode sombre ; aucune erreur JavaScript.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
let failed = 0;
let cleanup = async () => {};
const t = async (name, fn) => { try { await cleanup(); await fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };

/* ── 0. Sans serveur : les clés ── */
const RK = ['genealogie-research-kind-order', 'genealogie-research-kind-hidden'];
const src = f => fs.readFileSync(path.join(appRoot, f), 'utf8');

let chromium = null;
try { ({ chromium } = require('playwright')); } catch (_) { try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); } catch (__) { chromium = null; } }
const phpPath = findPhp([devBundledPhp()]);
const tmp = process.env.ROF_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-rof-'));
const shots = process.env.ROF_SHOTS || '';
const envFor = d => ({ ...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1' });
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });

(async () => {
    await t('clés : défaut du site (page et serveur) et réglages enregistrés de l’Apparence', () => {
        const page = src('assets/js/app.js').match(/const SITE_DEFAULT_KEYS = \[([\s\S]*?)\];/)[1];
        const server = src('api.php').match(/function site_defaults_allowed_keys\(\): array\s*\{[^\[]*return \[([\s\S]*?)\];/)[1];
        const layout = src('assets/js/heritage-studio.js').match(/const LAYOUT_KEYS = \[([\s\S]*?)\];/)[1];
        for (const k of RK) { assert.ok(page.includes(`'${k}'`), 'SITE_DEFAULT_KEYS : ' + k); assert.ok(server.includes(`'${k}'`), 'api.php : ' + k); assert.ok(layout.includes(`'${k}'`), 'LAYOUT_KEYS : ' + k); }
    });
    if (!phpPath) { console.log('— serveur : PHP absent, partie sautée'); process.exit(failed ? 1 : 0); }
    fs.rmSync(path.join(tmp, 'genealogy.sqlite'), { force: true });
    fs.mkdirSync(path.join(tmp, 'media'), { recursive: true });
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; $pdo = db();
$t = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn();
$pdo->exec("INSERT INTO places(name,county,country,latitude,longitude,admin4_code,population) VALUES('Saint-Yrieix','Haute-Vienne','France',45.5,1.2,'87187',6800)");
$pdo->exec("INSERT INTO persons(first_name,last_name,gender) VALUES('Jean','Dupont','male'),('Marie','Durand','female')");
$pdo->exec("INSERT INTO events(scope,person_id,event_type_id,date_text,year,place_id) VALUES('person',1,{$t('BIRT')},'1750',1750,1),('person',2,{$t('BIRT')},'1752',1752,1)");
echo 'ok';`], { cwd: appRoot, encoding: 'utf8', env: envFor(tmp) });
    if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exit(1); }
    const port = Number(process.env.ROF_PORT) || await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env: envFor(tmp), stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
    try {
        if (!chromium) { console.log('— navigateur : Playwright absent, partie sautée'); return; }
        const browser = await chromium.launch();
        try {
            for (const [width, height, dark] of [[1440, 900, false], [390, 844, true]]) {
                const tag = `${width}${dark ? '-sombre' : ''}`;
                const errors = [];
                const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: dark ? 'dark' : 'light' });
                if (dark) await ctx.addInitScript(() => { try { if (!localStorage.getItem('genealogie-design')) localStorage.setItem('genealogie-design', JSON.stringify({ preset: 'dark' })); } catch (_) {} });
                const p = await ctx.newPage();
                p.on('pageerror', e => errors.push(e.message));
                p.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource|tile|tuile/i.test(m.text())) errors.push(m.text()); });
                cleanup = () => p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => { try { d.close(); d.remove(); } catch (_) {} })).catch(() => {});
                const shot = async name => { if (!shots) return; fs.mkdirSync(shots, { recursive: true }); await p.screenshot({ path: path.join(shots, `${name}-${tag}.png`) }); };
                await p.goto(base);
                await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.researchKinds && window.LCNDA_EXT?.shortcuts && window.LCNDA_EXT?.editToolsList && window.LCNDA_EXT?.addrMap, null, { timeout: 30000 });
                await p.evaluate(() => { localStorage.clear(); if (document.documentElement.dataset) {} });
                const kinds = () => p.$$eval('#research-form [name=search_kind] option', o => o.map(x => x.value));
                const lsGet = k => p.evaluate(k => localStorage.getItem(k), k);
                // K20 : à la souris, les flèches ↑ ↓ d'une ligne à poignée sont cachées (on glisse ⠿, ou Alt + ↑ au clavier sur la poignée) ;
                // au doigt, elles restent. La poignée est posée juste après le dessin : on l'attend avant de choisir.
                const moveUp = async row => { const arrow = `${row} [data-move="-1"]`;
                    await p.waitForSelector(`${row} .order-grip[data-grip-done]`, { timeout: 3000 }).catch(() => {}); await p.waitForTimeout(100);
                    if (await p.isVisible(arrow)) return p.click(arrow);
                    await p.focus(`${row} .order-grip`); await p.keyboard.press('Alt+ArrowUp'); await p.waitForTimeout(150); };

                /* ── 1. Types de recherche ── */
                await t(`[${tag}] Recherche → « Réordonner » : ordre et types cachés gardés tout de suite, ↶ Annuler`, async () => {
                    await p.evaluate(async () => { const s = window.LCNDA_APP.state; s.researchKind = 'text'; await window.LCNDA_APP.setModule('recherche'); });
                    await p.waitForSelector('#research-reorder');
                    const def = await kinds();
                    assert.deepEqual(def.slice(0, 3), ['question', 'gaps', 'text']);
                    await p.click('#research-reorder');
                    await p.waitForSelector('dialog[open].research-kind-dialog [data-rk-list] li');
                    assert.equal(await p.$$eval('.research-kind-dialog .modal-actions button', b => b.map(x => x.textContent.trim()).join('|')), 'Fermer', 'K2/K3 : pas d’Enregistrer, « Fermer » seul');
                    // K20 : à la souris, les flèches ↑ ↓ sont cachées (on glisse ⠿, ou Alt + ↑ au clavier sur la poignée) ; au doigt, elles restent
                    const up = i => moveUp(`.research-kind-dialog [data-index="${i}"]`);
                    await up(2); // texte monte
                    await up(1); // texte en premier
                    await p.click('.research-kind-dialog [data-rk="insee"] [data-eye]'); // INSEE caché
                    assert.deepEqual(JSON.parse(await lsGet(RK[0])).slice(0, 3), ['text', 'question', 'gaps']);
                    assert.deepEqual(JSON.parse(await lsGet(RK[1])), ['insee']);
                    const now = await kinds();
                    assert.deepEqual(now.slice(0, 3), ['text', 'question', 'gaps'], 'le menu suit tout de suite');
                    assert.ok(!now.includes('insee'), 'INSEE caché');
                    await p.waitForFunction(() => [...document.querySelectorAll('.toast')].some(x => /Types de recherche/.test(x.textContent) && /Annuler/.test(x.textContent)), null, { timeout: 5000 });
                    await shot('recherche-reordonner');
                    // ↶ Annuler : tout revient
                    await p.evaluate(() => [...document.querySelectorAll('.toast')].find(x => /Types de recherche/.test(x.textContent)).querySelectorAll('button').forEach(b => { if (/Annuler/.test(b.textContent)) b.click(); }));
                    await p.waitForFunction(() => !localStorage.getItem('genealogie-research-kind-order') && !localStorage.getItem('genealogie-research-kind-hidden'));
                    await p.waitForFunction(() => document.querySelector('#research-form [name=search_kind] option[value="insee"]'));
                    assert.deepEqual((await kinds()).slice(0, 3), ['question', 'gaps', 'text']);
                    // au moins un type affiché
                    const n = await p.$$eval('.research-kind-dialog [data-eye]', b => b.length);
                    for (let i = 0; i < n; i++) await p.click(`.research-kind-dialog [data-index="${i}"] [data-eye]`);
                    assert.ok(JSON.parse(await lsGet(RK[1])).length === n - 1, 'le dernier type reste affiché');
                    await p.click('.research-kind-dialog [data-rk-reset]');
                    assert.equal(await lsGet(RK[1]), null); assert.equal(await lsGet(RK[0]), null);
                    await p.click('.research-kind-dialog .modal-actions [data-close]');
                });
                await t(`[${tag}] un type caché qui est celui en cours ne casse rien (gardé « (caché) »)`, async () => {
                    await p.evaluate(() => { localStorage.setItem('genealogie-research-kind-hidden', JSON.stringify(['archive_digest', 'web'])); });
                    await p.evaluate(async () => { const s = window.LCNDA_APP.state; s.researchKind = 'archive_digest'; s.archiveDigestAdding = false; await window.LCNDA_APP.setModule('recherche'); });
                    await p.waitForSelector('#research-form');
                    const o = await p.$eval('#research-form [name=search_kind]', s => ({ v: s.value, txt: s.selectedOptions[0]?.textContent, web: !!s.querySelector('option[value="web"]') }));
                    assert.equal(o.v, 'archive_digest'); assert.match(o.txt, /\(caché\)$/); assert.equal(o.web, false);
                    assert.equal(await p.$eval('#research-archive-digest-fields', e => e.hidden), false, 'ses champs sont là');
                    await p.waitForFunction(() => document.querySelector('#workspace')?.textContent.trim().length > 20, null, { timeout: 10000 });
                    // on change de type : l'écran suit
                    await p.selectOption('#research-form [name=search_kind]', 'question');
                    await p.waitForFunction(() => window.LCNDA_APP.state.researchKind === 'question');
                    await p.evaluate(() => localStorage.removeItem('genealogie-research-kind-hidden'));
                });
                await t(`[${tag}] Réglages → Apparence « 🔎 Types de recherche » : K2 (↶ Annuler, ↺ Remettre comme au départ)`, async () => {
                    await p.evaluate(async () => { const s = window.LCNDA_APP.state; s.maintenanceTab = 'design'; await window.LCNDA_APP.setModule('maintenance'); });
                    await p.waitForSelector('.design-order-grid-four #research-kinds-config [data-rk-list] li', { timeout: 20000 });
                    await p.click('#research-kinds-config [data-rk="web"] [data-eye]');
                    assert.deepEqual(JSON.parse(await lsGet(RK[1])), ['web']);
                    await p.waitForFunction(() => [...document.querySelectorAll('.toast')].some(x => /Réglage changé/.test(x.textContent) && /Annuler/.test(x.textContent)), null, { timeout: 5000 });
                    await p.$eval('#research-kinds-config', e => e.scrollIntoView({ block: 'center' }));
                    await shot('apparence-types-recherche');
                    await p.evaluate(() => [...document.querySelectorAll('.toast')].reverse().find(x => /Réglage changé/.test(x.textContent) && [...x.querySelectorAll('button')].some(b => /Annuler/.test(b.textContent))).querySelectorAll('button').forEach(b => { if (/Annuler/.test(b.textContent)) b.click(); }));
                    await p.waitForFunction(() => !localStorage.getItem('genealogie-research-kind-hidden'));
                    await p.waitForSelector('#research-kinds-config [data-rk="web"] [data-eye][aria-pressed="true"]');
                    await moveUp('#research-kinds-config [data-rk="saved"]');
                    assert.ok(await lsGet(RK[0]));
                    await p.click('#research-kinds-config [data-rk-reset]');
                    assert.equal(await lsGet(RK[0]), null);
                });
                if (!dark) await t('serveur : le défaut du site garde les types de recherche (et jette une clé inconnue)', async () => {
                    const res = await p.evaluate(async () => { const A = window.LCNDA_APP; await A.api('save_site_defaults', {}, { method: 'POST', body: { settings: { 'genealogie-research-kind-order': '["text","question"]', 'genealogie-research-kind-hidden': '["insee"]', 'zzz-inconnue': '1' } } }); return (await A.api('bootstrap')).siteDefaults.settings; });
                    assert.equal(res['genealogie-research-kind-order'], '["text","question"]');
                    assert.equal(res['genealogie-research-kind-hidden'], '["insee"]');
                    assert.equal(res['zzz-inconnue'], undefined);
                    await p.evaluate(async () => window.LCNDA_APP.api('save_site_defaults', {}, { method: 'POST', body: { settings: {} } }));
                });

                /* ── 2. Fonds de carte ── */
                await t(`[${tag}] fonds de carte : sans ordre choisi, chaque outil garde son ordre de départ`, async () => {
                    assert.deepEqual(await p.evaluate(() => window.LCNDA_APP.sortTileKeys(['osmfr', 'ign_planv2', 'offline'])), ['osmfr', 'ign_planv2', 'offline']);
                    assert.equal(await p.evaluate(() => window.LCNDA_APP.tileLayerCategories[0].id), 'standard');
                });
                await t(`[${tag}] BUG corrigé : l’ordre de « Fonds de cartes » est suivi partout (Carte, boutons, plan des adresses)`, async () => {
                    await p.evaluate(async () => { const s = window.LCNDA_APP.state; s.maintenanceTab = 'design_maps'; await window.LCNDA_APP.setModule('maintenance'); });
                    await p.waitForSelector('#tile-cat-order .tile-cat-block[data-tile-cat="historical"]', { timeout: 20000 });
                    // les cartes historiques en premier, l'État-major en tête de sa catégorie, « Cassini — exemplaire du roi » décoché
                    await p.evaluate(() => {
                        const list = document.querySelector('#tile-cat-order'), hist = list.querySelector('[data-tile-cat="historical"]');
                        list.prepend(hist);
                        const items = hist.querySelector('.tile-cat-items'); items.prepend(items.querySelector('[data-order-key="etatmajor"]'));
                    });
                    // K2 : plus de bouton « Enregistrer » (caché) : décocher une case enregistre toute la liste, tout de suite
                    assert.equal(await p.isVisible('[data-order-save="tile-layers"]'), false, 'K2 : bouton « Enregistrer » caché');
                    await p.click('#tile-cat-order [data-order-key="cassini_royal"] .order-visible input');
                    await p.waitForFunction(() => window.LCNDA_APP.tileLayerCategories[0].id === 'historical');
                    const cats = await p.evaluate(() => window.LCNDA_APP.tileLayerCategories.map(c => [c.id, c.items.map(i => i[0])]));
                    assert.equal(cats[0][1][0], 'etatmajor');
                    assert.ok(!cats.some(([, k]) => k.includes('cassini_royal')), 'fond décoché absent');
                    assert.deepEqual(await p.evaluate(() => window.LCNDA_APP.sortTileKeys(['osmfr', 'cassini', 'etatmajor'])), ['etatmajor', 'cassini', 'osmfr']);
                    // les deux réglages de la même page suivent
                    // la page se redessine après l'enregistrement tout seul (K2) : on attend le nouveau dessin
                    await p.waitForFunction(() => document.querySelector('#h-village-maps-config details summary')?.textContent.trim() === 'Cartes historiques', null, { timeout: 10000 }).catch(() => {});
                    assert.equal(await p.$eval('#h-village-maps-config details summary', s => s.textContent.trim()), 'Cartes historiques', 'Fonds de carte en boutons');
                    assert.equal(await p.$eval('#h-village-maps-config details .h-village-maps-grid input', i => i.dataset.hVmap), 'etatmajor');
                    assert.equal(await p.$eval('#h-addrmap-config details summary', s => s.textContent.trim()), 'Cartes historiques', 'Fonds de carte du plan des adresses');
                    assert.equal(await p.$$eval('#h-village-maps-config [data-h-vmap="cassini_royal"], #h-addrmap-config [data-am-fav][value="cassini_royal"]', e => e.length), 0);
                    await p.$eval('#h-village-maps-config', e => e.scrollIntoView({ block: 'start' }));
                    await shot('fonds-boutons-ordre');
                    // la Carte
                    await p.evaluate(async () => { await window.LCNDA_APP.setModule('carte'); });
                    await p.waitForSelector('#map-background optgroup', { state: 'attached', timeout: 20000 });
                    assert.match(await p.$eval('#map-background optgroup', g => g.label), /Cartes historiques/);
                    assert.equal(await p.$eval('#map-background optgroup option', o => o.value), 'etatmajor');
                    assert.equal(await p.$$eval('#map-background option[value="cassini_royal"]', e => e.length), 0);
                    // la fiche d'un village : boutons dans l'ordre choisi
                    await p.evaluate(() => localStorage.setItem('genealogie-village-maps', JSON.stringify(['osmfr', 'cassini', 'etatmajor', 'cassini_royal'])));
                    await p.evaluate(async () => { const s = window.LCNDA_APP.state; s.listType = 'villages'; s.hVillage = '87187'; await window.LCNDA_APP.setModule('listes'); });
                    await p.waitForSelector('[data-h-village-bg]', { timeout: 20000 });
                    assert.deepEqual(await p.$$eval('[data-h-village-bg]', b => b.map(x => x.dataset.hVillageBg)), ['etatmajor', 'cassini', 'osmfr']);
                    await p.$eval('.h-village-mapbox', e => e.scrollIntoView({ block: 'start' }));
                    await shot('village-boutons-ordre');
                    // le plan des adresses de la fiche du village
                    const host = await p.$('[data-vsec="addrmap"]:not([hidden])');
                    if (host) {
                        await p.waitForSelector('[data-am-now] option', { state: 'attached', timeout: 20000 });
                        const now = await p.$$eval('[data-am-now] > option', o => o.map(x => x.value));
                        assert.deepEqual(now.slice(0, 5), ['offline', 'osmfr', 'satellite', 'ign_hr_ortho', 'ign_planv2'], 'Aujourd’hui : dans l’ordre de « Fonds de cartes »');
                        const old = await p.$$eval('[data-am-old] > option', o => o.map(x => x.value));
                        assert.deepEqual(old.slice(0, 5), ['', 'etatmajor', 'ohm', 'cassini', 'ign_ortho_1950'], 'Carte ancienne : dans l’ordre, sans le fond décoché');
                        assert.equal(await p.$$eval('[data-am-old] option[value="cassini_royal"]', e => e.length), 0);
                        assert.match(await p.$eval('[data-am-old] optgroup', g => g.label), /Cartes historiques/);
                    } else console.log('  (pas de plan des adresses sur la fiche du village : partie sautée)');
                    await p.evaluate(() => { ['genealogie-tile-cat-order', 'genealogie-tile-hidden-cats', 'genealogie-tile-hidden', 'genealogie-tile-custom-cats', 'genealogie-village-maps'].forEach(k => localStorage.removeItem(k)); for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (k && k.startsWith('genealogie-tile-items-')) localStorage.removeItem(k); } });
                });

                /* ── 3. Mes raccourcis : « ＋ Créer… » ── */
                await t(`[${tag}] raccourcis : rubrique « ＋ Créer… », un raccourci par outil de modification`, async () => {
                    const rows = await p.evaluate(() => window.LCNDA_EXT.shortcuts.catalog().filter(r => r.group === '＋ Créer…').map(r => [r.target, r.icon, r.label]));
                    const tools = await p.evaluate(() => window.LCNDA_EXT.editToolsList().filter(x => typeof x.create === 'function').map(x => [x.key, x.icon]));
                    assert.equal(rows.length, tools.length);
                    for (const [k, ic] of tools) assert.ok(rows.some(([tg, i]) => tg === 'create:' + k && i === ic), 'même icône : ' + k);
                    const byKey = Object.fromEntries(rows.map(([tg, , l]) => [tg.slice(7), l]));
                    for (const [k, l] of [['house', 'Nouvelle maison'], ['montage', 'Nouveau montage'], ['layout', 'Nouveau livre'], ['retouch', 'Nouvelle retouche'], ['vector', 'Nouveau dessin'], ['cards', 'Nouveau faire-part'], ['slideshow', 'Nouvelle présentation ou diaporama'], ['acts', 'Nouvelle transcription'], ['audio', 'Nouveau projet son']])
                        assert.equal(byKey[k], l, k);
                    assert.ok(rows.every(([, , l]) => !/^[＋+]/.test(l)), 'un seul signe : l’icône de l’outil (K11)');
                    const d = await p.evaluate(() => ({ ok: window.LCNDA_EXT.shortcuts.validTarget('create:house'), bad: window.LCNDA_EXT.shortcuts.validTarget('create:<b>'), desc: window.LCNDA_EXT.shortcuts.describe('create:montage') }));
                    assert.equal(d.ok, true); assert.equal(d.bad, false); assert.deepEqual([d.desc.icon, d.desc.label, d.desc.what], ['🎬', 'Nouveau montage', 'Créer · Montage vidéo']);
                });
                await t(`[${tag}] raccourcis : choisis dans la fenêtre, puis un clic ouvre l’outil sur une nouvelle chose`, async () => {
                    await p.evaluate(async () => { await window.LCNDA_APP.setModule('dashboard'); });
                    assert.equal(await p.evaluate(() => window.LCNDA_EXT.shortcuts.catalog()[0].group), '＋ Créer…', 'la rubrique en tête');
                    const pick = p.evaluate(() => window.LCNDA_EXT.shortcuts.chooseTargets());
                    await p.waitForSelector('dialog[open].h-sc-dlg [data-sc-tab="screens"]');
                    await p.click('.h-sc-dlg [data-sc-tab="screens"]');
                    await p.fill('.h-sc-dlg [data-sc-qslot] input', 'nouvelle maison');
                    await p.waitForFunction(() => /Nouvelle maison/.test(document.querySelector('.h-sc-dlg .h-sc-catrow')?.textContent || '') && document.querySelector('.h-sc-dlg .h-sc-catg')?.textContent === '＋ Créer…');
                    await shot('raccourcis-creer');
                    await p.click('.h-sc-dlg .h-sc-catrow');
                    await p.fill('.h-sc-dlg [data-sc-qslot] input', 'nouveau montage');
                    await p.waitForFunction(() => /Nouveau montage/.test(document.querySelector('.h-sc-dlg .h-sc-catrow')?.textContent || ''));
                    await p.click('.h-sc-dlg .h-sc-catrow');
                    await p.click('.h-sc-dlg [type=submit]');
                    const links = await pick;
                    assert.deepEqual(links.map(l => l.target), ['create:house', 'create:montage']);
                    // un clic : l'outil maison s'ouvre sur une maison neuve (sans numéro)
                    const opened = await p.evaluate(async () => {
                        const ext = window.LCNDA_EXT, calls = [];
                        const tools = ext.editToolsList(), h = tools.find(x => x.key === 'house'), keep = h.create;
                        h.create = again => { calls.push(typeof again); };
                        try { await ext.shortcuts.openTarget('create:house', {}); } finally { h.create = keep; }
                        return calls;
                    });
                    assert.deepEqual(opened, ['function']);
                    // pour de vrai : la maison s'ouvre en plein écran, sans projet (nouvelle)
                    await p.evaluate(() => window.LCNDA_EXT.shortcuts.openTarget('create:house', {}));
                    await p.waitForFunction(() => [...document.querySelectorAll('dialog[open], .h-house, [class*="house"]')].some(e => e.offsetParent !== null || e.open), null, { timeout: 15000 });
                    await shot('raccourci-nouvelle-maison');
                    await p.keyboard.press('Escape');
                });
                await t(`[${tag}] aucune erreur JavaScript`, async () => { assert.deepEqual(errors, []); });
                await ctx.close();
            }
        } finally { await browser.close(); }
    } finally { proc.kill(); if (!process.env.ROF_DIR) fs.rmSync(tmp, { recursive: true, force: true }); }
    process.exit(failed ? 1 : 0);
})();
