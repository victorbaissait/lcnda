'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🐾 Suivi des animaux (lib/suivi.php, assets/js/app-suivi-core.js, heritage-suivi.js, heritage-suivi-fiche.js ;
 * maquette docs/design/animaux-suivi.html) :   node tests/test-suivi-animaux.js
 *  0. le moteur seul (Node) : lecture douteuse « 7? » et « 7[K|X] » → bons candidats et scores, n° de puce en partie,
 *     couleurs (pattes inversées), code court, fiabilité ; lecteurs GPX, CSV Movebank, CSV d'un collier (Tractive),
 *     DOCTYPE / ENTITY refusés, taille bornée ; zone fréquentée, un point toutes les N min, couper en nuits ; exports ;
 *  1. le serveur (base neuve, migrations 65 et 66) : plusieurs médias par observation (et l'ancienne à un seul, migrée), animaux, marques selon l'espèce (oiseau, chat, chimpanzé, dauphin),
 *     observations (lecture brute + possibilités), santé (cause, poids), sites et comptages, groupes (entrée, rôle,
 *     exclusion, passage dans un autre groupe), supprimer puis « ↶ Annuler » (journal), import GPS + ↶ Annuler,
 *     menu de choix (🐾 🏞 👥), CSRF, mode consultation ;
 *  2. le navigateur (Playwright ; sinon sauté) à 1440 px, 390 px et en sombre : onglet caché puis allumé, page en blocs
 *     (S2), widgets habituels du tableau de bord dans le Suivi, réglage d'un bloc gardé tout de suite (K2), pages,
 *     « 📌 Mettre aussi dans le tableau de bord », fiche (onglets), bagues (couleurs de base + C2), « Nouvelle
 *     observation » (7[K|X] → Gaston), carte reliée, import GPX / Movebank / collier avec ↶ Annuler, santé, groupe
 *     (frise), Recensement (barre H10), exports, mode consultation sans POST, aucune erreur JavaScript.
 * Captures : SHOTS=dossier node tests/test-suivi-animaux.js
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const FX = path.join(__dirname, 'fixtures', 'animaux');
const S = require('../assets/js/app-suivi-core.js');
const SHOTS = process.env.SHOTS || '';
let failed = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };

const GASTON = {id: 1, title: 'Gaston', marks: [{kind: 'color_rings', colors: {L: [{color: '#1a8a3a'}, {metal: true}], R: [{color: '#d7262e'}, {color: '#ffffff', code: '7K'}]}}, {kind: 'metal', code: 'EA123456'}], last_obs: {lat: 48.892, lon: 2.39, iso: '2026-10-21'}};
const PRUNE = {id: 2, title: 'Prune', marks: [{kind: 'color_rings', colors: {L: [{color: '#1a8a3a'}, {color: '#f2c500'}], R: [{color: '#d7262e'}, {color: '#ffffff', code: '7A'}]}}], last_obs: {lat: 48.88, lon: 2.383, iso: '2026-10-09'}};
const HECTOR = {id: 3, title: 'Hector', marks: [{kind: 'color_rings', colors: {L: [{color: '#d7262e'}, {color: '#ffffff'}], R: [{color: '#1a8a3a'}, {metal: true, code: '7X'}]}}], last_obs: {lat: 48.885, lon: 2.37, iso: '2026-02-17'}};
const MINETTE = {id: 4, title: 'Minette', marks: [{kind: 'chip', code: '250269604124471'}, {kind: 'gps_collar', code: 'TRCAT4K7Q'}]};

(async () => {
    /* ═════ 0. le moteur seul ═════ */
    await t('lecture : « 7? » (pas lu), « 7[K|X] » (K ou X), « 3[3|8]… » ; texte et doutes', async () => {
        assert.deepEqual(S.parseReading('7?').chars, [['7'], null]);
        const r = S.parseReading('7[K|X]'); assert.deepEqual(r.chars, [['7'], ['K', 'X']]); assert.equal(r.doubtful, 1); assert.equal(r.text, '7[K|X]');
        assert.equal(S.parseReading('7 (k/x)').text, '7[K|X]');
        assert.equal(S.parseReading('3[3|8]…').partial, true);
    });
    await t('scores : sûr 100 %, doute (K ou X) plus bas, pas lu encore plus bas, caractère sûr faux = exclu', async () => {
        assert.equal(S.scoreCode('7K', '7K'), 1);
        const doubt = S.scoreCode('7[K|X]', '7K'), unk = S.scoreCode('7?', '7K');
        assert.ok(doubt < 1 && doubt > unk && unk > 0, `${doubt} ${unk}`);
        assert.equal(S.scoreCode('7[K|X]', '7A'), 0);
        assert.equal(S.scoreCode('8K', '7K'), 0);
        assert.equal(S.scoreCode('7K', '7KA'), 0, 'longueur différente');
    });
    await t('candidats : « 7? » → Gaston et Prune ; « 7[K|X] » → Gaston et Hector (pas Prune), Gaston d’abord grâce aux couleurs', async () => {
        const all = [GASTON, PRUNE, HECTOR, MINETTE];
        const a = S.candidates(all, {reading: '7?'}).map(c => c.animal.title);
        assert.deepEqual(a.sort(), ['Gaston', 'Hector', 'Prune']);
        const b = S.candidates(all, {reading: '7[K|X]'});
        assert.deepEqual(b.map(c => c.animal.title).sort(), ['Gaston', 'Hector']);
        assert.ok(b.every(c => c.pct < 100), 'un doute ne donne jamais 100 %');
        const c = S.candidates(all, {reading: '7[K|X]', colors: {L: ['vert', 'metal'], R: ['rouge', '?']}, lat: 48.892, lon: 2.39, iso: '2026-10-22'});
        assert.equal(c[0].animal.title, 'Gaston'); assert.ok(c[0].pct >= 80, c[0].pct); assert.equal(c[0].label, 'très probable');
        const exact = S.candidates(all, {reading: '7K'}); assert.equal(exact[0].pct, 100); assert.equal(exact.length, 1);
        // pattes inversées : Hector vu de face (vert et métal à gauche, rouge et blanc à droite)
        const m = S.candidates([HECTOR], {colors: {L: ['vert', 'metal'], R: ['rouge', 'blanc']}});
        assert.equal(m[0].mirrored, true); assert.ok(m[0].pct < 100);
    });
    await t('n° de puce en partie (« 250 26 9… », « …4471 », « 2502[6|8]9… »)', async () => {
        assert.equal(S.candidates([GASTON, MINETTE], {number: '250 26 9…'})[0].animal.title, 'Minette');
        assert.equal(S.candidates([MINETTE], {number: '…4471'}).length, 1);
        assert.equal(S.candidates([MINETTE], {number: '2502[6|8]9…'}).length, 1);
        assert.equal(S.candidates([MINETTE], {number: '999…'}).length, 0);
        assert.equal(S.candidates([MINETTE], {number: '250269604124471'})[0].pct, 100);
    });
    await t('code court « G V/M · D R/B « 7K » », couleurs choisies à la main (C2) ramenées à la plus proche, fiabilité', async () => {
        assert.equal(S.comboText(GASTON.marks[0].colors), 'G V/M · D R/B « 7K »');
        assert.equal(S.colorKey('#1b8c3b'), 'vert'); assert.equal(S.colorKey('#ff0000'), 'rouge'); assert.equal(S.RING_COLORS.length, 14);
        assert.equal(S.reliability({reading: '7K'}), 'full'); assert.equal(S.reliability({reading: '7[K|X]'}), 'partial'); assert.equal(S.reliability({reading: '7?'}), 'partial');
        assert.equal(S.reliability({colors: {L: ['vert', null], R: [null, null]}}), 'colors'); assert.equal(S.reliability({reading: '7K', tie: true}), 'doubt');
    });
    await t('marques selon l’espèce : oiseau, chat, chimpanzé, dauphin', async () => {
        assert.equal(S.guessProfile('oiseau'), 'oiseau'); assert.ok(S.PROFILES.oiseau.marks.includes('color_rings'));
        assert.equal(S.guessProfile('chat'), 'compagnie'); assert.ok(S.PROFILES.compagnie.marks.includes('chip') && S.PROFILES.compagnie.marks.includes('gps_collar') && !S.PROFILES.compagnie.marks.includes('color_rings'));
        assert.equal(S.guessProfile('sauvage', 'Chimpanzé'), 'primate'); assert.ok(S.PROFILES.primate.marks.includes('photo_id'));
        assert.equal(S.guessProfile('marin', 'Grand dauphin'), 'marin'); assert.equal(S.guessProfile('autre', 'Orque'), 'marin');
        assert.ok(['photo_id', 'satellite', 'fin_tag', 'pit'].every(k => S.PROFILES.marin.marks.includes(k)));
        assert.ok(['vhf_collar', 'ear_notch', 'ear_tag'].every(k => S.PROFILES.sauvage.marks.includes(k)));
        assert.ok(S.PROFILES.marin.sea && S.PROFILES.sauvage.camtrap);
    });
    const gpx = fs.readFileSync(path.join(FX, 'margot-mars.gpx'), 'utf8'), mb = fs.readFileSync(path.join(FX, 'margot-movebank.csv'), 'utf8'), tr = fs.readFileSync(path.join(FX, 'tractive-minette.csv'), 'utf8');
    await t('lecteurs : GPX (200 points, n° de balise), Movebank (96 points en UTC, une ligne vide sautée), collier Tractive (« ; » et virgule décimale, 2 nuits)', async () => {
        const a = S.parseTrack(gpx, 'margot-mars.gpx'); assert.equal(a.format, 'GPX'); assert.equal(a.points.length, 200); assert.deepEqual(a.ids, ['213547']);
        assert.equal(new Date(a.points[0][0] * 1000).toISOString(), '2026-03-03T06:00:00.000Z');
        const b = S.parseTrack(mb, 'margot-movebank.csv'); assert.equal(b.format, 'Movebank (CSV)'); assert.equal(b.points.length, 96); assert.equal(b.ignored, 1); assert.deepEqual(b.ids, ['Margot']);
        assert.equal(new Date(b.points[0][0] * 1000).toISOString(), '2026-03-10T00:00:00.000Z');
        const c = S.parseTrack(tr, 'tractive-minette.csv'); assert.equal(c.format, 'Tractive (CSV)'); assert.equal(c.points.length, 200); assert.ok(Math.abs(c.points[0][1] - 48.861) < 1e-6);
        assert.equal(S.splitTrips(c.points, 120).length, 2, 'deux nuits');
        assert.equal(S.thin(a.points, 15).length, 67, 'un point toutes les 15 min');
    });
    await t('fichiers refusés : DOCTYPE / ENTITY, trop gros, sans colonnes', async () => {
        assert.throws(() => S.parseTrack(fs.readFileSync(path.join(FX, 'piege-doctype.gpx'), 'utf8'), 'piege-doctype.gpx'), /DOCTYPE ou ENTITY/);
        assert.throws(() => S.parseGPX('x'.repeat(S.MAX_TEXT + 1)), /trop gros/);
        assert.throws(() => S.parseCSV('a,b\n1,2\n'), /latitude/);
        assert.throws(() => S.parseGPX('<gpx></gpx>'), /Aucun point/);
    });
    await t('géographie et exports : zone fréquentée, distance, GPX / KML / Movebank relus', async () => {
        const h = S.hull([[0, 48, 2], [0, 48.01, 2], [0, 48, 2.01], [0, 48.01, 2.01], [0, 48.005, 2.005]]);
        assert.equal(h.hull.length, 4); assert.ok(h.km2 > .8 && h.km2 < .85, h.km2);
        const a = S.parseTrack(gpx, 'x.gpx'), out = S.toGPX([{name: 'Margot', points: a.points}]);
        assert.equal(S.parseGPX(out).points.length, 200);
        assert.equal(S.parseKML(S.toKML([{name: 'Margot', points: a.points}])).points.length, 200);
        const mv = S.parseCSV(S.toMovebank([{name: 'Margot', tag: '213547', points: a.points}]), 'x.csv'); assert.equal(mv.points.length, 200); assert.equal(mv.format, 'Movebank (CSV)');
        assert.match(S.toCSV([['=SOMME(A1)', 'ok']]), /'=SOMME/, 'formule glissée neutralisée');
    });

    /* ═════ 1. le serveur ═════ */
    const phpPath = findPhp([devBundledPhp()]);
    if (!phpPath) { console.log('— PHP absent : partie serveur sautée'); return finish(); }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-suivi-'));
    const dir = path.join(tmp, 'data');
    const envFor = d => ({ ...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1' });
    fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO places(id,name,county,country,latitude,longitude) VALUES(1,'Parc des Buttes-Chaumont','Paris','France',48.8809,2.3828),(2,'Montreuil','Seine-Saint-Denis','France',48.861,2.44)");
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start) VALUES(1,'Antoine','LEROY','male','living',1),(2,'Claire','MARTIN','female','living',0)");
// plusieurs médias par observation : 4 photos et un son (la photo 5 montre une personne vivante : elle ne part jamais dans un partage)
$png = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==');
foreach ([1, 2, 3, 5] as $i) { file_put_contents(MEDIA_DIR . "/sv-photo-$i.png", $png); }
file_put_contents(MEDIA_DIR . '/sv-cri-4.mp3', str_repeat("\0", 64));
$pdo->exec("INSERT INTO media(id,title,media_type,filename,source_type) VALUES(901,'Gaston de face','image','sv-photo-1.png','local'),(902,'Gaston de dos','image','sv-photo-2.png','local'),(903,'Les pattes','image','sv-photo-3.png','local'),(904,'Son cri','audio','sv-cri-4.mp3','local'),(905,'Antoine et Gaston','image','sv-photo-5.png','local')");
$pdo->exec("INSERT INTO media_links(media_id,entity_type,entity_id) VALUES(905,'person',1)");
echo 'ok';`], { cwd: appRoot, encoding: 'utf8', env: envFor(dir) });
    if (seed.status !== 0 || !String(seed.stdout).includes('ok')) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const startServer = async d => {
        const port = await freePort();
        const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env: envFor(d), stdio: 'ignore' });
        const base = `http://127.0.0.1:${port}/`;
        for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
        let cookie = '';
        const html = await (await fetch(base).then(r => { cookie = (r.headers.get('set-cookie') || '').split(';')[0]; return r; })).text();
        const csrf = JSON.parse(html.match(/window\.INSTALL_CSRF = ("[^"]*")/)[1]);
        const get = async (action, q = {}) => (await fetch(`${base}api.php?action=${action}&${new URLSearchParams(q)}`, { headers: { Cookie: cookie } })).json();
        const post = async (action, body, token = csrf) => { const r = await fetch(`${base}api.php?action=${action}`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': token }, body: JSON.stringify({ ...body, csrf: token }) }); return { status: r.status, body: await r.json() }; };
        const w = async (op, body) => { const r = await post('suivi_write', { op, ...body }); assert.equal(r.status, 200, JSON.stringify(r.body)); return r.body.result; };
        return { proc, base, get, post, w };
    };
    const S1 = await startServer(dir);
    const { proc, base, get, post, w } = S1;
    const ids = {};
    try {
        await t('migrations 65 et 66 : les tables du suivi existent', async () => {
            const st = await get('schema_status'); assert.ok(st.version >= 66, String(st.version)); // 66 ou plus récent (67 : fiche animal unique)
            const o = await get('suivi', { op: 'overview' }); assert.deepEqual(o.observations, []); assert.ok(Array.isArray(o.animals));
        });
        await t('animaux et marques selon l’espèce (oiseau, chat, chimpanzé, dauphin)', async () => {
            ids.gaston = (await w('create_animal', { name: 'Gaston', species: 'oiseau', taxon: 'Corneille noire', profile: 'oiseau' })).id;
            ids.prune = (await w('create_animal', { name: 'Prune', species: 'oiseau', taxon: 'Corneille noire' })).id;
            ids.minette = (await w('create_animal', { name: 'Minette', species: 'chat' })).id;
            ids.kanzi = (await w('create_animal', { name: 'Kanzi', species: 'sauvage', taxon: 'Chimpanzé' })).id;
            ids.flipper = (await w('create_animal', { name: 'Flipper', species: 'marin', taxon: 'Grand dauphin' })).id;
            ids.akela = (await w('create_animal', { name: 'Akela', species: 'sauvage', taxon: 'Loup gris' })).id;
            const prof = async id => (await get('suivi', { op: 'animal', id })).guess;
            assert.equal(await prof(ids.gaston), 'oiseau'); assert.equal(await prof(ids.minette), 'compagnie'); assert.equal(await prof(ids.kanzi), 'primate'); assert.equal(await prof(ids.flipper), 'marin');
            await w('save_mark', { pet_id: ids.gaston, kind: 'color_rings', colors: { L: [{ color: '#1a8a3a' }, { metal: true }], R: [{ color: '#d7262e' }, { color: '#ffffff', code: '7K', code_color: '#111111' }] }, start_date: '12 mai 2025' });
            await w('save_mark', { pet_id: ids.gaston, kind: 'metal', code: 'EA123456', scheme: 'CRBPO', position: 'Gauche, en bas' });
            await w('save_mark', { pet_id: ids.prune, kind: 'color_rings', colors: { L: [{ color: '#1a8a3a' }, { color: '#f2c500' }], R: [{ color: '#d7262e' }, { color: '#ffffff', code: '7A' }] } });
            await w('save_mark', { pet_id: ids.minette, kind: 'chip', code: '250269604124471', start_date: '4 juin 2020' });
            await w('save_mark', { pet_id: ids.minette, kind: 'gps_collar', code: 'TRCAT4K7Q', model: 'Tractive CAT Mini', interval_min: 1 });
            await w('save_mark', { pet_id: ids.flipper, kind: 'photo_id', code: 'TT-042', position: 'Nageoire dorsale' });
            await w('save_mark', { pet_id: ids.flipper, kind: 'satellite', code: 'PTT 213547', interval_min: 60 });
            await w('save_mark', { pet_id: ids.akela, kind: 'vhf_collar', code: '150.240' });
            const bad = await post('suivi_write', { op: 'save_mark', pet_id: ids.minette, kind: 'chip', code: 'ABC' }); assert.equal(bad.status, 422);
            const forged = await w('save_mark', { pet_id: ids.akela, kind: 'pas_une_sorte', code: 'x' }); const m = (await get('suivi', { op: 'animal', id: ids.akela })).marks.find(x => x.id === forged.id); assert.equal(m.kind, 'other');
            const g = await get('suivi', { op: 'animal', id: ids.gaston });
            assert.equal(g.marks.find(x => x.kind === 'color_rings').colors.R[1].code, '7K');
        });
        await t('observations : lecture brute « 7[K|X] » + possibilités, sans animal possible, bornes', async () => {
            const site = await w('save_site', { name: 'Buttes-Chaumont', kind: 'Parc', place_id: 1, area_ha: 25, outline: [[48.883, 2.378], [48.883, 2.388], [48.878, 2.388]] }); ids.site = site.id;
            ids.obs1 = (await w('save_obs', { pet_id: ids.gaston, date: '21 octobre 2026', time: '8 h 40', lat: 48.8925, lon: 2.3906, site_id: ids.site, behaviors: ['se_nourrit', 'groupe'], count: 6, reading: '7[K|X]', reading_detail: { chars: [['7'], ['K', 'X']], colors: { L: ['vert', 'metal'], R: ['rouge', '?'] } }, reliability: 'partial', observer: 2 })).id;
            await w('save_obs', { pet_id: ids.gaston, date: '14 avril 2026', time: '06:00', place_id: 1, site_id: ids.site, reliability: 'full', reading: '7K', with: [ids.prune] });
            await w('save_obs', { pet_id: 0, date: '2 octobre 2026', lat: 48.884, lon: 2.37, count: 2, reliability: 'colors', note: '2 corneilles sans bague' });
            await w('save_obs', { pet_id: ids.flipper, date: '3 août 2026', lat: 43.2, lon: 5.2, sea: { depth_m: 12, group_size: 8, surface: 'sauts' }, source: 'mer' });
            const o = await get('suivi', { op: 'overview' });
            const a = o.observations.find(x => x.id === ids.obs1);
            assert.equal(a.reading, '7[K|X]'); assert.deepEqual(a.reading_detail.chars, [['7'], ['K', 'X']]); assert.equal(a.reliability, 'partial'); assert.equal(a.time, '08:40'); assert.equal(a.iso, '2026-10-21'); assert.equal(a.observer, 'Claire MARTIN');
            assert.equal(o.observations.find(x => x.pet_id === null).count, 2);
            assert.equal(o.observations.find(x => x.pet_id === ids.flipper).sea.depth_m, 12);
            const p = o.observations.find(x => x.iso === '2026-04-14'); assert.ok(Math.abs(p.lat - 48.8809) < 1e-6, 'coordonnées du lieu');
            assert.equal((await post('suivi_write', { op: 'save_obs', pet_id: ids.gaston, date: '', lat: 1 })).status, 422);
            const big = await w('save_obs', { pet_id: ids.gaston, date: 'hier', lat: 999, lon: 2, count: 1e12, behaviors: Array(50).fill('x') });
            const b = (await get('suivi', { op: 'overview' })).observations.find(x => x.id === big.id); assert.equal(b.lat, null); assert.equal(b.count, 10000000); assert.equal(b.behaviors.length, 1);
            await w('delete', { type: 'animal_obs', id: big.id });
        });
        await t('plusieurs médias par observation : 3 médias enregistrés et relus (ordre gardé), media_id = le premier, bornes, ancien envoi à un seul média', async () => {
            ids.obsM = (await w('save_obs', { pet_id: ids.gaston, date: '20 octobre 2026', time: '17:05', lat: 48.881, lon: 2.383, media_ids: [902, 901, 904], note: 'trois médias' })).id;
            const a = (await get('suivi', { op: 'animal', id: ids.gaston })).observations.find(x => x.id === ids.obsM);
            assert.deepEqual(a.media_ids, [902, 901, 904]); assert.equal(a.media_id, 902);
            const o = (await get('suivi', { op: 'overview' })).observations.find(x => x.id === ids.obsM); assert.deepEqual(o.media_ids, [902, 901, 904]);
            // texte « 1,2,3 », doublons, nombres faux et 40 au plus
            const many = await w('save_obs', { pet_id: ids.gaston, date: 'hier', lat: 48.8, lon: 2.3, media_ids: '903,903,-4,abc,' + Array.from({ length: 60 }, (_, i) => 1000 + i).join(',') });
            const m = (await get('suivi', { op: 'overview' })).observations.find(x => x.id === many.id); assert.equal(m.media_ids[0], 903); assert.equal(m.media_ids.length, 40); assert.ok(m.media_ids.every(x => x > 0));
            await w('delete', { type: 'animal_obs', id: many.id });
            // une app d'avant envoie encore media_id seul
            const old = await w('save_obs', { pet_id: ids.prune, date: '19 octobre 2026', lat: 48.88, lon: 2.38, media_id: 903 });
            const ob = (await get('suivi', { op: 'overview' })).observations.find(x => x.id === old.id); assert.deepEqual(ob.media_ids, [903]); assert.equal(ob.media_id, 903);
            // modifier : retirer tous les médias
            await w('save_obs', { id: old.id, pet_id: ids.prune, date: '19 octobre 2026', lat: 48.88, lon: 2.38, media_ids: [] });
            const ob2 = (await get('suivi', { op: 'overview' })).observations.find(x => x.id === old.id); assert.deepEqual(ob2.media_ids, []); assert.equal(ob2.media_id, null);
            await w('delete', { type: 'animal_obs', id: old.id });
        });
        await t('migration 66 : une ancienne observation à un seul média (media_id) reçoit sa liste media_ids', async () => {
            const d3 = path.join(tmp, 'data-m66'); fs.mkdirSync(path.join(d3, 'media'), { recursive: true });
            const run = code => spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], { cwd: appRoot, encoding: 'utf8', env: envFor(d3) });
            const a = run(String.raw`require 'lib/paths.php'; $p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec('ALTER TABLE animal_observations DROP COLUMN media_ids');
$pdo->exec("INSERT INTO animal_observations(obs_date, obs_iso, media_id) VALUES('1 mai 2024','2024-05-01',77),('2 mai 2024','2024-05-02',NULL)");
$pdo->exec('PRAGMA user_version = 65'); echo 'ok';`);
            assert.match(a.stdout, /ok/, a.stderr);
            const b = run(String.raw`require 'lib/paths.php'; require 'lib/bootstrap.php'; $pdo = db();
echo json_encode(['v' => (int) $pdo->query('PRAGMA user_version')->fetchColumn(), 'rows' => $pdo->query('SELECT media_id, media_ids FROM animal_observations ORDER BY id')->fetchAll(PDO::FETCH_ASSOC), 'out' => array_map(fn($o) => suivi_obs_out($o), $pdo->query('SELECT * FROM animal_observations ORDER BY id')->fetchAll(PDO::FETCH_ASSOC))]);`);
            const r = JSON.parse(b.stdout.trim().split('\n').pop());
            assert.ok(r.v >= 66, String(r.v)); assert.equal(r.rows[0].media_ids, '77'); assert.equal(r.rows[1].media_ids, '');
            assert.deepEqual(r.out[0].media_ids, [77]); assert.equal(r.out[0].media_id, 77); assert.deepEqual(r.out[1].media_ids, []);
        });
        await t('santé : état, cause, poids, soigné par, suite', async () => {
            await w('save_health', { pet_id: ids.minette, date: '10/10/2026', state: 'malade', what_kind: 'maladie', what_text: 'toux', cause: 'maladie', weight_g: 4200, carer: 'txt:Dr S. BERNARD', care: 'antibiotique 7 j' });
            await w('save_health', { pet_id: ids.akela, date: '18/10/2026', state: 'blesse', what_kind: 'blessure', cause: 'voiture', cause_text: 'route du col', weight_g: 38000 });
            const h = (await get('suivi', { op: 'animal', id: ids.akela })).health[0];
            assert.equal(h.cause, 'voiture'); assert.equal(h.weight_g, 38000); assert.equal(h.iso, '2026-10-18'); assert.equal(h.state, 'blesse');
            assert.equal((await post('suivi_write', { op: 'save_health', pet_id: 9999, date: '1/1/2026' })).status, 422);
        });
        await t('groupes : entrée (alpha), changement de rôle, exclusion, passage dans un autre groupe', async () => {
            ids.g1 = (await w('save_group', { name: 'Meute du Vercors', kind: 'meute', species: 'Loup gris' })).id;
            ids.g2 = (await w('save_group', { name: 'Meute de Belledonne', kind: 'meute', species: 'Loup gris' })).id;
            const m1 = await w('save_member', { pet_id: ids.akela, group_id: ids.g1, role: 'jeune', start_date: '2021', start_reason: 'naissance' });
            const m2 = await w('save_member', { id: m1.id, pet_id: ids.akela, group_id: ids.g1, role: 'jeune', start_date: '2021', start_reason: 'naissance', end_date: '2023', end_reason: 'role', new_role: 'alpha' });
            assert.ok(m2.next_id);
            await w('save_member', { id: m2.next_id, pet_id: ids.akela, group_id: ids.g1, role: 'alpha', start_date: '2023', start_reason: 'role', end_date: 'mars 2025', end_reason: 'exclu' });
            const m3 = await w('save_member', { pet_id: ids.kanzi, group_id: ids.g1, role: 'subordonné', start_date: '2024', end_date: 'juin 2026', end_reason: 'transfert', transfer_to: ids.g2, new_role: 'satellite' });
            const a = await get('suivi', { op: 'animal', id: ids.akela });
            assert.deepEqual(a.members.map(m => [m.role, m.start_reason, m.end_reason]), [['jeune', 'naissance', 'role'], ['alpha', 'role', 'exclu']]);
            const k = await get('suivi', { op: 'animal', id: ids.kanzi }); assert.deepEqual(k.members.map(m => [m.group_name, m.role]), [['Meute du Vercors', 'subordonné'], ['Meute de Belledonne', 'satellite']]); assert.ok(m3.next_id);
            const g = await get('suivi', { op: 'group', id: ids.g2 }); assert.equal(g.members.length, 1); assert.equal(g.members[0].start_reason, 'transfert');
        });
        await t('supprimer puis « ↶ Annuler » (journal) : observation, marque, site avec ses comptages, groupe avec son histoire', async () => {
            await w('save_count', { site_id: ids.site, date: '2 janvier 2026', time: '17 h 10', what: 'dortoir', number: 140, unit: 'corneilles', observer: 1 });
            await w('save_count', { site_id: ids.site, date: '5 décembre 2025', what: 'dortoir', number: 118 });
            for (const [type, id] of [['animal_obs', ids.obs1], ['track_site', ids.site], ['animal_group', ids.g1]]) {
                await w('delete', { type, id });
                const r = await post('restore_last_delete', { entity_type: type, entity_id: id }); assert.equal(r.status, 200, JSON.stringify(r.body));
            }
            const site = await get('suivi', { op: 'site', id: ids.site }); assert.equal(site.counts.length, 2); assert.equal(site.counts[0].observer, 'Antoine LEROY');
            assert.equal((await get('suivi', { op: 'group', id: ids.g1 })).members.length, 3);
            assert.ok((await get('suivi', { op: 'overview' })).observations.some(o => o.id === ids.obs1));
            const log = (await get('change_log', {})).changes || (await get('recent_changes', {})).items || [];
            void log;
            assert.equal((await post('suivi_write', { op: 'delete', type: 'persons', id: 1 })).status, 422, 'sorte forgée');
        });
        await t('import GPS par paquets (points déjà là sautés) puis ↶ Annuler', async () => {
            const pts = S.parseTrack(gpx, 'margot-mars.gpx').points;
            const r1 = await w('gps_import', { pet_id: ids.gaston, filename: 'margot-mars.gpx', format: 'GPX', points: pts.slice(0, 120) });
            const r2 = await w('gps_import', { pet_id: ids.gaston, import_id: r1.import_id, points: pts.slice(100) });
            assert.equal(r2.points, 200); assert.equal(r2.skipped, 20);
            const g = await get('suivi', { op: 'gps', pet_id: ids.gaston, max: 50 }); assert.equal(g.total, 200); assert.ok(g.points.length <= 50);
            assert.equal((await post('suivi_write', { op: 'gps_import', pet_id: ids.gaston, points: Array(5001).fill([0, 1, 1]) })).status, 422, '5 000 points au plus par envoi');
            await w('gps_undo', { import_id: r1.import_id });
            assert.equal((await get('suivi', { op: 'gps', pet_id: ids.gaston })).total, 0);
        });
        await t('menu de choix : 🐾 animaux (par code de bague ou n° de puce), 🏞 sites, 👥 groupes', async () => {
            const pk = async (kind, q) => (await get('picker_search', { kind, q })).groups[0].items.map(i => i.title);
            assert.deepEqual(await pk('pet', '7K'), ['Gaston']);
            assert.deepEqual(await pk('pet', '250269'), ['Minette']);
            assert.deepEqual(await pk('tsite', 'butt'), ['Buttes-Chaumont']);
            assert.deepEqual((await pk('agroup', 'meute')).sort(), ['Meute de Belledonne', 'Meute du Vercors']);
        });
        /* 📤 partager, ⤒ recevoir et fusionner (deuxième généalogie : un autre dossier de données) */
        const dir2 = path.join(tmp, 'data2'); fs.mkdirSync(path.join(dir2, 'media'), { recursive: true });
        spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', "require 'lib/paths.php'; $p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));"], { cwd: appRoot, env: envFor(dir2) });
        const S2 = await startServer(dir2);
        let pkgAll = null;
        try {
            await t('📤 partager : une fiche, une espèce, tout ; jamais de personne vivante par défaut', async () => {
                const one = await get('suivi', { op: 'share', scope: 'pets', ids: String(ids.gaston) });
                assert.equal(one.format, 'lcnda-suivi'); assert.equal(one.animals.length, 1); assert.match(one.animals[0].uuid, /^[0-9a-f-]{36}$/);
                assert.ok(one.animals[0].observations.every(o => /^[0-9a-f-]{36}$/.test(o.uuid))); assert.ok(one.sites.some(x => x.name === 'Buttes-Chaumont'));
                const sp = await get('suivi', { op: 'share', scope: 'species', species: 'oiseau' }); assert.deepEqual(sp.animals.map(a => a.name).sort(), ['Gaston', 'Prune']);
                pkgAll = await get('suivi', { op: 'share', scope: 'all' });
                assert.ok(pkgAll.animals.length >= 6); assert.ok(pkgAll.groups.length === 2); assert.ok(pkgAll.free_observations.length >= 1);
                const txt = JSON.stringify(pkgAll); assert.doesNotMatch(txt, /LEROY|MARTIN|BERNARD/, 'aucun nom de personne vivante');
                const named = JSON.stringify(await get('suivi', { op: 'share', scope: 'all', names: 1 })); assert.match(named, /Claire MARTIN/);
                const again = await get('suivi', { op: 'share', scope: 'pets', ids: String(ids.gaston) }); assert.equal(again.animals[0].uuid, one.animals[0].uuid, 'identifiant stable');
                const pv = await get('suivi', { op: 'share', scope: 'all', preview: 1 }); assert.equal(pv.animals, pkgAll.animals.length);
            });
            let receipt = 0;
            await t('⤒ recevoir dans une autre base : tout est nouveau ; puis ↶ Annuler remet la base comme avant', async () => {
                const an = (await S2.post('suivi_write', { op: 'share_analyze', package: pkgAll })).body.result;
                assert.equal(an.summary.animals_new, pkgAll.animals.length); assert.equal(an.summary.conflicts, 0);
                const r = (await S2.post('suivi_write', { op: 'share_apply', package: pkgAll, decisions: {}, source: 'Antoine' })).body.result;
                assert.ok(r.receipt); receipt = r.receipt;
                const o = await S2.get('suivi', { op: 'overview' });
                assert.ok(o.animals.some(a => a.title === 'Gaston' && a.marks.some(m => m.kind === 'color_rings')));
                assert.equal(o.observations.length, (await get('suivi', { op: 'overview' })).observations.length);
                assert.equal(o.groups.length, 2); assert.ok((await S2.get('suivi', { op: 'gps', pet_id: o.animals.find(a => a.title === 'Minette').id })).total >= 0);
                const k = o.animals.find(a => a.title === 'Kanzi'); assert.deepEqual((await S2.get('suivi', { op: 'animal', id: k.id })).members.map(m => m.group_name), ['Meute du Vercors', 'Meute de Belledonne']);
                const an2 = (await S2.post('suivi_write', { op: 'share_analyze', package: pkgAll })).body.result;
                assert.equal(an2.summary.animals_new, 0); assert.equal(an2.summary.lines_new, 0, 'tout est déjà là : doublons écartés'); assert.equal(an2.summary.conflicts, 0);
                const u = await S2.post('suivi_write', { op: 'share_undo', receipt }); assert.equal(u.status, 200, JSON.stringify(u.body));
                const o2 = await S2.get('suivi', { op: 'overview' }); assert.equal(o2.animals.length, 0); assert.equal(o2.observations.length, 0); assert.equal(o2.groups.length, 0);
                assert.equal((await S2.post('suivi_write', { op: 'share_undo', receipt })).status, 422, 'une seule fois');
            });
            await t('🔀 conflits (champ, observation modifiée, rôle) et choix mixtes → le résultat attendu, puis ↶ Annuler', async () => {
                await S2.w('share_apply', { package: pkgAll, decisions: {} });
                const o = await S2.get('suivi', { op: 'overview' }); const g2 = o.animals.find(a => a.title === 'Gaston'), ak2 = o.animals.find(a => a.title === 'Akela');
                // chez l'autre : Gaston change d'espèce écrite, une observation est modifiée ; chez moi : le sexe et la même observation autrement
                await S2.w('save_profile', { pet_id: g2.id, taxon: 'Corneille mantelée', profile: 'oiseau' });
                await w('save_profile', { pet_id: ids.gaston, taxon: 'Corneille noire (Paris)', profile: 'oiseau', program: 'Corneilles de Paris' });
                const myObs = (await get('suivi', { op: 'animal', id: ids.gaston })).observations.find(x => x.iso === '2026-04-14');
                await w('save_obs', { ...myObs, id: myObs.id, pet_id: ids.gaston, date: myObs.date, note: 'près du lac (corrigé)', place_id: myObs.place_id || 0, site_id: myObs.site_id || 0, reading_detail: myObs.reading_detail });
                const akm = (await get('suivi', { op: 'animal', id: ids.akela })).members.find(m => m.role === 'alpha');
                await w('save_member', { ...akm, role: 'alpha (dominant)' });
                await w('save_obs', { pet_id: ids.gaston, date: '22 octobre 2026', lat: 48.89, lon: 2.39, note: 'nouvelle' });
                const pkg = await get('suivi', { op: 'share', scope: 'all' });
                const an = (await S2.post('suivi_write', { op: 'share_analyze', package: pkg })).body.result;
                const ga = an.animals.find(a => a.name === 'Gaston');
                assert.equal(ga.status, 'match'); assert.equal(ga.match_by, 'identifiant');
                assert.deepEqual(ga.fields.map(f => f.field), ['taxon']); assert.ok(ga.filled.some(f => f.field === 'program'));
                const lc = ga.lines.filter(l => l.status === 'conflict'); assert.equal(lc.length, 1); assert.match(lc[0].theirs, /corrigé/);
                assert.ok(ga.lines.some(l => l.status === 'new' && /nouvelle/.test(l.theirs)));
                const akc = an.animals.find(a => a.name === 'Akela').lines.filter(l => l.status === 'conflict'); assert.equal(akc.length, 1); assert.equal(akc[0].kind, 'member');
                assert.equal(an.summary.conflicts, 3);
                // choix mixtes : garder mon espèce, prendre son observation corrigée, garder les deux rôles
                const dec = { animals: { [ga.uuid]: { mode: 'merge', fields: { taxon: 'mine' }, lines: { [lc[0].uuid]: 'theirs' } }, [an.animals.find(a => a.name === 'Akela').uuid]: { mode: 'merge', lines: { [akc[0].uuid]: 'both' } } } };
                const r = await S2.w('share_apply', { package: pkg, decisions: dec, source: 'Antoine' });
                const d2 = await S2.get('suivi', { op: 'animal', id: g2.id });
                assert.equal(d2.profile.taxon, 'Corneille mantelée', 'le mien gardé'); assert.equal(d2.profile.program, 'Corneilles de Paris', 'champ vide complété');
                assert.ok(d2.observations.some(x => x.note === 'près du lac (corrigé)'), 'le sien pris'); assert.equal(d2.observations.filter(x => x.iso === '2026-04-14').length, 1);
                assert.ok(d2.observations.some(x => x.note === 'nouvelle'));
                const roles = (await S2.get('suivi', { op: 'animal', id: ak2.id })).members.map(m => m.role); assert.ok(roles.includes('alpha') && roles.includes('alpha (dominant)'), roles.join(','));
                const log = await S2.get('recent_changes').catch(() => null); void log;
                await S2.w('share_undo', { receipt: r.receipt });
                const d3 = await S2.get('suivi', { op: 'animal', id: g2.id });
                assert.equal(d3.profile.program, ''); assert.ok(!d3.observations.some(x => x.note === 'nouvelle')); assert.ok(!d3.observations.some(x => /corrigé/.test(x.note)));
                assert.deepEqual((await S2.get('suivi', { op: 'animal', id: ak2.id })).members.map(m => m.role).sort(), ['alpha', 'jeune']);
            });
            await t('📤 partage avec plusieurs médias : tous partent (sauf une personne vivante) ; ⤒ réception d’une liste et de l’ancien format à un seul média ; ↶ Annuler juste', async () => {
                const om = await w('save_obs', { pet_id: ids.flipper, date: '5 août 2026', lat: 43.21, lon: 5.21, media_ids: [901, 905, 903], note: 'deux médias partagés' });
                const pkg = await get('suivi', { op: 'share', scope: 'pets', ids: String(ids.flipper) });
                const po = pkg.animals[0].observations.find(x => x.note === 'deux médias partagés');
                assert.deepEqual(po.medias, ['m901', 'm903'], 'la photo d’une personne vivante reste chez moi'); assert.equal(po.media, 'm901', 'le premier, pour une app d’avant');
                assert.deepEqual(pkg.media.map(m => m.key).sort(), ['m901', 'm903']);
                const noPhotos = await get('suivi', { op: 'share', scope: 'pets', ids: String(ids.flipper), photos: 0 });
                const np = noPhotos.animals[0].observations.find(x => x.note === 'deux médias partagés'); assert.deepEqual(np.medias, []); assert.equal(np.media, null);
                // de l'autre côté : les médias reçus ont d'autres numéros
                const ids2 = JSON.parse(spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', `require 'lib/paths.php'; require 'lib/bootstrap.php'; $pdo = db(); $pdo->exec("INSERT INTO media(title,media_type,filename,source_type) VALUES('a','image','a.png','local'),('b','image','b.png','local'),('c','image','c.png','local')"); echo json_encode(array_map('intval', $pdo->query('SELECT id FROM media ORDER BY id DESC LIMIT 3')->fetchAll(PDO::FETCH_COLUMN)));`], { cwd: appRoot, encoding: 'utf8', env: envFor(dir2) }).stdout.trim().split('\n').pop()).reverse();
                // l'ancien format (un seul média, sans « medias ») dans une observation sans animal
                pkg.free_observations = [{ uuid: 'abcdef12-0000-4000-8000-000000000001', date: '6 août 2026', lat: 43.3, lon: 5.3, note: 'ancien format', media: 'm903' }];
                const before = (await S2.get('suivi', { op: 'overview' })).observations.length;
                const r = await S2.w('share_apply', { package: pkg, decisions: { all: 'theirs' }, media_map: { m901: ids2[0], m903: ids2[1] }, source: 'Antoine' });
                const o2 = await S2.get('suivi', { op: 'overview' });
                const got = o2.observations.find(x => x.note === 'deux médias partagés'); assert.ok(got, 'observation reçue'); assert.deepEqual(got.media_ids, [ids2[0], ids2[1]]); assert.equal(got.media_id, ids2[0]);
                const oldf = o2.observations.find(x => x.note === 'ancien format'); assert.deepEqual(oldf.media_ids, [ids2[1]]);
                const an = (await S2.post('suivi_write', { op: 'share_analyze', package: pkg })).body.result; assert.equal(an.summary.lines_new, 0, 'déjà là');
                await S2.w('share_undo', { receipt: r.receipt });
                const o3 = await S2.get('suivi', { op: 'overview' }); assert.equal(o3.observations.length, before); assert.ok(!o3.observations.some(x => /deux médias partagés|ancien format/.test(x.note)));
                await w('delete', { type: 'animal_obs', id: om.id });
            });
            await t('fichier abîmé, autre format ou trop gros : refusé', async () => {
                assert.equal((await S2.post('suivi_write', { op: 'share_analyze', package: { format: 'autre' } })).status, 422);
                assert.equal((await S2.post('suivi_write', { op: 'share_analyze', package: { format: 'lcnda-suivi', version: 2 } })).status, 422);
                const big = { format: 'lcnda-suivi', version: 1, animals: [{ name: 'X', gps: Array.from({ length: 500001 }, (_, i) => [1700000000 + i, 1, 1]) }] };
                const r = await S2.post('suivi_write', { op: 'share_analyze', package: big }); assert.equal(r.status, 422); assert.match(r.body.error, /trop gros/i);
                const bad = await S2.post('suivi_write', { op: 'share_analyze', package: { format: 'lcnda-suivi', version: 1, animals: [{ name: '<script>', species: 'constructor', marks: [{ kind: 'x', code: 'y' }], observations: [{ date: '1/1/2026', lat: 999, reliability: 'pirate' }] }] } });
                assert.equal(bad.status, 200); assert.equal(bad.body.result.summary.animals_new, 1);
            });
        } finally { S2.proc.kill(); }
        await t('CSRF manquant refusé', async () => {
            assert.equal((await post('suivi_write', { op: 'save_site', name: 'x' }, 'faux')).status, 419);
        });

        /* ═════ 2. le navigateur ═════ */
        let chromium = null;
        try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); } catch (_) { try { ({ chromium } = require('playwright')); } catch (__) { /* sauté */ } }
        if (!chromium) { console.log('— Playwright absent : partie navigateur sautée'); return; }
        const browser = await chromium.launch();
        const errors = [];
        const shot = async (p, name, full = false) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: path.join(SHOTS, name), fullPage: full }); } };
        const noScroll = async p => assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'défilement de côté');
        const open = async (vp, dark = false) => {
            const ctx = await browser.newContext({ viewport: vp, colorScheme: dark ? 'dark' : 'light', acceptDownloads: true });
            const p = await ctx.newPage();
            p.on('pageerror', e => errors.push('pageerror ' + e.message));
            p.on('console', m => { if (m.type() === 'error' && !/net::|Failed to load resource/.test(m.text())) errors.push('console ' + m.text()); });
            await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
            await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.setModule && window.LCNDA_EXT?.suivi?.afterRender);
            if (dark) { await p.evaluate(() => { const A = window.LCNDA_APP; localStorage.setItem('genealogie-design', JSON.stringify({ ...A.readDesignSettings(), preset: 'dark' })); }); await p.reload(); await p.waitForFunction(() => window.LCNDA_EXT?.suivi?.afterRender); }
            return { ctx, p };
        };
        const navShown = p => p.evaluate(() => { const b = document.querySelector('.main-nav [data-module="suivi"]'); return !!b && b.style.display !== 'none'; });
        const clickC = async (p, sel) => { const l = p.locator(sel).first(); await l.evaluate(e => e.scrollIntoView({ block: 'center' })); await l.click(); };
        const goSuivi = async p => { await p.evaluate(() => window.LCNDA_APP.setModule('suivi')); await p.waitForSelector('.sv-page .dashboard-widget', { timeout: 10000 }); await p.waitForTimeout(600); };
        try {
            for (const [name, vp, dark] of [['1440', { width: 1440, height: 950 }, false], ['390', { width: 390, height: 844 }, false], ['sombre', { width: 1440, height: 950 }, true]]) {
                const { ctx, p } = await open(vp, dark);
                if (name === '1440') {
                    await t('S1 : l’onglet « 🐾 Suivi des animaux » est caché au départ, puis allumé (la phrase sur la liste des animaux, ↶ Annuler)', async () => {
                        assert.equal(await navShown(p), false);
                        await p.evaluate(() => { const A = window.LCNDA_APP; A.state.listType = 'pets'; A.state.hPet = 0; A.setModule('listes'); });
                        await p.waitForSelector('.sv-hint [data-sv-show-tab]', { timeout: 8000 });
                        await p.click('.sv-hint [data-sv-show-tab]');
                        assert.equal(await navShown(p), true);
                        await p.waitForSelector('.toast, .ui-toast, [class*="toast"]', { timeout: 3000 });
                        assert.equal(await p.evaluate(() => localStorage.getItem('genealogie-menu-suivi')), '1');
                    });
                }
                if (name !== '1440') await p.evaluate(() => { localStorage.setItem('genealogie-menu-suivi', '1'); localStorage.setItem('genealogie-menu-hidden', '[]'); window.LCNDA_APP.applyMenuOrder(); });
                await t(`[${name}] S2 : la page du Suivi en blocs (disposition de la maquette), colonne : blocs du Suivi puis « Autres widgets de l’app »`, async () => {
                    await goSuivi(p);
                    const types = await p.$$eval('.sv-page .dashboard-widget', x => x.map(e => e.dataset.widgetType));
                    if (name === '1440') assert.deepEqual(types, ['sv_map', 'sv_find', 'sv_recent', 'sv_missing', 'sv_animals', 'sv_stats']);
                    assert.ok(await p.$('.sv-page .sv-map svg circle, .sv-page .sv-map svg .sv-map-pt'), 'des points sur la carte');
                    const side = await p.$$eval('#sidebar-content .dashboard-widget-catalog > *', x => x.map(e => e.textContent.trim()));
                    const iOther = side.findIndex(s => /Autres widgets de l’app/.test(s)), iMap = side.findIndex(s => /Carte des observations/.test(s)), iStats = side.findIndex(s => /Chiffres clés/.test(s));
                    assert.ok(iMap > 0 && iOther > iMap && iStats > iOther, side.slice(0, 20).join(' | '));
                    if (name !== '1440') await noScroll(p);
                    await shot(p, `suivi-page-${name}.png`, name === '1440');
                });
                if (name === '1440') {
                    await t('widgets habituels dans le Suivi (Chiffres clés), réglage d’un bloc gardé tout de suite (K2, sans « Enregistrer »)', async () => {
                        await p.click('#sidebar-content [data-add-dashboard-widget="stats"]');
                        await p.waitForSelector('.sv-page [data-widget-type="stats"]', { timeout: 8000 });
                        const stored = await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-suivi-blocks')).pages[0].widgets.map(w => w.type));
                        assert.ok(stored.includes('stats') && stored.includes('sv_map'));
                        assert.equal(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-dashboard-blocks') || '{}').pages), undefined, 'le tableau de bord n’a pas bougé');
                        await p.click('.sv-page [data-widget-type="sv_missing"] [data-edit-dashboard-widget]');
                        await p.waitForSelector('[data-widget-type="sv_missing"] [data-sv-cfg-box]'); await p.waitForTimeout(300);
                        assert.equal(await p.isVisible('[data-widget-type="sv_missing"] [data-save-dashboard-widget]'), false, 'pas de bouton « Enregistrer »');
                        await p.fill('[data-widget-type="sv_missing"] [data-sv-cfg="days"]', '200'); await p.dispatchEvent('[data-widget-type="sv_missing"] [data-sv-cfg="days"]', 'change');
                        await p.click('[data-widget-type="sv_missing"] [data-block-width="12"]');
                        await p.waitForTimeout(200);
                        const w = await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-suivi-blocks')).pages[0].widgets.find(x => x.type === 'sv_missing'));
                        assert.equal(w.config.days, 200); assert.equal(w.width, '12');
                        assert.ok(await p.isVisible('[data-widget-type="sv_missing"] .sv-saved'), '« ✓ Enregistré »');
                        await p.click('.sv-page [data-widget-type="sv_missing"] [data-edit-dashboard-widget]');
                    });
                    await t('S15 : ＋ Nouvelle page (espèce, blocs proposés), pages en C5, filtre de la page', async () => {
                        await p.click('.sv-pagebar [data-sv-page-new]');
                        await p.fill('dialog[open] input[name="name"]', 'Loups'); await p.fill('dialog[open] input[name="icon"]', '🐺');
                        await p.selectOption('dialog[open] select[name="species"]', 'sauvage'); await p.fill('dialog[open] input[name="taxon"]', 'Loup');
                        await p.click('dialog[open] button[type="submit"]');
                        await p.waitForSelector('.sv-pagefilter', { timeout: 8000 });
                        assert.equal(await p.$$eval('.sv-pages [data-sv-page]', x => x.length), 2);
                        assert.match(await p.textContent('.sv-pagefilter'), /Loup/);
                        const types = await p.$$eval('.sv-page .dashboard-widget', x => x.map(e => e.dataset.widgetType));
                        assert.ok(types.includes('sv_groups') && types.includes('sv_health'), types.join(','));
                        assert.match(await p.textContent('[data-widget-type="sv_health"]'), /Akela/); assert.doesNotMatch(await p.textContent('[data-widget-type="sv_health"]'), /Minette/, 'le filtre de la page');
                        await shot(p, 'suivi-page-loups.png', true);
                        await p.click('.sv-pages [data-sv-page="pg_suivi"]'); await p.waitForTimeout(500);
                    });
                    await t('S19 : « 📌 Mettre aussi dans le tableau de bord » (⋯ du bloc) → le widget au tableau de bord, rubrique « 🐾 Suivi des animaux »', async () => {
                        await p.click('.sv-page [data-widget-type="sv_recent"] [data-dash-widget-more]');
                        await p.click('.ui-menu button:has-text("Mettre aussi dans le tableau de bord"), [role="menu"] button:has-text("Mettre aussi dans le tableau de bord")');
                        await p.evaluate(() => window.LCNDA_APP.setModule('dashboard'));
                        await p.waitForSelector('.dashboard-page [data-widget-type="sv_recent"]', { timeout: 8000 });
                        assert.match(await p.textContent('.dashboard-page [data-widget-type="sv_recent"] h3'), /🐾 Dernières observations/);
                        const side = await p.$$eval('#sidebar-content .dashboard-widget-catalog > *', x => x.map(e => e.textContent.trim()));
                        const iR = side.findIndex(s => /Suivi des animaux/.test(s)); assert.ok(iR > 5 && /Carte des observations/.test(side[iR + 1]), side.slice(-14).join(' | '));
                        await shot(p, 'tableau-de-bord-suivi.png');
                    });
                    await t('S5 : fiche d’un oiseau (« 🔖 Bagues et marques »), d’un chat, d’un dauphin (« 🔖 Marques ») ; couleurs de base + C2', async () => {
                        const marksOf = async id => { await p.evaluate(i => window.LCNDA_EXT.suivi.openPet(i, 'marks'), id); await p.waitForFunction(i => window.LCNDA_EXT.suivi.ficheCtx?.id === i && document.querySelector('[data-pblock="animal_marks"] .sv-pet-panel .card'), id, { timeout: 8000 }); return p.textContent('[data-pblock="animal_marks"] h3'); }; // 🐾 fiche animal unique : le bloc « Bagues et marques » de la fiche complète
                        assert.match(await marksOf(ids.gaston), /Bagues et marques/);
                        assert.match(await p.textContent('[data-pblock="animal_marks"] .sv-pet-panel'), /G V\/M · D R\/B « 7K »/);
                        await shot(p, 'fiche-gaston-marques.png', true);
                        await p.click('[data-sv-rings-edit]'); await p.waitForSelector('dialog[open] .sv-palette');
                        assert.equal(await p.$$eval('dialog[open] .sv-palette [data-col]:not([data-col="none"])', x => x.length), 14);
                        assert.ok(await p.waitForFunction(() => { const e = document.querySelector('dialog[open] input[type=color][data-ring-color]'); return e && (!!e.dataset.uiDone || !!e.closest('[class*="ui-color"]') || e.hidden || getComputedStyle(e).display === 'none'); }, null, { timeout: 5000 }).then(() => true, () => false), 'la couleur passe par C2');
                        await p.click('dialog[open] [data-slot="L0"]'); await p.click('dialog[open] .sv-palette [data-col="bleu_clair"]');
                        await p.fill('dialog[open] input[name="date"]', '3 février 2026'); await p.fill('dialog[open] input[name="reason"]', 'usée');
                        await p.click('dialog[open] button[type="submit"]'); await p.waitForTimeout(1200);
                        const g = await get('suivi', { op: 'animal', id: ids.gaston });
                        const rings = g.marks.filter(m => m.kind === 'color_rings'); assert.equal(rings.length, 2); assert.ok(rings.some(m => m.end_date === '3 février 2026'));
                        assert.equal(rings.find(m => !m.end_date).colors.L[0].color, '#5ab4f0');
                        const cat = await marksOf(ids.minette); assert.match(cat, /🔖 Marques/); assert.doesNotMatch(cat, /Bagues/);
                        await p.click('[data-sv-mark-add]'); const items = await p.$$eval('.ui-menu button, [role="menu"] button', x => x.map(e => e.textContent)); await p.keyboard.press('Escape');
                        assert.ok(items.some(s => /Puce/.test(s)) && items.some(s => /Collier GPS/.test(s)) && !items.some(s => /Bagues de couleur/.test(s)), items.join('|'));
                        await marksOf(ids.flipper); await p.click('[data-sv-mark-add]'); const it2 = await p.$$eval('.ui-menu button, [role="menu"] button', x => x.map(e => e.textContent)); await p.keyboard.press('Escape');
                        assert.ok(it2.some(s => /Photo-identification/.test(s)) && it2.some(s => /Argos/.test(s)) && it2.some(s => /nageoire/i.test(s)), it2.join('|'));
                        await marksOf(ids.kanzi); await p.click('[data-sv-mark-add]'); const it3 = await p.$$eval('.ui-menu button, [role="menu"] button', x => x.map(e => e.textContent)); await p.keyboard.press('Escape');
                        assert.ok(it3.some(s => /Photo-identification/.test(s)), it3.join('|'));
                    });
                    await t('S7 : « Nouvelle observation » : « 7[K|X] » → Gaston (doute), pas Prune ; « 7? » → les deux ; créée avec « Lecture partielle »', async () => {
                        await p.evaluate(() => { window.LCNDA_EXT.suivi.openObservation({}); });
                        await p.waitForSelector('dialog[open] [data-reading]');
                        await p.fill('dialog[open] [data-reading]', '7?'); await p.waitForTimeout(200);
                        let c = await p.$$eval('dialog[open] [data-cand] b', x => x.map(e => e.textContent)); assert.ok(c.includes('Gaston') && c.includes('Prune'), c.join(','));
                        await p.fill('dialog[open] [data-reading]', '7[K|X]'); await p.waitForTimeout(200);
                        c = await p.$$eval('dialog[open] [data-cand] b', x => x.map(e => e.textContent)); assert.ok(c.includes('Gaston') && !c.includes('Prune'), c.join(','));
                        assert.match(await p.textContent('dialog[open] [data-chars]'), /K\|X/);
                        assert.match(await p.textContent('dialog[open] [data-rel]'), /Lecture partielle/i);
                        await clickC(p, 'dialog[open] [data-legs] [data-slot="L0"]'); await clickC(p, 'dialog[open] .sv-palette [data-col="bleu_clair"]'); // ses bagues ont changé en S5
                        await clickC(p, 'dialog[open] [data-cand]:has-text("Gaston")');
                        await shot(p, 'observation-7KX.png');
                        await p.fill('dialog[open] input[name="lat"]', '48.8810').catch(() => {});
                        await p.evaluate(() => { const d = document.querySelector('dialog[open]'); d.querySelector('input[name="lat"]').value = '48.881'; d.querySelector('input[name="lon"]').value = '2.383'; });
                        await p.click('dialog[open] button[type="submit"]'); await p.waitForTimeout(1200);
                        const o = (await get('suivi', { op: 'overview' })).observations.find(x => x.reading === '7[K|X]' && x.lat === 48.881);
                        assert.ok(o, 'observation créée'); assert.equal(o.pet_id, ids.gaston); assert.equal(o.reliability, 'partial'); assert.deepEqual(o.reading_detail.chars, [['7'], ['K', 'X']]); assert.equal(o.reading_detail.colors.L[0], 'bleu_clair');
                        await p.evaluate(i => window.LCNDA_EXT.suivi.openPet(i, 'obs'), ids.gaston); await p.waitForSelector('.sv-obs-table');
                        const txt = await p.textContent('.sv-obs-table'); assert.match(txt, /lecture : 7\[K\|X\] \(doute\)/); assert.match(txt, /Lecture partielle/i);
                    });
                    await t('plusieurs médias : la fenêtre (« Photos, sons ou vidéos », 3 relus), vignettes 3 au plus + « +N » dans la fiche, le bloc et la bulle de la carte ; clic = la visionneuse sur la série', async () => {
                        const big = await w('save_obs', { pet_id: ids.gaston, date: '22 octobre 2026', time: '18:00', lat: 48.8812, lon: 2.3832, media_ids: [901, 902, 903, 904], note: 'quatre médias' });
                        await p.evaluate(i => window.LCNDA_EXT.suivi.openPet(i, 'obs'), ids.gaston); await p.waitForSelector('.sv-obs-table');
                        const row = p.locator(`.sv-obs-table tr[data-sv-obs="${big.id}"]`);
                        await p.waitForFunction(id => document.querySelectorAll(`.sv-obs-table tr[data-sv-obs="${id}"] .sv-mthumb img`).length === 3, big.id, { timeout: 8000 });
                        assert.equal(await row.locator('.sv-mthumb').count(), 4); assert.equal((await row.locator('.sv-mthumb.is-more').textContent()).trim(), '+1');
                        const three = p.locator(`.sv-obs-table tr[data-sv-obs="${ids.obsM}"]`); await p.waitForFunction(id => document.querySelectorAll(`.sv-obs-table tr[data-sv-obs="${id}"] .sv-mthumb[data-h]`).length === 3, ids.obsM);
                        assert.equal(await three.locator('.sv-mthumb').count(), 3); assert.equal(await three.locator('.sv-mthumb.is-more').count(), 0);
                        assert.match(await three.locator('.sv-mthumb').nth(2).innerHTML(), /🎧/, 'le son a son icône');
                        await shot(p, `obs-medias-${name}.png`);
                        await row.locator('.sv-mthumb.is-more').click();
                        await p.waitForFunction(() => { const lb = document.querySelector('#lightbox'); return lb && !lb.hidden && getComputedStyle(lb).display !== 'none'; }, null, { timeout: 5000 });
                        const lbN = await p.evaluate(() => [window.LCNDA_APP.state.lightboxMedia.length, window.LCNDA_APP.state.lightboxIndex, window.LCNDA_APP.state.lightboxMedia.map(m => m.id)]).catch(() => null);
                        if (lbN) { assert.equal(lbN[0], 4); assert.equal(lbN[1], 3); assert.deepEqual(lbN[2], [901, 902, 903, 904]); }
                        await shot(p, `obs-medias-visionneuse-${name}.png`);
                        await p.keyboard.press('Escape'); await p.waitForTimeout(300);
                        // la bulle d'un point de la carte et le bloc « Dernières observations »
                        const pop = await p.evaluate(o => { const U = window.LCNDA_EXT.suivi.U; const d = document.createElement('div'); d.innerHTML = U.obsPopup(o, { title: 'Gaston', species: 'oiseau' }, { sites: [] }); return [d.querySelectorAll('.sv-mthumb').length, d.querySelector('.sv-mthumb.is-more')?.textContent]; }, { id: big.id, iso: '2026-10-22', time: '18:00', lat: 1, lon: 1, media_ids: [901, 902, 903, 904, 905] });
                        assert.deepEqual(pop, [4, '+2']);
                        if (name === '1440') {
                            await goSuivi(p);
                            const n = await p.evaluate(id => document.querySelectorAll(`.sv-page [data-sv-obs="${id}"] .sv-mthumb`).length, big.id);
                            if (n) assert.equal(n, 4);
                            // la fenêtre de modification relit les 4 médias
                            await p.evaluate(async id => { const D = await window.LCNDA_EXT.suivi.overview(true); window.LCNDA_EXT.suivi.openObservation({ obs: D.observations.find(o => o.id === id) }); }, big.id);
                            await p.waitForSelector('dialog[open] .pk-lab:has-text("Photos, sons ou vidéos")');
                            const v = await p.evaluate(() => document.querySelector('dialog[open] [name="media_ids"]')?.value || ''); assert.equal(v, '901,902,903,904');
                            await shot(p, 'obs-medias-fenetre.png');
                            await p.click('dialog[open] button[type="submit"]'); await p.waitForTimeout(1000);
                            const again = (await get('suivi', { op: 'overview' })).observations.find(x => x.id === big.id); assert.deepEqual(again.media_ids, [901, 902, 903, 904], 'gardés après « Enregistrer »');
                        }
                        await w('delete', { type: 'animal_obs', id: big.id });
                    });
                    await t('S8 : la carte en grand, points reliés dans l’ordre (interrupteur), ▶ Rejouer', async () => {
                        await p.evaluate(() => { window.LCNDA_EXT.suivi.openBigMap({ config: {} }); });
                        await p.waitForSelector('dialog[open] .sv-map svg .sv-map-pt');
                        assert.ok(await p.$('dialog[open] .sv-map svg polyline'), 'relié');
                        await p.click('dialog[open] .ui-toggle:has([data-link])'); await p.waitForTimeout(400);
                        assert.equal(await p.$('dialog[open] .sv-map svg polyline'), null, 'plus relié');
                        assert.ok(await p.$('dialog[open] [data-play]'));
                        await shot(p, 'carte-en-grand.png');
                        await p.keyboard.press('Escape');
                    });
                    await t('S9 : import GPX, Movebank et collier par la fenêtre K13, puis ↶ Annuler', async () => {
                        const imp = async (file, pet, expect) => {
                            await p.evaluate(i => { window.LCNDA_EXT.suivi.importGps({ petId: i }); }, pet);
                            await p.waitForSelector('dialog.k-import input[type=file]', { state: 'attached' });
                            await p.setInputFiles('dialog.k-import input[type=file]', path.join(FX, file));
                            await p.waitForSelector('dialog.k-import [data-k-go]:not([disabled])', { timeout: 8000 });
                            assert.match(await p.textContent('dialog.k-import'), expect);
                            await p.click('dialog.k-import [data-k-go]');
                            await p.waitForSelector('dialog.k-import', { state: 'detached', timeout: 10000 });
                        };
                        await imp('margot-mars.gpx', ids.prune, /200 points/);
                        assert.equal((await get('suivi', { op: 'gps', pet_id: ids.prune })).total, 200);
                        await p.locator('.ui-toast .ui-toast-btn:has-text("Annuler")').last().click();
                        await p.waitForTimeout(1200);
                        assert.equal((await get('suivi', { op: 'gps', pet_id: ids.prune })).total, 0, '↶ Annuler retire les points');
                        await imp('margot-movebank.csv', ids.prune, /96 points/);
                        await imp('tractive-minette.csv', ids.minette, /Tractive/);
                        assert.equal((await get('suivi', { op: 'gps', pet_id: ids.minette })).total, 200);
                        await p.evaluate(i => window.LCNDA_EXT.suivi.openPet(i, 'map'), ids.minette);
                        await p.waitForSelector('.sv-trips [data-trip]', { timeout: 8000 });
                        assert.equal(await p.$$eval('.sv-trips [data-trip]:not([data-trip="all"])', x => x.length), 2, 'deux nuits');
                        await shot(p, 'fiche-minette-trajets.png', true);
                    });
                    await t('S17–S18 : santé (cause, poids) depuis la fiche, frise et courbe', async () => {
                        await p.evaluate(i => window.LCNDA_EXT.suivi.openPet(i, 'health'), ids.akela);
                        await p.waitForSelector('[data-sv-h-new]'); await p.click('.sv-health-head [data-sv-h-new]');
                        await p.waitForSelector('dialog[open] [data-seg="cause"]'); await p.waitForTimeout(300);
                        await p.fill('dialog[open] input[name="date"]', '15/10/2026');
                        assert.equal(await p.inputValue('dialog[open] input[name="date"]'), '15/10/2026');
                        await p.click('dialog[open] [data-seg="state"] [data-v="soins"]'); await p.click('dialog[open] [data-seg="cause"] [data-v="tondeuse"]');
                        await p.fill('dialog[open] input[name="weight_g"]', '36500');
                        await p.click('dialog[open] button[type="submit"]'); await p.waitForTimeout(1200);
                        const h = (await get('suivi', { op: 'animal', id: ids.akela })).health.find(x => x.iso === '2026-10-15');
                        assert.equal(h.cause, 'tondeuse'); assert.equal(h.weight_g, 36500); assert.equal(h.state, 'soins');
                        await p.waitForSelector('.sv-frise .sv-frise-seg'); assert.ok(await p.$('.sv-curve.is-big polyline'), 'courbe du poids');
                        await shot(p, 'fiche-akela-sante.png', true);
                    });
                    await t('👥 groupe : la frise de l’histoire sociale (exclu ✖, passé dans un autre groupe →)', async () => {
                        await p.evaluate(i => window.LCNDA_EXT.suivi.openPet(i, 'group'), ids.akela);
                        await p.waitForSelector('.sv-social .sv-social-seg');
                        assert.match(await p.textContent('[data-pblock="animal_group"] .sv-pet-panel'), /exclu/); assert.ok((await p.textContent('.sv-social')).includes('✖'));
                        await p.evaluate(i => window.LCNDA_EXT.suivi.openPet(i, 'group'), ids.kanzi);
                        await p.waitForSelector('.sv-social .sv-social-seg'); assert.ok((await p.textContent('.sv-social')).includes('→'));
                        await p.evaluate(i => window.LCNDA_EXT.suivi.openGroup(i), ids.g1); await p.waitForSelector('.sv-group .sv-social');
                        assert.match(await p.textContent('.sv-group'), /Membres passés/);
                        await shot(p, 'groupe.png', true);
                    });
                    await t('S10 : 🐾 Recensement (Listes) : barre H10, Liste | Fiches, onglets ; ⤓ Exporter ▾ (CSV, GPX)', async () => {
                        await p.evaluate(() => window.LCNDA_EXT.suivi.openCensus('obs'));
                        await p.waitForSelector('.sv-census .ui-listbar');
                        assert.ok(await p.$('.sv-census .ui-listbar .ui-viewtoggle, .sv-census .ui-listbar .segmented'));
                        assert.match(await p.textContent('.sv-census'), /observations/);
                        await p.click('[data-sv-ctab="animals"]'); await p.waitForSelector('.sv-census .ui-card, .sv-census .ui-row');
                        await shot(p, 'recensement.png', true);
                        await p.click('[data-sv-export]');
                        const [dl] = await Promise.all([p.waitForEvent('download'), p.click('.ui-menu button:has-text("CSV (observations)"), [role="menu"] button:has-text("CSV (observations)")')]);
                        assert.match(dl.suggestedFilename(), /\.csv$/); const csv = fs.readFileSync(await dl.path(), 'utf8'); assert.match(csv, /Date;Heure;Animal/); assert.match(csv, /Gaston/);
                        await p.click('[data-sv-export]');
                        const [dl2] = await Promise.all([p.waitForEvent('download'), p.click('.ui-menu button:has-text("GPX"), [role="menu"] button:has-text("GPX")')]);
                        assert.equal(S.parseGPX(fs.readFileSync(await dl2.path(), 'utf8')).points.length > 100, true);
                    });
                    await t('📤 partager depuis l’app (fichier .lcsuivi = ZIP du moteur commun) puis ⤒ recevoir : déjà là, un conflit, fusion, ↶ Annuler', async () => {
                        await p.evaluate(i => { window.LCNDA_EXT.suivi.openShare({ scope: 'pets', ids: [i] }); }, ids.gaston);
                        await p.waitForSelector('dialog[open] [data-prev] .ui-notice');
                        assert.match(await p.textContent('dialog[open] [data-prev]'), /1 animal/);
                        const [dl] = await Promise.all([p.waitForEvent('download'), p.click('dialog[open] button[type="submit"]')]);
                        assert.match(dl.suggestedFilename(), /\.lcsuivi$/);
                        const file = await dl.path(), X = require('../assets/js/app-tableur-engine.js');
                        const z = await X.unzip(fs.readFileSync(file)); assert.ok(z.has('suivi.json') && z.has('LISEZ-MOI.txt'));
                        const pkg = JSON.parse(await z.text('suivi.json')); assert.equal(pkg.animals[0].name, 'Gaston'); assert.doesNotMatch(JSON.stringify(pkg), /LEROY|MARTIN/);
                        await w('save_profile', { pet_id: ids.gaston, taxon: 'Corneille noire (changée)', profile: 'oiseau', program: 'Corneilles de Paris' });
                        await p.evaluate(() => { window.LCNDA_EXT.suivi.openReceive(); });
                        await p.waitForSelector('dialog.k-import input[type=file]', { state: 'attached' });
                        await p.setInputFiles('dialog.k-import input[type=file]', { name: 'gaston.lcsuivi', mimeType: 'application/zip', buffer: fs.readFileSync(file) });
                        await p.waitForSelector('dialog.k-import [data-k-go]:not([disabled])', { timeout: 10000 });
                        assert.match(await p.textContent('dialog.k-import'), /conflit/); assert.match(await p.textContent('dialog.k-import [data-k-go]'), /Comparer et fusionner/);
                        await p.click('dialog.k-import [data-k-go]');
                        await p.waitForSelector('dialog.sv-merge .merge-row');
                        assert.match(await p.textContent('dialog.sv-merge [data-left]'), /1/); assert.equal(await p.isDisabled('dialog.sv-merge [data-go]'), true);
                        await shot(p, 'fusion.png');
                        await p.click('dialog.sv-merge [data-all="theirs"]');
                        assert.match(await p.textContent('dialog.sv-merge [data-left]'), /0/);
                        await p.click('dialog.sv-merge [data-go]'); await p.waitForSelector('dialog.sv-merge', { state: 'detached' });
                        let d = await get('suivi', { op: 'animal', id: ids.gaston }); assert.equal(d.profile.taxon, pkg.animals[0].taxon, 'le sien pris');
                        await p.locator('.ui-toast .ui-toast-btn:has-text("Annuler")').last().click(); await p.waitForTimeout(1200);
                        d = await get('suivi', { op: 'animal', id: ids.gaston }); assert.equal(d.profile.taxon, 'Corneille noire (changée)', '↶ Annuler');
                    });
                    await t('S12 : fiche du site (comptages, courbe, contour)', async () => {
                        await p.evaluate(i => window.LCNDA_EXT.suivi.openSite(i), ids.site); await p.waitForSelector('.sv-site .sv-curve');
                        assert.match(await p.textContent('.sv-site'), /140/); assert.ok(await p.$('.sv-site .sv-map polygon'));
                    });
                }
                if (name === '390') await t('[390] fiche d’un animal et fenêtre d’observation sans défilement de côté', async () => {
                    await p.evaluate(i => window.LCNDA_EXT.suivi.openPet(i, 'marks'), ids.gaston); await p.waitForSelector('[data-pblock="animal_marks"] .sv-pet-panel .card'); await noScroll(p);
                    await shot(p, 'fiche-390.png', true);
                    await p.evaluate(() => { window.LCNDA_EXT.suivi.openObservation({}); }); await p.waitForSelector('dialog[open] [data-reading]'); await noScroll(p);
                    await shot(p, 'observation-390.png');
                });
                if (name === 'sombre') await t('[sombre] la fiche et la carte en sombre, texte lisible', async () => {
                    await p.evaluate(i => window.LCNDA_EXT.suivi.openPet(i, 'marks'), ids.gaston); await p.waitForSelector('[data-pblock="animal_marks"] .sv-pet-panel .card');
                    const c = await p.$eval('[data-pblock="animal_marks"] .sv-pet-panel .card', e => getComputedStyle(e).color); assert.notEqual(c, 'rgb(8, 8, 8)');
                    await shot(p, 'fiche-sombre.png', true);
                });
                await ctx.close();
            }
            await t('mode consultation : la page du Suivi et une fiche sans aucun POST, sans « Nouvelle observation »', async () => {
                const r = await post('kiosk_enter', { password: 'secret1' }); assert.equal(r.status, 200, JSON.stringify(r.body));
                const { ctx, p } = await open({ width: 1280, height: 900 });
                const posts = []; p.on('request', q => { if (q.method() !== 'GET' && !/save_settings|kiosk/.test(q.url())) posts.push(q.url()); });
                await p.evaluate(() => { localStorage.setItem('genealogie-menu-suivi', '1'); localStorage.setItem('genealogie-menu-hidden', '[]'); });
                await p.waitForFunction(() => document.body.classList.contains('is-kiosk'), null, { timeout: 8000 });
                await goSuivi(p);
                assert.equal(await p.$('.sv-page [data-sv-new-obs]:visible'), null);
                await p.evaluate(i => window.LCNDA_EXT.suivi.openPet(i, 'marks'), ids.gaston); await p.waitForSelector('[data-pblock="animal_marks"] .sv-pet-panel .card');
                assert.equal(await p.$('[data-pblock="animal_marks"] .sv-pet-panel [data-sv-rings-edit]'), null);
                await p.evaluate(() => window.LCNDA_EXT.suivi.openCensus('animals')); await p.waitForSelector('.sv-census');
                assert.deepEqual(posts, []);
                const w2 = await post('suivi_write', { op: 'save_site', name: 'x' }); assert.equal(w2.status, 423);
                await ctx.close();
            });
            await t('aucune erreur JavaScript', async () => { assert.deepEqual(errors, []); });
        } finally { await browser.close(); }
    } finally {
        proc.kill();
        fs.rmSync(tmp, { recursive: true, force: true });
    }
    finish();
})();
function finish() {
    if (failed) { console.error(`\n${failed} échec(s)`); process.exit(1); }
    console.log('\nTout est bon.');
}
