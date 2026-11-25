#!/usr/bin/env node
/* ⛰️👥 Sa terre et ses gens (lot 10) : lib/lot10_terre_gens.php, assets/js/heritage-lot10-terre-gens.js, assets/css/lot10-terre-gens.css,
 * données assets/data/l10t-*.json.gz (scripts/lot10-terre-gens/*.py).
 * Le réseau (Géorisques, IGN) est remplacé par des réponses VRAIES enregistrées une fois (tests/fixtures/lot10-terre-gens/,
 * GENEALOGY_TEST=1 + LCNDA_TEST_L10T_DIR ; le cadastre : LCNDA_CADASTRE_FIXTURES) ; un fichier absent = hors ligne.
 *  0. les données livrées : taille, source, licence ; les calculs (volcans, relais sur la route, marche, Algérie, Québec, Suisse) ;
 *  1. serveur : contexte d'une fiche (lieu-dit), Géorisques (gardé, hors ligne), carte du nom (décès INSEE), marche, parcelle, vivant ;
 *  2. écran : bloc de fiche « ⛰️ Sa terre et ses gens », fiche d'un village, monographie, 🧰 Données, Listes, cartes, Où chercher, Réglages.
 *   node tests/test-lot10-terre-gens.js */
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
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const FX = path.join(__dirname, 'fixtures/lot10-terre-gens');
const file = n => path.join(root, 'assets/data', `l10t-${n}.json.gz`);
const data = n => JSON.parse(zlib.gunzipSync(fs.readFileSync(file(n))).toString('utf8'));
const M = require('../assets/js/heritage-lot10-terre-gens.js');

(async () => {
    /* ═════════ 0. les données livrées ═════════ */
    const D = Object.fromEntries(['avalanches', 'volcans', 'epaves', 'relais', 'algerie', 'quebec', 'suisse'].map(n => [n, data(n)]));
    await t('données livrées : moins de 15 Mo en tout ; chaque fichier dit sa source, sa licence (ouverte) et sa date', async () => {
        const files = fs.readdirSync(path.join(root, 'assets/data')).filter(f => /^l10t-.*\.json\.gz$/.test(f));
        const total = files.reduce((n, f) => n + fs.statSync(path.join(root, 'assets/data', f)).size, 0);
        console.log(`   ${files.length} fichiers, ${(total / 1e6).toFixed(2)} Mo : ${files.map(f => `${f} ${Math.round(fs.statSync(path.join(root, 'assets/data', f)).size / 1024)} Ko`).join(', ')}`);
        assert.ok(total < 15e6);
        for (const [n, d] of Object.entries(D)) {
            assert.ok(d.source && d.licence && d.url && d.built, n);
            assert.match(d.licence, /CC0|CC BY-SA|domaine public/, n);
            assert.ok(d.rows.length > 0, n);
        }
        for (const n of ['avalanches', 'epaves', 'relais', 'algerie', 'quebec', 'suisse']) assert.ok(D[n].rows.every(r => /^Q\d+$/.test(r.q) && r.n && Number.isFinite(r.lat) && Number.isFinite(r.lon)), n);
        assert.ok(D.epaves.rows.length > 10000 && D.quebec.rows.length > 1000 && D.suisse.rows.length > 2000);
        assert.ok(D.avalanches.rows.every(r => r.y && r.d));
        assert.ok(D.quebec.rows.every(r => r.rpcq) && D.quebec.rpcq_url.includes('{id}'));
        assert.ok(D.suisse.rows.every(r => r.hls) && D.suisse.hls_url.includes('{id}'));
        // chaque phrase des volcans : recopiée de Wikipédia, avec son adresse
        for (const e of D.volcans.rows) { assert.ok(e.quotes.length && e.quotes.every(q => q.q.length > 30 && /^https:\/\/fr\.wikipedia\.org\/wiki\//.test(q.url) && q.title)); assert.ok(e.effect[0] <= e.effect[1]); }
        assert.ok(D.volcans.rows.find(e => e.id === 'tambora').noaa_url.startsWith('https://www.ngdc.noaa.gov/'));
    });
    await t('calculs : volcans de son vivant, relais sur la route, marche (Tobler), Philippeville = Skikda, Vevey, Québec', async () => {
        const P = {gender: 'male', jobs: ['carrier'], events: [{kind: 'birth', year: 1800, place: 'a'}, {kind: 'death', year: 1860, place: 'b'}], places: {a: {name: 'Tulle', insee: '19272', cc: 'fr', lat: 45.27, lon: 1.77}, b: {name: 'Grenoble', insee: '38185', cc: 'fr', lat: 45.18, lon: 5.72}}};
        const L = M.lifeOf(P);
        assert.deepStrictEqual(M.volcansPerson(D.volcans, L).map(e => e.id), ['tambora'], 'Tambora (1816), pas le Laki (1783) ni le Krakatoa (1884)');
        assert.ok(M.isCarrier(L) && !M.isMarin(L));
        const rel = M.relaisOnRoute([{n: 'sur la route', lat: 45.22, lon: 3.7}, {n: 'loin', lat: 46.5, lon: 3.7}, {n: 'derrière', lat: 45.3, lon: 0.5}], P.places.a, P.places.b);
        assert.deepStrictEqual(rel.map(r => r.n), ['sur la route']);
        const flat = M.walkTime([[45, 1, 100], [45.045, 1, 100]]), hill = M.walkTime([[45, 1, 100], [45.045, 1, 600]]);
        assert.ok(flat.hours > 1 && flat.hours < 1.5, JSON.stringify(flat)); assert.ok(hill.hours > flat.hours * 1.2 && hill.up === 500);
        assert.strictEqual(M.matchPlace(D.algerie.rows, {name: 'Philippeville'})?.n, 'Skikda');
        assert.strictEqual(M.matchPlace(D.suisse.rows, {name: 'Vevey', lat: 46.46, lon: 6.84}, 3)?.hls, '002620');
        const q = M.quebecNear(D.quebec, {lat: 46.8139, lon: -71.208}, {end: 1760});
        assert.ok(q.length > 5 && q.every(x => !x.y || x.y <= 1760));
        assert.ok(M.isQC({cc: 'ca', lat: 46.8, lon: -71.2}) && !M.isQC({cc: 'ca', lat: 49.2, lon: -123.1}), 'Vancouver n’est pas au Québec');
    });

    /* ═════════ 1. le serveur ═════════ */
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-l10t-')), net0 = path.join(tmp, 'net');
    fs.mkdirSync(path.join(tmp, 'media'), {recursive: true}); fs.cpSync(FX, net0, {recursive: true});
    const calls = () => { try { return fs.readFileSync(path.join(net0, 'calls.log'), 'utf8').trim().split('\n').filter(Boolean); } catch (_) { return []; } };
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4', GENEALOGY_TEST: '1', LCNDA_TEST_L10T_DIR: net0, LCNDA_CADASTRE_FIXTURES: path.join(net0, 'cadastre')};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start,occupation) VALUES(1,'Jean','MAZAUD','male','deceased',1,'carrier'),(2,'Marie','LACOMBE','female','deceased',0,''),(3,'Pierre','DURAND','male','deceased',0,'marin pêcheur'),(4,'Anne','DURAND','female','deceased',0,''),(5,'Louis','LACOMBE','male','deceased',0,''),(6,'Paul','MAZAUD','male','deceased',0,'cultivateur'),(7,'Hans','DURAND','male','deceased',0,''),(8,'Léa','MAZAUD','female','living',0,''),(9,'Joseph','LACOMBE','male','deceased',0,'guide')");
$pdo->exec("INSERT INTO places(id,name,county,country,latitude,longitude,admin4_code) VALUES(1,'Tulle','Corrèze','France',45.2694,1.768,'19272'),(2,'Caen','Calvados','France',49.1843,-0.3734,'14118'),(3,'Grenoble','Isère','France',45.1841,5.7153,'38185'),(4,'Naves','Corrèze','France',45.3118,1.7521,'19146'),(5,'la Combe des Échelles, Tulle','Corrèze','France',NULL,NULL,''),(6,'Brest','Finistère','France',48.406,-4.5012,'29019'),(7,'New York','New York','États-Unis',40.71,-74.0,''),(8,'Québec','Québec','Canada',46.8139,-71.208,''),(9,'Philippeville','Constantine','Algérie',NULL,NULL,''),(10,'Vevey','Vaud','Suisse',46.46,6.84,''),(11,'Paris','Paris','France',48.8588,2.3457,'75056'),(12,'Chamonix-Mont-Blanc','Haute-Savoie','France',45.9293,6.9311,'74056')");
$t = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn();
$ins = $pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,date_text,year,sort_date,place_id,title,description) VALUES('person',?,?,?,?,?,?,'','')");
foreach ([[1,'BIRT',1800,'1800-03-02',1],[1,'RESI',1830,'1830-00-00',2],[1,'RESI',1835,'1835-00-00',5],[1,'DEAT',1860,'1860-00-00',3],[2,'BIRT',1802,'1802-00-00',4],[2,'DEAT',1870,'1870-00-00',4],
  [3,'BIRT',1890,'1890-00-00',6],[3,'DEAT',1960,'1960-00-00',6],[4,'BIRT',1900,'1900-00-00',11],[4,'RESI',1950,'1950-00-00',7],[4,'DEAT',1975,'1975-00-00',7],[5,'BIRT',1700,'1700-00-00',8],[5,'DEAT',1760,'1760-00-00',8],
  [6,'BIRT',1840,'1840-00-00',1],[6,'RESI',1870,'1870-00-00',9],[6,'DEAT',1900,'1900-00-00',9],[7,'BIRT',1850,'1850-00-00',10],[7,'DEAT',1910,'1910-00-00',10],[8,'BIRT',1990,'1990-00-00',3],[9,'BIRT',1930,'1930-00-00',12],[9,'DEAT',2005,'2005-00-00',12]] as [$pid,$tag,$y,$sd,$pl]) {
  $ins->execute([$pid,$t($tag),(string)$y,$y,$sd,$pl]); }
$pdo->exec("INSERT INTO families(id,partner1_id,partner2_id) VALUES(1,1,2)");
$pdo->prepare("INSERT INTO events(scope,family_id,event_type_id,date_text,year,sort_date,place_id) VALUES('family',1,?,?,?,?,4)")->execute([$t('MARR'),'1825',1825,'1825-06-10']);
$di = $pdo->prepare("INSERT INTO insee_deces(nom,prenom,prenoms,sexe,annee_naissance,code_lieu_naissance,commune_naissance,pays_naissance,annee_deces) VALUES(?,?,?,?,?,?,?,?,?)");
foreach ([['MAZAUD',1901,'19272'],['MAZAUD',1905,'19272'],['MAZAUD',1910,'19146'],['MAZAUD',1912,'19031'],['MAZAUD',1920,'19272'],['MAZAUD',1925,'19272'],['MAZAUD',1931,'87085'],['MAZAUD',1940,'87085'],['MAZAUD',1950,'75056'],['MAZAUD',1930,'99352'],['DURAND',1920,'75056']] as $i => [$n,$y,$c]) {
  $di->execute([$n,'Jean','Jean','1',$y,$c,'',str_starts_with($c,'99') ? 'ALGERIE' : '',$y + 60]); }
$pdo->exec("INSERT INTO insee_deces_imports(filename,row_count,inserted_count,max_annee_deces,min_annee_deces) VALUES('deces-test.csv',11,11,2010,1961)");
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
        // index.php ne charge pas encore ce fichier : on l'ajoute (comme le feront les balises)
        if (!await p.evaluate(() => !!window.LCNDA_EXT?.terreGens)) { await p.addStyleTag({url: base + 'assets/css/lot10-terre-gens.css'}); await p.addScriptTag({url: base + 'assets/js/heritage-lot10-terre-gens.js'}); }
        await p.waitForFunction(() => window.LCNDA_EXT?.terreGens, null, {timeout: 10000});
        const api = (x, qq = {}) => p.evaluate(([y, z]) => window.LCNDA_APP.api(y, z).catch(e => ({error: e.message})), [x, qq]);
        const post = (a, b) => p.evaluate(async ([x, y]) => { try { const r = await window.LCNDA_APP.api(x, {}, {method: 'POST', body: y}); return r.result || r; } catch (e) { return {error: e.message}; } }, [a, b]);

        await t('l10t_person : lieux (le lieu-dit « la Combe des Échelles, Tulle » → Tulle + lieu-dit), métier, conjointe et ses lieux', async () => {
            const r = await api('l10t_person', {id: 1});
            assert.strictEqual(r.ok, true, JSON.stringify(r).slice(0, 300)); assert.strictEqual(r.online, true);
            const ld = Object.values(r.places).find(x => x.lieudit);
            assert.ok(ld && ld.insee === '19272' && ld.lieudit === 'la Combe des Échelles' && ld.lat, JSON.stringify(ld));
            assert.deepStrictEqual(r.jobs, ['carrier']);
            assert.strictEqual(r.spouses.length, 1); assert.strictEqual(r.spouses[0].first, 'Marie');
            assert.ok(Object.values(r.spouses[0].places).some(x => x.insee === '19146'));
            const ph = Object.values((await api('l10t_person', {id: 6})).places).find(x => x.name === 'Philippeville');
            assert.strictEqual(ph.cc, 'dz'); assert.strictEqual(ph.insee, '');
            const liv = await api('l10t_person', {id: 8}); assert.strictEqual(liv.online, false, 'vivante : rien en ligne');
        });
        await t('⛰️ Géorisques (réponses enregistrées) : Grenoble, l’éboulement de 1837 ; Caen, 114 cavités ; gardé ; hors ligne : message', async () => {
            const g = await api('l10t_risques', {insee: '38185'});
            assert.strictEqual(g.ok, true, JSON.stringify(g).slice(0, 300));
            assert.strictEqual(g.mvt[0].date, '1837-08-12'); assert.match(g.mvt[0].type, /Chute de blocs/); assert.strictEqual(g.cav_total, 0);
            assert.match(g.url_mvt, /^https:\/\/www\.georisques\.gouv\.fr\/api\/v1\/mvt\?code_insee=38185/);
            const c = await api('l10t_risques', {insee: '14118'}); assert.strictEqual(c.cav_total, 114); assert.ok(c.cav.some(x => x.type === 'carrière'));
            const n = calls().length; const again = await api('l10t_risques', {insee: '38185'});
            assert.strictEqual(again.cached, true); assert.strictEqual(calls().length, n, 'pas de nouvel appel');
            const off = await api('l10t_risques', {insee: '19272'}); assert.strictEqual(off.ok, false); assert.match(off.message, /Pas de connexion/);
            const bad = await api('l10t_risques', {insee: 'abc'}); assert.ok(bad.error);
        });
        await t('👥 la carte du nom : les MAZAUD nés surtout en Corrèze (décès INSEE de l’app, rien en ligne)', async () => {
            const n = calls().length;
            const r = await api('l10t_nom', {last: 'Mazaud'});
            assert.strictEqual(r.total, 10); assert.strictEqual(r.deps[0].dep, '19'); assert.strictEqual(r.deps[0].n, 6); assert.strictEqual(r.abroad_total, 1);
            assert.ok(r.deps[0].lat > 45 && r.deps[0].lat < 46); assert.deepStrictEqual(r.deaths, [1961, 2010]);
            assert.strictEqual(calls().length, n);
            const none = await api('l10t_nom', {last: 'Inconnu'}); assert.strictEqual(none.total, 0);
        });
        await t('🚶 le temps de marche Tulle → Naves (altitudes IGN enregistrées) : Tobler, relief compris', async () => {
            const r = await api('l10t_marche', {lat1: 45.2694, lon1: 1.768, lat2: 45.3118, lon2: 1.7521});
            assert.strictEqual(r.ok, true, JSON.stringify(r).slice(0, 300));
            assert.ok(r.walk.km > 5 && r.walk.km < 8 && r.walk.up > 200 && r.walk.hours > r.walk.flat_hours, JSON.stringify(r.walk));
            assert.ok(r.profile.length === 20 && /elevationLine\.json/.test(r.url));
            assert.strictEqual((await api('l10t_marche', {lat1: 45, lon1: 1, lat2: 48.85, lon2: 2.35})).too_far, true);
        });
        await t('🗺️ la parcelle du lieu-dit « Combe des Échelles » à Tulle : IGN puis cadastre (Parcellaire Express)', async () => {
            const r = await api('l10t_parcelle', {insee: '19272', lieudit: 'Combe des Échelles'});
            assert.strictEqual(r.ok, true, JSON.stringify(r).slice(0, 300));
            assert.strictEqual(r.places[0].name, 'la Combe des Échelles');
            assert.ok(r.parcels.length >= 1 && r.parcels[0].insee === '19272' && /^BY|^BX/.test(r.parcels[0].section), JSON.stringify(r.parcels).slice(0, 300));
            assert.ok((await api('l10t_parcelle', {insee: '19272', lieudit: ''})).error);
        });

        /* ═════════ 2. l'écran ═════════ */
        const open = async id => { await p.evaluate(x => { document.querySelectorAll('[data-l10-done]').forEach(e => e.removeAttribute('data-l10-done')); const A = window.LCNDA_APP; A.state.currentPersonId = x; A.setModule('personnes'); }, id); };
        const line = async (id, k) => ((await p.$(`[data-l10-person="${id}"] [data-l10-line="${k}"]`)) ? p.textContent(`[data-l10-person="${id}"] [data-l10-line="${k}"]`) : '');
        await t('fiche de Jean MAZAUD : 🌋 1816, 🪨 Grenoble 1837, 🕳️ carrières de Caen, 👥 son nom, 🚶 Marie à Naves, 🐴 sa route, 🗺️ la parcelle', async () => {
            await open(1);
            await p.waitForSelector('[data-l10-person="1"] [data-l10-line="volcans"]', {timeout: 20000});
            await p.waitForSelector('[data-l10-person="1"] [data-l10-line="marche"]', {timeout: 20000});
            await p.waitForSelector('[data-l10-person="1"] [data-l10-line="cavites"]', {timeout: 20000});
            assert.match(await line(1, 'volcans'), /En 1816, l’« année sans été », il avait 16 ans : l’éruption du Tambora/);
            assert.match(await line(1, 'volcans'), /le prix du blé double entre 1815 et 1817/);
            assert.match(await line(1, 'mvt'), /De son vivant, à Grenoble : chute de blocs \/ eboulement \(Porte de France\) en 12 août 1837 — il avait 37 ans/);
            assert.match(await line(1, 'cavites'), /114 cavités souterraines sont recensées à Caen \(62 carrières/);
            assert.match(await line(1, 'nom'), /Les MAZAUD du fichier des décès de l’INSEE \(morts entre 1961 et 2010\) sont nés surtout dans le département Corrèze \(66,7 %\)/);
            assert.match(await line(1, 'marche'), /Sa femme, Marie, habitait à Naves : environ \d+ h? ?\d* ?(min)? ?de marche depuis Tulle/);
            assert.match(await line(1, 'relais'), /De Tulle à Caen \(\d+ km\)/);
            assert.match(await line(1, 'parcelle'), /« la Combe des Échelles » \(Tulle\) sur le cadastre/);
            for (const k of ['volcans', 'mvt', 'nom', 'marche']) assert.ok(await p.$(`[data-l10-person="1"] [data-l10-line="${k}"] a[target="_blank"][rel~="noopener"]`), `↗ source : ${k}`);
            await p.click('[data-l10-person="1"] [data-l10-parcel-go]');
            await p.waitForSelector('[data-l10-person="1"] [data-l10-parcel-key]', {timeout: 15000});
            assert.match(await line(1, 'parcelle'), /tombe dans la parcelle B[XY] \d+ du cadastre d’aujourd’hui/);
            assert.strictEqual(await p.$eval('[data-pblock="terre_gens"]', el => el.hidden), false);
            if (process.env.L10T_SHOT) { await p.$eval('[data-pblock="terre_gens"]', el => { el.querySelectorAll('details').forEach(d => { d.open = true; }); el.scrollIntoView(); }); await (await p.$('[data-pblock="terre_gens"]')).screenshot({path: process.env.L10T_SHOT}); }
        });
        await t('Pierre DURAND, marin pêcheur à Brest : ⚓ le naufrage de son vivant ; Paul (Philippeville) ; Louis (Québec) ; Hans (Vevey) ; Joseph (Chamonix)', async () => {
            await open(3); await p.waitForSelector('[data-l10-person="3"] [data-l10-line="epaves"]', {timeout: 20000});
            assert.match(await line(3, 'epaves'), /De son vivant, à \d+ km de Brest : Swansea Vale \((8 août )?1918\) — il avait 28 ans/);
            await open(6); await p.waitForSelector('[data-l10-person="6"] [data-l10-line="algerie"]', {timeout: 20000});
            assert.match(await line(6, 'algerie'), /Philippeville \(aujourd’hui Skikda\) a été créée en 1838, avant sa naissance/);
            await open(5); await p.waitForSelector('[data-l10-person="5"] [data-l10-line="quebec"]', {timeout: 20000});
            assert.match(await line(5, 'quebec'), /Près de Québec, de son temps : .* \(depuis 1[56]\d\d\)/);
            assert.ok(await p.$('[data-l10-person="5"] a[href^="https://www.patrimoine-culturel.gouv.qc.ca/rpcq/detail.do"]'));
            await open(7); await p.waitForSelector('[data-l10-person="7"] [data-l10-line="suisse"]', {timeout: 20000});
            assert.ok(await p.$('[data-l10-person="7"] a[href="https://hls-dhs-dss.ch/fr/articles/002620/"]'));
            await open(9); await p.waitForSelector('[data-l10-person="9"] [data-l10-line="avalanches"]', {timeout: 20000});
            assert.match(await line(9, 'avalanches'), /De son vivant, .* de Chamonix-Mont-Blanc : 1999 Montroc avalanche, le 9 février 1999 .* il avait 69 ans/);
        });
        await t('Léa MAZAUD (vivante) : rien n’est demandé en ligne ; pas de bloc vide', async () => {
            const n = calls().length;
            await open(8); await sleep(1500);
            assert.strictEqual(calls().length, n, 'aucun appel en ligne');
            const card = await p.$('[data-pblock="terre_gens"]');
            assert.ok(!card || await card.evaluate(el => el.hidden || !el.querySelector('.l10-line:not(:empty)') || /MAZAUD/.test(el.textContent)), 'seulement la carte du nom (calculée dans l’app)');
        });
        await t('Où chercher : 🇺🇸 recensement de 1950 pour Anne (États-Unis), éteint dans Réglages → retiré', async () => {
            const s = await p.evaluate(() => { const x = window.LCNDA_OUC_MONDE.SITES.find(s => s.key === 'l10t_us1950'); return x && {url: x.url({first: 'Anne', last: 'DURAND'}), c: x.rel.countries}; });
            assert.ok(s, 'site enregistré'); assert.strictEqual(s.url, 'https://1950census.archives.gov/search/?name=Anne%20DURAND'); assert.deepStrictEqual(s.c, ['us']);
            const sug = await p.evaluate(async () => { const o = window.LCNDA_EXT.ouChercher; if (!o?.suggest) return null; try { const r = await o.suggest(4); return JSON.stringify(r).includes('l10t_us1950'); } catch (_) { return null; } });
            if (sug !== null) assert.strictEqual(sug, true, 'proposé pour Anne');
            await p.evaluate(() => { localStorage.setItem('genealogie-terre-gens', JSON.stringify({census: false})); window.LCNDA_EXT.terreGens.registerOuChercher(); });
            assert.strictEqual(await p.evaluate(() => window.LCNDA_OUC_MONDE.SITES.some(s => s.key === 'l10t_us1950')), false);
            await p.evaluate(() => { localStorage.removeItem('genealogie-terre-gens'); window.LCNDA_EXT.terreGens.registerOuChercher(); });
        });
        await t('monographie : Grenoble → 🪨 glissements ; Brest → ⚓ épaves ; Chamonix → 🏔️ ; rien pour Tulle (hors ligne)', async () => {
            const ids = await p.evaluate(() => (window.LCNDA_EXT.monographSections || []).filter(s => /^l10t_/.test(s.id)).map(s => s.id));
            assert.deepStrictEqual(ids, ['l10t_avalanches', 'l10t_risques', 'l10t_epaves', 'l10t_relais', 'l10t_algerie', 'l10t_quebec', 'l10t_suisse']);
            const run = (id, place) => p.evaluate(async ([i, pl]) => { const h = document.createElement('div'); document.body.appendChild(h); const s = window.LCNDA_EXT.monographSections.find(x => x.id === i);
                const ok = await s.render(pl, h, {village: async () => (pl.insee ? {insee: pl.insee} : null)}); const t = h.textContent; h.remove(); return {ok, t}; }, [id, place]);
            const g = await run('l10t_risques', {id: 3, name: 'Grenoble', latitude: 45.1841, longitude: 5.7153, insee: '38185'});
            assert.strictEqual(g.ok, true); assert.match(g.t, /10 mouvements de terrain connus à Grenoble, le plus ancien en 1837/);
            const b = await run('l10t_epaves', {id: 6, name: 'Brest', latitude: 48.406, longitude: -4.5012});
            assert.strictEqual(b.ok, true); assert.match(b.t, /épaves connues au large de Brest/);
            const c = await run('l10t_avalanches', {id: 12, name: 'Chamonix-Mont-Blanc', latitude: 45.9293, longitude: 6.9311});
            assert.match(c.t, /Montroc/); assert.match(c.t, /Enquête permanente sur les avalanches/);
            const none = await run('l10t_algerie', {id: 1, name: 'Tulle', latitude: 45.27, longitude: 1.77, insee: '19272'}); assert.strictEqual(none.ok, false);
        });
        await t('LCNDA_EXT.dataSources, dataLists, mapLayerSources ; 🔎 Ce qui le concerne ne répète pas le bloc', async () => {
            const ids = await p.evaluate(() => (window.LCNDA_EXT.dataSources || []).filter(d => /^l10t_/.test(d.id)).map(d => d.id));
            assert.ok(ids.length >= 20 && ids.includes('l10t_p_nom') && ids.includes('l10t_lieu_parcelle') && ids.includes('l10t_annee_volcans') && ids.includes('l10t_lieu_marche'));
            const y = await p.evaluate(async () => { const h = document.createElement('div'); const ok = await window.LCNDA_EXT.dataSources.find(d => d.id === 'l10t_annee_volcans').run({year: 1816}, h); return {ok, t: h.textContent}; });
            assert.strictEqual(y.ok, true); assert.match(y.t, /Tambora/);
            const pl = await p.evaluate(async () => { const h = document.createElement('div'); const ok = await window.LCNDA_EXT.dataSources.find(d => d.id === 'l10t_lieu_parcelle').run({place: {id: 1, name: 'Tulle', insee: '19272', lat: 45.27, lon: 1.77}}, h); return {ok, form: !!h.querySelector('[data-l10-parcel-form]')}; });
            assert.deepStrictEqual(pl, {ok: true, form: true});
            const L = await p.evaluate(async () => Promise.all((window.LCNDA_EXT.dataLists || []).filter(d => /^l10t_/.test(d.id) && d.load).map(async d => { const rows = await d.load(); return {id: d.id, n: rows.length, src: !!d.source && !!d.sourceUrl, urls: d.fields.some(f => f.type === 'url')}; })));
            assert.ok(L.length >= 7 && L.every(x => x.src && x.urls && x.n > 0), JSON.stringify(L));
            const q = await p.evaluate(async () => { const d = window.LCNDA_EXT.dataLists.find(x => x.id === 'l10t_nom'); return d.query({q: 'MAZAUD'}); });
            assert.strictEqual(q.rows[0].dep, '19');
            const layer = await p.evaluate(async () => { const s = window.LCNDA_EXT.mapLayerSources.find(x => x.id === 'l10t_epaves'); const r = await s.run({bbox: [-5.5, 48, -4, 49], max: 500}); return {n: r.features.length, src: r.source}; });
            assert.ok(layer.n > 5 && /CC0/.test(layer.src), JSON.stringify(layer));
            const sheet = await p.evaluate(() => { const s = document.querySelector('script[src*="heritage-tout-sur"]'); return !!s; });
            if (sheet) { const src = fs.readFileSync(path.join(root, 'assets/js/heritage-tout-sur.js'), 'utf8'); assert.match(src, /\[\/\^l10t_p_\/, 'terre_gens'\]/); }
        });
        await t('Réglages → ⛰️ Sa terre et ses gens : licences, liens seulement ; éteindre « volcans » le retire (↶ Annuler)', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'terre_gens'; A.setModule('maintenance'); });
            await p.waitForSelector('[data-l10-settings] [data-l10-tg="volcans"] input', {timeout: 20000});
            const s = await p.textContent('[data-l10-settings]');
            assert.match(s, /Licence Ouverte 2\.0/); assert.match(s, /CC0 1\.0/); assert.match(s, /CC BY-SA 4\.0/); assert.match(s, /Enquête permanente sur les avalanches/); assert.match(s, /Décès INSEE importés : 11 personnes/);
            await p.uncheck('[data-l10-tg="volcans"] input');
            assert.strictEqual(JSON.parse(await p.evaluate(() => localStorage.getItem('genealogie-terre-gens'))).volcans, false);
            await open(1); await p.waitForSelector('[data-l10-person="1"] [data-l10-line="nom"]', {timeout: 20000});
            assert.strictEqual(await p.$('[data-l10-person="1"] [data-l10-line="volcans"]'), null);
            await p.evaluate(() => localStorage.removeItem('genealogie-terre-gens'));
            const a = await api('l10t_about'); assert.ok(a.cache.count >= 3);
            const c = await post('l10t_cache_clear', {}); assert.ok(c.removed >= 3);
            assert.strictEqual((await api('l10t_about')).cache.count, 0);
            assert.strictEqual((await post('l10t_cache_restore', {token: c.token})).restored, c.removed);
        });
        await t('pas d’erreur JavaScript', async () => { assert.deepStrictEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true});
    }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})();
