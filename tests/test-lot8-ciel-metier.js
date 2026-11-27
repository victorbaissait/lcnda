#!/usr/bin/env node
/* 🌅 Ciel, mer et métier (lot 8) — assets/js/heritage-lot8-ciel-metier.js, assets/css/lot8-ciel-metier.css, lib/lot8_ciel_metier.php,
 * assets/data/l8a-*.json(.gz) fabriqués par scripts/lot8-ciel-metier/*. Les données livrées sont les VRAIES.
 *  1. données : présentes, tailles mesurées (< 15 Mo), source et licence ; chaque phrase citée est là ;
 *  2. calcul (Node) : 🌊 marées de Brest (contrôle sur 1846 tenu à part), lieu au bord de la mer ou non, Marseille « faible » ;
 *     🌅 Pierre MAZAUD né en 1770 à Brest voit le brouillard du Laki à 13 ans, pas à 3 ans, pas aux Antilles ; Toungouska : pas
 *     à Marseille ; 🛠️ « maître forgeron » → forgeron ; 🦠 un allumettier en 1870 (pas en 1950) ; 💰 un tailleur de Paris ;
 *  3. serveur : 🌍 villes du même nom (GeoNames de l'app), 🗺️ vieux plans (Commons, réponses d'essai, pas d'Internet) ;
 *  4. écran : blocs « 🌅 Ciel et mer de sa vie » / « 🛠️ Son métier autrefois » (cachés quand il n'y a rien), lieu, listes,
 *     dataSources, monographie, Réglages (éteindre un sujet, ↶).
 *   node tests/test-lot8-ciel-metier.js */
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
const H = require('../assets/js/heritage-lot8-ciel-metier.js');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const DATA = path.join(root, 'assets/data');
const FILES = ['l8a-ciels.json', 'l8a-marees.json.gz', 'l8a-maladies.json', 'l8a-leplay.json.gz', 'l8a-eaux.json.gz', 'l8a-jardins.json.gz', 'l8a-metiers.json.gz'];
const raw = f => { const b = fs.readFileSync(path.join(DATA, f)); return JSON.parse((b[0] === 0x1f ? zlib.gunzipSync(b) : b).toString('utf8')); };
const has = f => fs.existsSync(path.join(DATA, f));
const life = (p, places, events = [], jobs = []) => ({ok: true, person: {first: 'Pierre', gender: 'male', ...p}, places, events, jobs, text: ''});
const BREST = {name: 'Brest', country: 'France', lat: 48.3904, lon: -4.4861};
const phpPath = findPhp([devBundledPhp()]) || 'php';

(async () => {
    await t('données : tailles mesurées (< 15 Mo en tout), source, licence', async () => {
        let size = 0;
        for (const f of FILES) {
            if (!has(f)) { console.log(`  (${f} absent : pas encore fabriqué)`); continue; }
            const s = fs.statSync(path.join(DATA, f)).size; size += s;
            const d = raw(f);
            assert.ok(d.source && d.licence && d.url, f);
            const n = d.events?.length ?? d.stations?.length ?? (d.trades ? Object.keys(d.trades).length : d.rows?.length);
            assert.ok(n >= 5, `${f} : ${n}`);
            console.log(`  ${f} : ${n} lignes, ${(s / 1024).toFixed(1)} Ko — ${String(d.licence).slice(0, 80)}`);
        }
        assert.ok(size < 15e6, `${size} octets`);
        console.log(`  (taille dans l’app : ${(size / 1e6).toFixed(2)} Mo)`);
        for (const e of raw('l8a-ciels.json').events) assert.ok(e.quote && /^https:\/\/fr\.wikipedia\.org\/wiki\//.test(e.url) && e.from && e.what, e.id);
        for (const r of raw('l8a-maladies.json').rows) { assert.ok(r.quote && r.url && r.jobs && r.from < r.to, r.id); new RegExp(r.jobs); }
        const L = raw('l8a-leplay.json.gz');
        for (const r of L.rows) { assert.ok(r.total > 100 && r.food > 0 && r.food_pct > 10 && r.food_pct < 95 && /archive\.org\/details\//.test(r.page), r.n); assert.ok(Math.abs(r.food / r.total * 100 - r.food_pct) <= 0.6, `${r.n} : la part se recoupe`); }
        for (const m of L.meals) assert.ok(m.quote && /archive\.org\/details\//.test(m.url) && L.rows.some(r => r.n === m.n), m.n);
    });

    const D = raw('l8a-marees.json.gz');
    await t('🌊 Brest : contrôle sur 1846 (mesures tenues à part) à quelques minutes ; 4 marées par jour ; lieu au bord de la mer ou non', async () => {
        const st = D.stations.find(s => s.name === 'Brest');
        assert.ok(st && st.check && st.check.held_out && st.check.year === 1846 && st.check.median_min <= 5, JSON.stringify(st?.check));
        const day = H.tideOfDay(D, BREST.lat, BREST.lon, '1851-03-12');
        assert.ok(day && day.station.name === 'Brest' && !day.weak, 'Brest');
        assert.ok(day.list.length >= 3 && day.list.length <= 4, `${day.list.length} marées`);
        for (let i = 1; i < day.list.length; i++) assert.notStrictEqual(day.list[i].high, day.list[i - 1].high, 'haute et basse alternent');
        const hi = day.list.filter(x => x.high); if (hi.length === 2) { const gap = (hi[1].jd - hi[0].jd) * 24; assert.ok(gap > 12 && gap < 13, `${gap} h entre deux pleines mers`); }
        assert.ok(hi.every(x => x.h > st.z0) && day.list.filter(x => !x.high).every(x => x.h < st.z0));
        assert.strictEqual(H.tideOfDay(D, 48.8566, 2.3522, '1851-03-12'), null, 'Paris : pas de mer');
        assert.strictEqual(H.tideOfDay(D, 47.996, -4.102, '1851-03-12'), null, 'Quimper : trop loin du port de mesure');
        assert.strictEqual(H.tideOfDay(D, 48.65, -2.0, '1851-03-12'), null, 'Saint-Malo : aucun port de mesure libre assez proche');
        assert.strictEqual(H.tideOfDay(D, BREST.lat, BREST.lon, '1851'), null, 'pas de jour : rien');
        const mars = H.tideOfDay(D, 43.296, 5.37, '1900-07-14');
        assert.ok(mars && mars.weak, 'Marseille : marée faible, pas d’heure');
        console.log(`  (Brest, 12 mars 1851 : ${day.list.map(x => `${x.high ? 'PM' : 'BM'} ${Math.floor(x.local.min / 60)} h ${String(x.local.min % 60).padStart(2, '0')}`).join(', ')} — heure du soleil ; ports : ${D.stations.map(s => s.name).join(', ')})`);
    });

    const SK = raw('l8a-ciels.json').events;
    await t('🌅 Laki à 13 ans à Brest, pas à 3 ans ni aux Antilles ; Toungouska : Paris oui, Marseille non', async () => {
        const ev = (y, pl) => ({tag: 'RESI', year: y, place: pl.name, lat: pl.lat, lon: pl.lon});
        const got = H.skiesForLife(SK, life({birth: 1770, death: 1840}, [BREST], [ev(1780, BREST)]));
        assert.ok(got.some(x => x.ev.id === 'laki' && x.age === 13), JSON.stringify(got.map(x => [x.ev.id, x.age])));
        assert.ok(got.some(x => x.ev.id === 'tambora'), 'et les ciels jaunes de 1816');
        assert.ok(!H.skiesForLife(SK, life({birth: 1780, death: 1800}, [BREST], [ev(1785, BREST)])).some(x => x.ev.id === 'laki'), '3 ans : non');
        const FDF = {name: 'Fort-de-France', lat: 14.6, lon: -61.07};
        assert.deepStrictEqual(H.skiesForLife(SK, life({birth: 1760, death: 1830}, [FDF], [ev(1783, FDF)])).map(x => x.ev.id).filter(i => i === 'laki'), [], 'aux Antilles : non');
        const PARIS = {name: 'Paris', lat: 48.8566, lon: 2.3522}, MARS = {name: 'Marseille', lat: 43.3, lon: 5.37};
        assert.ok(H.skiesForLife(SK, life({birth: 1890, death: 1950}, [PARIS], [ev(1908, PARIS)])).some(x => x.ev.id === 'toungouska'), 'Paris');
        assert.ok(!H.skiesForLife(SK, life({birth: 1890, death: 1950}, [MARS], [ev(1908, MARS)])).some(x => x.ev.id === 'toungouska'), 'Marseille');
        assert.ok(!H.skiesForLife(SK, life({birth: 1890, death: 1905}, [PARIS], [ev(1900, PARIS)])).some(x => x.ev.id === 'toungouska'), 'mort avant');
    });

    const dict = JSON.parse(fs.readFileSync(path.join(DATA, 'metiers-anciens.json'), 'utf8'));
    await t('🛠️ le métier écrit sur la fiche → le métier du dictionnaire (comme lib/metiers_anciens.php)', async () => {
        const ix = H.tradeIndex(dict);
        assert.strictEqual(H.tradeMatch(ix, 'Forgeron'), 'forgeron');
        assert.strictEqual(H.tradeMatch(ix, 'maître forgeron'), 'forgeron');
        assert.match(H.tradeMatch(ix, 'tisserand en toile'), /^tisserand/);
        assert.strictEqual(H.tradeMatch(ix, 'zzz'), null);
        if (has('l8a-metiers.json.gz')) {
            const M = raw('l8a-metiers.json.gz');
            const j = H.jobsOf(life({birth: 1800}, [], [], [{text: 'maréchal-ferrant'}, {text: 'forgeron'}]), dict, M);
            assert.ok(j.length >= 1 && j.some(x => x.occ), JSON.stringify(j.map(x => [x.text, x.key, x.q])));
            assert.ok(j.find(x => x.key === 'forgeron')?.occ?.tools?.some(x => /enclume/.test(x.n)), 'forgeron : l’enclume');
            const c = H.jobsOf(life({birth: 1800}, [], [], [{text: 'maître cordonnier'}]), dict, M)[0];
            assert.ok(c?.occ?.saints?.some(x => /Crépin/.test(x.n) && x.feasts.includes('25 octobre')), 'cordonnier : saint Crépin, 25 octobre');
            const n = k => Object.values(M.occ).filter(o => o[k]?.length).length;
            for (const o of Object.values(M.occ)) for (const a of o.art || []) assert.ok(a.lic && a.page && /^https:\/\/(upload|thumb|commons)\.wikimedia\.org\//.test(a.thumb), a.img);
            console.log(`  (${Object.keys(M.trades).length} métiers reliés à Wikidata ; avec saint : ${n('saints')}, outils : ${n('tools')}, œuvres : ${n('art')})`);
        }
    });

    await t('🦠 allumettier en 1870 : la nécrose du phosphore ; en 1950 ou boulanger : pas celle-là ; 💰 un tailleur de Paris en 1860', async () => {
        const R = raw('l8a-maladies.json').rows;
        const a = H.diseasesForLife(R, life({birth: 1840, death: 1900}, [], [], [{text: 'allumettier'}]));
        assert.ok(a.some(x => x.r.id === 'phosphore'), JSON.stringify(a.map(x => x.r.id)));
        assert.ok(!H.diseasesForLife(R, life({birth: 1930, death: 2000}, [], [], [{text: 'allumettier'}])).some(x => x.r.id === 'phosphore'));
        assert.ok(H.diseasesForLife(R, life({birth: 1840, death: 1900}, [], [], [{text: 'boulanger'}])).every(x => x.r.id !== 'phosphore'));
        const L = raw('l8a-leplay.json.gz');
        const b = H.budgetFor(L, life({birth: 1825, death: 1890}, [{name: 'Paris', country: 'France'}], [], [{text: 'tailleur d’habits'}]));
        assert.ok(b && b.r.n === 6 && b.sameCountry, JSON.stringify(b && [b.r.n, b.r.title]));
        assert.ok(!H.budgetFor(L, life({birth: 1825}, [], [], [{text: 'notaire'}])), 'notaire : aucune famille');
        const v = H.budgetFor(L, life({birth: 1820, death: 1880}, [{name: 'La Rochelle', full: 'La Rochelle, Aunis', country: 'France'}], [], [{text: 'vigneron'}]));
        assert.ok(v && [41, 42].includes(v.r.n), JSON.stringify(v && v.r.title));
        console.log(`  (Le Play : ${L.rows.length} familles, ${L.meals.length} repas cités ; ${Object.keys(L.skipped).length} écartées)`);
    });

    await t('♨️ 🏞️ autour de Vichy : des villes d’eaux à moins de 50 km', async () => {
        const E = H.table(raw('l8a-eaux.json.gz'));
        const n = H.near(E, 46.127, 3.4258, 50);
        assert.ok(n.length >= 1 && n[0].km < 10, JSON.stringify(n.slice(0, 3).map(x => [x.r.n, x.km])));
        assert.deepStrictEqual(H.near(E, 46.0, -20.0, 50), [], 'en plein océan : rien');
        if (has('l8a-jardins.json.gz')) { const J = H.table(raw('l8a-jardins.json.gz')); assert.ok(H.near(J, 48.8049, 2.1204, 10).length >= 1, 'Versailles'); }
    });

    /* ─────────── serveur ─────────── */
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-l8a-'));
    fs.mkdirSync(path.join(tmp, 'media'));
    const fx = path.join(tmp, 'fx'); fs.mkdirSync(fx);
    const W = o => JSON.stringify(o);
    fs.writeFileSync(path.join(fx, 'wd_search_commune.json'), W({query: {search: [{title: 'Q12345', snippet: 'Tulle'}]}}));
    fs.writeFileSync(path.join(fx, 'wd_commune.json'), W({entities: {Q12345: {labels: {fr: {value: 'Tulle'}}, claims: {P373: [{mainsnak: {datavalue: {value: 'Tulle'}}}], P625: [{mainsnak: {datavalue: {value: {latitude: 45.267, longitude: 1.768}}}}]}}}}));
    fs.writeFileSync(path.join(fx, 'l8a_subcats.json'), W({query: {categorymembers: [{title: 'Category:Maps of Tulle'}, {title: 'Category:Churches in Tulle'}]}}));
    fs.writeFileSync(path.join(fx, 'l8a_subsub_0.json'), W({query: {categorymembers: [{title: 'Category:Old maps of Tulle'}]}}));
    const file = (title, date, lic) => ({title, imageinfo: [{mime: 'image/jpeg', thumburl: 'https://upload.wikimedia.org/x.jpg', descriptionurl: 'https://commons.wikimedia.org/wiki/' + encodeURIComponent(title), extmetadata: {DateTimeOriginal: {value: date}, LicenseShortName: {value: lic}, Artist: {value: 'Cassini'}, ObjectName: {value: title.replace(/^File:|\.jpg$/g, '')}}}]});
    fs.writeFileSync(path.join(fx, 'l8a_files_0.json'), W({query: {pages: [file('File:Plan de Tulle 1780.jpg', '1780', 'Public domain'), file('File:Tulle 2010.jpg', '2010', 'CC BY-SA 4.0')]}}));
    fs.writeFileSync(path.join(fx, 'l8a_files_1.json'), W({query: {pages: [file('File:Carte de Tulle 1850.jpg', '', 'CC BY-NC 2.0'), file('File:Carte de Tulle.jpg', '', 'Public domain')]}})); // « Maps of » : sans date, pas gardée
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4', GENEALOGY_TEST: '1', LCNDA_TEST_CPLUS_DIR: fx};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start,occupation) VALUES(1,'Pierre','MAZAUD','male','deceased',1,'tailleur d’habits'),(2,'Marie','LACOMBE','female','deceased',0,''),(3,'Jean','DURAND','male','deceased',0,'allumettier')");
$pdo->exec("INSERT INTO places(id,name,county,country,latitude,longitude) VALUES(1,'Brest','Finistère','France',48.3904,-4.4861),(2,'Tulle','Corrèze','France',45.2670,1.7680),(3,'Paris','Seine','France',48.8566,2.3522)");
$t = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn();
$ins = $pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,date_text,year,sort_date,place_id) VALUES('person',?,?,?,?,?,?)");
$ins->execute([1,$t('BIRT'),'12 mars 1770',1770,'1770-03-12',1]); $ins->execute([1,$t('MARR'),'1798',1798,'1798',3]); $ins->execute([1,$t('DEAT'),'1840',1840,'1840',3]);
$ins->execute([2,$t('BIRT'),'1842',1842,'1842',2]); $ins->execute([2,$t('DEAT'),'1850',1850,'1850',2]);
$ins->execute([3,$t('BIRT'),'1840',1840,'1840',3]); $ins->execute([3,$t('DEAT'),'1900',1900,'1900',3]);
echo json_encode(['ok' => 1]);`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0 || !/"ok"/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }

    await t('🗺️ vieux plans (réponses d’essai, sans Internet) : avant 1950 seulement, licence de chaque image, « libre » ou non', async () => {
        const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`require 'lib/bootstrap.php'; require 'lib/lot8_ciel_metier.php'; echo json_encode(l8a_maps(db(), ['name' => 'Tulle', 'lat' => 45.267, 'lon' => 1.768, 'country' => 'France']), JSON_UNESCAPED_UNICODE);`], {cwd: root, encoding: 'utf8', env});
        const j = JSON.parse(r.stdout);
        assert.ok(j.ok, r.stdout + r.stderr);
        assert.deepStrictEqual(j.categories, ['Old maps of Tulle', 'Maps of Tulle']);
        assert.deepStrictEqual(j.items.map(x => [x.title, x.year, x.free]), [['Plan de Tulle 1780', 1780, true], ['Carte de Tulle 1850', 1850, false]], JSON.stringify(j.items));
        assert.ok(j.items.every(x => x.licence && x.page && x.author), 'auteur et licence');
    });
    await t('🌍 villes du même nom : le répertoire GeoNames de l’app (sans Internet), pas la commune elle-même', async () => {
        const env2 = {...env}; delete env2.GENEALOGY_SKIP_REFERENCE; env2.GENEALOGY_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-l8a-w-'));
        const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`require 'lib/paths.php'; require 'lib/bootstrap.php'; require 'lib/lot8_ciel_metier.php'; echo json_encode([l8a_homonyms(['name' => 'Saint-Malo', 'country' => 'France', 'lat' => 48.65, 'lon' => -2.0]), l8a_homonyms(['name' => 'Montréal', 'country' => 'France'])], JSON_UNESCAPED_UNICODE);`], {cwd: root, encoding: 'utf8', env: env2, timeout: 240000});
        try { fs.rmSync(env2.GENEALOGY_DATA_DIR, {recursive: true, force: true}); } catch (_) {}
        const [a, b] = JSON.parse(r.stdout || '[]');
        assert.ok(a?.ok, r.stdout + r.stderr);
        assert.ok(a.items.some(x => x.cc === 'CA'), 'Saint-Malo au Québec');
        assert.ok(a.items.every(x => x.cc !== 'FR'), 'pas en France');
        assert.ok(b.items.some(x => x.cc === 'CA' && x.population > 1e6), 'Montréal (Canada)');
        console.log(`  (Saint-Malo : ${a.items.map(x => `${x.state}, ${x.country}`).join(' ; ')} ; Montréal : ${b.total} ailleurs)`);
    });

    /* ─────────── écran ─────────── */
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const errs = [];
    try {
        const ctx = await browser.newContext({viewport: {width: 1440, height: 900}});
        await ctx.route(/^https:\/\/(upload|thumb|commons)\.wikimedia\.org\//, r => r.abort()); // pas d'Internet dans l'essai
        const p = await ctx.newPage();
        p.on('pageerror', e => errs.push(e.message));
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_APP?.defaultPersonBlocks, null, {timeout: 30000});
        // index.php ne charge pas encore heritage-lot8-ciel-metier.js : on l'ajoute (comme le feront les balises)
        if (!(await p.evaluate(() => !!window.LCNDA_EXT?.cielMetier))) { await p.addStyleTag({url: base + 'assets/css/lot8-ciel-metier.css'}); await p.addScriptTag({url: base + 'assets/js/heritage-lot8-ciel-metier.js'}); }
        await p.waitForFunction(() => !!window.LCNDA_EXT?.cielMetier);
        await p.evaluate(() => { const A = window.LCNDA_APP, B = A.defaultPersonBlocks; for (const [id, l] of [['l8a_ciel', '🌅 Ciel et mer de sa vie'], ['l8a_metier', '🛠️ Son métier autrefois']]) if (!B.some(b => b[0] === id)) B.push([id, l]); });

        await t('fiche : « 🌅 Ciel et mer » (Laki à 13 ans, marée du jour de sa naissance à Brest) et « 🛠️ Son métier » (Le Play, ↗ source)', async () => {
            await p.evaluate(() => { window.LCNDA_SHEET_LAZY_OFF = true; /* ce bloc essayé en entier (le chargement à mesure : test-fiche-lazy.js) */ const A = window.LCNDA_APP; A.state.currentPersonId = 1; A.setModule('personnes'); });
            await p.waitForSelector('[data-l8a-person="1"][data-l8a-kind="ciel"] .l8a-row', {timeout: 30000});
            const sky = await p.textContent('[data-l8a-person="1"][data-l8a-kind="ciel"]');
            assert.match(sky, /Pierre avait 13 ans l’été 1783 : le volcan Laki/);
            assert.match(sky, /Le jour de sa naissance \(12 mars 1770\), la mer était haute vers \d+ h( \d\d)?( et vers \d+ h( \d\d)?)? à Brest \(port de mesure le plus proche, (moins d’1 km|\d+ km)\)/);
            assert.match(sky, /estimation calculée/);
            assert.ok(await p.$('[data-l8a-kind="ciel"] a[href^="https://fr.wikipedia.org/wiki/"]'), 'la source à un clic');
            await p.waitForSelector('[data-l8a-person="1"][data-l8a-kind="metier"] .l8a-row', {timeout: 30000});
            const job = await p.textContent('[data-l8a-person="1"][data-l8a-kind="metier"]');
            assert.match(job, /Une famille de tailleurs d’habits de Paris en 1856 gagnait environ [\d\s\u202f\u00a0]+ F par an ; la nourriture faisait 66,3 % des dépenses/);
            assert.match(job, /Ce qu’on mangeait chez des tailleurs d’habits : « Déjeuner \(8 heures\)/);
            assert.ok(await p.$('[data-l8a-kind="metier"] a[href*="archive.org/details/"]'));
        });
        await t('fiche sans rien à dire : les blocs restent cachés ; un allumettier : la maladie, sans alarme', async () => {
            await p.evaluate(() => { window.LCNDA_SHEET_LAZY_OFF = true; /* ce bloc essayé en entier (le chargement à mesure : test-fiche-lazy.js) */ const A = window.LCNDA_APP; A.state.currentPersonId = 2; A.setModule('personnes'); });
            await p.waitForSelector('[data-l8a-person="2"]', {state: 'attached', timeout: 20000}); await sleep(1500);
            assert.ok(await p.evaluate(() => [...document.querySelectorAll('[data-l8a-person="2"]')].every(h => h.closest('section.card').hidden)));
            await p.evaluate(() => { window.LCNDA_SHEET_LAZY_OFF = true; /* ce bloc essayé en entier (le chargement à mesure : test-fiche-lazy.js) */ const A = window.LCNDA_APP; A.state.currentPersonId = 3; A.setModule('personnes'); });
            await p.waitForSelector('[data-l8a-person="3"][data-l8a-kind="metier"] .l8a-row', {timeout: 30000});
            const txt = await p.textContent('[data-l8a-person="3"][data-l8a-kind="metier"]');
            assert.match(txt, /Dans son métier \(allumettier\), les ouvriers respiraient les vapeurs du phosphore blanc/);
            assert.match(txt, /pas un diagnostic/);
        });
        await t('lieu : ♨️ villes d’eaux près de Vichy ; registres : listes, dataSources, monographie', async () => {
            const html = await p.evaluate(async () => { const h = document.createElement('div'); document.body.appendChild(h); await window.LCNDA_EXT.cielMetier.placeInto(h, {id: 0, name: 'Cusset', country: 'France', lat: 46.134, lon: 3.456}, {parts: ['eaux', 'jardins']}); const x = h.innerHTML; h.remove(); return x; });
            assert.match(html, /villes d’eaux|Une ville d’eaux/); assert.match(html, /wikidata\.org/);
            const r = await p.evaluate(async () => {
                const E = window.LCNDA_EXT;
                const lists = E.dataLists.filter(l => l.id.startsWith('l8a_'));
                const rows = {}; for (const l of lists) { try { rows[l.id] = (await l.load()).length; } catch (e) { rows[l.id] = 'ERR ' + e.message; } }
                const ds = E.dataSources.filter(d => d.id.startsWith('l8a_')).map(d => d.id);
                const host = document.createElement('div'); document.body.appendChild(host);
                const ok = await E.dataSources.find(d => d.id === 'l8a_budget').run({person: {id: 1}}, host); const txt = host.textContent; host.remove();
                return {rows, ds, ok, txt, mono: E.monographSections.filter(m => m.id.startsWith('l8a_')).map(m => m.id)};
            });
            for (const id of ['l8a_ciels', 'l8a_marees', 'l8a_eaux', 'l8a_maladies', 'l8a_budgets']) assert.ok(r.rows[id] > 0, `${id} : ${r.rows[id]}`);
            assert.ok(r.ds.length >= 11 && r.ok && /Le Play/.test(r.txt), JSON.stringify(r).slice(0, 300));
            assert.deepStrictEqual(r.mono, ['l8a_homonymes', 'l8a_plans', 'l8a_eaux', 'l8a_jardins']);
            console.log(`  (listes : ${Object.entries(r.rows).map(([k, v]) => `${k} ${v}`).join(', ')})`);
        });
        await t('Réglages → « 🌅 Ciel, mer et métier » : éteindre la marée (↶ rallume), À propos des données', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'lot8_ciel_metier'; A.setModule('maintenance'); });
            await p.waitForSelector('[data-l8a-settings] [data-l8a-tg="maree"] input', {timeout: 20000});
            assert.match(await p.textContent('[data-l8a-settings]'), /UHSLC|University of Hawaii/);
            await p.click('[data-l8a-tg="maree"] input');
            assert.strictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-lot8-ciel-metier')).maree), false);
            const txt = await p.evaluate(async () => { const h = document.createElement('div'); document.body.appendChild(h); await window.LCNDA_EXT.cielMetier.personInto(h, 1, 'ciel'); const x = h.textContent; h.remove(); return x; });
            assert.ok(!/la mer était haute/.test(txt) && /Laki/.test(txt), 'la marée est cachée, le ciel reste');
            await p.locator('button', {hasText: '↶ Annuler'}).last().click();
            await sleep(400);
            assert.notStrictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-lot8-ciel-metier')).maree), false, '↶ rallume');
        });
        await t('aucune erreur JavaScript', async () => { assert.deepStrictEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill();
        try { fs.rmSync(tmp, {recursive: true, force: true}); } catch (_) {}
    }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})();
