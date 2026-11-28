#!/usr/bin/env node
/* 🔒 Événement confidentiel (events.is_private, structure 111) partout ailleurs que sur la fiche :
 *  1. exports pour d'autres : GEDCOM, JSON, CSV (événements et global), 📤 partager avec la famille (.zip), 🌐 Mon site web (.zip et
 *     rendu des blocs), livre de famille, rapport de recherche : l'événement confidentiel, sa note, sa source et sa preuve n'y sont pas ;
 *     l'événement normal, si ;
 *  2. propriétaire (mode normal) : Chronologie et Carte le montrent avec la pastille 🔒, la biographie marque sa phrase d'un 🔒 ;
 *  3. consultation : le serveur ne l'envoie plus (frise, carte, fiche, biographie) et l'écran ne le montre pas ;
 *  4. 📊 Graphiques : le « 🧭 lien » avec la personne de départ aussi dans les cases de l'arbre ascendant.
 *   node tests/test-evenement-confidentiel.js */
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
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
// ce qui ne doit jamais sortir : l'année et la description de l'événement confidentiel, sa note, sa source, sa preuve
const SECRETS = ['1893', 'SECRETXYZ', 'NOTESECRET', 'SOURCESECRET', 'PREUVESECRET'];
const noSecret = (txt, what) => SECRETS.forEach(s => assert.ok(!txt.includes(s), `${what} : « ${s} » ne doit pas y être`));

(async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-evconf-'));
    fs.mkdirSync(path.join(tmp, 'media'));
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4'};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$tag = function ($t) use ($pdo) { $s = $pdo->prepare('SELECT id FROM event_types WHERE gedcom_tag=? ORDER BY id LIMIT 1'); $s->execute([$t]); return (int) $s->fetchColumn(); };
$pl = function ($name, $lat, $lon) use ($pdo) { $pdo->prepare("INSERT INTO places(name, country, latitude, longitude) VALUES(?, 'France', ?, ?)")->execute([$name, $lat, $lon]); return (int) $pdo->lastInsertId(); };
$paris = $pl('Paris', 48.85, 2.35); $lyon = $pl('Lyon', 45.76, 4.84); $mars = $pl('Marseille', 43.3, 5.37);
$pdo->exec("INSERT INTO persons(first_name,last_name,gender,living_status) VALUES('Jean','MARTIN','male','deceased')"); $jean = (int) $pdo->lastInsertId();
$ev = function ($t, $date, $y, $place, $desc, $priv) use ($pdo, $tag, $jean) {
    $pdo->prepare("INSERT INTO events(scope, person_id, event_type_id, date_text, year, sort_date, place_id, description, is_private) VALUES('person',?,?,?,?,?,?,?,?)")->execute([$jean, $tag($t), $date, $y, $y . '-01-01', $place, $desc, $priv]);
    return (int) $pdo->lastInsertId(); };
$ev('BIRT', '2 février 1850', 1850, $paris, '', 0);
$normal = $ev('RESI', '12 mars 1881', 1881, $lyon, 'NORMALXYZ', 0);
$secret = $ev('RESI', '7 juillet 1893', 1893, $mars, 'SECRETXYZ', 1);
$ev('DEAT', '3 avril 1920', 1920, $paris, '', 0);
$pdo->prepare("INSERT INTO notes(entity_type, entity_id, title, body) VALUES('event', ?, 'Note', 'NOTESECRET')")->execute([$secret]);
$pdo->prepare("INSERT INTO notes(entity_type, entity_id, title, body) VALUES('event', ?, 'Note', 'NOTENORMALE')")->execute([$normal]);
$pdo->exec("INSERT INTO sources(title) VALUES('SOURCESECRET')"); $src = (int) $pdo->lastInsertId();
$pdo->prepare("INSERT INTO source_links(entity_type, entity_id, source_record_id, page) VALUES('event', ?, ?, 'p. 3')")->execute([$secret, $src]);
$pdo->exec("INSERT INTO sources(title) VALUES('SOURCENORMALE')"); $src2 = (int) $pdo->lastInsertId();
$pdo->prepare("INSERT INTO source_links(entity_type, entity_id, source_record_id, page) VALUES('event', ?, ?, 'p. 4')")->execute([$normal, $src2]);
$pdo->prepare("INSERT INTO evidence_records(person_id, event_id, title) VALUES(?, ?, 'PREUVESECRET')")->execute([$jean, $secret]);
$pdo->prepare("INSERT INTO evidence_records(person_id, event_id, title) VALUES(?, ?, 'PREUVENORMALE')")->execute([$jean, $normal]);
$pdo->prepare("INSERT OR REPLACE INTO app_settings(key, value) VALUES('start_person_id', ?)")->execute([(string) $jean]);
echo json_encode(['jean' => $jean, 'normal' => $normal, 'secret' => $secret, 'mars' => $mars]);`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0 || !/jean/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const ID = JSON.parse(seed.stdout.trim().split('\n').pop());
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: ['ignore', 'ignore', process.env.EVCONF_LOG ? fs.openSync(process.env.EVCONF_LOG, 'a') : 'ignore']});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const get = async q => { const r = await fetch(base + 'api.php?' + new URLSearchParams(q)); return {status: r.status, type: r.headers.get('content-type') || '', buf: Buffer.from(await r.arrayBuffer())}; };
    const unzipAll = buf => { const f = path.join(tmp, 'x-' + Date.now() + '.zip'); fs.writeFileSync(f, buf); const r = spawnSync('unzip', ['-p', f], {encoding: 'latin1', maxBuffer: 1 << 28}); fs.unlinkSync(f); return Buffer.from(r.stdout || '', 'latin1').toString('utf8'); };
    const browser = await chromium.launch();
    const errs = [];
    try {
        const p = await (await browser.newContext({viewport: {width: 1440, height: 900}})).newPage();
        p.on('pageerror', e => errs.push(e.message));
        const boot = async () => { await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_PARTS?.renderTimeline, null, {timeout: 30000}); };
        await boot();
        const api = (x, q = {}) => p.evaluate(([y, z]) => window.LCNDA_APP.api(y, z).catch(e => ({error: e.message})), [x, q]);
        const post = (a, b) => p.evaluate(async ([x, y]) => { try { const r = await window.LCNDA_APP.api(x, {}, {method: 'POST', body: y}); return r.result || r; } catch (e) { return {error: e.message}; } }, [a, b]);

        /* ═════ 1. exports pour d'autres ═════ */
        await t('GEDCOM : sans l’événement confidentiel, sa note ni sa source', async () => {
            const r = await get({action: 'export_gedcom'}); assert.equal(r.status, 200); const txt = r.buf.toString('utf8');
            assert.match(txt, /1881/); assert.match(txt, /SOURCENORMALE/); noSecret(txt, 'GEDCOM');
            const share = (await get({action: 'export_gedcom', privacy: 'share'})).buf.toString('utf8'); noSecret(share, 'GEDCOM pour partager');
        });
        await t('JSON : sans l’événement confidentiel', async () => {
            const txt = (await get({action: 'export_json'})).buf.toString('utf8');
            assert.match(txt, /NORMALXYZ/); assert.match(txt, /NOTENORMALE/); noSecret(txt, 'JSON');
        });
        await t('CSV (événements, global) : sans l’événement confidentiel', async () => {
            const ev = (await get({action: 'export_csv', type: 'events'})).buf.toString('utf8'); assert.match(ev, /1881/); noSecret(ev, 'CSV événements');
            const all = (await get({action: 'export_csv_global'})).buf.toString('utf8'); assert.match(all, /1881/); noSecret(all, 'CSV global');
        });
        await t('📤 Partager avec la famille : la copie .zip ne l’a pas', async () => {
            const pre = await api('family_share_preview', {}); assert.ok(!pre.error, pre.error);
            const r = await get({action: 'family_share_export'}); assert.equal(r.status, 200, r.buf.toString('utf8').slice(0, 300));
            const txt = unzipAll(r.buf); assert.match(txt, /1881/); noSecret(txt, 'partage famille');
            assert.match(txt, /ni les fiches et événements confidentiels/);
        });
        await t('🌐 Mon site web : blocs (fiche, frise, carte) et .zip sans l’événement confidentiel', async () => {
            const blocks = [{kind: 'person', person: ID.jean}, {kind: 'timeline', person: ID.jean}, {kind: 'map', person: ID.jean, scope: 'person'}];
            const rd = await api('website_render', {blocks: JSON.stringify(blocks)}); assert.ok(!rd.error, rd.error);
            const html = JSON.stringify(rd); assert.match(html, /1881/); noSecret(html, 'rendu des blocs');
            const pts = await api('website_map_points', {person: ID.jean, scope: 'person', gens: 6}); noSecret(JSON.stringify(pts), 'points de la carte du site');
            const site = {settings: {title: 'Famille Martin'}, theme: {}, css: '', js: '', pages: [{id: 'p1', name: 'Accueil', slug: 'index', html: `<h1>Famille</h1><div data-lc-block="person" data-person="${ID.jean}"></div><div data-lc-block="timeline" data-person="${ID.jean}"></div>`, title: '', desc: ''}]};
            const saved = await post('save_website', {name: 'Site essai', data: site}); assert.ok(saved.id, JSON.stringify(saved));
            const z = await get({action: 'website_export', id: saved.id, format: 'zip'}); assert.equal(z.status, 200, z.buf.toString('utf8').slice(0, 300));
            const txt = unzipAll(z.buf); assert.match(txt, /1881/); noSecret(txt, 'site exporté');
            const one = (await get({action: 'website_export', id: saved.id, format: 'html', page: 'index'})).buf.toString('utf8'); assert.match(one, /1881/); noSecret(one, 'page seule');
        });
        await t('📕 livre de famille : sans l’événement confidentiel', async () => {
            for (const format of ['html', 'md', 'txt']) {
                const txt = (await get({action: 'export_family_book', format, event_count: 60})).buf.toString('utf8');
                assert.match(txt, /1881/, format); noSecret(txt, 'livre ' + format);
            }
        });
        await t('🔎 rapport de recherche : sans la preuve de l’événement confidentiel', async () => {
            const txt = (await get({action: 'export_research_report'})).buf.toString('utf8');
            assert.match(txt, /Éléments de preuve[\s\S]*12 mars 1881/); noSecret(txt, 'rapport de recherche'); // la preuve de l'événement normal, pas l'autre
            assert.equal((txt.match(/<article class="card">/g) || []).length, 1, 'une seule preuve');
        });
        await t('📐 mise en page (livre) : les données du livre n’ont pas l’événement confidentiel', async () => {
            const d = await api('layout_family_data', {scope: 'all', root_id: String(ID.jean), generations: '2', sections: 'people', parts: 'bio,family,events,notes', event_count: '60'});
            assert.ok(!d.error, d.error); const txt = JSON.stringify(d); assert.match(txt, /1881/); noSecret(txt, 'mise en page');
        });

        await t('⤓ autres formats (GEDCOM-X, .ics, KML, GeoJSON) : sans l’événement confidentiel', async () => {
            for (const format of ['gedcomx', 'ics', 'kml', 'geojson']) {
                const r = await get({action: 'export_plus', format}); assert.equal(r.status, 200, format + ' ' + r.buf.toString('utf8').slice(0, 200));
                noSecret(r.buf.toString('utf8'), 'export ' + format);
            }
            const kml = (await get({action: 'export_plus', format: 'kml'})).buf.toString('utf8'); assert.match(kml, /Lyon/); assert.doesNotMatch(kml, /Marseille/);
        });
        await t('🤝 travail à deux : le paquet n’envoie ni l’événement confidentiel, ni sa « suppression »', async () => {
            const st = await post('sync_start', {author: 'Moi'}); assert.ok(!st.error, st.error);
            const upd = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', `$p = new PDO('sqlite:' . getenv('GENEALOGY_DATA_DIR') . '/genealogy.sqlite'); $p->exec("UPDATE events SET description='NORMALXYZ2' WHERE id=${ID.normal}"); $p->exec("UPDATE events SET description='SECRETXYZ2' WHERE id=${ID.secret}"); $p->exec("UPDATE notes SET body='NOTESECRET2' WHERE entity_type='event' AND entity_id=${ID.secret}");`], {cwd: root, encoding: 'utf8', env});
            assert.equal(upd.status, 0, upd.stderr);
            const r = await get({action: 'sync_export'}); const txt = r.buf.toString('utf8'); assert.equal(r.status, 200, txt.slice(0, 300));
            const pkg = JSON.parse(txt); assert.match(txt, /NORMALXYZ2/); noSecret(txt, 'paquet du travail à deux');
            assert.ok(!pkg.changes.some(c => c.op === 'delete'), 'aucune suppression envoyée : ' + JSON.stringify(pkg.changes.map(c => [c.tbl, c.op])));
            const again = await get({action: 'sync_export'}); assert.equal(again.status, 422, 'rien de plus à envoyer');
        });

        /* ═════ 2. propriétaire : montré, avec 🔒 ═════ */
        await t('propriétaire : la fiche, la frise et la carte l’envoient (marqué confidentiel)', async () => {
            const pd = await api('person', {id: ID.jean}); assert.ok(pd.events.some(e => Number(e.id) === ID.secret && Number(e.is_private) === 1));
            const tl = await api('timeline', {id: ID.jean, up: 0, down: 0}); assert.ok(tl.events.some(e => Number(e.id) === ID.secret && Number(e.is_private) === 1));
            const mp = await api('map', {tag: 'all', limit: 2500}); assert.ok(mp.points.some(e => Number(e.id) === ID.secret && Number(e.is_private) === 1));
            const bio = await api('biography', {id: ID.jean, length: 'normal'}); assert.match(bio.generated, /🔒[^.]*Marseille/);
        });
        const goChrono = async () => {
            await p.evaluate(id => { const A = window.LCNDA_APP; A.state.currentPersonId = id; Object.assign(A.state.timeline, {source: 'person', up: 0, down: 0, partners: true, history: false, view: 'vertical', ages: true, anomalies: false, parallelMode: 'single', compare: false, kinds: [], q: ''}); A.setModule('chronologie'); }, ID.jean);
            await p.waitForSelector('#chrono-body .timeline-row', {timeout: 15000}); await sleep(300);
        };
        await t('Chronologie (propriétaire) : l’événement confidentiel avec la pastille 🔒', async () => {
            await goChrono();
            const row = await p.$(`#chrono-body [data-event-id="${ID.secret}"]`); assert.ok(row, 'ligne de l’événement confidentiel');
            assert.match(await row.textContent(), /🔒 confidentiel/);
            assert.doesNotMatch(await p.textContent(`#chrono-body [data-event-id="${ID.normal}"]`), /🔒/);
        });
        const goMap = async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.mapMode = 'standard'; A.state.mapTag = 'all'; A.state.mapDisplay = 'markers'; localStorage.removeItem('genealogie-map-lineage'); localStorage.removeItem('genealogie-map-options'); A.setModule('carte'); });
            await p.waitForSelector('#map-stage', {timeout: 15000});
            await p.waitForFunction(() => (window.LCNDA_APP.state.mapPoints || []).length > 0, null, {timeout: 15000}); await sleep(300);
        };
        await t('Carte (propriétaire) : le point confidentiel est là, sa bulle porte 🔒', async () => {
            await goMap();
            assert.ok(await p.evaluate(id => window.LCNDA_APP.state.mapPoints.some(x => Number(x.id) === id), ID.secret));
            await p.evaluate(id => document.querySelector('#map-goto').dispatchEvent(new CustomEvent('picker-change', {bubbles: true, detail: {item: {id, title: 'Marseille', kind: 'place'}}})), ID.mars);
            await p.waitForSelector('#map-tooltip', {timeout: 5000});
            assert.match(await p.textContent('#map-tooltip'), /🔒 confidentiel/);
            await p.evaluate(() => document.getElementById('map-tooltip')?.remove());
        });

        await t('📊 Graphiques : « 🧭 lien » aussi dans les cases de l’arbre ascendant (LCNDA_APP.decorateKinship)', async () => {
            await p.evaluate(id => { const A = window.LCNDA_APP; A.state.currentPersonId = id; A.state.graphTab = 'types'; A.state.graphMode = 'ancestors'; A.setModule('graphiques'); }, ID.jean);
            await p.waitForSelector(`#workspace .tree-card[data-tree-person="${ID.jean}"] .pa-kin`, {timeout: 15000});
            assert.match(await p.textContent(`#workspace .tree-card[data-tree-person="${ID.jean}"] .pa-kin`), /🧭/);
        });

        /* ═════ 3. consultation : caché ═════ */
        await t('consultation : le serveur ne l’envoie plus (fiche, frise, carte, biographie, notes, sources)', async () => {
            assert.ok(!(await post('kiosk_enter', {password: '1234'})).error);
            await boot(); await p.waitForFunction(() => document.body.classList.contains('is-kiosk'), null, {timeout: 15000});
            const pd = await api('person', {id: ID.jean}); assert.ok(!pd.error, pd.error);
            assert.ok(pd.events.some(e => Number(e.id) === ID.normal)); noSecret(JSON.stringify(pd), 'fiche en consultation');
            const tl = await api('timeline', {id: ID.jean, up: 0, down: 0}); assert.ok(tl.events.some(e => Number(e.id) === ID.normal)); noSecret(JSON.stringify(tl), 'frise');
            const mp = await api('map', {tag: 'all', limit: 2500}); assert.ok(mp.points.length); noSecret(JSON.stringify(mp), 'carte');
            const bio = await api('biography', {id: ID.jean, length: 'long'}); assert.ok(!bio.error, bio.error); noSecret(JSON.stringify(bio), 'biographie'); assert.doesNotMatch(bio.generated, /🔒/);
        });
        await t('consultation : Chronologie et Carte ne le montrent pas', async () => {
            await goChrono();
            assert.ok(await p.$(`#chrono-body [data-event-id="${ID.normal}"]`));
            assert.equal(await p.$(`#chrono-body [data-event-id="${ID.secret}"]`), null);
            noSecret(await p.textContent('#chrono-body'), 'écran Chronologie');
            await goMap();
            assert.ok(!(await p.evaluate(id => window.LCNDA_APP.state.mapPoints.some(x => Number(x.id) === id), ID.secret)));
        });
        await p.evaluate(async () => { await fetch('api.php?action=kiosk_exit', {method: 'POST', headers: {'Content-Type': 'application/json', 'X-CSRF-Token': window.LCNDA_APP.state.csrf}, body: JSON.stringify({password: '1234', csrf: window.LCNDA_APP.state.csrf})}); });
        await t('après la consultation : le propriétaire le retrouve', async () => {
            const pd = await api('person', {id: ID.jean}); assert.ok(pd.events.some(e => Number(e.id) === ID.secret));
        });
        await t('pas d’erreur JavaScript', async () => { assert.deepStrictEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill();
        fs.rmSync(tmp, {recursive: true, force: true});
    }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})();
