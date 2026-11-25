#!/usr/bin/env node
/* 📇 Annuaires du commerce de Paris (1787–1914) et 💡 brevets d'invention (lib/brevets_annuaires.php,
 * assets/js/heritage-brevets-annuaires.js, scripts/brevets-annuaires/build-annuaires.py, .github/workflows/brevets-annuaires.yml).
 * Le pack d'essai est fabriqué par le vrai programme à partir de VRAIES lignes de la source (tests/fixtures/brevets-annuaires/ :
 * les entrées MAZAUD, LACOMBE et quelques DURAND des annuaires de 1855 et 1898, telles que publiées par SoDUCo sur NAKALA,
 * et deux lignes de bruit), mises dans un zip comme directories-ListNoms.zip.
 * Le « serveur » des données (la version « brevets-annuaires-donnees » du dépôt) est un dossier local (GENEALOGY_TEST=1 + LCNDA_TEST_BA_DIR).
 *  1. fabrication : noms, prénoms entre parenthèses, adresses, rues du géocodeur, page Gallica ; clés des noms (Python = PHP) ;
 *  2. serveur : le sommaire, par tranches, reprendre, abandonner, un pack incomplet refusé ;
 *  3. fiche : l'offre discrète (✕ retenu, ↶) → Réglages « ⤓ Installer » (↶) → « 📇 En 1898, un MAZAUD, boulanger… ↗ source »,
 *     « ✓ C'est lui » (source + lieu de résidence, ↶), « ✗ Pas lui » (↶) ; pas de piste hors de Paris ; un autre prénom écarte ;
 *  4. Listes (ba_list : nom, rue, année, autour de), calque de carte (ba_map), monographie de Paris (ba_place),
 *     « 🔎 Ce qui le concerne » (LCNDA_EXT.dataSources), « Où chercher » (💡 brevets : lien INPI, nom à copier), 🗑 Supprimer (↶).
 *   node tests/test-brevets-annuaires.js */
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

(async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-ba-')), fx = path.join(tmp, 'fx'), site = path.join(tmp, 'site');
    [path.join(tmp, 'media'), site, fx].forEach(d => fs.mkdirSync(d, {recursive: true}));
    const script = path.join(root, 'scripts/brevets-annuaires/build-annuaires.py'), fixDir = path.join(root, 'tests/fixtures/brevets-annuaires');
    // le zip d'essai : les mêmes chemins que directories-ListNoms.zip (« 1855/directories-ListNoms-1855.csv »)
    const zip = path.join(fx, 'directories-ListNoms.zip');
    const mz = spawnSync('python3', ['-I', '-c', `import zipfile, sys
z = zipfile.ZipFile(sys.argv[1], 'w', zipfile.ZIP_DEFLATED)
for y in ('1855', '1898'): z.write(sys.argv[2] + '/directories-ListNoms-' + y + '.csv', y + '/directories-ListNoms-' + y + '.csv')
z.close()`, zip, fixDir], {encoding: 'utf8'});
    if (mz.status !== 0) { console.error(mz.stderr); process.exit(1); }
    const mk = spawnSync('python3', ['-I', script, 'pack', '--dossier', fx, '--zip', zip, '--sources-csv', path.join(fixDir, 'directories_sources-extrait.csv')], {encoding: 'utf8'});
    if (mk.status !== 0) { console.error(mk.stderr || mk.stdout); process.exit(1); }
    const rep = JSON.parse(fs.readFileSync(path.join(fx, 'ba-rapport.json'), 'utf8')).annuaires;
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const pyq = (sql) => JSON.parse(spawnSync('python3', ['-I', '-c', `import sqlite3, json, sys
c = sqlite3.connect(sys.argv[1]); print(json.dumps(c.execute(sys.argv[2]).fetchall()))`, path.join(fx, 'ba-annuaires.sqlite'), sql], {encoding: 'utf8'}).stdout);

    /* ── 1. la fabrication ── */
    await t('fabrication : les vraies lignes lues (bruit écarté), prénoms entre parenthèses, adresse imprimée et rue du géocodeur, page Gallica', async () => {
        assert.deepStrictEqual(rep.years, {1855: 63, 1898: 138}, JSON.stringify(rep.years));
        assert.strictEqual(rep.records, 201); assert.strictEqual(rep.no_name, 4, 'les lignes sans nom'); assert.strictEqual(rep.books, 4);
        assert.deepStrictEqual(pyq("select n, g, a, num, ad, (select name from streets where id=s), q, z, y, p from e where k='MAZAUD' and a='boulanger' order by id limit 1")[0],
            ['Mazaud', '', 'boulanger', '4', 'cité Guénot', 'rue Guenot', 55, 1, 1898, 747]);
        assert.deepStrictEqual(pyq("select n, g, a from e where k='LACOMBE' and g='Paul'")[0], ['Lacombe', 'Paul', "trésorier de la Société de l'histoire de Paris et de l'Ile-de-France"]);
        assert.deepStrictEqual(pyq("select name from streets where name like '%Enghien%'")[0], ["rue d'Enghien"], 'le nom de rue remis en minuscules');
        assert.deepStrictEqual(pyq("select code, label, url from books where code='Paris_adresses_1898'")[0].slice(1), ['Paris-Adresses', pyq("select url from books where code='Paris_adresses_1898'")[0][0]]);
        assert.match(pyq("select url from books where code='Bottin3_1855a'")[0][0], /^https:\/\/gallica\.bnf\.fr\/ark:\/12148\/bpt6k62671515$/);
        assert.deepStrictEqual(pyq('select y, lo, hi, n from years order by y'), [[1855, 1, 63, 63], [1898, 64, 201, 138]]);
        const meta = Object.fromEntries(pyq('select key, value from meta'));
        assert.strictEqual(meta.kind, 'annuaires'); assert.strictEqual(meta.licence, 'Licence Ouverte Etalab 2.0'); assert.match(meta.mention, /10\.34847\/nkl\.98eem49t/);
    });
    await t('fabrication : les clés des noms sont les mêmes en Python et en PHP', async () => {
        const words = ['Le Bœuf', 'de La Tour-d’Auvergne', 'ZIVRÉ', 'Lacombe', 'Ménil', 'Çà'];
        const py = spawnSync('python3', ['-I', '-c', `import importlib.util, json, sys
s = importlib.util.spec_from_file_location('b', sys.argv[1]); b = importlib.util.module_from_spec(s); s.loader.exec_module(b)
print(json.dumps({'keys': [b.cle(w) for w in json.loads(sys.argv[2])], 'names': [b.parse_name(x) for x in ["'Bechet (Ernest'", "'Mazaud frères'", "'Caron ainé'", "'Mme Durand'", "'Aboville (d'')'"]]}))`, script, JSON.stringify(words)], {encoding: 'utf8'});
        const php = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', `require 'lib/paths.php'; require 'lib/bootstrap.php'; require 'lib/brevets_annuaires.php'; echo json_encode(array_map('ba_key', json_decode($argv[1], true)));`, JSON.stringify(words)], {cwd: root, encoding: 'utf8', env: {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_SKIP_REFERENCE: '1'}});
        const P = JSON.parse(py.stdout);
        assert.deepStrictEqual(P.keys, JSON.parse(php.stdout.slice(php.stdout.indexOf('['))));
        assert.deepStrictEqual(P.names.map(x => x[1]), ['BECHET', 'MAZAUD', 'CARON', 'DURAND', 'ABOVILLE']);
        assert.strictEqual(P.names[0][2], 'Ernest');
    });

    /* ── le « serveur » : le pack en 2 morceaux ── */
    const buf = fs.readFileSync(path.join(fx, 'ba-annuaires.sqlite.gz')), cut = [0, Math.floor(buf.length / 2), buf.length];
    const parts = [0, 1].map(i => { const name = `ba-annuaires.sqlite.gz.00${i}`; fs.writeFileSync(path.join(site, name), buf.subarray(cut[i], cut[i + 1])); return {name, size: cut[i + 1] - cut[i]}; });
    fs.writeFileSync(path.join(site, 'brevets-annuaires-manifest.json'), JSON.stringify({version: '2026-11', packs: {annuaires: {size: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex'), built: '2026-11-25', records: rep.records, sqlite_size: rep.sqlite_size, parts}}}));

    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4', GENEALOGY_TEST: '1', LCNDA_TEST_BA_DIR: site};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start,occupation) VALUES(1,'Jean','MAZAUD','male','deceased',1,''),(2,'Paul','LACOMBE','male','deceased',0,''),(3,'Pierre','DURAND','male','deceased',0,''),(4,'Henri','LACOMBE','male','deceased',0,''),(5,'Rex','MAZAUD','male','deceased',0,'')");
$pdo->exec("UPDATE persons SET kind='animal' WHERE id=5");
$pdo->exec("INSERT INTO places(id,name,county,country) VALUES(1,'Paris','Paris','France'),(2,'Lyon','Rhône','France'),(3,'Limoges','Haute-Vienne','France')");
$t = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn();
$ev = $pdo->prepare('INSERT INTO events(scope,person_id,event_type_id,date_text,year,place_id,title) VALUES(?,?,?,?,?,?,?)');
$ev->execute(['person', 1, $t('BIRT'), '1862', 1862, 3, '']); $ev->execute(['person', 1, $t('OCCU'), '1895', 1895, 1, 'Boulanger']); $ev->execute(['person', 1, $t('DEAT'), '1920', 1920, 1, '']);
$ev->execute(['person', 2, $t('BIRT'), '1850', 1850, 1, '']); $ev->execute(['person', 2, $t('DEAT'), '1910', 1910, 1, '']);
$ev->execute(['person', 3, $t('BIRT'), '1830', 1830, 2, '']); $ev->execute(['person', 3, $t('DEAT'), '1900', 1900, 2, '']);
$ev->execute(['person', 4, $t('BIRT'), '1840', 1840, 1, '']); $ev->execute(['person', 4, $t('DEAT'), '1905', 1905, 1, '']);
$ev->execute(['person', 5, $t('BIRT'), '1890', 1890, 1, '']);
echo json_encode(['ok' => 1]);`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0 || !/"ok"/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const errs = [];
    const db = sql => JSON.parse(spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', `$p = new PDO('sqlite:' . $argv[1]); echo json_encode($p->query($argv[2])->fetchAll(PDO::FETCH_ASSOC));`, path.join(tmp, 'genealogy.sqlite'), sql], {encoding: 'utf8'}).stdout);
    try {
        const p = await (await browser.newContext({viewport: {width: 1440, height: 900}})).newPage();
        p.on('pageerror', e => errs.push(e.message));
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_APP.defaultMaintenanceTabs, null, {timeout: 30000});
        // pas encore branché dans index.php : on charge les fichiers comme le ferait la page
        if (!(await p.evaluate(() => !!window.LCNDA_EXT?.brevetsAnnuaires))) { await p.addStyleTag({url: 'assets/css/brevets-annuaires.css'}); await p.addScriptTag({url: 'assets/js/heritage-brevets-annuaires.js'}); }
        await p.waitForFunction(() => window.LCNDA_EXT?.brevetsAnnuaires);
        const api = (x, q = {}) => p.evaluate(([y, z]) => window.LCNDA_APP.api(y, z).catch(e => ({error: e.message})), [x, q]);
        const post = (a, b) => p.evaluate(async ([x, y]) => { try { const r = await window.LCNDA_APP.api(x, {}, {method: 'POST', body: y}); return r.result || r; } catch (e) { return {error: e.message}; } }, [a, b]);
        const openPerson = async id => { await p.evaluate(i => window.LCNDA_APP.openPersonById(i), id); await p.waitForSelector('.person-page', {timeout: 20000}); await sleep(900); };
        const toastWait = re => p.waitForFunction(r => [...document.querySelectorAll('.ui-toast')].some(x => new RegExp(r).test(x.textContent)), re, {timeout: 30000});
        const toastClick = async re => { await toastWait(re); await p.evaluate(r => [...document.querySelectorAll('.ui-toast')].reverse().find(x => new RegExp(r).test(x.textContent)).querySelector('button').click(), re); await sleep(900); };
        const settings = async () => { await p.evaluate(() => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'brevets_annuaires'; A.setModule('maintenance'); }); await p.waitForSelector('.ba-set .ba-base', {timeout: 20000}); };

        await t('Réglages : « 📇 Annuaires et brevets » avec les packs de données ; rien d’installé ; qui peut y être', async () => {
            const tabs = await p.evaluate(() => window.LCNDA_APP.defaultMaintenanceTabs.map(x => x[0]));
            assert.ok(tabs.indexOf('brevets_annuaires') > tabs.indexOf('meteo') && tabs.indexOf('meteo') >= 0, tabs.join(','));
            assert.strictEqual((await api('ba_status')).installed, false);
            const d1 = await api('ba_person', {id: 1}); assert.deepStrictEqual([d1.installed, d1.could, d1.groups.length, d1.inventor, d1.person.from, d1.person.to], [false, true, 0, true, 1878, 1914]);
            assert.strictEqual((await api('ba_person', {id: 3})).could, false, 'jamais à Paris d’après sa fiche');
            assert.strictEqual((await api('ba_person', {id: 5})).could, false, 'un animal');
            assert.strictEqual((await api('ba_person', {id: 5})).inventor, false);
        });
        await t('fiche : l’offre discrète « ⤓ Installer les annuaires » ; ✕ retenu (genealogie-brevets-annuaires) et ↶ Annuler ; rien pour qui n’a pas vécu à Paris', async () => {
            await openPerson(1);
            await p.waitForSelector('.ba-person .ba-offer [data-ba-install]', {timeout: 20000});
            await p.waitForFunction(() => /Installer les annuaires \(\d/.test(document.querySelector('.ba-offer').textContent), null, {timeout: 20000});
            await p.click('.ba-offer [data-ba-dismiss]'); await sleep(400);
            assert.ok(!(await p.$('.ba-person .ba-offer')), 'plus proposée');
            assert.deepStrictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-brevets-annuaires'))), {dismiss: true});
            await toastClick('ne seront plus proposés');
            await p.waitForSelector('.ba-person .ba-offer', {timeout: 20000});
            await openPerson(3);
            assert.ok(!(await p.$('.ba-person:not([hidden])')), 'Lyon seulement : pas de bloc');
        });
        await t('serveur : le sommaire ; par tranches, reprendre, abandonner ; incomplet refusé', async () => {
            const r = await api('ba_dl_info'); assert.deepStrictEqual(Object.keys(r.packs), ['annuaires']); assert.strictEqual(r.packs.annuaires.parts.length, 2);
            const s = await post('ba_dl_start', {}); assert.ok(s.id, JSON.stringify(s));
            const a = await post('ba_dl_step', {id: s.id}); assert.strictEqual(a.received, parts[0].size, 'le 1er morceau');
            const z = await api('ba_dl_resume', {id: s.id}); assert.deepStrictEqual([z.exists, z.received], [true, parts[0].size]);
            assert.match((await post('ba_dl_finish', {id: s.id})).error || '', /incomplet/);
            assert.strictEqual((await api('ba_dl_resume', {id: s.id})).exists, false);
            const c = await post('ba_dl_start', {}); await post('ba_dl_cancel', {id: c.id}); assert.strictEqual((await api('ba_dl_resume', {id: c.id})).exists, false);
        });
        await t('Réglages : « ⤓ Installer » → installé et vérifié, ↶ Annuler le retire ; puis installé (dans le dossier des données)', async () => {
            await settings();
            await p.waitForSelector('.ba-set [data-ba-install]', {timeout: 20000});
            assert.match(await p.textContent('.ba-set .ba-base'), /Installer \(\d/);
            await p.click('.ba-set [data-ba-install]');
            await toastClick('Annuaires de Paris installés \\(201 entrées\\)');
            assert.strictEqual((await api('ba_status')).installed, false, '↶ Annuler');
            await p.waitForSelector('.ba-set [data-ba-install]', {timeout: 20000}); await p.click('.ba-set [data-ba-install]');
            await toastWait('Annuaires de Paris installés');
            await sleep(600);
            const st = await api('ba_status');
            assert.deepStrictEqual([st.installed, st.records, st.from, st.to, st.years, st.books], [true, 201, 1855, 1898, 2, 4]);
            assert.ok(fs.existsSync(path.join(tmp, 'brevets-annuaires', 'ba-annuaires.sqlite')));
            await p.waitForSelector('.ba-set [data-ba-remove]', {timeout: 20000});
            const txt = await p.textContent('.ba-set');
            assert.match(txt, /Etalab 2\.0/); assert.match(txt, /À propos des données/); assert.match(txt, /brevets d’invention/i); assert.match(txt, /par courriel/);
            assert.strictEqual(await p.evaluate(() => localStorage.getItem('genealogie-brevets-annuaires-dl')), null);
        });
        await t('fiche : « 📇 En 1898, un MAZAUD, boulanger, 4 rue Guenot (…) ↗ source » — même métier ; la page Gallica', async () => {
            await openPerson(1);
            await p.waitForSelector('.ba-person .ba-hit', {timeout: 20000});
            const line = await p.textContent('.ba-hit .ba-rec .ba-line');
            assert.match(line, /^📇 En 1898, un MAZAUD, boulanger, 4 rue Guenot \((annuaire Didot-Bottin|Paris-Adresses)\) ↗ source$/, line);
            assert.match(await p.getAttribute('.ba-hit .ba-rec .ba-line a', 'href'), /^https:\/\/gallica\.bnf\.fr\/ark:\/12148\/bpt6k[0-9a-z]+\/f\d+\.item$/);
            assert.match(await p.textContent('.ba-hit .ba-rec .ba-more'), /même métier/);
            const d = await api('ba_person', {id: 1});
            assert.strictEqual(d.groups[0].best.act, 'boulanger'); assert.ok(d.groups.every(g => !/couturière|manteaux/.test(g.best.act)), 'Mme / Vve MAZAUD : pas un homme');
        });
        await t('fiche : « ✓ C’est lui » → la source et le lieu de résidence (1898, Paris, l’adresse, la position) ; ↶ Annuler retire tout', async () => {
            await p.click('.ba-hit .ba-rec [data-ba-yes]');
            await toastWait('Ajouté à sa fiche');
            await p.waitForSelector('.ba-hit .ba-yes', {timeout: 20000});
            const ev = db("SELECT e.date_text, e.address, e.precise_lat, e.precise_lon, pl.name AS place, e.description FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id WHERE e.person_id=1 AND t.gedcom_tag='RESI'");
            assert.strictEqual(ev.length, 1); assert.deepStrictEqual([ev[0].date_text, ev[0].address, ev[0].place], ['1898', '4 rue Guenot', 'Paris']);
            assert.ok(Math.abs(ev[0].precise_lat - 48.85075) < 0.001 && Math.abs(ev[0].precise_lon - 2.39246) < 0.001, JSON.stringify(ev[0]));
            assert.match(ev[0].description, /boulanger/);
            const src = db("SELECT s.title, s.url, s.text, sl.entity_type FROM sources s JOIN source_links sl ON sl.source_record_id=s.id ORDER BY sl.id");
            assert.deepStrictEqual(src.map(x => x.entity_type), ['person', 'event']);
            assert.match(src[0].title, /^Annuaire de Paris 1898 — Mazaud, boulanger, 4 rue Guenot$/); assert.match(src[0].url, /^https:\/\/gallica\.bnf\.fr\//); assert.match(src[0].text, /Etalab 2\.0/); assert.match(src[0].text, /vérifie sur la page/);
            await toastClick('Ajouté à sa fiche');
            assert.strictEqual(db("SELECT count(*) n FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE t.gedcom_tag='RESI'")[0].n, 0, '↶ Annuler : plus d’événement');
            assert.strictEqual(db('SELECT count(*) n FROM sources')[0].n, 0, '↶ Annuler : plus de source');
            await p.waitForSelector('.ba-hit .ba-rec [data-ba-yes]', {timeout: 20000});
        });
        await t('fiche : « ✗ Pas lui » cache la piste (gardé dans la base) ; ↶ Annuler la remet ; « Revoir les pistes écartées »', async () => {
            const key = await p.getAttribute('.ba-hit .ba-rec [data-ba-no]', 'data-ba-no');
            await p.click('.ba-hit .ba-rec [data-ba-no]');
            await toastWait('Piste écartée'); await sleep(600);
            assert.ok(!(await p.$(`.ba-rec[data-ba-group="${key}"]`)), 'cachée');
            assert.deepStrictEqual(db('SELECT rec_key, verdict FROM ba_marks'), [{rec_key: key, verdict: 'no'}]);
            await p.click('[data-ba-showno]'); await p.waitForSelector(`.ba-rec.is-no[data-ba-group="${key}"]`, {timeout: 20000});
            await toastClick('Piste écartée');
            assert.deepStrictEqual(db('SELECT * FROM ba_marks'), [], '↶ Annuler');
        });
        await t('fiche : le prénom compte — Paul LACOMBE trouvé « (Paul) » ; Henri LACOMBE : un autre prénom écrit écarte, pas de piste sûre', async () => {
            const d2 = await api('ba_person', {id: 2});
            assert.ok(d2.groups.length >= 1); assert.strictEqual(d2.groups[0].best.given, 'Paul'); assert.ok(d2.groups[0].why.includes('même prénom'));
            assert.ok(d2.groups.every(g => !g.best.given || /^(Paul|P\.)$/.test(g.best.given)), JSON.stringify(d2.groups.map(g => g.best.given)));
            const d4 = await api('ba_person', {id: 4});
            assert.ok(d4.groups.every(g => !['Paul', 'Emile', 'Louis', 'Ernest', 'Antoine', 'Jules'].includes(g.best.given)), JSON.stringify(d4.groups.map(g => g.best.given)));
        });
        await t('Listes → Données : ba_list (nom, année, rue, autour de, texte) ; le moteur l’a enregistrée, avec une colonne Source', async () => {
            const q = query => api('ba_list', {query: JSON.stringify(query)});
            const a = await q({filters: [{key: 'name', op: 'eq', value: 'MAZAUD'}], years: {from: 1898, to: 1898}, limit: 100});
            assert.strictEqual(a.total, 12); assert.ok(a.rows.every(r => r.year === 1898 && /^Mazaud/.test(r.name) && /^https:/.test(r.url)));
            const b = await q({filters: [{key: 'street', op: 'contains', value: 'roquette'}]});
            assert.ok(b.total >= 2 && b.rows.every(r => /Roquette/i.test(r.street)), JSON.stringify(b.rows.map(r => r.street)));
            const c = await q({near: {lat: 48.85075, lon: 2.39246, km: 0.05}});
            assert.ok(c.rows.some(r => /boulanger/.test(r.act)) && c.rows.every(r => r._km <= 0.05));
            const e = await q({filters: [{key: 'year', op: 'gte', value: 1890}, {key: 'act', op: 'contains', value: 'vins'}]});
            assert.ok(e.total > 5 && e.rows.every(r => r.year === 1898 && /vins/.test(r.act)));
            const reg = await p.evaluate(() => { const d = window.LCNDA_EXT.dataLists.find(x => x.id === 'ba_annuaires'); return d && {fields: d.fields.map(f => f.key), geo: typeof d.geo, q: typeof d.query, src: d.sourceUrl}; });
            assert.deepStrictEqual(reg, {fields: ['name', 'act', 'address', 'street', 'year', 'book', 'url'], geo: 'function', q: 'function', src: 'https://nakala.fr/10.34847/nkl.98eem49t'});
        });
        await t('carte : le calque « une rue ou un nom au fil des années » (ba_map, LCNDA_EXT.mapLayerSources)', async () => {
            const r = await p.evaluate(async () => window.LCNDA_EXT.mapLayerSources.find(x => x.id === 'ba_adresse').run({q: 'Roquette', from: 1850, to: 1900}));
            assert.ok(r.features.length >= 2 && r.features.every(f => f.type === 'pt' && f.lat > 48.8 && f.lat < 48.9), JSON.stringify(r.features.slice(0, 2)));
            assert.match(r.source, /SoDUCo/);
            const n = await p.evaluate(async () => window.LCNDA_EXT.mapLayerSources.find(x => x.id === 'ba_adresse').run({q: 'MAZAUD'}));
            assert.ok(n.features.length >= 10 && n.features.every(f => /Mazaud/.test(f.label)));
        });
        await t('monographie de Paris : les noms de la famille dans les annuaires (ba_place) ; rien pour une autre commune', async () => {
            const sec = await p.evaluate(async () => { const s = window.LCNDA_EXT.monographSections.find(x => x.id === 'annuaires_paris'); const h = document.createElement('div'); const ok = await s.render({id: 1, name: 'Paris'}, h, {}); const h2 = document.createElement('div'); const no = await s.render({id: 2, name: 'Lyon'}, h2, {}); return {ok, no, txt: h.textContent}; });
            assert.strictEqual(sec.ok, true); assert.strictEqual(sec.no, false);
            assert.match(sec.txt, /MAZAUD — 12 entrées de 1898 à 1898/); assert.match(sec.txt, /LACOMBE — \d+ entrées de 1855 à 1898/);
        });
        await t('« 🔎 Ce qui le concerne » : les deux sources de données du registre (une phrase + ↗ source) ; rien pour un animal', async () => {
            const r = await p.evaluate(async () => {
                const S = id => window.LCNDA_EXT.dataSources.find(x => x.id === id);
                const h1 = document.createElement('div'), h2 = document.createElement('div'), h3 = document.createElement('div');
                const a = await S('ba_annuaires').run({person: {id: 1}}, h1), b = await S('ba_brevets').run({person: {id: 1}}, h2), c = await S('ba_brevets').run({person: {id: 5}}, h3);
                return {a, b, c, t1: h1.textContent, l1: h1.querySelector('a.ba-src-link')?.href, t2: h2.textContent, l2: h2.querySelector('a.ba-src-link')?.href, inst: await S('ba_annuaires').installed()};
            });
            assert.deepStrictEqual([r.a, r.b, r.c, r.inst], [true, true, false, true]);
            assert.match(r.t1, /En 1898, un MAZAUD, boulanger/); assert.match(r.l1, /^https:\/\/gallica\.bnf\.fr\//);
            assert.match(r.t2, /Cherche « MAZAUD Jean » dans les brevets d’invention de 1791 à 1901/); assert.strictEqual(r.l2, 'https://bases-brevets19e.inpi.fr/brevets');
            // le vrai consommateur (heritage-tout-sur.js) : une suggestion par source, sa phrase et son lien « ↗ source »
            const ts = await p.evaluate(async () => {
                const T = window.LCNDA_EXT.toutSur; if (!T) return null;
                const detail = await window.LCNDA_APP.api('person', {id: 1});
                const res = await T.run(T.plan({person: detail, only: ['ba_annuaires', 'ba_brevets']}));
                return T.suggestions(res, T.lifeOf(detail)).map(s => [s.task.d.id, s.summary, s.src.url]);
            });
            if (ts) {
                const m = Object.fromEntries(ts.map(x => [x[0], x]));
                assert.match(m.ba_annuaires[1], /En 1898, un MAZAUD, boulanger, 4 rue Guenot/); assert.match(m.ba_annuaires[2], /^https:\/\/(gallica\.bnf\.fr|nakala\.fr)\//);
                assert.match(m.ba_brevets[1], /MAZAUD Jean/); assert.strictEqual(m.ba_brevets[2], 'https://bases-brevets19e.inpi.fr/brevets');
            }
        });
        await t('« Où chercher » : 💡 la base des brevets de l’INPI (↗ Ouvrir, 📋 nom à copier) et 📇 les annuaires, par son crochet', async () => {
            const html = await p.evaluate(async () => {
                const body = document.createElement('div'); body.innerHTML = '<div class="ouc-facts"></div>'; document.body.appendChild(body);
                window.LCNDA_EXT.ouChercher.afterRedraw.forEach(fn => { try { fn({pid: 1}, body); } catch (_) {} });
                for (let i = 0; i < 40 && !body.querySelector('.ba-ouc'); i++) await new Promise(r => setTimeout(r, 100));
                const out = body.querySelector('.ba-ouc')?.outerHTML || ''; body.remove(); return out;
            });
            assert.match(html, /href="https:\/\/bases-brevets19e\.inpi\.fr\/brevets"/); assert.match(html, /data-ba-copy="MAZAUD Jean"/); assert.match(html, /Annuaires du commerce de Paris/);
            assert.match(html, /envoyé par l’INPI sur demande/);
        });
        await t('🗑 Supprimer (↶ Annuler) ; le bloc s’éteint dans Réglages (↶)', async () => {
            await settings();
            await p.click('.ba-set [data-ba-remove]');
            await toastWait('Annuaires de Paris supprimés');
            assert.strictEqual((await api('ba_status')).installed, false);
            await toastClick('Annuaires de Paris supprimés');
            assert.strictEqual((await api('ba_status')).installed, true, '↶ Annuler');
            await p.waitForSelector('.ba-set [data-ba-on]', {timeout: 20000});
            await p.click('.ba-set [data-ba-on]', {force: true}); await sleep(300);
            assert.strictEqual(await p.evaluate(() => window.LCNDA_APP.defaultPersonBlocks.some(b => b[0] === 'brevets_annuaires')), false);
            await toastClick('ne sont plus sur les fiches');
            assert.strictEqual(await p.evaluate(() => window.LCNDA_APP.defaultPersonBlocks.some(b => b[0] === 'brevets_annuaires')), true, '↶ Annuler');
        });
        await t('aucune erreur JavaScript', async () => { assert.deepStrictEqual(errs, []); });
    } finally { await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true}); }
    console.log(fails ? `${fails} essai(s) en échec` : 'Les annuaires de Paris et les brevets marchent.');
    process.exit(fails ? 1 : 0);
})();
