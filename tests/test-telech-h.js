#!/usr/bin/env node
/* 🧺 Places, métiers et rivages (lot H « téléchargements ») — assets/js/heritage-telech-h.js, scripts/telech-h/*, assets/data/th-*.json.gz.
 *  1. Node : les fichiers livrés (licence, source, date, petits, dans le manifeste) et le calcul (coutelier de Thiers, pont transbordeur
 *     de Rouen ouvert pendant sa vie, sardinière de Douarnenez, bastide de Monpazier fondée par Édouard Ier, marinier près des maisons
 *     éclusières de Redon, four à pain du lot B réutilisé pour un boulanger, distance à un tracé).
 *  2. Serveur et écran (php -S + Playwright, base temporaire) : rien ne part sur Internet (toute requête hors 127.0.0.1 est comptée et
 *     coupée), ni pour une fiche vivante ni en mode consultation ; fiche, village, listes, cartes, Réglages (interrupteur ↶), 390 px et
 *     thème sombre, aucune erreur JavaScript, aucun « Failed to fetch ».
 *  Fiches (noms inventés) : Jean MAZAUD (1820 Thiers – 1905, coutelier, Rouen en 1870), Marie LACOMBE (1860 Douarnenez – 1935, sardinière),
 *  Paul DURAND (1830 Monpazier – 1900, marinier, Redon en 1870), Luc MAZAUD (vivant, 1990 Thiers).
 *   node tests/test-telech-h.js */
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
const H = require('../assets/js/heritage-telech-h.js');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const raw = n => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root, 'assets/data', `${n}.json.gz`))).toString('utf8'));
const rows = n => H.table(raw(n));
const P = {thiers: {id: 1, name: 'Thiers', lat: 45.8564, lon: 3.5475}, rouen: {id: 2, name: 'Rouen', lat: 49.4431, lon: 1.0993}, douarnenez: {id: 3, name: 'Douarnenez', lat: 48.0925, lon: -4.3303},
    monpazier: {id: 4, name: 'Monpazier', lat: 44.6806, lon: 0.8944}, redon: {id: 5, name: 'Redon', lat: 47.6514, lon: -2.0839}, chauriat: {id: 6, name: 'Chauriat', lat: 45.7513, lon: 3.28}};
const ev = (tag, year, p) => ({tag, year, place_id: p.id, lat: p.lat, lon: p.lon, place: p.name, country: 'France'});
const JEAN = {ok: true, person: {id: 1, gender: 'male', birth: 1820, death: 1905}, jobs: [{text: 'coutelier', year: null}], places: [P.thiers, P.rouen], events: [ev('BIRT', 1820, P.thiers), ev('RESI', 1870, P.rouen), ev('DEAT', 1905, P.rouen)]};
const MARIE = {ok: true, person: {id: 2, gender: 'female', birth: 1860, death: 1935}, jobs: [{text: 'sardinière', year: null}], places: [P.douarnenez], events: [ev('BIRT', 1860, P.douarnenez), ev('DEAT', 1935, P.douarnenez)]};
const PAUL = {ok: true, person: {id: 3, gender: 'male', birth: 1830, death: 1900}, jobs: [{text: 'marinier', year: null}], places: [P.monpazier, P.redon], events: [ev('BIRT', 1830, P.monpazier), ev('RESI', 1870, P.redon)]};
const PACKS = ['th-kiosques', 'th-marianne', 'th-halles', 'th-funiculaires', 'th-eclusieres', 'th-tramways', 'th-bastides', 'th-ateliers', 'th-textes'];
const OPTIONAL = ['th-trudaine', 'th-osm-kiosques', 'th-osm-halles', 'th-osm-eclusieres', 'th-osm-traces'];

(async () => {
    /* ═════════ 1. les fichiers et le calcul ═════════ */
    await t('fichiers livrés : présents, petits, avec source, adresse, licence et date ; dans le manifeste (script scripts/telech-h)', async () => {
        const man = JSON.parse(fs.readFileSync(path.join(root, 'assets/data/manifest.json'), 'utf8'));
        for (const n of [...PACKS, ...OPTIONAL.filter(n => fs.existsSync(path.join(root, 'assets/data', `${n}.json.gz`)))]) {
            const f = path.join(root, 'assets/data', `${n}.json.gz`); assert.ok(fs.existsSync(f), n); assert.ok(fs.statSync(f).size < (n === 'th-osm-traces' ? 15e6 : 2e6), n);
            const m = raw(n); assert.ok(m.source && m.url && m.licence && m.licence_url && /^\d{4}-\d\d-\d\d$/.test(m.built), n); assert.ok(m.rows.length > 0, n);
            assert.ok(man.packs[n] && man.packs[n].rows === m.rows.length && man.packs[n].script === 'scripts/telech-h', `${n} dans le manifeste`);
            assert.ok(/^https:\/\//.test(m.url), `${n} : adresse https`);
        }
        assert.match(raw('th-halles').licence, /CC0/); assert.match(raw('th-textes').licence, /CC BY-SA 4\.0/); assert.match(raw('th-bastides').licence, /CC BY-SA 4\.0/);
        const X = rows('th-textes'); assert.ok(X.length >= 40 && X.every(r => /^\d[\dAB]\d{3}$/.test(r.insee) && r.quote.length >= 40 && r.title), 'phrases avec une commune');
        assert.ok(X.every(r => !/\s[,.;:)]|\(\s*\)/.test(r.quote)), 'pas de phrase abîmée (modèle perdu)');
        assert.ok(rows('th-tramways').every(r => r.to !== null && r.to < 1975), 'tramways : seulement ceux qui ont fermé');
        assert.ok(rows('th-halles').every(r => r.lat > 41 && r.lat < 51.5), 'France seulement');
    });
    await t('🔪 🚡 🚋 calcul : Jean, coutelier né à Thiers → la coutellerie de Thiers (plus loin pour un coutelier) ; le pont transbordeur de Rouen (1899) pendant sa vie', async () => {
        const X = rows('th-textes'), W = rows('th-ateliers');
        const C = H.craftFor(X.filter(r => r.k === 'coutellerie'), W.filter(r => r.k === 'coutellerie'), JEAN, H.JOBS_RE.coutellerie, 40, 10);
        assert.strictEqual(C.job, 'coutelier'); assert.ok(C.texts.some(x => x.r.commune === 'Thiers'), JSON.stringify(C.texts.slice(0, 2)));
        const F = H.pointsFor(rows('th-funiculaires'), JEAN, [12, 12]); assert.ok(F.list.some(x => /transbordeur de Rouen/.test(x.r.n) && x.r.from === 1899), JSON.stringify(F.list.map(x => x.r.n)));
        assert.strictEqual(H.pointsFor(rows('th-funiculaires'), {...JEAN, person: {birth: 1941, death: 2000}}).list.filter(x => /Rouen/.test(x.r.n)).length, 0, 'détruit en 1940 : pas pour quelqu’un né après');
        assert.ok(H.JOBS_RE.eclusieres.test(H.fold('Marinière')) && H.JOBS_RE.conserverie.test(H.fold('sardinière')) && !H.JOBS_RE.coutellerie.test('laboureur'));
    });
    await t('🥫 🏰 🛶 🍞 calcul : Marie, sardinière → Douarnenez ; Paul né à Monpazier → bastide de 1284 (Édouard Ier) ; marinier → maisons éclusières de Redon ; four du lot B', async () => {
        const X = rows('th-textes'), W = rows('th-ateliers');
        const C = H.craftFor(X.filter(r => r.k === 'conserverie'), W.filter(r => r.k === 'conserverie'), MARIE, H.JOBS_RE.conserverie, 40, 10);
        assert.strictEqual(C.job, 'sardinière'); assert.ok(C.texts.some(x => x.r.commune === 'Douarnenez'));
        const B = H.bastideFor(rows('th-bastides'), PAUL); assert.ok(B.length && B[0].r.wp === 'Monpazier' && B[0].r.y === 1284 && /Édouard Ier/.test(B[0].r.by), JSON.stringify(B[0]?.r));
        const E = H.pointsFor(rows('th-eclusieres'), PAUL, [2, 20], H.JOBS_RE.eclusieres); assert.strictEqual(E.job, 'marinier'); assert.ok(E.list.some(x => /Redon/.test(x.r.commune)));
        const fours = H.table(raw('tb-wd-village')).filter(r => r.k === 'four').map(r => ({...r, q: r.src}));
        const BOUL = {ok: true, person: {birth: 1800, death: 1870}, jobs: [{text: 'boulanger'}], events: [ev('BIRT', 1800, P.chauriat)]};
        const F = H.pointsFor(fours, BOUL, [1, 5], H.JOBS_RE.fours); assert.strictEqual(F.job, 'boulanger'); assert.ok(F.list.some(x => /Chauriat/.test(x.r.n)));
        assert.ok(Math.abs(H.distLine(45, 3.001, [3, 44.9, 3, 45.1]) - 0.0786) < 0.01, 'distance à un tracé');
        assert.strictEqual(H.safeUrl('javascript:alert(1)'), ''); assert.strictEqual(H.safeUrl('https://a.b/"onx'), ''); assert.ok(!H.okQ('Q1"><x') && H.okQ('Q42') && H.okOsm('w123') && !H.okOsm('x1'));
    });

    /* ═════════ 2. serveur et écran ═════════ */
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-th-'));
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4', GENEALOGY_TEST: '1'};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start,occupation) VALUES(1,'Jean','MAZAUD','male','deceased',1,'coutelier'),(2,'Marie','LACOMBE','female','deceased',0,'sardinière'),(3,'Paul','DURAND','male','deceased',0,'marinier'),(4,'Luc','MAZAUD','male','living',0,'')");
$pdo->exec("INSERT INTO places(id,name,county,country,latitude,longitude,admin4_code) VALUES(1,'Thiers','Puy-de-Dôme','France',45.8564,3.5475,'63430'),(2,'Rouen','Seine-Maritime','France',49.4431,1.0993,'76540'),(3,'Douarnenez','Finistère','France',48.0925,-4.3303,'29046'),(4,'Monpazier','Dordogne','France',44.6806,0.8944,'24280'),(5,'Redon','Ille-et-Vilaine','France',47.6514,-2.0839,'35236')");
$t = function ($tag) use ($pdo) { $i = (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn(); return $i ?: (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='BIRT' LIMIT 1")->fetchColumn(); };
$ins = $pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,date_text,year,sort_date,place_id) VALUES('person',?,?,?,?,?,?)");
foreach ([[1,'BIRT',1820,1],[1,'RESI',1870,2],[1,'DEAT',1905,2],[2,'BIRT',1860,3],[2,'DEAT',1935,3],[3,'BIRT',1830,4],[3,'RESI',1870,5],[3,'DEAT',1900,5],[4,'BIRT',1990,1]] as [$p,$g,$y,$pl]) { $ins->execute([$p,$t($g),(string)$y,$y,(string)$y,$pl]); }
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
        await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => { outside.push(r.request().url()); return r.abort(); }); // pas d'Internet : tout ce qui sortirait est compté
        const p = await ctx.newPage();
        p.on('pageerror', e => errs.push(e.message));
        p.on('console', m => { if (m.type() === 'error' && /Failed to fetch|th-|telech-h/i.test(m.text())) errs.push(m.text()); });
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_APP?.defaultPersonBlocks, null, {timeout: 30000});
        await p.waitForFunction(() => !!window.LCNDA_EXT?.telechH, null, {timeout: 30000});
        const into = (fn, arg, opts = {}) => p.evaluate(async ([f, a, o]) => { const h = document.createElement('div'); document.body.appendChild(h); const n = await window.LCNDA_EXT.telechH[f](h, a, {detached: true, ...o}); const r = [n, h.innerHTML, h.textContent]; h.remove(); return r; }, [fn, arg, opts]);

        await t('fiche de Jean MAZAUD : 🔪 coutelier de Thiers, 🚡 le pont transbordeur de Rouen, 🚋 le tramway de Rouen ; ↗ source ; ▸ plus ; liens sûrs', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.currentPersonId = 1; A.setModule('personnes'); });
            await p.waitForSelector('[data-th-person="1"] .th-row', {timeout: 30000});
            await sleep(500);
            const txt = await p.textContent('[data-th-person="1"]');
            assert.match(txt, /Il était coutelier/); assert.match(txt, /Thiers/); assert.match(txt, /En 1899 : pont transbordeur de Rouen/); assert.match(txt, /tramway/i);
            assert.match(txt, /▸ plus/); assert.match(txt, /↗ source/);
            const html = await p.innerHTML('[data-th-person="1"]');
            assert.match(html, /target="_blank" rel="noopener noreferrer"/); assert.ok(!/href="(?!https?:)/.test(html), 'seulement des liens http(s)');
            assert.strictEqual(await p.evaluate(() => document.querySelector('[data-th-person="1"]').closest('section.card').hidden), false);
        });
        await t('Marie LACOMBE : 🥫 sardinière de Douarnenez ; Paul DURAND : 🏰 bastide de Monpazier (1284, Édouard Ier), 🛶 marinier près des maisons éclusières de Redon', async () => {
            const [n, , txt] = await into('personInto', 2);
            assert.ok(n >= 1, txt); assert.match(txt, /Elle était sardinière/); assert.match(txt, /Douarnenez/);
            const [, , paul] = await into('personInto', 3); assert.match(paul, /Monpazier est une bastide, fondée en 1284 par Édouard Ier/); assert.match(paul, /Il était marinier/); assert.match(paul, /maison éclusière/);
        });
        await t('Luc MAZAUD (vivant) et mode consultation : rien ne part sur Internet (aucune requête hors de l’ordinateur)', async () => {
            const k = await ctx.newPage(); k.on('pageerror', e => errs.push(e.message));
            await k.goto(base); await k.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.telechH, null, {timeout: 30000});
            await k.waitForLoadState('networkidle').catch(() => {}); await sleep(800);
            const n0 = outside.length;
            const run = (fn, a) => k.evaluate(async ([f, x]) => { const h = document.createElement('div'); document.body.appendChild(h); const n = await window.LCNDA_EXT.telechH[f](h, x, {detached: true}); h.remove(); return n; }, [fn, a]);
            await run('personInto', 4); await run('personInto', 1);
            const r = await k.evaluate(() => window.LCNDA_APP.api('kiosk_enter', {}, {method: 'POST', body: {password: 'essai-1234'}}).then(() => 'ok').catch(e => e.message));
            assert.ok((await run('personInto', 2)) >= 1, 'en mode consultation, la fiche se lit quand même (tout est sur l’ordinateur)');
            await run('placeInto', {id: 4, name: 'Monpazier', lat: 44.6806, lon: 0.8944, insee: '24280'});
            await k.evaluate(() => window.LCNDA_APP.api('kiosk_exit', {}, {method: 'POST', body: {password: 'essai-1234'}}).catch(() => {}));
            assert.deepStrictEqual(outside.slice(n0).filter(u => !/^https:\/\/[a-z]\.?tile\.|^https:\/\/tile\./.test(u)), [], `kiosque : ${r}`);
            assert.ok((await k.evaluate(() => window.LCNDA_EXT.dataSources.filter(d => /^th/.test(d.id)).every(d => d.online === false))), 'à la demande : rien en ligne');
            await k.close();
        });
        await t('village, monographie, listes, cartes, à la demande, Tout sur, Réglages → 🗂 Données (titres des packs)', async () => {
            const [n, , txt] = await into('placeInto', {id: 4, name: 'Monpazier', lat: 44.6806, lon: 0.8944, insee: '24280'});
            assert.ok(n >= 2, txt); assert.match(txt, /Monpazier est une bastide/); assert.match(txt, /halle/i); assert.match(txt, /généralité de Bordeaux/, 'généralité (Atlas d’Ancien Régime, réutilisé)');
            const [, , dz] = await into('placeInto', {id: 3, name: 'Douarnenez', lat: 48.0925, lon: -4.3303, insee: '29046'}); assert.match(dz, /Douarnenez/); assert.match(dz, /conserver/i);
            const reg = await p.evaluate(() => { const E = window.LCNDA_EXT; return {mono: E.monographSections.filter(s => /^th_/.test(s.id)).length, lists: E.dataLists.filter(s => /^th_/.test(s.id)).map(s => s.id), maps: E.mapLayerSources.filter(s => /^th_/.test(s.id)).length,
                ds: E.dataSources.filter(s => /^th/.test(s.id)).length, village: (E.villageSectionDefs || []).some(d => d.id === 'th_place'), block: (window.LCNDA_APP.defaultPersonBlocks || []).some(b => b[0] === 'telech_h'), tout: true}; });
            assert.deepStrictEqual(reg.lists, ['th_kiosques', 'th_marianne', 'th_halles', 'th_funiculaires', 'th_eclusieres', 'th_tramways', 'th_traces', 'th_bastides', 'th_trudaine', 'th_ateliers', 'th_textes']);
            assert.ok(reg.mono === 16 && reg.maps === 10 && reg.ds >= 20 && reg.village && reg.block, JSON.stringify(reg));
            const L = await p.evaluate(async () => { const d = window.LCNDA_EXT.dataLists.find(x => x.id === 'th_bastides'); const r = await d.load(); return [r.length, r[0].src]; });
            assert.ok(L[0] > 200); assert.match(L[1], /^https:\/\/fr\.wikipedia\.org\/wiki\//);
            const M = await p.evaluate(async () => (await window.LCNDA_EXT.mapLayerSources.find(x => x.id === 'th_funiculaires').run({bbox: [0.9, 49.3, 1.3, 49.6]})).features.map(f => f.label));
            assert.ok(M.some(x => /transbordeur de Rouen/.test(x)), JSON.stringify(M));
            const Tr = await p.evaluate(async () => (await window.LCNDA_EXT.mapLayerSources.find(x => x.id === 'th_traces').run({bbox: [-5, 41, 10, 51.5], max: 3})).features);
            assert.ok(Array.isArray(Tr), 'tracés : liste (vide tant qu’ils ne sont pas fabriqués sur GitHub), sans erreur');
            const mono = await p.evaluate(async () => { const s = window.LCNDA_EXT.monographSections.find(x => x.id === 'th_bastides'); const h = document.createElement('div'); const ok = await s.render({name: 'Monpazier', latitude: 44.6806, longitude: 0.8944, insee: '24280'}, h); return [ok, h.textContent]; });
            assert.ok(mono[0] && /1284/.test(mono[1]));
            const tout = await p.evaluate(() => (window.LCNDA_EXT.dataSources || []).filter(s => /^thp_/.test(s.id)).map(s => s.group)); assert.ok(tout.length === 4 && tout.every(g => g === 'La personne'));
        });
        await t('Réglages → 🧺 : chaque sujet s’éteint (genealogie-telech-h), ↶ Annuler le rallume ; À propos des données (licence, lignes, date) ; éteint → plus rien sur la fiche', async () => {
            await p.evaluate(() => window.LCNDA_EXT.telechH.openSettings());
            await p.waitForSelector('[data-th-settings-page] [data-th-tg="bastides"]', {timeout: 20000});
            const st = await p.textContent('[data-th-settings-page]');
            assert.match(st, /CC BY-SA 4\.0/); assert.match(st, /CC0/); assert.match(st, /À fabriquer sur GitHub/); assert.match(st, /rien ne part sur Internet/); assert.match(st, /Liens seulement/);
            await p.click('[data-th-tg="bastides"] input');
            assert.strictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-telech-h')).bastides), false);
            const [, , txt] = await into('personInto', 3); assert.ok(!/bastide/.test(txt), 'éteint : plus de bastide');
            await p.waitForSelector('.undo-toast button, [data-undo], .toast button', {timeout: 5000}).then(b => b.click()).catch(() => {});
            await sleep(300);
            assert.notStrictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-telech-h') || '{}').bastides), false, '↶ Annuler le rallume');
        });
        await t('390 px et thème sombre : le bloc tient dans l’écran (pas de débordement), lisible, rien collé aux bords', async () => {
            const m = await browser.newContext({viewport: {width: 390, height: 844}, colorScheme: 'dark'});
            await m.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => { outside.push(r.request().url()); return r.abort(); });
            const q = await m.newPage(); q.on('pageerror', e => errs.push(e.message));
            await q.goto(base); await q.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.telechH, null, {timeout: 30000});
            await q.waitForLoadState('networkidle').catch(() => {}); await sleep(1500);
            await q.evaluate(async () => { document.documentElement.dataset.theme = 'dark'; const ws = document.getElementById('workspace'); const h = document.createElement('div'); h.id = 'th-essai'; ws.prepend(h);
                const a = document.createElement('div'), b = document.createElement('div'); h.append(a, b);
                await window.LCNDA_EXT.telechH.placeInto(a, {id: 4, name: 'Monpazier', lat: 44.6806, lon: 0.8944, insee: '24280'}); await window.LCNDA_EXT.telechH.personInto(b, 1);
                h.querySelectorAll('details').forEach(d => { d.open = true; }); h.scrollIntoView(); window.__thEssai = h; });
            const r = await q.evaluate(() => { const h = window.__thEssai; if (!h.isConnected) document.getElementById('workspace').prepend(h); const over = [...h.querySelectorAll('*')].filter(e => e.getBoundingClientRect().right > window.innerWidth + 1).map(e => e.className || e.tagName).slice(0, 5);
                const row = h.querySelector('.th-row').getBoundingClientRect(); const cs = getComputedStyle(h.querySelector('.hist-t p')); return {over, left: row.left, right: window.innerWidth - row.right, color: cs.color, docW: document.documentElement.scrollWidth}; });
            assert.deepStrictEqual(r.over, []); assert.ok(r.left >= 8 && r.right >= 8, JSON.stringify(r)); assert.ok(r.docW <= 391, `largeur ${r.docW}`);
            assert.ok(!/rgb\(0, 0, 0\)/.test(r.color), `texte lisible en sombre : ${r.color}`);
            await m.close();
        });
        await t('aucune erreur JavaScript, aucun « Failed to fetch »', async () => { assert.deepStrictEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill();
        try { fs.rmSync(tmp, {recursive: true, force: true}); } catch (_) {}
    }
    console.log(fails ? `${fails} essai(s) raté(s).` : 'Places, métiers et rivages : tout va bien.');
    process.exit(fails ? 1 : 0);
})();
