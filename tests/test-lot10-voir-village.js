#!/usr/bin/env node
/* 🖼️ Voir son village comme il le voyait (lot 10) — assets/js/heritage-lot10-voir-village.js, lib/lot10_voir_village.php,
 * assets/css/lot10-voir-village.css.
 *  1. Node : le calcul (chez lui, tableaux et photos de son vivant, forêts, tuiles) ; PHP : les dates de POP, la ligne de vue.
 *  2. Serveur et écran (php -S + Playwright, base temporaire) : rien ne part sur Internet (GENEALOGY_TEST=1 + LCNDA_TEST_L10V_DIR).
 *     Les réponses sont VRAIES : enregistrées le 2026-11-25 pour Honfleur (Calvados) — tests/fixtures/lot10-voir-village.json.gz
 *     (POP Joconde et Mémoire réduites aux champs lus ; Wikidata ; altimétrie, WFS BD TOPO et tuiles « Forêts anciennes » de l'IGN).
 *  Fiches : Jean MAZAUD (1840–1915, Honfleur), Marie LACOMBE (1925–2001, Honfleur), Paul DURAND (vivant, Honfleur).
 *   node tests/test-lot10-voir-village.js */
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
const H = require('../assets/js/heritage-lot10-voir-village.js');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const life = (person, places = [], events = []) => ({ok: true, person: {id: 1, gender: 'male', ...person}, places, events, jobs: []});
const HONFLEUR = {id: 1, name: 'Honfleur', country: 'France', lat: 49.419, lon: 0.233, insee: '14333'};
const phpPath = findPhp([devBundledPhp()]) || 'php';

(async () => {
    /* ═════════ 1. le calcul ═════════ */
    await t('chez lui : le lieu de France où on le trouve le plus longtemps (avec sa position)', async () => {
        const L = life({birth: 1840, death: 1915}, [{id: 1, name: 'Honfleur', lat: 49.419, lon: 0.233, from: 1840, to: 1915}, {id: 2, name: 'Paris', lat: 48.85, lon: 2.35, from: 1870, to: 1871},
            {id: 3, name: 'Londres', country: 'Royaume-Uni', lat: 51.5, lon: -0.12, from: 1850, to: 1915}, {id: 4, name: 'Sans position', from: 1800, to: 1915}]);
        assert.strictEqual(H.homeOf(L).name, 'Honfleur');
        assert.strictEqual(H.homeOf(life({birth: 1900}, [{id: 3, name: 'Londres', country: 'Royaume-Uni', lat: 51.5, lon: -0.12}])), null, 'hors de France : rien');
    });
    await t('🖼️ tableaux de son vivant (±5 ans), le plus proche de ses 25 ans d’abord ; un « 19e siècle » trop vague est écarté', async () => {
        const it = [{title: 'a', from: 1800, to: 1899}, {title: 'b', from: 1830, to: 1830}, {title: 'c', from: 1866, to: 1866}, {title: 'd', from: 1912, to: 1912}, {title: 'e', from: 1930, to: 1930}];
        assert.deepStrictEqual(H.paintingsForLife(it, life({birth: 1840, death: 1915})).map(x => x.title), ['c', 'd']);
        assert.deepStrictEqual(H.paintingsForLife(it, life({})), []);
    });
    await t('📷 photos de son vivant, la plus proche de ses 20 ans d’abord', async () => {
        const it = [{title: 'x', from: 1887, to: 1887}, {title: 'y', from: 1860, to: 1860}, {title: 'z', from: 1923, to: 1923}];
        assert.deepStrictEqual(H.photosForLife(it, life({birth: 1840, death: 1915})).map(x => x.title), ['y', 'x']);
    });
    await t('✈️ la photo d’avion de 1950 parle à ceux qui ont vécu entre 1935 et 1980 ; 🌳 la carte de 1850 à ceux d’avant 1920', async () => {
        assert.strictEqual(H.aerialFits(life({birth: 1840, death: 1915})), false); assert.strictEqual(H.aerialFits(life({birth: 1925, death: 2001})), true);
        assert.strictEqual(H.forestFits(life({birth: 1840, death: 1915})), true); assert.strictEqual(H.forestFits(life({birth: 1925, death: 2001})), false);
    });
    await t('🌳 l’histoire des bois : lisière d’un bois disparu, bois ancien, recul, avance', async () => {
        const F = (near, ha) => ({ok: true, near, ha, dir: {disparue: 'ouest', ancienne: 'sud'}});
        const z = [0, 0, 0];
        assert.strictEqual(H.forestStory(F({disparue: 120, ancienne: 900}, {ancienne: z, disparue: [1, 2, 3], recente: z})).kind, 'lisiere');
        assert.strictEqual(H.forestStory(F({disparue: null, ancienne: 400}, {ancienne: [0, 2, 9], disparue: z, recente: z})).kind, 'ancien');
        assert.strictEqual(H.forestStory(F({disparue: 900, ancienne: 1000}, {ancienne: [0, 0, 2], disparue: [0, 0, 20], recente: [0, 0, 1]})).kind, 'recul');
        assert.strictEqual(H.forestStory(F({disparue: null, ancienne: null}, {ancienne: z, disparue: z, recente: z})).kind, '');
    });
    await t('tuiles : la mosaïque couvre le cadre, adresses de la Géoplateforme (WMTS, PM)', async () => {
        const m = H.mosaic(49.419, 0.233, 16, 340, 230); assert.ok(m.length >= 4 && m.length <= 9);
        assert.ok(m.some(x => x.left <= 0) && m.some(x => x.left + 256 >= 340) && m.some(x => x.top <= 0) && m.some(x => x.top + 256 >= 230));
        const u = H.wmts('avion', 16, m[0].x, m[0].y); assert.match(u, /^https:\/\/data\.geopf\.fr\/wmts\?.*LAYER=ORTHOIMAGERY\.ORTHOPHOTOS\.1950-1965&.*TILEMATRIXSET=PM&TILEMATRIX=16&/);
        assert.match(H.wmtsTemplate('lidar'), /LAYER=IGNF_LIDAR-HD_MNT_ELEVATION\.ELEVATIONGRIDCOVERAGE\.SHADOW&.*TILEMATRIX=\{z\}&TILECOL=\{x\}&TILEROW=\{y\}/);
        assert.strictEqual(H.neighbourOf({country: 'Belgique'}), 'be'); assert.strictEqual(H.neighbourOf({country: 'France'}), '');
    });
    await t('PHP : les dates de POP (« 1873-1875 », « 1859 vers », « 2e moitié 19e siècle », « 1919 (avant) ») et la ligne de vue', async () => {
        const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php'; require 'lib/bootstrap.php'; require 'lib/lot10_voir_village.php';
$v1 = l10v_visible(100.0, [1000.0, 2000.0, 3000.0], [100.0, 300.0, 200.0], 230.0); // une colline de 300 m entre les deux : caché
$v2 = l10v_visible(100.0, [1000.0, 2000.0, 3000.0], [100.0, 120.0, 200.0], 230.0);  // plaine : visible
$v3 = l10v_visible(0.0, [20000.0, 40000.0], [0.0, 30.0], 40.0);                        // 40 km sur la mer, 40 m : sous l'horizon
echo json_encode([l10v_period('1873-1875'), l10v_period('1859 vers'), l10v_period('2e moitié 19e siècle'), l10v_period('1919 (avant)'), l10v_period('1er quart 20e siècle'), l10v_period(''),
  $v1['visible'], $v2['visible'], $v3['visible'], l10v_dir(44.0), l10v_names('Vue de la lieutenance à Honfleur', 'Honfleur'), l10v_names('Honfleurais', 'Honfleur')]);`], {cwd: root, encoding: 'utf8', env: {...process.env, GENEALOGY_DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-l10v-php-')), GENEALOGY_SKIP_REFERENCE: '1'}});
        const j = JSON.parse(r.stdout.trim().split('\n').pop());
        assert.deepStrictEqual(j, [[1873, 1875], [1859, 1859], [1850, 1899], [1909, 1919], [1900, 1924], null, false, true, false, 'nord-est', true, false]);
    });

    /* ═════════ 2. serveur et écran ═════════ */
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-l10v-')), net0 = path.join(tmp, 'net');
    fs.mkdirSync(path.join(tmp, 'media')); fs.mkdirSync(net0);
    const FX = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root, 'tests/fixtures/lot10-voir-village.json.gz'))).toString('utf8'));
    for (const [step, v] of Object.entries(FX.steps)) fs.writeFileSync(path.join(net0, step), v.b64 ? Buffer.from(v.b64, 'base64') : JSON.stringify(v.json));
    const calls = () => { try { return fs.readFileSync(path.join(net0, 'calls.log'), 'utf8').trim().split('\n').filter(Boolean); } catch (_) { return []; } };
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4', GENEALOGY_TEST: '1', LCNDA_TEST_L10V_DIR: net0};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start) VALUES(1,'Jean','MAZAUD','male','deceased',1),(2,'Marie','LACOMBE','female','deceased',0),(3,'Paul','DURAND','male','living',0)");
$pdo->exec("INSERT INTO places(id,name,county,country,latitude,longitude,admin4_code) VALUES(1,'Honfleur','Calvados','France',49.419,0.233,'14333'),(2,'Bruxelles','','Belgique',50.8467,4.3525,'')");
$t = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn();
$ins = $pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,date_text,year,sort_date,place_id) VALUES('person',?,?,?,?,?,?)");
$ins->execute([1,$t('BIRT'),'3 mai 1840',1840,'1840-05-03',1]); $ins->execute([1,$t('DEAT'),'1915',1915,'1915',1]);
$ins->execute([2,$t('BIRT'),'1925',1925,'1925',1]); $ins->execute([2,$t('DEAT'),'2001',2001,'2001',1]);
$ins->execute([3,$t('BIRT'),'1960',1960,'1960',1]);
echo json_encode(['ok' => 1]);`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0 || !/"ok"/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const errs = [];
    const tiles = [];
    try {
        const ctx = await browser.newContext({viewport: {width: 1440, height: 900}});
        await ctx.route(/^https:\/\//, r => { if (/data\.geopf\.fr\/wmts/.test(r.request().url())) tiles.push(r.request().url()); return r.abort(); }); // pas d'Internet dans l'essai
        const p = await ctx.newPage();
        p.on('pageerror', e => errs.push(e.message));
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_APP?.defaultPersonBlocks, null, {timeout: 30000});
        // index.php ne charge pas encore heritage-lot10-voir-village.js : on l'ajoute (comme le feront les balises)
        if (!(await p.evaluate(() => !!window.LCNDA_EXT?.voirVillage))) { await p.addStyleTag({url: base + 'assets/css/lot10-voir-village.css'}); await p.addScriptTag({url: base + 'assets/js/heritage-lot10-voir-village.js'}); }
        await p.waitForFunction(() => !!window.LCNDA_EXT?.voirVillage);
        const api = (x, q = {}) => p.evaluate(([y, z]) => window.LCNDA_APP.api(y, z).catch(e => ({error: e.message})), [x, q]);
        const post = (a, b) => p.evaluate(async ([x, y]) => { try { const r = await window.LCNDA_APP.api(x, {}, {method: 'POST', body: y}); return r.result || r; } catch (e) { return {error: e.message}; } }, [a, b]);

        await t('serveur 🖼️ : tableaux de Joconde qui NOMMENT Honfleur (pas ceux du seul musée d’Honfleur), notice + lien, pas d’image ; gardé', async () => {
            const n0 = calls().length;
            const r = await api('l10v_pop', {kind: 'tableaux', place_id: 1});
            assert.strictEqual(r.ok, true, JSON.stringify(r).slice(0, 300)); assert.ok(r.items.length >= 40, String(r.items.length));
            assert.ok(r.items.every(x => /^https:\/\/pop\.culture\.gouv\.fr\/notice\/joconde\/[\w-]+$/.test(x.url) && ['titre', 'sujet', 'lieu'].includes(x.why)));
            assert.ok(!r.items.some(x => /^Paysage de Susten en Suisse$/.test(x.title)), 'un tableau du musée d’Honfleur qui ne la représente pas : écarté');
            assert.ok(!JSON.stringify(r).includes('IMG') && !/\.jpg"/.test(JSON.stringify(r.items)), 'aucune image');
            const c = calls().slice(n0); assert.strictEqual(c.length, 1); assert.match(c[0], /^pop-joconde\.json https:\/\/api\.pop\.culture\.gouv\.fr\/search\/simple\?bases%5B%5D=joconde&text=Honfleur/);
            const again = await api('l10v_pop', {kind: 'tableaux', place_id: 1}); assert.strictEqual(again.cached, true); assert.strictEqual(calls().length, n0 + 1);
        });
        await t('serveur 📷 : photos de Mémoire datées 1850–1950, de la bonne commune (INSEE), au plus 20 dates par demande', async () => {
            const n0 = calls().length;
            const r = await api('l10v_pop', {kind: 'photos', place_id: 1});
            assert.strictEqual(r.ok, true); assert.ok(r.items.length >= 30, String(r.items.length));
            assert.ok(r.items.every(x => x.from >= 1840 && x.from <= 1950 && /^https:\/\/pop\.culture\.gouv\.fr\/notice\/memoire\//.test(x.url) && x.copy));
            const c = calls().slice(n0); assert.ok(c[0].startsWith('pop-memoire-dates.json ')); assert.ok(c.slice(1).every(l => (l.match(/facets%5BDATPV%5D/g) || []).length <= 20));
        });
        await t('serveur 🌳 🏠 🏔 : forêts (tuiles lues pixel par pixel), bâtiments anciens (BD TOPO), clochers visibles (relief)', async () => {
            const f = await api('l10v_forets', {lat: 49.419, lon: 0.233});
            assert.strictEqual(f.ok, true); assert.ok(f.tiles >= 9); assert.ok(f.ha.recente[2] > f.ha.ancienne[2] && f.bois1850 > 0, JSON.stringify(f.ha));
            const m = await api('l10v_maisons', {lat: 49.419, lon: 0.233});
            assert.strictEqual(m.ok, true); assert.ok(m.items.length > 100 && m.items.every(x => x.year < 1950 && x.m <= 300) && m.items[0].year < 1600);
            assert.match(calls().at(-1), /TYPENAMES=BDTOPO_V3:batiment/);
            const v0 = await api('l10v_vue', {lat: 49.419, lon: 0.233, cached_only: 1}); assert.strictEqual(v0.notcached, true, 'pas encore calculé : rien ne part');
            const v = await api('l10v_vue', {lat: 49.419, lon: 0.233});
            assert.strictEqual(v.ok, true); assert.strictEqual(v.tested, 30); assert.ok(v.items.length >= 3 && v.items.every(x => x.kind === 'clocher' && /^https:\/\/www\.wikidata\.org\/wiki\/Q\d+$/.test(x.url)));
            assert.ok(v.items.length < v.tested, 'le relief en cache une partie');
        });
        await t('serveur 🔒 : une personne vivante → rien ne part sur Internet ; hors ligne sans réponse gardée → un message', async () => {
            const n0 = calls().length;
            for (const [a, q] of [['l10v_pop', {kind: 'tableaux', name: 'Pont-l’Évêque', pid: 3}], ['l10v_vue', {lat: 49.3, lon: 0.18, pid: 3}], ['l10v_forets', {lat: 49.3, lon: 0.18, pid: 3}], ['l10v_maisons', {lat: 49.3, lon: 0.18, pid: 3}]]) {
                const r = await api(a, q); assert.strictEqual(r.private, true, a);
            }
            assert.strictEqual(calls().length, n0);
            fs.renameSync(path.join(net0, 'pop-joconde.json'), path.join(net0, 'pop-joconde.off'));
            const r = await api('l10v_pop', {kind: 'tableaux', name: 'Trouville-sur-Mer', insee: '14715'});
            fs.renameSync(path.join(net0, 'pop-joconde.off'), path.join(net0, 'pop-joconde.json'));
            assert.strictEqual(r.ok, false); assert.strictEqual(r.offline, true); assert.match(r.message, /connexion/);
        });

        await t('fiche de Jean MAZAUD (1840–1915, Honfleur) : 🖼️ peint de son vivant, 📷 photo de ses 20 ans, 🌳 bois de 1850 ; pas d’avion (mort en 1915)', async () => {
            const cl = await post('l10v_cache_clear', {}); assert.strictEqual(cl.ok, true); // on repart sans réponse gardée : 🏔 et 🏠 attendent un clic
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.currentPersonId = 1; A.setModule('personnes'); });
            await p.waitForSelector('[data-l10v-person="1"] .l10v-row', {timeout: 30000});
            const txt = await p.textContent('[data-l10v-person="1"]');
            assert.match(txt, /Chez lui : Honfleur/); assert.match(txt, /Honfleur peint de son vivant : .+ — il avait \d+ ans/);
            assert.match(txt, /photos? de Honfleur prises? de son vivant ; la plus proche de ses 20 ans/); assert.match(txt, /Vers 1850, .+ de bois à moins de 1,2 km/);
            assert.ok(!/vu d’avion/.test(txt)); assert.match(txt, /À la demande/); assert.match(txt, /▸ plus/);
            const a = await p.$$eval('[data-l10v-person="1"] a', l => l.map(x => [x.href, x.target, x.rel]));
            assert.ok(a.length && a.every(([h, tg, rel]) => /^https:\/\//.test(h) && tg === '_blank' && /noopener/.test(rel)));
            assert.strictEqual(await p.$$eval('[data-l10v-person="1"] img', l => l.length), 0, 'aucune image de POP');
            assert.strictEqual(await p.evaluate(() => document.querySelector('[data-l10v-person="1"]').closest('section.card').hidden), false);
        });
        await t('🔭 à la demande : 🏔 les clochers qu’il voyait, 🏠 les maisons de son temps (avant 1915), 🔍 le relief laser (tuiles LiDAR de l’IGN)', async () => {
            await p.click('[data-l10v-person="1"] [data-l10v-run="vue"]');
            await p.waitForSelector('[data-l10v-person="1"] [data-l10v-part="vue"]', {timeout: 15000});
            assert.match(await p.textContent('[data-l10v-person="1"] [data-l10v-part="vue"]'), /Depuis chez lui, on voyait \d+ clochers?, dont celui de .+ \(à [\d,]+ km au [a-z-]+\)/);
            await p.click('[data-l10v-person="1"] [data-l10v-run="maisons"]');
            await p.waitForSelector('[data-l10v-person="1"] [data-l10v-part="maisons"]', {timeout: 15000});
            assert.match(await p.textContent('[data-l10v-person="1"] [data-l10v-part="maisons"]'), /existaient déjà de son vivant \(avant 1915\) et sont encore debout ; le plus ancien : 14\d\d/);
            const t0 = tiles.length;
            await p.click('[data-l10v-person="1"] [data-l10v-run="lidar"]');
            await p.waitForSelector('[data-l10v-person="1"] [data-l10v-part="lidar"] .l10v-map img', {state: 'attached', timeout: 15000}); await sleep(500);
            assert.ok(tiles.slice(t0).some(u => /LAYER=IGNF_LIDAR-HD_MNT_ELEVATION/.test(u)), 'tuiles LiDAR demandées');
            await p.click('[data-l10v-person="1"] [data-l10v-part="lidar"] [data-l10v-zoom="1"]');
            assert.strictEqual(await p.getAttribute('[data-l10v-person="1"] [data-l10v-tiles="lidar"]', 'data-z'), '17');
        });
        await t('Marie LACOMBE (1925–2001) : ✈️ vu d’avion vers 1950, les tuiles s’affichent à l’ouverture (1950-1965 | aujourd’hui) ; pas de 🌳', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.currentPersonId = 2; A.setModule('personnes'); });
            await p.waitForSelector('[data-l10v-person="2"] [data-l10v-part="avion"]', {timeout: 30000});
            const txt = await p.textContent('[data-l10v-person="2"]');
            assert.match(txt, /Honfleur vu d’avion vers 1950, comme elle l’a connu/); assert.ok(!/de bois à moins/.test(txt));
            assert.strictEqual(await p.$$eval('[data-l10v-person="2"] [data-l10v-part="avion"] img', l => l.length), 0, 'rien n’est demandé avant d’ouvrir');
            const t0 = tiles.length;
            await p.click('[data-l10v-person="2"] [data-l10v-part="avion"] summary'); await sleep(600);
            const got = tiles.slice(t0); assert.ok(got.some(u => /ORTHOPHOTOS\.1950-1965/.test(u)) && got.some(u => /HR\.ORTHOIMAGERY\.ORTHOPHOTOS/.test(u)));
        });
        await t('Paul DURAND (vivant) : pas de bloc, rien ne part sur Internet (ni demande, ni tuile)', async () => {
            const n0 = calls().length, t0 = tiles.length;
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.currentPersonId = 3; A.setModule('personnes'); });
            await p.waitForSelector('[data-l10v-person="3"]', {state: 'attached', timeout: 20000}); await sleep(2500);
            assert.strictEqual(await p.evaluate(() => document.querySelector('[data-l10v-person="3"]').closest('section.card').hidden), true);
            assert.strictEqual(calls().length, n0); assert.strictEqual(tiles.length, t0);
        });
        await t('un lieu : la fiche d’un village (Honfleur, tout) ; un lieu de Belgique : seulement les liens vers les cartes anciennes', async () => {
            const html = await p.evaluate(async x => { const h = document.createElement('div'); document.body.appendChild(h); await window.LCNDA_EXT.voirVillage.placeInto(h, x); const r = h.innerHTML; h.remove(); return r; }, HONFLEUR);
            ['tableaux', 'photos', 'avion', 'forets', 'maisons', 'vue'].forEach(k => assert.match(html, new RegExp(`data-l10v-part="${k}"`), k));
            assert.match(html, /tableaux des musées de France représentent Honfleur/); assert.match(html, /photos anciennes de Honfleur \(1850–1950\)/);
            const be = await p.evaluate(async () => { const h = document.createElement('div'); document.body.appendChild(h); await window.LCNDA_EXT.voirVillage.placeInto(h, {name: 'Bruxelles', country: 'Belgique', lat: 50.8467, lon: 4.3525}); const r = h.innerHTML; h.remove(); return r; });
            assert.match(be, /data-l10v-part="voisins"/); assert.match(be, /Ferraris/); assert.ok(!/data-l10v-part="(tableaux|avion|forets)"/.test(be)); assert.ok(!/data-l10v-demand/.test(be));
            const none = await p.evaluate(async () => { const h = document.createElement('div'); document.body.appendChild(h); const n = await window.LCNDA_EXT.voirVillage.placeInto(h, {name: 'Lieu inconnu', country: 'Japon'}, {detached: true}); const r = [n, h.innerHTML]; h.remove(); return r; });
            assert.deepStrictEqual(none, [0, '']);
        });

        await t('Réglages → 🖼️ Voir son village : un sujet s’éteint (↶), fonds IGN à ajouter (↶), réponses gardées (oublier ↶), À propos des données', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'lot10_voir_village'; A.setModule('maintenance'); });
            await p.waitForSelector('[data-l10v-settings] table tbody tr', {timeout: 20000});
            const txt = await p.textContent('[data-l10v-settings]');
            assert.match(txt, /Licence Ouverte 2\.0/); assert.match(txt, /NON reprises/); assert.match(txt, /autorisation préalable/); assert.match(txt, /lues le 2026-11-25/); assert.match(txt, /Ferraris/);
            await p.click('[data-l10v-tg="photos"] input');
            assert.strictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-lot10-voir-village')).photos), false);
            await sleep(300); await p.locator('button:has-text("↶ Annuler")').last().click({timeout: 5000}); await sleep(300);
            assert.notStrictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-lot10-voir-village')).photos), false);
            if (await p.$('[data-l10v-addtile="forets"]')) {
                await p.click('[data-l10v-addtile="forets"]');
                const u = await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-tile-user') || '[]'));
                assert.ok(u.some(x => /^https:\/\/data\.geopf\.fr\/wmts\?.*LAYER=IGNF_FORETS-ANCIENNES/.test(x.url)));
                await sleep(300); await p.locator('button:has-text("↶ Annuler")').last().click({timeout: 5000}); await sleep(300);
                assert.strictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-tile-user') || '[]').length), 0);
            }
            await p.waitForSelector('[data-l10v-clear]'); await p.click('[data-l10v-clear]'); await sleep(500);
            assert.match(await p.textContent('[data-l10v-settings]'), /0 lieux et recherches gardés/);
            await p.locator('button:has-text("↶ Annuler")').last().click({timeout: 5000}); await sleep(800);
            const ab = await api('l10v_about'); assert.ok(ab.cache.count >= 5, JSON.stringify(ab.cache));
        });
        await t('registres : listes (colonne Source), monographie, dataSources, cartes, Où chercher', async () => {
            const r = await p.evaluate(async x => {
                const E = window.LCNDA_EXT, L = E.dataLists.filter(d => d.id.startsWith('l10v_'));
                const out = {ids: L.map(d => d.id), src: true, rows: {}};
                for (const d of L) { const rows = await d.load(); out.rows[d.id] = rows.length; if (!d.fields.some(f => f.key === 'src' && f.type === 'url') || !d.source) out.src = false; if (rows[0] && !/^https:\/\//.test(rows[0].src)) out.src = false; }
                const mono = E.monographSections.find(s => s.id === 'l10v_tableaux'), mh = document.createElement('div'); document.body.appendChild(mh);
                out.mono = [await mono.render({id: 1, name: x.name, latitude: x.lat, longitude: x.lon, country: 'France'}, mh, {}), mh.textContent]; mh.remove();
                const host = document.createElement('div'); document.body.appendChild(host);
                await E.dataSources.find(d => d.id === 'l10v_forets').run({place: x}, host); out.ds = host.textContent; host.remove();
                out.secs = E.monographSections.filter(s => s.id.startsWith('l10v_')).map(s => [s.id, s.defaultOn]);
                const layer = E.mapLayerSources.find(s => s.id === 'l10v_maisons'); out.map = (await layer.run({to: 1700})).features.length;
                out.ouc = (window.LCNDA_OUC_MONDE?.SITES || []).filter(s => s.key.startsWith('l10v_')).map(s => [s.key, s.url({place: 'Honfleur'})]);
                return out;
            }, HONFLEUR);
            ['l10v_tableaux', 'l10v_photos', 'l10v_vue', 'l10v_maisons', 'l10v_forets'].forEach(id => assert.ok(r.ids.includes(id) && r.rows[id] > 0, id + ' ' + r.rows[id]));
            assert.ok(r.src, 'colonne Source partout'); assert.strictEqual(r.mono[0], true); assert.match(r.mono[1], /représentent Honfleur/);
            assert.match(r.ds, /de bois/); assert.ok(r.map > 10);
            assert.deepStrictEqual(r.secs.map(s => s[0]), ['l10v_tableaux', 'l10v_photos', 'l10v_avion', 'l10v_forets', 'l10v_vue', 'l10v_maisons', 'l10v_lidar']);
            if (r.ouc.length) { assert.ok(r.ouc.every(([, u]) => /^https:\/\//.test(u))); assert.ok(r.ouc.some(([k, u]) => k === 'l10v_pop_memoire' && /recherche\?q=Honfleur/.test(u))); }
        });
        await t('aucune erreur JavaScript', async () => { assert.deepStrictEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill();
        try { fs.rmSync(tmp, {recursive: true, force: true}); } catch (_) {}
    }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})();
