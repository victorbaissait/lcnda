#!/usr/bin/env node
/* 🗺 Fonds de carte libres (assets/js/heritage-fonds-libres.js, petits branchements dans app.js) et carte du monde hors ligne
 * (lib/offline_map.php + assets/data/ne-monde-50m.json.gz, Natural Earth, domaine public).
 *  1. Node : les adresses des tuiles (services officiels, couches lues dans le GetCapabilities de la Géoplateforme), les attributions.
 *  2. PHP : une tuile hors ligne dessine les terres du monde même sans aucune commune dans la base.
 *  3. Écran (php -S + Playwright, base temporaire, AUCUN Internet : chaque tuile est interceptée et notée) :
 *     les fonds dans les menus, la bonne adresse demandée, l'attribution écrite sur la carte, Esri masqué au départ (et gardé avec
 *     son avertissement pour qui l'avait choisi), Réglages (↶ Annuler, aperçu), la carte hors ligne quand le réseau est coupé.
 *  Fiches : Jean MAZAUD, Marie LACOMBE, Paul DURAND (vivant).
 *   node tests/test-fonds-carte-libres.js */
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const {spawn, spawnSync} = require('child_process');
let chromium; try { ({chromium} = require('playwright')); } catch (_) { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); }
const root = path.join(__dirname, '..');
const {findPhp, phpRuntimeArgs, devBundledPhp} = require('../electron/php-server.js');
const F = require('../assets/js/heritage-fonds-libres.js');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const phpPath = findPhp([devBundledPhp()]) || 'php';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64');
const fond = k => F.FONDS.find(f => f.key === k);

(async () => {
    /* ═════════ 1. les adresses et les attributions ═════════ */
    await t('adresses : services officiels, couches de la Géoplateforme d’après son GetCapabilities, z/x/y dans le bon ordre', async () => {
        const z = 12, x = 2072, y = 1409; // Lyon
        assert.match(fond('ign_relief').url(z, x, y), /^https:\/\/data\.geopf\.fr\/wmts\?.*LAYER=ELEVATION\.ELEVATIONGRIDCOVERAGE\.SHADOW&STYLE=estompage_grayscale&TILEMATRIXSET=PM_0_15&TILEMATRIX=12&TILECOL=2072&TILEROW=1409&FORMAT=image\/png$/);
        assert.match(fond('ign_limites').url(z, x, y), /LAYER=LIMITES_ADMINISTRATIVES_EXPRESS\.LATEST&STYLE=normal&TILEMATRIXSET=PM_6_16&.*FORMAT=image\/png$/);
        assert.match(fond('ign_ortho_2000').url(z, x, y), /LAYER=ORTHOIMAGERY\.ORTHOPHOTOS2000-2005&STYLE=normal&TILEMATRIXSET=PM_6_18&TILEMATRIX=12&/);
        assert.match(fond('ign_ortho_2006').url(z, x, y), /LAYER=ORTHOIMAGERY\.ORTHOPHOTOS2006-2010&/);
        assert.match(fond('brgm_geol').url(5, 16, 11), /LAYER=BRGM_SCAN_F_GEOL1M&.*TILEMATRIXSET=PM_0_11/);
        assert.match(fond('brgm_geol').url(10, 518, 352), /LAYER=BRGM_SCAN_F_GEOL250&.*TILEMATRIXSET=PM_0_14/);
        assert.match(fond('brgm_geol').url(14, 8290, 5639), /LAYER=BRGM_SCAN_D_GEOL50&.*TILEMATRIXSET=PM_0_15/);
        assert.strictEqual(fond('ign_ortho_2000').url(4, 8, 5), '', 'sous le zoom 6 : le fond de secours');
        assert.match(fond('ign_limites').url(4, 8, 5), /^data:image\/gif/, 'une couche à superposer hors de sa zone : une tuile vide');
        assert.strictEqual(fond('topplus').url(z, x, y), 'https://sgx.geodatenzentrum.de/wmts_topplus_open/tile/1.0.0/web/default/WEBMERCATOR/12/1409/2072.png');
        assert.strictEqual(fond('basemap_at').url(12, 2234, 1420), 'https://mapsneu.wien.gv.at/basemap/geolandbasemap/normal/google3857/12/1420/2234.png', 'Vienne');
        assert.strictEqual(fond('basemap_at').url(z, x, y), '', 'hors d’Autriche : le fond de secours');
        const m = fond('ign_es_minutas').url(12, 2005, 1544); // Madrid
        assert.match(m, /^https:\/\/www\.ign\.es\/wms\/minutas-cartograficas\?SERVICE=WMS&VERSION=1\.3\.0&REQUEST=GetMap&LAYERS=Minutas&STYLES=&CRS=EPSG:3857&BBOX=-?\d+\.\d\d,-?\d+\.\d\d,-?\d+\.\d\d,-?\d+\.\d\d&WIDTH=256&HEIGHT=256&FORMAT=image\/png$/);
        const bb = m.match(/BBOX=([^&]+)/)[1].split(',').map(Number); assert.ok(bb[0] < -400000 && bb[2] > -420000 && bb[1] > 4900000 && bb[3] < 4960000, bb.join());
        assert.strictEqual(fond('orm_rail').url(z, x, y), 'https://tiles.openrailwaymap.org/standard/12/2072/1409.png');
        assert.strictEqual(fond('nasa_bluemarble').url(3, 4, 2), 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default//GoogleMapsCompatible_Level8/3/2/4.jpg');
        assert.strictEqual(fond('nasa_bluemarble').url(9, 4, 2), '', 'Blue Marble s’arrête au zoom 8');
    });
    await t('attributions : chaque fond a la sienne, sa licence (ouverte) et un lien « source » https', async () => {
        for (const f of F.FONDS) {
            const [txt, url] = F.attributionOf(f.key); assert.ok(txt && /^https:\/\//.test(url), f.key);
            assert.ok(/^https:\/\//.test(f.source) && /^https:\/\//.test(f.licenceUrl) && f.licence, f.key);
            assert.match(f.licence, /Licence Ouverte|CC BY|dl-de\/by-2-0|ODbL|Domaine public/, f.key);
        }
        assert.match(F.attributionOf('topplus')[0], new RegExp(`^© BKG \\(${new Date().getFullYear()}\\) dl-de\\/by-2-0`));
        assert.strictEqual(F.attributionOf('basemap_at')[0], 'Datenquelle : basemap.at (CC BY 4.0)');
        assert.match(F.attributionOf('esri')[0], /conditions d’utilisation d’Esri : usage limité, pas une carte libre/); assert.strictEqual(F.attributionOf('esri')[2], true);
        assert.deepStrictEqual(F.sourcesOf(['https://data.geopf.fr/wmts?SERVICE=WMTS&LAYER=BRGM_SCAN_D_GEOL50', 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/1/0/0', 'api.php?action=offline_tile&z=1&x=0&y=0', 'https://tile.openstreetmap.org/1/0/0.png']), ['brgm_geol', 'esri', 'offline', 'osm']);
        assert.deepStrictEqual(F.ESRI_KEYS.sort(), ['dark', 'esri_natgeo', 'esri_ocean', 'esri_physical', 'esri_relief', 'esri_street', 'esri_topo', 'light', 'minimal', 'roads', 'satellite']);
        assert.ok(F.LINKS_ONLY.length >= 4 && F.LINKS_ONLY.every(l => /^https:\/\//.test(l.url) && l.why), 'les refusés : un lien et la raison');
    });

    /* ═════════ 2. la carte du monde hors ligne ═════════ */
    await t('PHP : tuile hors ligne au zoom 2 sans aucune commune → les terres du monde (Natural Earth) ; données < 5 Mo', async () => {
        const size = fs.statSync(path.join(root, 'assets/data/ne-monde-50m.json.gz')).size; assert.ok(size < 5 * 1024 * 1024, String(size));
        const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php'; $p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; require_once 'lib/offline_map.php'; $pdo = db();
echo json_encode(['n' => (int) $pdo->query('SELECT count(*) FROM commune_contours')->fetchColumn(), 'w' => offline_tile_svg($pdo, 2, 2, 1), 'sea' => offline_tile_svg($pdo, 5, 14, 18), 'c' => count(offline_world_countries())]);`],
        {cwd: root, encoding: 'utf8', env: {...process.env, GENEALOGY_DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-lfc-php-')), GENEALOGY_SKIP_REFERENCE: '1'}});
        const j = JSON.parse(r.stdout.trim().split('\n').pop());
        assert.strictEqual(j.n, 0); assert.ok(j.c > 200, String(j.c));
        assert.match(j.w, /<path fill="#f7f3e8" stroke="#c4b9a2"[^>]* d="M[-\d. L]+Z/); assert.ok(j.w.length > 5000, 'l’Europe et l’Afrique dessinées');
        assert.ok(!/<path/.test(j.sea), 'plein Atlantique sud : que la mer');
    });

    /* ═════════ 3. serveur et écran ═════════ */
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-lfc-'));
    fs.mkdirSync(path.join(tmp, 'media'));
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4'};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start) VALUES(1,'Jean','MAZAUD','male','deceased',1),(2,'Marie','LACOMBE','female','deceased',0),(3,'Paul','DURAND','male','living',0)");
$pdo->exec("INSERT INTO places(id,name,county,country,latitude,longitude) VALUES(1,'Lyon','Rhône','France',45.7578,4.8320),(2,'Vienne','','Autriche',48.2082,16.3738)");
$t = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn();
$ins = $pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,date_text,year,sort_date,place_id) VALUES('person',?,?,?,?,?,?)");
$ins->execute([1,$t('BIRT'),'1840',1840,'1840',1]); $ins->execute([2,$t('BIRT'),'1871',1871,'1871',2]); $ins->execute([3,$t('BIRT'),'1960',1960,'1960',1]);
echo json_encode(['ok' => 1]);`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0 || !/"ok"/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const errs = [], net0 = [];
    try {
        const ctx = await browser.newContext({viewport: {width: 1400, height: 900}});
        // pas d'Internet dans l'essai : chaque requête externe est notée et reçoit une petite image
        let cut = false; // « Internet coupé » : les requêtes externes échouent (le serveur local de l'app, lui, répond toujours)
        await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => { net0.push(r.request().url()); return cut ? r.abort('internetdisconnected') : r.fulfill({status: 200, contentType: 'image/png', body: PNG}); });
        const p = await ctx.newPage();
        p.on('pageerror', e => errs.push(e.message));
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_APP?.mapBackgroundSelectHtml, null, {timeout: 30000});
        // index.php ne charge pas encore heritage-fonds-libres.js : on l'ajoute (comme le fera la balise)
        if (!(await p.evaluate(() => !!window.LCNDA_EXT?.fondsLibres))) await p.addScriptTag({url: base + 'assets/js/heritage-fonds-libres.js'});
        await p.waitForFunction(() => !!window.LCNDA_EXT?.fondsLibres);
        const menu = bg => p.evaluate(b => window.LCNDA_APP.mapBackgroundSelectHtml(b), bg);
        const setBg = bg => p.evaluate(b => { const d = JSON.parse(localStorage.getItem('genealogie-design') || '{}'); d.mapBackground = b; localStorage.setItem('genealogie-design', JSON.stringify(d)); window.LCNDA_APP.applyDesign?.(); }, bg);
        const openMap = async (mode = 'standard', overlay = '') => {
            await p.evaluate(([m, o]) => { const st = window.LCNDA_APP.state; st.mapMode = m; if (o) { st.mapOverlayBg = o; st.mapOverlayOpacity = 40; } window.LCNDA_APP.setModule('carte'); }, [mode, overlay]);
            await p.waitForSelector('#map-stage #map-tiles img', {state: 'attached', timeout: 20000}); await sleep(900);
        };
        const caption = () => p.$eval('#map-stage > .map-caption', el => ({text: el.textContent, links: [...el.querySelectorAll('a')].map(a => [a.href, a.target, a.rel])}));

        await t('menus « Fond » : les nouveaux fonds sont là (France, Europe, monde, couches), Esri n’y est plus au départ', async () => {
            const h = await menu('bw');
            for (const k of ['ign_relief', 'ign_limites', 'orm_rail', 'ign_ortho_2000', 'ign_ortho_2006', 'brgm_geol', 'topplus', 'basemap_at', 'ign_es_minutas', 'nasa_bluemarble', 'offline', 'cassini', 'swisstopo_dufour', 'nls_6inch'])
                assert.ok(h.includes(`value="${k}"`), k);
            for (const k of F.ESRI_KEYS) assert.ok(!h.includes(`value="${k}"`), 'Esri masqué : ' + k);
            assert.match(h, /— Couches à superposer \(mode Superposition\) —/); assert.match(h, /— Europe — fonds libres —/);
            assert.match(h, /Hors ligne \(carte du monde et communes, sans Internet\)/);
            assert.strictEqual(await p.evaluate(() => window.LCNDA_APP.mapTileUrl('topplus', 12, 2072, 1409)), 'https://sgx.geodatenzentrum.de/wmts_topplus_open/tile/1.0.0/web/default/WEBMERCATOR/12/1409/2072.png');
            assert.match(await p.evaluate(() => window.LCNDA_APP.mapTileUrl('basemap_at', 12, 2072, 1409)), /^https:\/\/tile\.openstreetmap\.org\/12\/2072\/1409\.png$/, 'hors d’Autriche : OSM');
            assert.match(await p.evaluate(() => window.LCNDA_APP.mapTileUrl('satellite', 3, 4, 2)), /server\.arcgisonline\.com/, 'Esri marche encore pour qui l’a choisi');
        });
        await t('Carte avec TopPlusOpen : les tuiles demandées au BKG, l’attribution exacte sur la carte (liens externes)', async () => {
            await setBg('topplus'); const n0 = net0.length; await openMap();
            assert.strictEqual(await p.$eval('#map-background', s => s.value), 'topplus');
            const got = net0.slice(n0); assert.ok(got.some(u => /^https:\/\/sgx\.geodatenzentrum\.de\/wmts_topplus_open\/tile\/1\.0\.0\/web\/default\/WEBMERCATOR\/\d+\/\d+\/\d+\.png$/.test(u)), got.slice(0, 3).join(' '));
            const c = await caption(); assert.match(c.text, new RegExp(`© BKG \\(${new Date().getFullYear()}\\) dl-de\\/by-2-0`));
            assert.ok(c.links.length && c.links.every(([h, tg, rel]) => /^https:\/\//.test(h) && tg === '_blank' && /noopener/.test(rel)));
        });
        await t('Superposition : relief ombré IGN par-dessus, transparence réglable, les deux attributions', async () => {
            await setBg('ign_ortho_2000'); const n0 = net0.length; await openMap('overlay', 'ign_relief');
            const got = net0.slice(n0);
            assert.ok(got.some(u => /LAYER=ELEVATION\.ELEVATIONGRIDCOVERAGE\.SHADOW&STYLE=estompage_grayscale/.test(u)), 'tuiles du relief');
            assert.ok(got.some(u => /LAYER=ORTHOIMAGERY\.ORTHOPHOTOS2000-2005/.test(u)), 'photos 2000-2005 dessous');
            assert.strictEqual(await p.$eval('#map-tiles-overlay', el => el.style.opacity), '0.4');
            assert.ok(await p.$('#map-overlay-opacity'), 'curseur de transparence');
            const c = await caption(); assert.match(c.text, /BD ORTHO® 2000-2005 · Licence Ouverte 2\.0/); assert.match(c.text, /estompage \(BD ALTI®\)/);
            await p.evaluate(() => { window.LCNDA_APP.state.mapMode = 'standard'; });
        });
        await t('Esri déjà choisi : la carte reste en Esri, le fond reste dans le menu, avec l’avertissement et le lien vers leurs conditions', async () => {
            await setBg('satellite'); const n0 = net0.length; await openMap();
            assert.strictEqual(await p.$eval('#map-background', s => s.value), 'satellite');
            assert.ok(net0.slice(n0).some(u => /server\.arcgisonline\.com\/ArcGIS\/rest\/services\/World_Imagery/.test(u)));
            const c = await caption(); assert.match(c.text, /conditions d’utilisation d’Esri : usage limité, pas une carte libre/);
            assert.ok(c.links.some(([h]) => h === F.ESRI_TERMS));
            assert.strictEqual(await p.$$eval('#map-background option', o => o.filter(x => /arcgis|Esri/.test(x.textContent)).length), 1, 'seul le fond en cours, pas les autres Esri');
        });
        await t('Réglages → Cartes et fonds de carte : « Fonds de carte libres », licences et ↗ source ; montrer Esri → ↶ Annuler', async () => {
            await setBg('bw');
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'design_maps'; A.setModule('maintenance'); });
            await p.waitForSelector('[data-lfc-panel]', {timeout: 20000});
            const txt = await p.textContent('[data-lfc-panel]');
            for (const s of ['TopPlusOpen', 'basemap.at', 'Blue Marble', 'Minutes cartographiques', 'Carte géologique (BRGM)', 'OpenRailwayMap', 'Swisstopo', 'National Library of Scotland', 'Natural Earth', 'Topotijdreis', 'Licences lues le 2026-11-25', 'pas une carte libre'])
                assert.ok(txt.includes(s), s);
            const links = await p.$$eval('[data-lfc-panel] a', l => l.map(a => [a.href, a.target, a.rel]));
            assert.ok(links.length >= 30 && links.every(([h, tg, rel]) => /^https:\/\//.test(h) && tg === '_blank' && /noopener/.test(rel)));
            assert.strictEqual(await p.$eval('[data-lfc-esri]', el => el.checked), false);
            await p.click('[data-lfc-esri]');
            await p.waitForFunction(() => [...document.querySelectorAll('.toast')].some(x => /Fonds Esri montrés/.test(x.textContent) && /Annuler/.test(x.textContent)), null, {timeout: 10000});
            assert.strictEqual(await p.evaluate(() => localStorage.getItem('genealogie-fonds-esri')), '1');
            assert.ok((await menu('bw')).includes('value="esri_topo"'), 'Esri montré');
            // le bouton « ↶ Annuler » du message des fonds Esri (le message glisse encore : clic direct)
            await p.evaluate(() => [...document.querySelectorAll('.toast')].reverse().find(x => /Fonds Esri montrés/.test(x.textContent)).querySelectorAll('button').forEach(b => { if (/Annuler/.test(b.textContent)) b.click(); }));
            await p.waitForFunction(() => localStorage.getItem('genealogie-fonds-esri') !== '1', null, {timeout: 5000}); await sleep(300);
            assert.ok(!(await menu('bw')).includes('value="esri_topo"'), '↶ Annuler : Esri à nouveau masqué');
            const n0 = net0.length;
            await p.waitForSelector('[data-lfc-panel]'); await p.click('[data-lfc-preview="basemap_at"]'); await sleep(500);
            assert.ok(net0.slice(n0).some(u => /^https:\/\/mapsneu\.wien\.gv\.at\/basemap\/geolandbasemap\/normal\/google3857\/12\/\d+\/\d+\.png$/.test(u)), 'aperçu : une tuile');
            assert.strictEqual(net0.length - n0, 1, 'une seule tuile pour l’aperçu');
        });
        await t('Internet coupé : une tuile qui ne vient pas est remplacée par la tuile hors ligne ; navigateur hors ligne → tout le fond hors ligne', async () => {
            await setBg('brgm_geol'); cut = true; await openMap(); await sleep(1200); // un fond pas encore affiché (pas dans le cache du navigateur)
            const swapped = await p.$$eval('#map-tiles img', l => l.map(i => i.getAttribute('src')));
            assert.ok(swapped.length && swapped.every(s => /^api\.php\?action=offline_tile&/.test(s)), 'chaque tuile ratée → hors ligne : ' + swapped.find(s => !/offline_tile/.test(s)));
            await p.evaluate(() => { Object.defineProperty(navigator, 'onLine', {configurable: true, get: () => false}); window.dispatchEvent(new Event('offline')); });
            const n0 = net0.length;
            await p.evaluate(() => window.LCNDA_APP.setModule('carte'));
            await p.waitForSelector('#map-stage #map-tiles img[src*="offline_tile"]', {state: 'attached', timeout: 20000}); await sleep(900);
            const srcs = await p.$$eval('#map-tiles img', l => l.map(i => i.getAttribute('src')));
            assert.ok(srcs.length && srcs.every(s => /^api\.php\?action=offline_tile&z=\d+&x=\d+&y=\d+$/.test(s)), srcs[0]);
            assert.strictEqual(net0.length, n0, 'rien n’est demandé à Internet');
            const svg = await p.evaluate(async s => (await fetch(s)).text(), srcs[0]);
            assert.match(svg, /^<svg[^>]*><rect width="256" height="256" fill="#e6ecf0"\/><path fill="#f7f3e8" stroke="#c4b9a2"/, 'les terres de Natural Earth');
            const c = await caption(); assert.match(c.text, /Made with Natural Earth \(domaine public\)/);
            await p.evaluate(() => { delete navigator.onLine; window.dispatchEvent(new Event('online')); }); cut = false;
        });
        await t('Paul DURAND (vivant) et les autres fiches : seules des tuiles de carte sont parties, sans aucun nom', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.currentPersonId = 3; A.setModule('personnes'); }); await sleep(1500);
            const bad = net0.filter(u => /MAZAUD|LACOMBE|DURAND|Lyon|Vienne/i.test(decodeURIComponent(u)) || !/(geopf\.fr\/wmts|geodatenzentrum\.de\/wmts_topplus_open|mapsneu\.wien\.gv\.at\/basemap|ign\.es\/wms|openrailwaymap\.org|gibs\.earthdata\.nasa\.gov|arcgisonline\.com\/ArcGIS\/rest\/services\/[\w/]+\/MapServer\/tile|openstreetmap\.(org|fr|de)\/|opentopomap\.org|wmts\.geo\.admin\.ch|mapseries-tilesets|nationalmap\.gov)/.test(u));
            assert.deepStrictEqual(bad.filter(u => !/(fonts\.|cdn|jsdelivr|unpkg|wikimedia|wikipedia|wikidata)/.test(u)), []);
        });
        await t('aucune erreur JavaScript', async () => { assert.deepStrictEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill();
    }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})();
