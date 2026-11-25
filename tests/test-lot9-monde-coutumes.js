#!/usr/bin/env node
/* 🌍 Le monde et les coutumes de son temps (lot 9) : lib/lot9_monde_coutumes.php, assets/js/heritage-lot9-monde-coutumes.js,
 * assets/css/lot9-monde-coutumes.css, données assets/data/l9b-*.json.gz (scripts/lot9-monde-coutumes/*).
 * Le réseau (Sudoc, Wikidata) est remplacé par des réponses VRAIES enregistrées une fois (tests/fixtures/lot9-monde-coutumes/,
 * GENEALOGY_TEST=1 + LCNDA_TEST_L9B_DIR) ; un fichier absent = hors ligne.
 *  0. les données livrées : taille, source, licence ; les calculs (planète, pape, gabelle, journaux, nourrice, soldat, décorations) ;
 *  1. serveur : contexte d'une fiche, lieu, 🎓 thèse (✓ C'est lui ↶, ✗ Pas lui ↶, jamais pour un vivant), 🌐 noms, cache ↶ ;
 *  2. écran : bloc de fiche « 🌍 Son monde et ses coutumes », monographie, 🧰 Données, Listes, carte, Où chercher, Réglages.
 *   node tests/test-lot9-monde-coutumes.js */
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
const FX = path.join(__dirname, 'fixtures/lot9-monde-coutumes');
const file = n => path.join(root, 'assets/data', `l9b-${n}.json.gz`);
const data = n => (fs.existsSync(file(n)) ? JSON.parse(zlib.gunzipSync(fs.readFileSync(file(n))).toString('utf8')) : null);
const AR = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root, 'assets/data/dp-ancien-regime.json.gz'))).toString('utf8'));
const M = require('../assets/js/heritage-lot9-monde-coutumes.js');
const TULLE = '19272', GRENOBLE = '38185', RENNES = '35238', PARIS = '75056', AVALLON = '89025';

(async () => {
    /* ═════════ 0. les données livrées ═════════ */
    const PL = data('planete'), PA = data('papes'), SO = data('sommets'), SE = data('sejours'), VO = data('voyages'), CO = data('coutumes'), JO = data('journaux'), ET = data('etoiles'), UN = data('uniformes');
    await t('données livrées : moins de 15 Mo en tout ; chaque fichier dit sa source et sa licence', async () => {
        const files = fs.readdirSync(path.join(root, 'assets/data')).filter(f => /^l9b-.*\.json\.gz$/.test(f));
        const total = files.reduce((n, f) => n + fs.statSync(path.join(root, 'assets/data', f)).size, 0);
        console.log(`   ${files.length} fichiers, ${(total / 1e6).toFixed(2)} Mo : ${files.map(f => `${f} ${Math.round(fs.statSync(path.join(root, 'assets/data', f)).size / 1024)} Ko`).join(', ')}`);
        assert.ok(total < 15e6);
        assert.ok(PL && PA && SO && SE && VO && CO && JO, 'les fichiers principaux sont là');
        for (const k of ['un', 'hyde', 'law', 'mlo', 'temp']) assert.ok(PL.src[k].label && PL.src[k].licence && PL.src[k].url, k);
        for (const d of [PA, SO, SE]) assert.ok(d.src && d.licence === 'CC0 1.0' && d.url);
        assert.ok(JO.src && JO.licence && JO.url && JO.rows.length > 30000);
        assert.ok(PA.rows.length > 100 && PA.rows.every(p => /^Q\d+$/.test(p.q) && /^\d{4}/.test(p.s)));
        assert.ok(SO.rows.length > 1000 && SO.rows.every(m => /^Q\d+$/.test(m.q) && m.n && m.lat != null && m.d));
        assert.ok(SE.rows.length > 500 && SE.rows.every(r => /^Q\d+$/.test(r.q) && r.s && r.occ.length));
        // chaque fait d'un texte sourcé a sa phrase et son adresse
        const quoted = [...CO.compagnons.facts, ...CO.decorations, ...CO.nourrices.facts, ...CO.deuil.rules, ...CO.deuil.notes, ...CO.mariage.flatMap(r => r.items), ...CO.octroi.facts, ...CO.octroi.cities,
            ...CO.eclairage.cities.flatMap(c => c.facts), ...Object.values(CO.gabelle.cats), ...CO.gabelle.prices, ...VO.trips.flatMap(x => x.stops)];
        assert.ok(quoted.length > 200);
        for (const x of quoted) { assert.ok(x.q && x.q.length > 15 && /^https:\/\/(fr\.wikipedia\.org|archive\.org)\//.test(x.url) && x.title, JSON.stringify(x).slice(0, 200)); }
        assert.ok(CO.decorations.every(d => !d.image || (d.image.page && d.image.licence)), 'chaque image a sa licence');
        if (UN) assert.ok(UN.rows.every(r => r.page && /public|cc0|pd/i.test(r.licence) && r.y));
        if (ET) assert.ok(ET.rows.every(r => r.n && r.y && r.mag != null && (r.wp || r.src)));
    });
    await t('calculs : la planète en 1800 et 1880, le pape d’un jour, la gabelle d’une commune (atlas d’Ancien Régime)', async () => {
        const a = M.planetAt(PL, 1800), b = M.planetAt(PL, 1880), c = M.planetAt(PL, 1960);
        assert.ok(a.pop > 8e8 && a.pop < 1.2e9 && a.popSrc === 'hyde' && a.est, JSON.stringify(a));
        assert.ok(a.co2 > 275 && a.co2 < 290 && a.co2Src === 'law');
        assert.ok(b.pop > a.pop && b.temp != null);
        assert.strictEqual(c.popSrc, 'un'); assert.strictEqual(c.co2Src, 'mlo');
        const pius = M.popeAt(PA, '1800-05-04'); assert.strictEqual(pius.length, 1); assert.match(pius[0].n, /^Pie VII$/);
        assert.deepStrictEqual(M.popeAt(PA, '1800-01-15'), [], 'siège vacant entre Pie VI et Pie VII : personne');
        const g = insee => M.gabelleOf(CO, AR, insee)?.cat;
        assert.strictEqual(g(TULLE), 'redime'); assert.strictEqual(g(PARIS), 'grande'); assert.strictEqual(g(RENNES), 'exempt');
        assert.strictEqual(g('50147'), 'quart', 'Coutances : quart-bouillon'); assert.strictEqual(g('54395'), 'salines', 'Nancy'); assert.strictEqual(g('69123'), 'petite', 'Lyon');
        assert.strictEqual(g('71270'), 'petite', 'Mâcon : petite gabelle malgré la généralité de Dijon');
    });
    await t('calculs : les journaux de Tulle en 1880 (BnF), le bébé mort loin de chez lui, le soldat, la médaille', async () => {
        const j = M.journauxFor(JO, TULLE, 1880);
        assert.ok(j.here.some(r => r.t === 'Le Corrézien'), 'Le Corrézien (1855-1944)'); assert.ok(j.here.every(r => r.y1 <= 1880 && (r.y2 || r.y1) >= 1880));
        assert.ok(j.dep.every(r => String(r.i).startsWith('19')));
        const P = {id: 3, events: [{kind: 'birth', year: 1826, place: 'a'}, {kind: 'death', year: 1827, place: 'b'}], places: {a: {insee: PARIS, name: 'Paris', lat: 48.85, lon: 2.35}, b: {insee: AVALLON, name: 'Avallon', lat: 47.49, lon: 3.9}}, texts: [], jobs: []};
        assert.ok(M.nourriceCase(P, M.lifeOf(P))?.away, 'né à Paris, mort à Avallon à 1 an');
        const Q = {...P, places: {a: P.places.a, b: P.places.a}, texts: ['placé en nourrice chez la femme Roy']};
        assert.ok(M.nourriceCase(Q, M.lifeOf(Q))?.said);
        const S = {events: [{kind: 'birth', year: 1790}, {kind: 'mili', year: 1812}], places: {}, jobs: [{text: 'grenadier'}], texts: []};
        assert.deepStrictEqual(M.soldierOf(S, M.lifeOf(S)), {year: 1812, arm: 'infanterie'});
        assert.deepStrictEqual(M.decoFound(CO, {texts: ['Il reçut la médaille de Sainte-Hélène en 1858'], jobs: []}).map(d => d.id), ['sainte_helene']);
        assert.deepStrictEqual(M.decoFound(CO, {texts: ['croix de guerre 1939-1945'], jobs: []}).map(d => d.id), ['cg3945'], 'pas la croix de 14-18');
    });

    /* ═════════ 1. le serveur ═════════ */
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-l9b-')), net0 = path.join(tmp, 'net');
    fs.mkdirSync(path.join(tmp, 'media'), {recursive: true}); fs.cpSync(FX, net0, {recursive: true});
    const calls = () => { try { return fs.readFileSync(path.join(net0, 'calls.log'), 'utf8').trim().split('\n').filter(Boolean); } catch (_) { return []; } };
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4', GENEALOGY_TEST: '1', LCNDA_TEST_L9B_DIR: net0};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start,occupation) VALUES(1,'Jean','MAZAUD','male','deceased',1,'charpentier'),(2,'Marie','LACOMBE','female','deceased',0,''),(3,'Pierre','MAZAUD','male','deceased',0,''),(4,'Gilbert','PETIT','male','deceased',0,'médecin'),(5,'Anne','DURAND','female','living',0,'médecin'),(6,'Louis','DURAND','male','deceased',0,'')");
$pdo->exec("INSERT INTO places(id,name,county,country,latitude,longitude,admin4_code) VALUES(1,'Grenoble','Isère','France',45.1885,5.7245,'38185'),(2,'Rennes','Ille-et-Vilaine','France',48.1113,-1.68,'35238'),(3,'Paris','Paris','France',48.8566,2.3522,'75056'),(4,'Avallon','Yonne','France',NULL,NULL,''),(5,'Tulle','Corrèze','France',NULL,NULL,'')");
$t = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn();
$ins = $pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,date_text,year,sort_date,place_id,title,description) VALUES('person',?,?,?,?,?,?,?,?)");
$ins->execute([1,$t('BIRT'),'2 mai 1800',1800,'1800-05-02',1,'','']); $ins->execute([1,$t('CHR'),'4 mai 1800',1800,'1800-05-04',1,'','']);
$ins->execute([1,$t('MISE'),'1812',1812,'1812-00-00',NULL,'','grenadier au 4e régiment']); $ins->execute([1,$t('RESI'),'1850',1850,'1850-00-00',3,'','']);
$ins->execute([1,$t('DEAT'),'1880',1880,'1880-00-00',1,'','']);
$ins->execute([2,$t('BIRT'),'1802',1802,'1802-00-00',2,'','']); $ins->execute([2,$t('DEAT'),'1870',1870,'1870-03-01',3,'','']);
$ins->execute([3,$t('BIRT'),'1826',1826,'1826-04-01',3,'','']); $ins->execute([3,$t('DEAT'),'1827',1827,'1827-02-01',4,'','']);
$ins->execute([4,$t('BIRT'),'1857',1857,'1857-00-00',3,'','']); $ins->execute([4,$t('DEAT'),'1920',1920,'1920-00-00',3,'','']);
$ins->execute([5,$t('BIRT'),'1990',1990,'1990-00-00',3,'','']);
$ins->execute([6,$t('BIRT'),'1750',1750,'1750-06-01',5,'','']); $ins->execute([6,$t('DEAT'),'1810',1810,'1810-00-00',5,'','']);
$pdo->exec("INSERT INTO families(id,partner1_id,partner2_id) VALUES(1,1,2)");
$pdo->exec("INSERT INTO family_children(family_id,child_id) VALUES(1,3)");
$pdo->prepare("INSERT INTO events(scope,family_id,event_type_id,date_text,year,sort_date,place_id) VALUES('family',1,?,?,?,?,2)")->execute([$t('MARR'),'1825',1825,'1825-06-10']);
$pdo->exec("INSERT INTO notes(entity_type,entity_id,title,body) VALUES('person',1,'','Compagnon du Devoir, dit Dauphiné-la-Fidélité. Médaille de Sainte-Hélène en 1858.')");
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
        // index.php ne charge pas encore ces fichiers : on les ajoute (comme le feront les balises)
        for (const [js, css, k] of [['heritage-droit-pouvoir.js', 'droit-pouvoir.css', 'droitPouvoir'], ['heritage-monographie-plus.js', 'monographie-plus.css', 'monographiePlus'], ['app-listes-donnees.js', '', ''], ['heritage-lot9-monde-coutumes.js', 'lot9-monde-coutumes.css', 'mondeCoutumes']]) {
            if (k && await p.evaluate(x => !!window.LCNDA_EXT?.[x], k)) continue;
            if (!k && await p.evaluate(() => !!document.querySelector('script[src*="app-listes-donnees"]'))) continue;
            if (!fs.existsSync(path.join(root, 'assets/js', js))) continue;
            if (css) await p.addStyleTag({url: base + 'assets/css/' + css});
            await p.addScriptTag({url: base + 'assets/js/' + js});
        }
        await p.waitForFunction(() => window.LCNDA_EXT?.mondeCoutumes, null, {timeout: 10000});
        const api = (x, qq = {}) => p.evaluate(([y, z]) => window.LCNDA_APP.api(y, z).catch(e => ({error: e.message})), [x, qq]);
        const post = (a, b) => p.evaluate(async ([x, y]) => { try { const r = await window.LCNDA_APP.api(x, {}, {method: 'POST', body: y}); return r.result || r; } catch (e) { return {error: e.message}; } }, [a, b]);

        await t('l9b_person : lieux (code INSEE trouvé par le nom : Avallon), événements, métier, notes, famille (décès)', async () => {
            const r = await api('l9b_person', {id: 1});
            assert.strictEqual(r.ok, true, JSON.stringify(r).slice(0, 300));
            assert.ok(r.places[GRENOBLE] && r.places[RENNES] && r.places[PARIS]);
            assert.ok(r.events.some(e => e.kind === 'marriage' && e.place === RENNES && e.year === 1825), 'le mariage (événement de famille)');
            assert.ok(r.jobs.some(j => j.text === 'charpentier'));
            assert.ok(r.texts.some(x => /Dauphiné-la-Fidélité/.test(x)));
            assert.deepStrictEqual(r.family.filter(f => f.role === 'spouse').map(f => [f.id, f.dy]), [[2, 1870]]);
            const b = await api('l9b_person', {id: 3});
            assert.ok(b.places[AVALLON], 'Avallon reconnu sans code INSEE');
            const pl = await api('l9b_place', {place_id: 5});
            assert.strictEqual(pl.place.insee, TULLE); assert.strictEqual(pl.place.dep_name, 'Corrèze');
        });
        await t('🎓 sa thèse : Gilbert PETIT, médecin (1857-1920) → thèse de médecine, Paris, 1886, d’après le Sudoc (réponse enregistrée)', async () => {
            const r = await api('l9b_these', {id: 4});
            assert.strictEqual(r.ok, true, JSON.stringify(r).slice(0, 300));
            assert.strictEqual(r.kind, 'medecine');
            assert.strictEqual(r.items.length, 1, 'une seule thèse (la reproduction et les autres auteurs écartés)');
            const x = r.items[0];
            assert.match(x.title, /^Des rapports de la paralysie générale chez la femme/); assert.strictEqual(x.year, 1886); assert.match(x.url, /^https:\/\/www\.sudoc\.fr\/\d{8}[\dX]$/);
            assert.ok(calls().some(c => /^sudoc https:\/\/www\.sudoc\.abes\.fr\/cbs\/sru\/\?.*aut%3DPETIT\+Gilbert\+and\+tdo%3Dy/.test(c)), calls().join('\n'));
            const n = calls().length; await api('l9b_these', {id: 4}); assert.strictEqual(calls().length, n, 'gardé : pas de nouvel appel');
        });
        await t('🎓 jamais pour une personne vivante (Anne DURAND, médecin née en 1990) : rien ne part', async () => {
            const n = calls().length;
            const r = await api('l9b_these', {id: 5});
            assert.strictEqual(r.private, true); assert.deepStrictEqual(r.items, []);
            assert.strictEqual(calls().length, n);
            assert.strictEqual((await api('l9b_these', {id: 1})).kind, '', 'un charpentier : pas de thèse');
        });
        await t('🎓 ✓ C’est lui : une source « à vérifier » et un événement « Diplôme », puis ↶ ; ✗ Pas lui, puis ↶', async () => {
            const key = (await api('l9b_these', {id: 4})).items[0].key;
            const a = await post('l9b_these_add', {person_id: 4, key});
            assert.ok(a.batch && a.source_id && a.event_ids.length === 1, JSON.stringify(a));
            const d = await api('person', {id: 4});
            assert.ok(d.sources.some(s => /^https:\/\/www\.sudoc\.fr\//.test(s.url)));
            const ev = d.events.find(e => e.gedcom_tag === 'GRAD'); assert.ok(ev && /Thèse/.test(ev.description) && ev.fact_confidence === 'doubt');
            assert.strictEqual((await api('l9b_these', {id: 4})).items[0].verdict, 'added');
            await post('l9b_these_undo', {batch: a.batch});
            const d2 = await api('person', {id: 4});
            assert.ok(!d2.sources.length && !d2.events.some(e => e.gedcom_tag === 'GRAD'), 'tout est retiré');
            await post('l9b_these_mark', {person_id: 4, key, verdict: 'no'});
            assert.strictEqual((await api('l9b_these', {id: 4})).items[0].verdict, 'no');
            await post('l9b_these_mark', {person_id: 4, key, verdict: ''});
            assert.strictEqual((await api('l9b_these', {id: 4})).items[0].verdict, '');
        });
        await t('🌐 Tulle dans toutes les langues (Wikidata, réponses enregistrées), gardé ; hors ligne : la réponse gardée', async () => {
            if (!fs.existsSync(path.join(FX, 'wd_labels'))) { console.log('   (pas de réponse enregistrée de Wikidata)'); return; }
            const r = await api('l9b_langues', {insee: TULLE});
            assert.strictEqual(r.ok, true, JSON.stringify(r).slice(0, 300));
            assert.match(r.qid, /^Q\d+$/); assert.ok(Object.keys(r.labels).length > 50); assert.strictEqual(r.labels.fr, 'Tulle'); assert.ok(r.labels.ru);
            fs.renameSync(net0, net0 + '-off');
            try { const off = await api('l9b_langues', {insee: TULLE}); assert.strictEqual(off.labels.ru, r.labels.ru); } finally { fs.renameSync(net0 + '-off', net0); }
        });
        await t('Réglages : effacer les réponses gardées, puis ↶ les remettre', async () => {
            const a = await api('l9b_about'); assert.ok(a.cache.count >= 1);
            const c = await post('l9b_cache_clear', {}); assert.ok(c.removed >= 1);
            assert.strictEqual((await api('l9b_about')).cache.count, 0);
            assert.strictEqual((await post('l9b_cache_restore', {token: c.token})).restored, c.removed);
        });

        /* ═════════ 2. l'écran ═════════ */
        await t('fiche de Jean MAZAUD : « 🌍 Son monde et ses coutumes » — planète, pape, voyages, compagnons, médaille, uniformes, mariage, deuil, éclairage', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.currentPersonId = 1; A.setModule('personnes'); });
            await p.waitForSelector('[data-l9-person="1"] [data-l9-line="planete"]', {timeout: 20000});
            await p.waitForSelector('[data-l9-person="1"] [data-l9-line="deuil"]', {timeout: 10000});
            const line = async k => (await p.$(`[data-l9-person="1"] [data-l9-line="${k}"]`)) ? p.textContent(`[data-l9-person="1"] [data-l9-line="${k}"]`) : '';
            assert.match(await line('planete'), /À sa naissance \(1800\) : environ .* milliard d’humains, \d+ ppm de CO₂/);
            assert.match(await line('pape'), /Le pape de son baptême \(4 mai 1800\) : Pie VII/);
            assert.match(await line('voyages'), /Napoléon passe à Grenoble en 1815|Napoléon passe à Grenoble/); assert.match(await line('voyages'), /il avait 1[45] ans/);
            assert.match(await line('compagnons'), /compagnonnage, avec un surnom de compagnon : « Dauphiné-la-Fidélité »/);
            assert.match(await line('decorations'), /Médaille de Sainte-Hélène/);
            if (UN?.rows.some(r => Math.abs(r.y - 1812) <= 12)) assert.match(await line('uniformes'), /Les uniformes de son époque \(1812, infanterie\)/);
            assert.match(await line('mariage'), /Haute-Bretagne.*Sébillot \(1886\)/);
            assert.match(await line('deuil'), /À la mort de sa femme \(Marie\) en 1870, l’usage voulait un an de deuil/);
            assert.match(await line('eclairage'), /Paris/);
            assert.ok(await p.$('[data-l9-person="1"] a[href^="https://fr.wikipedia.org/"][target="_blank"]'), 'lien vers la source');
            assert.strictEqual(await p.$eval('[data-pblock="monde_coutumes"]', el => el.hidden), false);
            if (process.env.L9B_SHOT) { await p.$eval('[data-pblock="monde_coutumes"]', el => { el.querySelectorAll('details').forEach(d => { d.open = true; }); el.scrollIntoView(); }); await (await p.$('[data-l9-person="1"]')).screenshot({path: process.env.L9B_SHOT}); }
        });
        await t('fiche de Pierre MAZAUD (né à Paris, mort à Avallon à 1 an) : 👶 les nourrices ; Où chercher : les registres des nourrices', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.currentPersonId = 3; A.setModule('personnes'); });
            await p.waitForSelector('[data-l9-person="3"] [data-l9-line="nourrices"]', {timeout: 20000});
            assert.match(await p.textContent('[data-l9-person="3"] [data-l9-line="nourrices"]'), /Né·e à Paris, mort·e à Avallon avant 3 ans/);
            const txt = await p.evaluate(async () => { const body = document.createElement('div'); document.body.appendChild(body); window.LCNDA_EXT.ouChercher.afterRedraw.forEach(fn => fn({pid: 3}, body)); for (let i = 0; i < 40 && !body.querySelector('[data-l9-ouc-nourrice]'); i++) await new Promise(r => setTimeout(r, 100)); const t = body.textContent; body.remove(); return t; });
            assert.match(txt, /Les registres des nourrices/); assert.match(txt, /loi Roussel/);
        });
        await t('fiche de Gilbert PETIT : 🎓 « Thèse d’exercice (Médecine), Paris, 1886 » avec ✓ C’est lui / ✗ Pas lui', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.currentPersonId = 4; A.setModule('personnes'); });
            await p.waitForSelector('[data-l9-person="4"] [data-l9-line="these"] [data-l9-these-add]', {timeout: 20000, state: 'attached'});
            assert.match(await p.textContent('[data-l9-person="4"] [data-l9-line="these"]'), /Thèse d.exercice \(médecine\), Paris, 1886 : « Des rapports/i);
        });
        await t('fiche de Louis DURAND (Tulle, 1750-1810) : 🧂 pays rédimé, avec la phrase de Wikipédia', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.currentPersonId = 6; A.setModule('personnes'); });
            await p.waitForSelector('[data-l9-person="6"] [data-l9-line="gabelle"]', {timeout: 20000});
            const txt = await p.textContent('[data-l9-person="6"] [data-l9-line="gabelle"]');
            assert.match(txt, /Avant 1790, à Tulle : pays rédimé/); assert.match(txt, /Henri II/);
        });
        await t('monographie : les parties enregistrées ; Grenoble → 🐎 le vol de l’Aigle ; Tulle → 🗞️ journaux et 🧂 gabelle ; rien pour Bruxelles', async () => {
            const ids = await p.evaluate(() => (window.LCNDA_EXT.monographSections || []).filter(s => /^l9_/.test(s.id)).map(s => s.id));
            assert.deepStrictEqual(ids, ['l9_sommets', 'l9_sejours', 'l9_voyages', 'l9_gabelle', 'l9_octroi', 'l9_eclairage', 'l9_journaux', 'l9_langues']);
            const run = (id, place, ctx = {}) => p.evaluate(async ([i, pl]) => { const h = document.createElement('div'); document.body.appendChild(h); const s = window.LCNDA_EXT.monographSections.find(x => x.id === i);
                const ok = await s.render(pl, h, {village: async () => (pl.insee ? {insee: pl.insee} : null), years: async () => ({from: 1860, to: 1900})}); const t = h.textContent; h.remove(); return {ok, t}; }, [id, place]);
            const g = await run('l9_voyages', {id: 1, name: 'Grenoble', latitude: 45.1885, longitude: 5.7245, insee: GRENOBLE});
            assert.strictEqual(g.ok, true); assert.match(g.t, /Napoléon passe à Grenoble/);
            const j = await run('l9_journaux', {id: 5, name: 'Tulle', insee: TULLE});
            assert.strictEqual(j.ok, true); assert.match(j.t, /Les journaux qu’on lisait chez lui en 1880/); assert.match(j.t, /Le Corrézien/);
            const ga = await run('l9_gabelle', {id: 5, name: 'Tulle', insee: TULLE});
            assert.match(ga.t, /pays rédimé/);
            const none = await run('l9_gabelle', {id: 0, name: 'Bruxelles', country: 'Belgique', latitude: 50.85, longitude: 4.35});
            assert.strictEqual(none.ok, false);
        });
        await t('LCNDA_EXT.dataSources, dataLists, mapLayerSources : à la demande ; listes avec source et lien par ligne', async () => {
            const ids = await p.evaluate(() => (window.LCNDA_EXT.dataSources || []).filter(d => /^l9_/.test(d.id)).map(d => d.id));
            assert.ok(ids.length >= 25 && ids.includes('l9_these') && ids.includes('l9_lieu_journaux') && ids.includes('l9_annee_pape'));
            const y = await p.evaluate(async () => { const h = document.createElement('div'); const ok = await window.LCNDA_EXT.dataSources.find(d => d.id === 'l9_annee_pape').run({year: 1900}, h); return {ok, t: h.textContent}; });
            assert.strictEqual(y.ok, true); assert.match(y.t, /Léon XIII/);
            const pp = await p.evaluate(async () => { const h = document.createElement('div'); const ok = await window.LCNDA_EXT.dataSources.find(d => d.id === 'l9_planete').run({person: {id: 1}}, h); return {ok, t: h.textContent}; });
            assert.strictEqual(pp.ok, true); assert.match(pp.t, /À sa naissance \(1800\)/);
            const L = await p.evaluate(async () => Promise.all((window.LCNDA_EXT.dataLists || []).filter(d => /^l9_/.test(d.id) && d.id !== 'l9_gabelle').map(async d => { const rows = await d.load(); return {id: d.id, n: rows.length, src: !!d.source, urls: d.fields.some(f => f.type === 'url')}; })));
            assert.ok(L.length >= 9 && L.every(x => x.src && x.urls && x.n > 0), JSON.stringify(L));
            const layer = await p.evaluate(async () => { const s = window.LCNDA_EXT.mapLayerSources.find(x => x.id === 'l9_gabelle'); const r = await s.run({bbox: [1.5, 45, 2.2, 45.5], max: 500}); return {n: r.features.length, labels: [...new Set(r.features.map(f => f.label))], src: r.source}; });
            assert.ok(layer.n > 10 && layer.labels.includes('pays rédimé') && /CC BY-SA/.test(layer.src), JSON.stringify(layer));
        });
        await t('Réglages → 🌍 Monde et coutumes : éteindre « Le pape de son baptême » le retire de la fiche ; À propos des données', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'monde_coutumes'; A.setModule('maintenance'); });
            await p.waitForSelector('[data-l9-settings] [data-l9-tg="pape"] input', {timeout: 20000});
            const s = await p.textContent('[data-l9-settings]');
            assert.match(s, /CC BY 3\.0 IGO/); assert.match(s, /Licence Ouverte/); assert.match(s, /CC0 1\.0/);
            await p.uncheck('[data-l9-tg="pape"] input');
            assert.strictEqual(JSON.parse(await p.evaluate(() => localStorage.getItem('genealogie-monde-coutumes'))).pape, false);
            await p.evaluate(() => { window.LCNDA_EXT.mondeCoutumes && document.querySelectorAll('[data-l9-done]').forEach(x => x.removeAttribute('data-l9-done')); const A = window.LCNDA_APP; A.state.currentPersonId = 1; A.setModule('personnes'); });
            await p.waitForSelector('[data-l9-person="1"] [data-l9-line="planete"]', {timeout: 20000});
            assert.strictEqual(await p.$('[data-l9-person="1"] [data-l9-line="pape"]'), null);
            await p.evaluate(() => localStorage.removeItem('genealogie-monde-coutumes'));
        });
        await t('pas d’erreur JavaScript', async () => { assert.deepStrictEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true});
    }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})();
