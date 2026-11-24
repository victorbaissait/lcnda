#!/usr/bin/env node
/* 🌍 Météo d'autrefois : les packs du monde (NOAA GHCN-Daily, un par continent).
 *  0. le fabricant hors ligne (scripts/meteo/build-meteo.py monde --hors-ligne tests/fixtures/meteo/monde : de VRAIES lignes de
 *     GHCN-Daily, 1950–1951, pour quelques stations) : six packs, les stations du bon continent, deux stations au même endroit →
 *     une seule, l'Allemagne (pack Europe : DWD) et Milan (déjà prise par le pack Europe) laissées de côté, neige et phénomènes lus ;
 *  1. serveur (le « serveur » des données est un dossier local : GENEALOGY_TEST=1 + LCNDA_TEST_METEO_DIR) : les six packs au
 *     sommaire, installés en un bouton, puis la météo d'un lieu n'importe où dans le monde : la station (New York, Sydney…),
 *     jusqu'à 150 km quand il n'y a rien de plus près, rien au-delà ; une station d'un pack du monde à moins de 3 km d'une station
 *     d'un autre pack est sautée ;
 *  2. Réglages → 🌦 Météo d'autrefois : « Le reste du monde », chaque continent son « ⤓ Installer (taille) », installé, À propos,
 *     🗑 Supprimer et ↶ ; à 390 px sans défilement de côté ; aucune erreur JavaScript.
 *   node tests/test-meteo-monde.js */
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const crypto = require('crypto');
const {spawn, spawnSync} = require('child_process');
let chromium; try { ({chromium} = require('playwright')); } catch (_) { try { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); } catch (_) { chromium = null; } }
const root = path.join(__dirname, '..');
const {findPhp, phpRuntimeArgs, devBundledPhp} = require('../electron/php-server.js');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const KINDS = ['monde-amerique-nord', 'monde-amerique-sud', 'monde-afrique', 'monde-asie', 'monde-oceanie', 'monde-europe'];
const py = (code, ...args) => { const r = spawnSync('python3', ['-c', code, ...args], {encoding: 'utf8'}); if (r.status !== 0) throw new Error(r.stderr || r.stdout); return JSON.parse(r.stdout); };

(async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-meteomonde-')), out = path.join(tmp, 'out'), site = path.join(tmp, 'site'), fx = path.join(tmp, 'fx');
    [path.join(tmp, 'media'), site].forEach(d => fs.mkdirSync(d, {recursive: true}));
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    let proc = null, browser = null;
    try {
        // ── 0. le fabricant, hors ligne ──
        await t('fabricant : « build-meteo.py monde » hors ligne → six packs, chaque station dans son continent', async () => {
            const r = spawnSync('python3', [path.join(root, 'scripts/meteo/build-meteo.py'), 'monde', '--hors-ligne', path.join(root, 'tests/fixtures/meteo/monde'), '--dossier', out], {encoding: 'utf8'});
            assert.strictEqual(r.status, 0, r.stdout + r.stderr);
            for (const k of KINDS) assert.ok(fs.existsSync(path.join(out, `meteo-pack-${k}.lcmeteo`)), k);
            assert.strictEqual(fs.readdirSync(path.join(root, 'tests/fixtures/meteo/monde')).length, 11, 'hors ligne : les fichiers d’essai ne sont pas effacés');
            const codes = py(`import sqlite3, json, sys
o = {}
for k in sys.argv[2:]:
    d = sqlite3.connect(sys.argv[1] + '/meteo-' + k + '.sqlite')
    o[k] = {'codes': [r[0] for r in d.execute('SELECT code FROM stations ORDER BY code')], 'meta': dict(d.execute('SELECT key, value FROM meta')),
            'src': [r[0] for r in d.execute('SELECT id FROM sources')], 'pays': sorted({r[0] for r in d.execute('SELECT pays FROM stations')})}
print(json.dumps(o))`, out, ...KINDS);
            assert.deepStrictEqual(codes['monde-amerique-nord'].codes, ['CAN06158350', 'USW00094728'], 'Toronto et Toronto City au même endroit : une seule');
            assert.deepStrictEqual(codes['monde-amerique-nord'].pays, ['CA', 'US'], 'pays en code ISO (CA = Canada)');
            assert.deepStrictEqual(codes['monde-amerique-sud'].codes, ['AR000875850']);
            assert.deepStrictEqual(codes['monde-afrique'].codes, ['AG000060390']); assert.deepStrictEqual(codes['monde-afrique'].pays, ['DZ']);
            assert.deepStrictEqual(codes['monde-asie'].codes, ['JA000047662']); assert.deepStrictEqual(codes['monde-asie'].pays, ['JP']);
            assert.deepStrictEqual(codes['monde-oceanie'].codes, ['ASN00066062']); assert.deepStrictEqual(codes['monde-oceanie'].pays, ['AU']);
            assert.deepStrictEqual(codes['monde-europe'].codes, ['AU000005901'], 'Wien ; pas Potsdam (DWD, pack Europe) ni Milan (déjà dans le pack Europe)');
            assert.deepStrictEqual(codes['monde-europe'].pays, ['AT']);
            for (const k of KINDS) { assert.strictEqual(codes[k].meta.kind, k); assert.deepStrictEqual(codes[k].src, ['ghcn']); }
        });
        await t('fabricant : les valeurs relues (New York, 1er janvier 1951 : −2,2 / 3,9 °C) ; neige tombée et phénomènes', async () => {
            const v = py(`import sqlite3, json, sys
sys.path.insert(0, sys.argv[2])
import meteo_format as F
d = sqlite3.connect(sys.argv[1] + '/meteo-monde-amerique-nord.sqlite')
b = d.execute("SELECT blob FROM daily WHERE annee=1951 AND station_id=(SELECT id FROM stations WHERE code='USW00094728')").fetchone()[0]
s, v = F.decode(b)
print(json.dumps({k: c[:1] for k, c in v.items()} | {'ww': sum(1 for x in v.get('WW', []) if x)}))`, out, path.join(root, 'scripts/meteo'));
            assert.deepStrictEqual([v.TN[0], v.TX[0], v.RR[0]], [-22, 39, 0], 'en dixièmes, comme le fichier GHCN (TMIN −22, TMAX 39)');
            assert.ok(v.ww > 0, 'des jours avec un phénomène (WT** : brouillard, orage…)');
        });
        await t('fabricant : le choix des stations (plus longues séries, bien réparties ; la Russie coupée à l’Oural)', async () => {
            const v = py(`import importlib.util, json, sys
spec = importlib.util.spec_from_file_location('B', sys.argv[1]); B = importlib.util.module_from_spec(spec); spec.loader.exec_module(B)
rows = [('A', 'US', 40.0, -74.0, 150, 1869), ('B', 'US', 40.1, -74.0, 120, 1900), ('C', 'US', 42.0, -74.0, 60, 1960), ('D', 'US', 40.05, -74.05, 30, 1990)]
print(json.dumps({'spread': B.select_spread(rows, 2, 50), 'all': B.select_spread(rows, 4, 50), 'ru': [B.ghcn_region('RSM00027612', 37.6), B.ghcn_region('RSM00030710', 104.3)],
    'skip': [B.ghcn_region('FR000007150', 2.3), B.ghcn_region('GM000003342', 13.0), B.ghcn_region('SZ000006717', 7.0)], 'us': B.ghcn_region('USW00094728', -74.0)}))`, path.join(root, 'scripts/meteo/build-meteo.py'));
            assert.deepStrictEqual(v.spread, ['A', 'C'], 'B est à 11 km de A : C passe avant');
            assert.deepStrictEqual(v.all, ['A', 'C', 'B', 'D'], 'la distance baisse quand il en manque');
            assert.deepStrictEqual(v.ru, ['europe', 'asie']); assert.deepStrictEqual(v.skip, [null, null, null]); assert.strictEqual(v.us, 'amerique-nord');
        });

        // ── 1. le serveur : six packs en ligne, installés, et la météo d'un lieu du monde ──
        const mk = spawnSync('python3', [path.join(root, 'scripts/meteo/make-fixture.py'), fx], {encoding: 'utf8'});  // le socle d'essai (Gers, Genève…)
        if (mk.status !== 0) throw new Error(mk.stderr || mk.stdout);
        // un pack du monde d'essai (fabriqué) : une station à 1 km de Genève – Cointrin du socle (la même) et une à 100 km
        spawnSync('python3', ['-c', `import sys, datetime
sys.path.insert(0, sys.argv[1])
import meteo_format as F
db = F.open_db(sys.argv[2], 'monde-europe', 'Europe (hors pack Europe)')
F.add_sources(db, ['ghcn'], 2025)
for sid, code, nom, lat, lon in ((1, 'SZX00000001', 'Geneve Double', 46.2565, 6.1278), (2, 'SZX00000002', 'Loin Cent', 47.15, 6.1278)):
    db.execute('INSERT INTO stations(id, source, code, nom, pays, lat, lon, alt, debut, fin) VALUES(?,?,?,?,?,?,?,?,?,?)', (sid, 'ghcn', code, nom, 'CH', lat, lon, 400, 1980, 1980))
    db.execute('INSERT INTO daily(station_id, annee, blob) VALUES(?,?,?)', (sid, 1980, F.encode([('TN', [10 * sid] * 366), ('TX', [100 + sid] * 366)])))
db.commit(); db.close()
F.wrap_pack(sys.argv[2], sys.argv[3])`, path.join(root, 'scripts/meteo'), path.join(tmp, 'dup.sqlite'), path.join(tmp, 'meteo-pack-dup.lcmeteo')], {encoding: 'utf8'});
        const packs = {};
        for (const k of KINDS) {
            const buf = fs.readFileSync(path.join(out, `meteo-pack-${k}.lcmeteo`));
            const half = Math.floor(buf.length / 2), names = [`meteo-pack-${k}.lcmeteo.000`, `meteo-pack-${k}.lcmeteo.001`];
            fs.writeFileSync(path.join(site, names[0]), buf.subarray(0, half)); fs.writeFileSync(path.join(site, names[1]), buf.subarray(half));
            packs[k] = {size: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex'), built: '2026-11-24', parts: [{name: names[0], size: half}, {name: names[1], size: buf.length - half}]};
        }
        fs.writeFileSync(path.join(site, 'meteo-manifest.json'), JSON.stringify({version: '2026-11', packs}));
        const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4', GENEALOGY_TEST: '1', LCNDA_TEST_METEO_DIR: site, LCNDA_METEO_DIR: fx};
        const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start) VALUES(1,'Jean','MAZAUD','male','deceased',1),(2,'Marie','LACOMBE','female','deceased',0),(3,'Paul','DURAND','male','deceased',0)");
echo json_encode(['ok' => 1]);`], {cwd: root, encoding: 'utf8', env});
        if (seed.status !== 0 || !/"ok"/.test(seed.stdout)) throw new Error(seed.stderr || seed.stdout);
        const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
        proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
        const base = `http://127.0.0.1:${port}/`;
        for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
        if (!chromium) { console.log('— Playwright absent : la suite est sautée'); return; }
        browser = await chromium.launch();
        const errs = [];
        const p = await (await browser.newContext({viewport: {width: 1440, height: 900}})).newPage();
        p.on('pageerror', e => errs.push(e.message));
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_EXT?.meteoDl && window.LCNDA_APP?.state?.csrf, null, {timeout: 30000});
        const api = (x, q = {}) => p.evaluate(([y, z]) => window.LCNDA_APP.api(y, z).catch(e => ({error: e.message})), [x, q]);
        const post = (a, b) => p.evaluate(async ([x, y]) => { try { const r = await window.LCNDA_APP.api(x, {}, {method: 'POST', body: y}); return r.result || r; } catch (e) { return {error: e.message}; } }, [a, b]);
        const install = async k => { const s = await post('meteo_dl_start', {kind: k}); assert.ok(s.id, JSON.stringify(s)); for (let i = 0; i < 5; i++) { if ((await post('meteo_dl_step', {id: s.id})).done) break; } const f = await post('meteo_pack_finish', {id: s.id}); assert.strictEqual(f.kind, k, JSON.stringify(f)); return f; };
        const at = async (lat, lon, date) => (await api('meteo_point', {lat, lon, date, detail: '0'})).result;

        await t('serveur : les six packs du monde au sommaire, chacun sa taille', async () => {
            const r = await api('meteo_dl_info');
            assert.deepStrictEqual(Object.keys(r.packs).sort(), [...KINDS].sort());
            for (const k of KINDS) assert.strictEqual(r.packs[k].size, packs[k].size);
        });
        await t('serveur : avant, New York n’a pas de météo (hors des données installées)', async () => {
            const r = await at(40.7789, -73.9692, '1951-01-01');
            assert.strictEqual(r.ok, false); assert.strictEqual(r.why, 'out');
        });
        await t('serveur : installé en un bouton → New York (Central Park) le 1er janvier 1951 : −2,2 / 3,9 °C, mesuré, source GHCN', async () => {
            const f = await install('monde-amerique-nord'); assert.strictEqual(f.stations, 2);
            const r = await at(40.78, -73.97, '1951-01-01');
            assert.strictEqual(r.ok, true, JSON.stringify(r)); assert.strictEqual(r.reliability, 'measured');
            assert.deepStrictEqual([r.day.tn, r.day.tx], [-2.2, 3.9]); assert.strictEqual(r.station.country, 'US');
            assert.deepStrictEqual(r.sources.map(x => x.id), ['ghcn']); assert.match(r.sources[0].mention, /GHCN-Daily/);
            const st = await api('meteo_status'); assert.ok(st.files['monde-amerique-nord'].ok); assert.deepStrictEqual(st.files['monde-amerique-nord'].station_countries, ['CA', 'US']);
        });
        await t('serveur : Philadelphie (≈ 130 km) → « Station à 130 km », la pluie de la région ; Washington (≈ 330 km) → rien', async () => {
            const r = await at(39.9526, -75.1652, '1951-01-01');
            assert.strictEqual(r.ok, true, JSON.stringify(r)); assert.strictEqual(r.reliability, 'station'); assert.strictEqual(r.regional_rain, true);
            assert.ok(r.station.km > 120 && r.station.km < 140, String(r.station.km));
            const w = await at(38.9, -77.03, '1951-01-01'); assert.strictEqual(w.ok, false);
            const old = await at(40.78, -73.97, '1850-06-01'); assert.strictEqual(old.ok, false); assert.deepStrictEqual([old.why, old.first?.year], ['far', 1950], 'avant la première année du pack');
        });
        await t('serveur : un lieu de chaque continent (Buenos Aires, Alger, Tokyo, Sydney, Vienne)', async () => {
            for (const k of KINDS.slice(1)) await install(k);
            for (const [lat, lon, src] of [[-34.6, -58.4, 'AR'], [36.75, 3.06, 'DZ'], [35.68, 139.76, 'JP'], [-33.87, 151.2, 'AU'], [48.21, 16.37, 'AT']]) {
                const r = await at(lat, lon, '1951-07-15');
                assert.strictEqual(r.ok, true, `${src} ${JSON.stringify(r)}`); assert.strictEqual(r.station.country, src); assert.ok(r.day.tx !== undefined || r.day.tn !== undefined);
            }
        });
        await t('serveur : le socle (Gers, Genève) marche comme avant ; une station d’un pack du monde à 1 km d’une du socle est sautée', async () => {
            const g = await at(43.646, 0.586, '1978-02-03'); assert.strictEqual(g.ok, true); assert.strictEqual(g.station.source, 'meteofrance');
            // le pack « Europe (hors pack Europe) » remplacé par l'essai fabriqué : un double de Genève – Cointrin à 1 km, et une station à 100 km
            fs.copyFileSync(path.join(tmp, 'dup.sqlite'), path.join(tmp, 'meteo', 'meteo-monde-europe.sqlite'));
            const near = await at(46.2565, 6.1278, '1980-03-01');
            assert.strictEqual(near.station.source, 'meteoswiss', 'le double (ghcn, 0 km) est sauté : Genève – Cointrin (1 km)');
            const far = await at(47.15, 6.1278, '1980-03-01');
            assert.strictEqual(far.ok, true); assert.strictEqual(far.station.name, 'Loin Cent'); assert.strictEqual(far.reliability, 'measured');
            const between = await at(46.7, 6.1278, '1980-03-01');
            assert.ok(between.ok, 'à ≈ 50 km de chacune : la plus proche des deux, ou le carreau ERA5 / 20CR du socle');
        });

        // ── 2. les réglages ──
        await t('Réglages → 🌦 Météo : « Le reste du monde », chaque continent installé, puis 🗑 Supprimer et ↶ Annuler', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'meteo'; A.setModule('maintenance'); });
            await p.waitForSelector('.wx-data-head', {timeout: 20000});
            assert.match(await p.textContent('.wx-data-head'), /Le reste du monde/);
            const rows = await p.$$eval('.wx-world', els => els.map(e => e.textContent));
            assert.strictEqual(rows.length, 6);
            for (const name of ['Amérique du Nord', 'Amérique du Sud', 'Afrique', 'Asie', 'Océanie', 'Europe (hors pack Europe)']) assert.ok(rows.some(r => r.includes(name)), name);
            assert.ok(rows.every(r => /Installé/.test(r)), 'les six sont installés');
            assert.ok(rows.some(r => /2 pays/.test(r)), 'Amérique du Nord : 2 pays');
            await p.click('[data-wx-remove="monde-asie"]');
            await p.waitForFunction(() => /supprimé/.test([...document.querySelectorAll('.ui-toast')].map(x => x.textContent).join(' ')), null, {timeout: 10000});
            assert.ok(!(await api('meteo_status')).files['monde-asie'], 'retiré');
            await p.waitForSelector('[data-wx-dl="monde-asie"]', {timeout: 10000});
            assert.match(await p.textContent('[data-wx-dl="monde-asie"]'), /Installer \(\d+ Ko\)/, 'son « ⤓ Installer » avec la taille');
            await p.evaluate(() => [...document.querySelectorAll('.ui-toast')].reverse().find(x => /supprimé/.test(x.textContent)).querySelector('button').click()); await sleep(800);
            assert.ok((await api('meteo_status')).files['monde-asie']?.ok, '↶ Annuler : remis');
        });
        await t('Réglages : « ⤓ Installer » d’un continent en un clic (barre, puis installé)', async () => {
            await post('meteo_pack_remove', {kind: 'monde-oceanie'});
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'meteo'; A.setModule('maintenance'); });
            await p.waitForSelector('[data-wx-dl="monde-oceanie"]', {timeout: 20000});
            await p.click('[data-wx-dl="monde-oceanie"]');
            await p.waitForFunction(() => /Océanie installé/.test([...document.querySelectorAll('.ui-toast')].map(x => x.textContent).join(' ')), null, {timeout: 30000});
            assert.ok((await api('meteo_status')).files['monde-oceanie']?.ok);
        });
        await t('À propos des données : GHCN-Daily dit les packs du monde', async () => {
            const a = await api('meteo_about'); const g = a.sources.find(x => x.id === 'ghcn');
            assert.match(g.in, /Packs du monde/); assert.ok(g.installed.includes('monde-amerique-nord'));
        });
        await t('à 390 px : pas de défilement de côté', async () => {
            await p.setViewportSize({width: 390, height: 800}); await sleep(300);
            assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
        });
        await t('aucune erreur JavaScript', async () => { assert.deepStrictEqual(errs, []); });
    } finally { if (browser) await browser.close(); if (proc) proc.kill(); fs.rmSync(tmp, {recursive: true, force: true}); }
    console.log(fails ? `${fails} essai(s) en échec` : 'Les packs du monde marchent.');
    process.exit(fails ? 1 : 0);
})();
