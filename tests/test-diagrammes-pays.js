'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🌍 Diagrammes « Cartes » : « Un autre pays… » (assets/js/heritage-diagram-cartes.js, scripts/build-geo-pays.js,
 * assets/data/geo/pays/, eu-nuts3.json.gz, us-comtes.json.gz) :
 *     node tests/test-diagrammes-pays.js            (DGM_SHOTS=dossier pour enregistrer des captures)
 * 1. Sans navigateur : la liste des pays et les fichiers (légers, licences écrites) ; l'Italie et ses régions (noms
 *    français) puis ses provinces ; les comtés des États-Unis ; le NUTS 3 de l'Europe et d'un pays ; les lieux comptés
 *    dans la bonne région (coordonnées, sinon nom + pays ; un lieu d'un autre pays n'est pas pris par son nom) ;
 *    la source sous chaque carte ; un fichier n'est lu qu'au choix de son pays ; cadrage et projection d'un pays ;
 *    « Partir des données » et « Je veux représenter… » proposent la carte du pays.
 * 2. Navigateur (Playwright, sinon partie sautée), sur un vrai « php -S » : réglages « 🌍 Un autre pays… », recherche
 *    du pays (Entrée), régions de l'Italie dessinées, lien vers la source (↗), fichiers demandés seulement alors ;
 *    clair 1280 px et sombre 390 px, sans défilement de côté ; aucune erreur JavaScript.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..'), GEO = path.join(appRoot, 'assets/data/geo');
let failed = 0;
const steps = [], step = (name, fn) => steps.push([name, fn]);
const shots = process.env.DGM_SHOTS || '';
const J = v => JSON.parse(JSON.stringify(v));

/* ── 1. Bac à sable ── */
const asked = [];
const sandbox = { window: {}, console, setTimeout, clearTimeout, performance, TextDecoder, Response, Blob, DecompressionStream,
    fetch: async url => { asked.push(String(url).split('?')[0]); const b = fs.readFileSync(path.join(appRoot, String(url).split('?')[0])); return { ok: true, json: async () => JSON.parse(b.toString('utf8')), arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.length) }; } };
vm.createContext(sandbox);
for (const f of ['heritage-diagrams-render.js', 'heritage-diagram-cartes.js', 'heritage-diagram-cartes2.js']) vm.runInContext(fs.readFileSync(path.join(appRoot, 'assets/js', f), 'utf8'), sandbox, { filename: f });
const ext = sandbox.window.LCNDA_EXT, R = ext.diagramRender, DC = ext.diagramCartes;
const draw = async (kind, o, rest = {}, W = 800) => { const s = await R.KINDS[kind].resolve({ kind, o, series: [{ name: 'Naissances' }], ...rest }); return { s, svg: R.svg(s, W) }; };
const titles = svg => (svg.match(/<title>[^<]*/g) || []).map(x => x.slice(7));
const gz = f => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(GEO, f))).toString('utf8'));

step('rien n’est lu avant de choisir un pays (fichiers chargés à la demande)', () => {
    assert.ok(DC.MAPS.pays, 'carte « Un autre pays… »'); assert.match(DC.MAPS.pays.label, /Un autre pays/);
    assert.deepEqual(asked, [], 'aucun fichier lu au chargement du script');
    assert.deepEqual(J(Object.keys(DC.MAPS).slice(0, 7)), ['fr', 'be', 'ch', 'lu', 'eu', 'monde', 'pays'], 'France, Belgique, Suisse, Luxembourg, Europe, Monde, puis un autre pays');
});
step('la liste des pays, les fichiers (légers, compressés), les licences écrites', () => {
    const ix = JSON.parse(fs.readFileSync(path.join(GEO, 'pays/index.json'), 'utf8')).countries;
    assert.ok(ix.length >= 200, `${ix.length} pays`);
    for (const c of ['DE', 'IT', 'ES', 'PT', 'GB', 'IE', 'NL', 'PL', 'AT', 'US', 'CA', 'DZ', 'MA', 'TN', 'AR', 'BR', 'AU', 'RU']) {
        const e = ix.find(x => x.c === c); assert.ok(e && e.k >= 2 && e.v.length === 4, c);
        const size = fs.statSync(path.join(GEO, `pays/adm1-${c}.json.gz`)).size; assert.ok(size < 100e3, `${c} : ${size} octets`);
    }
    assert.equal(ix.find(x => x.c === 'IT').n, 'Italie'); assert.equal(ix.find(x => x.c === 'DE').n, 'Allemagne'); assert.equal(ix.find(x => x.c === 'US').n, 'États-Unis');
    let total = 0; for (const f of fs.readdirSync(path.join(GEO, 'pays'))) total += fs.statSync(path.join(GEO, 'pays', f)).size;
    assert.ok(total < 4e6, `pays/ : ${total} octets`);
    assert.ok(fs.statSync(path.join(GEO, 'eu-nuts3.json.gz')).size < 250e3); assert.ok(fs.statSync(path.join(GEO, 'us-comtes.json.gz')).size < 450e3);
    const lic = fs.readFileSync(path.join(GEO, 'LICENCES.txt'), 'utf8'), head = fs.readFileSync(path.join(appRoot, 'scripts/build-geo-pays.js'), 'utf8').split('*/')[0];
    for (const w of ['pays/adm1-XX.json.gz', 'eu-nuts3.json.gz', 'us-comtes.json.gz', 'in the public domain', 'EuroGeographics for the administrative boundaries', '17 U.S.C.', 'CC BY-NC-SA']) assert.ok(lic.includes(w), `LICENCES.txt : ${w}`);
    for (const w of ['in the public domain', 'EuroGeographics for the administrative boundaries', '17 U.S.C.']) assert.ok(head.includes(w), `en-tête du script : ${w}`);
    const it = gz('pays/adm1-IT.json.gz'); assert.equal(it.cc, 'IT'); assert.ok(it.country.includes('italia') && it.country.includes('italy'));
});
step('l’Italie : ses 20 régions (noms français) d’abord, puis ses provinces ; seul son fichier est lu', async () => {
    asked.length = 0;
    const L = J(DC.levelOf({ map: 'pays', country: 'IT' })); assert.deepEqual(L, ['reg', 'reg-IT', 'Régions']);
    const { svg } = await draw('choropleth', { map: 'pays', country: 'IT', hoverAll: true }, { rows: [{ label: 'Lombardie', s0: 5 }, { label: 'Toscana', s0: 3 }, { label: 'Sicile', s0: 1 }, { label: 'Nulle part', s0: 2 }] });
    const reg = DC.loaded('reg-IT'); assert.equal(reg.zones.length, 20);
    for (const n of ['Lombardie', 'Toscane', 'Sicile', 'Sardaigne', 'Vénétie', 'Latium', 'Pouilles', 'Vallée d’Aoste']) assert.ok(reg.zones.some(z => z.name === n), n);
    assert.ok(titles(svg).includes('Lombardie : 5 — Naissances'), titles(svg).slice(0, 4).join(' | ')); assert.ok(titles(svg).includes('Toscane : 3 — Naissances'), 'nom italien reconnu');
    assert.match(svg, /Nulle part/, 'ligne pas trouvée signalée'); assert.match(svg, /Fond : Natural Earth \(domaine public\)/); assert.doesNotMatch(svg, /NaN|undefined|Infinity|data-geo-wait|\(r-/);
    const files = asked.filter(u => /data\/geo\//.test(u)); assert.ok(files.includes('assets/data/geo/pays/reg-IT.json.gz'));
    assert.ok(!files.some(u => /adm1-(?!IT)|reg-(?!IT)|us-comtes|eu-nuts3/.test(u)), files.join(', '));
    const pv = await draw('choropleth', { map: 'pays', country: 'IT', level: 'adm1' }, { rows: [{ label: 'Milano', s0: 4 }, { label: 'Florence', s0: 2 }, { label: 'IT-TO', s0: 1 }] });
    const ad = DC.loaded('adm1-IT'); assert.ok(ad.zones.length >= 100, `${ad.zones.length} provinces`);
    for (const [q, id] of [['Milano', 'IT-MI'], ['Milan', 'IT-MI'], ['Firenze', 'IT-FI'], ['Florence', 'IT-FI'], ['TO', 'IT-TO'], ['Nulle part', null]]) assert.equal(DC.matchZone(ad, q)?.id || null, id, q);
    assert.ok(titles(pv.svg).some(t => /^Milan \(IT-MI\) : 4/.test(t)), titles(pv.svg).filter(t => /Mil/.test(t)).join(' | '));
    assert.equal(ad.zones.find(z => z.id === 'IT-MI').parent, 'r-lombardia', 'province rattachée à sa région');
    const view = DC.viewOf({ map: 'pays', country: 'IT' }); assert.ok(view[0] > 5 && view[2] < 20 && view[1] > 35 && view[3] < 48, String(view));
    assert.equal(DC.autoProj(view), 'laea');
});
step('les comtés des États-Unis : 3 231, placés par coordonnées ou par « comté, État », homonymes départagés', async () => {
    const L = J(DC.paysLevels('US').map(x => x[0])); assert.deepEqual(L, ['adm1', 'reg', 'cty']);
    const { svg } = await draw('choropleth', { map: 'pays', country: 'US', level: 'cty' }, { rows: [{ label: 'Cook, Illinois', s0: 6 }, { label: 'Washington (OR)', s0: 2 }, { label: 'Los Angeles County', s0: 1 }] });
    const c = DC.loaded('us-comtes'); assert.equal(c.zones.length, 3231); assert.match(svg, /Fond : U\.S\. Census Bureau \(domaine public\)/);
    assert.ok(titles(svg).some(t => /^Cook \(17031\) : 6/.test(t)), 'Cook (Illinois)'); assert.ok(titles(svg).some(t => /^Washington \(41067\) : 2/.test(t)), 'Washington (Oregon)'); assert.ok(titles(svg).some(t => /^Los Angeles \(06037\) : 1/.test(t)));
    assert.equal(DC.zoneOfPlace(c, { lat: 41.8781, lon: -87.6298 }).id, '17031', 'Chicago → Cook');
    assert.equal(DC.zoneOfPlace(c, { lat: null, lon: null, county: 'Washington', state: 'Oregon', country: 'USA' }).id, '41067');
    assert.equal(DC.zoneOfPlace(c, { lat: null, lon: null, county: 'Cook', state: 'Illinois', country: 'France' }), null, 'un lieu d’un autre pays n’est pas pris par son nom');
    const st = await draw('choropleth', { map: 'pays', country: 'US' }, { rows: [{ label: 'Texas', s0: 3 }, { label: 'Californie', s0: 2 }, { label: 'NY', s0: 1 }] });
    assert.ok(['Texas : 3', 'Californie : 2', 'New York : 1'].every(x => titles(st.svg).some(t => t.includes(x.split(' : ')[0]) && t.includes(': ' + x.split(' : ')[1]))), titles(st.svg).filter(t => /:\s\d/.test(t)).join(' | '));
    const v = DC.viewOf({ map: 'pays', country: 'US' }); assert.ok(v[0] > -130 && v[2] < -60 && v[3] < 52, 'cadrage : les 48 États contigus');
});
step('NUTS 3 : l’Europe entière, un pays (Allemagne, Italie), les arrondissements belges', async () => {
    const { svg } = await draw('choropleth', { map: 'eu', level: 'nuts3' }, { rows: [{ label: 'Oberbayern', s0: 4 }, { label: 'DE212', s0: 2 }] }, 600);
    const eu = DC.loaded('eu-nuts3'); assert.ok(eu.zones.length > 1300, `${eu.zones.length} zones`); assert.match(svg, /© EuroGeographics/);
    assert.ok(titles(svg).some(t => /^Oberbayern \(DE21\d\)/.test(t)) || titles(svg).some(t => /DE212\) : 2/.test(t)), 'zone NUTS 3 colorée');
    const de = await draw('choropleth', { map: 'pays', country: 'DE', level: 'nuts3' }, { rows: [{ label: 'DE212', s0: 2 }] }, 600);
    const d3 = DC.loaded('nuts3-DE'); assert.equal(d3.zones.length, 400); assert.ok(d3.zones.every(z => /^DE/.test(z.id)), 'seulement l’Allemagne');
    assert.ok(titles(de.svg).some(t => /\(DE212\) : 2/.test(t))); assert.match(de.svg, /© EuroGeographics/);
    assert.equal(asked.filter(u => /eu-nuts3/.test(u)).length, 1, 'eu-nuts3 lu une seule fois, découpé par pays');
    await draw('choropleth', { map: 'pays', country: 'IT', level: 'nuts3' }, { rows: [] }, 400); assert.equal(DC.loaded('nuts3-IT').zones.length, 107);
    const be = await draw('choropleth', { map: 'be', level: 'nuts3' }, { rows: [{ label: 'Arr. Liège', s0: 1 }] }, 500); assert.ok(DC.loaded('nuts3-BE').zones.length >= 40); assert.doesNotMatch(be.svg, /NaN|data-geo-wait/);
    assert.deepEqual(J(DC.paysLevels('BR').map(x => x[0])), ['adm1'], 'pays sans NUTS : un seul niveau');
});
step('les points tombent dans la bonne région (coordonnées, sinon nom + pays)', async () => {
    const reg = await DC.load('reg-IT'), ad = await DC.load('adm1-IT');
    assert.equal(DC.zoneOfPlace(reg, { lat: 45.4642, lon: 9.19 }).name, 'Lombardie'); assert.equal(DC.zoneOfPlace(reg, { lat: 37.5079, lon: 15.083 }).name, 'Sicile');
    assert.equal(DC.zoneOfPlace(ad, { lat: null, lon: null, county: 'Firenze', country: 'Italia' }).id, 'IT-FI');
    assert.equal(DC.zoneOfPlace(ad, { lat: null, lon: null, county: 'Firenze', country: 'France' }), null);
    assert.equal(DC.zoneOfPlace(ad, { lat: 48.11, lon: -1.68, county: 'Ille-et-Vilaine', country: 'France' }), null, 'Rennes n’est pas en Italie');
    // un rond par région : Milan et Bergame dans la Lombardie, Palerme dans la Sicile
    const b = await draw('bubblemap', { map: 'pays', country: 'IT', byZone: true }, { rows: [{ label: 'Milan', s0: 3 }, { label: 'Bergame', s0: 2 }, { label: 'Palerme', s0: 1 }],
        places: { milan: { lat: 45.4642, lon: 9.19, n: 'Milan' }, bergame: { lat: 45.6983, lon: 9.6773, n: 'Bergame' }, palerme: { lat: 38.1157, lon: 13.3615, n: 'Palerme' } } });
    assert.ok(titles(b.svg).some(t => /^Lombardie : 5/.test(t)), titles(b.svg).join(' | ')); assert.ok(titles(b.svg).some(t => /^Sicile : 1/.test(t)));
    // la carte en points (« Partir des données ») : la carte du pays des points
    assert.deepEqual(J(await DC.mapForPoints([[9.19, 45.46], [11.25, 43.77], [12.5, 41.9]])), { map: 'pays', country: 'IT' });
    assert.deepEqual(J(await DC.mapForPoints([[-87.63, 41.88], [-118.24, 34.05]])), { map: 'pays', country: 'US' });
    assert.deepEqual(J(await DC.mapForPoints([[-1.68, 48.11], [2.35, 48.86]])), { map: 'fr' });
    assert.deepEqual(J(await DC.mapForPoints([[2.35, 48.86], [13.4, 52.52], [12.5, 41.9]])), { map: 'eu' });
    const dm = await draw('dotmap', { map: 'pays', country: 'IT' }, { rows: [{ label: 'Milan', date: '1850' }], places: { milan: { lat: 45.4642, lon: 9.19, n: 'Milan' } } }, 500);
    assert.match(dm.svg, /Fond : Natural Earth/); assert.doesNotMatch(dm.svg, /NaN|undefined|data-geo-wait/);
});
step('la Russie en Lambert conique, à 390 px sans NaN ; tous les raccourcis se dessinent', async () => {
    const ru = await draw('choropleth', { map: 'pays', country: 'RU' }, { rows: [{ label: 'Moscou', s0: 1 }] }, 390);
    assert.equal(DC.autoProj(DC.viewOf({ map: 'pays', country: 'RU' })), 'lambert'); assert.doesNotMatch(ru.svg, /NaN|Infinity|data-geo-wait/);
    for (const c of ['DE', 'ES', 'PT', 'GB', 'IE', 'NL', 'PL', 'AT', 'CA', 'DZ', 'MA', 'TN', 'AR', 'BR', 'AU', 'HR', 'JP']) {
        const { svg } = await draw('choropleth', { map: 'pays', country: c }, { rows: [] }, 390); assert.doesNotMatch(svg, /NaN|Infinity|data-geo-wait/, c); assert.ok((svg.match(/<path/g) || []).length >= 2, c);
    }
    const k = R.KINDS.choropleth.options, sp = { o: { map: 'pays', country: 'IT' } };
    assert.ok(k.some(o => o.k === 'country' && o.when(sp) && typeof o.groups === 'function' && o.search), 'case « Pays » avec recherche');
    const g = k.find(o => o.k === 'country').groups(sp); assert.equal(g[0][1][0][0], 'DE', 'raccourcis d’abord'); assert.ok(g[1][1].length > 150, 'puis tous les pays');
    const lv = k.filter(o => o.k === 'level' && o.when(sp)); assert.equal(lv.length, 1); assert.deepEqual(J(lv[0].choices.map(x => x[0])), ['reg', 'adm1', 'nuts3']);
    assert.ok(k.filter(o => o.k === 'frame' && o.when(sp)).length === 1);
});
step('« Je veux représenter… » : un pays nommé → la carte de ce pays', () => {
    const sb = { window: { LCNDA_EXT: { diagramRender: R, diagramCartes: DC } }, document: { getElementById: () => 1 }, console };
    vm.createContext(sb); vm.runInContext(fs.readFileSync(path.join(appRoot, 'assets/js/heritage-diagram-assistant.js'), 'utf8'), sb);
    const A = sb.window.LCNDA_EXT.diagramAssistant;
    assert.deepEqual(J(A.parse('D’où venaient mes ancêtres en Italie ?').map), { map: 'pays', country: 'IT' });
    assert.deepEqual(J(A.parse('les naissances aux États-Unis').map), { map: 'pays', country: 'US' });
    assert.deepEqual(J(A.parse('les naissances en Croatie').map), { map: 'pays', country: 'HR' });
    assert.equal(A.parse('les prénoms les plus donnés').map, undefined);
    const D = { people: [{ id: 1, f: 'Marco', l: 'Rossi', by: 1850, bp: 1 }, { id: 2, f: 'Anna', l: 'Rossi', by: 1852, bp: 1 }], places: { 1: ['Milano', 45.46, 9.19] }, couples: [], byId: new Map() };
    const r = A.suggest('Où sont nés mes ancêtres en Italie', D); const m = r.items.find(x => x.kind === 'bubblemap');
    assert.ok(m, r.message || 'carte proposée'); assert.equal(m.spec.o.map, 'pays'); assert.equal(m.spec.o.country, 'IT');
});

/* ── 2. Navigateur ── */
let chromium = null;
try { ({ chromium } = require('playwright')); } catch (_) { try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); } catch (__) { chromium = null; } }
const phpPath = findPhp([devBundledPhp()]);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-pays-'));
const envFor = d => ({ ...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1' });
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const SEED = String.raw`<?php
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->prepare("INSERT INTO persons(first_name,last_name,gender,is_start) VALUES('Moi','Rossi','male',1)")->execute();
echo 'ok';`;

(async () => {
    for (const [name, fn] of steps) { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } }
    if (!chromium || !phpPath) { console.log('— navigateur : Playwright ou PHP absent, partie sautée'); process.exit(failed ? 1 : 0); }
    fs.mkdirSync(path.join(tmp, 'media'), { recursive: true });
    const seedFile = path.join(tmp, 'seed.php'); fs.writeFileSync(seedFile, SEED);
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), seedFile], { cwd: appRoot, encoding: 'utf8', env: envFor(tmp) });
    if (r.status !== 0 || !/ok/.test(r.stdout)) { console.error(r.stderr || r.stdout); process.exit(1); }
    const port = await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env: envFor(tmp), stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    let browser = null;
    try {
        for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
        browser = await chromium.launch();
        const errors = [];
        const t = async (name, fn) => { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
        for (const [label, opts] of [['clair, 1280 px', { viewport: { width: 1280, height: 900 } }], ['sombre, 390 px', { viewport: { width: 390, height: 844 }, colorScheme: 'dark' }]]) {
            const ctx = await browser.newContext(opts), p = await ctx.newPage(), narrow = opts.viewport.width < 500;
            p.on('pageerror', e => errors.push(e.message));
            p.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(m.text()); });
            const asked2 = []; p.on('request', q => asked2.push(q.url()));
            const external = []; p.on('request', q => { if (!q.url().startsWith(base) && !/^(data|blob):/.test(q.url())) external.push(q.url()); });
            await p.goto(base);
            await p.waitForFunction(() => window.LCNDA_APP?.state && window.LCNDA_EXT?.diagramCartes && window.LCNDA_EXT?.openDiagramEditor, null, { timeout: 20000 });
            if (narrow) await p.evaluate(() => { document.documentElement.setAttribute('data-theme', 'dark'); });
            await p.waitForTimeout(400);
            await t(`aucun fichier des pays au démarrage (${label})`, async () => assert.equal(asked2.filter(u => /data\/geo\/(pays|eu-nuts3|us-comtes)/.test(u)).length, 0));
            await t(`réglages : « 🌍 Un autre pays… », recherche du pays, régions de l’Italie, source ↗ (${label})`, async () => {
                await p.evaluate(() => { window.__ed = window.LCNDA_EXT.openDiagramEditor(null, { kind: 'choropleth' }); });
                await p.waitForSelector('dialog.h-dg-dlg[open] [data-dg-preview] svg [data-geo-map]', { timeout: 20000 });
                await p.click('[data-dg-tab="opts"]');
                const maps = await p.$$eval('.h-dg-opts select[data-opt="map"] option', els => els.map(e => e.textContent));
                assert.deepEqual(maps.slice(0, 7), ['France', 'Belgique', 'Suisse', 'Luxembourg', 'Europe', 'Monde', '🌍 Un autre pays…']);
                assert.equal(asked2.filter(u => /data\/geo\/pays\/adm1|reg-/.test(u)).length, 0, 'pas encore de pays lu');
                await p.selectOption('.h-dg-opts select[data-opt="map"]', 'pays'); await p.waitForSelector('.h-dg-opts [data-opt-filter="country"]');
                const groups = await p.$$eval('.h-dg-opts select[data-opt="country"] optgroup', els => els.map(e => [e.label, e.children.length]));
                assert.equal(groups[0][1], 18, 'les 18 raccourcis');
                await p.fill('.h-dg-opts [data-opt-filter="country"]', 'ital'); await p.waitForTimeout(200);
                const opts2 = await p.$$eval('.h-dg-opts select[data-opt="country"] option', els => els.map(e => e.value));
                assert.ok(opts2.includes('IT') && opts2.length < 6, opts2.join(','));
                await p.press('.h-dg-opts [data-opt-filter="country"]', 'Enter');
                await p.waitForFunction(() => /Lombardie/.test(document.querySelector('[data-dg-preview]')?.innerHTML || '') && !document.querySelector('[data-dg-preview] [data-geo-wait]'), null, { timeout: 20000 });
                assert.equal(await p.$eval('.h-dg-opts select[data-opt="country"]', e => e.value), 'IT');
                const lv = await p.$$eval('.h-dg-opts select[data-opt="level"] option', els => els.map(e => e.value)); assert.deepEqual(lv, ['reg', 'adm1', 'nuts3']);
                const got = asked2.filter(u => /data\/geo\/(pays|eu-nuts3|us-comtes)/.test(u)).map(u => u.replace(/^.*data\/geo\//, '').split('?')[0]);
                assert.ok(got.includes('pays/reg-IT.json.gz') && got.includes('pays/index.json'), got.join(', ')); assert.ok(!got.some(u => /DE|US|us-comtes|eu-nuts3/.test(u)), 'seulement l’Italie : ' + got.join(', '));
                await p.waitForSelector('.dgm-src a', { timeout: 5000 });
                const src = await p.$eval('.dgm-src', e => ({ text: e.textContent, href: e.querySelector('a').href, target: e.querySelector('a').target }));
                assert.match(src.text, /Natural Earth ↗/); assert.match(src.href, /naturalearthdata\.com/); assert.equal(src.target, '_blank');
                assert.match(await p.$eval('[data-dg-preview]', e => e.innerHTML), /Fond : Natural Earth/);
                // les provinces, puis les États-Unis et leurs comtés
                await p.selectOption('.h-dg-opts select[data-opt="level"]', 'adm1');
                await p.waitForFunction(() => /Milan/.test(document.querySelector('[data-dg-preview]')?.innerHTML || '') && !document.querySelector('[data-dg-preview] [data-geo-wait]'), null, { timeout: 20000 });
                await p.selectOption('.h-dg-opts select[data-opt="country"]', 'US'); await p.waitForTimeout(300);
                await p.selectOption('.h-dg-opts select[data-opt="level"]', 'cty');
                await p.waitForFunction(() => /U\.S\. Census Bureau/.test(document.querySelector('[data-dg-preview]')?.innerHTML || '') && !document.querySelector('[data-dg-preview] [data-geo-wait]'), null, { timeout: 30000 });
                assert.match(await p.$eval('.dgm-src', e => e.textContent), /U\.S\. Census Bureau ↗/);
                assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'pas de défilement de côté');
                if (narrow) { const bg = await p.$eval('.dgm-src', e => getComputedStyle(e).color); assert.notEqual(bg, 'rgb(91, 100, 112)', 'mode sombre : texte éclairci'); }
                if (shots) { fs.mkdirSync(shots, { recursive: true }); await p.screenshot({ path: path.join(shots, `pays-${narrow ? '390-sombre' : '1280'}.png`) }); }
                assert.deepEqual(external, [], 'rien n’est demandé à Internet');
                await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => { d.close(); d.remove(); }));
            });
            await ctx.close();
        }
        await t('aucune erreur JavaScript', async () => assert.deepEqual(errors, []));
    } finally { if (browser) await browser.close(); proc.kill(); }
    process.exit(failed ? 1 : 0);
})();
