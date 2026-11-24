#!/usr/bin/env node
/* 🌟 Wikidata « Autour de sa vie » (assets/js/heritage-wikidata-autour.js, assets/data/wikidata/, scripts/wikidata/build-wikidata.py).
 *  1. données : moins de 15 Mo en tout, licence CC0, chaque ligne a son numéro Q (lien ↗), Lemberg → Lviv, Marie Curie le 7 novembre 1867 ;
 *  2. le fabricant : se compile, User-Agent sans adresse, pauses entre les questions ;
 *  3. écran : Jean DURAND (né le 7 novembre 1867 à Varsovie, mort à Paris en 1934) → bloc « 🌟 Autour de sa vie » : une phrase,
 *     « ▸ plus » (Marie Curie née au même endroit et le même jour, homonymes « simple homonyme », événements près de Paris),
 *     chaque ligne avec « ↗ Wikidata » ; Pierre MAZAUD (sans date) → pas de bloc ; « Lemberg » tapé dans un lieu → l'aide ;
 *     Réglages → 🌟 Wikidata : éteindre (↶ Annuler) ; LCNDA_EXT.dataSources (chanson d'une année, ancien nom).
 *   node tests/test-wikidata.js */
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
const DIR = path.join(root, 'assets/data/wikidata');
const {findPhp, phpRuntimeArgs, devBundledPhp} = require('../electron/php-server.js');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const gz = f => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(DIR, f))).toString('utf8'));
const walk = d => fs.readdirSync(d, {withFileTypes: true}).flatMap(e => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));

(async () => {
    await t('données : moins de 15 Mo, CC0, un numéro Q partout', async () => {
        const all = walk(DIR); const total = all.reduce((a, f) => a + fs.statSync(f).size, 0);
        assert.ok(total > 1e6 && total < 15e6, `taille ${total}`);
        const idx = gz('people-index.json.gz');
        assert.strictEqual(idx.licence, 'CC0 1.0'); assert.match(idx.licence_url, /creativecommons\.org\/publicdomain\/zero/);
        assert.ok(idx.count > 50000, 'au moins 50 000 personnes');
        const tiles = Object.keys(idx.tiles); assert.ok(tiles.every(k => fs.existsSync(path.join(DIR, 'people', k + '.json.gz'))));
        const paris = gz('people/45_0.json.gz');
        paris.p.slice(0, 500).forEach(r => { assert.ok(Number.isInteger(r[0]) && r[0] > 0); assert.ok(r[1]); assert.match(r[2], /^\d{1,4}(-\d\d){0,2}$/); assert.ok(paris.pl[r[4]], 'lieu de naissance connu'); });
        const ev = gz('events-index.json.gz'); assert.ok(Object.values(ev.kinds).reduce((a, b) => a + b, 0) > 5000); ['battle', 'treaty', 'epidemic'].forEach(k => assert.ok(ev.kinds[k] > 0, k));
    });
    await t('données : Lemberg → Lviv ; Marie Curie née le 7 novembre 1867 ; les chansons', async () => {
        const o = gz('oldnames.json.gz').n.lemberg || [];
        assert.ok(o.some(r => r[0] === 36036), 'Lemberg est un ancien nom de Lviv (Q36036)');
        const d = gz('days/11.json.gz').d['11-07'] || [];
        assert.ok(d.some(r => r[0] === 7186 && r[2] === '1867-11-07'), 'Marie Curie (Q7186)');
        const s = gz('songs.json.gz'); const ys = Object.keys(s.y).map(Number);
        assert.ok(ys.filter(y => y >= 1900 && y <= 2020).length > 80, 'une chanson presque chaque année');
        Object.values(s.y).flat().forEach(r => { assert.ok(r[0] > 0 && r[1] && r[2]); });
        assert.ok(gz('surnames.json.gz').s.durand?.length > 0, 'des Durand célèbres');
    });
    await t('le fabricant : se compile, poli (User-Agent sans adresse, pauses)', async () => {
        const py = spawnSync('python3', ['-m', 'py_compile', path.join(root, 'scripts/wikidata/build-wikidata.py')], {encoding: 'utf8'});
        assert.strictEqual(py.status, 0, py.stderr);
        const src = fs.readFileSync(path.join(root, 'scripts/wikidata/build-wikidata.py'), 'utf8');
        assert.match(src, /User-Agent/); assert.doesNotMatch(src, /@[a-z0-9-]+\.[a-z]{2,}/i, 'pas d’adresse e-mail dans le User-Agent');
        assert.match(src, /time\.sleep/, 'des pauses entre les questions');
    });

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-wd-'));
    fs.mkdirSync(path.join(tmp, 'media'));
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4'};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$tag = function ($t) use ($pdo) { $s = $pdo->prepare('SELECT id FROM event_types WHERE gedcom_tag=? ORDER BY id LIMIT 1'); $s->execute([$t]); return (int) $s->fetchColumn(); };
$pl = function ($name, $country, $lat, $lon) use ($pdo) { $pdo->prepare('INSERT INTO places(name, country, latitude, longitude) VALUES(?,?,?,?)')->execute([$name, $country, $lat, $lon]); return (int) $pdo->lastInsertId(); };
$war = $pl('Varsovie', 'Pologne', 52.2297, 21.0122); $paris = $pl('Paris', 'France', 48.8566, 2.3522);
$per = function ($f, $l, $g, $evs) use ($pdo, $tag) { $pdo->prepare("INSERT INTO persons(first_name,last_name,gender,living_status) VALUES(?,?,?,'deceased')")->execute([$f, $l, $g]); $id = (int) $pdo->lastInsertId();
    foreach ($evs as [$t, $y, $sd, $txt, $p]) { $pdo->prepare('INSERT INTO events(scope, person_id, event_type_id, year, sort_date, date_text, place_id) VALUES(\'person\',?,?,?,?,?,?)')->execute([$id, $tag($t), $y, $sd, $txt, $p]); } return $id; };
$ids = [
  'jean' => $per('Jean', 'DURAND', 'male', [['BIRT', 1867, '1867-11-07', '7 novembre 1867', $war], ['DEAT', 1934, '1934-07-04', '4 juillet 1934', $paris]]),
  'pierre' => $per('Pierre', 'MAZAUD', 'male', []),
  'marie' => $per('Marie', 'LACOMBE', 'female', [['BIRT', 1930, '1930-03-02', '2 mars 1930', null]]),
];
echo json_encode($ids);`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0 || !/jean/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const ID = JSON.parse(seed.stdout.trim().split('\n').pop());
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const errs = [];
    try {
        const ctx = await browser.newContext({viewport: {width: 1440, height: 900}});
        // la balise <script> n'est pas encore dans index.php (à ajouter) : on la pose ici, juste après heritage-wikidata.js
        await ctx.route(u => new URL(u).pathname === '/' || /index\.php$/.test(new URL(u).pathname), async route => {
            const r = await route.fetch(); let html = await r.text();
            if (!/heritage-wikidata-autour\.js/.test(html)) html = html.replace(/(<script src="assets\/js\/heritage-wikidata\.js[^"]*" defer><\/script>)/, '$1<script src="assets/js/heritage-wikidata-autour.js" defer></script>');
            await route.fulfill({response: r, body: html});
        });
        const p = await ctx.newPage();
        p.on('pageerror', e => errs.push(e.message));
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_EXT?.wikidataAutour && window.LCNDA_APP?.state?.csrf, null, {timeout: 30000});
        const open = id => p.evaluate(x => { const A = window.LCNDA_APP; A.state.currentPersonId = x; A.setModule('personnes'); }, id);

        await t('fiche : une phrase, puis « ▸ plus » avec Marie Curie, les homonymes et les événements', async () => {
            await open(ID.jean);
            await p.waitForFunction(() => document.querySelector('[data-wda-person] .wda-lead'), null, {timeout: 30000});
            const lead = await p.textContent('[data-wda-person]');
            assert.match(lead, /née au même endroit|nées au même endroit/); assert.match(lead, /né le même jour que/);
            const html = await p.innerHTML('[data-wda-person] .wda-fold');
            assert.match(html, /wikidata\.org\/wiki\/Q7186/, 'Marie Curie, avec son lien');
            assert.match(html, /simple homonyme/); assert.match(html, /Pendant sa vie, à moins de 30 km/);
            const rows = await p.$$eval('[data-wda-person] li', ls => ls.map(l => !!l.querySelector('a[href^="https://www.wikidata.org/wiki/Q"]')));
            assert.ok(rows.length > 5 && rows.every(Boolean), 'chaque ligne a son ↗ Wikidata');
            assert.strictEqual(await p.$eval('[data-wda-person] .wda-fold', d => d.open), false, 'replié au départ');
        });
        await t('fiche : rien à dire → pas de bloc vide', async () => {
            await open(ID.pierre); await sleep(2500);
            const vis = await p.evaluate(() => { const h = document.querySelector('[data-wda-person]'); return h ? !h.closest('.card')?.hidden : false; });
            assert.strictEqual(vis, false);
        });
        await t('fiche : la chanson de l’année de naissance', async () => {
            const y = await p.evaluate(async () => { const s = await window.LCNDA_EXT.wikidataAutour.load('songs.json.gz'); return s.y['1930'] ? 1930 : null; });
            if (!y) return;
            await open(ID.marie);
            await p.waitForFunction(() => /L’année de sa naissance \(1930\)/.test(document.querySelector('[data-wda-person]')?.textContent || ''), null, {timeout: 20000});
        });
        await t('anciens noms : ext.wikidataOldName et l’aide sous un champ « Lieu »', async () => {
            const r = await p.evaluate(() => window.LCNDA_EXT.wikidataOldName('Lemberg'));
            assert.ok(r.some(x => x.qid === 'Q36036' && /Lviv/i.test(x.now) && x.url === 'https://www.wikidata.org/wiki/Q36036'));
            assert.deepStrictEqual(await p.evaluate(() => window.LCNDA_EXT.wikidataOldName('Zzzyx')), []);
            await p.evaluate(() => { const d = document.createElement('div'); d.id = 'wdo-test'; d.innerHTML = '<label>Lieu<input name="place_name"></label>'; document.body.appendChild(d); });
            await p.fill('#wdo-test input', 'Lemberg');
            await p.waitForSelector('#wdo-test .wdo-hint', {timeout: 5000});
            assert.match(await p.textContent('#wdo-test .wdo-hint'), /Lemberg.*Lviv/);
        });
        await t('à la demande : LCNDA_EXT.dataSources', async () => {
            const ids = await p.evaluate(() => (window.LCNDA_EXT.dataSources || []).filter(d => /^wikidata_/.test(d.id)).map(d => [d.id, d.group, d.needs.join('+'), typeof d.run]));
            assert.deepStrictEqual(ids.map(x => x[0]).sort(), ['wikidata_ancien_nom', 'wikidata_autour', 'wikidata_chanson', 'wikidata_evenements']);
            assert.ok(ids.every(x => x[3] === 'function'));
            const out = await p.evaluate(async id => { const h = document.createElement('div'); const D = window.LCNDA_EXT.dataSources;
                await D.find(d => d.id === 'wikidata_autour').run({person: id}, h); const a = h.innerHTML;
                await D.find(d => d.id === 'wikidata_ancien_nom').run({place: 'Lemberg'}, h); return [a, h.textContent]; }, ID.jean);
            assert.match(out[0], /Q7186/); assert.match(out[1], /Lviv/);
        });
        await t('Réglages → 🌟 Wikidata : éteindre cache le bloc, ↶ Annuler le remet', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'wikidata_autour'; A.setModule('maintenance'); });
            await p.waitForSelector('.wda-set [data-wda-tg="on"]', {timeout: 15000});
            assert.match(await p.textContent('.wda-set'), /CC0/);
            await p.evaluate(() => { const c = document.querySelector('.wda-set [data-wda-tg="on"]'); c.checked = false; c.dispatchEvent(new Event('change', {bubbles: true})); });
            assert.strictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-wikidata-autour')).on), false);
            assert.strictEqual(await p.evaluate(() => window.LCNDA_APP.defaultPersonBlocks.some(b => b[0] === 'wikidata_autour')), false);
            await p.evaluate(() => [...document.querySelectorAll('.ui-toast')].reverse().find(x => /Wikidata éteint/.test(x.textContent)).querySelector('button').click()); await sleep(500);
            assert.strictEqual(await p.evaluate(() => window.LCNDA_EXT.wikidataAutour.isOn()), true, '↶ Annuler');
            assert.strictEqual(await p.evaluate(() => window.LCNDA_APP.defaultPersonBlocks.some(b => b[0] === 'wikidata_autour')), true);
        });
        assert.deepStrictEqual(errs, [], 'erreurs JS : ' + errs.join(' | '));
    } finally { await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true}); }
    console.log(fails ? `${fails} échec(s)` : 'tout est bon'); process.exit(fails ? 1 : 0);
})();
