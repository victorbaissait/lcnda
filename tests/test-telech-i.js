#!/usr/bin/env node
/* ⚓ Le pays au travail et à l'école (lot I « téléchargements ») — assets/js/heritage-telech-i.js, scripts/telech-i/*, assets/data/ti-*.json.gz.
 *  1. Node : les fichiers livrés (licence, source, date, petits, dans le manifeste) et le calcul (cordier près de la Corderie royale,
 *     sanatorium du plateau d'Assy pour une personne décédée seulement, gardien de prison près de Clairvaux, Mâcon et Lyon dans « Le Tour
 *     de la France par deux enfants », chanson de fileuse, dictée de ses 12 ans, son métier dans le dictionnaire de 1860).
 *  2. Serveur et écran (php -S + Playwright, base temporaire) : rien ne part sur Internet (toute requête hors 127.0.0.1 est comptée et
 *     coupée), ni pour une fiche vivante ni en mode consultation ; fiche, village, listes, cartes, Réglages (interrupteur ↶), 390 px et
 *     thème sombre, aucune erreur JavaScript, aucun « Failed to fetch ».
 *  Fiches (noms inventés) : Jean MAZAUD (1840 Rochefort – 1910 Brest, cordier, marié à Brest en 1865, à Mâcon en 1880), Marie LACOMBE
 *  (1872 Lyon – 1940 Passy, fileuse), Paul DURAND (1830 – 1900, gardien de prison à Ville-sous-la-Ferté), Luc MAZAUD (vivant, 1990
 *  Rochefort, cordier).
 *   node tests/test-telech-i.js */
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
const H = require('../assets/js/heritage-telech-i.js');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const raw = n => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root, 'assets/data', `${n}.json.gz`))).toString('utf8'));
const rows = n => H.table(raw(n));
const P = {rochefort: {id: 1, name: 'Rochefort', lat: 45.9422, lon: -0.9589}, brest: {id: 2, name: 'Brest', lat: 48.3904, lon: -4.4861}, macon: {id: 3, name: 'Mâcon', lat: 46.3069, lon: 4.8287},
    lyon: {id: 4, name: 'Lyon', lat: 45.758, lon: 4.835}, passy: {id: 5, name: 'Passy', lat: 45.9236, lon: 6.6903}, clairvaux: {id: 6, name: 'Ville-sous-la-Ferté', lat: 48.1206, lon: 4.7869}};
const ev = (tag, year, p) => ({tag, year, place_id: p.id, lat: p.lat, lon: p.lon, place: p.name, country: 'France'});
const JEAN = {ok: true, person: {id: 1, gender: 'male', birth: 1840, death: 1910}, jobs: [{text: 'cordier', year: null}], text: '', events: [ev('BIRT', 1840, P.rochefort), ev('MARR', 1865, P.brest), ev('RESI', 1880, P.macon), ev('DEAT', 1910, P.brest)]};
const MARIE = {ok: true, person: {id: 2, gender: 'female', birth: 1872, death: 1940}, jobs: [{text: 'fileuse', year: null}], text: '', events: [ev('BIRT', 1872, P.lyon), ev('DEAT', 1940, P.passy)]};
const PAUL = {ok: true, person: {id: 3, gender: 'male', birth: 1830, death: 1900}, jobs: [{text: 'gardien de prison', year: null}], text: '', events: [ev('BIRT', 1830, P.clairvaux), ev('DEAT', 1900, P.clairvaux)]};
const LUC = {ok: true, person: {id: 4, gender: 'male', birth: 1990, death: null}, jobs: [{text: 'cordier', year: null}], text: '', events: [ev('BIRT', 1990, P.passy)]};
const PACKS = ['ti-navals', 'ti-autos', 'ti-sucreries', 'ti-sanas', 'ti-centrales', 'ti-romains', 'ti-hippodromes', 'ti-tour', 'ti-dico', 'ti-ecole', 'ti-chansons', 'ti-contexte'];

(async () => {
    /* ═════════ 1. les fichiers et le calcul ═════════ */
    await t('fichiers livrés : présents, petits, avec source, adresse, licence et date ; dans le manifeste (script scripts/telech-i)', async () => {
        const man = JSON.parse(fs.readFileSync(path.join(root, 'assets/data/manifest.json'), 'utf8'));
        for (const n of PACKS) {
            const f = path.join(root, 'assets/data', `${n}.json.gz`); assert.ok(fs.existsSync(f), n); assert.ok(fs.statSync(f).size < 1e6, n);
            const m = raw(n); assert.ok(m.source && m.url && m.licence && m.licence_url && /^\d{4}-\d\d-\d\d$/.test(m.built), n); assert.ok(m.rows.length > 0, n);
            assert.ok(man.packs[n] && man.packs[n].rows === m.rows.length && man.packs[n].script === 'scripts/telech-i', `${n} dans le manifeste`);
            assert.ok(/^https:\/\//.test(m.url), `${n} : adresse https`);
        }
        assert.match(raw('ti-navals').licence, /CC0/); assert.match(raw('ti-tour').licence, /Domaine public/); assert.match(raw('ti-contexte').licence, /CC BY-SA 4\.0/);
        assert.ok(!fs.existsSync(path.join(root, 'assets/data/ti-maregraphe.json.gz')) || /PSMSL/.test(raw('ti-maregraphe').source), 'marégraphe : seulement fabriqué sur GitHub, avec sa source');
        assert.ok(rows('ti-ecole').every(r => r.q.length > 40 && /^https:\/\/fr\.wikisource\.org\/wiki\//.test(r.url)), 'chaque texte d’école a sa page');
        assert.ok(rows('ti-chansons').every(r => r.y <= 1900 && /^https:\/\/fr\.wikisource\.org\/wiki\//.test(r.url)), 'chansons de recueils de 1900 au plus tard');
        assert.ok(rows('ti-tour').every(r => /^\d{5}$|^\d[AB]\d{3}$/.test(r.insee) && r.q.length > 10));
    });
    await t('⚓ 🧭 📕 calcul : Jean, cordier → la Corderie royale et les corderies de Brest (25 km) ; Mâcon dans le Tour de la France ; « CORDIER » en 1860', async () => {
        const N = H.worksFor(rows('ti-navals'), JEAN, H.NAVAL_JOB); assert.strictEqual(N.job, true); assert.ok(N.list.some(x => /Corderie royale/.test(x.r.n)), JSON.stringify(N.list.map(x => x.r.n)));
        assert.ok(N.list.some(x => /corderies de Brest/.test(x.r.n)));
        const T2 = H.tourFor(rows('ti-tour'), JEAN); assert.ok(T2.some(x => x.r.commune === 'Mâcon'), JSON.stringify(T2.map(x => x.r.commune)));
        assert.deepStrictEqual(H.tourFor(rows('ti-tour'), {...JEAN, person: {birth: 1700, death: 1760}}), [], 'mort avant 1877 : rien');
        const D = H.dicoFor(rows('ti-dico'), JEAN); assert.ok(D.length && /^CORDIER/.test(D[0].def), JSON.stringify(D.slice(0, 1)));
        assert.ok(H.NAVAL_JOB.test(H.fold('Charpentier de marine')) && H.SUGAR_JOB.test(H.fold('ouvrier sucrier')) && !H.NAVAL_JOB.test('laboureur'));
    });
    await t('🏥 🔒 calcul : Marie, morte à Passy en 1940 → sanatorium du plateau d’Assy ; Paul, gardien de prison → Clairvaux ; Luc (vivant) → rien', async () => {
        const S = H.sanasFor(rows('ti-sanas'), MARIE); assert.ok(S.length && S.every(x => x.km <= 4), JSON.stringify(S.map(x => x.r.n)));
        assert.ok(S.every(x => x.r.from === null || x.r.from <= 1940), 'ouvert avant sa mort');
        assert.deepStrictEqual(H.sanasFor(rows('ti-sanas'), LUC), [], 'vivant (pas de décès) : rien');
        const prisons = [...rows('ti-centrales'), ...H.table(raw('ha-institutions')).filter(r => r.country === 'France' && /prison/.test(r.kinds || ''))];
        const C = H.prisonFor(prisons, PAUL); assert.ok(C.some(x => /Clairvaux/.test(x.r.n)), JSON.stringify(C.slice(0, 3).map(x => x.r.n)));
        assert.deepStrictEqual(H.prisonFor(prisons, {...PAUL, jobs: [{text: 'laboureur'}]}), [], 'la fiche ne parle pas de prison : rien');
        assert.deepStrictEqual(H.prisonFor(prisons, {...PAUL, person: {id: 3, birth: 1830, death: null}, events: [ev('BIRT', 1830, P.clairvaux)]}), [], 'pas décédé : rien');
    });
    await t('🎶 ✏️ 🌊 calcul : Marie, fileuse → « Les fileuses » ; à 12 ans en 1884 → une dictée ; marégraphe : Brest pour Brest, Marseille pour Toulon', async () => {
        const C = H.songsFor(rows('ti-chansons'), MARIE); assert.ok(C.some(r => /fileuse/i.test(r.t)), JSON.stringify(C.map(r => r.t)));
        assert.deepStrictEqual(H.songsFor(rows('ti-chansons'), {...MARIE, jobs: []}), []);
        assert.strictEqual(H.schoolYear(MARIE), 1884); assert.strictEqual(H.schoolYear(LUC), null);
        const st = [{id: 1, name: 'Brest'}, {id: 61, name: 'Marseille'}];
        assert.strictEqual(H.stationFor(st, 48.39, -4.49).id, 1); assert.strictEqual(H.stationFor(st, 43.12, 5.93).id, 61);
        const D = {meta: {stations: [{id: 1, name: 'Brest', lat: 48.38, lon: -4.5}]}, rows: [{st: 1, y: 1865, mm: 6900}, {st: 1, y: 2020, mm: 7180}]};
        const r = H.seaFor(D, H.table(raw('ha-phares')), JEAN); assert.ok(r && r.cm === 28 && r.year === 1865, JSON.stringify(r));
        assert.strictEqual(H.seaFor(D, H.table(raw('ha-phares')), MARIE), null, 'Lyon et Passy : pas au bord de la mer');
        assert.strictEqual(H.safeUrl('javascript:alert(1)'), ''); assert.strictEqual(H.safeUrl('https://a.b/"onx'), '');
    });

    /* ═════════ 2. serveur et écran ═════════ */
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-ti-'));
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4', GENEALOGY_TEST: '1'};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start,occupation) VALUES(1,'Jean','MAZAUD','male','deceased',1,'cordier'),(2,'Marie','LACOMBE','female','deceased',0,'fileuse'),(3,'Paul','DURAND','male','deceased',0,'gardien de prison'),(4,'Luc','MAZAUD','male','living',0,'cordier')");
$pdo->exec("INSERT INTO places(id,name,county,country,latitude,longitude,admin4_code) VALUES(1,'Rochefort','Charente-Maritime','France',45.9422,-0.9589,'17299'),(2,'Brest','Finistère','France',48.3904,-4.4861,'29019'),(3,'Mâcon','Saône-et-Loire','France',46.3069,4.8287,'71270'),(4,'Lyon','Rhône','France',45.758,4.835,'69123'),(5,'Passy','Haute-Savoie','France',45.9236,6.6903,'74208'),(6,'Ville-sous-la-Ferté','Aube','France',48.1206,4.7869,'10412')");
$t = function ($tag) use ($pdo) { $i = (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn(); return $i ?: (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='BIRT' LIMIT 1")->fetchColumn(); };
$ins = $pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,date_text,year,sort_date,place_id) VALUES('person',?,?,?,?,?,?)");
foreach ([[1,'BIRT',1840,1],[1,'RESI',1880,3],[1,'DEAT',1910,2],[2,'BIRT',1872,4],[2,'DEAT',1940,5],[3,'BIRT',1830,6],[3,'DEAT',1900,6],[4,'BIRT',1990,1]] as [$p,$g,$y,$pl]) { $ins->execute([$p,$t($g),(string)$y,$y,(string)$y,$pl]); }
echo json_encode(['ok' => 1]);`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0 || !/"ok"/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const errs = [], outside = [];
    try {
        const ctx = await browser.newContext({viewport: {width: 1440, height: 900}});
        await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => { outside.push(r.request().url()); return r.abort(); }); // pas d'Internet : tout ce qui sortirait est compté
        const p = await ctx.newPage();
        p.on('pageerror', e => errs.push(e.message));
        p.on('console', m => { if (m.type() === 'error' && /Failed to fetch|ti-|telech-i/i.test(m.text())) errs.push(m.text()); });
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_APP?.defaultPersonBlocks, null, {timeout: 30000});
        if (!(await p.evaluate(() => !!window.LCNDA_EXT?.telechI))) { await p.addStyleTag({url: base + 'assets/css/telech-i.css'}); await p.addScriptTag({url: base + 'assets/js/heritage-telech-i.js'}); }
        await p.waitForFunction(() => !!window.LCNDA_EXT?.telechI);
        const into = (fn, arg, opts = {}) => p.evaluate(async ([f, a, o]) => { const h = document.createElement('div'); document.body.appendChild(h); const n = await window.LCNDA_EXT.telechI[f](h, a, {detached: true, ...o}); const r = [n, h.innerHTML, h.textContent]; h.remove(); return r; }, [fn, arg, opts]);

        await t('fiche de Jean MAZAUD : ⚓ la Corderie royale, 🧭 Mâcon dans le Tour de la France, 📕 « CORDIER » ; ↗ source ; ▸ plus ; liens sûrs', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.currentPersonId = 1; A.setModule('personnes'); });
            await p.waitForSelector('[data-ti-person="1"] .ti-row', {timeout: 30000});
            await sleep(500);
            const txt = await p.textContent('[data-ti-person="1"]');
            assert.match(txt, /Son métier touchait aux navires/); assert.match(txt, /Corderie royale/); assert.match(txt, /André et Julien passent à Mâcon/); assert.match(txt, /CORDIER/);
            assert.match(txt, /▸ plus/); assert.match(txt, /↗ source/);
            const html = await p.innerHTML('[data-ti-person="1"]');
            assert.match(html, /target="_blank" rel="noopener noreferrer"/); assert.ok(!/href="(?!https?:)/.test(html), 'seulement des liens http(s)');
            assert.strictEqual(await p.evaluate(() => document.querySelector('[data-ti-person="1"]').closest('section.card').hidden), false);
        });
        await t('Marie LACOMBE : 🏥 sanatorium près du lieu de décès, 🎶 « Les fileuses », ✏️ la dictée de ses 12 ans, 🧭 Lyon ; Paul DURAND : 🔒 Clairvaux et les registres d’écrou', async () => {
            const [n, , txt] = await into('personInto', 2);
            assert.ok(n >= 3, txt); assert.match(txt, /du lieu de son décès \(Passy\)/); assert.match(txt, /fileuses/i); assert.match(txt, /À 12 ans, vers 1884/); assert.match(txt, /Lyon/);
            const [, html, paul] = await into('personInto', 3); assert.match(paul, /Sa fiche parle de prison/); assert.match(paul, /Clairvaux/); assert.match(html, /francearchives\.gouv\.fr/);
        });
        await t('Luc MAZAUD (vivant) et mode consultation : rien sur le sanatorium ni la prison ; rien ne part sur Internet (aucune requête hors de l’ordinateur)', async () => {
            const k = await ctx.newPage(); k.on('pageerror', e => errs.push(e.message));
            await k.goto(base); await k.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.telechI, null, {timeout: 30000});
            await k.waitForLoadState('networkidle').catch(() => {}); await sleep(800);
            const n0 = outside.length;
            const run = (fn, a) => k.evaluate(async ([f, x]) => { const h = document.createElement('div'); document.body.appendChild(h); const n = await window.LCNDA_EXT.telechI[f](h, x, {detached: true}); const t = h.textContent; h.remove(); return [n, t]; }, [fn, a]);
            const [, luc] = await run('personInto', 4); assert.ok(!/sanatorium|prison/i.test(luc), luc);
            await run('personInto', 1);
            const r = await k.evaluate(() => window.LCNDA_APP.api('kiosk_enter', {}, {method: 'POST', body: {password: 'essai-1234'}}).then(() => 'ok').catch(e => e.message));
            assert.ok((await run('personInto', 2))[0] >= 1, 'en mode consultation, la fiche se lit quand même (tout est sur l’ordinateur)');
            await run('placeInto', {id: 1, name: 'Rochefort', lat: 45.9422, lon: -0.9589, insee: '17299'});
            await k.evaluate(() => window.LCNDA_APP.api('kiosk_exit', {}, {method: 'POST', body: {password: 'essai-1234'}}).catch(() => {}));
            assert.deepStrictEqual(outside.slice(n0).filter(u => !/^https:\/\/[a-z]\.?tile\.|^https:\/\/tile\./.test(u)), [], `kiosque : ${r}`);
            assert.ok((await k.evaluate(() => window.LCNDA_EXT.dataSources.filter(d => /^ti/.test(d.id)).every(d => d.online === false))), 'à la demande : rien en ligne');
            await k.close();
        });
        await t('village, monographie, listes, cartes, à la demande, Tout sur', async () => {
            const [n, html, txt] = await into('placeInto', {id: 1, name: 'Rochefort', lat: 45.9422, lon: -0.9589, insee: '17299'});
            assert.ok(n >= 2, txt); assert.match(txt, /Corderie royale/); assert.match(txt, /secours mutuels/); assert.match(html, /francearchives\.gouv\.fr\/fr\/search\?q=/);
            const reg = await p.evaluate(() => { const E = window.LCNDA_EXT; return {mono: E.monographSections.filter(s => /^ti_/.test(s.id)).length, lists: E.dataLists.filter(s => /^ti_/.test(s.id)).map(s => s.id), maps: E.mapLayerSources.filter(s => /^ti_/.test(s.id)).length,
                ds: E.dataSources.filter(s => /^ti/.test(s.id)).length, village: (E.villageSectionDefs || []).some(d => d.id === 'ti_place'), block: (window.LCNDA_APP.defaultPersonBlocks || []).some(b => b[0] === 'telech_i')}; });
            assert.deepStrictEqual(reg.lists, ['ti_navals', 'ti_autos', 'ti_sucreries', 'ti_sanas', 'ti_centrales', 'ti_romains', 'ti_hippodromes', 'ti_maregraphe', 'ti_tour', 'ti_dico', 'ti_ecole', 'ti_chansons']);
            assert.ok(reg.mono === 10 && reg.maps === 8 && reg.ds === 14 && reg.village && reg.block, JSON.stringify(reg));
            const L = await p.evaluate(async () => { const d = window.LCNDA_EXT.dataLists.find(x => x.id === 'ti_tour'); const r = await d.load(); return [r.length, r[0].src]; });
            assert.ok(L[0] > 20); assert.match(L[1], /^https:\/\/fr\.wikisource\.org\/wiki\/Le_Tour_de_la_France_par_deux_enfants\/\d{3}$/);
            const M2 = await p.evaluate(async () => window.LCNDA_EXT.dataLists.find(x => x.id === 'ti_maregraphe').load());
            assert.ok(Array.isArray(M2), 'marégraphe : liste vide tant qu’il n’est pas fabriqué, sans erreur');
            const M = await p.evaluate(async () => (await window.LCNDA_EXT.mapLayerSources.find(x => x.id === 'ti_navals').run({bbox: [-1.2, 45.8, -0.7, 46.1]})).features.map(f => f.label));
            assert.ok(M.some(x => /Corderie royale/.test(x)));
            const mono = await p.evaluate(async () => { const s = window.LCNDA_EXT.monographSections.find(x => x.id === 'ti_tour'); const h = document.createElement('div'); const ok = await s.render({name: 'Mâcon', latitude: 46.3069, longitude: 4.8287, insee: '71270'}, h); return [ok, h.textContent]; });
            assert.ok(mono[0] && /Mâcon/.test(mono[1]));
            const ts = await p.evaluate(() => { const s = window.LCNDA_EXT.dataSources.find(d => d.id === 'tip_ecole'); return !!s; }); assert.ok(ts);
        });
        await t('Réglages → ⚓ : chaque sujet s’éteint (genealogie-telech-i), ↶ Annuler le rallume ; À propos des données (licence, lignes, date) ; éteint → plus rien sur la fiche', async () => {
            await p.evaluate(() => window.LCNDA_EXT.telechI.openSettings());
            await p.waitForSelector('[data-ti-settings-page] [data-ti-tg="navals"]', {timeout: 20000});
            const st = await p.textContent('[data-ti-settings-page]');
            assert.match(st, /CC BY-SA 4\.0/); assert.match(st, /CC0/); assert.match(st, /Domaine public/); assert.match(st, /rien ne part sur Internet/);
            if (!fs.existsSync(path.join(root, 'assets/data/ti-maregraphe.json.gz'))) assert.match(st, /À fabriquer sur GitHub/);
            await p.click('[data-ti-tg="navals"] input');
            assert.strictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-telech-i')).navals), false);
            const [, , txt] = await into('personInto', 1); assert.ok(!/Corderie royale/.test(txt), 'éteint : plus de corderie');
            await p.waitForSelector('.undo-toast button, [data-undo], .toast button', {timeout: 5000}).then(b => b.click()).catch(() => {});
            await sleep(300);
            assert.notStrictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-telech-i') || '{}').navals), false, '↶ Annuler le rallume');
        });
        await t('390 px et thème sombre : le bloc tient dans l’écran (pas de débordement), lisible, rien collé aux bords', async () => {
            const m = await browser.newContext({viewport: {width: 390, height: 844}, colorScheme: 'dark'});
            await m.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => { outside.push(r.request().url()); return r.abort(); });
            const q = await m.newPage(); q.on('pageerror', e => errs.push(e.message));
            await q.goto(base); await q.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.telechI, null, {timeout: 30000});
            await q.waitForLoadState('networkidle').catch(() => {}); await sleep(1500);
            await q.evaluate(async () => { document.documentElement.dataset.theme = 'dark'; const ws = document.getElementById('workspace'); const h = document.createElement('div'); h.id = 'ti-essai'; ws.prepend(h);
                const a = document.createElement('div'), b = document.createElement('div'); h.append(a, b);
                await window.LCNDA_EXT.telechI.placeInto(a, {id: 1, name: 'Rochefort', lat: 45.9422, lon: -0.9589, insee: '17299'}); await window.LCNDA_EXT.telechI.personInto(b, 2);
                h.querySelectorAll('details').forEach(d => { d.open = true; }); h.scrollIntoView(); window.__tiEssai = h; });
            const r = await q.evaluate(() => { const h = window.__tiEssai; if (!h.isConnected) document.getElementById('workspace').prepend(h); const over = [...h.querySelectorAll('*')].filter(e => e.getBoundingClientRect().right > window.innerWidth + 1).map(e => e.className || e.tagName).slice(0, 5);
                const row = h.querySelector('.ti-row').getBoundingClientRect(); const cs = getComputedStyle(h.querySelector('.hist-t p')); return {over, left: row.left, right: window.innerWidth - row.right, color: cs.color, docW: document.documentElement.scrollWidth}; });
            assert.deepStrictEqual(r.over, []); assert.ok(r.left >= 8 && r.right >= 8, JSON.stringify(r)); assert.ok(r.docW <= 391, `largeur ${r.docW}`);
            assert.ok(!/rgb\(0, 0, 0\)/.test(r.color), `texte lisible en sombre : ${r.color}`);
            await m.close();
        });
        await t('aucune erreur JavaScript, aucun « Failed to fetch »', async () => { assert.deepStrictEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill();
        try { fs.rmSync(tmp, {recursive: true, force: true}); } catch (_) {}
    }
    console.log(fails ? `${fails} essai(s) raté(s).` : 'Le pays au travail et à l’école : tout va bien.');
    process.exit(fails ? 1 : 0);
})();
