#!/usr/bin/env node
/* 🔊 Sons et enfance (lot 9) — assets/js/heritage-lot9-sons-enfance.js, lib/lot9_sons_enfance.php, assets/css/lot9-sons-enfance.css,
 * assets/data/l9a-*.json.gz (scripts/lot9-sons-enfance/*.py).
 *  1. Node : les fichiers livrés (licences, sources, tailles) et le calcul (sons de ses 20 ans, chansons de son enfance, livres
 *     d'école, jouets de ses 6 ans, marques nées de son vivant, voitures de ses 30 ans, livre de cuisine, soldat de 14-18).
 *  2. Serveur et écran (php -S + Playwright, base temporaire) : rien ne part sur Internet (GENEALOGY_TEST=1 + LCNDA_TEST_L9A_DIR).
 *     GBIF : une réponse VRAIE (api.gbif.org, enregistrée le 2026-11-25 pour Saint-Léonard-de-Noblat, réduite aux comptes).
 *     Europeana et xeno-canto : sans clé pour fabriquer ce projet, leurs réponses sont ÉCRITES ICI au format de leur API
 *     (mêmes champs) — notices fictives, marquées « essai ». Sans clé : rien n'est demandé.
 *  Fiches : Jean MAZAUD (1890–1960, Saint-Léonard-de-Noblat), Marie LACOMBE (1925–2001), Paul DURAND (sans dates).
 *   node tests/test-lot9-sons-enfance.js */
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
const H = require('../assets/js/heritage-lot9-sons-enfance.js');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const raw = n => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root, 'assets/data', `l9a-${n}.json.gz`))).toString('utf8'));
const life = (person, places = [], events = [], jobs = []) => ({ok: true, person: {id: 1, gender: 'male', ...person}, places, events, jobs});

(async () => {
    /* ═════════ 1. les fichiers et le calcul ═════════ */
    const NAMES = ['sons', 'chansons', 'livres', 'jouets', 'marques', 'recettes', 'nature'];
    await t('fichiers livrés : présents, petits (< 15 Mo en tout), chacun avec source, adresse et licence', async () => {
        let tot = 0;
        for (const n of NAMES) { const f = path.join(root, 'assets/data', `l9a-${n}.json.gz`); const st = fs.statSync(f); tot += st.size; const d = raw(n); assert.ok(d.source && /^https:\/\//.test(d.url) && d.licence && d.built, n); }
        assert.ok(tot < 1.5e6, `${tot} octets`); console.log(`  (en tout ${Math.round(tot / 1024)} Ko)`);
    });
    await t('🔊 sons : seulement domaine public / CC0 / CC BY ; ses 20 ans en 1910 → un disque de 1910', async () => {
        const S = H.table(raw('sons'));
        assert.ok(S.length > 100 && S.every(r => /^(Domaine public|CC0|CC BY [\d.]+)$/.test(r.lic) && r.file && r.id && r.y >= 1890 && r.y <= 1962));
        const s = H.soundsFor(S, 1910); assert.strictEqual(s.year, 1910); assert.ok(s.list.length >= 1);
        assert.deepStrictEqual(H.soundsFor(S, 1700), {year: null, list: []});
    });
    await t('🎼 chansons : chaque année a sa source (phrase de Wikipédia ou Wikidata), partitions IMSLP « Public Domain », auteurs morts ≤ 1940', async () => {
        const C = raw('chansons').rows;
        assert.ok(C.length >= 10);
        assert.ok(C.every(r => /^https:\/\/fr\.wikipedia\.org\/wiki\//.test(r.wp) && (r.yk === 'wikidata' || r.sentence.includes(String(r.y)))));
        assert.ok(C.every(r => (r.authors || []).every(a => a[1] !== null && a[1] <= 1940)));
        assert.ok(C.filter(r => r.score).every(r => /^https:\/\/imslp\.org\/wiki\//.test(r.score.url) && /Public Domain/.test(r.score.lic)));
        const s = H.songsFor(C, 1890); assert.ok(s.child.some(r => r.y >= 1885 && r.y <= 1904), JSON.stringify(s.child.map(r => r.t)));
        assert.ok(s.older.length && s.older.every(r => r.y < 1885));
    });
    await t('📚 livres d’école : Le Tour de la France par deux enfants (1877) pour un enfant né en 1890 ; rien avant 1850', async () => {
        const B = raw('livres');
        const l = H.schoolBooksFor(B.rows, 1890); assert.ok(l.some(b => b.id === 'tour' && b.y === 1877 && b.ws && /Wikisource|wikisource/.test(b.ws)));
        assert.ok(B.rows.every(b => b.ws || b.ia.length)); assert.deepStrictEqual(H.schoolBooksFor(B.rows, 1700), []);
        assert.ok(Array.isArray(B.certif.searched) && B.certif.searched.length >= 2, 'la recherche des sujets du certificat est notée');
    });
    await t('🧸 jouets : la décennie de ses 6 ans, chaque image avec auteur, licence libre et page Commons', async () => {
        const J = raw('jouets');
        const all = Object.values(J.decades).flat();
        assert.ok(all.length > 20 && all.every(g => g.lic && /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/.test(g.page) && /^https:\/\/(upload|thumb)\.wikimedia\.org\//.test(g.thumb)));
        const d = Object.keys(J.decades)[0]; const r = H.toysFor(J.decades, Number(d) - 6); assert.strictEqual(String(r.decade), d); assert.ok(r.list.length);
    });
    await t('🍬 marques nées de son vivant / 🚗 voitures de ses 30 ans ; rien en double avec « 💡 Les nouveautés »', async () => {
        const M = raw('marques').rows;
        assert.ok(M.length >= 30 && M.every(r => /^Q\d+$/.test(r.q) && r.y >= 1700 && /^https:\/\/fr\.wikipedia\.org\//.test(r.wp)));
        const L = life({birth: 1900, death: 1990});
        const b = H.brandsFor(M, L); assert.ok(b.length && b.every(x => x.r.y > 1900 && x.r.y <= 1990 && x.age === x.r.y - 1900 && !['voiture', 'deux-roues'].includes(x.r.k)));
        const ban = M.find(r => /Banania/.test(r.n)); if (ban) assert.ok(b.some(x => x.r === ban && x.age === ban.y - 1900));
        const c = H.carsAt30(M, life({birth: 1904, death: 1980})); assert.ok(c.every(x => x.age >= 28 && x.age <= 32 && ['voiture', 'deux-roues'].includes(x.r.k)));
        assert.deepStrictEqual(H.carsAt30(M, life({birth: 1904, death: 1925})), [], 'mort avant 28 ans : rien');
        const nv = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root, 'assets/data/et-nouveautes.json.gz'))).toString()).rows.map(r => H.fold(r.n).replace(/^(le |la |l’|l')/, ''));
        assert.ok(!M.some(r => nv.includes(H.fold(r.n))), 'pas de doublon');
        assert.ok(M.filter(r => r.img).every(r => r.img.lic && /^https:\/\/commons\.wikimedia\.org\//.test(r.img.page)));
    });
    await t('🍰 livre de cuisine : né en 1890 → Le Guide culinaire (1903), recettes avec lien vers la page exacte ; né en 1760 → Menon', async () => {
        const R = raw('recettes');
        assert.ok(R.rows.every(r => /^https:\/\/fr\.wikisource\.org\/wiki\/.+#.+/.test(r.url) && r.text.length > 30));
        const c = H.cookbookFor(R.books, R.rows, 1890); assert.strictEqual(c.book.id, 'escoffier'); assert.ok(c.recipes.length > 10);
        assert.strictEqual(H.cookbookFor(R.books, R.rows, 1760).book.id, 'menon');
        assert.ok(R.excluded.some(x => /Saint-Ange/.test(x[0])), 'Mme Saint-Ange écartée (droits)');
        assert.ok(R.books.every(b => b.ad === null || b.ad <= 1955));
    });
    await t('💌 soldat de 14-18 : homme né en 1890 oui ; femme non ; « caporal » noté → oui ; né en 1850 non', async () => {
        assert.strictEqual(H.ww1Soldier(life({birth: 1890})), true);
        assert.strictEqual(H.ww1Soldier(life({birth: 1890, gender: 'female'})), false);
        assert.strictEqual(H.ww1Soldier(life({birth: 1850, gender: 'female'}, [], [], [{text: 'caporal au 63e RI'}])), true);
        assert.strictEqual(H.ww1Soldier(life({birth: 1850})), false);
    });
    await t('🐦🌼 nature : clés GBIF, images libres de Commons ; les espèces vues d’abord', async () => {
        const N = raw('nature');
        assert.ok(N.birds.length >= 40 && N.flowers.length >= 40 && [...N.birds, ...N.flowers].every(s => Number.isInteger(s.key) && s.fr && s.sci));
        const near = H.speciesNear(N.birds, {[N.birds[2].key]: 5, [N.birds[0].key]: 9}); assert.deepStrictEqual(near.map(x => x.s.key), [N.birds[0].key, N.birds[2].key]);
    });

    /* ═════════ 2. serveur et écran ═════════ */
    const N = raw('nature');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-l9a-')), net0 = path.join(tmp, 'net');
    fs.mkdirSync(path.join(tmp, 'media')); fs.mkdirSync(net0);
    const calls = () => { try { return fs.readFileSync(path.join(net0, 'calls.log'), 'utf8').trim().split('\n').filter(Boolean); } catch (_) { return []; } };
    // GBIF : la vraie réponse (comptes par espèce, Saint-Léonard-de-Noblat ±10 km, CC0 + CC BY 4.0), enregistrée le 2026-11-25
    const GB = {"birds":{"count":9550,"facets":[{"field":"SPECIES_KEY","counts":[{"name":"2490719","count":612},{"name":"2492956","count":437},{"name":"2494422","count":394},{"name":"2492462","count":385},{"name":"2495455","count":375},{"name":"9705453","count":351},{"name":"9409796","count":349},{"name":"2487879","count":327},{"name":"5231190","count":308},{"name":"5231438","count":269},{"name":"9809229","count":254},{"name":"2493091","count":249},{"name":"9515886","count":235},{"name":"5229490","count":217},{"name":"2477968","count":214},{"name":"2478523","count":208},{"name":"5229493","count":206},{"name":"2480537","count":196},{"name":"7901064","count":188},{"name":"2494686","count":177},{"name":"2488949","count":176},{"name":"2484916","count":172},{"name":"7745240","count":169},{"name":"2495000","count":168},{"name":"5739315","count":166},{"name":"9797180","count":162},{"name":"5845582","count":160},{"name":"2489214","count":158},{"name":"9687165","count":154},{"name":"2497266","count":144},{"name":"2475532","count":133},{"name":"7626513","count":115},{"name":"2497921","count":114},{"name":"4408759","count":109},{"name":"2491534","count":107},{"name":"9616058","count":107},{"name":"2495708","count":102},{"name":"2498415","count":99},{"name":"5228676","count":99},{"name":"9761484","count":97},{"name":"7660710","count":96},{"name":"2494200","count":87},{"name":"5231918","count":84},{"name":"9752149","count":84},{"name":"9282206","count":83},{"name":"8104397","count":76},{"name":"6100954","count":71},{"name":"5228199","count":55},{"name":"2482513","count":54},{"name":"8077224","count":45},{"name":"2474051","count":37},{"name":"2474156","count":29},{"name":"2481912","count":26},{"name":"2480242","count":25},{"name":"2475443","count":14},{"name":"8109681","count":13},{"name":"2473958","count":6},{"name":"6065824","count":3}]}]},"flowers":{"count":5458,"facets":[{"field":"SPECIES_KEY","counts":[{"name":"5334277","count":549},{"name":"5354656","count":360},{"name":"9220780","count":311},{"name":"2882482","count":266},{"name":"2888728","count":255},{"name":"7972010","count":209},{"name":"3023221","count":205},{"name":"5384795","count":198},{"name":"3120060","count":185},{"name":"3033363","count":174},{"name":"3188736","count":172},{"name":"5414995","count":168},{"name":"3033263","count":167},{"name":"5384738","count":164},{"name":"8324121","count":159},{"name":"2926557","count":154},{"name":"2890668","count":142},{"name":"5298231","count":140},{"name":"8848598","count":140},{"name":"7874883","count":138},{"name":"5357013","count":126},{"name":"9094061","count":122},{"name":"5371685","count":119},{"name":"5304283","count":106},{"name":"3117424","count":105},{"name":"3034742","count":80},{"name":"3189486","count":65},{"name":"7459480","count":50},{"name":"5384805","count":49},{"name":"3002461","count":48},{"name":"2849427","count":47},{"name":"2951984","count":43},{"name":"2928390","count":39},{"name":"5331181","count":37},{"name":"5341170","count":26},{"name":"3171949","count":21},{"name":"2888443","count":20},{"name":"8377689","count":19},{"name":"5394163","count":15},{"name":"3089561","count":11},{"name":"2882437","count":7},{"name":"3152374","count":6},{"name":"2925892","count":5},{"name":"3149879","count":5},{"name":"2926612","count":4},{"name":"2927305","count":4},{"name":"5405976","count":4},{"name":"7558421","count":4},{"name":"2858244","count":3},{"name":"2926683","count":3},{"name":"5414335","count":3},{"name":"2855356","count":2},{"name":"5392252","count":2},{"name":"3085368","count":1},{"name":"6409622","count":1}]}]}};
    fs.writeFileSync(path.join(net0, 'gbif-birds.json'), JSON.stringify(GB.birds)); fs.writeFileSync(path.join(net0, 'gbif-flowers.json'), JSON.stringify(GB.flowers));
    // Europeana et xeno-canto : au format de leur API, notices d'essai
    const EU = (kind, n, rights = 'http://creativecommons.org/licenses/by-sa/4.0/') => ({apikey: 'essai', success: true, itemsCount: n, totalResults: n + 3, items: Array.from({length: n}, (_, i) => ({
        id: `/2020601/essai_${kind}_${i}`, title: [`Essai ${kind} ${i} — Saint-Léonard`], year: [kind === 'ww1' ? '1916' : '1905'], edmPreview: [`https://api.europeana.eu/thumbnail/v2/url.json?uri=essai${i}&type=IMAGE`],
        dataProvider: [i === 1 ? 'Wikimedia Commons' : 'Europeana 1914-1918'], rights: [i === 2 ? 'http://rightsstatements.org/vocab/InC/1.0/' : rights], type: kind === 'sounds' ? 'SOUND' : 'IMAGE',
        edmIsShownBy: kind === 'sounds' ? [`https://example.org/essai${i}.mp3`] : [`https://example.org/essai${i}.jpg`]}))});
    fs.writeFileSync(path.join(net0, 'eu-ww1.json'), JSON.stringify(EU('ww1', 4)));
    fs.writeFileSync(path.join(net0, 'eu-photos.json'), JSON.stringify(EU('photos', 5, 'http://creativecommons.org/publicdomain/mark/1.0/')));
    fs.writeFileSync(path.join(net0, 'eu-sounds.json'), JSON.stringify(EU('sounds', 2, 'http://creativecommons.org/publicdomain/mark/1.0/')));
    fs.writeFileSync(path.join(net0, 'eu-record.json'), JSON.stringify({success: true, object: {title: ['Essai photos 0 — Saint-Léonard'], year: ['1905'], europeanaAggregation: {edmPreview: 'https://api.europeana.eu/thumbnail/v2/url.json?uri=essai0&type=IMAGE'},
        aggregations: [{edmRights: {def: ['http://creativecommons.org/publicdomain/mark/1.0/']}, edmDataProvider: {def: ['Archives d’essai']}, edmIsShownBy: 'https://example.org/essai0.jpg'}], proxies: [{dcCreator: {def: ['Photographe inconnu']}}]}}));
    fs.writeFileSync(path.join(net0, 'eu-image.jpg'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
    fs.writeFileSync(path.join(net0, 'xc-0.json'), JSON.stringify({numRecordings: '1', recordings: [{id: '123456', en: 'European Robin', rec: 'Enregistreur d’essai', cnt: 'France', loc: 'Limousin', type: 'song', file: 'https://xeno-canto.org/123456/download', lic: '//creativecommons.org/licenses/by-nc-sa/4.0/', length: '0:42', date: '2020-04-01'}]}));
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4', GENEALOGY_TEST: '1', LCNDA_TEST_L9A_DIR: net0};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start) VALUES(1,'Jean','MAZAUD','male','deceased',1),(2,'Marie','LACOMBE','female','deceased',0),(3,'Paul','DURAND','male','deceased',0)");
$pdo->exec("INSERT INTO places(id,name,county,country,latitude,longitude,admin4_code) VALUES(1,'Saint-Léonard-de-Noblat','Haute-Vienne','France',45.8353,1.4892,'87161'),(2,'Limoges','Haute-Vienne','France',45.8336,1.2611,'87085')");
$t = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn();
$ins = $pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,date_text,year,sort_date,place_id) VALUES('person',?,?,?,?,?,?)");
$ins->execute([1,$t('BIRT'),'3 mai 1890',1890,'1890-05-03',1]); $ins->execute([1,$t('DEAT'),'1960',1960,'1960',1]);
$ins->execute([2,$t('BIRT'),'1925',1925,'1925',2]); $ins->execute([2,$t('DEAT'),'2001',2001,'2001',2]);
echo json_encode(['ok' => 1]);`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0 || !/"ok"/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const errs = [];
    const PLACE = {name: 'Saint-Léonard-de-Noblat', lat: 45.8353, lon: 1.4892};
    try {
        const ctx = await browser.newContext({viewport: {width: 1440, height: 900}});
        await ctx.route(/^https:\/\//, r => r.abort()); // pas d'Internet dans l'essai (images, sons)
        const p = await ctx.newPage();
        p.on('pageerror', e => errs.push(e.message));
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_APP?.defaultPersonBlocks, null, {timeout: 30000});
        // index.php ne charge pas encore heritage-lot9-sons-enfance.js : on l'ajoute (comme le feront les balises)
        if (!(await p.evaluate(() => !!window.LCNDA_EXT?.sonsEnfance))) { await p.addStyleTag({url: base + 'assets/css/lot9-sons-enfance.css'}); await p.addScriptTag({url: base + 'assets/js/heritage-lot9-sons-enfance.js'}); }
        await p.waitForFunction(() => !!window.LCNDA_EXT?.sonsEnfance);
        const api = (x, q = {}) => p.evaluate(([y, z]) => window.LCNDA_APP.api(y, z).catch(e => ({error: e.message})), [x, q]);
        const post = (a, b) => p.evaluate(async ([x, y]) => { try { const r = await window.LCNDA_APP.api(x, {}, {method: 'POST', body: y}); return r.result || r; } catch (e) { return {error: e.message}; } }, [a, b]);

        await t('serveur : sans clé Europeana, rien n’est demandé ; avec la clé, seulement les notices sous licence ouverte', async () => {
            const n0 = calls().length;
            const r0 = await api('l9a_eu', {kind: 'ww1', name: 'Saint-Léonard-de-Noblat'});
            assert.strictEqual(r0.ok, false); assert.strictEqual(r0.nokey, true); assert.strictEqual(calls().length, n0);
            const r = await api('l9a_eu', {kind: 'ww1', name: 'Saint-Léonard-de-Noblat', key: 'essaikey', from: 1914, to: 1919});
            assert.strictEqual(r.ok, true, JSON.stringify(r)); assert.strictEqual(r.items.length, 3, 'la notice « InC » est écartée');
            assert.ok(r.items.every(x => x.free && /^https:\/\/www\.europeana\.eu\/item\//.test(x.page)));
            const c = calls().at(-1); assert.match(c, /theme=ww1/); assert.match(c, /reusability=open/); assert.match(c, /wskey=\*\*\*/); assert.doesNotMatch(c, /essaikey/);
            const again = await api('l9a_eu', {kind: 'ww1', name: 'Saint-Léonard-de-Noblat', key: 'essaikey', from: 1914, to: 1919});
            assert.strictEqual(again.cached, true); assert.strictEqual(calls().at(-1), c);
        });
        await t('serveur : GBIF (vraie réponse) → comptes par espèce de la liste ; xeno-canto → un chant avec sa licence', async () => {
            const g = await api('l9a_gbif', {kind: 'birds', ...PLACE, keys: N.birds.map(s => s.key).join(',')});
            assert.strictEqual(g.ok, true, JSON.stringify(g)); assert.ok(Object.keys(g.counts).length >= 5); assert.match(g.url, /^https:\/\/www\.gbif\.org\/occurrence\/search\?/);
            assert.match(calls().at(-1), /license=CC0_1_0&license=CC_BY_4_0/);
            const x0 = await api('l9a_xc', {sci: 'Erithacus rubecula'}); assert.strictEqual(x0.nokey, true);
            const x = await api('l9a_xc', {sci: 'Erithacus rubecula', key: 'essaixc'});
            assert.strictEqual(x.ok, true, JSON.stringify(x)); assert.strictEqual(x.recs[0].licname, 'CC BY-NC-SA 4.0'); assert.match(x.recs[0].lic, /^https:\/\/creativecommons\.org\//);
        });
        await t('serveur : hors ligne sans réponse gardée → un message, pas d’erreur', async () => {
            const r = await api('l9a_eu', {kind: 'photos', name: 'Limoges', key: 'essaikey'});
            fs.renameSync(path.join(net0, 'eu-photos.json'), path.join(net0, 'eu-photos.off'));
            const r2 = await api('l9a_eu', {kind: 'photos', name: 'Tulle', key: 'essaikey'});
            fs.renameSync(path.join(net0, 'eu-photos.off'), path.join(net0, 'eu-photos.json'));
            assert.strictEqual(r.ok, true); assert.strictEqual(r2.ok, false); assert.strictEqual(r2.offline, true); assert.match(r2.message, /connexion/);
        });

        await t('fiche de Jean MAZAUD (1890) : 🔊 disque de 1910 (lecteur + ↗ Internet Archive), 🎼, 📚 Le Tour de la France, 🧸, 🍬, 🚗, 🍰', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.currentPersonId = 1; A.setModule('personnes'); });
            await p.waitForSelector('[data-l9a-person="1"] .l9a-row', {timeout: 30000});
            const txt = await p.textContent('[data-l9a-person="1"]');
            assert.match(txt, /au phonographe l’année de ses 20 ans \(1910\)/);
            assert.match(txt, /Les chansons de son enfance/); assert.match(txt, /Le Tour de la France par deux enfants/);
            assert.match(txt, /Les jouets de son enfance : ceux des années 1890/); assert.match(txt, /Il avait .+ quand .+ est née \(\d{4}\)/);
            assert.match(txt, /Le livre de cuisine de son époque : Le Guide culinaire/); assert.match(txt, /▸ plus/);
            assert.ok(!/14-18/.test(txt), 'sans clé Europeana : pas de ligne 14-18');
            const au = await p.$$eval('[data-l9a-person="1"] audio', l => l.map(a => a.getAttribute('src'))); assert.ok(au.length && au.every(s => /^https:\/\/archive\.org\/download\//.test(s)));
            const a = await p.$$eval('[data-l9a-person="1"] a', l => l.map(x => [x.href, x.target, x.rel]));
            assert.ok(a.length && a.every(([h, tg, rel]) => /^https:\/\//.test(h) && tg === '_blank' && /noopener/.test(rel)));
            assert.strictEqual(await p.evaluate(() => document.querySelector('[data-l9a-person="1"]').closest('section.card').hidden), false);
        });
        await t('🍰 « ＋ Ajouter au livre de recettes » : une recette dans la Mémoire familiale (avec sa source), ↶ la retire', async () => {
            const before = (await api('tresor_memories', {kind: 'recipe'})).items?.length || 0;
            await p.evaluate(() => document.querySelector('[data-l9a-person="1"] .l9a-recipes')?.closest('details')?.setAttribute('open', ''));
            await p.click('[data-l9a-person="1"] [data-l9a-recipe]');
            await p.waitForSelector('[data-l9a-person="1"] [data-l9a-recipe]:disabled', {timeout: 10000});
            const items = (await api('tresor_memories', {kind: 'recipe'})).items || [];
            assert.strictEqual(items.length, before + 1);
            assert.match(JSON.stringify(items.at(-1)), /Wikisource/);
            await sleep(300); await p.locator('button:has-text("↶ Annuler")').last().click({timeout: 5000}); await sleep(600);
            assert.strictEqual(((await api('tresor_memories', {kind: 'recipe'})).items || []).length, before);
        });
        await t('Marie LACOMBE (1925) : 🚗 une voiture de ses 30 ans ; Paul DURAND (sans dates) : bloc caché', async () => {
            const txt = await p.evaluate(async () => { const h = document.createElement('div'); document.body.appendChild(h); await window.LCNDA_EXT.sonsEnfance.personInto(h, 2); const x = h.textContent; h.remove(); return x; });
            const M = raw('marques').rows, cars = H.carsAt30(M, life({birth: 1925, death: 2001}));
            if (cars.length) assert.match(txt, /ses 30 ans/); assert.ok(!/14-18/.test(txt), 'une femme : pas de ligne de soldat');
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.currentPersonId = 3; A.setModule('personnes'); });
            await p.waitForSelector('[data-l9a-person="3"]', {state: 'attached', timeout: 20000}); await sleep(2500);
            assert.strictEqual(await p.evaluate(() => document.querySelector('[data-l9a-person="3"]').closest('section.card').hidden), true);
        });
        await t('lieu sans clé : 🐦 oiseaux et 🌼 fleurs (GBIF), une offre de clé discrète ; un lieu sans position ni clé : rien', async () => {
            const html = await p.evaluate(async x => { const h = document.createElement('div'); document.body.appendChild(h); await window.LCNDA_EXT.sonsEnfance.placeInto(h, x); const r = h.innerHTML; h.remove(); return r; }, PLACE);
            assert.match(html, /Les oiseaux de son village/); assert.match(html, /Les fleurs sauvages de son pays/); assert.match(html, /GBIF\.org/); assert.match(html, /clé gratuite/);
            assert.ok(!/data-l9a-xc=/.test(html), 'sans clé xeno-canto : pas de bouton chant');
            const none = await p.evaluate(async () => { const h = document.createElement('div'); document.body.appendChild(h); const n = await window.LCNDA_EXT.sonsEnfance.placeInto(h, {name: 'Lieu sans position', lat: null, lon: null}, {detached: true}); const r = [n, h.innerHTML]; h.remove(); return r; });
            assert.deepStrictEqual(none, [0, '']);
        });

        await t('Réglages → 🔊 Sons et enfance : les clés (↶), un sujet s’éteint (↶), À propos des données, sujets du certificat', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'lot9_sons_enfance'; A.setModule('maintenance'); });
            await p.waitForSelector('[data-l9a-settings-page] table tbody tr', {timeout: 20000});
            const txt = await p.textContent('[data-l9a-settings-page]');
            assert.match(txt, /Internet Archive/); assert.match(txt, /IMSLP/); assert.match(txt, /certificat d’études/); assert.match(txt, /Saint-Ange/);
            await p.fill('[data-l9a-key="eu"]', 'essaikey'); await p.fill('[data-l9a-key="xc"]', 'essaixc'); await p.click('[data-l9a-keys-save]');
            assert.deepStrictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-lot9-cles'))), {eu: 'essaikey', xc: 'essaixc'});
            await p.click('[data-l9a-tg="jouets"] input');
            assert.strictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-lot9-sons-enfance')).jouets), false);
            await sleep(300); await p.locator('button:has-text("↶ Annuler")').last().click({timeout: 5000}); await sleep(300);
            assert.notStrictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-lot9-sons-enfance')).jouets), false);
        });
        await t('avec les clés : 💌 14-18 sur la fiche de Jean MAZAUD ; 📷 photos (sans doublon Commons) ; ＋ Garder dans les médias puis ↶', async () => {
            const txt = await p.evaluate(async () => { const h = document.createElement('div'); document.body.appendChild(h); await window.LCNDA_EXT.sonsEnfance.personInto(h, 1); const x = h.textContent; h.remove(); return x; });
            assert.match(txt, /lettres, photos ou souvenirs de 14-18 de Saint-Léonard-de-Noblat sur Europeana 1914-1918/);
            await p.evaluate(async x => { const h = document.createElement('div'); h.id = 'l9a-essai'; document.body.appendChild(h); await window.LCNDA_EXT.sonsEnfance.placeInto(h, x); }, PLACE);
            const html = await p.innerHTML('#l9a-essai');
            assert.match(html, /Photos? et cartes anciennes|photos et cartes anciennes/); assert.ok(!/Wikimedia Commons, /.test(html.match(/l9a-fig[\s\S]*?<\/figure>/)?.[0] || ''), 'pas d’image venue de Commons');
            assert.match(html, /data-l9a-xc="/, 'avec la clé : 🔊 Écouter son chant');
            const m0 = (await api('media_list').catch(() => null));
            await p.click('#l9a-essai [data-l9a-keep]');
            await p.waitForSelector('#l9a-essai [data-l9a-keep]:disabled', {timeout: 10000});
            await p.waitForFunction(() => /✓ Dans les médias/.test(document.querySelector('#l9a-essai').textContent), null, {timeout: 10000});
            const n1 = fs.readdirSync(path.join(tmp, 'media')).length; assert.strictEqual(n1, 1);
            await sleep(300); await p.locator('button:has-text("↶ Annuler")').last().click({timeout: 5000}); await sleep(800);
            assert.strictEqual(fs.readdirSync(path.join(tmp, 'media')).length, 0);
            void m0;
        });
        await t('registres : listes (colonne Source), monographie, dataSources, Où chercher', async () => {
            const r = await p.evaluate(async x => {
                const E = window.LCNDA_EXT, L = E.dataLists.filter(d => d.id.startsWith('l9a_'));
                const out = {ids: L.map(d => d.id), src: true, rows: {}};
                for (const d of L) { const rows = await d.load(); out.rows[d.id] = rows.length; if (!d.fields.some(f => f.key === 'src' && f.type === 'url') || !d.source) out.src = false; if (rows[0] && !/^https:\/\//.test(rows[0].src)) out.src = false; }
                const mono = E.monographSections.find(s => s.id === 'l9a_oiseaux'), mh = document.createElement('div'); document.body.appendChild(mh);
                out.mono = [await mono.render({id: 1, name: x.name, latitude: x.lat, longitude: x.lon}, mh, {}), mh.textContent]; mh.remove();
                const host = document.createElement('div'); document.body.appendChild(host);
                await E.dataSources.find(d => d.id === 'l9a_sons_annee').run({year: 1912}, host); out.ds = host.textContent; host.remove();
                out.secs = E.monographSections.filter(s => s.id.startsWith('l9a_')).map(s => s.id); out.srcs = E.dataSources.filter(s => s.id.startsWith('l9a_')).length;
                out.ouc = (window.LCNDA_OUC_MONDE?.SITES || []).filter(s => s.key.startsWith('l9a_')).map(s => [s.key, s.url({last: 'MAZAUD'})]);
                return out;
            }, PLACE);
            ['l9a_sons', 'l9a_chansons', 'l9a_livres', 'l9a_jouets', 'l9a_marques', 'l9a_recettes', 'l9a_oiseaux', 'l9a_fleurs'].forEach(id => assert.ok(r.ids.includes(id) && r.rows[id] > 0, id));
            assert.ok(r.src, 'colonne Source partout'); assert.strictEqual(r.mono[0], true); assert.match(r.mono[1], /oiseaux/);
            assert.match(r.ds, /Au phonographe en 1912/); assert.deepStrictEqual(r.secs, ['l9a_ww1', 'l9a_photos', 'l9a_oiseaux', 'l9a_fleurs']); assert.ok(r.srcs >= 12);
            if (r.ouc.length) assert.ok(r.ouc.every(([, u]) => /^https:\/\//.test(u)));
        });
        await t('aucune erreur JavaScript', async () => { assert.deepStrictEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill();
        try { fs.rmSync(tmp, {recursive: true, force: true}); } catch (_) {}
    }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})();
