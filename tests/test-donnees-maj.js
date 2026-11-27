#!/usr/bin/env node
/* 🗂 Données installées : la date des données d'une liste, « ↻ Vérifier », mettre à jour (sha256, ↶), Réglages → 🗂 Données
 * (tout ce qui se télécharge : file, pause, reprise après redémarrage, annuler, supprimer + ↶).
 * (lib/donnees_maj.php, lib/donnees_maj_route.php, assets/js/app-listes-maj.js, scripts/donnees-manifest.js)
 *
 * Le « GitHub » des données est un petit serveur local (GENEALOGY_TEST=1 + LCNDA_TEST_DONNEES_BASE) qui sert
 * assets/data/manifest.json et un l8c-tour.json.gz plus récent (+21 étapes de 2026) ; il sait aussi répondre « pareil »,
 * servir un fichier abîmé, ou couper la connexion (hors ligne). Wikidata : LCNDA_TEST_WIKIDATA_URL.
 * Les packs météo d'essai (scripts/meteo/make-fixture.py) servent pour la file (LCNDA_TEST_METEO_DIR) ; les autres familles
 * pointent vers un dossier vide (rien en ligne, aucune connexion réelle).
 *   node tests/test-donnees-maj.js */
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const http = require('http');
const zlib = require('zlib');
const crypto = require('crypto');
const {spawn, spawnSync} = require('child_process');
let chromium; try { ({chromium} = require('playwright')); } catch (_) { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); }
const root = path.join(__dirname, '..');
const {findPhp, phpRuntimeArgs, devBundledPhp} = require('../electron/php-server.js');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 8).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const rowsOfGz = b => JSON.parse(zlib.gunzipSync(b).toString('utf8')).rows.length;

(async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-dmaj-')), empty = path.join(tmp, 'vide'), site = path.join(tmp, 'meteo-site'), fx = path.join(tmp, 'fx');
    [path.join(tmp, 'media'), empty, site].forEach(d => fs.mkdirSync(d, {recursive: true}));

    /* le pack « plus récent » : les étapes de 2026 en plus */
    const localManifest = JSON.parse(fs.readFileSync(path.join(root, 'assets/data/manifest.json'), 'utf8'));
    const shipped = fs.readFileSync(path.join(root, 'assets/data/l8c-tour.json.gz'));
    const shippedRows = rowsOfGz(shipped);
    assert.strictEqual(localManifest.packs['l8c-tour'].files['l8c-tour.json.gz'].sha256, sha(shipped), 'manifest.json à jour (node scripts/donnees-manifest.js)');
    const tour = JSON.parse(zlib.gunzipSync(shipped).toString('utf8'));
    const yi = tour.fields.indexOf('y'), di = tour.fields.indexOf('d'), ni = tour.fields.indexOf('no'), qi = tour.fields.indexOf('q');
    for (let i = 1; i <= 21; i++) { const r = tour.rows[tour.rows.length - 1].slice(); r[qi] = 'Q99990' + i; r[yi] = 2026; r[di] = `2026-07-${String(i).padStart(2, '0')}`; r[ni] = String(i); tour.rows.push(r); }
    tour.built = '2026-12-02';
    const newer = zlib.gzipSync(Buffer.from(JSON.stringify(tour)), {level: 9});
    const remoteNewer = JSON.parse(JSON.stringify(localManifest));
    remoteNewer.packs['l8c-tour'] = {...remoteNewer.packs['l8c-tour'], version: '2026-12-02', built: '2026-12-02', rows: shippedRows + 21, size: newer.length, files: {'l8c-tour.json.gz': {sha256: sha(newer), size: newer.length}}};
    // un pack qui voudrait écrire hors de son dossier : écarté
    remoteNewer.packs['l8c-clubs'] = {...remoteNewer.packs['l8c-clubs'], version: '2099-01-01', files: {'../../evil.json.gz': {sha256: sha(newer), size: newer.length}}};
    remoteNewer.packs['inconnu-pirate'] = {version: '2099-01-01', files: {'inconnu-pirate.json.gz': {sha256: sha(newer), size: newer.length}}};
    let mode = 'same', hits = [];
    const fake = http.createServer((req, res) => {
        hits.push(req.url);
        if (mode === 'down') return req.socket.destroy();
        if (req.url === '/sparql' && req.method === 'POST') { let b = ''; req.on('data', c => { b += c; }); req.on('end', () => { fake.lastSparql = {body: b, ua: req.headers['user-agent']}; res.setHeader('Content-Type', 'application/sparql-results+json'); res.end(JSON.stringify({results: {bindings: [{n: {value: String(shippedRows + 24)}}]}})); }); return; }
        if (req.url === '/gh/assets/data/manifest.json') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(mode === 'same' ? localManifest : remoteNewer)); }
        if (req.url === '/gh/assets/data/l8c-tour.json.gz') { const b = mode === 'bad' ? Buffer.concat([newer.subarray(0, newer.length - 3), Buffer.from('abc')]) : newer; return res.end(b); }
        res.statusCode = 404; res.end('nope');
    });
    const fport = await freePort(); await new Promise(r => fake.listen(fport, '127.0.0.1', r));

    /* les packs météo d'essai, coupés en morceaux (plusieurs tranches = on peut mettre en pause au milieu) */
    const mk = spawnSync('python3', [path.join(root, 'scripts/meteo/make-fixture.py'), fx], {encoding: 'utf8'});
    if (mk.status !== 0) { console.error(mk.stderr || mk.stdout); process.exit(1); }
    const packs = {};
    for (const kind of ['complet', 'europe']) {
        const buf = fs.readFileSync(path.join(fx, `meteo-pack-${kind}.lcmeteo`)), n = 4, cut = [...Array(n + 1)].map((_, i) => Math.floor(buf.length * i / n));
        const parts = [...Array(n)].map((_, i) => { const name = `meteo-pack-${kind}.lcmeteo.00${i}`; fs.writeFileSync(path.join(site, name), buf.subarray(cut[i], cut[i + 1])); return {name, size: cut[i + 1] - cut[i]}; });
        packs[kind] = {size: buf.length, sha256: sha(buf), built: '2026-10-22', parts}; // la date des packs d'essai : installés, ils sont « à jour »
    }
    fs.writeFileSync(path.join(site, 'meteo-manifest.json'), JSON.stringify({version: '2026-11', packs}));

    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4', GENEALOGY_TEST: '1',
        LCNDA_TEST_DONNEES_BASE: `http://127.0.0.1:${fport}/gh/`, LCNDA_TEST_WIKIDATA_URL: `http://127.0.0.1:${fport}/sparql`,
        LCNDA_TEST_METEO_DIR: site, LCNDA_METEO_DIR: path.join(tmp, 'app-meteo'),
        LCNDA_TEST_GOV_DIR: empty, LCNDA_TEST_HIST_DIR: empty, LCNDA_TEST_PRENOMS_DIR: empty, LCNDA_TEST_ELECTIONS_DIR: empty, LCNDA_TEST_BO_DIR: empty, LCNDA_TEST_LP_DIR: empty, LCNDA_TEST_BA_DIR: empty, LCNDA_TEST_TN_DIR: empty, LCNDA_TEST_TELECHA_DIR: empty}; // aucune famille ne va sur GitHub (seule la météo d'essai est « en ligne »)
    fs.mkdirSync(env.LCNDA_METEO_DIR, {recursive: true});
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start) VALUES(1,'Jean','MAZAUD','male','deceased',1)");
echo json_encode(['ok' => 1]);`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0 || !/"ok"/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const port = await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const served = async () => rowsOfGz(Buffer.from(await (await fetch(base + 'assets/data/l8c-tour.json.gz?v=1')).arrayBuffer()));
    const browser = await chromium.launch();
    const errs = [];
    try {
        const ctx = await browser.newContext({viewport: {width: 1440, height: 900}});
        const p = await ctx.newPage();
        p.on('pageerror', e => errs.push(e.message));
        const boot = async () => { await p.goto(base); await p.waitForFunction(() => window.LCNDA_EXT?.listesMaj && window.LCNDA_EXT?.dataListsEngine && window.LCNDA_APP?.state?.csrf, null, {timeout: 30000}); };
        await boot();
        const api = (x, q = {}) => p.evaluate(([y, z]) => window.LCNDA_APP.api(y, z).catch(e => ({error: e.message, status: e.status})), [x, q]);
        const post = (a, b) => p.evaluate(async ([x, y]) => { try { const r = await window.LCNDA_APP.api(x, {}, {method: 'POST', body: y}); return r.result || r; } catch (e) { return {error: e.message, status: e.status}; } }, [a, b]);
        const toastText = () => p.evaluate(() => [...document.querySelectorAll('.ui-toast')].map(x => x.textContent).join(' | '));
        const clickToast = re => p.evaluate(src => { const r = new RegExp(src); const el = [...document.querySelectorAll('.ui-toast')].reverse().find(x => r.test(x.textContent)); el.querySelector('.ui-toast-acts button').click(); }, re.source);
        const openTour = async () => { await p.evaluate(() => { window.LCNDA_APP.setModule('listes'); window.LCNDA_EXT.dataListsEngine.open('l8c_tour'); }); await p.waitForSelector('[data-dmaj-line] [data-dmaj-check]', {timeout: 20000}); };
        const openPanel = async () => { await p.evaluate(() => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'donnees_installees'; A.setModule('maintenance'); }); await p.waitForSelector('[data-dmaj-panel] [data-dmaj-row]', {timeout: 20000}); };

        await t('la liste dit la date de ses données : « Données du 25 nov. 2026 · ↻ Vérifier » ; rien ne part sur Internet sans un clic', async () => {
            hits = [];
            await openTour();
            const txt = await p.textContent('[data-dmaj-line]');
            const v = localManifest.packs['l8c-tour'].version;
            const fr = new Date(v + 'T12:00:00Z').toLocaleDateString('fr-FR', {day: 'numeric', month: 'short', year: 'numeric'});
            assert.ok(txt.includes(`Données du ${fr}`), txt); assert.match(txt, /↻ Vérifier/);
            assert.strictEqual(await p.getAttribute('[data-dmaj-line]', 'data-dmaj-packs'), 'l8c-tour');
            await sleep(500); assert.deepStrictEqual(hits, [], 'aucune vérification automatique');
            assert.strictEqual(await p.evaluate(() => localStorage.getItem('genealogie-donnees-maj-auto')), null, 'vérification mensuelle éteinte au départ');
        });
        await t('pas plus récent → « Ces données sont à jour »', async () => {
            mode = 'same';
            await p.click('[data-dmaj-check]'); await p.waitForSelector('[data-dmaj-uptodate]', {timeout: 15000});
            assert.match(await p.textContent('[data-dmaj-res]'), /à jour/);
        });
        await t('hors ligne → message clair, rien ne casse', async () => {
            mode = 'down';
            await p.click('[data-dmaj-check]'); await p.waitForSelector('[data-dmaj-offline]', {timeout: 30000});
            assert.match(await p.textContent('[data-dmaj-offline]'), /Pas de connexion/);
            assert.strictEqual(await served(), shippedRows);
            const r = await post('donnees_maj_apply', {pack: 'l8c-tour'}); assert.match(r.error || '', /connexion/i); assert.strictEqual(r.status, 503);
        });
        await t('serveur : seulement les packs connus de l’app, pas de chemin hors du dossier', async () => {
            mode = 'newer';
            const r = await api('donnees_maj_check', {packs: 'l8c-tour,l8c-clubs,inconnu-pirate,../../etc', fresh: 1});
            assert.deepStrictEqual(Object.keys(r.packs).sort(), ['l8c-clubs', 'l8c-tour']);
            assert.strictEqual(r.packs['l8c-clubs'].remote, null, 'chemin « ../ » : pack écarté'); assert.strictEqual(r.packs['l8c-clubs'].newer, false);
            assert.strictEqual(r.packs['l8c-tour'].newer, true); assert.strictEqual(r.packs['l8c-tour'].download, newer.length);
            assert.match((await post('donnees_maj_apply', {pack: '../../config'})).error, /inconnu/i);
            assert.match((await post('donnees_maj_apply', {pack: 'inconnu-pirate'})).error, /inconnu/i);
            assert.ok(!fs.existsSync(path.join(tmp, 'evil.json.gz')));
        });
        await t('fichier abîmé (sha256 différent) → refusé, rien n’a changé', async () => {
            mode = 'bad';
            const r = await post('donnees_maj_apply', {pack: 'l8c-tour'});
            assert.match(r.error || '', /sha256/); assert.strictEqual(await served(), shippedRows);
            assert.strictEqual((await api('donnees_maj_status')).packs.find(x => x.id === 'l8c-tour').state, 'shipped');
        });
        await t('plus récent → « 2 446 → 2 467 lignes », licence et source avant ; Mettre à jour → « +21 lignes : 2026 » ; ↶ Annuler remet l’ancienne', async () => {
            mode = 'newer';
            await p.click('[data-dmaj-check]'); await p.waitForSelector('[data-dmaj-newer]', {timeout: 15000});
            const txt = await p.textContent('[data-dmaj-res]');
            const n = x => x.toLocaleString('fr-FR');
            assert.ok(txt.replace(/\s/g, ' ').includes(`${n(shippedRows)} → ${n(shippedRows + 21)} lignes`.replace(/\s/g, ' ')), txt);
            assert.match(txt, /Licence : CC0 1\.0/); assert.match(txt, /Source : Wikidata/); assert.match(txt, /Mettre à jour \(\d+ Ko\)/);
            await p.click('[data-dmaj-apply]');
            await p.waitForFunction(() => /\+21 lignes : 2026/.test([...document.querySelectorAll('.ui-toast')].map(x => x.textContent).join(' ')), null, {timeout: 20000});
            assert.strictEqual(await served(), shippedRows + 21, 'le routeur sert la nouvelle version');
            assert.ok(fs.existsSync(path.join(tmp, 'donnees-maj/files/l8c-tour.json.gz')), 'rangé dans le dossier des données, pas dans l’app');
            assert.strictEqual(sha(fs.readFileSync(path.join(root, 'assets/data/l8c-tour.json.gz'))), sha(shipped), 'le fichier livré n’est pas touché');
            const st = (await api('donnees_maj_status')).packs.find(x => x.id === 'l8c-tour');
            assert.deepStrictEqual([st.state, st.version, st.rows, st.can_undo], ['updated', '2026-12-02', shippedRows + 21, true]);
            await p.waitForSelector('[data-dmaj-done]');
            await clickToast(/\+21 lignes/); await sleep(800);
            assert.strictEqual(await served(), shippedRows, '↶ Annuler : l’ancienne version');
            assert.strictEqual((await api('donnees_maj_status')).packs.find(x => x.id === 'l8c-tour').state, 'shipped');
            assert.strictEqual((await post('donnees_maj_undo', {pack: 'l8c-tour'})).state, 'updated', '↷ rétablir (échange)');
            assert.strictEqual(await served(), shippedRows + 21);
            await post('donnees_maj_undo', {pack: 'l8c-tour'}); assert.strictEqual(await served(), shippedRows);
        });
        await t('Wikidata : recompter en direct (la question du sommaire, User-Agent générique, rien de personnel)', async () => {
            const r = await api('donnees_maj_wikidata', {pack: 'l8c-tour'});
            assert.deepStrictEqual([r.count, r.rows], [shippedRows + 24, shippedRows]);
            assert.match(decodeURIComponent(fake.lastSparql.body.replace(/\+/g, ' ')), /Q33881/); assert.match(fake.lastSparql.ua, /^LCNDA\/1\.0 \(genealogy desktop app/); assert.ok(!/@/.test(fake.lastSparql.ua));
            assert.match((await api('donnees_maj_wikidata', {pack: 'l8c-clubs'})).error, /Wikidata/);
        });
        await t('mode consultation : vérifier et mettre à jour refusés', async () => {
            assert.ok(!(await post('kiosk_enter', {password: '1234'})).error);
            const a = await post('donnees_maj_apply', {pack: 'l8c-tour'}); assert.strictEqual(a.status, 423);
            const c = await api('donnees_maj_check', {packs: 'l8c-tour'}); assert.strictEqual(c.status, 423);
            assert.strictEqual(await served(), shippedRows);
            assert.ok(!(await post('kiosk_exit', {password: '1234'})).error);
        });
        await t('Réglages → 🗂 Données : tout ce qui se télécharge, par thème, avec son état ; filtres et recherche', async () => {
            await openPanel();
            const keys = await p.$$eval('[data-dmaj-row]', els => els.map(e => e.dataset.dmajRow));
            for (const k of ['meteo:socle', 'meteo:complet', 'meteo:europe', 'meteo:plus-neige', 'gov:gov', 'hist:histoire', 'pp:pays', 'elections:elections', 'bo:mpf', 'bo:leonore', 'ba:annuaires', 'data:l8c-tour', 'data:wikidata']) assert.ok(keys.includes(k), k);
            assert.strictEqual(await p.getAttribute('[data-dmaj-row="meteo:complet"]', 'data-dmaj-state'), 'missing');
            assert.match(await p.textContent('[data-dmaj-row="data:l8c-tour"]'), /CC0 1\.0/);
            assert.match(await p.textContent('[data-dmaj-used]'), /Installé : /); assert.ok(await p.$('[data-dmaj-free]'));
            await p.fill('[data-dmaj-q]', 'débit des rivières'); await sleep(500);
            assert.deepStrictEqual(await p.$$eval('[data-dmaj-row]', els => els.map(e => e.dataset.dmajRow)), ['meteo:plus-rivieres']);
            await p.fill('[data-dmaj-q]', ''); await sleep(500);
            await p.click('[data-dmaj-checkall]'); await p.waitForFunction(() => /Tout télécharger \(\d/.test(document.querySelector('[data-dmaj-getall]')?.textContent || ''), null, {timeout: 30000});
            assert.strictEqual(await p.getAttribute('[data-dmaj-row="data:l8c-tour"]', 'data-dmaj-state'), 'update');
            assert.strictEqual(await p.getAttribute('[data-dmaj-row="gov:gov"]', 'data-dmaj-state'), 'absent', 'pas en ligne');
            assert.ok(!(await p.$('[data-dmaj-offline]')), 'pas de faux « hors ligne »');
            assert.match(await p.textContent('[data-dmaj-updall]'), /Tout mettre à jour \(1\)/);
            await p.click('[data-dmaj-filter="update"]');
            assert.deepStrictEqual(await p.$$eval('[data-dmaj-row]', els => els.map(e => e.dataset.dmajRow)), ['data:l8c-tour']);
            await p.click('[data-dmaj-filter="missing"]');
            assert.ok((await p.$$eval('[data-dmaj-row]', els => els.map(e => e.dataset.dmajRow))).includes('meteo:europe'));
            await p.click('[data-dmaj-filter="all"]');
            // les 4 filtres tiennent sur une seule ligne (pas « Mise à jour dispo » tout seul en dessous)
            const tops = await p.$$eval('[data-dmaj-filter]', els => els.map(e => Math.round(e.getBoundingClientRect().top)));
            assert.strictEqual(new Set(tops).size, 1, `filtres sur une ligne : ${tops}`);
            await p.screenshot({path: path.join(require('os').tmpdir(), 'dmaj-filtres.png'), clip: await p.$eval('.dmaj-filters', e => { const r = e.getBoundingClientRect(); return {x: Math.max(0, r.x - 20), y: Math.max(0, r.y - 20), width: Math.min(r.width + 40, 1400), height: r.height + 40}; })});
        });
        await t('« ⤓ Tout télécharger » : confirmation, une file un pack à la fois, pause, reprise après redémarrage', async () => {
            // des tranches lentes : le temps de mettre en pause
            await p.route('**/api.php?action=meteo_dl_step*', async r => { await sleep(500); await r.continue(); });
            const gl = await p.textContent('[data-dmaj-getall]'); assert.match(gl, /Tout télécharger \(\d/);
            await p.click('[data-dmaj-getall]');
            await p.waitForSelector('dialog[open]'); const dlg = await p.textContent('dialog[open]');
            assert.match(dlg, /2 packs/); assert.match(dlg, /min/); assert.match(dlg, /Licence|licence|CC BY/);
            await p.click('dialog[open] button:has-text("Télécharger")');
            await p.waitForSelector('[data-dmaj-queue-box]');
            await p.waitForFunction(() => { const q = JSON.parse(localStorage.getItem('genealogie-donnees-file') || '[]'); return q.some(x => x.received > 0); }, null, {timeout: 20000});
            await p.click('[data-dmaj-pause]');
            await p.waitForSelector('[data-dmaj-resume]', {timeout: 20000});
            const q = JSON.parse(await p.evaluate(() => localStorage.getItem('genealogie-donnees-file')));
            assert.deepStrictEqual(q.map(x => x.k), ['complet', 'europe'].filter(k => q.some(x => x.k === k)), 'la file gardée');
            assert.ok(q.length >= 1 && q.every(x => x.state === 'paused'));
            const before = q[0].received; assert.ok(before > 0 && before < q[0].size, 'arrêtée au milieu d’un pack');
            assert.strictEqual((await api('meteo_status')).files?.[q[0].k], undefined);
            // « redémarrage » : on recharge l'app, la file est toujours là
            await p.unroute('**/api.php?action=meteo_dl_step*');
            await boot(); await openPanel();
            await p.waitForSelector('[data-dmaj-queue-box] [data-dmaj-resume]');
            assert.match(await p.textContent('[data-dmaj-queue-box]'), /en pause/);
            await p.click('[data-dmaj-resume]');
            await p.waitForFunction(() => /2 packs installés|installé\./.test([...document.querySelectorAll('.ui-toast')].map(x => x.textContent).join(' ')), null, {timeout: 40000});
            const st = await api('meteo_status');
            assert.ok(st.files.complet?.ok && st.files.europe?.ok, JSON.stringify(Object.keys(st.files || {})));
            assert.strictEqual(await p.evaluate(() => localStorage.getItem('genealogie-donnees-file')), null, 'file vidée');
            await p.waitForSelector('[data-dmaj-row="meteo:complet"][data-dmaj-state="ok"]');
        });
        await t('🗑 Supprimer un pack pour libérer de la place, ↶ Annuler le remet', async () => {
            await p.click('[data-dmaj-row="meteo:europe"] [data-dmaj-do="remove"]');
            await p.waitForSelector('dialog[open]'); await p.click('dialog[open] button:has-text("Supprimer")');
            await p.waitForFunction(() => /supprimé/.test([...document.querySelectorAll('.ui-toast')].map(x => x.textContent).join(' ')), null, {timeout: 15000});
            assert.strictEqual((await api('meteo_status')).files.europe, undefined);
            await p.waitForSelector('[data-dmaj-row="meteo:europe"][data-dmaj-state="missing"]');
            await clickToast(/supprimé/); await sleep(1000);
            assert.ok((await api('meteo_status')).files.europe?.ok, '↶ remis');
        });
        await t('Annuler un téléchargement en cours : rien d’installé, la file vidée', async () => {
            await post('meteo_pack_remove', {kind: 'complet'}); await openPanel();
            await p.waitForSelector('[data-dmaj-row="meteo:complet"] [data-dmaj-do="get"]');
            await p.route('**/api.php?action=meteo_dl_step*', async r => { await sleep(700); await r.continue(); });
            await p.click('[data-dmaj-row="meteo:complet"] [data-dmaj-do="get"]');
            await p.waitForSelector('dialog[open]'); await p.click('dialog[open] button:has-text("Télécharger")');
            await p.waitForSelector('[data-dmaj-queue-box] [data-dmaj-cancel]');
            await sleep(300);
            await p.click('[data-dmaj-cancel]');
            await p.waitForSelector('dialog[open]'); await p.click('dialog[open] button:has-text("Annuler les téléchargements")');
            await p.waitForFunction(() => !document.querySelector('[data-dmaj-queue-box]'), null, {timeout: 20000});
            await p.unroute('**/api.php?action=meteo_dl_step*');
            assert.strictEqual((await api('meteo_status')).files.complet, undefined);
            assert.strictEqual(await p.evaluate(() => localStorage.getItem('genealogie-donnees-file')), null);
            assert.deepStrictEqual(fs.readdirSync(path.join(tmp, 'meteo', '.envois')).filter(f => /\.part$/.test(f)), [], 'le morceau téléchargé est effacé');
        });
        await t('« ↻ Tout mettre à jour » met à jour les données livrées (file), ↶ Annuler', async () => {
            await openPanel();
            await p.click('[data-dmaj-checkall]'); await p.waitForFunction(() => /Tout mettre à jour \(1\)/.test(document.querySelector('[data-dmaj-updall]')?.textContent || ''), null, {timeout: 30000});
            await p.click('[data-dmaj-updall]'); await p.waitForSelector('dialog[open]'); await p.click('dialog[open] button:has-text("Mettre à jour")');
            await p.waitForFunction(() => /installé/.test([...document.querySelectorAll('.ui-toast')].map(x => x.textContent).join(' ')), null, {timeout: 20000});
            assert.strictEqual(await served(), shippedRows + 21);
            await clickToast(/installé/); await sleep(800);
            assert.strictEqual(await served(), shippedRows);
        });
        await t('aucune erreur JavaScript', async () => { assert.deepStrictEqual(errs, []); });
    } finally { await browser.close(); proc.kill(); fake.close(); fs.rmSync(tmp, {recursive: true, force: true}); }
    console.log(fails ? `${fails} essai(s) en échec` : 'Les données se mettent à jour.');
    process.exit(fails ? 1 : 0);
})();
