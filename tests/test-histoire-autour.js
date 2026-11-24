#!/usr/bin/env node
/* 🧭 Histoire autour (lib/histoire_autour.php, assets/js/heritage-histoire-autour.js, assets/css/histoire-autour.css,
 * assets/data/ha-*.json.gz fabriqués par scripts/histoire-autour/build.py). Les données livrées sont les VRAIES.
 *  1. données : présentes, tailles mesurées (< 15 Mo en tout), colonnes, source et licence dans chaque fichier ;
 *  2. calcul (Node) : Pierre MAZAUD né à Gorze en 1862 → bataille de Mars-la-Tour, 16 août 1870, à ≈ 11 km, il a 8 ans ;
 *     Saintes est sur une voie romaine ; « mort à l'Hôtel-Dieu » retrouve l'hôtel-Dieu de sa ville ; Marie LACOMBE à Saint-Pierre
 *     (Martinique) en 1902 → la montagne Pelée ; rien pour Tulle (métropole) ; un matelot « embarqué sur … » → son navire ;
 *     un gardien de phare → le phare tout près ; la lumière d'un phare arrive jusqu'à la côte voisine ;
 *  3. serveur : ha_life (lieux, métiers, notes de la fiche et des actes) ;
 *  4. écran : bloc « 🧭 Histoire autour » de la fiche (caché quand il n'y a rien), fiche d'un village, monographie (registre),
 *     Listes (registre dataLists), dataSources, Réglages (éteindre un sujet, ↶).
 *   node tests/test-histoire-autour.js */
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
const H = require('../assets/js/heritage-histoire-autour.js');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const DATA = path.join(root, 'assets/data');
const FILES = {batailles: 'ha-batailles', voies: 'ha-voies-romaines', compostelle: 'ha-compostelle', institutions: 'ha-institutions', catastrophes: 'ha-catastrophes', navires: 'ha-navires', phares: 'ha-phares'};
const has = k => fs.existsSync(path.join(DATA, FILES[k] + '.json.gz'));
const raw = k => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(DATA, FILES[k] + '.json.gz'))).toString('utf8'));
const D = {}; const rows = k => (D[k] ||= H.PREP[k](raw(k)));
const GORZE = {lat: 49.0517, lon: 6.0003}, SAINTES = {lat: 45.7464, lon: -0.6333}, TULLE = {lat: 45.2670, lon: 1.7680}, STPIERRE = {lat: 14.7433, lon: -61.1756};
const life = (p, places, events = [], jobs = [], text = '') => ({ok: true, person: {first: 'Pierre', gender: 'male', ...p}, places, events, jobs, text});

(async () => {
    await t('données : tailles mesurées (< 15 Mo en tout), colonnes, source et licence', async () => {
        let size = 0;
        for (const k of Object.keys(FILES)) {
            if (!has(k)) { assert.strictEqual(k, 'compostelle', `${k} manque`); console.log('  (chemins de Compostelle : pas livrés, OpenStreetMap injoignable à la fabrication)'); continue; }
            const s = fs.statSync(path.join(DATA, FILES[k] + '.json.gz')).size; size += s;
            const f = raw(k);
            assert.ok(f.source && f.licence && f.url && f.built, k); assert.ok(Array.isArray(f.fields) && f.rows.length > 10, k);
            f.rows.slice(0, 50).forEach(r => assert.strictEqual(r.length, f.fields.length, k));
            console.log(`  ${k} : ${f.rows.length} lignes, ${(s / 1e6).toFixed(2)} Mo — ${f.licence}`);
        }
        assert.ok(size < 15e6, `${size} octets`);
        console.log(`  (taille dans l’app : ${(size / 1e6).toFixed(1)} Mo)`);
        assert.strictEqual(raw('batailles').licence, 'CC0 1.0'); assert.match(raw('voies').licence, /CC BY 4\.0/); assert.match(raw('catastrophes').licence, /Domaine public/);
        if (has('compostelle')) assert.match(raw('compostelle').mention, /OpenStreetMap contributors/);
    });

    await t('⚔️ Pierre MAZAUD, né à Gorze en 1862 : bataille de Mars-la-Tour le 16 août 1870, à ≈ 11 km, à 8 ans', async () => {
        const L = life({birth: 1862, death: 1930}, [{name: 'Gorze', ...GORZE}]);
        const got = H.battlesForLife(rows('batailles'), L, 30);
        const m = got.find(x => /Mars-la-Tour/.test(x.b.n));
        assert.ok(m, got.map(x => x.b.n).join(', '));
        assert.strictEqual(m.b.d, '1870-08-16'); assert.strictEqual(m.age, 8); assert.ok(m.km > 8 && m.km < 14, String(m.km));
        assert.ok(got.every(x => x.b.y >= 1862 && x.b.y <= 1930 && x.km <= 30));
        assert.ok(!H.battlesForLife(rows('batailles'), life({birth: 1900, death: 1910}, [{name: 'Gorze', ...GORZE}])).some(x => x.b.y < 1900), 'pas avant sa naissance');
        assert.deepStrictEqual(H.battlesForLife(rows('batailles'), life({birth: 1862, death: 1930}, [])), [], 'sans lieu placé : rien');
    });

    await t('🛣️ Saintes (Mediolanum Santonum) est sur une voie romaine ; un point en mer, non', async () => {
        const near = H.linesNear(rows('voies'), SAINTES.lat, SAINTES.lon, 2);
        assert.ok(near.length && near[0].km < 1.5, JSON.stringify(near.slice(0, 2).map(x => [x.row.name, x.km])));
        assert.ok(near.some(x => /Mediolanum Santonum/.test(x.row.name)));
        assert.deepStrictEqual(H.linesNear(rows('voies'), 46.0, -3.0, 2), []);
    });

    await t('🏥 « mort à l’Hôtel-Dieu » : l’hôtel-Dieu de sa ville ; enfant trouvé : les hospices près de sa naissance', async () => {
        const I = rows('institutions');
        const hd = I.find(i => i.country === 'France' && i.from !== null && (i.to === null || i.to > i.from + 1) && /^h[ôo]tel-dieu/i.test(i.n) && i.kinds.some(k => ['hoteldieu', 'hopital', 'hospice'].includes(k)));
        assert.ok(hd, 'un hôtel-Dieu daté en France');
        const y = hd.from + 1, wanted = hd;
        const L = life({birth: y - 60, death: y}, [{name: 'X', lat: hd.lat + 0.004, lon: hd.lon}], [{tag: 'DEAT', year: y, lat: hd.lat + 0.004, lon: hd.lon, place: 'X', address: 'Hôtel-Dieu'}]);
        const r = H.institutionsForLife(I, L);
        assert.ok(r.acts.length, 'trouvé'); assert.strictEqual(r.acts[0].i.q, wanted.q, `${r.acts[0].i.n} au lieu de ${wanted.n}`); assert.strictEqual(r.acts[0].named, true); assert.ok(r.acts[0].i.kinds.some(k => ['hoteldieu', 'hopital', 'hospice'].includes(k))); assert.ok(r.acts[0].km < 15);
        assert.deepStrictEqual(H.institutionsForLife(I, life({birth: 1800, death: 1850}, [], [{tag: 'DEAT', year: 1850, lat: hd.lat, lon: hd.lon, address: 'rue Neuve'}])).acts, [], 'une adresse ordinaire : rien');
        const F = H.institutionsForLife(I, life({birth: y, death: y + 50}, [], [{tag: 'BIRT', year: y, lat: hd.lat, lon: hd.lon, place: 'X'}], [], 'enfant trouvé, né de père et mère inconnus'));
        assert.ok(F.foundling && F.foundling.list.length, 'les hospices pour un enfant trouvé');
    });

    await t('🌋 Marie LACOMBE à Saint-Pierre (Martinique), 1880–1902 : la montagne Pelée ; rien à Tulle', async () => {
        const C = rows('catastrophes');
        const L = life({first: 'Marie', gender: 'female', birth: 1880, death: 1902}, [{name: 'Saint-Pierre', country: 'Martinique', ...STPIERRE}]);
        const got = H.disastersForLife(C, L);
        const p = got.find(x => x.ev.k === 'vo' && /pel/i.test(x.ev.volcano) && x.ev.y === 1902 && x.ev.m === 5 && x.ev.d === 8);
        assert.ok(p, got.map(x => `${x.ev.y} ${x.ev.k} ${x.ev.volcano}`).join(', ')); assert.ok(p.ev.deaths > 20000);
        assert.strictEqual(H.farPlace({country: 'France', ...TULLE}), false); assert.strictEqual(H.farPlace({country: '', ...STPIERRE}), true);
        assert.deepStrictEqual(H.disastersForLife(C, life({birth: 1880, death: 1960}, [{name: 'Tulle', country: 'France', ...TULLE}])), []);
    });

    await t('⚓ un matelot « embarqué sur … » : son navire (dates qui vont avec sa vie) ; un boulanger : rien', async () => {
        const S = rows('navires');
        assert.strictEqual(H.shipKey('La Méduse (1810)'), 'meduse'); assert.strictEqual(H.shipKey('HMS Victory'), 'victory');
        assert.ok(H.shipCandidates('Embarqué sur la frégate « La Belle Poule » en 1840').includes('belle poule'));
        const s = S.find(x => /france/i.test(H.fold(x.flag)) && x.from > 1820 && x.from < 1900 && x.key.length >= 6 && S.filter(y => y.key === x.key).length === 1);
        assert.ok(s, 'un navire français du XIXe siècle');
        const L = life({birth: s.from - 20, death: s.from + 40}, [], [], [{text: 'matelot'}], `Inscrit maritime. Embarqué à bord du ${s.n} comme matelot.`);
        assert.ok(H.isSailor(L));
        const got = H.shipsForLife(S, L);
        assert.ok(got.some(x => x.q === s.q), `${s.n} → ${got.map(x => x.n)}`);
        assert.deepStrictEqual(H.shipsForLife(S, {...L, jobs: [{text: 'boulanger'}], text: `à bord du ${s.n}`}), []);
    });

    await t('🗼 un gardien de phare : le phare tout près, sa portée en milles et en km ; la lumière arrive jusqu’à la côte', async () => {
        const P = rows('phares');
        const l = P.find(x => x.rangeKm && x.rangeKm > 20 && x.country === 'France');
        assert.ok(l, 'un phare français avec sa portée');
        assert.ok(Math.abs(l.rangeKm - l.range * 1.852) < 0.1);
        const L = life({birth: 1850, death: 1910}, [{name: 'Y', lat: l.lat + 0.01, lon: l.lon}], [], [{text: 'gardien de phare'}]);
        const got = H.lighthousesForLife(P, L);
        assert.ok(got.length && got[0].km < 3, JSON.stringify(got.slice(0, 1)));
        assert.deepStrictEqual(H.lighthousesForLife(P, {...L, jobs: [{text: 'cultivateur'}]}), []);
        assert.ok(H.lighthousesReaching(P, l.lat + 0.05, l.lon).some(x => x.l.q === l.q), 'à 5 km, on voit sa lumière');
        console.log(`  (phares avec portée : ${P.filter(x => x.rangeKm).length} sur ${P.length})`);
    });

    /* ─────────── serveur et écran ─────────── */
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-ha-'));
    fs.mkdirSync(path.join(tmp, 'media'));
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4'};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start,occupation) VALUES(1,'Pierre','MAZAUD','male','deceased',1,'cultivateur'),(2,'Marie','LACOMBE','female','deceased',0,''),(3,'Jean','DURAND','male','deceased',0,'boulanger')");
$pdo->exec("INSERT INTO places(id,name,county,country,latitude,longitude,admin4_code) VALUES(1,'Gorze','Moselle','France',49.0517,6.0003,'57254'),(2,'Saint-Pierre','Martinique','France',14.7433,-61.1756,'97225'),(3,'Saintes','Charente-Maritime','France',45.7464,-0.6333,'17415'),(4,'Tulle','Corrèze','France',45.2670,1.7680,'19272')");
$t = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn();
$ins = $pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,date_text,year,sort_date,place_id,address,description) VALUES('person',?,?,?,?,?,?,?,?)");
$ins->execute([1,$t('BIRT'),'1862',1862,'1862',1,'','']); $ins->execute([1,$t('DEAT'),'1930',1930,'1930',3,'','']);
$ins->execute([2,$t('BIRT'),'1880',1880,'1880',2,'','']); $ins->execute([2,$t('DEAT'),'1902',1902,'1902',2,'','']);
$ins->execute([3,$t('BIRT'),'1820',1820,'1820',4,'','']); $ins->execute([3,$t('DEAT'),'1850',1850,'1850',4,'rue de la Barrière','']);
$pdo->prepare("INSERT INTO notes(entity_type,entity_id,title,body) VALUES('person',1,'Souvenirs','<p>Il racontait la guerre de 1870.</p>')")->execute();
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
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_APP?.defaultPersonBlocks, null, {timeout: 30000});
        // index.php ne charge pas encore heritage-histoire-autour.js : on l'ajoute (comme le feront les balises)
        if (!(await p.evaluate(() => !!window.LCNDA_EXT?.histoireAutour))) { await p.addStyleTag({url: base + 'assets/css/histoire-autour.css'}); await p.addScriptTag({url: base + 'assets/js/heritage-histoire-autour.js'}); }
        await p.waitForFunction(() => !!window.LCNDA_EXT?.histoireAutour);
        const api = (x, q = {}) => p.evaluate(([y, z]) => window.LCNDA_APP.api(y, z).catch(e => ({error: e.message})), [x, q]);

        await t('serveur : ha_life donne les lieux placés, les années, le métier et les notes (sans balises)', async () => {
            const d = await api('ha_life', {id: 1});
            assert.strictEqual(d.ok, true, JSON.stringify(d)); assert.strictEqual(d.person.birth, 1862); assert.strictEqual(d.person.death, 1930);
            assert.deepStrictEqual(d.places.map(x => x.name).sort(), ['Gorze', 'Saintes']);
            assert.ok(d.places.every(x => typeof x.lat === 'number')); assert.deepStrictEqual(d.jobs.map(j => j.text), ['cultivateur']);
            assert.match(d.text, /Il racontait la guerre de 1870\./); assert.ok(!/<p>/.test(d.text));
            assert.match((await api('ha_life', {id: 999})).error || '', /introuvable/i);
        });

        await t('fiche : « 🧭 Histoire autour » dit la bataille la plus proche et son âge, Mars-la-Tour (8 ans) dans « ▸ plus » ; caché pour Jean DURAND (rien à dire)', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.currentPersonId = 1; A.setModule('personnes'); });
            await p.waitForSelector('[data-ha-person="1"] .ha-row', {timeout: 30000});
            const txt = await p.textContent('[data-ha-person="1"]');
            assert.match(txt, /(Le|En) [^,]+, bataille [^.]+ à \d+(,\d)? km de Gorze\. Il avait \d+ ans\./); assert.match(txt, /Source : Wikidata/);
            assert.match(txt, /16 août 1870 : bataille de Mars-la-Tour, à 11 km de Gorze \(Pierre a 8 ans\)/);
            assert.strictEqual(await p.evaluate(() => document.querySelector('[data-ha-person="1"]').closest('section.card').hidden), false);
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.currentPersonId = 3; A.setModule('personnes'); });
            await p.waitForSelector('[data-ha-person="3"]', {state: 'attached', timeout: 20000}); await sleep(2500);
            assert.strictEqual(await p.evaluate(() => document.querySelector('[data-ha-person="3"]').closest('section.card').hidden), true);
        });

        await t('fiche : Marie LACOMBE à Saint-Pierre → « éruption du volcan Pelee … 28 000 morts », règle dite', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.currentPersonId = 2; A.setModule('personnes'); });
            await p.waitForSelector('[data-ha-person="2"] .ha-row', {timeout: 30000});
            const txt = await p.textContent('[data-ha-person="2"]');
            assert.match(txt, /Le 8 mai 1902, éruption du volcan Pelee \(.*Martinique\) : 28\s000 morts/); assert.match(txt, /NOAA/); assert.match(txt, /Elle avait 22 ans/);
        });

        await t('fiche d’un village : la voie romaine de Saintes, une phrase puis « ▸ plus »', async () => {
            const html = await p.evaluate(async () => { const h = document.createElement('div'); document.body.appendChild(h); await window.LCNDA_EXT.histoireAutour.placeInto(h, {id: 3, name: 'Saintes', lat: 45.7464, lon: -0.6333}); const x = h.innerHTML; h.remove(); return x; });
            assert.match(html, /voie romaine/i); assert.match(html, /Mediolanum Santonum/); assert.match(html, /▸ plus/); assert.match(html, /Itiner-e/);
            const none = await p.evaluate(async () => { const h = document.createElement('div'); document.body.appendChild(h); const n = await window.LCNDA_EXT.histoireAutour.placeInto(h, {id: 0, name: 'En mer', lat: 46.0, lon: -6.0}); const r = [n, h.innerHTML]; h.remove(); return r; });
            assert.deepStrictEqual(none, [0, ''], 'rien à dire : rien');
        });

        await t('registres : listes (filtres, carte, lignes et cercles), monographie, dataSources', async () => {
            const r = await p.evaluate(async () => {
                const E = window.LCNDA_EXT, L = E.dataLists.filter(d => d.id.startsWith('ha_'));
                const ph = L.find(d => d.id === 'ha_phares'), rows = await ph.load(), withR = rows.find(x => x.rangeKm);
                const vo = L.find(d => d.id === 'ha_voies_romaines'), vr = (await vo.load())[0];
                const host = document.createElement('div'); document.body.appendChild(host);
                await E.dataSources.find(d => d.id === 'ha_voies').run({place: {name: 'Saintes', latitude: 45.7464, longitude: -0.6333}}, host);
                const ds = host.textContent; host.remove();
                const mono = E.monographSections.find(s => s.id === 'ha_batailles'), mh = document.createElement('div'); document.body.appendChild(mh);
                const ok = await mono.render({id: 1, name: 'Gorze', latitude: 49.0517, longitude: 6.0003}, mh, {}); const mt = mh.textContent; mh.remove();
                return {ids: L.map(d => d.id), circle: ph.geoCircle(withR), geo: ph.geo(withR), line: vo.geoLine(vr).length, mono: [ok, mt], ds, src: L.every(d => d.source && d.fields.length && d.load),
                    secs: E.monographSections.filter(s => s.id.startsWith('ha_')).map(s => s.id), srcs: E.dataSources.filter(s => s.id.startsWith('ha_')).length};
            });
            ['ha_batailles', 'ha_voies_romaines', 'ha_compostelle', 'ha_institutions', 'ha_catastrophes', 'ha_navires', 'ha_phares'].forEach(id => assert.ok(r.ids.includes(id), id));
            assert.ok(r.src); assert.ok(r.circle.km > 0 && Number.isFinite(r.circle.lat)); assert.ok(r.line >= 2);
            assert.strictEqual(r.mono[0], true); assert.match(r.mono[1], /Mars-la-Tour/);
            assert.match(r.ds, /Mediolanum Santonum/); assert.ok(r.secs.length >= 6 && r.srcs >= 9);
        });

        await t('Réglages → 🧭 Histoire autour : éteindre « Batailles » le retire de la fiche (↶ le remet)', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'histoire_autour'; A.setModule('maintenance'); });
            await p.waitForSelector('[data-ha-settings] table tbody tr', {timeout: 20000});
            assert.match(await p.textContent('[data-ha-settings] table'), /CC BY 4\.0/);
            await p.click('[data-ha-tg="batailles"] input');
            assert.strictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-histoire-autour')).batailles), false);
            const n = await p.evaluate(async () => { const h = document.createElement('div'); document.body.appendChild(h); const n = await window.LCNDA_EXT.histoireAutour.personInto(h, 1); h.remove(); return n; });
            assert.strictEqual(n, 0, 'plus de bataille');
            await p.click('button:has-text("↶ Annuler")', {timeout: 5000});
            await sleep(300);
            assert.notStrictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-histoire-autour')).batailles), false);
        });

        await t('aucune erreur JavaScript', async () => { assert.deepStrictEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill();
        try { fs.rmSync(tmp, {recursive: true, force: true}); } catch (_) {}
    }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})();
