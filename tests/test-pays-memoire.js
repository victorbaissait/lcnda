#!/usr/bin/env node
/* 🏡 Pays et mémoire (assets/js/heritage-pays-memoire.js, lib/pays_memoire.php, assets/css/pays-memoire.css, assets/data/pm-*).
 * Les données livrées sont les VRAIES (scripts/pays-memoire/build-data.py) ; le réseau (films : Wikimedia Commons, Internet Archive)
 * est remplacé par des réponses vraies enregistrées une fois pour Lyon (tests/fixtures/pays-memoire/, GENEALOGY_TEST=1 +
 * LCNDA_TEST_PM_DIR ; un fichier absent = hors ligne).
 *  1. Node : fichiers, tailles (< 15 Mo), licences et sources ; calculs (commune la plus proche, parler, loups, monument, écoles…) ;
 *  2. serveur : films libres de Lyon (rien de non libre, rien d'après 1970), gardés (pas de 2e appel), hors ligne, 🗑 et ↶, Listes ;
 *  3. écran : lignes dans « 🏘 Le lieu à son époque » (Jean MAZAUD né en 1850 à Saint-Flour ; Pierre DURAND mort en 1916),
 *     fiche du village, Réglages (éteindre une partie la retire), registres (monographie, Listes, 🧰, Où chercher).
 *   node tests/test-pays-memoire.js */
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
const PM = require('../assets/js/heritage-pays-memoire.js');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const FX = path.join(__dirname, 'fixtures/pays-memoire');
const DATA = path.join(root, 'assets/data');
const read = f => { const b = fs.readFileSync(path.join(DATA, f)); return JSON.parse((b[0] === 0x1f ? zlib.gunzipSync(b) : b).toString('utf8')); };
const FILES = ['pm-musique.json', 'pm-parlers.json', 'pm-fontaines.json.gz', 'pm-monuments.json.gz', 'pm-faune.json.gz', 'pm-doleances.json', 'pm-ecoles.json.gz'];
// la commune des essais : Saint-Flour (Cantal)
const SF = {insee: '15187', name: 'Saint-Flour', lat: 45.0336, lon: 3.0926};

(async () => {
    const D = {}; FILES.forEach(f => { D[f.replace(/^pm-|\.json(\.gz)?$/g, '')] = read(f); });
    const I = PM.communeIndex(read('cc-communes.json.gz'));
    await t('données : fichiers, tailles (< 15 Mo), licences, sources', async () => {
        const size = FILES.reduce((s, f) => s + fs.statSync(path.join(DATA, f)).size, 0);
        assert.ok(size < 15e6, `${size} octets`); console.log(`  (taille dans l’app : ${(size / 1e6).toFixed(2)} Mo)`);
        FILES.forEach(f => { const d = read(f); assert.ok(d.attr && d.built, f); });
        assert.ok(D.musique.rows.length >= 20 && D.musique.rows.every(r => /^Q\d+$/.test(r.q) && r.n && Array.isArray(r.deps)));
        assert.ok(D.musique.rows.every(r => r.media.every(m => m.lic)), 'chaque son ou vidéo a sa licence');
        assert.strictEqual(D.parlers.licence, 'CC BY-NC-SA 4.0'); assert.ok(D.parlers.rows.length > 300);
        assert.ok(D.parlers.rows.every(r => r.length === 5 && typeof r[1] === 'number' && /\.mp3$/i.test(r[3])), 'nom, position, fichier son seulement');
        assert.ok(!JSON.stringify(D.parlers).includes('soleu'), 'les textes de l’Atlas ne sont pas recopiés');
        assert.ok(D.monuments.rows.length > 20000 && D.monuments.licence === 'CC0 1.0' && /\$1/.test(D.monuments.lille_url));
        assert.ok(D.fontaines.rows.length > 50);
        assert.ok(D.faune.datasets[0].licence === 'CC BY 4.0' && /dosqyf/.test(D.faune.datasets[0].doi));
        assert.ok(D.faune.rows.filter(r => r.sp === 'loup').every(r => r.last <= 1950), 'loups : inventaire historique seulement');
        assert.ok(D.doleances.deps.length >= 15 && D.doleances.deps.every(d => /^https?:/.test(d.url)));
        assert.ok(D.ecoles.rows.length > 1000 && D.ecoles.schools.length >= 3);
    });
    await t('calculs : commune la plus proche, parler, loups, monument, fontaines, doléances, écoles', async () => {
        const pl = PM.resolvePlace(I, {lat: SF.lat, lon: SF.lon, name: 'St-Flour'});
        assert.strictEqual(pl.insee, SF.insee); assert.strictEqual(pl.dep, '15');
        assert.strictEqual(PM.resolvePlace(I, {name: 'Milwaukee', lat: 43.04, lon: -87.9, country: 'USA'}), null);
        const near = PM.parlersNear(D.parlers, SF.lat, SF.lon, 3, 60); assert.ok(near.length >= 1 && near[0].km < 60 && near[0].km <= near[near.length - 1].km);
        const w = PM.wolfLine(D.faune, '15', 1850); assert.ok(w && w.still && w.last >= 1850, JSON.stringify(w));
        assert.strictEqual(PM.wolfLine(D.faune, '15', 1990).still, false);
        const m = PM.monumentsOf(D.monuments, SF.insee); assert.ok(m.length >= 1 && /^Q\d+$/.test(m[0].q));
        const dl = PM.doleancesOf(D.doleances, {insee: '53001', dep: '53'}); assert.ok(dl.ws.length === 1 && /wikisource/.test(dl.ws[0].url));
        const e = D.ecoles.rows.find(r => /^\S+ \S+$/.test(r[1]));
        const [f, l] = e[1].split(' ');
        const hit = PM.ecolesMatch(D.ecoles, f, l, e[2] + 1); assert.ok(hit.some(x => x.q === 'Q' + e[0]), e[1]);
        assert.deepStrictEqual(PM.ecolesMatch(D.ecoles, f, l, e[2] + 5).filter(x => x.q === 'Q' + e[0]), []);
        const fo = PM.fontainesNear(D.fontaines, PM.resolvePlace(I, {insee: D.fontaines.rows[0].insee}), 5); assert.ok(fo.length >= 1);
        assert.ok(PM.musicFor(D.musique, '15').length >= 1, 'une danse ou un instrument du Cantal');
    });

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-pm-')), net0 = path.join(tmp, 'net');
    fs.mkdirSync(path.join(tmp, 'media'), {recursive: true}); fs.cpSync(FX, net0, {recursive: true});
    const calls = () => { try { return fs.readFileSync(path.join(net0, 'calls.log'), 'utf8').trim().split('\n').filter(Boolean); } catch (_) { return []; } };
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4', GENEALOGY_TEST: '1', LCNDA_TEST_PM_DIR: net0};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start) VALUES(1,'Jean','MAZAUD','male','deceased',1),(2,'Marie','LACOMBE','female','deceased',0),(3,'Pierre','DURAND','male','deceased',0)");
$pdo->exec("INSERT INTO places(id,name,county,country,latitude,longitude,admin4_code) VALUES(1,'Saint-Flour','Cantal','France',45.0336,3.0926,'15187'),(2,'Lyon','Rhône','France',45.7640,4.8357,'69123')");
$t = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn();
$ins = $pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,date_text,year,sort_date,place_id) VALUES('person',?,?,?,?,?,?)");
$ins->execute([1,$t('BIRT'),'1850',1850,'1850',1]); $ins->execute([1,$t('DEAT'),'1912',1912,'1912',1]);
$ins->execute([2,$t('BIRT'),'1760',1760,'1760',1]); $ins->execute([2,$t('DEAT'),'1820',1820,'1820',1]);
$ins->execute([3,$t('BIRT'),'1890',1890,'1890',1]); $ins->execute([3,$t('DEAT'),'1916',1916,'1916',2]);
echo json_encode(['ok' => 1]);`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0 || !/"ok"/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const errs = [];
    try {
        const ctx = await browser.newContext({viewport: {width: 1440, height: 900}});
        // pas d'Internet dans les essais : les sons, photos et vignettes externes ne sont pas chargés
        await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
        const p = await ctx.newPage();
        p.on('pageerror', e => errs.push(e.message));
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_APP?.defaultPersonBlocks, null, {timeout: 30000});
        // index.php ne charge pas encore heritage-pays-memoire.js : on l'ajoute (comme le feront les balises)
        if (!(await p.evaluate(() => !!window.LCNDA_EXT?.paysMemoire))) { await p.addStyleTag({url: base + 'assets/css/pays-memoire.css'}); await p.addScriptTag({url: base + 'assets/js/heritage-pays-memoire.js'}); }
        await p.waitForFunction(() => !!window.LCNDA_EXT?.paysMemoire);
        const api = (x, q = {}) => p.evaluate(([y, z]) => window.LCNDA_APP.api(y, z).catch(e => ({error: e.message})), [x, q]);
        const post = (a, b) => p.evaluate(async ([x, y]) => { try { const r = await window.LCNDA_APP.api(x, {}, {method: 'POST', body: y}); return r.result || r; } catch (e) { return {error: e.message}; } }, [a, b]);

        await t('serveur : films libres de Lyon (≤ 1970, domaine public ou licence libre), gardés, hors ligne, 🗑 et ↶, Listes', async () => {
            const r = await api('pm_films', {name: 'Lyon', insee: '69123'});
            assert.ok(r.ok && r.items.length >= 2, JSON.stringify(r).slice(0, 300));
            assert.ok(r.items.every(x => x.year <= 1970 && x.licence && /^https:\/\/(commons\.wikimedia\.org|archive\.org)\//.test(x.page)));
            assert.ok(r.items.some(x => /Lumi[eè]re/i.test(x.title) && x.year === 1895), 'la sortie de l’usine Lumière (1895)');
            assert.ok(!r.items.some(x => /Cercle Rouge|Bout De Souffle/i.test(x.title)), 'pas de film non libre');
            const n0 = calls().length; await api('pm_films', {name: 'Lyon'}); assert.strictEqual(calls().length, n0, 'gardé : pas de 2e appel');
            const off = await api('pm_films', {name: 'Brive-la-Gaillarde'}); assert.ok(!off.ok && off.offline);
            const L = await api('pm_list_films', {query: JSON.stringify({years: {from: 1890, to: 1900}})}); assert.ok(L.total >= 1 && L.rows.every(x => x.annee <= 1900));
            const c = await post('pm_cache_clear', {}); assert.ok(c.ok && c.removed >= 1);
            assert.strictEqual((await api('pm_about')).cache.count, 0);
            const back = await post('pm_cache_restore', {token: c.token}); assert.strictEqual(back.restored, c.removed);
            assert.ok((await api('pm_about')).sources.length === 2);
        });

        await t('écran : lignes dans « 🏘 Le lieu à son époque » — loups, parler, danse (Jean) ; monument (Pierre, 1916) ; 1789 (Marie)', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.currentPersonId = 1; A.setModule('personnes'); });
            await p.waitForSelector('[data-hist-life="1"] [data-pm-hist]', {timeout: 30000});
            const txt = await p.$eval('[data-hist-life="1"] [data-pm-hist]', n => n.textContent);
            assert.match(txt, /encore des loups dans son département \(Cantal : dernière mention en \d{4}\)/);
            assert.match(txt, /Écoute le parler de son coin/);
            assert.ok(await p.$('[data-hist-life="1"] [data-pm-hist] a.pm-src-link[href^="https://"]'), 'un lien ↗ source');
            if (process.env.PM_SHOTS) { await p.$eval('[data-hist-life="1"]', n => n.scrollIntoView()); await sleep(300); await p.screenshot({path: path.join(process.env.PM_SHOTS, 'personne.png')}); }
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.currentPersonId = 3; A.setModule('personnes'); });
            await p.waitForSelector('[data-hist-life="3"] [data-pm-hist]', {timeout: 30000});
            assert.match(await p.$eval('[data-hist-life="3"] [data-pm-hist]', n => n.textContent), /monument aux morts de (Lyon|Saint-Flour)/);
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.currentPersonId = 2; A.setModule('personnes'); });
            await p.waitForSelector('[data-hist-life="2"] [data-pm-hist]', {timeout: 30000});
            const m = await p.$eval('[data-hist-life="2"] [data-pm-hist]', n => n.textContent);
            assert.match(m, /En 1789, sa paroisse \(Saint-Flour\)/); assert.doesNotMatch(m, /monument aux morts/);
        });
        await t('écran : fiche du village — parties avec source et lien ↗ ; rien de vide', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.listType = 'villages'; A.state.hVillage = '15187'; A.setModule('listes'); });
            await p.waitForSelector('.h-village [data-pm-host] [data-pm-part="monument"]:not([hidden])', {timeout: 30000});
            await sleep(800);
            const parts = await p.$$eval('.h-village [data-pm-host] [data-pm-part]', l => l.map(x => ({id: x.dataset.pmPart, hidden: x.hidden, txt: x.textContent, src: !!x.querySelector('.pm-src a, a.pm-src-link')})));
            ['monument', 'faune', 'doleances', 'parler'].forEach(id => assert.ok(parts.some(x => x.id === id && !x.hidden), id));
            parts.filter(x => !x.hidden).forEach(x => { assert.ok(x.txt.trim().length > 20 && x.src, x.id); });
            assert.ok(!parts.some(x => x.id === 'films' && !x.hidden && /\d+ films/.test(x.txt)), 'Saint-Flour : pas de film (hors ligne)');
            if (process.env.PM_SHOTS) { await p.$eval('.h-village [data-pm-host]', n => n.scrollIntoView()); await sleep(500); await p.screenshot({path: path.join(process.env.PM_SHOTS, 'village.png')}); }
        });
        await t('Réglages → 🏡 Pays et mémoire : éteindre « monument » le retire ; À propos ; registres', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'pays_memoire'; A.setModule('maintenance'); });
            await p.waitForSelector('[data-pm-settings] table', {timeout: 15000});
            const txt = await p.$eval('[data-pm-settings]', n => n.textContent);
            ['CC BY-NC-SA 4.0', 'CC BY 4.0', 'CC0 1.0', 'Licence Ouverte 2.0'].forEach(l => assert.ok(txt.includes(l), l));
            await p.click('[data-pm-tg="monument"] input');
            assert.strictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-pays-memoire')).monument), false);
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.listType = 'villages'; A.state.hVillage = '15187'; A.setModule('listes'); });
            await p.waitForSelector('.h-village [data-pm-host] [data-pm-part="faune"]:not([hidden])', {timeout: 30000});
            assert.strictEqual(await p.$('.h-village [data-pm-part="monument"]'), null);
            await p.evaluate(() => localStorage.removeItem('genealogie-pays-memoire'));
            const reg = await p.evaluate(() => ({ds: (window.LCNDA_EXT.dataSources || []).filter(d => /^pm_/.test(d.id)).map(d => d.id), dl: (window.LCNDA_EXT.dataLists || []).filter(d => /^pm_/.test(d.id)).map(d => d.id),
                mono: (window.LCNDA_EXT.monographSections || []).filter(d => /^pm_/.test(d.id)).map(d => d.id), so: (window.LCNDA_SO40?.SITES || []).map(s => s.key)}));
            ['pm_musique', 'pm_parler', 'pm_fontaines', 'pm_films', 'pm_doleances', 'pm_monument', 'pm_faune', 'pm_personne'].forEach(id => assert.ok(reg.ds.includes(id), id));
            ['pm_musique', 'pm_parlers', 'pm_fontaines', 'pm_monuments', 'pm_faune', 'pm_doleances', 'pm_ecoles', 'pm_films'].forEach(id => assert.ok(reg.dl.includes(id), id));
            assert.strictEqual(reg.mono.length, 7); ['polytechnique', 'saint_cyr', 'ens', 'doleances'].forEach(k => assert.ok(reg.so.includes(k), k));
            const run = await p.evaluate(async () => { const h = document.createElement('div'); document.body.appendChild(h); const ds = window.LCNDA_EXT.dataSources.find(d => d.id === 'pm_faune'); await ds.run({place: {name: 'Saint-Flour', insee: '15187'}}, h); const x = h.textContent; h.remove(); return x; });
            assert.match(run, /Loups/);
            const rows = await p.evaluate(async () => { const l = window.LCNDA_EXT.dataLists.find(d => d.id === 'pm_monuments'); const r = await l.load(); return {n: r.length, ok: r.every(x => x.url && x.insee), geo: !!l.geo(r[0])}; });
            assert.ok(rows.n > 20000 && rows.ok && rows.geo);
            const mono = await p.evaluate(async () => { const s = window.LCNDA_EXT.monographSections.find(d => d.id === 'pm_monument'); const h = document.createElement('div'); const ok = await s.render({id: 1, name: 'Saint-Flour', latitude: 45.0336, longitude: 3.0926}, h, {}); return {ok, txt: h.textContent}; });
            assert.ok(mono.ok && /Saint-Flour/.test(mono.txt));
            const so = await p.evaluate(() => window.LCNDA_SO40.url('doleances', {place: 'Saint-Flour, Cantal'})); assert.match(so, /^https:\/\/francearchives\.gouv\.fr\/fr\/search\?q=/);
        });
        await t('pas d’erreur JavaScript', async () => { assert.deepStrictEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true});
    }
    console.log(fails ? `${fails} échec(s)` : 'Tout est bon.');
    process.exit(fails ? 1 : 0);
})();
