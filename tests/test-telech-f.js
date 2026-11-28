#!/usr/bin/env node
/* 🌉 Le pays au XIXe siècle (lot F « téléchargements ») — assets/js/heritage-telech-f.js, scripts/telech-f/*, assets/data/tf-*.json.gz.
 *  1. Node : les fichiers livrés (licence, source, date, petits, dans le manifeste) et le calcul (ballon posé près d'Évreux en 1870,
 *     pont suspendu de sa vie, saunier près d'une saline, haricot de Soissons, prix de vertu, rosière, années de ciel voilé).
 *  2. Serveur et écran (php -S + Playwright, base temporaire) : rien ne part sur Internet (toute requête hors 127.0.0.1 est comptée et
 *     coupée), ni pour une fiche vivante ni en mode consultation ; fiche, village, listes, cartes, Réglages (interrupteur ↶), 390 px et
 *     thème sombre, aucune erreur JavaScript, aucun « Failed to fetch ».
 *  Fiches (noms inventés) : Jean MAZAUD (1800 Saint-Satur – 1880, vit à Évreux en 1860), Marie LACOMBE (1850 Soissons – 1920, Mehun-sur-Yèvre
 *  en 1890), Paul DURAND (1820 Arc-et-Senans – 1890, saunier, Port-Lesney en 1880), Luc MAZAUD (vivant, 1990 Évreux).
 *   node tests/test-telech-f.js */
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
const H = require('../assets/js/heritage-telech-f.js');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const raw = n => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root, 'assets/data', `${n}.json.gz`))).toString('utf8'));
const rows = n => H.table(raw(n));
const P = {satur: {id: 1, name: 'Saint-Satur', lat: 47.3406, lon: 2.8628}, evreux: {id: 2, name: 'Évreux', lat: 49.024, lon: 1.151}, soissons: {id: 3, name: 'Soissons', lat: 49.3758, lon: 3.3233},
    mehun: {id: 4, name: 'Mehun-sur-Yèvre', lat: 47.1453, lon: 2.2158}, arc: {id: 5, name: 'Arc-et-Senans', lat: 47.0328, lon: 5.7778}, lesney: {id: 6, name: 'Port-Lesney', lat: 47.0028, lon: 5.8239}};
const ev = (tag, year, p) => ({tag, year, place_id: p.id, lat: p.lat, lon: p.lon, place: p.name, country: 'France'});
const JEAN = {ok: true, person: {id: 1, gender: 'male', birth: 1800, death: 1880}, jobs: [], places: [P.satur, P.evreux], events: [ev('BIRT', 1800, P.satur), ev('RESI', 1860, P.evreux), ev('DEAT', 1880, P.evreux)]};
const MARIE = {ok: true, person: {id: 2, gender: 'female', birth: 1850, death: 1920}, jobs: [], places: [P.soissons, P.mehun], events: [ev('BIRT', 1850, P.soissons), ev('RESI', 1890, P.mehun)]};
const PAUL = {ok: true, person: {id: 3, gender: 'male', birth: 1820, death: 1890}, jobs: [{text: 'saunier', year: null}], places: [P.arc, P.lesney], events: [ev('BIRT', 1820, P.arc), ev('RESI', 1880, P.lesney)]};
const PACKS = ['tf-ballons', 'tf-ponts', 'tf-forges', 'tf-salines', 'tf-potager', 'tf-montyon', 'tf-rosieres', 'tf-silence', 'tf-volcans'];

(async () => {
    /* ═════════ 1. les fichiers et le calcul ═════════ */
    await t('fichiers livrés : présents, petits, avec source, adresse, licence et date ; dans le manifeste (script scripts/telech-f)', async () => {
        const man = JSON.parse(fs.readFileSync(path.join(root, 'assets/data/manifest.json'), 'utf8'));
        for (const n of PACKS) {
            const f = path.join(root, 'assets/data', `${n}.json.gz`); assert.ok(fs.existsSync(f), n); assert.ok(fs.statSync(f).size < 2e6, n);
            const m = raw(n); assert.ok(m.source && m.url && m.licence && m.licence_url && /^\d{4}-\d\d-\d\d$/.test(m.built), n); assert.ok(m.rows.length > 0, n);
            assert.ok(man.packs[n] && man.packs[n].rows === m.rows.length && man.packs[n].script === 'scripts/telech-f', `${n} dans le manifeste`);
            assert.ok(/^https:\/\//.test(m.url), `${n} : adresse https`);
        }
        assert.match(raw('tf-ballons').licence, /CC BY-SA 4\.0/); assert.match(raw('tf-ponts').licence, /CC0/); assert.match(raw('tf-potager').licence, /Domaine public/);
        assert.ok(rows('tf-ballons').length >= 60 && rows('tf-ballons').filter(r => r.lat !== null).length >= 50, 'les ballons et leur arrivée');
        assert.ok(rows('tf-ballons').every(r => !/Duruof|Tissandier|Spuller|Trichet/.test(JSON.stringify(r))), 'pas les noms des pilotes et passagers');
        assert.ok(rows('tf-rosieres').every(r => !/Virassamy/.test(r.quote)), 'pas le nom d’une rosière vivante');
        const S = rows('tf-silence'); assert.ok(S.length >= 5 && S.every(r => /^https:\/\/fr\.wikipedia\.org\/wiki\//.test(r.url) && r.q.length > 20));
    });
    await t('🎈 🌉 calcul : Jean (Évreux en 1860) → le ballon « Le Neptune » posé près d’Évreux ; le pont de Saint-Thibault (1834) pendant sa vie', async () => {
        const B = H.balloonsFor(rows('tf-ballons'), JEAN); assert.ok(B.length && /Neptune/.test(B[0].r.n), JSON.stringify(B.slice(0, 2).map(x => x.r.n)));
        assert.deepStrictEqual(H.balloonsFor(rows('tf-ballons'), {...JEAN, person: {birth: 1880, death: 1950}}), [], 'né après le siège : rien');
        const P2 = H.bridgesFor(rows('tf-ponts'), JEAN); assert.ok(P2.some(x => x.r.from >= 1800 && x.r.from <= 1880 && /Thibault/.test(x.r.n)), JSON.stringify(P2.map(x => x.r.n)));
        assert.ok(P2.every(x => x.r.from >= 1800 && x.r.from <= 1880), 'seulement pendant sa vie');
    });
    await t('🧂 🏅 🥕 🌹 calcul : Paul, saunier → la saline royale ; Jupille (prix de vertu 1886) à Port-Lesney ; Marie → haricot de Soissons ; rosière de Mehun-sur-Yèvre', async () => {
        const S = H.worksFor(rows('tf-salines'), PAUL, 'salines'); assert.strictEqual(S.job, true); assert.ok(S.list.some(x => /Arc-et-Senans|Salins/.test(x.r.n)), JSON.stringify(S.list.map(x => x.r.n)));
        assert.strictEqual(H.worksFor(rows('tf-salines'), JEAN, 'salines').list.length, 0);
        const M = H.montyonFor(rows('tf-montyon'), PAUL); assert.ok(M.length && /Jupille/.test(M[0].r.n) && M[0].r.y === 1886);
        const V = H.veggiesFor(rows('tf-potager'), MARIE); assert.ok(V.some(x => /Soissons/.test(x.r.v)), JSON.stringify(V.slice(0, 3).map(x => x.r.v)));
        assert.deepStrictEqual(H.veggiesFor(rows('tf-potager'), {...MARIE, person: {birth: 1900, death: 1980}}), [], 'pas en vie en 1883 : rien');
        const R = H.rosieresFor(rows('tf-rosieres'), MARIE); assert.ok(R.length && /Mehun/.test(R[0].r.wp) && R[0].r.since === 1882);
        assert.ok(H.FORGE_JOB.test(H.fold('Maréchal-ferrant')) && H.SALT_JOB.test(H.fold('paludière')) && !H.FORGE_JOB.test('laboureur'));
    });
    await t('🌋 calcul : Jean (1800-1880) → 1809, 1815 (Tambora), 1832, 1835 (Cosigüina)… ; le récit déjà raconté (lot 8, lot 10) est marqué, pas recopié', async () => {
        const Y = H.veiledYears(rows('tf-volcans'), JEAN).map(r => r.y).sort();
        for (const y of [1809, 1815, 1835]) assert.ok(Y.includes(y), `${y} dans ${Y}`);
        assert.ok(Y.every(y => y >= 1805 && y <= 1880));
        const tam = rows('tf-volcans').find(r => r.y === 1815); assert.strictEqual(tam.known, 'tambora'); assert.ok(tam.aod > 0.2);
        const m = raw('tf-volcans'); assert.strictEqual(H.aodSpan(m, 1800, 1810).length, 11);
        assert.strictEqual(H.safeUrl('javascript:alert(1)'), ''); assert.strictEqual(H.safeUrl('https://a.b/c'), 'https://a.b/c'); assert.strictEqual(H.safeUrl('https://a.b/"onx'), '');
    });

    /* ═════════ 2. serveur et écran ═════════ */
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-tf-'));
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4', GENEALOGY_TEST: '1'};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start,occupation) VALUES(1,'Jean','MAZAUD','male','deceased',1,'forgeron'),(2,'Marie','LACOMBE','female','deceased',0,''),(3,'Paul','DURAND','male','deceased',0,'saunier'),(4,'Luc','MAZAUD','male','living',0,'')");
$pdo->exec("INSERT INTO places(id,name,county,country,latitude,longitude,admin4_code) VALUES(1,'Saint-Satur','Cher','France',47.3406,2.8628,'18233'),(2,'Évreux','Eure','France',49.024,1.151,'27229'),(3,'Soissons','Aisne','France',49.3758,3.3233,'02722'),(4,'Mehun-sur-Yèvre','Cher','France',47.1453,2.2158,'18141'),(5,'Arc-et-Senans','Doubs','France',47.0328,5.7778,'25020'),(6,'Port-Lesney','Jura','France',47.0028,5.8239,'39439')");
$t = function ($tag) use ($pdo) { $i = (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn(); return $i ?: (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='BIRT' LIMIT 1")->fetchColumn(); };
$ins = $pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,date_text,year,sort_date,place_id) VALUES('person',?,?,?,?,?,?)");
foreach ([[1,'BIRT',1800,1],[1,'RESI',1860,2],[1,'DEAT',1880,2],[2,'BIRT',1850,3],[2,'RESI',1890,4],[2,'DEAT',1920,4],[3,'BIRT',1820,5],[3,'RESI',1880,6],[3,'DEAT',1890,6],[4,'BIRT',1990,2]] as [$p,$g,$y,$pl]) { $ins->execute([$p,$t($g),(string)$y,$y,(string)$y,$pl]); }
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
        p.on('console', m => { if (m.type() === 'error' && /Failed to fetch|tf-|telech-f/i.test(m.text())) errs.push(m.text()); });
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_APP?.defaultPersonBlocks, null, {timeout: 30000});
        if (!(await p.evaluate(() => !!window.LCNDA_EXT?.telechF))) { await p.addStyleTag({url: base + 'assets/css/telech-f.css'}); await p.addScriptTag({url: base + 'assets/js/heritage-telech-f.js'}); }
        await p.waitForFunction(() => !!window.LCNDA_EXT?.telechF);
        const ext0 = outside.length;
        const into = (fn, arg, opts = {}) => p.evaluate(async ([f, a, o]) => { const h = document.createElement('div'); document.body.appendChild(h); const n = await window.LCNDA_EXT.telechF[f](h, a, {detached: true, ...o}); const r = [n, h.innerHTML, h.textContent]; h.remove(); return r; }, [fn, arg, opts]);

        await t('fiche de Jean MAZAUD : 🎈 le ballon de 1870, 🌉 le pont de sa vie, 🌋 les années de ciel voilé ; ↗ source ; ▸ plus ; liens sûrs', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.currentPersonId = 1; A.setModule('personnes'); });
            await p.waitForSelector('[data-tf-person="1"] .tf-row', {timeout: 30000});
            await sleep(500);
            const txt = await p.textContent('[data-tf-person="1"]');
            assert.match(txt, /siège de Paris.*« Le Neptune »/); assert.match(txt, /pont suspendu|on construit/); assert.match(txt, /ciel de sa vie a été voilé/);
            assert.match(txt, /▸ plus/); assert.match(txt, /↗ source/);
            const html = await p.innerHTML('[data-tf-person="1"]');
            assert.match(html, /target="_blank" rel="noopener noreferrer"/); assert.ok(!/href="(?!https?:)/.test(html), 'seulement des liens http(s)');
            assert.strictEqual(await p.evaluate(() => document.querySelector('[data-tf-person="1"]').closest('section.card').hidden), false);
        });
        await t('Marie LACOMBE : 🥕 haricot de Soissons, 🌹 rosière de Mehun-sur-Yèvre (depuis 1882), 🔔 les sons de sa jeunesse ; Paul DURAND : 🧂 saline, 🏅 prix de vertu', async () => {
            const [n, , txt] = await into('personInto', 2);
            assert.ok(n >= 3, txt); assert.match(txt, /Haricot de Soissons/); assert.match(txt, /Mehun-sur-Yèvre, on couronne une rosière \(depuis 1882\)/); assert.match(txt, /on entendait/);
            const [, , paul] = await into('personInto', 3); assert.match(paul, /Son métier touchait au sel/); assert.match(paul, /Jupille/);
        });
        await t('Luc MAZAUD (vivant) et mode consultation : rien ne part sur Internet (aucune requête hors de l’ordinateur)', async () => {
            // une page neuve, sans fiche ouverte (les autres modules de la fiche chargent leurs images) : seul ce module travaille
            const k = await ctx.newPage(); k.on('pageerror', e => errs.push(e.message));
            // ce que CETTE page demande hors de l'ordinateur (l'autre page, hors consultation, peut encore finir de charger la fiche de Jean)
            const kOut = []; k.on('request', r => { if (/^https?:\/\/(?!127\.0\.0\.1)/.test(r.url())) kOut.push(r.url()); });
            await k.goto(base); await k.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.telechF, null, {timeout: 30000});
            // la page rouvre la dernière fiche (Jean, ouverte plus haut) : on revient à l'accueil, sans fiche (les autres modules de la fiche
            // chargent leurs images en temps normal, et ce n'est pas ce qu'on mesure ici)
            await k.evaluate(() => window.LCNDA_APP.setModule('dashboard'));
            await k.waitForLoadState('networkidle').catch(() => {}); await sleep(800);
            const n0 = outside.length;
            const run = (fn, a) => k.evaluate(async ([f, x]) => { const h = document.createElement('div'); document.body.appendChild(h); const n = await window.LCNDA_EXT.telechF[f](h, x, {detached: true}); h.remove(); return n; }, [fn, a]);
            await run('personInto', 4); await run('personInto', 1);
            assert.deepStrictEqual(outside.slice(n0).filter(u => !/^https:\/\/[a-z]\.?tile\.|^https:\/\/tile\./.test(u)), [], 'fiche vivante : rien en ligne');
            const r = await k.evaluate(() => window.LCNDA_APP.api('kiosk_enter', {}, {method: 'POST', body: {password: 'essai-1234'}}).then(() => 'ok').catch(e => e.message));
            // comme le bouton 🔒 : la page se recharge en consultation (body.is-kiosk posée dès la page) ; la fiche de Jean ouverte en entier
            // (ses autres blocs aussi : la pièce dans sa poche n'y demande plus sa vignette à commons.wikimedia.org)
            await k.reload(); await k.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.telechF, null, {timeout: 30000});
            assert.ok(await k.evaluate(() => document.body.classList.contains('is-kiosk')), 'consultation : posée dès la page');
            const n1 = kOut.length;
            await k.evaluate(() => { const A = window.LCNDA_APP; A.state.currentPersonId = 1; A.setModule('personnes'); });
            await k.waitForSelector('[data-tf-person="1"] .tf-row', {timeout: 30000}).catch(() => {});
            await k.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await k.waitForLoadState('networkidle').catch(() => {}); await sleep(800);
            assert.ok((await run('personInto', 2)) >= 1, 'en mode consultation, la fiche se lit quand même (tout est sur l’ordinateur)');
            await run('placeInto', {id: 3, name: 'Soissons', lat: 49.3758, lon: 3.3233, insee: '02722'});
            const leak = kOut.slice(n1).filter(u => !/^https:\/\/[a-z]\.?tile\.|^https:\/\/tile\./.test(u));
            await k.evaluate(() => window.LCNDA_APP.api('kiosk_exit', {}, {method: 'POST', body: {password: 'essai-1234'}}).catch(() => {}));
            assert.deepStrictEqual(leak, [], `kiosque : ${r}`); // les tuiles de la carte de l'accueil (autre module) ne comptent pas
            assert.ok((await k.evaluate(() => window.LCNDA_EXT.dataSources.filter(d => /^tf/.test(d.id)).every(d => d.online === false))), 'à la demande : rien en ligne');
            await k.close();
        });
        await t('village, monographie, listes, cartes, à la demande, Tout sur, Réglages → 🗂 Données (titres des packs)', async () => {
            const [n, html, txt] = await into('placeInto', {id: 2, name: 'Évreux', lat: 49.024, lon: 1.151, insee: '27229'});
            assert.ok(n >= 2, txt); assert.match(txt, /ballon « Le Neptune » s’est posé/); assert.match(txt, /on entendait/); assert.match(html, /data\.gouv\.fr/);
            const reg = await p.evaluate(() => { const E = window.LCNDA_EXT; return {mono: E.monographSections.filter(s => /^tf_/.test(s.id)).length, lists: E.dataLists.filter(s => /^tf_/.test(s.id)).map(s => s.id), maps: E.mapLayerSources.filter(s => /^tf_/.test(s.id)).length,
                ds: E.dataSources.filter(s => /^tf/.test(s.id)).length, village: (E.villageSectionDefs || []).some(d => d.id === 'tf_place'), block: (window.LCNDA_APP.defaultPersonBlocks || []).some(b => b[0] === 'telech_f')}; });
            assert.deepStrictEqual(reg.lists, ['tf_ballons', 'tf_ponts', 'tf_forges', 'tf_salines', 'tf_cocher', 'tf_potager', 'tf_montyon', 'tf_rosieres', 'tf_volcans']);
            assert.ok(reg.mono === 9 && reg.maps === 7 && reg.ds >= 16 && reg.village && reg.block, JSON.stringify(reg));
            const L = await p.evaluate(async () => { const d = window.LCNDA_EXT.dataLists.find(x => x.id === 'tf_potager'); const r = await d.load(); return [r.length, r[0].src]; });
            assert.ok(L[0] > 300); assert.match(L[1], /^https:\/\/fr\.wikisource\.org\/wiki\/Page:/);
            const C = await p.evaluate(async () => window.LCNDA_EXT.dataLists.find(x => x.id === 'tf_cocher').load());
            // les plaques de cocher sont fabriquées sur GitHub (OpenStreetMap, ODbL) : toutes les lignes du pack, chacune placée et dite « OpenStreetMap »
            assert.strictEqual(C.length, raw('tf-osm-cocher').rows.length, 'plaques de cocher : toutes les lignes du pack');
            assert.ok(C.length > 0 && C.every(r => r.base === 'OpenStreetMap' && Number.isFinite(r.lat) && Number.isFinite(r.lon)), JSON.stringify(C.slice(0, 2)));
            const M = await p.evaluate(async () => (await window.LCNDA_EXT.mapLayerSources.find(x => x.id === 'tf_ballons').run({bbox: [0.9, 48.8, 1.4, 49.2]})).features.map(f => f.label));
            assert.ok(M.some(x => /Neptune/.test(x)));
            const Y = await p.evaluate(async () => { const S = window.LCNDA_EXT.dataSources.find(s => s.id === 'tfy_volcans'); const h = document.createElement('div'); await S.run({year: 1816}, h); return h.textContent; });
            assert.match(Y, /Tambora/);
            const mono = await p.evaluate(async () => { const s = window.LCNDA_EXT.monographSections.find(x => x.id === 'tf_rosieres'); const h = document.createElement('div'); const ok = await s.render({name: 'Mehun-sur-Yèvre', latitude: 47.1453, longitude: 2.2158, insee: '18141'}, h); return [ok, h.textContent]; });
            assert.ok(mono[0] && /depuis 1882/.test(mono[1]));
        });
        await t('Réglages → 🌉 : chaque sujet s’éteint (genealogie-telech-f), ↶ Annuler le rallume ; À propos des données (licence, lignes, date) ; éteint → plus rien sur la fiche', async () => {
            await p.evaluate(() => window.LCNDA_EXT.telechF.openSettings());
            await p.waitForSelector('[data-tf-settings-page] [data-tf-tg="ballons"]', {timeout: 20000});
            const st = await p.textContent('[data-tf-settings-page]');
            assert.match(st, /CC BY-SA 4\.0/); assert.match(st, /CC0/); assert.match(st, /NOAA/); assert.match(st, /Plaques de cocher \(OpenStreetMap\).*ODbL 1\.0 — © les contributeurs d’OpenStreetMap/); assert.match(st, /rien ne part sur Internet/); // OpenStreetMap fabriqué sur GitHub (avant : « À fabriquer sur GitHub »)
            await p.click('[data-tf-tg="ballons"] input');
            assert.strictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-telech-f')).ballons), false);
            const [, , txt] = await into('personInto', 1); assert.ok(!/Neptune/.test(txt), 'éteint : plus de ballon');
            await p.waitForSelector('.undo-toast button, [data-undo], .toast button', {timeout: 5000}).then(b => b.click()).catch(() => {});
            await sleep(300);
            assert.notStrictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-telech-f') || '{}').ballons), false, '↶ Annuler le rallume');
        });
        await t('390 px et thème sombre : le bloc tient dans l’écran (pas de débordement), lisible, rien collé aux bords', async () => {
            const m = await browser.newContext({viewport: {width: 390, height: 844}, colorScheme: 'dark'});
            await m.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => { outside.push(r.request().url()); return r.abort(); });
            const q = await m.newPage(); q.on('pageerror', e => errs.push(e.message));
            await q.goto(base); await q.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.telechF, null, {timeout: 30000});
            // le village d'Évreux et la fiche de Jean, posés dans l'espace de travail (la mise en page de l'app : marges, colonne)
            await q.waitForLoadState('networkidle').catch(() => {}); await sleep(1500);
            await q.evaluate(async () => { document.documentElement.dataset.theme = 'dark'; const ws = document.getElementById('workspace'); const h = document.createElement('div'); h.id = 'tf-essai'; ws.prepend(h);
                const a = document.createElement('div'), b = document.createElement('div'); h.append(a, b);
                await window.LCNDA_EXT.telechF.placeInto(a, {id: 2, name: 'Évreux', lat: 49.024, lon: 1.151, insee: '27229'}); await window.LCNDA_EXT.telechF.personInto(b, 1);
                h.querySelectorAll('details').forEach(d => { d.open = true; }); h.scrollIntoView(); window.__tfEssai = h; });
            const r = await q.evaluate(() => { const h = window.__tfEssai; if (!h.isConnected) document.getElementById('workspace').prepend(h); const b = h.getBoundingClientRect(); const over = [...h.querySelectorAll('*')].filter(e => e.getBoundingClientRect().right > window.innerWidth + 1).map(e => e.className || e.tagName).slice(0, 5);
                const row = h.querySelector('.tf-row').getBoundingClientRect(); const cs = getComputedStyle(h.querySelector('.hist-t p')); return {over, left: row.left, right: window.innerWidth - row.right, color: cs.color, docW: document.documentElement.scrollWidth}; });
            assert.deepStrictEqual(r.over, []); assert.ok(r.left >= 8 && r.right >= 8, JSON.stringify(r)); assert.ok(r.docW <= 391, `largeur ${r.docW}`);
            assert.ok(!/rgb\(0, 0, 0\)/.test(r.color), `texte lisible en sombre : ${r.color}`);
            await m.close();
        });
        await t('aucune erreur JavaScript, aucun « Failed to fetch »', async () => { assert.deepStrictEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill();
        try { fs.rmSync(tmp, {recursive: true, force: true}); } catch (_) {}
    }
    console.log(fails ? `${fails} essai(s) raté(s).` : 'Le pays au XIXe siècle : tout va bien.');
    process.exit(fails ? 1 : 0);
})();
