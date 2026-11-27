#!/usr/bin/env node
/* 🗺 Pays à l'époque, 🌍 les pays en chiffres, 💶 Ailleurs en Europe
 * (assets/js/heritage-monde-contexte.js, assets/js/heritage-prix-europe.js, assets/data/monde-frontieres.json.gz,
 *  assets/data/monde-chiffres.json, assets/data/prix-europe.json ; fabriqués par scripts/monde/build-contexte.py).
 *  1. données : tailles, licences et sources ; Strasbourg 1892 → Empire allemand, Lviv 1900 → Autriche-Hongrie, Nice 1850 → Sardaigne,
 *     Alger 1900 → colonie ; l'Italie en 1890 en chiffres ; 10 florins en 1750 ;
 *  2. écran : la fiche (bloc « 🗺 Pays à l'époque »), Listes → Histoire → « 🌍 Les pays de ta famille en chiffres »,
 *     la Carte (« 🗺 Frontières de » 1900), le Convertisseur (onglet « 💶 Ailleurs en Europe »).
 *   node tests/test-monde-contexte.js */
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
const M = require('../assets/js/heritage-monde-contexte.js');
const PE = require('../assets/js/heritage-prix-europe.js');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const D = f => path.join(root, 'assets/data', f);

(async () => {
    const raw = JSON.parse(zlib.gunzipSync(fs.readFileSync(D('monde-frontieres.json.gz'))));
    const B = M.prepare(raw);
    const C = JSON.parse(fs.readFileSync(D('monde-chiffres.json'), 'utf8'));
    const P = JSON.parse(fs.readFileSync(D('prix-europe.json'), 'utf8'));
    await t('données : tailles (< 15 Mo et < 50 Mo), licences et sources', async () => {
        assert.ok(fs.statSync(D('monde-frontieres.json.gz')).size < 15e6);
        assert.ok(fs.statSync(D('monde-chiffres.json')).size + fs.statSync(D('prix-europe.json')).size < 50e6);
        assert.strictEqual(raw.licence, 'CC BY-NC-SA 4.0'); assert.match(raw.attr, /CShapes 2\.0/); assert.match(raw.url, /^https:\/\/icr\.ethz\.ch\//);
        for (const k of ['le', 'im', 'ht', 'ed', 'gdp', 'pop']) { const s = C.sources[k]; assert.ok(s && s.src && /^https:\/\//.test(s.url) && /^CC/.test(s.licence), k); }
        assert.strictEqual(C.sources.gdp.licence, 'CC BY 4.0'); assert.strictEqual(C.sources.im.licence, 'CC BY-SA 4.0');
        assert.strictEqual(P.licence, 'CC BY-SA 4.0'); assert.match(P.src, /Allen/);
        assert.ok(fs.readFileSync(D('monde-LICENCES.txt'), 'utf8').includes('CC BY-NC-SA 4.0'));
    });
    await t('frontières : le pays de l’époque, et celui d’aujourd’hui', async () => {
        const at = (lat, lon, y) => M.lookup(B, lat, lon, y * 10000 + 701);
        assert.strictEqual(at(48.58, 7.75, 1892).name, 'Empire allemand');
        assert.strictEqual(M.today(B, 48.58, 7.75).name, 'France'); assert.strictEqual(M.today(B, 48.58, 7.75).iso, 250);
        assert.strictEqual(at(49.84, 24.03, 1900).name, 'Autriche-Hongrie');
        assert.strictEqual(at(49.84, 24.03, 1930).name, 'Pologne');
        assert.strictEqual(at(49.84, 24.03, 1960).name, 'Union soviétique (URSS)');
        assert.strictEqual(at(43.70, 7.27, 1850).name, 'Royaume de Sardaigne (Piémont)', 'Nice avant 1860 (au bord de la mer)');
        assert.strictEqual(at(43.70, 7.27, 1870).name, 'France');
        assert.match(at(36.75, 3.06, 1900).label, /^Algérie \(colonie de France\)$/);
        assert.strictEqual(at(52.52, 13.40, 1980).name, 'Allemagne de l’Est (RDA)');
        assert.strictEqual(at(48.85, 2.35, 1800), null, 'avant 1816 : pas de carte');
        assert.strictEqual(at(45, -20, 1900), null, 'en pleine mer : rien');
        assert.strictEqual(M.dateNum(1871, '1871-03-01'), 18710301); assert.strictEqual(M.dateNum(1871, ''), 18710701);
        assert.strictEqual(M.lookup(B, 48.58, 7.75, 18700301).name, 'France', 'Strasbourg en mars 1870 : encore française');
    });
    await t('chiffres : l’Italie en 1890', async () => {
        const st = M.statsAt(C, 380, 1890), by = Object.fromEntries(st.map(s => [s.key, s]));
        assert.strictEqual(by.le.v, 39); assert.strictEqual(by.ht.v, 165); assert.ok(by.gdp.v > 2000 && by.gdp.v < 4000);
        assert.match(by.le.text, /espérance de vie 39 ans/);
        assert.strictEqual(M.inCountry('Italie'), 'en Italie'); assert.strictEqual(M.inCountry('Portugal'), 'au Portugal'); assert.strictEqual(M.inCountry('Pays-Bas'), 'aux Pays-Bas');
        assert.strictEqual(M.isoByName(C, 'Italie'), 380); assert.strictEqual(M.isoByName(C, 'italy'), 380);
    });
    await t('prix : 10 florins en 1750, 100 livres tournois en 1780', async () => {
        const r = PE.convert(P, {amount: '10', money: 'Arnhem|florin', year: 1750, city: 'Amsterdam'});
        assert.ok(r.ok); assert.strictEqual(r.rate.v, 9.61); assert.ok(Math.abs(r.grams - 96.1) < 0.01);
        assert.ok(r.here.some(h => h.good === 'ble' && h.qty > 50));
        assert.ok(r.elsewhere.length > 10);
        const p = PE.convert(P, {amount: '100', money: 'Paris|livre tournois', year: 1780, city: 'Paris'});
        assert.ok(Math.abs(p.rate.v - 4.454) < 0.01, 'la livre tournois de 1726 : ≈ 4,45 g d’argent');
        assert.ok(p.here.some(h => h.good === 'pain'));
        assert.strictEqual(PE.convert(P, {amount: 'x', money: 'silver', year: 1750}).why, 'amount');
        assert.strictEqual(PE.convert(P, {amount: '10', money: 'Paris|franc', year: 1700}).why, 'rate', 'pas de franc en 1700');
        assert.ok(!PE.moneys(P).some(m => /Alsace|kronor/i.test(m.id)), 'pas les unités mises après coup');
    });

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-mc-'));
    fs.mkdirSync(path.join(tmp, 'media'));
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4'};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$tag = function ($t) use ($pdo) { $s = $pdo->prepare('SELECT id FROM event_types WHERE gedcom_tag=? ORDER BY id LIMIT 1'); $s->execute([$t]); return (int) $s->fetchColumn(); };
$pl = function ($name, $country, $lat, $lon) use ($pdo) { $pdo->prepare('INSERT INTO places(name, country, latitude, longitude) VALUES(?,?,?,?)')->execute([$name, $country, $lat, $lon]); return (int) $pdo->lastInsertId(); };
$stras = $pl('Strasbourg', 'France', 48.58, 7.75); $paris = $pl('Paris', 'France', 48.85, 2.35); $lviv = $pl('Lviv', 'Ukraine', 49.84, 24.03); $nice = $pl('Nice', 'France', 43.70, 7.27);
$per = function ($f, $l, $g, $evs) use ($pdo, $tag) { $pdo->prepare("INSERT INTO persons(first_name,last_name,gender,living_status) VALUES(?,?,?,'deceased')")->execute([$f, $l, $g]); $id = (int) $pdo->lastInsertId();
    foreach ($evs as [$t, $y, $p]) { $pdo->prepare('INSERT INTO events(scope, person_id, event_type_id, year, date_text, place_id) VALUES(\'person\',?,?,?,?,?)')->execute([$id, $tag($t), $y, (string) $y, $p]); } return $id; };
$ids = [
  'pierre' => $per('Pierre', 'MAZAUD', 'male', [['BIRT', 1892, $stras], ['DEAT', 1960, $paris]]),
  'marie' => $per('Marie', 'LACOMBE', 'female', [['BIRT', 1850, $nice], ['DEAT', 1910, $nice]]),
  'jean' => $per('Jean', 'DURAND', 'male', [['BIRT', 1900, $lviv], ['DEAT', 1970, $paris]]),
];
echo json_encode($ids);`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0 || !/pierre/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const ID = JSON.parse(seed.stdout.trim().split('\n').pop());
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const errs = [];
    try {
        const p = await (await browser.newContext({viewport: {width: 1440, height: 900}})).newPage();
        p.on('pageerror', e => errs.push(e.message));
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.autrefois, null, {timeout: 30000});
        // tant que index.php ne les charge pas : les deux fichiers posés à la main (sans effet s'ils y sont déjà)
        for (const f of ['heritage-monde-contexte.js', 'heritage-prix-europe.js']) {
            if (!(await p.evaluate(n => [...document.scripts].some(s => s.src.includes(n)), f))) await p.addScriptTag({url: `assets/js/${f}`});
        }
        await p.waitForFunction(() => window.LCNDA_EXT.mondeContexte && window.LCNDA_EXT.prixEurope, null, {timeout: 10000});
        await t('fiche : « Strasbourg → Empire allemand · aujourd’hui : France » et l’Allemagne/la France en chiffres', async () => {
            await p.evaluate(id => { window.LCNDA_SHEET_LAZY_OFF = true; /* ses blocs essayés en entier (le chargement à mesure : test-fiche-lazy.js) */ const A = window.LCNDA_APP; A.state.currentPersonId = id; A.setModule('personnes'); }, ID.pierre);
            await p.waitForFunction(() => /Empire allemand/.test(document.querySelector('[data-mc-host]')?.textContent || ''), null, {timeout: 30000});
            const txt = (await p.textContent('[data-mc-host]')).replace(/\s+/g, ' ');
            assert.match(txt, /Strasbourg \(Naissance, 1892\) → à cette date, ce lieu était dans : Empire allemand · aujourd’hui : France/);
            assert.match(txt, /Paris \(Décès, 1960\) → à cette date, ce lieu était dans : France \(comme aujourd’hui\)/);
            assert.match(txt, /En France en 1892 : espérance de vie \d+ ans/); assert.match(txt, /Un lieu de sa vie était dans un autre pays/);
            assert.match(txt, /En France en 1960 : /);
            assert.match(txt, /CC BY-NC-SA 4\.0/);
            if (process.env.MC_SHOTS) await (await p.$('[data-mc-host]')).screenshot({path: path.join(process.env.MC_SHOTS, 'fiche.png')});
        });
        await t('fiche : Nice en 1850 (Sardaigne), Lviv en 1900 (Autriche-Hongrie)', async () => {
            await p.evaluate(id => { window.LCNDA_SHEET_LAZY_OFF = true; /* ses blocs essayés en entier (le chargement à mesure : test-fiche-lazy.js) */ const A = window.LCNDA_APP; A.state.currentPersonId = id; A.setModule('personnes'); }, ID.marie);
            await p.waitForFunction(() => /Sardaigne/.test(document.querySelector('[data-mc-host]')?.textContent || ''), null, {timeout: 30000});
            await p.evaluate(id => { window.LCNDA_SHEET_LAZY_OFF = true; /* ses blocs essayés en entier (le chargement à mesure : test-fiche-lazy.js) */ const A = window.LCNDA_APP; A.state.currentPersonId = id; A.setModule('personnes'); }, ID.jean);
            await p.waitForFunction(() => /Autriche-Hongrie/.test(document.querySelector('[data-mc-host]')?.textContent || ''), null, {timeout: 30000});
            assert.match((await p.textContent('[data-mc-host]')).replace(/\s+/g, ' '), /aujourd’hui : Ukraine/);
        });
        await t('Listes → Histoire → « 🌍 Les pays de ta famille en chiffres »', async () => {
            await p.click('[data-mc-list]');
            await p.waitForSelector('[data-mc-country="250"]', {timeout: 30000});
            assert.strictEqual(await p.evaluate(() => window.LCNDA_APP.state.listType), 'pays_chiffres');
            const fr = (await p.textContent('[data-mc-country="250"]')).replace(/\s+/g, ' ');
            assert.match(fr, /France/); assert.match(fr, /3 personnes/); assert.match(fr, /Espérance de vie/);
            assert.ok(await p.$('[data-mc-country="804"]'), 'l’Ukraine (Lviv)');
            assert.match(await p.textContent('.mc-page'), /Maddison Project Database/);
            if (process.env.MC_SHOTS) await p.screenshot({path: path.join(process.env.MC_SHOTS, 'liste.png')});
            assert.ok(await p.evaluate(() => window.LCNDA_APP.defaultListTypes.some(x => x[0] === 'pays_chiffres')));
        });
        await t('Carte : « 🗺 Frontières de » 1900', async () => {
            await p.evaluate(() => { localStorage.setItem('genealogie-monde-contexte', JSON.stringify({layer: false, year: 1900})); window.LCNDA_APP.setModule('carte'); });
            await p.waitForSelector('[data-mc-layer]', {timeout: 30000});
            await p.check('[data-mc-layer]');
            await p.waitForFunction(() => document.querySelectorAll('#mc-layer path').length > 5, null, {timeout: 30000});
            const names = await p.evaluate(() => [...document.querySelectorAll('#mc-layer path title')].map(x => x.textContent));
            assert.ok(names.includes('Empire allemand') && names.includes('France'), names.slice(0, 10).join(', '));
            if (process.env.MC_SHOTS) await p.screenshot({path: path.join(process.env.MC_SHOTS, 'carte.png')});
            await p.fill('[data-mc-year]', '1850'); await p.dispatchEvent('[data-mc-year]', 'change');
            await p.waitForFunction(() => [...document.querySelectorAll('#mc-layer path title')].some(x => x.textContent === 'Royaume de Prusse'), null, {timeout: 10000});
            assert.strictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-monde-contexte')).year), 1850, 'l’année est gardée');
            await p.uncheck('[data-mc-layer]'); await sleep(300);
            assert.strictEqual(await p.evaluate(() => document.querySelectorAll('#mc-layer path').length), 0);
        });
        await t('Convertisseur d’autrefois : onglet « 💶 Ailleurs en Europe »', async () => {
            await p.evaluate(() => window.LCNDA_EXT.autrefois.open({tab: 'europe'}));
            await p.waitForSelector('dialog[open] [data-af-tab="europe"]', {timeout: 15000});
            await p.waitForSelector('dialog[open] [data-pe-out] .af-big', {timeout: 15000});
            await p.click('dialog[open] [data-pe-ex^="10~Arnhem"]');
            const out = (await p.textContent('dialog[open] [data-pe-out]')).replace(/\s+/g, ' ');
            assert.match(out, /10 florins en 1750 ≈ 96 g d’argent/);
            assert.match(out, /1 florin = 9,61 g d’argent en 1750 \(d’après les prix relevés à Arnhem/);
            assert.match(out, /Ailleurs en Europe, la même année/);
            if (process.env.MC_SHOTS) await p.screenshot({path: path.join(process.env.MC_SHOTS, 'europe.png')});
            assert.match(await p.textContent('dialog[open] [data-af-pane="europe"]'), /CC BY-SA 4\.0/);
            await p.click('dialog[open] [data-af-tab="argent"]');
            assert.ok(await p.isVisible('dialog[open] [data-af-pane="argent"]'), 'les autres onglets marchent toujours');
            assert.strictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-prix-europe')).money), 'Arnhem|florin');
            await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close()));
        });
        assert.deepStrictEqual(errs, [], 'erreurs JS : ' + errs.join(' | '));
    } finally { await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true}); }
    console.log(fails ? `${fails} échec(s)` : 'tout est bon'); process.exit(fails ? 1 : 0);
})();
