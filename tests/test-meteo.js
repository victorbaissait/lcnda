'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🌦 Météo d'autrefois (lib/meteo.php, assets/js/heritage-meteo.js ; maquette docs/design/meteo.html) :   node tests/test-meteo.js
 *  0. le fabricant hors ligne (tests/test_meteo_builder.py : CSV Météo-France et MétéoSuisse, blocs, choix des stations, socle relu par l'app) ;
 *  1. un jeu de données FABRIQUÉ (scripts/meteo/make-fixture.py : Gers, Uccle, Genève, Findel, carreaux ERA5 et 20CR, 1836–2025)
 *     et la famille DUPOUY de la maquette ; l'API : blocs relus, source choisie selon la distance, l'altitude et la date (Mesuré,
 *     Station à N km, Estimé, Reconstitution grossière, rien avant 1836 → première station), heures de l'acte remises en UTC
 *     (1880 heure solaire, 1900 heure de Paris, 1943 heure allemande, 1976 heure d'été, Suisse), normale, jours autour, bloc
 *     de la vie et phrases curieuses, widget (jamais un vivant), heure enregistrée avec l'événement, import d'un pack par
 *     morceaux (vérifié, ↶ Annuler, supprimer / remettre), fichier abîmé refusé, CSRF ;
 *  2. le navigateur (Playwright ; sinon sauté) à 1440 px, 390 px et en sombre : pastilles de la fiche, bulle, détail (fenêtre
 *     540, 4 moments, Fermer seul), variante qui se déplie, masquer (événement, personne, partout, sortes d'événements) et
 *     retrouver dans les réglages, bloc « Météo de sa vie », réglages K2, fenêtre d'import K13, À propos, widget, frise de la
 *     Chronologie, encadré de la mise en page, aucun POST en mode simple, texte lisible en sombre, pas de défilement de côté,
 *     aucune erreur JavaScript.
 * Captures : SHOTS=dossier node tests/test-meteo.js
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const phpPath = findPhp([devBundledPhp()]);
if (!phpPath) { console.log('— PHP absent : test sauté'); process.exit(0); }
const SHOTS = process.env.SHOTS || '';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-meteo-'));
const fx = path.join(tmp, 'fx');
let failed = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };

// ── 0. le fabricant, hors ligne ──
{
    const r = spawnSync('python3', [path.join(appRoot, 'tests', 'test_meteo_builder.py')], { encoding: 'utf8', env: { ...process.env, PYTHONWARNINGS: 'ignore' } });
    if (r.error) console.log('— python3 absent : test du fabricant sauté');
    else if (r.status !== 0) { failed++; console.error('✗ le fabricant hors ligne (tests/test_meteo_builder.py)\n', r.stdout, r.stderr); }
    else console.log('✓ le fabricant hors ligne : CSV Météo-France et MétéoSuisse, blocs, choix des stations, socle relu par l’app');
}
// ── le jeu de données fabriqué ──
{
    const r = spawnSync('python3', [path.join(appRoot, 'scripts', 'meteo', 'make-fixture.py'), fx], { encoding: 'utf8' });
    if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exit(1); }
}
const dir = path.join(tmp, 'data');
const envFor = d => ({ ...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1', LCNDA_METEO_DIR: fx });
fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
const seedOut = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; $pdo = db();
$t = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn();
$pdo->exec("INSERT INTO places(id,name,county,state,country,latitude,longitude) VALUES(1,'Lectoure','Gers','Occitanie','France',43.934,0.622),(2,'Auch','Gers','Occitanie','France',43.646,0.586),(3,'Mauvezin','Gers','Occitanie','France',43.728,0.873),(4,'Mende','Lozère','Occitanie','France',44.518,3.5),(5,'Sans coordonnées','Gers','','France',NULL,NULL),(6,'Les Praz','Haute-Savoie','Auvergne-Rhône-Alpes','France',45.93,6.80),(7,'Cortina d’Ampezzo','Belluno','Vénétie','Italie',46.537,12.136)");
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start) VALUES(1,'Jean','DUPOUY','male','deceased',1),(2,'Marie','LABARTHE','female','deceased',0),(3,'Pierre','DUPOUY','male','deceased',0),(4,'Germaine','DUPOUY','female','deceased',0),(5,'Bertrand','DUPOUY','male','deceased',0),(6,'Jeanne','SÉGUÉLA','female','deceased',0),(7,'Dominique','DUPOUY','male','deceased',0),(8,'Léa','VIVANTE','female','living',0),(9,'Hugo','VIVANT','male','living',0),(10,'Léon','MONTAGNARD','male','deceased',0)");
$pdo->exec("INSERT INTO families(id,partner1_id,partner2_id) VALUES(1,1,2),(2,9,8)");
$pdo->exec("INSERT INTO family_children(family_id,child_id) VALUES(1,3)");
$ev = $pdo->prepare('INSERT INTO events(id,scope,person_id,family_id,event_type_id,date_text,year,place_id,event_time) VALUES(?,?,?,?,?,?,?,?,?)');
foreach ([
 [1,'person',1,null,'BIRT','14 janvier 1901',1901,1,'03:00'], [2,'person',1,null,'CHR','20 janvier 1901',1901,1,''], [3,'person',1,null,'DEAT','3 février 1978',1978,2,'06:30'],
 [4,'person',1,null,'BURI','6 février 1978',1978,1,''], [5,'family',null,1,'MARR','22 octobre 1926',1926,2,''], [6,'person',4,null,'BIRT','9 mars 1920',1920,3,''],
 [7,'person',5,null,'DEAT','17 décembre 1944',1944,4,''], [8,'person',6,null,'CHR','2 mai 1852',1852,1,''], [9,'person',7,null,'BIRT','11 avril 1790',1790,1,''],
 [10,'person',3,null,'BIRT','vers 1930',1930,1,''], [11,'person',2,null,'DEAT','14 juillet 1985',1985,1,'16:00'], [12,'family',null,2,'MARR','22 octobre 1976',1976,2,''],
 [13,'person',3,null,'DEAT','2 mars 1990',1990,5,''], [14,'person',10,null,'DEAT','3 février 1978',1978,6,''], [15,'person',10,null,'BIRT','12 mai 1880',1880,7,''], [16,'person',10,null,'BURI','8 février 1978',1978,7,''],
] as $r) { $r[4] = $t($r[4]); $ev->execute($r); }
echo 'ok';`], { cwd: appRoot, encoding: 'utf8', env: envFor(dir) });
if (seedOut.status !== 0 || !String(seedOut.stdout).includes('ok')) { console.error(seedOut.stderr || seedOut.stdout); process.exit(1); }

const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const startServer = async d => {
    const port = await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-d', 'post_max_size=64M', '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env: envFor(d), stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
    let cookie = '';
    const html = await (await fetch(base).then(r => { cookie = (r.headers.get('set-cookie') || '').split(';')[0]; return r; })).text();
    const csrf = JSON.parse(html.match(/window\.INSTALL_CSRF = ("[^"]*")/)[1]);
    const get = async (action, q = {}) => { const r = await fetch(`${base}api.php?action=${action}&${new URLSearchParams(q)}`, { headers: { Cookie: cookie } }); return r.json(); };
    const post = async (action, body, token = csrf) => { const r = await fetch(`${base}api.php?action=${action}`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': token }, body: JSON.stringify({ ...body, csrf: token }) }); const j = await r.json().catch(() => ({})); return { status: r.status, body: j, result: j.result }; };
    const raw = async (action, q, buf, token = csrf) => { const r = await fetch(`${base}api.php?action=${action}&${new URLSearchParams(q)}`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/octet-stream', 'X-CSRF-Token': token }, body: buf }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
    return { proc, base, get, post, raw, csrf };
};
const pack = path.join(fx, 'meteo-pack-complet.lcmeteo');
async function importPack(S, file = pack) {
    const buf = fs.readFileSync(file);
    const b = await S.post('meteo_pack_begin', { size: buf.length });
    assert.equal(b.status, 200, JSON.stringify(b.body));
    const id = b.body.id, CH = 200 * 1024;
    for (let off = 0; off < buf.length; off += CH) {
        const r = await S.raw('meteo_pack_chunk', { id, offset: off }, buf.subarray(off, Math.min(buf.length, off + CH)));
        assert.equal(r.status, 200, JSON.stringify(r.body));
    }
    return S.post('meteo_pack_finish', { id });
}

(async () => {
    const S = await startServer(dir);
    const { get, post } = S;
    try {
        await t('les blocs sont relus : Auch, 3 février 1978 à 6 h 30 → Mesuré, −2 °C au matin (6 h UTC), 4 moments, normale 1951–1980, 7 jours, sources', async () => {
            const { result: r } = await get('meteo_point', { lat: 43.646, lon: 0.586, date: '1978-02-03', time: '06:30', country: 'France', place: 'Auch' });
            assert.equal(r.reliability, 'measured');
            assert.equal(r.day.tn, -2); assert.equal(r.day.tx, 7); assert.ok(r.day.ww & 1, 'brouillard');
            assert.equal(r.station.short, 'Auch'); assert.ok(r.station.km < 6);
            assert.deepEqual(r.hours.map(h => h.h), [0, 6, 12, 18]);
            assert.deepEqual([r.moment.h, r.moment.t], [6, -2]);
            assert.match(r.time.label, /6 h 30, heure légale \(UTC\+1\) ≈ 5 h 30 UTC/);
            assert.equal(r.normal.period, '1951–1980');
            assert.equal(r.around.length, 7); assert.ok(r.around[3].on);
            const ment = r.sources.map(s => s.mention).join(' | ');
            assert.match(ment, /Météo-France/); assert.match(ment, /Copernicus/);
        });
        await t('la source suit la distance, l’altitude et la date', async () => {
            const at = async (lat, lon, date, q = {}) => (await get('meteo_point', { lat, lon, date, detail: '0', ...q })).result;
            const mauvezin = await at(43.728, 0.873, '1920-03-09');
            assert.equal(mauvezin.reliability, 'station'); assert.ok(mauvezin.station.km > 15 && mauvezin.station.km < 40); assert.equal(mauvezin.regional_rain, true);
            assert.equal((await at(44.518, 3.5, '1944-12-17')).reliability, 'estimated');
            assert.equal((await at(43.934, 0.622, '1852-05-02')).reliability, 'coarse');
            const avant = await at(43.934, 0.622, '1790-04-11');
            assert.equal(avant.reliability, 'none'); assert.deepEqual([avant.first.name, avant.first.year], ['Toulouse', 1863]);
            assert.equal((await at(43.934, 0.622, '1835-12-31')).reliability, 'none', 'avant 1836 : rien');
            // 1 200 m au-dessus de la station d'Auch : la pénalité d'altitude l'écarte → le carreau ERA5
            assert.equal((await at(43.646, 0.586, '1978-02-03', { alt: 1250 })).reliability, 'estimated');
            assert.equal((await at(43.646, 0.586, '1978-02-03', { alt: 140 })).reliability, 'measured');
            assert.equal((await at(46.2, 6.14, '1950-01-10')).station.short, 'Genève');
            assert.equal((await at(50.8, 4.36, '2010-06-01')).station.short, 'Uccle');
            assert.equal((await at(43.6, 0.6, 'n’importe quoi')).ok, false);
        });
        await t('l’heure de l’acte remise en UTC : 1880 heure solaire, 1900 heure de Paris, 1943 heure allemande, 1976 heure d’été, Suisse', async () => {
            const tm = async (date, time, lat, lon, country = 'France', place = 'Lectoure') => get('meteo_time', { date, time, lat, lon, country, place });
            let r = await tm('20 novembre 1880', 'à 3 heures du matin', 43.934, 0.622);
            assert.ok(r.ok); assert.match(r.zone, /heure solaire de Lectoure/); assert.ok(Math.abs(r.hour - (3 - 0.622 / 15)) < 0.01, r.hour); assert.ok(r.before1940);
            r = await tm('1900-01-14', '03:00', 43.934, 0.622); assert.match(r.zone, /heure de Paris/); assert.ok(Math.abs(r.hour - (3 - 561 / 3600)) < 0.01);
            r = await tm('1943-06-09', '14:00', 43.934, 0.622); assert.match(r.zone, /allemande/); assert.equal(r.hour, 12);
            r = await tm('1941-01-10', '12:00', 48.85, 2.35, 'France', 'Paris'); assert.match(r.zone, /allemande/); assert.equal(r.hour, 10);
            r = await tm('1941-01-10', '12:00', 43.6, 0.6, 'France', 'Auch'); assert.match(r.zone, /zone libre/); assert.equal(r.hour, 11);
            r = await tm('1976-07-14', '16:00', 43.934, 0.622); assert.match(r.zone, /été/); assert.equal(r.hour, 14);
            r = await tm('1976-01-14', '16:00', 43.934, 0.622); assert.equal(r.hour, 15);
            r = await tm('1985-07-14', '0 h 30', 43.934, 0.622); assert.equal(r.date, '1985-07-13', 'la veille en UTC');
            r = await tm('1900-06-01', '12:00', 46.2, 6.14, 'Suisse', 'Genève'); assert.equal(r.hour, 11);
            r = await tm('1890-06-01', '12:00', 46.2, 6.14, 'Suisse', 'Genève'); assert.match(r.zone, /Berne/);
            r = await tm('1900-06-01', '12:00', 50.8, 4.36, 'Belgique', 'Uccle'); assert.equal(r.hour, 12);
            assert.equal((await tm('1900-06-01', 'n’importe', 43.9, 0.6)).ok, false);
        });
        await t('les événements de la fiche : date au jour près, lieu placé, heure de l’acte', async () => {
            const d = await get('meteo_events', { ids: '1,2,3,4,5,9,10,13' });
            assert.equal(d.installed, true);
            const e = d.events;
            assert.equal(e[1].reliability, 'station'); assert.deepEqual([e[1].moment.kind, e[1].moment.t], ['night', -6]);
            assert.equal(e[3].reliability, 'measured'); assert.equal(e[3].moment.h, 6);
            assert.equal(e[5].reliability, 'measured'); assert.equal(e[5].day.rr, 14);
            assert.equal(e[9].why, 'far'); assert.equal(e[10].why, 'date'); assert.equal(e[13].why, 'place');
        });
        await t('« 🌦 Météo de sa vie » : 5 grands jours, phrases curieuses seulement « Mesuré » ou « Station à … km »', async () => {
            const d = await get('meteo_person', { id: 1 });
            assert.equal(d.events.length, 5);
            const kinds = d.curious.map(c => `${c.kind}:${c.town}:${c.season || c.month}`);
            assert.ok(kinds.includes('coldest_day:Agen:1900–1901') || kinds.includes('coldest_week:Agen:1900–1901'), kinds.join(', '));
        });
        await t('widget : « il y a 100 ans, le mariage de Jean et Marie », jamais le mariage des vivants (50 ans)', async () => {
            const d = await get('meteo_today', { date: '10-22', year: '2026' });
            assert.equal(d.pick.event_id, 5); assert.equal(d.pick.ago, 100);
            assert.deepEqual(d.pick.people.map(p => p.first), ['Jean', 'Marie']);
            assert.ok(!d.list.some(x => x.event_id === 12), 'les vivants sont exclus');
        });
        await t('l’heure enregistrée avec l’événement (« 3:05 » → 03:05 ; « 25:00 » → vide)', async () => {
            let r;
            const types = (await get('bootstrap')).eventTypes || [];
            const chr = types.find(x => x.gedcom_tag === 'CHR').id;
            r = await post('save_event', { id: 2, event_type_id: chr, date_text: '20 janvier 1901', place_id: 1, event_time: '3:05' });
            assert.equal(r.status, 200, JSON.stringify(r.body));
            assert.equal((await get('meteo_event', { id: 2 })).result.time_text, '03:05');
            r = await post('save_event', { id: 2, event_type_id: chr, date_text: '20 janvier 1901', place_id: 1, event_time: '25:00' });
            assert.equal((await get('meteo_event', { id: 2 })).result.time_text, '');
        });
        await t('import d’un pack par morceaux : vérifié, rangé, la station de Lectoure (heure par heure) passe devant ; ↶ Annuler ; supprimer / remettre', async () => {
            const before = (await get('meteo_point', { lat: 43.934, lon: 0.622, date: '1985-07-14', time: '16:00', country: 'France' })).result;
            assert.equal(before.reliability, 'station'); assert.equal(before.moment.h, 12, 'socle : 4 heures par jour → 12 h');
            const r = await importPack(S);
            assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.kind, 'complet'); assert.equal(r.body.stations, 1);
            const st = await get('meteo_status');
            assert.ok(st.files.complet && st.files.complet.removable);
            const after = (await get('meteo_point', { lat: 43.934, lon: 0.622, date: '1985-07-14', time: '16:00', country: 'France' })).result;
            assert.equal(after.reliability, 'measured'); assert.equal(after.station.short, 'Lectoure'); assert.equal(after.moment.h, 14, 'pack complet : 14 h UTC');
            assert.equal((await post('meteo_pack_undo', { kind: 'complet' })).status, 200);
            assert.ok(!(await get('meteo_status')).files.complet, '↶ Annuler retire le pack');
            assert.equal((await importPack(S)).status, 200);
            assert.equal((await post('meteo_pack_remove', { kind: 'complet' })).status, 200);
            assert.deepEqual((await get('meteo_status')).removed, ['complet']);
            assert.equal((await post('meteo_pack_restore', { kind: 'complet' })).status, 200);
            assert.ok((await get('meteo_status')).files.complet);
            assert.equal((await post('meteo_pack_remove', { kind: 'socle' })).status, 422, 'le socle livré avec l’app ne se supprime pas');
            assert.equal((await post('meteo_pack_remove', { kind: 'complet' })).status, 200);
        });
        await t('pack Europe : un lieu italien en 1880 reçoit « Reconstitution grossière » (20CR), rien sans le pack ; les nouvelles sources sont citées', async () => {
            assert.equal((await get('meteo_events', { ids: '15' })).events[15].why, 'out', 'sans le pack Europe : pas de météo inventée');
            const r = await importPack(S, path.join(fx, 'meteo-pack-europe.lcmeteo'));
            assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.kind, 'europe');
            const st = (await get('meteo_status')).files.europe;
            assert.deepEqual(st.station_countries, ['IT']); assert.deepEqual([st.c20.a, st.c20.b], [1836, 1939]); assert.ok(st.sources.includes('ghcn'));
            const e = (await get('meteo_events', { ids: '15' })).events[15];
            assert.deepEqual([e.reliability, e.cell.source], ['coarse', '20cr']);
            assert.match(e.sources.map(x => x.mention).join(' | '), /20th Century Reanalysis/);
            const milan = (await get('meteo_point', { lat: 45.47, lon: 9.19, date: '1885-06-01', detail: '0' })).result;
            assert.deepEqual([milan.reliability, milan.station.short], ['measured', 'Milan']);
            assert.match(milan.sources[0].mention, /GHCN-Daily/);
            const about = Object.fromEntries((await get('meteo_about')).sources.map(x => [x.id, x]));
            assert.deepEqual(about.ghcn.installed, ['europe']); assert.match(about.ghcn.licence, /OMM/);
            for (const id of ['knmi', 'dmi', 'midas', 'aemet', 'imgw', 'chmi']) assert.ok(about[id]?.mention, id);
            assert.equal((await post('meteo_pack_undo', { kind: 'europe' })).status, 200);
            assert.equal((await get('meteo_events', { ids: '15' })).events[15].why, 'out', '↶ Annuler : de nouveau rien');
        });
        await t('un fichier abîmé ou qui n’est pas un pack est refusé ; CSRF ; envoi inconnu', async () => {
            const bad = path.join(tmp, 'abime.lcmeteo');
            const buf = fs.readFileSync(pack); buf[5000] ^= 0xff; fs.writeFileSync(bad, buf);
            const r = await importPack(S, bad);
            assert.equal(r.status, 422); assert.match(r.body.error, /abîmé/);
            const not = path.join(tmp, 'pas-un-pack.lcmeteo'); fs.writeFileSync(not, Buffer.alloc(9000, 65));
            assert.match((await importPack(S, not)).body.error, /pas un pack/);
            assert.equal((await post('meteo_pack_begin', { size: 99999 }, 'faux')).status, 419);
            assert.equal((await S.raw('meteo_pack_chunk', { id: 'x'.repeat(24), offset: 0 }, Buffer.from('a'))).status, 422);
            assert.equal((await S.raw('meteo_pack_chunk', { id: '../../etc', offset: 0 }, Buffer.from('a'))).status, 422);
            assert.ok(!fs.existsSync(path.join(dir, 'meteo', 'meteo-complet.sqlite')));
        });
        await t('⛰ montagne : la station d’altitude (Chamonix, 6 km) gagne sur la plaine plus proche (3 km, 500 m plus bas) ; saisie à la main prioritaire ; ↺', async () => {
            const alt = await get('meteo_altitude', { lat: 45.93, lon: 6.80 });
            assert.ok(Math.abs(alt.m - 1014) < 3, 'grille des altitudes (bilinéaire) : ' + alt.m);
            assert.equal((await get('meteo_altitude', { lat: 48.8, lon: 2.3 })).m, null, 'hors de la grille');
            let e = (await get('meteo_events', { ids: '14' })).events[14];
            assert.deepEqual([e.reliability, e.station.short, e.alt.from, e.station.alt], ['measured', 'Chamonix', 'carte', 1042]);
            // sans altitude du tout, la plaine (plus proche) gagnerait : c'est bien l'altitude qui décide
            assert.equal((await get('meteo_point', { lat: 45.93, lon: 6.80, date: '1978-02-03', alt: 530, detail: '0' })).result.station.short, 'Passy');
            // écart de plus de 150 m : jamais « Mesuré »
            assert.equal((await get('meteo_point', { lat: 45.93, lon: 6.80, date: '1978-02-03', alt: 1200, detail: '0' })).result.reliability, 'station');
            let p = await get('meteo_place', { id: 6 });
            assert.deepEqual([p.altitude, Math.abs(p.auto - 1014) < 3], [null, true]);
            let r = await post('meteo_place_altitude', { id: 6, altitude: '530' });
            assert.equal(r.status, 200, JSON.stringify(r.body));
            e = (await get('meteo_events', { ids: '14' })).events[14];
            assert.deepEqual([e.station.short, e.alt.from, e.alt.m, e.reliability], ['Passy', 'saisie', 530, 'measured']);
            assert.equal((await post('meteo_place_altitude', { id: 6, altitude: 99999 })).status, 422);
            r = await post('meteo_place_altitude', { id: 6, altitude: null });
            assert.equal(r.result?.altitude ?? r.body.altitude ?? null, null);
            assert.equal((await get('meteo_place', { id: 6 })).altitude, null, '↺ remet l’altitude de la carte');
            assert.equal((await get('meteo_events', { ids: '14' })).events[14].station.short, 'Chamonix');
        });
        await t('⛰ hors de la zone météo (Italie) : l’altitude de la carte du relief, aucune météo inventée', async () => {
            const p = await get('meteo_place', { id: 7 });
            assert.ok(p.altitude === null && Math.abs(p.auto - 1228) < 8, JSON.stringify(p));
            const ev = (await get('meteo_events', { ids: '15,16' })).events;
            for (const id of [15, 16]) { assert.equal(ev[id].ok, false); assert.equal(ev[id].why, 'out', JSON.stringify(ev[id])); assert.equal(ev[id].alt.from, 'carte'); }
            const st = await get('meteo_status');
            assert.ok(st.files.socle.relief_countries.includes('IT') && st.files.socle.relief_countries.includes('ES'));
            assert.equal(st.files.socle.relief, 4);
            const about = await get('meteo_about');
            assert.match(about.sources.find(x => x.id === 'copdem').in, /Italie.*Slovaquie/);
        });
        await t('« À propos des données » : chaque source et sa licence', async () => {
            const d = await get('meteo_about');
            const by = Object.fromEntries(d.sources.map(s => [s.id, s]));
            assert.match(by.meteofrance.licence, /Licence Ouverte/); assert.match(by.copdem.mention, /Copernicus DEM GLO-90/); assert.match(by.era5.mention, /Copernicus/); assert.match(by['20cr'].mention, /20th Century/);
            assert.deepEqual(by.meteofrance.installed, ['socle']);
        });

        /* ═════ 2. le navigateur ═════ */
        let chromium = null;
        try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); } catch (_) { try { ({ chromium } = require('playwright')); } catch (__) { /* sauté */ } }
        if (!chromium) { console.log('— Playwright absent : partie navigateur sautée'); return; }
        const browser = await chromium.launch();
        const errors = [];
        const shot = async (p, name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: path.join(SHOTS, name), fullPage: false }); } };
        const noScroll = async p => assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'défilement de côté');
        const open = async (vp, dark = false) => {
            const ctx = await browser.newContext({ viewport: vp, colorScheme: dark ? 'dark' : 'light' });
            const p = await ctx.newPage();
            p.on('pageerror', e => errors.push('pageerror ' + e.message));
            p.on('console', m => { if (m.type() === 'error' && !/net::|Failed to load resource/.test(m.text())) errors.push('console ' + m.text()); });
            await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
            await p.goto(S.base); await p.waitForFunction(() => window.LCNDA_APP?.openPersonById && window.LCNDA_EXT?.meteo);
            await p.evaluate(dk => { localStorage.removeItem('genealogie-meteo'); if (dk) { const A = window.LCNDA_APP; localStorage.setItem('genealogie-design', JSON.stringify({ ...A.readDesignSettings(), preset: 'dark' })); A.applyDesign(); } }, dark);
            return { ctx, p };
        };
        const fiche = async (p, id = 1) => { await p.evaluate(i => window.LCNDA_APP.openPersonById(i), id); await p.waitForSelector('[data-pblock="events"] .wx-pill', { timeout: 8000 }).catch(() => {}); await p.waitForTimeout(300); };
        const setMeteo = (p, o) => p.evaluate(v => localStorage.setItem('genealogie-meteo', JSON.stringify(v)), o);
        try {
            for (const [name, vp, dark] of [['1440', { width: 1440, height: 950 }, false], ['390', { width: 390, height: 844 }, false], ['sombre', { width: 1440, height: 950 }, true]]) {
                const { ctx, p } = await open(vp, dark);
                await t(`[${name}] M1 : une pastille sous le lieu de chaque événement, la bulle au survol`, async () => {
                    await fiche(p);
                    const pills = await p.$$eval('[data-pblock="events"] .wx-pill', x => x.map(e => e.textContent.trim()));
                    assert.deepEqual(pills, ['❄️ −6 °C', '☁️ 3 °C', '🌧️ 9 °C', '🌫️ −2 °C', '🌧️ 7 °C']);
                    assert.match(await p.textContent('[data-pblock="events"]'), /à 3 h/);
                    if (name !== '390') {
                        await p.hover('[data-pblock="events"] .wx-pill');
                        await p.waitForSelector('.wx-pop', { timeout: 3000 });
                        assert.match(await p.textContent('.wx-pop'), /Il faisait très froid/);
                        assert.match(await p.textContent('.wx-pop'), /STATION À 27 KM|Station à 27 km/i);
                        await shot(p, `meteo-fiche-${name}.png`);
                        await p.mouse.move(5, 5);
                    }
                    await noScroll(p);
                });
                await t(`[${name}] M2 : le détail du jour (fenêtre 540, 4 moments, normale, « Fermer » seul)`, async () => {
                    await p.click('[data-pblock="events"] .wx-pill >> nth=3');
                    await p.waitForSelector('dialog.wx-dialog .wx-cols');
                    const d = await p.evaluate(() => { const dl = document.querySelector('dialog.wx-dialog'); return { w: Math.round(dl.getBoundingClientRect().width), title: dl.querySelector('h2').textContent, on: dl.querySelector('.wx-cols .is-on small').textContent, ok: dl.querySelector('.wx-ok').textContent, norm: dl.querySelector('.wx-norm').textContent, btns: [...dl.querySelectorAll('.modal-actions button')].map(b => b.textContent.trim()), src: dl.querySelector('.wx-src').textContent }; });
                    assert.ok(d.w <= 540 && d.w >= Math.min(380, vp.width - 48), 'largeur ' + d.w);
                    assert.match(d.title, /Vendredi 3 février 1978 · Auch/);
                    assert.match(d.on, /Matin · 6 h/); assert.match(d.ok, /valeur la plus proche : 6 h UTC/);
                    assert.match(d.norm, /sous la normale de février 1951–1980/);
                    assert.deepEqual(d.btns, ['Fermer']);
                    assert.match(d.src, /Météo-France/); assert.match(d.src, /Copernicus/);
                    if (dark) {
                        const bad = await p.evaluate(() => {
                            const lum = c => { const m = c.match(/[\d.]+/g).map(Number); const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]); };
                            const bgOf = el => { while (el) { const b = getComputedStyle(el).backgroundColor; if (!/rgba\(0, 0, 0, 0\)|transparent/.test(b)) return b; el = el.parentElement; } return 'rgb(255,255,255)'; };
                            return [...document.querySelectorAll('dialog.wx-dialog .wx-say p, dialog.wx-dialog .wx-d, dialog.wx-dialog .wx-kv dd, dialog.wx-dialog .wx-norm span, dialog.wx-dialog .wx-strip > div, dialog.wx-dialog .wx-src')].map(el => { const a = lum(getComputedStyle(el).color), b = lum(bgOf(el)); return [el.className || el.tagName, (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)]; }).filter(([, r]) => r < 4.5);
                        });
                        assert.deepEqual(bad, [], 'texte peu lisible en sombre');
                    }
                    await shot(p, `meteo-jour-${name}.png`);
                    await p.click('dialog.wx-dialog .modal-actions button');
                    await p.waitForSelector('dialog.wx-dialog', {state: 'detached', timeout: 5000});
                });
                if (name === '1440') {
                    await t('variante : le panneau qui se déplie sous l’événement', async () => {
                        await setMeteo(p, { open: 'fold' }); await fiche(p);
                        await p.click('[data-pblock="events"] .wx-pill >> nth=3');
                        await p.waitForSelector('.event-row .wx-fold .wx-say');
                        assert.match(await p.textContent('.wx-fold'), /Tout le détail/);
                        await p.click('.wx-fold [data-wx-full]'); await p.waitForSelector('dialog.wx-dialog .wx-cols'); await p.keyboard.press('Escape');
                        await setMeteo(p, {});
                    });
                    await t('masquer : un événement (clic droit), une personne, puis les retrouver dans les réglages', async () => {
                        await fiche(p);
                        await p.click('[data-pblock="events"] .wx-pill >> nth=0', { button: 'right' });
                        await p.click('.ui-actmenu button:has-text("Masquer la météo de cet événement")');
                        assert.equal(await p.$$eval('[data-pblock="events"] .wx-pill', x => x.length), 4);
                        assert.match(await p.textContent('.toast:last-of-type'), /Météo masquée pour cet événement/);
                        let s = await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-meteo')));
                        assert.deepEqual(s.hideEvents.map(x => x.id), [1]);
                        await fiche(p);
                        assert.equal(await p.$$eval('[data-pblock="events"] .wx-pill', x => x.length), 4, 'toujours masqué après rechargement');
                        await p.click('[data-pblock="events"] .wx-pill >> nth=0', { button: 'right' });
                        await p.click('.ui-actmenu button:has-text("Masquer la météo de cette personne")');
                        await p.waitForTimeout(800);
                        assert.equal(await p.$$eval('.wx-pill', x => x.length), 0);
                        await p.evaluate(() => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'meteo'; A.setModule('maintenance'); });
                        await p.waitForSelector('.wx-settings .wx-hidden');
                        assert.equal(await p.$$eval('.wx-hidden li', x => x.length), 2);
                        assert.match(await p.textContent('.wx-hidden'), /Jean DUPOUY|Fiche/);
                        await p.click('.wx-hidden li >> nth=0 >> button'); await p.click('.wx-hidden li >> nth=0 >> button');
                        s = await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-meteo')));
                        assert.deepEqual([s.hidePersons.length, s.hideEvents.length], [0, 0]);
                    });
                    await t('M5 réglages (K2) : Jamais, Au survol, sortes d’événements, bloc ; « ✓ Enregistré » ; ↺ Remettre comme au départ', async () => {
                        await p.click('[data-wx-set="show"][data-wx-val="never"]');
                        await p.waitForTimeout(500);
                        assert.match(await p.textContent('#workspace .page-header'), /Enregistré/);
                        await shot(p, 'meteo-reglages-1440.png');
                        await fiche(p); assert.equal(await p.$$eval('.wx-pill', x => x.length), 0, 'Jamais');
                        await setMeteo(p, { show: 'hover', kinds: { BIRT: false } }); await fiche(p);
                        assert.equal(await p.$$eval('[data-pblock="events"] .wx-pill', x => x.length), 4, 'sans les naissances');
                        assert.ok(await p.$('.wx-hover-only'), 'au survol');
                        await setMeteo(p, { block: true }); await fiche(p);
                        await p.waitForSelector('[data-pblock="meteo"] .wx-row');
                        assert.equal(await p.$$eval('[data-pblock="meteo"] .wx-row', x => x.length), 5);
                        assert.match(await p.textContent('[data-pblock="meteo"] .wx-cur'), /plus froid/);
                        await p.locator('[data-pblock="meteo"]').scrollIntoViewIfNeeded(); await shot(p, 'meteo-bloc-1440.png');
                        await p.evaluate(() => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'meteo'; A.setModule('maintenance'); });
                        await p.waitForSelector('[data-wx-reset]'); await p.click('[data-wx-reset]');
                        const s = await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-meteo')));
                        assert.deepEqual([s.show, s.block, s.kinds.BIRT], ['always', false, true]);
                    });
                    await t('M6 la fenêtre « Importer » (K13) : vérifié, ce qui va entrer, import, ↶ Annuler', async () => {
                        await p.evaluate(() => { window.LCNDA_EXT.meteo.importPack(); });
                        await p.setInputFiles('dialog.k-import input[type=file]', pack);
                        await p.waitForSelector('dialog.k-import .wx-what');
                        const txt = await p.textContent('dialog.k-import');
                        assert.match(txt, /Vérifié/i); assert.match(txt, /Pack complet/); assert.match(txt, /heure par heure/);
                        assert.match(await p.textContent('dialog.k-import [data-k-go]'), /Importer le pack/);
                        await shot(p, 'meteo-import-1440.png');
                        await p.click('dialog.k-import [data-k-go]');
                        await p.waitForSelector('.toast:has-text("Pack complet importé")', { timeout: 15000 });
                        assert.ok((await get('meteo_status')).files.complet);
                        await p.click('.toast:has-text("Pack complet importé") button:has-text("Annuler")');
                        for (let i = 0; i < 30 && (await get('meteo_status')).files.complet; i++) await p.waitForTimeout(200);
                        assert.ok(!(await get('meteo_status')).files.complet, '↶ Annuler');
                    });
                    await t('M10 « À propos des données », widget du tableau de bord, frise de la Chronologie, encadré de la mise en page', async () => {
                        await p.evaluate(() => window.LCNDA_EXT.meteo.openAbout());
                        await p.waitForSelector('dialog.wx-about table');
                        assert.match(await p.textContent('dialog.wx-about'), /Licence Ouverte/);
                        await p.keyboard.press('Escape');
                        const w = await p.evaluate(async () => { const ext = window.LCNDA_EXT, A = window.LCNDA_APP; const d = await A.api('meteo_today', { date: '10-22', year: '2026' }); return ext.dashboard.meteo_widget.render('01', {}, 'span-6', d); });
                        assert.match(w, /Il y a <b>100 ans<\/b>, le jour du mariage de <b>Jean<\/b> et <b>Marie<\/b>, il pleuvait à <b>Auch<\/b>/);
                        const notice = await p.evaluate(() => window.LCNDA_EXT.meteo.noticeHtml({ type: 'meteo', id: 5 }));
                        assert.match(notice, /Auch/); assert.match(notice, /Météo : Source : Météo-France/);
                        await p.evaluate(() => { const A = window.LCNDA_APP; A.state.currentPersonId = 1; A.state.timeline.meteo = true; A.setModule('chronologie'); });
                        await p.waitForSelector('.timeline-row .wx-pill, .timeline-card-line .wx-pill', { timeout: 8000 });
                    });
                    await t('⛰ l’altitude dans le détail du jour et sa fenêtre : saisie, puis ↺ Remettre l’altitude de la carte', async () => {
                        await p.evaluate(() => window.LCNDA_EXT.meteo.openDay(14));
                        await p.waitForSelector('dialog.wx-dialog .wx-kv');
                        assert.match(await p.textContent('dialog.wx-dialog .wx-kv'), /Chamonix · à 6 km, 1\u202f?\s?042 m — ton lieu ≈ 1\u202f?\s?01[0-9] m/);
                        await p.click('dialog.wx-dialog [data-wx-place-edit]');
                        await p.waitForSelector('dialog.wx-alt-dialog');
                        assert.match(await p.textContent('dialog.wx-alt-dialog .wx-alt-auto'), /≈ 1\u202f?\s?01[0-9] m \(carte du relief\)/);
                        await p.fill('dialog.wx-alt-dialog input[name=altitude]', '530'); await p.press('dialog.wx-alt-dialog input[name=altitude]', 'Tab');
                        await p.waitForSelector('.toast:has-text("Altitude enregistrée")');
                        await p.waitForSelector('dialog.wx-alt-dialog [data-wx-alt-reset]');
                        await shot(p, 'meteo-altitude-1440.png');
                        await p.click('dialog.wx-alt-dialog .modal-actions button');
                        await p.waitForFunction(() => /Passy/.test(document.querySelector('dialog.wx-dialog .wx-kv')?.textContent || ''), null, { timeout: 8000 });
                        await p.evaluate(() => window.LCNDA_EXT.meteo.editPlaceAltitude(6));
                        await p.waitForSelector('dialog.wx-alt-dialog [data-wx-alt-reset]'); await p.click('dialog.wx-alt-dialog [data-wx-alt-reset]');
                        await p.waitForSelector('.toast:has-text("Altitude remise")');
                        assert.equal((await get('meteo_place', { id: 6 })).altitude, null);
                        await p.keyboard.press('Escape'); await p.keyboard.press('Escape');
                        // un lieu italien : la ligne vide K10 (pas de météo) et son altitude ≈ (carte du relief)
                        await p.evaluate(() => window.LCNDA_EXT.meteo.openDay(16));
                        await p.waitForSelector('dialog.wx-dialog .empty-line');
                        assert.match(await p.textContent('dialog.wx-dialog .wx-body'), /Pas de météo pour ce lieu/);
                        assert.match(await p.textContent('dialog.wx-dialog .wx-body'), /Ton lieu≈ 1\u202f?\s?2[0-9]{2} m \(carte du relief\)/);
                        await p.keyboard.press('Escape');
                        // la monographie de la commune (Graphiques → Lieux) : la case Altitude
                        await p.evaluate(() => { const A = window.LCNDA_APP; A.state.graphMode = 'place_monograph'; A.state.graphPlaceMonograph = {...(A.state.graphPlaceMonograph || {}), id: 6, name: 'Les Praz'}; A.setModule('graphiques'); });
                        await p.waitForSelector('[data-wx-place-alt] .wx-alt', { timeout: 8000 });
                        assert.match(await p.textContent('[data-wx-place-alt]'), /carte du relief/);
                    });
                    await t('mode simple : lecture seule, aucun POST', async () => {
                        const posts = [];
                        p.on('request', r => { if (r.method() !== 'GET') posts.push(r.url()); });
                        await p.evaluate(() => window.LCNDA_EXT.modeSimple?.open?.());
                        await p.waitForTimeout(800);
                        await p.evaluate(() => window.LCNDA_EXT.meteo.decorate(document.body));
                        await p.waitForTimeout(400);
                        await p.evaluate(() => window.LCNDA_EXT.modeSimple?.close?.());
                        assert.deepEqual(posts.filter(u => /meteo/.test(u)), []);
                        assert.deepEqual(posts.filter(u => !/save_settings/.test(u)), []);
                    });
                }
                if (name === '390') await t('[390] réglages sans défilement de côté', async () => {
                    await p.evaluate(() => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'meteo'; A.setModule('maintenance'); });
                    await p.waitForSelector('.wx-settings'); await noScroll(p); await shot(p, 'meteo-reglages-390.png');
                });
                await ctx.close();
            }
            await t('aucune erreur JavaScript', async () => { assert.deepEqual(errors, []); });
        } finally { await browser.close(); }
    } finally {
        S.proc.kill();
        fs.rmSync(tmp, { recursive: true, force: true });
        if (failed) { console.error(`\n${failed} échec(s)`); process.exit(1); }
        console.log('\nTout est bon.');
    }
})();
