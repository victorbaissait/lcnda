#!/usr/bin/env node
/* 🌐 Les équivalents d'ailleurs (lot L « téléchargements ») — assets/js/heritage-telech-l.js, scripts/telech-l/*, assets/data/tl-*.json.gz ;
 *  et deux restes : 🚲 les vues du Tour dans « 🏆 Compétitions sportives » (heritage-telech-m.js) ; le récap « À faire » (« dont N utiles
 *  pour tes lieux », « ✨ Nouveau : thème », app-donnees-accueil.js).
 *  1. Node : fichiers livrés (licence, source, date, manifeste, https), calcul (crues de sa vie, homonyme au Congrès, dollar d'autrefois,
 *     adresses sûres : bioguide, Historic England, Wikidata), scripts (licence relue, python3 -I), atelier GitHub, i18n.
 *  2. Serveur et écran (php -S + Playwright, base temporaire) : rien ne part sur Internet (toute requête hors 127.0.0.1 est comptée et
 *     coupée) ; fiche d'une personne décédée (Florence 1966, New York), rien pour une fiche vivante ni confidentielle, consultation sans
 *     liens ; listes (thèmes, crues réunies, monuments réunis), cartes, à la demande ; Réglages (interrupteurs ↶, rayon ↶) ; vues du Tour ;
 *     récap ; 390 px sombre ; aucune erreur JavaScript.
 *  Fiches (noms inventés) : Giulia ROSSI (1900 Florence – 1970 Florence), John SMITH (1890 New York – 1950 New York), Luca ROSSI (vivant, 1990 Florence).
 *   node tests/test-telech-l.js */
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
const L = require('../assets/js/heritage-telech-l.js');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const raw = n => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root, 'assets/data', `${n}.json.gz`))).toString('utf8'));
const shipped = () => fs.readdirSync(path.join(root, 'assets/data')).filter(f => /^tl-.*\.json\.gz$/.test(f)).map(f => f.replace('.json.gz', ''));
const PACKS = ['tl-crues', 'tl-elus', 'tl-prix', 'tl-mesures'];
const P = {flo: {id: 1, name: 'Florence', lat: 43.7696, lon: 11.2558, country: 'Italie'}, ny: {id: 2, name: 'New York', lat: 40.7128, lon: -74.006, country: 'États-Unis'}};
const ev = (tag, year, p) => ({tag, year, date: String(year), place_id: p.id, lat: p.lat, lon: p.lon, place: p.name, country: p.country});
const GIULIA = {ok: true, person: {id: 1, first: 'Giulia', last: 'ROSSI', birth: 1900, death: 1970}, events: [ev('BIRT', 1900, P.flo), ev('DEAT', 1970, P.flo)]};

(async () => {
    /* ═════════ 1. les fichiers, le calcul, les scripts ═════════ */
    await t('fichiers livrés : source, adresse, licence, date ; dans le manifeste (scripts/telech-l) ; https ; tailles sages', async () => {
        const man = JSON.parse(read('assets/data/manifest.json'));
        for (const n of [...new Set([...PACKS, ...shipped()])]) {
            const f = path.join(root, 'assets/data', `${n}.json.gz`); assert.ok(fs.existsSync(f), n); assert.ok(fs.statSync(f).size < 3e6, `${n} : ${fs.statSync(f).size} octets`);
            const m = raw(n); assert.ok(m.source && m.url && m.licence && m.licence_url && /^\d{4}-\d\d-\d\d$/.test(m.built), n);
            assert.ok(Array.isArray(m.rows) && m.rows.length > 0, n);
            assert.ok(man.packs[n] && man.packs[n].rows === m.rows.length && man.packs[n].script === 'scripts/telech-l', `${n} dans le manifeste`);
            assert.ok(/^https:\/\//.test(m.url) && /^https:\/\//.test(m.licence_url), `${n} : adresses https`);
        }
        assert.match(raw('tl-crues').licence, /CC BY 4\.0/); assert.match(raw('tl-elus').licence, /CC0/); assert.match(raw('tl-prix').licence, /PDDL/); assert.match(raw('tl-mesures').licence, /CC0/);
        assert.deepStrictEqual(man.packs['tl-crues'].bbox?.length, 4, 'la zone couverte (récap « utiles pour tes lieux »)'); assert.deepStrictEqual(man.packs['tl-elus'].country, ['US']);
        for (const n of shipped().filter(x => /memoriaux|cimetieres|villages/.test(x))) assert.ok(raw(n).rows.every(r => /^Q\d+$/.test(r[0])), `${n} : des Q de Wikidata`);
    });
    await t('🌊 crues de sa vie (HANZE) : Florence 1966 pour Giulia ROSSI ; rien avant sa naissance ; centre de région ; liste réunie', async () => {
        const rows = L.floodRows(raw('tl-crues')); assert.ok(rows.length > 2000);
        const hits = L.floodsNear(rows, GIULIA, 50); assert.ok(hits.some(x => x.r.year === 1966), JSON.stringify(hits.slice(0, 3).map(x => x.r.date)));
        assert.ok(hits.every(x => x.r.year >= 1900 && x.r.year <= 1970));
        assert.ok(rows.every(r => Number.isFinite(r.lat) && Number.isFinite(r.lon) && r.lat > 25 && r.lat < 72 && r.lon > -32 && r.lon < 45), 'positions en Europe');
        const meuse = rows.find(r => /^Meuse/.test(r.region)); assert.ok(meuse && Math.abs(meuse.lat - 49) < 0.6 && Math.abs(meuse.lon - 5.4) < 0.6, 'centre de la Meuse (LAEA → degrés)');
    });
    await t('🗳 💵 Congrès (homonyme ± 1 an, bioguide sûr, nés il y a plus de 110 ans) ; dollar de 1913 en dollars d’aujourd’hui', async () => {
        const E = L.eluRows(raw('tl-elus')); assert.ok(E.length > 9000 && E.every(r => r.year <= new Date().getFullYear() - 110), 'seulement des vies du passé');
        const lincoln = E.find(r => /^Abraham .*Lincoln$/.test(r.name)); assert.ok(lincoln, 'Abraham Lincoln');
        assert.strictEqual(L.eluHomonyms(E, 'Abraham', 'LINCOLN', 1810).length, 1); assert.strictEqual(L.eluHomonyms(E, 'Abraham', 'LINCOLN', 1850).length, 0); assert.deepStrictEqual(L.eluHomonyms(E, 'A', 'L', null), []);
        assert.strictEqual(L.bioUrl(lincoln.bio), `https://bioguide.congress.gov/search/bio/${lincoln.bio}`); assert.strictEqual(L.bioUrl('javascript:1'), '');
        const C = L.cpiRows(raw('tl-prix')); assert.strictEqual(C[0].year, 1913);
        const w = L.dollarWorth(C, 1, 1913, C[C.length - 1].year); assert.ok(w > 20 && w < 50, String(w)); assert.strictEqual(L.dollarWorth(C, 1, 1850, 2000), null);
        assert.strictEqual(L.nhleUrl('1012345'), 'https://historicengland.org.uk/listing/the-list/list-entry/1012345'); assert.strictEqual(L.nhleUrl('1"><x'), ''); assert.strictEqual(L.wd('Q1'), 'https://www.wikidata.org/wiki/Q1'); assert.strictEqual(L.wd('x'), '');
        assert.strictEqual(L.safeUrl('javascript:alert(1)'), ''); assert.strictEqual(L.past({person: {birth: 1990}, events: []}), false);
    });
    await t('scripts : python3 -I, licence relue (s’arrête sinon), atelier GitHub (licence relue, quoi, cache, manifeste), prénoms des États-Unis (SSA) dans le pack des prénoms', async () => {
        for (const f of fs.readdirSync(path.join(root, 'scripts/telech-l')).filter(x => x.endsWith('.py'))) {
            const r = spawnSync('python3', ['-I', '-m', 'py_compile', path.join(root, 'scripts/telech-l', f)], {encoding: 'utf8'}); assert.strictEqual(r.status, 0, f + r.stderr);
        }
        assert.match(read('scripts/telech-l/build_crues.py'), /sys\.exit\(f'HANZE : la licence/); assert.match(read('scripts/telech-l/build_elus.py'), /CC0 1\.0 Universal public domain dedication/);
        assert.match(read('scripts/telech-l/build_wikidata.py'), /Creative Commons CC0 License/); assert.match(read('scripts/telech-l/build_github_only.py'), /Open Government Licence/);
        const wf = read('.github/workflows/telech-l.yml');
        assert.match(wf, /workflow_dispatch/); assert.match(wf, /if: github\.event_name != 'push'/); assert.match(wf, /python3 -I scripts\/telech-l\/build_github_only\.py/); assert.match(wf, /node scripts\/donnees-manifest\.js/);
        assert.match(wf, /TL_RAW=\$RUNNER_TEMP/);
        const pp = read('scripts/prenoms/build-prenoms.py'); assert.match(pp, /ssa\.gov\/oact\/babynames\/names\.zip/); assert.match(pp, /def us_ok/); assert.match(read('lib/prenoms_pays.php'), /'US' => 'États-Unis'/);
    });
    await t('i18n : telech-l.tsv en 8 langues, i18n-check sans erreur', async () => {
        const tsv = read('assets/i18n/src/telech-l.tsv').split('\n').filter(l => l && !l.startsWith('#'));
        assert.ok(tsv.length > 100); assert.ok(tsv.every(l => l.split(' ¦ ').length === 8), 'fr en es de it pt pl nl');
        const r = spawnSync('node', [path.join(root, 'scripts/i18n-check.js')], {encoding: 'utf8'}); assert.match(r.stdout, / 0 erreur\(s\)/, r.stdout.slice(-400));
    });

    /* ═════════ 2. serveur et écran ═════════ */
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-tl-'));
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    // 📦 la version GitHub « telech-l-donnees » remplacée par un dossier : son sommaire et un petit pack des mines (40 vraies lignes USGS)
    const gpDir = path.join(tmp, 'gp'), MINES = fs.readFileSync(path.join(__dirname, 'fixtures/grands-packs/tl-mines.json.gz'));
    fs.mkdirSync(gpDir, {recursive: true}); fs.writeFileSync(path.join(gpDir, 'tl-mines.json.gz'), MINES);
    const MINES_ROWS = JSON.parse(zlib.gunzipSync(MINES).toString('utf8')).rows;
    fs.writeFileSync(path.join(gpDir, 'telech-l-manifest.json'), JSON.stringify({version: '2026-11-27', packs: {'tl-mines': {name: 'tl-mines.json.gz', size: MINES.length,
        sha256: require('crypto').createHash('sha256').update(MINES).digest('hex'), built: '2026-11-26', rows: MINES_ROWS.length, licence: 'Domaine public (USGS)', source: 'USGS, Mineral Resources Data System (MRDS)'}}}));
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4', GENEALOGY_TEST: '1', LCNDA_TEST_GP_DIR: gpDir};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start,is_private) VALUES(1,'Giulia','ROSSI','female','deceased',1,0),(2,'Abraham','LINCOLN','male','deceased',0,0),(3,'Luca','ROSSI','male','living',0,0),(4,'Anna','ROSSI','female','deceased',0,1)");
$pdo->exec("INSERT INTO places(id,name,country,latitude,longitude) VALUES(1,'Florence','Italie',43.7696,11.2558),(2,'New York','États-Unis',40.7128,-74.006)");
$t = function ($tag) use ($pdo) { $i = (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn(); return $i ?: (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='BIRT' LIMIT 1")->fetchColumn(); };
$ins = $pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,date_text,year,sort_date,place_id) VALUES('person',?,?,?,?,?,?)");
foreach ([[1,'BIRT','1900',1900,'1900',1],[1,'DEAT','1970',1970,'1970',1],[2,'BIRT','12 février 1809',1809,'1809-02-12',2],[2,'DEAT','1865',1865,'1865',2],[3,'BIRT','1990',1990,'1990',1],[4,'BIRT','1900',1900,'1900',1],[4,'DEAT','1966',1966,'1966',1]] as [$p,$g,$dt,$y,$sd,$pl]) { $ins->execute([$p,$t($g),$dt,$y,$sd,$pl]); }
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
        await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => { outside.push(r.request().url()); return r.abort(); });
        const p = await ctx.newPage();
        p.on('pageerror', e => errs.push(e.message));
        p.on('console', m => { if (m.type() === 'error' && /tl-|telech-l|tlx/i.test(m.text())) errs.push(m.text()); });
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_APP?.defaultPersonBlocks && window.LCNDA_EXT?.telechL, null, {timeout: 30000});
        const into = (fn, arg, opts = {}) => p.evaluate(async ([f, a, o]) => { const h = document.createElement('div'); document.body.appendChild(h); const n = await window.LCNDA_EXT.telechL[f](h, a, {detached: true, ...o}); const r = [n, h.innerHTML, h.textContent]; h.remove(); return r; }, [fn, arg, opts]);

        await t('fiche de Giulia ROSSI : 🌊 crues de Florence de son vivant (1966) ; ↗ source ; liens http(s) seulement ; aucune image', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.currentPersonId = 1; A.setModule('personnes'); });
            await p.waitForSelector('[data-tlx-person="1"] .tlx-row', {timeout: 30000}); await sleep(400);
            const txt = await p.textContent('[data-tlx-person="1"]'); assert.match(txt, /crue/); assert.match(txt, /1966/); assert.match(txt, /↗ source/);
            const html = await p.innerHTML('[data-tlx-person="1"]'); assert.ok(!/href="(?!https?:)/.test(html)); assert.ok(!/<img/.test(html));
        });
        await t('Abraham LINCOLN (New York, 1809) : homonyme au Congrès (bioguide) ; le dollar de son temps seulement après 1913 (rien ici)', async () => {
            const [n, h, a] = await into('personInto', 2); assert.ok(n >= 1, a); assert.match(a, /homonyme au Congrès/); assert.match(h, /bioguide\.congress\.gov\/search\/bio\/L000313/);
            assert.ok(!/un dollar valait/.test(a), 'avant 1913 : pas d’indice');
        });
        await t('Luca ROSSI (vivant), Anna ROSSI (confidentielle), consultation : rien ; aucun lien « en lien seulement » en consultation ; rien ne part sur Internet', async () => {
            const n0 = outside.length;
            assert.strictEqual((await into('personInto', 3))[0], 0);
            assert.strictEqual(await p.evaluate(() => window.LCNDA_EXT.personBlocks.telech_l(0, {person: {id: 4, is_private: 1, living_status: 'deceased'}})), '', 'fiche confidentielle : pas de bloc');
            assert.strictEqual(await p.evaluate(() => window.LCNDA_EXT.personBlocks.telech_l(0, {person: {id: 3, living_status: 'living'}})), '', 'fiche vivante : pas de bloc');
            assert.strictEqual((await into('personInto', 1, {private: true}))[0], 0);
            assert.ok(await p.evaluate(() => window.LCNDA_EXT.dataSources.filter(d => /^tlx/.test(d.id)).every(d => d.online === false)));
            assert.deepStrictEqual(outside.slice(n0).filter(u => !/tile/.test(u)), []);
        });
        await t('listes (thèmes ; crues réunies avec HANZE ; monuments réunis avec les monuments aux morts), cartes, village, à la demande', async () => {
            const reg = await p.evaluate(() => { const E = window.LCNDA_EXT; return {lists: E.dataLists.filter(s => /^tl_/.test(s.id)).map(s => [s.id, s.theme, !!s.enabled()]), into: E.dataLists.filter(s => /^tl_/.test(s.id) && s.merge).map(s => [s.id, s.merge.into]),
                themes: (E.dataListThemes || []).map(x => x.id), maps: E.mapLayerSources.filter(s => /^tlx_/.test(s.id)).length, ds: E.dataSources.filter(s => /^tlx/.test(s.id)).length,
                village: (E.villageSectionDefs || []).some(d => d.id === 'tlx_place'), block: (window.LCNDA_APP.defaultPersonBlocks || []).some(b => b[0] === 'telech_l')}; });
            const byId = Object.fromEntries(reg.lists.map(([i, th, en]) => [i, [th, en]]));
            assert.deepStrictEqual(byId.tl_crues, ['eaux', true]); assert.deepStrictEqual(byId.tl_elus, ['pouvoirs', true]); assert.deepStrictEqual(byId.tl_prix, ['prix', true]); assert.deepStrictEqual(byId.tl_mesures, ['prix', true]);
            assert.strictEqual(byId.tl_mines[1], fs.existsSync(path.join(root, 'assets/data/tl-mines.json.gz')), 'fabriqué seulement sur GitHub : caché tant qu’il manque');
            for (const [, th] of reg.lists) assert.ok(!reg.themes.length || reg.themes.includes(th), `thème ${th} connu`);
            assert.deepStrictEqual(Object.fromEntries(reg.into), {tl_crues: 'crues', tl_memoriaux: 'monuments'});
            assert.ok(reg.maps === 4 && reg.ds >= 7 && reg.village && reg.block, JSON.stringify(reg));
            const R = await p.evaluate(async () => { const B = await window.LCNDA_EXT.listesReunies?.build?.('crues'); return B ? [B.rows.length, B.rows.filter(r => (r.sources || []).includes('HANZE') || (r._members || []).some(m => m.src.short === 'HANZE')).length] : null; });
            assert.ok(R && R[1] > 2000, `crues réunies : ${JSON.stringify(R)}`);
            const C = await p.evaluate(async () => { const d = window.LCNDA_EXT.dataLists.find(x => x.id === 'tl_prix'); return (await d.load()).find(r => r.year === 1913); }); assert.ok(C.worth > 20);
            const Mp = await p.evaluate(async () => (await window.LCNDA_EXT.mapLayerSources.find(x => x.id === 'tlx_crues').run({bbox: [10.5, 43.3, 12, 44.2]})).features.map(f => f.label));
            assert.ok(Mp.some(x => /1966/.test(x)), JSON.stringify(Mp.slice(0, 5)));
            const [n, , txt] = await into('placeInto', {id: 1, name: 'Florence', lat: 43.7696, lon: 11.2558, country: 'Italie'}); assert.ok(n >= 1 && /grandes crues/.test(txt), txt);
        });
        await t('Réglages → 🌐 : chaque sujet s’éteint (genealogie-telech-l) ↶ ; rayon des crues 50 → 20 ↶ ; À propos des données ; en lien seulement (sauf consultation)', async () => {
            await p.evaluate(() => window.LCNDA_EXT.telechL.openSettings());
            await p.waitForSelector('[data-tlx-settings-page] [data-tlx-tg="crues"]', {timeout: 20000});
            const st = await p.textContent('[data-tlx-settings-page]');
            assert.match(st, /CC BY 4\.0/); assert.match(st, /CC0/); assert.match(st, /En lien seulement/); assert.match(st, /London Gazette/); assert.match(st, /rien ne part sur Internet/); assert.match(st, /Bagnards \(Queensland\).*CC BY 4\.0/); // fabriqué sur GitHub, livré
            // trop gros pour l'app (plus de 3 Mo) : installés à la demande, avec leur poids (rien n'est demandé à Internet avant le clic)
            assert.match(st, /Mines \(USGS\)\s*📦 Installer \(≈ 3,6 Mo\)/); assert.match(st, /Cimetières\s*📦 Installer \(≈ 4,3 Mo\)/);
            await p.click('[data-tlx-tg="crues"] input');
            assert.strictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-telech-l')).crues), false);
            const [, , off] = await into('personInto', 1); assert.ok(!/1966/.test(off), 'éteint');
            await p.locator('.toast button:has-text("Annuler")').last().click({timeout: 5000}); await sleep(300);
            assert.notStrictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-telech-l') || '{}').crues), false, '↶ rallume');
            await p.waitForSelector('[data-tlx-km="kmc"]'); await p.fill('[data-tlx-km="kmc"]', '20'); await p.dispatchEvent('[data-tlx-km="kmc"]', 'change');
            assert.strictEqual(await p.evaluate(() => window.LCNDA_EXT.telechL.radiusC()), 20);
            await p.locator('.toast:has-text("20 km") button:has-text("Annuler")').last().click({timeout: 5000}); await sleep(300);
            assert.strictEqual(await p.evaluate(() => window.LCNDA_EXT.telechL.radiusC()), 50);
            await p.evaluate(() => { document.body.classList.add('is-kiosk'); window.LCNDA_EXT.telechL.openSettings(); });
            await p.waitForSelector('[data-tlx-settings-page]'); await sleep(500);
            assert.ok(!/En lien seulement/.test(await p.textContent('[data-tlx-settings-page]')), 'consultation : pas de liens');
            await p.evaluate(() => document.body.classList.remove('is-kiosk'));
        });
        await t('📦 les mines installées à la demande : vérifiées, servies à l’adresse habituelle, la liste « ⛏ Mines » apparaît et lit toutes les lignes ; ↶ Annuler', async () => {
            const minesList = () => p.evaluate(async () => { const d = window.LCNDA_EXT.dataLists.find(x => x.id === 'tl_mines'); return d.enabled() ? (await d.load()).map(r => [r.name, r.commodity, r.lat, r.lon]) : null; });
            assert.strictEqual(await minesList(), null, 'pas installé : la liste reste cachée');
            await p.evaluate(() => window.LCNDA_EXT.telechL.openSettings());
            const btn = '[data-tlx-pack="tl-mines"] [data-gp-install="tl-mines"]';
            await p.waitForSelector(btn, {timeout: 20000}); await p.click(btn);
            await p.waitForSelector('[data-tlx-pack="tl-mines"] [data-gp-remove]', {timeout: 20000}); // installé : la page est redessinée
            assert.match(await p.textContent('[data-tlx-pack="tl-mines"]'), new RegExp(`installé.*${MINES_ROWS.length}.*Domaine public \\(USGS\\)`));
            assert.ok(fs.existsSync(path.join(tmp, 'grands-packs/tl-mines.json.gz')) && !fs.existsSync(path.join(root, 'assets/data/tl-mines.json.gz')), 'dans le dossier des données, pas dans l’app');
            await p.waitForFunction(() => window.LCNDA_EXT.dataLists.find(x => x.id === 'tl_mines').enabled(), null, {timeout: 20000});
            const L = await minesList();
            assert.deepStrictEqual(L, MINES_ROWS.map(r => [r[0], r[3], r[1], r[2]]), 'chaque ligne lue telle quelle (nom, minerai, position)');
            await p.locator('.ui-toast, .toast').filter({hasText: 'installé'}).last().locator('button:has-text("Annuler")').click();
            await p.waitForSelector(btn, {timeout: 20000}); // ↶ fini : de nouveau à installer
            assert.ok(!fs.existsSync(path.join(tmp, 'grands-packs/tl-mines.json.gz')), '↶ Annuler : retiré');
            await p.waitForFunction(() => !window.LCNDA_EXT.dataLists.find(x => x.id === 'tl_mines').enabled(), null, {timeout: 20000});
        });
        await t('🚲 « 🏆 Compétitions sportives » : la pastille « Tour de France » allumée propose Éditions · Étapes · 🗺 Carte (la liste du Tour), éteinte non', async () => {
            await p.evaluate(() => { const E = window.LCNDA_EXT.dataListsEngine; E.open('reunie_competitions'); });
            await p.waitForSelector('.ld-page[data-ld-page="reunie_competitions"] [data-ld-vchip]', {timeout: 60000});
            assert.strictEqual(await p.$('[data-tsx-tourviews]'), null, 'sans pastille : pas de vues du Tour');
            await p.locator('[data-ld-vchip*="Tour de France"]').first().click();
            await p.waitForSelector('[data-tsx-tourviews] [data-tsx-tv="etapes"]', {timeout: 30000});
            assert.deepStrictEqual(await p.$$eval('[data-tsx-tourviews] [data-tsx-tv]', b => b.map(x => x.dataset.tsxTv)), ['editions', 'etapes', 'map']);
            await p.click('[data-tsx-tourviews] [data-tsx-tv="etapes"]');
            await p.waitForSelector('.ld-page[data-ld-page="ts_tour"]', {timeout: 30000});
            await p.waitForFunction(() => window.LCNDA_EXT.dataListsEngine.page()?.state().dview === 'etapes', null, {timeout: 20000});
        });
        await t('récap « À faire » : « dont 1 utiles pour tes lieux » (couverture connue d’une liste pas installée), ✨ « Nouveau : thème » avec sa date', async () => {
            await p.evaluate(() => {
                window.LCNDA_EXT.dataLists.push({id: 'essai_tl_cover', icon: '🧪', label: 'Liste d’essai couvrant Florence', theme: 'eaux', group: 'Le lieu', source: 'essai', cover: {bbox: [11, 43.5, 11.5, 44]}, installed: () => false, load: async () => [], fields: [{key: 'x', label: 'x'}]});
                window.LCNDA_EXT.dataListsEngine.sync();
                const ids = (window.LCNDA_EXT.dataListThemes || []).map(x => x.id).filter(x => x !== 'sport');
                localStorage.setItem('genealogie-donnees-themes-vus', JSON.stringify(Object.fromEntries(ids.map(i => [i, 0]))));
                window.LCNDA_EXT.dataHome._st.view = 'recap'; window.LCNDA_EXT.dataHome.resetHighlights?.(); window.LCNDA_EXT.dataHome.resetStats();
                const A = window.LCNDA_APP; A.state.listType = 'donnees'; A.setModule('listes');
            });
            await p.waitForFunction(() => /utiles pour tes lieux/.test(document.querySelector('[data-dr-todo]')?.textContent || ''), null, {timeout: 40000}).catch(async e => {
                const dbg = await p.evaluate(async () => { const S = await window.LCNDA_EXT.dataHome.stats(); const LF = window.LCNDA_EXT.listesFamille; await LF?.ready?.(); return {todo: document.querySelector('[data-dr-todo]')?.textContent, n: document.querySelectorAll('[data-dr-todo]').length, S: {missing: S.missing, coverKnown: S.coverKnown, useful: S.useful}, places: (LF?.data?.()?.places || []).slice(0, 3)}; });
                throw new Error(e.message + ' ' + JSON.stringify(dbg)); });
            const todo = await p.textContent('[data-dr-todo]');
            assert.match(todo, /dont 1 utiles pour tes lieux : Liste d’essai couvrant Florence/); assert.match(todo, /✨ Nouveau : 🏆 Sport/);
            assert.ok(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-donnees-themes-vus')).sport > 0));
        });
        await t('390 px et thème sombre : les blocs tiennent dans l’écran, lisibles', async () => {
            const m = await browser.newContext({viewport: {width: 390, height: 844}, colorScheme: 'dark'});
            await m.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => { outside.push(r.request().url()); return r.abort(); });
            const q = await m.newPage(); q.on('pageerror', e => errs.push(e.message));
            await q.goto(base, {timeout: 90000}); await q.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.telechL, null, {timeout: 60000});
            await q.waitForLoadState('networkidle').catch(() => {}); await sleep(1200);
            await q.evaluate(async () => { document.documentElement.dataset.theme = 'dark'; const ws = document.getElementById('workspace'); const h = document.createElement('div'); h.id = 'tl-essai'; ws.prepend(h);
                const a = document.createElement('div'), b = document.createElement('div'); h.append(a, b);
                await window.LCNDA_EXT.telechL.placeInto(a, {id: 1, name: 'Florence', lat: 43.7696, lon: 11.2558, country: 'Italie'}); await window.LCNDA_EXT.telechL.personInto(b, 1);
                h.querySelectorAll('details').forEach(d => { d.open = true; }); window.__tl = h; });
            const r = await q.evaluate(() => { const h = window.__tl; if (!h.isConnected) document.getElementById('workspace').prepend(h); const over = [...h.querySelectorAll('*')].filter(e => e.getBoundingClientRect().right > window.innerWidth + 1).map(e => e.className || e.tagName).slice(0, 5);
                const row = h.querySelector('.tlx-row').getBoundingClientRect(); const cs = getComputedStyle(h.querySelector('.hist-t p')); return {over, left: row.left, right: window.innerWidth - row.right, color: cs.color, docW: document.documentElement.scrollWidth}; });
            assert.deepStrictEqual(r.over, []); assert.ok(r.left >= 8 && r.right >= 8, JSON.stringify(r)); assert.ok(r.docW <= 391, `largeur ${r.docW}`); assert.ok(!/rgb\(0, 0, 0\)/.test(r.color));
            await m.close();
        });
        await t('aucune erreur JavaScript ; rien de ce lot n’est parti sur Internet', async () => { assert.deepStrictEqual(errs, []);
            assert.deepStrictEqual(outside.filter(u => /zenodo|wikidata|bioguide|congress|bls\.gov|historicengland|usgs|ordnancesurvey|qld\.gov|thegazette|ssa\.gov/.test(u)), []); });
    } finally {
        await browser.close(); proc.kill();
        try { fs.rmSync(tmp, {recursive: true, force: true}); } catch (_) {}
    }
    console.log(fails ? `${fails} essai(s) raté(s).` : 'Les équivalents d’ailleurs : tout va bien.');
    process.exit(fails ? 1 : 0);
})();
