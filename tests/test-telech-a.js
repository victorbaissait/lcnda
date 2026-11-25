#!/usr/bin/env node
/* 🗺 Voir le village tel qu'il était (téléchargements, lot A) — assets/js/heritage-telech-a.js, lib/telech_a.php, assets/css/telech-a.css.
 *  1. Node : le récit du paysage (CORINE 1990 → 2018), le rideau qui parle à une vie, les adresses des tuiles.
 *  2. PHP : la couleur → le poste CORINE ; une tuile vectorielle (MVT) lue et dessinée en SVG.
 *  3. Serveur et écran (php -S + Playwright, base temporaire) : rien ne part sur Internet (GENEALOGY_TEST=1 + LCNDA_TEST_TELECHA_DIR).
 *     Les tuiles CORINE sont VRAIES : enregistrées le 2026-11-25 autour d'Honfleur (Calvados) — tests/fixtures/telech-a.json.gz.
 *     Le pack OpenStreetMap hors ligne est un petit MBTiles fabriqué ici (une tuile : la mer, une route, « Honfleur »).
 *  Fiches : Jean MAZAUD (1840–1915, Honfleur), Paul DURAND (vivant, Honfleur).
 *   node tests/test-telech-a.js */
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const zlib = require('zlib');
const crypto = require('crypto');
const {spawn, spawnSync} = require('child_process');
let chromium; try { ({chromium} = require('playwright')); } catch (_) { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); }
const root = path.join(__dirname, '..');
const {findPhp, phpRuntimeArgs, devBundledPhp} = require('../electron/php-server.js');
const H = require('../assets/js/heritage-telech-a.js');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const phpPath = findPhp([devBundledPhp()]) || 'php';
const php = (code, env = {}) => spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], {cwd: root, encoding: 'utf8', env: {...process.env, GENEALOGY_SKIP_REFERENCE: '1', ...env}});

/* ── une petite tuile vectorielle (Mapbox Vector Tile 2) : la mer à gauche, une route, le nom « Honfleur » ── */
const varint = n => { const o = []; n = Number(n); while (n > 127) { o.push((n & 127) | 128); n = Math.floor(n / 128); } o.push(n); return Buffer.from(o); };
const zz = n => (n << 1) ^ (n >> 31);
const fld = (f, wt, payload) => Buffer.concat([varint(f * 8 + wt), wt === 2 ? Buffer.concat([varint(payload.length), payload]) : varint(payload)]);
const str = (f, s) => fld(f, 2, Buffer.from(s, 'utf8'));
const packed = (f, arr) => fld(f, 2, Buffer.concat(arr.map(varint)));
function geom(type, pts) {
    const out = []; let x = 0, y = 0;
    out.push(1 | (1 << 3), zz(pts[0][0] - x), zz(pts[0][1] - y)); x = pts[0][0]; y = pts[0][1];
    if (type === 1) return out;
    out.push(2 | ((pts.length - 1) << 3)); for (const [a, b] of pts.slice(1)) { out.push(zz(a - x), zz(b - y)); x = a; y = b; }
    if (type === 3) out.push(7 | (1 << 3));
    return out;
}
function layer(name, feats) {
    const keys = [], vals = [], fb = [];
    for (const f of feats) {
        const tags = [];
        for (const [k, v] of Object.entries(f.props)) { let ki = keys.indexOf(k); if (ki < 0) { keys.push(k); ki = keys.length - 1; } let vi = vals.indexOf(v); if (vi < 0) { vals.push(v); vi = vals.length - 1; } tags.push(ki, vi); }
        fb.push(fld(2, 2, Buffer.concat([packed(2, tags), fld(3, 0, f.type), packed(4, geom(f.type, f.pts))])));
    }
    return fld(3, 2, Buffer.concat([fld(15, 0, 2), str(1, name), ...fb, ...keys.map(k => str(3, k)), ...vals.map(v => fld(4, 2, str(1, v))), fld(5, 0, 4096)]));
}
const TILE = Buffer.concat([
    layer('water', [{type: 3, props: {class: 'ocean'}, pts: [[0, 0], [1500, 0], [1500, 4096], [0, 4096]]}]),
    layer('transportation', [{type: 2, props: {class: 'primary'}, pts: [[1600, 200], [3900, 3900]]}]),
    layer('place', [{type: 1, props: {class: 'town', name: 'Honfleur'}, pts: [[2600, 2000]]}])]);
const tileOf = (lat, lon, z) => { const n = 2 ** z, r = lat * Math.PI / 180; return [Math.floor((lon + 180) / 360 * n), Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n)]; };
const [TX, TY] = tileOf(49.419, 0.233, 14);

(async () => {
    /* ═════════ 1. le calcul ═════════ */
    await t('🌾 le récit du paysage : groupes de plus de 3 %, changements de 3 points et plus, marais, mer, carrière', async () => {
        const R = {ok: true, coast: true, years: {'1990': {groups: {pres: 40, champs: 30, urbain: 10, bois: 18, eau: 2}, wet_ha: 30, quarry_ha: 0}, '2018': {groups: {pres: 25, champs: 31, urbain: 24, bois: 18, eau: 2}, wet_ha: 8, quarry_ha: 12}}};
        const S = H.landStory(R);
        assert.deepStrictEqual(S.before.map(x => x[0]), ['pres', 'champs', 'bois', 'urbain']);
        assert.deepStrictEqual(S.changes.map(x => x[0]), ['pres', 'urbain']); assert.strictEqual(S.stable, false);
        assert.deepStrictEqual(S.marsh, {a: 30, b: 8}); assert.strictEqual(S.coast, true); assert.strictEqual(S.quarry, 12);
        assert.strictEqual(H.landStory({ok: true, empty: true}), null); assert.strictEqual(H.landStory({ok: false}), null);
        assert.strictEqual(H.landStory({ok: true, years: {'1990': {groups: {pres: 50, bois: 50}}, '2018': {groups: {pres: 49, bois: 51}}}}).stable, true);
    });
    await t('↔ le rideau qui parle à une vie : avant 1920 → la carte de 1850 ; après → les photos de 1950', async () => {
        assert.strictEqual(H.pairFor(1840, 1915), 'etatmajor'); assert.strictEqual(H.pairFor(1925, 2001), 'avion'); assert.strictEqual(H.pairFor(null, null), 'avion');
        assert.strictEqual(H.pairFor(1890, 1960), 'avion', 'il a connu les deux : la photo de 1950');
    });
    await t('tuiles : CORINE avec son style officiel, État-major, la mosaïque couvre le cadre', async () => {
        assert.match(H.wmts('clc1990', 14, 1, 2), /LAYER=LANDCOVER\.CLC90_FR&STYLE=CORINE%20Land%20Cover%20-%20France%20m%C3%A9tropolitaine&TILEMATRIXSET=PM&TILEMATRIX=14&TILECOL=1&TILEROW=2/);
        assert.match(H.wmts('etatmajor', 15, 1, 2), /LAYER=GEOGRAPHICALGRIDSYSTEMS\.ETATMAJOR40&STYLE=normal&.*FORMAT=image%2Fjpeg/);
        const m = H.mosaic(49.419, 0.233, 16, 520, 300); assert.ok(m.some(x => x.left <= 0) && m.some(x => x.left + 256 >= 520) && m.some(x => x.top <= 0) && m.some(x => x.top + 256 >= 300));
        assert.ok(H.RE_CARRIER.test('carrier') && H.RE_CARRIER.test('ardoisier') && !H.RE_CARRIER.test('boulanger'));
    });

    /* ═════════ 2. PHP ═════════ */
    await t('PHP : couleurs → postes CORINE (palette officielle, bords lissés écartés) ; une tuile MVT lue et dessinée en SVG (zoom 14 et agrandie au 15)', async () => {
        const r = php(String.raw`require 'lib/paths.php'; require 'lib/bootstrap.php'; require 'lib/telech_a.php';
$L = ta_mvt_decode(base64_decode('${TILE.toString('base64')}'));
$s14 = ta_osm_svg($L, 1, 0, 0, 14); $s15 = ta_osm_svg($L, 2, 0, 1, 15);
echo json_encode([ta_clc_code(0xe6, 0x00, 0x4d, 0), ta_clc_code(0x00, 0xa6, 0x00, 0), ta_clc_code(0xe6, 0xf2, 0xff, 0), ta_clc_code(0x55, 0x55, 0x55, 0), ta_clc_code(0xff, 0, 0, 120),
  array_keys($L), $L['place']['features'][0]['props'], count($L['water']['features'][0]['geom'][0]), str_contains($s14, '#aad3df'), str_contains($s14, '>Honfleur<'), str_contains($s14, '#fcd6a4'), str_contains($s15, '>Honfleur<'),
  ta_clc_groups([112 => 10, 231 => 30, 311 => 60])]);`, {GENEALOGY_DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-ta-php-'))});
        const j = JSON.parse((r.stdout || '').trim().split('\n').pop() || 'null'); assert.ok(j, r.stderr || r.stdout);
        assert.deepStrictEqual(j.slice(0, 5), [111, 312, 523, 0, 0]);
        assert.deepStrictEqual(j[5], ['water', 'transportation', 'place']); assert.deepStrictEqual(j[6], {class: 'town', name: 'Honfleur'}); assert.strictEqual(j[7], 5);
        assert.deepStrictEqual(j.slice(8, 12), [true, true, true, false], 'au zoom 15, le quart bas-gauche ne contient pas le nom (il est à droite du milieu de la tuile 14)');
        assert.deepStrictEqual(j[12], {bois: 60, pres: 30, urbain: 10});
    });

    /* ═════════ 3. serveur et écran ═════════ */
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-ta-')), net0 = path.join(tmp, 'net');
    fs.mkdirSync(path.join(tmp, 'media')); fs.mkdirSync(net0);
    const FX = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root, 'tests/fixtures/telech-a.json.gz'))).toString('utf8'));
    for (const [step, v] of Object.entries(FX.steps)) fs.writeFileSync(path.join(net0, step), Buffer.from(v.b64, 'base64'));
    const calls = () => { try { return fs.readFileSync(path.join(net0, 'calls.log'), 'utf8').trim().split('\n').filter(Boolean); } catch (_) { return []; } };
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4', GENEALOGY_TEST: '1', LCNDA_TEST_TELECHA_DIR: net0};
    // le pack « basse-normandie » mis en ligne (dans le dossier d'essai) : un MBTiles d'une tuile, coupé comme sur GitHub, avec son sommaire
    const mb = path.join(tmp, 'osm.mbtiles');
    const mk = php(String.raw`$p = new PDO('sqlite:${mb}'); $p->exec("CREATE TABLE metadata(name TEXT, value TEXT); CREATE TABLE tiles(zoom_level INTEGER, tile_column INTEGER, tile_row INTEGER, tile_data BLOB);");
$p->exec("INSERT INTO metadata VALUES('format','pbf'),('bounds','0.1,49.3,0.4,49.5'),('minzoom','0'),('maxzoom','14'),('lcnda_built','2026-11-20'),('lcnda_label','Basse-Normandie'),('compression','gzip')");
$s = $p->prepare('INSERT INTO tiles VALUES(14, ?, ?, ?)'); $s->bindValue(1, ${TX}); $s->bindValue(2, ${2 ** 14 - 1 - TY}); $s->bindValue(3, gzencode(base64_decode('${TILE.toString('base64')}')), PDO::PARAM_LOB); $s->execute(); echo 'ok';`);
    assert.strictEqual(mk.stdout, 'ok', mk.stderr);
    const mbBytes = fs.readFileSync(mb), half = Math.ceil(mbBytes.length / 2);
    fs.writeFileSync(path.join(net0, 'osm-basse-normandie.mbtiles.000'), mbBytes.subarray(0, half)); fs.writeFileSync(path.join(net0, 'osm-basse-normandie.mbtiles.001'), mbBytes.subarray(half));
    fs.writeFileSync(path.join(net0, 'telech-a-osm-manifest.json'), JSON.stringify({version: '2026-11', packs: {'basse-normandie': {label: 'Basse-Normandie', size: mbBytes.length, sha256: crypto.createHash('sha256').update(mbBytes).digest('hex'), built: '2026-11-20',
        parts: [{name: 'osm-basse-normandie.mbtiles.000', size: half}, {name: 'osm-basse-normandie.mbtiles.001', size: mbBytes.length - half}]}}}));

    const seed = php(String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start) VALUES(1,'Jean','MAZAUD','male','deceased',1),(3,'Paul','DURAND','male','living',0)");
$pdo->exec("INSERT INTO places(id,name,county,country,latitude,longitude,admin4_code) VALUES(1,'Honfleur','Calvados','France',49.419,0.233,'14333')");
$t = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn();
$ins = $pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,date_text,year,sort_date,place_id) VALUES('person',?,?,?,?,?,?)");
$ins->execute([1,$t('BIRT'),'3 mai 1840',1840,'1840-05-03',1]); $ins->execute([1,$t('DEAT'),'1915',1915,'1915',1]); $ins->execute([3,$t('BIRT'),'1960',1960,'1960',1]);
echo json_encode(['ok' => 1]);`, env);
    if (seed.status !== 0 || !/"ok"/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const errs = [], tiles = [];
    try {
        const ctx = await browser.newContext({viewport: {width: 1440, height: 900}});
        await ctx.route(/^https:\/\//, r => { if (/data\.geopf\.fr\/wmts/.test(r.request().url())) tiles.push(r.request().url()); return r.abort(); }); // pas d'Internet dans l'essai
        const p = await ctx.newPage();
        p.on('pageerror', e => errs.push(e.message));
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_APP?.defaultPersonBlocks && window.LCNDA_EXT?.telechA, null, {timeout: 30000});
        const api = (x, q = {}) => p.evaluate(([y, z]) => window.LCNDA_APP.api(y, z).catch(e => ({error: e.message})), [x, q]);
        const post = (a, b) => p.evaluate(async ([x, y]) => { try { const r = await window.LCNDA_APP.api(x, {}, {method: 'POST', body: y}); return r.result || r; } catch (e) { return {error: e.message}; } }, [a, b]);

        await t('serveur 🌾 : CORINE 1990 et 2018 autour d’Honfleur (vraies tuiles lues pixel par pixel), la mer à moins de 3 km ; gardé', async () => {
            const n0 = calls().length;
            const r = await api('telech_a_clc', {lat: 49.419, lon: 0.233, name: 'Honfleur'});
            assert.strictEqual(r.ok, true, JSON.stringify(r).slice(0, 300)); assert.strictEqual(r.tiles, 6); assert.strictEqual(r.coast, true);
            assert.ok(r.years['1990'].groups.urbain > 40 && r.years['2018'].groups.urbain > r.years['1990'].groups.urbain, JSON.stringify(r.years));
            assert.ok(r.years['1990'].groups.pres > r.years['2018'].groups.pres);
            assert.ok(calls().slice(n0).every(l => /^clc(1990|2018)-\d+-\d+\.png https:\/\/data\.geopf\.fr\/wmts\?.*LAYER=LANDCOVER\.CLC(90|18)_FR/.test(l)));
            const again = await api('telech_a_clc', {lat: 49.419, lon: 0.233}); assert.strictEqual(again.cached, true); assert.strictEqual(calls().length, n0 + 6);
        });
        await t('serveur 🔒 : une personne vivante → rien ne part ; hors ligne sans réponse gardée → un message ; « cached_only » ne part jamais', async () => {
            const n0 = calls().length;
            assert.strictEqual((await api('telech_a_clc', {lat: 49.3, lon: 0.18, pid: 3})).private, true);
            assert.strictEqual((await api('telech_a_clc', {lat: 49.3, lon: 0.18, cached_only: 1})).notcached, true);
            assert.strictEqual(calls().length, n0);
            const off = await api('telech_a_clc', {lat: 48.85, lon: 2.35}); assert.strictEqual(off.ok, false); assert.match(off.message, /connexion/);
            assert.strictEqual((await api('telech_a_clc', {lat: 40.0, lon: -3.7})).nopoint, true, 'hors de France : rien');
        });
        await t('fiche d’un village (Honfleur) : 🌾 une phrase 1990 → 2018, 🌊 le bord de mer (lien seulement), ↔ le rideau ne charge ses tuiles qu’à l’ouverture', async () => {
            const html = await p.evaluate(async () => window.LCNDA_EXT.telechA.placeHtml({name: 'Honfleur', country: 'France', lat: 49.419, lon: 0.233}));
            const box = await p.evaluate(h => { const d = document.createElement('div'); d.id = 'ta-test'; d.innerHTML = h; document.body.appendChild(d); return d.textContent; }, html);
            assert.match(box, /Autour de Honfleur \(1 km\), en 1990 : \d+ % bâti, routes et zones d’activité/); assert.match(box, /En 2018 : .*en hausse/);
            assert.match(box, /Au bord de la mer/); assert.match(html, /geolittoral\.developpement-durable\.gouv\.fr/);
            const a = await p.$$eval('#ta-test a', l => l.map(x => [x.href, x.target, x.rel]));
            assert.ok(a.length >= 4 && a.every(([h, tg, rel]) => /^https:\/\//.test(h) && tg === '_blank' && /noopener/.test(rel)));
            assert.strictEqual(await p.$$eval('#ta-test img', l => l.length), 0, 'aucune tuile avant l’ouverture');
            const t0 = tiles.length;
            await p.click('#ta-test [data-ta-part="avantapres"] summary'); await p.waitForSelector('#ta-test .ta-swipe img', {state: 'attached'}); await sleep(400);
            const got = tiles.slice(t0); assert.ok(got.some(u => /ORTHOPHOTOS\.1950-1965/.test(u)) && got.some(u => /HR\.ORTHOIMAGERY\.ORTHOPHOTOS/.test(u)), got.join('\n'));
            await p.$eval('#ta-test [data-ta-range]', el => { el.value = '20'; el.dispatchEvent(new Event('input', {bubbles: true})); });
            assert.strictEqual(await p.$eval('#ta-test .ta-swipe', el => el.style.getPropertyValue('--ta-pos')), '20%');
            await p.selectOption('#ta-test [data-ta-pair]', 'clc'); await sleep(300);
            assert.ok(await p.$$eval('#ta-test .ta-before img', l => l.every(i => /LANDCOVER\.CLC90_FR/.test(i.src)) && l.length > 0));
            assert.match(await p.textContent('#ta-test [data-ta-swipe]'), /1990.*2018/s); assert.match(await p.textContent('#ta-test [data-ta-swipe]'), /bâti.*marais/s);
            await p.click('#ta-test [data-ta-zoom="1"]'); assert.strictEqual(await p.getAttribute('#ta-test [data-ta-swipe]', 'data-z'), '15');
            await p.selectOption('#ta-test [data-ta-pair]', 'etatmajor'); await sleep(200);
            await p.click('#ta-test [data-ta-zoom="1"]'); await p.click('#ta-test [data-ta-zoom="1"]');
            assert.strictEqual(await p.getAttribute('#ta-test [data-ta-swipe]', 'data-z'), '16', 'État-major : un cran au-delà de son zoom (tuiles agrandies)');
            assert.ok(await p.$$eval('#ta-test .ta-before img', l => l.every(i => /TILEMATRIX=15&/.test(i.src) && i.style.width === '512px')));
            await p.evaluate(() => document.getElementById('ta-test').remove());
        });
        await t('fiche de Jean MAZAUD (1840–1915, Honfleur) : le rideau « carte de 1850 », le paysage ; Paul DURAND (vivant) : rien, rien ne part', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.currentPersonId = 1; A.setModule('personnes'); });
            await p.waitForSelector('[data-ta-person="1"] .ta-row', {timeout: 30000});
            const txt = await p.textContent('[data-ta-person="1"]');
            assert.match(txt, /Honfleur comme il l’a connu : la carte d’État-major/); assert.match(txt, /Autour de Honfleur \(1 km\)/);
            assert.strictEqual(await p.evaluate(() => document.querySelector('[data-ta-person="1"]').closest('section.card').hidden), false);
            const n0 = calls().length, t0 = tiles.length;
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.currentPersonId = 3; A.setModule('personnes'); });
            await p.waitForSelector('[data-ta-person="3"]', {state: 'attached', timeout: 20000}); await sleep(2000);
            assert.strictEqual(await p.evaluate(() => document.querySelector('[data-ta-person="3"]').closest('section.card').hidden), true);
            assert.strictEqual(calls().length, n0); assert.strictEqual(tiles.length, t0);
        });
        await t('🗂 Réglages → Données : « Carte hors ligne · Basse-Normandie » proposée (département des lieux), ⤓ téléchargée par tranches, vérifiée, installée (↶)', async () => {
            const st = await api('telech_a_osm_status'); assert.deepStrictEqual(st.wanted, ['basse-normandie']); assert.strictEqual(st.installed, false);
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'donnees_installees'; A.setModule('maintenance'); });
            const sel = '[data-dmaj-row="telech_a_osm:basse-normandie"]';
            await p.waitForSelector(sel, {timeout: 20000});
            assert.match(await p.textContent(sel), /Carte hors ligne · Basse-Normandie.*ODbL/s);
            await p.click(`${sel} [data-dmaj-do="get"]`);
            await p.waitForSelector('.confirm-box-dialog [data-cb-ok]', {timeout: 30000}); // « Télécharger ? » : taille, source et licence dites avant
            assert.match(await p.textContent('.confirm-box-dialog'), /ODbL/); await p.click('.confirm-box-dialog [data-cb-ok]');
            await p.waitForSelector(`${sel}[data-dmaj-state="ok"]`, {timeout: 30000});
            const s2 = await api('telech_a_osm_status'); assert.strictEqual(s2.packs['basse-normandie'].label, 'Basse-Normandie'); assert.strictEqual(s2.packs['basse-normandie'].size, mbBytes.length);
        });
        await t('🗺 fond « OpenStreetMap hors ligne » : la tuile d’Honfleur dessinée sur l’ordinateur (mer, route, nom), agrandie au zoom 16 ; ailleurs le fond hors ligne de l’app', async () => {
            const bg = await p.evaluate(([x, y]) => { const B = window.LCNDA_EXT.mapBackgrounds; return [B.ta_osm_offline.url(14, x, y), B.ta_clc2018.url(12, 1, 2), !!B.ta_hydro.overlay, window.LCNDA_EXT.tileCategories.find(c => c.id === 'telech_a').items.length]; }, [TX, TY]);
            assert.strictEqual(bg[0], `api.php?action=telech_a_osm_tile&z=14&x=${TX}&y=${TY}`); assert.match(bg[1], /LANDCOVER\.CLC18_FR/); assert.strictEqual(bg[2], true); assert.strictEqual(bg[3], 4);
            const svg = await (await fetch(base + bg[0])).text();
            assert.match(svg, /^<svg/); assert.match(svg, /#aad3df/); assert.match(svg, />Honfleur</); assert.match(svg, /#fcd6a4/);
            const z16 = await (await fetch(`${base}api.php?action=telech_a_osm_tile&z=16&x=${TX * 4}&y=${TY * 4}`)).text(); assert.match(z16, /#aad3df/);
            const [px, py] = tileOf(48.85, 2.35, 14);
            const paris = await (await fetch(`${base}api.php?action=telech_a_osm_tile&z=14&x=${px}&y=${py}`)).text(); assert.match(paris, /#e6ecf0/); assert.ok(!/#aad3df/.test(paris));
            // l'attribution sur une carte qui montre ces tuiles
            await p.evaluate(u => { const d = document.createElement('div'); d.className = 'map-stage'; d.id = 'ta-map'; d.style.position = 'relative'; d.innerHTML = `<div class="map-tiles"><img src="${u}"></div>`; document.body.appendChild(d); }, bg[0]);
            await p.waitForSelector('#ta-map .ta-attr', {timeout: 5000});
            assert.match(await p.textContent('#ta-map .ta-attr'), /contributeurs d’OpenStreetMap \(ODbL\)/);
            await p.evaluate(() => document.getElementById('ta-map').remove());
        });
        await t('🗂 retirer la région (↶ la remet), puis ↶ Annuler l’installation', async () => {
            assert.strictEqual((await post('telech_a_osm_pack_remove', {key: 'basse-normandie'})).ok, true);
            assert.strictEqual((await api('telech_a_osm_status')).installed, false);
            assert.strictEqual((await post('telech_a_osm_pack_restore', {key: 'basse-normandie'})).ok, true);
            assert.strictEqual((await api('telech_a_osm_status')).installed, true);
            assert.ok((await post('telech_a_osm_pack_undo', {key: 'basse-normandie'})).removed);
            assert.strictEqual((await api('telech_a_osm_status')).installed, false);
            const bad = await post('telech_a_osm_dl_start', {key: '../x'}); assert.ok(bad.error, 'clé refusée');
        });
        await t('Réglages → 🗺 Le village tel qu’il était : un sujet s’éteint (↶), réponses oubliées (↶), À propos des données (licences et liens)', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'telech_a'; A.setModule('maintenance'); });
            await p.waitForSelector('[data-ta-settings] table tbody tr', {timeout: 20000});
            const txt = await p.textContent('[data-ta-settings]');
            assert.match(txt, /lues le 2026-11-25/); assert.match(txt, /ODbL/); assert.match(txt, /Licence Ouverte 2\.0/); assert.match(txt, /Copernicus/); assert.match(txt, /lien ↗ seulement/);
            await p.click('[data-ta-tg="paysage"] input');
            assert.strictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-telech-a')).paysage), false);
            await sleep(300); await p.locator('button:has-text("↶ Annuler")').last().click({timeout: 5000}); await sleep(300);
            assert.notStrictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-telech-a')).paysage), false);
            await p.click('[data-ta-clear]'); await sleep(500);
            assert.strictEqual((await api('telech_a_list')).rows.length, 0);
            await p.locator('button:has-text("↶ Annuler")').last().click({timeout: 5000}); await sleep(800);
            assert.strictEqual((await api('telech_a_list')).rows.length, 1);
        });
        await t('registres : liste (colonne Source), monographie, dataSources (Tout ce qui le concerne)', async () => {
            const r = await p.evaluate(async () => {
                const E = window.LCNDA_EXT, L = E.dataLists.find(d => d.id === 'ta_paysage'), rows = await L.load();
                const mono = E.monographSections.filter(s => s.id.startsWith('ta_')), mh = document.createElement('div'); document.body.appendChild(mh);
                const ok = await mono.find(s => s.id === 'ta_paysage').render({id: 1, name: 'Honfleur', latitude: 49.419, longitude: 0.233, country: 'France'}, mh, {}); const mt = mh.textContent; mh.remove();
                const host = document.createElement('div'); document.body.appendChild(host);
                await E.dataSources.find(d => d.id === 'ta_avantapres').run({place: {name: 'Honfleur', lat: 49.419, lon: 0.233}, year: 1850}, host); const ds = host.innerHTML; host.remove();
                return {rows, src: L.fields.some(f => f.key === 'src' && f.type === 'url'), mono: mono.map(s => s.id), ok, mt, ds};
            });
            assert.strictEqual(r.rows.length, 1); assert.strictEqual(r.rows[0].name, 'Honfleur'); assert.match(r.rows[0].src, /^https:\/\//); assert.ok(r.src);
            assert.deepStrictEqual(r.mono, ['ta_avantapres', 'ta_paysage']); assert.strictEqual(r.ok, true); assert.match(r.mt, /en 1990/);
            assert.match(r.ds, /data-pair="etatmajor"/, 'en 1850 : la carte d’État-major');
        });
        await t('aucune erreur JavaScript', async () => { assert.deepStrictEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill();
        try { fs.rmSync(tmp, {recursive: true, force: true}); } catch (_) {}
    }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})();
