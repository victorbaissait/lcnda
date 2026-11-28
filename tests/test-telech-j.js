#!/usr/bin/env node
/* 🌍 Partir et nommer (lot J « téléchargements ») — assets/js/heritage-telech-j.js, scripts/telech-j/*, assets/data/tj-*.json.gz.
 *  1. Node : les fichiers livrés (licence, source, date, dans le manifeste), les cyclones (Guadeloupe 1928, la Réunion), les noms
 *     d'autrefois (« Presbourg » → Bratislava, « Breslau » → Wrocław, « Lutetia » → Paris), la Louisiane (paroisse, Acadiane), le
 *     Wurtemberg (Oberamt), la traversée, Saint-Domingue, un homonyme seulement pour une personne décédée, liens sûrs.
 *  2. Serveur et écran (php -S + Playwright, base temporaire) : rien ne part sur Internet (toute requête hors 127.0.0.1 est comptée et
 *     coupée), ni pour une fiche vivante ni en consultation (pas de lien de carte, pas de comparaison de noms) ; fiche, village, listes
 *     (thèmes, liste réunie « anciens_noms »), cartes, à la demande, Réglages (interrupteurs ↶, rayon ↶), 390 px et thème sombre,
 *     aucune erreur JavaScript.
 *  Fiches (noms inventés) : Léonce BAPTISTE (1880 Pointe-à-Pitre – 1950 Pointe-à-Pitre), Odile THIBODEAUX (1870 Lafayette, Louisiane –
 *  1940), Karl WEBER (1850 Pressburg/Bratislava – 1920 Ulm), Jean LEROUX (1820 Le Havre – 1890 New York), Paul ROUSSEL (vivant, 1990).
 *   node tests/test-telech-j.js */
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
const H = require('../assets/js/heritage-telech-j.js');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const has = n => fs.existsSync(path.join(root, 'assets/data', `${n}.json.gz`));
const raw = n => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root, 'assets/data', `${n}.json.gz`))).toString('utf8'));
const rows = n => (has(n) ? H.table(raw(n)) : []);
const P = {pap: {id: 1, name: 'Pointe-à-Pitre', country: 'Guadeloupe', lat: 16.2411, lon: -61.5331}, laf: {id: 2, name: 'Lafayette, Louisiana', country: 'États-Unis', lat: 30.2241, lon: -92.0198},
    bra: {id: 3, name: 'Bratislava', country: 'Slovaquie', lat: 48.1486, lon: 17.1077}, ulm: {id: 4, name: 'Ulm', country: 'Allemagne', lat: 48.4011, lon: 9.9876},
    havre: {id: 5, name: 'Le Havre', country: 'France', lat: 49.4944, lon: 0.1079}, ny: {id: 6, name: 'New York', country: 'États-Unis', lat: 40.7128, lon: -74.0060},
    cap: {id: 7, name: 'Cap-Français, Saint-Domingue', country: 'Haïti', lat: 19.7594, lon: -72.2006}};
const ev = (tag, year, p) => ({tag, year, place_id: p.id, lat: p.lat, lon: p.lon, place: p.name, country: p.country});
const LEONCE = {ok: true, person: {id: 1, first: 'Léonce', last: 'BAPTISTE', gender: 'male', birth: 1880, death: 1950}, jobs: [], events: [ev('BIRT', 1880, P.pap), ev('RESI', 1928, P.pap), ev('DEAT', 1950, P.pap)]};
const ODILE = {ok: true, person: {id: 2, first: 'Odile', last: 'THIBODEAUX', gender: 'female', birth: 1870, death: 1940}, jobs: [], events: [ev('BIRT', 1870, P.laf), ev('DEAT', 1940, P.laf)]};
const KARL = {ok: true, person: {id: 3, first: 'Karl', last: 'WEBER', gender: 'male', birth: 1850, death: 1920}, jobs: [], events: [ev('BIRT', 1850, P.bra), ev('DEAT', 1920, P.ulm)]};
const JEAN = {ok: true, person: {id: 4, first: 'Jean', last: 'LEROUX', gender: 'male', birth: 1820, death: 1890}, jobs: [{text: 'matelot'}], events: [ev('BIRT', 1820, P.havre), ev('MARR', 1845, P.havre), ev('DEAT', 1890, P.ny)]};
const PACKS = ['tj-cyclones', 'tj-pleiades', 'tj-noms', 'tj-fusions', 'tj-villages', 'tj-cajuns', 'tj-charcot', 'tj-oberamt'];
const wd = q => `https://www.wikidata.org/wiki/${q}`;
const gaz = () => [
    ...rows('tj-noms').map(r => ({name: r.name, now: r.now, from: r.from, to: r.to, lat: r.lat, lon: r.lon, q: r.q, src: 'Wikidata', url: wd(r.q)})),
    ...rows('tj-fusions').map(r => ({name: r.name, now: r.succ, from: r.from, to: r.to, lat: r.lat, lon: r.lon, q: r.sq, src: 'Wikidata', url: wd(r.q)})),
    ...rows('tj-pleiades').map(r => ({name: r.name, now: '', ancient: r.place, from: r.from, to: r.to, lat: r.lat, lon: r.lon, q: '', src: 'Pleiades', url: `https://pleiades.stoa.org/places/${r.id}`}))];

(async () => {
    /* ═════════ 1. les fichiers et le calcul ═════════ */
    await t('fichiers livrés : source, adresse, licence et date ; dans le manifeste (scripts/telech-j) ; liens https', async () => {
        const man = JSON.parse(fs.readFileSync(path.join(root, 'assets/data/manifest.json'), 'utf8'));
        const present = PACKS.filter(has); assert.ok(present.length >= 4, `paquets présents : ${present}`);
        for (const n of present) {
            const f = path.join(root, 'assets/data', `${n}.json.gz`); assert.ok(fs.statSync(f).size < 3e6, n);
            const m = raw(n); assert.ok(m.source && m.url && m.licence && m.licence_url && /^\d{4}-\d\d-\d\d$/.test(m.built), n); assert.ok(m.rows.length > 0, n);
            assert.ok(man.packs[n] && man.packs[n].rows === m.rows.length && man.packs[n].script === 'scripts/telech-j', `${n} dans le manifeste`);
            assert.ok(/^https:\/\//.test(m.url) && /^https:\/\//.test(m.licence_url), `${n} : adresses https`);
        }
        assert.match(raw('tj-pleiades').licence, /CC BY 3\.0/); assert.match(raw('tj-cyclones').licence, /publiques/); assert.match(raw('tj-cyclones').credit, /10\.25921\/82ty-9e16/);
        for (const n of ['tj-noms', 'tj-fusions', 'tj-cajuns', 'tj-charcot', 'tj-oberamt']) if (has(n)) assert.match(raw(n).licence, /CC0/, n);
        for (const r of rows('tj-villages')) assert.match(r.url, /^https:\/\/fr\.wikipedia\.org\/wiki\//);
        for (const r of rows('tj-oberamt')) assert.ok(!r.ws || /^https:\/\/de\.wikisource\.org\//.test(r.ws));
    });
    await t('🌀 cyclones : 1928 à Pointe-à-Pitre, la Réunion ; seulement de son vivant ; catégories', async () => {
        const S = rows('tj-cyclones'); assert.ok(S.length > 1000, `${S.length} tempêtes`);
        const g28 = H.stormsNear(S, P.pap.lat, P.pap.lon, 100, 1928, 1928); assert.ok(g28.some(x => x.s.season === 1928 && x.km < 100), JSON.stringify(g28.slice(0, 2).map(x => [x.s.name, x.km])));
        const re = H.stormsNear(S, -20.88, 55.45, 100); assert.ok(re.length > 20 && re.some(x => /DINA|Dina/.test(x.s.name)), `${re.length} à la Réunion`);
        const life = H.stormsOfLife(S, LEONCE, 100); assert.ok(life.length > 0 && life.every(x => Number(x.t.slice(0, 4)) >= 1880 && Number(x.t.slice(0, 4)) <= 1950));
        assert.strictEqual(H.category(140), 5); assert.strictEqual(H.category(70), 1); assert.strictEqual(H.category(40), 0);
        assert.deepStrictEqual(H.stormsOfLife(S, KARL, 100), [], 'en Europe : aucun');
    });
    await t('🏷 noms d’autrefois : « Presbourg » → Bratislava, « Breslau » → Wrocław, « Lutetia » → Paris (Pleiades) ; clé de la liste réunie', async () => {
        const G = gaz();
        const lut = H.searchNames(G, 'Lutetia'); assert.ok(lut.length && Math.abs(lut[0].lat - 48.85) < 0.1, JSON.stringify(lut[0]?.hits?.[0]));
        if (has('tj-noms')) {
            const pr = H.searchNames(G, 'Presbourg'); assert.ok(pr.some(g => /Bratislava/.test(g.now)), JSON.stringify(pr.map(g => g.now)));
            const br = H.searchNames(G, 'Breslau'); assert.ok(br.some(g => /Wroc/.test(g.now)), JSON.stringify(br.map(g => g.now)));
            assert.ok(pr.find(g => /Bratislava/.test(g.now)).names.length >= 2, 'plusieurs noms pour Bratislava');
        }
        assert.strictEqual(H.nameKey('Preßburg', 48.14, 17.1), H.nameKey('Pressburg', 48.2, 17.2)); assert.notStrictEqual(H.nameKey('Paris', 48.85, 2.35), H.nameKey('Paris', 33.66, -95.55));
        assert.deepStrictEqual(H.searchNames(G, 'x'), []);
        const at = H.namesAt(G, 44.8378, -0.5792, 3); assert.ok(at.some(r => r.name === 'Burdigala'), 'Bordeaux : Burdigala');
    });
    await t('⚜️ 📘 🌊 ⛓ Louisiane (Lafayette, Acadiane), Oberamt Ulm, la traversée Le Havre → New York, Saint-Domingue ; homonyme', async () => {
        const C = rows('tj-cajuns'); if (C.length) { const p = H.parishOf(C, {name: 'Lafayette, Louisiana', country: 'États-Unis', lat: P.laf.lat, lon: P.laf.lon}); assert.ok(p && /Lafayette/.test(p.r.n) && p.r.acadiana === 1, JSON.stringify(p)); assert.strictEqual(C.length, 64); assert.strictEqual(C.filter(r => r.acadiana).length, 22); }
        assert.strictEqual(H.parishOf(C, {name: 'Tulle', country: 'France', lat: 45.27, lon: 1.77}), null);
        const O = rows('tj-oberamt'); if (O.length) { const x = H.oberamtOf(O, P.ulm.lat, P.ulm.lon); assert.ok(x && /Ulm/.test(x.r.n), JSON.stringify(x)); assert.strictEqual(H.oberamtOf(O, 48.85, 2.35), null); }
        const c = H.crossing(JEAN); assert.ok(c && c.out && c.to.name === 'New York' && c.year === 1890, JSON.stringify(c));
        assert.strictEqual(H.crossing(KARL), null);
        const m = H.memory({...JEAN, events: [ev('BIRT', 1760, P.cap)]}); assert.ok(m && m.sd, 'Saint-Domingue avant 1804');
        const mp = H.memory({...JEAN, person: {...JEAN.person, birth: 1760, death: 1820}}); assert.ok(mp && mp.port && mp.port.name === 'Le Havre', 'matelot au Havre, 1760-1820');
        assert.strictEqual(H.memory(KARL), null);
        const CH = rows('tj-charcot'); if (CH.length) { const r = CH[0], [first, ...rest] = r.n.split(' '); assert.ok(H.homonyms(CH, {person: {first, last: rest.join(' ')}}).length >= 1, r.n); }
        assert.deepStrictEqual(H.homonyms(CH, {person: {first: 'Zzz', last: 'Qqq'}}), []);
        assert.ok(H.countriesOf([{name: 'Dublin', country: 'Irlande', lat: 53.35, lon: -6.26}]).includes('ie')); assert.ok(H.countriesOf([{name: 'Québec', country: 'Canada', lat: 46.81, lon: -71.21}]).includes('ca'));
        assert.deepStrictEqual(H.countriesOf([{name: 'Tulle', country: 'France', lat: 45.27, lon: 1.77}]), []);
        assert.strictEqual(H.safeUrl('javascript:alert(1)'), ''); assert.strictEqual(H.safeUrl('https://a.b/"onx'), '');
        assert.strictEqual(H.past({person: {birth: 1990, death: null}, events: []}), false); assert.strictEqual(H.past(KARL), true);
    });

    /* ═════════ 2. serveur et écran ═════════ */
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-tj-'));
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4', GENEALOGY_TEST: '1'};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start,occupation) VALUES(1,'Léonce','BAPTISTE','male','deceased',1,''),(2,'Odile','THIBODEAUX','female','deceased',0,''),(3,'Karl','WEBER','male','deceased',0,''),(4,'Jean','LEROUX','male','deceased',0,'matelot'),(5,'Paul','ROUSSEL','male','living',0,'')");
$pdo->exec("INSERT INTO places(id,name,county,country,latitude,longitude) VALUES(1,'Pointe-à-Pitre','Guadeloupe','Guadeloupe',16.2411,-61.5331),(2,'Lafayette, Louisiana','Lafayette','États-Unis',30.2241,-92.0198),(3,'Bratislava','','Slovaquie',48.1486,17.1077),(4,'Ulm','','Allemagne',48.4011,9.9876),(5,'Le Havre','Seine-Maritime','France',49.4944,0.1079),(6,'New York','','États-Unis',40.7128,-74.0060)");
$t = function ($tag) use ($pdo) { $i = (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn(); return $i ?: (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='BIRT' LIMIT 1")->fetchColumn(); };
$ins = $pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,date_text,year,sort_date,place_id) VALUES('person',?,?,?,?,?,?)");
foreach ([[1,'BIRT','1880',1880,'1880',1],[1,'RESI','1928',1928,'1928',1],[1,'DEAT','1950',1950,'1950',1],[2,'BIRT','1870',1870,'1870',2],[2,'DEAT','1940',1940,'1940',2],[3,'BIRT','1850',1850,'1850',3],[3,'DEAT','1920',1920,'1920',4],
          [4,'BIRT','1820',1820,'1820',5],[4,'DEAT','1890',1890,'1890',6],[5,'BIRT','1990',1990,'1990',1]] as [$p,$g,$dt,$y,$sd,$pl]) { $ins->execute([$p,$t($g),$dt,$y,$sd,$pl]); }
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
        p.on('console', m => { if (m.type() === 'error' && /Failed to fetch|tj-|telech-j/i.test(m.text())) errs.push(m.text()); });
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_APP?.defaultPersonBlocks && window.LCNDA_EXT?.telechJ, null, {timeout: 30000});
        const into = (fn, arg, opts = {}) => p.evaluate(async ([f, a, o]) => { const h = document.createElement('div'); document.body.appendChild(h); const n = await window.LCNDA_EXT.telechJ[f](h, a, {detached: true, ...o}); const r = [n, h.innerHTML, h.textContent]; h.remove(); return r; }, [fn, arg, opts]);

        await t('fiche de Léonce BAPTISTE (Pointe-à-Pitre) : 🌀 le cyclone de 1928 ; ↗ source ; liens sûrs ; bloc sur la fiche', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.currentPersonId = 1; A.setModule('personnes'); });
            await p.waitForSelector('[data-tj-person="1"] .tj-row', {timeout: 30000});
            await sleep(400);
            const txt = await p.textContent('[data-tj-person="1"]');
            assert.match(txt, /cyclone/); assert.match(txt, /↗ source/);
            const [, html, all] = await into('personInto', 1, {parts: ['cyclones'], force: true}); assert.match(all, /1928/);
            assert.match(html, /target="_blank" rel="noopener noreferrer"/); assert.ok(!/href="(?!https?:)/.test(html), 'seulement des liens http(s)');
        });
        await t('Odile (Lafayette) : paroisse en Acadiane ; Karl : Pressburg, Oberamt Ulm, registres en lien ; Jean : la traversée (ICOADS, CLIWOC), le port du Havre (lien sobre)', async () => {
            const [n2, , o] = await into('personInto', 2); assert.ok(n2 >= 1, o); if (has('tj-cajuns')) assert.match(o, /Acadiane/);
            const [, kh, k] = await into('personInto', 3); if (has('tj-noms')) assert.match(k, /Pressburg|Pozsony|Presbourg/); if (has('tj-oberamt')) assert.match(k, /Oberamt/);
            assert.match(kh, /openhistoricalmap\.org\/#map=12\//, 'lien OpenHistoricalMap hors consultation');
            const [, , j] = await into('personInto', 4); assert.match(j, /traversé la mer/); assert.match(j, /ICOADS/); assert.match(j, /CLIWOC/); assert.match(j, /ne dit pas qu’il y a pris part/);
        });
        await t('Paul ROUSSEL (vivant), fiche confidentielle et mode consultation : rien, ni lien de carte ni homonyme ; rien ne part sur Internet', async () => {
            const k = await ctx.newPage(); k.on('pageerror', e => errs.push(e.message));
            await k.goto(base); await k.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.telechJ, null, {timeout: 30000});
            await k.waitForLoadState('networkidle').catch(() => {}); await sleep(800);
            const n0 = outside.length;
            const run = (fn, a, o = {}) => k.evaluate(async ([f, x, oo]) => { const h = document.createElement('div'); document.body.appendChild(h); const n = await window.LCNDA_EXT.telechJ[f](h, x, {detached: true, ...oo}); const t = h.innerHTML; h.remove(); return [n, t]; }, [fn, a, o]);
            const [nl, paul] = await run('personInto', 5); assert.strictEqual(nl, 0, paul);
            const [np] = await run('personInto', 3, {private: true}); assert.strictEqual(np, 0, 'fiche confidentielle : rien');
            await k.evaluate(() => document.body.classList.add('is-kiosk'));
            const [, kk] = await run('personInto', 3); assert.ok(!/openhistoricalmap/.test(kk), 'consultation : pas de lien de carte');
            const [, pl] = await run('placeInto', {id: 3, name: 'Bratislava', lat: 48.1486, lon: 17.1077}); assert.ok(!/openhistoricalmap/.test(pl));
            await k.evaluate(() => { window.LCNDA_GUEST = true; document.body.classList.remove('is-kiosk'); });
            const [, g] = await run('personInto', 3); assert.ok(!/openhistoricalmap/.test(g), 'invité du réseau local : pas de lien de carte');
            assert.deepStrictEqual(outside.slice(n0).filter(u => !/^https:\/\/[a-z]\.?tile\.|^https:\/\/tile\./.test(u)), []);
            assert.ok(await k.evaluate(() => window.LCNDA_EXT.dataSources.filter(d => /^tj/.test(d.id)).every(d => d.online === false)), 'à la demande : rien en ligne');
            await k.close();
        });
        await t('village : Pointe-à-Pitre (cyclones), Bordeaux (Burdigala) ; monographie, listes (thèmes, liste réunie « anciens_noms »), cartes, à la demande', async () => {
            const [n, , txt] = await into('placeInto', {id: 1, name: 'Pointe-à-Pitre', lat: 16.2411, lon: -61.5331}); assert.ok(n >= 1, txt); assert.match(txt, /cyclones et tempêtes tropicales/);
            const [, , bx] = await into('placeInto', {id: 9, name: 'Bordeaux', lat: 44.8378, lon: -0.5792}); assert.match(bx, /Burdigala/);
            const reg = await p.evaluate(() => { const E = window.LCNDA_EXT; return {lists: E.dataLists.filter(s => /^tj_/.test(s.id)).map(s => [s.id, s.theme]), merge: (E.dataListMerges || []).filter(m => m.id === 'anciens_noms'),
                into: E.dataLists.filter(s => s.merge?.into === 'anciens_noms').map(s => [s.id, s.merge.rank]), mono: E.monographSections.filter(s => /^tj_/.test(s.id)).length, maps: E.mapLayerSources.filter(s => /^tj_/.test(s.id)).length,
                ds: E.dataSources.filter(s => /^tj/.test(s.id)).length, village: (E.villageSectionDefs || []).some(d => d.id === 'tj_place'), block: (window.LCNDA_APP.defaultPersonBlocks || []).some(b => b[0] === 'telech_j')}; });
            assert.deepStrictEqual(reg.lists, [['tj_noms', 'lieux'], ['tj_fusions', 'lieux'], ['tj_pleiades', 'lieux'], ['tj_cyclones', 'ciel'], ['tj_villages', 'lieux'], ['tj_cajuns', 'lieux'], ['tj_charcot', 'personnes'], ['tj_oberamt', 'livres']]);
            assert.strictEqual(reg.merge.length, 1, 'une seule liste réunie « anciens_noms »'); assert.strictEqual(reg.merge[0].theme, 'lieux');
            assert.deepStrictEqual(reg.into, [['tj_noms', 5], ['tj_fusions', 5], ['tj_pleiades', 4]]);
            assert.ok(reg.mono === 5 && reg.maps === 6 && reg.ds >= 9 && reg.village && reg.block, JSON.stringify(reg));
            const srcs = await p.evaluate(() => { const M = window.LCNDA_EXT.dataListMerges.find(m => m.id === 'anciens_noms'); return M.sources ? M.sources.map(s => [s.list, s.rank, s.row({name: 'Preßburg', old: 'Preßburg', lat: 48.14, lon: 17.1, from: 1500, to: 1919, gov: 'object_123', url: 'https://www.wikidata.org/wiki/Q1780'}).k]) : []; });
            assert.ok(srcs.some(s => s[0] === 'gov_noms' && s[1] === 2) && srcs.some(s => s[0] === 'wikidata_anciens_noms'), JSON.stringify(srcs));
            const L = await p.evaluate(async () => { const d = window.LCNDA_EXT.dataLists.find(x => x.id === 'tj_pleiades'); const r = await d.load(); const lu = r.find(x => x.name === 'Lutetia'); return [r.length, lu, d.merge.row(lu)]; });
            assert.ok(L[0] > 10000); assert.match(L[1].src, /^https:\/\/pleiades\.stoa\.org\/places\/\d+$/); assert.match(L[2].k, /^lutetia\|/);
            const R = await p.evaluate(async () => { const LR = window.LCNDA_EXT.listesReunies; if (!LR?.build) return null; const b = await LR.build('anciens_noms'); const lu = b.rows.find(r => r.name === 'Lutetia'); return {n: b.rows.length, lu: lu && {sources: lu.sources, url: lu.url}, stats: b.stats}; });
            if (R) { assert.ok(R.n > 10000 && R.lu && R.lu.sources.includes('Pleiades'), JSON.stringify(R).slice(0, 300)); }
            const M = await p.evaluate(async () => (await window.LCNDA_EXT.mapLayerSources.find(x => x.id === 'tj_pleiades').run({bbox: [2.2, 48.8, 2.5, 48.9]})).features.map(f => f.label));
            assert.ok(M.some(x => /Lutetia/.test(x)));
            const on = await p.evaluate(async () => { const s = window.LCNDA_EXT.dataSources.find(d => d.id === 'tj_cyclones_lieu'); const h = document.createElement('div'); await s.run({place: {id: 1, name: 'Pointe-à-Pitre', latitude: 16.2411, longitude: -61.5331}}, h); return h.textContent; });
            assert.match(on, /cyclones/);
        });
        await t('Réglages → 🌍 : chaque partie s’éteint (genealogie-telech-j), ↶ Annuler ; le rayon des cyclones (100 → 50 km) ↶ ; À propos des données ; En lien seulement', async () => {
            await p.evaluate(() => window.LCNDA_EXT.telechJ.openSettings());
            await p.waitForSelector('[data-tj-settings-page] [data-tj-tg="cyclones"]', {timeout: 20000});
            const st = await p.textContent('[data-tj-settings-page]');
            assert.match(st, /CC BY 3\.0/); assert.match(st, /En lien seulement/); assert.match(st, /SlaveVoyages/); assert.match(st, /CLIWOC/); assert.match(st, /rien ne part sur Internet/);
            await p.click('[data-tj-tg="cyclones"] input');
            assert.strictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-telech-j')).cyclones), false);
            const [n0] = await into('personInto', 1, {parts: ['cyclones']}); assert.strictEqual(n0, 0, 'éteint : plus de cyclones');
            await p.locator('.toast button:has-text("Annuler"), .undo-toast button').last().click({timeout: 5000}).catch(() => {});
            await sleep(300);
            assert.notStrictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-telech-j') || '{}').cyclones), false, '↶ Annuler le rallume');
            await p.waitForSelector('[data-tj-km]'); await p.selectOption('[data-tj-km]', '50');
            assert.strictEqual(await p.evaluate(() => window.LCNDA_EXT.telechJ.radius()), 50);
            await p.locator('.toast:has-text("50 km") button:has-text("Annuler")').last().click({timeout: 5000});
            await sleep(300);
            assert.strictEqual(await p.evaluate(() => window.LCNDA_EXT.telechJ.radius()), 100, '↶ remet 100 km');
        });
        await t('390 px et thème sombre : les blocs tiennent dans l’écran, rien collé aux bords, lisible', async () => {
            const m = await browser.newContext({viewport: {width: 390, height: 844}, colorScheme: 'dark'});
            await m.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => { outside.push(r.request().url()); return r.abort(); });
            const q = await m.newPage(); q.on('pageerror', e => errs.push(e.message));
            await q.goto(base, {timeout: 90000}); await q.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.telechJ, null, {timeout: 60000});
            await q.waitForLoadState('networkidle').catch(() => {}); await sleep(1500);
            await q.evaluate(async () => { document.documentElement.dataset.theme = 'dark'; const ws = document.getElementById('workspace'); const h = document.createElement('div'); h.id = 'tj-essai'; ws.prepend(h);
                const a = document.createElement('div'), b = document.createElement('div'); h.append(a, b);
                await window.LCNDA_EXT.telechJ.placeInto(a, {id: 1, name: 'Pointe-à-Pitre', lat: 16.2411, lon: -61.5331}); await window.LCNDA_EXT.telechJ.personInto(b, 3);
                h.querySelectorAll('details').forEach(d => { d.open = true; }); h.scrollIntoView(); window.__tjEssai = h; });
            const r = await q.evaluate(() => { const h = window.__tjEssai; if (!h.isConnected) document.getElementById('workspace').prepend(h); const over = [...h.querySelectorAll('*')].filter(e => e.getBoundingClientRect().right > window.innerWidth + 1).map(e => e.className || e.tagName).slice(0, 5);
                const row = h.querySelector('.tj-row').getBoundingClientRect(); const cs = getComputedStyle(h.querySelector('.hist-t p')); return {over, left: row.left, right: window.innerWidth - row.right, color: cs.color, docW: document.documentElement.scrollWidth}; });
            assert.deepStrictEqual(r.over, []); assert.ok(r.left >= 8 && r.right >= 8, JSON.stringify(r)); assert.ok(r.docW <= 391, `largeur ${r.docW}`);
            assert.ok(!/rgb\(0, 0, 0\)/.test(r.color), `texte lisible en sombre : ${r.color}`);
            await m.close();
        });
        await t('aucune erreur JavaScript, aucun « Failed to fetch »', async () => { assert.deepStrictEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill();
        try { fs.rmSync(tmp, {recursive: true, force: true}); } catch (_) {}
    }
    console.log(fails ? `${fails} essai(s) raté(s).` : 'Partir et nommer : tout va bien.');
    process.exit(fails ? 1 : 0);
})();
