#!/usr/bin/env node
/* 🏘 Histoire du lieu (lib/histoire.php, assets/js/heritage-histoire.js, scripts/histoire/build-histoire.py, .github/workflows/histoire.yml).
 *  1. le pack fabriqué (hors git) : en-tête LCHIST1, empreinte, taille, et quelques chiffres relus dans les fichiers sources ;
 *  2. le serveur : « 📦 Installer » depuis un dossier local à la place de GitHub (GENEALOGY_TEST=1 + LCNDA_TEST_HIST_DIR), reprise,
 *     un pack mal décrit écarté ; les tables de frdata.org (jeu d'essai inventé, pas les vraies : elles ne se redistribuent pas) ;
 *  3. la fiche : Pierre MAZAUD, né à Tulle en 1870, marié à Brive en 1898, mort à Uzerche en 1932 → population, train, voyage,
 *     vendanges, enfants ; Réglages → 🏘 Histoire du lieu : installer en un clic, 🗑 Supprimer et ↶, À propos des données.
 * Le pack : fabriqué une fois par   python3 scripts/histoire/build-histoire.py --dossier /tmp/histoire-pack
 * (ou LCNDA_HIST_PACK=…/histoire-locale.lchist).        node tests/test-histoire.js */
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
const PACK = process.env.LCNDA_HIST_PACK || '/tmp/histoire-pack/histoire-locale.lchist';

(async () => {
    if (!fs.existsSync(PACK)) { console.error(`Pack introuvable : ${PACK}\nFabrique-le d'abord : python3 scripts/histoire/build-histoire.py --dossier /tmp/histoire-pack`); process.exit(1); }
    const buf = fs.readFileSync(PACK);
    const head = JSON.parse(buf.subarray(8, 4096).toString('utf8').trim());
    const body = buf.subarray(4096);

    /* ═════════ 1. le pack ═════════ */
    await t('pack : en-tête LCHIST1, taille et empreinte justes, moins de 30 Mo', async () => {
        assert.strictEqual(buf.subarray(0, 8).toString(), 'LCHIST1\n');
        assert.strictEqual(head.kind, 'histoire');
        assert.strictEqual(head.size, body.length);
        assert.strictEqual(crypto.createHash('sha256').update(body).digest('hex'), head.sha256);
        assert.ok(buf.length < 30 * 1024 * 1024, `${buf.length} octets`);
    });
    const tmpDb = path.join(os.tmpdir(), `hist-pack-${process.pid}.sqlite`); fs.writeFileSync(tmpDb, body);
    await t('pack : chiffres relus dans les sources (Insee, vendanges, Wikidata, EPICA, GASPAR) et une licence pour chaque source', async () => {
        const {DatabaseSync} = require('node:sqlite');
        const db = new DatabaseSync(tmpDb, {readOnly: true});
        const one = (q, ...a) => db.prepare(q).get(...a);
        assert.ok(one('SELECT COUNT(*) n FROM communes').n > 34000);
        const years = one("SELECT value FROM meta WHERE key='pop_years'").value.split(',').map(Number);
        const tulle = one("SELECT * FROM communes WHERE code='19272'"); const pop = tulle.pop.split(',').map(Number);
        assert.strictEqual(tulle.nom, 'Tulle'); assert.strictEqual(pop[years.indexOf(1876)], 15342); assert.strictEqual(pop[years.indexOf(2023)], 13401); // base-pop-historiques-1876-2023.xlsx
        assert.strictEqual(one('SELECT COUNT(*) n FROM ghd_series').n, 27);
        assert.strictEqual(one("SELECT jours FROM ghd WHERE code='Bur' AND annee=1354").jours, 15.3); // première ligne du tableau NOAA
        assert.strictEqual(one("SELECT code FROM ghd_dep WHERE dep='19' AND rang=0").code, 'Auv');
        assert.strictEqual(one("SELECT ouverture FROM gares WHERE src='wikidata' AND nom='Brive-la-Gaillarde'").ouverture, 1860);
        assert.strictEqual(one("SELECT COUNT(*) n FROM seismes WHERE src='epica' AND (annee > 1899 OR lat < 41 OR lat > 51.6)").n, 0);
        assert.strictEqual(one("SELECT COUNT(*) n FROM catnat WHERE risque NOT IN ('ICB','IRN','COB','RAZ','CMV','SEI')").n, 0);
        assert.ok(one("SELECT COUNT(*) n FROM catnat WHERE code='19272'").n >= 5);
        for (const r of db.prepare('SELECT * FROM sources').all()) { assert.ok(r.licence && r.mention && r.url && /^[0-9a-f]{64}$/.test(r.sha256), r.id); }
        assert.deepStrictEqual(db.prepare('SELECT id FROM sources ORDER BY id').all().map(r => r.id).filter(x => ['insee', 'wikidata', 'ghd', 'epica', 'gaspar'].includes(x)).sort(), ['epica', 'gaspar', 'ghd', 'insee', 'wikidata']);
        db.close();
    });
    fs.rmSync(tmpDb, {force: true});

    /* ═════════ 2. et 3. le serveur et l'écran ═════════ */
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-histoire-')), site = path.join(tmp, 'site');
    [path.join(tmp, 'media'), path.join(site, 'frdata/5x5-NUTS3')].forEach(d => fs.mkdirSync(d, {recursive: true}));
    const cut = Math.floor(buf.length / 2);
    const parts = [buf.subarray(0, cut), buf.subarray(cut)].map((b, i) => { const name = `histoire-locale.lchist.00${i}`; fs.writeFileSync(path.join(site, name), b); return {name, size: b.length}; });
    fs.writeFileSync(path.join(site, 'histoire-manifest.json'), JSON.stringify({version: '2026-11', packs: {
        histoire: {size: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex'), built: head.built, parts},
        autre: {size: 5, parts: [{name: 'x.000', size: 5}]}}}));
    // tables de frdata.org INVENTÉES pour l'essai (format 5×5 : Year;Age;mx;qx;ax;lx;…) : l5 = 80 000 (garçons), 84 000 (filles) → 5q0 = 20 % et 16 %
    const fake = l5 => 'Year;Age;mx;qx;ax;lx;dx;Lx;Tx;ex\n' + ['1901-1905', '1906-1910'].map(p => `${p};0;0,1;0,1;0,3;1e+05;1;1;1;50\n${p};1-4;0,01;0,04;1,4;90000;1;1;1;55\n${p};5-9;0,004;0,02;2,2;${l5};1;1;1;54`).join('\n') + '\n';
    for (const d of ['19', '06']) { fs.writeFileSync(path.join(site, `frdata/5x5-NUTS3/${d}M.txt`), fake(80000)); fs.writeFileSync(path.join(site, `frdata/5x5-NUTS3/${d}F.txt`), fake(84000)); }
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4', GENEALOGY_TEST: '1', LCNDA_TEST_HIST_DIR: site};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start) VALUES(1,'Pierre','MAZAUD','male','deceased',1),(2,'Marie','BRUNIE','female','deceased',0),(3,'Jean','MAZAUD','male','deceased',0),(4,'Louise','MAZAUD','female','deceased',0),(5,'Paul','MAZAUD','male','unknown',0),(6,'Anne','MAZAUD','female','deceased',0),(7,'Léonard','GIORDAN','male','deceased',0)");
$pdo->exec("INSERT INTO places(id,name,county,country,latitude,longitude,admin4_code) VALUES(1,'Tulle','Corrèze','France',45.2675,1.7711,'19272'),(2,'Brive-la-Gaillarde','Corrèze','France',45.1589,1.5321,'19031'),(3,'Uzerche','Corrèze','France',45.4247,1.5636,''),(4,'Nice','Alpes-Maritimes','France',43.7031,7.2661,'06088')");
$t = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn();
$pdo->exec("INSERT INTO families(id,partner1_id,partner2_id) VALUES(1,1,2)");
$ins = $pdo->prepare("INSERT INTO events(scope,person_id,family_id,event_type_id,date_text,year,sort_date,place_id) VALUES(?,?,?,?,?,?,?,?)");
$ins->execute(['person',1,null,$t('BIRT'),'12 mars 1870',1870,'1870-03-12',1]);
$ins->execute(['family',null,1,$t('MARR'),'10 mai 1898',1898,'1898-05-10',2]);
$ins->execute(['person',1,null,$t('DEAT'),'5 janvier 1932',1932,'1932-01-05',3]);
foreach ([[3,1902,'1902-02-01',1903,'1903-06-01'],[4,1904,'1904-04-01',null,null],[5,1906,'1906-05-01',1906,'1906-09-01'],[6,1908,'1908-07-01',1980,'1980-01-01']] as $k => [$id,$by,$bd,$dy,$dd]) {
    $pdo->exec("INSERT INTO family_children(family_id,child_id,position) VALUES(1,$id,$k)");
    $ins->execute(['person',$id,null,$t('BIRT'),$bd,$by,$bd,2]);
    if ($dy) { $ins->execute(['person',$id,null,$t('DEAT'),$dd,$dy,$dd,2]); }
}
$ins->execute(['person',7,null,$t('BIRT'),'1740',1740,'1740',4]);
$ins->execute(['person',7,null,$t('DEAT'),'1800',1800,'1800',4]);
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status) VALUES(8,'Odette','MAZAUD','female','deceased')");
$ins->execute(['person',8,null,$t('BIRT'),'1940',1940,'1940',1]);
$ins->execute(['person',8,null,$t('DEAT'),'1990',1990,'1990',1]);
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
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_APP?.defaultPersonBlocks, null, {timeout: 30000});
        // index.php ne charge pas encore heritage-histoire.js : on l'ajoute à la page (comme le fera la balise <script>)
        if (!(await p.evaluate(() => !!window.LCNDA_EXT?.histoire))) { await p.addStyleTag({url: base + 'assets/css/histoire.css'}); await p.addScriptTag({url: base + 'assets/js/heritage-histoire.js'}); }
        await p.waitForFunction(() => window.LCNDA_EXT?.histoire, null, {timeout: 10000});
        const api = (x, q = {}) => p.evaluate(([y, z]) => window.LCNDA_APP.api(y, z).catch(e => ({error: e.message})), [x, q]);
        const post = (a, b) => p.evaluate(async ([x, y]) => { try { const r = await window.LCNDA_APP.api(x, {}, {method: 'POST', body: y}); return r.result || r; } catch (e) { return {error: e.message}; } }, [a, b]);
        const openPerson = async id => { await p.evaluate(i => { const A = window.LCNDA_APP; A.state.currentPersonId = i; A.setModule('personnes'); }, id); await p.waitForSelector(`[data-hist-life="${id}"]`, {timeout: 20000}); await p.waitForFunction(i => !document.querySelector(`[data-hist-life="${i}"] .ui-skeleton, [data-hist-life="${i}"] .skeleton`) && document.querySelector(`[data-hist-life="${i}"]`).textContent.trim().length > 20, id, {timeout: 20000}); };
        const blockText = id => p.textContent(`[data-hist-life="${id}"]`);
        const toastWith = re => p.waitForFunction(s => new RegExp(s).test([...document.querySelectorAll('.ui-toast')].map(x => x.textContent).join(' ')), re.source, {timeout: 30000});

        await t('serveur : le sommaire en ligne (un pack mal décrit est écarté) ; rien d’installé au départ', async () => {
            const r = await api('hist_dl_info');
            assert.deepStrictEqual(Object.keys(r.packs), ['histoire']); assert.strictEqual(r.packs.histoire.size, buf.length); assert.strictEqual(r.packs.histoire.parts.length, 2);
            assert.strictEqual((await api('hist_status')).installed, false);
        });
        await t('serveur : par tranches, reprendre où on s’est arrêté, abandonner', async () => {
            const s = await post('hist_dl_start', {}); assert.ok(s.id, JSON.stringify(s));
            const a = await post('hist_dl_step', {id: s.id}); assert.ok(a.received > 0 && a.received <= parts[0].size);
            const r = await api('hist_dl_resume', {id: s.id}); assert.deepStrictEqual([r.exists, r.received], [true, a.received]);
            await post('hist_dl_cancel', {id: s.id}); assert.strictEqual((await api('hist_dl_resume', {id: s.id})).exists, false);
        });
        await t('fiche sans le pack : le bloc dit comment l’installer, et compte déjà les enfants de la famille', async () => {
            await openPerson(1);
            assert.ok(await p.$('[data-hist-life="1"] [data-hist-install]'), 'bouton « Installer »');
            assert.match(await blockText(1), /2 enfant\(s\) sur 4 mort\(s\) avant 5 ans \(1 sans date de décès\)/);
        });
        await t('un clic sur « 📦 Installer » dans le bloc : Réglages → 🏘 Histoire du lieu, téléchargé, vérifié, rangé', async () => {
            await p.click('[data-hist-life="1"] [data-hist-install]');
            await toastWith(/Histoire du lieu installée/);
            const st = await api('hist_status'); assert.strictEqual(st.installed, true); assert.ok(st.sources.includes('insee'));
            assert.ok(fs.existsSync(path.join(tmp, 'histoire', 'histoire-locale.sqlite')), 'dans le dossier des données');
            assert.ok(await p.$('.hist-settings [data-hist-remove]'), 'bouton « Supprimer »');
            assert.strictEqual(await p.evaluate(() => localStorage.getItem('genealogie-histoire-dl')), null);
        });
        await t('fiche : population (Insee), train, voyage, vendanges — chaque ligne avec sa source', async () => {
            await openPerson(1);
            const txt = (await blockText(1)).replace(/\s+/g, ' ').replace(/ | /g, ' ');
            assert.match(txt, /Tulle comptait 15 342 habitants quand Pierre y naît \(recensement de 1876\), 15 021 habitants à sa mort, en 1932 \(recensement de 1931\)/);
            assert.match(txt, /Uzerche comptait 3 163 habitants à sa mort, en 1932 \(recensement de 1931\)\. \(trouvée par son nom\)/);
            assert.match(txt, /Le train arrive à Lubersac \(14 km de Uzerche\) en 1875 : Pierre a 5 ans\./);
            assert.match(txt, /Quand Pierre naît, le train passe déjà à Brive-la-Gaillarde, depuis 1860\./);
            assert.match(txt, /Une gare a existé à Tulle \(2 km\), mais sa date d’ouverture n’est pas dans les données\./);
            assert.match(txt, /De Tulle à Brive-la-Gaillarde \(22 km à vol d’oiseau\), en 1898 : à pied ≈ 7 h, en diligence ≈ 4 h\./);
            assert.match(txt, /1870 \(naissance\) : vendanges précoces \(vignoble « Auvergne », à 115 km\), vers le 28 septembre \(14 jours plus tôt que d’habitude\) : sans doute un été chaud\./);
            for (const s of [/Source : Insee, recensements/, /Source : Wikidata/, /Source : Daux et al\. 2012/, /hypothèses/]) assert.match(txt, s);
            assert.ok(await p.$('[data-hist-life="1"] svg.hist-curve circle'), 'la petite courbe');
        });
        await t('séismes : l’ancêtre de Nice (EPICA), avec la distance et la règle dite', async () => {
            const d = await api('hist_person', {id: 7});
            assert.deepStrictEqual(d.quakes.map(q => [q.year, q.month, q.day, q.zone, q.km]), [[1740, 8, 29, "COTE D'AZUR (ANTIBES)", 18], [1799, 3, 5, "COTE D'AZUR (NICE)", 0]]);
            await openPerson(7);
            const txt = (await blockText(7)).replace(/\s+/g, ' ');
            assert.match(txt, /Séisme du 29 août 1740 \(COTE D'AZUR \(ANTIBES\)\) : épicentre à 18 km de Nice, intensité V à l’épicentre, magnitude 3,9\. Sans doute ressenti \(Léonard a moins d’un an\)\./);
            assert.match(txt, /pas de relevé commune par commune/);
            assert.match(txt, /Pas de recensement de Nice à moins de 10 ans de 1740 ni de 1800 : les chiffres de l’Insee commencent en 1876\./);
            assert.match(txt, /Séisme du 5 mars 1799 \(COTE D'AZUR \(NICE\)\) : épicentre à Nice,/);
            assert.match(txt, /Le train n’arrive à Cagnes-sur-Mer \(11 km de Nice\) qu’en 1863, après la mort de Léonard\./);
        });
        await t('inondations : BDHI (commune ou département) et arrêtés CatNat depuis 1982, de son vivant', async () => {
            const d = await api('hist_person', {id: 8});
            assert.ok(d.floods.bdhi.some(x => x.year === 1960 && /octobre 1960/.test(x.title)), JSON.stringify(d.floods.bdhi));
            assert.deepStrictEqual(d.floods.catnat.slice(0, 2).map(x => [x.date, x.kind]), [['1982-11-06', 'ICB'], ['1988-06-16', 'ICB']]);
            await openPerson(8);
            const txt = (await blockText(8)).replace(/\s+/g, ' ');
            assert.match(txt, /1960 : [^.]*octobre 1960/); assert.match(txt, /Source : Géorisques, base historique des inondations \(BDHI\)/); assert.match(txt, /catastrophes naturelles reconnue\(s\) depuis 1982/);
        });
        await t('Réglages : tables de frdata.org pour les départements de la base, puis la comparaison sur la fiche (et 🗑 ↶)', async () => {
            await p.evaluate(() => window.LCNDA_EXT.histoire.openSettings());
            await p.waitForSelector('.hist-settings [data-hist-fhmd]', {timeout: 20000});
            assert.match(await p.textContent('[data-hist-fhmd]'), /2 département/);
            await p.click('[data-hist-fhmd]');
            await toastWith(/2 table\(s\) de mortalité/);
            assert.deepStrictEqual((await api('hist_fhmd_status')).codes, ['06', '19']);
            await openPerson(1);
            assert.match((await blockText(1)).replace(/\s+/g, ' '), /2 enfant\(s\) sur 4 mort\(s\) avant 5 ans \(1 sans date de décès\) ; en Corrèze, 1901–1905 : 1 enfant sur 6 \(18 %\)\./);
            await p.evaluate(() => window.LCNDA_EXT.histoire.openSettings());
            await p.waitForSelector('.hist-settings [data-hist-fhmd-remove]', {timeout: 20000});
            await p.click('[data-hist-fhmd-remove]'); await toastWith(/Tables de mortalité supprimées/);
            assert.strictEqual((await api('hist_fhmd_status')).count, 0);
            await p.evaluate(() => [...document.querySelectorAll('.ui-toast')].reverse().find(x => /Tables de mortalité/.test(x.textContent)).querySelector('button').click()); await sleep(800);
            assert.strictEqual((await api('hist_fhmd_status')).count, 2, '↶ remet les tables');
        });
        await t('À propos des données : chaque source, sa licence ; ce qui manque et pourquoi', async () => {
            await p.click('.hist-settings [data-hist-about]');
            await p.waitForSelector('[data-hist-about-table]');
            const txt = await p.textContent('.hist-about');
            for (const s of ['Licence Ouverte', 'CC BY 4.0', 'CC0', 'ODbL', 'frdata.org', 'NOAA', 'Cassini', 'SisFrance']) assert.ok(txt.includes(s), s);
            await p.click('[data-hist-x]');
        });
        await t('Réglages : 🗑 Supprimer le pack, puis ↶ Annuler le remet', async () => {
            await p.waitForSelector('.hist-settings [data-hist-remove]');
            await p.click('[data-hist-remove]'); await toastWith(/Histoire du lieu supprimée/);
            assert.strictEqual((await api('hist_status')).installed, false);
            await p.evaluate(() => [...document.querySelectorAll('.ui-toast')].reverse().find(x => /Histoire du lieu supprimée/.test(x.textContent)).querySelector('button').click()); await sleep(800);
            assert.strictEqual((await api('hist_status')).installed, true, '↶ Annuler');
        });
        await t('aucune erreur JavaScript', async () => { assert.deepStrictEqual(errs, []); });
    } finally { await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true}); }
    console.log(fails ? `${fails} essai(s) en échec` : 'L’histoire du lieu marche.');
    process.exit(fails ? 1 : 0);
})();
