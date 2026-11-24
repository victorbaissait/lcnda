#!/usr/bin/env node
/* 🪦🖼️⛪📰 Autour du village (lib/commune_plus.php, assets/js/heritage-commune-plus.js, assets/css/commune-plus.css).
 * Le réseau est remplacé par des réponses VRAIES enregistrées une fois (tests/fixtures/commune-plus/, GENEALOGY_TEST=1 +
 * LCNDA_TEST_CPLUS_DIR) : Overpass (© OpenStreetMap contributors, ODbL), Wikidata (CC0), Wikimedia Commons (métadonnées),
 * loc.gov (Chronicling America) — pour Saint-Léonard-de-Noblat (87161) et le nom « Mazaud ». Un fichier absent = hors ligne.
 *  1. serveur : cimetières (distance, religion, itinéraire), église + saint patron + fête, images ≤ 1960 (auteur, licence),
 *     journaux (nombre de pages) ; gardé sur l'ordinateur (pas de 2e appel) ; hors ligne : la réponse gardée, sinon un message ;
 *     « ＋ Garder dans les médias » : média + source avec licence, ↶ retire tout ;
 *  2. écran : fiche d'un village (église, cimetières + 🪦 sur la carte, bande d'images, ＋ Garder et ↶) ; fiches de personnes
 *     (🪦 près du lieu d'inhumation ; 📰 pour MAZAUD mort aux États-Unis, pas pour DURAND) ; LCNDA_EXT.communePlus.church/newspapers ;
 *     Réglages → 🪦 Autour du village : éteindre un bloc.
 * image.jpg : « Tirailleurs sénégalais blessés, hôpital temporaire de Saint-Léonard, 1914-1918 », carte postale ancienne,
 * Wikimedia Commons, CC BY-SA 4.0 (vignette 500 px).
 *   node tests/test-commune-plus.js */
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const {spawn, spawnSync} = require('child_process');
let chromium; try { ({chromium} = require('playwright')); } catch (_) { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); }
const root = path.join(__dirname, '..');
const {findPhp, phpRuntimeArgs, devBundledPhp} = require('../electron/php-server.js');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const FX = path.join(__dirname, 'fixtures/commune-plus');
const fx = n => JSON.parse(fs.readFileSync(path.join(FX, n), 'utf8'));

(async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-cplus-')), net0 = path.join(tmp, 'net');
    fs.mkdirSync(path.join(tmp, 'media'), {recursive: true}); fs.cpSync(FX, net0, {recursive: true}); fs.rmSync(path.join(net0, 'eglise'), {recursive: true, force: true});
    const calls = () => { try { return fs.readFileSync(path.join(net0, 'calls.log'), 'utf8').trim().split('\n').filter(Boolean); } catch (_) { return []; } };
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4', GENEALOGY_TEST: '1', LCNDA_TEST_CPLUS_DIR: net0};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start) VALUES(1,'Jean','MAZAUD','male','deceased',1),(2,'Marie','LACOMBE','female','deceased',0),(3,'Paul','DURAND','male','deceased',0)");
$pdo->exec("INSERT INTO places(id,name,county,country,latitude,longitude,admin4_code) VALUES(1,'Saint-Léonard-de-Noblat','Haute-Vienne','France',45.8353,1.4892,'87161'),(2,'Milwaukee','Wisconsin','États-Unis',43.0389,-87.9065,''),(3,'Limoges','Haute-Vienne','France',45.8336,1.2611,'')");
$t = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn();
$ins = $pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,date_text,year,sort_date,place_id) VALUES('person',?,?,?,?,?,?)");
$ins->execute([1,$t('BIRT'),'3 mai 1862',1862,'1862-05-03',1]); $ins->execute([1,$t('DEAT'),'2 juin 1911',1911,'1911-06-02',2]);
$ins->execute([2,$t('BIRT'),'1870',1870,'1870',3]); $ins->execute([2,$t('DEAT'),'1931',1931,'1931',1]); $ins->execute([2,$t('BURI'),'1931',1931,'1931',1]);
$ins->execute([3,$t('BIRT'),'1880',1880,'1880',3]); $ins->execute([3,$t('DEAT'),'1950',1950,'1950',3]);
echo json_encode(['ok' => 1]);`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0 || !/"ok"/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const errs = [];
    const PLACE = {name: 'Saint-Léonard-de-Noblat', lat: 45.8353, lon: 1.4892, insee: '87161'};
    try {
        const p = await (await browser.newContext({viewport: {width: 1440, height: 900}})).newPage();
        p.on('pageerror', e => errs.push(e.message));
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_APP?.defaultPersonBlocks, null, {timeout: 30000});
        // index.php ne charge pas encore heritage-commune-plus.js : on l'ajoute (comme le fera la balise <script>)
        if (!(await p.evaluate(() => !!window.LCNDA_EXT?.communePlus))) { await p.addStyleTag({url: base + 'assets/css/commune-plus.css'}); await p.addScriptTag({url: base + 'assets/js/heritage-commune-plus.js'}); }
        await p.waitForFunction(() => window.LCNDA_EXT?.communePlus, null, {timeout: 10000});
        const api = (x, q = {}) => p.evaluate(([y, z]) => window.LCNDA_APP.api(y, z).catch(e => ({error: e.message})), [x, q]);
        const post = (a, b) => p.evaluate(async ([x, y]) => { try { const r = await window.LCNDA_APP.api(x, {}, {method: 'POST', body: y}); return r.result || r; } catch (e) { return {error: e.message}; } }, [a, b]);
        const toastWith = re => p.waitForFunction(s => new RegExp(s).test([...document.querySelectorAll('.ui-toast, .toast')].map(x => x.textContent).join(' ')), re.source, {timeout: 20000});

        /* ═════════ 1. le serveur ═════════ */
        // OpenStreetMap (Overpass) : sa réponse n'a pas pu être enregistrée si overpass.json manque → seulement le cas « hors ligne »
        const HAS_OSM = fs.existsSync(path.join(FX, 'overpass.json')), HAS_SAINT = fs.existsSync(path.join(FX, 'eglise/wd_saints.json'));
        if (!HAS_OSM) console.log('   (pas de réponse Overpass enregistrée : les cimetières ne sont essayés que hors ligne)');
        await t('🪦 cimetières : ceux d’OpenStreetMap à moins de 5 km, du plus proche au plus loin, avec itinéraire et mention ODbL', async () => {
            const r = await api('cplus_cemeteries', PLACE);
            if (!HAS_OSM) { assert.strictEqual(r.ok, false); assert.strictEqual(r.offline, true); assert.match(r.message, /connexion/); return; }
                assert.strictEqual(r.ok, true, JSON.stringify(r));
            assert.ok(r.items.length >= 1 && r.items.length <= over.elements.length);
            for (let i = 1; i < r.items.length; i++) assert.ok(r.items[i].km >= r.items[i - 1].km);
            assert.ok(r.items.every(x => x.km <= 5.5 && /^https:\/\/www\.openstreetmap\.org\/directions\?route=%3B/.test(x.route) && /^https:\/\/www\.openstreetmap\.org\/(node|way|relation)\/\d+$/.test(x.url)));
            const named = over.elements.filter(e => e.tags?.name).map(e => e.tags.name);
            if (named.length) assert.ok(r.items.some(x => named.includes(x.name)), 'un nom relu dans la réponse');
            assert.strictEqual(r.source.label, '© OpenStreetMap contributors'); assert.strictEqual(r.source.licence, 'ODbL 1.0');
            assert.strictEqual(r.cached, false);
        });
        await t('🖼️ images : seulement ≤ 1960 (ou cartes postales sans date), les plus anciennes d’abord, auteur et licence pour chacune', async () => {
            const r = await api('cplus_images', PLACE);
            assert.strictEqual(r.ok, true, JSON.stringify(r).slice(0, 300)); assert.strictEqual(r.commune.qid, 'Q200202');
            assert.ok(r.items.length >= 1, 'au moins une image ancienne');
            assert.ok(r.items.every(x => (x.year && x.year <= 1960) || (x.postcard && !x.year)));
            assert.ok(r.items.every(x => x.licence && x.author && !/(.{4,})\1/.test(x.author) && /^https:\/\/(upload|thumb)\.wikimedia\.org\//.test(x.thumb) && /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/.test(x.page)));
            const ys = r.items.map(x => x.year || 1960); assert.deepStrictEqual(ys, [...ys].sort((a, b) => a - b));
            const all = ['commons_files_0.json', 'commons_files_1.json'].flatMap(n => fx(n).query.pages); assert.ok(all.length > r.items.length, 'les images récentes sont écartées');
        });
        await t('⛪ église (Saint-Léonard) : relue sur Wikidata ; sans saint patron sur Wikidata, la ligne n’en invente pas', async () => {
            const r = await api('cplus_church', PLACE);
            assert.strictEqual(r.ok, true, JSON.stringify(r)); assert.strictEqual(r.commune.category, 'Saint-Léonard-de-Noblat');
            const c = r.churches[0]; const ent = fx('wd_churches.json').entities[c.qid];
            assert.ok(ent, 'l’église vient de la réponse'); assert.strictEqual(c.label, ent.labels.fr.value);
            const line = await p.evaluate(x => window.LCNDA_EXT.communePlus.churchLine(x), c);
            assert.strictEqual(line, `⛪ ${c.label}`); console.log('   ' + line);
            assert.strictEqual(r.source.licence, 'CC0 1.0');
        });
        await t('⛪ église avec saint patron, fête et date (Wikidata, quartier Saint-Gervais) : « ⛪ … (XVe s.) — saint patron : …, fêté le … »', async () => {
            for (const f of fs.readdirSync(path.join(FX, 'eglise'))) fs.copyFileSync(path.join(FX, 'eglise', f), path.join(net0, f));
            try {
                const r = await api('cplus_church', {qid: 'Q3413113', name: 'Saint-Gervais'});
                assert.strictEqual(r.ok, true, JSON.stringify(r));
                const c = r.churches.find(x => x.qid === 'Q427340'); assert.ok(c, JSON.stringify(r.churches.map(x => x.qid)));
                assert.strictEqual(c.when, 'XVe s.'); // P571 = 1401, précision siècle
                const line = await p.evaluate(x => window.LCNDA_EXT.communePlus.churchLine(x), c); console.log('   ' + line);
                if (HAS_SAINT) { assert.ok(c.saints[0].label); assert.match(line, /^⛪ église Saint-Gervais-Saint-Protais \(XVe s\.\) — saint patron : /); if (c.saints[0].feast.length) assert.match(line, /, fêté le /); }
                else assert.strictEqual(c.saints[0].qid, 'Q1515920');
            } finally { for (const f of fs.readdirSync(path.join(FX, 'eglise'))) { if (fs.existsSync(path.join(FX, f))) fs.copyFileSync(path.join(FX, f), path.join(net0, f)); else fs.rmSync(path.join(net0, f), {force: true}); } }
        });
        await t('📰 journaux : le nombre de pages de Chronicling America où le nom paraît, pendant sa vie (fiche MAZAUD)', async () => {
            const r = await api('cplus_newspapers', {person_id: 1});
            assert.strictEqual(r.ok, true, JSON.stringify(r)); assert.strictEqual(r.total, fx('loc.json').pagination.of);
            assert.deepStrictEqual([r.from, r.to], [1872, 1913]);
            assert.match(r.search_url, /^https:\/\/www\.loc\.gov\/collections\/chronicling-america\/\?q=%22MAZAUD%22&dates=1872%2F1913$/);
            assert.ok(r.items.length && r.items.every(x => /^https:\/\/www\.loc\.gov\/resource\//.test(x.url)));
        });
        await t('gardé sur l’ordinateur : la même question ne repart pas sur Internet', async () => {
            const n = calls().length;
            for (const a of [...(HAS_OSM ? ['cplus_cemeteries'] : []), 'cplus_church', 'cplus_images']) { const r = await api(a, PLACE); assert.strictEqual(r.cached, true, a); }
            assert.strictEqual((await api('cplus_newspapers', {person_id: 1})).cached, true);
            assert.strictEqual(calls().length, n);
        });
        await t('hors ligne : la réponse gardée revient ; une autre commune → un petit message, pas une erreur', async () => {
            fs.renameSync(net0, net0 + '-off');
            try {
                assert.strictEqual((await api('cplus_images', PLACE)).ok, true);
                const r = await api('cplus_cemeteries', {name: 'Limoges', lat: 45.8336, lon: 1.2611});
                assert.strictEqual(r.ok, false); assert.strictEqual(r.offline, true); assert.match(r.message, /connexion/);
                const n = await api('cplus_newspapers', {last: 'LACOMBE'}); assert.strictEqual(n.offline, true);
            } finally { fs.renameSync(net0 + '-off', net0); }
        });
        await t('📋 Listes (cplus_list) : images, églises, journaux tirés de ce qui est gardé', async () => {
            const im = (await api('cplus_list', {kind: 'images'})).rows; assert.ok(im.length >= 1 && im.every(x => x.commune === 'Saint-Léonard-de-Noblat' && x.licence && x.lat));
            const ch = (await api('cplus_list', {kind: 'churches'})).rows; assert.ok(ch.some(x => x.name.startsWith('collégiale Saint-Léonard')) && ch.some(x => x.when === 'XVe s.'));
            const nw = (await api('cplus_list', {kind: 'newspapers'})).rows; assert.ok(nw.length >= 1 && nw.every(x => x.name === 'MAZAUD' && x.url));
            assert.ok((await api('cplus_list', {kind: 'xx'})).error);
        });
        await t('« ＋ Garder dans les médias » : l’image, et une source avec l’auteur, la licence et le lien ; ↶ retire tout', async () => {
            if (!fs.existsSync(path.join(FX, 'image.jpg'))) { console.log('   (image non enregistrée : essai sauté)'); return; }
            const img = (await api('cplus_images', PLACE)).items[0];
            const k = await post('cplus_keep', {file: img.file, place_name: 'Saint-Léonard-de-Noblat'});
            assert.ok(k.batch && k.media_id, JSON.stringify(k));
            const db = path.join(tmp, 'genealogy.sqlite');
            const q = sql => JSON.parse(spawnSync(phpPath, ['-r', `$p=new PDO('sqlite:${db}');echo json_encode($p->query(${JSON.stringify(sql)})->fetchAll(PDO::FETCH_ASSOC));`], {encoding: 'utf8'}).stdout || '[]');
            const med = q(`SELECT * FROM media WHERE id=${k.media_id}`)[0];
            assert.ok(med && fs.existsSync(path.join(tmp, 'media', med.filename)), 'le fichier est rangé');
            assert.match(med.document_url, /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/); assert.strictEqual(med.document_reference, k.licence);
            const src = q(`SELECT * FROM sources WHERE id=${k.source_id}`)[0];
            assert.ok(src.text.includes(k.licence) && src.text.includes('Wikimedia Commons') && src.url === med.document_url);
            assert.strictEqual(q(`SELECT count(*) n FROM media_links WHERE media_id=${k.media_id} AND entity_type='source' AND entity_id=${k.source_id}`)[0].n, 1);
            const u = await post('cplus_keep_undo', {batch: k.batch}); assert.strictEqual(u.ok, true);
            assert.strictEqual(q(`SELECT count(*) n FROM media WHERE id=${k.media_id}`)[0].n, 0); assert.strictEqual(q(`SELECT count(*) n FROM sources WHERE id=${k.source_id}`)[0].n, 0);
            assert.ok(!fs.existsSync(path.join(tmp, 'media', med.filename)));
            assert.ok((await post('cplus_keep', {file: '../etc/passwd'})).error);
        });

        /* ═════════ 2. l'écran ═════════ */
        await t('fiche d’un village : ⛪ dans « Église et paroisse », cimetières, bande « Le village en … » (auteur, licence), une phrase puis « ▸ plus »', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.listType = 'villages'; A.state.hVillage = '87161'; A.setModule('listes'); });
            await p.waitForSelector('.h-village .cplus-place', {timeout: 20000});
            await p.waitForSelector('[data-vsec="church"] [data-cplus-church-in] .cplus-church', {timeout: 20000});
            await p.waitForSelector('[data-cplus-part="images"] .cplus-strip', {timeout: 20000});
            assert.match(await p.textContent('[data-cplus-church-in]'), /⛪ collégiale Saint-Léonard/);
            assert.strictEqual(await p.$('.cplus-place [data-cplus-part="church"]'), null, 'pas de deuxième bloc église');
            const txt = await p.textContent('.cplus-place');
            assert.match(txt, /Le village en \d{4}/); assert.match(txt, /images anciennes libres de droits ; la plus ancienne : 1914/); assert.match(txt, /▸ plus/);
            if (HAS_OSM) { await p.waitForSelector('[data-cplus-part="cemeteries"] .cplus-cem'); assert.match(txt + await p.textContent('.cplus-place'), /© OpenStreetMap contributors/); assert.ok(await p.$$eval('.h-village-map .cplus-pin', n => n.length) >= 1, '🪦 sur la carte'); }
            else { await p.waitForSelector('[data-cplus-part="cemeteries"] .cplus-off'); }
            assert.ok(await p.$$eval('.cplus-img figcaption small', n => n.length && n.every(x => x.textContent.trim().length > 0)));
        });
        await t('« ＋ Garder dans les médias » depuis la bande, puis ↶ Annuler', async () => {
            if (!fs.existsSync(path.join(FX, 'image.jpg'))) return;
            await p.click('[data-cplus-keep="0"]');
            await toastWith(/Image rangée dans les médias/);
            await p.click('.ui-toast button:has-text("Annuler"), .toast button:has-text("Annuler")');
            await toastWith(/Annulé/);
            assert.strictEqual(await p.$eval('[data-cplus-keep="0"]', b => b.disabled), false);
        });
        await t('fiche de LACOMBE (inhumée à Saint-Léonard) : « 🪦 Cimetières près de Saint-Léonard-de-Noblat » (si connu) ; pas de bloc journaux', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.currentPersonId = 2; A.setModule('personnes'); });
            if (HAS_OSM) { await p.waitForSelector('[data-cplus-pcem="2"] .cplus-lead', {timeout: 20000}); assert.match(await p.textContent('[data-pblock="cplus_cemeteries"]'), /Cimetières près de Saint-Léonard-de-Noblat/); }
            else { await p.waitForSelector('[data-cplus-pcem="2"] .cplus-off', {timeout: 20000}); }
            assert.strictEqual(await p.$('[data-cplus-pnews="2"]'), null);
            const order = await p.evaluate(() => window.LCNDA_APP.defaultPersonBlocks.map(b => b[0]));
            assert.ok(order.indexOf('cplus_newspapers') === order.indexOf('cplus_cemeteries') + 1, 'les deux blocs ensemble, dans le contexte');
        });
        await t('fiche de MAZAUD (mort à Milwaukee) : une phrase, Chronicling America avec le nombre de pages, Delpher et ANNO sous « ▸ plus »', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.currentPersonId = 1; A.setModule('personnes'); });
            await p.waitForSelector('[data-cplus-pnews="1"] [data-cplus-hits] p', {timeout: 20000});
            const ids = await p.$$eval('[data-cplus-pnews="1"] [data-cplus-news]', n => n.map(x => x.dataset.cplusNews));
            assert.deepStrictEqual(ids, ['chronicling_america', 'delpher', 'anno']);
            assert.ok(await p.$('[data-cplus-pnews="1"] details [data-cplus-news="delpher"]'));
            const txt = await p.textContent('[data-cplus-pnews="1"]');
            assert.match(txt, /Milwaukee \(États-Unis\) : ses traces/);
            assert.match(txt, new RegExp(`sur ${fx('loc.json').pagination.of} pages entre 1872 et 1913`));
        });
        await t('LCNDA_EXT.communePlus : newspapers(person) → {title, url, why} sans réseau ; church(place) → la ligne', async () => {
            const r = await p.evaluate(() => window.LCNDA_EXT.communePlus.newspapers({person: {first_name: 'Paul', last_name: 'DURAND'}, events: [{gedcom_tag: 'BIRT', year: 1880, country: 'France'}, {gedcom_tag: 'DEAT', year: 1950, place_name: 'Vienne', country: 'Autriche'}]}));
            assert.deepStrictEqual(r.map(x => x.id), ['anno', 'chronicling_america', 'delpher']);
            assert.ok(r.every(x => x.title && /^https:\/\//.test(x.url) && x.why));
            assert.match(r.find(x => x.id === 'delpher').url, /^https:\/\/www\.delpher\.nl\/nl\/kranten\/results\?query=%22DURAND%22&coll=ddd$/);
            const c = await p.evaluate(pl => window.LCNDA_EXT.communePlus.church(pl), PLACE);
            assert.ok(c.ok && /^⛪ /.test(c.line) && /cplus-church/.test(c.html));
        });
        await t('registres communs : dataSources (4), dataLists (4, avec geo et fields), monographSections (3) ; run() d’une source', async () => {
            const r = await p.evaluate(() => { const E = window.LCNDA_EXT; return {ds: (E.dataSources || []).filter(x => x.id.startsWith('commune_plus_')).map(x => x.id), dl: (E.dataLists || []).filter(x => x.id.startsWith('cplus_')).map(x => [x.id, !!x.geo, x.fields.length]), ms: (E.monographSections || []).filter(x => x.id.startsWith('cplus_')).map(x => x.id)}; });
            assert.strictEqual(r.ds.length, 4); assert.strictEqual(r.ms.length, 3); assert.strictEqual(r.dl.length, 4); assert.ok(r.dl.filter(x => x[1]).length === 3 && r.dl.every(x => x[2] >= 5));
            const html = await p.evaluate(async pl => { const h = document.createElement('div'); document.body.appendChild(h); await window.LCNDA_EXT.dataSources.find(x => x.id === 'commune_plus_images').run({place: pl}, h); const t = h.textContent; h.remove(); return t; }, PLACE);
            assert.match(html, /images anciennes libres de droits/);
            const rows = await p.evaluate(() => window.LCNDA_EXT.dataLists.find(x => x.id === 'cplus_churches').load());
            assert.ok(rows.length >= 1 && rows[0].name);
        });
        await t('fiche de DURAND (toute sa vie en France) : pas de bloc journaux', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.currentPersonId = 3; A.setModule('personnes'); });
            await p.waitForSelector('[data-cplus-pcem="3"]', {timeout: 20000});
            assert.match(await p.textContent('[data-pblock="cplus_cemeteries"]'), /près de Limoges/);
            assert.strictEqual(await p.$('[data-pblock="cplus_newspapers"]'), null);
        });
        await t('Réglages → 🪦 Autour du village : éteindre « Images anciennes » les retire de la fiche du village ; À propos des données', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'commune_plus'; A.setModule('maintenance'); });
            await p.waitForSelector('[data-cplus-settings] [data-cplus-tg="images"] input', {timeout: 20000});
            assert.match(await p.textContent('[data-cplus-settings]'), /ODbL 1\.0/);
            await p.uncheck('[data-cplus-tg="images"] input');
            assert.strictEqual(JSON.parse(await p.evaluate(() => localStorage.getItem('genealogie-commune-plus'))).images, false);
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.listType = 'villages'; A.state.hVillage = '87161'; A.setModule('listes'); });
            await p.waitForSelector('.h-village [data-cplus-church-in]', {timeout: 20000});
            assert.strictEqual(await p.$('[data-cplus-part="images"]'), null);
        });
        await t('pas d’erreur JavaScript', async () => { assert.deepStrictEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true});
    }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})();
