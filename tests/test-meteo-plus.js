#!/usr/bin/env node
/* 🌦 Météo d'autrefois : les compléments Copernicus (packs « plus-… » : lib/meteo_plus.php, heritage-meteo.js, scripts/meteo/meteo_plus.py).
 *  0. le fabricant hors ligne (tests/test_meteo_plus.py : petits NetCDF / CSV fabriqués, morceaux recoupés, reprise, relu par l'app) ;
 *  1. de petits packs factices (neige ERA5-Land, ressenti UTCI, rivière GloFAS) autour d'Auch, la naissance de Jean MAZAUD le 2 janvier 1990 ;
 *  2. Réglages → 🌦 Météo d'autrefois : la partie « Compléments Copernicus », source + licence + « ↗ source » sur chaque ligne,
 *     « ⤓ Installer » (↶ Annuler), « 🗑 Supprimer » (↶ Annuler), le réglage « Les compléments Copernicus dans le détail » ;
 *  3. le détail du jour : une phrase par complément (neige, ressenti, rivière en crue, températures fines), les sources repliées.
 *   node tests/test-meteo-plus.js */
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const crypto = require('crypto');
const {spawn, spawnSync} = require('child_process');
let chromium; try { ({chromium} = require('playwright')); } catch (_) { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); }
const root = path.join(__dirname, '..');
const {findPhp, phpRuntimeArgs, devBundledPhp} = require('../electron/php-server.js');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── 0. le fabricant ──
{
    const r = spawnSync('python3', [path.join(root, 'tests', 'test_meteo_plus.py')], {encoding: 'utf8', env: {...process.env, PYTHONWARNINGS: 'ignore'}});
    if (r.error) console.log('— python3 absent : test du fabricant sauté');
    else if (r.status !== 0 && /No module named 'netCDF4'/.test(r.stderr)) console.log('— netCDF4 absent : test du fabricant des compléments sauté');
    else if (r.status !== 0) { fails++; console.log('✗ le fabricant des compléments (tests/test_meteo_plus.py)\n', r.stdout, r.stderr); }
    else console.log('✓ le fabricant des compléments hors ligne : NetCDF/CSV réduits, morceaux recoupés, reprise, relus par l’app');
}

(async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-meteoplus-')), site = path.join(tmp, 'site'), appMeteo = path.join(tmp, 'app-meteo'), packs = path.join(tmp, 'meteo');
    [path.join(tmp, 'media'), site, appMeteo, packs].forEach(d => fs.mkdirSync(d, {recursive: true}));
    // ── 1. les packs factices ──
    const py = String.raw`
import sys, os, datetime
sys.path.insert(0, sys.argv[1])
import meteo_format as F
app, packs, site = sys.argv[2:5]
def pack(path, kind, title, source, rows, extra=None):
    db = F.open_db(path, kind, title); F.set_meta(db, countries='FR,BE,CH,LU', plus='1', built='2026-11-25'); F.add_sources(db, [source], 2026)
    for gid, lat, lon, cols in rows:
        db.execute('INSERT INTO grid(id, source, lat, lon, debut, fin, pas) VALUES(?,?,?,?,1990,1990,0.1)', (gid, source, lat, lon))
        db.execute('INSERT INTO grid_daily(grid_id, annee, blob) VALUES(?,1990,?)', (gid, F.encode(cols)))
    if extra: extra(db)
    db.commit(); db.close()
n = 365
# le socle factice : un carreau ERA5 près d'Auch (la journée existe)
db = F.open_db(os.path.join(app, 'meteo-socle.sqlite'), 'socle', 'Socle'); F.add_sources(db, ['era5'], 2025); F.set_meta(db, fixture='1')
db.execute("INSERT INTO grid(id, source, lat, lon, debut, fin, pas) VALUES(1, 'era5', 43.75, 0.5, 1990, 1990, 0.25)")
db.execute('INSERT INTO grid_daily(grid_id, annee, blob) VALUES(1, 1990, ?)', (F.encode([('TN', [-10] * n), ('TX', [50] * n), ('RR', [0] * n)]),)); db.commit(); db.close()
pack(os.path.join(site, 'neige.sqlite'), 'plus-neige', 'Neige et températures fines (ERA5-Land)', 'era5land', [(1, 43.6, 0.6, [('TN', [-25] * n), ('TX', [30] * n), ('SH', [12] * n), ('SF', [0, 4] + [0] * (n - 2))])])
pack(os.path.join(packs, 'meteo-plus-ressenti.sqlite'), 'plus-ressenti', 'Ressenti thermique (UTCI, ERA5-HEAT)', 'utci', [(1, 43.75, 0.5, [('UX', [20] * n), ('UN', [-160] * n)])])
def riv(db):
    db.execute('CREATE TABLE IF NOT EXISTS riviere(grid_id INTEGER PRIMARY KEY, moyenne REAL, p10 REAL, p90 REAL, p99 REAL)')
    db.execute('INSERT INTO riviere VALUES(1, 12.0, 3.0, 25.0, 60.0)')
import math
pack(os.path.join(packs, 'meteo-plus-rivieres.sqlite'), 'plus-rivieres', 'Débit des rivières (GloFAS)', 'glofas', [(1, 43.65, 0.6, [('QL', [round(1000 * math.log10(12))] * 1 + [round(1000 * math.log10(80))] + [round(1000 * math.log10(12))] * (n - 2))])], riv)
F.wrap_pack(os.path.join(site, 'neige.sqlite'), os.path.join(site, 'meteo-pack-plus-neige.lcmeteo')); os.remove(os.path.join(site, 'neige.sqlite'))
print('ok')`;
    const mk = spawnSync('python3', ['-c', py, path.join(root, 'scripts/meteo'), appMeteo, packs, site], {encoding: 'utf8'});
    if (mk.status !== 0) { console.error(mk.stderr || mk.stdout); process.exit(1); }
    const buf = fs.readFileSync(path.join(site, 'meteo-pack-plus-neige.lcmeteo'));
    fs.renameSync(path.join(site, 'meteo-pack-plus-neige.lcmeteo'), path.join(site, 'meteo-pack-plus-neige.lcmeteo.000'));
    fs.writeFileSync(path.join(site, 'meteo-manifest.json'), JSON.stringify({version: '2026-11', packs: {
        'plus-neige': {size: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex'), built: '2026-11-25', parts: [{name: 'meteo-pack-plus-neige.lcmeteo.000', size: buf.length}]}}}));
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4', GENEALOGY_TEST: '1', LCNDA_TEST_METEO_DIR: site, LCNDA_METEO_DIR: appMeteo};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$t = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn();
$pdo->exec("INSERT INTO places(id,name,county,state,country,latitude,longitude) VALUES(1,'Auch','Gers','Occitanie','France',43.646,0.586)");
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start) VALUES(1,'Jean','MAZAUD','male','deceased',1),(2,'Marie','LACOMBE','female','deceased',0)");
$pdo->prepare('INSERT INTO events(id,scope,person_id,event_type_id,date_text,year,place_id) VALUES(1,?,1,?,?,1990,1)')->execute(['person', $t('BIRT'), '2 janvier 1990']);
echo json_encode(['ok' => 1]);`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0 || !/"ok"/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const errs = [];
    try {
        const p = await (await browser.newContext({viewport: {width: 1440, height: 900}})).newPage();
        p.on('pageerror', e => errs.push(e.message));
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_EXT?.meteoDl && window.LCNDA_APP?.state?.csrf, null, {timeout: 30000});
        const api = (x, q = {}) => p.evaluate(([y, z]) => window.LCNDA_APP.api(y, z).catch(e => ({error: e.message})), [x, q]);
        const toast = re => p.waitForFunction(r => new RegExp(r).test([...document.querySelectorAll('.ui-toast')].map(x => x.textContent).join(' ')), re, {timeout: 30000});
        const clickUndo = re => p.evaluate(r => [...document.querySelectorAll('.ui-toast')].reverse().find(x => new RegExp(r).test(x.textContent)).querySelector('button').click(), re);

        await t('serveur : le complément « plus-neige » est en ligne ; « plus-ressenti » et « plus-rivieres » déjà rangés', async () => {
            const r = await api('meteo_dl_info'); assert.deepStrictEqual(Object.keys(r.packs), ['plus-neige']);
            const st = await api('meteo_status'); assert.ok(st.files['plus-ressenti']?.ok && st.files['plus-rivieres']?.ok && st.files.socle?.ok); assert.ok(!st.files['plus-neige']);
            const ab = await api('meteo_about'); for (const id of ['era5land', 'utci', 'glofas', 'cerra', 'c3s-insitu']) assert.ok(ab.sources.some(s => s.id === id), id);
        });
        await t('Réglages → 🌦 Météo : les compléments, chacun avec source, licence, « ↗ source » ; ⤓ Installer puis ↶ Annuler', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'meteo'; A.setModule('maintenance'); });
            await p.waitForSelector('[data-wx-dl="plus-neige"]', {timeout: 20000});
            assert.match(await p.textContent('.wx-settings'), /Compléments Copernicus \(facultatifs\)/);
            for (const k of ['plus-neige', 'plus-cerra', 'plus-ressenti', 'plus-rivieres', 'plus-anciennes']) {
                const row = await p.$(`[data-wx-pack="${k}"]`); assert.ok(row, k);
                const src = await row.$eval('.wx-plus-src', x => ({text: x.textContent, href: x.querySelector('a').href, target: x.querySelector('a').target, rel: x.querySelector('a').rel}));
                assert.match(src.text, /Source : .*Copernicus.*citation demandée.*↗ source/, k); assert.match(src.href, /^https:\/\/(cds|ewds)\.climate\.copernicus\.eu\/datasets\//); assert.strictEqual(src.target, '_blank'); assert.strictEqual(src.rel, 'noopener');
            }
            assert.match(await p.textContent('[data-wx-pack="plus-rivieres"] .wx-plus-src'), /CEMS-FLOODS/);
            assert.match(await p.textContent('[data-wx-pack="plus-ressenti"]'), /Installé/);
            if (process.env.SHOTS) { await p.$eval('[data-wx-pack="plus-neige"]', x => x.scrollIntoView({block: 'start'})); await p.screenshot({path: path.join(process.env.SHOTS, 'meteo-plus-reglages.png')}); }
            await p.click('[data-wx-dl="plus-neige"]');
            await toast('Neige et températures fines installé');
            assert.ok(fs.existsSync(path.join(packs, 'meteo-plus-neige.sqlite')));
            await clickUndo('installé'); await sleep(800);
            assert.ok(!(await api('meteo_status')).files['plus-neige'], '↶ Annuler retire le complément');
            await p.waitForSelector('[data-wx-dl="plus-neige"]'); await p.click('[data-wx-dl="plus-neige"]');
            for (let i = 0; i < 100 && !(await api('meteo_status')).files['plus-neige']?.ok; i++) await sleep(300);
            assert.ok((await api('meteo_status')).files['plus-neige']?.ok, 'réinstallé');
        });
        await t('le détail du 2 janvier 1990 à Auch : neige, ressenti, rivière en crue, températures fines, sources repliées avec « ↗ source »', async () => {
            await p.evaluate(() => window.LCNDA_EXT.meteo.cache?.clear?.());
            await p.evaluate(() => window.LCNDA_EXT.meteo.openDay(1));
            await p.waitForSelector('.wx-dialog [data-wx-plus]', {timeout: 20000});
            const txt = await p.textContent('.wx-dialog [data-wx-plus]');
            assert.match(txt, /Neige au sol : 12 cm ; il en est tombé ≈ 4 cm ce jour-là/);
            assert.match(txt, /Ressenti au plus froid : −16 °C \(froid fort\)/);
            assert.match(txt, /La grande rivière la plus proche \(à \d+ km\) : 80 m³\/s, 6,7 fois son débit moyen — en crue/);
            assert.match(txt, /Au plus près \(ERA5-Land, carreau ≈ 9 km\) : min\. −2 °C, max\. 3 °C/);
            assert.strictEqual(await p.$eval('.wx-dialog .wx-plus-more', d => d.open), false, 'les sources sont repliées');
            await p.click('.wx-dialog .wx-plus-more summary');
            const links = await p.$$eval('.wx-dialog .wx-plus-more a', as => as.map(a => [a.textContent, a.href, a.target]));
            assert.strictEqual(links.length, 3); assert.ok(links.every(([x, h, tg]) => /↗ source/.test(x) && /copernicus\.eu/.test(h) && tg === '_blank'));
            assert.match(await p.textContent('.wx-dialog .wx-plus-more'), /CC BY 4\.0/);
            if (process.env.SHOTS) await p.screenshot({path: path.join(process.env.SHOTS, 'meteo-plus-detail.png')});
            await p.keyboard.press('Escape');
        });
        await t('Réglages : « Les compléments Copernicus dans le détail » se décoche (genealogie-meteo) ; 🗑 Supprimer un complément puis ↶ Annuler', async () => {
            await p.waitForSelector('[data-wx-tg="plus"]');
            assert.strictEqual(await p.$eval('[data-wx-tg="plus"]', x => x.checked), true, 'coché au départ');
            const flip = () => p.$eval('[data-wx-tg="plus"]', x => x.click());  // l'interrupteur (case cachée sous son dessin)
            await flip();
            assert.strictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-meteo')).plus), false);
            await p.evaluate(() => window.LCNDA_EXT.meteo.openDay(1));
            await p.waitForSelector('.wx-dialog .wx-say'); assert.ok(!(await p.$('.wx-dialog [data-wx-plus]')), 'plus montré une fois décoché');
            await p.keyboard.press('Escape');
            await flip();
            assert.strictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-meteo')).plus), true);
            await p.click('[data-wx-remove="plus-ressenti"]'); await toast('Ressenti thermique supprimé');
            assert.ok(!(await api('meteo_status')).files['plus-ressenti']);
            await clickUndo('supprimé'); await sleep(800);
            assert.ok((await api('meteo_status')).files['plus-ressenti']?.ok, '↶ Annuler le remet');
        });
        await t('à 390 px : pas de défilement de côté dans les réglages', async () => {
            await p.setViewportSize({width: 390, height: 800}); await sleep(300);
            assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
        });
        await t('aucune erreur JavaScript', async () => assert.deepStrictEqual(errs, []));
    } finally {
        await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true});
    }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})();
