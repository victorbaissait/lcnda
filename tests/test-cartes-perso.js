'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🗺 Mes cartes (Carte → « 🗺 Mes cartes ») : assets/js/app-cartes-perso-core.js, heritage-cartes-perso.js, lib/cartes_perso.php.
 *     node tests/test-cartes-perso.js          (captures : SHOTS=dossier node tests/test-cartes-perso.js)
 *  1. calculs sans écran : définition nettoyée, « Du … au … » (C4), curseur du temps (cumul, fenêtre, ligne coupée), regroupement,
 *     cône de prise de vue, légende, GeoJSON ;
 *  2. serveur (base neuve) : une carte à 3 couches filtrées — naissances entre 1840 et 1900, naissances d'une personne et de ses
 *     descendants, images de lieux avec ZONES et hypothèses (lib/place_photos.php) — nombre de formes attendu, sans vivant en partage,
 *     CSRF exigé, définition nettoyée, supprimée puis remise (« ↶ Annuler »), copiée ; menu de choix (custommap, branch, maplayer) ;
 *  3. navigateur (Playwright ; sinon sauté) à 1440 px, 390 px et en sombre : la liste (H10 + K9), la carte ouverte (couches, zones,
 *     légende, panneau), le curseur du temps, ⤓ GeoJSON valide, un changement puis « ↶ Annuler », le widget ; aucune erreur JavaScript.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const C = require('../assets/js/app-cartes-perso-core.js');
const SHOTS = process.env.SHOTS || '';
let failed = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
const validGeoJSON = g => {
    assert.equal(g.type, 'FeatureCollection'); assert.ok(Array.isArray(g.features));
    const pos = c => Array.isArray(c) && c.length >= 2 && c.every(Number.isFinite) && Math.abs(c[0]) <= 180 && Math.abs(c[1]) <= 90;
    for (const f of g.features) {
        assert.equal(f.type, 'Feature'); assert.equal(typeof f.properties, 'object');
        const { type, coordinates: c } = f.geometry;
        if (type === 'Point') assert.ok(pos(c), JSON.stringify(c));
        else if (type === 'LineString') assert.ok(c.length >= 2 && c.every(pos));
        else if (type === 'Polygon') { assert.ok(c[0].length >= 4 && c[0].every(pos)); assert.deepEqual(c[0][0], c[0].at(-1), 'anneau fermé'); }
        else assert.fail('géométrie inconnue ' + type);
    }
};

(async () => {
    /* ═════ 1. les calculs ═════ */
    await t('définition nettoyée, dates C4, temps, regroupement, cône, légende, GeoJSON', () => {
        const d = C.cleanDef({ bg: 'osm', time: { from: '1800', to: 'avant 1950', mode: 'window', win: 999 }, layers: [{ kind: 'births', id: 'a', s: { color: 'red', size: 99 }, f: { persons: [3, '4', { id: 5 }, -1], cert: ['certain', 'x'] } }, { kind: 'pirate' }, { kind: 'births', id: 'a' }] });
        assert.equal(d.layers.length, 2); assert.notEqual(d.layers[0].id, d.layers[1].id, 'identifiants uniques');
        assert.equal(d.layers[0].s.color, '#2b8a3e'); assert.equal(d.layers[0].s.size, 40); assert.deepEqual(d.layers[0].f.persons, [3, 4, 5]); assert.deepEqual(d.layers[0].f.cert, ['certain']);
        assert.equal(d.time.win, 200); assert.equal(d.bg, 'osm');
        assert.deepEqual(C.range('1850', ''), [1850, null]); assert.deepEqual(C.range('entre 1880 et 1900', ''), [1880, 1900]);
        assert.deepEqual(C.range('', 'avant 1900'), [null, 1900]); assert.deepEqual(C.range('7 mai 1925', '1930'), [1925, 1930]);
        const line = { g: 'l', c: [[1, 45], [2, 46], [3, 47]], ys: [1850, 1870, 1900], y: 1850, y1: 1900 };
        assert.equal(C.atTime(line, 1840), null); assert.equal(C.atTime(line, 1880).c.length, 2); assert.equal(C.atTime(line, null), line);
        assert.equal(C.atTime({ g: 'p', c: [1, 2], y: 1800 }, 1900, 'window', 10), null, 'hors de la fenêtre'); assert.ok(C.atTime({ g: 'p', c: [1, 2] }, 1900), 'sans date : toujours là');
        assert.equal(C.cluster([{ x: 1, y: 1 }, { x: 5, y: 5 }, { x: 200, y: 200 }], 40).length, 2);
        const ring = C.cone(1.77, 45.26, 90, 60, 1); assert.deepEqual(ring[0], ring.at(-1)); assert.ok(ring.slice(1, -1).every(p => p[0] > 1.77), 'regarde vers l’est');
        const data = { layers: [{ id: d.layers[0].id, n: 2, features: [{ g: 'p', c: [1, 45], y: 1850, t: 'A', cat: 'x' }, { g: 'z', c: [[[1, 45], [2, 45], [2, 46], [1, 45]]], y: 1950, k: .5 }] }] };
        const lg = C.legend(d, data, 1900); assert.equal(lg[0].n, 1);
        validGeoJSON(C.toGeoJSON(d, data));
    });

    /* ═════ 2. le serveur ═════ */
    const phpPath = findPhp([devBundledPhp()]);
    if (!phpPath) { console.log('— PHP absent : partie serveur sautée'); return done(); }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-mescartes-'));
    const dir = path.join(tmp, 'data');
    fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
    const envFor = d => ({ ...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1', LCNDA_METEO_DIR: path.join(tmp, 'rien') });
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; $pdo = db();
$t = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn();
$pdo->exec("INSERT INTO places(id,name,county,country,latitude,longitude) VALUES(1,'Tulle','Corrèze','France',45.2658,1.7723),(2,'Paris','Paris','France',48.8566,2.3522),(3,'Lectoure','Gers','France',43.934,0.622),(4,'Brive-la-Gaillarde','Corrèze','France',45.1589,1.5321),(5,'Auch','Gers','France',43.6465,0.5855)");
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_private,is_start) VALUES(1,'Jean','BORIE','male','deceased',0,0),(4,'Anne','DURAND','female','deceased',0,0),(5,'Pierre','BORIE','male','deceased',0,1),(6,'Louis','BORIE','male','deceased',0,0),(2,'Marie','VIVANTE','female','living',0,0),(3,'Paul','SECRET','male','deceased',1,0)");
$pdo->exec("INSERT INTO families(id,partner1_id,partner2_id) VALUES(1,1,4),(3,5,NULL)");
$pdo->exec("INSERT INTO family_children(family_id,child_id) VALUES(1,5),(3,6),(3,2)");
$ev = $pdo->prepare('INSERT INTO events(scope,person_id,family_id,event_type_id,date_text,year,place_id) VALUES(?,?,?,?,?,?,?)');
foreach ([['person',1,null,'BIRT','1820',1820,1], ['person',1,null,'DEAT','1880',1880,2], ['person',4,null,'BIRT','1825',1825,4], ['person',4,null,'DEAT','1890',1890,2],
  ['person',5,null,'BIRT','1850',1850,1], ['person',5,null,'DEAT','1920',1920,3], ['person',6,null,'BIRT','1880',1880,3], ['person',6,null,'DEAT','1950',1950,5],
  ['person',2,null,'BIRT','1990',1990,4], ['person',3,null,'BIRT','1830',1830,3], ['person',3,null,'DEAT','1900',1900,5], ['family',null,1,'MARR','1848',1848,5]] as $r) { $r[3] = $t($r[3]); $ev->execute($r); }
$pdo->exec("INSERT INTO media(id,title,filename,media_type,date_text) VALUES(10,'L’église de Tulle','eglise.jpg','image','vers 1905'),(11,'Le pont','pont.jpg','image','1930')");
if (!function_exists('place_photos_schema')) { require_once 'lib/place_photos.php'; } place_photos_schema($pdo);
$g = $pdo->prepare('INSERT INTO place_photo_guesses(media_id,place_id,lat,lon,zone_json,bearing,fov,certainty,retained) VALUES(?,?,?,?,?,?,?,?,?)');
$g->execute([10, 1, 45.2658, 1.7723, '', 90, 60, 'certain', 1]);
$g->execute([10, null, null, null, json_encode(['type' => 'polygon', 'pts' => [[45.16, 1.52], [45.17, 1.55], [45.15, 1.56]]]), null, null, 'possible', 0]);
$g->execute([11, null, null, null, json_encode(['type' => 'circle', 'lat' => 43.93, 'lon' => 0.62, 'r' => 500]), null, null, 'probable', 1]);
$pdo->exec("INSERT INTO media_links(media_id,entity_type,entity_id) VALUES(11,'person',2)"); // le pont : relié à une vivante → pas dans ce qu'on partage
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
    const get = async (op, q = {}) => { const r = await fetch(`${base}api.php?action=cartes_perso&op=${op}&${new URLSearchParams(q)}`, { headers: { Cookie: cookie } }); const j = await r.json(); return j.result ?? j; };
    const post = async (body, token = csrf) => { const r = await fetch(`${base}api.php?action=cartes_perso_write`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': token }, body: JSON.stringify({ ...body, csrf: token }) }); let j = {}; try { j = await r.json(); } catch (_) {} return { status: r.status, body: j.result ?? j }; };
    const DEF = { time: { mode: 'cumul' }, layers: [
        { id: 'nais', kind: 'births', name: 'Naissances 1840–1900', f: { from: '1840', to: '1900' } },
        { id: 'desc', kind: 'births', name: 'Pierre et ses descendants', f: { persons: [5], rel: 'desc', gens: 3 }, s: { color: '#c2255c' } },
        { id: 'img', kind: 'placeimages', name: 'Images de lieux', s: { cones: true } }] };
    let mapId = 0;
    try {
        await t('une carte à 3 couches filtrées : le nombre de formes attendu, sans vivant en partage', async () => {
            const d = await get('data', { def: JSON.stringify(DEF) });
            const n = id => d.layers.find(l => l.id === id);
            assert.equal(n('nais').n, 2, JSON.stringify(n('nais').features.map(f => f.t))); // Pierre 1850, Louis 1880
            assert.deepEqual(n('desc').features.map(f => f.t).sort(), ['Louis BORIE', 'Marie VIVANTE', 'Pierre BORIE']);
            const img = n('img'); assert.equal(img.n, 3, JSON.stringify(img.features));
            assert.equal(img.features.filter(f => f.g === 'z').length, 2, 'deux zones (polygone et cercle)');
            const pt = img.features.find(f => f.g === 'p'); assert.deepEqual(pt.cone.slice(0, 2), [90, 60]); assert.equal(pt.k, 1); assert.equal(pt.h, 'retenue');
            assert.ok(img.features.find(f => f.h === 'hypothèse').k < 1, 'une hypothèse : certitude en transparence');
            assert.deepEqual(d.years, [1850, 1990]);
            const sh = await get('data', { def: JSON.stringify(DEF), share: 1 });
            assert.equal(sh.layers.find(l => l.id === 'desc').n, 2, 'la vivante n’est pas dans ce qu’on partage');
            assert.equal(sh.layers.find(l => l.id === 'img').n, 2, 'l’image reliée à une vivante non plus');
            assert.ok(sh.hidden >= 2);
            const cur = C.countAt(C.cleanDef(DEF), d, 1860); assert.deepEqual([cur.nais, cur.desc, cur.img], [1, 1, 0], 'curseur du temps en 1860');
            validGeoJSON(C.toGeoJSON(C.cleanDef(DEF), sh));
            assert.equal(C.toGeoJSON(C.cleanDef(DEF), sh).features.length, 2 + 2 + 2 + 1, 'avec le cône');
            const z = await get('data', { def: JSON.stringify({ layers: [{ kind: 'births', f: { place: 1, radius: 20 } }, { kind: 'deaths', f: { sosa: true, side: 'mother' } }, { kind: 'life', f: { persons: [5] } }, { kind: 'moves' }] }) });
            assert.equal(z.layers[0].n, 2, 'autour de Tulle (20 km)'); assert.equal(z.layers[1].n, 1, 'côté de la mère : Anne (mère de Pierre, Sosa 3)');
            assert.equal(z.layers[2].features.filter(f => f.g === 'l').length, 1); assert.deepEqual(z.layers[2].features.filter(f => f.g === 'p').map(f => f.n), [1, 2]);
            assert.equal(z.layers[3].n, 5, 'naissance → décès ailleurs');
            const bad = await get('data', { def: '{pas du json' }); assert.match(bad.error, /illisible/);
        });
        await t('enregistrée, nettoyée, supprimée puis remise (↶ Annuler), copiée ; CSRF exigé ; menu de choix', async () => {
            assert.ok((await post({ op: 'save', name: 'X', def: DEF }, 'faux')).status >= 400);
            const r = await post({ op: 'save', name: 'Les BORIE\u0007', description: 'Trois couches', def: { ...DEF, layers: [...DEF.layers, { kind: 'rien' }] } });
            assert.equal(r.status, 200, JSON.stringify(r.body)); mapId = r.body.map.id;
            assert.equal(r.body.map.name, 'Les BORIE'); assert.equal(r.body.map.def.layers.length, 3);
            assert.equal((await get('list')).maps.length, 1); assert.equal((await get('list')).ready[0].id, 'ready:images');
            assert.equal((await post({ op: 'delete', id: mapId })).status, 200); assert.equal((await get('list')).maps.length, 0);
            assert.equal((await post({ op: 'restore', id: mapId })).status, 200); assert.equal((await get('list')).maps.length, 1);
            const cp = await post({ op: 'duplicate', id: mapId }); assert.equal(cp.body.map.name, 'Les BORIE (2)'); await post({ op: 'delete', id: cp.body.map.id });
            assert.equal((await post({ op: 'save', id: 9999, name: 'x' })).status, 404);
            assert.equal((await post({ op: 'save', name: 'trop', def: { layers: Array.from({ length: 30 }, () => ({ kind: 'births' })) } })).status, 422);
            const pk = await (await fetch(`${base}api.php?action=picker_search&kind=custommap&q=`, { headers: { Cookie: cookie } })).json();
            const items = (pk.result ?? pk).groups?.[0]?.items || []; assert.ok(items.some(i => i.title === 'Les BORIE') && items.some(i => i.id === 'ready:images'), JSON.stringify(pk).slice(0, 300));
        });

        /* ═════ 3. le navigateur ═════ */
        let chromium = null;
        try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); } catch (_) { try { ({ chromium } = require('playwright')); } catch (__) { /* sauté */ } }
        if (!chromium) { console.log('— Playwright absent : partie navigateur sautée'); return; }
        const browser = await chromium.launch();
        try {
            for (const [vp, dark] of [[{ width: 1440, height: 900 }, false], [{ width: 390, height: 844 }, false], [{ width: 1440, height: 900 }, true]]) {
                const tag = `${vp.width}${dark ? '-sombre' : ''}`;
                await t(`navigateur ${tag} : liste, carte, couches, zones, temps, GeoJSON, ↶ Annuler, widget`, async () => {
                    const ctx = await browser.newContext({ viewport: vp, colorScheme: dark ? 'dark' : 'light', acceptDownloads: true });
                    const p = await ctx.newPage(); const errors = [];
                    p.on('pageerror', e => errors.push('pageerror ' + e.message));
                    p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_|tile/i.test(m.text())) errors.push(m.text()); });
                    await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
                    await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.setModule && window.LCNDA_EXT?.mesCartes && window.LCNDA_EXT?.cartesOutils?.helpers && window.LCNDA_EXT?.diagramCartes);
                    if (dark) await p.evaluate(() => { const A = window.LCNDA_APP; localStorage.setItem('genealogie-design', JSON.stringify({ ...A.readDesignSettings(), preset: 'dark' })); A.applyDesign(); });
                    const shot = async n => { if (SHOTS) await p.screenshot({ path: path.join(SHOTS, `${n}-${tag}.png`) }); };
                    const noScroll = async () => assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'défilement de côté');
                    // la liste (H10 + K9)
                    await p.evaluate(() => window.LCNDA_EXT.mesCartes.open(null));
                    await p.waitForSelector('.mcp-page .ui-card, .mcp-page .ui-row', { timeout: 15000 });
                    const names = await p.$$eval('.mcp-page .ui-card-name, .mcp-page .ui-card h3, .mcp-page .ui-row b', e => e.map(x => x.textContent.trim()));
                    assert.ok(names.join('|').includes('Les BORIE') && names.join('|').includes('Images de lieux'), names.join('|'));
                    assert.ok(await p.$('.mcp-page .ui-listbar, .mcp-page [class*="listbar"]'), 'barre H10');
                    await noScroll(); await shot('mescartes-liste');
                    // la carte ouverte
                    await p.evaluate(id => window.LCNDA_EXT.mesCartes.open(id), mapId);
                    await p.waitForFunction(() => document.querySelectorAll('#mcp-svg .mcp-zone').length === 2, null, { timeout: 15000 });
                    assert.ok(await p.$('#mcp-svg .mcp-cone'), 'cône de prise de vue');
                    assert.ok(await p.$$eval('#mcp-svg .mcp-pt, #mcp-svg .mcp-cl', e => e.length) >= 2);
                    const leg = await p.$$eval('#mcp-legend .mcp-leg-row small', e => e.map(x => x.textContent.trim()));
                    assert.deepEqual(leg, ['2', '3', '3'], leg.join(','));
                    assert.ok(await p.$('[data-cpo-tools]'), 'les outils de la Carte restent là');
                    await noScroll(); await shot('mescartes-carte');
                    // le curseur du temps
                    await p.$eval('[data-mcp-t]', el => { el.value = '1860'; el.dispatchEvent(new Event('input', { bubbles: true })); });
                    assert.deepEqual(await p.$$eval('#mcp-legend .mcp-leg-row small', e => e.map(x => x.textContent.trim())), ['1', '1', '0']);
                    assert.equal((await p.textContent('[data-mcp-tl]')).trim(), '1860');
                    await p.click('[data-mcp-play]'); await p.waitForFunction(() => document.querySelector('[data-mcp-tl]').textContent.trim() === '1990', null, { timeout: 20000 });
                    await p.click('[data-mcp-tall]');
                    // ⤓ GeoJSON (sans la vivante)
                    const [dl] = await Promise.all([p.waitForEvent('download'), p.evaluate(() => window.LCNDA_EXT.mesCartes.exportGeo('geojson'))]);
                    const g = JSON.parse(fs.readFileSync(await dl.path(), 'utf8')); validGeoJSON(g);
                    assert.equal(g.features.length, 7); assert.ok(!JSON.stringify(g).includes('VIVANTE'));
                    // le panneau : cacher une couche, puis « ↶ Annuler »
                    if (!(await p.isVisible('#mcp-panel'))) await p.click('[data-mcp-panel-btn]');
                    await p.waitForSelector('#mcp-panel [data-mcp-vis="desc"]');
                    await shot('mescartes-panneau');
                    await p.$eval('#mcp-panel [data-mcp-vis="desc"]', el => { el.checked = false; el.dispatchEvent(new Event('change', { bubbles: true })); });
                    await p.waitForFunction(() => [...document.querySelectorAll('button')].some(b => /Annuler/.test(b.textContent) && b.closest('[class*=toast]')), null, { timeout: 8000 });
                    let s = await get('get', { id: mapId }); assert.equal(s.map.def.layers.find(l => l.id === 'desc').visible, false);
                    await p.evaluate(() => [...document.querySelectorAll('[class*=toast] button')].find(b => /Annuler/.test(b.textContent)).click());
                    await p.waitForFunction(() => window.LCNDA_EXT.mesCartes.state.map.def.layers.find(l => l.id === 'desc').visible === true, null, { timeout: 8000 });
                    await new Promise(r => setTimeout(r, 400));
                    s = await get('get', { id: mapId }); assert.equal(s.map.def.layers.find(l => l.id === 'desc').visible, true, 'remise par ↶ Annuler');
                    // ouvrir une couche (filtres et style : menu de choix, C2, C3, C4)
                    await p.click('#mcp-panel [data-mcp-expand="desc"]');
                    await p.waitForSelector('#mcp-panel [data-mcp-lbody="desc"] .pk'); assert.ok(await p.$('#mcp-panel [data-mcp-lbody="desc"] .ui-color'), 'couleur C2');
                    await noScroll();
                    // le widget du tableau de bord (dessin vectoriel, sans tuiles)
                    await p.evaluate(id => { const d = document.createElement('div'); d.id = 'mcp-test-w'; d.style.width = '600px'; document.body.appendChild(d); return window.LCNDA_EXT.mesCartes.embed(d, { mapId: id, height: 300 }); }, mapId);
                    assert.ok(await p.$('#mcp-test-w svg path'), 'widget dessiné');
                    assert.deepEqual(errors, []);
                    await ctx.close();
                });
            }
        } finally { await browser.close(); }
    } finally {
        proc.kill();
        fs.rmSync(tmp, { recursive: true, force: true });
    }
    done();
})();
function done() { if (failed) { console.error(`\n${failed} échec(s)`); process.exit(1); } console.log('\nTout est bon.'); }
