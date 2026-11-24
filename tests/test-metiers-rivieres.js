#!/usr/bin/env node
/* ⛏️🏭⚙️🌊🖼️ Métiers et rivières (lib/metiers_rivieres.php, assets/js/heritage-metiers-rivieres.js, assets/css/metiers-rivieres.css).
 * Les données livrées (assets/data/casias/, roe-moulins, metiers-mines, reperes-crues, metiers-sites) sont les VRAIES ; le réseau
 * (Sandre BD TOPAGE, Hub'Eau, POP) est remplacé par des réponses vraies enregistrées une fois autour de Tulle
 * (tests/fixtures/metiers-rivieres/, GENEALOGY_TEST=1 + LCNDA_TEST_MR_DIR ; topage.json allégé : points espacés loin de Tulle ;
 * réponses de POP réduites aux champs lus). Un fichier absent = hors ligne. Pour « Garder dans les médias », la mention de la
 * notice est changée PENDANT l'essai en « Licence Ouverte (fichier d'essai) » (aucune photo de POP trouvée sous licence libre).
 *  1. données : tailles (< 15 Mo en tout), colonnes, chaque métier a ses mots ;
 *  2. serveur : Jean MAZAUD, maître tanneur à Tulle → une tannerie à moins de 5 km (dates inconnues) ; Marie LACOMBE, meunière →
 *     un moulin ; Paul DURAND, batelier → aucun atelier, mais une ligne « batelier » sur la Corrèze ; hautes eaux de 1960 à Tulle ;
 *     la commune : anciens sites, moulins, repères ; POP : photos et musée (pas le « tulle » du tissu), « Garder » refusé sous ©,
 *     accepté sous licence libre, ↶ retire tout ; hors ligne : un message ; réponses gardées (🗑 et ↶) ;
 *  3. écran : bloc « ⛏️ Son métier, près de chez lui » (caché pour Paul) ; 🌊 dans « 🏘 Le lieu à son époque » ; fiche du village ;
 *     Réglages ; LCNDA_EXT.dataSources.
 *   node tests/test-metiers-rivieres.js */
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
const FX = path.join(__dirname, 'fixtures/metiers-rivieres');
const DATA = path.join(root, 'assets/data');
const gz = f => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(DATA, f))).toString('utf8'));

(async () => {
    await t('données : tailles mesurées (< 15 Mo en tout), colonnes, sources et licences, table des métiers', async () => {
        const casias = fs.readdirSync(path.join(DATA, 'casias')).filter(f => /^casias-(\d{2,3}|2[AB])\.json\.gz$/.test(f));
        assert.ok(casias.length >= 90, `${casias.length} départements`);
        const size = [...casias.map(f => `casias/${f}`), 'roe-moulins.json.gz', 'metiers-mines.json.gz', 'reperes-crues.json.gz', 'metiers-sites.json'].reduce((s, f) => s + fs.statSync(path.join(DATA, f)).size, 0);
        assert.ok(size < 15e6, `${size} octets`);
        console.log(`  (taille dans l’app : ${(size / 1e6).toFixed(1)} Mo)`);
        const c19 = gz('casias/casias-19.json.gz');
        assert.deepStrictEqual(c19.cols, ['lat', 'lon', 'insee', 'commune', 'nom', 'activite', 'adresse', 'ssp']); assert.match(c19.licence, /Licence Ouverte/);
        assert.ok(c19.rows.some(r => r[2] === '19272' && /tannerie/i.test(r[4])), 'une tannerie à Tulle');
        const roe = gz('roe-moulins.json.gz'); assert.ok(roe.rows.length > 20000); assert.match(roe.licence, /Licence Ouverte/);
        assert.ok(roe.rows.every(r => /moulin|minoterie|forge|martinet|scierie|papeterie|filature|foulon|usine|taillanderie|tannerie/i.test(r[3])));
        const mines = gz('metiers-mines.json.gz'); assert.ok(mines.rows.length > 300); assert.strictEqual(mines.licence, 'CC0 1.0');
        const rep = gz('reperes-crues.json.gz'); assert.ok(rep.rows.length > 5000, `${rep.rows.length} repères`); assert.match(rep.licence, /Licence Ouverte/);
        assert.ok(rep.rows.every(r => r[5] >= 1000 && r[5] <= 2030 && typeof r[0] === 'number'));
        const tab = JSON.parse(fs.readFileSync(path.join(DATA, 'metiers-sites.json'), 'utf8'));
        const ids = new Set();
        tab.trades.forEach(x => { assert.ok(x.id && !ids.has(x.id) && x.label && x.jobs.length && x.sites.length, x.id); ids.add(x.id); });
        ['tannerie', 'mine', 'forge', 'verrerie', 'textile', 'moulin', 'papeterie', 'tuilerie', 'chaux', 'brasserie', 'distillerie'].forEach(k => assert.ok(ids.has(k), k));
        ['batelier', 'flotteur', 'pecheur', 'passeur', 'lavandiere'].forEach(k => assert.ok(tab.river_jobs.some(x => x.id === k), k));
    });

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-mr-')), net0 = path.join(tmp, 'net');
    fs.mkdirSync(path.join(tmp, 'media'), {recursive: true}); fs.cpSync(FX, net0, {recursive: true});
    const calls = () => { try { return fs.readFileSync(path.join(net0, 'calls.log'), 'utf8').trim().split('\n').filter(Boolean); } catch (_) { return []; } };
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4', GENEALOGY_TEST: '1', LCNDA_TEST_MR_DIR: net0};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start,occupation) VALUES(1,'Jean','MAZAUD','male','deceased',1,'Maître tanneur'),(2,'Marie','LACOMBE','female','deceased',0,'meunière'),(3,'Paul','DURAND','male','deceased',0,'batelier')");
$pdo->exec("INSERT INTO places(id,name,county,country,latitude,longitude,admin4_code) VALUES(1,'Tulle','Corrèze','France',45.2670,1.7680,'19272'),(2,'Argentat','Corrèze','France',45.0928,1.9375,'19010')");
$t = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn();
$ins = $pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,date_text,year,sort_date,place_id) VALUES('person',?,?,?,?,?,?)");
$ins->execute([1,$t('BIRT'),'1850',1850,'1850',1]); $ins->execute([1,$t('DEAT'),'1912',1912,'1912',1]);
$ins->execute([2,$t('BIRT'),'1900',1900,'1900',1]); $ins->execute([2,$t('DEAT'),'1975',1975,'1975',1]);
$ins->execute([3,$t('BIRT'),'1880',1880,'1880',1]); $ins->execute([3,$t('DEAT'),'1950',1950,'1950',2]);
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
        // index.php ne charge pas encore heritage-metiers-rivieres.js : on l'ajoute (comme le feront les balises)
        if (!(await p.evaluate(() => !!window.LCNDA_EXT?.metiersRivieres))) { await p.addStyleTag({url: base + 'assets/css/metiers-rivieres.css'}); await p.addScriptTag({url: base + 'assets/js/heritage-metiers-rivieres.js'}); }
        await p.waitForFunction(() => !!window.LCNDA_EXT?.metiersRivieres);
        const api = (x, q = {}) => p.evaluate(([y, z]) => window.LCNDA_APP.api(y, z).catch(e => ({error: e.message})), [x, q]);
        const post = (a, b) => p.evaluate(async ([x, y]) => { try { const r = await window.LCNDA_APP.api(x, {}, {method: 'POST', body: y}); return r.result || r; } catch (e) { return {error: e.message}; } }, [a, b]);

        await t('serveur : le métier et les anciens sites à moins de 5 km (tanneur → tannerie, meunière → moulin, batelier → rien)', async () => {
            const j = await api('mr_person', {id: 1});
            assert.ok(j.ok); const m = j.matches.find(x => x.trade === 'tannerie');
            assert.ok(m, JSON.stringify(j).slice(0, 300)); assert.strictEqual(m.job, 'Maître tanneur');
            const s = m.sites[0]; assert.strictEqual(s.src, 'casias'); assert.ok(s.km < 5); assert.strictEqual(s.near, 'Tulle'); assert.strictEqual(s.dates, 'unknown');
            assert.match(s.name + ' ' + s.activity, /tannerie|corroierie|cuir/i);
            const ma = await api('mr_person', {id: 2}); const mm = ma.matches.find(x => x.trade === 'moulin');
            assert.ok(mm && mm.sites[0].src === 'roe' && /moulin/i.test(mm.sites[0].name), JSON.stringify(ma).slice(0, 300));
            const pa = await api('mr_person', {id: 3}); assert.deepStrictEqual(pa.matches, []);
        });
        await t('serveur : la rivière (BD TOPAGE), les hautes eaux de son vivant (Hub’Eau), les repères de crues, la ligne du batelier', async () => {
            const r = await api('mr_rivers', {id: 2});
            assert.ok(r.ok && !r.offline, JSON.stringify(r).slice(0, 300));
            assert.strictEqual(r.places[0].rivers[0].name, 'la Corrèze');
            const g = r.gauges[0]; assert.strictEqual(g.station.code, 'P350251001');
            assert.deepStrictEqual(g.top[0], {ym: '1960-10', h_m: 5.33}); assert.strictEqual(g.record.ym, '1960-10');
            assert.ok(r.reperes.length >= 1 && r.reperes.every(x => x.km <= 5 && /^https:\/\/www\.reperesdecrues/.test(x.url)));
            assert.ok(r.reperes.some(x => x.in_life), 'un repère de son vivant (1900–1975)');
            const b = await api('mr_rivers', {id: 3});
            assert.deepStrictEqual(b.river_jobs.map(x => [x.id, x.river]), [['batelier', 'la Corrèze']]);
            assert.ok(calls().some(c => /^topage\.json https:\/\/services\.sandre\.eaufrance\.fr\/geo\/topage\?/.test(c)));
            assert.ok(!calls().some(c => /MAZAUD|LACOMBE|DURAND/i.test(c)), 'aucun nom de personne envoyé');
        });
        await t('serveur : la commune — anciens sites (CASIAS), moulins (ROE), repères ; hors de France : rien', async () => {
            const d = await api('mr_place', {place_id: 1});
            assert.ok(d.ok && d.sites.count > 50 && d.sites.tally.some(x => x.id === 'tannerie'));
            assert.ok(d.mills_count >= 1 && d.mills.every(x => x.insee === '19272'));
            assert.ok(d.reperes_count >= 1 && d.reperes.every(x => x.insee === '19272'));
            const no = await api('mr_place', {name: 'Milwaukee', lat: 43.04, lon: -87.9}); assert.ok(no.ok && no.sites.count === 0 && !no.mills.length);
        });
        await t('serveur : POP — photos (Mémoire) et musée (Joconde, pas le « tulle » du tissu) ; « Garder » refusé sous ©, accepté sous licence libre, ↶', async () => {
            const r = await api('mr_pop', {place_id: 1});
            assert.ok(r.ok && r.items.length >= 5);
            assert.ok(r.items.some(x => x.base === 'memoire') && r.items.some(x => x.base === 'joconde' && /Tulle/.test(x.title)));
            assert.ok(!r.items.some(x => /collerette de tulle/i.test(x.title)), 'pas le tissu');
            assert.ok(r.items.every(x => /^https:\/\/iiif\.prd\.cloud\.culture\.fr\//.test(x.thumb) && /^https:\/\/pop\.culture\.gouv\.fr\/notice\//.test(x.page)));
            assert.ok(r.items.every(x => x.free === false), 'photos sous © : pas de « Garder »');
            const n0 = calls().length; await api('mr_pop', {place_id: 1}); assert.strictEqual(calls().length, n0, 'gardé : pas de 2e appel');
            const no = await post('mr_pop_keep', {base: 'joconde', ref: 'M0144003726', place_name: 'Tulle'}); assert.match(no.error || '', /licence libre/);
            const nf = path.join(net0, 'pop-notice.json'), notice = JSON.parse(fs.readFileSync(nf, 'utf8'));
            fs.writeFileSync(nf, JSON.stringify({...notice, COPY: 'Licence Ouverte (fichier d’essai)'}));
            const k = await post('mr_pop_keep', {base: 'joconde', ref: 'M0144003726', place_name: 'Tulle'});
            assert.ok(k.ok && /^mr-[0-9a-f]{12}$/.test(k.batch), JSON.stringify(k));
            assert.ok(fs.readdirSync(path.join(tmp, 'media')).length === 1);
            const u = await post('mr_pop_keep_undo', {batch: k.batch}); assert.ok(u.ok);
            assert.strictEqual(fs.readdirSync(path.join(tmp, 'media')).length, 0);
            fs.writeFileSync(nf, JSON.stringify(notice));
        });
        await t('serveur : hors ligne → un message ; réponses gardées effacées (🗑) puis remises (↶)', async () => {
            fs.renameSync(path.join(net0, 'topage.json'), path.join(net0, 'topage.off'));
            const off = await api('mr_rivers', {name: 'Brive-la-Gaillarde', lat: 45.1588, lon: 1.5321});
            assert.ok(off.ok && off.offline);
            fs.renameSync(path.join(net0, 'topage.off'), path.join(net0, 'topage.json'));
            const c = await post('mr_cache_clear', {}); assert.ok(c.ok && c.removed >= 3);
            assert.strictEqual((await api('mr_about')).cache.count, 0);
            const back = await post('mr_cache_restore', {token: c.token}); assert.strictEqual(back.restored, c.removed);
            const ab = await api('mr_about'); assert.ok(ab.sources.length >= 7 && ab.sources.every(s => s.licence));
        });

        await t('écran : « ⛏️ Son métier, près de chez lui » (Jean) ; caché pour Paul ; 🌊 dans « 🏘 Le lieu à son époque »', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.currentPersonId = 1; A.setModule('personnes'); });
            await p.waitForSelector('[data-mr-metier="1"] .mr-row', {timeout: 20000});
            const txt = await p.$eval('[data-mr-metier="1"]', n => n.closest('section.card').textContent);
            assert.match(txt, /Il était maître tanneur\. À .* de Tulle, une tannerie/); assert.match(txt, /il y a peut-être travaillé/); assert.match(txt, /ne dit pas les années/);
            assert.ok(await p.$eval('[data-mr-metier="1"]', n => !n.closest('section.card').hidden));
            if (process.env.MR_SHOTS) await (await p.$('[data-mr-metier="1"]')).evaluate(n => n.closest('section.card').scrollIntoView()) || await p.screenshot({path: path.join(process.env.MR_SHOTS, 'personne.png')});
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.currentPersonId = 2; A.setModule('personnes'); });
            await p.waitForSelector('[data-hist-life="2"] [data-mr-hist]', {timeout: 20000});
            const h = await p.$eval('[data-hist-life="2"] [data-mr-hist]', n => n.textContent);
            if (process.env.MR_SHOTS) { await p.$eval('[data-hist-life="2"]', n => n.scrollIntoView()); await sleep(300); await p.screenshot({path: path.join(process.env.MR_SHOTS, 'histoire.png')}); }
            assert.match(h, /la Corrèze/); assert.match(h, /octobre 1960 : 5,33 m/); assert.match(h, /la roue de son moulin tournait avec l’eau de la Corrèze/); assert.match(h, /une marque rappelle la crue/);
            await p.waitForSelector('[data-mr-metier="2"] .mr-row', {timeout: 20000});
            assert.match(await p.$eval('[data-mr-metier="2"]', n => n.textContent), /Elle était meunière\..*un moulin.*c’était peut-être le sien/);
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.currentPersonId = 3; A.setModule('personnes'); });
            await p.waitForSelector('[data-hist-life="3"] [data-mr-hist]', {timeout: 20000});
            await sleep(600);
            assert.ok(await p.$eval('[data-mr-metier="3"]', n => n.closest('section.card').hidden), 'pas de bloc vide');
            assert.match(await p.$eval('[data-hist-life="3"] [data-mr-hist]', n => n.textContent), /Paul était batelier : son travail suivait la Corrèze/);
        });
        await t('écran : fiche du village — 🏭 activités anciennes (filtre), ⚙️ moulins, 🌊 rivière, 🖼️ au musée (sans « Garder » sous ©)', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.listType = 'villages'; A.state.hVillage = '19272'; A.setModule('listes'); });
            await p.waitForSelector('.h-village [data-mr-part="place_pop"] .cplus-img', {timeout: 30000});
            const txt = await p.$eval('.h-village [data-mr-host]', n => n.textContent);
            assert.match(txt, /🏭 Activités anciennes de la commune/); assert.match(txt, /anciens ateliers, usines et commerces connus à Tulle/); assert.match(txt, /tannerie \(\d+\)/);
            assert.match(txt, /⚙️ Moulins et usines à eau/); assert.match(txt, /🌊 La rivière du village/); assert.match(txt, /5,33 m/); assert.match(txt, /🖼️ Ton village au musée/);
            assert.strictEqual(await p.$$eval('.h-village [data-mr-keep]', n => n.length), 0);
            if (process.env.MR_SHOTS) { await p.$eval('.h-village [data-mr-host]', n => n.scrollIntoView()); await sleep(800); await p.screenshot({path: path.join(process.env.MR_SHOTS, 'village.png'), fullPage: false}); }
            const filt = await p.$('.h-village [data-mr-filter]');
            if (filt) { await p.$eval('.h-village [data-mr-part="place_sites"] details', d => { d.open = true; }); await filt.fill('tannerie'); const vis = await p.$$eval('.h-village [data-mr-part="place_sites"] .mr-list > li', l => l.filter(x => !x.hidden).map(x => x.textContent)); assert.ok(vis.length >= 1 && vis.every(x => /tannerie/i.test(x))); }
        });
        await t('Réglages → ⛏️ Métiers et rivières : éteindre « au musée » le retire ; À propos des données ; registre dataSources', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'metiers_rivieres'; A.setModule('maintenance'); });
            await p.waitForSelector('[data-mr-settings] table', {timeout: 15000});
            const txt = await p.$eval('[data-mr-settings]', n => n.textContent);
            assert.match(txt, /CASIAS/); assert.match(txt, /Licence Ouverte/); assert.match(txt, /Hub’Eau/);
            await p.click('[data-mr-tg="place_pop"] input');
            assert.strictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-metiers-rivieres')).place_pop), false);
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.listType = 'villages'; A.state.hVillage = '19272'; A.setModule('listes'); });
            await p.waitForSelector('.h-village [data-mr-part="place_sites"]', {timeout: 20000});
            await sleep(500);
            assert.strictEqual(await p.$$eval('.h-village [data-mr-part="place_pop"]', n => n.length), 0);
            const ids = await p.evaluate(() => (window.LCNDA_EXT.dataSources || []).filter(d => /^mr_/.test(d.id)).map(d => d.id));
            ['mr_metier', 'mr_riviere_personne', 'mr_sites', 'mr_moulins', 'mr_riviere', 'mr_musee'].forEach(id => assert.ok(ids.includes(id), id));
            const out = await p.evaluate(async () => { const h = document.createElement('div'); document.body.appendChild(h); const ds = window.LCNDA_EXT.dataSources.find(d => d.id === 'mr_moulins'); await ds.run({place: {id: 1, name: 'Tulle'}}, h); const t = h.textContent; h.remove(); return t; });
            assert.match(out, /moulin/i);
        });
        await t('pas d’erreur JavaScript', async () => { assert.deepStrictEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill();
        fs.rmSync(tmp, {recursive: true, force: true});
    }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})();
