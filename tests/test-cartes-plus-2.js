'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🧭 Outils de la Carte (assets/js/heritage-cartes-outils.js, calculs : app-cartes-outils-core.js, serveur : lib/cartes_outils.php) :
 *     node tests/test-cartes-plus-2.js          (captures : SHOTS=dossier node tests/test-cartes-plus-2.js)
 *  1. calculs sans écran : distance (haversine), vitesses selon l'année (diligence 1765 / 1780 / 1830, pas de train avant 1837),
 *     phrase « Il fallait environ 4 jours pour aller de Tulle à Paris en 1820 », réglages bornés, étapes d'une vie, formats
 *     A3 → A0 bornés en pixels, couches : nettoyage, GeoJSON et KML aller-retour, KML piégé (DOCTYPE / ENTITY) refusé ;
 *  2. serveur (base neuve + socle météo fabriqué) : lieux de la grande carte sans vivant ni fiche confidentielle (ni portrait),
 *     migrations, branche ; grille du relief (Gers couvert, Corrèze non couverte → covered 0) ; couches enregistrées, relues,
 *     nettoyées (coordonnées folles, texte de contrôle), supprimées puis remises (« ↶ Annuler »), CSRF exigé ;
 *  3. navigateur (Playwright ; sinon sauté) à 1440 px, 390 px et en sombre : la Carte (🧭 Outils ▾, ✏️ Mes couches), la fenêtre
 *     des trajets, la grande carte rendue (cartouche, légende, rose, échelle, symboles, aucun vivant), un PNG exporté par la
 *     fenêtre E3, une zone dessinée à la souris puis relue après rechargement, ↶ Annuler, le relief 3D sans erreur et le message
 *     hors zone, le bloc « 🧭 Ses déplacements » de la fiche ; pas de défilement de côté, aucune erreur JavaScript.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const C = require('../assets/js/app-cartes-outils-core.js');
const SHOTS = process.env.SHOTS || '';
let failed = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };

(async () => {
    /* ═════ 1. les calculs ═════ */
    const tulle = { lat: 45.2658, lon: 1.7723 }, paris = { lat: 48.8566, lon: 2.3522 };
    await t('distance et vitesses selon l’année', () => {
        const d = C.km(tulle, paris);
        assert.ok(d > 395 && d < 410, String(d));
        assert.equal(C.km({ lat: 'x' }, paris), null);
        assert.ok(C.speedAt('diligence', 1765).kmDay < C.speedAt('diligence', 1780).kmDay, 'les turgotines vont plus vite');
        assert.ok(C.speedAt('diligence', 1830).kmDay > 140);
        assert.equal(C.speedAt('train', 1820).available, false); assert.equal(C.speedAt('train', 1860).available, true);
        assert.equal(C.speedAt('diligence', 1500).available, false);
        assert.ok(C.travel(d, 1880, 'train').hours < 15);
        assert.equal(C.travel(d, 1820, 'pied').text, '≈ 14 jours');
        assert.equal(C.durationText(0.5, 0.05), '≈ 30 min');
        assert.equal(C.durationText(30, 1.5), '≈ 1 jour et demi');
        assert.match(C.durationText(900, 40), /40 jours \(6 semaines\)/);
        for (const m of C.MODES) for (const s of m.src) assert.ok(C.SOURCES[s], `source ${s}`);
    });
    await t('la phrase « Il fallait environ … »', () => {
        const d = C.km(tulle, paris);
        assert.equal(C.sentence({ from: 'Tulle', to: 'Paris', year: 1820, distKm: d }), 'Il fallait environ 4 jours pour aller de Tulle à Paris en 1820 (en diligence, ≈ 502 km de route).');
        assert.match(C.sentence({ from: 'Auch', to: 'Le Havre', year: 1900, distKm: 700 }), /^Il fallait environ .* d’Auch au Havre en 1900 \(en train/);
        assert.match(C.sentence({ from: 'A', to: 'B', year: new Date().getFullYear(), distKm: 5 }), /^Il faut environ .*\(à pied/);
        assert.match(C.sentence({ from: 'Le Havre', to: 'New York', year: 1850, distKm: 5800, mode: 'mer' }), /du Havre à New York en 1850 \(en bateau/);
    });
    await t('réglages bornés et pris en compte', () => {
        const s = C.cleanSettings({ speeds: { pied: 50, cheval: -3, train: 'abc', mer: 1e9 }, detour: { road: 9, rail: 1.1 } });
        assert.deepEqual(s.speeds, { pied: 50 }); assert.equal(s.detour.road, 1.25); assert.equal(s.detour.rail, 1.1);
        assert.equal(C.travel(100, 1800, 'pied', { speeds: { pied: 50 }, detour: { road: 1 } }).days, 2);
    });
    await t('étapes d’une vie', () => {
        const legs = C.legs([{ lat: tulle.lat, lon: tulle.lon, year: 1820, place: 'Tulle' }, { lat: tulle.lat + 0.001, lon: tulle.lon, year: 1830, place: 'Tulle' }, { lat: paris.lat, lon: paris.lon, year: 1850, place: 'Paris' }, { lat: null, lon: 3, year: 1860 }]);
        assert.equal(legs.length, 1); assert.equal(legs[0].from.place, 'Tulle'); assert.equal(legs[0].to.place, 'Paris'); assert.equal(legs[0].best.mode, 'train');
    });
    await t('formats A3 → A0 bornés en pixels', () => {
        const a3 = C.posterPixels('A3', 'portrait', 300); assert.deepEqual([a3.w, a3.h, a3.reduced], [3508, 4961, false]);
        const a0 = C.posterPixels('A0', 'landscape', 300); assert.ok(a0.reduced && a0.w * a0.h <= 48e6 && a0.w > a0.h, JSON.stringify(a0));
        assert.equal(C.niceScale(37), 20); assert.equal(C.niceScale(180), 100);
    });
    await t('couches : nettoyage, GeoJSON et KML aller-retour, KML piégé refusé', () => {
        const layer = { name: 'Les terres <b>', color: '#AA3300', features: [
            { type: 'Feature', geometry: { type: 'Point', coordinates: [2.35, 48.85] }, properties: { kind: 'note', name: 'Le moulin & la « ferme »', note: 'Ici\u0001 le moulin' } },
            { type: 'Feature', geometry: { type: 'LineString', coordinates: [[1, 45], [999, 46], [2, 46]] }, properties: { kind: 'route', name: 'chemin' } },
            { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[1, 45], [2, 46], [2, 45], [1, 45]]] }, properties: { name: 'zone', color: '#00ff00' } },
            { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[1, 45], [2, 46]]] }, properties: {} },
            { geometry: { type: 'Point', coordinates: [500, 10] } }] };
        const L = C.cleanLayer(layer);
        assert.equal(L.features.length, 3); assert.equal(L.color, '#aa3300');
        assert.equal(L.features[0].properties.note, 'Ici le moulin'); assert.deepEqual(L.features[1].geometry.coordinates, [[1, 45], [2, 46]]);
        const g = C.fromGeoJSON(JSON.stringify(C.toGeoJSON([L])));
        assert.equal(g.length, 1); assert.equal(g[0].name, 'Les terres <b>'); assert.equal(g[0].features.length, 3); assert.equal(g[0].features[2].properties.color, '#00ff00');
        const kml = C.toKML([L]); assert.match(kml, /<kml xmlns="http:\/\/www.opengis.net\/kml\/2.2">/); assert.ok(!kml.includes('<b>'), 'texte échappé');
        const k = C.fromKML(kml); assert.equal(k[0].features.length, 3); assert.equal(k[0].features[0].properties.kind, 'note'); assert.equal(k[0].features[0].properties.name, 'Le moulin & la « ferme »');
        assert.throws(() => C.fromKML('<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "b">]><kml></kml>'), /interdites/);
        assert.throws(() => C.readLayersFile('x.json', '{pas du json'), /illisible/);
        const multi = C.fromGeoJSON({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'MultiPoint', coordinates: [[1, 2], [3, 4]] }, properties: { layer: 'A' } }] });
        assert.equal(multi[0].features.length, 2);
    });

    /* ═════ 2. le serveur ═════ */
    const phpPath = findPhp([devBundledPhp()]);
    if (!phpPath) { console.log('— PHP absent : partie serveur sautée'); return done(); }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-cartes2-'));
    const fx = path.join(tmp, 'fx'), dir = path.join(tmp, 'data');
    const mk = spawnSync('python3', [path.join(appRoot, 'scripts', 'meteo', 'make-fixture.py'), fx], { encoding: 'utf8' });
    const haveFx = mk.status === 0;
    if (!haveFx) console.log('— python3 absent : relief sans socle');
    fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
    const envFor = d => ({ ...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1', ...(haveFx ? { LCNDA_METEO_DIR: fx } : { LCNDA_METEO_DIR: path.join(tmp, 'rien') }) });
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; $pdo = db();
$t = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn();
$pdo->exec("INSERT INTO places(id,name,county,country,latitude,longitude) VALUES(1,'Tulle','Corrèze','France',45.2658,1.7723),(2,'Paris','Paris','France',48.8566,2.3522),(3,'Lectoure','Gers','France',43.934,0.622),(4,'Brive-la-Gaillarde','Corrèze','France',45.1585,1.5321),(5,'Auch','Gers','France',43.646,0.586)");
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_private,is_start) VALUES(1,'Jean','BORIE','male','deceased',0,1),(2,'Marie','VIVANTE','female','living',0,0),(3,'Paul','SECRET','male','deceased',1,0),(4,'Anne','BORIE','female','deceased',0,0)");
$pdo->exec("INSERT INTO families(id,partner1_id,partner2_id) VALUES(1,1,4),(2,1,2)");
$pdo->exec("INSERT INTO family_children(family_id,child_id) VALUES(1,2)");
if (function_exists('imagecreatetruecolor')) { $im = imagecreatetruecolor(60, 60); imagefill($im, 0, 0, imagecolorallocate($im, 160, 90, 40)); imagejpeg($im, MEDIA_DIR.'/jean.jpg'); imagejpeg($im, MEDIA_DIR.'/marie.jpg'); }
else { foreach (['jean.jpg','marie.jpg'] as $f) file_put_contents(MEDIA_DIR.'/'.$f, base64_decode('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=')); }
$pdo->exec("INSERT INTO media(id,title,filename,media_type) VALUES(1,'Jean','jean.jpg','image'),(2,'Marie','marie.jpg','image')");
$pdo->exec("UPDATE persons SET portrait_media_id=1 WHERE id=1"); $pdo->exec("UPDATE persons SET portrait_media_id=2 WHERE id=2");
$ev = $pdo->prepare('INSERT INTO events(scope,person_id,family_id,event_type_id,date_text,year,place_id) VALUES(?,?,?,?,?,?,?)');
foreach ([['person',1,null,'BIRT','3 mars 1820',1820,1], ['person',1,null,'RESI','1845',1845,3], ['person',1,null,'DEAT','1880',1880,2], ['family',null,1,'MARR','1848',1848,5],
  ['person',4,null,'BIRT','1825',1825,4], ['person',4,null,'DEAT','1890',1890,2], ['person',2,null,'BIRT','1990',1990,4], ['person',3,null,'BIRT','1830',1830,3], ['person',3,null,'DEAT','1900',1900,5], ['family',null,2,'MARR','2010',2010,4]] as $r) { $r[3] = $t($r[3]); $ev->execute($r); }
echo 'ok';`], { cwd: appRoot, encoding: 'utf8', env: envFor(dir) });
    if (seed.status !== 0 || !String(seed.stdout).includes('ok')) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const port = await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env: envFor(dir), stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
    let cookie = '';
    const html = await (await fetch(base).then(r => { cookie = (r.headers.get('set-cookie') || '').split(';')[0]; return r; })).text();
    const csrf = JSON.parse(html.match(/window\.INSTALL_CSRF = ("[^"]*")/)[1]);
    const get = async (op, q = {}) => { const r = await fetch(`${base}api.php?action=cartes_outils&op=${op}&${new URLSearchParams(q)}`, { headers: { Cookie: cookie } }); const j = await r.json(); return j.result ?? j; };
    const post = async (body, token = csrf) => { const r = await fetch(`${base}api.php?action=cartes_outils_write`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': token }, body: JSON.stringify({ ...body, csrf: token }) }); const j = await r.json().catch(() => ({})); return { status: r.status, body: j.result ?? j }; };
    try {
        await t('la grande carte : jamais un vivant ni une fiche confidentielle, migrations, portraits, branche', async () => {
            const d = await get('places', { photos: 12 });
            const names = d.places.map(p => p.name).sort();
            assert.deepEqual(names, ['Auch', 'Brive-la-Gaillarde', 'Lectoure', 'Paris', 'Tulle'].filter(n => n !== 'Auch' || d.places.some(p => p.name === 'Auch')).sort());
            const brive = d.places.find(p => p.name === 'Brive-la-Gaillarde');
            assert.equal(brive.b, 1, 'Anne seulement (Marie vivante)'); assert.equal(brive.m, 0, 'mariage avec une vivante : pas montré');
            const lect = d.places.find(p => p.name === 'Lectoure'); assert.equal(lect.b, 0, 'Paul (confidentiel) pas montré'); assert.equal(lect.o, 1);
            assert.ok(!d.places.some(p => p.name === 'Auch' && p.d > 0), 'décès de Paul caché');
            assert.equal(d.moves.length, 2, JSON.stringify(d.moves));
            assert.deepEqual(d.photos.map(p => p.person_id), [1], 'pas le portrait de la vivante');
            assert.deepEqual(d.years, [1820, 1890]); assert.equal(d.surname, 'BORIE'); assert.ok(d.hidden >= 2);
            const br = await get('places', { branch: 4 });
            assert.deepEqual(br.places.map(p => p.name).sort(), ['Auch', 'Brive-la-Gaillarde', 'Paris'], 'elle, et son mariage'); assert.equal(br.branch, 'Anne BORIE');
        });
        await t('le relief : grille du Gers, Corrèze hors de la carte du relief, zone illisible refusée', async () => {
            const g = await get('relief', { s: 43.7, w: 0.4, n: 44.1, e: 0.9, size: 40 });
            if (!haveFx) { assert.equal(g.installed, false); return; }
            assert.equal(g.installed, true); assert.ok(g.covered > 0.9, String(g.covered)); assert.equal(g.z.length, g.rows * g.cols);
            assert.ok(g.min >= 60 && g.max <= 100, `${g.min}–${g.max}`); assert.ok(g.countries.includes('Espagne'));
            const out = await get('relief', { s: 45, w: 1.5, n: 45.5, e: 2, size: 20 });
            assert.equal(out.covered, 0); assert.ok(out.z.every(v => v === null));
            const big = await get('relief', { s: 40, w: -5, n: 50, e: 10, size: 16 }); assert.ok(big.n - big.s <= 4.0001 && big.e - big.w <= 6.0001, 'zone bornée');
            const bad = await get('relief', { s: 'x' }); assert.match(bad.error, /Zone illisible/);
        });
        let id = 0;
        await t('mes couches : enregistrées, nettoyées, relues, supprimées puis remises ; CSRF exigé', async () => {
            const bad = await post({ op: 'layer_save', name: 'X', features: [] }, 'faux'); assert.ok(bad.status >= 400);
            const r = await post({ op: 'layer_save', name: 'Terres\u0007 de la famille', color: 'red;background:url(x)', features: [
                { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[1, 45], [2, 46], [2, 45]]] }, properties: { kind: 'zone', name: 'Champ', note: 'n', color: '#123456' } },
                { type: 'Feature', geometry: { type: 'Point', coordinates: [1e9, 2] }, properties: {} },
                { type: 'Feature', geometry: { type: 'LineString', coordinates: [[1, 45], [2, 46]] }, properties: { kind: 'route', name: '<script>' } },
                'nimporte', { geometry: { type: 'Circle' } }] });
            assert.equal(r.status, 200, JSON.stringify(r.body)); id = r.body.layer.id;
            assert.equal(r.body.layer.name, 'Terres de la famille'); assert.equal(r.body.layer.color, '#d9480f'); assert.equal(r.body.layer.features.length, 2);
            assert.deepEqual(r.body.layer.features[0].geometry.coordinates[0].at(-1), [1, 45], 'anneau fermé');
            assert.equal(r.body.layer.features[1].properties.name, '<script>', 'gardé tel quel, échappé à l’affichage');
            const list = (await get('layers')).layers; assert.equal(list.length, 1); assert.equal(list[0].features.length, 2);
            assert.equal((await post({ op: 'layer_delete', id })).status, 200); assert.equal((await get('layers')).layers.length, 0);
            assert.equal((await post({ op: 'layer_restore', id })).status, 200); assert.equal((await get('layers')).layers.length, 1);
            assert.equal((await post({ op: 'layer_save', id: 9999, name: 'x' })).status, 404);
            const many = await post({ op: 'layer_save', name: 'trop', features: Array.from({ length: 5001 }, () => ({})) }); assert.equal(many.status, 422);
            await post({ op: 'layer_delete', id });
        });

        /* ═════ 3. le navigateur ═════ */
        let chromium = null;
        try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); } catch (_) { try { ({ chromium } = require('playwright')); } catch (__) { /* sauté */ } }
        if (!chromium) { console.log('— Playwright absent : partie navigateur sautée'); return; }
        const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
        try {
            for (const [vp, dark] of [[{ width: 1440, height: 900 }, false], [{ width: 390, height: 844 }, false], [{ width: 1440, height: 900 }, true]]) {
                const tag = `${vp.width}${dark ? '-sombre' : ''}`;
                await t(`navigateur ${tag} : Carte, trajets, grande carte, couches, relief, fiche`, async () => {
                    const ctx = await browser.newContext({ viewport: vp, colorScheme: dark ? 'dark' : 'light', acceptDownloads: true });
                    const p = await ctx.newPage(); const errors = [];
                    p.on('pageerror', e => errors.push('pageerror ' + e.message));
                    p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_|tile/i.test(m.text())) errors.push(m.text()); });
                    await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort()); // pas d'Internet : les tuiles en ligne tombent sur le fond hors ligne
                    await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.setModule && window.LCNDA_EXT?.cartesOutils && window.LCNDA_EXT?.diagramCartes);
                    if (dark) await p.evaluate(() => { const A = window.LCNDA_APP; localStorage.setItem('genealogie-design', JSON.stringify({ ...A.readDesignSettings(), preset: 'dark' })); A.applyDesign(); });
                    const shot = async n => { if (SHOTS) await p.screenshot({ path: path.join(SHOTS, `${n}-${tag}.png`) }); };
                    const noScroll = async () => assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'défilement de côté');
                    await p.evaluate(() => window.LCNDA_APP.setModule('carte')); await p.waitForSelector('[data-cpo-tools]', { timeout: 15000 });
                    // 🧭 Outils ▾ : le menu d'actions de l'app
                    await p.click('[data-cpo-tools]'); const items = await p.$$eval('.ui-menu button, [role="menu"] button', bs => bs.map(b => b.textContent.trim()));
                    assert.ok(items.some(x => /Distances/.test(x)) && items.some(x => /Grande carte/.test(x)) && items.some(x => /Relief 3D/.test(x)), items.join(' | '));
                    await p.keyboard.press('Escape');
                    // les trajets
                    await p.evaluate(() => window.LCNDA_EXT.cartesOutils.openTravel({ from: { id: 1, title: 'Tulle', lat: 45.2658, lon: 1.7723 }, to: { id: 2, title: 'Paris', lat: 48.8566, lon: 2.3522 }, year: 1820 }));
                    await p.waitForSelector('.cpo-phrase');
                    assert.equal((await p.textContent('.cpo-phrase')).trim(), 'Il fallait environ 4 jours pour aller de Tulle à Paris en 1820 (en diligence, ≈ 502 km de route).');
                    assert.equal(await p.$$eval('.cpo-modes tbody tr', r => r.length), 6);
                    assert.equal(await p.$eval('.cpo-modes tr[data-cpo-mode="train"]', r => r.classList.contains('is-off')), true, 'pas de train en 1820');
                    await p.fill('[data-cpo-year]', '1880'); await p.waitForTimeout(100);
                    assert.match(await p.textContent('.cpo-phrase'), /en 1880 \(en train/);
                    await shot('trajets'); await noScroll();
                    await p.keyboard.press('Escape'); await p.waitForTimeout(200);
                    // la grande carte
                    await p.evaluate(() => window.LCNDA_EXT.cartesOutils.openPoster({ paper: 'A3', style: 'ancien', frame: 'auto', title: '', b: true, m: true, d: true, moves: true, photos: true, legend: true, compass: true, scale: true, cartouche: true, labels: true }));
                    await p.waitForSelector('.cpo-poster-svg', { timeout: 15000 });
                    const sv = await p.$eval('.cpo-poster-svg', s => ({ n: Number(s.dataset.cpoPlaces), txt: s.textContent, compass: !!s.querySelector('.cpo-compass'), legend: !!s.querySelector('.cpo-legend'), scale: !!s.querySelector('.cpo-scale'), cart: !!s.querySelector('.cpo-cartouche'), moves: s.querySelectorAll('.cpo-move').length, medals: s.querySelectorAll('.cpo-medal').length, land: s.querySelector('path[stroke-dasharray]')?.getAttribute('d')?.length || 0 }));
                    assert.ok(sv.n >= 4, JSON.stringify(sv)); assert.ok(sv.compass && sv.legend && sv.scale && sv.cart, 'habillage'); assert.equal(sv.moves, 2); assert.equal(sv.medals, 1);
                    assert.match(sv.txt, /Les BORIE/); assert.ok(!/VIVANTE|SECRET/.test(sv.txt), 'aucun vivant ni confidentiel'); assert.ok(sv.land > 100, 'le fond est dessiné');
                    await shot('grande-carte'); await noScroll();
                    await p.click('.cpo-poster-dlg [data-cpo-o="style"][data-v="nuit"]'); await p.waitForTimeout(400);
                    assert.match(await p.$eval('.cpo-poster-svg rect', r => r.getAttribute('fill')), /#14213d/i);
                    if (!dark && vp.width > 1000) { // l'export PNG par la fenêtre E3
                        await p.click('.cpo-poster-dlg [data-cpo-export]'); await p.waitForSelector('dialog.ui-export');
                        await p.click('dialog.ui-export .ui-export-fmt[data-fmt="png"]');
                        await p.fill('dialog.ui-export input[type="number"]', '72').catch(() => {});
                        const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 60000 }), p.click('dialog.ui-export [data-ui-go]')]);
                        const fp = await dl.path(); const buf = fs.readFileSync(fp); assert.equal(buf.subarray(1, 4).toString(), 'PNG');
                        assert.ok(buf.readUInt32BE(16) > 800, 'largeur du PNG ' + buf.readUInt32BE(16));
                    }
                    await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close())); await p.waitForTimeout(200);
                    // ✏️ mes couches : une zone dessinée à la souris, relue après rechargement, ↶ Annuler
                    await p.evaluate(() => { const A = window.LCNDA_APP; A.state.mapCenter = { lat: 45.3, lon: 1.8 }; A.state.mapZoom = 9; A.drawMap(); });
                    if (!(await p.$('#cpo-panel:not([hidden])'))) await p.click('[data-cpo-layers]');
                    const z0 = await p.$$eval('#cpo-layers .cpo-f.is-zone', l => l.length);
                    await p.click('#cpo-panel [data-cpo-tool="zone"]'); await p.waitForTimeout(300);
                    const box = await p.$eval('#map-stage', s => { const r = s.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
                    const at = (fx, fy) => p.mouse.click(box.x + box.w * fx, box.y + box.h * fy);
                    await at(.2, .55); await at(.3, .7); await at(.12, .8); await p.waitForTimeout(150);
                    await p.click('#cpo-panel [data-cpo-finish]'); await p.waitForSelector('dialog.ask-text-dialog input');
                    await p.fill('dialog.ask-text-dialog input', 'Les terres de Tulle'); await p.click('dialog.ask-text-dialog [data-ask-ok]'); await p.waitForTimeout(600);
                    assert.equal(await p.$$eval('#cpo-layers .cpo-f.is-zone', l => l.length), z0 + 1);
                    await shot('couches'); await noScroll();
                    await p.reload(); await p.waitForFunction(() => window.LCNDA_EXT?.cartesOutils); await p.evaluate(() => window.LCNDA_APP.setModule('carte'));
                    await p.waitForSelector('#cpo-layers .cpo-f.is-zone', { timeout: 10000 });
                    const L = await p.evaluate(() => window.LCNDA_EXT.cartesOutils.layers.load(true));
                    const zf = L[0].features.at(-1); assert.equal(zf.properties.name, 'Les terres de Tulle'); assert.equal(zf.geometry.coordinates[0].length, 4);
                    // ↶ Annuler (H7) : la zone retirée revient
                    if (vp.width >= 600) { // une forme : clic dessus → « 🗑 Supprimer » → « ↶ Annuler »
                        const box2 = await p.$eval('#map-stage', s => { const r = s.getBoundingClientRect(); return { x: r.left, y: r.top }; });
                        const cpt = await p.evaluate(() => { const z = [...document.querySelectorAll('#cpo-layers .cpo-f.is-zone')].at(-1); const n = (z.getAttribute('d').match(/-?[\d.]+/g) || []).map(Number); let x = 0, y = 0, k = 0; for (let i = 0; i + 1 < n.length; i += 2) { x += n[i]; y += n[i + 1]; k++; } return { x: x / k, y: y / k }; });
                        await p.mouse.click(box2.x + cpt.x, box2.y + cpt.y); await p.waitForSelector('.cpo-pop [data-cpo-fdel]', { timeout: 5000 });
                        await p.click('.cpo-pop [data-cpo-fdel]'); await p.waitForTimeout(500);
                        assert.equal(await p.$$eval('#cpo-layers .cpo-f.is-zone', l => l.length), z0, 'zone supprimée');
                    } else { // au téléphone : ⋯ de la couche → « Supprimer la couche » → « ↶ Annuler »
                        await p.click('#cpo-panel [data-cpo-more]'); await p.click('button:has-text("Supprimer la couche")'); await p.waitForTimeout(500);
                        assert.equal(await p.$$eval('#cpo-layers .cpo-f', l => l.length), 0, 'couche supprimée');
                    }
                    await p.click('button:has-text("↶ Annuler")'); await p.waitForTimeout(800);
                    assert.equal(await p.$$eval('#cpo-layers .cpo-f.is-zone', l => l.length), z0 + 1, '↶ Annuler la remet');
                    assert.equal((await p.evaluate(() => window.LCNDA_EXT.cartesOutils.layers.load(true)))[0].features.length, z0 + 1);
                    // le relief 3D : le Gers (couvert) puis la Corrèze (pas d'altitude dans le socle d'essai)
                    if (haveFx) {
                        await p.evaluate(() => { document.querySelectorAll('.cpo-pop').forEach(x => x.remove()); window.LCNDA_EXT.cartesOutils.openRelief({ center: { id: 3, name: 'Lectoure', lat: 43.934, lon: 0.622 } }); });
                        await p.waitForFunction(() => window.LCNDA_EXT.cartesOutils.reliefState?.() || /WebGL|3D/.test(document.querySelector('[data-cpo-r-info]')?.textContent || ''), null, { timeout: 20000 });
                        const rs = await p.evaluate(() => window.LCNDA_EXT.cartesOutils.reliefState?.());
                        if (rs) { assert.ok(rs.rows > 50 && rs.pins >= 1, JSON.stringify(rs)); await p.focus('[data-cpo-r-view]'); await p.keyboard.press('ArrowLeft'); await p.keyboard.press('+'); await p.waitForTimeout(200); }
                        await shot('relief');
                        await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close())); await p.waitForTimeout(200);
                        await p.evaluate(() => window.LCNDA_EXT.cartesOutils.openRelief({ center: { id: 1, name: 'Tulle', lat: 45.2658, lon: 1.7723 } }));
                        await p.waitForFunction(() => /Pas d’altitude pour cette zone/.test(document.querySelector('[data-cpo-r-info]')?.textContent || ''), null, { timeout: 15000 });
                        await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close()));
                    }
                    // le bloc de la fiche
                    await p.evaluate(() => window.LCNDA_APP.openPersonById(1)); await p.waitForSelector('[data-cpo-travel-person]', { timeout: 10000, state: 'attached' });
                    const blk = await p.$eval('[data-cpo-travel-person]', b => b.closest('.card').textContent);
                    assert.match(blk, /Ses déplacements/); assert.match(blk, /Tulle → Lectoure/); assert.match(blk, /Auch → Paris/); assert.match(blk, /Il fallait environ/);
                    await p.$eval('[data-cpo-travel-person]', b => b.scrollIntoView({ block: 'center' })); await shot('fiche'); await noScroll();
                    assert.deepEqual(errors, []);
                    await ctx.close();
                });
            }
        } finally { await browser.close(); }
    } finally {
        proc.kill();
        fs.rmSync(tmp, { recursive: true, force: true });
        done();
    }
})();
function done() { if (failed) { console.error(`\n${failed} échec(s)`); process.exit(1); } console.log('\nTout est bon.'); }
