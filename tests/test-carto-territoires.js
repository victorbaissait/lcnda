#!/usr/bin/env node
/* 🧩 Mes territoires et 🗺 données sur les cartes (lib/territoires.php, assets/js/heritage-territoires.js, assets/js/heritage-carto-donnees.js,
 * assets/css/carto-territoires.css, assets/data/communes-decoupage.json.gz ; crochets : heritage-vector.js menu Plan, api.php).
 *  1. données : découpage INSEE (arrondissements, cantons) ; tracés des communes déjà livrés ; tailles ;
 *  2. calcul (Node) : réunir des communes efface leurs limites communes (Corrèze = 1 contour, ≈ 5 860 km², Tulle dedans, Paris dehors) ;
 *  3. serveur : enregistrer, lister, modifier, supprimer, remettre (↶) un territoire ; mauvaise saisie refusée ; packs ;
 *  4. écran : créer un territoire (chercher Tulle, « toutes les communes du canton », cliquer la carte) ; contains() ;
 *     diagramme « carte colorée » avec deux couches (territoire + lieux) : dessin, légende, source, barre de l'éditeur ;
 *     dessin vectoriel : menu Plan → « Mes territoires sur le plan » → un groupe d'objets ; Carte : la case « 🧩 Mes territoires ».
 *   node tests/test-carto-territoires.js */
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
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const DATA = path.join(root, 'assets/data');
const gz = f => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(DATA, f))).toString('utf8'));
const C = require('../assets/js/heritage-territoires.js');
const SHOTS = process.env.CT_SHOTS || ''; // dossier : copies d'écran pour regarder
const shot = async (p, n) => { if (SHOTS) await p.screenshot({path: path.join(SHOTS, n + '.png')}); };

(async () => {
    let M;
    await t('données : découpage INSEE COG 2025 (arrondissements, cantons) et tracés des communes, tailles', async () => {
        const d = gz('communes-decoupage.json.gz');
        assert.match(d.licence, /Licence Ouverte/); assert.ok(Object.keys(d.c).length > 34000);
        assert.strictEqual(d.dep['19'], 'Corrèze'); assert.deepStrictEqual(d.c['19272'][0], '192'); assert.match(d.arr['192'], /Tulle/);
        assert.ok(Object.keys(d.can).length > 2000);
        const size = fs.statSync(path.join(DATA, 'communes-decoupage.json.gz')).size, geo = fs.statSync(path.join(DATA, 'geo/fr-communes.json.gz')).size;
        assert.ok(size < 300e3, `${size} octets`);
        console.log(`  (ajouté : ${(size / 1e3).toFixed(0)} Ko ; tracés déjà livrés : ${(geo / 1e6).toFixed(1)} Mo)`);
    });
    await t('calcul : réunir des communes efface leurs limites communes', async () => {
        M = C.model(gz('geo/fr-communes.json.gz'), gz('communes-decoupage.json.gz').succ);
        assert.ok(M.communes.length > 34000);
        const dep = C.dissolve(M, M.deps.get('19').map(z => z.code));
        assert.strictEqual(dep.length, 1, `${dep.length} contours`);
        const a = C.ringsArea(dep); assert.ok(a > 5500 && a < 6200, `${a} km²`);
        assert.ok(C.inRings(dep, 45.267, 1.768), 'Tulle dedans'); assert.ok(!C.inRings(dep, 48.85, 2.35), 'Paris dehors');
        // deux communes voisines : un seul contour, aussi grand que les deux ensemble
        const tulle = M.byCode.get('19272'), arcs = new Set(tulle.polys.flat(2).map(i => (i < 0 ? ~i : i)));
        const nb = M.deps.get('19').find(z => z !== tulle && z.polys.flat(2).some(i => arcs.has(i < 0 ? ~i : i)));
        const two = C.dissolve(M, [tulle.code, nb.code]), one = C.ringsArea(C.dissolve(M, [tulle.code])) + C.ringsArea(C.dissolve(M, [nb.code]));
        assert.strictEqual(two.length, 1); assert.ok(Math.abs(C.ringsArea(two) - one) < 0.5, `${C.ringsArea(two)} / ${one}`);
        // un ancien code (commune fusionnée) mène à la commune d'aujourd'hui
        const old = M.communes.find(z => z.olds.length); assert.strictEqual(M.byCode.get(old.olds[0]), old);
    });

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-ct-'));
    fs.mkdirSync(path.join(tmp, 'media'), {recursive: true});
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4', GENEALOGY_TEST: '1'};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start) VALUES(1,'Jean','MAZAUD','male','deceased',1)");
$pdo->exec("INSERT INTO places(id,name,county,country,latitude,longitude,admin4_code) VALUES(1,'Tulle','Corrèze','France',45.2670,1.7680,'19272'),(2,'Argentat','Corrèze','France',45.0928,1.9375,''),(3,'Lyon','Rhône','France',45.7578,4.8320,'')");
$t = (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='BIRT' LIMIT 1")->fetchColumn();
$pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,date_text,year,sort_date,place_id) VALUES('person',1,?,'1850',1850,'1850',1)")->execute([$t]);
echo json_encode(['ok' => 1]);`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0 || !/"ok"/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const errs = [];
    try {
        const p = await (await browser.newContext({viewport: {width: 1440, height: 900}})).newPage();
        p.on('pageerror', e => errs.push(e.message));
        p.on('dialog', d => d.accept());
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.diagramRender?.KINDS?.choropleth && window.LCNDA_EXT?.openVectorEditor, null, {timeout: 30000});
        // index.php ne charge pas encore ces fichiers : on les ajoute (comme le feront les balises)
        if (!(await p.evaluate(() => !!window.LCNDA_EXT?.territories?.open))) {
            await p.addStyleTag({url: base + 'assets/css/carto-territoires.css'});
            await p.addScriptTag({url: base + 'assets/js/heritage-territoires.js'}); await p.addScriptTag({url: base + 'assets/js/heritage-carto-donnees.js'});
        }
        await p.waitForFunction(() => !!window.LCNDA_EXT?.cartoDonnees && window.LCNDA_EXT.diagramRender.KINDS.choropleth._cd);
        const api = (x, q = {}) => p.evaluate(([y, z]) => window.LCNDA_APP.api(y, z).catch(e => ({error: e.message})), [x, q]);
        const post = (a, b) => p.evaluate(async ([x, y]) => { try { const r = await window.LCNDA_APP.api(x, {}, {method: 'POST', body: y}); return r.result || r; } catch (e) { return {error: e.message}; } }, [a, b]);

        await t('serveur : enregistrer, modifier, supprimer, remettre (↶) ; mauvaise saisie refusée ; packs', async () => {
            const sq = [[[1.7, 45.2], [1.8, 45.2], [1.8, 45.3], [1.7, 45.3]]];
            assert.match((await post('terr_save', {territory: {name: '', communes: ['19272'], rings: sq}})).error || '', /nom/);
            assert.match((await post('terr_save', {territory: {name: 'Vide', communes: [], rings: []}})).error || '', /commune/);
            const r = await post('terr_save', {territory: {name: 'Essai', communes: ['19272', 'xx'], rings: sq, style: {color: '#123456', hatch: 'diag', evil: '<script>'}}});
            assert.strictEqual(r.territory.name, 'Essai'); assert.deepStrictEqual(r.territory.communes, ['19272']); assert.strictEqual(r.territory.style.hatch, 'diag'); assert.ok(!('evil' in r.territory.style));
            assert.deepStrictEqual(r.territory.bbox, [1.7, 45.2, 1.8, 45.3]); assert.strictEqual(r.before, null);
            const id = r.territory.id;
            const r2 = await post('terr_save', {territory: {...r.territory, name: 'Essai 2'}}); assert.strictEqual(r2.before.name, 'Essai'); assert.strictEqual(r2.territory.id, id);
            await post('terr_restore', {territory: r2.before}); assert.strictEqual((await api('terr_get', {id})).territory.name, 'Essai', '↶ modification');
            const d = await post('terr_delete', {id}); assert.ok(d.ok); assert.strictEqual((await api('terr_get', {id})).territory, null);
            await post('terr_restore', {territory: d.before}); const back = (await api('terr_get', {id})).territory; assert.strictEqual(back.name, 'Essai'); assert.strictEqual(back.rings.length, 1, '↶ suppression');
            await post('terr_delete', {id});
            assert.deepStrictEqual((await api('carto_packs')).packs, []);
            assert.strictEqual((await api('carto_pack_rows', {kind: 'seismes'})).installed, false);
            const pl = (await api('terr_places')).places; assert.strictEqual(pl.length, 3); assert.strictEqual(pl[0].name, 'Tulle');
        });

        await t('écran : créer un territoire (chercher Tulle, tout un canton, clic sur la carte, ↶ dans l’éditeur), puis contains()', async () => {
            await p.evaluate(() => { window.__ct = window.LCNDA_EXT.territories.open(null); });
            await p.waitForSelector('.ct-editor [data-ct-wait][hidden]', {state: 'attached', timeout: 30000});
            await p.fill('.ct-editor [data-ct-name]', 'Pays de Tulle');
            await p.fill('.ct-editor [data-ct-q]', 'tulle'); await p.click('.ct-editor [data-ct-pick="19272"]');
            assert.match(await p.textContent('.ct-editor [data-ct-count]'), /1 commune/);
            await p.fill('.ct-editor [data-ct-g]', 'seilhac'); await p.click('.ct-editor [data-ct-gsugg] button');
            const n1 = Number((await p.textContent('.ct-editor [data-ct-count]')).match(/\d+/)[0]); assert.ok(n1 > 10, `${n1} communes`);
            await p.click('.ct-editor [data-ct-undo]'); assert.match(await p.textContent('.ct-editor [data-ct-count]'), /^1 commune/);
            await p.click('.ct-editor [data-ct-redo]');
            // un clic sur une commune visible qui n'est pas encore dedans
            const code = await p.evaluate(() => [...document.querySelectorAll('.ct-editor [data-ct-c]:not(.is-on)')].map(e => [e, e.getBoundingClientRect()]).filter(([, r]) => r.width > 8 && r.height > 8 && r.top > 120)[0][0].dataset.ctC);
            const box = await p.evaluate(c => { const r = document.querySelector(`.ct-editor [data-ct-c="${c}"]`).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, code);
            await p.mouse.click(box[0], box[1]);
            const n2 = Number((await p.textContent('.ct-editor [data-ct-count]')).match(/\d+/)[0]); assert.ok(n2 === n1 + 1 || n2 === n1 - 1, `${n1} → ${n2}`);
            assert.ok(await p.$('.ct-editor .ct-shape'));
            await shot(p, '1-editeur');
            await p.click('.ct-editor .ct-style summary'); await p.selectOption('.ct-editor [data-ct-st="hatch"]', 'cross');
            await p.click('.ct-editor [data-ct-save]');
            const tt = await p.evaluate(() => window.__ct);
            assert.strictEqual(tt.name, 'Pays de Tulle'); assert.strictEqual(tt.style.hatch, 'cross'); assert.ok(tt.rings.length >= 1);
            const inside = await p.evaluate(id => [window.LCNDA_EXT.territories.contains(45.267, 1.768, id), window.LCNDA_EXT.territories.contains(45.7578, 4.832, id), window.LCNDA_EXT.territories.contains(45.267, 1.768)], tt.id);
            assert.deepStrictEqual(inside, [true, false, [tt.id]]);
            assert.ok(await p.evaluate(() => /créé/.test(document.body.innerText)), 'toast ↶');
        });

        await t('diagramme : carte colorée + couches (territoire, lieux de la base) : dessin, légende, source ; barre de l’éditeur', async () => {
            const svg = await p.evaluate(async () => {
                const E = window.LCNDA_EXT, K = E.diagramRender.KINDS.choropleth, tid = E.territories.cached()[0].id;
                const spec = {kind: 'choropleth', rows: [{label: '19', value: 3}], o: {map: 'fr', level: 'dep'}, carto: {layers: [{id: 'a', src: 'terr', label: 'Pays de Tulle', f: {ids: [tid]}}, {id: 'b', src: 'places', label: 'Mes lieux', f: {}, st: {sym: 'star', color: '#1e8449', labels: true}}]}};
                const s = await K.resolve(spec); await new Promise(r => setTimeout(r, 300)); const s2 = await K.resolve(spec);
                return E.diagramRender.svg(s2, 900);
            });
            if (SHOTS) { fs.writeFileSync(path.join(SHOTS, 'carte.svg'), svg); fs.writeFileSync(path.join(SHOTS, 'carte0.svg'), await p.evaluate(async () => { const E = window.LCNDA_EXT, K = E.diagramRender.KINDS.choropleth; return E.diagramRender.svg(await K.resolve({kind: 'choropleth', rows: [{label: '19', value: 3}], o: {map: 'fr', level: 'dep'}}), 900); })); }
            assert.match(svg, /class="cd-layers"/); assert.match(svg, /Pays de Tulle/); assert.match(svg, /Mes lieux \(3\)/); assert.match(svg, /Données : /); assert.match(svg, /<pattern/);
            assert.match(svg, />Argentat</);
            await p.evaluate(() => { const tid = window.LCNDA_EXT.territories.cached()[0].id; window.LCNDA_EXT.openDiagramEditor(null, {spec: {kind: 'choropleth', rows: [{label: '19', value: 3}], o: {map: 'fr', level: 'dep'}, carto: {layers: [{id: 'a', src: 'terr', label: 'Pays de Tulle', f: {ids: [tid]}}]}}}); });
            await p.waitForSelector('.cd-bar .cd-chip', {timeout: 20000});
            await p.waitForFunction(() => document.querySelector('dialog[open] .cd-layers'), null, {timeout: 20000});
            // ＋ Données → les lieux de la base, étoiles vertes
            await p.click('.cd-bar [data-cd-add]'); await p.waitForSelector('.cd-dialog');
            const opts = await p.$$eval('.cd-dialog [data-cd-src] option', os => os.map(o => o.value)); assert.ok(opts.includes('places') && opts.includes('terr') && opts.includes('borders'), opts.join());
            // « Quelles données ? » : le choix commun (LCNDA_EXT.dataListSelect), replié ; « Changer », chercher, choisir
            await p.click('.cd-dialog [data-ldt-selchange]'); await p.fill('.cd-dialog [data-ldt-selpick] [data-ld-ov-q]', 'lieux de ta base'); await p.click('.cd-dialog [data-ld-pick="places"]');
            assert.strictEqual(await p.$eval('.cd-dialog [data-cd-src]', s => s.value), 'places'); assert.match(await p.textContent('.cd-dialog .ldt-selline'), /Les lieux de ta base — Changer/);
            await p.click('.cd-dialog [data-cd-try]');
            await p.waitForFunction(() => /3 éléments/.test(document.querySelector('.cd-dialog [data-cd-count]').textContent));
            await p.click('.cd-dialog button[type=submit]');
            await p.waitForFunction(() => document.querySelectorAll('.cd-bar .cd-chip').length === 2);
            await p.waitForFunction(() => /Les lieux de ta base \(3\)/.test(document.querySelector('dialog[open] .cd-layers')?.closest('svg')?.innerHTML || ''), null, {timeout: 10000});
            await shot(p, '2-diagramme');
            await p.click('.cd-bar [data-cd-rm="1"]'); await p.waitForFunction(() => document.querySelectorAll('.cd-bar .cd-chip').length === 1);
            await p.evaluate(() => [...document.querySelectorAll('.toast button')].filter(b => /Annuler/.test(b.textContent) && /retirée/.test(b.closest('.toast').textContent)).pop()?.click());
            await p.waitForFunction(() => document.querySelectorAll('.cd-bar .cd-chip').length === 2, null, {timeout: 5000});
            await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => { d.close(); d.remove(); }));
        });

        await t('dessin vectoriel : menu Plan → « Mes territoires sur le plan » → un groupe d’objets (contour, hachure, nom, légende, source)', async () => {
            await p.evaluate(() => { window.__vx = window.LCNDA_EXT.openVectorEditor({}); });
            await p.waitForSelector('dialog[open] [data-vx-cmd="cd_terr"]', {state: 'attached', timeout: 15000});
            assert.ok(await p.$('dialog[open] [data-vx-cmd="cd_data"]')); assert.ok(await p.$('dialog[open] [data-vx-cmd="cd_terr_new"]'));
            await p.evaluate(() => { const b = document.querySelector('dialog[open] [data-vx-cmd="cd_terr"]'); b.closest('details').open = true; b.click(); });
            await p.waitForSelector('.ct-manage [data-ct-use]'); await p.click('.ct-manage [data-ct-use]');
            await p.waitForFunction(async () => { const ed = await window.__vx; return ed.doc.objs.flatMap(o => o.children || [o]).some(o => /Pays de Tulle/.test(o.name || '')); }, null, {timeout: 10000});
            const g = await p.evaluate(async () => { const ed = await window.__vx; const all = []; const walk = l => l.forEach(o => { all.push(o); if (o.children) walk(o.children); }); walk(ed.doc.objs); return {grp: all.find(o => o.type === 'group' && /Pays de Tulle/.test(o.name)), geo: ed.doc.map?.geo, all: all.map(o => [o.type, o.name, o.text || '']).slice(0, 40)}; });
            await p.evaluate(() => document.querySelector('dialog[open] [data-vx-cmd="zfit"]')?.click()); await sleep(400); await shot(p, '3-dessin');
            const kids = g.grp.children; assert.ok(kids.some(o => o.type === 'svgpath' && o.evenodd && o.pat?.kind === 'grid'), 'contour hachuré');
            assert.ok(kids.some(o => o.type === 'text' && o.text === 'Pays de Tulle'), 'nom'); assert.ok(JSON.stringify(kids).includes('Données : '), 'source');
            assert.ok(g.geo && g.geo.e > g.geo.w, 'plan situé');
            await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => { d.close(); d.remove(); }));
        });

        await t('Carte : case « 🧩 Mes territoires » (crochets mapSetup / mapDraw), registres Listes', async () => {
            const r = await p.evaluate(() => ({setup: window.LCNDA_EXT.mapSetup.length, draw: window.LCNDA_EXT.mapDraw.length, dl: (window.LCNDA_EXT.dataLists || []).some(d => d.id === 'mes_territoires'), flt: (window.LCNDA_EXT.dataListFilters || []).some(f => f.id === 'territoire')}));
            assert.ok(r.setup && r.draw && r.dl && r.flt, JSON.stringify(r));
            const rows = await p.evaluate(async () => (window.LCNDA_EXT.dataLists.find(d => d.id === 'mes_territoires')).load());
            assert.strictEqual(rows[0].name, 'Pays de Tulle'); assert.ok(rows[0].km2 > 50);
            const txt = await p.evaluate(async () => { const h = document.createElement('div'); await window.LCNDA_EXT.dataSources.find(d => d.id === 'mes_territoires').run({place: {name: 'Tulle', latitude: 45.267, longitude: 1.768}}, h); return h.textContent; });
            assert.match(txt, /Tulle est dans : Pays de Tulle/);
        });
        assert.deepStrictEqual(errs, [], 'erreurs de page : ' + errs.join(' | '));
    } catch (e) { fails++; console.log('✗ ' + (e.stack || e)); }
    finally { await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true}); }
    console.log(fails ? `✗ ${fails} échec(s)` : '✓ tout passe');
    process.exit(fails ? 1 : 0);
})();
