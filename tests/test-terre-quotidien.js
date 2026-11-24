#!/usr/bin/env node
/* 🧺 Vie de tous les jours (assets/js/heritage-terre-quotidien.js, assets/data/tq-*.json, scripts/terre-quotidien/).
 *  1. données : chaque fichier a sa source et sa licence ; moins de 15 Mo en tout ;
 *  2. calculs (Node) : la météorite de L'Aigle (1803) près de Mortagne ; 1816 plus froide que son siècle en France ; le glacier près
 *     de Chamonix ; un arbre daté ; les sites autour de Carnac ; le timbre d'une lettre de 1868 ; l'espérance de vie à 65 ans en 1995 ;
 *  3. écran (php -S, base temporaire) : la fiche de Pierre MAZAUD (bloc « 🧺 Sa vie de tous les jours », la météorite dans « ☄️ Il a pu voir… »,
 *     le climat dans « 🌦 Météo de sa vie ») ; Réglages (éteindre une partie, ↶ Annuler) ; le village ; une lettre ; le convertisseur ;
 *     🧰 Données et 📋 Listes.
 *   node tests/test-terre-quotidien.js */
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
const TQ = require('../assets/js/heritage-terre-quotidien.js');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const DATA = path.join(root, 'assets/data');
const read = f => { const b = fs.readFileSync(path.join(DATA, f)); return JSON.parse((f.endsWith('.gz') ? zlib.gunzipSync(b) : b).toString('utf8')); };
const FILES = ['tq-meteorites.json', 'tq-climat.json', 'tq-glaciers.json', 'tq-arbres.json.gz', 'tq-sites.json.gz', 'tq-poche.json', 'tq-timbre.json', 'tq-esperance.json'];
// une fiche comme celles de l'api « person »
const ev = (tag, year, lat, lon, place, country = 'France') => ({gedcom_tag: tag, year, sort_date: `${year}-00-00`, latitude: lat, longitude: lon, place_name: place, country});
const MORTAGNE = [48.5206, 0.5469], CHAMONIX = [45.9237, 6.8694];

(async () => {
    await t('données : source, licence, moins de 15 Mo', async () => {
        let size = 0;
        for (const f of FILES) {
            size += fs.statSync(path.join(DATA, f)).size;
            const d = read(f);
            const src = d.src || Object.values(d.series || {})[0]?.src, lic = d.licence || Object.values(d.series || {})[0]?.licence;
            assert.ok(src && lic, f + ' : source et licence');
        }
        assert.ok(size < 15e6, `taille ${size}`);
        assert.ok(fs.existsSync(path.join(DATA, 'tq-LICENCES.txt')));
        const R = read('tq-timbre.json'); R.rates.forEach(r => { assert.match(r.url, /^https:\/\/fr\.wikipedia\.org\//); assert.ok(r.from <= r.to && r.evidence, r.from); });
        const P = read('tq-poche.json'); assert.ok(P.items.length >= 8); P.items.forEach(c => { assert.ok(c.from <= c.to && c.url && c.name, c.name); if (c.img) assert.ok(c.credit && c.licence, c.name + ' : crédit de l’image'); });
    });
    await t('calculs : météorite, climat, glacier', async () => {
        const pierre = {person: {id: 1, gender: 'male', first_name: 'Pierre'}, events: [ev('BIRT', 1791, ...MORTAGNE, 'Mortagne-au-Perche'), ev('DEAT', 1855, ...CHAMONIX, 'Chamonix')]};
        const life = TQ.lifeOf(pierre);
        assert.deepStrictEqual([life.by, life.dy, life.places.length], [1791, 1855, 2]);
        const m = TQ.meteorites(read('tq-meteorites.json'), life).find(x => x.name === "L'Aigle");
        assert.ok(m && m.y === 1803 && m.km < 40 && m.age === 12, JSON.stringify(m));
        assert.match(TQ.meteoriteText(m, life), /^En 1803, une météorite tombe du ciel à \d+ km de Mortagne-au-Perche : celle de « L'Aigle » \(37 kg\)\. Il avait 12 ans\.$/);
        const C = read('tq-climat.json'), r = TQ.climateYear(C, 'FR', 1816);
        assert.ok(r.d < -0.8 && r.century.label === 'XIXe siècle', JSON.stringify(r));
        assert.match(TQ.climateText(r), /L’année de sa naissance \(1816\) a été 1,\d °C plus froide que la moyenne du XIXe siècle en France — « l’année sans été »\./);
        assert.strictEqual(TQ.climateYear(C, 'FR', 1700), null, 'pas de série avant 1750 pour la France');
        assert.strictEqual(TQ.climateYear(C, 'GB', 1700).key, 'CET', 'l’Angleterre : HadCET depuis 1659');
        assert.ok(TQ.climateFor(C, life).extremes);
        const g = TQ.glacierFor(read('tq-glaciers.json'), life);
        assert.ok(g && g.km < 50 && g.y >= 1791 && g.y <= 1855, JSON.stringify(g && {n: g.g.n, y: g.y, km: g.km}));
        assert.match(TQ.glacierText(g, life), /^En \d{4} \(à \d+ ans\), le front du glacier « .+ » (descendait|s’arrêtait|était)/);
        const nobody = TQ.lifeOf({person: {id: 2}, events: [ev('BIRT', 1900, 43.6, 1.44, 'Toulouse'), ev('DEAT', 1950, 43.6, 1.44, 'Toulouse')]});
        assert.strictEqual(TQ.glacierFor(read('tq-glaciers.json'), nobody), null, 'pas de glacier près de Toulouse');
    });
    await t('calculs : arbre, sites, pièces, timbre, espérance de vie', async () => {
        const TR = read('tq-arbres.json.gz'), dated = TR.rows.find(r => r[4] != null && r[5] === 9 && r[4] < 1700 && r[7] === 'FR');
        assert.ok(dated, 'un arbre daté en France');
        const kid = TQ.lifeOf({person: {id: 3, gender: 'female'}, events: [ev('BIRT', 1800, dated[2] + 0.01, dated[3], 'Le village'), ev('DEAT', 1860, dated[2], dated[3], 'Le village')]});
        const tr = TQ.treeFor(TR, kid);
        assert.ok(tr && tr.age === 1800 - tr.row[4], JSON.stringify(tr));
        assert.match(TQ.treeText(tr, kid), /avait déjà \d+ ans quand elle est née\./);
        assert.deepStrictEqual(TQ.treeAge(['Q', 'x', 0, 0, 1450, 7], 1800), {age: 300, min: true}, 'XVe siècle : au moins 300 ans en 1800');
        const S = read('tq-sites.json.gz'), carnac = TQ.near(S, 47.584, -3.078, 10);
        assert.ok(carnac.length >= 10, 'Carnac : ' + carnac.length);
        assert.ok(TQ.sitesSummary(carnac).some(x => /menhir|dolmen/.test(x)));
        const P = read('tq-poche.json'); assert.ok(TQ.coinsAt(P, 1911).length >= 1, '1911'); assert.ok(TQ.coinsAt(P, 1965).length >= 1, '1965');
        const R = read('tq-timbre.json');
        assert.strictEqual(TQ.stampAt(R, '1868-05-03').label, '20 centimes');
        assert.strictEqual(TQ.stampAt(R, '1850-08-01').label, '25 centimes');
        assert.strictEqual(TQ.stampAt(R, '1910-03-01'), null, 'un trou reste un trou');
        const y1871 = TQ.stampAt(R, 1871); assert.ok(y1871.other && y1871.unsure, '1871 à l’année près : deux tarifs');
        assert.ok(TQ.stampAt(R, 1878).midYear, '1878 : à partir du 1er mai');
        assert.strictEqual(TQ.stampAt(R, '2026-03-01').label, '1,52 € (lettre verte)');
        const E = read('tq-esperance.json');
        const old = TQ.lifeOf({person: {id: 4, gender: 'male'}, events: [ev('BIRT', 1930, 48.85, 2.35, 'Paris'), ev('DEAT', 2000, 48.85, 2.35, 'Paris')]});
        const le = TQ.lifeExpFor(E, old);
        assert.deepStrictEqual([le.age, le.year, le.lived], [65, 1995, 5]);
        assert.match(TQ.lifeExpText(le), /^À 65 ans, en 1995, un homme pouvait espérer vivre encore 16,1 ans en moyenne\. Il en a vécu 5\.$/);
        assert.strictEqual(TQ.lifeExpFor(E, TQ.lifeOf({person: {gender: 'male'}, events: [ev('BIRT', 1800, 1, 1, 'x'), ev('DEAT', 1870, 1, 1, 'x')]})), null, 'avant 1994 : rien');
    });

    /* ═════════ l'écran ═════════ */
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-tq-'));
    fs.mkdirSync(path.join(tmp, 'media'));
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4'};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$tag = function ($t) use ($pdo) { $s = $pdo->prepare('SELECT id FROM event_types WHERE gedcom_tag=? ORDER BY id LIMIT 1'); $s->execute([$t]); return (int) $s->fetchColumn(); };
$pl = function ($name, $county, $country, $lat, $lon) use ($pdo) { $pdo->prepare('INSERT INTO places(name, county, country, latitude, longitude) VALUES(?,?,?,?,?)')->execute([$name, $county, $country, $lat, $lon]); return (int) $pdo->lastInsertId(); };
$mort = $pl('Mortagne-au-Perche', 'Orne', 'France', 48.5206, 0.5469); $cham = $pl('Chamonix', 'Haute-Savoie', 'France', 45.9237, 6.8694); $paris = $pl('Paris', 'Seine', 'France', 48.85, 2.35);
$per = function ($f, $l, $g, $evs) use ($pdo, $tag) { $pdo->prepare("INSERT INTO persons(first_name,last_name,gender,living_status) VALUES(?,?,?,'deceased')")->execute([$f, $l, $g]); $id = (int) $pdo->lastInsertId();
    foreach ($evs as [$t, $y, $p]) { $pdo->prepare('INSERT INTO events(scope, person_id, event_type_id, year, date_text, place_id) VALUES(\'person\',?,?,?,?,?)')->execute([$id, $tag($t), $y, (string) $y, $p]); } return $id; };
echo json_encode([
  'pierre' => $per('Pierre', 'MAZAUD', 'male', [['BIRT', 1791, $mort], ['DEAT', 1855, $cham]]),
  'marie' => $per('Marie', 'LACOMBE', 'female', [['BIRT', 1930, $paris], ['DEAT', 2010, $paris]]),
  'jean' => $per('Jean', 'DURAND', 'male', [['BIRT', 1700, null]]),
]);`], {cwd: root, encoding: 'utf8', env});
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
        await p.route(/commons\.wikimedia\.org|upload\.wikimedia\.org/, r => r.abort()); // pas d'Internet pendant l'essai
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.cielHeure, null, {timeout: 30000});
        // le fichier n'est pas encore dans index.php : on l'ajoute comme le fera la balise <script>
        if (!(await p.evaluate(() => !!window.LCNDA_EXT.terreQuotidien))) {
            await p.addStyleTag({url: 'assets/css/terre-quotidien.css'}); await p.addScriptTag({url: 'assets/js/heritage-terre-quotidien.js'});
        }
        await p.waitForFunction(() => window.LCNDA_EXT.terreQuotidien, null, {timeout: 10000});
        const openPerson = id => p.evaluate(x => { const A = window.LCNDA_APP; A.state.currentPersonId = x; A.setModule('personnes'); }, id);

        await t('fiche : 🧺 Sa vie de tous les jours, la météorite dans « Il a pu voir… », le climat dans la météo', async () => {
            await openPerson(ID.pierre);
            await p.waitForFunction(() => /glacier/.test(document.querySelector('[data-tq-life]')?.textContent || ''), null, {timeout: 20000});
            const txt = await p.textContent('[data-tq-life]');
            assert.match(txt, /Dans sa poche, à 20 ans \(1811\)/);
            assert.ok(!/météorite/.test(txt), 'les météorites vont dans « Il a pu voir… »');
            await p.waitForFunction(() => /L'Aigle/.test(document.querySelector('[data-ch-seen]')?.textContent || ''), null, {timeout: 20000});
            assert.match(await p.textContent('[data-ch-seen]'), /En 1803, une météorite tombe du ciel à \d+ km de Mortagne-au-Perche/);
            if (await p.$('[data-wx-life]')) {
                await p.waitForSelector('[data-wx-life] [data-tq-clim]', {timeout: 20000});
                assert.match(await p.textContent('[data-wx-life] [data-tq-clim]'), /L’année de sa naissance \(1791\)/);
            }
            await openPerson(ID.jean); await sleep(1500);
            const card = await p.$('[data-tq-life]');
            assert.ok(!card || await card.evaluate(h => h.closest('section.card').hidden), 'rien à dire : pas de bloc');
        });
        await t('Réglages : éteindre « le glacier », ↶ Annuler', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'terre_quotidien'; A.setModule('maintenance'); });
            await p.waitForSelector('[data-tq-settings] [data-tq-tg="glacier"]', {timeout: 20000});
            assert.match(await p.textContent('[data-tq-settings]'), /HadCET|Berkeley/);
            await p.click('[data-tq-settings] [data-tq-tg="glacier"]');
            await p.waitForFunction(() => JSON.parse(localStorage.getItem('genealogie-terre-quotidien') || '{}').glacier === false, null, {timeout: 5000});
            await openPerson(ID.pierre);
            await p.waitForFunction(() => /poche/.test(document.querySelector('[data-tq-life]')?.textContent || ''), null, {timeout: 20000});
            assert.ok(!/glacier/.test(await p.textContent('[data-tq-life]')), 'éteint');
            await p.evaluate(() => [...document.querySelectorAll('.ui-toast')].reverse().find(x => /glacier/.test(x.textContent))?.querySelector('button')?.click()); await sleep(500);
            assert.strictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-terre-quotidien') || '{}').glacier), true, '↶ Annuler');
        });
        await t('village : sites anciens et arbres ; une lettre de 1868 ; le convertisseur', async () => {
            const html = await p.evaluate(() => window.LCNDA_EXT.terreQuotidien.placeHtml({lat: 47.584, lon: -3.078}));
            assert.match(html, /Préhistoire et Antiquité autour du village/); assert.match(html, /dolmen|menhir/);
            // le décor d'une pièce du fil des lettres (Documents → ✉️ Lettres)
            const stamp = await p.evaluate(async () => {
                const ws = document.getElementById('workspace');
                ws.insertAdjacentHTML('beforeend', '<ol class="ong-fil" id="tq-test"><li class="ong-piece"><button class="ong-piece-main" data-ong-doc="9"><span class="ong-txt"><strong>Lettre</strong><small>3 mai 1868 · Lettre · Tulle</small></span></button></li></ol>');
                window.LCNDA_EXT.terreQuotidien.decorateLetters();
                for (let i = 0; i < 50 && !document.querySelector('#tq-test .tq-stamp'); i++) await new Promise(r => setTimeout(r, 100));
                const s = document.querySelector('#tq-test .tq-stamp')?.textContent; document.getElementById('tq-test').remove(); return s;
            });
            assert.strictEqual(stamp, '✉️ 20 centimes le timbre');
            const pocket = await p.evaluate(async () => { const d = document.createElement('div'); document.body.appendChild(d); window.LCNDA_EXT.terreQuotidien.mountPocket(d, {year: 1868});
                for (let i = 0; i < 50 && !/coûtait/.test(d.textContent); i++) await new Promise(r => setTimeout(r, 100)); const s = d.textContent; d.remove(); return s; });
            assert.match(pocket, /Une lettre simple pour la France coûtait 20 centimes/);
            assert.ok(await p.evaluate(() => window.LCNDA_EXT.autrefoisTabs.some(x => x.id === 'poche')), 'onglet du convertisseur');
        });
        await t('🧰 Données et 📋 Listes', async () => {
            const r = await p.evaluate(async () => { const s = window.LCNDA_EXT.dataSources.find(x => x.id === 'tq_climat_annee'); const h = document.createElement('div'); await s.run({year: 1816}, h); return h.textContent; });
            assert.match(r, /L’année 1816 a été .* plus froide .* en France — « l’année sans été »/);
            const lists = await p.evaluate(async () => { const out = {}; for (const l of window.LCNDA_EXT.dataLists.filter(x => x.id.startsWith('tq_'))) { const rows = await l.load(); out[l.id] = [rows.length, !!l.geo, !!l.period, l.fields.every(f => f.key in rows[0])]; } return out; });
            for (const [k, v] of Object.entries(lists)) { assert.ok(v[0] > 0, k + ' : des lignes'); assert.ok(v[3], k + ' : les champs sont dans les lignes'); }
            assert.deepStrictEqual(Object.keys(lists).sort(), ['tq_arbres', 'tq_climat', 'tq_esperance', 'tq_glaciers', 'tq_meteorites', 'tq_poche', 'tq_sites', 'tq_timbre']);
            const per = await p.evaluate(async id => { const s = window.LCNDA_EXT.dataSources.find(x => x.id === 'tq_esperance'); const h = document.createElement('div'); await s.run({person: {id}}, h); return h.textContent; }, ID.marie);
            assert.match(per, /À 65 ans, en 1995, une femme pouvait espérer vivre encore 20,9 ans en moyenne\. Elle en a vécu 15\./);
        });
        assert.deepStrictEqual(errs, [], 'erreurs JS : ' + errs.join(' | '));
    } finally { await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true}); }
    console.log(fails ? `${fails} échec(s)` : 'tout est bon'); process.exit(fails ? 1 : 0);
})();
