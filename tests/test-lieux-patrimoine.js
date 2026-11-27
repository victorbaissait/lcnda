#!/usr/bin/env node
/* 📜🏘️⛪ Anciens noms, lieux-dits et patrimoine de la commune (lib/lieux_patrimoine.php, assets/js/heritage-lieux-patrimoine.js,
 * assets/data/dicotopo/, scripts/lieux-patrimoine/, .github/workflows/lieux-patrimoine.yml).
 * Le « serveur » des packs (la version « lieux-patrimoine-donnees ») est un dossier local (GENEALOGY_TEST=1 + LCNDA_TEST_LP_DIR) :
 * les petits packs d'ESSAI de build-packs.py (noms inventés, marqués « fixture »). Les anciens noms sont les VRAIS (DT15, Cantal).
 *  1. données livrées : index.json (licence, mention), chaque DTxx.json.gz lisible, < 100 Mo en tout ;
 *  2. serveur : sommaire en ligne (un pack mal décrit est écarté), par tranches, reprise, abandon, vérifié puis rangé ; ↶ ; supprimer / remettre ;
 *     la commune d'un lieu (code INSEE) → anciens noms (Aurillac « Aureliacus » 984), lieux-dits, patrimoine ; « Orlhac » → Aurillac ;
 *  3. écran : Réglages → « 📦 Installer » → installé (↶ Annuler le retire) ; Monographie de commune : 📜, 🏘️, ⛪ ; offre ✕ retenue ;
 *     Atelier : « 💡 Ce serait peut-être … » ; LCNDA_EXT.dataSources.
 *   node tests/test-lieux-patrimoine.js */
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

(async () => {
    const dico = path.join(root, 'assets/data/dicotopo');
    await t('données livrées : DicoTopo, licence et mention, fichiers lisibles, moins de 100 Mo', async () => {
        const idx = JSON.parse(fs.readFileSync(path.join(dico, 'index.json'), 'utf8'));
        assert.match(idx.licence, /Licence Ouverte 2\.0/); assert.match(idx.mention, /CTHS/); assert.strictEqual(idx.url, 'https://dicotopo.cths.fr');
        let total = 0;
        for (const [dep, v] of Object.entries(idx.deps)) {
            const f = path.join(dico, `DT${dep}.json.gz`); const size = fs.statSync(f).size; total += size;
            assert.strictEqual(size, v.size, dep);
            if (dep === '15') { const d = JSON.parse(zlib.gunzipSync(fs.readFileSync(f))); assert.strictEqual(d.p.length, v.places); assert.strictEqual(d.o.length, v.old); assert.ok(d.o.every(o => o[0] < d.p.length)); }
        }
        assert.ok(idx.deps['15'], 'le Cantal'); assert.ok(total < 100e6, `${total} octets`);
    });
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-lp-')), site = path.join(tmp, 'site');
    fs.mkdirSync(path.join(tmp, 'media'));
    const mk = spawnSync('python3', ['-I', path.join(root, 'scripts/lieux-patrimoine/build-packs.py'), 'essai', '--dossier', site], {encoding: 'utf8'});
    if (mk.status !== 0) { console.error(mk.stderr || mk.stdout); process.exit(1); }
    // un pack mal décrit (taille fausse) : écarté
    const man = JSON.parse(fs.readFileSync(path.join(site, 'lieux-patrimoine-manifest.json'), 'utf8'));
    man.packs['lieuxdits-19'] = {size: 999, parts: [{name: 'lp-lieuxdits-19.lclieux', size: 5}]};
    fs.writeFileSync(path.join(site, 'lieux-patrimoine-manifest.json'), JSON.stringify(man));
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4', GENEALOGY_TEST: '1', LCNDA_TEST_LP_DIR: site};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$tag = function ($t) use ($pdo) { $s = $pdo->prepare('SELECT id FROM event_types WHERE gedcom_tag=? ORDER BY id LIMIT 1'); $s->execute([$t]); return (int) $s->fetchColumn(); };
$pdo->prepare('INSERT INTO places(name, county, country, admin4_code, latitude, longitude) VALUES(?,?,?,?,?,?)')->execute(['Aurillac', 'Cantal', 'France', '15014', 44.9277, 2.4476]); $aur = (int) $pdo->lastInsertId();
$pdo->prepare('INSERT INTO places(name, county, country) VALUES(?,?,?)')->execute(['Tulle', 'Corrèze', 'France']); $tul = (int) $pdo->lastInsertId();
$pdo->exec("INSERT INTO persons(first_name,last_name,gender,living_status,is_start) VALUES('Pierre','MAZAUD','male','deceased',1)"); $pid = (int) $pdo->lastInsertId();
$pdo->prepare("INSERT INTO events(scope, person_id, event_type_id, year, date_text, place_id) VALUES('person',?,?,1870,'1870',?)")->execute([$pid, $tag('BIRT'), $aur]);
$pdo->prepare("INSERT INTO events(scope, person_id, event_type_id, year, date_text, place_id) VALUES('person',?,?,1930,'1930',?)")->execute([$pid, $tag('DEAT'), $aur]);
echo json_encode(['aur' => $aur, 'tul' => $tul]);`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0 || !/"aur"/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
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
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf, null, {timeout: 30000});
        // tant que index.php ne les charge pas : la feuille de style et le script
        if (!(await p.evaluate(() => !!window.LCNDA_EXT?.lieuxPatrimoine))) {
            await p.addStyleTag({url: 'assets/css/lieux-patrimoine.css'}); await p.addScriptTag({url: 'assets/js/heritage-lieux-patrimoine.js'});
        }
        await p.waitForFunction(() => window.LCNDA_EXT?.lieuxPatrimoine, null, {timeout: 10000});
        const api = (x, q = {}) => p.evaluate(([y, z]) => window.LCNDA_APP.api(y, z).then(r => r.result || r).catch(e => ({error: e.message})), [x, q]);
        // la monographie (heritage-monographie-plus.js) dessine ses parties quand on les voit : on les fait défiler
        const monoParts = async ids => { for (const id of ids) { await p.waitForSelector(`[data-mp="${id}"]`, {timeout: 20000}); await p.evaluate(i => document.querySelector(`[data-mp="${i}"]`).scrollIntoView(), id); }
            await p.waitForFunction(i => i.every(id => document.querySelector(`[data-mp="${id}"]`)?.dataset.mpState && !['wait', 'run'].includes(document.querySelector(`[data-mp="${id}"]`).dataset.mpState)), ids, {timeout: 20000}); await sleep(200); };
        const monoText = () => p.evaluate(() => [...document.querySelectorAll('[data-mp^="lp_"]')].filter(x => !x.hidden).map(x => x.querySelector('.lp-lead, .lp-src') ? [...x.querySelectorAll('.lp-lead, .lp-src')].map(y => y.textContent).join(' ') : x.textContent).join(' | '));
        const post = (a, b) => p.evaluate(async ([x, y]) => { try { const r = await window.LCNDA_APP.api(x, {}, {method: 'POST', body: y}); return r.result || r; } catch (e) { return {error: e.message}; } }, [a, b]);

        await t('serveur : sommaire en ligne (le pack mal décrit est écarté) ; rien d’installé au départ ; le Cantal est le département de la famille', async () => {
            const r = await api('lp_dl_info');
            assert.deepStrictEqual(Object.keys(r.packs).sort(), ['lieuxdits-15', 'patrimoine-15']);
            const st = await api('lp_status'); assert.deepStrictEqual(Object.keys(st.packs), []); assert.deepStrictEqual(st.wanted, ['15']);
            assert.ok(st.dicotopo.deps['15'].old > 1000); assert.ok(st.dicotopo.size > 0);
        });
        await t('serveur : par tranches, reprendre, abandonner ; un pack inconnu refusé', async () => {
            const s = await post('lp_dl_start', {key: 'lieuxdits-15'}); assert.ok(s.id, JSON.stringify(s));
            const r = await api('lp_dl_resume', {id: s.id}); assert.deepStrictEqual([r.exists, r.key], [true, 'lieuxdits-15']);
            await post('lp_dl_cancel', {id: s.id}); assert.strictEqual((await api('lp_dl_resume', {id: s.id})).exists, false);
            assert.match((await post('lp_dl_start', {key: 'lieuxdits-19'})).error, /pas encore en ligne/);
            assert.ok((await post('lp_dl_start', {key: '../etc'})).error);
        });
        await t('📜 la commune d’un lieu (code INSEE) : les anciens noms d’Aurillac (DicoTopo), sans pack', async () => {
            const d = await api('lp_place', {id: ID.aur});
            assert.deepStrictEqual([d.ok, d.insee, d.dep, d.how], [true, '15014', '15', 'insee']);
            assert.strictEqual(d.dicotopo.commune.name, 'Aurillac');
            assert.ok(d.dicotopo.commune.old.some(o => o.label === 'Aureliacus' && o.year === 984 && /Gerbert/.test(o.ref)));
            assert.match(d.dicotopo.commune.url, /^https:\/\/dicotopo\.cths\.fr\/places\/P\d+$/);
            assert.ok(d.dicotopo.places_total > 100); assert.strictEqual(d.lieuxdits.installed, false); assert.strictEqual(d.patrimoine.installed, false);
            const tul = await api('lp_place', {id: ID.tul}); assert.strictEqual(tul.dep, '19'); assert.strictEqual(tul.dicotopo?.covered ?? false, false);
        });
        await t('💡 « Orlhac » (forme ancienne) → Aurillac ; un nom trop court → rien', async () => {
            const r = await p.evaluate(() => window.LCNDA_EXT.lieuxPatrimoine.suggest('Orlhac'));
            const g = r.guesses.find(x => x.source === 'dicotopo' && x.insee === '15014');
            assert.ok(g, JSON.stringify(r).slice(0, 400)); assert.strictEqual(g.old, 'Orlhac'); assert.strictEqual(g.year, 1280); assert.strictEqual(g.dep_name, 'Cantal');
            assert.deepStrictEqual((await api('lp_suggest', {q: 'Or'})).guesses, []);
        });
        await t('Réglages → « 📦 Installer tout » → les 2 packs installés et vérifiés ; ↶ Annuler les retire ; 🗑 Supprimer ↶ remet', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'lieux_patrimoine'; A.setModule('maintenance'); });
            await p.waitForSelector('[data-lp-install-all]', {timeout: 20000});
            assert.match(await p.textContent('.lp-table'), /15 Cantal/);
            await p.click('[data-lp-install-all]');
            await p.waitForFunction(() => /installé/.test([...document.querySelectorAll('.ui-toast')].map(x => x.textContent).join(' ')), null, {timeout: 30000});
            let st = await api('lp_status'); assert.deepStrictEqual(Object.keys(st.packs).sort(), ['lieuxdits-15', 'patrimoine-15']); assert.ok(st.packs['lieuxdits-15'].fixture);
            assert.ok(fs.existsSync(path.join(tmp, 'lieux-patrimoine', 'patrimoine-15.sqlite')), 'dans le dossier des données');
            assert.strictEqual(await p.evaluate(() => localStorage.getItem('genealogie-lieux-patrimoine-dl')), '{}');
            await p.evaluate(() => [...document.querySelectorAll('.ui-toast')].reverse().find(x => /installé/.test(x.textContent)).querySelector('button').click()); await sleep(800);
            assert.deepStrictEqual(Object.keys((await api('lp_status')).packs), [], '↶ Annuler');
            await p.evaluate(() => window.LCNDA_EXT.lieuxPatrimoine.install(['lieuxdits-15', 'patrimoine-15']));
            await p.waitForFunction(() => document.querySelectorAll('[data-lp-remove]').length === 2, null, {timeout: 30000});
            await p.click('[data-lp-remove="patrimoine-15"]'); await sleep(500);
            st = await api('lp_status'); assert.deepStrictEqual(st.removed, ['patrimoine-15']);
            assert.ok((await post('lp_pack_restore', {key: 'patrimoine-15'})).ok); assert.ok((await api('lp_status')).packs['patrimoine-15']);
        });
        await t('Monographie de commune : 📜 anciens noms, 🏘️ lieux-dits (à chercher), ⛪ patrimoine avec le lien POP', async () => {
            await p.evaluate(id => { const A = window.LCNDA_APP; A.state.graphPlaceMonograph = {...(A.state.graphPlaceMonograph || {}), id, name: 'Aurillac', showEvents: true}; A.state.graphMode = 'place_monograph'; A.setModule('graphiques'); }, ID.aur);
            await monoParts(['lp_dico', 'lp_lieuxdits', 'lp_patrimoine']);
            const txt = await monoText();
            assert.match(txt, /Aurillac s’écrivait « Aureliacus » en 984/); assert.match(txt, /DicoTopo/);
            assert.match(txt, /2 lieux-dits à Aurillac, dont 1 habités/); assert.match(txt, /données d’essai/);
            assert.match(txt, /1 monument\(s\) protégé\(s\) et 1 objet\(s\) protégé\(s\)/);
            assert.ok(await p.$('a[href="https://pop.culture.gouv.fr/notice/palissy/PM99000001"]'));
        });
        await t('Fiche d’un village (Listes → Villages) : les mêmes parties ; « 🗺 Sur la carte » pose les lieux-dits sur la carte du village', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.hVillage = '15014'; A.state.listType = 'villages'; A.setModule('listes'); window.LCNDA_EXT.lists.villages?.(++A.state.workspaceToken); });
            await p.waitForSelector('.h-village [data-lp-part="lieuxdits"]', {timeout: 20000});
            assert.match(await p.textContent('.h-village [data-lp-host]'), /Aureliacus/);
            if (await p.$('.h-village-map')) { await p.click('[data-lp-pins]'); await p.waitForSelector('.h-village-map .lp-pin', {timeout: 5000}); }
        });
        await t('une offre d’installation, ✕ retenue (genealogie-lieux-patrimoine-offres) ; une partie éteinte ne se montre plus', async () => {
            await post('lp_pack_remove', {key: 'lieuxdits-15'});
            await p.evaluate(() => { window.LCNDA_APP.setModule('dashboard'); }); await sleep(300);
            await p.evaluate(() => window.LCNDA_APP.setModule('graphiques'));
            await monoParts(['lp_lieuxdits']); await p.waitForSelector('[data-lp-offer="lieuxdits"]', {timeout: 20000});
            await p.click('[data-lp-hide-offer="lieuxdits"]');
            assert.strictEqual(await p.evaluate(() => localStorage.getItem('genealogie-lieux-patrimoine-offres')), '{"lieuxdits":true}');
            await p.evaluate(() => { localStorage.setItem('genealogie-lieux-patrimoine', JSON.stringify({patrimoine: false})); window.LCNDA_APP.setModule('dashboard'); }); await sleep(300);
            await p.evaluate(() => window.LCNDA_APP.setModule('graphiques'));
            await monoParts(['lp_dico']); await sleep(300);
            assert.ok(!(await p.$('[data-mp="lp_patrimoine"]')) && !(await p.$('[data-lp-offer]')), 'partie éteinte : pas proposée ; offre cachée : plus là');
            await p.evaluate(() => localStorage.removeItem('genealogie-lieux-patrimoine'));
        });
        await t('Atelier : un lieu lu absent de la base → « 💡 Ce serait peut-être Aurillac (Cantal) »', async () => {
            await p.evaluate(() => { document.getElementById('workspace').insertAdjacentHTML('beforeend', '<section data-tf-sec="places"><div class="h-tf-item" data-tf-item="l1"><button class="h-tf-main">Orlhac</button></div><div class="h-tf-item" data-tf-item="l2"><button class="h-tf-main">Aurillac</button><span class="h-tf-base">↔ Aurillac</span></div></section>'); });
            await p.waitForSelector('[data-tf-item="l1"] .lp-guess', {timeout: 10000});
            assert.match(await p.textContent('[data-tf-item="l1"] .lp-guess'), /Ce serait peut-être .*Aurillac \(Cantal\)/);
            await sleep(300); assert.ok(!(await p.$('[data-tf-item="l2"] .lp-guess')), 'un lieu de la base : rien');
        });
        await t('registre LCNDA_EXT.dataSources : 4 entrées, run() pour un lieu choisi', async () => {
            const ids = await p.evaluate(() => window.LCNDA_EXT.dataSources.filter(x => x.id.startsWith('lp_')).map(x => x.id));
            assert.deepStrictEqual(ids, ['lp_dicotopo', 'lp_lieuxdits', 'lp_patrimoine', 'lp_suggest']);
            const html = await p.evaluate(async id => { const h = document.createElement('div'); await window.LCNDA_EXT.dataSources.find(x => x.id === 'lp_dicotopo').run({place: {id}}, h); return h.textContent; }, ID.aur);
            assert.match(html, /Aureliacus/);
        });
        await t('📋 Listes (LCNDA_EXT.dataLists) : 4 listes ; filtres combinés, année, distance autour d’Aurillac', async () => {
            const ids = await p.evaluate(() => window.LCNDA_EXT.dataLists.filter(x => x.id.startsWith('lp_')).map(x => x.id));
            assert.deepStrictEqual(ids, ['lp_lieuxdits', 'lp_merimee', 'lp_palissy', 'lp_dicotopo']);
            const q = (id, query) => p.evaluate(([i, x]) => window.LCNDA_EXT.dataLists.find(l => l.id === i).query(x), [id, query]);
            let r = await q('lp_dicotopo', {filters: [{key: 'dep', op: '=', value: '15'}, {key: 'commune', op: '=', value: 'Aurillac'}], years: {from: 900, to: 1000}});
            assert.ok(r.rows.some(x => x.name === 'Aureliacus' && x.year === 984), JSON.stringify(r).slice(0, 300)); assert.ok(r.rows.every(x => x.year >= 900 && x.year <= 1000));
            r = await q('lp_dicotopo', {q: 'orlhac', near: {lat: 44.9277, lon: 2.4476, km: 5}}); assert.ok(r.total >= 1 && r.rows.every(x => x.km <= 5));
            await post('lp_pack_restore', {key: 'lieuxdits-15'});
            r = await q('lp_lieuxdits', {filters: [{key: 'habite', op: '=', value: 'habité'}]}); assert.deepStrictEqual(r.rows.map(x => x.name), ['la Croix MAZAUD', 'Moulin DURAND']);
            r = await q('lp_palissy', {years: {from: 1600, to: 1700}}); assert.deepStrictEqual(r.rows.map(x => [x.name, x.from, x.to]), [['Cloche d’essai', 1650, 1650]]);
            r = await q('lp_merimee', {near: {lat: 45.1, lon: 2.5, km: 1}}); assert.strictEqual(r.total, 1);
            const per = await p.evaluate(() => window.LCNDA_EXT.dataLists.find(l => l.id === 'lp_merimee').period({from: 1100, to: 1199})); assert.deepStrictEqual(per, [1100, 1199]);
        });
        await t('aucune erreur JavaScript', async () => { assert.deepStrictEqual(errs, []); });
    } finally { await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true}); }
    console.log(fails ? `${fails} essai(s) en échec` : 'Anciens noms, lieux-dits et patrimoine : tout marche.');
    process.exit(fails ? 1 : 0);
})();
