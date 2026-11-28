#!/usr/bin/env node
/* 🏰 Grands noms et remparts (lot G « téléchargements ») — assets/js/heritage-telech-g.js, scripts/telech-g/*, assets/data/tg-*.json.gz.
 *  1. Node : les fichiers livrés (licence, source, date, petits, dans le manifeste ; les Compagnons tous décédés) et le calcul
 *     (homonyme probable ou simple, né dans la même commune, volumes du Lloyd's Register, adresses sûres).
 *  2. Serveur et écran (php -S + Playwright, base temporaire) : rien ne part sur Internet (toute requête hors 127.0.0.1 est comptée et
 *     coupée), ni pour une fiche vivante ou confidentielle ni en mode consultation ; fiche, village, listes (noms reliés à l'arbre),
 *     cartes, Réglages (interrupteur ↶), 390 px et thème sombre, aucune erreur JavaScript, aucun « Failed to fetch ».
 *  Fiches (noms inventés) : Jean MAZAUD (1640 Saint-Martin-de-Ré – 1700, soldat), Marie LACOMBE (1850 Paris – 1920), Paul DURAND
 *  (1755 Brest – 1830, marin, à Paris en 1789), Luc MAZAUD (vivant, 1990 Paris, marin), Pierre DURAND (1755 Paris – 1820, confidentiel).
 *   node tests/test-telech-g.js */
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
const H = require('../assets/js/heritage-telech-g.js');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const raw = n => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root, 'assets/data', `${n}.json.gz`))).toString('utf8'));
const rows = n => H.table(raw(n));
const P = {smr: {id: 1, name: 'Saint-Martin-de-Ré', lat: 46.20306, lon: -1.36722}, paris: {id: 2, name: 'Paris', lat: 48.8534, lon: 2.3488}, brest: {id: 3, name: 'Brest', lat: 48.3904, lon: -4.4861}};
const ev = (tag, year, p) => ({tag, year, place_id: p.id, lat: p.lat, lon: p.lon, place: p.name, country: 'France'});
const JEAN = {ok: true, person: {id: 1, first: 'Jean', last: 'MAZAUD', gender: 'male', birth: 1640, death: 1700}, jobs: [{text: 'soldat'}], events: [ev('BIRT', 1640, P.smr), ev('DEAT', 1700, P.smr)]};
const PAUL = {ok: true, person: {id: 3, first: 'Paul', last: 'DURAND', gender: 'male', birth: 1755, death: 1830}, jobs: [{text: 'marin'}], events: [ev('BIRT', 1755, P.brest), ev('RESI', 1789, P.paris), ev('DEAT', 1830, P.brest)]};
const PACKS = ['tg-filles', 'tg-carignan', 'tg-deputes', 'tg-compagnons', 'tg-aviateurs', 'tg-lloyd', 'tg-forts', 'tg-poudres', 'tg-semaphores', 'tg-lazarets', 'tg-wallace'];

(async () => {
    /* ═════════ 1. les fichiers et le calcul ═════════ */
    await t('fichiers livrés : présents, petits, avec source, adresse, licence et date ; dans le manifeste (script scripts/telech-g)', async () => {
        const man = JSON.parse(fs.readFileSync(path.join(root, 'assets/data/manifest.json'), 'utf8'));
        for (const n of PACKS) {
            const f = path.join(root, 'assets/data', `${n}.json.gz`); assert.ok(fs.existsSync(f), n); assert.ok(fs.statSync(f).size < 2e6, n);
            const m = raw(n); assert.ok(m.source && m.url && m.licence && m.licence_url && /^\d{4}-\d\d-\d\d$/.test(m.built), n); assert.ok(m.rows.length > 0, n);
            assert.ok(man.packs[n] && man.packs[n].rows === m.rows.length && man.packs[n].script === 'scripts/telech-g', `${n} dans le manifeste`);
            assert.ok(/^https:\/\//.test(m.url), `${n} : adresse https`);
        }
        assert.match(raw('tg-compagnons').licence, /CC0/); assert.match(raw('tg-aviateurs').licence, /CC BY-SA 4\.0/);
        assert.ok(rows('tg-compagnons').every(r => r.d !== null), 'Compagnons : seulement des personnes décédées');
        for (const n of ['tg-filles', 'tg-carignan', 'tg-deputes', 'tg-compagnons']) assert.ok(rows(n).every(r => r.d !== null || (r.b !== null && r.b < 1900)), `${n} : aucune personne qui pourrait être en vie`);
        assert.ok(rows('tg-aviateurs').length >= 600 && rows('tg-aviateurs')[0].no === '1', 'les brevets 1909-1911');
        assert.ok(raw('tg-filles').provinces.length >= 8 && raw('tg-carignan').ships.length >= 5, 'provinces des Filles du Roy, navires de 1665');
        assert.ok(rows('tg-lloyd').every(r => /^[A-Za-z0-9_.-]+$/.test(r.id) && r.y >= 1764 && r.y <= 1900));
        assert.ok(rows('tg-deputes').length >= 800, 'les députés');
    });
    await t('👥 calcul : homonyme probable (même nom, même année) ou simple (même nom), sur l’ordinateur ; né dans la même commune', async () => {
        const list = [{q: 'Q1', n: 'Jeanne Lacombe', fam: 'Lacombe', giv: 'Jeanne', b: 1648, d: 1700, lat: 49.44, lon: 1.10}, {q: 'Q2', n: 'Jeanne de La Combe', fam: '', giv: 'Jeanne', b: null, d: 1710, lat: null, lon: null},
            {q: 'Q3', n: 'Marie Lacombe', fam: 'Lacombe', giv: 'Marie', b: 1650, d: 1720, lat: null, lon: null}, {q: 'Q4', n: 'Jeanne Lacombe', fam: 'Lacombe', giv: 'Jeanne', b: 1700, d: 1760, lat: null, lon: null}];
        const life = {ok: true, person: {first: 'Jeanne', last: 'LACOMBE', gender: 'female', birth: 1648, death: 1702}, events: [{tag: 'BIRT', year: 1648, lat: 49.443, lon: 1.1}]};
        const M = H.nameMatches(list, life, {window: [1663, 1673], ageMin: 12, ageMax: 45});
        assert.deepStrictEqual(M.map(x => [x.r.q, x.level]), [['Q1', 'probable'], ['Q2', 'possible']], JSON.stringify(M.map(x => x.r.q)));
        assert.deepStrictEqual(M[0].why.sort(), ['place', 'year']);
        assert.deepStrictEqual(H.nameMatches(list, {...life, person: {...life.person, birth: 1700, death: 1760}}, {window: [1663, 1673]}), [], 'pas en vie pendant la période : rien');
        assert.strictEqual(H.surKey('de La Combe'), H.surKey('LACOMBE'));
        const B = H.bornNear(rows('tg-carignan'), JEAN); assert.ok(B.some(x => /Migner/.test(x.r.n)), JSON.stringify(B.map(x => x.r.n)));
        assert.deepStrictEqual(H.bornNear(rows('tg-carignan'), {...JEAN, person: {...JEAN.person, birth: 1800, death: 1880}, events: [ev('BIRT', 1800, P.smr)]}), [], 'pas de la même époque');
    });
    await t('🏰 ⚓ calcul : la citadelle près de Jean (soldat) ; les volumes du Lloyd’s Register de Paul (marin) ; adresses sûres', async () => {
        const F = H.nearLife(rows('tg-forts'), JEAN, 30); assert.ok(F.some(x => /Saint-Martin-de-Ré/.test(x.r.n)), JSON.stringify(F.map(x => x.r.n)));
        assert.ok(H.ARMY_JOB.test(H.fold('Soldat')) && H.SEA_JOB.test(H.fold('marin')) && !H.SEA_JOB.test('laboureur'));
        const V = H.lloydVolumes(rows('tg-lloyd'), 1770, 1830); assert.ok(V.length >= 4 && V.length <= 6 && V.every(r => r.y >= 1770 && r.y <= 1830));
        assert.strictEqual(H.lloydNearest(rows('tg-lloyd'), 1839).y, 1839);
        assert.strictEqual(H.safeUrl('javascript:alert(1)'), ''); assert.strictEqual(H.safeUrl('https://a.b/c'), 'https://a.b/c'); assert.strictEqual(H.safeUrl('https://a.b/"onx'), '');
        assert.strictEqual(H.safeId('HECROS1839'), 'HECROS1839'); assert.strictEqual(H.safeId('../x"y'), '');
    });

    /* ═════════ 2. serveur et écran ═════════ */
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-tg-'));
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4', GENEALOGY_TEST: '1'};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start,occupation,is_private) VALUES(1,'Jean','MAZAUD','male','deceased',1,'soldat',0),(2,'Marie','LACOMBE','female','deceased',0,'',0),(3,'Paul','DURAND','male','deceased',0,'marin',0),(4,'Luc','MAZAUD','male','living',0,'marin',0),(5,'Pierre','DURAND','male','deceased',0,'marin',1)");
$pdo->exec("INSERT INTO places(id,name,county,country,latitude,longitude,admin4_code) VALUES(1,'Saint-Martin-de-Ré','Charente-Maritime','France',46.20306,-1.36722,'17369'),(2,'Paris','Paris','France',48.8534,2.3488,'75056'),(3,'Brest','Finistère','France',48.3904,-4.4861,'29019')");
$t = function ($tag) use ($pdo) { $i = (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn(); return $i ?: (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='BIRT' LIMIT 1")->fetchColumn(); };
$ins = $pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,date_text,year,sort_date,place_id) VALUES('person',?,?,?,?,?,?)");
foreach ([[1,'BIRT',1640,1],[1,'DEAT',1700,1],[2,'BIRT',1850,2],[2,'DEAT',1920,2],[3,'BIRT',1755,3],[3,'RESI',1789,2],[3,'DEAT',1830,3],[4,'BIRT',1990,2],[5,'BIRT',1755,2],[5,'DEAT',1820,2]] as [$p,$g,$y,$pl]) { $ins->execute([$p,$t($g),(string)$y,$y,(string)$y,$pl]); }
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
        p.on('console', m => { if (m.type() === 'error' && /Failed to fetch|tg-|telech-g/i.test(m.text())) errs.push(m.text()); });
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_APP?.defaultPersonBlocks, null, {timeout: 30000});
        if (!(await p.evaluate(() => !!window.LCNDA_EXT?.telechG))) { await p.addStyleTag({url: base + 'assets/css/telech-g.css'}); await p.addScriptTag({url: base + 'assets/js/heritage-telech-g.js'}); }
        await p.waitForFunction(() => !!window.LCNDA_EXT?.telechG);
        const into = (fn, arg, opts = {}) => p.evaluate(async ([f, a, o]) => { const h = document.createElement('div'); document.body.appendChild(h); const n = await window.LCNDA_EXT.telechG[f](h, a, {detached: true, ...o}); const r = [n, h.innerHTML, h.textContent]; h.remove(); return r; }, [fn, arg, opts]);

        await t('fiche de Jean MAZAUD : 🏰 la citadelle de Saint-Martin-de-Ré (soldat), ⚔️ un soldat de Carignan né dans sa commune ; ↗ source ; ▸ plus ; liens sûrs', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.currentPersonId = 1; A.setModule('personnes'); });
            await p.waitForSelector('[data-tg-person="1"] .tg-row', {timeout: 30000});
            await sleep(500);
            const txt = await p.textContent('[data-tg-person="1"]');
            assert.match(txt, /Il était militaire/); assert.match(txt, /Saint-Martin-de-Ré/); assert.match(txt, /Migner/);
            assert.match(txt, /▸ plus/); assert.match(txt, /↗ source/);
            const html = await p.innerHTML('[data-tg-person="1"]');
            assert.match(html, /target="_blank" rel="noopener noreferrer"/); assert.ok(!/href="(?!https?:)/.test(html), 'seulement des liens http(s)');
            assert.strictEqual(await p.evaluate(() => document.querySelector('[data-tg-person="1"]').closest('section.card').hidden), false);
        });
        await t('Paul DURAND (marin, Paris en 1789) : 📋 Chercher ce nom (guerre d’Amérique, Bastille), 🚢 les volumes du Lloyd’s Register, 📡 sémaphores ; Marie LACOMBE : ⛲ fontaines Wallace', async () => {
            const [n, html, txt] = await into('personInto', 3);
            assert.ok(n >= 3, txt); assert.match(html, /data-tg-copy="combattants"/); assert.match(html, /data-tg-copy="bastille"/);
            assert.match(txt, /Lloyd’s Register/); assert.match(html, /https:\/\/archive\.org\/details\/[A-Za-z0-9_.-]+/); assert.match(txt, /[Ss]émaphore/);
            assert.ok(!/data-tg-copy="poilus"/.test(html), 'pas l’âge de la Grande Guerre');
            const [, , marie] = await into('personInto', 2); assert.match(marie, /fontaine[s]? Wallace/i); assert.ok(!/Chercher ce nom/.test(marie));
        });
        await t('Luc MAZAUD (vivant), Pierre DURAND (confidentiel), mode consultation : pas de « Chercher ce nom », pas de comparaison de noms, rien ne part sur Internet', async () => {
            const k = await ctx.newPage(); k.on('pageerror', e => errs.push(e.message));
            await k.goto(base); await k.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.telechG, null, {timeout: 30000});
            await k.waitForLoadState('networkidle').catch(() => {}); await sleep(800);
            const n0 = outside.length;
            const run = (a, o) => k.evaluate(async ([x, oo]) => { const h = document.createElement('div'); document.body.appendChild(h); await window.LCNDA_EXT.telechG.personInto(h, x, {detached: true, ...oo}); const r = h.innerHTML; h.remove(); return r; }, [a, o]);
            const luc = await run(4, {private: true}); assert.ok(!/data-tg-copy|homonyme/.test(luc), 'vivant : rien');
            const pierre = await run(5, {private: true}); assert.ok(!/data-tg-copy|homonyme/.test(pierre), 'confidentiel : rien');
            // le bloc de la fiche pose lui-même « confidentiel » pour une fiche vivante
            const blk = await k.evaluate(() => window.LCNDA_EXT.personBlocks.telech_g(0, {person: {id: 4, living_status: 'living'}}));
            assert.match(blk, /data-tg-priv="1"/);
            await k.evaluate(() => window.LCNDA_APP.api('kiosk_enter', {}, {method: 'POST', body: {password: 'essai-1234'}}).catch(() => {}));
            await k.evaluate(() => document.body.classList.add('is-kiosk'));
            const paulK = await run(3, {}); assert.ok(!/data-tg-copy/.test(paulK), 'consultation : pas de « Chercher ce nom »'); assert.match(paulK, /tg-row/, 'en consultation, le reste se lit (tout est sur l’ordinateur)');
            await k.evaluate(() => document.body.classList.remove('is-kiosk'));
            await k.evaluate(() => window.LCNDA_APP.api('kiosk_exit', {}, {method: 'POST', body: {password: 'essai-1234'}}).catch(() => {}));
            assert.deepStrictEqual(outside.slice(n0).filter(u => !/^https:\/\/[a-z]\.?tile\.|^https:\/\/tile\./.test(u)), []);
            assert.ok((await k.evaluate(() => window.LCNDA_EXT.dataSources.filter(d => /^tg/.test(d.id)).every(d => d.online === false))), 'à la demande : rien en ligne');
            await k.close();
        });
        await t('village, monographie, listes (noms reliés à l’arbre), cartes, à la demande, Où chercher', async () => {
            const [n, , txt] = await into('placeInto', {id: 1, name: 'Saint-Martin-de-Ré', lat: 46.20306, lon: -1.36722, insee: '17369'});
            assert.ok(n >= 2, txt); assert.match(txt, /Forts et fortifications à moins de 15 km/); assert.match(txt, /Nés à Saint-Martin-de-Ré ou tout près/);
            const reg = await p.evaluate(() => { const E = window.LCNDA_EXT; return {mono: E.monographSections.filter(s => /^tg_/.test(s.id)).length, lists: E.dataLists.filter(s => /^tg_/.test(s.id)).map(s => s.id), maps: E.mapLayerSources.filter(s => /^tg_/.test(s.id)).length,
                ds: E.dataSources.filter(s => /^tg/.test(s.id)).length, village: (E.villageSectionDefs || []).some(d => d.id === 'tg_place'), block: (window.LCNDA_APP.defaultPersonBlocks || []).some(b => b[0] === 'telech_g'),
                person: E.dataLists.find(s => s.id === 'tg_deputes').fields.some(f => f.key === 'name' && f.person)}; });
            assert.deepStrictEqual(reg.lists, ['tg_filles', 'tg_carignan', 'tg_deputes', 'tg_compagnons', 'tg_aviateurs', 'tg_forts', 'tg_poudres', 'tg_semaphores', 'tg_lazarets', 'tg_wallace', 'tg_lloyd']);
            assert.ok(reg.mono === 6 && reg.maps === 7 && reg.ds >= 10 && reg.village && reg.block && reg.person, JSON.stringify(reg));
            const L = await p.evaluate(async () => { const d = window.LCNDA_EXT.dataLists.find(x => x.id === 'tg_aviateurs'); const r = await d.load(); return [r.length, r[0].name, r[0].src]; });
            assert.ok(L[0] > 600); assert.match(L[2], /^https:\/\/en\.wikipedia\.org\/wiki\//);
            const O = await p.evaluate(async () => window.LCNDA_EXT.dataLists.find(x => x.id === 'tg_forts').load());
            assert.ok(O.length > 50 && O.every(r => /^https:\/\//.test(r.src)), 'forts : Wikidata (OpenStreetMap pas encore fabriqué) sans erreur');
            const M = await p.evaluate(async () => (await window.LCNDA_EXT.mapLayerSources.find(x => x.id === 'tg_wallace').run({bbox: [2.2, 48.8, 2.5, 48.9]})).features.length);
            assert.ok(M > 10);
            const Y = await p.evaluate(async () => { const S = window.LCNDA_EXT.dataSources.find(s => s.id === 'tgy_lloyd'); const h = document.createElement('div'); await S.run({year: 1839}, h); return h.innerHTML; });
            assert.match(Y, /archive\.org\/details\/HECROS1839/);
            const mono = await p.evaluate(async () => { const s = window.LCNDA_EXT.monographSections.find(x => x.id === 'tg_wallace'); const h = document.createElement('div'); const ok = await s.render({name: 'Paris', latitude: 48.8534, longitude: 2.3488, insee: '75056'}, h); return [ok, h.textContent]; });
            assert.ok(mono[0] && /Wallace/.test(mono[1]));
        });
        await t('Réglages → 🏰 : chaque sujet s’éteint (genealogie-telech-g), ↶ Annuler le rallume ; À propos des données ; éteint → plus rien sur la fiche', async () => {
            await p.evaluate(() => window.LCNDA_EXT.telechG.openSettings());
            await p.waitForSelector('[data-tg-settings-page] [data-tg-tg="forts"]', {timeout: 20000});
            const st = await p.textContent('[data-tg-settings-page]');
            assert.match(st, /CC BY-SA 4\.0/); assert.match(st, /CC0/); assert.match(st, /Forts \(OpenStreetMap\).*ODbL 1\.0 — © les contributeurs d’OpenStreetMap/); assert.match(st, /rien ne part sur Internet/); assert.match(st, /octroi/); // OpenStreetMap fabriqué sur GitHub (avant : « À fabriquer sur GitHub »)
            await p.click('[data-tg-tg="forts"] input');
            assert.strictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-telech-g')).forts), false);
            const [, , txt] = await into('personInto', 1); assert.ok(!/Il était militaire/.test(txt), 'éteint : plus de forts');
            await p.waitForSelector('.undo-toast button, [data-undo], .toast button', {timeout: 5000}).then(b => b.click()).catch(() => {});
            await sleep(300);
            assert.notStrictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-telech-g') || '{}').forts), false, '↶ Annuler le rallume');
        });
        await t('390 px et thème sombre : le bloc tient dans l’écran (pas de débordement), lisible, rien collé aux bords', async () => {
            const m = await browser.newContext({viewport: {width: 390, height: 844}, colorScheme: 'dark'});
            await m.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => { outside.push(r.request().url()); return r.abort(); });
            const q = await m.newPage(); q.on('pageerror', e => errs.push(e.message));
            await q.goto(base); await q.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.telechG, null, {timeout: 30000});
            await q.waitForLoadState('networkidle').catch(() => {}); await sleep(1500);
            await q.evaluate(async () => { document.documentElement.dataset.theme = 'dark'; const ws = document.getElementById('workspace'); const h = document.createElement('div'); h.id = 'tg-essai'; ws.prepend(h);
                const a = document.createElement('div'), b = document.createElement('div'); h.append(a, b);
                await window.LCNDA_EXT.telechG.placeInto(a, {id: 1, name: 'Saint-Martin-de-Ré', lat: 46.20306, lon: -1.36722, insee: '17369'}); await window.LCNDA_EXT.telechG.personInto(b, 3);
                h.querySelectorAll('details').forEach(d => { d.open = true; }); h.scrollIntoView(); window.__tgEssai = h; });
            const r = await q.evaluate(() => { const h = window.__tgEssai; if (!h.isConnected) document.getElementById('workspace').prepend(h); const over = [...h.querySelectorAll('*')].filter(e => e.getBoundingClientRect().right > window.innerWidth + 1).map(e => e.className || e.tagName).slice(0, 5);
                const row = h.querySelector('.tg-row').getBoundingClientRect(); const cs = getComputedStyle(h.querySelector('.hist-t p')); return {over, left: row.left, right: window.innerWidth - row.right, color: cs.color, docW: document.documentElement.scrollWidth}; });
            assert.deepStrictEqual(r.over, []); assert.ok(r.left >= 8 && r.right >= 8, JSON.stringify(r)); assert.ok(r.docW <= 391, `largeur ${r.docW}`);
            assert.ok(!/rgb\(0, 0, 0\)/.test(r.color), `texte lisible en sombre : ${r.color}`);
            await m.close();
        });
        await t('aucune erreur JavaScript, aucun « Failed to fetch »', async () => { assert.deepStrictEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill();
        try { fs.rmSync(tmp, {recursive: true, force: true}); } catch (_) {}
    }
    console.log(fails ? `${fails} essai(s) raté(s).` : 'Grands noms et remparts : tout va bien.');
    process.exit(fails ? 1 : 0);
})();
