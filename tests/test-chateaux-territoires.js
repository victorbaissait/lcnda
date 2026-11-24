#!/usr/bin/env node
/* 🏰 Châteaux d'Europe et 👑 Territoires d'autrefois
 * (assets/js/heritage-chateaux-territoires.js, assets/data/chateaux/, assets/data/territoires/ ; scripts/chateaux-territoires/).
 *  1. données : tailles (< 15 Mo en tout), licences et sources ; le calcul (état, siècles, autour d'un point, territoire d'un lieu à une date) ;
 *  2. écran : fiche d'un village (🏰 châteaux, 👑 territoires + l'année), petite fiche d'un château, monographie (registre),
 *     fiche d'une personne (dans « 🗺 Pays à l'époque », une date d'avant 1816), Carte (« 👑 Territoires d'autrefois »),
 *     Réglages (une partie s'éteint, ↶), registres LCNDA_EXT.dataLists et dataSources.
 *   node tests/test-chateaux-territoires.js */
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const zlib = require('zlib');
const {spawn, spawnSync} = require('child_process');
let chromium; try { ({chromium} = require('playwright')); } catch (_) { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); }
const root = path.join(__dirname, '..');
const {findPhp, phpRuntimeArgs, devBundledPhp} = require('../electron/php-server.js');
const CT = require('../assets/js/heritage-chateaux-territoires.js');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const D = f => path.join(root, 'assets/data', f);
const gz = f => JSON.parse(zlib.gunzipSync(fs.readFileSync(D(f))));

(async () => {
    const idx = JSON.parse(fs.readFileSync(D('chateaux/index.json'), 'utf8'));
    const terrRaw = gz('territoires/territoires-europe.json.gz'), shapesRaw = gz('territoires/territoires-contours.json.gz'), mapsRaw = gz('territoires/territoires-cartes.json.gz');
    const ctx = {terr: CT.prepareTerr(terrRaw), shapes: CT.prepareShapes(shapesRaw), maps: CT.prepareMaps(mapsRaw)};
    const files = Object.keys(idx.countries).map(c => gz(`chateaux/chateaux-${c}.json.gz`));

    /* ═════════ 1. les données et le calcul ═════════ */
    await t('données : tailles (tout < 15 Mo), licences et sources', async () => {
        let total = fs.statSync(D('chateaux/index.json')).size;
        for (const c of Object.keys(idx.countries)) total += fs.statSync(D(`chateaux/chateaux-${c}.json.gz`)).size;
        for (const f of ['territoires-europe', 'territoires-contours', 'territoires-cartes']) total += fs.statSync(D(`territoires/${f}.json.gz`)).size;
        assert.ok(total < 15e6, `${total} octets`);
        assert.strictEqual(idx.licence, 'CC0 1.0'); assert.strictEqual(terrRaw.licence, 'CC0 1.0');
        assert.strictEqual(mapsRaw.licence, 'GPL-3.0'); assert.match(mapsRaw.url, /github\.com\/aourednik\/historical-basemaps/);
        for (const s of shapesRaw.shapes) assert.match(s.licence.toLowerCase(), /^(cc0|public domain|cc-by|cc by|odbl)/, s.file);
        assert.ok(idx.total > 50000, `châteaux : ${idx.total}`);
        assert.ok(['FR', 'DE', 'IT', 'ES', 'GB'].every(c => idx.countries[c]?.n > 1000));
        assert.ok(terrRaw.items.length > 1000, `territoires : ${terrRaw.items.length}`);
        assert.ok(mapsRaw.years.includes(1700) && mapsRaw.years.includes(1815) && !mapsRaw.years.some(y => y >= 1816));
    });
    await t('châteaux : état, siècles, ligne de liste', async () => {
        assert.strictEqual(CT.condition({k: 'r'}), 'ruine');
        assert.strictEqual(CT.condition({k: 'c', y1: 1793}), 'disparu');
        assert.strictEqual(CT.condition({k: 'c', st: 'restauré'}), 'restauré');
        assert.strictEqual(CT.condition({k: 'h'}), 'non précisé');
        assert.deepStrictEqual(CT.centuries({y0: 1250, y1: 1450}), ['XIIIe s.', 'XIVe s.', 'XVe s.']);
        const lu = files.find(f => f.country === 'LU');
        const v = lu.items.find(c => /Vianden/.test(c.n));
        assert.ok(v, 'château de Vianden'); const r = CT.castleRow(v, 'LU');
        assert.strictEqual(r.country, 'Luxembourg'); assert.strictEqual(r.commune, 'Vianden'); assert.match(r.wikidata, /^https:\/\/www\.wikidata\.org\/wiki\/Q\d+$/);
        for (const k of ['name', 'commune', 'region', 'country', 'type', 'state', 'from', 'to', 'centuries', 'owners', 'protection', 'visit', 'photo']) assert.ok(k in r, k);
    });
    await t('châteaux autour d’un point : Vianden à moins de 2 km ; pays voisins pris en compte', async () => {
        const near = CT.castlesNear(files, 49.935, 6.2077, 2);
        assert.ok(near.some(x => /Vianden/.test(x.c.n)), near.map(x => x.c.n).join(', '));
        const codes = CT.countriesNear(idx, 49.935, 6.2077, 20);
        assert.ok(codes.includes('LU') && codes.includes('DE'), codes.join(','));
        assert.ok(near.every((x, i, a) => !i || a[i - 1].d <= x.d));
    });
    await t('territoires : Paris 1700 et Strasbourg 1650 sur les cartes anciennes ; après 1815 : rien (CShapes)', async () => {
        const p = CT.snapAt(ctx.maps, 1700, 48.8566, 2.3522); assert.ok(p && /France/.test(p.name), JSON.stringify(p)); assert.strictEqual(p.year, 1700);
        const s = CT.snapAt(ctx.maps, 1650, 48.5734, 7.7521); assert.ok(s && s.name && !/^France$/.test(s.name), JSON.stringify(s));
        assert.strictEqual(CT.snapYear(ctx.maps, 1750), 1715); assert.strictEqual(CT.snapYear(ctx.maps, 1820), null);
        assert.strictEqual(CT.snapAt(ctx.maps, 1700, 45, -20), null, 'en pleine mer');
    });
    await t('territoires Wikidata : dates, sorte, capitale ; active() ; ligne de liste', async () => {
        const hre = ctx.terr.items.find(it => it.q === 'Q12548');
        assert.ok(hre, 'Saint-Empire romain germanique'); assert.ok(CT.active(hre, 1700)); assert.ok(!CT.active(hre, 1810));
        const r = CT.terrRow(hre, ctx.terr); assert.ok(r.capital || r.kind); assert.strictEqual(r.from, hre.y0);
        assert.ok(ctx.terr.items.some(it => it.k === 'eveche') && ctx.terr.items.some(it => it.k === 'ville-libre') && ctx.terr.items.some(it => it.k === 'seigneurie'));
        const res = CT.placeAt(ctx, 48.6921, 6.1844, 1700); assert.ok(res.any, 'Nancy en 1700');
    });

    /* ═════════ 2. l'écran ═════════ */
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-ct-'));
    fs.mkdirSync(path.join(tmp, 'media'), {recursive: true});
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4', GENEALOGY_TEST: '1'};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start) VALUES(1,'Jean','MAZAUD','male','deceased',1),(2,'Marie','LACOMBE','female','deceased',0),(3,'Paul','DURAND','male','deceased',0)");
$pdo->exec("INSERT INTO places(id,name,county,country,latitude,longitude) VALUES(1,'Vianden','Vianden','Luxembourg',49.935,6.2077),(2,'Nancy','Meurthe-et-Moselle','France',48.6921,6.1844)");
$t = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn();
$ins = $pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,date_text,year,sort_date,place_id) VALUES('person',?,?,?,?,?,?)");
$ins->execute([1,$t('BIRT'),'3 mai 1702',1702,'1702-05-03',2]); $ins->execute([1,$t('DEAT'),'2 juin 1761',1761,'1761-06-02',1]);
$ins->execute([2,$t('BIRT'),'1705',1705,'1705',1]); $ins->execute([3,$t('BIRT'),'1880',1880,'1880',2]);
echo json_encode(['ok' => 1]);`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0 || !/"ok"/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const errs = [];
    try {
        const ctxB = await browser.newContext({viewport: {width: 1440, height: 900}});
        await ctxB.route(/commons\.wikimedia\.org|wikipedia\.org|wikidata\.org|tile|openstreetmap/, r => r.abort()); // pas d'Internet dans l'essai
        const p = await ctxB.newPage();
        p.on('pageerror', e => errs.push(e.message));
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_APP?.defaultPersonBlocks, null, {timeout: 30000});
        // index.php ne charge pas encore ces fichiers : on les ajoute (comme le feront les balises)
        for (const f of ['heritage-monographie-plus.js', 'heritage-monde-contexte.js']) if (!(await p.evaluate(n => !!document.querySelector(`script[src*="${n}"]`), f))) await p.addScriptTag({url: base + 'assets/js/' + f});
        if (!(await p.evaluate(() => !!window.LCNDA_EXT?.chateauxTerritoires))) { await p.addStyleTag({url: base + 'assets/css/chateaux-territoires.css'}); await p.addScriptTag({url: base + 'assets/js/heritage-chateaux-territoires.js'}); }
        const toastWith = async re => p.waitForFunction(s => [...document.querySelectorAll('.ui-toast, .toast')].some(x => new RegExp(s).test(x.textContent)), re.source, {timeout: 10000});

        await t('registres : dataLists (châteaux, territoires) et dataSources ; les lignes ont les champs annoncés', async () => {
            const r = await p.evaluate(async () => {
                const L = window.LCNDA_EXT.dataLists, c = L.find(x => x.id === 'chateaux'), tr = L.find(x => x.id === 'territoires');
                const rows = await c.load(), trs = await tr.load();
                const v = rows.find(x => /Vianden/.test(x.name));
                return {n: rows.length, keys: c.fields.map(f => f.key).filter(k => !(k in rows[0])), geo: c.geo(v), per: c.period(v), tn: trs.length, tkeys: tr.fields.map(f => f.key).filter(k => !(k in trs[0])),
                    ds: window.LCNDA_EXT.dataSources.filter(d => /^(chateaux_autour|territoire_lieu|territoires_annee)$/.test(d.id)).length, ms: window.LCNDA_EXT.monographSections.filter(s => /^(chateaux|territoires)$/.test(s.id)).length};
            });
            assert.ok(r.n > 50000); assert.deepStrictEqual(r.keys, []); assert.deepStrictEqual(r.tkeys, []); assert.ok(r.tn > 1000);
            assert.ok(Array.isArray(r.geo) && Math.abs(r.geo[0] - 49.93) < 0.1); assert.ok(Array.isArray(r.per));
            assert.strictEqual(r.ds, 3); assert.strictEqual(r.ms, 2);
        });
        await t('fiche d’un village (Vianden) : 🏰 châteaux et 👑 territoires ; l’année change la réponse ; petite fiche d’un château', async () => {
            const key = await p.evaluate(async () => (await window.LCNDA_APP.api('villages', {q: 'Vianden'})).villages[0].key);
            await p.evaluate(k => { const A = window.LCNDA_APP; A.state.listType = 'villages'; A.state.hVillage = k; A.setModule('listes'); }, key);
            await p.waitForSelector('.h-village [data-ct-part="castles"] .ct-list', {timeout: 30000});
            const txt = await p.textContent('[data-ct-part="castles"]'); assert.match(txt, /Vianden/); assert.match(txt, /Wikidata \(CC0\)/);
            await p.waitForSelector('[data-ct-part="terr"] [data-ct-year]', {timeout: 30000});
            await p.fill('[data-ct-part="terr"] [data-ct-year]', '1700'); await p.dispatchEvent('[data-ct-part="terr"] [data-ct-year]', 'change');
            await p.waitForFunction(() => /carte de 1700/.test(document.querySelector('[data-ct-part="terr"] .ct-answer')?.textContent || ''), null, {timeout: 10000});
            assert.strictEqual(JSON.parse(await p.evaluate(() => localStorage.getItem('genealogie-chateaux-territoires'))).year, 1700);
            await p.click('[data-ct-part="castles"] [data-ct-castle]');
            await p.waitForSelector('dialog.ct-dlg[open] .ct-card', {timeout: 10000});
            assert.match(await p.textContent('dialog.ct-dlg'), /Source : Wikidata \(CC0\)/);
            await p.click('dialog.ct-dlg [data-ct-close]');
        });
        await t('fiche d’une personne : dans « 🗺 Pays à l’époque », la naissance de 1702 à Nancy reçoit son territoire (pas de second bloc)', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.currentPersonId = 1; A.setModule('personnes'); });
            await p.waitForSelector('[data-mc-host="1"] .mc-rows li.ct-done', {timeout: 30000});
            const li = await p.$$eval('[data-mc-host="1"] .mc-rows li', n => n.map(x => x.textContent.replace(/\s+/g, ' ')));
            const nancy = li.find(x => /Nancy/.test(x)); assert.ok(nancy && /carte de 1700/.test(nancy) && !/trop tôt/.test(nancy), nancy);
            assert.match(await p.textContent('[data-mc-host="1"]'), /historical-basemaps/);
        });
        await t('Carte : « 👑 Territoires d’autrefois » en 1700 dessine les territoires et la légende ; le réglage est gardé', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.mapMode = 'standard'; A.state.mapCenter = {lat: 48.7, lon: 6.2}; A.state.mapZoom = 6; A.setModule('carte'); });
            await p.waitForSelector('[data-ct-layer]', {timeout: 30000});
            await p.fill('[data-ct-myear]', '1700'); await p.dispatchEvent('[data-ct-myear]', 'change');
            await p.check('[data-ct-layer]'); console.log('DBG', await p.evaluate(() => JSON.stringify({n: document.querySelectorAll('[data-ct-layer]').length, setups: window.LCNDA_EXT.mapSetup.length, s: localStorage.getItem('genealogie-chateaux-territoires')})));
            await p.waitForFunction(() => document.querySelectorAll('#ct-layer path.ct-snap').length > 5, null, {timeout: 30000}).catch(async e => { console.log(await p.evaluate(() => JSON.stringify({s: localStorage.getItem('genealogie-chateaux-territoires'), svg: document.querySelector('#ct-layer svg')?.innerHTML.slice(0, 300), mode: window.LCNDA_APP.state.mapMode, dm: typeof window.LCNDA_APP.drawMap, chk: document.querySelector('[data-ct-layer]').checked}))); throw e; });
            assert.match(await p.textContent('#ct-layer .ct-cap'), /carte de 1700.*GPL-3\.0/);
            assert.ok(await p.$$eval('#ct-layer text', n => n.some(x => /France/.test(x.textContent))));
            const s = JSON.parse(await p.evaluate(() => localStorage.getItem('genealogie-chateaux-territoires'))); assert.strictEqual(s.layer, true); assert.strictEqual(s.year, 1700);
        });
        await t('Réglages : « 🏰 Châteaux et territoires » ; éteindre les châteaux du village, ↶ Annuler', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'chateaux_territoires'; A.setModule('maintenance'); });
            await p.waitForSelector('[data-ct-settings] [data-ct-tg="place_castles"] input', {timeout: 30000});
            assert.match(await p.textContent('[data-ct-settings]'), /GPL-3\.0/);
            await p.uncheck('[data-ct-tg="place_castles"] input');
            assert.strictEqual(JSON.parse(await p.evaluate(() => localStorage.getItem('genealogie-chateaux-territoires'))).place_castles, false);
            await toastWith(/Partie masquée/);
            await p.click('.ui-toast button:has-text("Annuler"), .toast button:has-text("Annuler")');
            await p.waitForFunction(() => JSON.parse(localStorage.getItem('genealogie-chateaux-territoires')).place_castles === true, null, {timeout: 10000});
        });
        assert.deepStrictEqual(errs.filter(e => !/net::|Failed to fetch|NetworkError/.test(e)), []);
    } catch (e) { fails++; console.log('✗ ' + (e.stack || e)); } finally { await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true}); }
    console.log(fails ? `${fails} essai(s) raté(s)` : 'Tout est bon.');
    process.exit(fails ? 1 : 0);
})();
